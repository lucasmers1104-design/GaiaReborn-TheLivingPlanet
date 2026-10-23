/* =============================================================================
 * SimEarth 2.0 — world state and terrain generation
 * -----------------------------------------------------------------------------
 * Struct-of-arrays over typed arrays. A tile holds a whole community: every
 * life class carries its own density there, so ancestors and descendants
 * coexist and competition is just a shared carrying capacity. The Examine
 * window lists what lives on a tile; the Edit window draws one creature per
 * local population peak so the map stays readable.
 * ========================================================================== */

namespace SE {
  /**
   * Seeded fractal terrain. Every octave's lattice divides the grid and lookups
   * wrap, so the map is seam-free across the cylinder join. Lattices are twice
   * as wide as tall to match the 2:1 grid and keep continents round.
   */
  export class TerrainGenerator {
    private static readonly OCTAVES: readonly { cx: number; cy: number; amp: number }[] = [
      { cx: 8, cy: 4, amp: 1.0 },
      { cx: 16, cy: 8, amp: 0.52 },
      { cx: 32, cy: 16, amp: 0.26 },
      { cx: 64, cy: 32, amp: 0.13 },
      // The 256-column grid resolves a lattice this fine; on the old 128 it was
      // below one cell per tile and would only have added noise.
      { cx: 128, cy: 64, amp: 0.065 },
    ];

    /** Crest height of the highest belt, in the -1..1 elevation space: about 4.2 km. */
    private static readonly OROGENY_AMP = 0.94;
    /** Mountain type per tile from the last `orogeny`, until `takeBeltKinds` collects it. */
    private static beltKinds: Uint8Array | null = null;

    /** Fill `out` with elevations in [-1, 1], sea level at 0, `oceanShare` of it below. */
    static generate(
      seed: number, out: Float32Array, oceanShare = OCEAN_FRACTION,
      octaves: readonly { cx: number; cy: number; amp: number }[] = TerrainGenerator.OCTAVES,
    ): void {
      const rng = new Rng(seed);
      out.fill(0);

      for (const o of octaves) {
        const lattice = new Float32Array(o.cx * o.cy);
        for (let i = 0; i < lattice.length; i++) lattice[i] = rng.next();

        for (let y = 0; y < GRID_H; y++) {
          for (let x = 0; x < GRID_W; x++) {
            out[idx(x, y)] += o.amp * TerrainGenerator.sample(lattice, o.cx, o.cy, x, y);
          }
        }
      }

      TerrainGenerator.normalize(out, oceanShare);
    }

    /**
     * Raise mountain ranges out of the continents, and record the belts in
     * `uplift` so the geosphere can keep pushing them up against erosion.
     *
     * Plain fBm gives rounded blobs, never ranges, and thresholded ridge noise
     * breaks into scattered hills: a real orogen is a long range with one
     * crest, so `raiseBelts` lays the ranges down as lines (orogeny.ts).
     *
     * Placement follows distance from the sea rather than the plate boundaries.
     * `GeoSystem.drift` rolls whole rows independently, so a ridge pinned to a
     * plate edge would slide across the continent sitting on it; distance to
     * water travels *with* the crust and puts cordilleras where they belong,
     * a little back from the coast.
     *
     * `amp` is the crest height of the highest belt. The mountain type of each
     * belt tile waits in `takeBeltKinds` for the world to collect it.
     */
    static orogeny(seed: number, elevation: Float32Array, uplift: Float32Array, amp = TerrainGenerator.OROGENY_AMP): void {
      TerrainGenerator.beltKinds = raiseBelts(seed, elevation, uplift, amp);
    }

    /** The mountain types the last `orogeny` laid down, once; null if none is waiting. */
    static takeBeltKinds(): Uint8Array | null {
      const kinds = TerrainGenerator.beltKinds;
      TerrainGenerator.beltKinds = null;
      return kinds;
    }

    /** Mantle upwelling: a smooth field so volcanism clusters into belts instead of speckling the planet at random. */
    static mantle(seed: number, magma: Float32Array): void {
      TerrainGenerator.generate(seed ^ 0x9e3779b9, magma, OCEAN_FRACTION);
      for (let i = 0; i < TILE_COUNT; i++) magma[i] = clamp(magma[i] * 0.5 + 0.5, 0, 1);
    }

