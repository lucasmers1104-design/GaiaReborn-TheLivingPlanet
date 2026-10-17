/* =============================================================================
 * SimEarth 2.0 — rivers as drawn paths in the pixel terrain
 * -----------------------------------------------------------------------------
 * The drainage network (river.ts) runs tile to tile in four directions, which
 * drawn tile by tile reads as blue pipes with right-angle stairs. Here every
 * river becomes a line instead: strands follow the downstream links — each
 * tile continues into the trunk through its largest tributary, smaller ones
 * end on the trunk — through the midpoints of the links, so a four-neighbour
 * staircase becomes a diagonal, with a little jitter from a tile hash, smoothed
 * twice (Chaikin) into gentle bends. Width grows with the river level and
 * opens at the mouth.
 * Painted per pixel in landriverdraw.ts.
 * ========================================================================== */

namespace SE {
  /** Largest offset of a river point from where the links put it, px. */
  const JITTER = 3;
  /** Meander: sideways swing of a straight run, px, and its wavelength along the run, px. */
  const MEANDER = 5;
  const MEANDER_WAVE = 88;
  /** River width at the smallest and the largest level, px. */
  const WIDTH_MIN = 3;
  const WIDTH_MAX = 6;
  /** The mouth reaches this far past the last tile centre into the sea, and widens. */
  const MOUTH_REACH = 12;
  const MOUTH_WIDEN = 1.7;
  /** Pixels past the water a segment may still paint: bank and its sprinkle. */
  export const LAND_RIVER_BANK = 2;
  const BANK = LAND_RIVER_BANK;
  /** Spatial index cells, px. */
  const BUCKET = 128;
  const BUCKETS_X = (GRID_W * 16) / BUCKET;
  const BUCKETS_Y = (GRID_H * 16) / BUCKET;
  const WORLD_W = GRID_W * 16;
  /** Shift that brings x-unwrapped coordinate `a` next to `near` on the round world. */
  export function landWrapShift(near: number, a: number): number {
    return Math.round((near - a) / WORLD_W) * WORLD_W;
  }

  interface Strand { tiles: number[]; end: 'mouth' | 'join' | 'none'; to: number; xs: number[] | null; ys: number[]; ws: number[] }

  /** Chaikin corner cutting, endpoints kept. */
  function chaikin(xs: number[], ys: number[], ws: number[]): [number[], number[], number[]] {
    if (xs.length < 3) return [xs, ys, ws];
    const ox = [xs[0]];
    const oy = [ys[0]];
    const ow = [ws[0]];
    for (let k = 0; k < xs.length - 1; k++) {
      ox.push(0.75 * xs[k] + 0.25 * xs[k + 1], 0.25 * xs[k] + 0.75 * xs[k + 1]);
      oy.push(0.75 * ys[k] + 0.25 * ys[k + 1], 0.25 * ys[k] + 0.75 * ys[k + 1]);
      ow.push(0.75 * ws[k] + 0.25 * ws[k + 1], 0.25 * ws[k] + 0.75 * ws[k + 1]);
    }
    ox.push(xs[xs.length - 1]);
    oy.push(ys[ys.length - 1]);
    ow.push(ws[ws.length - 1]);
    return [ox, oy, ow];
  }

  /**
   * Sideways swing of a link midpoint, px: a wave along the link's own row or
   * column in world space, so a straight run of links meanders (only inside
   * a run, away from rivers alongside) and every chunk
   * sees the same line (it depends only on where the link is).
   */
  function meander(dir: number, mx: number, my: number): number {
    const along = dir <= 2 ? ((mx % WORLD_W) + WORLD_W) % WORLD_W : my;
    const lane = dir <= 2 ? Math.floor(my / 16) : wrapX(Math.floor(mx / 16));
    return MEANDER * Math.sin((2 * Math.PI * along) / MEANDER_WAVE + 2 * Math.PI * landHash(lane, dir, 43));
  }

