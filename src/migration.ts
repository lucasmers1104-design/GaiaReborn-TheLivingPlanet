/* =============================================================================
 * SimEarth 2.0 — settlers
 * -----------------------------------------------------------------------------
 * Full cities send groups of settlers that walk to a new site and found a
 * city there (docs/zivilisation-spec.md §2.5). The way is planned once by a
 * breadth-first search that keeps to the water a tech level can cross, and
 * planned again when the plates move or the way is cut. Land classes only.
 * ========================================================================== */

namespace SE {
  /** A planned way to a settlers' site. */
  export interface SettlerRoute {
    /** Tiles from the start to the site. */
    readonly path: number[];
    /** The site cannot be reached over land: the group crosses to another shore. */
    readonly crossed: boolean;
  }

  /** Water-run states per tile the search tells apart: up to the highest limit below open sea. */
  const RUNS = 1 + Math.max(...SETTLER_WATER.filter((w) => w < OPEN_SEA));
  const DX = [1, -1, 0, 0, 1, 1, -1, -1];
  const DY = [0, 0, 1, -1, 1, -1, 1, -1];

  let seen: Int32Array | null = null;
  let steps = new Int16Array(0);
  let parent = new Int32Array(0);
  let queue = new Int32Array(0);
  /** Per tile: the stamp of the last search it was too close to a city or a site in. */
  let blocked = new Int32Array(0);
  /** Per tile: the stamp of the last land-only search that reached it. */
  let byLand = new Int32Array(0);
  let searchStamp = 0;
  let blockStamp = 0;
  let landStamp = 0;

  function buffers(): Int32Array {
    if (!seen) {
      seen = new Int32Array(TILE_COUNT * RUNS);
      steps = new Int16Array(TILE_COUNT * RUNS);
      parent = new Int32Array(TILE_COUNT * RUNS);
      queue = new Int32Array(TILE_COUNT * RUNS);
      blocked = new Int32Array(TILE_COUNT);
      byLand = new Int32Array(TILE_COUNT);
    }
    return seen;
  }

  /**
   * Breadth-first over the eight neighbours from `from`: at most `range`
   * steps and `waterMax` water tiles in a row (0 keeps to land, OPEN_SEA
   * crosses anything). Rivers are land. Calls `visit` once per land tile, in
   * order of steps, with the search state `routeTo` needs.
   */
  function spread(
    world: WorldState, from: number, range: number, waterMax: number,
    visit: (tile: number, d: number, state: number) => void,
  ): void {
    const seenAt = buffers();
    const counted = waterMax < OPEN_SEA;
    const cur = ++searchStamp;
    let head = 0;
    let tail = 0;
    const s0 = from * RUNS;
    seenAt[s0] = cur;
    steps[s0] = 0;
    parent[s0] = -1;
    queue[tail++] = s0;
    while (head < tail) {
      const s = queue[head++];
      const tile = Math.floor(s / RUNS);
      const run = s - tile * RUNS;
      const d = steps[s];
      const wet = world.isWater(tile);
      if (!wet) visit(tile, d, s);
      if (d >= range) continue;
      const x = tile % GRID_W;
      const y = Math.floor(tile / GRID_W);
      for (let k = 0; k < 8; k++) {
        const ny = y + DY[k];
        if (ny < 0 || ny >= GRID_H) continue;
        const n = ny * GRID_W + wrapX(x + DX[k]);
        const nWet = world.isWater(n);
        // No slipping diagonally between two land tiles through a water corner.
        if (k >= 4 && !wet && !nWet && world.isWater(y * GRID_W + wrapX(x + DX[k])) && world.isWater(ny * GRID_W + x)) continue;
        let nRun = 0;
        if (nWet) {
          if (waterMax <= 0) continue;
          if (counted) {
            nRun = run + 1;
            if (nRun > waterMax) continue;
          }
        }
        const ns = n * RUNS + nRun;
        if (seenAt[ns] === cur) continue;
        seenAt[ns] = cur;
        steps[ns] = d + 1;
        parent[ns] = s;
        queue[tail++] = ns;
      }
    }
  }

  /** Tiles of the way to a state of the last search. */
  function routeTo(state: number): number[] {
    const path: number[] = [];
    for (let s = state; s >= 0; s = parent[s]) path.push(Math.floor(s / RUNS));
    return path.reverse();
  }

