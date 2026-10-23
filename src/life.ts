/* =============================================================================
 * SimEarth 2.0 — the animal (and microbial) layer
 * -----------------------------------------------------------------------------
 * A community per tile: every class carries its own density there, and they
 * compete for one shared capacity (Lotka-Volterra with partial niche overlap).
 *
 * What a tile can carry for a class is its biome suitability x temperature x
 * oxygen x *food*, and food is now real: plankton for filter feeders, the
 * algae meadow on the tile for grazers, the plant groups growing there for
 * herbivores, and the prey living there for predators. That one function is
 * also what the evolution tree's habitat test asks, so a step is offered
 * exactly where its populations could live.
 *
 * New classes no longer appear by chance. They are developed in the tree,
 * which founds the first populations next to their ancestors; from there
 * they spread on their own. Sub-species still climb by themselves — they are
 * cosmetic and show a lineage settling in.
 * ========================================================================== */

namespace SE {
  export class LifeSystem {
    /** Per-class oxygen gate, recomputed once a tick — it is global, not local. */
    private readonly o2Gates = new Float32Array(LIFE_COUNT);
    private readonly tempLo = new Float32Array(LIFE_COUNT);
    private readonly tempHi = new Float32Array(LIFE_COUNT);
    private readonly tempCore = new Float32Array(LIFE_COUNT);
    private readonly suitTable = new Float32Array(LIFE_COUNT * BIOME_COUNT);
    private readonly isLand = new Uint8Array(LIFE_COUNT);
    /* Diet, unpacked once so the capacity inner loop reads flat arrays. */
    private readonly dietSelf = new Uint8Array(LIFE_COUNT);
    private readonly dietPlankton = new Float32Array(LIFE_COUNT);
    private readonly dietAlgae = new Float32Array(LIFE_COUNT);
    private readonly dietPlants: (readonly (readonly [number, number])[])[] = [];
    private readonly dietPrey: (readonly Life[])[] = [];
    private readonly dietPreyWeight = new Float32Array(LIFE_COUNT);
    /**
     * Room left for a class on a tile after its rivals have taken theirs —
     * the logistic's actual equilibrium, `capacity - competitive pressure`.
     * Filled by `grow` and read back by `disperse` and `evolve`.
     */
    private readonly headroom = new Float32Array(TILE_COUNT * LIFE_COUNT);
    /** Per tile, the competitive load `Σ density × edge`, written by `grow`. */
    private readonly weightedLoad = new Float32Array(TILE_COUNT);
    /** The same load split by guild, `[tile * GUILD_COUNT + guild]`. */
    private readonly guildLoad = new Float32Array(TILE_COUNT * LifeSystem.GUILD_COUNT);
    private readonly classRaft = new Float32Array(LIFE_COUNT);
    /** Highest sub-species each class may climb to this tick (stageCap). */
    private readonly stageTop = new Uint8Array(LIFE_COUNT);
    /** Which tiles hold anything at all, recorded by `grow`. */
    private readonly occupied = new Uint8Array(TILE_COUNT);
    /** Ambient marine plankton available to filter feeders, 0..0.85. */
    private plankton = 0;
    private preparedTick = -1;
    private preparedWorld: WorldState | null = null;

