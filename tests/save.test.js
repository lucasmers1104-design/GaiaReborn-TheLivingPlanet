'use strict';
/*
 * Save files: a round trip that keeps every piece of evolution state, play
 * that continues after loading, all-or-nothing loading of damaged files, and
 * the migration of version-4 saves written before the evolution rework.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE, makeSim, hash } = require('./helpers');

const SE = loadSE();

/** A planet a few hundred ticks into a game, with developments and history. */
function playedSim(seed = 2024, ticks = 1400) {
  const s = makeSim(seed);
  s.evo.develop(s.world, s.params, 'cells');
  s.play(ticks);
  s.params.atmo.solarInput = 0.62;
  s.geo.driftOffsets = [0.25, -0.5, 0.1, 0];
  // Mark half of the chronicle as already shown.
  s.world.evo.chronicle.forEach((e, k) => { if (k % 2 === 0) s.world.evo.reported.add(e.key); });
  return s;
}

const ctx = (s) => ({ world: s.world, params: s.params, geo: s.geo, history: s.history });

test('round trip keeps the planet and the whole evolution state', async () => {
  const a = playedSim();
  const text = await SE.SaveSystem.encode(SE.SaveSystem.serialize(ctx(a)));
  assert.ok(text.startsWith('G1:'), 'saves are compressed');
  assert.ok(text.length < 1500000, `save is ${text.length} characters`);

  const b = makeSim(1);
  const doc = await SE.SaveSystem.decode(text);
  SE.SaveSystem.load(doc, ctx(b), b.life, b.flora);

  const wa = a.world;
  const wb = b.world;
  assert.equal(wb.ticks, wa.ticks);
  assert.equal(wb.seed, wa.seed);
  assert.equal(wb.rng.getState(), wa.rng.getState());
  assert.equal(wb.evo.ep, wa.evo.ep);
  assert.deepEqual(Array.from(wb.evo.developed.keys()).sort(), Array.from(wa.evo.developed.keys()).sort());
  assert.deepEqual(Array.from(wb.evo.reported).sort(), Array.from(wa.evo.reported).sort());
  assert.equal(wb.evo.chronicle.length, wa.evo.chronicle.length);
  assert.deepEqual(wb.evo.chronicle.map((e) => e.key), wa.evo.chronicle.map((e) => e.key));
  assert.equal(hash(wb.flora), hash(wa.flora), 'plant groups are stored exactly');
  assert.equal(hash(wb.tech), hash(wa.tech));
  assert.equal(b.params.atmo.solarInput, 0.62);
  assert.deepEqual(b.geo.driftOffsets.map((v) => Math.round(v * 100) / 100), [0.25, -0.5, 0.1, 0]);
  assert.equal(b.history.years.length, a.history.years.length, 'history survives');
  for (let i = 0; i < SE.TILE_COUNT; i += 97) {
    assert.ok(Math.abs(wb.elevation[i] - wa.elevation[i]) < 1e-4);
    assert.ok(Math.abs(wb.vegetation[i] - wa.vegetation[i]) < 1e-4);
  }
  for (let c = 1; c < SE.LIFE_COUNT; c++) assert.equal(wb.lifeCounts[c], wa.lifeCounts[c], `population count of ${SE.LIFE[c].id}`);
});

test('a long chronicle reloads with its newest entries', () => {
  const a = makeSim(7);
  for (let k = 0; k < 2100; k++) {
    a.world.evo.chronicle.push({ key: `t:${k}`, kind: 'info', title: 't', text: '', change: '', icon: 'assets/events/milestone.svg', tick: k, years: 0, major: false });
  }
  const b = makeSim(1);
  SE.SaveSystem.load(JSON.parse(JSON.stringify(SE.SaveSystem.serialize(ctx(a)))), ctx(b), b.life, b.flora);
  const keys = b.world.evo.chronicle.map((e) => e.key);
  assert.ok(keys.includes('t:2099'), 'newest entry survives');
  assert.ok(!keys.includes('t:0'), 'oldest entry is dropped');
});

