/* =============================================================================
 * SimEarth 2.0 — terrain recipes, family "coast"
 * -----------------------------------------------------------------------------
 * The beach sand (calm pale sand with faint wind ripples and a few shells),
 * drawn as a strip along the shore; the coconut palm that grows on it; and
 * the coral and sand patches seen through a lagoon's water. Ids are fixed in
 * catalog.js.
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
 * Reef patches (kind 'reef'), seen from above through the lagoon: only the
 * reefUnder colours, which are mixed half into its turquoise already; lit
 * from the upper left; the outer ring dithered 50 % (ordered) so a patch
 * fades into the water. The renderer draws the water's ripples over them.
 */
const RU = (n) => c(`reefUnder${n}`);

/** A patch w × h: `paint(x, y, light)` colours each pixel inside; light -1 (upper left) .. 1 (lower right). */
function patch(w, h, seed, paint) {
  const t = new k.Tex(w, h);
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x - cx) / (w / 2);
      const ny = (y - cy) / (h / 2);
      const r = nx * nx + ny * ny + (k.hash(x, y, seed) - 0.5) * 0.3;
      if (r > 1 || (r > 0.6 && (x + y) % 2 === 1)) continue;
      t.set(x, y, paint(x, y, Math.max(-1, Math.min(1, (nx + ny) / 1.4))));
    }
  }
  // Every object stands on its last row.
  if (![...Array(w).keys()].some((x) => t.get(x, h - 1) !== 0)) t.set(Math.floor(cx), h - 1, paint(Math.floor(cx), h - 1, 1));
  return t;
}

/** Rugose corals: horn cups, light rims round dark mouths, in a mottled ochre field. */
const RUGOSE = [[7, 6], [9, 7], [10, 8], [8, 7]];
function rugose(v) {
  const [w, h] = RUGOSE[v.index];
  const seed = 1700 + v.index;
  const cup = (x, y) => (x + (y >> 1)) % 3 === 1 && y % 2 === 1 && k.hash(x, y, seed + 9) < 0.7;
  return patch(w, h, seed, (x, y, light) => {
    if (cup(x, y)) return RU(0);
    if (cup(x, y + 1) || cup(x + 1, y + 1)) return RU(5);
    return light < -0.35 ? RU(5) : light > 0.45 ? RU(0) : RU(2);
  });
}

/** Stony corals: two colours each, as staghorn branches, a brain coral's meanders, a table or knobs. */
const STONY = [
  { size: [9, 7], base: 3, mark: 1, form: (x, y) => (x + y) % 4 < 2 },
  { size: [12, 10], base: 6, mark: 4, form: (x, y) => Math.floor(Math.hypot(x - 5.5, (y - 4.5) * 1.3) + Math.sin(x * 1.3) * 0.7) % 3 === 0 },
  { size: [11, 8], base: 6, mark: 3, form: (x, y) => y % 3 === 0 },
  { size: [10, 9], base: 4, mark: 1, form: (x, y) => k.hash(Math.floor((x + (Math.floor(y / 2) % 2)) / 2), Math.floor(y / 2), 1714) < 0.4 },
];
function stony(v) {
  const s = STONY[v.index];
  const [w, h] = s.size;
  return patch(w, h, 1710 + v.index, (x, y, light) => (light > 0.55 ? RU(1) : s.form(x, y) ? RU(s.mark) : RU(s.base)));
}

/** Sand the fish ground out of the reef: pale, lighter in the middle. */
const SAND = [[8, 6], [12, 9], [10, 7]];
function reefSand(v) {
  const [w, h] = SAND[v.index];
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  return patch(w, h, 1720 + v.index, (x, y) => (((x - cx) / w) ** 2 + ((y - cy) / h) ** 2 < 0.06 ? RU(8) : RU(7)));
}

const objects = {
  coconut_palm: (v) => sprite(PALM[`${v.size}${v.form}`], PALM_KEY),
  coral_rugose: (v) => rugose(v),
  coral_stony: (v) => stony(v),
  reef_sand: (v) => reefSand(v),
};

module.exports = { overlays, objects };
