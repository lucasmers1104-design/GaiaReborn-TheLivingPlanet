/* =============================================================================
 * SimEarth 2.0 — storks migrating over the land
 * -----------------------------------------------------------------------------
 * Once modern birds (Avian sub-species 3 on, migrations.ts) live somewhere,
 * storks keep one migration route per planet, like the birds themselves: from
 * a breeding ground in the temperate belt towards the equator to a wintering
 * ground in the warm belt, as on today's Earth from Mitteleuropa to the Sahel.
 * The route is found once (storkRoute) and kept while both its ends stay
 * stork country; flocks of five to seven leave its breeding end on a fixed
 * beat and fly it in a V. Each bird flaps a few slow beats, then glides; the
 * frames are in the sprite (stork_glide, tools/fx/fauna.js), this file only
 * places the birds and times the beats. Their shadows fall south-east of
 * them like the clouds' (ambient.ts), further the higher they fly; on take-off
 * a bird grows as it climbs away from the ground and on landing it shrinks
 * back onto its shadow, and a flock fades in wherever it first comes into
 * view. Below 16 px per tile, with "Effekte reduzieren" and with reduced motion
 * no storks fly. Visual only: the simulation never reads this.
 *
 * Wiring (render.ts): `draw` expects ctx at identity (device pixels) and
 * leaves it there; the Examine tool asks `activeNear`.
 * ========================================================================== */

namespace SE {
  /** CSS px per tile from which storks fly; below that an art pixel is under a screen pixel. */
  const MIN_TILE = 16;
  const SPRITE = 'stork_glide';
  /** Frames per direction (south, then north) and the contract's frame rate (tools/fx/catalog.js). */
  const FRAMES = 8;
  const FPS = 8;
  /** Wing beats per bout of flapping (frames 0–3 each), then s of gliding (4–7); each bird starts its bout this many s after the one before. */
  const FLAPS = 2;
  const GLIDE = 2.5;
  const PHASE = 0.83;
  /** Where storks take off and land. */
  const HABITAT: ReadonlySet<number> = new Set([
    Landscape.Marsh, Landscape.Swampforest, Landscape.Meadow, Landscape.Steppe,
    Landscape.Savanna, Landscape.Forest, Landscape.Shrubland,
  ]);
  /**
   * Today's Earth: 51° N 10° E (Mitteleuropa) → 13° N 5° E (Sahel on the Niger) on the earth map grid (earthmap.ts),
   * tried first. Like the storks that winter in West Africa it crosses the Mediterranean where it is narrow (86 % land).
   */
  const EUROPE_AFRICA: readonly [number, number, number, number] = [135, 27, 131, 54];
  /** How far an end of that route may move to the nearest stork country, tiles. */
  const SNAP = 3;
  /** Breeding grounds lie between these latitudes, ° (either hemisphere); the wintering ground is at least WARM °C. */
  const BREED_LAT_MIN = 35;
  const BREED_LAT_MAX = 62;
  const WARM = 20;
  /** Length of a route, tiles; headings tried, rad off due south (north in the southern hemisphere). */
  const ROUTE_MIN = 14;
  const ROUTE_MAX = 40;
  const TILTS = [0, -0.2, 0.2, -0.4, 0.4];
  /** Share of a route that must lie over land; a northern route counts this many tiles longer. */
  const LAND_SHARE = 0.75;
  const NORTH_BONUS = 6;
  /** Ground speed, tiles/s; a flock leaves every INTERVAL s, up to SPREAD of it later; flocks fly up to SWAY tiles beside the route. */
  const SPEED = 0.45;
  const INTERVAL = 35;
  const SPREAD = 0.3;
  const SWAY = 0.7;
  /** Seconds to climb to cruise height after take-off and to come down before landing; s to fade in and out. */
  const CLIMB = 5;
  const FADE = 1.5;
  /** Size of a bird on the ground against at cruise height; shadows lie on the ground. */
  const LAND_SCALE = 0.55;
  /** At cruise height a shadow falls this many art px east and south of its bird (cloud shadows: 20). */
  const SHADOW_CRUISE = 10;
  const SHADOW_ALPHA = 0.3;
  const SHADOW_RGB = 'rgb(6,18,26)';
  const FLOCK_MIN = 5;
  const FLOCK_MAX = 7;
  /** The V, art px per rank: back along the heading and out to the side; jitter, ± art px. */
  const RANK_BACK = 12;
  const RANK_SIDE = 15;
  const JITTER = 2;
  /** Tiles beyond the view edge within which a flock is still drawn (half the widest V plus a sprite). */
  const REACH = 4;
  /** ms between checks that the route's ends are still stork country, and between searches that found none (one takes up to ~30 ms). */
  const CHECK_MS = 2000;
  const RETRY_MS = 15000;

