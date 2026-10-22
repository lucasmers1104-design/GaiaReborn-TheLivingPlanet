'use strict';
/*
 * The railway (src/railway.ts, docs/bewegung-2026-10): one line per planet
 * from the Industrial age with at least three cities, over land only (rivers
 * bridged), neighbour to neighbour, west to east through its stations, only
 * its own landUse bit; repaired when a tile turns to water, the same on the
 * same planet, through a save and back. Hand-drawn planets, only the
 * civilization ticks: the file runs in seconds.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSim } = require('./helpers.js');

/** Sea with flat meadow at 15 °C in each [x0, y0, x1, y1) rectangle; mammals think. */
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
    w.landUse[i] = 0;
  }
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) w.elevation[y * SE.GRID_W + SE.wrapX(x)] = 0.1;
  }
  w.sentientClass = SE.Life.Mammal;
  w.civ.clear();
  w.civ.clearWorks();
  w.civ.discovery.state = 'waived';
  return s;
}

const at = (SE, x, y) => y * SE.GRID_W + SE.wrapX(x);

function city(s, x, y, tech) {
  const i = at(s.SE, x, y);
  s.world.tech[i] = tech;
  s.world.cityPop[i] = 0.4;
  return i;
}

/** Tick only the civilization; the news of every tick go to `news`. */
function run(s, ticks, news = []) {
  for (let k = 0; k < ticks; k++) {
    s.civ.step(s.world, s.params, s.atmo);
    news.push(...s.world.civ.news);
    s.world.ticks++;
  }
  return news;
}

function touching(SE, a, b) {
  let dx = Math.abs((a % SE.GRID_W) - (b % SE.GRID_W));
  if (dx === SE.GRID_W - 1) dx = 1;
  return a !== b && dx <= 1 && Math.abs(Math.floor(a / SE.GRID_W) - Math.floor(b / SE.GRID_W)) <= 1;
}

/** No part of the line runs beside another: tiles more than two steps apart along it never touch. */
function assertClean(SE, path) {
  for (let a = 0; a < path.length; a++) {
    for (let b = a + 3; b < path.length; b++) assert.ok(!touching(SE, path[a], path[b]), `tiles ${a} and ${b} of the line lie side by side`);
  }
}

/** A continent 70 tiles wide with a river across it and three Industrial cities from west to east. */
function line(seed) {
  const s = fixture([[20, 20, 90, 50]], seed);
  const { SE, world: w } = s;
  for (let y = 20; y < 50; y++) w.riverLevel[at(SE, 55, y)] = 2;
  city(s, 25, 35, SE.Tech.Industrial);
  city(s, 50, 28, SE.Tech.Industrial);
  city(s, 82, 40, SE.Tech.Atomic);
  s.civ.sync(w, s.params);
  return s;
}

test('no line before three cities of the Industrial age', () => {
  const s = fixture([[20, 20, 90, 50]]);
  const { SE, world: w } = s;
  city(s, 25, 35, SE.Tech.Iron);
  city(s, 50, 28, SE.Tech.Industrial);
  city(s, 82, 40, SE.Tech.Industrial);
  s.civ.sync(w, s.params);
  run(s, 30);
  assert.equal(w.civ.rail, null, 'two Industrial cities and an Iron Age one build no line');
  w.tech[at(SE, 25, 35)] = SE.Tech.Industrial;
  run(s, 20);
  assert.ok(w.civ.rail, 'the third Industrial city opens the line');
});

