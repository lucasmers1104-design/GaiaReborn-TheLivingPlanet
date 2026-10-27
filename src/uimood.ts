/* =============================================================================
 * Gaia Reborn — what the living interface reads off the planet
 * -----------------------------------------------------------------------------
 * The interface lives with the planet: Gaia sleeps on her bare rock until the
 * first life, vines climb the rail as plants evolve, flowers open with the
 * flowering plants, leaves fade in a crisis and come back with the recovery.
 * LivingMood turns the mirrored world (worker mode included) into that state,
 * about ten times a second from the app's UI update. Everything is derived
 * from saved data (developed steps, chronicle, history, comet fate), so
 * nothing new is saved and a loaded game looks right at once.
 * Node-safe: no DOM.
 * ========================================================================== */

namespace SE {
  export type GaiaEmotion = 'sleeping' | 'waking' | 'idle' | 'joyful' | 'worried' | 'sad' | 'hopeful';
  export type GaiaTrouble = 'hot' | 'cold' | 'life' | 'diversity' | 'clean';

  export interface LivingState {
    /** Life has arisen on this planet: sticky until a new planet or a load. */
    readonly awake: boolean;
    /** Vine growth target, 0..1: share of plant groups developed and land plant cover. Above 0 once the first plants exist. */
    readonly greenery: number;
    /** Flowers, 0..1: 0 before the flowering plants, then with their spread and their pollinators. */
    readonly bloom: number;
    /** Freshness of the leaves, 0..1: 1 healthy; low in climate extremes, foul air, die-offs and the comet winter. */
    readonly vitality: number;
    /** Gaia's emotion with hysteresis. 'waking' is an edge: it stands for one update after life first appears. */
    readonly emotion: GaiaEmotion;
    /** world.gaiaMood, 0..1, and its level 0..5 (the Gaia window's six moods). */
    readonly mood: number;
    readonly moodLevel: number;
    /** What weighs on her most, if anything. */
    readonly trouble: GaiaTrouble | null;
    /** Evolution steps developed so far; a rise means a new step arose. */
    readonly steps: number;
    /** Planet identity (new planet or load): growth snaps instead of animating when it changes. */
    readonly generation: number;
  }

  /** The Gaia window's mood thresholds (gaia.ts): six levels, Entsetzt … Glückselig. */
  const MOOD_STEPS = [0.18, 0.34, 0.5, 0.68, 0.85];
  /** History samples (8 ticks each) the die-off and recovery checks look back over. */
  const LOSS_LOOK = 24;
  const RECOVER_LOOK = 64;
  /** Land plant cover that counts as fully green; a developed Earth reaches about 0.5. */
  const COVER_FULL = 0.5;
  /** Share of land under flowering plants (broadleaf and grasses counting part) that counts as full bloom. */
  const BLOOM_FULL = 0.25;
  /** An emotion is kept at least this long (ms), so a flickering group or a noisy mood never makes her twitch. */
  const DWELL_MS = 3000;
  /** After a crisis has passed she stays hopeful this long (ms), unless a new one comes. */
  const HOPE_MS = 20000;
  /** History series (panels.ts HistoryRecorder): plant cover, inhabited area, living groups. */
  const H_VEG = 4;
  const H_LIFE = 5;
  const H_GROUPS = 7;

  const ramp = (x: number, a: number, b: number): number => smoothstep(clamp((x - a) / (b - a), 0, 1));

  function span(live: number, d: readonly number[], n: number): [number, number] {
    let lo = live;
    let hi = live;
    for (let i = Math.max(0, d.length - n); i < d.length; i++) {
      lo = Math.min(lo, d[i]);
      hi = Math.max(hi, d[i]);
    }
    return [lo, hi];
  }
  /** Share of its recent peak a measure still holds (1 when there was no peak). */
  const kept = (live: number, d: readonly number[]): number => {
    const hi = span(live, d, LOSS_LOOK)[1];
    return hi > 1e-6 ? live / hi : 1;
  };
  /** Climbing back out of a dip: well below its recent peak once, rising again, not back yet. */
  const dip = (live: number, d: readonly number[]): boolean => {
    const [lo, hi] = span(live, d, RECOVER_LOOK);
    return hi > 1e-6 && lo < 0.75 * hi && live > 1.1 * lo && live < 0.95 * hi;
  };
  const series = (h: HistoryRecorder, k: number): readonly number[] => h.series[k]?.data ?? [];

  export const SLEEPING_STATE: LivingState = {
    awake: false, greenery: 0, bloom: 0, vitality: 1, emotion: 'sleeping', mood: 0.5, moodLevel: 2,
    trouble: null, steps: 0, generation: -1,
  };

  /** The look of Gaia's rock and the stone beam beside it: 0 bare, 1 first lichen, 2 mossy, 3 lush. */
  export const groundLook = (s: LivingState): number => (!s.awake ? 0 : s.greenery > 0.7 ? 3 : s.greenery > 0.35 ? 2 : 1);

  export class LivingMood {
    /** The latest state, for decorative layers that have no line to the app (window corners). */
    static current: LivingState = SLEEPING_STATE;

    private state: LivingState = SLEEPING_STATE;
    private sig = '';
    private shown: GaiaEmotion = 'sleeping';
    private since = 0;
    private crisisEnded = -Infinity;

