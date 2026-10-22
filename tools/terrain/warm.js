/* =============================================================================
 * SimEarth 2.0 — terrain recipes, family "warm"
 * -----------------------------------------------------------------------------
 * Sand, stony desert, semi-desert on sand and on rock, savanna and the
 * rainforest floor; cycads, rainforest giants, understory palms, umbrella trees, baobabs, tree ferns,
 * columnar, barrel and prickly-pear cacti, thorn bushes and tall grass. Ids and ranks are fixed in catalog.js.
 *
 *   materials[id](t, d)   paint the seamless texture `t` (Tex, wraps) for density d
 *   objects[id](v)        return a sprite; v = { index, size, form } (trees) or { index }
 * ========================================================================== */
'use strict';

const k = require('./kit');

const c = k.c;

/* --------------------------------------------------------------- helpers -- */

/**
 * Jittered points on a grid of `step` px over a `size` texture; each point
 * carries rolls `r` and `s` in 0..1. Densities keep a point while r < cover,
 * so a denser texture is a superset of the sparser one. `step` must divide
 * `size`, or points crowd at the wrap and the seam shows.
 */
function scatter(size, step, seed) {
  const out = [];
  for (let gy = 0; gy < size; gy += step) {
    for (let gx = 0; gx < size; gx += step) {
      out.push({
        x: gx + Math.floor(k.hash(gx, gy, seed) * step),
        y: gy + Math.floor(k.hash(gx, gy, seed + 1) * step),
        r: k.hash(gx, gy, seed + 2),
        s: k.hash(gx, gy, seed + 3),
      });
    }
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Stamp a motif drawn as character rows with its bottom-left foot at (x, y),
 * wrapping. `key` maps a character to a palette name; '.' is skipped.
 */
function motif(t, rows, key, x, y) {
  const h = rows.length;
  rows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      const ch = row[rx];
      if (ch === '.' || ch === ' ') continue;
      const px = x + rx;
      const py = y - (h - 1) + ry;
      t.set(px, py, c(key[ch]));
    }
  });
}

/** Threshold below which `share` of the texture's field values lie. */
function quantile(f, size, share) {
  const vals = [];
  for (let y = 0; y < size; y += 2) for (let x = 0; x < size; x += 2) vals.push(f(x, y));
  vals.sort((a, b) => a - b);
  return vals[Math.min(vals.length - 1, Math.floor(share * vals.length))];
}

/** Wrapped boolean mask from a predicate. */
function mask(size, pred) {
  const m = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) m[y * size + x] = pred(x, y) ? 1 : 0;
  return (x, y) => m[(((y % size) + size) % size) * size + (((x % size) + size) % size)] === 1;
}

/** Two-tone ground from periodic noise, `share` of it in the first tone, without lone pixels. */
function mottle(t, cells, seed, share, a, b) {
  const n = k.fbm(t.w, cells, 3, seed);
  const cut = quantile(n, t.w, share);
  t.each((x, y) => c(n(x, y) < cut ? a : b));
  clean(t);
}

/** Replace a pixel sitting alone in a uniform 8-neighbourhood — no single-pixel noise. */
function clean(t) {
  const src = Uint8Array.from(t.px);
  const at = (x, y) => src[t.at(x, y)];
  for (let y = 0; y < t.h; y++) {
    for (let x = 0; x < t.w; x++) {
      const n = at(x - 1, y - 1);
      if (n === at(x, y)) continue;
      let uniform = true;
      for (let dy = -1; dy <= 1 && uniform; dy++) {
        for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && at(x + dx, y + dy) !== n) { uniform = false; break; }
      }
      if (uniform) t.set(x, y, n);
    }
  }
}

/* ---------------------------------------------------------- ground motifs -- */

// Stones: L light, M mid, D dark, s shadow on the ground (lower right).
const STONES = [
  ['LD'],
  ['LM.', 'MDs'],
  ['.LM.', 'LMMD', '.DDs'],
  ['.LLM.', 'LMMDD', '.DDDs'],
  ['.LLLM.', 'LMMMMD', '..DDDs'],
];

// Dry grass tufts: L lit tips, M blades, D shaded blades, s shadow.
const TUFTS = [
  ['L.L.', 'MLM.', 'DMDs'],
  ['L..L.', '.LML.', 'DMMMD', '.sss.'],
  ['.L..L.', 'L.LM.L', '.MLMM.', 'DMMMMD', '.ssss.'],
];

// Low olive scrub cushions.
const SCRUB = [
  ['.LM.', 'LMMD', 'MDDs', '.ss.'],
  ['.LLM.', 'LMMMD', 'MMDDD', '.sss.'],
];

/* ------------------------------------------------------------- materials -- */

