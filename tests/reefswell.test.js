'use strict';
/*
 * The swell over the reefs (src/reefswell.ts): the colour a crest lifts each
 * composed sea pixel to — only palette colours, always lighter.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE } = require('./helpers');

const SE = loadSE();
const M = SE.TERRAIN_MANIFEST;
// The lift reads only the palette and ramps: blank atlas pixels will do.
const lift = SE.reefSwellLift(SE.LandArt.fromIndices(new Uint8Array(M.width * M.height)));
const luma = (i) => 0.299 * M.palette[i][0] + 0.587 * M.palette[i][1] + 0.114 * M.palette[i][2];

test('a crest lifts water a step up its ramp, its lightest step not at all', () => {
  for (const ramp of ['water', 'waterWarm', 'shelf']) {
    const r = M.ramps[ramp];
    r.forEach((i, k) => assert.equal(lift[i], k + 1 < r.length ? r[k + 1] : 0, `${ramp}[${k}]`));
  }
});

test('a crest lifts corals and reef sand to a lighter palette colour', () => {
  for (const i of [...M.ramps.coral, ...M.ramps.reefUnder]) {
    const j = lift[i];
    assert.ok(j > 0 && j < M.palette.length && j !== M.maskIndex, `index ${i} lifts to ${j}`);
    assert.ok(luma(j) > luma(i), `index ${i} (${M.palette[i]}) lifts to ${j} (${M.palette[j]}), not lighter`);
  }
});
