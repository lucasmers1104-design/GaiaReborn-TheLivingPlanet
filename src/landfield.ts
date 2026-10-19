/* =============================================================================
 * SimEarth 2.0 — per-tile inputs of the pixel terrain
 * -----------------------------------------------------------------------------
 * Everything the compositor needs from the world, read once per refresh into
 * flat arrays: the ground key of each tile, its sea class and lagoon, relief
 * and macro shading as ramp steps, the river sprite, the distance to a lower
 * ground (forest edges), the scene, density and plant groups that place
 * objects, and the reefs, beaches and palms (reefs.ts). Values are quantised here, so a tile's 32-bit signature fixes
 * exactly what is drawn — a chunk whose signatures did not change is
 * reused untouched, and two chunks always agree where they meet.
 * ========================================================================== */

namespace SE {
  /** Stable 0..1 hash of integer coordinates, the same as `hash` in tools/terrain/kit.js. */
  export function landHash(x: number, y: number, seed: number): number {
    let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca77);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae3d);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  /** Periodic value noise 0..1 over a size × size wrap with `cells` lattice cells across (world-fixed textures of the renderer). */
  export function landOctave(x: number, y: number, size: number, cells: number, seed: number): number {
    const fx = (x / size) * cells;
    const fy = (y / size) * cells;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = (fx - x0) * (fx - x0) * (3 - 2 * (fx - x0));
    const ty = (fy - y0) * (fy - y0) * (3 - 2 * (fy - y0));
    const at = (a: number, b: number): number => landHash(a % cells, b % cells, seed);
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
    return top + (bottom - top) * ty;
  }

  /** Ordered-dither thresholds, Bayer 4×4 in world pixels, 0..1. */
  export const BAYER4 = Float32Array.from([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], (v) => (v + 0.5) / 16);

  /**
   * Relief in ramp steps per unit of cross-tile slope, light from the upper
   * left. Over a planet's land the slope has a median near 0.09 and a 90th
   * percentile near 0.24 (see render.ts); with the dead zone the median tile
   * stays almost clean and a real flank darkens or lightens by a full step.
   * In the mountains (MOUNTAIN_START .. + MOUNTAIN_SPAN of elevation) the
   * gain doubles, the dead zone closes and the limit grows to 3 steps.
   */
  const RELIEF_GAIN = 6;
  const RELIEF_DEAD = 0.45;
  const RELIEF_LIMIT = 2;
  const MOUNTAIN_START = 0.15;
  const MOUNTAIN_SPAN = 0.25;
  /** Amplitude of the crags inside a mountain tile, ramp steps (landcompose.ts), from this elevation on. */
  const CRAG_STEPS = 0.6;
  const CRAG_START = 0.35;
  /** Volcanoes: a local maximum of a volcanic belt within this many tiles, above this elevation. */
  const VOLCANO_REACH = 2;
  const VOLCANO_MIN_ELEVATION = 0.06;
  /**
   * A coastal range (UpliftKind.Arc) carries cones only over a hot mantle:
   * belts are typed Arc by their distance from the shore, volcanic or not.
   * Measured: the 'today' mantle lies at 0.1–0.3 away from its volcanic
   * belts (which start near 1 and spread over time), random planets' arcs
   * mostly at 0.35–0.6.
   */
  const ARC_VOLCANO_MAGMA = 0.3;
  /**
   * Off the belts, land this much hotter than the planet's mean mantle is a
   * hotspot volcano (Hawaii, Iceland, Galápagos): 'today' types no hotspot
   * belts. Measured: 'today' mean 0.22, hotspots 0.7–0.95; random planets
   * mean 0.49 with a few dozen land tiles that hot; the young Earth none.
   */
  const HOTSPOT_MAGMA_EXCESS = 0.45;
  /** Soil (0..255) below which rock counts as unweathered, as succession.ts counts it. */
  const FRESH_ROCK_SOIL = Math.ceil(SOIL_EARTH * 255);
  /** Kelp stands only on the shallow shelf by the shore, never over the open blue of the coast biome. */
  const KELP_DEPTH = -0.1;
  /**
   * Sea ice below this water temperature (BiomeSystem.waterHabitat), the
   * threshold wobbled by noise by up to this many °C either way: ocean temperature follows
   * the parallels, so the plain threshold drew the pack edge as a ruler line.
   * Near the edge the water cools 4–7 °C per tile row, so the edge swings by
   * a tile or two.
   */
  const ICE_TEMP = -5;
  const ICE_WOBBLE = 10;
  function packIce(temp: number, i: number): boolean {
    if (temp < ICE_TEMP - ICE_WOBBLE) return true;
    if (temp >= ICE_TEMP + ICE_WOBBLE) return false;
    const x = i % GRID_W;
    const y = (i / GRID_W) | 0;
    const n = landOctave(x, y, GRID_W, 64, 977) * 0.6 + landOctave(x, y, GRID_W, 128, 978) * 0.4;
    return temp + (n - 0.5) * 2 * ICE_WOBBLE < ICE_TEMP;
  }
  /**
   * Highlands lighter, lowlands darker, in steps per unit of elevation around
   * ALTITUDE_MID, limited to [ALTITUDE_LOW, ALTITUDE_HIGH] steps: a brushed
   * plateau reads higher than the plain it rose from, also inside one landscape.
   */
  const ALTITUDE_GAIN = 2.5;
  const ALTITUDE_MID = 0.2;
  const ALTITUDE_LOW = -0.5;
  const ALTITUDE_HIGH = 0.6;
  /**
   * Ridges and knolls lighter, hollows darker: steps per unit of curvature
   * (elevation above the mean of the four neighbours) beyond a dead zone.
   * Measured on land: the middle half lies within ±0.013, the outer tenth beyond ±0.04–0.06.
   */
  const CURVE_GAIN = 8;
  const CURVE_DEAD = 0.015;
  const CURVE_LIMIT = 0.75;
  /** Macro variation: value-noise lattice cells around the planet (8 tiles each). */
  const MACRO_CELLS = 32;
  /** |noise| where a patch starts to shift, and the band over which it reaches one step. */
  const MACRO_START = 0.22;
  const MACRO_BAND = 0.2;
  /** Shading is quantised to this fraction of a step. */
  const QUANT = 8;
  /** The water ramp position of the shallowest water; the last step of the ramp is foam. */
  export const LAND_SHALLOW = TERRAIN_MANIFEST.ramps.water.length - 2;
  /** Tiles beyond a chunk whose inputs reach into it: dual grid 1, objects 1, edge distance 2. */
  const SIGNATURE_REACH = 3;

  /** Sparse light and dark patches, a few tiles across, so textures never show their period. */
  const MACRO: Float32Array = (() => {
    const out = new Float32Array(TILE_COUNT);
    const cell = GRID_W / MACRO_CELLS;
    const rows = Math.ceil(GRID_H / cell) + 1;
    const smooth = (t: number): number => t * t * (3 - 2 * t);
    for (let y = 0; y < GRID_H; y++) {
      const fy = y / cell;
      const y0 = Math.floor(fy);
      const ty = smooth(fy - y0);
      for (let x = 0; x < GRID_W; x++) {
        const fx = x / cell;
        const x0 = Math.floor(fx);
        const tx = smooth(fx - x0);
        const x1 = (x0 + 1) % MACRO_CELLS;
        const at = (a: number, b: number): number => landHash(a, Math.min(b, rows), 4242);
        const top = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * tx;
        const bottom = at(x0, y0 + 1) + (at(x1, y0 + 1) - at(x0, y0 + 1)) * tx;
        const n = (top + (bottom - top) * ty) * 2 - 1;
        const m = Math.abs(n);
        out[y * GRID_W + x] = Math.sign(n) * clamp((m - MACRO_START) / MACRO_BAND, 0, 1);
      }
    }
    return out;
  })();

  /** 0 on lowland .. 1 in high mountains: how much the relief shading and the crags are strengthened. */
  function mountainness(e: number): number {
    return clamp((e - MOUNTAIN_START) / MOUNTAIN_SPAN, 0, 1);
  }

  type TileArray = Uint8Array | Uint16Array | Uint32Array | Int32Array | Float32Array;
  /** Above this many changed tiles a refresh reads everything again: cheaper than the bookkeeping. */
  const INCREMENTAL_MAX = TILE_COUNT / 10;

  /**
   * The bits of a tile array as 32-bit words: one loop type for every array
   * (indexing five array types in one loop is several times slower in V8).
   */
  function words(a: TileArray): Uint32Array {
    return new Uint32Array(a.buffer, a.byteOffset, a.byteLength >> 2);
  }

  /** Copy every value of `src` that differs from `seen` into it, marking the tile in `out`; the number of tiles. */
  function diffTiles(src: TileArray, seen: TileArray, out: Uint8Array): number {
    const a = words(src);
    const b = words(seen);
    const per = 4 / src.BYTES_PER_ELEMENT;
    let n = 0;
    for (let w = 0; w < a.length; w++) {
      if (a[w] === b[w]) continue;
      for (let i = w * per; i < (w + 1) * per; i++) {
        if (src[i] !== seen[i]) { seen[i] = src[i]; out[i] = 1; n++; }
      }
    }
    return n;
  }

  function sameTiles(a: TileArray, b: TileArray): boolean {
    const x = words(a);
    const y = words(b);
    for (let w = 0; w < x.length; w++) if (x[w] !== y[w]) return false;
    return true;
  }

  export class TerrainField {
    /** 0 water, else landKey(rank, density). */
    readonly key = new Uint8Array(TILE_COUNT);
    /** Sea class: 0 open ocean, 1 coastal sea; land counts as coastal sea, so no shore draws a band of its own. */
    readonly sea = new Uint8Array(TILE_COUNT);
    /** Turquoise of a lagoon, 0..3 (reefs.ts); land takes its neighbours' highest, so a lagoon reaches the beach. */
    readonly lagoon = new Uint8Array(TILE_COUNT);
    /** 1 on tiles below sea level, pack ice included: where the ranges' lift leaves the water flat. */
    readonly seaTile = new Uint8Array(TILE_COUNT);
    /** CoralKind of a reef tile and its coral and sand patches (reefs.ts). */
    readonly reef = new Uint8Array(TILE_COUNT);
    readonly corals = new Uint8Array(TILE_COUNT);
    readonly sands = new Uint8Array(TILE_COUNT);
    /** BeachKind of a land tile, drawn along its shore (landshore.ts). */
    readonly beach = new Uint8Array(TILE_COUNT);
    /** Ramp shift of the ground from relief and macro variation. */
    readonly shade = new Float32Array(TILE_COUNT);
    /** Amplitude of the crags drawn inside the tile, ramp steps (0 on flat land). */
    readonly rugged = new Float32Array(TILE_COUNT);
    /** Volcanic cone raised in the relief (landridges.ts): 0 none, 1 dormant, 2 fresh (basalt scar or a young vent). */
    readonly volcano = new Uint8Array(TILE_COUNT);
    /** The mountain ranges as drawn ridge lines. */
    readonly ridges = new RidgePaths();
    /** 1 on a river tile (no objects there), else 0. */
    readonly river = new Uint8Array(TILE_COUNT);
    /** The rivers as drawn lines. */
    readonly paths = new RiverPaths();
    /** 1 where freshwater algae film the open water of the ground (mire pools). */
    readonly algae = new Uint8Array(TILE_COUNT);
    /** Tiles to the nearest lower-ranked ground, 0..2. */
    readonly edge = new Uint8Array(TILE_COUNT);
    /** Landscape (or LAND_SCENE_SEA) whose objects the tile shows, or LAND_SCENE_NONE. */
    readonly scene = new Uint8Array(TILE_COUNT);
    readonly density = new Uint8Array(TILE_COUNT);
    /** Plant groups that can show an object in the tile's scene. */
    readonly groups = new Uint16Array(TILE_COUNT);
    /** The group that shapes the tile. */
    readonly top = new Uint8Array(TILE_COUNT);
    /** 1 where the flowering plants show as a cactus (cacti.ts). */
    readonly cactus = new Uint8Array(TILE_COUNT);
    /** 1 where the flowering plants show as a savanna tree (savannatrees.ts). */
    readonly savannaTree = new Uint8Array(TILE_COUNT);
    /** Coconut palms on a beach tile, 0..2 (reefs.ts). */
    readonly palm = new Uint8Array(TILE_COUNT);
    private readonly reach = new SavannaReach();
    readonly sig = new Uint32Array(TILE_COUNT);
    private readonly rank = new Uint8Array(TILE_COUNT);
    private readonly low = new Uint8Array(TILE_COUNT);
    private readonly wide = new Uint8Array(TILE_COUNT);
    private ridgesAt = -Infinity;
    /*
     * Incremental refresh. read() takes per tile, all compared with their
     * copies from the last refresh (inputs()):
     *   world: elevation (also through the four neighbours' relief; on water
     *   only its depth classes), landscape, landscapeDensity, substrate, flora,
     *   floraTop, riverLevel, tech, hazards.scar (scarShowsGround reads it and
     *   the landscape); on water only biome, temperature (pack ice) and
     *   vegetation (kelp density), on bare rock only upliftKind, soil and
     *   landscapeZone, both as `partIn`;
     *   derived: reefMap's coral, lagoon, beach, corals, sands and
     *   SavannaReach's toDry, toForest.
     * Planet-wide, any change reads everything again (`planet`): seed, plate
     * drift (driftShifts), mapFloraMask, cactiArrived, savannaTreesArrived,
     * palmsArrived; also another world, ticks running backwards, forget()
     * after a load and refreshBox().
     * Edges follow a changed rank 2 tiles out; cones are found planet-wide
     * every time (they read the mean mantle heat); the rivers are rebuilt when
     * land/sea, riverLevel, riverDown, flora or riverFlow on a river changed,
     * the ridges when elevation, uplift, landscape, landscapeZone,
     * temperature, riverLevel, flora, terraformed or a cone changed
     * (ridgeInputs() plus read()'s inputs).
     */
    private world: WorldState | null = null;
    private planet = '';
    private ticks = 0;
    private seen: TileArray[] = [];
    /** read()'s view of biome, temperature and vegetation on water, and of upliftKind, soil and landscapeZone on bare rock. */
    private readonly partIn = new Uint16Array(TILE_COUNT);
    private readonly reread = new Uint8Array(TILE_COUNT);
    private readonly resign = new Uint8Array(TILE_COUNT);
    /** volcano, paths.sig and ridges.sig as the signatures last took them. */
    private readonly signed = [new Uint8Array(TILE_COUNT), new Uint16Array(TILE_COUNT), new Uint32Array(TILE_COUNT)] as const;
    private readonly downSeen = new Int32Array(TILE_COUNT);
    private readonly flowSeen = new Float32Array(TILE_COUNT);
    private ridgeSeen: TileArray[] = [];
    /** Tiles read again by the last refresh, -1 after a full one (for the performance display). */
    lastRead = -1;

    refresh(world: WorldState): void {
      const planet = `${world.seed}|${world.driftShifts}|${mapFloraMask(world)}|${+cactiArrived(world)}|${+savannaTreesArrived(world)}|${+palmsArrived(world)}`;
      const fresh = world !== this.world || planet !== this.planet || world.ticks < this.ticks;
      this.world = world;
      this.planet = planet;
      this.ticks = world.ticks;
      if (savannaTreesArrived(world)) this.reach.update(world);
      const inputs = this.inputs(world);
      if (fresh || !this.incremental(world, inputs)) this.full(world, inputs);
    }

    /** Read everything again on the next refresh (a loaded planet). */
    forget(): void {
      this.world = null;
    }

    private full(world: WorldState, inputs: TileArray[]): void {
      this.read(world, 0, 0, GRID_W, GRID_H);
      this.edges(0, 0, GRID_W, GRID_H);
      this.volcanoes(world);
      this.paths.build(world);
      this.ridges.build(world, this.volcano);
      this.sign(0, 0, GRID_W, GRID_H);
      if (this.seen.length !== inputs.length) this.seen = inputs.map((a) => a.slice());
      else inputs.forEach((a, k) => this.seen[k].set(a));
      this.riversRead(world);
      this.ridgesRead(world);
      this.signed[0].set(this.volcano);
      this.signed[1].set(this.paths.sig);
      this.signed[2].set(this.ridges.sig);
      this.reread.fill(0);
      this.lastRead = -1;
    }

    /** What read() takes from the world per tile; elevation first. */
    private inputs(world: WorldState): TileArray[] {
      const { elevation: e, temperature, vegetation: v, biome, landscape, upliftKind: kind, soil, landscapeZone: zone } = world;
      const part = this.partIn;
      for (let i = 0; i < TILE_COUNT; i++) {
        if (e[i] < 0) {
          part[i] = biome[i] | (packIce(temperature[i], i) ? 256 : 0) | (v[i] < 0.3 ? 0 : v[i] < 0.6 ? 512 : 1024);
        } else if (landscape[i] === Landscape.Rock) {
          part[i] = (kind[i] === UpliftKind.Hotspot || kind[i] === UpliftKind.IslandArc) && soil[i] < FRESH_ROCK_SOIL ? 1
            : zone[i] !== ZONE_NONE && (zone[i] & ZONE_ROCKBELT) !== 0 ? 2 : 0;
        } else {
          part[i] = 0;
        }
      }
      const reefs = reefMap(world);
      return [e, world.landscape, world.landscapeDensity, world.substrate, world.flora, world.floraTop, world.riverLevel,
        world.tech, world.hazards.scar, part, reefs.coral, reefs.lagoon, reefs.beach, reefs.corals, reefs.sands,
        this.reach.toDry, this.reach.toForest];
    }

    /**
     * Read again only the tiles whose inputs changed since the last refresh,
     * and what reaches them: the same field a full refresh makes. False,
     * having done nothing but note the inputs, when too much changed.
     */
    private incremental(world: WorldState, inputs: TileArray[]): boolean {
      const { reread, resign } = this;
      const e = world.elevation;
      const seenE = this.seen[0];
      // Elevation reaches the four neighbours' relief.
      let moved = false;
      let shore = false;
      for (let i = 0; i < TILE_COUNT; i++) {
        if (e[i] === seenE[i]) continue;
        moved = true;
        const was = seenE[i];
        seenE[i] = e[i];
        if ((e[i] < 0) !== (was < 0)) shore = true;
        // Water that stays water of the same depth class: nothing read() shows.
        else if (was < 0 && (e[i] > KELP_DEPTH) === (was > KELP_DEPTH) && (e[i] > COAST_DEPTH) === (was > COAST_DEPTH)) continue;
        const x = i % GRID_W;
        const y = (i / GRID_W) | 0;
        reread[i] = reread[y * GRID_W + wrapX(x - 1)] = reread[y * GRID_W + wrapX(x + 1)] = 1;
        if (y > 0) reread[i - GRID_W] = 1;
        if (y < GRID_H - 1) reread[i + GRID_W] = 1;
      }
      const changed = new Set<TileArray>();
      for (let k = 1; k < inputs.length; k++) if (diffTiles(inputs[k], this.seen[k], reread) > 0) changed.add(inputs[k]);
      const tiles: number[] = [];
      for (let i = 0; i < TILE_COUNT; i++) if (reread[i] !== 0) tiles.push(i);
      if (tiles.length > INCREMENTAL_MAX) return false;
      reread.fill(0);

      const tile = this.reader(world);
      const rank = this.rank;
      for (const i of tiles) {
        const was = rank[i];
        tile(i);
        resign[i] = 1;
        if (rank[i] === was) continue;
        // Edges see a rank 2 tiles away.
        const x = i % GRID_W;
        const y = (i / GRID_W) | 0;
        const y0 = Math.max(0, y - 2);
        const y1 = Math.min(GRID_H, y + 3);
        this.edges(x - 2, y0, x + 3, y1);
        for (let v = y0; v < y1; v++) for (let u = x - 2; u < x + 3; u++) resign[v * GRID_W + wrapX(u)] = 1;
      }

      const signed = this.signed;
      this.volcanoes(world);
      const cones = diffTiles(this.volcano, signed[0], resign) > 0;
      const flora = changed.has(world.flora);
      const level = changed.has(world.riverLevel);
      if (shore || level || flora || this.riversMoved(world)) {
        this.paths.build(world);
        diffTiles(this.paths.sig, signed[1], resign);
        this.riversRead(world);
      }
      const more = this.ridgeInputs(world);
      if (moved || level || flora || cones || changed.has(world.landscape) || more.some((a, k) => !sameTiles(a, this.ridgeSeen[k]))) {
        this.ridges.build(world, this.volcano);
        diffTiles(this.ridges.sig, signed[2], resign);
        this.ridgesRead(world);
      }
      for (let i = 0; i < TILE_COUNT; i++) {
        if (resign[i] === 0) continue;
        resign[i] = 0;
        this.signAt(i);
      }
      this.lastRead = tiles.length;
      return true;
    }

    /** riverDown, or riverFlow on a river tile, differ from the last rivers built. */
    private riversMoved(world: WorldState): boolean {
      const { elevation: e, riverLevel: level, riverFlow: flow } = world;
      if (!sameTiles(world.riverDown, this.downSeen)) return true;
      for (let i = 0; i < TILE_COUNT; i++) if (e[i] >= 0 && level[i] > 0 && flow[i] !== this.flowSeen[i]) return true;
      return false;
    }

    private riversRead(world: WorldState): void {
      this.downSeen.set(world.riverDown);
      this.flowSeen.set(world.riverFlow);
    }

    /** What the ridges read beyond read()'s inputs. */
    private ridgeInputs(world: WorldState): TileArray[] {
      return [world.temperature, world.uplift, world.terraformed, world.landscapeZone];
    }

    private ridgesRead(world: WorldState): void {
      const inputs = this.ridgeInputs(world);
      if (this.ridgeSeen.length === 0) this.ridgeSeen = inputs.map((a) => a.slice());
      else inputs.forEach((a, k) => this.ridgeSeen[k].set(a));
    }

    /**
     * Re-read only tiles [x0, x1) × [y0, y1) (x may run past the wrap) after
     * their elevation changed, as a terraforming brush does every frame: a
     * full refresh costs 10–20 ms. Rivers, the savanna's reach and the reefs,
     * lagoons and beaches (reefs.ts, read up to several tiles from the box)
     * keep their last state until the stroke's end; mountain ridges and cones
     * are rebuilt, they follow the height.
     * True when the ridges were rebuilt this time.
     */
    refreshBox(world: WorldState, x0: number, y0: number, x1: number, y1: number): boolean {
      // The next refresh reads everything again: this one used old rivers, reefs and savanna reach.
      this.world = null;
      const ya = Math.max(0, y0 - 1);
      const yb = Math.min(GRID_H, y1 + 1);
      this.read(world, x0 - 1, ya, x1 + 1, yb);
      this.edges(x0 - 3, Math.max(0, ya - 2), x1 + 3, Math.min(GRID_H, yb + 2));
      // The ranges are found planet-wide (1–11 ms): at most ten times a second.
      const now = performance.now();
      const ridges = now - this.ridgesAt > 100;
      if (ridges) {
        this.ridgesAt = now;
        this.volcanoes(world);
        this.ridges.build(world, this.volcano);
      }
      // Ridge lines and cones can move a little past the box.
      this.sign(x0 - 8, Math.max(0, y0 - 8), x1 + 8, Math.min(GRID_H, y1 + 8));
      return ridges;
    }

    private read(world: WorldState, x0: number, y0: number, x1: number, y1: number): void {
      const tile = this.reader(world);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) tile(y * GRID_W + wrapX(x));
    }

    /** Reads tile i of `world` into the field. */
    private reader(world: WorldState): (i: number) => void {
      const T = LandTables.shared();
      const { elevation: e, biome, landscape, landscapeDensity, substrate, flora, floraTop, vegetation, riverLevel, tech } = world;
      const algae = floraBit(Flora.FreshwaterAlgae);
      const kelp = floraBit(Flora.MarineAlgae);
      const scars = world.hazards.scar;
      const shown = mapFloraMask(world);
      const flowering = floraBit(Flora.Flowering);
      const cacti = cactiArrived(world);
      const trees = savannaTreesArrived(world);
      const palms = palmsArrived(world);
      const reefs = reefMap(world);
      return (i: number): void => {
        const h = e[i];
        let key = 0;
        let scene = LAND_SCENE_NONE;
        let density = 0;
        let groups = 0;
        let cactus = 0;
        let tree = 0;
        let palm = 0;
        let sea = 1;
        let lagoon = 0;
        let reef = 0;
        let beach = 0;
        let shade = 0;
        let rugged = 0;
        let river = 0;
        if (h < 0) {
          if (packIce(world.temperature[i], i)) key = T.seaIceKey;
          else if (reefs.coral[i] !== CoralKind.None) reef = reefs.coral[i];
          else if (biome[i] === Biome.Coast && h > KELP_DEPTH && (flora[i] & kelp) !== 0) {
            scene = LAND_SCENE_SEA;
            groups = kelp;
            density = vegetation[i] < 0.3 ? 0 : vegetation[i] < 0.6 ? 1 : 2;
          }
          sea = biome[i] === Biome.Ocean ? 0 : biome[i] === Biome.Coast || h > COAST_DEPTH ? 1 : 0;
          if (key === 0) lagoon = reefs.lagoon[i];
        } else {
          const ls = landscape[i];
          density = Math.min(landscapeDensity[i], T.steps[ls * 4 + substrate[i]] - 1);
          key = T.groundKey(ls, substrate[i], density);
          // New land of a hotspot or an island arc is fresh basalt until it
          // weathers; bare rock in the subnival belt is scree (docs/hoehe-spec.md §3.6).
          if (ls === Landscape.Rock) {
            const kind = world.upliftKind[i];
            if ((kind === UpliftKind.Hotspot || kind === UpliftKind.IslandArc) && world.soil[i] < FRESH_ROCK_SOIL) {
              key = T.materialKey('basalt') || key;
            } else if (world.landscapeZone[i] !== ZONE_NONE && (world.landscapeZone[i] & ZONE_ROCKBELT) !== 0) {
              key = T.materialKey('scree') || key;
            }
          }
          lagoon = reefs.lagoon[i];
          beach = reefs.beach[i];
          shade = this.relief(e, i) + MACRO[i];
          rugged = Math.round(clamp((h - CRAG_START) / MOUNTAIN_SPAN, 0, 1) * CRAG_STEPS * 4) / 4;
          if (riverLevel[i] > 0) river = 1;
          if (river === 0 && tech[i] === Tech.None) {
            scene = ls;
            groups = flora[i] & T.showable[ls] & shown;
            // On desert ground the flowering plants show only as cacti, on some tiles, once cacti exist.
            if (isCactusLandscape(ls) && (flora[i] & flowering) !== 0) {
              groups &= ~flowering;
              if (cacti && landHash(i % GRID_W, (i / GRID_W) | 0, 820) < CACTUS_SHARE) cactus = 1;
            }
            if (trees && ls === Landscape.Savanna && (flora[i] & flowering) !== 0 &&
              landHash(i % GRID_W, (i / GRID_W) | 0, 830) < savannaTreeShare(this.reach.toDry[i], this.reach.toForest[i])) tree = 1;
            if (beach !== BeachKind.None && palms) palm = beachPalms(i);
          }
          // A disaster's scar replaces the ground while it is fresh (docs/ereignisse-spec.md §4).
          const scar = scars[i];
          // A vent is a cone (volcanoes()): nothing grows on it.
          if (scar === ScarKind.Vent) scene = LAND_SCENE_NONE;
          if (scar !== ScarKind.None && scarShowsGround(world, i)) {
            // Fresh ground carries none of the landscape's old objects; the
            // effect layer draws the scar's own (fxscars.ts).
            scene = LAND_SCENE_NONE;
            const g = scarGround(scar, T);
            if (g) {
              key = g.key;
              shade += g.shade;
            }
          }
        }
        if (key !== 0 && h < 0) shade = MACRO[i];
        this.key[i] = key;
        this.rank[i] = key === 0 ? 0 : landKeyRank(key);
        this.shade[i] = Math.round(clamp(shade, -LAND_SHIFT_MAX + 1, LAND_SHIFT_MAX - 1) * QUANT) / QUANT;
        this.rugged[i] = rugged;
        this.river[i] = river;
        this.algae[i] = h >= 0 && (flora[i] & algae) !== 0 ? 1 : 0;
        this.scene[i] = scene;
        this.density[i] = density;
        this.groups[i] = groups;
        this.top[i] = floraTop[i];
        this.cactus[i] = scene === LAND_SCENE_NONE ? 0 : cactus;
        this.savannaTree[i] = scene === LAND_SCENE_NONE ? 0 : tree;
        this.palm[i] = scars[i] === ScarKind.None ? palm : 0;
        this.sea[i] = sea;
        this.lagoon[i] = lagoon;
        this.seaTile[i] = h < 0 ? 1 : 0;
        this.reef[i] = reef;
        this.corals[i] = reef ? reefs.corals[i] : 0;
        this.sands[i] = reef ? reefs.sands[i] : 0;
        this.beach[i] = beach;
      };
    }

    /** The per-tile signatures over [x0, x1) × [y0, y1). */
    private sign(x0: number, y0: number, x1: number, y1: number): void {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) this.signAt(y * GRID_W + wrapX(x));
    }

    private signAt(i: number): void {
      const lines = this.paths.sig;
      const ridges = this.ridges.sig;
      let s = Math.imul(this.key[i] ^ (this.river[i] << 8) ^ (this.edge[i] << 16) ^ (this.density[i] << 20) ^ (this.algae[i] << 23) ^ (this.scene[i] << 24), 0x9e3779b1);
      s ^= Math.imul(this.groups[i] ^ (this.top[i] << 16) ^ (this.cactus[i] << 21) ^ (this.savannaTree[i] << 22), 0x85ebca77) ^ Math.imul(lines[i], 0x27d4eb2d);
      const shore = this.sea[i] | (this.lagoon[i] << 1) | (this.reef[i] << 3) | (this.corals[i] << 5) | (this.sands[i] << 8) | (this.beach[i] << 10) | (this.palm[i] << 12);
      s ^= Math.imul(shore ^ (((this.shade[i] + LAND_SHIFT_MAX) * QUANT) << 16), 0xc2b2ae3d);
      s ^= Math.imul(ridges[i] ^ (this.rugged[i] * 4) ^ (this.volcano[i] << 5), 0x27d4eb2d);
      this.sig[i] = (s ^ (s >>> 15)) >>> 0;
    }

    /**
     * Hillshade in ramp steps: light from the upper left, so a slope that
     * rises towards the lower right faces the light; highlands a little paler.
     */
    private relief(e: Float32Array, i: number): number {
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      const r = Math.max(0, e[idx(wrapX(x + 1), y)]);
      const l = Math.max(0, e[idx(wrapX(x - 1), y)]);
      const d = Math.max(0, e[idx(x, clampY(y + 1))]);
      const u = Math.max(0, e[idx(x, clampY(y - 1))]);
      const slope = r - l + d - u;
      const m = mountainness(e[i]);
      const raw = slope * RELIEF_GAIN * (1 + m);
      const s = Math.sign(raw) * Math.max(0, Math.abs(raw) - RELIEF_DEAD * (1 - m));
      const limit = RELIEF_LIMIT + m;
      const curve = e[i] - (r + l + d + u) / 4;
      const c = clamp(Math.sign(curve) * Math.max(0, Math.abs(curve) - CURVE_DEAD) * CURVE_GAIN, -CURVE_LIMIT, CURVE_LIMIT);
      const altitude = clamp((e[i] - ALTITUDE_MID) * ALTITUDE_GAIN, ALTITUDE_LOW, ALTITUDE_HIGH);
      return clamp(s + c + altitude, -limit, limit);
    }

    /**
     * Cones: every vent and active volcano on land, and on volcanic belts
     * (coastal ranges only over a hot mantle) or hotspots the highest land tile
     * within VOLCANO_REACH (ties to the lower index) with neither of those that
     * near, never on a river or a city. Fresh while basalt covers it, its vent
     * is young or it is an active volcano, else dormant.
     */
    private volcanoes(world: WorldState): void {
      const { elevation: e, upliftKind, riverLevel, tech, magma } = world;
      const { scar, scarAge } = world.hazards;
      const v = this.volcano;
      v.fill(0);
      let mean = 0;
      for (let i = 0; i < TILE_COUNT; i++) mean += magma[i];
      const hot = mean / TILE_COUNT + HOTSPOT_MAGMA_EXCESS;
      const vent = (i: number): boolean => scar[i] === ScarKind.Vent || upliftKind[i] === UpliftKind.ActiveVolcano;
      for (let i = 0; i < TILE_COUNT; i++) {
        if (vent(i)) {
          if (e[i] >= 0) v[i] = upliftKind[i] === UpliftKind.ActiveVolcano || scarAge[i] < SCAR_MIN_TICKS[ScarKind.Basalt] ? 2 : 1;
          continue;
        }
        if (e[i] < VOLCANO_MIN_ELEVATION || riverLevel[i] > 0 || tech[i] !== Tech.None) continue;
        if (magma[i] < hot && (!isVolcanicKind(upliftKind[i]) || (upliftKind[i] === UpliftKind.Arc && magma[i] < ARC_VOLCANO_MAGMA))) continue;
        const x = i % GRID_W;
        const y = (i / GRID_W) | 0;
        let top = true;
        for (let dy = -VOLCANO_REACH; dy <= VOLCANO_REACH && top; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= GRID_H) continue;
          for (let dx = -VOLCANO_REACH; dx <= VOLCANO_REACH; dx++) {
            const j = ny * GRID_W + wrapX(x + dx);
            if (j !== i && (vent(j) || e[j] > e[i] || (e[j] === e[i] && j < i))) { top = false; break; }
          }
        }
        if (top) v[i] = scar[i] === ScarKind.Basalt ? 2 : 1;
      }
    }

    /**
     * Chebyshev distance (0, 1, 2+) to a tile of lower material rank — water
     * counts as rank 0 — over [x0, x1) × [y0, y1), whose rank changed at least
     * two tiles inside the edge.
     */
    private edges(x0: number, y0: number, x1: number, y1: number): void {
      const { rank, low, edge } = this;
      const min3 = (src: Uint8Array, dst: Uint8Array, ya0: number, ya1: number, xa0: number, xa1: number): void => {
        for (let y = Math.max(0, ya0); y < Math.min(GRID_H, ya1); y++) {
          const ya = clampY(y - 1) * GRID_W;
          const yb = y * GRID_W;
          const yc = clampY(y + 1) * GRID_W;
          for (let u = xa0; u < xa1; u++) {
            const x = wrapX(u);
            const xa = wrapX(x - 1);
            const xc = wrapX(x + 1);
            dst[yb + x] = Math.min(src[ya + xa], src[ya + x], src[ya + xc], src[yb + xa], src[yb + x], src[yb + xc],
              src[yc + xa], src[yc + x], src[yc + xc]);
          }
        }
      };
      // The full map needs no margin; a box reads `low` one tile around its `wide`.
      const m = x1 - x0 >= GRID_W ? 0 : 1;
      min3(rank, low, y0 - m, y1 + m, x0 - m, x1 + m);
      min3(low, this.wide, y0, y1, x0, x1);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = y * GRID_W + wrapX(x);
        edge[i] = low[i] < rank[i] ? 0 : this.wide[i] < rank[i] ? 1 : 2;
      }
    }

    /** Signature of everything that reaches into tiles [tx0, tx0 + tw) × [ty0, ty0 + th). */
    signature(tx0: number, ty0: number, tw: number, th: number, salt: number): number {
      let h = (0x811c9dc5 ^ salt) >>> 0;
      const r = SIGNATURE_REACH;
      for (let y = Math.max(0, ty0 - r); y < Math.min(GRID_H, ty0 + th + r); y++) {
        const row = y * GRID_W;
        for (let x = tx0 - r; x < tx0 + tw + r; x++) h = Math.imul(h ^ this.sig[row + wrapX(x)], 0x01000193);
      }
      return h >>> 0;
    }
  }
}
