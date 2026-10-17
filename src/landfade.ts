/* =============================================================================
 * SimEarth 2.0 — dissolving a brushed chunk into its new picture
 * -----------------------------------------------------------------------------
 * While the terraforming brush runs, a chunk is recomposed every frame and a
 * tile that turns from sea to land, or from one landscape to the next, would
 * flip in one frame. Instead the chunk keeps the picture it shows and each
 * art pixel that differs takes the new colour at its own moment within
 * LAND_FADE_MS, in ordered-dither order (Bayer 4×4 in world pixels): a
 * pixel-art dissolve with palette colours only, never a blend. A pixel that
 * changes again before its moment keeps that moment, so nothing lags more
 * than one fade behind the brush.
 * ========================================================================== */

namespace SE {
  /** How long a changed pixel may wait, ms. */
  export const LAND_FADE_MS = 220;

  export class LandFade {
    readonly image: ImageData;
    /** What the chunk canvas shows (the image's pixels). */
    private readonly shown: Uint32Array;
    /** The latest composition. */
    private readonly target: Uint32Array;
    /** When each pixel that still differs takes its target, performance.now() ms. */
    private readonly due: Float32Array;
    /** No pixel differs any more. */
    settled = true;
    /** Bounding box of the pixels that still differ, [x0, x1) × [y0, y1) in canvas pixels. */
    x0 = 0; y0 = 0; x1 = 0; y1 = 0;

    /** `current`: the chunk's canvas as it is, `side` × `side`; `origin`: world art pixel of its corner (x, y). */
    constructor(current: ImageData, private readonly side: number, private readonly ox: number, private readonly oy: number) {
      this.image = current;
      this.shown = new Uint32Array(current.data.buffer);
      this.target = this.shown.slice();
      this.due = new Float32Array(this.shown.length);
    }

    /** A new composition of the chunk: its changed pixels start (or keep) their way over. */
    retarget(next: Uint32Array, now: number): void {
      const { shown, target, due, side } = this;
      let x0 = side, y0 = side, x1 = 0, y1 = 0;
      for (let y = 0, p = 0; y < side; y++) {
        const bay = ((this.oy + y) & 3) * 4;
        for (let x = 0; x < side; x++, p++) {
          const v = next[p];
          if (v === target[p]) continue;
          if (shown[p] === target[p]) due[p] = now + LAND_FADE_MS * BAYER4[bay + ((this.ox + x) & 3)];
          target[p] = v;
          if (x < x0) x0 = x;
          if (x >= x1) x1 = x + 1;
          if (y < y0) y0 = y;
          y1 = y + 1;
        }
      }
      if (x1 === 0) return;
      if (this.settled) {
        this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1;
      } else {
        this.x0 = Math.min(this.x0, x0); this.y0 = Math.min(this.y0, y0);
        this.x1 = Math.max(this.x1, x1); this.y1 = Math.max(this.y1, y1);
      }
      this.settled = false;
    }

    /** Take every pixel whose moment has come; true when the picture changed. */
    step(now: number): boolean {
      if (this.settled) return false;
      const { shown, target, due, side } = this;
      let changed = false;
      let x0 = side, y0 = side, x1 = 0, y1 = 0;
      for (let y = this.y0; y < this.y1; y++) {
        for (let x = this.x0, p = y * side + x; x < this.x1; x++, p++) {
          if (shown[p] === target[p]) continue;
          if (due[p] <= now) { shown[p] = target[p]; changed = true; continue; }
          if (x < x0) x0 = x;
          if (x >= x1) x1 = x + 1;
          if (y < y0) y0 = y;
          y1 = y + 1;
        }
      }
      this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1;
      this.settled = x1 === 0;
      return changed;
    }
  }
}
