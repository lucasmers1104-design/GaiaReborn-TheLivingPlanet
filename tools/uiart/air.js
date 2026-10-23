/* =============================================================================
 * Gaia Reborn — the window "Luftzusammensetzung" (air composition)
 * -----------------------------------------------------------------------------
 * Hand-pixelled art for src/airpanel.ts, read on parchment cards at 2 CSS px
 * per art pixel, next to dark ink text; the window body is dark wood.
 *   molecules   20 × 14, ball-and-stick in the usual atom colours (O red,
 *               N blue, C charcoal, H white), shaded balls with a 1-px glint,
 *               light grey bonds (= and ≡ as parallel lines), each atom in a
 *               dark outline of its own hue so white hydrogen reads on parchment
 *   oxygen way  24 × 16 framed cells (iron in the sea, O₂ in the sea, O₂ in
 *               the sky) and the 7 × 7 gold arrow between them
 *   summary     16 × 16 barometer and thermometer (a bigger hud_temp)
 * One legend for all atoms, so an oxygen is the same red in every sprite.
 * Light from the upper left throughout.
 * ========================================================================== */
'use strict';

const K = require('./kit');

/**
 * Atom characters, rim · shade · base · light · glint: O q r R P w, N m n N B v, C x c C G g;
 * hydrogen H base, h shade, W light, rim j with its corners softened in u (a full dark rim makes the
 * little white balls read as boxes); bonds s.
 */
const ATOMS = {
  q: 'ink1', r: 'red0', R: 'red1', P: 'petal2', w: 'petal4',
  m: 'water0', n: 'petalB0', N: 'petalB1', B: 'petalB2', v: 'petalB3',
  x: 'ink0', c: 'rock0', C: 'rock1', G: 'rock2', g: 'rock4',
  u: 'rock3', j: 'rock1', h: 'ice2', H: 'ice4', W: 'parch5',
  s: 'rock3',
};

/* ------------------------------------------------------- molecules ---- */

const MOL = {
  // Nitrogen: two blue balls joined by a triple bond.
  n2: [
    '....................',
    '....................',
    '....................',
    '...mmm........mmm...',
    '..mBBNmssssssmBBNm..',
    '.mBvNNNm....mBvNNNm.',
    '.mBNNNnmssssmBNNNnm.',
    '.mNNNnnm....mNNNnnm.',
    '..mNnnmssssssmNnnm..',
    '...mmm........mmm...',
    '....................',
    '....................',
    '....................',
    '....................',
  ],
  // Carbon dioxide: a charcoal carbon between two red oxygens in a straight line, double bonds.
  co2: [
    '....................',
    '....................',
    '....................',
    '........xxxx........',
    '.qqq...xgGCCx...qqq.',
    'qwPRqssxGCCCxssqwPRq',
    'qPRrq..xCCCcx..qPRrq',
    'qRrrqssxCCccxssqRrrq',
    '.qqq....xxxx....qqq.',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
  ],
  // Methane: the carbon with four hydrogens as a tetrahedron, two in the picture plane above, a small one
  // behind the carbon at the lower left, a big one in front of it at the lower right.
  ch4: [
    '..uju...........uju.',
    '.uWHHu.........uWHHu',
    '.jHHhj.........jHHhj',
    '.uHhhu...xxx...uHhhu',
    '..ujusssxGGCxsssuju.',
    '.......xGgCCCx......',
    '.......xGCCCcx......',
    '.......xCCCccx......',
    '.......uxCccujju....',
    '......uHhxxuWWHHu...',
    '......jhhj.jWHHhj...',
    '.......jj..jHHhhj...',
    '...........uHhhhu...',
    '............ujju....',
  ],
  // Water vapour: the oxygen with two hydrogens bent at about 100°, a little puff of steam rising beside it.
  h2o: [
    '...............ii...',
    '.......qqq....i@@ii.',
    '......qPPRq..i@@@@ei',
    '.....qPwRRRq..iee@ei',
    '.....qPRRRrq...iiii.',
    '.....qRRRrrq........',
    '......qRrrq.........',
    '.ujuss.qqq.ssuju....',
    'uWHHu.......uWHHu...',
    'jHHhj.......jHHhj...',
    'uHhhu.......uHhhu...',
    '.uju.........uju....',
    '....................',
    '....................',
  ],
};

