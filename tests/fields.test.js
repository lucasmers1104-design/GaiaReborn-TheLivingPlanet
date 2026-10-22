'use strict';
/*
 * Fields round the cities (src/fields.ts, docs/bewegung-2026-10): how many a
 * city has by size and era, which look, where they may lie and where never,
 * that they keep within the city's surroundings, touch only their own bits
 * of `world.landUse` and come out the same every time. The planet is drawn
 * by hand, as in tests/civ.test.js, and only the fields are stepped.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSim } = require('./helpers.js');

/** A planet of sea with one flat continent of meadow on mature soil at 15 °C; mammals think. */
function fixture(seed = 7) {
  const s = makeSim(seed);
  const { SE, world: w } = s;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    const x = i % SE.GRID_W;
    const y = Math.floor(i / SE.GRID_W);
    const land = x >= 20 && x < 120 && y >= 30 && y < 90;
    w.elevation[i] = land ? 0.1 : -0.3;
    w.landscape[i] = SE.Landscape.Meadow;
    w.landscapeDensity[i] = 1;
    w.substrate[i] = SE.Substrate.Soil;
    w.soil[i] = 200;
    w.temperature[i] = 15;
    w.moisture[i] = 0.5;
    w.riverLevel[i] = 0;
    w.landscapeZone[i] = SE.ZONE_NONE;
    w.tech[i] = 0;
    w.cityPop[i] = 0;
    w.landUse[i] = 0;
  }
  w.sentientClass = SE.Life.Mammal;
  w.civ.clear();
  return s;
}

const at = (SE, x, y) => y * SE.GRID_W + x;

/** Cities [x, y, tech, pop], then the records derived and the fields laid. */
function lay(s, cities) {
  const { SE, world: w } = s;
  const tiles = cities.map(([x, y, tech, pop]) => {
    const i = at(SE, x, y);
    w.tech[i] = tech;
    w.cityPop[i] = pop;
    return i;
  });
  s.civ.sync(w, s.params);
  SE.stepFields(w, s.params);
  return tiles;
}

/** Field tiles within the surroundings of `city`: [tile, look]. */
function fieldsOf(s, city) {
  const { SE, world: w } = s;
  const out = [];
  for (let dy = -SE.CITY_UMLAND; dy <= SE.CITY_UMLAND; dy++) {
    for (let dx = -SE.CITY_UMLAND; dx <= SE.CITY_UMLAND; dx++) {
      const j = SE.tileAt(city, dx, dy);
      if (j >= 0 && (w.landUse[j] & SE.LAND_USE_FIELD) !== 0) out.push([j, w.landUse[j] & SE.LAND_USE_FIELD]);
    }
  }
  return out;
}

function allFields(s) {
  const out = [];
  for (let i = 0; i < s.SE.TILE_COUNT; i++) if ((s.world.landUse[i] & s.SE.LAND_USE_FIELD) !== 0) out.push(i);
  return out;
}

test('fields per size and era, in the era\'s look', () => {
  const s = fixture();
  const { SE } = s;
  const T = SE.Tech;
  // [tech, pop, look]: villages, towns and metropolises of four eras, 8 tiles apart.
  const plan = [
    [T.Stone, 0.2, 1], [T.Stone, 0.5, 1], [T.Stone, 0.8, 1],
    [T.Bronze, 0.2, 2], [T.Iron, 0.5, 2], [T.Iron, 0.8, 2],
    [T.Industrial, 0.2, 6], [T.Industrial, 0.5, 6], [T.Industrial, 0.8, 6],
    [T.Atomic, 0.2, 7], [T.Information, 0.5, 7], [T.Nanotech, 0.8, 7],
  ];
  const tiles = lay(s, plan.map(([tech, pop], n) => [26 + (n % 6) * 15, 40 + Math.floor(n / 6) * 15, tech, pop]));
  plan.forEach(([tech, pop, look], n) => {
    const size = SE.citySize(pop);
    const base = SE.FIELD_COUNT[tech][size];
    const got = fieldsOf(s, tiles[n]);
    assert.ok(got.length === base || got.length === base + 1, `tech ${tech} size ${size}: ${got.length} fields, want ${base} or ${base + 1}`);
    for (const [, l] of got) assert.equal(l, look, `tech ${tech}: look`);
  });
  // A village of the Stone Age has one or two small plots.
  assert.deepEqual([...SE.FIELD_COUNT[T.Stone]].slice(0, 1), [1]);
  // More with size, more with age.
  for (let t = T.Stone; t <= T.Nanotech; t++) {
    const row = SE.FIELD_COUNT[t];
    assert.ok(row[0] <= row[1] && row[1] <= row[2], `tech ${t}: more with size`);
    if (t > T.Stone) assert.ok(row[2] >= SE.FIELD_COUNT[t - 1][2], `tech ${t}: more with age`);
  }
});