test('paid model panels survive a reload; an older save has none paid', () => {
  const a = makeSim(7);
  const doc = JSON.parse(JSON.stringify(SE.SaveSystem.serialize({ ...ctx(a), paidModels: new Set(['atmo', 'geo']) })));
  const b = makeSim(1);
  const paid = new Set(['stale']);
  SE.SaveSystem.load(doc, { ...ctx(b), paidModels: paid }, b.life, b.flora);
  assert.deepEqual([...paid].sort(), ['atmo', 'geo']);
  delete doc.paidModels;
  SE.SaveSystem.load(doc, { ...ctx(b), paidModels: paid }, b.life, b.flora);
  assert.equal(paid.size, 0);
});

test('play continues after loading: points accrue and new steps can be developed', async () => {
  const a = playedSim(55, 900);
  const doc = await SE.SaveSystem.decode(await SE.SaveSystem.encode(SE.SaveSystem.serialize(ctx(a))));
  const b = makeSim(3);
  SE.SaveSystem.load(doc, ctx(b), b.life, b.flora);
  b.evo.refresh(b.world, b.params, true);
  const before = b.world.evo.developed.size;
  const order = b.play(1500);
  assert.ok(order.length > 0, 'something new was developed after loading');
  assert.ok(b.world.evo.developed.size > before);
  // Developments already made are never offered again.
  for (const o of order) assert.ok(!a.world.evo.developed.has(o.id), `${o.id} developed twice`);
});

test('a damaged save is rejected and leaves the current planet untouched', async () => {
  const a = playedSim(8, 500);
  const doc = SE.SaveSystem.serialize(ctx(a));

  const live = makeSim(77);
  live.evo.develop(live.world, live.params, 'cells');
  live.play(200);
  const fingerprint = () => [
    hash(live.world.elevation), hash(live.world.lifeDensity), hash(live.world.flora),
    live.world.ticks, live.world.evo.ep, live.world.evo.developed.size, live.params.atmo.solarInput,
  ].join('|');
  const before = fingerprint();

  const broken = [
    (d) => { d.fields.temperature = d.fields.temperature.slice(0, -40); },
    (d) => { d.fields.biome = 'not base64 at all!'; },
    (d) => { d.o2 = 999; },
    (d) => { d.timeScale = 9; },
    (d) => { d.omega = -5; },
    (d) => { d.params.atmo.solarInput = 'hoch'; },
    (d) => { d.evolution.developed = { marineAlgae: { tick: 1, years: 1 } }; }, // child without parent
    (d) => { delete d.life; },
    (d) => { d.evolution = null; },
  ];
  for (const breakIt of broken) {
    const copy = JSON.parse(JSON.stringify(doc));
    breakIt(copy);
    assert.throws(() => SE.SaveSystem.load(copy, ctx(live), live.life, live.flora), (e) => e instanceof SE.SaveCorrupt, breakIt.toString());
    assert.equal(fingerprint(), before, `planet changed by a failed load: ${breakIt}`);
  }

  await assert.rejects(SE.SaveSystem.decode('G1:AAAA'), (e) => e instanceof SE.SaveCorrupt);
  await assert.rejects(SE.SaveSystem.decode('{not json'), (e) => e instanceof SE.SaveCorrupt);
  assert.equal(fingerprint(), before);
});

test('saves from another format or map size are explained, not called corrupt', () => {
  const s = makeSim(1);
  assert.throws(() => SE.SaveSystem.load({ version: 3, w: 128, h: 64 }, ctx(s), s.life, s.flora), (e) => e instanceof SE.SaveIncompatible && /128 × 64/.test(e.message));
  assert.throws(() => SE.SaveSystem.load({ version: 5, w: 512, h: 256 }, ctx(s), s.life, s.flora), (e) => e instanceof SE.SaveIncompatible);
  assert.throws(() => SE.SaveSystem.load({ version: 'x' }, ctx(s), s.life, s.flora), (e) => e instanceof SE.SaveIncompatible);
});

