/* =============================================================================
 * SimEarth 2.0 — how each era lays out its settlements
 * -----------------------------------------------------------------------------
 * The plans src/citylayout.ts builds a city from: per era and size stage a
 * list of targets (role, size, spot in tile pixels), the most buildings, how
 * much of each house must stay visible, and rectangles no footprint may
 * cover (a fire place, a court, a street). Ages differ in arrangement and
 * silhouette, not only in their blocks (docs/zivilisation-spec.md §3.2).
 * Also the camp of a wandering group. Pure data.
 * ========================================================================== */

namespace SE {
  export interface CityPlanItem {
    readonly role: string;
    /** A block id, when the plan wants that block rather than any of its role. */
    readonly id?: string;
    /** Dwellings: 's' | 'm' | 'l', shrinking where it does not fit. */
    readonly size?: string;
    /** Target foot in tile pixels (0..15), mirrored with the plan. */
    readonly x: number;
    readonly y: number;
    /** Built only when the tile's hash falls below this. */
    readonly chance?: number;
  }

  /** Inclusive rectangle [x0, y0, x1, y1] in tile pixels. */
  export type CityRect = readonly [number, number, number, number];

  export interface CityStagePlan {
    readonly items: readonly CityPlanItem[];
    /** Most buildings (dwelling, hall, landmark). */
    readonly max: number;
    /** Share of each house's pixels the blocks in front of it must leave visible. */
    readonly visible: number;
    /** No footprint but a fire's, a pennant's or a bridge's covers these; mirrored with the plan. */
    readonly keep?: readonly CityRect[];
    /** A ring wall closes round it (where the era has walls and no river crosses the tile). */
    readonly ring?: boolean;
    /** Largest dwelling size; default: 'l' before the Industrial Age, from it on by stage s, m, l. */
    readonly cap?: string;
  }

  export interface CityEraPlan {
    /** Village, town, metropolis. */
    readonly stages: readonly [CityStagePlan, CityStagePlan, CityStagePlan];
    /** Ground block under it all, or null for none; default: the era's block of role 'ground'. */
    readonly ground?: string | null;
  }

  /** The plan every era had before the 2026-10 rework: a dense pile round the middle. */
  const DEFAULT_PLAN: CityEraPlan = {
    stages: [
      {
        max: 3, visible: 0.85,
        items: [
          { role: 'banner', x: 8, y: 6 },
          { role: 'dwelling', size: 'm', x: 5, y: 9 },
          { role: 'dwelling', size: 'm', x: 11, y: 12 },
          { role: 'dwelling', size: 's', x: 11, y: 7, chance: 0.5 },
          { role: 'yard', x: 8, y: 11 },
        ],
      },
      {
        max: 5, visible: 0.5,
        items: [
          { role: 'banner', x: 3, y: 7 },
          { role: 'hall', x: 8, y: 6 },
          { role: 'dwelling', size: 'l', x: 4, y: 12 },
          { role: 'dwelling', size: 'm', x: 12, y: 12 },
          { role: 'dwelling', size: 'm', x: 13, y: 8 },
          { role: 'dwelling', size: 's', x: 8, y: 13, chance: 0.5 },
          { role: 'dwelling', size: 's', x: 2, y: 7 },
          { role: 'wall', x: 11, y: 13 },
          { role: 'yard', x: 8, y: 9 },
          { role: 'yard', x: 13, y: 6, chance: 0.6 },
        ],
      },
      {
        max: 8, visible: 0.42, ring: true,
        items: [
          { role: 'banner', x: 4, y: 6 },
          { role: 'landmark', x: 9, y: 5 },
          { role: 'dwelling', size: 'l', x: 3, y: 8 },
          { role: 'hall', x: 8, y: 11 },
          { role: 'dwelling', size: 'm', x: 12, y: 13 },
          { role: 'dwelling', size: 'm', x: 4, y: 13 },
          { role: 'dwelling', size: 's', x: 8, y: 6 },
          { role: 'dwelling', size: 's', x: 12, y: 10 },
          { role: 'dwelling', size: 's', x: 3, y: 10 },
          { role: 'dwelling', size: 's', x: 8, y: 13 },
          { role: 'dwelling', size: 's', x: 13, y: 6 },
          { role: 'dwelling', size: 's', x: 6, y: 12 },
          { role: 'dwelling', size: 's', x: 10, y: 8 },
          { role: 'wall', x: 3, y: 13 },
          { role: 'yard', x: 8, y: 13 },
          { role: 'yard', x: 3, y: 6, chance: 0.6 },
        ],
      },
    ],
  };

