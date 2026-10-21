/* =============================================================================
 * SimEarth 2.0 — launch film: the rocket, the pad and the desert in 3/4 view
 * -----------------------------------------------------------------------------
 * The film's solid things are small 3D models, rendered once per camera into
 * sprites: their surfaces are sampled densely (finer than an art pixel),
 * projected orthographically from a raised three-quarter angle and kept by a
 * depth buffer, each sample shaded by the banded light from the upper left.
 * So the rocket is a round cylinder whose bands curve, the pad a slab with
 * top and side faces and a recessed flame trench, the tower a lattice with
 * depth. Every sprite keeps its depth, so the rocket can sink into the pad
 * and the jet into the trench.
 *
 * The desert round the pad is a dune heightfield, drawn per frame column by
 * column front to back (a voxel landscape), flat on the apron by the pad.
 *
 * World units are rocket units: x right, y up, z toward the camera before
 * the camera's turn `az`; the pad's deck top under the rocket is (0, 0, 0).
 * Rocket design (shared with the map's sprite): white body, dark grey bands
 * at interstage and engine bay, a teal nanotech ring and windows, pointed
 * nose, four small fins; steel lattice tower with an orange crown.
 * ========================================================================== */

namespace SE {
  /** A camera: turned `az` about the vertical, looking down by `el`, `u` art px per unit. */
  export interface LaunchCam { readonly az: number; readonly el: number; readonly u: number }

  /** World point to view space: [right, up, depth toward the camera]. */
  export function launchView(c: LaunchCam, x: number, y: number, z: number): [number, number, number] {
    const ca = Math.cos(c.az), sa = Math.sin(c.az), ce = Math.cos(c.el), se = Math.sin(c.el);
    const zr = x * sa + z * ca;
    return [x * ca - z * sa, y * ce - zr * se, y * se + zr * ce];
  }

  /** The key light in view space, from the upper left (as the title globe's sun). */
  const LIGHT = ((v: number[]) => v.map((c) => c / Math.hypot(...v)))([-0.62, 0.55, 0.56]);

  function band(dot: number): number {
    return dot > 0.84 ? 1 : dot > 0.62 ? 0.82 : dot > 0.36 ? 0.64 : dot > 0.08 ? 0.48 : 0.34;
  }

  type V3 = readonly [number, number, number];
  type Mat = readonly [LaunchRgb, LaunchRgb | undefined];

  /** Samples surfaces into a sprite through a depth buffer. */
  class Splat {
    readonly s: { w: number; h: number; ax: number; ay: number; alb: Float32Array; face: Float32Array; emit: Float32Array; on: Uint8Array; depth: Float32Array };
    private readonly ad: number;
    private readonly ca: number;
    private readonly sa: number;
    private readonly ce: number;
    private readonly se: number;

    /** `box`: the model's extent [x0, x1, y0, y1, z0, z1]; `anchor`: the world point the sprite is placed by. */
    constructor(private readonly cam: LaunchCam, box: readonly number[], anchor: V3) {
      this.ca = Math.cos(cam.az); this.sa = Math.sin(cam.az); this.ce = Math.cos(cam.el); this.se = Math.sin(cam.el);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let k = 0; k < 8; k++) {
        const [vx, vy] = launchView(cam, box[k & 1], box[2 + ((k >> 1) & 1)], box[4 + (k >> 2)]);
        x0 = Math.min(x0, vx); x1 = Math.max(x1, vx); y0 = Math.min(y0, vy); y1 = Math.max(y1, vy);
      }
      const [px, py, pd] = launchView(cam, anchor[0], anchor[1], anchor[2]);
      const w = Math.ceil((x1 - x0) * cam.u) + 3, h = Math.ceil((y1 - y0) * cam.u) + 3;
      this.ad = pd;
      this.s = {
        w, h, ax: Math.round((px - x0) * cam.u) + 1, ay: Math.round((y1 - py) * cam.u) + 1,
        alb: new Float32Array(w * h * 3), face: new Float32Array(w * h), emit: new Float32Array(w * h * 3), on: new Uint8Array(w * h),
        depth: new Float32Array(w * h).fill(-Infinity),
      };
    }

