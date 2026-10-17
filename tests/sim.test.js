'use strict';
/*
 * Simulation rules behind the tree: where plants can grow, what the biome
 * classifier makes of them, what pollinators actually do, and the regressions
 * found in the September 2026 review (F01, F03–F07).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE, makeSim } = require('./helpers');

const SE = loadSE();

/** Find a land tile matching a predicate. */
function findTile(w, pred) {
  for (let i = 0; i < SE.TILE_COUNT; i++) if (pred(i)) return i;
  return -1;
}

test('first land plants grow only where open water is next door', () => {
  const s = makeSim(321);
  const w = s.world;
  // Let the climate settle first: a fresh planet's land starts uniformly damp.
  for (let k = 0; k < 40; k++) s.tick();
  s.flora.prepare(w, s.params, true);
  const coastWet = findTile(w, (i) => !w.isWater(i) && s.flora.waterAccess[i] >= 0.9 && s.flora.wetness[i] > 0.75 && w.temperature[i] > 8 && w.temperature[i] < 30 && w.elevation[i] < 0.2);
  const inland = findTile(w, (i) => !w.isWater(i) && s.flora.waterAccess[i] === 0 && w.elevation[i] < 0.3);
  assert.ok(coastWet >= 0 && inland >= 0, 'test tiles exist');
  assert.ok(s.flora.suit(w, SE.Flora.LandPlants, coastWet) > 0.3, 'wet shore suits the first land plants');
  assert.equal(s.flora.suit(w, SE.Flora.LandPlants, inland), 0, 'no first land plants without water next door');
  assert.match(s.flora.problem(w, SE.Flora.LandPlants, inland), /Wasser|trocken|kalt|heiß|ungünstig/);
  // Seed plants, conifers and grasses are not bound to the water's edge.
  assert.equal(SE.FLORA[SE.Flora.SeedPlants].needsWater, 0);
  assert.equal(SE.FLORA[SE.Flora.Grasses].needsWater, 0);
  // Marine algae need the sunlit shelf.
  const deep = findTile(w, (i) => w.elevation[i] < SE.COAST_DEPTH - 0.2 && w.temperature[i] > 5);
  const shelf = findTile(w, (i) => w.isWater(i) && w.elevation[i] > SE.COAST_DEPTH && w.temperature[i] > 5);
  assert.ok(s.flora.suit(w, SE.Flora.MarineAlgae, shelf) > s.flora.suit(w, SE.Flora.MarineAlgae, deep) * 5);
});

test('problem() never objects to a tile a group can spread into (founding habitat uses it)', () => {
  const s = makeSim(12345);
  const w = s.world;
  s.flora.prepare(w, s.params, true);
  for (let g = 1; g < SE.FLORA_COUNT; g++) {
    const i = findTile(w, (j) => s.flora.suit(w, g, j) >= 0.15 && s.flora.problem(w, g, j) !== null);
    assert.equal(i, -1, `${SE.FLORA[g].id}: "${i >= 0 ? s.flora.problem(w, g, i) : ''}" on a suitable tile`);
  }
});

test('a planted group leads its tile at once, without a sim step (the planting tool)', () => {
  const s = makeSim(321);
  const w = s.world;
  for (let k = 0; k < 40; k++) s.tick();
  s.flora.prepare(w, s.params, true);
  const i = findTile(w, (j) => !w.isWater(j) && w.flora[j] === 0 && s.flora.suit(w, SE.Flora.LandPlants, j) > 0.3);
  assert.ok(i >= 0, 'a bare tile that suits the first land plants');
  assert.ok(s.flora.plant(w, SE.Flora.LandPlants, i, 0.7));
  assert.equal(w.floraTop[i], SE.Flora.LandPlants, 'drawn on the map right away');
});

test('biomes need the right plants: forest needs trees, taiga conifers, mosses make tundra', () => {
  // The habitat is derived from the tile's landscape (tests/landscape.test.js
  // has the full table). Since the landscape rework the rainforest begins at
  // TROPICAL_TEMP instead of 21 °C, so the temperate forest case sits below it.
  const B = SE.Biome;
  const F = SE.Flora;
  const c = (temp, moist, veg, group, elev = 0.1) => {
    const z = SE.landscapeZone(temp, moist, elev, veg, SE.ZONE_NONE);
    return SE.landscapeHabitat(SE.landscapeTarget(z, group === F.None ? 0 : 1 << group, true), z);
  };
  assert.equal(c(16, 0.5, 0.6, F.Ferns), B.Grass, 'ferns alone make open land, not forest');
  assert.equal(c(16, 0.45, 0.8, F.Broadleaf), B.Forest);
  assert.equal(c(25, 0.6, 0.9, F.Broadleaf), B.Jungle);
  assert.equal(c(25, 0.6, 0.9, F.Clubmosses), B.Jungle, 'scale-tree forest in the wet tropics');
  assert.equal(c(8, 0.5, 0.7, F.Conifers), B.Boreal);
  assert.equal(c(0, 0.4, 0.3, F.Mosses), B.Tundra);
  assert.equal(c(0, 0.4, 0.8, F.Conifers), B.Boreal);
  assert.equal(c(18, 0.5, 0.05, F.None), B.Rock, 'bare ground');
  assert.equal(c(30, 0.1, 0.05, F.None), B.Desert);
  assert.equal(c(20, 0.8, 0.5, F.LandPlants, 0.05), B.Swamp);
});

