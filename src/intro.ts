/* =============================================================================
 * SimEarth 2.0 — the intro before the first world
 * -----------------------------------------------------------------------------
 * Plays after "Spiel starten". Before the very first world in full: black,
 * the studio card, the logo, the Big Bang behind it, the planets forming, then
 * a flight into the player's own planet. On every later new world it starts
 * at INTRO_SHORT_FROM instead: the point of light, the bang, planets and dive,
 * without studio card and logo. At the land cue the map takes over beneath
 * the white on the tile the dive aimed at, and glides in while the clouds
 * part over it (INTRO_REVEAL); the intro track dies away over the map and the
 * game's music follows on the dot. Skippable at any time (button or Esc).
 *
 * One clock drives everything: the intro track's playback position while it
 * plays, so the cues land on the music, else the frame clock. Every scene is
 * a pure function of that clock: the intro can seek (tools/intro-record.js),
 * skip and drop frames without a scene noticing.
 *
 * Scenes: introtitle.ts (studio card, logo), introcosmos.ts (Big Bang,
 * planets forming), introflight.ts (the dive onto the map).
 * ========================================================================== */

namespace SE {
  /**
   * Developer mode, while the intro is being made: the settings switch picks the
   * full intro or the short one for every "Spiel starten", and playing it does
   * not tick it off.
   * SET TO false BEFORE RELEASE: then the full intro plays once, before the
   * first world, and the short one before every later new world.
   */
  export const INTRO_DEV = true;

  /**
   * When each beat starts, in seconds on the intro clock. Measured from the
   * loudness of IntroMusic.mp3 (MUSIC_TRACKS.intro) in 50 ms steps; retime
   * here when the music changes.
   */
  export const INTRO_CUES = {
    /** "DreamStudios präsentiert" fades in softly with the music (it rises from 0.45 s to about 2.5 s). */
    studio: 0.6,
    /** The Gaia Reborn logo lands on the first big hit (a swell from 6.15 s, the hit at 6.6 s, +11 dB). */
    logo: 6.6,
    /** The Big Bang behind the logo: the music breathes in at 12.0–12.5 s and swells again from here. */
    bang: 12.55,
    /** The sun ignites on the loudest moment of the track; the planets form, the player's among them. */
    planets: 15.6,
    /**
     * The camera hurls toward the player's planet. Hand-over from the cosmos:
     * the planet sits at the screen centre with radius introHandoffRadius().
     */
    flight: 22,
    /** Through the clouds into white on the music's drop: the map takes over beneath it. */
    land: 27.2,
  } as const;

  /**
   * Where the short intro (no studio card, no logo) starts on the clock, and the
   * intro track with it: black, then the point of light gathers from a second
   * before the bang. The track is near the end of a loud stretch here; its
   * 1.2 s fade-in carries it into the breath before the bang.
   */
  export const INTRO_SHORT_FROM = 11;

  /**
   * Seconds after INTRO_CUES.land in which the clouds part over the map (the
   * canvas is see-through from the land cue on) while the map glides in; then
   * the intro is gone.
   */
  export const INTRO_REVEAL = 2.4;

  /** The map's zoom (px per tile) when it takes over beneath the clouds; it glides to the player's zoom through INTRO_REVEAL. */
  export const INTRO_GLIDE_FROM = 10;

  /** Where the intro track has died away (below -55 dB): the game's music starts right there. */
  export const INTRO_MUSIC_END = 30.85;

  /** Seconds after INTRO_CUES.flight in which the cosmos's sky fades out and the flight's stars fade in. */
  export const INTRO_HANDOFF_FADE = 0.6;

  /** The player's planet's radius at the hand-over from cosmos to flight, CSS px. */
  export function introHandoffRadius(w: number, h: number): number {
    return 0.08 * Math.min(w, h);
  }

  /** The player's planet's turn at intro time t; the flight lands on the tile in the middle at INTRO_CUES.land. */
  export function introSpin(t: number): number {
    return 2.4 + landingTurn + t * 0.12;
  }

  /** Added to every turn, per world, so the dive lands on a coast (see aimAtCoast). */
  let landingTurn = 0;

  /** Share of land the landing view should show: a coast, neither open sea nor a sea of rock. */
  const LANDING_LAND = 0.6;

