/* =============================================================================
 * SimEarth 2.0 — salmon leaping upstream
 * -----------------------------------------------------------------------------
 * Once true bony fish live (migrations.ts), every river whose mouth opens onto
 * a sea with fish has its salmon run: the front of the run climbs from the
 * mouth almost to the source, and just behind it one salmon after another
 * leaps out of the water against the current; then the river rests a few
 * seconds and the next run sets off from the mouth. The leap and its splash
 * are all in the sprite (salmon_leap, tools/fx/fauna.js), a short steep arc
 * that fits a river running any way; this file only places and times them,
 * from a hash and the clock. A leap starts at its first frame and a river
 * that comes into view shows only leaps begun since, so nothing pops. Below
 * 16 px per tile and with "Effekte reduzieren" the rivers stay empty. Visual
 * only: the simulation never reads this.
 *
 * Wiring (render.ts / app.ts): `draw` expects ctx at identity (device pixels)
 * and leaves it there; `activeOn` tells the Examine window a run is in sight.
 * ========================================================================== */

namespace SE {
  /** CSS px per tile from which salmon are drawn; below that an art pixel is under a screen pixel. */
  const MIN_TILE = 16;
  const SPRITE = 'salmon_leap';
  /** Frames per direction (east, then west). */
  const FRAMES = 10;
  /** Art px from where a salmon leaves the water to where it dives back in (the sprite's arc). */
  const TRAVEL = 6;
  /** The front of a run climbs this fast, art px/s; between two runs the river rests this long, s. */
  const SPEED = 10;
  const REST = 6;
  /** A run ends this far short of the source: a share of the river, at least MIN art px. */
  const SOURCE_SHARE = 0.1;
  const SOURCE_MIN = 16;
  /** One salmon leaps every LEAP_EVERY s, up to JITTER s later, up to BEHIND art px downstream of the front. */
  const LEAP_EVERY = 0.6;
  const JITTER = 0.25;
  const BEHIND = 24;
  /** Below this east–west share of the way upstream, leaps alternate east and west. */
  const STRAIGHT_UP = 0.35;
  /** Tiles followed from a river's last tile to the sea, and tiles around its mouth where fish must live. */
  const MOUTH_WALK = 3;
  const FISH_REACH = 2;
  /** Rivers with a run drawn at once. */
  const MAX_RUNS = 8;
  /** Tiles beyond the view whose rivers are still looked at. */
  const AHEAD = 2;
  /** ms a leap keeps its tile in sight for the Examine tool; ms a draw is trusted; ms between looks at which rivers run. */
  const HOLD_MS = 2500;
  const FRESH_MS = 500;
  const CHECK_MS = 2000;

  /** When leap n of a run starts, s into the run. */
  export function salmonLeapAt(n: number, seed: number): number {
    return n * LEAP_EVERY + JITTER * landHash(n, seed, 417);
  }

  /** Seconds the front of a run takes up a river `length` art px long, and from one run's start to the next. */
  export function salmonRun(length: number): number {
    return Math.max(0, length - Math.max(SOURCE_MIN, SOURCE_SHARE * length)) / SPEED;
  }

  export function salmonCycle(length: number): number {
    return salmonRun(length) + REST;
  }

  /** Where leap n of a run takes off, art px from the river's source, on a river `length` art px long; -1 once the run is over. */
  export function salmonLeapAlong(n: number, seed: number, length: number): number {
    const t = salmonLeapAt(n, seed);
    if (n < 0 || t > salmonRun(length)) return -1;
    return Math.min(length, length - SPEED * t + BEHIND * landHash(n, seed, 418));
  }

  /** Frame (0–9) of leap n, `u` s into its run; −1 while it is under water. */
  export function salmonFrame(u: number, n: number, seed: number, fps: number): number {
    const f = Math.floor((u - salmonLeapAt(n, seed)) * fps);
    return f >= 0 && f < FRAMES ? f : -1;
  }

