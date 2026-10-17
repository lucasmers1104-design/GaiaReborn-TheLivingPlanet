/* =============================================================================
 * SimEarth 2.0 — meteor and atomic strike art
 * -----------------------------------------------------------------------------
 * The meteor's burning streak (drawn at 45°, never rotated at runtime), the
 * local flash with its calmer fireball for "Effekte reduzieren", the dust
 * cloud, the mushroom cloud, the crater rim, scorched stumps and the ground
 * of the aftermath: crater floor, scorched earth, ash and the pale fallout
 * film. Light from the upper left; glow is bright palette steps inside a
 * darker edge. The mushroom stays restrained: greys and beige, an orange
 * underglow only while it is young.
 * Style: docs/ereignisse-2026-10/stil.md · contract: tools/fx/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');
const P = require('../terrain/palette');
const fx = require('./kit');

/** Glow, hottest first; the last step is the darker edge. */
const HEAT = ['white0', 'yellow0', 'orange0', 'red1', 'red0'];

/**
 * Like fx.billow, but the light inside mixes each puff's own normal with
 * `form(x, y)` (−1..1, the light on the whole body: a dome, a column), so a
 * large cloud reads as one mass instead of a heap of balls. `tones` darkest
 * first; lower-right silhouette darkest, upper-left silhouette light.
 */
function mass(t, puffs, tones, form, tint = null) {
  const idx = tones.map((n) => P.c(n));
  const top = idx.length - 1;
  const depth = (x, y) => {
    let best = null;
    let bestD = 0;
    for (const p of puffs) {
      const dx = x + 0.5 - p.x;
      const dy = y + 0.5 - p.y;
      const d = 1 - Math.hypot(dx, dy) / p.r;
      if (d > bestD) { bestD = d; best = { p, dx, dy }; }
    }
    return best;
  };
  const inside = (x, y) => depth(x, y) !== null;
  for (let y = 0; y < t.h; y++) {
    for (let x = 0; x < t.w; x++) {
      const hit = depth(x, y);
      if (!hit) continue;
      const nx = hit.dx / hit.p.r;
      const ny = hit.dy / hit.p.r;
      const custom = tint ? tint(x, y, nx, ny) : null;
      if (custom) { t.set(x, y, P.c(custom)); continue; }
      if (!inside(x + 1, y) || !inside(x, y + 1) || !inside(x + 1, y + 1)) { t.set(x, y, idx[0]); continue; }
      if (!inside(x - 1, y) || !inside(x, y - 1)) { t.set(x, y, idx[top - 1]); continue; }
      const light = -(nx * 0.6 + ny * 0.8) * 0.45 + form(x, y) * 0.75 + (k.hash(x, y, 919) - 0.5) * 0.2;
      const step = light > 0.45 ? top : light > 0.1 ? top - 1 : light > -0.3 ? Math.max(1, top - 2) : 1;
      t.set(x, y, idx[step]);
    }
  }
  return t;
}

/** Light on a dome about (cx, cy) with radii (rx, ry), lit from the upper left. */
function dome(cx, cy, rx, ry) {
  return (x, y) => Math.max(-1, Math.min(1, -(((x + 0.5 - cx) / rx) * 0.6 + ((y + 0.5 - cy) / ry) * 0.8)));
}

/* ------------------------------------------------------------ streak -- */

/** Centre of the streak's head (lower right of the frame); the tail runs to the upper left. */
const HEAD = 24;
/** Length of the burning tail, then smoke trails off. */
const TAIL = 21;