/** Hamada: pale gravel plain, dense brown pebbles, scattered grey and varnished stones. */
function stonyDesert(t) {
  const S = t.w;
  mottle(t, 8, 301, 0.42, 'sand3', 'sand2');
  const pebble = { L: 'sand1', D: 'sand0' };
  for (const p of scatter(S, 4, 302)) if (p.r < 0.55) motif(t, STONES[0], pebble, p.x, p.y);
  const grey = { L: 'rock4', M: 'rock3', D: 'rock2', s: 'sand1' };
  const red = { L: 'laterite2', M: 'laterite2', D: 'laterite1', s: 'sand1' };
  for (const p of scatter(S, 8, 303)) {
    if (p.r > 0.7) continue;
    const big = p.s < 0.15 ? 4 : p.s < 0.35 ? 3 : p.s < 0.65 ? 2 : 1;
    motif(t, STONES[big], p.r < 0.1 ? red : grey, p.x, p.y);
  }
}

/** Sand sea: long dunes with a lit windward side, a crisp crest and a shaded lee; ripples. */
function sandSea(t) {
  const S = t.w;
  const warp = k.fbm(S, 4, 3, 911);
  const warp2 = k.fbm(S, 8, 2, 913);
  const field = k.fbm(S, 4, 2, 917);
  t.each((x, y) => {
    const p = (x + 3 * y) / S + (warp(x, y) - 0.5) * 1.1;
    const f = p - Math.floor(p);
    if (f > 0.84) return c('sand2');
    if (f > 0.78) return c('sand4');
    if (f < 0.66 && field(x, y) > 0.5) {
      const q = (2 * x + 20 * y) / S + (warp2(x, y) - 0.5) * 1.6;
      const g = q - Math.floor(q);
      if (g < 0.16) return c('sand2');
    }
    return c('sand3');
  });
  clean(t);
}

/** Semi-desert: tufts and scrub on a ground; `look` sets the substrate. */
function semidesert(t, d, look) {
  const S = t.w;
  mottle(t, 16, look.seed, look.share, look.ground[0], look.ground[1]);
  for (const g of look.grain || []) {
    for (const p of scatter(S, g.step, look.seed + 5)) if (p.r < g.chance) motif(t, g.rows, g.key, p.x, p.y);
  }
  for (const p of scatter(S, 8, look.seed + 7)) {
    if (p.r < look.stones) motif(t, STONES[p.s < 0.45 ? 1 : p.s < 0.8 ? 2 : 3], look.stone, p.x, p.y);
  }
  const cover = [0.14, 0.27, 0.42][d];
  for (const p of scatter(S, 4, look.seed + 11)) {
    if (p.r > cover) continue;
    if (p.s < 0.2) motif(t, SCRUB[p.s < 0.08 ? 1 : 0], look.scrub, p.x, p.y);
    else motif(t, TUFTS[p.s < 0.5 ? 0 : p.s < 0.8 ? 1 : 2], look.tuft, p.x, p.y);
  }
  clean(t);
}

/**
 * Savanna: golden to olive grass from edge to edge, no bare earth. A denser
 * cover is greener and thicker with tufts; a sparse one drier, with darker
 * dry spots in the grass.
 */
function savanna(t, d) {
  const S = t.w;
  mottle(t, 16, 341, 0.4, 'straw1', 'straw2');
  // Broad olive drifts where the grass stays greener.
  const olive = k.fbm(S, 4, 2, 347);
  const oliveCut = quantile(olive, S, [0.15, 0.25, 0.35][d]);
  const greener = { [c('straw1')]: c('moss2'), [c('straw2')]: c('moss3') };
  t.each((x, y) => (olive(x, y) < oliveCut ? greener[t.get(x, y)] : undefined));
  // Dry spots: short, darker grass between the clumps.
  const dry = k.fbm(S, 16, 3, 343);
  const dryCut = quantile(dry, S, [0.14, 0.06, 0][d]);
  t.each((x, y) => (dry(x, y) < dryCut && olive(x, y) >= oliveCut ? c('straw0') : undefined));
  // Tufts all over: lit tips, blades, shaded blades.
  const gold = { L: 'straw3', M: 'straw2', D: 'straw1', s: 'straw0' };
  const green = { L: 'moss3', M: 'moss2', D: 'moss1', s: 'moss1' };
  for (const p of scatter(S, 4, 348)) {
    if (p.r < [0.35, 0.45, 0.55][d]) motif(t, TUFTS[p.s < 0.45 ? 0 : p.s < 0.85 ? 1 : 2], olive(p.x, p.y) < oliveCut ? green : gold, p.x, p.y);
  }
  clean(t);
}

// Rainforest understory seen from above: broad leaves (L lit, M leaf, D shaded leaf) over
// their own shade on the humus (s).
const UNDERSTORY = [
  ['.LL..', 'LMMD.', 'MMDDs', '.Dss.'],
  ['..L...', '.LMM.L', 'LMMDMD', 'MDDsDs', '.ss.s.'],
  ['.L..', 'LMM.', 'MDDs', '.ss.'],
  ['..LL..', '.LMMD.', 'LMDMMD', 'MDsDDs', '.s..s.'],
];
// Fern fans and seedlings catching a fleck of the light that falls through the canopy.
const FERNS = [
  ['L..L..L', '.M.L.M.', '..MLM..', 'DMMLMMD', '.DDsDD.'],
  ['.L.L.', 'MMLMM', '.DMDs'],
];

