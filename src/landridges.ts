/* =============================================================================
 * SimEarth 2.0 — mountain ranges as drawn ridge lines in the pixel terrain
 * -----------------------------------------------------------------------------
 * A tile is ~156 km across, so a mountain belt is a few tiles of high ground
 * whose peaks lie below the grid. Like the rivers (landrivers.ts) the ranges
 * become lines: the belt is thinned to its crest — the lowest tiles of the
 * belt are peeled off first, so what stays runs along the highest ground —
 * the crest tiles are linked into long chains, and each chain becomes a
 * jittered, smoothed polyline whose vertices carry how far the crest rises
 * above the tile mean. landridgedraw.ts raises the ground under these lines
 * in 3/4 view (docs/hoehe-spec.md §3.8).
 *
 * Heights are drawn at RIDGE_PX_PER_KM screen pixels per kilometre of relief
 * above the tile mean: a crest 1.6 km above it stands 16 px (one tile) tall. The
 * temperature at the crest decides its belts — alpine turf above the tree
 * line, bare rock above the rock line, snow above the snow line — with the
 * same lapse rate as the climate.
 * ========================================================================== */

namespace SE {
  /** Screen pixels a crest rises per kilometre of relief above its tile's mean height. */
  export const RIDGE_PX_PER_KM = 10;
  /** Highest rise of a crest, px; the compositor composes this much ground below a chunk. */
  export const RIDGE_RISE_MAX = 28;
  /** High ground that forms a range: belts (uplift) above this elevation, any land above the next. */
  const RIDGE_MIN_ELEVATION = ALPINE_MIN_ELEVATION;
  const RIDGE_HIGH_ELEVATION = 0.42;
  const RIDGE_BELT_UPLIFT = 0.05;
  /** Elevation above which the ground has relief at all, and the share of the height above it that peaks rise. */
  const RELIEF_BASE = 0.1;
  const RELIEF_SHARE = 1;
  /** Crest rise varies by this much from tile to tile, and again from vertex to vertex: peaks and saddles. */
  const PEAKINESS = 0.9;
  const SUMMITS = 0.5;
  /** Half width of a range at its foot: fixed part and per pixel of rise. */
  const FOOT_BASE = 4;
  const FOOT_PER_RISE = 0.85;
  /** A range ends lower than it runs: share of the rise at a free end. */
  const END_TAPER = 0.6;
  /** Largest offset of a crest point from its tile centre, px. */
  const JITTER = 4;
  /** Spurs of the thinned belt shorter than this many tiles are cut. */
  const SPUR_MIN = 2;
  /** Elevation is quantised for the crest search, so tiny changes do not move a range. */
  const CREST_QUANT = 16;
  const BUCKET = 128;
  const BUCKETS_X = (GRID_W * 16) / BUCKET;
  const BUCKETS_Y = (GRID_H * 16) / BUCKET;
  /** Grasses and flowering herbs make alpine turf above the tree line; before them, lichen on rock. */
  const TURF_FLORA = floraBit(Flora.Grasses) | floraBit(Flora.Flowering);
  /** Neighbour offsets clockwise from north: N NE E SE S SW W NW. */
  const NX = [0, 1, 1, 1, 0, -1, -1, -1];
  const NY = [-1, -1, 0, 1, 1, 1, 0, -1];

  /** Grid rows at each pole that never carry a crest. */
  const RIDGE_POLAR_ROWS = 2;

