/* =============================================================================
 * Gaia Reborn — difficulty levels
 * -----------------------------------------------------------------------------
 * Easy, normal or hard, chosen with a new planet and kept in its save. Every
 * balancing value that differs between the levels lives in DIFFICULTY_CONFIG;
 * the systems read them through the small helpers below. Normal is the game
 * as it was tuned, without evolution that arises on its own. The climate
 * crises of hard live in hardclimate.ts, its extinctions in hardextinction.ts.
 * ========================================================================== */

namespace SE {
  export type Difficulty = 'easy' | 'normal' | 'hard';
  export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

  export function isDifficulty(v: unknown): v is Difficulty {
    return v === 'easy' || v === 'normal' || v === 'hard';
  }

  /** The climate's part of a level (hardclimate.ts). */
  export interface ClimateDifficulty {
    /**
     * Pull towards the comfortable band, in degrees of forcing per degree of
     * global temperature outside it; 0 for none. Negative pushes further out:
     * ice that reflects more sunlight, a hot sea that gives off more vapour.
     */
    readonly thermostat: number;
    /** The band the thermostat leaves alone, °C; on hard also where the warnings start. */
    readonly comfortLow: number;
    readonly comfortHigh: number;
    /** The most forcing the thermostat adds or takes, degrees. */
    readonly thermostatCap: number;
    /** The tipping points of hard; null on the other levels. */
    readonly tipping: TippingDifficulty | null;
  }

  /**
   * The crises of hard (hardclimate.ts). Each is set off by the planet's own
   * history and holds until the player changes the natural laws, and a fix
   * for one crisis is the cause of the next: the warmth that saves the
   * planet from the ice heats it up once the sun has brightened.
   */
  export interface TippingDifficulty {
    /**
     * Early crisis: degrees lost per doubling of methane the planet has lost
     * since its peak, × the „Treibhauseffekt“ slider. Normal's own methane
     * term is 0.4 °/doubling (GH_CH4); a young planet's warmth on hard rests
     * on its methane, so the first oxygen takes ~10 ° off.
     */
    readonly methaneWeight: number;
    /** The most the lost methane takes off, degrees. */
    readonly methaneCap: number;
    /** Announce the early crisis once the air holds this much oxygen, %, and the methane has fallen below half its peak. */
    readonly methaneAnnounceO2: number;
    /**
     * The sun brightens over the Phanerozoic: degrees of forcing at points in
     * million years before the present, oldest first, linear between, the last
     * one held past the present. It slowly undoes every warming fix.
     */
    readonly sunDrift: readonly (readonly [number, number])[];
    /**
     * Mid crisis: the swamp forests of giant clubmosses bury CO₂ as well, ppm
     * per Gt of their peat buried in the tick (CoalSystem.lastDeposit; ~0.2–0.5
     * Gt in the Carboniferous), × the „CO₂-Aufnahme“ slider. The base
     * volcanic CO₂ is 3.6 ppm per tick.
     */
    readonly coalDrawdown: number;
    /** Announce the mid crisis once a tick buries this much of their peat, Gt. */
    readonly coalAnnounce: number;
    /** Late crisis: a flood basalt erupts between these points, million years before the present (the Permian's end). */
    readonly basaltFromMa: number;
    readonly basaltToMa: number;
    /** Its CO₂, ppm per tick at the default „Vulkanismus“ (scaled by the slider). */
    readonly basaltCO2: number;
    /** Its dust per tick: a short volcanic winter before the heat. */
    readonly basaltDust: number;
    /** Civilization crisis: extra CO₂ as a share of what the cities' fossil fuel releases (energy mix „Fossile Brennstoffe“). */
    readonly industryBoost: number;
    /** Ticks between two warnings of the same kind while the temperature keeps going. */
    readonly warnCooldown: number;
    /** Degrees back inside the band before the next excursion warns at once. */
    readonly warnHysteresis: number;
  }

  /** The extinction rules of a level (hardextinction.ts). */
  export interface ExtinctionDifficulty {
    /** A class or plant group gone from the planet dies out for good after this many ticks; 0 never. */
    readonly graceTicks: number;
  }

  export interface DifficultyConfig {
    readonly name: string;
    readonly title: string;
    readonly blurb: string;
    /** Ω on a new planet. */
    readonly omegaStart: number;
    /** Factor on every tier's Ω income (OMEGA_STAGES). */
    readonly omegaRegen: number;
    /** Factor on every tier's Ω cap. */
    readonly omegaCap: number;
    /** Share of the income that follows Gaia's mood (0..1): income × (1 − s + 2 s · mood), so a mood of ½ pays the plain rate. */
    readonly omegaMood: number;
    /** Steps that stood ready long enough arise without evolution points (spontaneous.ts). */
    readonly spontaneous: boolean;
    /** Factor on the chance of natural volcanoes and meteors; 0 also stops lightning fires. */
    readonly hazardRate: number;
    /** Ω to open a model panel the first time. */
    readonly modelPanelCost: number;
    readonly climate: ClimateDifficulty;
    readonly extinction: ExtinctionDifficulty;
  }

