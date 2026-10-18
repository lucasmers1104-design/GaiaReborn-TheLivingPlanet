/* =============================================================================
 * SimEarth 2.0 — whales surfacing on the open sea, and their blow
 * -----------------------------------------------------------------------------
 * Three whales (blue whale, humpback, sperm whale) seen from above, each in
 * two directions (east, then west) × 8 frames: 0–1 rise, 2–3 swim, 4–7
 * fluke dive. The whole whale is drawn — spindle body, flippers, fluke — as a
 * silhouette under a veil of sea; only the back that rides above the water
 * line is skin, lit from the upper left, with foam where it meets the water.
 * The raised fluke of the dive is seen from behind, streaming water.
 * The forms are measured shapes (a width profile along the spine, flipper and
 * fluke polygons) so every frame and the mirrored west set is lit afresh
 * (docs/ereignisse-2026-10/stil.md). Catalog `mouth` (east frames):
 * blowhole (the pixel above it, frames 1–3), snout (frames 2–3), fluke foot
 * (frames 6–7).
 * Style: docs/ereignisse-2026-10/stil.md · contract: tools/fx/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');
const P = require('../terrain/palette');
const fx = require('./kit');

/* ----------------------------------------------------------- whales -- */

/** Light from the upper left and above (x right, y down, z towards the eye). */
const LIGHT = (() => {
  const l = [-0.5, -0.75, 0.55];
  const n = Math.hypot(...l);
  return l.map((c) => c / n);
})();
/** Lambert values that start ramp steps 1..4. */
const CUTS = [0.25, 0.5, 0.7, 0.86];

/**
 * Species, east-facing. Body: spine from the fluke notch (x = xt) to the
 * snout (xt + len) on row yc; `prof` half-widths along it (s = 0 tail .. 1
 * snout). `fin`: one pectoral flipper as a polygon in (u, v) — u px from the
 * notch, v px out from the spine — mirrored to the other side. `fluke`: one
 * half of the fluke seen from above, in (u, v). `up`: the raised fluke seen
 * from behind ('#' skin, 'w' white underside). `hole`: blowhole (s, v).
 */
const SPECIES = {
  great: {
    w: 48, h: 24, xt: 7, yc: 14, len: 39,
    prof: [[0, 0.7], [0.06, 1.0], [0.16, 1.5], [0.3, 2.3], [0.45, 3.0], [0.6, 3.4], [0.76, 3.5], [0.86, 3.3], [0.93, 2.8], [0.97, 2.1], [1, 1.0]],
    fin: [[29, 2.5], [27.5, 4.5], [24.2, 6.6], [23.6, 6.2], [25.5, 3.0]],
    fluke: [[2.5, 0], [2.5, 1.2], [1.2, 3.4], [-1.0, 6.0], [-3.0, 6.6], [-2.4, 4.6], [-1.4, 2.4], [-0.6, 0.8], [-0.4, 0]],
    dorsal: 0.22,
    hole: [0.85, 0], guard: true, ride: -1.7, drop: 1.2, mid: 0.6,
    skin: ['rock0', 'ice0', 'ice1', 'ice2', 'ice3'],
    marks: 'mottle',
    sub: { edge: 'water1', fill: 'water3', lite: 'water4' },
    finSub: null,
    rise: 0.82,
    up: [
      '##.............##',
      '####.........####',
      '.#####.....#####.',
      '..######.######..',
      '....#########....',
      '......#####......',
      '.......###.......',
      '.......###.......',
      '.......###.......',
    ],
  },
  baleen: {
    w: 40, h: 24, xt: 7, yc: 12, len: 29,
    prof: [[0, 0.8], [0.08, 1.2], [0.2, 2.2], [0.35, 3.6], [0.5, 4.4], [0.65, 4.4], [0.78, 3.7], [0.88, 2.9], [0.95, 2.2], [1, 1.2]],
    fin: [[21.5, 3.0], [21, 4.6], [17.5, 7.6], [13.5, 10.6], [12.6, 10.4], [14.5, 7.8], [17, 4.2], [18.5, 3.0]],
    fluke: [[2.5, 0], [2.5, 1.3], [1.0, 3.8], [-1.2, 6.6], [-3.4, 7.4], [-2.4, 5.8], [-2.6, 4.4], [-1.6, 3.0], [-1.0, 1.4], [-0.4, 0]],
    hump: 0.3,
    hole: [0.82, 0], ride: -1.7, drop: 1.4, mid: 0.55,
    skin: ['pine0', 'rock0', 'rock1', 'rock2', 'rock3'],
    marks: 'knobs',
    sub: { edge: 'water0', fill: 'water2', lite: 'water4' },
    finSub: { edge: 'water4', fill: 'water6', lite: 'water7' },
    rise: 0.82,
    up: [
      '##.#.........#.##',
      '#####.......#####',
      '.#wwww#...#wwww#.',
      '..#wwwww#wwwww#..',
      '...##wwwwwww##...',
      '.....##www##.....',
      '.......###.......',
      '.......###.......',
      '.......###.......',
    ],
  },
  sperm: {
    w: 40, h: 24, xt: 7, yc: 13, len: 31,
    prof: [[0, 0.8], [0.08, 1.2], [0.2, 2.0], [0.35, 3.0], [0.5, 3.5], [0.6, 3.7], [0.64, 3.7], [0.68, 3.9], [0.95, 3.9], [0.98, 3.4], [1, 2.4]],
    fin: [[21.5, 3.2], [20.5, 5.4], [19.4, 5.8], [19.4, 3.2]],
    fluke: [[2.5, 0], [2.5, 1.3], [0.6, 4.0], [-1.4, 6.8], [-3.0, 7.0], [-2.0, 4.2], [-1.0, 1.8], [-0.4, 0.4], [-0.2, 0]],
    knuckles: [0.34, 0.41, 0.48],
    head: 0.66,
    hole: [0.97, -2.4], ride: -1.7, drop: 1.0, mid: 0.6, headRide: 0.9,
    skin: ['soil0', 'rock0', 'rock1', 'rock2', 'rock3'],
    marks: 'wrinkles',
    sub: { edge: 'water0', fill: 'water2', lite: 'water4' },
    finSub: null,
    rise: 0.86,
    up: [
      '####.........####',
      '.######...######.',
      '..######.######..',
      '...###########...',
      '.....#######.....',
      '.......###.......',
      '.......###.......',
      '.......###.......',
      '.......###.......',
    ],
  },
};