  /**
   * Volcano cones (docs/hoehe-spec.md §3.8): a point segment that stands this
   * much above the crest rise of its tile, at least CONE_MIN, with a foot
   * radius of CONE_FOOT_BASE + CONE_FOOT_PER_RISE·H and a crater of
   * CRATER_BASE + H·CRATER_PER_RISE px radius. Seen in 3/4 view the far foot
   * shows foot radius px higher, so a foot much wider than the cone is high
   * hides its crater behind the far flank and makes it a dome.
   */
  const CONE_LIFT = 10;
  const CONE_MIN = 20;
  const CONE_FOOT_BASE = 2;
  const CONE_FOOT_PER_RISE = 0.5;
  const CRATER_BASE = 2;
  const CRATER_PER_RISE = 1 / 12;
  /**
   * A cone is bare from this share of its height up, scree when dormant and
   * basalt when fresh: its foot fades into the ground around. Plants or turf
   * higher up hid it in the forest or made it a pale dome.
   */
  const CONE_APRON = 0.15;
  /**
   * A crest that runs over a cone sinks to this share of the cone's height at
   * its tile: the cone is the peak there. Any higher, a crest point beside the
   * moved cone (coneCentre) filled its crater and it read as a boulder.
   */
  const CONE_SADDLE = 0;
  /** The crest one tile either side stays this share of the cone's height below it, so a cone in a range stands out as its own peak. */
  const CONE_SHOULDER = 0.75;
  /** Cone kinds of `RidgePaths.build`. */
  const CONE_FRESH = 2;
  const NO_CONES = new Uint8Array(0);

  /**
   * An ice sheet, or ground whose sea-level climate would carry one (before
   * succession has laid it down): frozen by the zone's memory, else by the
   * temperature brought down to sea level. Summit snow on a mountain frozen
   * only by its height is no ice sheet.
   */
  function iceSheet(world: WorldState, i: number): boolean {
    if (world.landscape[i] === Landscape.Ice) return true;
    const z = world.landscapeZone[i];
    if (z !== ZONE_NONE) return zoneTemp(z) === TempClass.Frozen;
    return world.temperature[i] + altitudeCooling(world.elevation[i]) < FROZEN_TEMP;
  }

  /** Where in its tile the crest of tile (x, y) runs: px from the tile's left (axis 0) or top (axis 1) edge. */
  export function crestOffset(x: number, y: number, axis: number): number {
    return 8 + Math.round((landHash(x, y, 1203 + axis) - 0.5) * 2 * JITTER);
  }

  export class RidgePaths {
    /** Per tile: everything about its crest that shapes the drawn range, for the chunk signatures. */
    readonly sig = new Uint32Array(TILE_COUNT);
    /** 1 on a crest tile. */
    readonly crest = new Uint8Array(TILE_COUNT);
    // Segments a → b in world pixels (x unwrapped) with rise and foot half width at each end.
    readonly ax: number[] = [];
    readonly ay: number[] = [];
    readonly bx: number[] = [];
    readonly by: number[] = [];
    readonly ha: number[] = [];
    readonly hb: number[] = [];
    readonly wa: number[] = [];
    readonly wb: number[] = [];
    /** Rise above which the crest is above the tree line, the rock line, the snow line, px. */
    readonly zTree: number[] = [];
    readonly zRock: number[] = [];
    readonly zSnow: number[] = [];
    /** Ground key of the turf above the tree line (0: the tile's own ground). */
    readonly upper: number[] = [];
    /** Crater radius of a volcano cone, px (0: a range). */
    readonly crater: number[] = [];
    /** Ground key of the bare upper flanks and cliffs (0: plain rock): scree on a dormant cone, basalt on a fresh one. */
    readonly rockKey: number[] = [];
    /** Per tile: the segment of its volcano cone, −1 none. */
    readonly cone = new Int32Array(TILE_COUNT).fill(-1);
    /** Per tile: the height of its cone, px, while the lines are built (0 none). */
    private readonly coneH = new Float32Array(TILE_COUNT);
    private coneKeys: number[] | null = null;
    private readonly buckets: number[][] = Array.from({ length: BUCKETS_X * BUCKETS_Y }, () => []);
    private stamp = new Uint32Array(0);
    private stampN = 0;
    private chains: number[][] = [];
    private crestKey = -1;
    private linesKey = -1;
    private readonly mask = new Uint8Array(TILE_COUNT);
    private readonly level = new Uint8Array(TILE_COUNT);
    /** Per crest tile, from the last crest search: its number of crest links, and the sum of their indices. */
    private readonly deg = new Uint8Array(TILE_COUNT);
    private readonly linkSum = new Int32Array(TILE_COUNT);
    private turfKeys: number[] | null = null;
    private readonly near = new Int32Array(8);

