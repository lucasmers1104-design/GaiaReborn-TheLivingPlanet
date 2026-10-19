/* =============================================================================
 * SimEarth 2.0 — tidal wave art
 * -----------------------------------------------------------------------------
 * Fallen trees and driftwood, and the ground textures: flood water by depth,
 * its muddy backwash and wet ground. The breaking wave lives in
 * water-waves.js; the hurricane, its weather and its tornadoes in storm.js,
 * bolt.js and twister.js. Light from the upper left.
 * Style: docs/ereignisse-2026-10/stil.md · contract: tools/fx/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');
const P = require('../terrain/palette');
const waves = require('./water-waves');

/* -------------------------------------------------------- wind and wood -- */

/** A tree blown over: root plate, trunk and crown lying on the ground; `left` puts the crown on the left. */
function fallenTree(v) {
  const t = new k.Tex(16, 8);
  const conifer = v === 2;
  const left = v === 1;
  const crownRamp = conifer ? 'pine' : 'leaf';
  const crown = new k.Tex(16, 8);
  // Lying down, a crown is long and flat; a conifer's tapers to its tip.
  const base = left ? 8 : 7;
  const tip = left ? 0 : 15;
  const cx = (base + tip) / 2;
  const rx = Math.abs(tip - base) / 2 + 0.5;
  const cy = 4.6;
  const ry = 2.6;
  const inside = (x, y) => {
    const along = (x + 0.5 - base) / (tip + (left ? 0 : 1) - base);
    if (along < 0 || along > 1) return false;
    const half = conifer ? 0.6 + (1 - along) * 2.4 : ry * Math.sqrt(Math.max(0, 1 - ((x + 0.5 - cx) / rx) ** 2)) + 0.3 * Math.sin(x * 2.3 + v);
    return y < 8 && Math.abs(y + 0.5 - cy) <= half;
  };
  k.shade(crown, inside, crownRamp, cx + rx * 0.15, cy + ry * 0.45, rx, ry, 30 + v);
  // Trunk two pixels thick, lit along its top, from the root plate to the crown.
  const x0 = left ? 6 : 2;
  const x1 = left ? 13 : 10;
  for (let x = x0; x <= x1; x++) {
    t.set(x, 5, P.c(x % 3 === 0 ? 'bark1' : 'bark2'));
    t.set(x, 6, P.c('bark0'));
  }
  // The root plate stands up at the trunk's foot: earth on a disc, a lit left edge.
  const rx0 = left ? 14 : 0;
  for (let y = 2; y <= 7; y++) {
    for (let d = 0; d < 2; d++) {
      const x = rx0 + d;
      const edge = y === 2 || y === 7;
      if (edge && d === (left ? 1 : 0)) continue;
      t.set(x, y, P.c(d === 0 ? 'soil2' : y > 4 ? 'soil0' : 'soil1'));
    }
  }
  t.set(left ? 13 : 2, 3, P.c('bark0'));
  t.set(left ? 13 : 2, 7, P.c('bark0'));
  t.stamp(crown, 0, 0);
  // A sliver of shadow under the trunk keeps it on the ground.
  for (let x = x0 + 1; x <= x1 - 1; x++) if (t.get(x, 7) === 0) t.set(x, 7, P.c('soil0'));
  return t;
}

/** Driftwood: weathered sticks lying in the mud. */
function driftwood(v) {
  const t = new k.Tex(8, 8);
  const lit = P.c('bark2');
  const mid = P.c('bark1');
  const dark = P.c('bark0');
  const stick = (pts) => {
    for (const [x, y] of pts) {
      t.set(x, y, lit);
      t.set(x, y + 1, dark);
    }
  };
  if (v === 0) {
    stick([[1, 6], [2, 6], [3, 6], [4, 5], [5, 5], [6, 4]]);
    t.set(0, 7, dark);
  } else if (v === 1) {
    stick([[0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6]]);
    t.set(4, 5, mid);
    t.set(5, 4, lit);
    t.set(5, 5, dark);
  } else {
    stick([[1, 4], [2, 5], [3, 5], [4, 6]]);
    stick([[4, 4], [5, 4], [6, 5]]);
    t.set(7, 6, dark);
  }
  return t;
}

/* ---------------------------------------------------------- textures -- */

/**
 * Flood water by depth, deep near the coast to silty in the shallows, and
 * the muddy backwash: patches of depth, short ripples lit on their crest
 * with a darker trough under them, and a few foam streaks; ripples and foam
 * drift with the frames. Placed per cell by hash, so nothing repeats in rows.
 * The backwash has rivulets of water running through its mud.
 */
const FLOOD_LOOKS = {
  deep: { bands: [[0.45, 'water3'], [0.65, 'water4'], [1, 'water5']], crest: 'water6', trough: 'water2', foam: ['ice3', 'white0'] },
  water: { bands: [[0.45, 'water4'], [0.6, 'water5'], [1, 'water6']], crest: 'water7', trough: 'water3', foam: ['white0'] },
  shallow: { bands: [[0.62, 'water5'], [0.7, 'water6'], [1, 'sand0']], crest: 'water7', trough: 'water4', foam: ['ice3'] },
  mud: { bands: [[0.4, 'sand1'], [0.65, 'sand0'], [1, 'soil3']], crest: 'sand2', trough: 'soil2', foam: ['ice3', 'white0'], rivulets: true },
};

