/* =============================================================================
 * SimEarth 2.0 — lightning and rain art for the hurricane
 * -----------------------------------------------------------------------------
 * A cloud-to-ground strike seen from the side like everything upright on the
 * map (two hand-laid channel shapes, six frames each: leader, return stroke,
 * flicker, afterglow, re-strike, fade), the ground flash where it hits
 * (flash, sparks, embers on a scorch) and curtains of rain under the bands.
 * The bolt is its own light: a 1-px white core inside a pale blue glow, a
 * rare violet corona; the flash glows white to yellow with a darker edge;
 * everything fades by fewer pixels, never by alpha.
 * Style: docs/ereignisse-2026-10/stil.md · contract: tools/fx/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');
const P = require('../terrain/palette');

/* ---------------------------------------------------------- lightning -- */

/**
 * Two strikes, laid by hand: the main channel from the cloud (row 0) to the
 * ground (row 63), then branches forking off it sideways-downward. Every
 * segment has |dx| ≤ dy, so the core is one pixel per row with diagonal jags.
 * `foot` is the core's column on the bottom row (the strike point).
 */
const SHAPES = [
  {
    foot: 12,
    main: [[8, 0], [8, 3], [5, 6], [6, 11], [10, 15], [9, 19], [6, 22], [7, 26], [11, 30], [11, 33], [14, 36], [12, 41],
      [9, 44], [10, 48], [14, 52], [13, 55], [11, 57], [12, 60], [12, 63]],
    branches: [
      [[10, 15], [13, 17], [14, 21], [17, 23], [18, 27], [20, 29]],
      [[7, 26], [4, 28], [4, 32], [2, 34], [1, 38]],
      [[12, 41], [15, 43], [16, 47], [18, 49]],
      [[14, 21], [15, 24], [14, 26]],
    ],
  },
  {
    foot: 11,
    main: [[16, 0], [16, 2], [19, 5], [18, 10], [14, 14], [15, 18], [18, 21], [17, 25], [13, 29], [13, 32], [10, 35],
      [12, 40], [15, 43], [14, 47], [10, 51], [11, 54], [13, 56], [11, 59], [11, 63]],
    branches: [
      [[14, 14], [11, 16], [10, 20], [7, 22], [6, 26], [4, 27]],
      [[17, 25], [20, 27], [20, 31], [22, 33], [23, 36]],
      [[10, 35], [7, 37], [6, 41], [4, 43]],
      [[10, 20], [11, 23], [10, 25]],
    ],
  },
];

/** Pixels of a polyline, in order, each with its share `s` (0..1) of the way along. */
function trace(pts) {
  const out = [];
  for (let n = 1; n < pts.length; n++) {
    const [x1, y1] = pts[n - 1];
    const [x2, y2] = pts[n];
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let i = n === 1 ? 0 : 1; i <= steps; i++) {
      out.push([Math.round(x1 + ((x2 - x1) * i) / steps), Math.round(y1 + ((y2 - y1) * i) / steps)]);
    }
  }
  return out.map(([x, y], i) => ({ x, y, s: i / Math.max(1, out.length - 1) }));
}

const TRACED = SHAPES.map((sh) => ({ foot: sh.foot, main: trace(sh.main), branches: sh.branches.map(trace) }));

/**
 * One look per frame of a strike:
 *   core      tone of the main channel; `gaps` the share of 3-px pieces left out; `reach` rows drawn from the top
 *   glow      [d = 1, diagonal, d = 2, d = 3] shares lit around the core (0 = none), tones in GLOW_TONES
 *   branches  per branch the share of its length drawn; `dim` moves their tones toward the tip end
 *   splash    the burst at the foot: 0 none, 1 small, 2 full; without one `foot` holds the bottom rows
 *   leader    the stepped leader: its newest steps brighter, a streamer at the foot
 */
