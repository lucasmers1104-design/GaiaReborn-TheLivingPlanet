/* =============================================================================
 * SimEarth 2.0 — the tornado and the debris it lifts (family `twister`)
 * -----------------------------------------------------------------------------
 * The tornado a hurricane spins off at landfall, seen from the side like
 * everything upright on the map: a dark, ragged storm base, a wall cloud
 * lowered from it, a funnel narrowing from there to a rope on the ground,
 * and a churning collar of dust and debris round its foot. The debris
 * (clods, rocks, branches, planks) is a sprite of its own: the runtime
 * orbits it round the funnel and flings it away.
 *
 * Funnel and wall cloud are one surface of revolution lit from the upper
 * left. Its striations are a helix: they lie diagonally ("/") and travel
 * round the front by 1 px of arc a frame, 8 px apart, so the funnel turns
 * (faster where it is narrow) and its bands seem to climb; after 8 frames
 * the pattern is back where it started. Dust puffs ride rings round the
 * foot and move on by whole puff spacings over the loop, flung clods run
 * evenly spaced paths, and the sway and the swelling billows are sines of
 * the loop phase, so the loop closes.
 * Style: docs/ereignisse-2026-10/stil.md · contract: tools/fx/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');
const P = require('../terrain/palette');

const W = 32;
const H = 64;
const FRAMES = 8;
/** Row where the funnel leaves the wall cloud, and the ground row. */
const TOP = 13;
const GROUND = H - 1;
/** First row of the flare the funnel widens into under the storm base. */
const FLARE = 7;
/** Px of arc between two striations; they move 1 px a frame, so 8 frames close the loop. */
const STRIPE = 8;
/** Rows a striation climbs per px it moves round: the slant of the helix. */
const TILT = 0.9;

/** Funnel tones, dark to light, and the dust that climbs its foot step for step. */
const GREY = ['pine0', 'rock0', 'rock1', 'rock2', 'rock3', 'rock4'];
const DUSTY = ['soil0', 'soil0', 'soil1', 'soil2', 'soil3', 'rock3'];

const frac = (v) => v - Math.floor(v);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * The funnel at row y in frame f: centre x and half width. Under the storm
 * base it flares into the wall cloud, whose lip bulges at row 11; below TOP
 * it narrows to the rope. A standing S (upper part left, lower part right)
 * with a small wave running down it; the cloud end and the foot stay put,
 * the foot centred on x 16.
 */
function funnelAt(y, f) {
  const p = clamp((y - TOP) / (GROUND - TOP), 0, 1);
  const phase = (f / FRAMES) * Math.PI * 2;
  const bell = Math.sin(Math.PI * p);
  const cx = 16 - 1.5 * Math.sin(Math.PI * 2 * p) * bell + 0.8 * bell * Math.sin(phase - p * 5);
  const flare = 3.5 * Math.pow(clamp((TOP - 1 - y) / (TOP - 1 - FLARE), 0, 1), 2);
  const lip = 1.3 * Math.exp(-(((y - 11) / 1.6) ** 2));
  const half = 2.2 + 6.4 * Math.pow(1 - p, 2.8) + flare + lip;
  return { cx, half, p };
}

/** Light of a striation phase g (0..1): a dark band, its soft trail, then a light band. */
function stripeLight(g) {
  if (g < 0.22) return -1;
  if (g < 0.36) return -0.45;
  if (g > 0.58 && g < 0.76) return 0.7;
  return 0;
}

/**
 * A union of round puffs ({ x, y, r }) kept where `keep(x, y)` holds,
 * coloured by `tone(x, y, nx, ny, edge, puff)`: n is the normal in the puff
 * the pixel lies deepest in, edge 1 on the lower-right silhouette, -1 on
 * the upper-left one, 0 inside.
 */
