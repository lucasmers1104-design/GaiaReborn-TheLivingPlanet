/* =============================================================================
 * SimEarth 2.0 — Nanotech city blocks
 * -----------------------------------------------------------------------------
 * Grown, not built: pale shells under planted green. A dome house with a
 * grass roof, organic towers with green terrace ledges and a tree crown, a
 * turquoise glass dome with a forest inside, a tall tapering megatower ringed
 * with green, park trees and a planter, on an oval park with a winding path:
 * rounded silhouettes and much green. Style: docs/landschaft-2026-10/stil.md
 * · contract: tools/civ/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');
const S = require('./shapes');

/**
 * R lit shell · T shell · S shell in shade · O dark green, outline ·
 * M sunlit green · g green · G green in shade · w turquoise glass ·
 * v dark glass, doors.
 */
const NANO = { R: 'white0', T: 'lichen1', S: 'lichen0', O: 'leaf1', M: 'meadow3', g: 'leaf3', G: 'leaf2', w: 'waterWarm2', v: 'waterWarm0' };
const TREE = { M: 'meadow3', g: 'leaf3', G: 'leaf2', O: 'leaf1', b: 'bark1', R: 'white0', T: 'lichen1', S: 'lichen0' };

/**
 * A dome house: a pale bulb with a planted crown, a round window and door.
 * It swells above its foot, so the house finds room on a river bank.
 */
const DOME_HOUSE = [
  '..MgG..',
  '.MggGO.',
  '.RRTTS.',
  'RRTTTSS',
  '.RwTvS.',
  '.RTTvS.',
];

/** Organic towers: a shell trunk swelling and narrowing, green terrace ledges, a tree crown. */
const BIOTOWER_M = [
  '..MgG..',
  '.MggGO.',
  '.gGGGO.',
  '..RTS..',
  '.RwTvS.',
  'MggGGGO',
  '.RTTTS.',
  '.RwTvS.',
  '.RTvTS.',
  '.RTvTS.',
];

const BIOTOWER_L = [
  '..MgG..',
  '.MggGO.',
  'MggGGGO',
  '.gGGGO.',
  '..RTS..',
  '.RwTvS.',
  'MggGGGO',
  '.RTTTS.',
  '.RwTvS.',
  'MggGGGO',
  '.RTTTS.',
  '.RwTvS.',
  '.RTvTS.',
  '.RTvTS.',
];

/** A turquoise glass dome on a pale rim: white ribs, a little forest inside. */
function biodome() {
  const w = 13;
  const h = 7;
  const g = S.dome(w, h, 1);
  const glass = { L: 'w', T: 'w', S: 'v' };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = g[y][x];
      if (c === '.') continue;
      if (c === 'R') g[y][x] = 'R';
      else if (c === 'O') g[y][x] = 'S';
      else if (x === 3 || x === 6 || x === 9) g[y][x] = y < 3 ? 'R' : 'T';
      else g[y][x] = glass[c];
    }
  }
  // Tree crowns inside, under the glass.
  for (const [x, y, c] of [[2, 5, 'g'], [4, 4, 'M'], [4, 5, 'g'], [5, 5, 'G'], [7, 4, 'g'], [7, 5, 'G'], [8, 5, 'G'], [10, 5, 'G'], [10, 4, 'g']]) g[y][x] = c;
  for (let x = 0; x < w; x++) g[h][x] = x === w - 1 ? 'S' : x === 0 ? 'R' : 'T';
  g[h][6] = 'v';
  return g;
}

/**
 * The megatower, grown like a giant tree: a pale trunk with turquoise
 * windows carrying broad green canopy decks, larger towards its foot,
 * crowned by a turquoise glass bulb.
 */
const MEGATOWER = [
  '...Rwv...',
  '..RwwvS..',
  '..wwwvv..',
  '...wvv...',
  '...RTS...',
  '...RTS...',
  '..MggGO..',
  '.MggGGGO.',
  '...RwS...',
  '...RTS...',
  '.MggGGGO.',
  'MggGGGGGO',
  '..RRwSS..',
  '..RTTTS..',
  'MggGGGGGO',
  '.gGGGGGO.',
  '..RRwSS..',
  '..RTvTS..',
  '.RRTvTSS.',
];

const GARDEN = [
  [
    '.MgG.',
    'MggGO',
    'gGGGO',
    '.GGO.',
    '..b..',
  ],
  [
    '.MgO.',
    'MggGO',
    'RTTTS',
  ],
];

/** Park size per size stage (village, town, metropolis). */
const PARK = [[14, 10], [16, 12], [16, 14]];

/**
 * The park under the city: an oval lawn in 2 × 2 cells with sunlit tufts,
 * a pale path looping round a point low in it, so its front arc runs
 * through the open ground before the houses. Symmetric, as the plan is
 * mirrored and the ground is not.
 */
function park(stage) {
  const [w, h] = PARK[stage];
  const t = new k.Tex(w, h);
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  t.each((x, y) => {
    const fx = (x - cx) / (w / 2);
    const fy = (y - cy) / (h / 2);
    const d = fx * fx + fy * fy;
    if (d > 1.02) return undefined;
    const ly = (y - (h - 4)) / (h / 2);
    const loop = fx * fx * 1.6 + ly * ly * 2.2;
    if (loop > 0.28 && loop < 0.5) return k.c('lichen1');
    const n = k.hash(Math.floor(Math.abs(x - cx) / 2), y >> 1, 71 + stage);
    return k.c(n < 0.2 ? 'leaf2' : n > 0.8 ? 'meadow3' : 'leaf3');
  });
  return t;
}

const blocks = {
  biotower: (v) => S.sprite(v.size === 's' ? DOME_HOUSE : v.size === 'm' ? BIOTOWER_M : BIOTOWER_L, NANO),
  biodome: () => S.sprite(biodome(), NANO),
  megatower: () => S.sprite(MEGATOWER, NANO),
  garden: (v) => S.sprite(GARDEN[v.index], TREE),
  yard_nanotech: (v) => park(v.index),
};

module.exports = { blocks };