  /** A V of n birds, art px from its centre: [ahead along the heading, to the right of it]; bird 0 leads. */
  export function storkFormation(n: number, seed: number): [number, number][] {
    // Which arm the second bird joins; with an even count that arm is the longer one.
    const first = landHash(n, 0, seed) < 0.5 ? 1 : -1;
    const out: [number, number][] = [];
    for (let k = 0; k < n; k++) {
      const rank = Math.ceil(k / 2);
      const side = k === 0 ? 0 : k % 2 ? first : -first;
      out.push([
        -rank * RANK_BACK + (landHash(k, 1, seed) * 2 - 1) * JITTER,
        side * rank * RANK_SIDE + (landHash(k, 2, seed) * 2 - 1) * JITTER,
      ]);
    }
    const a = out.reduce((s, p) => s + p[0], 0) / n;
    const b = out.reduce((s, p) => s + p[1], 0) / n;
    return out.map(([x, y]) => [x - a, y - b]);
  }

  /** Height as a share of cruise height, `u` s into a flight of `duration` s: up off the ground, a plateau, down again. */
  export function storkAltitude(u: number, duration: number): number {
    const climb = Math.min(CLIMB, duration / 2);
    return climb > 0 ? smoothstep(clamp(Math.min(u, duration - u) / climb, 0, 1)) : 0;
  }

  /** A bird's size at altitude `alt` (0..1): LAND_SCALE on the ground, full size at cruise height. */
  export function storkScale(alt: number): number {
    return LAND_SCALE + (1 - LAND_SCALE) * alt;
  }

  /** Frame (0–7) of bird k, `t` s into its flight: a few slow beats, then a longer glide. */
  export function storkFrame(t: number, k: number): number {
    const cycle = (FLAPS * 4) / FPS + GLIDE;
    let u = (t + k * PHASE) % cycle;
    if (u < 0) u += cycle;
    const f = Math.floor(u * FPS);
    return f < FLAPS * 4 ? f % 4 : 4 + (f % 4);
  }

  /** Whether tile b is tile a or one of its 8 neighbours (x wraps). */
  export function storkNear(a: number, b: number): boolean {
    const dx = Math.abs((a % GRID_W) - (b % GRID_W));
    return Math.min(dx, GRID_W - dx) <= 1 && Math.abs(((a / GRID_W) | 0) - ((b / GRID_W) | 0)) <= 1;
  }

  /** When flock j leaves the breeding ground, s on the layer's clock. */
  export function storkDeparture(j: number): number {
    return (j + SPREAD * landHash(j, 0, 431)) * INTERVAL;
  }

  /** Ice-free open land without a city that storks take off from and land on. */
  function storkGround(world: WorldState, i: number): boolean {
    return !world.isWater(i) && HABITAT.has(world.landscape[i]) && world.temperature[i] > 0 && world.tech[i] === Tech.None;
  }

  /** A migration route between tile centres, breeding ground (x0, y0) to wintering ground; x1 may run past the wrap. */
  export interface StorkRoute {
    readonly x0: number;
    readonly y0: number;
    readonly x1: number;
    readonly y1: number;
  }

  /** Tiles a straight flight from tile (x0, y0) to (x1, y1) passes over land, out of all it passes. */
  function landShare(world: WorldState, x0: number, y0: number, x1: number, y1: number): number {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    let land = 0;
    for (let s = 0; s <= steps; s++) {
      const y = Math.round(y0 + ((y1 - y0) * s) / steps);
      if (!world.isWater(idx(wrapX(Math.round(x0 + ((x1 - x0) * s) / steps)), clampY(y)))) land++;
    }
    return land / (steps + 1);
  }