  /** Stamp every tile closer than CITY_MIN_DIST to a city or to another group's site. */
  function markBlocked(world: WorldState, except?: Settler): number {
    buffers();
    const cur = ++blockStamp;
    const stamp = (centre: number): void => {
      for (let k = 0; k < CITY_NEAR_DISC.length; k += 2) {
        const j = tileAt(centre, CITY_NEAR_DISC[k], CITY_NEAR_DISC[k + 1]);
        if (j >= 0) blocked[j] = cur;
      }
    };
    for (const c of world.civ.cities) stamp(c.tile);
    for (const s of world.civ.settlers) if (s !== except) stamp(s.path[s.path.length - 1]);
    return cur;
  }

  /** A test for the land tiles within `range` steps of `from` over land. */
  export function landWithin(world: WorldState, from: number, range: number): (tile: number) => boolean {
    buffers();
    const id = ++landStamp;
    spread(world, from, range, 0, (t) => { byLand[t] = id; });
    return (t) => byLand[t] === id;
  }

  /**
   * The way over land from `from` to the tile within `range` steps that
   * `value(tile, steps)` rates highest, the first found on a tie; null if it
   * rates every tile -Infinity.
   */
  export function bestLandRoute(
    world: WorldState, from: number, range: number, value: (tile: number, d: number) => number,
  ): number[] | null {
    let best = -Infinity;
    let at = -1;
    spread(world, from, range, 0, (tile, d, state) => {
      const v = value(tile, d);
      if (v > best) { best = v; at = state; }
    });
    return at >= 0 ? routeTo(at) : null;
  }

  /**
   * The best site for settlers carrying `tech` from `from` (spec §2.5): any
   * allowed tile in reach, by score minus SETTLER_PATH_COST per tile of way,
   * ties drawn from `world.rng`. A site reachable over land is walked to over
   * land. `keep` (a group's old site) wins while it is still allowed and in
   * reach; `except` is the group itself, whose site does not block.
   */
  export function findSettlerRoute(
    world: WorldState, from: number, tech: Tech, except?: Settler, keep = -1,
  ): SettlerRoute | null {
    const range = SETTLER_RANGE[tech];
    // A departing group walks at least CITY_MIN_DIST tiles, so it is seen under way.
    const minSteps = keep < 0 ? CITY_MIN_DIST : 0;
    const block = markBlocked(world, except);
    const land = ++landStamp;
    const ties: number[] = [];
    let best = -Infinity;
    const consider = (tile: number, d: number, state: number): void => {
      if (d < minSteps || blocked[tile] === block || !cityGroundFits(world, tile)) return;
      let value = Infinity;
      if (tile !== keep) {
        const score = citySiteScore(world, tile);
        if (score < SITE_MIN_SCORE) return;
        value = score - SETTLER_PATH_COST * d;
      }
      if (value > best + 1e-9) {
        best = value;
        ties.length = 0;
        ties.push(state);
      } else if (value >= best - 1e-9) {
        ties.push(state);
      }
    };
    const pick = (): number => ties[ties.length > 1 ? world.rng.int(ties.length) : 0];

    spread(world, from, range, 0, (tile, d, state) => {
      byLand[tile] = land;
      consider(tile, d, state);
    });
    const overLand = ties.length > 0 ? routeTo(pick()) : null;
    const landBest = best;

    ties.length = 0;
    best = -Infinity;
    spread(world, from, range, SETTLER_WATER[tech], (tile, d, state) => {
      if (byLand[tile] !== land) consider(tile, d, state);
    });
    if (ties.length > 0 && (overLand === null || best > landBest + 1e-9)) {
      return { path: routeTo(pick()), crossed: true };
    }
    return overLand ? { path: overLand, crossed: false } : null;
  }

  function loneCity(civ: CivState, c: City): boolean {
    return !civ.cities.some((o) => o !== c && o.tribe === c.tribe);
  }

  function settlersOf(civ: CivState, tribe: number): number {
    let n = 0;
    for (const s of civ.settlers) if (s.tribe === tribe) n++;
    return n;
  }

  /** City tiles have reached CITY_LAND_CAP of the planet's land: the world is settled. */
  export function citiesSaturated(world: WorldState): boolean {
    return world.civ.cities.length >= CITY_LAND_CAP * TILE_COUNT * (1 - world.oceanFraction);
  }

