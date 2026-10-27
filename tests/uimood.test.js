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

test("the status bar's clouds: icon and text always lie on cloud, and a panel keeps its cloud", () => {
  const SE = loadSE();
  // [w, h, box]: measured panels at 1080p (h 29), 1440p (h 19) and 125 % laptops (h 37), the gear, extremes.
  const cases = [
    [54, 29, [8, 10, 46, 22]], [151, 29, [8, 8, 143, 24]], [26, 29, [8, 11, 18, 21]], [87, 29, [8, 7, 27, 24]],
    [51, 19, [8, 3, 43, 15]], [131, 19, [8, 2, 123, 16]], [26, 19, [8, 4, 18, 14]],
    [61, 37, [8, 15, 53, 28]], [182, 37, [8, 12, 174, 32]], [27, 37, [8, 16, 19, 27]],
    [20, 18, [6, 3, 14, 15]], [280, 46, [8, 9, 272, 40]], [280, 46, [130, 20, 150, 26]],
  ];
  for (const [w, h, box] of cases) {
    for (let seed = 0; seed < 8; seed++) {
      const t = SE.cloudTones(w, h, seed, box);
      assert.deepStrictEqual(SE.cloudTones(w, h, seed, box), t, 'the same panel, the same cloud');
      for (let y = box[1]; y < box[3]; y++) {
        for (let x = box[0]; x < box[2]; x++) {
          const v = t[y * w + x];
          // Behind icon and text only the light body tones (5..7): dark ink must read there.
          assert.ok(v >= 5 && v < SE.CLOUD_TONES, `${w}×${h} seed ${seed}: content pixel ${x},${y} is tone ${v}`);
        }
      }
    }
  }
});
