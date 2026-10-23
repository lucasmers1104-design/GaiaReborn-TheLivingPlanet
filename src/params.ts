/* =============================================================================
 * SimEarth 2.0 — model parameters
 * -----------------------------------------------------------------------------
 * Every slider on the four Model Control Panels writes into this object, and
 * every simulation system reads its tuning from here rather than from a hard
 * constant. Each slider runs 0..1 with 0.5 as the calibrated default, so
 * `mul(0.5) === 1` leaves the balance exactly where it was tuned.
 * ========================================================================== */

namespace SE {
  /** Convert a 0..1 slider position into a 0..2 multiplier centred on 1. */
  export function mul(v: number): number {
    return v * 2;
  }

  /* ------------------------------------------- calibrated base constants -- */
  /* These are the values the climate was tuned to; the sliders scale them.   */

  /** Peak solar energy term (equator, zero albedo), in degrees of forcing. */
  export const SOLAR_INPUT_BASE = 90;
  /** Baseline radiative loss to space. */
  export const RADIATIVE_OFFSET = 59;
  /** Greenhouse forcing per doubling of CO2 above the reference. */
  export const GH_CO2 = 9;
  /** Greenhouse forcing at full water-vapour saturation. */
  export const GH_VAPOR = 11;
  /** CO2 reference concentration (ppm) for the logarithmic forcing curve. */
  export const CO2_REF = 280;
  /** Greenhouse forcing per doubling of (1 + the methane above CH4_BASE in ppm). */
  export const GH_CH4 = 0.4;
  /** Methane (ppm) the climate was calibrated with, the pre-industrial air: no less than it warms nothing. */
  export const CH4_BASE = 0.7;
  /** Pressure broadening per bar of air pressure off today's (doubling Earth's nitrogen warms it some 4 K). */
  export const GH_PRESSURE = 3;

  export const OCEAN_INERTIA = 0.05;
  export const LAND_INERTIA = 0.22;
  /** Lateral heat exchange with neighbours (winds and currents, lumped). */
  export const TEMP_DIFFUSION_BASE = 0.17;
  /**
   * How many lateral mixing passes the temperature field takes per tick.
   *
   * Diffusion per pass is a fraction of the gap to the four *neighbours*, so it
   * smooths a fixed number of tiles, not a fixed distance. Halving the tile size
   * therefore halves how far heat spreads, which steepens the pole-to-equator
   * gradient. Two passes restore the reach; raising the coefficient instead
   * would have to go past the 0.24 clamp and makes the explicit scheme ring.
   */
  export const TEMP_DIFFUSION_PASSES = 2;
  /** How fast moisture chases its advected target. */
  export const MOISTURE_RATE = 0.25;
  /**
   * Fraction of upwind moisture that survives one step over land — the single
   * knob controlling how far inland rain reaches, and so how much of the planet
   * is desert. Under the capacity-ceiling model in `ClimateSystem` the decay is
   * exactly this per tile, giving an e-folding length of 1/(1-t) tiles: 12.5 at
   * 0.92, or roughly a third of the way across a typical continent.
   *
   * Measured over three planets at 256x128 after 600 ticks, as a share of land:
   *
   *   t      arid (<0.16)   mid       wet (>=0.5)
   *   0.84    29-38%        49-58%    11-15%
   *   0.87    20-27%        54-63%    15-19%
   *   0.90    10-15%        61-66%    20-24%     <- Earth-like
   *   0.92     4-7%         65-67%    26-30%     <- barely a desert anywhere
   *
   * Earth is about a quarter arid, and a planet wants a little less than that
   * so the player has somewhere to fix. Note the figure sits lower than a bare
   * decay length would suggest because the mountain ranges wring rain out on
   * their windward flanks — this was calibrated with the orogeny in place.
   *
   * It also cannot be read against the old 0.95: before the ceiling fix the
   * humidity gates multiplied in on every step as well, costing ~18% a tile on
   * top of this, which made the value almost irrelevant.
   */
  export const MOISTURE_TRANSMISSION = 0.90;

