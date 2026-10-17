/* =============================================================================
 * SimEarth 2.0 — earthquake art, and the ruins every disaster can leave
 * -----------------------------------------------------------------------------
 * A small dust puff (it grows, then breaks up), rubble over a damaged city,
 * the fissure — a flat decal in four directions, each as middle, end and
 * branched middle — and a ruin in three variants. Light from
 * the upper left. The fissure shows its offset: the raised side — north,
 * west, north-west, north-east, the side the simulation lifts
 * (src/hazardquake.ts) — has a lit lip of torn ground over a shadowed scarp
 * face, then the dark gap, then the lower side. Its gap meets the tile edges
 * at fixed rows, columns and diagonals, so the fissures of neighbouring tiles
 * join.
 * Style: docs/ereignisse-2026-10/stil.md · contract: tools/fx/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');
const P = require('../terrain/palette');
const fx = require('./kit');

/** Dust, darkest first: soil in the shadow, sand where the light catches it. */
const DUST = ['soil2', 'soil3', 'sand1', 'sand2', 'sand3'];

/* -------------------------------------------------------------- dust -- */

/** Billows of a dust puff by frame: it grows out of the ground, rises a little and thins out. */
const PUFFS = [
  [[7.6, 11.4, 2.3], [10, 12, 1.7]],
  [[7.4, 10.4, 3.2], [4.8, 11.8, 2.2], [10.6, 11.2, 2.6]],
  [[7.6, 9.2, 3.8], [4.2, 11, 2.6], [11.4, 10.6, 3], [9.6, 6.4, 2.6], [5.8, 7.2, 2.2]],
  [[7.6, 8.4, 4], [3.8, 10.4, 2.8], [11.8, 10, 3.1], [9.8, 5.6, 2.8], [5.4, 6.4, 2.4]],
  [[7.6, 7.6, 4.2], [3.4, 9.8, 2.9], [12.2, 9.4, 3.2], [10, 4.8, 2.9], [5, 5.6, 2.5]],
];
/** Share of each frame that has thinned away. */
const DUST_GONE = [0, 0, 0, 0.3, 0.6];

function dustPuff(f) {
  const t = new k.Tex(16, 16);
  fx.billow(t, PUFFS[f].map(([x, y, r]) => ({ x, y, r })), DUST, (x, y) => (k.hash(x, y, 811 + f) < 0.04 && y > 9 ? 'rock3' : null));
  // Young dust still sits on the ground it was kicked up from.
  if (f < 2) t.each((x, y) => (y > 13 ? 0 : undefined));
  // Falls apart in tufts: an ordered dither over 16 px read as a waffle net on the map.
  return fx.crumble(t, DUST_GONE[f], 817);
}

/* ------------------------------------------------------- stone parts -- */

/** A broken block of stone: lit top, front face, dark right edge and foot. */
function stone(t, x, y, w, h) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const right = xx === x + w - 1;
      const foot = yy === y + h - 1;
      let name = 'rock2';
      if (yy === y) name = right ? 'rock2' : 'rock4';
      else if (right || foot) name = 'rock0';
      else if (xx === x) name = 'rock3';
      t.set(xx, yy, P.c(name));
    }
  }
}

/** A beam from (x0, y0) to (x1, y1), two pixels thick: a lit upper edge, the shadowed underside, a cut end. */
function beam(t, x0, y0, x1, y1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let s = 0; s <= n; s++) {
    const x = Math.round(x0 + ((x1 - x0) * s) / n);
    const y = Math.round(y0 + ((y1 - y0) * s) / n);
    const end = s === n;
    t.set(x, y, P.c(end ? 'bark1' : 'bark2'));
    t.set(x, y + 1, P.c(end ? 'bark1' : 'bark0'));
  }
}

/**
 * A wall seen from the front, columns x0… standing on row `base`, each
 * `tops[c]` pixels high: the broken top lit where it steps up from the left,
 * a light left edge, a dark right edge, courses of stone in the face.
 * `holes` are [x, y, w, h] openings into the dark inside.
 */
