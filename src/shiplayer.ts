/* =============================================================================
 * SimEarth 2.0 — ships on the map
 * -----------------------------------------------------------------------------
 * Draws `world.civ.ships` (fleets.ts) from 16 px per tile on as effect-atlas
 * sprites (tools/fx/ships.js), like the whales; below that nothing. Each ship
 * sails its route back and forth by the page's clock (a short stay in each
 * port), faces east or west by its heading, bobs, and leaves a wake while
 * it moves; its people's pennant (the civ atlas banner the cities fly) waves
 * at its mast top, smoke (the cities' chimney smoke) rises from its funnel.
 * A ship called to a sea battle turns back along its route to its harbour
 * and on to the battle point, where the two fleets hold facing each other
 * and fire volleys with splashes round the targets for FIGHT_MS at least,
 * however fast the game runs. A sunk ship then goes down: its sprite is
 * shifted down and cut off at its waterline while the wreck burns over it,
 * never faded, then the wreck's ring spreads and its planks go under; the
 * winners sail home and back onto their routes. The map keeps a sinking ship
 * until it is under, also after the simulation dropped it. Steel hulls
 * (freighter, warship) lie still in the water; the others bob.
 * "Effekte reduzieren": every ship stands on its route on frame 0.
 *
 * Sprite points come from the catalog's `mouth` in the east frames (west:
 * w − 1 − x): [pennantX, pennantY, funnelX, funnelY, sternX, sternY, waterY],
 * −1 for none: the mast top the pennant flies from, the funnel's top, the
 * stern on the water where the wake (`ship_wake` by its own mouth) begins,
 * and the foam row under the hull, the waterline. The east frames come first,
 * then the west ones. Visual only, `Math.random` free.
 * `drawShipSprite` also draws the settlers' boats (civfigures.ts).
 * ========================================================================== */

namespace SE {
  /** CSS px per tile from which ships are pixel sprites; below that an art pixel is under a screen pixel. */
  export const SHIP_MIN_TILE = 16;
  /** Tiles per second: a coastal ship, a liner, out to a battle, home from it. */
  const SPEED_COAST = 0.45;
  const SPEED_LINER = 0.8;
  const SPEED_OUT = 1.4;
  const SPEED_HOME = 0.8;
  /** Stay in each port at the ends of a route, in tiles of its way (s × speed). */
  const DWELL = 1.2;
  /** Bob: amplitude in art px and period in s. */
  const BOB = 0.5;
  const BOB_PERIOD = 2.8;
  /** Ships of the other side whose stations lie within this many art px are foes (one conflict at a time on the planet). */
  const BATTLE_PX = 12 * 16;
  /** A battle shows this long at least (ms), the winners wait at most this long for the other fleet, a sinking lasts SINK_MS. */
  const FIGHT_MS = 3000;
  const FIGHT_WAIT_MS = 9000;
  const SINK_MS = 2600;
  /** Hulls that lie still instead of bobbing. */
  const STEADY: ReadonlySet<string> = new Set(['ship_freighter', 'ship_warship']);
  /** Each ship fires every VOLLEY_MS (± 20 % by hash); the volley shows 4 frames, the splash 5 frames after SPLASH_AT. */
  const VOLLEY_MS = 1100;
  const VOLLEY_FRAME_MS = 100;
  const SPLASH_AT = 300;
  /** Where the splashes land: up to this many art px either way of the target, a few rows in front of its waterline. */
  const SPLASH_SPREAD = 14;
  const SPLASH_ROWS = 3;
  /** The waterline as a share of the sprite height where `mouth` names none (tools/fx/catalog.js: the lower third). */
  const WATERLINE = 2 / 3;
  /** Rows of the civ atlas banner that are its cloth (the rest is its pole). */
  const FLAG_ROWS = 4;
  const WAKE_ID = 'ship_wake';
  const VOLLEY_ID = 'ship_volley';
  const SPLASH_ID = 'ship_splash';
  const WRECK_ID = 'ship_wreck';
  /** Settlers' boats by Tech, and the expedition's three sailing ships (art px from the lead, east-facing). */
  const BOATS: readonly string[] = [
    'ship_raft', 'ship_raft', 'ship_dugout', 'ship_sailer', 'ship_steamer', 'ship_freighter', 'ship_freighter', 'ship_freighter',
  ];
  const EXPEDITION_ID = 'ship_sailer';
  const EXPEDITION: readonly (readonly [number, number])[] = [[0, 0], [-20, -9], [-22, 8]];
  /** The formation drawn north to south. */
  const EXPEDITION_ORDER: readonly number[] = [1, 0, 2];

