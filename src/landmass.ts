/* =============================================================================
 * SimEarth 2.0 — landmasses
 * -----------------------------------------------------------------------------
 * Connected land of the planet: every land tile labelled with the landmass it
 * belongs to (8 neighbours, x wraps), and the size of each. The voyage of
 * discovery looks for a continent without cities with it (discovery.ts), the
 * railway for the continent it crosses (railway.ts), the liners for the
 * coasts they link (fleets.ts). Plate drift and the brush change the land, so
 * callers label again when they need it, never every tick. Pure, no world.rng.
 * ========================================================================== */

namespace SE {
  export interface Landmasses {
    /** Landmass of each tile, −1 on water. */
    readonly label: Int32Array;
    /** Land tiles per landmass, by label. */
    readonly size: readonly number[];
  }

  const queue = new Int32Array(TILE_COUNT);

  export function landmasses(world: WorldState): Landmasses {
    const e = world.elevation;
    const label = new Int32Array(TILE_COUNT).fill(-1);
    const size: number[] = [];
    for (let s = 0; s < TILE_COUNT; s++) {
      if (label[s] >= 0 || e[s] < 0) continue;
      const id = size.length;
      let head = 0;
      let tail = 0;
      queue[tail++] = s;
      label[s] = id;
      while (head < tail) {
        const i = queue[head++];
        const x = i % GRID_W;
        const row = i - x;
        const xl = x === 0 ? GRID_W - 1 : x - 1;
        const xr = x === GRID_W - 1 ? 0 : x + 1;
        for (let dy = -GRID_W; dy <= GRID_W; dy += GRID_W) {
          const r = row + dy;
          if (r < 0 || r >= TILE_COUNT) continue;
          for (let k = 0; k < 3; k++) {
            const j = r + (k === 0 ? xl : k === 1 ? x : xr);
            if (label[j] >= 0 || e[j] < 0) continue;
            label[j] = id;
            queue[tail++] = j;
          }
        }
      }
      size.push(tail);
    }
    return { label, size };
  }
}
