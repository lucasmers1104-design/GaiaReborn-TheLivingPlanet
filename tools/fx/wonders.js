/* =============================================================================
 * Gaia Reborn — world wonders built in stages: the pyramids and the Great Wall
 * -----------------------------------------------------------------------------
 * Every wonder is a heightfield in the map's 3/4 relief view, as the mountains
 * and volcano cones are (src/landridgedraw.ts): seen from the south at 45°, a
 * ground point that rises z px shows z px higher. Each column is painted
 * front to back, every ground point covering the screen rows from its raised
 * position up to what nearer ground already covers, so tops show from above,
 * south faces stand up and whatever lies behind a mass hides. Light from the
 * upper left: west faces lit, south faces in half light, east faces dark; the
 * lower-right silhouette and the skyline take a one-step darker rim.
 *
 *   wonder_pyramids    the three pyramids of Giza over 3 × 2 tiles (Khufu in
 *                      the north-east, Khafre on its higher terrace south-west
 *                      of it, little Menkaure further south-west), the quarry
 *                      south of Khufu, mud-brick ramps; frames are the stages
 *   wonder_wall        one arm of the Great Wall from a tile's centre to its
 *                      edge, 8 directions × 3 stages, 16 × 32 centred on
 *                      the tile; two arms and the platform at the centre
 *                      make a tile's piece of wall
 *   wonder_wall_tower  the watchtower over a tile's centre, 3 stages
 *   wonder_crew        haulers dragging a block on a sledge, a loop
 * Style: docs/ereignisse-2026-10/stil.md · contract: tools/fx/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');
const P = require('../terrain/palette');

/* ------------------------------------------------------------ the view -- */

/** Ground rows sampled per px along a column. */
const STEP = 0.05;
/** A hit this far below its ground point's top lies on a vertical face. */
const FACE_TOL = 0.3;
/** Ground rows between a pixel and the one above it that make a skyline. */
const SKYLINE_GAP = 2.5;

/** Palette name of an index. */
const NAME = Object.fromEntries(Object.entries(P.INDEX).map(([n, i]) => [i, n]));

/** One step darker; the single-colour ramps step into their nearest darker neighbour. */
const DARKER = { white0: 'rock4', yellow0: 'orange0', orange0: 'sand0', sand4: 'sand2' };
function darker(name) {
  return DARKER[name] ?? NAME[P.shift(P.c(name), -1)];
}

/**
 * A scene: `base(gx, gy)` the ground's own height (0, or below 0 in a pit),
 * `prims` raised parts { z(gx, gy) → height or -Infinity, paint(hit) → palette
 * name, rim: false to keep its silhouette without the darker rim, 'self' to
 * rim it against every other part too, keep(name): true for tones that never
 * take the rim, contour: [skyline, lower right] fixed rim tones instead of one
 * step darker }. The ground itself paints through
 * `ground(hit)` (marks, the quarry) or stays clear. `oy`: the sprite row of
 * ground row 0.
 */
function render(w, h, oy, scene) {
  const hits = new Array(w * h).fill(null);
  const gyMax = h - oy + 24;
  const gyMin = -oy - 24;
  for (let x = 0; x < w; x++) {
    const gx = x + 0.5;
    let top = Infinity;
    for (let gy = gyMax; gy >= gyMin; gy -= STEP) {
      let z = scene.base(gx, gy);
      let who = null;
      for (const p of scene.prims) {
        const v = p.z(gx, gy);
        if (v > z) { z = v; who = p; }
      }
      const s = gy - z + oy;
      if (s < top) {
        const r0 = Math.max(0, Math.ceil(s - 0.5));
        const r1 = Math.min(h - 1, Math.ceil(top - 0.5) - 1);
        for (let r = r0; r <= r1; r++) {
          const zf = gy - (r + 0.5 - oy);
          hits[r * w + x] = { x, y: r, gx, gy, z, zf, face: z - zf > FACE_TOL, who };
        }
        top = s;
      }
    }
  }
  const names = hits.map((hit) => {
    if (!hit) return null;
    return hit.who ? hit.who.paint(hit) : scene.ground ? scene.ground(hit) : null;
  });
  // Past the box's edge the picture goes on (a neighbour's arm, the tile above): no rim there.
  const solid = (x, y, who) => x < 0 || y < 0 || x >= w || y >= h
    || (names[y * w + x] && (who.rim === 'self' ? hits[y * w + x].who === who : hits[y * w + x].who));
  const t = new k.Tex(w, h);
  for (let i = 0; i < w * h; i++) {
    let n = names[i];
    if (!n) continue;
    const hit = hits[i];
    const who = hit.who;
    if (who && who.rim !== false && !(who.keep && who.keep(n))) {
      const x = i % w;
      const y = (i / w) | 0;
      const above = y > 0 && names[i - w] ? hits[i - w] : null;
      const sky = y > 0 && (!above || (above.gy < hit.gy - SKYLINE_GAP && hit.z > 0.5) || (who.rim === 'self' && above.who !== who));
      if (sky) n = who.contour ? who.contour[0] : darker(n);
      else if (!solid(x + 1, y, who) || !solid(x, y + 1, who)) n = who.contour ? who.contour[1] : darker(n);
    }
    t.px[i] = P.c(n);
  }
  return t;
}

