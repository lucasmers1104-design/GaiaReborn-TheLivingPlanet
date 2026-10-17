/* =============================================================================
 * SimEarth 2.0 — intro: the dive into the player's planet
 * -----------------------------------------------------------------------------
 * From INTRO_CUES.flight the camera hurls at the player's planet: it starts at
 * the centre with radius introHandoffRadius() (where the cosmos left it), draws
 * back for a beat, then accelerates: stars stretch to streaks, the disc swells
 * until its pixel terrain overfills the screen, the sky hazes over it and the
 * camera punches through a deck of pixel clouds into white by
 * INTRO_CUES.land. There the map takes over beneath the (now see-through)
 * canvas on the tile in the middle of the disc (introSpin at the land cue),
 * and through INTRO_REVEAL the descent carries on: the white tears open from
 * the middle and the last clouds rush outward past the camera while the map
 * glides in below. Canvas, a pure function of the clock.
 *
 * One camera: its altitude above the surface is exp(-zoom) (1 at the
 * hand-over), the disc's radius r0 / altitude, and a cloud at altitude a sits
 * at depth altitude - a, so the clouds and the terrain move as one world.
 * Lengths are in units of `reach` (half the screen diagonal), so every aspect
 * ratio sees the same dive. The clouds are painted soft into a low-resolution
 * buffer and then quantized to a few tones with an ordered dither, so however
 * close a cloud comes, its pixels stay the size of the game's pixels.
 * ========================================================================== */

namespace SE {
  const STARS = 280;
  const CLOUDS = 116;
  /** Clouds below the camera at the land cue. */
  const BELOW = 26;
  const CLOUD_SPRITES = 8;
  /** Seconds of camera travel each star streak shows. */
  const SHUTTER = 0.07;
  /** ln(final disc radius / hand-over radius) of the full dive; `still` dives less deep. */
  const DIVE = 5.7;
  const DIVE_STILL = 3.2;
  /** Seconds in which the descent brakes after the land cue, toward the map's own glide. */
  const SETTLE = 0.6;
  /** The fog the camera falls out of at the land cue, as a share of the camera's altitude there. */
  const FOG_ALT = 0.3;
  const SKY = 'rgb(126,206,255)';
  /** Cloud pixel colours from shadow to highlight; sun from the upper left as on the globe. */
  const CLOUD_TONES: readonly Rgb[] = [[150, 172, 202], [194, 210, 228], [230, 239, 248], [255, 255, 255]];
  /** Grey that quantizes to exactly CLOUD_TONES[2]: the flat white the map fades in under. */
  const WHITEOUT = 'rgb(159,159,159)';
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((b) => (b + 0.5) / 16);

  interface Cloud {
    /** Altitude above the surface (camera altitude 1 at the hand-over). */
    alt: number;
    /** Direction and distance from the dive axis, in reach at depth == alt. */
    ang: number;
    off: number;
    /** Width in reach at depth == alt. */
    size: number;
    sprite: HTMLCanvasElement;
  }

