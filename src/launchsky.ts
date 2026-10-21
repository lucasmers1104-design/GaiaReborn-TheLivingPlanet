/* =============================================================================
 * SimEarth 2.0 — launch film: above the clouds (6.95–9.25 s)
 * -----------------------------------------------------------------------------
 * The rocket bursts out of the cloud deck's fog into sunlight: the sun low on
 * the left over a sea of cloud tops, the rocket lit gold on its sunny side.
 * The breakthrough glints on its nose as a pixel sparkle (the films' sparkle
 * at 6–8 s). The cloud sea sinks away in perspective, the sky darkens to
 * space and the horizon bends into the curve of the home world, the twilight
 * plume of the engines blooms; then the rocket draws away upward out of the
 * frame, leaving its trail, before the dissolve into space (launchspace.ts).
 * Also the clouds the ground shot climbs into before (launchLowClouds).
 * A pure function of the clock.
 * ========================================================================== */

namespace SE {
  /* --------------------------------------------- below the deck (ground) -- */

  /** Clouds at dusk and where the jet lights them. */
  const CLOUD_DUSK = ['#2d2d46', '#46465f', '#5f5f7d', '#82829b'].map(launchHex);
  const CLOUD_LIT = ['#5a2828', '#963c2d', '#c85f37', '#e68c46', '#f5b464'].map(launchHex);

  /** A cumulus at (x, y), `r` px: a flat-bottomed row of puffs, the middle ones bigger and higher. */
  function cumulus(P: LaunchPuffs, x: number, y: number, r: number, seed: number, light: number): void {
    const n = 3 + Math.floor(launchHash(seed, 1, 21) * 3);
    for (let i = 0; i < n; i++) {
      const m = 1 - Math.abs(i - (n - 1) / 2) / n;
      const rr = r * (0.45 + 0.55 * m) * (0.85 + 0.3 * launchHash(seed, i, 22));
      P.puff(x + (i - (n - 1) / 2) * r * 0.62, y - rr * 0.35 * m, rr, 0.8, light + 0.08 * m, 0.42, 0.42 + 0.35 * m);
    }
  }

  /** From 5.5 s wisps rush down past the rocket, then the underside of the deck closes into fog. */
  export function launchLowClouds(art: LaunchArt, P: LaunchPuffs, t: number, bx: number, by: number): void {
    if (t < 5.5) return;
    P.begin(art);
    const { W, H } = art;
    const lift = launchLift(t), u = LAUNCH_WIDE.u;
    const cy = by - 40 * u;
    for (let k = 0; k < 26; k++) {
      const y = H * 0.5 - (300 + k * 9 - lift) * u * 0.9;
      if (y < -40 || y > H + 40) continue;
      cumulus(P, launchHash(k, 3, 7) * W, y, 9 + 13 * launchHash(k, 4, 7), k, 0.42);
    }
    const deck = 470;
    for (let row = 0; row < 7; row++) {
      const y = H * 0.5 - (deck + row * 10 - lift) * u * 0.9;
      if (y > H + 50) continue;
      for (let k = 0; k * 34 < W + 68; k++) cumulus(P, k * 34 - 17 + (launchHash(k, row, 4) - 0.5) * 14, Math.max(y, -60), 20 + 9 * launchHash(row, k, 5), row * 31 + k, 0.3 + 0.06 * row);
    }
    P.paint(art, CLOUD_DUSK, CLOUD_LIT, (x, y) => clamp(1.4 - Math.sqrt((x - bx) ** 2 + (y - cy - 70) ** 2) / 70, 0, 1) * 0.8);
    const fill = smooth(introSpan(t, LAUNCH_T.deck + 0.25, LAUNCH_T.breach));
    launchFog(art, fill, introSpan(t, LAUNCH_T.breach - 0.25, LAUNCH_T.breach));
    art.glow(bx, by + 10, 90, [1, 0.55, 0.22], 0.4 * fill * (1 - introSpan(t, LAUNCH_T.breach - 0.2, LAUNCH_T.breach)));
  }

  /* ------------------------------------------------------ above the deck -- */

