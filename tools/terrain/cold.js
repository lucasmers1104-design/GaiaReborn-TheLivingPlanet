/* =============================================================================
 * SimEarth 2.0 — terrain recipes, family "cold"
 * -----------------------------------------------------------------------------
 * Ice, sea ice, summit snow, bare rock, lichen and moss on rock, tundra, the
 * taiga floor; spruce, juniper, heath, moss cushions, boulders, scree and ice
 * blocks. Ids and ranks are fixed in catalog.js.
 *
 *   materials[id](t, d)   paint the seamless texture `t` (Tex, wraps) for density d
 *   objects[id](v)        return a sprite; v = { index, size, form } (trees) or { index }
 * ========================================================================== */
'use strict';

const k = require('./kit');

const C = k.c;

/* ------------------------------------------------------------ helpers -- */

const wrap = (v, n) => ((v % n) + n) % n;

/** Ordered dither in 2×2 blocks (−0.47..0.47), so dithered edges never break into single pixels. */
const bayer2 = (x, y) => k.BAYER4[wrap(y >> 1, 4)][wrap(x >> 1, 4)] / 16 - 0.47;

/** A wrapping 0/1 (or small int) map the size of a texture. */
function field(size) {
  const a = new Uint8Array(size * size);
  return {
    get: (x, y) => a[wrap(y, size) * size + wrap(x, size)],
    set: (x, y, v = 1) => { a[wrap(y, size) * size + wrap(x, size)] = v; },
  };
}

/** Periodic value noise with separate lattice counts across and down (wind-stretched shapes). */
function noise2(size, cx, cy, seed) {
  return (x, y) => {
    const fx = (wrap(x, size) + 0.5) * cx / size;
    const fy = (wrap(y, size) + 0.5) * cy / size;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = k.smooth(fx - x0);
    const ty = k.smooth(fy - y0);
    const x1 = (x0 + 1) % cx;
    const y1 = (y0 + 1) % cy;
    const a = k.hash(x0 % cx, y0 % cy, seed);
    const b = k.hash(x1, y0 % cy, seed);
    const c = k.hash(x0 % cx, y1, seed);
    const d = k.hash(x1, y1, seed);
    return k.lerp(k.lerp(a, b, tx), k.lerp(c, d, tx), ty);
  };
}

/**
 * Periodic Worley cells: n×n jittered sites over a size×size texture.
 * (x, y) in pixels, any range → { id, d1, d2 } (nearest and second distance).
 */
function worley(size, n, seed, jitter = 0.85) {
  const step = size / n;
  const sites = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      sites.push([(i + 0.5 + (k.hash(i, j, seed) - 0.5) * jitter) * step, (j + 0.5 + (k.hash(i, j, seed + 1) - 0.5) * jitter) * step]);
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
        const [sx, sy] = sites[wj * n + wi];
        const d = Math.hypot(x - (sx + (ci + di - wi) * step), y - (sy + (cj + dj - wj) * step));
        if (d < d1) { d2 = d1; d1 = d; id = wj * n + wi; } else if (d < d2) d2 = d;
      }
    }
    return { id, d1, d2 };
  };
}

/** Mark an ellipse in a field. */
function disc(m, cx, cy, rx, ry, v = 1) {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) m.set(x, y, v);
    }
  }
}

/**
 * Paint a field lit from the upper left: rim facing up/left `light`, rim facing
 * down/right `dark`, inside `mid`. `shadow` (optional) darkens the ground one
 * pixel down-right of the shape, like a low cushion standing on it.
 */
function paintLit(t, m, light, mid, dark, shadow = null) {
  if (shadow != null) {
    t.each((x, y) => (m.get(x - 1, y - 1) && !m.get(x, y) ? shadow : undefined));
  }
  t.each((x, y) => {
    if (!m.get(x, y)) return undefined;
    const lit = (m.get(x, y - 1) ? 0 : 1) + (m.get(x - 1, y) ? 0 : 1) - (m.get(x, y + 1) ? 0 : 1) - (m.get(x + 1, y) ? 0 : 1);
    return lit > 0 ? light : lit < 0 ? dark : mid;
  });
}

