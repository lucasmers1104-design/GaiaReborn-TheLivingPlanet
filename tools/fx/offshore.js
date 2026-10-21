/* =============================================================================
 * SimEarth 2.0 — the offshore oil platform
 * -----------------------------------------------------------------------------
 * A steel platform in the sea off the coast (src/oillayer.ts), seen like the
 * map's other objects: front face and a little top, light from the upper
 * left. Three jacket legs splay into the water under a girder deck; on it
 * stand the living quarters under a helideck, the drill floor with its
 * lattice derrick over the middle leg, and the process modules with a crane;
 * a flare boom reaches out to the right. Around it everything stays
 * transparent, the map's own sea shows through; only the foam at the legs
 * is drawn.
 *   frames 0–7  one working cycle, looped: the flare flickers and sways, the
 *               swell climbs each leg and a ripple spreads from it, the
 *               warning light on the crown blinks; time enters only as the
 *               phase f / LOOP, so frame 8 would be frame 0
 *   frame 8     shut down: no flame, dark windows, no light, a still ripple
 * Style: docs/ereignisse-2026-10/stil.md · contract: tools/fx/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');
const P = require('../terrain/palette');

const W = 32;
const H = 32;
const LOOP = 8;
const TAU = Math.PI * 2;

/** Top row of the deck; everything above it is measured from here. */
const D = 20;
/** Row of the waterline at the legs. */
const WATER_Y = 29;

const put = (t, x, y, name) => t.set(x, y, P.c(name));

function rect(t, x0, y0, x1, y1, name) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(t, x, y, name);
}

function line(t, x0, y0, x1, y1, name) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let s = 0; s <= n; s++) put(t, Math.round(x0 + ((x1 - x0) * s) / n), Math.round(y0 + ((y1 - y0) * s) / n), name);
}

/**
 * A block seen from the front and a little from above: roof rows y0..y1-1
 * (its back edge lighter, its right end darker), front face rows y1..y2,
 * the right column and the foot row in the block's shadow tone.
 */
function block(t, x0, x1, y0, y1, y2, face, dark) {
  rect(t, x0, y0, x1, y1 - 1, 'rock3');
  for (let x = x0; x < x1; x++) put(t, x, y0, 'rock4');
  for (let y = y0; y < y1; y++) put(t, x1, y, 'rock2');
  rect(t, x0, y1, x1, y2, face);
  for (let y = y1; y <= y2; y++) put(t, x1, y, dark);
  for (let x = x0; x <= x1; x++) put(t, x, y2, dark);
}

/* ---------------------------------------------------------- the rig -- */

/** Jacket legs: [x under the deck, x at the waterline], two pixels wide, lit on the left. */
const LEGS = [[7, 6], [15, 15], [23, 24]];

function jacket(t) {
  // X braces first, so the legs stand in front of them.
  line(t, 9, D + 4, 13, D + 8, 'rock1');
  line(t, 9, D + 8, 13, D + 4, 'rock1');
  line(t, 18, D + 4, 22, D + 8, 'rock1');
  line(t, 18, D + 8, 22, D + 4, 'rock1');
  for (const [top, foot] of LEGS) {
    for (let y = D + 4; y <= WATER_Y; y++) {
      const x = y < D + 6 ? top : foot;
      put(t, x, y, 'rock3');
      put(t, x + 1, y, 'rock1');
    }
    // In the deck's shadow, and wet at the waterline.
    put(t, top, D + 4, 'rock1');
    put(t, top + 1, D + 4, 'rock0');
    put(t, foot, WATER_Y, 'rock1');
    put(t, foot + 1, WATER_Y, 'rock0');
  }
}

function deck(t) {
  // Walkway in front of the modules, the girder face, the dark underside.
  rect(t, 6, D, 25, D, 'rock4');
  put(t, 25, D, 'rock3');
  rect(t, 6, D + 1, 25, D + 2, 'rock2');
  for (let x = 9; x <= 25; x += 4) rect(t, x, D + 1, x, D + 2, 'rock1');
  put(t, 6, D + 1, 'rock3');
  rect(t, 6, D + 3, 25, D + 3, 'rock0');
}

