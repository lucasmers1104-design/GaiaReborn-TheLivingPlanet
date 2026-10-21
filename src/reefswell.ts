/* =============================================================================
 * SimEarth 2.0 — a swell running over the reefs towards land
 * -----------------------------------------------------------------------------
 * Now and then a soft swell crest runs across a reef from its seaward side
 * towards land and on over the lagoon, dying out before the beach, so the
 * corals read as lying under water. Drawn into the frame over the cached
 * terrain like watermotion.ts: only palette colours, one art pixel each, each
 * lifted from its own composed colour (water a step up its ramp, corals a
 * sheen towards the lagoon's lightest turquoise); a picture every STEP_MS from
 * a hash and the clock, nothing stored per pixel, game speed irrelevant.
 *
 * Where a crest is follows from one continuous field, so fronts join across
 * tiles and chunks: per tile centre its distance to the open sea (reefs and
 * lagoons count as sheltered) and a slowly varying time offset, bilinear in
 * between. A swell leaves the open sea every PERIOD (jittered) and runs at
 * SPEED; how strong it comes in varies along the coast, so a stretch sees one
 * every 5–14 s.
 * Wiring (render.ts): `draw` right after WaterMotion, with the "Ozeane" layer;
 * expects ctx in any transform and leaves it at identity.
 * ========================================================================== */

namespace SE {
  /** Seven pictures a second, as the surf. */
  const STEP_MS = 140;
  /** CSS px per tile from which the swell runs (WaterMotion's limit). */
  const MIN_TILE = 16;
  /** A swell leaves the open sea every PERIOD s, up to JITTER of a period late. */
  const PERIOD = 6;
  const JITTER = 0.3;
  /** Crest speed, art px per second: a tile in about 1.5 s. */
  const SPEED = 11;
  /** The crest, px from its front back towards the sea: the share of each row that shows, thinning out behind. */
  const CREST = [1, 1, 0.45, 0.2];
  /** Px the front bends either way from tile to tile, so it is never ruler-straight. */
  const WOBBLE = 2;
  /** Px from the open sea's tile centre: the crest fades in over the reef's first FADE_IN px (its edge is at 8)… */
  const FADE_FROM = 8;
  const FADE_IN = 6;
  /** …and dies out between these, over the reef flat and the lagoon. */
  const DIE_FROM = 26;
  const DIE_TO = 60;
  /**
   * Lattice of the time offset that desyncs the coasts, px (divides the
   * world's width), and its spread in periods: two, so reefs a lattice cell
   * apart run apart (the bilinear noise bunches around its middle), on a
   * cell wide enough that a front turns at most ~27° along the coast.
   */
  const LAG_CELL = 256;
  const LAG_SPREAD = 2;
  /** Lattice of a swell's strength along the coast, px; strength 0 below AMP_FROM, full AMP_SPAN above. */
  const AMP_CELL = 64;
  const AMP_FROM = 0.35;
  const AMP_SPAN = 0.3;
  /** Share of the crest that shows 2 px before dry ground (none on the last px). */
  const NEAR_DRY = 0.4;
  /** Breaks in the crest: cells of BREAK_CELL px, this share left out. */
  const BREAK_CELL = 2;
  const BREAK_SHARE = 0.2;
  /** Tiles searched for the open sea. */
  const REACH = 3;
  /** The sheen over a coral (reefSwellLift): OKLab lightness and hue this far towards the lagoon's lightest turquoise, at least SHEEN_MIN lighter. */
  const SHEEN = 0.25;
  const SHEEN_HUE = 0.1;
  const SHEEN_MIN = 0.02;
  const HUE_WEIGHT = 4;
  /** Tiles built beyond the view, so a pan shows no bare edge before the next picture. */
  const AHEAD = 2;
  const CHUNK_PX = LAND_CHUNK * 16;
  const CHUNKS_X = GRID_W / LAND_CHUNK;
  const WORLD_PX = GRID_W * 16;
  /** Tile offsets within REACH, nearest first: [dx, dy, distance]. */
  const NEAREST_FIRST: readonly (readonly [number, number, number])[] = (() => {
    const out: [number, number, number][] = [];
    for (let dy = -REACH; dy <= REACH; dy++) for (let dx = -REACH; dx <= REACH; dx++) out.push([dx, dy, Math.hypot(dx, dy)]);
    return out.sort((a, b) => a[2] - b[2]);
  })();

