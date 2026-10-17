/* =============================================================================
 * SimEarth 2.0 — succession: landscape, soil, density and substrate
 * -----------------------------------------------------------------------------
 * Every land tile carries a landscape — its succession stage — and climbs
 * towards the climax its climate and plant groups allow, one stage at a time
 * (docs/biomes-spec.md §3). Every SUCCESSION_TARGET_INTERVAL ticks (and
 * at once after an edit, a load or a plate shift):
 *
 *   smoothing  temperature (at sea level), moisture and plant cover averaged
 *              over 7×7 land tiles, so zone borders follow smooth isolines,
 *              not tile noise, and altitude belts follow the contour lines
 *   soil       weathering makes regolith of bare rock, roots build soil,
 *              bare slopes and ice wear it away down to the regolith
 *   targets    climate zone (Schmitt triggers) × plant groups present on the
 *              tile or on ≥ 3 of its 8 neighbours → climax target; lone and
 *              outvoted targets join their neighbours, unnatural neighbours
 *              get the stage between them
 *
 * Every tick:
 *
 *   stepping   a tile moves one stage towards its target once it has held
 *              the next stage long enough: a few ticks in geologic time, real
 *              years when ticks are short, spread per tile by a smooth hash,
 *              halved at a front and doubled for an isolated forest seed —
 *              zones grow from their edges instead of flipping at once
 *   coherence  lone and outvoted landscapes join their neighbours, one stage
 *              at most; unnatural neighbours are bridged
 *
 * Disturbances (clearing, fire, lava, ice, flooding) reset a tile at once.
 * Everything is deterministic: tile hashes, never `world.rng`.
 * ========================================================================== */

namespace SE {
  /* ------------------------------------------------------------ scratch -- */