/** Helideck seen from above: yellow rim, dark deck, white H; its edge underneath. */
const HELIDECK = k.grid([
  '..yyyyy..',
  '.ydwdwdy.',
  'yddwwwddy',
  'yddwdwddy',
  '.yyyyyyy.',
  '.kkkkkkk.',
], { y: 'yellow0', d: 'rock1', w: 'white0', k: 'rock0' });

/** Living quarters under the helideck, left; `lit` turns the windows on. */
function quarters(t, lit) {
  block(t, 6, 11, D - 5, D - 5, D - 1, 'red1', 'red0');
  const win = lit ? 'yellow0' : 'rock0';
  for (const x of [7, 9]) { put(t, x, D - 4, win); put(t, x, D - 2, win); }
  t.stamp(HELIDECK, 3, D - 11);
  // The strut under the overhang.
  line(t, 4, D - 5, 5, D - 4, 'rock1');
}

/** Drill floor and the lattice derrick on it, over the middle leg. */
function derrick(t) {
  block(t, 12, 19, D - 4, D - 3, D - 1, 'rock2', 'rock1');
  for (let y = D - 13; y <= D - 5; y++) {
    const up = D - 5 - y;
    const l = 13 + Math.floor(up / 4);
    const r = 31 - l;
    put(t, l, y, 'rock3');
    put(t, r, y, 'rock1');
    // Girts every four rows; between them an X.
    const o = up % 4;
    if (o === 0) { for (let x = l + 1; x < r; x++) put(t, x, y, 'rock2'); continue; }
    if (r - l - 1 >= 4) {
      const i = o === 2 ? 2 : 1;
      put(t, l + i, y, 'rock2');
      put(t, r - i, y, 'rock2');
    } else {
      put(t, o === 2 ? r - 1 : l + 1, y, 'rock2');
    }
  }
  // Crown block and sheave.
  rect(t, 14, D - 14, 17, D - 14, 'rock2');
  put(t, 14, D - 14, 'rock3');
  put(t, 17, D - 14, 'rock1');
  put(t, 15, D - 15, 'rock3');
  put(t, 16, D - 15, 'rock1');
}

/** Process modules right, the crane on top of them. */
function modules(t) {
  block(t, 19, 24, D - 5, D - 4, D - 1, 'yellow0', 'orange0');
  block(t, 20, 22, D - 8, D - 7, D - 6, 'orange0', 'red1');
  // Crane: pedestal, cab and a jib raised to the upper left.
  rect(t, 24, D - 8, 24, D - 6, 'rock2');
  put(t, 23, D - 9, 'yellow0');
  put(t, 24, D - 9, 'orange0');
  line(t, 22, D - 10, 19, D - 13, 'yellow0');
  put(t, 19, D - 12, 'rock1');
}

/** Flare boom from the deck's right end up to the burner tip (its left pixel). */
const TIP = [27, D - 7];

function boom(t) {
  line(t, 25, D - 1, 27, D - 6, 'rock3');
  line(t, 26, D - 1, 28, D - 6, 'rock1');
  put(t, TIP[0], TIP[1], 'rock0');
  put(t, TIP[0] + 1, TIP[1], 'rock0');
}

/* ---------------------------------------------------------- the flare -- */

/** Heat from the edge in: the dark rim, then ever hotter. */
const GLOW = ['red1', 'orange0', 'yellow0', 'white0'];

/**
 * The flame over the tip at phase ph: a main tongue leaning away with the
 * wind, pulsing in height and swaying its point, two small tongues pulsing
 * against it, hottest a little above the burner; once a loop a lick tears
 * off the point, rises and goes out.
 */
