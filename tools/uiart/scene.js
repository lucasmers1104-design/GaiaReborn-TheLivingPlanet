/* =============================================================================
 * Gaia Reborn — Gaia's corner: her rock and the little signs of her moods
 * -----------------------------------------------------------------------------
 * The rock is a granite boulder in the screen's lower left corner, lit from
 * the upper left: a warm flat top where Gaia lies, a front face weathered by
 * rain streaks and split by a joint into two rounded blocks, a sheeting
 * crack, a small stone leaning at its right foot. Its four looks grow with
 * the planet, each on top of the last: 0 bare young rock with a little dust,
 * 1 first life (teal and green lichen dots), 2 mossy (moss on the ledges,
 * in the cracks and at the foot, grass tufts), 3 lush (a moss cushion over
 * the top, ferns and three small flowers at its foot). The cushion keeps to
 * the bare top's rows where Gaia lies, so `bed` (her foot anchor) sits on
 * the same surface row in every look; `root` is the crevice on the left
 * flank the vine stem grows out of.
 * Contract: tools/uiart/catalog.js (family 'scene').
 * ========================================================================== */
'use strict';

const K = require('./kit');

const W = 80;
const H = 26;

/* ------------------------------------------------------------- the rock -- */

const ROCK_LEGEND = { '#': 'ink1', k: 'rock0', d: 'rock1', m: 'rock2', l: 'rock3', h: 'rock4', w: 'sand4' };

const ROCK = [
  '................................................................................',
  '.................dddddddddddddd.................................................',
  '...........ddddddhwwhhhhhhhhhhhddddddddddddddddd................................',
  '........dddhhwwhhhhhhhhhhhhhhhhhhhhhhhhhhhhllhhhdddkkkkkkkkkk...................',
  '......ddhwhhhhhhhhhhhhhhllhhhhhhhhhhhhhhhhhhhhhhhhhhhllllmmmd###................',
  '....ddhwhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhllllmmmdd##..............',
  '...dhhhhhhhhhhhhllhhhhhhhhhhhhhhhhhhllhhhhhhhhhhhhhhhhhhhllllmmmdd##............',
  '..dhhhhhhhhhhhhhhhhhhhhhhhhhhllhhhhhhhhhhhhhhhhhkhhhhhhhhhllllmmmddk#...........',
  '..dhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhkhhhhhhhhhhhllllmmmddk#..........',
  '.dlhwwwwwwwwwwwwhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhkhhhhhhhhhhhhhllllmmmddd#.........',
  '.dlllllllmllllllllmlllllllmllllmlkllllllmmmmmdkhlllllllmllllmmdmmmddddk#........',
  '.kkllllllmllllllllmlllllllmllllmllkklllldmmmmdkhlllllllmlllmmmdmmmddddkk#.......',
  '.dhkllllllllllllllmlllllllmlllllllhhkllmdmmmmdkhlllmlllmlmmmmmdmmmddddkk#.......',
  'dllhlllllllllllllldlllllllllllllllllllmmdmmmmddkhllmmmmmmmmmmmdmmdd########.....',
  'klllllllllllllmmmmmmmmlllllllllllllmmmmmmmmmdddkhlmmmmmmmmmmmmmmd##hhhlllmm##...',
  'klllllllllllmkkkkmmmmmmmmmmmmmmmmmmmmmmmmmmddddkhmmmkkmmmmmmmmmd#hhhhllllmmmd#..',
  'kkkkllllkkkkkllllkkmmmmmmmmmmmmmmmmmmmmmmmmddddklmmmllkkmmmmmmd#hhhhlllllmmmdd#.',
  'khhhkkkkhhlllmmmmllmmmmmmmmmmmmmmmmmmmmmmdddddkklmmmmmllkmmmmd#hhhhlllllmmmddd#.',
  'klllhhhhmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmdddddkklmmmmmmmmmmmddd#hhhllllkmmmmddkk#',
  'kllllmmmmmmmmmmmmmdmmmmmmmmmmmmmmmmmmmdddddddkklmmmmmmmmmdddd#hhllllllmkmmdddkk#',
  '#mmmmmmmmmmmmmddddddddmmmmmmmmmmmmmdddddddddkkklmmddddddddddd#lllllllmmkmdddkkk#',
  '#mmmmmmmmmmmdddddddddddddddddddddddddddddddkkkklmdddddddddddd#lllllmmmmmdddkkkk#',
  '#mmmmmmmmmdddddddddddddddddddddddddddddddkkkkkmdddddddddddddk#llmmmmmmmdddkkkkk#',
  '#ddddddddddddddkkkkkkkddddddddddddddkkkkkkkkkkdddddkkkkkkkkkk#mmmmmmmddddkkkkkk#',
  '#dddddddddkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk#mmmmddddddkkkkkkk#',
  '#kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk#ddddddddkkkkkkkkk#',
];

