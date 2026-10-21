/* =============================================================================
 * SimEarth 2.0 — sea ice freezing and thawing on screen
 * -----------------------------------------------------------------------------
 * The simulation flips a tile between open sea and pack ice at once
 * (packIce in landfield.ts); the map follows over a few seconds. Each
 * refresh of the terrain field compares the ice with the last one, and a
 * chunk recomposed soon after one of its tiles flipped dissolves into its
 * new picture (landfade.ts) instead of switching:
 *   thaw:   the leads between the floes open first, then each floe thins
 *           (two ice steps darker) from its rim inwards and goes, the floes
 *           a little apart. The order is read off the pack ice texture
 *           itself, so it follows the floes that are drawn;
 *   freeze: from the old ice edge outwards a thin film settles on the water
 *           in an ordered dither and thickens into floes.
 * Everything else that changed in the chunk (the new shore with its foam and
 * lighter water) dissolves in the same order, so no edge jumps. A tile that
 * calves (icecalving.ts) holds its picture until the slab breaks away.
 * Visual only: the simulation never reads this. Cheap by design: work only
 * when a chunk is recomposed anyway, redraws at most every ICE_ANIM.stepMs,
 * a cap on dissolving chunks, nothing below ICE_ANIM.minTilePx, and an
 * unseen chunk is composed only when it comes into view, by then switched.
 * ========================================================================== */

namespace SE {
  /** Every knob of the sea ice animations, here and in icecalving.ts. Times in ms unless named in s. */
  export const ICE_ANIM = {
    /** Thaw and freeze dissolve over at most this long… */
    fadeMs: 3200,
    /** …and over at most this many ticks of the running simulation, so a fast planet's edge never lags far behind. */
    fadeTicks: 10,
    fadeMinMs: 600,
    /** Thaw: share of the fade a pixel shows thin ice before it opens to the sea. */
    thinShare: 0.25,
    /** Freeze: share of the fade the film shows before the solid ice. */
    filmShare: 0.45,
    /** Freeze: weight of the distance from the old ice edge against the floe order. */
    freezeEdge: 0.55,
    /** A dissolving chunk changes at most this often: its moments snap to this grid. */
    stepMs: 100,
    /** Chunks dissolving ice at the same time; further ones switch at once. */
    maxFades: 8,
    /** CSS px per tile below which ice switches at once: a dissolve is not visible there. */
    minTilePx: 12,
    /** A chunk recomposed this long after one of its tiles flipped still dissolves (it came into view late). */
    windowMs: 1000,
    /** More flips than this in one refresh (a load, a jump in time) switch at once. */
    maxFlips: 96,

    /** Calving: chance that a refresh with a thawing edge tile in view calves one, once the cooldown is over. */
    calveChance: 0.35,
    /** Calving: wall-clock pause after one before the next may start, random between the two, s. */
    cooldownMinS: 20,
    cooldownMaxS: 40,
    /** Calving: at most this many at the same time. */
    maxCalvings: 2,
    /** Calving: CSS px per tile from which it shows, so a sprite pixel is at least a screen pixel. */
    calveMinTilePx: 16,
    /** Calving phases, s: the crack until the slab breaks (the sound's break-off), tipping in, drifting, melting. */
    crackS: 2.65,
    tipS: 0.55,
    driftS: 16,
    meltS: 4.5,
    /** Drift away from the ice edge, art px per s at the start (it slows), plus a steady current (x east, y south). */
    driftSpeed: 2.4,
    currentX: 0,
    currentY: 0,
    /** Crack sound: level on the effect volume, random pitch ± this share, start into the file (s; its first crack is at 2.7). */
    soundVolume: 0.45,
    soundPitch: 0.06,
    soundOffsetS: 2.55,
  };

  /** Order weights of the thaw: rim distance inside a floe, the floe's own lag, ordered dither. */
  const ORDER_RIM = 0.6;
  const ORDER_FLOE = 0.3;
  const ORDER_DITHER = 0.1;
  /** Ticks between two refreshes beyond which the planet counts as replaced (a load): no animation. */
  const JUMP_TICKS = 30;
  /** Pixels around a freezing chunk's changes searched for the old ice it grows from. */
  const FREEZE_MARGIN = 40;
  /** How long the slab's own pixels take to open when it breaks, ms. */
  const BREAK_MS = 120;
  /** Tiles beyond a chunk whose flips change its picture (SIGNATURE_REACH in landfield.ts). */
  const REACH = 3;
  const CHUNKS_X = GRID_W / 16;
  const WORLD_PX = GRID_W * 16;

