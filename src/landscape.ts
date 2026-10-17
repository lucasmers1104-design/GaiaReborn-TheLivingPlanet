/* =============================================================================
 * SimEarth 2.0 — landscapes and substrates
 * -----------------------------------------------------------------------------
 * A land tile's landscape is its succession stage — Rock, Lichen, Meadow,
 * Forest and so on — and decides what the map draws there. The 11 habitat
 * biomes the animals live in are derived from it (docs/biomes-spec.md §3).
 *
 * The ids are the contract with the terrain atlas: LANDSCAPE_IDS must equal
 * `TERRAIN_MANIFEST.landscapeIds` (tools/terrain/catalog.js), in this order.
 * Landscapes are saved per tile, so the enum values are stable: append only.
 * ========================================================================== */

namespace SE {
  export enum Landscape {
    Ice = 0,
    Snow = 1,
    Rock = 2,
    Barren = 3,
    Desert = 4,
    Lichen = 5,
    Moss = 6,
    Tundra = 7,
    Fernland = 8,
    Steppe = 9,
    Meadow = 10,
    Savanna = 11,
    Semidesert = 12,
    Shrubland = 13,
    Forest = 14,
    Taiga = 15,
    Rainforest = 16,
    Marsh = 17,
    Swampforest = 18,
    /** Alpine meadow above the tree line (docs/hoehe-spec.md §3.6). */
    Alpine = 19,
    /** Montane rainforest of the humid tropical highlands: rainforest for the animals. */
    Cloudforest = 20,
  }
  export const LANDSCAPE_COUNT = 21;
  /** `landscapeNext` of a tile without succession state (water, or land not yet started). */
  export const LANDSCAPE_UNSET = 255;

  export const LANDSCAPE_IDS: readonly string[] = [
    'ice', 'snow', 'rock', 'barren', 'desert', 'lichen', 'moss', 'tundra', 'fernland', 'steppe',
    'meadow', 'savanna', 'semidesert', 'shrubland', 'forest', 'taiga', 'rainforest', 'marsh', 'swampforest',
    'alpine', 'cloudforest',
  ];

  export const LANDSCAPE_NAMES: readonly string[] = [
    'Eis', 'Gipfelschnee', 'Fels', 'Rohboden', 'Wüste', 'Flechten & Moos auf Fels', 'Moosteppich', 'Tundra',
    'Farnflur', 'Steppe', 'Wiese', 'Savanne', 'Halbwüste', 'Gebüsch', 'Wald', 'Nadelwald', 'Regenwald',
    'Sumpf', 'Sumpfwald', 'Alpine Matte', 'Bergregenwald',
  ];

  /** Density steps each landscape distinguishes (1: none; forests 2; open land 3). */
  export const LANDSCAPE_DENSITIES: readonly number[] = [
    1, 1, 1, 1, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 3, 2, 3, 2,
  ];

  /** What a land tile is made of beneath its plants (spec §3.2). */
  export enum Substrate {
    Rock = 0,
    Sand = 1,
    Soil = 2,
    Mire = 3,
  }
  export const SUBSTRATE_IDS: readonly ('rock' | 'sand' | 'soil' | 'mire')[] = ['rock', 'sand', 'soil', 'mire'];
  export const SUBSTRATE_NAMES: readonly string[] = ['Fels', 'Sand', 'Erde', 'Moor'];

  /* ------------------------------------------------- succession tables -- */

  /**
   * Succession level: 0 bare, 1 pioneer, 2 open land, 3 shrub, 4 forest.
   * A tile climbs or falls one level-step at a time (spec §3.5).
   */
  export const LANDSCAPE_LEVEL: readonly number[] = [
    0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 1, 3, 4, 4, 4, 2, 4, 2, 4,
  ];

  /** Drawing rank (spec §5.1): who wins at a border, and who yields to a neighbour. */
  export const LANDSCAPE_RANK: readonly number[] = [
    21, 22, 1, 4, 2, 7, 9, 8, 10, 11, 13, 12, 6, 15, 18, 17, 19, 14, 16, 9.5, 19.5,
  ];

