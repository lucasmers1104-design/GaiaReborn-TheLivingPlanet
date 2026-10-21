/* =============================================================================
 * SimEarth 2.0 — terrain recipes, family "coast"
 * -----------------------------------------------------------------------------
 * The beach sand (calm pale sand with faint wind ripples and a few shells),
 * drawn as a strip along the shore; the coconut palm that grows on it; the
 * coral colonies and sand patches seen through a lagoon's water; and the
 * sand cays on the reefs. Ids are fixed in catalog.js.
 *
 *   overlays[id](t)       paint the seamless texture `t` (Tex, wraps)
 *   objects[id](v)        return a sprite; v = { index, size, form }
 * ========================================================================== */
'use strict';

const k = require('./kit');

const c = k.c;

/* -------------------------------------------------------------- overlays -- */

/**
 * Beach sand: flat sand3 with soft, brighter dry patches in sand4, short sand2
 * ripple dashes and now and then a 2 px shell. The texture is rolled so that
 * pixel (0,0) is sand3: the zoomed-out map shows each ground by that pixel.
 */
function beach(t) {
  const S = t.w;
  const patches = k.fbm(S, 4, 3, 1201);
  const ripple = k.fbm(S, 8, 2, 1203);
  const warp = k.fbm(S, 4, 2, 1205);
  t.each((x, y) => c(patches(x, y) > 0.57 ? 'sand4' : 'sand3'));
  // No lone pixels at the patch edges.
  const base = Uint8Array.from(t.px);
  t.each((x, y) => {
    const v = base[t.at(x, y)];
    const n = [base[t.at(x - 1, y)], base[t.at(x + 1, y)], base[t.at(x, y - 1)], base[t.at(x, y + 1)]];
    return n.includes(v) ? v : n[0];
  });
  // Ripples: dashes of 3–4 px along gently warped rows, only where all of it lies on the darker sand.
  for (let y = 0; y < S; y += 4) {
    for (let x = 0; x < S; x += 8) {
      if (k.hash(x, y, 1207) > 0.55) continue;
      const x0 = x + Math.floor(k.hash(x, y, 1208) * 5);
      const len = 3 + (k.hash(x, y, 1209) < 0.5 ? 1 : 0);
      const yy = y + Math.round((warp(x0, y) - 0.5) * 6);
      if (ripple(x0, yy) < 0.4) continue;
      let free = true;
      for (let i = -1; i <= len; i++) if (t.get(x0 + i, yy) !== c('sand3')) free = false;
      if (free) for (let i = 0; i < len; i++) t.set(x0 + i, yy, c('sand2'));
    }
  }
  // Shells: rare, white with a pink lip.
  for (let y = 0; y < S; y += 16) {
    for (let x = 0; x < S; x += 16) {
      if (k.hash(x, y, 1211) > 0.4) continue;
      const sx = x + 1 + Math.floor(k.hash(x, y, 1212) * 13);
      const sy = y + 1 + Math.floor(k.hash(x, y, 1213) * 13);
      t.set(sx, sy, c('white0'));
      t.set(sx + 1, sy, c('blossom1'));
    }
  }
  rollToCalm(t, c('sand3'));
}

/** Shift a seamless texture so (0,0) sits in a 3×3 block of `v`. */
function rollToCalm(t, v) {
  for (let y = 0; y < t.h; y++) {
    for (let x = 0; x < t.w; x++) {
      let calm = true;
      for (let dy = -1; dy <= 1 && calm; dy++) for (let dx = -1; dx <= 1; dx++) if (t.get(x + dx, y + dy) !== v) { calm = false; break; }
      if (!calm) continue;
      const src = Uint8Array.from(t.px);
      t.each((px, py) => src[t.at(px + x, py + y)]);
      return;
    }
  }
}

const overlays = {
  beach_sand: (t) => beach(t),
};

/* --------------------------------------------------------------- objects -- */

