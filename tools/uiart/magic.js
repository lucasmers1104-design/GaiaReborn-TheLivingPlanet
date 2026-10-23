/* =============================================================================
 * Gaia Reborn — the evolution magic
 * -----------------------------------------------------------------------------
 * The pieces the runtime builds Gaia's evolution moment from: the beads of
 * the turning DNA double helix (front beads bright with a hot highlight,
 * back beads small and dim), twinkling sparks, the gathering light motes,
 * the soft glow drawn behind them with additive blending, the head of the
 * energy stream that flies to the planet and the burst of light where it
 * lands. Turquoise leads, green and a little violet follow.
 * The small sprites are hand-pixelled in tone letters and coloured per
 * light; glow and burst are measured rings, dithered instead of faded.
 * Light from the upper left: lit rims up and left, the dark rim (selective
 * outline) down and right.
 * ========================================================================== */
'use strict';

const K = require('./kit');

/** Tone letters per light: h hot white, p pale, l light, m mid, d dark, o darkest rim. */
const LIGHTS = {
  t: { h: 'glowT5', p: 'glowT4', l: 'glowT3', m: 'glowT2', d: 'glowT1', o: 'glowT0' },
  g: { h: 'glowT5', p: 'glowG3', l: 'glowG2', m: 'glowG1', d: 'glowG0', o: 'glowT0' },
  v: { h: 'glowT5', p: 'glowV4', l: 'glowV3', m: 'glowV2', d: 'glowV1', o: 'glowV0' },
};
const ORDER = ['t', 'g', 'v'];

/* ---------------------------------------------------------- dna_bead -- */

/** Four depths, nearest first: a large glossy pearl, the front pearl, the back one (no white), the farthest a dim cross. */
const BEAD = [
  ['..llm..', '.lhplm.', 'lhhplmd', 'lpplmmd', 'mllmmdo', '.mmmdo.', '..ddo..'],
  ['.......', '..llm..', '.lhpmd.', '.lplmd.', '.mlmdo.', '..ddo..', '.......'],
  ['.......', '.......', '..dmd..', '..mld..', '..ddo..', '.......', '.......'],
  ['.......', '.......', '...d...', '..dmo..', '...o...', '.......', '.......'],
];

const dnaBead = (f) => K.grid(BEAD[Math.floor(f / 3)], LIGHTS[ORDER[f % 3]]);

/* -------------------------------------------------------------- aura -- */

/**
 * The light behind the whole helix: a tall ellipse ordered-dithered (no
 * alpha) with nested densities over its radius e (0 centre … 1 rim): a
 * sprinkle of glowT1 in the core, glowT0 thinning out from the middle, a
 * faint violet lace near the rim. Per frame [share of the box, the teal's
 * reach]: 0–1 while the helix grows, 2–5 its breath from small to large.
 * Kept dark because it is added onto the map.
 */
const AURA = [[0.3, 0.9], [0.62, 0.92], [0.84, 0.9], [0.89, 0.93], [0.94, 0.96], [1, 1]];

function aura(f, s) {
  const t = new K.Tex(s.w, s.h);
  const cx = Math.floor(s.w / 2);
  const cy = Math.floor(s.h / 2);
  const [share, reach] = AURA[f];
  const ramp = (v) => Math.max(0, Math.min(1, v));
  t.each((x, y) => {
    const e = Math.hypot((x - cx) / ((cx + 0.5) * share), (y - cy) / ((cy + 0.5) * share));
    if (e >= 1) return undefined;
    const b = (K.BAYER4[(y - cy) & 3][(x - cx) & 3] + 0.5) / 16;
    const core = 0.45 * ramp((0.32 - e) / 0.32);
    const teal = ramp((reach - e) / (reach - 0.15));
    const lace = 0.22 * ramp(1 - Math.abs(e - 0.85) / 0.2);
    if (b < core) return K.c('glowT1');
    if (b < teal) return K.c('glowT0');
    if (b < teal + lace) return K.c('glowV0');
    return undefined;
  });
  return t;
}

/* ------------------------------------------------------------- spark -- */

/** One twinkle: a dot, a small cross, the full four-point star with its soft core, a dimming cross. */
const SPARK = [
  ['.....', '.....', '..p..', '.....', '.....'],
  ['.....', '..l..', '.lhl.', '..l..', '.....'],
  ['..m..', '.dpd.', 'mphpm', '.dpd.', '..m..'],
  ['.....', '..d..', '.dpd.', '..d..', '.....'],
];
const SPARK_V = { h: 'glowV4', p: 'glowV3', l: 'glowV3', m: 'glowV2', d: 'glowV1' };

