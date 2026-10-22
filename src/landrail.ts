/* =============================================================================
 * SimEarth 2.0 — the railway track in the composed landscape
 * -----------------------------------------------------------------------------
 * The one line of railway.ts drawn into the ground like a river, so it scales,
 * lifts with the ranges and sits under the trees of the row below. Per tile
 * the field holds the directions to the line's neighbours and the look of its
 * age (`TerrainField.rail`, part of the tile signature); the compositor draws
 * a curve through the tile — from the edge (or corner) it enters by, round
 * its centre, to the one it leaves by: a quadratic B-spline through the tile
 * centres, smooth across tiles and chunks. Each pixel takes its offset from
 * the nearest curve counted in steps of the curve's major axis, so rails and
 * sleepers are crisp 1-px lines at every angle:
 *   Industrial: wooden sleepers on grey ballast, two steel rails;
 *   Atomic: concrete sleepers on dark ballast;
 *   Information and later: a slim concrete guideway for the maglev.
 * Over water (a river, the sea in a strait) a deck replaces the ballast: a
 * bridge. The ground beside the track's lower right edge takes a shadow.
 * Pure arithmetic over typed arrays, like the rest of the compositor.
 * ========================================================================== */

namespace SE {
  /** Bits 8–9 of `TerrainField.rail`: the look of the track. */
  export const enum RailLook { None = 0, Steam = 1, Concrete = 2, Maglev = 3 }

  export function railLook(era: Tech): RailLook {
    return era >= Tech.Information ? RailLook.Maglev : era >= Tech.Atomic ? RailLook.Concrete : RailLook.Steam;
  }

  /** HAZARD_NX/NY direction (NW N NE W E SW S SE) of a step (dx, dy) ∈ [-1, 1]², −1 for none. */
  const DIR_OF = [0, 1, 2, 3, -1, 4, 5, 6, 7];
  const NX = [-1, 0, 1, -1, 1, -1, 0, 1];
  const NY = [-1, -1, -1, 0, 0, 1, 1, 1];

  /** The direction from tile a to its neighbour b, x wrapping, or −1. */
  export function railDirection(a: number, b: number): number {
    let dx = (b % GRID_W) - (a % GRID_W);
    if (dx > 1) dx -= GRID_W;
    else if (dx < -1) dx += GRID_W;
    const dy = Math.floor(b / GRID_W) - Math.floor(a / GRID_W);
    return Math.abs(dx) > 1 || Math.abs(dy) > 1 ? -1 : DIR_OF[(dy + 1) * 3 + dx + 1];
  }

  const next = new Uint16Array(TILE_COUNT);

  /**
   * The field's rail part from `world.civ.rail`: per tile the directions to
   * the line's neighbours (bits 0–7) and its look (bits 8–9); `mark` gets 1
   * on every tile whose value changed. Cheap: one pass over the grid.
   */
  export function readRailPart(world: WorldState, out: Uint16Array, mark: Uint8Array | null): void {
    next.fill(0);
    const rail = world.civ.rail;
    if (rail && rail.path.length >= 2) {
      const look = railLook(rail.era) << 8;
      const p = rail.path;
      for (let k = 0; k < p.length; k++) {
        if (p[k] < 0 || p[k] >= TILE_COUNT) continue;
        let v = look;
        const a = k > 0 ? railDirection(p[k], p[k - 1]) : -1;
        const b = k + 1 < p.length ? railDirection(p[k], p[k + 1]) : -1;
        if (a >= 0) v |= 1 << a;
        if (b >= 0) v |= 1 << b;
        next[p[k]] = v;
      }
    }
    for (let i = 0; i < TILE_COUNT; i++) {
      if (next[i] === out[i]) continue;
      out[i] = next[i];
      if (mark) mark[i] = 1;
    }
  }

  /* ---------------------------------------------------------- drawing -- */

  /** Segments of a tile's curve. */
  const SEGMENTS = 12;
  /**
   * Art px across from the centre line to the outside of the ballast, and to
   * the rails (the maglev's beam): in rows of pixels along the curve's major
   * axis, rounded, so a straight track is 5 px wide with its rails 1 px off
   * the centre, a diagonal one 7 stripes wide with its rails 2 off; both
   * switch at the same angle.
   */
  const BALLAST = 2.125;
  const GAUGE = 1.275;
  /** Reach of a tile's curve beyond its box, art px: the band, a bridge's girders and the shadow beside it. */
  const SPILL = 5;
  /** Major-axis steps between two sleepers (about), and between two joints of the maglev guideway. */
  const SLEEPER_GAP = 3;
  const JOINT_GAP = 8;

  let dist = new Float32Array(0);
  let along = new Float32Array(0);
  let gap = new Float32Array(0);
  let stamp = new Uint32Array(0);
  /** Per pixel: rows from the centre line, the ballast's outer row and the rails' row, all along the major axis; the look. */
  let ring = new Uint8Array(0);
  let outer = new Uint8Array(0);
  let gauge = new Uint8Array(0);
  let looks = new Uint8Array(0);
  /** Pixels stamped this time, in the order they were first reached. */
  let touched = new Int32Array(0);
  let generation = 0;
  const px0 = new Float32Array(SEGMENTS + 1);
  const py0 = new Float32Array(SEGMENTS + 1);
  const q0 = new Float32Array(SEGMENTS + 1);
  /** The generation, buffer width and box [x0, y0, x1, y1] of the last paintRail that drew track; −1 when it drew none. */
  let painted = -1;
  let paintedW = 0;
  const box = new Int32Array(4);