/** A hand-drawn sprite; every row must have the same width. */
function sprite(rows, key) {
  const w = rows[0].length;
  rows.forEach((r, i) => { if (r.length !== w) throw new Error(`coast sprite row ${i}: width ${r.length}, expected ${w}`); });
  return k.grid(rows, key);
}

// Coconut palm: slim ringed trunk in a gentle curve, a crown of drooping,
// feathery fronds lit from the upper left, coconuts under the crown.
// Form 0 curves left, form 1 curves right (the renderer leans crowns seaward).
const PALM_KEY = { 0: 'leaf0', 1: 'leaf1', 2: 'leaf2', 3: 'leaf3', B: 'bark2', b: 'bark1', r: 'sand1', o: 'bark0', h: 'straw2' };
const PALM = {
  s0: [
    '....3.....',
    '.33.3.111.',
    '3223210001',
    '31220110.1',
    '.21ooh01..',
    '.2.rb..01.',
    '...Bb.....',
    '...Bb.....',
    '....rb....',
    '....Bb....',
    '....Bb....',
    '.....rb...',
    '....oBbb..',
  ],
  s1: [
    '.....3....',
    '.333.3.11.',
    '3222321001',
    '3.12101101',
    '..21hoo01.',
    '.20..rb.1.',
    '.....Bb...',
    '.....Bb...',
    '....rb....',
    '....Bb....',
    '....Bb....',
    '...rb.....',
    '..bBbo....',
  ],
  m0: [
    '.............',
    '..3..3..111..',
    '.323.3.10001.',
    '32.23210..001',
    '3.1201111...0',
    '..2ohoh001...',
    '.20..o..001..',
    '.2..Bb....0..',
    '0...Bb.......',
    '.....rb......',
    '.....Bb......',
    '.....Bb......',
    '......rb.....',
    '......Bb.....',
    '......Bb.....',
    '.......rb....',
    '......oBbb...',
  ],
  m1: [
    '.............',
    '..333..3..1..',
    '.32223.3.101.',
    '321..23210.01',
    '1...3311010.1',
    '...322hoho1..',
    '..321..o..01.',
    '..1....Bb..1.',
    '.......Bb...0',
    '......rb.....',
    '......Bb.....',
    '......Bb.....',
    '.....rb......',
    '.....Bb......',
    '.....Bb......',
    '....rb.......',
    '...bBbo......',
  ],
  l0: [
    '................',
    '..33..3..1111...',
    '.3223.3.100001..',
    '31..23210..0.01.',
    '3..12212111...01',
    '...210010001...0',
    '..20.ohoh0.01...',
    '.21...oo01..01..',
    '.2....Bb.1...0..',
    '......rb........',
    '......Bb........',
    '.......Bb.......',
    '.......rb.......',
    '.......Bb.......',
    '.......Bb.......',
    '........rb......',
    '........Bb......',
    '........Bb......',
    '.........rb.....',
    '........oBbb....',
  ],
  l1: [
    '................',
    '...3333..3..22..',
    '..322223.3.2112.',
    '.31.1..23221..02',
    '32...33321110..2',
    '1...322210001...',
    '...31.1hoho.01..',
    '..32..21oo...01.',
    '..1...2.Bb....1.',
    '........rb......',
    '........Bb......',
    '.......Bb.......',
    '.......rb.......',
    '.......Bb.......',
    '.......Bb.......',
    '......rb........',
    '......Bb........',
    '......Bb........',
    '.....rb.........',
    '....bBbo........',
  ],
};

/*
 * Reef objects (kind 'reef'), seen from above through the lagoon's clear
 * water, in the reefUnder and coral colours (mixed into its turquoise
 * already). Each colony has its own silhouette and surface — horn cups,
 * honeycomb, chain nets, laminae, meanders, branches, tables, plates — and
 * is lit from the upper left: a light rim there (no brighter than the
 * ripples), a shadow side that turns to the water's teal, and a 1 px cast
 * shadow in the teal of the gaps on the sand to the lower right (under water
 * the renderer draws no shadow); soften() frays the outline into the water,
 * so no colony sits on the surface like a sticker. Variants run from small to
 * large: landcoast.ts picks small heads most often and the large colonies
 * on the reef's seaward side. The renderer draws the water's ripples over them.
 */
