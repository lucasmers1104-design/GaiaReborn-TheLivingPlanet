/* =============================================================================
 * SimEarth 2.0 — the spaceport
 * -----------------------------------------------------------------------------
 * One launch site in the desert near a Nanotech city (src/spaceportlayer.ts),
 * in the four phases it is built in and the empty pad it leaves. Drawn in the
 * map's 3/4 view from above as a 2:1 isometric scene: everything horizontal
 * runs along the two iso axes (a: down to the right, b: down to the left),
 * every block shows its top and its two front faces, light from the upper
 * left (top lightest, left face lit, right face in shade).
 *   pad      the concrete slab with the flame trench cut into it and its
 *            curved deflector, the mount's first course with rebar, the
 *            tower's footing, a tower crane lowering steel onto it, stacked
 *            girders; frames: the hook sways, a welding spark, the crane light
 *   stage    the mount, the squat first stage with its fins in scaffolding,
 *            the tower half grown, the crane lifting its next section; sparks
 *   rocket   the whole rocket against the finished lattice tower, red service
 *            arms attached; the crane gone; lamps and the mast light blink
 *   ready    the arms swung back along the tower, the rocket alone, boil-off
 *            pouring from a vent and rolling off the mount over the slab, red
 *            and white position lights; 8 frames, the vapour's seamless cycle
 *   launched the empty mount and tower, soot round the trench and its mouth
 * Frame 0 of each is the still picture for "Effekte reduzieren".
 * Style: docs/ereignisse-2026-10/stil.md · contract: tools/fx/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');
const P = require('../terrain/palette');
const { billow, crumble } = require('./kit');

const W = 48;
const H = 64;

const put = (t, x, y, name) => t.set(x, y, P.c(name));

function line(t, x0, y0, x1, y1, name) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let s = 0; s <= n; s++) {
    put(t, n === 0 ? x0 : Math.round(x0 + ((x1 - x0) * s) / n), n === 0 ? y0 : Math.round(y0 + ((y1 - y0) * s) / n), name);
  }
}

/* --------------------------------------------------------------- the view -- */

/**
 * Screen position of the slab's back corner (a = b = 0 on its top face). One iso unit along a moves 1 px right and
 * ½ down, along b 1 px left and ½ down; z is height in px above the slab's top.
 */
const X0 = 24;
const Y0 = 38;
const sx = (a, b) => X0 + a - b;
const sy = (a, b, z) => Y0 + (a + b) / 2 - z;

/** Where the ray through pixel (x, y) meets the plane z = const: [a, b]. */
function hitZ(x, y, z) {
  const dx = x + 0.5 - X0;
  const dy = y + 0.5 - Y0 + z;
  return [dy + dx / 2, dy - dx / 2];
}

/** Where it meets the plane b = const: [a, z]. */
function hitB(x, y, b) {
  const a = x + 0.5 - X0 + b;
  return [a, Y0 + (a + b) / 2 - y - 0.5];
}

/** Where it meets the plane a = const: [b, z]. */
function hitA(x, y, a) {
  const b = a - (x + 0.5 - X0);
  return [b, Y0 + (a + b) / 2 - y - 0.5];
}

const within = (v, lo, hi) => v >= lo && v <= hi;

/**
 * A box a0..a1 × b0..b1 × z0..z1. `face(kind, u, v, x, y)` names the colour of each pixel of the faces we see, or
 * null where the face is open: 'top' (u = a, v = b), 'left' facing +b (u = a, v = z), 'right' facing +a (u = b,
 * v = z); through open pixels the far faces 'farL' (a = a0: u = b, v = z) and 'farR' (b = b0: u = a, v = z).
 */
function box(t, [a0, a1], [b0, b1], [z0, z1], face) {
  const pick = (x, y) => {
    let [u, v] = hitZ(x, y, z1);
    if (within(u, a0, a1) && within(v, b0, b1)) { const c = face('top', u, v, x, y); if (c) return c; }
    [u, v] = hitB(x, y, b1);
    if (within(u, a0, a1) && within(v, z0, z1)) { const c = face('left', u, v, x, y); if (c) return c; }
    [u, v] = hitA(x, y, a1);
    if (within(u, b0, b1) && within(v, z0, z1)) { const c = face('right', u, v, x, y); if (c) return c; }
    [u, v] = hitA(x, y, a0);
    if (within(u, b0, b1) && within(v, z0, z1)) { const c = face('farL', u, v, x, y); if (c) return c; }
    [u, v] = hitB(x, y, b0);
    if (within(u, a0, a1) && within(v, z0, z1)) { const c = face('farR', u, v, x, y); if (c) return c; }
    return null;
  };
  for (let y = Math.floor(sy(a0, b0, z1)) - 1; y <= Math.ceil(sy(a1, b1, z0)) + 1; y++) {
    for (let x = Math.floor(sx(a0, b1)) - 1; x <= Math.ceil(sx(a1, b0)) + 1; x++) {
      const c = pick(x, y);
      if (c) put(t, x, y, c);
    }
  }
}