  /**
   * Rain by latitude — the circulation cells the wind model alone does not
   * know: rising air at the equator (ITCZ), sinking dry air at 20–35°, the
   * westerlies' storms at 45–60°, polar desert beyond 70°. A factor -1..+1
   * per latitude (linear between these points) scales the transmission over
   * land and adds or removes a share of the local capacity per tile. The
   * slider "Klimazonen" scales both; 0.5 is the calibrated default.
   */
  export const ZONAL_RAIN_PROFILE: readonly (readonly [number, number])[] = [
    [0, 1], [8, 1], [15, 0], [20, -1], [32, -1], [40, 0], [45, 0.7], [58, 0.7], [64, 0], [70, -1], [90, -1],
  ];
  /** Relative change of MOISTURE_TRANSMISSION at a zonal factor of ±1. */
  export const ZONAL_RAIN_TRANSMISSION = 0.06;
  /** Share of the local capacity rained in (or dried out) per tile at a factor of ±1. */
  export const ZONAL_RAIN_SOURCE = 0.05;

  /**
   * Base plate speed in tiles per tick. Tiles, so it doubled with the grid:
   * a plate crosses the planet in the same time, not in the same tile count.
   */
  export const DRIFT_SPEED_BASE = 1 / 450;
  /** Number of independent horizontal plates. */
  export const PLATE_COUNT = 4;
  /**
   * Share of a slope's height difference (above EROSION_SLOPE_MIN) that the
   * higher tile hands down per tick, on wet ground at EROSION_ALTITUDE_REF.
   *
   * Set by the fossil belts: a belt without uplift loses half its height over
   * its surroundings in 1,000-1,500 Phanerozoic ticks (docs/hoehe-spec.md
   * §3.4). Measured on seeds 777/2718/4242, geology and climate only, plates
   * held, height of the fossil tiles over the plains: 50/40/47 % left after
   * 1,500 ticks; a synthetic range of σ = 2 tiles halves after about 1,000
   * (tests/tectonics.test.js).
   */
  export const EROSION_RATE_BASE = 0.007;
  /** Slopes up to this (elevation per tile) do not erode: the gentle relief of the lowlands stays. */
  export const EROSION_SLOPE_MIN = 0.02;
  /** The same for mountain belts, lower: a fossil belt keeps wearing down to the land around it. */
  export const EROSION_SLOPE_MIN_BELT = 0.005;
  /**
   * Crust without a mountain type, the plains and plateaus between the belts,
   * erodes at this share of a belt's rate. Bare old surfaces lose 5-12 m per
   * million years, mountain catchments tens to hundreds (Portenga & Bierman
   * 2011); and the generated relief keeps its shape (docs/hoehe-spec.md E1a).
   */
  export const CRATON_EROSION = 0.05;
  /** Below this height erosion slows in proportion: the lower the land, the less a river cuts into it. */
  export const EROSION_ALTITUDE_REF = 0.4;
  /** Upper bound of that share per pass, so a cliff cannot overshoot its neighbour. */
  export const EROSION_MAX_SHARE = 0.12;
  /**
   * Erosion and uplift run every this many ticks, with that many ticks' worth
   * of rate: geology plus rivers then cost less per tick than the old
   * per-tick erosion did.
   */
  export const EROSION_INTERVAL = 8;
  /**
   * Share of the eroded crust the rivers carry to the sea instead of the
   * slope below; on a plain at the foot of a range all of it goes
   * (`Erosion.slopes`). What settles on the plains piles up and buries the
   * range: with it, active belts rose by 14-16 % over the plains in 12,000
   * ticks. Rivers drop nothing on the plains either: settling 15 % of their
   * load on the first flat tile raised the plains round the belts as well.
   */
  export const EROSION_FLUVIAL_SHARE = 0.95;
  /** Sediment fills a shelf tile at most up to this, just below sea level, so no land is made. */
  export const SHELF_FILL_CAP = -0.01;
  /** Erosion never takes land below this, so coasts do not wash away. */
  export const EROSION_LAND_FLOOR = 0.002;
  /**
   * Per-tick uplift of an active belt tile at `WorldState.uplift` 1. Only a
   * scale: `balanceUplift` sets each tile's uplift to what erosion takes
   * from it, and this is chosen so that few tiles need more than 1.
   */
  export const UPLIFT_RATE_BASE = 0.0035;
  /**
   * Moisture of the ground a new belt's uplift is balanced on. `BeltUplift`
   * follows the actual rain, so this only scales `uplift` (few tiles
   * saturate at 1). After 12,000 ticks active belts stand at 104/104/108 %
   * of their height over the plains (seeds 777/2718/4242, plates held) and
   * at 100-102 % of their mean height with drift.
   */
  export const UPLIFT_BALANCE_MOISTURE = 0.22;
  /** Per-tick growth of the crust over an active hotspot, short of its cap. */
  export const HOTSPOT_RATE = 0.004;
  /** Room below the cap over which the growth tapers off. */
  export const HOTSPOT_RAMP = 0.15;
  /** Ticks per activity window of a hotspot, and the share of windows it is active in. */
  export const HOTSPOT_PULSE_TICKS = 300;
  export const HOTSPOT_ACTIVE_SHARE = 0.6;
  /**
   * Years per tick the vertical rates (uplift, erosion) were calibrated at: a
   * Phanerozoic tick. Shorter ticks scale them down (`geoTimeFactor`).
   */
  export const GEO_REFERENCE_YEARS = 125000;

