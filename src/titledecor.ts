/* =============================================================================
 * SimEarth 2.0 — title screen decoration
 * -----------------------------------------------------------------------------
 * Everything around the controls that is only there to look at: the starry
 * sky with its asteroids, the cyan HUD marks, the orbit around the logo, the
 * orbits and moons around the globe, the info card and the quote. All of it is
 * hidden from screen readers except the info card and the quote.
 * ========================================================================== */

namespace SE {
  /**
   * The version from package.json, written into simulation.js by
   * tools/stamp-version.js after every build; 'dev' in a bare `tsc` build.
   */
  export const APP_VERSION: string = 'dev';

  function titleArt(name: string): string {
    return `assets/title/${name}.svg`;
  }

  function decor(cls: string): HTMLElement {
    const node = make('div', cls);
    node.setAttribute('aria-hidden', 'true');
    return node;
  }

  /** Twinkling stars: x %, y %, size in px, delay in s. */
  const SPARKS: readonly (readonly [number, number, number, number])[] = [
    [27, 3, 5, 1.7], [47, 12, 9, 0.6], [53, 63, 7, 2.4],
    [57, 7, 5, 4.2], [62, 54, 9, 1.1], [68, 88, 5, 3.6], [74, 28, 7, 0.3], [83, 4, 5, 2.8],
    [88, 47, 7, 1.9], [94, 30, 9, 4.6], [97, 72, 5, 0.9], [36, 92, 5, 3.3],
  ];

  /**
   * Asteroids: asset, left %, bottom %, width in px, depth 0 (far) .. 2 (near).
   * They drift along the left edge and below the middle, clear of the footer text.
   */
  const ROCKS: readonly (readonly [string, number, number, number, number])[] = [
    ['asteroid-a', -2.6, 12, 112, 2], ['asteroid-b', 0.6, 27, 40, 1], ['asteroid-c', -0.4, 36, 20, 0],
    ['asteroid-a', 45, -6, 100, 2], ['asteroid-b', 52, 2, 46, 1], ['asteroid-c', 57, 8, 22, 0],
    ['asteroid-b', 49, 9, 22, 0], ['asteroid-c', 61, 0.5, 30, 1],
  ];

  /**
   * Star layers, far to near: tile side in px, stars per tile, star size in
   * px, colours, and seconds to drift one tile. Nearer layers drift faster.
   */
  const STAR_LAYERS: readonly (readonly [number, number, number, readonly string[], number])[] = [
    [211, 26, 1, ['#6f86a8', '#55688a', '#8fa6c8'], 420],
    [307, 20, 1, ['#c9dcf5', '#9fb8dc', '#f0dcc0'], 260],
    [419, 6, 2, ['#e8f6ff', '#bff2ff'], 160],
  ];