  /**
   * Whether a river whose last tile is `last` may have salmon: bony fish
   * live, it reaches the sea within MOUTH_WALK tiles, its mouth is not frozen
   * and fish live in the sea around it.
   */
  export function salmonRiver(world: WorldState, last: number): boolean {
    if (!salmonCanRun(world)) return false;
    const e = world.elevation;
    let sea = last;
    for (let k = 0; k <= MOUTH_WALK && sea >= 0 && e[sea] >= 0; k++) sea = world.riverDown[sea];
    if (sea < 0 || e[sea] >= 0 || world.temperature[sea] <= 2) return false;
    const x = sea % GRID_W;
    const y = (sea / GRID_W) | 0;
    for (let dy = -FISH_REACH; dy <= FISH_REACH; dy++) {
      if (y + dy < 0 || y + dy >= GRID_H) continue;
      for (let dx = -FISH_REACH; dx <= FISH_REACH; dx++) {
        const j = idx(wrapX(x + dx), y + dy);
        if (e[j] < 0 && world.density(j, Life.Fish) > 0) return true;
      }
    }
    return false;
  }

  /** River water without a city or ice at world art pixel (x, y), x unwrapped. */
  function wet(world: WorldState, land: PixelTerrain, x: number, y: number): boolean {
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (!WaterMotion.river(land, px, py)) return false;
    const i = idx(wrapX(px >> 4), py >> 4);
    return world.tech[i] === Tech.None && world.temperature[i] > 2;
  }

  /** A river (one strand of RiverPaths): its segments first..last, length in art px, hash seed, and whether salmon run it. */
  interface River {
    first: number;
    last: number;
    length: number;
    seed: number;
    runs: boolean;
  }

  export class SalmonLayer {
    /** "Effekte reduzieren": no salmon. */
    still = false;
    private readonly reducedMotion = typeof window !== 'undefined' && !!window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    private rivers = new Map<number, River>();
    private riversAt = -Infinity;
    private riversOf = -1;
    /** Clock (s) each river came into view, so it shows only leaps begun since. */
    private since = new Map<number, number>();
    /** Tiles of recent leaps, until when they count as in sight (ms). */
    private held: { tile: number; until: number }[] = [];
    private drawnAt = -Infinity;
    private world: WorldState | null = null;

    /** Draw the leaping salmon (`ctx` at identity, device pixels; left there). */
    draw(ctx: CanvasRenderingContext2D, cam: LandCamera, cols: number, rows: number, world: WorldState, land: PixelTerrain, now: number): void {
      const art = FxArt.shared();
      const sp = FX_MANIFEST.sprites[SPRITE];
      if (this.still || this.reducedMotion || cam.tilePx < MIN_TILE || !land.ready || !art.ready || !sp || !sp.mouth) {
        this.since.clear();
        return;
      }
      const p = land.field.paths;
      if (world !== this.world || p.ax.length !== this.riversOf || now - this.riversAt >= CHECK_MS) this.survey(world, p, now);
      this.drawnAt = now;
      const clock = now / 1000;
      const x0 = (Math.floor(cam.scrollX) - AHEAD) * 16;
      const x1 = (Math.floor(cam.scrollX) + Math.ceil(cols) + 1 + AHEAD) * 16;
      const y0 = Math.max(0, Math.floor(cam.scrollY) - AHEAD) * 16;
      const y1 = Math.min(GRID_H, Math.floor(cam.scrollY) + Math.ceil(rows) + 1 + AHEAD) * 16;
      const mid = (x0 + x1) / 2;
      const inView = new Set<number>();
      for (const id of p.query(x0, y0, x1, y1)) {
        if (inView.size >= MAX_RUNS) break;
        if (this.rivers.get(p.strand[id])?.runs) inView.add(p.strand[id]);
      }
      for (const s of this.since.keys()) if (!inView.has(s)) this.since.delete(s);
      this.held = this.held.filter((h) => h.until > now);
      const fps = sp.fps;
      for (const s of inView) {
        const r = this.rivers.get(s) as River;
        if (!this.since.has(s)) this.since.set(s, clock);
        const cycle = salmonCycle(r.length);
        const t = clock + cycle * landHash(r.seed, 0, 419);
        const start = Math.floor(t / cycle) * cycle;
        const u = t - start;
        const from = this.since.get(s) as number;
        for (let n = Math.max(0, Math.floor((u - FRAMES / fps - JITTER) / LEAP_EVERY)); n <= Math.floor(u / LEAP_EVERY); n++) {
          const f = salmonFrame(u, n, r.seed, fps);
          // Begun before the river came into view: it would pop up mid-air.
          if (f < 0 || clock - u + salmonLeapAt(n, r.seed) < from) continue;
          const a = salmonLeapAlong(n, r.seed, r.length);
          if (a < 0) continue;
          const leap = this.place(world, land, p, r, n, a);
          if (!leap) continue;
          const [x, y, dir] = leap;
          const vx = x + landWrapShift(mid, x);
          if (vx < x0 || vx >= x1 || y < y0 || y >= y1) continue;
          const west = dir < 0;
          art.drawSprite(ctx, cam, SPRITE, f + (west ? FRAMES : 0), Math.floor(vx), Math.floor(y), null,
            west ? sp.w - 1 - sp.mouth[0] : sp.mouth[0], sp.mouth[1]);
          if (f === 0) this.held.push({ tile: idx(wrapX(Math.floor(x / 16)), Math.floor(y / 16)), until: now + HOLD_MS });
        }
      }
    }