/** A solid box in three tones (top, left face, right face), the back edges of its top lit by `rim`. */
function block(t, A, B, Z, top, left, right, rim = null) {
  box(t, A, B, Z, (f, u, v) => {
    if (f === 'top') return rim && (u < A[0] + 1 || v < B[0] + 1) ? rim : top;
    if (f === 'left') return left;
    if (f === 'right') return right;
    return null;
  });
}

/**
 * Lattice on a face u0..u1 wide from z0 up: a leg at either edge, a girt every `bay` px of height, an X in each bay.
 * 'leg' | 'girt' | 'brace' | null (open).
 */
function lattice(u, z, u0, u1, z0, bay) {
  const s = u - u0;
  const w = u1 - u0;
  if (s < 1 || s > w - 1) return 'leg';
  const q = (((z - z0) % bay) + bay) % bay;
  if (q < 1) return 'girt';
  const f = ((s - 1) / (w - 2)) * (bay - 1) + 0.5;
  return Math.abs(f - q) < 0.75 || Math.abs(bay - f - q) < 0.75 ? 'brace' : null;
}

/**
 * A lattice box: `tone` = { edge, lit, front, shade, dark, far }: the left corner's leg, the left face's girts and
 * braces, the front corner's leg, the right face's mesh, the right corner's leg, and the far faces seen through.
 */
function latticeBox(t, A, B, Z, bay, tone) {
  box(t, A, B, Z, (f, u, v) => {
    if (f === 'top') return null;
    const [u0, u1] = f === 'left' || f === 'farR' ? A : B;
    const part = lattice(u, v, u0, u1, Z[0], bay);
    if (!part) return null;
    if (f === 'left') return part !== 'leg' ? tone.lit : u < u0 + 1 ? tone.edge : tone.front;
    if (f === 'right') return part !== 'leg' ? tone.shade : u > u1 - 1 ? tone.front : tone.dark;
    return tone.far;
  });
}

const STEEL = { edge: 'rock3', lit: 'rock2', front: 'rock2', shade: 'rock1', dark: 'rock0', far: 'rock0' };

/* --------------------------------------------------------------- the slab -- */

/** The slab: its top face a, b ∈ 0..N, its faces T px deep down to the ground. */
const N = 23;
const T = 3;
/** Flame trench: across a, from its far wall along b out through the slab's left face. */
const TR_A = [10.5, 14.5];
/** Launch mount and the rocket's axis on it. */
const MOUNT = { a: [9.5, 15.5], b: [11.5, 17.5], z: 4 };
const RC = { a: 12.5, b: 14.5 };
/** Lattice tower: footprint, height of its top. */
const TOWER = { a: [10, 15], b: [0.5, 5.5], z: 35 };

/** Sand dust in soft clumps along the slab's edges. */
const dust = k.fbm(64, 16, 2, 4501);

/**
 * What the ray through (x, y) sees inside the trench whose far wall stands at b = back: its left wall (in shade),
 * its far wall (lit), else its dark floor; with `deflector`, the deflector's curve rising from the floor to the
 * slab under the rocket, lit the higher it climbs.
 */
function inTrench(x, y, back, deflector) {
  let [u, v] = hitA(x, y, TR_A[0]);
  if (u >= back && within(v, -T, 0)) return 'rock1';
  [u, v] = hitB(x, y, back);
  if (within(u, TR_A[0], TR_A[1]) && within(v, -T, 0)) return deflector ? 'rock3' : 'rock2';
  [u, v] = hitZ(x, y, -T);
  if (deflector && v < back + 4) return v < back + 2 ? 'rock2' : 'rock1';
  return 'rock0';
}

/**
 * The slab: light concrete with darker joints along both axes, the back edges and the left lip lit, sand drifted
 * in soft clumps along its edges; the left face lit, the right one in shade, both sanded at the foot.
 * The trench is cut from b = back out through the left face.
 */