  /** Nearly level beside the rocket. */
  const HIGH: LaunchCam = { az: 0.7, el: 0.05, u: LAUNCH_WIDE.u };
  const ROWS = 22;

  interface SeaPuff { x: number; dy: number; r: number; l: number }
  interface SeaRow { z: number; puffs: SeaPuff[] }

  export interface LaunchSkyKit {
    readonly rocket: LaunchSprite;
    readonly rows: readonly SeaRow[];
    readonly stars: readonly { x: number; y: number; lum: number; tw: number }[];
    readonly puffs: LaunchPuffs;
  }

  export function launchSkyKit(puffs: LaunchPuffs): LaunchSkyKit {
    const rng = new Rng(0x5ca1ab1e);
    // Rows of cloud tops from near to far; positions in screen widths at depth 1, so every aspect ratio fills.
    const rows: SeaRow[] = Array.from({ length: ROWS }, (_, k) => {
      const z = 1.1 * Math.pow(1.19, k);
      // Spaced closer than their size, so the rows close into a sea; swelling in groups like cumulus tops.
      const spread = Math.max(1.3, 3.5 / z) * 1.1, r = 0.22 / z;
      const n = Math.ceil(spread / (r * (9 / 16) * 0.95)) + 2;
      const phase = rng.range(0, 6.3), freq = rng.range(5, 9);
      return { z, puffs: Array.from({ length: n }, (_, i) => {
        const x = (i + rng.range(-0.3, 0.3)) / (n - 2) - 0.02;
        const swell = 0.5 + 0.5 * Math.sin(x * freq * spread + phase);
        return { x, dy: rng.range(-0.3, 0.3) - swell * 0.5, r: (0.6 + 0.6 * swell) * rng.range(0.85, 1.15), l: 0.3 + 0.32 * swell + rng.range(0, 0.1) };
      }) };
    });
    const stars = Array.from({ length: 120 }, () => ({ x: rng.next(), y: rng.next() * 0.7, lum: rng.range(0.15, 0.6), tw: rng.range(0, 6.3) }));
    return { rocket: launchRocketSprite(HIGH), rows, stars, puffs };
  }

  const CLOUD_NEAR = ['#6e6496', '#9a90b9', '#cdc3d7', '#f5e6d7', '#fff5e6'].map(launchHex);
  const CLOUD_MID = ['#8278a5', '#aaa0c3', '#d2c8dc', '#f0e1d7'].map(launchHex);
  const CLOUD_FAR = ['#a596b9', '#c3b4cd', '#e1d2d7'].map(launchHex);
  /** Sky above the clouds by height over the horizon, screen heights; `s` darkens it toward space. */
  const HIGH_SKY: [number, Rgb][] = [
    [0, [1, 0.84, 0.62]], [0.05, [0.86, 0.78, 0.78]], [0.14, [0.55, 0.64, 0.88]], [0.32, [0.25, 0.37, 0.74]],
    [0.6, [0.08, 0.13, 0.38]], [0.95, [0.03, 0.04, 0.14]],
  ];
  const SUN_LIGHT: LaunchLight = { amb: [0.34, 0.38, 0.55], key: [1, 0.86, 0.66] };

  const smooth = (v: number): number => smoothstep(clamp(v, 0, 1));
  /** How far the climb has gone above the deck, 0..1: fast at first, settling. */
  const above = (t: number): number => 1 - Math.pow(1 - clamp((t - LAUNCH_T.breach) / 1.75, 0, 1), 2.2);