function streak(f) {
  const t = new k.Tex(32, 32);
  const smoke = k.fbm(64, 8, 2, 211);
  t.each((x, y) => {
    const vx = x + 0.5 - HEAD;
    const vy = y + 0.5 - HEAD;
    const d = Math.hypot(vx, vy);
    // Along the tail (up-left positive) and across it.
    const along = -(vx + vy) * Math.SQRT1_2;
    const across = (vx - vy) * Math.SQRT1_2;
    if (d < (f % 2 ? 1.6 : 1.2)) return P.c('white0');
    if (d < 2.3) return P.c('yellow0');
    if (along <= 0.5) return d < 3.0 ? P.c('orange0') : d < 3.6 ? P.c('red1') : undefined;
    // Flame tongues stream backwards: their bins move three pixels a frame.
    const bin = Math.floor((along + f * 3) / 3);
    const tongue = (k.hash(bin, across > 0 ? 1 : 2, 213) - 0.5) * 1.2;
    const p = along / TAIL;
    const half = p < 1 ? 3.3 * Math.pow(1 - p, 0.55) + tongue * (1 - p) : 0;
    const c = Math.abs(across) / Math.max(0.01, half);
    if (half > 0.45 && c < 1) {
      const heat = 1 - p * 0.95 - c * 0.45;
      let step = heat > 0.78 ? 1 : heat > 0.55 ? 2 : heat > 0.32 ? 3 : 4;
      if (c > 0.72) step = Math.min(4, step + 1);
      return P.c(HEAT[step]);
    }
    // Smoke trails behind the fire and frays.
    const sp = (along - TAIL * 0.45) / (TAIL * 0.85);
    if (sp < 0 || sp > 1) return undefined;
    const sw = 1.4 + sp * 1.6;
    if (Math.abs(across) > sw) return undefined;
    const n = smoke(Math.floor(along + f * 2), Math.floor(across * 2));
    if (n < 0.28 + sp * 0.3) return undefined;
    return P.c(across < -0.8 ? 'rock3' : across > 0.8 ? 'rock1' : 'rock2');
  });
  // Sparks shed by the head, a few per frame.
  for (let s = 0; s < 4; s++) {
    const along = 6 + k.hash(s, f, 217) * 13;
    const across = (k.hash(s, f, 219) < 0.5 ? -1 : 1) * (3 + k.hash(s, f, 221) * 2);
    const x = Math.round(HEAD - (along - across) * Math.SQRT1_2 - 0.5);
    const y = Math.round(HEAD - (along + across) * Math.SQRT1_2 - 0.5);
    if (t.get(x, y) === 0) t.set(x, y, P.c(along < 12 ? 'yellow0' : 'orange0'));
  }
  return t;
}

/* ------------------------------------------------------------- flash -- */

/** A burst of light: a hot core in rings out to a darker edge, and rays. */
function burst(t, core, rings, rays, rayLen, turn, seed) {
  const n = 8;
  t.each((x, y) => {
    const dx = x + 0.5 - 16;
    const dy = y + 0.5 - 16;
    const d = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    const ragged = (k.hash(Math.floor(((a + Math.PI) / (2 * Math.PI)) * 24), 0, seed) - 0.5) * 1.2;
    for (let r = 0; r < rings.length; r++) if (d < rings[r] + (r === rings.length - 1 ? ragged : 0)) return P.c(core[r]);
    // Rays: distance to the nearest of n spokes, `turn` of a step round.
    const u = (a / (2 * Math.PI)) * n - turn;
    const spoke = Math.round(u);
    const off = Math.abs(u - spoke) * ((2 * Math.PI) / n) * d;
    const len = rayLen * (((spoke % 2) + 2) % 2 === 0 ? 1 : 0.7);
    if (off > rays || d > len) return undefined;
    const q = (d - rings[rings.length - 1]) / (len - rings[rings.length - 1]);
    return P.c(q < 0.4 ? 'yellow0' : q < 0.85 ? 'orange0' : 'red1');
  });
  return t;
}

/** The fireball without white, for reduced effects and after the flash. */
function fireball(t) {
  // A round core with six billows bulging from its edge.
  const puffs = [{ x: 16, y: 16, r: 8.2 }];
  for (let n = 0; n < 6; n++) {
    const a = (n / 6) * Math.PI * 2 + 0.4;
    puffs.push({ x: 16 + Math.cos(a) * 5.6, y: 16 + Math.sin(a) * 5.6, r: 4.2 + k.hash(n, 0, 235) * 0.8 });
  }
  fx.billow(t, puffs, ['red0', 'red1', 'orange0', 'orange0', 'yellow0'], (x, y) => (Math.hypot(x + 0.5 - 15, y + 0.5 - 15) < 3.6 ? 'yellow0' : null));
  return t;
}

function flash(f) {
  const t = new k.Tex(32, 32);
  if (f === 2) return fireball(t);
  if (f === 0) return burst(t, ['white0', 'yellow0', 'orange0', 'red1'], [3.5, 5.5, 7, 8], 0.6, 13.5, 0, 231);
  return burst(t, ['white0', 'yellow0', 'orange0', 'red1', 'red0'], [4, 7.5, 10, 11.5, 12.5], 0.75, 15.5, 0.5, 233);
}

