/* =============================================================================
 * SimEarth 2.0 — the railway's trains
 * -----------------------------------------------------------------------------
 * Locomotive and cars of each era as solid bodies in 3D (u along the track,
 * v across it, z up), ray-marched in the map's 3/4 view: seen from the south
 * at 45°, a point z px up shows z px higher, so a car going east or west
 * shows its roof and south side, one going north or south its roof and an
 * end. Every direction is rendered from the same body and lit afresh from
 * the upper left (north-west and above), never rotated or flipped: roofs
 * lightest, west faces light, south faces mid, east faces darkest; a
 * selective outline, the material's dark rim on the lower right and a
 * skyline one step darker on the upper left.
 * A piece covers one track step: 16 px east–west and north–south, 16·√2 px
 * on the diagonals, where the body is stretched along the track so that
 * pieces one tile apart join with only their couplings between them.
 * Style: docs/ereignisse-2026-10/stil.md · contract: tools/fx/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');
const P = require('../terrain/palette');
const fx = require('./kit');

/** Travel directions in HAZARD_NX / HAZARD_NY order: NW N NE W E SW S SE. */
const DIRS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

/** Box and the track point in it (the box centre, where the map anchors the piece). */
const W = 24;
const H = 32;
const CX = 12;
const CY = 16;
/** Highest point of any body (px above the rail), the march step, and the plan footprint of every piece (half length in track units, half width). */
const Z_TOP = 9;
const STEP = 0.2;
const FOOT_U = 8.5;
const FOOT_V = 2.5;

/** Light from the north-west and above, in plan x (east), plan y (south), z (up). */
const LIGHT = (() => {
  const l = [-0.5, -0.35, 0.8];
  const n = Math.hypot(...l);
  return l.map((c) => c / n);
})();
/** Light → tone rank 0..4: east and south-east faces 0, south 1, south-west 2, west 3, tops 4. */
const RANK_CUTS = [-0.45, -0.1, 0.35, 0.7];

/**
 * Materials: five tones by light rank, the outline on the lower right
 * (`rim`) and on the upper left (`sky`).
 */
const MATS = {
  // The black engine: soot-dark sides, grey light on its tops, red and brass details.
  black: { tones: ['pine0', 'rock0', 'rock0', 'rock0', 'rock1'], rim: 'pine0', sky: 'rock0' },
  boiler: { tones: ['pine0', 'rock0', 'rock1', 'rock2', 'rock2'], rim: 'pine0', sky: 'rock0' },
  smokebox: { tones: ['pine0', 'pine0', 'rock0', 'rock0', 'rock1'], rim: 'pine0', sky: 'pine0' },
  red: { tones: ['red0', 'red1', 'red1', 'red1', 'red1'], rim: 'red0', sky: 'red0' },
  brass: { tones: ['straw0', 'straw1', 'straw1', 'yellow0', 'yellow0'], rim: 'straw0', sky: 'straw1' },
  steel: { tones: ['rock1', 'rock2', 'rock3', 'rock4', 'rock4'], rim: 'rock1', sky: 'rock2' },
  iron: { tones: ['pine0', 'pine0', 'rock0', 'rock0', 'rock1'], rim: 'pine0', sky: 'pine0' },
  coal: { tones: ['pine0', 'pine0', 'pine0', 'rock0', 'rock0'], rim: 'pine0', sky: 'pine0' },
  glint: { tones: ['rock1', 'rock1', 'rock2', 'rock2', 'rock3'], rim: 'rock1', sky: 'rock1' },
  cabglass: { tones: ['ice0', 'ice1', 'ice1', 'ice2', 'ice2'], rim: 'ice0', sky: 'ice0' },
  lamp: { tones: ['yellow0', 'yellow0', 'white0', 'white0', 'white0'], rim: 'yellow0', sky: 'yellow0' },
  // Wooden coaches: varnished teak under a tarred brown roof with a raised clerestory, windows catching the sky.
  wood: { tones: ['laterite0', 'laterite1', 'laterite2', 'laterite3', 'laterite3'], rim: 'laterite0', sky: 'laterite1' },
  roof: { tones: ['soil0', 'soil1', 'soil1', 'soil2', 'soil2'], rim: 'soil0', sky: 'soil1' },
  roofhi: { tones: ['soil1', 'soil2', 'soil2', 'soil3', 'soil3'], rim: 'soil1', sky: 'soil2' },
  pane: { tones: ['ice0', 'ice1', 'ice1', 'ice2', 'ice3'], rim: 'ice0', sky: 'ice1' },
  // The streamlined express: white with red, a dark window band.
  white: { tones: ['ice2', 'ice3', 'ice4', 'white0', 'white0'], rim: 'rock2', sky: 'ice3' },
  redband: { tones: ['red0', 'red1', 'red1', 'red1', 'red1'], rim: 'red0', sky: 'red0' },
  dark: { tones: ['pine0', 'rock0', 'rock0', 'rock1', 'rock1'], rim: 'pine0', sky: 'rock0' },
  screen: { tones: ['pine0', 'pine0', 'rock0', 'rock0', 'rock0'], rim: 'pine0', sky: 'pine0' },
  gangway: { tones: ['rock0', 'rock0', 'rock1', 'rock1', 'rock2'], rim: 'rock0', sky: 'rock0' },
  // The maglev: white-silver with a blue band, dark blue glass, hovering over its shadow.
  silver: { tones: ['ice2', 'ice3', 'ice4', 'white0', 'white0'], rim: 'rock2', sky: 'ice3' },
  blue: { tones: ['water1', 'water2', 'water3', 'water3', 'water4'], rim: 'water1', sky: 'water2' },
  blueglass: { tones: ['water0', 'water0', 'water1', 'water1', 'water2'], rim: 'water0', sky: 'water0' },
  shadow: { tones: ['rock0', 'rock0', 'rock0', 'rock0', 'rock0'], rim: 'rock0', sky: 'rock0' },
};

