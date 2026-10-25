/* =============================================================================
 * Gaia Reborn — the Edit window's base image
 * -----------------------------------------------------------------------------
 * The world under the camera drawn once into an offscreen canvas: shifted on
 * a pan (only the strip that came into view is drawn), stretched while the
 * zoom moves, redrawn in boxes for brush strokes and landscape chunks, and in
 * full when the camera jumps, the layers change or the world has moved on.
 * EditView (editview.ts) draws it each frame and everything animated on top.
 * ========================================================================== */

namespace SE {
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
  /**
   * Brushed tiles are recomposed at most this often (about every second
   * frame at 60 Hz): composing their chunks is most of a stroke frame, and
   * the dissolve (landfade.ts) hides the lower rate.
   */
  const TILE_REDRAW_MS = 45;
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

  /** What the base image reads off the Edit view (editview.ts). */
  export interface BaseView {
    readonly scrollX: number;
    readonly scrollY: number;
    readonly tilePx: number;
    readonly cols: number;
    readonly rows: number;
    readonly layers: { readonly oceans: boolean; readonly biomes: boolean; readonly cities: boolean; readonly life: boolean; readonly events: boolean };
    readonly overlay: Overlay;
    readonly holdWorld: boolean;
  }

  export class BaseImage {
    /** The world drawn once; frames only add what moves on top. */
    readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private baseKey = '';
    /** The world tick the base image shows. */
    baseTick = -1;
    private baseTime = 0;
    dirty = true;
    /** Scroll position the base image was drawn at, for shifting it. */
    private baseScrollX = 0;
    private baseScrollY = 0;
    /** How long the last full redraw took, in ms — sets how often it may run. */
    private drawCost = 0;
    /** Tile size the base image was drawn at, and when the zoom last moved. */
    private baseTilePx = 16;
    zoomedAt = -Infinity;
    /** Tiles to redraw on the next frame without a full redraw: x0, y0, x1, y1 (x may run past the wrap). */
    private dirtyTiles: [number, number, number, number] | null = null;
    /** When brushed tiles were last recomposed. */
    private tilesAt = -Infinity;
    private readonly swap: HTMLCanvasElement;
    private readonly swapCtx: CanvasRenderingContext2D;

    constructor(
      private readonly view: BaseView,
      private readonly tiles: TileCache,
      private readonly regions: BiomeRegions,
      private readonly land: PixelTerrain,
      private readonly cities: CityLayer,
    ) {
      this.canvas = document.createElement('canvas');
      const bctx = this.canvas.getContext('2d');
      if (!bctx) throw new Error('SimEarth: offscreen 2D context unavailable');
      this.ctx = bctx;
      this.swap = document.createElement('canvas');
      const sctx = this.swap.getContext('2d');
      if (!sctx) throw new Error('SimEarth: offscreen 2D context unavailable');
      this.swapCtx = sctx;
    }

    /** The pixel terrain draws the ground; with the Biomes layer off the map shows flat colours as before. */
    get pixelTerrain(): boolean {
      return TERRAIN_STYLE === 'pixel' && this.view.layers.biomes && !this.land.failed;
    }

    private get viewW(): number {
      return this.canvas.width / (window.devicePixelRatio || 1);
    }
    private get viewH(): number {
      return this.canvas.height / (window.devicePixelRatio || 1);
    }

    /** The size of the Edit window's canvas, in device pixels; a new size redraws everything. */
    fit(width: number, height: number): void {
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.dirty = true;
      }
    }

    /** Redraw only tiles [x0, x1] × [y0, y1] on the next frame (a brush changing the ground live). */
    markDirtyTiles(x0: number, y0: number, x1: number, y1: number): void {
      const d = this.dirtyTiles;
      this.dirtyTiles = d ? [Math.min(d[0], x0), Math.min(d[1], y0), Math.max(d[2], x1), Math.max(d[3], y1)] : [x0, y0, x1, y1];
    }

