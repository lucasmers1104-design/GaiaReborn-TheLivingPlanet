/* =============================================================================
 * SimEarth 2.0 — launch film: on the ground (0–6.95 s)
 * -----------------------------------------------------------------------------
 * The spaceport in the desert at dusk, seen from a raised three-quarter
 * angle: the floodlit rocket on its mount over the flame trench, the lattice
 * tower behind it, the light masts, dunes all round, mesas and the city's
 * lights on the horizon under the afterglow. Vapour vents, the lamps blink,
 * the camera drifts. Then lower and closer on the engine bay, tilting down to
 * the bells in the trench: the igniters spark, the engines light, steam
 * bursts from the mount and rolls out of both ends of the trench, the rocket
 * strains and rises. Back up in the wide angle it climbs out of its smoke,
 * the camera follows, pad and tower fall away, the sky darkens and the first
 * clouds rush past until the cloud deck swallows it (launchLowClouds in
 * launchsky.ts, which goes on above).
 * A pure function of the clock.
 * ========================================================================== */

namespace SE {
  /** The film's cues, s on its clock (FILM_SECONDS long, beats at 0, 3, 6, 9). */
  export const LAUNCH_T = {
    /** Dissolve from the wide angle to the close-up on the engines. */
    close: 1.6,
    /** The igniters spark under the bells. */
    spark: 2.45,
    ignite: 3,
    /** The hold-down lets go. */
    lift: 3.5,
    /** Cut back to the wide angle. */
    wide: 3.75,
    /** Fog of the cloud deck closes over the screen by `breach`. */
    deck: 6.3,
    /** Out above the clouds into sunlight: the sparkle. */
    breach: 6.95,
    /** The rocket draws away upward out of the frame. */
    away: 7.6,
    /** Middle of the dissolve into space. */
    space: 9,
  } as const;

  /** Height of the rocket above its mount, units. */
  export function launchLift(t: number): number {
    const d = t - LAUNCH_T.lift;
    return d <= 0 ? 0 : 40 * d * d + 3 * d;
  }

  /** How far the engines burn: 0 before ignition, 1 at full thrust (slower, without a jump, when still). */
  export function launchThrust(t: number, still: boolean): number {
    return smoothstep(introSpan(t, LAUNCH_T.ignite, LAUNCH_T.ignite + (still ? 0.55 : 0.16)));
  }

  export const LAUNCH_WIDE: LaunchCam = { az: 0.7, el: 0.45, u: 1.1 };
  /** Lower and closer, looking down the flame trench. */
  const CLOSE: LaunchCam = { az: 0.22, el: 0.16, u: 3.3 };

  interface Star { x: number; y: number; lum: number; tw: number }
  interface Block { x: number; w: number; h: number; lit: number[] }

  export interface LaunchGroundKit {
    readonly wide: { rocket: LaunchSprite; pad: LaunchSprite };
    readonly close: { rocket: LaunchSprite; pad: LaunchSprite };
    readonly dunes: LaunchDunes;
    readonly stars: readonly Star[];
    readonly city: readonly Block[];
    readonly puffs: LaunchPuffs;
  }

  export function launchGroundKit(): LaunchGroundKit {
    const rng = new Rng(0x1a0c4e5);
    const stars = Array.from({ length: 170 }, () => ({ x: rng.next(), y: rng.next(), lum: rng.chance(0.08) ? rng.range(0.6, 0.9) : rng.range(0.12, 0.4), tw: rng.range(0, 6.3) }));
    const city: Block[] = [];
    for (let x = 0; x < 1;) {
      const w = rng.range(0.03, 0.07);
      city.push({ x, w, h: rng.chance(0.25) ? rng.range(14, 24) : rng.range(4, 11), lit: Array.from({ length: 7 }, () => rng.next()) });
      x += w + rng.range(0, 0.03);
    }
    const set = (cam: LaunchCam) => ({ rocket: launchRocketSprite(cam), pad: launchPadSprite(cam) });
    return { wide: set(LAUNCH_WIDE), close: set(CLOSE), dunes: new LaunchDunes(), stars, city, puffs: new LaunchPuffs() };
  }