test('the line runs over land, neighbour to neighbour, west to east through its stations, with its own bit only', () => {
  const s = line();
  const { SE, world: w } = s;
  const news = run(s, 20);
  const r = w.civ.rail;
  assert.ok(r, 'a line was built');
  const opening = news.find((n) => n.chronicle && n.chronicle.major && /Die erste Eisenbahn verbindet/.test(n.text));
  assert.ok(opening, 'opening news with a chronicle entry');
  assert.match(opening.chronicle.change, /^Hochgeschwindigkeitszüge/, 'told in the age it opens with');
  assert.equal(r.stations.length, 3);
  assert.equal(r.stations[0], 0);
  assert.equal(r.stations[2], r.path.length - 1);
  assert.deepEqual(r.cities.map((c) => c % SE.GRID_W), [25, 50, 82], 'west to east through the three cities');
  r.stations.forEach((k, n) => assert.ok(touching(SE, r.path[k], r.cities[n]), `the train stops beside city ${n}`));
  assert.ok(r.path.every((t) => w.tech[t] === 0), 'the line keeps off the city tiles');
  assert.equal(r.era, SE.Tech.Atomic, 'the highest age of its cities');
  for (let k = 1; k < r.path.length; k++) assert.ok(touching(SE, r.path[k - 1], r.path[k]), `tiles ${k - 1} and ${k} touch`);
  assert.equal(new Set(r.path).size, r.path.length, 'no tile twice');
  assertClean(SE, r.path);
  assert.ok(r.path.every((t) => !w.isWater(t)), 'land only');
  assert.ok(r.path.some((t) => w.riverLevel[t] > 0), 'the river is bridged');
  const onLine = new Set(r.path);
  for (let i = 0; i < SE.TILE_COUNT; i++) assert.equal((w.landUse[i] & SE.LAND_USE_RAIL) !== 0, onLine.has(i), `rail bit on tile ${i}`);
  // Re-laid, the line clears and sets its own bit only: fields, wonders and logging keep theirs.
  const others = 0xff & ~SE.LAND_USE_RAIL;
  for (let i = 0; i < SE.TILE_COUNT; i++) w.landUse[i] |= others;
  w.elevation[r.path[3]] = -0.3;
  SE.stepRailway(w, s.params);
  const now = new Set(w.civ.rail.path);
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    assert.equal(w.landUse[i] & others, others, `other bits on tile ${i}`);
    assert.equal((w.landUse[i] & SE.LAND_USE_RAIL) !== 0, now.has(i), `rail bit on tile ${i} after the repair`);
  }
});

test('the line goes round high mountains through a pass', () => {
  const s = fixture([[20, 20, 90, 50]]);
  const { SE, world: w } = s;
  // A range above the tree line from north to south, with one low pass at y = 45.
  for (let y = 20; y < 50; y++) for (let x = 52; x < 56; x++) if (y !== 45) w.elevation[at(SE, x, y)] = 0.8;
  city(s, 25, 30, SE.Tech.Industrial);
  city(s, 40, 32, SE.Tech.Industrial);
  city(s, 80, 30, SE.Tech.Industrial);
  s.civ.sync(w, s.params);
  run(s, 20);
  const r = w.civ.rail;
  assert.ok(r);
  assert.ok(r.path.every((t) => w.elevation[t] < 0.5), 'never above the tree line');
});

test('a tile of the line turned to water re-routes its leg', () => {
  const s = line();
  const { SE, world: w } = s;
  run(s, 20);
  const r = w.civ.rail;
  const cut = r.path[Math.floor(r.stations[1] / 2)];
  const westLeg = r.path.slice(0, r.stations[1] + 1);
  const eastLeg = r.path.slice(r.stations[1]);
  w.elevation[cut] = -0.3;
  run(s, 1);
  const n = w.civ.rail;
  assert.ok(n, 'still a line');
  assert.ok(!n.path.includes(cut), 'round the new water');
  assert.ok(n.path.every((t) => !w.isWater(t)));
  for (let k = 1; k < n.path.length; k++) assert.ok(touching(SE, n.path[k - 1], n.path[k]));
  assert.deepEqual(n.path.slice(n.stations[1]), eastLeg, 'the unbroken leg stays as it was');
  assert.notDeepEqual(n.path.slice(0, n.stations[1] + 1), westLeg);
  assert.equal(w.landUse[cut] & SE.LAND_USE_RAIL, 0, 'the old tile lost its bit');
  for (const t of n.path) assert.ok(w.landUse[t] & SE.LAND_USE_RAIL);
});

test('a lost station leaves the line; with one left it is dropped', () => {
  const s = line();
  const { SE, world: w } = s;
  run(s, 20);
  const mid = w.civ.rail.cities[1];
  w.tech[mid] = 0;
  w.cityPop[mid] = 0;
  run(s, 1);
  assert.equal(w.civ.rail.stations.length, 2, 'two stations left');
  const old = w.civ.rail.path.slice();
  const west = w.civ.rail.cities[0];
  w.tech[west] = 0;
  w.cityPop[west] = 0;
  run(s, 1);
  assert.equal(w.civ.rail, null);
  for (const t of old) assert.equal(w.landUse[t] & SE.LAND_USE_RAIL, 0);
});