test('the planet greens from the shore inward', { timeout: 300000 }, () => {
  const s = makeSim(12345);
  s.evo.develop(s.world, s.params, 'cells');
  // Play until the first land plants are developed, then a little longer.
  for (let t = 0; t < 4000 && !s.world.evo.isDeveloped('landPlants'); t++) {
    s.tick();
    if (t % 5 === 0) {
      s.evo.refresh(s.world, s.params, true);
      const ids = s.evo.availableIds().sort((a, b) => SE.evoNode(a).cost - SE.evoNode(b).cost);
      if (ids.length) s.evo.develop(s.world, s.params, ids[0]);
    }
  }
  assert.ok(s.world.evo.isDeveloped('landPlants'));
  for (let t = 0; t < 250; t++) s.tick();
  const w = s.world;
  s.flora.prepare(w, s.params, true);
  let shore = 0;
  let inland = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    if (!(w.flora[i] & (1 << SE.Flora.LandPlants))) continue;
    if (s.flora.waterAccess[i] > 0) shore++; else inland++;
  }
  assert.ok(shore > 20, `first land plants spread along the shores (${shore})`);
  // A shore can move (rivers reroute, the climate shifts); stands left behind
  // die back over a few dozen ticks rather than vanishing at once.
  assert.ok(inland <= Math.max(2, shore * 0.02), `and almost nowhere away from water (${inland} of ${shore + inland})`);
});

test('pollinators make flowering plants grow denser on their tiles', () => {
  const s = makeSim(5);
  const w = s.world;
  s.flora.prepare(w, s.params, true);
  const tiles = [];
  for (let i = 0; i < SE.TILE_COUNT && tiles.length < 2; i++) {
    if (!w.isWater(i) && s.flora.suit(w, SE.Flora.Flowering, i) > 0.8) tiles.push(i);
  }
  assert.equal(tiles.length, 2);
  const [a, b] = tiles;
  for (const i of tiles) { w.flora[i] = 1 << SE.Flora.Flowering; w.vegetation[i] = 0.3; }
  w.lifeDensity[a * SE.LIFE_COUNT + SE.Life.Pollinator] = 0.4;
  w.co2 = 400;
  for (let k = 0; k < 200; k++) {
    s.flora.step(w, s.params);
    // Keep the two test tiles to their single group (spread may add others).
    w.flora[a] = 1 << SE.Flora.Flowering;
    w.flora[b] = 1 << SE.Flora.Flowering;
  }
  const ratio = (w.vegetation[a] / s.flora.suit(w, SE.Flora.Flowering, a)) / (w.vegetation[b] / s.flora.suit(w, SE.Flora.Flowering, b));
  assert.ok(ratio > 1.12, `pollinated tile is denser (ratio ${ratio.toFixed(2)})`);
});

test('F01: resetting the model keeps the objects the sliders are bound to', () => {
  const p = new SE.ModelParams();
  const atmo = p.atmo;
  atmo.solarInput = 0.9;
  p.reset();
  assert.equal(p.atmo, atmo, 'same object after reset');
  assert.equal(atmo.solarInput, 0.5, 'and back at its default');
});

test('F03: placing a population that is already there changes nothing', () => {
  const s = makeSim(8);
  const w = s.world;
  const i = findTile(w, (j) => w.isWater(j) && w.biome[j] === SE.Biome.Coast);
  const x = i % SE.GRID_W;
  const y = Math.floor(i / SE.GRID_W);
  assert.equal(SE.LifeSystem.seed(w, SE.Life.Prokaryote, x, y), true);
  assert.equal(SE.LifeSystem.seed(w, SE.Life.Prokaryote, x, y), false);
  assert.equal(SE.LifeSystem.seed(w, SE.Life.Mammal, x, y), false, 'wrong realm');
});

