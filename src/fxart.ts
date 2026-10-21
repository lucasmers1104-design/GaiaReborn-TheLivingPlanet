/* =============================================================================
 * SimEarth 2.0 — the effect atlas on screen
 * -----------------------------------------------------------------------------
 * Decodes the generated effect atlas (fxatlas.ts) once: sprite frames as
 * small canvases, ground textures as RGBA words for the ground composer.
 * Everything is scaled the way the terrain is (landview.ts): nearest
 * neighbour to the next whole multiple k of 16 px per tile, then smoothly
 * down to the device tile size, so an effect's pixels line up with the
 * landscape's at every zoom. Pixel art is never rotated here.
 * ========================================================================== */

namespace SE {
  /** Transparent art pixels around a cached frame, so smoothing fades its edge instead of cutting it. */
  const PAD = 1;
  const SMOOTHING: ImageSmoothingQuality = 'high';

  export class FxArt {
    private static instance: FxArt | null = null;
    static shared(): FxArt {
      return FxArt.instance ?? (FxArt.instance = new FxArt());
    }

    private state: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
    private atlas: HTMLImageElement | null = null;
    private words: Uint32Array | null = null;
    /** 1× frame canvases (with PAD) and their k-fold enlargements, by `${id}|${frame}|${k}`. */
    private readonly frames = new Map<string, HTMLCanvasElement>();
    private readonly textures = new Map<string, Uint32Array[]>();
    private scratch: HTMLCanvasElement | null = null;

    get ready(): boolean {
      return this.state === 'ready';
    }

