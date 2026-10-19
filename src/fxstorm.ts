/* =============================================================================
 * SimEarth 2.0 — the hurricane on screen
 * -----------------------------------------------------------------------------
 * docs/ereignisse-spec.md §3.4. Omen: a small spiral gathers, the first rain
 * falls. Then the great spiral cloud turns over the eye's tile for as long as
 * the storm moves, gliding between its tick positions in real time:
 *   rain       curtains of rain under the bands, slanting with the wind round
 *              the eye, and streaks falling between them
 *   lightning  the cloud flickers from inside; the bolts the simulation
 *              decides on (stormStrikes) come down at their moment in the tick
 *              with a glow, sparks and thunder where they hit
 *   tornadoes  each funnel tears soil out of the ground round its foot, debris
 *              spirals up round it and is flung out, flying off in an arc and
 *              landing in a puff of dust
 * Draw order on the top layer: rain curtains, then the cloud (bands hide the
 * rain under them), then bolts, funnels and debris, so they show through it.
 * "Effekte reduzieren": no flicker, the bolts only in their dim frames.
 * ========================================================================== */

namespace SE {
  /** Below this strength a storm shows as the small spiral. */
  const STORM_BIG = 1.5;
  /** Art pixels round the eye where rain falls, and streaks a second per strength. */
  const RAIN_RADIUS = 44;
  const RAIN_RATE = 60;
  const RAIN: readonly string[] = [fxColor('ice', 4), fxColor('ice', 3), fxColor('ice', 2)];
  /** Rain curtains per strength, their reach round the eye (art px) and how fast they turn with the storm (rad/s). */
  const VEILS_PER_STRENGTH = 2;
  const VEIL_RADIUS_MIN = 16;
  const VEIL_RADIUS_MAX = 40;
  const VEIL_TURN = 0.35;
  const VEIL_FPS = 12;
  const SPENT_MS = 800;
  /** Sheet lightning inside the cloud: chance per window and strength, window and flash length in ms. */
  const FLICKER_CHANCE = 0.1;
  const FLICKER_WINDOW_MS = 330;
  const FLICKER_MS = 90;
  /** A bolt: frames per shape, its speed, when in the tick it may come down (shares of the tick). */
  const BOLT_FRAMES = 6;
  const BOLT_FPS = 15;
  const BOLT_FROM = 0.05;
  const BOLT_SPAN = 0.8;
  /** Frames of a bolt that are the strike itself, and the calm ones shown with reduced effects. */
  const BOLT_STRIKE = 1;
  const BOLT_CALM: readonly number[] = [3, 3, 3, 3, 5, 5];
  /** How long the cloud lights up round a strike, ms; at least this long between two claps of thunder. */
  const BOLT_FLASH_MS = 120;
  const THUNDER_GAP_MS = 250;
  /** Ground glow length, ms (4 frames). */
  const GLOW_MS = 333;
  const SPARKS = 6;
  const DUST: readonly string[] = [fxColor('sand', 1), fxColor('soil', 2), fxColor('soil', 1)];
  const SOIL: readonly string[] = [fxColor('soil', 3), fxColor('soil', 2), fxColor('soil', 1)];
  /**
   * Tornado: the funnel of the `tornado` sprite (tools/fx/twister.js), from its foot up to the wall cloud, and its
   * half width at the foot and the top, art px: it stays a rope most of the way and flares under the cloud.
   * Debris orbits it, rising per second, turning the way its stripes turn (counterclockwise seen from above).
   */
  const FUNNEL_H = 50;
  const FUNNEL_FOOT_R = 2.5;
  const FUNNEL_TOP_R = 9;
  const FUNNEL_FLARE = 2.5;
  /** Inside the dust collar at the foot, debris circles at least this far out, so it shows outside the dust. */
  const COLLAR_H = 6;
  const COLLAR_R = 9;
  const DEBRIS_SLOTS = 12;
  const DEBRIS_RISE = 22;
  const DEBRIS_SPIN = 6;
  /** The far side of the orbit is squashed into the view's slight tilt. */
  const ORBIT_TILT = 0.25;
  /** Flung debris: speed out (art px/s), up, gravity, and soil torn out of the ground per second. */
  const FLING_OUT = 30;
  const FLING_UP = 22;
  const GRAVITY = 70;
  const TEAR_RATE = 18;

