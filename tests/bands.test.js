'use strict';
/*
 * Wandering bands (src/bands.ts, docs/zivilisation-spec.md §2.13): a newly
 * sentient species sets out as bands, not as a city; they camp, walk one
 * tile a tick, settle after a minimum on a site with food and water, settle
 * anyway on poor land in the end, survive a save and set out again only
 * while none has settled. Hand-drawn planets, only the civilization ticks.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSim } = require('./helpers.js');

/** Sea with meadow on mature soil at 15 °C in each [x0, y0, x1, y1) rectangle; mammals live on it and think. */
function fixture(rects) {
  const s = makeSim(7);
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
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * SE.GRID_W + x;
        w.elevation[i] = 0.1;
        w.lifeDensity[i * SE.LIFE_COUNT + SE.Life.Mammal] = 0.5;
      }
    }
  }
  w.sentientClass = SE.Life.Mammal;
  w.civ.clear();
  s.civ.sync(w, s.params);
  return s;
}

const at = (SE, x, y) => y * SE.GRID_W + x;

/** Land 40..100 × 40..90 with a river along y = 60. */
function riverLand() {
  const s = fixture([[40, 40, 100, 90]]);
  for (let x = 40; x < 100; x++) s.world.riverLevel[at(s.SE, x, 60)] = 1;
  return s;
}

/** One civilization tick, as the app runs it: `each` sees the world before the clock moves on. */
function run(s, ticks, each) {
  for (let k = 0; k < ticks; k++) {
    s.civ.step(s.world, s.params, s.atmo);
    if (each && each() === false) return;
    s.world.ticks++;
  }
}

function cityTiles(s) {
  const out = [];
  for (let i = 0; i < s.SE.TILE_COUNT; i++) if (s.world.tech[i] !== 0) out.push(i);
  return out;
}

const snapshot = (w) => JSON.stringify(w.civ.bands);

test('sentience sets out a few camped bands on land, and no city', () => {
  const s = fixture([[40, 40, 100, 90]]);
  const { SE, world: w, params } = s;
  w.sentientClass = SE.Life.None;
  w.o2 = 21;
  params.bio.evolutionRate = 1;
  w.dinoEra.fate = 'extinct';
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    if (w.isWater(i)) continue;
    w.lifeDensity[i * SE.LIFE_COUNT + SE.Life.Mammal] = 0.8;
    w.lifeStage[i * SE.LIFE_COUNT + SE.Life.Mammal] = SE.HOMINID_STAGE;
  }
  w.refreshDerived();
  run(s, 4000, () => w.sentientClass === SE.Life.None);
  assert.equal(w.sentientClass, SE.Life.Mammal);
  assert.match(s.civ.lastNotice, /^Hominiden entwickeln Intelligenz\. Kleine Gruppen ziehen umher/);
  assert.equal(cityTiles(s).length, 0, 'no city at sentience');
  const bands = w.civ.bands;
  assert.ok(bands.length >= 2 && bands.length <= SE.BAND_COUNT, `${bands.length} bands`);
  for (const b of bands) {
    assert.deepEqual(b.path.length, 1);
    assert.ok(SE.cityGroundFits(w, b.path[0]));
    assert.equal(b.campAt, w.ticks, 'camped at once');
    assert.equal(SE.campShelters(b, w.ticks), 1);
    for (const o of bands) if (o !== b) assert.ok(SE.tileDistance(o.path[0], b.path[0]) >= SE.BAND_SPACING);
  }
});

