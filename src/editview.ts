/* =============================================================================
 * Gaia Reborn — the Edit window's map view
 * -----------------------------------------------------------------------------
 * EditView  a scrollable, zoomed tile view drawn from pixel sprites, with the
 *           five additive data layers and six exclusive climate overlays: the
 *           cached world picture (editbase.ts), and every frame what moves on it.
 * ========================================================================== */

namespace SE {
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
    /** Drawn instead of the tool cursor, last, with identity transform (device pixels). */
    decor: ((ctx: CanvasRenderingContext2D, cam: LandCamera, now: number) => void) | null = null;
    /** A brush stroke runs: the world's progress waits with its full redraws (30–100 ms) until it ends. */
    holdWorld = false;

    static readonly MIN_TILE = 10;
    static readonly MAX_TILE = 48;

    private readonly tiles = new TileCache();
    private readonly regions = new BiomeRegions();
    private readonly ambient = new AmbientLayer();
    private readonly waterMotion = new WaterMotion();
    private readonly reefSwell = new ReefSwell();
    /** Caustics and glint, experimental and off unless switched on (waterfx.ts). */
    readonly waterFx = new WaterFx();
    /**
     * Pins the clock of everything animated on the map, ms on performance.now()'s scale
     * (screenshots and comparisons: `?animclock=<ms>`, or set it); null lets them run.
     */
    animClock: number | null = typeof location !== 'undefined' && /[?&]animclock=\d/.test(location.search)
      ? Number(new URLSearchParams(location.search).get('animclock')) : null;
    private readonly clownfish = new ClownfishLayer();
    private readonly herds = new HerdLayer();
    private readonly whales = new WhaleLayer();
    private readonly dolphins = new DolphinLayer();
    private readonly sharks = new SharkLayer();
    /** The oil platform and the desert derrick of the Industrial age (oillayer.ts). */
    private readonly oilRigs = new OilRigLayer();
    private readonly spaceport = new SpaceportLayer();
    /** World wonders, the train and the ships of the civilization (docs/bewegung-2026-10). */
    private readonly wonders = new WonderLayer();
    private readonly trains = new TrainLayer();
    private readonly ships = new ShipLayer();
    /** The termite mound on the savanna, once ants live there (termitelayer.ts). */
    private readonly termites = new TermiteLayer();
    /** The kapok tree in the largest rainforest (kapoklayer.ts). */
    private readonly kapok = new KapokLayer();
    private readonly salmon = new SalmonLayer();
    private readonly storks = new StorkLayer();
    private readonly bubbles = new OxygenBubbles();
    private readonly cities = new CityLayer();
    private readonly settlers = new SettlerLayer();
    /** Wandering groups on the move (bandlayer.ts); their camps are part of `cities`. */
    private readonly bands = new BandLayer();
    /** Flames over the fire places and smoke over the chimneys, every frame (cityfire.ts). */
    private readonly cityFires = new CityFireLayer();
    /** Disasters: omens, eruptions, lava, smoke (docs/ereignisse-spec.md). */
    readonly fx = new EffectLayer();
    /** How far the game is between two ticks, 0..1 (app.ts); kept while paused. */
    tickPhase = 0;
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly land = PixelTerrain.shared();
    /** The world drawn once; frames only add what moves on top (editbase.ts). */
    private readonly baseImage: BaseImage;
    /** How the camera actually moved lately, for the landscape asked for ahead of it (landahead.ts). */
    private readonly motion = new CameraMotion();
    private motionSeed = NaN;
    /** Sea ice calving off the pack edge now and then (icecalving.ts). */
    private readonly calving = new IceCalving(this.land);

    constructor(canvas: HTMLCanvasElement) {
      this.canvas = canvas;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('SimEarth: 2D context unavailable for the Edit window');
      this.ctx = ctx;
      this.baseImage = new BaseImage(this, this.tiles, this.regions, this.land, this.cities);
      if (TERRAIN_STYLE === 'pixel') this.land.whenReady(() => this.markDirty());
      // `?sprites=page` keeps creature pictures on the page, for measuring (tools/perf-bench.js).
      if (typeof location === 'undefined' || !/[?&]sprites=page(&|$)/.test(location.search)) this.tiles.remote = () => this.land.sprites;
      this.cities.whenReady(() => this.markDirty());
      this.calving.occupied = (i) => this.layers.life && this.herds.markerOn(i) !== null;
    }

    /** "Effekte reduzieren": disasters without shaking or flashes, and still water. */
    get reduceEffects(): boolean {
      return this.waterMotion.still;
    }

    set reduceEffects(on: boolean) {
      this.fx.reduce = on;
      this.waterMotion.still = on;
      this.reefSwell.still = on;
      this.waterFx.still = on;
      this.clownfish.still = on;
      this.whales.still = on;
      this.dolphins.still = on;
      this.sharks.still = on;
      this.oilRigs.still = on;
      this.spaceport.still = on;
      this.wonders.still = on;
      this.trains.still = on;
      this.ships.still = on;
      this.settlers.still = on;
      this.termites.still = on;
      this.salmon.still = on;
      this.storks.still = on;
      this.bubbles.still = on;
      this.calving.still = on;
      this.cityFires.still = on;
    }

