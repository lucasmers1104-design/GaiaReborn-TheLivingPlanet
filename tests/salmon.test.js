'use strict';
/*
 * Salmon leaping upstream (src/salmonlayer.ts): how a run climbs a river and
 * times its leaps, and which rivers have runs. Drawing them (river water,
 * "Effekte reduzieren") lives in SalmonLayer.draw, which needs the effect
 * atlas and a canvas.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE, makeSim } = require('./helpers');

const SE = loadSE();
const FPS = 12;

test('a run climbs from the mouth almost to the source, leaping all the way, then the river rests', () => {
  for (const length of [80, 320, 900]) {
    for (const seed of [1, 4242, 32767]) {
      const run = SE.salmonRun(length);
      assert.ok(SE.salmonCycle(length) > run, 'a rest between runs');
      const along = [];
      for (let n = 0; ; n++) {
        const a = SE.salmonLeapAlong(n, seed, length);
        if (a < 0) break;
        along.push(a);
      }
      assert.ok(along.length >= 5, `length ${length}: ${along.length} leaps`);
      assert.ok(along[0] > length * 0.85, `length ${length}: the first leaps by the mouth (${along[0].toFixed(0)})`);
      const end = along[along.length - 1];
      assert.ok(end < length * 0.25 + 24 && end >= Math.min(16, length * 0.1), `length ${length}: the last near the source (${end.toFixed(0)})`);
      for (let k = 4; k < along.length; k++) assert.ok(along[k] < along[k - 4], 'upstream all the way');
      for (const a of along) assert.ok(a <= length && a > 0);
    }
  }
});

test('salmon leap one after another: every leap plays all its frames once, never more than two in the air', () => {
  const seed = 777;
  for (let n = 0; n < 40; n++) {
    const seen = [];
    for (let u = 0; u < 30; u += 0.005) {
      const f = SE.salmonFrame(u, n, seed, FPS);
      if (f >= 0 && seen[seen.length - 1] !== f) seen.push(f);
    }
    assert.deepEqual(seen, [...Array(10).keys()], `leap ${n}`);
    assert.ok(SE.salmonLeapAt(n + 1, seed) > SE.salmonLeapAt(n, seed), 'in order');
  }
  for (let u = 0; u < 20; u += 0.01) {
    let air = 0;
    for (let n = 0; n < 40; n++) if (SE.salmonFrame(u, n, seed, FPS) >= 0) air++;
    assert.ok(air <= 2, `${air} in the air at ${u.toFixed(2)}`);
  }
});

test('a river has runs only with bony fish, an open mouth and fish in the sea around it', () => {
  const { world } = makeSim(2024, 'today');
  SE.RiverSystem.maybeRebuild(world);
  const fish = SE.Life.Fish;
  let last = -1;
  let sea = -1;
  for (let i = 0; i < SE.TILE_COUNT && last < 0; i++) {
    const d = world.riverDown[i];
    if (world.riverLevel[i] > 0 && world.elevation[i] >= 0 && d >= 0 && world.elevation[d] < 0) {
      last = i;
      sea = d;
    }
  }
  assert.ok(last >= 0, 'a river mouth');
  const N = SE.SUBSPECIES_PER_CLASS;
  for (let s = 0; s < N; s++) world.lifeStageCounts[fish * N + s] = 0;
  world.lifeStageCounts[fish * N + SE.SALMON_STAGE] = 1;
  world.temperature[sea] = 12;
  world.lifeDensity[sea * SE.LIFE_COUNT + fish] = 0.5;
  assert.equal(SE.salmonRiver(world, last), true);

  world.temperature[sea] = 0;
  assert.equal(SE.salmonRiver(world, last), false, 'frozen mouth');
  world.temperature[sea] = 12;
  world.lifeStageCounts[fish * N + SE.SALMON_STAGE] = 0;
  assert.equal(SE.salmonRiver(world, last), false, 'no bony fish');
  world.lifeStageCounts[fish * N + SE.SALMON_STAGE] = 1;
  const x = sea % SE.GRID_W;
  const y = Math.floor(sea / SE.GRID_W);
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (y + dy >= 0 && y + dy < SE.GRID_H) world.lifeDensity[SE.idx(SE.wrapX(x + dx), y + dy) * SE.LIFE_COUNT + fish] = 0;
    }
  }
  assert.equal(SE.salmonRiver(world, last), false, 'no fish off the mouth');
});