function floodWater(f, look = FLOOD_LOOKS.water) {
  const t = new k.Tex(64, 64, true);
  const depth = k.fbm(64, 4, 3, 81);
  const runs = k.fbm(64, 4, 3, 82);
  t.each((x, y) => {
    if (look.rivulets && Math.abs(runs(x, y) - 0.5) < 0.04) return P.c(depth(x, y) < 0.5 ? 'water5' : 'water6');
    const d = depth(x, y);
    return P.c(look.bands.find(([top]) => d < top)[1]);
  });
  for (let by = 0; by < 64; by += 4) {
    for (let bx = 0; bx < 64; bx += 8) {
      if (k.hash(bx, by, 84) > 0.45) continue;
      const x = bx + Math.floor(k.hash(bx, by, 85) * 6) + f * 2;
      const y = by + Math.floor(k.hash(bx, by, 86) * 3);
      const len = 2 + Math.floor(k.hash(bx, by, 87) * 2);
      for (let d = 0; d < len; d++) t.set(x + d, y, P.c(look.crest));
      t.set(x + 1, y + 1, P.c(look.trough));
    }
  }
  for (let by = 0; by < 64; by += 16) {
    for (let bx = 0; bx < 64; bx += 32) {
      if (k.hash(bx, by, 88) > 0.7) continue;
      const x = bx + Math.floor(k.hash(bx, by, 89) * 22) + f * 3;
      const y = by + Math.floor(k.hash(bx, by, 90) * 13);
      const len = 5 + Math.floor(k.hash(bx, by, 91) * 5);
      // With two foam colours, every other streak takes the second.
      const foam = look.foam[k.hash(bx, by, 92) < 0.5 ? 0 : look.foam.length - 1];
      for (let d = 0; d < len; d++) {
        const end = d === 0 || d === len - 1;
        t.set(x + d, y + (d > len * 0.6 ? 1 : 0), P.c(end ? look.crest : foam));
      }
    }
  }
  return t;
}

/**
 * Puddles after the rain, each one different: hollows gather where a coarse
 * noise field dips, big lobed ones few and small ones many, with emptier
 * stretches between, and curved runnels drain downhill; their banks fray
 * with noise. Dark water, the far lower-right side reflecting the sky, a
 * dark damp rim on the near upper-left bank and a dithered damp halo around
 * the bigger ones; transparent everywhere else.
 */
const PUDDLE_RUNNELS = [ // quadratic curves [x0, y0, cx, cy, x1, y1, half width, meander]
  [70, 4, 72, 22, 56, 30, 1.05, 0.9], // long and bending
  [8, 98, 20, 106, 36, 101, 0.9, 0.4], // a shallow rut
  [104, 62, 110, 70, 108, 80, 0.85, 0.5], // short
];

