/* =============================================================================
 * SimEarth 2.0 — terrain recipes, family "mountain"
 * -----------------------------------------------------------------------------
 * Basalt, scree, alpine meadow and the montane rainforest floor
 * (docs/hoehe-spec.md §3.8). Ranges and volcanic cones are no sprites: the
 * renderer lifts the ground along their crests and around their craters and
 * dresses the faces with these grounds, rock and snow. Ids, ranks and sizes
 * are fixed in catalog.js; style: docs/landschaft-2026-10/stil.md.
 *
 *   materials[id](t, d)   paint the seamless texture `t` (Tex, wraps) for density d
 * ========================================================================== */
'use strict';

const k = require('./kit');
const warm = require('./warm');

const c = k.c;
const wrap = (v, n) => ((v % n) + n) % n;

/* ------------------------------------------------------------ helpers -- */

/** Ordered dither in 2×2 blocks (−0.47..0.47): dithered edges never break into single pixels. */
const bayer2 = (x, y) => k.BAYER4[wrap(y >> 1, 4)][wrap(x >> 1, 4)] / 16 - 0.47;

/** A wrapping 0/1 map the size of a texture. */
function field(size) {
  const a = new Uint8Array(size * size);
  return {
    get: (x, y) => a[wrap(y, size) * size + wrap(x, size)],
    set: (x, y, v = 1) => { a[wrap(y, size) * size + wrap(x, size)] = v; },
  };
}

/** Jittered points, one per `step` cell over the wrap, each with rolls r, a, b in 0..1. */
function sites(size, step, seed) {
  const n = Math.max(1, Math.round(size / step));
  const cell = size / n;
  const out = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      out.push({
        x: (i + k.hash(i, j, seed)) * cell, y: (j + k.hash(i, j, seed + 1)) * cell,
        r: k.hash(i, j, seed + 2), a: k.hash(i, j, seed + 3), b: k.hash(i, j, seed + 4),
      });
    }
  }
  return out.sort((p, q) => p.y - q.y || p.x - q.x);
}

/** Periodic Worley cells over a size×size wrap: (x, y) → { id, d1, d2 }. */
function worley(size, n, seed, jitter = 0.9) {
  const step = size / n;
  const pts = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      pts.push([(i + 0.5 + (k.hash(i, j, seed) - 0.5) * jitter) * step, (j + 0.5 + (k.hash(i, j, seed + 1) - 0.5) * jitter) * step]);
    }
  }
  return (x, y) => {
    const ci = Math.floor(x / step);
    const cj = Math.floor(y / step);
    let d1 = Infinity;
    let d2 = Infinity;
    let id = 0;
    for (let dj = -2; dj <= 2; dj++) {
      for (let di = -2; di <= 2; di++) {
        const wi = wrap(ci + di, n);
        const wj = wrap(cj + dj, n);
        const [sx, sy] = pts[wj * n + wi];
        const d = Math.hypot(x - (sx + (ci + di - wi) * step), y - (sy + (cj + dj - wj) * step));
        if (d < d1) { d2 = d1; d1 = d; id = wj * n + wi; } else if (d < d2) d2 = d;
      }
    }
    return { id, d1, d2 };
  };
}

/** Mark an ellipse in a field. */
function disc(m, cx, cy, rx, ry) {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) m.set(x, y);
    }
  }
}

/** Replace a pixel that sits alone in a uniform 8-neighbourhood: no single-pixel noise. */
function despeckle(t) {
  const src = Uint8Array.from(t.px);
  const at = (x, y) => src[t.at(x, y)];
  for (let y = 0; y < t.h; y++) {
    for (let x = 0; x < t.w; x++) {
      const n = at(x - 1, y - 1);
      if (n === at(x, y)) continue;
      let uniform = true;
      for (let dy = -1; dy <= 1 && uniform; dy++) {
        for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && at(x + dx, y + dy) !== n) { uniform = false; break; }
      }
      if (uniform) t.set(x, y, n);
    }
  }
  return t;
}

