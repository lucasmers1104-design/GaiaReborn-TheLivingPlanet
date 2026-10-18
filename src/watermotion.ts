/* =============================================================================
 * SimEarth 2.0 — surf on the coasts, current in the rivers
 * -----------------------------------------------------------------------------
 * Two quiet animations drawn into the frame over the cached terrain, from
 * what landsurf.ts read off each composed chunk; the chunks themselves are
 * never redrawn:
 *   - surf: as a swell comes in, the outer water row brightens a step, then
 *     the row beyond the foam line fills with foam and the foam line turns
 *     white, the whiter the bigger the wave; in the trough the foam line
 *     thins. Two swells of different period add up, so the beat runs 2–4 s,
 *     and the phase drifts along the coast, so no two stretches pulse
 *     together. Now and then a big wave throws spray (waterspray.ts), most
 *     often and highest at cliffs.
 *   - rivers: light pixels ride downstream along the river lines.
 * Only palette colours, one art pixel each, on the terrain's pixel grid.
 * Everything follows from a hash and the clock, so nothing is stored per
 * pixel and the game's speed does not matter; the picture changes STEP_MS
 * apart and is built for the visible tiles only. Hidden below MIN_TILE and
 * with "Effekte reduzieren".
 * ========================================================================== */

namespace SE {
  /** Seven pictures a second. */
  const STEP_MS = 140;
  /** CSS px per tile from which the water moves: further out an art pixel is smaller than a screen pixel. */
  const MIN_TILE = 16;
  /** Periods of the two swells whose sum is the surf, s. */
  const SWELL_A = 2.7;
  const SWELL_B = 3.9;
  /** The swell reaches the outer row this long before the foam line, s. */
  const SWELL_LEAD = 0.35;
  /** River drift, art px per second, and the gap between the places a light pixel may ride on. */
  const RIVER_SPEED = 4;
  const RIVER_GAP = 9;
  /** Share of those places that carry one. */
  const RIVER_SHARE = 0.45;
  /** Tiles built beyond the view, so a pan shows no bare edge before the next picture. */
  const AHEAD = 2;
  const CHUNK_PX = LAND_CHUNK * 16;
  const CHUNKS_X = GRID_W / LAND_CHUNK;
  const WORLD_PX = GRID_W * 16;

  /** The swell at time t (s) and phase f (cycles), -1..1. */
  function swellAt(t: number, f: number): number {
    return 0.6 * Math.sin(2 * Math.PI * (t / SWELL_A + f)) + 0.4 * Math.sin(2 * Math.PI * (t / SWELL_B + 1.7 * f + 0.37));
  }

  /**
   * What a surf pixel shows at swell s, given its hash threshold h (0..1) and
   * its own colour `own` (landsurf.ts), or -1 for nothing. The share of a
   * ring that shows grows with the swell above the ring's start, so pixels
   * come and go one by one:
   *   ring 1, the foam line: on the crest the ice ramp's whites, the whitest
   *     on the biggest waves; in the trough `own`, a step darker, so it thins;
   *   ring 2, beyond it: foam on the crest, white on the biggest waves;
   *   ring 3, the outer row: a step lighter on the crest still to come.
   */
  function surfColor(ring: number, s: number, h: number, own: number, ice: readonly number[]): number {
    const white = ice[ice.length - 1];
    if (ring === 1) {
      const crest = (s - 0.35) * 1.2;
      if (crest > h) return crest - 0.35 > h ? white : ice[ice.length - 2];
      return (-s - 0.55) * 0.9 > h ? own : -1;
    }
    if (ring === 2) {
      const crest = s - 0.1;
      return crest > h ? (crest - 0.5 > h ? ice[ice.length - 2] : own) : -1;
    }
    return (s - 0.3) * 0.8 > h ? own : -1;
  }

  export class WaterMotion {
    /** "Effekte reduzieren": the water stands still. */
    still = false;
    private key = '';
    /** The current picture: one path per palette index, art px from the origin tile's corner. */
    private paths = new Map<number, Path2D>();
    private originX = 0;
    private originY = 0;
    /** The swell by phase step, now and SWELL_LEAD ahead. */
    private readonly swell = new Float32Array(512);
    private colors: string[] = [];
    private ice: readonly number[] = [];
    private readonly spray = new WaterSpray();
    private readonly put = (color: number, x: number, y: number): void => this.add(color, x, y);