const flat = () => 0;

/* -------------------------------------------------------- building parts -- */

/** A block: footprint x0..x1 × y0..y1, top at height z1; its top and south face in two tones. */
function box(x0, x1, y0, y1, z1, top, face, rim = false) {
  return {
    rim,
    z: (gx, gy) => (gx >= x0 && gx < x1 && gy >= y0 && gy < y1 ? z1 : -Infinity),
    paint: (hit) => (hit.face ? face : top),
  };
}

/* -------------------------------------------------------------- pyramids -- */

const PW = 48;
const PH = 48;

/**
 * Ground centre, half base across (hx) and deep (hy), height (px) and the rise of the rock each pyramid stands on.
 * Khufu (230 m base) in the north-east, Khafre (215 m) on its terrace about 10 m higher to the south-west, Menkaure
 * (103 m) further south-west: sizes and the diagonal kept, the spacing squeezed into 3 × 2 tiles. The base is drawn
 * about half as deep as wide and the height raised a third over the real slope (52°), as the map's mountains are:
 * with a square base at the true slope the apex would stand only 2 px over the back corners, a tent, not a pyramid.
 */
const KHUFU = { cx: 37.5, cy: 23.5, hx: 9.5, hy: 5, h: 16, z0: 0 };
const KHAFRE = { cx: 18.5, cy: 33, hx: 8.5, hy: 4.5, h: 14.5, z0: 1 };
const MENKAURE = { cx: 4.5, cy: 42.5, hx: 4.5, hy: 2.5, h: 7.5, z0: 0 };
/** Khafre's levelled rock terrace, 1 px high: x0, x1, y0, y1. */
const TERRACE = [9, 28, 27, 39];

/**
 * The core is laid in courses, a step pyramid until the casing goes on: pale grey-beige limestone on the lit
 * western treads, ochre in the shade of the eastern ones and on the risers we see from the south, each tread's
 * dropping edge a step darker, all of it framed by a dark contour on the skyline and lower right so the site reads
 * on the desert. Pairs: [western half, eastern half].
 */
const CORE = { tread: ['rock4', 'sand1'], edge: ['sand1', 'sand0'], riser: ['sand1', 'bark2'], top: 'rock4', joint: 'sand2' };
const CORE_CONTOUR = ['sand0', 'bark0'];
const CASING = { west: 'white0', south: 'rock4', east: 'rock2', top: 'white0' };
const GOLD = { west: 'yellow0', south: 'yellow0', east: 'orange0', top: 'yellow0' };
/** Height of a course of core blocks, px; working tops stand on whole courses. */
const COURSE = 3;
/** Height of the gilded capstone, px. */
const TIP = 2.5;

/** Footprint distance, 1 at the base's edge. */
const footQ = (p, gx, gy) => Math.max(Math.abs(gx - p.cx) / p.hx, Math.abs(gy - p.cy) / p.hy);

function faceOf(p, gx, gy) {
  const dx = (gx - p.cx) / p.hx;
  const dy = (gy - p.cy) / p.hy;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'west' : 'east';
  return dy > 0 ? 'south' : 'north';
}

/**
 * A pyramid built up to `upto` px (its full height when finished): a stepped core with a flat working top until
 * then. `cased`: the finished white casing with its gilded capstone.
 */
