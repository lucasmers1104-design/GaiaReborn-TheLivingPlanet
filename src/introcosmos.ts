/* =============================================================================
 * SimEarth 2.0 — intro: the Big Bang and the planets forming
 * -----------------------------------------------------------------------------
 * A point of light; at INTRO_CUES.bang the hit: flash, shockwave, a shell of
 * stars and gas racing outward and cooling from white-hot to teal, blue and
 * violet, settling into a star field and a nebula. From INTRO_CUES.planets a
 * sun ignites, a dust disk swirls round it and gathers into glowing clumps
 * that become planets; one is the player's. The camera closes in so that at
 * INTRO_CUES.flight it sits at the centre with radius introHandoffRadius().
 *
 * Painted in software into a coarse light buffer (ART_SHORT pixels across the
 * short side), tone-mapped with an ordered dither and scaled up sharp, so
 * every glow steps in pixel-art bands. A pure function of the clock: all
 * randomness is drawn once below.
 * ========================================================================== */

namespace SE {
  type Vec3 = readonly [number, number, number];

  const ART_SHORT = 180;
  /** Brightness steps per channel: few in the bang, so faint gas dithers visibly; more from the sun on, so slow glows don't crawl. */
  const LEVELS_BANG = 10;
  const LEVELS_SUN = 18;
  const DITHER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((b) => (b + 0.5) / 16);
  const BANG_COUNT = 1500;
  const FAR_COUNT = 420;
  const DUST_COUNT = 700;
  /** Side of the precomputed nebula field. */
  const NEB = 96;
  /** The disk is seen from a little above: its orbits squash to ellipses this flat. */
  const TILT = 0.38;
  /** Orbital speed at unit radius (Kepler: ω ∝ a^-1.5), radians per second. */
  const KEPLER = 0.02;
  const SUN_R = 0.03;
  const HOME = 2;
  /** The player's planet's place on its orbit at the hand-over: lower right of the sun, as the globe is lit from the upper left. */
  const HOME_AT_FLIGHT = 1.15;
  /** Seconds the player's planet takes to cool once gathered: it finishes as the camera brings it close. */
  const HOME_COOL = 3;

  /** Orbit radius and size in units of the short screen side; `form`: seconds after INTRO_CUES.planets when the clump has gathered. */
  interface Body { readonly a: number; readonly r: number; readonly phase: number; readonly color: Vec3; readonly form: number; readonly ring?: boolean }
  const BODIES: readonly Body[] = [
    { a: 0.11, r: 0.006, phase: 2.2, color: [0.66, 0.54, 0.46], form: 2.3 },
    { a: 0.18, r: 0.01, phase: 4.3, color: [0.92, 0.8, 0.55], form: 2.5 },
    { a: 0.27, r: 0.012, phase: 0, color: [0.3, 0.5, 0.8], form: 2.8 },
    { a: 0.36, r: 0.008, phase: 3.4, color: [0.82, 0.4, 0.27], form: 2.65 },
    { a: 0.47, r: 0.026, phase: 2.55, color: [0.86, 0.68, 0.47], form: 2.4, ring: true },
  ];

  /** Cooling ramps of the bang, temperature 1 → 0: white-hot, then each family's colour, then pale star light. */
  const FAMILIES: readonly Vec3[] = [[0.3, 0.85, 0.9], [0.35, 0.5, 1], [0.72, 0.48, 1]];
  const TEMP_STEPS = 32;
  const COOLING = FAMILIES.map((fam) => {
    const ramp: [number, Rgb][] = [
      [0, [lerp(fam[0], 1, 0.55), lerp(fam[1], 1, 0.55), lerp(fam[2], 1, 0.55)]],
      [0.18, fam], [0.38, [0.55, 0.88, 1]], [0.65, [1, 0.93, 0.78]], [1, [1.6, 1.6, 1.6]],
    ];
    return Array.from({ length: TEMP_STEPS + 1 }, (_, n) => sampleRamp(ramp, n / TEMP_STEPS));
  });
  const DUST_RAMP: [number, Rgb][] = [[0.08, [1, 0.62, 0.32]], [0.22, [0.9, 0.74, 0.52]], [0.4, [0.55, 0.62, 0.82]]];
  /** The disk's colour by radius, 0..DISK_OUT in DISK_STEPS. */
  const DISK_OUT = 0.6;
  const DISK_STEPS = 96;
  const DISK_GRID = 160;
  const DISK_COLORS = Array.from({ length: DISK_STEPS + 1 }, (_, n) => sampleRamp(DUST_RAMP, (n / DISK_STEPS) * DISK_OUT));
  /** Molten rock by heat, coolest first: dull crust, red, orange, white-hot. */
  const LAVA: readonly Vec3[] = [[120, 35, 22], [225, 80, 30], [255, 160, 60], [255, 236, 170]];

