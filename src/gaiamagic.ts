/* =============================================================================
 * Gaia Reborn — Gaia's evolution magic
 * -----------------------------------------------------------------------------
 * The moment before a major evolution step's showcase: Gaia lifts her hand
 * with the little glowing world (gaiacompanion.ts), teal, green and violet
 * motes spiral into it, the gathered light rises and a DNA double helix grows
 * from it, turning in space with sparks circling it (dnahelix.ts); then the
 * energy collapses into a comet that flies to where the new life arose and
 * bursts there with a soft chime, and the showcase opens. About 4.5 s; with
 * reduced effects 1.2 s of the raised hand, a calm glow and a still helix.
 * Pixel art from the UI atlas on two canvases fixed over the viewport: the
 * sprites, and beneath them the glows, which the page adds onto whatever lies
 * below, so light only ever brightens. Minor steps, a covered screen and the
 * screenshot pages skip it at once.
 * ========================================================================== */

namespace SE {
  export interface MagicHooks {
    readonly companion: GaiaCompanion;
    /** Client px of a tile's centre on the map, or null when it is off screen or under a window. */
    tileClient(tile: number): { x: number; y: number } | null;
    /** "Effekte reduzieren" or prefers-reduced-motion. */
    reduced(): boolean;
    /** Title, intro, a modal, the dinosaurs' fate dialog or the launch film has the screen. */
    blocked(): boolean;
    /** Effect volume 0..1. */
    volume(): number;
  }

  /** Phases in ms after the orb shows: motes gather until FORM_AT; the light rises and the helix grows for FORM_MS, then turns until FLY_AT. */
  const FORM_AT = 800;
  const FORM_MS = 600;
  const RISE_MS = 160;
  const FLY_AT = 3000;
  /** The helix collapses into the comet, which flies for FLY_MS; the burst plays its frames from BURST_AT, the end follows them. */
  const COLLAPSE_MS = 240;
  const FLY_MS = 800;
  const BURST_AT = FLY_AT + FLY_MS;
  const END_PAD_MS = 60;
  /** Reduced effects: the raised hand, a calm glow and a still helix this long, turned this far. */
  const STILL_MS = 1200;
  const STILL_SPIN = 0.7;
  /** A sequence that hangs (no frames, a lost orb) ends SAFETY_MS after play; one whose orb showed late gets its planned end plus SAFETY_PAD_MS. */
  const SAFETY_MS = 8000;
  const SAFETY_PAD_MS = 1500;
  /** Positions move in steps of this; sprites keep their own fps and the helix turns at HELIX_FPS, once round in TURN_MS. */
  const STEP_MS = 1000 / 30;
  const HELIX_FPS = 12;
  const TURN_MS = 1800;
  /** Art px from the orb's top to the helix's lower tip. */
  const HELIX_LIFT = 6;
  /** Gathering motes: how many, how far out they start (art px), how far they swirl (rad), the ring's flattening, the spread of their starts (ms). */
  const MOTES = 32;
  const MOTE_FAR: readonly [number, number] = [18, 46];
  const MOTE_SWIRL = 4;
  const MOTE_FLAT = 0.7;
  const MOTE_STAGGER_MS = 260;
  const GOLDEN_ANGLE = 2.39996;
  /**
   * The comet's tail: the path of its last TAIL_MS as a line of art px in TAIL_STEPS, bright at the head, dithered at
   * the end; TRAIL motes scattered wider over the last TRAIL_MS. Its curve bows by BOW of its length.
   */
  const TAIL_MS = 90;
  const TAIL_STEPS = 40;
  const TAIL_RAMP = ['glowT5', 'glowT4', 'glowT3', 'glowT2'] as const;
  const TRAIL = 9;
  const TRAIL_MS = 130;
  const BOW = 0.22;
  /** Above the companion (589) and the windows, below the top bar (600). */
  const Z_MAGIC = 590;

  const easeOut = (p: number): number => 1 - (1 - p) * (1 - p);

