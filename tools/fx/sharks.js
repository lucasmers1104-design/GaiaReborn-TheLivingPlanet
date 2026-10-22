/* =============================================================================
 * SimEarth 2.0 — shark fins circling
 * -----------------------------------------------------------------------------
 * Two dorsal fins, a big one and a smaller one 140° behind it, circle
 * counter-clockwise (seen from above) round a ground circle that the map's
 * 3/4 view (from the south at 45°) squashes into a 24 × 14 px ellipse.
 * Each fin is a thin plate standing on the path, aligned with it: projected
 * per frame, it shows its profile on the near and far side (leading edge
 * sloping back, trailing edge concave, the tip hanging back) and turns into
 * a 1–2 px sliver at the east and west ends. Light from the upper left by
 * the outline. Around it everything stays transparent; drawn are only a
 * foam V at each fin's bow and the stirred, lighter water it leaves on the
 * path, which stays where it is and thins out with age (each pixel keeps
 * its own hash, so it fades once and never flickers back).
 *   frames 0–3    the fins break the surface and rise (lap steps 20–23),
 *                 a ripple ring spreading where each came up
 *   frames 4–27   one lap of 24 steps, 15° a frame, looped by the runtime;
 *                 time enters only as the step, so 27 runs on into 4 again
 *   frames 28–31  they sink (steps 0–3) and the water settles
 * Style: docs/ereignisse-2026-10/stil.md · contract: tools/fx/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');
const P = require('../terrain/palette');

const W = 32;
const H = 24;
const RISE = 4;
const LAP = 24;
const SINK = 4;
const STEP = (Math.PI * 2) / LAP;

/**
 * Path centre, its east–west radius (ground px) and the view's north–south
 * squash: 24 × 13 px between the pixel edges at x 4 and 28, waterline rows
 * 6–19. The ends fall on a pixel edge, so a fin seen edge-on there is 2 px
 * wide; the near and far waterlines fall low in their rows, not on a pixel
 * centre, so a fin's foot row never flickers.
 */
const CX = 16;
const CY = 13.3;
const R = 12;
const K = 6.5 / 12;
/**
 * The squash of a fin's own chord: harder than the ground's, so a fin
 * turned edge-on stands about as tall as in profile instead of stretching
 * up the screen along its foreshortened chord. The foam around it lies on
 * the water and keeps K.
 */
const KA = 0.25;
/** The big fin at lap step 0: on the near side, heading east. */
const THETA0 = Math.PI * 1.5;

/**
 * Big fin profile (a px forward along the path from the base centre, h px
 * up): convex leading edge sloping back to a tip that hangs past the
 * concave trailing edge.
 */
const PROFILE = [
  [2.7, 0], [2.3, 1.5], [1.5, 3.0], [0.3, 4.4], [-1.2, 5.5], [-3.1, 6.3],
  [-2.3, 5.2], [-1.7, 3.8], [-1.5, 2.2], [-1.7, 0.8], [-2.1, 0],
];
/** Plate thickness at the base, px, and the share of it left at the tip; it only shows edge-on, so it widens across the screen only. */
const THICK = 2;
const TIP_THICK = 0.3;

/** `lag` behind the big fin (rad), size, how many steps the stirred water lasts, a hash seed. */
const FINS = [
  { lag: 0, scale: 1, trail: 5, seed: 11 },
  { lag: (140 / 360) * Math.PI * 2, scale: 0.68, trail: 4, seed: 23 },
];

/** Fin tones: shaded rim, body, lit edge. */
const TONE = ['rock0', 'rock1', 'ice0'];

const put = (t, x, y, name) => t.set(x, y, P.c(name));

function inPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Screen point of the water `a` px along the path from angle th and `out` px outwards. */
function screen(th, a = 0, out = 0) {
  const e = (R + out) * Math.cos(th) - a * Math.sin(th);
  const n = (R + out) * Math.sin(th) + a * Math.cos(th);
  return [CX + e, CY - K * n];
}

/** Share of the fins above the water in frame f. */
function shown(f) {
  if (f < RISE) return (f + 1) / RISE;
  if (f < RISE + LAP) return 1;
  return (RISE + LAP + SINK - 1 - f) / SINK;
}

/**
 * Pixels of a fin at angle th, `v` of it above the water, scanline by
 * scanline: where the plate (with its thickness) crosses each row's centre
 * line; a row it crosses between two pixel centres still gets one pixel,
 * so the edge-on fin never breaks up.
 */
function finMask(th, scale, v) {
  const poly = PROFILE.map(([a, h]) => [a * scale, h * scale]);
  const top = Math.max(...poly.map((p) => p[1]));
  const a0 = Math.min(...poly.map((p) => p[0]));
  const a1 = Math.max(...poly.map((p) => p[0]));
  const drop = (1 - v) * top;
  const mask = new Uint8Array(W * H);
  const s = Math.sin(th);
  const c = Math.cos(th);
  for (let y = 0; y < H; y++) {
    const yc = y + 0.5;
    let lo = Infinity;
    let hi = -Infinity;
    for (let a = a0; a <= a1; a += 0.02) {
      const h = drop + CY - yc - K * R * s - KA * a * c;
      if (h < drop || !inPoly(poly, a, h)) continue;
      const half = (THICK / 2) * (1 - ((1 - TIP_THICK) * h) / top) * Math.abs(c);
      const x = CX + R * c - a * s;
      lo = Math.min(lo, x - half);
      hi = Math.max(hi, x + half);
    }
    if (lo > hi) continue;
    let any = false;
    for (let x = Math.ceil(lo - 0.5); x + 0.5 <= hi; x++) {
      if (x >= 0 && x < W) { mask[y * W + x] = 1; any = true; }
    }
    if (!any) {
      const x = Math.floor((lo + hi) / 2);
      if (x >= 0 && x < W) mask[y * W + x] = 1;
    }
  }
  return mask;
}

