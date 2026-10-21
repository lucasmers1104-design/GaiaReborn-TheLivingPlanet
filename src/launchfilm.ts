/* =============================================================================
 * SimEarth 2.0 — the launch film
 * -----------------------------------------------------------------------------
 * Plays when the player starts the rocket ("Start in neue Welten"): twelve
 * seconds in four beats (FILM_SECONDS), a pixel-art canvas video in the
 * intro's style. 0–3 s the rocket waits on its pad in the desert dusk, 3–6 s
 * ignition and liftoff, 6–9 s through the cloud deck into sunlight (the
 * sparkle) until the home world curves away below, 9–12 s out into space:
 * the home world shrinks, Mars and Venus wait, the ship's light heads for
 * them. Painters: launchground.ts, launchsky.ts, launchspace.ts (with the
 * director LaunchScenes), on launchscenes.ts and launchmodels.ts; sound:
 * launchsound.ts.
 *
 * At 12 s, or on a skip (button or Esc, which dissolves to that frame), the
 * sound stops and done() fires once; the film stays on its calm last frame,
 * gently alive, until the app calls close() after its closing dialog.
 * Every frame is a pure function of the film clock, so hold(t) can seek it
 * for tools/launch-record.js.
 * ========================================================================== */

namespace SE {
  export interface LaunchFilmHooks {
    /** The home planet: drawn as the title globe paints it. */
    world(): WorldState;
    /** "Effekte reduzieren": no shake, no flashes, calm camera — same story. */
    reduceEffects(): boolean;
    /** Effect volume 0..1, 0 while sound is off; read live. */
    volume(): number;
    /** Film over: played out (false) or skipped (true). Called exactly once; audio already stopped. */
    done(skipped: boolean): void;
  }

  /** The film on screen, if any. */
  export let activeLaunchFilm: LaunchFilm | null = null;

  /** A frame clock step longer than this is a stall (tab switch, debugger), not time that passed. */
  const MAX_STEP = 0.1;
  /** Seconds of the dissolve from where a skip happened to the last frame. */
  const SKIP_FADE = 0.45;
  /** The held last frame redraws at most this often, ms: only stars and the ship's trail move. */
  const IDLE_MS = 50;
  const LEAVE_MS = 700;

  export class LaunchFilm {
    private readonly root: HTMLElement;
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly skip: HTMLButtonElement;
    private readonly scenes: LaunchScenes;
    private readonly sound = new LaunchSound();
    private t = 0;
    private last = 0;
    private drawn = 0;
    /** Seconds on the held last frame. */
    private idle = 0;
    /** Seconds since a skip, while its dissolve runs; -1 without one. */
    private skipped = -1;
    private held = false;
    private ended = false;
    private closed = false;

    constructor(host: HTMLElement, private readonly hooks: LaunchFilmHooks) {
      this.root = make('div', 'launchfilm');
      this.root.setAttribute('role', 'dialog');
      this.root.setAttribute('aria-modal', 'true');
      this.root.setAttribute('aria-label', 'Raketenstart');
      // Inline, so a cached old stylesheet still covers the screen.
      Object.assign(this.root.style, { position: 'fixed', inset: '0', zIndex: '880', background: '#000', overflow: 'hidden' });
      this.canvas = make('canvas', 'launchfilm-canvas');
      this.canvas.setAttribute('aria-hidden', 'true');
      Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
      const ctx = this.canvas.getContext('2d');
      if (!ctx) throw new Error('SimEarth: 2D context unavailable for the launch film');
      this.ctx = ctx;
      this.skip = button({ label: 'Überspringen', icon: uiIcon('chevron-right'), cls: 'btn intro-skip launchfilm-skip', onClick: () => this.finish() });
      Object.assign(this.skip.style, { position: 'absolute', right: '16px', bottom: '16px' });
      const said = make('p', 'sr-only', 'Die Rakete hebt ab, steigt durch die Wolken ins Sonnenlicht und fliegt hinaus ins All, zu Mars und Venus. Aufbruch zu neuen Welten.');
      this.root.append(this.canvas, said, this.skip);
      host.appendChild(this.root);
      this.scenes = new LaunchScenes(hooks.world());
      document.addEventListener('keydown', this.onKey);
      setGameInert(true);
      activeLaunchFilm = this;
      window.requestAnimationFrame(this.loop);
      this.skip.focus({ preventScroll: true });
    }

    /** Freeze the clock at t seconds and draw that frame now (for tools/launch-record.js). */
    hold(t: number): void {
      this.held = true;
      this.t = clamp(t, 0, FILM_SECONDS);
      this.draw();
    }

    /** Skip: the sound stops, done(true), and the film dissolves to its last frame and stays there until close(). */
    finish(): void {
      if (this.ended || this.closed) return;
      this.scenes.keepFrame();
      this.skipped = 0;
      this.end(true);
    }

    /** Fade out and remove the film; the game behind is in reach again. Before done() it skips first. */
    close(): void {
      if (this.closed) return;
      if (!this.ended) this.end(true);
      this.closed = true;
      if (activeLaunchFilm === this) activeLaunchFilm = null;
      setGameInert(false);
      this.root.classList.add('leaving');
      this.root.style.transition = `opacity ${LEAVE_MS}ms ease`;
      this.root.style.opacity = '0';
      this.root.style.pointerEvents = 'none';
      window.setTimeout(() => this.root.remove(), LEAVE_MS);
    }

    private get still(): boolean {
      return this.hooks.reduceEffects() || (!!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    private onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      this.finish();
    };

    private end(skipped: boolean): void {
      this.ended = true;
      this.t = FILM_SECONDS;
      this.sound.stop();
      document.removeEventListener('keydown', this.onKey);
      // The button's own display rule would beat the hidden attribute.
      this.skip.hidden = true;
      this.skip.style.display = 'none';
      this.hooks.done(skipped);
    }

    private loop = (now: number): void => {
      if (this.closed) return;
      const dt = this.last ? Math.min((now - this.last) / 1000, MAX_STEP) : 0;
      this.last = now;
      if (!this.held && !document.hidden) {
        if (!this.ended) {
          this.t += dt;
          if (this.t >= FILM_SECONDS) this.end(false);
        } else {
          this.idle += dt;
          if (this.skipped >= 0) this.skipped += dt;
        }
      }
      if (!this.held) {
        if (!this.ended) this.sound.update(this.t, this.hooks.volume(), this.still);
        const fading = this.skipped >= 0 && this.skipped < SKIP_FADE + 0.1;
        // The held frame: a few redraws a second for its stars, none at all when still.
        if (!this.ended || fading || (!this.still && now - this.drawn >= IDLE_MS)) {
          this.drawn = now;
          this.draw();
        }
      }
      window.requestAnimationFrame(this.loop);
    };

    private draw(): void {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth, h = window.innerHeight;
      const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
      if (this.canvas.width !== pw || this.canvas.height !== ph) {
        this.canvas.width = pw;
        this.canvas.height = ph;
      }
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const fade = this.skipped >= 0 ? smoothstep(clamp(this.skipped / SKIP_FADE, 0, 1)) : 1;
      this.scenes.draw(this.ctx, w, h, dpr, this.t, this.still, this.ended ? this.idle : 0, fade);
    }
  }
}