    /** Recomputes when the planet moved on; `now` is the page clock (ms). */
    update(w: WorldState, history: HistoryRecorder, now: number): LivingState {
      const sig = `${w.ticks}|${w.revision}|${w.hazards.generation}|${w.evo.developed.size}`;
      if (sig === this.sig && this.state.emotion !== 'waking') return this.state;
      this.sig = sig;

      const f = w.gaiaFactors();
      const land = Math.max(0.01, 1 - w.oceanFraction);
      const awake = w.timeScale !== TimeScale.Geologic || w.lifeCover > 0;

      let plants = 0;
      let plantsDeveloped = 0;
      for (const n of EVO_NODES) {
        if (n.kingdom !== 'plant') continue;
        plants++;
        if (w.evo.developed.has(n.id)) plantsDeveloped++;
      }
      const reach = plants > 0 ? plantsDeveloped / plants : 0;
      const cover = clamp(w.vegetationCoverage / land / COVER_FULL, 0, 1);
      const greenery = awake && plantsDeveloped > 0 ? clamp(0.55 * reach + 0.45 * cover, 0.02, 1) : 0;

      const veg = series(history, H_VEG);
      const life = series(history, H_LIFE);
      const age = w.dinoEra.struck >= 0 ? w.ticks - w.dinoEra.struck : -1;
      const winter = age >= 0 && age < COMET_ICE_GROW + COMET_ICE_HOLD;
      const thaw = age >= COMET_ICE_GROW + COMET_ICE_HOLD && cometIceShare(w) > 0;
      const loss = Math.min(kept(w.vegetationCoverage, veg), kept(w.lifeCover, life));
      const vitality = !awake ? 1 : Math.min(
        ramp(f.climate, 0.3, 0.7),
        ramp(f.clean, 0.15, 0.55),
        ramp(loss, 0.45, 0.9),
        1 - 0.8 * cometIceShare(w) / COMET_ICE_SHARE,
      );

      const angio = w.floraCounts[Flora.Flowering] + 0.5 * w.floraCounts[Flora.Broadleaf] + 0.25 * w.floraCounts[Flora.Grasses];
      const bloom = !w.evo.developed.has('flowering') ? 0
        : clamp(0.15 + 0.85 * clamp(angio / (TILE_COUNT * land) / BLOOM_FULL, 0, 1), 0, 1)
          * (w.lifeCounts[Life.Pollinator] > 0 ? 1 : 0.7) * (0.4 + 0.6 * vitality);

      let dieOff = false;
      const ch = w.evo.chronicle;
      for (let i = Math.max(0, ch.length - 12); i < ch.length; i++) {
        const e = ch[i];
        if (w.ticks - e.tick > 32) continue;
        if (e.key === 'comet:impact' || (e.kind === 'extinction' && !e.rip && !!e.nodeId && w.evo.extinct.has(e.nodeId))) dieOff = true;
      }
      const groups = livingGroups(w);
      const groupsLost = span(groups, series(history, H_GROUPS), LOSS_LOOK)[1] - groups;
      const shock = winter || dieOff || loss < 0.6 || groupsLost >= 3;
      const danger = w.dinoEra.fate === 'deciding' || w.dinoEra.fate === 'impactPending'
        || f.climate < 0.5 || f.clean < 0.4 || w.hazards.list.length >= 3;
      const recovering = thaw || dip(w.vegetationCoverage, veg) || dip(w.lifeCover, life);

      const mood = w.gaiaMood;
      const generation = w.hazards.generation;
      const fresh = generation !== this.state.generation;
      if (fresh) {
        this.crisisEnded = -Infinity;
        this.since = -Infinity;
      }
      let emotion: GaiaEmotion;
      if (!awake) emotion = 'sleeping';
      else if (fresh) emotion = this.pick(shock, danger, recovering, mood, 'idle', now);
      else if (this.shown === 'sleeping') emotion = 'waking';
      else emotion = this.pick(shock, danger, recovering, mood, this.shown, now);
      if (fresh || emotion !== this.shown) {
        if (!fresh && (this.shown === 'sad' || this.shown === 'worried') && emotion !== 'sad' && emotion !== 'worried') this.crisisEnded = now;
        this.shown = emotion;
        this.since = now;
      }

      this.state = {
        awake, greenery, bloom, vitality, emotion, mood,
        moodLevel: MOOD_STEPS.filter((t) => mood > t).length,
        trouble: awake ? worstTrouble(f, w.globalTemp) : null,
        steps: w.evo.developed.size, generation,
      };
      LivingMood.current = this.state;
      return this.state;
    }

    /** The emotion the planet calls for, kept for DWELL_MS once shown. */
    private pick(shock: boolean, danger: boolean, recovering: boolean, mood: number, prev: GaiaEmotion, now: number): GaiaEmotion {
      let next: GaiaEmotion;
      if (shock || mood < (prev === 'sad' ? 0.36 : 0.3)) next = 'sad';
      else if (danger || mood < (prev === 'worried' ? 0.52 : 0.45)) next = 'worried';
      else if (recovering || prev === 'sad' || prev === 'worried' || now - this.crisisEnded < HOPE_MS) next = 'hopeful';
      else next = mood > (prev === 'joyful' ? 0.74 : 0.8) ? 'joyful' : 'idle';
      if (next !== prev && prev !== 'waking' && prev !== 'sleeping' && now - this.since < DWELL_MS) return prev;
      return next;
    }
  }

  function worstTrouble(f: { climate: number; life: number; diversity: number; clean: number }, temp: number): GaiaTrouble | null {
    let worst: GaiaTrouble | null = null;
    let low = 0.5;
    const check = (v: number, t: GaiaTrouble): void => { if (v < low) { low = v; worst = t; } };
    check(f.climate, temp > 15 ? 'hot' : 'cold');
    check(f.life, 'life');
    check(f.diversity, 'diversity');
    check(f.clean, 'clean');
    return worst;
  }
}
