/* =============================================================================
 * SimEarth 2.0 — renderers
 * -----------------------------------------------------------------------------
 * Map colours shared by both views (ramps, mapColor, fitCanvas, thumbnails).
 * EditView  the scrollable, zoomed tile view: editview.ts.
 * MapView   the whole planet at a glance in any of the twelve map modes, flat
 *           and on a globe turned to the Edit Window's viewport, which both outline.
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

  const canvasBoxes = new WeakMap<HTMLCanvasElement, { width: number; height: number }>();
  let canvasSizer: ResizeObserver | null = null;

  /**
   * A canvas's CSS box, kept current by a ResizeObserver. Reading it with
   * getBoundingClientRect every frame forced a synchronous layout after each
   * DOM write of the frame (10 % of the main thread in the biosphere
   * scenario, tools/perf-bench.js).
   */
  function cssSize(canvas: HTMLCanvasElement): { width: number; height: number } {
    let box = canvasBoxes.get(canvas);
    if (box) return box;
    const r = canvas.getBoundingClientRect();
    if (typeof ResizeObserver === 'undefined') return r;
    box = { width: r.width, height: r.height };
    canvasBoxes.set(canvas, box);
    canvasSizer ??= new ResizeObserver((entries) => {
      for (const e of entries) {
        const b = canvasBoxes.get(e.target as HTMLCanvasElement);
        if (!b) continue;
        const size = e.borderBoxSize?.[0];
        b.width = size ? size.inlineSize : e.contentRect.width;
        b.height = size ? size.blockSize : e.contentRect.height;
      }
    });
    canvasSizer.observe(canvas);
    return box;
  }

  /**
   * Resize a canvas's backing store to its CSS box, in device pixels — or a
   * fraction of them, for a deliberately chunky picture.
   */
  export function fitCanvas(canvas: HTMLCanvasElement, scale = 1): boolean {
    const rect = cssSize(canvas);
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
  export const RIVER_MAP_COLOR: Rgb = [70, 150, 235];
  /** Land on the seafloor map: one flat ground colour, so the whole scale is spent on depth. */
  export const SEAFLOOR_LAND_COLOR: Rgb = [110, 104, 94];

  /* --------------------------------------------------------- relief shading -- */

  /** Brightness factor from the slope across a land tile, light from the north-west. */
  function reliefFactor(world: WorldState, i: number): number {
    const e = world.elevation;
    const x = i % GRID_W;
    const y = (i / GRID_W) | 0;
    const slope = Math.max(0, e[idx(wrapX(x - 1), y)]) - Math.max(0, e[idx(wrapX(x + 1), y)]) +
      Math.max(0, e[idx(x, clampY(y - 1))]) - Math.max(0, e[idx(x, clampY(y + 1))]);
    return 1 + clamp(slope * 1.4, -0.3, 0.3);
  }

  /**
   * Colour of a tile in a given map mode, with relief on the surface modes.
   * `hidden` is a bit mask of switched-off categories: biomes on the habitat
   * map, life classes on the life map (bit 0 there: the faint plant cover),
   * eras on the technology map.
   */
  export function mapColor(world: WorldState, i: number, mode: MapMode, hidden = 0): Rgb {
    const flat = flatMapColor(world, i, mode, hidden);
    switch (mode) {
      case MapMode.Terrain:
      case MapMode.Biomes:
      case MapMode.Technology:
        return world.isWater(i) || world.riverLevel[i] > 0 ? flat : shade(flat, reliefFactor(world, i));
      default:
        return flat;
    }
  }

  function flatMapColor(world: WorldState, i: number, mode: MapMode, hidden: number): Rgb {
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
        // "Hide oceans" — the bare crust under the sea, coloured by its depth.
        return water ? sampleRamp(DEPTH_RAMP, world.elevation[i]) : SEAFLOOR_LAND_COLOR;

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
        return windMapColor(world, i);
      }

      case MapMode.Biomes:
        // The sea in the main map's two classes: no depth.
        if (hidden & (1 << world.biome[i])) return water ? [16, 24, 48] : [34, 30, 26];
        return BIOME_COLORS[world.biome[i]];

      case MapMode.LifeMap: {
        // The overview map stays area-filling on purpose: it answers "where is
        // this species", which is exactly what the sparse Edit view cannot.
        // Where no animal lives, the leading plant group shows faintly.
        let c = world.dominantLife[i] as Life;
        if (c !== Life.None && hidden & (1 << c)) {
          // A hidden leader hands the tile to the densest class still shown.
          let best = 0;
          c = Life.None;
          for (let k = 1; k < LIFE_COUNT; k++) {
            const d = world.density(i, k);
            if (d > best && !(hidden & (1 << k))) { best = d; c = k; }
          }
        }
        if (c === Life.None) {
          const g = world.floraTop[i] as Flora;
          if (!(hidden & 1) && !water && g !== Flora.None && world.vegetation[i] > 0.05) return shade(FLORA[g].color, 0.55);
          return water ? [16, 24, 48] : [34, 30, 26];
        }
        const hue = LIFE[c].color;
        const k = 0.35 + 0.65 * clamp(world.tileBiomass[i], 0, 1);
        return [hue[0] * k, hue[1] * k, hue[2] * k];
      }

      case MapMode.Technology: {
        const t = world.tech[i];
        if (t === Tech.None || hidden & (1 << t)) return water ? [16, 24, 48] : [34, 30, 26];
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

  /* --------------------------------------------------------------- MapView -- */

  /** How long a news spot pulses on the overview, and one ring's cycle. */
  const NEWS_PING_MS = 20000;
  const NEWS_PULSE_MS = 1400;
  const NEWS_PINGS_MAX = 24;
  const CITY_RIM: Rgb = [10, 14, 12];
  /** Radians the globe may still be off the viewport and count as turned: under a pixel on its disc. */
  const GLOBE_SETTLED = 0.003;

  export class MapView {
    mode: MapMode = MapMode.Terrain;
    /** Longitude at the globe's centre. */
    spin = 0;
    /** Latitude at the globe's centre. */
    tilt = 0;
    /** Draw the Edit window's viewport as a rectangle. */
    editRect: { x: number; y: number; w: number; h: number } | null = null;
    /** Backing-store resolution as a fraction of the screen's. */
    pixelScale = 1;
    /** Draw stars and black space around the globe, or leave it transparent. */
    space = true;
    /** Per mode, the categories switched off in the legend (see `mapColor`). */
    readonly hidden: number[] = MAP_MODES.map(() => 0);
    /** Where news happened, pulsing in every mode until NEWS_PING_MS have passed. */
    private readonly pings: { x: number; y: number; color: string; born: number }[] = [];

    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly globeCtx: CanvasRenderingContext2D;
    private readonly buffer: HTMLCanvasElement;
    private readonly bufferCtx: CanvasRenderingContext2D;
    private readonly image: ImageData;
    private readonly winds = new WindMapLayer();

    /** `canvas` shows the flat map, `globeCanvas` the globe; both draw from one texture. */
    constructor(canvas: HTMLCanvasElement, private readonly globeCanvas: HTMLCanvasElement) {
      this.canvas = canvas;
      const ctx = canvas.getContext('2d');
      const globeCtx = globeCanvas.getContext('2d');
      if (!ctx || !globeCtx) throw new Error('SimEarth: 2D context unavailable for the Map window');
      this.ctx = ctx;
      this.globeCtx = globeCtx;

      this.buffer = document.createElement('canvas');
      this.buffer.width = GRID_W;
      this.buffer.height = GRID_H;
      const bctx = this.buffer.getContext('2d', { willReadFrequently: true });
      if (!bctx) throw new Error('SimEarth: offscreen 2D context unavailable');
      this.bufferCtx = bctx;

      this.image = bctx.createImageData(GRID_W, GRID_H);
      for (let i = 3; i < this.image.data.length; i += 4) this.image.data[i] = 255;
    }

    /** Convert a pointer position on the flat map to world tile coordinates. */
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

    /** Convert a pointer position on the globe to world tile coordinates; null beside its disc. */
    globeTileAt(clientX: number, clientY: number): { x: number; y: number } | null {
      const rect = this.globeCanvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const r = Math.min(rect.width, rect.height) * 0.46;
      const nx = (clientX - rect.left - rect.width / 2) / r;
      const ny = (clientY - rect.top - rect.height / 2) / r;
      const d2 = nx * nx + ny * ny;
      if (d2 > 1) return null;
      const nz = Math.sqrt(1 - d2);
      const cosT = Math.cos(this.tilt);
      const sinT = Math.sin(this.tilt);
      const lat = Math.asin(clamp(-ny * cosT + nz * sinT, -1, 1));
      const lon = Math.atan2(nx, ny * sinT + nz * cosT) + this.spin;
      return {
        x: wrapX(Math.floor(((lon / (Math.PI * 2)) + 0.5) * GRID_W)),
        y: clampY(Math.floor((0.5 - lat / Math.PI) * GRID_H)),
      };
    }

    /** The tile in the middle of the Edit window's viewport. */
    viewCenter(): { x: number; y: number } | null {
      const e = this.editRect;
      return e ? { x: wrapX(Math.floor(e.x + Math.min(GRID_W, e.w) / 2)), y: clampY(Math.floor(e.y + e.h / 2)) } : null;
    }

    private textureKey = '';

    render(world: WorldState): void {
      if (!fitCanvas(this.canvas, this.pixelScale)) return;

      // The planet texture only changes when the world does; the globe's spin
      // and the viewport box redraw on top of an unchanged texture.
      const key = `${world.ticks}|${this.mode}|${world.revision}|${this.hidden[this.mode]}`;
      if (key !== this.textureKey) {
        this.textureKey = key;
        this.paint(world);
        this.globeSrc = null;
      }

      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.buffer, 0, 0, GRID_W, GRID_H, 0, 0, w, h);
      if (this.mode === MapMode.AirCurrents) this.winds.drawFlat(ctx, w, h, this.pixelScale * (window.devicePixelRatio || 1));
      this.drawEditRect(ctx, w, h);
      this.drawPings(ctx, (x, y) => [x * w / GRID_W, y * h / GRID_H]);
      // Folded away the globe has no size, but keeps turning with the view so it shows the right place when it returns.
      this.aimAtEditRect();
      if (fitCanvas(this.globeCanvas, this.pixelScale)) this.renderGlobe(this.globeCtx, this.globeCanvas.width, this.globeCanvas.height);
    }

    /** Mark the spot of a piece of news. */
    ping(x: number, y: number, color: string): void {
      if (this.pings.length >= NEWS_PINGS_MAX) this.pings.shift();
      this.pings.push({ x, y, color, born: performance.now() });
    }

    /** Rings are pulsing: the map wants frames, not just the few a still texture needs. */
    get pulsing(): boolean {
      return this.pings.length > 0;
    }

    /** The globe still turns towards the Edit window's viewport, so it wants frames too. */
    get turning(): boolean {
      const d = this.globeOffset();
      return !d || Math.abs(d[0]) > GLOBE_SETTLED || Math.abs(d[1]) > GLOBE_SETTLED;
    }

    /** The planet in the current mode into the buffer, the technology map's cities stamped large. */
    private paint(world: WorldState): void {
      const data = this.image.data;
      const hidden = this.hidden[this.mode];
      const stamp = this.mode === MapMode.Technology;
      const cities: number[] = [];
      for (let i = 0; i < TILE_COUNT; i++) {
        const c = mapColor(world, i, this.mode, hidden);
        const p = i * 4;
        data[p] = c[0];
        data[p + 1] = c[1];
        data[p + 2] = c[2];
        if (stamp && world.tech[i] !== Tech.None && !(hidden & (1 << world.tech[i]))) cities.push(i);
      }
      // A city is one tile, under two screen pixels here: a block with a dark
      // rim makes each one findable. Rims first, so no rim cuts a neighbour.
      for (const rim of [true, false]) {
        for (const i of cities) {
          const r = (citySize(world.cityPop[i]) === CitySize.Metropolis ? 2 : 1) + (rim ? 1 : 0);
          const c = rim ? CITY_RIM : TECH_COLORS[world.tech[i]];
          const x0 = i % GRID_W;
          const y0 = Math.floor(i / GRID_W);
          for (let y = Math.max(0, y0 - r); y <= Math.min(GRID_H - 1, y0 + r); y++) {
            for (let dx = -r; dx <= r; dx++) {
              const p = idx(wrapX(x0 + dx), y) * 4;
              data[p] = c[0];
              data[p + 1] = c[1];
              data[p + 2] = c[2];
            }
          }
        }
      }
      this.bufferCtx.putImageData(this.image, 0, 0);
    }

    /** Two rings pulsing out of each news spot, fading towards its end; `at` places a tile point on the canvas. */
    private drawPings(ctx: CanvasRenderingContext2D, at: (x: number, y: number) => readonly [number, number] | null): void {
      const now = performance.now();
      const unit = this.canvas.width / Math.max(1, this.canvas.clientWidth);
      for (let k = this.pings.length - 1; k >= 0; k--) {
        const p = this.pings[k];
        const age = now - p.born;
        if (age >= NEWS_PING_MS) { this.pings.splice(k, 1); continue; }
        const pt = at(p.x + 0.5, p.y + 0.5);
        if (!pt) continue;
        const fade = Math.min(1, (NEWS_PING_MS - age) / 3000);
        for (let r = 0; r < 2; r++) {
          const t = (age / NEWS_PULSE_MS + r / 2) % 1;
          ctx.globalAlpha = fade * (1 - t);
          ctx.beginPath();
          ctx.arc(pt[0], pt[1], unit * (3 + 13 * t), 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(6,14,12,0.7)';
          ctx.lineWidth = unit * 3.5;
          ctx.stroke();
          ctx.strokeStyle = p.color;
          ctx.lineWidth = unit * 2;
          ctx.stroke();
        }
        ctx.globalAlpha = fade;
        ctx.fillStyle = 'rgba(6,14,12,0.8)';
        ctx.fillRect(pt[0] - unit * 2.5, pt[1] - unit * 2.5, unit * 5, unit * 5);
        ctx.fillStyle = p.color;
        ctx.fillRect(pt[0] - unit * 1.5, pt[1] - unit * 1.5, unit * 3, unit * 3);
      }
      ctx.globalAlpha = 1;
    }

    /** A fresh, enlarged image of the whole planet in the current mode. */
    exportImage(world: WorldState, scale = 4): HTMLCanvasElement {
      this.paint(world);
      this.textureKey = '';
      const out = document.createElement('canvas');
      out.width = GRID_W * scale;
      out.height = GRID_H * scale;
      const ctx = out.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.buffer, 0, 0, out.width, out.height);
        if (this.mode === MapMode.AirCurrents) this.winds.drawFlat(ctx, out.width, out.height, scale / 2);
      }
      return out;
    }

    /** Orthographic projection — the planet seen from space. */
    private globeSrc: Uint8ClampedArray | null = null;

    private renderGlobe(ctx: CanvasRenderingContext2D, w: number, h: number): void {
      if (!this.globeSrc) this.globeSrc = this.bufferCtx.getImageData(0, 0, GRID_W, GRID_H).data;
      const src = this.globeSrc;
      const radius = Math.min(w, h) * 0.46;
      const cx = w / 2;
      const cy = h / 2;
      const look = this.globeLook(ctx, w, h, radius, cx, cy);
      const dst = look.image.data;
      for (let p = 0, q = 0; p < look.from.length; p++, q += 4) {
        const s = look.from[p];
        if (s < 0) continue;
        const k = look.shade[p];
        dst[q] = src[s] * k;
        dst[q + 1] = src[s + 1] * k;
        dst[q + 2] = src[s + 2] * k;
      }
      ctx.putImageData(look.image, 0, 0);
      this.decorateGlobe(ctx, w, h, radius, cx, cy);
      if (this.mode === MapMode.AirCurrents) this.winds.drawGlobe(ctx, radius, cx, cy, this.spin, this.tilt);
      this.drawGlobeRect(ctx, radius, cx, cy);
      this.drawPings(ctx, (x, y) => this.globePoint(x, y, radius, cx, cy));
    }

    private look: { key: string; image: ImageData; from: Int32Array; shade: Float32Array } | null = null;

    /**
     * Which texture pixel each globe pixel shows (-1 beside the disc) and its
     * terminator shade. Worked out again only when size, spin or tilt change:
     * the trigonometry per pixel is most of a globe frame, and a still globe
     * is redrawn with every tick.
     */
    private globeLook(ctx: CanvasRenderingContext2D, w: number, h: number, radius: number, cx: number, cy: number): { image: ImageData; from: Int32Array; shade: Float32Array } {
      const key = `${w}|${h}|${this.spin}|${this.tilt}`;
      if (this.look?.key === key) return this.look;
      // Beside the disc the image stays transparent, so space shows there.
      const look = this.look && this.look.image.width === w && this.look.image.height === h
        ? { ...this.look, key }
        : { key, image: ctx.createImageData(w, h), from: new Int32Array(w * h), shade: new Float32Array(w * h) };
      this.look = look;
      // Orthographic view tilted to `tilt`: rotate the view ray about the x axis.
      const cosT = Math.cos(this.tilt);
      const sinT = Math.sin(this.tilt);
      for (let py = 0; py < h; py++) {
        const ny = (py - cy) / radius;
        for (let px = 0; px < w; px++) {
          const nx = (px - cx) / radius;
          const d2 = nx * nx + ny * ny;
          const p = py * w + px;
          if (d2 > 1) {
            look.from[p] = -1;
            continue;
          }
          const nz = Math.sqrt(1 - d2);
          const lat = Math.asin(clamp(-ny * cosT + nz * sinT, -1, 1));
          const lon = Math.atan2(nx, ny * sinT + nz * cosT) + this.spin;
          const tx = wrapX(Math.round(((lon / (Math.PI * 2)) + 0.5) * GRID_W));
          const ty = clampY(Math.round((0.5 - lat / Math.PI) * GRID_H));
          look.from[p] = (ty * GRID_W + tx) * 4;
          // A touch of terminator shading so it reads as a sphere.
          look.shade[p] = 0.55 + 0.45 * nz;
          look.image.data[p * 4 + 3] = 255;
        }
      }
      return look;
    }

    /** A tile position on the globe's disc, or null on its far side. */
    private globePoint(tx: number, ty: number, r: number, cx: number, cy: number): [number, number] | null {
      const lon = (tx / GRID_W - 0.5) * Math.PI * 2 - this.spin;
      const lat = (0.5 - ty / GRID_H) * Math.PI;
      const x = Math.cos(lat) * Math.sin(lon);
      const y = Math.sin(lat);
      const z = Math.cos(lat) * Math.cos(lon);
      // Inverse of the tilt in renderGlobe; z is towards the viewer.
      const cosT = Math.cos(this.tilt);
      const sinT = Math.sin(this.tilt);
      if (y * sinT + z * cosT < 0) return null;
      return [cx + x * r, cy - (y * cosT - z * sinT) * r];
    }

    /** How far the globe still has to turn to face the Edit window's viewport: [longitude, latitude] in radians; null without one. */
    private globeOffset(): [number, number] | null {
      const e = this.editRect;
      if (!e) return null;
      const lonT = ((e.x + Math.min(GRID_W, e.w) / 2) / GRID_W - 0.5) * Math.PI * 2;
      const latT = (0.5 - (e.y + e.h / 2) / GRID_H) * Math.PI;
      let d = lonT - this.spin;
      d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
      return [d, latT - this.tilt];
    }

    /** Ease the globe towards the Edit window's viewport; idle spin without one. */
    private aimAtEditRect(): void {
      const d = this.globeOffset();
      if (!d) {
        this.spin += 0.012;
        return;
      }
      // The last bit at once, so a still globe keeps its spin and tilt and reuses its projection.
      this.spin += Math.abs(d[0]) > GLOBE_SETTLED ? d[0] * 0.15 : d[0];
      this.tilt += Math.abs(d[1]) > GLOBE_SETTLED ? d[1] * 0.15 : d[1];
    }

    /** The viewport's outline on the sphere: a lat/lon box, so it narrows towards the poles. */
    private drawGlobeRect(ctx: CanvasRenderingContext2D, r: number, cx: number, cy: number): void {
      const e = this.editRect;
      if (!e) return;
      const x0 = e.x;
      const x1 = e.x + Math.min(GRID_W, e.w);
      const y0 = e.y;
      const y1 = e.y + e.h;
      const N = 24;
      const pts: [number, number][] = [];
      for (let i = 0; i < N; i++) pts.push([x0 + (x1 - x0) * i / N, y0]);
      for (let i = 0; i < N; i++) pts.push([x1, y0 + (y1 - y0) * i / N]);
      for (let i = 0; i < N; i++) pts.push([x1 - (x1 - x0) * i / N, y1]);
      for (let i = 0; i <= N; i++) pts.push([x0, y1 - (y1 - y0) * i / N]);

      const path = (): void => {
        ctx.beginPath();
        let drawing = false;
        for (const [tx, ty] of pts) {
          const pt = this.globePoint(tx, ty, r, cx, cy);
          if (!pt) { drawing = false; continue; }
          if (drawing) ctx.lineTo(pt[0], pt[1]);
          else ctx.moveTo(pt[0], pt[1]);
          drawing = true;
        }
        ctx.stroke();
      };
      const lw = Math.max(2, Math.round(r / 90));
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = lw + 2;
      path();
      ctx.strokeStyle = '#f6f1df';
      ctx.lineWidth = lw;
      path();
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
