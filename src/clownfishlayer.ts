/* =============================================================================
 * SimEarth 2.0 — clownfish slipping out of the corals
 * -----------------------------------------------------------------------------
 * On every reef, at any time (kept simple on purpose: no date, no grazing
 * fish needed), now and then one fish or a pair slips out of a large coral
 * head, swims a short loop under the water, pauses, and slips back into the
 * same head or one beside it. Each reef tile makes such a trip in a share of
 * its hashed rounds; in view, a trip that starts keeps the others in for a
 * few seconds and at most CLOWNFISH_MAX run at once (first come, first
 * served), so even a large reef looks rarely but truly alive. The fish
 * (sprite `clownfish`, tools/fx/reeffish.js) only ever swim over reef and
 * lagoon water as composed (not the open sea's blue, where the sprite's
 * shadow would read as an outline, nor a cay, palm crown, land or city), and
 * a reef that comes into view shows only trips begun since, so nothing pops
 * up mid-water. Below MIN_TILE and with "Effekte reduzieren" the reefs stay
 * still. Visual only, from a hash and the clock: the simulation never reads
 * this.
 *
 * Wiring (render.ts): `draw` with the "Leben" layer, after WaterMotion and
 * ReefSwell (a crest paints the composed sea's colour, which would cut holes
 * into a fish under it); expects ctx at identity (device pixels) and leaves
 * it there.
 * ========================================================================== */

namespace SE {
  /**
   * Device px per tile (CSS px × devicePixelRatio) from which clownfish are
   * drawn: an art px of 1.5 screen px still shows the stripes; at 32 CSS px
   * the fish appeared only in the top third of the zoom (10–48) and players
   * missed them.
   */
  const MIN_TILE = 24;
  const SPRITE = 'clownfish';
  /** Frames per direction: 0–1 slipping out of the coral (played 1, 0 slipping back in), 2–5 the swim cycle. */
  const FRAMES = 6;
  const SWIM_FIRST = 2;
  const SWIM_FRAMES = 4;
  /** Ticks (1/fps) frame 0 (deep and dim) and frame 1 (half colour) are held while a fish slips out or in. */
  const DEEP_TICKS = 3;
  const HALF_TICKS = 2;
  /** The fish's centre pixel in its 8×8 box: nose to tail runs over pixels 0–6 (tools/fx/reeffish.js). */
  const BODY_CENTRE = 3;
  /** Direction (HAZARD_NX/NY order) by octant of the heading, clockwise from east (y runs down). */
  const OCTANT_DIR: readonly number[] = [4, 7, 6, 5, 3, 0, 1, 2];
  /** A reef tile's round lasts CYCLE_MIN..CYCLE_MAX s by hash; in ACTIVE_SHARE of its rounds its fish make a trip. */
  const CYCLE_MIN = 25;
  const CYCLE_MAX = 45;
  const ACTIVE_SHARE = 0.35;
  /** Trips running in view at once, at most; after a trip starts, the next one in view waits CALM_MIN..CALM_MAX s (hash). */
  export const CLOWNFISH_MAX = 3;
  const CALM_MIN = 3;
  const CALM_MAX = 10;
  /** How far a trip's loop reaches out from its coral, art px; how far it bends aside, as a share of that. */
  const REACH_MIN = 6;
  const REACH_MAX = 14;
  const BEND_MIN = 0.25;
  const BEND_MAX = 0.45;
  /** Mean speed along the loop, art px/s; one fish's whole trip, s; its pause at the loop's far end, s. */
  const SPEED_MIN = 4;
  const SPEED_MAX = 8;
  const TRIP_MIN = 4;
  const TRIP_MAX = 7;
  const HOVER_MIN = 0.3;
  const HOVER_MAX = 1.2;
  /** Share of trips made by a pair; the second fish trails by TRAIL_MIN..TRAIL_MAX s and 1–2 px aside. */
  const PAIR_SHARE = 0.6;
  const TRAIL_MIN = 0.3;
  const TRAIL_MAX = 0.6;
  /** From a round's start to the latest a trip in it ends, s: a tile's trips never overlap. */
  const TRIP_SPAN = TRIP_MAX + TRAIL_MAX;
  /** The largest heads of a tile fish live in; the share of trips ending in another head at most NEIGHBOUR px away. */
  const HOMES = 3;
  const NEIGHBOUR_SHARE = 0.4;
  const NEIGHBOUR = 10;
  /** Headings tried for a loop over reef water, each at its reach and then at REACH_MIN. */
  const HEADINGS = 6;
  /** Points along a loop checked for reef water. */
  const PATH_STEPS = 64;
  /** Art px around a fish's centre that must be reef water: its body is 7 px nose to tail; its shadow 1 px more down-right. */
  const BODY = 3;
  const SHADOW = 1;
  /** A trip first seen later than this after its start (a stalled frame, a hidden tab) is skipped: it would pop up mid-water. */
  const GRACE = 0.5;
  /** A trip counts as in sight for the Examine tool until SIGHT_HOLD s after its fish are back in, while the layer drew within SIGHT_FRESH_MS. */
  const SIGHT_HOLD = 2;
  const SIGHT_FRESH_MS = 500;
  /** Tiles beyond the view whose reefs are still looked at. */
  const AHEAD = 1;
  const WORLD_PX = GRID_W * 16;
  const CHUNK_PX = LAND_CHUNK * 16;