  /** A ship's place and look in one frame. */
  export interface ShipPose {
    /** World art px of the sprite's anchor (its centre). */
    x: number;
    y: number;
    /** Facing west. */
    flip: boolean;
    /** Frame within its direction. */
    frame: number;
    moving: boolean;
    /** Index into the tribe colours, −1 for no pennant. */
    color: number;
    /** 0 afloat, up to 1 when the hull is under. */
    sink: number;
    /** Frame of the wreck over it, −1 for none. */
    wreck: number;
    /** Hash seed of its smoke's pace. */
    seed: number;
  }

  /** Civ atlas pieces at 1×, by `${block}|${variant}|${mirrored}`; null where the atlas has none. */
  const pieces = new Map<string, HTMLCanvasElement | null>();

  function civPiece(cities: CityLayer, block: string, v: number, mirror: boolean): HTMLCanvasElement | null {
    const key = `${block}|${v}|${+mirror}`;
    const hit = pieces.get(key);
    if (hit !== undefined) return hit;
    const atlas = cities.pixels;
    const sp = CIV_MANIFEST.blocks[block]?.variants[v];
    if (!atlas) return null;
    let canvas: HTMLCanvasElement | null = null;
    const c = sp ? (canvas = document.createElement('canvas')).getContext('2d') : null;
    if (sp && canvas && c) {
      const r = sp.rect;
      canvas.width = r.w;
      canvas.height = r.h;
      const image = c.createImageData(r.w, r.h);
      for (let y = 0; y < r.h; y++) {
        for (let x = 0; x < r.w; x++) {
          const a = ((r.y + y) * atlas.w + r.x + x) * 4;
          if (atlas.data[a + 3] < 128) continue;
          const o = (y * r.w + (mirror ? r.w - 1 - x : x)) * 4;
          image.data[o] = atlas.data[a];
          image.data[o + 1] = atlas.data[a + 1];
          image.data[o + 2] = atlas.data[a + 2];
          image.data[o + 3] = 255;
        }
      }
      c.putImageData(image, 0, 0);
    } else {
      canvas = null;
    }
    pieces.set(key, canvas);
    return canvas;
  }

  /** Frames per direction of a two-way sprite. */
  function half(sp: FxSprite): number {
    return Math.max(1, sp.frames.length >> 1);
  }

  /** The frame of a looping two-way sprite at time `now`, within its direction. */
  function loopFrame(sp: FxSprite, now: number, phase: number): number {
    return Math.floor(now / 1000 * sp.fps + phase) % half(sp);
  }

  /** The waterline's row in sprite `sp`. */
  function waterline(sp: FxSprite): number {
    const m = sp.mouth;
    return m && m.length > 6 && m[6] >= 0 ? m[6] : Math.round(sp.h * WATERLINE);
  }

  /** The ship lies still in the water rather than bobbing. */
  export function shipSteady(id: string): boolean {
    return STEADY.has(id);
  }