  export function paintHighShot(art: LaunchArt, kit: LaunchSkyKit, t: number, still: boolean): void {
    const { W, H } = art;
    const s = above(t);
    // The horizon dips as the camera climbs and bends into the planet's curve.
    const hz = H * (0.5 + 0.2 * s);
    const bend = H * 0.55 * smooth(introSpan(t, 7.4, 8.9));
    const curve = (x: number): number => hz + bend * ((x - W / 2) / W) ** 2 * 2.2;

    // Sky: dusk gold on the horizon, deepening to space with height and with the climb.
    const b = art.buf;
    const sunX = W * 0.13;
    for (let x = 0; x < W; x++) {
      const h0 = curve(x);
      const near = Math.exp(-(((x - sunX) / (W * 0.35)) ** 2));
      for (let y = 0; y < Math.min(H, Math.ceil(h0) + 1); y++) {
        const f = ((h0 - y) / H) * (1 + 1.8 * s);
        const c = sampleRamp(HIGH_SKY, f);
        const warm = near * Math.max(0, 1 - f * 3);
        const q = (y * W + x) * 3;
        b[q] = c[0] + (1 - c[0]) * warm * 0.4; b[q + 1] = c[1] + (0.85 - c[1]) * warm * 0.3; b[q + 2] = c[2] * (1 - warm * 0.3);
      }
    }
    const starIn = smooth((s - 0.35) / 0.5);
    if (starIn > 0) {
      for (const st of kit.stars) {
        const x = Math.floor(st.x * W), y = Math.floor(st.y * H);
        if (y > curve(x) - H * 0.15) continue;
        const l = st.lum * starIn * (still ? 1 : 0.75 + 0.25 * Math.sin(t * 2.1 + st.tw * 5));
        art.add(x, y, l * 0.9, l * 0.95, l);
      }
    }
    // The sun on the horizon at the left, a streak through it unless still.
    const sunY = curve(sunX) - 3;
    art.glow(sunX, sunY, H * 0.55, [1, 0.6, 0.3], 0.35);
    art.glow(sunX, sunY, 14, [1, 0.9, 0.7], 0.9);
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (x * x + y * y <= 10) art.set(Math.round(sunX) + x, Math.round(sunY) + y, 1.25, 1.18, 1);
    if (!still) {
      for (let k = 4; k < W * 0.5; k++) {
        const v = 0.5 * (1 - k / (W * 0.5)) ** 2;
        art.add(Math.round(sunX) + k, Math.round(sunY), v, v * 0.85, v * 0.6);
        art.add(Math.round(sunX) - k, Math.round(sunY), v, v * 0.85, v * 0.6);
      }
    }

    // The cloud sea: a hazy floor, far rows first, each nearer row sinking faster.
    for (let x = 0; x < W; x++) art.rect(x, Math.ceil(curve(x)) + 1, 1, H, CLOUD_FAR[1]);
    const sink = H * (0.32 + 2.6 * s);
    const P = kit.puffs;
    const passes: [number, number, readonly LaunchRgb[]][] = [[ROWS - 1, 12, CLOUD_FAR], [11, 6, CLOUD_MID], [5, 0, CLOUD_NEAR]];
    for (const [from, to, tones] of passes) {
      P.begin(art);
      for (let k = from; k >= to; k--) {
        const row = kit.rows[k];
        const y0 = hz + sink / row.z;
        if (y0 > H + 40) continue;
        for (const p of row.puffs) {
          const r = Math.max(1.1, (H * 0.22 * p.r) / row.z);
          const x = W / 2 + (p.x - 0.5) * W * Math.max(1.2, 3.5 / row.z) * 1.1;
          const y = y0 + p.dy * r * 0.6 + bend * ((x - W / 2) / W) ** 2 * 2.2 * (1 - 1 / (1 + row.z * 0.3));
          // The sun is low on the left: tops toward it light up.
          P.puff(x, y, r, 0.9, p.l + 0.18 * (1 - x / W), 0.55);
        }
      }
      P.paint(art, tones);
    }

    // The rocket: still in the frame, then drawing away upward.
    const away = Math.max(0, t - LAUNCH_T.away);
    const bob = still ? 0 : Math.round(Math.sin(t * 9) * 0.6);
    const bx = Math.round(W * 0.5), by = Math.round(H * 0.8 - 0.5 * 420 * away * away) + bob;
    const ny = by - LAUNCH_ROCKET.nozzle * HIGH.u * Math.cos(HIGH.el);
    // Its trail down into the clouds, sunlit, and the twilight plume blooming round the jet in the thin air.
    const plume = smooth(introSpan(t, 7.3, 8.3)) * (1 - introSpan(t, 8.6, 9.2));
    for (let y = Math.max(0, Math.round(ny + 30)); y < H; y++) {
      const k = (y - ny) / H;
      const half = 1.5 + k * 9, fadeK = 0.55 * Math.max(0, 1 - k * 0.8) * (1 - introSpan(t, 8.4, 9.2));
      for (let x = Math.round(bx - half); x <= Math.round(bx + half); x++) {
        if (launchDither(x, y) < fadeK * (1 - Math.abs(x - bx) / (half + 1))) art.set(x, y, 0.94, 0.88, 0.8);
      }
    }
    if (plume > 0) for (let k = 1; k <= 7; k++) art.glow(bx, ny + k * 12, 5 + k * 6 * plume, [0.45, 0.6, 0.85], 0.16 * plume * (1 - k / 9));
    if (by - 110 < H) {
      launchJet(art, bx, ny, 62, 4.6, t, still ? 0.25 : 1);
      art.glow(bx, ny + 8, 34, [1, 0.6, 0.3], 0.35);
      art.sprite(kit.rocket, bx, by, SUN_LIGHT);
    }

    // Out of the fog, which hangs on for a moment.
    launchFog(art, 1 - smooth(introSpan(t, LAUNCH_T.breach, LAUNCH_T.breach + (still ? 0.5 : 0.28))), 1);

    // The breakthrough: the sun glints on the nose, through the last of the fog.
    const noseY = by - LAUNCH_ROCKET.top * HIGH.u * Math.cos(HIGH.el);
    launchSparkle(art, bx, noseY - 1, t - LAUNCH_T.breach, still);
  }