test('unknown steps and classes in a newer save are skipped, not fatal', async () => {
  const a = playedSim(12, 400);
  const doc = SE.SaveSystem.serialize(ctx(a));
  doc.evolution.developed.someFutureStep = { tick: 1, years: 1 };
  doc.life.ids.push('someFutureAnimal');
  const b = makeSim(2);
  SE.SaveSystem.load(doc, ctx(b), b.life, b.flora);
  assert.ok(!b.world.evo.developed.has('someFutureStep'));
});

/** Build a version-4 document exactly as the previous release wrote it. */
function v4Doc(s) {
  const w = s.world;
  const arr = (a, dp) => Array.from(a, (v) => Math.round(v * 10 ** dp) / 10 ** dp);
  // Old class numbers: same as today except 8 = Trichordate, 15 = Carnifern.
  const t = []; const c = []; const d = []; const st = [];
  let land = -1;
  let land2 = -1;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    if (!w.isWater(i) && w.vegetation[i] > 0.2) { if (land < 0) land = i; else if (land2 < 0 && i > land + 40) land2 = i; }
    for (let k = 1; k < SE.LIFE_COUNT; k++) {
      const v = w.lifeDensity[i * SE.LIFE_COUNT + k];
      if (v <= 0 || k > 14) continue;
      // Version 4 had three sub-species per class.
      t.push(i); c.push(k); d.push(Math.round(v * 1000) / 1000); st.push(Math.min(2, w.lifeStage[i * SE.LIFE_COUNT + k]));
    }
  }
  // How green the planet is by now depends on its random history; the
  // fixture only needs two planted land tiles, so it plants them if needed.
  for (let i = 0; i < SE.TILE_COUNT && (land < 0 || land2 < 0); i++) {
    if (w.isWater(i) || i === land || (land >= 0 && i <= land + 40)) continue;
    w.vegetation[i] = Math.max(w.vegetation[i], 0.4);
    if (land < 0) land = i; else land2 = i;
  }
  t.push(land); c.push(15); d.push(0.4); st.push(1);   // a carnifern stand
  t.push(land2); c.push(8); d.push(0.3); st.push(0);   // a trichordate
  const seen = new Array(16).fill(-1);
  seen[1] = 0; seen[6] = 1e6; seen[8] = 2e6; seen[15] = 3e6;
  return {
    version: 4, w: SE.GRID_W, h: SE.GRID_H,
    seed: w.seed, rngState: w.rng.getState(), ticks: w.ticks, omega: w.omega,
    co2: w.co2, o2: w.o2, n2: w.n2, vapor: w.vapor, dust: w.dust,
    timeScale: w.timeScale, absoluteYears: w.absoluteYears, scaleYears: w.scaleYears,
    sentientClass: 0,
    elevation: arr(w.elevation, 4), temperature: arr(w.temperature, 2), moisture: arr(w.moisture, 3),
    vegetation: arr(w.vegetation, 3),
    life: { t, c, d, s: st },
    lifeFirstSeen: seen,
    cityPop: arr(w.cityPop, 3), magma: arr(w.magma, 3), uplift: arr(w.uplift, 2),
    biome: Array.from(w.biome, (b) => Math.min(b, 9)),
    tech: Array.from(w.tech),
    params: { geo: { ...s.params.geo }, atmo: { ...s.params.atmo }, bio: { ...s.params.bio }, civEnergy: { ...s.params.civEnergy }, civAlloc: { ...s.params.civAlloc } },
    _landTiles: [land, land2],
  };
}