const ROCK_TONES = K.ramp('rock');

/** Granite grain: sparse light-over-dark pixel pairs on the bare face, off the outline, cracks and highlights. */
function grain(t) {
  const out = K.copy(t);
  const step = (v) => ROCK_TONES.indexOf(v);
  for (let y = 10; y < H - 1; y++) {
    for (let x = 2; x < W - 2; x++) {
      const s = step(t.get(x, y));
      if (s < 1 || s > 3) continue;
      if (K.hash(x, y, 7) > 0.05) continue;
      const below = step(t.get(x + 1, y + 1));
      const ring = [t.get(x - 1, y), t.get(x + 1, y), t.get(x, y - 1), t.get(x, y + 1)].map(step);
      if (ring.some((r) => r < 0 || Math.abs(r - s) > 1) || below < 1) continue;
      out.set(x, y, ROCK_TONES[s + 1]);
      out.set(x + 1, y + 1, ROCK_TONES[below - 1]);
    }
  }
  return out;
}

/** Dust blown onto the young rock: specks on the ledge in front of Gaia, little drifts at its foot. */
const DUST_LEGEND = { s: 'sand2', o: 'soil3' };
const DUST_AT = [
  [6, 8, 's'], [7, 8, 's'], [19, 7, 's'], [27, 9, 's'], [28, 9, 'o'], [37, 8, 's'], [58, 9, 's'], [45, 24, 'o'],
  [10, 24, 's'], [9, 25, 'o'], [10, 25, 'o'], [11, 25, 's'], [33, 25, 's'], [32, 25, 'o'], [54, 24, 's'], [53, 25, 'o'], [54, 25, 'o'], [55, 25, 's'],
];

/* -------------------------------------------------------------- lichen -- */

const LICHEN_LEGEND = { t: 'coral0', g: 'moss3', p: 'lichen1' };
/** Crusts of the first life: teal and green, a pale rim on some. */
const LICHEN_SPOTS = {
  a: ['t'],
  c: ['g'],
  d: ['.t', 'tg'],
  e: ['gt', '.p'],
  f: ['.tt', 'tgp'],
  g: ['pt.', 'ttg'],
  h: ['tg'],
};
const LICHEN_AT = [
  [4, 10, 'f'], [12, 12, 'c'], [20, 11, 'd'], [8, 14, 'a'], [14, 17, 'e'], [29, 13, 'h'], [36, 10, 'c'], [41, 14, 'g'],
  [49, 11, 'd'], [57, 13, 'a'], [68, 14, 'f'], [64, 18, 'c'], [4, 6, 'h'], [60, 6, 'c'], [24, 20, 'a'], [6, 20, 'g'],
  [52, 20, 'a'], [73, 17, 'a'], [33, 17, 'd'], [38, 21, 'c'], [26, 15, 'a'],
];

/* ---------------------------------------------------------------- moss -- */

/** A mask of moss: rows of [y, x0, x1] spans. */
function maskOf(spans) {
  const m = new Uint8Array(W * H);
  for (const [y, x0, x1] of spans) for (let x = x0; x <= x1; x++) if (x >= 0 && x < W && y >= 0 && y < H) m[y * W + x] = 1;
  return m;
}