/**
 * Rainforest floor: dark wet humus like the forest floor next door, a little
 * leaf litter, and a deep green understory of broad leaves in drifts with
 * fern fans where light falls through; the denser step has more of all three.
 */
function rainforest(t, d) {
  const S = t.w;
  const hollow = k.fbm(S, 16, 2, 351);
  const bayer = (x, y) => (k.BAYER4[y & 3][x & 3] + 0.5) / 16;
  t.each((x, y) => c(hollow(x, y) + (bayer(x, y) - 0.5) * 0.08 < 0.45 ? 'soil0' : 'soil1'));
  const litter = { L: 'soil2' };
  for (const p of scatter(S, 8, 355)) {
    if (p.r < 0.6) motif(t, p.s < 0.4 ? ['LL'] : p.s < 0.7 ? ['L', 'L'] : ['L.', '.L'], litter, p.x, p.y);
  }
  // The understory grows in drifts; in them the ground lies in deep green shade.
  const lush = k.fbm(S, 8, 3, 353);
  const cut = quantile(lush, S, [0.45, 0.65][d]);
  t.each((x, y) => (lush(x, y) + (bayer(x, y) - 0.5) * 0.1 < cut - 0.03 ? c('jungle0') : undefined));
  const deep = { L: 'jungle2', M: 'jungle1', D: 'jungle0', s: 'jungle0' };
  const open = { L: 'jungle2', M: 'jungle1', D: 'jungle0', s: 'soil0' };
  for (const p of scatter(S, 4, 356)) {
    const inside = lush(p.x, p.y) < cut;
    if (p.r < (inside ? 0.85 : [0.08, 0.16][d])) motif(t, UNDERSTORY[Math.floor(p.s * UNDERSTORY.length)], inside ? deep : open, p.x - 2, p.y);
  }
  const fern = { L: 'jungle3', M: 'jungle2', D: 'jungle1', s: 'jungle0' };
  for (const p of scatter(S, 8, 357)) {
    if (p.r < [0.25, 0.4][d]) motif(t, FERNS[p.s < 0.6 ? 0 : 1], fern, p.x - 3, p.y);
  }
  clean(t);
}

const materials = {
  stony_desert: (t) => stonyDesert(t),
  sand: (t) => sandSea(t),
  semidesert_rock: (t, d) => semidesert(t, d, {
    seed: 321,
    ground: ['sand1', 'sand2'],
    share: 0.35,
    stones: 0.6,
    stone: { L: 'rock3', M: 'rock3', D: 'rock2', s: 'sand1' },
    tuft: { L: 'straw3', M: 'straw2', D: 'straw1', s: 'sand1' },
    scrub: { L: 'moss2', M: 'moss2', D: 'moss1', s: 'sand1' },
  }),
  semidesert_sand: (t, d) => semidesert(t, d, {
    seed: 331,
    ground: ['sand4', 'sand3'],
    share: 0.45,
    grain: [{ step: 4, chance: 0.25, rows: ['DD'], key: { D: 'sand2' } }],
    stones: 0,
    stone: {},
    tuft: { L: 'straw3', M: 'straw2', D: 'straw1', s: 'sand2' },
    scrub: { L: 'moss3', M: 'moss2', D: 'moss1', s: 'sand2' },
  }),
  savanna: (t, d) => savanna(t, d),
  rainforest: (t, d) => rainforest(t, d),
};

/* --------------------------------------------------------------- objects -- */

/** A hand-drawn sprite; every row must have the same width. */
function sprite(rows, key) {
  const w = rows[0].length;
  rows.forEach((r, i) => { if (r.length !== w) throw new Error(`warm sprite row ${i}: width ${r.length}, expected ${w}`); });
  return k.grid(rows, key);
}

/**
 * A crown of overlapping leaf clumps [cx, cy, r], each lit from its own upper
 * left; a later clump lies in front of an earlier one, so every clump keeps a
 * shaded seam where the next one covers it. `tone` = [outline, shade, leaf, lit].
 */
function clumps(t, list, tone, squash = 1) {
  const own = new Int8Array(t.w * t.h).fill(-1);
  list.forEach(([cx, cy, r], n) => {
    for (let y = 0; y < t.h; y++) {
      for (let x = 0; x < t.w; x++) if (Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) / squash) <= r) own[y * t.w + x] = n;
    }
  });
  const at = (x, y) => (x < 0 || y < 0 || x >= t.w || y >= t.h ? -1 : own[y * t.w + x]);
  t.each((x, y) => {
    const n = at(x, y);
    if (n < 0) return undefined;
    const [cx, cy, r] = list[n];
    if (at(x + 1, y) < 0 || at(x, y + 1) < 0) return c(tone[0]);
    if (at(x, y + 1) !== n || at(x + 1, y) > n) return c(tone[1]);
    if (at(x - 1, y) < 0 || at(x, y - 1) < 0) return c(tone[1]);
    const l = -(((x + 0.5 - cx) / r) * 0.6 + ((y + 0.5 - cy) / (r * squash)) * 0.8);
    return c(l > 0.35 ? tone[3] : l > -0.25 ? tone[2] : tone[1]);
  });
}

