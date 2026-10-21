/* =============================================================================
 * SimEarth 2.0 — Bronze Age city blocks
 * -----------------------------------------------------------------------------
 * Low, boxy, pale mud-brick: flat-roofed houses with beam ends under the
 * parapet, the large one a courtyard house (a ring of roofs round an open
 * clay court), beehive silos and a granary of them, a stepped temple of
 * fired brick rising over the town, a well and jars, a mud wall with
 * rounded merlons and a timber bridge, on packed clay with a court in it.
 * Style: docs/landschaft-2026-10/stil.md · contract: tools/civ/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');
const S = require('./shapes');
const { yard } = require('./yard');

/** Mud brick: a light roof, the front wall two steps darker (so roofs and walls read as boxes), beam ends of wood. */
const MUD = {
  R: 'sand4', T: 'sand4', S: 'sand3', O: 'sand0',
  w: 'sand2', v: 'sand1', u: 'sand0', d: 'soil0', n: 'soil1', b: 'bark1',
};
/** The town wall of darker, unplastered mud brick, so the ring frames the pale houses. */
const RAMPART = { R: 'sand3', T: 'sand3', O: 'sand0', w: 'sand1', v: 'sand0', u: 'soil1' };
/** The courtyard house: the court's clay floor, its shaded edge; windows dark like the door. */
const COURT = { ...MUD, n: 'soil0', k: 'laterite2', K: 'laterite1' };
/** Silo domes of red clay shaded from their lit left to a dark right, so they read as round among the pale roofs. */
const GRAIN = { R: 'sand4', L: 'laterite3', T: 'laterite2', S: 'laterite1', O: 'laterite0', w: 'sand2', v: 'sand1', u: 'sand0', d: 'soil0' };
/** Fired brick of the temple, its stair and shrine of pale mud brick. */
const BRICK = {
  R: 'laterite3', T: 'laterite3', S: 'laterite1', O: 'laterite0',
  w: 'laterite2', v: 'laterite1', u: 'laterite0', L: 'sand3', A: 'sand4', B: 'sand2', d: 'soil0',
};
const WELL = { R: 'rock4', T: 'rock3', O: 'rock1', q: 'rock2', Q: 'rock0', x: 'water3', y: 'water5', a: 'laterite3', A: 'laterite2', z: 'laterite0' };
const WOOD = { B: 'bark0', b: 'bark1', c: 'bark2', t: 'soil3' };

/** Beam ends poking out under the roof's front edge, every other column. */
function beams(g, row) {
  for (let x = 1; x < g[row].length - 1; x += 2) if (g[row][x] !== '.') g[row][x] = 'b';
  return g;
}

/** Small and medium: a flat-roofed box; large: a courtyard house, its rooms round an open court. */
function mudbrick(size) {
  // A medium house stays 6 px wide: it must fit the 5–6 px bank beside a river through the tile.
  if (size === 's') return beams(S.flat(5, 2, 3, { door: 1 }), 2);
  if (size === 'm') return beams(S.flat(6, 3, 3, { door: 1, windows: [[1], 3, 9] }), 3);
  return [
    'RRRRRRRO',
    'RTwwwvSO',
    'RTKkkkSO',
    'RTKkkkSO',
    'RTTTTTSO',
    'SSSSSSSO',
    'wbwdwbvu',
    'wnwdwnvu',
  ];
}

/** A row of beehive silos, each lit on its left, behind the low wall of the granary yard with its gate. */
const GRANARY = [
  '.LT...LT..',
  'LLTS.LLTS.',
  'LTTSOLTTSO',
  'LTTSOLTTSO',
  'RRRRRRRRRO',
  'wwwwddwwvu',
  'wwwwddwwvu',
];

/** A silo on its own, and two small ones. */
const SILOS = [
  [
    '.LT.',
    'LTTS',
    'LTTS',
    'LTSO',
    'wwvu',
    'wdvu',
  ],
  [
    '.LT....',
    'LTTS.L.',
    'LTTSLTS',
    'LTSOLSO',
    'wwvuwvu',
    'wdvuwdu',
  ],
];

/** Three tiers round a central stair, a whitewashed shrine on top. */
const ZIGGURAT = [
  '....AB....',
  '...AAAB...',
  '...AdAB...',
  '..RTLLTO..',
  '..wwLLvu..',
  '..wwLLvu..',
  '.RTTLLTTO.',
  '.wwwLLwvu.',
  '.wwwLLwvu.',
  'RTTTLLTTTO',
  'wwwwLLwwvu',
  'wwwwLLwwvu',
  'wwwwLLwwvu',
  'uuuuLLuuuu',
];

const WELLS = [
  [
    '.RTO.',
    'RxyxO',
    'qTTTQ',
    '.qqQ.',
  ],
  [
    '.a...',
    'aAz.a',
    'aAzaA',
    'zzzzz',
  ],
];

/** A straight piece, a piece running into the picture, a long piece; rounded merlons along the top. */
const MUDWALL = [
  [
    'R.R.',
    'TTTO',
    'wwvu',
    'wwvu',
  ],
  [
    'R.',
    'TO',
    'wT',
    'wO',
    'wT',
    'wv',
    'wu',
  ],
  [
    'R.R.R.R',
    'TTTTTTO',
    'wwwwwvu',
    'wwwwwvu',
  ],
];

/** Planks on piles: across a river running north–south (0) and west–east (1). */
const BRIDGE = [
  [
    'b..b..b..b',
    'cccccccccb',
    'tctctctctb',
    'bbbbbbbbbB',
    '.B..B..B..',
  ],
  [
    'b...B',
    'cttcB',
    'cbbcB',
    'cttcB',
    'cbbcB',
    'cttcB',
    'cbbcB',
    'cttcB',
    'cbbcB',
    'b...B',
  ],
];

/**
 * Courts of smooth clay in the packed-clay yard, per size stage, as tile
 * rectangles [x0, y0, x1, y1] (symmetric about the tile's middle, like the
 * plans' kept courts in src/cityplans.ts, which are mirrored).
 */
const COURTS = [
  [[6, 10, 9, 13]],
  [],
  [],
];

/** The packed-clay yard 16 px wide (so it sits square on the tile), its courts smooth and lighter. */
function clayYard(stage) {
  const base = yard(stage, 'earth', ['laterite1', 'laterite2', 'laterite3'], 21);
  const t = new k.Tex(16, base.h);
  t.stamp(base, (16 - base.w) >> 1, 0);
  const top = 13 - (t.h - 1);
  for (const [x0, y0, x1, y1] of COURTS[stage]) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) t.set(x, y - top, k.c(y === y0 || x === x0 ? 'laterite2' : 'laterite3'));
    }
  }
  return t;
}

const blocks = {
  mudbrick: (v) => S.sprite(mudbrick(v.size), COURT),
  granary: () => S.sprite(GRANARY, GRAIN),
  ziggurat: () => S.sprite(ZIGGURAT, BRICK),
  silo: (v) => S.sprite(SILOS[v.index], GRAIN),
  well: (v) => S.sprite(WELLS[v.index], WELL),
  mudwall: (v) => S.sprite(MUDWALL[v.index], RAMPART),
  bridge_wood: (v) => S.sprite(BRIDGE[v.index], WOOD),
  yard_bronze: (v) => clayYard(v.index),
};

module.exports = { blocks };
