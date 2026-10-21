/* =============================================================================
 * SimEarth 2.0 — constants, enums and the data tables that drive everything
 * -----------------------------------------------------------------------------
 * Terminology follows SimEarth: The Living Planet (Maxis, 1990) where the
 * original still holds up, and real biology where it does not. Player-facing
 * strings are German; identifiers and comments stay English.
 *
 * The evolution tree itself — which lineage descends from which, what habitat
 * and food each step needs, what it costs and what it does — lives in
 * evolution.ts. This file only carries the per-class simulation tuning.
 * ========================================================================== */

namespace SE {
  /* ---------------------------------------------------------------- world -- */

  /**
   * The planet is 256x128: X wraps (cylinder), Y is clamped at the poles.
   *
   * Every constant expressed *per tile* rather than per unit of planet has to be
   * re-derived when this changes — see MOISTURE_TRANSMISSION, DRIFT_SPEED_BASE
   * and the disaster brush radii, all of which carry a note saying so.
   */
  export const GRID_W = 256;
  export const GRID_H = 128;
  export const TILE_COUNT = GRID_W * GRID_H;

  /**
   * Fraction of the surface below sea level on a freshly generated planet,
   * unless the player picks another share. The mantle field is always cut at
   * this value so volcanism does not shift with the sea.
   */
  export const OCEAN_FRACTION = 0.58;
  /** The range the player may choose for a new planet's sea share. */
  export const OCEAN_SHARE_MIN = 0.30;
  export const OCEAN_SHARE_MAX = 0.85;

  /** Elevation 1.0 corresponds to this many kilometres above sea level. */
  export const ELEVATION_KM = 4.5;
  /** Degrees Celsius lost per kilometre of altitude. */
  export const LAPSE_RATE = 6.5;

  /**
   * Depth of the shelf break: water above this is Coast, below it open Ocean.
   * TerrainGenerator.normalize skews depths shallow, so -0.18 lands around a
   * quarter of the water on the shelf.
   */
  export const COAST_DEPTH = -0.18;

  /** Elevation above which a peak carries permanent snow (purely graphic). */
  export const SNOW_LINE = 0.78;

  /** Safety valve so a backgrounded tab cannot spiral on catch-up ticks. */
  export const MAX_TICKS_PER_FRAME = 64;
  /** A frame runs further due ticks only while it has spent less than this, ms (the first always runs). */
  export const SIM_BUDGET_MS = 8;
  /** Tick intervals the game loop may still owe after a frame; beyond that the planet runs slower than set. */
  export const SIM_BACKLOG_TICKS = 2;

  /* --------------------------------------------------------------- colour -- */

  export type Rgb = readonly [number, number, number];

  /**
   * The standard 16-colour EGA palette, kept for the few UI colours that still
   * name it. The tile view's own palette is SPRITE_PALETTE in sprites.ts.
   */
  export const EGA = {
    black: [0, 0, 0] as Rgb,
    blue: [0, 0, 170] as Rgb,
    green: [0, 170, 0] as Rgb,
    cyan: [0, 170, 170] as Rgb,
    red: [170, 0, 0] as Rgb,
    magenta: [170, 0, 170] as Rgb,
    brown: [170, 85, 0] as Rgb,
    lightGray: [170, 170, 170] as Rgb,
    darkGray: [85, 85, 85] as Rgb,
    lightBlue: [85, 85, 255] as Rgb,
    lightGreen: [85, 255, 85] as Rgb,
    lightCyan: [85, 255, 255] as Rgb,
    lightRed: [255, 85, 85] as Rgb,
    lightMagenta: [255, 85, 255] as Rgb,
    yellow: [255, 255, 85] as Rgb,
    white: [255, 255, 255] as Rgb,
  };

  /* --------------------------------------------------------------- biomes -- */

  /**
   * Habitats. A biome is the *structure* of a place — wet, dry, wooded, open —
   * derived each tick from the tile's landscape (src/landscape.ts), which in
   * turn follows climate and the plant groups growing there.
   *
   * Water zones come first and stay contiguous, so "biome index below
   * WATER_BIOME_COUNT" is the test for wet. Tundra was appended last so that
   * every index a version-4 save wrote still means the same thing.
   */
  export enum Biome {
    Coast = 0,
    Ocean = 1,
    Rock = 2,
    Arctic = 3,
    Boreal = 4,
    Desert = 5,
    Grass = 6,
    Forest = 7,
    Jungle = 8,
    Swamp = 9,
    Tundra = 10,
  }
  export const BIOME_COUNT = 11;
  /** Biomes 0..N-1 are water. */
  export const WATER_BIOME_COUNT = 2;

  /**
   * "Grass" is shown as Offenland: open, low vegetation. Grasses proper are a
   * late flowering-plant group, and calling a moss-covered plain "grassland"
   * three hundred million years before grass existed would be exactly the kind
   * of contradiction the tree is meant to avoid.
   */
  export const BIOME_NAMES: readonly string[] = [
    'Küstenmeer', 'Hochsee', 'Fels', 'Eis', 'Nadelwald',
    'Wüste', 'Offenland', 'Wald', 'Regenwald', 'Sumpf', 'Tundra',
  ];

  /** File stem under assets/habitats/ for each biome. */
  export const BIOME_ICONS: readonly string[] = [
    'coast', 'ocean', 'rock', 'arctic', 'boreal',
    'desert', 'grass', 'forest', 'jungle', 'swamp', 'tundra',
  ];

  /** Base colour per biome, used by the Map window and legends. */
  export const BIOME_COLORS: readonly Rgb[] = [
    [48, 136, 180],  // Coast: the pixel map's coastal sea (water4)
    [24, 78, 136],   // Ocean: its open ocean (water2)
    [160, 155, 142], // Rock
    [232, 240, 240], // Arctic
    [36, 98, 78],    // Boreal
    [224, 198, 142], // Desert
    [124, 168, 84],  // Offenland
    [52, 120, 56],   // Forest
    [46, 150, 72],   // Jungle
    [98, 128, 62],   // Swamp
    [150, 156, 128], // Tundra
  ];

  /**
   * Shortwave reflectivity per biome — drives the ice-albedo feedback. The two
   * water figures average to 0.09 at the coast/open-water split COAST_DEPTH
   * produces, which is what the climate was calibrated against.
   */
  export const BIOME_ALBEDO: readonly number[] = [
    0.120, // Coast
    0.065, // Ocean
    0.25,  // Rock
    0.50,  // Arctic
    0.14,  // Boreal
    0.32,  // Desert
    0.20,  // Offenland
    0.16,  // Forest
    0.12,  // Jungle
    0.14,  // Swamp
    0.22,  // Tundra
  ];

  /* ----------------------------------------------- landscapes, succession -- */
  /*
   * The landscape of a land tile (src/landscape.ts) is read off its smoothed
   * climate on the matrix of docs/biomes-spec.md §3.4. Boundaries in °C
   * between frozen | cold | cool | warm | tropical, and in moisture between
   * dry | semi-arid | moderate | moderate-moist | humid | wet.
   */
  export const FROZEN_TEMP = -12;
  export const COLD_TEMP = 4;
  export const COOL_TEMP = 14;
  /**
   * Where warm becomes tropical (rainforest), read off the smoothed
   * sea-level temperature (docs/hoehe-spec.md E5). The equatorial land lies
   * well above it (±10°: 10th percentile 26 °C, seed 777 at 21 Ma),
   * highland included; at 20 °C half of the 15-30° band (median 20.6 °C)
   * turned to rainforest.
   */
  export const TROPICAL_TEMP = 24;
  export const MOISTURE_BOUNDS: readonly number[] = [0.16, 0.24, 0.30, 0.38, 0.50];
  /**
   * Fixed tree line of the old rule, kept for the legacy SVG renderer and the
   * city sites. The landscapes use the altitude belts below.
   */
  export const TREE_LINE = 0.5;
  /**
   * Altitude belts (docs/hoehe-spec.md §3.6): land at or above this elevation
   * is mountain, where the tile's own temperature decides tree line, rock belt
   * and snow line. The game knows annual means only, so the thresholds are
   * set by where the lines lie (tools/relief-probe.js), not by growing-season
   * temperatures: tree line on the line about 2 km high at 40-50° and 3 km
   * and more in the tropics (spec: 1.7-2.4 / 3.0-4.0 km). From 0 °C it lay
   * 0.4-0.6 km too low. A whole tile is under snow all year only where it is
   * far colder: from -6 to -12 °C summit snow covered 3-18 % of the land and
   * cooled the colder planets through its albedo into ice ages (seed 2718 on
   * the higher relief: 51 % ice, 8.6 °C; at -15 °C: 3 % snow, 15 °C). Alpine
   * meadow and rock belt are about 0.9 km each.
   */
  export const ALPINE_MIN_ELEVATION = 0.2;
  /** Hill country ("Bergland") begins at about 500 m: no beach from here up. */
  export const UPLAND_ELEVATION = 0.11;
  export const TREELINE_TEMP = -3;
  export const ROCKBELT_TEMP = -9;
  export const SNOW_TEMP = -15;
  /** Degrees colder the snow line needs in dry air (moisture class dry): it lies higher there. */
  export const SNOW_DRY_SHIFT = 2;
  /**
   * Mean height (3 × 3 land block) from which a summit the player raised
   * (`WorldState.terraformed`) carries snow whatever the climate, as
   * equatorial peaks do above ~4.8 km (Kilimanjaro, Rwenzori, Andes). The
   * elevation scale ends at 4.5 km: 3.8 km of block mean is a summit at the
   * top of it. 0.9 left a brushed peak a one- or two-tile cap the coherence
   * filter took back. Not in dry air (moisture class dry). Natural relief
   * keeps the climate snow line alone.
   */
  export const SUMMIT_SNOW_ELEVATION = 0.85;
  /*
   * Rain shadow (docs/hoehe-spec.md §3.5): air that has crossed a crest
   * sinks, warms and dries. The crest's elevation (LEE_MIN_CREST: none,
   * LEE_FULL_CREST: full) falls by LEE_DECAY per tile behind it; a tile
   * LEE_FULL_DROP or more below it gets that share of LEE_DRYING (below 1) less rain;
   * the air carries its vapour on (ClimateSystem.updateMoisture). Measured
   * on seed 777 at 21 Ma: 0.3 puts the lee a moisture class drier behind 53 %
   * of the crests over 2 km (67 % where the windward side is not arid
   * already), 0.6 only 55 %, but greens less land.
   */
  export const LEE_MIN_CREST = 0.25;
  export const LEE_FULL_CREST = 0.5;
  export const LEE_FULL_DROP = 0.05;
  export const LEE_DECAY = 0.06;
  export const LEE_DRYING = 0.3;
  /** Ticks between two recomputations of the rain shadow: the relief moves far slower. */
  export const LEE_REFRESH_TICKS = 8;
  /** Standing water on flat ground: wetland (substrate Moor). */
  export const WETLAND_MOISTURE = 0.70;
  export const WETLAND_MAX_ELEVATION = 0.14;
  /** Plant cover below which land is bare (Fels, Rohboden or Wüste). */
  export const BARE_COVER = 0.12;
  /** Schmitt-trigger bands, each in favour of a tile's current class. */
  export const SCHMITT_TEMP = 1.5;
  export const SCHMITT_MOISTURE = 0.03;
  export const SCHMITT_ELEVATION = 0.02;
  export const SCHMITT_COVER = 0.04;
  /** Half-width of the box climate and plant cover are averaged over for the landscape (7×7). */
  export const LANDSCAPE_SMOOTH_RADIUS = 3;
  /** Plant cover at which open land turns medium and dense; forests use the upper one. */
  export const DENSITY_BOUNDS: readonly number[] = [0.30, 0.60];
  export const DENSITY_BAND = 0.04;
  /** Below this moisture and elevation bare lowland is sand. */
  export const SAND_MOISTURE = 0.24;
  export const SAND_MAX_ELEVATION = 0.15;