  /* ------------------------------------------------------ grid calibration -- */

  /**
   * The grid a handful of absolute figures elsewhere were calibrated against.
   *
   * Most of the model is expressed per tile or as a share of the planet and so
   * does not care how finely the world is cut up. A few quantities are counts —
   * total industrial energy demand, how many nuclear powers it takes to start a
   * war — and those quietly scale with the grid: the same civilization on a
   * finer map is simply counted more times.
   *
   * Going from 128x64 to 256x128 therefore quadrupled industrial output for an
   * unchanged planet. Measured before this existed: soot drove atmospheric dust
   * to 0.67, blocking three quarters of the sunlight, and every long game ended
   * in a permanent industrial winter at -7C with the biosphere wiped out.
   */
  export const REFERENCE_TILE_COUNT = 8192;

  /** How many tiles the current grid uses for one tile of the reference grid. */
  export const GRID_REFINEMENT = TILE_COUNT / REFERENCE_TILE_COUNT;

  /**
   * Restate a count calibrated on the reference grid so it still means the same
   * share of the planet here.
   */
  export function scaledCount(referenceCount: number): number {
    return referenceCount * GRID_REFINEMENT;
  }

  /* -------------------------------------------------- atmospheric chemistry -- */

  /**
   * How many "chemistry steps" the atmosphere takes per simulation tick.
   *
   * Every rate below, and the biosphere's gas exchange, was calibrated when the
   * loop ran ~33 ticks a second. At the current 2.5 the oxygen curve took half
   * an hour of wall clock to reach the 17% that mammals need, which reads as
   * "nothing ever evolves". Sources and sinks all carry this factor, so every
   * equilibrium is untouched and only the time to reach one shortens.
   *
   * This deliberately does NOT extend to the temperature and moisture
   * relaxations above: those are per-tick approach rates, and scaling them past
   * 1 makes the integrator overshoot and ring instead of converging.
   */
  export const CHEM_RATE = 8;

  /** CO2 (ppm) added per tick by background volcanism. */
  export const VOLCANIC_CO2 = 0.45 * CHEM_RATE;
  /** Fraction of suspended dust that settles out each tick. */
  export const DUST_SETTLING = 0.004;
  /** Free oxygen lost to surface oxidation each tick. */
  export const OXIDATION = 0.00072 * CHEM_RATE;
  /** Silicate weathering: warm, wet, rocky worlds scrub CO2. */
  export const WEATHERING = 0.0012 * CHEM_RATE;

