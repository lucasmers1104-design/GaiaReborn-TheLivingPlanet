/* =============================================================================
 * SimEarth 2.0 — the earthquake on screen
 * -----------------------------------------------------------------------------
 * docs/ereignisse-spec.md §3.6:
 *   omen   (0.6 s)  the epicentre trembles, dust specks rise
 *   main   (2.5 s)  the tiles within 4 tremble, weaker outwards; three ground
 *                   waves run out to 4 tiles; dust rises over cities and
 *                   slopes, and runs along the fissure as it opens
 *   spread          landslides puff dust and send stones rolling downhill
 *   after           damaged cities lie in rubble that puffs now and then;
 *                   fissures, ruins (fxscars.ts) and scree (the terrain)
 *                   draw themselves
 * What the main animation shows of the quake's state (fissure, slopes,
 * cities) is added in live(), keyed by the hazard's id: a quake can end
 * before its main animation does.
 * ========================================================================== */

namespace SE {
  /** Dust from freshly kicked up to settling. */
  const DUST: readonly string[] = [fxColor('sand', 3), fxColor('sand', 2), fxColor('soil', 3), fxColor('soil', 2)];
  /** Dust over bright ground (sand, rock, snow), where pale specks would vanish. */
  const DUST_ON_BRIGHT: readonly string[] = [fxColor('soil', 3), fxColor('soil', 2), fxColor('soil', 1), fxColor('soil', 1)];
  /** Stones of a landslide: lit while they tumble, then lying in the shade of the slope. */
  const STONES: readonly string[] = [fxColor('rock', 4), fxColor('rock', 3), fxColor('rock', 2), fxColor('rock', 1)];
  /**
   * Ground-wave colours: light and dark arc, strong and faint. A pale light
   * arc vanishes on sand and pale rock (R1), so over bright ground the light
   * arc is a mid brown — still lighter than the dark arc, still lit from the
   * upper left.
   */
  interface WaveTones { readonly light: string; readonly dark: string; readonly faintLight: string; readonly faintDark: string; readonly dust: readonly string[] }
  const WAVE_ON_DARK: WaveTones = { light: fxColor('sand', 3), dark: fxColor('soil', 0), faintLight: fxColor('sand', 1), faintDark: fxColor('soil', 1), dust: DUST };
  const WAVE_ON_BRIGHT: WaveTones = { light: fxColor('soil', 2), dark: fxColor('soil', 0), faintLight: fxColor('sand', 0), faintDark: fxColor('soil', 1), dust: DUST_ON_BRIGHT };
  /** Foam flecks instead of dust where the quake shakes the sea. */
  const FOAM: readonly string[] = [fxColor('ice', 3), fxColor('water', 7), fxColor('water', 6), fxColor('water', 6)];
  /** A seaquake's waves ripple the water: sea tones, no sand over the sea. */
  const WAVE_AT_SEA: WaveTones = { light: fxColor('water', 7), dark: fxColor('water', 3), faintLight: fxColor('water', 6), faintDark: fxColor('water', 4), dust: FOAM };
  const WAVES = 3;
  /** Art pixels of arc per dash and per gap of a ground wave. */
  const WAVE_DASH = 4;
  /** Share of its run after which a ground wave thins to one faint pixel. */
  const WAVE_FAINT_FROM = 0.65;
  const WAVE_FIRST_MS = 150;
  const WAVE_GAP_MS = 450;
  const WAVE_MS = 1000;
  /** Art pixels a ground wave runs out to: 4 tiles. */
  const WAVE_REACH = 64;
  /** The tiles within TREMOR_RADIUS tremble by 1 art pixel, those within TREMOR_CORE by 2: 2 → 1 → 0 outwards. */
  const TREMOR_RADIUS = 3;
  const TREMOR_CORE = 1;
  /** The full tremor; the outer ring calms down first, then only the epicentre's tiles settle. */
  const TREMOR_MS = 1700;
  const TREMOR_OUTER_MS = 1300;
  const SETTLE_MS = 2200;
  /** The fissure opens from the epicentre to its ends in CRACK_MS. */
  const CRACK_FROM_MS = 120;
  const CRACK_MS = 800;
  const PUFF_MS = 900;
  const OMEN_SPECK_MS = 50;
  /** Dust over cities and slopes rises SHAKEN_FROM_MS after the shock, plus a step per tile of distance. */
  const SHAKEN_FROM_MS = 250;
  const SHAKEN_STEP_MS = 160;
  /** Slopes that puff dust during the shock at most; the slides themselves puff again. */
  const SHAKEN_SLOPES = 4;
  /** Landslides of one quake that puff dust in one tick at most; the others only send stones rolling. */
  const SLIDE_PUFFS = 4;
  /** Rubble puffs dust on its own beat, every RUBBLE_BEAT_MS plus up to as much again. */
  const RUBBLE_BEAT_MS = 1600;
  const RUBBLE_PUFF_MS = 500;
  /** Stones each landslide sends tumbling. */
  const SLIDE_STONES = 7;
  /** Ticks after a landslide during which its dust still rises (a frame may come a tick late). */
  const SLIDE_FRESH = 2;