  /**
   * The films' sparkle in pixels at (x, y), `s` seconds after it starts: a four-pointed star that flares,
   * turns a little and fades over 0.85 s, with small twinkles round it. Gentler and slower when still.
   */
  export function launchSparkle(art: LaunchArt, x: number, y: number, s: number, still: boolean): void {
    const life = still ? 1.2 : 0.85;
    if (s < 0 || s > life + 0.4) return;
    const p = s / life;
    const amp = still ? 0.55 * Math.sin(Math.PI * clamp(p, 0, 1)) : Math.min(1, p * 6) * Math.max(0, 1 - p) ** 1.4;
    const len = Math.round((still ? 14 : 24) * amp + 1);
    const cx = Math.round(x), cy = Math.round(y);
    if (amp > 0.02) {
      art.glow(cx, cy, 6 + 16 * amp, [1, 0.95, 0.8], 0.9 * amp);
      for (let k = 1; k <= len; k++) {
        const v = 1.5 * amp * (1 - k / (len + 1)) ** 1.5;
        art.add(cx + k, cy, v, v, v * 0.9); art.add(cx - k, cy, v, v, v * 0.9);
        art.add(cx, cy + k, v, v, v * 0.9); art.add(cx, cy - k, v, v, v * 0.9);
        if (k < len * 0.45) {
          const d = v * 0.6;
          art.add(cx + k, cy + k, d, d * 0.95, d * 0.8); art.add(cx - k, cy - k, d, d * 0.95, d * 0.8);
          art.add(cx + k, cy - k, d, d * 0.95, d * 0.8); art.add(cx - k, cy + k, d, d * 0.95, d * 0.8);
        }
      }
      art.set(cx, cy, 1.4, 1.4, 1.3);
    }
    // Smaller glints a beat later round it.
    for (let n = 0; n < 4; n++) {
      const q = (s - 0.12 - n * 0.09) / (still ? 0.7 : 0.45);
      if (q < 0 || q > 1) continue;
      const a = Math.sin(Math.PI * q) * (still ? 0.5 : 0.9);
      const gx = cx + Math.round((launchHash(n, 1, 77) - 0.5) * 46), gy = cy + Math.round((launchHash(n, 2, 77) - 0.5) * 34);
      const l = Math.round(2 + 5 * a);
      for (let k = 0; k <= l; k++) {
        const v = a * (1 - k / (l + 1));
        art.add(gx + k, gy, v, v, v); art.add(gx - k, gy, v, v, v); art.add(gx, gy + k, v, v, v); art.add(gx, gy - k, v, v, v);
      }
    }
  }
}