  export function introFlight(stage: IntroStage): IntroScene {
    const rng = new Rng(0x5eed1e55);
    const stars = Array.from({ length: STARS }, () => ({ a: rng.range(0, Math.PI * 2), d: Math.sqrt(rng.range(0.004, 1)), z: rng.next() }));
    const sprites = Array.from({ length: CLOUD_SPRITES }, () => cloudSprite(rng));
    // Lowest first: from the camera the farthest, drawn first.
    const landAlt = Math.exp(-DIVE);
    const clouds: Cloud[] = Array.from({ length: CLOUDS }, (_, k) => {
      const high = k < 14;
      // The last ones lie below the camera at the land cue and rush past while the map glides in, clear of the middle.
      const below = k >= CLOUDS - BELOW;
      return {
        alt: below ? landAlt * rng.range(0.45, 0.92) : high ? rng.range(0.016, 0.03) : Math.exp(rng.range(Math.log(0.0045), Math.log(0.022))),
        ang: rng.range(0, Math.PI * 2),
        off: below ? rng.range(0.12, 0.7) : high ? rng.range(0.25, 1.4) : Math.pow(rng.next(), 0.8) * 1.3,
        size: high ? rng.range(0.25, 0.5) : below ? rng.range(0.3, 0.6) : rng.range(0.4, 0.95),
        sprite: rng.pick(sprites),
      };
    }).sort((p, q) => p.alt - q.alt);
    const fog = fogSprite(rng);
    const buf = make('canvas');
    const bctx = buf.getContext('2d', { willReadFrequently: true })!;
    return {
      draw(f) {
        const c = INTRO_CUES;
        if (f.t < c.flight) return;
        const { ctx, w, h, t, still } = f;
        const reach = Math.hypot(w, h) / 2;
        const px = Math.max(3, Math.round(Math.min(w, h) / 135));
        const landSpeed = (DIVE * 1.3) / (c.land - c.flight - 0.45);
        const zoom = (at: number): number => {
          const since = at - c.land;
          if (still) return DIVE_STILL * smoothstep(introSpan(at, c.flight, c.land)) + 0.35 * smoothstep(introSpan(since, 0, INTRO_REVEAL));
          // After the land cue the descent keeps its speed and brakes smoothly, as the map's glide does.
          if (since > 0) return DIVE + landSpeed * SETTLE * (1 - Math.exp(-since / SETTLE));
          return DIVE * Math.pow(introSpan(at, c.flight + 0.45, c.land), 1.3) - 0.12 * Math.sin(Math.PI * introSpan(at, c.flight, c.flight + 0.6)) ** 2;
        };
        const after = t - c.land;
        const landed = after >= 0;
        const alt = Math.exp(-zoom(t));
        const r = introHandoffRadius(w, h) / alt;
        ctx.imageSmoothingEnabled = false;

        // Turbulence in the upper air: a few pixels of shake, never in still mode.
        let cx = w / 2;
        let cy = h / 2;
        if (!still) {
          const shake = Math.sin(Math.PI * introSpan(t, c.land - 1.5, c.land - 0.3)) * Math.min(w, h) * 0.006;
          cx += Math.round(shake * (Math.sin(t * 71) + 0.5 * Math.sin(t * 131)));
          cy += Math.round(shake * (Math.sin(t * 83 + 1) + 0.5 * Math.sin(t * 149)));
        }

        // Stars: a tunnel the camera flies down, streaking with its speed; dots in still mode.
        const starFade = (1 - introSpan(r, reach * 0.6, reach * 1.1)) * introSpan(t, c.flight, c.flight + INTRO_HANDOFF_FADE);
        if (starFade > 0) {
          const travel = (at: number): number => (still ? 0.06 * introSpan(at, c.flight, c.land) : 0.16 * zoom(at));
          const now = travel(t);
          const before = travel(t - SHUTTER);
          const bands = [new Path2D(), new Path2D(), new Path2D()];
          for (const star of stars) {
            const z = 0.06 + 0.94 * frac(star.z - now);
            if (z > 0.85) continue;
            const zt = 0.06 + 0.94 * frac(star.z - before);
            const sx = Math.cos(star.a) * star.d * reach * 0.12;
            const sy = Math.sin(star.a) * star.d * reach * 0.12;
            const path = bands[z < 0.25 ? 2 : z < 0.6 ? 1 : 0];
            path.moveTo(cx + sx / z, cy + sy / z);
            if (!still && zt > z && zt - z < 0.3) path.lineTo(cx + sx / zt, cy + sy / zt);
            else path.lineTo(cx + sx / z + 1, cy + sy / z);
          }
          ctx.lineCap = 'square';
          bands.forEach((path, k) => {
            // Far stars fade in as they come out of the dark, so none pops up at the vanishing point.
            ctx.strokeStyle = `rgba(235,242,255,${starFade * [0.3, 0.6, 0.95][k]})`;
            ctx.lineWidth = k === 2 ? 2 : 1;
            ctx.stroke(path);
          });
        }

        // Atmosphere on the limb: three crisp bands, thicker toward the sun.
        if (r < reach * 1.2) {
          const glow = introSpan(t, c.flight, c.flight + 1.2);
          ctx.lineWidth = Math.max(1, r * 0.035);
          for (let k = 0; k < 3; k++) {
            ctx.strokeStyle = `rgba(126,206,255,${glow * [0.42, 0.2, 0.08][k]})`;
            ctx.beginPath();
            ctx.arc(cx - r * 0.012, cy - r * 0.01, r * (1.035 + k * 0.035), 0, Math.PI * 2);
            ctx.stroke();
          }
        }

        // The planet, turning so that the camera settles on the landing tile.
        const whiteout = landed
          ? 1 - (still ? smoothstep(introSpan(after, 0.2, 1.7)) : introSpan(after, 0.15, 0.45))
          : still ? introSpan(t, c.land - 0.9, c.land - 0.05) : introSpan(t, c.land - 0.65, c.land - 0.05);
        if (!landed && whiteout < 1) stage.planet.draw(ctx, cx, cy, r, diveSpin(t));

        // The sky thickens as the camera sinks into the air.
        ctx.globalAlpha = introSpan(r / reach, 1.05, still ? 1.9 : 6) * 0.45 * (1 - introSpan(after, 0.1, 1.2));
        ctx.fillStyle = SKY;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;

        // The cloud deck, soft into the pixel buffer.
        const bw = Math.ceil(w / px);
        const bh = Math.ceil(h / px);
        if (buf.width !== bw || buf.height !== bh) {
          buf.width = bw;
          buf.height = bh;
        }
        bctx.clearRect(0, 0, bw, bh);
        bctx.imageSmoothingEnabled = true;
        let painted = false;
        // The fog the camera falls out of: thinnest in the middle, so the map shows there first.
        const fogLevel = still ? 0 : landed ? 1 - introSpan(after, 0.9, 1.5) : whiteout;
        if (fogLevel > 0) {
          const size = (2.4 * reach * landAlt * (1 - FOG_ALT)) / (alt - landAlt * FOG_ALT);
          bctx.globalAlpha = fogLevel;
          bctx.drawImage(fog, (cx - size / 2) / px, (cy - size / 2) / px, size / px, size / px);
          painted = true;
        }
        // Everything clears well before the overlay goes.
        const leave = 1 - introSpan(after, still ? 0.6 : 1, still ? 2 : 1.8);
        for (const cl of clouds) {
          let scale: number;
          let alpha: number;
          if (still) {
            // No rush: the deck fades in where it is and swells a little.
            scale = (0.5 + 0.3 * introSpan(t, c.land - 2.4, c.land) + cl.alt * 6) * Math.exp(Math.max(0, zoom(t) - DIVE_STILL));
            alpha = introSpan(t, c.land - 2.4 + cl.alt * 25, c.land - 1 + cl.alt * 25) * leave;
          } else {
            const depth = alt - cl.alt;
            if (depth <= cl.alt * 0.08) continue;
            scale = cl.alt / depth;
            alpha = introSpan(scale, 0.1, 0.3) * (1 - introSpan(scale, 5, 10)) * leave;
          }
          const dist = cl.off * reach * scale;
          // Clouds hug the planet: none outside its disc, none before its own clouds are bigger than them.
          alpha *= (1 - introSpan(dist, r * 0.75, r * 0.92)) * introSpan(r, reach * 0.8, reach * (still ? 1.2 : 1.5));
          if (alpha <= 0) continue;
          const sw = cl.size * reach * scale;
          const sh = (sw * cl.sprite.height) / cl.sprite.width;
          const x = cx + Math.cos(cl.ang) * dist - sw / 2;
          const y = cy + Math.sin(cl.ang) * dist - sh / 2;
          if (x + sw < 0 || x > w || y + sh < 0 || y > h) continue;
          bctx.globalAlpha = alpha;
          bctx.drawImage(cl.sprite, x / px, y / px, sw / px, sh / px);
          painted = true;
        }
        if (whiteout > 0 && !still) {
          bctx.globalAlpha = whiteout;
          bctx.fillStyle = WHITEOUT;
          bctx.fillRect(0, 0, bw, bh);
          painted = true;
        }
        bctx.globalAlpha = 1;
        if (painted) {
          const img = bctx.getImageData(0, 0, bw, bh);
          quantize(img, still ? 1 : introSpan(after, 0, 0.3));
          bctx.putImageData(img, 0, 0);
          ctx.drawImage(buf, 0, 0, bw * px, bh * px);
        }
        // Still mode: a soft fade into and out of the white instead of a dithered dissolve.
        if (whiteout > 0 && still) {
          const [wr, wg, wb] = CLOUD_TONES[2];
          ctx.fillStyle = `rgba(${wr},${wg},${wb},${whiteout})`;
          ctx.fillRect(0, 0, w, h);
        }
      },
    };
  }