    /** Start decoding; the effect layer draws nothing until the atlas is ready. */
    load(): void {
      if (this.state !== 'idle') return;
      this.state = 'loading';
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = FX_MANIFEST.width;
        canvas.height = FX_MANIFEST.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) { this.state = 'failed'; return; }
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        this.words = new Uint32Array(data.buffer.slice(0));
        this.atlas = img;
        this.state = 'ready';
      };
      img.onerror = () => {
        this.state = 'failed';
        console.warn('SimEarth: the effect atlas did not decode, disasters show no effects');
      };
      img.src = FX_ATLAS_PNG;
    }

    /** The frames of a ground texture as RGBA words, size × size each. */
    texture(id: string): Uint32Array[] {
      let out = this.textures.get(id);
      if (out) return out;
      const tex = FX_MANIFEST.textures[id];
      const words = this.words;
      out = [];
      if (tex && words) {
        for (const r of tex.frames) {
          const px = new Uint32Array(r.w * r.h);
          for (let y = 0; y < r.h; y++) px.set(words.subarray((r.y + y) * FX_MANIFEST.width + r.x, (r.y + y) * FX_MANIFEST.width + r.x + r.w), y * r.w);
          out.push(px);
        }
      }
      this.textures.set(id, out);
      return out;
    }

    /** One frame at 1× with PAD, or enlarged k times by nearest neighbour; cached and shared, so never draw into it. */
    frame(id: string, f: number, k: number): HTMLCanvasElement | null {
      const key = `${id}|${f}|${k}`;
      const hit = this.frames.get(key);
      if (hit) return hit;
      const sp = FX_MANIFEST.sprites[id];
      if (!sp || !this.atlas) return null;
      const r = sp.frames[f];
      const canvas = document.createElement('canvas');
      canvas.width = (r.w + 2 * PAD) * k;
      canvas.height = (r.h + 2 * PAD) * k;
      const c = canvas.getContext('2d');
      if (!c) return null;
      c.imageSmoothingEnabled = false;
      if (k === 1) c.drawImage(this.atlas, r.x, r.y, r.w, r.h, PAD, PAD, r.w, r.h);
      else {
        const base = this.frame(id, f, 1);
        if (!base) return null;
        c.drawImage(base, 0, 0, canvas.width, canvas.height);
      }
      this.frames.set(key, canvas);
      return canvas;
    }

    /**
     * Draw frame `f` of sprite `id` with its art pixel (sx, sy) — by default
     * its anchor — at world art pixel (wx, wy). `rows` keeps only the frame's
     * rows [from, to) (a column rising out of its crater, lifting off).
     */
    drawSprite(
      ctx: CanvasRenderingContext2D, cam: LandCamera, id: string, f: number, wx: number, wy: number,
      rows: readonly [number, number] | null = null, sx?: number, sy?: number,
    ): void {
      const sp = FX_MANIFEST.sprites[id];
      if (!sp) return;
      const frame = Math.max(0, Math.min(sp.frames.length - 1, f));
      const T = cam.tilePx * cam.dpr;
      const k = T > 16 ? Math.ceil(T / 16 - 1e-6) : 1;
      const sharp = Math.abs(T - 16 * k) < 1e-6;
      const src = this.frame(id, frame, sharp || T < 16 ? 1 : k);
      if (!src) return;
      const s = T / 16;
      const unit = src.width / (sp.w + 2 * PAD);
      const row0 = wy - (sy ?? sp.ay);
      let srcY = 0;
      let srcH = src.height;
      let artY = row0 - PAD;
      let artH = sp.h + 2 * PAD;
      if (rows) {
        if (rows[1] <= rows[0]) return;
        srcY = (rows[0] + PAD) * unit;
        srcH = (rows[1] - rows[0]) * unit;
        artY = row0 + rows[0];
        artH = rows[1] - rows[0];
      }
      const dx = Math.round((wx - (sx ?? sp.ax) - PAD - cam.scrollX * 16) * s);
      const dy = Math.round((artY - cam.scrollY * 16) * s);
      ctx.imageSmoothingEnabled = !sharp;
      if (!sharp) ctx.imageSmoothingQuality = SMOOTHING;
      ctx.drawImage(src, 0, srcY, src.width, srcH, dx, dy, (sp.w + 2 * PAD) * s, artH * s);
    }

    /**
     * Draw a 1× canvas region (art pixels sx, sy, sw, sh) with its top left at
     * world art pixel (wx, wy), scaled like the terrain.
     */
    drawPixels(ctx: CanvasRenderingContext2D, cam: LandCamera, src: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number, wx: number, wy: number): void {
      const T = cam.tilePx * cam.dpr;
      const s = T / 16;
      const k = T > 16 ? Math.ceil(T / 16 - 1e-6) : 1;
      const mode = Math.abs(T - 16 * k) < 1e-6 ? 'sharp' : T > 16 ? 'twostep' : 'smooth';
      const dx = (wx - cam.scrollX * 16) * s;
      const dy = (wy - cam.scrollY * 16) * s;
      if (mode !== 'twostep') {
        ctx.imageSmoothingEnabled = mode === 'smooth';
        if (mode === 'smooth') ctx.imageSmoothingQuality = SMOOTHING;
        ctx.drawImage(src, sx, sy, sw, sh, Math.round(dx), Math.round(dy), sw * s, sh * s);
        return;
      }
      const w = sw * k;
      const h = sh * k;
      if (!this.scratch || this.scratch.width < w || this.scratch.height < h) {
        this.scratch = document.createElement('canvas');
        this.scratch.width = Math.max(w, this.scratch ? this.scratch.width : 0);
        this.scratch.height = Math.max(h, this.scratch ? this.scratch.height : 0);
      }
      const sc = this.scratch.getContext('2d');
      if (!sc) return;
      sc.clearRect(0, 0, w, h);
      sc.imageSmoothingEnabled = false;
      sc.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = SMOOTHING;
      ctx.drawImage(this.scratch, 0, 0, w, h, Math.round(dx), Math.round(dy), sw * s, sh * s);
    }
  }

  /** CSS colour of a terrain palette entry by ramp and step, e.g. ('red', 1). */
  export function fxColor(ramp: string, step: number): string {
    const r = TERRAIN_MANIFEST.ramps[ramp];
    const c = TERRAIN_MANIFEST.palette[r[Math.max(0, Math.min(r.length - 1, step))]];
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
}