    /**
     * Bring the base image up to date and draw it into `ctx` (the Edit window's
     * canvas), or the stretched last picture while the zoom still moves; true then.
     * `key` names the camera and layer state a full picture is good for.
     */
    paint(ctx: CanvasRenderingContext2D, world: WorldState, dpr: number, key: string, now: number): boolean {
      // While the player is still zooming, stretch the last picture rather
      // than redraw every tile for each wheel notch or pinch step; the real
      // redraw follows as soon as the zoom comes to rest.
      const sameButZoom = key.slice(key.indexOf('|')) === this.baseKey.slice(this.baseKey.indexOf('|'));
      const previewing = !this.dirty && sameButZoom && this.view.tilePx !== this.baseTilePx && now - this.zoomedAt < ZOOM_SETTLE_MS;
      if (previewing) {
        this.drawZoomPreview(ctx, dpr);
      } else {
        // A full redraw on a huge screen can take tens of milliseconds; the
        // slower it is, the less often the world's progress triggers one.
        const interval = Math.max(250, this.drawCost * 8);
        // Composing on the page ran out of time last frame: finish it now, not a frame later.
        if (this.pixelTerrain && this.land.pending) this.dirty = true;
        const worldMoved = !this.view.holdWorld && world.ticks !== this.baseTick && now - this.baseTime > interval;
        const scrolled = this.view.scrollX !== this.baseScrollX || this.view.scrollY !== this.baseScrollY;
        if (this.dirty || key !== this.baseKey || worldMoved || (scrolled && !this.shiftBase(world, dpr))) {
          const t0 = performance.now();
          const box = this.dirtyTiles;
          if (box && this.pixelTerrain) this.land.refreshBox(world, this.view.layers.oceans, box[0], Math.max(0, box[1]), box[2], Math.min(GRID_H - 1, box[3]));
          this.dirtyTiles = null;
          // The full redraw draws the worker's latest pictures and asks for every chunk out of date (with a field just taken over).
          this.land.takeFresh();
          this.land.refetch = false;
          this.drawBase(world, dpr);
          this.drawCost = performance.now() - t0;
          perfHud.drawBase(this.drawCost);
          this.baseKey = key;
          this.baseTick = world.ticks;
          this.baseTime = now;
          this.baseScrollX = this.view.scrollX;
          this.baseScrollY = this.view.scrollY;
          this.baseTilePx = this.view.tilePx;
          this.dirty = false;
        } else {
          // Brushed ground dissolving into its new picture (landfade.ts) is redrawn every frame until done.
          // Not when the world changed meanwhile (a settle): drawing would re-read the whole field; its full redraw follows.
          const fade = this.pixelTerrain && this.land.current(world, this.view.layers.oceans) ? this.land.fadeBox() : null;
          // Brushed tiles are re-read and recomposed (most of a stroke frame) at most every
          // TILE_REDRAW_MS; the dissolve keeps moving on the frames between.
          const changed = now - this.tilesAt >= TILE_REDRAW_MS ? this.dirtyTiles : null;
          // A slow field read leaves the drawing (composing chunks, as slow) to the next frame.
          if ((changed || fade) && this.redrawTiles(world, dpr, changed, fade) && changed) {
            this.dirtyTiles = null;
            this.tilesAt = now;
          }
          if (this.pixelTerrain) {
            // The landscape worker's pictures: each chunk redrawn alone as it arrives; after a new field, its chunks asked for.
            for (const box of this.land.takeFresh()) this.redrawChunk(world, dpr, box);
            if (this.land.refetch) {
              this.land.refetch = false;
              this.land.want({ scrollX: this.view.scrollX, scrollY: this.view.scrollY, tilePx: this.view.tilePx, dpr }, 0, 0, this.canvas.width, this.canvas.height);
            }
          }
        }
        // The terrain or the cities ran out of time for composing: finish next frame.
        if ((this.pixelTerrain && this.land.pending) || this.cities.pending) this.dirty = true;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(this.canvas, 0, 0);
      }
      return previewing;
    }

    /**
     * Redraw a box of changed tiles into the base picture, with the margin a
     * tile's picture reads its neighbours from, together with the box `more`
     * of tiles to draw again without re-reading them.
     */
    /** One chunk the landscape worker delivered: its tiles and one around (the art's overlap), drawn as composed, nothing asked for. */
    private redrawChunk(world: WorldState, dpr: number, box: readonly [number, number, number, number]): void {
      const size = this.view.tilePx;
      let rx = (((box[0] - 1 - this.view.scrollX) % GRID_W) + GRID_W) % GRID_W;
      if (rx > this.view.cols) rx -= GRID_W;
      const span = box[2] - box[0] + 3;
      if (rx + span < 0 || rx > this.view.cols) return;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.ctx.imageSmoothingEnabled = false;
      this.drawLandRegion(world, rx * size, (box[1] - 1 - this.view.scrollY) * size, (rx + span) * size, (box[3] + 2 - this.view.scrollY) * size, false);
    }