  /** Step of RGBA word v on the ice ramp `ice` (dark to light), −1 when v is no ice. */
  function iceStep(ice: Uint32Array, v: number): number {
    for (let k = 0; k < ice.length; k++) if (ice[k] === v) return k;
    return -1;
  }

  /** A tile holding its picture until its slab breaks away (icecalving.ts). */
  interface IceHold {
    readonly x: number;
    readonly y: number;
    readonly breakAt: number;
    /** The slab, world art px [x0, x1] × [y0, y1]: opens at the break, the rest of the notch thaws after it. */
    readonly box: readonly [number, number, number, number];
  }

  /** Told about flips by IceShift (the calving layer). */
  export interface IceListener {
    flips(thawed: readonly number[], frozen: readonly number[], now: number): void;
    /** Another planet, a load or a jump in time: drop everything running. */
    reset(): void;
  }

  export class IceShift {
    /** 1 where the field showed pack ice at the last refresh. */
    private readonly seen = new Uint8Array(TILE_COUNT);
    private world: WorldState | null = null;
    private seed = NaN;
    private ticks = -1;
    private tickAt = 0;
    /** Wall-clock ms per tick, measured between refreshes. */
    private tickMs = 1000;
    /** When a tile within reach of each chunk last flipped. */
    private readonly chunkAt = new Float64Array(CHUNKS_X * (GRID_H / 16)).fill(-Infinity);
    private readonly holds = new Map<number, IceHold>();
    listener: IceListener | null = null;

    private art: LandArt | null = null;
    /** Dissolve order per pixel of the pack ice texture (size × size, world-anchored), 0..1. */
    private order = new Float32Array(1);
    private size = 1;
    /** The ice ramp as RGBA words, dark to light: thin ice is two steps darker. */
    private ice = new Uint32Array(0);
    /** Scratch for the freeze's distance from the old ice. */
    private dist = new Int16Array(0);

    /** The fade of a flip now, ms. */
    get span(): number {
      return clamp(this.tickMs * ICE_ANIM.fadeTicks, ICE_ANIM.fadeMinMs, ICE_ANIM.fadeMs);
    }

    /** After every refresh of `field` from `world`: note the tiles that froze or thawed. */
    update(world: WorldState, field: TerrainField, now: number): void {
      const jump = world !== this.world || world.seed !== this.seed || world.ticks < this.ticks || world.ticks - this.ticks > JUMP_TICKS;
      if (!jump && world.ticks > this.ticks) {
        this.tickMs += ((now - this.tickAt) / (world.ticks - this.ticks) - this.tickMs) * 0.5;
      }
      if (world.ticks !== this.ticks) this.tickAt = now;
      this.world = world;
      this.seed = world.seed;
      this.ticks = world.ticks;
      const iceKey = LandTables.shared().seaIceKey;
      const { key } = field;
      const seen = this.seen;
      const thawed: number[] = [];
      const frozen: number[] = [];
      for (let i = 0; i < TILE_COUNT; i++) {
        const ice = key[i] === iceKey ? 1 : 0;
        if (ice === seen[i]) continue;
        seen[i] = ice;
        if (ice) frozen.push(i);
        else if (key[i] === 0) thawed.push(i);
      }
      for (const [tile, h] of this.holds) if (now > h.breakAt + this.span + 2 * ICE_ANIM.stepMs) this.holds.delete(tile);
      if (jump || thawed.length + frozen.length > ICE_ANIM.maxFlips) {
        this.holds.clear();
        this.chunkAt.fill(-Infinity);
        this.listener?.reset();
        return;
      }
      if (thawed.length + frozen.length === 0) return;
      for (const list of [thawed, frozen]) {
        for (const i of list) {
          const x = i % GRID_W;
          const y = (i / GRID_W) | 0;
          const cy0 = Math.max(0, (y - REACH) >> 4);
          const cy1 = Math.min(GRID_H / 16 - 1, (y + REACH) >> 4);
          for (let cy = cy0; cy <= cy1; cy++) {
            for (let u = Math.floor((x - REACH) / 16); u <= Math.floor((x + REACH) / 16); u++) {
              this.chunkAt[cy * CHUNKS_X + ((u % CHUNKS_X) + CHUNKS_X) % CHUNKS_X] = now;
            }
          }
        }
      }
      this.listener?.flips(thawed, frozen, now);
    }