  /**
   * Soft cloud pixels to crisp ones: shade through an ordered dither to the tones,
   * coverage dithered too, or kept soft (for `soft` 1) where the clouds part over
   * the map, which a screen-door pattern would hide.
   */
  function quantize(img: ImageData, soft: number): void {
    const d = img.data;
    const w = img.width;
    for (let p = 0, q = 0; q < d.length; p++, q += 4) {
      const x = p % w;
      const y = (p - x) / w;
      const cover = d[q + 3];
      const hard = cover > BAYER[(y & 3) * 4 + (x & 3)] * 255 ? 255 : 0;
      if (cover === 0 || (hard === 0 && soft === 0)) {
        d[q + 3] = 0;
        continue;
      }
      const b = BAYER[((y + 1) & 3) * 4 + ((x + 2) & 3)];
      const tone = CLOUD_TONES[clamp(Math.floor((d[q] / 255) * 4 + (b - 0.5) * 0.8), 0, 3)];
      d[q] = tone[0];
      d[q + 1] = tone[1];
      d[q + 2] = tone[2];
      d[q + 3] = hard + (cover - hard) * soft;
    }
  }

  function frac(v: number): number {
    return v - Math.floor(v);
  }

  /**
   * introSpin from the flight cue on, but the whole turn to the landing tile is
   * done in the first half of the dive, while the disc is small: the texture
   * turns in whole texels, which on the magnified disc would jump. Same speed
   * at the hand-over, the land cue's spin from mid-dive on.
   */
  function diveSpin(t: number): number {
    const c = INTRO_CUES;
    const half = (c.land - c.flight) / 2;
    const u = introSpan(t, c.flight, c.flight + half);
    const from = introSpin(c.flight);
    const turn = introSpin(c.land) - from;
    const a = ((introSpin(c.flight + 1) - from) * half) / turn;
    // e(0) = 0, e(1) = 1, e'(0) = a, e'(1) = 0: the integral of (1 - u)^2 (a + b u), b chosen to reach 1.
    const b = 12 - 4 * a;
    const e = a * u + ((b - 2 * a) / 2) * u ** 2 + ((a - 2 * b) / 3) * u ** 3 + (b / 4) * u ** 4;
    return from + turn * e;
  }