function mass(puffs, keep, tone) {
  const t = new k.Tex(W, H);
  const hit = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H || !keep(x, y)) return null;
    let best = null;
    let bestD = 0;
    for (const p of puffs) {
      const dx = x + 0.5 - p.x;
      const dy = y + 0.5 - p.y;
      const d = 1 - Math.hypot(dx, dy) / p.r;
      if (d > bestD) { bestD = d; best = { nx: dx / p.r, ny: dy / p.r, p }; }
    }
    return best;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const h = hit(x, y);
      if (!h) continue;
      const edge = !hit(x + 1, y) || !hit(x, y + 1) || !hit(x + 1, y + 1) ? 1 : !hit(x - 1, y) || !hit(x, y - 1) ? -1 : 0;
      const name = tone(x, y, h.nx, h.ny, edge, h.p);
      if (name) t.set(x, y, P.c(name));
    }
  }
  return t;
}

/**
 * Puffs riding an elliptic ring round x `cx`, moving on by `laps` puff
 * spacings over the loop. Size goes by place on the ring, never by puff
 * (the near side swells), so the loop closes; `near` marks the near half.
 */
function ring(out, f, cx, n, y, rx, ry, r, off, laps = 1) {
  for (let i = 0; i < n; i++) {
    const a = ((i + (f / FRAMES) * laps) / n) * Math.PI * 2 + off;
    const s = Math.sin(a);
    out.push({ x: cx + Math.cos(a) * rx, y: y + s * ry, r: r * (1 + 0.12 * s + 0.1 * Math.sin(a * 2 + off)), near: s > 0 });
  }
  return out;
}

/* --------------------------------------------------------------- cloud -- */

/** Billows of the storm base: x, y, r — highest over the funnel, blunt ends. */
const BASE_PUFFS = [
  [3, 7.6, 2.4], [6.6, 6.4, 3.2], [11, 5, 4.2], [16.5, 4.4, 4.6], [22.4, 5.4, 4], [27.4, 6.8, 3], [30, 8, 2],
  [5, 5, 2], [9.6, 3, 2.6], [14.6, 2.4, 2.6], [19.6, 2.6, 2.8], [25, 4.6, 2.2],
  [11, 8, 3.4], [16, 8, 3.4], [21, 8, 3.4], [4.5, 8.2, 2.2], [28, 8.4, 2],
];
/** Clumps the base's top breaks into: the storm goes on above the box, so it frays upwards. */
const CLOUD_FRAY = k.fbm(32, 8, 2, 271);

/** Underside of the storm base at column x: level, lifting a little at the ends. */
const cloudBottom = (x) => 9.8 - Math.max(0, Math.abs(x + 0.5 - 16) - 10) * 0.6;

/**
 * The storm base: dark billows swelling in turn, lit on their upper left,
 * cut flat underneath with a dark underside, fraying upwards. Scud teeth
 * hang from the underside and run round with the funnel (1 px a frame,
 * 8 apart). Drawn over the top of the funnel's flare.
 */
function drawCloud(t, f) {
  const phase = (f / FRAMES) * Math.PI * 2;
  const base = BASE_PUFFS.map(([x, y, r], i) => ({ x, y, r: r * (1 + 0.07 * Math.sin(phase + i * 1.7)) }));
  const scud = (x, y) => (Math.abs(x + 0.5 - 16) < 10 && frac((x - f + (y & 1) * 3) / STRIPE) < 0.35 ? 1.3 : 0);
  const keep = (x, y) => y + 0.5 < cloudBottom(x) + scud(x, y) && CLOUD_FRAY(x, y) > Math.max(0, (2 - y) / 2) * 0.6;
  t.stamp(mass(base, keep, (x, y, nx, ny, edge) => {
    const under = cloudBottom(x) - (y + 0.5);
    if (under < 1 || edge === 1) return 'pine0';
    if (edge === -1) return ny < -0.3 && nx < 0.4 ? 'rock2' : 'rock1';
    const light = -(nx * 0.6 + ny * 0.8) + (k.hash(x, y, 917) - 0.5) * 0.25 - (under < 2.5 ? 0.8 : 0);
    return light > 0.5 ? 'rock2' : light > -0.1 ? 'rock1' : light > -0.7 ? 'rock0' : 'pine0';
  }), 0, 0);
}

/* -------------------------------------------------------------- funnel -- */

/**
 * Wall cloud and funnel, row by row: a cylinder lit from the upper left,
 * banded by the helix, darker where it faces down (the wall cloud's
 * underside) and where it hangs in the storm's shadow. Its outline bulges
 * where a band meets it, and dust climbs the lower funnel along the bands.
 */
