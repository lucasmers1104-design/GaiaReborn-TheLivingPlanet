/* =============================================================================
 * SimEarth 2.0 — tidal wave on screen
 * -----------------------------------------------------------------------------
 * docs/ereignisse-spec.md §3.5: omen: the sea draws back round the tile, foam
 * left behind; it fades as the wave sets out, the water heaping up where it
 * leaves. A wave set off by a quake starts as a dome of water lifting, one
 * from a meteor as a crater in the sea. The travelling wave itself is the sea
 * surface (fxseawave.ts), its coast the shore (fxshore.ts); flood water is
 * ground (fxground.ts), the driftwood in the mud a scar object. The hurricane
 * is fxstorm.ts.
 * ========================================================================== */

namespace SE {
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
}
