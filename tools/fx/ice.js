/* =============================================================================
 * SimEarth 2.0 — sea ice calving art
 * -----------------------------------------------------------------------------
 * A floe breaking off the pack edge (src/icecalving.ts): the crack running
 * through the edge floe, the slab tipping into the sea, the splash with its
 * ring, the small berg bobbing as it drifts off, the berg melting away.
 * Only the ice and water ramps, the way the pack ice texture
 * (tools/terrain/cold.js) and its shore draw them: snowy top ice4 with ice3
 * pits and lower-right rim, the shaded front face ice2 / ice1 / ice0 down to
 * the waterline, foam water7, ice under water a dither of water6.
 * Light from the upper left. Sprites are never rotated, so the crack and the
 * slab come in a wide (water north or south) and a tall (east, west) form.
 * Style: docs/ereignisse-2026-10/stil.md · contract: tools/fx/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');
const P = require('../terrain/palette');

const S = 16;

function inPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Pixel-centre test of a polygon, as an inside(x, y) function. */
const poly = (pts) => (x, y) => inPoly(pts, x + 0.5, y + 0.5);

/** The polygon `pts` moved by (dx, dy) and scaled by s about (cx, cy). */
const moved = (pts, dx, dy, s = 1, cx = 8, cy = 8) => pts.map(([x, y]) => [cx + (x - cx) * s + dx, cy + (y - cy) * s + dy]);

/**
 * An ice block floating in the sea: the top face `top`, `face` rows of
 * shaded front face under its southern rim, foam along the waterline and
 * the ice under water around its foot. `tilt` 0..1 turns the top face away
 * from the light (a slab tipping over): fewer ice4, more ice3 and ice2.
 * `foam` 0..1 thins the foam line; `seed` varies the snow pits.
 */
function block(t, top, face, { tilt = 0, foam = 0.8, halo = true, seed = 0 } = {}) {
  const body = new k.Tex(S, S);
  // Top face, lit from the upper left.
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (!top(x, y)) continue;
      const rim = !top(x + 1, y) || !top(x, y + 1);
      const pit = k.hash(x, y, 601 + seed);
      let c = 'ice4';
      if (rim) c = tilt > 0.5 ? 'ice2' : 'ice3';
      else if (pit < 0.12 + tilt * 0.6) c = tilt > 0.75 && pit < 0.3 ? 'ice2' : 'ice3';
      body.set(x, y, P.c(c));
    }
  }
  // Front face: the rows under the top face's southern rim, darker down to the waterline.
  const faceTone = (j) => (face === 1 ? 'ice1' : j === 1 ? 'ice2' : j === face ? 'ice0' : 'ice1');
  for (let x = 0; x < S; x++) {
    for (let y = S - 1; y >= 0; y--) {
      if (body.get(x, y) !== 0) continue;
      for (let j = 1; j <= face; j++) {
        if (!top(x, y - j)) continue;
        let gap = false;
        for (let m = 1; m < j; m++) if (top(x, y - m)) gap = true;
        if (!gap) body.set(x, y, P.c(faceTone(j)));
        break;
      }
    }
  }
  const solid = (x, y) => body.get(x, y) !== 0;
  // Foam under the face and beside it; the top face's upper and left rims stand clear of the water.
  const froth = new k.Tex(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (solid(x, y)) continue;
      const underFace = solid(x, y - 1) && !top(x, y - 1);
      const besideFace = (solid(x - 1, y) && !top(x - 1, y)) || (solid(x + 1, y) && !top(x + 1, y));
      if ((underFace || besideFace) && k.hash(x, y, 611 + seed) < foam) froth.set(x, y, P.c('water7'));
    }
  }
  t.stamp(body, 0, 0);
  t.stamp(froth, 0, 0);
  if (!halo) return t;
  // Ice under water: a half dither of pale sea round the foot, on the lower and outer side.
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (t.get(x, y) !== 0 || (x + y) % 2 !== 0) continue;
      let near = false;
      for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 1; dx++) if (body.get(x + dx, y + dy) !== 0 && !top(x + dx, y + dy)) near = true;
      if (near) t.set(x, y, P.c('water6'));
    }
  }
  return t;
}