  const PAL = {
    mesa: launchHex('#4a3352'),
    mesaRim: launchHex('#8c5a64'),
    city: launchHex('#2a2140'),
    lampRed: launchHex('#ff5a46'),
    window: launchHex('#f0c64a'),
    windowTeal: launchHex('#4fd6e0'),
  };
  /** Dune sand at dusk, shadow to light, and the haze it fades into toward the horizon. */
  const SAND = ['#3a3050', '#4f3d58', '#684e60', '#8a6467', '#b07e70', '#d29c7e'].map(launchHex);
  const HAZE = launchHex('#b4706a');
  /** Desert dusk sky by height above the horizon, in screen heights. */
  const DUSK: [number, Rgb][] = [
    [0, [0.95, 0.63, 0.38]], [0.06, [0.88, 0.5, 0.42]], [0.16, [0.66, 0.35, 0.49]], [0.3, [0.35, 0.25, 0.48]],
    [0.5, [0.17, 0.16, 0.38]], [0.75, [0.09, 0.1, 0.25]], [1.1, [0.05, 0.07, 0.18]], [1.8, [0.03, 0.04, 0.12]],
  ];
  const VAPOUR = ['#5f6478', '#8c91a5', '#b9bed2', '#e6e8f0'].map(launchHex);
  const SMOKE = ['#4b4655', '#6e6878', '#968f9b', '#bdb5ba', '#e1dad7'].map(launchHex);
  const HOT = ['#5a2828', '#963c2d', '#c85f37', '#e68c46', '#f5b464'].map(launchHex);
  const FIRE: LaunchRgb = [1, 0.55, 0.22];
  /** The pad at dusk: cool sky light, the floodlights as key. */
  const DUSK_LIGHT: LaunchLight = { amb: [0.36, 0.33, 0.47], key: [0.64, 0.6, 0.54] };

  /** One frame's view of the pad: world (0, 0, 0) at screen (ox, oy). */
  interface View {
    readonly t: number;
    readonly still: boolean;
    readonly cam: LaunchCam;
    readonly ox: number;
    readonly oy: number;
    /** Screen row of the horizon. */
    readonly horizon: number;
    /** The camera's climb, units: the sky darkens with it. */
    readonly climb: number;
  }

  const smooth = (v: number): number => smoothstep(clamp(v, 0, 1));

  /** World to screen in a view. */
  function toScreen(v: View, x: number, y: number, z: number): [number, number, number] {
    const [vx, vy, vz] = launchView(v.cam, x, y, z);
    return [v.ox + vx * v.cam.u, v.oy - vy * v.cam.u, vz];
  }

  /** Shake in art px: a jolt at ignition dying into the rumble of the climb; none when still. */
  function shake(t: number, still: boolean, close: boolean): [number, number] {
    if (still || t < LAUNCH_T.ignite) return [0, 0];
    const amp = (close ? 3.4 : 2.2) * Math.exp(-(t - LAUNCH_T.ignite) * 2.2) + 0.9 * (1 - introSpan(t, 5.2, LAUNCH_T.breach));
    const n = Math.floor(t * 30);
    return [Math.round((launchHash(n, 1, 9) - 0.5) * 2 * amp), Math.round((launchHash(n, 2, 9) - 0.5) * 1.4 * amp)];
  }

  /** The ground camera's climb: still, then following the rocket from just after the cut back. */
  function climbOf(t: number): number {
    return launchLift(t) * smooth(introSpan(t, 3.7, 4.65));
  }

