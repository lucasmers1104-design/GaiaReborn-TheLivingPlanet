/* =============================================================================
 * SimEarth 2.0 — volcanic eruption art
 * -----------------------------------------------------------------------------
 * The eruption column with its lava fountain, lava splashes, the drifting
 * ash cloud, the lava pool glowing in an active crater (the cone itself is
 * landscape relief) and the three ground textures of a cooling flow.
 * Light from the upper left; glow is bright palette steps inside a darker
 * edge, never a blur. Animations loop seamlessly:
 *   column   puffs rise one pixel a frame, COLUMN_FRAMES pixels apart, and
 *            every property depends on height only, so frame 8 is frame 0
 *   fountain droplets on parabolas whose phase advances by 1/8 a frame
 *   lava     palette cycling: bands of the heat field step one colour a frame
 * Style: docs/ereignisse-2026-10/stil.md · contract: tools/fx/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');
const P = require('../terrain/palette');
const fx = require('./kit');

const ASH = ['rock0', 'rock1', 'rock2', 'rock3', 'rock4'];
/** Row of the column sprite that sits on the crater's mouth. */
const MOUTH_Y = 47;
/** Top rows over which the column dissolves into the air. */
const TOP_FADE = 10;
/** Frames of the column's loop; also the spacing of its puffs. */
const COLUMN_FRAMES = 8;

/* ------------------------------------------------------------ column -- */

function column(f) {
  const t = new k.Tex(32, 48);
  const puffs = [];
  for (let n = 0; n < 10; n++) {
    const y = 40 - (n * COLUMN_FRAMES + f);
    // Near the top the billows thin out, so the column frays instead of ending at the box.
    const r = Math.min(12.5, 3 + (40 - y) * 0.26) * Math.min(1, Math.max(0, (y - 1) / 14));
    if (r <= 0.5) continue;
    const sway = Math.sin(y * 0.33) * 1.6;
    puffs.push({ x: 16 + sway, y, r });
    // Side billows drift as they rise, so the column churns instead of stacking balls.
    const side = Math.sin(y * 0.5 + 1) * r * 0.55;
    puffs.push({ x: 16 + sway + side, y: y + 2, r: r * 0.62 });
    if (y < 14) puffs.push({ x: 16 + sway - side * 0.9, y: y + 1.5, r: r * 0.58 });
  }
  // Lit from below by the fountain; embers glint in the low column.
  fx.billow(t, puffs, ASH, (x, y, nx, ny) => {
    if (y >= 36 && ny > -0.2) return y >= 41 ? 'red0' : 'laterite0';
    if (y > 28 && k.hash(x, y + f * 7, 33) < 0.04) return 'orange0';
    return null;
  });
  const fray = k.fbm(64, 8, 2, 43);
  for (let y = 0; y < TOP_FADE; y++) {
    for (let x = 0; x < t.w; x++) if (fray(x, y) < 0.3 + ((TOP_FADE - y) / TOP_FADE) * 0.35) t.set(x, y, 0);
  }
  fountain(t, f);
  return t;
}

/** The lava fountain over the mouth: a hot core and droplets on parabolas. */
function fountain(t, f) {
  const height = [13, 16, 20, 21, 17, 11, 12, 15][f];
  const set = (x, y, name) => { if (y <= MOUTH_Y) t.set(x, y, P.c(name)); };
  for (let dy = 0; dy < height; dy++) {
    const y = MOUTH_Y - dy;
    const p = dy / height;
    if (p < 0.4) { set(14, y, 'red1'); set(18, y, 'red1'); }
    if (p < 0.55) {
      set(15, y, 'yellow0');
      set(16, y, p < 0.3 ? 'white0' : 'yellow0');
      set(17, y, 'orange0');
    } else if (p < 0.85) {
      set(15, y, 'yellow0');
      set(16, y, 'orange0');
    } else {
      set(16, y, p < 0.95 ? 'orange0' : 'red1');
    }
  }
  for (let d = 0; d < 12; d++) {
    const angle = (k.hash(d, 1, 71) - 0.5) * 1.6;
    const speed = 0.7 + k.hash(d, 2, 71) * 0.5;
    const phase = (f / COLUMN_FRAMES + k.hash(d, 3, 71)) % 1;
    const s = phase * 1.8;
    const x = Math.round(16 + Math.sin(angle) * speed * s * 8);
    const y = Math.round(MOUTH_Y - (Math.cos(angle) * speed * 22 * s - 12 * s * s));
    if (x < 0 || x >= t.w || y < 0) continue;
    const name = phase < 0.35 ? 'yellow0' : phase < 0.7 ? 'orange0' : 'red1';
    set(x, y, name);
    if (phase < 0.35) set(x, y + 1, 'orange0');
  }
}

/* ------------------------------------------------------------ splash -- */

/** A blob of lava thrown from the fountain: white-hot, stretched as it flies, cooling to a dark red speck. */
function lavaSplash(f) {
  const t = new k.Tex(8, 8);
  const blobs = [
    [[3, 4, 'white0'], [4, 4, 'yellow0'], [3, 3, 'yellow0'], [4, 3, 'orange0']],
    [[3, 4, 'yellow0'], [4, 4, 'orange0'], [3, 3, 'yellow0'], [2, 5, 'orange0'], [4, 5, 'red1'], [3, 5, 'orange0']],
    [[3, 4, 'orange0'], [4, 4, 'red1'], [3, 5, 'red1'], [4, 5, 'red0']],
    [[3, 5, 'red0'], [4, 5, 'soil0']],
  ][f];
  for (const [x, y, name] of blobs) t.set(x, y, P.c(name));
  return t;
}