  /**
   * Turn the planet so that the tile in the middle of the disc at the land cue
   * (always on the equator) is the one whose surroundings come closest to
   * LANDING_LAND, instead of wherever a fixed turn happens to point.
   */
  function aimAtCoast(world: WorldState): void {
    const y0 = GRID_H >> 1;
    let best = 0;
    let bestScore = Infinity;
    for (let x = 0; x < GRID_W; x++) {
      let land = 0;
      let seen = 0;
      for (let dy = -8; dy <= 8; dy++) {
        for (let dx = -12; dx <= 12; dx++) {
          seen++;
          if (!world.isWater(idx(wrapX(x + dx), y0 + dy))) land++;
        }
      }
      const score = Math.abs(land / seen - LANDING_LAND);
      if (score < bestScore) { bestScore = score; best = x; }
    }
    // TitleGlobe puts column (spin / 2π + 0.5) · GRID_W in the middle of the disc.
    landingTurn = 0;
    const want = Math.PI * 2 * (best / GRID_W - 0.5);
    const have = introSpin(INTRO_CUES.land);
    landingTurn = want - have - Math.PI * 2 * Math.round((want - have) / (Math.PI * 2));
  }

  /** 0 before `from`, 1 after `to`, linear between. */
  export function introSpan(t: number, from: number, to: number): number {
    return clamp((t - from) / (to - from), 0, 1);
  }

  /** Visible from `from` to `to`: rises over `edge` seconds after `from`, falls over `edge` before `to`. */
  export function introFade(t: number, from: number, to: number, edge: number): number {
    return Math.min(introSpan(t, from, from + edge), 1 - introSpan(t, to - edge, to));
  }

  export interface IntroFrame {
    /** Seconds on the intro clock. */
    readonly t: number;
    /** The shared canvas in CSS pixels (the device scale is applied): cleared to black, from INTRO_CUES.land to transparent over the map. */
    readonly ctx: CanvasRenderingContext2D;
    readonly w: number;
    readonly h: number;
    /** "Effekte reduzieren": no flashes, no shaking, calm fades instead of rushes. */
    readonly still: boolean;
  }

  export interface IntroStage {
    readonly world: WorldState;
    /** Layer above the canvas for DOM and SVG parts; centred grid, every child in one cell. */
    readonly layer: HTMLElement;
    /** The player's planet, drawable at any size. */
    readonly planet: IntroPlanet;
  }

  export interface IntroScene {
    /** Every frame, in order cosmos, flight, titles; must depend only on f.t (and the stage). */
    draw(f: IntroFrame): void;
  }

  /** The player's planet as the title globe paints it, in a hidden box, drawn onto the intro canvas. */
  export class IntroPlanet {
    private readonly globe: TitleGlobe;
    private spun = NaN;

    constructor(host: HTMLElement, private readonly world: WorldState) {
      const box = make('div', 'intro-globe-host');
      const canvas = make('canvas');
      box.appendChild(canvas);
      host.appendChild(box);
      this.globe = new TitleGlobe(canvas);
    }

    /** The disc centred on (cx, cy), radius r, turned by `spin` (see introSpin). */
    draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, spin: number): void {
      if (spin !== this.spun) {
        this.spun = spin;
        this.globe.spin = spin;
        this.globe.render(this.world);
      }
      this.globe.drawTo(ctx, cx, cy, r);
    }

