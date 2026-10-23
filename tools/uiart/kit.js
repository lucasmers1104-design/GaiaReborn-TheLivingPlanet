/* =============================================================================
 * Gaia Reborn — toolkit for the living-interface recipes
 * -----------------------------------------------------------------------------
 * The terrain kit's bitmap (Tex), hash and periodic noise, with colours named
 * in the UI palette (tools/uiart/palette.js), plus the drawing primitives
 * every UI family needs. A colour is a palette name ('vine3') or an index
 * (0 = transparent). Painting helpers (put, rect, line, ellipse, disc,
 * outline) draw into the bitmap they get and return it; transforms (copy,
 * mirror, recolor, shiftRamp, dissolve) return a new bitmap and leave theirs
 * untouched, so one base frame can feed every variant. A recipe is
 * `(frame, spriteEntry) => Tex` in its family's `sprites` table.
 * Deterministic throughout: no Math.random, no Date, no shared mutable state.
 * ========================================================================== */
'use strict';

const T = require('../terrain/kit');
const P = require('./palette');

const { Tex, hash, noise, fbm, BAYER4, smooth, lerp } = T;

/** Palette index of a colour name, or the index itself. */
const idx = (col) => (typeof col === 'number' ? col : P.c(col));

/** A bitmap from character rows; `legend` maps a character to a palette name, '.' and ' ' are transparent; throws on unknown characters or names. */
function grid(rows, legend) {
  const w = Math.max(...rows.map((r) => r.length));
  const t = new Tex(w, rows.length);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      if (!Object.prototype.hasOwnProperty.call(legend, ch)) throw new Error(`grid: character '${ch}' has no colour in the legend`);
      t.px[y * w + x] = P.c(legend[ch]);
    }
  });
  return t;
}

/** Set one pixel; outside the box it is clipped. */
function put(t, x, y, col) {
  t.set(x, y, idx(col));
  return t;
}

/** Fill the w × h rectangle whose top left is (x, y). */
function rect(t, x, y, w, h, col) {
  const v = idx(col);
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) t.set(xx, yy, v);
  return t;
}

/** A 1-px line from (x0, y0) to (x1, y1), both ends included (Bresenham). */
function line(t, x0, y0, x1, y1, col) {
  const v = idx(col);
  let x = Math.round(x0);
  let y = Math.round(y0);
  const xe = Math.round(x1);
  const ye = Math.round(y1);
  const dx = Math.abs(xe - x);
  const dy = -Math.abs(ye - y);
  const sx = x < xe ? 1 : -1;
  const sy = y < ye ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    t.set(x, y, v);
    if (x === xe && y === ye) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return t;
}

/** Fill the ellipse inscribed in the w × h box whose top left is (x, y), the way a pixel editor's ellipse tool draws it. */
function ellipse(t, x, y, w, h, col) {
  const v = idx(col);
  const cx = x + w / 2;
  const cy = y + h / 2;
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      const nx = (px + 0.5 - cx) / (w / 2);
      const ny = (py + 0.5 - cy) / (h / 2);
      if (nx * nx + ny * ny <= 1) t.set(px, py, v);
    }
  }
  return t;
}

/** Fill a disc centred on pixel (cx, cy), 2r + 1 pixels across. */
function disc(t, cx, cy, r, col) {
  return ellipse(t, cx - r, cy - r, 2 * r + 1, 2 * r + 1, col);
}

/**
 * Paint a 1-px outline on the transparent pixels 4-adjacent to the shape
 * (corners stay open, so curves keep round); `{ only: 'outer' }` leaves holes
 * enclosed by the shape alone, `'all'` (the default) rims them too.
 */
function outline(t, col, { only = 'all' } = {}) {
  if (only !== 'all' && only !== 'outer') throw new Error(`outline: only must be 'outer' or 'all', not '${only}'`);
  const v = idx(col);
  const { w, h, px } = t;
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && px[y * w + x] !== 0;
  let outside = null;
  if (only === 'outer') {
    outside = new Uint8Array(w * h);
    const stack = [];
    for (let x = 0; x < w; x++) stack.push(x, 0, x, h - 1);
    for (let y = 0; y < h; y++) stack.push(0, y, w - 1, y);
    while (stack.length) {
      const y = stack.pop();
      const x = stack.pop();
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const i = y * w + x;
      if (outside[i] || px[i] !== 0) continue;
      outside[i] = 1;
      stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
    }
  }
  const rim = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (px[i] !== 0 || (outside && !outside[i])) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) rim.push(i);
    }
  }
  for (const i of rim) px[i] = v;
  return t;
}

/** A copy of the bitmap. */
function copy(t) {
  const out = new Tex(t.w, t.h, t.wrap);
  out.px.set(t.px);
  return out;
}

/** A left–right mirrored copy. */
function mirror(t) {
  return t.flipped();
}

/** A copy with colours swapped by `map` ({ from: to }, names or indices; to 0 erases). */
function recolor(t, map) {
  const lut = new Map();
  for (const [from, to] of Object.entries(map)) lut.set(/^\d+$/.test(from) ? Number(from) : P.c(from), idx(to));
  const out = copy(t);
  for (let i = 0; i < out.px.length; i++) {
    const v = lut.get(out.px[i]);
    if (v !== undefined) out.px[i] = v;
  }
  return out;
}

/** A copy with every colour of ramp `from` moved to the same relative step of ramp `to` (dark stays dark, light stays light): fresh → faded → wilted leaves. */
function shiftRamp(t, from, to) {
  const a = P.ramp(from);
  const b = P.ramp(to);
  const map = {};
  a.forEach((v, s) => { map[v] = b[Math.round((s * (b.length - 1)) / Math.max(1, a.length - 1))]; });
  return recolor(t, map);
}

/** A copy with the share `amount` (0..1) of pixels removed in the 4×4 ordered-dither pattern, offset by `seed`: fading without alpha. */
function dissolve(t, amount, seed = 0) {
  const out = copy(t);
  if (amount <= 0) return out;
  const cut = amount * 16;
  const ox = seed & 3;
  const oy = (seed >> 2) & 3;
  out.each((x, y) => (BAYER4[(y + oy) & 3][(x + ox) & 3] < cut ? 0 : undefined));
  return out;
}

module.exports = {
  Tex, grid, put, rect, line, ellipse, disc, outline, copy, mirror, recolor, shiftRamp, dissolve,
  c: P.c, ramp: P.ramp, shift: P.shift, hash, noise, fbm, BAYER4, smooth, lerp,
};
