/* =============================================================================
 * SimEarth 2.0 — tidal wave and hurricane on screen
 * -----------------------------------------------------------------------------
 * docs/ereignisse-spec.md §3.4, §3.5:
 *   tidal wave  omen: the sea draws back to the tile (light rings closing in,
 *               foam left behind); main: the first ring runs out two tiles;
 *               then a crest rides every leading front tile, gliding across
 *               it and drawn for the wave's heading there: low out at sea or
 *               with little energy left, steep over the shelf; where the
 *               front reaches the coast it breaks towards the land. Flood
 *               water and its foam rim are ground (fxground.ts), the
 *               driftwood in the mud a scar object.
 *   hurricane   omen: a small spiral gathers, the first rain falls; then the
 *               spiral cloud with its eye turns over the eye's tile for as
 *               long as the storm moves, gliding between its tick positions
 *               in real time, rain streaks under it; its tornadoes glide
 *               inland with dust whirling round their feet. Wet ground and
 *               fallen trees are ground and scar objects again.
 * ========================================================================== */

namespace SE {
  const FOAM: readonly string[] = [fxColor('white', 0), fxColor('water', 7), fxColor('water', 6)];
  const RAIN: readonly string[] = [fxColor('ice', 4), fxColor('ice', 3), fxColor('ice', 2)];
  const SEA_LIGHT = fxColor('white', 0);
  const SEA_FOAM = fxColor('water', 7);
  const SEA_DARK = fxColor('water', 5);
  /** Art pixels the first ring of a tidal wave runs out in its main animation: two tiles. */
  const WAVE_RING = 32;
  /** Below this strength a storm shows as the small spiral. */
  const STORM_BIG = 1.5;
  /** Art pixels round the eye where rain falls, reaching past the cloud's edge, and streaks a second per strength. */
  const RAIN_RADIUS = 26;
  const RAIN_RATE = 30;
  const SPENT_MS = 800;
  /** Directions a directed sprite holds one after another (tools/fx/catalog.js), in HAZARD_NX / HAZARD_NY order. */
  const DIRECTIONS = 8;
  /** Below this share of its energy a wave stays a low crest even over the shelf. */
  const WAVE_COAST_ENERGY = 0.2;
  /** Art pixels a breaker stands from its water tile's centre towards the land. */
  const BREAK_SHIFT = 6;
  const DUST: readonly string[] = [fxColor('sand', 1), fxColor('soil', 2), fxColor('soil', 1)];

  /** When the simulation last ticked, so the screen can move between two ticks in real time. */
  const clock = { ticks: -1, at: 0, ms: 400 };

  /** 0 right after a tick, 1 once the next one is due (and while the game is paused). */
  function tickPhase(s: FxScene, world: WorldState): number {
    if (world.ticks !== clock.ticks) {
      if (world.ticks === clock.ticks + 1) clock.ms = clamp(s.now - clock.at, 60, 4000);
      clock.ticks = world.ticks;
      clock.at = s.now;
    }
    return clamp((s.now - clock.at) / clock.ms, 0, 1);
  }

  /** How many of something that happens `rate` times a second fall into this frame. */
  function due(rate: number, dt: number): number {
    const n = rate * dt;
    return Math.floor(n) + (Math.random() < n - Math.floor(n) ? 1 : 0);
  }

  function frameOf(id: string, now: number): number {
    const sp = FX_MANIFEST.sprites[id];
    return sp ? Math.floor(now / (1000 / Math.max(1, sp.fps))) % sp.loop : 0;
  }

  /** Frame `f` of direction d of a directed sprite. */
  function directed(id: string, d: number, f: number): number {
    const sp = FX_MANIFEST.sprites[id];
    if (!sp) return 0;
    const per = sp.frames.length / DIRECTIONS;
    return d * per + (f % per);
  }

  /** The direction index of a step (dx, dy) of −1, 0 or 1 each; -1 for none. */
  function directionOf(dx: number, dy: number): number {
    for (let k = 0; k < 8; k++) if (HAZARD_NX[k] === dx && HAZARD_NY[k] === dy) return k;
    return -1;
  }

