/* =============================================================================
 * Gaia Reborn — frost: the status bar's thermometer and the falling snow
 * -----------------------------------------------------------------------------
 *   hud_temp   19 × 17 on the white temperature cloud: 0 the thermometer with
 *              its column high; 1 cold (below 10 °C): the column sunk to the
 *              bulb, a large six-armed snowflake behind the glass. The flake
 *              stands with one arm up and one down, so the tube hides those
 *              two and the four arms at ±30° reach out beside it; the top
 *              arm's fork shows above the tube, the bottom one hides behind
 *              the bulb. Clear blue lines on a pale ice silhouette.
 *   snow_l/m   six-armed flakes falling over the map, tumbling: each loop flips
 *              the flake half a turn about its upright arm (from behind it looks
 *              the same, so the loop is seamless); turning it in its plane would
 *              smear the arms on so few pixels. White bodies with an ice-blue
 *              rim on the shadow side, read on dark sea and on white ice.
 *   snow_s     a tiny twinkling crystal.
 * Light from the upper left throughout.
 * ========================================================================== */
'use strict';

const K = require('./kit');

/* ------------------------------------------------------------ hud_temp ---- */

/** Glass tube and bulb; `cold` sinks the red column to the bulb's neck. */
const thermo = (cold) => {
  const col = (y) => (cold && y < 10 ? 'g' : 'r');
  const tube = (y) => `.......kW${y === 3 ? 'g' : col(y)}sk.......`;
  return K.grid([
    '...................',
    '...................',
    '........kkk........',
    ...[3, 4, 5, 6, 7, 8, 9, 10].map(tube),
    '......kRRrrsk......',
    '.....kRWWRrrsk.....',
    '.....kRWRrrdsk.....',
    '.....kRRrrrdsk.....',
    '......kRrrddk......',
    '.......kkkkk.......',
  ], { k: 'ink1', W: 'ice4', g: 'ice3', s: 'rock3', r: 'red1', R: 'orange0', d: 'red0' });
};

/** Centre of the flake: on the tube, above the bulb. */
const FX = 9;
const FY = 7;

/**
 * The flake's line pixels in the upper-right quadrant as [dx, dy] from the centre
 * (dy up is negative), mirrored into the other three: the vertical arm, the arm at
 * 30° in 2:1 steps with a V near its tip (one prong up, one along the lower arm),
 * and the top arm's fork above the tube.
 */
const FLAKE_Q = [
  [0, -1], [0, -2], [0, -3], [0, -4], [0, -5], [0, -6], [0, -7],
  [1, -1], [2, -1], [3, -2], [4, -2], [5, -3], [6, -3], [7, -4], [8, -4],
  [5, -4], [5, -5], [5, -6],
  [6, -2], [7, -2],
  [1, -6], [2, -7],
  [0, 0],
];

/** Arm axes the pale silhouette is grown around: up and 30° up-right, mirrored. */
const ARMS = [[0, -7.5], [8, -4.5]];

function hudFlake() {
  const t = new K.Tex(19, 17);
  const both = (dx, dy, v) => {
    for (const sx of [1, -1]) for (const sy of [1, -1]) K.put(t, FX + sx * dx, FY + sy * dy, v);
  };
  // Silhouette: within 1.6 px of an arm axis, so the flake reads as one star-shaped body.
  for (let dy = -FY; dy <= 0; dy++) {
    for (let dx = 0; dx <= 9; dx++) {
      const d = Math.min(...ARMS.map(([ax, ay]) => {
        const s = Math.max(0, Math.min(1, (dx * ax + dy * ay) / (ax * ax + ay * ay)));
        return Math.hypot(dx - s * ax, dy - s * ay);
      }));
      if (d <= 1.6) both(dx, dy, 'ice2');
    }
  }
  for (const [dx, dy] of FLAKE_Q) both(dx, dy, 'water3');
  // Fringe of pale ice round the prongs, so the V reads as part of the body and not as loose strokes.
  const lines = K.copy(t);
  lines.each((x, y) => (lines.get(x, y) === K.c('water3') ? undefined : 0));
  K.outline(lines, 'ice2');
  lines.each((x, y) => (lines.get(x, y) === K.c('ice2') && !t.get(x, y) ? K.put(t, x, y, 'ice2') && undefined : undefined));
  // The tips catch the light: one clear blue pixel at each arm's end.
  both(8, -4, 'water4');
  both(0, -7, 'water4');
  return t;
}