  /** A sprite point `k` of `mouth` (east frames) in world art px, facing taken into account; null for none. */
  function mouthAt(sp: FxSprite, k: number, p: ShipPose, dy: number): [number, number] | null {
    const m = sp.mouth;
    if (!m || m.length < k + 2 || m[k] < 0 || m[k + 1] < 0) return null;
    return [p.x - sp.ax + (p.flip ? sp.w - 1 - m[k] : m[k]), p.y - sp.ay + m[k + 1] + dy];
  }

  /**
   * Ship sprite `id` in pose `p` (ctx at identity, device pixels): the wake
   * under its stern while it moves, the hull (shifted down and cut off at
   * its waterline as it sinks), the wreck over it, the pennant at its mast top and
   * smoke from its funnel. `cities` gives the civ atlas; without it, or
   * before it is decoded, the ship flies no pennant and makes no smoke.
   */
  export function drawShipSprite(
    ctx: CanvasRenderingContext2D, cam: LandCamera, cities: CityLayer | null, id: string, p: ShipPose, now: number, still: boolean,
  ): void {
    const art = FxArt.shared();
    const sp = FX_MANIFEST.sprites[id];
    if (!sp || !art.ready) return;
    const n = half(sp);
    const wl = waterline(sp);
    const lineY = p.y - sp.ay + wl;
    const wake = FX_MANIFEST.sprites[WAKE_ID];
    const stern = mouthAt(sp, 4, p, 0);
    if (wake && stern && wake.mouth && p.moving && p.sink <= 0 && !still) {
      // The wake's own mouth (its narrow end) on the stern, fanning out behind the ship, under it.
      const sx = p.flip ? wake.w - 1 - wake.mouth[0] : wake.mouth[0];
      art.drawSprite(ctx, cam, WAKE_ID, loopFrame(wake, now, p.seed) + (p.flip ? half(wake) : 0), stern[0], stern[1], null, sx, wake.mouth[1]);
    }
    const dy = Math.round(clamp(p.sink, 0, 1) * wl);
    if (dy < wl) art.drawSprite(ctx, cam, id, p.frame % n + (p.flip ? n : 0), p.x, p.y + dy, p.sink > 0 ? [0, wl - dy] : null);
    const wreck = FX_MANIFEST.sprites[WRECK_ID];
    if (wreck && p.wreck >= 0) art.drawSprite(ctx, cam, WRECK_ID, p.wreck, p.x, lineY - waterline(wreck) + wreck.ay);
    if (!cities || !cities.pixels) return;
    const flag = mouthAt(sp, 0, p, dy);
    const banner = CIV_MANIFEST.blocks.banner;
    if (flag && p.color >= 0 && banner && p.color < banner.variants.length && flag[1] + FLAG_ROWS - 1 < lineY) {
      // The cloth streams aft: to the west of the pole when the ship sails east.
      const pic = civPiece(cities, 'banner', p.color, !p.flip);
      // Its pole column on the mast's line, its last row on the mast top: the pole lengthens the mast.
      if (pic) art.drawPixels(ctx, cam, pic, 0, 0, pic.width, FLAG_ROWS, p.flip ? flag[0] : flag[0] - pic.width + 1, flag[1] - FLAG_ROWS + 1);
    }
    const funnel = p.sink > 0 ? null : mouthAt(sp, 2, p, dy);
    const smoke = CIV_MANIFEST.blocks.smoke;
    if (funnel && smoke && smoke.variants.length > 0) {
      const f = cityPuffFrame('smoke', p.seed, 7, now, still, smoke.variants.length);
      const pic = civPiece(cities, 'smoke', f, false);
      const v = smoke.variants[f];
      if (pic) art.drawPixels(ctx, cam, pic, 0, 0, pic.width, pic.height, funnel[0] - v.ax, funnel[1] - 1 - v.ay);
    }
  }

  /** The pixel boat of a settler group of era `tech` (the expedition's sailing ship with `voyage`), or null where the SVG figure stays. */
  export function settlerBoatSprite(tech: Tech, voyage: boolean, tilePx: number): string | null {
    if (tilePx < SHIP_MIN_TILE || !FxArt.shared().ready) return null;
    const id = voyage ? EXPEDITION_ID : BOATS[clamp(tech, Tech.Stone, Tech.Nanotech)];
    return FX_MANIFEST.sprites[id] ? id : null;
  }