function wall(t, x0, base, tops, holes = []) {
  const inHole = (x, y) => holes.some(([hx, hy, hw, hh]) => x >= hx && x < hx + hw && y >= hy && y < hy + hh);
  tops.forEach((h, c) => {
    const x = x0 + c;
    const top = base - h + 1;
    for (let y = top; y <= base; y++) {
      let name;
      if (inHole(x, y)) name = inHole(x - 1, y) && inHole(x, y - 1) ? 'rock0' : 'pine0';
      else if (y === top) name = c > 0 && tops[c - 1] > h ? 'rock3' : 'rock4';
      else if (c === tops.length - 1 || inHole(x + 1, y)) name = 'rock0';
      else if (c === 0 || inHole(x - 1, y)) name = 'rock3';
      else if (y === base || (base - y) % 3 === 2) name = 'rock1';
      else name = k.hash(x, y, 57) < 0.3 ? 'rock3' : 'rock2';
      t.set(x, y, P.c(name));
    }
  });
}

/**
 * A low heap of broken stone between columns x0 and x1 on row `base`, `h`
 * high in the middle: chunks of two by two, each lit on its upper left, in
 * courses offset like masonry, the heap's lower-right silhouette dark.
 */
function heap(t, x0, x1, base, h, seed) {
  const cx = (x0 + x1 + 1) / 2;
  const rx = (x1 - x0 + 1) / 2;
  const inside = (x, y) => {
    if (y > base || x < x0 || x > x1) return false;
    const dx = (x + 0.5 - cx) / rx;
    return base - y < h * (1 - dx * dx) + (k.hash(Math.floor(x / 2), 0, seed) < 0.5 ? 0.8 : 0);
  };
  const tones = ['rock1', 'rock2', 'rock3', 'rock4'];
  t.each((x, y) => {
    if (!inside(x, y)) return undefined;
    if (!inside(x + 1, y) || !inside(x, y + 1)) return P.c('rock0');
    const course = Math.floor((base - y) / 2);
    const shift = Math.floor(k.hash(course, 1, seed) * 2);
    const chunk = Math.floor((x + shift) / 2);
    const left = ((x + shift) & 1) === 0;
    const upper = ((base - y) & 1) === 1 || !inside(x, y - 1);
    const mid = 1 + Math.floor(k.hash(chunk, course, seed) * 2);
    const step = upper && left ? mid + 1 : !upper && !left ? mid - 1 : mid;
    return P.c(tones[Math.max(0, Math.min(3, step))]);
  });
}

/* ------------------------------------------------------------ rubble -- */

function rubble(f) {
  const t = new k.Tex(16, 16);
  heap(t, 1, 14, 15, 5, 71);
  beam(t, 2, 12, 8, 9);
  stone(t, 9, 9, 3, 3);
  stone(t, 3, 12, 3, 2);
  stone(t, 12, 12, 2, 2);
  beam(t, 7, 14, 13, 12);
  if (f === 1) {
    // A little dust still rising from it.
    const dust = new k.Tex(16, 16);
    fx.billow(dust, [{ x: 6, y: 8, r: 1.7 }, { x: 8.6, y: 6.8, r: 2 }, { x: 11.4, y: 8.4, r: 1.4 }], ['soil3', 'sand1', 'sand2', 'sand3']);
    dust.each((x, y) => (t.get(x, y) !== 0 ? 0 : undefined));
    t.stamp(dust, 0, 0);
  }
  return t;
}

/* ----------------------------------------------------------- fissure -- */

/*
 * A flat decal, centred on its tile. Frames: per direction (−, |, /, \, the
 * order of ScarKind.FissureH/V/D1/D2) a middle piece, an end piece and a
 * branched middle. Every pixel is a function of its place along the line
 * (s, 0..1 from one tile edge to the other) and across it (d, growing
 * towards the lower side), so the pieces of neighbouring tiles meet pixel
 * for pixel: the line wanders only in the middle of the tile and crosses
 * the tile edges at fixed rows, columns or diagonals.
 *
 * The end piece is a lens: the middle piece shifted along the line by half
 * a tile, full at its centre and tapering to a hairline towards both sides.
 * src/fxscars.ts draws it centred on the tile edge where the line stops, so
 * its outer half is the tapering tip in the end tile and its inner half lies
 * exactly over the neighbour's middle piece — pixel for pixel the same or
 * left out, never a different colour. One frame thus serves both ends of a
 * line without mirroring; an isolated tile gets the lens on its centre.
 */