const RU = (n) => c(`reefUnder${n}`);
const CO = (n) => c(`coral${n}`);

/** Light, body and shadow of each kind of colony. */
const TONES = {
  ochre: () => [RU(5), RU(2), CO(1)],
  brown: () => [RU(2), RU(0), CO(1)],
  grey: () => [RU(5), CO(7), CO(1)],
  pale: () => [CO(8), RU(5), CO(7)],
  violet: () => [CO(9), RU(1), CO(2)],
  pink: () => [CO(9), RU(3), CO(3)],
  orange: () => [RU(5), RU(4), CO(4)],
  yellow: () => [CO(8), RU(6), CO(5)],
  green: () => [RU(6), CO(6), CO(5)],
  rose: () => [RU(3), CO(3), CO(1)],
};

/** Inside a union of ellipses [cx, cy, rx, ry], the outline frayed a little by hash. */
function lobes(list, seed, fray = 0.25) {
  return (x, y) => list.some(([cx, cy, rx, ry = rx]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 + (k.hash(x, y, seed) - 0.5) * fray);
}

/** Every object stands on its last row: crop empty rows and columns. */
function crop(t) {
  let x0 = t.w, y0 = t.h, x1 = -1, y1 = -1;
  t.each((x, y) => {
    if (t.get(x, y) === 0) return;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  });
  const out = new k.Tex(x1 - x0 + 1, y1 - y0 + 1);
  out.each((x, y) => t.get(x + x0, y + y0));
  return out;
}

/**
 * A shape lit from the upper left in a w × h box: `skin(x, y, tone)` colours
 * it, tone 0 on the lit rim (upper-left neighbour outside), 2 on the shadow
 * side (lower-right neighbour outside), 1 elsewhere; `cast` px of teal
 * shadow fall to the lower right.
 */
function lit(w, h, inside, skin, cast = 1) {
  const t = new k.Tex(w, h);
  const ins = (x, y) => x >= 0 && y >= 0 && x < w && y < h && inside(x, y);
  t.each((x, y) => {
    if (ins(x, y)) return skin(x, y, !ins(x - 1, y - 1) ? 0 : !ins(x + 1, y + 1) ? 2 : 1);
    for (let d = 1; d <= cast; d++) if (ins(x - d, y - d)) return CO(0);
    return undefined;
  });
  return t;
}

/** Copy `src`'s pixels onto `t` at (x, y), the teal shadow only onto empty pixels. */
function over(t, src, x, y) {
  src.each((sx, sy) => {
    const v = src.get(sx, sy);
    if (v === 0 || (v === CO(0) && t.get(x + sx, y + sy) !== 0)) return;
    t.set(x + sx, y + sy, v);
  });
}

/**
 * Horn corals (rugose): solitary cups standing close, each a light rim round
 * a dark mouth, the cups of a bed in two or three tones. `cups`: [x, y, big].
 */
// A cup is hollow: lit from the upper left, its rim is light there and its
// mouth dark on that side, the inner wall facing the light bright again.
const CUPS = [
  ['.L.', 'LDB', '.S.'],
  ['.LL.', 'LDDB', 'LDLS', '.BS.'],
  ['.LLL.', 'LDDDB', 'LDDBB', 'LDBLS', '.BSS.'],
];
function hornBed(w, h, cups, tones) {
  const t = new k.Tex(w, h);
  cups.forEach(([x, y, size], n) => over(t, glyph(CUPS[size], tones[n % tones.length]), x, y));
  return crop(t);
}

/**
 * A small head drawn by hand: L light, B body, S shadow of `tone`, D the
 * dark of the mouths and grooves; its teal shadow is added to the lower right.
 */
function glyph(rows, tone) {
  const [L, B, S] = TONES[tone]();
  const key = { L, B, S, D: CO(1) };
  const t = new k.Tex(rows[0].length + 1, rows.length + 1);
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') t.set(x, y, key[ch]); }));
  const body = Uint8Array.from(t.px);
  t.each((x, y) => (body[y * t.w + x] === 0 && x > 0 && y > 0 && body[(y - 1) * t.w + x - 1] !== 0 ? CO(0) : undefined));
  return t;
}

/** Cells of about `gap` px over a shape: wall(x, y) is true on the walls between them. */
function cells(w, h, inside, gap, seed) {
  const pts = [];
  for (let n = 0; n < 80 && pts.length < (w * h) / (gap * gap); n++) {
    const p = [k.hash(n, 1, seed) * w, k.hash(n, 2, seed) * h];
    if (inside(Math.floor(p[0]), Math.floor(p[1])) && pts.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > gap)) pts.push(p);
  }
  return (x, y) => {
    const d = pts.map((p) => Math.hypot(p[0] - x, p[1] - y)).sort((a, b) => a - b);
    return d.length < 2 || d[1] - d[0] < 1.1;
  };
}

