/* =============================================================================
 * SimEarth 2.0 — termite mound on the savanna
 * -----------------------------------------------------------------------------
 * A cathedral mound (Macrotermes) of red-orange savanna clay in the map's 3/4
 * relief, built like the volcano cones (src/landridgedraw.ts): a heightfield
 * over an elliptical footprint — a broad base dome ringed by an apron of
 * loose spoil, a massive main tower and lower buttress towers clustered
 * against it, each a rounded body with a cap — seen from the south at 45°,
 * where a ground point that rises z px shows z px higher. Every screen pixel
 * casts its ray into the field and takes the nearest surface it meets, so the
 * caps, the base's sunlit top and the apron show from above and the towers
 * hide what lies behind them. Light from the upper left, by the surface
 * normal: caps and west faces bright, east and lower right faces dark, a
 * dithered gradient across each body and the whole mound darker to its lower
 * right; the towers shade the base, the mound lays a shadow in the savanna's
 * dark straw beyond its east foot, and the skyline gets a one-step darker rim.
 *   frames 0–7  one quiet loop: the mound never changes, only a few termites
 *               (2 px: pale body, dark head in front) walk in and out of the
 *               opening at the south foot, 1 px a frame; time enters only as
 *               f mod LOOP along their trails, so frame 8 would be frame 0.
 *               The runtime carries the trails on over the neighbouring tiles.
 * Style: docs/ereignisse-2026-10/stil.md · contract: tools/fx/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');
const P = require('../terrain/palette');

const W = 24;
const H = 24;
const LOOP = 8;

/* ------------------------------------------------------- the heightfield -- */

/** Ground footprint: an ellipse over the full width whose south edge lies on row 23. */
const FOOT = { cx: 12, cy: 18.6, rx: 12.2, ry: 5.3 };
/** Rise of the base dome, px; the share of the footprint the spoil apron rings it with, and how lumpy it is, px. */
const BASE_Z = 5;
const APRON = 0.2;
const APRON_Z = 0.7;
/**
 * Towers: ground centre, foot radius and rise, px. The profile H·(1 − d^a)^b
 * keeps the flanks steep and rounds a cap on top that shows from above.
 */
const TOWERS = [
  { x: 11, y: 16.4, r: 4.9, z: 11.6, a: 2.2, b: 0.55 },
  { x: 16.6, y: 17.6, r: 3.5, z: 8.2, a: 2.2, b: 0.5 },
  { x: 5.6, y: 18.8, r: 3.1, z: 6.2, a: 2.2, b: 0.5 },
  { x: 14.6, y: 14.8, r: 2.3, z: 9, a: 2.2, b: 0.5 },
];
const LUMPS = k.noise(24, 6, 861);

function towerRise(px, py) {
  let z = 0;
  for (const t of TOWERS) {
    const d = Math.hypot(px - t.x, py - t.y) / t.r;
    if (d < 1) z = Math.max(z, t.z * Math.pow(1 - Math.pow(d, t.a), t.b));
  }
  return z;
}

/** Footprint distance, 1 at the edge. */
function footQ(px, py) {
  return Math.hypot((px - FOOT.cx) / FOOT.rx, (py - FOOT.cy) / FOOT.ry);
}

/** Rise at ground point (px, py), or -1 off the footprint. */
function rise(px, py) {
  const q = footQ(px, py);
  if (q >= 1) return -1;
  // A low dome over the whole footprint, lumpy spoil on its outer ring.
  const base = BASE_Z * Math.pow(1 - q * q, 0.9) + APRON_Z * Math.min(1, (1 - q) / APRON) * (LUMPS(px, py) - 0.3);
  return Math.max(base, towerRise(px, py));
}

const zAt = (px, py) => Math.max(0, rise(px, py));

/* ---------------------------------------------------------------- light -- */

/** Towards the light: from the west, a little from the north, and from above. */
const LIGHT = (() => {
  const v = [-0.55, -0.08, 0.83];
  const n = Math.hypot(...v);
  return v.map((a) => a / n);
})();

/** Clay from deep shade to the sunlit caps; the light value each step starts at. */
const CLAY = ['bark1', 'laterite0', 'laterite1', 'laterite2', 'laterite3', 'sand2'];
const CUTS = [-Infinity, -0.42, -0.05, 0.28, 0.58, 0.86];
/** Ground the towers shade, one step darker than the savanna's own straw. */
const SHADOW = 'straw0';
/** Rise above which a tower shows its sunlit cap tone. */
const CAP_Z = 4.5;
/** The ground shadow: the footprint shifted east-south-east, where it lies beyond the footprint. */
const SHADOW_SHIFT = [2.4, 1.1];

/** Whether a ray from (px, py, z) towards the light runs into a tower. */
function inShadow(px, py, z) {
  for (let s = 0.5; s < 14; s += 0.5) {
    const tz = towerRise(px + LIGHT[0] * s, py + LIGHT[1] * s);
    if (tz > z + LIGHT[2] * s + 0.3) return true;
  }
  return false;
}

/** How much darker the base shows where a tower stands right beside it. */
const CREASE = 0.35;
/** How much darker the mound's lower right shows than its upper left, light units. */
const DUSK = 0.45;
/** Light spread about MID, so the body reads with a cone's contrast: pale caps, dark lower right. */
const MID = 0.4;
const CONTRAST = 1.3;

/** Share of the ground around (px, py) that stands well above z: the crease at a tower's foot, 0..1. */
function crease(px, py, z) {
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 2 * Math.PI;
    sum += Math.min(1, Math.max(0, (zAt(px + Math.cos(a) * 1.6, py + Math.sin(a) * 1.6) - z - 0.8) / 2.5));
  }
  return sum / 8;
}

