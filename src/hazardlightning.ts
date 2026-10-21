/* =============================================================================
 * SimEarth 2.0 — lightning fires and the fire window
 * -----------------------------------------------------------------------------
 * docs/ereignisse-spec.md §3.3. Now and then a thunderstorm's lightning finds
 * dry plants and sets them alight: a natural wildfire. More oxygen in the air
 * makes plants catch more readily, wetter ones too, and fire spread faster
 * and burn hotter, using up more of it (hazardfire.ts). So a planet with too much of it
 * burns itself back down, the fire window that holds Earth's air near 21 %.
 * Rolls are hashes of seed and tick, so they leave world.rng, and with it
 * every seed's history, as it was.
 * ========================================================================== */

namespace SE {
  /** How much more readily plants catch and fire spreads at this air O₂: 1 up to today's level, more above it. */
  export function fireOxygen(o2: number): number {
    return 1 + Math.max(0, o2 - O2_PRESENT) / FIRE_O2_SPAN;
  }

  /** Whether lightning, lava or a blast sets tile i alight: dry plants, and wetter ones the more oxygen there is. */
  export function fireCanCatch(world: WorldState, i: number): boolean {
    return world.elevation[i] >= 0 && world.vegetation[i] >= CHAIN_FIRE_COVER &&
      world.moisture[i] < CHAIN_FIRE_MOISTURE * fireOxygen(world.o2) &&
      HAZARD_RULES[EventKind.Fire]?.refuse(world, i % GRID_W, (i / GRID_W) | 0) === '';
  }

  /** The tile lightning sets alight this tick, or -1: rare at today's oxygen, ever more often above it. */
  export function lightningFireTile(world: WorldState): number {
    const chance = FIRE_LIGHTNING_CHANCE * fireOxygen(world.o2) ** FIRE_LIGHTNING_POWER;
    if (hazardRoll(world.seed, world.ticks, 0x11a7) >= chance) return -1;
    let best = -1;
    let bestFuel = 0;
    for (let k = 0; k < FIRE_LIGHTNING_TRIES; k++) {
      const i = Math.floor(hazardRoll(world.seed, world.ticks, 0x11a8 + k) * TILE_COUNT);
      if (!fireCanCatch(world, i)) continue;
      const fuel = fireFuel(world, i) * fireDryness(world, i);
      if (fuel > bestFuel) { bestFuel = fuel; best = i; }
    }
    return best;
  }
}