/** Tabulate corals (Favosites): a dome of honeycomb, light walls round the tubes' darker mouths. */
function honeycomb(w, h, list, tone, seed) {
  const [L, B, S] = TONES[tone]();
  const inside = lobes(list, seed);
  const wall = cells(w, h, inside, 2.2, seed);
  return crop(lit(w, h, inside, (x, y, n) => (n === 0 ? L : n === 2 ? S : wall(x, y) ? B : RU(0))));
}

/** Chain corals (Halysites): walls of linked tubes round open gaps, a net over the sand. */
function chainNet(w, h, list, tone, seed) {
  const [L, B, S] = TONES[tone]();
  const inside = lobes(list, seed, 0.1);
  const wall = cells(w, h, inside, 2.6, seed);
  const shape = (x, y) => inside(x, y) && (wall(x, y) || !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1));
  return crop(lit(w, h, shape, (x, y, n) => (n === 0 ? L : n === 2 ? S : B)));
}

/** Stromatoporoids: a low pale mound of layers, bands round its top. */
function laminae(w, h, list, tone, seed) {
  const [L, B, S] = TONES[tone]();
  const [cx, cy, rx, ry] = list[0];
  return crop(lit(w, h, lobes(list, seed), (x, y, n) => {
    if (n !== 1) return n === 0 ? L : S;
    const r = Math.hypot((x - cx + 0.6) / rx, (y - cy + 0.6) / (ry ?? rx));
    return Math.floor(r * 3.2 + k.hash(x, y, seed + 1) * 0.5) % 2 === 0 ? B : S;
  }));
}

/** Brain corals: a dome of meandering ridges, light on top, and dark grooves. */
function brain(w, h, list, tone, seed) {
  const [L, B, S] = TONES[tone]();
  return crop(lit(w, h, lobes(list, seed), (x, y, m) => {
    if (m !== 1) return m === 0 ? L : S;
    const v = (x + Math.sin(y * 1.1 + seed) * 1.6 + Math.sin(x * 0.7 + seed) * 0.9) * 0.55 + y * 0.4;
    const f = ((v % 1.5) + 1.5) % 1.5;
    return f < 0.45 ? S : f < 1.05 ? B : L;
  }));
}

/** Knobby heads (massive corals): lumps with light polyp dots. */
function knobs(w, h, list, tone, seed) {
  const [L, B, S] = TONES[tone]();
  return crop(lit(w, h, lobes(list, seed), (x, y, n) => (n === 0 ? L : n === 2 ? S : k.hash(x, y, seed + 3) < 0.15 ? L : B)));
}

/**
 * Branching corals (staghorn): branches grow out from the middle and fork,
 * a dark base, light tips, the sand between them open; each branch casts
 * its teal shadow.
 */
