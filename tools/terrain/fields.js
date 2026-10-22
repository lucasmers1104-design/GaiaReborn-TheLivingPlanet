/* =============================================================================
 * SimEarth 2.0 — terrain recipes, family "fields"
 * -----------------------------------------------------------------------------
 * The fields round the cities (src/fields.ts, docs/bewegung-2026-10), one
 * ground material per look: hoe gardens of the Stone Age, strip fields of
 * grain and of millet (Bronze and Iron Age), rice paddies, terraces, a
 * patchwork with hedgerows (Industrial age) and large regular fields (from
 * the Atomic age). No landscape owns them and no objects stand on them; the
 * renderer frays their rims into the open land like any other ground.
 *
 *   materials[id](t, d)   paint the seamless texture `t` (Tex, wraps) for density d
 *
 * Quiet like the wild ground: neighbouring steps of a ramp side by side, the
 * plots' borders from the light (upper left) and shade (lower right) of the
 * same ramps, never a grid of whole tiles: plots run across tile borders at
 * hashed widths.
 * ========================================================================== */
'use strict';

const k = require('./kit');

const c = k.c;

/* ------------------------------------------------------------- helpers -- */

/** Ordered-dither threshold at a texture pixel, 0..1 (world-fixed: sizes are multiples of 4). */
const bayer = (x, y) => (k.BAYER4[y & 3][x & 3] + 0.5) / 16;

/** One point per cell of an n×n jittered grid over a seamless texture of `size`. */
function scatter(size, n, seed) {
  const step = size / n;
  const pts = [];
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      pts.push({
        x: Math.floor((gx + k.hash(gx, gy, seed)) * step) % size,
        y: Math.floor((gy + k.hash(gx, gy, seed + 1)) * step) % size,
        a: k.hash(gx, gy, seed + 2),
        b: k.hash(gx, gy, seed + 3),
      });
    }
  }
  return pts;
}

/**
 * Cut `size` into runs of `min`..`max` px by hash, summing exactly to
 * `size` (so they wrap): [start, length] pairs.
 */
function runs(size, min, max, seed) {
  const out = [];
  let at = 0;
  for (let n = 0; at < size; n++) {
    let len = min + Math.floor(k.hash(n, 0, seed) * (max - min + 1));
    if (size - at - len < min) len = size - at;
    out.push([at, len]);
    at += len;
  }
  return out;
}

/** The run of `runs` that pixel coordinate `v` (wrapped) lies in: [index, offset inside, length]. */
function runAt(list, size, v) {
  const p = ((v % size) + size) % size;
  for (let n = 0; n < list.length; n++) {
    const [s, len] = list[n];
    if (p >= s && p < s + len) return [n, p - s, len];
  }
  return [0, 0, list[0][1]];
}

/** A lone pixel (no equal 8-neighbour) takes the most common colour of its 4-neighbours. */
function despeckle(t) {
  const src = Uint8Array.from(t.px);
  const at = (x, y) => src[t.at(x, y)];
  t.each((x, y) => {
    const v = at(x, y);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && at(x + dx, y + dy) === v) return undefined;
    }
    const n = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
    let best = n[0];
    let most = 0;
    for (const a of n) {
      const m = n.filter((b) => b === a).length;
      if (m > most) { most = m; best = a; }
    }
    return best;
  });
  return t;
}

/**
 * Crops as [base, row] colours: a plot shows its base with rows of the
 * second, one ramp step apart, so a field reads by its grain, not by contrast.
 */
const CROP = {
  ripe: ['straw2', 'straw1'],
  pale: ['straw3', 'straw2'],
  stubble: ['straw1', 'straw2'],
  green: ['meadow2', 'meadow1'],
  pasture: ['meadow1', 'meadow2'],
  ploughed: ['soil3', 'soil2'],
  red: ['laterite3', 'laterite2'],
  dust: ['sand2', 'sand1'],
  olive: ['moss2', 'moss1'],
};

/** Pick from [[crop, weight], …] by a 0..1 roll. */
function pickCrop(table, roll) {
  const total = table.reduce((a, [, w]) => a + w, 0);
  let r = roll * total;
  for (const [crop, w] of table) {
    if (r < w) return crop;
    r -= w;
  }
  return table[table.length - 1][0];
}