    /** Density below which a population is no longer viable at all. */
    static readonly MIN_DENSITY = 0.02;
    /** Intrinsic logistic rate per tick, before the reproduction slider and suit. */
    private static readonly GROWTH_RATE = 0.25;
    /** A population disperses once this close to its own capacity. */
    private static readonly MATURE = 0.40;
    /** Only a thoroughly settled population climbs a sub-species. */
    private static readonly STAGE_MATURITY = 0.90;
    /** Per-tick chance a mature population sends founders to one neighbour. */
    private static readonly DISPERSAL_CHANCE = 0.80;
    /**
     * Founders of the first cells (both microbe classes) land 1..CELL_REACH
     * tiles away instead of next door: a tick spans millions of years, so the
     * young sea should fill fast. 4 makes the front three times as fast
     * (35 % of the sea after ~190 instead of ~575 ticks, seeds 4242 and 12345).
     */
    private static readonly CELL_REACH = 4;
    /** Per-tile chance of moving up one sub-species. */
    private static readonly STAGE_ADVANCE = 0.002;
    /** Density a freshly founded population starts at. */
    static readonly FOUNDER_DENSITY = 0.20;
    /** Expected long-distance water crossings per tick for a class. */
    private static readonly RAFT_RATE = 0.002;
    private static readonly RAFT_TRIES = 10;
    /** How much carrying capacity a unit of vegetation feeds on land. */
    static readonly FORAGE = 2.5;
    /**
     * How much of a rival's crowding a class feels. Classes in the same guild
     * - the same way of making a living - overlap strongly; across guilds
     * they share little more than space. A single overlap for every pair made
     * bacteria and the protists that eat them direct rivals, and the complex
     * cells were driven extinct within a few dozen ticks of appearing.
     */
    private static readonly OVERLAP_SAME = 0.65;
    private static readonly OVERLAP_OTHER = 0.2;
    static readonly GUILD_COUNT = 7;
    /**
     * Guild of each class, index = Life: 0 microbial producers, 1 protists,
     * 2 marine invertebrates, 3 marine vertebrates, 4 land invertebrates,
     * 5 ground vertebrates, 6 birds (the air is a niche of its own).
     */
    private static readonly GUILD: readonly number[] = [
      0, // None
      0, // Prokaryote
      1, // Eukaryote
      2, // Radiate
      2, // Arthropod
      2, // Mollusc
      3, // Fish
      3, // Cetacean
      4, // LandArthropod
      4, // Insect
      5, // Amphibian
      5, // Reptile
      5, // Dinosaur
      6, // Avian
      5, // Mammal
      2, // Bilateria
      4, // Pollinator
      5, // Grazer
    ];

    /** Crowding class `c` feels from loads that exclude its own population. */
    private static pressure(c: Life, guildLoadOfC: number, totalLoad: number): number {
      return (LifeSystem.OVERLAP_SAME * guildLoadOfC +
        LifeSystem.OVERLAP_OTHER * (totalLoad - guildLoadOfC)) / LifeSystem.edge(c);
    }

    constructor() {
      for (let c = 0; c < LIFE_COUNT; c++) {
        const def = LIFE[c as Life];
        const diet = def.diet;
        this.isLand[c] = def.realm === 'land' ? 1 : 0;
        this.dietSelf[c] = diet.selfFeeding ? 1 : 0;
        this.dietPlankton[c] = diet.plankton ?? 0;
        this.dietAlgae[c] = diet.algae ?? 0;
        this.dietPlants[c] = diet.plants ?? [];
        this.dietPrey[c] = diet.prey ?? [];
        this.dietPreyWeight[c] = diet.preyWeight ?? 1;
        for (let b = 0; b < BIOME_COUNT; b++) this.suitTable[c * BIOME_COUNT + b] = def.suit[b];
      }
    }

    /* ---------------------------------------------------------------- tick -- */

    stepLife(world: WorldState, params: ModelParams, atmo: AtmosphereSystem): void {
      this.prepare(world, params, true);
      this.grow(world, params);
      // The populations the comet left sheltered outlast its winter (comet.ts).
      if (world.dinoEra.refuges.length > 0) guardCometRefuges(world, this);
      this.disperse(world);
      this.evolve(world, params);
      this.exchangeGases(world, params, atmo);
    }

    /**
     * Hoist everything `capacity` needs that is per class or global rather
     * than per tile: oxygen gates, temperature windows, the plankton supply.
     */
    prepare(world: WorldState, params: ModelParams, force = false): void {
      if (!force && this.preparedWorld === world && this.preparedTick === world.ticks) return;
      this.preparedWorld = world;
      this.preparedTick = world.ticks;

      const tolerance = clamp(mul(params.bio.tolerance), 0.2, 2);
      for (let c = 1; c < LIFE_COUNT; c++) {
        const def = LIFE[c as Life];
        const oxygen = lifeOxygen(c as Life);
        this.o2Gates[c] = oxygen.min <= 0 ? 1 : clamp((oxygenLevel(world, oxygen.medium) - oxygen.min) / (oxygen.full - oxygen.min), 0, 1);
        const mid = (def.temp[0] + def.temp[1]) / 2;
        const half = ((def.temp[1] - def.temp[0]) / 2) * tolerance;
        this.tempLo[c] = mid - half;
        this.tempHi[c] = mid + half;
        this.tempCore[c] = Math.max(1e-6, half * 2 * 0.18);
      }

      // Plankton is ambient throughout a living ocean: it does not vanish
      // because a fish swims above it. Deriving it per tile from the stored
      // producer classes made every consumer eat away the tile that fed it.
      const producers =
        (world.lifeBiomass[Life.Prokaryote] + world.lifeBiomass[Life.Eukaryote]) / TILE_COUNT +
        world.algaeCoverage;
      this.plankton = 0.85 * clamp(producers / 0.06, 0, 1);
    }