  /** The wide angle or the close-up of the pad at t. */
  export function paintPadShot(art: LaunchArt, kit: LaunchGroundKit, t: number, still: boolean, close: boolean): void {
    const { W, H } = art;
    const [sx, sy] = shake(t, still, close);
    let v: View;
    if (close) {
      // Down the engine bay to the bells and the trench, settled before the igniters.
      const tilt = smooth(introSpan(t, LAUNCH_T.close - 0.2, LAUNCH_T.spark + 0.3));
      const oy = Math.round(lerp(H + 22, H * 0.7, still ? 0.4 + 0.6 * tilt : tilt));
      v = { t, still, cam: CLOSE, ox: Math.round(W * 0.42) + sx, oy: oy + sy, horizon: oy - 22, climb: 0 };
    } else {
      const drift = (still ? 4 : 9) * (t - 2);
      const climb = climbOf(t);
      const oy = Math.round(H * 0.8 + climb * LAUNCH_WIDE.u * Math.cos(LAUNCH_WIDE.el));
      v = { t, still, cam: LAUNCH_WIDE, ox: Math.round(W * 0.47 - drift) + sx, oy: oy + sy, horizon: Math.round(H * 0.4 + climb * 0.75), climb };
    }
    const u = v.cam.u;
    const sp = close ? kit.close : kit.wide;
    const lift = launchLift(t);
    const thrust = launchThrust(t, still);
    const fire = thrust * (0.9 + 0.1 * (still ? 1 : launchHash(Math.floor(t * 24), 3, 1)));

    paintSky(art, kit, v);
    paintHorizon(art, kit, v);
    kit.dunes.paint(art, v.cam, v.ox, v.oy, -LAUNCH_PAD.depth, v.horizon, SAND, HAZE);
    // Pools of floodlight on the sand round the slab.
    art.glow(v.ox, v.oy + 14 * u, 70 * u, [0.5, 0.45, 0.4], 0.3 * (1 - 0.5 * thrust), 0.42);
    paintSmoke(art, kit, v, fire, false);

    art.clearDepth();
    art.sprite(sp.pad, v.ox, v.oy, DUSK_LIGHT, 0);
    const [bx, by, bz] = toScreen(v, 0, LAUNCH_PAD.mount + lift, 0);
    const [nx, ny, nz] = toScreen(v, 0, LAUNCH_PAD.mount + lift + LAUNCH_ROCKET.nozzle, 0);
    const light: LaunchLight = fire > 0 ? { ...DUSK_LIGHT, under: { y: ny + 2, reach: 30 * u, c: [1.1 * fire, 0.62 * fire, 0.28 * fire] } } : DUSK_LIGHT;
    art.sprite(sp.rocket, bx, by, light, bz);
    paintLamps(art, v);

    // The jet: onto the deflector while the rocket is low, free once it has climbed; its root again over the
    // smoke, so the fire shows where it leaves the bells.
    const jetLen = Math.min((34 + Math.min(lift, 120) * 0.45) * u * (0.25 + 0.75 * thrust) * Math.cos(v.cam.el), toScreen(v, 0, -1.6, 0)[1] - ny + 1);
    const jetWid = 4.2 * u * (0.6 + 0.4 * thrust), flick = still ? 0.25 : 1;
    if (thrust > 0) launchJet(art, nx, ny, jetLen, jetWid, t, flick, nz + 2);
    paintVapour(art, kit, v, bx, by);
    paintSmoke(art, kit, v, fire, true);
    if (thrust > 0) launchJet(art, nx, ny, jetLen, jetWid, t, flick, nz + 2, 0.4);
    paintBeams(art, v, thrust);
    if (thrust > 0) {
      const glowI = fire * (still ? 0.55 : 0.75) * (close ? 0.5 : 1);
      const low = clamp(1 - lift / 60, 0, 1);
      art.glow(nx, ny + 8 * u, close ? 95 : 72, FIRE, glowI * (0.6 + 0.4 * low), 0.75);
      art.glow(nx, ny + 3 * u, (close ? 9 : 16) * u, [1, 0.85, 0.55], glowI * 0.8);
      for (const side of [-1, 1]) {
        const [ex, ey] = toScreen(v, 0, -3, side * LAUNCH_PAD.half);
        art.glow(ex, ey, (close ? 16 : 24) * u, FIRE, glowI * (side > 0 ? 1 : 0.7) * low);
      }
      // The flash of ignition, gone in a quarter second.
      if (!still) art.glow(nx, ny, H * 0.75, [1, 0.88, 0.66], 0.5 * Math.exp(-(t - LAUNCH_T.ignite) * 12) * thrust);
    }
    paintSparks(art, v, nx, ny);
    if (!close) launchLowClouds(art, kit.puffs, t, bx, by);
  }