/** Draws a fin mask lit by its outline: left edge and tops lit, right edge shaded; the foot row runs on under water. */
function drawFin(t, mask) {
  const M = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!M(x, y)) continue;
      const lit = !M(x - 1, y) || (!M(x, y - 1) && M(x + 1, y));
      put(t, x, y, TONE[lit ? 2 : M(x + 1, y) ? 1 : 0]);
    }
  }
}

/** Foam V at the bow: a cushion ahead of the fin, two arms trailing back, `v` of the fin up. */
function bowWave(t, th, scale, v) {
  const front = 2.7 * scale;
  const len = 3.5 * v;
  const spread = 0.35;
  // From the arms' ends in, so the white cushion stays on top.
  for (let l = len; l >= 0; l -= 0.25) {
    for (const side of [-1, 1]) {
      const a = front + 0.4 - l * Math.cos(spread);
      const out = side * l * Math.sin(spread);
      const [x, y] = screen(th, a, out);
      put(t, Math.floor(x), Math.floor(y), l < 1 ? 'white0' : l < 0.75 * len ? 'ice3' : 'water7');
    }
  }
}

/**
 * Stirred water behind a fin, `len` steps long, on the path where the fin
 * has already passed; fresher is lighter and denser. Water passed before
 * the shark came up (more than two steps before frame 0) or after it began
 * to sink is calmer.
 */
function stirred(t, th, f, len, seed) {
  const best = new Map();
  for (let age = 0.6; age <= len; age += 0.02) {
    const [x, y] = screen(th - age * STEP);
    const key = Math.floor(y) * W + Math.floor(x);
    if (!best.has(key)) best.set(key, age);
  }
  for (const [key, age] of best) {
    const x = key % W;
    const y = Math.floor(key / W);
    if (t.get(x, y) !== 0) continue;
    const passed = f - age;
    const strength = passed < -2 ? 0 : Math.min(1, (RISE + LAP + SINK - 1 - passed) / 3.5);
    const keep = 0.9 * (1 - age / len) ** 0.7 * strength;
    const h = k.hash(x, y, seed);
    if (h >= keep) continue;
    put(t, x, y, age < 1.6 && h < 0.3 ? 'ice3' : age < 2.8 ? 'water7' : 'water6');
  }
}

/** A broken ripple ring `r` ground px round the water at angle th, `keep` of it left, its upper left arc `lit`. */
function ripple(t, th, r, keep, lit, seed) {
  const [cx, cy] = screen(th);
  const ry = r * K;
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) {
    for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const dx = (x + 0.5 - cx) / r;
      const dy = (y + 0.5 - cy) / ry;
      const d = Math.hypot(dx, dy);
      // Distance to the ellipse in px: |d − 1| over the gradient of d.
      const g = Math.hypot(dx / r, dy / ry) / Math.max(d, 1e-6);
      if (Math.abs(d - 1) / g >= 0.55 || t.get(x, y) !== 0) continue;
      if (k.hash(x - Math.floor(cx), y - Math.floor(cy), seed) >= keep) continue;
      put(t, x, y, -(dx + dy) > 0.4 ? lit : 'water7');
    }
  }
}

function frame(f) {
  const t = new k.Tex(W, H);
  const v = shown(f);
  const base = THETA0 + (f - RISE) * STEP;
  const fins = FINS.map((fin) => ({ ...fin, th: base - fin.lag }));
  // The water first, so the fins stand in it.
  for (const fin of fins) {
    // Where it came up (frames 0–2) and where it went down (30–31).
    if (f < RISE - 1) ripple(t, THETA0 - RISE * STEP - fin.lag, 1.4 + 1.3 * f, [0.95, 0.7, 0.45][f], f ? 'ice3' : 'white0', fin.seed);
    const sunk = f - (RISE + LAP + SINK - 2);
    if (sunk >= 0) ripple(t, THETA0 + (LAP + SINK - 2) * STEP - fin.lag, 1.8 + 1.3 * sunk, [0.85, 0.6][sunk], 'ice3', fin.seed + 1);
    stirred(t, fin.th, f, fin.trail, fin.seed);
  }
  // Far fin first: the near one stands in front of it.
  fins.sort((p, q) => Math.sin(q.th) - Math.sin(p.th));
  for (const fin of fins) {
    if (v <= 0) continue;
    bowWave(t, fin.th, fin.scale, v);
    drawFin(t, finMask(fin.th, fin.scale, v));
  }
  return t;
}

module.exports = {
  sprites: { shark_fins: frame },
  textures: {},
};