/* -------------------------------------------------------------- dust -- */

/** A skirt on the ground, the body and a crown, scaled about the ground point (24, 38). */
const DUST_PUFFS = [
  [10, 34, 5.5], [16, 35.5, 6.5], [24, 36, 6], [31, 35.5, 6.5], [37.5, 34, 5],
  [14, 28, 6.5], [21, 25, 8], [29, 26, 7.5], [35, 29.5, 5],
  [18, 18, 5.5], [25, 15.5, 6.5], [31, 19, 5],
];
const DUST_TONES = ['soil1', 'soil2', 'sand1', 'sand2', 'sand3'];
/** Grow (0–2), billow (3–4), crumble while still spreading a little (5–7). */
const DUST_GROW = [0.42, 0.66, 0.86, 0.98, 1.04, 1.08, 1.11, 1.14];
const DUST_CRUMBLE = [0, 0, 0, 0, 0, 0.15, 0.3, 0.45];
/** The young cloud is lit from below by the impact: the share of its underside that glows. */
const DUST_GLOW = [1, 0.45];

function dustCloud(f) {
  const t = new k.Tex(48, 48);
  const g = DUST_GROW[f];
  const at = (x, y) => [24 + (x - 24) * g, 38 + (y - 38) * g];
  // Dissolving, the puffs thin out each at its own pace and drift apart before the tufts crumble.
  const fade = Math.max(0, (f - 4) / 4);
  const puffs = [];
  DUST_PUFFS.forEach(([x, y, r], n) => {
    const [px, py] = at(x, y);
    // Billowing: each puff swells on its own beat, and the crown keeps rolling upwards once grown.
    const roll = f >= 3 && y < 24 ? -(f - 2) * 0.7 : 0;
    const thin = 1 - fade * (0.25 + 0.9 * k.hash(n, 0, 311));
    const pr = r * g * thin * (1 + 0.07 * Math.sin(f * 1.9 + n * 2.1));
    if (pr < 1.5) return;
    puffs.push({ x: px + (px - 24) * fade * 0.25, y: py + roll + (py - 30) * fade * 0.2, r: pr });
  });
  const [cx, cy] = at(24, 27);
  const glow = DUST_GLOW[f] ?? 0;
  const tint = glow > 0 ? (x, y, nx, ny) => {
    if (ny < 0.35 || y < 31) return null;
    if (glow >= 1) return ny > 0.88 && Math.abs(x + 0.5 - 24) < 3 ? 'yellow0' : ny > 0.65 ? 'orange0' : 'laterite1';
    return ny > 0.6 && k.hash(x, y, 309) < glow ? 'laterite1' : null;
  } : null;
  mass(t, puffs, DUST_TONES, dome(cx, cy, 17 * g, 14 * g), tint);
  return DUST_CRUMBLE[f] > 0 ? relight(fx.crumble(t, DUST_CRUMBLE[f], 603), DUST_TONES[0]) : t;
}

/* ---------------------------------------------------------- mushroom -- */

/** Beige with grey shadows, so the cloud stands out from the grey ash it rises from. */
const CLOUD = ['rock1', 'rock3', 'sand2', 'sand3', 'sand4'];
/** The cooling cloud at the end: the beige highlight gone. */
const CLOUD_COLD = ['rock1', 'rock2', 'rock3', 'rock4', 'sand3'];
/** Cooling, between the two: grey shadows, the beige light still on top. */
const CLOUD_COOL = ['rock1', 'rock2', 'rock3', 'sand2', 'sand3'];
const GLOW = ['red0', 'red1', 'orange0', 'orange0', 'yellow0'];