    private redrawTiles(world: WorldState, dpr: number, changed: readonly [number, number, number, number] | null,
      more: readonly [number, number, number, number] | null = null): boolean {
      const pad = 4; // SIGNATURE_REACH (landfield.ts) + 1
      if (changed && this.pixelTerrain && this.land.refreshBox(world, this.view.layers.oceans, changed[0], Math.max(0, changed[1]), changed[2], Math.min(GRID_H - 1, changed[3]))) return false;
      let box = changed ?? more;
      if (!box) return true;
      if (changed && more) {
        const s = Math.round((changed[0] - more[0]) / GRID_W) * GRID_W;
        box = [Math.min(changed[0], more[0] + s), Math.min(changed[1], more[1]), Math.max(changed[2], more[2] + s), Math.max(changed[3], more[3])];
      }
      const span = box[2] - box[0] + 1 + 2 * pad;
      if (span > GRID_W / 2) {
        this.drawBase(world, dpr);
        return true;
      }
      const size = this.view.tilePx;
      // The copy of the box on the wrapping map that meets the view.
      let rx = (((box[0] - pad - this.view.scrollX) % GRID_W) + GRID_W) % GRID_W;
      if (rx > this.view.cols) rx -= GRID_W;
      if (!this.pixelTerrain) {
        this.tiles.setDeviceTile(size * dpr);
        this.regions.refresh(world);
      }
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.ctx.imageSmoothingEnabled = false;
      this.drawRegion(world, rx * size, (box[1] - pad - this.view.scrollY) * size, (rx + span) * size, (box[3] + 1 + pad - this.view.scrollY) * size);
      return true;
    }

    /** The last full picture, scaled and moved to where the new zoom puts it. */
    private drawZoomPreview(ctx: CanvasRenderingContext2D, dpr: number): void {
      const k = this.view.tilePx / this.baseTilePx;
      const span = GRID_W * this.view.tilePx;
      let dx = (this.baseScrollX - this.view.scrollX) * this.view.tilePx;
      if (dx > span / 2) dx -= span;
      if (dx < -span / 2) dx += span;
      const dy = (this.baseScrollY - this.view.scrollY) * this.view.tilePx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#05090c';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.imageSmoothingEnabled = false;
      // Zooming out shrinks the last picture: flat tile colours fill the rest
      // until the real redraw, instead of empty space.
      const flat = k < 1 && this.pixelTerrain ? this.land.overview() : null;
      if (flat) {
        const T = this.view.tilePx * dpr;
        const w = GRID_W * T;
        for (let x = -((((this.view.scrollX * T) % w) + w) % w); x < this.canvas.width; x += w) {
          ctx.drawImage(flat, x, -this.view.scrollY * T, w, GRID_H * T);
        }
      }
      ctx.drawImage(this.canvas, dx * dpr, dy * dpr, this.canvas.width * k, this.canvas.height * k);
    }

    /**
     * Pan by moving the last image and drawing only the strip that came into
     * view. Returns false when the jump is too large to be worth it.
     */
    private shiftBase(world: WorldState, dpr: number): boolean {
      const size = this.view.tilePx;
      let dxT = this.view.scrollX - this.baseScrollX;
      if (dxT > GRID_W / 2) dxT -= GRID_W;
      if (dxT < -GRID_W / 2) dxT += GRID_W;
      const dyT = this.view.scrollY - this.baseScrollY;
      const dx = dxT * size;
      const dy = dyT * size;
      const w = this.viewW;
      const h = this.viewH;
      if (Math.abs(dx) >= w * 0.5 || Math.abs(dy) >= h * 0.5) return false;
      this.tiles.setDeviceTile(size * dpr);
      this.regions.refresh(world);

      // Assigning a canvas size clears it and resets its context even when the
      // size is unchanged. No clear is needed: the base is opaque everywhere
      // (drawBase and the fill below paint it first), so it covers the old
      // swap content. 'copy' instead measured as slow as the reset in Chrome.
      if (this.swap.width !== this.canvas.width || this.swap.height !== this.canvas.height) {
        this.swap.width = this.canvas.width;
        this.swap.height = this.canvas.height;
      }
      this.swapCtx.drawImage(this.canvas, 0, 0);
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#05090c';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.drawImage(this.swap, Math.round(-dx * dpr), Math.round(-dy * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (dx > 0) this.drawRegion(world, w - dx - size, 0, w, h);
      else if (dx < 0) this.drawRegion(world, 0, 0, -dx + size, h);
      if (dy > 0) this.drawRegion(world, 0, h - dy - size, w, h);
      else if (dy < 0) this.drawRegion(world, 0, 0, w, -dy + size);

      this.baseScrollX = this.view.scrollX;
      this.baseScrollY = this.view.scrollY;
      return true;
    }

