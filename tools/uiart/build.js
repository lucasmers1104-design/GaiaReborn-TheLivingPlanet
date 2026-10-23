/* =============================================================================
 * Gaia Reborn — render every living-interface sprite through its recipe
 * -----------------------------------------------------------------------------
 * Returns the frames in memory plus a PROBLEM list: a broken catalog entry,
 * a family file that does not load, a recipe missing or not in the catalog,
 * and frames that break the style rules (an index outside the UI palette,
 * the reserved mask white, a translucent colour, an empty frame, more than
 * MAX_COLORS colours, a box other than the catalog's, a foot sprite whose
 * last row is empty). A frame that cannot go into the atlas at all (wrong
 * box, bad index, the recipe threw) is replaced by a placeholder frame, so
 * one artist's broken recipe never breaks another agent's bundle.
 * With `placeholders`, sprites of families without a file (or left out by
 * `families`) get placeholder frames too: a petal-pink box with a diagonal.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const C = require('./catalog');
const P = require('./palette');
const K = require('./kit');

const ANCHORS = ['foot', 'center', 'topleft'];

/** The anchor pixel inside the box: foot (floor(w/2), h-1), center (floor(w/2), floor(h/2)), topleft (0, 0). */
function anchorOf(s) {
  if (s.anchor === 'foot') return [Math.floor(s.w / 2), s.h - 1];
  if (s.anchor === 'center') return [Math.floor(s.w / 2), Math.floor(s.h / 2)];
  return [0, 0];
}

const whole = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

/** A box and frame count the atlas can hold: whole pixels 1..128, at least one frame. */
const boxOk = (s) => whole(s.w, 1, 128) && whole(s.h, 1, 128) && whole(s.frames, 1, 256);

function catalogProblems() {
  const out = [];
  const seen = new Set();
  for (const s of C.SPRITES) {
    if (seen.has(s.id)) out.push(`${s.id}: listed twice in the catalog`);
    seen.add(s.id);
    if (!C.FAMILIES.includes(s.family)) out.push(`${s.id}: family '${s.family}' is not in FAMILIES`);
    if (!boxOk(s)) out.push(`${s.id}: box ${s.w}×${s.h} with ${s.frames} frames; boxes are whole pixels 1..128`);
    if (!(typeof s.fps === 'number' && s.fps >= 0)) out.push(`${s.id}: fps ${s.fps}`);
    if (s.loop !== undefined && !whole(s.loop, 1, s.frames)) out.push(`${s.id}: loop ${s.loop} is outside 1..${s.frames}`);
    if (!ANCHORS.includes(s.anchor)) out.push(`${s.id}: anchor '${s.anchor}', not ${ANCHORS.join(' | ')}`);
    for (const [k, p] of Object.entries(s.points ?? {})) {
      if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isInteger)) out.push(`${s.id}: point '${k}' is not [x, y] in whole pixels`);
    }
  }
  return out;
}

/** The family recipe files that exist (all, or only `only`); a file that fails to load counts as missing. */
function loadFamilies(only, problems) {
  const out = {};
  for (const fam of C.FAMILIES) {
    if (only && !only.includes(fam)) continue;
    const file = path.join(__dirname, `${fam}.js`);
    if (!fs.existsSync(file)) continue;
    try {
      out[fam] = require(file);
    } catch (e) {
      problems.push(`${fam}.js does not load: ${e.message}`);
      continue;
    }
    for (const id of Object.keys(out[fam].sprites ?? {})) {
      if (!C.SPRITES.some((s) => s.id === id && s.family === fam)) problems.push(`${fam}.js: recipe '${id}' is not a ${fam} sprite in the catalog`);
    }
  }
  return out;
}

/** Stand-in frame k: a 1-px petal2 outline with a diagonal, the inside dotted in a shade of its own per frame. */
function placeholderFrame(s, k) {
  const t = new K.Tex(s.w, s.h);
  const dot = P.ramp('petal')[[0, 1, 3, 4][k % 4]];
  t.each((x, y) => (K.BAYER4[y & 3][x & 3] < 4 ? dot : undefined));
  for (let x = 0; x < s.w; x++) { K.put(t, x, 0, 'petal2'); K.put(t, x, s.h - 1, 'petal2'); }
  for (let y = 0; y < s.h; y++) { K.put(t, 0, y, 'petal2'); K.put(t, s.w - 1, y, 'petal2'); }
  return K.line(t, 0, 0, s.w - 1, s.h - 1, 'petal2');
}

/** Why a recipe's result cannot go into the atlas, or null. */
function unusable(t, s) {
  if (!t || !(t.px instanceof Uint8Array) || t.px.length !== t.w * t.h) return 'the recipe returned no bitmap (Tex)';
  if (t.w !== s.w || t.h !== s.h) return `${t.w}×${t.h}, the catalog says ${s.w}×${s.h}`;
  for (const v of t.px) if (v >= P.PALETTE.length) return `index ${v} is not in the UI palette`;
  return null;
}

function frameProblems(id, t, s) {
  const out = [];
  const seen = new Set();
  const mask = P.c('mask0');
  for (const v of t.px) if (v !== 0) seen.add(v);
  if (seen.has(mask)) out.push(`${id}: uses the reserved mask white (mask0)`);
  for (const v of seen) if (P.PALETTE[v][3] !== 255) out.push(`${id}: translucent colour ${v}`);
  if (seen.size === 0) out.push(`${id}: empty frame`);
  if (seen.size > C.MAX_COLORS) out.push(`${id}: ${seen.size} colours, at most ${C.MAX_COLORS}`);
  if (s.anchor === 'foot' && seen.size > 0) {
    let foot = false;
    for (let x = 0; x < t.w; x++) if (t.px[(t.h - 1) * t.w + x] !== 0) foot = true;
    if (!foot) out.push(`${id}: the last row is empty — foot sprites stand on their last row`);
  }
  return out;
}

/**
 * `families`: only these family files (the others count as not drawn yet);
 * `placeholders`: stand-in frames for every sprite without art.
 * Returns { sprites: { id: [Tex] }, placeholder: { id: boolean }, problems }.
 */
function build({ families = null, placeholders = false } = {}) {
  const problems = catalogProblems();
  const fams = loadFamilies(families, problems);
  const sprites = {};
  const placeholder = {};
  for (const s of C.SPRITES) {
    if (!boxOk(s)) continue;
    const fam = fams[s.family];
    const recipe = fam?.sprites?.[s.id];
    if (typeof recipe !== 'function') {
      if (fam) problems.push(`${s.id}: no recipe in ${s.family}.js`);
      if (placeholders) {
        sprites[s.id] = Array.from({ length: s.frames }, (_, f) => placeholderFrame(s, f));
        placeholder[s.id] = true;
      }
      continue;
    }
    let stand = false;
    sprites[s.id] = Array.from({ length: s.frames }, (_, f) => {
      const id = `${s.id}[${f}]`;
      let t;
      try {
        t = recipe(f, s);
      } catch (e) {
        problems.push(`${id}: the recipe threw ${e.stack ? e.stack.split('\n').slice(0, 2).join(' ') : e}`);
        stand = true;
        return placeholderFrame(s, f);
      }
      const bad = unusable(t, s);
      if (bad) {
        problems.push(`${id}: ${bad}`);
        stand = true;
        return placeholderFrame(s, f);
      }
      problems.push(...frameProblems(id, t, s));
      return t;
    });
    placeholder[s.id] = stand;
  }
  return { sprites, placeholder, problems };
}

module.exports = { build, anchorOf, placeholderFrame };