  function paintSky(art: LaunchArt, kit: LaunchGroundKit, v: View): void {
    const { W, H } = art;
    const b = art.buf;
    const lift = (v.climb * v.cam.u) / H;
    const warm = new Float32Array(W);
    for (let x = 0; x < W; x++) warm[x] = Math.exp(-(((x - W * 0.04) / (W * 0.6)) ** 2));
    for (let y = 0; y < H; y++) {
      const f = (v.horizon - y) / H + lift * 0.55;
      const c = sampleRamp(DUSK, f);
      const lowK = clamp(1 - f / 0.35, 0, 1) ** 2;
      for (let x = 0, q = y * W * 3; x < W; x++, q += 3) {
        const k = warm[x] * lowK;
        b[q] = c[0] + (1 - c[0]) * k * 0.3;
        b[q + 1] = c[1] * (1 - k * 0.1) + 0.05 * k;
        b[q + 2] = c[2] * (1 - k * 0.4);
      }
    }
    for (const s of kit.stars) {
      const x = Math.floor(s.x * W), y = Math.floor(s.y * H);
      const dark = clamp(((v.horizon - y) / H + lift * 0.55 - 0.42) / 0.3, 0, 1);
      if (dark <= 0) continue;
      const l = s.lum * dark * (v.still ? 1 : 0.75 + 0.25 * Math.sin(v.t * 2.3 + s.tw * 7));
      art.add(x, y, l * 0.9, l * 0.95, l);
    }
  }

  function blink(v: View, phase: number): number {
    if (v.still) return 0.55 + 0.25 * Math.sin(v.t * 2 + phase * 6);
    return (v.t * 0.9 + phase) % 1 < 0.45 ? 1 : 0.12;
  }

  /** Mesas against the afterglow, the city's towers and lights on the right. */
  function paintHorizon(art: LaunchArt, kit: LaunchGroundKit, v: View): void {
    const { W, H } = art;
    const hz = v.horizon;
    if (hz > H + 30) return;
    const pan = (v.ox - W * 0.47) * 0.2;
    const s = v.cam.u > 2 ? 1.6 : 1;
    for (let x = 0; x < W; x++) {
      const wx = (x - pan) / W;
      // Flat-topped mesas: a clipped ridge.
      const butte = 9 * Math.sin(wx * 7.3 + 0.4) + 5 * Math.sin(wx * 17 + 2) - 3;
      const ridge = (butte > 6 ? 11 : butte > 2 ? 7 : Math.max(0, butte) * 2) + 2 + Math.sin(wx * 40) * 0.6;
      const top = Math.round(hz - ridge * s);
      for (let y = Math.max(0, top); y < Math.min(H, hz + 1); y++) {
        const c = y === top && x < W * 0.55 ? PAL.mesaRim : PAL.mesa;
        art.set(x, y, c[0], c[1], c[2]);
      }
    }
    const cityPan = (v.ox - W * 0.47) * 0.3;
    for (const bl of kit.city) {
      const x0 = Math.round(W * (0.62 + bl.x * 0.36) + cityPan), w = Math.max(2, Math.round(bl.w * W * 0.36));
      if (x0 > W || x0 + w < 0) continue;
      const top = Math.round(hz - (bl.h + 1) * s);
      art.rect(x0, top, w, hz + 1 - top, PAL.city);
      for (let k = 0; k < bl.lit.length; k++) {
        const wy = top + 1 + Math.floor(bl.lit[k] * (hz - top - 1));
        const on = v.still ? bl.lit[k] > 0.3 : Math.sin(v.t * 0.7 + bl.lit[k] * 40) > -0.6;
        if (on) art.set(x0 + (k % w), wy, ...(bl.lit[k] > 0.55 ? PAL.windowTeal : PAL.window));
      }
      if (bl.h > 16) art.add(x0 + (w >> 1), top - 1, 0.9 * blink(v, bl.lit[0]), 0.2, 0.15);
    }
  }

  /** Red lamps on the tower's crown, its mast and halfway up. */
  function paintLamps(art: LaunchArt, v: View): void {
    const T = LAUNCH_PAD.tower;
    const spots: [number, number, number, number][] = [[T.x, T.height + T.mast, T.z, 0], [T.x - T.half, T.height, T.z + T.half, 0.5], [T.x + T.half, T.height, T.z + T.half, 0.5], [T.x - T.half, 60, T.z + T.half, 0.25]];
    for (const [x, y, z, ph] of spots) {
      const [px, py] = toScreen(v, x, y, z);
      const on = blink(v, ph);
      art.set(Math.round(px), Math.round(py), ...launchMix(PAL.city, PAL.lampRed, on));
      art.glow(px, py, 3 + 2 * v.cam.u, [1, 0.3, 0.2], 0.5 * on);
    }
  }

