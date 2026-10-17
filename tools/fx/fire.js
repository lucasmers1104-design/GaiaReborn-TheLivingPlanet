/* =============================================================================
 * SimEarth 2.0 — wildfire art
 * -----------------------------------------------------------------------------
 * Flames in three sizes, the smoke plume over a burning tile (upright and
 * leaning east or west with the wind), charred trunks and two ground
 * textures: glowing embers under the flames and the burnt earth they leave. Fire is its own light: a flame glows from a white or
 * yellow core through orange to a dark red edge, the same on both sides, so
 * the map may show its frames in any order. Smoke is lit from the upper
 * left like every cloud. Animations loop seamlessly:
 *   flames   tongues pulse and sway on sines of the loop phase, rising
 *            turbulence scrolls through them by a noise that repeats every
 *            loop; loose licks tear off the tips, rise and go out
 *   plume    puffs rise two pixels a frame, twelve pixels apart, and every
 *            property depends on height only, so frame 6 is frame 0; the
 *            west lean mirrors the east one's puffs and lights them afresh
 *   embers   the glowing spots pulse between two heat levels
 * Style: docs/ereignisse-2026-10/stil.md · contract: tools/fx/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');
const P = require('../terrain/palette');
const fx = require('./kit');

/** Glow from the edge inwards: the dark rim, then ever hotter. */
const GLOW = ['red0', 'red1', 'orange0', 'yellow0', 'white0'];

/* ------------------------------------------------------------ flames -- */

/** Frames of every fire loop; time enters only as the phase f / LOOP, so frame LOOP is frame 0. */
const LOOP = 6;
const TAU = Math.PI * 2;

/**
 * Half width of a tongue at u = height / tongue height (0 at the foot):
 * round at the base, widest low down, drawn out to a point.
 */
function tongueHalf(u) {
  if (u < 0 || u > 1) return -1;
  return Math.pow(1 - u, 0.85) * (0.72 + 0.9 * u - 0.55 * u * u);
}

/**
 * The three flame sizes. Tongues ({ x, h, w, weight }) are base centre,
 * height, half width at the widest and share of the heat; each pulses in
 * height (`pulse`, at `beat` cycles per loop) and sways its tip, with its
 * own phase, so neighbouring tongues rise while others fall. `licks` break
 * off a tongue tip and rise until they go out. `top` is the hottest glow
 * step (yellow or white), `steps` the heat thresholds if not HEAT_STEPS;
 * `churn` the strength of the rising turbulence.
 */
const FLAMES = {
  small: {
    tongues: [
      { x: 8, h: 9.5, w: 3.4, weight: 1, pulse: 0.16, beat: 1, ph: 0, sway: 0.9, swayPh: 1.1 },
      { x: 5.6, h: 5.4, w: 1.9, weight: 0.7, pulse: 0.22, beat: 2, ph: 2.4, sway: -0.7, swayPh: 0.3 },
      { x: 10.4, h: 5.8, w: 1.9, weight: 0.7, pulse: 0.22, beat: 1, ph: 4.2, sway: 0.7, swayPh: 2.6 },
    ],
    licks: [{ tongue: 0, off: 0, drift: -0.6 }],
    top: 3, churn: 0.36, seed: 211,
  },
  medium: {
    tongues: [
      { x: 8, h: 13, w: 3.9, weight: 1, pulse: 0.13, beat: 1, ph: 0.5, sway: 1.2, swayPh: 0 },
      { x: 5.2, h: 7.6, w: 2.2, weight: 0.75, pulse: 0.2, beat: 2, ph: 1.7, sway: -1, swayPh: 2 },
      { x: 10.9, h: 8.6, w: 2.3, weight: 0.75, pulse: 0.2, beat: 1, ph: 3.9, sway: 1, swayPh: 4.1 },
    ],
    licks: [{ tongue: 0, off: 0.15, drift: 0.8 }, { tongue: 2, off: 0.65, drift: 0.5 }],
    top: 4, steps: [0, 0.22, 0.46, 0.8], churn: 0.4, seed: 223,
  },
  large: {
    tongues: [
      { x: 8, h: 18.4, w: 5.6, weight: 1, pulse: 0.09, beat: 1, ph: 0, sway: 1.4, swayPh: 0.9 },
      { x: 4.2, h: 11.5, w: 3.1, weight: 0.8, pulse: 0.18, beat: 2, ph: 2.2, sway: -1.5, swayPh: 3.3 },
      { x: 11.9, h: 13, w: 3.1, weight: 0.8, pulse: 0.16, beat: 1, ph: 3.6, sway: 1.5, swayPh: 1.8 },
      { x: 6.4, h: 15, w: 3, weight: 0.85, pulse: 0.14, beat: 2, ph: 5, sway: -1, swayPh: 5.2 },
    ],
    licks: [{ tongue: 0, off: 0, drift: -0.7 }, { tongue: 2, off: 0.4, drift: 1 }, { tongue: 1, off: 0.75, drift: -1 }],
    top: 4, churn: 0.46, seed: 227,
  },
};

