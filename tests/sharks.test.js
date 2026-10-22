'use strict';
/*
 * Circling shark fins (src/sharklayer.ts): the frames of one sighting. Where
 * circles appear lives in SharkLayer.draw, which needs the effect atlas and a canvas.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE } = require('./helpers');

const SE = loadSE();
const FPS = 10;

test('a sighting rises, laps the circle in order, sinks and ends', () => {
  const seen = [];
  for (let u = -1; u < 30; u += 0.01) {
    const f = SE.sharkFrame(u, FPS);
    if (seen[seen.length - 1] !== f) seen.push(f);
  }
  const lap = [...Array(24).keys()].map((k) => k + 4);
  assert.deepEqual(seen, [-1, 0, 1, 2, 3, ...lap, ...lap, ...lap, ...lap, 28, 29, 30, 31, -1]);
});
