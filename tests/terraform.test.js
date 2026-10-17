'use strict';
/*
 * The terraforming brush (src/terraform.ts): cheap dabs while the pointer is
 * held, one settle at the end of the stroke. Land rises out of the sea, high
 * land carries snow, lowered coasts and deep hollows fill with water, and
 * life leaves the ground it can no longer live on.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE, makeSim, hash } = require('./helpers');

const SE = loadSE();
const L = SE.Landscape;
const sim = makeSim(12345);
const w = sim.world;

const xOf = (i) => i % SE.GRID_W;
const yOf = (i) => (i / SE.GRID_W) | 0;
const raise = (r) => ({ radius: r, sign: 1 });
const lower = (r) => ({ radius: r, sign: -1 });
const dist = SE.TerrainGenerator.distanceToWater(w.elevation);
/** Tiles already used by a test: every test works on its own spot of the planet. */
const used = [];
const far = (i, d) => used.every((j) => Math.abs(xOf(i) - xOf(j)) + Math.abs(yOf(i) - yOf(j)) > d);

/** The first tile (in a fixed order) that matches, far from the spots other tests used. */
function find(pred, what) {
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    const y = yOf(i);
    if (y < 12 || y >= SE.GRID_H - 12) continue;
    if (far(i, 24) && pred(i)) { used.push(i); return i; }
  }
  throw new Error(`no tile for ${what}`);
}

/** Brush on tile i until `done` or `max` dabs; returns every dab's result and the tiles touched. */
function stroke(i, brush, done, max = 400, dt = 1 / 30) {
  const dabs = [];
  const touched = new Set();
  for (let n = 0; n < max && !done(); n++) {
    const d = SE.terraformDab(w, xOf(i), yOf(i), brush, dt);
    dabs.push(d);
    for (const t of d.tiles) touched.add(t);
  }
  return { dabs, touched };
}

const sum = (dabs, key) => dabs.reduce((s, d) => s + d[key], 0);
const F = SE.Flora;
const WOODS = (1 << F.LandPlants) | (1 << F.Mosses) | (1 << F.Vascular) | (1 << F.Ferns) | (1 << F.SeedPlants) |
  (1 << F.Conifers) | (1 << F.Grasses) | (1 << F.Flowering);
const landClass = Object.keys(SE.LIFE).map(Number).find((c) => c > 0 && SE.LIFE[c].realm === 'land');
const seaClass = Object.keys(SE.LIFE).map(Number).find((c) => c > 0 && SE.LIFE[c].realm === 'sea');

test('a dab with dt = 0 changes nothing', () => {
  const i = find((j) => w.elevation[j] > 0.05 && w.elevation[j] < 0.3, 'land');
  const before = [hash(w.elevation), hash(w.temperature), hash(w.landscape), hash(w.biome)];
  const d = SE.terraformDab(w, xOf(i), yOf(i), raise(6), 0);
  const e = SE.terraformDab(w, xOf(i), yOf(i), lower(6), 0);
  assert.equal(d.tiles.length + e.tiles.length, 0);
  assert.equal(d.moved + e.moved, 0);
  assert.deepEqual([hash(w.elevation), hash(w.temperature), hash(w.landscape), hash(w.biome)], before);
});

test('moved is what the dab moved, and grows with the time held', () => {
  const i = find((j) => w.elevation[j] > 0.05 && w.elevation[j] < 0.25 && dist[j] >= 4, 'lowland');
  const snap = Float32Array.from(w.elevation);
  const d1 = SE.terraformDab(w, xOf(i), yOf(i), raise(5), 0.02);
  let measured = 0;
  for (let t = 0; t < SE.TILE_COUNT; t++) measured += Math.abs(w.elevation[t] - snap[t]);
  assert.ok(Math.abs(d1.moved - measured) < 1e-4, `moved ${d1.moved} vs measured ${measured}`);
  assert.ok(d1.moved > 0 && d1.tiles.length > 20);
  const d2 = SE.terraformDab(w, xOf(i), yOf(i), raise(5), 0.04);
  assert.ok(d2.moved > 1.7 * d1.moved && d2.moved < 2.3 * d1.moved, `${d1.moved} then ${d2.moved}`);
  assert.ok(d1.height > 0, 'height is the mean elevation under the brush');
});

