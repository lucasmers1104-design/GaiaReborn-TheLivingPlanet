/* =============================================================================
 * SimEarth 2.0 — tidal wave and hurricane on screen
 * -----------------------------------------------------------------------------
 * docs/ereignisse-spec.md §3.4, §3.5:
 *   tidal wave  omen: the sea draws back round the tile, foam left behind;
 *               it fades as the wave sets out, the water heaping up where
 *               it leaves. A wave set off by a quake starts as a dome of
 *               water lifting, one from a meteor as a crater in the sea.
 *               The travelling wave itself is the sea surface (fxseawave.ts),
 *               its coast the shore (fxshore.ts); flood water is ground
 *               (fxground.ts), the driftwood in the mud a scar object.
 *   hurricane   omen: a small spiral gathers, the first rain falls; then the
 *               spiral cloud with its eye turns over the eye's tile for as
 *               long as the storm moves, gliding between its tick positions
 *               in real time, rain streaks under it; its tornadoes glide
 *               inland with dust whirling round their feet. Wet ground and
 *               fallen trees are ground and scar objects again.
 * ========================================================================== */

namespace SE {
  const RAIN: readonly string[] = [fxColor('ice', 4), fxColor('ice', 3), fxColor('ice', 2)];
  /** Below this strength a storm shows as the small spiral. */
  const STORM_BIG = 1.5;
  /** Art pixels round the eye where rain falls, reaching past the cloud's edge, and streaks a second per strength. */
  const RAIN_RADIUS = 26;
  const RAIN_RATE = 30;
  const SPENT_MS = 800;
  const DUST: readonly string[] = [fxColor('sand', 1), fxColor('soil', 2), fxColor('soil', 1)];

  /** How many of something that happens `rate` times a second fall into this frame. */
  function due(rate: number, dt: number): number {
    const n = rate * dt;
    return Math.floor(n) + (Math.random() < n - Math.floor(n) ? 1 : 0);
  }

  function frameOf(id: string, now: number): number {
    const sp = FX_MANIFEST.sprites[id];
    return sp ? Math.floor(now / (1000 / Math.max(1, sp.fps))) % sp.loop : 0;
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

  /** Art px radius of the drawdown round a tidal wave's origin, its omen `p` of the way. */
  function drawRadius(p: number): number {
    return 4 + 12 * (1 - (1 - p) * (1 - p));
  }

  /** Each tidal wave's start: the wave time it was first seen at and the mark it starts from. */
  const starts = new Map<number, { readonly t0: number; readonly kind: SeaMark['kind'] }>();

  /** The player's wave draws the sea back; a chained one rises from its quake, or from its meteor's crater. */
  function startOf(world: WorldState, h: Hazard): SeaMark['kind'] {
    if (h.cause !== 'chain') return 'draw';
    return world.hazards.list.some((o) => o.kind === EventKind.Meteor && o.x === h.x && o.y === h.y) ? 'cavity' : 'dome';
  }

  FX_SCRIPTS[EventKind.TidalWave] = {
    reset(): void {
      starts.clear();
    },

    omen(s: FxScene, x: number, y: number, t: number): void {
      let p = t / HAZARD_OMEN_MS[EventKind.TidalWave];
      if (s.reduce) p = Math.ceil(p * 3) / 3;
      s.seaMarks.push({ x: x * 16 + 8, y: y * 16 + 8, r: drawRadius(p), k: 1, kind: 'draw', p });
    },

    // The start lives on the wave's own clock (live), so a chained wave gets it too.
    main(): void {},

    live(s: FxScene, world: WorldState): void {
      for (const id of [...starts.keys()]) if (!world.hazards.hazard(id)) starts.delete(id);
      for (const h of world.hazards.list) {
        if (!h.wave) continue;
        const T = h.age - 1 + s.phase;
        let st = starts.get(h.id);
        if (!st) starts.set(h.id, st = { t0: T, kind: startOf(world, h) });
        if (T >= 0.4 || !s.sees(h.x, h.y)) continue;
        // The start mark holds, then dissolves over what is left of the first tick, as the wave sets out.
        const k = T < 0 ? clamp(T / Math.min(-0.05, st.t0), 0, 1) : 0;
        const x = h.x * 16 + 8;
        const y = h.y * 16 + 8;
        if (st.kind === 'draw') {
          if (k > 0) s.seaMarks.push({ x, y, r: drawRadius(1), k, kind: 'draw', p: 1 });
          if (T >= 0) s.seaMarks.push({ x, y, r: 4, k: 1 - T / 0.4, kind: 'dome', p: 1 });
        } else if (k > 0) {
          s.seaMarks.push({ x, y, r: st.kind === 'dome' ? 6 + 2 * (h.strength ?? 1) : 10, k, kind: st.kind, p: 1 });
        }
      }
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
      const phase = s.phase;
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