  /** A river on either side of tile i, across a link in direction dir: a meander there could touch it. */
  function besideRiver(world: WorldState, i: number, dir: number): boolean {
    const x = i % GRID_W;
    const y = (i / GRID_W) | 0;
    const a = dir <= 2 ? (y > 0 ? i - GRID_W : -1) : idx(wrapX(x - 1), y);
    const b = dir <= 2 ? (y < GRID_H - 1 ? i + GRID_W : -1) : idx(wrapX(x + 1), y);
    const wet = (j: number): boolean => j >= 0 && world.elevation[j] >= 0 && world.riverLevel[j] > 0;
    return wet(a) || wet(b);
  }

  /** Neighbour direction of j from i: 1 W, 2 E, 3 N, 4 S, 0 none. */
  function direction(i: number, j: number): number {
    if (j < 0) return 0;
    const x = i % GRID_W;
    const y = (i / GRID_W) | 0;
    if (j === idx(wrapX(x - 1), y)) return 1;
    if (j === idx(wrapX(x + 1), y)) return 2;
    if (j === idx(x, clampY(y - 1))) return 3;
    if (j === idx(x, clampY(y + 1))) return 4;
    return 0;
  }

  export class RiverPaths {
    /** Per tile: everything about its river that shapes the drawn line, for the chunk signatures. */
    readonly sig = new Uint16Array(TILE_COUNT);
    // Segments: a → b in world pixels (x unwrapped), radius at each end, 1 where algae film the water.
    readonly ax: number[] = [];
    readonly ay: number[] = [];
    readonly bx: number[] = [];
    readonly by: number[] = [];
    readonly ra: number[] = [];
    readonly rb: number[] = [];
    readonly green: number[] = [];
    /** Arc length from the strand's source to a, px, and the strand's index: where moving water is along its river. */
    readonly along: number[] = [];
    readonly strand: number[] = [];
    private readonly buckets: number[][] = Array.from({ length: BUCKETS_X * BUCKETS_Y }, () => []);
    private readonly mainUp = new Int32Array(TILE_COUNT);
    private readonly strandOf = new Int32Array(TILE_COUNT);
    private stamp = new Uint32Array(0);
    private stampN = 0;

    build(world: WorldState): void {
      const { elevation: e, riverLevel: level, riverDown: down, riverFlow: flow, flora } = world;
      const river = (i: number): boolean => i >= 0 && e[i] >= 0 && level[i] > 0;
      const { mainUp, strandOf } = this;
      mainUp.fill(-1);
      strandOf.fill(-1);
      this.sig.fill(0);
      for (const b of this.buckets) b.length = 0;
      for (const list of [this.ax, this.ay, this.bx, this.by, this.ra, this.rb, this.green, this.along, this.strand]) list.length = 0;
      for (let i = 0; i < TILE_COUNT; i++) {
        if (!river(i) || !river(down[i])) continue;
        const d = down[i];
        const m = mainUp[d];
        if (m < 0 || flow[i] > flow[m] || (flow[i] === flow[m] && i < m)) mainUp[d] = i;
      }
      const algae = floraBit(Flora.FreshwaterAlgae);
      const strands: Strand[] = [];
      for (let i = 0; i < TILE_COUNT; i++) {
        if (!river(i)) continue;
        this.sig[i] = 1 + Math.round(level[i] * 15) + (direction(i, down[i]) << 4) + (direction(i, mainUp[i]) << 7) +
          ((flora[i] & algae) !== 0 ? 1024 : 0);
        if (mainUp[i] >= 0) continue;
        // A source: follow the water down while this is the main branch.
        const s: Strand = { tiles: [i], end: 'none', to: -1, xs: null, ys: [], ws: [] };
        let cur = i;
        for (let guard = 0; guard < TILE_COUNT; guard++) {
          strandOf[cur] = strands.length;
          const d = down[cur];
          if (river(d) && mainUp[d] === cur) { s.tiles.push(d); cur = d; continue; }
          if (river(d)) { s.end = 'join'; s.to = d; } else if (d >= 0 && e[d] < 0) { s.end = 'mouth'; s.to = d; }
          break;
        }
        strands.push(s);
      }
      for (let k = 0; k < strands.length; k++) this.shape(strands, k, world);
      for (let k = 0; k < strands.length; k++) this.segments(strands[k], k, world);
    }