  /** The stork country nearest tile (x, y) within SNAP, scanned ring by ring; -1 if none. */
  function snap(world: WorldState, x: number, y: number): number {
    for (let r = 0; r <= SNAP; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || y + dy < 0 || y + dy >= GRID_H) continue;
          const i = idx(wrapX(x + dx), y + dy);
          if (storkGround(world, i)) return i;
        }
      }
    }
    return -1;
  }

  /**
   * The planet's migration route, or null while no birds fly or no land
   * fits: Europe to Africa where today's Earth has them, else the longest
   * flight over land from a breeding ground towards the equator to a warm
   * wintering ground, northern routes first. Deterministic, so a planet keeps
   * finding the same route.
   */
  export function storkRoute(world: WorldState): StorkRoute | null {
    if (!storksCanFly(world)) return null;
    const a = snap(world, EUROPE_AFRICA[0], EUROPE_AFRICA[1]);
    const b = snap(world, EUROPE_AFRICA[2], EUROPE_AFRICA[3]);
    if (a >= 0 && b >= 0 && world.temperature[b] >= WARM) {
      const route = { x0: a % GRID_W, y0: (a / GRID_W) | 0, x1: b % GRID_W, y1: (b / GRID_W) | 0 };
      if (landShare(world, route.x0, route.y0, route.x1, route.y1) >= LAND_SHARE) return route;
    }
    let best: StorkRoute | null = null;
    let bestScore = -Infinity;
    // Every second tile is plenty to find a corridor; the search runs once per route.
    for (let y = 0; y < GRID_H; y += 2) {
      const lat = latitudeDeg(y);
      if (Math.abs(lat) < BREED_LAT_MIN || Math.abs(lat) > BREED_LAT_MAX) continue;
      const toward = lat > 0 ? 1 : -1;
      for (let x = 0; x < GRID_W; x += 2) {
        if (!storkGround(world, idx(x, y))) continue;
        for (const tilt of TILTS) {
          const hx = Math.sin(tilt);
          const hy = toward * Math.cos(tilt);
          let land = 1;
          for (let d = 1; d <= ROUTE_MAX; d++) {
            const tx = Math.round(x + hx * d);
            const ty = Math.round(y + hy * d);
            if (ty < 0 || ty >= GRID_H) break;
            const j = idx(wrapX(tx), ty);
            if (!world.isWater(j)) land++;
            if (d < ROUTE_MIN || land < LAND_SHARE * (d + 1) || world.temperature[j] < WARM || !storkGround(world, j)) continue;
            const score = d * (land / (d + 1)) + (toward > 0 ? NORTH_BONUS : 0);
            if (score > bestScore) {
              bestScore = score;
              best = { x0: x, y0: y, x1: tx, y1: ty };
            }
          }
        }
      }
    }
    return best;
  }

  /** A padded frame canvas (`k` px per art px) centred on world art px (cx, cy), `scale` times its size. */
  function blit(ctx: CanvasRenderingContext2D, cam: LandCamera, src: HTMLCanvasElement, k: number, cx: number, cy: number, scale: number): void {
    const s = (cam.tilePx * cam.dpr) / 16;
    const w = (src.width / k) * s * scale;
    const h = (src.height / k) * s * scale;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, Math.round((cx - cam.scrollX * 16) * s - w / 2), Math.round((cy - cam.scrollY * 16) * s - h / 2), w, h);
  }

  export class StorkLayer {
    /** "Effekte reduzieren": no storks. */
    still = false;
    private readonly reducedMotion = typeof window !== 'undefined' && !!window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    private route: StorkRoute | null = null;
    /** The planet and its tick the route (or its absence) was last decided for; when its ends were last checked, ms. */
    private routeSeed = -1;
    private routeTick = -1;
    private checked = -Infinity;
    /** Flocks shown by the last draw, and when each came into view (ms), so it fades in rather than pops. */
    private shown: number[] = [];
    private readonly since = new Map<number, number>();
    /** The last draw, ms. */
    private drawn = -Infinity;
    /** Dark 1× silhouettes of the frames, for the ground shadows. */
    private readonly shadows: HTMLCanvasElement[] = [];

    /** Draw the flocks with their ground shadows (`ctx` at identity, device pixels; left there). */
    draw(ctx: CanvasRenderingContext2D, cam: LandCamera, cols: number, rows: number, world: WorldState, now: number): void {
      const art = FxArt.shared();
      const sp = FX_MANIFEST.sprites[SPRITE];
      const route = this.still || this.reducedMotion || cam.tilePx < MIN_TILE || !sp || !art.ready ? null : this.routeFor(world, now);
      const before = new Set(this.shown);
      this.shown = [];
      if (!route || !sp) return;
      this.drawn = now;
      const clock = now / 1000;
      const T = cam.tilePx * cam.dpr;
      const k = T > 16 ? Math.ceil(T / 16 - 1e-6) : 1;
      const { x0, y0 } = route;
      const dx = route.x1 - x0;
      const dy = route.y1 - y0;
      const len = Math.hypot(dx, dy);
      const hx = dx / len;
      const hy = dy / len;
      const dur = len / SPEED;
      const turn = hy > 0 ? 0 : FRAMES;
      for (let j = Math.floor((clock - dur) / INTERVAL) - 1; j <= Math.floor(clock / INTERVAL); j++) {
        const u = clock - storkDeparture(j);
        if (u < 0 || u >= dur) continue;
        const sway = (landHash(j, 3, 431) * 2 - 1) * SWAY;
        // The copy of the flock on the wrapping map nearest the view.
        let rx = x0 + 0.5 + (dx * u) / dur - hy * sway - cam.scrollX;
        rx -= Math.floor(rx / GRID_W) * GRID_W;
        if (rx > GRID_W - REACH) rx -= GRID_W;
        const ry = y0 + 0.5 + (dy * u) / dur + hx * sway - cam.scrollY;
        if (rx < -REACH || rx > cols + REACH || ry < -REACH || ry > rows + REACH) continue;
        this.shown.push(j);
        if (!before.has(j)) this.since.set(j, now);
        const cx = (cam.scrollX + rx) * 16;
        const cy = (cam.scrollY + ry) * 16;
        const alt = storkAltitude(u, dur);
        const scale = storkScale(alt);
        const lift = alt * SHADOW_CRUISE;
        const fade = clamp(Math.min(u, dur - u, (now - (this.since.get(j) ?? now)) / 1000) / FADE, 0, 1);
        // The V turned onto the heading (ahead along (hx, hy), right along (−hy, hx)), northern birds first so the southern overlap them.
        const n = FLOCK_MIN + Math.floor(landHash(j, 1, 431) * (FLOCK_MAX - FLOCK_MIN + 1));
        const birds = storkFormation(n, Math.floor(landHash(j, 2, 431) * 1e9))
          .map(([al, si], b): [number, number, number] => [(al * hx - si * hy) * scale, (al * hy + si * hx) * scale, b])
          .sort((p, q) => p[1] - q[1]);
        ctx.globalAlpha = fade * SHADOW_ALPHA;
        for (const [bx, by, b] of birds) {
          const s = this.shadow(art, storkFrame(u, b) + turn);
          if (s) blit(ctx, cam, s, 1, cx + bx / scale * LAND_SCALE + lift, cy + by / scale * LAND_SCALE + lift, LAND_SCALE);
        }
        ctx.globalAlpha = fade;
        for (const [bx, by, b] of birds) {
          const f = storkFrame(u, b) + turn;
          if (scale >= 1) {
            art.drawSprite(ctx, cam, SPRITE, f, cx + bx, cy + by);
            continue;
          }
          const src = art.frame(SPRITE, f, k);
          if (src) blit(ctx, cam, src, k, cx + bx, cy + by, scale);
        }
      }
      ctx.globalAlpha = 1;
      for (const j of this.since.keys()) if (!this.shown.includes(j)) this.since.delete(j);
    }

    /** The tile under the centre of a flock on `tile` or one of its 8 neighbours, or -1. */
    activeNear(tile: number, now: number): number {
      const route = this.route;
      if (!route || this.still || this.reducedMotion || now - this.drawn > 500) return -1;
      const dx = route.x1 - route.x0;
      const dy = route.y1 - route.y0;
      const len = Math.hypot(dx, dy);
      const dur = len / SPEED;
      for (const j of this.shown) {
        const p = clamp((now / 1000 - storkDeparture(j)) / dur, 0, 1);
        const sway = (landHash(j, 3, 431) * 2 - 1) * SWAY;
        const y = Math.floor(route.y0 + 0.5 + dy * p + (dx / len) * sway);
        if (y < 0 || y >= GRID_H) continue;
        const c = idx(wrapX(Math.floor(route.x0 + 0.5 + dx * p - (dy / len) * sway)), y);
        if (storkNear(tile, c)) return c;
      }
      return -1;
    }

    /** The route, kept while birds fly and both its ends are stork country; looked for again only once the world has moved on. */
    private routeFor(world: WorldState, now: number): StorkRoute | null {
      if (world.seed !== this.routeSeed) {
        this.routeSeed = world.seed;
        this.routeTick = -1;
        this.route = null;
      }
      if (this.route && now - this.checked >= CHECK_MS) {
        this.checked = now;
        const r = this.route;
        if (!storksCanFly(world) || !storkGround(world, idx(wrapX(r.x0), r.y0)) || !storkGround(world, idx(wrapX(r.x1), r.y1))) {
          this.route = null;
          this.routeTick = -1;
        }
      }
      if (!this.route && world.ticks !== this.routeTick && (this.routeTick < 0 || now - this.checked >= RETRY_MS)) {
        this.routeTick = world.ticks;
        this.route = storkRoute(world);
        this.checked = now;
      }
      return this.route;
    }

    /** Frame f as a flat dark silhouette at 1× (with the atlas's padding), made once. */
    private shadow(art: FxArt, f: number): HTMLCanvasElement | null {
      const hit = this.shadows[f];
      if (hit) return hit;
      const src = art.frame(SPRITE, f, 1);
      if (!src) return null;
      const out = document.createElement('canvas');
      out.width = src.width;
      out.height = src.height;
      const c = out.getContext('2d');
      if (!c) return null;
      c.drawImage(src, 0, 0);
      c.globalCompositeOperation = 'source-in';
      c.fillStyle = SHADOW_RGB;
      c.fillRect(0, 0, out.width, out.height);
      return (this.shadows[f] = out);
    }
  }
}