function pyramid(p, upto, cased) {
  const top = Math.min(upto, p.h);
  return {
    // The gilded capstone catches the light even on the skyline.
    keep: (name) => name === GOLD.west,
    contour: cased ? null : CORE_CONTOUR,
    z(gx, gy) {
      const q = footQ(p, gx, gy);
      if (q > 1) return -Infinity;
      const v = p.h * (1 - q);
      return p.z0 + Math.min(top, cased ? v : COURSE * Math.ceil(v / COURSE - 1e-6));
    },
    paint(hit) {
      const rel = hit.z - p.z0;
      if (top < p.h && rel >= top - 0.01) {
        // The working top: core stone laid course by course, the joints in a running bond.
        const gy = Math.floor(hit.gy);
        const joint = gy % 2 === 0 || (Math.floor(hit.gx) + (gy % 4 === 1 ? 2 : 0)) % 4 === 0;
        return joint ? CORE.joint : CORE.top;
      }
      if (!cased) {
        const side = hit.gx < p.cx ? 0 : 1;
        if (hit.face) return CORE.riser[side];
        // Where a course's tread drops to the one below on a flank, its edge shows a step darker.
        const q = footQ(p, hit.gx + (side ? 1 : -1), hit.gy);
        const below = q > 1 ? 0 : COURSE * Math.ceil((p.h * (1 - q)) / COURSE - 1e-6);
        return below < rel - 0.01 ? CORE.edge[side] : CORE.tread[side];
      }
      let f = faceOf(p, hit.gx, hit.gy);
      if (f === 'north') f = 'south';
      return rel > p.h - TIP ? GOLD[f] : CASING[f];
    },
  };
}

/** Half width of a pyramid's south face at height z, px. */
const halfAt = (p, z) => p.hx * (1 - z / p.h);
/** Ground row where the south face stands at height z. */
const faceRow = (p, z) => p.cy + p.hy * (1 - z / p.h);

/** Rise of the ramps along a face, px per px. */
const RAMP_SLOPE = 0.6;
/** Depth of a ramp's walkway, px. */
const RAMP_DEPTH = 1;

/**
 * The legs of a ramp up a pyramid's south face to its working top at height zc: from the south-west corner it
 * climbs east along the face, and where the face grows too narrow it turns back west, until it reaches the top.
 * Each leg: x from xa to xb, height from za to zb.
 */
function rampLegs(p, zc) {
  const legs = [];
  let x = p.cx - p.hx + 1;
  let z = 0;
  let dir = 1;
  while (z < zc - 0.01 && legs.length < 6) {
    const xa = x;
    const za = z;
    while (z < zc && (dir > 0 ? x < p.cx + halfAt(p, z) - 1.5 : x > p.cx - halfAt(p, z) + 1.5)) {
      x += dir * 0.25;
      z = Math.min(zc, z + 0.25 * RAMP_SLOPE);
    }
    legs.push({ xa, xb: x, za, zb: z });
    dir = -dir;
  }
  return legs;
}

/**
 * The ramp as a heightfield: each leg a mud-brick walkway resting on the face at its own height, its outer wall
 * standing on the face below. Cross timbers for the sledges every other px.
 */
function ramp(p, zc) {
  const legs = rampLegs(p, zc);
  const at = (gx, gy) => {
    let best = -Infinity;
    for (const l of legs) {
      const lo = Math.min(l.xa, l.xb);
      const hi = Math.max(l.xa, l.xb);
      if (gx < lo - 0.5 || gx > hi + 0.5) continue;
      const s = Math.max(0, Math.min(1, (gx - l.xa) / (l.xb - l.xa || 1)));
      const r = l.za + (l.zb - l.za) * s;
      const y0 = faceRow(p, r);
      if (gy >= y0 - 0.5 && gy < y0 + RAMP_DEPTH) best = Math.max(best, p.z0 + r + 0.6);
    }
    return best;
  };
  return {
    contour: ['bark1', 'bark0'],
    z: at,
    paint(hit) {
      if (hit.face) return 'bark1';
      return Math.floor(hit.gx) % 2 ? 'bark1' : 'bark2';
    },
  };
}

/** Quarry pit by stage: x0, x1, y0, y1 and depth; from depth 3 a terrace along its north wall at half depth. */
const QUARRY = [
  [29, 34, 40, 48, 2],
  [28, 35, 37, 48, 3],
  [27, 35, 34, 48, 4],
  [27, 35, 34, 48, 4],
  [27, 35, 34, 48, 4],
  [27, 35, 34, 48, 4],
];

