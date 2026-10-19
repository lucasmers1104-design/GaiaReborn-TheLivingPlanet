/* =============================================================================
 * SimEarth 2.0 — terraforming brush (simulation side)
 * -----------------------------------------------------------------------------
 * The "Höhe ändern" tool as a brush: held down, it raises or lowers the
 * ground continuously with a soft falloff. A stroke is many cheap dabs
 * (terraformDab, every frame while the pointer is down) and one settle at the
 * end (terraformSettle): rivers, biomes, snow on new peaks, groundwater in
 * deep hollows, and life moving out of drowned or lifted ground.
 *
 * Live, per dab, on the brushed tiles only (what the map needs to redraw):
 *   elevation    brush × ridge noise, then thermal erosion down to a talus
 *                slope (no one-tile spikes; raised land builds ridges)
 *   temperature  shifted by the lapse rate, so the sea-level climate stays
 *                and the ridge layer's tree/rock/snow lines follow at once
 *   stages       a land tile that crosses into another TERRAFORM_STAGES band
 *                (with a band of hysteresis at the edges) takes that stage's
 *                look, from the succession ladder of its climate and plants:
 *                  Küste        sand, bare
 *                  Tiefland,    soil, and the climax of its climate with the
 *                  Hügel        plants of the land around it: meadow, steppe,
 *                               savanna, forest, marsh … (bare Rohboden on a
 *                               planet without land plants)
 *                  Bergland     thin soil: pioneer crust (lichen and moss on
 *                               rock, semi-desert), rock between
 *                  Hochgebirge  bare rock (stony desert in dry, warm air)
 *                  Gipfel       summit snow (WorldState.terraformed: at any
 *                               latitude, SUMMIT_SNOW_ELEVATION), rock in
 *                               dry air
 *                ice, summit snow and the rock belt of the climate apply in
 *                every stage; lowering walks the stages back down
 *   water        only below sea level (water is elevation < 0): a dug basin
 *                floods from its lowest tile outwards, a lowered coast turns
 *                to sand first and goes under from the waterline inland
 * At settle (pointer up):
 *   life         land animals on drowned tiles flee to the nearest land, sea
 *                life on risen tiles to the nearest water (half survive the
 *                move); plants of the wrong realm die
 *   rivers       RiverSystem.rebuild (in two steps)
 *   landscapes   SuccessionSystem.refreshTiles over the touched tiles and
 *                their climate neighbourhood (the stage looks stand, the
 *                succession grows on from them);
 *                touched tiles whose target is snow or ice take it at once,
 *                snow below the snow line melts
 *   cities       not here: the app calls civ.sync, which drowns cities on
 *                water (reconcileCities)
 * Not live: rivers (old channels stay drawn until settle), moisture (but
 * risen land takes its neighbours').
 *
 * Node-safe: no DOM, no app; tests drive it directly (tests/terraform.test.js).
 * ========================================================================== */

namespace SE {
  export interface TerraformBrush {
    /** Radius in tiles. */
    readonly radius: number;
    /** +1 raises, -1 lowers. */
    readonly sign: 1 | -1;
  }

  export const TERRAFORM_RADIUS_MIN = 1.5;
  export const TERRAFORM_RADIUS_MAX = 8;

  export interface TerraformDab {
    /** Tiles whose elevation changed, for the map to redraw. */
    readonly tiles: number[];
    /** Sum of |Δ elevation| over the dab: what it costs (TERRAFORM_COST_PER_UNIT). */
    readonly moved: number;
    /** Tiles that rose out of the water in this dab. */
    readonly emerged: number;
    /** Tiles that sank below sea level (sea or lake) in this dab. */
    readonly flooded: number;
    /** Mean elevation under the brush after the dab, -1..1 (sea level 0). */
    readonly height: number;
  }

  /**
   * Energy per unit of elevation moved: a quarter of the old tool's rate (its
   * 5 × 5 click moved 1.74 for ALTITUDE_COST), so shaping land feels free enough to enjoy.
   */
  export const TERRAFORM_COST_PER_UNIT = ALTITUDE_COST / 1.74 / 4;

