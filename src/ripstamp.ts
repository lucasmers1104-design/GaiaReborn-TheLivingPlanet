/* =============================================================================
 * SimEarth 2.0 — the R.I.P. stamp
 * -----------------------------------------------------------------------------
 * The first time this player meets a sub-species or a tree step that is gone
 * for good, its picture comes up in colour in the middle of the screen, a
 * huge R.I.P. stamp falls onto it with a whoosh and lands with a thud, and the
 * colour drains away. Once per sub-species or step and player: what was
 * stamped is remembered in localStorage, across planets and sessions.
 * Stamps wait their turn in a queue and never take input or stop the game.
 * What counts as gone is what draws the R.I.P. marks: faunaStatus
 * (`is-gone`) and stepGoneReason (tree.ts).
 * ========================================================================== */

namespace SE {
  const RIP_SEEN_KEY = 'simearth2.ripSeen';
  /** Phases in ms: in, hold in colour, the stamp's fall, the impact's bounce, standing, out. */
  const RIP_IN_MS = 280;
  const RIP_HOLD_MS = 800;
  const RIP_FALL_MS = 300;
  const RIP_IMPACT_MS = 420;
  const RIP_STAND_MS = 1100;
  const RIP_OUT_MS = 400;
  /** While something else holds the screen, look again after this long. */
  const RIP_RECHECK_MS = 600;
  /** The thud in hit-sfx.mp3 starts after 54 ms of near silence (measured from its samples). */
  const HIT_ONSET_S = 0.05;
  const TILT = 'rotate(-7deg)';

  interface RipItem {
    readonly key: string;
    readonly name: string;
    readonly sub: string;
    readonly picture: () => HTMLElement;
  }

  export interface RipStampHooks {
    /** A film, milestone, dialog, the title or the intro holds the screen: wait. */
    held(): boolean;
    /** Calm effects: the stamp lands without its fall and shake. */
    reduced(): boolean;
  }

  function readSeen(): Set<string> {
    try {
      const raw = JSON.parse(window.localStorage.getItem(RIP_SEEN_KEY) ?? '[]') as unknown;
      return new Set(Array.isArray(raw) ? raw.filter((k): k is string => typeof k === 'string') : []);
    } catch {
      return new Set();
    }
  }

  /** Loaded once and replayed: a fresh element per play would start late, and the thud must land on the impact. */
  function sfxElement(name: string): HTMLAudioElement {
    const audio = new Audio(`assets/audio/sfx/${name}.mp3`);
    audio.preload = 'auto';
    return audio;
  }

  function playFrom(audio: HTMLAudioElement, name: string, offset: number): void {
    const volume = sfxVolume(name, 1);
    if (volume <= 0 || document.hidden) return;
    audio.volume = Math.min(1, volume);
    audio.currentTime = offset;
    audio.play().catch(() => undefined);
  }

  const wait = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

  export class RipStamps {
    private readonly seen = readSeen();
    private readonly queue: RipItem[] = [];
    private busy = false;
    private retry = 0;
    private readonly root: HTMLElement;
    private readonly card: HTMLElement;
    private readonly art: HTMLElement;
    private readonly band: HTMLElement;
    private readonly name: HTMLElement;
    private readonly sub: HTMLElement;
    private readonly whoosh = sfxElement('swipe');
    private readonly thud = sfxElement('hit-sfx');

    constructor(host: HTMLElement, private readonly hooks: RipStampHooks) {
      this.root = make('div', 'rip-stamp');
      this.root.hidden = true;
      this.root.setAttribute('role', 'status');
      this.root.setAttribute('aria-live', 'polite');
      this.card = make('div', 'rip-stamp-card');
      this.art = make('div', 'rip-stamp-art');
      this.band = make('span', 'rip-band rip-stamp-band', 'R.I.P.');
      this.band.setAttribute('aria-hidden', 'true');
      this.name = make('div', 'rip-stamp-name');
      this.sub = make('div', 'rip-stamp-sub');
      this.card.append(this.art, this.name, this.sub);
      this.root.appendChild(this.card);
      host.appendChild(this.root);
    }

    /** Queue what is gone for good on this planet and was never stamped for this player. */
    collect(world: WorldState, dex: FaunaDex, evo: EvolutionSystem): void {
      for (const n of EVO_NODES) {
        if (!world.evo.isDeveloped(n.id) || stepGoneReason(world, n, evo.presence(world, n) > 0) === '') continue;
        this.offer(`step:${n.id}`, n.name, n.kingdom === 'plant' ? 'Pflanzengruppe' : 'Tiergruppe', () => {
          const box = make('span', 'fauna-pic fauna-pic-lg');
          box.appendChild(pixelArt(evoIcon(n.id), 40, 'fauna-svg'));
          return box;
        });
      }
      for (let c = 1; c < LIFE_COUNT; c++) {
        for (let s = 0; s < SUBSPECIES_PER_CLASS; s++) {
          if (!faunaStatus(dex, c as Life, s, world)?.cls.includes('is-gone')) continue;
          this.offer(`stage:${LIFE[c as Life].id}:${s}`, subspeciesName(c as Life, s), `${LIFE[c as Life].name} · ${faunaStageLabel(s)}`,
            () => faunaPicture(c as Life, s, true, 'fauna-pic-lg'));
        }
      }
      this.pump();
    }

