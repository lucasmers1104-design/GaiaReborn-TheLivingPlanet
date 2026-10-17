'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE, makeSim } = require('./helpers');
const SE = loadSE();
const ctx = (s, fauna) => ({ world: s.world, params: s.params, geo: s.geo, history: s.history, fauna });

test('cyanobacteria remain an existing subspecies of the first cells', () => {
  assert.equal(SE.evoNode('eukaryotes').parent, 'cells');
  assert.equal(SE.SUBSPECIES_PER_CLASS, 8);
  assert.equal(SE.SPECIES[SE.Life.Prokaryote].stages[SE.CYANOBACTERIA_STAGE].name, 'Cyanobakterien');
  assert.ok(!SE.EVO_BY_ID.has('cyanobacteria'));
  assert.equal(SE.FaunaDex.TOTAL, 136, 'no existing lexicon entries are lost');
});

test('only cyanobacteria produce microbial oxygen; complex cells consume it', () => {
  for (const [c, stage] of [[SE.Life.Prokaryote, 0], [SE.Life.Prokaryote, SE.CYANOBACTERIA_STAGE], [SE.Life.Prokaryote, 5], [SE.Life.Eukaryote, 0]]) {
    const s = makeSim(12345);
    const w = s.world;
    w.oceanO2 = 100;
    s.params.bio.mutationRate = 0;
    for (let i = 0; i < SE.TILE_COUNT; i++) if (w.isWater(i)) {
      w.lifeDensity[i * SE.LIFE_COUNT + c] = 0.4;
      w.lifeStage[i * SE.LIFE_COUNT + c] = stage;
    }
    w.refreshDerived();
    s.life.stepLife(w, s.params, s.atmo);
    if (c === SE.Life.Prokaryote && stage !== SE.CYANOBACTERIA_STAGE) assert.equal(s.atmo.oceanO2Delta, 0);
    if (c === SE.Life.Eukaryote) assert.ok(s.atmo.oceanO2Delta < 0);
    if (c === SE.Life.Prokaryote && stage === SE.CYANOBACTERIA_STAGE) assert.ok(s.atmo.oceanO2Delta > 0);
    assert.equal(s.atmo.o2Delta, 0, 'marine production enters the sea first');
  }
});

test('cyanobacterial thrombolites keep producing oxygen; sulphur and iron bacteria do not', () => {
  for (const [stage, oxygenic] of [[5, false], [6, false], [7, true]]) {
    const s = makeSim(12345);
    const w = s.world;
    w.oceanO2 = 100;
    s.params.bio.mutationRate = 0;
    for (let i = 0; i < SE.TILE_COUNT; i++) if (w.isWater(i)) {
      w.lifeDensity[i * SE.LIFE_COUNT + SE.Life.Prokaryote] = 0.4;
      w.lifeStage[i * SE.LIFE_COUNT + SE.Life.Prokaryote] = stage;
    }
    w.refreshDerived();
    s.life.stepLife(w, s.params, s.atmo);
    assert.equal(s.atmo.oceanO2Delta > 0, oxygenic, SE.SPECIES[SE.Life.Prokaryote].stages[stage].name);
  }
});

test('water oxygen unlocks complex cells even with oxygen-free air, and is rechecked on action', () => {
  const s = makeSim(4242);
  const w = s.world;
  assert.ok(s.evo.develop(w, s.params, 'cells').ok);
  w.evo.ep = 100;
  w.o2 = 0;
  w.oceanO2 = SE.EUKARYOTE_OCEAN_O2_FULL;
  s.life.prepare(w, s.params, true);
  s.evo.refresh(w, s.params, true);
  const st = s.evo.statusOf('eukaryotes');
  assert.equal(st.state, 'available');
  assert.ok(st.conds.some((c) => c.kind === 'ocean' && c.met));
  assert.ok(!st.conds.some((c) => c.kind === 'atmosphere'));
  assert.equal(SE.nodeO2(SE.evoNode('eukaryotes')), 0);
  assert.equal(SE.nodeOceanO2(SE.evoNode('eukaryotes')), SE.EUKARYOTE_OCEAN_O2_FOUND);

  w.oceanO2 = 0;
  const ep = w.evo.ep;
  assert.equal(s.evo.develop(w, s.params, 'eukaryotes').ok, false);
  assert.equal(w.evo.ep, ep, 'failed development never charges');
  w.oceanO2 = SE.EUKARYOTE_OCEAN_O2_FULL;
  assert.ok(s.evo.develop(w, s.params, 'eukaryotes').ok);
  s.life.prepare(w, s.params, true);
  const i = w.evo.chronicle.find((e) => e.nodeId === 'eukaryotes').at;
  assert.ok(s.life.capacity(w, i, SE.Life.Eukaryote) > 0, 'founders can live in oxygen-free air');
});

