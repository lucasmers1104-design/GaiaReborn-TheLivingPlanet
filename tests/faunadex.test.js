'use strict';
/*
 * Species lexicon: every sub-species is announced exactly once, brief gaps
 * in its range are not extinction, adopted saves stay silent, the saved
 * state survives a round trip, and the temperature window matches the
 * simulation's own.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE, makeSim } = require('./helpers');

const SE = loadSE();
const N = SE.SUBSPECIES_PER_CLASS;
const GRACE = SE.FAUNA_EXTINCT_GRACE;
const CELLS = SE.Life.Prokaryote;

/** Greedy play like `s.play`, with the lexicon stepped after every tick. */
function played(ticks = 300, seed = 2024) {
  const s = makeSim(seed);
  const dex = new SE.FaunaDex();
  const events = [];
  for (let t = 0; t < ticks; t++) {
    s.tick();
    dex.step(s.world);
    events.push(...dex.pending.splice(0));
    if (t % 5 !== 0) continue;
    s.evo.refresh(s.world, s.params, true);
    const ids = s.evo.availableIds();
    if (ids.length === 0) continue;
    const id = ids.sort((a, b) => SE.evoNode(a).cost - SE.evoNode(b).cost)[0];
    const r = s.evo.develop(s.world, s.params, id);
    if (!r.ok) throw new Error(`develop(${id}) failed although available: ${r.reason}`);
  }
  return { s, w: s.world, dex, events };
}

/** Move the clock on without simulating — only what the lexicon reads. */
function advance(w, dex, n) {
  for (let k = 0; k < n; k++) {
    w.ticks++;
    w.refreshDerived();
    dex.step(w);
  }
}

/** Empty every tile of class `c` at `stage` (all stages if omitted); returns the undo. */
function hide(w, c, stage) {
  const saved = [];
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    const li = i * SE.LIFE_COUNT + c;
    if (w.lifeDensity[li] > 0 && (stage === undefined || w.lifeStage[li] === stage)) {
      saved.push([li, w.lifeDensity[li]]);
      w.lifeDensity[li] = 0;
    }
  }
  return () => { for (const [li, d] of saved) w.lifeDensity[li] = d; };
}

function livingStages(w, c) {
  const n = new Array(N).fill(0);
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    const li = i * SE.LIFE_COUNT + c;
    if (w.lifeDensity[li] > 0) n[w.lifeStage[li]]++;
  }
  return n;
}

test('every sub-species is announced exactly once over a long greedy game', () => {
  const { w, dex, events } = played(1800, 2024);
  assert.equal(SE.FaunaDex.TOTAL, 136);
  assert.ok(events.length >= 20, `only ${events.length} discoveries`);

  const keys = events.map((e) => `${e.c}:${e.stage}`);
  assert.equal(new Set(keys).size, keys.length, 'no sub-species announced twice');
  for (let k = 1; k < events.length; k++) {
    const a = events[k - 1];
    const b = events[k];
    const ordered = a.tick < b.tick || (a.tick === b.tick && (a.c < b.c || (a.c === b.c && a.stage < b.stage)));
    assert.ok(ordered, `events out of order at ${keys[k]}`);
  }

  const announced = new Set(keys);
  let withTile = 0;
  for (let c = 1; c < SE.LIFE_COUNT; c++) {
    for (let st = 0; st < N; st++) {
      assert.equal(dex.isDiscovered(c, st), announced.has(`${c}:${st}`), `${SE.LIFE[c].id}#${st + 1}`);
      if (w.lifeStageCounts[c * N + st] > 0) assert.equal(dex.status(c, st), 'living', `${SE.LIFE[c].id}#${st + 1} lives`);
    }
  }
  for (const e of events) {
    const d = dex.discovery(e.c, e.stage);
    assert.equal(d.tick, e.tick);
    assert.ok(!d.adopted);
    assert.equal(typeof d.o2, 'number');
    if (d.tile < 0) continue;
    withTile++;
    assert.ok(d.tile < SE.TILE_COUNT && d.biome >= 0 && d.biome < SE.BIOME_COUNT);
    assert.equal(typeof d.temp, 'number');
  }
  assert.ok(withTile >= events.length * 0.9, `${withTile} of ${events.length} first sightings have a tile`);

  assert.equal(dex.discoveredCount(), events.length);
  let sum = 0;
  for (let c = 1; c < SE.LIFE_COUNT; c++) sum += dex.discoveredCount(c);
  assert.equal(sum, events.length);
});

