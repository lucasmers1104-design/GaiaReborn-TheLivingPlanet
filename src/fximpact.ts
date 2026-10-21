/* =============================================================================
 * SimEarth 2.0 — meteor and atomic strike on screen
 * -----------------------------------------------------------------------------
 * docs/ereignisse-spec.md §3.2, §3.7:
 *   meteor   omen  a flickering light point stands in the sky up and left,
 *                  a dithered shadow grows on the target; then the burning
 *                  streak flies in and strikes as the omen ends
 *            main  flash, shock ring, a dust ring along the ground, debris,
 *                  a dust cloud that grows, billows and crumbles; at sea a
 *                  water fountain, splash rings, spray and steam instead
 *   comet    the meteor at COMET_STRENGTH (comet.ts): a light high up and left
 *                  that brightens and grows a tail while the shadow on the
 *                  2 × 2 crater widens, then a long flight trailing embers;
 *                  the impact at twice the size, with a second shock ring
 *                  and a ring of dust clouds that drift off with the wind
 *   atomic   omen  a point of light flares high over the tile
 *            main  flash, shock ring and dust ring, the mushroom cloud rises,
 *                  spreads and dissolves; flames on the burning ring die down
 *                  and leave a wisp of smoke
 * Restrained by design: no casualties, no radiation symbols. The scars
 * (crater, scorch, ash, fallout film) are drawn by fxground and fxscars.
 * ========================================================================== */

namespace SE {
  /** The meteor appears this many tiles up and left of its target. */
  const SKY_TILES = 5;
  /** The streak's flight: the last part of the omen, so it strikes as the hazard starts. */
  const STREAK_MS = 500;
  const FLICKER_MS = 70;
  const FLASH_MS = 180;
  const FIREBALL_MS = 420;
  const SHOCK_MS = 600;
  /** Art pixels the meteor's shock ring reaches (4 tiles) and the atomic strike's (3 tiles). */
  const SHOCK_R = 64;
  const ATOMIC_SHOCK_R = 48;
  const ATOMIC_SHOCK_MS = 700;
  const DEBRIS = 48;
  const DUST_LIFE_MS = 6000;
  /** Art pixels per second the dust cloud drifts with the wind and rises. */
  const DUST_DRIFT = 2.5;
  const DUST_RISE = 1.5;
  /** The dust thrown along the ground behind the shock ring: art pixels it reaches and how long it takes. */
  const DUST_RING_R = 40;
  const DUST_RING_MS = 1300;
  /** Start of each mushroom frame after the strike: fireball, lift-off, cap forming (2–3), spreading (4–5), dissolving (6–7). */
  const MUSHROOM_MS: readonly number[] = [300, 650, 1100, 1600, 2150, 2700, 3150];
  const FLAMES_FROM_MS = 250;
  const FLAMES_TO_MS = 3200;
  /** The flames burn tall at first, then low. */
  const FLAMES_LOW_MS = 1700;
  /** Fountain frames, 100 ms each: the jet shoots up, pulses at its peak, collapses into foam. */
  const FOUNTAIN: readonly number[] = [0, 1, 2, 3, 2, 3, 2, 3, 4, 4, 5, 5];
  const FOUNTAIN_FRAME_MS = 100;
  /** The swell the splash sends out over the water: art pixels and ms. */
  const SWELL_R = 36;
  const SWELL_MS = 1600;
  /** The comet's light stands this many tiles up and left of its crater and flies in over the omen's last COMET_FLIGHT_MS. */
  const COMET_SKY_TILES = 10;
  const COMET_FLIGHT_MS = 1100;
  /** Dust clouds round the comet's crater, how far out they start (art pixels) and how long they live. */
  const COMET_CLOUDS = 7;
  const COMET_CLOUD_R = 26;
  const COMET_CLOUD_MS = 9000;
  /** The second shock ring follows the first after this long. */
  const COMET_ECHO_MS = 450;