function flame(t, ph) {
  const cx = TIP[0] + 1;
  const base = TIP[1] - 1;
  const tongues = [
    { x: cx, h: 7.4 + 1.2 * Math.sin(TAU * ph) + 0.6 * Math.sin(TAU * 2 * ph + 1.3), w: 2.8, lean: 0.5, sway: 1.3 * Math.sin(TAU * ph + 0.6) },
    { x: cx - 0.6, h: 3.6 + 1.3 * Math.sin(TAU * ph + 2.6), w: 1.8, lean: -0.6, sway: 0.5 * Math.sin(TAU * 2 * ph) },
    { x: cx + 1.2, h: 3.2 + 1.2 * Math.sin(TAU * ph + 4.4), w: 1.7, lean: 1.1, sway: 0 },
  ];
  /** Heat of tongue g at (x, y), or -1 outside it. */
  const heatOf = (g, x, y) => {
    const u = (base - y + 0.5) / g.h;
    if (y > base || u > 1) return -1;
    const half = g.w * Math.pow(1 - u, 0.9) * (0.55 + 1.6 * u - 1.2 * u * u);
    const d = Math.abs(x + 0.5 - (g.x + g.lean * u + u * u * g.sway)) / half;
    if (d > 1) return -1;
    return (1 - d) * 0.65 + (1 - Math.abs(u - 0.2) * 1.4) * 0.6;
  };
  const heat = (x, y) => Math.max(...tongues.map((g) => heatOf(g, x, y)));
  const top = Math.max(...tongues.map((g) => g.h));
  for (let y = base; y > base - 11; y--) {
    for (let x = cx - 4; x <= cx + 5; x++) {
      const v = heat(x, y);
      if (v < 0) continue;
      let step = v > 1.1 ? 3 : v > 0.7 ? 2 : v > 0.38 ? 1 : 0;
      // The edge glows darker: orange low down, red towards the point.
      if (heat(x - 1, y) < 0 || heat(x + 1, y) < 0 || heat(x, y - 1) < 0) step = Math.min(step, (base - y + 0.5) / top > 0.72 ? 0 : 1);
      put(t, x, y, GLOW[step]);
    }
  }
  const g = tongues[0];
  const lp = (ph + 0.75) % 1;
  if (lp < 0.375) put(t, Math.round(g.x + g.lean + g.sway - 0.5), Math.round(base - g.h - lp * LOOP), lp < 0.125 ? 'orange0' : 'red1');
}

/* ---------------------------------------------------------- the water -- */

/**
 * Foam at the legs at phase ph: a rim hugging each leg at the waterline
 * that climbs it on the swell, and a ripple spreading out in front of it,
 * lit on its upper left, breaking into dashes and narrowing to its front.
 * Each leg runs the same cycle three frames after the one before.
 * `calm`: the rim and a still ripple only.
 */
function water(t, ph, calm) {
  LEGS.forEach(([, x0], i) => {
    const p = (ph + (i * 3) / LOOP) % 1;
    put(t, x0 - 1, WATER_Y, 'water7');
    put(t, x0 + 2, WATER_Y, 'water7');
    for (let x = x0 - 1; x <= x0 + 2; x++) put(t, x, WATER_Y + 1, 'water7');
    if (calm) {
      for (let x = x0 - 2; x <= x0 + 3; x++) put(t, x, WATER_Y + 2, 'water6');
      return;
    }
    if (p < 0.375) {
      put(t, x0, WATER_Y, 'water7');
      put(t, x0 + 1, WATER_Y, 'water7');
      put(t, x0 - 1, WATER_Y - 1, 'water7');
      put(t, x0 + 2, WATER_Y - 1, 'water7');
    }
    const cx = x0 + 1;
    const rx = 3 + p * 3;
    const ry = rx * 0.4;
    const STEPS = 96;
    for (let s = 0; s < STEPS; s++) {
      const a = (s / STEPS) * TAU;
      const front = Math.sin(a);
      if (front < -0.35 + 0.9 * p) continue;
      if (k.hash(Math.floor((s / STEPS) * 14), i, 907) < p * 0.55) continue;
      const x = Math.round(cx + rx * Math.cos(a) - 0.5);
      const y = Math.round(WATER_Y + ry * front);
      if (t.get(x, y) !== 0) continue;
      const lit = -(Math.cos(a) * 0.6 + front * 0.8) > -0.1 && p < 0.6;
      put(t, x, y, lit ? 'water7' : 'water6');
    }
  });
}

/* ------------------------------------------------------------ frames -- */

function platform(f) {
  const t = new k.Tex(W, H);
  const working = f < LOOP;
  const ph = f / LOOP;
  jacket(t);
  deck(t);
  derrick(t);
  quarters(t, working);
  modules(t);
  boom(t);
  if (working) {
    flame(t, ph);
    // Warning light on the crown, one blink a loop.
    if (f < 2) put(t, 16, D - 15, 'red1');
  }
  water(t, ph, !working);
  return t;
}

module.exports = {
  sprites: { oil_platform: platform },
  textures: {},
};
