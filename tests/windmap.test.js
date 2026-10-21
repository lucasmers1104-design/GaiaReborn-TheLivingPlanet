'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE } = require('./helpers');
const SE = loadSE();
const rowAt = lat => (0.5 - lat / 180) * SE.GRID_H - 0.5;

test('surface winds converge at the equator and subpolar fronts in both hemispheres', () => {
  for (const hemisphere of [1, -1]) {
    const trade = SE.ClimateSystem.airCurrent(rowAt(15 * hemisphere));
    const west = SE.ClimateSystem.airCurrent(rowAt(45 * hemisphere));
    const polar = SE.ClimateSystem.airCurrent(rowAt(75 * hemisphere));
    assert.ok(trade.dx < 0 && trade.dy * hemisphere > 0, 'trades blow west and toward the equator');
    assert.ok(west.dx > 0 && west.dy * hemisphere < 0, 'westerlies blow east and toward the subpolar front');
    assert.ok(polar.dx < 0 && polar.dy * hemisphere > 0, 'polar easterlies blow west and toward the subpolar front');
  }
});

test('wind map colour boundaries match the wind vectors, including fractional belt edges', () => {
  const water = { isWater: () => true };
  const land = { isWater: () => false };
  const reference = new Map();
  for (let y = 0; y < SE.GRID_H; y++) {
    const v = SE.ClimateSystem.airCurrent(y);
    const key = `${v.dx}|${Math.abs(SE.latitudeDeg(y)) < 30}`;
    const c = SE.windMapColor(water, SE.idx(10, y));
    if (!reference.has(key)) reference.set(key, c);
    assert.deepEqual(c, reference.get(key), `wind family at row ${y}`);
    assert.deepEqual(c, SE.windMapColor(water, SE.idx(200, SE.GRID_H - 1 - y)), 'hemispheres mirror');
    assert.notDeepEqual(c, SE.windMapColor(land, SE.idx(10, y)), 'continents remain visible');
  }
  assert.equal(new Set([...reference.values()].map(c => c.join(','))).size, 3, 'all three wind families are distinct');
});

function recordingContext() {
  const paths = [];
  let path = [];
  return {
    paths,
    beginPath() { path = []; },
    moveTo(x, y) { path.push(['move', x, y]); },
    lineTo(x, y) { path.push(['line', x, y]); },
    stroke() { paths.push({ color: this.strokeStyle, path: [...path] }); },
    save() {}, restore() {}, arc() {}, clip() {},
  };
}

test('globe wind arrows stay on the visible hemisphere under spin and polar tilt', () => {
  const layer = new SE.WindMapLayer();
  for (const spin of [0, Math.PI / 3, Math.PI * 2 - 0.01]) {
    for (const tilt of [-Math.PI / 2, -0.6, 0, 0.6, Math.PI / 2]) {
      const ctx = recordingContext();
      layer.drawGlobe(ctx, 100, 150, 120, spin, tilt);
      const arrows = ctx.paths.filter(p => p.color === '#08121b').flatMap(p => p.path);
      assert.ok(arrows.length > 0, 'visible winds, including at a pole');
      assert.ok(arrows.length <= 6 * 12 * 5, 'fixed upper bound on arrow geometry');
      for (const [, x, y] of arrows) {
        assert.ok(Number.isFinite(x) && Number.isFinite(y));
        assert.ok(Math.hypot(x - 150, y - 120) <= 101, 'no arrows project from the back or past the limb');
      }
    }
  }
});

test('front-facing globe arrows preserve all six surface wind directions and hide the back', () => {
  const ctx = recordingContext();
  new SE.WindMapLayer().drawGlobe(ctx, 100, 150, 120, 0, 0);
  const belts = ctx.paths.filter(p => p.color === '#08121b');
  assert.deepEqual(belts.map(p => p.path.length / 5), [3, 5, 5, 5, 5, 3]);
  const expected = [[-1, 1], [1, -1], [-1, 1], [-1, -1], [1, 1], [-1, -1]];
  belts.forEach((belt, index) => {
    const shafts = [];
    for (let k = 0; k < belt.path.length; k += 5) shafts.push(belt.path.slice(k, k + 2));
    const [start, end] = shafts.sort((a, b) => Math.abs((a[0][1] + a[1][1]) / 2 - 150) - Math.abs((b[0][1] + b[1][1]) / 2 - 150))[0];
    assert.equal(Math.sign(end[1] - start[1]), expected[index][0], 'east/west preserved');
    assert.equal(Math.sign(end[2] - start[2]), expected[index][1], 'north/south preserved');
  });
});