    /** Draw over the terrain (`ctx` in any transform; it is left at identity). */
    draw(
      ctx: CanvasRenderingContext2D, cam: LandCamera, cols: number, rows: number,
      world: WorldState, land: PixelTerrain, sea: boolean, now: number,
    ): void {
      const art = land.art;
      if (this.still || cam.tilePx < MIN_TILE || !land.ready || !art) return;
      const step = Math.floor(now / STEP_MS);
      const ox = Math.floor(cam.scrollX);
      const oy = Math.floor(cam.scrollY);
      const key = `${step}|${ox}|${oy}|${Math.ceil(cols)}|${Math.ceil(rows)}|${+sea}`;
      if (key !== this.key) {
        this.key = key;
        this.originX = ox;
        this.originY = oy;
        this.build(world, land, art, Math.ceil(cols), Math.ceil(rows), sea, (step * STEP_MS) / 1000);
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

    private build(world: WorldState, land: PixelTerrain, art: LandArt, cols: number, rows: number, sea: boolean, t: number): void {
      if (this.colors.length === 0) this.colors = art.manifest.palette.map(([r, g, b]) => `rgb(${r},${g},${b})`);
      this.ice = art.manifest.ramps.ice;
      this.paths = new Map();
      const tx0 = this.originX - AHEAD;
      const tx1 = this.originX + cols + 1 + AHEAD;
      const ty0 = Math.max(0, this.originY - AHEAD);
      const ty1 = Math.min(GRID_H, this.originY + rows + 1 + AHEAD);
      if (ty1 <= ty0) return;
      if (sea) this.surf(world, land, t, tx0, ty0, tx1, ty1);
      this.rivers(world, land, art, t, tx0, ty0, tx1, ty1);
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

    private surf(world: WorldState, land: PixelTerrain, t: number, tx0: number, ty0: number, tx1: number, ty1: number): void {
      const swell = this.swell;
      for (let q = 0; q < 256; q++) {
        swell[q] = swellAt(t, q / SURF_PHASE_STEPS);
        swell[256 + q] = swellAt(t + SWELL_LEAD, q / SURF_PHASE_STEPS);
      }
      for (let cy = Math.floor(ty0 / LAND_CHUNK); cy <= Math.floor((ty1 - 1) / LAND_CHUNK); cy++) {
        for (let cu = Math.floor(tx0 / LAND_CHUNK); cu <= Math.floor((tx1 - 1) / LAND_CHUNK); cu++) {
          const cw = ((cu % CHUNKS_X) + CHUNKS_X) % CHUNKS_X;
          const m = land.motion(cw, cy);
          if (!m) continue;
          for (let k = 0; k < m.surf.length; k++) {
            const at = m.surfAt[k];
            const x = cu * CHUNK_PX + (at & 0xffff);
            const y = cy * CHUNK_PX + (at >>> 16);
            const tx = x >> 4;
            const ty = y >> 4;
            if (tx < tx0 || tx >= tx1 || ty < ty0 || ty >= ty1) continue;
            const info = m.surf[k];
            const ring = (info >>> 8) & 255;
            // Rings 4–5 are the tidal wave's (fxshore.ts), as is all surf where one works the coast.
            if (ring > 3 || shoreBusy[ty * GRID_W + wrapX(tx)]) continue;
            const color = surfColor(ring, swell[(ring === 3 ? 256 : 0) + ((info >>> 16) & 255)], (info >>> 24) / 256, info & 255, this.ice);
            if (color < 0 || WaterMotion.city(world, tx, ty)) continue;
            this.add(color, x, y);
          }
          const sites = this.spray.sitesOf(m, cw, cy, world);
          for (let j = 0; j < sites.length; j++) {
            const k = sites[j] & 0xffffff;
            const at = m.surfAt[k];
            const x = cu * CHUNK_PX + (at & 0xffff);
            const y = cy * CHUNK_PX + (at >>> 16);
            if (x >> 4 < tx0 || x >> 4 >= tx1 || y >> 4 < ty0 || y >> 4 >= ty1 || WaterMotion.city(world, x >> 4, y >> 4)) continue;
            if (shoreBusy[(y >> 4) * GRID_W + wrapX(x >> 4)]) continue;
            // Spray rides the crests of the main swell, on big waves only: when the second swell is high too.
            const f = ((m.surf[k] >>> 16) & 255) / SURF_PHASE_STEPS;
            const wave = Math.floor(t / SWELL_A + f - 0.25);
            const age = (t / SWELL_A + f - 0.25 - wave) * SWELL_A;
            if (age >= SPRAY_LIFE || Math.sin(2 * Math.PI * ((t - age) / SWELL_B + 1.7 * f + 0.37)) <= 0) continue;
            const hx = cw * CHUNK_PX + (at & 0xffff);
            const strength = (sites[j] >>> 24) / 255;
            if (landHash(hx + wave * 4099, y, 406) >= sprayChance(strength)) continue;
            sprayDrops(age, strength, hx, y, wave, x, y, this.ice, this.put);
          }
        }
      }
    }

    private rivers(world: WorldState, land: PixelTerrain, art: LandArt, t: number, tx0: number, ty0: number, tx1: number, ty1: number): void {
      const p = land.field.paths;
      const x0 = tx0 * 16;
      const x1 = tx1 * 16;
      const y0 = ty0 * 16;
      const y1 = ty1 * 16;
      // Two steps over the river's body (water4): a light head, a fainter pixel upstream of it.
      const head = art.water[LAND_SHALLOW];
      const tail = art.water[LAND_SHALLOW - 1];
      const drift = t * RIVER_SPEED;
      for (const id of p.query(x0, y0, x1, y1)) {
        const ax = p.ax[id] + landWrapShift((x0 + x1) / 2, (p.ax[id] + p.bx[id]) / 2);
        const ay = p.ay[id];
        const vx = p.bx[id] - p.ax[id];
        const vy = p.by[id] - ay;
        const len = Math.hypot(vx, vy);
        if (len < 1e-6) continue;
        const ux = vx / len;
        const uy = vy / len;
        const u0 = p.along[id];
        const strand = p.strand[id];
        // Place k rides at k·GAP + drift along its strand, so it carries on across segments.
        for (let k = Math.ceil((u0 - drift) / RIVER_GAP); k * RIVER_GAP + drift < u0 + len; k++) {
          if (landHash(k, strand, 403) >= RIVER_SHARE) continue;
          const f = (k * RIVER_GAP + drift - u0) / len;
          const r = p.ra[id] + (p.rb[id] - p.ra[id]) * f;
          const lane = (landHash(k, strand, 404) * 2 - 1) * Math.max(0, r - 1.5);
          const x = ax + vx * f - uy * lane;
          const y = ay + vy * f + ux * lane;
          const hx = Math.floor(x);
          const hy = Math.floor(y);
          if (hx < x0 || hx >= x1 || hy < y0 || hy >= y1) continue;
          if (!WaterMotion.river(land, hx, hy) || WaterMotion.city(world, hx >> 4, hy >> 4)) continue;
          this.add(head, hx, hy);
          const bx = Math.floor(x - ux);
          const by = Math.floor(y - uy);
          if ((bx !== hx || by !== hy) && WaterMotion.river(land, bx, by) && !WaterMotion.city(world, bx >> 4, by >> 4)) this.add(tail, bx, by);
        }
      }
    }

    /** Whether river water shows at world pixel (x, y), x unwrapped. */
    private static river(land: PixelTerrain, x: number, y: number): boolean {
      if (y < 0 || y >= GRID_H * 16) return false;
      const wx = ((x % WORLD_PX) + WORLD_PX) % WORLD_PX;
      const m = land.motion(Math.floor(wx / CHUNK_PX), Math.floor(y / CHUNK_PX));
      if (!m || !m.river) return false;
      const bit = (y % CHUNK_PX) * m.w + (wx % CHUNK_PX);
      return ((m.river[bit >>> 5] >>> (bit & 31)) & 1) === 1;
    }

    /** A city on tile (tx, ty), x unwrapped, covers the water with its own picture. */
    private static city(world: WorldState, tx: number, ty: number): boolean {
      return ty >= 0 && ty < GRID_H && world.tech[ty * GRID_W + wrapX(tx)] !== Tech.None;
    }
  }
}