  interface Playing {
    readonly st: FxStarted;
    quake: QuakeState | null;
    readonly tones: WaveTones;
  }

  /** Quakes whose main animation is playing, by hazard id. */
  const playing = new Map<number, Playing>();
  /** Every quake seen running, by hazard id: its last landslides come down in the tick it ends. */
  const quakes = new Map<number, QuakeState>();

  /** The world live() last saw: the omen is not handed it, and its specks are foam over the sea. */
  let seen: WorldState | null = null;

  /** Landscapes whose ground is pale: bare rock, sand, salt and snow. */
  const BRIGHT_GROUND = new Set<number>([Landscape.Ice, Landscape.Snow, Landscape.Rock, Landscape.Desert, Landscape.Semidesert]);

  /** The wave colours around (x, y): sea tones when most tiles within the waves' reach are water, bright when most land tiles are pale. */
  function waveTones(world: WorldState, x: number, y: number): WaveTones {
    let land = 0;
    let sea = 0;
    let bright = 0;
    const r = WAVE_REACH / 16;
    for (let dy = -r; dy <= r; dy++) {
      const ty = y + dy;
      if (ty < 0 || ty >= GRID_H) continue;
      for (let dx = -r; dx <= r; dx++) {
        const i = idx(wrapX(x + dx), ty);
        if (world.elevation[i] < 0) { sea++; continue; }
        land++;
        const l = world.landscape[i];
        if (BRIGHT_GROUND.has(l) || (l === Landscape.Barren && world.substrate[i] === Substrate.Sand)) bright++;
      }
    }
    if (sea > land) return WAVE_AT_SEA;
    return bright * 2 > land ? WAVE_ON_BRIGHT : WAVE_ON_DARK;
  }

  function puff(s: FxScene, x: number, y: number, life: number): void {
    s.spawn({ id: 'dust_puff', x, y, vx: (Math.random() - 0.5) * 8, vy: -8 - Math.random() * 6, life, mode: 'once' });
  }

  function specks(s: FxScene, x: number, y: number, n: number, rise: number, dust: readonly string[] = DUST): void {
    for (let k = 0; k < n; k++) {
      s.particles.spawn(
        x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 14, -rise * (0.5 + Math.random()), 0.5 + Math.random() * 0.4, 40, dust,
      );
    }
  }

  /** Dust running along the fissure as it opens, then over the cities and slopes the shock reached. */
  function shock(s: FxScene, world: WorldState, st: FxStarted, q: QuakeState, t: number, tones: WaveTones): void {
    for (const i of q.line) {
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      const due = CRACK_FROM_MS + (CRACK_MS * hazardDistance(st.x, st.y, x, y)) / q.magnitude;
      if (t < due) { s.hidden.add(i); continue; }
      if (!s.once(`${st.id}:crack:${i}`)) continue;
      const wet = world.elevation[i] < 0;
      if (!wet) puff(s, x * 16 + 8, y * 16 + 9, PUFF_MS * 0.8);
      specks(s, x * 16 + 8, y * 16 + 10, 4, 20, wet ? FOAM : tones.dust);
    }
    const hz = world.hazards;
    const shaken = q.steep.slice(0, SHAKEN_SLOPES);
    const r = QUAKE_CITY_FAR;
    for (let dy = -r; dy <= r; dy++) {
      const y = st.y + dy;
      if (y < 0 || y >= GRID_H) continue;
      for (let dx = -r; dx <= r; dx++) {
        const i = idx(wrapX(st.x + dx), y);
        if (world.tech[i] !== Tech.None || hz.scar[i] === ScarKind.Ruins) shaken.push(i);
      }
    }
    for (const i of shaken) {
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      const due = SHAKEN_FROM_MS + hazardDistance(st.x, st.y, x, y) * SHAKEN_STEP_MS + hazardRoll(st.id, i, 3) * 250;
      if (t < due || !s.once(`${st.id}:shaken:${i}`)) continue;
      puff(s, x * 16 + 8, y * 16 + 11, PUFF_MS);
    }
  }

