/* =============================================================================
 * SimEarth 2.0 — the kapok tree, the rainforest's emergent giant
 * -----------------------------------------------------------------------------
 * Ceiba pentandra in the map's 3/4 view, lit from the upper left, towering
 * over the rainforest's own crowns at twice their size: a broad, flat
 * umbrella crown in three tiers of leaf clumps with hanging clumps under
 * them, the great limbs forking up into it, a thick smooth trunk and plank
 * buttress roots flaring into a fluted foot with dark pockets between the
 * fins. Its own colours, so it reads as something special at a glance: a
 * sunlit lime crown (`meadow`, shaded `moss`) over the canopy's dark blue
 * greens, and a silvery green-grey trunk (`lichen`) among their grey and
 * brown ones. 32 × 40, foot on the last row, centred on column 16.
 * Style: docs/ereignisse-2026-10/stil.md · contract: tools/fx/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');
const P = require('../terrain/palette');
const fx = require('./kit');

const W = 32;
const H = 40;
/** The trunk's axis (pixel centres) and its half width above the flare. */
const CX = 16.5;
const TRUNK = 3.5;
/** First trunk row under the crown, first row of the buttress flare, half width at the ground. */
const TRUNK_TOP = 17;
const FLARE = 30;
const FOOT = 11.5;

/** Leaf clumps { x, y, r } of each tier, drawn bottom up so every tier lies over the one below. */
const HANG = [
  { x: 2.9, y: 18.6, r: 2.3 }, { x: 29.9, y: 18.0, r: 2.4 },
  { x: 11.0, y: 20.2, r: 2.2 }, { x: 22.4, y: 19.8, r: 2.3 },
];
const LOWER = [
  { x: 3.8, y: 15.0, r: 3.1 }, { x: 8.0, y: 16.2, r: 3.0 }, { x: 12.2, y: 15.6, r: 2.6 },
  { x: 21.0, y: 15.8, r: 2.6 }, { x: 25.0, y: 16.4, r: 3.0 }, { x: 29.0, y: 14.8, r: 3.0 },
];
const MIDDLE = [
  { x: 4.2, y: 10.4, r: 3.6 }, { x: 8.4, y: 11.4, r: 3.7 }, { x: 12.8, y: 10.2, r: 3.7 },
  { x: 17.0, y: 11.6, r: 3.6 }, { x: 21.0, y: 10.0, r: 3.7 }, { x: 25.0, y: 11.2, r: 3.6 },
  { x: 28.6, y: 9.8, r: 3.4 },
];
const TOP = [
  { x: 7.8, y: 5.6, r: 3.4 }, { x: 11.6, y: 4.0, r: 3.8 }, { x: 15.8, y: 5.0, r: 3.6 },
  { x: 19.6, y: 3.6, r: 3.8 }, { x: 23.8, y: 5.2, r: 3.5 }, { x: 15.2, y: 1.9, r: 1.9 },
];
/** Darkest first, as billow() wants them; each tier a step deeper in the shade of the one above. */
const TOP_TONES = ['meadow0', 'meadow1', 'meadow2', 'meadow3'];
const MIDDLE_TONES = ['moss0', 'meadow0', 'meadow1', 'meadow2'];
const LOWER_TONES = ['moss0', 'meadow0', 'meadow1'];
const HANG_TONES = ['moss0', 'moss1', 'meadow0'];

/** Bark, lit edge to shaded: silvery green-grey, apart from the canopy's grey and brown trunks. */
const BARK = ['lichen1', 'lichen0', 'rock3', 'rock2', 'rock1'];

/**
 * One tier, clump by clump from the right: each clump's shaded lower right
 * lies over its eastern neighbour, so the tier reads as leaf clumps, not a slab.
 */
function crown(t, puffs, tones) {
  for (const p of [...puffs].sort((a, b) => b.x - a.x)) {
    const layer = fx.billow(new k.Tex(W, H), [p], tones);
    layer.each((x, y) => { const v = layer.get(x, y); if (v) t.set(x, y, v); });
  }
}

/** Bark tone across a trunk or limb: u from −1 (lit left edge) to 1 (shaded right edge), `shade` steps darker. */
function bark(u, shade = 0) {
  const step = u < -0.7 ? 0 : u < -0.05 ? 1 : u < 0.4 ? 2 : u < 0.75 ? 3 : 4;
  return P.c(BARK[Math.min(4, step + shade)]);
}

/** A limb from the trunk's top up into the crown, `w` px wide, lit on its upper left. */
function limb(t, x0, y0, x1, y1, w) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
  for (let s = 0; s <= n; s++) {
    const f = s / n;
    const cx = x0 + (x1 - x0) * f;
    const cy = y0 + (y1 - y0) * f;
    for (let d = 0; d < w; d++) {
      const x = Math.floor(cx - w / 2 + d + 0.5);
      // Under the crown the limbs lie in its shade.
      t.set(x, Math.floor(cy), bark((d + 0.5) / w * 2 - 1, 1));
    }
  }
}

/** Half width of trunk and foot in row y. */
function halfWidth(y) {
  if (y < FLARE) return TRUNK;
  const f = (y - FLARE + 1) / (H - FLARE);
  return TRUNK + (FOOT - TRUNK) * f ** 1.8;
}

/** The trunk, and below FLARE three plank buttresses: west lit, front, east shaded, dark pockets between. */
function trunk(t) {
  for (let y = TRUNK_TOP; y < H; y++) {
    const hw = halfWidth(y);
    const ground = y >= H - 3;
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5 - CX) / hw;
      if (Math.abs(u) > 1) continue;
      // The crown's shadow on the top of the trunk.
      const shade = y < TRUNK_TOP + 3 ? 1 : 0;
      if (y < FLARE + 1) { t.set(x, y, bark(u, shade)); continue; }
      // Grooves between the fins open wider towards the ground.
      const groove = 0.06 + 0.1 * ((y - FLARE) / (H - FLARE));
      if (Math.abs(Math.abs(u) - 0.4) < groove) { t.set(x, y, P.c(ground ? 'jungle0' : 'rock1')); continue; }
      // Each fin lit on its own left: the west fin brightest, the east fin in shade.
      const fin = u < -0.4 ? -1 : u > 0.4 ? 1 : 0;
      const local = fin === 0 ? u / 0.4 : (u - fin * 0.7) / 0.3;
      const tone = bark(local, fin === 1 ? 1 : 0);
      t.set(x, y, fin === -1 && local < -0.2 ? P.c(BARK[0]) : tone);
    }
  }
}

function kapokTree() {
  const t = new k.Tex(W, H);
  crown(t, HANG, HANG_TONES);
  crown(t, LOWER, LOWER_TONES);
  // The fork in front of the lower clumps; the middle tier covers the limbs' ends.
  limb(t, CX - 1.5, TRUNK_TOP + 1, 8.5, 12.5, 2);
  limb(t, CX + 1.5, TRUNK_TOP + 1, 24.5, 12.5, 2);
  limb(t, CX, TRUNK_TOP, CX - 0.5, 12, 3);
  crown(t, MIDDLE, MIDDLE_TONES);
  crown(t, TOP, TOP_TONES);
  trunk(t);
  return t;
}

module.exports = {
  sprites: { kapok_tree: kapokTree },
  textures: {},
};