    point(x: number, y: number, z: number, nx: number, ny: number, nz: number, m: Mat): void {
      const { ca, sa, ce, se } = this, u = this.cam.u, s = this.s;
      const nzr = nx * sa + nz * ca;
      const vx = nx * ca - nz * sa, vy = ny * ce - nzr * se, vz = ny * se + nzr * ce;
      if (vz < -0.05) return;
      const zr = x * sa + z * ca;
      const sx = Math.floor(s.ax + (x * ca - z * sa) * u), sy = Math.floor(s.ay - (y * ce - zr * se) * u);
      if (sx < 0 || sy < 0 || sx >= s.w || sy >= s.h) return;
      const d = y * se + zr * ce - this.ad, p = sy * s.w + sx;
      if (d <= s.depth[p]) return;
      s.depth[p] = d;
      s.on[p] = 1;
      s.face[p] = band(vx * LIGHT[0] + vy * LIGHT[1] + vz * LIGHT[2]);
      s.alb.set(m[0], p * 3);
      if (m[1]) s.emit.set(m[1], p * 3); else s.emit.fill(0, p * 3, p * 3 + 3);
    }

    /** The parallelogram o + i·a + j·b, facing a × b. */
    quad(o: V3, a: V3, b: V3, m: Mat): void {
      let nx = a[1] * b[2] - a[2] * b[1], ny = a[2] * b[0] - a[0] * b[2], nz = a[0] * b[1] - a[1] * b[0];
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      const na = Math.max(1, Math.ceil(Math.hypot(...a) * this.cam.u * 2.4)), nb = Math.max(1, Math.ceil(Math.hypot(...b) * this.cam.u * 2.4));
      for (let i = 0; i < na; i++) {
        const fi = (i + 0.5) / na;
        for (let j = 0; j < nb; j++) {
          const fj = (j + 0.5) / nb;
          this.point(o[0] + a[0] * fi + b[0] * fj, o[1] + a[1] * fi + b[1] * fj, o[2] + a[2] * fi + b[2] * fj, nx, ny, nz, m);
        }
      }
    }

