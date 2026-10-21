/* =============================================================================
 * SimEarth 2.0 — oil well in the desert
 * -----------------------------------------------------------------------------
 * A lattice steel drilling derrick (tapering tower, cross bracing, crown block
 * with a work lamp) behind a pumpjack (skid, samson post, walking beam with
 * the horse head over the well, gearbox with crank and counterweight), on a
 * patch of oil-stained sand. Frames 0–7: one stroke — the crank turns once,
 * the pitman arm rocks the beam about the samson post, the horse head sinks
 * and rises and the polished rod slides in the stuffing box. Frame 8: shut
 * down — the counterweight hangs at the bottom, the lamp is dark, the oil at
 * the well has dried.
 * What moves is red, what stands is grey steel. Light from the upper left.
 * Style: docs/ereignisse-2026-10/stil.md · contract: tools/fx/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');
const P = require('../terrain/palette');

const W = 32;
const H = 32;

/* ---------------------------------------------------------------- layout -- */

/** Derrick: left foot column and foot row. */
const DX = 3;
const DFOOT = 24;

/** Pixel of the walking beam's top row over the samson post; the beam is two rows thick. */
const PX = 22;
const PY = 19;
/** Beam from the pivot to the horse head, and to the equalizer at the rear (px). */
const FRONT = 5;
const REAR = 5;
/** Radius of the horse head's face about the pivot, so its front stays over the well as the beam rocks. */
const HEAD_R = 6.55;
/**
 * The horse head in the beam's frame (u from the pivot along the beam, v down from its centre line): a lip
 * above the beam, the face an arc about the pivot, curling back under itself to a tip below the beam.
 */
const HEAD = [
  [HEAD_R - 4.3, -1.5], [HEAD_R - 0.7, -1.5],
  ...[-0.18, -0.06, 0.07, 0.2, 0.31, 0.4].map((a) => [HEAD_R * Math.cos(a), HEAD_R * Math.sin(a)]),
  [HEAD_R - 1.1, 3.0], [HEAD_R - 2.1, 3.45], [HEAD_R - 2.9, 3.2], [HEAD_R - 2.8, 2.0], [HEAD_R - 3.6, 1.0], [HEAD_R - 4.3, 1.0],
];
/** Crank shaft on the gearbox; the crank pin's radius sets the stroke (the beam rocks about ±25°). */
const CRANK = { x: 17, y: 25 };
const CRANK_R = 2.1;
/** Column of the bridle and polished rod, row of the carrier bar with the beam level, top of the stuffing box. */
const ROD_X = PX + 7;
const CARRIER_Y = PY + 4;
const STUFFING_Y = 28;

/* --------------------------------------------------------------- helpers -- */

/** Plot a 1-px line; `name` is a palette name or (x, y) => name | null. */
function line(t, x0, y0, x1, y1, name) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let s = 0; s <= n; s++) {
    const x = n === 0 ? x0 : Math.round(x0 + ((x1 - x0) * s) / n);
    const y = n === 0 ? y0 : Math.round(y0 + ((y1 - y0) * s) / n);
    const c = typeof name === 'function' ? name(x, y) : name;
    if (c) t.set(x, y, P.c(c));
  }
}

/** Point-in-polygon (even-odd). */
function inPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Fill a shape given as inside(x, y): body `mid`, lower-right edge `dark`, upper-left edge `lit` (if any). */
function solid(t, inside, dark, mid, lit = null) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inside(x, y)) continue;
      let c = mid;
      if (!inside(x + 1, y) || !inside(x, y + 1)) c = dark;
      else if (lit && (!inside(x - 1, y) || !inside(x, y - 1))) c = lit;
      t.set(x, y, P.c(c));
    }
  }
}

/* ---------------------------------------------------------------- ground -- */

/** Oil-stained sand under the rig, a flat patch, and a puddle of oil at the well that dries up once it stops. */
function stain(t, running) {
  const blobs = [[DX + 5.5, DFOOT + 1, 6.5, 1.5], [21.5, 29.8, 10.5, 2.1]];
  const inPatch = (x, y) => blobs.some(([cx, cy, rx, ry]) => {
    const dx = (x + 0.5 - cx) / rx;
    const dy = (y + 0.5 - cy) / ry;
    return dx * dx + dy * dy < 1 - k.hash(x, y, 1301) * 0.3;
  });
  t.each((x, y) => {
    const ox = (x + 0.5 - ROD_X) / 2.4;
    const oy = (y + 0.5 - 31) / 1.4;
    const oil = ox * ox + oy * oy;
    if (oil < 0.45) return P.c(running ? 'soil0' : 'soil1');
    if (oil < 1) return P.c(running ? 'soil1' : 'sand0');
    return inPatch(x, y) ? P.c('sand1') : undefined;
  });
}

/* --------------------------------------------------------------- derrick -- */

/**
 * The derrick's front face, drawn by hand: the legs step in at every girt, so the tower tapers in sections, each
 * braced by a 45° cross. Lit leg on the left, shadowed leg on the right, girts and bracing in between; the crown
 * block on a platform at the top, the lamp `*` above it.
 */
