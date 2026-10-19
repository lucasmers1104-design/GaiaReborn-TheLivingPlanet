/* =============================================================================
 * SimEarth 2.0 — the objects of the coast: reef patches and palms
 * -----------------------------------------------------------------------------
 * Placed with the other objects (landobjects.ts), from hashes and the dual
 * grid only, so every chunk places them alike:
 *   - a reef tile (reefs.ts) shows 3–4 coral patches, some of them the light
 *     sand its fish ground out; drawn under the water's ripples;
 *   - palms stand on the dry sand of a beach (landshore.ts), their crowns
 *     leaning over the sea; nothing else grows on the sand.
 * ========================================================================== */

namespace SE {
  /** Coconut palms' slots 12–13: the plants of a beach tile stand off its sand. */
  const PALM_SLOT = 12;
  /** A foot stands this many px from the sea: dry sand 1–2 px behind the wet line (the pixels touching the water). */
  const PALM_BACK = [2, 3];
  /** Rows of its tile a palm tries (px from the tile's top), in an order its hash rotates: a coast is rarely straight. */
  const PALM_ROWS = [6, 10, 3, 13, 8, 4, 12, 2, 9, 5, 11, 7];
  /** Crown over the water, px. */
  const PALM_OVERHANG_MIN = 3;
  const PALM_OVERHANG_MAX = 6;
  /** A pair's second palm stands this many px (and more by hash, up to +2) along the shore from the first. */
  const PALM_PAIR_GAP = 4;
  /** The second palm of a pair: the size whose sprite is 3 px shorter or taller (l 20, m 17 px; s has none). */
  const PALM_PARTNER: Readonly<Record<string, readonly string[]>> = { l: ['m'], m: ['l'], s: [] };
  /** Where a palm row looks for the sea: from this far behind the tile's centre, this far towards the sea. */
  const PALM_SEARCH_BACK = 8;
  const PALM_SEARCH = 32;

  /**
   * The coral patches of a reef tile, and the light sand patches its fish
   * ground out of it, over a jittered 2×2 pattern.
   */
  export function placeLandReef(f: TerrainField, art: LandArt, xw: number, x: number, y: number, out: LandPlacement[]): void {
    const i = y * GRID_W + xw;
    const coral = f.reef[i] === CoralKind.Stony ? 'coral_stony' : 'coral_rugose';
    const sands = f.sands[i];
    const turn = Math.floor(landHash(xw, y, 1620) * 4);
    for (let s = 0; s < f.corals[i] + sands; s++) {
      const vars = art.sprites[s < sands ? 'reef_sand' : coral];
      if (!vars) continue;
      const sprite = vars[Math.floor(landHash(xw, y, 1610 + s) * vars.length)];
      const p = (s + turn) % 4;
      const cx = x * 16 + 4 + (p % 2) * 8 + Math.floor((landHash(xw, y, 1630 + s) - 0.5) * 4);
      const cy = y * 16 + 4 + (p >> 1) * 8 + Math.floor((landHash(xw, y, 1640 + s) - 0.5) * 4);
      out.push({ sprite, fx: cx, fy: cy - (sprite.h >> 1) + sprite.ay, water: true, seq: i * 16 + s });
    }
  }

