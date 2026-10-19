/* =============================================================================
 * SimEarth 2.0 — floods: water running up the land, standing, receding
 * -----------------------------------------------------------------------------
 * docs/ereignisse-spec.md §3.4, §3.5. Where a tidal wave or a storm surge
 * touches the coast, the water runs up. The whole run is planned when it
 * starts: a shortest-time search over land from the coast water (diagonals
 * √2, FLOOD_RUNUP_TICKS a tile, from each coast tile's exact arrival),
 * losing FLOOD_RUNUP_LOSS of height a land step from the second land tile
 * on. The water stands, then its edge runs back to the sea, inland first,
 * and leaves mud. The mud is laid the tick before the screen dries a tile,
 * so the map underneath has caught up (hazardwater.ts starts the runs,
 * fxground.ts reveals the plan pixel by pixel).
 * ========================================================================== */

namespace SE {
  /** Water running up the land, then standing, then receding. */
  export interface FloodRun {
    /** Tiles the water reached this tick and the height left on each. */
    front: number[];
    height: number[];
    /** Ticks stepped; the first is the tick the run started in. */
    steps: number;
    /** Hazard age of the tick the run started in. */
    born: number;
    /**
     * The plan, in order of flooding: each tile, the land step that reaches
     * it, when the water arrives and when it has run off again (fractional
     * hazard ages; on screen at age − 1 + tick phase), and how deep it stands.
     */
    tiles: number[];
    reach: number[];
    at: number[];
    off: number[];
    depth: number[];
  }

  /** Scars a flood washes over with mud; any other (a vent, ruins, a crater) stays. */
  const MUD_OVER: readonly number[] = [ScarKind.None, ScarKind.Mud, ScarKind.Windthrow, ScarKind.Burnt, ScarKind.Scorched, ScarKind.Ash];

  /** The neighbour of tile i in direction k (HAZARD_NX / HAZARD_NY), or -1 past a pole. */
  export function hazardNeighbour(i: number, k: number): number {
    const y = ((i / GRID_W) | 0) + HAZARD_NY[k];
    return y < 0 || y >= GRID_H ? -1 : idx(wrapX((i % GRID_W) + HAZARD_NX[k]), y);
  }

  /** The tick a tile's mud is laid: the first whose age reaches off − 1, a tick before the screen dries it. */
  export function floodDryTick(off: number): number {
    return Math.ceil(off - 1);
  }

  /** Water over a land tile `depth` deep: life drowns, soft plants wash away, a city loses people. */
  function flood(world: WorldState, i: number, depth: number): void {
    const hz = world.hazards;
    const t = Math.min(1, depth / FLOOD_DEPTH_FULL);
    hazardKillLife(world, i, FLOOD_LIFE_LOSS * (FLOOD_LIFE_SHALLOW + (1 - FLOOD_LIFE_SHALLOW) * t));
    world.flora[i] &= WOODY_FLORA_MASK;
    world.vegetation[i] *= FLOOD_VEGETATION_KEEP;
    hazardHitCity(world, i, FLOOD_CITY_LOSS + (1 - FLOOD_CITY_LOSS) * t);
    hz.tile[i] = HazardTile.Flood;
    hz.level[i] = clamp(Math.round(depth * 1000), 1, 255);
    hz.revision++;
  }

  /**
   * The water has run off: the tile falls back to raw ground under a layer
   * of mud, wet. Only now, not while the screen still shows the water
   * running up: wet ground turns the map's ground to mire at once.
   */
  function recede(world: WorldState, i: number): void {
    const hz = world.hazards;
    if (hz.tile[i] !== HazardTile.Flood) return;
    world.moisture[i] = Math.min(1, world.moisture[i] + FLOOD_MOISTURE);
    hz.tile[i] = HazardTile.None;
    hz.level[i] = 0;
    // The scar first: it heals once the landscape climbs back to where it stood before the flood.
    if (MUD_OVER.includes(hz.scar[i])) setScar(world, i, ScarKind.Mud);
    SuccessionSystem.clear(world, i);
    hz.revision++;
  }

  interface Reach {
    /** Arrival on the coast tile it came from, tiles of path from there, the wave's height there. */
    t0: number;
    d: number;
    h: number;
  }

  /** Land steps of a path `d` tiles long: the first land tile is step 1. */
  const stepOf = (d: number): number => Math.ceil(d - 1e-9);