  /**
   * A settler group on the water as its pixel boat, centred on world art px
   * (x, y); the expedition as three sailing ships in a small formation.
   */
  export function drawSettlerBoat(
    ctx: CanvasRenderingContext2D, cam: LandCamera, cities: CityLayer | null, id: string, voyage: boolean,
    x: number, y: number, flip: boolean, moving: boolean, color: number, seed: number, now: number, still: boolean,
  ): void {
    const sp = FX_MANIFEST.sprites[id];
    if (!sp) return;
    const px = cam.tilePx * cam.dpr / 16;
    const snap = (v: number): number => Math.round(v * px) / px;
    const order = voyage ? EXPEDITION_ORDER : [0];
    for (const k of order) {
      const [ox, oy] = EXPEDITION[k];
      const bob = still || shipSteady(id) ? 0 : BOB * Math.sin((now / 1000 + k * 0.9 + seed) * (2 * Math.PI / BOB_PERIOD));
      const pose: ShipPose = {
        x: snap(x + (flip ? -ox : ox)), y: snap(y + oy + bob), flip, frame: still ? 0 : loopFrame(sp, now, seed + k * 1.7),
        moving, color, sink: 0, wreck: -1, seed: seed * 3 + k,
      };
      drawShipSprite(ctx, cam, cities, id, pose, now, still);
    }
  }

  /** The conflict is shown as a sea battle of pixel ships at this zoom, so the map leaves out its battle symbol (civfigures.ts). */
  export function seaBattleShown(k: Conflict, tilePx: number): boolean {
    return tilePx >= SHIP_MIN_TILE && k.sea !== undefined && k.sea >= 0 && FxArt.shared().ready && !!FX_MANIFEST.sprites.ship_galley;
  }

  /**
   * The wreck's frame `t` ms into a sinking: its burning loop while the hull
   * goes down (SINK_MS), then its last frames once (the ring spreads, the
   * planks go under); −1 once it is over. Still: the first frame while the hull sinks.
   */
  function wreckFrame(t: number, still: boolean): number {
    const w = FX_MANIFEST.sprites[WRECK_ID];
    if (!w || (still && t >= SINK_MS)) return -1;
    if (still) return 0;
    const loop = clamp(w.loop, 1, w.frames.length);
    if (t < SINK_MS) return Math.floor(t / 1000 * w.fps) % loop;
    const f = loop + Math.floor((t - SINK_MS) / 1000 * w.fps);
    return f < w.frames.length ? f : -1;
  }

  type Mode = 'route' | 'out' | 'fight' | 'home' | 'sink' | 'gone';

  interface Track {
    ship: Ship;
    seen: number;
    mode: Mode;
    /** `Ship.since` and the route the offset belongs to. */
    since: number;
    route: number[];
    /** On the route: tiles added to the clock's way, so ships keep their own place on it. */
    offset: number;
    /** Out to a battle or home from it: the tiles, the index it set out from and when. */
    path: number[];
    s0: number;
    t0: number;
    /** Where on `path` it fights (its station, the way's end), and where its mooring is on the way out. */
    hold: number;
    port: number;
    flip: boolean;
    fightAt: number;
    sinkAt: number;
    /** This frame: placed in view, world art px of its anchor, moving. */
    shown: boolean;
    x: number;
    y: number;
    moving: boolean;
    /** Index on `path` this frame. */
    at: number;
  }

  const point = { x: 0, y: 0, dx: 0 };

