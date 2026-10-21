/* =============================================================================
 * SimEarth 2.0 — Information Age city blocks
 * -----------------------------------------------------------------------------
 * Slim towers of blue glass: a white crown, a dark mullion line running up
 * every other column and a sky reflection slanting down across the glass.
 * Low glass pavilion houses under a flat white roof slab, a hall under a
 * white barrel roof, a radio tower with its pod as the landmark, a wind
 * turbine and solar panels, all on a light plaza with lawn strips: thin
 * verticals over open ground. Style: docs/landschaft-2026-10/stil.md ·
 * contract: tools/civ/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');
const S = require('./shapes');

/**
 * R lit frame · S frame in shade · O frame outline · L light glass and the
 * reflection · W its soft edge · g glass · n mullion · v shaded glass ·
 * u the dark edge and the entrance.
 */
const GLASS = { R: 'white0', S: 'rock4', O: 'rock3', L: 'ice3', W: 'ice2', g: 'ice1', n: 'water3', v: 'ice0', u: 'water2' };
const TOWER = { R: 'white0', T: 'rock4', O: 'rock3', k: 'rock2', e: 'red1', g: 'ice2', n: 'water3' };
const ENERGY = { W: 'white0', h: 'rock4', k: 'rock2', n: 'water2', g: 'ice2', b: 'rock3' };

/** Glass columns of a front `w` wide: lit edge, mullion every other column, shaded and dark edge on the right. */
function glassColumn(x, w) {
  if (x === 0) return 'L';
  if (x === w - 1) return 'u';
  if (x === w - 2) return 'v';
  return x % 2 === 0 ? 'n' : 'g';
}

/**
 * A slim glass tower `w` wide and `h` high. `crown`: rows each column's top
 * steps down from the left (a slanted crown), else a flat white crown.
 * The reflection runs down one column every two rows from row `glint`.
 */
function tower(w, h, crown, glint) {
  const g = S.canvas(w, h);
  for (let x = 0; x < w; x++) {
    const top = crown ? crown[x] : 0;
    g[top][x] = x === w - 1 ? 'O' : 'R';
    g[top + 1][x] = x === w - 1 ? 'O' : 'S';
    for (let y = top + 2; y < h; y++) g[y][x] = glassColumn(x, w);
  }
  for (let x = 1; x < w - 1; x++) {
    const y = glint + 2 * (x - 1);
    if (y < h - 2 && g[y][x] !== '.') g[y][x] = 'L';
    if (y + 1 < h - 2 && g[y + 1][x] !== '.') g[y + 1][x] = 'W';
  }
  g[h - 1][1] = 'u';
  g[h - 2][1] = 'u';
  return g;
}

/** A low glass house under a flat white roof slab that overhangs it by a column on each side. */
function pavilionHouse() {
  const w = 7;
  const g = S.canvas(w, 5);
  for (let x = 0; x < w; x++) {
    g[0][x] = x === w - 1 ? 'O' : 'R';
    g[1][x] = x === w - 1 ? 'O' : 'S';
  }
  for (let y = 2; y < 5; y++) for (let x = 1; x < w - 1; x++) g[y][x] = glassColumn(x - 1, w - 2);
  g[2][2] = 'L';
  g[3][3] = 'u';
  g[4][3] = 'u';
  return g;
}

function glass(size) {
  if (size === 's') return pavilionHouse();
  if (size === 'm') return tower(4, 11, null, 3);
  return tower(5, 17, [0, 0, 1, 2, 3], 4);
}

/** A long low glass hall under a white barrel roof. */
function pavilion() {
  return [
    '..RRRRS..',
    '.RRRRRRSO',
    'RRRRRRSSO',
    'SSSSSSSSO',
    '.LgnuungO',
    '.LgnuungO',
  ];
}

/** The radio tower: a white shaft, a pod with its window ring, an antenna with a red light. */
const RADIO = [
  '..e..',
  '..R..',
  '..R..',
  '..O..',
  '..R..',
  '.RRO.',
  'RRRTO',
  'nngnn',
  '.TTO.',
  '..RO.',
  '..RO.',
  '..RO.',
  '..RO.',
  '..RO.',
  '..RO.',
  '..RO.',
  '..RO.',
  '..RO.',
  '.RTO.',
  '.kkk.',
];

const ENERGY_GRIDS = [
  [
    '..W..',
    '..W..',
    'WWhkk',
    '..h..',
    '..h..',
    '..h..',
    '..h..',
    '..h..',
    '..h..',
    '..h..',
    '..h..',
    '.khk.',
  ],
  [
    'gnngnn',
    'nnnnnn',
    'bbbbbb',
  ],
];

/** Plaza size per size stage (village, town, metropolis): it grows to fill the tile. */
const PLAZA = [[14, 10], [16, 12], [16, 14]];

/**
 * Lawn on the plaza, by column from the nearer side edge (`cx`) and row from
 * the bottom (`fy`), matching the free places of the era's plans
 * (src/cityplans.ts): the town's green strip down the middle, the
 * metropolis's green sides and front.
 */
const LAWN = [
  () => false,
  (cx, fy) => cx >= 6 && fy <= 3,
  (cx, fy) => cx < 2 || fy < 2,
];

/**
 * The plaza under the city: light slabs with fine joints, lawn where the
 * plan keeps open green, corners cut. Symmetric, as the plan is mirrored
 * and the ground is not.
 */
function plaza(stage) {
  const [w, h] = PLAZA[stage];
  const t = new k.Tex(w, h);
  const slab = k.c('rock4');
  const light = k.c('lichen1');
  const joint = k.c('rock3');
  const lawn = k.c('meadow3');
  const lawnDark = k.c('leaf3');
  t.each((x, y) => {
    const cx = Math.min(x, w - 1 - x);
    const cy = Math.min(y, h - 1 - y);
    if (cx + cy < 2) return undefined;
    if (LAWN[stage](cx, h - 1 - y)) return k.hash(x >> 1, y >> 1, 61 + stage) < 0.3 ? lawnDark : lawn;
    if (x % 3 === 2 || y % 3 === 2) return joint;
    return ((x / 3) | 0) % 2 === ((y / 3) | 0) % 2 ? light : slab;
  });
  return t;
}

const blocks = {
  glass: (v) => S.sprite(glass(v.size), GLASS),
  pavilion: () => S.sprite(pavilion(), GLASS),
  radio_tower: () => S.sprite(RADIO, TOWER),
  turbine: (v) => S.sprite(ENERGY_GRIDS[v.index], ENERGY),
  yard_information: (v) => plaza(v.index),
};

module.exports = { blocks };
