/* =============================================================================
 * SimEarth 2.0 — what moves on the composed terrain
 * -----------------------------------------------------------------------------
 * When the compositor has finished a rectangle of tiles, it hands the index
 * buffer here once. Two things are read off it:
 *   - surf: the baked foam line off every coast (ring 1) and the four water
 *     rows beyond it (rings 2 to 5; the ambient swell uses 1–3), each pixel with the colour it takes
 *     when the swell reaches it, its phase on a smooth field along the coast
 *     and a hash threshold. Coasts of ice and snow — sea ice, glaciers —
 *     have no surf.
 *   - river: a bit mask of the river water that still shows after banks,
 *     objects and lifted ranges.
 * watermotion.ts animates both in the frame; the composed picture never
 * changes.
 * ========================================================================== */

namespace SE {
  /** Lattice of the surf phase field, px; must divide the world's width. */
  const PHASE_CELL = 64;
  /** Most cycles the phase changes between two lattice points: neighbours pulse almost together, distant coasts apart. */
  const PHASE_SPREAD = 1.6;
  /** Phase units per cycle in the packed surf word. */
  export const SURF_PHASE_STEPS = 128;

  export interface LandMotion {
    /** Width of the composed tiles, art px (the river mask's row length). */
    readonly w: number;
    /** Per surf pixel: x | y << 16, art px from the tiles' top left. */
    readonly surfAt: Uint32Array;
    /** Per surf pixel: palette index | ring << 8 | phase << 16 (1/SURF_PHASE_STEPS cycle) | threshold << 24 (1/256). */
    readonly surf: Uint32Array;
    /** One bit per art pixel, row-major, set where river water shows; null where no river runs. */
    readonly river: Uint32Array | null;
    /** Per art pixel, row-major: the palette index composed where the sea shows, 0 elsewhere; null where no sea shows. */
    readonly sea: Uint8Array | null;
  }

  export const NO_LAND_MOTION: LandMotion = { w: 0, surfAt: new Uint32Array(0), surf: new Uint32Array(0), river: null, sea: null };

  let rings = new Uint8Array(0);
  let atOut = new Uint32Array(0);
  let infoOut = new Uint32Array(0);
  /** 1 where a palette index belongs to the ice ramp, per atlas. */
  const iceOf = new WeakMap<LandArt, Uint8Array>();

  /** The surf phase field, in cycles: bilinear between hashed lattice points, wrapping in X. */
  class SurfPhase {
    private cell = NaN;
    private readonly corner = new Float32Array(4);

    at(x: number, y: number): number {
      const n = (GRID_W * 16) / PHASE_CELL;
      const fx = x / PHASE_CELL;
      const fy = y / PHASE_CELL;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const c = this.corner;
      // A coast's pixels come in runs: the corners of the last cell are usually the ones needed.
      if (y0 * n + x0 !== this.cell) {
        this.cell = y0 * n + x0;
        const xa = ((x0 % n) + n) % n;
        const xb = (xa + 1) % n;
        c[0] = landHash(xa, y0, 401); c[1] = landHash(xb, y0, 401);
        c[2] = landHash(xa, y0 + 1, 401); c[3] = landHash(xb, y0 + 1, 401);
      }
      return PHASE_SPREAD * lerp(lerp(c[0], c[1], fx - x0), lerp(c[2], c[3], fx - x0), fy - y0);
    }
  }