  /* ------------------------------------------------------------ methane -- */
  /*
   * Made by archaea in oxygen-free water, swamps, rock and vents and a
   * civilization's cattle, rice and gas; destroyed by oxygen (src/methane.ts).
   * Without oxygen it builds up over some fifty ticks towards the hundreds of
   * ppm that kept the young Earth warm; in today's air it lasts a few ticks
   * (about ten years on Earth) and stays under 1 ppm.
   */
  /** Share of the methane lost per tick in air without oxygen, and on top of it per percent of air oxygen. */
  export const CH4_LOSS_ANOXIC = 0.0025 * CHEM_RATE;
  export const CH4_LOSS_PER_O2 = 0.00125 * CHEM_RATE;
  /** Methane (ppm per tick) from rock and hydrothermal vents, scaled by the volcano slider. */
  export const CH4_ABIOTIC = 0.0005 * CHEM_RATE;
  /** Methane (ppm per tick) from archaea at full density on every tile, in a sea without oxygen. */
  export const CH4_ARCHAEA = 25 * CHEM_RATE;
  /** Sea oxygen (% of today's saturation) at which half of the archaea's methane still escapes the water. */
  export const CH4_SEA_O2_HALF = 10;
  /** Methane (ppm per tick) if swamps covered the whole planet. */
  export const CH4_WETLAND = 0.4 * CHEM_RATE;
  /** Methane a civilization releases per ppm of CO2 it emits: cattle, rice fields, leaking natural gas. */
  export const CIV_CH4_PER_CO2 = 0.05;
  /** Most methane the air holds, ppm. */
  export const CH4_MAX = 20000;

  /* ------------------------------------------------ ocean oxygen and iron -- */
  /*
   * Sources represent net oxygen, i.e. buried
   * carbon: eukaryotic algae and woody land plants bury far more of what they
   * fix than bacterial plankton, which is what ends the "boring billion".
   */

  /** Air percent the sea counts as fully saturated — today's atmosphere. */
  export const O2_PRESENT = 21;
  /** Gameplay thresholds (% of today's saturation), not a universal origin limit. */
  export const EUKARYOTE_OCEAN_O2_MIN = 1;
  export const EUKARYOTE_OCEAN_O2_FOUND = 2;
  export const EUKARYOTE_OCEAN_O2_FULL = 5;
  /** Mean cyanobacterial biomass at which marine production saturates. */
  export const CYANO_PRODUCTIVITY_BIOMASS = 0.003;
  /** Early microbial diversification precedes oxygen-dependent evolution. */
  export const MICROBIAL_STAGE_ADVANCE = 0.04;
  /** O2 (air percent) per tick from a sea saturated with plankton. */
  export const PLANKTON_O2_YIELD = 0.029 * CHEM_RATE;
  /** O2 per tick per unit of marine algae cover. */
  export const ALGAE_O2_YIELD = 0.125 * CHEM_RATE;
  /** O2 per tick per unit of land plant cover. */
  export const LAND_O2_YIELD = 0.1125 * CHEM_RATE;
  /** O2 breathed per tick per unit of animal biomass. */
  export const RESPIRATION_O2 = 0.004 * CHEM_RATE;
  /**
   * Reduced volcanic gases and fresh rock: a drain on the air that saturates
   * above a few percent. Production must outrun it before oxygen can build up
   * at all, which is what holds the air low after the Great Oxidation Event.
   */
  export const REDUCING_SINK = 0.01875 * CHEM_RATE;
  /** Air O2 (percent) at which the reducing drain runs at half strength. */
  export const REDUCING_HALF = 2.2;
  /** O2 (air percent) the sea holds when saturated at today's level. */
  export const OCEAN_O2_CAPACITY = 4;
  /**
   * Share of the sea–air disequilibrium evened out per tick. A relaxation
   * rate, so it does not carry CHEM_RATE (see the note there).
   */
  export const OCEAN_GAS_EXCHANGE = 0.5;
  /** O2 (air percent) needed to oxidise all the dissolved iron of a young ocean. */
  export const IRON_O2_DEMAND = 1.3;
  /** Above 1/this much iron, every bit of free O2 in the sea is bound at once. */
  export const IRON_REACTIVITY = 10;
  /** Dissolved iron delivered per tick by hydrothermal vents. */
  export const IRON_RESUPPLY = 0.0000625 * CHEM_RATE;
  /** Iron left (0..1) below which the reservoir counts as used up. */
  export const IRON_DEPLETED = 0.05;
  /** Dissolved O2 (% of today's saturation) that counts as an oxygenated sea. */
  export const OCEAN_O2_RISEN = 5;
  /** Air O2 (percent) that marks the Great Oxidation Event. */
  export const AIR_O2_RISEN = 1;

  /* ------------------------------------------------------------ interfaces -- */