    /** A new or loaded planet: what is gone there is collected anew. The stamp on screen plays out. */
    clear(): void {
      this.queue.length = 0;
    }

    private offer(key: string, name: string, sub: string, picture: () => HTMLElement): void {
      if (this.seen.has(key) || this.queue.some((q) => q.key === key)) return;
      this.queue.push({ key, name, sub, picture });
    }

    private pump(): void {
      if (this.busy || this.retry || this.queue.length === 0) return;
      // A hidden tab would play it unseen.
      if (this.hooks.held() || document.hidden) {
        this.retry = window.setTimeout(() => { this.retry = 0; this.pump(); }, RIP_RECHECK_MS);
        return;
      }
      // A cancelled animation only ends the stamp early; `finally` moves the queue on.
      this.play(this.queue.shift() as RipItem).catch(() => undefined);
    }

    private async play(item: RipItem): Promise<void> {
      this.busy = true;
      this.seen.add(item.key);
      try {
        window.localStorage.setItem(RIP_SEEN_KEY, JSON.stringify(Array.from(this.seen)));
      } catch { /* storage blocked: it may come again next session */ }
      const pic = item.picture();
      this.art.replaceChildren(pic, this.band);
      this.name.textContent = item.name;
      this.sub.textContent = `${item.sub} · für immer ausgestorben`;
      this.band.style.opacity = '0';
      this.band.style.transform = `translateY(-50%) ${TILT}`;
      this.root.hidden = false;
      const calm = this.hooks.reduced();
      const colour = pic.querySelector('canvas') ?? pic;
      try {
        await this.card.animate([{ opacity: 0, transform: 'scale(0.86)' }, { opacity: 1, transform: 'scale(1)' }],
          { duration: RIP_IN_MS, easing: 'cubic-bezier(0.2, 1.3, 0.4, 1)' }).finished;
        await wait(RIP_HOLD_MS);
        if (!calm) {
          // The whoosh peaks 243 ms into its file, just before the stamp lands.
          playFrom(this.whoosh, 'swipe', 0);
          await this.band.animate([
            { opacity: 0, transform: `translateY(-50%) translateY(-120px) scale(6) rotate(-20deg)` },
            { opacity: 1, transform: `translateY(-50%) translateY(-60px) scale(3.4) rotate(-14deg)`, offset: 0.35 },
            { opacity: 1, transform: `translateY(-50%) ${TILT}` },
          ], { duration: RIP_FALL_MS, easing: 'cubic-bezier(0.55, 0, 0.9, 0.45)' }).finished;
        }
        playFrom(this.thud, 'hit-sfx', HIT_ONSET_S);
        this.band.style.opacity = '1';
        const impact = [
          this.band.animate([
            { transform: `translateY(-50%) ${TILT} scale(1, 1)` },
            { transform: `translateY(-50%) ${TILT} scale(1.16, 0.74)`, offset: 0.18 },
            { transform: `translateY(-50%) ${TILT} scale(0.93, 1.08)`, offset: 0.45 },
            { transform: `translateY(-50%) ${TILT} scale(1.03, 0.98)`, offset: 0.7 },
            { transform: `translateY(-50%) ${TILT} scale(1, 1)` },
          ], { duration: calm ? 1 : RIP_IMPACT_MS, easing: 'ease-out' }),
          colour.animate([{ filter: 'grayscale(0) brightness(1)' }, { filter: 'grayscale(1) brightness(0.8)' }],
            { duration: RIP_IMPACT_MS, easing: 'ease-out', fill: 'forwards' }),
        ];
        if (!calm) {
          impact.push(this.card.animate([
            { transform: 'translate(0, 0)' }, { transform: 'translate(-8px, 4px)' }, { transform: 'translate(7px, -3px)' },
            { transform: 'translate(-4px, 2px)' }, { transform: 'translate(2px, -1px)' }, { transform: 'translate(0, 0)' },
          ], { duration: 360, easing: 'ease-out' }));
        }
        await Promise.all(impact.map((a) => a.finished));
        await wait(RIP_STAND_MS);
        // The thud's tail fades with the card.
        const loud = this.thud.volume;
        const fade = this.card.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.96)' }],
          { duration: RIP_OUT_MS, easing: 'ease-in', fill: 'forwards' });
        const start = performance.now();
        const quieten = (): void => {
          const k = (performance.now() - start) / RIP_OUT_MS;
          this.thud.volume = loud * Math.max(0, 1 - k);
          if (k < 1) requestAnimationFrame(quieten);
          else this.thud.pause();
        };
        requestAnimationFrame(quieten);
        await fade.finished;
        fade.cancel();
      } finally {
        this.root.hidden = true;
        this.busy = false;
        this.pump();
      }
    }
  }
}