  /** World art px of index `s` along `path` (x on the copy of path[0]), and the heading in x of its step. */
  function along(path: readonly number[], s: number): typeof point {
    const L = path.length;
    const a = path[0];
    if (L < 2) {
      point.x = (a % GRID_W) * 16 + 8;
      point.y = ((a / GRID_W) | 0) * 16 + 8;
      point.dx = 0;
      return point;
    }
    const t = clamp(s, 0, L - 1);
    const n = Math.min(L - 2, Math.floor(t));
    const f = t - n;
    // Unwrapped x of path[n] relative to path[0], then the step to path[n + 1].
    let x = a % GRID_W;
    for (let k = 1; k <= n + 1; k++) {
      let d = (path[k] % GRID_W) - (path[k - 1] % GRID_W);
      if (d > GRID_W / 2) d -= GRID_W;
      if (d < -GRID_W / 2) d += GRID_W;
      if (k <= n) x += d;
      else point.dx = d;
    }
    const y0 = (path[n] / GRID_W) | 0;
    const y1 = (path[n + 1] / GRID_W) | 0;
    point.x = (x + point.dx * f) * 16 + 8;
    point.y = (y0 + (y1 - y0) * f) * 16 + 8;
    return point;
  }

  /** Index on a route of `L` tiles after `u` tiles of way, with a stay in each port: [index, heading +1/−1, moving]. */
  function routeAt(L: number, u: number): [number, number, boolean] {
    const run = L - 1;
    const period = 2 * (run + DWELL);
    let m = u % period;
    if (m < 0) m += period;
    if (m < DWELL) return [0, -1, false];
    if (m < DWELL + run) return [m - DWELL, 1, true];
    if (m < 2 * DWELL + run) return [run, 1, false];
    return [run - (m - 2 * DWELL - run), -1, true];
  }

  export class ShipLayer {
    /** "Effekte reduzieren": every ship stands on its route, frame 0. */
    still = false;
    private readonly reducedMotion = typeof window !== 'undefined' && !!window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    private readonly tracks = new Map<number, Track>();
    private frame = 0;

    /** Expects ctx at identity (device pixels) and leaves it there. `cities` supplies the civ atlas for pennants and smoke. */
    draw(ctx: CanvasRenderingContext2D, cam: LandCamera, world: WorldState, now: number, cities: CityLayer | null = null): void {
      const art = FxArt.shared();
      if (cam.tilePx < SHIP_MIN_TILE || !art.ready) return;
      const still = this.still || this.reducedMotion;
      const civ = world.civ;
      const stamp = ++this.frame;
      for (const s of civ.ships) {
        // A ship of a city gone (the civilization's tick stops with the last city) is not drawn.
        if (s.sunkAt < 0 && !civ.city(s.city)) continue;
        let tr = this.tracks.get(s.id);
        if (!tr) {
          tr = {
            ship: s, seen: stamp, mode: 'route', since: -1, route: s.route, offset: 0, path: [], s0: 0, t0: now, hold: 0, port: 0,
            flip: false,
            fightAt: 0, sinkAt: 0, shown: false, x: 0, y: 0, moving: false, at: 0,
          };
          this.tracks.set(s.id, tr);
        }
        tr.ship = s;
        tr.seen = stamp;
      }
      for (const [id, tr] of this.tracks) {
        // A ship the simulation dropped while it sinks on the map stays until it is under.
        const sinking = tr.ship.sunkAt >= 0 && (tr.mode === 'out' || tr.mode === 'fight' || tr.mode === 'sink');
        if (tr.seen !== stamp && !sinking) this.tracks.delete(id);
      }
      const T = cam.tilePx * cam.dpr;
      const px = T / 16;
      const cols = ctx.canvas.width / T;
      const rows = ctx.canvas.height / T;
      const snap = (v: number): number => Math.round(v * px) / px;
      const shown: Track[] = [];
      for (const tr of this.tracks.values()) {
        this.update(tr, world, now, still);
        tr.shown = false;
        if (tr.mode === 'gone' || !this.place(tr, world, now, still)) continue;
        // The copy on the wrapping map nearest the view.
        let rx = tr.x / 16 - cam.scrollX;
        rx -= Math.floor(rx / GRID_W) * GRID_W;
        if (rx > GRID_W - 3) rx -= GRID_W;
        const ry = tr.y / 16 - cam.scrollY;
        if (rx < -3 || rx > cols + 3 || ry < -2 || ry > rows + 2) continue;
        tr.x = snap((cam.scrollX + rx) * 16);
        tr.y = snap(tr.y);
        tr.shown = true;
        shown.push(tr);
      }
      shown.sort((a, b) => a.y - b.y);
      for (const tr of shown) {
        const s = tr.ship;
        // A warship from its harbour out to the battle and back to it.
        const fighting = tr.mode === 'fight' || tr.mode === 'sink' || (tr.mode === 'out' && tr.at >= tr.port) ||
          (tr.mode === 'home' && tr.at <= tr.path.length - 1 - tr.port);
        const id = shipSprite(s.tech, fighting);
        const sp = id ? FX_MANIFEST.sprites[id] : undefined;
        if (!id || !sp) continue;
        const sinking = tr.mode === 'sink';
        const bob = still || sinking || shipSteady(id) ? 0 : BOB * Math.sin((now / 1000 + (s.id % 97) * 0.37) * (2 * Math.PI / BOB_PERIOD));
        const sink = sinking ? (still ? 0.5 : clamp((now - tr.sinkAt) / SINK_MS, 0.001, 1)) : 0;
        drawShipSprite(ctx, cam, cities, id, {
          x: tr.x, y: snap(tr.y + bob), flip: tr.flip, frame: still ? 0 : loopFrame(sp, now, s.id % 13), moving: tr.moving,
          color: civ.tribe(s.tribe)?.color ?? -1, sink, wreck: sinking ? wreckFrame(now - tr.sinkAt, still) : -1, seed: s.id,
        }, now, still);
      }
      if (!still) this.drawVolleys(ctx, cam, shown, now);
    }

