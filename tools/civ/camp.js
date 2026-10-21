/* =============================================================================
 * SimEarth 2.0 — a wandering group's camp
 * -----------------------------------------------------------------------------
 * Light, temporary shelters of hides and branches, pitched round a small
 * fire: a hide tent on crossed poles, a lean-to of brushwood, a leaf hut and
 * a low hide dome. No walls, no thatch: unlike the Stone Age village's round
 * huts they are struck again when the group moves on. The campfire is a ring
 * of stones round embers; the map flickers the flame over the ember centre
 * (anchor column, one row above the foot, tools/civ/fire.js).
 * Style: docs/landschaft-2026-10/stil.md · contract: tools/civ/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');

/** Hides over poles: lit from the upper left, the dark slit of the entrance in front. */
const HIDE = { h: 'sand4', H: 'sand3', T: 'sand2', S: 'sand1', A: 'sand0', d: 'bark0', b: 'bark1', c: 'bark2' };
/** Brushwood: dry leaves on branches, the shade under them. */
const BRUSH = { L: 'straw3', M: 'straw2', D: 'straw1', c: 'bark2', b: 'bark1', d: 'bark0' };
/** Leafy branches bent into a dome. */
const LEAF = { l: 'meadow3', L: 'leaf3', M: 'leaf2', m: 'leaf1', c: 'bark2', b: 'bark1', d: 'bark0' };
/** Stones round embers. */
const FIRE = { W: 'rock4', R: 'rock3', r: 'rock2', q: 'rock1', Q: 'rock0', y: 'yellow0', o: 'orange0', e: 'red1', b: 'bark0' };

const SHELTERS = [
  // Hide tent: a cone of hides on poles crossing over its top, the flap open in front.
  [
    '.c.b.',
    '..c..',
    '.hTA.',
    '.HdA.',
    'hHdSA',
    'HTddA',
  ],
  // Lean-to: brushwood laid on a ridge pole, open towards the fire.
  [
    'c.....',
    'bLc...',
    'bdLMc.',
    'bddLMc',
    'bdddDc',
  ],
  // Leaf hut: leafy branches bent into a low dome, a dark doorway.
  [
    '.c.c..',
    '.lLMc.',
    'lLcLMm',
    'LLddMm',
    'mLddmm',
  ],
  // Hide dome: hides lashed over a low frame of bent poles.
  [
    '..hHT..',
    '.hHbTS.',
    'hHTbTSA',
    'HTddTSA',
    'ATddSSA',
  ],
];

const CAMPFIRE = [
  '.rWRWr.',
  'Weoyoeq',
  '.qRrRq.',
];

const blocks = {
  shelter: (v) => k.grid(SHELTERS[v.index], [HIDE, BRUSH, LEAF, HIDE][v.index]),
  campfire: () => k.grid(CAMPFIRE, FIRE),
};

module.exports = { blocks };