function slab(t, back, deflector) {
  box(t, [0, N], [0, N], [-T, 0], (f, u, v, x, y) => {
    if (f === 'top') {
      if (within(u, TR_A[0], TR_A[1]) && v >= back) return inTrench(x, y, back, deflector);
      const edge = Math.min(u, v, N - u, N - v);
      if (edge < 2.5 && dust(Math.floor(u), Math.floor(v)) < 0.3 + (2.5 - edge) * 0.14) return 'sand2';
      if (u < 1 || v < 1 || v > N - 1) return 'rock4';
      if (u % 5.75 < 1 || v % 5.75 < 1) return 'rock2';
      return 'rock3';
    }
    if (f === 'left') {
      if (within(u, TR_A[0], TR_A[1])) return inTrench(x, y, back, deflector);
      return v < -T + 1 && dust(Math.floor(u), 40) < 0.55 ? 'sand2' : v < -T + 1 ? 'rock1' : 'rock2';
    }
    if (f === 'right') return v < -T + 1 && dust(60, Math.floor(u)) < 0.55 ? 'sand2' : v < -T + 1 ? 'rock0' : 'rock1';
    return null;
  });
}

/** A cast shadow on a top face at height z: the concrete one step darker over a0..a1 × b0..b1. */
function shadow(t, A, B, z) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [a, b] = hitZ(x, y, z);
      if (!within(a, A[0], A[1]) || !within(b, B[0], B[1])) continue;
      const v = t.get(x, y);
      if (P.RAMP_OF[v] === 'rock' && P.STEP_OF[v] >= 2) t.set(x, y, P.shift(v, -1));
    }
  }
}

/**
 * Soot after the launch, in soft clumps: on the mount and round the trench on the slab two steps darker near it,
 * one step further out, and a fan of scorched sand out of the trench's mouth on the ground.
 */
function scorch(t) {
  const n = k.fbm(64, 16, 2, 4417);
  const cx = (TR_A[0] + TR_A[1]) / 2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = t.get(x, y);
      const [a, b] = hitZ(x, y, 0);
      const fuzz = (n(x >> 1, y >> 1) - 0.5) * 0.7;
      if (v && P.RAMP_OF[v] === 'rock' && P.STEP_OF[v] >= 2) {
        const d = Math.hypot((a - cx) / (3.5 + Math.max(0, b - MOUNT.b[0]) * 0.35), (b - 18) / 6.5) + fuzz;
        if (d < 0.65) t.set(x, y, P.shift(v, -2));
        else if (d < 1.05) t.set(x, y, P.shift(v, -1));
      } else if (!v) {
        // The ground beyond the left face, at the slab's foot.
        const [ga, gb] = hitZ(x, y, -T);
        if (gb <= N) continue;
        const d = Math.hypot((ga - cx) / (2.5 + (gb - N) * 0.6), (gb - N) / 5) + fuzz;
        if (d < 0.6) put(t, x, y, 'sand0');
        else if (d < 1) put(t, x, y, 'sand1');
      }
    }
  }
}

/* -------------------------------------------------------------- the mount -- */

/** The launch mount over the trench: lit top, the exhaust opening in its left face; `hole`: open through the top. */
function mount(t, hole) {
  const { a: A, b: B, z } = MOUNT;
  box(t, A, B, [0, z], (f, u, v) => {
    if (f === 'top') {
      if (hole && Math.hypot(u - RC.a, v - RC.b) < 2.4) return u + v < RC.a + RC.b - 1.2 ? 'rock1' : 'rock0';
      return u < A[0] + 1 || v < B[0] + 1 ? 'rock4' : 'rock3';
    }
    if (f === 'left') {
      if (within(u, TR_A[0], TR_A[1]) && v < z - 1) return v > z - 2 ? 'rock1' : 'rock0';
      return 'rock2';
    }
    if (f === 'right') return 'rock1';
    return null;
  });
  // Hold-down clamps either side of the base.
  for (const [a, b] of [[RC.a - 3.2, RC.b + 0.2], [RC.a + 0.2, RC.b - 3.2]]) {
    block(t, [a, a + 1], [b, b + 1], [z, z + 1.5], 'rock2', 'rock1', 'rock0');
  }
}

/** The mount's first course while it is built: its side walls beside the trench, half high, rebar standing out. */
function footing(t) {
  const { a: A, b: B } = MOUNT;
  for (const wa of [[A[0] - 0.5, TR_A[0]], [TR_A[1], A[1] + 0.5]]) {
    block(t, wa, B, [0, 2], 'rock3', 'rock2', 'rock1', 'rock4');
    for (let b = B[0] + 0.5; b < B[1]; b += 2) {
      const x = Math.floor(sx(wa[0] + 0.75, b));
      const y = Math.floor(sy(wa[0] + 0.75, b, 2));
      put(t, x, y - 1, 'rock1');
      put(t, x, y - 2, 'rock1');
    }
  }
}

/* ------------------------------------------------------------- the rocket -- */