function wetGround() {
  const S = 128;
  const t = new k.Tex(S, S, true);
  const wrap = (d) => (((d % S) + S * 1.5) % S) - S / 2;
  const wobble = k.fbm(S, 16, 2, 63);
  const hollows = k.fbm(S, 4, 2, 74);
  const curves = PUDDLE_RUNNELS.map(([x0, y0, cx, cy, x1, y1, hw, wind]) => Array.from({ length: 33 }, (_, i) => {
    const s = i / 32;
    const a = (1 - s) ** 2;
    const b = 2 * s * (1 - s);
    // It winds across its course and narrows at both ends.
    const tx = (1 - s) * (cx - x0) + s * (x1 - cx);
    const ty = (1 - s) * (cy - y0) + s * (y1 - cy);
    const off = (wind * Math.sin(s * Math.PI * 2)) / Math.hypot(tx, ty);
    return [a * x0 + b * cx + s * s * x1 - ty * off, a * y0 + b * cy + s * s * y1 + tx * off, hw * (0.45 + 0.55 * Math.sin(Math.PI * s) ** 0.5)];
  }));

  // Hollows where the ground dips, apart from each other and the runnels,
  // biggest first; big and medium ones get side lobes so no two look alike,
  // small ones only lie beside a bigger one. [cx, cy, rx, ry, angle]
  const taken = curves.flat().map(([x, y]) => [x, y, 2]);
  const lobes = [];
  [8, 18, 14].forEach((want, kind) => {
    for (let i = 0, n = 0; n < want && i < 8000; i++) {
      const h = (m) => k.hash(i, m, 72 + kind);
      const cx = h(1) * S;
      const cy = h(2) * S;
      if (h(3) > (hollows(cx | 0, cy | 0) - 0.4) * 4.5) continue;
      const long = kind === 1 && h(8) < 0.35;
      const rx = [7 + h(5) * 2.5, 3.2 + h(5) * 2.8, 2 + h(5) * 1.1][kind] * (long ? 1.6 : 1);
      const ry = Math.max(1.5, long ? rx * 0.3 : rx * (kind === 0 ? 0.45 + h(6) * 0.15 : 0.4 + h(6) * 0.45));
      const angle = (h(7) - 0.5) * 1.4;
      const sides = kind === 0 ? 2 : kind === 1 && !long && h(9) < 0.5 ? 1 : 0;
      const reach = rx * (sides ? 1.4 : 1);
      const gap = (x, y, r) => Math.hypot(wrap(cx - x), wrap(cy - y)) - r - reach;
      if (taken.some(([x, y, r]) => gap(x, y, r) < 2 + reach * 0.25)) continue;
      if (kind === 2 && !taken.some(([x, y, r]) => r >= 3 && gap(x, y, r) < 8)) continue;
      taken.push([cx, cy, reach]);
      lobes.push([cx, cy, rx, ry, angle]);
      for (let j = 0; j < sides; j++) {
        const turn = h(10 + j) * Math.PI * 2;
        lobes.push([cx + Math.cos(turn) * rx * 0.7, cy + Math.sin(turn) * ry * 0.8,
          rx * (0.45 + h(12 + j) * 0.2), Math.max(1.3, ry * (0.6 + h(14 + j) * 0.3)), angle + (h(16 + j) - 0.5)]);
      }
      n++;
    }
  });

  const water = new Uint8Array(S * S);
  t.each((x, y) => {
    // Small puddles fray less, so they keep a shape.
    const fray = (wobble(x, y) - 0.5) * 0.7;
    let p = -1;
    for (const [cx, cy, rx, ry, a] of lobes) {
      const dx = wrap(x + 0.5 - cx);
      const dy = wrap(y + 0.5 - cy);
      const u = (dx * Math.cos(a) + dy * Math.sin(a)) / rx;
      const v = (dy * Math.cos(a) - dx * Math.sin(a)) / ry;
      p = Math.max(p, 1 - Math.hypot(u, v) + fray * Math.min(1, ry / 3));
    }
    let q = -1;
    for (const pts of curves) {
      for (const [px, py, hw] of pts) q = Math.max(q, 1 - Math.hypot(wrap(x + 0.5 - px), wrap(y + 0.5 - py)) / hw);
    }
    water[y * S + x] = p > 0 || q > 0 ? 1 : 0;
  });
  const idx = (x, y) => (((y % S) + S) % S) * S + (((x % S) + S) % S);
  const W = (x, y) => water[idx(x, y)] === 1;

  // Pieces of water or dry land under 5 px read as noise: fill or drop them.
  const seen = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) {
    if (seen[i]) continue;
    const kind = water[i];
    const part = [i];
    seen[i] = 1;
    for (let j = 0; j < part.length; j++) {
      const x = part[j] % S;
      const y = (part[j] - x) / S;
      for (const n of [idx(x + 1, y), idx(x - 1, y), idx(x, y + 1), idx(x, y - 1)]) {
        if (!seen[n] && water[n] === kind) { seen[n] = 1; part.push(n); }
      }
    }
    if (part.length < 5) for (const j of part) water[j] = 1 - kind;
  }

  const rim = P.c('mud0');
  t.each((x, y) => {
    if (W(x, y)) {
      // Steps to the bank towards the light (near) and away from it (far).
      const run = (sx, sy) => { let d = 1; while (d < 8 && W(x + sx * d, y + sy * d)) d++; return d; };
      const far = Math.min(run(1, 0), run(0, 1));
      const near = Math.min(run(-1, 0), run(0, -1));
      const wide = near + far >= 6;
      if (far === 1) return P.c(wide ? 'water5' : 'water4');
      if (far === 2 && wide) return P.c(near > 2 && k.hash(x, y, 64) < 0.07 ? 'white0' : 'water4');
      if (near === 1) return P.c(wide ? 'water1' : 'water2');
      return P.c(near / (near + far) > 0.5 ? 'water3' : 'water2');
    }
    if (W(x + 1, y) || W(x, y + 1)) return rim;
    // The bank is soaked, the wider the more water is near.
    let wet = 0;
    let d = 9;
    for (let oy = -4; oy <= 4; oy++) {
      for (let ox = -4; ox <= 4; ox++) {
        if (!water[idx(x + ox, y + oy)]) continue;
        wet++;
        d = Math.min(d, Math.hypot(ox, oy));
      }
    }
    const reach = 1 + (wet / 81) * 7;
    const dense = 0.7 * (1 - (d - 1) / reach) + (wobble(x + 31, y + 17) - 0.5) * 0.3;
    if (d > reach || k.BAYER4[y & 3][x & 3] >= dense * 16) return undefined;
    return P.c(d < 1.5 ? 'mud1' : 'mud2');
  });
  return t;
}

module.exports = {
  sprites: {
    wave_break: waves.waveBreak,
    fallen_tree: fallenTree,
    driftwood,
  },
  textures: {
    flood_deep: (f) => floodWater(f, FLOOD_LOOKS.deep),
    flood_water: (f) => floodWater(f, FLOOD_LOOKS.water),
    flood_shallow: (f) => floodWater(f, FLOOD_LOOKS.shallow),
    flood_mud: (f) => floodWater(f, FLOOD_LOOKS.mud),
    wet_ground: wetGround,
  },
};