  /** Faint fans of light from the masts' lamps onto the rocket, dimmed once the fire outshines them. */
  function paintBeams(art: LaunchArt, v: View, thrust: number): void {
    const dim = 1 - thrust * 0.7;
    const [tx, ty] = toScreen(v, 0, 40, 0);
    for (let k = 0; k < 2; k++) {
      const [lx, ly, lz] = launchMastLamp(k);
      const [x, y] = toScreen(v, lx, ly, lz);
      const len = Math.hypot(tx - x, ty - y);
      const ux = (tx - x) / len, uy = (ty - y) / len;
      for (let s = 3; s < len; s++) {
        const half = 1 + s * 0.14, i = 0.045 * (1 - s / len) * dim;
        for (let o = -half; o <= half; o += 1) art.add(Math.round(x + ux * s - uy * o), Math.round(y + uy * s + ux * o), i, i * 0.97, i * 0.86);
      }
      art.glow(x, y, 4 + 2.5 * v.cam.u, [1, 0.95, 0.8], 0.75 * dim);
    }
  }

  /** Oxygen boil-off falling from the vents in white plumes until the climb tears it away. */
  function paintVapour(art: LaunchArt, kit: LaunchGroundKit, v: View, bx: number, by: number): void {
    const gone = 1 - introSpan(v.t, LAUNCH_T.lift, LAUNCH_T.lift + 0.6);
    if (gone <= 0) return;
    const P = kit.puffs, u = v.cam.u, ce = Math.cos(v.cam.el);
    P.begin(art);
    const rate = 14, life = 1.5, R = LAUNCH_ROCKET.radius;
    // Screen-side vents: at the interstage and the engine bay, on both flanks.
    const vents = [[-R, 59, -1], [R, 61, 1], [-R, 8, -1], [R, 6, 1]] as const;
    vents.forEach(([vx, vy, side], n) => {
      for (let j = Math.ceil((v.t - life) * rate); j <= Math.floor(v.t * rate); j++) {
        const a = v.t - j / rate;
        if (a < 0 || a > life) continue;
        const h = launchHash(j, n, 17), h2 = launchHash(j, n, 18);
        const x = vx + side * (0.3 + (1.4 + 2.2 * h) * a) + 1.6 * a * a + (h2 - 0.5) * 1.5 * a;
        const y = vy - (1 + 2 * h2) * a - 7 * a * a;
        P.puff(bx + x * u, by - y * u * ce, (0.5 + (1.4 + 1.4 * h) * a) * u, 0.55 * (1 - a / life) ** 1.4 * gone, 0.62 + 0.25 * h, 0.16);
      }
    });
    P.paint(art, VAPOUR, undefined, undefined, 0.75);
  }

  /** The igniters' sparks under the bells before the engines light. */
  function paintSparks(art: LaunchArt, v: View, nx: number, ny: number): void {
    const t = v.t, u = v.cam.u;
    if (t < LAUNCH_T.spark || t > LAUNCH_T.ignite + 0.5) return;
    const n = v.still ? 40 : 90;
    for (let k = 0; k < n; k++) {
      const a = t - (LAUNCH_T.spark + (k / n) * (LAUNCH_T.ignite + 0.3 - LAUNCH_T.spark));
      if (a < 0 || a > 0.4) continue;
      const h1 = launchHash(k, 1, 5), h2 = launchHash(k, 2, 5);
      const ang = Math.PI / 2 + (h1 - 0.5) * 2.4, sp = (20 + 28 * h2) * u;
      const x = nx + (h2 - 0.5) * 6 * u + Math.cos(ang) * sp * a, y = ny + Math.sin(ang) * sp * a + 40 * u * a * a;
      const i = (1 - a / 0.4) * (v.still ? 0.5 : 1);
      art.add(Math.round(x), Math.round(y), 1.2 * i, 0.95 * i, 0.5 * i);
      art.add(Math.round(x - Math.cos(ang) * 2), Math.round(y - Math.sin(ang) * 2), 0.6 * i, 0.4 * i, 0.15 * i);
    }
  }