  /**
   * Plans by era id (tools/civ/catalog.js ERAS). An era not listed builds
   * by DEFAULT_PLAN. Each era's entry is its own: change one without the others.
   */
  export const CITY_PLANS: Readonly<Record<string, CityEraPlan>> = {
    // --- stone ---
    // Small round huts loosely round a free central fire place. The village's items stay first in the town
    // (same targets, same hashes), so the town keeps its huts and adds a longhouse behind the fire and more
    // huts. The metropolis closes a palisade round longhouse, megalith and huts; inside it the narrow court
    // takes the smaller hearth, and the longhouse and megalith come first so they always find room.
    stone: {
      stages: [
        {
          max: 3, visible: 0.85,
          keep: [[5, 8, 10, 13]],
          items: [
            { role: 'fire', id: 'firepit', x: 8, y: 11 },
            { role: 'dwelling', size: 's', x: 3, y: 9 },
            { role: 'dwelling', size: 's', x: 13, y: 8 },
            { role: 'dwelling', size: 's', x: 13, y: 13 },
            { role: 'banner', x: 2, y: 6 },
          ],
        },
        {
          max: 5, visible: 0.6,
          keep: [[5, 8, 10, 13]],
          items: [
            { role: 'fire', id: 'firepit', x: 8, y: 11 },
            { role: 'dwelling', size: 's', x: 3, y: 9 },
            { role: 'dwelling', size: 's', x: 13, y: 8 },
            { role: 'dwelling', size: 's', x: 13, y: 13 },
            { role: 'banner', x: 2, y: 6 },
            { role: 'hall', x: 8, y: 5 },
            { role: 'dwelling', size: 'm', x: 3, y: 13 },
            { role: 'yard', x: 12, y: 5, chance: 0.5 },
          ],
        },
        {
          max: 8, visible: 0.45, ring: true,
          keep: [[6, 9, 9, 12]],
          items: [
            { role: 'fire', id: 'hearth', x: 8, y: 10 },
            { role: 'hall', x: 8, y: 7 },
            { role: 'landmark', x: 3, y: 10 },
            { role: 'banner', x: 13, y: 9 },
            { role: 'dwelling', size: 's', x: 12, y: 11 },
            { role: 'dwelling', size: 's', x: 3, y: 12 },
            { role: 'dwelling', size: 's', x: 13, y: 7 },
            { role: 'dwelling', size: 's', x: 3, y: 7 },
            { role: 'dwelling', size: 's', x: 11, y: 13 },
          ],
        },
      ],
    },
    // --- bronze ---
    // Low flat-roofed mud brick round courts: a village is one compound (a house behind a kept court,
    // small houses either side, a silo); a town two courtyard houses, the granary's clay silos and a
    // stretch of mud wall; a metropolis dense courtyard houses in a closed ring, the stepped temple
    // rising high over it.
    bronze: {
      stages: [
        {
          max: 3, visible: 0.8,
          keep: [[5, 9, 10, 13]],
          items: [
            { role: 'dwelling', size: 'm', x: 8, y: 8 },
            { role: 'dwelling', size: 's', x: 2, y: 12 },
            { role: 'dwelling', size: 's', x: 13, y: 12, chance: 0.6 },
            { role: 'yard', id: 'silo', x: 12, y: 8 },
            { role: 'banner', x: 4, y: 7 },
          ],
        },
        {
          max: 5, visible: 0.5,
          items: [
            { role: 'dwelling', size: 'l', x: 4, y: 8 },
            { role: 'dwelling', size: 'l', x: 12, y: 10 },
            { role: 'hall', x: 4, y: 13 },
            { role: 'wall', x: 12, y: 13 },
            { role: 'banner', x: 8, y: 5 },
            { role: 'dwelling', size: 's', x: 9, y: 6 },
            { role: 'dwelling', size: 's', x: 13, y: 6, chance: 0.6 },
          ],
        },
        {
          max: 8, visible: 0.3, ring: true,
          items: [
            { role: 'landmark', x: 8, y: 6 },
            { role: 'dwelling', size: 'l', x: 6, y: 12 },
            { role: 'dwelling', size: 'l', x: 10, y: 9 },
            { role: 'banner', x: 13, y: 12 },
            { role: 'dwelling', size: 's', x: 11, y: 12 },
            { role: 'dwelling', size: 's', x: 5, y: 9 },
            { role: 'dwelling', size: 's', x: 11, y: 7 },
            { role: 'dwelling', size: 's', x: 4, y: 7 },
            { role: 'wall', x: 8, y: 13 },
            { role: 'yard', id: 'well', x: 8, y: 12 },
          ],
        },
      ],
    },
    // --- iron ---
    // Gabled houses along cobbled streets (kept free, 3–4 px wide, so they stay light between the
    // buildings' dark rims): a village lines a lane, a town stands where a street meets the main
    // street, with its keep and a stretch of wall; a metropolis is ringed in stone, its main street
    // running from the gate up to the column temple with the keep towering behind it.
    iron: {
      stages: [
        {
          max: 3, visible: 0.8,
          keep: [[0, 10, 15, 12]],
          items: [
            { role: 'dwelling', size: 'm', x: 3, y: 9 },
            { role: 'dwelling', size: 'm', x: 13, y: 9 },
            { role: 'yard', id: 'market', x: 8, y: 9 },
            { role: 'banner', x: 8, y: 6 },
            { role: 'dwelling', size: 's', x: 12, y: 13, chance: 0.5 },
          ],
        },
        {
          max: 5, visible: 0.55,
          keep: [[6, 4, 9, 13], [10, 11, 15, 13]],
          items: [
            { role: 'hall', x: 12, y: 8 },
            { role: 'banner', x: 8, y: 5 },
            { role: 'dwelling', size: 'm', x: 3, y: 7 },
            { role: 'wall', x: 3, y: 13 },
            { role: 'dwelling', size: 's', x: 12, y: 10 },
            { role: 'dwelling', size: 's', x: 3, y: 10 },
            { role: 'dwelling', size: 's', x: 13, y: 5 },
            { role: 'dwelling', size: 's', x: 2, y: 5 },
          ],
        },
        {
          max: 8, visible: 0.3, ring: true,
          keep: [[6, 9, 9, 13]],
          items: [
            { role: 'landmark', x: 8, y: 9 },
            { role: 'hall', x: 8, y: 6 },
            { role: 'banner', x: 13, y: 9 },
            { role: 'dwelling', id: 'timberhouse', size: 's', x: 4, y: 12 },
            { role: 'dwelling', id: 'timberhouse', size: 's', x: 12, y: 12 },
            { role: 'dwelling', size: 's', x: 4, y: 10 },
            { role: 'dwelling', size: 's', x: 12, y: 10 },
            { role: 'wall', x: 8, y: 13 },
          ],
        },
      ],
    },
    // --- industrial ---
    // Brick rows under smokestacks: a village is a short terrace by a tall mill stack, a town a low
    // row of terraces in front of a sawtooth factory; a metropolis rises higher, the station's glass
    // vault before the factory and a five-storey tenement, stacks at its sides. The last houses
    // fill the banks where a river takes the middle.
    industrial: {
      stages: [
        {
          max: 3, visible: 0.6,
          items: [
            { role: 'banner', x: 3, y: 10 },
            { role: 'dwelling', size: 's', x: 6, y: 12 },
            { role: 'dwelling', size: 's', x: 11, y: 12 },
            { role: 'yard', x: 9, y: 9 },
            { role: 'dwelling', size: 's', x: 12, y: 8, chance: 0.5 },
          ],
        },
        {
          max: 5, visible: 0.4,
          items: [
            { role: 'banner', x: 2, y: 9 },
            { role: 'hall', x: 7, y: 9 },
            { role: 'dwelling', size: 'm', x: 3, y: 13 },
            { role: 'dwelling', size: 'm', x: 8, y: 13 },
            { role: 'dwelling', size: 'm', x: 13, y: 13 },
            { role: 'yard', x: 13, y: 9 },
            { role: 'dwelling', size: 's', x: 13, y: 7, chance: 0.5 },
          ],
        },
        {
          max: 8, visible: 0.3,
          items: [
            { role: 'banner', x: 13, y: 13 },
            { role: 'landmark', x: 5, y: 13 },
            { role: 'yard', x: 13, y: 11 },
            { role: 'hall', x: 5, y: 7 },
            { role: 'dwelling', size: 'l', x: 12, y: 8 },
            { role: 'dwelling', size: 'm', x: 2, y: 10 },
            { role: 'dwelling', size: 'm', x: 13, y: 10 },
            { role: 'yard', x: 2, y: 7 },
          ],
        },
      ],
    },
    // --- atomic ---
    // Angular concrete boxes in rows: a village is two low blocks and a mast apart, a town a slab
    // of flats behind a long hall; a metropolis is a high-rise slab beside the cooling tower.
    atomic: {
      stages: [
        {
          max: 3, visible: 0.7,
          items: [
            { role: 'banner', x: 13, y: 8 },
            { role: 'dwelling', size: 's', x: 4, y: 9 },
            { role: 'dwelling', size: 's', x: 12, y: 13 },
            { role: 'yard', x: 3, y: 13 },
            { role: 'dwelling', size: 's', x: 11, y: 6, chance: 0.3 },
          ],
        },
        {
          max: 5, visible: 0.4,
          items: [
            { role: 'banner', x: 14, y: 13 },
            { role: 'hall', x: 8, y: 13 },
            { role: 'dwelling', size: 'm', x: 3, y: 8 },
            { role: 'dwelling', size: 'm', x: 8, y: 8 },
            { role: 'dwelling', size: 'm', x: 13, y: 8 },
            { role: 'yard', x: 2, y: 13 },
          ],
        },
        {
          max: 8, visible: 0.35,
          items: [
            { role: 'banner', x: 5, y: 13 },
            { role: 'landmark', x: 11, y: 13 },
            { role: 'dwelling', size: 'l', x: 5, y: 9 },
            { role: 'dwelling', size: 'm', x: 3, y: 13 },
            { role: 'yard', x: 13, y: 5 },
          ],
        },
      ],
    },
    // --- information ---
    // Slim glass towers round an open plaza (the ground block's light slabs and lawn): the houses keep to
    // the back rows so the plaza in front stays free. Village: one tower between two low glass houses; town:
    // three towers behind and beside a low hall; metropolis: a row of tall towers, the radio tower on the
    // plaza before them. The pennant comes early, so a river tile still finds room for it.
    information: {
      stages: [
        {
          max: 3, visible: 0.85, cap: 'm',
          keep: [[3, 8, 12, 13]],
          items: [
            { role: 'dwelling', size: 'm', x: 8, y: 5 },
            { role: 'banner', x: 3, y: 12 },
            { role: 'dwelling', size: 's', x: 3, y: 7 },
            { role: 'dwelling', size: 's', x: 13, y: 7, chance: 0.6 },
            { role: 'yard', x: 13, y: 12 },
          ],
        },
        {
          max: 5, visible: 0.5, cap: 'm',
          keep: [[3, 8, 12, 13]],
          items: [
            { role: 'dwelling', size: 'm', x: 8, y: 5 },
            { role: 'banner', x: 3, y: 12 },
            { role: 'hall', x: 8, y: 7 },
            { role: 'dwelling', size: 'm', x: 2, y: 6 },
            { role: 'dwelling', size: 'm', x: 13, y: 7 },
            { role: 'yard', x: 13, y: 12 },
          ],
        },
        {
          max: 8, visible: 0.5,
          items: [
            { role: 'landmark', x: 8, y: 13 },
            { role: 'banner', x: 4, y: 12 },
            { role: 'dwelling', size: 'l', x: 2, y: 8 },
            { role: 'dwelling', size: 'l', x: 8, y: 9 },
            { role: 'dwelling', size: 'l', x: 13, y: 8 },
            { role: 'dwelling', size: 's', x: 12, y: 12, chance: 0.5 },
            { role: 'yard', x: 3, y: 13 },
          ],
        },
      ],
    },
    // --- nanotech ---
    // Rounded shells and green on a park (the ground block's lawn and looping path). Village: a few dome
    // houses among park trees round a free lawn; town: the glass dome, an organic tower and dome houses;
    // metropolis: the megatower rising over organic towers, dome houses and trees, the lawn before it free.
    nanotech: {
      stages: [
        {
          max: 3, visible: 0.85, cap: 's',
          keep: [[5, 10, 10, 13]],
          items: [
            { role: 'dwelling', size: 's', x: 4, y: 8 },
            { role: 'banner', x: 8, y: 9 },
            { role: 'dwelling', size: 's', x: 12, y: 9 },
            { role: 'dwelling', size: 's', x: 3, y: 13, chance: 0.6 },
            { role: 'yard', x: 12, y: 13 },
            { role: 'yard', x: 8, y: 6 },
          ],
        },
        {
          max: 5, visible: 0.6, cap: 'm',
          keep: [[6, 10, 9, 13]],
          items: [
            { role: 'hall', x: 9, y: 7 },
            { role: 'banner', x: 7, y: 12 },
            { role: 'dwelling', size: 'm', x: 3, y: 10 },
            { role: 'dwelling', size: 's', x: 12, y: 12 },
            { role: 'dwelling', size: 's', x: 3, y: 13 },
            { role: 'yard', x: 13, y: 8 },
            { role: 'yard', x: 9, y: 12 },
          ],
        },
        {
          max: 8, visible: 0.5,
          keep: [[6, 11, 9, 13]],
          items: [
            { role: 'landmark', x: 8, y: 10 },
            { role: 'banner', x: 6, y: 12 },
            { role: 'dwelling', size: 'l', x: 3, y: 9 },
            { role: 'dwelling', size: 'l', x: 13, y: 9 },
            { role: 'dwelling', size: 's', x: 3, y: 13 },
            { role: 'dwelling', size: 's', x: 12, y: 13, chance: 0.6 },
            { role: 'yard', x: 10, y: 12 },
            { role: 'yard', x: 13, y: 6 },
          ],
        },
      ],
    },
  };

  export function cityEraPlan(era: string): CityEraPlan {
    return CITY_PLANS[era] ?? DEFAULT_PLAN;
  }

  /**
   * A wandering group's camp: its fire place in the middle, kept free, and
   * up to CAMP_SHELTERS_MAX shelters round it in this order (a camp with n
   * shelters takes the first n, so pitching and striking add and remove
   * them one by one in place). No ground block: the grass stays.
   */
  export const CAMP_PLAN: CityStagePlan = {
    max: 0, visible: 0.85,
    keep: [[6, 10, 9, 13]],
    items: [
      { role: 'fire', id: 'campfire', x: 8, y: 12 },
      { role: 'shelter', x: 5, y: 5 },
      { role: 'shelter', x: 13, y: 10 },
      { role: 'shelter', x: 2, y: 10 },
      { role: 'shelter', x: 11, y: 5 },
    ],
  };
  export const CAMP_SHELTERS_MAX = 4;
}
