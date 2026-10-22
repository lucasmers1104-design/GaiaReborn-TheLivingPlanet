'use strict';
/*
 * Ships of the coastal cities, liners between continents and sea battles
 * (src/fleets.ts, docs/bewegung-2026-10). The planets are drawn by hand: sea
 * with forested islands, cities set on the grid and derived; only the ships
 * tick (stepFleets), so nothing else changes the cities under them.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSim } = require('./helpers.js');

/** A planet of sea; mammals think. */
function sea(seed = 7) {
  const s = makeSim(seed);
  const { SE, world: w } = s;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    w.elevation[i] = -0.3;
    w.landscape[i] = SE.Landscape.Forest;
    w.substrate[i] = SE.Substrate.Soil;
    w.soil[i] = 200;
    w.temperature[i] = 15;
    w.riverLevel[i] = 0;
    w.tech[i] = 0;
    w.cityPop[i] = 0;
  }
  w.sentientClass = SE.Life.Mammal;
  w.civ.clear();
  return s;
}

const at = (SE, x, y) => y * SE.GRID_W + x;

/** Land on [x0, x1) × [y0, y1), or water with `elevation` < 0. */
function land(s, x0, y0, x1, y1, elevation = 0.1) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) s.world.elevation[at(s.SE, x, y)] = elevation;
}

function city(s, x, y, tech, pop) {
  const i = at(s.SE, x, y);
  s.world.tech[i] = tech;
  s.world.cityPop[i] = pop;
  return i;
}

/** Derive the city records from the grid, then tick only the ships. */
function sail(s, ticks) {
  if (!s.world.civ.synced) s.civ.sync(s.world, s.params);
  for (let k = 0; k < ticks; k++) {
    s.SE.stepFleets(s.world, s.params);
    s.world.ticks++;
  }
}

function shipsOf(s, tile) {
  const c = s.world.civ.cityAt(tile);
  assert.ok(c, `a city on ${tile}`);
  return s.world.civ.ships.filter((sh) => sh.city === c.id && sh.sunkAt < 0);
}

/** The whole hull lies over water on tile i: the tile and its east and west neighbours, and no city in the rows above and below. */
function fairway(s, i) {
  const { SE, world: w } = s;
  for (let dx = -SE.SHIP_HULL_REACH; dx <= SE.SHIP_HULL_REACH; dx++) {
    if (!w.isWater(SE.tileAt(i, dx, 0))) return false;
    for (const dy of [-1, 1]) if (w.tech[SE.tileAt(i, dx, dy)] !== 0) return false;
  }
  return true;
}

/** Two waiting ships do not touch. */
function apart(SE, a, b) {
  let dx = Math.abs((a % SE.GRID_W) - (b % SE.GRID_W));
  if (dx > SE.GRID_W / 2) dx = SE.GRID_W - dx;
  return dx >= SE.SHIP_GAP_X || Math.abs(Math.floor(a / SE.GRID_W) - Math.floor(b / SE.GRID_W)) >= SE.SHIP_GAP_Y;
}

/** Every ship's route is fairway, step by step, starts at a mooring off its city, and no two ships wait on one spot. */
function assertRoutes(s) {
  const { SE, world: w } = s;
  const waits = [];
  for (const sh of w.civ.ships) {
    assert.ok(sh.route.length >= 2, `ship ${sh.id} has a route`);
    for (let n = 0; n < sh.route.length; n++) {
      assert.ok(fairway(s, sh.route[n]), `ship ${sh.id}: its hull lies over water on route tile ${n}`);
      if (n > 0) assert.ok(SE.tileDistance(sh.route[n - 1], sh.route[n]) < 1.5, `ship ${sh.id}: step ${n} goes to a neighbour`);
    }
    const home = w.civ.city(sh.city);
    assert.ok(SE.tileDistance(sh.route[0], home.tile) <= (SE.SHIP_MOOR_REACH + 1) * Math.SQRT2 + 0.5, `ship ${sh.id} moors off its city`);
    for (const end of [sh.route[0], sh.route[sh.route.length - 1]]) {
      assert.ok(waits.every((o) => apart(SE, o, end)), `ship ${sh.id} waits apart from the others`);
      waits.push(end);
    }
  }
}