const PUFF = { i: 'ice1', '@': 'white0', e: 'ice3' };

/** Dust: an angular brown grain, a grey pebble, flat flakes and specks drifting, a few glints. */
const DUST = [
  [
    '....................',
    '...kkk.....xx.......',
    '..k*llk...xgCx..ll..',
    '..klbbsk...xx....ss.',
    '...kbssk............',
    '....kkk.......xxx...',
    '.l...........xgGCx..',
    '.ss..........xGCcx..',
    '..............xxx...',
    '......kkk.........G.',
    '.....klbsk........c.',
    '.c....kkk...yy......',
    '............ks...ls.',
    '..G.................',
  ],
  { k: 'soil0', s: 'soil1', b: 'soil2', l: 'soil3', '*': 'sand4', x: 'rock0', c: 'rock1', C: 'rock2', G: 'rock3', g: 'rock4', y: 'laterite2' },
];

/* ----------------------------------------------------- oxygen way ---- */

/**
 * Cell characters: '#' frame; sea '~' wave crest, 1 surface, 2 upper, 3 lower, 4 deep water;
 * sky 5 high, 6 low, 7 horizon; cloud '@' white, e shade, i rim; bubble o rim, O inside, '*' glint;
 * iron (rust metal) y rim, Y dark band, z reflected light, Z base, A light, a glint, f rust flakes.
 */
const CELL = {
  '#': 'water1', '~': 'water7', 1: 'water5', 2: 'water4', 3: 'water3', 4: 'water2',
  5: 'ice2', 6: 'ice3', 7: 'ice4',
  '@': 'white0', e: 'ice3', i: 'ice1',
  o: 'ice3', O: 'water6', '*': 'white0',
  y: 'bark0', Y: 'laterite0', z: 'laterite1', Z: 'laterite2', A: 'orange0', a: 'petalY3', f: 'laterite3',
};

const SEA = [
  '.######################.',
  '#1111111111111111111111#',
  '#11~~1111~~1111~~1111~~#',
  '#~~22~~~~22~~~~22~~~~22#',
  '#2222222222222222222222#',
  '#2222222222222222222222#',
  '#2323232323232323232323#',
  '#3333333333333333333333#',
  '#3333333333333333333333#',
  '#3333333333333333333333#',
  '#3434343434343434343434#',
  '#4444444444444444444444#',
  '#4444444444444444444444#',
  '#4444444444444444444444#',
  '#4444444444444444444444#',
  '.######################.',
];

/** Paint `rows` over a copy of `base` ('.' keeps the base). */
function over(base, rows) {
  return base.map((b, y) => [...b].map((ch, x) => (rows[y][x] === '.' ? ch : rows[y][x])).join(''));
}

const CELLS = {
  // Dissolved iron Fe²⁺: a rust-orange metal ball in the sea, rust flakes sinking below it.
  fe: over(SEA, [
    '........................',
    '........................',
    '........................',
    '........................',
    '.........yyyyy..........',
    '........yAAAZZy.........',
    '.......yAaaAZZZy........',
    '.......yAaAAZZzy........',
    '.......yZAZZZZzy........',
    '.......yYYYYYYYy........',
    '.......yzZZZZzYy........',
    '........yzZZzYy.........',
    '.........yyyyy....f.....',
    '..........fz.......z....',
    '......zf.....zf.........',
    '........................',
  ]),
  // O₂ in the sea: two red oxygens with a double bond, bubbles rising beside them.
  o2_sea: over(SEA, [
    '........................',
    '........................',
    '...................oo...',
    '..................o*Oo..',
    '..................oOOo..',
    '.....qqq.......qqq.oo...',
    '....qPPRq.....qPPRq.....',
    '...qPwRRRqsssqPwRRRq.oo.',
    '...qPRRRrq...qPRRRrqo*o.',
    '...qRRRrrqsssqRRRrrq.oo.',
    '....qRrrq.....qRrrq.....',
    '.....qqq.......qqq......',
    '........................',
    '........................',
    '........................',
    '........................',
  ]),
  // O₂ in the air: the same molecule before a pale sky with a small white cloud.
  o2_sky: [
    '.######################.',
    '#5555555555555555ii5555#',
    '#55555555555555ii@@ii55#',
    '#5555555555555i@@@@@@i5#',
    '#565656565656i@@@@@@eei#',
    '#6666qqq66666ieqqqeeeei#',
    '#666qPPRq66666qPPRqiii6#',
    '#66qPwRRRqsssqPwRRRq666#',
    '#66qPRRRrq666qPRRRrq666#',
    '#67qRRRrrqsssqRRRrrq767#',
    '#777qRrrq77777qRrrq7777#',
    '#7777qqq7777777qqq77777#',
    '#7777777777777777777777#',
    '#7777777777777777777777#',
    '#7777777777777777777777#',
    '.######################.',
  ],
};