test('risen sea walks through the stages: sand at the coast, then what grows around it, then rock', () => {
  const landNb = (j) => [j - 1, j + 1, j - SE.GRID_W, j + SE.GRID_W].some((k) => w.elevation[k] >= 0.05);
  const seaT = (j) => w.temperature[j] + SE.altitudeCooling(Math.max(0, w.elevation[j]));
  const i = find((j) => w.elevation[j] < -0.03 && w.elevation[j] > -0.15 && landNb(j) && seaT(j) > 5 && seaT(j) < 22, 'temperate sea by a coast');
  // The coast carries grass and woods.
  for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
    const t = SE.idx(SE.wrapX(xOf(i) + dx), yOf(i) + dy);
    if (w.isWater(t)) continue;
    w.flora[t] = WOODS;
    w.vegetation[t] = 0.7;
    w.soil[t] = 255;
  }
  const looks = [];
  let coast = false;
  let low = null;
  const { dabs, touched } = stroke(i, raise(3), () => {
    const e = w.elevation[i];
    if (e >= 0) {
      const look = `${SE.LANDSCAPE_IDS[w.landscape[i]]}/${w.substrate[i]}`;
      if (looks[looks.length - 1] !== look) looks.push(look);
      if (e < 0.04 && w.substrate[i] === SE.Substrate.Sand) coast = true;
      if (e > 0.08 && e < 0.18 && !low) low = { level: SE.LANDSCAPE_LEVEL[w.landscape[i]], substrate: w.substrate[i], flora: w.flora[i] };
    }
    return e > 0.62;
  }, 400, 1 / 60);
  assert.ok(sum(dabs, 'emerged') >= 5, `${sum(dabs, 'emerged')} tiles emerged`);
  assert.ok(coast, 'fresh land at the waterline is sand');
  assert.ok(low && low.level >= 2 && low.substrate !== SE.Substrate.Sand && (low.flora & SE.LAND_FLORA_MASK) !== 0,
    `the lowland grows what grows around it: ${JSON.stringify(low)}`);
  assert.ok(SE.LANDSCAPE_LEVEL[w.landscape[i]] <= 1 && w.substrate[i] === SE.Substrate.Rock, `upland: ${looks[looks.length - 1]}`);
  assert.ok(looks.length >= 3 && looks.length <= 8, `looks on the way up, no flicker: ${looks.join(' → ')}`);
  const shownBefore = [...touched].map((t) => w.landscape[t]);
  SE.terraformSettle(w, touched);
  const kept = [...touched].filter((t, k) => w.landscape[t] === shownBefore[k]).length;
  assert.ok(kept >= 0.9 * touched.size, `settle keeps what the stroke showed: ${kept} of ${touched.size}`);
});