test('a brief gap is not extinction; a long one is, silently; a return is counted', () => {
  const { w, dex } = played();
  const st = 2;
  assert.ok(w.lifeStageCounts[CELLS * N + st] > 0 && w.lifeCounts[CELLS] > w.lifeStageCounts[CELLS * N + st]);
  assert.equal(dex.status(CELLS, st), 'living');
  const first = dex.discovery(CELLS, st);

  let restore = hide(w, CELLS, st);
  advance(w, dex, GRACE);
  assert.equal(dex.status(CELLS, st), 'living', `missing for ${GRACE - 1} ticks is still alive`);
  restore();
  advance(w, dex, 1);
  assert.equal(dex.status(CELLS, st), 'living');
  assert.equal(dex.returns(CELLS, st), 0);

  restore = hide(w, CELLS, st);
  advance(w, dex, GRACE);
  assert.equal(dex.status(CELLS, st), 'living', 'the gap restarted after the return');
  const v = dex.version;
  advance(w, dex, 1);
  assert.equal(dex.status(CELLS, st), 'extinct');
  assert.ok(dex.version > v);
  assert.equal(dex.pending.length, 0, 'extinction is silent');

  restore();
  advance(w, dex, 1);
  assert.equal(dex.status(CELLS, st), 'living');
  assert.equal(dex.returns(CELLS, st), 1);
  assert.equal(dex.pending.length, 0, 'a return is not a second discovery');
  assert.equal(dex.discovery(CELLS, st), first);
});

test('a whole group dying out marks its known sub-species extinct at once', () => {
  const { w, dex } = played(80);
  const known = [];
  for (let st = 0; st < N; st++) if (dex.isDiscovered(CELLS, st)) known.push(st);
  assert.ok(known.length >= 2 && known.length < N, `known stages ${known}`);

  const restore = hide(w, CELLS);
  advance(w, dex, 1);
  for (let st = 0; st < N; st++) {
    assert.equal(dex.status(CELLS, st), known.includes(st) ? 'extinct' : 'unknown', `stage ${st + 1}`);
  }
  assert.equal(dex.pending.length, 0);

  restore();
  advance(w, dex, 1);
  for (const st of known) {
    if (w.lifeStageCounts[CELLS * N + st] === 0) continue;
    assert.equal(dex.status(CELLS, st), 'living');
    assert.equal(dex.returns(CELLS, st), 1);
  }
  assert.equal(dex.pending.length, 0);
});

test('adopting a save without lexicon data is silent and fills the ladder', () => {
  const { w } = played(80);
  const gone = 1;
  hide(w, CELLS, gone);
  const counts = livingStages(w, CELLS);
  const h = counts.reduce((top, n, st) => (n > 0 ? st : top), -1);
  assert.ok(h >= 2 && h <= SE.SUBSPECIES_PER_CLASS - 3, `highest cell stage ${h}`);

  const ghost = SE.Life.Grazer;
  assert.equal(livingStages(w, ghost).reduce((a, b) => a + b, 0), 0);
  w.lifeFirstSeen[ghost] = Math.max(0, w.absoluteYears - 1e6);
  assert.equal(w.lifeFirstSeen[SE.Life.Mammal], -1);
  // Derived counters that still describe another planet, as right after loading.
  w.lifeStageCounts.fill(0);
  w.lifeCounts.fill(0);

  const dex = new SE.FaunaDex();
  const v = dex.version;
  dex.adoptLiving(w);
  assert.equal(dex.pending.length, 0);
  assert.ok(dex.version > v);
  const adopted = { tick: w.ticks, years: w.absoluteYears, tile: -1, biome: -1, temp: null, o2: null, adopted: true };
  for (let st = 0; st < N; st++) {
    if (st > h) {
      assert.equal(dex.status(CELLS, st), 'unknown', `stage ${st + 1}`);
      continue;
    }
    assert.deepEqual(dex.discovery(CELLS, st), adopted);
    assert.equal(dex.status(CELLS, st), counts[st] > 0 ? 'living' : 'extinct', `stage ${st + 1}`);
  }
  assert.equal(dex.status(CELLS, gone), 'extinct');
  assert.equal(dex.status(ghost, 0), 'extinct');
  assert.ok(dex.discovery(ghost, 0).adopted);
  assert.equal(dex.discoveredCount(ghost), 1);
  assert.equal(dex.discoveredCount(SE.Life.Mammal), 0);

  advance(w, dex, 1);
  assert.equal(dex.pending.length, 0, 'nothing adopted is announced later');

  // A population two rungs above everything known: the rung between is entered first.
  let tile = -1;
  for (let i = 0; i < SE.TILE_COUNT && tile < 0; i++) {
    if (w.lifeDensity[i * SE.LIFE_COUNT + CELLS] > 0) tile = i;
  }
  w.lifeStage[tile * SE.LIFE_COUNT + CELLS] = h + 2;
  advance(w, dex, 1);
  assert.deepEqual(dex.pending.splice(0), [
    { c: CELLS, stage: h + 1, tick: w.ticks },
    { c: CELLS, stage: h + 2, tick: w.ticks },
  ]);
  assert.deepEqual(dex.discovery(CELLS, h + 1), { tick: w.ticks, years: w.absoluteYears, tile: -1, biome: -1, temp: null, o2: w.o2 });
  assert.equal(dex.status(CELLS, h + 1), 'extinct');
  const d = dex.discovery(CELLS, h + 2);
  assert.equal(d.tile, tile);
  assert.equal(d.biome, w.biome[tile]);
  assert.equal(d.temp, w.temperature[tile]);
  assert.equal(dex.status(CELLS, h + 2), 'living');
});