function branches(w, h, arms, tone, seed) {
  const [L, B, S] = TONES[tone]();
  const t = new k.Tex(w, h);
  const cx = (w - 2) / 2;
  const cy = (h - 2) / 2;
  const tips = [];
  // Straight arms out of the base, forking once or twice: antlers, not noodles.
  const grow = (x, y, a, len, depth, id) => {
    let px = x;
    let py = y;
    for (let s = 1; s <= len; s++) {
      px = Math.round(x + Math.cos(a) * s);
      py = Math.round(y + Math.sin(a) * s * 0.8);
      if (px < 0 || py < 0 || px >= w - 1 || py >= h - 1) break;
      if (t.get(px, py) === 0) t.set(px, py, B);
      if (depth < 2 && s === Math.ceil(len / 2) && k.hash(id, 99, seed) < 0.8) {
        grow(px, py, a + (k.hash(id, 98, seed) < 0.5 ? 0.8 : -0.8), Math.max(1, Math.round(len * 0.55)), depth + 1, id * 7 + 3);
      }
    }
    tips.push([px, py]);
  };
  const reach = Math.min(w / 2, h / 1.6) - 1;
  for (let n = 0; n < arms; n++) {
    grow(Math.round(cx), Math.round(cy), (n / arms) * Math.PI * 2 + (k.hash(n, 0, seed) - 0.5) * 1.1, Math.max(2, Math.round(reach * (0.65 + k.hash(n, 1, seed) * 0.35))), 0, n + 1);
  }
  t.set(Math.round(cx), Math.round(cy), S);
  for (const [x, y] of tips) t.set(x, y, L);
  // The branches' shadow on the sand.
  const body = Uint8Array.from(t.px);
  t.each((x, y) => (body[y * w + x] === 0 && x > 0 && y > 0 && body[(y - 1) * w + x - 1] !== 0 ? CO(0) : undefined));
  return crop(t);
}

/** Crinoids (sea lilies), seen from above: a dark cup, five feathery arms spread like a star, light tips. */
function crinoid(size, tone, seed) {
  const [L, B, S] = TONES[tone]();
  const w = size * 2 + 2;
  const t = new k.Tex(w, w);
  const c0 = size;
  const turn = k.hash(1, 2, seed) * Math.PI;
  for (let a = 0; a < 5; a++) {
    const ang = turn + (a / 5) * Math.PI * 2;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    for (let r = 1; r <= size; r++) {
      const x = Math.round(c0 + dx * r);
      const y = Math.round(c0 + dy * r);
      t.set(x, y, r === size ? L : B);
      // Pinnules: the arm's feathers, to one side and the other.
      if (r >= 2 && r < size) {
        const side = r % 2 === 0 ? 1 : -1;
        const px = Math.round(c0 + dx * r - dy * side);
        const py = Math.round(c0 + dy * r + dx * side);
        if (t.get(px, py) === 0) t.set(px, py, L);
      }
    }
  }
  t.set(c0, c0, S);
  const body = Uint8Array.from(t.px);
  t.each((x, y) => (body[y * w + x] === 0 && x > 0 && y > 0 && body[(y - 1) * w + x - 1] !== 0 ? CO(0) : undefined));
  return crop(t);
}

/** Table corals: a flat disc on a stalk, fine radial grain, its shadow wide on the sand. */
function table(w, h, list, tone, seed) {
  const [L, B, S] = TONES[tone]();
  const [cx, cy] = list[0];
  return crop(lit(w, h, lobes(list, seed, 0.15), (x, y, n) => {
    if (n !== 1) return n === 0 ? L : S;
    const a = Math.atan2(y - cy, (x - cx) * 0.7);
    return Math.floor(a * 3.2 + 8) % 2 === 0 ? B : L;
  }, 2));
}

/** Plate corals: whorls of overlapping plates, back to front, each with its lit edge. */
function plates(w, h, list, tone, seed) {
  const t = new k.Tex(w, h);
  const [L, B, S] = TONES[tone]();
  // Each plate over the one behind it: its lit rim crosses that plate's body.
  list.forEach((l, n) => over(t, lit(w, h, lobes([l], seed + n, 0.12), (x, y, m) => (m === 0 ? L : m === 2 ? S : B)), 0, 0));
  return crop(t);
}

