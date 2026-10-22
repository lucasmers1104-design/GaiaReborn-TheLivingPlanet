'use strict';
/*
 * The voyage of discovery (src/discovery.ts, docs/bewegung-2026-10): while a
 * continent no Iron Age settlers reach lies across the ocean, the Industrial
 * age is held and three ships set out; their landfall frees it, founds the
 * first colony and opens the sea to colonists, who found peoples of their
 * own. Planets drawn by hand as in civ.test.js; only the civilization ticks.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSim, hash } = require('./helpers.js');

/** A planet of sea with meadow on mature soil at 15 °C in each [x0, y0, x1, y1) rectangle; mammals think. */
function fixture(rects, seed = 7) {
  const s = makeSim(seed);
  const { SE, world: w } = s;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    w.elevation[i] = -0.3;
    w.landscape[i] = SE.Landscape.Meadow;
    w.substrate[i] = SE.Substrate.Soil;
    w.soil[i] = 200;
    w.temperature[i] = 15;
    w.riverLevel[i] = 0;
    w.landscapeZone[i] = SE.ZONE_NONE;
    w.tech[i] = 0;
    w.cityPop[i] = 0;
  }
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) w.elevation[y * SE.GRID_W + x] = 0.1;
  }
  w.sentientClass = SE.Life.Mammal;
  w.civ.clear();
  w.civ.clearWorks();
  return s;
}

const at = (SE, x, y) => y * SE.GRID_W + x;

function city(s, x, y, tech, pop) {
  const i = at(s.SE, x, y);
  s.world.tech[i] = tech ?? s.SE.Tech.Iron;
  s.world.cityPop[i] = pop ?? 0.5;
  return i;
}

/** Tick only the civilization, calling `each` after every tick; stops when it returns false. */
function run(s, ticks, each) {
  for (let k = 0; k < ticks; k++) {
    s.civ.step(s.world, s.params, s.atmo);
    s.world.ticks++;
    if (each && each(k) === false) return;
  }
}

function coastal(s, i) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const j = s.SE.tileAt(i, dx, dy);
      if (j >= 0 && s.world.isWater(j)) return true;
    }
  }
  return false;
}

/** Ticks the ships take over `tiles` (src/discovery.ts voyageTicks). */
function crossingTicks(SE, tiles) {
  const [lo, hi] = SE.DISCOVERY_VOYAGE_TICKS;
  return Math.min(hi, Math.max(lo, Math.round(tiles / SE.DISCOVERY_VOYAGE_SPEED)));
}

function topTech(s) {
  let top = 0;
  for (let i = 0; i < s.SE.TILE_COUNT; i++) top = Math.max(top, s.world.tech[i]);
  return top;
}

/** Every Iron Age invention succeeds on its first roll while `fn` runs (it may call `slow` to end that early). */
function quickInvention(SE, fn) {
  const advance = SE.TECH_ADVANCE[SE.Tech.Iron];
  const civil = SE.TECH_CIVILIZATION[SE.Tech.Iron];
  const slow = () => {
    SE.TECH_ADVANCE[SE.Tech.Iron] = advance;
    SE.TECH_CIVILIZATION[SE.Tech.Iron] = civil;
  };
  SE.TECH_ADVANCE[SE.Tech.Iron] = 1;
  SE.TECH_CIVILIZATION[SE.Tech.Iron] = 1;
  try {
    return fn(slow);
  } finally {
    slow();
  }
}

/** Iron Age cities on a continent in the west, one of them on its east coast; an empty continent 40 tiles of sea further east. */
function twoContinents(seed) {
  const s = fixture([[20, 40, 60, 80], [100, 40, 140, 80]], seed);
  for (const [x, y] of [[30, 50], [45, 50], [30, 65], [45, 65], [59, 60]]) city(s, x, y);
  return s;
}

