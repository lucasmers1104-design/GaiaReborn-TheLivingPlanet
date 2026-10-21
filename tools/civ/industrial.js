/* =============================================================================
 * SimEarth 2.0 — Industrial Age city blocks
 * -----------------------------------------------------------------------------
 * Red brick under dark slate: terraces with a row of chimney pots, tall
 * tenements, a factory hall with a sawtooth roof and its own smokestack, a
 * station with a glass vault and a clock tower, slim banded smokestacks
 * that rise over the roofs, and a steel truss bridge, on dark cobbles.
 * Smoke is no part of the sprites: `tex.smoke` marks each stack's opening
 * and the map lets smoke rise there.
 * Style: docs/landschaft-2026-10/stil.md · contract: tools/civ/catalog.js.
 * ========================================================================== */
'use strict';

const S = require('./shapes');
const { yard } = require('./yard');

const BRICK = {
  k: 'rock0', c: 'laterite1', R: 'rock2', T: 'rock1', O: 'rock0',
  w: 'laterite2', v: 'laterite1', u: 'laterite0', n: 'rock0', l: 'ice1', d: 'bark0',
};
const FACTORY = {
  k: 'rock0', s: 'rock2', R: 'rock3', T: 'rock2', g: 'ice1',
  w: 'laterite2', v: 'laterite1', u: 'laterite0', b: 'laterite3', d: 'bark0',
};
const STATION = {
  k: 'rock0', R: 'rock1', T: 'rock1', L: 'ice3', g: 'ice2', G: 'ice1', W: 'white0',
  w: 'laterite2', v: 'laterite1', u: 'laterite0',
};
const STACK = { k: 'rock0', s: 'rock1', w: 'laterite2', v: 'laterite1', u: 'laterite0', b: 'laterite3' };
const STEEL = { k: 'rock0', T: 'rock3', S: 'rock2', O: 'rock1' };

/** Marks the chimney openings of `t`: x, y pairs of the topmost pixel of each, where the map lets smoke rise. */
function smoking(t, ...xy) {
  t.smoke = xy;
  return t;
}

/**
 * A brick row `w` px wide and `floors` storeys high under a slate roof
 * with a chimney pot every 3 px and a dark eave, a window every second
 * column. A terrace has a door at each end; a tenement one in the middle.
 * Rows of them stand side by side, so their pots and windows run on.
 */
function terrace(w, floors, tenement = false) {
  const h = 2 + 2 + 1 + floors * 2;
  const g = S.canvas(w, h);
  const pots = [];
  for (let x = 1; x <= w - 2; x += 3) pots.push(x);
  if (w - 2 - pots[pots.length - 1] >= 2) pots.push(w - 2);
  for (const x of pots) { g[0][x] = 'k'; g[1][x] = 'c'; }
  for (let x = 1; x < w - 1; x++) g[2][x] = x === w - 2 ? 'O' : 'R';
  for (let x = 0; x < w; x++) { g[3][x] = x === w - 1 ? 'O' : 'T'; g[4][x] = 'k'; }
  S.wall(g, 0, w - 1, 5, h - 1);
  for (let f = 0; f < floors; f++) for (let x = 1; x < w - 1; x += 2) g[5 + f * 2][x] = 'l';
  for (const x of tenement ? [w >> 1] : [1, w - 2]) { g[h - 2][x] = 'd'; g[h - 1][x] = 'd'; }
  return g;
}

function dwelling(size) {
  if (size === 's') return terrace(5, 1);
  if (size === 'm') return terrace(5, 2);
  return terrace(7, 5, true);
}

/** A tall stack of `h` rows, `w` (2 or 3) wide: a soot-black crown, light bands every four rows, a plinth. */
function stack(h, w) {
  const g = S.canvas(w + 2, h);
  for (let y = 0; y < h; y++) {
    for (let x = 1; x <= w; x++) {
      const shaft = x === 1 ? 'w' : x === w ? 'u' : 'v';
      g[y][x] = y === 0 ? 'k' : y <= 2 ? (x === w ? 'k' : 's') : (y - 1) % 4 === 0 ? 'b' : shaft;
    }
  }
  // Collar under the crown and the plinth at the foot, a pixel wider on each side.
  for (const [y, l, r] of [[1, 'k', 'k'], [h - 1, 'w', 'u'], [h - 2, 'w', 'u']]) { g[y][0] = l; g[y][w + 1] = r; }
  for (let x = 1; x <= w; x++) g[h - 1][x] = x === w ? 'u' : 'v';
  return g;
}