/** Heat above which a pixel takes GLOW[1..4]; below the first it is the dark rim colour. */
const HEAT_STEPS = [0, 0.2, 0.42, 0.66];
/** Turbulence rises this many pixels a frame; its noise repeats every LOOP times as many, so the loop closes. */
const CHURN_RISE = 4;

function flame(spec) {
  const churn = k.fbm(LOOP * CHURN_RISE, 3, 2, spec.seed);
  return (f) => {
    const t = new k.Tex(16, 20);
    const foot = t.h - 1;
    const phase = (f / LOOP) * TAU;
    const tongues = spec.tongues.map((g) => ({
      ...g,
      h: g.h * (1 + g.pulse * Math.sin(phase * g.beat + g.ph)),
      lean: g.sway * Math.sin(phase + g.swayPh),
    }));
    // Heat: highest on a tongue's axis and low down where the fuel is, cooling to its tip and sides;
    // rising turbulence eats into it, more so higher up, and splits the tips.
    const heat = (x, y) => {
      if (x < 0 || x >= t.w || y < 0) return -1;
      if (y > foot) return 1;
      const hgt = foot - y + 0.5;
      let best = -1;
      let uBest = 1;
      for (const g of tongues) {
        const u = hgt / g.h;
        const half = tongueHalf(u);
        if (half < 0) continue;
        const cx = g.x + g.lean * u * u;
        const across = 1 - Math.abs(x + 0.5 - cx) / (g.w * half);
        if (across < 0) continue;
        const v = Math.pow(across, 0.7) * Math.pow(1 - u, 0.6) * g.weight;
        if (v > best) { best = v; uBest = u; }
      }
      if (best < 0) return -1;
      const n = churn(x, y + f * CHURN_RISE) - 0.5;
      return best - spec.churn * n * (0.35 + uBest) - 0.04;
    };
    const lit = (x, y) => heat(x, y) >= 0;
    t.each((x, y) => {
      const h = heat(x, y);
      if (h < 0) return undefined;
      // Lone pixels left by the turbulence go out.
      if (!lit(x - 1, y) && !lit(x + 1, y) && !lit(x, y - 1) && !lit(x, y + 1)) return undefined;
      // A dark rim all round, the same on both sides: fire is its own light. The foot is no edge.
      if (!lit(x - 1, y) || !lit(x + 1, y) || !lit(x, y - 1)) return P.c(GLOW[0]);
      let step = 1;
      const steps = spec.steps ?? HEAT_STEPS;
      while (step < spec.top && h > steps[step]) step++;
      return P.c(GLOW[step]);
    });
    // Licks tear off a tip, rise and cool: orange over red, then a red speck, then gone.
    for (const l of spec.licks) {
      const g = tongues[l.tongue];
      const p = (f / LOOP + l.off) % 1;
      if (p > 0.7) continue;
      const tipY = foot - Math.round(g.h);
      const x = Math.round(g.x + g.lean + l.drift * p * 3);
      const y = tipY - 1 - Math.round(p * 7);
      if (y < 0) continue;
      if (p < 0.4) {
        t.set(x, y, P.c(p < 0.2 ? 'yellow0' : 'orange0'));
        t.set(x, y + 1, P.c('red1'));
      } else {
        t.set(x, y, P.c('red1'));
      }
    }
    return t;
  };
}

/* ------------------------------------------------------------ plumes -- */