/** Play `s` until the Industrial age; what happened when. Iron Age inventions succeed at once until one is held. */
function playVoyage(s, ticks = 200) {
  const { SE, world: w } = s;
  const r = { held: -1, departed: -1, found: -1, industrial: -1, voyage: null, news: [], heldWhileGated: false };
  quickInvention(SE, (slow) => {
    run(s, 1);
    w.civ.topSince = -1000; // past TECH_MIN_AGE
    run(s, ticks, (k) => {
      const d = w.civ.discovery;
      r.news.push(...w.civ.news);
      if (r.held < 0 && d.held >= 0) {
        r.held = k;
        // From here on only the held invention can bring the Industrial age soon.
        slow();
      }
      const v = w.civ.settlers.find((x) => x.voyage);
      if (v && !r.voyage) r.voyage = { ...v, path: v.path.slice() };
      if (r.departed < 0 && d.state === 'sailing') r.departed = k;
      if (r.found < 0 && d.state === 'found') r.found = k;
      const top = topTech(s);
      if (d.state !== 'found' && top >= SE.Tech.Industrial) r.heldWhileGated = true;
      if (r.industrial < 0 && top >= SE.Tech.Industrial) r.industrial = k;
      return r.industrial < 0;
    });
  });
  return r;
}

test('the gate holds the Industrial age until three ships from a coastal city reach the empty continent', () => {
  const s = twoContinents();
  const { SE, world: w } = s;
  const r = playVoyage(s);
  assert.ok(r.held >= 0, 'an invention of the Industrial age was held');
  assert.ok(r.departed >= 0 && r.departed <= r.held + 1, 'the ships set out at once');
  assert.ok(!r.heldWhileGated, 'no Industrial city before the landfall');
  const v = r.voyage;
  assert.ok(v && v.voyage && v.crossed, 'the voyage is one settler record with voyage: true');
  const port = at(SE, 59, 60);
  assert.equal(v.path[0], port, 'it sails from the coastal city');
  assert.ok(v.path.slice(1, -1).every((t) => w.isWater(t)), 'over the open sea');
  const end = v.path[v.path.length - 1];
  assert.ok(end % SE.GRID_W >= 100, 'to the empty continent');
  const ticks = crossingTicks(SE, v.path.length - 1);
  assert.ok(ticks > SE.DISCOVERY_VOYAGE_TICKS[0] && ticks <= SE.DISCOVERY_VOYAGE_TICKS[1], 'an ocean crossing is paced by its length');
  assert.equal(r.found - r.departed, ticks, `the crossing takes ${ticks} ticks`);
  assert.equal(w.civ.discovery.landfall, end);
  assert.equal(r.industrial, r.found + 1, 'the held invention comes on the next tick');
  const colony = w.civ.cityAt(end);
  assert.ok(colony, 'the ships found the first colony at their landfall');
  assert.notEqual(colony.tribe, w.civ.cityAt(port).tribe, 'as a people of its own');
  const keys = r.news.filter((n) => n.chronicle).map((n) => n.chronicle);
  for (const key of ['civ:voyage', 'civ:discovery']) {
    const e = keys.find((c) => c.key === key);
    assert.ok(e && e.major, `${key} is a major chronicle entry`);
  }
  assert.ok(r.news.findIndex((n) => n.chronicle?.key === 'civ:discovery') <
    r.news.findIndex((n) => n.chronicle?.key.startsWith('civ:tribe:')), 'the discovery is told before the new people');
});

test('while a continent waits, crossings leave the last colour to its first colony', () => {
  const s = twoContinents();
  const { SE, world: w } = s;
  s.civ.sync(w, s.params);
  const home = w.civ.cityAt(at(SE, 30, 50)).tribe;
  for (let k = 0; w.civ.tribes.length < SE.TRIBE_MAX - 1; k++) {
    w.civ.tribes.push({ id: 900 + k, color: 7 - k, name: `X${k}`, parent: -1, capital: -1, founded: 0, landShort: false, shortUntil: 0 });
  }
  const crossing = city(s, 22, 78, SE.Tech.Iron, 0.1);
  assert.equal(SE.foundCity(w, s.params, crossing, home, true).tribe, home, 'a crossing joins its people');
  assert.equal(w.civ.tribes.length, SE.TRIBE_MAX - 1);
  w.civ.discovery = { state: 'found', landfall: at(SE, 100, 60) };
  const colony = city(s, 100, 60, SE.Tech.Iron, 0.1);
  assert.notEqual(SE.foundCity(w, s.params, colony, home, true).tribe, home, 'the first colony founds the last people');
  assert.equal(w.civ.tribes.length, SE.TRIBE_MAX);
});