  /**
   * Years it takes to establish each stage — the hold time in real years once
   * a tick is short enough (Civilization and Technology scales). In the
   * geologic scales every stage takes the minimum hold of a few ticks.
   */
  export const LANDSCAPE_STAGE_YEARS: readonly number[] = [
    0, 0, 20, 2, 50, 50, 40, 50, 10, 10, 10, 15, 30, 15, 60, 80, 60, 10, 60, 30, 60,
  ];

  /** What ice and summit snow never border: woodland, warm open land and desert (rock, tundra or alpine meadow lie between). */
  const FROST_CLASHES: readonly Landscape[] = [Landscape.Taiga, Landscape.Forest, Landscape.Rainforest, Landscape.Desert,
    Landscape.Semidesert, Landscape.Savanna, Landscape.Steppe, Landscape.Meadow, Landscape.Fernland, Landscape.Shrubland,
    Landscape.Swampforest, Landscape.Cloudforest];

  /** Landscapes that never border each other in nature (spec §3.7, point 5). */
  const CLASHES: readonly (readonly [Landscape, readonly Landscape[]])[] = [
    [Landscape.Ice, FROST_CLASHES],
    [Landscape.Snow, FROST_CLASHES],
    [Landscape.Rainforest, [Landscape.Tundra, Landscape.Taiga, Landscape.Desert, Landscape.Semidesert,
      Landscape.Steppe, Landscape.Meadow, Landscape.Alpine]],
    [Landscape.Desert, [Landscape.Taiga, Landscape.Forest, Landscape.Savanna, Landscape.Meadow, Landscape.Moss,
      Landscape.Marsh, Landscape.Swampforest]],
    [Landscape.Semidesert, [Landscape.Taiga, Landscape.Forest, Landscape.Moss, Landscape.Marsh, Landscape.Swampforest]],
    [Landscape.Cloudforest, [Landscape.Tundra, Landscape.Taiga, Landscape.Desert, Landscape.Semidesert]],
    [Landscape.Taiga, [Landscape.Savanna]],
    [Landscape.Tundra, [Landscape.Savanna]],
  ];

  /** Bit l of LANDSCAPE_CLASH[k] is set when k and l are unnatural neighbours. */
  export const LANDSCAPE_CLASH: readonly number[] = (() => {
    const out = new Array<number>(LANDSCAPE_COUNT).fill(0);
    for (const [a, list] of CLASHES) {
      for (const b of list) {
        out[a] |= 1 << b;
        out[b] |= 1 << a;
      }
    }
    return out;
  })();

  /**
   * Habitat of each landscape before the climate refines it (spec §3.3).
   * Summit snow is Arctic, so peaks reflect like ice (docs/hoehe-spec.md §3.5).
   */
  const HABITAT: readonly Biome[] = [
    Biome.Arctic, Biome.Arctic, Biome.Rock, Biome.Rock, Biome.Desert, Biome.Grass, Biome.Grass, Biome.Tundra,
    Biome.Grass, Biome.Grass, Biome.Grass, Biome.Grass, Biome.Desert, Biome.Grass, Biome.Forest, Biome.Boreal,
    Biome.Jungle, Biome.Swamp, Biome.Swamp, Biome.Tundra, Biome.Jungle,
  ];

  /* ----------------------------------------------------- climate zones -- */