/**
 * Plots in rows: `rows` cuts the height, each row cuts the width into plots
 * of its own (bricks, so no plot border runs straight down the texture).
 * Calls paint(x, y, plot) with plot = { crop, u, v, w, h, seed } where (u, v)
 * is the pixel's place inside the plot of w × h.
 */
function plots(t, rowMin, rowMax, colMin, colMax, table, seed, paint) {
  const S = t.w;
  const rows = runs(S, rowMin, rowMax, seed);
  const cols = rows.map((_, r) => runs(S, colMin, colMax, seed + 17 + r * 31));
  const shift = rows.map((_, r) => Math.floor(k.hash(r, 1, seed + 5) * S));
  const down = Math.floor(k.hash(0, 2, seed) * S);
  t.each((x, y) => {
    const [r, v, h] = runAt(rows, S, y + down);
    const [n, u, w] = runAt(cols[r], S, x + shift[r]);
    const roll = k.hash(r, n, seed + 9);
    return paint(x, y, { crop: pickCrop(table, roll), u, v, w, h, seed: r * 97 + n });
  });
}

/** Rows of a crop: its row colour on every `every`-th line across (horizontal) or down. */
function cropRows(crop, along, every, x, y, plot) {
  const [base, row] = CROP[crop];
  const line = along ? plot.v : plot.u;
  return c(line % every === every - 1 ? row : base);
}

/* ------------------------------------------------------------ materials -- */