    /**
     * The line of one strand, through the midpoints of its links rather than
     * the tile centres — so a four-neighbour staircase becomes a straight
     * diagonal — jittered a little per link, then smoothed. A tributary is
     * shaped after the strand it flows into, whose smoothed line it must meet.
     */
    private shape(strands: Strand[], k: number, world: WorldState): void {
      const s = strands[k];
      if (s.xs) return;
      const level = world.riverLevel;
      const width = (t: number): number => WIDTH_MIN + (WIDTH_MAX - WIDTH_MIN) * clamp((level[t] - 0.25) / 0.75, 0, 1);
      const jitter = (t: number, seed: number): number => Math.round((landHash(t % GRID_W, (t / GRID_W) | 0, seed) - 0.5) * 2 * JITTER);
      // Tile centres along the strand, x unwrapped across the date line.
      const cx: number[] = [];
      const cy: number[] = [];
      let ux = s.tiles[0] % GRID_W;
      for (let n = 0; n < s.tiles.length; n++) {
        const t = s.tiles[n];
        if (n > 0) {
          let dx = (t % GRID_W) - (s.tiles[n - 1] % GRID_W);
          if (dx > GRID_W / 2) dx -= GRID_W;
          if (dx < -GRID_W / 2) dx += GRID_W;
          ux += dx;
        }
        cx.push(ux * 16 + 8);
        cy.push(((t / GRID_W) | 0) * 16 + 8);
      }
      const head = s.tiles[0];
      const xs = [cx[0] + jitter(head, 31)];
      const ys = [cy[0] + jitter(head, 32)];
      const ws = [width(head)];
      for (let n = 0; n + 1 < s.tiles.length; n++) {
        const to = s.tiles[n + 1];
        const dir = direction(s.tiles[n], to);
        const mx = (cx[n] + cx[n + 1]) / 2;
        const my = (cy[n] + cy[n + 1]) / 2;
        const prev = n > 0 ? direction(s.tiles[n - 1], s.tiles[n]) : dir;
        const next = n + 2 < s.tiles.length ? direction(to, s.tiles[n + 2]) : dir;
        const bend = prev === dir && next === dir && !besideRiver(world, s.tiles[n], dir) && !besideRiver(world, to, dir) ? meander(dir, mx, my) : 0;
        xs.push(mx + jitter(to, 33 + dir) + (dir >= 3 ? bend : 0));
        ys.push(my + jitter(to, 38 + dir) + (dir <= 2 ? bend : 0));
        ws.push((width(s.tiles[n]) + width(to)) / 2);
      }
      const n = s.tiles.length - 1;
      const last = s.tiles[n];
      const dir = direction(last, s.to);
      const ox = dir === 1 ? -1 : dir === 2 ? 1 : 0;
      const oy = dir === 3 ? -1 : dir === 4 ? 1 : 0;
      if (s.end === 'mouth') {
        // Across the coast and a little out into the sea, opening up.
        xs.push(cx[n] + ox * 8, cx[n] + ox * MOUTH_REACH);
        ys.push(cy[n] + oy * 8, cy[n] + oy * MOUTH_REACH);
        ws.push(width(last) * 1.2, width(last) * MOUTH_WIDEN);
      } else if (s.end === 'join') {
        xs.push(cx[n] + ox * 8 + jitter(s.to, 33 + dir));
        ys.push(cy[n] + oy * 8 + jitter(s.to, 38 + dir));
        ws.push(width(last));
        const into = this.strandOf[s.to];
        this.shape(strands, into, world);
        // Meet the trunk's own smoothed line where it passes the confluence tile.
        const t = strands[into];
        const txs = t.xs as number[];
        const px = cx[n] + ox * 16;
        const py = cy[n] + oy * 16;
        let best = 0;
        let bestD = Infinity;
        let shift = 0;
        for (let v = 0; v < txs.length; v++) {
          const wrap = -landWrapShift(px, txs[v]);
          const d = (txs[v] - wrap - px) ** 2 + (t.ys[v] - py) ** 2;
          if (d < bestD) { bestD = d; best = v; shift = wrap; }
        }
        xs.push(txs[best] - shift);
        ys.push(t.ys[best]);
        ws.push(width(last));
      } else if (n > 0) {
        xs.push(cx[n]);
        ys.push(cy[n]);
        ws.push(width(last));
      }
      let pts: [number[], number[], number[]] = [xs, ys, ws];
      for (let pass = 0; pass < 2; pass++) pts = chaikin(...pts);
      [s.xs, s.ys, s.ws] = pts;
    }

