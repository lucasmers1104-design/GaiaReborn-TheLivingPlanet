/* =============================================================================
 * SimEarth 2.0 — coal
 * -----------------------------------------------------------------------------
 * One reserve for the whole planet, never per tile, and not shown on the map.
 * Every year swamps and swamp forests with dense plant cover bury peat: a
 * swamp forest of giant clubmosses the most, any later swamp a tenth of that
 * (lignite rather than hard coal). Buried peat turns into usable coal with a
 * half-life of millions of years, so at the 100 and 10 years a tick of the
 * civilization and technology time scales practically none forms.
 *
 * From the Industrial age on, cities mine the coal share of their fossil
 * energy from the reserve; mined coal is gone. For now coal is bookkeeping
 * only: the CO₂ model burns the fossil mix exactly as before, and an empty
 * reserve changes nothing yet.
 * ========================================================================== */

namespace SE {
  /** Peat buried in one step by origin, Gt: swamp forests of giant clubmosses, and all other swamps. */
  export interface CoalDeposit {
    lycopsid: number;
    other: number;
  }

  export class CoalSystem {
    /** What the last step buried, for probes and tests. */
    static readonly lastDeposit: CoalDeposit = { lycopsid: 0, other: 0 };

    /** Mature the buried peat into coal, then bury this tick's peat. */
    static step(world: WorldState): void {
      const years = world.yearsPerTick;
      const matured = world.coalPeat * (1 - Math.pow(0.5, years / COAL_HALF_LIFE));
      world.coalPeat -= matured;
      world.coal += matured;

      const { elevation, landscape, vegetation } = world;
      let lycopsid = 0;
      let other = 0;
      for (let i = 0; i < TILE_COUNT; i++) {
        if (elevation[i] < 0) continue;
        const ls = landscape[i];
        const swamp = ls === Landscape.Swampforest ? 1 : ls === Landscape.Marsh ? COAL_MARSH : 0;
        if (swamp === 0 || vegetation[i] < COAL_MIN_COVER) continue;
        if (isLycopsidSwamp(world, i)) lycopsid += swamp * vegetation[i];
        else other += swamp * vegetation[i] * COAL_LATER;
      }
      const d = CoalSystem.lastDeposit;
      d.lycopsid = lycopsid * COAL_RATE * years;
      d.other = other * COAL_RATE * years;
      world.coalPeat += d.lycopsid + d.other;
    }
  }

  /** Usable coal left on the planet, Gt. */
  export function coalReserve(world: WorldState): number {
    return world.coal;
  }

  /** Take up to `amount` Gt from the reserve; returns what was there to take. */
  export function mineCoal(world: WorldState, amount: number): number {
    const take = Math.min(world.coal, Math.max(0, amount));
    world.coal -= take;
    world.coalMined += take;
    return take;
  }

  /**
   * Fossil energy the cities burn this tick from one fuel: its `share` per
   * tech level of every city's energy from the Industrial age on, weighted
   * and restated on the reference grid like the emissions in CivSystem.
   */
  export function fuelDemand(world: WorldState, params: ModelParams, share: readonly number[]): number {
    let energy = 0;
    for (const c of world.civ.cities) {
      const t = world.tech[c.tile];
      if (t < Tech.Industrial) continue;
      energy += TECH_ENERGY[t] * world.cityPop[c.tile] * share[t];
    }
    if (energy <= 0) return 0;
    const demand = (energy * CITY_WEIGHT) / GRID_REFINEMENT;
    return demand * params.energyMix().fossilFuel * world.yearsPerTick;
  }

  /** Coal the cities burn this tick, Gt. */
  export function coalDemand(world: WorldState, params: ModelParams): number {
    return fuelDemand(world, params, COAL_SHARE) * COAL_PER_DEMAND_YEAR;
  }
}