test('land raised high carries snow, at once and after settle', () => {
  // Mid-latitude lowland: snow needs a cold enough sea-level climate (it never falls on the equator).
  const seaT = (j) => w.temperature[j] + SE.altitudeCooling(w.elevation[j]);
  const i = find((j) => seaT(j) > 0 && seaT(j) < 8 && w.elevation[j] > 0.02 && w.elevation[j] < 0.3 && dist[j] >= 3 &&
    w.landscape[j] !== L.Ice, 'cool lowland');
  const seaLevelT = w.temperature[i] + SE.altitudeCooling(w.elevation[i]);
  const { touched } = stroke(i, raise(6), () => w.elevation[i] >= 0.99, 600);
  let live = 0;
  for (const t of touched) if (w.landscape[t] === L.Snow) live++;
  assert.ok(w.elevation[i] > 0.9, `peak at ${w.elevation[i]}`);
  assert.ok(Math.abs(w.temperature[i] + SE.altitudeCooling(w.elevation[i]) - seaLevelT) < 1e-3, 'the climate at sea level stays');
  assert.equal(w.landscape[i], L.Snow, 'the snow line follows the brush live');
  // No one-tile spike: erosion keeps the peak within reach of its neighbours.
  for (const j of [i - 1, i + 1, i - SE.GRID_W, i + SE.GRID_W]) assert.ok(w.elevation[i] - w.elevation[j] < 0.25);
  SE.terraformSettle(w, touched);
  assert.ok(w.landscape[i] === L.Snow || w.landscape[i] === L.Ice, `summit is ${SE.LANDSCAPE_IDS[w.landscape[i]]}`);
  let snow = 0;
  let rock = 0;
  for (const t of touched) {
    if (w.landscape[t] === L.Snow) snow++;
    if (w.landscape[t] === L.Rock || w.landscape[t] === L.Alpine) rock++;
  }
  console.log(`snow live ${live}, after settle ${snow}; rock/alpine ${rock}`);
  assert.ok(snow >= 5 && rock >= 1, `${snow} snow, ${rock} rock/alpine tiles on the new range`);
  assert.ok(Math.abs(snow - live) <= Math.max(3, live / 3), `settle keeps the snow the stroke showed: ${live} live, ${snow} after`);
  assert.equal(w.biome[i], SE.Biome.Arctic, 'summit snow is arctic habitat');
});

test('lowered coast floods, and land animals flee to the nearest land', () => {
  const i = find((j) => w.elevation[j] >= 0 && w.elevation[j] < 0.12 && dist[j] === 1 && dist[j + 3] >= 3, 'flat coast');
  const near = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) near.push(SE.idx(SE.wrapX(xOf(i) + dx), yOf(i) + dy));
  for (const t of near) if (!w.isWater(t)) w.lifeDensity[SE.lifeIdx(t, landClass)] = 0.6;
  let sand = false;
  const { dabs, touched } = stroke(i, lower(2.5), () => {
    if (!w.isWater(i) && w.substrate[i] === SE.Substrate.Sand) sand = true;
    return w.elevation[i] < -0.05;
  }, 400, 1 / 60);
  assert.ok(sand, 'the coast turns to beach before the sea takes it');
  assert.ok(w.isWater(i), 'the centre is under water');
  assert.ok(sum(dabs, 'flooded') >= 3, `${sum(dabs, 'flooded')} tiles flooded`);
  assert.ok(w.biome[i] === SE.Biome.Coast || w.biome[i] === SE.Biome.Ocean, 'water habitat at once');
  const onLand = () => {
    let sum = 0;
    for (let t = 0; t < SE.TILE_COUNT; t++) if (!w.isWater(t)) sum += w.lifeDensity[SE.lifeIdx(t, landClass)];
    return sum;
  };
  const drowned = near.filter((t) => w.isWater(t) && w.lifeDensity[SE.lifeIdx(t, landClass)] > 0).length;
  const before = onLand();
  SE.terraformSettle(w, touched);
  for (const t of touched) {
    if (w.isWater(t)) assert.equal(w.lifeDensity[SE.lifeIdx(t, landClass)], 0, 'no land animals left on drowned ground');
  }
  assert.ok(drowned >= 1 && onLand() > before, `${drowned} drowned populations fled to the land nearby`);
});

test('sea life leaves risen ground', () => {
  const i = find((j) => w.elevation[j] < -0.05 && w.elevation[j] > -0.2 && dist[j] === 0, 'shallow sea');
  w.lifeDensity[SE.lifeIdx(i, seaClass)] = 0.5;
  const { touched } = stroke(i, raise(3), () => w.elevation[i] > 0.05);
  SE.terraformSettle(w, touched);
  assert.equal(w.lifeDensity[SE.lifeIdx(i, seaClass)], 0);
  let moved = 0;
  for (let t = 0; t < SE.TILE_COUNT; t++) if (w.isWater(t) && w.lifeDensity[SE.lifeIdx(t, seaClass)] > 0) moved++;
  assert.ok(moved >= 1, 'it moved to the nearest water');
});