    /** What a tile offers a class to eat, 0..1. */
    food(world: WorldState, i: number, c: Life): number {
      if (this.dietSelf[c]) return 1;
      let f = this.dietPlankton[c] * this.plankton;
      if (this.dietAlgae[c] > 0 && world.elevation[i] < 0) {
        f += this.dietAlgae[c] * world.vegetation[i];
      }
      const plants = this.dietPlants[c];
      if (plants.length > 0) {
        const mask = world.flora[i];
        if (mask !== 0 && world.elevation[i] >= 0) {
          const forage = Math.min(1, world.vegetation[i] * LifeSystem.FORAGE);
          let best = 0;
          for (let k = 0; k < plants.length; k++) {
            if ((mask & plants[k][0]) !== 0) best = Math.max(best, plants[k][1] * forage);
          }
          f += best;
        }
      }
      const prey = this.dietPrey[c];
      if (prey.length > 0) {
        const base = i * LIFE_COUNT;
        let p = 0;
        for (let k = 0; k < prey.length; k++) p += world.lifeDensity[base + prey[k]];
        f += this.dietPreyWeight[c] * p;
      }
      return f > 1 ? 1 : f;
    }

    /** Carrying capacity: suitability x temperature x oxygen x food. */
    capacity(world: WorldState, i: number, c: Life): number {
      const o2 = this.o2Gates[c];
      if (o2 <= 0) return 0;
      const suit = this.suitTable[c * BIOME_COUNT + world.biome[i]];
      if (suit <= 0) return 0;
      const t = world.temperature[i];
      const lo = this.tempLo[c];
      const hi = this.tempHi[c];
      if (t <= lo || t >= hi) return 0;
      const core = this.tempCore[c];
      const tempF = Math.min(1, (t - lo) / core, (hi - t) / core);
      return suit * tempF * o2 * this.food(world, i, c);
    }

    /**
     * Room a newcomer of class `c` would actually have on tile `i`: its raw
     * capacity less the crowding of everything already living there. This is
     * what founding, dispersal, the tree's habitat test and the placement
     * tool all use — "could it live here alone" promised room that the
     * incumbents had already taken.
     */
    roomFor(world: WorldState, i: number, c: Life): number {
      const base = i * LIFE_COUNT;
      const guild = LifeSystem.GUILD[c];
      let load = 0;
      let same = 0;
      for (let k = 1; k < LIFE_COUNT; k++) {
        if (k === c) continue;
        const d = world.lifeDensity[base + k];
        if (d <= 0) continue;
        const w = d * LifeSystem.edge(k as Life);
        load += w;
        if (LifeSystem.GUILD[k] === guild) same += w;
      }
      return this.capacity(world, i, c) - LifeSystem.pressure(c, same, load);
    }

    /** Room on a tile from the loads `grow` recorded this tick. */
    private roomFromLoads(world: WorldState, j: number, c: Life): number {
      return this.capacity(world, j, c) - LifeSystem.pressure(
        c, this.guildLoad[j * LifeSystem.GUILD_COUNT + LifeSystem.GUILD[c]], this.weightedLoad[j],
      );
    }

    /**
     * Logistic growth toward the local carrying capacity, with every class on
     * the tile pressing on the same space. Competition is genuine exclusion:
     * a lineage pushed below MIN_DENSITY dies on this tile rather than
     * lingering; what survives a climate swing is its refuges.
     */
    private grow(world: WorldState, params: ModelParams): void {
      const reproduction = mul(params.bio.reproductionRate);
      const density = world.lifeDensity;

      for (let i = 0; i < TILE_COUNT; i++) {
        const base = i * LIFE_COUNT;
        const gBase = i * LifeSystem.GUILD_COUNT;
        for (let g = 0; g < LifeSystem.GUILD_COUNT; g++) this.guildLoad[gBase + g] = 0;
        let weighted = 0;
        let present = 0;
        for (let c = 1; c < LIFE_COUNT; c++) {
          const d = density[base + c];
          if (d <= 0) continue;
          const w = d * LifeSystem.edge(c as Life);
          weighted += w;
          this.guildLoad[gBase + LifeSystem.GUILD[c]] += w;
          present++;
        }
        this.occupied[i] = present > 0 ? 1 : 0;
        this.weightedLoad[i] = weighted;
        if (present === 0) continue;

        for (let c = 1; c < LIFE_COUNT; c++) {
          const d = density[base + c];
          if (d <= 0) continue;
          const k = this.capacity(world, i, c as Life);

          let next: number;
          if (k > 0.02) {
            const mine = d * LifeSystem.edge(c as Life);
            const pressure = LifeSystem.pressure(
              c as Life, this.guildLoad[gBase + LifeSystem.GUILD[c]] - mine, weighted - mine,
            );
            this.headroom[base + c] = k - pressure;
            const suit = this.suitTable[c * BIOME_COUNT + world.biome[i]];
            next = d + d * LifeSystem.GROWTH_RATE * reproduction * suit * (1 - (d + pressure) / k);
          } else {
            // Uninhabitable: the population bleeds out rather than vanishing.
            this.headroom[base + c] = 0;
            next = d - d * 0.07;
          }

          if (next < LifeSystem.MIN_DENSITY) {
            density[base + c] = 0;
            world.lifeStage[base + c] = 0;
          } else {
            density[base + c] = Math.min(1, next);
          }
        }
      }
    }