    /** Move a ship on between its ways: out to a battle, the fight, sinking or home, back onto its route. */
    private update(tr: Track, world: WorldState, now: number, still: boolean): void {
      const s = tr.ship;
      const battle = s.fight.length > 0;
      if (tr.mode === 'route') {
        if (tr.since !== s.since) this.join(tr, world, now, still);
        if (!battle || tr.route.length < 2) return;
        // Back along the route to its mooring, then the way to its station.
        const [at] = this.routeIndex(tr, now, still);
        const k = Math.ceil(at - 1e-9);
        tr.path = tr.route.slice(0, k + 1).reverse().concat(s.fight.slice(1));
        tr.s0 = k - at;
        tr.t0 = now;
        tr.hold = Math.max(tr.s0, tr.path.length - 1);
        tr.port = k;
        tr.mode = 'out';
      }
      if (tr.mode === 'out' && (still || tr.s0 + (now - tr.t0) / 1000 * SPEED_OUT >= tr.hold)) {
        tr.mode = 'fight';
        tr.fightAt = now;
      }
      if (tr.mode === 'fight' && now - tr.fightAt >= FIGHT_MS) {
        if (s.sunkAt >= 0) {
          tr.mode = 'sink';
          tr.sinkAt = now;
        } else if (!battle && (now - tr.fightAt >= FIGHT_WAIT_MS || !this.enemyAfloat(tr))) {
          tr.path = tr.path.slice().reverse();
          tr.s0 = tr.path.length - 1 - tr.hold;
          tr.t0 = now;
          tr.mode = 'home';
        }
      }
      if (tr.mode === 'home' && (still || tr.s0 + (now - tr.t0) / 1000 * SPEED_HOME >= tr.path.length - 1)) {
        // On its route again where it left it (or the nearest tile of a new one), sailing on outwards.
        this.join(tr, world, now, still);
        tr.mode = 'route';
      }
      if (tr.mode === 'sink' && wreckFrame(now - tr.sinkAt, still) < 0 && now - tr.sinkAt >= SINK_MS) tr.mode = 'gone';
    }