    /** Make sure a creature of sub-species (c, stage) stands on the map; its tile, -1 if none lives. */
    pinSpecies(world: WorldState, c: Life, stage: number): number {
      this.markDirty();
      return this.herds.pin(world, c, stage);
    }

    /** The creature the map shows on tile i, for the Examine picture: `key` is cheap, `draw` makes its 32 px sprite. */
    creatureOn(world: WorldState, i: number): { key: string; draw: () => HTMLCanvasElement } | null {
      const m = this.layers.life ? this.herds.markerOn(i) : null;
      if (!m) return null;
      const stage = reefShownStage(world, i, m.c, m.stage);
      const special = animalSpecialist(this.regions, world, i, m.c, stage);
      const sp = SPECIES[m.c];
      const art = special >= 0 ? sp?.specialists[special]?.art : sp?.stages[stage]?.art;
      if (!art) return null;
      return { key: `${m.c}:${stage}:${special}:${+m.flip}`, draw: () => rasterArt(art, 32, CREATURE_LOOK, m.flip, true) };
    }

    /** The salmon run, clownfish or stork flight in sight on or by tile i, for the Examine tool. */
    migrationOn(world: WorldState, i: number): Migration | null {
      if (!this.layers.life) return null;
      const now = performance.now();
      if (this.salmon.activeOn(world, this.land, i, now)) return 'salmon';
      if (this.clownfish.activeOn(world, i, now)) return 'clownfish';
      return this.storks.activeNear(i, now) >= 0 ? 'storks' : null;
    }

    /** Force a full redraw on the next frame (after a tool changed the world). */
    markDirty(): void {
      this.baseImage.dirty = true;
    }

    /** Read the world into the terrain field and regions now, so the next full redraw has less to do. */
    warm(world: WorldState): void {
      if (this.pixelTerrain) this.land.refresh(world, this.layers.oceans);
      this.regions.refresh(world);
    }

    /** Redraw only tiles [x0, x1] × [y0, y1] on the next frame (a brush changing the ground live). */
    markDirtyTiles(x0: number, y0: number, x1: number, y1: number): void {
      this.baseImage.markDirtyTiles(x0, y0, x1, y1);
    }

    private get pixelTerrain(): boolean {
      return this.baseImage.pixelTerrain;
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
      // A jump, not motion: nothing is asked for ahead in its direction.
      this.motion.reset();
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
      this.baseImage.zoomedAt = performance.now();
      this.scrollX = wx - px / next;
      this.scrollY = wy - py / next;
      this.clampScroll();
    }