test('fields keep to their city\'s surroundings and to open, fertile, flat land', () => {
  const s = fixture();
  const { SE, world: w } = s;
  const cx = 60;
  const cy = 60;
  const city = at(SE, cx, cy);
  // Round the city: sea to the west, a desert to the north, a river and a dense forest to the east, a steep hill to the south.
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const j = at(SE, cx + dx, cy + dy);
    if (dx === -3) w.elevation[j] = -0.2;
    if (dy === -3) w.landscape[j] = SE.Landscape.Desert;
    if (dx === 2 && dy !== -3) w.riverLevel[j] = 2;
    if (dx === 3) w.landscape[j] = SE.Landscape.Forest;
    if (dy === 3 && dx > -3 && dx < 2) w.elevation[j] = 0.4;
  }
  lay(s, [[cx, cy, SE.Tech.Nanotech, 0.9]]);
  const fields = allFields(s);
  assert.ok(fields.length >= 4, `${fields.length} fields`);
  for (const j of fields) {
    assert.ok(SE.tileDistance(j, city) <= Math.sqrt(SE.FIELD_REACH2[2]) + 1e-9, 'within reach');
    assert.ok(!w.isWater(j), 'not on water');
    assert.notEqual(j, city, 'not on the city');
    assert.equal(w.riverLevel[j], 0, 'not on a river');
    assert.notEqual(w.landscape[j], SE.Landscape.Desert, 'not on forbidden ground');
    assert.notEqual(w.landscape[j], SE.Landscape.Forest, 'not in a dense forest');
    const g = SE.cityGround(w, j);
    assert.ok(!g.forbidden && g.slope <= SE.FIELD_SLOPE_MAX, 'not forbidden, not steep');
  }
  // A light forest, or a logged one, may be cleared for a field.
  const t = fixture();
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const j = at(t.SE, 60 + dx, 60 + dy);
    t.world.landscape[j] = t.SE.Landscape.Forest;
    t.world.landscapeDensity[j] = dx < 0 ? 0 : 1;
    if (dx > 1) t.world.landUse[j] = t.SE.LAND_USE_LOGGED;
  }
  lay(t, [[60, 60, t.SE.Tech.Iron, 0.8]]);
  const cleared = allFields(t);
  assert.ok(cleared.length > 0);
  for (const j of cleared) {
    const dx = (j % t.SE.GRID_W) - 60;
    assert.ok(dx < 0 || dx > 1, 'only light or logged forest');
  }
});

test('warm wet lowland grows rice, slopes carry terraces, dry land millet', () => {
  const s = fixture();
  const { SE, world: w } = s;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const j = at(SE, 40 + dx, 50 + dy);
    w.temperature[j] = 26;
    w.moisture[j] = 0.8;
    const k = at(SE, 80 + dx, 50 + dy);
    w.landscape[k] = SE.Landscape.Steppe;
    w.moisture[k] = 0.15;
    // A hillside: 0.17 per tile southwards.
    w.elevation[at(SE, 60 + dx, 70 + dy)] = 0.1 + 0.17 * (dy + 3);
  }
  lay(s, [[40, 50, SE.Tech.Bronze, 0.8], [80, 50, SE.Tech.Iron, 0.8], [60, 70, SE.Tech.Bronze, 0.8]]);
  const looks = (x, y) => new Set(fieldsOf(s, at(SE, x, y)).map(([, l]) => l));
  assert.deepEqual([...looks(40, 50)], [4], 'paddies');
  assert.deepEqual([...looks(80, 50)], [3], 'millet');
  assert.ok(looks(60, 70).has(5), 'terraces');
});