test('the ships sail for the largest empty continent, over a strait as well, in fewer ticks', () => {
  // A small empty continent just off the coast, a larger one beyond a strait of four tiles to the south.
  const s = fixture([[20, 40, 60, 80], [70, 40, 85, 55], [20, 84, 70, 110]]);
  const { SE, world: w } = s;
  for (const [x, y] of [[30, 50], [45, 50], [30, 65], [45, 65], [59, 60], [40, 79]]) city(s, x, y);
  const r = playVoyage(s);
  const v = r.voyage;
  assert.ok(v, 'the ships set out');
  const end = v.path[v.path.length - 1];
  assert.ok(Math.floor(end / SE.GRID_W) >= 84, 'to the larger continent, not the nearer one');
  assert.equal(v.path[0], at(SE, 40, 79), 'from the port nearest to it');
  assert.equal(r.found - r.departed, SE.DISCOVERY_VOYAGE_TICKS[0], 'a strait takes the fewest ticks');
  assert.equal(r.industrial, r.found + 1);
});

test('without an undiscovered continent the gate lapses and the Industrial age comes as before', () => {
  for (const [rects, settled] of [
    [[[20, 40, 60, 80]], null],
    // Too small to be a continent.
    [[[20, 40, 60, 80], [100, 40, 110, 50]], null],
    // The second continent has a city already.
    [[[20, 40, 60, 80], [100, 40, 140, 80]], [120, 60]],
  ]) {
    const s = fixture(rects);
    for (const [x, y] of [[30, 50], [45, 50], [30, 65], [45, 65], [59, 60]]) city(s, x, y);
    if (settled) city(s, settled[0], settled[1]);
    const r = playVoyage(s, 20);
    assert.equal(s.world.civ.discovery.state, 'waived', JSON.stringify(rects));
    assert.equal(r.departed, -1, 'no ships set out');
    assert.ok(r.industrial >= 0, 'the Industrial age came');
  }
});

test('with no port the held invention waits, then the gate lapses', () => {
  const s = fixture([[20, 40, 60, 80], [100, 40, 140, 80]]);
  // A desert shore: no city, and so no port, can stand on the coast.
  for (let y = 40; y < 80; y++) {
    for (let x = 20; x < 60; x++) if (coastal(s, at(s.SE, x, y))) s.world.landscape[at(s.SE, x, y)] = s.SE.Landscape.Desert;
  }
  for (const [x, y] of [[30, 50], [45, 50], [30, 65], [45, 65]]) city(s, x, y);
  const r = playVoyage(s, 400);
  assert.equal(r.departed, -1, 'no coastal city, no ships');
  assert.equal(s.world.civ.discovery.state, 'waived');
  assert.ok(r.industrial - r.held >= s.SE.DISCOVERY_WAIT, `held ${r.industrial - r.held} ticks`);
});

test('after the discovery colonists cross the open sea to its coast and found a people of their own', () => {
  // A full island city with nowhere else to go; the discovered continent 30 tiles of sea east of it.
  const s = fixture([[60, 60, 65, 65], [95, 45, 135, 85]]);
  const { SE, world: w } = s;
  const home = city(s, 64, 62, SE.Tech.Iron, 1);
  w.civ.discovery = { state: 'found', landfall: at(SE, 95, 62) };
  let colonist = null;
  let colony = null;
  run(s, 400, () => {
    colonist = colonist || w.civ.settlers.find((x) => x.colony) || null;
    colony = w.civ.cities.find((c) => c.tile % SE.GRID_W >= 95) || null;
    return !colony;
  });
  assert.ok(colonist, 'colonists set out');
  assert.ok(colonist.crossed && colonist.path.slice(1, -1).filter((t) => w.isWater(t)).length > SE.SETTLER_WATER[SE.Tech.Iron],
    'over more open sea than the Iron Age crosses otherwise');
  assert.ok(colony, 'and founded a colony');
  assert.ok(coastal(s, colony.tile), 'on the coast');
  assert.notEqual(colony.tribe, w.civ.cityAt(home).tribe, 'as a people of its own');

  // Every colour taken: a further colony there joins the nearest people on that continent.
  for (let k = 0; w.civ.tribes.length < SE.TRIBE_MAX; k++) {
    w.civ.tribes.push({ id: 900 + k, color: 7 - k, name: `X${k}`, parent: -1, capital: -1, founded: 0, landShort: false, shortUntil: 0 });
  }
  const t2 = at(SE, 95, 75);
  w.tech[t2] = SE.Tech.Iron;
  w.cityPop[t2] = 0.1;
  const c2 = SE.foundCity(w, s.params, t2, w.civ.cityAt(home).tribe, true);
  assert.equal(c2.tribe, colony.tribe);
  assert.equal(SE.colonyRoute(w, home, SE.Tech.Bronze), null, 'the Bronze Age does not sail the open sea');
  // A city with land at home still sends about every other group over the sea, by a hash roll.
  const c = w.civ.cityAt(home);
  let first = 0;
  const ticks = w.ticks;
  for (let k = 0; k < 400; k++, w.ticks++) if (SE.colonyFirst(w, c)) first++;
  w.ticks = ticks;
  assert.ok(Math.abs(first / 400 - SE.DISCOVERY_COLONY_SHARE) < 0.1, `${first} of 400`);
});