const DERRICK = [
  '.....*.....',
  '....gkK....',
  '...ggggK...',
  '....L.D....',
  '....L.D....',
  '....L.D....',
  '...LkkkD...',
  '...Lk.kD...',
  '...L.k.D...',
  '...Lk.kD...',
  '..LkkkkkD..',
  '..Lk...kD..',
  '..L.k.k.D..',
  '..L..k..D..',
  '..L.k.k.D..',
  '..Lk...kD..',
  '.LkkkkkkkD.',
  '.Lk.....kD.',
  '.L.k...k.D.',
  '.L..k.k..D.',
  '.L...k...D.',
  '.L..k.k..D.',
  '.L.k...k.D.',
  '.Lk.....kD.',
  'LkkkkkkkkkD',
];
const STEEL = { L: 'rock2', g: 'rock2', k: 'rock1', D: 'rock0', K: 'rock0' };

function derrick(t, lamp) {
  t.stamp(k.grid(DERRICK, { ...STEEL, '*': lamp ? 'yellow0' : 'rock1' }), DX, DFOOT + 1 - DERRICK.length);
}

/* -------------------------------------------------------------- pumpjack -- */

/** Skid, samson post, gearbox and wellhead: the parts that stand still. */
function pumpBase(t) {
  line(t, 14, 29, 26, 29, 'rock2');
  line(t, 14, 30, 26, 30, 'rock0');
  // Samson post: an A-frame under the pivot, braced halfway.
  line(t, PX - 2, 28, PX, PY + 2, 'rock2');
  line(t, PX + 2, 28, PX, PY + 2, 'rock0');
  line(t, PX - 1, 25, PX + 1, 25, 'rock1');
  // Gearbox, rounded at the top, the crank shaft at its middle.
  solid(t, (x, y) => x >= CRANK.x - 2 && x <= CRANK.x + 2 && y >= 23 && y <= 28 && !(y === 23 && Math.abs(x - CRANK.x) === 2), 'rock0', 'rock2', 'rock3');
  // Wellhead: a tee on the oil spot, the stuffing box on top.
  line(t, ROD_X - 1, 29, ROD_X + 1, 29, (x) => (x === ROD_X + 1 ? 'rock0' : 'rock2'));
  line(t, ROD_X - 1, 30, ROD_X + 1, 30, 'rock0');
  t.set(ROD_X, STUFFING_Y, P.c('rock1'));
}

/** The moving parts at crank angle `phi` (clockwise from the right); a running rod glistens with oil. */
function pumpjack(t, phi, running) {
  // The pin's height sets the rear end's; the beam turns about the pivot (clockwise positive: head down).
  const th = -Math.asin((CRANK_R * Math.sin(phi)) / REAR);
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  const front = { x: PX + FRONT, y: PY + Math.round(FRONT * sin) };
  const rear = { x: PX - REAR, y: PY - Math.round(REAR * sin) };
  const head = (x, y) => {
    const dx = x - PX;
    const dy = y - PY - 0.5;
    return inPoly(HEAD, dx * cos + dy * sin, -dx * sin + dy * cos);
  };
  // The bridle leaves the face at its front and hangs plumb; the carrier bar follows the face's arc.
  const faceY = Math.round(PY + 0.5 + HEAD_R * sin);
  const carrier = Math.round(CARRIER_Y + HEAD_R * th);
  for (let y = carrier + 1; y < STUFFING_Y; y++) t.set(ROD_X, y, P.c(running ? 'rock4' : 'rock2'));
  // Beam and head, one red body.
  line(t, rear.x, rear.y, front.x, front.y, 'red1');
  line(t, rear.x, rear.y + 1, front.x, front.y + 1, 'red0');
  solid(t, head, 'red0', 'red1');
  line(t, ROD_X, faceY, ROD_X, carrier - 1, 'rock0');
  // The carrier bar, its left end left out where it would run into the head's tip.
  const tip = P.RAMP_OF[t.get(ROD_X - 2, carrier)] === 'red';
  line(t, ROD_X - (tip ? 0 : 1), carrier, ROD_X + 1, carrier, (x) => (x === ROD_X + 1 ? 'rock0' : 'rock1'));
  t.set(PX, PY + 1, P.c('rock2'));
  // Pitman arm from the crank pin up to the rear end; the counterweight on the crank, in front of the gearbox.
  const pin = { x: CRANK.x + 0.5 + CRANK_R * Math.cos(phi), y: CRANK.y + 0.5 + CRANK_R * Math.sin(phi) };
  line(t, Math.floor(pin.x), Math.floor(pin.y), rear.x, rear.y + 2, 'rock0');
  solid(t, (x, y) => Math.hypot(x + 0.5 - pin.x, y + 0.5 - pin.y) < 1.75, 'red0', 'red1');
  t.set(CRANK.x, CRANK.y, P.c('rock0'));
}

/* ---------------------------------------------------------------- frames -- */

function oilDerrick(f) {
  const t = new k.Tex(W, H);
  const running = f < 8;
  stain(t, running);
  derrick(t, running);
  pumpBase(t);
  // Working: the crank turns once in 8 frames, the beam level at frame 0. Shut down: the counterweight hangs low,
  // the lamp is dark, the rod dry, the puddle soaked away.
  pumpjack(t, running ? (2 * Math.PI * f) / 8 : Math.PI / 2, running);
  return t;
}

module.exports = {
  sprites: { oil_derrick: oilDerrick },
  textures: {},
};
