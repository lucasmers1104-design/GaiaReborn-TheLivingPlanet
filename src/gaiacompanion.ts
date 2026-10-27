/* =============================================================================
 * Gaia Reborn — Gaia in the lower left corner
 * -----------------------------------------------------------------------------
 * A small nature goddess on her rock who lives with the planet (uimood.ts).
 * She sleeps on the bare stone until the first life, wakes slowly, and from
 * then on watches the map: idle on her elbows, kicking her feet in joy and
 * after every new evolution step, chin in her hands when worried, slumped
 * when the planet suffers, looking up when it recovers. Blinks, glances,
 * tears and sparkles come by chance; she says a short line at the planet's
 * key moments and when poked (companionspeech.ts); a double click (or Enter)
 * opens the Gaia window. For the evolution magic (gaiamagic.ts) she lifts a
 * glowing orb, quiet until it is over.
 * Pixel art from the UI atlas (uiart.ts) on one canvas, redrawn only when the
 * composed frame changes. Poses change only where a loop wraps or a one-shot
 * ends, so she never jumps.
 * ========================================================================== */

namespace SE {
  export interface CompanionHooks {
    /** Opens (or brings forward) the Gaia window, the planet's face. */
    openGaiaWindow(): void;
  }

  /** What the app knows each frame. */
  export interface CompanionFrame {
    /** "Effekte reduzieren" or prefers-reduced-motion: no bobbing, no particles in flight. */
    readonly still: boolean;
    /** A showcase or milestone card has the screen: a pending wake-up waits for it to close. */
    readonly held: boolean;
    /** The game is paused (speed 0). */
    readonly paused: boolean;
  }

  /** Overlay frames as tools/uiart/catalog.js numbers them. */
  const EYE = { right: 0, front: 1, up: 2, half: 3, shut: 4, happy: 5, sadShut: 6, wide: 7, teary: 8, down: 9 } as const;
  const BROW = { calm: 0, raised: 1, worried: 2, sad: 3 } as const;
  const MOUTH = { calm: 0, smile: 1, laugh: 2, oh: 3, pout: 4, shaky: 5, asleep: 6, sad: 7 } as const;
  /** Open eyes a blink closes; where an idle glance goes (towards the player twice as often). */
  const OPEN_EYES: readonly number[] = [EYE.right, EYE.front, EYE.up, EYE.wide, EYE.down];
  const GLANCES: readonly number[] = [EYE.front, EYE.front, EYE.up, EYE.down];

  type Feeling = 'idle' | 'joyful' | 'worried' | 'sad' | 'hopeful';
  const FEELING: Readonly<Record<GaiaEmotion, Feeling>> = {
    sleeping: 'idle', waking: 'idle', idle: 'idle', joyful: 'joyful', worried: 'worried', sad: 'sad', hopeful: 'hopeful',
  };
  const POSE: Readonly<Record<Feeling, string>> = {
    idle: 'gaia_prone', joyful: 'gaia_kick', worried: 'gaia_chin', sad: 'gaia_slump', hopeful: 'gaia_lookup',
  };
  interface Face { readonly eyes: number; readonly brows: number; readonly mouth: number; readonly blush: boolean }
  const FACES: Readonly<Record<Feeling, Face>> = {
    idle: { eyes: EYE.right, brows: BROW.calm, mouth: MOUTH.calm, blush: false },
    joyful: { eyes: EYE.happy, brows: BROW.calm, mouth: MOUTH.laugh, blush: true },
    worried: { eyes: EYE.right, brows: BROW.worried, mouth: MOUTH.shaky, blush: false },
    sad: { eyes: EYE.sadShut, brows: BROW.sad, mouth: MOUTH.sad, blush: false },
    hopeful: { eyes: EYE.up, brows: BROW.raised, mouth: MOUTH.smile, blush: false },
  };
  const MAGIC_FACE: Face = { eyes: EYE.up, brows: BROW.raised, mouth: MOUTH.smile, blush: false };

  type Span = readonly [number, number];
  const within = (s: Span): number => s[0] + Math.random() * (s[1] - s[0]);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

