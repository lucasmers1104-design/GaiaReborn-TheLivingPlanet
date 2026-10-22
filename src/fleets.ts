/* =============================================================================
 * SimEarth 2.0 — ships of the coastal cities, liners and sea battles
 * -----------------------------------------------------------------------------
 * From the Bronze age every town and metropolis on the open sea keeps a ship
 * or two (docs/bewegung-2026-10). Each moors off its city and sails a route
 * of water tiles back and forth: to a coastal city of its people within
 * reach, else a short loop along its own coast, always near land. From the
 * Industrial age liners link big coastal cities on different landmasses
 * across the open sea. A conflict between two coastal cities on one sea is
 * also fought on the water: their ships sail to stations round a point
 * between the two harbours, and when it ends the loser's ships there sink
 * (conflict.ts names the winner, as before). A city short of wood builds no
 * new ship (wood.ts); a ship once built stays until its city is lost, its
 * route can no longer be found or it sinks, so ships do not come and go with
 * a city's size.
 *
 * Ships sail and wait only on the fairway (`fairway`): where the whole hull
 * lies over open water and no city, railway or wonder stands in the rows it
 * reaches into. Where ships wait (moorings, route ends, battle stations) they
 * keep SHIP_GAP_X / SHIP_GAP_Y apart, so no two are drawn on one spot.
 *
 * Ships are records beside the grid like every civilization record: never
 * saved, `civ.clear()` drops them and the cities launch them again. Routes
 * are searched only when a ship is launched or its route breaks (drift, the
 * brush, ice, a new city at the shore), each search bounded in steps. No
 * world.rng: rolls are hashes of the seed and ids, so every planet's history
 * stays as it was. Pure, no DOM; the map is shiplayer.ts.
 * ========================================================================== */

namespace SE {
  export type ShipKind = 'coast' | 'liner';

  export interface Ship {
    /** Read by the map. Launch tick × SHIP_IDS_PER_TICK + its rank among that tick's launches: never reused on a planet. */
    readonly id: number;
    /** Read by the map. */
    readonly kind: ShipKind;
    /** `City.id` of its home port; a liner sails from there to `to`. */
    readonly city: number;
    /** A liner's other port (`City.id`); −1 for a coastal ship. */
    readonly to: number;
    /** Read by the map: `Tribe.id` of its city, for the pennant. */
    tribe: number;
    /** Read by the map: its city's era, for its look. */
    tech: Tech;
    /** Read by the map: fairway tiles it sails back and forth, from its mooring off its city on. */
    route: number[];
    /** Read by the map: tick of its launch or of its last new route. */
    since: number;
    /** Read by the map: fairway tiles from `route[0]` to its battle station while it fights (kept once it sank there), else empty. */
    fight: number[];
    /** Read by the map: `Tribe.id` it fights for, −1 out of battle. */
    side: number;
    /** The conflict it fights in, until that ends. */
    war: Conflict | null;
    /** Read by the map: tick it sank in battle, −1 while afloat. */
    sunkAt: number;
  }

  /** Launches a tick may hold at most: one coastal ship, one liner, one ship for each city going to war. */
  const SHIP_IDS_PER_TICK = 8;

  /** Farthest a mooring can lie from its city, tiles: SHIP_MOOR_REACH steps (diagonal ones too) from the water beside it. */
  const PORT_NEAR = (SHIP_MOOR_REACH + 1) * Math.SQRT2 + 0.5;

  /** Neighbours, straight ones first. */
  const NX = [1, -1, 0, 0, 1, 1, -1, -1];
  const NY = [0, 0, 1, -1, 1, -1, 1, -1];

  /** Per tile: the stamp of the last search that reached it, the tile it came from and its steps. */
  let seenAt = new Int32Array(0);
  let parentOf = new Int32Array(0);
  let stepsOf = new Int32Array(0);
  let queue = new Int32Array(0);
  /** Per tile: the stamp of the last search whose `pass` turned it away, so it is asked once per search. */
  let blockedAt = new Int32Array(0);
  let stamp = 0;

