/* =============================================================================
 * Gaia Reborn — the vines' leaves, flowers, tendrils, knot and little lights
 * -----------------------------------------------------------------------------
 * Leaves are grown from a midrib curve: a short stalk from the `base` pixel,
 * then a blade whose half-width swells and tapers to a point. Rasterized at
 * 4 × 4 samples per pixel, so all twelve frames of a leaf are the same leaf:
 * state v (fresh, faded, wilted and drooping, dry and curled) × sway s. The
 * wind blows from the left: every sway step moves the tip about one pixel to
 * the right, on `_r`, `_l` and hanging leaves alike. `_l` is the mirrored
 * shape, shaded anew so the light stays upper left: the blade half facing
 * the light is a step lighter, edges facing it lighter again, edges facing
 * away a step darker, the outline a shade lighter on the lit side.
 * Flowers, tendril curls, the knot, the falling leaf and the firefly are
 * hand-pixelled grids in tone letters, coloured per variant.
 * ========================================================================== */
'use strict';

const K = require('./kit');

const DEG = Math.PI / 180;
/** Towards the light: upper left, mostly from above. */
const LIGHT = [-0.5, -0.866];
const unit = (a) => [Math.cos(a * DEG), -Math.sin(a * DEG)];
const N4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];

/* ------------------------------------------------------------- leaves -- */

/** Per state (v): outline on the shadow and on the lit side, stalk, blade tones shade … highlight, midrib, veins. */
const LEAF_TONES = [
  { out: ['vine0', 'vine1'], stalk: 'vine2', tone: ['vine2', 'vine3', 'vine4', 'vine5'], spec: 'vine6', rib: 'vine5', vein: 'vine4' },
  { out: ['mud0', 'mud1'], stalk: 'faded1', tone: ['faded1', 'faded2', 'faded3', 'faded4'], spec: 'faded4', rib: 'faded4', vein: 'faded3' },
  { out: ['stem0', 'wilt0'], stalk: 'wilt1', tone: ['wilt1', 'wilt2', 'wilt3', 'wilt4'], spec: 'wilt4', rib: 'wilt4', vein: 'wilt3' },
  { out: ['ink1', 'stem0'], stalk: 'wilt0', tone: ['wilt0', 'wilt1', 'wilt2', 'wilt3'], spec: 'wilt3', rib: 'wilt3', vein: 'wilt2' },
];

/** Leaf shapes in their `_r` pose: angle (degrees, counter-clockwise from right), stalk and blade length, half-width, where it is widest (0..1), vein positions. */
const LEAF = {
  s: { angle: 52, stalk: 1.2, blade: 5.4, width: 1.6, widest: 0.42, veins: [], spec: false },
  m: { angle: 50, stalk: 1.6, blade: 8.4, width: 2.35, widest: 0.4, veins: [0.45], spec: true },
  l: { angle: 48, stalk: 2.0, blade: 11.6, width: 3.1, widest: 0.4, veins: [0.3, 0.55], spec: true },
  hang: { angle: -96, stalk: 1.6, blade: 7.2, width: 2.2, widest: 0.4, veins: [0.45], spec: true },
};
/** Every leaf curves a little, its tip bending down (degrees). */
const CURVE = 8;

/** Points along the midrib from the base pixel's centre, 0.05 px apart; the blade turns `bend` degrees in all, most of it towards the tip. */
function spine(g) {
  const step = 0.05;
  const len = g.stalk + g.blade;
  const pts = [];
  let x = g.bx + 0.5;
  let y = g.by + 0.5;
  let a = g.angle;
  for (let u = 0; u <= len + 1e-9; u += step) {
    const [dx, dy] = unit(a);
    pts.push({ x, y, u, dx, dy });
    const t = (u - g.stalk) / g.blade;
    if (t > 0 && g.bend) a += (g.bend * (g.bendPow + 1) * Math.pow(t, g.bendPow) * step) / g.blade;
    x += dx * step;
    y += dy * step;
  }
  return pts;
}

