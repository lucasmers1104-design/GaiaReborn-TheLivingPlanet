'use strict';
/*
 * Height and vegetation (docs/hoehe-spec.md §3.5–3.7): altitude belts read
 * off the tile's own temperature, tropical highland by its sea-level
 * temperature (E5), the rock rule with weathering (E4: fresh rock stays),
 * and the rain shadow behind a ridge.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE, makeSim } = require('./helpers');

const SE = loadSE();
const L = SE.Landscape;
const F = SE.Flora;
const B = SE.Biome;
const bit = (...gs) => gs.reduce((m, g) => m | (1 << g), 0);
const ALL_PLANTS = bit(F.LandPlants, F.Mosses, F.Vascular, F.Ferns, F.SeedPlants, F.Conifers, F.Flowering, F.Broadleaf, F.Grasses);
/** Elevation of a mountain tile well inside the belt, and of lowland. */
const HIGH = 0.6;
const LOW = 0.1;

/** Zone of a tile at its own temperature `temp`, without Schmitt memory. */
const zoneOf = (temp, moist, elev, prev = SE.ZONE_NONE) => SE.landscapeZone(temp, moist, elev, 0.7, prev);
const climax = (temp, moist, groups, elev, soil = true) => SE.landscapeTarget(zoneOf(temp, moist, elev), groups, soil);
/** Tile temperature at `elev` under a sea-level temperature. */
const atHeight = (seaTemp, elev) => seaTemp - SE.altitudeCooling(elev);

test('tree line by temperature, not by a fixed height', () => {
  const below = zoneOf(SE.TREELINE_TEMP + 3, 0.45, HIGH);
  assert.ok(below & SE.ZONE_MOUNTAIN);
  assert.ok(!(below & SE.ZONE_TREELINE));
  assert.equal(SE.LANDSCAPE_LEVEL[climax(SE.TREELINE_TEMP + 3, 0.45, ALL_PLANTS, HIGH)], 4, 'forest below the tree line');
  assert.ok(zoneOf(SE.TREELINE_TEMP - 1, 0.45, HIGH) & SE.ZONE_TREELINE);
  assert.equal(climax(SE.TREELINE_TEMP - 1, 0.45, ALL_PLANTS, HIGH), L.Alpine, 'above it: alpine meadow');
  assert.equal(climax(SE.TREELINE_TEMP - 1, 0.45, bit(F.Mosses, F.Ferns, F.Conifers), HIGH), L.Tundra,
    'before grasses and flowering herbs the heights carry tundra');
  assert.equal(climax(SE.TREELINE_TEMP - 1, 0.45, bit(F.Mosses), HIGH), L.Moss);
  assert.equal(SE.landscapeHabitat(L.Alpine, zoneOf(SE.TREELINE_TEMP - 1, 0.45, HIGH)), B.Tundra);
  // Lowland as cold as that is no mountain: taiga, not alpine meadow.
  assert.ok(!(zoneOf(SE.TREELINE_TEMP - 1, 0.45, LOW) & SE.ZONE_TREELINE));
  assert.equal(climax(SE.TREELINE_TEMP - 1, 0.45, ALL_PLANTS, LOW), L.Taiga);

  // The same rule puts the tree line higher in the tropics than at mid-latitudes.
  const treeline = (seaTemp) => {
    for (let e = SE.ALPINE_MIN_ELEVATION; e <= 1; e += 0.005) {
      if (zoneOf(atHeight(seaTemp, e), 0.45, e) & SE.ZONE_TREELINE) return e * SE.ELEVATION_KM;
    }
    return Infinity;
  };
  const tropics = treeline(26);
  const temperate = treeline(13);
  assert.ok(Math.abs(tropics - temperate - 13 / SE.LAPSE_RATE) < 0.05, `tree line ${tropics.toFixed(2)} vs ${temperate.toFixed(2)} km`);

  // Schmitt band: a tile just above the tree line keeps its flag until past the band.
  let z = zoneOf(SE.TREELINE_TEMP - 1, 0.45, HIGH);
  z = zoneOf(SE.TREELINE_TEMP + SE.SCHMITT_TEMP - 0.2, 0.45, HIGH, z);
  assert.ok(z & SE.ZONE_TREELINE, 'inside the band');
  z = zoneOf(SE.TREELINE_TEMP + SE.SCHMITT_TEMP + 0.2, 0.45, HIGH, z);
  assert.ok(!(z & SE.ZONE_TREELINE), 'past the band');
});