/**
 * Moss over the mask: lit top edge, dark underside, a soft dappled middle;
 * `rampAt(x, y)` picks the ramp [dark, shade, mid, light, top] per pixel.
 */
function paintMoss(t, m, rampAt, seed) {
  const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && m[y * W + x] === 1;
  t.each((x, y) => {
    if (!at(x, y)) return undefined;
    const [dark, d, mid, l, top] = rampAt(x, y);
    if (!at(x, y + 1) && y < H - 1) return K.c(dark);
    if (!at(x, y - 1)) return K.c(x < 50 ? top : l);
    if (!at(x + 1, y) || !at(x, y + 2)) return K.c(d);
    if (!at(x - 1, y)) return K.c(l);
    return K.c(K.hash(x >> 1, y, seed) < 0.3 ? l : mid);
  });
  return t;
}

const MOSS_RAMP = ['moss0', 'moss1', 'moss2', 'moss3', 'meadow3'];
/** The cushion: its top seen from above is lit, its drapes over the lip face the viewer and sit a step darker. */
const CUSHION_TOP = ['meadow0', 'meadow1', 'meadow2', 'meadow3', 'vine5'];
const CUSHION_DRAPE = ['vine1', 'meadow0', 'meadow1', 'meadow2', 'meadow2'];
const LIP = 9;

/** Mossy: moss on the ledges, in the cracks, on the stone and at the foot. */
const MOSS = [
  // the lip and the left shoulder
  [6, 3, 8], [7, 2, 11], [8, 2, 13], [9, 1, 12], [10, 5, 7], [11, 6, 6],
  [8, 20, 26], [9, 19, 27], [10, 22, 24],
  [8, 51, 57], [9, 50, 58], [10, 53, 55], [11, 54, 54],
  // the sheeting crack's lip and the joint
  [17, 13, 17], [18, 4, 8], [17, 8, 12],
  [22, 45, 46], [23, 44, 46], [24, 43, 47], [25, 42, 48],
  // the small stone's cap
  [13, 67, 73], [14, 65, 74], [15, 65, 69],
  // at the foot
  [22, 3, 5], [22, 7, 8], [23, 1, 11], [24, 0, 13], [25, 0, 14],
  [23, 28, 30], [23, 32, 34], [24, 27, 36], [25, 26, 37],
  [22, 51, 53], [22, 55, 56], [23, 50, 58], [24, 49, 60], [25, 49, 61],
];

/** Where the lush cushion bulges above the bare top, [x0, x1, rows]: only beside Gaia's body, never under it. */
const CUSHION_BULGE = [[5, 16, 2], [56, 63, 1]];
/** Its drapes over the lip, [x0, x1, longest tongue in rows]. */
const CUSHION_DRAPES = [[1, 9, 2], [13, 20, 1], [24, 33, 2], [37, 44, 1], [49, 58, 2], [62, 69, 1]];
const arch = (x, x0, x1, n) => n * Math.sin((Math.PI * (x - x0 + 0.5)) / (x1 - x0 + 1));

/** The lush cushion: the bare top's own rows down to the lip in every column, bulges and drapes added. */
function cushionMask() {
  const bare = K.grid(ROCK, ROCK_LEGEND);
  const m = new Uint8Array(W * H);
  for (let x = 0; x < W; x++) {
    let top = -1;
    for (let y = 0; y <= LIP && top < 0; y++) if (bare.get(x, y)) top = y;
    if (top < 0) continue;
    let lift = 0;
    for (const [x0, x1, n] of CUSHION_BULGE) if (x >= x0 && x <= x1) lift = Math.round(arch(x, x0, x1, n));
    for (let y = Math.max(0, top - lift); y <= LIP; y++) m[y * W + x] = 1;
  }
  for (const [x0, x1, n] of CUSHION_DRAPES) {
    for (let x = x0; x <= x1; x++) {
      const len = Math.max(1, Math.round(arch(x, x0, x1, n) + 0.3));
      for (let y = LIP + 1; y <= LIP + len; y++) m[y * W + x] = 1;
    }
  }
  return m;
}