  /** A trip running in view, as far as letting the next one start goes (clownfishAdmit). */
  export interface ClownfishSlot {
    /** Clock (s) the first fish starts slipping out, and the last one is back in. */
    readonly start: number;
    readonly end: number;
    /** No other trip in view starts before this clock (s). */
    readonly calm: number;
  }

  /** One excursion of a reef tile's fish. Positions in art px, x wrapped as the tile's. */
  export interface ClownfishTrip extends ClownfishSlot {
    readonly tile: number;
    /** Centres of the head the fish leave and the one they return to. */
    readonly hx: number; readonly hy: number; readonly dx: number; readonly dy: number;
    /** The loop: outward unit vector, reach and (signed) bend aside, art px. */
    readonly ux: number; readonly uy: number; readonly reach: number; readonly bend: number;
    /** Seconds one fish takes to slip out (and in), to swim the loop, and pausing at its far end. */
    readonly slip: number; readonly swim: number; readonly hover: number;
    /** Fish on the trip (1 or 2); the second one's delay, s, and offset, art px. */
    readonly fish: number; readonly trail: number; readonly ox: number; readonly oy: number;
  }

  type Loop = Pick<ClownfishTrip, 'hx' | 'hy' | 'dx' | 'dy' | 'ux' | 'uy' | 'reach' | 'bend'>;

  const waterOf = new WeakMap<LandArt, Uint8Array>();

  /**
   * 1 for the palette indices of the composed sea fish swim over: lagoon,
   * reef and coral, anything but the open sea's blue (water and shelf ramps,
   * the surf's foam among them), where the sprite's light shadow would read
   * as an outline.
   */
  export function clownfishWater(art: LandArt): Uint8Array {
    let out = waterOf.get(art);
    if (!out) {
      out = new Uint8Array(256).fill(1);
      for (const k of art.water) out[k] = 0;
      for (const k of art.shelf) out[k] = 0;
      out[0] = 0;
      waterOf.set(art, out);
    }
    return out;
  }

  /** Whether clownfish live on tile i: any reef. */
  export function clownfishReef(f: TerrainField, i: number): boolean {
    return f.reef[i] !== CoralKind.None;
  }

  /** The round of tile `tile` at `clock` (s) and when a trip in it starts; null in a round its fish stay in. */
  export function clownfishRound(tile: number, clock: number): [number, number] | null {
    const cycle = CYCLE_MIN + (CYCLE_MAX - CYCLE_MIN) * landHash(tile, 0, 1810);
    const shift = cycle * landHash(tile, 1, 1810);
    const round = Math.floor((clock + shift) / cycle);
    if (landHash(tile, round, 1811) >= ACTIVE_SHARE) return null;
    return [round, round * cycle - shift + (cycle - TRIP_SPAN) * landHash(tile, round, 1812)];
  }

  /** Seconds after the start of tile `tile`'s trip in round `round` before another trip in view may start. */
  export function clownfishCalm(tile: number, round: number): number {
    return CALM_MIN + (CALM_MAX - CALM_MIN) * landHash(tile, round, 1813);
  }

  /** Whether a trip starting at `start` may run: none of the `live` ones keeps the reef calm then, and fewer than CLOWNFISH_MAX still run. */
  export function clownfishAdmit(live: readonly ClownfishSlot[], start: number): boolean {
    let n = 0;
    for (const t of live) {
      if (t.calm > start) return false;
      if (t.end > start) n++;
    }
    return n < CLOWNFISH_MAX;
  }