function hudTemp(f) {
  const t = f === 1 ? hudFlake() : new K.Tex(19, 17);
  return t.stamp(thermo(f === 1), 0, 0);
}

/* ------------------------------------------------------- falling snow ---- */

/** Distance from (px, py) to the segment (ax, ay)–(bx, by). */
function seg(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const s = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - ax - s * vx, py - ay - s * vy);
}

/**
 * A six-armed flake in an n × n box, one arm upright, squashed to `flat` of its width:
 * arms of length `len`, a V of prongs `prong` long at `at` of the arm (0 = none), line half-width `hw`.
 * Coverage is sampled 4 × 4 per pixel: mostly covered pixels are white, about half covered ones pale ice.
 */
function fallingFlake(n, { flat, len, at, prong, hw, hub }) {
  const c = (n - 1) / 2;
  const segs = [];
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    const ux = Math.sin(a);
    const uy = -Math.cos(a);
    segs.push([0, 0, ux * len, uy * len]);
    if (prong > 0) {
      const rx = ux * len * at;
      const ry = uy * len * at;
      for (const side of [1, -1]) {
        const b = a + side * (Math.PI / 3);
        segs.push([rx, ry, rx + Math.sin(b) * prong, ry - Math.cos(b) * prong]);
      }
    }
  }
  const cover = (x, y) => {
    let hit = 0;
    for (let sy = 0; sy < 4; sy++) {
      for (let sx = 0; sx < 4; sx++) {
        const px = (x + (sx + 0.5) / 4 - 0.5 - c) / flat;
        const py = y + (sy + 0.5) / 4 - 0.5 - c;
        const inside = Math.hypot(px, py) <= hub || segs.some(([ax, ay, bx, by]) => seg(px, py, ax, ay, bx, by) <= hw);
        if (inside) hit++;
      }
    }
    return hit / 16;
  };
  const t = new K.Tex(n, n);
  t.each((x, y) => {
    const v = cover(x, y);
    if (v >= 0.45) return K.c(v >= 0.7 ? 'ice4' : 'ice3');
    return undefined;
  });
  // The centre catches the most light.
  if (t.get(c, c)) K.put(t, c, c, 'glowT5');
  // Rim on the shadow side only (below and right of the body), so the gaps between the arms stay open.
  const body = K.copy(t);
  t.each((x, y) => (!body.get(x, y) && (body.get(x - 1, y) || body.get(x, y - 1)) ? K.c(body.get(x - 1, y - 1) ? 'ice0' : 'ice1') : undefined));
  return t;
}

/** Frame f of `frames`: flipped f · 180° / frames about the upright arm, never thinner than `edge` (edge-on it would vanish). */
const flipping = (n, frames, shape) => (f) => fallingFlake(n, { ...shape, flat: Math.max(shape.edge, Math.abs(Math.cos((Math.PI * f) / frames))) });

const SNOW_S = [
  ['.....', '..r..', '.rWr.', '..r..', '.....'],
  ['..r..', '..w..', 'rwWwr', '..w..', '..r..'],
];

module.exports = {
  sprites: {
    hud_temp: hudTemp,
    snow_l: flipping(11, 6, { len: 4.6, at: 0.62, prong: 1.4, hw: 0.45, hub: 0.6, edge: 0.3 }),
    snow_m: flipping(7, 4, { len: 2.7, at: 0, prong: 0, hw: 0.45, hub: 0.5, edge: 0.35 }),
    snow_s: (f) => K.grid(SNOW_S[f], { r: 'ice1', w: 'ice3', W: 'glowT5' }),
  },
};
