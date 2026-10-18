'use strict';
/* Rivers freeze under ice and summit snow (river.ts classify) and come back when the tile thaws. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSim } = require('./helpers');

test('no river is drawn on ice or snow, and thawed ground gets it back', () => {
  const s = makeSim(12345);
  const { SE, world: w } = s;
  for (let t = 0; t < 120; t++) s.tick();
  SE.RiverSystem.rebuild(w);
  const frozen = (i) => w.landscape[i] === SE.Landscape.Ice || w.landscape[i] === SE.Landscape.Snow;
  let rivers = 0;
  let iced = -1;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    if (w.elevation[i] < 0) continue;
    if (w.riverLevel[i] > 0) { rivers++; assert.ok(!frozen(i), `river on frozen tile ${i}`); }
    if (iced < 0 && frozen(i) && w.riverFlow[i] >= SE.RIVER_THRESHOLD) iced = i;
  }
  assert.ok(rivers > 0, 'rivers still run on open land');
  if (iced < 0) return;
  w.landscape[iced] = SE.Landscape.Tundra;
  SE.RiverSystem.rebuild(w);
  assert.ok(w.riverLevel[iced] > 0, 'a thawed tile carries its river again');
});