    /**
     * A ship on a new route sails on from the tile of the new route nearest
     * where it is (on its old route, or where it came home from a battle), so
     * it never jumps; a ship seen for the first time starts at its mooring
     * when just launched, else anywhere on its route.
     */
    private join(tr: Track, world: WorldState, now: number, still: boolean): void {
      const s = tr.ship;
      const clock = now / 1000 * this.speed(s);
      if (tr.since >= 0 && s.route.length >= 2) {
        const from = tr.mode === 'route' ? along(tr.route, this.routeIndex(tr, now, still)[0]) : along(tr.path, tr.path.length - 1);
        const x = from.x;
        const y = from.y;
        let k = 0;
        let best = Infinity;
        for (let n = 0; n < s.route.length; n++) {
          const i = s.route[n];
          let dx = (i % GRID_W) * 16 + 8 - x;
          dx -= Math.round(dx / (GRID_W * 16)) * GRID_W * 16;
          const d = dx * dx + (((i / GRID_W) | 0) * 16 + 8 - y) ** 2;
          if (d < best) {
            best = d;
            k = n;
          }
        }
        tr.offset = DWELL + k - clock;
      } else {
        const way = 2 * (s.route.length - 1 + DWELL);
        const fresh = world.ticks - s.since <= 1;
        tr.offset = (fresh ? DWELL * 0.5 : landHash(s.id, s.since, 0x5419) * way) - clock;
      }
      tr.since = s.since;
      tr.route = s.route;
    }

    private speed(s: Ship): number {
      return s.kind === 'liner' ? SPEED_LINER : SPEED_COAST;
    }

    /** Where on its route a ship is now: [index, heading, moving]; still, a hashed tile of it. */
    private routeIndex(tr: Track, now: number, still: boolean): [number, number, boolean] {
      const L = tr.route.length;
      if (still) return [Math.floor(landHash(tr.ship.id, 3, 0x5419) * L), 1, false];
      return routeAt(L, now / 1000 * this.speed(tr.ship) + tr.offset);
    }

    /** Some ship of the other side in this ship's battle is still out there or fighting. */
    private enemyAfloat(tr: Track): boolean {
      for (const o of this.tracks.values()) if ((o.mode === 'out' || o.mode === 'fight') && this.foes(tr, o)) return true;
      return false;
    }

    /** `o` fights for the other side in the battle `tr` fights in: their stations lie within BATTLE_PX. */
    private foes(tr: Track, o: Track): boolean {
      if (o.ship.side === tr.ship.side || o.path.length === 0 || tr.path.length === 0) return false;
      const a = along(tr.path, tr.path.length - 1);
      const ax = a.x;
      const ay = a.y;
      const b = along(o.path, o.path.length - 1);
      let dx = b.x - ax;
      dx -= Math.round(dx / (GRID_W * 16)) * GRID_W * 16;
      return dx * dx + (b.y - ay) ** 2 <= BATTLE_PX * BATTLE_PX;
    }

    /** Its anchor in world art px this frame, facing and motion; false where it would stand on land. */
    private place(tr: Track, world: WorldState, now: number, still: boolean): boolean {
      const s = tr.ship;
      let moving = false;
      let heading = 0;
      if (tr.mode === 'route') {
        if (tr.route.length < 2) return false;
        const [at, dir, go] = this.routeIndex(tr, now, still);
        const p = along(tr.route, at);
        tr.x = p.x;
        tr.y = p.y;
        heading = p.dx * dir;
        moving = go;
      } else {
        let at: number;
        if (tr.mode === 'out') at = still ? tr.hold : Math.min(tr.hold, tr.s0 + (now - tr.t0) / 1000 * SPEED_OUT);
        else if (tr.mode === 'home') at = Math.min(tr.path.length - 1, tr.s0 + (now - tr.t0) / 1000 * SPEED_HOME);
        else at = tr.hold;
        const p = along(tr.path, at);
        tr.x = p.x;
        tr.y = p.y;
        heading = p.dx;
        tr.at = at;
        moving = (tr.mode === 'out' && at < tr.hold) || tr.mode === 'home';
        if (tr.mode === 'fight' || tr.mode === 'sink') {
          const foe = this.foe(tr);
          if (foe) heading = foe.x - tr.x;
        }
      }
      if (heading !== 0) tr.flip = heading < 0;
      tr.moving = moving && !still;
      return world.isWater(this.tileOf(tr.x, tr.y));
    }