  /** Centres of the stony coral heads on reef tile (xw, y), art px, the largest first. */
  export function clownfishHomes(f: TerrainField, art: LandArt, xw: number, y: number): [number, number][] {
    const out: LandPlacement[] = [];
    placeLandReef(f, art, xw, xw, y, out);
    return out.filter((p) => p.sprite.id === 'coral_stony' || p.sprite.id === 'coral_rugose')
      .sort((a, b) => b.sprite.w * b.sprite.h - a.sprite.w * a.sprite.h || a.seq - b.seq)
      .map((p): [number, number] => [p.fx - p.sprite.ax + (p.sprite.w >> 1), p.fy - p.sprite.ay + (p.sprite.h >> 1)]);
  }

  /** Point s (0..1) of a loop and its heading: out from the home head, round, and into the destination. */
  function loopAt(l: Loop, s: number): [number, number, number, number] {
    const a = Math.sin(Math.PI * s) * l.reach;
    const b = Math.sin(2 * Math.PI * s) * l.bend;
    const da = Math.PI * Math.cos(Math.PI * s) * l.reach;
    const db = 2 * Math.PI * Math.cos(2 * Math.PI * s) * l.bend;
    // The bend runs across the outward vector (-uy, ux): out on one side, back on the other.
    return [
      l.hx + (l.dx - l.hx) * s + l.ux * a - l.uy * b,
      l.hy + (l.dy - l.hy) * s + l.uy * a + l.ux * b,
      l.dx - l.hx + l.ux * da - l.uy * db,
      l.dy - l.hy + l.uy * da + l.ux * db,
    ];
  }

  /** Reef water under a fish centred on (x, y), whichever way it faces, and under its shadow. */
  function clear(sea: (x: number, y: number) => boolean, x: number, y: number): boolean {
    for (let dy = -BODY; dy <= BODY + SHADOW; dy++) for (let dx = -BODY; dx <= BODY + SHADOW; dx++) if (!sea(x + dx, y + dy)) return false;
    return true;
  }

  /**
   * The trip of round `round` of tile `tile`, starting at `start`, from its
   * coral heads `homes` (clownfishHomes): a home among the largest heads (the
   * hashed one, else the next that has room), a loop out over reef water
   * (`sea`, by art px) and the head it ends in, the fish and their timing.
   * Null where no loop finds reef water all round.
   */
  export function clownfishTrip(
    tile: number, round: number, start: number, homes: readonly (readonly [number, number])[],
    sea: (x: number, y: number) => boolean, fps: number,
  ): ClownfishTrip | null {
    const h = (salt: number): number => landHash(tile, round, salt);
    const large = Math.min(HOMES, homes.length);
    const first = Math.floor(h(1820) * large);
    for (let m = 0; m < large; m++) {
      const trip = clownfishLoop(tile, round, start, homes, homes[(first + m) % large], sea, fps);
      if (trip) return trip;
    }
    return null;
  }

  /** A trip from head `home` (clownfishTrip), or null where no loop from it finds reef water all round. */
  function clownfishLoop(
    tile: number, round: number, start: number, homes: readonly (readonly [number, number])[], home: readonly [number, number],
    sea: (x: number, y: number) => boolean, fps: number,
  ): ClownfishTrip | null {
    const h = (salt: number): number => landHash(tile, round, salt);
    const near = homes.filter((q) => q !== home && Math.hypot(q[0] - home[0], q[1] - home[1]) <= NEIGHBOUR);
    const dest = near.length > 0 && h(1821) < NEIGHBOUR_SHARE ? near[Math.floor(h(1822) * near.length)] : home;
    const fish = h(1823) < PAIR_SHARE ? 2 : 1;
    const trail = fish === 2 ? TRAIL_MIN + (TRAIL_MAX - TRAIL_MIN) * h(1824) : 0;
    const aside = (h(1825) < 0.5 ? -1 : 1) * (h(1826) < 0.5 ? 1 : 2);
    const bend = (BEND_MIN + (BEND_MAX - BEND_MIN) * h(1827)) * (h(1828) < 0.5 ? -1 : 1);
    const heading = h(1829) * Math.PI * 2;
    const slip = (DEEP_TICKS + HALF_TICKS) / fps;
    // A fish leaves its head only where it can sit on it, its shadow in reef water.
    if (!clear(sea, home[0], home[1])) return null;
    for (const reach of [REACH_MIN + (REACH_MAX - REACH_MIN) * h(1830), REACH_MIN]) {
      for (let k = 0; k < HEADINGS; k++) {
        const a = heading + (k * 2 * Math.PI) / HEADINGS;
        const ux = Math.cos(a);
        const uy = Math.sin(a);
        const ox = fish === 2 ? Math.round(-uy * aside) : 0;
        const oy = fish === 2 ? Math.round(ux * aside) : 0;
        const loop: Loop = { hx: home[0], hy: home[1], dx: dest[0], dy: dest[1], ux, uy, reach, bend: bend * reach };
        let len = 0;
        let ok = true;
        let lx = home[0];
        let ly = home[1];
        for (let n = 0; n <= PATH_STEPS && ok; n++) {
          const [x, y] = loopAt(loop, n / PATH_STEPS);
          len += Math.hypot(x - lx, y - ly);
          lx = x;
          ly = y;
          const px = Math.round(x);
          const py = Math.round(y);
          ok = clear(sea, px, py) && (fish === 1 || clear(sea, px + ox, py + oy));
        }
        if (!ok) continue;
        const total = TRIP_MIN + (TRIP_MAX - TRIP_MIN) * h(1831);
        const pause = HOVER_MIN + (HOVER_MAX - HOVER_MIN) * h(1832);
        const swim = len / clamp(len / (total - 2 * slip - pause), SPEED_MIN, SPEED_MAX);
        const hover = clamp(total - 2 * slip - swim, 0, HOVER_MAX);
        return {
          tile, start, end: start + trail + 2 * slip + swim + hover, calm: start + clownfishCalm(tile, round),
          ...loop, slip, swim, hover, fish, trail, ox, oy,
        };
      }
    }
    return null;
  }