/**
 * Jittered sites, about one per `step` × `step` cell, evenly over the wrap:
 * [{ x, y, r, a, b }]. `r` ranks a site for nested densities (a denser step
 * keeps every site of a sparser one); `a` and `b` pick its size and shape.
 */
function sites(size, step, seed) {
  const n = Math.max(1, Math.round(size / step));
  const cell = size / n;
  const out = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      out.push({
        x: (i + k.hash(i, j, seed)) * cell,
        y: (j + k.hash(i, j, seed + 1)) * cell,
        r: k.hash(i, j, seed + 2),
        a: k.hash(i, j, seed + 3),
        b: k.hash(i, j, seed + 4),
      });
    }
  }
  return out;
}

/**
 * Roll a texture by multiples of 8 px (keeping the 2×2 Bayer phase) so its
 * calmest row pair and column pair sit on the wrap. A pure phase shift: the
 * texture still tiles. The seam check compares the wrap with the average
 * neighbour pair, which a grained texture (wind ridges, floe edges) can
 * fail by chance when a ridge happens to lie on the wrap.
 */
function calmWrap(t) {
  const calmest = (len, diff) => {
    let best = 7;
    let fewest = Infinity;
    for (let i = 7; i < len; i += 8) {
      const n = diff(i);
      if (n < fewest) { fewest = n; best = i; }
    }
    return best + 1;
  };
  const dy = calmest(t.h, (y) => { let n = 0; for (let x = 0; x < t.w; x++) n += t.get(x, y) !== t.get(x, y + 1) ? 1 : 0; return n; });
  const dx = calmest(t.w, (x) => { let n = 0; for (let y = 0; y < t.h; y++) n += t.get(x, y) !== t.get(x + 1, y) ? 1 : 0; return n; });
  const src = new k.Tex(t.w, t.h, true);
  src.px.set(t.px);
  return t.each((x, y) => src.get(x + dx, y + dy));
}

/* -------------------------------------------------------------- stone ---- */

/**
 * Bare rock: light stone with soft weathered stains, hairline fissures with a
 * lit lip, and a little grit — many small marks, evenly spread, so no single
 * landmark gives the 4-tile repeat away. Shared by rock and lichen_rock so the
 * stone under the crusts is the same. Returns the fissure field.
 */
function stone(t) {
  const S = t.w;
  const rock = k.ramp('rock');
  t.fill(rock[3]);
  const stain = field(S);
  for (const s of sites(S, 8, 101)) {
    if (s.r > 0.42) continue;
    const r = 1.3 + s.a * 1.2;
    disc(stain, s.x, s.y, r * 1.5, r);
    if (s.b > 0.5) disc(stain, s.x + r, s.y + 1, r, r * 0.8);
  }
  t.each((x, y) => (stain.get(x, y) ? rock[2] : undefined));
  const crack = field(S);
  // Hairline fissures: short random walks, mostly sideways with steps down.
  for (const s of sites(S, 10, 105)) {
    if (s.r > 0.55) continue;
    let x = Math.floor(s.x);
    let y = Math.floor(s.y);
    const dir = s.b < 0.5 ? 1 : -1;
    const len = 4 + Math.floor(s.a * 5);
    for (let i = 0; i < len; i++) {
      crack.set(x, y);
      if (i === 2 && s.a > 0.6) crack.set(x - dir, y + 1);
      const h = k.hash(i, Math.floor(s.x * 16), 106 + Math.floor(s.y));
      x += h < 0.85 ? dir : 0;
      y += h > 0.5 ? 1 : 0;
    }
  }
  t.each((x, y) => {
    if (crack.get(x, y)) return rock[1];
    if (crack.get(x, y - 1)) return k.shift(t.get(x, y), 1);
    return undefined;
  });
  // Grit: a few small lit stones.
  for (const s of sites(S, 11, 115)) {
    if (s.r > 0.4) continue;
    const x = Math.floor(s.x);
    const y = Math.floor(s.y);
    let free = true;
    for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) if (crack.get(x + dx, y + dy)) free = false;
    if (!free) continue;
    t.set(x, y, rock[4]);
    t.set(x + 1, y, rock[3]);
    t.set(x, y + 1, rock[3]);
    t.set(x + 1, y + 1, rock[1]);
  }
  return crack;
}