  /*
   * A zone packs what the landscape rules read about a tile's climate into
   * one number: temperature class (bits 0-2: frozen, cold, cool, warm,
   * tropical), moisture class (bits 3-5: dry, semi-arid, moderate,
   * moderate-moist, humid, wet) and the flags below. Stored per tile it is
   * the memory of the Schmitt triggers: every threshold has a band in favour
   * of the class the tile was in.
   *
   * Altitude belts (docs/hoehe-spec.md §3.6) are nested flags of mountain
   * tiles, read off the tile's own temperature: mountain ⊃ above the tree
   * line ⊃ rock belt ⊃ summit snow.
   */
  export const ZONE_NONE = 0xffff;
  /** Above the tree line: alpine meadow, no trees ("high mountains"). */
  export const ZONE_TREELINE = 1 << 6;
  export const ZONE_SNOW = 1 << 7;
  export const ZONE_WETLAND = 1 << 8;
  export const ZONE_BARE = 1 << 9;
  /** Subnival rock belt between alpine meadow and snow (docs/hoehe-spec.md §3.6). */
  export const ZONE_ROCKBELT = 1 << 10;
  /** Mountain tile (elevation ≥ ALPINE_MIN_ELEVATION): its altitude belts apply, humid tropics carry cloud forest. */
  export const ZONE_MOUNTAIN = 1 << 11;
  export const enum TempClass { Frozen = 0, Cold = 1, Cool = 2, Warm = 3, Tropical = 4 }
  export const enum MoistClass { Dry = 0, Semi = 1, Moderate = 2, Moist = 3, Humid = 4, Wet = 5 }

  export function zoneTemp(z: number): TempClass { return z & 7; }
  export function zoneMoist(z: number): MoistClass { return (z >> 3) & 7; }

  function bandClass(v: number, bounds: readonly number[], prev: number, band: number): number {
    let c = 0;
    while (c < bounds.length && v >= bounds[c]) c++;
    if (prev < 0) return c;
    const lo = prev > 0 ? bounds[prev - 1] - band : -Infinity;
    const hi = prev < bounds.length ? bounds[prev] + band : Infinity;
    return v >= lo && v < hi ? prev : c;
  }

  /**
   * Band offset for a flag: 0 without memory, -1 if the flag was set (it
   * takes crossing the far side of the band to clear it), +1 if it was not.
   */
  function flagBand(prev: number, bit: number): number {
    return prev === ZONE_NONE ? 0 : (prev & bit) ? -1 : 1;
  }

  /** Temperature class boundaries below the tropics: frozen | cold | cool | warm. */
  export const LANDSCAPE_TEMP_BOUNDS: readonly number[] = [FROZEN_TEMP, COLD_TEMP, COOL_TEMP];

  /** Degrees a tile at elevation `elev` is colder than sea level below it. */
  export function altitudeCooling(elev: number): number {
    return elev > 0 ? LAPSE_RATE * ELEVATION_KM * elev : 0;
  }

  /** Summit snow threshold (°C): in dry air the snow line lies higher. Brushed peaks above SUMMIT_SNOW_ELEVATION carry snow anyway. */
  export function snowTemp(m: MoistClass): number {
    return m === MoistClass.Dry ? SNOW_TEMP - SNOW_DRY_SHIFT : SNOW_TEMP;
  }