    /**
     * Colonisation: a population that has filled its own tile sends founders
     * into a neighbour of the same realm, if the incumbents leave room.
     */
    private disperse(world: WorldState): void {
      const rng = world.rng;
      const density = world.lifeDensity;

      const raftChance = this.classRaft;
      for (let c = 1; c < LIFE_COUNT; c++) {
        raftChance[c] = LIFE[c as Life].raft > 0
          ? LifeSystem.RAFT_RATE / Math.max(1, world.lifeCounts[c])
          : 0;
      }

      for (let i = 0; i < TILE_COUNT; i++) {
        if (!this.occupied[i]) continue;
        const base = i * LIFE_COUNT;
        for (let c = 1; c < LIFE_COUNT; c++) {
          const d = density[base + c];
          if (d <= 0) continue;
          const k = this.headroom[base + c];
          if (k <= 0 || d / k < LifeSystem.MATURE) continue;

          if (raftChance[c] > 0 && rng.chance(raftChance[c])) {
            this.raftAcross(world, i, c as Life);
            continue;
          }
          if (!rng.chance(LifeSystem.DISPERSAL_CHANCE)) continue;

          const x = i % GRID_W;
          const y = Math.floor(i / GRID_W);
          const dir = rng.int(4);
          const reach = c === Life.Prokaryote || c === Life.Eukaryote ? 1 + rng.int(LifeSystem.CELL_REACH) : 1;
          const nx = dir === 0 ? wrapX(x - reach) : dir === 1 ? wrapX(x + reach) : x;
          const ny = dir === 2 ? clampY(y - reach) : dir === 3 ? clampY(y + reach) : y;
          const j = idx(nx, ny);
          if (j === i) continue;

          const target = j * LIFE_COUNT + c;
          if (density[target] > 0) continue;
          if (world.isWater(j) !== (LIFE[c as Life].realm === 'sea')) continue;

          const room = this.roomFromLoads(world, j, c as Life);
          if (room < LifeSystem.MIN_DENSITY * 2) continue;

          // Founders start back at the first sub-species still alive: old
          // forms in the core of a range, young ones along its frontier.
          density[target] = LifeSystem.FOUNDER_DENSITY;
          world.lifeStage[target] = firstStage(world, c as Life);
        }
      }
    }

    /** Carry a founding population across open water — driftwood, storms, wings. */
    private raftAcross(world: WorldState, i: number, c: Life): void {
      const reach = LIFE[c].raft;
      const rng = world.rng;
      const x = i % GRID_W;
      const y = Math.floor(i / GRID_W);
      const wantWater = LIFE[c].realm === 'sea';
      const span = reach * 2 + 1;

      for (let tries = 0; tries < LifeSystem.RAFT_TRIES; tries++) {
        const j = idx(wrapX(x + rng.int(span) - reach), clampY(y + rng.int(span) - reach));
        if (j === i || world.isWater(j) !== wantWater) continue;
        const target = j * LIFE_COUNT + c;
        if (world.lifeDensity[target] > 0) continue;
        const room = this.roomFromLoads(world, j, c);
        if (room < LifeSystem.MIN_DENSITY * 2) continue;
        world.lifeDensity[target] = LifeSystem.FOUNDER_DENSITY;
        world.lifeStage[target] = firstStage(world, c);
        return;
      }
    }