function quarryDepth(q, gx, gy) {
  const [x0, x1, y0, y1, d] = q;
  if (gx < x0 || gx >= x1 || gy < y0 || gy >= y1) return 0;
  return d >= 3 && gy < y0 + 2 ? -Math.floor(d / 2) : -d;
}

/** Trodden, levelled ground where a pyramid will stand, the dark cord stretched round it, the levelling channels. */
function marked(p, gx, gy) {
  const dx = Math.abs(gx - p.cx);
  const dy = Math.abs(gy - p.cy);
  if (dx > p.hx + 0.5 || dy > p.hy + 0.5) return null;
  if (dx > p.hx - 0.5 || dy > p.hy - 0.5) return 'bark0';
  return Math.floor(gx - p.cx + 64) % 4 === 0 || Math.floor(gy - p.cy + 64) % 3 === 0 ? 'sand1' : 'sand2';
}

/** Corner stakes of a marked base. */
function stakes(p) {
  return [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => {
    const x = Math.floor(p.cx + sx * p.hx - (sx > 0 ? 1 : 0));
    const y = Math.floor(p.cy + sy * p.hy - (sy > 0 ? 1 : 0));
    return box(x, x + 1, y, y + 1, 2, 'bark1', 'bark0');
  });
}

/** Cut blocks waiting by the quarry and the ramps, per stage: [x, y, w], 1 px high, top lit, face shaded. */
const BLOCKS = [
  [[25, 45, 2], [25, 43, 2], [36, 44, 2], [39, 46, 2], [35, 41, 2], [40, 42, 2], [31, 36, 2]],
  [[25, 45, 2], [40, 42, 2], [40, 44, 2], [41, 46, 2], [26, 43, 2], [29, 31, 2]],
  [[38, 40, 2], [41, 42, 2], [42, 44, 2], [24, 46, 2], [27, 31, 2]],
  [[41, 42, 2], [42, 44, 2], [39, 40, 2], [12, 45, 2], [23, 44, 2]],
  [[10, 45, 2], [12, 47, 2], [43, 44, 2]],
  [],
];

function blocks(list, zOf) {
  return list.map(([x, y, w]) => box(x, x + w, y, y + 1, zOf(x + 0.5, y + 0.5) + 1, 'rock4', 'rock2'));
}

/**
 * A timber scaffold round a working top at height zc: poles at the four corners standing over the finished apex,
 * ledgers lashed across them front and back (drawn after the heightfield: they float).
 */
function scaffoldPoles(p, zc) {
  const x0 = Math.floor(p.cx - p.hx);
  const x1 = Math.ceil(p.cx + p.hx) - 1;
  const ys = Math.ceil(p.cy + p.hy) - 1;
  const yn = Math.floor(p.cy - p.hy);
  return [x0, x1].flatMap((x) => [yn, ys].map((y) => box(x, x + 1, y, y + 1, zc + 5, 'bark2', 'bark2')));
}

function scaffoldLedgers(t, p, zc) {
  const x0 = Math.floor(p.cx - p.hx);
  const x1 = Math.ceil(p.cx + p.hx) - 1;
  for (const [y, z] of [[Math.floor(p.cy - p.hy), zc + 4], [Math.ceil(p.cy + p.hy) - 1, zc + 3]]) {
    const row = Math.round(y - z);
    for (let x = x0 + 1; x < x1; x++) t.set(x, row, P.c('bark2'));
  }
}

/** Khafre's terrace: levelled rock, marked out while the second pyramid waits for its turn. */
function terrace(markedOut) {
  const [x0, x1, y0, y1] = TERRACE;
  return {
    rim: false,
    z: (gx, gy) => (gx >= x0 && gx < x1 && gy >= y0 && gy < y1 ? 1 : -Infinity),
    paint: (hit) => (hit.face ? 'sand1' : markedOut ? marked(KHAFRE, hit.gx, hit.gy) || 'sand2' : 'sand4'),
  };
}

/**
 * Stage f: 0 Khufu's base levelled and cord-marked, the quarry opened; 1 its first courses, a ramp along the face;
 * 2 half its height, Khafre's terrace marked out; 3 Khufu near its top with the ramp doubled back, Khafre's first
 * courses, Menkaure's base marked; 4 Khufu and Khafre cased and capped, Menkaure in scaffolding; 5 all three done.
 */