/**
 * Seen through the water a colony has no hard edge: on its outline every
 * other pixel gives way, the lit rim to the lagoon itself, the shadow side to
 * the teal of the cast shadow. Only where the colony is 2 px thick there, so
 * branches, arms and cup rims stay whole.
 */
function soften(t) {
  const T = CO(0);
  const src = Uint8Array.from(t.px);
  const body = (x, y) => x >= 0 && y >= 0 && x < t.w && y < t.h && src[y * t.w + x] !== 0 && src[y * t.w + x] !== T;
  t.each((x, y) => {
    if (!body(x, y) || (x + y) % 2 !== 0) return undefined;
    if ((!body(x - 1, y) || !body(x, y - 1)) && body(x + 1, y) && body(x, y + 1) && body(x + 1, y + 1)) return 0;
    if ((!body(x + 1, y) || !body(x, y + 1)) && body(x - 1, y) && body(x, y - 1) && body(x - 1, y - 1)) return T;
    return undefined;
  });
  return crop(t);
}

/**
 * Paleozoic reefs (CoralKind.Rugose): horn-coral beds, with tabulate
 * corals (honeycomb domes, chain nets), pale stromatoporoid mounds and
 * the sea lilies between them; ochre, brown, grey, pale and rose. Small
 * to large.
 */
const RUGOSE = [
  () => hornBed(6, 6, [[0, 0, 1]], ['ochre']),
  () => hornBed(7, 6, [[0, 1, 0], [2, 0, 0], [3, 2, 0]], ['brown', 'ochre', 'ochre']),
  () => glyph(['.LLL.', 'LBDBB', 'BDBDS', '.SSS.'], 'brown'),
  () => crinoid(2, 'rose', 1711),
  () => glyph(['.LLLL.', 'LBLBBS', '.SSSS.'], 'pale'),
  () => hornBed(9, 8, [[0, 1, 2], [4, 0, 1], [3, 4, 1], [7, 3, 0]], ['ochre', 'brown', 'orange', 'brown']),
  () => honeycomb(9, 7, [[4, 3, 4, 3]], 'ochre', 1705),
  () => crinoid(3, 'yellow', 1712),
  () => chainNet(10, 8, [[4.5, 3.5, 4.6, 3.4]], 'brown', 1706),
  () => laminae(10, 7, [[4.5, 3, 4.6, 3], [7, 4, 2.2]], 'pale', 1707),
  () => hornBed(12, 10, [[0, 2, 2], [4, 0, 1], [5, 4, 2], [8, 1, 1], [9, 5, 0], [2, 7, 0], [6, 8, 0]], ['ochre', 'brown', 'orange', 'grey']),
  () => honeycomb(12, 9, [[5, 4, 4.6, 3.6], [8.5, 5, 2.6]], 'grey', 1709),
];
function rugose(v) {
  return soften(RUGOSE[v.index]());
}

/**
 * Modern reefs (CoralKind.Stony): knobs, brain corals, staghorn thickets,
 * tables and plate whorls in muted violet, pink, orange, yellow, green and
 * brown. Small to large.
 */
const STONY = [
  () => glyph(['.LL.', 'LBLB', 'BBBS', '.SS.'], 'brown'),
  () => glyph(['.LLL.', 'LBSBB', 'BSBSB', 'BBSBS', '.SSS.'], 'yellow'),
  () => glyph(['.LL..', 'LBBLB', 'BBBBS', '.SSS.'], 'orange'),
  () => glyph(['.L..L', '..B.B', 'L.BB.', '.BS..', '..L..'], 'violet'),
  () => brain(8, 7, [[3.5, 3, 3.4, 2.8]], 'green', 1734),
  () => branches(9, 8, 5, 'ochre', 1735),
  () => knobs(8, 6, [[2, 2.5, 2.2], [5, 2, 2.4], [4, 3.5, 2]], 'brown', 1736),
  () => knobs(8, 7, [[2, 2, 1.8], [5, 2, 2], [3.5, 4.5, 1.9]], 'violet', 1737),
  () => table(11, 8, [[5, 3.2, 5, 3]], 'green', 1738),
  () => branches(12, 9, 6, 'violet', 1739),
  () => brain(10, 8, [[4.5, 3.5, 4.4, 3.4]], 'yellow', 1740),
  () => plates(12, 9, [[2.5, 2.5, 2.3], [6, 2, 2.5], [9, 3.5, 2.2], [4, 6, 2.4], [7.5, 6, 2.2]], 'pink', 1741),
];
function stony(v) {
  return soften(STONY[v.index]());
}

