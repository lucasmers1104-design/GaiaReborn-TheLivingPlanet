/* =============================================================================
 * SimEarth 2.0 — biome specialists on the map
 * -----------------------------------------------------------------------------
 * Picks the picture a tile shows: a class's ordinary sub-species, or one of
 * its biome specialists — a polar bear on a great ice sheet, a fennec in a
 * wide desert, a cactus wherever desert plants grow. Graphics only: the
 * simulation and every window still see the class and its sub-species.
 *
 * Animal specialists need a large connected region of their biome, so a
 * single icy tile in a forest does not sprout a polar bear. Plant
 * specialists only need the biome, and show on a share of its tiles.
 * ========================================================================== */

namespace SE {
  /**
   * Smallest connected region, in tiles, in which a biome's animal
   * specialists appear, at the default land share. Measured on test planets:
   * deserts reach about 180 tiles, tundra and swamps about 50, ice thousands.
   */
  const REGION_MIN: readonly number[] = [
    200, // Coast
    600, // Ocean
    30,  // Rock
    150, // Arctic
    60,  // Boreal
    70,  // Desert
    150, // Grass
    60,  // Forest
    50,  // Jungle
    20,  // Swamp
    25,  // Tundra
  ];
  /** A region that was large stays large down to this share of the minimum. */
  const REGION_KEEP = 0.75;
  /** Ticks between two region surveys; biomes drift slowly. */
  const REGION_EVERY = 10;
  /** Share of a class's icons inside a large region that show a specialist. */
  const SPECIALIST_SHARE = 0.65;
  /**
   * Share of a biome's plant tiles that show a group's specialist instead of
   * its ordinary cover. High where the ordinary cover would look out of place
   * (a flowering shrub in the desert), half elsewhere so an open plain does
   * not turn into one solid field of cycads.
   */
  const PLANT_SPECIALIST_SHARE: readonly number[] = [
    0.5,  // Coast
    0.5,  // Ocean
    0.6,  // Rock
    0.85, // Arctic
    0.5,  // Boreal
    0.85, // Desert
    0.4,  // Grass
    0.5,  // Forest
    0.5,  // Jungle
    0.75, // Swamp
    0.6,  // Tundra
  ];
  /** Land share of the planet the thresholds were measured at. */
  const LAND_SHARE_REF = 0.42;

  /** Stable 0..1 hash of a tile and a salt. */
  export function tileHash(i: number, salt: number): number {
    let h = Math.imul(i ^ Math.imul(salt, 0x9e3779b1), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  /** Connected regions of one biome (eight neighbours, east-west wrap). */
  export class BiomeRegions {
    private readonly size = new Int32Array(TILE_COUNT);
    private readonly large = new Uint8Array(TILE_COUNT);
    private readonly seen = new Uint8Array(TILE_COUNT);
    private readonly queue = new Int32Array(TILE_COUNT);
    private tick = -1;
    private seed = -1;

    refresh(world: WorldState): void {
      if (world.seed === this.seed && world.ticks >= this.tick && world.ticks - this.tick < REGION_EVERY) return;
      const fresh = world.seed !== this.seed;
      this.seed = world.seed;
      this.tick = world.ticks;
      const scale = clamp((1 - world.oceanFraction) / LAND_SHARE_REF, 0.5, 1.5);
      const { size, seen, queue, large } = this;
      seen.fill(0);
      for (let start = 0; start < TILE_COUNT; start++) {
        if (seen[start]) continue;
        const biome = world.biome[start];
        const water = world.isWater(start);
        let head = 0;
        let tail = 0;
        queue[tail++] = start;
        seen[start] = 1;
        while (head < tail) {
          const i = queue[head++];
          const x = i % GRID_W;
          const y = (i / GRID_W) | 0;
          for (let dy = -1; dy <= 1; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= GRID_H) continue;
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const j = idx(wrapX(x + dx), ny);
              if (seen[j] || world.biome[j] !== biome || world.isWater(j) !== water) continue;
              seen[j] = 1;
              queue[tail++] = j;
            }
          }
        }
        const min = REGION_MIN[biome] * (biome < WATER_BIOME_COUNT ? 1 : scale);
        for (let k = 0; k < tail; k++) {
          const i = queue[k];
          size[i] = tail;
          large[i] = tail >= min || (!fresh && large[i] === 1 && tail >= min * REGION_KEEP) ? 1 : 0;
        }
      }
    }

    /** Is this tile part of a region large enough for animal specialists? */
    isLarge(i: number): boolean {
      return this.large[i] === 1;
    }
  }

  /**
   * The biome specialist a class shows on this tile, as an index into its
   * `specialists`, or -1 for the ordinary sub-species picture.
   */
  export function animalSpecialist(regions: BiomeRegions, world: WorldState, i: number, c: Life, stage: number): number {
    const list = SPECIES[c]?.specialists;
    if (!list || list.length === 0 || !regions.isLarge(i)) return -1;
    if (tileHash(i, c) >= SPECIALIST_SHARE) return -1;
    const biome = world.biome[i];
    let count = 0;
    for (const s of list) if (s.biome === biome && stage >= s.minStage) count++;
    if (count === 0) return -1;
    let pick = Math.floor(tileHash(i, c + 101) * count);
    for (let k = 0; k < list.length; k++) {
      const s = list[k];
      if (s.biome === biome && stage >= s.minStage && pick-- === 0) return k;
    }
    return -1;
  }

  /**
   * The plant picture for a tile led by `top`: packed as `group * 16 +
   * specialist + 1`, where specialist -1 means the group's ordinary cover.
   * A desert led by grasses still shows its cactus when flowering plants grow
   * there too, so any group on the tile may lend its specialist.
   */
  export function plantPicture(world: WorldState, i: number, top: Flora): number {
    const biome = world.biome[i];
    const mask = world.flora[i];
    const own = plantSpecialist(top, biome, i);
    if (own >= 0) return top * 16 + own + 1;
    for (let g = FLORA_COUNT - 1; g > 0; g--) {
      if (g === top || (mask & floraBit(g as Flora)) === 0) continue;
      const k = plantSpecialist(g as Flora, biome, i);
      if (k >= 0) return g * 16 + k + 1;
    }
    return top * 16;
  }

  function plantSpecialist(g: Flora, biome: number, i: number): number {
    const list = FLORA_ART[g]?.specialists;
    if (!list || tileHash(i, 300 + g) >= PLANT_SPECIALIST_SHARE[biome]) return -1;
    let count = 0;
    for (const s of list) if (s.biome === biome) count++;
    if (count === 0) return -1;
    let pick = Math.floor(tileHash(i, 200 + g) * count);
    for (let k = 0; k < list.length; k++) {
      if (list[k].biome === biome && pick-- === 0) return k;
    }
    return -1;
  }
}