/* ------------------------------------------------------------ geometry -- */

/** Signed distance to a rounded rectangle of half sizes bx, by and corner radius r (< 0 inside). */
function sdRect(x, y, bx, by, r) {
  const qx = Math.abs(x) - bx + r;
  const qy = Math.abs(y) - by + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * A body along the track from u0 to u1 (track units: 1 = 1 px east–west):
 * its cross-section at u is a rectangle `prof` (or prof(u) for a nose) =
 * { a: half width, z0, z1, rt / rb: radius of the top / bottom corners }.
 */
function hull(u0, u1, prof, paint) {
  const fixed = typeof prof === 'function' ? null : prof;
  return {
    paint,
    d(u, v, z, s) {
      const p = fixed || prof(Math.min(u1, Math.max(u0, u)));
      const hz = (p.z1 - p.z0) / 2;
      const zc = (p.z0 + p.z1) / 2;
      const r = Math.min(z > zc ? p.rt || 0 : p.rb || 0, p.a, hz);
      const sec = sdRect(v, z - zc, p.a, hz, r);
      return Math.max(sec, (Math.abs(u - (u0 + u1) / 2) - (u1 - u0) / 2) * s);
    },
  };
}

/** An upright round post at (uc, vc) from z0 to z1, its top rounded by rt; round on the diagonals too. */
function post(uc, vc, r, z0, z1, rt, paint) {
  return {
    paint,
    d(u, v, z, s) {
      const rad = Math.hypot((u - uc) * s, v - vc);
      const hz = (z1 - z0) / 2;
      const zc = (z0 + z1) / 2;
      return sdRect(rad, z - zc, r, hz, z > zc ? Math.min(rt, r, hz) : 0);
    },
  };
}

/* --------------------------------------------------------- the renderer -- */

const rankOf = (light) => {
  let r = 0;
  while (r < RANK_CUTS.length && light > RANK_CUTS[r]) r++;
  return r;
};

/** Index of the part the point (u, v, z) lies in, the one whose surface is nearest if several; null outside all. */
function inside(parts, u, v, z, s) {
  let hit = null;
  let best = -Infinity;
  for (let i = 0; i < parts.length; i++) {
    const dd = parts[i].d(u, v, z, s);
    if (dd <= 0 && dd > best) { best = dd; hit = i; }
  }
  return hit;
}

/**
 * Ray-march `parts` travelling along DIRS[d]: per pixel the surface nearest
 * the viewer — the part, u (track units), v, z, the local normal nu, nv, nz,
 * `face` ('top', 'side', 'end') and the light on it. Only the stretch of the
 * ray over the piece's footprint is marched, in coarse steps, then the
 * surface is bisected.
 */
function trace(parts, d) {
  const [dx, dy] = DIRS[d];
  const s = Math.hypot(dx, dy);
  const ex = dx / s;
  const ey = dy / s;
  const e = 0.04;
  const hits = new Array(W * H).fill(null);
  // Along the ray v and u move linearly with z: dv/dz = ex, du/dz = ey (px).
  const span = (at0, slope, lim) => {
    if (Math.abs(slope) < 1e-9) return Math.abs(at0) <= lim ? [0, Z_TOP] : null;
    const z1 = (-lim - at0) / slope;
    const z2 = (lim - at0) / slope;
    return [Math.min(z1, z2), Math.max(z1, z2)];
  };
  for (let sy = 0; sy < H; sy++) {
    for (let sx = 0; sx < W; sx++) {
      const X = sx + 0.5 - CX;
      const Y0 = sy + 0.5 - CY;
      const sv = span(-X * ey + Y0 * ex, ex, FOOT_V);
      const su = span(X * ex + Y0 * ey, ey, FOOT_U * s);
      if (!sv || !su) continue;
      const zHi = Math.min(Z_TOP, sv[1], su[1]);
      const zLo = Math.max(0, sv[0], su[0]);
      if (zHi < zLo) continue;
      const at = (z) => {
        const Y = Y0 + z;
        return [(X * ex + Y * ey) / s, -X * ey + Y * ex];
      };
      let zIn = -1;
      const steps = Math.ceil((zHi - zLo) / STEP);
      for (let i = 0; i <= steps; i++) {
        const z = Math.max(zLo, zHi - i * STEP);
        const [u, v] = at(z);
        if (inside(parts, u, v, z, s) !== null) { zIn = z; break; }
      }
      if (zIn < 0) continue;
      let zOut = Math.min(zHi, zIn + STEP);
      for (let i = 0; i < 8; i++) {
        const zm = (zIn + zOut) / 2;
        const [u, v] = at(zm);
        if (inside(parts, u, v, zm, s) !== null) zIn = zm;
        else zOut = zm;
      }
      const [u, v] = at(zIn);
      const p = inside(parts, u, v, zIn, s);
      const part = parts[p];
      const z = zIn;
      const gu = (part.d(u + e / s, v, z, s) - part.d(u - e / s, v, z, s)) / (2 * e);
      const gv = (part.d(u, v + e, z, s) - part.d(u, v - e, z, s)) / (2 * e);
      const gz = (part.d(u, v, z + e, s) - part.d(u, v, z - e, s)) / (2 * e);
      const gl = Math.hypot(gu, gv, gz) || 1;
      const nu = gu / gl;
      const nv = gv / gl;
      const nz = gz / gl;
      const light = (nu * ex - nv * ey) * LIGHT[0] + (nu * ey + nv * ex) * LIGHT[1] + nz * LIGHT[2];
      const face = nz > 0.6 ? 'top' : Math.abs(nv) >= Math.abs(nu) ? 'side' : 'end';
      hits[sy * W + sx] = { p, u, v, z, nu, nv, nz, face, s, light };
    }
  }
  return hits;
}

/**
 * Paint traced hits: the material from the part's paint(h) (h also carries
 * the animation `frame`), the tone by the light; then the selective outline.
 */
function paint(parts, hits, frame) {
  const t = new k.Tex(W, H);
  const mat = new Array(W * H).fill(null);
  hits.forEach((h, i) => {
    if (!h) return;
    const m = MATS[parts[h.p].paint({ ...h, frame })];
    t.px[i] = P.c(m.tones[rankOf(h.light)]);
    mat[i] = m;
  });
  // Selective outline against the ground: the material's dark rim on the lower right; on the upper left the
  // skyline one step darker than the pixel was (a ramp of one colour takes the material's `sky`).
  const out = new k.Tex(W, H);
  out.px.set(t.px);
  const clear = (x, y) => t.get(x, y) === 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const m = mat[y * W + x];
      if (!m) continue;
      const v = t.get(x, y);
      if (clear(x + 1, y) || clear(x, y + 1)) out.set(x, y, P.c(m.rim));
      else if (clear(x - 1, y) || clear(x, y - 1)) out.set(x, y, P.shift(v, -1) !== v ? P.shift(v, -1) : P.c(m.sky));
    }
  }
  return out;
}

