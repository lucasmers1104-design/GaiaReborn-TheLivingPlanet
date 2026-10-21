/* =============================================================================
 * SimEarth 2.0 — launch film: the pixel kit
 * -----------------------------------------------------------------------------
 * What the launch film's painters (launchground.ts, launchsky.ts,
 * launchspace.ts) draw with.
 * One light buffer at art resolution (LAUNCH_ART_SHORT pixels across the
 * short side, as the intro's cosmos), shown through an ordered dither onto
 * LEVELS brightness steps per channel and scaled up by a whole number of
 * device pixels. Flat paint (sprites, smoke and cloud tones) is snapped onto
 * those steps, so it stays flat; light added on top (glows, the sky) dithers
 * between them in pixel bands.
 *
 * Sprites (built in launchmodels.ts) are relit per frame: albedo × (ambient
 * + key × facing) + emission, where facing is the banded share of light from
 * the upper left, and kept by depth. Smoke and clouds are soft puffs gathered
 * into a density field and shown in a few tones; the jet is banded heat.
 * ========================================================================== */

namespace SE {
  export const LAUNCH_ART_SHORT = 180;
  const LEVELS = 17;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((b) => (b + 0.5) / 16);

  export type LaunchRgb = readonly [number, number, number];

  /** The ordered-dither threshold of art pixel (x, y), 0..1. */
  export function launchDither(x: number, y: number): number {
    return BAYER[(y & 3) * 4 + (x & 3)];
  }

  /** A value on the level grid: flat paint lands exactly on a step and never dithers. */
  export function launchSnap(v: number): number {
    return Math.round(v * LEVELS) / LEVELS;
  }

  /** '#rrggbb' as 0..1 channels on the level grid. */
  export function launchHex(hex: string): LaunchRgb {
    const n = parseInt(hex.slice(1), 16);
    return [launchSnap(((n >> 16) & 255) / 255), launchSnap(((n >> 8) & 255) / 255), launchSnap((n & 255) / 255)];
  }

  export function launchMix(a: LaunchRgb, b: LaunchRgb, k: number): LaunchRgb {
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  }

  /** Integer hash of (x, y, seed) to 0..1: per-frame flicker that is still a pure function of the clock. */
  export function launchHash(x: number, y: number, seed: number): number {
    let h = Math.imul(x + 0x9e37, 0x85ebca6b) ^ Math.imul(y + 0x7f4a, 0xc2b2ae35) ^ seed;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  }

  /** How a sprite is lit this frame: ambient plus key light (by facing), and an optional light from below (the flame). */
  export interface LaunchLight {
    readonly amb: LaunchRgb;
    readonly key: LaunchRgb;
    /** Light rising from screen row `y` over `reach` art pixels. */
    readonly under?: { readonly y: number; readonly reach: number; readonly c: LaunchRgb };
  }

  export interface LaunchSprite {
    readonly w: number;
    readonly h: number;
    /** The anchor inside the sprite, art pixels. */
    readonly ax: number;
    readonly ay: number;
    readonly alb: Float32Array;
    readonly face: Float32Array;
    readonly emit: Float32Array;
    readonly on: Uint8Array;
    /** View depth toward the camera, units, relative to the anchor's. */
    readonly depth: Float32Array;
  }

  /** The screen's light buffer at art resolution and the canvas it is shown through. */
  export class LaunchArt {
    W = 0;
    H = 0;
    /** Device pixels per art pixel. */
    scale = 1;
    buf = new Float32Array(0);
    /** View depth per pixel of what sprites painted this frame (-Infinity: nothing); reset by clearDepth(). */
    depth = new Float32Array(0);
    private keep = new Float32Array(0);
    private readonly canvas = document.createElement('canvas');
    private readonly ctx: CanvasRenderingContext2D;
    private img: ImageData | null = null;

    constructor() {
      const ctx = this.canvas.getContext('2d');
      if (!ctx) throw new Error('SimEarth: 2D context unavailable for the launch film');
      this.ctx = ctx;
    }

    /** Size the buffer for a w × h CSS px screen at device scale dpr. */
    fit(w: number, h: number, dpr: number): void {
      this.scale = Math.max(1, Math.round((Math.min(w, h) * dpr) / LAUNCH_ART_SHORT));
      const W = Math.ceil((w * dpr) / this.scale);
      const H = Math.ceil((h * dpr) / this.scale);
      if (W === this.W && H === this.H) return;
      this.W = this.canvas.width = W;
      this.H = this.canvas.height = H;
      this.buf = new Float32Array(W * H * 3);
      this.depth = new Float32Array(W * H).fill(-Infinity);
      this.keep = new Float32Array(W * H * 3);
      this.img = this.ctx.createImageData(W, H);
    }

