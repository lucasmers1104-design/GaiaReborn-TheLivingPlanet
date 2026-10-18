/* =============================================================================
 * SimEarth 2.0 — tidal wave and hurricane art
 * -----------------------------------------------------------------------------
 * The hurricane's spiral cloud with its eye (one set per hemisphere), the
 * small forming storm, the tornado, fallen trees and driftwood, and the
 * ground textures: flood water by depth, its muddy backwash and wet ground.
 * The breaking wave lives in water-waves.js.
 * Light from the upper left. The spiral is a height field of cloud — arms on
 * a logarithmic spiral round a dense core — lit by its slope, so its bands
 * get a light edge on their upper-left flank and the eyewall's far side
 * catches the light. The southern set mirrors the height field, never the
 * finished pixels, and lights it again (docs/ereignisse-2026-10/stil.md).
 * Rotation loops: each frame turns the spiral by 1/frames of the angle
 * between two arms, and the cloud's texture lives in spiral coordinates,
 * so the last frame leads back into the first.
 * Style: docs/ereignisse-2026-10/stil.md · contract: tools/fx/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');
const P = require('../terrain/palette');
const fx = require('./kit');
const waves = require('./water-waves');

/* ------------------------------------------------------------- storm -- */

/**
 * The cloud puffs of a spiral storm that turns anticlockwise (north). Its
 * arms ({ angle, twist, from, to, size }, radii as shares of the half box)
 * wind clockwise outwards; puffs flow inwards along them by 1/frames of
 * their spacing a frame and depend on their radius only, so the loop
 * closes. The rings of towers round the eye turn by 1/frames of the gap
 * between two towers.
 */
function stormPuffs(size, f, frames, o) {
  const c = size / 2;
  const turn = f / frames;
  const puffs = [];
  const put = (rho, theta, r) => puffs.push({ x: c + Math.cos(theta) * rho * c, y: c - Math.sin(theta) * rho * c, r });
  for (const ring of o.rings) {
    for (let n = 0; n < ring.count; n++) put(ring.rho, ring.angle + ((n + turn) / ring.count) * Math.PI * 2, ring.r);
  }
  for (const arm of o.arms) {
    // Spaced along the arc, not the radius: a tight spiral needs more puffs.
    const step = (arm.size * 0.7) / (c * Math.hypot(1, arm.twist));
    for (let j = 0; ; j++) {
      const rho = arm.from + (j - turn) * step;
      if (rho > arm.to) break;
      if (rho < arm.from) continue;
      const along = (rho - arm.from) / (arm.to - arm.from);
      const r = arm.size * (1 - along * along);
      if (r < 0.8) continue;
      const theta = arm.angle - arm.twist * Math.log(rho / arm.from) + Math.sin(rho * 23) * 0.06;
      put(rho, theta, r);
      // A smaller row along the outside of the band makes it lumpy.
      put(rho + (r * 0.5) / c, theta - 0.1, r * 0.62);
    }
  }
  return puffs;
}

/** Mirror the puffs left-right: the southern storm turns the other way, and is lit afresh. */
function mirrored(size, puffs) {
  return puffs.map((p) => ({ x: size - p.x, y: p.y, r: p.r }));
}

const CLOUD = ['ice0', 'ice1', 'ice2', 'ice3', 'ice4', 'white0'];

/** Light the puffs from the upper left and open the eye: its far wall catches the light, its near wall lies in shadow. */
function storm(size, puffs, eye) {
  const t = fx.billow(new k.Tex(size, size), puffs, CLOUD);
  if (eye <= 0) return t;
  const c = size / 2;
  const hole = (x, y) => Math.hypot(x + 0.5 - c, y + 0.5 - c) < eye;
  t.each((x, y) => (hole(x, y) ? 0 : undefined));
  return t.each((x, y) => {
    if (hole(x, y) || t.get(x, y) === 0) return undefined;
    if (hole(x + 1, y) || hole(x, y + 1)) return P.c(CLOUD[0]);
    if (hole(x - 1, y) || hole(x, y - 1)) return P.c(CLOUD[CLOUD.length - 1]);
    return undefined;
  });
}

const HURRICANE = {
  rings: [{ rho: 0.17, count: 6, r: 3.3, angle: 0 }, { rho: 0.36, count: 7, r: 4.8, angle: 0.4 }],
  arms: [
    { angle: 0.3, twist: 2.1, from: 0.3, to: 0.98, size: 4.2 },
    { angle: 2.5, twist: 1.9, from: 0.3, to: 0.84, size: 3.6 },
    { angle: 4.3, twist: 2.3, from: 0.3, to: 0.92, size: 3.9 },
  ],
};
const SMALL = {
  rings: [{ rho: 0, count: 1, r: 3.6, angle: 0 }, { rho: 0.26, count: 5, r: 3.0, angle: 0.2 }],
  arms: [
    { angle: 0.5, twist: 1.7, from: 0.26, to: 0.9, size: 2.8 },
    { angle: 3.6, twist: 1.7, from: 0.26, to: 0.8, size: 2.5 },
  ],
};

function hurricane(f) {
  return storm(48, stormPuffs(48, f, 8, HURRICANE), 2.2);
}

function hurricaneSouth(f) {
  return storm(48, mirrored(48, stormPuffs(48, f, 8, HURRICANE)), 2.2);
}