/** Pixels along the spine between lengths u0 and u1, one per step, without L-shaped corners. */
function pathPixels(pts, u0, u1) {
  const raw = [];
  for (const p of pts) {
    if (p.u < u0 || p.u > u1) continue;
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    const last = raw[raw.length - 1];
    if (!last || last[0] !== x || last[1] !== y) raw.push([x, y]);
  }
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const a = out[out.length - 1];
    const c = raw[i + 1];
    if (a && c && Math.abs(a[0] - c[0]) === 1 && Math.abs(a[1] - c[1]) === 1) continue;
    out.push(raw[i]);
  }
  return out;
}

const STALK = 1;
const LIT = 2;
const DARK = 3;
const RIB = 4;

/** Tags per pixel: 0 empty, STALK, LIT and DARK blade halves, RIB; plus vein pixels and the spec pixel. */
function rasterLeaf(w, h, g) {
  const pts = spine(g);
  const blade = pts.filter((p) => p.u >= g.stalk);
  const k = Math.log(0.5) / Math.log(g.widest);
  const half = (t) => (t <= 0 || t >= 1 ? 0 : g.width * Math.pow(Math.sin(Math.PI * Math.pow(t, k)), 1.2));
  const mid = blade[Math.floor(blade.length / 2)];
  const litLeft = mid.dy * LIGHT[0] - mid.dx * LIGHT[1] > 0;
  const tag = new Uint8Array(w * h);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      let lit = 0;
      let dark = 0;
      for (let j = 0; j < 4; j++) {
        for (let i = 0; i < 4; i++) {
          const sx = px + (i + 0.5) / 4;
          const sy = py + (j + 0.5) / 4;
          let best = Infinity;
          let bp = null;
          for (const p of blade) {
            const d = (sx - p.x) ** 2 + (sy - p.y) ** 2;
            if (d < best) { best = d; bp = p; }
          }
          const along = (sx - bp.x) * bp.dx + (sy - bp.y) * bp.dy;
          if ((bp === blade[0] && along < 0) || (bp === blade[blade.length - 1] && along > 0)) continue;
          const v = (sx - bp.x) * bp.dy - (sy - bp.y) * bp.dx;
          const isLit = (v > 0) === litLeft;
          if (Math.abs(v) <= half((bp.u - g.stalk) / g.blade) * (isLit ? g.wLit : g.wDark)) {
            if (isLit) lit++;
            else dark++;
          }
        }
      }
      if (lit + dark >= 8) tag[py * w + px] = lit >= dark ? LIT : DARK;
    }
  }
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? tag[y * w + x] : 0);
  // Notches filled, lone pixels dropped.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = N4.filter(([dx, dy]) => at(x + dx, y + dy) >= LIT);
      if (!at(x, y) && n.length >= 3) tag[y * w + x] = at(x + n[0][0], y + n[0][1]);
      else if (at(x, y) && n.length === 0) tag[y * w + x] = 0;
    }
  }
  for (const [x, y] of pathPixels(pts, 0, g.stalk + 0.6)) if (x >= 0 && y >= 0 && x < w && y < h && !tag[y * w + x]) tag[y * w + x] = STALK;
  tag[g.by * w + g.bx] = tag[g.by * w + g.bx] || STALK;
  for (const [x, y] of pathPixels(pts, g.stalk + 0.4, g.stalk + g.rib * g.blade)) if (at(x, y) >= LIT) tag[y * w + x] = RIB;
  // Side veins on the shadow half, branching off the midrib towards the tip.
  const veins = [];
  for (const t of g.veins) {
    const p = blade[Math.min(blade.length - 1, Math.round(t * (blade.length - 1)))];
    const n = litLeft ? [-p.dy, p.dx] : [p.dy, -p.dx];
    const len = half(t) * g.wDark * 1.2;
    for (let s = 0.9; s <= len; s += 0.25) {
      const x = Math.floor(p.x + (p.dx + n[0]) * s * 0.7071);
      const y = Math.floor(p.y + (p.dy + n[1]) * s * 0.7071);
      if (at(x, y) === DARK) veins.push([x, y]);
    }
  }
  return { tag, veins, at };
}