  const angleTo = (from: number, to: number): number => ((((to - from + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  const ease = (t: number): number => smoothstep(clamp(t, 0, 1));
  /** Smoother still: no jolt in acceleration where a camera move starts or stops. */
  const glide = (t: number): number => { const u = clamp(t, 0, 1); return u * u * u * (u * (u * 6 - 15) + 10); };

  /** Value noise summed over octaves, n×n, 0..1. */
  function fbm(rng: Rng, n: number): Float32Array {
    const out = new Float32Array(n * n);
    let amp = 0.5;
    for (let cells = 4; cells <= 32; cells *= 2, amp /= 2) {
      const lat = Float32Array.from({ length: (cells + 1) * (cells + 1) }, () => rng.next());
      for (let y = 0; y < n; y++) {
        const fy = (y / n) * cells, iy = Math.floor(fy), ty = smoothstep(fy - iy);
        for (let x = 0; x < n; x++) {
          const fx = (x / n) * cells, ix = Math.floor(fx), tx = smoothstep(fx - ix);
          const o = iy * (cells + 1) + ix;
          out[y * n + x] += amp * lerp(lerp(lat[o], lat[o + 1], tx), lerp(lat[o + cells + 1], lat[o + cells + 2], tx), ty);
        }
      }
    }
    return out;
  }

  export function introCosmos(stage: IntroStage): IntroScene {
    const rng = new Rng(0x0b16ba46);
    const gauss = (): number => (rng.next() + rng.next() + rng.next() - 1.5) / 1.5;

    // The bang's shell: directions on a sphere seen from outside, most near the rim, the rest filling the ball.
    const bx = new Float32Array(BANG_COUNT), by = new Float32Array(BANG_COUNT);
    const bCool = new Float32Array(BANG_COUNT), bLum = new Float32Array(BANG_COUNT), bTw = new Float32Array(BANG_COUNT);
    const bFam = new Uint8Array(BANG_COUNT);
    for (let i = 0; i < BANG_COUNT; i++) {
      const z = rng.range(-1, 1), phi = rng.range(0, Math.PI * 2), rr = Math.sqrt(1 - z * z);
      const k = rng.chance(0.55) ? rng.range(0.8, 1) : Math.cbrt(rng.next());
      bx[i] = rr * Math.cos(phi) * k;
      by[i] = rr * Math.sin(phi) * k;
      bCool[i] = rng.range(0.6, 1.3);
      bLum[i] = rng.chance(0.08) ? rng.range(1, 1.8) : rng.range(0.25, 0.8);
      bTw[i] = rng.range(0, Math.PI * 2);
      bFam[i] = rng.int(FAMILIES.length);
    }
    const far = Array.from({ length: FAR_COUNT }, () => ({ x: rng.next(), y: rng.next(), lum: rng.chance(0.04) ? 1.1 : rng.range(0.12, 0.45), tw: rng.range(0, 6.3), glint: rng.chance(0.04) }));
    const nebA = fbm(rng, NEB), nebB = fbm(rng, NEB);
    for (let p = 0; p < NEB * NEB; p++) {
      nebA[p] = Math.max(0, nebA[p] - 0.44) * 3.2;
      nebB[p] = Math.max(0, nebB[p] - 0.46) * 3.2;
    }

    // The disk: each grain belongs to a body's clump (or none) and orbits until it is pulled in.
    const dBody = new Int8Array(DUST_COUNT), dR = new Float32Array(DUST_COUNT), dA = new Float32Array(DUST_COUNT);
    const dSub = new Int8Array(DUST_COUNT), dOx = new Float32Array(DUST_COUNT), dOy = new Float32Array(DUST_COUNT), dLum = new Float32Array(DUST_COUNT);
    const dCol: Rgb[] = [];
    for (let i = 0; i < DUST_COUNT; i++) {
      const b = rng.chance(0.25) ? -1 : rng.int(BODIES.length);
      dBody[i] = b;
      dR[i] = b < 0 ? rng.range(0.07, 0.56) : Math.max(0.06, BODIES[b].a + gauss() * 0.065);
      dA[i] = rng.range(0, Math.PI * 2);
      dSub[i] = rng.chance(0.5) ? 1 : -1;
      const oa = rng.range(0, Math.PI * 2), od = Math.sqrt(rng.next());
      dOx[i] = Math.cos(oa) * od;
      dOy[i] = Math.sin(oa) * od;
      dLum[i] = rng.range(0.22, 0.6);
      dCol.push(sampleRamp(DUST_RAMP, dR[i]));
    }
    const dW = dR.map((r) => KEPLER * Math.pow(r, -1.5));
    /** Veins of lava on the player's molten planet, in disc coordinates. */
    const veins = fbm(rng, 32);
    // The disk plane on a grid, so a frame costs one sine per sample: radius, the arms' phase, how fast they wind.
    const dgR = new Float32Array(DISK_GRID * DISK_GRID), dgA = new Float32Array(DISK_GRID * DISK_GRID), dgW = new Float32Array(DISK_GRID * DISK_GRID);
    for (let gy = 0; gy < DISK_GRID; gy++) {
      for (let gx = 0; gx < DISK_GRID; gx++) {
        const dx = ((gx + 0.5) / DISK_GRID * 2 - 1) * DISK_OUT, dy = ((gy + 0.5) / DISK_GRID * 2 - 1) * DISK_OUT;
        const r = Math.max(0.01, Math.hypot(dx, dy)), g = gy * DISK_GRID + gx;
        dgR[g] = r;
        dgA[g] = 2 * Math.atan2(dy, dx) + 7 * Math.log(r);
        dgW[g] = (2 * KEPLER) / (r * Math.sqrt(r));
      }
    }
    const radial = new Float32Array(DISK_STEPS + 1);

    const spin = (b: Body): number => KEPLER * Math.pow(b.a, -1.5);
    const angleOf = (b: number, t: number): number => {
      const body = BODIES[b];
      const phase = b === HOME ? HOME_AT_FLIGHT - spin(body) * (INTRO_CUES.flight - INTRO_CUES.planets) : body.phase;
      return phase + spin(body) * (t - INTRO_CUES.planets);
    };

    // The light buffer and its painters, in art pixels.
    const art = document.createElement('canvas');
    const actx = art.getContext('2d');
    if (!actx) throw new Error('SimEarth: 2D context unavailable for the intro cosmos');
    let img = actx.createImageData(1, 1);
    let buf = new Float32Array(3);
    let W = 1, H = 1;

    const add = (x: number, y: number, r: number, g: number, b: number): void => {
      const px = Math.floor(x), py = Math.floor(y);
      if (px < 0 || py < 0 || px >= W || py >= H) return;
      const q = (py * W + px) * 3;
      buf[q] += r; buf[q + 1] += g; buf[q + 2] += b;
    };
    const glow = (cx: number, cy: number, rad: number, c: Vec3, i: number): void => {
      if (i <= 0.02 || rad < 0.5) return;
      const x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(W - 1, Math.ceil(cx + rad));
      const y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(H - 1, Math.ceil(cy + rad));
      const inv = 1 / (rad * rad);
      for (let y = y0; y <= y1; y++) {
        const dy = y + 0.5 - cy;
        for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cx;
          let k = 1 - (dx * dx + dy * dy) * inv;
          if (k <= 0) continue;
          k *= k * i;
          const q = (y * W + x) * 3;
          buf[q] += c[0] * k; buf[q + 1] += c[1] * k; buf[q + 2] += c[2] * k;
        }
      }
    };
    const ring = (cx: number, cy: number, rad: number, c: Vec3, i: number, tilt = 1): void => {
      if (i <= 0.01 || rad < 1) return;
      const n = Math.ceil(rad * 7);
      for (let s = 0; s < n; s++) {
        const a = (s / n) * Math.PI * 2;
        const thin = DITHER[s & 15] < i * 1.5 ? 1 : 0.35;
        add(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad * tilt, c[0] * i * thin, c[1] * i * thin, c[2] * i * thin);
      }
    };
    /** An opaque lit ball: banded light from (lx, ly) in screen space, `heat` glowing molten. */
    const sphere = (cx: number, cy: number, rad: number, c: Vec3, lx: number, ly: number, heat: number, banded: boolean): void => {
      const ll = Math.hypot(lx, ly, 0.5) || 1;
      const Lx = lx / ll, Ly = ly / ll, Lz = 0.5 / ll;
      const r2 = Math.max(rad, 0.6);
      for (let y = Math.floor(cy - r2); y <= Math.ceil(cy + r2); y++) {
        if (y < 0 || y >= H) continue;
        for (let x = Math.floor(cx - r2); x <= Math.ceil(cx + r2); x++) {
          if (x < 0 || x >= W) continue;
          const nx = (x + 0.5 - cx) / r2, ny = (y + 0.5 - cy) / r2, d2 = nx * nx + ny * ny;
          if (d2 > 1) continue;
          const nz = Math.sqrt(1 - d2);
          const lit = nx * Lx + ny * Ly + nz * Lz + (DITHER[(y & 3) * 4 + (x & 3)] - 0.5) * 0.3;
          let k = lit > 0.55 ? 1 : lit > 0.25 ? 0.72 : lit > 0 ? 0.45 : lit > -0.3 ? 0.26 : 0.16;
          if (banded) k *= Math.sin(ny * 9 + nx * 0.6) > 0.2 ? 0.82 : 1;
          const hot = heat * (0.55 + 0.45 * nz);
          const q = (y * W + x) * 3;
          // Opaque, but a little of the glow behind scatters round the night side, so a transit never reads as a black hole.
          buf[q] = Math.max(buf[q] * 0.3, c[0] * k * (1 - heat) + hot * 1.1);
          buf[q + 1] = Math.max(buf[q + 1] * 0.3, c[1] * k * (1 - heat) + hot * 0.42);
          buf[q + 2] = Math.max(buf[q + 2] * 0.3, c[2] * k * (1 - heat) + hot * 0.12);
        }
      }
    };

    /** Tone-map with a white spill, dither to LEVELS, show. */
    const present = (flash: number, levels: number): void => {
      const d = new Uint32Array(img.data.buffer);
      const inv = 1.5 / Math.hypot(W, H);
      const step = 255 / levels;
      for (let y = 0, p = 0, q = 0; y < H; y++) {
        const row = (y & 3) * 4, dy = y - H / 2;
        for (let x = 0; x < W; x++, p += 3, q++) {
          // The flash is brightest at the centre, so it fades as light, not as a flat grey; a black point keeps faint light black space.
          const fl = flash ? flash * clamp(1.2 - Math.sqrt((x - W / 2) * (x - W / 2) + dy * dy) * inv, 0.1, 1) : 0;
          let r = buf[p] + fl - 0.03, g = buf[p + 1] + fl * 0.97 - 0.03, b = buf[p + 2] + fl * 0.9 - 0.03;
          const mx = r > g ? (r > b ? r : b) : g > b ? g : b;
          if (mx < 0.003) { d[q] = 0xff000000; continue; }
          if (mx > 1) { const s = (mx - 1) * 0.5; r += s; g += s; b += s; }
          const th = DITHER[row + (x & 3)];
          const R = Math.min(levels, Math.max(0, Math.floor(r * levels + th))) * step;
          const G = Math.min(levels, Math.max(0, Math.floor(g * levels + th))) * step;
          const B = Math.min(levels, Math.max(0, Math.floor(b * levels + th))) * step;
          // ImageData is RGBA in memory: little-endian ABGR as one word.
          d[q] = (0xff000000 | (B << 16) | (G << 8) | R) >>> 0;
        }
      }
      actx.putImageData(img, 0, 0);
    };

    // The player's planet, drawn once per frame: the real globe, under molten rock while it is young.
    const homeCanvas = document.createElement('canvas');
    const hctx = homeCanvas.getContext('2d', { willReadFrequently: true });
    if (!hctx) throw new Error('SimEarth: 2D context unavailable for the intro planet');
    /**
     * The globe at (cx, cy) radius r (CSS px). With `heat` it is painted in device pixels into homeCanvas, at the
     * same sub-pixel offset as a direct draw, and lava covers it: the edges and the night side crust over first,
     * veins glow longest. Once the lava is gone it is drawn straight, so the flight's frame is pixel-identical.
     */
    const drawHome = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, spinAt: number, heat: number, dpr: number): void => {
      if (r * dpr < 0.5) return;
      if (heat <= 0) {
        stage.planet.draw(ctx, cx, cy, r, spinAt);
        return;
      }
      const R = r * dpr, px = cx * dpr, py = cy * dpr, ext = R * 1.09 + 2;
      const x0 = Math.floor(px - ext), y0 = Math.floor(py - ext), S = Math.ceil(px + ext) - x0;
      if (homeCanvas.width < S) homeCanvas.width = homeCanvas.height = S;
      hctx.clearRect(0, 0, S, S);
      stage.planet.draw(hctx, px - x0, py - y0, R, spinAt);
      const im = hctx.getImageData(0, 0, S, S), d = im.data;
      const lx = px - x0, ly = py - y0;
      for (let y = 0, q = 0; y < S; y++) {
        for (let x = 0; x < S; x++, q += 4) {
          if (d[q + 3] === 0) continue;
          const nx = (x + 0.5 - lx) / R, ny = (y + 0.5 - ly) / R, d2 = nx * nx + ny * ny;
          if (d2 >= 1) {
            // The air glows with the heat below.
            const k = heat * 0.85;
            d[q] = lerp(d[q], 255, k); d[q + 1] = lerp(d[q + 1], 120, k); d[q + 2] = lerp(d[q + 2], 40, k);
            continue;
          }
          const night = Math.max(0, nx * 0.78 + ny * 0.63);
          const v = veins[(((ny * 0.5 + 0.5) * 31) | 0) * 32 + (((nx * 0.5 + 0.5) * 31) | 0)];
          const vein = Math.max(0, 1 - Math.abs(v - 0.5) * 9);
          const local = heat * 1.3 - 0.12 - 0.35 * d2 - 0.3 * night + vein * 0.45 * heat + (DITHER[(y & 3) * 4 + (x & 3)] - 0.5) * 0.12;
          if (local <= 0) continue;
          const lava = LAVA[local > 0.9 ? 3 : local > 0.6 ? 2 : local > 0.3 ? 1 : 0];
          const cover = Math.min(1, local * 2.2);
          d[q] = lerp(d[q], lava[0], cover); d[q + 1] = lerp(d[q + 1], lava[1], cover); d[q + 2] = lerp(d[q + 2], lava[2], cover);
        }
      }
      hctx.putImageData(im, 0, 0);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(homeCanvas, 0, 0, S, S, x0, y0, S, S);
      ctx.restore();
    };

    return {
      draw(f) {
        const c = INTRO_CUES;
        const t = f.t;
        // Past the flight cue only the sky stays, fading under the flight's stars.
        if (t < c.bang - 1 || t >= c.flight + INTRO_HANDOFF_FADE) return;
        const { ctx, w, h, still } = f;
        const dpr = window.devicePixelRatio || 1;
        const m = Math.min(w, h);
        const scale = Math.max(1, Math.round((m * dpr) / ART_SHORT));
        const k = dpr / scale;
        const nw = Math.ceil(w * k), nh = Math.ceil(h * k);
        if (nw !== W || nh !== H) {
          W = art.width = nw;
          H = art.height = nh;
          img = actx.createImageData(W, H);
          buf = new Float32Array(W * H * 3);
        } else buf.fill(0);

        // The camera: one continuous glide from the whole system to the player's planet, which comes to rest at the
        // centre with the hand-over radius. The pan leads the zoom a little; both end at rest.
        const P = c.planets;
        const move = glide(introSpan(t, P + 1.8, c.flight));
        const pan = Math.pow(move, 1.3);
        const zoomE = Math.pow(move, 1.8);
        const home = BODIES[HOME];
        const z0 = 0.9;
        const zEnd = introHandoffRadius(w, h) / (home.r * m);
        const Z = z0 * Math.exp(zoomE * Math.log(zEnd / z0));
        // Everything but the target rushes outward as the camera closes in, so the sun leaves the frame.
        const rush = Z * (1 + 1.6 * zoomE * zoomE);
        const ha = angleOf(HOME, t);
        const hwx = Math.cos(ha) * home.a, hwy = Math.sin(ha) * home.a * TILT;
        const hx = w / 2 + (1 - pan) * hwx * m * Z, hy = h / 2 + (1 - pan) * hwy * m * Z;
        const toX = (x: number): number => (hx + (x - hwx) * m * rush) * k;
        const toY = (y: number): number => (hy + (y - hwy) * m * rush) * k;
        const unit = m * Z * k;
        // Background parallax: the sky barely moves as the camera closes in.
        const zs = Math.pow(Z, 0.12);
        const skyX = W / 2 - pan * hwx * m * k * 0.3, skyY = H / 2 - pan * hwy * m * k * 0.3;

        // Before the bang: a point of light gathering, motes falling into it.
        const s = t - c.bang;
        const shake = still || s < 0 ? 0 : 3 * Math.exp(-s * 7);
        const ox = W / 2 + Math.round(shake * Math.sin(s * 90)), oy = H / 2 + Math.round(shake * Math.cos(s * 71));
        const diag = Math.hypot(W, H);
        if (s < 0) {
          const p = introSpan(t, c.bang - 1, c.bang), i = p * p * (1 + 0.12 * Math.sin(t * 37));
          glow(ox, oy, 2 + 6 * i, [0.7, 0.85, 1], 0.6 * i);
          glow(ox, oy, 8 + 50 * i, [0.45, 0.7, 1], 1.4 * i);
          add(ox, oy, 1 + 3 * i, 1 + 3 * i, 1 + 3 * i);
          // Long cross spikes, so the point reads past the logo in front of it.
          const len = Math.round(3 + 60 * i);
          for (let a = 1; a <= len; a++) {
            const v = 1.6 * i * (1 - a / (len + 1));
            add(ox + a, oy, v, v, v); add(ox - a, oy, v, v, v); add(ox, oy + a, v, v, v); add(ox, oy - a, v, v, v);
          }
          const q = introSpan(t, c.bang - 0.55, c.bang), mote = 1.6 * q * (1 - q);
          if (mote > 0) for (let n = 0; n < 60; n++) {
            const r = diag * 0.3 * (1 - q) * (1 - q) * (0.5 + bLum[n]);
            add(ox + bx[n] * r, oy + by[n] * r, mote * 0.7, mote * 0.85, mote);
          }
        }

        let flash = 0;
        // Toward the hand-over the sky thins to the flight's sparser stars.
        const handoff = 1 - introSpan(t, c.flight, c.flight + INTRO_HANDOFF_FADE);
        const thin = (1 - 0.55 * introSpan(t, c.flight - 1.6, c.flight)) * handoff;
        if (s >= 0) {
          const sp = still ? s * 0.6 : s;
          const out = 1 - Math.exp(-sp * 2.2);
          const rmax = diag * 0.6 * zs;
          // The gas: a fixed nebula blown up from the centre, glowing hot, then cooling to a calm backdrop.
          const nebI = (0.35 + 1.4 * Math.exp(-sp * 1.3)) * (still ? 0.8 : 1) * (1 - introSpan(t, c.flight - 4, c.flight - 0.4) * 0.65)
            * (1 - introSpan(t, c.flight - 1.6, c.flight - 0.2));
          const heat = Math.exp(-sp * 1.1);
          const E = diag * 0.62 * zs * (0.08 + 0.92 * out + 0.015 * sp);
          if (nebI > 0.01) {
            const shell = Math.exp(-sp * 0.5);
            const ex = ox + skyX - W / 2, ey = oy + skyY - H / 2;
            const tr = 0.15 + 0.3 * heat, tg = 0.55 + 0.4 * heat, tb = 0.62 + 0.38 * heat;
            const vr = 0.42 + 0.58 * heat, vg = 0.22 + 0.7 * heat, vb = 0.75 + 0.25 * heat;
            // Sampled on 2×2 blocks: the gas is soft, and the dither in present() breaks the blocks up again.
            for (let y = 0; y < H; y += 2) {
              const dy = (y + 1 - ey) / E;
              if (dy <= -1 || dy >= 1) continue;
              for (let x = 0; x < W; x += 2) {
                const dx = (x + 1 - ex) / E, rho2 = dx * dx + dy * dy;
                if (rho2 >= 1) continue;
                const sh = Math.max(0, 1 - ((rho2 - 0.67) / 0.3) ** 2);
                const mask = (1 - rho2) * lerp(1, sh * sh * 2.2, shell) * nebI;
                const fx = (dx * 0.5 + 0.5) * (NEB - 1), fy = (dy * 0.5 + 0.5) * (NEB - 1);
                const ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy, o = iy * NEB + ix;
                const a = lerp(lerp(nebA[o], nebA[o + 1], tx), lerp(nebA[o + NEB], nebA[o + NEB + 1], tx), ty) * mask;
                const b = lerp(lerp(nebB[o], nebB[o + 1], tx), lerp(nebB[o + NEB], nebB[o + NEB + 1], tx), ty) * mask;
                if (a + b < 0.004) continue;
                const base = (a + b) * 0.12;
                const cr = a * tr + b * vr + base * 0.3, cg = a * tg + b * vg + base * 0.35, cb = a * tb + b * vb + base;
                for (let q = (y * W + x) * 3, n = 0; n < 4; n++) {
                  const qq = q + ((n & 1) + (n >> 1) * W) * 3;
                  if ((n & 1 && x + 1 >= W) || (n >> 1 && y + 1 >= H)) continue;
                  buf[qq] += cr; buf[qq + 1] += cg; buf[qq + 2] += cb;
                }
              }
            }
          }

          // The fireball, the shockwaves and the flash.
          const fire = Math.exp(-sp * 2.4) * (still ? 1.1 : 3.2);
          glow(ox, oy, Math.min(diag * 0.35, 6 + sp * diag * 0.5), [1, 0.95, 0.85], fire);
          glow(ox, oy, 3 + sp * 8, [1, 1, 1], fire * 0.8);
          if (!still) flash = 4 * Math.exp(-s * 11);
          const wave = still ? 0.5 : 1;
          ring(ox, oy, diag * 0.75 * (1 - Math.exp(-sp * 2.8)), [1, 0.96, 0.9], 1.6 * Math.exp(-sp * 1.7) * wave);
          ring(ox, oy, diag * 0.6 * (1 - Math.exp(-sp * 1.5)), [0.35, 0.85, 0.9], 0.9 * Math.exp(-sp * 1.3) * wave);

          // The shell of stars: racing out with trails while hot, then twinkling where they came to rest.
          const vel = rmax * 2.2 * Math.exp(-sp * 2.2);
          const reach = rmax * (out + 0.012 * sp);
          const bright = 0.4 + 2.4 * Math.exp(-sp * 1.6);
          const sx = ox + skyX - W / 2, sy = oy + skyY - H / 2;
          for (let i = 0; i < BANG_COUNT; i++) {
            const x = sx + bx[i] * reach, y = sy + by[i] * reach;
            if (x < -8 || y < -8 || x > W + 8 || y > H + 8) continue;
            const temp = Math.exp(-sp * bCool[i]);
            const col = COOLING[bFam[i]][Math.round(temp * TEMP_STEPS)];
            const lum = bLum[i] * (bLum[i] > 0.9 ? handoff : thin) * bright * (0.75 + 0.25 * Math.sin(t * (2 + bLum[i] * 3) + bTw[i]));
            add(x, y, col[0] * lum, col[1] * lum, col[2] * lum);
            const len = still ? 0 : Math.min(6, Math.floor(vel * Math.hypot(bx[i], by[i]) * 0.025));
            if (len > 0) {
              const d = Math.hypot(bx[i], by[i]) || 1, ux = bx[i] / d, uy = by[i] / d;
              for (let n = 1; n <= len; n++) {
                const tl = lum * (1 - n / (len + 1)) * 0.7;
                add(x - ux * n, y - uy * n, col[0] * tl, col[1] * tl, col[2] * tl);
              }
            }
          }
          // The far sky settles in behind.
          const farIn = introSpan(t, c.bang + 0.8, c.bang + 3.5);
          if (farIn > 0) for (const st of far) {
            const x = skyX + (st.x - 0.5) * W * zs, y = skyY + (st.y - 0.5) * H * zs;
            const l = st.lum * thin * farIn * (0.7 + 0.3 * Math.sin(t * 1.7 + st.tw * 3) * Math.sin(t * 0.9 + st.tw));
            add(x, y, l * 0.9, l * 0.95, l);
            if (st.glint) {
              const g = l * 0.45;
              add(x + 1, y, g, g, g); add(x - 1, y, g, g, g); add(x, y + 1, g, g, g); add(x, y - 1, g, g, g);
            }
          }
        }

        if (t >= P - 1) {
          const after = t - P;
          const sxp = toX(0), syp = toY(0), sr = SUN_R * unit;
          const sunK = 1 - introSpan(t, c.flight - 1.4, c.flight - 0.3);
          // The collapse: a red cloud gathers and shrinks; on the music's loudest hit it ignites.
          const gather = introSpan(t, P - 1, P);
          const ign = ease(introSpan(t, P - 0.04, P + 0.3));
          glow(sxp, syp, sr * (10 - 7 * gather), [1, 0.4, 0.18], 0.55 * gather * gather * (1 - ign));
          const burst = after <= 0 ? 0 : still ? Math.sin(Math.PI * introSpan(after, 0, 1.6)) * 0.35 : Math.exp(-after * 2.2);
          const settle = ign * (1 + 0.03 * Math.sin(t * 5)) * sunK;
          glow(sxp, syp, sr * (3.5 + 3 * ign + 7 * burst), [1, 0.6, 0.25], 0.75 * settle + burst * 1.1);
          glow(sxp, syp, sr * (1.5 + 0.5 * ign + burst), [1, 0.85, 0.55], 0.9 * settle + burst * 0.8);
          glow(sxp, syp, sr * 1.25, [1, 0.92, 0.75], 5 * settle);
          if (!still && burst > 0.02) {
            // A lens streak across the frame, as a camera would catch the flare.
            const len = Math.round(unit * (0.35 + 0.5 * after)), v0 = burst * 1.4;
            for (let a = 1; a <= len; a++) {
              const v = v0 * (1 - a / (len + 1)) ** 2;
              add(sxp + a, syp, v, v * 0.85, v * 0.6); add(sxp - a, syp, v, v * 0.85, v * 0.6);
              if (a < len / 4) { add(sxp, syp + a, v * 0.5, v * 0.4, v * 0.3); add(sxp, syp - a, v * 0.5, v * 0.4, v * 0.3); }
            }
          }
          const ringR = after > 0 ? after * 0.4 : -1;
          if (after > 0) ring(sxp, syp, ringR * unit, [1, 0.8, 0.45], 0.7 * Math.exp(-after * 1.6) * (still ? 0.4 : 1), TILT);

          // The disk as a soft field: spiral arms wound tighter by its own rotation, lit by the ignition's ring as it
          // passes, and gaps opening where the planets sweep their orbits clear.
          const swirl = ease(introSpan(t, P - 0.8, P + 1.2));
          const clump = BODIES.map((b) => ease(introSpan(t, P + 0.6 + b.form * 0.2, P + b.form)));
          const diskI = swirl * (1 - 0.8 * ease(introSpan(t, P + 2, P + 3.6))) * (1 - ease(introSpan(t, c.flight - 3.2, c.flight - 1.8)));
          if (diskI > 0.01) {
            const sc = 1 + 0.9 * (1 - swirl), twist = 1.4 * (1 - swirl);
            const ext = DISK_OUT * sc * m * rush * k;
            const x0 = Math.max(0, Math.floor(sxp - ext)) & ~1, x1 = Math.min(W - 1, Math.ceil(sxp + ext));
            const y0 = Math.max(0, Math.floor(syp - ext * TILT)) & ~1, y1 = Math.min(H - 1, Math.ceil(syp + ext * TILT));
            const inv = 1 / (m * rush * k * sc), age = t - P + 3;
            // Everything that depends on the radius alone, once per frame: edges, the gaps the planets clear, the ring.
            for (let n = 0; n <= DISK_STEPS; n++) {
              const r = (n / DISK_STEPS) * DISK_OUT;
              let dens = r < 0.035 ? 0 : Math.min(1, (r - 0.035) / 0.05) * (1 - r / DISK_OUT) ** 1.4 * diskI * 0.75;
              for (let b = 0; b < BODIES.length; b++) {
                const g = (r - BODIES[b].a) / (b === 4 ? 0.04 : 0.022);
                dens *= 1 - 0.85 * clump[b] * Math.exp(-g * g);
              }
              if (ringR > 0) { const g = (r - ringR) / 0.05; dens *= 1 + 1.4 * Math.exp(-g * g - after * 1.2); }
              radial[n] = dens;
            }
            const gs = DISK_GRID / (2 * DISK_OUT), spinA = 2 * twist;
            for (let y = y0; y <= y1; y += 2) {
              const gy = Math.floor((((y + 1 - syp) * inv) / TILT) * gs + DISK_GRID / 2);
              if (gy < 0 || gy >= DISK_GRID) continue;
              for (let x = x0; x <= x1; x += 2) {
                const gx = Math.floor((x + 1 - sxp) * inv * gs + DISK_GRID / 2);
                if (gx < 0 || gx >= DISK_GRID) continue;
                const g = gy * DISK_GRID + gx, r = dgR[g];
                if (r >= DISK_OUT) continue;
                const bin = Math.round((r / DISK_OUT) * DISK_STEPS), base = radial[bin];
                if (base < 0.004) continue;
                const dens = base * (0.62 + 0.38 * Math.sin(dgA[g] - dgW[g] * age + spinA));
                const col = DISK_COLORS[bin];
                const cr = col[0] * dens, cg = col[1] * dens, cb = col[2] * dens;
                for (let n = 0, q = (y * W + x) * 3; n < 4; n++) {
                  if ((n & 1 && x + 1 >= W) || (n >> 1 && y + 1 >= H)) continue;
                  const qq = q + ((n & 1) + (n >> 1) * W) * 3;
                  buf[qq] += cr; buf[qq + 1] += cg; buf[qq + 2] += cb;
                }
              }
            }
          }

          // A few grains over it: orbiting, then streaming along their orbit into a clump, warming as they crowd.
          const eaten = BODIES.map((b) => 1 - introSpan(t, P + b.form - 0.3, P + b.form + 0.4));
          const split = BODIES.map((b, n) => (n === HOME ? 0.45 * (1 - ease(introSpan(t, P + 1.2, P + b.form))) : 0));
          const bodyA = BODIES.map((_, n) => angleOf(n, t));
          const freeFade = 1 - introSpan(t, c.flight - 3, c.flight - 1.2);
          for (let i = 0; i < DUST_COUNT; i++) {
            const b = dBody[i];
            let r = dR[i] * (1 + 0.9 * (1 - swirl));
            let a = dA[i] + dW[i] * (t - P) - 1.4 * (1 - swirl);
            let px = 0, py = 0, alpha = swirl * 0.6, warm = 0;
            if (b >= 0) {
              const da = angleTo(a, bodyA[b] + dSub[i] * split[b]);
              const pull = ease(clump[b] * 1.6 - 0.6 * Math.abs(da) / Math.PI);
              a += da * pull;
              r = lerp(r, BODIES[b].a, pull);
              const spread = Math.min(BODIES[b].r * 2.5, 0.025) * pull;
              px = dOx[i] * spread; py = dOy[i] * spread;
              alpha *= eaten[b] * (1 - 0.4 * pull);
              warm = pull;
            } else alpha *= freeFade;
            if (alpha <= 0.01) continue;
            const l = dLum[i] * alpha, col = dCol[i];
            add(toX(Math.cos(a) * r + px), toY(Math.sin(a) * r * TILT + py), lerp(col[0], 1, warm) * l, lerp(col[1], 0.5, warm) * l, lerp(col[2], 0.2, warm) * l);
          }

          // The bodies: a clump glows orange, a molten ball grows inside it and cools. The player's planet merges
          // from two clumps; its ball is the real globe (drawn below), here only its glow and the haze of young air.
          for (let n = 0; n < BODIES.length; n++) {
            const b = BODIES[n];
            const x = toX(Math.cos(bodyA[n]) * b.a), y = toY(Math.sin(bodyA[n]) * b.a * TILT);
            const grow = ease(introSpan(t, P + b.form - 0.7, P + b.form + 0.2));
            const heat = 1 - ease(introSpan(t, P + b.form, P + b.form + (n === HOME ? HOME_COOL : 1.6)));
            const merge = n === HOME ? Math.sin(Math.PI * introSpan(t, P + b.form - 0.5, P + b.form + 0.5)) ** 2 * (still ? 0.25 : 0.7) : 0;
            const rad = b.r * unit * grow;
            glow(x, y, b.r * unit * (2.5 + 2.5 * clump[n]), [1, 0.5, 0.2], clump[n] * clump[n] * 0.55 * lerp(1, heat, grow) + merge);
            if (n === HOME) {
              const haze = Math.sin(Math.PI * introSpan(t, P + b.form + 0.4, P + b.form + 3)) * 0.3;
              glow(x, y, rad * 1.6, [0.5, 0.7, 1], haze);
              continue;
            }
            if (rad < 1) {
              add(x, y, (b.color[0] * (1 - heat) + heat * 1.1) * rad, (b.color[1] * (1 - heat) + heat * 0.42) * rad, b.color[2] * (1 - heat) * rad);
              continue;
            }
            sphere(x, y, rad, b.color, toX(0) - x, toY(0) - y, heat, !!b.ring);
            if (b.ring) for (let s2 = 0; s2 < 64; s2++) {
              const ra = (s2 / 64) * Math.PI * 2, rx = Math.cos(ra) * rad * 2, ry = Math.sin(ra) * rad * 0.5;
              if (ry < 0 && rx * rx + ry * ry < rad * rad) continue;
              const v = 0.55 * grow;
              add(x + rx, y + ry, 0.8 * v, 0.7 * v, 0.55 * v);
            }
          }
        }

        present(flash, t < P ? LEVELS_BANG : LEVELS_SUN);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(art, 0, 0, W / k, H / k);

        // The player's planet: one object from the first molten ball to the hand-over, cooling into the player's world.
        if (t < c.flight) {
          const grow = ease(introSpan(t, P + home.form - 0.7, P + home.form + 0.2));
          const heat = 1 - ease(introSpan(t, P + home.form, P + home.form + HOME_COOL));
          drawHome(ctx, hx, hy, home.r * m * Z * grow, introSpin(t), heat, dpr);
        }
      },
    };
  }
}