test('lowering carves down through the stages; water only below sea level, rising from the lowest tile', () => {
  const i = find((j) => w.elevation[j] > 0.15 && w.elevation[j] < 0.4 && dist[j] >= 12, 'inland');
  // A plateau at 0.3, so the brush's centre is the lowest point of the basin it digs.
  for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
    const t = SE.idx(SE.wrapX(xOf(i) + dx), yOf(i) + dy);
    w.temperature[t] += SE.altitudeCooling(w.elevation[t]) - SE.altitudeCooling(0.3);
    w.elevation[t] = 0.3;
  }
  let lastDry = Infinity;
  let sand = false;
  let firstFlood = null;
  const dabs = [];
  const touched = new Set();
  for (let n = 0; n < 900 && w.elevation[i] > -0.03; n++) {
    if (!w.isWater(i)) {
      lastDry = w.elevation[i];
      if (w.substrate[i] === SE.Substrate.Sand) sand = true;
    }
    const d = SE.terraformDab(w, xOf(i), yOf(i), lower(4), 1 / 60);
    dabs.push(d);
    for (const t of d.tiles) touched.add(t);
    if (!firstFlood && d.flooded > 0) firstFlood = d.tiles.filter((t) => w.isWater(t));
  }
  assert.ok(w.isWater(i), 'dug below the sea, the basin holds water');
  assert.ok(lastDry < 0.03, `no water while the floor stood ${lastDry.toFixed(3)} above the sea`);
  assert.ok(sand, 'the floor turned to sand before the water came');
  assert.ok(firstFlood && firstFlood.includes(i), 'the water rises from the lowest tile');
  for (const t of touched) assert.ok(w.isWater(t) === (w.elevation[t] < 0));
  SE.terraformSettle(w, touched);
  assert.ok(w.isWater(i), 'the lake stays after settle');
  let ring = 0;
  for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) === 6 && !w.isWater(SE.idx(SE.wrapX(xOf(i) + dx), yOf(i) + dy))) ring++;
  }
  assert.ok(ring >= 40, 'a lake, with land all around');
});

test('performance: a radius-8 dab is well under a millisecond, settle within budget', () => {
  const i = find((j) => w.elevation[j] > 0.05 && w.elevation[j] < 0.3, 'land');
  const touched = new Set();
  for (let n = 0; n < 50; n++) SE.terraformDab(w, xOf(i), yOf(i), raise(SE.TERRAFORM_RADIUS_MAX), 1 / 60);
  const N = 400;
  const t0 = process.hrtime.bigint();
  for (let n = 0; n < N; n++) {
    const d = SE.terraformDab(w, xOf(i), yOf(i), n % 2 ? raise(SE.TERRAFORM_RADIUS_MAX) : lower(SE.TERRAFORM_RADIUS_MAX), 1 / 60);
    for (const t of d.tiles) touched.add(t);
  }
  const perDab = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  assert.ok(perDab < 1, `${perDab.toFixed(3)} ms per dab`);
  // Settle in its steps, one a frame in the app: none may stall a frame alone.
  const steps = SE.terraformSettleSteps(w, touched).map((step) => {
    const t1 = process.hrtime.bigint();
    step();
    return Number(process.hrtime.bigint() - t1) / 1e6;
  });
  const settle = steps.reduce((a, b) => a + b, 0);
  assert.ok(settle < 250, `${settle.toFixed(1)} ms settle`);
  assert.ok(Math.max(...steps) < 15, `settle steps ${steps.map((t) => t.toFixed(1)).join(' / ')} ms`);
  console.log(`terraform: ${perDab.toFixed(3)} ms per radius-8 dab, settle ${settle.toFixed(1)} ms in steps of ${steps.map((t) => t.toFixed(1)).join(' / ')}`);
});