/** The column from row `top` down to the ground: a cylinder lit from the left, flared into cap and ground, churning. */
function column(t, top, rTop, rFoot, tones, seed) {
  for (let y = top; y <= 46; y++) {
    const p = (y - top) / Math.max(1, 46 - top);
    const flare = Math.max(0, 1 - p / 0.12) * 1.2 + Math.max(0, (p - 0.8) / 0.2) * 1.4;
    const half = rTop + (rFoot - rTop) * p + flare + (k.hash(y >> 1, 0, seed) - 0.5) * 0.9;
    for (let x = 0; x < t.w; x++) {
      const u = (x + 0.5 - 16) / half;
      if (Math.abs(u) > 1) continue;
      // Billows rising in the column: here and there a step lighter or darker.
      const churn = k.hash(x, (y + seed) >> 1, seed) < 0.18 ? (u < 0 ? -1 : 1) : 0;
      const step = Math.max(0, Math.min(3, (u > 0.6 ? 0 : u > 0.1 ? 1 : u > -0.5 ? 2 : 3) - churn));
      t.set(x, y, P.c(tones[step]));
    }
  }
}

/** The dust ring a strike raises round its foot, low and wide; it stands on the last row. */
function skirt(spread, r) {
  return [
    { x: 16 - spread, y: 46.2, r }, { x: 16 - spread * 0.45, y: 46, r: r + 1 },
    { x: 16 + spread * 0.45, y: 46, r: r + 1 }, { x: 16 + spread, y: 46.2, r },
  ];
}

function drawSkirt(t, spread, r, tones) {
  mass(t, skirt(spread, r), tones, dome(15, 44, spread + r, r + 1));
}

/** The cap about (16, cy): a broad, flattened dome with rolled shoulders, `w` its half width. */
function cap(cy, w, r) {
  return [
    { x: 16, y: cy - 0.6, r },
    { x: 16 - w * 0.42, y: cy - 0.4, r: r * 0.9 }, { x: 16 + w * 0.42, y: cy - 0.3, r: r * 0.9 },
    { x: 16 - w * 0.8, y: cy + 1, r: r * 0.7 }, { x: 16 + w * 0.8, y: cy + 1.1, r: r * 0.7 },
    { x: 16 - w, y: cy + 2, r: r * 0.5 }, { x: 16 + w, y: cy + 2.1, r: r * 0.5 },
  ];
}

function drawCap(t, cy, w, r, tones, tint = null) {
  mass(t, cap(cy, w, r), tones, dome(15, cy - 2, w + r * 0.6, r * 1.2), tint);
}

/** Lit from below while young: the lowest rim of the cap glows, `strength` 1 orange, less a dull ember. */
function underglow(cy, strength) {
  return (x, y, nx, ny) => {
    if (y <= cy || ny < 0.72) return null;
    if (strength >= 1) return 'orange0';
    return k.hash(x, y, 317) < strength ? 'laterite1' : null;
  };
}

/** A rising fireball about (16, cy): hot inside a darker edge, `heat` 1 white-hot core, less a cooler one. */
function drawFireball(t, cy, r, heat) {
  const lobes = [{ x: 16, y: cy, r }, { x: 16 - r * 0.72, y: cy + r * 0.3, r: r * 0.45 }, { x: 16 + r * 0.72, y: cy + r * 0.35, r: r * 0.45 }];
  mass(t, lobes, GLOW, dome(16, cy, r, r), (x, y) => {
    const d = Math.hypot(x + 0.5 - 15, y + 0.5 - (cy - 1.5));
    if (d < r * 0.22 * heat) return 'white0';
    return d < r * 0.45 * heat ? 'yellow0' : null;
  });
}

/**
 * A young cap still lit from within: the heat glows through its underside
 * where the stem feeds it, `heat` 0..1, and its lower rim is lit orange.
 */
function capCore(cy, w, heat) {
  return (x, y, nx, ny) => {
    const d = Math.hypot((x + 0.5 - 16) / (1.5 + w * 0.55 * heat), (y + 0.5 - (cy + 2.2)) / 1.9);
    if (d < 0.5 && heat > 0.6) return 'yellow0';
    if (d < 1) return 'orange0';
    if (y > cy && ny > 0.72) return heat > 0.6 ? 'orange0' : 'red1';
    return null;
  };
}

/** After crumbling: every tuft gets its shadow edge on the lower right again, so it keeps its volume. */
function relight(t, dark) {
  const c = P.c(dark);
  const src = Uint8Array.from(t.px);
  const at = (x, y) => (x < 0 || y < 0 || x >= t.w || y >= t.h ? 0 : src[y * t.w + x]);
  t.each((x, y) => (at(x, y) !== 0 && (at(x + 1, y) === 0 || at(x, y + 1) === 0) ? c : undefined));
  return t;
}