/**
 * A straight trunk `w` px wide from row `top` to the foot, lit on its left,
 * and buttress roots flaring out over its last `flare` rows.
 */
function bole(t, x0, w, top, flare, [lit, mid, dark]) {
  const foot = t.h - 1;
  for (let y = top; y <= foot; y++) {
    for (let i = 0; i < w; i++) {
      if (t.get(x0 + i, y) === 0) t.set(x0 + i, y, c(i === 0 ? lit : i === w - 1 ? dark : mid));
    }
  }
  for (let s = 1; s <= flare; s++) {
    const y = foot - flare + s;
    t.set(x0 - s, y, c(lit));
    t.set(x0 - s + 1, y, c(mid));
    t.set(x0 + w - 1 + s, y, c(dark));
    t.set(x0 + w - 2 + s, y, c(mid));
  }
}

// Rainforest giants, two kinds of canopy tree. Form 0: a broad, flat umbrella of
// dark leaf clumps on a pale trunk with wide buttress roots. Form 1: a taller,
// rounder crown of clumps in a lighter green with sunlit tops, on a brown trunk.
const GIANT = {
  0: {
    tone: ['jungle0', 'jungle1', 'jungle2', 'jungle3'], bark: ['rock3', 'rock2', 'rock1'], squash: 0.8,
    s: { clumps: [[2.5, 3.4, 2.4], [5, 2.6, 2.6], [7.5, 3.4, 2.4], [3.8, 5, 2.2], [6.4, 5, 2.2]], trunk: [4, 2, 6, 2] },
    m: { clumps: [[2.6, 4.2, 2.6], [6.5, 3.2, 3], [10.4, 4.2, 2.6], [4.4, 6.2, 2.8], [8.6, 6.2, 2.8]], trunk: [6, 2, 8, 3] },
    l: { clumps: [[3, 4.6, 3], [8, 3.4, 3.4], [13, 4.6, 3], [5.3, 7, 3.2], [10.7, 7, 3.2], [8, 8.4, 2.6]], trunk: [7, 2, 10, 4] },
  },
  1: {
    tone: ['leaf0', 'leaf1', 'leaf2', 'meadow2'], bark: ['bark2', 'bark1', 'bark0'], squash: 1,
    s: { clumps: [[5, 2.2, 2], [3, 4.2, 2.2], [7, 4.2, 2.2], [5, 6, 2.3]], trunk: [4, 2, 8, 1] },
    m: { clumps: [[6.5, 2.6, 2.4], [3.8, 4.8, 2.6], [9.2, 4.8, 2.6], [6.5, 7, 2.8], [3, 8.6, 2.2], [10, 8.6, 2.2]], trunk: [6, 2, 10, 2] },
    l: { clumps: [[8, 2.8, 2.8], [4.8, 5.2, 3], [11.2, 5.2, 3], [8, 7.6, 3.2], [3.4, 9.4, 2.8], [12.6, 9.4, 2.8], [8, 11, 2.6]], trunk: [7, 2, 12, 3] },
  },
};

function giant(v) {
  const kind = GIANT[v.form];
  const spec = kind[v.size];
  const [w, h] = { s: [10, 13], m: [13, 17], l: [16, 20] }[v.size];
  const t = new k.Tex(w, h);
  clumps(t, spec.clumps, kind.tone, kind.squash);
  const [x0, tw, top, flare] = spec.trunk;
  bole(t, x0, tw, top, flare, kind.bark);
  return t;
}

/**
 * A palm frond: an arching midrib from the crown (x0, y0) to its tip, lifted
 * by `lift`, with leaflets hanging under it (longest mid-frond). `tone` =
 * [midrib, leaflet, leaflet tip].
 */
function frond(t, x0, y0, x1, y1, lift, tone) {
  const mx = (x0 + x1) / 2;
  const my = Math.min(y0, y1) - lift;
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    const x = Math.round((1 - u) ** 2 * x0 + 2 * u * (1 - u) * mx + u * u * x1);
    const y = Math.round((1 - u) ** 2 * y0 + 2 * u * (1 - u) * my + u * u * y1);
    t.set(x, y, c(tone[0]));
    if (u > 0.2 && u < 0.95 && t.get(x, y + 1) === 0) t.set(x, y + 1, c(tone[1]));
    if (u > 0.35 && u < 0.8 && (x + y) % 2 === 0 && t.get(x, y + 2) === 0) t.set(x, y + 2, c(tone[2]));
  }
}