/* -------------------------------------------------------------- mote -- */

const MOTE = [
  ['...', '.l.', '...'],
  ['.m.', 'mpm', '.m.'],
  ['dld', 'lhl', 'dld'],
];
const MOTE_LIGHTS = {
  t: LIGHTS.t,
  g: { h: 'glowG3', p: 'glowG3', l: 'glowG2', m: 'glowG1', d: 'glowG0' },
  v: SPARK_V,
};

const mote = (f) => K.grid(MOTE[f % 3], MOTE_LIGHTS[ORDER[Math.floor(f / 3)]]);

/* -------------------------------------------------------------- glow -- */

/**
 * Concentric rings from the centre out: [outer radius, colour, colour on the
 * other checker squares]. Kept dark because it is added onto the map: glowT1
 * only in the core the bead or orb covers, pine0 for the faint outer halo.
 */
const GLOW = [
  [[1.2, 'glowT1', 'glowT1'], [2.3, 'glowT1', 'glowT0'], [3.4, 'glowT0', 'glowT0'], [4.6, 'glowT0', 'pine0']],
  [[1.6, 'glowT1', 'glowT1'], [2.9, 'glowT1', 'glowT0'], [4.3, 'glowT0', 'glowT0'], [5.5, 'glowT0', 'pine0'], [6.6, 'pine0', 0]],
  [[2.1, 'glowT1', 'glowT1'], [3.6, 'glowT1', 'glowT0'], [5.4, 'glowT0', 'glowT0'], [6.9, 'glowT0', 'pine0'], [8.5, 'pine0', 0]],
];

function glow(f, s) {
  const t = new K.Tex(s.w, s.h);
  const c = Math.floor(s.w / 2);
  t.each((x, y) => {
    const d = Math.hypot(x - c, y - c);
    const ring = GLOW[f].find(([r]) => d <= r);
    if (!ring) return undefined;
    const col = (x + y - 2 * c) % 2 === 0 ? ring[1] : ring[2];
    return col ? K.c(col) : undefined;
  });
  return t;
}

/* ------------------------------------------------------------- comet -- */

/**
 * A white-hot core in a round body that pulses with a four-point flare
 * (long, medium, none, medium); a violet and a green glint wander the rim.
 */
const COMET = [
  [
    '....l....',
    '...mpm...',
    '..llplm..',
    '.mlphpld.',
    'lpphhhppm',
    '.mlphpmd.',
    '..mlpmd..',
    '...dpd...',
    '....m....',
  ],
  [
    '.........',
    '...mpm...',
    '..llplw..',
    '.mlphplv.',
    '.pphhhpp.',
    '.mlphpmd.',
    '..mlpmd..',
    '...dpd...',
    '.........',
  ],
  [
    '.........',
    '...mmm...',
    '..llllm..',
    '.mlphpld.',
    '.mlhhhld.',
    '.mlphpmd.',
    '..mllmd..',
    '...ddd...',
    '.........',
  ],
  [
    '.........',
    '...mpm...',
    '..llplm..',
    '.mlphpld.',
    '.pphhhpp.',
    '.glphpmd.',
    '..Glpmd..',
    '...dpd...',
    '.........',
  ],
];
const COMET_TONES = { ...LIGHTS.t, w: 'glowV4', v: 'glowV3', g: 'glowG2', G: 'glowG3' };

/* ------------------------------------------------------------- burst -- */

const TAU = Math.PI * 2;
/** Towards the light, in screen angles (y down): the upper left. */
const LIT = Math.atan2(-1, -1);

/** Ring pixels of radius r and width w round (c, c); tone(lit -1..1, edge 0 centre..1 rim, angle) returns a colour or 0. */
function ring(t, c, r, w, tone) {
  t.each((x, y) => {
    const dx = x - c;
    const dy = y - c;
    const e = Math.abs(Math.hypot(dx, dy) - r) / (w / 2);
    if (e >= 1) return undefined;
    const a = Math.atan2(dy, dx);
    const v = tone(Math.cos(a - LIT), e, a);
    return v ? K.c(v) : undefined;
  });
  return t;
}