    /**
     * Tiles from each land cell to the nearest water, by breadth-first search
     * from every sea tile at once. Water reads 0, its neighbours 1, and so on.
     */
    static distanceToWater(elevation: Float32Array): Int32Array {
      const dist = new Int32Array(TILE_COUNT).fill(-1);
      const queue = new Int32Array(TILE_COUNT);
      let head = 0;
      let tail = 0;

      for (let i = 0; i < TILE_COUNT; i++) {
        if (elevation[i] < 0) {
          dist[i] = 0;
          queue[tail++] = i;
        }
      }

      // A planet with no sea at all leaves every land tile at -1; treat that as
      // "deep interior" rather than letting the caller index a negative band.
      if (tail === 0) return dist.fill(GRID_W);

      while (head < tail) {
        const i = queue[head++];
        const x = i % GRID_W;
        const y = (i / GRID_W) | 0;
        const next = dist[i] + 1;

        const n0 = idx(wrapX(x - 1), y);
        const n1 = idx(wrapX(x + 1), y);
        const n2 = idx(x, clampY(y - 1));
        const n3 = idx(x, clampY(y + 1));
        if (dist[n0] < 0) { dist[n0] = next; queue[tail++] = n0; }
        if (dist[n1] < 0) { dist[n1] = next; queue[tail++] = n1; }
        if (dist[n2] < 0) { dist[n2] = next; queue[tail++] = n2; }
        if (dist[n3] < 0) { dist[n3] = next; queue[tail++] = n3; }
      }
      return dist;
    }

    /** Bilinear value noise with wrapped lattice lookups. */
    private static sample(
      lattice: Float32Array, cx: number, cy: number, x: number, y: number,
    ): number {
      const fx = (x / GRID_W) * cx;
      const fy = (y / GRID_H) * cy;

      const x0 = Math.floor(fx) % cx;
      const y0 = Math.floor(fy) % cy;
      const x1 = (x0 + 1) % cx;
      const y1 = (y0 + 1) % cy;

      const tx = smoothstep(fx - Math.floor(fx));
      const ty = smoothstep(fy - Math.floor(fy));

      const top = lerp(lattice[y0 * cx + x0], lattice[y0 * cx + x1], tx);
      const bottom = lerp(lattice[y1 * cx + x0], lattice[y1 * cx + x1], tx);
      return lerp(top, bottom, ty);
    }

    /**
     * Rescale raw fBm to [-1, 1] with sea level at exactly 0, placing the
     * shoreline at the `oceanShare` percentile so every planet is habitable.
     */
    private static normalize(out: Float32Array, oceanShare: number): void {
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < out.length; i++) {
        if (out[i] < min) min = out[i];
        if (out[i] > max) max = out[i];
      }
      const span = max - min || 1;

      const sorted = new Float32Array(out.length);
      for (let i = 0; i < out.length; i++) {
        out[i] = (out[i] - min) / span;
        sorted[i] = out[i];
      }
      sorted.sort();
      const seaLevel = sorted[Math.floor(oceanShare * (sorted.length - 1))];

      const above = Math.max(1e-4, 1 - seaLevel);
      const below = Math.max(1e-4, seaLevel);