  /** How many of something that happens `rate` times a second fall into this frame. */
  function due(rate: number, dt: number): number {
    const n = rate * dt;
    return Math.floor(n) + (Math.random() < n - Math.floor(n) ? 1 : 0);
  }

  function frameOf(id: string, now: number): number {
    const sp = FX_MANIFEST.sprites[id];
    return sp ? Math.floor(now / (1000 / Math.max(1, sp.fps))) % sp.loop : 0;
  }

  /** The centre between the last two tiles of `path`, `phase` of the way. */
  function eyeAt(path: readonly number[], phase: number): [number, number] {
    const n = path.length;
    const a = path[Math.max(0, n - 2)];
    const b = path[n - 1];
    const ax = a % GRID_W;
    const ay = (a / GRID_W) | 0;
    let dx = (b % GRID_W) - ax;
    if (dx > GRID_W / 2) dx -= GRID_W;
    else if (dx < -GRID_W / 2) dx += GRID_W;
    const dy = ((b / GRID_W) | 0) - ay;
    return [(ax + dx * phase) * 16 + 8, (ay + dy * phase) * 16 + 8];
  }

  /**
   * The storm's eye in world art pixels, `phase` of the way from the last tick to this one along its real track
   * (StormTrack.offsets): the poleward drift and the slow turn are gathered smoothly, so the eye glides on evenly
   * instead of lurching when its tile steps.
   */
  function stormEye(st: StormTrack, phase: number): [number, number] {
    const at = (k: number): [number, number] => {
      const i = st.path[k];
      return [(i % GRID_W + 0.5 + (st.offsets[2 * k] ?? 0)) * 16, (((i / GRID_W) | 0) + 0.5 + (st.offsets[2 * k + 1] ?? 0)) * 16];
    };
    const n = st.path.length;
    const [ax, ay] = at(Math.max(0, n - 2));
    const [bx, by] = at(n - 1);
    const span = GRID_W * 16;
    let dx = bx - ax;
    if (dx > span / 2) dx -= span;
    else if (dx < -span / 2) dx += span;
    return [ax + dx * phase, ay + (by - ay) * phase];
  }

  const southern = (y: number): boolean => latitudeDeg(y) < 0;
  const smallStorm = (y: number): string => (southern(y) ? 'storm_small_south' : 'storm_small');

