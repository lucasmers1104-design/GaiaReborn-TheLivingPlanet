'use strict';
/*
 * TerrainField.refresh reads only the tiles whose inputs changed since the
 * last refresh. Whatever it skips, the field must equal a full read of the
 * same world in every field — above all `sig`, which picks the chunks the
 * map composes again.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE, makeSim } = require('./helpers');

const SE = loadSE();
/** Bookkeeping of the incremental refresh and query scratch, not part of the field. */
const SKIP = new Set(['world', 'planet', 'ticks', 'seen', 'partIn', 'reread', 'resign', 'signed', 'downSeen', 'flowSeen', 'ridgeSeen',
  'lastRead', 'ridgesAt', 'stamp', 'stampN', 'queue', 'near']);

/** Path and values of the first difference between a and b, or null. */
function firstDiff(a, b, path) {
  if (a === b) return null;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return Number.isNaN(a) && Number.isNaN(b) ? null : `${path}: ${a} ≠ ${b}`;
  }
  if (ArrayBuffer.isView(a) || Array.isArray(a)) {
    if (a.length !== b.length) return `${path}.length: ${a.length} ≠ ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const d = firstDiff(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (SKIP.has(k)) continue;
    const d = firstDiff(a[k], b[k], `${path}.${k}`);
    if (d) return d;
  }
  return null;
}

/** Tick `s` for `ticks`, refreshing `f` incrementally on every tick and checking it against a fresh field every `every`. */
function follow(s, f, ticks, every, step = () => {}) {
  let incremental = 0;
  let checks = 0;
  for (let t = 1; t <= ticks; t++) {
    step(t);
    f.refresh(s.world);
    if (f.lastRead >= 0) incremental++;
    if (t % every !== 0) continue;
    const full = new SE.TerrainField();
    full.refresh(s.world);
    const d = firstDiff(f, full, 'field');
    assert.equal(d, null, `tick ${s.world.ticks}: ${d}`);
    checks++;
  }
  return { incremental, checks };
}

test('seed 12345 with evolution: the incremental field equals a full read', () => {
  const s = makeSim(12345);
  const f = new SE.TerrainField();
  f.refresh(s.world);
  const hz = new SE.HazardSystem();
  const { incremental, checks } = follow(s, f, 300, 10, (t) => {
    if (t % 5 === 0) s.play(1);
    else s.tick();
    // A meteor halfway: scars, basalt, a crater's elevation.
    if (t === 150) {
      const land = s.world.elevation.findIndex((e, i) => e > 0.05 && i > SE.TILE_COUNT / 3);
      assert.ok(hz.start(s.world, SE.EventKind.Meteor, land % SE.GRID_W, Math.floor(land / SE.GRID_W), 'player'));
    }
    hz.step(s.world);
  });
  assert.equal(checks, 30);
  assert.ok(incremental > 200, `most refreshes stay incremental (${incremental} of 300)`);
});

test('today: cities, reefs, palms, cacti and savanna trees stay exact', () => {
  const s = makeSim(12345, 'today');
  const f = new SE.TerrainField();
  f.refresh(s.world);
  const { incremental } = follow(s, f, 40, 5, () => s.tick());
  assert.ok(incremental > 20, `most refreshes stay incremental (${incremental} of 40)`);
});

test('a load, plate drift or brush makes the next refresh a full one', () => {
  const s = makeSim(12345);
  const f = new SE.TerrainField();
  // The first ticks of a young planet change more than a tenth of it.
  for (let t = 0; t < 4; t++) {
    s.tick();
    f.refresh(s.world);
  }
  assert.ok(f.lastRead >= 0, 'a tick reads only what changed');
  f.forget();
  f.refresh(s.world);
  assert.equal(f.lastRead, -1, 'forget() reads everything');
  s.world.driftShifts++;
  f.refresh(s.world);
  assert.equal(f.lastRead, -1, 'plate drift reads everything');
  f.refreshBox(s.world, 10, 10, 14, 14);
  f.refresh(s.world);
  assert.equal(f.lastRead, -1, 'refreshBox reads everything next time');
});