function drawFunnel(t, f) {
  const grey = GREY.map((n) => P.c(n));
  const dusty = DUSTY.map((n) => P.c(n));
  for (let y = FLARE; y <= GROUND; y++) {
    const { cx, half, p } = funnelAt(y, f);
    // Facing down: the funnel narrows below this row. In shade: high up under the storm.
    const down = clamp((half - funnelAt(y + 1, f).half) * 0.5, 0, 0.8);
    const shade = clamp((TOP + 2 - y) / 7, 0, 1);
    const bulge = (side) => {
      const a = side * (Math.PI / 2) * half + TILT * y + f;
      const s = stripeLight(frac(a / STRIPE));
      return (s < 0 ? 0.7 : s > 0 ? -0.3 : 0.1) + (k.hash(Math.floor(a) & 7, y, 57 + side) - 0.5) * 0.9;
    };
    const left = cx - half - bulge(-1);
    const right = cx + half + bulge(1);
    for (let x = 0; x < W; x++) {
      const px = x + 0.5;
      if (px < left || px > right) continue;
      const u = clamp((px - cx) / half, -1, 1);
      const a = Math.asin(u) * half + TILT * y + f;
      const g = frac(a / STRIPE);
      const grain = (k.hash(Math.floor(a) & 7, y >> 1, 41) - 0.5) * 0.2;
      const light = -0.9 * u + stripeLight(g) * 0.75 + grain - shade * 0.55 - down;
      let step = Math.round(2.45 + light * 1.5);
      if (px > right - 1) step = Math.min(step, shade > 0.7 ? 0 : 1);
      else if (px < left + 1) step = Math.max(step, shade > 0.5 ? 3 : 4);
      step = clamp(step, 0, 5);
      // Dust climbs the lower funnel, first along the dark bands, near the ground all over.
      const lift = (p - 0.6) / 0.3 + grain * 0.4;
      const brown = lift > (stripeLight(g) < 0 ? 0 : stripeLight(g) > 0 ? 0.9 : 0.55);
      t.set(x, y, (brown ? dusty : grey)[step]);
    }
  }
}

/* -------------------------------------------------------------- collar -- */

/** Dust shaded from the upper left: a lit top, an underside in its own shadow; the far side a step darker. */
function dustTone(x, y, nx, ny, edge, near) {
  if (edge === 1) return 'soil0';
  if (edge === -1) return ny < -0.2 && nx < 0.3 ? 'rock3' : 'soil3';
  const light = -(nx * 0.6 + ny * 0.8) + (near ? 0.1 : -0.35) + (k.hash(x, y, 523) - 0.5) * 0.12;
  return light > 0.55 ? 'rock3' : light > 0.15 ? 'soil3' : light > -0.35 ? 'soil2' : 'soil1';
}

/**
 * Dust churning round the foot: a ring of billows round the funnel (a torus
 * seen from the side), tufts rising inside it, and drift where the rope
 * touches the ground. Each puff knows whether it is on the near side.
 */
function collarPuffs(f) {
  const cx = funnelAt(GROUND, f).cx;
  const puffs = [];
  ring(puffs, f, cx, 8, 59.4, 8.2, 2.2, 2.8, 0);
  ring(puffs, f, cx, 5, 55.6, 4.6, 1.2, 1.7, 1.2, 2);
  const phase = (f / FRAMES) * Math.PI * 2;
  for (const [dx, r, o] of [[-5, 1.6, 0], [-2, 2.1, 2], [2, 2.1, 4], [5, 1.6, 1]]) {
    puffs.push({ x: cx + dx, y: 63.6, r: r * (1 + 0.2 * Math.sin(phase + o)), near: true });
  }
  return puffs;
}

/** The collar's far half (`near` false), drawn behind the funnel, or its near half, drawn in front. */
function drawCollar(t, f, near) {
  const c = mass(collarPuffs(f), () => true, (x, y, nx, ny, edge, p) => (p.near === near ? dustTone(x, y, nx, ny, edge, near) : null));
  t.stamp(c, 0, 0);
}