  /**
   * Coconut palms on a beach tile: each foot on the dry sand of its own row,
   * 1–2 px behind the wet line where the strip is at least 2 px wide, the
   * crown leaning to the sea and reaching 3–6 px over the water (form 0
   * curves left, 1 right). A pair stands 4–6 px apart along the shore, a
   * tall palm and a younger one 3 px lower. Rows with no fit carry none.
   */
  export function placeLandPalms(f: TerrainField, art: LandArt, xw: number, x: number, y: number, n: number, out: LandPlacement[]): void {
    let sx = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= GRID_H) continue;
      for (let dx = -1; dx <= 1; dx++) if (f.key[ny * GRID_W + wrapX(xw + dx)] === 0) sx += dx;
    }
    const dirs = sx !== 0 ? [Math.sign(sx)] : landHash(xw, y, 961) < 0.5 ? [-1, 1] : [1, -1];
    const vars = art.sprites.coconut_palm;
    const i = y * GRID_W + xw;
    const sizes = landHash(xw, y, 962) < 0.5 ? ['l', 'm', 's'] : ['m', 'l', 's'];
    let first: { fy: number; size: string } | null = null;
    for (let s = 0; s < n; s++) {
      const gap = PALM_PAIR_GAP + Math.floor(landHash(xw, y, 963) * 3);
      const turn = Math.floor(landHash(xw, y, 964) * PALM_ROWS.length);
      const rows = first ? [first.fy + (first.fy - y * 16 < 8 ? gap : -gap)] : PALM_ROWS.map((_, k) => y * 16 + PALM_ROWS[(k + turn) % PALM_ROWS.length]);
      const own = first ? PALM_PARTNER[first.size] : sizes;
      const flip = landHash(xw, y, 965 + s) < 0.5;
      let at: { fx: number; sprite: LandSprite } | null = null;
      let fy = 0;
      for (const row of rows) {
        for (const dir of dirs) {
          at = palmFoot(f, art, x * 16 + 8, row, dir, own.map((size) => vars.find((v) => v.size === size && v.form === (dir < 0 ? 0 : 1))), flip);
          if (at) { fy = row; break; }
        }
        if (at) break;
      }
      if (!at) return;
      out.push({ sprite: at.sprite, fx: at.fx, fy, water: false, seq: i * 16 + PALM_SLOT + s });
      first = { fy, size: at.sprite.size };
    }
  }

  /**
   * A palm's foot on row fy, walking from the tile's centre cx to the first
   * sea pixel in direction dir, then PALM_BACK px back onto dry sand of a
   * strip at least 2 px wide; the first of `sprites` whose crown then reaches
   * PALM_OVERHANG_MIN..MAX px over the water. Null where none fits.
   */
  function palmFoot(f: TerrainField, art: LandArt, cx: number, fy: number, dir: number, sprites: (LandSprite | undefined)[], flip: boolean): { fx: number; sprite: LandSprite } | null {
    let x = cx - dir * PALM_SEARCH_BACK;
    if (landSeaAt(f, art, x, fy)) return null;
    let found = false;
    for (let k = 0; k < PALM_SEARCH && !found; k++) {
      x += dir;
      found = landSeaAt(f, art, x, fy);
    }
    if (!found) return null;
    for (const back of flip ? [PALM_BACK[1], PALM_BACK[0]] : PALM_BACK) {
      const fx = x - dir * back;
      // The foot stays on its own tile: the compositor places objects one tile around a chunk.
      if (fx < cx - 8 || fx > cx + 7) continue;
      const d = landBeachAt(f, art, fx, fy);
      // Off the wet line (the pixels touching the water), not further than the strip's dry sand.
      if (d <= 1 || d > PALM_BACK[1] + 0.5 || landBeachWidthAt(f, art, fx, fy) < 2) continue;
      for (const sprite of sprites) {
        if (!sprite) continue;
        const over = crownOverWater(f, art, sprite, fx, fy, dir);
        if (over >= PALM_OVERHANG_MIN && over <= PALM_OVERHANG_MAX) return { fx, sprite };
      }
    }
    return null;
  }

  /** How far (px) a sprite standing at (fx, fy) reaches over the sea in direction dir: the most of any row. */
  function crownOverWater(f: TerrainField, art: LandArt, t: LandSprite, fx: number, fy: number, dir: number): number {
    let most = 0;
    for (let sy = 0; sy < t.h; sy++) {
      let edge = -1;
      for (let sx = 0; sx < t.w; sx++) {
        if (t.px[sy * t.w + sx] === 0) continue;
        if (edge < 0 || (dir < 0 ? sx < edge : sx > edge)) edge = sx;
      }
      if (edge < 0) continue;
      const wy = fy - t.ay + sy;
      let x = fx - t.ax + edge;
      let k = 0;
      while (k <= PALM_OVERHANG_MAX && landSeaAt(f, art, x, wy)) { k++; x -= dir; }
      most = Math.max(most, k);
    }
    return most;
  }

  /** A plant or rock with its foot on beach sand: only palms stand there. */
  export function landObjectOnBeach(f: TerrainField, art: LandArt, p: LandPlacement): boolean {
    if (p.water || p.sprite.id === 'coconut_palm') return false;
    return landBeachNear(f, Math.floor(p.fx / 16), Math.floor(p.fy / 16)) && landBeachAt(f, art, p.fx, p.fy) > 0;
  }
}