/** Sand the fish ground out of the reef: a clearing of bright shallow turquoise, pale sand showing in its middle. */
const SAND = [
  [[2.5, 1.5, 2.5, 1.5]],
  [[3, 2, 3.2, 2], [6, 2.5, 2.4, 1.8]],
  [[4, 2.5, 4, 2.4], [7.5, 3.5, 3, 2.2], [2.5, 4, 2.4, 1.6]],
  [[5, 3, 5, 2.6], [9, 4, 3, 2.2], [3, 5, 3, 1.6]],
];
function reefSand(v) {
  const list = SAND[v.index];
  const inside = lobes(list, 1720 + v.index, 0.4);
  const w = 14;
  const h = 9;
  const t = new k.Tex(w, h);
  const ins = (x, y) => x >= 0 && y >= 0 && x < w && y < h && inside(x, y);
  const core = (x, y) => ins(x, y) && ins(x - 1, y) && ins(x + 1, y) && ins(x, y - 1) && ins(x, y + 1);
  t.each((x, y) => {
    if (!ins(x, y)) return undefined;
    if (!core(x, y)) return c('waterWarm2');
    return core(x - 1, y) && core(x + 1, y) && core(x, y - 1) && core(x, y + 1) ? RU(7) : c('waterWarm3');
  });
  return crop(t);
}

/*
 * Sand cays (kind 'cay'): a low islet of reef sand, seen from above —
 * bright dry sand, darker and wet on its lower-right rim, a broken white
 * surf ring and the bright shallows round it. Drawn over the water and its
 * ripples; palms may stand on it (landcoast.ts).
 */
const CAY = [
  [[2.5, 1.8, 2.4, 1.6], [4.5, 2.6, 1.6, 1.2]],
  [[3, 2.2, 3, 1.8], [6, 1.6, 2.2, 1.4], [1.5, 3, 1.4, 1.1]],
  [[4, 2.2, 3.6, 2], [7.5, 3.2, 2.4, 1.5], [2, 3.6, 1.8, 1.3]],
];
function cay(v) {
  const sand = lobes(CAY[v.index], 1750 + v.index, 0.2);
  const w = 14;
  const h = 10;
  // The islet sits 2 px in from the box: room for the surf and the shallows round it.
  const inside = (x, y) => sand(x - 2, y - 2);
  const near = (x, y, r) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.abs(dx) + Math.abs(dy) <= r && inside(x + dx, y + dy)) return true;
    return false;
  };
  return crop(new k.Tex(w, h).each((x, y) => {
    if (inside(x, y)) {
      // Bright dry sand, a little darker towards the lower right, wet on that rim.
      if (!inside(x + 1, y) || !inside(x, y + 1)) return c('sand2');
      if (!inside(x - 1, y) || !inside(x, y - 1)) return c('sand3');
      return inside(x + 1, y + 1) && inside(x + 2, y + 1) && inside(x + 1, y + 2) ? c('sand4') : c('sand3');
    }
    if (near(x, y, 1)) return k.hash(x, y, 1755) < 0.5 ? c('white0') : c('waterWarm3');
    if (near(x, y, 2)) return c('waterWarm3');
    return undefined;
  }));
}

const objects = {
  coconut_palm: (v) => sprite(PALM[`${v.size}${v.form}`], PALM_KEY),
  coral_rugose: (v) => rugose(v),
  coral_stony: (v) => stony(v),
  reef_sand: (v) => reefSand(v),
  reef_cay: (v) => cay(v),
};

module.exports = { overlays, objects };