  /** Elevation per second at the brush centre: ~0.15 in the first 0.2 s, a stage or more. */
  const TERRAFORM_RATE = 0.75;
  /**
   * Steepest slope between neighbours erosion leaves, elevation per tile
   * (~540 m): about a tenth of the planet's highland slopes are steeper, so
   * brushing over a range softens it only a little.
   */
  const TERRAFORM_TALUS = 0.12;
  /** Share of the slope beyond the talus that slides per second (a radius-1.5 spike stays within ~0.2 of its foot). */
  const TERRAFORM_ERODE = 4;
  /** Raising is scaled by 1 - RIDGE + 2·RIDGE·noise: ridges and passes instead of a dome, and no tile lags far behind. */
  const TERRAFORM_RIDGE = 0.45;
  /** Share of a fleeing population that survives the move. */
  const TERRAFORM_REFUGE_KEEP = 0.5;
  /** Farthest a population flees, in tiles. */
  const TERRAFORM_REFUGE_REACH = Math.ceil(TERRAFORM_RADIUS_MAX) + 1;

  const SEA_FLORA = floraBit(Flora.MarineAlgae);

  /* Per-dab scratch over the brush square. */
  const SPAN = 2 * Math.ceil(TERRAFORM_RADIUS_MAX) + 1;
  const dabTile = new Int32Array(SPAN * SPAN);
  const dabW = new Float32Array(SPAN * SPAN);
  const dabBefore = new Float32Array(SPAN * SPAN);
  const dabDelta = new Float32Array(SPAN * SPAN);
  /** Slot of the square cell in the dab lists, -1 outside the disc. */
  const dabSlot = new Int32Array(SPAN * SPAN);

  /** Ridged value noise per tile for the world's seed, built on the first dab. */
  let ridge: Float32Array | null = null;
  let ridgeSeed = -1;

