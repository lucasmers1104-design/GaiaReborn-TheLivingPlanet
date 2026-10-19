/* =============================================================================
 * SimEarth 2.0 — beaches on the pixel terrain
 * -----------------------------------------------------------------------------
 * A beach is a detail of the shore, not a ground of its own: a strip of beach
 * sand (dry sand with ripples and shells, the shore pass's wet line on its
 * sea side) along the water's edge of the tiles reefs.ts marks. Beside a
 * reef it is 2–4 px wide, up to 5 in a bay and 1 or none on a headland; a
 * shell beach 1–3 px. The width drifts with soft noise along the coast and
 * frays on the land side.
 *
 * Every input is a function of world pixels: the beach kinds of the dual
 * cell's land corners, noise, and the sea within SHORE_REACH px. The
 * compositor reads that sea off its buffer (all of the disk lies inside it
 * for every pixel it shows); palms and the plants kept off the sand read it
 * off the dual grid itself (landSeaAt), which gives the same pixels. So
 * chunks join without a seam.
 * ========================================================================== */

namespace SE {
  /** Radius (px) of the disk read around a land pixel: its nearest sea, and how much sea lies near. */
  export const SHORE_REACH = 6;
  /** Strip width (px) by BeachKind before noise, and the widest it gets (in a bay). */
  const BEACH_BASE = [0, 2, 3];
  const BEACH_MAX = [0, 3, 5];
  /** Width gained per unit of missing sea in a bay (against a straight coast), lost per unit of extra sea on a headland. */
  const BAY_GAIN = 2.5;
  const HEADLAND_LOSS = 2.5;
  /** Period (px) of the width noise along the coast, ± this many px. */
  const WIDTH_PERIOD = 32;
  const WIDTH_SWING = 1;
  /** Period (px) and amplitude of the fraying on the land side. */
  const FRAY_PERIOD = 8;
  const FRAY = 0.6;
  const WORLD_PX = GRID_W * 16;