/** Crumble a part drawn on its own layer, relight its tufts, and stamp it onto `t`. */
function crumbled(t, draw, amount, seed, dark) {
  const p = new k.Tex(t.w, t.h);
  draw(p);
  t.stamp(relight(fx.crumble(p, amount, seed), dark), 0, 0);
}

/**
 * The atomic cloud in eight steps, played once: the fireball on the ground
 * (0), lifting off on its dust stem (1), turning to smoke as it rises (2),
 * the cap forming over a full stem (3), spreading while the glow beneath it
 * fades (4–5), then cooling grey and falling apart in tufts (6–7).
 */
function mushroom(f) {
  const t = new k.Tex(32, 48);
  if (f === 0) {
    // The fireball sits on the ground in its first dust.
    drawSkirt(t, 7, 2.6, CLOUD);
    drawFireball(t, 40.5, 6.8, 1);
    return t;
  }
  if (f === 1) {
    column(t, 36, 1.4, 2.4, CLOUD, 401);
    drawSkirt(t, 8, 3.0, CLOUD);
    drawFireball(t, 32.5, 6.4, 0.75);
    return t;
  }
  if (f === 2) {
    column(t, 29, 1.9, 2.8, CLOUD, 402);
    drawCap(t, 24.5, 4.2, 5.4, CLOUD, capCore(24.5, 4.2, 1));
    drawSkirt(t, 9, 3.2, CLOUD);
    return t;
  }
  if (f === 3) {
    column(t, 24, 2.3, 3.1, CLOUD, 403);
    drawCap(t, 19.5, 6.2, 5.5, CLOUD, capCore(19.5, 6.2, 0.5));
    drawSkirt(t, 9.5, 3.4, CLOUD);
    return t;
  }
  if (f === 4) {
    column(t, 19, 2.3, 3.2, CLOUD, 404);
    drawCap(t, 15, 8, 5.6, CLOUD, underglow(15, 1));
    drawSkirt(t, 10, 3.4, CLOUD);
    return t;
  }
  if (f === 5) {
    column(t, 16, 2.3, 3.3, CLOUD, 405);
    drawCap(t, 12, 9.4, 5.6, CLOUD, underglow(12, 0.35));
    drawSkirt(t, 10.5, 3.4, CLOUD);
    return t;
  }
  // Cooling and dissolving: the cap rises, spreads and falls apart in tufts; the stem thins and lets go of the ground.
  if (f === 6) {
    crumbled(t, (p) => drawSkirt(p, 11, 3.0, CLOUD_COOL), 0.3, 315, CLOUD_COOL[0]);
    column(t, 14, 1.8, 2.6, CLOUD_COOL, 406);
    crumbled(t, (p) => drawCap(p, 10, 9.4, 6, CLOUD_COOL), 0.14, 509, CLOUD_COOL[0]);
    return t;
  }
  crumbled(t, (p) => drawSkirt(p, 11.5, 2.8, CLOUD_COLD), 0.6, 315, CLOUD_COLD[0]);
  // The stem lets go of the ground: it ends raggedly above the settling dust.
  crumbled(t, (p) => {
    column(p, 13, 1.2, 1.8, CLOUD_COLD, 407);
    for (let x = 0; x < 32; x++) for (let y = 31 + Math.floor(k.hash(x, 0, 409) * 3); y < 48; y++) p.set(x, y, 0);
  }, 0.2, 319, CLOUD_COLD[0]);
  crumbled(t, (p) => drawCap(p, 8.5, 9.8, 6, CLOUD_COLD), 0.42, 509, CLOUD_COLD[0]);
  return t;
}

/* ---------------------------------------------------- water fountain -- */

/** Spray and water, darkest first: shadowed water at the lower right, foam lit white at the upper left. */
const SPRAY = ['water4', 'water5', 'water7', 'ice3', 'ice4', 'white0'];
/** Height of the jet by frame: it shoots up, stands, and collapses into its foam. */
const JET = [4, 16, 25, 28, 20, 7];
/** Height of the crown splash round the foot: thrown up first, then sinking back. */
const CROWN = [6, 6, 4, 3, 2, 1];
/** Half width of the spray burst at the top of the jet. */
const BURST = [0, 0, 3, 4.4, 5.6, 0];