    private segments(s: Strand, index: number, world: WorldState): void {
      const xs = s.xs as number[];
      const algae = floraBit(Flora.FreshwaterAlgae);
      const n = Math.max(1, xs.length - 1);
      let along = 0;
      for (let k = 0; k < n; k++) {
        const k1 = Math.min(k + 1, xs.length - 1);
        const id = this.ax.length;
        this.ax.push(xs[k]); this.ay.push(s.ys[k]); this.bx.push(xs[k1]); this.by.push(s.ys[k1]);
        this.ra.push(s.ws[k] / 2); this.rb.push(s.ws[k1] / 2);
        this.along.push(along);
        this.strand.push(index);
        along += Math.hypot(xs[k1] - xs[k], s.ys[k1] - s.ys[k]);
        const tile = idx(wrapX(Math.floor((xs[k] + xs[k1]) / 32)), clampY(Math.floor((s.ys[k] + s.ys[k1]) / 32)));
        this.green.push((world.flora[tile] & algae) !== 0 ? 1 : 0);
        const reach = Math.max(s.ws[k], s.ws[k1]) / 2 + BANK + 1;
        const x0 = Math.floor((Math.min(xs[k], xs[k1]) - reach) / BUCKET);
        const x1 = Math.floor((Math.max(xs[k], xs[k1]) + reach) / BUCKET);
        const y0 = Math.max(0, Math.floor((Math.min(s.ys[k], s.ys[k1]) - reach) / BUCKET));
        const y1 = Math.min(BUCKETS_Y - 1, Math.floor((Math.max(s.ys[k], s.ys[k1]) + reach) / BUCKET));
        for (let by = y0; by <= y1; by++) {
          for (let bx = x0; bx <= x1; bx++) this.buckets[by * BUCKETS_X + (((bx % BUCKETS_X) + BUCKETS_X) % BUCKETS_X)].push(id);
        }
      }
    }

    /** Segments that may paint into world pixels [x0, x1) × [y0, y1), each id once. */
    query(x0: number, y0: number, x1: number, y1: number): number[] {
      if (this.stamp.length < this.ax.length) this.stamp = new Uint32Array(this.ax.length * 2);
      const mark = ++this.stampN;
      const out: number[] = [];
      for (let by = Math.max(0, Math.floor(y0 / BUCKET)); by <= Math.min(BUCKETS_Y - 1, Math.floor((y1 - 1) / BUCKET)); by++) {
        for (let bx = Math.floor(x0 / BUCKET); bx <= Math.floor((x1 - 1) / BUCKET); bx++) {
          for (const id of this.buckets[by * BUCKETS_X + (((bx % BUCKETS_X) + BUCKETS_X) % BUCKETS_X)]) {
            if (this.stamp[id] === mark) continue;
            this.stamp[id] = mark;
            out.push(id);
          }
        }
      }
      return out;
    }

    /** Signed distance of a world point to the river's edge (< 0 in the water), and the nearest segment. */
    distance(id: number, x: number, y: number): number {
      let ax = this.ax[id];
      let bx = this.bx[id];
      const shift = landWrapShift(x, (ax + bx) / 2);
      ax += shift;
      bx += shift;
      const ay = this.ay[id];
      const vx = bx - ax;
      const vy = this.by[id] - ay;
      const len = vx * vx + vy * vy;
      const t = len > 0 ? clamp(((x - ax) * vx + (y - ay) * vy) / len, 0, 1) : 0;
      const dx = x - ax - t * vx;
      const dy = y - ay - t * vy;
      return Math.sqrt(dx * dx + dy * dy) - (this.ra[id] + (this.rb[id] - this.ra[id]) * t);
    }

    /** Whether world point (x, y) lies within `pad` pixels of river water. */
    near(x: number, y: number, pad: number): boolean {
      for (const id of this.query(x - 1, y - 1, x + 2, y + 2)) if (this.distance(id, x, y) <= pad) return true;
      return false;
    }
  }
}