const lerpProf = (prof, s) => {
  if (s <= prof[0][0]) return prof[0][1];
  for (let i = 1; i < prof.length; i++) {
    const [s1, w1] = prof[i];
    if (s <= s1) { const [s0, w0] = prof[i - 1]; return w0 + (w1 - w0) * ((s - s0) / (s1 - s0)); }
  }
  return prof[prof.length - 1][1];
};

function inPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 1 at s = c, falling to 0 at c ± w. */
const bump = (s, c, w) => Math.max(0, 1 - ((s - c) / w) ** 2);

/**
 * Pose of a frame. elev(s): how high the spine rides against the water line,
 * in px; where a body cross-section (a flat half ellipse as wide as the
 * body) rises above 0, the back breaks the surface — so the visible back
 * follows the whale's own outline: wide at the shoulders, rounded at the
 * head, narrowing to the tail stock. Frames: 0–1 rise, 2–3 swim, 4–7 dive.
 */
function pose(sp, f) {
  const p = { elev: () => -9, depth: 2, finDepth: 2, flukeDepth: 2, chord: 1, bend: 0, foam: 1, wake: -1, up: -1, show: 1 };
  const swim = (s) => sp.ride - sp.drop * (1 - bump(s, sp.mid, 0.5)) - 1.2 * Math.max(0, (0.2 - s) / 0.2) + (sp.headRide && s > sp.head ? sp.headRide : 0);
  switch (f) {
    case 0: Object.assign(p, { depth: 0, finDepth: 0, flukeDepth: 0 }); break;
    case 1: Object.assign(p, { elev: (s) => -3 + 3.2 * bump(s, sp.rise, 0.2), depth: 1, finDepth: 1, flukeDepth: 1, foam: 2 }); break;
    case 2: Object.assign(p, { elev: swim, wake: 0 }); break;
    case 3: Object.assign(p, { elev: swim, wake: 1, chord: 0.7, bend: 1 }); break;
    case 4: Object.assign(p, { elev: (s) => -3.5 + (sp.ride + 4.6) * bump(s, 0.4, 0.3), depth: 1, finDepth: 1, foam: 2, headFoam: true }); break;
    case 5: Object.assign(p, { depth: 1, finDepth: 0, flukeDepth: -1, show: 0.75, up: 3, streak: true }); break;
    case 6: Object.assign(p, { depth: 0, finDepth: -1, flukeDepth: -1, up: 0, show: 0.55 }); break;
    case 7: Object.assign(p, { depth: -1, finDepth: -1, flukeDepth: -1, up: 5 }); break;
  }
  return p;
}

