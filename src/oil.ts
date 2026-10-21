/* =============================================================================
 * SimEarth 2.0 — oil
 * -----------------------------------------------------------------------------
 * One reserve for the whole planet like the coal (coal.ts), never per tile.
 * Dead sea animals sink to the floor: every year the summed density of the
 * marine animal classes (single cells left out) buries kerogen, which turns
 * into oil with a half-life of tens of millions of years. Oil is a product of
 * deep time; at the civilization and technology time scales practically none
 * forms. The step reads the life totals `refreshDerived` keeps anyway, so it
 * costs a loop over the classes, not over the tiles.
 *
 * From the Industrial age on, cities pump the oil share of their fossil energy
 * from the reserve; pumped oil is gone. Like coal it is bookkeeping for now:
 * the CO₂ model burns the fossil mix exactly as before.
 *
 * The optional save field `oil` keeps reserve, kerogen and what was pumped,
 * so the format number stays; without a sound one the reserve is estimated
 * from how long sea animals have lived.
 * ========================================================================== */

namespace SE {
  /** Summed density of the marine animals over all tiles, as of the last `refreshDerived`. */
  export function seaAnimalBiomass(world: WorldState): number {
    let sum = 0;
    // Every class after the two single-celled ones is an animal.
    for (let c = Life.Radiate; c < LIFE_COUNT; c++) if (isSeaLife(c)) sum += world.lifeBiomass[c];
    return sum;
  }

  export class OilSystem {
    /** Mature the buried kerogen into oil, then bury this tick's kerogen. */
    static step(world: WorldState): void {
      const years = world.yearsPerTick;
      const matured = world.oilKerogen * (1 - Math.pow(0.5, years / OIL_HALF_LIFE));
      world.oilKerogen += seaAnimalBiomass(world) * OIL_RATE * years - matured;
      world.oil += matured;
    }
  }

  /** Take up to `amount` Gt from the reserve; returns what was there to take. */
  export function pumpOil(world: WorldState, amount: number): number {
    const take = Math.min(world.oil, Math.max(0, amount));
    world.oil -= take;
    world.oilMined += take;
    return take;
  }

  /** Oil the cities burn this tick, Gt. */
  export function oilDemand(world: WorldState, params: ModelParams): number {
    return fuelDemand(world, params, OIL_SHARE) * OIL_PER_DEMAND_YEAR;
  }

  /* -------------------------------------------------------------- rigs -- */

  /** Less than half the 9 × 9 tiles round the platform may be land, so a small lake never gets one. */
  const OPEN_SEA_REACH = 4;
  const OPEN_SEA_LAND = 41;

  /**
   * Once the first city reaches the Industrial age, set an oil platform on the
   * sea off a coast (open water all round, land within two tiles, no sea ice)
   * and a derrick in a desert or semi-desert (else on the driest free land),
   * each the one nearest that city. Placed once and then fixed: the map draws
   * them (oillayer.ts), the simulation never reads them. Draws no random numbers.
   */
  export function placeOilRigs(world: WorldState): void {
    if (world.oilRigSea >= 0 || world.oilRigLand >= 0) return;
    const city = world.civ.cities.find((c) => world.tech[c.tile] >= Tech.Industrial);
    if (!city) return;
    const cx = city.tile % GRID_W;
    const cy = (city.tile / GRID_W) | 0;
    let sea = -1;
    let seaDist = Infinity;
    let land = -1;
    let landScore = Infinity;
    for (let i = 0; i < TILE_COUNT; i++) {
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      let dx = Math.abs(x - cx);
      dx = Math.min(dx, GRID_W - dx);
      const d = dx * dx + (y - cy) * (y - cy);
      if (world.isWater(i)) {
        if (d < seaDist && world.biome[i] < WATER_BIOME_COUNT && landWithin(world, x, y, 1) === 0 && landWithin(world, x, y, 2) > 0 &&
          landWithin(world, x, y, OPEN_SEA_REACH) < OPEN_SEA_LAND) {
          sea = i;
          seaDist = d;
        }
      } else if (world.tech[i] === Tech.None && world.landscape[i] !== Landscape.Ice && world.landscape[i] !== Landscape.Snow && !spaceportTooClose(world, i)) {
        const ls = world.landscape[i];
        // A desert beats any other land; among either, the nearest wins.
        const score = (ls === Landscape.Desert || ls === Landscape.Semidesert ? 0 : 1 + world.moisture[i]) * 1e9 + d;
        if (score < landScore) {
          land = i;
          landScore = score;
        }
      }
    }
    world.oilRigSea = sea;
    world.oilRigLand = land;
  }

  /** Land tiles within Chebyshev distance r of (x, y). */
  function landWithin(world: WorldState, x: number, y: number, r: number): number {
    let n = 0;
    for (let dy = -r; dy <= r; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= GRID_H) continue;
      for (let dx = -r; dx <= r; dx++) if (!world.isWater(idx(wrapX(x + dx), yy))) n++;
    }
    return n;
  }

  /* -------------------------------------------------------------- save -- */

  interface SavedOil {
    readonly reserve: number;
    readonly kerogen: number;
    readonly mined: number;
    /** Tiles of the platform and the derrick, −1 for none. */
    readonly rigs: readonly [number, number];
  }

  /** Largest amount a sound field may carry, Gt. */
  const OIL_SAVE_MAX = 1e7;

  export function oilToJSON(world: WorldState): SavedOil {
    return { reserve: world.oil, kerogen: world.oilKerogen, mined: world.oilMined, rigs: [world.oilRigSea, world.oilRigLand] };
  }

  function readOil(raw: unknown): SavedOil | null {
    if (!raw || typeof raw !== 'object') return null;
    const { reserve, kerogen, mined, rigs } = raw as Record<string, unknown>;
    const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= OIL_SAVE_MAX;
    if (!ok(reserve) || !ok(kerogen) || !ok(mined)) return null;
    // Saves from before the rigs have none; the next tick of an industrial civilization places them.
    const tile = (v: unknown): number => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < TILE_COUNT ? v as number : -1);
    const r = Array.isArray(rigs) ? rigs : [];
    return { reserve, kerogen, mined, rigs: [tile(r[0]), tile(r[1])] };
  }

  /** Restore the saved oil field, or estimate it for a save without a sound one. */
  export function restoreOil(world: WorldState, raw: unknown): void {
    const saved = readOil(raw);
    world.oil = saved ? saved.reserve : estimateOil(world);
    world.oilKerogen = saved ? saved.kerogen : 0;
    world.oilMined = saved ? saved.mined : 0;
    world.oilRigSea = saved ? saved.rigs[0] : -1;
    world.oilRigLand = saved ? saved.rigs[1] : -1;
  }

  /** Oil a reference planet lays down in the years since its first sea animals appeared. */
  export function estimateOil(world: WorldState): number {
    let first = Infinity;
    for (let c = Life.Radiate; c < LIFE_COUNT; c++) {
      if (isSeaLife(c) && world.lifeFirstSeen[c] >= 0) first = Math.min(first, world.lifeFirstSeen[c]);
    }
    return first === Infinity ? 0 : Math.max(0, world.absoluteYears - first) * OIL_EST_YEAR;
  }
}
