/* =============================================================================
 * Gaia Reborn — the stone beam along the screen's bottom edge
 * -----------------------------------------------------------------------------
 * A row of flat, rounded granite stones (src/stonebeam.ts tiles beam_tile
 * from the left; beam_end is its start, right of Gaia's rock and behind it),
 * lit from the upper left like the rock: a dark outline, a lit top edge,
 * darker lower parts, soft mottling, specks and a few cracks, dark gaps
 * between the stones. Every stone carries its own outline and every tile
 * starts and ends with a whole stone (outline on columns 0 and 95), so the
 * variants join in any order with the same gap as inside a tile. Looks follow
 * the rock's: 0 bare with dust, 1 first lichen, 2 moss tufts, 3 lush moss
 * cushions with grass blades and small flowers; each look keeps what the
 * last one grew.
 * Contract: tools/uiart/catalog.js (family 'ground').
 * ========================================================================== */
'use strict';

const K = require('./kit');

const TONES = K.ramp('rock');

/* ----------------------------------------------------------- painting -- */

/**
 * Paint the stone `inside(x, y)` into t: outline (lit sides rock0, shadow sides ink1), body toned by
 * `light(x, y)` (0 dark … 1 lit) with a soft mottle, so the tone bands wander a little.
 */
function paintStone(t, inside, light, seed) {
  const mottle = K.noise(96, 24, seed);
  t.each((x, y) => {
    if (!inside(x, y)) return undefined;
    if (!inside(x + 1, y) || !inside(x, y + 1)) return K.c('ink1');
    if (!inside(x - 1, y) || !inside(x, y - 1)) return K.c('rock0');
    const v = light(x, y) + (mottle(x, y * 2) - 0.5) * 0.2 + (K.hash(x, y, seed) - 0.5) * 0.05;
    return TONES[v > 0.8 ? 4 : v > 0.56 ? 3 : v > 0.32 ? 2 : v > 0.12 ? 1 : 0];
  });
  return t;
}

/** Specks, granite grain and a crack on the body pixels of `inside` (never its outline). */
function weather(t, inside, seed, crack) {
  const body = (x, y) => inside(x, y) && inside(x + 1, y) && inside(x - 1, y) && inside(x, y + 1) && inside(x, y - 1);
  const step = (x, y) => TONES.indexOf(t.get(x, y));
  const out = K.copy(t);
  t.each((x, y) => {
    if (!body(x, y) || !body(x - 1, y - 1) || !body(x + 1, y + 1)) return;
    const s = step(x, y);
    const h = K.hash(x, y, seed);
    if (s >= 1 && s <= 3 && h < 0.022) {
      out.set(x, y, TONES[s + 1]);
      out.set(x + 1, y + 1, TONES[Math.max(0, step(x + 1, y + 1) - 1)]);
    } else if (s >= 2 && s <= 3 && h > 0.975) out.set(x, y, TONES[s - 2]);
  });
  for (const [x, y] of crack ?? []) {
    if (!body(x, y)) continue;
    out.set(x, y, TONES[Math.max(0, step(x, y) - 2)]);
    if (body(x + 1, y)) out.set(x + 1, y, TONES[Math.min(4, step(x + 1, y) + 1)]);
  }
  return out;
}

/** A crack wandering down from (x, y) for `n` rows. */
function crackFrom(x, y, n, seed) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    pts.push([x, y + i]);
    const r = K.hash(x, y + i, seed);
    if (r < 0.3) x -= 1;
    else if (r > 0.7) x += 1;
  }
  return pts;
}

/** Moss over the mask: lit top edge, dark underside, shaded right edge, a dappled middle; ramp [dark, shade, mid, light, top]. */
function paintMoss(t, m, ramp, seed) {
  const at = (x, y) => x >= 0 && y >= 0 && x < t.w && y < t.h && m[y * t.w + x] === 1;
  const [dark, shade, mid, light, top] = ramp;
  t.each((x, y) => {
    if (!at(x, y)) return undefined;
    if (!at(x, y + 1) && y < t.h - 1) return K.c(dark);
    if (!at(x, y - 1)) return K.c(at(x + 1, y) ? top : light);
    if (!at(x + 1, y) || !at(x, y + 2)) return K.c(shade);
    if (!at(x - 1, y) || !at(x - 1, y - 1)) return K.c(light);
    return K.c(K.hash(x >> 1, y, seed) < 0.35 ? light : mid);
  });
  return t;
}

