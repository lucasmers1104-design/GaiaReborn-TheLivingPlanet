/* =============================================================================
 * SimEarth 2.0 — the wildfire on screen
 * -----------------------------------------------------------------------------
 * docs/ereignisse-spec.md §3.3:
 *   omen   (0.8 s) a thin thread of smoke rises and wavers, single sparks;
 *                  late in the omen the ground starts to glow
 *   main   (2 s)   the glow catches: a small flame grows, a straight column
 *                  of smoke rises over it; then it flares up through medium
 *                  to large in a burst of sparks and the wind takes the smoke
 *   spread         every burning tile carries a flame sized by its fuel and
 *                  how long it has burnt (fireFlameSize), a second smaller
 *                  one up to FIRE_FLAMES_ONE burning tiles, glowing embers
 *                  below (fxground.ts); up to PLUMES_PER_FIRE of them send up
 *                  a smoke plume drawn leaning with the wind (firePlumeSprite)
 *   after          freshly burnt ground smoulders: wisps of smoke and embers
 *                  glinting in the ash, fewer every tick; burnt earth and
 *                  charred trunks are scars (fxground, fxscars)
 * Nothing here shakes or flashes, so "Effekte reduzieren" changes nothing.
 * ========================================================================== */

namespace SE {
  /** The flame sprites, smallest first; fireFlameSize indexes them. */
  export const FLAME_SPRITES: readonly string[] = ['flame_small', 'flame_medium', 'flame_large'];
  /** Fuel from which a tile's flames reach medium and large height. */
  const FLAME_MEDIUM_FUEL = 0.3;
  const FLAME_LARGE_FUEL = 0.6;

  /**
   * The flame size (index into FLAME_SPRITES) of a tile with `fuel` that has
   * `level` burning ticks left: its fuel sets how high it can burn; in the
   * tick it catches it is one size smaller, in its last tick it dies down.
   */
  export function fireFlameSize(fuel: number, level: number): number {
    const peak = fuel >= FLAME_LARGE_FUEL ? 2 : fuel >= FLAME_MEDIUM_FUEL ? 1 : 0;
    if (level <= 1) return 0;
    if (level >= fireBurnTicks(fuel)) return Math.max(0, peak - 1);
    return peak;
  }

  /** The plume over a fire in row y: leaning downwind, upright where no wind blows. */
  export function firePlumeSprite(y: number): string {
    const dx = ClimateSystem.airCurrent(y).dx;
    return dx > 0 ? 'smoke_plume_east' : dx < 0 ? 'smoke_plume_west' : 'smoke_plume';
  }

  /** Column of the leaning plume's foot, and how far downwind its top lies (tools/fx/fire.js LEAN_FOOT, LEAN). */
  const LEAN_FOOT = 5;
  const LEAN = 11;
  /** Burning tiles of one fire beyond which each tile shows a single flame (spec §5). */
  const FIRE_FLAMES_ONE = 40;
  const PLUMES_PER_FIRE = 12;
  /** Flames step at 10 fps, plumes at 8 fps (tools/fx/catalog.js). */
  const FLAME_MS = 100;
  const PLUME_MS = 125;

  /** Omen: a thread puff leaves the ground every THREAD_EVERY ms and lives THREAD_MS, rising THREAD_RISE px/ms. */
  const THREAD_EVERY = 150;
  const THREAD_MS = 900;
  const THREAD_RISE = 0.026;
  /** Thread puffs stay at the smallest smoke_puff frames, then dissolve (frame 3). */
  const THREAD_FRAMES: readonly number[] = [0, 0, 0, 0, 1, 1, 3];
  /** Share of the omen after which the ground under the thread glows. */
  const OMEN_GLOW = 0.55;
  /** Rows of the small flame's foot that show as the glow. */
  const GLOW_ROWS = 2;

  /** Main: the small flame grows over GROW_MS; the flare-up starts at FLARE_MS and passes medium for FLARE_STEP_MS. */
  const GROW_MS = 500;
  const FLARE_MS = 1000;
  const FLARE_STEP_MS = 160;
  const FLARE_GROW_MS = 260;
  /** The straight column over the young fire rises from COLUMN_MS until the flare, when the wind takes it. */
  const COLUMN_MS = 250;
  /** Sparks thrown up at the flare-up. */
  const FLARE_SPARKS = 18;

