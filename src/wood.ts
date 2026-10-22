/* =============================================================================
 * SimEarth 2.0 — wood: logging round the cities, forests growing back
 * -----------------------------------------------------------------------------
 * Every city keeps some of the woodland in its reach cut: its nearest
 * woodland tiles (by distance plus a tile hash, so the edge is ragged) as
 * many as its age and people need (WOOD_DEMAND), never more than
 * WOOD_MAX_SHARE of them. The nearest of those it clears to open land, the
 * rest it thins to a light forest.
 *
 * One byte per tile carries it, `world.logged`: the plant cover may reach at
 * most 1 − logged/255 (flora.ts). It relaxes every tick by its share of
 * WOOD_REGROW_YEARS, before the plants grow, and a city cuts it back to its
 * depth after them: what grew in between is the wood the city takes. A tile
 * a city holds cleared carries LAND_USE_LOGGED, and succession holds it at
 * the open land of its own ladder (succession.ts) until it grows back.
 *
 * Wood is bookkeeping besides that: `world.wood` is the standing wood of all
 * woodland, `world.woodCut` what cities have cut, and `cityWood` tells the
 * fleets (fleets.ts) whether a city's reach still has enough. Rolls are
 * hashes, never `world.rng`.
 * ========================================================================== */

namespace SE {
  /** Logging depth of a cleared and a thinned tile (world.logged). */
  const CLEAR_DEPTH = Math.round(255 * (1 - WOOD_CLEAR_COVER));
  const THIN_DEPTH = Math.round(255 * (1 - WOOD_THIN_COVER));
  const WOOD_SALT = 0x600d;