/** A dark rim where the cushion rises above the bare silhouette. */
function rimAbove(t, m, col) {
  const v = K.c(col);
  const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && m[y * W + x] === 1;
  for (let y = 0; y <= LIP; y++) {
    for (let x = 0; x < W; x++) {
      if (t.get(x, y) || at(x, y)) continue;
      if (at(x, y + 1) || at(x - 1, y) || at(x + 1, y)) t.set(x, y, v);
    }
  }
  return t;
}
const LUSH_MOSS = [
  [17, 12, 18], [18, 3, 9], [17, 8, 12], [16, 1, 3],
  [17, 46, 48], [18, 45, 48], [19, 45, 48], [20, 44, 48], [21, 44, 47], [22, 43, 47], [23, 42, 47], [24, 41, 48], [25, 40, 49],
  [13, 66, 74], [14, 64, 76], [15, 63, 72], [16, 63, 66],
  [21, 4, 6], [21, 8, 9], [22, 2, 12], [23, 0, 14], [24, 0, 16], [25, 0, 18],
  [22, 28, 30], [22, 32, 33], [23, 26, 36], [24, 24, 38], [25, 23, 39],
  [21, 52, 53], [21, 55, 55], [22, 50, 58], [23, 49, 60], [24, 48, 61], [25, 48, 62],
];

/* ----------------------------------------------- tufts, ferns, flowers -- */

const PLANT_LEGEND = { a: 'meadow3', b: 'meadow2', c: 'meadow1', e: 'meadow0', f: 'vine4', g: 'vine3', i: 'vine2', j: 'vine1', w: 'white0', y: 'petalY2', p: 'petal2', q: 'petal3' };

/** Grass tufts, foot at the bottom row. */
const TUFT = [
  ['a...a', '.b.b.', 'cbbc.', 'ecce.'],
  ['..a..', 'a.b.a', '.bbc.', '.ece.'],
  ['a.a', 'bcb', 'ece'],
];
const TUFT_AT = [[9, 21, 0], [31, 22, 1], [53, 21, 0], [60, 24, 2], [17, 16, 2], [70, 12, 2]];

/** Ferns: fronds arching out of a clump, lit on their upper left. */
const FERN = [
  [
    '......f.......',
    '.....fg.......',
    '..ff.fg..ff...',
    '.fggf.fgifggf.',
    'fg..ifggig..gf',
    'f.igifggiigi.g',
    '..igiigigjigi.',
    '...i.igiij.i..',
    '.....iigjj....',
  ],
  [
    '....f......',
    '.ff.fg..ff.',
    'fggf.fgifgg',
    'g..ifggig.f',
    '.igifggiigi',
    '..igiigijg.',
    '...iigijj..',
  ],
];
const FERN_AT = [[0, 17, 0], [50, 19, 1]];

const FLOWER = [
  ['.w.', 'wyw', '.w.'],
  ['.q.', 'qyq', '.q.'],
];
const FLOWER_AT = [[11, 19, 0], [57, 20, 1], [37, 22, 0]];

function stampAll(t, list, shapes, legend) {
  for (const [x, y, k] of list) t.stamp(K.grid(shapes[k], legend), x, y);
  return t;
}

function tufts(t) {
  for (const [x, y, k] of TUFT_AT) {
    const g = K.grid(TUFT[k], PLANT_LEGEND);
    t.stamp(g, x - (g.w >> 1), y - g.h + 1);
  }
  return t;
}