  export interface GeoParams {
    drift: number;
    coreHeat: number;
    volcanoes: number;
    erosion: number;
    meteors: number;
    axialTilt: number;
  }

  export interface AtmoParams {
    solarInput: number;
    greenhouse: number;
    cloudAlbedo: number;
    surfaceAlbedo: number;
    thermalTransfer: number;
    rainfall: number;
    zonalRain: number;
  }

  export interface BioParams {
    evolutionRate: number;
    mutationRate: number;
    reproductionRate: number;
    tolerance: number;
    co2Absorption: number;
  }

  /** Where a civilization's energy comes from. These are shares, not levels. */
  export interface CivEnergyParams {
    solarWind: number;
    hydroGeo: number;
    fossilFuel: number;
    nuclear: number;
  }

  /** What a civilization spends its energy on. */
  export interface CivAllocParams {
    agriculture: number;
    medicine: number;
    artMedia: number;
    science: number;
    philosophy: number;
    military: number;
  }

  export interface SliderDef<K> {
    readonly key: K;
    readonly label: string;
    /** One line on what the slider does in this simulation. */
    readonly hint: string;
  }

  export const GEO_SLIDERS: readonly SliderDef<keyof GeoParams>[] = [
    { key: 'drift', label: 'Kontinentaldrift', hint: 'Wie schnell sich die Platten verschieben.' },
    { key: 'coreHeat', label: 'Kernwärme', hint: 'Hebung der Gebirge und Magma-Aktivität.' },
    { key: 'volcanoes', label: 'Vulkanismus', hint: 'Häufigkeit von Ausbrüchen und vulkanisches CO₂.' },
    { key: 'erosion', label: 'Erosion', hint: 'Wie schnell Wasser das Gelände abträgt.' },
    { key: 'meteors', label: 'Meteoriten', hint: 'Häufigkeit von Einschlägen.' },
    { key: 'axialTilt', label: 'Achsneigung', hint: 'Verteilt Sonnenlicht gleichmäßiger auf Pole und Äquator.' },
  ];

  export const ATMO_SLIDERS: readonly SliderDef<keyof AtmoParams>[] = [
    { key: 'solarInput', label: 'Sonneneinstrahlung', hint: 'Energie, die der Planet von seiner Sonne erhält.' },
    { key: 'greenhouse', label: 'Treibhauseffekt', hint: 'Wie stark CO₂, Methan und Wasserdampf Wärme halten.' },
    { key: 'cloudAlbedo', label: 'Wolken-Rückstrahlung', hint: 'Wie viel Sonnenlicht Wolken ins All zurückwerfen.' },
    { key: 'surfaceAlbedo', label: 'Boden-Rückstrahlung', hint: 'Wie hell Eis, Wüsten und Wälder reflektieren.' },
    { key: 'thermalTransfer', label: 'Wärmeaustausch Luft/Meer', hint: 'Wie stark Winde und Strömungen Wärme verteilen.' },
    { key: 'rainfall', label: 'Niederschlag', hint: 'Wie weit Regen ins Landesinnere reicht.' },
    { key: 'zonalRain', label: 'Klimazonen', hint: 'Regen am Äquator und in den Westwinden, Trockenheit in den Subtropen und an den Polen.' },
  ];

  export const BIO_SLIDERS: readonly SliderDef<keyof BioParams>[] = [
    { key: 'evolutionRate', label: 'Evolutionstempo', hint: 'Wie schnell Evolutionspunkte entstehen.' },
    { key: 'mutationRate', label: 'Mutationsrate', hint: 'Wie schnell neue Unterarten (Varianten einer Gruppe) auftreten.' },
    { key: 'reproductionRate', label: 'Vermehrung', hint: 'Wachstum von Pflanzendecke und Tierbeständen.' },
    { key: 'tolerance', label: 'Toleranz', hint: 'Wie breit die Temperaturbereiche aller Arten sind.' },
    { key: 'co2Absorption', label: 'CO₂-Aufnahme', hint: 'Wie viel CO₂ die Photosynthese bindet.' },
  ];

