'use strict';
/*
 * Extinction for good on hard (src/hardextinction.ts): a developed group gone
 * from the planet gets a warning and a grace period, then its R.I.P.; the
 * tools refuse it, its successors stay barred, and a save keeps it. Driven
 * by hand on the derived counts, without simulating.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE, makeSim } = require('./helpers');

const SE = loadSE();
const GRACE = SE.DIFFICULTY_CONFIG.hard.extinction.graceTicks;

function sim(level) {
  const s = makeSim(12345);
  s.world.difficulty.level = level;
  // With their ancestors, or a save calls the tree contradictory.
  for (let id of ['fish', 'ferns']) {
    for (; id; id = SE.evoNode(id).parent) {
      const n = SE.evoNode(id);
      s.world.evo.developed.set(id, { tick: 0, years: 0 });
      if (n.life !== undefined) s.world.lifeCounts[n.life] = 5;
      if (n.flora !== undefined) s.world.floraCounts[n.flora] = 5;
    }
  }
  s.notes = [];
  s.step = () => SE.stepHardExtinctions(s.world, s.notes, s.evo);
  return s;
}

test('hard: a vanished class is warned about, then dies out for good', async () => {
  const s = sim('hard');
  const w = s.world;
  s.step();
  assert.equal(s.notes.length, 0, 'nothing while it lives');

  w.lifeCounts[SE.Life.Fish] = 0;
  s.step();
  assert.equal(s.notes.length, 1);
  assert.equal(s.notes[0].tone, 'warn');
  assert.match(s.notes[0].text, /Aussterbe-Warnung: Die Fische/);

  w.ticks += GRACE - 1;
  s.step();
  assert.ok(!SE.hardLifeLost(w, SE.Life.Fish), 'still within grace');
  w.ticks += 1;
  s.step();
  assert.ok(SE.hardLifeLost(w, SE.Life.Fish));
  const rip = w.evo.chronicle.find((e) => e.key === 'hard-extinct:fish');
  assert.ok(rip && rip.rip && rip.kind === 'extinction', 'R.I.P. in the chronicle');
  assert.ok(SE.stageGone(w, SE.Life.Fish, 0), 'the lexicon sees its sub-species gone');

  assert.match(s.core.check({ type: 'placeLife', life: SE.Life.Fish, x: 10, y: 10 }), /für immer ausgestorben/);
  const lineage = s.evo.conditions(w, s.params, SE.evoNode('amphibians'), false).conds.find((c) => c.kind === 'lineage');
  assert.ok(!lineage.met && /für immer/.test(lineage.detail), lineage.detail);

  // A grace period still running travels with the save too.
  w.floraCounts[SE.Flora.Ferns] = 0;
  s.step();
  assert.equal(w.difficulty.graceUntil.ferns, w.ticks + GRACE);

  const ctx = (x) => ({ world: x.world, params: x.params, geo: x.geo, history: x.history });
  const text = await SE.SaveSystem.encode(SE.SaveSystem.serialize(ctx(s)));
  const b = makeSim(1);
  SE.SaveSystem.load(await SE.SaveSystem.decode(text), ctx(b), b.life, b.flora);
  assert.equal(b.world.difficulty.level, 'hard');
  assert.ok(SE.hardLifeLost(b.world, SE.Life.Fish));
  assert.equal(b.world.difficulty.graceUntil.ferns, b.world.ticks + GRACE);
});

test('hard: settled again within grace, the group is saved', () => {
  const s = sim('hard');
  s.world.floraCounts[SE.Flora.Ferns] = 0;
  s.step();
  s.world.ticks += 10;
  s.world.floraCounts[SE.Flora.Ferns] = 3;
  s.step();
  assert.equal(s.notes[1].tone, 'ok');
  assert.equal(s.world.difficulty.graceUntil.ferns, undefined);
  s.world.ticks += GRACE;
  s.step();
  assert.equal(s.world.difficulty.floraLost, 0);
});

test('normal: nothing ever dies out for good', () => {
  const s = sim('normal');
  s.world.lifeCounts[SE.Life.Fish] = 0;
  s.step();
  s.world.ticks += GRACE * 3;
  s.step();
  assert.equal(s.notes.length, 0);
  assert.ok(!SE.hardLifeLost(s.world, SE.Life.Fish));
  assert.doesNotMatch(s.core.check({ type: 'placeLife', life: SE.Life.Fish, x: 10, y: 10 }), /für immer/);
});

test('restore drops bad values', () => {
  const s = sim('hard');
  SE.restoreDifficulty(s.world, { level: 'hard', extinction: { life: ['cells', 'fish', 'nope'], flora: 5, grace: { ferns: 1e9, nope: 3, fish: 'x' } } });
  assert.equal(s.world.difficulty.lifeLost, 1 << SE.Life.Fish);
  assert.equal(s.world.difficulty.floraLost, 0);
  assert.deepEqual(s.world.difficulty.graceUntil, { ferns: s.world.ticks + GRACE });
});
