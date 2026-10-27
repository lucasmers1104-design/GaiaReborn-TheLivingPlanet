/* =============================================================================
 * Gaia Reborn — the living-interface palette
 * -----------------------------------------------------------------------------
 * The terrain palette (tools/terrain/palette.js) first, unchanged and in its
 * order, so every terrain index means the same colour here; then the ramps
 * only the interface needs: parchment and gold for the frames, warm wood,
 * Gaia's skin and leafy hair, the bright vine greens of the concept art, the
 * wilting browns, flower petals and the magic glows. The UI atlas carries
 * this palette in its own PNG, so the terrain, fx and civ atlases never go
 * stale over a UI colour.
 *
 * Names are `<ramp><step>`, step 0 = darkest, as in the terrain palette.
 * Light comes from the upper left; dark ends lean warm-brown or blue-violet,
 * light ends lean yellow.
 * ========================================================================== */
'use strict';

const T = require('../terrain/palette');

/** Ramp name -> colours, dark to light. Appended after the terrain ramps. */
const UI_RAMPS = {
  // --- frames: parchment panels, gold rims, warm wood, ink ---
  parch:  ['#b4885a', '#d3ab76', '#e9cb98', '#f6e2bb', '#fdf1d8', '#fffaee'],
  gold:   ['#5e3410', '#8f531a', '#c27f2a', '#e3a63f', '#f6cc6a', '#fde9a6'],
  wood:   ['#1f120a', '#36210f', '#523319', '#704725', '#8f5e33', '#b07c47'],
  ink:    ['#140d08', '#2a1a0e'],
  // --- Gaia: skin, leafy hair, leaf dress ---
  skin:   ['#6e3e2c', '#a3644a', '#cf9168', '#ebb88c', '#f9d9b5', '#fff0dc'],
  hair:   ['#0e2a16', '#1a4520', '#286426', '#3e862b', '#62a834', '#94cc48', '#c9eb72'],
  dress:  ['#16301a', '#234d24', '#336d2c', '#4a8d34', '#6faf45'],
  // --- the vines: bright leaves, stems, wilting and dry ---
  vine:   ['#102e10', '#1d4c16', '#2f6e1c', '#4a9423', '#72b92e', '#a6db4a', '#d9f283'],
  stem:   ['#261c0c', '#433214', '#5f4a1d', '#7c6428', '#9a8238'],
  faded:  ['#3f4a30', '#5d6b43', '#808e5c', '#a7b17e', '#cdd2a6'],
  wilt:   ['#3c2810', '#644219', '#8c6127', '#b4853c', '#d6ad62'],
  // --- flowers ---
  petal:  ['#8c3a5a', '#c4628a', '#ec94b4', '#f9c6d8', '#fff0f5'],
  petalY: ['#9a6a12', '#d49a22', '#f4c93e', '#ffe789'],
  petalB: ['#3c3f8f', '#5f6cc4', '#8fa0e6', '#c5d0fa'],
  // --- magic: teal, green and violet light ---
  glowT:  ['#0d4652', '#167f8c', '#2fbcc4', '#6fe6e0', '#b9fbf2', '#efffff'],
  glowG:  ['#1e6a33', '#3fae4c', '#7ee372', '#c2fbb2'],
  glowV:  ['#34205c', '#5c3b9a', '#8f67d8', '#bf9dfa', '#e8dcff'],
  // --- the status bar's clouds, drawn in code (src/cloudshape.ts): normal, lit, the lit one's halo ---
  cloud:    ['#4b5d7c', '#6f80a0', '#8f9fb7', '#adbacc', '#c8d2df', '#dde4ed', '#eef2f7', '#ffffff'],
  cloudLit: ['#2f6db0', '#4f89cc', '#9fb9d9', '#bcd0e8', '#d5e3f3', '#e8f0fa', '#f5f9fd', '#ffffff'],
  halo:     ['#d8ecff'],
};

/** Every ramp, terrain first, in palette order. */
const RAMPS = { ...T.RAMPS, ...UI_RAMPS };

/** [[r, g, b, a], …]; index 0 is transparent, the terrain indices unchanged. */
const PALETTE = T.PALETTE.map((rgba) => rgba.slice());
const INDEX = { ...T.INDEX };
const RAMP_INDICES = { ...T.RAMP_INDICES };
const RAMP_OF = T.RAMP_OF.slice();
const STEP_OF = T.STEP_OF.slice();

function hexToRgba(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

for (const [name, colors] of Object.entries(UI_RAMPS)) {
  if (RAMP_INDICES[name]) throw new Error(`uiart palette: ramp '${name}' already in the terrain palette`);
  RAMP_INDICES[name] = [];
  colors.forEach((hex, step) => {
    const i = PALETTE.length;
    PALETTE.push(hexToRgba(hex));
    INDEX[`${name}${step}`] = i;
    RAMP_INDICES[name].push(i);
    RAMP_OF.push(name);
    STEP_OF.push(step);
  });
}
if (PALETTE.length > 256) throw new Error(`uiart palette: ${PALETTE.length} colours, an indexed PNG holds 256`);

/** Palette index of a named colour; throws on a typo, so recipes fail loudly. */
function c(name) {
  const i = INDEX[name];
  if (i === undefined) throw new Error(`uiart palette: no colour '${name}'`);
  return i;
}

/** Indices of a ramp, dark to light. */
function ramp(name) {
  const r = RAMP_INDICES[name];
  if (!r) throw new Error(`uiart palette: no ramp '${name}'`);
  return r;
}

/** Move an index `by` steps along its own ramp, clamped at the ends. */
function shift(index, by) {
  if (index === 0) return 0;
  const r = RAMP_INDICES[RAMP_OF[index]];
  const s = Math.max(0, Math.min(r.length - 1, STEP_OF[index] + by));
  return r[s];
}

/** '#rrggbb' of a palette index. */
function hex(index) {
  const [r, g, b] = PALETTE[index];
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

module.exports = { UI_RAMPS, RAMPS, PALETTE, INDEX, RAMP_INDICES, RAMP_OF, STEP_OF, c, ramp, shift, hex };