/**
 * A meteor falling into the sea throws up a fountain (16×32, foot): a crown
 * splash leaning outwards round its foot, a jet of water with a burst of
 * spray at its top, drops shed sideways that fall outwards as it collapses,
 * and a ring of foam on the last rows.
 */
function waterFountain(f) {
  const t = new k.Tex(16, 32);
  const foot = 30.5;
  const top = foot - JET[f];
  const puffs = [];
  if (JET[f] > 5) {
    for (let y = foot - 2; y > top + 1.5; y -= 2) {
      const p = (foot - y) / JET[f];
      puffs.push({ x: 8 + Math.sin(y * 0.7 + f * 1.3) * 0.5, y, r: 3.1 - p * 1.3 + (k.hash(Math.round(y), f, 455) - 0.5) * 0.5 });
    }
  }
  const ch = CROWN[f];
  for (let h = 0; h <= ch; h += 1.25) {
    for (const side of [-1, 1]) puffs.push({ x: 8 + side * (2.8 + h * 0.6), y: foot - h, r: 1.7 - (h / ch) * 0.6 });
  }
  const bw = BURST[f];
  if (bw > 0) {
    puffs.push({ x: 8, y: top + 2, r: 2.5 });
    puffs.push({ x: 8 - bw * 0.75, y: top + 2.8 + bw * 0.3, r: 1.9 }, { x: 8 + bw * 0.75, y: top + 3 + bw * 0.3, r: 1.8 });
  }
  // The foam ring stands on the last row, wider as the jet falls back into it.
  const fw = f >= 4 ? 4.6 : 3.4;
  puffs.push({ x: 8, y: foot + 0.2, r: 2.8 }, { x: 8 - fw, y: foot + 0.5, r: 2 }, { x: 8 + fw, y: foot + 0.6, r: 2 });
  fx.billow(t, puffs, SPRAY);
  // Drops: thrown off the crown tips and the jet while rising, falling outwards on parabolas as it collapses.
  const drops = f === 0 ? 4 : 8;
  for (let d = 0; d < drops; d++) {
    const side = d % 2 === 0 ? -1 : 1;
    const s = k.hash(d, f, 451);
    let x;
    let y;
    if (f <= 1) {
      x = 8 + side * (3.5 + ch * 0.6 + s * 2);
      y = foot - ch - 1 - s * 4;
    } else {
      const fall = f >= 4 ? 0.5 + s * 0.5 : s * 0.5;
      x = 8 + side * (bw * 0.6 + 1 + fall * 6);
      y = top + 2 + fall * fall * (f >= 4 ? 22 : 8) - (f >= 4 ? 0 : (1 - fall) * 3);
    }
    x = Math.round(x - 0.5);
    y = Math.round(y);
    if (x < 0 || x > 15 || y < 0 || y > 30 || t.get(x, y) !== 0) continue;
    t.set(x, y, P.c(side < 0 ? 'white0' : 'ice3'));
    if (k.hash(d, f, 453) < 0.5 && t.get(x, y + 1) === 0) t.set(x, y + 1, P.c(side < 0 ? 'ice3' : 'water7'));
  }
  return t;
}

/* -------------------------------------------------------- crater rim -- */

/**
 * A ring wall in 3/4 view about the tile: the hole shows the crater floor
 * (ground_crater) beneath. The far inner wall faces the viewer and is lit,
 * the near inner wall lies in shadow, the crest catches the light on its
 * upper left; the outer slope is lit upper left and dark lower right.
 */
