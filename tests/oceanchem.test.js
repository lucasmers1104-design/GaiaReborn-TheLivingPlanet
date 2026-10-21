'use strict';
/*
 * Ocean oxygen and iron: the first marine oxygen rusts the dissolved iron,
 * only then does the sea and after it the air take up oxygen; the three
 * milestones of that story fire once each, and saves keep (or, for version 5,
 * derive) the sea's state.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE, makeSim } = require('./helpers');

const SE = loadSE();

const ctx = (s) => ({ world: s.world, params: s.params, geo: s.geo, history: s.history });

/** A bare atmosphere fed only by a constant marine oxygen production. */
function marineOnly(production) {
  const world = new SE.WorldState();
  const params = new SE.ModelParams();
  const atmo = new SE.AtmosphereSystem();
  return {
    world,
    step() {
      atmo.oceanO2Delta = production;
      atmo.step(world, params);
    },
  };
}

test('while the iron lasts, marine oxygen reaches neither the sea nor the air', () => {
  const m = marineOnly(0.08);
  const w = m.world;
  assert.equal(w.oceanIron, 1);
  assert.equal(w.o2, 0);
  let t = 0;
  for (; t < 1000 && w.oceanIron > 0.1; t++) {
    m.step();
    if (w.oceanIron > 0.1) {
      assert.ok(w.o2 < 0.01, `air ${w.o2} % at tick ${t}`);
      assert.ok(w.oceanO2 < 0.5, `sea ${w.oceanO2} % at tick ${t}`);
    }
  }
  assert.ok(w.oceanIron <= 0.1, 'the iron is used up eventually');
});

test('once the iron is used up, the sea takes up oxygen before the air does', () => {
  const m = marineOnly(0.08);
  const w = m.world;
  let sea = -1;
  let air = -1;
  for (let t = 0; t < 2000 && air < 0; t++) {
    m.step();
    if (sea < 0 && w.oceanO2 >= SE.OCEAN_O2_RISEN) {
      sea = t;
      assert.ok(w.oceanIron < SE.IRON_DEPLETED, 'not while iron remains');
      assert.ok(w.o2 < 0.5, `air already at ${w.o2} %`);
    }
    if (air < 0 && w.o2 >= SE.AIR_O2_RISEN) air = t;
  }
  assert.ok(sea >= 0 && air > sea, `sea at ${sea}, air at ${air}`);
});

test('sea and air even out in both directions', () => {
  // Oxygen-rich air over an iron-free, empty sea: the sea takes some up.
  const a = marineOnly(0);
  a.world.oceanIron = 0;
  a.world.o2 = 15;
  for (let t = 0; t < 20; t++) a.step();
  assert.ok(a.world.oceanO2 > 30, `sea ${a.world.oceanO2} %`);

  // Over a sea still full of iron, the air's oxygen is drawn down and rusts it.
  const b = marineOnly(0);
  b.world.o2 = 0.5;
  for (let t = 0; t < 20; t++) b.step();
  assert.ok(b.world.oceanIron < 1, 'iron was oxidised');
  assert.ok(b.world.oceanO2 < 0.5);
  assert.ok(b.world.o2 < 0.1, `air ${b.world.o2} %`);
});

test('the three oxygen milestones fire in order, once per planet', () => {
  const s = makeSim(31337);
  const w = s.world;
  s.evo.develop(w, s.params, 'cells');
  const keys = () => w.evo.chronicle.filter((e) => e.key.startsWith('oxygen:')).map((e) => e.key);
  for (let t = 0; t < 400 && keys().length < 3; t++) {
    s.tick();
    if (w.oceanIron > 0.1) assert.ok(w.o2 < 0.05, `air ${w.o2} % while iron ${w.oceanIron} remains`);
  }
  assert.deepEqual(keys(), ['oxygen:iron', 'oxygen:sea', 'oxygen:air']);
  const at = keys().map((k) => w.evo.chronicle.find((e) => e.key === k).tick);
  assert.ok(at[0] <= at[1] && at[1] <= at[2], `ticks ${at}`);
  for (const k of keys()) assert.ok(s.evo.pending.some((e) => e.key === k), `${k} queued for display`);
  assert.equal(w.evo.chronicle.find((e) => e.key === 'oxygen:air').title, 'Große Sauerstoffkatastrophe');

  // Iron returning and running out again is not news a second time.
  w.oceanIron = 1;
  for (let t = 0; t < 5; t++) s.tick();
  w.oceanIron = 0;
  for (let t = 0; t < 5; t++) s.tick();
  assert.deepEqual(keys(), ['oxygen:iron', 'oxygen:sea', 'oxygen:air']);
});

