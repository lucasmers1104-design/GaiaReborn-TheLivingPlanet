/* =============================================================================
 * SimEarth 2.0 — the terrain palette
 * -----------------------------------------------------------------------------
 * The single colour source for every landscape texture, plant object, mask
 * and river in the atlas. Colours come in ramps, dark to light, and the
 * runtime shades by moving an index along its ramp (relief, object shadows,
 * wet shore rims) — so a texture never needs a colour that is not here, and
 * nothing is ever tinted by alpha.
 *
 * Hue shifting: dark ends lean blue/violet, light ends lean yellow, the way
 * light from the upper left falls on everything on the map.
 *
 * Index 0 is transparent. Pure white is reserved for the edge masks.
 * Names are `<ramp><step>`, step 0 = darkest: 'leaf2', 'sand4', 'red0'.
 * ========================================================================== */
'use strict';

/** Ramp name -> colours, dark to light. Order here is palette order. */
const RAMPS = {
  // --- ground ---
  rock:     ['#3d3b45', '#5d5a62', '#807b7c', '#a59f97', '#c9c2b3'],
  sand:     ['#94704a', '#b89262', '#d4b17c', '#e6c996', '#f3dfb4'],
  soil:     ['#3f2c27', '#5e4334', '#7d5d43', '#9c7b56'],
  laterite: ['#6e3628', '#92502f', '#b46c3d', '#cf8a55'],
  mud:      ['#2e3125', '#464a33', '#626543', '#7e7f55'],
  straw:    ['#7c6c36', '#a28f45', '#c6b25a', '#e2d17e'],
  // --- green ---
  meadow:   ['#3b6a2f', '#568a35', '#78a83e', '#a2c759'],
  moss:     ['#45512a', '#63712f', '#869238', '#adb24c'],
  leaf:     ['#1f4330', '#2c5f3a', '#3d7d44', '#579c4e'],
  pine:     ['#142a2c', '#1d4040', '#29584f', '#3a735e', '#4f8f6a'],
  jungle:   ['#0f3a2a', '#175a33', '#217a3a', '#3a9a42'],
  lichen:   ['#a9b08f', '#cdd0b0'],
  // --- cold and wet ---
  ice:      ['#5e7fa3', '#86a7c6', '#b0cbe0', '#d6e6f0', '#f3f8fb'],
  water:    ['#0a2048', '#10346a', '#184e88', '#226ca4', '#3088b4', '#3e9cbc', '#58b2c2', '#80c8cc'],
  // --- wood and accents ---
  bark:     ['#3a2620', '#5e3f2c', '#7d5a3c'],
  blossom:  ['#e98fb0', '#f7c3d4'],
  yellow:   ['#f0c64a'],
  white:    ['#f2efe2'],
  red:      ['#8e2f33', '#c4453f'],
  orange:   ['#df8a3a'],
  violet:   ['#9a6aa8', '#c49ad0'],
  // --- reserved ---
  mask:     ['#ffffff'],
  // --- appended after the mask, so every index above keeps its place ---
  // Lagoon turquoise over reefs (src/reefs.ts), dark to light.
  waterWarm: ['#1f9fb0', '#2fb8bf', '#49cfc8', '#7fe0d6'],
  // Corals and their sand seen through a lagoon, mixed into its turquoise
  // (waterWarm1): corals 55 % in lightness, their chroma down to 55 % and
  // their hue 12 % towards it (OKLCH) — a stronger hue pull turns ochre into
  // olive, violet into blue, yellow into lime; sand half into the lightest
  // turquoise. Rugose brown, stony violet, rugose ochre, stony pink, stony
  // orange, rugose light ochre, stony yellow, sand, sand light.
  reefUnder: ['#7a6c5d', '#9d7bbd', '#a18c67', '#c58cb1', '#c89963', '#baaa76', '#bebd7a', '#9fd9c2', '#bfe8d2'],
  // The fade over the first open-ocean tile beside coastal sea (src/landwater.ts):
  // water2 towards water4 in sixths of 65 %, so the shelf edge keeps a step.
  shelf: ['#1b548d', '#1d5b92', '#206196', '#22679b', '#256da0', '#2874a5'],
};

function hexToRgba(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

/** [[r, g, b, a], …]; index 0 is transparent. */
const PALETTE = [[0, 0, 0, 0]];
/** 'leaf2' -> palette index. */
const INDEX = {};
/** Ramp name -> palette indices, dark to light. */
const RAMP_INDICES = {};
/** Per palette index: its ramp name (null for 0) and step along the ramp. */
const RAMP_OF = [null];
const STEP_OF = [0];

for (const [name, colors] of Object.entries(RAMPS)) {
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

/** Palette index of a named colour; throws on a typo, so recipes fail loudly. */
function c(name) {
  const i = INDEX[name];
  if (i === undefined) throw new Error(`palette: no colour '${name}'`);
  return i;
}

/** Indices of a ramp, dark to light. */
function ramp(name) {
  const r = RAMP_INDICES[name];
  if (!r) throw new Error(`palette: no ramp '${name}'`);
  return r;
}

/** Move an index `by` steps along its own ramp, clamped at the ends. */
function shift(index, by) {
  if (index === 0) return 0;
  const r = RAMP_INDICES[RAMP_OF[index]];
  const s = Math.max(0, Math.min(r.length - 1, STEP_OF[index] + by));
  return r[s];
}

module.exports = { RAMPS, PALETTE, INDEX, RAMP_INDICES, RAMP_OF, STEP_OF, c, ramp, shift };
