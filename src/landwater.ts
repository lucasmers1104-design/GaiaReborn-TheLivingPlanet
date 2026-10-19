/* =============================================================================
 * SimEarth 2.0 — water in the pixel terrain: sea and shore
 * -----------------------------------------------------------------------------
 * The compositor's sea and shore passes, on its index buffer (landcompose.ts):
 *   - sea: two flat classes, open ocean and coastal sea, each with its ripple;
 *     at the shelf edge a 3–4 px ordered dither between them, and over the
 *     first open-ocean tile a fade along the shelf ramp. The main map
 *     shows no depth (the depth views do). Lagoons (reefs.ts) mix in
 *     turquoise by an ordered dither: a quarter, a half or all of it;
 *   - reef edge: an interrupted foam line where waves break on a reef's
 *     open-sea side;
 *   - shore: beach sand where reefs.ts lays a beach (landshore.ts), then a
 *     foam line and a lighter band on the water side, a wet rim (one ramp
 *     step darker) on the ground side, wherever the dual grid put water next
 *     to ground — coasts, lakes and sea ice alike.
 * Rivers are drawn as lines in landrivers.ts.
 * ========================================================================== */

namespace SE {
  /** The compositor's index buffer: palette indices, and 1 sea / 2 river / 0 ground per pixel. */
  export interface LandBuffer { px: Uint8Array; water: Uint8Array; w: number; h: number }

  /** The dual grid reaches half a tile beyond the composed tiles on every side. */
  export const LAND_PAD = 8;
  /** Pixel centres across a cell, 0..1. */
  export const LAND_CENTER = Float32Array.from({ length: 16 }, (_, k) => (k + 0.5) / 16);
  export const LAND_BAYER_MIN = 0.5 / 16;
  export const LAND_BAYER_MAX = 15.5 / 16;
  /** Water ramp steps of the open ocean and the coastal sea, and the lagoon's step on waterWarm. */
  export const SEA_OCEAN_STEP = 2;
  export const SEA_COAST_STEP = 4;
  export const SEA_LAGOON_STEP = 1;
  /** Pixels over which the shelf edge dithers from open ocean into coastal sea. */
  const SHELF_BAND = 3.5;
  /** Share of a reef's open-sea edge pixels that show foam. */
  const REEF_FOAM = 0.5;
  const WORLD_PX = GRID_W * 16;

  /** Whole steps stay flat; only the middle `band` of each step blends into the next. */
  export function landTerrace(v: number, band: number): number {
    const n = Math.floor(v);
    const f = v - n - (0.5 - band / 2);
    return n + (f <= 0 ? 0 : f >= band ? 1 : f / band);
  }

  /** Share of a pixel's lagoon level (0..3, bilinear) that turns turquoise: a quarter, a half, all. */
  function lagoonShare(g: number): number {
    return g <= 2 ? g * 0.25 : 0.5 + (g - 2) * 0.5;
  }

  function bilinear(a: number, b: number, c: number, d: number, u: number, v: number): number {
    const top = a + (b - a) * u;
    return top + (c + (d - c) * u - top) * v;
  }

  /**
   * A corner's shelf level: 2 coastal sea (land counts), 1 open ocean beside
   * it (8 neighbours), 0 open ocean. Read from the neighbours at paint time:
   * the chunk signature already covers them (SIGNATURE_REACH).
   */
  function shelfLevel(S: Uint8Array, c: number): number {
    if (S[c] === 1) return 2;
    const x = c % GRID_W;
    const y = (c - x) / GRID_W;
    for (let dy = -1; dy <= 1; dy++) {
      const row = clampY(y + dy) * GRID_W;
      for (let dx = -1; dx <= 1; dx++) if (S[row + wrapX(x + dx)] === 1) return 1;
    }
    return 0;
  }