test('only towns and metropolises on the open sea from the Bronze age keep ships, and wood is needed', () => {
  const s = sea();
  const { SE } = s;
  land(s, 40, 40, 62, 54);
  const coastTown = city(s, 40, 47, SE.Tech.Bronze, 0.5);
  const inland = city(s, 51, 47, SE.Tech.Iron, 0.5);
  const stone = city(s, 61, 47, SE.Tech.Stone, 0.5);
  const village = city(s, 51, 40, SE.Tech.Bronze, 0.2);
  // An island with a lake of 16 tiles in it, a town on its shore.
  land(s, 80, 40, 101, 61);
  land(s, 88, 48, 92, 52, -0.2);
  const lake = city(s, 87, 50, SE.Tech.Iron, 0.5);
  land(s, 120, 40, 131, 51);
  const metro = city(s, 120, 45, SE.Tech.Iron, 0.9);
  // A coastal metropolis on bare meadow: no forest to build from.
  land(s, 160, 40, 171, 51);
  for (let y = 30; y < 61; y++) for (let x = 150; x < 181; x++) s.world.landscape[at(SE, x, y)] = SE.Landscape.Meadow;
  const bare = city(s, 160, 45, SE.Tech.Iron, 0.9);
  sail(s, 20);
  assert.equal(shipsOf(s, coastTown).length, 1, 'a coastal town: one ship');
  assert.equal(shipsOf(s, metro).length, 2, 'a coastal metropolis: two');
  assert.equal(shipsOf(s, inland).length, 0, 'inland: none');
  assert.equal(shipsOf(s, stone).length, 0, 'Stone age: none');
  assert.equal(shipsOf(s, village).length, 0, 'a village: none');
  assert.equal(shipsOf(s, lake).length, 0, 'on a lake: none');
  const bareCity = s.world.civ.cityAt(bare);
  if (SE.cityWood(s.world, bareCity) < SE.SHIP_WOOD_MIN) assert.equal(shipsOf(s, bare).length, 0, 'short of wood: none');
  assertRoutes(s);
  for (const sh of s.world.civ.ships) {
    assert.equal(sh.kind, 'coast');
    // Before the Industrial age every route keeps near land.
    for (const i of sh.route) {
      let near = false;
      for (let dy = -SE.SHIP_COAST_REACH; dy <= SE.SHIP_COAST_REACH && !near; dy++) {
        for (let dx = -SE.SHIP_COAST_REACH; dx <= SE.SHIP_COAST_REACH && !near; dx++) {
          const j = SE.tileAt(i, dx, dy);
          near = j >= 0 && !s.world.isWater(j);
        }
      }
      assert.ok(near, `ship ${sh.id}: tile ${i} lies near the coast`);
    }
  }
  assert.equal(SE.shipSprite(SE.Tech.Bronze, false), 'ship_galley');
  assert.equal(SE.shipSprite(SE.Tech.Iron, false), 'ship_trireme');
  assert.equal(SE.shipSprite(SE.Tech.Industrial, false), 'ship_steamer');
  assert.equal(SE.shipSprite(SE.Tech.Nanotech, false), 'ship_freighter');
  assert.equal(SE.shipSprite(SE.Tech.Atomic, true), 'ship_warship');
  assert.equal(SE.shipSprite(SE.Tech.Iron, true), 'ship_trireme');
  assert.equal(SE.shipSprite(SE.Tech.Stone, false), null);
});

test('a planet-wide cap, ships follow their city and go with it, a broken route is searched again', () => {
  const s = sea();
  const { SE, world: w } = s;
  const tiles = [];
  for (let n = 0; n < 12; n++) {
    const x = 10 + n * 20;
    land(s, x, 60, x + 8, 68);
    tiles.push(city(s, x, 64, SE.Tech.Iron, 0.9));
  }
  sail(s, 40);
  const afloat = w.civ.ships.filter((sh) => sh.sunkAt < 0);
  assert.equal(afloat.length, SE.SHIPS_MAX - SE.LINERS_MAX, 'coastal ships up to the cap');
  assertRoutes(s);

  const sh = afloat[0];
  const home = w.civ.city(sh.city);
  w.tech[home.tile] = SE.Tech.Industrial;
  sail(s, 1);
  assert.equal(sh.tech, SE.Tech.Industrial, 'the ship follows its city into the next age');

  const mid = sh.route[sh.route.length >> 1];
  w.elevation[mid] = 0.1;
  sail(s, 1);
  assert.ok(!sh.route.includes(mid) && sh.since === w.ticks - 1, 'a new route round the new land');
  assertRoutes(s);

  w.civ.removeCity(home);
  sail(s, 1);
  assert.ok(!w.civ.ships.includes(sh), 'a lost city\'s ships go');
});