// Understory palm (the flowering plants' form in the rainforest): pinnate fronds arching out of a short,
// thin ringed trunk; young it is a shuttlecock of fronds straight out of the ground. Fronds back to front:
// [tipX, tipY, lift, lit] in a box of [w, h], the crown at (cx, cy), the trunk from the crown to the foot.
const PALM = [
  { w: 10, h: 8, cx: 5, cy: 7, fronds: [[1, 1, 1, 1], [8, 1, 1, 0], [0, 5, 2, 1], [9, 5, 2, 0], [4, 0, 0, 1], [6, 3, 0, 0]] },
  { w: 13, h: 12, cx: 6, cy: 7, fronds: [[2, 1, 2, 1], [10, 1, 2, 0], [0, 7, 3, 1], [12, 7, 3, 0], [6, 0, 0, 1], [3, 10, 2, 1], [10, 10, 2, 0]] },
  { w: 16, h: 16, cx: 8, cy: 6, fronds: [[3, 0, 2, 1], [12, 0, 2, 0], [0, 6, 4, 1], [15, 6, 4, 0], [8, 0, 0, 1], [1, 11, 3, 1], [15, 11, 3, 0], [5, 10, 2, 1], [11, 10, 2, 0]] },
];
const PALM_LIT = ['leaf3', 'leaf2', 'leaf1'];
const PALM_SHADE = ['leaf2', 'leaf1', 'leaf0'];

function junglePalm(v) {
  const p = PALM[v.index];
  const t = new k.Tex(p.w, p.h);
  for (let y = p.cy + 1; y < p.h; y++) {
    t.set(p.cx, y, c(y % 2 ? 'bark2' : 'bark1'));
    t.set(p.cx + 1, y, c('bark0'));
  }
  for (const [x, y, lift, lit] of p.fronds) frond(t, p.cx + 0.5, p.cy, x, y, lift, lit ? PALM_LIT : PALM_SHADE);
  t.set(p.cx, p.cy, c('leaf1'));
  t.set(p.cx + 1, p.cy, c('leaf0'));
  return t;
}

// Umbrella thorn: flat, wide crown seen a little from above, dark underside, thin forked trunk.
const ACACIA_KEY = { 0: 'leaf0', 1: 'leaf1', 2: 'leaf2', 3: 'leaf3', B: 'bark1', b: 'bark0' };
const ACACIA = {
  l0: [
    '....11111110....',
    '..1133333332210.',
    '.133333222222110',
    '1233322223222210',
    '0112111211121100',
    '.00..b.00b0..b0.',
    '......b..b..b...',
    '.......b..b.b...',
    '........b.bb....',
    '.........bBb....',
    '..........Bb....',
    '..........Bb....',
    '.........Bb.....',
    '.........Bb.....',
    '.........Bb.....',
    '........Bb......',
    '........Bb......',
    '........Bb......',
    '.......Bb.......',
    '......BBbb......',
  ],
  l1: [
    '.....11111110...',
    '...113333332210.',
    '..13333322222210',
    '..12232222232110',
    '..11121111211110',
    '.11110000b0000..',
    '13333220.b......',
    '12222110.b......',
    '.000b00..b......',
    '.....b...b......',
    '......b.Bb......',
    '.......bBb......',
    '.......Bb.......',
    '.......Bb.......',
    '.......Bb.......',
    '.......Bb.......',
    '........Bb......',
    '........Bb......',
    '........Bb......',
    '.......BBbb.....',
  ],
  m0: [
    '...1111110...',
    '.11333332210.',
    '1333322222210',
    '0112111211110',
    '.00b000b0000.',
    '....b...b....',
    '.....b..b....',
    '......bBb....',
    '.......Bb....',
    '.......Bb....',
    '......Bb.....',
    '......Bb.....',
    '......Bb.....',
    '......Bb.....',
    '.....Bb......',
    '.....Bb......',
    '....BBbb.....',
  ],
  m1: [
    '....1111110..',
    '..11333332210',
    '.133332222210',
    '.012211121110',
    '.0b000000b00.',
    '..b......b...',
    '..b.....b....',
    '...b...b.....',
    '...b..b......',
    '....Bbb......',
    '....Bb.......',
    '....Bb.......',
    '.....Bb......',
    '.....Bb......',
    '.....Bb......',
    '......Bb.....',
    '.....BBbb....',
  ],
  s0: [
    '..111110..',
    '.133332210',
    '1332222210',
    '0112112110',
    '.00b00b00.',
    '...b..b...',
    '....bb....',
    '....Bb....',
    '....Bb....',
    '....Bb....',
    '....Bb....',
    '....Bb....',
    '...BBbb...',
  ],
  s1: [
    '.111110...',
    '1333332110',
    '0122222210',
    '.00b0010b0',
    '...b...b..',
    '....b.b...',
    '.....b....',
    '.....Bb...',
    '.....Bb...',
    '....Bb....',
    '....Bb....',
    '....Bb....',
    '...BBbb...',
  ],
};