/** One frame of a whale, east-facing (`west`: the form mirrored, lit afresh). */
function whale(kind, f, west) {
  const sp = SPECIES[kind];
  const { w: W, h: H, xt, yc, len } = sp;
  const p = pose(sp, f);
  const t = new k.Tex(W, H);
  const gx = (x) => (west ? W - x : x); // screen x (pixel-centre coordinate) -> east geometry x
  const bendAt = (u) => (u < 9 ? p.bend * ((9 - u) / 9) ** 2 : 0);
  /** Part under the east-geometry point (x, y): body / fin / fluke, with s and t. */
  const part = (x, y) => {
    const u = x - xt;
    const v = y - yc - bendAt(u);
    const s = u / len;
    const av = Math.abs(v);
    if (s >= 0 && s <= 1) {
      const hw = lerpProf(sp.prof, s);
      if (av <= hw) return { kind: 'body', s, t: v / hw, hw };
    }
    if (inPoly(sp.fin, u, av)) return { kind: 'fin', s, t: 1 };
    const uc = u >= 2.5 ? u : 2.5 - (2.5 - u) * (1 / p.chord);
    if (u < 3 && inPoly(sp.fluke, uc, av)) return { kind: 'fluke', s: 0, t: 1 };
    return null;
  };
  /** Height of the back above the water at a geometry point (0 where under). */
  const height = (x, y) => {
    const q = part(x, y);
    if (!q) return 0;
    if (q.kind !== 'body') return 0;
    return Math.max(0, q.hw * Math.sqrt(Math.max(0, 1 - q.t * q.t)) * 0.8 + p.elev(q.s));
  };
  const LIFT = 1;

  // 1. The submerged silhouette (drawn first, the surfaced back covers it): the whole whale under a
  // veil of water — lit from the upper left, dark rim at the lower right, sparser the deeper it lies.
  const silo = (sx, sy) => {
    const q = part(gx(sx + 0.5), sy + 0.5);
    if (!q) return null;
    if (q.kind === 'body' && q.s > p.show) return null;
    const depth = q.kind === 'fin' ? p.finDepth : q.kind === 'fluke' ? p.flukeDepth : p.depth;
    return depth < 0 ? null : { q, depth: Math.min(2, depth) };
  };
  const DITHER = [5, 10, 16];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = silo(x, y);
      if (!o) continue;
      const { q, depth } = o;
      const c = q.kind === 'fin' && sp.finSub ? sp.finSub : sp.sub;
      const b = k.BAYER4[y & 3][x & 3];
      if (b >= DITHER[depth]) continue;
      const lowerRight = !silo(x + 1, y) || !silo(x, y + 1);
      const upperLeft = !silo(x - 1, y) || !silo(x, y - 1);
      let name = c.fill;
      if (depth >= 1 && lowerRight) name = c.edge;
      else if (depth >= 1 && upperLeft) name = c.lite;
      else if (depth >= 2 && (q.t < -0.2 || q.kind !== 'body') && (x + y) % 2 === 0) name = c.lite;
      t.set(x, y, P.c(name));
    }
  }

  // The blue whale's small dorsal fin, far back, shows as a dark tick through the water.
  if (sp.dorsal && p.depth >= 1) {
    const X0 = Math.floor(xt + sp.dorsal * len);
    for (const [dx, name] of [[0, sp.skin[0]], [-1, sp.skin[0]], [1, sp.sub.lite]]) {
      const X = west ? W - 1 - (X0 + dx) : X0 + dx;
      if (t.get(X, yc - 1)) t.set(X, yc - 1, P.c(name));
    }
  }

  // 2. The back above the water, lit from the upper left, LIFT px higher (the map is seen from a little south).
  const ramp = sp.skin.map((n) => P.c(n));
  const above = new Uint8Array(W * H);
  const hs = (sx, sy) => height(gx(sx), sy + LIFT);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (hs(x + 0.5, y + 0.5) > 0.15) above[y * W + x] = 1;
  const A = (x, y) => x >= 0 && y >= 0 && x < W && y < H && above[y * W + x] === 1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!A(x, y)) continue;
      const cx = x + 0.5;
      const cy = y + 0.5;
      const dx = (hs(cx + 0.5, cy) - hs(cx - 0.5, cy));
      const dy = (hs(cx, cy + 0.5) - hs(cx, cy - 0.5));
      const n = Math.hypot(dx, dy, 1);
      const lam = (-dx * LIGHT[0] - dy * LIGHT[1] + LIGHT[2]) / n;
      let s = 0;
      while (s < CUTS.length && lam > CUTS[s]) s++;
      s = Math.max(1, s);
      const q = part(gx(cx), cy + LIFT);
      if (q && q.kind === 'body' && q.t > -0.6 && q.t < -0.1 && s === 2 && k.hash(x, y, 47) < 0.8) s = 3;
      if (q && q.kind === 'body' && q.s > 0.9 && !A(x, y - 1) && s < 4) s++;
      s = mark(sp, q, gx(cx) - xt, cy + LIFT - yc, s, x, y);
      if (!A(x + 1, y) && !A(x, y + 1)) s = 0;
      else if (!A(x, y + 1)) s = Math.min(s, 1);
      t.set(x, y, ramp[s]);
    }
  }
  // Blowhole, dorsal fin, hump, knuckles: small marks on the back.
  const dot = (u, v, name) => {
    const X = west ? W - 1 - Math.floor(xt + u) : Math.floor(xt + u);
    const Y = Math.floor(yc + v - LIFT);
    if (A(X, Y)) t.set(X, Y, P.c(name));
    return [X, Y];
  };
  {
    const [hsS, hv] = sp.hole;
    dot(hsS * len, hv, sp.skin[0]);
    if (sp.guard) dot(hsS * len + 1, hv, sp.skin[4]);
    if (sp.dorsal) { dot(sp.dorsal * len, 0, sp.skin[0]); dot(sp.dorsal * len - 1, 0, sp.skin[0]); dot(sp.dorsal * len + 1, -1, sp.skin[4]); }
    if (sp.hump) { dot(sp.hump * len, -1, sp.skin[4]); dot(sp.hump * len + 1, -1, sp.skin[4]); dot(sp.hump * len, 0, sp.skin[0]); dot(sp.hump * len - 1, 0, sp.skin[0]); }
    for (const kn of sp.knuckles || []) { dot(kn * len, -1, sp.skin[4]); dot(kn * len, 0, sp.skin[0]); }
  }

  // 3. Foam where the back meets the water: a cap at the bow, broken flecks along the flanks.
  const foamC = [P.c('white0'), P.c('ice3')];
  let bowU = -99;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (A(x, y)) bowU = Math.max(bowU, (west ? W - 1 - x : x) - xt);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (A(x, y)) continue;
      let n8 = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (A(x + dx, y + dy)) n8++;
      if (!n8) continue;
      const ux = (west ? W - 1 - x : x) - xt;
      const front = ux >= bowU - 2;
      const south = A(x, y - 1);
      const share = front ? 0.8 : (south ? 0.45 : 0.18) * p.foam;
      if (k.hash(ux, y, 77 + f) >= share) continue;
      t.set(x, y, foamC[(front && k.hash(x, y, 4) < 0.7) || !south ? 0 : 1]);
    }
  }

  // 4. The fluke's print: a few calm ripples where the stroke pushed the water (the bow wave is whale_wake's).
  if (p.wake >= 0) {
    for (let i = 0; i < 6; i++) {
      const u = -4.5 - p.wake - (i >> 1) * 1.5;
      const v = (i & 1 ? 1 : -1) * (1.5 + (i >> 1) * 0.6);
      const X0 = Math.floor(xt + u);
      const X = west ? W - 1 - X0 : X0;
      const Y = Math.floor(yc + v + 0.5);
      if (X >= 0 && X < W && t.get(X, Y) === 0 && k.hash(i, p.wake, 31) < 0.8) t.set(X, Y, P.c(i < 2 ? 'ice3' : 'water6'));
    }
  }

  // 5. The fluke raised high, seen from behind, water streaming off it; then it slips into a foam ring.
  if (p.up >= 0) {
    const g = sp.up;
    const gw = g[0].length;
    const ox = xt + 1 - Math.floor(gw / 2);
    const base = yc - 1;
    const top = base - g.length + 1 + p.up;
    for (let gy = 0; gy < g.length; gy++) {
      const y = top + gy;
      if (y > base) continue;
      for (let gx2 = 0; gx2 < gw; gx2++) {
        const ch = g[gy][gx2];
        if (ch === '.') continue;
        const X = west ? W - 1 - (ox + gx2) : ox + gx2;
        const solid = (a, b) => { const r = g[b]; return !!r && r[a] && r[a] !== '.'; };
        const lr = west ? -1 : 1;
        const sxl = gx2 - lr; const sxr = gx2 + lr;
        // light from the upper left in screen space
        const leftEdge = !solid(west ? sxr : sxl, gy) || !solid(gx2, gy - 1);
        const rightEdge = !solid(west ? sxl : sxr, gy) || !solid(gx2, gy + 1);
        let c;
        if (ch === 'w') c = rightEdge ? 'ice2' : leftEdge ? 'white0' : 'ice3';
        else c = rightEdge ? sp.skin[0] : leftEdge ? sp.skin[3] : sp.skin[1];
        t.set(X, y, P.c(c));
      }
    }
    // Water streaming off the tips, a splash round the stock.
    const tipsAt = [0, gw - 1];
    if (p.up <= 3) {
      for (const tx of tipsAt) {
        const outw = tx === 0 ? -1 : 1;
        for (const [dx, dy, c] of [[0, 3, 'white0'], [outw, 5, 'ice3'], [0, 7, 'ice3'], [outw, 9, 'water6']]) {
          const y = top + dy + p.up;
          if (y >= base - 1) continue;
          const X0 = ox + tx + dx;
          const X = west ? W - 1 - X0 : X0;
          t.set(X, y, P.c(c));
        }
      }
    }
    const rr = p.up > 3 ? 7 : 5;
    const cx0 = ox + Math.floor(gw / 2);
    for (let dy = -1; dy <= 1; dy++) {
      const half = dy === 0 ? rr : dy === 1 ? rr - 2 : (p.up <= 3 ? rr - 3 : -1);
      for (let x = -half; x <= half; x++) {
        if (dy === -1 && Math.abs(x) < 2) continue;
        if (k.hash(x, dy, 13 + p.up) > (dy === 0 ? 0.8 : 0.55)) continue;
        const X0 = cx0 + x;
        const X = west ? W - 1 - X0 : X0;
        const y = base + dy;
        if (t.get(X, y) !== 0 && y < base) continue;
        t.set(X, y, P.c(dy === 1 || Math.abs(x) > half - 1 ? 'ice3' : 'white0'));
      }
    }
  }

  // 6. Foam where the back or the head went under.
  if (p.streak) {
    // the back has just slid under: a broken streak of foam along it, up to the rising tail stock
    for (let u = 4; u < len * 0.5; u++) {
      for (const dv of [-1, 0]) {
        if (k.hash(u, dv, 61) > (dv === 0 ? 0.7 : 0.35) - u / len * 0.6) continue;
        const X0 = xt + u;
        const X = west ? W - 1 - X0 : X0;
        t.set(X, yc - 1 + dv, P.c(dv === 0 && u < 9 ? 'white0' : 'ice3'));
      }
    }
  }
  if (p.headFoam) {
    const cxr = xt + len * 0.72;
    for (let a = 0; a < 20; a++) {
      const ang = (a / 20) * Math.PI * 2;
      const X0 = Math.round(cxr + Math.cos(ang) * 4.5);
      const Y = Math.round(yc - 1 + Math.sin(ang) * 3);
      const X = west ? W - 1 - X0 : X0;
      if (!A(X, Y) && k.hash(a, 2, 53) < 0.7) t.set(X, Y, P.c(k.hash(a, 3, 5) < 0.5 ? 'white0' : 'ice3'));
    }
  }
  return t;
}