test('a cold peak: rock belt, then summit snow; ice sheets stay ice', () => {
  const rock = zoneOf(SE.ROCKBELT_TEMP - 1, 0.3, 0.8);
  assert.ok(rock & SE.ZONE_ROCKBELT && rock & SE.ZONE_TREELINE && !(rock & SE.ZONE_SNOW));
  assert.equal(climax(SE.ROCKBELT_TEMP - 1, 0.3, ALL_PLANTS, 0.8), L.Rock, 'the rock belt is bare rock');
  assert.equal(climax(SE.ROCKBELT_TEMP - 1, 0.3, ALL_PLANTS, 0.8, false), L.Rock, 'with or without soil');
  assert.equal(climax(SE.SNOW_TEMP - 1, 0.3, ALL_PLANTS, 0.8), L.Snow);
  assert.equal(SE.landscapeHabitat(L.Snow, zoneOf(SE.SNOW_TEMP - 1, 0.3, 0.8)), B.Arctic, 'summit snow reflects like ice');
  // In dry air the snow line lies higher.
  assert.equal(climax(SE.SNOW_TEMP - 1, 0.1, ALL_PLANTS, 0.8), L.Rock);
  assert.equal(climax(SE.SNOW_TEMP - SE.SNOW_DRY_SHIFT - 1, 0.1, ALL_PLANTS, 0.8), L.Snow);
  // Frozen by height alone: summit snow. Frozen at sea level too: an ice sheet, on the plateau as in the lowland.
  assert.equal(climax(atHeight(-5, 0.5), 0.3, ALL_PLANTS, 0.5), L.Snow);
  assert.equal(climax(atHeight(-20, 0.5), 0.3, ALL_PLANTS, 0.5), L.Ice);
  assert.equal(climax(-20, 0.3, ALL_PLANTS, LOW), L.Ice);
  // Snow and ice never border woodland or desert; rock and alpine meadow do.
  for (const l of [L.Forest, L.Taiga, L.Cloudforest, L.Desert, L.Savanna]) {
    assert.ok(SE.LANDSCAPE_CLASH[L.Snow] & (1 << l), `snow at ${SE.LANDSCAPE_IDS[l]} is unnatural`);
  }
  for (const l of [L.Rock, L.Alpine, L.Tundra, L.Ice]) assert.ok(!(SE.LANDSCAPE_CLASH[L.Snow] & (1 << l)));
});

test('humid tropical highland carries cloud forest up to the tree line (E5)', () => {
  const sea = SE.TROPICAL_TEMP + 3;
  const mid = 0.4;
  assert.equal(SE.zoneTemp(zoneOf(atHeight(sea, mid), 0.45, mid)), 4, 'tropical by its sea-level temperature');
  assert.equal(climax(atHeight(sea, mid), 0.45, ALL_PLANTS, mid), L.Cloudforest);
  assert.equal(climax(atHeight(sea, mid), 0.6, ALL_PLANTS, mid), L.Cloudforest);
  assert.equal(SE.landscapeHabitat(L.Cloudforest, zoneOf(atHeight(sea, mid), 0.45, mid)), B.Jungle, 'rainforest for the animals');
  assert.equal(climax(atHeight(sea, mid), 0.45, bit(F.Mosses, F.Ferns, F.FirstTrees, F.SeedPlants), mid), L.Forest,
    'before the broadleaf trees: forest');
  // In the lowland the same humid tropics carry rainforest.
  assert.equal(climax(atHeight(sea, LOW), 0.6, ALL_PLANTS, LOW), L.Rainforest);
  assert.equal(climax(atHeight(sea, LOW), 0.45, ALL_PLANTS, LOW), L.Rainforest);
  assert.equal(climax(atHeight(sea, LOW), 0.33, ALL_PLANTS, LOW), L.Savanna);
  // Above the tropical tree line: alpine meadow; a mid-latitude slope as cold is no cloud forest.
  const top = (sea - SE.TREELINE_TEMP + 1) / SE.altitudeCooling(1);
  assert.equal(climax(atHeight(sea, top), 0.45, ALL_PLANTS, top), L.Alpine);
  assert.equal(climax(atHeight(12, mid), 0.45, ALL_PLANTS, mid), L.Taiga);
});