test('fields touch only their own bits, and avoid the railway and the wonders', () => {
  const s = fixture();
  const { SE, world: w } = s;
  const rail = at(SE, 61, 60);
  const wonder = at(SE, 59, 60);
  const logged = at(SE, 60, 61);
  w.landUse[rail] = SE.LAND_USE_RAIL;
  w.landUse[wonder] = SE.LAND_USE_WONDER;
  w.landUse[logged] = SE.LAND_USE_LOGGED;
  // A stale field far from any city goes; the others' bits stay.
  const stale = at(SE, 100, 80);
  w.landUse[stale] = SE.LAND_USE_RAIL | 3;
  lay(s, [[60, 60, SE.Tech.Atomic, 0.9]]);
  assert.equal(w.landUse[rail], SE.LAND_USE_RAIL);
  assert.equal(w.landUse[wonder], SE.LAND_USE_WONDER);
  assert.equal(w.landUse[logged] & ~SE.LAND_USE_FIELD, SE.LAND_USE_LOGGED);
  assert.equal(w.landUse[stale], SE.LAND_USE_RAIL);
});

test('the same planet lays the same fields, again after landUse was zeroed (a load)', () => {
  const cities = [[30, 40, 1, 0.3], [45, 40, 2, 0.6], [60, 40, 4, 0.9], [75, 55, 5, 0.5], [90, 70, 6, 0.8]];
  const a = fixture(11);
  lay(a, cities);
  const b = fixture(11);
  lay(b, cities);
  assert.deepEqual([...a.world.landUse], [...b.world.landUse]);
  const before = [...a.world.landUse];
  assert.ok(allFields(a).length > 5);
  a.world.landUse.fill(0);
  a.SE.stepFields(a.world, a.params);
  assert.deepEqual([...a.world.landUse], before);
  // Another planet seed varies the layout, not the counts' rules.
  const c = fixture(12);
  lay(c, cities);
  assert.notDeepEqual([...c.world.landUse], before);
});

test('fields follow their city: a lost city leaves none behind', () => {
  const s = fixture();
  const { SE, world: w } = s;
  const [city] = lay(s, [[60, 60, SE.Tech.Iron, 0.8]]);
  assert.ok(allFields(s).length > 0);
  w.tech[city] = 0;
  w.cityPop[city] = 0;
  s.civ.sync(w, s.params);
  SE.stepFields(w, s.params);
  assert.equal(allFields(s).length, 0);
});

test('the landscape draws a field as its look\'s ground, also when only the field changed', () => {
  const s = fixture();
  const { SE, world: w } = s;
  const T = SE.LandTables.shared();
  const f = new SE.TerrainField();
  f.refresh(w);
  const [city] = lay(s, [[60, 60, SE.Tech.Industrial, 0.9]]);
  // Nothing but landUse changed since the last refresh: the incremental read must still see it.
  f.refresh(w);
  const fields = allFields(s);
  assert.ok(fields.length > 0);
  for (const j of fields) {
    const look = w.landUse[j] & SE.LAND_USE_FIELD;
    assert.equal(f.key[j], T.materialKey(SE.FIELD_MATERIALS[look]), `tile ${j}: ground of look ${look}`);
    assert.equal(f.scene[j], SE.LAND_SCENE_NONE, 'no wild plants on a field');
  }
  const wild = SE.tileAt(city, 5, 0);
  assert.equal(f.key[wild], T.groundKey(w.landscape[wild], w.substrate[wild], w.landscapeDensity[wild]));
  for (const id of SE.FIELD_MATERIALS.slice(1)) assert.ok(SE.TERRAIN_MANIFEST.materials[id], `${id} in the atlas`);
});