test('the lexicon survives saving; damaged entries are dropped', () => {
  const { w, dex } = played();
  let restore = hide(w, CELLS, 2);
  advance(w, dex, GRACE + 1);
  restore();
  advance(w, dex, 1);
  assert.equal(dex.returns(CELLS, 2), 1);
  restore = hide(w, CELLS, 1);
  advance(w, dex, 3);
  w.lifeFirstSeen[SE.Life.Grazer] = 0;
  dex.adoptLiving(w);

  const json = JSON.parse(JSON.stringify(dex.toJSON()));
  assert.equal(json.v, 1);
  assert.ok(Array.isArray(json.entries.cells) && !('mammals' in json.entries));
  const b = SE.FaunaDex.fromJSON(json);
  assert.ok(b);
  assert.deepEqual(b.toJSON(), dex.toJSON());
  for (let c = 1; c < SE.LIFE_COUNT; c++) {
    for (let st = 0; st < N; st++) {
      assert.deepEqual(b.discovery(c, st), dex.discovery(c, st));
      assert.equal(b.status(c, st), dex.status(c, st));
      assert.equal(b.returns(c, st), dex.returns(c, st));
    }
  }
  assert.equal(b.discoveredCount(), dex.discoveredCount());
  assert.equal(b.pending.length, 0);
  // The open gap carries over: both mark the hidden stage extinct on the same tick.
  for (let k = 0; k < GRACE; k++) {
    advance(w, dex, 1);
    b.step(w);
    assert.equal(b.status(CELLS, 1), dex.status(CELLS, 1), `tick ${w.ticks}`);
  }
  assert.equal(b.status(CELLS, 1), 'extinct');

  // Damaged entries.
  const bad = JSON.parse(JSON.stringify(json));
  const cells = bad.entries.cells;
  const valid = cells[3];
  cells[0] = { ...cells[0], t: -1 };
  cells[1] = { ...cells[1], i: SE.TILE_COUNT };
  cells[2] = { ...cells[2], k: 'warm' };
  while (cells.length < N) cells.push(null);
  for (let k = 0; k < 4; k++) cells.push(valid);
  bad.entries.grazers[0] = 'kaputt';
  bad.entries.unicorns = [valid];
  bad.entries.eukaryotes = 'kaputt';
  const c = SE.FaunaDex.fromJSON(bad);
  assert.ok(c);
  for (const st of [0, 1, 2]) assert.equal(c.status(CELLS, st), 'unknown');
  assert.deepEqual(c.discovery(CELLS, 3), b.discovery(CELLS, 3));
  assert.equal(c.status(SE.Life.Grazer, 0), 'unknown');
  assert.equal(c.discoveredCount(SE.Life.Eukaryote), 0);
  assert.equal(c.discoveredCount(CELLS), b.discoveredCount(CELLS) - 3);

  const good = { t: 5, y: 1e9, i: 10, b: 1, k: 12.5, o: 0.5 };
  const one = (e) => SE.FaunaDex.fromJSON({ v: 1, entries: { cells: [e] } });
  assert.deepEqual(one(good).discovery(CELLS, 0), { tick: 5, years: 1e9, tile: 10, biome: 1, temp: 12.5, o2: 0.5 });
  assert.equal(one({ ...good, k: null, o: null, a: 1, x: 1 }).status(CELLS, 0), 'extinct');
  const broken = [
    { t: 1.5 }, { t: undefined }, { y: '1' }, { y: Infinity }, { i: -2 }, { b: SE.BIOME_COUNT }, { b: -2 },
    { k: 201 }, { o: -1 }, { o: 101 }, { g: 1.5 }, { g: -1 }, { r: -1 }, { r: 0.5 },
  ];
  for (const v of broken) assert.equal(one({ ...good, ...v }).isDiscovered(CELLS, 0), false, JSON.stringify(v));

  for (const raw of [undefined, null, 'x', 7, [], { v: 2, entries: {} }, { v: 1 }, { v: 1, entries: [] }]) {
    assert.equal(SE.FaunaDex.fromJSON(raw), null, JSON.stringify(raw));
  }
  const hostile = {};
  Object.defineProperty(hostile, 'v', { get() { throw new Error('boom'); } });
  assert.equal(SE.FaunaDex.fromJSON(hostile), null);
  assert.equal(SE.FaunaDex.fromJSON({ v: 1, entries: {} }).discoveredCount(), 0);

  // copyFrom: no fresh announcements, and the copy is independent.
  restore();
  w.refreshDerived();
  const loaded = new SE.FaunaDex();
  loaded.pending.push({ c: CELLS, stage: 0, tick: 0 });
  const v = loaded.version;
  loaded.copyFrom(b);
  assert.equal(loaded.pending.length, 0);
  assert.ok(loaded.version > v);
  assert.deepEqual(loaded.toJSON(), b.toJSON());
  loaded.step(w);
  assert.equal(loaded.pending.length, 0, 'already discovered entries are not announced again');
  hide(w, CELLS);
  advance(w, loaded, 1);
  // Stage 4: never hidden above, and unlike the first cells not gone for good.
  assert.equal(loaded.status(CELLS, 3), 'extinct');
  assert.equal(b.status(CELLS, 3), 'living');
});