  /** Eight neighbours per tile (NW N NE W E SW S SE), -1 beyond the poles. */
  const NB = (() => {
    const out = new Int32Array(TILE_COUNT * 8);
    const d = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const i = idx(x, y);
        for (let k = 0; k < 8; k++) {
          const ny = y + d[k][1];
          out[i * 8 + k] = ny < 0 || ny >= GRID_H ? -1 : idx(wrapX(x + d[k][0]), ny);
        }
      }
    }
    return out;
  })();

  // Scratch shared by every world: recomputed whenever another world is
  // stepped (see `targetWorld`).
  const tempSm = new Float32Array(TILE_COUNT);
  const moistSm = new Float32Array(TILE_COUNT);
  const coverSm = new Float32Array(TILE_COUNT);
  /**
   * The height a land tile's landscape is read at: the mean of its 3×3 land
   * block. Ranges only one to three tiles wide would otherwise give altitude
   * belts one tile wide, every tile alone; the renderer draws the crests'
   * own rock and snow on top.
   */
  const landElev = new Float32Array(TILE_COUNT);
  /** Row sums of the box filter, for the 2R+1 rows the column sums currently hold. */
  const RING = 2 * LANDSCAPE_SMOOTH_RADIUS + 1;
  const sumT = new Float64Array(RING * GRID_W);
  const sumM = new Float64Array(RING * GRID_W);
  const sumC = new Float64Array(RING * GRID_W);
  const sumN = new Float64Array(RING * GRID_W);
  const present = new Uint16Array(TILE_COUNT);
  const target = new Uint8Array(TILE_COUNT);
  const snapshot = new Uint8Array(TILE_COUNT);
  /** Per land tile of the field being filtered: neighbours sharing its value, and a bit per neighbour value. */
  const sameCnt = new Uint8Array(TILE_COUNT);
  const nbMask = new Int32Array(TILE_COUNT);
  const pendingTile = new Int32Array(TILE_COUNT);
  const pendingValue = new Uint8Array(TILE_COUNT);
  /** Tiles the landscape filters look at this tick, and a stamp against listing one twice. */
  const candidates = new Int32Array(TILE_COUNT);
  const candidateStamp = new Uint32Array(TILE_COUNT);
  let candidateCount = 0;
  const colT = new Float64Array(GRID_W);
  const colM = new Float64Array(GRID_W);
  const colC = new Float64Array(GRID_W);
  const colN = new Float64Array(GRID_W);
  const allowedCache = new Int32Array(TILE_COUNT);
  const allowedStamp = new Uint32Array(TILE_COUNT);
  /**
   * Climate the allowed landscapes of a land tile are read at: the smoothed
   * climate, followed only as far as needed to stay within the Schmitt band
   * of it. A climate wavering inside the bands never moves them back and
   * forth (altitude belts put a class border on every contour line).
   */
  const allowedTemp = new Float32Array(TILE_COUNT).fill(NaN);
  const allowedMoist = new Float32Array(TILE_COUNT).fill(NaN);
  const lad = new Uint8Array(5);
  const tally = new Uint8Array(LANDSCAPE_COUNT);
  let stamp = 0;
  /** Clashing tiles the last `bridges` pass left as they were. */
  let unbridged = 0;
  /** Land tiles of the world being stepped, listed afresh on every call. */
  const landList = new Int32Array(TILE_COUNT);
  let landCount = 0;
  /** The world the targets in the scratch belong to, and its plate shifts then. */
  let targetWorld: WorldState | null = null;
  let targetShifts = -1;

  const SOIL_EARTH_U8 = Math.ceil(SOIL_EARTH * 255);
  const SOIL_REGOLITH_U8 = Math.floor(SOIL_REGOLITH * 255);
  const FOREST_DENSITY_BOUNDS = [DENSITY_BOUNDS[1]];
  const CRUST_FLORA = floraBit(Flora.LandPlants) | floraBit(Flora.Mosses);


  /* --------------------------------------------------------------- hash -- */

  function hash32(a: number, b: number): number {
    let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ b;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h = Math.imul(h ^ (h >>> 16), 0x27d4eb2f);
    return (h ^ (h >>> 15)) >>> 0;
  }

  /*
   * Per-tile spread of the hold time: a coarse value noise (cells of 8 tiles)
   * with a little per-tile hash on top, so neighbouring tiles tend to switch
   * together and a zone fills in blobs from its edges, not as salt and pepper
   * and not as a straight front.
   */
  const SPREAD_CELL = 8;
  const spreadTicks = new Uint8Array(TILE_COUNT);
  const spreadFrac = new Float32Array(TILE_COUNT);
  let spreadSeed = -1;

  function prepareSpread(seed: number): void {
    if (seed === spreadSeed) return;
    spreadSeed = seed;
    const cw = GRID_W / SPREAD_CELL;
    const lattice = (cx: number, cy: number): number => hash32(seed ^ 0x51ed270b, (cx % cw) + cy * 4099) / 4294967296;
    for (let y = 0; y < GRID_H; y++) {
      const fy = y / SPREAD_CELL;
      const cy = Math.floor(fy);
      const ty = smoothstep(fy - cy);
      for (let x = 0; x < GRID_W; x++) {
        const fx = x / SPREAD_CELL;
        const cx = Math.floor(fx);
        const tx = smoothstep(fx - cx);
        const smooth = lerp(lerp(lattice(cx, cy), lattice(cx + 1, cy), tx), lerp(lattice(cx, cy + 1), lattice(cx + 1, cy + 1), tx), ty);
        const i = idx(x, y);
        const own = hash32(seed, i) / 4294967296;
        // Bilinear noise bunches around 0.5; stretch it back towards 0..1.
        const u = clamp((0.7 * smooth + 0.3 * own - 0.5) * 1.7 + 0.5, 0, 0.9999);
        spreadFrac[i] = u;
        spreadTicks[i] = Math.floor(u * (SUCCESSION_HOLD_SPREAD + 1));
      }
    }
  }

  /* ------------------------------------------------------------ helpers -- */

  function classOf(v: number, bounds: readonly number[]): number {
    let c = 0;
    while (c < bounds.length && v >= bounds[c]) c++;
    return c;
  }

  /** `last` dragged along by `v` no further than to keep it within `band` of it (`v` itself without a last value). */
  function lagged(last: number, v: number, band: number): number {
    return last > v + band ? v + band : last < v - band ? v - band : last === last ? last : v;
  }

  /** The answers a band around a threshold allows: bit 0 = false possible, bit 1 = true possible. */
  function flagOptions(atOneEnd: boolean, atOtherEnd: boolean): number {
    return (atOneEnd ? 2 : 1) | (atOtherEnd ? 2 : 1);
  }

  /** Fresh volcanic rock or an impact crater (hoehe-spec §3.7, E4): it does not weather while the scar lies. */
  function freshRock(world: WorldState, i: number): boolean {
    const s = world.hazards.scar[i];
    return s === ScarKind.Basalt || s === ScarKind.Vent || s === ScarKind.Crater;
  }

  /** Whether bare rock weathers to regolith yet: not on the young Earth before the first land plants. */
  function weathering(world: WorldState): boolean {
    return world.evo.isDeveloped(REGOLITH_AFTER_STEP);
  }

  /** Weathered ground on land the planet's age has long since broken down, unless it is fresh rock. */
  function seedRegolithAt(world: WorldState, i: number): void {
    if (world.soil[i] < SOIL_REGOLITH_U8 && (world.flora[i] & LAND_FLORA_MASK) !== 0 && !freshRock(world, i)) world.soil[i] = SOIL_REGOLITH_U8;
  }

  /**
   * Warm start for a planet past REGOLITH_AFTER_STEP whose land has no
   * regolith yet, such as a save from before the rock rule: every land tile
   * gets what weathering would have made of it by now. Land that starts
   * its succession on an old planet gets it on its own (`scanLand`).
   */
  export function seedRegolith(world: WorldState): void {
    if (!weathering(world)) return;
    for (let i = 0; i < TILE_COUNT; i++) if (world.elevation[i] >= 0) seedRegolithAt(world, i);
  }

  /** Regolith weathered per tick from bare rock: faster where it is warm and wet. */
  function weatheringRate(temp: number, moist: number): number {
    const warmth = clamp((temp - SOIL_WEATHER_COLD) / (SOIL_WEATHER_REF_TEMP - SOIL_WEATHER_COLD), SOIL_WEATHER_MIN, SOIL_WEATHER_MAX);
    const water = clamp(moist / SOIL_WEATHER_REF_MOIST, SOIL_WEATHER_MIN, SOIL_WEATHER_MAX);
    return SOIL_WEATHER_RATE * warmth * water;
  }

  /**
   * Altitude belt of a mountain tile at temperature `temp` (its own height):
   * 1 montane, 2 above the tree line, 3 rock belt, 4 summit snow. Belt 0 is
   * the lowland; BELT_FLAGS are the nested ZONE_ flags of `landscapeZone`.
   */
  function mountainBelt(temp: number, snowT: number): number {
    return temp >= TREELINE_TEMP ? 1 : temp >= ROCKBELT_TEMP ? 2 : temp >= snowT ? 3 : 4;
  }
  const BELT_FLAGS = [0, ZONE_MOUNTAIN, ZONE_MOUNTAIN | ZONE_TREELINE, ZONE_MOUNTAIN | ZONE_TREELINE | ZONE_ROCKBELT,
    ZONE_MOUNTAIN | ZONE_TREELINE | ZONE_ROCKBELT | ZONE_SNOW];

  /**
   * The plant cover a tile's zone is judged by: the stand around it, unless
   * the tile itself is clearly green — a river bank or an oasis in a bare
   * zone still shows its plants.
   */
  function zoneCover(world: WorldState, i: number): number {
    return Math.max(coverSm[i], world.vegetation[i] - BARE_COVER);
  }

  /** Neighbour statistics of one land tile in `field`. */
  function statsAt(elevation: Float32Array, field: Uint8Array, i: number): void {
    const v = field[i];
    let same = 0;
    let mask = 0;
    const base = i * 8;
    for (let k = 0; k < 8; k++) {
      const j = NB[base + k];
      if (j < 0 || elevation[j] < 0) continue;
      const l = field[j];
      mask |= 1 << l;
      if (l === v) same++;
    }
    sameCnt[i] = same;
    nbMask[i] = mask;
  }

  /**
   * Neighbour statistics of every land tile. A tile whose four orthogonal
   * neighbours are land of its own value can be neither lone, outvoted nor
   * in a clash a neighbour would not see first, so it is marked as settled
   * without reading its diagonals.
   */
  function stats(elevation: Float32Array, field: Uint8Array): void {
    for (let k = 0; k < landCount; k++) {
      const i = landList[k];
      const v = field[i];
      const b = i * 8;
      const n = NB[b + 1];
      const wst = NB[b + 3];
      const e = NB[b + 4];
      const s = NB[b + 6];
      if (n >= 0 && s >= 0 && field[n] === v && field[s] === v && field[wst] === v && field[e] === v &&
          elevation[n] >= 0 && elevation[s] >= 0 && elevation[wst] >= 0 && elevation[e] >= 0) {
        sameCnt[i] = 8;
        nbMask[i] = 1 << v;
      } else {
        statsAt(elevation, field, i);
      }
    }
  }

  function addCandidate(i: number): void {
    if (candidateStamp[i] === stamp) return;
    candidateStamp[i] = stamp;
    candidates[candidateCount++] = i;
  }

  /** List a changed tile and its land neighbours for the landscape filters. */
  function touch(elevation: Float32Array, i: number): void {
    addCandidate(i);
    for (let k = 0; k < 8; k++) {
      const j = NB[i * 8 + k];
      if (j >= 0 && elevation[j] >= 0) addCandidate(j);
    }
  }

  /** Refresh the statistics around tiles whose value just changed. */
  function restat(elevation: Float32Array, field: Uint8Array, count: number): void {
    for (let p = 0; p < count; p++) {
      const i = pendingTile[p];
      statsAt(elevation, field, i);
      for (let k = 0; k < 8; k++) {
        const j = NB[i * 8 + k];
        if (j >= 0 && elevation[j] >= 0) statsAt(elevation, field, j);
      }
    }
  }

  export class SuccessionSystem {
    /**
     * Update every land tile's landscape, soil, density and substrate.
     * Succession itself advances at most once per tick: `advance` false (or a
     * second call in the same tick, after a player edit) only starts new
     * land at its target and refreshes the derived fields.
     */
    static step(world: WorldState, advance: boolean): void {
      prepareSpread(world.seed);
      const run = advance && world.ticks !== world.successionTick;
      if (run) world.successionTick = world.ticks;
      stamp = (stamp + 1) >>> 0 || 1;
      candidateCount = 0;
      const newLand = SuccessionSystem.scanLand(world);
      const { elevation } = world;

      // The targets follow the climate, which moves slowly next to holds of
      // several ticks: a running game refreshes them every
      // SUCCESSION_TARGET_INTERVAL ticks. An edit, a load, new land, a plate
      // shift (the cache is per tile) or another world refreshes them at once.
      const full = !run || newLand || targetWorld !== world || targetShifts !== world.driftShifts ||
        world.ticks % SUCCESSION_TARGET_INTERVAL === 0;
      if (full) {
        if (targetWorld !== world || targetShifts !== world.driftShifts) {
          allowedTemp.fill(NaN);
          allowedMoist.fill(NaN);
        }
        targetWorld = world;
        targetShifts = world.driftShifts;
        SuccessionSystem.smooth(world);
        SuccessionSystem.classify(world);
        stats(elevation, target);
        for (let pass = 0; pass < SUCCESSION_MODE_PASSES; pass++) {
          const n = SuccessionSystem.mode(world, target, false, landList, landCount);
          if (n === 0) break;
          SuccessionSystem.applyPending(world, target, n, false);
        }
        // A target bridged between unnatural neighbours flags its landscape
        // for the landscape filters below as well.
        SuccessionSystem.applyPending(world, target, SuccessionSystem.bridges(world, target, true, landList, landCount), false, true);
        if (unbridged > 0) SuccessionSystem.applyPending(world, target, SuccessionSystem.bridges(world, target, false, landList, landCount), false, true);
      }

      SuccessionSystem.settle(world, run, full);
      if (run) {
        const field = world.landscape;
        const row = world.ticks % SUCCESSION_SWEEP_ROWS;
        for (let y = row; y < GRID_H; y += SUCCESSION_SWEEP_ROWS) {
          for (let x = 0; x < GRID_W; x++) if (elevation[y * GRID_W + x] >= 0) addCandidate(y * GRID_W + x);
        }
        for (let c = 0; c < candidateCount; c++) statsAt(elevation, field, candidates[c]);
        SuccessionSystem.applyPending(world, field, SuccessionSystem.mode(world, field, true, candidates, candidateCount), true);
        SuccessionSystem.applyPending(world, field, SuccessionSystem.bridges(world, field, true, candidates, candidateCount), true);
        if (unbridged > 0) SuccessionSystem.applyPending(world, field, SuccessionSystem.bridges(world, field, false, candidates, candidateCount), true);
      }
    }

    /* ------------------------------------------------------ disturbances -- */

    /** Plants cleared off a tile: bare soil if there is any, else rock. */
    static clear(world: WorldState, i: number): void {
      if (world.elevation[i] < 0) return;
      SuccessionSystem.reset(world, i, world.soil[i] >= SOIL_EARTH_U8 ? Landscape.Barren : Landscape.Rock);
    }

    /** A fire took the trees: woodland falls back to bare soil, a swamp forest to marsh. */
    static burn(world: WorldState, i: number): void {
      if (world.elevation[i] < 0) return;
      const l = world.landscape[i] as Landscape;
      if (l === Landscape.Swampforest) SuccessionSystem.reset(world, i, Landscape.Marsh);
      else if (LANDSCAPE_LEVEL[l] >= 3) SuccessionSystem.clear(world, i);
    }

    /** Lava or an impact: fresh rock, no soil left. */
    static scour(world: WorldState, i: number): void {
      if (world.elevation[i] < 0) return;
      world.soil[i] = 0;
      SuccessionSystem.reset(world, i, Landscape.Rock);
    }

    /** Put landscape `l` on the tile at once, with no succession under way. */
    static reset(world: WorldState, i: number, l: Landscape): void {
      world.landscape[i] = l;
      world.landscapeNext[i] = l;
      world.landscapeHold[i] = 0;
      world.landscapeDensity[i] = 0;
    }

    /* ------------------------------------------------------- smoothing -- */

    /**
     * Box mean of temperature, moisture and plant cover over land only,
     * separable in X and Y. Temperature is averaged at sea level and each
     * tile's own height taken off again (hoehe-spec §3.5): climate zones stay
     * broad, altitude belts follow the contour lines.
     */
    private static smooth(world: WorldState): void {
      const R = LANDSCAPE_SMOOTH_RADIUS;
      const { elevation } = world;
      for (let k = 0; k < landCount; k++) {
        const i = landList[k];
        let sum = elevation[i];
        let n = 1;
        for (let q = 0; q < 8; q++) {
          const j = NB[i * 8 + q];
          if (j >= 0 && elevation[j] >= 0) { sum += elevation[j]; n++; }
        }
        landElev[i] = sum / n;
      }
      // Vertical pass row by row: a running sum per column over the row sums
      // of the last 2R+1 rows, all of it small enough to stay in cache.
      colT.fill(0); colM.fill(0); colC.fill(0); colN.fill(0);
      for (let y = 0; y <= R && y < GRID_H; y++) SuccessionSystem.addRow(world, y, 1);
      for (let y = 0; y < GRID_H; y++) {
        const row = y * GRID_W;
        for (let x = 0; x < GRID_W; x++) {
          const n = colN[x];
          if (n > 0.5) {
            tempSm[row + x] = colT[x] / n - altitudeCooling(landElev[row + x]);
            moistSm[row + x] = colM[x] / n;
            coverSm[row + x] = Math.max(0, colC[x] / n);
          }
        }
        if (y - R >= 0) SuccessionSystem.addRow(world, y - R, -1);
        if (y + R + 1 < GRID_H) SuccessionSystem.addRow(world, y + R + 1, 1);
      }
    }

    /**
     * Add (sign 1) or remove (-1) one row's horizontal box sums to the
     * column sums. Adding computes them first, into the row's ring slot.
     */
    private static addRow(world: WorldState, y: number, sign: number): void {
      const slot = (y % RING) * GRID_W;
      if (sign > 0) {
        const { elevation, temperature, moisture, vegetation } = world;
        const R = LANDSCAPE_SMOOTH_RADIUS;
        // Land only, so the sea-level temperature is T + lapse · elevation.
        const lapse = LAPSE_RATE * ELEVATION_KM;
        const row = y * GRID_W;
        let st = 0;
        let sm = 0;
        let sc = 0;
        let n = 0;
        for (let dx = -R; dx <= R; dx++) {
          const j = row + wrapX(dx);
          const e = elevation[j];
          if (e >= 0) { st += temperature[j] + lapse * e; sm += moisture[j]; sc += vegetation[j]; n++; }
        }
        for (let x = 0; x < GRID_W; x++) {
          const k = slot + x;
          sumT[k] = st; sumM[k] = sm; sumC[k] = sc; sumN[k] = n;
          const xo = x - R;
          const xi = x + R + 1;
          const out = row + (xo < 0 ? xo + GRID_W : xo);
          const inn = row + (xi >= GRID_W ? xi - GRID_W : xi);
          const eo = elevation[out];
          const ei = elevation[inn];
          if (eo >= 0) { st -= temperature[out] + lapse * eo; sm -= moisture[out]; sc -= vegetation[out]; n--; }
          if (ei >= 0) { st += temperature[inn] + lapse * ei; sm += moisture[inn]; sc += vegetation[inn]; n++; }
        }
      }
      for (let x = 0; x < GRID_W; x++) {
        const k = slot + x;
        colT[x] += sign * sumT[k];
        colM[x] += sign * sumM[k];
        colC[x] += sign * sumC[k];
        colN[x] += sign * sumN[k];
      }
    }

    /* ---------------------------------------------------------- targets -- */

    /**
     * List the land tiles, and give land the sea has taken back the plain
     * water state (no landscape, no soil). Returns whether any land has no
     * landscape yet.
     */
    private static scanLand(world: WorldState): boolean {
      const { elevation, landscape, landscapeNext, landscapeHold, landscapeDensity, substrate, soil } = world;
      const zones = world.landscapeZone;
      let n = 0;
      let fresh = false;
      const old = weathering(world);
      for (let i = 0; i < TILE_COUNT; i++) {
        if (elevation[i] >= 0) {
          landList[n++] = i;
          if (landscapeNext[i] === LANDSCAPE_UNSET) {
            fresh = true;
            // Land a hotspot or an island arc has just built is fresh lava
            // (hoehe-spec §3.7, case 3): it weathers from bare rock.
            const kind = world.upliftKind[i];
            if (old && kind !== UpliftKind.Hotspot && kind !== UpliftKind.IslandArc) seedRegolithAt(world, i);
          }
        } else if (landscapeNext[i] !== LANDSCAPE_UNSET || landscape[i] !== Landscape.Rock) {
          landscapeNext[i] = LANDSCAPE_UNSET;
          landscape[i] = Landscape.Rock;
          landscapeHold[i] = 0;
          landscapeDensity[i] = 0;
          substrate[i] = Substrate.Rock;
          soil[i] = 0;
          zones[i] = ZONE_NONE;
        }
      }
      landCount = n;
      return fresh;
    }

    /**
     * One pass over the land: which plant groups count as present (on the
     * tile or on ≥ 3 of its 8 neighbours), the climate zone and the ladder
     * and climax target it gives.
     */
    private static classify(world: WorldState): void {
      const woody = woodyFloraMask(world);
      const cacti = cactiArrived(world);
      for (let k = 0; k < landCount; k++) SuccessionSystem.classifyTile(world, landList[k], woody, cacti);
    }

    /** One land tile of `classify`. */
    private static classifyTile(world: WorldState, i: number, woody: number, cacti: boolean): void {
      const { elevation, flora, soil } = world;
      const zones = world.landscapeZone;
      let s1 = 0;
      let s2 = 0;
      let s3 = 0;
      const base = i * 8;
      for (let q = 0; q < 8; q++) {
        const j = NB[base + q];
        if (j < 0) continue;
        const f = flora[j];
        s3 |= s2 & f;
        s2 |= s1 & f;
        s1 |= f;
      }
      const p = flora[i] | s3;
      present[i] = p;
      const z = landscapeZone(tempSm[i], moistSm[i], landElev[i], zoneCover(world, i), zones[i], elevation[i], world.terraformed[i] !== 0);
      allowedTemp[i] = lagged(allowedTemp[i], tempSm[i], SCHMITT_TEMP);
      allowedMoist[i] = lagged(allowedMoist[i], moistSm[i], SCHMITT_MOISTURE);
      zones[i] = z;
      target[i] = ladderTarget(fillLadder(z, p, soil[i] >= SOIL_EARTH_U8, lad, woody, cacti), lad);
    }

    /**
     * Smoothed climate, zone, target, substrate and density of the land
     * tiles in `tiles` only, read off their own neighbourhood as the full
     * pass reads it but without its coherence filters: the terraforming
     * brush's settle, where a full pass would stall a frame. The next full
     * target refresh (every SUCCESSION_TARGET_INTERVAL ticks) redoes them.
     * Only valid for the world the last full pass targeted; otherwise the
     * next tick refreshes everything anyway.
     */
    static refreshTiles(world: WorldState, tiles: readonly number[]): void {
      const { elevation, temperature, moisture, vegetation } = world;
      const R = LANDSCAPE_SMOOTH_RADIUS;
      const lapse = LAPSE_RATE * ELEVATION_KM;
      for (const i of tiles) {
        if (elevation[i] < 0) continue;
        let sum = elevation[i];
        let n = 1;
        for (let q = 0; q < 8; q++) {
          const j = NB[i * 8 + q];
          if (j >= 0 && elevation[j] >= 0) { sum += elevation[j]; n++; }
        }
        landElev[i] = sum / n;
      }
      const woody = woodyFloraMask(world);
      const cacti = cactiArrived(world);
      for (const i of tiles) {
        if (elevation[i] < 0) continue;
        const x = i % GRID_W;
        const y = (i / GRID_W) | 0;
        let st = 0;
        let sm = 0;
        let sc = 0;
        let n = 0;
        for (let yy = Math.max(0, y - R); yy <= Math.min(GRID_H - 1, y + R); yy++) {
          for (let dx = -R; dx <= R; dx++) {
            const j = yy * GRID_W + wrapX(x + dx);
            const e = elevation[j];
            if (e >= 0) { st += temperature[j] + lapse * e; sm += moisture[j]; sc += vegetation[j]; n++; }
          }
        }
        tempSm[i] = st / n - altitudeCooling(landElev[i]);
        moistSm[i] = sm / n;
        coverSm[i] = Math.max(0, sc / n);
        SuccessionSystem.classifyTile(world, i, woody, cacti);
        world.substrate[i] = SuccessionSystem.substrateFor(world, i, world.landscapeZone[i], moistSm[i]);
        SuccessionSystem.densityAt(world, i);
      }
    }

    /**
     * A tile's soil after one tick: its own plants and the stand around it build it
     * (only a crust where mosses and the first land plants grow alone),
     * weathering turns bare rock into regolith without them, fresh lava and
     * craters excepted (hoehe-spec §3.7), and bare ground loses what the
     * plants built, faster on a slope. Under an ice sheet it turns to till:
     * the plant soil is scraped off, bare rock ground down to regolith.
     * Rates run in real years when ticks are short (SOIL_YEARS). The result
     * is rounded with a tile hash, so rates far below one byte step still
     * accumulate.
     */
    private static soilAt(world: WorldState, i: number, p: number, timeF: number, seed: number, weathers0: boolean): number {
      const { elevation, vegetation, landscape } = world;
      const veg = vegetation[i];
      const byte = world.soil[i];
      const rooted = (p & VASCULAR_FLORA_MASK) !== 0;
      const grown = rooted ? 1 : (p & CRUST_FLORA) ? SOIL_CRUST_MAX : 0;
      const ice = landscape[i] === Landscape.Ice;
      if (ice) {
        if (byte === SOIL_REGOLITH_U8) return byte;
        const s = byte / 255;
        const till = s > SOIL_REGOLITH ? Math.max(SOIL_REGOLITH, s - SOIL_ICE_SCOUR * timeF)
          : Math.min(SOIL_REGOLITH, s + SOIL_ICE_SCOUR * timeF);
        return clamp(Math.floor(till * 255 + hash32(seed, i) / 4294967296), 0, 255);
      }
      // Rock weathers where plants have reached it (on the tile or around it),
      // so brown Rohboden spreads with them instead of ahead of them.
      const weathers = weathers0 && (p & LAND_FLORA_MASK) !== 0 && !freshRock(world, i);
      const cap = weathers ? Math.max(grown, SOIL_REGOLITH) : grown;
      // Nothing to build and nothing to lose: most of the planet, most ticks.
      if (byte >= Math.floor(cap * 255) && (veg >= BARE_COVER || byte <= SOIL_REGOLITH_U8)) return byte;
      let s = byte / 255;
      const cover = Math.max(veg, coverSm[i]);
      if (s < grown && cover > 0) s = Math.min(grown, s + SOIL_BUILD_RATE * cover * (rooted ? 1 : 0.5) * timeF);
      if (weathers && s < SOIL_REGOLITH) s = Math.min(SOIL_REGOLITH, s + weatheringRate(tempSm[i], moistSm[i]) * timeF);
      if (veg < BARE_COVER && s > SOIL_REGOLITH) {
        const e = elevation[i];
        let slope = 0;
        for (let k = 0; k < 8; k++) {
          const j = NB[i * 8 + k];
          if (j >= 0 && elevation[j] >= 0) slope = Math.max(slope, Math.abs(elevation[j] - e));
        }
        s = Math.max(SOIL_REGOLITH, s - SOIL_EROSION_RATE * (1 - veg / BARE_COVER) * (1 + slope * SOIL_SLOPE_FACTOR) * timeF);
      }
      return clamp(Math.floor(s * 255 + hash32(seed, i) / 4294967296), 0, 255);
    }

    /**
     * Every landscape a tile could hold with its climate anywhere inside the
     * Schmitt bands: the stages on its ladder up to the climax, for each
     * class the bands reach. What the coherence filters may put on the tile.
     */
    private static allowed(world: WorldState, i: number): number {
      if (allowedStamp[i] === stamp) return allowedCache[i];
      const T = allowedTemp[i];
      const m = allowedMoist[i];
      const c = zoneCover(world, i);
      const e = world.elevation[i];
      // Temperature classes the bands reach: tropical by the sea-level
      // temperature, the others by the tile's own (as in `landscapeZone`).
      const h = landElev[i];
      const tSea = T + altitudeCooling(h);
      const lowland = h - SCHMITT_ELEVATION < ALPINE_MIN_ELEVATION;
      const mountain = h + SCHMITT_ELEVATION >= ALPINE_MIN_ELEVATION;
      let tMask = tSea + SCHMITT_TEMP >= TROPICAL_TEMP ? 1 << TempClass.Tropical : 0;
      if (tSea - SCHMITT_TEMP < TROPICAL_TEMP) {
        const lo = classOf(T - SCHMITT_TEMP, LANDSCAPE_TEMP_BOUNDS);
        const hi = classOf(T + SCHMITT_TEMP, LANDSCAPE_TEMP_BOUNDS);
        for (let t = lo; t <= hi; t++) tMask |= 1 << t;
        // A mountain frozen by its height alone counts as cold (summit snow, not ice sheet).
        if (lo === TempClass.Frozen && mountain && tSea + SCHMITT_TEMP >= FROZEN_TEMP) tMask |= 1 << TempClass.Cold;
        if (!lowland && tSea - SCHMITT_TEMP >= FROZEN_TEMP) tMask &= ~(1 << TempClass.Frozen);
      }
      const mLo = classOf(m - SCHMITT_MOISTURE, MOISTURE_BOUNDS);
      const mHi = classOf(m + SCHMITT_MOISTURE, MOISTURE_BOUNDS);
      const wet = flagOptions(
        m - SCHMITT_MOISTURE >= WETLAND_MOISTURE && e + SCHMITT_ELEVATION < WETLAND_MAX_ELEVATION,
        m + SCHMITT_MOISTURE >= WETLAND_MOISTURE && e - SCHMITT_ELEVATION < WETLAND_MAX_ELEVATION);
      const bare = flagOptions(c + SCHMITT_COVER < BARE_COVER, c - SCHMITT_COVER < BARE_COVER);
      const soilOk = world.soil[i] >= SOIL_EARTH_U8;
      const brushed = world.terraformed[i] !== 0;
      const p = present[i];
      let mask = 0;
      for (let t = 0; t <= TempClass.Tropical; t++) {
        if (!((tMask >> t) & 1)) continue;
        for (let mc = mLo; mc <= mHi; mc++) {
          const snowT = snowTemp(mc);
          // The lowland (belt 0) if the tile may count as low, and the
          // mountain belts its temperature band spans if it may count as high.
          const summit = brushed && mc !== MoistClass.Dry;
          const low = summit && h - SCHMITT_ELEVATION >= SUMMIT_SNOW_ELEVATION ? 4 : mountainBelt(T + SCHMITT_TEMP, snowT);
          const top = !mountain ? 0 : summit && h + SCHMITT_ELEVATION >= SUMMIT_SNOW_ELEVATION ? 4 : mountainBelt(T - SCHMITT_TEMP, snowT);
          for (let a = lowland ? 0 : low; a <= top; a = a === 0 ? low : a + 1) {
            for (let f = 0; f < 4; f++) {
              if (!((wet >> (f & 1)) & 1) || !((bare >> ((f >> 1) & 1)) & 1)) continue;
              const z = t | (mc << 3) | BELT_FLAGS[a] | ((f & 1) ? ZONE_WETLAND : 0) | ((f & 2) ? ZONE_BARE : 0);
              const climax = fillLadder(z, p, soilOk, lad, woodyFloraMask(world), cactiArrived(world));
              let m = ladderMask(climax, lad);
              // Bare ground is a stage only for land that may be bare: a
              // planted tile never takes it from its neighbours.
              if (!(f & 2)) {
                for (let k = 1; k <= climax; k++) {
                  if (lad[k] !== LADDER_NONE) { m &= ~(1 << lad[0]); break; }
                }
              }
              mask |= m;
            }
          }
        }
      }
      // Any planted, dry-footed tile can show its plants as a pioneer crust:
      // the glacier foreland that natural neighbours may need next to ice.
      if ((p & LAND_FLORA_MASK) && !(wet & 2 && !(wet & 1))) mask |= 1 << Landscape.Lichen;
      allowedStamp[i] = stamp;
      allowedCache[i] = mask;
      return mask;
    }

    /**
     * Mode filter on `field`: a tile at most one land neighbour shares joins
     * the value at least two neighbours share; a tile five neighbours outvote
     * joins them — wherever the tile allows that value. `oneStep` limits the
     * change to one succession level. Looks at the first `count` tiles of
     * `list`; returns the number of pending changes.
     */
    private static mode(world: WorldState, field: Uint8Array, oneStep: boolean, list: Int32Array, count: number): number {
      const { elevation } = world;
      let n = 0;
      for (let c = 0; c < count; c++) {
        const i = list[c];
        if (sameCnt[i] > 3) continue;
        const own = field[i];
        let best = -1;
        let bestN = 0;
        const base = i * 8;
        for (let k = 0; k < 8; k++) {
          const j = NB[base + k];
          if (j >= 0 && elevation[j] >= 0) tally[field[j]]++;
        }
        for (let k = 0; k < 8; k++) {
          const j = NB[base + k];
          if (j < 0 || elevation[j] < 0) continue;
          const l = field[j];
          const c = tally[l];
          tally[l] = 0;
          if (l !== own && c > bestN) { bestN = c; best = l; }
        }
        if (best < 0) continue;
        if (!((sameCnt[i] <= 1 && bestN >= 2) || bestN >= 5)) continue;
        if (oneStep && Math.abs(LANDSCAPE_LEVEL[best] - LANDSCAPE_LEVEL[own]) > 1) continue;
        // A landscape joins its neighbours only on its own way to its target: else stepping pulls
        // it straight back, and the next sweep of its row pushes it over again.
        if (oneStep && best !== target[i]) {
          const lo = LANDSCAPE_LEVEL[own];
          const lb = LANDSCAPE_LEVEL[best];
          if (lb === lo || (lb - lo) * (LANDSCAPE_LEVEL[target[i]] - lb) < 0) continue;
        }
        if (!(SuccessionSystem.allowed(world, i) & (1 << best))) continue;
        pendingTile[n] = i;
        pendingValue[n] = best;
        n++;
      }
      return n;
    }

    /**
     * Natural neighbours (spec §3.7, point 5): a tile bordering a landscape it
     * never meets in nature takes the stage between them — the lower-ranked
     * tile of the pair when `yieldOnly`, either tile otherwise. Returns the
     * number of pending changes.
     */
    private static bridges(world: WorldState, field: Uint8Array, yieldOnly: boolean, list: Int32Array, count: number): number {
      const { elevation } = world;
      let n = 0;
      unbridged = 0;
      for (let c = 0; c < count; c++) {
        const i = list[c];
        const own = field[i];
        if (!(LANDSCAPE_CLASH[own] & nbMask[i])) continue;
        unbridged++;
        if (yieldOnly) {
          let yields = false;
          for (let k = 0; k < 8 && !yields; k++) {
            const j = NB[i * 8 + k];
            if (j < 0 || elevation[j] < 0 || !(LANDSCAPE_CLASH[own] & (1 << field[j]))) continue;
            const ro = LANDSCAPE_RANK[own];
            const rj = LANDSCAPE_RANK[field[j]];
            yields = ro < rj || (ro === rj && i < j);
          }
          if (!yields) continue;
        }
        let foes = 0;
        const around = nbMask[i];
        for (let l = 0; l < LANDSCAPE_COUNT; l++) if (around & (1 << l)) foes |= LANDSCAPE_CLASH[l];
        const cand = SuccessionSystem.allowed(world, i) & ~foes;
        if (cand === 0) continue;
        const ownLevel = LANDSCAPE_LEVEL[own];
        let best = -1;
        let bestScore = Infinity;
        for (let l = 0; l < LANDSCAPE_COUNT; l++) {
          if (!(cand & (1 << l))) continue;
          const d = LANDSCAPE_LEVEL[l] - ownLevel;
          const score = Math.abs(d) * 2 + (d > 0 ? 1 : 0);
          if (score < bestScore) { bestScore = score; best = l; }
        }
        pendingTile[n] = i;
        pendingValue[n] = best;
        n++;
        unbridged--;
      }
      return n;
    }

    /**
     * Write pending changes into `field` (resetting the hold for landscapes)
     * and refresh the statistics; `flag` lists the tiles for the landscape
     * filters.
     */
    private static applyPending(world: WorldState, field: Uint8Array, n: number, isLandscape: boolean, flag = false): void {
      if (n === 0) return;
      for (let p = 0; p < n; p++) {
        const i = pendingTile[p];
        if (flag) touch(world.elevation, i);
        if (isLandscape) {
          SuccessionSystem.reset(world, i, pendingValue[p] as Landscape);
          SuccessionSystem.densityAt(world, i);
          touch(world.elevation, i);
        } else {
          field[i] = pendingValue[p];
        }
      }
      restat(world.elevation, field, n);
    }

    /* ---------------------------------------------------------- stepping -- */

    /**
     * Update the soil and move every land tile one step towards its target
     * where it has held long enough (when time advances), start new land at
     * its target, and refresh substrate and density (`full`: with the
     * targets).
     */
    private static settle(world: WorldState, run: boolean, full: boolean): void {
      const { elevation, landscape, landscapeNext, landscapeHold, soil, substrate } = world;
      const zones = world.landscapeZone;
      // Soil moves slowly: every SUCCESSION_TARGET_INTERVAL-th tick, by that
      // many ticks' worth (the hashed rounding keeps the fractions).
      const soilTick = run && world.ticks % SUCCESSION_TARGET_INTERVAL === 0;
      const timeF = Math.min(1, world.yearsPerTick / SOIL_YEARS) * SUCCESSION_TARGET_INTERVAL;
      const seed = world.seed ^ Math.imul(world.ticks, 0x2545f491);
      const weathers = soilTick && weathering(world);
      snapshot.set(landscape);
      for (let k = 0; k < landCount; k++) {
        const i = landList[k];
        if (soilTick) soil[i] = SuccessionSystem.soilAt(world, i, present[i], timeF, seed, weathers);
        if (full) {
          // Dry, low land that is not cold is sand, blown by the wind with or
          // without plants; polar deserts stay gravel. Soil the plants built
          // stays Erde.
          substrate[i] = SuccessionSystem.substrateFor(world, i, zones[i], moistSm[i]);
        }
        // Most tiles rest at their target: nothing to step.
        const cur = landscape[i];
        if (!(run && cur === target[i] && landscapeNext[i] === cur && landscapeHold[i] === 0)) {
          SuccessionSystem.advanceTile(world, i, run);
        }
        const changed = landscape[i] !== snapshot[i];
        if (run && changed) touch(elevation, i);
        // Density follows the plant cover with a band, so between target
        // ticks only a changed landscape needs it at once.
        if (full || changed) SuccessionSystem.densityAt(world, i);
      }
    }

    /** Substrate of land tile i in zone `z` at moisture `moist`; the brush's low coasts are sand (terraformSand). */
    static substrateFor(world: WorldState, i: number, z: number, moist: number): Substrate {
      if (terraformSand(world, i)) return Substrate.Sand;
      const s = world.soil[i];
      return (z & ZONE_WETLAND) ? Substrate.Mire
        : (z & ZONE_ROCKBELT) ? Substrate.Rock
          : s <= SOIL_REGOLITH_U8 && moist < SAND_MOISTURE && world.elevation[i] < SAND_MAX_ELEVATION &&
            zoneTemp(z) >= TempClass.Cool ? Substrate.Sand
            : s < SOIL_EARTH_U8 ? Substrate.Rock : Substrate.Soil;
    }

    /** One tile's step of `settle`. */
    private static advanceTile(world: WorldState, i: number, run: boolean): void {
      const { landscape, landscapeNext, landscapeHold } = world;
      const zones = world.landscapeZone;
      const tgt = target[i] as Landscape;
      if (landscapeNext[i] === LANDSCAPE_UNSET) {
        landscape[i] = tgt;
        landscapeNext[i] = tgt;
        landscapeHold[i] = 0;
        return;
      }
      if (!run) return;
      const cur = landscape[i] as Landscape;
      // Ice and summit snow arrive at once; so does a flood.
      if ((tgt === Landscape.Ice || tgt === Landscape.Snow) && cur !== tgt) {
        SuccessionSystem.reset(world, i, tgt);
        return;
      }
      if (cur === tgt && landscapeNext[i] === cur && landscapeHold[i] === 0) return;
      const z = zones[i];
      // The tile's ladder again, only for the few tiles on the move.
      fillLadder(z, present[i], world.soil[i] >= SOIL_EARTH_U8, lad, woodyFloraMask(world), cactiArrived(world));
      const wetTarget = tgt === Landscape.Marsh || tgt === Landscape.Swampforest || tgt === lad[0];
      if ((z & ZONE_WETLAND) && wetTarget && cur !== Landscape.Marsh && cur !== Landscape.Swampforest && LANDSCAPE_LEVEL[cur] >= 1) {
        const marsh = lad[2] === Landscape.Marsh && !(z & ZONE_BARE);
        SuccessionSystem.reset(world, i, marsh ? Landscape.Marsh : lad[0] as Landscape);
        return;
      }
      const next = stepToward(cur, tgt, lad);
      if (next === cur) {
        landscapeNext[i] = cur;
        landscapeHold[i] = 0;
        return;
      }
      if (landscapeNext[i] !== next) {
        landscapeNext[i] = next;
        landscapeHold[i] = 0;
      }
      const held = Math.min(255, landscapeHold[i] + 1);
      if (held >= SuccessionSystem.holdTicks(world, i, cur, next)) {
        landscape[i] = next;
        landscapeHold[i] = 0;
      } else {
        landscapeHold[i] = held;
      }
    }

    /**
     * Ticks a tile must hold before it moves from `cur` to `next`: at least
     * SUCCESSION_MIN_HOLD (+ its hash spread), or the stage's years in real
     * time (± its spread); halved at a front, doubled for a lone forest seed,
     * halved again when stepping back.
     */
    private static holdTicks(world: WorldState, i: number, cur: Landscape, next: Landscape): number {
      const base = LANDSCAPE_STAGE_YEARS[next] / world.yearsPerTick;
      let ticks = base <= SUCCESSION_MIN_HOLD
        ? SUCCESSION_MIN_HOLD + spreadTicks[i]
        : Math.max(SUCCESSION_MIN_HOLD, base * (1 + SUCCESSION_YEAR_SPREAD * (2 * spreadFrac[i] - 1)));
      const ln = LANDSCAPE_LEVEL[next];
      const forward = ln >= LANDSCAPE_LEVEL[cur];
      let front = 0;
      for (let k = 0; k < 8; k++) {
        const j = NB[i * 8 + k];
        if (j < 0 || world.elevation[j] < 0) continue;
        const l = snapshot[j];
        if (l === next || (forward && LANDSCAPE_LEVEL[l] > ln && l !== Landscape.Snow)) front++;
      }
      if (front >= SUCCESSION_FRONT) ticks *= 0.5;
      else if (front === 0 && ln === 4) ticks *= 2;
      if (!forward) ticks *= 0.5;
      return Math.max(1, Math.ceil(ticks));
    }

    /* ----------------------------------------------------------- density -- */

    /** Density step of a land tile from its plant cover, with a band in favour of the current step. */
    static densityAt(world: WorldState, i: number): void {
      const steps = LANDSCAPE_DENSITIES[world.landscape[i]];
      if (steps <= 1) { world.landscapeDensity[i] = 0; return; }
      // Forests know light and dense only, split at the upper bound.
      const bounds = steps === 2 ? FOREST_DENSITY_BOUNDS : DENSITY_BOUNDS;
      const v = world.vegetation[i];
      let d = Math.min(world.landscapeDensity[i], steps - 1);
      while (d < steps - 1 && v >= bounds[d] + DENSITY_BAND) d++;
      while (d > 0 && v < bounds[d - 1] - DENSITY_BAND) d--;
      world.landscapeDensity[i] = d;
    }

    /* ------------------------------------------------------------ probes -- */

    /** Smoothed temperature the landscape of a tile was read from (last call). */
    static smoothedTemperature(i: number): number {
      return tempSm[i];
    }

    /** Smoothed moisture the landscape of a tile was read from (last call). */
    static smoothedMoisture(i: number): number {
      return moistSm[i];
    }

    /** Climax target of a tile at the last call. */
    static targetOf(i: number): Landscape {
      return target[i] as Landscape;
    }
  }
}