/** Sawtooth roof of glass bays over brick walls with tall windows; its smokestack rises from behind the last bay. */
function factory() {
  const teeth = 3;
  const t3 = 3;
  const w = teeth * t3 + 1;
  const h = 15;
  const roof = 6;
  const g = S.canvas(w, h);
  S.stamp(g, stack(roof + t3, 2), w - 4, 0);
  for (let t = 0; t < teeth; t++) {
    for (let r = 0; r < t3; r++) {
      for (let x = t3 - 1 - r; x < t3; x++) g[roof + r][t * t3 + x] = x === t3 - 1 ? 'g' : x === t3 - 1 - r ? 'R' : 'T';
    }
  }
  for (let x = 0; x < w; x++) g[roof + t3][x] = 'k';
  S.wall(g, 0, w - 1, roof + t3 + 1, h - 1);
  for (const x of [1, 4, 7]) { g[roof + t3 + 1][x] = 'g'; g[roof + t3 + 2][x] = 'g'; }
  for (const x of [2, 6]) { g[h - 2][x] = 'd'; g[h - 1][x] = 'd'; }
  return smoking(S.sprite(g, FACTORY), w - 3, 0);
}

/** A glass train shed behind a brick front with a great fan window, beside a slim clock tower. */
function station() {
  const w = 11;
  const h = 15;
  const vault = 4;
  const front = vault + 5;
  const g = S.canvas(w, h);
  // Clock tower: a pointed slate cap, a white face, brick down to the ground.
  S.stamp(g, ['.R.', 'RTk', 'kkk'], 0, 0);
  S.wall(g, 0, 2, 3, h - 1);
  g[4][1] = 'W';
  g[8][1] = 'G';
  g[11][1] = 'G';
  // The shed's glass vault with iron ribs, over the brick front.
  S.stamp(g, S.dome(w - 3, 5), 3, vault);
  for (let y = vault; y < front; y++) {
    for (let x = 3; x < w; x++) {
      const c = g[y][x];
      if (c === '.') continue;
      g[y][x] = c === 'O' ? 'k' : c === 'R' ? 'T' : (x - 3) % 3 === 2 ? 'R' : c === 'L' ? 'L' : c === 'T' ? 'g' : 'G';
    }
  }
  S.wall(g, 3, w - 1, front, h - 1);
  for (let x = 3; x < w; x++) g[front][x] = 'k';
  // The fan window: a half-round of glass over the entrances.
  const fan = 3 + ((w - 10) >> 1);
  S.stamp(g, ['..gLg..', '.gGLGg.', 'gGGLGGg'], fan, front + 1);
  for (const x of [fan + 1, fan + 3, fan + 5]) { g[h - 2][x] = 'k'; g[h - 1][x] = 'k'; }
  return S.sprite(g, STATION);
}

/** A truss over a river running north–south (0); a deck with steel rails over one running west–east (1). */
const BRIDGE = [
  [
    'kkkkkkkkkk',
    'kk..kk..kk',
    'k.kk..kk.k',
    'TTTTTTTTTS',
    'SSSSSSSSSO',
  ],
  [
    'kTTSk',
    'kSSSk',
    'kTTSk',
    'kTTSk',
    'kSSSk',
    'kTTSk',
    'kTTSk',
    'kSSSk',
    'kTTSk',
    'kOOOk',
  ],
];

const blocks = {
  terrace: (v) => S.sprite(dwelling(v.size), BRICK),
  factory,
  station,
  // A tall stack over the back rows and a taller, broader one for the front.
  chimney: (v) => (v.index === 0 ? smoking(S.sprite(stack(16, 2), STACK), 1, 0) : smoking(S.sprite(stack(18, 3), STACK), 2, 0)),
  bridge_steel: (v) => S.sprite(BRIDGE[v.index], STEEL),
  yard_industrial: (v) => yard(v.index, 'cobble', ['rock0', 'rock1', 'rock2'], 41),
};

module.exports = { blocks };