    /**
     * Competitive edge of a class, rising gently along the table so a newer
     * class squeezes its ancestors without erasing them. Gentle on purpose:
     * where a class lives should be decided by where it belongs.
     */
    private static edge(c: Life): number {
      return 1 + LifeSystem.RANK[c] * 0.06;
    }

    /** Position of each class along the tree, for `edge`. Index = Life. */
    private static readonly RANK: readonly number[] = [
      0,  // None
      1,  // Prokaryote
      2,  // Eukaryote
      3,  // Radiate
      5,  // Arthropod
      5,  // Mollusc
      6,  // Fish
      12, // Cetacean
      6,  // LandArthropod
      8,  // Insect
      9,  // Amphibian
      10, // Reptile
      11, // Dinosaur
      12, // Avian
      12, // Mammal
      4,  // Bilateria
      11, // Pollinator
      13, // Grazer
    ];

    /**
     * Climb the cosmetic sub-species ladder. A settled population rolls for
     * the next rung, capped so the earlier forms keep existing beside it.
     */
    private evolve(world: WorldState, params: ModelParams): void {
      const rng = world.rng;
      const stageAdvance = LifeSystem.STAGE_ADVANCE * mul(params.bio.mutationRate);
      const microbialAdvance = MICROBIAL_STAGE_ADVANCE * mul(params.bio.mutationRate);
      const density = world.lifeDensity;
      const top = this.stageTop;
      for (let c = 1; c < LIFE_COUNT; c++) top[c] = stageCap(world, c as Life);

      for (let i = 0; i < TILE_COUNT; i++) {
        if (!this.occupied[i]) continue;
        const base = i * LIFE_COUNT;
        for (let c = 1; c < LIFE_COUNT; c++) {
          const d = density[base + c];
          if (d <= 0) continue;
          const k = this.headroom[base + c];
          if (k <= 0 || d / k < LifeSystem.STAGE_MATURITY) continue;
          const stage = world.lifeStage[base + c];
          if (stage >= top[c]) continue;
          // Past the rungs gone for good (stagefates.ts).
          let next = stage + 1;
          while (next <= top[c] && stageGone(world, c as Life, next)) next++;
          if (next > top[c]) continue;
          const rate = c === Life.Prokaryote && stage < CYANOBACTERIA_STAGE ? microbialAdvance : stageAdvance;
          if (this.stageHasRoom(world, c as Life, next) && rng.chance(rate)) {
            world.lifeStage[base + c] = next;
          }
        }
      }
    }

    private stageHasRoom(world: WorldState, c: Life, stage: number): boolean {
      const total = world.lifeCounts[c];
      if (total <= 0) return false;
      let atOrAbove = 0;
      for (let s = stage; s < SUBSPECIES_PER_CLASS; s++) {
        atOrAbove += world.lifeStageCounts[c * SUBSPECIES_PER_CLASS + s];
      }
      return atOrAbove / total < STAGE_MAX_SHARE[stage];
    }

    /**
     * Photosynthesis and respiration. Producers are land vegetation, the
     * microbial plankton and the algae meadows; everything else respires.
     * Sources and sinks alike carry CHEM_RATE, so equilibria are unchanged by
     * it and only the time to reach them shortens.
     */
    private exchangeGases(world: WorldState, params: ModelParams, atmo: AtmosphereSystem): void {
      world.refreshDerived();

      let seaConsumers = 0;
      let airConsumers = world.landLifeCoverage;
      for (let c = 1; c < LIFE_COUNT; c++) {
        if (c === Life.Prokaryote) continue;
        if (LIFE[c as Life].realm !== 'sea') continue;
        const biomass = world.lifeBiomass[c] / TILE_COUNT;
        if (c === Life.Cetacean) airConsumers += biomass;
        else seaConsumers += biomass;
      }
      const consumers = airConsumers + seaConsumers;

      let producers = 0;
      for (let i = 0; i < TILE_COUNT; i++) {
        const li = i * LIFE_COUNT + Life.Prokaryote;
        if (OXYGENIC_STAGE[world.lifeStage[li]]) producers += world.lifeDensity[li];
      }
      producers /= TILE_COUNT;
      const oceanProductivity = world.oceanFraction * clamp(producers / CYANO_PRODUCTIVITY_BIOMASS, 0, 1);

      const carbon = world.co2 / (world.co2 + 150);
      const absorption = mul(params.bio.co2Absorption);
      const photosynthesis = (
        world.vegetationCoverage * 0.9 +
        oceanProductivity * 0.30 +
        world.algaeCoverage * 0.25
      ) * carbon;

      // Oxygen follows the carbon that is buried, not all that is fixed, so
      // its yields differ by producer. Marine oxygen enters the sea first.
      const fixing = carbon * absorption;
      atmo.oceanO2Delta +=
        fixing * (oceanProductivity * PLANKTON_O2_YIELD + world.algaeCoverage * ALGAE_O2_YIELD) -
        seaConsumers * RESPIRATION_O2;
      const plantsO2 = fixing * world.vegetationCoverage * LAND_O2_YIELD;
      const breathO2 = airConsumers * RESPIRATION_O2;
      atmo.o2Delta += plantsO2 - breathO2;
      atmo.co2Delta += CHEM_RATE * (-photosynthesis * 2.0 * absorption + consumers * 0.5);
      // The parts of these sums for the tick's gas balance; the marine oxygen above is the sea's.
      world.gas.add('o2', 'plants', plantsO2);
      world.gas.add('o2', 'breath', -breathO2);
      world.gas.add('co2', 'photosynthesis', CHEM_RATE * (-photosynthesis * 2.0 * absorption));
      world.gas.add('co2', 'breath', CHEM_RATE * (consumers * 0.5));
    }