  /**
   * Steam and smoke, in world units: a burst round the mount at ignition, banks rolling out of both trench
   * ends, the column the climb leaves. `front`: the half nearer the camera (painted over the pad), else the rest.
   */
  function paintSmoke(art: LaunchArt, kit: LaunchGroundKit, v: View, fire: number, front: boolean): void {
    const t = v.t, T = LAUNCH_T;
    if (t < T.ignite) return;
    const P = kit.puffs, u = v.cam.u;
    P.begin(art);
    const sp = v.still ? 0.7 : 1;
    const put = (x: number, y: number, z: number, r: number, d: number, l: number): void => {
      const [px, py, pz] = toScreen(v, x, y, z);
      if (pz > 0 === front) P.puff(px, py, r * u, d, l);
    };
    for (let side = -1; side <= 1; side += 2) {
      for (let k = 0; k < 96; k++) {
        const a = t - (T.ignite + 0.06 + k * 0.032);
        if (a < 0) break;
        const h1 = launchHash(k, side + 5, 1), h2 = launchHash(k, side + 5, 2), h3 = launchHash(k, side + 5, 3);
        const z = side * (LAUNCH_PAD.half - 4 + (40 + 45 * h1) * sp * 0.65 * (1 - Math.exp(-a / 0.65)));
        const y = -3 + (1.5 + 7 * h2) * a + 3.2 * a * a;
        const x = (h3 - 0.5) * (6 + 30 * (1 - Math.exp(-a / 0.8)));
        put(x, y, z, 2.5 + (9 + 9 * h3) * (1 - Math.exp(-a / 0.8)) + 2.4 * a, 0.9 * Math.min(1, a / 0.06), 0.45 + 0.35 * h2);
      }
    }
    for (let k = 0; k < 44; k++) {
      const a = t - (T.ignite + 0.1 + k * 0.012);
      if (a < 0) break;
      const h1 = launchHash(k, 9, 1), h2 = launchHash(k, 9, 2), ang = h1 * Math.PI * 2;
      const out = 8 + (16 + 18 * h2) * sp * 0.5 * (1 - Math.exp(-a / 0.5));
      put(Math.cos(ang) * out, 1 + (8 + 12 * h1) * sp * 0.5 * (1 - Math.exp(-a / 0.5)) + 2 * a * a, Math.sin(ang) * out, 1.5 + 8 * (1 - Math.exp(-a / 0.45)) + 2 * a, 0.85 * Math.min(1, a / 0.05), 0.55 + 0.3 * h2);
    }
    if (front) {
      for (let k = 0; k < 110; k++) {
        const b = T.lift + 0.35 + k * 0.028, a = t - b;
        if (a < 0) break;
        const h1 = launchHash(k, 11, 1), h2 = launchHash(k, 11, 2);
        const y = LAUNCH_PAD.mount + launchLift(b) + LAUNCH_ROCKET.nozzle - 5;
        const [px, py] = toScreen(v, (h1 - 0.5) * 4 + (h2 - 0.4) * 5 * a, y + 2 * a, 0);
        P.puff(px, py, (2.5 + 6 * (1 - Math.exp(-a / 0.7)) + 1.8 * a) * u, 0.75 * Math.min(1, a / 0.1), 0.5 + 0.3 * h2);
      }
    }
    const low = clamp(1 - launchLift(t) / 60, 0, 1);
    const [e1x, e1y] = toScreen(v, 0, -3, -LAUNCH_PAD.half), [e2x, e2y] = toScreen(v, 0, -3, LAUNCH_PAD.half);
    const [jx, jy] = toScreen(v, 0, LAUNCH_PAD.mount + launchLift(t) + LAUNCH_ROCKET.nozzle, 0);
    const reach = 16 * u, jetReach = 9 * u + 6, jetEnd = jy + 26 * u;
    const dist = (dx: number, dy: number): number => Math.sqrt(dx * dx + dy * dy);
    P.paint(art, SMOKE, HOT, (x, y) => {
      const h = low > 0 ? Math.max(1.2 - dist(x - e1x, y - e1y) / reach, 1.2 - dist(x - e2x, y - e2y) / reach) * low : 0;
      const dy = y < jy ? jy - y : y > jetEnd ? y - jetEnd : 0;
      return Math.max(h, 1.3 - dist(x - jx, dy) / jetReach) * fire;
    });
  }
}