  /** Soil maturity (0..1) from which the ground counts as Erde. */
  export const SOIL_EARTH = 0.35;
  /**
   * What mosses and the first land plants build on their own: a thin crust.
   * Just above SOIL_EARTH so a moss carpet can follow lichen on rock.
   */
  export const SOIL_CRUST_MAX = 0.38;
  /** Soil built per tick at full plant cover (geologic ticks). */
  export const SOIL_BUILD_RATE = 0.08;
  /** Soil lost per tick on bare ground, before the slope adds to it. */
  export const SOIL_EROSION_RATE = 0.01;
  /** Erosion multiplier per unit of elevation difference to the steepest neighbour. */
  export const SOIL_SLOPE_FACTOR = 10;
  /** Soil an ice sheet scrapes off per tick down to the till (SOIL_REGOLITH), or grinds bare rock to till. */
  export const SOIL_ICE_SCOUR = 0.05;
  /**
   * Regolith: what weathering makes of bare rock without plants, just above
   * SOIL_EARTH so weathered land counts as Rohboden. Slopes and ice never
   * strip it; only lava and impacts bare the rock again (hoehe-spec §3.7).
   */
  export const SOIL_REGOLITH = 0.4;
  /** Regolith weathered per tick at SOIL_WEATHER_REF_TEMP and SOIL_WEATHER_REF_MOIST. */
  export const SOIL_WEATHER_RATE = 0.012;
  /** Weathering scales linearly with temperature from this (frost shattering still works below it)... */
  export const SOIL_WEATHER_COLD = -10;
  /** ...reaching the full rate here; and linearly with moisture up to the reference. */
  export const SOIL_WEATHER_REF_TEMP = 15;
  export const SOIL_WEATHER_REF_MOIST = 0.3;
  /** Bounds of each factor: cold or dry rock still weathers, warm and wet rock no faster than this. */
  export const SOIL_WEATHER_MIN = 0.5;
  export const SOIL_WEATHER_MAX = 1.5;
  /**
   * The evolution step from which bare rock weathers to regolith. Before the
   * first land plants the young Earth stays Fels: on the real Earth soils
   * only formed once plants had reached the land, and on the map an early
   * brown Rohboden read as plant cover that was not there.
   */
  export const REGOLITH_AFTER_STEP = 'landPlants';
  /**
   * Years soil processes need to run their per-tick rates in full. Shorter
   * ticks (Civilization, Technology) scale the rates down, so soil forms
   * and wears in real years there.
   */
  export const SOIL_YEARS = 1000;
  /** Soil a migrated planet is assumed to have per unit of rooted plant cover. */
  export const SOIL_ROOT_FACTOR = 1.5;

  /** Minimum ticks a tile holds a stage before the next one (spec §6.3). */
  export const SUCCESSION_MIN_HOLD = 3;
  /** Extra ticks the per-tile hash adds to the minimum hold (0..this). */
  export const SUCCESSION_HOLD_SPREAD = 2;
  /** ± share by which the per-tile hash spreads holds measured in real years. */
  export const SUCCESSION_YEAR_SPREAD = 0.3;
  /** Neighbours already at the next stage that make a tile a front (halved hold). */
  export const SUCCESSION_FRONT = 3;
  /**
   * The landscape filters revisit every n-th row each tick besides the tiles
   * that just changed, so a lone tile is never left alone for long.
   */
  export const SUCCESSION_SWEEP_ROWS = 8;
  /**
   * Ticks between two recomputations of the climax targets in a running
   * game; stepping and the landscape filters run every tick. The climate
   * moves far slower than a hold of three or more ticks.
   */
  export const SUCCESSION_TARGET_INTERVAL = 2;
  /** Rounds of the mode filter on the targets. */
  export const SUCCESSION_MODE_PASSES = 2;

  /* ---------------------------------------------------------------- flora -- */

  /**
   * Plant groups. Plants are not individual populations like the animals:
   * each tile carries a bitmask of the groups growing there (`WorldState.flora`)
   * plus one continuous cover value (`vegetation`). Bit n is group n, so the
   * enum doubles as the bit index and must stay below 16.
   *
   * These are *stable identifiers* — a save stores the mask bits directly.
   * Append, never reorder.
   */
  export enum Flora {
    None = 0,
    MarineAlgae = 1,
    FreshwaterAlgae = 2,
    LandPlants = 3,
    Mosses = 4,
    Vascular = 5,
    Clubmosses = 6,
    Ferns = 7,
    FirstTrees = 8,
    SeedPlants = 9,
    Conifers = 10,
    Flowering = 11,
    Broadleaf = 12,
    Grasses = 13,
    Carnivorous = 14,
  }
  export const FLORA_COUNT = 15;

  /** Bit for one flora group in a tile mask. */
  export function floraBit(g: Flora): number {
    return 1 << g;
  }

  /** Where a plant group can grow at all. */
  export type FloraRealm = 'sea' | 'fresh' | 'land';

  export interface FloraDef {
    readonly id: string;
    readonly name: string;
    readonly realm: FloraRealm;
    /** Survivable mean temperature window, °C. */
    readonly temp: readonly [number, number];
    /**
     * Relative wetness (moisture over what the air could hold at that
     * temperature) where the group starts to grow and where it is at home.
     * Relative, so a cold tundra with little absolute water still reads as wet
     * for a moss, and a hot coast with plenty of water can still be too dry.
     */
    readonly wet: readonly [number, number];
    /**
     * How much the group depends on open water next door — a shore, a river
     * bank or a wetland. 1 means it cannot grow without it, 0 not at all.
     */
    readonly needsWater: number;
    /** Elevation (0..1) above which the group thins out. */
    readonly maxElevation: number;
    /** The densest cover the group sustains on its own, 0..1. */
    readonly stature: number;
    /** Forms woodland: lets a tile read as forest, taiga or rainforest. */
    readonly woody: boolean;
    /** Per-tick chance a tile hands the group to a suitable neighbour. */
    readonly spread: number;
    /** Long-range dispersal attempts per tick (spores, seeds, birds). */
    readonly jumps: number;
    /** Map colour of the group's cover on the Life/Flora map. */
    readonly color: Rgb;
  }

  /*
   * Envelopes are deliberately simple — a temperature window, a wetness ramp,
   * a dependence on water next door, an altitude ceiling — because the order
   * the planet greens in falls straight out of them: the first land plants
   * can only grow on wet shores, mosses where it stays damp, vascular plants
   * along rivers, and only seed plants, conifers and grasses reach the dry
   * interior. No special-case code anywhere decides that.
   */
  export const FLORA: Readonly<Record<Flora, FloraDef>> = {
    [Flora.None]: {
      id: 'none', name: 'Keine', realm: 'land', temp: [0, 0], wet: [1, 1], needsWater: 0,
      maxElevation: 0, stature: 0, woody: false, spread: 0, jumps: 0, color: [0, 0, 0],
    },
    [Flora.MarineAlgae]: {
      id: 'marineAlgae', name: 'Meeresalgen', realm: 'sea', temp: [-4, 34], wet: [0, 0],
      needsWater: 0, maxElevation: 0, stature: 0.8, woody: false, spread: 0.10, jumps: 2,
      color: [70, 150, 90],
    },
    [Flora.FreshwaterAlgae]: {
      id: 'freshwaterAlgae', name: 'Süßwasser-Grünalgen', realm: 'fresh', temp: [0, 38], wet: [0.55, 0.8],
      needsWater: 1, maxElevation: 0.6, stature: 0.14, woody: false, spread: 0.10, jumps: 2,
      color: [90, 190, 150],
    },
    [Flora.LandPlants]: {
      id: 'landPlants', name: 'Erste Landpflanzen', realm: 'land', temp: [0, 40], wet: [0.5, 0.8],
      needsWater: 1, maxElevation: 0.3, stature: 0.26, woody: false, spread: 0.08, jumps: 1,
      color: [120, 190, 90],
    },
    [Flora.Mosses]: {
      id: 'mosses', name: 'Moose', realm: 'land', temp: [-22, 32], wet: [0.5, 0.82],
      needsWater: 0.35, maxElevation: 0.9, stature: 0.36, woody: false, spread: 0.06, jumps: 2,
      color: [160, 196, 70],
    },
    [Flora.Vascular]: {
      id: 'vascular', name: 'Frühe Gefäßpflanzen', realm: 'land', temp: [0, 40], wet: [0.5, 0.78],
      needsWater: 0.6, maxElevation: 0.45, stature: 0.5, woody: false, spread: 0.06, jumps: 1,
      color: [96, 170, 80],
    },
    [Flora.Clubmosses]: {
      id: 'clubmosses', name: 'Bärlapppflanzen', realm: 'land', temp: [6, 40], wet: [0.66, 0.9],
      needsWater: 0.7, maxElevation: 0.25, stature: 0.86, woody: true, spread: 0.05, jumps: 1,
      color: [60, 130, 70],
    },
    [Flora.Ferns]: {
      id: 'ferns', name: 'Farne & Schachtelhalme', realm: 'land', temp: [2, 38], wet: [0.48, 0.78],
      needsWater: 0.15, maxElevation: 0.55, stature: 0.7, woody: false, spread: 0.05, jumps: 2,
      color: [80, 176, 110],
    },
    [Flora.FirstTrees]: {
      id: 'firstTrees', name: 'Urbäume', realm: 'land', temp: [4, 36], wet: [0.48, 0.74],
      needsWater: 0.1, maxElevation: 0.5, stature: 0.88, woody: true, spread: 0.035, jumps: 1,
      color: [50, 120, 70],
    },
    [Flora.SeedPlants]: {
      id: 'seedPlants', name: 'Samenpflanzen', realm: 'land', temp: [-2, 40], wet: [0.3, 0.6],
      needsWater: 0, maxElevation: 0.6, stature: 0.74, woody: true, spread: 0.045, jumps: 2,
      color: [110, 150, 60],
    },
    [Flora.Conifers]: {
      id: 'conifers', name: 'Nadelbäume', realm: 'land', temp: [-10, 34], wet: [0.28, 0.58],
      needsWater: 0, maxElevation: 0.72, stature: 0.9, woody: true, spread: 0.04, jumps: 2,
      color: [20, 100, 80],
    },
    [Flora.Flowering]: {
      id: 'flowering', name: 'Blütenpflanzen', realm: 'land', temp: [-6, 42], wet: [0.26, 0.6],
      needsWater: 0, maxElevation: 0.6, stature: 0.76, woody: false, spread: 0.06, jumps: 3,
      color: [210, 120, 170],
    },
    [Flora.Broadleaf]: {
      id: 'broadleaf', name: 'Laubbäume', realm: 'land', temp: [0, 40], wet: [0.42, 0.74],
      needsWater: 0, maxElevation: 0.5, stature: 1.0, woody: true, spread: 0.04, jumps: 2,
      color: [40, 150, 50],
    },
    [Flora.Grasses]: {
      id: 'grasses', name: 'Gräser', realm: 'land', temp: [-8, 42], wet: [0.16, 0.42],
      needsWater: 0, maxElevation: 0.6, stature: 0.62, woody: false, spread: 0.07, jumps: 3,
      color: [200, 200, 90],
    },
    [Flora.Carnivorous]: {
      id: 'carnivorous', name: 'Fleischfressende Pflanzen', realm: 'land', temp: [0, 36], wet: [0.72, 0.95],
      needsWater: 0.8, maxElevation: 0.4, stature: 0.34, woody: false, spread: 0.04, jumps: 1,
      color: [200, 80, 80],
    },
  };

  /** Every flora bit that is a land plant. */
  export const LAND_FLORA_MASK = (() => {
    let m = 0;
    for (let g = 1; g < FLORA_COUNT; g++) if (FLORA[g as Flora].realm === 'land') m |= 1 << g;
    return m;
  })();

  /** Every vascular land plant — the "real" vegetation larger animals eat. */
  export const VASCULAR_FLORA_MASK = LAND_FLORA_MASK &
    ~(floraBit(Flora.LandPlants) | floraBit(Flora.Mosses));

  /* ----------------------------------------------------------------- life -- */

  /**
   * Animal (and microbial) classes, each a population per tile.
   *
   * Indices are stable identifiers within a save format. Version 5 saves name
   * them by `LifeDef.id`, so this order may change again later; version 4
   * saves used the original numbers and `SaveSystem` maps them explicitly.
   * Slots 8 and 15 changed meaning in this rework (Trichordate and Carnifern
   * were replaced by real lineages); the migration handles both.
   */
  export enum Life {
    None = 0,
    Prokaryote = 1,
    Eukaryote = 2,
    Radiate = 3,
    Arthropod = 4,
    Mollusc = 5,
    Fish = 6,
    Cetacean = 7,
    LandArthropod = 8,
    Insect = 9,
    Amphibian = 10,
    Reptile = 11,
    Dinosaur = 12,
    Avian = 13,
    Mammal = 14,
    Bilateria = 15,
    Pollinator = 16,
    Grazer = 17,
  }
  export const LIFE_COUNT = 18;