  /** Pixels around one, [dx, dy, ring]: the eight touching it, then the four 2 px off along the axes. */
  const DRY_RING: readonly (readonly [number, number, number])[] = [
    [-1, -1, 1], [0, -1, 1], [1, -1, 1], [-1, 0, 1], [1, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1],
    [0, -2, 2], [-2, 0, 2], [2, 0, 2], [0, 2, 2],
  ];

  interface SwellWindow { readonly sheltered: Uint8Array; readonly dist: Float32Array; readonly lag: Float32Array }

  /** Bilinear value noise on a lattice of `cell` px, wrapping in X, 0..1. */
  function latticeAt(x: number, y: number, cell: number, salt: number): number {
    const n = WORLD_PX / cell;
    const fx = x / cell;
    const fy = y / cell;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const xa = ((x0 % n) + n) % n;
    const xb = (xa + 1) % n;
    const u = fx - x0;
    return lerp(
      lerp(landHash(xa, y0, salt), landHash(xb, y0, salt), u),
      lerp(landHash(xa, y0 + 1, salt), landHash(xb, y0 + 1, salt), u),
      fy - y0,
    );
  }

  /** OKLab [L, a, b] of an sRGB colour. */
  function oklab(c: readonly number[]): [number, number, number] {
    const lin = (v: number): number => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    const r = lin(c[0]);
    const g = lin(c[1]);
    const b = lin(c[2]);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  }

  /**
   * Per palette index the colour a crest lifts it to, 0 for none: water,
   * lagoon and shelf a step up their ramp; anything else (corals, reef sand)
   * the lighter palette colour nearest to it blended towards the lagoon's
   * lightest turquoise, in OKLab: lightness SHEEN of the way, hue and
   * chroma only SHEEN_HUE and weighed HUE_WEIGHT times in the distance, so a
   * coral's hue survives under the sheen (an RGB blend turned brown sage).
   */
  export function reefSwellLift(art: LandArt): Uint8Array {
    const pal = art.manifest.palette;
    const up = art.shift[LAND_SHIFT_MAX + 1];
    const lab = pal.map(oklab);
    const w = lab[art.waterWarm[art.waterWarm.length - 1]];
    const out = new Uint8Array(256);
    for (let i = 1; i < pal.length; i++) {
      if (art.isWater[i]) {
        out[i] = up[i] !== i ? up[i] : 0;
        continue;
      }
      const c = lab[i];
      const L = c[0] + (w[0] - c[0]) * SHEEN;
      const A = c[1] + (w[1] - c[1]) * SHEEN_HUE;
      const B = c[2] + (w[2] - c[2]) * SHEEN_HUE;
      let bestD = Infinity;
      for (let j = 1; j < pal.length; j++) {
        const q = lab[j];
        if (j === art.manifest.maskIndex || pal[j][3] < 128 || q[0] <= c[0] + SHEEN_MIN) continue;
        const d = (q[0] - L) ** 2 + HUE_WEIGHT * ((q[1] - A) ** 2 + (q[2] - B) ** 2);
        if (d < bestD) { bestD = d; out[i] = j; }
      }
    }
    return out;
  }

  export class ReefSwell {
    /** "Effekte reduzieren": no swell. */
    still = false;
    private key = '';
    /** The current picture: one path per palette index, art px from the origin tile's corner. */
    private paths = new Map<number, Path2D>();
    private originX = 0;
    private originY = 0;
    private colors: string[] = [];
    private lift: Uint8Array = new Uint8Array(0);
    private windowKey = '';
    private windowAt: SwellWindow | null = null;
    private liftOf: LandArt | null = null;