    /** `cones` per tile: 0 none, 1 dormant, 2 fresh (young basalt). */
    build(world: WorldState, cones: Uint8Array = NO_CONES): void {
      const crests = this.crestKey;
      this.findCrests(world);
      // The lines change only when a crest's rise or belts do: most ticks they stay.
      let key = 0x811c9dc5;
      for (const chain of this.chains) {
        for (const t of chain) {
          const b = this.bands(world, t);
          key = Math.imul(key ^ (this.rise(world, t) | (b.tree << 6) | (b.rock << 12) | (b.snow << 18)), 0x01000193) ^ b.upper;
        }
      }
      for (let i = 0; i < cones.length; i++) {
        if (cones[i] === 0) continue;
        const b = this.bands(world, i);
        key = Math.imul(key ^ (i * 4 + cones[i]) ^ (this.coneCentre(world, i) << 24), 0x01000193);
        key = Math.imul(key ^ (this.rise(world, i) | (b.tree << 6) | (b.rock << 12) | (b.snow << 18)), 0x01000193) ^ b.upper;
      }
      key >>>= 0;
      if (crests === this.crestKey && key === this.linesKey) return;
      this.linesKey = key;
      this.sig.fill(0);
      for (const b of this.buckets) b.length = 0;
      for (const list of [this.ax, this.ay, this.bx, this.by, this.ha, this.hb, this.wa, this.wb, this.zTree, this.zRock, this.zSnow, this.upper, this.crater, this.rockKey]) list.length = 0;
      this.cone.fill(-1);
      this.coneH.fill(0);
      for (let i = 0; i < cones.length; i++) if (cones[i] !== 0) this.coneH[i] = this.coneHeight(world, i);
      for (const chain of this.chains) this.shape(chain, world);
      for (let i = 0; i < cones.length; i++) if (cones[i] !== 0) this.shapeCone(world, i, cones[i] === CONE_FRESH);
    }

    /* ------------------------------------------------------------ cones -- */

    /**
     * Where in its tile a cone stands, px: x + 16·y. The crest position, but
     * on a coast moved inland as far as the crest jitter goes: the sea cuts
     * off a cone's foot, and a cut front flank shows as a wall.
     */
    private coneCentre(world: WorldState, t: number): number {
      const x = t % GRID_W;
      const y = (t / GRID_W) | 0;
      let sx = 0;
      let sy = 0;
      for (let k = 0; k < 8; k++) {
        const ny = y + NY[k];
        if (ny >= 0 && ny < GRID_H && world.elevation[ny * GRID_W + wrapX(x + NX[k])] < 0) { sx += NX[k]; sy += NY[k]; }
      }
      const cx = sx === 0 ? crestOffset(x, y, 0) : 8 - Math.sign(sx) * JITTER;
      const cy = sy === 0 ? crestOffset(x, y, 1) : 8 - Math.sign(sy) * JITTER;
      return cx + 16 * cy;
    }

    private coneHeight(world: WorldState, t: number): number {
      return Math.max(CONE_MIN, Math.min(RIDGE_RISE_MAX, this.rise(world, t) + CONE_LIFT));
    }

    /**
     * A volcano: a point segment at the tile's crest position, concave like a
     * stratovolcano, with a crater on top. Above its foot a dormant cone is
     * scree, a fresh one basalt. Snow lies above the snow line on both.
     */
    private shapeCone(world: WorldState, t: number, fresh: boolean): void {
      const x = t % GRID_W;
      const y = (t / GRID_W) | 0;
      const h = this.coneH[t];
      const b = this.bands(world, t);
      if (!this.coneKeys) {
        const T = LandTables.shared();
        const rock = T.groundKey(Landscape.Rock, Substrate.Rock, 0);
        // Scree, a step darker than rock: a dormant cone stands out from the bare rock around it.
        this.coneKeys = [T.materialKey('scree') || rock, T.materialKey('basalt') || rock];
      }
      const cone = { tree: 0, rock: CONE_APRON * h, snow: b.snow, upper: 0 };
      const c = this.coneCentre(world, t);
      const cx = x * 16 + (c & 15);
      const cy = y * 16 + (c >> 4);
      this.cone[t] = this.ax.length;
      this.push(cx, cy, cx, cy, h, h, cone, CONE_FOOT_BASE + CONE_FOOT_PER_RISE * h, CRATER_BASE + h * CRATER_PER_RISE, this.coneKeys[fresh ? 1 : 0]);
      let s = Math.imul(0x2545f491 ^ (h * 4) ^ (fresh ? 1 << 8 : 0) ^ (Math.round(cone.tree) << 9) ^ (Math.round(cone.rock) << 15) ^ (cone.snow << 21), 0x85ebca77);
      s = Math.imul(s ^ cone.upper ^ (s >>> 13), 0xc2b2ae3d);
      s = Math.imul(s ^ c, 0x27d4eb2d);
      this.sig[t] = (this.sig[t] ^ s) >>> 0 || 1;
    }