  /** A puff breaking off a plume: art pixels per second it drifts with the wind, and its life. */
  const PUFF_DRIFT = 7;
  const PUFF_MS = 800;
  /** Art pixels per ms a smoke puff rises. */
  const PUFF_RISE = 0.016;
  /** Sparks per second per burning tile in view, and at most per fire. */
  const SPARKS_PER_TILE = 1.5;
  const SPARKS_MAX = 24;
  /** Ticks freshly burnt ground keeps smouldering; embers glinting per second on such a tile, and at most in view. */
  const SMOULDER_TICKS = 3;
  /** A smouldering tile sends up a wisp every SMOULDER_MS, SMOULDER_COOL_MS later for every tick it has cooled. */
  const SMOULDER_MS = 850;
  const SMOULDER_COOL_MS = 350;
  const GLINTS_PER_TILE = 0.7;
  const GLINTS_MAX = 30;

  /** Sparks cool from white to dark red as they rise. */
  const SPARK: readonly string[] = [fxColor('white', 0), fxColor('yellow', 0), fxColor('orange', 0), fxColor('red', 1)];
  /** Embers in the ash flare up and go dark. */
  const GLINT: readonly string[] = [fxColor('orange', 0), fxColor('yellow', 0), fxColor('orange', 0), fxColor('red', 1), fxColor('red', 0)];

  /** The tiles that send up plumes, by the burning list they were picked from (a fire makes a new list every tick). */
  const plumeTiles = new WeakMap<readonly number[], number[]>();

  /** The same tiles keep their plumes while they burn: the lowest hashes of the fire. */
  function plumesOf(h: Hazard, burning: readonly number[]): number[] {
    let out = plumeTiles.get(burning);
    if (!out) {
      out = burning.slice().sort((a, b) => hazardRoll(a, h.id, 0xf3) - hazardRoll(b, h.id, 0xf3)).slice(0, PLUMES_PER_FIRE);
      plumeTiles.set(burning, out);
    }
    return out;
  }

  /** Hazards whose main animation drew the origin's flame this frame, and whether the origin has burnt out. */
  const mains = new Map<number, { seen: number; out: boolean }>();

  /** Where flame k of tile (x, y) stands: the world art pixel of its foot. */
  function flameAt(x: number, y: number, k: number): [number, number] {
    const i = y * GRID_W + x;
    if (k === 0) return [x * 16 + 5 + Math.floor(hazardRoll(i, 1, 0xf1) * 6), y * 16 + 11 + Math.floor(hazardRoll(i, 2, 0xf1) * 5)];
    return [x * 16 + 2 + Math.floor(hazardRoll(i, 3, 0xf1) * 12), y * 16 + 5 + Math.floor(hazardRoll(i, 4, 0xf1) * 4)];
  }

  /** The frame of a looping sprite at `ms` per frame, each tile and flame on its own phase. */
  function loopFrame(s: FxScene, id: string, ms: number, i: number, k: number): number {
    const n = FX_MANIFEST.sprites[id]?.frames.length ?? 1;
    return (Math.floor(s.now / ms) + Math.floor(hazardRoll(i, k, 0xf2) * n)) % n;
  }

  function flame(s: FxScene, size: number, i: number, k: number, x: number, y: number, rows: readonly [number, number] | null = null): void {
    const id = FLAME_SPRITES[size];
    s.add({ id, frame: loopFrame(s, id, FLAME_MS, i, k), x, y, foot: y, rows });
  }

  function puff(s: FxScene, x: number, y: number, age: number, frames: number): void {
    if (age < 0 || age >= PUFF_MS) return;
    s.add({ id: 'smoke_puff', frame: Math.floor((age / PUFF_MS) * frames), x, y: y - age * PUFF_RISE, foot: y });
  }

  /** Particles expected over this frame at `perSecond`, rounded at random. */
  function sparkCount(s: FxScene, perSecond: number): number {
    const n = perSecond * s.dt;
    return Math.floor(n) + (Math.random() < n - Math.floor(n) ? 1 : 0);
  }

  function spark(s: FxScene, x: number, y: number, drift: number, lift = 1): void {
    s.particles.spawn(x, y, drift + (Math.random() - 0.5) * 14, (-16 - Math.random() * 22) * lift, 0.5 + Math.random() * 0.6, 14, SPARK);
  }

  /**
   * The plume `id` standing on world art pixel (x, y); `rows` clips it to the
   * part that has risen so far. A leaning plume stands on its foot column.
   */
  function plumeSprite(s: FxScene, id: string, x: number, y: number, i: number, rows: readonly [number, number] | null = null): void {
    const sp = FX_MANIFEST.sprites[id];
    if (!sp) return;
    const sx = id === 'smoke_plume_east' ? LEAN_FOOT : id === 'smoke_plume_west' ? sp.w - 1 - LEAN_FOOT : sp.ax;
    s.add({ id, frame: loopFrame(s, id, PLUME_MS, i, 6), x, y, foot: y, rows, sx });
  }