function pyramids(f) {
  const q = QUARRY[f];
  const base = (gx, gy) => quarryDepth(q, gx, gy);
  const prims = [];
  if (f === 0) prims.push(...stakes(KHUFU));
  if (f >= 1) prims.push(pyramid(KHUFU, [0, 3, 9, 12, 99, 99][f], f >= 4));
  if (f >= 1 && f <= 3) prims.push(ramp(KHUFU, [0, 3, 9, 12][f]));
  if (f >= 2) prims.push(terrace(f === 2));
  if (f >= 3) prims.push(pyramid(KHAFRE, f === 3 ? 3 : 99, f >= 4));
  if (f === 3) prims.push(ramp(KHAFRE, 3), ...stakes(MENKAURE));
  if (f >= 4) prims.push(pyramid(MENKAURE, f === 4 ? 3 : 99, f >= 5));
  if (f === 4) prims.push(...scaffoldPoles(MENKAURE, 3));
  prims.push(...blocks(BLOCKS[f], base));
  const ground = (hit) => {
    if (hit.z < 0 || hit.face) {
      // The quarry in the grey rock: its cut walls lit at the lip, in shade below; the floor scored into blocks.
      if (hit.face) return hit.zf > -1.5 ? 'rock3' : 'rock1';
      if (hit.z > -q[4] + 0.1) return 'rock2';
      return Math.floor(hit.gx) % 4 === 3 || Math.floor(hit.gy) % 3 === 0 ? 'rock1' : 'rock2';
    }
    // Each block lying on the ground casts a short shadow to its east.
    if (BLOCKS[f].some(([x, y, w]) => Math.floor(hit.gy) === y && Math.floor(hit.gx) === x + w && base(x + 0.5, y + 0.5) === 0)) return 'sand1';
    if (f === 0) return marked(KHUFU, hit.gx, hit.gy);
    if (f === 3) return marked(MENKAURE, hit.gx, hit.gy);
    return null;
  };
  const t = render(PW, PH, 0, { base, prims, ground });
  if (f === 4) scaffoldLedgers(t, MENKAURE, 3);
  return t;
}

/* ------------------------------------------------------------- the wall -- */

/** Tile sprites: 16 × 32 centred on the tile, its ground row 0 on sprite row 8, its centre at (8, 8) on the ground. */
const TW = 16;
const TH = 32;
const TOY = 8;
const MID = 8;
/** Neighbour offsets in HAZARD_NX/NY order: NW N NE W E SW S SE. */
const DIRS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const STAGES = 3;

/**
 * The wall's cross-section, px from its centre line: the walkway between its parapets out to TOP, battered faces
 * down to the ground at BASE; its height per stage (footing, half height, finished); merlons 1 px over the walkway.
 */
const TOP = 2;
const BASE = 3;
const WALL_H = [1, 3, 5];
/** The platform over every tile's centre the arms run into: half width; finished it stands 1 px over the walkway. */
const PLAT = 3;
/** Scaffold poles while the wall is half built: px out from the centre line, spacing on the world grid, height. */
const POLE_D = 4;
const POLE_EVERY = 4;
const POLE_Z = 6;
const LEDGER_Z = 5;

/** Merlon tops keep their light on the skyline, so the crenellation reads as a row of bright teeth. */
const merlonTop = (name) => name === 'rock4';

/** Light share of a face whose outward normal points along (nx, ny) on the ground: west lit, east dark. */
const sideLight = (nx, ny) => -nx * 0.55 - ny * 0.08;

/** Axes of an arm: along it (u) and across it (v, to its right), and whether it runs north–south. */
function axes(dir) {
  const [dx, dy] = DIRS[dir];
  const l = Math.hypot(dx, dy);
  return { ux: dx / l, uy: dy / l, ns: dx === 0 };
}

/**
 * One arm of the wall from the tile's centre towards neighbour `dir`, at `stage`. The band runs on past the
 * tile's edge: there it lies under the neighbour's own arm, which the map draws after it (southern tiles last),
 * so the two join without a seam. Merlons, joints and poles keep to the world's pixel grid for the same reason.
 */