// Cycad: stiff pinnate fronds (upright vase or arching rosette), a golden cone, a stout scaly trunk.
const CYCAD_KEY = { 0: 'leaf0', 1: 'leaf1', 2: 'leaf2', 3: 'leaf3', B: 'bark1', b: 'bark0', s: 'soil2', c: 'straw0', C: 'straw1' };
const CYCAD = {
  l0: [
    '.......32.......',
    '.332..332...321.',
    '...32..321.32...',
    '..332.332..321..',
    '....32.32.32....',
    '...332.32.321...',
    '.....322232.....',
    '.33.33222321.22.',
    '3223232223212111',
    '1.12322Cc22110.0',
    '...1232cc2110...',
    '..332221112110..',
    '.21...bbbb...10.',
    '......sBBb......',
    '......BsBb......',
    '......sBBb......',
    '......BsBb......',
    '......sBBb......',
    '......BsBb......',
    '.....BsBBbb.....',
  ],
  l1: [
    '................',
    '................',
    '.32..32..1..321.',
    '32321.3..2132121',
    '2132..2211..2112',
    '2..321321.321..2',
    '...32..22..21...',
    '....32121321....',
    '..333222112122..',
    '.322222Cc112112.',
    '32.1.22cc1110.12',
    '21...322110...01',
    '....32bbbb10....',
    '....2.sBBBb1....',
    '......BsBBb.....',
    '......sBsBb.....',
    '......BsBbb.....',
    '.....sBBsBb.....',
    '.....BsBBbb.....',
    '....BBsBsbbb....',
  ],
  m0: [
    '......32.....',
    '.32..332..21.',
    '..32..321.32.',
    '.332.332.321.',
    '...32.32.32..',
    '..332.32321..',
    '.33.3222321..',
    '3223222221211',
    '1.1232Cc21100',
    '..3322cc1110.',
    '.21..bbb..10.',
    '.....sBb.....',
    '.....Bsb.....',
    '.....sBb.....',
    '.....Bsb.....',
    '.....sBb.....',
    '....BsBbb....',
  ],
  m1: [
    '.............',
    '.............',
    '.32..2.1..21.',
    '3232.32.21211',
    '21.32.2121.11',
    '2...3232121.1',
    '..3322221210.',
    '.32222Cc11211',
    '32.1.2cc110.1',
    '2...32211...0',
    '...32bbbb10..',
    '...2.sBBb1...',
    '.....BsBb....',
    '.....sBsb....',
    '.....BsBb....',
    '....sBBsbb...',
    '....BsBBbb...',
  ],
  s0: [
    '....32....',
    '.2..332.1.',
    '.32.321.2.',
    '..3232.21.',
    '.333223210',
    '3223222111',
    '1.1222110.',
    '..3221100.',
    '.21.bb.10.',
    '....sBb...',
    '....Bsb...',
    '....sBb...',
    '...BsBbb..',
  ],
  s1: [
    '..........',
    '..........',
    '....31....',
    '.32.32.21.',
    '3213221211',
    '2..3221211',
    '.33222211.',
    '32.2221.10',
    '2..3221..0',
    '..32bbb10.',
    '....sBb...',
    '....BsBb..',
    '...sBsBbb.',
  ],
};

// Tree fern: a thin fibrous trunk under an umbrella of drooping, lacy fronds.
const TREE_FERN_KEY = { 0: 'meadow0', 1: 'meadow1', 2: 'meadow2', 3: 'meadow3', B: 'bark1', b: 'bark0' };
const TREE_FERN = [
  [
    '....33..3.32....',
    '...22233.2212...',
    '..21...22...11..',
    '..1.33321222.0..',
    '...2122bb1111...',
    '..21..2Bb1.001..',
    '..1..1.bb.0..0..',
    '.......Bb.......',
    '......BBbb......',
  ],
  [
    '........2.......',
    '...33...2..33...',
    '..2223.32.2222..',
    '.21.1233221..11.',
    '211....22....001',
    '1..3333212222..0',
    '..21222bb11111..',
    '.21.1.2Bb1.0.01.',
    '211..2.Bb.1...01',
    '1...1..bb.00...0',
    '.......Bb.......',
    '.......Bb.......',
    '......BBbb......',
  ],
  [
    '........2.......',
    '...33...2..33...',
    '..2223.32.2222..',
    '.21.1233221..11.',
    '211....22....001',
    '1..3333212222..0',
    '..21222bb11111..',
    '.21.1.2bb1.0.01.',
    '211..2.Bb.1...01',
    '1...1..bb.00...0',
    '.......Bb.......',
    '.......Bb.......',
    '.......bb.......',
    '.......Bb.......',
    '.......Bb.......',
    '......BBbb......',
  ],
];

// Cacti, the flowering plants' desert form (src/cacti.ts): no slot of their own; the renderer
// sets one on some desert tiles once cacti exist. Variant 2 of each blooms.

