/* =============================================================================
 * SimEarth 2.0 — Stone Age city blocks
 * -----------------------------------------------------------------------------
 * Round huts with a cone of thatch or a dome of hides over a low daub wall,
 * the dark doorway in front; a thatched longhouse; a megalith (trilithon or
 * great menhir); the village's fire place (a ring of stones round embers:
 * the map flickers the flame over its ember centre, one row above the foot,
 * tools/civ/fire.js); a standing stone; pieces of a palisade; and the
 * trampled earth of the open place round the fire. Natural materials only.
 * 3/4 view, light from the upper left: the upper-left rim one step lighter
 * than the outline, the lower-right rim the darkest tone of the block's ramp.
 * Style: docs/landschaft-2026-10/stil.md · contract: tools/civ/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');

/**
 * Thatch on straw over a wall of daub on soil, the doorway in bark's darkest
 * tone: a light wall round a dark door reads at 16 px per tile, and the
 * wall's soil steps keep the hut apart from straw-coloured steppe.
 */
const STRAW = {
  O: 'straw0', D: 'straw1', M: 'straw2', L: 'straw3',
  w: 'soil3', v: 'soil2', u: 'soil1', d: 'bark0', B: 'bark1',
};
/** Hides over bent poles, on the same daub wall. */
const HIDE = {
  A: 'sand0', S: 'sand1', T: 'sand2', H: 'sand3', h: 'sand4',
  w: 'soil3', v: 'soil2', u: 'soil1', d: 'bark0',
};
const STONE = { Q: 'rock0', q: 'rock1', r: 'rock2', R: 'rock3', W: 'rock4', m: 'moss2' };
const FIRE = { W: 'rock4', R: 'rock3', r: 'rock2', q: 'rock1', Q: 'rock0', y: 'yellow0', o: 'orange0', e: 'red1', b: 'bark0' };
const WOOD = { B: 'bark0', b: 'bark1', c: 'bark2', t: 'soil3', u: 'soil1' };

const HUT_STRAW = {
  s: [
    '..L..',
    '.LMD.',
    'LLMDO',
    'wwdvu',
    'wwdvu',
  ],
  m: [
    '...B...',
    '..LMD..',
    '.LLMDO.',
    'LLMMMDO',
    'ODDDDDO',
    '.wwdvu.',
    '.wwdvu.',
  ],
  l: [
    '....B....',
    '...LMD...',
    '..LLMDO..',
    '.LLMMMDO.',
    'LLMMMMMDO',
    'ODDDDDDDO',
    '.wwwdvvu.',
    '.wwwdvvu.',
    '.wwwdvvu.',
  ],
};

const HUT_HIDE = {
  s: [
    '.d.d.',
    '.hHT.',
    'hHTSA',
    'wwdvu',
    'wwdvu',
  ],
  m: [
    '..d.d..',
    '..hHT..',
    '.hHTTS.',
    'hHTTTSA',
    'ATTSSSA',
    '.wwdvu.',
    '.wwdvu.',
  ],
  l: [
    '...d.d...',
    '...hHT...',
    '..hHHTS..',
    '.hHHTTSA.',
    'hHHTTTSSA',
    'ATTTSSSSA',
    '.wwwdvvu.',
    '.wwwdvvu.',
    '.wwwdvvu.',
  ],
};

/** A long thatched roof over a daub wall, corner posts and a door at either end, clear of a fire in front. */
const LONGHOUSE = [
  [
    '.LLLLLLD.',
    'LLMMMMMDO',
    'LMMMMMMDO',
    'ODDDDDDDO',
    'BdwwwwvdB',
    'BdwwwwvdB',
  ],
  [
    '.LLLLLLLLD.',
    'LLMMMMMMMDO',
    'LMMMMMMMMDO',
    'LMMMMMMMMDO',
    'ODDDDDDDDDO',
    'BdwwwwwwvdB',
    'BdwwwwwwvdB',
  ],
];

