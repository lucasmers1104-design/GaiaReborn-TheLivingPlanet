'use strict';
// The living interface's reading of the planet (src/uimood.ts): Gaia sleeps on a lifeless planet, wakes once
// when life arises, and the vines only start with the first plants.
const test = require('node:test');
const assert = require('node:assert');
const { makeSim, loadSE } = require('./helpers');

test('Gaia sleeps until the first life, wakes once, and the vines wait for the first plants', () => {
  const s = makeSim(12345);
  const mood = new s.SE.LivingMood();
  let now = 0;
  let st = mood.update(s.world, s.history, now);
  assert.strictEqual(st.awake, false);
  assert.strictEqual(st.emotion, 'sleeping');
  assert.strictEqual(st.greenery, 0);

  const r = s.evo.develop(s.world, s.params, 'cells');
  assert.ok(r.ok, r.reason);
  for (let i = 0; i < 3; i++) s.tick();
  st = mood.update(s.world, s.history, now += 100);
  assert.strictEqual(st.awake, true);
  assert.strictEqual(st.emotion, 'waking');
  st = mood.update(s.world, s.history, now += 100);
  assert.notStrictEqual(st.emotion, 'waking', "'waking' stands for one update only");
  assert.notStrictEqual(st.emotion, 'sleeping');
  assert.strictEqual(st.greenery, 0, 'no vines before the first plants');

  // The first plant group: the vines sprout.
  s.world.evo.developed.set('marineAlgae', { tick: s.world.ticks, spontaneous: false });
  st = mood.update(s.world, s.history, now += 100);
  assert.ok(st.greenery > 0 && st.greenery < 0.2, `a sprout, not a jungle: ${st.greenery}`);
  assert.strictEqual(st.bloom, 0, 'no flowers before the flowering plants');
  assert.ok(st.vitality > 0 && st.vitality <= 1);
});

test('a living planet seen for the first time (a load) never plays the wake-up', () => {
  const s = makeSim(2024);
  assert.ok(s.evo.develop(s.world, s.params, 'cells').ok);
  for (let i = 0; i < 3; i++) s.tick();
  const st = new s.SE.LivingMood().update(s.world, s.history, 0);
  assert.strictEqual(st.awake, true);
  assert.notStrictEqual(st.emotion, 'waking');
  assert.notStrictEqual(st.emotion, 'sleeping');
});

test("a new planet or a load never inherits the old planet's crisis end or dwell timer", () => {
  const SE = loadSE();
  // Only what LivingMood reads: an awake planet in good health but for its mood.
  const world = (generation, ticks, gaiaMood) => ({
    ticks, revision: 0, hazards: { generation, list: [] },
    evo: { developed: new Set(['cells']), chronicle: [], extinct: new Set() },
    gaiaFactors: () => ({ climate: 1, life: 1, diversity: 1, clean: 1 }),
    oceanFraction: 0.7, timeScale: SE.TimeScale.Geologic, lifeCover: 0.5, vegetationCoverage: 0.2,
    dinoEra: { struck: -1, fate: 'none' }, floraCounts: new Array(64).fill(0), lifeCounts: new Array(64).fill(0),
    gaiaMood, globalTemp: 14,
  });
  const history = { series: [] };
  const mood = new SE.LivingMood();
  assert.strictEqual(mood.update(world(1, 1, 0.5), history, 0).emotion, 'idle');
  assert.strictEqual(mood.update(world(1, 2, 0.1), history, 5000).emotion, 'sad');
  assert.strictEqual(mood.update(world(2, 100, 0.1), history, 6000).emotion, 'sad', 'a load 1 s after a change shows at once, not after the dwell');
  assert.strictEqual(mood.update(world(3, 200, 0.6), history, 10000).emotion, 'idle');
  assert.strictEqual(mood.update(world(3, 201, 0.6), history, 14000).emotion, 'idle', "the old planet's crisis gives the loaded one no hope");
});