test('liners from the Industrial age, only between big coastal cities on different landmasses', () => {
  const build = (tech, apart) => {
    const s = sea();
    const { SE } = s;
    land(s, 40, 40, 60, 60);
    const a = city(s, 59, 50, tech, 0.8);
    const b = city(s, 40, 50, tech, 0.8);
    if (apart) land(s, 100, 40, 120, 60);
    else land(s, 60, 58, 100, 60);
    land(s, 100, 40, 120, 60);
    const c = city(s, 100, 50, tech, 0.8);
    sail(s, SE.LINER_EVERY * 3 + 1);
    return { s, a, b, c };
  };
  {
    const { s, a, c } = build(4, true);
    const liners = s.world.civ.ships.filter((sh) => sh.kind === 'liner');
    assert.ok(liners.length >= 1, 'a liner between the two continents');
    assert.ok(liners.length <= s.SE.LINERS_MAX);
    const land = s.SE.landmasses(s.world).label;
    for (const sh of liners) {
      const from = s.world.civ.city(sh.city);
      const to = s.world.civ.city(sh.to);
      assert.notEqual(land[from.tile], land[to.tile], 'it links two landmasses');
      assert.ok(sh.route.length > s.SE.LINER_ROUTE_MIN, 'across the open sea');
      assert.ok(s.SE.tileDistance(sh.route[sh.route.length - 1], to.tile) <= (s.SE.SHIP_MOOR_REACH + 1) * Math.SQRT2 + 0.5, 'it ends off the other port');
    }
    assert.ok(liners.some((sh) => [s.world.civ.cityAt(a).id, s.world.civ.cityAt(c).id].includes(sh.city)));
    assertRoutes(s);
  }
  {
    const { s } = build(4, false);
    assert.equal(s.world.civ.ships.filter((sh) => sh.kind === 'liner').length, 0, 'one landmass: no liner');
  }
  {
    const { s } = build(3, true);
    assert.equal(s.world.civ.ships.filter((sh) => sh.kind === 'liner').length, 0, 'Iron age: no liner');
  }
});

/** Two coastal metropolises of two peoples on islands across a strait, each with its ships. */
function strait() {
  const s = sea();
  const { SE, world: w } = s;
  land(s, 40, 40, 52, 56);
  land(s, 62, 40, 74, 56);
  const a = city(s, 51, 48, SE.Tech.Industrial, 0.9);
  const b = city(s, 62, 48, SE.Tech.Industrial, 0.9);
  sail(s, 10);
  const ca = w.civ.cityAt(a);
  const cb = w.civ.cityAt(b);
  assert.notEqual(ca.tribe, cb.tribe, 'two peoples');
  assert.equal(shipsOf(s, a).length, 2);
  assert.equal(shipsOf(s, b).length, 2);
  return { s, ca, cb };
}

test('a conflict between two coastal cities is fought at sea, the loser\'s ships sink', () => {
  const { s, ca, cb } = strait();
  const { SE, world: w } = s;
  const k = SE.startConflict(w, ca, cb);
  sail(s, 1);
  assert.ok(k.sea >= 0 && w.isWater(k.sea), 'a battle point on the water');
  const fighting = w.civ.ships.filter((sh) => sh.war === k);
  assert.equal(fighting.length, 4, 'both fleets sail out');
  const stations = [];
  for (const sh of fighting) {
    assert.equal(sh.fight[0], sh.route[0], 'from its mooring');
    const at = sh.fight[sh.fight.length - 1];
    assert.ok(SE.tileDistance(at, k.sea) <= SE.SHIP_STATION_REACH * 1.5, 'to a station near the battle point');
    assert.ok(sh.fight.every((i) => fairway(s, i)), 'over the fairway');
    assert.ok(stations.every((o) => apart(SE, o, at)), 'each ship at a station of its own');
    stations.push(at);
  }
  sail(s, 3);
  const end = SE.settleConflict(w, k, 0.999);
  assert.ok(end !== null);
  assert.ok(k.winner === ca.tribe || k.winner === cb.tribe, 'conflict.ts names the winner');
  const loser = k.winner === k.sides[0].id ? k.sides[1].id : k.sides[0].id;
  sail(s, 1);
  for (const sh of fighting) {
    if (sh.side === loser) {
      assert.equal(sh.sunkAt, w.ticks - 1, 'the loser\'s ship sank');
      assert.ok(stations.includes(sh.fight[sh.fight.length - 1]), 'where it fought');
    } else {
      assert.equal(sh.sunkAt, -1, 'the winner\'s ship sails home');
      assert.equal(sh.fight.length, 0);
      assert.equal(sh.war, null);
    }
  }
  sail(s, SE.SHIP_SUNK_TICKS);
  assert.ok(fighting.filter((sh) => sh.side === loser).every((sh) => !w.civ.ships.includes(sh)), 'wrecks go after a while');
});