  /**
   * Climate zone of a land tile from its smoothed temperature (at height
   * `elev`), moisture and plant cover, its height `elev` and, for standing
   * water, its own elevation `wetElev`. `prev` is the tile's last zone, or
   * ZONE_NONE for no memory.
   *
   * Whether a tile is tropical follows its sea-level temperature, so humid
   * tropical highland stays tropical up to the tree line (hoehe-spec E5);
   * every other class and the altitude belts follow the tile's own. A
   * mountain is frozen (ice sheet) only where the sea-level climate is
   * frozen as well; frozen by its height alone it carries summit snow.
   */
  export function landscapeZone(temp: number, moist: number, elev: number, cover: number, prev: number, wetElev = elev, brushed = false): number {
    const known = prev !== ZONE_NONE;
    const pt = known ? zoneTemp(prev) : -1;
    const tSea = temp + altitudeCooling(elev);
    const mountain = elev >= ALPINE_MIN_ELEVATION + flagBand(prev, ZONE_MOUNTAIN) * SCHMITT_ELEVATION;
    const tb = pt < 0 ? 0 : pt === TempClass.Tropical ? -1 : 1;
    let t: number = tSea >= TROPICAL_TEMP + tb * SCHMITT_TEMP ? TempClass.Tropical
      : bandClass(temp, LANDSCAPE_TEMP_BOUNDS, pt === TempClass.Tropical ? TempClass.Warm : pt, SCHMITT_TEMP);
    if (t === TempClass.Frozen && mountain) {
      const fb = pt < 0 ? 0 : pt === TempClass.Frozen ? -1 : 1;
      if (tSea >= FROZEN_TEMP - fb * SCHMITT_TEMP) t = TempClass.Cold;
    }
    const m = bandClass(moist, MOISTURE_BOUNDS, known ? zoneMoist(prev) : -1, SCHMITT_MOISTURE);
    let z = t | (m << 3);
    if (mountain) {
      z |= ZONE_MOUNTAIN;
      const summit = brushed && m !== MoistClass.Dry && elev >= SUMMIT_SNOW_ELEVATION + flagBand(prev, ZONE_SNOW) * SCHMITT_ELEVATION;
      if (summit || temp < TREELINE_TEMP - flagBand(prev, ZONE_TREELINE) * SCHMITT_TEMP) {
        z |= ZONE_TREELINE;
        if (summit || temp < ROCKBELT_TEMP - flagBand(prev, ZONE_ROCKBELT) * SCHMITT_TEMP) {
          z |= ZONE_ROCKBELT;
          if (summit || temp < snowTemp(m) - flagBand(prev, ZONE_SNOW) * SCHMITT_TEMP) z |= ZONE_SNOW;
        }
      }
    }
    const wb = flagBand(prev, ZONE_WETLAND);
    if (moist >= WETLAND_MOISTURE + wb * SCHMITT_MOISTURE && wetElev < WETLAND_MAX_ELEVATION - wb * SCHMITT_ELEVATION) z |= ZONE_WETLAND;
    if (cover < BARE_COVER - flagBand(prev, ZONE_BARE) * SCHMITT_COVER) z |= ZONE_BARE;
    return z;
  }

  /* ------------------------------------------------------------ ladder -- */

  export const LADDER_NONE = 255;
  const LP = floraBit(Flora.LandPlants);
  const MO = floraBit(Flora.Mosses);
  const GP = floraBit(Flora.Vascular);
  const FA = floraBit(Flora.Ferns);
  const SA = floraBit(Flora.SeedPlants);
  const NA = floraBit(Flora.Conifers);
  const BL = floraBit(Flora.Flowering);
  const LB = floraBit(Flora.Broadleaf);
  const GR = floraBit(Flora.Grasses);
  /** Groups that form woodland: Bärlapp, Urbäume, Samenpflanzen, Nadelbäume, Laubbäume. */
  export const WOODY_FLORA_MASK = (() => {
    let m = 0;
    for (let g = 1; g < FLORA_COUNT; g++) if (FLORA[g as Flora].woody) m |= 1 << g;
    return m;
  })();
  const SEMIDESERT_GROUPS = GR | BL | SA | NA;
  /** Dwarf shrubs, sedges and herbs of the tundra (the mosses join them where they grow). */
  const TUNDRA_GROUPS = GP | FA | BL | GR;
  /** Grasses, sedges and flowering herbs make an alpine meadow; before them the heights carry tundra. */
  const ALPINE_GROUPS = GR | BL;
  /** Open land before the grasses: ferns, early vascular plants, seed ferns and flowering herbs. */
  const FERN_GROUPS = GP | FA | SA | BL;
  const MARSH_GROUPS = LP | MO | GP | floraBit(Flora.Clubmosses) | FA | floraBit(Flora.Carnivorous) | GR | BL;