    clearDepth(): void {
      this.depth.fill(-Infinity);
    }

    set(x: number, y: number, r: number, g: number, b: number): void {
      if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
      const q = (y * this.W + x) * 3;
      this.buf[q] = r; this.buf[q + 1] = g; this.buf[q + 2] = b;
    }

    blend(x: number, y: number, c: LaunchRgb, a: number): void {
      if (x < 0 || y < 0 || x >= this.W || y >= this.H || a <= 0) return;
      const q = (y * this.W + x) * 3, b = this.buf;
      b[q] += (c[0] - b[q]) * a; b[q + 1] += (c[1] - b[q + 1]) * a; b[q + 2] += (c[2] - b[q + 2]) * a;
    }

    add(x: number, y: number, r: number, g: number, b: number): void {
      if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
      const q = (y * this.W + x) * 3;
      this.buf[q] += r; this.buf[q + 1] += g; this.buf[q + 2] += b;
    }

    rect(x: number, y: number, w: number, h: number, c: LaunchRgb): void {
      const x0 = Math.max(0, Math.round(x)), x1 = Math.min(this.W, Math.round(x + w));
      const y0 = Math.max(0, Math.round(y)), y1 = Math.min(this.H, Math.round(y + h));
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0, q = (yy * this.W + x0) * 3; xx < x1; xx++, q += 3) {
          this.buf[q] = c[0]; this.buf[q + 1] = c[1]; this.buf[q + 2] = c[2];
        }
      }
    }

    /** Additive light, falling off quadratically to 0 at `rad`; `sy` squashes it vertically. */
    glow(cx: number, cy: number, rad: number, c: LaunchRgb, i: number, sy = 1): void {
      if (i <= 0.005 || rad < 0.5) return;
      const ry = rad * sy;
      const x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(this.W - 1, Math.ceil(cx + rad));
      const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(this.H - 1, Math.ceil(cy + ry));
      const ix = 1 / (rad * rad), iy = 1 / (ry * ry), b = this.buf;
      for (let y = y0; y <= y1; y++) {
        const dy = y + 0.5 - cy, ky = dy * dy * iy;
        for (let x = x0, q = (y * this.W + x0) * 3; x <= x1; x++, q += 3) {
          const dx = x + 0.5 - cx;
          let k = 1 - dx * dx * ix - ky;
          if (k <= 0) continue;
          k *= k * i;
          b[q] += c[0] * k; b[q + 1] += c[1] * k; b[q + 2] += c[2] * k;
        }
      }
    }

    /**
     * A relit sprite with its anchor at art pixel (x, y) and view depth `z` (units): hidden where something nearer
     * was painted, writing its depth; NaN draws it over everything. `fade` < 1 dissolves it through the dither.
     */
    sprite(s: LaunchSprite, x: number, y: number, light: LaunchLight, z = NaN, fade = 1): void {
      const tested = !Number.isNaN(z), zb = this.depth;
      const ox = Math.round(x) - s.ax, oy = Math.round(y) - s.ay;
      const { amb, key, under } = light;
      const W = this.W, b = this.buf;
      for (let sy = 0; sy < s.h; sy++) {
        const py = oy + sy;
        if (py < 0 || py >= this.H) continue;
        const up = under ? clamp(1 - (under.y - py) / under.reach, 0, 1) : 0;
        const uk = up > 0 ? (up > 0.7 ? 1 : up > 0.4 ? 0.62 : 0.3) : 0;
        for (let sx = 0; sx < s.w; sx++) {
          const p = sy * s.w + sx;
          if (!s.on[p]) continue;
          const px = ox + sx;
          if (px < 0 || px >= W) continue;
          if (fade < 1 && launchDither(px, py) >= fade) continue;
          const at = py * W + px;
          if (tested) {
            const d = z + s.depth[p];
            if (d < zb[at]) continue;
            zb[at] = d;
          }
          const f = s.face[p], p3 = p * 3, q = at * 3;
          for (let c = 0; c < 3; c++) {
            let v = s.alb[p3 + c] * (amb[c] + key[c] * f) + s.emit[p3 + c];
            if (uk > 0 && under) v += s.alb[p3 + c] * under.c[c] * uk * (1.15 - f * 0.5);
            b[q + c] = launchSnap(v);
          }
        }
      }
    }

    /** Keep this frame for a dissolve. */
    hold(): void {
      this.keep.set(this.buf);
    }

    /** Dither-dissolve from the kept frame (p = 0) to the one painted since (p = 1). */
    dissolve(p: number): void {
      if (p >= 1) return;
      const W = this.W, b = this.buf, k = this.keep;
      for (let y = 0; y < this.H; y++) {
        for (let x = 0, q = y * W * 3; x < W; x++, q += 3) {
          if (launchDither(x, y) < p) continue;
          b[q] = k[q]; b[q + 1] = k[q + 1]; b[q + 2] = k[q + 2];
        }
      }
    }

    /** Light over 1 spills toward white; dither onto the levels; show on ctx (CSS px, w × h). */
    present(ctx: CanvasRenderingContext2D, dpr: number): void {
      const img = this.img;
      if (!img) return;
      const d = new Uint32Array(img.data.buffer);
      const b = this.buf, W = this.W, step = 255 / LEVELS;
      for (let y = 0, q = 0, p = 0; y < this.H; y++) {
        const row = (y & 3) * 4;
        for (let x = 0; x < W; x++, q += 3, p++) {
          let r = b[q], g = b[q + 1], bl = b[q + 2];
          const mx = r > g ? (r > bl ? r : bl) : g > bl ? g : bl;
          if (mx > 1) { const s = (mx - 1) * 0.6; r += s; g += s; bl += s; }
          const th = BAYER[row + (x & 3)];
          const R = Math.min(LEVELS, Math.max(0, Math.floor(r * LEVELS + th))) * step;
          const G = Math.min(LEVELS, Math.max(0, Math.floor(g * LEVELS + th))) * step;
          const B = Math.min(LEVELS, Math.max(0, Math.floor(bl * LEVELS + th))) * step;
          d[p] = (0xff000000 | (B << 16) | (G << 8) | R) >>> 0;
        }
      }
      this.ctx.putImageData(img, 0, 0);
      const k = dpr / this.scale;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.canvas, 0, 0, this.W / k, this.H / k);
    }
  }

  /* --------------------------------------------------------- smoke field -- */

  /** Soft puffs gathered per frame, then shown as crisp pixels in a few tones. */
  export class LaunchPuffs {
    private dens = new Float32Array(0);
    private lit = new Float32Array(0);
    private W = 0;
    private H = 0;
    private x0 = 0;
    private x1 = 0;
    private y0 = 0;
    private y1 = 0;

    begin(art: LaunchArt): void {
      if (art.W !== this.W || art.H !== this.H) {
        this.W = art.W;
        this.H = art.H;
        this.dens = new Float32Array(art.W * art.H);
        this.lit = new Float32Array(art.W * art.H);
      } else if (this.x1 >= this.x0) {
        for (let y = this.y0; y <= this.y1; y++) {
          this.dens.fill(0, y * this.W + this.x0, y * this.W + this.x1 + 1);
          this.lit.fill(0, y * this.W + this.x0, y * this.W + this.x1 + 1);
        }
      }
      this.x0 = this.W; this.x1 = -1; this.y0 = this.H; this.y1 = -1;
    }

    /**
     * A puff at (cx, cy), radius r, density d; `light` its own brightness 0..1, lit further from the upper left.
     * Puffs come back to front: inside its body a later puff's shading covers the ones behind, so each bulge keeps its own light.
     */
    puff(cx: number, cy: number, r: number, d: number, light: number, shade = 0.42, flat = 1): void {
      if (d <= 0.01 || r < 0.7) return;
      const W = this.W;
      const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(this.H - 1, Math.ceil(cy + r * flat));
      if (x0 > x1 || y0 > y1) return;
      this.x0 = Math.min(this.x0, x0); this.x1 = Math.max(this.x1, x1);
      this.y0 = Math.min(this.y0, y0); this.y1 = Math.max(this.y1, y1);
      const inv = 1 / r;
      for (let y = y0; y <= y1; y++) {
        const dy = (y + 0.5 - cy) * inv;
        for (let x = x0, p = y * W + x0; x <= x1; x++, p++) {
          const dx = (x + 0.5 - cx) * inv;
          const k = 1 - dx * dx - dy * dy;
          if (k <= 0) continue;
          const a = d * k;
          if (k > 0.14 || this.dens[p] === 0) this.lit[p] = light - (dx * 0.62 + dy * 0.62) * shade - (k < 0.3 ? 0.06 : 0);
          this.dens[p] += a;
        }
      }
    }

    /**
     * Show the field: cover dithered to on/off, shade through the dither onto `tones` (dark to light);
     * `heat`, 0..1 per pixel, swaps in `hot` tones (lit by the flame) through the dither.
     */
    paint(art: LaunchArt, tones: readonly LaunchRgb[], hot?: readonly LaunchRgb[], heat?: (x: number, y: number) => number, fade = 1): void {
      const W = this.W, n = tones.length, b = art.buf;
      for (let y = this.y0; y <= this.y1; y++) {
        for (let x = this.x0, p = y * W + this.x0; x <= this.x1; x++, p++) {
          const dd = this.dens[p];
          if (dd <= 0) continue;
          const th = launchDither(x, y);
          if (dd * fade < 0.07 + th * 0.16) continue;
          const tone = clamp(this.lit[p], 0, 0.999);
          const th2 = launchDither(x + 2, y + 1) - 0.5;
          let pal = tones;
          if (hot && heat && heat(x, y) > 0.3 + th * 0.4) pal = hot;
          const c = pal[clamp(Math.floor(tone * n + th2 * 0.45), 0, n - 1)];
          const q = p * 3;
          b[q] = c[0]; b[q + 1] = c[1]; b[q + 2] = c[2];
        }
      }
    }
  }

  /* -------------------------------------------------------------- flame -- */

  const FLAME: readonly LaunchRgb[] = [launchHex('#7d2d23'), launchHex('#c84b23'), launchHex('#f08c32'), launchHex('#ffd264'), launchHex('#fff5d2')];

  /**
   * The exhaust jet from (x, y) downward, `len` art px long, `wid` art px wide at the nozzles, at view depth `z`:
   * hidden behind nearer sprites (the trench's front lip). `flick` 0..1 scales the flicker. Paints opaque bands;
   * the glow is the caller's.
   */
  export function launchJet(art: LaunchArt, x: number, y: number, len: number, wid: number, t: number, flick: number, z = NaN, upto = 1): void {
    if (len < 1) return;
    const n = Math.floor(t * 24);
    const jitter = 1 + (launchHash(n, 7, 3) - 0.5) * 0.12 * flick;
    const L = len * jitter;
    const x0 = Math.max(0, Math.floor(x - wid * 1.6 - L * 0.12)), x1 = Math.min(art.W - 1, Math.ceil(x + wid * 1.6 + L * 0.12));
    const y0 = Math.max(0, Math.floor(y)), y1 = Math.min(art.H - 1, Math.ceil(y + L));
    const period = Math.max(3, wid * 0.9);
    for (let py = y0; py <= y1; py++) {
      const dy = py + 0.5 - y;
      const s = dy / L;
      if (s > upto) break;
      const ww = wid * (0.55 + 0.45 * Math.min(1, s * 5)) + dy * 0.1;
      const wave = 1 + 0.07 * flick * Math.sin(dy * 0.7 - t * 47);
      for (let px = x0; px <= x1; px++) {
        const dx = px + 0.5 - x;
        if (z === z && art.depth[py * art.W + px] > z) continue;
        const q = Math.abs(dx) / (ww * wave);
        if (q >= 1) continue;
        let heat = (1 - q * q) * Math.pow(1 - s, 1.25);
        if (q < 0.45) heat += 0.3 * Math.pow(Math.max(0, Math.cos((dy / period) * Math.PI)), 6) * (1 - s);
        heat += (launchDither(px, py) - 0.5) * 0.12;
        if (heat < 0.06) continue;
        const k = heat > 0.72 ? 4 : heat > 0.48 ? 3 : heat > 0.3 ? 2 : heat > 0.15 ? 1 : 0;
        const c = FLAME[k];
        if (k === 0) art.blend(px, py, c, 0.6);
        else if (k === 4) art.set(px, py, c[0] * 1.25, c[1] * 1.25, c[2] * 1.2);
        else art.set(px, py, c[0], c[1], c[2]);
      }
    }
  }

  /* ---------------------------------------------------------------- fog -- */

  const FOG_LOW: LaunchRgb = [0.25, 0.25, 0.36];
  const FOG_HIGH: LaunchRgb = [0.9, 0.84, 0.78];

  /**
   * Inside the cloud deck: fog of thickness `k` 0..1 over everything (shown in the levels' dither bands, not as a
   * screen door), darker below, brightening from the top by `sun` 0..1 as the sunlight above comes through.
   * Shared by both sides of the breakthrough.
   */
  export function launchFog(art: LaunchArt, k: number, sun: number): void {
    if (k <= 0.02) return;
    const { W, H } = art, b = art.buf;
    for (let y = 0; y < H; y++) {
      const c = launchMix(FOG_LOW, FOG_HIGH, clamp((1 - y / H) * (0.35 + 0.9 * sun) - 0.1, 0, 1) * (0.4 + 0.6 * sun));
      for (let x = 0, q = y * W * 3; x < W; x++, q += 3) {
        b[q] += (c[0] - b[q]) * k; b[q + 1] += (c[1] - b[q + 1]) * k; b[q + 2] += (c[2] - b[q + 2]) * k;
      }
    }
  }
}