  /** A smoke plume over tile (x, y), leaning with the wind; now and then a puff breaks off its top and drifts away. */
  function plume(s: FxScene, x: number, y: number, i: number, dx: number): void {
    const id = firePlumeSprite(y);
    const sp = FX_MANIFEST.sprites[id];
    if (!sp) return;
    const fx = x * 16 + 6 + Math.floor(hazardRoll(i, 5, 0xf1) * 5);
    const fy = y * 16 + 4;
    plumeSprite(s, id, fx, fy, i);
    const period = 1100 + hazardRoll(i, 7, 0xf1) * 600;
    const age = (s.now + hazardRoll(i, 8, 0xf1) * period) % period;
    if (age < PUFF_MS) {
      const top = id === 'smoke_plume' ? 0 : LEAN * Math.sign(dx);
      puff(s, fx + top + dx * (age / 1000) * PUFF_DRIFT, fy - sp.h + 3, age, 4);
    }
  }

  FX_SCRIPTS[EventKind.Fire] = {
    omen(s: FxScene, x: number, y: number, t: number): void {
      const fx = x * 16 + 8;
      const fy = y * 16 + 12;
      const dx = ClimateSystem.airCurrent(y).dx;
      // A thin thread: puffs leave the ground one after another, rise, waver more the higher they get and drift off.
      for (let n = Math.floor(t / THREAD_EVERY); n >= 0; n--) {
        const age = t - n * THREAD_EVERY;
        if (age >= THREAD_MS) break;
        const sway = Math.sin(age * 0.007 + n * 0.9) * Math.min(1, age / 300) * 1.5;
        const px = fx + sway + dx * age * 0.004;
        s.add({ id: 'smoke_puff', frame: THREAD_FRAMES[Math.floor((age / THREAD_MS) * THREAD_FRAMES.length)], x: px, y: fy - age * THREAD_RISE, foot: fy });
      }
      const i = y * GRID_W + x;
      const [gx, gy] = flameAt(x, y, 0);
      // The ground starts to glow where the main animation's flame will grow.
      if (t > HAZARD_OMEN_MS[EventKind.Fire] * OMEN_GLOW) {
        const h = FX_MANIFEST.sprites.flame_small?.h ?? 0;
        flame(s, 0, i, 0, gx, gy, [h - GLOW_ROWS, h]);
      }
      const n = sparkCount(s, 4);
      for (let k = 0; k < n; k++) spark(s, gx + (Math.random() - 0.5) * 6, gy - 1, dx * 4, 0.7);
    },

    main(s: FxScene, st: FxStarted, t: number, world: WorldState): void {
      // A natural fire is lightning's (hazardlightning.ts): the bolt comes down where the flame grows.
      if (world.hazards.hazard(st.id)?.cause === 'natural' && s.once(`${st.id}:lightning`)) {
        const [bx, by] = flameAt(st.x, st.y, 0);
        fxLightningBolt(s, bx, by);
      }
      const m = mains.get(st.id) ?? { seen: 0, out: false };
      m.seen = s.now;
      mains.set(st.id, m);
      if (m.out) return;
      const i = st.y * GRID_W + st.x;
      const [fx, fy] = flameAt(st.x, st.y, 0);
      const small = FX_MANIFEST.sprites.flame_small;
      if (!small) return;
      const h = small.h;
      const drift = ClimateSystem.airCurrent(st.y).dx * 8;
      if (t < FLARE_MS) {
        // The glow of the omen catches and grows into the small flame.
        const grown = Math.min(h, GLOW_ROWS + Math.ceil(((h - GLOW_ROWS) * t) / GROW_MS));
        flame(s, 0, i, 0, fx, fy, [h - grown, h]);
      } else if (t < FLARE_MS + FLARE_STEP_MS) {
        flame(s, 1, i, 0, fx, fy);
      } else {
        // The large flame shoots up out of the medium one.
        const grown = Math.min(h, Math.ceil(h * (0.65 + (0.35 * (t - FLARE_MS - FLARE_STEP_MS)) / FLARE_GROW_MS)));
        flame(s, 2, i, 0, fx, fy, [h - grown, h]);
      }
      // A straight column of smoke stands over the young fire; at the flare-up the wind takes it.
      const px = st.x * 16 + 6 + Math.floor(hazardRoll(i, 5, 0xf1) * 5);
      const py = st.y * 16 + 4;
      const id = t < FLARE_MS ? 'smoke_plume' : firePlumeSprite(st.y);
      const sp = FX_MANIFEST.sprites[id];
      if (sp && t > COLUMN_MS) {
        const risen = Math.min(sp.h, Math.ceil((sp.h * (t - COLUMN_MS)) / (HAZARD_MAIN_MS[EventKind.Fire] - COLUMN_MS)) + 4);
        plumeSprite(s, id, px, py, i, [sp.h - risen, sp.h]);
      }
      if (t >= FLARE_MS && s.once(`fire-flare-${st.id}`)) {
        for (let k = 0; k < FLARE_SPARKS; k++) spark(s, fx + (Math.random() - 0.5) * 8, fy - 4 - Math.random() * 10, drift, 1.6);
      }
      if (t > 300) {
        const n = sparkCount(s, t < FLARE_MS ? 8 : 20);
        for (let k = 0; k < n; k++) spark(s, fx + (Math.random() - 0.5) * 10, fy - 6 - Math.random() * 8, drift);
      }
    },

    reset(): void {
      mains.clear();
      fireSoundReset();
    },

    live(s: FxScene, world: WorldState): void {
      const hz = world.hazards;
      const heard = new Map<number, boolean>();
      for (const [id, m] of mains) {
        if (s.now - m.seen > 1000) { mains.delete(id); continue; }
        const h = hz.hazard(id);
        m.out = !h || !h.fire || hz.tile[idx(h.x, h.y)] !== HazardTile.Burning;
      }
      for (const h of hz.list) {
        const fire = h.fire;
        if (!fire || fire.burning.length === 0) continue;
        const main = mains.get(h.id);
        // While the main animation plays, the origin's flame and smoke are its own.
        const origin = main && main.seen === s.now && !main.out ? idx(h.x, h.y) : -1;
        const single = fire.burning.length > FIRE_FLAMES_ONE;
        const wind = ClimateSystem.airCurrent(h.y);
        const seen: number[] = [];
        heard.set(h.id, false);
        for (const i of fire.burning) {
          if (hz.tile[i] !== HazardTile.Burning) continue;
          const x = i % GRID_W;
          const y = (i / GRID_W) | 0;
          if (!s.sees(x, y)) continue;
          seen.push(i);
          heard.set(h.id, true);
          if (i === origin) continue;
          const size = fireFlameSize(fireFuel(world, i), hz.level[i]);
          if (!single && hz.level[i] >= 2 && hazardRoll(i, 9, 0xf1) < 0.65) {
            const [bx, by] = flameAt(x, y, 1);
            flame(s, Math.max(0, size - 1), i, 1, bx, by);
          }
          const [fx, fy] = flameAt(x, y, 0);
          flame(s, size, i, 0, fx, fy);
        }
        for (const i of plumesOf(h, fire.burning)) {
          const x = i % GRID_W;
          const y = (i / GRID_W) | 0;
          if (i !== origin && hz.tile[i] === HazardTile.Burning && s.sees(x, y)) plume(s, x, y, i, wind.dx);
        }
        const n = sparkCount(s, Math.min(SPARKS_MAX, seen.length * SPARKS_PER_TILE));
        for (let k = 0; k < n && seen.length > 0; k++) {
          const i = seen[Math.floor(Math.random() * seen.length)];
          spark(s, (i % GRID_W) * 16 + 3 + Math.random() * 10, ((i / GRID_W) | 0) * 16 + 2 + Math.random() * 6, wind.dx * 8);
        }
      }
      fireSoundUpdate(s, heard);
      smoulder(s, world);
    },
  };