/**
 * Per direction: along (s) and across (d) of a pixel, the length of a tile in
 * steps along (for hashes), and the rows across the line by d: crumbs on the
 * raised side, its lit lip, its scarp face (shadowed where it faces away from
 * the light), the gap (two rows), shadowed crumbs on the lower side. The
 * diagonals step 0.7 px per row across, so their lip and face are a row
 * wider. The raised side matches RISE_X/RISE_Y in src/hazardquake.ts.
 */
const LINES = [
  { // − rises north; the scarp faces south, half lit.
    s: (x) => (x + 0.5) / 16, d: (x, y) => y - 7, len: 16, wave: 1,
    rows: { [-3]: 'crumb', [-2]: 'lip', [-1]: 'soil1', 0: 'gap', 1: 'gap', 2: 'shade' },
  },
  { // | rises west; the scarp faces east, into the shadow.
    s: (x, y) => (y + 0.5) / 16, d: (x) => x - 7, len: 16, wave: -1,
    rows: { [-3]: 'crumb', [-2]: 'lip', [-1]: 'soil0', 0: 'gap', 1: 'gap', 2: 'shade' },
  },
  { // / rises north-west; the scarp faces south-east, the darkest side.
    s: (x, y) => (x - y + 16) / 32, d: (x, y) => x + y - 15, len: 32, wave: 1,
    rows: { [-4]: 'crumb', [-3]: 'lip', [-2]: 'soil1', [-1]: 'soil0', 0: 'gap', 1: 'gap', 2: 'gap', 3: 'shade' },
  },
  { // \ rises north-east; the scarp faces south-west, half lit, its lip catches less light.
    s: (x, y) => (x + y + 1) / 32, d: (x, y) => y - x, len: 32, wave: -1,
    rows: { [-4]: 'crumb', [-3]: 'lipDim', [-2]: 'soil2', [-1]: 'soil1', 0: 'gap', 1: 'gap', 2: 'gap', 3: 'shade' },
  },
];

/**
 * How far from the lens centre (0 centre, 1 its edge) each kind of row
 * lasts: the offset dies out before the crack, the crack ends in a hairline.
 */
const LASTS = { crumb: 0.25, shade: 0.3, lip: 0.45, lipDim: 0.45, outerFace: 0.55, face: 0.65, gap1: 0.75, gap0: 0.92 };

/** Across offset of the line's centre at s: a pixel's wander in the middle, none at the tile edges. */
function wander(line, s) {
  return Math.round(line.wave * 0.9 * Math.sin(2 * Math.PI * s) + 0.55 * Math.sin(4 * Math.PI * s));
}

/**
 * Palette name of the crack at s (the middle piece's along) and d across,
 * with the taper `t` (0 = full), or null. Hashes key on the step along, so
 * the lens and the middle piece agree.
 */
function crackAt(f, s, dRaw, t) {
  const line = LINES[f];
  const d = dRaw - wander(line, s);
  const row = line.rows[d];
  if (!row) return null;
  const step = Math.round(s * line.len - 0.5) % line.len;
  const h = k.hash(step, d, 401 + f);
  const last = row === 'gap' ? (d === 0 ? LASTS.gap0 : LASTS.gap1)
    : row.startsWith('soil') ? (line.rows[d + 1]?.startsWith('soil') ? LASTS.outerFace : LASTS.face)
    : LASTS[row];
  if (t > last) return null;
  switch (row) {
    case 'gap': return 'pine0';
    case 'shade': return h < 0.5 ? 'soil0' : null;
    case 'crumb': return h < 0.12 ? 'sand2' : h < 0.3 ? 'soil2' : null;
    case 'lip': return h < 0.1 ? null : h < 0.38 ? 'sand2' : 'soil3';
    case 'lipDim': return h < 0.1 ? null : h < 0.35 ? 'soil3' : 'soil2';
    default: return h < 0.2 ? `soil${Number(row[4]) + 1}` : row;
  }
}

/**
 * A branch of the branched middle, in pixel steps from where it leaves the
 * line: towards the lower side (a hairline crack that runs on, darkest at
 * its root), and a short one into the raised side, through the lip only.
 */
const TWIGS = [
  { low: [[1, 1], [0, 1], [1, 1], [1, 0]], high: [[1, -1], [0, -1]] },
  { low: [[1, 1], [1, 0], [1, 1], [1, 0]], high: [[-1, 1], [-1, 0]] },
  { low: [[1, 0], [0, 1], [1, 1], [0, 1]], high: [[-1, 0], [0, -1]] },
  { low: [[-1, 0], [0, 1], [-1, 1], [0, 1]], high: [[0, -1], [1, 0]] },
];

