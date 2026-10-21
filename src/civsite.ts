/* =============================================================================
 * SimEarth 2.0 — city sites
 * -----------------------------------------------------------------------------
 * Where a city may stand, how good a site is and how many people its
 * surroundings feed (docs/zivilisation-spec.md §2.2, §2.3). `cityGround` is
 * the one place the civilization reads the terrain; everything else asks it.
 * ========================================================================== */

namespace SE {
  /** What one tile offers a city. */
  export interface CityGround {
    water: boolean;
    /** No city may be founded here: water, ice, snow, rock, desert, barren land, alpine meadow, bare rock, above the tree line. */
    forbidden: boolean;
    /** A river runs through the tile. */
    river: boolean;
    /** Water on one of the eight neighbours. */
    coast: boolean;
    /** Food the land yields, 0..1: landscape × soil × temperature; 0 on forbidden ground. */
    fertility: number;
    /** Steepest elevation step to a land neighbour. */
    slope: number;
  }

  export function newCityGround(): CityGround {
    return { water: false, forbidden: false, river: false, coast: false, fertility: 0, slope: 0 };
  }

  /** (dx, dy) pairs within a radius, flattened; with the centre. */
  function discOffsets(within: (d2: number) => boolean, r: number): Int8Array {
    const out: number[] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) if (within(dx * dx + dy * dy)) out.push(dx, dy);
    }
    return Int8Array.from(out);
  }

  /** Tiles closer than CITY_MIN_DIST: where no second city or settlers' site may be. */
  export const CITY_NEAR_DISC = discOffsets((d2) => d2 < CITY_MIN_DIST * CITY_MIN_DIST, CITY_MIN_DIST);
  /** The surroundings that feed a city. */
  const UMLAND_DISC = discOffsets((d2) => d2 <= CITY_UMLAND * CITY_UMLAND, CITY_UMLAND);

  /** Tile at an offset, x wrapping; -1 beyond a pole. */
  export function tileAt(i: number, dx: number, dy: number): number {
    const y = Math.floor(i / GRID_W) + dy;
    if (y < 0 || y >= GRID_H) return -1;
    return y * GRID_W + wrapX((i % GRID_W) + dx);
  }

  /** Euclidean distance in tiles, x wrapping. */
  export function tileDistance(a: number, b: number): number {
    let dx = Math.abs((a % GRID_W) - (b % GRID_W));
    if (dx > GRID_W / 2) dx = GRID_W - dx;
    const dy = Math.floor(a / GRID_W) - Math.floor(b / GRID_W);
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** High mountains: above the tree line by the climate zone, or by height while a tile has no zone yet. */
  export function aboveTreeLine(world: WorldState, i: number): boolean {
    const z = world.landscapeZone[i];
    return z === ZONE_NONE ? world.elevation[i] > TREE_LINE : (z & ZONE_TREELINE) !== 0;
  }

  function forbiddenGround(world: WorldState, i: number): boolean {
    const ls = world.landscape[i] as Landscape;
    return world.isWater(i) || ls === Landscape.Ice || ls === Landscape.Snow || ls === Landscape.Rock ||
      ls === Landscape.Desert || ls === Landscape.Barren || ls === Landscape.Alpine ||
      world.substrate[i] === Substrate.Rock || aboveTreeLine(world, i);
  }

  /** `CityGround.fertility` without the neighbourhood. */
  function landFood(world: WorldState, i: number): number {
    if (forbiddenGround(world, i)) return 0;
    const soil = CITY_SOIL_MIN + (1 - CITY_SOIL_MIN) * clamp(world.soil[i] / 255 / CITY_SOIL_FULL, 0, 1);
    const warmth = clamp(1 - Math.abs(world.temperature[i] - CITY_TEMP_BEST) / CITY_TEMP_SPAN, 0, 1);
    return CITY_FERTILITY[world.landscape[i]] * soil * warmth;
  }

  export function cityGround(world: WorldState, i: number, out: CityGround = newCityGround()): CityGround {
    const water = world.isWater(i);
    out.water = water;
    out.river = !water && world.riverLevel[i] > 0;
    out.forbidden = forbiddenGround(world, i);
    out.fertility = landFood(world, i);
    out.coast = false;
    out.slope = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const j = tileAt(i, dx, dy);
        if (j < 0) continue;
        if (world.isWater(j)) out.coast = true;
        else if (!water) out.slope = Math.max(out.slope, Math.abs(world.elevation[j] - world.elevation[i]));
      }
    }
    return out;
  }

  const ground = newCityGround();

  /** The temperature of the tile lies in the species' window (no species: anywhere). */
  export function climateFits(world: WorldState, i: number, species: Life = world.sentientClass): boolean {
    if (species === Life.None) return true;
    const [lo, hi] = LIFE[species].temp;
    const t = world.temperature[i];
    return t >= lo && t <= hi;
  }

  /** The city tile nearest to `i` closer than CITY_MIN_DIST, or -1. */
  export function cityTooClose(world: WorldState, i: number): number {
    let best = -1;
    let bestD = Infinity;
    for (let k = 0; k < CITY_NEAR_DISC.length; k += 2) {
      const j = tileAt(i, CITY_NEAR_DISC[k], CITY_NEAR_DISC[k + 1]);
      if (j < 0 || world.tech[j] === Tech.None) continue;
      const d = tileDistance(i, j);
      if (d < bestD) { bestD = d; best = j; }
    }
    return best;
  }

  /** A settler group other than `except` heads for a site closer than CITY_MIN_DIST. */
  export function goalTooClose(world: WorldState, i: number, except?: Settler): boolean {
    for (const s of world.civ.settlers) {
      if (s !== except && tileDistance(i, s.path[s.path.length - 1]) < CITY_MIN_DIST) return true;
    }
    return false;
  }

  /** The space project's launch site lies closer than SPACE_CITY_GAP, or tile `i` is under its apron or rocket (spaceport.ts). */
  export function spaceportTooClose(world: WorldState, i: number): boolean {
    const site = world.space.site;
    if (site < 0) return false;
    const dy = Math.floor(i / GRID_W) - Math.floor(site / GRID_W);
    let dx = Math.abs((i % GRID_W) - (site % GRID_W));
    if (dx > GRID_W / 2) dx = GRID_W - dx;
    return tileDistance(i, site) < SPACE_CITY_GAP || (dx <= 1 && dy <= 0 && dy >= -SPACE_RISE);
  }

  /** A new city may be founded here (spec §2.2). */
  export function citySiteAllowed(world: WorldState, i: number, except?: Settler, species: Life = world.sentientClass): boolean {
    return cityGroundFits(world, i, species) && cityTooClose(world, i) < 0 && !goalTooClose(world, i, except) && !spaceportTooClose(world, i);
  }

  /** Why the player may not found a city of `species` on tile `i`, or '' if they may (spec §2.10). */
  export function citySiteProblem(world: WorldState, i: number, species: Life): string {
    if (forbiddenGround(world, i)) return 'Hier kann keine Stadt stehen: Fels, Wüste oder Eis.';
    if (!climateFits(world, i, species)) {
      const cold = world.temperature[i] < LIFE[species].temp[0];
      return `Hier ist es ${LIFE[species].name} zu ${cold ? 'kalt' : 'heiß'} für eine Stadt.`;
    }
    const near = cityTooClose(world, i);
    if (near >= 0) return `Zu nah an ${world.civ.cityAt(near)?.name ?? 'einer Stadt'} (mind. ${CITY_MIN_DIST} Felder).`;
    if (goalTooClose(world, i)) return `Hier in der Nähe wollen schon Siedler eine Stadt gründen (mind. ${CITY_MIN_DIST} Felder).`;
    if (spaceportTooClose(world, i)) return `Zu nah am Raumhafen (mind. ${SPACE_CITY_GAP} Felder).`;
    return '';
  }

  /** The ground and climate allow a city, whatever its neighbours. */
  export function cityGroundFits(world: WorldState, i: number, species: Life = world.sentientClass): boolean {
    return !forbiddenGround(world, i) && climateFits(world, i, species);
  }

  /** Food of the surroundings per tile at a tech level, before farming; the centre counts twice. */
  export function umlandYield(world: WorldState, i: number, tech: Tech): number {
    let sum = 0;
    let weight = 0;
    for (let k = 0; k < UMLAND_DISC.length; k += 2) {
      const j = tileAt(i, UMLAND_DISC[k], UMLAND_DISC[k + 1]);
      if (j < 0) continue;
      const w = j === i ? 2 : 1;
      weight += w;
      if (world.isWater(j)) sum += w * CITY_FISHING[tech];
      else sum += w * landFood(world, j) * (world.riverLevel[j] > 0 ? CITY_RIVER_YIELD : 1);
    }
    return weight > 0 ? sum / weight : 0;
  }

  /** A river runs through one of the eight neighbours. */
  export function riverBeside(world: WorldState, i: number): boolean {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const j = tileAt(i, dx, dy);
        if (j >= 0 && j !== i && !world.isWater(j) && world.riverLevel[j] > 0) return true;
      }
    }
    return false;
  }

  /** How much settlers want this site: rivers and coasts first, then food, minus slope. */
  export function citySiteScore(world: WorldState, i: number): number {
    const g = cityGround(world, i, ground);
    const lie = (g.river ? SITE_RIVER : riverBeside(world, i) ? SITE_RIVER_NEAR : 0) +
      (g.coast ? SITE_COAST : 0) - SITE_SLOPE * g.slope;
    return lie + SITE_FOOD * umlandYield(world, i, Tech.None);
  }

  /** People the surroundings of a city at tile `i` feed, 0..1 (spec §2.3). */
  export function cityCapacity(world: WorldState, i: number, tech: Tech, params: ModelParams): number {
    const farming = 0.5 + 0.5 * mul(params.civAlloc.agriculture);
    return clamp(umlandYield(world, i, tech) * CITY_TECH_YIELD[tech] * farming, 0, 1);
  }
}
