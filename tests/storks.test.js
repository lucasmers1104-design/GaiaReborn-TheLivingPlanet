'use strict';
/*
 * Migrating storks (src/storklayer.ts): the route, the departures, the V, the
 * climb and descent with the birds shrinking onto the ground, the wing
 * beat and the Examine tool's neighbourhood. Drawing them
 * (StorkLayer.draw) needs the effect atlas and a canvas.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE } = require('./helpers');

const SE = loadSE();

test('the V: bird 0 leads, both arms flown, centred, no two birds stacked', () => {
  for (const n of [5, 6, 7]) {
    for (const seed of [1, 4242, 999999]) {
      const v = SE.storkFormation(n, seed);
      assert.equal(v.length, n);
      for (let k = 1; k < n; k++) assert.ok(v[0][0] > v[k][0], `n ${n} seed ${seed}: bird ${k} ahead of the leader`);
      assert.ok(v.some((p) => p[1] > 4) && v.some((p) => p[1] < -4), `n ${n} seed ${seed}: one arm empty`);
      assert.ok(Math.abs(v.reduce((s, p) => s + p[0], 0)) < 1e-9 && Math.abs(v.reduce((s, p) => s + p[1], 0)) < 1e-9);
      for (let a = 0; a < n; a++) {
        for (let b = a + 1; b < n; b++) {
          assert.ok(Math.abs(v[a][0] - v[b][0]) >= 8 || Math.abs(v[a][1] - v[b][1]) >= 8, `n ${n} seed ${seed}: birds ${a} and ${b} stacked`);
        }
      }
    }
  }
  assert.notDeepEqual(SE.storkFormation(7, 1), SE.storkFormation(7, 2), 'every flock its own V');
});

test('altitude: on the ground at both ends, a plateau between, never below it', () => {
  for (const dur of [15, 22.5, 30, 6]) {
    assert.equal(SE.storkAltitude(0, dur), 0);
    assert.equal(SE.storkAltitude(dur, dur), 0);
    assert.equal(SE.storkAltitude(dur / 2, dur), 1);
    let prev = 0;
    for (let u = 0; u <= dur / 2; u += 0.05) {
      const h = SE.storkAltitude(u, dur);
      assert.ok(h >= prev - 1e-12 && h <= 1, `dur ${dur} u ${u.toFixed(2)}: ${h}`);
      assert.ok(Math.abs(h - SE.storkAltitude(dur - u, dur)) < 1e-9, 'descent mirrors the climb');
      prev = h;
    }
    assert.ok(SE.storkAltitude(0.3, dur) < 0.1, 'rises slowly off the ground');
  }
  for (const u of [-5, -0.1, 40]) assert.equal(SE.storkAltitude(u, 30), 0);
});

test('wing beat: whole beats 0–3 in order, then a longer glide on 4–7, each bird out of phase', () => {
  const step = 1 / 64;
  for (let k = 0; k < 7; k++) {
    let flap = 0;
    let glide = 0;
    const runs = [];
    for (let t = 0; t < 7; t += step) {
      const f = SE.storkFrame(t, k);
      assert.ok(Number.isInteger(f) && f >= 0 && f < 8, `bird ${k} t ${t}: ${f}`);
      if (f < 4) flap++; else glide++;
      if (runs[runs.length - 1] !== f) runs.push(f);
    }
    assert.ok(glide > flap && flap > 0, `bird ${k}: flap ${flap} glide ${glide}`);
    // Every flap starts raised and runs 0, 1, 2, 3 before anything else.
    for (let i = 1; i < runs.length; i++) {
      if (runs[i] < 4) assert.equal(runs[i], runs[i - 1] < 4 ? (runs[i - 1] + 1) % 4 : 0, `bird ${k}: ${runs.slice(i - 1, i + 1)}`);
      if (runs[i - 1] < 4 && runs[i] >= 4) assert.equal(runs[i - 1], 3, `bird ${k}: glide after a broken beat`);
    }
  }
  const apart = [];
  for (let t = 0; t < 4; t += step) apart.push(SE.storkFrame(t, 0) !== SE.storkFrame(t, 1));
  assert.ok(apart.filter(Boolean).length > apart.length / 3, 'neighbours beat out of step');
});

test('near: the tile itself and its 8 neighbours, across the date line too', () => {
  const W = SE.GRID_W;
  const at = (x, y) => y * W + x;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      assert.ok(SE.storkNear(at(10, 20), at(10 + dx, 20 + dy)));
      assert.ok(SE.storkNear(at(0, 20), at((W + dx) % W, 20 + dy)));
    }
  }
  assert.ok(!SE.storkNear(at(10, 20), at(12, 20)));
  assert.ok(!SE.storkNear(at(10, 20), at(10, 22)));
  assert.ok(!SE.storkNear(at(0, 20), at(W - 2, 20)));
});

test('size: birds land at a little over half their size and fly at full size', () => {
  assert.equal(SE.storkScale(1), 1);
  assert.ok(SE.storkScale(0) > 0.4 && SE.storkScale(0) < 0.7);
  for (let a = 0; a < 1; a += 0.1) assert.ok(SE.storkScale(a) < SE.storkScale(a + 0.1), 'shrinks as it comes down');
});

test('flocks leave on a steady beat, 25–45 s apart', () => {
  for (let j = -3; j < 50; j++) {
    const gap = SE.storkDeparture(j + 1) - SE.storkDeparture(j);
    assert.ok(gap >= 24 && gap <= 46, `flock ${j}: ${gap.toFixed(1)} s`);
  }
});

/** A planet with one meadow continent from the far north to the tropics along x 100–110, and modern birds. */
function storkWorld() {
  const w = new SE.WorldState();
  w.elevation.fill(-0.5);
  for (let y = 0; y < SE.GRID_H; y++) {
    const lat = SE.latitudeDeg(y);
    for (let x = 0; x < SE.GRID_W; x++) {
      const i = SE.idx(x, y);
      w.temperature[i] = 30 - Math.abs(lat) * 0.5;
      if (x >= 100 && x <= 110 && y >= 10 && y <= 60) {
        w.elevation[i] = 0.1;
        w.landscape[i] = SE.Landscape.Meadow;
      }
    }
  }
  w.lifeStageCounts[SE.Life.Avian * SE.SUBSPECIES_PER_CLASS + SE.STORK_STAGE] = 1;
  return w;
}

