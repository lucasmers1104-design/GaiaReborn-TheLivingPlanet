/* =============================================================================
 * SimEarth 2.0 — the comet's winter
 * -----------------------------------------------------------------------------
 * After the strike (comet.ts) ice spreads from both poles until it holds two
 * thirds of the planet, stays a while and draws back towards the poles. Pure
 * rules on the strike's tick (world.dinoEra.struck), nothing else is kept:
 * succession puts ice on the land it covers, the map draws pack ice on its
 * sea, and the plants beneath keep their groups at a trace of cover, so they
 * grow back once it is gone.
 * ========================================================================== */

namespace SE {
  /** Share of the surface the comet's winter holds under ice now; 0 outside it. */
  export function cometIceShare(world: WorldState): number {
    const struck = world.dinoEra.struck;
    if (struck < 0) return 0;
    const age = world.ticks - struck;
    if (age < 0) return 0;
    if (age < COMET_ICE_GROW) return COMET_ICE_SHARE * (age + 1) / COMET_ICE_GROW;
    const melt = age - COMET_ICE_GROW - COMET_ICE_HOLD;
    if (melt < 0) return COMET_ICE_SHARE;
    return melt < COMET_ICE_MELT ? COMET_ICE_SHARE * (1 - (melt + 1) / COMET_ICE_MELT) : 0;
  }

  let orderSeed = NaN;
  let order: Float32Array | null = null;

  /** Per tile 0 at the poles to 1 at the equator, wobbled: the ice takes the tiles below its share. */
  function frostOrder(seed: number): Float32Array {
    if (order && orderSeed === seed) return order;
    const out = order ?? new Float32Array(TILE_COUNT);
    const cells = GRID_W / COMET_ICE_CELL;
    const lattice = (gx: number, gy: number): number => hazardRoll(seed, (gx % cells) + gy * cells, 0x1ce);
    for (let y = 0; y < GRID_H; y++) {
      const lat = Math.abs(y + 0.5 - GRID_H / 2) / (GRID_H / 2);
      const y0 = Math.floor(y / COMET_ICE_CELL);
      const ty = smoothstep(y / COMET_ICE_CELL - y0);
      for (let x = 0; x < GRID_W; x++) {
        const x0 = Math.floor(x / COMET_ICE_CELL);
        const tx = smoothstep(x / COMET_ICE_CELL - x0);
        const n = lerp(lerp(lattice(x0, y0), lattice(x0 + 1, y0), tx), lerp(lattice(x0, y0 + 1), lattice(x0 + 1, y0 + 1), tx), ty);
        out[idx(x, y)] = 1 - lat + (n * 2 - 1) * COMET_ICE_WOBBLE;
      }
    }
    order = out;
    orderSeed = seed;
    return out;
  }

  /** Is tile i under the comet's ice now? Pass `share` when asking for many tiles at once. */
  export function cometIceAt(world: WorldState, i: number, share = cometIceShare(world)): boolean {
    if (share <= 0) return false;
    const e = world.elevation[i];
    return frostOrder(world.seed)[i] - (e > 0 ? e * COMET_ICE_HEIGHT : 0) < share;
  }

  /** Does the comet's ice spare tile i even at its height? Where the sheltered populations go. */
  export function cometIceSpares(world: WorldState, i: number): boolean {
    return !cometIceAt(world, i, COMET_ICE_SHARE);
  }
}