/* ------------------------------------------------------------- vehicles -- */

const side = (h) => h.face === 'side';
const end = (h) => h.face === 'end';
/** Whole pixel rows: a face shows each z band of integer height as that many rows, in every direction. */
const band = (h, z0, rows = 1) => h.z >= z0 && h.z < z0 + rows;
const disc = (h, uc, zc, r) => Math.hypot(h.u - uc, h.z - zc) <= r;

/** Couplings at the ends of a piece, filling the gap to the next one. */
const coupling = (u0, u1) => hull(u0, u1, { a: 0.5, z0: 0.8, z1: 1.8 }, () => 'iron');

/**
 * The black steam engine of the first lines across a continent (an
 * "American" 4-4-0) with its tender, front towards +u: a red cowcatcher, a
 * funnel stack with a red rim and a lantern in front, two big red drivers and
 * a small leading truck, a brass dome; each animation frame turns the drivers
 * a quarter and moves the coupling rod with them.
 */
function steamLoco() {
  const drivers = [-1.5, 2.5];
  const wheelZ = 1.5;
  const running = (h) => {
    // Rolling forward, the crank pin goes forward, down, back, up.
    const phase = (h.frame * Math.PI) / 2;
    const rodZ = wheelZ - Math.round(Math.sin(phase));
    const rodU = Math.round(Math.cos(phase));
    if (!side(h) || h.z > 3.0) return 'black';
    if (band(h, rodZ - 0.5) && h.u > drivers[0] + rodU - 0.5 && h.u < drivers[1] + rodU + 0.5) return 'steel';
    for (const uc of drivers) {
      if (Math.abs(h.u - uc) < 1.5) return Math.abs(h.u - uc) < 0.5 && band(h, wheelZ - 0.5) ? 'iron' : 'red';
    }
    if (h.z < 2.0 && (Math.abs(h.u - 4.5) < 1.0 || Math.abs(h.u - 6.5) < 0.5)) return 'red';
    return 'iron';
  };
  const stack = {
    // The open top of the funnel, its near lip red.
    paint: (h) => (h.face !== 'top' ? 'black' : h.v > -0.2 ? 'red' : 'smokebox'),
    d(u, v, z, s) {
      const r = z < 7.4 ? 0.5 : 0.5 + (z - 7.4) * 0.5;
      return Math.max(Math.hypot((u - 5.4) * s, v) - r, Math.abs(z - 6.8) - 1.8);
    },
  };
  return [
    // Frame with the drivers and the leading truck, the cowcatcher in front.
    hull(-4.4, 6.6, { a: 1.9, z0: 0.0, z1: 3.0 }, running),
    hull(6.4, 7.9, (u) => ({ a: 1.9 - (u - 6.4) * 0.6, z0: 0.0, z1: Math.max(0.6, 2.4 - (u - 6.4) * 1.2) }), () => 'red'),
    // Boiler and smokebox, the lantern on top in front; the boiler's two bands only going E or W, on a
    // diagonal a 1-px band breaks into loose pixels.
    hull(-1.6, 6.3, { a: 1.5, z0: 3.0, z1: 5.8, rt: 1.4, rb: 1.4 }, (h) => {
      if (h.u > 4.7) return 'smokebox';
      return h.s === 1 && (Math.abs(h.u - 0.0) < 0.5 || Math.abs(h.u - 3.5) < 0.5) ? 'glint' : 'boiler';
    }),
    hull(5.9, 6.7, { a: 0.6, z0: 5.0, z1: 6.4 }, (h) => (end(h) && h.u > 6.5 ? 'lamp' : 'brass')),
    stack,
    post(1.8, 0, 0.9, 5.2, 6.6, 0.9, () => 'brass'),
    // Cab with its windows, under a roof that overhangs a little.
    hull(-4.4, -1.6, { a: 2.0, z0: 3.0, z1: 6.6 }, (h) => {
      if (side(h) && band(h, 5) && h.u > -3.9 && h.u < -2.1) return 'cabglass';
      if (end(h) && h.u > -2 && band(h, 5) && Math.abs(h.v) > 0.7) return 'cabglass';
      return 'black';
    }),
    hull(-4.7, -1.3, { a: 2.2, z0: 6.4, z1: 7.1, rt: 0.6 }, () => 'smokebox'),
    // Tender: coal heaped on top, small red wheels, a red beam at the back.
    hull(-7.6, -4.4, { a: 1.9, z0: 0.0, z1: 4.0 }, (h) => {
      if (end(h) && h.u < -6 && h.z < 2.0) return 'red';
      if (side(h) && h.z < 2.0) return Math.abs(h.u + 6.5) < 1.0 || Math.abs(h.u + 5.0) < 0.5 ? 'red' : 'iron';
      return 'black';
    }),
    hull(-7.2, -4.8, { a: 1.5, z0: 3.4, z1: 4.9, rt: 1.0 }, (h) => (k.hash(Math.round(h.u), Math.round(h.v), 77) < 0.3 ? 'glint' : 'coal')),
    coupling(-8, -7.6),
  ];
}