test('route: from a temperate breeding ground south over the land to a warm wintering ground, the same every time', () => {
  const w = storkWorld();
  const r = SE.storkRoute(w);
  assert.ok(r, 'a route');
  assert.ok(r.y1 > r.y0, 'north to south');
  assert.ok(Math.abs(r.x1 - r.x0) < (r.y1 - r.y0) * 0.5, 'mostly south');
  assert.ok(r.y1 - r.y0 >= 14 && Math.hypot(r.x1 - r.x0, r.y1 - r.y0) <= 40, `length ${r.y1 - r.y0}`);
  const lat0 = SE.latitudeDeg(r.y0);
  assert.ok(lat0 >= 35 && lat0 <= 62, `breeds at ${lat0.toFixed(0)}°`);
  assert.ok(w.temperature[SE.idx(SE.wrapX(r.x1), r.y1)] >= 20, 'winters warm');
  for (const [x, y] of [[r.x0, r.y0], [r.x1, r.y1]]) assert.ok(x >= 100 && x <= 110 && y >= 10 && y <= 60, 'both ends on the continent');
  assert.deepEqual(SE.storkRoute(w), r, 'habit: the same route again');

  w.lifeStageCounts.fill(0);
  assert.equal(SE.storkRoute(w), null, 'no modern birds, no route');
});

test('route: Mitteleuropa to the Sahel where that land is stork country', () => {
  const w = storkWorld();
  for (let y = 20; y <= 60; y++) {
    for (let x = 130; x <= 142; x++) {
      w.elevation[SE.idx(x, y)] = 0.1;
      w.landscape[SE.idx(x, y)] = SE.Landscape.Savanna;
    }
  }
  const r = SE.storkRoute(w);
  assert.deepEqual([r.x0, r.y0, r.x1, r.y1], [135, 27, 131, 54]);
});