const LOOKS = [
  // 0 stepped leader: dim, dashed, only the upper part feeling its way down; a streamer rises from the ground.
  { core: 'ice2', gaps: 0.18, reach: 36, glow: [0, 0, 0, 0], branches: [0.7, 0.35, 0, 0.6], dim: 2, leader: true, splash: 0 },
  // 1 return stroke: blinding, full length, every branch, the full splash.
  { core: 'white0', reach: 64, glow: [0.7, 0.3, 0.02, 0], branches: [1, 1, 1, 1], dim: 0, splash: 2, seed: 11 },
  // 2 flicker: the same channel, the glow lit elsewhere, branches shifting.
  { core: 'white0', reach: 64, glow: [0.6, 0.22, 0, 0], branches: [0.8, 1, 0.55, 0.5], dim: 1, splash: 1, seed: 23 },
  // 3 afterglow: thinner and cooler, branches gone.
  { core: 'ice3', reach: 64, glow: [0.18, 0, 0, 0], branches: [0, 0, 0, 0], dim: 0, splash: 0, foot: 'ice3', seed: 37 },
  // 4 re-strike: bright again down the same channel, one branch.
  { core: 'white0', reach: 64, glow: [0.65, 0.25, 0.02, 0], branches: [0, 1, 0, 0], dim: 0, splash: 2, seed: 41 },
  // 5 fade: broken faint pieces.
  { core: 'ice2', gaps: 0.45, reach: 64, glow: [0, 0, 0, 0], branches: [0, 0, 0, 0], dim: 0, splash: 0, foot: 'ice1', seed: 53 },
];

/** Branch tones, root to tip; `dim` shifts them toward the tip end. */
const BRANCH_TONES = ['white0', 'ice4', 'ice3', 'ice3', 'ice2', 'ice1'];
/** Glow rings around the core, nearest first, [tone, brighter tone]; violet is the corona, kept sparse. */
const GLOW_TONES = [['ice2', 'ice3'], ['ice1', 'violet0'], ['violet0', 'violet0'], ['violet0', 'violet0']];

/** The burst at the foot, columns −4..+4 around the foot, rows 59–63 (key: W white0, 4/3/2/1 ice). */
const SPLASH = [
  [
    '.........',
    '.........',
    '.........',
    '...343...',
    '.234W432.',
  ],
  [
    '..2...2..',
    '...3.3...',
    '.2.3W3.2.',
    '..34W43..',
    '234WWW432',
  ],
];
const SPLASH_KEY = { W: 'white0', 4: 'ice4', 3: 'ice3', 2: 'ice2', 1: 'ice1' };

function lightning(f) {
  const t = new k.Tex(24, 64);
  const shape = TRACED[Math.floor(f / 6)];
  const look = LOOKS[f % 6];
  const seed = (look.seed ?? 3) + Math.floor(f / 6) * 97;
  const core = shape.main.filter((p) => p.y < look.reach);

  // Glow first, so the channel and the branches overwrite it.
  if (look.glow.some((g) => g > 0)) {
    const isCore = new Set(core.map((p) => p.y * 24 + p.x));
    t.each((x, y) => {
      if (isCore.has(y * 24 + x)) return undefined;
      let d = 9;
      for (const p of core) if (Math.abs(p.y - y) <= 3) d = Math.min(d, Math.hypot(p.x - x, p.y - y));
      const ring = d <= 1 ? 0 : d < 1.5 ? 1 : d <= 2.01 ? 2 : d <= 3.01 ? 3 : -1;
      if (ring < 0) return undefined;
      const h = k.hash(x, y, seed);
      if (h >= look.glow[ring]) return undefined;
      // The brighter tone of a ring takes the lit share's lower part: a flickering, uneven sheath.
      return P.c(GLOW_TONES[ring][h < look.glow[ring] * 0.3 ? 1 : 0]);
    });
  }

  shape.branches.forEach((br, b) => {
    const reach = look.branches[b];
    if (!reach) return;
    for (const p of br) {
      if (p.s > reach) break;
      const q = p.s / reach;
      // Dying out: the far third breaks up.
      if (q > 0.66 && k.hash(p.x, p.y, seed + 5) < (q - 0.66) * 1.4) continue;
      const tone = BRANCH_TONES[Math.min(BRANCH_TONES.length - 1, Math.floor(q * 4.6) + 1 + look.dim)];
      if (t.get(p.x, p.y) === 0 || BRANCH_TONES.indexOf(tone) < 3) t.set(p.x, p.y, P.c(tone));
    }
  });

  core.forEach((p, i) => {
    if (look.gaps && k.hash(Math.floor(i / 3), f, 61) < look.gaps) return;
    let tone = look.core;
    // The leader's newest steps glow brighter; the afterglow keeps a few hot pixels where it jags.
    if (look.leader && p.y >= look.reach - 4) tone = 'ice3';
    if (look.core === 'ice3' && k.hash(p.x, p.y, seed) < 0.18) tone = 'ice4';
    t.set(p.x, p.y, P.c(tone));
  });

  const fx0 = shape.foot;
  if (look.leader) {
    // An upward streamer rises from the strike point to meet the leader.
    t.set(fx0, 63, P.c('ice2'));
    t.set(fx0, 62, P.c('ice2'));
    t.set(fx0 + 1, 61, P.c('ice1'));
  } else if (look.splash) {
    SPLASH[look.splash - 1].forEach((row, r) => {
      for (let c = 0; c < row.length; c++) if (row[c] !== '.') t.set(fx0 - 4 + c, 59 + r, P.c(SPLASH_KEY[row[c]]));
    });
  } else {
    t.set(fx0, 63, P.c(look.foot));
    t.set(fx0, 62, P.c(look.foot));
  }
  return t;
}