  /**
   * Plan `run` from its sources (front = coast water, height = the wave's
   * height there), `coastAt` the arrival on each (default: the start of the
   * run's tick). Land other runs have planned, or under another hazard, stays dry.
   */
  function plan(world: WorldState, runs: readonly FloodRun[], run: FloodRun, coastAt?: readonly number[]): void {
    const e = world.elevation;
    const hz = world.hazards;
    const taken = new Set<number>();
    // Water still standing from earlier runs is theirs; where it has run off, the land may flood again.
    for (const r of runs) {
      r.tiles.forEach((i, m) => {
        if (floodDryTick(r.off[m]) >= run.born) taken.add(i);
      });
    }
    const best = new Map<number, Reach>();
    const time = (r: Reach): number => r.t0 + (r.d - 1) * FLOOD_RUNUP_TICKS;
    const open: number[] = [];
    const relax = (from: number, t0: number, d0: number, h: number): void => {
      for (let k = 0; k < 8; k++) {
        const j = hazardNeighbour(from, k);
        if (j < 0 || e[j] < 0 || taken.has(j)) continue;
        if (hz.tile[j] !== HazardTile.None && hz.tile[j] !== HazardTile.Wet) continue;
        const d = d0 + (HAZARD_NX[k] !== 0 && HAZARD_NY[k] !== 0 ? Math.SQRT2 : 1);
        const step = stepOf(d);
        if (step > FLOOD_RUNUP_STEPS || e[j] >= h - FLOOD_RUNUP_LOSS * (step - 1)) continue;
        const r = { t0, d, h };
        const was = best.get(j);
        if (was && time(was) <= time(r)) continue;
        if (!was) open.push(j);
        best.set(j, r);
      }
    };
    run.front.forEach((c, f) => relax(c, coastAt?.[f] ?? run.born - 1, 0, run.height[f]));
    const dist: number[] = [];
    // ponytail: open list scanned linearly; a run plans a few hundred tiles at most, a heap if that ever grows.
    while (open.length > 0) {
      let m = 0;
      for (let q = 1; q < open.length; q++) if (time(best.get(open[q]) as Reach) < time(best.get(open[m]) as Reach)) m = q;
      const j = open[m];
      open[m] = open[open.length - 1];
      open.pop();
      taken.add(j);
      const r = best.get(j) as Reach;
      const step = stepOf(r.d);
      run.tiles.push(j);
      run.reach.push(step);
      run.at.push(time(r));
      run.depth.push(r.h - FLOOD_RUNUP_LOSS * (step - 1) - e[j]);
      dist.push(r.d);
      relax(j, r.t0, r.d, r.h);
    }
    // The water stands, then its edge runs back to the sea: the farthest tile first.
    const stop = Math.max(...run.at);
    const far = Math.max(...dist);
    for (const d of dist) run.off.push(stop + FLOOD_HOLD_TICKS + (far - d) * FLOOD_RECEDE_TICKS);
    run.front = [];
    run.height = [];
  }

  /** One tick of a run: flood what the water reaches in it, lay the mud where it runs off; false once all is dry. */
  function stepRun(world: WorldState, run: FloodRun): boolean {
    const age = run.born + run.steps++;
    run.front = [];
    run.height = [];
    let wet = false;
    for (let m = 0; m < run.tiles.length; m++) {
      const i = run.tiles[m];
      if (run.at[m] < age && run.at[m] >= age - 1) {
        flood(world, i, run.depth[m]);
        run.front.push(i);
        run.height.push(world.elevation[i] + run.depth[m]);
      }
      const dry = floodDryTick(run.off[m]);
      if (dry === age) recede(world, i);
      else if (dry > age) wet = true;
    }
    // Stay listed until the screen has shown the last tile dry and its backwash.
    return wet || age - 1 < Math.max(...run.off) + FLOOD_TRAIL_TICKS;
  }

  /**
   * Start water running up the land from the coast water tiles `coast`,
   * each bringing the wave height in `height` and reached at hazard age
   * `coastAt` (default: the start of this tick, as for a storm surge). Its
   * first land tiles flood at the next hazardStepFloods, in this tick.
   */
  export function hazardRunUp(world: WorldState, h: Hazard, coast: number[], height: number[], coastAt?: readonly number[]): void {
    const runs = h.wave?.runs ?? h.storm?.runs;
    if (!runs || coast.length === 0) return;
    const run: FloodRun = { front: coast, height, steps: 0, born: h.age, tiles: [], reach: [], at: [], off: [], depth: [] };
    plan(world, runs, run, coastAt);
    if (run.tiles.length > 0) runs.push(run);
  }

  /**
   * Water standing on the land tiles `tiles` where it falls, not running up
   * from the sea (rain): tile m floods `depth` deep at hazard age at[m] and
   * runs off at off[m], at least FLOOD_HOLD_TICKS later. Land under standing
   * water or another hazard stays as it is. The water rises at the next
   * hazardStepFloods whose tick holds at[m].
   */
  export function hazardStandWater(world: WorldState, h: Hazard, tiles: readonly number[], depth: number, at: readonly number[], off: readonly number[]): void {
    const runs = h.wave?.runs ?? h.storm?.runs;
    if (!runs) return;
    const hz = world.hazards;
    const taken = new Set<number>();
    for (const r of runs) r.tiles.forEach((i, m) => { if (floodDryTick(r.off[m]) >= h.age) taken.add(i); });
    const run: FloodRun = { front: [], height: [], steps: 0, born: h.age, tiles: [], reach: [], at: [], off: [], depth: [] };
    tiles.forEach((i, m) => {
      if (world.elevation[i] < 0 || taken.has(i) || (hz.tile[i] !== HazardTile.None && hz.tile[i] !== HazardTile.Wet)) return;
      run.tiles.push(i);
      run.reach.push(1);
      run.at.push(at[m]);
      run.off.push(off[m]);
      run.depth.push(depth);
    });
    if (run.tiles.length > 0) runs.push(run);
  }

  /** One tick of every run; finished runs drop out. */
  export function hazardStepFloods(world: WorldState, runs: FloodRun[]): void {
    let n = 0;
    for (const run of runs) if (stepRun(world, run)) runs[n++] = run;
    runs.length = n;
  }

  /** All the water off the land at once: the aftermath straight away. */
  export function hazardDrainFloods(world: WorldState, runs: FloodRun[]): void {
    for (const run of runs) {
      const age = run.born + run.steps - 1;
      run.tiles.forEach((i, m) => {
        if (run.at[m] < age && floodDryTick(run.off[m]) > age) recede(world, i);
      });
    }
    runs.length = 0;
  }
}