/** Rocket radius on screen (px), its heights above the mount: engine band, interstage, teal ring, nose cone. */
const R = 3;
const ENGINE = 6;
const INTERSTAGE = [26, 29];
const RING = [32, 33];
const NOSE = 35;
const TIP = 44;
/** Screen centre column and the base's centre row on the mount. */
const RX = sx(RC.a, RC.b);
const RY = sy(RC.a, RC.b, MOUNT.z);

/**
 * Shell tones across the cylinder, left to right: lit rim, highlight, body, terminator, dark side, for a
 * white and a dark-grey band; the teal ring glows on the lit side.
 */
const SHELL = {
  white: ['ice3', 'white0', 'white0', 'ice3', 'ice2', 'ice1'],
  dark: ['rock2', 'rock3', 'rock3', 'rock2', 'rock1', 'rock0'],
  teal: ['waterWarm2', 'waterWarm2', 'waterWarm2', 'waterWarm2', 'ice2', 'ice1'],
};

/** Radius at height h: a cylinder up to the nose, then an ogive closing to a point. */
function radius(h) {
  if (h <= NOSE) return R;
  const s = (h - NOSE) / (TIP - NOSE);
  return R * Math.sqrt(Math.max(0, 1 - s * s)) * (1 - 0.25 * s);
}

function band(h) {
  if (h < ENGINE || within(h, INTERSTAGE[0], INTERSTAGE[1]) || h > TIP - 1.5) return 'dark';
  if (within(h, RING[0], RING[1])) return 'teal';
  return 'white';
}

/**
 * The rocket from height `from` to `to`, painted as stacked elliptic slices from the bottom up: each pixel keeps the
 * highest slice over it, which is the front of the hull, so bands curve round it as rings do. `open`: the top slice
 * is the open rim of an unfinished stage, dark inside.
 */
function hull(t, from, to, open = false) {
  for (let h = from; h <= to; h += 0.5) {
    const r = radius(h);
    if (r < 0.5) continue;
    const cy = RY - h;
    const ry = r / 2;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(RX - r); x <= Math.ceil(RX + r); x++) {
        const u = (x + 0.5 - RX) / r;
        const v = (y + 0.5 - cy) / ry;
        if (u * u + v * v > 1) continue;
        let c = SHELL[band(h)][Math.min(5, Math.floor(((u + 1) / 2) * 6))];
        if (open && h + 0.5 > to) c = u * u + v * v < 0.45 ? 'rock0' : v < 0 || u < -0.5 ? 'white0' : 'ice2';
        put(t, x, y, c);
      }
    }
  }
}

/**
 * Four fins along the iso axes, swept back from a 12-px root to a 3-px tip, standing on the mount. The two behind
 * (towards −a and −b) are painted before the hull, the two in front after it.
 */
const FIN_OUT = 3;
const FIN_ROOT = 12;
const FIN_TIP = 4;
function fins(t, front) {
  const R_ISO = R / Math.SQRT2;
  const z0 = MOUNT.z;
  const set = front
    ? [['b', 1, 'ice2', 'ice1'], ['a', 1, 'ice3', 'ice2']]
    : [['a', -1, 'white0', 'ice3'], ['b', -1, 'ice2', 'ice1']];
  for (const [axis, dir, body, edge] of set) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const [along, z] = axis === 'b' ? hitA(x, y, RC.a) : hitB(x, y, RC.b);
        const d = (along - (axis === 'b' ? RC.b : RC.a)) * dir - R_ISO;
        const h = z - z0;
        if (d < -0.5 || d > FIN_OUT || h < 0) continue;
        const top = FIN_ROOT - (FIN_ROOT - FIN_TIP) * Math.max(0, d) / FIN_OUT;
        if (h > top) continue;
        put(t, x, y, h < 1 ? 'rock1' : h > top - 1 || d > FIN_OUT - 1 ? edge : body);
      }
    }
  }
}

function rocket(t) {
  fins(t, false);
  hull(t, 0, TIP);
  fins(t, true);
}

/** The first stage alone, open at the top: what stands in the scaffolding. */
const STAGE_TOP = 16;
function stage(t) {
  fins(t, false);
  hull(t, 0, STAGE_TOP, true);
  fins(t, true);
}

/* -------------------------------------------------------------- the tower -- */

/** The lattice tower from its foot up to `top`: lit left face, shaded right face, the far faces dark through it. */
function tower(t, top) {
  // Base plate under its legs.
  block(t, [TOWER.a[0] - 0.5, TOWER.a[1] + 0.5], [TOWER.b[0] - 0.5, TOWER.b[1] + 0.5], [0, 1], 'rock2', 'rock1', 'rock0');
  latticeBox(t, TOWER.a, TOWER.b, [1, top], 5, STEEL);
}