function craterRim(v) {
  const t = new k.Tex(24, 16);
  const fresh = v === 0;
  const cx = 12;
  // Seen from the south: the hole sits low in the crest, so the far inner wall shows and the near one is a sliver.
  const outer = { y: 8.4, rx: fresh ? 11.6 : 11.3, ry: 7.4 };
  const crest = { y: 8.0, rx: fresh ? 9.4 : 9.1, ry: fresh ? 5.6 : 5.3 };
  const hole = { y: 9.0, rx: fresh ? 6.8 : 6.4, ry: fresh ? 3.2 : 2.9 };
  const moss = k.fbm(32, 4, 2, 331);
  /** Ragged by angle: rubble, not a turned ring. */
  const wob = (x, y, e, amount) => {
    const a = Math.atan2((y + 0.5 - e.y) / e.ry, (x + 0.5 - cx) / e.rx);
    const u = ((a + Math.PI) / (2 * Math.PI)) * 18;
    const i = Math.floor(u);
    const s = k.smooth(u - i);
    return 1 + (k.lerp(k.hash(i % 18, 0, 341 + v), k.hash((i + 1) % 18, 0, 341 + v), s) - 0.5) * amount;
  };
  const q = (x, y, e, amount = 0) => Math.hypot((x + 0.5 - cx) / e.rx, (y + 0.5 - e.y) / e.ry) / (amount ? wob(x, y, e, amount) : 1);
  const wall = (x, y) => q(x, y, outer, 0.16) <= 1 && q(x, y, hole, 0.1) >= 1;
  t.each((x, y) => {
    if (!wall(x, y)) return undefined;
    const dx = (x + 0.5 - cx) / outer.rx;
    const dy = (y + 0.5 - outer.y) / outer.ry;
    const qc = q(x, y, crest, 0.1);
    const green = !fresh && moss(x, y) > 0.5;
    const grain = k.hash(x, y, 333);
    if (qc < 0.93) {
      // Inner wall: the near side lies in shadow, the far side is lit, more where it faces left.
      if (y + 0.5 > hole.y) return P.c(fresh ? 'pine0' : 'rock0');
      const lit = -dy * 0.7 + dx * 0.45 + (grain - 0.5) * 0.3;
      if (lit > 0.45) return P.c(fresh && grain < 0.15 ? 'rock4' : 'rock3');
      if (lit > 0.05) return P.c(y % 2 === 0 && fresh ? 'rock2' : 'rock3');
      return P.c(lit > -0.3 ? 'rock2' : 'rock1');
    }
    if (qc < 1.1) {
      // The crest, catching the light on its upper left.
      if (dx + dy < -0.15) return P.c(green ? 'moss3' : fresh ? 'rock4' : 'rock3');
      if (dx + dy < 0.5) return P.c(green ? 'moss2' : 'rock3');
      return P.c(green ? 'moss1' : 'rock2');
    }
    // Outer slope: the earthy ejecta blanket, lit upper left; it frays into the ground in clumps, no outline.
    const qo = q(x, y, outer, 0.16);
    if (qo > 0.84 && k.hash(x >> 1, y >> 1, 343 + v) < (qo - 0.84) / 0.16) return undefined;
    const n = Math.hypot(dx, dy) || 1;
    const lit = -(dx / n) * 0.6 - (dy / n) * 0.8 + (grain - 0.5) * 0.35;
    if (green) return P.c(lit > 0.3 ? 'moss3' : lit > -0.25 ? 'moss2' : 'moss1');
    return P.c(lit > 0.35 ? 'sand1' : lit > -0.25 ? 'soil3' : 'soil2');
  });
  // Boulders on the rim (light top left, dark below), soil thrown out with them, or lichen once weathered.
  for (let s = 0; s < (fresh ? 9 : 6); s++) {
    const x = Math.floor(k.hash(s, 3, 339 + v) * 23);
    const y = Math.floor(k.hash(s, 4, 339 + v) * 15);
    const qc = q(x, y, crest, 0.1);
    if (!wall(x, y) || !wall(x + 1, y + 1) || qc < 0.95) continue;
    if (!fresh) {
      t.set(x, y, P.c('lichen0'));
      continue;
    }
    if (s % 3 === 2) {
      t.set(x, y, P.c('soil2'));
      t.set(x + 1, y, P.c('soil1'));
    } else {
      t.set(x, y, P.c('rock4'));
      t.set(x + 1, y + 1, P.c('rock1'));
    }
  }
  return t;
}

/* ------------------------------------------------------------- stump -- */

const STUMP_KEY = { a: 'rock3', b: 'rock2', c: 'bark1', d: 'bark0', e: 'pine0', f: 'rock0' };
const STUMPS = [
  [
    '........',
    '........',
    '........',
    '..aab...',
    '..cdde..',
    '..cdde..',
    '..cdde..',
    '.ccddee.',
  ],
  [
    '....a...',
    '...cb...',
    '...cde..',
    '...cde..',
    '..acde..',
    '...cde..',
    '...cde..',
    '..ccdee.',
  ],
  [
    '........',
    '........',
    '........',
    '.ab.....',
    '.cde....',
    '.cdeaabb',
    '.cddddde',
    '.cefeeee',
  ],
];