/** A wooden coach of the steam railway: teak sides with a row of windows, a brown roof with its clerestory, dark bogies. */
function steamCar() {
  return [
    hull(-6.8, 6.8, { a: 1.9, z0: 0.0, z1: 1.3 }, (h) => (side(h) && [-5.2, -4.0, 4.0, 5.2].some((uc) => disc(h, uc, 0.6, 0.6)) ? 'steel' : 'iron')),
    hull(-7, 7, { a: 2.0, z0: 1.2, z1: 4.9 }, (h) => {
      if (side(h) && band(h, 3) && Math.abs(h.u) < 6.2 && Math.floor(h.u + 8) % 2 === 0) return 'pane';
      if (end(h) && Math.abs(h.v) < 0.7 && band(h, 3)) return 'pane';
      return 'wood';
    }),
    hull(-7.2, 7.2, { a: 2.15, z0: 4.8, z1: 5.4, rt: 0.6 }, () => 'roof'),
    hull(-6.2, 6.2, { a: 1.0, z0: 5.0, z1: 6.4, rt: 0.2 }, () => 'roofhi'),
    coupling(-8, -7),
    coupling(7, 8),
  ];
}

/** The streamlined express (Atomic age): rounded white body, a dark window band, a red stripe sweeping into a red-tipped bullet nose. */
const EXPRESS = { a: 2.0, z0: 0.8, z1: 5.0, rt: 1.2, rb: 0.3 };
function expressBody(nose) {
  const tip = 7.5;
  const along = (u) => (u - nose) / (tip - nose);
  const prof = (u) => {
    if (nose == null || u <= nose) return EXPRESS;
    const t = along(u);
    return { a: Math.max(0.6, 2.0 * (1 - t ** 3) ** 0.5), z0: 0.8, z1: 1.6 + 3.4 * (1 - t ** 1.6) ** 0.8, rt: 1.2, rb: 0.3 };
  };
  const paint = (h) => {
    if (nose != null && h.u > nose) {
      const t = along(h.u);
      if (t > 0.86) return 'redband';
      if (t > 0.32 && t < 0.56 && h.nz > 0.5 && Math.abs(h.v) < prof(h.u).a * 0.75) return 'screen';
    }
    if (h.face !== 'top' && band(h, 1)) return 'redband';
    // On a diagonal the window band takes two rows: one would break into a dotted line.
    if (side(h) && band(h, 3, h.s > 1 ? 2 : 1) && (nose == null || h.u < nose)) return 'dark';
    return 'white';
  };
  return [
    hull(-7, nose == null ? 7 : tip, prof, paint),
    hull(-6.6, nose == null ? 6.6 : 5.6, { a: 1.9, z0: 0.0, z1: 1.0 }, (h) => (side(h) && [-5.4, -4.2, 4.2, 5.4].some((uc) => disc(h, uc, 0.5, 0.5)) ? 'steel' : 'iron')),
    hull(-8, -6.8, { a: 1.5, z0: 1.0, z1: 4.4, rt: 0.6 }, () => 'gangway'),
  ];
}
const expressHead = () => [...expressBody(-0.5), post(-4.5, 0, 0.4, 4.6, 5.8, 0, () => 'steel')];
const expressCar = () => [...expressBody(null), hull(6.8, 8, { a: 1.5, z0: 1.0, z1: 4.4, rt: 0.6 }, () => 'gangway')];