  function inBand(k: number, gen: number): boolean {
    return stamp[k] === gen && ring[k] <= outer[k];
  }

  /**
   * Draw the track into a compositor buffer whose pixel (0, 0) is world pixel
   * (ox, oy), over its first `rows` rows: after the rivers (it bridges
   * them), before the ranges lift the ground and the objects stand on it.
   */
  export function paintRail(f: TerrainField, b: LandBuffer, art: LandArt, ox: number, oy: number, rows: number): void {
    const rail = f.rail;
    const { px, water, w } = b;
    const h = Math.min(b.h, rows);
    const tx0 = Math.floor((ox - SPILL) / 16);
    const tx1 = Math.floor((ox + w + SPILL) / 16);
    const ty0 = Math.max(0, Math.floor((oy - SPILL) / 16));
    const ty1 = Math.min(GRID_H - 1, Math.floor((oy + h + SPILL) / 16));
    painted = -1;
    let any = false;
    for (let ty = ty0; ty <= ty1 && !any; ty++) for (let tx = tx0; tx <= tx1; tx++) if ((rail[ty * GRID_W + wrapX(tx)] & 0xff) !== 0) { any = true; break; }
    if (!any) return;
    const size = w * b.h;
    if (stamp.length !== size) {
      dist = new Float32Array(size);
      along = new Float32Array(size);
      gap = new Float32Array(size);
      stamp = new Uint32Array(size);
      ring = new Uint8Array(size);
      outer = new Uint8Array(size);
      gauge = new Uint8Array(size);
      looks = new Uint8Array(size);
      touched = new Int32Array(size);
      generation = 0;
    }
    if (++generation === 0xffffffff) { stamp.fill(0); generation = 1; }
    const gen = generation;
    let count = 0;
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const v = rail[ty * GRID_W + wrapX(tx)];
        const mask = v & 0xff;
        if (mask === 0) continue;
        let a = -1;
        let c = -1;
        for (let k = 0; k < 8; k++) if (mask & (1 << k)) { if (a < 0) a = k; else c = k; }
        // Centre on a pixel centre, so a straight track's rows and columns are whole pixels.
        const cx = tx * 16 + 8.5 - ox;
        const cy = ty * 16 + 8.5 - oy;
        const ax = cx + NX[a] * 8;
        const ay = cy + NY[a] * 8;
        // A line's end runs straight to the tile's centre.
        const bx = c < 0 ? cx : cx + NX[c] * 8;
        const by = c < 0 ? cy : cy + NY[c] * 8;
        const kx = c < 0 ? (ax + cx) / 2 : cx;
        const ky = c < 0 ? (ay + cy) / 2 : cy;
        // A straight tile, or a line's end, is one segment; a bend follows its curve.
        const segments = c < 0 || (NX[a] === -NX[c] && NY[a] === -NY[c]) ? 1 : SEGMENTS;
        let q = 0;
        for (let s = 0; s <= segments; s++) {
          const t = s / segments;
          const u = 1 - t;
          px0[s] = u * u * ax + 2 * u * t * kx + t * t * bx;
          py0[s] = u * u * ay + 2 * u * t * ky + t * t * by;
          if (s > 0) q += Math.max(Math.abs(px0[s] - px0[s - 1]), Math.abs(py0[s] - py0[s - 1]));
          q0[s] = q;
        }
        // Sleepers evenly over the tile, half a gap from each end: the next tile's continue the row.
        const period = q / Math.max(1, Math.round(q / SLEEPER_GAP));
        const look = (v >> 8) & 3;
        // Each pixel near a segment keeps the nearest segment of all tiles.
        for (let s = 0; s < segments; s++) {
          const sx = px0[s];
          const sy = py0[s];
          const vx = px0[s + 1] - sx;
          const vy = py0[s + 1] - sy;
          const len2 = vx * vx + vy * vy;
          if (len2 === 0) continue;
          // Rows across in steps of the major axis: one pixel per step, whatever the angle.
          const major = Math.max(Math.abs(vx), Math.abs(vy)) / Math.sqrt(len2);
          const out = Math.round(BALLAST / major);
          const rails = Math.round(GAUGE / major);
          const x0 = Math.max(0, Math.floor(Math.min(sx, sx + vx) - SPILL));
          const x1 = Math.min(w - 1, Math.ceil(Math.max(sx, sx + vx) + SPILL));
          const y0 = Math.max(0, Math.floor(Math.min(sy, sy + vy) - SPILL));
          const y1 = Math.min(h - 1, Math.ceil(Math.max(sy, sy + vy) + SPILL));
          if (x0 > x1 || y0 > y1) continue;
          minX = Math.min(minX, x0); maxX = Math.max(maxX, x1); minY = Math.min(minY, y0); maxY = Math.max(maxY, y1);
          for (let y = y0; y <= y1; y++) {
            const ry = y + 0.5 - sy;
            for (let x = x0; x <= x1; x++) {
              const rx = x + 0.5 - sx;
              const t = clamp((rx * vx + ry * vy) / len2, 0, 1);
              const ex = rx - t * vx;
              const ey = ry - t * vy;
              const d = Math.sqrt(ex * ex + ey * ey);
              const k = y * w + x;
              if (stamp[k] === gen && dist[k] <= d) continue;
              const o = Math.round(d / major);
              if (o > out + 1) continue;
              if (stamp[k] !== gen) touched[count++] = k;
              stamp[k] = gen;
              dist[k] = d;
              ring[k] = o;
              outer[k] = out;
              gauge[k] = rails;
              along[k] = q0[s] + t * (q0[s + 1] - q0[s]);
              gap[k] = period;
              looks[k] = look;
            }
          }
        }
      }
    }
    if (maxX < 0) return;
    painted = gen;
    paintedW = w;
    box[0] = minX; box[1] = minY; box[2] = maxX; box[3] = maxY;
    const R = art.manifest.ramps;
    const rock = R.rock;
    const bark = R.bark;
    const shift = art.shift;
    const darker = shift[LAND_SHIFT_MAX - 1];
    const deep = shift[LAND_SHIFT_MAX - 2];
    const inBeam = (k: number): boolean => stamp[k] === gen && ring[k] <= gauge[k];
    for (let n = 0; n < count; n++) {
      const k = touched[n];
      const x = k % w;
      const y = (k / w) | 0;
      {
        const o = ring[k];
        const look = looks[k];
        const bridge = water[k] !== 0;
        if (o > outer[k]) {
          // A bridge's girders, a row beyond the track on either side, over the water only.
          if (bridge && look !== RailLook.Maglev) {
            px[k] = look === RailLook.Steam ? bark[0] : rock[1];
            water[k] = 0;
          }
          continue;
        }
        // The lower right edge is in the shade (light from the upper left).
        const lowEdge = x + 1 < w && y + 1 < h && !inBand(k + w + 1, gen);
        let c: number;
        if (look === RailLook.Maglev) {
          if (o > gauge[k]) {
            // The guideway is slim: beside the beam lies the ground in its shadow, or the water under it.
            if (bridge || lowEdge) px[k] = (bridge ? deep : darker)[px[k]];
            continue;
          }
          // The beam lit along its upper left edge, in the shade along its lower right one, with a joint now and then.
          const joint = Math.abs(((along[k] / JOINT_GAP) % 1) - 0.5) * JOINT_GAP < 0.5;
          const shade = x + 1 < w && y + 1 < h && !inBeam(k + w + 1);
          const lit = x > 0 && y > 0 && !inBeam(k - w - 1);
          c = shade ? rock[2] : lit ? rock[4] : joint ? rock[2] : rock[3];
        } else if (o === gauge[k]) {
          c = rock[4];
        } else if (bridge) {
          // A deck over the water: planks, or concrete.
          c = look === RailLook.Steam ? bark[2] : rock[3];
        } else if (Math.abs(((along[k] / gap[k]) % 1) - 0.5) * gap[k] < 0.5) {
          // A sleeper: wood, or concrete from the Atomic age.
          c = look === RailLook.Steam ? (lowEdge ? bark[0] : bark[1]) : (lowEdge ? rock[2] : rock[3]);
        } else {
          c = look === RailLook.Steam ? (lowEdge ? rock[1] : rock[2]) : (lowEdge ? rock[0] : rock[1]);
        }
        px[k] = c;
        if (bridge) water[k] = 0;
      }
    }
    // The shadow the track (an embankment, a deck, a guideway) casts down to the right.
    for (let n = 0; n < count; n++) {
      const k = touched[n];
      const j = k + w + 1;
      if (k % w === w - 1 || j >= w * h || !inBand(k, gen) || inBand(j, gen)) continue;
      px[j] = (water[j] !== 0 ? deep : darker)[px[j]];
    }
  }

  /**
   * An opaque pixel of the object placed at `p` would cover the track the
   * last paintRail drew into the buffer at (ox, oy): such a tree or bush is
   * left out, which cuts the line through the forest.
   */
  export function railCovered(p: LandPlacement, ox: number, oy: number): boolean {
    if (painted !== generation) return false;
    const s = p.sprite;
    const x0 = p.fx - s.ax - ox;
    const y0 = p.fy - s.ay - oy;
    if (x0 > box[2] || y0 > box[3] || x0 + s.w <= box[0] || y0 + s.h <= box[1]) return false;
    for (let y = Math.max(0, box[1] - y0); y < Math.min(s.h, box[3] - y0 + 1); y++) {
      const row = (y0 + y) * paintedW;
      for (let x = Math.max(0, box[0] - x0); x < Math.min(s.w, box[2] - x0 + 1); x++) {
        if (s.px[y * s.w + x] === 0) continue;
        if (inBand(row + x0 + x, painted)) return true;
      }
    }
    return false;
  }
}