/** A real planet's terrain under one sea-level climate, bare and without plants, every land tile back to rock. */
function barePlanet(seed, { seaTemp = 15, moist = 0.35 } = {}) {
  const s = makeSim(seed);
  const w = s.world;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    w.temperature[i] = atHeight(seaTemp, w.elevation[i]);
    w.moisture[i] = w.isWater(i) ? 1 : moist;
    if (w.isWater(i)) continue;
    w.vegetation[i] = 0;
    w.flora[i] = 0;
    w.soil[i] = 0;
    w.landscape[i] = L.Rock;
    w.landscapeNext[i] = L.Rock;
    w.landscapeHold[i] = 0;
    w.landscapeZone[i] = SE.ZONE_NONE;
  }
  SE.BiomeSystem.step(w, false);
  return s;
}

/** Mark the first land plants as evolved: from then on bare rock weathers. */
function landPlantsEvolved(w) {
  w.evo.developed.set(SE.REGOLITH_AFTER_STEP, { tick: w.ticks, years: w.absoluteYears });
}

function advance(w, n) {
  for (let k = 0; k < n; k++) {
    SE.BiomeSystem.step(w);
    w.ticks++;
  }
}

test('rock rule: bare lowland weathers to Rohboden, fresh basalt and craters stay rock', { timeout: 120000 }, () => {
  const s = barePlanet(4242);
  const w = s.world;
  const lowland = [];
  for (let i = 0; i < SE.TILE_COUNT; i++) if (!w.isWater(i) && w.elevation[i] < SE.ALPINE_MIN_ELEVATION) lowland.push(i);
  assert.ok(lowland.every((i) => w.landscape[i] === L.Rock), 'young Earth: rock');
  // Rock weathers once the first land plants exist on the planet (REGOLITH_AFTER_STEP)
  // and have reached the tile.
  landPlantsEvolved(w);
  for (let i = 0; i < SE.TILE_COUNT; i++) if (!w.isWater(i)) w.flora[i] |= 1 << SE.Flora.LandPlants;
  advance(w, 80);
  const earth = Math.ceil(SE.SOIL_EARTH * 255);
  const bare = lowland.filter((i) => w.landscape[i] === L.Rock || w.soil[i] < earth);
  assert.equal(bare.length, 0, `${bare.length} lowland tiles still bare rock without regolith`);
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    if (w.isWater(i) || w.landscape[i] !== L.Rock) continue;
    // The coherence filters may carry the rock belt as far as its Schmitt band reaches.
    assert.ok(SE.SuccessionSystem.smoothedTemperature(i) < SE.ROCKBELT_TEMP + SE.SCHMITT_TEMP,
      `rock only in the rock belt, not at ${w.elevation[i].toFixed(2)}`);
  }

  // Lava and an impact bare the rock; with the scar lying on it the rock does not weather, without it does.
  const [basalt, crater, plain] = [lowland[100], lowland[Math.floor(lowland.length / 2)], lowland[lowland.length - 100]];
  for (const i of [basalt, crater, plain]) SE.SuccessionSystem.scour(w, i);
  SE.setScar(w, basalt, SE.ScarKind.Basalt);
  SE.setScar(w, crater, SE.ScarKind.Crater);
  advance(w, 80);
  for (const i of [basalt, crater]) {
    assert.equal(w.landscape[i], L.Rock, 'fresh rock stays bare');
    assert.equal(w.soil[i], 0);
  }
  assert.notEqual(w.landscape[plain], L.Rock, 'scoured rock without a scar weathers again');

  // Plant soil on a bare slope wears away down to the regolith, never below it.
  const regolith = Math.floor(SE.SOIL_REGOLITH * 255);
  w.soil[plain] = 250;
  advance(w, 200);
  assert.ok(w.soil[plain] >= regolith && w.soil[plain] < 250, `soil ${w.soil[plain]} kept its regolith`);
});