test('aquatic breathers depend on water, while whales still breathe air', () => {
  const s = makeSim(99);
  const w = s.world;
  const fish = SE.lifeOxygen(SE.Life.Fish);
  assert.equal(fish.medium, 'water');
  assert.equal(SE.lifeOxygen(SE.Life.Cetacean).medium, 'air');
  w.o2 = 25;
  w.oceanO2 = 0;
  s.life.prepare(w, s.params, true);
  const i = w.biome.findIndex((b) => b === SE.Biome.Coast);
  assert.equal(s.life.capacity(w, i, SE.Life.Fish), 0);
  assert.match(s.life.habitabilityProblem(w, s.params, i, SE.Life.Fish), /Sauerstoffsättigung im Meer/);
  assert.equal(SE.oxygenLevel(w, 'air'), 25);
  assert.equal(SE.oxygenLevel(w, 'water'), 0);
});

test('existing saves retain the eight microbial subspecies and their discoveries', () => {
  const a = makeSim(2024);
  const w = a.world;
  assert.ok(a.evo.develop(w, a.params, 'cells').ok);
  const sites = [];
  for (let i = 0; i < SE.TILE_COUNT && sites.length < 3; i++) if (w.isWater(i)) sites.push(i);
  w.lifeDensity.fill(0);
  for (let k = 0; k < sites.length; k++) {
    const li = sites[k] * SE.LIFE_COUNT + SE.Life.Prokaryote;
    w.lifeDensity[li] = 0.6;
    w.lifeStage[li] = [4, 5, 7][k];
  }
  w.oceanO2 = 42;
  w.o2 = 8;
  const doc = JSON.parse(JSON.stringify(SE.SaveSystem.serialize(ctx(a))));
  doc.version = 8;
  const entry = (t) => ({ t, y: 1e9, i: sites[0], b: 0, k: 20, o: 1, n: 1 });
  doc.fauna = { v: 1, entries: { cells: Array.from({ length: 8 }, (_, k) => entry(k + 1)) } };
  const original = JSON.stringify(doc);
  const b = makeSim(1);
  const dex = new SE.FaunaDex();
  SE.SaveSystem.load(doc, ctx(b, dex), b.life, b.flora);
  assert.equal(JSON.stringify(doc), original, 'loading never mutates the old save');
  assert.ok(!b.world.evo.isDeveloped('cyanobacteria'));
  assert.equal(b.world.oceanO2, 42);
  assert.equal(b.world.o2, 8);
  for (let k = 0; k < sites.length; k++) {
    const base = sites[k] * SE.LIFE_COUNT;
    assert.ok(Math.abs(b.world.lifeDensity[base + SE.Life.Prokaryote] - 0.6) < 0.0001);
    assert.equal(b.world.lifeStage[base + SE.Life.Prokaryote], [4, 5, 7][k]);
  }
  assert.equal(dex.discoveredCount(), 8);
  assert.equal(dex.discovery(SE.Life.Prokaryote, 4).tick, 5);
  assert.equal(dex.discovery(SE.Life.Prokaryote, 5).tick, 6);
  assert.equal(dex.discovery(SE.Life.Prokaryote, 7).tick, 8);
});

test('oxygen production starts with the actual discovery and stops without living cyanobacteria', () => {
  const s = makeSim(12345);
  const w = s.world;
  const dex = new SE.FaunaDex();
  assert.ok(s.evo.develop(w, s.params, 'cells').ok);
  let first = -1;
  for (let t = 0; t < 350; t++) {
    s.tick();
    dex.step(w);
    if (dex.isDiscovered(SE.Life.Prokaryote, SE.CYANOBACTERIA_STAGE)) { first = t; break; }
    assert.equal(w.oceanO2, 0);
    assert.equal(w.oceanIron, 1);
    assert.equal(w.o2, 0);
  }
  assert.ok(first >= 0, 'cyanobacteria arise without a separate tree purchase');
  assert.ok(w.oceanIron < 1, 'their first production already oxidises iron');
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    const li = i * SE.LIFE_COUNT + SE.Life.Prokaryote;
    if (w.lifeStage[li] === SE.CYANOBACTERIA_STAGE) w.lifeStage[li] = 0;
  }
  s.params.bio.mutationRate = 0;
  s.atmo.oceanO2Delta = 0;
  s.life.stepLife(w, s.params, s.atmo);
  assert.equal(s.atmo.oceanO2Delta, 0, 'the persistent discovery is not a permanent oxygen source');
  assert.ok(dex.isDiscovered(SE.Life.Prokaryote, SE.CYANOBACTERIA_STAGE));
});