    /** Whether a salmon run is in sight on tile `tile` or a river segment touching it. */
    activeOn(world: WorldState, land: PixelTerrain, tile: number, now: number): boolean {
      void land;
      if (this.still || this.reducedMotion || world !== this.world || now - this.drawnAt > FRESH_MS) return false;
      const tx = tile % GRID_W;
      const ty = (tile / GRID_W) | 0;
      return this.held.some((h) => {
        if (h.until <= now) return false;
        const dx = Math.abs((h.tile % GRID_W) - tx);
        return Math.min(dx, GRID_W - dx) <= 1 && Math.abs(((h.tile / GRID_W) | 0) - ty) <= 1;
      });
    }

    /** Which rivers there are and which of them salmon run, from the river lines and the sea at their mouths. */
    private survey(world: WorldState, p: RiverPaths, now: number): void {
      if (world !== this.world) this.held = [];
      this.world = world;
      this.riversAt = now;
      this.riversOf = p.ax.length;
      this.rivers = new Map();
      for (let id = 0; id < p.ax.length; id++) {
        const s = p.strand[id];
        const len = Math.hypot(p.bx[id] - p.ax[id], p.by[id] - p.ay[id]);
        const r = this.rivers.get(s);
        if (r) {
          r.last = id;
          r.length = p.along[id] + len;
          continue;
        }
        const source = idx(wrapX(Math.floor(p.ax[id] / 16)), clampY(Math.floor(p.ay[id] / 16)));
        this.rivers.set(s, { first: id, last: id, length: len, seed: source, runs: false });
      }
      for (const r of this.rivers.values()) {
        const end = idx(wrapX(Math.floor(p.bx[r.last] / 16)), clampY(Math.floor(p.by[r.last] / 16)));
        r.runs = r.length > 2 * SOURCE_MIN && salmonRiver(world, end);
      }
    }

    /**
     * Where leap n takes off, `a` art px from the source of river r: a point
     * across the river, with the arc centred on it where the river is wide
     * enough, facing upstream (on a river running north or south, east and
     * west by turns); null where there is no open water to leap from.
     */
    private place(world: WorldState, land: PixelTerrain, p: RiverPaths, r: River, n: number, a: number): [number, number, number] | null {
      // The segment holding `a`: the last one of the river starting at or before it.
      let lo = r.first;
      let hi = r.last;
      while (lo < hi) {
        const m = (lo + hi + 1) >> 1;
        if (p.along[m] <= a) lo = m;
        else hi = m - 1;
      }
      const vx = p.bx[lo] - p.ax[lo];
      const vy = p.by[lo] - p.ay[lo];
      const len = Math.hypot(vx, vy);
      if (len < 1e-6) return null;
      const f = clamp((a - p.along[lo]) / len, 0, 1);
      const ux = vx / len;
      const uy = vy / len;
      const half = p.ra[lo] + (p.rb[lo] - p.ra[lo]) * f;
      const lane = (landHash(n, r.seed, 420) * 2 - 1) * Math.max(0, half - 2);
      const x = p.ax[lo] + vx * f - uy * lane;
      const y = p.ay[lo] + vy * f + ux * lane;
      // Segments run downstream: upstream is against them.
      const dir = Math.abs(ux) < STRAIGHT_UP ? (n % 2 === 0 ? 1 : -1) : -Math.sign(ux);
      if (wet(world, land, x - (dir * TRAVEL) / 2, y)) return [x - (dir * TRAVEL) / 2, y, dir];
      return wet(world, land, x, y) ? [x, y, dir] : null;
    }
  }
}