/* ---------------------------------------------------------- materials ---- */

/**
 * Fresh basalt: dark lava rock split by cooling cracks into rough plates,
 * some cracks with a lit lip on their lower side, a few darker glassy
 * patches and vesicle pits. Built one step above the rock ramp's dark end, so the
 * relief can still darken it and the cracks stay darker than the stone.
 */
function basalt(t) {
  const S = t.w;
  const cells = worley(S, 5, 1701, 0.95);
  const glass = k.fbm(S, 8, 2, 1703);
  const crack = field(S);
  const lip = field(S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const w = cells(x + 0.5, y + 0.5);
      if (w.d2 - w.d1 < 1.05) crack.set(x, y);
      if (k.hash(w.id, 3, 1702) < 0.45) lip.set(x, y);
    }
  }
  t.each((x, y) => (glass(x, y) + bayer2(x, y) * 0.08 < 0.36 ? c('rock0') : c('rock1')));
  t.each((x, y) => {
    if (crack.get(x, y)) return c('rock0');
    if (crack.get(x, y - 1) && !crack.get(x, y + 1) && lip.get(x, y)) return c('rock2');
    return undefined;
  });
  // Vesicles: small pits with a lit lower lip, away from the cracks.
  for (const s of sites(S, 9, 1705)) {
    if (s.r > 0.5) continue;
    const x = Math.floor(s.x);
    const y = Math.floor(s.y);
    let free = true;
    for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) if (crack.get(x + dx, y + dy)) free = false;
    if (!free) continue;
    t.set(x, y, c('rock0'));
    t.set(x + 1, y, c('rock0'));
    t.set(x, y + 1, c('rock2'));
    t.set(x + 1, y + 1, c('rock2'));
  }
  return despeckle(t);
}

/**
 * Scree: a talus of angular stones packed edge to edge, each lit on its
 * upper-left rim and dark on its lower-right one, with dark gaps between.
 */
function scree(t) {
  const S = t.w;
  const big = worley(S, 8, 1801, 0.9);
  const small = worley(S, 12, 1803, 0.9);
  const tone = k.fbm(S, 8, 2, 1805);
  const id = new Int32Array(S * S);
  const gap = field(S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // Boulders where the coarse noise says so, rubble everywhere else.
      const coarse = tone(x, y) > 0.55;
      const w = coarse ? big(x + 0.5, y + 0.5) : small(x + 0.5, y + 0.5);
      id[y * S + x] = (coarse ? 1000 : 0) + w.id;
      if (w.d2 - w.d1 < (coarse ? 1.2 : 0.9)) gap.set(x, y);
    }
  }
  const same = (x, y, x2, y2) => id[wrap(y2, S) * S + wrap(x2, S)] === id[y * S + x] && !gap.get(x2, y2);
  // Calm: two face tones a step apart, a lit rim on half the stones, shade a step down.
  t.each((x, y) => {
    if (gap.get(x, y)) return c('rock1');
    const n = id[y * S + x];
    const face = k.hash(n, 7, 1807) < 0.3 ? 'rock3' : 'rock2';
    if ((!same(x, y, x, y - 1) || !same(x, y, x - 1, y)) && k.hash(n, 9, 1809) < 0.5) return c('rock3');
    if (!same(x, y, x, y + 1) || !same(x, y, x + 1, y)) return face === 'rock3' ? c('rock2') : c('rock1');
    return c(face);
  });
  return despeckle(t);
}

/**
 * Alpine meadow: short, dense turf of a cooler green than the lowland
 * meadow, with lit cushion plants, grey stones and gravel showing through,
 * and small flowers — gentian blue, yellow and white. Sparser steps show
 * more stone; the denser ones close the turf.
 */
