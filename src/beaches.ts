/* =============================================================================
 * SimEarth 2.0 — tropical sandy beaches and coconut palms
 * -----------------------------------------------------------------------------
 * Warm low coasts show a sandy beach in stretches; once the flowering plants
 * have existed for PALM_DELAY_YEARS, coconut palms stand on some tropical
 * and warm beach tiles. Drawing only: the simulation does
 * not know them, so nothing is saved.
 * ========================================================================== */

namespace SE {
  const NO_BEACH: readonly Landscape[] = [Landscape.Ice, Landscape.Snow, Landscape.Rock, Landscape.Marsh, Landscape.Swampforest];

  /** Is land tile i a sandy beach: low, warm (by the hysteresis zone, so it does not flicker), next to open sea, in a stretch? */
  export function isBeach(world: WorldState, i: number): boolean {
    const { elevation, landscapeZone, biome } = world;
    const h = elevation[i];
    if (h < 0 || h >= BEACH_MAX_ELEVATION) return false;
    const z = landscapeZone[i];
    if (z === ZONE_NONE || zoneTemp(z) < TempClass.Warm || (z & ZONE_MOUNTAIN) !== 0) return false;
    // Humid tropical coasts are wetland and grow swamp forest; without this
    // exception the classic palm coasts (Indonesia, Antilles) had no beach.
    const tropical = zoneTemp(z) === TempClass.Tropical;
    if (!tropical && (z & ZONE_WETLAND) !== 0) return false;
    const ls = world.landscape[i];
    if (NO_BEACH.includes(ls) && !(tropical && ls === Landscape.Swampforest)) return false;
    const x = i % GRID_W;
    const y = (i / GRID_W) | 0;
    if (landOctave(x, y, GRID_W, 32, 1201) >= BEACH_SHARE) return false;
    for (let k = 0; k < 4; k++) {
      const j = k === 0 ? idx(wrapX(x - 1), y) : k === 1 ? idx(wrapX(x + 1), y) : k === 2 ? (y > 0 ? i - GRID_W : -1) : (y < GRID_H - 1 ? i + GRID_W : -1);
      if (j >= 0 && elevation[j] < 0 && biome[j] !== Biome.Arctic) return true;
    }
    return false;
  }

  /** Have the flowering plants existed long enough for palms? */
  export function palmsArrived(world: WorldState): boolean {
    const rec = world.evo.developed.get(FLORA[Flora.Flowering].id);
    return rec !== undefined && world.absoluteYears - rec.years >= PALM_DELAY_YEARS;
  }

  /**
   * Coconut palms on beach tile i: 0, 1 or 2; tropical beaches carry them more
   * often than warm ones. Once arrived, palms need no flowering plants nearby:
   * those spread to the coasts far slower than palms should show.
   */
  export function beachPalms(world: WorldState, i: number, arrived = palmsArrived(world)): number {
    if (!arrived) return 0;
    const x = i % GRID_W;
    const y = (i / GRID_W) | 0;
    const share = zoneTemp(world.landscapeZone[i]) === TempClass.Tropical ? PALM_SHARE_TROPICAL : PALM_SHARE_WARM;
    if (landHash(x, y, 840) >= share) return 0;
    return landHash(x, y, 841) < PALM_PAIR_SHARE ? 2 : 1;
  }
}