test('a camp stands, shelters come and go one a tick, then the band walks one tile a tick to its next camp', () => {
  const s = riverLand();
  const { SE, world: w } = s;
  SE.spawnBands(w, at(SE, 60, 60));
  const b = w.civ.bands[0];
  const { campAt, breakAt, shelters } = b;
  assert.ok(breakAt - campAt >= SE.BAND_CAMP_TICKS[0] && breakAt - campAt <= SE.BAND_CAMP_TICKS[1]);
  assert.ok(shelters >= 2 && shelters <= SE.CAMP_SHELTERS_MAX);
  const seen = [];
  for (let t = campAt; t <= breakAt; t++) seen.push(SE.campShelters(b, t));
  assert.equal(seen[0], 1);
  assert.equal(seen[seen.length - 1], 1, 'the last shelter stands until the band walks on');
  assert.ok(seen.includes(shelters));
  for (let k = 1; k < seen.length; k++) assert.ok(Math.abs(seen[k] - seen[k - 1]) <= 1);

  // Strike the camp, walk, pitch the next one.
  let walked = 0;
  let last = b.path[b.step];
  run(s, 200, () => {
    if (!w.civ.bands.includes(b)) return false;
    const here = b.path[b.step];
    assert.ok(SE.tileDistance(here, last) <= 1.5, 'one tile a tick');
    assert.ok(!w.isWater(here));
    if (b.campAt < 0) walked++;
    else if (walked > 0) return false;
    last = here;
  });
  assert.ok(walked >= SE.BAND_LEG[0] && walked <= SE.BAND_LEG[1], `walked ${walked} ticks`);
  assert.ok(b.campAt >= 0, 'camped again');
  assert.ok(b.camps.length >= 2 && SE.tileDistance(b.camps[0], b.camps[b.camps.length - 1]) >= SE.BAND_LEG[0] - 1e-9);
});

test('bands settle only after the minimum, at a site with food and water; one chronicle entry for the first', () => {
  const s = riverLand();
  const { SE, world: w, params } = s;
  SE.spawnBands(w, at(SE, 60, 60));
  const since = w.civ.bands[0].since;
  const ids = w.civ.bands.length;
  const chronicle = [];
  const founded = [];
  run(s, SE.BAND_SETTLE_MAX + 100, () => {
    for (const n of w.civ.news) if (n.chronicle && n.chronicle.key.startsWith('civ:settled')) chronicle.push(n);
    for (const c of w.civ.cities) {
      if (founded.some((f) => f.tile === c.tile)) continue;
      const g = SE.cityGround(w, c.tile);
      founded.push({
        tile: c.tile, tick: w.ticks, pop: w.cityPop[c.tile], tech: w.tech[c.tile],
        water: g.river || g.coast || SE.riverBeside(w, c.tile), capacity: SE.cityCapacity(w, c.tile, SE.Tech.Stone, params),
      });
    }
    return w.civ.bands.length > 0;
  });
  assert.equal(w.civ.bands.length, 0, 'every band settled');
  assert.equal(founded.length, ids, 'one village per band on this rich land');
  for (const f of founded) {
    assert.ok(f.tick - since >= SE.BAND_SETTLE_AFTER, `settled after ${f.tick - since} ticks`);
    assert.ok(f.tick - since < SE.BAND_RELAX_AFTER, 'before the demands relax');
    assert.ok(f.water && f.capacity >= SE.SENTIENCE_SITE_CAPACITY);
    assert.equal(f.tech, SE.Tech.Stone);
    assert.ok(Math.abs(f.pop - SE.BAND_POP) < 0.01, 'a village starts with the band');
  }
  assert.ok(SE.tileDistance(founded[0].tile, founded[1].tile) >= SE.CITY_MIN_DIST);
  assert.equal(chronicle.length, 1, 'the first settling only');
  assert.equal(chronicle[0].chronicle.key, 'civ:settled:mammals');
  assert.match(chronicle[0].text, /^Die ersten Gruppen der Säugetiere werden sesshaft\. Ein dauerhaftes Dorf entsteht: \S+\.$/);
  assert.ok(w.civ.tribes.length >= 1, 'the first village founds the first people');
});

test('on poor land without water the demands relax, so the bands settle by the maximum', () => {
  const s = fixture([[40, 40, 100, 90]]);
  const { SE, world: w, params } = s;
  for (let i = 0; i < SE.TILE_COUNT; i++) if (!w.isWater(i)) w.landscape[i] = SE.Landscape.Lichen;
  const site = at(SE, 70, 65);
  assert.ok(SE.cityCapacity(w, site, SE.Tech.Stone, params) < SE.BAND_RELAX_CAPACITY, 'too poor even for the relaxed rule');
  SE.spawnBands(w, site);
  let first = -1;
  const end = SE.BAND_SETTLE_MAX + 2 * (SE.BAND_LEG[1] + SE.BAND_CAMP_TICKS[1]);
  run(s, end + 1, () => {
    if (first < 0 && w.civ.cities.length > 0) first = w.ticks;
    return w.civ.bands.length > 0;
  });
  assert.ok(first >= SE.BAND_SETTLE_MAX, `first village at ${first}`);
  assert.equal(w.civ.bands.length, 0, 'no band wanders on for good');
  assert.ok(w.civ.cities.length >= 1);
});