  /**
   * Exactly one suitability per Biome, in enum order. The tuple length is the
   * guard: a row left too short reads back `undefined`, becomes NaN in the
   * Float32 suitability cache and quietly poisons every density it touches.
   */
  export type BiomeSuit = readonly [
    number, number, number, number, number, number,
    number, number, number, number, number,
  ];

  /**
   * What a class eats. The carrying capacity of a tile is multiplied by this,
   * and the evolution tree's food conditions are checked against the same
   * table, so what the tree promises and what the simulation does cannot drift.
   *
   *   plankton  share of the ambient marine plankton base the class lives on
   *   algae     weight of the marine algae growing on the tile
   *   plants    [flora mask, weight] pairs: cover of those groups on the tile
   *   prey      classes eaten, weighted by their density on the same tile
   */
  export interface Diet {
    readonly selfFeeding?: boolean;
    readonly plankton?: number;
    readonly algae?: number;
    readonly plants?: readonly (readonly [number, number])[];
    readonly prey?: readonly Life[];
    readonly preyWeight?: number;
  }

  export interface LifeDef {
    /** Stable string id, shared with the evolution node of the same name. */
    readonly id: string;
    readonly name: string;
    readonly realm: 'sea' | 'land';
    readonly color: Rgb;
    /** Survivable temperature window, degrees Celsius. */
    readonly temp: readonly [number, number];
    /** Oxygen floor in air-percent equivalents; aquatic breathers use dissolved O2. */
    readonly o2Min: number;
    /** How many tiles of open water this class can be carried across. */
    readonly raft: number;
    /** How well the class does in each biome. */
    readonly suit: BiomeSuit;
    readonly diet: Diet;
    /** Can this class become sentient and found cities? */
    readonly sentient: boolean;
    /** Ω cost to place this class with the Place Life tool. */
    readonly cost: number;
  }

  const ANY_LAND_PLANT = LAND_FLORA_MASK;
  const SEED_FOOD = floraBit(Flora.SeedPlants) | floraBit(Flora.Conifers) |
    floraBit(Flora.Flowering) | floraBit(Flora.Broadleaf) | floraBit(Flora.Grasses);
  const FLOWERS = floraBit(Flora.Flowering) | floraBit(Flora.Broadleaf) | floraBit(Flora.Carnivorous);
  const BIG_PLANTS = floraBit(Flora.Ferns) | floraBit(Flora.Clubmosses) |
    floraBit(Flora.SeedPlants) | floraBit(Flora.Conifers) |
    floraBit(Flora.Flowering) | floraBit(Flora.Broadleaf);

  /*
   * Suitability columns:  Cst   Ocn  Rock  Arct  Bore  Dsrt  Offn  Wald  Rgnw  Sumpf Tund
   *
   * Every class needs at least one biome it clearly leads, or the competitive
   * edge decides everything and the planet homogenises. Sea classes score
   * zero on land and vice versa; Arctic covers sea ice and polar land both.
   */
  export const LIFE: Readonly<Record<Life, LifeDef>> = {
    [Life.None]: {
      id: 'none', name: 'Keine', realm: 'sea', color: EGA.black, temp: [0, 0], o2Min: 0, raft: 0,
      suit: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], diet: {}, sentient: false, cost: 0,
    },

    /* ---- sea ---- */
    [Life.Prokaryote]: {
      id: 'cells', name: 'Erste Zellen', realm: 'sea', color: [92, 207, 208], temp: [-20, 95], o2Min: 0, raft: 0,
      suit: [1.00, 0.80, 0, 0.25, 0, 0, 0, 0, 0, 0, 0], diet: { selfFeeding: true },
      sentient: false, cost: 50,
    },
    [Life.Eukaryote]: {
      id: 'eukaryotes', name: 'Komplexe Zellen', realm: 'sea', color: [170, 110, 220], temp: [-12, 60], o2Min: 0.5, raft: 0,
      suit: [1.00, 0.75, 0, 0.20, 0, 0, 0, 0, 0, 0, 0], diet: { selfFeeding: true },
      sentient: false, cost: 80,
    },
    [Life.Radiate]: {
      // Sponges, jellies and coral: filter feeders tied to sunlit shallows.
      id: 'earlyAnimals', name: 'Schwämme & Nesseltiere', realm: 'sea', color: [220, 130, 200], temp: [-4, 42], o2Min: 3, raft: 0,
      suit: [1.00, 0.45, 0, 0.10, 0, 0, 0, 0, 0, 0, 0], diet: { plankton: 1 },
      sentient: false, cost: 120,
    },
    [Life.Bilateria]: {
      // Worms in the sediment: the first animals with a front and a back.
      id: 'bilaterians', name: 'Frühe Zweiseitentiere', realm: 'sea', color: [230, 150, 120], temp: [-4, 40], o2Min: 4, raft: 0,
      suit: [1.00, 0.35, 0, 0.10, 0, 0, 0, 0, 0, 0, 0], diet: { plankton: 0.6, algae: 0.8 },
      sentient: false, cost: 150,
    },
    [Life.Arthropod]: {
      // Bottom-walkers. Almost nothing for them once the shelf drops away.
      id: 'arthropods', name: 'Gliederfüßer des Meeres', realm: 'sea', color: [210, 140, 60], temp: [-4, 40], o2Min: 5, raft: 0,
      suit: [1.00, 0.30, 0, 0.10, 0, 0, 0, 0, 0, 0, 0],
      diet: { plankton: 0.45, algae: 0.9, prey: [Life.Bilateria], preyWeight: 1.5 },
      sentient: false, cost: 200,
    },
    [Life.Mollusc]: {
      // Snails rasp algae off the rocks; cephalopods came later.
      id: 'molluscs', name: 'Weichtiere', realm: 'sea', color: [200, 100, 140], temp: [-3, 38], o2Min: 7, raft: 0,
      suit: [0.95, 0.55, 0, 0.10, 0, 0, 0, 0, 0, 0, 0], diet: { plankton: 0.25, algae: 1.4 },
      sentient: true, cost: 250,
    },
    [Life.Fish]: {
      // Strong in the shallows as well as offshore: every land vertebrate
      // descends from this row, and a descendant can only cross realms from a
      // tile that actually touches land.
      id: 'fish', name: 'Fische', realm: 'sea', color: [90, 170, 230], temp: [-3, 36], o2Min: 9, raft: 0,
      suit: [0.90, 1.00, 0, 0.15, 0, 0, 0, 0, 0, 0, 0],
      diet: { plankton: 0.35, prey: [Life.Arthropod, Life.Mollusc, Life.Bilateria], preyWeight: 2.0 },
      sentient: false, cost: 300,
    },
    [Life.Cetacean]: {
      id: 'whales', name: 'Wale', realm: 'sea', color: [60, 130, 200], temp: [-3, 32], o2Min: 12.5, raft: 0,
      suit: [0.30, 1.00, 0, 0.35, 0, 0, 0, 0, 0, 0, 0],
      diet: { plankton: 0.3, prey: [Life.Fish, Life.Arthropod], preyWeight: 2.0 },
      sentient: true, cost: 350,
    },

