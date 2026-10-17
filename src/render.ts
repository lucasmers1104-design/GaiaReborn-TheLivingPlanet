/* =============================================================================
 * SimEarth 2.0 — renderers
 * -----------------------------------------------------------------------------
 * EditView  a scrollable, zoomed tile view drawn from pixel sprites, with the
 *           five additive data layers and six exclusive climate overlays.
 * MapView   the whole planet at a glance in any of the twelve map modes, flat
 *           or as a globe, with the Edit Window's viewport drawn as a rectangle.
 * ========================================================================== */

namespace SE {
  /* --------------------------------------------------------------- ramps -- */

  /**
   * Diverging around mild (12 °C): blue arm down to −36 °C, amber-to-red arm
   * up to 36 °C, each stepping OKLCH lightness evenly so neighbouring climate
   * zones differ in brightness, not only in hue. The warm arm is the short,
   * steep one because half a living planet lies above 15 °C; a midpoint at
   * 0 °C or the old rainbow (green and yellow at equal lightness) turned
   * everything from the subtropics to the equator into one flat colour.
   */
  export const TEMP_MILD = 12;
  export const TEMP_RAMP: readonly (readonly [number, Rgb])[] = [
    [-60, [38, 36, 94]],
    [-36, [38, 68, 157]],
    [-24, [57, 114, 188]],
    [-12, [96, 159, 210]],
    [0, [156, 200, 227]],
    [TEMP_MILD, [237, 235, 226]],
    [18, [244, 186, 128]],
    [24, [229, 135, 59]],
    [30, [202, 83, 22]],
    [36, [163, 37, 20]],
    [50, [98, 20, 31]],
  ];

  export const ELEV_RAMP: readonly (readonly [number, Rgb])[] = [
    [-1.0, [8, 20, 60]],
    [-0.3, [25, 60, 130]],
    [-0.02, [60, 120, 190]],
    [0.0, [104, 128, 76]],
    [0.3, [150, 144, 94]],
    [0.6, [174, 148, 110]],
    [0.85, [212, 202, 184]],
    [1.0, [248, 248, 244]],
  ];

  export const RAIN_RAMP: readonly (readonly [number, Rgb])[] = [
    [0.0, [180, 150, 90]],
    [0.25, [200, 200, 120]],
    [0.5, [90, 200, 140]],
    [0.75, [40, 140, 200]],
    [1.0, [20, 40, 160]],
  ];

  export const MAGMA_RAMP: readonly (readonly [number, Rgb])[] = [
    [0.0, [30, 20, 20]],
    [0.4, [120, 40, 20]],
    [0.7, [220, 90, 20]],
    [1.0, [255, 230, 120]],
  ];

  /**
   * Resize a canvas's backing store to its CSS box, in device pixels — or a
   * fraction of them, for a deliberately chunky picture.
   */
  export function fitCanvas(canvas: HTMLCanvasElement, scale = 1): boolean {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const dpr = (window.devicePixelRatio || 1) * scale;
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return true;
  }

  /* -------------------------------------------------------- shared colour -- */

  /** River water as the overview map draws it, over any land colour. */
  const RIVER_MAP_COLOR: Rgb = [70, 150, 235];

  /* --------------------------------------------------------- relief shading -- */

  /**
   * Degrees of shading per unit of cross-tile slope.
   *
   * Set from the terrain rather than by eye. Measured over a planet's land, the
   * slope this uses has a median of 0.089 and a 90th percentile of 0.235, so
   * this puts a barely-visible 6% wash on ordinary ground and about 16% on a
   * genuinely steep flank — enough to trace a ridgeline, little enough that the
   * pixel art underneath still reads as pixel art. An earlier guess of 2.6 gave
   * the median tile a 23% wash and clipped a quarter of the map.
   */
  const RELIEF_STRENGTH = 0.7;
  /** Cliffs clip here, so nothing goes to solid black or solid white. */
  const RELIEF_MAX = 0.30;
  /** Below this the wash is invisible and not worth a fill. */
  const RELIEF_MIN = 0.02;
  /** How long the zoom must rest before the map is redrawn at the new size. */
  const ZOOM_SETTLE_MS = 140;
  /** Extra light per unit of elevation, so highlands read paler than lowland. */
  const ALTITUDE_LIGHT = 0.1;
  /** Peak-to-peak strength of the per-tile grain. */
  const GROUND_GRAIN = 0.05;