  /** Rain streaks, two pixels falling together, over a disc round (x, y), blown sideways by the wind turning round the eye. */
  function rain(s: FxScene, x: number, y: number, radius: number, rate: number): void {
    for (let k = due(rate, s.dt); k > 0; k--) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r * 0.85;
      // The wind turns round the eye: its sideways pull is the tangent's x.
      const wind = Math.sin(a) * 26 * (southern(Math.floor(y / 16)) ? -1 : 1);
      const life = 0.16 + Math.random() * 0.14;
      s.particles.spawn(px, py, wind, 80, life, 0, RAIN);
      s.particles.spawn(px, py + 1, wind, 80, life, 0, RAIN);
    }
  }

  /** Curtains of rain round the eye, turning with the storm; they slant the way the wind blows where they hang. */
  function veils(s: FxScene, h: Hazard, x: number, y: number, strength: number): void {
    const sp = FX_MANIFEST.sprites.rain_veil;
    if (!sp) return;
    const south = southern(Math.floor(y / 16));
    const turn = (south ? 1 : -1) * VEIL_TURN * (s.now / 1000);
    const n = Math.round(VEILS_PER_STRENGTH * strength);
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2 + turn + landHash(h.id, j, 81) * 0.6;
      const r = VEIL_RADIUS_MIN + (VEIL_RADIUS_MAX - VEIL_RADIUS_MIN) * landHash(h.id, j, 82);
      const right = (Math.sin(a) > 0) !== south;
      const f = (right ? 4 : 0) + (Math.floor(s.now / (1000 / VEIL_FPS) + j) & 3);
      const vx = x + Math.cos(a) * r;
      const vy = y + Math.sin(a) * r * 0.85;
      s.add({ id: 'rain_veil', frame: f, x: vx, y: vy, foot: -2e6 + vy });
    }
  }

  interface Bolt {
    readonly x: number;
    readonly y: number;
    readonly born: number;
    readonly shape: number;
    readonly storm: number;
    /** Into the sea: the glow flashes but leaves no embers or scorch. */
    readonly sea: boolean;
  }

  /** Bolts on their way down or glowing out, in world art pixels. */
  let bolts: Bolt[] = [];
  /** When each storm's cloud last lit up from a strike. */
  const lit = new Map<number, number>();
  let lastThunder = 0;

  /** Thunder for a strike in view, louder the closer the camera. */
  function thunder(s: FxScene): void {
    if (s.now - lastThunder < THUNDER_GAP_MS) return;
    lastThunder = s.now;
    playSfx('thunder', clamp(s.pixel / 2, 0.35, 1));
  }

  /** The strikes the simulation decided on for this tick, each coming down at its own moment in it. */
  function strikes(s: FxScene, world: WorldState, h: Hazard): void {
    const tick = world.ticks;
    const tiles = stormStrikes(world, h, tick);
    for (let k = 0; k < tiles.length; k++) {
      const at = BOLT_FROM + BOLT_SPAN * landHash(h.id, tick * 8 + k, 77);
      if (s.phase < at) continue;
      const i = tiles[k];
      const tx = i % GRID_W;
      const ty = (i / GRID_W) | 0;
      if (!s.once(`${h.id}:bolt:${tick}:${k}`) || !s.sees(tx, ty)) continue;
      const x = tx * 16 + 3 + Math.floor(landHash(i, tick, 78) * 10);
      const y = ty * 16 + 4 + Math.floor(landHash(i, tick, 79) * 10);
      bolts.push({ x, y, born: s.now, shape: landHash(i, tick, 80) < 0.5 ? 0 : 1, storm: h.id, sea: world.isWater(i) });
    }
  }

  /** Every bolt in its current frame; the strike frame lights the cloud, throws sparks and claps thunder. */
  function drawBolts(s: FxScene): void {
    const ms = 1000 / BOLT_FPS;
    bolts = bolts.filter((b) => s.now - b.born < Math.max(BOLT_FRAMES * ms, ms * BOLT_STRIKE + GLOW_MS));
    for (const b of bolts) {
      const age = s.now - b.born;
      const f = Math.floor(age / ms);
      if (f === BOLT_STRIKE && s.once(`strike:${b.storm}:${b.x}:${b.y}:${b.born}`)) {
        lit.set(b.storm, s.now);
        thunder(s);
        for (let k = 0; k < SPARKS; k++) {
          s.particles.spawn(b.x, b.y - 1, (Math.random() - 0.5) * 40, -10 - Math.random() * 25, 0.3 + Math.random() * 0.3, 90, FX_EMBER);
        }
      }
      if (f < BOLT_FRAMES) s.add({ id: 'lightning', frame: b.shape * BOLT_FRAMES + (s.reduce ? BOLT_CALM[f] : f), x: b.x, y: b.y, foot: b.y });
      const g = age - ms * BOLT_STRIKE;
      const glow = Math.floor((g / GLOW_MS) * 4);
      if (g >= 0 && g < GLOW_MS && (!b.sea || glow < 2)) s.add({ id: 'lightning_glow', frame: glow, x: b.x, y: b.y, foot: b.y });
    }
  }

  /** Whether the cloud shows its lit frames now: right after a strike, or sheet lightning flickering inside it. */
  function flickers(s: FxScene, h: Hazard, strength: number): boolean {
    if (s.reduce) return false;
    if (s.now - (lit.get(h.id) ?? -1e9) < BOLT_FLASH_MS) return true;
    const window = Math.floor(s.now / FLICKER_WINDOW_MS);
    return s.now - window * FLICKER_WINDOW_MS < FLICKER_MS && landHash(h.id, window, 83) < FLICKER_CHANCE * strength;
  }

  interface Flung {
    x: number;
    y: number;
    /** Height above the ground, art px, and the velocities (art px/s). */
    z: number;
    vx: number;
    vy: number;
    vz: number;
    readonly kind: number;
    readonly born: number;
  }

  /** Debris thrown out of a funnel, flying until it lands. */
  let flung: Flung[] = [];

  /** Radius of the funnel at height z above its foot. */
  function funnelRadius(z: number): number {
    return FUNNEL_FOOT_R + (FUNNEL_TOP_R - FUNNEL_FOOT_R) * Math.pow(clamp(z / FUNNEL_H, 0, 1), FUNNEL_FLARE);
  }

  /**
   * A funnel at foot (x, y): soil torn out round its foot, debris spiralling
   * up round it (behind the funnel on the far side, in front on the near one)
   * and flung out when it reaches its height.
   */
  function twister(s: FxScene, key: string, seed: number, x: number, y: number): void {
    // Funnel and debris are object sprites put on the top layer, so the cloud's bands don't hide them.
    s.tops.push({ id: 'tornado', frame: frameOf('tornado', s.now + seed * 37), x, y, foot: y });
    for (let k = due(TEAR_RATE, s.dt); k > 0; k--) {
      const a = Math.random() * Math.PI * 2;
      const r = 7 + Math.random() * 5;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r * ORBIT_TILT;
      s.particles.spawn(px, py, (x - px) * 2.2, -10 - Math.random() * 14, 0.35 + Math.random() * 0.25, 0, SOIL);
    }
    const sp = FX_MANIFEST.sprites.tornado_debris;
    if (!sp) return;
    const t = s.now / 1000;
    for (let k = 0; k < DEBRIS_SLOTS; k++) {
      const top = FUNNEL_H * (0.45 + 0.5 * landHash(seed, k, 84));
      const cycle = top / DEBRIS_RISE;
      const run = t / cycle + landHash(seed, k, 85);
      const lap = Math.floor(run);
      const z = (run - lap) * top;
      const a = landHash(seed, k, 86) * Math.PI * 2 - DEBRIS_SPIN * t;
      let r = funnelRadius(z) + 2 + 3 * landHash(seed, k, 87);
      if (z < COLLAR_H) r = Math.max(r, COLLAR_R);
      const kind = Math.floor(landHash(seed, k, 88) * 4);
      const dx = Math.cos(a) * r;
      const near = Math.sin(a) > 0;
      const tumble = (Math.floor(t * 8 + k) & 1);
      s.tops.push({ id: 'tornado_debris', frame: kind * 2 + tumble, x: x + dx, y: y - z + Math.sin(a) * r * ORBIT_TILT, foot: y + (near ? 1 : -1) });
      // At the top of its climb the piece is flung out along its orbit and flies off.
      // On the orbit a turns by −spin per second, so the piece moves along (sin a, −cos a): flung out that way.
      if (z > top * 0.92 && s.once(`${key}:fling:${k}:${lap}`)) {
        const out = FLING_OUT * (0.7 + 0.6 * Math.random());
        flung.push({
          x: x + dx, y: y + Math.sin(a) * r * ORBIT_TILT, z,
          vx: Math.sin(a) * out + Math.cos(a) * 8, vy: (-Math.cos(a) * out + Math.sin(a) * 8) * 0.5,
          vz: FLING_UP * Math.random(), kind, born: s.now,
        });
      }
    }
  }

  /** Flung debris falls in its arc and lands in a puff of dust. */
  function drawFlung(s: FxScene): void {
    const dt = s.dt;
    flung = flung.filter((p) => {
      p.vz -= GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.z <= 0) {
        for (let k = 0; k < 4; k++) s.particles.spawn(p.x, p.y, (Math.random() - 0.5) * 16, -4 - Math.random() * 6, 0.3 + Math.random() * 0.2, 20, DUST);
        return false;
      }
      const tumble = Math.floor((s.now - p.born) / 90) & 1;
      s.tops.push({ id: 'tornado_debris', frame: p.kind * 2 + tumble, x: p.x, y: p.y - p.z, foot: p.y });
      return true;
    });
  }

  /** The storm's funnels gliding inland; one lifting throws out what it carries in a burst of dust. */
  function tornadoes(s: FxScene, h: Hazard, st: StormTrack, phase: number): void {
    for (const t of st.tornadoes) {
      const [x, cy] = eyeAt(t.path, phase);
      if (!s.sees(wrapX(Math.floor(x / 16)), Math.floor(cy / 16))) continue;
      const y = cy + 7;
      const key = `${h.id}:${t.path[0]}`;
      if (t.left <= 0 && phase > 0.75) {
        if (s.once(`${key}:lift`)) {
          for (let k = 0; k < 10; k++) s.particles.spawn(x, y - 2, (Math.random() - 0.5) * 30, -8 - Math.random() * 12, 0.5 + Math.random() * 0.4, 20, DUST);
          for (let k = 0; k < 5; k++) {
            const a = Math.random() * Math.PI * 2;
            flung.push({ x, y, z: 10 + Math.random() * 30, vx: Math.cos(a) * FLING_OUT, vy: Math.sin(a) * FLING_OUT * 0.4, vz: 10, kind: k & 3, born: s.now });
          }
        }
        continue;
      }
      // One roar per storm's touchdown, even when it sets down two funnels.
      if (s.once(`${h.id}:tornado-sound`)) playSfx('tornado');
      twister(s, key, t.path[0], x, y);
    }
  }

  /** How loud the storm's wind should be, 0..1 before the zoom: the strongest storm in view; `at` when last measured. */
  export const STORM_SOUND = { presence: 0, at: -1e9 };

  FX_SCRIPTS[EventKind.Hurricane] = {
    reset(): void {
      bolts = [];
      flung = [];
      lit.clear();
    },

    omen(s: FxScene, x: number, y: number, t: number): void {
      const cx = x * 16 + 8;
      const cy = y * 16 + 8;
      const id = smallStorm(y);
      s.add({ id, frame: frameOf(id, s.now), x: cx, y: cy, foot: -1e6 + cy });
      rain(s, cx, cy, 20, (RAIN_RATE * t) / HAZARD_OMEN_MS[EventKind.Hurricane]);
    },

    // live() draws the storm, which knows where the eye has gone.
    main(): void {},

    live(s: FxScene, world: WorldState): void {
      const phase = s.phase;
      let presence = 0;
      for (const h of world.hazards.list) {
        const st = h.storm;
        if (!st) continue;
        const [x, y] = stormEye(st, st.moving ? phase : 1);
        tornadoes(s, h, st, phase);
        if (!s.sees(wrapX(Math.floor(x / 16)), Math.floor(y / 16))) continue;
        if (!st.moving) {
          // Spent: the cloud shrinks to a small spiral and is gone.
          if (s.once(`${h.id}:spent`)) s.spawn({ id: smallStorm(h.y), x, y, vx: 0, vy: 0, life: SPENT_MS, mode: 'loop' });
          continue;
        }
        presence = Math.max(presence, clamp(st.strength / HURRICANE_MAX, 0.4, 1));
        strikes(s, world, h);
        const small = st.strength < STORM_BIG;
        const ty = Math.floor(y / 16);
        if (small) {
          const id = smallStorm(ty);
          s.add({ id, frame: frameOf(id, s.now), x, y, foot: -1e6 + y });
          rain(s, x, y, 20, RAIN_RATE * 0.5);
          continue;
        }
        const id = southern(ty) ? 'hurricane_south' : 'hurricane';
        const sp = FX_MANIFEST.sprites[id];
        const flashing = !!sp && sp.frames.length > sp.loop && flickers(s, h, st.strength);
        s.add({ id, frame: frameOf(id, s.now) + (flashing && sp ? sp.loop : 0), x, y, foot: -1e6 + y });
        veils(s, h, x, y, st.strength);
        rain(s, x, y, RAIN_RADIUS, RAIN_RATE * st.strength);
      }
      drawBolts(s);
      drawFlung(s);
      STORM_SOUND.presence = presence;
      STORM_SOUND.at = s.now;
    },
  };
}