// Baobab (a savanna tree, src/savannatrees.ts): grey bottle trunk, stubby branches, a flat crown of
// leaf tufts; form 1 sparser, with hanging white flowers.
const BAOBAB_KEY = { 0: 'leaf0', 1: 'leaf1', 2: 'leaf2', 3: 'leaf3', o: 'rock0', a: 'rock1', t: 'rock2', T: 'rock3', w: 'white0' };
const BAOBAB = {
  l0: [
    '...11..111..11..',
    '..1331133331331.',
    '.133322333223320',
    '.122212222212210',
    '..0110.0110.010.',
    '...ta...ta..ta..',
    '....ta..ta.ta...',
    '.....aTtttto....',
    '.....aTTttto....',
    '....aTTtttto....',
    '....aTTttttto...',
    '...aTTTttttto...',
    '...aTTTtttttao..',
    '...aTTTtttttao..',
    '...aTTTtttttao..',
    '...aTTttttttao..',
    '...aTTtttttaao..',
    '...aTtttttaaao..',
    '...atttttaaaaoo.',
    '...oaaaaaaaaoo..',
  ],
  l1: [
    '..11....11...11.',
    '.1331..1331.1331',
    '.1220..1220.1220',
    '..w0t..0tw..0t.w',
    '...ta...ta..ta..',
    '....ta..ta.ta...',
    '.....aTtttto....',
    '.....aTTttto....',
    '....aTTtttto....',
    '....aTTttttto...',
    '...aTTTttttto...',
    '...aTTTtttttao..',
    '...aTTTtttttao..',
    '...aTTTtttttao..',
    '...aTTTtttttao..',
    '...aTTttttttao..',
    '...aTTtttttaao..',
    '...aTtttttaaao..',
    '...atttttaaaaoo.',
    '...oaaaaaaaaoo..',
  ],
  m0: [
    '..11..11..11.',
    '.13311333133.',
    '1333223322330',
    '1222122212210',
    '.011.011.010.',
    '..ta..ta.ta..',
    '....aTttto...',
    '....aTTtto...',
    '...aTTtttto..',
    '...aTTtttto..',
    '..aTTTttttao.',
    '..aTTTttttao.',
    '..aTTtttttao.',
    '..aTTttttaao.',
    '..aTttttaaao.',
    '..atttttaaoo.',
    '..oaaaaaaoo..',
  ],
  m1: [
    '.11..11..11..',
    '1331.1331.131',
    '1220.1220.120',
    '.w0t.0tw.0tw.',
    '..ta..ta.ta..',
    '....aTttto...',
    '....aTttto...',
    '....aTTtto...',
    '...aTTtttto..',
    '...aTTtttto..',
    '..aTTTttttao.',
    '..aTTTttttao.',
    '..aTTtttttao.',
    '..aTTttttaao.',
    '..aTttttaaao.',
    '..atttttaaoo.',
    '..oaaaaaaoo..',
  ],
  s0: [
    '..11.111..',
    '.13313331.',
    '1332233220',
    '1221222110',
    '.0t0.0t0..',
    '..ta.ta...',
    '...aTtto..',
    '...aTtto..',
    '..aTTttto.',
    '..aTTttao.',
    '..aTtttao.',
    '..attaaoo.',
    '..oaaaoo..',
  ],
  s1: [
    '.11...11..',
    '1331.1331.',
    '1220w1220.',
    '.0t0.0tw..',
    '..ta.ta...',
    '...aTtto..',
    '...aTtto..',
    '..aTTttto.',
    '..aTTttto.',
    '..aTTttao.',
    '..aTtttao.',
    '..attaaoo.',
    '..oaaaoo..',
  ],
};

// Columnar cactus (saguaro): ribbed column, elbowed arms; white flowers on the tips.
const COLUMN_KEY = { 0: 'moss0', 1: 'moss1', 2: 'moss2', 3: 'moss3', w: 'white0', y: 'yellow0' };
const COLUMN = [
  [
    '.130.',
    '13120',
    '13120',
    '13120',
    '13120',
    '13120',
    '13120',
    '13120',
    '13120',
    '13120',
  ],
  [
    '......130...',
    '.....13120..',
    '.....13120..',
    '.....13120..',
    '.30..13120..',
    '1320.13120..',
    '1320.13120..',
    '1320.13120..',
    '1322223120..',
    '.000013120..',
    '.....13120..',
    '.....13120..',
    '.....13120..',
    '.....13120..',
    '.....13120..',
    '.....13120..',
  ],
  [
    '......wyw.......',
    '......1330......',
    '.....132120.....',
    '.....132120.....',
    '.....132120..w..',
    '.....132120..30.',
    '.....132120.1320',
    '.30..132120.1320',
    '1320.132120.1320',
    '1320.132120.1320',
    '1320.13212222220',
    '1320.1321200000.',
    '13222232120.....',
    '.0000132120.....',
    '.....132120.....',
    '.....132120.....',
    '.....132120.....',
    '.....132120.....',
    '.....132120.....',
    '.....132120.....',
  ],
];

// Barrel cactus: a ribbed globe, darker below; a crown of yellow flowers.
const BARREL_KEY = { 0: 'leaf0', 1: 'leaf1', 2: 'leaf2', 3: 'leaf3', y: 'yellow0', r: 'red1' };
const BARREL = [
  [
    '.1330.',
    '132320',
    '132320',
    '122210',
    '.1100.',
  ],
  [
    '..1330..',
    '.133220.',
    '13232320',
    '13232320',
    '13232220',
    '12222210',
    '.110010.',
  ],
  [
    '...yryy...',
    '..1yy3y0..',
    '.13332220.',
    '1323232320',
    '1323232320',
    '1323232220',
    '1222222210',
    '.12212210.',
    '..110010..',
  ],
];