  /**
   * One display cell of sea (through `mask` when it is not the cell's lowest
   * layer). Returns whether a corner is a reef: then `reefBits` holds per
   * pixel 1 inside the reef and 2 on open water (neither reef nor lagoon),
   * for paintReefEdges.
   */
  export function paintSea(
    b: LandBuffer, art: LandArt, f: TerrainField, c0: number, c1: number, c2: number, c3: number,
    mask: Uint8Array | null, base: number, wx: number, wy: number, reefBits: Uint8Array,
  ): boolean {
    const { px, water, w } = b;
    const ramp = art.water;
    const top = ramp[ramp.length - 1];
    const S = f.sea;
    const G = f.lagoon;
    const s0 = shelfLevel(S, c0), s1 = shelfLevel(S, c1), s2 = shelfLevel(S, c2), s3 = shelfLevel(S, c3);
    const g0 = G[c0], g1 = G[c1], g2 = G[c2], g3 = G[c3];
    // Most of the sea: one class over the whole cell, away from the shelf edge, and no lagoon.
    if (s0 === s1 && s1 === s2 && s2 === s3 && s0 !== 1 && (g0 | g1 | g2 | g3) === 0) {
      const flat = s0 === 2 ? SEA_COAST_STEP : SEA_OCEAN_STEP;
      const rip = s0 === 2 ? art.rippleCoast : art.rippleOcean;
      const rw = rip.size - 1;
      // The flat colour and its two ripple steps.
      const c0 = ramp[flat];
      const c1 = ramp[Math.min(LAND_SHALLOW, flat + 1)];
      const c2 = ramp[Math.min(LAND_SHALLOW, flat + 2)];
      for (let ly = 0; ly < 16; ly++) {
        const row = ((wy + ly) & rw) * rip.size;
        let o = base + ly * w;
        for (let lx = 0; lx < 16; lx++, o++) {
          if (mask && mask[ly * 16 + lx] === 0) continue;
          const r = rip.px[row + ((wx + lx) & rw)];
          px[o] = r === 0 ? c0 : r === top ? c2 : c1;
          water[o] = 1;
        }
      }
      return false;
    }
    const warm = art.waterWarm;
    const warmTop = warm.length - 1;
    // Locals, not SE lookups: this runs for every pixel of the cell.
    const center = LAND_CENTER;
    const bayer = BAYER4;
    const shallow = LAND_SHALLOW;
    const coastStep = SEA_COAST_STEP;
    const oceanStep = SEA_OCEAN_STEP;
    const lagoonStep = SEA_LAGOON_STEP;
    const shelf = art.shelf;
    const shelfN = shelf.length;
    const rc = art.rippleCoast;
    const ro = art.rippleOcean;
    const R = f.reef;
    const reef = (R[c0] | R[c1] | R[c2] | R[c3]) !== 0;
    const r0 = R[c0] ? 1 : 0, r1 = R[c1] ? 1 : 0, r2 = R[c2] ? 1 : 0, r3 = R[c3] ? 1 : 0;
    const open = (c: number): number => (f.key[c] === 0 && R[c] === 0 && G[c] === 0 ? 1 : 0);
    const o0 = open(c0), o1 = open(c1), o2 = open(c2), o3 = open(c3);
    for (let ly = 0; ly < 16; ly++) {
      const y = wy + ly;
      const v = center[ly];
      const bay = (y & 3) * 4;
      let o = base + ly * w;
      for (let lx = 0; lx < 16; lx++, o++) {
        if (mask && mask[ly * 16 + lx] === 0) continue;
        const x = wx + lx;
        const u = center[lx];
        const t = bayer[bay + (x & 3)];
        // The shelf edge (level 1.5) dithers over SHELF_BAND px (unclamped: only its comparison with t counts).
        const d = bilinear(s0, s1, s2, s3, u, v);
        const coast = (d - 1.5) * (16 / SHELF_BAND) + 0.5 > t;
        const lagoon = lagoonShare(bilinear(g0, g1, g2, g3, u, v)) > t;
        const rip = lagoon || coast ? rc : ro;
        const r = rip.px[(y & (rip.size - 1)) * rip.size + (x & (rip.size - 1))];
        const up = r === 0 ? 0 : r === top ? 2 : 1;
        if (lagoon) px[o] = warm[Math.min(warmTop, lagoonStep + up)];
        else if (coast || d <= 0.5) px[o] = ramp[Math.min(shallow, (coast ? coastStep : oceanStep) + up)];
        else {
          // The first open-ocean tile: the shelf ramp from its far side (level 0.5) up to the edge (1.5),
          // dithered only between neighbouring shades; its ripple a step lighter on the brighter half.
          const k = Math.floor(Math.min(1, d - 0.5) * shelfN + t);
          px[o] = up !== 0 ? ramp[Math.min(shallow, oceanStep + up + (k * 2 > shelfN ? 1 : 0))] : k === 0 ? ramp[oceanStep] : shelf[k - 1];
        }
        water[o] = 1;
        if (reef) reefBits[o] = (bilinear(r0, r1, r2, r3, u, v) >= 0.5 ? 1 : 0) | (bilinear(o0, o1, o2, o3, u, v) >= 0.5 ? 2 : 0);
      }
    }
    return reef;
  }

