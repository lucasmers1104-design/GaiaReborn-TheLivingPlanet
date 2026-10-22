/* =============================================================================
 * SimEarth 2.0 — the one railway line of the planet
 * -----------------------------------------------------------------------------
 * Like the first transcontinental railroad of 1869: once the continent the
 * voyage of discovery found (discovery.ts) has RAIL_CITIES_MIN cities of the
 * Industrial age or later, one line links them west to east — or, with
 * nothing found (or no line there RAIL_FOUND_WAIT ticks into the Industrial
 * age), the smallest landmass that has them. One clean line: from its
 * westernmost to its easternmost such city through at most
 * RAIL_STATIONS_MAX stations along the corridor between them, in order,
 * never doubling back and no part of it running beside another. The train
 * stops on a tile beside each station city, so the city stays in sight.
 * Its route is a cost search over land: steep flanks and the high mountains
 * cost dearly, valleys are cheap, rivers are bridged, the sea is never
 * crossed. One line only, no network, no roads (docs/bewegung-2026-10).
 *
 * The line lives in `civ.rail`; its tiles carry LAND_USE_RAIL, so no wild
 * plant grows on them (landfield.ts): a cut through the forest. Plate drift
 * lays it anew, a tile turned to water re-routes its leg, a lost station
 * leaves the line; with fewer than two stations left it is dropped and built
 * again once a landmass qualifies. Searches run only then, never per tick.
 * No world.rng: the same planet always gets the same line.
 * ========================================================================== */

namespace SE {
  export interface Railway {
    /** Read by the map: land tiles of the line, from its western end to its eastern end; consecutive tiles are 8-neighbours. */
    path: number[];
    /** Read by the map: indices into `path` of the stations, the tiles beside the station cities where the train stops, west to east; the first is 0, the last path.length − 1. */
    stations: number[];
    /** Read by the map: the station cities' tiles, one per station. */
    cities: number[];
    /** Read by the map: the highest age of its station cities, which sets the look of the track and the train. */
    era: Tech;
    /** Tick it opened. */
    built: number;
    /** `world.driftShifts` the line was last laid against. */
    shifts: number;
  }

  /** Chronicle key of the first line; a line built again after a loss reports only a short message. */
  const RAIL_KEY = 'civ:rail:first';

  /** One civilization tick of the railway (civ.ts calls it after the conflicts). */
  export function stepRailway(world: WorldState, params: ModelParams): void {
    void params;
    const rail = world.civ.rail;
    if (rail) keepRail(world, rail);
    else if (world.ticks % RAIL_CHECK_EVERY === 0) foundRail(world);
  }

  /* ---------------------------------------------------------- founding -- */

  /**
   * Per planet, the cities, voyage and drift of the last look that built no
   * line, and its tick: the landmasses and the route search are not looked at
   * again for the same situation before RAIL_RECHECK ticks.
   */
  const lastLook = new WeakMap<WorldState, { key: string; tick: number }>();