  /**
   * Surf and river water of tiles [tx0, tx0 + tw) × [ty0, ty0 + th), composed
   * into `b` from `pad` pixels in. Only the parts of the buffer that can hold
   * them are read: the cells `shores` lists (buffer offsets of the cells
   * where water meets ground) and the tiles next to a river line (`lines`,
   * RiverPaths.sig).
   */
  export function collectLandMotion(
    b: LandBuffer, art: LandArt, shores: readonly number[], lines: Uint16Array,
    pad: number, tx0: number, ty0: number, tw: number, th: number,
  ): LandMotion {
    const { px, water, w, h } = b;
    const iw = tw * 16;
    const ih = th * 16;
    if (rings.length < w * h) rings = new Uint8Array(w * h);
    const foam = art.water[art.water.length - 1];
    const isWater = art.isWater;
    let ice = iceOf.get(art);
    if (!ice) {
      ice = new Uint8Array(256);
      for (const i of art.manifest.ramps.ice) ice[i] = 1;
      iceOf.set(art, ice);
    }
    const isIce = ice;
    const iced = (o: number): boolean => water[o] === 0 && isIce[px[o]] === 1;
    // In shallow water the foam band is two pixels wide: look as far for ice.
    const icedNear = (o: number): boolean => iced(o - 1) || iced(o + 1) || iced(o - w) || iced(o + w) ||
      iced(o - 2) || iced(o + 2) || iced(o - 2 * w) || iced(o + 2 * w) ||
      iced(o - w - 1) || iced(o - w + 1) || iced(o + w - 1) || iced(o + w + 1);
    const front: number[] = [];
    // Ring 1 four pixels around the tiles too, so the outer rings reach their edge.
    const x0 = Math.max(1, pad - 4);
    const x1 = Math.min(w - 1, pad + iw + 4);
    const y0 = Math.max(1, pad - 4);
    const y1 = Math.min(h - 1, pad + ih + 4);
    for (const base of shores) {
      // The shore pass reaches two pixels past its cell.
      const cx = base % w;
      const cy = (base / w) | 0;
      const xa = Math.max(x0, cx - 2);
      const xb = Math.min(x1, cx + 18);
      for (let y = Math.max(y0, cy - 2); y < Math.min(y1, cy + 18); y++) {
        for (let x = xa, o = y * w + xa; x < xb; x++, o++) {
          if (water[o] !== 1 || px[o] !== foam || rings[o] !== 0) continue;
          if (icedNear(o)) continue;
          rings[o] = 1;
          front.push(o);
        }
      }
    }
    let sea: Uint8Array | null = null;
    for (let y = 0; y < ih; y++) {
      for (let x = 0, o = (pad + y) * w + pad; x < iw; x++, o++) {
        if (water[o] !== 1) continue;
        sea = sea ?? new Uint8Array(iw * ih);
        sea[y * iw + x] = px[o];
      }
    }
    let river: Uint32Array | null = null;
    for (let ty = 0; ty < th; ty++) {
      for (let tx = 0; tx < tw; tx++) {
        // A river line bends at most into the next tile.
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) {
          const row = clampY(ty0 + ty + dy) * GRID_W;
          for (let dx = -1; dx <= 1; dx++) if (lines[row + wrapX(tx0 + tx + dx)] !== 0) { near = true; break; }
        }
        if (!near) continue;
        for (let ly = ty * 16; ly < ty * 16 + 16; ly++) {
          for (let lx = tx * 16, o = (pad + ly) * w + pad + lx; lx < tx * 16 + 16; lx++, o++) {
            if (water[o] !== 2 || isWater[px[o]] === 0) continue;
            river = river ?? new Uint32Array(Math.ceil((iw * ih) / 32));
            const bit = ly * iw + lx;
            river[bit >>> 5] |= 1 << (bit & 31);
          }
        }
      }
    }
    // Rings 2 to 5: open water next to the ring before, inside the buffer's one-pixel frame.
    const grow = (n: number, ring: number): void => {
      const nx = n % w;
      if (nx < 1 || nx >= w - 1 || n < w || n >= w * (h - 1)) return;
      if (water[n] !== 1 || rings[n] !== 0 || isWater[px[n]] === 0 || px[n] === foam) return;
      rings[n] = ring;
      front.push(n);
    };
    for (let ring = 2, from = 0; ring <= 5; ring++) {
      const to = front.length;
      for (let k = from; k < to; k++) {
        const o = front[k];
        grow(o - 1, ring);
        grow(o + 1, ring);
        grow(o - w, ring);
        grow(o + w, ring);
      }
      from = to;
    }
    if (atOut.length < front.length) {
      atOut = new Uint32Array(front.length * 2);
      infoOut = new Uint32Array(front.length * 2);
    }
    let n = 0;
    const phaseAt = new SurfPhase();
    const recede = art.shift[LAND_SHIFT_MAX - 1][foam];
    const lighter = art.shift[LAND_SHIFT_MAX + 1];
    for (const o of front) {
      const ring = rings[o];
      rings[o] = 0;
      const x = (o % w) - pad;
      const y = ((o / w) | 0) - pad;
      if (x < 0 || y < 0 || x >= iw || y >= ih) continue;
      const color = ring === 1 ? recede : ring === 2 ? foam : lighter[px[o]];
      if (color === px[o]) continue;
      const wx = tx0 * 16 + x;
      const wy = ty0 * 16 + y;
      const phase = Math.round(phaseAt.at(wx, wy) * SURF_PHASE_STEPS) % 256;
      const threshold = Math.floor(landHash(wx, wy, 402) * 256);
      atOut[n] = x | (y << 16);
      infoOut[n++] = color | (ring << 8) | (phase << 16) | (threshold << 24);
    }
    return { w: iw, surfAt: atOut.slice(0, n), surf: infoOut.slice(0, n), river, sea };
  }
}
