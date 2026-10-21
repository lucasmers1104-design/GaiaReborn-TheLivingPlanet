'use strict';
/*
 * Steps that arise on their own: only when every condition but the price has
 * held for a while, never before the grace period, never for a step that is
 * not ready, and never at the cost of evolution points.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE, makeSim } = require('./helpers');

const SE = loadSE();

/** A planet with first cells, ticked until complex cells only lack their price. */
function readyEukaryotes(seed) {
  const s = makeSim(seed);
  assert.ok(s.evo.develop(s.world, s.params, 'cells').ok);
  for (let t = 0; t < 600; t++) {
    s.tick();
    s.world.evo.ep = 0; // keep the price unpaid: only nature can develop it
    s.evo.refresh(s.world, s.params, true);
    if (SE.EvolutionSystem.isReady(s.evo.statusOf('eukaryotes'))) break;
  }
  assert.ok(SE.EvolutionSystem.isReady(s.evo.statusOf('eukaryotes')), 'eukaryotes became ready');
  assert.notEqual(s.evo.statusOf('eukaryotes').state, 'available', 'but cannot be bought');
  return s;
}

test('the chance is nil during the grace period, then grows and is capped', () => {
  const c = (t, rate = 0.5) => SE.spontaneousChance(t, rate);
  assert.equal(c(0), 0);
  assert.equal(c(SE.SPONTANEOUS_GRACE - 1), 0);
  assert.ok(c(SE.SPONTANEOUS_GRACE) > 0);
  assert.ok(c(SE.SPONTANEOUS_GRACE + 300) > c(SE.SPONTANEOUS_GRACE + 100));
  assert.equal(c(1e7), c(2e7), 'capped');
  assert.ok(c(1e7) < 0.01, 'never more than a small chance per tick');
  assert.equal(c(5000, 0), 0, 'evolution rate 0 stops it');
  assert.ok(Math.abs(c(5000, 1) - 2 * c(5000, 0.5)) < 1e-12, 'scales with the evolution rate');
});

test('the roll is deterministic per seed, tick and step, and uniform', () => {
  assert.equal(SE.spontaneousRoll(7, 120, 3), SE.spontaneousRoll(7, 120, 3));
  assert.notEqual(SE.spontaneousRoll(7, 120, 3), SE.spontaneousRoll(7, 126, 3));
  assert.notEqual(SE.spontaneousRoll(7, 120, 3), SE.spontaneousRoll(8, 120, 3));
  let sum = 0;
  let lo = 1;
  let hi = 0;
  for (let t = 0; t < 20000; t++) {
    const v = SE.spontaneousRoll(42, t * 6, t % 31);
    sum += v;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  assert.ok(lo >= 0 && hi < 1);
  assert.ok(Math.abs(sum / 20000 - 0.5) < 0.02, `mean ${sum / 20000}`);
});

test('a long-ready step arises on its own, free of evolution points', () => {
  const s = readyEukaryotes(99);
  const w = s.world;
  const never = s.evo.spontaneous(w, s.params, () => 0);
  assert.equal(never, null, 'the first check only starts the clock');
  w.evo.readySince.set('eukaryotes', w.ticks - SE.SPONTANEOUS_GRACE + 10);
  assert.equal(s.evo.spontaneous(w, s.params, () => 0), null, 'still inside the grace period');
  assert.equal(s.evo.spontaneous(w, s.params, () => 1), null, 'a high roll never succeeds');

  w.evo.readySince.set('eukaryotes', w.ticks - 5000);
  w.evo.ep = 3;
  const id = s.evo.spontaneous(w, s.params, () => 0);
  assert.equal(id, 'eukaryotes');
  assert.equal(w.evo.ep, 3, 'no evolution points spent');
  assert.equal(w.evo.developed.get('eukaryotes').spontaneous, true);
  assert.ok(w.lifeCounts[SE.Life.Eukaryote] > 0, 'founders were placed');
  const entry = w.evo.chronicle.find((e) => e.key === 'evo:eukaryotes');
  assert.equal(entry.spontaneous, true);
  assert.ok(Number.isInteger(entry.at) && entry.at >= 0 && entry.at < SE.TILE_COUNT);
  assert.ok(!w.evo.readySince.has('eukaryotes'));
});

test('steps that are not ready never arise, and readiness lapses when conditions break', () => {
  const s = readyEukaryotes(7);
  const w = s.world;
  w.evo.readySince.set('landPlants', w.ticks - 1e6); // locked: no algae yet
  w.evo.readySince.set('eukaryotes', w.ticks - 5000);
  w.oceanO2 = 0; // complex cells need dissolved oxygen
  s.evo.refresh(s.world, s.params, true);
  assert.equal(s.evo.spontaneous(w, s.params, () => 0), null);
  assert.ok(!w.evo.isDeveloped('eukaryotes'));
  assert.ok(!w.evo.readySince.has('eukaryotes'), 'the clock is reset');
  assert.ok(!w.evo.readySince.has('landPlants'));
});

test('the per-tick step runs the check (wiring)', () => {
  const s = readyEukaryotes(4242);
  const w = s.world;
  w.evo.readySince.set('eukaryotes', w.ticks - 5000);
  const roll = SE.spontaneousRoll;
  SE.spontaneousRoll = () => 0;
  try {
    for (let t = 0; t < SE.SPONTANEOUS_EVERY && !w.evo.isDeveloped('eukaryotes'); t++) {
      w.evo.ep = 0;
      s.tick();
    }
  } finally {
    SE.spontaneousRoll = roll;
  }
  assert.ok(w.evo.isDeveloped('eukaryotes'));
  assert.ok(s.evo.pending.some((e) => e.key === 'evo:eukaryotes' && e.spontaneous));
});

test('readiness and the spontaneous mark survive saving and loading', async () => {
  const s = readyEukaryotes(12);
  const w = s.world;
  w.evo.readySince.set('eukaryotes', w.ticks - 5000);
  s.evo.spontaneous(w, s.params, () => 0);
  // Something else ready, still waiting.
  w.evo.readySince.set('marineAlgae', w.ticks - 77);
  const doc = SE.SaveSystem.serialize({ world: w, params: s.params, geo: s.geo, history: s.history });
  const text = await SE.SaveSystem.encode(doc);
  const b = makeSim(1);
  SE.SaveSystem.load(await SE.SaveSystem.decode(text), { world: b.world, params: b.params, geo: b.geo, history: b.history }, b.life, b.flora);
  assert.equal(b.world.evo.developed.get('eukaryotes').spontaneous, true);
  assert.equal(b.world.evo.chronicle.find((e) => e.key === 'evo:eukaryotes').spontaneous, true);
  assert.equal(b.world.evo.readySince.get('marineAlgae'), w.ticks - 77);
});