/** The finished tower's head: a red-trimmed platform over its top, a striped lightning mast in its middle. */
function towerHead(t) {
  const z = TOWER.z;
  block(t, [TOWER.a[0] - 0.5, TOWER.a[1] + 0.5], [TOWER.b[0] - 0.5, TOWER.b[1] + 0.5], [z, z + 1.5], 'rock3', 'red1', 'rock1', 'rock4');
  const mx = Math.floor(sx((TOWER.a[0] + TOWER.a[1]) / 2, (TOWER.b[0] + TOWER.b[1]) / 2));
  const my = Math.floor(sy((TOWER.a[0] + TOWER.a[1]) / 2, (TOWER.b[0] + TOWER.b[1]) / 2, z + 1.5));
  for (let y = my - 5; y < my; y++) put(t, mx, y, ((my - y) >> 1) % 2 ? 'red1' : 'white0');
  return [mx, my - 6];
}

/** Heights of the service arms; their middle line along a. */
const ARMS = [11, 20, 29];
const ARM_A = RC.a;

/**
 * Service arms, red on a dark side, along b from the tower's left face. `attached`: across the gap to the hull;
 * otherwise swung back flat along the tower's face.
 */
function arms(t, attached) {
  for (const z of ARMS) {
    if (attached) block(t, [ARM_A - 0.5, ARM_A + 0.5], [TOWER.b[1], RC.b - 2], [z, z + 1], 'red1', 'red1', 'rock0');
    else block(t, [ARM_A - 0.5, ARM_A + 1.5], [TOWER.b[1], TOWER.b[1] + 1], [z, z + 1], 'red1', 'rock1', 'rock0');
  }
}

/** Where an arm meets the hull: its end pixel on screen, for the lamps. */
function armEnd(z) {
  return [Math.floor(sx(ARM_A, RC.b - 2.2)), Math.floor(sy(ARM_A, RC.b - 2.2, z + 1))];
}

/* -------------------------------------------------------------- the crane -- */

/** Tower crane at the slab's right corner: mast footprint, jib height and reach along −a, the trolley's a. */
const CRANE = { a: [18.5, 21.5], b: [1.5, 4.5], z: 34, reach: 4, back: 25.5, trolley: (TOWER.a[0] + TOWER.a[1]) / 2 };
const CB = (CRANE.b[0] + CRANE.b[1]) / 2;

/**
 * The crane: a yellow lattice mast on ballast, the jib running along −a over the tower, the counter-jib along +a
 * with its weight, the cab and the apex with its ties. The hook hangs from the trolley down to height `hookZ`,
 * swung `sway` px; `load(t, x, y, z, sway)` hangs what it carries under the hook's screen point at height z.
 */
function crane(t, hookZ, sway, load) {
  const { a: A, b: B, z, reach, back, trolley } = CRANE;
  const ma = (A[0] + A[1]) / 2;
  const apex = [Math.floor(sx(ma, CB)), Math.floor(sy(ma, CB, z + 6))];
  // Ties from the apex to the jib and the counter-jib, behind the rest.
  line(t, apex[0], apex[1], Math.floor(sx(reach + 3, CB)), Math.floor(sy(reach + 3, CB, z + 2)), 'rock1');
  line(t, apex[0], apex[1], Math.floor(sx(back, CB)), Math.floor(sy(back, CB, z + 2)), 'rock1');
  block(t, [A[0] - 0.5, A[1] + 0.5], [B[0] - 0.5, B[1] + 0.5], [0, 2], 'rock3', 'rock2', 'rock1', 'rock4');
  // Cab under the jib on the mast's far side, its window dark.
  block(t, [A[0] - 1.5, A[0]], [B[0] + 0.5, B[1] - 0.5], [z - 3, z], 'yellow0', 'yellow0', 'orange0');
  put(t, Math.floor(sx(A[0] - 0.8, B[1] - 0.5)), Math.floor(sy(A[0] - 0.8, B[1] - 0.5, z - 1.5)), 'rock0');
  box(t, A, B, [2, z], (f, u, v) => {
    if (f !== 'left' && f !== 'right') return null;
    const [u0, u1] = f === 'left' ? A : B;
    const q = (v - 2) % 4;
    const s = u - u0;
    const part = s < 1 || s > u1 - u0 - 1 || q < 1 || Math.abs(s - q) < 0.6;
    if (!part) return null;
    return f === 'left' ? 'yellow0' : s > u1 - u0 - 1 ? 'yellow0' : 'orange0';
  });
  // Apex: a short pyramid over the mast.
  for (let i = 0; i < 6; i++) {
    put(t, apex[0], apex[1] + i, i < 2 ? 'yellow0' : 'orange0');
    if (i > 2) { put(t, apex[0] - 1, apex[1] + i, 'yellow0'); put(t, apex[0] + 1, apex[1] + i, 'orange0'); }
  }
  // Jib and counter-jib: lattice girders along a, the lit side towards +b.
  const girder = (a0, a1) => box(t, [a0, a1], [CB, CB], [z, z + 2.5], (f, u, v) => {
    if (f !== 'left') return null;
    if (v > z + 1.5) return 'yellow0';
    if (v < z + 0.6) return 'orange0';
    return Math.floor(u) % 2 === 0 ? 'orange0' : null;
  });
  girder(reach, A[1]);
  girder(A[1], back);
  block(t, [back - 2, back], [CB - 1, CB + 1], [z - 3, z], 'rock3', 'rock2', 'rock1');
  // Trolley, hoist rope, hook block.
  const tx = Math.floor(sx(trolley, CB));
  const ty = Math.floor(sy(trolley, CB, z)) + 1;
  put(t, tx, ty, 'rock1');
  put(t, tx + 1, ty, 'rock0');
  const hy = Math.floor(sy(trolley, CB, hookZ));
  line(t, tx, ty + 1, tx + sway, hy - 1, 'rock1');
  put(t, tx + sway, hy, 'rock0');
  put(t, tx + sway - 1, hy, 'rock1');
  load(t, tx + sway, hy + 1, hookZ - 1, sway);
}

