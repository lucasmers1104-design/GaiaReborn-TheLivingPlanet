/* =============================================================================
 * SimEarth 2.0 — Iron Age city blocks
 * -----------------------------------------------------------------------------
 * Pitched red tile roofs and gables everywhere: narrow half-timbered houses
 * (pale plaster, dark beams) gable to the street and grey stone houses with
 * their ridge along it, a tall keep with a pointed roof, a column temple of
 * pale stone, a market stall and a roofed well, a crenellated grey stone
 * wall and an arched stone bridge, on trodden earth crossed by cobbled
 * streets. Style: docs/landschaft-2026-10/stil.md · contract: tools/civ/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');
const S = require('./shapes');
const { yard } = require('./yard');

const TILE = { R: 'laterite3', T: 'laterite2', S: 'laterite1', O: 'laterite0' };
/** Plaster between dark timber. */
const TIMBER = { ...TILE, w: 'sand4', v: 'sand3', u: 'sand1', b: 'bark0', d: 'bark0', n: 'soil0' };
/** Dressed grey stone. */
const MASONRY = { ...TILE, w: 'rock3', v: 'rock2', u: 'rock1', d: 'bark0', n: 'rock0' };
/** Pale stone of the temple. */
const MARBLE = { R: 'rock4', T: 'rock4', S: 'rock3', O: 'rock1', w: 'rock4', v: 'rock2', u: 'rock1', n: 'rock0', a: 'laterite2', A: 'laterite0' };
/** Grey wall stone, darker than the houses, so the ring stands out round them. */
const RAMPART = { R: 'rock3', T: 'rock3', O: 'rock0', w: 'rock2', v: 'rock1', u: 'rock0' };
const MARKET = { e: 'red1', W: 'white0', b: 'bark0', c: 'bark2', ...TILE, g: 'rock3', h: 'rock2', k: 'rock0', x: 'water3' };

/**
 * Narrow gable-front houses of pale plaster between dark beams, one to three
 * storeys. Small and medium stay 4–5 px wide: they line a street 4 px wide
 * inside the ring and fit the bank beside a river through the tile.
 */
const TIMBERHOUSE = {
  s: [
    '.RS.',
    'RTSO',
    'bbbb',
    'wwvu',
    'wdvu',
  ],
  m: [
    '..R..',
    '.RTS.',
    'RTTSO',
    'bbbbb',
    'wnwnu',
    'bbbbb',
    'wwdvu',
    'wwdvu',
  ],
  l: [
    '...R...',
    '..RTS..',
    '.RTTTS.',
    'RTTTTSO',
    'bbbbbbb',
    'wnwbwnu',
    'wwwbwvu',
    'bbbbbbb',
    'wnwdwnu',
    'wwwdwvu',
  ],
};

/** Grey stone houses with the ridge along the street: eaves and windows to the front. */
const STONEHOUSE = {
  s: [
    '.RTO.',
    'RTTSO',
    'uuuuu',
    'wndvu',
    'wwdvu',
  ],
  m: [
    '.RTSO.',
    'RTTTSO',
    'uuuuuu',
    'wnwnvu',
    'wwwwvu',
    'wwdwvu',
  ],
  l: [
    '..RTTSO..',
    '.RTTTTSO.',
    'RTTTTTTSO',
    'uuuuuuuuu',
    'wnwwnwwnu',
    'wwwwwwwvu',
    'wnwwdwwnu',
    'wwwwdwwvu',
  ],
};

/** A tall square keep under a pointed tile roof, arrow slits and a gate; it rises over the temple in front of it. */
function keep() {
  const g = S.gable(7, 11, { door: 3, doorH: 3 });
  S.windows(g, [5, 8, 11], 3, 3, 2);
  return g;
}

/** A pediment over six columns on a stepped base; tiles along the pediment's edge. */
const TEMPLE = [
  '.....a.....',
  '...aaTAA...',
  '.aaTTTTTAA.',
  'aRTTTTTTTSA',
  'SSSSSSSSSSO',
  'wnwnwnwnwnu',
  'wnwnwnwnwnu',
  'wnwnwnwnwnu',
  'RTTTTTTTTSO',
  'wwwwwwwwwvu',
];

const MARKETS = [
  [
    'eWeWe',
    'eWeWe',
    'b...b',
    'bcccb',
    'b...b',
  ],
  [
    '..R..',
    '.RTO.',
    'RTTSO',
    'b.x.b',
    'ghhhk',
    '.hhk.',
  ],
];

/**
 * A straight piece, a piece running into the picture, a long piece; crenellated, with a course of
 * dark joints. The straight piece stays 4 rows high, so the roofs behind the ring's front show over it.
 */
const STONEWALL = [
  [
    'R.R.',
    'TTTO',
    'wuwu',
    'wwvu',
  ],
  [
    'R.',
    'TO',
    'wT',
    'wO',
    'wT',
    'wO',
    'wv',
    'wu',
  ],
  [
    'R.R.R.',
    'TTTTTO',
    'wwwwvu',
    'wuwwuu',
    'wwwwvu',
  ],
];

/** Arches over a river running north–south (0); a paved deck between parapets over one running west–east (1). */
const BRIDGE = [
  [
    'RTTTTTTTTO',
    'wwwwwwwwvu',
    'wv..ww..vu',
    'wv..ww..vu',
    'uu..uu..uu',
  ],
  [
    'RTTTO',
    'wSTSu',
    'wTTSu',
    'wSTSu',
    'wTTSu',
    'wSTSu',
    'wTTSu',
    'wSTSu',
    'wTTSu',
    'wvvvu',
  ],
];

/**
 * Cobbled streets through the trodden earth, per size stage, as tile
 * rectangles [x0, y0, x1, y1], symmetric about the tile's middle like the
 * plans' kept streets (src/cityplans.ts): a lane along the village, a
 * crossing in the town, the main street from the gate in the metropolis.
 */
const STREETS = [
  [[0, 10, 15, 12]],
  [[0, 11, 15, 13], [6, 3, 9, 13]],
  [[6, 8, 9, 13]],
];

/** The yard 16 px wide (so it sits square on the tile), its streets cobbled across it. */
function streetYard(stage) {
  const base = yard(stage, 'earth', ['soil1', 'soil2', 'soil3'], 31);
  const t = new k.Tex(16, base.h);
  t.stamp(base, (16 - base.w) >> 1, 0);
  const top = 13 - (t.h - 1);
  for (const [x0, y0, x1, y1] of STREETS[stage]) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        // Setts in pairs of rows, the joints staggered; the street's ends fray into the earth.
        if ((x === x0 || x === x1) && x1 - x0 > 3 && k.hash(x, y, 7) < 0.5) continue;
        const joint = (x + (y >> 1)) % 3 === 0;
        t.set(x, y - top, k.c(joint ? 'rock3' : 'rock4'));
      }
    }
  }
  return t;
}

const blocks = {
  timberhouse: (v) => S.sprite(TIMBERHOUSE[v.size], TIMBER),
  stonehouse: (v) => S.sprite(STONEHOUSE[v.size], MASONRY),
  keep: () => S.sprite(keep(), MASONRY),
  temple: () => S.sprite(TEMPLE, MARBLE),
  market: (v) => S.sprite(MARKETS[v.index], MARKET),
  stonewall: (v) => S.sprite(STONEWALL[v.index], RAMPART),
  bridge_stone: (v) => S.sprite(BRIDGE[v.index], MARBLE),
  yard_iron: (v) => streetYard(v.index),
};

module.exports = { blocks };