const materials = {
  /**
   * Hoe gardens of the first villages: small beds of dug earth in rough
   * grass, each with clumps of green crops in loose rows.
   */
  field_garden: (t) => {
    const S = t.w;
    const shade = k.fbm(S, 8, 3, 7011);
    const grass = (x, y) => (shade(x, y) + (bayer(x, y) - 0.5) * 0.1 < 0.5 ? c('meadow1') : c('meadow2'));
    // Beds of dug earth in rough grass, a strip of grass between them, their corners rounded off.
    const table = [['bed', 0.85], ['grass', 0.15]];
    plots(t, 8, 11, 10, 15, table, 7013, (x, y, p) => {
      const r = p.w - (k.hash(p.seed, 3, 7015) < 0.5 ? 2 : 1);
      const b = p.h - 1;
      const inside = p.crop === 'bed' && p.u >= 1 && p.u < r && p.v >= 1 && p.v < b;
      const corner = (p.u === 1 || p.u === r - 1) && (p.v === 1 || p.v === b - 1);
      if (!inside || corner) return grass(x, y);
      if (p.v === b - 1) return c('soil1');
      // Crop clumps in rows, two pixels wide.
      const clump = p.v % 3 === 0 && k.hash((x >> 1) + p.seed, y, 7017) < 0.6;
      return clump ? c(k.hash(x >> 1, y, 7019) < 0.4 ? 'leaf3' : 'leaf2') : c('soil2');
    });
    return despeckle(t);
  },

  /**
   * Strip fields (Bronze and Iron Age): long, narrow strips across the
   * slope, each its own crop — ripe and green grain, ploughed land, stubble —
   * with a darker balk along the lower edge of every strip.
   */
  field_strips: (t) => {
    const table = [['ripe', 0.34], ['green', 0.3], ['ploughed', 0.2], ['stubble', 0.16]];
    plots(t, 3, 6, 18, 40, table, 7111, (x, y, p) => {
      const [base] = CROP[p.crop];
      if (p.v === p.h - 1) return k.shift(c(base), -1);
      if (p.u === 0 && p.v > 0) return k.shift(c(base), -1);
      return cropRows(p.crop, false, 3, x, y, { ...p, u: p.u + (p.v & 1) });
    });
    return despeckle(t);
  },

  /** Millet and sorghum on dry land: wider strips of straw, olive sorghum, dusty stubble and red tilled earth. */
  field_millet: (t) => {
    const table = [['ripe', 0.3], ['olive', 0.25], ['dust', 0.25], ['red', 0.2]];
    plots(t, 4, 8, 14, 32, table, 7211, (x, y, p) => {
      const [base] = CROP[p.crop];
      if (p.v === p.h - 1 || (p.u === 0 && p.v > 0)) return k.shift(c(base), -1);
      return cropRows(p.crop, true, 3, x, y, p);
    });
    return despeckle(t);
  },

  /**
   * Rice paddies in warm, wet lowland: small basins behind low dikes, most
   * green with rice in rows, some still flooded, some ripe.
   */
  field_paddy: (t) => {
    const table = [['rice', 0.55], ['young', 0.25], ['ripe', 0.2]];
    const rows = runs(t.w, 7, 11, 7311);
    const cols = rows.map((_, r) => runs(t.w, 9, 15, 7313 + r * 31));
    const shift = rows.map((_, r) => Math.floor(k.hash(r, 1, 7315) * t.w));
    t.each((x, y) => {
      const [r, v] = runAt(rows, t.w, y + 5);
      const [n, u] = runAt(cols[r], t.w, x + shift[r]);
      // The dike on the upper and left rim, lit; the muddy water under it in its shadow.
      if (v === 0 || u === 0) return c('mud3');
      const kind = pickCrop(table, k.hash(r, n, 7317));
      if (kind === 'ripe') return c(u % 2 === 0 ? 'straw2' : 'straw1');
      if (v === 1 || u === 1) return c('mud1');
      // Young rice: rows of shoots in the flooded basin, the sky caught here and there.
      if (kind === 'young') return c(u % 3 === 0 ? 'meadow2' : k.hash(x >> 1, y, 7319) < 0.18 ? 'water4' : 'mud2');
      return c(u % 2 === 0 ? 'meadow2' : 'meadow1');
    });
    return despeckle(t);
  },

  /**
   * Terraces on a slope: steps following the contour, each a strip of crop
   * whose rim catches the light, above the shaded wall of the next.
   */
  field_terrace: (t) => {
    const S = t.w;
    const table = [['green', 0.45], ['ripe', 0.3], ['pasture', 0.25]];
    const wave = (x) => 2 * Math.sin((2 * Math.PI * x) / S + 0.4) + 1.2 * Math.sin((2 * Math.PI * x * 3) / S + 1.9);
    const steps = runs(S, 5, 7, 7411);
    t.each((x, y) => {
      const [n, v, h] = runAt(steps, S, y + Math.round(wave(x)));
      const crop = pickCrop(table, k.hash(n, Math.floor(((x + n * 23) % S) / 32), 7413));
      const [base, row] = CROP[crop];
      if (v === h - 1) return c('soil1');
      if (v === h - 2) return k.shift(c(base), -1);
      if (v === 0) return k.shift(c(base), 1);
      return c((x + n) % 3 === 0 ? row : base);
    });
    return despeckle(t);
  },

  /**
   * The Industrial age's patchwork: fields of every crop in irregular
   * blocks, framed by hedgerows lit from the upper left.
   */
  field_hedgerows: (t) => {
    const table = [['ripe', 0.3], ['pasture', 0.25], ['green', 0.2], ['ploughed', 0.15], ['stubble', 0.1]];
    plots(t, 11, 19, 13, 24, table, 7511, (x, y, p) => {
      // Hedge: two pixels along the upper and left rim of every plot.
      if (p.v === 0 || p.u === 0) return c(k.hash(x >> 1, y >> 1, 7513) < 0.3 ? 'leaf3' : 'leaf2');
      if (p.v === 1 || p.u === 1) return c('leaf1');
      return cropRows(p.crop, (p.seed & 1) === 0, 3, x, y, p);
    });
    return despeckle(t);
  },

  /** Large regular fields (Atomic age on): wide blocks drilled in straight rows, a farm track between. */
  field_large: (t) => {
    const table = [['ripe', 0.34], ['green', 0.28], ['pale', 0.2], ['ploughed', 0.18]];
    plots(t, 28, 44, 34, 60, table, 7611, (x, y, p) => {
      if (p.v === 0 || p.u === 0) return c('straw3');
      return cropRows(p.crop, (p.seed & 1) === 0, 2, x, y, p);
    });
    return despeckle(t);
  },
};

module.exports = { materials, objects: {} };