    /**
     * Set the zoom around the viewport's centre, fractions allowed: frames
     * stretch the last full picture as during a wheel zoom, so a glide called
     * every frame stays smooth; the real redraw follows once it rests.
     */
    glideZoom(px: number): void {
      const cx = this.scrollX + this.cols / 2;
      const cy = this.scrollY + this.rows / 2;
      this.tilePx = px;
      this.baseImage.zoomedAt = performance.now();
      this.scrollX = cx - this.cols / 2;
      this.scrollY = cy - this.rows / 2;
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
      this.baseImage.fit(this.canvas.width, this.canvas.height);
      this.clampScroll();

      // The view is redrawn when the camera or the layers change, and when the
      // world has moved on — but the world part at most four times a second:
      // nothing on a tile map changes visibly faster, and at the fastest speed
      // redrawing every tile on every tick was most of the frame.
      const key = `${this.tilePx}|${this.overlay}|${this.canvas.width}x${this.canvas.height}|` +
        `${+this.layers.oceans}${+this.layers.biomes}${+this.layers.cities}${+this.layers.life}${+this.layers.events}`;
      const now = performance.now();
      const ctx = this.ctx;
      const previewing = this.baseImage.paint(ctx, world, dpr, key, now);

      const cam: LandCamera = { scrollX: this.scrollX, scrollY: this.scrollY, tilePx: this.tilePx, dpr };
      // Animations run on their own clock, which a test may pin; the camera and the redraw logic keep real time.
      const t = this.animClock ?? now;
      if (this.pixelTerrain) {
        if (world.seed !== this.motionSeed) {
          this.motion.reset();
          this.motionSeed = world.seed;
        }
        this.motion.sample(this.scrollX, this.scrollY, this.tilePx, now, this.cols, this.rows);
        this.land.frame(cam, this.canvas.width, this.canvas.height, this.motion, now);
      }
      const fx = this.layers.events && this.pixelTerrain && this.land.ready ? this.fx : null;
      const cities = (x0: number, y0: number, x1: number, y1: number): void => {
        if (this.layers.cities) this.cities.draw(ctx, cam, world, this.land.field, x0, y0, x1, y1);
      };
      if (this.pixelTerrain && !previewing) {
        // Right over the cached terrain: the surf, the swell and all that stands or moves on the sea stay on top.
        this.waterFx.draw(ctx, cam, this.cols, this.rows, world, this.land, this.layers, this.overlay !== Overlay.None, t);
        this.waterMotion.draw(ctx, cam, this.cols, this.rows, world, this.land, this.layers.oceans, t);
        this.reefSwell.draw(ctx, cam, this.cols, this.rows, world, this.land, this.layers.oceans, t);
        // Over the swell: a crest paints the composed sea's colour and would cut holes into a fish.
        if (this.layers.life) this.clownfish.draw(ctx, cam, this.cols, this.rows, world, this.land, t);
        // Under the creatures, so an animal near a calving stays on top.
        if (this.layers.oceans) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          this.calving.draw(ctx, cam, t);
        }
        if (this.layers.life) this.salmon.draw(ctx, cam, this.cols, this.rows, world, this.land, t);
      }
      if (!fx) this.fx.show.flush(world);
      // Only a finished base counts: while the terrain is still composing it shows older ground.
      if (!this.land.pending && !this.land.composing) this.fx.baseTick = this.baseImage.baseTick;
      if (fx) {
        fx.update(world, cam, this.cols, this.rows, t, this.tickPhase);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (!previewing) fx.drawShake(ctx, this.baseImage.canvas, cam, t);
        fx.drawGround(ctx, world, cam, this.land, t, cities);
      }
      // Under the creatures and settlers, so a boat or a herd passes in front of a rig or a camp.
      if (this.layers.cities) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.cities.drawCamps(ctx, cam, world, this.land.field, this.cols, this.rows);
        this.cityFires.draw(ctx, cam, world, this.land.field, this.cities, this.cols, this.rows, t);
        this.oilRigs.draw(ctx, cam, world, t);
        this.spaceport.draw(ctx, cam, world, t);
        this.wonders.draw(ctx, cam, world, this.land.field, t);
        this.trains.draw(ctx, cam, world, this.land.field, t);
        this.ships.draw(ctx, cam, world, t, this.cities);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (this.layers.life) {
        this.herds.update(world, t);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.termites.draw(ctx, cam, world, t);
        this.bubbles.draw(ctx, cam, this.cols, this.rows, world, t);
        this.whales.draw(ctx, cam, this.herds.markers, world, this.land, t, this.regions);
        this.dolphins.draw(ctx, cam, this.herds.markers, world, t);
        this.sharks.draw(ctx, cam, this.herds.markers, world, t);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.herds.draw(ctx, this, world, t, this.tiles, this.regions,
          (m) => this.whales.claims(m, world, this.tilePx, this.regions) || this.dolphins.claims(m, world, this.tilePx));
      }
      if (this.layers.cities) {
        this.settlers.draw(ctx, this, world, t, dpr, this.cities);
        this.bands.draw(ctx, this, world, t, dpr);
      }
      // Over the creatures and settlers: the crown hides the tile behind it, so nothing there may show through.
      if (this.pixelTerrain) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.kapok.draw(ctx, cam, world);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      if (fx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        fx.drawObjects(ctx, world, cam, this.land, cities);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      if (this.layers.life) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.storks.draw(ctx, cam, this.cols, this.rows, world, t);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      if (this.layers.cities) drawCityNames(ctx, this, world);
      this.ambient.draw(ctx, this, world, t, this.layers.oceans, this.layers.clouds);
      if (fx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        fx.drawTop(ctx, cam);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      if (this.decor) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.decor(ctx, cam, t);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      } else {
        this.drawCursor(ctx, this.tilePx);
      }
      // Creature pictures of a new size: asked of the landscape worker, a few per frame (tilecache.ts).
      this.tiles.flush();
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

    /**
     * How loud the oxygen bubbling should be, 0..1: how much pearls in view,
     * times the zoom squared, silent fully zoomed out and full fully zoomed
     * in. Squared because loudness is heard on a log scale: each zoom step
     * then sounds about as much louder as the last.
     */
    bubblePresence(): number {
      if (!this.layers.life) return 0;
      const zoom = clamp((this.tilePx - EditView.MIN_TILE) / (EditView.MAX_TILE - EditView.MIN_TILE), 0, 1);
      return this.bubbles.presence() * zoom * zoom;
    }

    /**
     * How loud a hurricane's wind should be, 0..1: the strongest storm the
     * effect layer drew in view (fxstorm.ts) in the last half second, softer
     * zoomed out but still heard: a storm is a big sound.
     */
    stormPresence(now: number): number {
      if (!this.layers.events || now - STORM_SOUND.at > 500) return 0;
      const zoom = clamp((this.tilePx - EditView.MIN_TILE) / (EditView.MAX_TILE - EditView.MIN_TILE), 0, 1);
      return STORM_SOUND.presence * (0.35 + 0.65 * zoom);
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
}