/** Light a tagged leaf in state tones `T` and outline it; `spec` adds one glint on the lit edge. The stalk's first pixels stay unrimmed: they lie on the stem. */
function shadeLeaf(w, h, r, T, spec, base) {
  const t = new K.Tex(w, h);
  const { tag, at } = r;
  const exposure = (x, y) => N4.reduce((a, [dx, dy]) => a + (at(x + dx, y + dy) ? 0 : dx * LIGHT[0] + dy * LIGHT[1]), 0);
  let glint = null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = tag[y * w + x];
      if (!v) continue;
      if (v === STALK) { K.put(t, x, y, T.stalk); continue; }
      if (v === RIB) { K.put(t, x, y, T.rib); continue; }
      // The lit half is a step lighter and brighter still where it faces the light; the shadow half darkens where it faces away.
      const e = exposure(x, y);
      let s = v === LIT ? 2 : 1;
      if (v === LIT && e > 0.3) s = 3;
      else if (v === DARK && e < -0.3) s = 0;
      K.put(t, x, y, T.tone[s]);
      if (v === LIT && s === 3 && (!glint || e > glint[2] || (e === glint[2] && x + y < glint[0] + glint[1]))) glint = [x, y, e];
    }
  }
  const veinSet = new Set(r.veins.map(([x, y]) => y * w + x));
  for (const i of veinSet) if (t.px[i] === K.c(T.tone[1])) t.px[i] = K.c(T.vein);
  if (spec && glint) K.put(t, glint[0], glint[1], T.spec);
  // Selective outline: a shade lighter where the leaf lies below or right of it (its lit side).
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && t.px[y * w + x] !== 0;
  const rim = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue;
      let toward = 0;
      let any = false;
      for (const [dx, dy] of N4) {
        if (!solid(x + dx, y + dy)) continue;
        const junction = tag[(y + dy) * w + x + dx] === STALK && Math.abs(x + dx - base[0]) + Math.abs(y + dy - base[1]) <= 1;
        if (junction) continue;
        any = true;
        toward += dx * LIGHT[0] + dy * LIGHT[1];
      }
      if (any) rim.push([x, y, toward < -0.3 ? T.out[1] : T.out[0]]);
    }
  }
  for (const [x, y, col] of rim) K.put(t, x, y, col);
  return t;
}

/** Recipe for leaf `kind`; `side` 'r' or 'l' (the mirror, base on the box's other side). */
function leafRecipe(kind, side) {
  return (f, s) => {
    const L = LEAF[kind];
    const v = Math.floor(f / 3);
    const sway = f % 3;
    const [bx, by] = s.points.base;
    let angle = side === 'l' ? 180 - L.angle : L.angle;
    const turn = (1.05 / (L.stalk + L.blade)) / DEG;
    // Wind from the left: turn so the tip's x grows.
    angle -= Math.sign(Math.sin(angle * DEG)) * sway * turn;
    // Gravity: wilted leaves bend their tip down (a hanging leaf curls it left).
    const c = Math.cos(angle * DEG);
    const down = Math.abs(c) < 0.2 ? -1 : -Math.sign(c);
    const g = {
      bx, by, angle, stalk: L.stalk, blade: L.blade, width: L.width, widest: L.widest,
      bend: CURVE * down, bendPow: 1.5, wLit: 1, wDark: 1, rib: 0.78, veins: v <= 1 ? L.veins : [],
    };
    if (v === 2) { g.bend = (CURVE + 16) * down; g.width *= 0.92; }
    if (v === 3) { g.blade -= 1; g.bend = (CURVE + 40) * down; g.bendPow = 2.2; g.wLit = 0.78; g.wDark = 0.42; g.rib = 0.6; }
    return shadeLeaf(s.w, s.h, rasterLeaf(s.w, s.h, g), LEAF_TONES[v], L.spec && v <= 1, [bx, by]);
  };
}

/* ------------------------------------------------------------ flowers -- */

/**
 * Flower stages in tone letters: o petal outline, H P S petal light … shade,
 * Y C c the heart light … dark, k G g d calyx outline and greens.
 * 0 bud, 1 half open, 2 open, 3 full bloom, 4 wilted (petals hang), 5 dry.
 */