const cell = (name) => () => K.grid(CELLS[name], { ...CELL, ...ATOMS });

/** Gold arrow pointing right, between the oxygen cells. */
const ARROW = [
  [
    '...k...',
    '...kk..',
    'kkkkAk.',
    'kAAAAgk',
    'kddddk.',
    '...kk..',
    '...k...',
  ],
  { k: 'gold0', A: 'gold5', g: 'gold3', d: 'gold2' },
];

/* -------------------------------------------------------- summary ---- */

const SUMMARY = {
  // Barometer: a round brass case, a cream dial with a scale arc over the top, a dark needle on a brass pin.
  baro: [
    [
      '.....kkkkkk.....',
      '...kkAAAAAAkk...',
      '..kAAAppppAaak..',
      '.kAAppFttFppaak.',
      '.kApFtFFFFtFpgk.',
      'kAApFFFFFFnFpggk',
      'kAptFFFFFnFFtpgk',
      'kApFFFFFnFFFFpGk',
      'kAptFFFoFFFFtpGk',
      'kApFFFnFFFFFFpGk',
      'kAApFFFFFFffpGGk',
      '.kapFFFFFfffpGk.',
      '.kaappFFffppGGk.',
      '..kaggppppGGGk..',
      '...kkggGGGGkk...',
      '.....kkkkkk.....',
    ],
    { k: 'gold0', A: 'gold5', a: 'gold4', g: 'gold3', G: 'gold2', p: 'gold1', F: 'parch5', f: 'parch3', t: 'ink1', n: 'ink0', o: 'gold3' },
  ],
  // Thermometer: glass tube with a red column into a round bulb, scale ticks; hud_temp at a larger size.
  temp: [
    [
      '.....kkkk.......',
      '....kWggsk.tt...',
      '....kWggsk......',
      '....kWggsk.t....',
      '....kWrrsk......',
      '....kWrrsk.tt...',
      '....kWrrsk......',
      '....kRrrsk.t....',
      '...kRRrrrsk.....',
      '..kRWWRrrrsk....',
      '..kRWRrrrrsk....',
      '..kRRrrrrrsk....',
      '..kRrrrrrdsk....',
      '..kRrrrrddsk....',
      '...krrdddsk.....',
      '....kkkkkk......',
    ],
    { k: 'ink1', W: 'white0', g: 'ice3', s: 'rock3', r: 'red1', R: 'orange0', d: 'red0', t: 'wood3' },
  ],
};

const mol = (name) => () => K.grid(MOL[name], { ...ATOMS, ...PUFF });
const pair = ([rows, legend]) => () => K.grid(rows, legend);

module.exports = {
  sprites: {
    air_n2: mol('n2'),
    air_co2: mol('co2'),
    air_ch4: mol('ch4'),
    air_h2o: mol('h2o'),
    air_dust: pair(DUST),
    air_fe: cell('fe'),
    air_o2_sea: cell('o2_sea'),
    air_o2_sky: cell('o2_sky'),
    air_arrow: pair(ARROW),
    air_baro: pair(SUMMARY.baro),
    air_temp: pair(SUMMARY.temp),
  },
};