  /** Screenshot pages fast-forward through many steps: no magic there unless the URL asks for it. */
  const previewQuiet = (): boolean => !!document.querySelector('script[src*="_preview"]') && !/[?&]magic=1(&|$)/.test(location.search);

  /** `done` opens the showcase: its errors are logged, never thrown into the caller or the frame loop. */
  function safely(f: () => void): void {
    try { f(); } catch (err) { console.error(err); }
  }

  interface MagicRun {
    readonly e: ChronicleEntry;
    readonly done: () => void;
    readonly playAt: number;
    still: boolean;
    /** When the orb showed (performance.now ms), −1 while Gaia lifts her hand; the planned end, ms after it. */
    at: number;
    end: number;
    /** The orb's centre in client px, from the last frame it showed. */
    ox: number;
    oy: number;
    /** Where the comet flies, client px, fixed when it sets off. */
    target: { x: number; y: number } | null;
    chimed: boolean;
    timer: number;
    /** The motion step drawn last. */
    step: number;
  }

  export class GaiaMagic {
    private run: MagicRun | null = null;
    private layer: { readonly fg: PixelCanvas; readonly gl: PixelCanvas } | null = null;

    constructor(private readonly hooks: MagicHooks) {}

    /** Plays the magic for a major evolution step, then calls `done`; anything else calls `done` at once. `done` always runs, once. */
    play(e: ChronicleEntry, done: () => void): void {
      // A `done` that synchronously plays the next step starts a run of its own: finish that too.
      while (this.run) this.finish();
      const run: MagicRun = {
        e, done, playAt: performance.now(), still: false, at: -1, end: 0, ox: 0, oy: 0, target: null, chimed: false, timer: 0, step: -1,
      };
      this.run = run;
      try {
        if (e.kind !== 'evolution' || !e.major || document.hidden || !UiArt.shared().ready || previewQuiet() || this.hooks.blocked()) {
          this.finish();
          return;
        }
        run.still = this.hooks.reduced();
        this.arm(run, SAFETY_MS);
        this.hooks.companion.startMagic(() => this.begin(run));
      } catch (err) {
        console.error(err);
        if (this.run === run) this.finish();
      }
    }

    /** Stops a sequence in flight; its `done` still runs. */
    cancel(): void {
      this.finish();
    }

    /** Call every frame; draws only while a sequence runs, and only when a motion step or the viewport changed. */
    render(now: number): void {
      const run = this.run;
      const layer = this.layer;
      if (!run || run.at < 0 || !layer) return;
      try {
        const t = Math.max(0, now - run.at);
        if (t >= run.end) { this.finish(); return; }
        const scale = uiScale();
        const w = Math.ceil(window.innerWidth / scale.u);
        const h = Math.ceil(window.innerHeight / scale.u);
        const glowResized = layer.gl.size(w, h, scale);
        const resized = layer.fg.size(w, h, scale) || glowResized;
        const step = run.still ? 0 : Math.floor(t / STEP_MS);
        if (!resized && step === run.step) return;
        run.step = step;
        const q = step * STEP_MS;
        if (!run.still && !run.chimed && q >= BURST_AT) this.chime(run);
        layer.fg.clear();
        layer.gl.clear();
        // Overlapping glows add up too (a resize resets the context, so set it every time).
        layer.gl.ctx.globalCompositeOperation = 'lighter';
        this.draw(run, q, layer.fg.ctx, layer.gl.ctx, scale.u);
      } catch (err) {
        console.error(err);
        this.finish();
      }
    }