/* ---------------------------------------------------------------- crack -- */

/** The crack's corners across the tile, wide form: straight runs at angles, like the floe edges of the pack. */
const CRACK = [[0, 9], [3, 8], [6, 8], [8, 7], [11, 9], [13, 8], [15, 8]];
/** Columns reached in frames 0–3, out from where it starts (x 8). */
const CRACK_REACH = [[6, 10], [2, 13], [0, 15], [0, 15]];

/** One row per column along the crack's corners. */
function crackRows() {
  const out = new Array(S).fill(0);
  for (let i = 0; i < CRACK.length - 1; i++) {
    const [x0, y0] = CRACK[i];
    const [x1, y1] = CRACK[i + 1];
    for (let x = x0; x <= x1; x++) out[x] = Math.round(y0 + ((y1 - y0) * (x - x0)) / (x1 - x0));
  }
  return out;
}

/**
 * Frame f of a crack through the pack: a dark hairline that runs out from
 * the middle (0, 1) — darker than the pack's old refrozen leads (ice1, ice2),
 * so it reads as fresh — then opens to the sea below (2) and gapes, the slab
 * side already a row lower (3). The floe's face above it is ice3, as along
 * every lead of the pack. Drawn over the ice itself, transparent elsewhere.
 * `tall` turns it upright.
 */
function crack(f, tall) {
  const t = new k.Tex(S, S);
  const rows = crackRows();
  const [a, b] = CRACK_REACH[f];
  const put = (u, v, name) => (tall ? t.set(v, u, P.c(name)) : t.set(u, v, P.c(name)));
  for (let u = a; u <= b; u++) {
    const v = rows[u];
    // Wider towards the middle, tapering to a hairline at the ends.
    const mid = 1 - Math.abs(u - 7.5) / 8;
    const end = u === a || u === b;
    const width = f < 2 || end ? 1 : f === 2 ? (mid > 0.45 ? 2 : 1) : mid > 0.6 ? 3 : mid > 0.2 ? 2 : 1;
    if (end && f < 3) { put(u, v, 'ice1'); continue; }
    put(u, v - 1, 'ice3');
    if (width === 1) { put(u, v, 'ice0'); continue; }
    // The far wall catches the light; inside, the sea shows dark.
    put(u, v, 'ice0');
    for (let j = 1; j < width; j++) put(u, v + j, j === width - 1 && width === 3 ? 'water1' : 'water2');
    // Frame 3: the slab's own lip, lit, a row under the floe's.
    if (f === 3) put(u, v + width, 'ice4');
  }
  // A short branch splits off into the floe as the crack opens.
  if (f >= 2) {
    const bx = 4;
    for (let j = 1; j <= (f === 2 ? 2 : 3); j++) {
      put(bx - j, rows[bx] - j, j === 1 ? 'ice0' : 'ice1');
      put(bx - j, rows[bx] - j - 1, 'ice3');
    }
  }
  return t;
}

/* ---------------------------------------------------------------- calve -- */

/** The slab, wide form: about the water's half of the tile, as the crack cut it. */
const SLAB = [[1.5, 5], [4, 4.5], [7, 4], [11, 5], [14.5, 4.5], [14.5, 8], [11, 9], [6, 8.5], [1, 9]];
/** Tall form: the crack's side straight (left), the broken outer side angular. */
const SLAB_TALL = [[5, 1.5], [9, 2.5], [10.5, 5], [9.5, 8], [11, 11], [9.5, 13.5], [5.5, 14], [5, 10], [5.5, 6]];

/**
 * Frame f of the slab breaking away and tipping into the sea: free and
 * ringed by dark water (0), tipping, its top turned from the light and its
 * face showing more (1), half under in foam (2), only bits of brash in
 * churned water (3) — the splash takes over from there.
 */