function band(dir, stage) {
  const { ux, uy, ns } = axes(dir);
  const H = WALL_H[stage];
  const merlon = (gx, gy) => (ns ? Math.floor(gy) : Math.floor(gx)) % 2 === 0;
  const geo = (gx, gy) => {
    const rx = gx - MID;
    const ry = gy - MID;
    return { t: rx * ux + ry * uy, d: -rx * uy + ry * ux };
  };
  return {
    keep: merlonTop,
    z(gx, gy) {
      const { t, d } = geo(gx, gy);
      const ad = Math.abs(d);
      if (t < 0 || ad > BASE) return -Infinity;
      if (ad > TOP) return (H * (BASE - ad)) / (BASE - TOP);
      if (stage === 2 && ad > TOP - 1 && merlon(gx, gy)) return H + 1;
      return H;
    },
    paint(hit) {
      const { d } = geo(hit.gx, hit.gy);
      const ad = Math.abs(d);
      if (hit.face) return 'rock2';
      if (ad > TOP) {
        // A battered face, by the way it looks; one we see from the south with a course line at half height.
        const s = Math.sign(d);
        const ny = ux * s;
        const lit = sideLight(-uy * s, ny);
        const tone = lit > 0.2 ? 'rock3' : lit > -0.2 ? 'rock2' : 'rock1';
        if (stage === 0) return lit > 0.2 ? 'rock2' : 'rock1';
        return ny > 0.5 && Math.abs(hit.z - H / 2) < 0.5 ? darker(tone) : tone;
      }
      if (hit.z > H + 0.5) return 'rock4';
      if (stage === 0) {
        // The footing: big blocks, joints across every 3 px of the world grid.
        return (ns ? Math.floor(hit.gy) : Math.floor(hit.gx)) % 3 === 0 ? 'rock2' : 'rock3';
      }
      // Half built: rammed earth in layers between the stone facings.
      if (stage === 1) return ad > TOP - 1 ? 'rock3' : (Math.floor(hit.gx) + Math.floor(hit.gy)) % 3 === 0 ? 'soil2' : 'soil3';
      return 'rock3';
    },
  };
}

/** The platform over the tile's centre the arms run into, finished a step over the walkway with corner merlons. */
function platform(stage) {
  const H = WALL_H[stage] + (stage === 2 ? 1 : 0);
  const edge = (v) => Math.abs(Math.abs(v - MID) - (PLAT - 0.5)) < 0.5;
  return {
    // Its rim never depends on which arms run into it, so every arm draws it alike.
    rim: 'self',
    keep: merlonTop,
    z(gx, gy) {
      if (Math.abs(gx - MID) > PLAT || Math.abs(gy - MID) > PLAT) return -Infinity;
      return stage === 2 && edge(gx) && edge(gy) ? H + 1 : H;
    },
    paint(hit) {
      if (hit.face) return Math.abs(hit.zf - H / 2) < 0.5 && stage > 0 ? 'rock1' : 'rock2';
      if (hit.z > H + 0.5) return 'rock4';
      if (stage === 1) return edge(hit.gx) || edge(hit.gy) ? 'rock3' : 'soil3';
      return 'rock3';
    },
  };
}

/** The side of an arm the scaffold stands on: the southern one, the western one for an arm running north–south. */
function scaffoldSide(dir) {
  const { ux, uy } = axes(dir);
  return Math.sign(ux || uy);
}

const onTile = (gx, gy) => gx >= 0 && gx < TW && gy >= 0 && gy < 16;

/**
 * Scaffold poles along the arm's southern (western) side, every POLE_EVERY px of the world grid, on the arm's own
 * tile: the neighbour's arm stands its own on the next tile.
 */
function poles(dir) {
  const { ux, uy, ns } = axes(dir);
  const s = scaffoldSide(dir);
  const out = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < TW; x++) {
      const rx = x + 0.5 - MID;
      const ry = y + 0.5 - MID;
      const t = rx * ux + ry * uy;
      const d = (-rx * uy + ry * ux) * s;
      if (t < PLAT - 0.5 || Math.abs(d - POLE_D - 0.5) > 0.5) continue;
      if ((((ns ? y : x) - 1) % POLE_EVERY + POLE_EVERY) % POLE_EVERY === 0) out.push(box(x, x + 1, y, y + 1, POLE_Z, 'soil3', 'bark2'));
    }
  }
  return out;
}