  export const DIFFICULTY_CONFIG: Readonly<Record<Difficulty, DifficultyConfig>> = {
    easy: {
      name: 'Einfach', title: 'Hüter des Gartens',
      blurb: 'Doppelte Energie, keine Naturkatastrophen, ein gutmütiges Klima. Bereite Entwicklungen entstehen nach einer Weile auch ohne Evolutionspunkte.',
      omegaStart: 3000, omegaRegen: 2, omegaCap: 2, omegaMood: 0,
      spontaneous: true, hazardRate: 0, modelPanelCost: 0,
      climate: { thermostat: 0.6, comfortLow: 6, comfortHigh: 24, thermostatCap: 20, tipping: null },
      extinction: { graceTicks: 0 },
    },
    normal: {
      name: 'Normal', title: 'Herr der Evolution',
      blurb: 'Jeder Evolutionsschritt kostet Evolutionspunkte. Naturkatastrophen kommen vor, das Klima fängt Extreme ab. Ausgestorbene Gruppen kannst du neu ansiedeln.',
      omegaStart: OMEGA_START, omegaRegen: 1, omegaCap: 1, omegaMood: 0,
      spontaneous: false, hazardRate: 1, modelPanelCost: MODEL_PANEL_COST,
      climate: { thermostat: 0.15, comfortLow: 2, comfortHigh: 28, thermostatCap: 6, tipping: null },
      extinction: { graceTicks: 0 },
    },
    hard: {
      name: 'Schwer', title: 'Überlebenskampf',
      blurb: 'Wenig Energie, heftige Katastrophen. Das Klima kippt ohne dein Nachregeln der Naturgesetze in Eis- oder Hitzezeiten – mehrmals im Lauf der Erdgeschichte. Was ausstirbt, kehrt nie zurück.',
      omegaStart: 1000, omegaRegen: 1, omegaCap: 1, omegaMood: 0.5,
      spontaneous: false, hazardRate: 2, modelPanelCost: 50,
      climate: {
        thermostat: -1.0, comfortLow: 5, comfortHigh: 26, thermostatCap: 12,
        tipping: {
          methaneWeight: 2.4, methaneCap: 13, methaneAnnounceO2: 4,
          sunDrift: [[444, 0], [252, 4], [0, 9]],
          coalDrawdown: 12, coalAnnounce: 0.15,
          basaltFromMa: 253, basaltToMa: 250, basaltCO2: 120, basaltDust: 0.003,
          industryBoost: 2,
          warnCooldown: 60, warnHysteresis: 2,
        },
      },
      extinction: { graceTicks: 40 },
    },
  };

  /**
   * A planet's level and what hard keeps track of. On WorldState, so the
   * page's mirror gets it with every state (simstate.ts).
   */
  export class DifficultyState {
    level: Difficulty = 'normal';

    /* ---- hardclimate.ts ---- */
    /** The most methane the air has held, ppm: what the early crisis measures the loss against. */
    ch4Peak = 0;
    /** Crises announced so far, bits 1 << HardCrisis. */
    crises = 0;
    /** Ticks of the last cold and hot warning; -Infinity while armed. Not saved. */
    coldWarned = -Infinity;
    hotWarned = -Infinity;
    /** Global temperature after the last tick, for its trend; NaN before the first. Not saved. */
    lastTemp = NaN;

    /* ---- hardextinction.ts ---- */
    /** Classes (bit 1 << Life) and plant groups (floraBit) gone for good. */
    lifeLost = 0;
    floraLost = 0;
    /** By step id: the tick by which a group gone from the planet must live again. */
    graceUntil: Record<string, number> = {};

    reset(level: Difficulty): void {
      this.level = level;
      this.ch4Peak = 0;
      this.crises = 0;
      this.coldWarned = -Infinity;
      this.hotWarned = -Infinity;
      this.lastTemp = NaN;
      this.lifeLost = 0;
      this.floraLost = 0;
      this.graceUntil = {};
    }

    copyFrom(o: DifficultyState): void {
      this.level = o.level;
      this.ch4Peak = o.ch4Peak;
      this.crises = o.crises;
      this.coldWarned = o.coldWarned;
      this.hotWarned = o.hotWarned;
      this.lastTemp = o.lastTemp;
      this.lifeLost = o.lifeLost;
      this.floraLost = o.floraLost;
      this.graceUntil = { ...o.graceUntil };
    }
  }

  export function difficultyConfig(world: WorldState): DifficultyConfig {
    return DIFFICULTY_CONFIG[world.difficulty.level];
  }

  /** Steps may arise without evolution points on this planet. */
  export function canSpontaneouslyEvolve(world: WorldState): boolean {
    return difficultyConfig(world).spontaneous;
  }

  /** Factor on the Ω income now: the level's, and on hard Gaia's mood. */
  export function omegaRegenFactor(world: WorldState): number {
    const c = difficultyConfig(world);
    return c.omegaRegen * (1 - c.omegaMood + 2 * c.omegaMood * world.gaiaMood);
  }

  /** The most Ω a planet of any level can hold (save validation). */
  export const OMEGA_LIMIT = OMEGA_MAX * Math.max(...DIFFICULTIES.map((d) => DIFFICULTY_CONFIG[d].omegaCap));

  /* -------------------------------------------------------------- save -- */

  /** Optional save field; a save without it plays on normal. */
  export function difficultyToJSON(world: WorldState): unknown {
    return { level: world.difficulty.level, climate: hardClimateToJSON(world), extinction: hardExtinctionToJSON(world) };
  }

  export function restoreDifficulty(world: WorldState, raw: unknown): void {
    const r = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
    world.difficulty.reset(isDifficulty(r.level) ? r.level : 'normal');
    restoreHardClimate(world, r.climate);
    restoreHardExtinction(world, r.extinction);
  }
}