test('a conflict between a coastal and an inland city stays on land', () => {
  const s = sea();
  const { SE, world: w } = s;
  land(s, 40, 40, 70, 60);
  const a = city(s, 40, 50, SE.Tech.Iron, 0.9);
  const b = city(s, 55, 50, SE.Tech.Iron, 0.9);
  sail(s, 5);
  const ca = w.civ.cityAt(a);
  const cb = w.civ.cityAt(b);
  if (ca.tribe === cb.tribe) cb.tribe = w.civ.tribes.find((t) => t.id !== ca.tribe)?.id ?? cb.tribe;
  const k = SE.startConflict(w, ca, cb);
  if (!k) return;
  sail(s, 1);
  assert.equal(k.sea, -1);
  assert.ok(w.civ.ships.every((sh) => sh.war === null && sh.fight.length === 0));
});

test('ships are deterministic and never touch world.rng', () => {
  const run = () => {
    const { s, ca, cb } = strait();
    const rng = s.world.rng.state;
    const k = s.SE.startConflict(s.world, ca, cb);
    const afterStart = s.world.rng.state;
    sail(s, 5);
    assert.equal(s.world.rng.state, afterStart, 'the ships drew no random number');
    void rng;
    s.SE.settleConflict(s.world, k, 0.3);
    sail(s, 2);
    return JSON.stringify(s.world.civ.ships.map(({ war, ...rest }) => (void war, rest)));
  };
  assert.equal(run(), run());
});

test('a coastal city at war without a ship builds one for the battle', () => {
  const { s, ca, cb } = strait();
  const { SE, world: w } = s;
  const ships = w.civ.ships;
  for (let n = ships.length - 1; n >= 0; n--) if (ships[n].city === cb.id) ships.splice(n, 1);
  const k = SE.startConflict(w, ca, cb);
  SE.stepFleets(w, s.params);
  assert.ok(k.sea >= 0, 'a sea battle');
  const own = ships.filter((sh) => sh.city === cb.id && sh.war === k);
  assert.equal(own.length, 1, 'one new ship sails out at once');
  assert.equal(new Set(ships.map((sh) => sh.id)).size, ships.length, 'ids stay unique');
});

test('ships keep off the pack ice: no harbour in it, a route the ice reaches is searched again', () => {
  const s = sea();
  const { SE, world: w } = s;
  land(s, 40, 40, 52, 52);
  const a = city(s, 51, 46, SE.Tech.Iron, 0.9);
  land(s, 100, 40, 112, 52);
  const b = city(s, 111, 46, SE.Tech.Iron, 0.9);
  for (let y = 30; y < 62; y++) for (let x = 112; x < 140; x++) w.temperature[at(SE, x, y)] = -20;
  sail(s, 10);
  assert.equal(shipsOf(s, b).length, 0, 'a harbour in the ice keeps no ships');
  const ships = shipsOf(s, a);
  assert.equal(ships.length, 2);
  const sh = ships[0];
  const mid = sh.route[sh.route.length >> 1];
  w.temperature[mid] = -20;
  sail(s, 1);
  assert.ok(!sh.route.includes(mid) && sh.route.every((i) => w.temperature[i] >= SE.SHIP_ICE_FREE), 'round the ice');
});

test('a ship stays when its city shrinks or runs short of wood; it goes only with its city', () => {
  const s = sea();
  const { SE, world: w } = s;
  land(s, 40, 40, 52, 52);
  const a = city(s, 51, 46, SE.Tech.Iron, 0.9);
  sail(s, 10);
  const ships = shipsOf(s, a);
  assert.equal(ships.length, 2);
  w.cityPop[a] = 0.2;
  for (let y = 30; y < 62; y++) for (let x = 30; x < 62; x++) w.landscape[at(SE, x, y)] = SE.Landscape.Meadow;
  sail(s, 20);
  assert.deepEqual(shipsOf(s, a), ships, 'a village now, without forest: it keeps both ships');
  w.civ.removeCity(w.civ.cityAt(a));
  sail(s, 1);
  assert.equal(w.civ.ships.length, 0, 'gone with its city');
});

test('a narrow inlet keeps no ship: no mooring where a hull would touch land', () => {
  const s = sea();
  land(s, 40, 30, 70, 70);
  // An inlet two tiles wide running 18 tiles south from the sea: a hull (three tiles east to west) fits nowhere in it.
  land(s, 49, 30, 51, 48, -0.3);
  const c = city(s, 51, 47, s.SE.Tech.Iron, 0.9);
  sail(s, 10);
  assert.equal(shipsOf(s, c).length, 0);
});