/** The pixel nearest to s0 along on row d across, or null. */
function pixelAt(f, s0, dRow) {
  const line = LINES[f];
  let best = null;
  let bestOff = Infinity;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const s = line.s(x, y);
      if (line.d(x, y) - wander(line, s) !== dRow) continue;
      const off = Math.abs(s - s0);
      if (off < bestOff) { bestOff = off; best = [x, y]; }
    }
  }
  return best;
}

/**
 * Lay a twig from (x, y), step by step, within the tile's inner 14×14. It
 * only covers empty pixels and the lower crumbs, so it stays out of the end
 * lens's way: the lens shows no crumbs, lip or face this close to its tips.
 */
const OVER = ['soil0', 'soil2', 'soil3', 'sand2'].map((n) => P.c(n));

function twig(t, start, steps, tones) {
  let [x, y] = start;
  steps.forEach(([dx, dy], n) => {
    x += dx;
    y += dy;
    if (x < 1 || y < 1 || x > 14 || y > 14) return;
    const v = t.get(x, y);
    if (v !== 0 && !OVER.includes(v)) return;
    t.set(x, y, P.c(tones[Math.min(tones.length - 1, n)]));
  });
}

function fissure(frame) {
  const f = Math.floor(frame / 3);
  const piece = frame % 3;
  const line = LINES[f];
  const t = new k.Tex(16, 16);
  t.each((x, y) => {
    const s = line.s(x, y);
    const lens = piece === 1;
    const name = crackAt(f, lens ? (s + 0.5) % 1 : s, line.d(x, y), lens ? Math.abs(s - 0.5) * 2 : 0);
    return name ? P.c(name) : undefined;
  });
  if (piece === 2) {
    const gapLast = Math.max(...Object.keys(line.rows).filter((d) => line.rows[d] === 'gap').map(Number));
    const lipRow = Number(Object.keys(line.rows).find((d) => line.rows[d].startsWith('lip')));
    const low = pixelAt(f, 0.42, gapLast);
    const high = pixelAt(f, 0.6, lipRow + 1);
    if (low) twig(t, low, TWIGS[f].low, ['pine0', 'pine0', 'soil0', 'soil0']);
    if (high) twig(t, high, TWIGS[f].high, ['pine0', 'soil0']);
  }
  return t;
}

/* -------------------------------------------------------------- ruin -- */

/** Variant 0: the back wall of a house with its doorway, a low front wall, a beam fallen between them. */
function ruinDoor(t) {
  wall(t, 1, 15, [7, 8, 8, 7, 7, 6, 4], [[3, 10, 2, 6]]);
  wall(t, 9, 18, [4, 5, 4, 3, 2], []);
  heap(t, 4, 11, 19, 3, 13);
  beam(t, 6, 11, 11, 16);
  stone(t, 1, 17, 3, 3);
  stone(t, 13, 17, 2, 2);
}

/** Variant 1: a corner — a back wall with a window, the stump of its side wall, rubble in front. */
function ruinCorner(t) {
  wall(t, 6, 14, [6, 7, 7, 6, 5, 5, 3], [[9, 10, 2, 2]]);
  wall(t, 3, 17, [8, 9, 6], []);
  heap(t, 5, 15, 19, 4, 29);
  stone(t, 0, 17, 3, 3);
  stone(t, 11, 16, 3, 2);
}

/** Variant 2: a tall wall broken off at its top, with a window, a low wall stub, a beam fallen across the rubble. */
function ruinGable(t) {
  wall(t, 2, 16, [10, 12, 11, 11, 9, 9, 6, 5], [[5, 9, 2, 3]]);
  wall(t, 11, 18, [3, 4, 3, 2], []);
  heap(t, 1, 12, 19, 2, 47);
  beam(t, 4, 17, 12, 15);
  stone(t, 12, 17, 3, 3);
}

function ruin(f) {
  const t = new k.Tex(16, 20);
  [ruinDoor, ruinCorner, ruinGable][f](t);
  return t;
}

module.exports = {
  sprites: { dust_puff: dustPuff, rubble, fissure, ruin },
  textures: {},
};