/** Skin marks on top of the light. */
function mark(sp, q, u, v, s, x, y) {
  if (!q || q.kind !== 'body') return s;
  if (sp.marks === 'mottle') return s >= 2 && s <= 3 && k.hash(x >> 1, y, 41) < 0.25 ? s - 1 : s === 2 && k.hash(x, y, 43) < 0.2 ? 3 : s;
  if (sp.marks === 'knobs') return q.s > 0.8 && (Math.round(u) + Math.round(v * 2)) % 3 === 0 && Math.abs(q.t) < 0.6 ? Math.min(4, s + 2) : s;
  if (sp.marks === 'wrinkles') {
    if (q.s > sp.head) return q.s < sp.head + 0.03 ? Math.max(1, s - 1) : s; // the smooth box head, a crease where it starts
    return s >= 2 && y % 2 === 0 && k.hash(x >> 1, y, 59) < 0.55 ? s - 1 : s; // broken wrinkle rows
  }
  return s;
}

const set = (kind) => (f) => whale(kind, f % 8, f >= 8);

/* ------------------------------------------------------------- blow -- */

/** Mist, darkest first: shadow side, body, lit side, the sunlit top. */
const MIST = ['ice2', 'ice3', 'ice4', 'white0'];
/** Tufts (4-px cells) the mist frays and thins in. */
const TUFTS = k.fbm(64, 16, 2, 431);
/** The blow's foot column (its anchor) and the jet's centre line. */
const BLOW_W = 24;
const JET_X = 12.5;