  const one = (ramp: string, step: number): readonly string[] => [fxColor(ramp, step)];
  /** The light point's two flicker frames, as 2×2 pixel colours. */
  const LIGHT: readonly (readonly (readonly string[])[])[] = [
    [one('white', 0), one('yellow', 0), one('yellow', 0), one('orange', 0)],
    [one('yellow', 0), one('orange', 0), one('orange', 0), one('red', 1)],
  ];
  const SHADOW_INNER = fxColor('pine', 0);
  const SHADOW_OUTER = fxColor('rock', 0);
  const RING_LIGHT = fxColor('white', 0);
  const RING_DARK = fxColor('rock', 2);
  const SPLASH_LIGHT = fxColor('water', 7);
  const SPLASH_DARK = fxColor('water', 4);
  const DUST_LIGHT = fxColor('sand', 2);
  const DUST_DARK = fxColor('soil', 1);
  /** The meteor's light brightening before its streak flies in: a small cross of glow round the 2×2 point. */
  const HALO: readonly string[] = [fxColor('orange', 0)];
  const DEBRIS_HOT: readonly string[] = [fxColor('yellow', 0), fxColor('orange', 0), fxColor('red', 1), fxColor('soil', 0)];
  const DEBRIS_ROCK: readonly string[] = [fxColor('rock', 3), fxColor('rock', 2), fxColor('soil', 1), fxColor('rock', 0)];
  const SPRAY: readonly string[] = [fxColor('white', 0), fxColor('ice', 4), fxColor('water', 7), fxColor('water', 6)];

  /** World art pixel of a tile's centre, or of the centre of the k × k block from it (the comet's crater). */
  function centre(x: number, y: number, k = 1): [number, number] {
    return [x * 16 + 8 * k, y * 16 + 8 * k];
  }

  /** A staged or started meteor's size: 1, or the comet's COMET_STRENGTH. */
  function scaleOf(strength: number | undefined): number {
    return Math.max(1, Math.round(strength ?? 1));
  }

  /** A light in the sky at (x, y) for one frame: 2×2 and flickering when `big`, else one faint pixel. */
  function light(s: FxScene, x: number, y: number, t: number, big: boolean, halo = false): void {
    // A frame's timestamp can precede the moment the omen was staged.
    const beat = Math.floor(Math.max(0, t) / FLICKER_MS) % 2;
    const f = LIGHT[beat];
    if (!big) {
      s.particles.spawn(x, y, 0, 0, 0.001, 0, f[3], true);
      return;
    }
    for (let k = 0; k < 4; k++) s.particles.spawn(x + (k & 1), y + (k >> 1), 0, 0, 0.001, 0, f[k], true);
    if (!halo) return;
    const d = beat === 0 ? 2 : 1;
    s.particles.spawn(x - d, y, 0, 0, 0.001, 0, HALO, true);
    s.particles.spawn(x + 1 + d, y + 1, 0, 0, 0.001, 0, HALO, true);
    s.particles.spawn(x + 1, y - d, 0, 0, 0.001, 0, HALO, true);
    s.particles.spawn(x, y + 1 + d, 0, 0, 0.001, 0, HALO, true);
  }

  /** Dust thrown out along the ground behind the shock wave: a dashed ring, slower and shorter; `k` times the size. */
  function dustRing(s: FxScene, cx: number, cy: number, t: number, k = 1): void {
    const ms = DUST_RING_MS * k;
    if (t < 0 || t >= ms) return;
    const p = t / ms;
    s.ring(cx, cy, Math.max(2, DUST_RING_R * k * (1 - (1 - p) * (1 - p))), DUST_LIGHT, DUST_DARK, true, p < 0.5 ? 3 : 2);
  }

  /** The dithered shadow on the target, in three growing steps of `k` times the meteor's size. */
  function shadow(s: FxScene, cx: number, cy: number, t: number, end: number, k: number): void {
    // Consecutive pixel rings leave gaps between them, a dithered disc. Zoomed out past the art (pixel < 1)
    // every ring is still a device pixel wide and neighbours merge into a solid square, so only rings two
    // device pixels apart are drawn there.
    const radius = (3 + 2 * Math.min(2, Math.floor((t / end) * 3))) * k;
    const step = s.pixel < 1 ? Math.ceil(2 / s.pixel) : 1;
    for (let r = radius; r >= 1; r -= step) s.ring(cx, cy, r, r < radius ? SHADOW_INNER : SHADOW_OUTER, SHADOW_INNER, true);
  }

