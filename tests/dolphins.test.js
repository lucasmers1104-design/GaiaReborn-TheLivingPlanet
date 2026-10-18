'use strict';
/*
 * Leaping dolphin pods (src/dolphinlayer.ts): the timing of a round. Where
 * pods appear (warm sea, spacing, "Effekte reduzieren") lives in
 * DolphinLayer.draw/claims, which need the effect atlas and a canvas.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE } = require('./helpers');

const SE = loadSE();
const FPS = 12;

test('every leap of a round plays all its frames once, in order, and ends before the shortest round', () => {
  const active = SE.dolphinActive(FPS);
  assert.ok(active < 6, `active ${active} s`);
  for (const [round, seed] of [[0, 1], [7, 4242], [123, 999999]]) {
    for (let k = 0; k < 5; k++) {
      for (let leap = 0; leap < 2; leap++) {
        const seen = [];
        for (let u = 0; u < 10; u += 0.005) {
          const f = SE.dolphinFrame(u, k, leap, round, seed, FPS);
          if (u >= active) assert.equal(f, -1, `member ${k} leap ${leap} after the round at ${u.toFixed(3)}`);
          if (f >= 0 && seen[seen.length - 1] !== f) seen.push(f);
        }
        assert.deepEqual(seen, [...Array(16).keys()], `member ${k} leap ${leap} round ${round}`);
      }
    }
  }
});
