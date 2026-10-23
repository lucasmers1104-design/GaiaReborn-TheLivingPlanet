/* =============================================================================
 * Gaia Reborn — methane and the air's pressure
 * -----------------------------------------------------------------------------
 * Methane is the young planet's second greenhouse gas. Archaea make it in
 * oxygen-free water, later swamps and a civilization's cattle, rice fields
 * and natural gas as well; oxygen destroys it. So it builds up while sea and
 * air hold no oxygen and falls once the cyanobacteria's oxygen reaches them.
 * The pressure follows from the gas mix: nitrogen and argon keep theirs, the
 * oxygen life adds thickens the air, and denser air holds a little more heat
 * (ClimateSystem.greenhouseTerms).
 * ========================================================================== */

namespace SE {
  /** The archaea among the prokaryotes' sub-species (src/species/cells.ts): the methane makers. */
  const METHANOGEN_STAGE = 1;
  /** Argon's partial pressure, bar: the same in every age. */
  const ARGON_BAR = 0.0093;

  /**
   * Sea-level air pressure in bar. world.n2 is nitrogen's partial pressure in
   * percent of today's air; oxygen, CO₂ and methane are shares of the whole:
   * about 0.79 bar on a planet without oxygen, 1.0 with today's 21 %.
   */
  export function airPressure(w: WorldState): number {
    const rest = (w.o2 + (w.co2 + w.ch4) / 1e4) / 100;
    return (w.n2 / 100 + ARGON_BAR) / Math.max(0.05, 1 - rest);
  }

  /** Nitrogen's and argon's shares of the air, percent (the rest is oxygen, CO₂ and methane). */
  export function inertShares(w: WorldState): { n2: number; ar: number } {
    const p = airPressure(w);
    return { n2: w.n2 / p, ar: (ARGON_BAR / p) * 100 };
  }

  /** Share of the archaea's methane that escapes a sea with this much oxygen (% of today's saturation). */
  function escapeShare(oceanO2: number): number {
    const r = oceanO2 / CH4_SEA_O2_HALF;
    return 1 / (1 + r * r);
  }

  /** One tick of methane: what archaea, swamps, rock and `extra` (the civilization's) release, less what oxygen destroys. */
  export function stepMethane(w: WorldState, params: ModelParams, extra: number): void {
    let archaea = 0;
    for (let i = 0; i < TILE_COUNT; i++) {
      const li = i * LIFE_COUNT + Life.Prokaryote;
      if (w.lifeStage[li] === METHANOGEN_STAGE) archaea += w.lifeDensity[li];
    }
    const made = CH4_ARCHAEA * (archaea / TILE_COUNT) * escapeShare(w.oceanO2)
      + CH4_WETLAND * (w.biomeCounts[Biome.Swamp] / TILE_COUNT)
      + CH4_ABIOTIC * mul(params.geo.volcanoes) + extra;
    const lost = Math.min(1, CH4_LOSS_ANOXIC + CH4_LOSS_PER_O2 * w.o2) * w.ch4;
    w.ch4 = clamp(w.ch4 + made - lost, 0, CH4_MAX);
  }
}
