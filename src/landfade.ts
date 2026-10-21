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
 * Freezing and thawing sea ice dissolve the same way with their own timing
 * (landice.ts): a pixel may show a thin-ice colour (`via`) for a while
 * before its moment.
 * ========================================================================== */

namespace SE {
  /** How long a changed pixel may wait, ms. */
  export const LAND_FADE_MS = 220;

  /** Filled by a LandFadeTiming for one pixel: its moment, and what it shows from `viaAt` until then (0: nothing new). */
  export interface LandFadeSlot { due: number; via: number; viaAt: number }
  /** Timing of a pixel at world art pixel (wx, wy) about to change from `from` to `to` (RGBA words). */
  export type LandFadeTiming = (wx: number, wy: number, from: number, to: number, now: number, out: LandFadeSlot) => void;

  export class LandFade {
    readonly image: ImageData;
    /** What the chunk canvas shows (the image's pixels). */
    private readonly shown: Uint32Array;
    /** The latest composition. */
    private readonly target: Uint32Array;
    /** When each pixel that still differs takes its target, performance.now() ms. */
    private readonly due: Float32Array;
    /** The colour a pixel shows from viaAt until its moment, 0 for none; made on the first timing that uses it. */
    private via: Uint32Array | null = null;
    private viaAt: Float32Array | null = null;
    private readonly slot: LandFadeSlot = { due: 0, via: 0, viaAt: 0 };
    /** No pixel differs any more. */
    settled = true;
    /** Nothing changes on the picture before this, performance.now() ms. */
    next = Infinity;
    /** Bounding box of the pixels that still differ, [x0, x1) × [y0, y1) in canvas pixels. */
    x0 = 0; y0 = 0; x1 = 0; y1 = 0;

    /** `current`: the chunk's canvas as it is, `side` × `side`; `origin`: world art pixel of its corner (x, y). */
    constructor(current: ImageData, private readonly side: number, private readonly ox: number, private readonly oy: number) {
      this.image = current;
      this.shown = new Uint32Array(current.data.buffer);
      this.target = this.shown.slice();
      this.due = new Float32Array(this.shown.length);
    }

    /** A new composition of the chunk: its changed pixels start (or keep) their way over; `timing` replaces the brush's. */
    retarget(next: Uint32Array, now: number, timing: LandFadeTiming | null = null): void {
      const { shown, target, due, side, slot } = this;
      const n = shown.length;
      let x0 = side, y0 = side, x1 = 0, y1 = 0;
      let soon = Infinity;
      for (let y = 0, p = 0; y < side; y++) {
        const bay = ((this.oy + y) & 3) * 4;
        for (let x = 0; x < side; x++, p++) {
          const v = next[p];
          if (v === target[p]) continue;
          if (shown[p] === target[p]) {
            if (timing) {
              slot.via = 0;
              timing(this.ox + x, this.oy + y, shown[p], v, now, slot);
              due[p] = slot.due;
              if (slot.via !== 0) {
                (this.via ??= new Uint32Array(n))[p] = slot.via;
                (this.viaAt ??= new Float32Array(n))[p] = slot.viaAt;
                if (slot.viaAt < soon) soon = slot.viaAt;
              } else if (this.via) this.via[p] = 0;
            } else {
              due[p] = now + LAND_FADE_MS * BAYER4[bay + ((this.ox + x) & 3)];
              if (this.via) this.via[p] = 0;
            }
            if (due[p] < soon) soon = due[p];
          }
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
        this.next = soon;
      } else {
        this.x0 = Math.min(this.x0, x0); this.y0 = Math.min(this.y0, y0);
        this.x1 = Math.max(this.x1, x1); this.y1 = Math.max(this.y1, y1);
        this.next = Math.min(this.next, soon);
      }
      this.settled = false;
    }

    /** Take every pixel whose moment has come; true when the picture changed. */
    step(now: number): boolean {
      if (this.settled || now < this.next) return false;
      const { shown, target, due, side, via, viaAt } = this;
      let changed = false;
      let next = Infinity;
      let x0 = side, y0 = side, x1 = 0, y1 = 0;
      for (let y = this.y0; y < this.y1; y++) {
        for (let x = this.x0, p = y * side + x; x < this.x1; x++, p++) {
          if (shown[p] === target[p]) continue;
          const d = due[p];
          if (d <= now) { shown[p] = target[p]; changed = true; continue; }
          if (via !== null && viaAt !== null && via[p] !== 0) {
            if (viaAt[p] > now) {
              if (viaAt[p] < next) next = viaAt[p];
            } else if (shown[p] !== via[p]) {
              shown[p] = via[p];
              changed = true;
            }
          }
          if (d < next) next = d;
          if (x < x0) x0 = x;
          if (x >= x1) x1 = x + 1;
          if (y < y0) y0 = y;
          y1 = y + 1;
        }
      }
      this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1;
      this.settled = x1 === 0;
      this.next = next;
      return changed;
    }
  }
}