test('the same seed sails the same voyage', () => {
  const a = twoContinents(11);
  const b = twoContinents(11);
  const ra = playVoyage(a);
  const rb = playVoyage(b);
  assert.deepEqual([ra.held, ra.departed, ra.found, ra.industrial], [rb.held, rb.departed, rb.found, rb.industrial]);
  assert.deepEqual(ra.voyage.path, rb.voyage.path);
  assert.equal(a.world.civ.discovery.landfall, b.world.civ.discovery.landfall);
  assert.equal(hash(a.world.tech), hash(b.world.tech));
  assert.equal(a.world.rng.next(), b.world.rng.next());
});

function saveAndLoad(s, edit) {
  const { SE } = s;
  const doc = JSON.parse(JSON.stringify(SE.SaveSystem.serialize({ world: s.world, params: s.params, geo: s.geo, history: s.history })));
  if (edit) edit(doc);
  const t = makeSim(1);
  SE.SaveSystem.load(doc, { world: t.world, params: t.params, geo: t.geo, history: t.history }, t.life, t.flora);
  return { t, doc };
}

test('the save keeps the discovery; ships under way are lost and set out again', () => {
  const s = twoContinents();
  const { SE, world: w } = s;
  quickInvention(SE, () => {
    run(s, 1);
    w.civ.topSince = -1000;
    run(s, 40, () => w.civ.discovery.state !== 'sailing');
  });
  assert.equal(w.civ.discovery.state, 'sailing');
  const heldTile = w.civ.city(w.civ.discovery.held).tile;
  const sailing = saveAndLoad(s);
  const d = sailing.t.world.civ.discovery;
  assert.equal(d.state, 'open', 'the voyage under way is lost');
  assert.equal(sailing.t.world.civ.city(d.held)?.tile, heldTile, 'the held invention is kept');
  assert.ok(!sailing.t.world.civ.settlers.some((x) => x.voyage));
  run(sailing.t, 1);
  assert.equal(d.state, 'sailing', 'the held invention sends the ships again');
  assert.ok(sailing.t.world.civ.settlers.some((x) => x.voyage));

  w.civ.discovery = { state: 'found', landfall: at(SE, 100, 60) };
  const found = saveAndLoad(s).t.world.civ.discovery;
  assert.deepEqual([found.state, found.landfall], ['found', at(SE, 100, 60)]);
  const none = fixture([[20, 40, 60, 80]]);
  assert.equal(SE.discoveryToJSON(none.world), undefined, 'nothing to save before anything happened');
  // An unsound field is dropped; the rest of the save loads as usual.
  for (const bad of [{ state: 'lost' }, { state: 'found', landfall: -1 }, { state: 'waived', landfall: 1.5 }, 'found', null]) {
    SE.restoreDiscovery(none.world, bad);
    assert.deepEqual([none.world.civ.discovery.state, none.world.civ.discovery.landfall], ['open', -1], JSON.stringify(bad));
  }
});