/** The stone's top row near column x, ignoring the notches between stones: moss bridges them. */
const levelAt = (surf, x) => Math.min(surf(x - 2), surf(x - 1), surf(x), surf(x + 1), surf(x + 2));

/**
 * A lumpy tuft into mask m over the surface `surf(x)` (the stone's top row in column x): three lumps
 * across `half` columns each side of cx, the middle one up to `up` rows above the surface, a few sprigs,
 * drips hanging up to `down` rows below it.
 */
function tuftMask(m, w, h, surf, [cx, half, up, down], seed) {
  const r = Math.ceil(half / 2);
  const side = (k) => Math.max(1, up - 1 - (K.hash(cx, k, seed) < 0.4 ? 1 : 0));
  const lumps = [[cx - r, r, side(1)], [cx, r, up], [cx + r, r, side(2)]];
  for (let x = cx - half; x <= cx + half; x++) {
    if (x < 0 || x >= w) continue;
    const base = levelAt(surf, x);
    let rise = 0;
    for (const [lx, lr, lu] of lumps) {
      const d = (x - lx) / (lr + 0.5);
      if (d * d < 1) rise = Math.max(rise, Math.round(lu * Math.sqrt(1 - d * d) + 0.2));
    }
    if (rise >= 1 && K.hash(x, 5, seed) < 0.18) rise += 1;
    const a = 1 - Math.abs(x - cx) / (half + 1);
    const drip = Math.max(Math.abs(x - cx) < half ? 1 : 0, Math.round(down * a + (K.hash(x, 7, seed) - 0.5) * 0.9));
    for (let y = Math.max(0, base - rise); y <= Math.min(h - 1, base + drip); y++) m[y * w + x] = 1;
  }
  return m;
}

/** A moss cushion over the stone top from x0 to x1: low lumps of one or two rows, tongues draping one to three rows. */
function cushionMask(m, w, h, surf, x0, x1, seed) {
  for (let x = x0; x <= x1; x++) {
    const base = levelAt(surf, x);
    const end = Math.min(x - x0, x1 - x);
    const rise = end < 1 ? 0 : 1 + (Math.sin(x * 0.55 + seed) + (K.hash(x, 1, seed) - 0.5) * 0.8 > 0.35 ? 1 : 0);
    const drip = 1 + Math.max(0, Math.round(1.6 * Math.sin(x * 0.42 + seed * 2.3) + (K.hash(x, 2, seed) - 0.5)));
    for (let y = Math.max(0, base - rise); y <= Math.min(h - 1, base + drip); y++) m[y * w + x] = 1;
  }
  return m;
}

/** A dark rim where the moss rises above the stones: on the empty pixels over and beside it. */
function rimMoss(t, m, col) {
  const v = K.c(col);
  const at = (x, y) => x >= 0 && y >= 0 && x < t.w && y < t.h && m[y * t.w + x] === 1;
  const rim = [];
  t.each((x, y) => {
    if (t.get(x, y) || at(x, y)) return;
    if (at(x, y + 1) || at(x - 1, y) || at(x + 1, y)) rim.push([x, y]);
  });
  for (const [x, y] of rim) t.set(x, y, v);
  return t;
}

/** Bright yellow-green tufts; the lush cushions a step deeper, their crowns as bright. */
const TUFT_RAMP = ['meadow0', 'meadow1', 'meadow3', 'vine5', 'vine6'];
const LUSH_RAMP = ['vine1', 'meadow0', 'meadow2', 'meadow3', 'vine5'];

/** Crusts of the first life, as on the rock: teal and green, a pale rim on some. */
const LICHEN_LEGEND = { t: 'coral0', g: 'moss3', p: 'lichen1' };
const LICHEN = [['t'], ['g'], ['.t', 'tg'], ['gt', '.p'], ['tg'], ['pt', '.g']];

