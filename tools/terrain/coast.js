/* =============================================================================
 * SimEarth 2.0 — terrain recipes, family "coast"
 * -----------------------------------------------------------------------------
 * The beach (calm pale sand with faint wind ripples and a few shells) and the
 * coconut palm that grows on it. Ids are fixed in catalog.js.
 *
 *   materials[id](t, d)   paint the seamless texture `t` (Tex, wraps) for density d
 *   objects[id](v)        return a sprite; v = { index, size, form }
 * ========================================================================== */
'use strict';

const k = require('./kit');

const c = k.c;

/* ------------------------------------------------------------- materials -- */

/**
 * Beach: flat sand3 with soft, brighter dry patches in sand4, short sand2
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

const materials = {
  beach: (t) => beach(t),
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

const objects = {
  coconut_palm: (v) => sprite(PALM[`${v.size}${v.form}`], PALM_KEY),
};

module.exports = { materials, objects };