const FLOWER_STAGES = [
  [
    '.........',
    '.........',
    '....o....',
    '...oHo...',
    '..oHPSo..',
    '..kGPdk..',
    '..kGgdk..',
    '...kgk...',
    '.........',
  ],
  [
    '.........',
    '..o.o.o..',
    '.oHoPoSo.',
    '.oHPPPSo.',
    '.oHPPPSo.',
    '..oPPSo..',
    '..kGgdk..',
    '...kgk...',
    '.........',
  ],
  [
    '.........',
    '...ooo...',
    '..oHPSo..',
    '.ooPYPoo.',
    'oHPCCcPSo',
    '.oPScSPo.',
    '.oHSoSSo.',
    '..oo.oo..',
    '.........',
  ],
  [
    '...ooo...',
    '.ooHHPoo.',
    'oHoPPSoPo',
    'oHPSYSPSo',
    'oPPCCcSSo',
    '.oPScSPo.',
    'oHPSoSPSo',
    'oPSo.oSSo',
    '.oo...oo.',
  ],
  [
    '.........',
    '.........',
    '...ooo...',
    '.ooPYPoo.',
    'oHPCCcPSo',
    'oPoScSoSo',
    'oSoooooSo',
    '.o.....o.',
    '.........',
  ],
  [
    '.........',
    '.........',
    '...o.o...',
    '..oPoSo..',
    '..oPCSo..',
    '..kGcdk..',
    '..kGgdk..',
    '...kgk...',
    '.........',
  ],
];

/** Petal and heart colours per flower; `wilt` for stage 4, the dry stage is brown for all. */
const FLOWER_TONES = {
  w: { o: 'vine0', H: 'parch5', P: 'white0', S: 'glowV4', Y: 'petalY3', C: 'petalY2', c: 'gold2' },
  p: { o: 'petal0', H: 'petal3', P: 'petal2', S: 'petal1', Y: 'petalY3', C: 'petalY2', c: 'gold2' },
  y: { o: 'gold0', H: 'petalY3', P: 'petalY2', S: 'petalY1', Y: 'gold3', C: 'wood4', c: 'wood2' },
  b: { o: 'petalB0', H: 'petalB3', P: 'petalB2', S: 'petalB1', Y: 'white0', C: 'petalY3', c: 'petalY1' },
};
const FLOWER_WILT = {
  w: { o: 'mud0', H: 'lichen1', P: 'faded4', S: 'faded3', Y: 'wilt4', C: 'wilt3', c: 'wilt1' },
  p: { o: 'petal0', H: 'petal2', P: 'petal1', S: 'faded2', Y: 'wilt4', C: 'wilt3', c: 'wilt1' },
  y: { o: 'wilt0', H: 'straw3', P: 'straw2', S: 'wilt3', Y: 'wilt3', C: 'wilt1', c: 'wilt0' },
  b: { o: 'petalB0', H: 'petalB2', P: 'petalB1', S: 'faded2', Y: 'wilt4', C: 'wilt3', c: 'wilt1' },
};
const FLOWER_DRY = { o: 'ink1', H: 'wilt3', P: 'wilt2', S: 'wilt1', Y: 'wilt2', C: 'wilt1', c: 'stem0' };
const CALYX = { k: 'vine0', G: 'vine4', g: 'vine3', d: 'vine2' };
const CALYX_DRY = { k: 'ink1', G: 'wilt2', g: 'wilt1', d: 'wilt0' };

function flowerRecipe(col) {
  return (f, s) => {
    const tones = f === 5 ? FLOWER_DRY : f === 4 ? FLOWER_WILT[col] : FLOWER_TONES[col];
    const rows = FLOWER_STAGES[f];
    const t = new K.Tex(s.w, s.h);
    const g = K.grid(rows, { ...tones, ...(f === 5 ? CALYX_DRY : CALYX) });
    const ox = Math.floor(s.w / 2) - Math.floor(g.w / 2);
    const oy = Math.floor(s.h / 2) - Math.floor(g.h / 2);
    t.stamp(g, ox, oy);
    return t;
  };
}

/* -------------------------------------------------------------- curls -- */

/** Tendril curls for `_r` (base bottom left): T light, t mid, d dark, o outline. 0 hook, 1 half curl, 2 full spiral. */
const CURLS = [
  [
    '......',
    '......',
    '...TT.',
    '..T..t',
    '.t....',
    'd.....',
  ],
  [
    '...TT.',
    '..T..t',
    '..T..t',
    '.T..t.',
    '.t....',
    'd.....',
  ],
  [
    '..TTT.',
    '.T...t',
    '.T.T.t',
    '.T..t.',
    '.t....',
    'd.....',
  ],
];
const CURL_TONES = { T: 'vine4', t: 'vine3', d: 'vine2', o: 'vine0' };

