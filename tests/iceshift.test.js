'use strict';
/*
 * Sea ice freezing and thawing on screen (src/landice.ts, src/landfade.ts):
 * flips are found, a chunk's dissolve ends exactly on its new picture and on
 * the way shows nothing but the old picture, the new one and thin ice, a
 * calving tile keeps its ice until its slab breaks, and a jump in time
 * switches at once.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const { makeSim } = require('./helpers');

const s = makeSim(2024, 'today');
const SE = s.SE;
const M = SE.TERRAIN_MANIFEST;
const SIDE = 16 * 16 + 4;

function art() {
  const buf = Buffer.from(SE.TERRAIN_ATLAS_PNG.slice(SE.TERRAIN_ATLAS_PNG.indexOf(',') + 1), 'base64');
  const idat = [];
  for (let p = 8; p < buf.length;) {
    const len = buf.readUInt32BE(p);
    if (buf.toString('ascii', p + 4, p + 8) === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(M.width * M.height);
  for (let y = 0; y < M.height; y++) px.set(raw.subarray(y * (M.width + 1) + 1, (y + 1) * (M.width + 1)), y * M.width);
  return SE.LandArt.fromIndices(px);
}
const ART = art();
const composer = new SE.LandComposer(ART);
const field = new SE.TerrainField();
const ICE = SE.LandTables.shared().seaIceKey;
field.refresh(s.world);

/** A pack ice tile with ice to the north and open sea to the south, inside its chunk. */
function edgeTile() {
  const W = SE.GRID_W;
  for (let y = 4; y < SE.GRID_H - 4; y++) {
    for (let x = 0; x < W; x++) {
      if (x % 16 < 3 || x % 16 > 12 || y % 16 < 3 || y % 16 > 12) continue;
      const i = y * W + x;
      if (field.key[i] === ICE && field.key[i - W] === ICE && field.key[i + W] === 0 && field.key[i + 2 * W] === 0 &&
        s.world.elevation[i + W] < 0) return i;
    }
  }
  return -1;
}

function chunkOf(i) {
  const cx = Math.floor((i % SE.GRID_W) / 16);
  const cy = Math.floor(i / SE.GRID_W / 16);
  const out = new Uint32Array(SIDE * SIDE);
  composer.compose(field, cx * 16, cy * 16, 16, 16, 2, out, null);
  return { words: out, ox: cx * 256 - 2, oy: cy * 256 - 2 };
}

/** The colours a pixel may show while it goes from `a` to `b`: either end, their thin ice, the dark film. */
function allowed() {
  const ramp = M.ramps.ice;
  const thin = new Map(ramp.map((ix, k) => [ART.rgba[ix], ART.rgba[ramp[Math.max(0, k - 2)]]]));
  const deep = ART.rgba[ramp[0]];
  return (a, b, v) => v === a || v === b || v === deep || v === thin.get(a) || v === thin.get(b);
}

test('a thawing tile is found and its chunk dissolves into exactly its new picture', () => {
  const i = edgeTile();
  assert.ok(i >= 0, 'the planet has a pack ice edge');
  const shift = new SE.IceShift();
  const flips = [];
  shift.listener = { flips: (t, f) => flips.push([t, f]), reset: () => flips.push('reset') };
  shift.update(s.world, field, 0);
  assert.deepEqual(flips, ['reset'], 'the first refresh only takes note');

  const before = chunkOf(i);
  const keep = s.world.temperature[i];
  s.world.temperature[i] = 5;
  field.refresh(s.world);
  shift.update(s.world, field, 1000);
  const after = chunkOf(i);
  s.world.temperature[i] = keep;
  field.refresh(s.world);
  assert.deepEqual(flips[1], [[i], []], 'the thaw is reported');

  for (const hold of [false, true]) {
    const breakAt = 3000;
    const tx = (i % SE.GRID_W) * 16;
    const ty = Math.floor(i / SE.GRID_W) * 16;
    if (hold) shift.hold(i, breakAt, [tx + 1, ty + 9, tx + 14, ty + 15]);
    const fade = new SE.LandFade({ data: new Uint8ClampedArray(before.words.slice().buffer) }, SIDE, before.ox, before.oy);
    const shown = new Uint32Array(fade.image.data.buffer);
    fade.retarget(after.words, 1000, shift.timing(ART, shown, after.words, SIDE, before.ox, before.oy));
    const ok = allowed();
    let mid = false;
    for (let t = 1000; t <= 1000 + 3 * shift.span + 2000; t += 50) {
      fade.step(t);
      let changed = 0;
      for (let p = 0; p < shown.length; p++) {
        assert.ok(ok(before.words[p], after.words[p], shown[p]), `pixel ${p} shows a colour from neither picture at ${t} ms`);
        if (shown[p] !== before.words[p]) changed++;
      }
      if (hold && t < breakAt) {
        // Until the break the tile and its neighbours' share of the notch keep their picture.
        for (let y = ty - 16; y < ty + 32; y++) for (let x = tx - 16; x < tx + 32; x++) {
          const p = (y - before.oy) * SIDE + (x - before.ox);
          assert.equal(shown[p], before.words[p], `held pixel (${x}, ${y}) changed at ${t} ms, before the break`);
        }
      }
      if (changed > 0 && !fade.settled) mid = true;
    }
    assert.ok(mid, 'the change is spread over time, not one jump');
    assert.ok(fade.settled, 'the dissolve ends');
    assert.deepEqual(shown, after.words, 'it ends exactly on the new picture');
    shift.release(i);
  }
});

test('a jump in time switches at once', () => {
  const shift = new SE.IceShift();
  const calls = [];
  shift.listener = { flips: () => calls.push('flips'), reset: () => calls.push('reset') };
  shift.update(s.world, field, 0);
  for (let k = 0; k < 40; k++) s.tick();
  field.refresh(s.world);
  shift.update(s.world, field, 500);
  assert.deepEqual(calls, ['reset', 'reset'], 'forty ticks at once count as a new planet');
});