  function ridgeField(seed: number): Float32Array {
    if (ridge && ridgeSeed === seed) return ridge;
    const out = ridge ?? new Float32Array(TILE_COUNT);
    const octave = (x: number, y: number, cell: number, salt: number): number => {
      const cw = GRID_W / cell;
      const lat = (cx: number, cy: number): number => {
        let h = Math.imul(((cx % cw) + cy * 977) ^ seed ^ salt, 0x85ebca6b);
        h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
      };
      const fx = x / cell;
      const fy = y / cell;
      const cx = Math.floor(fx);
      const cy = Math.floor(fy);
      const tx = smoothstep(fx - cx);
      const ty = smoothstep(fy - cy);
      return lerp(lerp(lat(cx, cy), lat(cx + 1, cy), tx), lerp(lat(cx, cy + 1), lat(cx + 1, cy + 1), tx), ty);
    };
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const n = octave(x, y, 8, 0x3c6ef372) * 0.65 + octave(x, y, 4, 0x1b873593) * 0.35;
        out[idx(x, y)] = 1 - Math.abs(2 * n - 1);
      }
    }
    ridge = out;
    ridgeSeed = seed;
    return out;
  }

  /* Stage indices of TERRAFORM_STAGES on land. */
  const ST_COAST = 3;
  const ST_LOW = 4;
  const ST_HILL = 5;
  const ST_UPLAND = 6;
  /** A tile keeps its shown stage until it is this far past the band edge (no flicker at the edges). */
  const TERRAFORM_STAGE_BAND = 0.012;
  /** Share of the neighbours' mean plant cover new lowland, hills and upland start with. */
  const TERRAFORM_GREEN_SHARE = 0.6;
  const SOIL_EARTH_BYTE = Math.ceil(SOIL_EARTH * 255);
  /** Soil left on the upland: below Erde, so rock shows between its plants. */
  const SOIL_UPLAND_BYTE = Math.floor(SOIL_EARTH_BYTE * 0.6);
  const ladder = new Uint8Array(5);

  /** Stage each brushed tile shows, 255 before the brush first touches it; per world, not saved. */
  const shown = new WeakMap<WorldState, Uint8Array>();
  /** Whether the last shownStage call moved the tile into another stage. */
  let stageMoved = false;

  /** The stage tile i shows at elevation `e` (it was at `before`), with a band at the stage edges. */
  function shownStage(world: WorldState, i: number, e: number, before: number): number {
    let memo = shown.get(world);
    if (!memo) {
      memo = new Uint8Array(TILE_COUNT).fill(255);
      shown.set(world, memo);
    }
    const prev = memo[i] === 255 ? terraformStage(before) : memo[i];
    const raw = terraformStage(e);
    let s = raw;
    // The water line itself is exact: water is elevation < 0.
    if (Math.abs(raw - prev) === 1 && (prev < ST_COAST) === (e < 0) &&
      Math.abs(e - TERRAFORM_STAGES[Math.min(raw, prev)].to) < TERRAFORM_STAGE_BAND) s = prev;
    memo[i] = s;
    stageMoved = s !== prev;
    return s;
  }

  /** Is land tile i a low coast the brush made or reached: sand (SuccessionSystem.substrateFor). */
  export function terraformSand(world: WorldState, i: number): boolean {
    const e = world.elevation[i];
    return world.terraformed[i] !== 0 && e >= 0 && e < TERRAFORM_STAGES[ST_COAST].to;
  }

  /** Climate zone of brushed land tile i, read like the succession reads it (at the 3 x 3 land mean height). */
  function brushedZone(world: WorldState, i: number): number {
    const e = world.elevation;
    const x = i % GRID_W;
    const y = (i / GRID_W) | 0;
    let h = 0;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= GRID_H) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const v = e[idx(wrapX(x + dx), yy)];
        if (v >= 0) { h += v; n++; }
      }
    }
    h /= n;
    const temp = world.temperature[i] + altitudeCooling(e[i]) - altitudeCooling(h);
    return landscapeZone(temp, world.moisture[i], h, 1, world.landscapeZone[i], e[i], true);
  }

  /**
   * Land without plants takes those of the land around it, risen land its
   * moisture too (sea water reads 1): the brush moves the ground, and what
   * grows beside it grows on.
   */
  function inheritFromNeighbours(world: WorldState, i: number, moisture: boolean): void {
    const x = i % GRID_W;
    const y = (i / GRID_W) | 0;
    let flora = 0;
    let veg = 0;
    let moist = 0;
    let n = 0;
    let best = -1;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= GRID_H) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const j = idx(wrapX(x + dx), yy);
        if (j === i || world.elevation[j] < 0) continue;
        flora |= world.flora[j] & LAND_FLORA_MASK;
        veg += world.vegetation[j];
        moist += world.moisture[j];
        n++;
        if (best < 0 || world.vegetation[j] > world.vegetation[best]) best = j;
      }
    }
    if (n === 0) return;
    if (moisture) world.moisture[i] = moist / n;
    if ((world.flora[i] & LAND_FLORA_MASK) !== 0 || flora === 0) return;
    world.flora[i] |= flora;
    world.floraTop[i] = world.floraTop[best];
    world.vegetation[i] = Math.max(world.vegetation[i], (veg / n) * TERRAFORM_GREEN_SHARE);
  }

  /**
   * The landscape a brushed land tile shows in stage `s`, from the succession
   * ladder of its climate zone and plants, with the soil the stage leaves;
   * the settle reads the same ladder, so it keeps the look.
   */
  function stageLandscape(world: WorldState, i: number, s: number, z: number): Landscape {
    if (zoneTemp(z) === TempClass.Frozen) return Landscape.Ice;
    if (z & ZONE_SNOW) return Landscape.Snow;
    const woody = woodyFloraMask(world);
    const cacti = cactiArrived(world);
    if (s === ST_COAST) {
      fillLadder(z, world.flora[i], world.soil[i] >= SOIL_EARTH_BYTE, ladder, woody, cacti);
      return ladder[0] as Landscape;
    }
    if (s === ST_LOW || s === ST_HILL) {
      inheritFromNeighbours(world, i, false);
      world.soil[i] = Math.max(world.soil[i], SOIL_EARTH_BYTE);
      return ladderTarget(fillLadder(z, world.flora[i], true, ladder, woody, cacti), ladder);
    }
    if (s === ST_UPLAND) {
      inheritFromNeighbours(world, i, false);
      world.soil[i] = Math.min(world.soil[i], SOIL_UPLAND_BYTE);
      const climax = fillLadder(z, world.flora[i], false, ladder, woody, cacti);
      return (climax >= 1 && ladder[1] !== LADDER_NONE ? ladder[1] : ladder[0]) as Landscape;
    }
    // High mountains, and a summit without snow (dry air): bare.
    world.soil[i] = 0;
    fillLadder(z, world.flora[i], false, ladder, woody, cacti);
    return ladder[0] as Landscape;
  }

  /** Put the stage's look on land tile i: zone, landscape, density, substrate, habitat. */
  function applyStage(world: WorldState, i: number, s: number, z: number): void {
    world.landscapeZone[i] = z;
    const l = stageLandscape(world, i, s, z);
    SuccessionSystem.reset(world, i, l);
    SuccessionSystem.densityAt(world, i);
    world.substrate[i] = SuccessionSystem.substrateFor(world, i, z, world.moisture[i]);
    world.biome[i] = landscapeHabitat(l, z);
  }

  /** Snow and ice follow the height (and the latitude) inside a stage too. */
  function frostChanged(world: WorldState, i: number, z: number): boolean {
    const l = world.landscape[i];
    const frozen = zoneTemp(z) === TempClass.Frozen;
    const snow = !frozen && (z & ZONE_SNOW) !== 0;
    return (l === Landscape.Ice) !== frozen || (l === Landscape.Snow) !== snow;
  }

  /** The plain water state SuccessionSystem gives a tile the sea has taken. */
  function drown(world: WorldState, i: number): void {
    SuccessionSystem.reset(world, i, Landscape.Rock);
    world.landscapeNext[i] = LANDSCAPE_UNSET;
    world.substrate[i] = Substrate.Rock;
    world.soil[i] = 0;
    world.landscapeZone[i] = ZONE_NONE;
    world.biome[i] = BiomeSystem.waterHabitat(world.elevation[i], world.temperature[i]);
  }

  /**
   * Raise or lower around tile (x, y) for `dt` seconds of a held brush. Cheap:
   * only the elevation (and what the map needs to show it); nothing planet-wide.
   */
  export function terraformDab(world: WorldState, x: number, y: number, brush: TerraformBrush, dt: number): TerraformDab {
    const e = world.elevation;
    const r = clamp(brush.radius, TERRAFORM_RADIUS_MIN, TERRAFORM_RADIUS_MAX);
    const reach = Math.ceil(r);
    const noise = ridgeField(world.seed);
    const step = Math.max(0, dt) * TERRAFORM_RATE * brush.sign;

    // Brush: soft falloff, ridged where it raises.
    let n = 0;
    dabSlot.fill(-1);
    for (let dy = -reach; dy <= reach; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= GRID_H) continue;
      for (let dx = -reach; dx <= reach; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > r) continue;
        const i = idx(wrapX(x + dx), yy);
        const w = smoothstep(1 - d / r);
        const rough = brush.sign > 0 ? 1 - TERRAFORM_RIDGE + 2 * TERRAFORM_RIDGE * noise[i] : 1;
        dabSlot[(dy + reach) * SPAN + dx + reach] = n;
        dabTile[n] = i;
        dabW[n] = w;
        dabBefore[n] = e[i];
        e[i] = clamp(e[i] + step * w * rough, -1, 1);
        n++;
      }
    }

    // Thermal erosion inside the disc: slopes steeper than the talus slide, so
    // a small brush builds a cone, not a one-tile spike, and a pit a bowl.
    const k = Math.min(0.5, TERRAFORM_ERODE * Math.max(0, dt)) * 0.5;
    if (k > 0) {
      dabDelta.fill(0, 0, n);
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          const a = dabSlot[(dy + reach) * SPAN + dx + reach];
          if (a < 0) continue;
          // Right and down neighbours: every pair once.
          for (let q = 0; q < 2; q++) {
            const bx = dx + (q === 0 ? 1 : 0) + reach;
            const by = dy + (q === 1 ? 1 : 0) + reach;
            if (bx >= SPAN || by >= SPAN) continue;
            const b = dabSlot[by * SPAN + bx];
            if (b < 0) continue;
            const diff = e[dabTile[a]] - e[dabTile[b]];
            const excess = Math.abs(diff) - TERRAFORM_TALUS;
            if (excess <= 0) continue;
            const m = Math.sign(diff) * excess * k * Math.max(dabW[a], dabW[b]);
            dabDelta[a] -= m;
            dabDelta[b] += m;
          }
        }
      }
      // Erosion never drowns land: the coast is the brush's business.
      for (let s = 0; s < n; s++) {
        const t = dabTile[s];
        const v = e[t] + dabDelta[s];
        e[t] = e[t] >= 0 && v < 0 ? 0 : v;
      }
    }

    const tiles: number[] = [];
    let moved = 0;
    let emerged = 0;
    let flooded = 0;
    let sum = 0;
    for (let s = 0; s < n; s++) {
      const i = dabTile[s];
      const before = dabBefore[s];
      const after = e[i];
      sum += after;
      if (after === before) continue;
      moved += Math.abs(after - before);
      tiles.push(i);
      world.terraformed[i] = 1;
      world.temperature[i] += altitudeCooling(before) - altitudeCooling(after);
      const stage = shownStage(world, i, after, before);
      if (after < 0) {
        if (before >= 0) {
          flooded++;
          drown(world, i);
        } else {
          world.biome[i] = BiomeSystem.waterHabitat(after, world.temperature[i]);
        }
        continue;
      }
      const risen = before < 0;
      if (risen) {
        emerged++;
        inheritFromNeighbours(world, i, true);
      }
      const z = brushedZone(world, i);
      if (risen || stageMoved || frostChanged(world, i, z)) applyStage(world, i, stage, z);
      // A natural coast the brush touches turns to sand at once, as the settle will read it.
      else if (terraformSand(world, i)) world.substrate[i] = Substrate.Sand;
    }
    if (tiles.length > 0) world.terrainDirty = true;
    return { tiles, moved, emerged, flooded, height: n > 0 ? sum / n : 0 };
  }

  /** The nearest tile within TERRAFORM_REFUGE_REACH that is water (`water`) or land, nearest ring first; -1 if none. */
  function refuge(world: WorldState, i: number, water: boolean): number {
    const x = i % GRID_W;
    const y = (i / GRID_W) | 0;
    let best = -1;
    let bestD = Infinity;
    for (let ring = 1; ring <= TERRAFORM_REFUGE_REACH && best < 0; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= GRID_H) continue;
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const j = idx(wrapX(x + dx), yy);
          if (world.isWater(j) !== water) continue;
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = j; }
        }
      }
    }
    return best;
  }

  /** Life on the wrong side of the water line flees to the nearest refuge; plants of the wrong realm die. */
  function adaptLife(world: WorldState, i: number): void {
    const water = world.isWater(i);
    const wrongFlora = water ? world.flora[i] & ~SEA_FLORA : world.flora[i] & SEA_FLORA;
    if (wrongFlora !== 0) {
      world.flora[i] &= ~wrongFlora;
      world.vegetation[i] = 0;
    }
    const base = i * LIFE_COUNT;
    let to = -2;
    for (let c = 1; c < LIFE_COUNT; c++) {
      const d = world.lifeDensity[base + c];
      if (d <= 0 || (LIFE[c as Life].realm === 'sea') === water) continue;
      if (to === -2) to = refuge(world, i, !water);
      if (to >= 0) {
        const t = to * LIFE_COUNT + c;
        if (world.lifeDensity[t] <= 0) world.lifeStage[t] = world.lifeStage[base + c];
        world.lifeDensity[t] = Math.min(1, world.lifeDensity[t] + d * TERRAFORM_REFUGE_KEEP);
      }
      world.lifeDensity[base + c] = 0;
      world.lifeStage[base + c] = 0;
    }
  }

  /** A touched land tile takes at once the snow or ice its smoothed climate gives it, or loses it. */
  function snapLandscape(world: WorldState, i: number): void {
    const cur = world.landscape[i] as Landscape;
    const tgt = SuccessionSystem.targetOf(i);
    if (cur === tgt) return;
    if (tgt === Landscape.Snow || tgt === Landscape.Ice) {
      SuccessionSystem.reset(world, i, tgt);
    } else if (cur === Landscape.Snow || cur === Landscape.Ice) {
      SuccessionSystem.clear(world, i);
    } else {
      return;
    }
    world.biome[i] = landscapeHabitat(world.landscape[i] as Landscape, world.landscapeZone[i]);
  }

  const nearMark = new Uint8Array(TILE_COUNT);

  /** The tiles within `r` (square) of any of `list`, each once. */
  function around(list: readonly number[], r: number): number[] {
    const out: number[] = [];
    for (const i of list) {
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      for (let yy = Math.max(0, y - r); yy <= Math.min(GRID_H - 1, y + r); yy++) {
        for (let dx = -r; dx <= r; dx++) {
          const j = yy * GRID_W + wrapX(x + dx);
          if (nearMark[j]) continue;
          nearMark[j] = 1;
          out.push(j);
        }
      }
    }
    for (const j of out) nearMark[j] = 0;
    return out;
  }

  /**
   * After a stroke, in steps the caller may run one per frame (none stalls a
   * frame alone): life leaves the wrong side of the water line; the river
   * network is rebuilt (planet-wide, in two halves: the flood, then the
   * routing); the landscapes of the touched tiles and the climate
   * neighbourhood around them (LANDSCAPE_SMOOTH_RADIUS) are refreshed
   * locally, snow and ice snapping. Run them in order, all of them.
   */
  export function terraformSettleSteps(world: WorldState, tiles: Iterable<number>): (() => void)[] {
    const list = [...new Set(tiles)];
    return [
      () => { for (const i of list) adaptLife(world, i); },
      ...RiverSystem.rebuildSteps(world),
      () => {
        const area = around(list, LANDSCAPE_SMOOTH_RADIUS);
        SuccessionSystem.refreshTiles(world, area);
        for (const i of area) {
          const e = world.elevation[i];
          world.biome[i] = e < 0 ? BiomeSystem.waterHabitat(e, world.temperature[i])
            : landscapeHabitat(world.landscape[i] as Landscape, world.landscapeZone[i]);
        }
        for (const i of list) if (!world.isWater(i)) snapLandscape(world, i);
      },
    ];
  }

  /** After a stroke: all of terraformSettleSteps at once. */
  export function terraformSettle(world: WorldState, tiles: Iterable<number>): void {
    for (const step of terraformSettleSteps(world, tiles)) step();
  }

  /**
   * The height bands the brush passes through, low to high: what the cursor
   * names, what the sound marks when a stroke crosses into the next, and what
   * the map should make visibly different. Index = stage, `to` = upper bound
   * of the band in elevation (sea level 0, top 1).
   */
  export const TERRAFORM_STAGES: readonly { readonly name: string; readonly to: number }[] = [
    { name: 'Tiefsee', to: -0.4 },
    { name: 'Meer', to: -0.12 },
    { name: 'Flachwasser', to: 0 },
    { name: 'Küste', to: 0.05 },
    { name: 'Tiefland', to: 0.2 },
    { name: 'Hügel', to: 0.45 },
    { name: 'Bergland', to: 0.7 },
    { name: 'Hochgebirge', to: SUMMIT_SNOW_ELEVATION },
    { name: 'Gipfel', to: Infinity },
  ];

  /** Stage index (TERRAFORM_STAGES) of an elevation. */
  export function terraformStage(elevation: number): number {
    let s = 0;
    while (elevation >= TERRAFORM_STAGES[s].to) s++;
    return s;
  }

  /** The optional save field `terraformed`: the brushed tiles, or undefined on a planet never brushed. */
  export function terraformedToJSON(world: WorldState): number[] | undefined {
    const out: number[] = [];
    for (let i = 0; i < TILE_COUNT; i++) if (world.terraformed[i] !== 0) out.push(i);
    return out.length > 0 ? out : undefined;
  }

  /** Restore the brushed tiles; a save without the field (or a damaged one) has none. */
  export function restoreTerraformed(world: WorldState, raw: unknown): void {
    world.terraformed.fill(0);
    if (!Array.isArray(raw)) return;
    for (const i of raw) if (Number.isInteger(i) && i >= 0 && i < TILE_COUNT) world.terraformed[i] = 1;
  }
}