/**
 * The blow, seen from above at a slant: a misty jet shoots up from the
 * blowhole (0–2) and opens into a bushy fan (3), leaning downwind; then it
 * tears off the sea, drifts, spreads and rains out (4–7). Billows lit from
 * the upper left; the rim frays in noise tufts (not a dither net), and the
 * noise rides with the drifting cloud so it thins in place. The sea churns
 * at the foot, so the foot row is never empty.
 * `ahead` 1 / −1: a sperm whale's blow, lower and slanting forward (east /
 * west) from its blowhole at the front of the head; the form is slanted
 * before the billows are lit, so both directions keep their light upper left.
 */
function blow(f, ahead = 0) {
  const t = new k.Tex(BLOW_W, 24);
  const upright = [18, 10, 4, 2, 1.5, 1, 1, 1][f];
  const top = ahead ? 23.5 - (23.5 - upright) * 0.7 : upright;
  const base = [23.5, 23.5, 23.5, 23.5, 21, 17, 14, 12][f];
  const lean = ahead ? ahead * [0.4, 1.3, 2.8, 4, 4.6, 5.1, 5.6, 6][f] : [0, 0.2, 0.6, 1.2, 2, 2.9, 3.8, 4.6][f];
  const spread = [0.75, 0.85, 0.95, 1, 1.08, 1.16, 1.24, 1.32][f];
  const crown = [0.2, 0.5, 0.85, 1, 1.07, 1.14, 1.2, 1.26][f];
  const fade = [0, 0, 0, 0, 0.22, 0.48, 0.7, 0.88][f];
  const rise = Math.min(f, 3) * 2;
  const puffs = [];
  for (let y = base; y > top + 2; y -= 0.6) {
    const u = (23.5 - y) / (23.5 - top - 2);
    const jitter = (k.hash(Math.round(y + rise), 3, 7) - 0.5) * u;
    puffs.push({ x: JET_X + lean * u ** (ahead ? 1.1 : 1.5) + jitter, y, r: (0.85 + 2.1 * u ** 1.25) * spread });
  }
  const cx = JET_X + lean;
  for (const [dx, dy, r] of [[0, 3, 2.7], [-2.3, 2.6, 2.1], [2.5, 2.4, 2.2], [-1, 1.4, 1.8], [1.4, 1.2, 1.8], [3.8, 3, 1.4], [-3.5, 3.4, 1.3]]) {
    puffs.push({ x: cx + (ahead < 0 ? -dx : dx) * crown, y: top + dy * crown, r: r * crown });
  }
  fx.billow(t, puffs, MIST);
  const dim = { [P.c('white0')]: P.c('ice4'), [P.c('ice4')]: P.c('ice3'), [P.c('ice3')]: P.c('ice2'), [P.c('ice2')]: P.c('ice2') };
  const shift = Math.round(lean);
  t.each((x, y) => {
    const v = t.get(x, y);
    if (!v) return undefined;
    let d = 0;
    for (const p of puffs) d = Math.max(d, 1 - Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) / p.r);
    const n = TUFTS(x - shift, y + rise);
    if (d < 0.3 && n < 0.62 - d) return 0;
    if (fade > 0 && n + d * 0.5 < fade * 1.1) return 0;
    return fade >= 0.4 || (d < 0.3 && n < 0.75) ? dim[v] : undefined;
  });
  for (let j = 0; f >= 4 && j < 6; j++) {
    const x = Math.round(cx - 3 + k.hash(j, 1, 61) * 7);
    const y = Math.round(top + 6 + k.hash(j, 2, 61) * 4 + (f - 4) * 2.5);
    if (y < 23 && !t.get(x, y)) t.set(x, y, P.c('ice3'));
  }
  const foot = [[-2, -1, 0, 1], [-3, -1, 0, 2], [-3, -2, 1, 2], [-4, -1, 3], [-4, 0, 4], [-5, 4], [-5, 5], [-6, 5]][f];
  for (const dx of foot) t.set(BLOW_W / 2 + (ahead < 0 ? -dx : dx), 23, P.c(f < 3 ? 'white0' : 'ice3'));
  return t;
}

/* ------------------------------------------------------------- wake -- */