/** The maglev (Information age on): low white-silver body hovering over its shadow, a blue band, a long wedge nose. */
const MAGLEV = { a: 2.0, z0: 1.2, z1: 4.6, rt: 1.2, rb: 0.4 };
function maglevBody(nose) {
  const tip = 7.7;
  const prof = (u) => {
    if (nose == null || u <= nose) return MAGLEV;
    const t = (u - nose) / (tip - nose);
    return { a: 2.0 * Math.sqrt(Math.max(0.05, 1 - t ** 2.5)), z0: 1.2, z1: 2.0 + 2.6 * (1 - t ** 1.4), rt: 1.2, rb: 0.4 };
  };
  // The blue band runs along both shoulders of the roof, so it shows from every side; the glass below it.
  const paint = (h) => {
    const p = prof(h.u);
    if (nose != null && h.u > nose) {
      const t = (h.u - nose) / (tip - nose);
      if (t > 0.18 && t < 0.42 && Math.abs(h.v) < p.a * 0.55 && h.face === 'top') return 'blueglass';
    }
    if (Math.abs(h.v) > p.a - 0.55 && h.z > p.z1 - 1.0) return 'blue';
    if (side(h) && band(h, 3) && (nose == null || h.u < nose - 0.5)) return 'blueglass';
    return 'silver';
  };
  return [
    hull(-7.7, nose == null ? 7.7 : tip, prof, paint),
    hull(-7.7, nose == null ? 7.7 : 6.5, { a: 2.0, z0: 0, z1: 0.3 }, () => 'shadow'),
  ];
}
const maglevHead = () => maglevBody(0.6);
const maglevCar = () => maglevBody(null);