function curlRecipe(side) {
  return (f) => {
    const g = K.grid(CURLS[f], CURL_TONES);
    return side === 'l' ? K.mirror(g) : g;
  };
}

/* --------------------------------------------------------------- knot -- */

/** The knot between the rail's button groups: a twig across (arms, rows 3–5) with a wooden boss in its middle (rows 1–6); stem tones 0 dark … 4 light. */
const KNOT_BOSS = [
  '.34432.',
  '3432221',
  '4321122',
  '3210121',
  '2211211',
  '.11111.',
];
const KNOT_ARM = ['.33433', '132221', '..1111'];
const KNOT = Array.from({ length: 8 }, (_, y) => {
  const boss = KNOT_BOSS[y - 1] ?? '.......';
  const arm = KNOT_ARM[y - 3] ?? '......';
  return `.${arm}${boss}${[...arm].reverse().join('')}.`;
});
const KNOT_TONES = { 0: 'stem0', 1: 'stem1', 2: 'stem2', 3: 'stem3', 4: 'stem4' };
/** The little flower the knot wears in frame 2: o outline, H P S petals, Y C c heart. */
const KNOT_FLOWER = [
  '...o...',
  '.ooHoo.',
  'oHPYPSo',
  '.oCCco.',
  'oPSoPSo',
  '.oo.oo.',
];

function knotRecipe(f, s) {
  const t = K.grid(KNOT, KNOT_TONES);
  K.outline(t, 'stem0');
  if (f >= 1) {
    // Four small leaves sprout from the twig, two up and two down, all a little outward.
    for (const [bx, by, angle] of [[5, 3, 145], [15, 3, 35], [7, 5, 200], [13, 5, -20]]) {
      const g = {
        bx, by, angle, stalk: 0.8, blade: 3.6, width: 1.25, widest: 0.42,
        bend: 0, bendPow: 1.5, wLit: 1, wDark: 1, rib: 0.7, veins: [],
      };
      t.stamp(shadeLeaf(s.w, s.h, rasterLeaf(s.w, s.h, g), LEAF_TONES[0], false, [bx, by]), 0, 0);
    }
  }
  if (f === 2) t.stamp(K.grid(KNOT_FLOWER, FLOWER_TONES.w), 7, 1);
  return t;
}

/* --------------------------------------------------------- small bits -- */

const FALL = [
  [
    '..ooo',
    '.oHPo',
    'oHPSo',
    'oPSo.',
    'soo..',
  ],
  [
    '.....',
    '.ooo.',
    'oHPPo',
    'soSSo',
    '..oo.',
  ],
  [
    'ooo..',
    'oSPo.',
    'oPSSo',
    '.oSPo',
    '..oos',
  ],
  [
    '..o..',
    '.oHo.',
    '.oPo.',
    '.oSo.',
    '..s..',
  ],
];
const FALL_TONES = { o: 'wilt0', H: 'wilt4', P: 'wilt3', S: 'wilt2', s: 'wilt1' };

const FIREFLY = [
  ['...', '.a.', '...'],
  ['.b.', 'bAb', '.b.'],
  ['cBc', 'BWB', 'cBc'],
  ['.b.', 'bAb', '.b.'],
];
const FIREFLY_TONES = { a: 'vine5', A: 'vine6', b: 'vine3', B: 'vine5', c: 'vine2', W: 'petalY3' };

module.exports = {
  sprites: {
    leaf_s_r: leafRecipe('s', 'r'),
    leaf_s_l: leafRecipe('s', 'l'),
    leaf_m_r: leafRecipe('m', 'r'),
    leaf_m_l: leafRecipe('m', 'l'),
    leaf_l_r: leafRecipe('l', 'r'),
    leaf_l_l: leafRecipe('l', 'l'),
    leaf_hang: leafRecipe('hang', 'r'),
    flower_w: flowerRecipe('w'),
    flower_p: flowerRecipe('p'),
    flower_y: flowerRecipe('y'),
    flower_b: flowerRecipe('b'),
    curl_r: curlRecipe('r'),
    curl_l: curlRecipe('l'),
    knot: knotRecipe,
    leaf_fall: (f) => K.grid(FALL[f], FALL_TONES),
    firefly: (f) => K.grid(FIREFLY[f], FIREFLY_TONES),
  },
};