    /** The orb shows: the light begins. Without an orb to start from there is nothing to show. */
    private begin(run: MagicRun): void {
      if (this.run !== run || run.at >= 0) return;
      try {
        const orb = this.hooks.companion.orbClient();
        if (!orb) { this.finish(); return; }
        const now = performance.now();
        run.at = now;
        run.ox = orb.x;
        run.oy = orb.y;
        const burst = UiArt.shared().sprite('burst');
        run.end = run.still ? STILL_MS : BURST_AT + (burst && burst.fps > 0 ? (1000 * burst.frames.length) / burst.fps : 0) + END_PAD_MS;
        this.arm(run, Math.max(SAFETY_MS - (now - run.playAt), run.end + SAFETY_PAD_MS));
        this.show();
        if (run.still) this.chime(run);
      } catch (err) {
        console.error(err);
        this.finish();
      }
    }

    private draw(run: MagicRun, t: number, fg: CanvasRenderingContext2D, gl: CanvasRenderingContext2D, u: number): void {
      const art = UiArt.shared();
      const orb = this.hooks.companion.orbClient();
      if (orb) { run.ox = orb.x; run.oy = orb.y; }
      const ox = Math.floor(run.ox / u);
      const oy = Math.floor(run.oy / u);
      const hx = ox;
      const hy = oy - Math.ceil((art.sprite('gaia_orb')?.h ?? 0) / 2) - HELIX_LIFT - DNA_HALF_H;
      if (run.still) {
        art.draw(gl, 'glow', 1, ox, oy);
        drawDnaHelix(fg, gl, hx, hy, { spin: STILL_SPIN, grow: 1, ms: 0, sparks: true, still: true });
        return;
      }
      const spin = (2 * Math.PI * Math.floor((t * HELIX_FPS) / 1000)) / ((HELIX_FPS * TURN_MS) / 1000);
      // 1. Motes spiral into the orb, whose glow swells as they arrive.
      if (t < FORM_AT) {
        this.gather(fg, art, t, ox, oy);
        art.draw(gl, 'glow', Math.min(2, Math.floor((3 * t) / FORM_AT)), ox, oy);
        return;
      }
      // 2. The gathered light rises off the orb and the strands grow from the helix's centre outwards; 3. it turns, sparks circling it.
      if (t < FLY_AT) {
        const f = t - FORM_AT;
        art.draw(gl, 'glow', 1, ox, oy);
        if (f < RISE_MS) {
          const y = Math.round(lerp(oy, hy, easeOut(f / RISE_MS)));
          art.draw(gl, 'glow', 0, hx, y);
          art.draw(fg, 'spark', art.loopFrame('spark', t), hx, y);
        }
        const grow = easeOut(clamp((f - RISE_MS / 2) / (FORM_MS - RISE_MS / 2), 0, 1));
        drawDnaHelix(fg, gl, hx, hy, { spin, grow, ms: f, sparks: grow >= 0.6, still: false });
        return;
      }
      // 4. The energy collapses into a comet that flies on an eased curve to where the new life arose.
      const target = run.target ?? (run.target = this.target(run.e));
      const tx = Math.floor(target.x / u);
      const ty = Math.floor(target.y / u);
      if (t < BURST_AT) {
        const c = (t - FLY_AT) / COLLAPSE_MS;
        if (c < 1) {
          drawDnaHelix(fg, gl, hx, hy, { spin, grow: 1 - c * c, ms: t - FORM_AT, sparks: false, still: false });
          art.draw(gl, 'glow', c < 0.5 ? 1 : 2, hx, hy);
          art.draw(gl, 'glow', 0, ox, oy);
        }
        if (c >= 0.5) this.comet(fg, gl, art, t, (t - FLY_AT) / FLY_MS, hx, hy, tx, ty);
        return;
      }
      // 5. It bursts there, its glow fading with the ring.
      const sp = art.sprite('burst');
      const f = sp && sp.fps > 0 ? Math.floor(((t - BURST_AT) * sp.fps) / 1000) : 0;
      art.draw(gl, 'glow', Math.max(0, 2 - (f >> 1)), tx, ty);
      if (sp && f < sp.frames.length) art.draw(fg, 'burst', f, tx, ty);
    }