// Prickly pear (Opuntia): flat, glaucous oval pads growing out of each other; red fruit or yellow flowers on the rims.
const OPUNTIA_KEY = { 0: 'pine1', 1: 'pine2', 2: 'pine3', 3: 'pine4', y: 'yellow0', r: 'red1' };
const OPUNTIA = [
  [
    '..130..',
    '.13320.',
    '.13320.',
    '13220..',
    '13320..',
    '13220..',
    '12210..',
    '.110...',
  ],
  [
    '.r.....r...',
    '.130..130..',
    '13320133220',
    '13320132220',
    '13220132210',
    '1221012210.',
    '.110131100.',
    '...13320...',
    '...13220...',
    '...12210...',
    '....110....',
  ],
  [
    '.y......yr...',
    '.130....130..',
    '13320..13320.',
    '13320.r13220.',
    '13220.133210.',
    '12210.13220..',
    '.1101.1221...',
    '...131.11....',
    '..1332220....',
    '..1332220.y..',
    '..13222101330',
    '..12222113220',
    '...111013220.',
    '.......1221..',
  ],
];

// Thorn bush: sparse olive-grey leaf tufts on a fan of bare twigs that poke out of the outline.
const THORN_KEY = { l: 'lichen0', m: 'moss2', M: 'moss1', d: 'moss0', g: 'bark1', G: 'bark0' };
const THORN = [
  [
    '...g..l...g.....',
    '..g.lmm.lmlg....',
    '.g.lmMMglMMd.g..',
    '...dMdg.gdMdg...',
    '.....g.g.g......',
    '......GGG.......',
  ],
  [
    '....g.....g.....',
    '..g..lm.lmg.g...',
    '...glmMglmMMg...',
    '..lmMMdgMMdMd...',
    '.gdMdg.gdMdg....',
    '...d..ggg.d.....',
    '.......G........',
    '......GGG.......',
  ],
  [
    '..g..g....g..g..',
    '...g..lm.lmg.g..',
    '.g.lmmMglmMMg...',
    '..lmMMMdgMMMdg..',
    '.lmMMdMg.gMdMd..',
    '.gdMdg.g.g.dMdg.',
    '...dd.g.g.g.dd..',
    '.......ggg......',
    '........G.......',
    '.......GGG......',
  ],
];

// Tall savanna grass: a fan of arching straw blades, lit tips, seed heads on the tallest.
const TALL_GRASS_KEY = { 0: 'soil1', 1: 'straw0', 2: 'straw1', 3: 'straw3', s: 'sand4' };
const TALL_GRASS = [
  [
    '......3.........',
    '......3..3......',
    '...3..2..3..3...',
    '....3..232.3....',
    '....2..23..2....',
    '.....2.12.2.....',
    '.....2.21.2.....',
    '......1211......',
    '......0000......',
  ],
  [
    '.......s........',
    '.......s........',
    '.......3........',
    '....3..3.3......',
    '....3..2.3.3....',
    '.....2.2.2.3....',
    '..3..2.2322.....',
    '...3.2.13.2..3..',
    '....21.12.2.3...',
    '....2.112.12....',
    '.....211212.....',
    '.....111112.....',
    '......1111......',
    '......0000......',
  ],
  [
    '......s.........',
    '......s..s......',
    '...s..3..s......',
    '...s..3..3......',
    '...3..2..3..3...',
    '...3..2..2..3...',
    '....2.2.32.2....',
    '.3..2.1.32.2..3.',
    '..3..31.2.2..3..',
    '..2..1312.13.2..',
    '...2.1212.3.2...',
    '....21.21.22....',
    '....1.121121....',
    '.....111121.....',
    '.....111111.....',
    '.....000000.....',
  ],
];

const objects = {
  cycad: (v) => sprite(CYCAD[`${v.size}${v.form}`], CYCAD_KEY),
  jungle_giant: (v) => giant(v),
  jungle_palm: (v) => junglePalm(v),
  acacia: (v) => sprite(ACACIA[`${v.size}${v.form}`], ACACIA_KEY),
  baobab: (v) => sprite(BAOBAB[`${v.size}${v.form}`], BAOBAB_KEY),
  tree_fern: (v) => sprite(TREE_FERN[v.index], TREE_FERN_KEY),
  cactus_column: (v) => sprite(COLUMN[v.index], COLUMN_KEY),
  cactus_barrel: (v) => sprite(BARREL[v.index], BARREL_KEY),
  cactus_opuntia: (v) => sprite(OPUNTIA[v.index], OPUNTIA_KEY),
  thorn_bush: (v) => sprite(THORN[v.index], THORN_KEY),
  tall_grass: (v) => sprite(TALL_GRASS[v.index], TALL_GRASS_KEY),
};

module.exports = { materials, objects };