      for (let i = 0; i < out.length; i++) {
        const d = out[i] - seaLevel;
        const v = d >= 0 ? d / above : d / below;
        // Gamma > 1 broadens continental shelves and coastal plains.
        out[i] = Math.sign(v) * Math.pow(Math.abs(v), 1.3);
      }
    }
  }

  /* -------------------------------------------------------------------------- */

  /** The complete simulation state. */
  export class WorldState {
    /* ---- per-tile fields ---- */
    readonly elevation = new Float32Array(TILE_COUNT);     // -1 .. 1
    readonly temperature = new Float32Array(TILE_COUNT);   // degrees Celsius
    readonly moisture = new Float32Array(TILE_COUNT);      // 0 .. 1
    readonly biome = new Uint8Array(TILE_COUNT);           // Biome
    /**
     * The plant layer. In SimEarth the *biomes* are the vegetation and the life
     * classes are the animals living in them, so this is what actually
     * photosynthesises — and what decides whether land reads as barren Rock or
     * as Forest/Jungle/Swamp.
     */
    readonly vegetation = new Float32Array(TILE_COUNT);    // 0 .. 1
    /**
     * Which plant groups grow on each tile, one bit per `Flora` value. Saved
     * as-is, so the bit numbers are stable identifiers.
     */
    readonly flora = new Uint16Array(TILE_COUNT);
    /** The plant group that shapes the tile — drawn, and read by the biome. */
    readonly floraTop = new Uint8Array(TILE_COUNT);
    /**
     * The succession stage of a land tile (`Landscape`): what the map draws and
     * what the habitat biome is derived from. Unused on water.
     */
    readonly landscape = new Uint8Array(TILE_COUNT);
    /**
     * The stage a land tile is heading for next, or LANDSCAPE_UNSET on water
     * and on land that has no succession state yet (a new planet, a migrated
     * save, land just risen from the sea) — such tiles start at their target.
     */
    readonly landscapeNext = new Uint8Array(TILE_COUNT).fill(LANDSCAPE_UNSET);
    /** Ticks `landscapeNext` has been the next stage without interruption. */
    readonly landscapeHold = new Uint8Array(TILE_COUNT);
    /** Density step of the landscape, 0..LANDSCAPE_DENSITIES[landscape]-1. */
    readonly landscapeDensity = new Uint8Array(TILE_COUNT);
    /** What the ground is made of (`Substrate`). Derived each tick. */
    readonly substrate = new Uint8Array(TILE_COUNT);
    /** Soil maturity, 0..255: built up by roots, lost to erosion and ice. */
    readonly soil = new Uint8Array(TILE_COUNT);
    /**
     * Climate zone per land tile (see `landscapeZone`): the memory of the
     * landscape's Schmitt triggers. Derived, not saved.
     */
    readonly landscapeZone = new Uint16Array(TILE_COUNT).fill(ZONE_NONE);
    /**
     * 1 on ground the player's terraforming brush has shaped: its summits
     * carry snow whatever the climate (SUMMIT_SNOW_ELEVATION), its low coasts
     * are sand (terraformSand). Natural relief never sets it. Rides the
     * plates; saved as the optional `terraformed` field.
     */
    readonly terraformed = new Uint8Array(TILE_COUNT);
    /** Tick at which succession last advanced; it advances once per tick. */
    successionTick = -1;
    /** Plate shifts so far (bookkeeping): tells caches keyed by tile that the crust moved. */
    driftShifts = 0;
    /**
     * The animal layer, as a community rather than a single occupant: every
     * class carries its own density on every tile, indexed by `lifeIdx(i, c)`.
     * Competition then falls out of a shared carrying capacity instead of the
     * displacement special cases a one-class-per-tile model needs, and a
     * descendant can arise alongside its ancestor instead of erasing it.
     */
    readonly lifeDensity = new Float32Array(TILE_COUNT * LIFE_COUNT);  // 0 .. 1
    /** Sub-species stage 0..SUBSPECIES_PER_CLASS-1, same indexing. */
    readonly lifeStage = new Uint8Array(TILE_COUNT * LIFE_COUNT);
    readonly tech = new Uint8Array(TILE_COUNT);            // Tech (0 = no city)
    readonly cityPop = new Float32Array(TILE_COUNT);       // 0 .. 1
    /** What a civilization made of a tile beside its cities, by LAND_USE_* bits (civstate.ts). Derived, never saved. */
    readonly landUse = new Uint8Array(TILE_COUNT);
    readonly magma = new Float32Array(TILE_COUNT);         // mantle upwelling
    /**
     * Strength of the orogenic belt under each tile, 0..1. Laid down once with
     * the crust (`shapeCrust`) and thereafter the rate at which `GeoSystem`
     * keeps pushing the crust up, so ranges stand against erosion instead of
     * being ground flat over a long game. Rides the plates like the crust does.
     */
    readonly uplift = new Float32Array(TILE_COUNT);
    /**
     * Mountain type of the crust (`UpliftKind`): fold belt, coastal range,
     * island arc or hotspot track. Set where the crust is raised, rides the
     * plates like `uplift`.
     */
    readonly upliftKind = new Uint8Array(TILE_COUNT);
    readonly eventKind = new Uint8Array(TILE_COUNT);       // EventKind
    readonly eventTtl = new Uint8Array(TILE_COUNT);        // ticks remaining

    /* ---- rivers: derived from elevation, never saved ---- */
    /** Upstream discharge, in units of one average land tile's runoff. */
    readonly riverFlow = new Float32Array(TILE_COUNT);
    /** Tile this one drains into, or -1 for the sea and for water tiles. */
    readonly riverDown = new Int32Array(TILE_COUNT).fill(-1);
    /** 0 where no river runs, else its size 0.25 .. 1. */
    readonly riverLevel = new Float32Array(TILE_COUNT);
    /**
     * Moisture floor a river holds over itself and its banks, 0..1 of local
     * capacity. This is the whole mechanism behind a green corridor through a
     * desert: it feeds `ClimateSystem`, which feeds vegetation, which feeds the
     * biome — no special case anywhere in the chain.
     */
    readonly riparian = new Float32Array(TILE_COUNT);
    /**
     * Set whenever the crust moves, so the river network is rebuilt instead of
     * describing terrain that no longer exists. Cleared by `RiverSystem`.
     */
    terrainDirty = true;

    /* ---- global atmosphere ---- */
    co2 = 400;    // parts per million
    o2 = 0;       // percent
    n2 = 78;      // percent of today's air: nitrogen's partial pressure (see airPressure)
    ch4 = 0;      // parts per million
    vapor = 0.45; // 0 .. 1 saturation
    dust = 0.02;  // 0 .. 1 opacity

    /* ---- ocean chemistry (see OceanChemistry) ---- */
    /** Dissolved iron (Fe²⁺) left in the sea, 1 = a young ocean's full load. */
    oceanIron = 1;
    /** Dissolved oxygen in percent of today's saturation (can pass 100). */
    oceanO2 = 0;

    /* ---- coal and the giant clubmosses (see CoalSystem, lycopsids.ts) ---- */
    /** Usable coal in the crust of the whole planet, Gt. */
    coal = 0;
    /** Buried swamp peat still maturing into coal, Gt. */
    coalPeat = 0;
    /** Coal civilizations have mined so far, Gt. */
    coalMined = 0;
    /* ---- wood (see wood.ts) ---- */
    /** Standing wood in the woodland of the whole planet, Gt; derived from the cover every tick. */
    wood = 0;
    /** Wood cities have cut so far, Gt. */
    woodCut = 0;
    /**
     * How deep a city's logging has cut each tile: its plant cover may reach
     * at most 1 − logged/255 (flora.ts) until it grows back. Rides the
     * plates; saved in the optional `wood` field.
     */
    readonly logged = new Uint8Array(TILE_COUNT);
    /* ---- oil from dead sea animals (see OilSystem) ---- */
    /** Usable oil in the crust of the whole planet, Gt. */
    oil = 0;
    /** Buried kerogen still maturing into oil, Gt. */
    oilKerogen = 0;
    /** Oil civilizations have pumped so far, Gt. */
    oilMined = 0;
    /** Tiles of the oil platform and the desert derrick, placed once with the Industrial age; −1 before (oil.ts). */
    oilRigSea = -1;
    oilRigLand = -1;
    /** Tile of the termite mound on the savanna, −1 for none (termites.ts). */
    termiteMound = -1;
    /** Tile of the kapok tree in the largest rainforest, −1 for none (kapok.ts). */
    kapokTree = -1;
    /** A bit per plant group whose era is over for good (lycopsids.ts). */
    floraEnded = 0;
    /** Set for good once conifer and broadleaf forests have displaced the giant clubmosses. */
    get lycopsidsGone(): boolean {
      return (this.floraEnded & floraBit(Flora.Clubmosses)) !== 0;
    }
    set lycopsidsGone(gone: boolean) {
      this.floraEnded = gone ? this.floraEnded | floraBit(Flora.Clubmosses) : this.floraEnded & ~floraBit(Flora.Clubmosses);
    }

    /* ---- sub-species gone for good (stagefates.ts) ---- */
    /** Per class, a bit per sub-species its successor has displaced. */
    readonly stageEnded = new Uint8Array(LIFE_COUNT);
    /** Loaded from a save without that record: the first tick learns it without news. */
    fatesQuiet = false;

    /* ---- evolution ---- */
    /** The tree: developed steps, evolution points, chronicle. */
    readonly evo = new EvolutionState();
    /** Where the planet stands in the dinosaurs' era and the choice about its end (dinoera.ts). */
    readonly dinoEra = new DinoEraState();
    /** The space project of its civilization: launch site, rocket, launch (spaceport.ts). */
    readonly space = new SpaceState();

    /* ---- bookkeeping ---- */
    ticks = 0;
    omega = OMEGA_START;
    seed = 1;
    rng = new Rng(1);
    timeScale: TimeScale = TimeScale.Geologic;
    /** Total years since the planet formed. */
    absoluteYears = 0;
    /** Years elapsed inside the current time scale. */
    scaleYears = 0;
    /** Set once a sentient species founds its first city. */
    sentientClass: Life = Life.None;
    /** Cities, tribes and settlers beside the grid; never saved, derived from `tech`/`cityPop` after a load. */
    readonly civ = new CivState();
    /** Running disasters and the scars they leave (docs/ereignisse-spec.md). */
    readonly hazards = new HazardState();
    name = 'Erde';

    /* ---- derived, refreshed every tick ---- */
    globalTemp = 14;
    oceanFraction = OCEAN_FRACTION;
    readonly biomeCounts = new Uint32Array(BIOME_COUNT);
    readonly lifeCounts = new Uint32Array(LIFE_COUNT);
    /** Tiles carrying each plant group. */
    readonly floraCounts = new Uint32Array(FLORA_COUNT);
    readonly techCounts = new Uint32Array(TECH_COUNT);
    /** Summed habitat density across the planet, per life class. */
    readonly lifeBiomass = new Float32Array(LIFE_COUNT);
    /**
     * Planet age at which each class first appeared, or -1 if it never has.
     * Float64 because absoluteYears reaches billions and Float32 would start
     * rounding away whole millennia.
     */
    readonly lifeFirstSeen = new Float64Array(LIFE_COUNT).fill(-1);
    totalBiomass = 0;
    /** Tiles carrying any life at all — the honest "% cover" figure. */
    inhabitedTiles = 0;
    /**
     * Tiles per class per sub-species stage, indexed
     * `[c * SUBSPECIES_PER_CLASS + stage]`. Derived — it is what lets the
     * biosphere cap how much of a class may stand on the higher rungs.
     */
    readonly lifeStageCounts = new Uint32Array(LIFE_COUNT * SUBSPECIES_PER_CLASS);
    /** Most abundant class on each tile, or Life.None. Derived, never written to. */
    readonly dominantLife = new Uint8Array(TILE_COUNT);
    /** Summed density of every class on the tile. Derived. */
    readonly tileBiomass = new Float32Array(TILE_COUNT);
    /** Land plant cover summed over the planet, per tile of planet, 0..1. */
    vegetationCoverage = 0;
    /** Marine algae cover summed over the planet, per tile of planet, 0..1. */
    algaeCoverage = 0;
    /** Share of the whole planet held by marine and by terrestrial classes. */
    seaLifeCoverage = 0;
    landLifeCoverage = 0;
    totalCityPop = 0;
    highestLife: Life = Life.None;
    /** 0 = horror, 1 = bliss. Drives the Gaia face. */
    gaiaMood = 0.5;

    /**
     * Build a brand new planet from a seed, with `oceanShare` of it under the
     * sea unless the epoch sets its own sea.
     */
    reset(seed: number, oceanShare = OCEAN_FRACTION, epoch: EpochId = 'random'): void {
      this.seed = seed >>> 0;
      this.rng = new Rng(this.seed);

      shapeCrust(this, epoch, clamp(oceanShare, OCEAN_SHARE_MIN, OCEAN_SHARE_MAX));
      shapeBelts(this, epoch);

      this.co2 = 400;
      this.o2 = 0;
      this.n2 = 78;
      this.ch4 = 0;
      this.vapor = 0.45;
      this.dust = 0.02;
      this.oceanIron = 1;
      this.oceanO2 = 0;
      this.coal = 0;
      this.coalPeat = 0;
      this.coalMined = 0;
      this.wood = 0;
      this.woodCut = 0;
      this.logged.fill(0);
      this.oil = 0;
      this.oilKerogen = 0;
      this.oilMined = 0;
      this.oilRigSea = -1;
      this.oilRigLand = -1;
      this.termiteMound = -1;
      this.kapokTree = -1;
      this.floraEnded = 0;
      this.stageEnded.fill(0);
      this.fatesQuiet = false;
      this.ticks = 0;
      this.omega = OMEGA_START;
      this.timeScale = TimeScale.Geologic;
      this.absoluteYears = 0;
      this.scaleYears = 0;
      this.sentientClass = Life.None;
      this.civ.clear();
      this.civ.clearWorks();
      this.hazards.clear();

      this.vegetation.fill(0);
      this.flora.fill(0);
      this.floraTop.fill(0);
      this.landscape.fill(0);
      this.landscapeNext.fill(LANDSCAPE_UNSET);
      this.landscapeHold.fill(0);
      this.landscapeDensity.fill(0);
      this.substrate.fill(0);
      this.soil.fill(0);
      this.landscapeZone.fill(ZONE_NONE);
      this.terraformed.fill(0);
      this.successionTick = -1;
      this.driftShifts = 0;
      this.evo.reset();
      this.dinoEra.reset();
      this.space.reset();
      this.lifeDensity.fill(0);
      this.lifeStage.fill(0);
      this.lifeFirstSeen.fill(-1);
      this.tech.fill(0);
      this.cityPop.fill(0);
      this.landUse.fill(0);
      this.eventKind.fill(0);
      this.eventTtl.fill(0);

      this.riverFlow.fill(0);
      this.riverDown.fill(-1);
      this.riverLevel.fill(0);
      this.riparian.fill(0);
      this.terrainDirty = true;

      // Seed the climate on the WARM branch of the ice-albedo feedback. Seeding
      // it cold instead freezes half the world permanently, because a frozen
      // tile reflects enough sunlight to stay frozen where open water would not.
      for (let y = 0; y < GRID_H; y++) {
        const insolation = ClimateSystem.insolationAt(y, 0.5);
        for (let x = 0; x < GRID_W; x++) {
          const i = idx(x, y);
          const e = this.elevation[i];
          let t = SOLAR_INPUT_BASE * insolation * 0.8 - RADIATIVE_OFFSET + 20.5;
          if (e > 0) t -= e * ELEVATION_KM * LAPSE_RATE;
          this.temperature[i] = t;
          this.moisture[i] = e < 0 ? 1 : 0.45;
        }
      }

      // Before the first biome pass: the river corridors are part of what makes
      // a tile wet, and a planet that opened with dry riverbeds would spend its
      // first hundred ticks visibly greening up out of nothing.
      RiverSystem.rebuild(this);

      // Classify first, then count: the derived tallies describe the biomes,
      // so the other order showed the previous planet's distribution until
      // the first tick.
      BiomeSystem.step(this, false);
      this.refreshDerived();
    }

    /**
     * Take over another world's entire state. The loader validates a save
     * into a staging world and commits it with this, so the live planet is
     * either untouched or completely replaced — never half of each.
     */
    copyFrom(o: WorldState): void {
      this.elevation.set(o.elevation);
      this.temperature.set(o.temperature);
      this.moisture.set(o.moisture);
      this.biome.set(o.biome);
      this.vegetation.set(o.vegetation);
      this.flora.set(o.flora);
      this.floraTop.set(o.floraTop);
      this.landscape.set(o.landscape);
      this.landscapeNext.set(o.landscapeNext);
      this.landscapeHold.set(o.landscapeHold);
      this.landscapeDensity.set(o.landscapeDensity);
      this.substrate.set(o.substrate);
      this.soil.set(o.soil);
      this.landscapeZone.set(o.landscapeZone);
      this.terraformed.set(o.terraformed);
      this.successionTick = o.successionTick;
      this.driftShifts = o.driftShifts;
      this.lifeDensity.set(o.lifeDensity);
      this.lifeStage.set(o.lifeStage);
      this.tech.set(o.tech);
      this.cityPop.set(o.cityPop);
      this.magma.set(o.magma);
      this.uplift.set(o.uplift);
      this.upliftKind.set(o.upliftKind);
      this.eventKind.set(o.eventKind);
      this.eventTtl.set(o.eventTtl);
      this.lifeFirstSeen.set(o.lifeFirstSeen);
      this.terrainDirty = true;

      this.co2 = o.co2;
      this.o2 = o.o2;
      this.n2 = o.n2;
      this.ch4 = o.ch4;
      this.vapor = o.vapor;
      this.dust = o.dust;
      this.oceanIron = o.oceanIron;
      this.oceanO2 = o.oceanO2;
      this.coal = o.coal;
      this.coalPeat = o.coalPeat;
      this.coalMined = o.coalMined;
      this.wood = o.wood;
      this.woodCut = o.woodCut;
      this.logged.set(o.logged);
      this.oil = o.oil;
      this.oilKerogen = o.oilKerogen;
      this.oilMined = o.oilMined;
      this.oilRigSea = o.oilRigSea;
      this.oilRigLand = o.oilRigLand;
      this.termiteMound = o.termiteMound;
      this.kapokTree = o.kapokTree;
      this.floraEnded = o.floraEnded;
      this.stageEnded.set(o.stageEnded);
      this.ticks = o.ticks;
      this.omega = o.omega;
      this.seed = o.seed;
      this.rng = new Rng(o.seed);
      this.rng.setState(o.rng.getState());
      this.timeScale = o.timeScale;
      this.absoluteYears = o.absoluteYears;
      this.scaleYears = o.scaleYears;
      this.sentientClass = o.sentientClass;
      this.civ.clear();
      this.civ.clearWorks();
      this.landUse.fill(0);
      this.hazards.copyFrom(o.hazards);
      this.dinoEra.copyFrom(o.dinoEra);
      this.space.copyFrom(o.space);
      this.name = o.name;

      const evo = this.evo;
      evo.reset();
      evo.ep = o.evo.ep;
      for (const [k, v] of o.evo.developed) evo.developed.set(k, v);
      for (const k of o.evo.reported) evo.reported.add(k);
      for (const e of o.evo.chronicle) evo.chronicle.push(e);
      for (const k of o.evo.extinct) evo.extinct.add(k);
      for (const [k, v] of o.evo.readySince) evo.readySince.set(k, v);
    }

    /**
     * Years advanced by one tick: the Earth calendar until a civilization
     * runs the clock, then the fixed steps of its time scale.
     */
    get yearsPerTick(): number {
      return this.timeScale <= TimeScale.Evolution ? yearsPerTickAt(this.absoluteYears) : YEARS_PER_TICK[this.timeScale];
    }

    /**
     * Bumped on every refresh of the derived state — by the tick and by any
     * player edit — so views can tell "the world changed" apart from "time
     * passed", which is what keeps a paused planet's displays honest.
     */
    revision = 0;

    /** Recompute cached aggregates used by the HUD, panels and other systems. */
    refreshDerived(): void {
      this.revision++;
      let weighted = 0;
      let weightSum = 0;
      let water = 0;

      this.biomeCounts.fill(0);
      this.lifeCounts.fill(0);
      this.floraCounts.fill(0);
      this.techCounts.fill(0);
      this.lifeBiomass.fill(0);
      this.lifeStageCounts.fill(0);
      this.totalBiomass = 0;
      this.totalCityPop = 0;
      this.inhabitedTiles = 0;
      let vegSum = 0;
      let algaeSum = 0;

      for (let y = 0; y < GRID_H; y++) {
        // Weight by cos(latitude): polar rows cover far less area than the
        // equator on a real sphere, so an unweighted mean would run cold.
        const w = Math.max(0.05, Math.cos((latitudeDeg(y) * Math.PI) / 180));
        for (let x = 0; x < GRID_W; x++) {
          const i = idx(x, y);
          weighted += this.temperature[i] * w;
          weightSum += w;
          if (this.elevation[i] < 0) {
            water++;
            algaeSum += this.vegetation[i];
          } else {
            vegSum += this.vegetation[i];
          }

          this.biomeCounts[this.biome[i]]++;
          let fm = this.flora[i];
          while (fm !== 0) {
            const g = 31 - Math.clz32(fm & -fm);
            fm &= fm - 1;
            this.floraCounts[g]++;
          }

          // Walk the tile's community once: totals, who dominates, how full.
          const base = i * LIFE_COUNT;
          let tileSum = 0;
          let best = Life.None;
          let bestDensity = 0;
          for (let c = 1; c < LIFE_COUNT; c++) {
            const d = this.lifeDensity[base + c];
            if (d <= 0) continue;
            this.lifeCounts[c]++;
            this.lifeBiomass[c] += d;
            this.lifeStageCounts[c * SUBSPECIES_PER_CLASS + this.lifeStage[base + c]]++;
            tileSum += d;
            if (d > bestDensity) {
              bestDensity = d;
              best = c as Life;
            }
          }
          this.tileBiomass[i] = tileSum;
          this.dominantLife[i] = best;
          this.totalBiomass += tileSum;
          if (best !== Life.None) this.inhabitedTiles++;

          const t = this.tech[i];
          if (t !== Tech.None) {
            this.techCounts[t]++;
            this.totalCityPop += this.cityPop[i];
          }
        }
      }

      this.globalTemp = weighted / weightSum;
      this.oceanFraction = water / TILE_COUNT;
      this.vegetationCoverage = vegSum / TILE_COUNT;
      this.algaeCoverage = algaeSum / TILE_COUNT;

      let sea = 0;
      let land = 0;
      for (let c = 1; c < LIFE_COUNT; c++) {
        if (isSeaLife(c as Life)) sea += this.lifeBiomass[c];
        else land += this.lifeBiomass[c];
      }
      this.seaLifeCoverage = sea / TILE_COUNT;
      this.landLifeCoverage = land / TILE_COUNT;

      // "Highest life form achieved", as the Report window puts it.
      this.highestLife = Life.None;
      for (let c = LIFE_COUNT - 1; c >= 1; c--) {
        if (this.lifeCounts[c] > 0) {
          this.highestLife = c as Life;
          break;
        }
      }

      // Stamp each class the first time it ever appears, so Examine can report
      // how long a lineage has been on the planet. Never cleared on extinction:
      // a class that dies out and is re-seeded keeps its original debut.
      for (let c = 1; c < LIFE_COUNT; c++) {
        if (this.lifeCounts[c] > 0 && this.lifeFirstSeen[c] < 0) {
          this.lifeFirstSeen[c] = this.absoluteYears;
        }
      }

      this.gaiaMood = this.computeGaiaMood();
    }

    /**
     * Gaia's mood: how comfortable the planet is for the life currently on it.
     * Bliss needs a temperate climate, a broad biosphere and clean air.
     */
    private computeGaiaMood(): number {
      const f = this.gaiaFactors();
      return clamp(f.climate * 0.3 + f.life * 0.25 + f.diversity * 0.2 + f.clean * 0.25, 0, 1);
    }

    /** The four things Gaia's mood is made of, each 0..1, and the group count behind one. */
    gaiaFactors(): { climate: number; life: number; diversity: number; clean: number; groups: number } {
      // Temperature comfort peaks around 15 °C and falls away either side.
      const tempScore = clamp(1 - Math.abs(this.globalTemp - 15) / 35, 0, 1);

      // Biosphere coverage, saturating well before the whole planet is full.
      // Measured in inhabited tiles rather than summed density: with several
      // classes sharing a tile, biomass no longer has a natural ceiling of one
      // per tile and would run this straight to 1 on any living planet.
      const lifeScore = clamp(this.lifeCover / 0.35, 0, 1);

      // Diversity: how many animal classes and plant groups live here at all.
      let present = 0;
      for (let c = 1; c < LIFE_COUNT; c++) if (this.lifeCounts[c] > 0) present++;
      for (let g = 1; g < FLORA_COUNT; g++) if (this.floraCounts[g] > 0) present++;
      const diversityScore = clamp(present / 12, 0, 1);

      // Pollution: runaway CO2 and dust make her miserable.
      const cleanScore = clamp(1 - (this.co2 - 300) / 2500, 0, 1) * clamp(1 - this.dust * 2, 0, 1);

      return { climate: tempScore, life: lifeScore, diversity: diversityScore, clean: cleanScore, groups: present };
    }

    /** Fraction of the planet covered by a given life class. */
    coverage(c: Life): number {
      return this.lifeBiomass[c] / TILE_COUNT;
    }

    /**
     * Fraction of the planet carrying any life. This is what the HUD and the
     * Report window mean by "% cover" — summed biomass would exceed 1 now that
     * a tile can hold several classes at once.
     */
    get lifeCover(): number {
      return this.inhabitedTiles / TILE_COUNT;
    }

    /** Density of one class on one tile. */
    density(i: number, c: Life): number {
      return this.lifeDensity[i * LIFE_COUNT + c];
    }

    /** Sub-species stage of one class on one tile. */
    stage(i: number, c: Life): number {
      return this.lifeStage[i * LIFE_COUNT + c];
    }

    /** Classes present on a tile, most abundant first. */
    speciesOn(i: number): Life[] {
      const out: Life[] = [];
      const base = i * LIFE_COUNT;
      for (let c = 1; c < LIFE_COUNT; c++) {
        if (this.lifeDensity[base + c] > 0) out.push(c as Life);
      }
      out.sort((a, b) => this.lifeDensity[base + b] - this.lifeDensity[base + a]);
      return out;
    }

    /** True if the tile is below sea level. */
    isWater(i: number): boolean {
      return this.elevation[i] < 0;
    }

    /** Altitude in metres, as the Examine window reports it. */
    altitudeMeters(i: number): number {
      return Math.round(elevationMeters(this.elevation[i]));
    }

    /** Rainfall in cm/year, as the Examine window reports it. */
    rainfallCm(i: number): number {
      return this.moisture[i] * 400;
    }
  }
}