/* ---------------------------------------------------------- materials ---- */

/** Lichen crusts, Xanthoria flecks and moss in the fissures; denser steps add to the sparser ones. */
function lichenRock(t, d) {
  const S = t.w;
  const crack = stone(t);
  const clump = k.fbm(S, 8, 2, 121);
  const lich = field(S);
  const moss = field(S);
  const flecks = [];
  const cov = [0.3, 0.42, 0.56][d];
  for (const s of sites(S, 6, 131)) {
    const rank = s.r * 0.55 + clump(Math.floor(s.x), Math.floor(s.y)) * 0.45;
    if (rank > cov) continue;
    if (s.a < 0.6) {
      // A map lichen: two or three overlapping lobes.
      const r = 1.3 + s.b * 0.9 + d * 0.2;
      disc(lich, s.x, s.y, r * 1.25, r);
      disc(lich, s.x + (s.b - 0.5) * 4, s.y + 1.2, r * 0.9, r * 0.8);
      if (s.b > 0.5) disc(lich, s.x - 2, s.y + 0.5, r * 0.8, r * 0.7);
      if (s.a < 0.22) flecks.push([Math.floor(s.x + r + 1), Math.floor(s.y - 1)]);
    } else {
      // Moss settles in the fissures: snap to the nearest one close by.
      let mx = s.x;
      let my = s.y;
      search: for (let rr = 0; rr <= 3; rr++) {
        for (let dy = -rr; dy <= rr; dy++) {
          for (let dx = -rr; dx <= rr; dx++) {
            if (crack.get(Math.floor(s.x) + dx, Math.floor(s.y) + dy)) { mx = Math.floor(s.x) + dx + 0.5; my = Math.floor(s.y) + dy + 0.5; break search; }
          }
        }
      }
      const r = 1.2 + s.b * 0.9 + d * 0.3;
      disc(moss, mx, my, r * 1.2, r);
    }
  }
  paintLit(t, lich, C('lichen1'), C('lichen0'), C('lichen0'), C('rock2'));
  paintLit(t, moss, C('moss2'), C('moss1'), C('moss1'), C('rock1'));
  for (const [x, y] of flecks) {
    if (moss.get(x, y) || moss.get(x + 1, y)) continue;
    t.set(x, y, C('orange0'));
    t.set(x + 1, y, C('orange0'));
  }
  return t;
}

