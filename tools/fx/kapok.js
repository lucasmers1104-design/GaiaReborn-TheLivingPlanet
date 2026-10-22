/* =============================================================================
 * SimEarth 2.0 — the kapok tree, the rainforest's emergent giant
 * -----------------------------------------------------------------------------
 * Ceiba pentandra in the map's 3/4 view, lit from the upper left, standing
 * over the rainforest's own crowns: a broad, flat umbrella crown in three
 * tiers of leaf clumps — the top in full sun (`meadow` tops), the wide middle
 * tier and the hanging clumps under it each a step darker — the great limbs
 * forking under it, a thick smooth pale grey trunk and plank buttress roots
 * flaring into a fluted foot with dark pockets between the fins. A red
 * bromeliad sits in the fork. 20 px wide (columns 2–21) and 24 high.
 * Style: docs/ereignisse-2026-10/stil.md · contract: tools/fx/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');
const P = require('../terrain/palette');
const fx = require('./kit');

const W = 24;
const H = 24;

/**
 * Leaf clumps { x, y, r } of three tiers, drawn bottom up: the shaded
 * hanging clumps under the crown, the wide middle tier, the sunlit top. Half
 * the sprite is crown, so it reads as the giant among the 16-px canopy trees.
 */
const BOTTOM = [
  { x: 4.4, y: 9.6, r: 2.3 }, { x: 19.6, y: 9.4, r: 2.3 },
  { x: 7.5, y: 10.2, r: 1.8 }, { x: 16.5, y: 10.0, r: 1.8 },
];
const MIDDLE = [
  { x: 4.6, y: 6.6, r: 2.5 }, { x: 7.7, y: 6.9, r: 2.5 }, { x: 10.8, y: 6.5, r: 2.5 },
  { x: 13.9, y: 6.9, r: 2.5 }, { x: 17.0, y: 6.5, r: 2.5 }, { x: 19.6, y: 6.8, r: 2.5 },
];
const TOP = [
  { x: 6.6, y: 3.2, r: 2.7 }, { x: 9.6, y: 2.6, r: 2.7 }, { x: 12.6, y: 3.0, r: 2.7 },
  { x: 15.6, y: 2.6, r: 2.7 }, { x: 18.0, y: 3.4, r: 2.5 },
];
/**
 * Darkest first, as billow() wants them; each tier a step darker than the
 * one above. The crown is `meadow`, yellower and lighter than the canopy's
 * `jungle` and `leaf`: it stands in the sun above them.
 */
const BOTTOM_TONES = ['jungle0', 'leaf0', 'meadow0', 'meadow1'];
const MIDDLE_TONES = ['jungle0', 'leaf0', 'meadow0', 'meadow1', 'meadow2'];
const TOP_TONES = ['leaf0', 'meadow0', 'meadow1', 'meadow2', 'meadow3'];

const SUN = [[5, 1], [6, 1], [8, 0], [9, 0]];

/** Limbs, trunk and buttress foot over the crown's underside; '.' keeps what is there. */
const KEY = { w: 'rock4', t: 'rock3', m: 'rock2', d: 'rock1', J: 'jungle0', r: 'red1', M: 'meadow1' };
const WOOD = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........tm....md........',
  '.........tmMrmd.........',
  '.........ttwmmd.........',
  '.........ttwmmd.........',
  '.........ttwmmd.........',
  '.........ttwmmd.........',
  '.........ttwmmd.........',
  '.........ttwmmd.........',
  '.........ttwmmd.........',
  '........wttwmdmd........',
  '.......wtdtwmdmmd.......',
  '......wttdtwmddmmd......',
  '.....wtttdtwmdJmmmd.....',
  '....wtttdttwmdJmmmmd....',
  '...JwttJJttwmdJJmmmdJ...',
];

function crown(t, puffs, tones) {
  const layer = fx.billow(new k.Tex(W, H), puffs, tones);
  layer.each((x, y) => { const v = layer.get(x, y); if (v) t.set(x, y, v); });
}

function kapokTree() {
  WOOD.forEach((r, i) => { if (r.length !== W) throw new Error(`kapok row ${i}: width ${r.length}, expected ${W}`); });
  const t = new k.Tex(W, H);
  crown(t, BOTTOM, BOTTOM_TONES);
  crown(t, MIDDLE, MIDDLE_TONES);
  crown(t, TOP, TOP_TONES);
  // The sun on the upper left of the crown.
  for (const [x, y] of SUN) t.set(x, y, P.c('meadow3'));
  WOOD.forEach((row, y) => {
    for (let x = 0; x < W; x++) if (row[x] !== '.') t.set(x, y, P.c(KEY[row[x]]));
  });
  return t;
}

module.exports = {
  sprites: { kapok_tree: kapokTree },
  textures: {},
};