    /** The tile in the middle of the disc at `spin`. */
    tileAt(spin: number): [number, number] {
      this.spun = NaN;
      this.globe.spin = spin;
      return this.globe.centerTile();
    }
  }

  export interface IntroHooks {
    world(): WorldState;
    reduceEffects(): boolean;
    /** Seconds into the intro track, or null while it is silent. */
    musicTime(): number | null;
    /** The land cue (or a skip): show the map beneath, centred on tile (x, y). */
    land(x: number, y: number, skipped: boolean): void;
    /** Every frame while the clouds part over the map: 0..1 through INTRO_REVEAL. */
    reveal(p: number): void;
    /** The intro is gone: play. */
    done(): void;
  }

  /** The intro on screen, if any: the click sounds stay quiet under it, recordings seek it. */
  export let activeIntro: IntroPlayer | null = null;

  /** A frame clock step longer than this is a stall (tab switch, debugger), not time that passed. */
  const MAX_STEP = 0.1;
  /** How far behind the frame clock the music may report before it counts as having looped back. */
  const MUSIC_SLACK = 0.25;
  const LEAVE_MS = 800;

  export class IntroPlayer {
    private readonly root: HTMLElement;
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly planet: IntroPlanet;
    private readonly scenes: IntroScene[];
    private t = 0;
    private last = 0;
    /** A recording holds the clock still. */
    private held = false;
    /** The map lies beneath: from the land cue on, or after a skip. */
    private landed = false;
    private ended = false;

    /** `from`: where the clock starts, 0 for the full intro, INTRO_SHORT_FROM for the short one without titles. */
    constructor(host: HTMLElement, private readonly hooks: IntroHooks, readonly from = 0) {
      this.t = from;
      this.root = make('div', 'intro');
      this.root.setAttribute('role', 'dialog');
      this.root.setAttribute('aria-modal', 'true');
      this.root.setAttribute('aria-label', 'Intro');
      this.canvas = make('canvas', 'intro-canvas');
      this.canvas.setAttribute('aria-hidden', 'true');
      const ctx = this.canvas.getContext('2d');
      if (!ctx) throw new Error('SimEarth: 2D context unavailable for the intro');
      this.ctx = ctx;
      const layer = make('div', 'intro-layer');
      const skip = button({ label: 'Überspringen', icon: uiIcon('chevron-right'), cls: 'btn intro-skip', onClick: () => this.finish() });
      this.root.append(this.canvas, layer, skip);
      host.appendChild(this.root);

      const world = hooks.world();
      aimAtCoast(world);
      this.planet = new IntroPlanet(this.root, world);
      const stage: IntroStage = { world, layer, planet: this.planet };
      this.scenes = [introCosmos(stage), introFlight(stage)];
      if (from <= 0) this.scenes.push(introTitles(stage));

      document.addEventListener('keydown', this.onKey);
      setGameInert(true);
      activeIntro = this;
      window.requestAnimationFrame(this.loop);
      skip.focus({ preventScroll: true });
    }

    /** Freeze the clock at `t` seconds and draw that frame now: for tools/intro-record.js. */
    hold(t: number): void {
      this.held = true;
      this.t = t;
      this.step();
    }

    private onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      this.finish();
    };

    private loop = (now: number): void => {
      if (this.ended) return;
      const dt = this.last ? (now - this.last) / 1000 : 0;
      this.last = now;
      if (!this.held) this.advance(dt);
      this.step();
      if (this.t >= INTRO_CUES.land + INTRO_REVEAL && !this.held) this.end(false);
      else window.requestAnimationFrame(this.loop);
    };

    private advance(dt: number): void {
      const music = this.hooks.musicTime();
      // The music is the clock; once it loops back (or never started) the frame clock carries on.
      if (music !== null && music >= this.t - MUSIC_SLACK) this.t = Math.max(this.t, music);
      else if (!document.hidden) this.t += Math.min(dt, MAX_STEP);
    }

    /** The frame at the clock; from the land cue on the map lies beneath and glides in with the clouds parting. */
    private step(): void {
      if (this.t >= INTRO_CUES.land) this.land(false);
      this.draw();
      if (this.landed) this.hooks.reveal(introSpan(this.t, INTRO_CUES.land, INTRO_CUES.land + INTRO_REVEAL));
    }

    private draw(): void {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const pw = Math.round(w * dpr);
      const ph = Math.round(h * dpr);
      if (this.canvas.width !== pw || this.canvas.height !== ph) {
        this.canvas.width = pw;
        this.canvas.height = ph;
      }
      const ctx = this.ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (this.t >= INTRO_CUES.land) {
        ctx.clearRect(0, 0, w, h);
      } else {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
      }
      const frame: IntroFrame = { t: this.t, ctx, w, h, still: this.hooks.reduceEffects() };
      for (const scene of this.scenes) {
        ctx.save();
        scene.draw(frame);
        ctx.restore();
      }
    }

    /** The map takes over beneath the intro, on the tile the dive aimed at. */
    private land(skipped: boolean): void {
      if (this.landed) return;
      this.landed = true;
      this.root.classList.add('revealing');
      const [x, y] = this.planet.tileAt(introSpin(INTRO_CUES.land));
      this.hooks.land(x, y, skipped);
    }

    /** Skipped (button or Esc): straight to the map, the intro fades out. */
    finish(): void {
      if (this.ended) return;
      if (!this.landed) this.land(true);
      this.end(true);
    }

    private end(fade: boolean): void {
      this.ended = true;
      activeIntro = null;
      document.removeEventListener('keydown', this.onKey);
      setGameInert(false);
      this.hooks.done();
      if (!fade) {
        this.root.remove();
        return;
      }
      this.root.classList.add('leaving');
      window.setTimeout(() => this.root.remove(), LEAVE_MS);
    }
  }

  /** The game behind stays out of reach of Tab and screen readers while the intro covers it. */
  export function setGameInert(on: boolean): void {
    document.querySelectorAll<HTMLElement>('#topbar, #desktop').forEach((el) => { el.inert = on; });
  }
}