function stormSmall(f) {
  return storm(32, stormPuffs(32, f, 2, SMALL), 0);
}

function stormSmallSouth(f) {
  return storm(32, mirrored(32, stormPuffs(32, f, 2, SMALL)), 0);
}

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

/* ----------------------------------------------------------- tornado -- */

/** Rows of the funnel: it hangs from the cloud base and narrows to a point above the dust. */
const FUNNEL_TOP = 3;
const FUNNEL_FOOT = 28;
const TORNADO_FRAMES = 6;

/**
 * The tornado: a funnel swaying from a cloud base, banded by striations
 * that climb a pixel a frame six pixels apart (so the loop closes), a dust
 * whirl turning round its foot and debris flying round it. Lit as a
 * cylinder from the upper left.
 */
function tornado(f) {
  const t = new k.Tex(16, 32);
  const turn = (f / TORNADO_FRAMES) * Math.PI * 2;
  const cx = (y) => 8 + Math.sin(turn + y * 0.18) * 1.6 * Math.pow(Math.max(0, y - FUNNEL_TOP) / (FUNNEL_FOOT - FUNNEL_TOP), 1.2);
  const half = (y) => 0.8 + 5.2 * Math.pow(Math.max(0, 1 - (y - FUNNEL_TOP) / (FUNNEL_FOOT - FUNNEL_TOP)), 1.8);
  // Five dust puffs turn round the foot by a fifth of a turn over the loop.
  const dust = (front) => {
    const puffs = [];
    for (let n = 0; n < 5; n++) {
      const a = (n / 5) * Math.PI * 2 + turn / 5;
      if ((Math.sin(a) >= 0) !== front) continue;
      puffs.push({ x: 8 + Math.cos(a) * 4.6, y: 27.6 + Math.sin(a) * 1.5, r: 2 + Math.sin(a) * 0.5 });
    }
    if (front) puffs.push({ x: 8, y: 29.6, r: 2.4 });
    return fx.billow(new k.Tex(16, 32), puffs, ['soil0', 'soil1', 'soil2', 'sand1']);
  };
  t.stamp(dust(false), 0, 0);
  fx.billow(t, [{ x: 4, y: 2.5, r: 3.6 }, { x: 9, y: 1.8, r: 4.2 }, { x: 13, y: 3, r: 3.4 }, { x: 8, y: 4.4, r: 2.6 }], ['rock0', 'rock1', 'rock2', 'rock3']);
  for (let y = FUNNEL_TOP; y <= FUNNEL_FOOT; y++) {
    const c = cx(y);
    const w = half(y);
    for (let x = 0; x < 16; x++) {
      const nx = (x + 0.5 - c) / w;
      if (Math.abs(nx) > 1) continue;
      const band = (((y + f + Math.round(nx * 2.5)) % TORNADO_FRAMES) + TORNADO_FRAMES) % TORNADO_FRAMES;
      let light = -nx * 0.75 + 0.1 + (band === 0 ? 0.35 : band === 3 ? -0.3 : 0);
      if (nx > 0.7) light = -1;
      else if (nx < -0.7) light = 0.9;
      t.set(x, y, P.c(light > 0.8 ? 'rock4' : light > 0.35 ? 'rock3' : light > -0.15 ? 'rock2' : light > -0.6 ? 'rock1' : 'rock0'));
    }
  }
  // Debris on orbits round the funnel, one turn over the loop; only the near half of each orbit shows.
  for (let n = 0; n < 5; n++) {
    const y = 11 + n * 3.4;
    const a = turn + n * 1.3;
    if (Math.sin(a) < -0.2) continue;
    t.set(Math.round(cx(y) + Math.cos(a) * (half(y) + 2)), Math.round(y + Math.sin(a)), P.c(n % 2 ? 'bark0' : 'soil0'));
  }
  t.stamp(dust(true), 0, 0);
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

/** Puddles after the rain and a few damp dark pixels; transparent everywhere else. */
function wetGround() {
  const t = new k.Tex(64, 64, true);
  const body = P.c('water3');
  const shine = P.c('water4');
  const damp = P.c('mud0');
  for (let by = 0; by < 64; by += 16) {
    for (let bx = 0; bx < 64; bx += 16) {
      if (k.hash(bx, by, 71) > 0.62) continue;
      const cx = bx + 3 + k.hash(bx, by, 72) * 10;
      const cy = by + 3 + k.hash(bx, by, 73) * 10;
      const rx = 1.6 + k.hash(bx, by, 74) * 2.2;
      const ry = 0.9 + k.hash(bx, by, 75) * 0.8;
      const inside = (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
      for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
        for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
          if (inside(x, y)) {
            // A puddle is a hollow: its far, lower-right side reflects the sky.
            t.set(x, y, !inside(x + 1, y) || !inside(x, y + 1) ? shine : body);
          } else if (inside(x + 1, y) || inside(x, y + 1)) {
            t.set(x, y, damp);
          }
        }
      }
    }
  }
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) if (t.get(x, y) === 0 && k.hash(x, y, 77) < 0.025) t.set(x, y, damp);
  }
  return t;
}

module.exports = {
  sprites: {
    wave_break: waves.waveBreak,
    hurricane,
    hurricane_south: hurricaneSouth,
    tornado,
    storm_small: stormSmall,
    storm_small_south: stormSmallSouth,
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