function alpineMeadow(t, d) {
  const S = t.w;
  const turf = k.fbm(S, 8, 3, 1901);
  t.each((x, y) => (turf(x, y) + bayer2(x, y) * 0.1 < 0.46 ? c('leaf1') : c('leaf2')));
  // Gravel and stones where the turf has not closed.
  const bare = k.fbm(S, 16, 2, 1903);
  const bareThr = [0.33, 0.25, 0.15][d];
  t.each((x, y) => {
    const v = bare(x, y) + bayer2(x, y) * 0.06;
    if (v >= bareThr) return undefined;
    return v < bareThr - 0.06 ? c('rock3') : c('rock2');
  });
  const stones = [0.5, 0.36, 0.22][d];
  for (const s of sites(S, 8, 1905)) {
    if (s.r > stones) continue;
    const x = Math.floor(s.x);
    const y = Math.floor(s.y);
    const wide = s.a > 0.5;
    t.set(x, y, c('rock3'));
    t.set(x + 1, y, c('rock3'));
    if (wide) t.set(x + 2, y, c('rock3'));
    t.set(x, y + 1, c('rock2'));
    t.set(x + 1, y + 1, c('rock2'));
    if (wide) t.set(x + 2, y + 1, c('rock2'));
  }
  // Cushion plants: round, lit on the upper left, a dark rim below.
  const cushion = field(S);
  const cov = [0.3, 0.45, 0.6][d];
  for (const s of sites(S, 7, 1907)) {
    if (s.r > cov || bare(Math.floor(s.x), Math.floor(s.y)) < bareThr + 0.04) continue;
    disc(cushion, s.x, s.y, 1.6 + s.a * 1.2, 1.2 + s.a * 0.8);
  }
  t.each((x, y) => {
    if (!cushion.get(x, y)) return undefined;
    if (!cushion.get(x, y - 1) || !cushion.get(x - 1, y)) return c('leaf3');
    if (!cushion.get(x, y + 1)) return c('leaf1');
    return c('leaf2');
  });
  // Flowers in loose drifts, two pixels each.
  const drift = k.fbm(S, 4, 2, 1909);
  const bloom = [0.42, 0.48, 0.55][d];
  for (const s of sites(S, 6, 1911)) {
    const x = Math.floor(s.x);
    const y = Math.floor(s.y);
    if (drift(x, y) > bloom || s.r > 0.75 || bare(x, y) < bareThr + 0.02) continue;
    const col = s.a < 0.45 ? 'ice0' : s.a < 0.75 ? 'yellow0' : 'white0';
    t.set(x, y, c(col));
    t.set(x + 1, y, c(col));
  }
  return despeckle(t);
}

/**
 * Montane rainforest floor: the lowland rainforest floor (warm.js) under
 * cloud — soaked, olive-dark peaty humus instead of brown, and mosses on everything.
 */
function rainforestMontane(t, d) {
  const S = t.w;
  warm.materials.rainforest(t, d);
  // Darker than the lowland rain forest: the understory a step down, wet peat for humus, moss for litter.
  const humus = {
    [c('soil0')]: c('mud0'), [c('soil1')]: c('mud1'), [c('soil2')]: c('moss0'),
    [c('jungle1')]: c('jungle0'), [c('jungle2')]: c('jungle1'), [c('jungle3')]: c('jungle2'),
  };
  t.each((x, y) => humus[t.get(x, y)]);
  const moss = field(S);
  const patch = k.fbm(S, 8, 2, 2001);
  const cov = [0.56, 0.64][d];
  for (const s of sites(S, 6, 2003)) {
    if (s.r * 0.5 + patch(Math.floor(s.x), Math.floor(s.y)) * 0.5 > cov) continue;
    disc(moss, s.x, s.y, 1.5 + s.a * 1.3, 1.1 + s.a * 0.8);
  }
  t.each((x, y) => {
    if (!moss.get(x, y)) return undefined;
    if (!moss.get(x, y - 1) || !moss.get(x - 1, y)) return c('moss2');
    if (!moss.get(x, y + 1)) return c('moss0');
    return c('moss1');
  });
  return despeckle(t);
}

const materials = {
  basalt,
  scree,
  alpine_meadow: alpineMeadow,
  rainforest_montane: rainforestMontane,
};

module.exports = { materials };