    /* ---------------------------------------------------- crest search -- */

    /** The crest chains of the belts; recomputed only when the quantised high ground changed. */
    private findCrests(world: WorldState): void {
      const { elevation: e, uplift } = world;
      const { mask, level } = this;
      let key = 0x811c9dc5;
      for (let i = 0; i < TILE_COUNT; i++) {
        // Not under an ice sheet (its surface is flat ice), nor where a river
        // runs: that is a valley; nor along the polar rows, where the grid ends.
        const y = (i / GRID_W) | 0;
        const high = y >= RIDGE_POLAR_ROWS && y < GRID_H - RIDGE_POLAR_ROWS &&
          e[i] >= RIDGE_MIN_ELEVATION && (uplift[i] >= RIDGE_BELT_UPLIFT || e[i] >= RIDGE_HIGH_ELEVATION) &&
          !iceSheet(world, i) && world.riverLevel[i] <= 0;
        // Zero marks low ground; high ground is never below level 1.
        level[i] = high ? Math.max(1, Math.min(255, Math.round(e[i] * CREST_QUANT))) : 0;
        if (high) key = Math.imul(key ^ (i * 131 + level[i]), 0x01000193);
      }
      key >>>= 0;
      if (key === this.crestKey) return;
      this.crestKey = key;
      for (let i = 0; i < TILE_COUNT; i++) mask[i] = level[i] > 0 ? 1 : 0;
      this.thin();
      this.prune();
      this.trace();
    }

    private at(m: Uint8Array, x: number, y: number): number {
      return y < 0 || y >= GRID_H ? 0 : m[y * GRID_W + wrapX(x)];
    }

    /** Neighbour bits clockwise from north (bit k = NX[k], NY[k]). */
    private ring(m: Uint8Array, x: number, y: number): number {
      let bits = 0;
      for (let k = 0; k < 8; k++) if (this.at(m, x + NX[k], y + NY[k])) bits |= 1 << k;
      return bits;
    }

    /**
     * Peel the belt down to a line, lowest tiles first: a tile goes when it
     * has 2–6 neighbours in one connected arc (removing it splits nothing and
     * shortens no line end), in rising order of height, until nothing goes.
     */
    private thin(): void {
      const { mask, level } = this;
      const order: number[] = [];
      for (let i = 0; i < TILE_COUNT; i++) if (mask[i]) order.push(i);
      order.sort((a, b) => level[a] - level[b] || a - b);
      for (let changed = true; changed;) {
        changed = false;
        for (const i of order) {
          if (!mask[i]) continue;
          const bits = this.ring(mask, i % GRID_W, (i / GRID_W) | 0);
          let n = 0;
          let arcs = 0;
          for (let k = 0; k < 8; k++) {
            if (bits & (1 << k)) n++;
            if (!(bits & (1 << k)) && (bits & (1 << ((k + 1) & 7)))) arcs++;
          }
          if (n >= 2 && n <= 6 && arcs === 1) { mask[i] = 0; changed = true; }
        }
      }
    }