/** Dark wood smoke, darkest first; the lightest step is the edge facing the light. */
const PLUME = ['rock0', 'rock1', 'rock2', 'rock3'];
/** One step lighter: the smoke thins as it rises. */
const PLUME_HIGH = ['rock1', 'rock2', 'rock3', 'rock4'];
/** Rows from the top over which the plume thins, and over which it frays into the air. */
const PLUME_THIN = 13;
const PLUME_FADE = 6;
/** Puffs rise PLUME_RISE pixels a frame, LOOP × PLUME_RISE apart, so frame LOOP is frame 0. */
const PLUME_RISE = 2;
const PLUME_GAP = LOOP * PLUME_RISE;
/** Column of the leaning plume's foot (east); the west one stands mirrored on w − 1 − this. */
const LEAN_FOOT = 5;
/** Pixels the leaning plume's top lies downwind of its foot. */
const LEAN = 11;

/**
 * The puffs of a plume, every property a function of the height alone:
 * puffs grow and waver as they rise, and a side billow turns around each
 * one, so the plume churns. `lean(y)` shifts each row downwind; there the
 * wind also tears a trailing billow off the upper puffs.
 */
function plumePuffs(f, footX, lean) {
  const axis = (y) => footX + Math.sin(y * 0.3) * 1.1 * Math.min(1, (31 - y) / 12) + lean(y);
  const radius = (y) => 2.1 + (31 - y) * 0.1;
  const puffs = [];
  for (let n = -1; n < 4; n++) {
    const y = 31 - (n * PLUME_GAP + f * PLUME_RISE);
    const r = radius(y);
    puffs.push({ x: axis(y), y, r });
    // Smaller billows on the axis between the big ones keep the plume whole.
    for (const o of [PLUME_GAP / 4, (PLUME_GAP * 3) / 4]) puffs.push({ x: axis(y + o), y: y + o, r: radius(y + o) * 0.72 });
    // The side billow, half a gap below, swings round the axis as it rises: the plume churns.
    const ys = y + PLUME_GAP / 2;
    puffs.push({ x: axis(ys) + Math.sin(ys * 0.42 + 0.8) * r * 0.6, y: ys, r: radius(ys) * 0.85 });
    if (lean(y) !== 0 && 31 - y > 10) puffs.push({ x: axis(y) + r * 0.7, y: y + 1, r: r * 0.7 });
  }
  // The thread at the foot stays put: it is where the smoke leaves the flames.
  puffs.push({ x: footX, y: 31.2, r: 1.5 }, { x: axis(29.4), y: 29.4, r: 1.7 });
  return puffs;
}

/** Lit from below at the foot by the flames, from the upper left everywhere else; thinner and frayed high up. */
function plumeTex(w, puffs, frayShift) {
  const t = new k.Tex(w, 32);
  fx.billow(t, puffs, PLUME, (x, y, nx, ny) => (y === 31 && ny > 0 ? 'red0' : null));
  const up = PLUME.map((n) => P.c(n));
  t.each((x, y) => {
    const v = t.get(x, y);
    const step = up.indexOf(v);
    return y < PLUME_THIN && step >= 0 ? P.c(PLUME_HIGH[step]) : undefined;
  });
  const fray = k.fbm(64, 8, 2, 151);
  for (let y = 0; y < PLUME_FADE; y++) {
    for (let x = 0; x < w; x++) if (fray(x + frayShift, y) < 0.22 + ((PLUME_FADE - y) / PLUME_FADE) * 0.33) t.set(x, y, 0);
  }
  return t;
}

function plume(f) {
  return plumeTex(16, plumePuffs(f, 8, () => 0), 0);
}

/** How far downwind row y of a leaning plume lies: little near the flames, more as the smoke rises into the wind. */
function leanAt(y) {
  return LEAN * Math.pow(Math.max(0, 31 - y) / 31, 1.5);
}

function plumeEast(f) {
  return plumeTex(24, plumePuffs(f, LEAN_FOOT + 0.5, leanAt), 0);
}

/** The east plume's form mirrored; billow() lights the mirrored puffs afresh from the upper left. */
function plumeWest(f) {
  const puffs = plumePuffs(f, LEAN_FOOT + 0.5, leanAt).map((p) => ({ ...p, x: 24 - p.x }));
  return plumeTex(24, puffs, 24);
}

/* ------------------------------------------------------ charred trunk -- */

/**
 * Burnt snags: a tall broken trunk with a branch stub, a leaning one and a
 * low stump beside a fallen piece. Charcoal is cracked across; the lit left
 * edge is the cool grey of ash, the shadow side dark brown.
 */