function calve(f, tall) {
  const t = new k.Tex(S, S);
  const shape = tall ? SLAB_TALL : SLAB;
  const cx = tall ? 7.5 : 8;
  const cy = tall ? 7.5 : 6.5;
  if (f === 0) {
    const top = poly(shape);
    // A dark line of open water round the slab where it parted.
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (top(x, y)) continue;
        if (top(x, y + 1) || top(x + 1, y) || top(x - 1, y)) t.set(x, y, P.c('ice0'));
      }
    }
    return block(t, top, 2, { foam: 0.6, halo: false, seed: 1 });
  }
  if (f === 1) {
    // Tipping: one end dips, the top foreshortens.
    const pts = shape.map(([x, y]) => (tall ? [cx + (x - cx) * 0.9, cy + (y - cy) * 0.75 + 1] : [cx + (x - cx) * 0.95, cy + (y - cy) * 0.6 + 1.5 + (x - cx) * 0.12]));
    return block(t, poly(pts), 3, { tilt: 0.7, foam: 0.9, seed: 2 });
  }
  if (f === 2) {
    const pts = shape.map(([x, y]) => [cx + (x - cx) * (tall ? 0.45 : 0.7), cy + (y - cy) * (tall ? 0.6 : 0.4) + 2.5]);
    block(t, poly(pts), 1, { tilt: 0.9, foam: 1, seed: 3 });
    // Churned water: foam pushed out round it, lit on the upper left.
    for (let j = 0; j < 14; j++) {
      const a = (j / 14) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * (tall ? 4 : 6));
      const y = Math.round(cy + 2.5 + Math.sin(a) * (tall ? 5.5 : 3));
      if (t.get(x, y) === 0 && k.hash(j, 2, 631) < 0.75) t.set(x, y, P.c(Math.cos(a) + Math.sin(a) < -0.4 ? 'ice4' : 'water7'));
    }
    return t;
  }
  // Brash: three bits of ice bobbing in the churn.
  const bits = tall ? [[6, 6], [8, 9], [6, 11]] : [[4, 8], [8, 9], [11, 8]];
  for (const [x, y] of bits) {
    t.set(x, y, P.c('ice3'));
    t.set(x + 1, y, P.c('ice2'));
    t.set(x, y + 1, P.c('water7'));
  }
  for (let j = 0; j < 18; j++) {
    const x = Math.round(cx + (k.hash(j, 1, 641) - 0.5) * (tall ? 8 : 12));
    const y = Math.round(cy + 2.5 + (k.hash(j, 2, 641) - 0.5) * (tall ? 10 : 6));
    if (t.get(x, y) === 0) t.set(x, y, P.c(k.hash(j, 3, 641) < 0.3 ? 'ice4' : k.hash(j, 3, 641) < 0.7 ? 'water7' : 'water6'));
  }
  return t;
}

/* --------------------------------------------------------------- splash -- */

/** Where the splash sits: the waterline, a little below the box centre. */
const SPLASH_X = 7.5;
const SPLASH_Y = 10;

/**
 * Frame f of the splash where the slab went in: a burst of foam and drops
 * thrown up (0, 1), the drops falling back while a ring of foam spreads
 * (2, 3), the ring breaking up and fading into the sea (4, 5).
 */
function splash(f) {
  const t = new k.Tex(S, S);
  const put = (x, y, name) => { if (t.get(x, y) === 0) t.set(x, y, P.c(name)); };
  // The crown: jets thrown up and out in a fan, each a head drop with a short trail under it.
  const JETS = [[-3.2, 3.2], [-1.6, 4.4], [0, 5.2], [1.4, 4.6], [3, 3.4]];
  JETS.forEach(([vx, vy], j) => {
    const tt = f + 1;
    const up = vy * tt - 1.15 * tt * tt;
    const x = Math.round(SPLASH_X + vx * tt * 0.75);
    if (up < 0.5) return;
    const y = Math.round(SPLASH_Y - up);
    put(x, y, f < 2 ? 'ice4' : 'ice3');
    // Rising, the jet trails water under its head; falling, it breaks into a drop.
    if (f < 2) for (let m = 1; m <= 2 - f && y + m < SPLASH_Y; m++) put(x - Math.sign(vx) * (m > 1 ? 1 : 0), y + m, m === 1 ? 'ice3' : 'water7');
    if (f === 2 && k.hash(j, f, 653) < 0.5) put(x + Math.sign(vx), y + 1, 'ice2');
  });
  // The foam collar at the foot, sinking back.
  if (f <= 2) {
    const half = [2, 3, 3][f];
    for (let dx = -half; dx <= half; dx++) {
      const x = Math.round(SPLASH_X + dx);
      put(x, SPLASH_Y, f < 2 && Math.abs(dx) < half ? 'ice4' : 'water7');
      if (Math.abs(dx) < half && f < 2) put(x, SPLASH_Y + 1, 'water7');
    }
  }
  if (f < 1) return t;
  // The ring: an ellipse of broken foam, lit on its upper left, thinning as it spreads.
  const rx = [0, 3, 4.2, 5.4, 6.4, 7.2][f];
  const ry = rx * 0.5;
  const keep = [1, 1, 0.9, 0.8, 0.62, 0.42][f];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x + 0.5 - (SPLASH_X + 0.5)) / rx;
      const dy = (y + 0.5 - (SPLASH_Y + 0.5)) / ry;
      const d = Math.hypot(dx, dy);
      if (Math.abs(d - 1) * rx >= 0.6 || k.hash(x, y, 661 + f) >= keep) continue;
      const lit = -(dx * 0.6 + dy * 0.8) / Math.max(d, 0.01);
      put(x, y, lit > 0.3 && f < 4 ? 'ice4' : lit > -0.4 ? 'water7' : 'water6');
    }
  }
  return t;
}