  function foundRail(world: WorldState): void {
    const civ = world.civ;
    const tiles: number[] = [];
    for (const c of civ.cities) if (world.tech[c.tile] >= Tech.Industrial) tiles.push(c.tile);
    if (tiles.length < RAIL_CITIES_MIN) return;
    const d = civ.discovery;
    const waited = civ.topTech >= Tech.Atomic || world.ticks - civ.topSince >= RAIL_FOUND_WAIT;
    const key = `${tiles.join(',')}|${d.state}|${d.landfall}|${waited}|${world.driftShifts}`;
    const last = lastLook.get(world);
    if (last && last.key === key && world.ticks >= last.tick && world.ticks - last.tick < RAIL_RECHECK) return;
    const cities = railCities(world, tiles, waited);
    const line = cities ? layLine(world, cities, new Map()) : null;
    if (!line || line.stations.length < RAIL_CITIES_MIN) {
      lastLook.set(world, { key, tick: world.ticks });
      return;
    }
    lastLook.delete(world);
    const rail: Railway = { ...line, era: Tech.Industrial, built: world.ticks, shifts: world.driftShifts };
    rail.era = lineEra(world, rail);
    civ.rail = rail;
    markRail(world, rail.path, true);
    civ.revision++;
    const west = stationName(world, rail, 0);
    const east = stationName(world, rail, rail.cities.length - 1);
    const at = rail.path[0];
    const maglev = rail.era >= Tech.Information;
    const kind = maglev ? 'Magnetbahn' : 'Eisenbahn';
    if (world.evo.chronicle.some((e) => e.key === RAIL_KEY)) {
      civ.news.push({ text: `Eine neue Bahnlinie verbindet ${west} und ${east}.`, tone: 'info', at });
      return;
    }
    const n = rail.stations.length;
    const change = maglev
      ? `Eine Magnetschwebebahn gleitet über ${n} Bahnhöfe von ${west} quer über den Kontinent nach ${east}. Eine Reise, die einst Monate dauerte, dauert nun wenige Stunden.`
      : rail.era >= Tech.Atomic
        ? `Hochgeschwindigkeitszüge fahren über ${n} Bahnhöfe von ${west} quer über den Kontinent nach ${east}. Eine Reise, die einst Monate dauerte, dauert nun wenige Stunden.`
        : `Dampflokomotiven fahren über ${n} Bahnhöfe von ${west} quer über den Kontinent nach ${east}. Wo Reisende und Waren Monate unterwegs waren, sind sie nun in wenigen Tagen am Ziel.`;
    civ.news.push({
      text: `Die erste ${kind} verbindet ${west} und ${east}.`, tone: 'info', at,
      chronicle: { key: RAIL_KEY, title: `Die erste ${kind}`, change, major: true },
    });
  }

  /** Per planet: the landmasses, with the drift and tick they were labelled at. */
  const labelled = new WeakMap<WorldState, { shifts: number; tick: number; lm: Landmasses }>();

  /**
   * The landmasses, labelled again only after drift or RAIL_RECHECK ticks on:
   * labelling the planet takes several milliseconds. ponytail: land the brush
   * or the sea level joins or splits counts as before until then; the route
   * search still keeps to the land as it is.
   */
  function railLandmasses(world: WorldState): Landmasses {
    const known = labelled.get(world);
    if (known && known.shifts === world.driftShifts && world.ticks >= known.tick && world.ticks - known.tick < RAIL_RECHECK) return known.lm;
    const lm = landmasses(world);
    labelled.set(world, { shifts: world.driftShifts, tick: world.ticks, lm });
    return lm;
  }

  /** The station cities of the line to build now among the Industrial cities' `tiles`, west to east, or null while no landmass qualifies. */
  function railCities(world: WorldState, tiles: readonly number[], waited: boolean): number[] | null {
    const civ = world.civ;
    // Under way to the new continent: the line waits for it.
    if (civ.discovery.state === 'sailing') return null;
    const lm = railLandmasses(world);
    const by = new Map<number, number[]>();
    for (const t of tiles) {
      const l = lm.label[t];
      if (l < 0) continue;
      const list = by.get(l);
      if (list) list.push(t);
      else by.set(l, [t]);
    }
    const fit = (l: number): number[] | null => {
      const list = by.get(l);
      return list && list.length >= RAIL_CITIES_MIN ? railCorridor(list) : null;
    };
    const d = civ.discovery;
    const found = d.state === 'found' && d.landfall >= 0 && d.landfall < TILE_COUNT ? lm.label[d.landfall] : -1;
    if (found >= 0) {
      const there = fit(found);
      if (there) return there;
      // The new continent first; after a while in the Industrial age another one takes the line.
      if (!waited) return null;
    }
    let best: number[] | null = null;
    let bestSize = Infinity;
    for (const l of [...by.keys()].sort((a, b) => a - b)) {
      if (lm.size[l] >= bestSize) continue;
      const cities = fit(l);
      if (cities) { best = cities; bestSize = lm.size[l]; }
    }
    return best;
  }