/* ----------------------------------------------------------- the steam -- */

/** A puff of steam and coal smoke leaving the stack: grows, rises 2 px from the box centre and dissolves. */
const STEAM = ['rock3', 'rock4', 'ice4', 'white0'];
function steamPuff(f) {
  const t = new k.Tex(8, 8);
  const r = [1.9, 2.5, 3.0, 3.3, 3.4][f];
  const y = [4.6, 4.1, 3.6, 3.1, 2.7][f];
  const puffs = [{ x: 4, y, r }];
  if (f >= 2) puffs.push({ x: 3.0, y: y - 0.9, r: r * 0.65 });
  fx.billow(t, puffs, STEAM);
  return fx.dissolve(t, [0, 0, 0.1, 0.35, 0.6][f]);
}

/* -------------------------------------------------------------- recipes -- */

/** One directed piece: frames hold the 8 directions one after another, `per` frames each; a direction is traced once. */
function directed(model, per = 1) {
  const parts = model();
  const traced = [];
  return (i) => {
    const d = Math.floor(i / per);
    traced[d] = traced[d] || trace(parts, d);
    return paint(parts, traced[d], i % per);
  };
}

module.exports = {
  sprites: {
    train_steam_loco: directed(steamLoco, 4),
    train_steam_car: directed(steamCar),
    train_express_head: directed(expressHead),
    train_express_car: directed(expressCar),
    train_maglev_head: directed(maglevHead),
    train_maglev_car: directed(maglevCar),
    train_steam_puff: steamPuff,
  },
  textures: {},
  DIRS,
};
