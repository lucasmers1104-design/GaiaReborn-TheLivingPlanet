/* =============================================================================
 * SimEarth 2.0 — civilization
 * -----------------------------------------------------------------------------
 * A rule of this game: on their own only the hominids wake up, once the comet
 * has ended the dinosaurs, or the dinosaurs if they lived on. Insects, birds
 * and the other land classes able to think need the Monolith (app.ts).
 * This is the tick of the civilization: wandering bands before the first
 * villages (bands.ts), cities (cities.ts), peoples (tribes.ts), settlers
 * (migration.ts), hunger and epidemics (epidemic.ts),
 * conflicts and atomic war (conflict.ts), and from the Nanotech age the
 * space project (spaceport.ts).
 * Cities burn energy drawn from the four sources on the Civilization Model
 * Control Panel, and a fossil-heavy mix warms the planet that hosts it.
 * ========================================================================== */

namespace SE {
  export class CivSystem {
    /**
     * Density a sentience-capable class needs on a tile before it can wake up.
     *
     * Deliberately well below one: a tile is a community, so its leading class
     * shares the carrying capacity with everything else living there and an
     * equilibrium around a third of the tile already means "these animals run
     * this place". The old 0.75 assumed a tile had a single occupant, and once
     * species began coexisting no tile on the planet ever reached it — no city
     * site was ever found and sentience simply never happened.
     */
    private static readonly SENTIENCE_DENSITY = 0.35;
    /**
     * Planet-wide coverage it needs as well. Kept low on purpose: land classes
     * partition the continents between them, so even a dominant one rarely
     * holds more than a few percent of the whole planet.
     */
    private static readonly SENTIENCE_COVERAGE = 0.02;
    /** Random numbers the old city sampling drew per tick (5 % of the tiles); see `step`. */
    private static readonly LEGACY_DRAWS = Math.floor(TILE_COUNT * 0.05);

    /** Set when a civilization advances or is founded, for the message bar. */
    lastNotice = '';
    /** What kind of thing `lastNotice` reports, for the chronicle. */
    lastKind: 'sentience' | 'tech' | 'war' | '' = '';
    /** Tech level reached when `lastKind` is 'tech'. */
    lastTech = Tech.None;

    /** One tick. Further news for the player is in `world.civ.news` afterwards. */
    step(world: WorldState, params: ModelParams, atmo: AtmosphereSystem): void {
      this.lastNotice = '';
      this.lastKind = '';
      const civ = world.civ;
      civ.news.length = 0;
      if (!civ.synced) deriveCities(world, params);
      const asleep = world.sentientClass === Life.None;
      this.emergeSentience(world, params);
      // The per-tile city sampling this file had before the 2026-10 rework drew
      // these numbers every tick, cities or not. Drawing them until a mind wakes
      // keeps every planet's history before civilization exactly as it was, so
      // seeds tuned and tested elsewhere still mean the same planet.
      if (asleep) for (let n = 0; n < CivSystem.LEGACY_DRAWS; n++) world.rng.next();
      const drifted = reconcileCities(world, params);
      stepBands(world, params);
      if (civ.cities.length === 0 && civ.settlers.length === 0) {
        // Peoples whose last city just fell go now, or a new city finds every colour taken.
        updateTribes(world);
        // The last city's fields go with it.
        stepFields(world, params);
        return;
      }

      if (!drifted && world.ticks % CITY_CAPACITY_EVERY === 0) refreshCapacities(world, params);
      growCities(world, params);
      // Before the tech step: a city that reaches Nanotech now opens the project next tick, after its age's news.
      stepSpaceport(world);
      this.announceTech(world, advanceCityTech(world, params));
      updateTribes(world);
      splitTribes(world);
      moveSettlers(world, params, drifted);
      sendSettlers(world);
      spreadEpidemics(world, params);
      stepConflicts(world, params);
      // What a civilization builds and changes round its cities (docs/bewegung-2026-10).
      stepDiscovery(world, params);
      stepFleets(world, params);
      stepWonders(world, params);
      stepRailway(world, params);
      stepWood(world, params);
      stepFields(world, params);
      this.consumeEnergy(world, params, atmo);
      mineCoal(world, coalDemand(world, params));
      pumpOil(world, oilDemand(world, params));
      placeOilRigs(world);
      this.warfare(world, params);
    }