    /* ---- land ---- */
    [Life.LandArthropod]: {
      // Millipedes and arachnids: the first animals ashore, living in the
      // damp litter under the first plants. Bare highland is no home to them.
      id: 'landArthropods', name: 'Landgliederfüßer', realm: 'land', color: [180, 150, 110], temp: [-6, 42], o2Min: 8, raft: 6,
      suit: [0, 0, 0.30, 0.02, 0.60, 0.30, 0.70, 0.75, 0.80, 0.90, 0.55],
      diet: { plants: [[ANY_LAND_PLANT, 1.0]] },
      sentient: false, cost: 350,
    },
    [Life.Insect]: {
      id: 'insects', name: 'Insekten', realm: 'land', color: [200, 170, 50], temp: [-6, 45], o2Min: 10, raft: 14,
      suit: [0, 0, 0.15, 0.02, 0.55, 0.50, 0.80, 1.00, 0.90, 0.80, 0.40],
      diet: { plants: [[VASCULAR_FLORA_MASK, 1.0], [ANY_LAND_PLANT, 0.35]] },
      sentient: true, cost: 400,
    },
    [Life.Pollinator]: {
      // Bees and butterflies: wholly dependent on flowers for pollen and nectar.
      id: 'pollinators', name: 'Bienen & Bestäuber', realm: 'land', color: [250, 200, 60], temp: [-2, 42], o2Min: 12, raft: 14,
      suit: [0, 0, 0.10, 0, 0.45, 0.40, 1.00, 0.85, 0.80, 0.55, 0.35],
      diet: { plants: [[FLOWERS, 1.0]] },
      sentient: false, cost: 450,
    },
    [Life.Amphibian]: {
      // Wetland specialist; eats the invertebrates of the bank.
      id: 'amphibians', name: 'Amphibien', realm: 'land', color: [110, 190, 90], temp: [0, 40], o2Min: 11, raft: 0,
      suit: [0, 0, 0.05, 0.00, 0.35, 0.05, 0.45, 0.65, 0.85, 1.00, 0.20],
      diet: { prey: [Life.Insect, Life.LandArthropod], preyWeight: 2.6 },
      sentient: false, cost: 500,
    },
    [Life.Reptile]: {
      // The desert is theirs outright — nothing else tolerates it.
      id: 'reptiles', name: 'Reptilien', realm: 'land', color: [150, 180, 70], temp: [2, 48], o2Min: 12, raft: 10,
      suit: [0, 0, 0.25, 0.00, 0.25, 1.00, 0.85, 0.70, 0.90, 0.60, 0.05],
      diet: {
        prey: [Life.Insect, Life.LandArthropod, Life.Pollinator], preyWeight: 2.0,
        plants: [[floraBit(Flora.SeedPlants) | floraBit(Flora.Conifers) | floraBit(Flora.Ferns) | floraBit(Flora.Flowering), 0.5]],
      },
      sentient: true, cost: 550,
    },
    [Life.Dinosaur]: {
      // Herds on the open plain and in the fern forests.
      id: 'dinosaurs', name: 'Dinosaurier', realm: 'land', color: [130, 150, 60], temp: [6, 44], o2Min: 13, raft: 4,
      suit: [0, 0, 0.10, 0.00, 0.35, 0.45, 1.00, 0.85, 0.85, 0.65, 0.05],
      diet: {
        plants: [[BIG_PLANTS, 1.0]],
        prey: [Life.Reptile, Life.Amphibian, Life.Mammal, Life.Grazer], preyWeight: 1.0,
      },
      sentient: true, cost: 600,
    },
    [Life.Avian]: {
      // Seabirds own the polar shore; elsewhere strong without ruling anywhere.
      id: 'birds', name: 'Vögel', realm: 'land', color: [230, 190, 120], temp: [-25, 42], o2Min: 14, raft: 20,
      suit: [0, 0, 0.30, 0.60, 0.60, 0.40, 0.80, 0.80, 0.80, 0.65, 0.55],
      diet: {
        prey: [Life.Insect, Life.Pollinator, Life.LandArthropod], preyWeight: 2.0,
        plants: [[SEED_FOOD, 0.6]],
      },
      sentient: true, cost: 650,
    },
    [Life.Mammal]: {
      // Fur and warm blood: the only class that makes a real living on the ice.
      id: 'mammals', name: 'Säugetiere', realm: 'land', color: [210, 120, 90], temp: [-35, 44], o2Min: 14, raft: 8,
      suit: [0, 0, 0.25, 0.35, 0.95, 0.40, 0.80, 0.80, 0.65, 0.60, 0.70],
      diet: {
        prey: [Life.Insect, Life.LandArthropod], preyWeight: 1.5,
        plants: [[SEED_FOOD, 0.8]],
      },
      sentient: true, cost: 700,
    },
    [Life.Grazer]: {
      // Hoofed grazers: the open grasslands are what made them.
      id: 'grazers', name: 'Huftiere & Weidetiere', realm: 'land', color: [190, 140, 80], temp: [-20, 42], o2Min: 14, raft: 4,
      suit: [0, 0, 0.10, 0.05, 0.40, 0.45, 1.00, 0.55, 0.40, 0.35, 0.55],
      diet: { plants: [[floraBit(Flora.Grasses), 1.2], [floraBit(Flora.Flowering), 0.3]] },
      sentient: false, cost: 700,
    },
  };

  /* ----------------------------------------------------------- subspecies -- */

  /**
   * Every class runs through eight sub-species, oldest first — a lineage
   * settling in and diversifying over time. Names, dates and pictures live
   * in src/species/; the simulation only counts the stage index.
   */
  export const SUBSPECIES_PER_CLASS = 8;
  export const CYANOBACTERIA_STAGE = 4;
  /**
   * Prokaryote stages with oxygenic photosynthesis: the cyanobacteria and the
   * thrombolites they build. Sulphur and iron bacteria are not oxygenic; the
   * early stromatolites and mats predate it here.
   */
  export const OXYGENIC_STAGE: readonly boolean[] = [false, false, false, false, true, false, false, true];

  /** Largest share of a class that may stand at or above each stage. */
  export const STAGE_MAX_SHARE: readonly number[] = [1.0, 0.8, 0.62, 0.48, 0.36, 0.27, 0.2, 0.14];
  /** Highest mammal stage (the marsupials) until the comet has ended the dinosaurs' era (dinoera.ts). */
  export const MAMMAL_STAGE_BEFORE_COMET = 3;
  /** Tiles a successor and the sub-species after it must hold before the one it succeeds dies out (stagefates.ts); the tree's ECO_MIN_TILES. */
  export const STAGE_SUCCESSOR_TILES = 24;
  /** The hominids: the only mammals that wake up to intelligence on their own (civ.ts). */
  export const HOMINID_STAGE = 7;

  /** True for the marine classes. */
  export function isSeaLife(c: Life): boolean {
    return c !== Life.None && LIFE[c].realm === 'sea';
  }
  /** True for the terrestrial classes. */
  export function isLandLife(c: Life): boolean {
    return c !== Life.None && LIFE[c].realm === 'land';
  }

  /* --------------------------------------------------------- civilization -- */

  export enum Tech {
    None = 0,
    Stone = 1,
    Bronze = 2,
    Iron = 3,
    Industrial = 4,
    Atomic = 5,
    Information = 6,
    Nanotech = 7,
  }
  export const TECH_COUNT = 8;

  export const TECH_NAMES: readonly string[] = [
    'Keine', 'Steinzeit', 'Bronzezeit', 'Eisenzeit', 'Industriezeitalter',
    'Atomzeitalter', 'Informationszeitalter', 'Nanotech-Zeitalter',
  ];

  /** Ω cost of placing a city at each technology level. */
  export const TECH_COST: readonly number[] = [0, 500, 1000, 1500, 2000, 2500, 3000, 3500];

  export const TECH_COLORS: readonly Rgb[] = [
    EGA.black, [120, 60, 40], [160, 100, 40], [190, 140, 60],
    [200, 60, 60], [230, 120, 60], [255, 200, 80], EGA.white,
  ];

  /** Energy demand per city at each tech level. */
  export const TECH_ENERGY: readonly number[] = [0, 0.1, 0.2, 0.4, 1.0, 1.6, 2.2, 3.0];

  /* -------------------------------------------------- civilization tuning -- */
  // Cities, settlers, tribes, epidemics, conflicts: docs/zivilisation-spec.md.

  /** Fewest tiles between two cities, and between a city and a settlers' goal. */
  export const CITY_MIN_DIST = 7;
  /** Radius in tiles of the surroundings that feed a city. */
  export const CITY_UMLAND = 3;
  /** cityPop from which a city counts as a town, and as a metropolis. */
  export const CITY_TOWN_POP = 0.35;
  export const CITY_METRO_POP = 0.7;
  /** A city stands for its surroundings: weight of its people in energy use and breath. */
  export const CITY_WEIGHT = 3;
  /**
   * Millions of people a full city (cityPop 1) stands for, per tech level.
   * With the usual 40–60 cities this lands near Earth's head count of each age:
   * ~5 Mio. in the Stone Age, ~250 Mio. in the Iron Age, ~8000 Mio. today.
   */
  export const CITY_PEOPLE_MIO: readonly number[] = [0, 0.2, 2, 8, 30, 60, 150, 200];
  /** Settler groups under way at once: on the planet, and per tribe. */
  export const SETTLERS_MAX = 5;
  export const SETTLERS_PER_TRIBE = 2;
  /**
   * Ticks between two departures from one city, per tech level. From the
   * industrial age on cities grow in size rather than send settlers.
   */
  export const SETTLER_COOLDOWN: readonly number[] = [40, 40, 40, 40, 500, 600, 700, 800];
  /** People a settler group takes along, and a new city starts with. */
  export const SETTLER_POP = 0.1;
  /** Water tiles in a row that count as open sea. */
  export const OPEN_SEA = 1000;
  /** Path length in tiles a settler group may travel, per tech level. */
  export const SETTLER_RANGE: readonly number[] = [0, 12, 16, 20, 30, 40, 40, 40];
  /** Water tiles in a row it may cross, per tech level; rivers are land. */
  export const SETTLER_WATER: readonly number[] = [0, 2, 3, 6, OPEN_SEA, OPEN_SEA, OPEN_SEA, OPEN_SEA];
  /** At most this many tribes, one colour each. */
  export const TRIBE_MAX = 8;
  /** A new city this far from its tribe's capital, or across water, starts a tribe of its own. */
  export const TRIBE_SPLIT_DIST = 15;
  /** The distance rule founds a people only below this many; the last colours are for crossings and splits. */
  export const TRIBE_FAR_MAX = 6;
  /** Share of the planet's land tiles that city tiles may hold; beyond it settlers stay home. */
  export const CITY_LAND_CAP = 0.006;
  /** Cities of two tribes this close are neighbours: for conflicts and contagion. */
  export const CIV_NEIGHBOUR_DIST = 14;
  /**
   * Conflicts: ticks between two on the planet, and of peace between the same
   * two tribes. The spec asks for a pause of at least 40; at 40 a full planet
   * from the Industrial age on had up to 13 wars in 1000 ticks, at 120 it has
   * at most 4–7 (2500 ticks after sentience; seeds 12345, 2024, 12345 today).
   */
  export const CONFLICT_GAP = 120;
  export const CONFLICT_PEACE = 200;
  /** Ticks both tribes of a conflict (or an atomic strike) rest against everyone, so none fights its neighbours in turn. */
  export const CONFLICT_TRIBE_REST = 150;
  /** Conflicts rest this many ticks after a load. */
  export const CONFLICT_LOAD_CALM = 100;
  /** A city is scarce for a conflict after this many scarcity ticks; its neighbour is full above this share of capacity. */
  export const CONFLICT_SCARCITY = 30;
  export const CONFLICT_FULL = 0.85;
  /** Chance per tick that one pair able to fight goes to war, times the aggression factor (about 1 at the default budget). */
  export const CONFLICT_CHANCE = 0.025;
  /** Fewest and most ticks a conflict lasts. */
  export const CONFLICT_TICKS: readonly [number, number] = [6, 12];
  /** A city's strength is its population × (1 + this × its tech level). */
  export const CONFLICT_TECH_EDGE = 0.25;
  /** Share of its people the loser loses, and the winner. */
  export const CONFLICT_LOSS = 0.3;
  export const CONFLICT_WIN_LOSS = 0.1;
  /**
   * The loser's city is taken at this strength ratio or with fewer people left
   * than CONFLICT_TAKE_POP; destroyed below CONFLICT_RUIN_POP. The spec's 2.5
   * was meant for one city against another; with every city at the front
   * counted, fronts mostly stand at 1–2, and 2.5 left 17 of 18 wars without
   * any change (seeds 12345 and 2024).
   */
  export const CONFLICT_TAKE_RATIO = 1.5;
  export const CONFLICT_TAKE_POP = 0.12;
  export const CONFLICT_RUIN_POP = 0.05;
  /** Atomic war: fewest cities at the Atomic level or higher, in two tribes or more, and the chance per tick and unit of aggression. */
  export const ATOMIC_WAR_CITIES = 4;
  export const ATOMIC_WAR_CHANCE = 0.00035;

  /** Food a landscape yields, 0..1, by `Landscape`; 0 on ground no city may stand on. */
  export const CITY_FERTILITY: readonly number[] = [
    0, 0, 0, 0, 0,           // ice, snow, rock, barren, desert
    0.15, 0.2, 0.25, 0.6,    // lichen, moss, tundra, fernland
    0.85, 1.0, 0.85, 0.3,    // steppe, meadow, savanna, semidesert
    0.7, 0.9, 0.5, 0.55,     // shrubland, forest, taiga, rainforest
    0.5, 0.45,               // marsh, swamp forest
    0.1, 0.4,                // alpine meadow, cloud forest
  ];
  /** Share of its food land yields on raw soil, and the soil maturity (0..1) from which it yields in full. */
  export const CITY_SOIL_MIN = 0.4;
  export const CITY_SOIL_FULL = 0.7;
  /** Temperature in °C at which land yields most, and the distance from it at which it yields nothing. */
  export const CITY_TEMP_BEST = 16;
  export const CITY_TEMP_SPAN = 34;
  /** Food factor of a tile with a river. */
  export const CITY_RIVER_YIELD = 1.5;
  /** Stone-age capacity a site needs for a species to wake up there, and for its bands to settle before their demands relax. */
  export const SENTIENCE_SITE_CAPACITY = 0.3;
  /** Food of a water tile in the surroundings (fishing), per tech level. */
  export const CITY_FISHING: readonly number[] = [0.15, 0.15, 0.15, 0.3, 0.35, 0.4, 0.4, 0.4];
  /** Share of the surroundings' food a city can use (farming, irrigation, industry), per tech level. */
  export const CITY_TECH_YIELD: readonly number[] = [0, 0.75, 0.85, 1.0, 1.2, 1.3, 1.4, 1.5];
  /** Ticks between two capacity updates; plate drift updates at once. */
  export const CITY_CAPACITY_EVERY = 10;
  /** Logistic growth rate of a city per tick, per tech level. */
  export const CITY_GROWTH: readonly number[] = [0, 0.012, 0.013, 0.014, 0.02, 0.02, 0.02, 0.02];
  /** Below this population a city is abandoned. */
  export const CITY_ABANDON_POP = 0.03;
  /** Site score: river on the tile, river beside it, coast, weight of the surroundings' food, slope. */
  export const SITE_RIVER = 0.6;
  export const SITE_RIVER_NEAR = 0.3;
  export const SITE_COAST = 0.3;
  export const SITE_FOOD = 0.35;
  export const SITE_SLOPE = 3;
  /** A settlers' site is chosen by its score minus this per tile of path. */
  export const SETTLER_PATH_COST = 0.02;
  /** Settlers only go where the score reaches this: a river, a coast or very fertile land. */
  export const SITE_MIN_SCORE = 0.18;
  /** Settlers leave a city at this share of its capacity, and with at least this population. */
  export const SETTLER_DEPART_SHARE = 0.9;
  export const SETTLER_DEPART_POP = 0.25;
  /** Radius in which settlers whose site was taken look for another. */
  export const SETTLER_DODGE = 2;
  /** Ticks before a city that found no site for settlers looks again. */
  export const SETTLER_RETRY = 120;
  /**
   * Chance per tick that the planet invents the next tech level, per current
   * level: shared among the peoples by population, each rolling in its leading
   * city. It is full once the planet has TECH_CIVILIZATION cities for the
   * level and falls with the square of the share below, so each age lasts
   * until the civilization has grown into it.
   */
  export const TECH_ADVANCE: readonly number[] = [0, 0.01, 0.006, 0.004, 0.003, 0.003, 0.003, 0];
  export const TECH_CIVILIZATION: readonly number[] = [0, 4, 8, 14, 20, 20, 20, 20];
  /** Fewest cities on the planet before anyone invents the next level, per current level: bronze takes a few villages. */
  export const TECH_CITIES_MIN: readonly number[] = [0, 3, 1, 1, 1, 1, 1, 1];
  /** Share of its own cities a people's best tech level must have reached before it invents the next. */
  export const TECH_SPREAD_SHARE = 0.5;
  /**
   * An isolated people (no site for its settlers, all on one landmass within
   * this many steps over land) invents at the full rate, for this many ticks
   * after its last failed search for a site.
   */
  export const TECH_ISOLATION_REACH = 40;
  export const TECH_ISOLATION_HOLD = 240;
  /** Fewest people a city needs to invent. */
  export const TECH_ADVANCE_MIN_POP = 0.2;
  /**
   * Fewest ticks between two new top levels on the planet. Waiting times are
   * exponential, so without it about 5 % of games skipped an age in under 15 ticks.
   */
  export const TECH_MIN_AGE = 100;
  /** Chance per tick that a city behind its tribe's best tech level catches up one level. */
  export const TECH_EXCHANGE = 0.02;
  /** Chance per tick that a city learns the next level from a city of another people within CIV_NEIGHBOUR_DIST. */
  export const TECH_TRADE = 0.005;
  /** Rare split: least age of the city, least distance to the capital, chance per people and check, ticks between checks. */
  export const TRIBE_SPLIT_AGE = 300;
  export const TRIBE_SPLIT_MIN_DIST = 8;
  export const TRIBE_SPLIT_CHANCE = 0.01;
  export const TRIBE_SPLIT_EVERY = 10;
  /** Hunger: share of the population over capacity lost per tick. */
  export const HUNGER_RATE = 0.1;
  /** Epidemic chance per tick of a scarce city at full capacity, and the scarcity ticks that double it. */
  export const EPIDEMIC_RISK = 0.002;
  export const EPIDEMIC_SCARCITY = 60;
  /** Highest factor scarcity raises the risk by. */
  export const EPIDEMIC_SCARCITY_MAX = 4;
  /** An outbreak: share lost at once, share lost per tick after, and for how many ticks. */
  export const EPIDEMIC_HIT = 0.25;
  export const EPIDEMIC_DECAY = 0.03;
  export const EPIDEMIC_TICKS = 5;
  /** Chance per tick of an outbreak to jump to one of the cities within CIV_NEIGHBOUR_DIST. */
  export const EPIDEMIC_SPREAD = 0.06;
  /** Share of the epidemic risk a city keeps by tech level: hygiene, then modern medicine (times the slider's cut). */
  export const EPIDEMIC_TECH: readonly number[] = [0, 1, 1, 1, 0.3, 0.15, 0.1, 0.06];
  /** Ticks a city stays immune after an outbreak. */
  export const EPIDEMIC_IMMUNITY = 150;
  /** From the Industrial age medicine cuts the risk by this share at slider 0, and at slider 1. */
  export const EPIDEMIC_MEDICINE: readonly [number, number] = [0.3, 0.8];
  /** Ticks the plague marker shows on a city. */
  export const EPIDEMIC_MARK_TTL = 12;
  /** Ticks between two messages of the same kind. */
  export const CIV_NEWS_GAP = 30;
  /** Wandering bands before the first villages (src/bands.ts): how many set out, within this many steps of the first site. */
  export const BAND_COUNT = 3;
  export const BAND_SPAWN_RANGE = 6;
  /** Fewest tiles between a band and another band's camp or goal. */
  export const BAND_SPACING = 3;
  /** People a band carries; the village it founds starts with them. */
  export const BAND_POP = 0.12;
  /** Fewest and most ticks a camp stands, and steps over land to the next camp. */
  export const BAND_CAMP_TICKS: readonly [number, number] = [12, 20];
  export const BAND_LEG: readonly [number, number] = [4, 8];
  /** Camps a band remembers; a site near one of them, or near a city, scores this much less. */
  export const BAND_CAMPS_KEPT = 4;
  export const BAND_REVISIT = 0.4;
  export const BAND_CITY_AVOID = 0.5;
  /** Most random score added to a camp site, so bands roam rather than climb to the one best site. */
  export const BAND_JITTER = 0.15;
  /** Score added to a site the band may settle at. */
  export const BAND_SETTLE_BONUS = 1;
  /**
   * Ticks a band wanders before it settles at a site with water and
   * SENTIENCE_SITE_CAPACITY; from BAND_RELAX_AFTER any allowed site with
   * BAND_RELAX_CAPACITY will do, from BAND_SETTLE_MAX any allowed site, and
   * with none in reach it joins the nearest village.
   */
  export const BAND_SETTLE_AFTER = 90;
  export const BAND_RELAX_AFTER = 160;
  export const BAND_RELAX_CAPACITY = 0.15;
  export const BAND_SETTLE_MAX = 240;

  /* ------------------------------------------- giant clubmosses and coal -- */
  // src/lycopsids.ts and src/coal.ts.

  /** Random tiles per tick that clubmoss spores reach anywhere on the planet while the giants live. */
  export const CLUBMOSS_SPORE_SAMPLES = 40;
  /** Chance a spore takes root on a tile that suits clubmosses at least CLUBMOSS_SPORE_SUIT. */
  export const CLUBMOSS_SPORE_CHANCE = 0.3;
  export const CLUBMOSS_SPORE_SUIT = 0.3;
  /** Suitability clubmosses keep on a tile where conifers or broadleaf trees grow: dry land, and their wet niche. */
  export const CLUBMOSS_OUTCOMPETED = 0.02;
  export const CLUBMOSS_NICHE = 0.5;
  /** Below this many tiles the last clubmosses hold out on river banks among their rivals too. */
  export const CLUBMOSS_REFUGE_TILES = 60;
  /** Share of the land conifers and broadleaf trees must lead together before the giant clubmosses are gone. */
  export const LYCOPSID_END_FOREST_SHARE = 0.1;
  /** Share of the land their rivals must lead before the early vascular plants or the first trees die out (lycopsids.ts). */
  export const FLORA_GONE_SHARE = 0.1;
  /** Stature of the small, herbaceous clubmosses that remain. */
  export const CLUBMOSS_HERB_STATURE = 0.2;

  /** Peat per swamp-forest tile at full cover and year, in Gt; a marsh lays down COAL_MARSH of that. */
  export const COAL_RATE = 2.6e-7;
  export const COAL_MARSH = 0.5;
  /** A swamp without giant clubmosses lays down this share (lignite rather than hard coal). */
  export const COAL_LATER = 0.1;
  /** Cover below which a swamp lays down no peat. */
  export const COAL_MIN_COVER = 0.2;
  /** Years in which half the buried peat has turned into usable coal. */
  export const COAL_HALF_LIFE = 5e6;
  /** Share of a city's fossil energy that is coal, per tech level (oil and gas take over after industrialisation). */
  export const COAL_SHARE: readonly number[] = [0, 0, 0, 0, 0.9, 0.4, 0.4, 0.4];
  /** Coal in Gt one unit of fossil energy demand burns per year. */
  export const COAL_PER_DEMAND_YEAR = 0.6;
  /** Reserve built per year with giant clubmoss swamps, and after them: estimates for saves without a coal field. */
  export const COAL_EST_LYCOPSID_YEAR = 6e-5;
  export const COAL_EST_LATER_YEAR = 3.5e-5;

  /* ------------------------------------------------------------------ oil -- */
  // src/oil.ts.

  /** Kerogen buried per unit of sea-animal density (summed over tiles) and year, Gt. */
  export const OIL_RATE = 6.5e-10;
  /** Years in which half the buried kerogen has turned into oil (the oil window lies kilometres down). */
  export const OIL_HALF_LIFE = 2e7;
  /** Share of a city's fossil energy that is oil, per tech level; with COAL_SHARE the rest is gas. */
  export const OIL_SHARE: readonly number[] = [0, 0, 0, 0, 0.1, 0.45, 0.45, 0.45];
  /** Oil in Gt one unit of fossil energy demand burns per year: COAL_PER_DEMAND_YEAR × 24/42 MJ/kg. */
  export const OIL_PER_DEMAND_YEAR = 0.34;
  /** Reserve built per year since the first sea animals: estimate for saves without an oil field. */
  export const OIL_EST_YEAR = 3e-6;

  /* -------------------------------------------------------- space project -- */
  // src/spaceport.ts: once a city reaches the Nanotech age, a launch site in the desert builds a rocket.

  /**
   * Ticks the rocket takes at speed factor 1. Measured with tools/space-probe.js:
   * a civilization at full pace needs about 720 ticks, 4.8 minutes at "Mittel" (400 ms per tick);
   * a lone small Nanotech city up to 1125 ticks, 7.5 minutes (docs/raumfahrt-2026-10/bericht.md).
   */
  export const SPACE_BUILD_TICKS = 900;
  /** Speed factor with the fewest and with the most Nanotech people: capped, so a big civilization is only a little faster. */
  export const SPACE_RATE_MIN = 0.8;
  export const SPACE_RATE_MAX = 1.25;
  /** People of the inhabited Nanotech cities (summed cityPop) at which the speed factor reaches SPACE_RATE_MAX. */
  export const SPACE_POP_FULL = 2.5;
  /** Progress at which each phase begins: pad, lower stage, full rocket; at 1 the rocket stands ready. */
  export const SPACE_PHASE_AT: readonly number[] = [0, 0.3, 0.65, 1];
  export const SPACE_PHASE_NAMES: readonly string[] = [
    'Fundament und Startplatz', 'Untere Raketenstufe mit Baugerüst', 'Vollständige Rakete mit Startturm', 'Startbereite Rakete',
  ];
  /** Closest any city may stand to the pad, tiles: the pad covers the tiles beside it and the rocket rises three tiles. */
  export const SPACE_CITY_GAP = 3;
  /** Tiles above the pad tile the rocket and tower rise into; no city may stand there. */
  export const SPACE_RISE = 3;
  /** Steepest elevation step to a neighbour the pad and its apron may be built on. */
  export const SPACE_SLOPE_MAX = 0.08;
  /** Ticks until a search that found no site is tried again. */
  export const SPACE_SITE_RETRY = 20;

  /* ---------------------------------------------------------------- cacti -- */
  // src/cacti.ts: the flowering plants' desert form.

  /**
   * Years after the flowering plants before the first cacti: on the Earth
   * calendar 130 → 35 million years ago, the molecular dating of the cactus
   * family (Arakaki et al. 2011).
   */
  export const CACTUS_DELAY_YEARS = 95e6;
  /** Relative wetness down to which flowering plants grow on desert tiles once cacti exist (0.26 before). */
  export const CACTUS_WET_MIN = 0.10;
  /** Highest suitability cacti give flowering plants on a desert tile: a sparse stand. */
  export const CACTUS_SUIT = 0.5;
  /** Share of desert tiles with flowering plants that show a cactus on the map. */
  export const CACTUS_SHARE = 0.5;

  /* -------------------------------------------------------- savanna trees -- */
  // src/savannatrees.ts: the flowering plants' savanna form, drawn only.

  /** Share of savanna tiles with flowering plants that show a tree: next to the desert, next to the forest. */
  export const SAVANNA_TREE_SHARE_DRY = 0.08;
  export const SAVANNA_TREE_SHARE_FOREST = 0.35;
  /** Tiles within which the nearest desert and forest count; beyond, a tile lies halfway. */
  export const SAVANNA_TREE_REACH = 6;
  /** Share of savanna trees that are baobabs; the others are Schirmbäume. */
  export const SAVANNA_BAOBAB_SHARE = 1 / 8;

  /* ---------------------------------------- reefs, lagoons, beaches, palms -- */
  // src/reefs.ts: derived from the simulation's state when drawing, never saved.

  /** Water temperature (°C) from which reef builders build reefs: warm shallow sea only. */
  export const CORAL_MIN_TEMP = 20;
  /**
   * Densities are read in levels of this size (0..3): the picture changes only when a population
   * crosses one. Settled corals and fish hold about 0.5, mid-level, away from the thresholds.
   */
  export const REEF_DENSITY_STEP = 0.2;
  /** Grazing fish count from this density, as a class counts as living on a tile for the map (HERD_MIN_DENSITY). */
  export const REEF_GRAZER_MIN = 0.05;
  /**
   * Reef builders living on or within REEF_LARVA_REACH tiles (density from REEF_BUILDER_MIN, as a
   * class counts as living on a tile for the map) build a reef; from density level REEF_WIDE_LEVEL
   * (REEF_DENSITY_STEP each) a larger one. Settled cnidarians hold 0.1–0.2 on random planets, ~0.5 on today's Earth.
   */
  export const REEF_BUILDER_MIN = 0.05;
  export const REEF_WIDE_LEVEL = 2;
  export const REEF_LARVA_REACH = 2;
  /** Reefs grow at most this many tiles from land: in shallow water along the coast, not on far shelves and ridges. */
  export const REEF_SHORE_REACH = 3;
  /** A river carrying this much (riverFlow; on today's Earth the mouths carry 100–430) muddies the sea within REEF_RIVER_REACH tiles of its mouth: no reef, no beach. */
  export const REEF_RIVER_FLOW = 200;
  export const REEF_RIVER_REACH = 2;
  /** Reef centres: at most one per cell of this many tiles (grid offset by the seed), at least REEF_SPACING tiles apart. */
  export const REEF_CELL = 8;
  export const REEF_SPACING = 5;
  /** Coral patches per reef tile, and the share of them grazing fish grind to sand at full fish level. */
  export const REEF_PATCHES = 3;
  export const REEF_FISH_SAND = 0.3;
  /**
   * Reefs spread from the first one (its chronicle entry): a reef starts up to REEF_SPREAD_YEARS
   * later, 60 % by its distance from the first, 40 % by chance. Then it takes in a ring of tiles
   * every REEF_RING_YEARS, and each tile shows one more coral patch every REEF_PATCH_YEARS.
   * At 125 000 years a tick (Ordovician) the first reefs fill the warm coasts in about 250 ticks.
   */
  export const REEF_SPREAD_YEARS = 20e6;
  export const REEF_RING_YEARS = 3e6;
  export const REEF_PATCH_YEARS = 1.5e6;
  /** Share of a reef's outermost ring it takes in: a ragged edge, not a disc. */
  export const REEF_EDGE_SHARE = 0.65;
  /** Land tiles up to this many tiles from a grazed reef carry its white beach. */
  export const BEACH_REACH = 2;
  /**
   * Beaches lie in stretches: soft noise with a lattice of BEACH_STRETCH tiles. White beaches take
   * this share of the coast by the reef's grazing fish level 1..3; small islands (≤ BEACH_ISLAND_TILES)
   * an almost closed ring.
   */
  export const BEACH_STRETCH = 4;
  export const BEACH_SHARE: readonly number[] = [0, 0.5, 0.7, 0.85];
  export const BEACH_ISLAND_TILES = 6;
  export const BEACH_ISLAND_SHARE = 0.95;
  /**
   * Shell beaches from molluscs and shelled arthropods in water from SHELL_MIN_TEMP: share by their
   * level 1..3, counted like grazing fish (from REEF_GRAZER_MIN, then one more per REEF_DENSITY_STEP).
   */
  export const SHELL_BEACH_SHARE: readonly number[] = [0, 0.3, 0.45, 0.6];
  export const SHELL_MIN_TEMP = 12;
  /**
   * Palm islands: once broadleaf trees exist, warm islands (land from PALM_ISLAND_TEMP °C, at most
   * PALM_ISLAND_TILES tiles, e.g. a hotspot chain) get a beach ring on PALM_ISLAND_SHARE of their
   * coast, with palms on all but PALM_ISLAND_ONE of it.
   */
  export const PALM_ISLAND_TILES = 12;
  export const PALM_ISLAND_TEMP = 20;
  export const PALM_ISLAND_SHARE = 0.9;
  export const PALM_ISLAND_ONE = 0.25;
  /**
   * Sand cays: the fish's sand piles up into small islets on grown reef tiles at least
   * CAY_OFFSHORE tiles out, from grazing fish level CAY_FISH, on CAY_SHARE of them.
   */
  export const CAY_OFFSHORE = 2;
  export const CAY_FISH = 2;
  export const CAY_SHARE = 0.3;
  /**
   * Palms show only from this many years before the present: the oldest palm
   * fossils, Sabalites from the Late Cretaceous, are about 86–84 million years old.
   */
  export const PALM_FIRST_YEARS_AGO = 86e6;
  /** Palms per beach tile by hash: none below PALM_ONE (PALM_ISLAND_ONE on a palm island), one below PALM_PAIR, else a pair (60 / 30 / 10 %). */
  export const PALM_ONE = 0.6;
  export const PALM_PAIR = 0.9;

  /* ----------------------------------------------------------- time scale -- */

  export enum TimeScale {
    Geologic = 0,
    Evolution = 1,
    Civilized = 2,
    Technology = 3,
  }

  export const TIMESCALE_NAMES: readonly string[] = [
    'Geologie', 'Evolution', 'Zivilisation', 'Technologie',
  ];

  /** Simulated years advanced by one tick in each time scale. */
  export const YEARS_PER_TICK: readonly number[] = [500000, 10000, 100, 10];

  /* --------------------------------------------------------------- events -- */

  export enum EventKind {
    Hurricane = 0,
    TidalWave = 1,
    Meteor = 2,
    Volcano = 3,
    AtomicBomb = 4,
    Fire = 5,
    Earthquake = 6,
    Plague = 7,
  }
  export const EVENT_COUNT = 8;

  export const EVENT_NAMES: readonly string[] = [
    'Wirbelsturm', 'Flutwelle', 'Meteorit', 'Vulkanausbruch',
    'Atomschlag', 'Flächenbrand', 'Erdbeben', 'Seuche',
  ];

  /** File stem under assets/events/ for each disaster. */
  export const EVENT_ICONS: readonly string[] = [
    'hurricane', 'tidal-wave', 'meteor', 'volcano',
    'atomic-bomb', 'fire', 'earthquake', 'plague',
  ];

  /** What each disaster does, for the event palette. */
  export const EVENT_HINTS: readonly string[] = [
    'Durchnässt ein großes Gebiet und schädigt Leben im Zentrum.',
    'Überspült flache Küsten, schädigt Leben und Städte am Ufer.',
    'Krater, Staub in der Atmosphäre, schwere Schäden im Umkreis.',
    'Hebt Gelände an, setzt CO₂ und Staub frei, zerstört Leben am Krater.',
    'Vernichtet Städte und Leben im Umkreis, Staub verdunkelt den Himmel.',
    'Verbrennt Wälder und Vegetation; Pflanzen wachsen danach nach.',
    'Verschiebt Gelände leicht und beschädigt Städte.',
    'Trifft dichte Bevölkerungen und schwächt Tierbestände.',
  ];

  /** Every disaster costs the same 50 Ω in the original. */
  export const EVENT_COST = 50;

  /* -------------------------------------------- hazards (docs/ereignisse-spec.md) -- */

  /** What a hazard is doing on a tile right now; drawn by the effect layer. */
  export enum HazardTile {
    None = 0,
    Burning = 1,
    Lava = 2,
    Flood = 3,
    Wet = 4,
    Rubble = 5,
  }

  /** Aftermath a hazard leaves on a land tile (spec §4); healed through succession. */
  export enum ScarKind {
    None = 0,
    Basalt = 1,
    Vent = 2,
    Burnt = 3,
    Scorched = 4,
    Crater = 5,
    Mud = 6,
    Windthrow = 7,
    FissureH = 8,
    FissureV = 9,
    FissureD1 = 10,
    FissureD2 = 11,
    Scree = 12,
    Ruins = 13,
    Ash = 14,
    Fallout = 15,
  }
  export const SCAR_NAMES: readonly string[] = [
    '', 'Frische Lava (Basalt)', 'Vulkanschlot', 'Verbrannte Erde', 'Versengter Boden', 'Einschlagkrater',
    'Schlamm', 'Windwurf', 'Erdriss', 'Erdriss', 'Erdriss', 'Erdriss', 'Schutt', 'Ruinen', 'Asche', 'Fallout',
  ];
  /**
   * Ticks a scar holds its ground before succession may start (K3): short for
   * burns and mud, long for lava, craters and fallout. Ticks, not years, so a
   * scar stays visible in every time scale. 255 never ends (a volcano's vent).
   */
  export const SCAR_MIN_TICKS: readonly number[] = [0, 60, 255, 12, 12, 80, 10, 12, 30, 30, 30, 30, 20, 30, 80, 150];

  /** Most hazards running at once; a natural one beyond that is dropped. */
  export const HAZARD_MAX_ACTIVE = 8;
  /** Real-time omen per EventKind (ms), played before the hazard starts. */
  export const HAZARD_OMEN_MS: readonly number[] = [800, 800, 1000, 1000, 600, 800, 600, 0];
  /** Real-time main animation per EventKind (ms), played as the hazard starts. */
  export const HAZARD_MAIN_MS: readonly number[] = [3000, 2000, 2500, 3000, 3500, 2000, 2500, 0];

  /** A volcano lifts its vent and the ring around it (≈ 900 m and 270 m). */
  export const VOLCANO_VENT_LIFT = 0.2;
  export const VOLCANO_RING_LIFT = 0.06;
  /** A cone raised in deep ocean stays this far below the surface: no island (K5). */
  export const VOLCANO_DEEP_CAP = -0.02;
  /** Lava tiles per eruption: VOLCANO_LAVA_MIN plus a hashed share of VOLCANO_LAVA_SPAN. */
  export const VOLCANO_LAVA_MIN = 6;
  export const VOLCANO_LAVA_SPAN = 6;
  /** Furthest a flow runs from its vent, in tiles (Chebyshev). */
  export const VOLCANO_LAVA_REACH = 6;
  /** A neighbour this close in height to the lowest one splits the flow. */
  export const VOLCANO_BRANCH_DROP = 0.01;
  /** Chance that a flow with two such neighbours splits. */
  export const VOLCANO_BRANCH_CHANCE = 0.5;
  /** Lava stands this thick: it runs over bumps and out of hollows lower than that. */
  export const VOLCANO_LAVA_THICK = 0.03;
  /** Ticks per cooling stage: glowing, dark red, crust; then basalt. */
  export const LAVA_STAGE_TICKS: readonly number[] = [3, 3, 4];
  /** Water at least this shallow turns to land under lava, at most LAVA_LAND_MAX tiles per eruption (K5). */
  export const LAVA_LAND_DEPTH = -0.05;
  export const LAVA_LAND_MAX = 2;
  /** Height above the sea of the new land lava builds. */
  export const LAVA_LAND_HEIGHT = 0.005;
  /** Ticks an underwater eruption steams before it is over. */
  export const VOLCANO_STEAM_TICKS = 6;
  /** Ash fall: cities this close to the vent lose this share of their people. */
  export const VOLCANO_ASH_RADIUS = 2;
  export const VOLCANO_ASH_LOSS = 0.15;
  /** Global atmosphere per eruption, unchanged from the old brush (K6). */
  export const VOLCANO_CO2 = 25;
  export const VOLCANO_DUST = 0.05;

  /* Chain reactions (hazardchain.ts). */
  /** Lava or a meteor's blast sets plants on fire with at least this cover, drier than this moisture (spec §3.9). */
  export const CHAIN_FIRE_COVER = 0.35;
  export const CHAIN_FIRE_MOISTURE = 0.4;
  /** A quake at sea raises a tidal wave of this strength per magnitude (M 2: half a full wave, M 3: three quarters). */
  export const CHAIN_QUAKE_WAVE = 0.25;

  /* Wildfire (hazardfire.ts). */
  /** Ignition chance per burning neighbour and tick at full fuel, dryness and wind; diagonals × FIRE_DIAGONAL. */
  export const FIRE_SPREAD = 0.55;
  export const FIRE_DIAGONAL = 0.7;
  /** Fuel per unit of plant cover without woody plants (grass, ferns, moss burn lighter). */
  export const FIRE_HERB_FUEL = 0.6;
  /** Spread factor with the wind, across it and against it. */
  export const FIRE_DOWNWIND = 1.8;
  export const FIRE_CROSSWIND = 1;
  export const FIRE_UPWIND = 0.3;
  /** Dryness = clamp(FIRE_DRY_BASE − FIRE_DRY_MOIST · moisture, 0, 1), × FIRE_HOT_DRY above FIRE_HOT_C, × FIRE_COLD_DRY below 0 °C. */
  export const FIRE_DRY_BASE = 1.2;
  export const FIRE_DRY_MOIST = 1.4;
  export const FIRE_HOT_C = 25;
  export const FIRE_HOT_DRY = 1.2;
  export const FIRE_COLD_DRY = 0.5;
  /** A tile burns this many ticks, more with more fuel. */
  export const FIRE_BURN_MIN = 2;
  export const FIRE_BURN_MAX = 4;
  /** Wall-clock ms per tick at "Sehr langsam"; while a fire burns, the game runs this slowly whatever speed is set (app.ts). */
  export const SLOWEST_TICK_MS = 2500;
  /** Length of assets/audio/sfx/forest-fire.mp3 in s, measured from its frames: a fire burns no longer than its sound plays. */
  export const FIRE_SOUND_S = 15.2;
  /** Caps per fire: tiles from the origin (Chebyshev), tiles burnt, ticks. */
  export const FIRE_REACH = 10;
  export const FIRE_MAX_TILES = 90;
  export const FIRE_MAX_TICKS = Math.floor((FIRE_SOUND_S * 1000) / SLOWEST_TICK_MS);
  /** A burnt-out tile keeps this share of its plant cover; life on it loses FIRE_LIFE_LOSS. */
  export const FIRE_KEEP = 0.2;
  export const FIRE_LIFE_LOSS = 0.7;
  /** A city the fire reaches loses this share of its people (once per fire). */
  export const FIRE_CITY_LOSS = 0.2;
  /** CO₂ (ppm) per unit of burnt plant cover; dust per burnt tile, at most FIRE_DUST_MAX per fire. */
  export const FIRE_CO2 = 0.8;
  export const FIRE_DUST_TILE = 0.0003;
  export const FIRE_DUST_MAX = 0.02;
  /** Air O₂ (%) a burning tile uses up per tick and unit of fuel, × fireOxygen: the bigger and longer a fire, the more it costs. */
  export const FIRE_O2 = 0.006;
  /**
   * The fire window (hazardlightning.ts, fireOxygen): above today's air O₂ every
   * FIRE_O2_SPAN points more make plants catch and fire spread once more as
   * readily; below it nothing changes.
   */
  export const FIRE_O2_SPAN = 6;
  /**
   * Chance per tick that lightning finds dry plants somewhere, at today's O₂;
   * × fireOxygen^FIRE_LIGHTNING_POWER above it. A greedy planet levels off
   * near 25.7 % O₂ without fires: a lightning fire every ~440 ticks there,
   * every ~70 at 35 %.
   */
  export const FIRE_LIGHTNING_CHANCE = 0.0004;
  export const FIRE_LIGHTNING_POWER = 3;
  /** Tiles a strike tries; the one with the most dry fuel burns. */
  export const FIRE_LIGHTNING_TRIES = 24;

  /* Meteor and atomic strike (hazardimpact.ts). */
  /** A blast ring is the rounded distance, wobbled by up to ± half this per tile, so scars come out round and ragged. */
  export const IMPACT_RING_WOBBLE = 0.7;
  /** A meteor sinks its tile into a crater (≈ 270 m), whose floor stays this far above the sea. */
  export const METEOR_CRATER_DEPTH = 0.06;
  export const METEOR_CRATER_FLOOR = 0.005;
  /** Ring 1 is scorched: plant cover kept, life lost. */
  export const METEOR_RING1_KEEP = 0.2;
  export const METEOR_RING1_KILL = 0.8;
  /** Ring 2 is scorched on this hashed share of its tiles, more lightly. */
  export const METEOR_RING2_SHARE = 0.5;
  export const METEOR_RING2_KEEP = 0.5;
  export const METEOR_RING2_KILL = 0.4;
  /** Cities in ring 2 lose this share; nearer ones are destroyed. */
  export const METEOR_RING2_CITY_LOSS = 0.5;
  /** Sea life within ring 1 of an impact at sea. */
  export const METEOR_SEA_KILL = 0.6;
  /** Global atmosphere per impact, unchanged from the old brush (K6). */
  export const METEOR_DUST = 0.18;
  export const METEOR_CO2 = 40;
  /**
   * The comet that ends the dinosaurs' era (comet.ts) strikes as a meteor of
   * this strength: crater and blast rings twice the diameter, so its crater
   * covers four tiles where a meteor's covers one.
   */
  export const COMET_STRENGTH = 2;
  /** Share of every other group's stock the comet takes worldwide, ± a hashed COMET_LOSS_JITTER per tile. */
  export const COMET_LOSS = 0.75;
  export const COMET_LOSS_JITTER = 0.1;
  /** Within COMET_NEAR tiles of the crater the loss rises towards COMET_NEAR_LOSS at its rim. */
  export const COMET_NEAR = 14;
  export const COMET_NEAR_LOSS = 0.98;
  /**
   * Refuges: every animal group but the dinosaurs keeps one sheltered
   * population per sub-species it had, on the tile beyond COMET_NEAR with the
   * most to eat after the strike. It cannot fall below COMET_REFUGE_DENSITY
   * (five times the density below which a population dies) for at least
   * COMET_REFUGE_MIN_TICKS (the strike's winter), then until the tile leaves
   * it room to grow again (COMET_REFUGE_ROOM, crowding included), and for
   * COMET_REFUGE_TICKS at most: a shelter, not immortality.
   * A plant group that would vanish keeps COMET_REFUGE_COVER on its best tile.
   */
  export const COMET_REFUGE_DENSITY = 0.1;
  export const COMET_REFUGE_ROOM = 0.2;
  export const COMET_REFUGE_MIN_TICKS = 60;
  export const COMET_REFUGE_TICKS = 600;
  export const COMET_REFUGE_COVER = 0.2;
  /**
   * The strike's winter (cometwinter.ts): ice spreads from both poles over
   * COMET_ICE_GROW ticks until it holds COMET_ICE_SHARE of the surface, stays
   * COMET_ICE_HOLD ticks and draws back over COMET_ICE_MELT. Plants under it
   * keep their groups at COMET_ICE_COVER and grow again once it is gone. Its
   * edge follows the parallels, wobbled by up to ±COMET_ICE_WOBBLE of the
   * pole-to-equator span in cells of COMET_ICE_CELL tiles; highlands freeze
   * first (COMET_ICE_HEIGHT per unit of elevation). Exaggerated for the eye:
   * Earth did not freeze over after Chicxulub.
   */
  export const COMET_ICE_SHARE = 2 / 3;
  export const COMET_ICE_GROW = 10;
  export const COMET_ICE_HOLD = 25;
  export const COMET_ICE_MELT = 60;
  export const COMET_ICE_COVER = 0.02;
  export const COMET_ICE_WOBBLE = 0.1;
  export const COMET_ICE_CELL = 16;
  export const COMET_ICE_HEIGHT = 0.3;
  /** Real-time show: the comet's omen and flight before it strikes, and the impact after (ms). */
  export const COMET_OMEN_MS = 3200;
  export const COMET_MAIN_MS = 4500;
  /** The camera's flight to the comet lasts at most ~0.9 s; taken over by the player, the show starts after this anyway. */
  export const COMET_FLY_FALLBACK_MS = 1400;
  /** Atomic strike, ring 2: life lost, plant cover kept, ticks its fuel burns (it does not spread). */
  export const ATOMIC_RING2_KILL = 0.6;
  export const ATOMIC_RING2_KEEP = 0.2;
  export const ATOMIC_FIRE_TICKS = 2;
  /** Most of the four ring-1 corners that turn to ash; the others fall to ring 2, so ground zero reads round. */
  export const ATOMIC_ASH_CORNERS = 2;
  /** Fallout zone: this ring plus a plume this many tiles downwind. */
  export const ATOMIC_FALLOUT_RADIUS = 3;
  export const ATOMIC_PLUME = 3;
  /** Life in the fallout zone loses this much per tick for ATOMIC_FALLOUT_TICKS. */
  export const ATOMIC_FALLOUT_KILL = 0.02;
  export const ATOMIC_FALLOUT_TICKS = 20;
  export const ATOMIC_DUST = 0.15;

  /* Tidal wave and hurricane (hazardwater.ts). */
  /** Ticks a tidal wave takes to cross a tile of deep sea (below COAST_DEPTH); above it × √(COAST_DEPTH / e), at most WAVE_TICKS_SHALLOW. */
  export const WAVE_TICKS_DEEP = 0.33;
  export const WAVE_TICKS_SHALLOW = 1;
  /** Longest path over the water, in tiles; the wave keeps WAVE_DECAY of its energy per tile. A weaker wave ends at the same energy, but after WAVE_PATH_MIN at least. */
  export const WAVE_PATH_MAX = 32;
  export const WAVE_PATH_MIN = 8;
  export const WAVE_DECAY = 0.93;
  /** Radius around the origin, in tiles, where the arrival field starts as an exact circle (removes the source's corner bias). */
  export const WAVE_FMM_INIT = 3;
  /** Ticks the hazard lasts past the last arrival, while the foam behind the front fades on screen. */
  export const WAVE_TRAIL_TICKS = 1.5;
  /** Wave height at the coast at full energy (≈ 400 m game height, approved). */
  export const WAVE_HEIGHT = 0.09;
  /** Height a wave or surge loses per land step, and the most land steps it runs. */
  export const FLOOD_RUNUP_LOSS = 0.012;
  export const FLOOD_RUNUP_STEPS = 6;
  /** Ticks the water takes to run up one land tile (diagonals √2 as long). */
  export const FLOOD_RUNUP_TICKS = 1;
  /**
   * Ticks the water stands once it stops climbing; then its edge runs back to the sea, inland first, FLOOD_RECEDE_TICKS a tile.
   * At least 3: the mud is laid a tick before a tile dries, after the screen has shown the water reach all of it.
   */
  export const FLOOD_HOLD_TICKS = 3;
  export const FLOOD_RECEDE_TICKS = 0.75;
  /** Ticks a run stays after its last tile dried on screen, for the backwash and wet sheen. */
  export const FLOOD_TRAIL_TICKS = 2;
  /** Water this deep does the full damage; shallower water from FLOOD_LIFE_SHALLOW and FLOOD_CITY_LOSS up. */
  export const FLOOD_DEPTH_FULL = 0.04;
  export const FLOOD_LIFE_LOSS = 0.8;
  export const FLOOD_LIFE_SHALLOW = 0.4;
  export const FLOOD_CITY_LOSS = 0.6;
  /** Plant cover a flood leaves, and the moisture it brings. */
  export const FLOOD_VEGETATION_KEEP = 0.4;
  export const FLOOD_MOISTURE = 0.5;
  /** Hurricane strength from the sea surface (°C): at least WARM 3, at least MILD 2, cooler or over land 1. */
  export const HURRICANE_WARM_SEA = 26;
  export const HURRICANE_MILD_SEA = 20;
  export const HURRICANE_MAX = 4;
  /** Strength per tick: gained over warm sea, lost over cooler sea and over land. */
  export const HURRICANE_GAIN = 0.25;
  export const HURRICANE_SEA_LOSS = 0.3;
  /** Slow enough that a strong storm crosses a good stretch of a continent, raining itself out (4 → 0 in 20 ticks). */
  export const HURRICANE_LAND_LOSS = 0.2;
  /** Ticks a storm moves at most. */
  export const HURRICANE_TRACK_MAX = 40;
  /** Below this latitude it moves west with the trade winds, beyond it recurves east. */
  export const HURRICANE_RECURVE_LAT = 30;
  /** How much its east–west speed (tiles per tick) may change per tick: it recurves in a bend over ~8 ticks, never a U-turn. */
  export const HURRICANE_TURN = 0.25;
  /** Poleward drift in tiles per tick, with a hashed jitter of ± half HURRICANE_DRIFT_JITTER. */
  export const HURRICANE_DRIFT = 0.3;
  export const HURRICANE_DRIFT_JITTER = 0.2;
  /** Per tick in the eye and ring 1: moisture, life and city loss per strength; ring 2 gets HURRICANE_OUTER_MOISTURE. */
  export const HURRICANE_MOISTURE = 0.3;
  export const HURRICANE_OUTER_MOISTURE = 0.15;
  export const HURRICANE_LIFE_LOSS = 0.08;
  export const HURRICANE_CITY_LOSS = 0.04;
  /** Forests fall from this strength on and keep this share of their cover. */
  export const HURRICANE_WINDTHROW_MIN = 2;
  export const HURRICANE_WINDTHROW_KEEP = 0.7;
  /** Wet ground lasts HURRICANE_WET_TICKS plus a hashed 0..HURRICANE_WET_SPAN ticks. */
  export const HURRICANE_WET_TICKS = 6;
  export const HURRICANE_WET_SPAN = 4;
  /** Landfall from this strength on pushes a storm surge of HURRICANE_SURGE × strength up the coast. */
  export const HURRICANE_SURGE_MIN = 3;
  export const HURRICANE_SURGE = 0.02;
  /** Landfall from this strength on sets down 1 tornado, or 2 with TORNADO_SECOND_CHANCE, on land within TORNADO_SPAWN_RING of the eye. */
  export const TORNADO_MIN_STRENGTH = 3;
  export const TORNADO_SECOND_CHANCE = 0.5;
  export const TORNADO_SPAWN_RING = 2;
  /** Tiles a tornado runs inland, one a tick, hashed between these. */
  export const TORNADO_RUN_MIN = 2;
  export const TORNADO_RUN_MAX = 4;
  /** On every tile it crosses: windthrow from this landscape level on, keeping this plant cover; life and city losses. */
  export const TORNADO_WINDTHROW_LEVEL = 3;
  export const TORNADO_VEGETATION_KEEP = 0.5;
  export const TORNADO_LIFE_LOSS = 0.3;
  export const TORNADO_CITY_LOSS = 0.2;
  /** Lightning bolts per tick, hashed from MIN to MAX by strength band: below 2, 2 to 3, from 3 on (hazardstorm.ts). */
  export const STORM_STRIKES_MIN: readonly number[] = [0, 1, 2];
  export const STORM_STRIKES_MAX: readonly number[] = [1, 2, 4];
  /** Share of the bolts in ring 1, 2 and 3 of the eye (the eyewall and the bands); none in the calm eye. */
  export const STORM_STRIKE_RINGS: readonly number[] = [0.3, 0.3, 0.4];
  /** A bolt on land scorches the ground, kills this much life and costs a city this share. */
  export const STORM_STRIKE_LIFE_LOSS = 0.15;
  export const STORM_STRIKE_CITY_LOSS = 0.05;
  /** Plant cover from which a bolt leaves scorched ground. */
  export const STORM_SCORCH_COVER = 0.2;
  /** Chance that a bolt on dry plants (CHAIN_FIRE_COVER, CHAIN_FIRE_MOISTURE, not soaked) sets them on fire. */
  export const STORM_FIRE_CHANCE = 0.5;
  /** Over land from this strength on, rain floods the eye and ring 1 where land lies below STORM_FLOOD_LOW or carries a river. */
  export const STORM_FLOOD_MIN = 2;
  export const STORM_FLOOD_LOW = 0.08;
  /** The rain water stands this deep (shallow) and runs off after STORM_FLOOD_TICKS plus a hashed 0..STORM_FLOOD_SPAN ticks. */
  export const STORM_FLOOD_DEPTH = 0.008;
  export const STORM_FLOOD_TICKS = 4;
  export const STORM_FLOOD_SPAN = 3;

  /* Earthquake (hazardquake.ts). */
  /** Magnitude within QUAKE_PLATE_ROWS rows of a plate boundary, and elsewhere; the fissure is 2·M + 1 tiles long. */
  export const QUAKE_PLATE_ROWS = 6;
  export const QUAKE_MAG_PLATE = 3;
  export const QUAKE_MAG_INLAND = 2;
  /** Furthest any change reaches from the epicentre (Chebyshev): slides from radius 3 onto a neighbour. */
  export const QUAKE_REACH = 4;
  /** An uplift gradient at least this steep near the epicentre marks a mountain belt the fissure follows. */
  export const QUAKE_BELT_GRADIENT = 0.02;
  /** One side of the fissure rises QUAKE_OFFSET_PER_M · M, over QUAKE_OFFSET_DEPTH tile rows. */
  export const QUAKE_OFFSET_PER_M = 0.01;
  export const QUAKE_OFFSET_DEPTH = 2;
  /** Cities lose this share up to QUAKE_CITY_NEAR tiles away, and QUAKE_CITY_FAR_LOSS up to QUAKE_CITY_FAR. */
  export const QUAKE_CITY_NEAR = 1;
  export const QUAKE_CITY_NEAR_LOSS = 0.4;
  export const QUAKE_CITY_FAR = 3;
  export const QUAKE_CITY_FAR_LOSS = 0.15;
  /** Ticks a damaged city lies in rubble: QUAKE_RUBBLE_MIN plus a hashed 0..QUAKE_RUBBLE_SPAN. */
  export const QUAKE_RUBBLE_MIN = 8;
  export const QUAKE_RUBBLE_SPAN = 4;
  /** Slopes within QUAKE_SLIDE_RADIUS dropping more than QUAKE_SLIDE_DROP (≈ p85) to a neighbour may slide. */
  export const QUAKE_SLIDE_RADIUS = 3;
  export const QUAKE_SLIDE_DROP = 0.12;
  /** Chance a steep tile slides at the strongest magnitude; scaled by M / QUAKE_MAG_PLATE. */
  export const QUAKE_SLIDE_CHANCE = 0.5;
  /** Height a slide moves from its tile onto its lowest neighbour. */
  export const QUAKE_SLIDE_AMOUNT = 0.02;
  /** Landslides come down over this many ticks after the shock. */
  export const QUAKE_SLIDE_TICKS = 3;

  /* ---------------------------------------------------------------- tools -- */

  export enum Tool {
    Examine = 0,
    Move = 1,
    SetAltitude = 2,
    PlantBiome = 3,
    PlaceLife = 4,
    TriggerEvent = 5,
  }

  export const TOOL_NAMES: readonly string[] = [
    'Untersuchen', 'Verschieben', 'Höhe ändern', 'Pflanzen', 'Leben ansiedeln', 'Ereignis auslösen',
  ];
  export const TOOL_ICONS: readonly string[] = [
    'tool-examine', 'tool-move', 'tool-altitude', 'tool-plant', 'tool-life', 'tool-event',
  ];
  export const TOOL_HINTS: readonly string[] = [
    'Tippe auf ein Feld, um Lebensraum, Arten und Klima zu sehen.',
    'Ziehe die Karte oder fahre mit W A S D. Das Mausrad zoomt.',
    'Formt das Gelände mit dem Pinsel: hebt Land aus dem Meer oder senkt es ab.',
    'Siedelt eine entwickelte Pflanzengruppe in einem 5 × 5-Feld an, wo sie wachsen kann.',
    'Siedelt eine entwickelte Tiergruppe, eine Stadt oder einen Terraformer an.',
    'Löst eine Naturkatastrophe am gewählten Ort aus.',
  ];

  export const EXAMINE_COST = 5;
  export const ALTITUDE_COST = 50;
  export const BIOME_COST = 50;
  /** Opening any of the four model control panels costs this much. */
  export const MODEL_PANEL_COST = 100;

  /** Terraforming devices, placed through the Place Life tool. */
  export enum Terraformer {
    OxygenGenerator = 0,
    CO2Generator = 1,
    VaporGenerator = 2,
    Monolith = 3,
  }
  export const TERRAFORMER_NAMES: readonly string[] = [
    'Sauerstoff-Generator', 'CO₂-Generator', 'Wasserdampf-Generator', 'Monolith',
  ];
  export const TERRAFORMER_ICONS: readonly string[] = [
    'terra-oxygen', 'terra-co2', 'terra-vapor', 'terra-monolith',
  ];
  export const TERRAFORMER_HINTS: readonly string[] = [
    '+1,5 % Sauerstoff in der Atmosphäre.',
    '+120 ppm CO₂ – wärmt den Planeten.',
    'Mehr Luftfeuchte und ein feuchteres 5 × 5-Feld.',
    'Erweckt die örtliche Art zur Intelligenz (nur an Land).',
  ];
  export const TERRAFORMER_COST: readonly number[] = [500, 500, 500, 2500];

  /* ------------------------------------------------------------- map modes -- */

  /** The twelve Map Window modes, in their five control-panel groups. */
  export enum MapMode {
    Terrain = 0,
    Events = 1,
    Drift = 2,
    Oceans = 3,
    OceanTemp = 4,
    OceanCurrents = 5,
    AirTemp = 6,
    Rainfall = 7,
    AirCurrents = 8,
    Biomes = 9,
    LifeMap = 10,
    Technology = 11,
  }

  export interface MapModeDef {
    readonly name: string;
    readonly group: string;
    readonly icon: string;
  }

  export const MAP_MODES: readonly MapModeDef[] = [
    { name: 'Gelände', group: 'Geosphäre', icon: 'map-terrain' },
    { name: 'Ereignisse', group: 'Geosphäre', icon: 'layer-events' },
    { name: 'Kontinentaldrift', group: 'Geosphäre', icon: 'map-drift' },
    { name: 'Meeresboden', group: 'Hydrosphäre', icon: 'layer-oceans' },
    { name: 'Meerestemperatur', group: 'Hydrosphäre', icon: 'overlay-seaheat' },
    { name: 'Meeresströmungen', group: 'Hydrosphäre', icon: 'overlay-seaflow' },
    { name: 'Lufttemperatur', group: 'Atmosphäre', icon: 'overlay-heat' },
    { name: 'Niederschlag', group: 'Atmosphäre', icon: 'overlay-rain' },
    { name: 'Winde', group: 'Atmosphäre', icon: 'overlay-wind' },
    { name: 'Lebensräume', group: 'Biosphäre', icon: 'layer-biomes' },
    { name: 'Leben', group: 'Biosphäre', icon: 'layer-life' },
    { name: 'Technologie', group: 'Zivilisation', icon: 'layer-cities' },
  ];

  /** The five groups labelled along the Map Window control panel. */
  export const MAP_GROUPS: readonly string[] = [
    'Geosphäre', 'Hydrosphäre', 'Atmosphäre', 'Biosphäre', 'Zivilisation',
  ];

  /* ------------------------------------------- edit window display layers -- */

  /** Additive layers — any combination may be switched on at once. */
  export const DATA_LAYERS: readonly string[] = [
    'Ozeane', 'Lebensräume', 'Städte', 'Leben', 'Ereignisse', 'Wolken',
  ];
  export const DATA_LAYER_ICONS: readonly string[] = [
    'layer-oceans', 'layer-biomes', 'layer-cities', 'layer-life', 'layer-events', 'layer-clouds',
  ];

  /** Mutually exclusive climate overlays; only one may be active. */
  export enum Overlay {
    None = -1,
    Heat = 0,
    Rainfall = 1,
    Winds = 2,
    SeaFlow = 3,
    SeaHeat = 4,
    Magma = 5,
  }
  export const OVERLAY_NAMES: readonly string[] = [
    'Wärme', 'Niederschlag', 'Winde', 'Meeresströmung', 'Meereswärme', 'Magma',
  ];
  export const OVERLAY_ICONS: readonly string[] = [
    'overlay-heat', 'overlay-rain', 'overlay-wind', 'overlay-seaflow', 'overlay-seaheat', 'overlay-magma',
  ];

  /* -------------------------------------------------------------- economy -- */

  /**
   * Ω income tiers (energy.ts): `regen` per tick, so a paused planet earns nothing, up to `max`.
   * Reached by developing the `unlock` step, or by the first city ('city').
   * The first tier is the income the early game was balanced on.
   */
  export const OMEGA_STAGES: readonly { readonly name: string; readonly unlock: string; readonly regen: number; readonly max: number }[] = [
    { name: 'Junger Planet', unlock: '', regen: 1.6, max: 5000 },
    { name: 'Komplexe Zellen', unlock: 'eukaryotes', regen: 2.2, max: 6500 },
    { name: 'Leben an Land', unlock: 'landPlants', regen: 3.0, max: 8000 },
    { name: 'Vierfüßer', unlock: 'amphibians', regen: 4.0, max: 10000 },
    { name: 'Säugetiere', unlock: 'mammals', regen: 5.0, max: 12000 },
    { name: 'Zivilisation', unlock: 'city', regen: 6.5, max: 15000 },
  ];
  /** The highest tier's cap: no planet ever holds more Ω. */
  export const OMEGA_MAX = 15000;
  export const OMEGA_START = 1500;

  /** Evolution points never pile up beyond this. */
  export const EP_MAX = 999;
}