test('lost bands set out again, but never once a band has settled', () => {
  const s = riverLand();
  const { SE, world: w } = s;
  run(s, 1);
  assert.ok(w.civ.bands.length >= 2, 'a sentient species with neither bands nor cities sets out');
  run(s, SE.BAND_RELAX_AFTER, () => w.civ.cities.length === 0);
  assert.ok(w.civ.cities.length > 0);
  // Every village and band gone: nobody sets out again.
  w.civ.bands.length = 0;
  for (const i of cityTiles(s)) { w.tech[i] = 0; w.cityPop[i] = 0; }
  run(s, 5);
  assert.equal(w.civ.cities.length, 0);
  assert.equal(w.civ.bands.length, 0);
  // Neither after a load, where the chronicle remembers the first village.
  w.civ.settled = false;
  w.evo.chronicle.push({ key: 'civ:settled:mammals', kind: 'civ', title: '', text: '', change: '', icon: '', tick: 0, years: 0, major: false });
  run(s, 5);
  assert.equal(w.civ.bands.length, 0);
});

function saveAndLoad(s, edit) {
  const { SE } = s;
  const doc = JSON.parse(JSON.stringify(SE.SaveSystem.serialize({ world: s.world, params: s.params, geo: s.geo, history: s.history })));
  if (edit) edit(doc);
  const t = makeSim(1);
  SE.SaveSystem.load(doc, { world: t.world, params: t.params, geo: t.geo, history: t.history }, t.life, t.flora);
  return t;
}

test('bands survive a save exactly; unsound bands alone are dropped and set out again', () => {
  const s = riverLand();
  const { SE, world: w } = s;
  SE.spawnBands(w, at(SE, 60, 60));
  // Until one walks while another camps.
  run(s, 200, () => !(w.civ.bands.some((b) => b.campAt < 0) && w.civ.bands.some((b) => b.campAt >= 0)));
  w.ticks++;
  const before = snapshot(w);
  const t = saveAndLoad(s);
  assert.ok(t.world.civ.synced);
  assert.equal(snapshot(t.world), before);
  const used = Math.max(...t.world.civ.bands.map((b) => b.id));
  assert.ok(t.world.civ.nextId > used, 'new ids stay unique');

  const edits = [
    (doc) => { doc.civ.bands[0].path = [0, 5]; },                  // not contiguous
    (doc) => { doc.civ.bands[0].shelters = 9; },                   // more than a camp has
    (doc) => { doc.civ.bands[0].campAt = doc.ticks + 5; },         // in the future
    (doc) => { doc.civ.bands[0].pop = 2; },
    (doc) => { doc.civ.bands[0].camps = [-1]; },                   // off the map
    (doc) => { doc.civ.bands = 'oops'; },
  ];
  for (const edit of edits) {
    const u = saveAndLoad(s, edit);
    assert.ok(u.world.civ.synced, `the rest of the field is kept: ${edit}`);
    assert.equal(u.world.civ.bands.length, 0, `bands dropped: ${edit}`);
    u.civ.step(u.world, u.params, u.atmo);
    assert.ok(u.world.civ.bands.length >= 2, `set out again: ${edit}`);
  }
  // An older save without bands loads as before.
  const old = saveAndLoad(s, (doc) => { delete doc.civ.bands; });
  assert.ok(old.world.civ.synced);
  assert.equal(old.world.civ.bands.length, 0);
});

test('the same planet sends the same bands the same way', () => {
  const play = () => {
    const s = riverLand();
    s.SE.spawnBands(s.world, at(s.SE, 60, 60));
    const trace = [];
    run(s, 150, () => { trace.push(snapshot(s.world), cityTiles(s).join(',')); });
    return trace.join('\n');
  };
  assert.equal(play(), play());
});