const PLANT_LEGEND = { a: 'vine5', b: 'vine4', c: 'vine3', w: 'white0', y: 'petalY2', q: 'petal3' };
/** Grass blades, foot on the bottom row. */
const BLADES = [['a.a', 'b.b', '.c.'], ['.a', 'ab', 'c.'], ['a..', 'b.a', '.cb'], ['a', 'b', 'c']];
const FLOWERS = [['.w.', 'wyw', '.w.'], ['.q.', 'qyq', '.q.'], ['w', 'y']];

/* --------------------------------------------------------------- tile -- */

const TW = 96;
const TH = 14;

/**
 * The three variants: stones left to right as [width, height, domed]; the widths fill the tile.
 * tufts: [cx, half, up, down] on the stone tops or over a gap (look 2; look 3 grows them);
 * lush: the cushions look 3 adds, [cx, half]; blades and flowers: [x, kind] on look 3's moss.
 */
const VARIANTS = [
  {
    stones: [[22, 11, 0], [18, 10, 1], [26, 10, 1], [14, 11, 0], [16, 10, 0]],
    tufts: [[22, 5, 3, 1], [55, 4, 2, 1], [80, 5, 3, 1]],
    lush: [[9, 6], [33, 3], [46, 4], [70, 4], [89, 4]],
    blades: [[14, 0], [40, 1], [62, 2], [84, 0]],
    flowers: [[25, 0], [57, 1], [73, 2]],
  },
  {
    stones: [[16, 10, 0], [27, 10, 1], [20, 11, 0], [15, 10, 1], [18, 11, 0]],
    tufts: [[30, 5, 3, 1], [63, 5, 3, 1], [86, 4, 2, 1]],
    lush: [[8, 5], [20, 3], [46, 5], [55, 3], [73, 4], [91, 2]],
    blades: [[21, 2], [38, 0], [55, 1], [79, 3]],
    flowers: [[11, 2], [33, 0], [66, 1], [89, 0]],
  },
  {
    stones: [[25, 11, 0], [19, 10, 1], [14, 10, 0], [22, 11, 1], [16, 10, 0]],
    tufts: [[25, 5, 3, 1], [51, 4, 2, 1], [72, 5, 3, 1]],
    lush: [[10, 7], [37, 4], [62, 3], [87, 5]],
    blades: [[17, 1], [42, 0], [57, 2], [77, 3], [91, 1]],
    flowers: [[28, 1], [49, 2], [70, 0]],
  },
];

/** The stones of a variant as { x0, w, top, dome, H } (H: the box height, the foot on its last row). */
function layout(v) {
  let x0 = 0;
  return VARIANTS[v].stones.map(([w, h, dome]) => {
    const s = { x0, w, top: TH - h, dome, H: TH };
    x0 += w;
    return s;
  });
}

/** Rows the round top corner leaves out, by distance from the stone's side. */
const CORNER = [2, 1, 1];

/** The top outline row of a stone in column x: a domed stone rises one row between its quarters. */
function stoneTop({ x0, w, top, dome }, x) {
  const e = Math.min(x - x0, x0 + w - 1 - x);
  return top - (dome && e >= Math.round(w / 4) ? 1 : 0);
}

/** A flat stone: a rect with round top corners, a domed one raised in its middle. */
const flatIn = (s) => (x, y) => {
  const e = Math.min(x - s.x0, s.x0 + s.w - 1 - x);
  if (e < 0 || y >= s.H) return false;
  const dy = y - stoneTop(s, x);
  return dy >= 0 && (e >= CORNER.length || dy >= CORNER[e]);
};

/** Lit top edge, light under it, darker towards the foot, a lit left and a shaded right flank. */
const flatLight = (s) => (x, y) => {
  const u = (x - s.x0) / (s.w - 1);
  const r = y - stoneTop(s, x);
  const n = s.H - 1 - s.top;
  if (r <= 1) return u > 0.9 ? 0.7 : 0.95;
  let v = 0.74 - (0.66 * (y - s.top - 2)) / Math.max(1, n - 2);
  if (r === 2 && u < 0.45) v = 0.84;
  if (u < 0.08) v += 0.16;
  if (u > 0.88) v -= 0.2;
  return v;
};

