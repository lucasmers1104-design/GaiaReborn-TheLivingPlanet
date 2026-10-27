/* =============================================================================
 * Gaia Reborn — snow from the temperature cloud
 * -----------------------------------------------------------------------------
 * While the planet's mean temperature is below 10 °C, snow falls without a
 * pause from the status bar's temperature cloud (livingtopbar.ts) down over
 * the map to the stone beam: big, middle and small flakes (atlas sprites
 * snow_l, snow_m, snow_s, each tumbling at its own phase), the big ones nearer
 * and faster, all swaying in a light breeze; the colder, the thicker. A canvas
 * as wide as the stage (the breeze carries flakes far aside on a long fall),
 * above the map, behind the stone beam, Gaia, the rail and the windows; its
 * top reaches up behind the clouds, so the flakes come out of the cloud. It
 * animates only while flakes are in the air.
 * ========================================================================== */

namespace SE {
  /** Flakes per second just below the snow line and from 20 °C below it on. */
  const RATE = [1.6, 5] as const;
  const COLDEST = 20;
  /** Big to small: the share of flakes, fall speed in art px per second, sway in art px. */
  const KINDS = [
    { id: 'snow_l', share: 0.25, speed: [24, 30], sway: [3, 5] },
    { id: 'snow_m', share: 0.35, speed: [17, 23], sway: [2, 4] },
    { id: 'snow_s', share: 0.4, speed: [11, 16], sway: [1, 3] },
  ] as const;
  /** Art px in from the cloud's ends where flakes start. */
  const INSET = 8;
  /** The longest frame step that still counts as time passing: after a hidden tab, no sudden flurry. */
  const MAX_DT = 0.1;
  const Z = 20;

  interface Flake {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly t0: number;
    readonly speed: number;
    readonly sway: number;
    readonly freq: number;
    readonly phase: number;
    readonly drift: number;
  }

  const between = (r: readonly [number, number]): number => r[0] + Math.random() * (r[1] - r[0]);

  export class CloudSnow {
    private readonly pc = new PixelCanvas('cloud-snow', Z);
    private flakes: Flake[] = [];
    /** Flakes per second; 0 while it does not snow. */
    private rate = 0;
    /** Flakes owed by the time passed, a fraction carried over. */
    private due = 0;
    private last = 0;
    private raf = 0;
    /** The cloud's columns in art px of the stage and the bar's rows above the stage, while the cloud is shown. */
    private box: readonly [x0: number, x1: number, rows: number] | null = null;

    constructor(private readonly stage: HTMLElement) {
      stage.appendChild(this.pc.canvas);
    }

    /**
     * With every status update: degrees below the snow line (0 or less: no
     * snow), the cloud's box (null while it is hidden) and whether effects
     * are reduced (then no flakes at all).
     */
    set(below: number, box: readonly [number, number, number] | null, still: boolean): void {
      if (box) {
        const sc = uiScale();
        this.pc.size(Math.ceil(this.stage.clientWidth / sc.u), box[2] + Math.ceil(this.stage.clientHeight / sc.u), sc);
        this.pc.place({ left: 0, top: -box[2] * sc.u });
      }
      this.box = box;
      this.rate = below > 0 && box && !still ? RATE[0] + (RATE[1] - RATE[0]) * clamp(below / COLDEST, 0, 1) : 0;
      if (still && this.flakes.length) {
        this.flakes = [];
        this.pc.clear();
      }
      if (this.rate > 0 || this.flakes.length) this.wake();
    }

    private wake(): void {
      if (this.raf) return;
      this.last = performance.now();
      this.raf = requestAnimationFrame((now) => this.frame(now));
    }

    private frame(now: number): void {
      this.raf = 0;
      const dt = clamp((now - this.last) / 1000, 0, MAX_DT);
      this.last = now;
      const box = this.box;
      if (this.rate > 0 && box) {
        this.due += dt * this.rate;
        for (; this.due >= 1; this.due--) this.spawn(box, now);
      }
      const bottom = this.pc.h + 8;
      this.flakes = this.flakes.filter((f) => f.y + ((now - f.t0) / 1000) * f.speed < bottom);
      this.draw(now);
      if (this.rate > 0 || this.flakes.length) this.raf = requestAnimationFrame((t) => this.frame(t));
    }

    private spawn(box: readonly [number, number, number], now: number): void {
      let pick = Math.random();
      const kind = KINDS.find((k) => (pick -= k.share) < 0) ?? KINDS[KINDS.length - 1];
      const w = box[1] - box[0];
      this.flakes.push({
        id: kind.id,
        x: box[0] + INSET + Math.random() * Math.max(1, w - 2 * INSET),
        // Inside the cloud's lower part: the cloud covers the flake until it falls out of its belly.
        y: box[2] * 0.62,
        t0: now,
        speed: between(kind.speed),
        sway: between(kind.sway),
        freq: 0.8 + Math.random() * 0.9,
        phase: Math.random() * 6.3,
        drift: (Math.random() - 0.5) * 3,
      });
    }

    private draw(now: number): void {
      const ui = UiArt.shared();
      this.pc.clear();
      if (!ui.ready) return;
      const ctx = this.pc.ctx;
      for (const f of this.flakes) {
        const t = (now - f.t0) / 1000;
        const x = Math.round(f.x + f.sway * Math.sin(f.phase + f.freq * t) + f.drift * t);
        const y = Math.round(f.y + f.speed * t);
        ui.draw(ctx, f.id, ui.loopFrame(f.id, now, f.phase), x, y);
      }
    }
  }
}