/** Olive mat of moss, sedge and dwarf shrubs over peaty soil, bare frost boils, pale lichen, heath in bloom. */
function tundra(t, d) {
  const S = t.w;
  const veg = k.fbm(S, 8, 2, 201);
  const bare = field(S);
  const boils = k.fbm(S, 8, 2, 203);
  const cut = [0.34, 0.25, 0.16][d];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (boils(x, y) < cut) bare.set(x, y);
  t.each((x, y) => {
    if (bare.get(x, y)) return bare.get(x - 1, y) && bare.get(x, y - 1) ? C('soil2') : C('soil1');
    return veg(x, y) + bayer2(x, y) * 0.06 < 0.47 ? C('moss0') : C('moss1');
  });
  // Tussocks: a lit top and a dark foot.
  for (const s of sites(S, 5, 207)) {
    if (s.r > 0.42) continue;
    const x = Math.floor(s.x);
    const y = Math.floor(s.y);
    if (bare.get(x, y) || bare.get(x + 2, y + 1)) continue;
    t.set(x, y, C('moss2'));
    t.set(x + 1, y, C('moss2'));
    t.set(x + 1, y + 1, C('moss0'));
    t.set(x + 2, y + 1, C('moss0'));
  }
  // Pale lichen.
  const lich = field(S);
  for (const s of sites(S, 8, 211)) {
    if (s.r > [0.2, 0.24, 0.28][d]) continue;
    disc(lich, s.x, s.y, 1.3 + s.a * 0.7, 1.0 + s.a * 0.4);
  }
  t.each((x, y) => (lich.get(x, y) ? C('lichen0') : undefined));
  // Heath in bloom: violet pairs on the mat.
  for (const s of sites(S, 9, 215)) {
    if (s.r > [0.22, 0.3, 0.38][d]) continue;
    const x = Math.floor(s.x);
    const y = Math.floor(s.y);
    if (bare.get(x, y) || bare.get(x + 1, y)) continue;
    t.set(x, y, C('violet0'));
    t.set(x + 1, y, C('violet0'));
  }
  return t;
}

/** Dark needle litter with feather-moss cushions; the denser step has more moss. */
function taiga(t, d) {
  const S = t.w;
  const mottle = k.fbm(S, 8, 2, 301);
  t.each((x, y) => (mottle(x, y) < 0.42 ? C('soil0') : C('soil1')));
  for (const s of sites(S, 4, 303)) {
    if (s.r > 0.32) continue;
    const x = Math.floor(s.x);
    const y = Math.floor(s.y);
    t.set(x, y, C('soil2'));
    t.set(x + (s.a < 0.5 ? 1 : -1), y + 1, C('soil2'));
  }
  const clump = k.fbm(S, 8, 2, 305);
  const moss = field(S);
  const cov = [0.38, 0.56][d];
  for (const s of sites(S, 5, 307)) {
    const rank = s.r * 0.5 + clump(Math.floor(s.x), Math.floor(s.y)) * 0.5;
    if (rank > cov) continue;
    const r = 1.4 + s.a * 1.2;
    disc(moss, s.x, s.y, r * 1.3, r);
  }
  paintLit(t, moss, C('moss1'), C('moss0'), C('moss0'), C('soil0'));
  return t;
}

/** Pack ice: snow-covered floes, the shaded front face of each floe, refrozen leads with brash. */
function seaIce(t) {
  const S = t.w;
  // Lattice counts are per 64 px, so the floes keep their size on a larger texture.
  const q = S / 64;
  const wx = k.fbm(S, 4 * q, 2, 401);
  const wy = k.fbm(S, 4 * q, 2, 403);
  const cell = worley(S, 5 * q, 445, 0.95);
  const lead = k.fbm(S, 4 * q, 2, 407);
  const show = k.fbm(S, 4 * q, 2, 411);
  const snowy = k.fbm(S, 4 * q, 3, 413);
  const gap = field(S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const c = cell(x + 0.5 + (wx(x, y) - 0.5) * 8, y + 0.5 + (wy(x, y) - 0.5) * 8);
      const width = lead(x, y) > 0.62 ? 2.4 : 1.1;
      if (c.d2 - c.d1 < width && show(x, y) > 0.28) gap.set(x, y);
    }
  }
  t.each((x, y) => {
    if (gap.get(x, y)) return gap.get(x, y - 1) ? C('ice1') : C('ice2');
    if (gap.get(x, y + 1) || gap.get(x + 1, y)) return C('ice3');
    return snowy(x, y) + bayer2(x, y) * 0.05 < 0.34 ? C('ice3') : C('ice4');
  });
  // Brash: small bits of broken ice in the wider leads.
  for (const s of sites(S, 5, 415)) {
    const x = Math.floor(s.x);
    const y = Math.floor(s.y);
    if (s.r > 0.7) continue;
    let open = true;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 2; dx++) if (!gap.get(x + dx, y + dy)) open = false;
    if (!open) continue;
    t.set(x, y, C('ice3'));
    t.set(x + 1, y, C('ice2'));
  }
  return calmWrap(t);
}