/**
 * Loads under the hook at screen (x, y), height z, swung `sway` px (half a unit along +a, half along −b): two
 * slings down to the load's top corners.
 */
function slings(t, x, y, a0, a1, b, zTop, sway) {
  const d = sway / 2;
  line(t, x, y, Math.round(sx(a0 + d, b - d)), Math.round(sy(a0 + d, b - d, zTop)) - 1, 'rock1');
  line(t, x, y, Math.round(sx(a1 + d, b - d)) - 1, Math.round(sy(a1 + d, b - d, zTop)) - 1, 'rock1');
}

/** A bundle of girders along a, lit on top, dark at its end. */
function girders(t, x, y, z, sway) {
  const d = sway / 2;
  const a0 = CRANE.trolley - 3 + d;
  slings(t, x, y, a0 - d, a0 - d + 6, CB, z - 2, sway);
  block(t, [a0, a0 + 6], [CB - 0.5 - d, CB + 0.5 - d], [z - 4, z - 2.5], 'rock3', 'rock2', 'rock0');
}

/** The tower's next section, one lattice bay as the tower is built of. */
function section(t, x, y, z, sway) {
  const d = sway / 2;
  slings(t, x, y, TOWER.a[0], TOWER.a[1], (TOWER.b[0] + TOWER.b[1]) / 2, z - 3, sway);
  latticeBox(t, [TOWER.a[0] + d, TOWER.a[1] + d], [TOWER.b[0] - d, TOWER.b[1] - d], [z - 8, z - 3], 5, STEEL);
}

/* ---------------------------------------------------------- the materials -- */

/** Girders stacked on the slab's left, a pallet of plate and bolts at its front right. */
function stacks(t) {
  block(t, [2, 8], [17, 19], [0, 1], 'rock2', 'rock1', 'rock0');
  block(t, [2.5, 8.5], [17.5, 19.5], [1, 2], 'rock3', 'rock1', 'rock0');
  block(t, [18, 21], [15, 18], [0, 2.5], 'rock4', 'rock2', 'rock1');
}

/* ------------------------------------------------------------ scaffolding -- */

/** Scaffold round the stage on the mount: corner posts, decks with yellow rails every 6 px; `front`: its near half. */
const SCAF = { a: [9.5, 15.5], b: [11.5, 17.5], z: [MOUNT.z, MOUNT.z + 20], decks: [9, 15, 21] };
function scaffold(t, front) {
  const { a: A, b: B, z: Z, decks } = SCAF;
  const post = (a, b) => block(t, [a, a + 0.9], [b, b + 0.9], Z, 'rock3', 'rock2', 'rock1');
  const plank = (Aa, Bb, z) => block(t, Aa, Bb, [z, z + 1], 'yellow0', 'yellow0', 'orange0');
  if (!front) {
    post(A[0], B[0]);
    for (const z of decks) { plank([A[0], A[0] + 1], B, z); plank(A, [B[0], B[0] + 1], z); }
    return;
  }
  // No post at the near corner: it would split the stage down its middle.
  post(A[0], B[1] - 0.9);
  post(A[1] - 0.9, B[0]);
  for (const z of decks) { plank(A, [B[1] - 1, B[1]], z); plank([A[1] - 1, A[1]], B, z); }
}