  /** One repeating tile of square stars, as an SVG background. */
  function starTile(rng: Rng, size: number, count: number, px: number, colours: readonly string[]): string {
    let rects = '';
    for (let k = 0; k < count; k++) {
      rects += `<rect x="${rng.int(size / px) * px}" y="${rng.int(size / px) * px}" width="${px}" height="${px}" fill="${colours[k % colours.length]}"/>`;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" shape-rendering="crispEdges">${rects}</svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  /** Sky, nebula, drifting star layers, sparkles and asteroids, behind everything. */
  export function titleSky(): HTMLElement {
    const sky = decor('title-sky');
    const rng = new Rng(2026);
    for (const [size, count, px, colours, secs] of STAR_LAYERS) {
      const layer = make('div', 'title-stars');
      // One step per pixel, so the stars never land between two.
      layer.style.cssText = `background-image:${starTile(rng, size, count, px, colours)};--tile:${size}px;animation-duration:${secs}s;animation-timing-function:steps(${size})`;
      sky.appendChild(layer);
    }
    sky.appendChild(make('div', 'title-nebula'));
    for (const [x, y, size, delay] of SPARKS) {
      const s = make('span', 'title-spark');
      // Sizes are odd, so the centre pixel sits on a whole pixel.
      s.style.cssText = `left:${x}%;top:${y}%;--s:${size}px;margin:${-(size - 1) / 2}px 0 0 ${-(size - 1) / 2}px;animation-delay:${delay}s`;
      sky.appendChild(s);
    }
    ROCKS.forEach(([name, x, y, w, depth], k) => {
      const rock = img(titleArt(name), `title-rock depth-${depth}`);
      rock.style.cssText = `left:${x}%;bottom:${y}%;width:${w}px;animation-delay:${-k * 1.7}s`;
      sky.appendChild(rock);
    });
    return sky;
  }

  /** Crosshairs and thin lines in the corners of the screen. */
  export function titleHud(): HTMLElement {
    const hud = decor('title-hud');
    for (const where of ['tl', 'logo', 'globe-top', 'globe-bottom']) hud.appendChild(make('span', `title-cross title-cross-${where}`));
    hud.append(make('span', 'title-line title-line-top'), make('span', 'title-line title-line-foot'));
    return hud;
  }

  /** The orbit arc around the logo, with its light point. */
  export function logoOrbit(): HTMLElement {
    const box = decor('title-logo-orbit');
    box.innerHTML = `<svg viewBox="0 0 600 200" preserveAspectRatio="none">
      <defs><linearGradient id="title-orbit-fade" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stop-color="#4fd6e0" stop-opacity="0.85"/><stop offset="0.45" stop-color="#4fd6e0" stop-opacity="0.15"/>
        <stop offset="0.7" stop-color="#4fd6e0" stop-opacity="0.2"/><stop offset="1" stop-color="#9ff6ff" stop-opacity="0.95"/>
      </linearGradient></defs>
      <path d="M70 196 C -40 150 40 40 250 18 C 380 4 480 6 520 14" fill="none" stroke="url(#title-orbit-fade)" stroke-width="1.6" vector-effect="non-scaling-stroke"/>
    </svg><span class="title-logo-light"></span>`;
    return box;
  }

  /** Orbits around the globe, with markers, and the moons on them. */
  export function globeOrbits(): HTMLElement[] {
    const rings = decor('title-orbits');
    const marks = [-90, 25, 160, 215]
      .map((deg) => {
        const a = (deg * Math.PI) / 180;
        return `<rect x="${(Math.cos(a) * 118 - 1.2).toFixed(1)}" y="${(Math.sin(a) * 118 - 1.2).toFixed(1)}" width="2.4" height="2.4"/>`;
      })
      .join('');
    rings.innerHTML = `<svg viewBox="-100 -100 200 200" overflow="visible">
      <circle r="118" class="title-orbit"/>
      <path d="M-98 -96 A152 140 0 0 0 -112 92" class="title-orbit title-orbit-far"/>
      <path d="M128 -60 A150 150 0 0 1 120 76" class="title-orbit title-orbit-far"/>
      <path d="M0 -136v14M0 122v14" class="title-orbit title-orbit-tick"/>
      <g class="title-orbit-marks">${marks}<rect x="-1.8" y="-139.6" width="3.6" height="3.6"/><rect x="-1.8" y="136" width="3.6" height="3.6"/></g>
    </svg>`;
    const moons = [
      img(titleArt('moon-large'), 'title-moon title-moon-large'),
      img(titleArt('moon-small'), 'title-moon title-moon-small'),
      img(titleArt('asteroid-c'), 'title-moon title-moon-tiny'),
    ];
    for (const m of moons) m.setAttribute('aria-hidden', 'true');
    return [rings, ...moons];
  }

  export function titleInfoCard(): HTMLElement {
    const card = make('aside', 'title-info');
    card.setAttribute('aria-label', 'Über das Spiel');
    const text = make('div', 'title-info-text');
    text.append(
      make('strong', undefined, 'SimEarth 2'),
      make('span', undefined, 'Planetensimulation'),
      make('span', 'title-info-ver', /^\d/.test(APP_VERSION) ? `v${APP_VERSION}` : 'Entwicklungsstand'),
      make('span', undefined, 'Eine lebende Welt'),
    );
    card.append(img(titleArt('satellite'), 'title-info-sat'), text, decor('title-info-signal'));
    return card;
  }

  export function titleQuote(): HTMLElement {
    const fig = make('figure', 'title-quote');
    const q = make('blockquote');
    q.appendChild(make('p', undefined, '»Ein Planet ist mehr als nur Land und Meer. Es ist eine Geschichte.«'));
    fig.append(q, decor('title-quote-arrow'));
    return fig;
  }

  /* ------------------------------------------------------- the hero globe -- */

  /** Globe pixels across the canvas; each is drawn as a whole number of device pixels. */
  const GLOBE_PX = 144;
  /** Disc radius as a share of the canvas side; the CSS glows around it assume 0.46. */
  const DISC = 0.46;
  /** Sunlight from the upper left, a little toward the viewer (screen y points down). */
  const SUN = [-0.62, -0.5, 0.6].map((c, _, v) => c / Math.hypot(...v));
  /** 4×4 ordered dither, 0..1: the terminator and the haze step in pixel patterns. */
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((b) => (b + 0.5) / 16);
  /** Light bands from day to night: [lowest light, brightness]. */
  const BANDS: readonly (readonly [number, number])[] = [[0.42, 1], [0.18, 0.86], [-0.02, 0.68], [-0.18, 0.5], [-2, 0.34]];
  const AIR: Rgb = [126, 206, 255];
  /** Clouds turn this much faster than the ground below them. */
  const CLOUD_DRIFT = 1.25;

  /** Smooth value noise over the grid, 0..1, wrapping east–west. */
  function smoothNoise(rng: Rng): Float32Array {
    const sum = new Float32Array(TILE_COUNT);
    for (const [cells, amp] of [[8, 0.4], [16, 0.3], [32, 0.18], [64, 0.12]]) {
      // As many rows as columns on a 2:1 grid: cloud bands twice as wide as tall.
      const rows = cells + 1;
      const g = Float32Array.from({ length: cells * rows }, () => rng.next());
      for (let y = 0; y < GRID_H; y++) {
        const fy = (y / GRID_H) * (rows - 1);
        const y0 = Math.floor(fy);
        const sy = (fy - y0) * (fy - y0) * (3 - 2 * (fy - y0));
        for (let x = 0; x < GRID_W; x++) {
          const fx = (x / GRID_W) * cells;
          const x0 = Math.floor(fx);
          const x1 = (x0 + 1) % cells;
          const sx = (fx - x0) * (fx - x0) * (3 - 2 * (fx - x0));
          const top = lerp(g[y0 * cells + x0], g[y0 * cells + x1], sx);
          const bot = lerp(g[(y0 + 1) * cells + x0], g[(y0 + 1) * cells + x1], sx);
          sum[y * GRID_W + x] += amp * lerp(top, bot, sy);
        }
      }
    }
    return sum;
  }

  /** Cloud cover per tile, 0 clear, 1 thin, 2 thick. A second noise shears it east–west, so no grid shows. */
  function cloudField(seed: number): Uint8Array {
    const rng = new Rng((seed ^ 0x5bd1e995) >>> 0);
    const shape = smoothNoise(rng);
    const shear = smoothNoise(rng);
    const v = new Float32Array(TILE_COUNT);
    for (let i = 0; i < TILE_COUNT; i++) {
      const y = Math.floor(i / GRID_W);
      const x = (((i % GRID_W) + Math.round((shear[i] - 0.5) * 60)) % GRID_W + GRID_W) % GRID_W;
      // Cloud belts at the equator and the mid-latitudes, clear subtropics.
      const lat = Math.abs(y / GRID_H - 0.5) * 2;
      v[i] = shape[y * GRID_W + x] + 0.08 * Math.cos(lat * Math.PI * 3);
    }
    // Every planet gets the same cover: thick on 10 % of the sky, thin on 10 % more.
    const sorted = Float32Array.from(v).sort();
    const thick = sorted[Math.floor(TILE_COUNT * 0.9)];
    const thin = sorted[Math.floor(TILE_COUNT * 0.8)];
    return Uint8Array.from(v, (c) => (c >= thick ? 2 : c >= thin ? 1 : 0));
  }

  /**
   * The planet on the title screen as pixel art: drawn at a low resolution and
   * scaled up by a whole number, lit from one side with dithered light bands,
   * a rim of air and its own clouds. Only the turn is computed per frame.
   */
  export class TitleGlobe {
    /** Longitude offset in radians. */
    spin = 2.4;
    private readonly ctx: CanvasRenderingContext2D;
    private texture: Uint8ClampedArray | null = null;
    private clouds: Uint8Array | null = null;
    private textureKey = '';
    private side = 0;
    private image: ImageData | null = null;
    /** Per canvas pixel: -1 outside, -2 air, else the texture row. */
    private row = new Int16Array(0);
    /** Per canvas pixel: texture column at spin 0. */
    private col = new Float32Array(0);
    /** Per canvas pixel: brightness, or the air's opacity. */
    private light = new Float32Array(0);
    /** Per canvas pixel: share of haze at the lit limb. */
    private haze = new Float32Array(0);

    constructor(private readonly canvas: HTMLCanvasElement) {
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('SimEarth: 2D context unavailable for the title globe');
      this.ctx = ctx;
    }

    render(world: WorldState): void {
      if (!this.fit()) return;
      const key = `${world.ticks}|${world.revision}|${world.seed}`;
      if (key !== this.textureKey) {
        this.textureKey = key;
        this.texture = this.paintTexture(world);
        this.clouds = cloudField(world.seed);
      }
      const tex = this.texture!;
      const clouds = this.clouds!;
      const img = this.image!;
      const dst = img.data;
      const turn = (this.spin / (Math.PI * 2) + 0.5) * GRID_W;
      const cloudTurn = turn * CLOUD_DRIFT;
      for (let p = 0, q = 0; p < this.row.length; p++, q += 4) {
        const ty = this.row[p];
        if (ty === -1) { dst[q + 3] = 0; continue; }
        if (ty === -2) {
          dst[q] = AIR[0]; dst[q + 1] = AIR[1]; dst[q + 2] = AIR[2];
          dst[q + 3] = this.light[p] * 255;
          continue;
        }
        const base = ty * GRID_W;
        const s = (base + (((Math.round(this.col[p] + turn) % GRID_W) + GRID_W) % GRID_W)) * 4;
        let r = tex[s], g = tex[s + 1], b = tex[s + 2];
        const c = clouds[base + (((Math.round(this.col[p] + cloudTurn) % GRID_W) + GRID_W) % GRID_W)];
        if (c) {
          const k = c === 2 ? 0.85 : 0.35;
          r = lerp(r, 242, k); g = lerp(g, 248, k); b = lerp(b, 255, k);
        }
        const h = this.haze[p];
        if (h) { r = lerp(r, AIR[0], h); g = lerp(g, AIR[1], h); b = lerp(b, AIR[2], h); }
        const l = this.light[p];
        // The night side keeps a little blue, as pixel art shades.
        dst[q] = r * l;
        dst[q + 1] = g * l;
        dst[q + 2] = b * Math.pow(l, 0.7);
        dst[q + 3] = 255;
      }
      this.ctx.putImageData(img, 0, 0);
    }

    /** Terrain colours; rivers mixed into the land beside them, which at this size reads better than bright lines. */
    private paintTexture(world: WorldState): Uint8ClampedArray {
      const tex = new Uint8ClampedArray(TILE_COUNT * 4);
      for (let i = 0; i < TILE_COUNT; i++) {
        const [r, g, b] = mapColor(world, i, MapMode.Terrain);
        tex[i * 4] = r; tex[i * 4 + 1] = g; tex[i * 4 + 2] = b;
      }
      for (let i = 0; i < TILE_COUNT; i++) {
        if (world.isWater(i) || world.riverLevel[i] <= 0) continue;
        const n = i % GRID_W === 0 ? i + GRID_W - 1 : i - 1;
        for (let k = 0; k < 3; k++) tex[i * 4 + k] = (tex[i * 4 + k] + tex[n * 4 + k] * 2) / 3;
      }
      return tex;
    }

    /** Size the canvas to whole device pixels per globe pixel; false while it has no room. */
    private fit(): boolean {
      const box = this.canvas.parentElement?.getBoundingClientRect();
      if (!box || box.width <= 0 || box.height <= 0) return false;
      const dpr = window.devicePixelRatio || 1;
      const device = Math.min(box.width, box.height) * dpr;
      const scale = Math.max(1, Math.round(device / GLOBE_PX));
      const side = Math.max(16, Math.floor(device / scale));
      const css = `${(side * scale) / dpr}px`;
      if (this.canvas.style.width !== css) this.canvas.style.width = this.canvas.style.height = css;
      if (side === this.side) return true;
      this.side = this.canvas.width = this.canvas.height = side;
      this.image = this.ctx.createImageData(side, side);
      this.measure(side);
      return true;
    }

    /** Where each canvas pixel looks on the sphere, and how much sun it gets. */
    private measure(n: number): void {
      const count = n * n;
      this.row = new Int16Array(count);
      this.col = new Float32Array(count);
      this.light = new Float32Array(count);
      this.haze = new Float32Array(count);
      const r = n * DISC;
      const c = n / 2;
      for (let py = 0; py < n; py++) {
        for (let px = 0; px < n; px++) {
          const p = py * n + px;
          const nx = (px + 0.5 - c) / r;
          const ny = (py + 0.5 - c) / r;
          const d2 = nx * nx + ny * ny;
          const dither = BAYER[(py & 3) * 4 + (px & 3)] - 0.5;
          if (d2 > 1) {
            // Two pixels of air around the disc, bright on the sunny side.
            const out = (Math.sqrt(d2) - 1) * r;
            const lit = clamp((nx * SUN[0] + ny * SUN[1]) / Math.sqrt(d2) + 0.25, 0, 1);
            const air = out < 1.2 ? 0.2 + 0.65 * lit : out < 2.4 && lit + dither * 0.6 > 0.35 ? 0.12 + 0.3 * lit : 0;
            this.row[p] = air > 0 ? -2 : -1;
            this.light[p] = air;
            continue;
          }
          const nz = Math.sqrt(1 - d2);
          const lat = Math.asin(clamp(-ny, -1, 1));
          this.row[p] = clampY(Math.round((0.5 - lat / Math.PI) * GRID_H));
          this.col[p] = (Math.atan2(nx, nz) / (Math.PI * 2)) * GRID_W;
          const sun = nx * SUN[0] + ny * SUN[1] + nz * SUN[2] + dither * 0.1;
          this.light[p] = BANDS.find(([lo]) => sun > lo)![1];
          // Haze on the limb, thicker toward the edge, only where the sun shines.
          const edge = 1 - nz;
          this.haze[p] = sun > 0 ? (edge + dither * 0.1 > 0.8 ? 0.4 : edge + dither * 0.1 > 0.62 ? 0.18 : 0) : 0;
        }
      }
    }
  }
}
