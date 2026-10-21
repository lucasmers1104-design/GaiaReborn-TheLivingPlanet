/* =============================================================================
 * SimEarth 2.0 — evolution that does not wait for the player
 * -----------------------------------------------------------------------------
 * A step whose every condition but the price has held for some time may arise
 * on its own, without evolution points: nature does not need the player's
 * permission. The chance is nil for a grace period — the player gets the
 * first say — and then grows with every tick the conditions keep holding.
 *
 * With the evolution-rate slider at its default, the cumulative chance after
 * the grace period is about 18 % after 100 ticks, half after 220 and 94 %
 * after 500 — at medium speed (400 ms per tick) a step standing ready arises
 * after about two and a half minutes on average, nearly always within four.
 * ========================================================================== */

namespace SE {
  /** Ticks a step must stand ready before it can arise on its own. */
  export const SPONTANEOUS_GRACE = 120;
  /** Per-tick chance right after the grace period. */
  const HAZARD_BASE = 1e-3;
  /** Growth of the per-tick chance with each further tick of readiness. */
  const HAZARD_RAMP = 2e-5;
  /** Ceiling of the per-tick chance, however long the step has waited. */
  const HAZARD_MAX = 0.008;
  /** Ticks between checks; the chance per check covers them all. */
  export const SPONTANEOUS_EVERY = 6;

  /** Per-tick chance that a step ready for `readyTicks` arises on its own. */
  export function spontaneousChance(readyTicks: number, evolutionRate: number): number {
    if (readyTicks < SPONTANEOUS_GRACE) return 0;
    return mul(evolutionRate) * Math.min(HAZARD_MAX, HAZARD_BASE + HAZARD_RAMP * (readyTicks - SPONTANEOUS_GRACE));
  }

  /**
   * A uniform number in [0, 1) for one step at one tick, fixed by the planet's
   * seed. Hashed rather than drawn from the world RNG, so that checking for
   * spontaneous steps never shifts the random stream the rest of the
   * simulation runs on.
   */
  export function spontaneousRoll(seed: number, tick: number, node: number): number {
    let h = Math.imul(seed ^ 0x2c1b3c6d, 0x297a2d39) ^ Math.imul(tick + 0x6f4f2a1b, 0x85ebca6b) ^ Math.imul(node + 1, 0xc2b2ae35);
    h ^= h >>> 16;
    h = Math.imul(h, 0x7feb352d);
    h ^= h >>> 15;
    h = Math.imul(h, 0x846ca68b);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
}
