/* =============================================================================
 * SimEarth 2.0 — the exhaust over a factory chimney
 * -----------------------------------------------------------------------------
 * Six frames of a small plume (role smoke, era null), drawn by the map over
 * each chimney opening a recipe marks (`tex.smoke`), the frame's foot one row
 * above it. A puff leaves the stack every third frame and rises one pixel a
 * frame for twelve frames: dark soot at the mouth, growing, paling and
 * drifting right in a light wind, breaking up at the top. Two puff shapes
 * take turns, so the loop is six frames long and frame 5 runs into frame 0
 * without a jump; play the frames in order. Frame 0 is the still plume for
 * "Effekte reduzieren", the fullest one. Every frame is 7 × 12 with the same
 * one-pixel stub at the foot (anchor column), so the plume never jumps
 * sideways off the chimney.
 * Style: docs/landschaft-2026-10/stil.md · contract: tools/civ/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');

const KEY = { K: 'rock1', D: 'rock2', M: 'rock3', L: 'rock4' };

const SMOKE = [
  [
    '.....LL',
    '......M',
    '....LL.',
    '...LMMD',
    '....MDD',
    '....M..',
    '...MDK.',
    '....KK.',
    '...DK..',
    '...K...',
    '...K...',
    '...K...',
  ],
  [
    '......L',
    '....LLM',
    '...LLMD',
    '.....D.',
    '....MM.',
    '...MDK.',
    '....DK.',
    '...MD..',
    '...DK..',
    '.......',
    '...K...',
    '...K...',
  ],
  [
    '....LLM',
    '.....MD',
    '.......',
    '...LM..',
    '...LMMD',
    '....DD.',
    '...MD..',
    '...DK..',
    '.......',
    '...D...',
    '...K...',
    '...K...',
  ],
  [
    '.....LL',
    '.....M.',
    '.....LL',
    '....LMD',
    '...LMD.',
    '...MD..',
    '...DDK.',
    '....KK.',
    '...DK..',
    '...K...',
    '...K...',
    '...K...',
  ],
  [
    '.....L.',
    '....LL.',
    '....LMM',
    '.....MD',
    '...MM..',
    '...MDD.',
    '....DK.',
    '...MD..',
    '...DK..',
    '.......',
    '...K...',
    '...K...',
  ],
  [
    '.....LL',
    '....LM.',
    '.......',
    '....LM.',
    '...LMMD',
    '....DD.',
    '...MD..',
    '...DK..',
    '.......',
    '...D...',
    '...K...',
    '...K...',
  ],
];

/** Recipes by block id; `v` is { index }. */
const blocks = {
  smoke: (v) => k.grid(SMOKE[v.index], KEY),
};

module.exports = { blocks };
