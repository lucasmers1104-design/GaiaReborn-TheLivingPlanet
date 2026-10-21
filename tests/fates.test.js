'use strict';
/*
 * Sub-species and plant groups that die out for good (src/stagefates.ts,
 * src/lycopsids.ts): a successor that has spread ends the older one, whose
 * populations pass to it; founders start past it; the lexicon calls it
 * extinct at once; plant groups end once their rivals lead the land; the
 * save keeps all of it, and an old save learns it without news.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE, makeSim } = require('./helpers');

const SE = loadSE();
const F = SE.Flora;
const P = SE.Life.Prokaryote;
const L = SE.LIFE_COUNT;
const N = SE.SUBSPECIES_PER_CLASS;

/** Cells on the first water tiles, one population per entry of `stages`. */
function cells(w, stages) {
  let k = 0;
  for (let i = 0; i < SE.TILE_COUNT && k < stages.length; i++) {
    if (!w.isWater(i) || w.lifeDensity[i * L + P] > 0) continue;
    w.lifeDensity[i * L + P] = 0.5;
    w.lifeStage[i * L + P] = stages[k++];
  }
  w.refreshDerived();
}

test('the first cells die out once the archaea hold enough tiles, and hand their tiles on', () => {
  const w = makeSim(1).world;
  cells(w, [...Array(40).fill(0), ...Array(SE.STAGE_SUCCESSOR_TILES - 1).fill(1)]);
  assert.deepEqual(SE.stepFates(w), [], 'one tile short: nothing ends');
  assert.equal(w.stageEnded[P], 0);

  cells(w, [1]);
  const out = SE.stepFates(w);
  assert.equal(out.length, 1);
  assert.equal(out[0].title, 'Urzellen ausgestorben');
  assert.match(out[0].text, /Abgelöst durch Archaeen/);
  assert.equal(out[0].rip, true);
  assert.equal(out[0].stage, 0);
  assert.equal(out[0].nodeId, 'cells');
  assert.ok(SE.stageEnded(w, P, 0) && SE.stageGone(w, P, 0));
  assert.equal(w.lifeStageCounts[P * N], 0, 'no first cells are left');
  assert.equal(w.lifeStageCounts[P * N + 1], 40 + SE.STAGE_SUCCESSOR_TILES, 'their tiles went to the archaea');
  assert.deepEqual(SE.stepFates(w), [], 'said once');
});

test('founders start past what is gone, and the lexicon calls it gone at once', () => {
  const s = makeSim(1);
  const w = s.world;
  const dex = new SE.FaunaDex();
  cells(w, [0, 0, 0, ...Array(SE.STAGE_SUCCESSOR_TILES).fill(1)]);
  dex.step(w);
  assert.ok(dex.isDiscovered(P, 0) && dex.status(P, 0) !== 'extinct');
  SE.stepFates(w);
  dex.step(w);
  assert.equal(dex.status(P, 0), 'extinct', 'no grace period for what is gone for good');
  assert.deepEqual(SE.faunaStatus(dex, P, 0, w), { text: 'für immer ausgestorben', cls: 'is-extinct is-gone' });
  assert.match(SE.faunaOriginRule(w, s.params, dex, P, 0, true), /durch „Archaeen“ abgelöst/);

  assert.equal(SE.firstStage(w, P), 1);
  const i = Array.from({ length: SE.TILE_COUNT }, (_, k) => k).find((k) => w.isWater(k) && w.lifeDensity[k * L + P] === 0);
  assert.ok(SE.LifeSystem.seed(w, P, i % SE.GRID_W, Math.floor(i / SE.GRID_W)));
  assert.equal(w.lifeStage[i * L + P], 1, 'a placed population starts at the archaea');
});

test('the first trees die out once seed plants lead a tenth of the land, not before seed plants arose', () => {
  const s = makeSim(11);
  const w = s.world;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    w.elevation[i] = 0.2;
    w.floraTop[i] = i < SE.TILE_COUNT * 0.12 ? F.SeedPlants : F.FirstTrees;
    w.flora[i] = (1 << F.FirstTrees) | (1 << F.SeedPlants);
  }
  const present = (1 << F.FirstTrees) | (1 << F.SeedPlants);
  SE.updateFloraEras(w, present);
  assert.equal(SE.floraGone(w, F.FirstTrees), false, 'their daughters have yet to arise');
  assert.equal(SE.floraCompetition(w, F.FirstTrees, 0), 1, 'nor are they pressed before');

  for (let n = SE.evoNode('seedPlants'); n; n = n.parent ? SE.evoNode(n.parent) : null) w.evo.developed.set(n.id, { tick: 1, years: 1 });
  assert.ok(SE.floraCompetition(w, F.FirstTrees, 0) < 1, 'seed plants outgrow them where they meet');
  SE.updateFloraEras(w, present);
  assert.equal(SE.floraGone(w, F.FirstTrees), true);
  assert.equal(SE.floraCompetition(w, F.FirstTrees, 0), 0);
  assert.match(s.flora.problem(w, F.FirstTrees, 0), /für immer ausgestorben – abgelöst durch Samenpflanzen/);

  const note = SE.lycopsidMilestones(w).find((e) => e.key === 'flora-end:firstTrees');
  assert.ok(note && note.rip && note.kind === 'extinction' && note.nodeId === 'firstTrees');
  assert.equal(note.title, 'Urbäume ausgestorben');
});

const ctx = (s) => ({ world: s.world, params: s.params, geo: s.geo, history: s.history });

test('the save keeps what died out; an old save learns it on its first tick, without news', () => {
  const a = makeSim(3);
  a.world.stageEnded[P] = 0b1;
  a.world.stageEnded[SE.Life.Cetacean] = 0b1111;
  a.world.floraEnded |= 1 << F.FirstTrees;
  const doc = SE.SaveSystem.serialize(ctx(a));
  const b = makeSim(1);
  SE.SaveSystem.load(JSON.parse(JSON.stringify(doc)), ctx(b), b.life, b.flora);
  assert.deepEqual(Array.from(b.world.stageEnded), Array.from(a.world.stageEnded));
  assert.equal(SE.floraGone(b.world, F.FirstTrees), true);
  assert.equal(b.world.fatesQuiet, false);

  const old = JSON.parse(JSON.stringify(doc));
  delete old.fates;
  const c = makeSim(1);
  SE.SaveSystem.load(old, ctx(c), c.life, c.flora);
  assert.equal(c.world.stageEnded[P], 0);
  assert.equal(c.world.fatesQuiet, true);
  cells(c.world, [0, ...Array(SE.STAGE_SUCCESSOR_TILES).fill(1)]);
  c.evo.step(c.world, c.params);
  const e = c.world.evo.chronicle.find((x) => x.key === 'stage-end:cells:0');
  assert.ok(e, 'the end is in the chronicle');
  assert.ok(c.world.evo.reported.has(e.key), 'but it is history, not news');
  assert.equal(c.world.fatesQuiet, false);
});