test('version-4 saves are migrated with every reinterpretation explained', () => {
  const old = playedSim(4711, 2600);
  const doc = v4Doc(old);
  const [carniTile, trichTile] = doc._landTiles;
  delete doc._landTiles;
  const original = JSON.stringify(doc);

  const s = makeSim(1);
  const { notes } = SE.SaveSystem.load(doc, ctx(s), s.life, s.flora);
  assert.equal(JSON.stringify(doc), original, 'the old document is not modified');
  const w = s.world;

  assert.match(notes[0], /Version 4/);
  assert.ok(notes.some((n) => /Trichordaten/.test(n)));
  assert.ok(notes.some((n) => /Carniferns/.test(n)));
  // Carniferns became a carnivorous plant stand, trichordates land arthropods.
  assert.ok(w.flora[carniTile] & (1 << SE.Flora.Carnivorous), 'carnifern tile carries carnivorous plants');
  assert.ok(w.lifeDensity[trichTile * SE.LIFE_COUNT + SE.Life.LandArthropod] > 0, 'trichordates became land arthropods');
  assert.equal(w.lifeDensity[carniTile * SE.LIFE_COUNT + SE.Life.Bilateria], 0, 'slot 15 is not misread as worms');
  // Three sub-species became eight; the sea is read off the air.
  const top = doc.life.s.findIndex((s, k) => s === 2 && doc.life.c[k] !== 8);
  assert.ok(top >= 0, 'the old planet has top-rung sub-species');
  assert.equal(w.lifeStage[doc.life.t[top] * SE.LIFE_COUNT + doc.life.c[top]], SE.SUBSPECIES_PER_CLASS - 1);
  assert.ok(Number.isFinite(w.oceanIron) && Number.isFinite(w.oceanO2));

  // The tree is consistent: everything developed has its whole lineage.
  assert.ok(w.evo.developed.size > 3);
  for (const id of w.evo.developed.keys()) {
    let p = SE.evoNode(id).parent;
    while (p) { assert.ok(w.evo.developed.has(p), `${id} developed without ${p}`); p = SE.evoNode(p).parent; }
    assert.ok(w.evo.developed.get(id).migrated);
  }
  assert.ok(w.evo.developed.has('landArthropods'));
  assert.ok(w.evo.developed.has('carnivorous'));
  // Ancestors the old model never had are founded — parents before children.
  assert.ok(w.lifeCounts[SE.Life.Bilateria] > 0, 'the worms are founded next to their parents');
  for (const id of ['earlyAnimals', 'bilaterians', 'arthropods']) assert.ok(!w.evo.extinct.has(id), `${id} not marked extinct`);
  // No flood of congratulations: only the migration notice is unreported.
  const unseen = w.evo.chronicle.filter((e) => !w.evo.reported.has(e.key));
  assert.deepEqual(unseen.map((e) => e.key), ['migration:v4']);
  // And the migrated planet keeps running.
  s.evo.refresh(w, s.params, true);
  for (let k = 0; k < 50; k++) s.tick();
  assert.ok(w.vegetation.every((v) => Number.isFinite(v)));
});

test('a lineage already extinct is not reported extinct again after loading', async () => {
  const a = makeSim(2024);
  a.evo.develop(a.world, a.params, 'cells');
  a.play(40);
  a.world.lifeDensity.fill(0);
  a.world.refreshDerived();
  for (let k = 0; k < 16; k++) a.tick();
  const count = (s) => s.world.evo.chronicle.filter((e) => e.kind === 'extinction' && e.nodeId === 'cells').length;
  assert.equal(count(a), 1, 'cells died out once');

  const legacy = SE.SaveSystem.serialize(ctx(a));
  delete legacy.evolution.extinct; // a save from before the field existed
  for (const doc of [SE.SaveSystem.serialize(ctx(a)), legacy]) {
    const b = makeSim(1);
    SE.SaveSystem.load(await SE.SaveSystem.decode(await SE.SaveSystem.encode(doc)), ctx(b), b.life, b.flora);
    for (let k = 0; k < 24; k++) b.tick();
    assert.equal(count(b), 1, 'no second extinction notice after loading');
  }
});