  /**
   * The succession ladder of a tile: which landscape stands at each level for
   * this zone, these plant groups and this soil, LADDER_NONE where nothing
   * can. Returns the climax level, or -1 for Ice and -2 for summit snow.
   *
   * `present` is the "Gruppen-Umfeld" mask: a group counts when it grows on
   * the tile or on at least three of its eight neighbours. A missing group
   * leaves its level empty, so the target falls back down the same chain —
   * open land before the grasses is Farnflur, before the vascular plants
   * moss or lichen. Land that carries plants never falls back to bare
   * ground: any land plant can be the pioneer crust, and woody plants
   * without herbs make Gebüsch.
   *
   * Bare rock stands only where no soil has formed (young Earth, fresh
   * lava) and in the rock belt (hoehe-spec §3.7); weathered ground is
   * Rohboden, or desert where it is dry and not cold.
   *
   * With `cacti` the flowering plants of a desert climate are cacti
   * (cacti.ts): they make semi-desert, not Farnflur.
   */
  export function fillLadder(
    z: number, present: number, soilOk: boolean, ladder: Uint8Array | number[], woodyMask = WOODY_FLORA_MASK, cacti = false,
  ): number {
    const t = zoneTemp(z);
    const m = zoneMoist(z);
    if (t === TempClass.Frozen) return -1;
    if (z & ZONE_SNOW) return -2;
    if (z & ZONE_ROCKBELT) {
      ladder[0] = Landscape.Rock;
      ladder[1] = ladder[2] = ladder[3] = ladder[4] = LADDER_NONE;
      return 0;
    }
    const wet = (z & ZONE_WETLAND) !== 0;
    const high = (z & ZONE_TREELINE) !== 0;
    const dryWarm = m <= MoistClass.Semi && t >= TempClass.Cool;

    // A dry, warm climate makes desert of bare ground, weathered or not; elsewhere
    // bare ground is Rohboden once it has weathered, else rock.
    ladder[0] = dryWarm ? Landscape.Desert : soilOk ? Landscape.Barren : Landscape.Rock;

    ladder[1] = LADDER_NONE;
    if (!wet) {
      if (dryWarm && (present & SEMIDESERT_GROUPS)) ladder[1] = Landscape.Semidesert;
      else if (present & LAND_FLORA_MASK) ladder[1] = Landscape.Lichen;
    }

    ladder[2] = LADDER_NONE;
    if (wet) {
      if (present & MARSH_GROUPS) ladder[2] = Landscape.Marsh;
    } else if (soilOk) {
      if (high && (present & ALPINE_GROUPS)) {
        ladder[2] = Landscape.Alpine;
      } else if (high || t === TempClass.Cold) {
        if (present & TUNDRA_GROUPS) ladder[2] = Landscape.Tundra;
        else if (present & MO) ladder[2] = Landscape.Moss;
      } else if (present & GR) {
        ladder[2] = t === TempClass.Cool
          ? ((present & BL) && m >= MoistClass.Moist ? Landscape.Meadow : Landscape.Steppe)
          : Landscape.Savanna;
      } else if (present & (dryWarm && cacti ? FERN_GROUPS & ~BL : FERN_GROUPS)) {
        ladder[2] = Landscape.Fernland;
      } else if (present & MO) {
        // Mosses only grow where it stays damp, so where they do, the
        // ground is wet enough for a carpet of them.
        ladder[2] = Landscape.Moss;
      }
    }

    ladder[3] = LADDER_NONE;
    ladder[4] = LADDER_NONE;
    const woody = (present & woodyMask) !== 0;
    if (wet) {
      if (woody) ladder[4] = Landscape.Swampforest;
    } else if (soilOk && !high && woody) {
      ladder[3] = Landscape.Shrubland;
      if (t === TempClass.Cold) ladder[4] = (present & NA) ? Landscape.Taiga : Landscape.Forest;
      else if (t === TempClass.Cool) ladder[4] = (present & LB) || !(present & NA) ? Landscape.Forest : Landscape.Taiga;
      else if (t === TempClass.Tropical && m >= MoistClass.Humid && (present & LB)) {
        ladder[4] = (z & ZONE_MOUNTAIN) ? Landscape.Cloudforest : Landscape.Rainforest;
      } else ladder[4] = Landscape.Forest;
    }

    let climax: number;
    if (z & ZONE_BARE) climax = 0;
    else if (wet) climax = 4;
    else if (m === MoistClass.Dry) climax = t === TempClass.Cold ? 1 : 0;
    else if (high) climax = 2;
    // Cold air holds little water: from moderate moisture on it carries
    // forest (spec §3.4 starts at humid; tuned so the habitat shares stay
    // close to the old rule "cold and woody is taiga").
    else if (t === TempClass.Cold) climax = m >= MoistClass.Moderate ? 4 : 2;
    else if (m === MoistClass.Semi) climax = t >= TempClass.Warm ? 1 : 2;
    else if (m <= MoistClass.Moist) climax = t >= TempClass.Cool && !(present & GR) && woody ? 3 : 2;
    else climax = 4;
    // Woody plants with nothing to make open land of: scrub, not bare ground.
    if (climax === 2 && ladder[2] === LADDER_NONE && ladder[3] !== LADDER_NONE) climax = 3;

    // On soil the pioneer crust is skipped where something can follow it:
    // Rohboden turns straight into open land (secondary succession, §3.5).
    if (soilOk && ladder[1] === Landscape.Lichen) {
      for (let k = 2; k <= climax; k++) {
        if (ladder[k] !== LADDER_NONE) { ladder[1] = LADDER_NONE; break; }
      }
    }
    return climax;
  }

