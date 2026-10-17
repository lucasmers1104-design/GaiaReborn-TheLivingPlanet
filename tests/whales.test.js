'use strict';
/*
 * Pixel whales (src/whalelayer.ts): which Cetacean stages become sprites and
 * the boil/surface/blow/dive/footprint cycle. The "Effekte reduzieren" still
 * pose and the spacing between whales live in WhaleLayer.draw (needs the
 * effect atlas and a canvas), so they are not covered here.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE } = require('./helpers');

const SE = loadSE();

test('only baleen, sperm and great whales become pixel whales, never specialists', () => {
  assert.equal(SE.whaleSprite(4, false), 'whale_baleen');
  assert.equal(SE.whaleSprite(5, false), 'whale_sperm');
  assert.equal(SE.whaleSprite(7, false), 'whale_great');
  for (const s of [0, 1, 2, 3, 6]) assert.equal(SE.whaleSprite(s, false), null, `stage ${s}`);
  for (const s of [4, 5, 7]) assert.equal(SE.whaleSprite(s, true), null, `specialist stage ${s}`);
});

test('a whale boils up, surfaces, blows once or twice, dives, leaves a footprint and stays under', () => {
  const dt = 0.01;
  const seen = new Set();
  for (const period of [14, 19, 24]) {
    const cycles = 60;
    const blows = new Array(cycles).fill(0);
    let prev = null;
    let prevCycle = -1;
    for (let t = 0; t < cycles * period; t += dt) {
      const cycle = Math.floor(t / period);
      const u = t - cycle * period;
      const ph = SE.whalePhase(t, period);
      assert.ok(Number.isInteger(ph.frame) && ph.frame >= 0 && ph.frame <= 7, `frame ${ph.frame} at ${t}`);
      assert.ok(ph.path >= 0 && ph.path <= 1, `path ${ph.path}`);
      // Boil 0.5 s, rise 0.6 s + swim 7.5 s + dive 1.3 s in sight, footprint 1.05 s, then nothing.
      if (u < 0.45) assert.ok(!ph.visible && ph.ring === 0, `boil at u=${u.toFixed(2)}`);
      if (u > 0.55 && u < 9.75) assert.equal(ph.visible, true, `visible at u=${u.toFixed(2)}`);
      if (u > 9.95 && u < 10.9) assert.ok(!ph.visible && ph.ring > 0 && ph.ringAtFluke, `footprint at u=${u.toFixed(2)}`);
      if (u > 11) assert.ok(!ph.visible && ph.ring < 0, `under at u=${u.toFixed(2)}`);
      if (!ph.visible) assert.ok(ph.blowAge < 0, 'no blow while submerged');
      if (ph.blowAge >= 0) {
        assert.ok(ph.blowAge < SE.BLOW_LIFE, `blowAge ${ph.blowAge}`);
        assert.ok(SE.blowFrame(ph.blowAge) >= 0, 'a blow plays all its frames');
        assert.ok(ph.frame === 2 || ph.frame === 3, 'blows only while swimming');
        if (!prev || prev.blowAge < 0 || cycle !== prevCycle) blows[cycle]++;
      }
      // Nothing pops: the whale moves on smoothly and only ever shows the next frame of its cycle.
      if (prev && cycle === prevCycle) {
        assert.ok(ph.path >= prev.path && ph.path - prev.path < 0.01, `path jumps at u=${u.toFixed(2)}`);
        if (prev.visible && ph.visible && ph.frame < prev.frame) assert.ok(prev.frame === 3 && ph.frame === 2, 'only the swim frames alternate');
      }
      prev = ph;
      prevCycle = cycle;
    }
    for (let c = 0; c < cycles; c++) {
      assert.ok(blows[c] === 1 || blows[c] === 2, `period ${period} cycle ${c}: ${blows[c]} blows`);
      seen.add(blows[c]);
    }
  }
  assert.deepEqual([...seen].sort(), [1, 2], 'some cycles blow once, some twice');
  assert.equal(SE.blowFrame(0), 0);
  assert.equal(SE.blowFrame(SE.BLOW_LIFE), -1);
});