/* --------------------------------------------------------- ash cloud -- */

const ASH_PUFFS = [[11, 19, 8], [20, 13, 9.5], [30, 14, 9], [38, 19, 7], [26, 21, 8], [16, 23, 6], [33, 23, 6]];

function ashCloud(f) {
  const t = new k.Tex(48, 32);
  const breath = Math.min(f, 3);
  const puffs = ASH_PUFFS.map(([x, y, r], n) => ({ x, y, r: r + Math.sin(breath * Math.PI / 2 + n * 1.3) * 0.7 }));
  fx.billow(t, puffs, ['rock0', 'rock1', 'rock2', 'rock3']);
  return fx.crumble(t, f >= 4 ? [0.3, 0.55, 0.8][f - 4] : 0, 41);
}

/* ------------------------------------------------------------ crater -- */

/** Half axes of the lava pool: seen at 3/4, so wider than deep. */
const POOL_RX = 5.6;
const POOL_RY = 3.3;
/** Core swell by frame: the pool breathes in and out, so frame 4 is frame 0. */
const POOL_PULSE = [0, 1, 2, 1];

/**
 * The lava pool in an erupting volcano's crater, which the landscape draws as
 * relief: a dark seam, bands that brighten inwards, a core that swells and
 * ebbs, and sparks that rise one phase step a frame.
 */
function craterGlow(f) {
  const t = new k.Tex(16, 16);
  const p = POOL_PULSE[f];
  const wobble = k.fbm(16, 4, 2, 73);
  t.each((x, y) => {
    const dx = (x + 0.5 - 8) / POOL_RX;
    const dy = (y + 0.5 - 9) / POOL_RY;
    const d = dx * dx + dy * dy + (wobble(x, y) - 0.5) * 0.3;
    if (d > 1) return undefined;
    // The near rim lies in the wall's shadow; the far rim catches the glow.
    if (d > 0.78) return P.c(dy > 0.2 || dx > 0.5 ? 'soil0' : 'red0');
    if (d > 0.5) return P.c('red1');
    if (p > 0 && d < p * 0.035) return P.c('white0');
    if (d < 0.16 + p * 0.05) return P.c('yellow0');
    // A crust seam drifts across the pool and is gone again after four frames.
    if ((x - y + f * 2 + 16) % 8 === 0) return P.c('red1');
    return P.c('orange0');
  });
  for (let n = 0; n < 3; n++) {
    const phase = (f / POOL_PULSE.length + n / 3 + k.hash(n, 1, 77) * 0.1) % 1;
    const x = Math.round(5 + k.hash(n, 2, 77) * 6 + Math.sin(phase * 3 + n) * 0.6);
    const y = Math.round(5 - phase * 5);
    if (y < 0) continue;
    t.set(x, y, P.c(phase < 0.35 ? 'yellow0' : phase < 0.7 ? 'orange0' : 'red1'));
  }
  return t;
}

/* ---------------------------------------------------------- textures -- */

/** Molten lava: crust plates with glowing seams on bands that cycle through the glow colours. */
function lava(f, { plates, cycle, core, seam, crust }) {
  const t = new k.Tex(64, 64, true);
  const heat = k.fbm(64, 4, 3, 11);
  const plate = k.fbm(64, 8, 2, 12);
  const isPlate = (x, y) => plate(x, y) > plates;
  t.each((x, y) => {
    if (isPlate(x, y)) {
      const edge = !isPlate(x - 1, y) || !isPlate(x + 1, y) || !isPlate(x, y - 1) || !isPlate(x, y + 1);
      if (edge) return P.c(seam);
      return P.c(!isPlate(x - 2, y - 1) || !isPlate(x - 1, y - 2) ? crust[1] : crust[0]);
    }
    const h = heat(x, y);
    if (core && h > 0.74) return P.c(((Math.floor(h * 14) + f) & 1) ? core[0] : core[1]);
    return P.c(cycle[(Math.floor(h * 10) + f) % cycle.length]);
  });
  return t;
}

function lavaHot(f) {
  return lava(f, {
    plates: 0.63, cycle: ['red1', 'orange0', 'yellow0', 'orange0'], core: ['white0', 'yellow0'], seam: 'red0', crust: ['rock0', 'rock1'],
  });
}

function lavaDim(f) {
  return lava(f, {
    plates: 0.5, cycle: ['red0', 'red1', 'red0', 'laterite0'], core: null, seam: 'soil0', crust: ['rock0', 'pine0'],
  });
}

/** Cooled crust: dark rock with a network of cracks that pulse between two reds. */
function lavaCrust(f) {
  const t = new k.Tex(64, 64, true);
  const heat = k.fbm(64, 4, 3, 11);
  const fine = k.fbm(64, 8, 2, 13);
  const crack = (x, y) => Math.abs(heat(x, y) - 0.5) < 0.03 || Math.abs(fine(x, y) - 0.5) < 0.018;
  t.each((x, y) => {
    if (crack(x, y)) return P.c(f === 0 ? 'red0' : 'red1');
    if (crack(x - 1, y) || crack(x, y - 1)) return P.c('rock1');
    return P.c(k.hash(x, y, 67) < 0.07 ? 'pine0' : 'rock0');
  });
  return t;
}

module.exports = {
  sprites: { volcano_column: column, lava_splash: lavaSplash, ash_cloud: ashCloud, crater_glow: craterGlow },
  textures: { lava_hot: lavaHot, lava_dim: lavaDim, lava_crust: lavaCrust },
};