function stump(v) {
  return k.grid(STUMPS[v], STUMP_KEY);
}

/* ---------------------------------------------------------- textures -- */

/** Melt rock: dark glass in flow bands, cracked, with a few glints. */
function groundCrater() {
  const t = new k.Tex(64, 64, true);
  const base = k.fbm(64, 4, 3, 341);
  const flow = k.fbm(64, 8, 2, 342);
  t.each((x, y) => {
    if (Math.abs(flow(x, y) - 0.5) < 0.03) return P.c('pine0');
    const b = base(x, y);
    return P.c(b < 0.42 ? 'pine0' : b < 0.6 ? 'rock0' : 'rock1');
  });
  for (let by = 0; by < 64; by += 8) {
    for (let bx = 0; bx < 64; bx += 8) {
      if (k.hash(bx, by, 343) > 0.45) continue;
      const x = bx + Math.floor(k.hash(bx, by, 344) * 6);
      const y = by + Math.floor(k.hash(bx, by, 345) * 6);
      t.set(x, y, P.c('rock3'));
      t.set(x + 1, y, P.c('ice0'));
      t.set(x, y + 1, P.c('rock2'));
    }
  }
  return t;
}

/** Scorched earth: brown-black, charcoal patches and the stubs of burnt straw. */
function groundScorched() {
  const t = new k.Tex(64, 64, true);
  const base = k.fbm(64, 4, 3, 351);
  const char = k.fbm(64, 8, 2, 352);
  t.each((x, y) => {
    if (char(x, y) > 0.64) return P.c('bark0');
    return P.c(base(x, y) < 0.48 ? 'soil0' : 'soil1');
  });
  for (let by = 0; by < 64; by += 6) {
    for (let bx = 0; bx < 64; bx += 6) {
      if (k.hash(bx, by, 353) > 0.42) continue;
      const x = bx + Math.floor(k.hash(bx, by, 354) * 4);
      const y = by + Math.floor(k.hash(bx, by, 355) * 4);
      t.set(x, y, P.c('straw1'));
      t.set(x, y + 1, P.c('straw0'));
      if (k.hash(bx, by, 356) < 0.5) t.set(x + 1, y + 1, P.c('straw0'));
    }
  }
  return t;
}

/** Grey ash in soft drifts, lighter where it lies deep, flecks and a few cinders. */
function groundAsh() {
  const t = new k.Tex(64, 64, true);
  const base = k.fbm(64, 4, 3, 361);
  const drift = k.fbm(64, 8, 2, 362);
  t.each((x, y) => {
    const b = base(x, y);
    if (b > 0.58 && drift(x, y) > 0.5) return P.c(drift(x - 1, y - 1) > 0.5 ? 'rock3' : 'rock2');
    return P.c(b < 0.44 ? 'rock1' : 'rock2');
  });
  for (let by = 0; by < 64; by += 6) {
    for (let bx = 0; bx < 64; bx += 6) {
      const h = k.hash(bx, by, 363);
      if (h > 0.5) continue;
      const x = bx + Math.floor(k.hash(bx, by, 364) * 4);
      const y = by + Math.floor(k.hash(bx, by, 365) * 4);
      const tone = h < 0.1 ? 'rock0' : 'rock4';
      t.set(x, y, P.c(tone));
      t.set(x + 1, y, P.c(tone));
    }
  }
  return t;
}

/**
 * A pale veil: sparse lichen-pale specks, denser in drifts, transparent between.
 * Scattered by hash: an ordered dither read as a regular dot grid laid over the map.
 */
function falloutFilm() {
  const t = new k.Tex(64, 64, true);
  const n = k.fbm(64, 4, 2, 371);
  t.each((x, y) => {
    const v = n(x, y);
    if (k.hash(x, y, 372) >= 0.03 + v * 0.11) return undefined;
    return P.c(v > 0.58 ? 'lichen1' : 'lichen0');
  });
  return t;
}

module.exports = {
  sprites: { meteor_streak: streak, flash, dust_cloud: dustCloud, mushroom, water_fountain: waterFountain, crater_rim: craterRim, stump },
  textures: { ground_crater: groundCrater, ground_scorched: groundScorched, ground_ash: groundAsh, fallout_film: falloutFilm },
};