  /**
   * Stations along one corridor, west to east: the westernmost and the
   * easternmost city (x wraps: the cut is at the widest gap between them)
   * and, between them, cities at most RAIL_CORRIDOR tiles off the straight
   * line from one to the other, RAIL_STATION_GAP tiles or more apart along
   * it and at most RAIL_STATIONS_MAX in all; with none that near, the one
   * nearest it. Null while they span fewer than RAIL_SPAN_MIN tiles.
   */
  export function railCorridor(tiles: readonly number[]): number[] | null {
    const xs = [...new Set(tiles.map((t) => t % GRID_W))].sort((a, b) => a - b);
    let start = xs[0];
    let gap = xs[0] + GRID_W - xs[xs.length - 1];
    for (let k = 1; k < xs.length; k++) {
      if (xs[k] - xs[k - 1] > gap) { gap = xs[k] - xs[k - 1]; start = xs[k]; }
    }
    if (GRID_W - gap < RAIL_SPAN_MIN) return null;
    const ux = (t: number): number => wrapX((t % GRID_W) - start);
    const uy = (t: number): number => Math.floor(t / GRID_W);
    const order = [...tiles].sort((a, b) => ux(a) - ux(b) || a - b);
    const west = order[0];
    const east = order[order.length - 1];
    const vx = ux(east) - ux(west);
    const vy = uy(east) - uy(west);
    const len = Math.hypot(vx, vy);
    // Along the line from the west end, in tiles, and how far off it.
    const along = (t: number): number => ((ux(t) - ux(west)) * vx + (uy(t) - uy(west)) * vy) / len;
    const off = (t: number): number => Math.abs((ux(t) - ux(west)) * vy - (uy(t) - uy(west)) * vx) / len;
    const between = order.slice(1, -1).filter((t) => along(t) > 0 && along(t) < len).sort((a, b) => along(a) - along(b) || a - b);
    const step = Math.max(RAIL_STATION_GAP, len / (RAIL_STATIONS_MAX - 1));
    const out = [west];
    let last = 0;
    for (const t of between) {
      if (out.length >= RAIL_STATIONS_MAX - 1) break;
      if (off(t) > RAIL_CORRIDOR || along(t) - last < step || len - along(t) < RAIL_STATION_GAP) continue;
      out.push(t);
      last = along(t);
    }
    if (out.length === 1) {
      let near = -1;
      for (const t of between) if (near < 0 || off(t) < off(near)) near = t;
      if (near >= 0) out.push(near);
    }
    out.push(east);
    return out;
  }

  function stationName(world: WorldState, rail: Railway, k: number): string {
    return world.civ.cityAt(rail.cities[k])?.name ?? 'einer Stadt';
  }

  /** The highest age among the station cities, at least the Industrial age. */
  function lineEra(world: WorldState, rail: Railway): Tech {
    let era = Tech.Industrial;
    for (const c of rail.cities) era = Math.max(era, world.tech[c]);
    return era;
  }

  /** Set or clear LAND_USE_RAIL on the tiles; no other bit is touched. */
  function markRail(world: WorldState, path: readonly number[], on: boolean): void {
    const use = world.landUse;
    for (const i of path) use[i] = on ? use[i] | LAND_USE_RAIL : use[i] & ~LAND_USE_RAIL;
  }

  /* ------------------------------------------------------ keeping it -- */