    private tileOf(x: number, y: number): number {
      return idx(wrapX(Math.floor(x / 16)), clamp(Math.floor(y / 16), 0, GRID_H - 1));
    }

    /** The nearest ship of the other side in the same battle that is out there, placed last frame or this one. */
    private foe(tr: Track): Track | null {
      let best: Track | null = null;
      let bestD = Infinity;
      for (const o of this.tracks.values()) {
        if ((o.mode !== 'out' && o.mode !== 'fight' && o.mode !== 'sink') || !this.foes(tr, o)) continue;
        let dx = o.x - tr.x;
        dx -= Math.round(dx / (GRID_W * 16)) * GRID_W * 16;
        const d = dx * dx + (o.y - tr.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = o;
        }
      }
      return best;
    }

    /**
     * Every fighting ship fires at the nearest ship of the other side every
     * VOLLEY_MS or so: arrows fly between them (to the Iron age) or its guns
     * flash at its side (from the Industrial age), and splashes rise round
     * the target a moment later.
     */
    private drawVolleys(ctx: CanvasRenderingContext2D, cam: LandCamera, shown: readonly Track[], now: number): void {
      const art = FxArt.shared();
      const volley = FX_MANIFEST.sprites[VOLLEY_ID];
      const splash = FX_MANIFEST.sprites[SPLASH_ID];
      for (const tr of shown) {
        if (tr.mode !== 'fight') continue;
        const foe = this.foe(tr);
        if (!foe || !foe.shown || foe.mode === 'sink') continue;
        const s = tr.ship;
        const period = VOLLEY_MS * (0.8 + 0.4 * landHash(s.id, 1, 0x7011));
        const t = now + landHash(s.id, 2, 0x7011) * period;
        const cycle = Math.floor(t / period);
        const c = t - cycle * period;
        let dx = foe.x - tr.x;
        dx -= Math.round(dx / (GRID_W * 16)) * GRID_W * 16;
        const modern = s.tech >= Tech.Industrial;
        if (volley && c < 4 * VOLLEY_FRAME_MS) {
          const f = (modern ? 4 : 0) + Math.floor(c / VOLLEY_FRAME_MS);
          const k = modern ? 0.3 : 0.45;
          art.drawSprite(ctx, cam, VOLLEY_ID, f, Math.round(tr.x + dx * k), Math.round(tr.y + (foe.y - tr.y) * k - 6));
        }
        if (splash && c >= SPLASH_AT && c < SPLASH_AT + splash.frames.length * VOLLEY_FRAME_MS) {
          const f = Math.floor((c - SPLASH_AT) / VOLLEY_FRAME_MS);
          const ox = Math.round((landHash(s.id, cycle, 0x7012) - 0.5) * 2 * SPLASH_SPREAD);
          const oy = 1 + Math.floor(landHash(s.id, cycle, 0x7013) * SPLASH_ROWS);
          const target = FX_MANIFEST.sprites[shipSprite(foe.ship.tech, true) ?? ''];
          const line = target ? foe.y - target.ay + waterline(target) : foe.y + 4;
          art.drawSprite(ctx, cam, SPLASH_ID, f, tr.x + dx + ox, line + oy);
        }
      }
    }
  }
}
