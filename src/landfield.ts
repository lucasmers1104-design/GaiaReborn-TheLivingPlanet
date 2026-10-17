/* =============================================================================
 * SimEarth 2.0 — per-tile inputs of the pixel terrain
 * -----------------------------------------------------------------------------
 * Everything the compositor needs from the world, read once per refresh into
 * flat arrays: the ground key of each tile, water depth, relief and macro
 * shading as ramp steps, the river sprite, the distance to a lower ground
 * (forest edges), and the scene, density and plant groups that place
 * objects. Values are quantised here, so a tile's 32-bit signature fixes
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
  /** Highlands a little lighter, lowlands a little darker, in steps per unit of elevation. */
  const ALTITUDE_GAIN = 0.5;
  /** Macro variation: value-noise lattice cells around the planet (8 tiles each). */
  const MACRO_CELLS = 32;
  /** |noise| where a patch starts to shift, and the band over which it reaches one step. */
  const MACRO_START = 0.22;
  const MACRO_BAND = 0.2;
  /** Shading is quantised to this fraction of a step. */
  const QUANT = 8;
  /** The water ramp position of the shallowest water; the last step of the ramp is foam. */
  export const LAND_SHALLOW = TERRAIN_MANIFEST.ramps.water.length - 2;
  /** Water ramp position by elevation (deep → shallow), the knots of DEPTH_RAMP on an 8-step ramp. */
  const DEPTH_KNOTS: readonly (readonly [number, number])[] = [
    [-1, 0], [-0.6, 1], [-0.35, 2], [COAST_DEPTH, 3], [-0.07, 4.5], [0, 6],
  ].map(([e, d]) => [e, (d * LAND_SHALLOW) / 6] as const);
  /** Tiles beyond a chunk whose inputs reach into it: dual grid 1, objects 1, edge distance 2. */
  const SIGNATURE_REACH = 3;

  function depthAt(e: number): number {
    if (e <= -1) return 0;
    for (let k = 1; k < DEPTH_KNOTS.length; k++) {
      const [e1, d1] = DEPTH_KNOTS[k];
      if (e <= e1) {
        const [e0, d0] = DEPTH_KNOTS[k - 1];
        return d0 + ((e - e0) / (e1 - e0)) * (d1 - d0);
      }
    }
    return LAND_SHALLOW;
  }

  /**
   * depthAt quantised to 1/QUANT, by table: the depth only grows with the
   * elevation, so a table cell whose two ends quantise alike holds that value
   * throughout; only the cells across a step are worked out per tile.
   */
  const DEPTH_CELLS = 4096;
  const DEPTH_TABLE: Float32Array = (() => {
    const q = (e: number): number => Math.round(depthAt(e) * QUANT) / QUANT;
    return Float32Array.from({ length: DEPTH_CELLS }, (_, n) => {
      const a = q(-1 + n / DEPTH_CELLS);
      return a === q(-1 + (n + 1) / DEPTH_CELLS) ? a : -1;
    });
  })();
  function seaDepth(e: number): number {
    const v = e <= -1 ? 0 : DEPTH_TABLE[Math.min(DEPTH_CELLS - 1, Math.floor((e + 1) * DEPTH_CELLS))];
    return v >= 0 ? v : Math.round(depthAt(e) * QUANT) / QUANT;
  }

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

  export class TerrainField {
    /** 0 water, else landKey(rank, density). */
    readonly key = new Uint8Array(TILE_COUNT);
    /** Water ramp position, 0 deep .. LAND_SHALLOW; land counts as shallowest. */
    readonly depth = new Float32Array(TILE_COUNT);
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
    /** Coconut palms on a beach tile, 0..2 (beaches.ts). */
    readonly palm = new Uint8Array(TILE_COUNT);
    private readonly reach = new SavannaReach();
    readonly sig = new Uint32Array(TILE_COUNT);
    private readonly rank = new Uint8Array(TILE_COUNT);
    private readonly low = new Uint8Array(TILE_COUNT);
    private readonly wide = new Uint8Array(TILE_COUNT);

    refresh(world: WorldState): void {
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
      if (trees) this.reach.update(world);
      for (let i = 0; i < TILE_COUNT; i++) {
        const h = e[i];
        let key = 0;
        let scene = LAND_SCENE_NONE;
        let density = 0;
        let groups = 0;
        let cactus = 0;
        let tree = 0;
        let palm = 0;
        let shade = 0;
        let rugged = 0;
        let river = 0;
        if (h < 0) {
          if (packIce(world.temperature[i], i)) key = T.seaIceKey;
          else if (biome[i] === Biome.Coast && h > KELP_DEPTH && (flora[i] & kelp) !== 0) {
            scene = LAND_SCENE_SEA;
            groups = kelp;
            density = vegetation[i] < 0.3 ? 0 : vegetation[i] < 0.6 ? 1 : 2;
          }
          this.depth[i] = seaDepth(h);
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
          const beach = isBeach(world, i);
          if (beach) key = T.materialKey('beach') || key;
          this.depth[i] = LAND_SHALLOW;
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
            // A beach is bare sand: no jungle giants, only its palms.
            if (beach) {
              scene = LAND_SCENE_NONE;
              palm = beachPalms(world, i, palms);
            }
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
      }
      this.edges();
      this.volcanoes(world);
      this.paths.build(world);
      this.ridges.build(world, this.volcano);
      const lines = this.paths.sig;
      const ridges = this.ridges.sig;
      for (let i = 0; i < TILE_COUNT; i++) {
        let s = Math.imul(this.key[i] ^ (this.river[i] << 8) ^ (this.edge[i] << 16) ^ (this.density[i] << 20) ^ (this.algae[i] << 23) ^ (this.scene[i] << 24), 0x9e3779b1);
        s ^= Math.imul(this.groups[i] ^ (this.top[i] << 16) ^ (this.cactus[i] << 21) ^ (this.savannaTree[i] << 22) ^ (this.palm[i] << 23), 0x85ebca77) ^ Math.imul(lines[i], 0x27d4eb2d);
        s ^= Math.imul((this.depth[i] * QUANT) ^ (((this.shade[i] + LAND_SHIFT_MAX) * QUANT) << 8), 0xc2b2ae3d);
        s ^= Math.imul(ridges[i] ^ (this.rugged[i] * 4) ^ (this.volcano[i] << 5), 0x27d4eb2d);
        this.sig[i] = (s ^ (s >>> 15)) >>> 0;
      }
    }

    /**
     * Hillshade in ramp steps: light from the upper left, so a slope that
     * rises towards the lower right faces the light; highlands a little paler.
     */
    private relief(e: Float32Array, i: number): number {
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      const slope = Math.max(0, e[idx(wrapX(x + 1), y)]) - Math.max(0, e[idx(wrapX(x - 1), y)]) +
        Math.max(0, e[idx(x, clampY(y + 1))]) - Math.max(0, e[idx(x, clampY(y - 1))]);
      const m = mountainness(e[i]);
      const raw = slope * RELIEF_GAIN * (1 + m);
      const s = Math.sign(raw) * Math.max(0, Math.abs(raw) - RELIEF_DEAD * (1 - m));
      const limit = RELIEF_LIMIT + m;
      return clamp(s + (e[i] - 0.3) * ALTITUDE_GAIN, -limit, limit);
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

    /** Chebyshev distance (0, 1, 2+) to a tile of lower material rank — water counts as rank 0. */
    private edges(): void {
      const { rank, low, edge } = this;
      const min3 = (src: Uint8Array, dst: Uint8Array): void => {
        for (let y = 0; y < GRID_H; y++) {
          const ya = clampY(y - 1) * GRID_W;
          const yb = y * GRID_W;
          const yc = clampY(y + 1) * GRID_W;
          for (let x = 0; x < GRID_W; x++) {
            const xa = wrapX(x - 1);
            const xc = wrapX(x + 1);
            dst[yb + x] = Math.min(src[ya + xa], src[ya + x], src[ya + xc], src[yb + xa], src[yb + x], src[yb + xc],
              src[yc + xa], src[yc + x], src[yc + xc]);
          }
        }
      };
      min3(rank, low);
      min3(low, this.wide);
      for (let i = 0; i < TILE_COUNT; i++) edge[i] = low[i] < rank[i] ? 0 : this.wide[i] < rank[i] ? 1 : 2;
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