const MEGALITH = [
  [
    'qWWWWRQ',
    'qRRRRrQ',
    'qWQ.qRQ',
    'qWQ.qRQ',
    'qWQ.qRQ',
    'qRQ.qrQ',
    'qRQ.qrQ',
    'QQQ.QQQ',
  ],
  [
    '.qq.',
    'qWRQ',
    'qWrQ',
    'qRqQ',
    'qWrQ',
    'qRrQ',
    'qRmQ',
    'qRrQ',
    'qRrQ',
    'QQQQ',
  ],
];

/**
 * The village's fire place: a ring of stones round embers, the ember centre
 * at the anchor column one row above the foot, where the map's flame stands;
 * the stones beside and in front of it stay visible under a 3–5 px flame.
 */
const FIREPIT = [
  [
    '.qWRWq.',
    'WRbebRq',
    'ReoyoeQ',
    '.qQRQq.',
  ],
  [
    '.rWq.',
    'WoyoQ',
    '.qRq.',
  ],
];

/** The smaller fire place inside the palisade ring, where the court leaves no room for the village's ring of stones. */
const HEARTH = [
  'rWRq.',
  'WoyoQ',
  '.qRq.',
];

const MENHIR = [
  [
    '.q.',
    'qWQ',
    'qRQ',
    'qRQ',
    'qrQ',
    'QQQ',
  ],
  [
    '.q...',
    'qWQ..',
    'qRQ.q',
    'qRQqW',
    'qRrQR',
    'QQQQQ',
  ],
];

/**
 * A straight piece, a piece running into the picture (one stake wide, so a
 * ring leaves the court inside it room), a long piece. Low stakes: the huts
 * inside stay in sight over the front.
 */
const PALISADE = [
  [
    't.t.',
    'cbcb',
    'cBcB',
  ],
  [
    't',
    'c',
    'b',
    'c',
    'B',
  ],
  [
    't.t.t.t.',
    'cbcbcbcb',
    'cBcBcBcB',
  ],
];

/** Trampled earth per size stage (w × h): an open place round the fire, wider with each stage. */
const PLACE = [[12, 7], [14, 9], [16, 12]];

/**
 * The open place: an oval of trampled earth, its rim fraying in 2 × 2
 * cells into the grass, worn lighter towards the middle where the fire is.
 */
function place(stage) {
  const [w, h] = PLACE[stage];
  const t = new k.Tex(w, h);
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  t.each((x, y) => {
    const fx = ((x | 1) - 0.5 - cx) / (w / 2);
    const fy = ((y | 1) - 0.5 - cy) / (h / 2);
    const d = fx * fx + fy * fy;
    const n = k.hash(x >> 1, y >> 1, 29 + stage);
    if (d > 0.9 + (n - 0.5) * 0.35) return undefined;
    if (d < 0.35 && n > 0.3) return k.c('sand1');
    return k.c(n < 0.18 ? 'soil2' : 'soil3');
  });
  for (let x = Math.floor(w / 2) - 1; x <= Math.floor(w / 2); x++) if (t.get(x, h - 1) === 0) t.set(x, h - 1, k.c('soil3'));
  return t;
}

/** Recipes by block id; `v` is { size } for dwellings, { index } otherwise. */
const blocks = {
  hut_straw: (v) => k.grid(HUT_STRAW[v.size], STRAW),
  hut_hide: (v) => k.grid(HUT_HIDE[v.size], HIDE),
  longhouse: (v) => k.grid(LONGHOUSE[v.index], STRAW),
  megalith: (v) => k.grid(MEGALITH[v.index], STONE),
  firepit: (v) => k.grid(FIREPIT[v.index], FIRE),
  hearth: () => k.grid(HEARTH, FIRE),
  menhir: (v) => k.grid(MENHIR[v.index], STONE),
  palisade: (v) => k.grid(PALISADE[v.index], WOOD),
  yard_stone: (v) => place(v.index),
};

module.exports = { blocks };