/* ------------------------------------------------------------ rendering -- */

/** Ground rows between a pixel's hit and the one above it that make a skyline. */
const SKYLINE_GAP = 2.5;

/**
 * Cast every screen pixel's ray into the field, front to back: the first ground
 * point at or under it is what the pixel shows. Returns per pixel its ramp
 * step (-1 transparent, -2 ground shadow) and the ground row it hit.
 */
function render() {
  const step = new Int8Array(W * H).fill(-1);
  const hitY = new Float32Array(W * H).fill(-1);
  for (let sy = 0; sy < H; sy++) {
    for (let x = 0; x < W; x++) {
      const px = x + 0.5;
      const ray = sy + 0.5;
      let gy = -1;
      for (let y = H + 0.95; y >= ray; y -= 0.05) {
        if (zAt(px, y) >= y - ray) { gy = y; break; }
      }
      const o = sy * W + x;
      if (gy < 0) gy = ray;
      const z = rise(px, gy);
      if (z < 0) {
        // Bare savanna: the mound's shadow beyond its east and south-east foot.
        if (footQ(px - SHADOW_SHIFT[0], gy - SHADOW_SHIFT[1]) < 1) step[o] = -2;
        continue;
      }
      const e = 0.5;
      const gx = (zAt(px + e, gy) - zAt(px - e, gy)) / (2 * e);
      const gyd = (zAt(px, gy + e) - zAt(px, gy - e)) / (2 * e);
      const n = Math.hypot(gx, gyd, 1);
      let lit = (-gx * LIGHT[0] - gyd * LIGHT[1] + LIGHT[2]) / n;
      if (towerRise(px, gy) < z - 0.01) {
        if (inShadow(px, gy, z)) lit -= 0.3;
        lit -= CREASE * crease(px, gy, z);
      }
      // The whole body darkens towards its lower right, like a cone's flank.
      lit -= DUSK * ((px - FOOT.cx) / FOOT.rx + (gy - FOOT.cy) / FOOT.ry) / 2;
      lit = MID + (lit - MID) * CONTRAST;
      lit += ((k.BAYER4[sy & 3][x & 3] + 0.5) / 16 - 0.5) * 0.16;
      let v = 0;
      while (v + 1 < CLAY.length && lit >= CUTS[v + 1]) v++;
      // The palest clay only on the towers' upper flanks and caps, so the base keeps its colour.
      if (v === CLAY.length - 1 && (towerRise(px, gy) < z - 0.01 || z < CAP_Z)) v--;
      step[o] = v;
      hitY[o] = gy;
    }
  }
  // Skyline: a lifted pixel with nothing above it, or far ground right above it, one step darker.
  const out = step.slice();
  for (let sy = 0; sy < H; sy++) {
    for (let x = 0; x < W; x++) {
      const o = sy * W + x;
      if (step[o] < 0 || zAt(x + 0.5, hitY[o]) < 1) continue;
      const above = sy > 0 && step[o - W] >= 0 ? hitY[o - W] : -1;
      if (above < 0 || hitY[o] - above >= SKYLINE_GAP) out[o] = Math.max(0, step[o] - 1);
    }
  }
  return out;
}

const STEPS = render();

/** Vents, screen pixels on the towers; the opening on the south foot of the base. */
const VENTS = [[9, 9], [17, 12], [5, 16], [13, 14]];
const DOOR = [[11, 19], [12, 19], [11, 20], [12, 20], [10, 20]];

function mound(t) {
  for (let i = 0; i < W * H; i++) {
    if (STEPS[i] >= 0) t.px[i] = P.c(CLAY[STEPS[i]]);
    else if (STEPS[i] === -2) t.px[i] = P.c(SHADOW);
  }
  for (const [x, y] of VENTS) t.set(x, y, P.c('soil0'));
  for (const [x, y] of DOOR) t.set(x, y, P.c(y === 19 ? 'bark1' : 'soil0'));
}

/* -------------------------------------------------------- the termites -- */

/**
 * Two short trails between the opening and the footprint's south edge, each
 * a list of pixels in walking order, walked 1 px a frame: one out of the
 * opening, one into it. Termites sit at the listed offsets mod LOOP along a
 * trail; a termite is its dark head and the pale body pixel behind it. Pixels
 * inside the opening or below the sprite are hidden: there the runtime's
 * trails over the neighbouring tiles take over.
 */
const TRAILS = [
  { path: [[12, 20], [12, 21], [13, 22], [13, 23], [14, 24], [14, 25], [15, 26], [15, 27]], at: [0, 4] },
  { path: [[7, 27], [8, 26], [8, 25], [9, 24], [9, 23], [10, 22], [10, 21], [11, 20]], at: [2, 6] },
];
const BODY = 'sand4';
const HEAD = 'laterite0';

function termites(t, f) {
  const hidden = ([x, y]) => y >= H || DOOR.some(([dx, dy]) => dx === x && dy === y);
  for (const { path, at } of TRAILS) {
    path.forEach((head, i) => {
      if (!at.includes((((i - f) % LOOP) + LOOP) % LOOP)) return;
      const body = path[i - 1];
      if (body && !hidden(body)) t.set(body[0], body[1], P.c(BODY));
      if (!hidden(head)) t.set(head[0], head[1], P.c(HEAD));
    });
  }
}

/* ------------------------------------------------------------ frames -- */

function termiteMound(f) {
  const t = new k.Tex(W, H);
  mound(t);
  termites(t, f % LOOP);
  return t;
}

module.exports = {
  sprites: { termite_mound: termiteMound },
  textures: {},
};