/** Wake box, and the bow wave tip in the east frames (catalog `mouth`); the runtime puts the tip on the snout. */
const WAKE_W = 24;
const WAKE_TIP = [18, 7];

/**
 * Bow wave of a whale swimming east, frame f of 4: a foam cushion hugging
 * the snout and two arms of short crests trailing back past the flanks, the
 * north arm lit, the south one in pale sea. The crests run back 1 px per
 * frame with a period of 4, so the loop is seamless. West mirrors the form;
 * the light needs no re-applying because it falls by side, not by x.
 */
function bow(f, west) {
  const t = new k.Tex(WAKE_W, 16);
  const put = (x, y, c) => t.set(west ? WAKE_W - 1 - x : x, y, P.c(c));
  const [tx, ty] = WAKE_TIP;
  for (const [dx, dy, c] of [[1, -1, 'white0'], [1, 0, 'white0'], [1, 1, 'ice4'], [2, 0, 'ice3'], [0, -2, 'ice4'], [0, 2, 'ice3'], [-1, -3, 'water7'], [-1, 3, 'water6']]) {
    put(tx + dx, ty + dy, c);
  }
  for (let back = 2; back <= tx; back++) {
    if ((back + f) % 4 >= 2) continue;
    const spread = 2.8 + back * 0.3;
    const fresh = back < 6;
    put(tx - back, Math.round(ty - spread), fresh ? 'ice4' : back < 11 ? 'water7' : 'water6');
    put(tx - back, Math.round(ty + 1 + spread), fresh ? 'ice3' : back < 11 ? 'water6' : 'water5');
  }
  // Churned water where the cushion breaks along the flanks.
  for (let j = 0; j < 3; j++) {
    const back = 1 + Math.floor(k.hash(j, f, 71) * 5);
    const side = k.hash(j, f, 73) < 0.5 ? -1 : 1;
    put(tx - back, ty + side * Math.round(2.5 + back * 0.3), side < 0 ? 'white0' : 'water7');
  }
  return t;
}

/**
 * Footprint, frame r of 4: 0 the sea boils where a whale is about to rise;
 * 1–3 the flat slick a diving fluke leaves, an oval of calmer, paler sea
 * whose broken foam rim spreads and fades. Rim lit on the upper left.
 */
function ring(r) {
  const t = new k.Tex(WAKE_W, 16);
  const rx = [4.5, 6.5, 8.5, 10.5][r];
  const keep = [1, 0.55, 0.4, 0.25][r];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < WAKE_W; x++) {
      const dx = (x + 0.5 - WAKE_W / 2) / rx;
      const dy = (y + 0.5 - 8) / (rx * 0.55);
      const d = Math.hypot(dx, dy);
      const h = k.hash(x, y, 79 + r);
      if (Math.abs(d - 1) * rx < 0.6) {
        if (h > keep) continue;
        const lit = -(dx * 0.6 + dy * 0.8) / Math.max(d, 0.01);
        t.set(x, y, P.c(lit > 0.5 && h < keep * 0.5 ? 'white0' : lit > -0.2 ? 'water7' : 'water6'));
      } else if (d < 1) {
        if (r === 0) { if (h < 0.4) t.set(x, y, P.c(h < 0.06 ? 'white0' : h < 0.2 ? 'water6' : 'water4')); }
        else if ((x + 2 * y) % 4 === 0 && h < keep * 0.6) t.set(x, y, P.c('water4'));
      }
    }
  }
  return t;
}

/** Frames 0–3 bow wave east, 4–7 west, 8–11 footprint ring. */
const wake = (f) => (f < 8 ? bow(f % 4, f >= 4) : ring(f - 8));

/* ---------------------------------------------------------- dolphins -- */

/**
 * Leap box: the waterline row, where the body centre leaves the water and
 * how far (span) and high it flies, px. The whole arc lies in the box, so
 * the runtime only puts the exit point (catalog `mouth`) on the sea.
 */
const LEAP = { w: 32, h: 24, water: 18, exit: 6, span: 20, high: 8 };
/** Body centre along the arc (0 out, 1 back in), frames 0–12; frames 13–15 are splash only. */
const LEAP_P = [-0.2, -0.08, 0.04, 0.16, 0.28, 0.4, 0.52, 0.64, 0.76, 0.88, 0.98, 1.08, 1.2];
/** Frames at which the exit and the entry splash begin. */
const EXIT_SPLASH = 1;
const ENTRY_SPLASH = 10;
/**
 * A dolphin seen from the side, east-facing: spine from the tail stock (u = 0)
 * to the beak (u = len), `prof` half-heights along it (s = u / len); fins as
 * polygons in (u, v), v towards the back. `arch` bends the spine along the
 * arc. Countershaded: dark grey back with a wet sheen, pale belly below the
 * cape line; each ramp is shadow, body, lit, and its `rim` the lower right.
 */