test('saving keeps the sea: iron, dissolved oxygen and the tick count', async () => {
  const a = makeSim(2024);
  a.evo.develop(a.world, a.params, 'cells');
  for (let t = 0; t < 110; t++) a.tick();
  a.world.oceanIron = 0.0123;
  a.world.oceanO2 = 42.5;
  const doc = SE.SaveSystem.serialize(ctx(a));
  assert.equal(doc.version, SE.SAVE_FORMAT);
  assert.equal(SE.SaveSystem.meta(doc).ticks, a.world.ticks);

  const b = makeSim(1);
  SE.SaveSystem.load(await SE.SaveSystem.decode(await SE.SaveSystem.encode(doc)), ctx(b), b.life, b.flora);
  assert.equal(b.world.oceanIron, 0.0123);
  assert.equal(b.world.oceanO2, 42.5);
  assert.equal(b.world.o2, a.world.o2);
  assert.deepEqual(b.history.series.map((x) => x.data.length), a.history.series.map((x) => x.data.length));

  for (const breakIt of [(d) => { delete d.oceanIron; }, (d) => { d.oceanO2 = -1; }, (d) => { d.oceanIron = 2; }]) {
    const copy = JSON.parse(JSON.stringify(doc));
    breakIt(copy);
    assert.throws(() => SE.SaveSystem.load(copy, ctx(b), b.life, b.flora), (e) => e instanceof SE.SaveCorrupt, breakIt.toString());
  }
  assert.equal(b.world.oceanO2, 42.5, 'a failed load changes nothing');
});

/** A version-5 document: no sea chemistry, three sub-species, eight history series. */
function v5Doc(s, o2) {
  const doc = JSON.parse(JSON.stringify(SE.SaveSystem.serialize(ctx(s))));
  doc.version = 5;
  doc.o2 = o2;
  delete doc.oceanIron;
  delete doc.oceanO2;
  const stages = Uint8Array.from(Buffer.from(doc.life.s, 'base64'), (_, k) => k % 3);
  doc.life.s = Buffer.from(stages).toString('base64');
  doc.history.series = doc.history.series.slice(0, 8);
  doc.evolution.chronicle = doc.evolution.chronicle.filter((e) => !e.key.startsWith('oxygen:'));
  return doc;
}

test('a version-5 save gets eight-rung sub-species and a sea read off its air', () => {
  const a = makeSim(4242);
  a.evo.develop(a.world, a.params, 'cells');
  for (let t = 0; t < 160; t++) a.tick();

  const doc = v5Doc(a, 12.6);
  const b = makeSim(1);
  SE.SaveSystem.load(doc, ctx(b), b.life, b.flora);
  const w = b.world;
  const L = SE.LIFE_COUNT;
  const tiles = new Uint32Array(Uint8Array.from(Buffer.from(doc.life.t, 'base64')).buffer);
  const cls = Buffer.from(doc.life.c, 'base64');
  const old = Buffer.from(doc.life.s, 'base64');
  assert.ok(tiles.length > 10, 'the planet has life to migrate');
  const last = SE.SUBSPECIES_PER_CLASS - 1;
  for (let k = 0; k < tiles.length; k++) {
    assert.equal(w.lifeStage[tiles[k] * L + cls[k]], Math.round((old[k] * last) / 2), `entry ${k}`);
  }
  assert.ok(Array.from(old).includes(2) && w.lifeStage.includes(last), 'the top rung stays the top rung');

  assert.equal(w.oceanIron, 0);
  assert.ok(Math.abs(w.oceanO2 - (12.6 / SE.O2_PRESENT) * 100) < 1e-9, `sea ${w.oceanO2}`);
  // Milestones it had already passed are in the chronicle, but not as news.
  const ox = w.evo.chronicle.filter((e) => e.key.startsWith('oxygen:'));
  assert.deepEqual(ox.map((e) => e.key), ['oxygen:iron', 'oxygen:sea', 'oxygen:air']);
  for (const e of ox) assert.ok(w.evo.reported.has(e.key));
  // The older history is padded with the sea it implies, not dropped.
  assert.equal(b.history.series.length, 17);
  assert.ok(b.history.years.length > 0);
  for (const s of b.history.series) assert.equal(s.data.length, b.history.years.length);
  assert.ok(b.history.series[9].data.every((v) => v >= 0 && v <= 1));

  // A young version-5 planet (it started at 1 % oxygen) still has iron.
  const young = makeSim(1);
  SE.SaveSystem.load(v5Doc(a, 1), ctx(young), young.life, young.flora);
  assert.ok(young.world.oceanIron > 0.1);
  assert.equal(young.world.oceanO2, 0);
  assert.ok(!young.world.evo.chronicle.some((e) => e.key.startsWith('oxygen:')));
  for (let t = 0; t < 20; t++) young.tick();
  assert.ok(Number.isFinite(young.world.o2) && Number.isFinite(young.world.oceanO2));
});
