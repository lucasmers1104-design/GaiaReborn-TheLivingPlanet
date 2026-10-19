/* =============================================================================
 * SimEarth 2.0 — chain reactions: one disaster setting off another
 * -----------------------------------------------------------------------------
 * docs/ereignisse-spec.md §3.9. A quake under the sea and a meteor into it
 * raise a tidal wave (K4); lava, a meteor's blast or a hurricane's lightning
 * beside or on dry plants sets them on fire. HazardSystem asks after the start and after every tick; each
 * hazard sets off at most one other (chainUsed), and a chained one none.
 * ========================================================================== */

namespace SE {
  /** The hazard that `h` sets off now, and its strength (1 for a full one), or null. */
  export type HazardChainRule = (world: WorldState, h: Hazard) => { kind: EventKind; x: number; y: number; strength?: number } | null;

  /** Indexed by EventKind. */
  export const HAZARD_CHAINS: (HazardChainRule | undefined)[] = [];

  /** Dry plant cover a fire could start in. */
  function dryFuel(world: WorldState, i: number): boolean {
    return world.elevation[i] >= 0 && world.vegetation[i] >= CHAIN_FIRE_COVER && world.moisture[i] < CHAIN_FIRE_MOISTURE &&
      HAZARD_RULES[EventKind.Fire]?.refuse(world, i % GRID_W, (i / GRID_W) | 0) === '';
  }

  /** A fire on one of `tiles`, the one with the lowest hash, so the choice is stable. */
  function fireAmong(world: WorldState, h: Hazard, tiles: Iterable<number>): { kind: EventKind; x: number; y: number } | null {
    let best = -1;
    let bestRoll = 2;
    for (const i of tiles) {
      if (!dryFuel(world, i)) continue;
      const roll = hazardRoll(world.seed ^ h.id, i, 0xc4a1);
      if (roll < bestRoll) { bestRoll = roll; best = i; }
    }
    return best < 0 ? null : { kind: EventKind.Fire, x: best % GRID_W, y: (best / GRID_W) | 0 };
  }

  /** Tiles at Chebyshev distance `from`..`to` of (x, y). */
  function ringTiles(x: number, y: number, from: number, to: number): number[] {
    const out: number[] = [];
    for (let dy = -to; dy <= to; dy++) {
      const ty = y + dy;
      if (ty < 0 || ty >= GRID_H) continue;
      for (let dx = -to; dx <= to; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) >= from) out.push(idx(wrapX(x + dx), ty));
    }
    return out;
  }

  const atSea = (world: WorldState, h: Hazard): boolean => world.elevation[idx(h.x, h.y)] < 0;

  HAZARD_CHAINS[EventKind.Earthquake] = (world, h) =>
    atSea(world, h) ? { kind: EventKind.TidalWave, x: h.x, y: h.y, strength: CHAIN_QUAKE_WAVE * (h.quake?.magnitude ?? QUAKE_MAG_INLAND) } : null;

  // Ring 2 of the blast and the tiles beside it.
  HAZARD_CHAINS[EventKind.Meteor] = (world, h) =>
    atSea(world, h) ? { kind: EventKind.TidalWave, x: h.x, y: h.y } : fireAmong(world, h, ringTiles(h.x, h.y, 2, 3));

  // A bolt of the tick before on dry plants; the storm has soaked its strip, so mostly one in the bands.
  HAZARD_CHAINS[EventKind.Hurricane] = (world, h) =>
    fireAmong(world, h, stormStrikesAt(world, h, h.age - 1).filter((i) => hazardRoll(world.seed ^ h.id, i, h.age) < STORM_FIRE_CHANCE));

  // Only beside lava that has stopped and above its surface: the flow would bury a fire anywhere else.
  HAZARD_CHAINS[EventKind.Volcano] = (world, h) => {
    const lava = h.lava;
    if (!lava || h.age < 1) return null;
    const e = world.elevation;
    const beside = new Set<number>();
    for (const i of lava.tiles) {
      if (lava.front.includes(i)) continue;
      for (let k = 0; k < 8; k++) {
        const j = hazardNeighbour(i, k);
        if (j >= 0 && e[j] > e[i] + VOLCANO_LAVA_THICK) beside.add(j);
      }
    }
    return fireAmong(world, h, beside);
  };
}