  /** Follow drift, lost stations and tiles turned to water; take the new age. */
  function keepRail(world: WorldState, rail: Railway): void {
    const drifted = rail.shifts !== world.driftShifts;
    const cities = drifted ? rail.cities.map((t) => driftedCity(world, t)) : rail.cities;
    const kept = cities.filter((t) => t >= 0 && world.tech[t] !== Tech.None);
    const broken = drifted || kept.length !== rail.cities.length || rail.path.some((t) => world.isWater(t));
    if (broken) {
      // Legs still standing between the same two stops stay as they are; drift moved every one of them.
      const legs = new Map<string, number[]>();
      if (!drifted) {
        for (let k = 1; k < rail.stations.length; k++) {
          const leg = rail.path.slice(rail.stations[k - 1], rail.stations[k] + 1);
          legs.set(`${leg[0]}>${leg[leg.length - 1]}`, leg);
        }
      }
      const line = kept.length >= 2 ? layLine(world, kept, legs) : null;
      markRail(world, rail.path, false);
      world.civ.revision++;
      if (!line) {
        world.civ.news.push({ text: 'Die Eisenbahn quer über den Kontinent ist unterbrochen und wird nicht mehr befahren.', tone: 'warn', at: rail.path[0] });
        world.civ.rail = null;
        return;
      }
      rail.path = line.path;
      rail.stations = line.stations;
      rail.cities = line.cities;
      rail.shifts = world.driftShifts;
      markRail(world, rail.path, true);
    }
    const era = lineEra(world, rail);
    if (era === rail.era) return;
    const was = rail.era;
    rail.era = era;
    world.civ.revision++;
    const west = stationName(world, rail, 0);
    const east = stationName(world, rail, rail.cities.length - 1);
    const at = rail.path[0];
    if (era >= Tech.Information && was < Tech.Information) {
      world.civ.news.push({ text: `Zwischen ${west} und ${east} schwebt jetzt eine Magnetbahn über ihrem Fahrweg.`, tone: 'info', at });
    } else if (era >= Tech.Atomic && was < Tech.Atomic) {
      world.civ.news.push({ text: `Auf der Bahnlinie von ${west} nach ${east} fahren jetzt Hochgeschwindigkeitszüge.`, tone: 'info', at });
    }
  }

  /** The city a station on tile `t` became after a plate shifted its row, or −1. */
  function driftedCity(world: WorldState, t: number): number {
    for (let r = 0; r <= RAIL_DRIFT_REACH; r++) {
      for (const dx of r === 0 ? [0] : [-r, r]) {
        const j = tileAt(t, dx, 0);
        if (world.tech[j] !== Tech.None) return j;
      }
    }
    return -1;
  }

  /* -------------------------------------------------------- the route -- */

  /**
   * Neighbours of a city tile where its train may stop, and what each adds to
   * the route's cost: in front of it (south) in the 3/4 view the train hides
   * nothing, beside it a corner, behind it (north) the city's picture.
   */
  const STOP_DX = [0, -1, 1, -1, 1, -1, 1, 0];
  const STOP_DY = [1, 1, 1, 0, 0, -1, -1, -1];
  const STOP_COST = [0, 2, 2, 6, 6, 30, 30, 40];