/* -------------------------------------------------------------- iceberg -- */

/** The drifting berg's top face: a small flat floe broken off the pack, straight broken edges. */
const BERG = [[3, 6], [6.5, 4], [12, 4.5], [13, 7.5], [11, 9], [6, 9], [2.5, 8]];

/**
 * Frame f of the berg bobbing: at rest (0), lifted a pixel with more face
 * showing (1), dipped with the foam crowding its foot (2). The runtime plays
 * 0, 1, 0, 2. The waterline stays put; the berg moves against it.
 */
function berg(f) {
  const t = new k.Tex(S, S);
  const lift = [0, -1, 1][f];
  const face = [2, 3, 1][f];
  return block(t, poly(moved(BERG, 0, lift)), face, { foam: f === 2 ? 1 : 0.75, seed: 4 });
}

/**
 * Frame f of the berg melting away: smaller and lower (0, 1), broken into
 * two bits (2), one bit in slush (3), only a few flecks of slush in a faint
 * ring that the sea takes (4).
 */
function melt(f) {
  const t = new k.Tex(S, S);
  if (f <= 1) {
    const s = [0.78, 0.55][f];
    return block(t, poly(moved(BERG, 0, 1 + f, s, 8, 7)), f === 0 ? 2 : 1, { foam: 0.85, seed: 5 + f });
  }
  if (f === 2) {
    block(t, poly([[5, 7], [8, 6.5], [8.5, 8.5], [5.5, 9]]), 1, { tilt: 0.3, foam: 0.9, halo: false, seed: 7 });
    t.set(10, 9, P.c('ice3'));
    t.set(11, 9, P.c('ice2'));
    t.set(10, 10, P.c('water7'));
  }
  if (f === 3) {
    t.set(7, 8, P.c('ice3'));
    t.set(8, 8, P.c('ice2'));
    t.set(7, 9, P.c('water7'));
    t.set(8, 9, P.c('water7'));
  }
  // Slush: flecks round where it floated, fewer each frame.
  const keep = [0, 0, 0.6, 0.45, 0.3][f];
  for (let j = 0; j < 16; j++) {
    const a = (j / 16) * Math.PI * 2 + f * 0.4;
    const r = 3 + f * 0.8 + k.hash(j, f, 671) * 1.5;
    const x = Math.round(8 + Math.cos(a) * r);
    const y = Math.round(8.5 + Math.sin(a) * r * 0.55);
    if (t.get(x, y) !== 0 || k.hash(j, f, 673) >= keep) continue;
    t.set(x, y, P.c(f < 4 && k.hash(j, f, 677) < 0.35 ? 'ice2' : Math.sin(a) < 0 ? 'water7' : 'water6'));
  }
  return t;
}

module.exports = {
  sprites: {
    ice_crack: (f) => crack(f % 4, f >= 4),
    ice_calve: (f) => calve(f % 4, f >= 4),
    ice_splash: splash,
    iceberg_drift: berg,
    iceberg_melt: melt,
  },
  textures: {},
};