  /**
   * Fish k of trip t, `u` s after the trip's start: its centre (art px, whole
   * pixels, x wrapped as the trip's) and frame; null while it is in its coral.
   */
  export function clownfishAt(t: ClownfishTrip, k: number, u: number, fps: number): [number, number, number] | null {
    const tau = u - k * t.trail;
    const far = t.slip + t.swim / 2;
    const back = far + t.hover;
    const home = back + t.swim / 2;
    if (k >= t.fish || tau < 0 || tau >= home + t.slip) return null;
    // Swim frames counted from the end of slipping out, so the cycle starts at its first frame.
    const beat = (tau - t.slip) * fps;
    let s: number;
    let f: number;
    if (tau < t.slip) {
      s = 0;
      f = tau * fps < DEEP_TICKS ? 0 : 1;
    } else if (tau < far) {
      s = (tau - t.slip) / t.swim;
      f = SWIM_FIRST + (Math.floor(beat) % SWIM_FRAMES);
    } else if (tau < back) {
      // Hanging in the water at the loop's far end, the tail beating slower.
      s = 0.5;
      f = SWIM_FIRST + (Math.floor(beat / 2) % SWIM_FRAMES);
    } else if (tau < home) {
      s = 0.5 + (tau - back) / t.swim;
      f = SWIM_FIRST + (Math.floor(beat) % SWIM_FRAMES);
    } else {
      s = 1;
      f = (tau - home) * fps < HALF_TICKS ? 1 : 0;
    }
    const [x, y, vx, vy] = loopAt(t, s);
    const octant = ((Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) % 8) + 8) % 8;
    return [Math.round(x) + k * t.ox, Math.round(y) + k * t.oy, OCTANT_DIR[octant] * FRAMES + f];
  }

  export class ClownfishLayer {
    /** "Effekte reduzieren": no fish. */
    still = false;
    private readonly reducedMotion = typeof window !== 'undefined' && !!window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    /** Clock (s) each clownfish reef in view came into view, so it shows only trips begun since. */
    private readonly since = new Map<number, number>();
    /** Each reef tile's decided round: its trip, or null where its fish stay in or the cap held them back. */
    private readonly rounds = new Map<number, { round: number; trip: ClownfishTrip | null }>();
    /** Trips running in view. */
    private live: ClownfishTrip[] = [];
    private world: WorldState | null = null;
    private drawnAt = -Infinity;

    /** Whether clownfish are out (or slipped back in up to SIGHT_HOLD s ago) on tile `tile` or beside it, for the Examine tool. */
    activeOn(world: WorldState, tile: number, now: number): boolean {
      if (world !== this.world || now - this.drawnAt > SIGHT_FRESH_MS) return false;
      const clock = now / 1000;
      const tx = tile % GRID_W;
      const ty = (tile / GRID_W) | 0;
      return this.live.some((t) => {
        if (clock < t.start || clock > t.end + SIGHT_HOLD) return false;
        const dx = Math.abs((t.tile % GRID_W) - tx);
        return Math.min(dx, GRID_W - dx) <= 1 && Math.abs(((t.tile / GRID_W) | 0) - ty) <= 1;
      });
    }

    /** Draw the clownfish out of their corals (`ctx` at identity, device pixels; left there). */
    draw(ctx: CanvasRenderingContext2D, cam: LandCamera, cols: number, rows: number, world: WorldState, land: PixelTerrain, now: number): void {
      const fx = FxArt.shared();
      const sp = FX_MANIFEST.sprites[SPRITE];
      const art = land.art;
      if (this.still || this.reducedMotion || cam.tilePx * cam.dpr < MIN_TILE ||!land.ready || !art || !fx.ready || !sp) {
        this.forget();
        return;
      }
      if (world !== this.world) {
        this.forget();
        this.world = world;
      }
      this.drawnAt = now;
      const f = land.field;
      const clock = now / 1000;
      const tx0 = Math.floor(cam.scrollX) - AHEAD;
      const tx1 = Math.floor(cam.scrollX) + Math.ceil(cols) + AHEAD;
      const ty0 = Math.max(0, Math.floor(cam.scrollY) - AHEAD);
      const ty1 = Math.min(GRID_H - 1, Math.floor(cam.scrollY) + Math.ceil(rows) + AHEAD);
      const inView = new Set<number>();
      for (let y = ty0; y <= ty1; y++) {
        for (let x = tx0; x <= tx1; x++) {
          const i = y * GRID_W + wrapX(x);
          if (!clownfishReef(f, i)) continue;
          inView.add(i);
          if (!this.since.has(i)) this.since.set(i, clock);
        }
      }
      for (const i of this.since.keys()) {
        if (inView.has(i)) continue;
        this.since.delete(i);
        this.rounds.delete(i);
      }
      this.live = this.live.filter((t) => Math.max(t.end, t.calm) > clock && inView.has(t.tile));
      const mid = (tx0 + tx1 + 1) * 8;
      const water = clownfishWater(art);
      const sea = (x: number, y: number): boolean => this.sea(world, land, water, x, y);
      for (const i of inView) {
        const r = clownfishRound(i, clock);
        if (!r || clock < r[1] || clock >= r[1] + TRIP_SPAN) continue;
        let d = this.rounds.get(i);
        if (!d || d.round !== r[0]) {
          d = { round: r[0], trip: this.decide(f, art, i, r[0], r[1], clock, sea, sp.fps) };
          this.rounds.set(i, d);
        }
        const t = d.trip;
        if (!t) continue;
        // The trailing fish first: the leader swims over it.
        for (let k = t.fish - 1; k >= 0; k--) {
          const at = clownfishAt(t, k, clock - t.start, sp.fps);
          // Where the sea changed under a trip (a brush stroke), its fish stay hidden.
          if (!at || !sea(at[0], at[1])) continue;
          fx.drawSprite(ctx, cam, SPRITE, at[2], at[0] + landWrapShift(mid, at[0]), at[1], null, BODY_CENTRE, BODY_CENTRE);
        }
      }
    }

    private forget(): void {
      this.since.clear();
      this.rounds.clear();
      this.live = [];
      this.world = null;
    }

    /** At its start: may the trip of tile i in this round run, and where? */
    private decide(
      f: TerrainField, art: LandArt, i: number, round: number, start: number, clock: number,
      sea: (x: number, y: number) => boolean, fps: number,
    ): ClownfishTrip | null {
      // Begun before its reef came into view, or long before this frame: it would pop up mid-water.
      if (start < (this.since.get(i) as number) || clock - start > GRACE) return null;
      if (!clownfishAdmit(this.live, start)) return null;
      const trip = clownfishTrip(i, round, start, clownfishHomes(f, art, i % GRID_W, (i / GRID_W) | 0), sea, fps);
      if (trip) this.live.push(trip);
      return trip;
    }

    /** Reef water (`water`, clownfishWater) as composed, not under a city, at world art pixel (x, y), x unwrapped. */
    private sea(world: WorldState, land: PixelTerrain, water: Uint8Array, x: number, y: number): boolean {
      if (y < 0 || y >= GRID_H * 16) return false;
      const wx = ((x % WORLD_PX) + WORLD_PX) % WORLD_PX;
      const m = land.motion(Math.floor(wx / CHUNK_PX), Math.floor(y / CHUNK_PX));
      if (!m || !m.sea || water[m.sea[(y % CHUNK_PX) * CHUNK_PX + (wx % CHUNK_PX)]] === 0) return false;
      return world.tech[idx(wx >> 4, y >> 4)] === Tech.None;
    }
  }
}