test('sand only in dry, low land that is not cold', { timeout: 120000 }, () => {
  const warm = barePlanet(4242, { seaTemp: 25, moist: 0.1 });
  landPlantsEvolved(warm.world);
  for (let i = 0; i < SE.TILE_COUNT; i++) if (!warm.world.isWater(i)) warm.world.flora[i] |= 1 << SE.Flora.LandPlants;
  advance(warm.world, 80);
  const cold = barePlanet(4242, { seaTemp: -2, moist: 0.1 });
  landPlantsEvolved(cold.world);
  for (let i = 0; i < SE.TILE_COUNT; i++) if (!cold.world.isWater(i)) cold.world.flora[i] |= 1 << SE.Flora.LandPlants;
  advance(cold.world, 80);
  let sand = 0;
  let coldSand = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    if (warm.world.isWater(i) || warm.world.elevation[i] >= SE.SAND_MAX_ELEVATION) continue;
    if (warm.world.substrate[i] === SE.Substrate.Sand) sand++;
    if (cold.world.substrate[i] === SE.Substrate.Sand) coldSand++;
  }
  assert.ok(sand > 100, `warm dry lowland is sand (${sand} tiles)`);
  assert.equal(coldSand, 0, 'a polar desert is gravel, not dunes');
});

test('rain shadow: the lee of a coastal range is drier than its windward side', () => {
  const s = makeSim(4242);
  const w = s.world;
  const y0 = SE.GRID_H / 2 - 6;
  const y1 = SE.GRID_H / 2 + 6;
  // A continent across the trade winds, its range eight tiles in from the windward coast.
  const wind = SE.windDirection(SE.GRID_H / 2);
  const crest = 128;
  const coast = crest - 8 * wind;
  for (let y = 0; y < SE.GRID_H; y++) {
    for (let x = 0; x < SE.GRID_W; x++) {
      const i = SE.idx(x, y);
      const land = y >= y0 && y < y1 && (x - coast) * wind >= 0 && (x - coast) * wind < 60;
      w.elevation[i] = land ? 0.05 + 0.6 * Math.exp(-(((x - crest) / 2) ** 2)) : -0.5;
      w.riparian[i] = 0;
      w.moisture[i] = 0.3;
      w.temperature[i] = 24;
    }
  }
  for (let t = 0; t < 300; t++) s.climate.step(w, s.params);
  const cls = (v) => SE.MOISTURE_BOUNDS.filter((b) => v >= b).length;
  const y = SE.GRID_H / 2;
  const windward = w.moisture[SE.idx(crest - 3 * wind, y)];
  const lee = w.moisture[SE.idx(crest + 3 * wind, y)];
  assert.ok(cls(lee) < cls(windward), `lee ${lee.toFixed(3)} vs windward ${windward.toFixed(3)}: a moisture class drier`);

});