    /**
     * Bring the records in line with the grid outside the tick: derive them
     * after a load (spec §2.11), adopt or drop cities after an edit. News is
     * in `world.civ.news` afterwards.
     */
    sync(world: WorldState, params: ModelParams): void {
      world.civ.news.length = 0;
      if (!world.civ.synced) deriveCities(world, params);
      else reconcileCities(world, params);
      updateTribes(world);
      // Fields at once, so a loaded or edited planet shows them before its next tick.
      stepFields(world, params);
    }

    /* --------------------------------------------------------- sentience -- */

    /**
     * Look for a class that is both widespread and locally dense, then let it
     * cross the threshold into tool use: its first bands set out around the
     * best site (bands.ts).
     */
    private emergeSentience(world: WorldState, params: ModelParams): void {
      if (world.sentientClass !== Life.None) return;
      // A mind needs an oxygen-rich atmosphere — but planets settle anywhere
      // between 16% and 20%, and at the old 17 a world at the low end could
      // never produce a civilization however well its mammals were doing.
      if (world.o2 < 14) return;

      const chance = 0.0009 * mul(params.bio.evolutionRate);
      if (!world.rng.chance(chance)) return;

      const best = CivSystem.sentienceCandidate(world);
      if (best === Life.None) return;

      const buildSite = this.bestCitySite(world, params, best);
      if (buildSite < 0) return; // nowhere worth settling yet — try again later

      world.sentientClass = best;
      spawnBands(world, buildSite);
      this.lastNotice = `${mindName(world)} entwickeln Intelligenz. Kleine Gruppen ziehen umher und schlagen Lager auf.`;
      this.lastKind = 'sentience';
    }

    /** Lowest sub-species of class `c` that may wake up on its own now, or -1 (see the file header). */
    static naturalMindStage(world: WorldState, c: Life): number {
      if (c === Life.Mammal) return dinoEraHolds(world) ? -1 : HOMINID_STAGE;
      if (c === Life.Dinosaur) return world.dinoEra.fate === 'kept' ? 0 : -1;
      return -1;
    }

    /**
     * The class allowed to wake up on its own that holds the most of the
     * planet, or Life.None. Sea classes build no civilization (spec §2.12).
     */
    static sentienceCandidate(world: WorldState): Life {
      let best: Life = Life.None;
      let bestBiomass = 0;
      for (let c = 1; c < LIFE_COUNT; c++) {
        const cls = c as Life;
        if (CivSystem.naturalMindStage(world, cls) < 0) continue;
        if (world.coverage(cls) < CivSystem.SENTIENCE_COVERAGE) continue;
        if (world.lifeBiomass[cls] > bestBiomass) {
          bestBiomass = world.lifeBiomass[cls];
          best = cls;
        }
      }
      return best;
    }

    /** The best site where the species leads its tiles, has reached its thinking form and a first city could feed itself. */
    private bestCitySite(world: WorldState, params: ModelParams, species: Life): number {
      const minStage = CivSystem.naturalMindStage(world, species);
      let best = -1;
      let bestScore = -Infinity;
      for (let i = 0; i < TILE_COUNT; i++) {
        // It has to be the tile's leading species, not merely present on it.
        if (world.dominantLife[i] !== species) continue;
        if (world.stage(i, species) < minStage) continue;
        if (world.density(i, species) < CivSystem.SENTIENCE_DENSITY) continue;
        if (!cityGroundFits(world, i, species)) continue;
        if (cityCapacity(world, i, Tech.Stone, params) < SENTIENCE_SITE_CAPACITY) continue;
        const score = citySiteScore(world, i);
        if (score > bestScore) { bestScore = score; best = i; }
      }
      return best;
    }

    /* ------------------------------------------------------------ cities -- */

    /** Only announce a level the planet has never reached before. */
    private announceTech(world: WorldState, reached: Tech): void {
      if (reached === Tech.None || world.techCounts[reached] !== 0) return;
      this.lastNotice = reached === Tech.Bronze || reached === Tech.Iron || reached === Tech.Stone
        ? `Die Zivilisation erreicht die ${TECH_NAMES[reached]}.`
        : `Die Zivilisation erreicht das ${TECH_NAMES[reached]}.`;
      this.lastKind = 'tech';
      this.lastTech = reached;
    }