    /** Motes of the three lights spiral in from all round the orb, each on its own delay; small as they appear and as they merge. */
    private gather(fg: CanvasRenderingContext2D, art: UiArt, t: number, ox: number, oy: number): void {
      for (let i = 0; i < MOTES; i++) {
        const delay = (((i * 7) % 12) * MOTE_STAGGER_MS) / 11;
        const p = (t - delay) / (FORM_AT - MOTE_STAGGER_MS);
        if (p < 0 || p >= 1) continue;
        const r = (MOTE_FAR[0] + ((i * 13) % (MOTE_FAR[1] - MOTE_FAR[0]))) * (1 - p * p);
        const a = i * GOLDEN_ANGLE + MOTE_SWIRL * p;
        const size = p < 0.15 || p > 0.8 ? 0 : 1 + (i & 1);
        art.draw(fg, 'mote', (i % 3) * 3 + size, Math.round(ox + r * Math.cos(a)), Math.round(oy + MOTE_FLAT * r * Math.sin(a)));
      }
    }

    /**
     * The comet's head at share p of its flight on a curve bowing upwards; behind it on the same curve its tail, which
     * stretches with its speed, and motes and two sparks spreading wider towards the tail's end.
     */
    private comet(fg: CanvasRenderingContext2D, gl: CanvasRenderingContext2D, art: UiArt, t: number, p: number, x0: number, y0: number, x1: number, y1: number): void {
      // The control point lies off the middle, square to the line, on its upper side.
      const flip = x1 > x0 ? 1 : -1;
      const mx = (x0 + x1) / 2 + flip * (y1 - y0) * BOW;
      const my = (y0 + y1) / 2 - flip * (x1 - x0) * BOW;
      const at = (q: number): [number, number] => {
        const e = smoothstep(clamp(q, 0, 1));
        const a = (1 - e) * (1 - e);
        const b = 2 * e * (1 - e);
        const c = e * e;
        return [a * x0 + b * mx + c * x1, a * y0 + b * my + c * y1];
      };
      const [hx, hy] = at(p);
      let lx = Math.round(hx);
      let ly = Math.round(hy);
      for (let s = 1; s <= TAIL_STEPS; s++) {
        const q = p - (s / TAIL_STEPS) * (TAIL_MS / FLY_MS);
        if (q <= 0) break;
        const [qx, qy] = at(q);
        const sx = Math.round(qx);
        const sy = Math.round(qy);
        const n = Math.max(Math.abs(sx - lx), Math.abs(sy - ly));
        const k = Math.min(TAIL_RAMP.length - 1, Math.floor((s / TAIL_STEPS) * TAIL_RAMP.length));
        fg.fillStyle = art.color(TAIL_RAMP[k]);
        for (let j = 1; j <= n; j++) {
          const x = Math.round(lx + ((sx - lx) * j) / n);
          const y = Math.round(ly + ((sy - ly) * j) / n);
          if (k < TAIL_RAMP.length - 1 || ((x + y) & 1) === 0) fg.fillRect(x, y, 1, 1);
        }
        lx = sx;
        ly = sy;
      }
      for (let k = TRAIL; k >= 1; k--) {
        const q = p - (k / TRAIL) * (TRAIL_MS / FLY_MS);
        if (q <= 0) continue;
        const [x, y] = at(q);
        const [bx, by] = at(q - 0.01);
        const len = Math.hypot(x - bx, y - by) || 1;
        const side = (k & 1 ? 1 : -1) * Math.ceil(k / 3);
        const sx = Math.round(x - ((y - by) / len) * side);
        const sy = Math.round(y + ((x - bx) / len) * side);
        if (k === 4 || k === 7) {
          const id = k === 4 ? 'spark_v' : 'spark';
          art.draw(fg, id, art.loopFrame(id, t, k), sx, sy);
        } else art.draw(fg, 'mote', (k % 3) * 3 + (k <= 2 ? 2 : k <= 5 ? 1 : 0), sx, sy);
      }
      art.draw(gl, 'glow', 1, Math.round(hx), Math.round(hy));
      art.draw(fg, 'comet', art.loopFrame('comet', t), Math.round(hx), Math.round(hy));
    }