test('a notice that never showed survives saving and is owed once more', () => {
  const { w, dex, events } = played();
  assert.deepEqual(dex.unannounced(), events, 'nothing shown yet: every discovery is owed, in discovery order');
  const seen = events.slice(0, 3);
  dex.markAnnounced(seen);
  const owed = events.slice(3);
  assert.ok(owed.length > 0);
  assert.deepEqual(dex.unannounced(), owed);

  const json = JSON.parse(JSON.stringify(dex.toJSON()));
  const loaded = new SE.FaunaDex();
  loaded.copyFrom(SE.FaunaDex.fromJSON(json));
  assert.equal(loaded.pending.length, 0, 'loading itself announces nothing');
  assert.deepEqual(loaded.unannounced(), owed);
  loaded.markAnnounced(owed);
  assert.deepEqual(loaded.unannounced(), []);
  assert.deepEqual(SE.FaunaDex.fromJSON(JSON.parse(JSON.stringify(loaded.toJSON()))).unannounced(), []);

  // Saves from before the flag, and adopted entries, owe nothing.
  const old = JSON.parse(JSON.stringify(json));
  for (const row of Object.values(old.entries)) for (const e of row) if (e) delete e.n;
  assert.deepEqual(SE.FaunaDex.fromJSON(old).unannounced(), []);
  const adopted = new SE.FaunaDex();
  adopted.adoptLiving(w);
  assert.ok(adopted.discoveredCount() > 0);
  assert.deepEqual(adopted.unannounced(), []);
});

test('faunaTempWindow matches the window the life system applies', () => {
  const s = makeSim(7);
  const w = s.world;
  const def = SE.LIFE[CELLS];
  let i = 0;
  while (i < SE.TILE_COUNT && !(w.isWater(i) && def.suit[w.biome[i]] > 0)) i++;
  assert.ok(i < SE.TILE_COUNT);

  s.params.bio.tolerance = 0.5;
  for (let c = 1; c < SE.LIFE_COUNT; c++) assert.deepEqual(SE.faunaTempWindow(c, s.params), SE.LIFE[c].temp);
  s.params.bio.tolerance = 0;
  const [lo0, hi0] = SE.faunaTempWindow(CELLS, s.params);
  const mid = (def.temp[0] + def.temp[1]) / 2;
  assert.ok(Math.abs(hi0 - lo0 - (def.temp[1] - def.temp[0]) * 0.2) < 1e-9, 'tolerance is clamped like the simulation');
  assert.ok(Math.abs((lo0 + hi0) / 2 - mid) < 1e-9);

  for (const tolerance of [0.3, 0.85]) {
    s.params.bio.tolerance = tolerance;
    const [lo, hi] = SE.faunaTempWindow(CELLS, s.params);
    s.life.prepare(w, s.params, true);
    const at = (t) => { w.temperature[i] = t; return s.life.habitabilityProblem(w, s.params, i, CELLS); };
    assert.equal(at(lo - 0.05), 'finden es dort zu kalt', `tolerance ${tolerance}`);
    assert.equal(at(hi + 0.05), 'finden es dort zu heiß', `tolerance ${tolerance}`);
    for (const t of [lo + 0.05, hi - 0.05]) {
      const p = at(t);
      assert.ok(p !== 'finden es dort zu kalt' && p !== 'finden es dort zu heiß', `tolerance ${tolerance}, ${t} °C: ${p}`);
    }
  }
});