  /** Her root's stacking: below the rail; during the magic just below the magic layer (above the windows). */
  const Z_REST = 48;
  const Z_MAGIC = 589;
  /** A blink (ms; the double blink's second follows after one more) and the gaps between blinks. */
  const BLINK_MS = 120;
  const BLINK_GAP: Span = [3000, 6000];
  const DOUBLE_BLINK = 0.3;
  /** She stirs in her sleep this often; dozes off when the game has been paused this long, untouched. */
  const STIR_GAP: Span = [8000, 15000];
  const DOZE_MS = 8000;
  const DOZE_HALF_MS = 1500;
  /** A poke squeezes her eyes, then she reacts; a run of pokes this close until she has had enough. */
  const POKE_SQUEEZE_MS = 220;
  const POKE_MS = 900;
  const POKE_CHAIN_MS = 2500;
  const POKES_TOO_MANY = 5;
  const POUT_MS = 2600;
  /** A new evolution step makes her kick this long, once the magic and any card are over; the wait lets the magic start first. */
  const JOY_MS: Span = [6000, 8000];
  const JOY_WAIT_MS = 1200;
  /** Her hair's top (two sprigs) in art px above the top of her eyes; the head moves with the face point in every pose. */
  const HAIR_TOP = 12;
  /** If the orb has not shown by then, the magic goes on without it. */
  const READY_MAX_MS = 6000;
  /** Particles move in steps of this (10 fps), like the sprites. */
  const STEP_MS = 100;
  const ZZZ_GAP: Span = [1700, 2500];
  const JOY_GAP: Span = [350, 700];
  const GLAD_GAP: Span = [1500, 3000];
  const HOPE_GAP: Span = [4000, 7000];
  const SWEAT_GAP: Span = [3000, 6000];
  const HOT_GAP: Span = [2000, 3500];
  const HEART_SHARE = 0.35;

  /** Something that comes now and then: quiet for `gap` ms, then on for `hold` ms. */
  class Recur {
    private start = Infinity;
    private end = -Infinity;
    private on = false;
    /** The spell began at the last active() call. */
    began = false;
    constructor(private readonly gap: Span, private readonly hold: Span) {}

    active(now: number): boolean {
      if (now >= this.end) {
        this.start = now + within(this.gap);
        this.end = this.start + within(this.hold);
      }
      const on = now >= this.start;
      this.began = on && !this.on;
      this.on = on;
      return on;
    }

    since(now: number): number {
      return now - this.start;
    }
  }

  /** A body sprite playing since `at`: looping, or once from frame `from` to its last. */
  interface Clip { readonly id: string; readonly at: number; readonly once: boolean; readonly from: number }
  /** A particle sprite played once from (x, y), drifting (vx, vy) art px per second. */
  interface Mote { readonly id: string; readonly x: number; readonly y: number; readonly vx: number; readonly vy: number; readonly at: number }

  export class GaiaCompanion {
    private readonly art = UiArt.shared();
    private readonly root: HTMLElement;
    private readonly scene = new PixelCanvas('companion-scene', 0);
    private readonly btn: HTMLButtonElement;
    private readonly speech = new CompanionSpeech();

    private state: LivingState = SLEEPING_STATE;
    private generation = NaN;
    private feeling: Feeling = 'idle';
    private clip: Clip = { id: 'gaia_sleep', at: 0, once: false, from: 0 };
    private cycle = 0;
    /** In the sleep loop or its stir; false from the wake on. */
    private asleep = true;
    private wakePending = false;
    private stirAt = 0;
    private magic: 'off' | 'on' | 'down' = 'off';
    private ready: (() => void) | null = null;
    private holdAt = 0;
    /** When the steps rose (−1: no joy due); the burst's end. */
    private joyAt = -1;
    private joyUntil = -Infinity;
    private still = false;
    private held = false;
    private pausedAt = -1;
    private pokedAt = -Infinity;
    private pokes = 0;
    private readonly blink = new Recur(BLINK_GAP, [3 * BLINK_MS, 3 * BLINK_MS]);
    private twice = false;
    private readonly glance = new Recur([4000, 9000], [900, 2200]);
    private gaze: number = EYE.right;
    private readonly smile = new Recur([5000, 12000], [1500, 3500]);
    private readonly teary = new Recur([2000, 4000], [2000, 3200]);
    private readonly motes: Mote[] = [];
    private moteAt = 0;
    private label = '';
    private key = '';
    /** Her corner stands right of the rail (uiScale().beside). */
    private beside = false;
    /** The last frame's time: the one clock of every timer here (render's `now`). */
    private t = 0;