const DOLPHIN = {
  len: 13,
  prof: [[0, 0.55], [0.2, 0.85], [0.45, 1.8], [0.62, 2.0], [0.78, 1.7], [0.88, 1.0], [0.92, 0.6], [1, 0.5]],
  dorsal: [[8.0, 1.2], [6.7, 3.4], [5.0, 4.2], [5.4, 3.0], [5.6, 1.2]],
  flipper: [[9.0, -1.2], [7.9, -2.9], [7.4, -2.9], [8.0, -1.2]],
  fluke: [[0.8, 0], [-1.6, 2.2], [-2.1, 1.9], [-0.9, 0.3], [-0.9, -0.3], [-2.1, -1.9], [-1.6, -2.2]],
  arch: 0.6,
  back: ['rock0', 'rock1', 'ice0'],
  belly: ['ice2', 'ice3', 'white0'],
  rim: { back: 'rock0', belly: 'ice1' },
};
/** Lambert values from which a ramp's body and lit step start. */
const DOLPHIN_CUTS = [0.35, 0.75];
const SPINE_STEP = 0.1;
const SPINE_TAIL = -2.5;

/** Spine samples {u, x, y, tx, ty} (east, tangent towards the beak) with the body centre at arc progress p. */
function leapSpine(p) {
  const { len, arch } = DOLPHIN;
  const th = Math.atan2(4 * LEAP.high * (1 - 2 * p), LEAP.span);
  const ang = (u) => th + arch * (0.5 - Math.max(0, Math.min(len, u)) / len);
  const n = Math.round((len - SPINE_TAIL) / SPINE_STEP);
  const pts = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i <= n; i++) {
    const u = SPINE_TAIL + i * SPINE_STEP;
    if (i > 0) {
      const am = ang(u - SPINE_STEP / 2);
      x += Math.cos(am) * SPINE_STEP;
      y -= Math.sin(am) * SPINE_STEP;
    }
    pts.push({ u, x, y, tx: Math.cos(ang(u)), ty: -Math.sin(ang(u)) });
  }
  const mid = pts[Math.round((len / 2 - SPINE_TAIL) / SPINE_STEP)];
  const ox = LEAP.exit + LEAP.span * p - mid.x;
  const oy = LEAP.water - LEAP.high * 4 * p * (1 - p) - mid.y;
  for (const q of pts) { q.x += ox; q.y += oy; }
  return pts;
}

/** The part of the dolphin under east point (x, y): 'body' with its spine sample and r (−1 belly .. 1 back), or 'fin'. */
function dolphinPart(spine, x, y) {
  let q = spine[0];
  let best = Infinity;
  for (const s of spine) {
    const d = (x - s.x) ** 2 + (y - s.y) ** 2;
    if (d < best) { best = d; q = s; }
  }
  const a = (x - q.x) * q.tx + (y - q.y) * q.ty;
  if (Math.abs(a) > SPINE_STEP) return null; // beyond the beak or the fluke
  const u = q.u + a;
  const v = (x - q.x) * q.ty - (y - q.y) * q.tx;
  const { len, prof } = DOLPHIN;
  if (u >= 0 && u <= len) {
    const hw = lerpProf(prof, u / len);
    if (Math.abs(v) <= hw) return { kind: 'body', q, s: u / len, r: v / hw };
  }
  if (inPoly(DOLPHIN.dorsal, u, v) || inPoly(DOLPHIN.flipper, u, v) || (u < 1 && inPoly(DOLPHIN.fluke, u, v))) return { kind: 'fin' };
  return null;
}

/**
 * Crown splash `a` frames after a dolphin broke the surface at column x0:
 * drops thrown up and out fall back, foam at the foot, then a ring of
 * broken foam spreads and fades. Only into pixels the dolphin leaves free.
 */
function splash(t, free, x0, a, seed) {
  const W = LEAP.water;
  const put = (x, y, name) => { if (free(x, y)) t.set(x, y, P.c(name)); };
  for (let j = 0; j < 10; j++) {
    const vx = (k.hash(j, 1, seed) - 0.5) * 2.4;
    const vy = 1.0 + k.hash(j, 2, seed) * 1.2;
    const tt = a + 0.6;
    const up = vy * tt - 0.3 * tt * tt;
    if (up < 0.5) continue;
    put(Math.round(x0 + vx * tt), Math.round(W - up), a < 2 ? 'white0' : a < 4 ? 'ice3' : 'ice2');
  }
  if (a <= 3) {
    for (let dx = -3; dx <= 3; dx++) {
      if (k.hash(dx, a, seed + 5) > (Math.abs(dx) <= 1 ? 0.95 : 0.6)) continue;
      put(x0 + dx, W, Math.abs(dx) <= 1 && a < 2 ? 'white0' : 'ice3');
    }
  }
  if (a < 2) return;
  const rx = 1.5 + a * 0.75;
  const ry = Math.max(1, rx * 0.4);
  const keep = 1 - (a - 2) / 6;
  for (let y = W - 3; y <= W + 3; y++) {
    for (let x = Math.floor(x0 - rx - 1); x <= Math.ceil(x0 + rx + 1); x++) {
      const dx = (x - x0) / rx;
      const dy = (y - W) / ry;
      const d = Math.hypot(dx, dy);
      if (Math.abs(d - 1) * rx >= 0.55 || k.hash(x - x0, y, seed + 9 + a) >= keep) continue;
      put(x, y, -(dx * 0.6 + dy * 0.8) > 0.3 ? 'ice3' : 'water7');
    }
  }
}