test('the newly found continent gets the line, else the smallest landmass', () => {
  const build = (state) => {
    const s = fixture([[10, 20, 60, 50], [120, 10, 220, 70]]);
    const { SE, world: w } = s;
    for (const [x, y] of [[14, 30], [32, 40], [55, 30], [125, 30], [160, 50], [210, 20]]) city(s, x, y, SE.Tech.Industrial);
    w.civ.discovery.state = state;
    w.civ.discovery.landfall = at(SE, 121, 40);
    s.civ.sync(w, s.params);
    run(s, 20);
    return (w.civ.rail.cities[0] % SE.GRID_W);
  };
  assert.equal(build('found'), 125, 'on the continent the voyage found');
  assert.equal(build('waived'), 14, 'on the smaller landmass');
});

test('west to east across the date line', () => {
  const s = fixture([[230, 20, 290, 50]]);
  const { SE, world: w } = s;
  city(s, 235, 30, SE.Tech.Industrial);
  city(s, 252, 40, SE.Tech.Industrial);
  city(s, 270, 30, SE.Tech.Industrial);
  s.civ.sync(w, s.params);
  run(s, 20);
  const r = w.civ.rail;
  assert.ok(r);
  assert.deepEqual(r.cities.map((c) => c % SE.GRID_W), [235, 252, 270 - SE.GRID_W]);
});

test('many Industrial cities: one clean line along a corridor, never doubling back', () => {
  const s = fixture([[20, 10, 130, 70]]);
  const { SE, world: w } = s;
  // Sixteen cities over the whole continent, far north and south of any line through it too.
  for (let y = 14; y < 70; y += 14) for (let x = 24; x < 130; x += 28) city(s, x + ((y / 14) % 2) * 9, y, SE.Tech.Industrial);
  s.civ.sync(w, s.params);
  run(s, 20);
  const r = w.civ.rail;
  assert.ok(r, 'a line');
  assert.ok(r.stations.length >= 3 && r.stations.length <= SE.RAIL_STATIONS_MAX, `${r.stations.length} stations`);
  const xs = r.cities.map((c) => c % SE.GRID_W);
  assert.ok(xs.every((x, k) => k === 0 || x > xs[k - 1]), `stations west to east: ${xs}`);
  for (let k = 1; k < r.path.length; k++) assert.ok(r.path[k] % SE.GRID_W >= r.path[k - 1] % SE.GRID_W, `step ${k} runs west`);
  assertClean(SE, r.path);
});

test('the line waits for the new continent only so long into the Industrial age', () => {
  const s = fixture([[10, 20, 60, 50], [120, 10, 220, 70]]);
  const { SE, world: w } = s;
  for (const [x, y] of [[14, 30], [32, 40], [55, 30], [125, 30], [160, 50]]) city(s, x, y, SE.Tech.Industrial);
  s.civ.sync(w, s.params);
  w.civ.discovery.state = 'found';
  w.civ.discovery.landfall = at(SE, 121, 40);
  w.civ.topTech = SE.Tech.Industrial;
  w.civ.topSince = w.ticks;
  const step = (ticks) => { for (let k = 0; k < ticks; k++) { SE.stepRailway(w, s.params); w.ticks++; } };
  step(SE.RAIL_FOUND_WAIT - 10);
  assert.equal(w.civ.rail, null, 'waiting for the new continent with two cities');
  step(20);
  assert.ok(w.civ.rail, 'then the other landmass');
  assert.equal(w.civ.rail.cities[0] % SE.GRID_W, 14);
});

test('the same planet gets the same line, and it survives a save', () => {
  const a = line();
  const b = line();
  run(a, 20);
  run(b, 20);
  assert.deepEqual(a.world.civ.rail.path, b.world.civ.rail.path);
  const { SE } = a;
  const doc = JSON.parse(JSON.stringify(SE.SaveSystem.serialize({ world: a.world, params: a.params, geo: a.geo, history: a.history })));
  const t = makeSim(1);
  SE.SaveSystem.load(doc, { world: t.world, params: t.params, geo: t.geo, history: t.history }, t.life, t.flora);
  const r = t.world.civ.rail;
  assert.ok(r, 'restored');
  assert.deepEqual(r.path, a.world.civ.rail.path);
  assert.deepEqual(r.stations, a.world.civ.rail.stations);
  assert.deepEqual(r.cities, a.world.civ.rail.cities);
  assert.equal(r.era, a.world.civ.rail.era);
  for (const i of r.path) assert.ok(t.world.landUse[i] & SE.LAND_USE_RAIL);
  // An unsound field is dropped, the save still loads.
  doc.rail.path[3] = doc.rail.path[0];
  const u = makeSim(1);
  SE.SaveSystem.load(doc, { world: u.world, params: u.params, geo: u.geo, history: u.history }, u.life, u.flora);
  assert.equal(u.world.civ.rail, null);
});