test('a forest lifted above the tree line gives way at settle, and the planet ticks on', () => {
  const seaT = (j) => w.temperature[j] + SE.altitudeCooling(w.elevation[j]);
  const i = find((j) => seaT(j) > 4 && seaT(j) < 12 && w.elevation[j] > 0.02 && w.elevation[j] < 0.2 && dist[j] >= 4, 'temperate lowland');
  const area = [];
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) area.push(SE.idx(SE.wrapX(xOf(i) + dx), yOf(i) + dy));
  for (const t of area) {
    if (w.isWater(t)) continue;
    w.flora[t] = WOODS;
    w.vegetation[t] = 0.8;
    w.soil[t] = 255;
    SE.SuccessionSystem.reset(w, t, L.Taiga);
  }
  const { touched } = stroke(i, raise(4), () => w.elevation[i] >= 0.95, 600);
  SE.terraformSettle(w, touched);
  const z = w.landscapeZone[i];
  assert.ok(z & SE.ZONE_TREELINE, 'the summit is above the tree line');
  assert.ok(SE.LANDSCAPE_LEVEL[w.landscape[i]] <= 2, `no trees on the summit: ${SE.LANDSCAPE_IDS[w.landscape[i]]}`);
  for (let k = 0; k < 3; k++) sim.tick();
  assert.ok(Number.isFinite(w.globalTemp));
});

test('an equatorial summit raised to the top carries snow, and keeps it as the planet ticks', () => {
  const seaT = (j) => w.temperature[j] + SE.altitudeCooling(w.elevation[j]);
  const i = find((j) => Math.abs(SE.latitudeDeg(yOf(j))) < 8 && seaT(j) > 20 && w.elevation[j] > 0.02 && w.elevation[j] < 0.3 &&
    dist[j] >= 4 && w.moisture[j] > 0.3, 'equatorial lowland');
  const { touched } = stroke(i, raise(6), () => w.elevation[i] >= 0.999, 900);
  assert.equal(w.landscape[i], L.Snow, `live: ${SE.LANDSCAPE_IDS[w.landscape[i]]} at ${w.temperature[i].toFixed(1)} °C`);
  SE.terraformSettle(w, touched);
  assert.equal(w.landscape[i], L.Snow, 'after settle');
  for (let k = 0; k < 40; k++) sim.tick();
  assert.equal(w.landscape[i], L.Snow, `after 40 ticks: ${SE.LANDSCAPE_IDS[w.landscape[i]]}`);
  assert.equal(w.biome[i], SE.Biome.Arctic);
  // Through a save: the raised land is remembered, and the snow stays.
  const ctx = (s) => ({ world: s.world, params: s.params, geo: s.geo, history: s.history });
  const doc = JSON.parse(JSON.stringify(SE.SaveSystem.serialize(ctx(sim))));
  assert.ok(Array.isArray(doc.terraformed) && doc.terraformed.includes(i));
  const b = makeSim(1);
  SE.SaveSystem.load(doc, ctx(b), b.life, b.flora);
  assert.equal(b.world.terraformed[i], 1);
  for (let k = 0; k < 20; k++) b.tick();
  assert.equal(b.world.landscape[i], L.Snow, 'after a save and 20 more ticks');
});

test('summit snow by height only on brushed land: natural relief keeps the climate snow line', () => {
  const zone = (brushed) => SE.landscapeZone(26 - SE.altitudeCooling(0.95), 0.45, 0.95, 0.7, SE.ZONE_NONE, 0.95, brushed);
  assert.ok(!(zone(false) & SE.ZONE_SNOW), 'a natural equatorial summit: no snow');
  assert.ok(zone(true) & SE.ZONE_SNOW, 'a brushed one: snow');
  assert.ok(!(SE.landscapeZone(26 - SE.altitudeCooling(0.95), 0.05, 0.95, 0.7, SE.ZONE_NONE, 0.95, true) & SE.ZONE_SNOW), 'not in dry air');
  const fresh = makeSim(4242);
  assert.ok(fresh.world.terraformed.every((v) => v === 0));
  assert.equal(SE.terraformedToJSON(fresh.world), undefined, 'a planet never brushed up saves no field');
});