  /** Freshly burnt ground smoulders: wisps of smoke drift off it, embers glint in the ash, both dying down tick by tick. */
  function smoulder(s: FxScene, world: WorldState): void {
    const hz = world.hazards;
    const hot: number[] = [];
    for (let y = s.y0; y <= s.y1; y++) {
      const dx = ClimateSystem.airCurrent(y).dx;
      for (let xx = s.x0; xx <= s.x1; xx++) {
        const i = y * GRID_W + wrapX(xx);
        if (hz.scar[i] !== ScarKind.Burnt || hz.scarAge[i] >= SMOULDER_TICKS || hz.tile[i] !== HazardTile.None) continue;
        hot.push(xx, y);
        // The wisps come further apart as the ground cools.
        const period = SMOULDER_MS + hz.scarAge[i] * SMOULDER_COOL_MS;
        const age = (s.now + hazardRoll(world.seed, i, 0xf4) * period) % period;
        if (age < PUFF_MS) puff(s, xx * 16 + 3 + Math.floor(hazardRoll(i, 10, 0xf1) * 10) + dx * age * 0.005, y * 16 + 10, age, 4);
      }
    }
    const tiles = hot.length / 2;
    const n = sparkCount(s, Math.min(GLINTS_MAX, tiles * GLINTS_PER_TILE));
    for (let k = 0; k < n; k++) {
      const p = Math.floor(Math.random() * tiles) * 2;
      s.particles.spawn(hot[p] * 16 + 2 + Math.random() * 12, hot[p + 1] * 16 + 4 + Math.random() * 11,
        (Math.random() - 0.5) * 2, -2 - Math.random() * 3, 0.5 + Math.random() * 0.5, 0, GLINT);
    }
  }
}