  /** Rain streaks, two pixels falling together, over a disc round (x, y). */
  function rain(s: FxScene, x: number, y: number, radius: number, rate: number): void {
    for (let k = due(rate, s.dt); k > 0; k--) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r * 0.85;
      const life = 0.16 + Math.random() * 0.14;
      s.particles.spawn(px, py, -10, 80, life, 0, RAIN);
      s.particles.spawn(px, py + 1, -10, 80, life, 0, RAIN);
    }
  }

  /** Foam flecks on a ring of radius r round (x, y), drifting at `speed` art pixels a second (inwards when negative). */
  function foam(s: FxScene, x: number, y: number, r: number, speed: number, rate: number, life: number): void {
    for (let k = due(rate, s.dt); k > 0; k--) {
      const a = Math.random() * Math.PI * 2;
      const c = Math.cos(a);
      const n = Math.sin(a);
      s.particles.spawn(x + c * r, y + n * r, c * speed, n * speed, life * (0.7 + Math.random() * 0.6), 0, FOAM);
    }
  }

  /** Each running wave's arrival by tile, rebuilt when its field has moved on. */
  const arrivals = new Map<number, { readonly key: string; readonly at: Map<number, number> }>();

  function arrivalsOf(id: number, wave: TidalWave): Map<number, number> {
    const key = `${wave.arrival.length}|${wave.arrival[0]}`;
    const hit = arrivals.get(id);
    if (hit && hit.key === key) return hit.at;
    const at = new Map<number, number>();
    wave.tiles.forEach((i, k) => at.set(i, wave.arrival[k]));
    arrivals.set(id, { key, at });
    return at;
  }

  /** Breakers playing, by hazard and tile: where they stand, which way they break, since when. */
  interface Breaker { readonly hazard: number; readonly x: number; readonly y: number; readonly d: number; readonly born: number }
  const breakers = new Map<string, Breaker>();

  /** Start a breaker on coast water tile (x, y): it breaks towards the land around it, or along `heading`. */
  function breakAt(s: FxScene, world: WorldState, h: Hazard, x: number, y: number, heading: number): void {
    const key = `${h.id}:break:${x},${y}`;
    // Once per tile: at slow speed the tile stays in the front's window long after its breaker has played.
    if (!s.once(key)) return;
    let lx = 0;
    let ly = 0;
    for (let n = 0; n < 8; n++) {
      const ny = y + HAZARD_NY[n];
      if (ny < 0 || ny >= GRID_H || world.elevation[idx(wrapX(x + HAZARD_NX[n]), ny)] < 0) continue;
      lx += HAZARD_NX[n];
      ly += HAZARD_NY[n];
    }
    const d = directionOf(Math.sign(lx), Math.sign(ly));
    const sx = Math.sign(lx) * BREAK_SHIFT;
    const sy = Math.sign(ly) * BREAK_SHIFT;
    breakers.set(key, { hazard: h.id, x: x * 16 + 8 + sx, y: y * 16 + 15 + sy, d: d < 0 ? heading : d, born: s.now });
  }

  /** Every breaker plays its frames once. */
  function drawBreakers(s: FxScene): void {
    const sp = FX_MANIFEST.sprites.wave_break;
    if (!sp) return;
    const ms = 1000 / Math.max(1, sp.fps);
    const per = sp.frames.length / DIRECTIONS;
    for (const [key, b] of breakers) {
      const f = Math.floor((s.now - b.born) / ms);
      if (f >= per || f < 0) {
        breakers.delete(key);
        continue;
      }
      s.add({ id: 'wave_break', frame: directed('wave_break', b.d, f), x: b.x, y: b.y, foot: b.y });
    }
  }

  FX_SCRIPTS[EventKind.TidalWave] = {
    reset(): void {
      arrivals.clear();
      breakers.clear();
    },

    omen(s: FxScene, x: number, y: number, t: number): void {
      const cx = x * 16 + 8;
      const cy = y * 16 + 8;
      const p = t / HAZARD_OMEN_MS[EventKind.TidalWave];
      for (const r0 of [14, 22]) {
        const r = Math.round(r0 * (1 - p * 0.75));
        if (r >= 2) s.ring(cx, cy, r, SEA_LIGHT, SEA_DARK, true);
      }
      foam(s, cx, cy, 6 + Math.random() * 12, -6, 25, 0.6);
    },

    main(s: FxScene, st: FxStarted, t: number): void {
      const cx = st.x * 16 + 8;
      const cy = st.y * 16 + 8;
      const p = Math.min(1, t / HAZARD_MAIN_MS[EventKind.TidalWave]);
      const r = Math.round(WAVE_RING * (1 - (1 - p) * (1 - p)));
      if (r >= 1) s.ring(cx, cy, r, SEA_LIGHT, SEA_DARK, true);
      if (r >= 8) s.ring(cx, cy, r - 5, SEA_FOAM, SEA_DARK, true);
      if (r >= 2) foam(s, cx, cy, r, 10, 40, 0.4);
    },

    live(s: FxScene, world: WorldState): void {
      const phase = tickPhase(s, world);
      const deep = frameOf('wave_deep', s.now);
      const coast = frameOf('wave_coast', s.now);
      for (const id of [...arrivals.keys()]) if (!world.hazards.hazard(id)) arrivals.delete(id);
      for (const h of world.hazards.list) {
        const wave = h.wave;
        if (!wave || wave.arrival.length === 0) continue;
        // The front of this tick, gliding: arrivals up to T, tiles not yet crossed.
        const T = h.age - 1 + phase;
        const arr = wave.arrival;
        const at = arrivalsOf(h.id, wave);
        // Only the leading edge: in the shallows a tile stays the front for a whole tick while deep water around it has long been passed.
        const ahead = (j: number): boolean => {
          const a = at.get(j);
          return a === undefined ? world.elevation[j] >= 0 : a > T;
        };
        let lo = 0;
        let hi = arr.length;
        while (lo < hi) {
          const m = (lo + hi) >> 1;
          if (arr[m] <= T - WAVE_TICKS_SHALLOW) lo = m + 1;
          else hi = m;
        }
        for (let k = lo; k < arr.length && arr[k] <= T; k++) {
          const i = wave.tiles[k];
          const e = world.elevation[i];
          const into = (T - arr[k]) / waveTicks(e);
          const x = i % GRID_W;
          const y = (i / GRID_W) | 0;
          if (!s.sees(x, y)) continue;
          let shore = false;
          for (let n = 0; n < 8 && !shore; n++) {
            const ny = y + HAZARD_NY[n];
            shore = ny >= 0 && ny < GRID_H && world.elevation[idx(wrapX(x + HAZARD_NX[n]), ny)] >= 0;
          }
          // Where the front reaches the coast the crest breaks, however fast it crossed the tile.
          if (shore) {
            breakAt(s, world, h, x, y, wave.heading[k]);
            continue;
          }
          if (into >= 1) continue;
          // Leading where the next tile along its heading is still to come: one crest per ray, no stacked rows.
          const d = wave.heading[k];
          const ny = y + HAZARD_NY[d];
          if (ny < 0 || ny >= GRID_H || !ahead(idx(wrapX(x + HAZARD_NX[d]), ny))) continue;
          const px = x * 16 + 8 + Math.round(HAZARD_NX[d] * (into - 0.5) * 16);
          const py = y * 16 + 8 + Math.round(HAZARD_NY[d] * (into - 0.5) * 16);
          const steep = e >= COAST_DEPTH && Math.pow(WAVE_DECAY, wave.path[k]) >= WAVE_COAST_ENERGY;
          if (steep) s.add({ id: 'wave_coast', frame: directed('wave_coast', d, coast), x: px, y: py, foot: py + 8 });
          else s.add({ id: 'wave_deep', frame: directed('wave_deep', d, deep), x: px, y: py, foot: py + 4 });
        }
      }
      for (const [key, b] of breakers) if (!world.hazards.hazard(b.hazard)) breakers.delete(key);
      drawBreakers(s);
    },
  };

  /** Each storm's eye at the last frame, in art pixels: its main animation rains there. */
  const eyes = new Map<number, readonly [number, number]>();

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

  /** The small spiral turning the right way for its hemisphere. */
  function smallStorm(y: number): string {
    return latitudeDeg(y) < 0 ? 'storm_small_south' : 'storm_small';
  }

  /** The storm's funnels gliding inland, dust whirling round their feet; one lifting fades into a burst of dust. */
  function tornadoes(s: FxScene, h: Hazard, st: StormTrack, phase: number): void {
    for (const t of st.tornadoes) {
      const [x, cy] = eyeAt(t.path, phase);
      if (!s.sees(wrapX(Math.floor(x / 16)), Math.floor(cy / 16))) continue;
      const y = cy + 7;
      if (t.left <= 0 && phase > 0.75) {
        if (s.once(`${h.id}:lift:${t.path[0]}`)) for (let k = 0; k < 10; k++) s.particles.spawn(x, y - 2, (Math.random() - 0.5) * 30, -8 - Math.random() * 12, 0.5 + Math.random() * 0.4, 20, DUST);
        continue;
      }
      // One roar per storm's touchdown, even when it sets down two funnels.
      if (s.once(`${h.id}:tornado-sound`)) playSfx('tornado');
      // Each funnel turns out of step with the others.
      s.add({ id: 'tornado', frame: frameOf('tornado', s.now + t.path[0] * 37), x, y, foot: y });
      for (let k = due(14, s.dt); k > 0; k--) {
        const side = Math.random() < 0.5 ? -1 : 1;
        s.particles.spawn(x + side * (3 + Math.random() * 3), y - Math.random() * 3, side * (8 + Math.random() * 10), -6 - Math.random() * 10, 0.4 + Math.random() * 0.3, 20, DUST);
      }
    }
  }

  FX_SCRIPTS[EventKind.Hurricane] = {
    omen(s: FxScene, x: number, y: number, t: number): void {
      const cx = x * 16 + 8;
      const cy = y * 16 + 8;
      const id = smallStorm(y);
      s.add({ id, frame: frameOf(id, s.now), x: cx, y: cy, foot: cy + 16 });
      rain(s, cx, cy, 14, (RAIN_RATE * 2 * t) / HAZARD_OMEN_MS[EventKind.Hurricane]);
    },

    main(s: FxScene, st: FxStarted): void {
      // live() draws the storm, which knows where the eye has gone; its first seconds pour.
      const at = eyes.get(st.id);
      if (at) rain(s, at[0], at[1], RAIN_RADIUS, RAIN_RATE * 2);
    },

    live(s: FxScene, world: WorldState): void {
      const phase = tickPhase(s, world);
      eyes.clear();
      for (const h of world.hazards.list) {
        const st = h.storm;
        if (!st) continue;
        const [x, y] = eyeAt(st.path, st.moving ? phase : 1);
        tornadoes(s, h, st, phase);
        eyes.set(h.id, [x, y]);
        if (!s.sees(wrapX(Math.floor(x / 16)), Math.floor(y / 16))) continue;
        if (!st.moving) {
          // Spent: the cloud shrinks to a small spiral and is gone.
          if (s.once(`${h.id}:spent`)) s.spawn({ id: smallStorm(h.y), x, y, vx: 0, vy: 0, life: SPENT_MS, mode: 'loop' });
          continue;
        }
        const small = st.strength < STORM_BIG;
        const id = small ? smallStorm(h.y) : latitudeDeg(h.y) < 0 ? 'hurricane_south' : 'hurricane';
        s.add({ id, frame: frameOf(id, s.now), x, y, foot: y + 24 });
        rain(s, x, y, small ? 16 : RAIN_RADIUS, RAIN_RATE * Math.max(1, st.strength));
      }
    },
  };
}
