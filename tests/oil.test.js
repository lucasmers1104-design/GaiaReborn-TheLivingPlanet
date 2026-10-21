'use strict';
/*
 * Oil (src/oil.ts): dead sea animals bury kerogen, which matures into oil
 * over tens of millions of years. Cities from the Industrial age on pump it
 * without touching the CO₂ model. The optional save field keeps it, and is
 * estimated from the first sea animals when missing.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE, makeSim } = require('./helpers');

const SE = loadSE();
const C = SE.Life;

/** Kerogen one tick buries with the given summed densities per class. */
function buried(biomass, scale = SE.TimeScale.Geologic) {
  const w = makeSim(5).world;
  w.timeScale = scale;
  w.lifeBiomass.fill(0);
  for (const [c, v] of Object.entries(biomass)) w.lifeBiomass[c] = v;
  SE.OilSystem.step(w);
  return w.oilKerogen;
}

test('only dead sea animals bury kerogen, by their summed density', () => {
  const fish = buried({ [C.Fish]: 100 });
  assert.ok(fish > 0);
  assert.equal(buried({ [C.Prokaryote]: 100, [C.Eukaryote]: 100, [C.Mammal]: 100, [C.Dinosaur]: 100 }), 0, 'cells and land animals');
  assert.ok(Math.abs(buried({ [C.Radiate]: 50, [C.Cetacean]: 150 }) / fish - 2) < 1e-9, 'every sea animal class counts');
  assert.ok(buried({ [C.Fish]: 100 }, SE.TimeScale.Technology) < fish * 1e-3, 'the technology time scale buries practically none');
});

test('kerogen matures into oil over tens of millions of years, keeping the mass', () => {
  const w = makeSim(5).world;
  w.timeScale = SE.TimeScale.Evolution;
  w.absoluteYears = SE.PLANET_AGE - 100e6;
  w.lifeBiomass.fill(0);
  w.oilKerogen = 1000;
  const ticks = Math.round(SE.OIL_HALF_LIFE / w.yearsPerTick);
  for (let k = 0; k < ticks; k++) SE.OilSystem.step(w);
  assert.ok(Math.abs(w.oil + w.oilKerogen - 1000) < 1e-6, 'maturing keeps the mass');
  const left = Math.pow(0.5, (ticks * w.yearsPerTick) / SE.OIL_HALF_LIFE);
  assert.ok(Math.abs(left - 0.5) < 0.05 && Math.abs(w.oilKerogen / 1000 - left) < 1e-6, `kerogen left ${w.oilKerogen}`);
  w.timeScale = SE.TimeScale.Civilized;
  const oil = w.oil;
  SE.OilSystem.step(w);
  assert.ok(w.oil - oil < 1e-5 * w.oilKerogen, 'a civilization tick forms practically none');
});

test('pumped oil is gone and the reserve never goes below zero', () => {
  const w = makeSim(5).world;
  w.oil = 100;
  assert.equal(SE.pumpOil(w, 30), 30);
  assert.equal(SE.pumpOil(w, -5), 0);
  assert.equal(SE.pumpOil(w, 500), 70);
  assert.equal(w.oil, 0);
  assert.equal(w.oilMined, 100);
});

/** A planet of sea with one meadow island; mammals think, cities on the given tech levels. */
function civ(techs) {
  const s = makeSim(7);
  const w = s.world;
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
  for (let y = 20; y < 60; y++) for (let x = 20; x < 100; x++) w.elevation[y * SE.GRID_W + x] = 0.1;
  techs.forEach((t, k) => {
    const i = 40 * SE.GRID_W + 24 + k * 10;
    w.tech[i] = t;
    w.cityPop[i] = 0.5;
  });
  w.sentientClass = C.Mammal;
  w.timeScale = SE.TimeScale.Technology;
  w.civ.clear();
  s.civ.sync(w, s.params);
  return s;
}

test('cities pump the oil share of their fossil energy; the CO₂ model stays as it was', () => {
  const T = SE.Tech;
  const pre = civ([T.Stone, T.Iron]);
  assert.equal(SE.oilDemand(pre.world, pre.params), 0, 'no oil before industry');
  const atomic = civ([T.Atomic]);
  const ratio = SE.oilDemand(atomic.world, atomic.params) / SE.coalDemand(atomic.world, atomic.params);
  const want = (SE.OIL_SHARE[T.Atomic] * SE.OIL_PER_DEMAND_YEAR) / (SE.COAL_SHARE[T.Atomic] * SE.COAL_PER_DEMAND_YEAR);
  assert.ok(Math.abs(ratio - want) < 1e-9, `oil to coal ${ratio}`);

  const run = (reserve) => {
    const s = civ([T.Industrial, T.Atomic]);
    s.world.oil = reserve;
    for (let k = 0; k < 20; k++) {
      s.civ.step(s.world, s.params, s.atmo);
      s.world.ticks++;
    }
    return s;
  };
  const full = run(1000);
  const empty = run(0);
  assert.ok(full.world.oilMined > 0 && full.world.oil < 1000, 'the reserve was pumped');
  assert.equal(empty.world.oilMined, 0);
  for (const k of ['co2Delta', 'o2Delta', 'dustDelta']) assert.equal(full.atmo[k], empty.atmo[k], k);
  assert.equal(full.world.rng.getState(), empty.world.rng.getState(), 'oil draws no random numbers');
});