  /**
   * Full cities send settlers while the planet and the tribe have groups to
   * spare. On a settled world nobody leaves and cities only grow in size;
   * that is saturation, not want, so no city counts as cramped then.
   */
  export function sendSettlers(world: WorldState): void {
    if (!isLandLife(world.sentientClass)) return;
    const civ = world.civ;
    if (citiesSaturated(world)) {
      for (const c of civ.cities) c.cramped = false;
      return;
    }
    for (const c of civ.cities) {
      if (civ.settlers.length >= SETTLERS_MAX) return;
      if (world.ticks < c.settleAfter) continue;
      const pop = world.cityPop[c.tile];
      if (pop < SETTLER_DEPART_SHARE * c.capacity) continue;
      const tech = world.tech[c.tile] as Tech;
      // A people's only city on land too poor ever to reach the usual size
      // still sends its settlers, or the civilization never leaves it; so does
      // any such city while the planet has too few cities to invent the next
      // level, or two poor cities stay in the Stone Age for good.
      const stuck = loneCity(civ, c) || civ.cities.length < TECH_CITIES_MIN[tech];
      if (pop < SETTLER_DEPART_POP && (pop < SETTLER_POP + CITY_ABANDON_POP || !stuck)) continue;
      if (settlersOf(civ, c.tribe) >= SETTLERS_PER_TRIBE) continue;
      const route = findSettlerRoute(world, c.tile, tech);
      c.settleAfter = world.ticks + (route ? SETTLER_COOLDOWN[tech] : SETTLER_RETRY);
      c.cramped = route === null;
      const tribe = civ.tribe(c.tribe);
      if (tribe) {
        tribe.landShort = route === null;
        if (!route) tribe.shortUntil = world.ticks + TECH_ISOLATION_HOLD;
      }
      if (!route) continue;
      world.cityPop[c.tile] = pop - SETTLER_POP;
      civ.settlers.push({
        id: civ.nextId++, tribe: c.tribe, from: c.id, tech, path: route.path, step: 0, pop: SETTLER_POP,
        crossed: route.crossed,
      });
    }
  }

  /** The rest of the way still keeps to the group's water limit and ends on land. */
  function passable(world: WorldState, s: Settler): boolean {
    const goal = s.path[s.path.length - 1];
    if (world.isWater(goal)) return false;
    const max = SETTLER_WATER[s.tech];
    if (max >= OPEN_SEA) return true;
    let run = 0;
    for (let k = s.step + 1; k < s.path.length; k++) {
      run = world.isWater(s.path[k]) ? run + 1 : 0;
      if (run > max) return false;
    }
    return true;
  }

  function replan(world: WorldState, s: Settler): boolean {
    const route = findSettlerRoute(world, s.path[s.step], s.tech, s, s.path[s.path.length - 1]);
    if (!route) return false;
    s.path = route.path;
    s.step = 0;
    s.crossed = s.crossed || route.crossed;
    return true;
  }

  function disband(civ: CivState, s: Settler): void {
    const k = civ.settlers.indexOf(s);
    if (k >= 0) civ.settlers.splice(k, 1);
  }

  /** The best allowed site within SETTLER_DODGE of a site someone else took, or -1. */
  function dodge(world: WorldState, goal: number): number {
    let best = -1;
    let bestScore = -Infinity;
    for (let dy = -SETTLER_DODGE; dy <= SETTLER_DODGE; dy++) {
      for (let dx = -SETTLER_DODGE; dx <= SETTLER_DODGE; dx++) {
        const j = tileAt(goal, dx, dy);
        if (j < 0 || !citySiteAllowed(world, j)) continue;
        const score = citySiteScore(world, j);
        if (score > bestScore) { bestScore = score; best = j; }
      }
    }
    return best;
  }

  function arrive(world: WorldState, params: ModelParams, s: Settler): void {
    disband(world.civ, s);
    const goal = s.path[s.path.length - 1];
    const site = citySiteAllowed(world, goal) ? goal : dodge(world, goal);
    if (site < 0) return;
    world.tech[site] = s.tech;
    world.cityPop[site] = s.pop;
    foundCity(world, params, site, s.tribe, s.crossed);
  }

  /**
   * One tick of travel: a tile on land, two on water. A move of the plates or
   * a way cut by the sea plans the way again; a group that finds none
   * disbands.
   */
  export function moveSettlers(world: WorldState, params: ModelParams, drifted: boolean): void {
    const civ = world.civ;
    for (const s of civ.settlers.slice()) {
      if ((drifted || !passable(world, s)) && !replan(world, s)) {
        disband(civ, s);
        continue;
      }
      let budget = 2;
      while (s.step < s.path.length - 1) {
        const cost = world.isWater(s.path[s.step + 1]) ? 1 : 2;
        if (cost > budget) break;
        s.step++;
        budget -= cost;
      }
      if (s.step >= s.path.length - 1) arrive(world, params, s);
    }
  }
}