    draw(
      ctx: CanvasRenderingContext2D, cam: LandCamera, cols: number, rows: number,
      world: WorldState, land: PixelTerrain, sea: boolean, now: number,
    ): void {
      const art = land.art;
      if (this.still || !sea || cam.tilePx < MIN_TILE || !land.ready || !art) return;
      const step = Math.floor(now / STEP_MS);
      const ox = Math.floor(cam.scrollX);
      const oy = Math.floor(cam.scrollY);
      const key = `${step}|${ox}|${oy}|${Math.ceil(cols)}|${Math.ceil(rows)}`;
      if (key !== this.key) {
        this.key = key;
        this.originX = ox;
        this.originY = oy;
        this.build(world, land, art, Math.ceil(cols), Math.ceil(rows), (step * STEP_MS) / 1000);
      }
      // Scrolling moves in whole device pixels, so the origin lands on one.
      const T = cam.tilePx * cam.dpr;
      ctx.setTransform(T / 16, 0, 0, T / 16, (ox - cam.scrollX) * T, (oy - cam.scrollY) * T);
      for (const [color, path] of this.paths) {
        ctx.fillStyle = this.colors[color];
        ctx.fill(path);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    private build(world: WorldState, land: PixelTerrain, art: LandArt, cols: number, rows: number, t: number): void {
      if (this.liftOf !== art) {
        this.liftOf = art;
        this.lift = reefSwellLift(art);
        this.colors = art.manifest.palette.map(([r, g, b]) => `rgb(${r},${g},${b})`);
      }
      this.paths = new Map();
      const tx0 = this.originX - AHEAD;
      const tx1 = this.originX + cols + 1 + AHEAD;
      const ty0 = Math.max(0, this.originY - AHEAD);
      const ty1 = Math.min(GRID_H, this.originY + rows + 1 + AHEAD);
      if (ty1 <= ty0) return;
      // The field's window: the drawn tiles and one around, whose centres are the outer corners.
      const wx0 = tx0 - 1;
      const wy0 = Math.max(0, ty0 - 1);
      const wy1 = Math.min(GRID_H, ty1 + 1);
      const W = tx1 + 1 - wx0;
      const field = this.window(world, land.field, wx0, wy0, W, wy1 - wy0);
      if (!field) return;
      const { sheltered, dist, lag } = field;
      const lift = this.lift;
      let mAt = -1;
      let m: LandMotion | null = null;
      for (let ty = ty0; ty < ty1; ty++) {
        for (let tu = tx0; tu < tx1; tu++) {
          const tw = wrapX(tu);
          if (shoreBusy[ty * GRID_W + tw] || world.tech[ty * GRID_W + tw] !== Tech.None) continue;
          const cu = Math.floor(tu / LAND_CHUNK);
          const cy = Math.floor(ty / LAND_CHUNK);
          const cw = ((cu % CHUNKS_X) + CHUNKS_X) % CHUNKS_X;
          if (cy * CHUNKS_X + cw !== mAt) {
            mAt = cy * CHUNKS_X + cw;
            m = land.motion(cw, cy);
          }
          const sea = m && m.sea;
          if (!m || !sea) continue;
          const lx0 = (tu - cu * LAND_CHUNK) * 16;
          const ly0 = (ty - cy * LAND_CHUNK) * 16;
          // Four quadrants, each inside one cell of tile centres.
          for (let qy = 0; qy < 2; qy++) {
            const ra = clamp(ty - 1 + qy, wy0, wy1 - 1) - wy0;
            const rb = clamp(ty + qy, wy0, wy1 - 1) - wy0;
            for (let qx = 0; qx < 2; qx++) {
              const ca = tu - 1 + qx - wx0;
              const k00 = ra * W + ca;
              const k10 = k00 + 1;
              const k01 = rb * W + ca;
              const k11 = k01 + 1;
              if (!(sheltered[k00] | sheltered[k10] | sheltered[k01] | sheltered[k11])) continue;
              const l00 = t + lag[k00];
              const l10 = t + lag[k10];
              const l01 = t + lag[k01];
              const l11 = t + lag[k11];
              // Bilinear values peak at the corners of the quadrant's pixel centres: is a crest anywhere in it?
              const u0 = (8.5 - 8 * qx) / 16;
              const v0 = (8.5 - 8 * qy) / 16;
              const ta = lerp(lerp(l00, l10, u0), lerp(l01, l11, u0), v0);
              const tb = lerp(lerp(l00, l10, u0 + 7 / 16), lerp(l01, l11, u0 + 7 / 16), v0);
              const tc = lerp(lerp(l00, l10, u0), lerp(l01, l11, u0), v0 + 7 / 16);
              const td = lerp(lerp(l00, l10, u0 + 7 / 16), lerp(l01, l11, u0 + 7 / 16), v0 + 7 / 16);
              const lo = Math.min(ta, tb, tc, td);
              const hi = Math.max(ta, tb, tc, td);
              // A quadrant spans less than a period: its pixels see this swell or the next.
              const wave = Math.floor(lo / PERIOD);
              const at0 = ReefSwell.leaves(wave);
              const at1 = ReefSwell.leaves(wave + 1);
              // The lag changes at most √2·(its range over the cell)/16 per px: the band's time is no longer.
              const band = (CREST.length * Math.SQRT2 * (Math.max(l00, l10, l01, l11) - Math.min(l00, l10, l01, l11))) / 16;
              if (hi < at0 || (lo - at0 >= band && hi < at1)) continue;
              for (let py = qy * 8; py < qy * 8 + 8; py++) {
                const v = (py + 8.5 - 16 * qy) / 16;
                const left = lerp(l00, l01, v);
                const right = lerp(l10, l11, v);
                const gu = right - left;
                for (let px = qx * 8; px < qx * 8 + 8; px++) {
                  const u = (px + 8.5 - 16 * qx) / 16;
                  const time = left + gu * u;
                  const n = time >= (wave + 1) * PERIOD ? wave + 1 : wave;
                  const e = time - (n === wave ? at0 : at1);
                  // Px behind the front, 16·e / |∇lag| below the crest's width: where the field is flat the
                  // front sweeps a whole patch at once, and shows nothing there.
                  const gv = lerp(l01 - l00, l11 - l10, u);
                  const grad2 = gu * gu + gv * gv;
                  if (e < 0 || 256 * e * e >= CREST.length ** 2 * grad2) continue;
                  const back = (16 * e) / Math.sqrt(grad2);
                  const own = sea[(ly0 + py) * m.w + lx0 + px];
                  const color = lift[own];
                  if (own === 0 || color === 0) continue;
                  const d = lerp(lerp(dist[k00], dist[k10], u), lerp(dist[k01], dist[k11], u), v);
                  const reef = lerp(lerp(sheltered[k00], sheltered[k10], u), lerp(sheltered[k01], sheltered[k11], u), v);
                  const hx = tw * 16 + px;
                  const hy = ty * 16 + py;
                  let show = CREST[Math.min(CREST.length - 1, Math.floor(back))] * clamp((d - FADE_FROM) / FADE_IN, 0, 1) * clamp((DIE_TO - d) / (DIE_TO - DIE_FROM), 0, 1) * Math.min(1, 2 * reef);
                  if (show <= 0 || landHash(hx >> BREAK_CELL, hy >> BREAK_CELL, 601 + 4 * n) < BREAK_SHARE) continue;
                  const h = landHash(hx, hy, 602 + 4 * n);
                  if (h >= show) continue;
                  show *= clamp((latticeAt(hx, hy, AMP_CELL, 600 + 4 * n) - AMP_FROM) / AMP_SPAN, 0, 1);
                  if (h >= show) continue;
                  // Fading out over the last two px before the beach, a cay or any ground.
                  const dry = ReefSwell.dryWithin(land, sea, m.w, lx0 + px, ly0 + py, tu * 16 + px, ty * 16 + py);
                  if (dry === 1 || (dry === 2 && h >= show * NEAR_DRY)) continue;
                  this.add(color, tu * 16 + px, ty * 16 + py);
                }
              }
            }
          }
        }
      }
    }

    /**
     * The field over tiles [wx0, wx0 + W) × [wy0, wy0 + H), per tile centre:
     * sheltered water (reef or lagoon), px from the open sea, and the time
     * the crest reaches it after leaving the open sea's edge. Null without
     * sheltered water. Kept while the window and the world stay the same.
     */
    private window(world: WorldState, f: TerrainField, wx0: number, wy0: number, W: number, H: number): SwellWindow | null {
      const key = `${wx0}|${wy0}|${W}|${H}|${world.seed}|${world.ticks}|${world.revision}`;
      if (key === this.windowKey) return this.windowAt;
      this.windowKey = key;
      this.windowAt = null;
      const sheltered = new Uint8Array(W * H);
      let any = false;
      for (let y = wy0; y < wy0 + H; y++) {
        for (let x = wx0; x < wx0 + W; x++) {
          const j = y * GRID_W + wrapX(x);
          if (f.key[j] === 0 && (f.reef[j] !== 0 || f.lagoon[j] > 0)) {
            sheltered[(y - wy0) * W + (x - wx0)] = 1;
            any = true;
          }
        }
      }
      if (!any) return null;
      const dist = new Float32Array(W * H);
      const lag = new Float32Array(W * H);
      for (let y = wy0; y < wy0 + H; y++) {
        for (let x = wx0; x < wx0 + W; x++) {
          const k = (y - wy0) * W + (x - wx0);
          // Only the corners of a cell with sheltered water are read.
          let near = false;
          for (let dy = -1; dy <= 1 && !near; dy++) {
            const r = y - wy0 + dy;
            if (r < 0 || r >= H) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const c = x - wx0 + dx;
              if (c >= 0 && c < W && sheltered[r * W + c]) { near = true; break; }
            }
          }
          if (!near) continue;
          const d = 16 * ReefSwell.toOpenSea(f, x, y);
          dist[k] = d;
          const wobble = (landHash(wrapX(x), y, 525) - 0.5) * 2 * WOBBLE;
          lag[k] = PERIOD * LAG_SPREAD * latticeAt(x * 16 + 8, y * 16 + 8, LAG_CELL, 521) - (d + wobble) / SPEED;
        }
      }
      this.windowAt = { sheltered, dist, lag };
      return this.windowAt;
    }

    /** Tiles from tile (x, y)'s centre to the nearest open sea's (water neither reef nor lagoon), up to REACH + 1. */
    private static toOpenSea(f: TerrainField, x: number, y: number): number {
      for (const [dx, dy, d] of NEAREST_FIRST) {
        const ny = y + dy;
        if (ny < 0 || ny >= GRID_H) continue;
        const j = ny * GRID_W + wrapX(x + dx);
        if (f.key[j] === 0 && f.reef[j] === 0 && f.lagoon[j] === 0) return d;
      }
      return REACH + 1;
    }

    /** When swell n leaves the open sea, s. */
    private static leaves(n: number): number {
      return (n + JITTER * landHash(n, 0, 520)) * PERIOD;
    }

    /**
     * 1 where ground (no sea in the composed picture) touches world pixel
     * (x, y), x unwrapped, 2 where it lies 2 px off, else 3. (lx, ly) is the
     * pixel in its chunk's `sea`, w wide.
     */
    private static dryWithin(land: PixelTerrain, sea: Uint8Array, w: number, lx: number, ly: number, x: number, y: number): number {
      const inside = lx >= 2 && ly >= 2 && lx < w - 2 && (ly + 2) * w < sea.length;
      let near = 3;
      for (const [dx, dy, r] of DRY_RING) {
        if (r >= near) continue;
        if (inside ? sea[(ly + dy) * w + lx + dx] === 0 : !ReefSwell.seaAt(land, x + dx, y + dy)) {
          if (r === 1) return 1;
          near = 2;
        }
      }
      return near;
    }

    /** Whether the sea shows at world pixel (x, y), x unwrapped. */
    private static seaAt(land: PixelTerrain, x: number, y: number): boolean {
      if (y < 0 || y >= GRID_H * 16) return false;
      const wx = ((x % WORLD_PX) + WORLD_PX) % WORLD_PX;
      const m = land.motion(Math.floor(wx / CHUNK_PX), Math.floor(y / CHUNK_PX));
      return !!m && !!m.sea && m.sea[(y % CHUNK_PX) * m.w + (wx % CHUNK_PX)] !== 0;
    }

    /** One art pixel at world pixel (x, y), x unwrapped like the origin. */
    private add(color: number, x: number, y: number): void {
      let path = this.paths.get(color);
      if (!path) {
        path = new Path2D();
        this.paths.set(color, path);
      }
      path.rect(x - this.originX * 16, y - this.originY * 16, 1, 1);
    }
  }
}