  /**
   * The line through the stations of `cities` (tiles, west to east), leg by
   * leg; no leg crosses or runs beside an earlier one, so a station it
   * cannot pass that way (a dead end) is left out. Each train stops on the
   * neighbour of its city that the line passes best: the cheapest way from
   * the last stop plus the cheapest on to the next city, plus STOP_COST, so
   * the line runs past the station rather than turning back from it. While
   * more than RAIL_CITIES_MIN stations remain, a station the line would
   * still fold back at (a spur, a hairpin round a lake) is left out too. A
   * leg in `keep` (by "from>city") that still keeps to those rules is taken
   * as it is.
   */
  function layLine(world: WorldState, cities: readonly number[], keep: Map<string, number[]>): { path: number[]; stations: number[]; cities: number[] } | null {
    const used = new Uint8Array(TILE_COUNT);
    const near = new Uint8Array(TILE_COUNT);
    const take = (t: number): void => {
      used[t] = 1;
      for (let k = 0; k < 8; k++) {
        const j = tileAt(t, DX[k], DY[k]);
        if (j >= 0) near[j]++;
      }
    };
    const path: number[] = [];
    const stations: number[] = [];
    const out: number[] = [];
    let from = -1;
    let spare = cities.length - RAIL_CITIES_MIN;
    for (let k = 0; k < cities.length; k++) {
      const c = cities[k];
      const stops: number[] = [];
      const extra: number[] = [];
      for (let n = 0; n < 8; n++) {
        const j = tileAt(c, STOP_DX[n], STOP_DY[n]);
        if (j < 0 || world.isWater(j) || world.tech[j] !== Tech.None || used[j] || (from >= 0 && !open(j, from, -1, near))) continue;
        stops.push(j);
        extra.push(STOP_COST[n]);
      }
      if (stops.length === 0) continue;
      const kept = from >= 0 ? keep.get(`${from}>${c}`) : undefined;
      if (kept && stops.includes(kept[kept.length - 1]) && kept.every((t, j) => j === 0 || (!world.isWater(t) && !used[t] && open(t, from, -1, near)))) {
        for (let j = 1; j < kept.length; j++) {
          take(kept[j]);
          path.push(kept[j]);
        }
        stations.push(path.length - 1);
        out.push(c);
        from = kept[kept.length - 1];
        continue;
      }
      // The way in from the last stop to each stop, then on from each to the next city.
      const behind = stops.map(() => 0);
      let leg: number[] = [];
      if (from >= 0) {
        searchRail(world, from, c, stops, used, near, -1);
        stops.forEach((t, n) => { behind[n] = settledAt[t] ? cost[t] : Infinity; });
        cameIn.set(cameFrom);
      }
      const ahead = stops.map(() => 0);
      if (k + 1 < cities.length) {
        searchRail(world, cities[k + 1], c, stops, null, null, -1);
        stops.forEach((t, n) => { ahead[n] = settledAt[t] ? cost[t] : Infinity; });
      }
      let best = -1;
      let bestCost = Infinity;
      stops.forEach((t, n) => {
        if (behind[n] + ahead[n] + extra[n] < bestCost) { bestCost = behind[n] + ahead[n] + extra[n]; best = t; }
      });
      if (best < 0) continue;
      if (from >= 0) {
        leg = [best];
        for (let i = best; i !== from; i = cameIn[i]) leg.push(cameIn[i]);
        if (spare > 0 && k + 1 < cities.length && folds(leg, best)) {
          spare--;
          continue;
        }
      }
      if (from < 0) {
        take(best);
        path.push(best);
      } else {
        for (let j = leg.length - 2; j >= 0; j--) {
          take(leg[j]);
          path.push(leg[j]);
        }
      }
      stations.push(path.length - 1);
      out.push(c);
      from = best;
    }
    return stations.length >= 2 ? { path, stations, cities: out } : null;
  }

  /** The way in of the last search from the last stop, kept while the way on is searched. */
  const cameIn = new Int32Array(TILE_COUNT);

  /**
   * The line would fold back at stop `s`: from RAIL_FOLD_REACH tiles before
   * it on the way in (`leg`, from the stop backwards) to as many on along the
   * way on (the last search, from the next city), the two ends lie less than
   * RAIL_FOLD_SHARE of the way between them apart: a spur, a hairpin.
   */
  function folds(leg: readonly number[], s: number): boolean {
    const way = [s];
    for (let n = 0; n < RAIL_FOLD_REACH && cameFrom[way[way.length - 1]] >= 0; n++) way.push(cameFrom[way[way.length - 1]]);
    const tiles = [...leg.slice(1, RAIL_FOLD_REACH + 1).reverse(), ...way];
    let along = 0;
    for (let n = 1; n < tiles.length; n++) along += tileDistance(tiles[n - 1], tiles[n]);
    return tileDistance(tiles[0], tiles[tiles.length - 1]) < RAIL_FOLD_SHARE * along;
  }