  /** The fog filling the screen at the land cue: soft puffs with a ragged hole in the middle that widens as the camera falls through. */
  function fogSprite(rng: Rng): HTMLCanvasElement {
    const N = 96;
    const puffs = Array.from({ length: 60 }, () => ({ x: rng.range(0, N), y: rng.range(0, N), r: rng.range(8, 22) }));
    const density = (x: number, y: number): number => {
      let d = 0;
      for (const p of puffs) d += Math.max(0, 1 - Math.hypot(x - p.x, y - p.y) / p.r) ** 2;
      return d;
    };
    const canvas = make('canvas');
    canvas.width = canvas.height = N;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(N, N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const d = density(x + 0.5, y + 0.5);
        const lit = density(x + 3.5, y + 3.5) - density(x - 2.5, y - 2.5);
        const mid = smoothstep(clamp((Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2) / (N / 2)) * 1.3, 0, 1));
        const q = (y * N + x) * 4;
        img.data[q] = img.data[q + 1] = img.data[q + 2] = clamp(0.66 + lit * 0.35, 0.05, 1) * 255;
        img.data[q + 3] = smoothstep(clamp((d - 0.15 - 0.75 * (1 - mid)) / 0.35, 0, 1)) * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  /** One soft cloud: a few puffs along a band, grey for its shade (lit from the upper left), alpha for its cover. */
  function cloudSprite(rng: Rng): HTMLCanvasElement {
    const W = 64;
    const H = 36;
    const puffs = Array.from({ length: rng.int(4) + 4 }, (_, k) => {
      const x = 11 + (k / 7) * (W - 22) + rng.range(-4, 4);
      const mid = 1 - Math.abs(x - W / 2) / (W / 2);
      return { x, y: H / 2 + rng.range(-3, 4) - mid * 3, r: 6 + mid * 8 + rng.range(0, 4) };
    });
    const density = (x: number, y: number): number => {
      let d = 0;
      for (const p of puffs) d = Math.max(d, 1 - Math.hypot(x - p.x, (y - p.y) * 1.25) / p.r);
      return d;
    };
    const canvas = make('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d = density(x + 0.5, y + 0.5);
        if (d <= 0) continue;
        const lit = density(x + 3.5, y + 3.5) - density(x - 2.5, y - 2.5);
        const shade = clamp(0.68 + lit * 0.6, 0.05, 1);
        const q = (y * W + x) * 4;
        img.data[q] = img.data[q + 1] = img.data[q + 2] = shade * 255;
        img.data[q + 3] = smoothstep(clamp(d * 3, 0, 1)) * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }
}
