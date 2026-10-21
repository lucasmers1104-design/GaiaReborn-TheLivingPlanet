/* =============================================================================
 * SimEarth 2.0 — render every city block through its era recipe
 * -----------------------------------------------------------------------------
 * Returns the sprites in memory plus a PROBLEM list for anything that breaks
 * the style rules: a colour outside the palette (or the reserved mask white),
 * a translucent colour, too many colours, a block larger than its box, an
 * empty bottom row (blocks stand on their last row).
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const C = require('./catalog');
const P = require('../terrain/palette');
const { banner } = require('./banner');

/** Variants of a block: { size } for dwellings, { index } otherwise. */
function variantsOf(block) {
  if (block.sizes) return block.sizes.map((size, index) => ({ size, index }));
  return Array.from({ length: block.variants }, (_, index) => ({ index }));
}

/** The era recipe files drawn so far; an era without a file has no blocks yet. */
function loadEras() {
  const out = {};
  for (const era of C.ERAS) {
    if (fs.existsSync(path.join(__dirname, `${era}.js`))) out[era] = require(`./${era}`);
  }
  return out;
}

/** Recipes of the blocks of no era: camp.js, fire.js, smoke.js (when drawn) and the pennant. */
function loadShared() {
  const out = { banner: (v) => banner(v.index) };
  for (const file of ['camp', 'fire', 'smoke']) {
    if (fs.existsSync(path.join(__dirname, `${file}.js`))) Object.assign(out, require(`./${file}`).blocks);
  }
  return out;
}

/** Problems of one sprite against the style rules. */
function spriteProblems(id, t, box) {
  const out = [];
  const seen = new Set();
  const mask = P.c('mask0');
  for (const v of t.px) {
    if (v === 0) continue;
    if (v >= P.PALETTE.length) out.push(`${id}: index ${v} is not in the palette`);
    else if (v === mask) out.push(`${id}: uses the reserved mask white`);
    else if (P.PALETTE[v][3] !== 255) out.push(`${id}: translucent colour ${v}`);
    seen.add(v);
  }
  if (seen.size > C.MAX_COLORS) out.push(`${id}: ${seen.size} colours, at most ${C.MAX_COLORS}`);
  if (t.w > box[0] || t.h > box[1]) out.push(`${id}: ${t.w}×${t.h} exceeds its box ${box[0]}×${box[1]}`);
  let foot = false;
  for (let x = 0; x < t.w; x++) if (t.get(x, t.h - 1) !== 0) foot = true;
  if (!foot) out.push(`${id}: the bottom row is empty — blocks stand on their last row`);
  return out;
}

/** `only`: restrict to one era id (the banner is always built). */
function build(only = null) {
  const eras = loadEras();
  const shared = loadShared();
  const problems = [];
  const blocks = {};
  for (const b of C.BLOCKS) {
    if (b.era && only && b.era !== only) continue;
    const recipe = b.era ? eras[b.era]?.blocks?.[b.id] : shared[b.id];
    if (!recipe) {
      if (b.era && eras[b.era]) problems.push(`${b.id}: no recipe in ${b.era}.js`);
      continue;
    }
    blocks[b.id] = variantsOf(b).map((v) => {
      const tex = recipe(v);
      const box = v.size ? C.SIZE_BOX[v.size] : [C.BOX.w, C.BOX.h];
      problems.push(...spriteProblems(`${b.id}[${v.size || v.index}]`, tex, box));
      return { tex, ...v };
    });
  }
  return { blocks, problems };
}

module.exports = { build, variantsOf };