  const anyWater = (): boolean => true;

  /** Water free of pack ice: at least `warm` °C. */
  function openWater(world: WorldState, i: number, warm = SHIP_ICE_FREE): boolean {
    return world.isWater(i) && world.temperature[i] >= warm;
  }

  /**
   * A ship may lie on tile `i`: open water (at least `warm` °C) SHIP_HULL_REACH
   * tiles east and west, and no city, railway or wonder in the rows above and
   * below those tiles.
   */
  function fairway(world: WorldState, i: number, warm = SHIP_ICE_FREE): boolean {
    const x = i % GRID_W;
    const y = (i / GRID_W) | 0;
    for (let dx = -SHIP_HULL_REACH; dx <= SHIP_HULL_REACH; dx++) {
      const cx = wrapX(x + dx);
      if (!openWater(world, y * GRID_W + cx, warm)) return false;
      for (let dy = -1; dy <= 1; dy += 2) {
        const ny = y + dy;
        if (ny < 0 || ny >= GRID_H) continue;
        const j = ny * GRID_W + cx;
        if (world.tech[j] !== Tech.None || (world.landUse[j] & (LAND_USE_RAIL | LAND_USE_WONDER)) !== 0) return false;
      }
    }
    return true;
  }

  /**
   * Breadth-first over open water (`openWater`) from `from`: eight neighbours,
   * never diagonally past a land corner, at most `range` steps, only onto
   * tiles `pass` lets through. Calls `visit` for each tile reached, nearest
   * first, and stops at the first for which it returns true: that tile, or
   * −1. `wayTo` gives the way to any tile it reached, until the next search.
   */
  function sail(
    world: WorldState, from: number, range: number, pass: (i: number) => boolean, visit: (i: number, d: number) => boolean,
  ): number {
    if (seenAt.length !== TILE_COUNT) {
      seenAt = new Int32Array(TILE_COUNT);
      parentOf = new Int32Array(TILE_COUNT);
      stepsOf = new Int32Array(TILE_COUNT);
      queue = new Int32Array(TILE_COUNT);
      blockedAt = new Int32Array(TILE_COUNT);
    }
    const cur = ++stamp;
    let head = 0;
    let tail = 0;
    seenAt[from] = cur;
    parentOf[from] = -1;
    stepsOf[from] = 0;
    queue[tail++] = from;
    while (head < tail) {
      const i = queue[head++];
      const d = stepsOf[i];
      if (visit(i, d)) return i;
      if (d >= range) continue;
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      for (let k = 0; k < 8; k++) {
        const ny = y + NY[k];
        if (ny < 0 || ny >= GRID_H) continue;
        const nx = wrapX(x + NX[k]);
        const j = ny * GRID_W + nx;
        if (seenAt[j] === cur || blockedAt[j] === cur || !openWater(world, j)) continue;
        if (!pass(j)) {
          blockedAt[j] = cur;
          continue;
        }
        if (k >= 4 && (!world.isWater(y * GRID_W + nx) || !world.isWater(ny * GRID_W + x))) continue;
        seenAt[j] = cur;
        parentOf[j] = i;
        stepsOf[j] = d + 1;
        queue[tail++] = j;
      }
    }
    return -1;
  }

  /** The way of the last search to `tile`, from its start on; empty when it did not reach it. */
  function wayTo(tile: number): number[] {
    if (tile < 0 || seenAt[tile] !== stamp) return [];
    const way: number[] = [];
    for (let i = tile; i >= 0; i = parentOf[i]) way.push(i);
    return way.reverse();
  }

  /** Land within `reach` tiles (square) of tile `i`; ring by ring outwards, so a tile beside the coast answers at once. */
  function nearLand(world: WorldState, i: number, reach: number): boolean {
    for (let r = 1; r <= reach; r++) {
      for (let dy = -r; dy <= r; dy++) {
        const edge = dy === -r || dy === r;
        for (let dx = -r; dx <= r; dx += edge ? 1 : 2 * r) {
          const j = tileAt(i, dx, dy);
          if (j >= 0 && !world.isWater(j)) return true;
        }
      }
    }
    return false;
  }