  /**
   * The comet's omen: high up and left a light brightens and grows a tail
   * of faint sparks; then it flies in, trailing embers, and strikes as the
   * omen ends.
   */
  function cometOmen(s: FxScene, x: number, y: number, t: number, k: number): void {
    const [cx, cy] = centre(x, y, k);
    const end = COMET_OMEN_MS;
    shadow(s, cx, cy, t, end, k);
    const sky = COMET_SKY_TILES * 16;
    const fly = t - (end - COMET_FLIGHT_MS);
    if (fly < 0) {
      const lx = cx - sky;
      const ly = cy - sky;
      light(s, lx, ly, t, true, t > end * 0.2);
      // The tail streams away from the sun-lit head, longer as it nears.
      const tail = 2 + Math.floor((t / end) * 10);
      if (Math.random() < 0.6) s.particles.spawn(lx - Math.random() * tail, ly - Math.random() * tail, -4, -4, 0.5, 0, HALO, true);
      return;
    }
    const sp = FX_MANIFEST.sprites.meteor_streak;
    const left = sky * (1 - fly / COMET_FLIGHT_MS);
    const hx = cx - left;
    const hy = cy - left;
    for (let n = 0; n < 3; n++) {
      s.particles.spawn(hx - 6 - Math.random() * 10, hy - 6 - Math.random() * 10, -10 - Math.random() * 14, -10 - Math.random() * 14, 0.45, 0, DEBRIS_HOT, true);
    }
    s.add({ id: 'meteor_streak', frame: Math.floor(fly / 83) % (sp?.frames.length ?? 1), x: hx, y: hy, foot: cy + 16 * k, sx: 24, sy: 24 });
    s.add({ id: 'meteor_streak', frame: Math.floor(fly / 83 + 2) % (sp?.frames.length ?? 1), x: hx - 10, y: hy - 10, foot: cy + 16 * k - 1, sx: 24, sy: 24 });
  }

  /** The comet strikes: a long fireball, two shock rings, the ground dust ring, debris and a ring of dust clouds. */
  function cometMain(s: FxScene, st: FxStarted, t: number, k: number): void {
    const [cx, cy] = centre(st.x, st.y, k);
    flash(s, cx, cy, t);
    if (t >= FLASH_MS && t < FIREBALL_MS * k) {
      s.add({ id: 'flash', frame: 2, x: cx, y: cy, foot: cy });
      s.add({ id: 'flash', frame: 2, x: cx + 10, y: cy - 6, foot: cy - 1 });
      s.add({ id: 'flash', frame: 2, x: cx - 10, y: cy - 4, foot: cy - 1 });
    }
    const shockMs = SHOCK_MS * k;
    if (t < shockMs) s.ring(cx, cy, Math.max(1, (SHOCK_R * k * t) / shockMs), RING_LIGHT, RING_DARK);
    const echo = t - COMET_ECHO_MS;
    if (echo >= 0 && echo < shockMs) s.ring(cx, cy, Math.max(1, (SHOCK_R * k * echo) / shockMs), RING_LIGHT, RING_DARK);
    if (t < 500 * k) s.shake(st.x, st.y, 2 * k, t < 300 * k ? 2 : 1);
    dustRing(s, cx, cy, t - 80, k);
    if (s.once(`${st.id}:debris`)) throwUp(s, cx, cy, DEBRIS * 2, 110, 50 * k, 150, [DEBRIS_HOT, DEBRIS_ROCK, DEBRIS_ROCK]);
    if (t > 600 && s.once(`${st.id}:debris2`)) throwUp(s, cx, cy, DEBRIS, 70, 40 * k, 150, [DEBRIS_ROCK, DEBRIS_HOT]);
    if (s.once(`${st.id}:dust`)) {
      const wind = ClimateSystem.airCurrent(st.y);
      s.spawn({ id: 'dust_cloud', x: cx, y: cy - 6, vx: wind.dx * DUST_DRIFT, vy: -DUST_RISE, life: COMET_CLOUD_MS, mode: 'once' });
      for (let n = 0; n < COMET_CLOUDS; n++) {
        const a = (n / COMET_CLOUDS) * Math.PI * 2;
        const ox = Math.cos(a) * COMET_CLOUD_R;
        const oy = Math.sin(a) * COMET_CLOUD_R * 0.6;
        s.spawn({
          id: 'dust_cloud', x: cx + ox, y: cy + oy - 4,
          vx: wind.dx * DUST_DRIFT + ox * 0.08, vy: -DUST_RISE + oy * 0.05, life: COMET_CLOUD_MS - n * 300, mode: 'once',
        });
      }
    }
  }

