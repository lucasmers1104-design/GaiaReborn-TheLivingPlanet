/* =============================================================================
 * SimEarth 2.0 — Atomic Age city blocks
 * -----------------------------------------------------------------------------
 * Grey concrete in angular boxes: lit flat roof, a front of prefabricated
 * panels with a grid of windows, a shaded side face. A low block, a slab of
 * flats (Plattenbau) and a high-rise slab; a long concrete hall on pillars
 * with ribbon windows; a cooling tower under a cap of steam; a water tower
 * and a radio mast; on asphalt with a grid of concrete paths. Bridges stay
 * of steel.
 * Style: docs/landschaft-2026-10/stil.md · contract: tools/civ/catalog.js.
 * ========================================================================== */
'use strict';

const S = require('./shapes');
const k = require('../terrain/kit');
const { yard } = require('./yard');

/** Top lit, front light, side shaded; windows dark, the side's darker still. */
const CONCRETE = { t: 'white0', T: 'rock4', f: 'rock4', F: 'rock3', s: 'rock2', e: 'rock1', n: 'rock1', m: 'rock0', d: 'rock0' };
const TOWER = { R: 'rock4', L: 'rock4', T: 'rock3', S: 'rock2', O: 'rock1', k: 'rock0', W: 'white0', i: 'ice4', h: 'ice3' };
const MAST = { R: 'rock4', T: 'rock3', O: 'rock1', b: 'rock2', k: 'rock0', e: 'red1' };

/**
 * An angular block in 3/4 view: a front `front` px wide and `high` rows
 * tall, its flat roof and its right side face `side` px deep. `face(g, x0,
 * y0, w, h)` paints the front (windows, doors) over the plain panels.
 */
function box(front, side, high, face) {
  const w = front + side;
  const h = side + high;
  const g = S.canvas(w, h);
  for (let y = 0; y < side; y++) {
    for (let x = side - y; x < side - y + front; x++) g[y][x] = y === 0 || x === side - y ? 't' : 'T';
  }
  for (let y = side; y < h; y++) for (let x = 0; x < front; x++) g[y][x] = x === front - 1 ? 'F' : 'f';
  for (let j = 1; j <= side; j++) {
    for (let y = side - j; y <= h - 1 - j; y++) g[y][front - 1 + j] = y === side - j ? 'T' : j === side ? 'e' : 's';
  }
  face(g, 0, side, front, high);
  // The side face shows the window rows too, darker.
  for (let y = side; y < h - 1; y++) if (g[y][1] === 'n') for (let j = 1; j < side; j++) if (g[y - j][front - 1 + j] === 's') g[y - j][front - 1 + j] = 'm';
  // As many clear columns on the left as the side face takes on the right: the foot stays under the front's middle.
  return g.map((r) => [...Array(side).fill('.'), ...r]);
}

/** Panel front: a window every second column on every second row, a door in the ground floor. */
function panels(door) {
  return (g, x0, y0, w, h) => {
    for (let y = y0 + 1; y < y0 + h - 1; y += 2) for (let x = x0 + 1; x < x0 + w - 1; x += 2) g[y][x] = 'n';
    g[y0 + h - 1][x0 + door] = 'd';
    g[y0 + h - 2][x0 + door] = 'd';
  };
}

/** Ribbon windows over a ground floor on pillars: the long concrete hall. */
function ribbons(g, x0, y0, w, h) {
  for (let y = y0 + 1; y < y0 + h - 1; y += 2) for (let x = x0 + 1; x < x0 + w - 1; x++) g[y][x] = (x - x0) % 5 === 0 ? 'F' : 'n';
  for (let y = y0 + h - 1; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) g[y][x] = (x - x0) % 3 === 0 ? 'F' : 'm';
}

function concrete(size) {
  if (size === 's') return box(6, 2, 5, panels(3));
  if (size === 'm') return box(5, 2, 9, panels(2));
  return box(7, 3, 15, panels(3));
}

/** A hyperbolic shell, narrow at the waist, its dark mouth seen from above, under a cap of steam. */
function coolingTower() {
  const w = 10;
  // Half widths from the rim down: a flared rim, a long waist, the wide foot.
  const HALF = [3.6, 3.3, 2.9, 2.6, 2.4, 2.3, 2.4, 2.6, 2.9, 3.2, 3.6, 4.0, 4.4, 4.8];
  const h = HALF.length;
  const steam = 5;
  const g = S.canvas(w, h + steam);
  S.stamp(g, ['...iWi....', '.iWWWWi...', 'iWWWWWWWi.', '.hiWWWiWh.', '..hhi.hh..'], 0, 0);
  const cx = (w - 1) / 2;
  HALF.forEach((half, y) => {
    const a = Math.max(0, Math.round(cx - half));
    const b = Math.min(w - 1, Math.round(cx + half));
    const row = g[y + steam];
    for (let x = a; x <= b; x++) {
      const u = (x - a) / Math.max(1, b - a);
      row[x] = y === 0 ? (x === a ? 'R' : x === b ? 'O' : 'k') : y === 1 && x > a && x < b ? 'k' : x === b ? 'O' : u < 0.4 ? 'L' : u < 0.75 ? 'T' : 'S';
    }
  });
  return g;
}

/** Asphalt with a grid of concrete paths and kerbs, in the yard's frayed outline. */
function asphalt(stage) {
  const t = yard(stage, 'paving', ['rock0', 'rock1', 'rock2'], 51);
  const path = k.c('rock3');
  const tar = [k.c('rock0'), k.c('rock1')];
  t.each((x, y) => {
    if (t.get(x, y) === 0) return undefined;
    if (y % 5 === 4 || x % 7 === 6) return path;
    return tar[k.hash(x >> 1, y >> 1, 53) < 0.25 ? 1 : 0];
  });
  return t;
}

const MASTS = [
  [
    '.RTO.',
    'RTTTO',
    'RTTTO',
    '.OOO.',
    '.b.b.',
    '.bbb.',
    '.b.b.',
    '.bbb.',
    '.b.b.',
    'kb.bk',
  ],
  [
    '.e.',
    '.R.',
    '.T.',
    'bTb',
    '.T.',
    '.T.',
    'bTb',
    '.T.',
    '.T.',
    'kOk',
  ],
];

const blocks = {
  concrete: (v) => S.sprite(concrete(v.size), CONCRETE),
  slab: () => S.sprite(box(13, 2, 7, ribbons), CONCRETE),
  cooling_tower: () => S.sprite(coolingTower(), TOWER),
  water_tower: (v) => S.sprite(MASTS[v.index], MAST),
  yard_atomic: (v) => asphalt(v.index),
};

module.exports = { blocks };