  /** Highest stage of a filled ladder at or below the climax level. */
  export function ladderTarget(climax: number, ladder: Uint8Array | number[]): Landscape {
    if (climax === -1) return Landscape.Ice;
    if (climax === -2) return Landscape.Snow;
    for (let k = climax; k > 0; k--) if (ladder[k] !== LADDER_NONE) return ladder[k] as Landscape;
    return ladder[0] as Landscape;
  }

  /** Bit mask of every stage on the ladder up to the climax level. */
  export function ladderMask(climax: number, ladder: Uint8Array | number[]): number {
    if (climax === -1) return 1 << Landscape.Ice;
    if (climax === -2) return 1 << Landscape.Snow;
    let mask = 0;
    for (let k = 0; k <= climax; k++) if (ladder[k] !== LADDER_NONE) mask |= 1 << ladder[k];
    return mask;
  }

  const scratchLadder = [0, 0, 0, 0, 0];

  /** The climax landscape for a zone, plant groups and soil (spec §3.4). */
  export function landscapeTarget(z: number, present: number, soilOk: boolean): Landscape {
    return ladderTarget(fillLadder(z, present, soilOk, scratchLadder), scratchLadder);
  }

  /**
   * The next stage on the way from `cur` to `target`: one level at a time,
   * through whatever the ladder holds in between, sideways in one step.
   * Ice and snow first give way to bare ground (Gletschervorfeld).
   */
  export function stepToward(cur: Landscape, target: Landscape, ladder: Uint8Array | number[]): Landscape {
    if (cur === target) return cur;
    if (cur === Landscape.Ice || cur === Landscape.Snow) {
      return LANDSCAPE_LEVEL[target] === 0 ? target : ladder[0] as Landscape;
    }
    const lc = LANDSCAPE_LEVEL[cur];
    const lt = LANDSCAPE_LEVEL[target];
    if (lc < lt) {
      for (let k = lc + 1; k < lt; k++) if (ladder[k] !== LADDER_NONE) return ladder[k] as Landscape;
    } else if (lc > lt) {
      for (let k = lc - 1; k > lt; k--) if (ladder[k] !== LADDER_NONE) return ladder[k] as Landscape;
    }
    return target;
  }

  /** Habitat (one of the 11 biomes) of a land tile's landscape in its zone (spec §3.3). */
  export function landscapeHabitat(l: Landscape, z: number): Biome {
    const t = zoneTemp(z);
    const cold = t <= TempClass.Cold;
    switch (l) {
      case Landscape.Lichen:
      case Landscape.Moss:
        return cold ? Biome.Tundra : Biome.Grass;
      case Landscape.Forest:
        if (cold) return Biome.Boreal;
        return t === TempClass.Tropical && zoneMoist(z) >= MoistClass.Humid ? Biome.Jungle : Biome.Forest;
      default:
        return HABITAT[l];
    }
  }
}