    constructor(stage: HTMLElement, private readonly hooks: CompanionHooks) {
      // Layout inline: with an old stylesheet nothing here may move, grow or take the map's clicks (css/companion.css decorates).
      this.root = make('div', 'companion');
      Object.assign(this.root.style, {
        position: 'absolute', left: '0px', bottom: '0px', width: '0px', height: '0px', zIndex: String(Z_REST), pointerEvents: 'none',
      });
      this.btn = make('button', 'companion-btn');
      this.btn.type = 'button';
      Object.assign(this.btn.style, {
        position: 'absolute', zIndex: '1', margin: '0', padding: '0', border: '0', background: 'transparent', pointerEvents: 'auto', cursor: 'pointer',
      });
      this.root.append(this.scene.canvas, this.btn);
      // The bubble rises into the tool card's bottom row, so it lives in the stage above the dock, not in her root below it.
      stage.append(this.root, this.speech.el);
      // The second click of a double click opens her window instead of poking again.
      this.btn.addEventListener('click', (e) => { if (e.detail < 2) this.poke(this.t); });
      this.btn.addEventListener('dblclick', () => this.hooks.openGaiaWindow());
      this.btn.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        this.hooks.openGaiaWindow();
      });
      this.setLabel();
    }

    /** The living state, about ten times a second. */
    update(s: LivingState): void {
      if (s === this.state) return;
      const now = this.t;
      const prev = this.state;
      const feeling = FEELING[s.emotion];
      this.state = s;
      if (s.generation !== this.generation) {
        // A new planet or a load: shown as it is, never animated.
        this.generation = s.generation;
        this.feeling = feeling;
        this.asleep = !s.awake && this.magic !== 'on';
        this.wakePending = false;
        this.joyAt = -1;
        this.joyUntil = -Infinity;
        this.stirAt = now + within(STIR_GAP);
        this.motes.length = 0;
        this.speech.reset(now);
        if (this.magic === 'down') this.endMagic();
        this.play(this.magic === 'on' ? 'gaia_magic_hold' : this.asleep ? 'gaia_sleep' : POSE[feeling], now);
        this.setLabel();
        return;
      }
      if (s.awake && this.asleep) this.wakePending = true;
      // A step the player develops starts the magic between frames: she is awake before the first life arrives here.
      else if (s.awake && !prev.awake) this.speech.say('woke', now);
      if (s.steps > prev.steps) this.joyAt = now;
      if (!this.asleep) {
        if (prev.greenery <= 0 && s.greenery > 0) this.speech.say('green', now);
        else if (feeling !== this.feeling) this.speech.react(this.feeling, feeling, s.trouble, now);
      }
      this.feeling = feeling;
      this.setLabel();
    }

    /** Call every frame; draws only when its art frame changes. */
    render(now: number, f: CompanionFrame): void {
      this.t = now;
      this.still = f.still;
      this.held = f.held;
      this.speech.held = f.held;
      if (!f.paused) this.pausedAt = -1;
      else if (this.pausedAt < 0) this.pausedAt = now;
      const scale = uiScale();
      // A height change alone can move her beside the rail at the same scale.
      const resized = this.scene.size(UI_SCENE.w, UI_SCENE.h, scale) || scale.beside !== this.beside;
      if (resized) {
        this.beside = scale.beside;
        this.layout(scale.u);
      }
      if (this.joyAt >= 0 && this.magic === 'off' && !this.asleep && !this.held && now - this.joyAt > JOY_WAIT_MS) {
        if (this.feeling !== 'sad') this.joyUntil = now + within(JOY_MS);
        this.joyAt = -1;
      }
      this.advance(now);
      this.speech.render(now);
      const ops = this.compose(now);
      const key = `${this.art.version}|${ops.join()}`;
      if (!resized && key === this.key) return;
      this.key = key;
      this.scene.clear();
      for (let i = 0; i < ops.length; i += 4) {
        this.art.draw(this.scene.ctx, ops[i] as string, ops[i + 1] as number, ops[i + 2] as number, ops[i + 3] as number);
      }
    }

    /** Lift the hand with the glowing orb (waking first if asleep); `ready` runs once the orb shows, at once when it cannot. */
    startMagic(ready: () => void): void {
      this.fireReady();
      this.ready = ready;
      this.magic = 'on';
      this.root.style.zIndex = String(Z_MAGIC);
      this.speech.setQuiet(true, this.t);
      if (this.still || !this.art.ready) {
        if (this.asleep && this.state.awake) this.speech.say('woke', this.t);
        this.asleep = false;
        this.wakePending = false;
        this.play('gaia_magic_hold', this.t);
        return;
      }
      if (this.clip.id === 'gaia_magic_hold') { this.fireReady(); return; }
      window.setTimeout(() => { if (this.ready === ready) this.fireReady(); }, READY_MAX_MS);
    }

    /** Lower the hand again. */
    stopMagic(): void {
      if (this.magic !== 'on') return;
      this.ready = null;
      const { id } = this.clip;
      const showing = id === 'gaia_magic_up' || id === 'gaia_magic_hold';
      if (showing && !this.still) { this.magic = 'down'; return; }
      this.endMagic();
      if (showing) this.play(this.moodPose(this.t), this.t);
    }

    /** Client-px centre of the orb while it shows, else null. */
    orbClient(): { x: number; y: number } | null {
      if (this.clip.id !== 'gaia_magic_hold') return null;
      const hand = this.art.point('gaia_magic_hold', 'hand');
      const r = this.scene.canvas.getBoundingClientRect();
      if (!hand || r.width <= 0) return null;
      const [bx, by] = this.bed();
      const k = r.width / UI_SCENE.w;
      return { x: r.left + (bx + hand[0] + 0.5) * k, y: r.top + (by + hand[1] + 0.5) * k };
    }

    /* ------------------------------------------------------------ poses -- */

    private advance(now: number): void {
      const c = this.clip;
      const sp = this.art.sprite(c.id);
      const k = sp && sp.fps > 0 ? Math.max(0, Math.floor(((now - c.at) / 1000) * sp.fps)) : 0;
      // A call to wake does not wait for the sleep loop to wrap: the first-life moment starts at once.
      let turn = !sp || this.still || this.waking(now);
      if (sp && c.once) turn = turn || k >= sp.frames.length - c.from;
      else if (sp) {
        const cycle = Math.floor(k / sp.loop);
        if (cycle !== this.cycle) { this.cycle = cycle; turn = true; }
      }
      if (turn) this.turn(now);
    }

    /** Where a loop wraps or a one-shot ends (every frame when still): what she does next. */
    private turn(now: number): void {
      const { id, once } = this.clip;
      const still = this.still;
      if (this.asleep) {
        if (this.waking(now)) {
          this.asleep = false;
          this.wakePending = false;
          if (this.state.awake) this.speech.say('woke', now, now - this.pokedAt < POKE_CHAIN_MS);
          if (still) this.play(this.magic === 'on' ? 'gaia_magic_hold' : this.moodPose(now), now);
          else this.play('gaia_wake', now, true);
        } else if (once) this.play('gaia_sleep', now);
        else if (!still && now >= this.stirAt) {
          this.stirAt = now + within(STIR_GAP);
          this.play('gaia_sleep', now, true, this.art.sprite('gaia_sleep')?.loop ?? 0);
        }
        return;
      }
      if (this.magic === 'on') {
        if (id === 'gaia_magic_hold') return;
        if (id === 'gaia_magic_up' || still) this.play('gaia_magic_hold', now);
        else this.play('gaia_magic_up', now, true);
        return;
      }
      if (this.magic === 'down') {
        if (!still && (id === 'gaia_magic_up' || id === 'gaia_magic_hold')) { this.play('gaia_magic_down', now, true); return; }
        this.endMagic();
      }
      const want = this.moodPose(now);
      if (id !== want || once) this.play(want, now);
    }

    private play(id: string, now: number, once = false, from = 0): void {
      this.clip = { id, at: now, once, from };
      this.cycle = 0;
      if (id !== 'gaia_magic_hold') return;
      this.holdAt = now;
      this.fireReady();
    }

    /** Asleep, and the magic or the first life calls her; a pending wake-up waits for a card to close unless she is poked. */
    private waking(now: number): boolean {
      return this.asleep && (this.magic === 'on' || (this.wakePending && (!this.held || now - this.pokedAt < POKE_CHAIN_MS)));
    }

    private moodPose(now: number): string {
      if (now < this.joyUntil) return POSE.joyful;
      if (this.dozing(now)) return POSE.idle;
      return POSE[this.feeling];
    }

    private dozing(now: number): boolean {
      return !this.asleep && this.magic === 'off' && this.pausedAt >= 0 && this.feeling !== 'sad'
        && now >= this.joyUntil && now - Math.max(this.pausedAt, this.pokedAt) > DOZE_MS;
    }

    private fireReady(): void {
      const ready = this.ready;
      this.ready = null;
      ready?.();
    }

    private endMagic(): void {
      this.magic = 'off';
      this.root.style.zIndex = String(Z_REST);
      this.speech.setQuiet(false, this.t);
    }

    /* ---------------------------------------------------------- drawing -- */

    /** The rock's foot anchor sits at (rockFootX, h - 1); Gaia's foot anchor on its bed. */
    private bed(): [number, number] {
      const p = this.art.point('rock', 'bed') ?? [0, 0];
      return [UI_SCENE.rockFootX + p[0], UI_SCENE.h - 1 + p[1]];
    }

    /** Draw list: id, frame, x, y per sprite (anchor at x, y), back to front. */
    private compose(now: number): (string | number)[] {
      const s = this.state;
      const ops: (string | number)[] = ['rock', groundLook(s), UI_SCENE.rockFootX, UI_SCENE.h - 1];
      const [bx, by] = this.bed();
      const c = this.clip;
      ops.push(c.id, this.clipFrame(now), bx, by);
      const own = this.art.point(c.id, 'face');
      const fp = own ?? this.art.point(POSE.idle, 'face') ?? [0, 0];
      const fx = bx + fp[0];
      const fy = by + fp[1];
      if (own) {
        const face = this.face(now, fx, fy);
        if (face.blush) this.overlay(ops, 'gaia_blush', 0, fx, fy);
        this.overlay(ops, 'gaia_eyes', face.eyes, fx, fy);
        this.overlay(ops, 'gaia_brows', face.brows, fx, fy);
        this.overlay(ops, 'gaia_mouth', face.mouth, fx, fy);
      }
      const hand = c.id === 'gaia_magic_hold' ? this.art.point(c.id, 'hand') : null;
      if (hand) {
        const t = now - this.holdAt;
        ops.push('gaia_orb', this.spriteFrame('gaia_orb', this.still ? 0 : t, false), bx + hand[0], by + hand[1]);
        const flare = this.spriteFrame('gaia_orb_flare', t, true);
        if (!this.still && flare >= 0) ops.push('gaia_orb_flare', flare, bx + hand[0], by + hand[1]);
      }
      this.particles(ops, now, fx, fy);
      return ops;
    }

    private clipFrame(now: number): number {
      const c = this.clip;
      const sp = this.art.sprite(c.id);
      if (!sp || sp.fps <= 0 || this.still) return c.from;
      const k = Math.max(0, Math.floor(((now - c.at) / 1000) * sp.fps));
      return c.once ? Math.min(c.from + k, sp.frames.length - 1) : k % sp.loop;
    }

    /** Frame of a sprite t ms into its play: looping, or once (−1 after its end). */
    private spriteFrame(id: string, t: number, once: boolean): number {
      const sp = this.art.sprite(id);
      if (!sp || sp.fps <= 0) return 0;
      const k = Math.max(0, Math.floor((t / 1000) * sp.fps));
      return once ? (k < sp.frames.length ? k : -1) : k % sp.loop;
    }

    /** A face overlay: its top left at the face point plus its own `at`. */
    private overlay(ops: (string | number)[], id: string, f: number, fx: number, fy: number): void {
      const sp = this.art.sprite(id);
      const at = sp?.points.at ?? [0, 0];
      ops.push(id, f, fx + at[0] + (sp?.ax ?? 0), fy + at[1] + (sp?.ay ?? 0));
    }

    private face(now: number, fx: number, fy: number): Face {
      if (this.clip.id === 'gaia_magic_hold') return this.blinked(MAGIC_FACE, now);
      if (this.dozing(now)) {
        const t = now - Math.max(this.pausedAt, this.pokedAt) - DOZE_MS;
        return { eyes: t < DOZE_HALF_MS ? EYE.half : EYE.shut, brows: BROW.calm, mouth: MOUTH.asleep, blush: false };
      }
      const poke = now - this.pokedAt;
      const glad = this.glad(now);
      if (poke < POUT_MS && this.pokes >= POKES_TOO_MANY) return { eyes: EYE.front, brows: BROW.worried, mouth: MOUTH.pout, blush: false };
      if (poke < POKE_SQUEEZE_MS) return { eyes: EYE.shut, brows: BROW.raised, mouth: glad ? MOUTH.laugh : MOUTH.oh, blush: glad };
      if (poke < POKE_MS) {
        return glad ? { eyes: EYE.happy, brows: BROW.raised, mouth: MOUTH.laugh, blush: true } : { eyes: EYE.wide, brows: BROW.worried, mouth: MOUTH.oh, blush: false };
      }
      const feel = now < this.joyUntil ? 'joyful' : this.feeling;
      const base = FACES[feel];
      let { eyes, mouth } = base;
      if (feel === 'idle') {
        if (this.glance.active(now)) {
          if (this.glance.began) this.gaze = pick(GLANCES);
          eyes = this.gaze;
        }
        const content = this.state.moodLevel >= 4;
        mouth = this.smile.active(now) !== content ? MOUTH.smile : MOUTH.calm;
      } else if (feel === 'sad' && this.teary.active(now)) {
        eyes = EYE.teary;
        // The drop leaves where the wet eye (gaia_eyes 8) has its own.
        if (this.teary.began && !this.still) this.motes.push({ id: 'tear', x: fx + 2, y: fy + 4, vx: 0, vy: 12, at: now });
      }
      return this.blinked({ eyes, brows: base.brows, mouth, blush: base.blush }, now);
    }

    private blinked(face: Face, now: number): Face {
      if (!this.blink.active(now)) return face;
      if (this.blink.began) this.twice = Math.random() < DOUBLE_BLINK;
      const t = this.blink.since(now);
      if (t >= BLINK_MS && !(this.twice && t >= 2 * BLINK_MS)) return face;
      if (face.eyes === EYE.teary) return { ...face, eyes: EYE.sadShut };
      return OPEN_EYES.includes(face.eyes) ? { ...face, eyes: EYE.shut } : face;
    }

    /**
     * Spawns zzz, sparkles, hearts, sweat by mood and adds the living ones to the draw list (none in flight when still).
     * Spots from the top left of her eyes: a dozing zzz just over the back of her crown, hearts and sparkles above her
     * hair, sweat beside her brow.
     */
    private particles(ops: (string | number)[], now: number, fx: number, fy: number): void {
      const [bx, by] = this.bed();
      const zzz = this.asleep ? this.art.point('gaia_sleep', 'zzz') : null;
      const zx = zzz ? bx + zzz[0] : fx + 11;
      const zy = zzz ? by + zzz[1] : fy - HAIR_TOP - 3;
      const sleepy = this.asleep || this.dozing(now);
      if (this.still) {
        this.motes.length = 0;
        if (sleepy) ops.push('zzz', 1, zx, zy - 3);
        return;
      }
      if (now >= this.moteAt) {
        const joy = now < this.joyUntil;
        const add = (id: string, x: number, y: number, vx: number, vy: number): void => { this.motes.push({ id, x, y, vx, vy, at: now }); };
        const sparkle = (): void => add('sparkle', fx - 4 + Math.random() * 22, fy - HAIR_TOP - 5 + Math.random() * 4, 0, -2);
        let gap: Span = [800, 1200];
        if (sleepy) { add('zzz', zx, zy, 3, -7); gap = ZZZ_GAP; }
        else if (this.magic !== 'off' || this.clip.id === 'gaia_wake') { /* the magic brings its own light */ }
        else if (joy || this.feeling === 'joyful') {
          if (Math.random() < HEART_SHARE) add('heart', fx + 6 + (Math.random() - 0.5) * 8, fy - HAIR_TOP - 3, (Math.random() - 0.5) * 4, -8);
          else sparkle();
          gap = joy ? JOY_GAP : GLAD_GAP;
        } else if (this.feeling === 'worried') { add('sweat', fx + 13, fy - 2, 0, 6); gap = this.state.trouble === 'hot' ? HOT_GAP : SWEAT_GAP; }
        else if (this.feeling === 'hopeful') { sparkle(); gap = HOPE_GAP; }
        this.moteAt = now + within(gap);
      }
      let n = 0;
      for (const m of this.motes) {
        const t = now - m.at;
        const f = this.spriteFrame(m.id, t, true);
        if (f < 0) continue;
        this.motes[n++] = m;
        const s = (Math.floor(t / STEP_MS) * STEP_MS) / 1000;
        ops.push(m.id, f, Math.round(m.x + m.vx * s), Math.round(m.y + m.vy * s));
      }
      this.motes.length = n;
    }

    private layout(u: number): void {
      const px = (v: number): string => `${Math.round(v * u * 100) / 100}px`;
      const left = this.beside ? UI_RAIL.left + UI_RAIL.width : 0;
      Object.assign(this.root.style, { left: px(left), width: px(UI_SCENE.w), height: px(UI_SCENE.h) });
      this.scene.place({ left: 0, bottom: 0 });
      const [bx, by] = this.bed();
      // Her hair where it is highest (looking up). The bubble's tail ends there: one fixed spot, so it never jumps with a pose.
      // The button starts there: above that line lies only map in every pose.
      const fp = this.art.point(POSE.idle, 'face') ?? [0, 0];
      const high = Math.min(...Object.values(POSE).map((id) => this.art.point(id, 'face')?.[1] ?? fp[1]));
      const hair = by + high - HAIR_TOP;
      const sp = this.art.sprite(POSE.idle);
      if (sp) Object.assign(this.btn.style, { left: px(bx - sp.ax), top: px(hair), width: px(sp.w), height: px(by - sp.ay + sp.h - hair) });
      // The bubble sits in the stage, not in her root: placed from the stage's bottom left, plus her corner's offset.
      this.speech.place(u, left + bx + fp[0] - 6, UI_SCENE.h - hair);
    }

    /* ------------------------------------------------ pokes and moments -- */

    private poke(now: number): void {
      this.pokes = now - this.pokedAt < POKE_CHAIN_MS ? this.pokes + 1 : 1;
      const dozing = this.dozing(now);
      this.pokedAt = now;
      let key: CompanionLine;
      if (this.asleep) {
        this.stirAt = 0;
        if (this.wakePending) return;
        key = 'dormant';
      } else if (this.pokes >= POKES_TOO_MANY) key = 'annoyed';
      else if (dozing) key = 'dozing';
      else key = this.glad(now) ? 'poked' : 'pokedSad';
      this.speech.say(key, now, true);
    }

    /** Untroubled, or kicking for joy over a new step. */
    private glad(now: number): boolean {
      return now < this.joyUntil || (this.feeling !== 'sad' && this.feeling !== 'worried');
    }

    private setLabel(): void {
      const s = this.state;
      const how = this.asleep && !s.awake ? 'schläft' : `${GaiaPanel.moodLabel(s.mood)} (${Math.round(s.mood * 100)} %)`;
      const label = `Gaia – ${how}. Klicken: anstupsen · Doppelklick: Gaia-Fenster`;
      if (label === this.label) return;
      this.label = label;
      this.btn.title = label;
      this.btn.setAttribute('aria-label', label);
    }
  }
}