/** Inland ice: wide soft fields of snow and bare ice, low wind-carved sastrugi in loose fields. */
function iceSheet(t) {
  const S = t.w;
  const big = k.fbm(S, 4, 3, 501);
  t.each((x, y) => (big(x, y) + bayer2(x, y) * 0.03 < 0.46 ? C('ice3') : C('ice4')));
  const wind = k.fbm(S, 4, 2, 507);
  for (const s of sites(S, 8, 505)) {
    const x0 = Math.floor(s.x);
    const y0 = Math.floor(s.y);
    if (s.r > wind(x0, y0) - 0.25) continue;
    const len = 5 + Math.floor(s.a * 6);
    for (let i = 0; i < len; i++) {
      if (i < len - 1) t.set(x0 + i, y0, C('ice4'));
      if (i >= Math.floor(len / 2)) t.set(x0 + i, y0 + 1, C('ice2'));
    }
  }
  return calmWrap(t);
}

/** Summit snow: wind drifts and a few low rock ledges poking out, capped with snow, with blue lee shadows. */
function snow(t) {
  const S = t.w;
  const drift = noise2(S, 8, 16, 601);
  const big = k.fbm(S, 8, 2, 603);
  t.each((x, y) => (drift(x, y) * 0.5 + big(x, y) * 0.5 + bayer2(x, y) * 0.06 < 0.4 ? C('ice3') : C('ice4')));
  const TIPS = [
    ['.ccc..', 'hmmdd.', '..sss.'],
    ['cc..', 'mdd.', '.ss.'],
    ['.cccc...', 'hmmdd.c.', '.ssss.md', '......ss'],
  ];
  const key = { c: C('ice3'), h: C('rock3'), m: C('rock2'), d: C('rock1'), s: C('ice2') };
  for (const s of sites(S, 11, 605)) {
    if (s.r > 0.32) continue;
    const tip = TIPS[Math.floor(s.a * TIPS.length)];
    tip.forEach((row, dy) => [...row].forEach((ch, dx) => { if (ch !== '.') t.set(Math.floor(s.x) + dx, Math.floor(s.y) + dy, key[ch]); }));
  }
  return calmWrap(t);
}

const materials = {
  rock: (t) => { stone(t); return t; },
  lichen_rock: lichenRock,
  tundra,
  taiga,
  sea_ice: seaIce,
  ice: iceSheet,
  snow,
};

/* ------------------------------------------------------------ objects ---- */

const PINE = { o: 'pine0', d: 'pine1', m: 'pine2', l: 'pine3', t: 'bark0', b: 'bark1', u: 'ice0' };