/** Look 0 bare, 1 lichen, 2 mossy, 3 lush; each look keeps what the last one grew. */
function rock(look, s) {
  let t = new K.Tex(s.w, s.h);
  t.stamp(K.grid(ROCK, ROCK_LEGEND), 0, 0);
  t = grain(t);
  if (look === 0) {
    for (const [x, y, k] of DUST_AT) K.put(t, x, y, DUST_LEGEND[k]);
    return t;
  }
  stampAll(t, LICHEN_AT, LICHEN_SPOTS, LICHEN_LEGEND);
  if (look === 1) return t;
  if (look === 2) return tufts(paintMoss(t, maskOf(MOSS), () => MOSS_RAMP, 3));
  paintMoss(t, maskOf(LUSH_MOSS), () => MOSS_RAMP, 5);
  const cushion = cushionMask();
  paintMoss(t, cushion, (x, y) => (y <= LIP ? CUSHION_TOP : CUSHION_DRAPE), 9);
  rimAbove(t, cushion, 'vine1');
  tufts(t);
  stampAll(t, FERN_AT, FERN, PLANT_LEGEND);
  return stampAll(t, FLOWER_AT, FLOWER, PLANT_LEGEND);
}

/* ----------------------------------------------------------- the signs -- */

const Z_LEGEND = { z: 'ice4', b: 'ice2' };
const Z_SMALL = ['zzz', '.z.', 'z..', 'bbb'];
const Z_BIG = ['zzzz', '..z.', '.z..', 'bbbb'];
/** [glyph, inner top left, rimmed, dithered share]: born small low left, grows, drifts up right, loses its rim, dithers away. */
const Z_FRAMES = [[Z_SMALL, 1, 2, true, 0], [Z_BIG, 2, 2, true, 0], [Z_BIG, 2, 1, false, 0], [Z_SMALL, 3, 1, false, 0.3]];

function zzz(f, s) {
  const [glyph, x, y, rim, fade] = Z_FRAMES[f];
  const t = new K.Tex(s.w, s.h);
  t.stamp(K.grid(glyph, Z_LEGEND), x, y);
  if (rim) K.outline(t, 'water2');
  return K.dissolve(t, fade, 5);
}

const TEAR_LEGEND = { o: 'water3', b: 'water6', w: 'ice4' };
/** A bead wells up, rounds, grows a tip and falls. */
const TEAR = [
  ['...', '...', '.w.', '.b.', '...'],
  ['...', '...', 'wbb', 'bbo', '.o.'],
  ['...', '.b.', 'wbb', 'bbo', '.o.'],
  ['.b.', '.b.', 'wbb', 'bbo', '.o.'],
];
const tear = (f) => K.grid(TEAR[f], TEAR_LEGEND);

const SWEAT_LEGEND = { d: 'water4', b: 'ice2', w: 'ice4' };
/** A pale drop at her temple: appears, swells, runs off thinner. */
const SWEAT = [
  ['.w.', 'wbd', '.d.', '...', '...'],
  ['.w.', '.w.', 'wbb', 'bbd', '.d.'],
  ['...', '.w.', '.b.', 'wbd', '.d.'],
];
const sweat = (f) => K.grid(SWEAT[f], SWEAT_LEGEND);

const SPARK_LEGEND = { w: 'parch5', y: 'gold5', g: 'gold3' };
const SPARKLE = [
  ['.......', '.......', '...y...', '..ywy..', '...y...', '.......', '.......'],
  ['.......', '...y...', '...w...', '.ywwwy.', '...w...', '...y...', '.......'],
  ['...g...', '...y...', '..ywy..', 'gywwwyg', '..ywy..', '...y...', '...g...'],
  ['.......', '...g...', '...y...', '.gywyg.', '...y...', '...g...', '.......'],
];
const sparkle = (f) => K.grid(SPARKLE[f], SPARK_LEGEND);

const HEART_LEGEND = { o: 'petal0', p: 'petal1', l: 'petal2', h: 'petal4' };
/** Pops: small, big with a flash of light, big. */
const HEART = [
  ['.......', '..o.o..', '.ohlpo.', '..opo..', '...o...', '.......'],
  ['.oo.oo.', 'ohhohlo', 'ohllllo', '.ollpo.', '..olo..', '...o...'],
  ['.oo.oo.', 'ohlollo', 'ollllpo', '.ollpo.', '..opo..', '...o...'],
];
const heart = (f) => K.grid(HEART[f], HEART_LEGEND);

module.exports = { sprites: { rock, zzz, tear, sweat, sparkle, heart } };
