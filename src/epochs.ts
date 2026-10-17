/* =============================================================================
 * SimEarth 2.0 — epochs: the planet a new game starts on
 * -----------------------------------------------------------------------------
 * A random planet, or the Earth at a point of its history. The epoch decides
 * the crust (continents, mountain and volcanic belts) and the Geosphere
 * sliders the game opens with. Life always starts from the beginning, so the
 * calendar, the atmosphere and the evolution tree are the same for every
 * epoch. See docs/epochen-2026-10/bericht.md.
 * ========================================================================== */

namespace SE {
  export type EpochId = 'random' | 'youngEarth' | 'today';

  export interface Epoch {
    readonly id: EpochId;
    readonly name: string;
    /** Where on Earth's timeline, for the picker. Empty for the random planet. */
    readonly when: string;
    readonly blurb: string;
    /** The first line of the toast that greets a new planet. */
    readonly greeting: string;
    /** The sea share is the player's choice; otherwise the epoch brings its own sea. */
    readonly playerSea: boolean;
    /** "Anderer Planet" can make another one — the real Earth exists only once. */
    readonly varies: boolean;
    /** Geosphere sliders the game opens with; the others stay at the calibrated 0.5. */
    readonly geo: Partial<GeoParams>;
  }

  export const EPOCHS: readonly Epoch[] = [
    {
      id: 'random', name: 'Zufälliger Planet', when: '',
      blurb: 'Ein neuer Planet aus Staub und Gas, jedes Mal anders. Du bestimmst, wie viel davon Meer ist.',
      greeting: 'Ein neuer Planet verdichtet sich aus Staub und Gas.',
      playerSea: true, varies: true, geo: {},
    },
    {
      id: 'youngEarth', name: 'Junge Erde', when: 'Hadaikum · vor über 4 Mrd. Jahren',
      blurb: 'Die Ozeane sind gerade entstanden, Leben gibt es noch nicht. Kleine Urkontinente und Vulkaninseln, viel Vulkanismus, schnelle Platten.',
      greeting: 'Die junge Erde: Urozeane, Vulkaninseln und noch kein Leben.',
      playerSea: false, varies: true,
      // Volcanoes and drift only: core heat would also lift the mountains.
      geo: { drift: 0.8, volcanoes: 0.8 },
    },
    {
      id: 'today', name: 'Heute', when: 'Die Kontinente von heute',
      blurb: 'Die echten Kontinente, Gebirge und Vulkangürtel, aus Höhendaten der NOAA auf die Karte gerechnet. Das Leben beginnt hier noch einmal von vorn.',
      greeting: 'Die Erde mit den Kontinenten von heute, noch ganz ohne Leben.',
      playerSea: false, varies: false,
      // The plates are horizontal bands that part at the equator and at 45°:
      // at the default speed they would tear the real continents apart by 20°
      // of longitude over a game, at this one by about half of that.
      geo: { drift: 0.25 },
    },
  ];

  export function epochOf(id: EpochId): Epoch {
    return EPOCHS.find((e) => e.id === id) ?? EPOCHS[0];
  }

  export function isEpochId(v: unknown): v is EpochId {
    return EPOCHS.some((e) => e.id === v);
  }

  /** Set the Geosphere sliders the epoch opens with, after `ModelParams.reset`. */
  export function applyEpochParams(params: ModelParams, id: EpochId): void {
    Object.assign(params.geo, epochOf(id).geo);
  }

  /** Lay down elevation, mountain belts (`uplift`) and the mantle field for a new planet. */
  export function shapeCrust(world: WorldState, id: EpochId, oceanShare: number): void {
    const { seed, elevation, uplift, magma } = world;
    switch (id) {
      case 'youngEarth':
        shapeYoungEarth(seed, elevation, uplift, magma);
        break;
      case 'today':
        shapeEarthToday(seed, elevation, uplift, magma);
        break;
      default:
        TerrainGenerator.generate(seed, elevation, oceanShare);
        // After the coastlines exist, never before: the belts are placed by
        // distance from the sea, so they need to know where the sea ended up.
        TerrainGenerator.orogeny(seed, elevation, uplift);
        TerrainGenerator.mantle(seed, magma);
    }
  }
}