  /** Offsets of a city's reach, nearest first. */
  const REACH: readonly { dx: number; dy: number; d: number }[] = (() => {
    const out: { dx: number; dy: number; d: number }[] = [];
    const r = Math.floor(Math.sqrt(WOOD_REACH2));
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 > 0 && d2 <= WOOD_REACH2) out.push({ dx, dy, d: Math.sqrt(d2) });
      }
    }
    return out.sort((a, b) => a.d - b.d);
  })();

  // Scratch of one city's reach: its woodland tiles, and the order keys packed with the index.
  const reachTiles = new Int32Array(REACH.length);
  const reachKeys = new Float64Array(REACH.length);
  /** Reach of each city tile in its logging order, for the seed `ordersSeed`: fixed per tile, so built once. */
  const orders = new Map<number, Int32Array>();
  let ordersSeed = NaN;
  // Depth the cities want per tile this tick, and the tiles that have one.
  const wanted = new Uint8Array(TILE_COUNT);
  const wantedList = new Int32Array(TILE_COUNT);

  /** Woodland: shrubland and every forest (succession level 3 and 4). */
  function woodland(l: number): boolean {
    return LANDSCAPE_LEVEL[l] >= 3;
  }

  /** Wood per unit of cover of each landscape: the forests in full, shrubland in part (water tiles are Rock). */
  const WOOD_WEIGHT = Float32Array.from({ length: LANDSCAPE_COUNT }, (_, l) =>
    l === Landscape.Shrubland ? WOOD_SHRUB : woodland(l) ? 1 : 0);

  /** A tile a city may log: land beside the cities that is woodland, or was before its logging. */
  function loggable(world: WorldState, j: number): boolean {
    return world.elevation[j] >= 0 && world.tech[j] === Tech.None && (world.logged[j] !== 0 || woodland(world.landscape[j]));
  }

  /** Tile at an offset from `i`, or −1 off the map's top and bottom. */
  function offsetTile(i: number, dx: number, dy: number): number {
    const y = Math.floor(i / GRID_W) + dy;
    return y < 0 || y >= GRID_H ? -1 : y * GRID_W + wrapX((i % GRID_W) + dx);
  }

  /** Woodland tiles a city of `pop` at `tech` wants cut. */
  function demand(tech: number, pop: number): number {
    return Math.round(WOOD_DEMAND[tech] * pop);
  }

  /** The reach round `tile`, nearest first with the hash jitter (cached per tile; cleared for another seed). */
  function reachOrder(world: WorldState, tile: number): Int32Array {
    if (ordersSeed !== world.seed || orders.size > 4096) {
      orders.clear();
      ordersSeed = world.seed;
    }
    let order = orders.get(tile);
    if (order) return order;
    let n = 0;
    for (const o of REACH) {
      const j = offsetTile(tile, o.dx, o.dy);
      if (j < 0) continue;
      const key = o.d + WOOD_JITTER * (spontaneousRoll(world.seed, j, WOOD_SALT) - 0.5) + WOOD_JITTER;
      reachTiles[n] = j;
      reachKeys[n] = Math.round(key * 1000) * 256 + n;
      n++;
    }
    reachKeys.subarray(0, n).sort();
    order = new Int32Array(n);
    for (let k = 0; k < n; k++) order[k] = reachTiles[reachKeys[k] % 256];
    orders.set(tile, order);
    return order;
  }

  /** The woodland tiles round `tile` in logging order into the scratch; returns their count. */
  function gatherReach(world: WorldState, tile: number): number {
    const order = reachOrder(world, tile);
    let n = 0;
    for (let k = 0; k < order.length; k++) if (loggable(world, order[k])) reachTiles[n++] = order[k];
    return n;
  }

  /** Share 0..1 of the wood city `c` needs that its surroundings give now; fleets.ts builds no new ship below a threshold. */
  export function cityWood(world: WorldState, c: City): number {
    const need = demand(world.tech[c.tile], world.cityPop[c.tile]);
    if (need <= 0) return 1;
    return Math.min(1, Math.floor(gatherReach(world, c.tile) * WOOD_MAX_SHARE) / need);
  }

  /** One civilization tick of logging (civ.ts calls it after the conflicts); the forests grow back in `regrowWood`. */
  export function stepWood(world: WorldState, params: ModelParams): void {
    void params;
    let listed = 0;
    for (const c of world.civ.cities) {
      const need = demand(world.tech[c.tile], world.cityPop[c.tile]);
      if (need <= 0) continue;
      const want = Math.min(need, Math.floor(gatherReach(world, c.tile) * WOOD_MAX_SHARE));
      const clear = Math.round(want * WOOD_CLEAR_SHARE);
      for (let k = 0; k < want; k++) {
        const j = reachTiles[k];
        const depth = k < clear ? CLEAR_DEPTH : THIN_DEPTH;
        if (wanted[j] === 0) wantedList[listed++] = j;
        if (depth > wanted[j]) wanted[j] = depth;
      }
    }
    const { logged, vegetation, landUse, landscape } = world;
    for (let k = 0; k < listed; k++) {
      const j = wantedList[k];
      const depth = wanted[j];
      wanted[j] = 0;
      if (depth > logged[j]) logged[j] = depth;
      if (depth === CLEAR_DEPTH) landUse[j] |= LAND_USE_LOGGED;
      const ceiling = 1 - logged[j] / 255;
      const v = vegetation[j];
      if (v <= ceiling) continue;
      vegetation[j] = ceiling;
      world.woodCut += (v - ceiling) * WOOD_GT_PER_TILE * WOOD_WEIGHT[landscape[j]];
    }
  }

  /**
   * The logging relaxes by one tick's share of WOOD_REGROW_YEARS (flora.ts
   * calls it before the plants grow, so a forest nobody cuts any more grows
   * back), a tile no longer held cleared loses LAND_USE_LOGGED, and every
   * WOOD_STAT_EVERY ticks the standing wood is summed.
   */
  export function regrowWood(world: WorldState): void {
    const { logged, landUse } = world;
    const relax = Math.max(1, Math.round(CLEAR_DEPTH * world.yearsPerTick / WOOD_REGROW_YEARS));
    // Few tiles are logged: read four at a time and skip the untouched.
    const quads = new Uint32Array(logged.buffer, logged.byteOffset, TILE_COUNT >> 2);
    for (let q = 0; q < quads.length; q++) {
      if (quads[q] === 0) continue;
      for (let i = q << 2; i < (q << 2) + 4; i++) {
        const l = logged[i];
        if (l === 0) continue;
        if (l < CLEAR_DEPTH || l <= relax) landUse[i] &= ~LAND_USE_LOGGED;
        logged[i] = l > relax ? l - relax : 0;
      }
    }
    if (world.ticks % WOOD_STAT_EVERY === 0) world.wood = standingWood(world);
  }

  /** Standing wood of all woodland, Gt. */
  function standingWood(world: WorldState): number {
    const { landscape, vegetation } = world;
    let wood = 0;
    for (let i = 0; i < TILE_COUNT; i++) wood += vegetation[i] * WOOD_WEIGHT[landscape[i]];
    return wood * WOOD_GT_PER_TILE;
  }

  interface SavedWood {
    /** Wood cut so far, Gt. */
    readonly cut: number;
    /** Logged tiles as pairs: tile, depth. */
    readonly tiles: number[];
  }

  /** Largest amount a sound field may carry, Gt. */
  const WOOD_SAVE_MAX = 1e7;

  /** The optional save field `wood`; undefined writes none. */
  export function woodToJSON(world: WorldState): SavedWood | undefined {
    const tiles: number[] = [];
    for (let i = 0; i < TILE_COUNT; i++) if (world.logged[i] !== 0) tiles.push(i, world.logged[i]);
    return tiles.length === 0 && world.woodCut === 0 ? undefined : { cut: world.woodCut, tiles };
  }

  /** Take over the optional save field `wood` after the civilization's records (save.ts); a missing or unsound one leaves no logging. */
  export function restoreWood(world: WorldState, raw: unknown): void {
    world.logged.fill(0);
    world.woodCut = 0;
    const r = raw as Partial<SavedWood> | null;
    const sound = !!r && typeof r === 'object' && typeof r.cut === 'number' && Number.isFinite(r.cut) &&
      r.cut >= 0 && r.cut <= WOOD_SAVE_MAX && Array.isArray(r.tiles) && r.tiles.length % 2 === 0 &&
      r.tiles.every((v, k) => Number.isInteger(v) && v >= 0 && v < (k % 2 === 0 ? TILE_COUNT : 256));
    if (sound) {
      world.woodCut = r!.cut!;
      const t = r!.tiles!;
      for (let k = 0; k < t.length; k += 2) world.logged[t[k]] = t[k + 1];
    }
    world.wood = standingWood(world);
  }
}