/** The first opaque row of t in column x (the row under the box when there is none, or x is outside). */
function surfaceOf(t) {
  return (x) => {
    if (x < 0 || x >= t.w) return t.h;
    for (let y = 0; y < t.h; y++) if (t.get(x, y)) return y;
    return t.h;
  };
}

/** The top row of the mask in column x (or the row under the box). */
function topOf(m, w, h, x) {
  for (let y = 0; y < h; y++) if (m[y * w + x]) return y;
  return h;
}

/** Plants on look 3's moss: grass blades and flowers standing on its crown. */
function plants(t, m, blades, flowers) {
  for (const [x, k] of blades) {
    const g = K.grid(BLADES[k], PLANT_LEGEND);
    const y = topOf(m, t.w, t.h, x);
    if (y < t.h) t.stamp(g, x - (g.w >> 1), y - g.h + 1);
  }
  for (const [x, k] of flowers) {
    const g = K.grid(FLOWERS[k], PLANT_LEGEND);
    const y = topOf(m, t.w, t.h, x);
    if (y < t.h) t.stamp(g, x - (g.w >> 1), Math.max(0, y - g.h + 1));
  }
  return t;
}

function beamTile(f) {
  const v = Math.floor(f / 4);
  const look = f % 4;
  const spec = VARIANTS[v];
  const stones = layout(v);
  let t = new K.Tex(TW, TH);
  stones.forEach((s, i) => {
    const inside = flatIn(s);
    const seed = 11 + v * 17 + i * 5;
    paintStone(t, inside, flatLight(s), seed);
    const crack = K.hash(i, v, 3) < 0.5 ? crackFrom(s.x0 + Math.round(s.w * (0.3 + 0.4 * K.hash(i, v, 4))), s.top + 2, 2 + (i % 3), seed) : null;
    t = weather(t, inside, seed, crack);
  });
  if (look === 0) return dustTile(t, stones, v);
  lichenTile(t, stones, v);
  if (look === 1) return t;
  const m = new Uint8Array(TW * TH);
  const surf = surfaceOf(t);
  const grow = look === 3 ? 1 : 0;
  for (const [cx, half, up, down] of spec.tufts) tuftMask(m, TW, TH, surf, [cx, half + grow, up, down + grow], 21 + v * 3 + cx);
  if (look === 3) for (const [cx, half] of spec.lush) cushionMask(m, TW, TH, surf, cx - half, cx + half, 31 + v * 3 + cx);
  rimMoss(paintMoss(t, m, look === 3 ? LUSH_RAMP : TUFT_RAMP, 5 + v), m, 'vine1');
  if (look === 2) return t;
  return plants(t, m, spec.blades, spec.flowers);
}

/** Dust blown onto the young stones: specks on their top edges, little drifts in the gaps at the foot. */
function dustTile(t, stones, v) {
  stones.forEach((s, i) => {
    const r = (k) => K.hash(i, k, 40 + v);
    K.put(t, s.x0 + 3 + Math.floor(r(1) * (s.w - 6)), stoneTop(s, s.x0 + 3) + 1, r(2) < 0.5 ? 'sand2' : 'soil3');
    if (r(3) < 0.6) K.put(t, s.x0 + 3 + Math.floor(r(4) * (s.w - 6)), s.top + 1, 'sand2');
    if (i > 0 && r(5) < 0.7) {
      K.put(t, s.x0 - 1, s.H - 2, 'soil3');
      K.put(t, s.x0, s.H - 2, 'sand2');
      for (const [dx, col] of [[-2, 'sand2'], [-1, 'soil3'], [0, 'soil3'], [1, 'sand2']]) K.put(t, s.x0 + dx, s.H - 1, col);
    }
  });
  return t;
}

function lichenTile(t, stones, v) {
  stones.forEach((s, i) => {
    const n = 1 + Math.floor(K.hash(i, v, 50) * 2.5);
    for (let k = 0; k < n; k++) {
      const r = (j) => K.hash(i * 7 + k, j, 60 + v);
      const g = K.grid(LICHEN[Math.floor(r(1) * LICHEN.length)], LICHEN_LEGEND);
      const x = s.x0 + 2 + Math.floor(r(2) * (s.w - 3 - g.w));
      const y = s.top + 2 + Math.floor(r(3) * (s.H - 3 - s.top - g.h));
      t.stamp(g, x, y);
    }
  });
  return t;
}