  /** The water tile `i` lies on an open sea of SHIP_SEA_MIN tiles or more, not on a lake or in the ice. */
  function openSea(world: WorldState, i: number): boolean {
    let n = 0;
    return sail(world, i, TILE_COUNT, anyWater, () => ++n >= SHIP_SEA_MIN) >= 0;
  }

  /** A city's harbour: the first water tile beside it on the open sea, straight neighbours first; −1 inland or on a lake. */
  export function shipHarbour(world: WorldState, tile: number): number {
    for (let k = 0; k < 8; k++) {
      const j = tileAt(tile, NX[k], NY[k]);
      if (j >= 0 && openWater(world, j) && openSea(world, j)) return j;
    }
    return -1;
  }

  /** The look of a ship of era `tech` on the map, by catalog id (tools/fx/catalog.js); null before the Bronze age. */
  export function shipSprite(tech: Tech, fighting: boolean): string | null {
    if (tech < Tech.Bronze) return null;
    if (fighting && tech >= Tech.Industrial) return 'ship_warship';
    return tech === Tech.Bronze ? 'ship_galley' : tech === Tech.Iron ? 'ship_trireme' : tech === Tech.Industrial ? 'ship_steamer' : 'ship_freighter';
  }

  function shipRoll(world: WorldState, city: number, salt: number): number {
    return spontaneousRoll(world.seed, city, 0x5e1f00 + salt);
  }

  /** Two waiting ships on tiles `a` and `b` do not touch. */
  function apart(a: number, b: number): boolean {
    let dx = Math.abs((a % GRID_W) - (b % GRID_W));
    if (dx > GRID_W / 2) dx = GRID_W - dx;
    return dx >= SHIP_GAP_X || Math.abs(Math.floor(a / GRID_W) - Math.floor(b / GRID_W)) >= SHIP_GAP_Y;
  }

  function free(i: number, waits: readonly number[]): boolean {
    for (const w of waits) if (!apart(i, w)) return false;
    return true;
  }

  /** Where the ships afloat wait: both ends of each route and each battle station; without `except`. */
  function waitingPoints(civ: CivState, except: Ship | null = null): number[] {
    const out: number[] = [];
    for (const s of civ.ships) {
      if (s === except || s.sunkAt >= 0 || s.route.length === 0) continue;
      out.push(s.route[0], s.route[s.route.length - 1]);
      if (s.fight.length > 0) out.push(s.fight[s.fight.length - 1]);
    }
    return out;
  }