  /** A leg from `from` may step on tile j: it touches no earlier tile of the line but `from` itself (and its goal `to`). */
  function open(j: number, from: number, to: number, near: Uint8Array): boolean {
    return j === to || near[j] === 0 || (near[j] === 1 && touching(j, from));
  }

  /** A binary min-heap of (cost, tile) for the route search; it grows as needed (a tile may be pushed again). */
  class RailHeap {
    private keys: number[] = [];
    private tiles: number[] = [];

    get size(): number {
      return this.keys.length;
    }

    push(key: number, tile: number): void {
      const { keys, tiles } = this;
      let i = keys.length;
      keys.push(key);
      tiles.push(tile);
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (keys[p] <= key) break;
        keys[i] = keys[p];
        tiles[i] = tiles[p];
        i = p;
      }
      keys[i] = key;
      tiles[i] = tile;
    }

    pop(): number {
      const { keys, tiles } = this;
      const top = tiles[0];
      const key = keys.pop()!;
      const tile = tiles.pop()!;
      const n = keys.length;
      if (n === 0) return top;
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= key) break;
        keys[i] = keys[c];
        tiles[i] = tiles[c];
        i = c;
      }
      keys[i] = key;
      tiles[i] = tile;
      return top;
    }
  }

  /** The last search: cost from its start, the step each tile was reached from, and which tiles are settled. */
  const cost = new Float32Array(TILE_COUNT);
  const cameFrom = new Int32Array(TILE_COUNT);
  const settledAt = new Uint8Array(TILE_COUNT);
  const DX = [-1, 0, 1, -1, 1, -1, 0, 1];
  const DY = [-1, -1, -1, 0, 0, 1, 1, 1];

  /**
   * A* over land from `from`, aimed at `toward` (octile distance, counted
   * RAIL_SEARCH_GREED times), until
   * every tile of `goals` is settled; with `used`, it never steps on those
   * tiles nor beside them (`near` counts the used tiles round each tile), but
   * for the step off `from` and onto `to`. Each step costs its length, plus
   * the gradient's square, the height, the high mountains, a river bridged, a
   * strait cut, a wonder passed and a city crossed (constants.ts RAIL_*).
   * The results are in `cost`, `cameFrom` and `settledAt`.
   */
  function searchRail(world: WorldState, from: number, toward: number, goals: readonly number[], used: Uint8Array | null, near: Uint8Array | null, to: number): void {
    const e = world.elevation;
    const { landscape, riverLevel, landUse, tech } = world;
    const tx = toward % GRID_W;
    const ty = (toward / GRID_W) | 0;
    cost.fill(Infinity);
    cameFrom.fill(-1);
    settledAt.fill(0);
    if (e[from] < 0) return;
    const heap = new RailHeap();
    cost[from] = 0;
    heap.push(0, from);
    let settled = 0;
    let found = 0;
    while (heap.size > 0) {
      const i = heap.pop();
      // A tile pushed again with a lower cost is popped again later: settle it once.
      if (settledAt[i]) continue;
      settledAt[i] = 1;
      if (goals.includes(i) && ++found === goals.length) return;
      if (++settled > RAIL_SEARCH_MAX) return;
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      const g = cost[i];
      for (let k = 0; k < 8; k++) {
        const ny = y + DY[k];
        if (ny < 0 || ny >= GRID_H) continue;
        const nx = wrapX(x + DX[k]);
        const j = ny * GRID_W + nx;
        if (e[j] < 0 || settledAt[j]) continue;
        if (used && j !== to && (used[j] || (near && !open(j, from, to, near)))) continue;
        const diag = DX[k] !== 0 && DY[k] !== 0;
        const len = diag ? Math.SQRT2 : 1;
        const grade = Math.abs(e[j] - e[i]) / len / RAIL_SLOPE_REF;
        let c = len * (1 + grade * grade) + RAIL_HEIGHT_COST * Math.max(0, e[j]);
        const ls = landscape[j];
        if (aboveTreeLine(world, j) || ls === Landscape.Ice || ls === Landscape.Snow) c += RAIL_MOUNTAIN_COST;
        if (riverLevel[j] > 0) c += RAIL_BRIDGE_COST;
        if (landUse[j] & LAND_USE_WONDER) c += RAIL_WONDER_COST;
        if (tech[j] !== Tech.None) c += RAIL_CITY_COST;
        if (diag && e[y * GRID_W + nx] < 0 && e[ny * GRID_W + x] < 0) c += RAIL_STRAIT_COST;
        const gj = g + c;
        if (gj >= cost[j]) continue;
        cost[j] = gj;
        cameFrom[j] = i;
        let dx = Math.abs(nx - tx);
        if (dx > GRID_W / 2) dx = GRID_W - dx;
        const dy = Math.abs(ny - ty);
        heap.push(gj + RAIL_SEARCH_GREED * (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)), j);
      }
    }
  }

  /**
   * The cheapest way over land from `from` to `to` (searchRail), never on
   * nor beside `used` tiles but at its ends; null when the sea or the line
   * itself cuts `to` off.
   */
  export function routeRail(world: WorldState, from: number, to: number, used: Uint8Array | null = null, near: Uint8Array | null = null): number[] | null {
    if (world.isWater(to)) return null;
    searchRail(world, from, to, [to], used, near, to);
    if (!settledAt[to]) return null;
    const out = [to];
    for (let i = to; i !== from; i = cameFrom[i]) out.push(cameFrom[i]);
    return out.reverse();
  }

  /* -------------------------------------------------------------- save -- */

  /** The optional save field `rail`; undefined writes none. */
  export function railToJSON(world: WorldState): unknown {
    const r = world.civ.rail;
    return r ? { path: r.path.slice(), stations: r.stations.slice(), cities: r.cities.slice(), era: r.era, built: r.built } : undefined;
  }

  /** Neighbouring tiles (8 neighbours, x wraps). */
  function touching(a: number, b: number): boolean {
    let dx = Math.abs((a % GRID_W) - (b % GRID_W));
    if (dx === GRID_W - 1) dx = 1;
    return a !== b && dx <= 1 && Math.abs(Math.floor(a / GRID_W) - Math.floor(b / GRID_W)) <= 1;
  }

  /** Take over the optional save field `rail` after the civilization's records (save.ts); a missing or unsound one changes nothing. */
  export function restoreRail(world: WorldState, raw: unknown): void {
    if (!raw || typeof raw !== 'object') return;
    const o = raw as { path?: unknown; stations?: unknown; cities?: unknown; era?: unknown; built?: unknown };
    const ints = (v: unknown, max: number): v is number[] =>
      Array.isArray(v) && v.length >= 2 && v.every((n) => Number.isInteger(n) && n >= 0 && n < max);
    if (!ints(o.path, TILE_COUNT) || new Set(o.path).size !== o.path.length) return;
    const path = o.path;
    if (!path.every((t, k) => k === 0 || touching(path[k - 1], t))) return;
    if (!ints(o.stations, path.length) || !ints(o.cities, TILE_COUNT)) return;
    const stations = o.stations;
    const cities = o.cities;
    if (cities.length !== stations.length) return;
    if (stations[0] !== 0 || stations[stations.length - 1] !== path.length - 1 || !stations.every((s, k) => k === 0 || s > stations[k - 1])) return;
    const era = o.era;
    if (!Number.isInteger(era) || (era as number) < Tech.Industrial || (era as number) > Tech.Nanotech) return;
    const built = typeof o.built === 'number' && Number.isFinite(o.built) ? o.built : world.ticks;
    if (world.civ.rail) markRail(world, world.civ.rail.path, false);
    world.civ.rail = { path: path.slice(), stations: stations.slice(), cities: cities.slice(), era: era as Tech, built, shifts: world.driftShifts };
    markRail(world, path, true);
    world.civ.revision++;
  }
}