/** Debris orbiting in the collar and up the rope, each speck one place on per loop; `near` picks the half. */
function drawSpecks(t, f, near) {
  const cx = funnelAt(GROUND, f).cx;
  const orbits = [[59.5, 10.5, 2, 4, 0.2, true], [55.5, 7.8, 1.6, 3, 1.4, true], [51, 5.4, 1.2, 3, 2.3, false], [46.5, 4, 1, 2, 0.8, false]];
  for (const [y0, rx, ry, n, off, chunk] of orbits) {
    for (let i = 0; i < n; i++) {
      const a = ((i + f / FRAMES) / n) * Math.PI * 2 + off;
      const s = Math.sin(a);
      if (s > 0 !== near) continue;
      const x = Math.floor(cx + Math.cos(a) * rx);
      const y = Math.floor(y0 + s * ry);
      t.set(x, y, P.c('pine0'));
      if (chunk && near) {
        t.set(x - 1, y, P.c('soil1'));
        t.set(x - 1, y - 1, P.c('sand1'));
      }
    }
  }
}

/**
 * Earth flung off the collar on both sides: clods rise, arc outwards and
 * fall, four on each path a quarter of the loop apart (so the loop
 * closes), thinning to dust at the end.
 */
function drawFlung(t, f) {
  const cx = funnelAt(GROUND, f).cx;
  for (const [side, y0, reach, lift, off] of [[-1, 57, 7, 7, 0], [1, 55.5, 6, 8, 0.5], [1, 60, 5, 4, 0.25], [-1, 60.5, 5, 3.5, 0.75]]) {
    for (let i = 0; i < 4; i++) {
      const s = frac(i / 4 + f / FRAMES / 4 + off / 4);
      const x = Math.floor(cx + side * (9 + reach * s));
      const y = Math.floor(y0 - lift * s * (1.6 - 1.6 * s) * 1.6);
      if (s < 0.6) {
        t.set(x, y, P.c('soil0'));
        if (s < 0.3) t.set(x - side, y, P.c('soil2'));
      } else if (t.get(x, y) === 0) {
        t.set(x, y, P.c('soil3'));
      }
    }
  }
}

function tornado(f) {
  const t = new k.Tex(W, H);
  drawCollar(t, f, false);
  drawSpecks(t, f, false);
  drawFunnel(t, f);
  drawCloud(t, f);
  drawCollar(t, f, true);
  drawSpecks(t, f, true);
  drawFlung(t, f);
  return t;
}

/* -------------------------------------------------------------- debris -- */

const DEBRIS_KEY = {
  // soil clod
  A: 'soil3', B: 'soil2', C: 'soil1', D: 'soil0',
  // rock
  r: 'rock4', s: 'rock3', u: 'rock2', v: 'rock1', w: 'rock0',
  // branch: bark and leaves
  b: 'bark2', c: 'bark1', d: 'bark0', L: 'meadow3', l: 'leaf3', m: 'leaf1',
  // plank: light wood
  p: 'sand3', q: 'sand2', o: 'sand0', z: 'bark1',
};

/** Four kinds × two tumble frames, each centred near (4, 4), lit from the upper left. */
const DEBRIS = [
  // 0–1 dirt clod
  ['........', '........', '........', '...AB...', '...BCD..', '....D...', '........', '........'],
  ['........', '........', '........', '....A...', '...ABC..', '....CD..', '........', '........'],
  // 2–3 rock
  ['........', '........', '...rs...', '..rsuv..', '...uvw..', '....w...', '........', '........'],
  ['........', '........', '....r...', '...rsu..', '..suvw..', '...vw...', '........', '........'],
  // 4–5 broken branch with a leaf tuft
  ['........', '.....Ll.', '....bLlm', '...bc.m.', '..bc....', '.cd.....', '........', '........'],
  ['........', '.bc.....', '..bc....', '...cd...', '....dLl.', '....Llm.', '.....m..', '........'],
  // 6–7 plank, lengthwise and on edge, turned
  ['........', '........', '........', '.pqqqq..', '.oooooz.', '........', '........', '........'],
  ['........', '......p.', '.....pq.', '....pqo.', '...pqo..', '..pqo...', '..oz....', '........'],
];

function tornadoDebris(f) {
  return k.grid(DEBRIS[f], DEBRIS_KEY);
}

module.exports = { sprites: { tornado, tornado_debris: tornadoDebris }, textures: {} };
