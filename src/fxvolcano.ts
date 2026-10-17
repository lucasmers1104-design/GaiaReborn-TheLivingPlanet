/* =============================================================================
 * SimEarth 2.0 — the eruption on screen
 * -----------------------------------------------------------------------------
 * docs/ereignisse-spec.md §3.1, the reference for every other disaster:
 *   omen   (1 s)  smoke puffs rise from the tile, the ground trembles
 *   main   (3 s)  the column grows out of the crater, a lava fountain
 *                 throws embers and lava splashes, ash clouds break away
 *                 and drift with the wind; at the end the column lifts
 *                 off its vent
 *   spread        the flow itself is ground (fxground.ts); steam where it
 *                 meets the sea
 *   after         the cone is landscape relief (landridgedraw.ts); while
 *                 lava sits in its crater the crater glows and throws
 *                 embers; vents and hot cones smoke now and then
 *   active        an active volcano (Kīlauea, Etna) always has lava in its
 *                 crater and trails a thin plume
 * ========================================================================== */

namespace SE {
  const PUFF_MS = 900;
  /** Art pixels per ms a smoke puff rises. */
  const PUFF_RISE = 0.014;
  const GROW_MS = 350;
  const LIFT_MS = 450;
  const ASH_LIFE_MS = 7000;
  /** Art pixels per second the ash drifts with the wind. */
  const ASH_DRIFT = 4.5;
  const EMBER_EVERY_MS = 60;
  /** A lava splash flies from the mouth this often while the fountain plays, cooling as it goes. */
  const SPLASH_EVERY_MS = 220;
  const SPLASH_MS = 700;
  const STEAM_MS = 1100;
  /** Magma under a landscape cone from which it smokes now and then. */
  const SMOKE_MAGMA = 0.6;
  /** An erupting crater throws an ember this often, an active volcano's lava lake now and then. */
  const CRATER_EMBER_MS = 140;
  const LAKE_EMBER_MS = 1100;
  /** An active volcano's plume: a small puff leaves the crater this often, drifting this many art pixels per second with the wind. */
  const WISP_MS = 450;
  const WISP_DRIFT = 5;

  /** World art pixel of a tile's foot (bottom centre) and of its vent's crater. */
  function foot(x: number, y: number): [number, number] {
    return [x * 16 + 8, y * 16 + 15];
  }
  type MouthFn = (field: TerrainField, x: number, y: number) => [number, number] | null;
  /** The crater of the cone the landscape draws on tile (x, y), x unwrapped; the tile's centre without one. */
  function mouth(x: number, y: number): [number, number] {
    const wx = wrapX(x);
    // ponytail: looked up by name so this builds before landridges.ts exports volcanoMouth; call it directly once it does.
    const find = (SE as unknown as { volcanoMouth?: MouthFn }).volcanoMouth;
    const m = find?.(PixelTerrain.shared().field, wx, y);
    return m ? [m[0] + (x - wx) * 16, m[1]] : [x * 16 + 8, y * 16 + 8];
  }

  function puff(s: FxScene, x: number, y: number, age: number, footY: number): void {
    if (age < 0 || age >= PUFF_MS) return;
    s.add({ id: 'smoke_puff', frame: Math.floor((age / PUFF_MS) * 4), x, y: y - age * PUFF_RISE, foot: footY });
  }

  function ash(s: FxScene, st: FxStarted, x: number, y: number, key: string): void {
    if (!s.once(`${st.id}:${key}`)) return;
    const wind = ClimateSystem.airCurrent(st.y);
    s.spawn({ id: 'ash_cloud', x, y, vx: wind.dx * ASH_DRIFT, vy: wind.dy * ASH_DRIFT * 0.35 - 1.2, life: ASH_LIFE_MS, mode: 'loop' });
  }