/** The ledger lashed along the poles; it floats, so it is drawn after the heightfield. */
function ledgers(t, dir) {
  const { ux, uy } = axes(dir);
  const s = scaffoldSide(dir);
  for (let a = PLAT; a < 16; a += 0.25) {
    const gx = MID + ux * a - uy * s * (POLE_D + 0.5);
    const gy = MID + uy * a + ux * s * (POLE_D + 0.5);
    if (onTile(gx, gy)) t.set(Math.floor(gx), Math.floor(gy - LEDGER_Z + TOY), P.c('bark2'));
  }
}

/**
 * Rubble while the footing is laid: low heaps of stone and spoil beside it, on the arm's own tile (they would
 * not match a neighbour's), lit from the upper left.
 */
function rubble(dir) {
  const { ux, uy } = axes(dir);
  const heaps = [];
  for (const [a, s, r] of [[4.5, 1, 1.6], [7, -1, 1.3]]) heaps.push({ x: MID + ux * a - uy * s * 5, y: MID + uy * a + ux * s * 5, r });
  return heaps.map((h, i) => ({
    rim: false,
    z(gx, gy) {
      if (!onTile(gx, gy)) return -Infinity;
      const q = Math.hypot(gx - h.x, (gy - h.y) * 1.3) / h.r;
      return q > 1 ? -Infinity : 1.5 * (1 - q * q) + 0.01;
    },
    paint(hit) {
      const lit = -(hit.gx - h.x) * 0.6 - (hit.gy - h.y) * 0.8;
      const stone = i === 0;
      if (lit > 0.4) return stone ? 'rock4' : 'soil3';
      if (lit > -0.6) return stone ? 'rock3' : 'soil2';
      return stone ? 'rock1' : 'soil1';
    },
  }));
}

function wallArm(f) {
  const dir = Math.floor(f / STAGES);
  const stage = f % STAGES;
  const prims = [band(dir, stage), platform(stage)];
  if (stage === 0) prims.push(...rubble(dir));
  if (stage === 1) prims.push(...poles(dir));
  const t = render(TW, TH, TOY, { base: flat, prims });
  if (stage === 1) ledgers(t, dir);
  return t;
}

/* ------------------------------------------------------------ the tower -- */

/** The watchtower: half width of its body, its battered foot one px wider, height and merlons by stage. */
const TOWER_R = 4;
const TOWER_H = [1, 6, 10];

/**
 * A square watchtower in the Ming manner over the tile's centre: battered brick walls, an arched opening between
 * two arrow slits in its south face, merlons round its roof and a lookout hut on it. Half built it is a hollow
 * shell in scaffolding, at first a footing with stones piled by it.
 */
function towerPrims(stage) {
  const H = TOWER_H[stage];
  const cheb = (gx, gy) => Math.max(Math.abs(gx - MID), Math.abs(gy - MID));
  const merlon = (gx, gy) => (Math.abs(gy - MID) > TOWER_R - 1 ? Math.floor(gx) : Math.floor(gy)) % 2 === 0;
  const body = {
    rim: 'self',
    keep: merlonTop,
    z(gx, gy) {
      const c = cheb(gx, gy);
      if (c > TOWER_R + 1) return -Infinity;
      if (c > TOWER_R) return H * (TOWER_R + 1 - c);
      if (stage === 1 && c < TOWER_R - 1) return 1;
      if (stage === 2 && c > TOWER_R - 1 && merlon(gx, gy)) return H + 1;
      return H;
    },
    paint(hit) {
      const c = cheb(hit.gx, hit.gy);
      if (stage === 1 && hit.z < 2 && c < TOWER_R - 1) return hit.face ? 'rock1' : 'rock0';
      if (hit.face || c > TOWER_R) {
        const dx = hit.gx - MID;
        const dy = hit.gy - MID;
        if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'rock3' : 'rock1';
        const z = hit.face ? hit.zf : hit.z;
        // The finished tower's south face: an arched opening between two arrow slits.
        const col = Math.floor(hit.gx);
        if (stage === 2 && (col === 7 || col === 8) && z > 4.5 && z < 7.5) return z > 7 ? 'rock1' : 'rock0';
        if (stage === 2 && (col === 5 || col === 10) && z > 5.5 && z < 7) return 'rock0';
        return Math.abs(z - H / 2) < 0.5 && stage > 0 && z < 5 ? 'rock1' : 'rock2';
      }
      if (hit.z > H + 0.5) return 'rock4';
      if (stage === 0) return Math.floor(hit.gx) % 4 === 0 || Math.floor(hit.gy) % 3 === 0 ? 'rock2' : 'rock3';
      return 'rock3';
    },
  };
  const prims = [body];
  if (stage === 2) prims.push(...lookout(H));
  if (stage === 1) {
    for (const [x, y] of [[2, 12], [13, 12], [2, 3], [13, 3]]) prims.push(box(x, x + 1, y, y + 1, H + 3, 'soil3', 'bark2'));
  }
  if (stage === 0) {
    prims.push(box(12, 14, 13, 14, 1, 'rock4', 'rock2'), box(2, 4, 12, 13, 1, 'rock4', 'rock2'), box(13, 15, 11, 12, 1, 'rock3', 'rock1'));
  }
  return prims;
}