    /* ---------------------------------------------------------------- tools -- */

    /**
     * Place a founding population on one tile. Returns whether anything
     * changed — a tile already holding a founder's worth is left alone, and
     * the tool must not charge for that.
     */
    static seed(world: WorldState, c: Life, x: number, y: number, density = LifeSystem.FOUNDER_DENSITY): boolean {
      const i = idx(x, y);
      if (world.isWater(i) !== (LIFE[c].realm === 'sea')) return false;
      // The dinosaurs' era bars some classes for every way of placing life (dinoera.ts).
      if (dinoEraLifeBar(world, c)) return false;
      const li = lifeIdx(i, c);
      if (world.lifeDensity[li] >= density) return false;
      world.lifeDensity[li] = density;
      world.lifeStage[li] = firstStage(world, c);
      return true;
    }

    /**
     * Why a class cannot take hold on a tile, or null if it can. Judged on
     * the room the incumbents leave, not on raw capacity: a placement that
     * would only bleed out over the next few dozen ticks is refused.
     */
    habitabilityProblem(world: WorldState, params: ModelParams, i: number, c: Life): string | null {
      const def = LIFE[c];
      if (world.isWater(i) !== (def.realm === 'sea')) {
        return def.realm === 'sea' ? 'brauchen offenes Wasser' : 'brauchen festes Land';
      }
      this.prepare(world, params);
      if (this.o2Gates[c] <= 0) {
        const oxygen = lifeOxygen(c);
        const fmt = (v: number): string => v.toLocaleString('de-DE', { maximumFractionDigits: 1 });
        return `brauchen mehr als ${fmt(oxygen.min)} ${oxygenUnit(oxygen.medium)} – jetzt ${fmt(oxygenLevel(world, oxygen.medium))} %`;
      }
      if (def.suit[world.biome[i]] <= 0) return `können im Lebensraum ${BIOME_NAMES[world.biome[i]]} nicht leben`;
      const t = world.temperature[i];
      if (t <= this.tempLo[c]) return 'finden es dort zu kalt';
      if (t >= this.tempHi[c]) return 'finden es dort zu heiß';
      if (this.food(world, i, c) <= 0.05) return 'finden dort keine Nahrung';
      if (this.roomFor(world, i, c) < LifeSystem.MIN_DENSITY * 2) {
        return this.capacity(world, i, c) < 0.06
          ? 'finden dort zu wenig zum Leben'
          : 'finden dort keinen Platz – andere Arten sind überlegen';
      }
      return null;
    }

    /** Habitat wording used by the Examine window. */
    static habitatLabel(density: number): string {
      if (density <= 0) return 'Unbewohnt';
      if (density < 0.2) return 'Vereinzelt';
      if (density < 0.45) return 'Bewohnt';
      if (density < 0.75) return 'Dicht besiedelt';
      return 'Wimmelnd';
    }

    /** Plant/plankton wording used by the Examine window. */
    static biomeStatusLabel(world: WorldState, i: number): string {
      const richness = world.isWater(i)
        ? Math.min(1, Math.max(world.tileBiomass[i], world.vegetation[i]))
        : world.vegetation[i];
      if (richness < BiomeSystem.VEGETATION_THRESHOLD) return 'Karg';
      if (richness < 0.35) return 'Spärlich';
      if (richness < 0.7) return 'Gesund';
      return 'Üppig';
    }
  }
}