/* ---------------------------------------------------------------- end -- */

const EW = 44;
const EH = 24;

/**
 * A round boulder stepping down from Gaia's rock: its left columns lie behind the rock's small stone, its
 * crown peeks out between the stone and the rock's flank. A superellipse box [x, y, w, h] with roundness p,
 * cut by the screen's bottom edge.
 */
const BOULDER = { box: [0, 8, 26, 22], p: 2.2, seed: 71, crack: [[11, 12], [11, 13], [12, 14], [12, 15], [13, 16]] };
/** The row's first stone, a little taller than the row, in front of the boulder's foot and of the row's start. */
const FIRST = { x0: 23, w: 18, top: 12, dome: 1, H: EH };

/** End decoration by look: tufts [cx, half, up, down] (look 2; look 3 grows them), lush cushions [cx, half], plants [x, kind], lichen and dust [x, y, kind]. */
const END = {
  tufts: [[4, 3, 2, 1], [17, 4, 2, 1], [33, 4, 2, 2]],
  lush: [[10, 7], [29, 5]],
  blades: [[7, 0], [21, 2], [36, 1]],
  flowers: [[13, 0], [31, 1]],
  lichen: [[8, 11, 4], [15, 17, 2], [4, 18, 0], [20, 14, 1], [28, 15, 3], [36, 19, 5]],
  dust: [[9, 9, 's'], [10, 9, 'o'], [16, 9, 's'], [29, 13, 's'], [41, 23, 's'], [40, 22, 'o'], [41, 22, 's'], [42, 23, 'o']],
};

const ellipseIn = ({ box: [bx, by, bw, bh], p }) => (x, y) => {
  if (y >= EH) return false;
  const nx = Math.abs((x + 0.5 - (bx + bw / 2)) / (bw / 2));
  const ny = Math.abs((y + 0.5 - (by + bh / 2)) / (bh / 2));
  return nx ** p + ny ** p <= 1;
};

/** A ball lit from the upper left, a little towards the viewer. */
const ballLight = ({ box: [bx, by, bw, bh] }) => (x, y) => {
  const nx = (x + 0.5 - (bx + bw / 2)) / (bw / 2);
  const ny = (y + 0.5 - (by + bh / 2)) / (bh / 2);
  const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, nx * nx + ny * ny)));
  return 0.1 + 0.92 * Math.max(0, -0.5 * nx - 0.62 * ny + 0.6 * nz);
};

function beamEnd(look) {
  const t = new K.Tex(EW, EH);
  const inB = ellipseIn(BOULDER);
  t.stamp(weather(paintStone(new K.Tex(EW, EH), inB, ballLight(BOULDER), BOULDER.seed), inB, BOULDER.seed, BOULDER.crack), 0, 0);
  const inF = flatIn(FIRST);
  t.stamp(weather(paintStone(new K.Tex(EW, EH), inF, flatLight(FIRST), 77), inF, 77, crackFrom(30, 14, 3, 77)), 0, 0);
  if (look === 0) {
    for (const [x, y, k] of END.dust) K.put(t, x, y, k === 's' ? 'sand2' : 'soil3');
    return t;
  }
  for (const [x, y, k] of END.lichen) t.stamp(K.grid(LICHEN[k], LICHEN_LEGEND), x, y);
  if (look === 1) return t;
  const m = new Uint8Array(EW * EH);
  const surf = surfaceOf(t);
  const grow = look === 3 ? 1 : 0;
  for (const [cx, half, up, down] of END.tufts) tuftMask(m, EW, EH, surf, [cx, half + grow, up, down + grow], 41 + cx);
  if (look === 3) for (const [cx, half] of END.lush) cushionMask(m, EW, EH, surf, cx - half, cx + half, 51 + cx);
  rimMoss(paintMoss(t, m, look === 3 ? LUSH_RAMP : TUFT_RAMP, 9), m, 'vine1');
  if (look === 2) return t;
  return plants(t, m, END.blades, END.flowers);
}

module.exports = { sprites: { beam_tile: (f) => beamTile(f), beam_end: (f) => beamEnd(f) } };