/**
 * The lookout hut at the back of the finished tower's roof: brick walls under a low hipped roof of
 * grey tiles (a heightfield cannot overhang, so the roof keeps to the walls), its slopes lit by the way they face.
 */
const HUT = { x0: 6, x1: 10, y0: 4, y1: 7, wall: 1.5, roof: 1.5 };
function lookout(H) {
  const cx = (HUT.x0 + HUT.x1) / 2;
  const cy = (HUT.y0 + HUT.y1) / 2;
  const hx = (HUT.x1 - HUT.x0) / 2;
  const hy = (HUT.y1 - HUT.y0) / 2;
  return [{
    z(gx, gy) {
      const dx = Math.abs(gx - cx);
      const dy = Math.abs(gy - cy);
      if (dx > hx || dy > hy) return -Infinity;
      return H + HUT.wall + HUT.roof * Math.min(1, (hy - dy) / hy * 1.6, (hx - dx) / hy * 1.6);
    },
    paint(hit) {
      if (hit.face) return 'rock2';
      const dx = hit.gx - cx;
      const dy = hit.gy - cy;
      if (hx - Math.abs(dx) < hy - Math.abs(dy)) return dx < 0 ? 'rock3' : 'rock1';
      return dy > 0 ? 'rock2' : 'rock3';
    },
  }];
}

function wallTower(stage) {
  const t = render(TW, TH, TOY, { base: flat, prims: towerPrims(stage) });
  if (stage === 1) {
    // Ledgers across the front and back poles.
    for (let x = 3; x < 13; x++) {
      t.set(x, 12 - (TOWER_H[1] + 2) + TOY, P.c('bark2'));
      t.set(x, 3 - (TOWER_H[1] + 2) + TOY, P.c('bark2'));
    }
  }
  return t;
}

/* -------------------------------------------------------- the builders -- */

/**
 * Haulers dragging a block on a sledge eastwards, seen from the side like everything that rises off the map: a
 * pale stone block on its wooden runner, the rope from the runner's nose over the shoulders of three men leaning
 * hard into it, one step apart. Light falls on the block's top only, so the runtime may mirror it for a westward
 * haul.
 */
const CREW_KEY = { B: 'rock4', b: 'rock3', s: 'bark1', r: 'bark2', h: 'laterite2', k: 'white0', l: 'laterite1' };
const CREW_BASE = [
  '................',
  '................',
  '................',
  '................',
  'BBBB...r........',
  'bbbb..r.........',
  'bbbbs...........',
  'sssss...........',
];
/** Columns of the men's hips: shoulders and heads lean one and two columns ahead. */
const MEN = [7, 10, 13];
/** A stride in three steps, feet on the last row: apart, the back foot drawn in, together; the men a step apart. */
const STRIDE = [[-1, 1], [0, 1], [0]];

function crew(f) {
  const g = CREW_BASE.map((r) => r.split(''));
  MEN.forEach((x, i) => {
    g[3][x + 2] = 'h';
    g[4][x + 1] = 'h';
    g[5][x] = 'k';
    g[6][x] = 'l';
    for (const o of STRIDE[(f + i) % STRIDE.length]) g[7][x + o] = 'l';
    // The rope runs on over each man's shoulder to the next.
    if (i > 0) for (let xx = MEN[i - 1] + 2; xx < x + 1; xx++) if (g[4][xx] === '.') g[4][xx] = 'r';
  });
  return k.grid(g.map((r) => r.join('')), CREW_KEY);
}

module.exports = {
  sprites: {
    wonder_pyramids: pyramids,
    wonder_wall: wallArm,
    wonder_wall_tower: wallTower,
    wonder_crew: crew,
  },
  textures: {},
};