  /**
   * Waves break on a reef's open-sea side: foam on about REEF_FOAM of the
   * reef's sea pixels beside open water, in the cells `cells` lists (buffer
   * offsets of cells with a reef corner; `reefBits` from paintSea), the
   * buffer's pixel (0, 0) at world (ox, oy). Drawn after the objects, so the
   * line runs over the corals.
   */
  export function paintReefEdges(b: LandBuffer, art: LandArt, cells: readonly number[], reefBits: Uint8Array, ox: number, oy: number): void {
    const { px, water, w, h } = b;
    const foam = art.water[art.water.length - 1];
    const outside = (o: number): boolean => (reefBits[o] & 3) === 2;
    for (const base of cells) {
      const cx = base % w;
      const cy = (base / w) | 0;
      const x0 = Math.max(1, cx);
      const x1 = Math.min(w - 1, cx + 16);
      for (let y = Math.max(1, cy); y < Math.min(h - 1, cy + 16); y++) {
        for (let x = x0, o = y * w + x0; x < x1; x++, o++) {
          if ((reefBits[o] & 1) === 0 || water[o] !== 1) continue;
          if (!outside(o - 1) && !outside(o + 1) && !outside(o - w) && !outside(o + w)) continue;
          // Hashed at the wrapped x, so chunks on both sides of the date line agree.
          if (landHash((((ox + x) % WORLD_PX) + WORLD_PX) % WORLD_PX, oy + y, 1611) < REEF_FOAM) px[o] = foam;
        }
      }
    }
  }

  /**
   * Foam on the first water pixel, lighter water on the second, a wet rim on
   * the ground, around every cell listed in `shores` (buffer offsets).
   * Bit 1 of `done` keeps a pixel from being shaded twice by two neighbouring cells.
   */
  export function paintShore(b: LandBuffer, art: LandArt, shores: readonly number[], done: Uint8Array): void {
    const { px, water, w, h } = b;
    const foam = art.water[art.water.length - 1];
    const lighter = art.shift[LAND_SHIFT_MAX + 1];
    const wet = art.shift[LAND_SHIFT_MAX - 1];
    for (const base of shores) {
      const x0 = Math.max(2, (base % w) - 2);
      const y0 = Math.max(2, ((base / w) | 0) - 2);
      const x1 = Math.min(w - 2, (base % w) + 18);
      const y1 = Math.min(h - 2, ((base / w) | 0) + 18);
      for (let y = y0; y < y1; y++) {
        for (let x = x0, o = y * w + x0; x < x1; x++, o++) {
          if ((done[o] & 1) !== 0) continue;
          done[o] |= 1;
          if (water[o] !== 0) {
            if (!water[o - 1] || !water[o + 1] || !water[o - w] || !water[o + w]) px[o] = foam;
            else if (!water[o - 2] || !water[o + 2] || !water[o - 2 * w] || !water[o + 2 * w] ||
              !water[o - w - 1] || !water[o - w + 1] || !water[o + w - 1] || !water[o + w + 1]) px[o] = lighter[px[o]];
          } else if (water[o - 1] || water[o + 1] || water[o - w] || water[o + w]) {
            px[o] = wet[px[o]];
          }
        }
      }
    }
  }
}