    /** Client px of where the new life arose, or the middle of the screen when that is unknown, off screen or covered. */
    private target(e: ChronicleEntry): { x: number; y: number } {
      const p = e.at !== undefined ? this.hooks.tileClient(e.at) : null;
      return p ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }

    private chime(run: MagicRun): void {
      run.chimed = true;
      playMagicChime(this.hooks.volume(), !!run.e.spontaneous);
    }

    private arm(run: MagicRun, ms: number): void {
      window.clearTimeout(run.timer);
      run.timer = window.setTimeout(() => { if (this.run === run) this.finish(); }, ms);
    }

    /** The two canvases, made on first use; layout and blending inline, so an old stylesheet cannot break them. */
    private show(): void {
      if (!this.layer) {
        const gl = new PixelCanvas('magic-glow', Z_MAGIC);
        const fg = new PixelCanvas('magic-layer', Z_MAGIC);
        gl.canvas.style.position = 'fixed';
        fg.canvas.style.position = 'fixed';
        // Light adds onto the page beneath; 'screen' stays where a browser lacks 'plus-lighter' (it ignores an unknown value).
        gl.canvas.style.mixBlendMode = 'screen';
        gl.canvas.style.mixBlendMode = 'plus-lighter';
        document.body.append(gl.canvas, fg.canvas);
        this.layer = { fg, gl };
      }
      this.layer.gl.canvas.style.display = '';
      this.layer.fg.canvas.style.display = '';
    }

    private finish(): void {
      const run = this.run;
      if (!run) return;
      this.run = null;
      window.clearTimeout(run.timer);
      try {
        const l = this.layer;
        if (l) {
          for (const c of [l.gl, l.fg]) {
            c.clear();
            c.canvas.style.display = 'none';
          }
        }
        this.hooks.companion.stopMagic();
      } catch (err) {
        console.error(err);
      }
      safely(run.done);
    }
  }

  let magicAudio: AudioContext | null = null;

  /**
   * Light settling: a soft root-and-fifth pad under five faint bell tones rising
   * through the major chord, with a little echo, in the key of the showcase's
   * chime that follows (C major; E major for a step that arose on its own).
   * Quiet beside it: that chime is the moment's voice.
   */
  function playMagicChime(volume: number, spontaneous: boolean): void {
    if (volume <= 0 || document.hidden) return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ac = magicAudio ?? (magicAudio = new Ctor());
      if (ac.state === 'suspended') void ac.resume();
      const key = spontaneous ? 1.259921 : 1;
      const t0 = ac.currentTime + 0.02;
      const out = ac.createGain();
      out.gain.value = volume;
      out.connect(ac.destination);
      const delay = ac.createDelay(1);
      delay.delayTime.value = 0.17;
      const damp = ac.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = 2800;
      const feedback = ac.createGain();
      feedback.gain.value = 0.28;
      const wet = ac.createGain();
      wet.gain.value = 0.3;
      out.connect(delay);
      delay.connect(damp);
      damp.connect(feedback).connect(delay);
      damp.connect(wet).connect(ac.destination);
      const tone = (freq: number, t: number, peak: number, attack: number, decay: number): void => {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq * key;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(peak, t + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
        osc.connect(gain).connect(out);
        osc.start(t);
        osc.stop(t + attack + decay + 0.05);
      };
      tone(261.63, t0, 0.03, 0.18, 1.3);
      tone(392, t0 + 0.02, 0.022, 0.2, 1.2);
      [783.99, 1046.5, 1318.51, 1567.98, 2093].forEach((f, k) => tone(f, t0 + 0.03 + k * 0.06, 0.016, 0.005, 0.5 + 0.08 * k));
    } catch {
      // No audio device or a blocked context: the magic works without sound.
    }
  }
}
