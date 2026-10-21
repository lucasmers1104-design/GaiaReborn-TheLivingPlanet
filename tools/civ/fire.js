/* =============================================================================
 * SimEarth 2.0 — the flickering flame over a fire place
 * -----------------------------------------------------------------------------
 * Four frames of a small flame (role flame, era null), drawn every frame by
 * the map (src/cityfire.ts) over a fire place's foot, one row up; the static
 * fire place under it (stones, embers) is a block of its own. Pale core at
 * the bottom, yellow, orange, a red rim; the tip sways and the height
 * changes from frame to frame. Frame 0 is the still flame for "Effekte
 * reduzieren", so it is the fullest and most symmetric. Every frame is 5 × 6
 * with the same foot, so the flame never jumps sideways.
 * Style: docs/landschaft-2026-10/stil.md · contract: tools/civ/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');

const KEY = { w: 'straw3', y: 'yellow0', o: 'orange0', r: 'red1' };

const FLAME = [
  [
    '..r..',
    '..o..',
    '.oyr.',
    '.oyo.',
    'roywr',
    'rywyr',
  ],
  [
    '.....',
    '.r...',
    '.or..',
    '.oyo.',
    'royor',
    'rywyr',
  ],
  [
    '...r.',
    '..or.',
    '.oyr.',
    '.oyo.',
    'rywyr',
    'rywyr',
  ],
  [
    '.....',
    '.....',
    '..or.',
    '.oyo.',
    'royyr',
    'rwwyr',
  ],
];

/** Recipes by block id; `v` is { index }. */
const blocks = {
  flame: (v) => k.grid(FLAME[v.index], KEY),
};

module.exports = { blocks };