  /** Dust over fresh landslides, a few per tick, and stones rolling onto the tile below each. */
  function slides(s: FxScene, world: WorldState): void {
    const hz = world.hazards;
    for (const h of hz.list) if (h.kind === EventKind.Earthquake && h.quake) quakes.set(h.id, h.quake);
    for (const [id, q] of quakes) {
      let fresh = false;
      // Slides of one tick lie together in the list; `rank` counts them.
      let tick = -1;
      let rank = 0;
      for (const sl of q.slid) {
        rank = sl.tick === tick ? rank + 1 : 0;
        tick = sl.tick;
        const age = world.ticks - sl.tick;
        if (age < 0 || age > SLIDE_FRESH) continue;
        fresh = true;
        const fx = sl.from % GRID_W;
        const fy = (sl.from / GRID_W) | 0;
        if (!s.sees(fx, fy) || !s.once(`${id}:slide:${sl.from}`)) continue;
        const tx = sl.to % GRID_W;
        const ty = (sl.to / GRID_W) | 0;
        let dx = tx - fx;
        if (dx > GRID_W / 2) dx -= GRID_W;
        if (dx < -GRID_W / 2) dx += GRID_W;
        // Between the slope and where it landed.
        if (rank < SLIDE_PUFFS) puff(s, fx * 16 + 8 + dx * 8, fy * 16 + 10 + (ty - fy) * 8, PUFF_MS * 1.2);
        // Stones tumble down onto the lower tile in small hops, dust trailing behind.
        for (let k = 0; k < SLIDE_STONES; k++) {
          const speed = 14 + Math.random() * 12;
          s.particles.spawn(fx * 16 + 8 + (Math.random() - 0.5) * 10, fy * 16 + 8 + (Math.random() - 0.5) * 6,
            dx * speed + (Math.random() - 0.5) * 6, (ty - fy) * speed - 10 - Math.random() * 6, 0.6 + Math.random() * 0.35, 44, STONES);
        }
        specks(s, fx * 16 + 8 + dx * 4, fy * 16 + 10 + (ty - fy) * 4, 3, 12, DUST_ON_BRIGHT);
      }
      if (!fresh && !hz.hazard(id)) quakes.delete(id);
    }
  }

  /** Damaged cities lie in rubble at their foot; it puffs dust on its own beat. */
  function rubble(s: FxScene, world: WorldState): void {
    const hz = world.hazards;
    for (let y = s.y0; y <= s.y1; y++) {
      for (let xx = s.x0; xx <= s.x1; xx++) {
        const i = y * GRID_W + wrapX(xx);
        if (hz.tile[i] !== HazardTile.Rubble) continue;
        const fx = xx * 16 + 8;
        const fy = y * 16 + 15;
        const beat = RUBBLE_BEAT_MS * (1 + hazardRoll(world.seed, i, 21));
        const phase = (s.now + hazardRoll(world.seed, i, 22) * beat) % beat;
        const puffing = phase < RUBBLE_PUFF_MS;
        s.add({ id: 'rubble', frame: puffing ? 1 : 0, x: fx, y: fy, foot: fy });
        if (puffing) s.add({ id: 'dust_puff', frame: Math.floor((phase / RUBBLE_PUFF_MS) * 5), x: fx + 1, y: fy - 10 - phase * 0.008, foot: fy });
      }
    }
  }

  FX_SCRIPTS[EventKind.Earthquake] = {
    omen(s: FxScene, x: number, y: number, t: number): void {
      s.shake(x, y, 0, 1);
      const n = Math.floor(t / OMEN_SPECK_MS) - Math.floor((t - s.dt * 1000) / OMEN_SPECK_MS);
      if (n > 0) specks(s, x * 16 + 8, y * 16 + 12, 2 * n, 24, seen && seen.elevation[idx(x, y)] < 0 ? FOAM : DUST);
    },

    main(s: FxScene, st: FxStarted, t: number, world: WorldState): void {
      let p = playing.get(st.id);
      if (p?.st !== st) {
        p = { st, quake: null, tones: waveTones(world, st.x, st.y) };
        playing.set(st.id, p);
      }
      if (s.once(`${st.id}:rumble`)) playSfx('cracking-earthquake');
      if (t < TREMOR_OUTER_MS) s.shake(st.x, st.y, TREMOR_RADIUS, 1);
      if (t < TREMOR_MS) s.shake(st.x, st.y, TREMOR_CORE, 2);
      else if (t < SETTLE_MS) s.shake(st.x, st.y, TREMOR_CORE, 1);
      const tones = p.tones;
      const cx = st.x * 16 + 8;
      const cy = st.y * 16 + 8;
      for (let k = 0; k < WAVES; k++) {
        const w = (t - WAVE_FIRST_MS - k * WAVE_GAP_MS) / WAVE_MS;
        if (w < 0 || w >= 1) continue;
        const r = Math.round(2 + (WAVE_REACH - 2) * (1 - (1 - w) * (1 - w)));
        if (w > WAVE_FAINT_FROM) {
          s.ring(cx, cy, r, tones.faintLight, tones.faintDark, true, WAVE_DASH);
          continue;
        }
        // A ridge two pixels wide: the slope facing the light is lit, the other in shade — on the upper left the outer
        // ring, on the lower right the inner one. Each dash shows a light and a dark pixel, so it reads on any ground.
        s.ring(cx, cy, r, tones.dark, tones.light, true, WAVE_DASH);
        s.ring(cx, cy, r + 1, tones.light, tones.dark, true, (WAVE_DASH * (r + 1)) / r);
      }
    },

    reset(): void {
      playing.clear();
      quakes.clear();
    },

    live(s: FxScene, world: WorldState): void {
      seen = world;
      slides(s, world);
      for (const [id, p] of playing) {
        const t = s.now - p.st.born;
        if (t > HAZARD_MAIN_MS[EventKind.Earthquake]) { playing.delete(id); continue; }
        p.quake ??= world.hazards.hazard(id)?.quake ?? quakes.get(id) ?? null;
        if (p.quake && s.sees(p.st.x, p.st.y)) shock(s, world, p.st, p.quake, t, p.tones);
      }
      rubble(s, world);
    },
  };
}