    box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, m: Mat, top: Mat = m): void {
      const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
      this.quad([x0, y1, z1], [dx, 0, 0], [0, 0, -dz], top);
      this.quad([x0, y0, z1], [dx, 0, 0], [0, dy, 0], m);
      this.quad([x1, y0, z1], [0, 0, -dz], [0, dy, 0], m);
      this.quad([x0, y0, z0], [0, 0, dz], [0, dy, 0], m);
      this.quad([x1, y0, z0], [-dx, 0, 0], [0, dy, 0], m);
    }

    /** A square beam of side `t` from p to q. */
    beam(p: V3, q: V3, t: number, m: Mat): void {
      const d: V3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
      const len = Math.hypot(...d);
      const ref: V3 = Math.abs(d[1]) / len > 0.9 ? [1, 0, 0] : [0, 1, 0];
      const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const unit = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
      const e1 = unit(cross(d, ref)), e2 = unit(cross(d, e1));
      const h = t / 2;
      for (const [a, b] of [[e1, e2], [e2, [-e1[0], -e1[1], -e1[2]] as V3], [[-e1[0], -e1[1], -e1[2]] as V3, [-e2[0], -e2[1], -e2[2]] as V3], [[-e2[0], -e2[1], -e2[2]] as V3, e1]] as const) {
        // Side face: centred on p + a·h, spanning d and b·t, facing a.
        const o: V3 = [p[0] + a[0] * h - b[0] * h, p[1] + a[1] * h - b[1] * h, p[2] + a[2] * h - b[2] * h];
        this.quadFacing(o, d, [b[0] * t, b[1] * t, b[2] * t], a, m);
      }
    }

    private quadFacing(o: V3, a: V3, b: V3, n: V3, m: Mat): void {
      const na = Math.max(1, Math.ceil(Math.hypot(...a) * this.cam.u * 2.4)), nb = Math.max(2, Math.ceil(Math.hypot(...b) * this.cam.u * 2.4));
      for (let i = 0; i < na; i++) {
        for (let j = 0; j < nb; j++) {
          const fi = (i + 0.5) / na, fj = (j + 0.5) / nb;
          this.point(o[0] + a[0] * fi + b[0] * fj, o[1] + a[1] * fi + b[1] * fj, o[2] + a[2] * fi + b[2] * fj, n[0], n[1], n[2], m);
        }
      }
    }

    /** A surface of revolution about the vertical through (cx, cz): radius r(y) for y0..y1, material by height and angle. */
    revolve(cx: number, cz: number, y0: number, y1: number, r: (y: number) => number, mat: (y: number, a: number) => Mat, rMax: number): void {
      const u = this.cam.u;
      const ny = Math.ceil((y1 - y0) * u * 3), na = Math.ceil(Math.PI * 2 * rMax * u * 2.6);
      for (let i = 0; i < ny; i++) {
        const y = y0 + ((i + 0.5) / ny) * (y1 - y0);
        const rr = r(y), slope = (r(y + 0.05) - r(y - 0.05)) / 0.1;
        for (let j = 0; j < na; j++) {
          const a = (j / na) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
          const nl = Math.hypot(1, slope);
          this.point(cx + rr * c, y, cz + rr * s, c / nl, -slope / nl, s / nl, mat(y, a));
        }
      }
    }
  }

  /** Materials. */
  const P = {
      body: launchHex('#f2f0e6'), seam: launchHex('#c3c3c8'), band: launchHex('#4b4b5a'), fin: launchHex('#696478'),
      metal: launchHex('#78737f'), rim: launchHex('#b4afb4'), teal: launchHex('#1e5a5a'), glow: launchHex('#4fd6e0'),
      steel: launchHex('#8c8996'), orange: launchHex('#df8a3a'), red: launchHex('#c4453f'), concrete: launchHex('#9b9691'),
      concreteTop: launchHex('#a5a096'), joint: launchHex('#87827f'), pit: launchHex('#14141c'), soot: launchHex('#2d2a2d'), lamp: launchHex('#fff0c8'),
  };

  /** The rocket's heights above its base, units: body to 96, the nozzles below to -6. */
  export const LAUNCH_ROCKET = { radius: 4.6, top: 96, nozzle: -6, ring: 80, inter: [57.5, 62], slit: 9.2, engine: 9, windows: [66, 76] } as const;
  const NOSE = 15;
  const FIN = 2.6;

  function rocketRadius(y: number): number {
    const R = LAUNCH_ROCKET.radius;
    if (y <= LAUNCH_ROCKET.top - NOSE) return R;
    const s = clamp((LAUNCH_ROCKET.top - y) / NOSE, 0, 1);
    return R * Math.pow(1 - (1 - s) * (1 - s), 0.62);
  }

  /** The rocket for `cam`; anchor: its base centre (where it stands on the mount). */
  export function launchRocketSprite(cam: LaunchCam): LaunchSprite {
    const K = LAUNCH_ROCKET, R = K.radius;
    const half = R + FIN + 0.5;
    const sp = new Splat(cam, [-half, half, K.nozzle - 1, K.top + 1, -half, half], [0, 0, 0]);
    const lit: Mat = [P.body, undefined];
    const glow: Mat = [P.teal, [P.glow[0] * 0.9, P.glow[1] * 0.9, P.glow[2] * 0.9]];
    const line = Math.max(1 / cam.u, 0.8);
    // The windows face the camera, a little to the lit side.
    const aWin = Math.PI / 2 - cam.az + 0.35;
    sp.revolve(0, 0, 0, K.top, rocketRadius, (y, a) => {
      if (y > K.top - 1.4) return [P.band, undefined];
      if (y > K.ring - Math.max(1.2, 1 / cam.u) && y <= K.ring) return glow;
      if (y >= K.inter[0] && y <= K.inter[1]) return [P.band, undefined];
      if (y <= K.engine) return y > K.slit - line ? glow : [P.band, undefined];
      if (y > K.slit && y <= K.slit + line) return glow;
      const da = Math.abs(((a - aWin + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (y > K.windows[0] && y < K.windows[1] && da < Math.max(0.13, 0.6 / (R * cam.u)) && (y - K.windows[0]) % 3.6 < 1.4) return glow;
      if (cam.u > 2 && y < K.inter[0] && y > K.engine && (y - K.engine) % 9.6 < 1 / cam.u) return [P.seam, undefined];
      return lit;
    }, R);
    // Four fins, two either side.
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2, c = Math.cos(a), s = Math.sin(a);
      for (const side of [-1, 1]) {
        const tx = -s * side * 0.28, tz = c * side * 0.28;
        const n = Math.ceil(FIN * cam.u * 2.5), m = Math.ceil(16 * cam.u * 2.5);
        for (let i = 0; i < n; i++) {
          const o = ((i + 0.5) / n) * FIN;
          const yTop = 14 - (9 * o) / FIN, yBot = -0.4 * o;
          for (let j = 0; j < m; j++) {
            const y = yBot + ((j + 0.5) / m) * (yTop - yBot);
            sp.point((R + o) * c + tx, y, (R + o) * s + tz, -s * side, 0, c * side, [P.fin, undefined]);
          }
        }
      }
    }
    // Five bells under the engine bay.
    const bells: [number, number][] = [[0, 0]];
    for (let k = 0; k < 4; k++) bells.push([Math.cos(Math.PI / 4 + (k * Math.PI) / 2) * 2.75, Math.sin(Math.PI / 4 + (k * Math.PI) / 2) * 2.75]);
    for (const [bx, bz] of bells) {
      sp.revolve(bx, bz, K.nozzle, 0, (y) => 0.8 + 0.75 * Math.pow(clamp(-y / -K.nozzle, 0, 1), 1.3), (y) => [y < K.nozzle + 0.8 ? P.rim : P.metal, undefined], 1.6);
    }
    return sp.s;
  }

  /** Slab, mount, tower and masts: where they stand, units. The trench runs along z, its mouths in the slab's front and back. */
  export const LAUNCH_PAD = { half: 30, depth: 6, trench: 4.5, mount: 12, tower: { x: -13, z: 0, half: 4, height: 108, mast: 14, arms: [40, 74] }, masts: [[-28, 28], [28, -28]], mastH: 34 } as const;

  /** The pad for `cam`: slab split by the trench, deflector, mount, tower, two light masts. Anchor: deck top under the rocket. */
  export function launchPadSprite(cam: LaunchCam): LaunchSprite {
    const D = LAUNCH_PAD, T = D.tower, hw = D.half, tr = D.trench;
    const sp = new Splat(cam, [-hw - 1, hw + 1, -D.depth - 1, T.height + T.mast + 1, -hw - 1, hw + 1], [0, 0, 0]);
    const conc: Mat = [P.concrete, undefined], top: Mat = [P.concreteTop, undefined], soot: Mat = [P.soot, undefined];
    const steel: Mat = [P.steel, undefined], dark: Mat = [P.band, undefined], orange: Mat = [P.orange, undefined], red: Mat = [P.red, undefined];
    // The slab either side of the trench; the trench's floor and wall in soot.
    sp.box(-hw, -tr, -D.depth, 0, -hw, hw, conc, top);
    sp.box(tr, hw, -D.depth, 0, -hw, hw, conc, top);
    sp.quad([-tr, -D.depth, hw], [2 * tr, 0, 0], [0, 0, -2 * hw], [P.pit, undefined]);
    sp.quad([-tr + 0.02, -D.depth, hw], [0, 0, -2 * hw], [0, D.depth - 0.3, 0], soot);
    sp.quad([tr - 0.02, -D.depth, -hw], [0, 0, 2 * hw], [0, D.depth - 0.3, 0], soot);
    // The deflector under the rocket splits the jet to both mouths.
    sp.quad([-tr, -1.6, 0], [0, -D.depth + 1.6, 6], [2 * tr, 0, 0], soot);
    sp.quad([-tr, -1.6, 0], [2 * tr, 0, 0], [0, -D.depth + 1.6, -6], soot);
    // Joints in the slab's top, hazard lines along the trench.
    const joint: Mat = [P.joint, undefined], jw = Math.max(0.4, 1.05 / cam.u);
    for (let k = -hw + 10; k < hw; k += 10) {
      if (Math.abs(k) > tr) sp.quad([k - jw / 2, 0.015, hw], [jw, 0, 0], [0, 0, -2 * hw], joint);
      for (const [x0, x1] of [[-hw, -tr], [tr, hw]]) sp.quad([x0, 0.015, k + jw / 2], [x1 - x0, 0, 0], [0, 0, -jw], joint);
    }
    for (const x0 of [-tr - 0.9, tr]) sp.quad([x0, 0.02, hw], [0.9, 0, 0], [0, 0, -2 * hw], orange);
    // The mount: a table on four legs clear of the bells, a ring frame, four hold-downs reaching in to the rocket.
    const m = 8.5;
    for (const [px, pz] of [[-m, -m], [m, -m], [-m, m], [m, m]]) sp.box(px - 1, px + 1, 0, D.mount, pz - 1, pz + 1, dark);
    for (const s of [-1, 1]) {
      sp.box(-m - 1, m + 1, D.mount - 1, D.mount, s * m - 0.6, s * m + 0.6, dark);
      sp.box(s * m - 0.6, s * m + 0.6, D.mount - 1, D.mount, -m - 1, m + 1, dark);
    }
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      sp.beam([cx * m, D.mount - 0.5, cz * m], [cx * 3.4, D.mount - 0.5, cz * 3.4], 1, orange);
    }
    // The tower: four legs, girders round every bay, a diagonal on each face, an orange crown, a striped mast.
    const t = Math.max(0.75, 1 / cam.u), th = T.half, tx = T.x, tz = T.z, bay = 6;
    const corners: [number, number][] = [[tx - th, tz - th], [tx + th, tz - th], [tx + th, tz + th], [tx - th, tz + th]];
    const colour = (y: number): Mat => (y > T.height - 12 ? orange : steel);
    const girder = (y: number): Mat => (y > T.height - 12 ? orange : y % 36 === 0 ? red : steel);
    for (const [cx, cz] of corners) {
      for (let y = 0; y < T.height; y += bay) sp.beam([cx, y, cz], [cx, Math.min(T.height, y + bay), cz], t * 1.2, colour(y));
    }
    for (let y = bay, n = 0; y <= T.height; y += bay, n++) {
      for (let k = 0; k < 4; k++) {
        const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4];
        sp.beam([ax, y, az], [bx, y, bz], t, girder(y));
        if (y - bay >= 0) sp.beam(n % 2 ? [ax, y - bay, az] : [bx, y - bay, bz], n % 2 ? [bx, y, bz] : [ax, y, az], t * 0.8, colour(y));
      }
    }
    for (let y = T.height; y < T.height + T.mast; y += 3) sp.beam([tx, y, tz], [tx, Math.min(T.height + T.mast, y + 3), tz], t, Math.floor((y - T.height) / 3) % 2 ? red : [P.body, undefined]);
    for (const a of T.arms) {
      sp.box(tx + th, -LAUNCH_ROCKET.radius - 1.3, a - 1, a + 1, -1, 1, steel);
      sp.box(-LAUNCH_ROCKET.radius - 1.3, -LAUNCH_ROCKET.radius + 0.2, a - 1.3, a + 1.3, -1.2, 1.2, orange);
    }
    // Light masts at two corners, their lamps facing the rocket.
    for (const [mx, mz] of D.masts) {
      sp.beam([mx, 0, mz], [mx, D.mastH, mz], t, dark);
      sp.box(mx - 1.6, mx + 1.6, D.mastH, D.mastH + 1.6, mz - 1.6, mz + 1.6, dark, [P.lamp, P.lamp]);
    }
    return sp.s;
  }

  /** Where a light mast's lamp is, world units. */
  export function launchMastLamp(k: number): V3 {
    const [mx, mz] = LAUNCH_PAD.masts[k];
    return [mx, LAUNCH_PAD.mastH + 1.6, mz];
  }

  /* -------------------------------------------------------------- desert -- */

  /** The dune field: heights on a grid round the pad, flat on its apron. */
  export class LaunchDunes {
    static readonly CELL = 2.5;
    static readonly N = 360;
    readonly h = new Float32Array(LaunchDunes.N * LaunchDunes.N);
    readonly nx = new Float32Array(LaunchDunes.N * LaunchDunes.N);
    readonly nz = new Float32Array(LaunchDunes.N * LaunchDunes.N);

    constructor() {
      const N = LaunchDunes.N, C = LaunchDunes.CELL;
      const at = (x: number, z: number): number => {
        // Crests across the wind; the steep slip faces turn away from the light, the long backs toward it.
        const p = (x * 0.5 - z * 0.85) / 50 + 0.35 * Math.sin(x * 0.021 + z * 0.013) + 0.22 * Math.sin(z * 0.037 - x * 0.011);
        const f = p - Math.floor(p);
        const crest = f < 0.74 ? Math.pow(f / 0.74, 1.4) : 1 - smoothstep((f - 0.74) / 0.26);
        const big = 0.5 + 0.5 * Math.sin(x * 0.009 + z * 0.006 + 1);
        const apron = smoothstep(clamp((Math.hypot(x, z) - 48) / 34, 0, 1));
        return (crest * (4 + 5 * big) + 3 * big) * apron;
      };
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) this.h[j * N + i] = at((i - N / 2) * C, (j - N / 2) * C);
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const p = j * N + i;
          const gx = (this.h[j * N + Math.min(N - 1, i + 1)] - this.h[j * N + Math.max(0, i - 1)]) / (2 * C);
          const gz = (this.h[Math.min(N - 1, j + 1) * N + i] - this.h[Math.max(0, j - 1) * N + i]) / (2 * C);
          const l = Math.hypot(gx, 1, gz);
          this.nx[p] = -gx / l; this.nz[p] = -gz / l;
        }
      }
    }

    /** Draw the sand under `cam` with world (0, 0, 0) at screen (ox, oy), the ground at y = groundY, up to row `horizon`. */
    paint(art: LaunchArt, cam: LaunchCam, ox: number, oy: number, groundY: number, horizon: number, tones: readonly LaunchRgb[], haze: LaunchRgb): void {
      const N = LaunchDunes.N, C = LaunchDunes.CELL, half = (N / 2) * C;
      const { W, H } = art;
      const ca = Math.cos(cam.az), sa = Math.sin(cam.az), ce = Math.cos(cam.el), se = Math.sin(cam.el), u = cam.u;
      // The light in world space, for the grid's normals.
      const lzr = -LIGHT[1] * se + LIGHT[2] * ce, ly = LIGHT[1] * ce + LIGHT[2] * se;
      const lx = LIGHT[0] * ca + lzr * sa, lz = -LIGHT[0] * sa + lzr * ca;
      const zNear = ((H - oy) / u + groundY * ce) / se + 4;
      const zFar = ((horizon - oy) / u + groundY * ce) / se - 12;
      const step = 0.9 / (u * se);
      const nT = tones.length, b = art.buf;

      for (let sx = 0; sx < W; sx++) {
        const xr = (sx + 0.5 - ox) / u;
        let ybuf = H;
        for (let zr = zNear; zr > zFar && ybuf > horizon; zr -= step) {
          const x = xr * ca + zr * sa, z = -xr * sa + zr * ca;
          const gi = (x + half) / C, gj = (z + half) / C;
          let hgt = 0, nx = 0, nz = 0;
          if (gi >= 0 && gj >= 0 && gi < N - 1 && gj < N - 1) {
            const i0 = gi | 0, j0 = gj | 0, fx = gi - i0, fz = gj - j0, p = j0 * N + i0;
            const w00 = (1 - fx) * (1 - fz), w10 = fx * (1 - fz), w01 = (1 - fx) * fz, w11 = fx * fz;
            hgt = this.h[p] * w00 + this.h[p + 1] * w10 + this.h[p + N] * w01 + this.h[p + N + 1] * w11;
            nx = this.nx[p] * w00 + this.nx[p + 1] * w10 + this.nx[p + N] * w01 + this.nx[p + N + 1] * w11;
            nz = this.nz[p] * w00 + this.nz[p + 1] * w10 + this.nz[p + N] * w01 + this.nz[p + N + 1] * w11;
          }
          const sy = Math.ceil(oy - ((groundY + hgt) * ce - zr * se) * u);
          if (sy >= ybuf) continue;
          const ny = Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz));
          // Flat sand sits on the second lightest tone; slopes toward the light go lighter, away from it darker.
          const lit = nT - 2.2 + (nx * lx + ny * ly + nz * lz - ly) * 7;
          const far = clamp((zNear - zr) / (zNear - zFar), 0, 1);
          for (let y = Math.max(Math.ceil(horizon), sy); y < ybuf; y++) {
            const th = launchDither(sx, y);
            const c = tones[clamp(Math.floor(lit + 0.5 + (th - 0.5) * 0.2), 0, nT - 1)];
            const hz = (Math.floor(far * far * 5 + 0.5) / 5) * 0.9;
            const q = (y * W + sx) * 3;
            b[q] = launchSnap(c[0] + (haze[0] - c[0]) * hz);
            b[q + 1] = launchSnap(c[1] + (haze[1] - c[1]) * hz);
            b[q + 2] = launchSnap(c[2] + (haze[2] - c[2]) * hz);
          }
          ybuf = Math.max(Math.ceil(horizon), sy);
        }
      }
    }
  }
}