/* ---------------------------------------------------------------- sparks -- */

/** A welding spark at (x, y): a white flash with sparks flying (frames 0, 2), a dying glow (1), nothing (3). */
function spark(t, x, y, f) {
  if (f === 3) return;
  if (f === 1) {
    put(t, x, y, 'orange0');
    put(t, x - 1, y + 2, 'yellow0');
    put(t, x + 2, y + 3, 'orange0');
    return;
  }
  put(t, x, y, 'white0');
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) put(t, x + dx, y + dy, 'yellow0');
  for (const [dx, dy] of f === 0 ? [[-2, -2], [2, 1], [-2, 2]] : [[2, -2], [-2, 1], [1, 3]]) put(t, x + dx, y + dy, 'orange0');
}

/* ---------------------------------------------------------------- vapour -- */

/** Vapour tones, darkest first, for billow(): shaded underside to sunlit top. */
const VAPOUR = ['ice2', 'ice3', 'white0'];

/**
 * Clouds along a screen path at loop phase ph: `n` a 1/n apart, so after one loop every cloud stands where the one
 * ahead of it stood. Each grows from r0 to r1 and shrinks away over the last fifth; two lumps turn round its middle
 * with the distance gone, so it churns on its way and still lands on itself.
 */
function stream(path, n, r0, r1, ph, turn) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = (i + ph) / n;
    const at = s * (path.length - 1);
    const j = Math.min(path.length - 2, Math.floor(at));
    const u = at - j;
    const [ax, ay] = path[j];
    const [bx, by] = path[j + 1];
    const fade = s > 0.8 ? 1 - (s - 0.8) / 0.2 : 1;
    const r = (r0 + (r1 - r0) * s) * Math.sqrt(fade);
    const x = ax + (bx - ax) * u;
    const y = ay + (by - ay) * u;
    if (r < 0.9) continue;
    out.push({ x, y, r, s });
    for (let l = 0; l < 2; l++) {
      const a = turn * s * Math.PI * 2 + l * Math.PI;
      if (r * 0.7 >= 0.9) out.push({ x: x + Math.cos(a) * r * 0.9, y: y + Math.sin(a) * r * 0.5, r: r * 0.7, s });
    }
  }
  return out;
}

/** Where along its way the vent's plume tears into separate wisps that thin out. */
const TEAR = 0.55;

/**
 * Boil-off at phase ph: a vent under the interstage jets a plume that tumbles down past the rocket's lit side and
 * tears into thinning wisps; cold vapour spills off the mount and rolls out over the slab along both axes.
 */
function vapour(t, ph) {
  const vx = RX - R - 0.5;
  const vy = RY - INTERSTAGE[0] + 1.5;
  const plume = stream([[vx, vy], [vx - 3.5, vy + 1.5], [vx - 6.5, vy + 5.5], [vx - 8.5, vy + 10.5], [vx - 9.5, vy + 16.5]], 5, 1.3, 3.6, ph, 1);
  const v = new k.Tex(W, H);
  for (const s of new Set(plume.filter((p) => p.s > TEAR).map((p) => p.s))) {
    const wisp = new k.Tex(W, H);
    billow(wisp, plume.filter((p) => p.s === s), VAPOUR);
    v.stamp(crumble(wisp, ((s - TEAR) / (1 - TEAR)) * 0.6, 4423), 0, 0);
  }
  const body = new k.Tex(W, H);
  const fx = RX - R + 0.5;
  const fy = RY + 0.5;
  billow(body, [
    { x: vx + 0.6, y: vy + 0.1, r: 1.3 },
    ...plume.filter((p) => p.s <= TEAR),
    { x: fx, y: fy, r: 1.8 },
    { x: RX + R - 0.5, y: fy, r: 1.8 },
    ...stream([[fx, fy], [fx - 6, fy + 3], [fx - 13, fy + 6.5]], 4, 1.7, 3.4, (ph + 0.5) % 1, -1),
    ...stream([[RX + R - 0.5, fy], [RX + R + 5.5, fy + 3], [RX + R + 12.5, fy + 6.5]], 4, 1.7, 3.2, ph, 1),
  ], VAPOUR);
  v.stamp(body, 0, 0);
  t.stamp(v, 0, 0);
}

/* ---------------------------------------------------------------- phases -- */