/** Frame f of a dolphin's leap, east-facing (`west`: the form mirrored, lit afresh). */
function dolphin(f, west) {
  const { w: W, h: H, water } = LEAP;
  const t = new k.Tex(W, H);
  const ex = (x) => (west ? W - x : x); // pixel-centre coordinate <-> east geometry
  const parts = new Array(W * H).fill(null);
  const spine = f < LEAP_P.length ? leapSpine(LEAP_P[f]) : null;
  if (spine) {
    // 2×2 samples per pixel: thin parts (beak, tail stock, fin tips) stay unbroken at every angle.
    const SUB = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const centre = dolphinPart(spine, ex(x + 0.5), y + 0.5);
        let hits = 0;
        let any = null;
        for (const [sx, sy] of SUB) { const q = dolphinPart(spine, ex(x + sx), y + sy); if (q) { hits++; any = any || q; } }
        if (centre || hits >= 2) parts[y * W + x] = centre || any;
      }
    }
  }
  const part = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? null : parts[y * W + x]);
  const skin = (x, y) => y <= water && !!part(x, y);

  // Under the surface: the dolphin as a silhouette under a veil of sea, sparser the deeper it swims.
  const VEIL = [16, 11, 8, 6, 4, 2];
  for (let y = water + 1; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!part(x, y) || k.BAYER4[y & 3][x & 3] >= VEIL[Math.min(5, y - water)]) continue;
      const lowerRight = !part(x + 1, y) || !part(x, y + 1);
      const upperLeft = !part(x - 1, y) || !part(x, y - 1);
      t.set(x, y, P.c(lowerRight ? 'water1' : upperLeft ? 'water4' : 'water2'));
    }
  }

  // Above it, skin lit from the upper left: the back's normal turns with the spine.
  for (let y = 0; y <= water; y++) {
    for (let x = 0; x < W; x++) {
      const q = part(x, y);
      if (!q) continue;
      let side = 'back';
      let s;
      if (q.kind === 'body') {
        const r = Math.max(-1, Math.min(1, q.r));
        const nx = (west ? -1 : 1) * q.q.ty * r;
        const ny = -q.q.tx * r;
        const lam = nx * LIGHT[0] + ny * LIGHT[1] + Math.sqrt(1 - r * r) * LIGHT[2];
        s = 0;
        while (s < DOLPHIN_CUTS.length && lam > DOLPHIN_CUTS[s]) s++;
        if (r <= 0.1 - 0.4 * bump(q.s, 0.55, 0.45)) side = 'belly';
      } else {
        s = !skin(x - 1, y) || !skin(x, y - 1) ? 1 : 0;
      }
      const rim = !skin(x + 1, y) && !skin(x, y + 1);
      if (!rim && !skin(x, y + 1)) s = Math.min(s, 1);
      t.set(x, y, P.c(rim ? DOLPHIN.rim[side] : DOLPHIN[side][s]));
    }
  }
  const free = (x, y) => !skin(x, y);

  if (spine) {
    const at = (u) => spine[Math.round((u - SPINE_TAIL) / SPINE_STEP)];
    let under = 0;
    for (let x = 0; x < W; x++) if (part(x, water + 1)) under++;
    let above = false;
    for (let x = 0; x < W && !above; x++) if (skin(x, water - 1)) above = true;
    // A collar of foam where the body cuts the surface.
    if (under && above) {
      let x0 = W;
      let x1 = -1;
      for (let x = 0; x < W; x++) if (part(x, water + 1) || skin(x, water)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
      for (let x = x0 - 3; x <= x1 + 3; x++) {
        const d = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
        if (!d || !free(x, water) || k.hash(Math.round(ex(x + 0.5)), f, 91) < 0.2) continue;
        t.set(x, water, P.c(d === 1 ? 'white0' : d === 2 ? 'ice3' : 'water7'));
      }
      for (const x of [x0 - 1, x1 + 1]) if (free(x, water + 1)) t.set(x, water + 1, P.c('ice3'));
    }
    // The water domes over the beak just before it breaks out.
    if (f === 0) {
      const nose = at(DOLPHIN.len);
      const X = Math.floor(west ? W - nose.x : nose.x);
      for (const [dx, name] of [[-1, 'water7'], [0, 'ice3'], [1, 'water7']]) if (free(X + dx, water)) t.set(X + dx, water, P.c(name));
    }
    // Drops falling off the fluke as it leaves the water.
    if (f >= 3 && f <= 5) {
      const tail = at(-1.5);
      for (let j = 0; j < 3; j++) {
        if (k.hash(j, f, 97) < 0.25) continue;
        const X = Math.floor(west ? W - (tail.x - 0.4 * j) : tail.x - 0.4 * j);
        const Y = Math.floor(tail.y + 1.5 + j * 1.6 + (f - 3) * 1.2);
        if (Y < water && free(X, Y)) t.set(X, Y, P.c(j ? 'water7' : 'ice3'));
      }
    }
  }
  const sx = (x) => Math.round(west ? W - 1 - x : x);
  if (f >= EXIT_SPLASH) splash(t, free, sx(LEAP.exit), f - EXIT_SPLASH, west ? 211 : 201);
  if (f >= ENTRY_SPLASH) splash(t, free, sx(LEAP.exit + LEAP.span), f - ENTRY_SPLASH, west ? 231 : 221);
  return t;
}

module.exports = {
  sprites: {
    whale_great: set('great'),
    whale_baleen: set('baleen'),
    whale_sperm: set('sperm'),
    whale_blow: blow,
    whale_blow_sperm: (f) => blow(f % 8, f >= 8 ? -1 : 1),
    whale_wake: wake,
    dolphin_leap: (f) => dolphin(f % 16, f >= 16),
  },
  textures: {},
};