/* ------------------------------------------------------ ground glow -- */

/** Ellipse share about the box centre: the ground seen from above at a slight tilt. */
const GR = (x, y, rx, ry) => Math.hypot((x + 0.5 - 16) / rx, (y + 0.5 - 8) / ry);

/** Hash-scattered keep: an ordered dither would read as a dot grid laid over the map. */
const scatter = (x, y, seed, v) => k.hash(x, y, seed) < v;

function lightningGlow(f) {
  const t = new k.Tex(32, 16);
  if (f === 0) {
    // The flash pooled on the ground: a white core, a yellow body, its rim breaking up with a darker step.
    const rag = k.noise(32, 8, 401);
    t.each((x, y) => {
      const r = GR(x, y, 12.5, 5) + (rag(x * 2, y * 4) - 0.5) * 0.18;
      if (r < 0.3) return P.c('white0');
      if (r < 0.5) return P.c(scatter(x, y, 403, (0.5 - r) / 0.2) ? 'white0' : 'yellow0');
      if (r < 0.78) return P.c('yellow0');
      if (r < 1.06 && scatter(x, y, 405, (1.06 - r) / 0.28)) return P.c(r < 0.93 ? 'yellow0' : 'orange0');
      return undefined;
    });
    return t;
  }
  if (f === 1) {
    // Scattered light round a smaller hot core, and sparks thrown out and up, each trailing toward the strike.
    t.each((x, y) => {
      const r = GR(x, y, 12, 4.8);
      if (r < 0.22) return P.c('white0');
      if (r < 0.42) return P.c(r < 0.32 && scatter(x, y, 411, 0.5) ? 'white0' : 'yellow0');
      if (r < 0.9 && scatter(x, y, 412, (0.9 - r) * 0.75)) return P.c(scatter(x, y, 413, 0.6) ? 'yellow0' : 'orange0');
      return undefined;
    });
    for (let s = 0; s < 12; s++) {
      const a = ((s + k.hash(s, 1, 415) * 0.7) / 12) * Math.PI * 2;
      const d = 0.72 + k.hash(s, 2, 415) * 0.4;
      const lift = Math.sin(a) < 0 ? 1 + k.hash(s, 3, 415) * 2 : 0;
      const vx = Math.cos(a) * 12.5;
      const vy = Math.sin(a) * 5 - lift;
      const x = Math.round(16 + vx * d - 0.5);
      const y = Math.round(8 + vy * d - 0.5);
      const len = Math.hypot(vx, vy);
      t.set(x, y, P.c(s % 3 === 0 ? 'white0' : 'yellow0'));
      t.set(x - Math.round(vx / len), y - Math.round(vy / len), P.c('orange0'));
    }
    return t;
  }
  // 2–3: embers glowing in clumps on a scorched patch; 3 cooler and thinner.
  const late = f === 3;
  const n = k.fbm(32, 8, 2, 421);
  t.each((x, y) => {
    const r = GR(x, y, 10, 4) + (n(x * 2, y * 2) - 0.5) * 0.45;
    if (r >= 1) return undefined;
    const heat = (1 - r) * 0.7 + n(x, y + 7) * 0.6 - (late ? 0.26 : 0);
    if (heat > 0.88) return P.c(late ? 'orange0' : 'yellow0');
    if (heat > 0.76) return P.c(late ? 'red1' : 'orange0');
    if (heat > 0.66) return P.c(late ? 'red0' : 'red1');
    if (heat > 0.6 && !late) return P.c('red0');
    // The scorch: dark ground, its edge breaking up.
    const density = r < 0.55 ? 1 : (1 - r) / 0.45;
    // Cooling, the scorch thins out in short flecks along the ground.
    if (!scatter(x, y, 425, density) || (late && !scatter(x >> 1, y, 427, 0.5))) return undefined;
    return P.c(k.hash(x, y, 423) < 0.22 ? 'rock0' : 'soil0');
  });
  if (!late) {
    // The last sparks still rising off the embers.
    [[12, 2, 'orange0'], [20, 1, 'yellow0'], [17, 0, 'red1']].forEach(([x, y, c]) => t.set(x, y, P.c(c)));
  }
  return t;
}