    /** Redraw every tile overlapping a rectangle of the view (CSS pixels). */
    private drawRegion(world: WorldState, x0: number, y0: number, x1: number, y1: number): void {
      if (this.pixelTerrain) {
        this.drawLandRegion(world, x0, y0, x1, y1);
        return;
      }
      const ctx = this.ctx;
      const size = this.view.tilePx;
      const tx0 = Math.floor(this.view.scrollX);
      const ty0 = Math.floor(this.view.scrollY);
      const ox = (this.view.scrollX - tx0) * size;
      const oy = (this.view.scrollY - ty0) * size;
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
          if (this.view.overlay !== Overlay.None) this.drawOverlayTile(ctx, world, i, wx, wy, px, py, size);
        }
      }
      this.drawCities(world, c0 * size - ox, r0 * size - oy, (c1 + 1) * size - ox, (r1 + 1) * size - oy);
    }

    private drawBase(world: WorldState, dpr: number): void {
      this.tiles.setDeviceTile(this.view.tilePx * dpr);
      this.regions.refresh(world);
      const ctx = this.ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#05090c';
      ctx.fillRect(0, 0, this.viewW, this.viewH);
      if (this.pixelTerrain) {
        this.drawLandRegion(world, 0, 0, this.viewW, this.viewH);
        return;
      }

      const size = this.view.tilePx;
      const x0 = Math.floor(this.view.scrollX);
      const y0 = Math.floor(this.view.scrollY);
      const ox = (this.view.scrollX - x0) * size;
      const oy = (this.view.scrollY - y0) * size;
      const cols = Math.ceil(this.view.cols) + 1;
      const rows = Math.ceil(this.view.rows) + 1;

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

      if (this.view.overlay !== Overlay.None) this.drawOverlay(ctx, world, size, x0, y0, ox, oy, cols, rows);
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
      if (water && !this.view.layers.oceans) {
        ctx.fillStyle = depthStyleAt(depthStep(world.elevation[i]));
        ctx.fillRect(px, py, size, size);
      } else if (water && biome !== Biome.Arctic) {
        ctx.drawImage(tiles.sea(biome === Biome.Coast, variant), px, py, size, size);
        const shore = shoreMask(world, i % GRID_W, (i / GRID_W) | 0);
        if (shore !== 0) ctx.drawImage(tiles.surf(shore), px, py, size, size);
      } else if (this.view.layers.biomes) {
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
      if (this.view.layers.biomes && (!water || this.view.layers.oceans)) {
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
      if (level > 0 && this.view.layers.oceans) {
        const mask = RiverSystem.connectionMask(world, i % GRID_W, (i / GRID_W) | 0);
        ctx.drawImage(tiles.river(level >= 0.6 ? 1 : 0, mask), px, py, size, size);
        if (this.view.layers.biomes && (world.flora[i] & floraBit(Flora.FreshwaterAlgae)) !== 0) {
          ctx.drawImage(tiles.riverAlgae(), px, py, size, size);
        }
      }

      this.drawTileTop(ctx, world, i, px, py, size);
    }

    /** What happens on a tile: its event (cities are a layer of their own, see drawCities). */
    private drawTileTop(ctx: CanvasRenderingContext2D, world: WorldState, i: number, px: number, py: number, size: number): void {
      if (this.view.layers.events && world.eventTtl[i] > 0) {
        ctx.drawImage(this.tiles.event(world.eventKind[i] as EventKind), px, py, size, size);
      }
    }

    /**
     * The city layer over every tile overlapping a rectangle of the view (CSS
     * pixels), scaled like the pixel terrain; it also draws the cities of the
     * row below, whose tops reach into the rectangle.
     */
    private drawCities(world: WorldState, x0: number, y0: number, x1: number, y1: number): void {
      if (!this.view.layers.cities) return;
      const dpr = window.devicePixelRatio || 1;
      const size = this.view.tilePx;
      const T = size * dpr;
      const txA = Math.floor(this.view.scrollX + x0 / size);
      const txB = Math.ceil(this.view.scrollX + x1 / size);
      const tyA = Math.max(0, Math.floor(this.view.scrollY + y0 / size));
      const tyB = Math.min(GRID_H, Math.ceil(this.view.scrollY + y1 / size));
      if (txB <= txA || tyB <= tyA) return;
      this.land.ensure(world);
      const ctx = this.ctx;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.cities.draw(ctx, { scrollX: this.view.scrollX, scrollY: this.view.scrollY, tilePx: size, dpr }, world, this.land.field,
        (txA - this.view.scrollX) * T, (tyA - this.view.scrollY) * T, (txB - this.view.scrollX) * T, (tyB - this.view.scrollY) * T);
      ctx.restore();
    }

    /**
     * The pixel terrain over every tile overlapping a rectangle of the view
     * (CSS pixels), then cities, events and the climate overlay on top.
     */
    private drawLandRegion(world: WorldState, x0: number, y0: number, x1: number, y1: number, ask = true): void {
      const ctx = this.ctx;
      const dpr = window.devicePixelRatio || 1;
      const size = this.view.tilePx;
      const T = size * dpr;
      const txA = Math.floor(this.view.scrollX + x0 / size);
      const txB = Math.ceil(this.view.scrollX + x1 / size);
      const tyA = Math.max(0, Math.floor(this.view.scrollY + y0 / size));
      const tyB = Math.min(GRID_H, Math.ceil(this.view.scrollY + y1 / size));
      if (txB <= txA || tyB <= tyA) return;
      const land = this.land;
      land.refresh(world, this.view.layers.oceans);
      const cam: LandCamera = { scrollX: this.view.scrollX, scrollY: this.view.scrollY, tilePx: size, dpr };
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (land.ready) {
        land.draw(ctx, cam, (txA - this.view.scrollX) * T, (tyA - this.view.scrollY) * T, (txB - this.view.scrollX) * T, (tyB - this.view.scrollY) * T, ask);
        this.drawCities(world, x0, y0, x1, y1);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      for (let ty = tyA; ty < tyB; ty++) {
        const py = Math.round((ty - this.view.scrollY) * size);
        for (let tx = txA; tx < txB; tx++) {
          const px = Math.round((tx - this.view.scrollX) * size);
          const i = idx(wrapX(tx), ty);
          // Until the atlas has decoded (a few milliseconds), flat colours.
          if (!land.ready) {
            ctx.fillStyle = rgbCss(mapColor(world, i, MapMode.Biomes));
            ctx.fillRect(px, py, size, size);
          }
          this.drawTileTop(ctx, world, i, px, py, size);
          if (this.view.overlay !== Overlay.None) this.drawOverlayTile(ctx, world, i, wrapX(tx), ty, px, py, size);
        }
      }
    }

    /** Climate overlays: a translucent wash, or arrows for the flow fields. */
    private drawOverlay(
      ctx: CanvasRenderingContext2D, world: WorldState, size: number,
      x0: number, y0: number, ox: number, oy: number, cols: number, rows: number,
    ): void {
      const isFlow = this.view.overlay === Overlay.Winds || this.view.overlay === Overlay.SeaFlow;
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
      if (this.view.overlay === Overlay.Winds || this.view.overlay === Overlay.SeaFlow) {
        const stride = Math.max(1, Math.ceil(22 / size));
        if (wx % stride !== Math.floor(stride / 2) || wy % stride !== Math.floor(stride / 2)) return;
        if (this.view.overlay === Overlay.SeaFlow && !world.isWater(i)) return;
        const c = this.view.overlay === Overlay.Winds ? ClimateSystem.airCurrent(wy) : ClimateSystem.oceanCurrent(wx, wy);
        this.drawArrow(ctx, px, py, size, c.dx, c.dy);
        return;
      }
      let color: Rgb | null = null;
      switch (this.view.overlay) {
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
      const len = size * 0.32 / Math.hypot(dx, dy);
      ctx.beginPath();
      traceFlowArrow(ctx, cx - dx * len, cy - dy * len, cx + dx * len, cy + dy * len, size * 0.22);
      ctx.strokeStyle = 'rgba(5,15,24,0.85)';
      ctx.lineWidth = Math.max(3, size / 14 + 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(1, size / 14);
      ctx.stroke();
    }
  }
}