/** Sway of the crane hook per frame, px. */
const SWAY = [0, 1, 0, -1];
/** Screen point of the tower's top centre at height z. */
const towerTop = (z) => [Math.floor(sx((TOWER.a[0] + TOWER.a[1]) / 2, TOWER.b[1])), Math.floor(sy((TOWER.a[0] + TOWER.a[1]) / 2, TOWER.b[1], z))];

/** Shadows the standing parts cast to the lower right on the slab and the mount. */
function shadows(t, built) {
  shadow(t, [TOWER.a[1], TOWER.a[1] + 3.5], [TOWER.b[0], TOWER.b[1]], 0);
  shadow(t, [CRANE.a[1] + 0.5, CRANE.a[1] + 2], [CRANE.b[0], CRANE.b[1]], 0);
  if (built) shadow(t, [MOUNT.a[1], MOUNT.a[1] + 2.5], MOUNT.b, 0);
}

function phasePad(f) {
  const t = new k.Tex(W, H);
  slab(t, MOUNT.b[0] + 1, true);
  shadow(t, [TOWER.a[1], TOWER.a[1] + 2], [TOWER.b[0], TOWER.b[1]], 0);
  shadow(t, [CRANE.a[1] + 0.5, CRANE.a[1] + 2], [CRANE.b[0], CRANE.b[1]], 0);
  // The tower's footing, one bay on its plates, a welder on its top girt; the mount's first course; materials.
  tower(t, 6);
  footing(t);
  stacks(t);
  crane(t, 16, SWAY[f], girders);
  const [wx, wy] = towerTop(6);
  spark(t, wx - 1, wy, f);
  if (f < 2) put(t, Math.floor(sx(CRANE.reach, CB)) - 1, Math.floor(sy(CRANE.reach, CB, CRANE.z + 2)) - 1, 'red1');
  return t;
}

function phaseStage(f) {
  const t = new k.Tex(W, H);
  slab(t, MOUNT.b[1], false);
  shadows(t, true);
  tower(t, 19);
  mount(t, false);
  shadow(t, [RC.a + 1.5, MOUNT.a[1]], [RC.b - 2, RC.b + 1.5], MOUNT.z);
  scaffold(t, false);
  stage(t);
  scaffold(t, true);
  stacks(t);
  crane(t, 29, SWAY[f], section);
  spark(t, RX + 1, Math.floor(RY - STAGE_TOP) - 1, f);
  const [wx, wy] = towerTop(19);
  spark(t, wx + 1, wy, (f + 2) % 4);
  return t;
}

/** The finished site: slab, shadows, tower with its head, mount; returns the mast light's pixel. */
function site(t, hole) {
  slab(t, MOUNT.b[1], false);
  shadows(t, true);
  tower(t, TOWER.z);
  const mast = towerHead(t);
  mount(t, hole);
  if (!hole) shadow(t, [RC.a + 1.5, MOUNT.a[1]], [RC.b - 2, RC.b + 1.5], MOUNT.z);
  return mast;
}

function phaseRocket(f) {
  const t = new k.Tex(W, H);
  const mast = site(t, false);
  arms(t, true);
  rocket(t);
  // Work lamps at the arms' ends, two by two; the mast light.
  ARMS.forEach((z, i) => { if ((i + (f >> 1)) % 2 === 0) { const [x, y] = armEnd(z); put(t, x + 1, y, 'white0'); } });
  if (f < 2) put(t, mast[0], mast[1], 'red1');
  return t;
}

function phaseReady(f) {
  const t = new k.Tex(W, H);
  const mast = site(t, false);
  arms(t, false);
  rocket(t);
  vapour(t, f / 8);
  // Position lights: the mast's red once a second, a white strobe on the tower head, red at the slab's corners.
  if (f < 2) put(t, mast[0], mast[1], 'red1');
  if (f === 4) put(t, Math.floor(sx(TOWER.a[1] + 0.5, TOWER.b[0])), Math.floor(sy(TOWER.a[1] + 0.5, TOWER.b[0], TOWER.z + 1.5)), 'white0');
  if (f >= 4 && f < 6) {
    put(t, Math.floor(sx(1, N - 1)), Math.floor(sy(1, N - 1, 0)), 'red1');
    put(t, Math.floor(sx(N - 1, 1)), Math.floor(sy(N - 1, 1, 0)), 'red1');
  }
  return t;
}

function phaseLaunched() {
  const t = new k.Tex(W, H);
  site(t, true);
  arms(t, false);
  scorch(t);
  return t;
}

module.exports = {
  sprites: {
    spaceport_pad: phasePad,
    spaceport_stage: phaseStage,
    spaceport_rocket: phaseRocket,
    spaceport_ready: phaseReady,
    spaceport_launched: phaseLaunched,
  },
  textures: {},
};