/* -------------------------------------------------------- rain veil -- */

/**
 * Rain falls down-left, SLANT px across per px down. Streaks live in sheared
 * coordinates (w = x + y·SLANT is constant along the fall, u = y): each frame
 * moves them 8 px down the slant, so after 4 frames u has gone round its
 * 32-px period and the loop closes. Streaks bunch into curtains along w; a
 * static bell over the box thins streaks and veil to nothing at its edges,
 * so overlapping veils blend without box edges.
 */
const SLANT = 1;
const RAIN_STREAKS = 80;

/** 1 over the middle of the box, falling to 0 at its edge and corners. */
function bell(x, y) {
  const r = Math.hypot((x + 0.5 - 16) / 16, (y + 0.5 - 16) / 16);
  return r >= 1 ? 0 : r < 0.3 ? 1 : (Math.cos((Math.PI * (r - 0.3)) / 0.7) + 1) / 2;
}

/** Streak tones, tail to head: far, middle, near, and a rare bright one. */
const RAIN_TONES = [['ice0', 'ice1', 'ice1'], ['ice1', 'ice2', 'ice2'], ['ice1', 'ice2', 'ice3'], ['ice2', 'ice3', 'ice4']];

function rainLeft(f) {
  const t = new k.Tex(32, 32);
  // The veil: sparse greys, densest in the middle.
  t.each((x, y) => {
    if (!scatter(x, y, 431, bell(x, y) * 0.07)) return undefined;
    return P.c(k.hash(x, y, 432) < 0.6 ? 'ice1' : 'rock2');
  });
  const curtain = k.noise(64, 8, 437);
  const span = 32 + 32 * SLANT;
  for (let i = 0; i < RAIN_STREAKS; i++) {
    const w = k.hash(i, 1, 433) * span;
    const u = (Math.floor(k.hash(i, 2, 433) * 32) + f * 8) % 32;
    const len = k.hash(i, 3, 433) < 0.3 ? 2 : 3;
    const h = k.hash(i, 4, 433);
    const tones = RAIN_TONES[h < 0.3 ? 0 : h < 0.65 ? 1 : h < 0.92 ? 2 : 3];
    const at = (y) => Math.floor(w - y * SLANT);
    if (k.hash(i, 5, 433) >= bell(at(u), u) * (0.2 + curtain(Math.floor(w * 2), 0) * 1.6)) continue;
    for (let j = 0; j < len; j++) {
      const y = u - j;
      if (y < 0) break;
      t.set(at(y), y, P.c(tones[2 - j]));
    }
  }
  return t;
}

function rainVeil(f) {
  return f < 4 ? rainLeft(f) : rainLeft(f - 4).flipped();
}

module.exports = {
  sprites: { lightning, lightning_glow: lightningGlow, rain_veil: rainVeil },
};