  FX_SCRIPTS[EventKind.Volcano] = {
    omen(s: FxScene, x: number, y: number, t: number): void {
      const [fx, fy] = foot(x, y);
      for (let k = 0; k < 3; k++) puff(s, fx + [-2, 3, 0][k], fy - 6, t - k * 300, fy);
      s.shake(x, y, 1, 1);
    },

    main(s: FxScene, st: FxStarted, t: number): void {
      const [mx, my] = mouth(st.x, st.y);
      const footY = st.y * 16 + 15;
      const col = FX_MANIFEST.sprites.volcano_column;
      if (!col) return;
      if (s.once(`${st.id}:boom`)) playSfx('vulkan-explosion');
      const end = HAZARD_MAIN_MS[EventKind.Volcano];
      const grown = Math.min(col.h, Math.ceil((col.h * t) / GROW_MS));
      const lifted = t > end - LIFT_MS ? Math.ceil((col.h * (t - (end - LIFT_MS))) / LIFT_MS) : 0;
      s.add({
        id: 'volcano_column', frame: Math.floor(t / 100) % col.frames.length, x: mx, y: my, foot: footY, z: 1,
        rows: [col.h - grown, col.h - lifted],
      });
      if (t > 1400) ash(s, st, mx + 4, my - col.h + 8, 'ash1');
      if (t > end - LIFT_MS) ash(s, st, mx, my - col.h + 14, 'ash2');
      if (t < 700) s.shake(st.x, st.y, 1, 1);
      if (t > GROW_MS && t < end - LIFT_MS) {
        const n = Math.floor(t / EMBER_EVERY_MS) - Math.floor((t - s.dt * 1000) / EMBER_EVERY_MS);
        for (let k = 0; k < n; k++) {
          s.particles.spawn(
            mx + (Math.random() - 0.5) * 4, my - 6 - Math.random() * 10,
            (Math.random() - 0.5) * 56, -35 - Math.random() * 40, 0.8 + Math.random() * 0.6, 80, FX_EMBER,
          );
        }
        const splashes = Math.floor(t / SPLASH_EVERY_MS) - Math.floor((t - s.dt * 1000) / SPLASH_EVERY_MS);
        for (let k = 0; k < splashes; k++) {
          const side = Math.random() < 0.5 ? -1 : 1;
          s.spawn({ id: 'lava_splash', x: mx + side * 2, y: my - 4, vx: side * (10 + Math.random() * 14), vy: 6 + Math.random() * 6, life: SPLASH_MS, mode: 'once' });
        }
      }
    },

    live(s: FxScene, world: WorldState): void {
      const hz = world.hazards;
      const field = PixelTerrain.shared().field;
      for (let y = s.y0; y <= s.y1; y++) {
        for (let xx = s.x0; xx <= s.x1; xx++) {
          const x = wrapX(xx);
          const i = y * GRID_W + x;
          const vent = hz.scar[i] === ScarKind.Vent;
          const active = world.upliftKind[i] === UpliftKind.ActiveVolcano && field.volcano[i] > 0;
          if (!vent && !active && (field.volcano[i] === 0 || world.magma[i] < SMOKE_MAGMA)) continue;
          const fy = foot(xx, y)[1];
          const [mx, my] = mouth(xx, y);
          // An erupting volcano, and an active one always: lava glows in its crater and throws embers.
          const erupting = vent && hz.tile[i] === HazardTile.Lava;
          if (erupting || active) {
            const glow = FX_MANIFEST.sprites.crater_glow;
            const frame = glow && !s.reduce ? Math.floor(s.now / (1000 / glow.fps)) % glow.frames.length : 0;
            s.add({ id: 'crater_glow', frame, x: mx, y: my, foot: fy, z: 0 });
            const every = erupting ? CRATER_EMBER_MS : LAKE_EMBER_MS;
            const t = s.now + hazardRoll(world.seed, i, 11) * every;
            const n = s.reduce ? 0 : Math.floor(t / every) - Math.floor((t - s.dt * 1000) / every);
            for (let k = 0; k < n; k++) {
              s.particles.spawn(mx + (Math.random() - 0.5) * 6, my - 1, (Math.random() - 0.5) * 24, -20 - Math.random() * 20, 0.6 + Math.random() * 0.5, 60, FX_EMBER);
            }
          }
          // An active volcano trails a thin plume of puffs, bent by the wind.
          if (active && !s.reduce) {
            const wind = ClimateSystem.airCurrent(y).dx * WISP_DRIFT / 1000;
            const start = hazardRoll(world.seed, i, 9) * WISP_MS;
            for (let age = (s.now + start) % WISP_MS; age < PUFF_MS; age += WISP_MS) puff(s, mx + 1 + age * wind, my - 2, age, fy);
            continue;
          }
          // Vents and hot cones smoke now and then, each on its own beat.
          const period = 20000 + hazardRoll(world.seed, i, 7) * 20000;
          const phase = (s.now + hazardRoll(world.seed, i, 9) * period) % period;
          puff(s, mx + 1, my - 2, phase, fy);
        }
      }
      for (const h of hz.list) {
        for (const st of h.lava?.steam ?? []) {
          if (world.ticks - st.tick > 2 || !s.once(`${h.id}:steam:${st.tile}:${st.tick}`)) continue;
          const x = st.tile % GRID_W;
          const y = (st.tile / GRID_W) | 0;
          s.spawn({ id: 'steam_puff', x: x * 16 + 8, y: y * 16 + 6, vx: 0, vy: -7, life: STEAM_MS, mode: 'once' });
          s.spawn({ id: 'steam_puff', x: x * 16 + 3, y: y * 16 + 10, vx: -2, vy: -5, life: STEAM_MS * 0.8, mode: 'once' });
        }
      }
    },
  };
}
