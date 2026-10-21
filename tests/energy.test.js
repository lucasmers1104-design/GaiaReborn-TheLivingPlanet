'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadSE } = require('./helpers');

test('Ω tiers rise with milestones and cap the income at their max', () => {
  const SE = loadSE();
  const w = new SE.WorldState();
  const stages = SE.OMEGA_STAGES;
  assert.strictEqual(SE.omegaStage(w), 0);

  w.omega = 0;
  SE.regenOmega(w);
  assert.strictEqual(w.omega, stages[0].regen);
  w.omega = stages[0].max;
  SE.regenOmega(w);
  assert.strictEqual(w.omega, stages[0].max, 'income stops at the tier cap');

  w.evo.developed.set('landPlants', { tick: 0, years: 0 });
  assert.strictEqual(SE.omegaStage(w), 2, 'the highest milestone reached counts');
  w.sentientClass = SE.Life.None + 1; // any species: the first city
  assert.strictEqual(SE.omegaStage(w), stages.length - 1);
  assert.strictEqual(SE.omegaCap(w), SE.OMEGA_MAX);

  for (let i = 1; i < stages.length; i++) {
    assert.ok(stages[i].regen > stages[i - 1].regen && stages[i].max > stages[i - 1].max, `tier ${i} pays more than tier ${i - 1}`);
    if (stages[i].unlock !== 'city') assert.ok(SE.evoNode(stages[i].unlock), `${stages[i].unlock} is a tree step`);
  }
});