    /**
     * Cities burn energy. Where that energy comes from decides how much carbon
     * and ash the civilization dumps into its own sky.
     */
    private consumeEnergy(
      world: WorldState, params: ModelParams, atmo: AtmosphereSystem,
    ): void {
      // A city stands for the farms and villages of its surroundings, so its
      // people count CITY_WEIGHT times in energy use and breath.
      let total = 0;
      let people = 0;
      for (const c of world.civ.cities) {
        const pop = world.cityPop[c.tile];
        total += TECH_ENERGY[world.tech[c.tile]] * pop;
        people += pop;
      }
      total *= CITY_WEIGHT;
      people *= CITY_WEIGHT;
      if (total <= 0) return;

      // The atmosphere belongs to the planet, not to the grid. A civilization
      // covering a given fraction of the world has to emit the same however
      // finely that world is cut up, so the raw tile sum is restated on the
      // grid these coefficients were tuned against — see REFERENCE_TILE_COUNT
      // for what happens when it is not.
      const demand = total / GRID_REFINEMENT;

      const mix = params.energyMix();
      // Fossil fuel is the dirty option; nuclear is clean but leaves fallout
      // risk; solar and hydro cost the atmosphere nothing.
      //
      // Carbon is deliberately the dominant term and soot only a trace. With a
      // heavier soot coefficient an industrial civilization dimmed its own sky
      // faster than it warmed it, so the planet *cooled* as CO2 climbed — which
      // both wiped the biosphere within a few hundred ticks and told the player
      // exactly the wrong story about what their factories were doing.
      const burnt = CHEM_RATE * demand * mix.fossilFuel * 0.008;
      atmo.co2Delta += burnt;
      world.gas.add('co2', 'fossil', burnt);
      atmo.dustDelta += demand * mix.fossilFuel * 0.000008;
      // Combustion does consume oxygen, but a heavier coefficient let industry
      // outpace the entire biosphere's photosynthesis and strip the air to 7%,
      // which is not what burning carbon does to a planet.
      const burntO2 = CHEM_RATE * demand * mix.fossilFuel * 0.000015;
      atmo.o2Delta -= burntO2;
      world.gas.add('o2', 'fossil', -burntO2);

      // Every city also breathes.
      const breath = CHEM_RATE * (people / TILE_COUNT) * 0.4;
      atmo.co2Delta += breath;
      world.gas.add('co2', 'cityBreath', breath);
      // Cattle, rice fields and leaking natural gas: methane in step with the carbon.
      atmo.ch4Delta += CIV_CH4_PER_CO2 * (burnt + breath);
    }

    /** At or below this aggression a civilization never starts a nuclear war. */
    static readonly PEACEFUL = 0.2;

    /** How warlike the energy budget makes a civilization; see conflict.ts. */
    static aggression(params: ModelParams): number {
      return mul(params.civAlloc.military) -
        mul(params.civAlloc.philosophy) * 0.6 - mul(params.civAlloc.artMedia) * 0.2;
    }

    /**
     * A heavily militarised, poorly philosophised civilization eventually uses
     * the bomb on a rival people. This is the original's nuclear-winter
     * failure mode.
     */
    private warfare(world: WorldState, params: ModelParams): void {
      const strike = atomicWar(world, params);
      if (!strike) return;
      const text = `Warnung: Atomschlag auf ${strike.target.name}! Ein Krieg zwischen den ${strike.by.name} ` +
        `und den ${strike.on.name} zerstört Städte und Leben.`;
      // A level reached this tick keeps its chronicle entry; the warning goes out as news instead.
      if (this.lastKind === 'tech') {
        world.civ.news.push({ text, tone: 'warn', at: strike.target.tile });
        return;
      }
      this.lastNotice = text;
      this.lastKind = 'war';
    }
  }

  /**
   * Set by the app so civilization can raise disasters without importing the
   * event system directly (which would tangle the dependency order).
   */
  export let civEventSink: ((kind: EventKind, x: number, y: number) => void) | null = null;
}