test('the young Earth stays bare rock until the first land plants, then weathers', () => {
  const s = makeSim(12345);
  const w = s.world;
  s.evo.develop(w, s.params, 'cells');
  for (let t = 0; t < 120; t++) s.tick();
  assert.ok(!w.evo.isDeveloped('landPlants'), 'no land plants yet');
  let land = 0;
  let barren = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    if (w.elevation[i] < 0) continue;
    land++;
    if (w.landscape[i] === SE.Landscape.Barren) barren++;
  }
  assert.ok(barren <= land * 0.02, `no brown Rohboden before any plant (${barren} of ${land})`);
  // Once land plants exist, rock weathers to regolith where they grow, and only there.
  landPlantsEvolved(w);
  const planted = [];
  for (let i = 0; i < SE.TILE_COUNT && planted.length < 200; i++) {
    if (w.elevation[i] >= 0 && w.elevation[i] < SE.ALPINE_MIN_ELEVATION && i % 7 === 0) planted.push(i);
  }
  const earth = Math.ceil(SE.SOIL_EARTH * 255);
  for (let t = 0; t < 120; t++) {
    for (const i of planted) w.flora[i] |= 1 << SE.Flora.LandPlants;
    SE.BiomeSystem.step(w);
    w.ticks++;
  }
  const weathered = planted.filter((i) => w.soil[i] >= earth).length;
  let bareBrown = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    if (w.elevation[i] >= 0 && w.landscape[i] === SE.Landscape.Barren && (w.flora[i] & SE.LAND_FLORA_MASK) === 0) bareBrown++;
  }
  assert.ok(weathered > planted.length * 0.8, `planted rock weathers (${weathered} of ${planted.length})`);
  assert.ok(bareBrown <= land * 0.02, `no brown Rohboden where no plant grows (${bareBrown})`);
});

test('dry, warm bare ground is desert, weathered or not', () => {
  const z = SE.landscapeZone(25, 0.08, 0.05, 0, SE.ZONE_NONE);
  assert.equal(SE.landscapeTarget(z, 0, false), L.Desert, 'young, unweathered rock in a desert climate');
  assert.equal(SE.landscapeTarget(z, 0, true), L.Desert, 'weathered ground in a desert climate');
  const cool = SE.landscapeZone(8, 0.4, 0.05, 0, SE.ZONE_NONE);
  assert.equal(SE.landscapeTarget(cool, 0, false), L.Rock, 'bare rock elsewhere until it weathers');
});

test('sea depth in metres: the inverse of the Earth map, land stays linear', () => {
  assert.equal(SE.seaDepthMeters(0), 0);
  assert.equal(SE.seaDepthMeters(SE.COAST_DEPTH), 3500);
  assert.equal(SE.seaDepthMeters(-1), 6000);
  for (let k = 1; k <= 100; k++) assert.ok(SE.seaDepthMeters(-k / 100) > SE.seaDepthMeters(-(k - 1) / 100), `deeper at ${-k / 100}`);
  for (const m of [200, 1000, 3500, 4200, 6000]) assert.ok(Math.abs(SE.seaDepthMeters(SE.seaElevation(m)) - m) < 1e-6, `${m} m round trip`);
  assert.equal(SE.elevationMeters(0.52), 0.52 * SE.ELEVATION_KM * 1000);
  assert.equal(SE.elevationMeters(SE.COAST_DEPTH), -3500);
});

test('map legend: metre marks from the same conversion', () => {
  const node = () => ({ style: {}, dataset: {}, classList: { remove() {} }, children: [], append(...n) { this.children.push(...n); }, appendChild(n) { this.children.push(n); } });
  globalThis.document = { createElement: node };
  const marks = (mode) => {
    const host = node();
    SE.renderMapLegend(host, {}, mode, false);
    return host.children[0].children[1].children.map((s) => s.textContent);
  };
  try {
    assert.deepEqual(marks(SE.MapMode.Terrain), ['−6.000 m', '0 m', '4.500 m']);
    assert.deepEqual(marks(SE.MapMode.Oceans), ['−6.000 m', '−3.500 m', '0 m']);
  } finally {
    delete globalThis.document;
  }
});