/** Spruce drawings by size and form: a pointed cone of drooping, toothed tiers. */
const SPRUCE = {
  s: [
    [
      '....lo....',
      '....lo....',
      '...lmdo...',
      '..mddooo..',
      '...lmdo...',
      '..llmddo..',
      '.lmmmddoo.',
      '.mddooooo.',
      '..llmmdo..',
      '.llmmmddo.',
      'lmmmmdddoo',
      'd...bt...o',
      '....bt....',
    ],
    [
      '....lo....',
      '....lo....',
      '...lmdo...',
      '...mdoo...',
      '...lmdo...',
      '..llmddo..',
      '..mddooo..',
      '..lmmdo...',
      '.llmmddo..',
      '.lmmmddoo.',
      '.d..bt..o.',
      '....bt....',
      '....bt....',
    ],
  ],
  m: [
    [
      '......l......',
      '.....lmo.....',
      '.....lmo.....',
      '....mdooo....',
      '....lmmdo....',
      '...llmmddo...',
      '..llmmmmddo..',
      '..lmddooodo..',
      '.m..lmmdo..o.',
      '...llmmddo...',
      '..llmmmmddo..',
      '.llmmlmmdddo.',
      '.lmmddoooddo.',
      'm..llmmddo..o',
      '.llmlmmmdmdo.',
      '.d....bt...o.',
      '......bt.....',
    ],
    [
      '......l......',
      '......lo.....',
      '.....lmo.....',
      '.....ldo.....',
      '....mddoo....',
      '....lmmdo....',
      '...llmmddo...',
      '...mddoooo...',
      '....lmmdo....',
      '...llmmddo...',
      '..llmmmmddo..',
      '..mddoooooo..',
      '...llmmddo...',
      '..llmlmmddo..',
      '.lmmlmmdmdoo.',
      '.d....bt...o.',
      '......bt.....',
    ],
  ],
  l: [
    [
      '.......lo.......',
      '.......lo.......',
      '......llmo......',
      '.....lmmddo.....',
      '....mddooooo....',
      '.....lmmddo.....',
      '....llmmmddo....',
      '...llmmlmdddo...',
      '...lmddoooodo...',
      '..m..lmmddo..o..',
      '....llmmmddo....',
      '...llmmmmdddo...',
      '..llmmmdmddddo..',
      '.lmmdddooooddoo.',
      'm...dlmmmddo...o',
      '...llmmmmdddo...',
      '.llmmlmmmdmdddo.',
      'lmmmmmmmddddoooo',
      'd......bt......o',
      '.......bt.......',
    ],
    [
      '.......lo.......',
      '.......lo.......',
      '......llmo......',
      '......lmdo......',
      '.....mddooo.....',
      '......lmdo......',
      '.....llmddo.....',
      '....lmmmdddo....',
      '....mddooooo....',
      '.....lmmddo.....',
      '....llmmmddo....',
      '...llmmlmdddo...',
      '...lmddooooddo..',
      '..m..lmmddo...o.',
      '....llmmmddo....',
      '...llmmmmdddo...',
      '..llmlmmmdmddo..',
      '.lmmmmmmmdddooo.',
      '.d.....bt.....o.',
      '.......bt.......',
    ],
  ],
};

/** Juniper: a low, ragged cone bush without tiers or trunk, with a few blue berries. */
const JUNIPER = [
  [
    '...l....',
    '..llo.l.',
    '..lmdlmo',
    '.llmmmdo',
    '.lmlmddo',
    'lmmmmddo',
    '.ooddoo.',
  ],
  [
    '....l...l..',
    '...ll.l.lo.',
    '...lmdlmmo.',
    '..llmmlmddo',
    '.l.lmlmmddo',
    '.llmmmmmddo',
    '.lmmumlmddo',
    'lmlmmmmdddo',
    '.oodooodoo.',
  ],
  [
    '......l......',
    '....l.lm.l...',
    '....lllmolo..',
    '...llmlmmdo..',
    '...lmmmlmdo..',
    '..llmlmmmddo.',
    '..lmmmumlmdo.',
    '.l.lmlmmmddo.',
    '.llmmmmlmmddo',
    '.lmlmumdmdddo',
    'lmmmmlmmddddo',
    '.ooddooooooo.',
  ],
];

const HEATH = { o: 'leaf0', d: 'leaf1', m: 'leaf2', l: 'leaf3', v: 'violet0', p: 'blossom0', s: 'bark0' };
const DWARF_SHRUB = [
  [
    '.p...p..',
    '.vm.mvd.',
    'mlmdmddo',
    'mdmddddo',
    '.sooodo.',
  ],
  [
    '..p....p...',
    '..v.m..vd..',
    '.mvlmd.mvdo',
    'mlmdmmdmddo',
    'mdmdddmdddo',
    '.ssoosooos.',
  ],
  [
    '...p.....p....',
    '...v..m..v..p.',
    '.m.vlmdd.vd.vd',
    'mlmmdmmdmlddvo',
    'mmdmdmmdmdddoo',
    'mdddddoddddddo',
    '.sosooososooo.',
  ],
];