  /** Tiles within SHIP_MOOR_REACH + 1 of each city's tile, by the city: where a way to that port may end. */
  function portZones(cities: readonly City[]): Map<number, City> {
    const out = new Map<number, City>();
    const r = SHIP_MOOR_REACH + 1;
    for (const c of cities) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const j = tileAt(c.tile, dx, dy);
          if (j >= 0 && !out.has(j)) out.set(j, c);
        }
      }
    }
    return out;
  }

  /** A mooring off `harbour`: the nearest tile `pass` lets through within SHIP_MOOR_REACH steps, apart from `waits`; −1 for none. */
  function mooring(world: WorldState, harbour: number, waits: readonly number[], pass: (i: number) => boolean): number {
    return sail(world, harbour, SHIP_MOOR_REACH, anyWater, (i) => pass(i) && free(i, waits));
  }

  /** The fairway near land a coastal ship of `city` keeps to. */
  function coastPass(world: WorldState, city: City): (i: number) => boolean {
    const reach = world.tech[city.tile] >= Tech.Industrial ? SHIP_COAST_REACH_MODERN : SHIP_COAST_REACH;
    return (i) => fairway(world, i) && nearLand(world, i, reach);
  }

  /**
   * Route of the `k`-th ship of `city`: from a free mooring off its harbour,
   * the even ones to a free mooring off a coastal city of its people within
   * SHIP_ROUTE_MAX steps (the nearest first), the others, and those without,
   * on a loop along its own coast to a free tile SHIP_LOOP steps away (picked
   * by hash). Empty when no way of SHIP_ROUTE_MIN steps is found.
   */
  function coastRoute(world: WorldState, city: City, k: number, waits: readonly number[]): number[] {
    const harbour = shipHarbour(world, city.tile);
    if (harbour < 0) return [];
    const pass = coastPass(world, city);
    const start = mooring(world, harbour, waits, pass);
    if (start < 0) return [];
    const ends = waits.concat(start);
    const sisters = k % 2 === 0 ?
      portZones(world.civ.cities.filter((c) => c !== city && c.tribe === city.tribe && tileDistance(c.tile, city.tile) <= SHIP_ROUTE_MAX)) :
      null;
    const want = k >> 1;
    const reached = new Set<City>();
    const loop: number[] = [];
    let far = 0;
    const end = sail(world, start, sisters && sisters.size > 0 ? SHIP_ROUTE_MAX : SHIP_LOOP, pass, (i, d) => {
      if (d === 0 || !free(i, ends)) return false;
      const c = d > SHIP_ROUTE_MIN ? sisters?.get(i) : undefined;
      if (c && !reached.has(c)) {
        reached.add(c);
        if (reached.size > want) return true;
      }
      if (d <= SHIP_LOOP) {
        if (d > far) {
          far = d;
          loop.length = 0;
        }
        if (d === far) loop.push(i);
      }
      return false;
    });
    const way = wayTo(end >= 0 ? end : loop.length > 0 ? loop[Math.floor(shipRoll(world, city.id, k) * loop.length)] : -1);
    return way.length > SHIP_ROUTE_MIN ? way : [];
  }

  /** The way of a liner over the fairway from a free mooring off `home` to one off `port`, or empty. */
  function linerRoute(world: WorldState, home: City, port: City, waits: readonly number[]): number[] {
    const harbour = shipHarbour(world, home.tile);
    const pass = (i: number): boolean => fairway(world, i);
    const start = harbour < 0 ? -1 : mooring(world, harbour, waits, pass);
    if (start < 0) return [];
    const zone = portZones([port]);
    const end = sail(world, start, LINER_ROUTE_MAX, pass, (i) => zone.has(i) && free(i, waits));
    return wayTo(end);
  }

  /** The ship's route is still all fairway (with SHIP_ICE_HOLD for the ice) and starts (a liner's also ends) off its port. */
  function routeHolds(world: WorldState, s: Ship, home: City, port: City): boolean {
    const r = s.route;
    if (r.length < 2 || tileDistance(r[0], home.tile) > PORT_NEAR || (s.kind === 'liner' && tileDistance(r[r.length - 1], port.tile) > PORT_NEAR)) {
      return false;
    }
    for (const i of r) if (!fairway(world, i, SHIP_ICE_HOLD)) return false;
    return true;
  }

  /** A new route for a ship whose route broke, as its city's `k`-th: false when there is none (it goes). */
  function reroute(world: WorldState, s: Ship, home: City, port: City, k: number): boolean {
    const waits = waitingPoints(world.civ, s);
    const route = s.kind === 'liner' ? linerRoute(world, home, port, waits) : coastRoute(world, home, k, waits);
    if (route.length < 2) return false;
    s.route = route;
    s.since = world.ticks;
    return true;
  }

  /** Ships of a conflict that has ended come home, or sink when their side lost (spec: decided by conflict.ts). */
  function endBattles(world: WorldState): void {
    const civ = world.civ;
    for (const s of civ.ships) {
      const k = s.war;
      if (!k || civ.conflicts.includes(k)) continue;
      s.war = null;
      if (k.winner !== undefined && k.winner >= 0 && s.side !== k.winner) {
        s.sunkAt = world.ticks;
      } else {
        s.fight = [];
        s.side = -1;
      }
    }
  }

  /**
   * Ships follow their city's people and era; those of a lost city go, as do
   * ships whose route broke and found no new one. Sunk ships go after
   * SHIP_SUNK_TICKS. A ship in battle holds its course until it is over.
   */
  function upkeep(world: WorldState): void {
    const civ = world.civ;
    const kept = new Map<number, number>();
    let n = 0;
    for (const s of civ.ships) {
      if (s.sunkAt >= 0) {
        if (world.ticks - s.sunkAt < SHIP_SUNK_TICKS) civ.ships[n++] = s;
        continue;
      }
      const home = civ.city(s.city);
      const port = s.kind === 'liner' ? civ.city(s.to) : home;
      if (!home || !port) continue;
      s.tribe = home.tribe;
      s.tech = world.tech[home.tile] as Tech;
      const k = kept.get(home.id) ?? 0;
      if (!s.war && !routeHolds(world, s, home, port) && !reroute(world, s, home, port, k)) continue;
      if (s.kind === 'coast') kept.set(home.id, k + 1);
      civ.ships[n++] = s;
    }
    civ.ships.length = n;
  }

  /** Coastal ships afloat of city `id`. */
  function fleetSize(civ: CivState, id: number): number {
    let n = 0;
    for (const s of civ.ships) if (s.kind === 'coast' && s.city === id && s.sunkAt < 0) n++;
    return n;
  }

  /** A new ship of `city` this tick. */
  function launch(world: WorldState, kind: ShipKind, city: City, to: number, route: number[]): Ship {
    let id = world.ticks * SHIP_IDS_PER_TICK;
    for (const s of world.civ.ships) if (s.id >= id) id = s.id + 1;
    const ship: Ship = {
      id, kind, city: city.id, to, tribe: city.tribe, tech: world.tech[city.tile] as Tech, route, since: world.ticks,
      fight: [], side: -1, war: null, sunkAt: -1,
    };
    world.civ.ships.push(ship);
    return ship;
  }

  /** City `c` may build its `k`-th coastal ship: Bronze age or later, room for it at its size, wood enough. */
  function mayBuild(world: WorldState, c: City, k: number): boolean {
    return world.tech[c.tile] >= Tech.Bronze && k < SHIPS_PER_CITY[citySize(world.cityPop[c.tile])] &&
      cityWood(world, c) >= SHIP_WOOD_MIN;
  }

  /** Per city: the tick before which it does not look again for a mooring and route for a new ship. */
  const launchRest = new WeakMap<City, number>();

  /** A new coastal ship of `c` as its `k`-th, or null when it found no mooring or route (it then rests SHIP_RETRY ticks). */
  function tryLaunch(world: WorldState, c: City, k: number): Ship | null {
    const route = coastRoute(world, c, k, waitingPoints(world.civ));
    if (route.length > 0) return launch(world, 'coast', c, -1, route);
    launchRest.set(c, world.ticks + SHIP_RETRY);
    return null;
  }

  /**
   * The first city (from a place that turns with the ticks) of the Bronze age
   * or later, on the open sea, with fewer ships than SHIPS_PER_CITY for its
   * size and wood enough launches one, while the coastal ships stay under
   * SHIPS_MAX − LINERS_MAX. One a tick at most.
   */
  function launchShips(world: WorldState): void {
    const civ = world.civ;
    let afloat = 0;
    for (const s of civ.ships) if (s.kind === 'coast' && s.sunkAt < 0) afloat++;
    const cities = civ.cities;
    if (afloat >= SHIPS_MAX - LINERS_MAX || cities.length === 0) return;
    const start = world.ticks % cities.length;
    for (let m = 0; m < cities.length; m++) {
      const c = cities[(start + m) % cities.length];
      if ((launchRest.get(c) ?? -1) > world.ticks) continue;
      const k = fleetSize(civ, c.id);
      if (!mayBuild(world, c, k)) continue;
      if (tryLaunch(world, c, k)) return;
    }
  }

  /**
   * Per civilization: the ports and liners the looks for a liner went through
   * (`set`) and the next port to try from (`next`), so each port is tried
   * once while the set stays the same.
   */
  const linerLooks = new WeakMap<CivState, { set: string; next: number }>();

  /** Per planet: its landmasses as last labelled for the liners, and when; drift is slow, so they hold LAND_LABEL_TICKS. */
  const landLabels = new WeakMap<WorldState, { at: number; label: Int32Array }>();
  const LAND_LABEL_TICKS = 500;

  function landLabel(world: WorldState): Int32Array {
    let hit = landLabels.get(world);
    if (!hit || world.ticks < hit.at || world.ticks - hit.at >= LAND_LABEL_TICKS) landLabels.set(world, hit = { at: world.ticks, label: landmasses(world).label });
    return hit.label;
  }

  function pairKey(a: number, b: number): string {
    return a < b ? `${a}:${b}` : `${b}:${a}`;
  }

  /**
   * Every LINER_EVERY ticks while fewer than LINERS_MAX sail, one town or
   * metropolis of the Industrial age or later (the biggest first, each once
   * while the ports and liners stay the same) with wood enough and a
   * mooring on the open sea tries to link with the nearest such city on
   * another landmass, between LINER_ROUTE_MIN and LINER_ROUTE_MAX steps away
   * over the fairway; the search gives up after LINER_SEARCH_MAX tiles. A
   * pair is linked once.
   */
  function launchLiner(world: WorldState): void {
    if (world.ticks % LINER_EVERY !== 0) return;
    const civ = world.civ;
    const linked = new Set<string>();
    let total = 0;
    for (const s of civ.ships) {
      if (s.sunkAt >= 0) continue;
      total++;
      if (s.kind === 'liner') linked.add(pairKey(s.city, s.to));
    }
    if (linked.size >= LINERS_MAX || total >= SHIPS_MAX) return;
    const ports = civ.cities.filter((c) => world.tech[c.tile] >= Tech.Industrial && citySize(world.cityPop[c.tile]) >= CitySize.Town);
    if (ports.length < 2) return;
    const set = `${ports.map((c) => c.id).sort((a, b) => a - b).join(',')}|${[...linked].sort().join(',')}`;
    let look = linerLooks.get(civ);
    if (!look || look.set !== set) linerLooks.set(civ, look = { set, next: 0 });
    if (look.next >= ports.length) return;
    ports.sort((p, q) => world.cityPop[q.tile] - world.cityPop[p.tile] || p.id - q.id);
    const from = ports[look.next++];
    if (cityWood(world, from) < SHIP_WOOD_MIN) return;
    const land = landLabel(world);
    const goals = portZones(ports.filter((c) => land[c.tile] !== land[from.tile] && !linked.has(pairKey(from.id, c.id))));
    if (goals.size === 0) return;
    const harbour = shipHarbour(world, from.tile);
    const waits = waitingPoints(civ);
    const pass = (i: number): boolean => fairway(world, i);
    const start = harbour < 0 ? -1 : mooring(world, harbour, waits, pass);
    if (start < 0) return;
    let seen = 0;
    const end = sail(world, start, LINER_ROUTE_MAX, pass, (i, d) => ++seen > LINER_SEARCH_MAX || (d >= LINER_ROUTE_MIN && goals.has(i) && free(i, waits)));
    const to = goals.get(end);
    if (to && seen <= LINER_SEARCH_MAX) launch(world, 'liner', from, to.id, wayTo(end));
  }

  /** A ship called to a battle: the side it fights for, its own harbour and the enemy's. */
  interface Fighter { readonly ship: Ship; readonly side: number; readonly own: number; readonly foe: number }

  /**
   * Stations for `fleet` round `point`: fairway tiles within
   * SHIP_STATION_REACH steps, apart from where other ships wait and from each
   * other, each ship taking the free one nearest the point on its own side
   * (nearer its harbour than the enemy's). −1 where none is left.
   */
  function stations(world: WorldState, point: number, fleet: readonly Fighter[], waits: readonly number[]): number[] {
    const spots: [number, number][] = [];
    sail(world, point, SHIP_STATION_REACH, anyWater, (i, d) => {
      if (fairway(world, i) && free(i, waits)) spots.push([i, d]);
      return false;
    });
    const taken: number[] = [];
    return fleet.map(({ own, foe }) => {
      let best = -1;
      let bestScore = Infinity;
      for (const [i, d] of spots) {
        if (!free(i, taken)) continue;
        const score = d + 0.5 * (tileDistance(i, own) - tileDistance(i, foe));
        if (score < bestScore) {
          bestScore = score;
          best = i;
        }
      }
      if (best >= 0) taken.push(best);
      return best;
    });
  }

  /**
   * A conflict between two cities on the open sea whose harbours one sea
   * links within SHIP_BATTLE_RANGE steps is also a sea battle, once both
   * sides have a ship there: the coastal ships of the two cities, and of
   * their peoples' cities whose ships moor within CIV_NEIGHBOUR_DIST of the
   * battle point, halfway along the way between the harbours. Each ship sails
   * to a station of its own round it (`stations`). A city at war with no ship
   * of its own builds one for it at once if it may (wood, size), past the
   * planet's cap: the cap would leave most coastal cities without. Decided
   * once, in its first tick (`Conflict.sea`).
   */
  function joinBattles(world: WorldState): void {
    const civ = world.civ;
    for (const k of civ.conflicts) {
      if (k.sea !== undefined) continue;
      k.sea = -1;
      const a = civ.city(k.a);
      const b = civ.city(k.b);
      if (!a || !b) continue;
      const ha = shipHarbour(world, a.tile);
      const hb = shipHarbour(world, b.tile);
      if (ha < 0 || hb < 0) continue;
      sail(world, ha, SHIP_BATTLE_RANGE, anyWater, (i) => i === hb);
      const way = wayTo(hb);
      if (way.length === 0) continue;
      const point = way[way.length >> 1];
      const [ta, tb] = k.sides;
      for (const c of [a, b]) {
        const own = fleetSize(civ, c.id);
        if (own === 0 && mayBuild(world, c, own)) tryLaunch(world, c, own);
      }
      // Interleaved by side, so each side gets stations near its own harbour.
      const sides: Fighter[][] = [[], []];
      for (const s of civ.ships) {
        if (s.kind !== 'coast' || s.sunkAt >= 0 || s.war) continue;
        const side = s.city === a.id ? ta.id : s.city === b.id ? tb.id :
          (s.tribe === ta.id || s.tribe === tb.id) && tileDistance(s.route[0], point) <= CIV_NEIGHBOUR_DIST ? s.tribe : -1;
        if (side === ta.id) sides[0].push({ ship: s, side, own: ha, foe: hb });
        else if (side === tb.id) sides[1].push({ ship: s, side, own: hb, foe: ha });
      }
      const fleet: Fighter[] = [];
      for (let n = 0; n < Math.max(sides[0].length, sides[1].length); n++) {
        if (n < sides[0].length) fleet.push(sides[0][n]);
        if (n < sides[1].length) fleet.push(sides[1][n]);
      }
      const spots = stations(world, point, fleet, waitingPoints(civ));
      const pass = (i: number): boolean => fairway(world, i);
      const ready: [Ship, number, number[]][] = [];
      fleet.forEach(({ ship, side }, n) => {
        if (spots[n] < 0) return;
        sail(world, ship.route[0], 2 * SHIP_BATTLE_RANGE, pass, (i) => i === spots[n]);
        const fight = wayTo(spots[n]);
        if (fight.length > 0) ready.push([ship, side, fight]);
      });
      if (!ready.some(([, side]) => side === ta.id) || !ready.some(([, side]) => side === tb.id)) continue;
      k.sea = point;
      for (const [s, side, fight] of ready) {
        s.war = k;
        s.side = side;
        s.fight = fight;
      }
    }
  }

  /** One civilization tick of the ships (civ.ts calls it after the conflicts). */
  export function stepFleets(world: WorldState, params: ModelParams): void {
    void params;
    endBattles(world);
    upkeep(world);
    joinBattles(world);
    launchShips(world);
    launchLiner(world);
  }
}