const TRUNKS = [
  { rows: [
    '........',
    '...b....',
    '...rb...',
    '...rb...',
    '..rsb...',
    '..rsb.b.',
    '..rsbbb.',
    '..rsb...',
    '..rbb...',
    '..rsb...',
    '..rsb...',
    '..rbb...',
    '..rsb...',
    '..rsbe..',
    '.rrsbb..',
    '.rssbbb.',
  ] },
  { rows: [
    '........',
    '........',
    '........',
    '.....b..',
    '....rb..',
    '....rb..',
    '...rsb..',
    '...rbb..',
    '..rsb...',
    '..rsb...',
    '..rbb...',
    '.rsb....',
    '.rsb....',
    '.rsbb...',
    '.rssbb..',
    'rrssbb..',
  ] },
  { rows: [
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '..rb....',
    '.rsbb...',
    '.rsbb...',
    '.rbsb...',
    '.rsbe...',
    'rssbb.rb',
    'rssbbrsb',
  ] },
];
const TRUNK_KEY = { r: 'rock0', s: 'soil0', b: 'bark0', e: 'orange0' };

function charredTrunk(v) {
  return k.grid(TRUNKS[v].rows, TRUNK_KEY);
}

/* ---------------------------------------------------------- textures -- */

/** Stamp a 2-px fleck (two pixels wide, optionally two high) at (x, y), wrapping. */
function fleck(t, x, y, name, tall) {
  const c = P.c(name);
  t.set(x, y, c);
  t.set(x + 1, y, c);
  if (tall) t.set(x, y + 1, c);
}

/** Ash and charcoal under the flames, glowing spots that pulse between two heats. */
function embers(f) {
  const t = new k.Tex(64, 64, true);
  const ash = k.fbm(64, 8, 3, 161);
  const heat = k.fbm(64, 16, 2, 163);
  const pulse = k.noise(64, 4, 167);
  t.each((x, y) => {
    const h = heat(x, y) + (f === 1 ? 0.05 : -0.01) * (pulse(x, y) > 0.45 ? 1 : 0.3);
    if (h > 0.8) return P.c('yellow0');
    if (h > 0.75) return P.c('orange0');
    if (h > 0.7) return P.c('red1');
    if (h > 0.65) return P.c('red0');
    return P.c(ash(x, y) < 0.45 ? 'pine0' : 'rock0');
  });
  // Grey ash flakes on the dark ground.
  for (let by = 0; by < 64; by += 8) {
    for (let bx = 0; bx < 64; bx += 8) {
      if (k.hash(bx, by, 169) > 0.55) continue;
      const x = bx + Math.floor(k.hash(bx, by, 171) * 6);
      const y = by + Math.floor(k.hash(bx, by, 173) * 6);
      if (heat(x, y) < 0.55) fleck(t, x, y, 'rock1', false);
    }
  }
  return t;
}

/**
 * Burnt earth: grey ash over charred soil, with charcoal patches and light ash
 * flecks — light enough that the dark charred trunks stand out on it.
 */
function groundBurnt() {
  const t = new k.Tex(64, 64, true);
  const base = k.fbm(64, 6, 3, 181);
  const char = k.fbm(64, 12, 2, 183);
  // Mostly grey ash: one step darker overall read as a black hole in light ground (sand, steppe).
  t.each((x, y) => {
    if (char(x, y) > 0.72) return P.c('pine0');
    const b = base(x, y);
    return P.c(b < 0.3 ? 'soil0' : b < 0.48 ? 'rock0' : b < 0.68 ? 'rock1' : 'rock2');
  });
  for (let by = 0; by < 64; by += 6) {
    for (let bx = 0; bx < 64; bx += 6) {
      const roll = k.hash(bx, by, 185);
      if (roll > 0.5) continue;
      const x = bx + Math.floor(k.hash(bx, by, 187) * 4);
      const y = by + Math.floor(k.hash(bx, by, 189) * 4);
      fleck(t, x, y, roll < 0.12 ? 'rock3' : roll < 0.3 ? 'rock2' : 'rock0', k.hash(bx, by, 191) < 0.4);
    }
  }
  return t;
}

module.exports = {
  sprites: {
    flame_small: flame(FLAMES.small),
    flame_medium: flame(FLAMES.medium),
    flame_large: flame(FLAMES.large),
    smoke_plume: plume,
    smoke_plume_east: plumeEast,
    smoke_plume_west: plumeWest,
    charred_trunk: charredTrunk,
  },
  textures: { embers, ground_burnt: groundBurnt },
};