const MOSS = { o: 'moss0', d: 'moss1', m: 'moss2', l: 'moss3', b: 'bark1', r: 'orange0' };
const MOSS_CUSHION = [
  [
    '..llm..',
    '.llmmd.',
    'lmmmmdd',
    '.oddoo.',
  ],
  [
    '..ll.......',
    '.llmm.llm..',
    'lmmmmdlmmd.',
    'mmmmddmmddd',
    '.ooddooodoo',
  ],
  [
    '....r.....r..',
    '....b.....b..',
    '..llbm.llmb..',
    '.llmmmdllmmd.',
    'lmmmmmdmmmmdd',
    'mmmmddddmmddo',
    '.oooddoooddo.',
  ],
];

const ROCK = { o: 'rock0', d: 'rock1', m: 'rock2', l: 'rock3', h: 'rock4' };
const BOULDER = [
  [
    '..dddd..',
    '.dhhlld.',
    'dhhlllmo',
    'dlllmmmo',
    'dmmmmddo',
    '.oooooo.',
  ],
  [
    '..dddd.....',
    '.dhhhldd...',
    'dhhhllllld.',
    'dhlllllllmo',
    'dllllllmmmo',
    'dmmmmlmmmdo',
    'dmmdmmmmddo',
    '.ooooooooo.',
  ],
  [
    '...ddddd......',
    '..dhhhhlddd...',
    '.dhhhhllllldo.',
    'dhhhllllllllmo',
    'dhllllllmllmmo',
    'dlllllldmmmmdo',
    'dmmmmmmdmmmddo',
    'dmmmdmmmdmmddo',
    'ddmmmmdmmmdddo',
    '.ooooooooooo..',
  ],
];

const SCREE = [
  [
    '......hl......',
    '.hl..hlmo..hl.',
    'hlmo..oo..hlmo',
    '.oo.hl.....oo.',
    '...hlmo.hl....',
    '....oo.hlmo...',
    '........oo....',
  ],
  [
    '.......hl.......',
    '......hllmo.....',
    '..hl..mmmdo.hl..',
    '.hlmo..ooo.hlmo.',
    '..oo.hl.....oo..',
    'hl..hlmo..hl..hl',
    'mo...oo..hlmo.mo',
    '...hl.....oo....',
    '...mo...........',
  ],
];

const ICE = { o: 'ice0', d: 'ice1', m: 'ice2', l: 'ice3', h: 'ice4' };
const ICE_BLOCK = [
  [
    '...ddd....',
    '.ddhhhdd..',
    'dhhhhhhhd.',
    'lhhhhhhmmo',
    'llllhmmmdo',
    'lmlllmdmdo',
    'lmllmmdmdo',
    'llllmmmddo',
    '.oooooooo.',
  ],
  [
    '...d..........',
    '..dhd.....d...',
    '..dhhd...dhd..',
    '.dhhhld..dhhd.',
    '.lhhllmodhhhlo',
    '.llhlmmolhhlmo',
    'dllllmmdllllmo',
    'llmllmmdllllmo',
    'llmllmddlmllmo',
    'lllllmddlmlmdo',
    'llllmmdolllmdo',
    '.ooooooooooooo',
  ],
];

const objects = {
  spruce: (v) => k.grid(SPRUCE[v.size][v.form], PINE),
  juniper: (v) => k.grid(JUNIPER[v.index], PINE),
  dwarf_shrub: (v) => k.grid(DWARF_SHRUB[v.index], HEATH),
  moss_cushion: (v) => k.grid(MOSS_CUSHION[v.index], MOSS),
  boulder: (v) => k.grid(BOULDER[v.index], ROCK),
  scree: (v) => k.grid(SCREE[v.index], ROCK),
  ice_block: (v) => k.grid(ICE_BLOCK[v.index], ICE),
};

module.exports = { materials, objects };