  /** Flash frames 0–1; with reduced effects the fireball without white (frame 2) instead. */
  function flash(s: FxScene, x: number, y: number, t: number): void {
    if (t < FLASH_MS) {
      if (s.reduce) s.add({ id: 'flash', frame: 2, x, y, foot: y });
      else s.flash({ id: 'flash', frame: t < FLASH_MS / 2 ? 0 : 1, x, y, foot: y });
    }
  }

  /** Particles thrown up from (x, y) that land around it: `up` art px/s upwards, `out` across. */
  function throwUp(s: FxScene, x: number, y: number, n: number, up: number, out: number, gravity: number, ramps: readonly (readonly string[])[]): void {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = out * (0.3 + Math.random() * 0.7);
      const lift = up * (0.4 + Math.random() * 0.6);
      // Flat in 3/4 view: half the speed across the ground in y; the particle vanishes as it lands.
      s.particles.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v * 0.5 - lift, (2 * lift) / gravity, gravity, ramps[k % ramps.length]);
    }
  }

  FX_SCRIPTS[EventKind.Meteor] = {
    omen(s: FxScene, x: number, y: number, t: number, strength?: number): void {
      const k = scaleOf(strength);
      if (k > 1) { cometOmen(s, x, y, t, k); return; }
      const [cx, cy] = centre(x, y);
      const end = HAZARD_OMEN_MS[EventKind.Meteor];
      const sky = SKY_TILES * 16;
      shadow(s, cx, cy, t, end, 1);
      const fly = t - (end - STREAK_MS);
      if (fly < 0) {
        light(s, cx - sky, cy - sky, t, true, t > end * 0.35);
        return;
      }
      const sp = FX_MANIFEST.sprites.meteor_streak;
      const left = sky * (1 - fly / STREAK_MS);
      // The head is drawn at the lower right of the frame; it is what flies to the target.
      s.add({
        id: 'meteor_streak', frame: Math.floor(fly / 83) % (sp?.frames.length ?? 1), x: cx - left, y: cy - left, foot: cy + 16,
        sx: 24, sy: 24,
      });
    },

    main(s: FxScene, st: FxStarted, t: number, world: WorldState): void {
      const k = scaleOf(st.strength);
      const sea = world.elevation[idx(st.x, st.y)] < 0;
      // The comet always strikes land (cometSite).
      if (k > 1 && !sea) { cometMain(s, st, t, k); return; }
      const [cx, cy] = centre(st.x, st.y);
      flash(s, cx, cy, t);
      if (t >= FLASH_MS && t < FIREBALL_MS && !sea) s.add({ id: 'flash', frame: 2, x: cx, y: cy, foot: cy });
      if (t < SHOCK_MS) {
        const r = Math.max(1, (SHOCK_R * t) / SHOCK_MS);
        if (sea) s.ring(cx, cy, r, SPLASH_LIGHT, SPLASH_DARK, true);
        else s.ring(cx, cy, r, RING_LIGHT, RING_DARK);
      }
      if (t < 500) s.shake(st.x, st.y, 2, t < 250 ? 2 : 1);
      if (sea) {
        const fy = st.y * 16 + 15;
        const step = Math.floor(t / FOUNTAIN_FRAME_MS);
        if (step < FOUNTAIN.length) s.add({ id: 'water_fountain', frame: FOUNTAIN[step], x: cx, y: fy, foot: fy });
        if (t >= 300 && t < 300 + SWELL_MS) s.ring(cx, cy, 4 + ((SWELL_R - 4) * (t - 300)) / SWELL_MS, SPLASH_LIGHT, SPLASH_DARK, true, 3);
        // The collapsing jet rains back down round its foot.
        if (step >= 8 && s.once(`${st.id}:fall`)) throwUp(s, cx, cy - 18, 16, 10, 22, 120, [SPRAY]);
        if (s.once(`${st.id}:spray`)) throwUp(s, cx, cy, DEBRIS, 90, 30, 160, [SPRAY]);
        // Steam rises once the jet has fallen back, so it does not hide the fountain.
        if (step >= 7 && s.once(`${st.id}:steam`)) {
          s.spawn({ id: 'steam_puff', x: cx, y: cy - 2, vx: 0, vy: -6, life: 1600, mode: 'once' });
          s.spawn({ id: 'steam_puff', x: cx - 9, y: cy + 2, vx: -3, vy: -4, life: 1300, mode: 'once' });
          s.spawn({ id: 'steam_puff', x: cx + 9, y: cy + 3, vx: 3, vy: -4, life: 1400, mode: 'once' });
        }
        return;
      }
      dustRing(s, cx, cy, t - 80);
      if (s.once(`${st.id}:debris`)) throwUp(s, cx, cy, DEBRIS, 80, 50, 150, [DEBRIS_HOT, DEBRIS_ROCK, DEBRIS_ROCK]);
      if (s.once(`${st.id}:dust`)) {
        const wind = ClimateSystem.airCurrent(st.y);
        s.spawn({ id: 'dust_cloud', x: cx, y: cy - 4, vx: wind.dx * DUST_DRIFT, vy: -DUST_RISE, life: DUST_LIFE_MS, mode: 'once' });
      }
    },
  };

  FX_SCRIPTS[EventKind.AtomicBomb] = {
    omen(s: FxScene, x: number, y: number, t: number): void {
      const [cx, cy] = centre(x, y);
      // High over the tile a point flares up, from a faint glint to a flickering light.
      light(s, cx, cy - 56, t, t > HAZARD_OMEN_MS[EventKind.AtomicBomb] / 3);
    },

    main(s: FxScene, st: FxStarted, t: number, world: WorldState): void {
      const [cx, cy] = centre(st.x, st.y);
      const fy = st.y * 16 + 15;
      flash(s, cx, cy, t);
      if (t < ATOMIC_SHOCK_MS) s.ring(cx, cy, Math.max(1, (ATOMIC_SHOCK_R * t) / ATOMIC_SHOCK_MS), RING_LIGHT, RING_DARK);
      dustRing(s, cx, cy, t - 200);
      if (t < 700) s.shake(st.x, st.y, 2, t < 300 ? 2 : 1);
      let frame = 0;
      while (frame < MUSHROOM_MS.length && t >= MUSHROOM_MS[frame]) frame++;
      s.add({ id: 'mushroom', frame, x: cx, y: fy, foot: fy });
      if (t < FLAMES_FROM_MS) return;
      const fires = world.hazards.hazard(st.id)?.impact?.fires ?? [];
      const wind = ClimateSystem.airCurrent(st.y);
      for (const i of fires) {
        // Each flame on its own beat, spot and height, so the ring does not read as a grid of stamps.
        const beat = hazardRoll(st.id, i, 5);
        const tx = i % GRID_W;
        const ty = Math.floor(i / GRID_W);
        const dx = ((tx - st.x + GRID_W * 1.5) % GRID_W) - GRID_W / 2;
        const px = (st.x + dx) * 16 + 3 + Math.floor(hazardRoll(st.id, i, 7) * 10);
        const py = ty * 16 + 9 + Math.floor(hazardRoll(st.id, i, 6) * 7);
        if (t > FLAMES_TO_MS - (1 - beat) * 500) {
          // Some dying flames leave a wisp of smoke that drifts off with the wind.
          if (beat < 0.6 && s.once(`${st.id}:smoke:${i}`)) s.spawn({ id: 'smoke_puff', x: px, y: py - 6, vx: wind.dx * 3 + (beat - 0.3) * 6, vy: -3 - beat * 3, life: 1000 + beat * 700, mode: 'once' });
          continue;
        }
        if (t < FLAMES_FROM_MS + beat * 500) continue;
        const id = t < FLAMES_LOW_MS && hazardRoll(st.id, i, 8) < 0.7 ? 'flame_medium' : 'flame_small';
        const frames = FX_MANIFEST.sprites[id]?.frames.length ?? 0;
        if (frames === 0) continue;
        s.add({ id, frame: Math.floor(t / 100 + beat * frames) % frames, x: px, y: py, foot: py });
      }
    },
  };
}