    /** Cut spurs: line ends that reach a junction within SPUR_MIN tiles. */
    private prune(): void {
      const { mask } = this;
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < TILE_COUNT; i++) {
          if (!mask[i] || this.degree(i) !== 1) continue;
          const path = [i];
          let prev = -1;
          let cur = i;
          for (let s = 0; s < SPUR_MIN; s++) {
            const next = this.nextLink(cur, prev);
            if (next < 0) break;
            if (this.degree(next) >= 3) { for (const t of path) mask[t] = 0; break; }
            if (this.degree(next) !== 2) break;
            path.push(next);
            prev = cur;
            cur = next;
          }
        }
      }
    }

    /**
     * Crest neighbours of a tile: the four sides, and a corner only where no
     * side tile already joins the two — so a staircase is one line, not a
     * chain of little triangles.
     */
    private links(i: number): number[] {
      const n = this.linkInto(i);
      return Array.from(this.near.subarray(0, n));
    }

    /** The crest neighbours of tile i into `this.near`; returns how many. */
    private linkInto(i: number): number {
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      const m = this.mask;
      let n = 0;
      for (let k = 0; k < 8; k++) {
        const ny = y + NY[k];
        if (ny < 0 || ny >= GRID_H) continue;
        const j = ny * GRID_W + wrapX(x + NX[k]);
        if (!m[j]) continue;
        if (k & 1 && (this.at(m, x + NX[k], y) || this.at(m, x, y + NY[k]))) continue;
        this.near[n++] = j;
      }
      return n;
    }

    private degree(i: number): number {
      return this.linkInto(i);
    }

    /** A crest neighbour of tile i other than `prev`, or −1. */
    private nextLink(i: number, prev: number): number {
      const n = this.linkInto(i);
      for (let k = 0; k < n; k++) if (this.near[k] !== prev) return this.near[k];
      return -1;
    }

    /**
     * Chains between junctions and line ends. Ranges do not close into rings:
     * the crest links are kept highest saddle first while they join two
     * separate pieces (a maximum spanning tree), so every ring opens at its
     * lowest saddle.
     */
    private trace(): void {
      const { mask, crest, level } = this;
      crest.set(mask);
      this.chains = [];
      const edges: [number, number, number][] = [];
      for (let i = 0; i < TILE_COUNT; i++) {
        if (!mask[i]) continue;
        for (const j of this.links(i)) if (j > i) edges.push([i, j, Math.min(level[i], level[j])]);
      }
      edges.sort((p, q) => q[2] - p[2] || p[0] - q[0] || p[1] - q[1]);
      const root = new Map<number, number>();
      const find = (i: number): number => {
        let r = i;
        while (root.has(r) && root.get(r) !== r) r = root.get(r) as number;
        root.set(i, r);
        return r;
      };
      const adj = new Map<number, number[]>();
      const join = (i: number, j: number): void => {
        (adj.get(i) ?? adj.set(i, []).get(i) as number[]).push(j);
      };
      const cut: number[] = [];
      for (const [i, j] of edges) {
        const ri = find(i);
        const rj = find(j);
        // This link would close a ring: drop its lower tile, so the ring shows a gap there.
        if (ri === rj) { cut.push(level[i] < level[j] || (level[i] === level[j] && i < j) ? i : j); continue; }
        root.set(ri, rj);
        join(i, j);
        join(j, i);
      }
      for (const t of cut) {
        mask[t] = 0;
        for (const n of adj.get(t) ?? []) adj.set(n, (adj.get(n) as number[]).filter((v) => v !== t));
        adj.delete(t);
      }
      crest.set(mask);
      const none: number[] = [];
      const near = (i: number): number[] => adj.get(i) ?? none;
      const used = new Set<number>();
      const edge = (p: number, q: number): number => (p < q ? p * TILE_COUNT + q : q * TILE_COUNT + p);
      const walk = (start: number, first: number): number[] => {
        const chain = [start, first];
        used.add(edge(start, first));
        let prev = start;
        let cur = first;
        while (near(cur).length === 2) {
          const next = near(cur)[0] === prev ? near(cur)[1] : near(cur)[0];
          used.add(edge(cur, next));
          chain.push(next);
          prev = cur;
          cur = next;
        }
        return chain;
      };
      for (let i = 0; i < TILE_COUNT; i++) {
        if (!mask[i]) continue;
        const links = near(i);
        if (links.length === 0) { this.chains.push([i]); continue; }
        if (links.length === 2) continue;
        for (const j of links) if (!used.has(edge(i, j))) this.chains.push(walk(i, j));
      }
      this.deg.fill(0);
      this.linkSum.fill(0);
      for (const [i, links] of adj) {
        if (!mask[i]) continue;
        this.deg[i] = links.length;
        this.linkSum[i] = links.reduce((p, q) => p + q, 0);
      }
    }

    /* ------------------------------------------------------------ lines -- */

    /** Rise of a crest tile, px: its relief above the tile mean, varied from tile to tile. */
    private rise(world: WorldState, t: number): number {
      const km = Math.max(0, world.elevation[t] - RELIEF_BASE) * ELEVATION_KM * RELIEF_SHARE;
      const vary = 1 - PEAKINESS / 2 + PEAKINESS * landHash(t % GRID_W, (t / GRID_W) | 0, 1201);
      return Math.min(RIDGE_RISE_MAX, Math.round(km * RIDGE_PX_PER_KM * vary));
    }

    /**
     * The drawn line of one chain: tile centres, jittered by a tile hash and
     * smoothed once (Chaikin), each vertex with its rise; the ends taper.
     */
    private shape(chain: number[], world: WorldState): void {
      const xs: number[] = [];
      const ys: number[] = [];
      const hs: number[] = [];
      let ux = chain[0] % GRID_W;
      chain.forEach((t, n) => {
        if (n > 0) {
          let dx = (t % GRID_W) - (chain[n - 1] % GRID_W);
          if (dx > GRID_W / 2) dx -= GRID_W;
          if (dx < -GRID_W / 2) dx += GRID_W;
          ux += dx;
        }
        const y = (t / GRID_W) | 0;
        const x = t % GRID_W;
        xs.push(ux * 16 + crestOffset(x, y, 0));
        ys.push(y * 16 + crestOffset(x, y, 1));
        const end = chain.length > 2 && (n === 0 || n === chain.length - 1) && this.deg[t] < 3;
        hs.push(this.rise(world, t) * (end ? END_TAPER : 1));
      });
      // Per-tile signature: this crest and its chain neighbours, which bend its smoothed line.
      const bands = chain.map((t) => this.bands(world, t));
      chain.forEach((t, n) => {
        let s = 0x9e3779b1 ^ this.linkSum[t];
        for (let d = -2; d <= 2; d++) {
          const m = n + d;
          if (m < 0 || m >= chain.length) continue;
          const b = bands[m];
          s = Math.imul(s ^ (hs[m] | (b.tree << 6) | (b.rock << 12) | (b.snow << 18) | (b.upper << 24)), 0x85ebca77) ^ (s >>> 13);
        }
        this.sig[t] = (this.sig[t] ^ s) >>> 0 || 1;
      });
      // One pass of corner cutting, ends kept.
      let px = xs;
      let py = ys;
      let ph = hs;
      let pb = bands.map((_, n) => n);
      if (xs.length >= 3) {
        const ox = [xs[0]];
        const oy = [ys[0]];
        const oh = [hs[0]];
        const ob = [0];
        for (let k = 0; k < xs.length - 1; k++) {
          ox.push(0.75 * xs[k] + 0.25 * xs[k + 1], 0.25 * xs[k] + 0.75 * xs[k + 1]);
          oy.push(0.75 * ys[k] + 0.25 * ys[k + 1], 0.25 * ys[k] + 0.75 * ys[k + 1]);
          oh.push(0.75 * hs[k] + 0.25 * hs[k + 1], 0.25 * hs[k] + 0.75 * hs[k + 1]);
          ob.push(k, k + 1);
        }
        ox.push(xs[xs.length - 1]);
        oy.push(ys[ys.length - 1]);
        oh.push(hs[hs.length - 1]);
        ob.push(xs.length - 1);
        px = ox; py = oy; ph = oh; pb = ob;
      }
      for (let k = 0; k < ph.length; k++) {
        const x = Math.round(px[k]);
        ph[k] = Math.min(RIDGE_RISE_MAX, ph[k] * (1 - SUMMITS / 2 + SUMMITS * landHash(((x % (GRID_W * 16)) + GRID_W * 16) % (GRID_W * 16), Math.round(py[k]), 1205)));
        const j = pb[k];
        const cone = this.coneH[chain[j]];
        const side = Math.max(j > 0 ? this.coneH[chain[j - 1]] : 0, j + 1 < chain.length ? this.coneH[chain[j + 1]] : 0);
        if (cone > 0) ph[k] = Math.min(ph[k], CONE_SADDLE * cone);
        else if (side > 0) ph[k] = Math.min(ph[k], CONE_SHOULDER * side);
      }
      const n = Math.max(1, px.length - 1);
      for (let k = 0; k < n; k++) {
        const k1 = Math.min(k + 1, px.length - 1);
        const b = bands[pb[ph[k] >= ph[k1] ? k : k1]];
        this.push(px[k], py[k], px[k1], py[k1], ph[k], ph[k1], b);
      }
    }

    /** Where the belts of a crest tile begin, in px of rise above the tile mean. */
    private bands(world: WorldState, t: number): { tree: number; rock: number; snow: number; upper: number } {
      const T = world.temperature[t];
      const z = world.landscapeZone[t];
      // The crest's own lines, not the tile's belt flags: those are read at the
      // 3×3 mean height and reach wider than the crest.
      const above = (limit: number): number => Math.max(0, Math.min(63, Math.round(((T - limit) / LAPSE_RATE) * RIDGE_PX_PER_KM)));
      const snowLine = z === ZONE_NONE ? SNOW_TEMP : snowTemp(zoneMoist(z));
      const flora = world.flora[t];
      const level = LANDSCAPE_LEVEL[world.landscape[t]];
      if (!this.turfKeys) {
        const tables = LandTables.shared();
        this.turfKeys = [tables.materialKey('alpine_meadow', 1), tables.materialKey('alpine_meadow', 2), tables.materialKey('lichen_rock', 1)];
      }
      const keys = this.turfKeys;
      const turf = (flora & TURF_FLORA) !== 0 ? keys[level >= 3 ? 1 : 0] : level >= 1 ? keys[2] : 0;
      return { tree: above(TREELINE_TEMP), rock: above(ROCKBELT_TEMP), snow: above(snowLine), upper: turf };
    }

    private push(
      ax: number, ay: number, bx: number, by: number, ha: number, hb: number, b: { tree: number; rock: number; snow: number; upper: number },
      foot = 0, crater = 0, rockKey = 0,
    ): void {
      const id = this.ax.length;
      const wa = foot || FOOT_BASE + FOOT_PER_RISE * ha;
      const wb = foot || FOOT_BASE + FOOT_PER_RISE * hb;
      this.ax.push(ax); this.ay.push(ay); this.bx.push(bx); this.by.push(by);
      this.ha.push(ha); this.hb.push(hb); this.wa.push(wa); this.wb.push(wb);
      this.zTree.push(b.tree); this.zRock.push(b.rock); this.zSnow.push(b.snow); this.upper.push(b.upper);
      this.crater.push(crater); this.rockKey.push(rockKey);
      const reach = Math.max(wa, wb) + 1;
      const x0 = Math.floor((Math.min(ax, bx) - reach) / BUCKET);
      const x1 = Math.floor((Math.max(ax, bx) + reach) / BUCKET);
      // The rise lifts the range up to RIDGE_RISE_MAX px above its foot on screen.
      const y0 = Math.max(0, Math.floor((Math.min(ay, by) - reach - RIDGE_RISE_MAX) / BUCKET));
      const y1 = Math.min(BUCKETS_Y - 1, Math.floor((Math.max(ay, by) + reach) / BUCKET));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) this.buckets[y * BUCKETS_X + (((x % BUCKETS_X) + BUCKETS_X) % BUCKETS_X)].push(id);
      }
    }

    /** Segments whose range may show in world pixels [x0, x1) × [y0, y1) (screen, after the rise), each once. */
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
  }
}