const ctx = (s) => ({ world: s.world, params: s.params, geo: s.geo, history: s.history });

test('the save keeps the oil; without the field it is estimated from the first sea animals', () => {
  const a = makeSim(3);
  Object.assign(a.world, { oil: 1234.5, oilKerogen: 32.25, oilMined: 9, absoluteYears: SE.PLANET_AGE });
  a.world.lifeFirstSeen[C.Fish] = a.world.absoluteYears - 300e6;
  a.world.lifeFirstSeen[C.Radiate] = a.world.absoluteYears - 500e6;
  const doc = SE.SaveSystem.serialize(ctx(a));
  const b = makeSim(1);
  SE.SaveSystem.load(JSON.parse(JSON.stringify(doc)), ctx(b), b.life, b.flora);
  assert.deepEqual([b.world.oil, b.world.oilKerogen, b.world.oilMined], [1234.5, 32.25, 9]);

  delete doc.oil;
  const c = makeSim(1);
  SE.SaveSystem.load(JSON.parse(JSON.stringify(doc)), ctx(c), c.life, c.flora);
  const expect = 500e6 * SE.OIL_EST_YEAR;
  assert.ok(Math.abs(c.world.oil - expect) < 1e-6 * expect, `estimated ${c.world.oil}, expected ${expect}`);
  assert.deepEqual([c.world.oilKerogen, c.world.oilMined], [0, 0]);

  doc.oil = { reserve: -1, kerogen: 0, mined: 0 };
  const d = makeSim(1);
  SE.SaveSystem.load(JSON.parse(JSON.stringify(doc)), ctx(d), d.life, d.flora);
  assert.ok(Math.abs(d.world.oil - expect) < 1e-6 * expect, 'a damaged field is estimated too');
});

test('the history graphs the oil reserve', () => {
  const s = makeSim(5);
  const series = s.history.series.find((x) => x.label === 'Ölvorrat');
  assert.ok(series);
  s.world.oil = 4321;
  s.world.ticks = 0;
  s.history.sample(s.world);
  assert.equal(series.data[series.data.length - 1], 4321);
});

test('the Industrial age sets a platform off the coast and a derrick in the desert, once', () => {
  const T = SE.Tech;
  const s = civ([T.Iron]);
  const w = s.world;
  const at = (x, y) => y * SE.GRID_W + x;
  for (let i = 0; i < SE.TILE_COUNT; i++) if (w.elevation[i] < 0) w.biome[i] = SE.Biome.Ocean;
  w.landscape[at(60, 30)] = SE.Landscape.Desert;
  // A small lake beside the city, nearer than the coast.
  for (let y = 39; y <= 41; y++) for (let x = 26; x <= 28; x++) {
    w.elevation[at(x, y)] = -0.3;
    w.biome[at(x, y)] = SE.Biome.Ocean;
  }
  SE.placeOilRigs(w);
  assert.deepEqual([w.oilRigSea, w.oilRigLand], [-1, -1], 'nothing before industry');

  const city = w.civ.cities[0].tile;
  w.tech[city] = T.Industrial;
  const rng = w.rng.getState();
  SE.placeOilRigs(w);
  // The island's west coast is x = 20 and the city stands at x = 24: open water two tiles out, not the lake.
  assert.equal(w.oilRigSea, at(18, (city / SE.GRID_W) | 0));
  assert.equal(w.oilRigLand, at(60, 30), 'a desert beats the nearer meadow');
  assert.equal(w.rng.getState(), rng, 'placing draws no random numbers');

  w.landscape[at(30, 40)] = SE.Landscape.Desert;
  SE.placeOilRigs(w);
  assert.equal(w.oilRigLand, at(60, 30), 'placed once, then fixed');

  const doc = SE.SaveSystem.serialize(ctx(s));
  const b = makeSim(1);
  SE.SaveSystem.load(JSON.parse(JSON.stringify(doc)), ctx(b), b.life, b.flora);
  assert.deepEqual([b.world.oilRigSea, b.world.oilRigLand], [w.oilRigSea, w.oilRigLand]);
  delete doc.oil.rigs;
  const c = makeSim(1);
  SE.SaveSystem.load(JSON.parse(JSON.stringify(doc)), ctx(c), c.life, c.flora);
  assert.deepEqual([c.world.oilRigSea, c.world.oilRigLand], [-1, -1], 'an older save places them anew');
});