    /** Chunk (cx, cy) should dissolve into its next picture: a tile near it flipped lately, or one calves there. */
    near(cx: number, cy: number, now: number): boolean {
      return now - this.chunkAt[cy * CHUNKS_X + cx] < ICE_ANIM.windowMs || this.holding(cx, cy);
    }

    /** A calving tile lies within a tile of chunk (cx, cy): it must dissolve, whatever the zoom or the cap. */
    holding(cx: number, cy: number): boolean {
      for (const h of this.holds.values()) {
        let dx = h.x - cx * 16;
        dx -= Math.floor(dx / GRID_W) * GRID_W;
        if ((dx < 17 || dx >= GRID_W - 1) && h.y >= cy * 16 - 1 && h.y <= cy * 16 + 16) return true;
      }
      return false;
    }

    /** Hold tile i's picture (and its neighbours' share of the notch) until `breakAt`; the slab `box` opens then. */
    hold(i: number, breakAt: number, box: readonly [number, number, number, number]): void {
      this.holds.set(i, { x: i % GRID_W, y: (i / GRID_W) | 0, breakAt, box });
    }

    release(i: number): void {
      this.holds.delete(i);
    }

    /**
     * The timing of a chunk's dissolve (LandFade.retarget): `shown` is its
     * picture now, `next` the new one, `side` px square with its corner at
     * world art pixel (ox, oy).
     */
    timing(art: LandArt, shown: Uint32Array, next: Uint32Array, side: number, ox: number, oy: number): LandFadeTiming {
      this.prepare(art);
      const { order, size, ice } = this;
      const wrap = size - 1;
      const span = this.span;
      const step = ICE_ANIM.stepMs;
      const snap = (t: number): number => Math.ceil(t / step) * step;
      // The freeze's distances, worked out when the first pixel freezes: a thaw never needs them.
      let reach = -1;
      const holds = [...this.holds.values()];
      return (wx, wy, from, to, now, out) => {
        const o = order[(wy & wrap) * size + (wx & wrap)];
        const bay = BAYER4[(wy & 3) * 4 + (wx & 3)];
        const sFrom = iceStep(ice, from);
        const sTo = iceStep(ice, to);
        const thaw = sFrom >= 0 && sTo < 0;
        let start = now;
        for (const h of holds) {
          let dx = Math.floor(wx / 16) - h.x;
          dx -= Math.round(dx / GRID_W) * GRID_W;
          if (Math.abs(dx) > 1 || Math.abs(Math.floor(wy / 16) - h.y) > 1) continue;
          start = Math.max(start, h.breakAt);
          let bx = wx - h.box[0];
          bx -= Math.floor(bx / WORLD_PX) * WORLD_PX;
          if (thaw && bx <= h.box[2] - h.box[0] && wy >= h.box[1] && wy <= h.box[3]) {
            out.due = snap(h.breakAt + BREAK_MS * bay);
            return;
          }
        }
        if (sTo >= 0 && sFrom < 0) {
          // Freeze: a film from the old edge outwards, half of it dark at first, then the floes.
          if (reach < 0) reach = this.freezeDistance(shown, next, side);
          const e = reach > 0 ? Math.min(1, this.dist[(wy - oy) * side + (wx - ox)] / reach) : 0;
          const d = ICE_ANIM.freezeEdge * e + (1 - ICE_ANIM.freezeEdge) * (1 - o);
          out.due = snap(start + span * d);
          out.via = ice[bay < 0.5 ? 0 : Math.max(0, sTo - 2)];
          out.viaAt = snap(out.due - span * ICE_ANIM.filmShare * (bay < 0.5 ? 1 : 0.4));
          return;
        }
        out.due = snap(start + span * o);
        if (thaw) {
          out.via = ice[Math.max(0, sFrom - 2)];
          out.viaAt = snap(Math.max(start, out.due - span * ICE_ANIM.thinShare));
        }
      };
    }