  /** The disk as offsets, nearest first: dx, dy and distance. */
  const DISK_X: number[] = [];
  const DISK_Y: number[] = [];
  const DISK_D: number[] = [];
  (() => {
    const all: [number, number, number][] = [];
    const r = SHORE_REACH;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > 0 && d <= r) all.push([dx, dy, d]);
    }
    all.sort((a, b) => a[2] - b[2]);
    for (const [x, y, d] of all) { DISK_X.push(x); DISK_Y.push(y); DISK_D.push(d); }
  })();
  /** Sea pixels in the disk of a pixel d px from a straight coast, d = 0..SHORE_REACH. */
  const STRAIGHT = Array.from({ length: SHORE_REACH + 1 }, (_, d) => DISK_Y.filter((y) => y >= d).length);

  function straightAt(d: number): number {
    const k = Math.min(SHORE_REACH - 1, Math.floor(d));
    return STRAIGHT[k] + (STRAIGHT[k + 1] - STRAIGHT[k]) * (d - k);
  }

  /** Scratch: the nearest sea (px, Infinity when none in reach) and the sea pixels counted. */
  const NEAR = { d: Infinity, count: 0 };

  /**
   * Width (px) of the beach strip at world pixel (wx, wy), x wrapped, given
   * its nearest sea `d` and the sea pixels `count` in its disk; 0 where the
   * dual cell has no beach corner.
   */
  function beachWidth(f: TerrainField, wx: number, wy: number, d: number, count: number): number {
    const gx = wx - 8;
    const gy = wy - 8;
    const tx = Math.floor(gx / 16);
    const ty = Math.floor(gy / 16);
    const u = (gx - tx * 16 + 0.5) / 16;
    const v = (gy - ty * 16 + 0.5) / 16;
    let base = 0;
    let max = 0;
    let sum = 0;
    for (let c = 0; c < 4; c++) {
      const t = clampY(ty + (c >> 1)) * GRID_W + wrapX(tx + (c & 1));
      if (f.key[t] === 0 || f.seaTile[t] === 1) continue;
      const w = ((c & 1) ? u : 1 - u) * ((c >> 1) ? v : 1 - v);
      base += w * BEACH_BASE[f.beach[t]];
      max += w * BEACH_MAX[f.beach[t]];
      sum += w;
    }
    if (base <= 0) return 0;
    base /= sum;
    max /= sum;
    let width = base + (landOctave(wx, wy, WORLD_PX, WORLD_PX / WIDTH_PERIOD, 1601) - 0.5) * 2 * WIDTH_SWING;
    const rho = count / straightAt(d);
    width += rho < 1 ? (1 - rho) * BAY_GAIN : -(rho - 1) * HEADLAND_LOSS;
    return Math.min(width, max) + (landOctave(wx, wy, WORLD_PX, WORLD_PX / FRAY_PERIOD, 1603) - 0.5) * 2 * FRAY;
  }

  /** Does any of the dual cell's corners around world pixel (wx, wy) carry a beach? */
  function beachCell(f: TerrainField, wx: number, wy: number): boolean {
    const tx = Math.floor((wx - 8) / 16);
    const ty = Math.floor((wy - 8) / 16);
    for (let c = 0; c < 4; c++) if (f.beach[clampY(ty + (c >> 1)) * GRID_W + wrapX(tx + (c & 1))] !== 0) return true;
    return false;
  }

  /**
   * Is world pixel (wx, wy) open sea in the composed map, before rivers?
   * The compositor's dual grid, pixel by pixel: a cell with sea in a corner
   * is sea wherever no land layer's frayed mask covers it.
   */
  export function landSeaAt(f: TerrainField, art: LandArt, wx: number, wy: number): boolean {
    const gx = wx - 8;
    const gy = wy - 8;
    const tx = Math.floor(gx / 16);
    const ty = Math.floor(gy / 16);
    const xa = wrapX(tx);
    const xb = wrapX(tx + 1);
    const ra = clampY(ty) * GRID_W;
    const rb = clampY(ty + 1) * GRID_W;
    const k0 = f.key[ra + xa];
    const k1 = f.key[ra + xb];
    const k2 = f.key[rb + xa];
    const k3 = f.key[rb + xb];
    if (k0 !== 0 && k1 !== 0 && k2 !== 0 && k3 !== 0) return false;
    if (k0 === 0 && k1 === 0 && k2 === 0 && k3 === 0) return true;
    const variant = Math.floor(landHash(xa, ty, 77) * art.masks[0].length);
    const m = (gy - ty * 16) * 16 + (gx - tx * 16);
    for (const v of [k0, k1, k2, k3]) {
      if (v === 0) continue;
      const kase = (k0 >= v ? 1 : 0) | (k1 >= v ? 2 : 0) | (k2 >= v ? 4 : 0) | (k3 >= v ? 8 : 0);
      if (art.masks[kase][variant][m] !== 0) return false;
    }
    return true;
  }

  /** NEAR for world pixel (wx, wy), read off the dual grid. */
  function nearSea(f: TerrainField, art: LandArt, wx: number, wy: number): typeof NEAR {
    NEAR.d = Infinity;
    NEAR.count = 0;
    for (let k = 0; k < DISK_D.length; k++) {
      if (!landSeaAt(f, art, wx + DISK_X[k], wy + DISK_Y[k])) continue;
      if (NEAR.count === 0) NEAR.d = DISK_D[k];
      NEAR.count++;
    }
    return NEAR;
  }

  /**
   * The beach at world pixel (wx, wy), read off the dual grid: its nearest
   * sea (px) when it is beach sand, else 0.
   */
  export function landBeachAt(f: TerrainField, art: LandArt, wx: number, wy: number): number {
    const x = ((wx % WORLD_PX) + WORLD_PX) % WORLD_PX;
    if (wy < 0 || wy >= GRID_H * 16 || !beachCell(f, x, wy) || landSeaAt(f, art, x, wy)) return 0;
    const n = nearSea(f, art, x, wy);
    return n.count > 0 && n.d <= beachWidth(f, x, wy, n.d, n.count) ? n.d : 0;
  }

  /** The strip's width at world pixel (wx, wy) as landBeachAt reads it, for placing palms. */
  export function landBeachWidthAt(f: TerrainField, art: LandArt, wx: number, wy: number): number {
    const x = ((wx % WORLD_PX) + WORLD_PX) % WORLD_PX;
    const n = nearSea(f, art, x, wy);
    return n.count > 0 ? beachWidth(f, x, wy, n.d, n.count) : 0;
  }

  /** A beach corner within a tile of tile (tx, ty), x unwrapped: whether objects there must look for the sand. */
  export function landBeachNear(f: TerrainField, tx: number, ty: number): boolean {
    for (let dy = -1; dy <= 1; dy++) {
      const y = ty + dy;
      if (y < 0 || y >= GRID_H) continue;
      for (let dx = -1; dx <= 1; dx++) if (f.beach[y * GRID_W + wrapX(tx + dx)] !== 0) return true;
    }
    return false;
  }

  /**
   * Beach sand over the ground of the buffer `b` (pixel (0, 0) at world
   * (ox, oy)), around the cells `shores` lists, before the shore pass draws
   * its wet line on it. Pixels nearer the buffer's edge than SHORE_REACH are
   * never shown (the margin is smaller) and stay as they are. `seen` marks
   * the pixels looked at (bit 2).
   */
  export function paintBeaches(b: LandBuffer, art: LandArt, f: TerrainField, ox: number, oy: number, shores: readonly number[], seen: Uint8Array): void {
    const sand = art.beach;
    const { px, water, w, h } = b;
    const r = SHORE_REACH;
    const sw = sand.size - 1;
    const offs = Int32Array.from(DISK_X, (dx, k) => DISK_Y[k] * w + dx);
    for (const base of shores) {
      const cx = base % w;
      const cy = (base / w) | 0;
      const x0 = Math.max(r, cx - r);
      const x1 = Math.min(w - r, cx + 16 + r);
      const y1 = Math.min(h - r, cy + 16 + r);
      for (let y = Math.max(r, cy - r); y < y1; y++) {
        const wy = oy + y;
        for (let x = x0, o = y * w + x0; x < x1; x++, o++) {
          if ((seen[o] & 2) !== 0 || water[o] !== 0) continue;
          seen[o] |= 2;
          const wx = (((ox + x) % WORLD_PX) + WORLD_PX) % WORLD_PX;
          if (!beachCell(f, wx, wy)) continue;
          let d = Infinity;
          let count = 0;
          for (let k = 0; k < offs.length; k++) {
            if (water[o + offs[k]] !== 1) continue;
            if (count === 0) d = DISK_D[k];
            count++;
          }
          if (count === 0 || d > beachWidth(f, wx, wy, d, count)) continue;
          px[o] = sand.px[(wy & sw) * sand.size + (wx & sw)];
        }
      }
    }
  }
}