test('F04: the placement check uses the room competitors leave', () => {
  const s = makeSim(9);
  const w = s.world;
  w.o2 = 25;
  w.oceanO2 = 100;
  const L = SE.LIFE_COUNT;
  const i = findTile(w, (j) => w.isWater(j) && w.biome[j] === SE.Biome.Coast && w.temperature[j] > 10 && w.temperature[j] < 25);
  w.refreshDerived();
  // Alone, sponges and jellies could live here on the ambient plankton,
  // which a living ocean supplies everywhere...
  for (let j = 0; j < SE.TILE_COUNT; j++) if (w.isWater(j)) w.lifeDensity[j * L + SE.Life.Prokaryote] = 0.6;
  w.refreshDerived();
  s.life.prepare(w, s.params, true);
  assert.equal(s.life.habitabilityProblem(w, s.params, i, SE.Life.Radiate), null);
  // ...but not once their own guild has filled the tile.
  for (const c of [SE.Life.Arthropod, SE.Life.Mollusc, SE.Life.Bilateria]) w.lifeDensity[i * L + c] = 0.9;
  w.refreshDerived();
  assert.match(s.life.habitabilityProblem(w, s.params, i, SE.Life.Radiate) || '', /Platz/);
  // Wrong realm and missing food are named as such.
  assert.match(s.life.habitabilityProblem(w, s.params, i, SE.Life.Mammal) || '', /Land/);
  // Amphibians live on prey alone: land without insects offers them nothing.
  // (Whales would not do here — baleen whales really can live on plankton.)
  const land = findTile(w, (j) => !w.isWater(j) && SE.LIFE[SE.Life.Amphibian].suit[w.biome[j]] > 0 && w.temperature[j] > 8 && w.temperature[j] < 30);
  assert.match(s.life.habitabilityProblem(w, s.params, land, SE.Life.Amphibian) || '', /Nahrung/);
});

test('F05: a reset planet counts its own biomes', () => {
  const w = new SE.WorldState();
  w.reset(1234);
  const counts = new Array(SE.BIOME_COUNT).fill(0);
  for (let i = 0; i < SE.TILE_COUNT; i++) counts[w.biome[i]]++;
  assert.deepEqual(Array.from(w.biomeCounts), counts);
});

test('F06: fire burns the vegetation itself, which then regrows', () => {
  const s = makeSim(10);
  const w = s.world;
  s.flora.prepare(w, s.params, true);
  const i = findTile(w, (j) => !w.isWater(j) && s.flora.suit(w, SE.Flora.Broadleaf, j) > 0.6);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const j = SE.idx(SE.wrapX(i % SE.GRID_W + dx), SE.clampY(Math.floor(i / SE.GRID_W) + dy));
    if (w.isWater(j)) continue;
    w.flora[j] = (1 << SE.Flora.Broadleaf) | (1 << SE.Flora.Ferns);
    w.vegetation[j] = 0.8;
  }
  s.events.trigger(w, SE.EventKind.Fire, i % SE.GRID_W, Math.floor(i / SE.GRID_W));
  assert.ok(w.vegetation[i] < 0.2, `vegetation after fire ${w.vegetation[i]}`);
  assert.equal(w.flora[i] & (1 << SE.Flora.Broadleaf), 0, 'trees burnt');
  assert.notEqual(w.flora[i] & (1 << SE.Flora.Ferns), 0, 'undergrowth survives to regrow');
  const after = w.vegetation[i];
  w.co2 = 400;
  for (let k = 0; k < 40; k++) s.flora.step(w, s.params);
  assert.ok(w.vegetation[i] > after, 'vegetation recovers');
});

test('F07: plate drift phase resets with a new planet and survives saving', () => {
  const geo = new SE.GeoSystem();
  geo.driftOffsets = [0.75, -0.3, 0.2, 0.1];
  assert.deepEqual(geo.driftOffsets.map((v) => Math.round(v * 100) / 100), [0.75, -0.3, 0.2, 0.1]);
  geo.resetDrift();
  assert.deepEqual(geo.driftOffsets, [0, 0, 0, 0]);
  geo.driftOffsets = [NaN, 'x', 5, -5];
  assert.deepEqual(geo.driftOffsets, [0, 0, 1, -1], 'invalid values are clamped or zeroed');
});

test('evolution points come from living diversity and the advance-rate slider', () => {
  const s = makeSim(11);
  assert.equal(s.evo.epRate(s.world, s.params), 0, 'no life, no points');
  s.evo.develop(s.world, s.params, 'cells');
  const r1 = s.evo.epRate(s.world, s.params);
  assert.ok(r1 > 0);
  s.params.bio.evolutionRate = 1;
  assert.ok(Math.abs(s.evo.epRate(s.world, s.params) - r1 * 2) < 1e-9);
});
