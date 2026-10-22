/* =============================================================================
 * SimEarth 2.0 — fields round the cities
 * -----------------------------------------------------------------------------
 * Which land tiles round each city carry a field, and in which look
 * (docs/bewegung-2026-10): written into the LAND_USE_FIELD bits of
 * `world.landUse`, which the landscape draws as field ground (landfield.ts).
 * Only drawn: nothing in the simulation reads them. Derived from the cities,
 * their era and size and the ground, deterministic by tile hash, so the same
 * planet shows the same fields after a load.
 * ========================================================================== */

namespace SE {
  /** Terrain material of each FieldLook (tools/terrain/fields.js); '' for none. */
  export const FIELD_MATERIALS: readonly string[] = [
    '', 'field_garden', 'field_strips', 'field_millet', 'field_paddy', 'field_terrace', 'field_hedgerows', 'field_large',
  ];

  /** Salt of the tile hashes. */
  const SALT_EXTRA = 0x6a1d;
  const SALT_JITTER = 0x6a2e;

  /** Tiles within CITY_UMLAND, nearest first, as (dx, dy, d²) triples; without the centre. */
  const RING: Int8Array = (() => {
    const out: number[][] = [];
    for (let dy = -CITY_UMLAND; dy <= CITY_UMLAND; dy++) {
      for (let dx = -CITY_UMLAND; dx <= CITY_UMLAND; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 > 0 && d2 <= CITY_UMLAND * CITY_UMLAND) out.push([dx, dy, d2]);
      }
    }
    out.sort((a, b) => a[2] - b[2]);
    return Int8Array.from(out.flat());
  })();

  /** The fields one city laid: its key (tile, era, size) and their tiles. */
  interface CityFields {
    key: number;
    tiles: number[];
    /** stepFields' call that last found its city. */
    seen: number;
  }

  /** Per world: what holds for all cities (drift, railway, wonders) and each city's fields by `City.id`. */
  const seen = new WeakMap<WorldState, { key: number; calls: number; cities: Map<number, CityFields> }>();

  /**
   * One civilization tick of the fields round the cities (civ.ts calls it
   * after the conflicts, and after each sync). A city lays its fields again
   * when it is founded, moves, changes era or size, and every FIELD_REFRESH
   * ticks for its ground, each on its own tick so the work spreads; all of
   * them after drift, a new railway or wonder, and when `landUse` lost their
   * bits (a load).
   */
  export function stepFields(world: WorldState, params: ModelParams): void {
    void params;
    const use = world.landUse;
    const civ = world.civ;
    const key = (Math.imul(world.driftShifts + 1, 0x9e3779b1) ^ Math.imul((civ.rail ? civ.rail.path.length : 0) + 1, 0x85ebca77) ^
      Math.imul(civ.wonders.length + 1, 0xc2b2ae3d)) >>> 0;
    let state = seen.get(world);
    let full = !state || state.key !== key;
    if (state && !full) {
      for (const f of state.cities.values()) if (f.tiles.length > 0 && (use[f.tiles[0]] & LAND_USE_FIELD) === 0) full = true;
    }
    if (!state || full) {
      for (let i = 0; i < TILE_COUNT; i++) use[i] &= ~LAND_USE_FIELD;
      state = { key, calls: 0, cities: new Map() };
      seen.set(world, state);
    }
    const laid = state.cities;
    const call = ++state.calls;
    for (const c of civ.cities) {
      const t = c.tile;
      const cityKey = (Math.imul(t + 1, 0x27d4eb2d) ^ (world.tech[t] << 4) ^ citySize(world.cityPop[t])) >>> 0;
      const f = laid.get(c.id);
      if (f) f.seen = call;
      if (f && f.key === cityKey && (c.id + world.ticks) % FIELD_REFRESH !== 0) continue;
      if (f) for (const j of f.tiles) use[j] &= ~LAND_USE_FIELD;
      laid.set(c.id, { key: cityKey, tiles: cityFields(world, t), seen: call });
    }
    // Fields of cities gone.
    for (const [id, f] of laid) {
      if (f.seen === call) continue;
      for (const j of f.tiles) use[j] &= ~LAND_USE_FIELD;
      laid.delete(id);
    }
  }

  const ground = newCityGround();
  /** Whether the tile fieldLook last let through lies beside a river. */
  let besideRiver = false;
  const tiles: number[] = [];
  const looks: number[] = [];
  const scores: number[] = [];
  const near: boolean[] = [];

  /** Lay the fields of the city on `tile`; returns their tiles. */
  function cityFields(world: WorldState, tile: number): number[] {
    const tech = world.tech[tile] as Tech;
    const out: number[] = [];
    if (tech === Tech.None) return out;
    const size = citySize(world.cityPop[tile]);
    const extra = spontaneousRoll(world.seed, tile, SALT_EXTRA) < 0.5 ? 1 : 0;
    const count = FIELD_COUNT[tech][size] + extra;
    const reach = Math.min(FIELD_REACH2[size], CITY_UMLAND * CITY_UMLAND);
    tiles.length = looks.length = scores.length = near.length = 0;
    for (let k = 0; k < RING.length; k += 3) {
      if (RING[k + 2] > reach) break;
      const j = tileAt(tile, RING[k], RING[k + 1]);
      if (j < 0) continue;
      const look = fieldLook(world, j, tech);
      if (look === FieldLook.None) continue;
      const river = besideRiver;
      const cleared = (world.landUse[j] & LAND_USE_LOGGED) !== 0 || isForest(world.landscape[j] as Landscape);
      tiles.push(j);
      looks.push(look);
      // On one of the city's four sides: as good as beside a field.
      near.push(RING[k + 2] === 1);
      scores.push(ground.fertility + (river ? FIELD_RIVER_NEAR : 0) + (cleared ? FIELD_CLEARED : 0) +
        FIELD_JITTER * spontaneousRoll(world.seed, j, SALT_JITTER) - FIELD_DISTANCE * (Math.sqrt(RING[k + 2]) - 1));
    }
    // Greedy, so they cluster: a field beside the city or beside one already laid scores more.
    const use = world.landUse;
    while (out.length < count) {
      let best = -1;
      let bestScore = -Infinity;
      for (let n = 0; n < tiles.length; n++) {
        if (tiles[n] < 0) continue;
        const s = scores[n] + (near[n] ? FIELD_TOUCH : 0);
        if (s > bestScore) { bestScore = s; best = n; }
      }
      if (best < 0) break;
      const j = tiles[best];
      use[j] |= looks[best];
      out.push(j);
      tiles[best] = -1;
      for (let n = 0; n < tiles.length; n++) if (tiles[n] >= 0 && sideBySide(tiles[n], j)) near[n] = true;
    }
    return out;
  }

  /** 1 on the landscapes a field may take (some only in part, see fieldLook). */
  const FIELD_GROUND = (() => {
    const out = new Uint8Array(LANDSCAPE_COUNT);
    for (const ls of [Landscape.Meadow, Landscape.Steppe, Landscape.Savanna, Landscape.Shrubland, Landscape.Fernland,
      Landscape.Forest, Landscape.Taiga, Landscape.Rainforest, Landscape.Marsh, Landscape.Semidesert]) out[ls] = 1;
    return out;
  })();

  function isForest(ls: Landscape): boolean {
    return ls === Landscape.Forest || ls === Landscape.Taiga || ls === Landscape.Rainforest;
  }

  /** Tiles `i` and `j` share a side (x wraps). */
  function sideBySide(i: number, j: number): boolean {
    const d = Math.abs(i - j);
    return d === GRID_W || (d === 1 && Math.floor(i / GRID_W) === Math.floor(j / GRID_W)) ||
      (d === GRID_W - 1 && Math.abs((i % GRID_W) - (j % GRID_W)) === GRID_W - 1);
  }

  /**
   * The look a field on tile `i` would have at a tech level, or None where
   * none may lie: water, forbidden or poor ground, a city, a river, the
   * railway or a wonder, steep slopes, a dense forest not yet logged. Leaves
   * the tile's CityGround in `ground` and whether a river runs beside it in
   * `besideRiver`.
   */
  function fieldLook(world: WorldState, i: number, tech: Tech): FieldLook {
    const ls = world.landscape[i] as Landscape;
    if (!FIELD_GROUND[ls] || world.tech[i] !== Tech.None || (world.landUse[i] & (LAND_USE_RAIL | LAND_USE_WONDER)) !== 0) return FieldLook.None;
    const g = cityGround(world, i, ground);
    if (g.water || g.forbidden || g.river || g.slope > FIELD_SLOPE_MAX) return FieldLook.None;
    const logged = (world.landUse[i] & LAND_USE_LOGGED) !== 0;
    const river = besideRiver = riverBeside(world, i);
    const t = world.temperature[i];
    const wet = world.moisture[i];
    const paddy = tech >= Tech.Bronze && t >= FIELD_PADDY_TEMP && (ls === Landscape.Marsh || wet >= FIELD_PADDY_MOISTURE) &&
      world.elevation[i] < FIELD_PADDY_HEIGHT && g.slope < FIELD_TERRACE_SLOPE;
    switch (ls) {
      case Landscape.Meadow: case Landscape.Steppe: case Landscape.Savanna: case Landscape.Shrubland: case Landscape.Fernland:
        break;
      case Landscape.Forest: case Landscape.Taiga: case Landscape.Rainforest:
        if (world.landscapeDensity[i] > 0 && !logged) return FieldLook.None;
        break;
      case Landscape.Marsh:
        if (!paddy) return FieldLook.None;
        break;
      case Landscape.Semidesert:
        // Irrigated from the river, as along the Nile.
        if (!river) return FieldLook.None;
        break;
      default:
        return FieldLook.None;
    }
    if (g.fertility + (river ? FIELD_RIVER_NEAR : 0) < FIELD_FERTILITY_MIN) return FieldLook.None;
    if (tech === Tech.Stone) return g.slope >= FIELD_TERRACE_SLOPE ? FieldLook.None : FieldLook.Garden;
    if (paddy) return FieldLook.Paddy;
    if (g.slope >= FIELD_TERRACE_SLOPE) return FieldLook.Terrace;
    const dry = ls === Landscape.Steppe || ls === Landscape.Savanna || ls === Landscape.Semidesert || wet < FIELD_DRY_MOISTURE;
    if (tech <= Tech.Iron) return dry ? FieldLook.DryStrips : FieldLook.Strips;
    if (tech === Tech.Industrial && !dry) return FieldLook.Hedgerows;
    return FieldLook.Large;
  }
}
