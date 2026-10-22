'use strict';
/*
 * Wood (src/wood.ts): an Iron Age city logs the forest round it but leaves a
 * share standing, the forest grows back once its age needs little wood, the
 * same seed logs the same tiles, and the logging survives a save. The planet
 * is drawn by hand: sea, and one rectangle of temperate forest.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSim, hash } = require('./helpers.js');

const CX = 90;
const CY = 60;

/** Sea with a 60 × 40 block of broadleaf forest; mammals think; 100 years a tick. */
function forest(seed = 7) {
  const s = makeSim(seed);
  const { SE, world: w } = s;
  const groups = SE.floraBit(SE.Flora.Broadleaf) | SE.floraBit(SE.Flora.Conifers) | SE.floraBit(SE.Flora.Grasses) | SE.floraBit(SE.Flora.Flowering);
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    w.elevation[i] = -0.3;
    w.temperature[i] = 15;
    w.moisture[i] = 0.6;
    w.riverLevel[i] = 0;
    w.soil[i] = 200;
    w.flora[i] = 0;
    w.vegetation[i] = 0;
    w.tech[i] = 0;
    w.cityPop[i] = 0;
  }
  for (let y = 40; y < 80; y++) {
    for (let x = 60; x < 120; x++) {
      const i = y * SE.GRID_W + x;
      w.elevation[i] = 0.1;
      w.flora[i] = groups;
      w.vegetation[i] = 0.9;
    }
  }
  w.co2 = 400;
  w.timeScale = SE.TimeScale.Civilized;
  w.sentientClass = SE.Life.Mammal;
  w.civ.clear();
  // Let the landscape grow into forest before anyone settles.
  for (let k = 0; k < 30; k++) step(s);
  return s;
}

/** Plants, landscape and (with a city) the civilization, one tick; the city keeps `tech` and its people. */
function step(s, tech) {
  const { SE, world: w } = s;
  s.flora.step(w, s.params);
  SE.BiomeSystem.step(w);
  if (tech !== undefined) {
    s.civ.step(w, s.params, s.atmo);
    w.tech[centre(SE)] = tech;
    w.cityPop[centre(SE)] = 0.7;
  }
  w.ticks++;
}

const centre = (SE) => CY * SE.GRID_W + CX;

function settle(s, tech) {
  const { SE, world: w } = s;
  w.tech[centre(SE)] = tech;
  w.cityPop[centre(SE)] = 0.7;
  s.civ.sync(w, s.params);
}

/** The forest tiles round the city within its logging reach: cover, cut, cleared to open land. */
function survey(s) {
  const { SE, world: w } = s;
  const out = { tiles: 0, cover: 0, cut: 0, open: 0 };
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      if ((!dx && !dy) || dx * dx + dy * dy > SE.WOOD_REACH2) continue;
      const i = (CY + dy) * SE.GRID_W + CX + dx;
      out.tiles++;
      out.cover += w.vegetation[i];
      if (w.logged[i] > 0) out.cut++;
      if (SE.LANDSCAPE_LEVEL[w.landscape[i]] <= 2) out.open++;
    }
  }
  out.cover /= out.tiles;
  return out;
}

test('an Iron Age city logs the forest round it and leaves a share standing', () => {
  const s = forest();
  const { SE, world: w } = s;
  const before = survey(s);
  assert.equal(before.open, 0, 'untouched forest all round');
  settle(s, SE.Tech.Iron);
  for (let k = 0; k < 20; k++) step(s, SE.Tech.Iron);
  const after = survey(s);
  assert.ok(after.cover < before.cover - 0.1, `cover in reach falls (${before.cover.toFixed(2)} → ${after.cover.toFixed(2)})`);
  assert.ok(after.open >= 6, `the nearest tiles are cleared to open land (${after.open})`);
  assert.ok(after.cut <= before.tiles * SE.WOOD_MAX_SHARE, `at most half of the forest is cut (${after.cut} of ${before.tiles})`);
  assert.ok(w.woodCut > 0 && w.wood > 0, 'cut and standing wood are counted');
  assert.equal(SE.cityWood(w, w.civ.cities[0]), 1, 'the forest still gives all the city needs');
  // A cut that would stick only for a tick would be back at full cover by now.
  const cleared = [];
  for (let i = 0; i < SE.TILE_COUNT; i++) if (w.landUse[i] & SE.LAND_USE_LOGGED) cleared.push(i);
  assert.ok(cleared.length >= 6 && cleared.every((i) => w.vegetation[i] <= SE.WOOD_CLEAR_COVER + 0.01), 'cleared tiles hold their low cover');
});

test('the forest grows back once the city needs little wood', () => {
  const s = forest();
  const { SE } = s;
  settle(s, SE.Tech.Iron);
  for (let k = 0; k < 20; k++) step(s, SE.Tech.Iron);
  const iron = survey(s);
  for (let k = 0; k < 30; k++) step(s, SE.Tech.Atomic);
  const atomic = survey(s);
  assert.ok(atomic.open < iron.open / 2, `cleared land turns back into forest (${iron.open} → ${atomic.open})`);
  assert.ok(atomic.cover > iron.cover + 0.1, `cover returns (${iron.cover.toFixed(2)} → ${atomic.cover.toFixed(2)})`);
  assert.ok(atomic.cut < iron.cut, `fewer tiles cut (${iron.cut} → ${atomic.cut})`);
});

test('the same seed logs the same tiles', () => {
  const run = () => {
    const s = forest(11);
    settle(s, s.SE.Tech.Bronze);
    for (let k = 0; k < 15; k++) step(s, s.SE.Tech.Bronze);
    return [hash(s.world.logged), hash(s.world.vegetation), s.world.woodCut];
  };
  assert.deepEqual(run(), run());
});

test('the logging survives a save, and a broken field loads without it', () => {
  const a = forest();
  const { SE } = a;
  settle(a, SE.Tech.Iron);
  for (let k = 0; k < 10; k++) step(a, SE.Tech.Iron);
  const ctx = (s) => ({ world: s.world, params: s.params, geo: s.geo, history: s.history });
  const doc = JSON.parse(JSON.stringify(SE.SaveSystem.serialize(ctx(a))));
  assert.ok(doc.wood && doc.wood.tiles.length > 0, 'the save carries the field');

  const b = makeSim(1);
  SE.SaveSystem.load(doc, ctx(b), b.life, b.flora);
  assert.equal(hash(b.world.logged), hash(a.world.logged));
  assert.equal(b.world.woodCut, a.world.woodCut);
  // Summed every WOOD_STAT_EVERY ticks, so a's figure may be a few ticks old.
  assert.ok(Math.abs(b.world.wood - a.world.wood) < 0.05 * a.world.wood, 'standing wood derived again');

  for (const broken of [undefined, null, 7, { cut: -1, tiles: [] }, { cut: 1, tiles: [5] }, { cut: 1, tiles: [1e9, 3] }, { cut: 1, tiles: [3, 300] }]) {
    const c = makeSim(1);
    SE.SaveSystem.load({ ...doc, wood: broken }, ctx(c), c.life, c.flora);
    assert.equal(c.world.woodCut, 0, JSON.stringify(broken));
    assert.ok(c.world.logged.every((v) => v === 0), JSON.stringify(broken));
  }
});