  /**
   * Pre-rendered shading washes, indexed `RELIEF_STEPS + step`.
   *
   * Composing the rgba string per tile allocated one string for every tile on
   * screen, sixty times a second. No one can tell thirty-two steps from a
   * continuum, and this way the render loop allocates nothing.
   */
  const RELIEF_WASH: readonly string[] = (() => {
    const out: string[] = [];
    for (let step = -RELIEF_STEPS; step <= RELIEF_STEPS; step++) {
      const alpha = ((Math.abs(step) / RELIEF_STEPS) * RELIEF_MAX).toFixed(3);
      out.push(step >= 0 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`);
    }
    return out;
  })();

  /**
   * The relief step of a land tile: hillshade from its cross-tile slope, the
   * highlands a little paler, and a faint per-tile grain so plains do not look
   * stamped. 0 when the wash would be invisible.
   */
  function reliefStep(world: WorldState, i: number): number {
    const elevation = world.elevation;
    const x = i % GRID_W;
    const y = (i / GRID_W) | 0;
    const west = Math.max(0, elevation[idx(wrapX(x - 1), y)]);
    const east = Math.max(0, elevation[idx(wrapX(x + 1), y)]);
    const north = Math.max(0, elevation[idx(x, clampY(y - 1))]);
    const south = Math.max(0, elevation[idx(x, clampY(y + 1))]);
    const shade = clamp((west - east) + (north - south), -1, 1) * RELIEF_STRENGTH +
      (elevation[i] - 0.3) * ALTITUDE_LIGHT + (tileNoise(i) - 0.5) * GROUND_GRAIN;
    if (shade > -RELIEF_MIN && shade < RELIEF_MIN) return 0;
    return clamp(Math.round((shade / RELIEF_MAX) * RELIEF_STEPS), -RELIEF_STEPS, RELIEF_STEPS);
  }

  /** Brightness factor from the slope across a land tile, light from the north-west. */
  function reliefFactor(world: WorldState, i: number): number {
    const e = world.elevation;
    const x = i % GRID_W;
    const y = (i / GRID_W) | 0;
    const slope = Math.max(0, e[idx(wrapX(x - 1), y)]) - Math.max(0, e[idx(wrapX(x + 1), y)]) +
      Math.max(0, e[idx(x, clampY(y - 1))]) - Math.max(0, e[idx(x, clampY(y + 1))]);
    return 1 + clamp(slope * 1.4, -0.3, 0.3);
  }

  /** Colour of a tile in a given map mode, with relief on the surface modes. */
  export function mapColor(world: WorldState, i: number, mode: MapMode): Rgb {
    const flat = flatMapColor(world, i, mode);
    switch (mode) {
      case MapMode.Terrain:
      case MapMode.Biomes:
      case MapMode.Technology:
        return world.isWater(i) || world.riverLevel[i] > 0 ? flat : shade(flat, reliefFactor(world, i));
      default:
        return flat;
    }
  }

  function flatMapColor(world: WorldState, i: number, mode: MapMode): Rgb {
    const water = world.isWater(i);

    // The drainage network is one of the things the overview is for — it shows
    // at a glance which continents are watered and where they are not. Only on
    // the modes that draw the surface as surface; a temperature map washed with
    // blue lines would just be misread.
    if (!water && world.riverLevel[i] > 0) {
      switch (mode) {
        case MapMode.Terrain:
        case MapMode.Oceans:
        case MapMode.Biomes:
        case MapMode.Rainfall:
          return RIVER_MAP_COLOR;
        default:
          break;
      }
    }

    switch (mode) {
      case MapMode.Terrain:
        return water ? sampleRamp(DEPTH_RAMP, world.elevation[i]) : sampleRamp(ELEV_RAMP, world.elevation[i]);

      case MapMode.Events: {
        if (world.eventTtl[i] > 0) return EGA.lightRed;
        return water ? [20, 30, 70] : [70, 70, 60];
      }

      case MapMode.Drift: {
        // Plate motion: warm where crust moves east, cool where it moves west.
        const v = driftProbe ? driftProbe(Math.floor(i / GRID_W)) : 0;
        const t = clamp(v * 900 * 0.5 + 0.5, 0, 1);
        return [lerp(60, 240, t), lerp(90, 120, 1 - Math.abs(t - 0.5) * 2), lerp(240, 60, t)];
      }

      case MapMode.Oceans:
        // "Hide oceans" — show the bare crust under the sea.
        return sampleRamp(ELEV_RAMP, water ? world.elevation[i] * 0.4 : world.elevation[i]);

      case MapMode.OceanTemp:
        return water ? sampleRamp(TEMP_RAMP, world.temperature[i]) : [40, 40, 40];

      case MapMode.OceanCurrents: {
        if (!water) return [40, 40, 40];
        const c = ClimateSystem.oceanCurrent(i % GRID_W, Math.floor(i / GRID_W));
        return c.dx > 0 ? [70, 140, 230] : [30, 60, 150];
      }

      case MapMode.AirTemp:
        return sampleRamp(TEMP_RAMP, world.temperature[i]);

      case MapMode.Rainfall:
        return sampleRamp(RAIN_RAMP, world.moisture[i]);

      case MapMode.AirCurrents: {
        const c = ClimateSystem.airCurrent(Math.floor(i / GRID_W));
        return c.dx > 0 ? [200, 200, 120] : [110, 130, 180];
      }

      case MapMode.Biomes:
        return water && world.biome[i] !== Biome.Arctic ? sampleRamp(DEPTH_RAMP, world.elevation[i]) : BIOME_COLORS[world.biome[i]];

      case MapMode.LifeMap: {
        // The overview map stays area-filling on purpose: it answers "where is
        // this species", which is exactly what the sparse Edit view cannot.
        // Where no animal lives, the leading plant group shows faintly.
        const c = world.dominantLife[i] as Life;
        if (c === Life.None) {
          const g = world.floraTop[i] as Flora;
          if (!water && g !== Flora.None && world.vegetation[i] > 0.05) return shade(FLORA[g].color, 0.55);
          return water ? [16, 24, 48] : [34, 30, 26];
        }
        const hue = LIFE[c].color;
        const k = 0.35 + 0.65 * clamp(world.tileBiomass[i], 0, 1);
        return [hue[0] * k, hue[1] * k, hue[2] * k];
      }

      case MapMode.Technology: {
        const t = world.tech[i];
        if (t === Tech.None) return water ? [16, 24, 48] : [34, 30, 26];
        return TECH_COLORS[t];
      }

      default:
        return EGA.black;
    }
  }

  /** Set by the app so the Drift map can read plate velocities. */
  export let driftProbe: ((y: number) => number) | null = null;

  /** A small JPEG of the planet's habitats, for save slots. Empty if unavailable. */
  export function planetThumbnail(world: WorldState, width = 192): string {
    const src = document.createElement('canvas');
    src.width = GRID_W;
    src.height = GRID_H;
    const out = document.createElement('canvas');
    out.width = width;
    out.height = Math.round(width / 2);
    const sctx = src.getContext('2d');
    const octx = out.getContext('2d');
    if (!sctx || !octx) return '';
    const image = sctx.createImageData(GRID_W, GRID_H);
    for (let i = 0; i < TILE_COUNT; i++) {
      const c = mapColor(world, i, MapMode.Biomes);
      image.data[i * 4] = c[0];
      image.data[i * 4 + 1] = c[1];
      image.data[i * 4 + 2] = c[2];
      image.data[i * 4 + 3] = 255;
    }
    sctx.putImageData(image, 0, 0);
    octx.drawImage(src, 0, 0, out.width, out.height);
    try {
      return out.toDataURL('image/jpeg', 0.82);
    } catch {
      return '';
    }
  }

  /* -------------------------------------------------------------- EditView -- */

  export class EditView {
    /** Screen pixels per tile before device scaling. */
    tilePx = 16;
    /** Top-left of the viewport, in tiles. Fractional, so dragging is smooth. */
    scrollX = 0;
    scrollY = 0;

    /** Additive layers, indexed as in DATA_LAYERS. */
    layers = { oceans: true, biomes: true, cities: true, life: true, events: true, clouds: true };
    /** The single active climate overlay. */
    overlay: Overlay = Overlay.None;

    hover: { x: number; y: number } | null = null;
    /** Footprint of the armed tool around the hovered tile, in tiles. */
    brushRadius = 0;
    /** Outline colour of the brush preview. */
    brushColor = 'rgba(255,255,255,0.9)';

    static readonly MIN_TILE = 10;
    static readonly MAX_TILE = 48;

    private readonly tiles = new TileCache();
    private readonly regions = new BiomeRegions();
    private readonly ambient = new AmbientLayer();
    private readonly waterMotion = new WaterMotion();
    private readonly herds = new HerdLayer();
    private readonly whales = new WhaleLayer();
    private readonly cities = new CityLayer();
    private readonly settlers = new SettlerLayer();
    /** Disasters: omens, eruptions, lava, smoke (docs/ereignisse-spec.md). */
    readonly fx = new EffectLayer();
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    /** The world drawn once; frames only add the cursor on top. */
    private readonly base: HTMLCanvasElement;
    private readonly baseCtx: CanvasRenderingContext2D;
    private baseKey = '';
    private baseTick = -1;
    private baseTime = 0;
    private dirty = true;
    /** Scroll position the base image was drawn at, for shifting it. */
    private baseScrollX = 0;
    private baseScrollY = 0;
    /** How long the last full redraw took, in ms — sets how often it may run. */
    private drawCost = 0;
    /** Tile size the base image was drawn at, and when the zoom last moved. */
    private baseTilePx = 16;
    private zoomedAt = -Infinity;
    private readonly swap: HTMLCanvasElement;
    private readonly swapCtx: CanvasRenderingContext2D;
    private readonly land = PixelTerrain.shared();

    constructor(canvas: HTMLCanvasElement) {
      this.canvas = canvas;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('SimEarth: 2D context unavailable for the Edit window');
      this.ctx = ctx;
      this.base = document.createElement('canvas');
      const bctx = this.base.getContext('2d');
      if (!bctx) throw new Error('SimEarth: offscreen 2D context unavailable');
      this.baseCtx = bctx;
      this.swap = document.createElement('canvas');
      const sctx = this.swap.getContext('2d');
      if (!sctx) throw new Error('SimEarth: offscreen 2D context unavailable');
      this.swapCtx = sctx;
      if (TERRAIN_STYLE === 'pixel') this.land.whenReady(() => this.markDirty());
      this.cities.whenReady(() => this.markDirty());
    }

    /** "Effekte reduzieren": disasters without shaking or flashes, and still water. */
    get reduceEffects(): boolean {
      return this.waterMotion.still;
    }

    set reduceEffects(on: boolean) {
      this.fx.reduce = on;
      this.waterMotion.still = on;
      this.whales.still = on;
    }

    /** Force a full redraw on the next frame (after a tool changed the world). */
    markDirty(): void {
      this.dirty = true;
    }

    /** The pixel terrain draws the ground; with the Biomes layer off the map shows flat colours as before. */
    private get pixelTerrain(): boolean {
      return TERRAIN_STYLE === 'pixel' && this.layers.biomes && !this.land.failed;
    }

    private get viewW(): number {
      return this.canvas.width / (window.devicePixelRatio || 1);
    }
    private get viewH(): number {
      return this.canvas.height / (window.devicePixelRatio || 1);
    }

    /** Viewport width in tiles (fractional). */
    get cols(): number {
      return this.viewW / this.tilePx;
    }
    get rows(): number {
      return this.viewH / this.tilePx;
    }

    private clampScroll(): void {
      // Whole device pixels only: then a pan can reuse the last frame by
      // shifting it, and every tile still lands on exactly the same pixels.
      const q = this.tilePx * (window.devicePixelRatio || 1);
      this.scrollX = Math.round((((this.scrollX % GRID_W) + GRID_W) % GRID_W) * q) / q;
      const rows = this.rows;
      if (rows >= GRID_H) this.scrollY = -(rows - GRID_H) / 2;
      else this.scrollY = Math.round(clamp(this.scrollY, 0, GRID_H - rows) * q) / q;
    }

    /** Centre the viewport on a tile. */
    centerOn(x: number, y: number): void {
      this.scrollX = x + 0.5 - this.cols / 2;
      this.scrollY = y + 0.5 - this.rows / 2;
      this.clampScroll();
    }

    /** Scroll by a number of tiles (fractions allowed). */
    scrollBy(dx: number, dy: number): void {
      this.scrollX += dx;
      this.scrollY += dy;
      this.clampScroll();
    }

    /** Zoom around a screen point, keeping the tile under it in place. */
    zoomAt(factor: number, clientX: number, clientY: number): void {
      const rect = this.canvas.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const before = this.tilePx;
      const next = clamp(Math.round(before * factor), EditView.MIN_TILE, EditView.MAX_TILE);
      if (next === before) return;
      const wx = this.scrollX + px / before;
      const wy = this.scrollY + py / before;
      this.tilePx = next;
      this.zoomedAt = performance.now();
      this.scrollX = wx - px / next;
      this.scrollY = wy - py / next;
      this.clampScroll();
    }

    /** Rings spreading from a tile for a few seconds, to show where something happened. */
    ping(x: number, y: number, color: string): void {
      this.ambient.ping(x, y, color, performance.now());
    }

    /** Publish this viewport to the Map window, which draws it as a rectangle. */
    editRectInto(map: MapView): void {
      map.editRect = { x: this.scrollX, y: Math.max(0, this.scrollY), w: this.cols, h: Math.min(GRID_H, this.rows) };
    }

    /** Convert a pointer position to world tile coordinates. */
    tileAt(clientX: number, clientY: number): { x: number; y: number } | null {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width <= 0) return null;
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      if (px < 0 || py < 0 || px >= rect.width || py >= rect.height) return null;
      const wy = Math.floor(this.scrollY + py / this.tilePx);
      if (wy < 0 || wy >= GRID_H) return null;
      return { x: wrapX(Math.floor(this.scrollX + px / this.tilePx)), y: wy };
    }

    render(world: WorldState): void {
      if (!fitCanvas(this.canvas)) return;
      const dpr = window.devicePixelRatio || 1;
      if (this.base.width !== this.canvas.width || this.base.height !== this.canvas.height) {
        this.base.width = this.canvas.width;
        this.base.height = this.canvas.height;
        this.dirty = true;
      }
      this.clampScroll();

      // The view is redrawn when the camera or the layers change, and when the
      // world has moved on — but the world part at most four times a second:
      // nothing on a tile map changes visibly faster, and at the fastest speed
      // redrawing every tile on every tick was most of the frame.
      const key = `${this.tilePx}|${this.overlay}|${this.canvas.width}x${this.canvas.height}|` +
        `${+this.layers.oceans}${+this.layers.biomes}${+this.layers.cities}${+this.layers.life}${+this.layers.events}`;
      const now = performance.now();
      const ctx = this.ctx;
      // While the player is still zooming, stretch the last picture rather
      // than redraw every tile for each wheel notch or pinch step; the real
      // redraw follows as soon as the zoom comes to rest.
      const sameButZoom = key.slice(key.indexOf('|')) === this.baseKey.slice(this.baseKey.indexOf('|'));
      const previewing = !this.dirty && sameButZoom && this.tilePx !== this.baseTilePx && now - this.zoomedAt < ZOOM_SETTLE_MS;
      if (previewing) {
        this.drawZoomPreview(dpr);
      } else {
        // A full redraw on a huge screen can take tens of milliseconds; the
        // slower it is, the less often the world's progress triggers one.
        const interval = Math.max(250, this.drawCost * 8);
        const worldMoved = world.ticks !== this.baseTick && now - this.baseTime > interval;
        const scrolled = this.scrollX !== this.baseScrollX || this.scrollY !== this.baseScrollY;
        if (this.dirty || key !== this.baseKey || worldMoved || (scrolled && !this.shiftBase(world, dpr))) {
          const t0 = performance.now();
          this.drawBase(world, dpr);
          this.drawCost = performance.now() - t0;
          this.baseKey = key;
          this.baseTick = world.ticks;
          this.baseTime = now;
          this.baseScrollX = this.scrollX;
          this.baseScrollY = this.scrollY;
          this.baseTilePx = this.tilePx;
          this.dirty = false;
        }
        // The terrain or the cities ran out of time for composing: finish next frame.
        if ((this.pixelTerrain && this.land.pending) || this.cities.pending) this.dirty = true;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(this.base, 0, 0);
      }

      const fx = this.layers.events && this.pixelTerrain && this.land.ready ? this.fx : null;
      const cam: LandCamera = { scrollX: this.scrollX, scrollY: this.scrollY, tilePx: this.tilePx, dpr };
      const cities = (x0: number, y0: number, x1: number, y1: number): void => {
        if (this.layers.cities) this.cities.draw(ctx, cam, world, this.land.field, x0, y0, x1, y1);
      };
      if (this.pixelTerrain && !previewing) {
        this.waterMotion.draw(ctx, cam, this.cols, this.rows, world, this.land, this.layers.oceans, now);
      }
      if (!fx) this.fx.show.flush(world);
      // Only a finished base counts: while the terrain is still composing it shows older ground.
      if (!this.land.pending) this.fx.baseTick = this.baseTick;
      if (fx) {
        fx.update(world, cam, this.cols, this.rows, now);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (!previewing) fx.drawShake(ctx, this.base, cam, now);
        fx.drawGround(ctx, world, cam, this.land, now, cities);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (this.layers.life) {
        this.herds.update(world, now);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.whales.draw(ctx, cam, this.herds.markers, world, this.land, now, this.regions);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.herds.draw(ctx, this, world, now, this.tiles, this.regions,
          (m) => this.whales.claims(m, world, this.tilePx, this.regions));
      }
      if (this.layers.cities) this.settlers.draw(ctx, this, world, now, dpr);
      if (fx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        fx.drawObjects(ctx, world, cam, this.land, cities);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      if (this.layers.cities) drawCityNames(ctx, this, world);
      this.ambient.draw(ctx, this, world, now, this.layers.oceans, this.layers.clouds);
      if (fx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        fx.drawTop(ctx, cam);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      this.drawCursor(ctx, this.tilePx);
    }

    /**
     * How much surf the view shows, 0..1: the share of visible tiles that are
     * open water on a shore, on a coarse grid. Coasts are lines, so zooming out
     * thins the share by itself; the zoom term lowers it further.
     */
    surfPresence(world: WorldState): number {
      const step = Math.max(1, Math.ceil(Math.max(this.cols / 48, this.rows / 32)));
      const x0 = Math.floor(this.scrollX);
      const y0 = Math.max(0, Math.floor(this.scrollY));
      const y1 = Math.min(GRID_H, Math.ceil(this.scrollY + this.rows));
      let seen = 0;
      let shore = 0;
      for (let y = y0; y < y1; y += step) {
        for (let rx = 0; rx < this.cols; rx += step) {
          const x = wrapX(x0 + rx);
          const i = idx(x, y);
          seen++;
          if (world.isWater(i) && world.biome[i] !== Biome.Arctic && shoreMask(world, x, y) !== 0) shore++;
        }
      }
      if (seen === 0) return 0;
      const zoom = (this.tilePx - EditView.MIN_TILE) / (EditView.MAX_TILE - EditView.MIN_TILE);
      return clamp((shore / seen) / 0.06, 0, 1) * (0.4 + 0.6 * zoom);
    }

    /** The last full picture, scaled and moved to where the new zoom puts it. */
    private drawZoomPreview(dpr: number): void {
      const k = this.tilePx / this.baseTilePx;
      const span = GRID_W * this.tilePx;
      let dx = (this.baseScrollX - this.scrollX) * this.tilePx;
      if (dx > span / 2) dx -= span;
      if (dx < -span / 2) dx += span;
      const dy = (this.baseScrollY - this.scrollY) * this.tilePx;
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#05090c';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.base, dx * dpr, dy * dpr, this.base.width * k, this.base.height * k);
    }

    /**
     * Pan by moving the last image and drawing only the strip that came into
     * view. Returns false when the jump is too large to be worth it.
     */
    private shiftBase(world: WorldState, dpr: number): boolean {
      const size = this.tilePx;
      let dxT = this.scrollX - this.baseScrollX;
      if (dxT > GRID_W / 2) dxT -= GRID_W;
      if (dxT < -GRID_W / 2) dxT += GRID_W;
      const dyT = this.scrollY - this.baseScrollY;
      const dx = dxT * size;
      const dy = dyT * size;
      const w = this.viewW;
      const h = this.viewH;
      if (Math.abs(dx) >= w * 0.5 || Math.abs(dy) >= h * 0.5) return false;
      this.tiles.setDeviceTile(size * dpr);
      this.regions.refresh(world);

      this.swap.width = this.base.width;
      this.swap.height = this.base.height;
      this.swapCtx.drawImage(this.base, 0, 0);
      const ctx = this.baseCtx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#05090c';
      ctx.fillRect(0, 0, this.base.width, this.base.height);
      ctx.drawImage(this.swap, Math.round(-dx * dpr), Math.round(-dy * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (dx > 0) this.drawRegion(world, w - dx - size, 0, w, h);
      else if (dx < 0) this.drawRegion(world, 0, 0, -dx + size, h);
      if (dy > 0) this.drawRegion(world, 0, h - dy - size, w, h);
      else if (dy < 0) this.drawRegion(world, 0, 0, w, -dy + size);

      this.baseScrollX = this.scrollX;
      this.baseScrollY = this.scrollY;
      return true;
    }

    /** Redraw every tile overlapping a rectangle of the view (CSS pixels). */
    private drawRegion(world: WorldState, x0: number, y0: number, x1: number, y1: number): void {
      if (this.pixelTerrain) {
        this.drawLandRegion(world, x0, y0, x1, y1);
        return;
      }
      const ctx = this.baseCtx;
      const size = this.tilePx;
      const tx0 = Math.floor(this.scrollX);
      const ty0 = Math.floor(this.scrollY);
      const ox = (this.scrollX - tx0) * size;
      const oy = (this.scrollY - ty0) * size;
      const c0 = Math.max(0, Math.floor((x0 + ox) / size));
      const c1 = Math.ceil((x1 + ox) / size);
      const r0 = Math.max(0, Math.floor((y0 + oy) / size));
      const r1 = Math.ceil((y1 + oy) / size);
      for (let ry = r0; ry <= r1; ry++) {
        const wy = ty0 + ry;
        if (wy < 0 || wy >= GRID_H) continue;
        const py = Math.round(ry * size - oy);
        for (let rx = c0; rx <= c1; rx++) {
          const wx = wrapX(tx0 + rx);
          const px = Math.round(rx * size - ox);
          const i = idx(wx, wy);
          this.drawTile(ctx, world, i, px, py, size);
          if (this.overlay !== Overlay.None) this.drawOverlayTile(ctx, world, i, wx, wy, px, py, size);
        }
      }
      this.drawCities(world, c0 * size - ox, r0 * size - oy, (c1 + 1) * size - ox, (r1 + 1) * size - oy);
    }

    private drawBase(world: WorldState, dpr: number): void {
      this.tiles.setDeviceTile(this.tilePx * dpr);
      this.regions.refresh(world);
      const ctx = this.baseCtx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#05090c';
      ctx.fillRect(0, 0, this.viewW, this.viewH);
      if (this.pixelTerrain) {
        this.drawLandRegion(world, 0, 0, this.viewW, this.viewH);
        return;
      }

      const size = this.tilePx;
      const x0 = Math.floor(this.scrollX);
      const y0 = Math.floor(this.scrollY);
      const ox = (this.scrollX - x0) * size;
      const oy = (this.scrollY - y0) * size;
      const cols = Math.ceil(this.cols) + 1;
      const rows = Math.ceil(this.rows) + 1;

      for (let ry = 0; ry < rows; ry++) {
        const wy = y0 + ry;
        if (wy < 0 || wy >= GRID_H) continue;
        const py = Math.round(ry * size - oy);
        for (let rx = 0; rx < cols; rx++) {
          const wx = wrapX(x0 + rx);
          const px = Math.round(rx * size - ox);
          this.drawTile(ctx, world, idx(wx, wy), px, py, size);
        }
      }
      this.drawCities(world, -ox, -oy, cols * size - ox, rows * size - oy);

      if (this.overlay !== Overlay.None) this.drawOverlay(ctx, world, size, x0, y0, ox, oy, cols, rows);
    }

    private drawTile(
      ctx: CanvasRenderingContext2D, world: WorldState,
      i: number, px: number, py: number, size: number,
    ): void {
      const tiles = this.tiles;
      const water = world.isWater(i);
      const biome = world.biome[i] as Biome;
      const variant = (tileNoise(i) * 4) | 0;
      // Trees, creatures and cities carry their shadow one sprite pixel out.
      const big = size * SHADOW_SPAN;

      // --- ground, with its relief shaded in ---
      if (water && !this.layers.oceans) {
        ctx.fillStyle = rgbCss(sampleRamp(ELEV_RAMP, world.elevation[i] * 0.4));
        ctx.fillRect(px, py, size, size);
      } else if (water && biome !== Biome.Arctic) {
        ctx.drawImage(tiles.sea(depthStep(world.elevation[i]), biome === Biome.Coast, variant), px, py, size, size);
        const shore = shoreMask(world, i % GRID_W, (i / GRID_W) | 0);
        if (shore !== 0) ctx.drawImage(tiles.surf(shore), px, py, size, size);
      } else if (this.layers.biomes) {
        // Thinly covered open land shows its bare, lichen-flecked ground: a
        // plain of first mosses should not look like a meadow.
        let ground: number = biome;
        if (biome === Biome.Grass && world.vegetation[i] < 0.3) ground = Biome.Tundra;
        if (biome === Biome.Rock && world.elevation[i] > SNOW_LINE) ground = SNOW_GROUND;
        const step = water ? 0 : reliefStep(world, i);
        ctx.drawImage(tiles.ground(ground, variant, step, step === 0 ? null : RELIEF_WASH[RELIEF_STEPS + step]), px, py, size, size);
      } else {
        ctx.fillStyle = rgbCss(BIOME_COLORS[biome]);
        ctx.fillRect(px, py, size, size);
        const step = water ? 0 : reliefStep(world, i);
        if (step !== 0) {
          ctx.fillStyle = RELIEF_WASH[RELIEF_STEPS + step];
          ctx.fillRect(px, py, size, size);
        }
      }

      // --- plants: the group that shapes the tile, sparse or dense ---
      const veg = world.vegetation[i];
      if (this.layers.biomes && (!water || this.layers.oceans)) {
        let g = Flora.None;
        if (water) {
          if ((world.flora[i] & floraBit(Flora.MarineAlgae)) !== 0 && veg >= 0.08) g = Flora.MarineAlgae;
        } else if (veg >= 0.05) {
          g = world.floraTop[i] as Flora;
        }
        if (g !== Flora.None) {
          const picture = plantPicture(world, i, g);
          const shown = (picture >> 4) as Flora;
          const reach = FLORA[shown].woody ? big : size;
          ctx.drawImage(tiles.plant(shown, veg >= 0.45 ? 1 : 0, (picture & 15) - 1), px, py, reach, reach);
        }
      }

      // --- rivers, with their algae ---
      const level = world.riverLevel[i];
      if (level > 0 && this.layers.oceans) {
        const mask = RiverSystem.connectionMask(world, i % GRID_W, (i / GRID_W) | 0);
        ctx.drawImage(tiles.river(level >= 0.6 ? 1 : 0, mask), px, py, size, size);
        if (this.layers.biomes && (world.flora[i] & floraBit(Flora.FreshwaterAlgae)) !== 0) {
          ctx.drawImage(tiles.riverAlgae(), px, py, size, size);
        }
      }

      this.drawTileTop(ctx, world, i, px, py, size);
    }

    /** What happens on a tile: its event (cities are a layer of their own, see drawCities). */
    private drawTileTop(ctx: CanvasRenderingContext2D, world: WorldState, i: number, px: number, py: number, size: number): void {
      if (this.layers.events && world.eventTtl[i] > 0) {
        ctx.drawImage(this.tiles.event(world.eventKind[i] as EventKind), px, py, size, size);
      }
    }

    /**
     * The city layer over every tile overlapping a rectangle of the view (CSS
     * pixels), scaled like the pixel terrain; it also draws the cities of the
     * row below, whose tops reach into the rectangle.
     */
    private drawCities(world: WorldState, x0: number, y0: number, x1: number, y1: number): void {
      if (!this.layers.cities) return;
      const dpr = window.devicePixelRatio || 1;
      const size = this.tilePx;
      const T = size * dpr;
      const txA = Math.floor(this.scrollX + x0 / size);
      const txB = Math.ceil(this.scrollX + x1 / size);
      const tyA = Math.max(0, Math.floor(this.scrollY + y0 / size));
      const tyB = Math.min(GRID_H, Math.ceil(this.scrollY + y1 / size));
      if (txB <= txA || tyB <= tyA) return;
      this.land.ensure(world);
      const ctx = this.baseCtx;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.cities.draw(ctx, { scrollX: this.scrollX, scrollY: this.scrollY, tilePx: size, dpr }, world, this.land.field,
        (txA - this.scrollX) * T, (tyA - this.scrollY) * T, (txB - this.scrollX) * T, (tyB - this.scrollY) * T);
      ctx.restore();
    }

    /**
     * The pixel terrain over every tile overlapping a rectangle of the view
     * (CSS pixels), then cities, events and the climate overlay on top.
     */
    private drawLandRegion(world: WorldState, x0: number, y0: number, x1: number, y1: number): void {
      const ctx = this.baseCtx;
      const dpr = window.devicePixelRatio || 1;
      const size = this.tilePx;
      const T = size * dpr;
      const txA = Math.floor(this.scrollX + x0 / size);
      const txB = Math.ceil(this.scrollX + x1 / size);
      const tyA = Math.max(0, Math.floor(this.scrollY + y0 / size));
      const tyB = Math.min(GRID_H, Math.ceil(this.scrollY + y1 / size));
      if (txB <= txA || tyB <= tyA) return;
      const land = this.land;
      land.refresh(world, this.layers.oceans);
      const cam: LandCamera = { scrollX: this.scrollX, scrollY: this.scrollY, tilePx: size, dpr };
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (land.ready) {
        land.draw(ctx, cam, (txA - this.scrollX) * T, (tyA - this.scrollY) * T, (txB - this.scrollX) * T, (tyB - this.scrollY) * T);
        this.drawCities(world, x0, y0, x1, y1);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      for (let ty = tyA; ty < tyB; ty++) {
        const py = Math.round((ty - this.scrollY) * size);
        for (let tx = txA; tx < txB; tx++) {
          const px = Math.round((tx - this.scrollX) * size);
          const i = idx(wrapX(tx), ty);
          // Until the atlas has decoded (a few milliseconds), flat colours.
          if (!land.ready) {
            ctx.fillStyle = rgbCss(mapColor(world, i, MapMode.Biomes));
            ctx.fillRect(px, py, size, size);
          }
          this.drawTileTop(ctx, world, i, px, py, size);
          if (this.overlay !== Overlay.None) this.drawOverlayTile(ctx, world, i, wrapX(tx), ty, px, py, size);
        }
      }
    }

    /** Climate overlays: a translucent wash, or arrows for the flow fields. */
    private drawOverlay(
      ctx: CanvasRenderingContext2D, world: WorldState, size: number,
      x0: number, y0: number, ox: number, oy: number, cols: number, rows: number,
    ): void {
      const isFlow = this.overlay === Overlay.Winds || this.overlay === Overlay.SeaFlow;
      for (let ry = 0; ry < rows; ry++) {
        const wy = y0 + ry;
        if (wy < 0 || wy >= GRID_H) continue;
        for (let rx = 0; rx < cols; rx++) {
          const wx = wrapX(x0 + rx);
          const i = idx(wx, wy);
          this.drawOverlayTile(ctx, world, i, wx, wy, Math.round(rx * size - ox), Math.round(ry * size - oy), size);
        }
      }
      void isFlow;
    }

    /** One tile of the active climate overlay. */
    private drawOverlayTile(
      ctx: CanvasRenderingContext2D, world: WorldState,
      i: number, wx: number, wy: number, px: number, py: number, size: number,
    ): void {
      if (this.overlay === Overlay.Winds || this.overlay === Overlay.SeaFlow) {
        if (this.overlay === Overlay.SeaFlow && !world.isWater(i)) return;
        const c = this.overlay === Overlay.Winds ? ClimateSystem.airCurrent(wy) : ClimateSystem.oceanCurrent(wx, wy);
        this.drawArrow(ctx, px, py, size, c.dx, c.dy);
        return;
      }
      let color: Rgb | null = null;
      switch (this.overlay) {
        case Overlay.Heat: color = sampleRamp(TEMP_RAMP, world.temperature[i]); break;
        case Overlay.Rainfall: color = sampleRamp(RAIN_RAMP, world.moisture[i]); break;
        case Overlay.SeaHeat: color = world.isWater(i) ? sampleRamp(TEMP_RAMP, world.temperature[i]) : null; break;
        case Overlay.Magma: color = sampleRamp(MAGMA_RAMP, world.magma[i]); break;
        default: color = null;
      }
      if (!color) return;
      ctx.fillStyle = `rgba(${Math.round(color[0])},${Math.round(color[1])},${Math.round(color[2])},0.62)`;
      ctx.fillRect(px, py, size, size);
    }

    private drawArrow(
      ctx: CanvasRenderingContext2D,
      px: number, py: number, size: number, dx: number, dy: number,
    ): void {
      const cx = px + size / 2;
      const cy = py + size / 2;
      const len = size * 0.32;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(1, size / 14);
      ctx.beginPath();
      ctx.moveTo(cx - dx * len, cy - dy * len);
      ctx.lineTo(cx + dx * len, cy + dy * len);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + dx * len, cy + dy * len, Math.max(1, size / 9), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
    }

    /** The hovered tile, and the full footprint the armed tool will touch. */
    private drawCursor(ctx: CanvasRenderingContext2D, size: number): void {
      if (!this.hover) return;
      let rx = this.hover.x - this.scrollX;
      if (rx < -this.brushRadius - 1) rx += GRID_W;
      const ry = this.hover.y - this.scrollY;
      const r = this.brushRadius;
      const x = (rx - r) * size;
      const y = (ry - r) * size;
      const w = (2 * r + 1) * size;
      if (r > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(x, y, w, w);
        ctx.setLineDash([Math.max(3, size / 3), Math.max(2, size / 5)]);
        ctx.strokeStyle = this.brushColor;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, w - 1.5);
        ctx.setLineDash([]);
      }
      // The tile itself: four corner brackets, dark under light so they read
      // on snow and on deep water alike.
      const a = rx * size + 1;
      const b = ry * size + 1;
      const c = a + size - 2;
      const d = b + size - 2;
      const arm = Math.max(4, Math.round(size * 0.3));
      const brackets = (): void => {
        ctx.beginPath();
        ctx.moveTo(a, b + arm); ctx.lineTo(a, b); ctx.lineTo(a + arm, b);
        ctx.moveTo(c - arm, b); ctx.lineTo(c, b); ctx.lineTo(c, b + arm);
        ctx.moveTo(c, d - arm); ctx.lineTo(c, d); ctx.lineTo(c - arm, d);
        ctx.moveTo(a + arm, d); ctx.lineTo(a, d); ctx.lineTo(a, d - arm);
        ctx.stroke();
      };
      ctx.fillStyle = 'rgba(255,233,166,0.12)';
      ctx.fillRect(a, b, size - 2, size - 2);
      ctx.lineCap = 'square';
      ctx.strokeStyle = 'rgba(6,14,12,0.6)';
      ctx.lineWidth = 4;
      brackets();
      ctx.strokeStyle = '#ffe9a6';
      ctx.lineWidth = 2;
      brackets();
      ctx.lineCap = 'butt';
    }
  }

  /* --------------------------------------------------------------- MapView -- */

  export class MapView {
    mode: MapMode = MapMode.Terrain;
    /** Flat Robinson-ish projection, or the planet as a globe. */
    globe = false;
    /** Longitude offset used when spinning the globe. */
    spin = 0;
    /** Draw the Edit window's viewport as a rectangle. */
    editRect: { x: number; y: number; w: number; h: number } | null = null;
    /** Backing-store resolution as a fraction of the screen's. */
    pixelScale = 1;
    /** Draw stars and black space around the globe, or leave it transparent. */
    space = true;

    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly buffer: HTMLCanvasElement;
    private readonly bufferCtx: CanvasRenderingContext2D;
    private readonly image: ImageData;

    constructor(canvas: HTMLCanvasElement) {
      this.canvas = canvas;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('SimEarth: 2D context unavailable for the Map window');
      this.ctx = ctx;

      this.buffer = document.createElement('canvas');
      this.buffer.width = GRID_W;
      this.buffer.height = GRID_H;
      const bctx = this.buffer.getContext('2d', { willReadFrequently: true });
      if (!bctx) throw new Error('SimEarth: offscreen 2D context unavailable');
      this.bufferCtx = bctx;

      this.image = bctx.createImageData(GRID_W, GRID_H);
      for (let i = 3; i < this.image.data.length; i += 4) this.image.data[i] = 255;
    }

    /** Convert a pointer position to world tile coordinates (flat mode only). */
    tileAt(clientX: number, clientY: number): { x: number; y: number } | null {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const fx = (clientX - rect.left) / rect.width;
      const fy = (clientY - rect.top) / rect.height;
      if (fx < 0 || fy < 0 || fx >= 1 || fy >= 1) return null;
      return {
        x: clamp(Math.floor(fx * GRID_W), 0, GRID_W - 1),
        y: clamp(Math.floor(fy * GRID_H), 0, GRID_H - 1),
      };
    }

    private textureKey = '';

    render(world: WorldState): void {
      if (!fitCanvas(this.canvas, this.pixelScale)) return;

      // The planet texture only changes when the world does; the globe's spin
      // and the viewport box redraw on top of an unchanged texture.
      const key = `${world.ticks}|${this.mode}|${world.revision}`;
      if (key !== this.textureKey) {
        this.textureKey = key;
        const data = this.image.data;
        for (let i = 0; i < TILE_COUNT; i++) {
          const c = mapColor(world, i, this.mode);
          const p = i * 4;
          data[p] = c[0];
          data[p + 1] = c[1];
          data[p + 2] = c[2];
        }
        this.bufferCtx.putImageData(this.image, 0, 0);
        this.globeSrc = null;
      }

      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);

      if (this.globe) {
        this.renderGlobe(ctx, w, h);
      } else {
        ctx.drawImage(this.buffer, 0, 0, GRID_W, GRID_H, 0, 0, w, h);
        this.drawEditRect(ctx, w, h);
      }
    }

    /** A fresh, enlarged image of the whole planet in the current mode. */
    exportImage(world: WorldState, scale = 4): HTMLCanvasElement {
      const data = this.image.data;
      for (let i = 0; i < TILE_COUNT; i++) {
        const c = mapColor(world, i, this.mode);
        const p = i * 4;
        data[p] = c[0];
        data[p + 1] = c[1];
        data[p + 2] = c[2];
      }
      this.bufferCtx.putImageData(this.image, 0, 0);
      this.textureKey = '';
      const out = document.createElement('canvas');
      out.width = GRID_W * scale;
      out.height = GRID_H * scale;
      const ctx = out.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.buffer, 0, 0, out.width, out.height);
      }
      return out;
    }

    /** Orthographic projection — the planet seen from space. */
    private globeSrc: Uint8ClampedArray | null = null;

    private renderGlobe(ctx: CanvasRenderingContext2D, w: number, h: number): void {
      if (!this.globeSrc) this.globeSrc = this.bufferCtx.getImageData(0, 0, GRID_W, GRID_H).data;
      const src = this.globeSrc;
      const out = ctx.createImageData(w, h);
      const dst = out.data;

      const radius = Math.min(w, h) * 0.46;
      const cx = w / 2;
      const cy = h / 2;

      for (let py = 0; py < h; py++) {
        const ny = (py - cy) / radius;
        for (let px = 0; px < w; px++) {
          const nx = (px - cx) / radius;
          const d2 = nx * nx + ny * ny;
          const p = (py * w + px) * 4;
          if (d2 > 1) {
            dst[p + 3] = 0; // outside the disc: leave space black
            continue;
          }
          const nz = Math.sqrt(1 - d2);
          const lat = Math.asin(clamp(-ny, -1, 1));
          const lon = Math.atan2(nx, nz) + this.spin;

          const tx = wrapX(Math.round(((lon / (Math.PI * 2)) + 0.5) * GRID_W));
          const ty = clampY(Math.round((0.5 - lat / Math.PI) * GRID_H));
          const s = (ty * GRID_W + tx) * 4;

          // A touch of terminator shading so it reads as a sphere.
          const shadeK = 0.55 + 0.45 * nz;
          dst[p] = src[s] * shadeK;
          dst[p + 1] = src[s + 1] * shadeK;
          dst[p + 2] = src[s + 2] * shadeK;
          dst[p + 3] = 255;
        }
      }
      ctx.putImageData(out, 0, 0);
      this.decorateGlobe(ctx, w, h, radius, cx, cy);
    }

    private stars: readonly (readonly [number, number, number])[] = [];

    /** Stars behind the disc, a bright rim of atmosphere, sunlight from the upper left. */
    private decorateGlobe(ctx: CanvasRenderingContext2D, w: number, h: number, r: number, cx: number, cy: number): void {
      if (this.stars.length === 0) {
        const rng = new Rng(7);
        this.stars = Array.from({ length: 90 }, () => [rng.next(), rng.next(), rng.chance(0.15) ? 2 : 1] as const);
      }
      // The disc is opaque, so whatever is drawn behind it shows only around it.
      if (this.space) {
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = 'rgba(230,240,255,0.7)';
        const dpr = window.devicePixelRatio || 1;
        for (const [fx, fy, s] of this.stars) ctx.fillRect(Math.round(fx * w), Math.round(fy * h), s * dpr, s * dpr);
        ctx.fillStyle = '#03070b';
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
      }

      const rim = ctx.createRadialGradient(cx, cy, r * 0.93, cx, cy, r * 1.1);
      rim.addColorStop(0, 'rgba(126,206,255,0)');
      rim.addColorStop(0.35, 'rgba(126,206,255,0.5)');
      rim.addColorStop(1, 'rgba(126,206,255,0)');
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.1, 0, Math.PI * 2);
      ctx.fill();

      const sheen = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.45, 0, cx - r * 0.4, cy - r * 0.45, r * 1.1);
      sheen.addColorStop(0, 'rgba(255,255,255,0.18)');
      sheen.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sheen;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    /** The white box showing what the Edit window is looking at. */
    private drawEditRect(ctx: CanvasRenderingContext2D, w: number, h: number): void {
      if (!this.editRect) return;
      const sx = w / GRID_W;
      const sy = h / GRID_H;

      const rw = Math.min(GRID_W, this.editRect.w) * sx;
      const rh = this.editRect.h * sy;
      const ry = this.editRect.y * sy;
      // The viewport can straddle the wrap seam, so draw it in two pieces.
      const rx = this.editRect.x * sx;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = Math.max(2, Math.round(sx * 0.8)) + 2;
      ctx.strokeRect(rx, ry, rw, rh);
      if (this.editRect.x + this.editRect.w > GRID_W) ctx.strokeRect(rx - w, ry, rw, rh);
      ctx.strokeStyle = '#f6f1df';
      ctx.lineWidth = Math.max(2, Math.round(sx * 0.8));
      ctx.strokeRect(rx, ry, rw, rh);
      if (this.editRect.x + this.editRect.w > GRID_W) {
        ctx.strokeRect(rx - w, ry, rw, rh);
      }
    }
  }
}