    /**
     * For a chunk that freezes: each changed pixel's distance (4-neighbour
     * steps, two sweeps) from the ice the chunk shows now, into `dist`, read
     * within FREEZE_MARGIN of the changed pixels; the farthest freezing
     * pixel, 0 when no ice is near yet.
     */
    private freezeDistance(shown: Uint32Array, next: Uint32Array, side: number): number {
      const ice = this.ice;
      const n = shown.length;
      let x0 = side, y0 = side, x1 = -1, y1 = -1;
      for (let y = 0, p = 0; y < side; y++) {
        for (let x = 0; x < side; x++, p++) {
          if (shown[p] === next[p]) continue;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          y1 = y;
        }
      }
      if (x1 < 0) return 0;
      x0 = Math.max(0, x0 - FREEZE_MARGIN);
      y0 = Math.max(0, y0 - FREEZE_MARGIN);
      x1 = Math.min(side - 1, x1 + FREEZE_MARGIN);
      y1 = Math.min(side - 1, y1 + FREEZE_MARGIN);
      if (this.dist.length < n) this.dist = new Int16Array(n);
      const dist = this.dist;
      const far = 0x7fff;
      let any = false;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0, p = y * side + x; x <= x1; x++, p++) {
          const at = iceStep(ice, shown[p]) >= 0;
          dist[p] = at ? 0 : far;
          any ||= at;
        }
      }
      if (!any) return 0;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0, p = y * side + x; x <= x1; x++, p++) {
          let d = dist[p];
          if (x > x0 && dist[p - 1] + 1 < d) d = dist[p - 1] + 1;
          if (y > y0 && dist[p - side] + 1 < d) d = dist[p - side] + 1;
          dist[p] = d;
        }
      }
      let reach = 0;
      for (let y = y1; y >= y0; y--) {
        for (let x = x1, p = y * side + x; x >= x0; x--, p--) {
          let d = dist[p];
          if (x < x1 && dist[p + 1] + 1 < d) d = dist[p + 1] + 1;
          if (y < y1 && dist[p + side] + 1 < d) d = dist[p + side] + 1;
          dist[p] = d;
          if (d > reach && d < far && shown[p] !== next[p] && iceStep(ice, next[p]) >= 0) reach = d;
        }
      }
      return reach;
    }

    /**
     * Once per atlas: the thaw order from the pack ice texture — 0 on its leads
     * (ice1, ice2), rising to 1 at each floe's heart, each floe lagging by its
     * own hash — and the ice ramp's colours.
     */
    private prepare(art: LandArt): void {
      if (this.art === art) return;
      this.art = art;
      const ramp = art.manifest.ramps.ice;
      this.ice = Uint32Array.from(ramp, (index) => art.rgba[index]);
      const tex = art.ground[landKeyRank(LandTables.shared().seaIceKey)][0];
      const N = tex.size;
      const lead = (p: number): boolean => tex.px[p] === ramp[1] || tex.px[p] === ramp[2];
      const at = (x: number, y: number): number => ((y + N) % N) * N + ((x + N) % N);
      const dist = new Int16Array(N * N).fill(-1);
      let wave: number[] = [];
      for (let p = 0; p < N * N; p++) if (lead(p)) { dist[p] = 0; wave.push(p); }
      while (wave.length > 0) {
        const more: number[] = [];
        for (const p of wave) {
          const x = p % N;
          const y = (p / N) | 0;
          for (const q of [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)]) {
            if (dist[q] < 0) { dist[q] = dist[p] + 1; more.push(q); }
          }
        }
        wave = more;
      }
      // Floes: the connected pixels between leads, each with its deepest point.
      const floe = new Int32Array(N * N).fill(-1);
      const deepest: number[] = [];
      for (let p0 = 0; p0 < N * N; p0++) {
        if (lead(p0) || floe[p0] >= 0) continue;
        const id = deepest.length;
        let most = 1;
        const stack = [p0];
        floe[p0] = id;
        while (stack.length > 0) {
          const p = stack.pop() as number;
          most = Math.max(most, dist[p]);
          const x = p % N;
          const y = (p / N) | 0;
          for (const q of [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)]) {
            if (!lead(q) && floe[q] < 0) { floe[q] = id; stack.push(q); }
          }
        }
        deepest.push(most);
      }
      const order = new Float32Array(N * N);
      for (let p = 0; p < N * N; p++) {
        const dither = ORDER_DITHER * BAYER4[((((p / N) | 0) & 3) * 4) + ((p % N) & 3)];
        order[p] = floe[p] < 0 ? dither
          : ORDER_RIM * (dist[p] / deepest[floe[p]]) + ORDER_FLOE * landHash(floe[p], 0, 991) + dither;
      }
      this.order = order;
      this.size = N;
    }
  }
}