/** A spark stamped centred on (x, y): size 0 a dot, 1 a small cross, 2 the full star. */
function sparkAt(t, x, y, size, tones) {
  return t.stamp(K.grid(SPARK[size], tones), Math.round(x) - 2, Math.round(y) - 2);
}

/** Where the ring breaks into sparks: eight around, every other one slightly ahead, coloured teal, green, violet. */
const SPARKS = Array.from({ length: 8 }, (_, i) => ({
  a: LIT + (i * TAU) / 8 + 0.12 * (K.hash(i, 3, 91) - 0.5),
  ahead: i % 2 === 0 ? 1 : 0,
  light: ORDER[[0, 1, 0, 2, 0, 1, 0, 2][i]],
}));

function burst(f, s) {
  const t = new K.Tex(s.w, s.h);
  const c = Math.floor(s.w / 2);
  const T = LIGHTS.t;
  if (f === 0) {
    // The flash: a white core with long rays on the axes and short ones on the diagonals.
    K.disc(t, c, c, 3, T.l);
    K.disc(t, c, c, 2, T.p);
    K.disc(t, c, c, 1, T.h);
    const ray = [T.p, T.l, T.l, T.m, T.m, T.d];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ray.forEach((col, k) => K.put(t, c + dx * (k + 4), c + dy * (k + 4), col));
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      K.put(t, c + 3 * dx, c + 3 * dy, T.l);
      K.put(t, c + 4 * dx, c + 4 * dy, T.d);
    }
    return t;
  }
  const R = [0, 5, 8.5, 11.5, 13.5, 15, 15.8][f];
  if (f <= 3) {
    const w = [0, 2.6, 2.4, 2][f];
    ring(t, c, R, w, (lit, e, a) => {
      if (f === 3) {
        // Breaking up: arcs round the sparks-to-be, dimming towards the gaps.
        const k = (((a - LIT) / TAU) * 8 % 1 + 1) % 1;
        const q = Math.min(k, 1 - k) / 0.3;
        if (q >= 1) return 0;
        if (q > 0.7) return e < 0.5 ? T.m : T.d;
        if (q > 0.35) return e < 0.5 ? T.l : T.m;
      }
      if (e < 0.5) return lit > 0.3 ? T.h : lit < -0.5 && f > 1 ? T.l : T.p;
      return lit > 0.3 ? T.l : T.m;
    });
    if (f === 1) {
      // What is left of the flash: a thinning glow in the middle.
      t.each((x, y) => (Math.hypot(x - c, y - c) <= 2.3 && (x + y) % 2 === 0 ? K.c(x === c && y === c ? T.l : T.d) : undefined));
    }
  } else {
    // Faint remains of the ring between the sparks.
    const keep = [0, 0, 0, 0, 0.45, 0.2, 0][f];
    if (keep > 0) {
      const ghost = ring(new K.Tex(s.w, s.h), c, R - 1, 1.4, (lit) => (lit > -0.2 ? T.m : T.d));
      t.stamp(K.dissolve(ghost, 1 - keep, f), 0, 0);
    }
  }
  if (f === 4 || f === 5) {
    // Smaller lights lagging behind, between the sparks.
    SPARKS.forEach((sp, i) => {
      const a = sp.a + TAU / 16;
      const rr = R - 3.5 - 1.5 * K.hash(i, 5, 17);
      const tones = MOTE_LIGHTS[ORDER[(i + 1) % 3]];
      K.put(t, Math.round(c + rr * Math.cos(a)), Math.round(c + rr * Math.sin(a)), f === 4 ? tones.p : tones.m);
    });
  }
  if (f >= 3) {
    for (const sp of SPARKS) {
      const rr = R + (f >= 4 ? sp.ahead * 0.8 : 0);
      const size = f === 3 ? 1 : f === 4 ? 2 : f === 5 ? 1 : 0;
      const tones = sp.light === 'v' ? SPARK_V : LIGHTS[sp.light];
      sparkAt(t, c + rr * Math.cos(sp.a), c + rr * Math.sin(sp.a), size, tones);
    }
  }
  return t;
}

module.exports = {
  sprites: {
    dna_bead: dnaBead,
    aura,
    spark: (f) => K.grid(SPARK[f], LIGHTS.t),
    spark_v: (f) => K.grid(SPARK[f], SPARK_V),
    mote,
    glow,
    comet: (f) => K.grid(COMET[f], COMET_TONES),
    burst,
  },
};