  export const CIV_ENERGY_SLIDERS: readonly SliderDef<keyof CivEnergyParams>[] = [
    { key: 'solarWind', label: 'Sonne / Wind', hint: 'Saubere Energie ohne Emissionen.' },
    { key: 'hydroGeo', label: 'Wasser / Erdwärme', hint: 'Saubere Energie ohne Emissionen.' },
    { key: 'fossilFuel', label: 'Fossile Brennstoffe', hint: 'Setzt CO₂ und etwas Ruß frei, wärmt den Planeten.' },
    { key: 'nuclear', label: 'Kernkraft', hint: 'Emissionsfrei; Anteil am Energiemix.' },
  ];

  export const CIV_ALLOC_SLIDERS: readonly SliderDef<keyof CivAllocParams>[] = [
    { key: 'agriculture', label: 'Landwirtschaft', hint: 'Wie viele Menschen ein Standort ernährt.' },
    { key: 'medicine', label: 'Medizin', hint: 'Bevölkerungswachstum und Schutz vor Seuchen.' },
    { key: 'artMedia', label: 'Kunst / Medien', hint: 'Fördert das Städtewachstum leicht und dämpft Konflikte.' },
    { key: 'science', label: 'Wissenschaft', hint: 'Tempo des technischen Fortschritts.' },
    { key: 'philosophy', label: 'Philosophie', hint: 'Dämpft die Kriegsgefahr deutlich.' },
    { key: 'military', label: 'Militär', hint: 'Erhöht die Gefahr eines Atomkriegs.' },
  ];

  /* ----------------------------------------------------------------- state -- */

  /** The live parameter set. Reset alongside the world. */
  export class ModelParams {
    readonly geo: GeoParams = {
      drift: 0.5, coreHeat: 0.5, volcanoes: 0.5,
      erosion: 0.5, meteors: 0.5, axialTilt: 0.5,
    };

    readonly atmo: AtmoParams = {
      solarInput: 0.5, greenhouse: 0.5, cloudAlbedo: 0.5,
      surfaceAlbedo: 0.5, thermalTransfer: 0.5, rainfall: 0.5, zonalRain: 0.5,
    };

    readonly bio: BioParams = {
      evolutionRate: 0.5, mutationRate: 0.5, reproductionRate: 0.5,
      tolerance: 0.5, co2Absorption: 0.5,
    };

    // Fossil fuel dominates at the start, which is exactly why an industrial
    // civilization warms its own planet until the player intervenes.
    readonly civEnergy: CivEnergyParams = {
      solarWind: 0.1, hydroGeo: 0.2, fossilFuel: 0.6, nuclear: 0.1,
    };

    readonly civAlloc: CivAllocParams = {
      agriculture: 0.5, medicine: 0.5, artMedia: 0.4,
      science: 0.5, philosophy: 0.3, military: 0.3,
    };

    /**
     * Restore the calibrated defaults *in place*. The slider panels hold
     * references to these objects; replacing them (as this once did) left
     * every slider writing into an orphaned copy the simulation never read.
     */
    reset(): void {
      const fresh = new ModelParams();
      Object.assign(this.geo, fresh.geo);
      Object.assign(this.atmo, fresh.atmo);
      Object.assign(this.bio, fresh.bio);
      Object.assign(this.civEnergy, fresh.civEnergy);
      Object.assign(this.civAlloc, fresh.civAlloc);
    }

    /** The five groups by name, for saving and validated loading. */
    groups(): Record<string, Record<string, number>> {
      return {
        geo: this.geo as unknown as Record<string, number>,
        atmo: this.atmo as unknown as Record<string, number>,
        bio: this.bio as unknown as Record<string, number>,
        civEnergy: this.civEnergy as unknown as Record<string, number>,
        civAlloc: this.civAlloc as unknown as Record<string, number>,
      };
    }

    /** Share of energy demand met by each source, normalised to sum to 1. */
    energyMix(): CivEnergyParams {
      const e = this.civEnergy;
      const total = e.solarWind + e.hydroGeo + e.fossilFuel + e.nuclear;
      if (total <= 0) return { solarWind: 0.25, hydroGeo: 0.25, fossilFuel: 0.25, nuclear: 0.25 };
      return {
        solarWind: e.solarWind / total,
        hydroGeo: e.hydroGeo / total,
        fossilFuel: e.fossilFuel / total,
        nuclear: e.nuclear / total,
      };
    }
  }
}
