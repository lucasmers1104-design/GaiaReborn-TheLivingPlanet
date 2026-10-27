/* =============================================================================
 * SimEarth 2.0 — pixel whales on the open sea
 * -----------------------------------------------------------------------------
 * The great whales (baleen, sperm, great whale) ride on the Cetacean herd
 * markers (herds.ts) and are drawn as effect-atlas sprites instead of their
 * SVG icon. Each cycle: the sea boils where the whale will rise, it surfaces,
 * swims on (drifting along its facing, bobbing, a bow wave at its snout),
 * blows once or twice, dives with its fluke and leaves a spreading footprint
 * ring; then it stays under for the rest of its period. Nothing pops: the
 * ring frames lead in and out, never alpha (docs/ereignisse-2026-10/stil.md).
 * A whale takes over its marker's tile and facing only while submerged, so
 * the herd's steps happen out of sight, and it rises only where no other
 * surfaced whale is within SPACING and fewer than MAX_SURFACED hold room on the
 * planet. Visual only: the simulation never reads this.
 *
 * Sprite points come from the catalog's `mouth` in the east frames (west:
 * w − 1 − x): [blowX, blowY, snoutX, snoutY, flukeX, flukeY]; missing
 * points fall back to DEFAULT_POINTS.
 *
 * Wiring (for render.ts / herds.ts):
 *   - `claims` and `draw` take an optional trailing `regions`; pass the same
 *     BiomeRegions as HerdLayer.draw, so biome specialists (narwhal) keep
 *     their icon. Without it the specialist check is skipped.
 *   - `draw` expects ctx at identity (device pixels) and leaves it there.
 *   - `claims` is false until the atlas holds the whale's sprite, so the
 *     icon stays wherever there is no pixel whale to show.
 * ========================================================================== */

namespace SE {
  /** CSS px per tile from which whales are pixel sprites; below that an art pixel is under a screen pixel. */
  const MIN_TILE = 16;
  /** Cycle length in s, staggered by marker rank. */
  const PERIOD_MIN = 14;
  const PERIOD_MAX = 24;
  /** Phases in s: boil before the rise, rise (frames 0–1), swim (2–3), fluke dive (4–7), footprint after it. */
  const BOIL = 0.5;
  const RISE = 0.6;
  const SWIM = 7.5;
  /** Dive frames 4–7 end at these s; the fluke peak (6) holds longest. */
  const DIVE_ENDS = [0.25, 0.5, 0.95, 1.3];
  const DIVE = DIVE_ENDS[3];
  const PRINT = 1.05;
  const SWIM_FRAME = 0.5;
  const RISE_AT = BOIL;
  const SWIM_AT = RISE_AT + RISE;
  const DIVE_AT = SWIM_AT + SWIM;
  const PRINT_AT = DIVE_AT + DIVE;
  /** End of everything shown in a cycle; after it the whale may change tile. */
  const ACTIVE_END = PRINT_AT + PRINT;
  /** Blows, s into the swim; the second only in this share of cycles. */
  const BLOW_FIRST = 0.5;
  const BLOW_SECOND = 4;
  const SECOND_BLOW_SHARE = 0.5;
  /** When each blow frame ends, s: the jet shoots up fast, the cloud hangs and rains out slowly. */
  const BLOW_ENDS = [0.08, 0.18, 0.32, 0.72, 1.07, 1.42, 1.72, 2.02];
  export const BLOW_LIFE = BLOW_ENDS[BLOW_ENDS.length - 1];
  const BLOW_ID = 'whale_blow';
  /** The sperm whale's blow slants forward from the front of its head (frames 0–7 east, 8–15 west). */
  const SPERM_BLOW_ID = 'whale_blow_sperm';
  const BLOW_STRENGTH = 0.5;
  /** Bow wave (frames 0–3 east, 4–7 west, looped) and footprint ring (8–11). */
  const WAKE_ID = 'whale_wake';
  const WAKE_FPS = 8;
  /** Distance swum while in sight, art px, and the bob: amplitude art px, period s. */
  const DRIFT = 12;
  const BOB = 0.5;
  const BOB_PERIOD = 3.2;
  /** Free water kept between two surfaced whales, art px. */
  const SPACING = 6;
  /** Whales holding room on the whole planet at once, so a surfacing whale stays a rare sight. */
  const MAX_SURFACED = 2;
  /** Blowhole, snout and fluke in the east frames when the catalog's `mouth` lacks them, as shares of w and h. */
  const DEFAULT_POINTS: readonly number[] = [0.62, 0.3, 0.92, 0.5, 0.15, 0.5];
  const WORLD_PX = GRID_W * 16;
  /** Share of surfacings in view that call: now and then, not every blow. */
  const CALL_CHANCE = 0.35;

  export interface WhalePhase {
    /** Whale frame 0–7; only drawn while `visible`. */
    frame: number;
    /** Seconds since the current blow began; < 0 when none plays. */
    blowAge: number;
    visible: boolean;
    /** Footprint ring frame 0–3 (wake frames 8–11), −1 for none; at the fluke after a dive, else at the centre. */
    ring: number;
    ringAtFluke: boolean;
    /** Bow wave at the snout (swimming). */
    bow: boolean;
    /** 0..1 along the swim path, eased: where the whale is. */
    path: number;
  }

  interface Swim {
    tile: number;
    flip: boolean;
    /** Added to the clock in s, so whales don't surface together. */
    offset: number;
    /** The cycle the decision below is for, and whether the whale stays under in it (no room). */
    cycle: number;
    under: boolean;
    /** World art px box swept while in sight, for the spacing check. */
    x0: number;
    x1: number;
    y0: number;
    y1: number;
    /** Frame stamp of the last draw that saw it, and whether it then still held its room. */
    seen: number;
    holds: boolean;
    /** The cycle whose call was already rolled. */
    called: number;
  }

  /** The pixel whale for a Cetacean stage, or null where the SVG icon stays (early stages, dolphins, specialists). */
  export function whaleSprite(stage: number, specialist: boolean): string | null {
    if (specialist) return null;
    return stage === 4 ? 'whale_baleen' : stage === 5 ? 'whale_sperm' : stage === 7 ? 'whale_great' : null;
  }

  /** Eased progress along the swim: a whale gathers way as it rises and slows as it dives. */
  function pathAt(u: number): number {
    const p = clamp((u - RISE_AT) / (PRINT_AT - RISE_AT), 0, 1);
    return 0.6 * p + 0.4 * smoothstep(p);
  }

  const NONE: WhalePhase = { frame: 0, blowAge: -1, visible: false, ring: -1, ringAtFluke: false, bow: false, path: 0 };
  const STILL_PHASE: WhalePhase = { frame: 2, blowAge: -1, visible: true, ring: -1, ringAtFluke: false, bow: false, path: 0.5 };

  /** Where in its cycle a whale is at time t (s). */
  export function whalePhase(t: number, period: number): WhalePhase {
    const cycle = Math.floor(t / period);
    const u = t - cycle * period;
    const path = pathAt(u);
    if (u < RISE_AT) return { ...NONE, ring: 0, path };
    if (u < SWIM_AT) return { ...NONE, frame: u < RISE_AT + RISE / 2 ? 0 : 1, visible: true, path };
    if (u < DIVE_AT) {
      const s = u - SWIM_AT;
      let blowAge = s - BLOW_FIRST;
      if (blowAge < 0 || blowAge >= BLOW_LIFE) {
        const second = s - BLOW_SECOND;
        blowAge = second >= 0 && second < BLOW_LIFE && landHash(cycle, Math.round(period * 1000), 411) < SECOND_BLOW_SHARE ? second : -1;
      }
      return { ...NONE, frame: 2 + (Math.floor(s / SWIM_FRAME) & 1), blowAge, visible: true, bow: true, path };
    }
    if (u < PRINT_AT) return { ...NONE, frame: 4 + DIVE_ENDS.findIndex((end) => u - DIVE_AT < end), visible: true, path };
    if (u < ACTIVE_END) return { ...NONE, ring: 1 + Math.min(2, Math.floor(((u - PRINT_AT) / PRINT) * 3)), ringAtFluke: true, path };
    return { ...NONE, frame: 7, path };
  }

  /** Frame of the blow `age` s after it began, or −1 once it has rained out. */
  export function blowFrame(age: number): number {
    for (let f = 0; f < BLOW_ENDS.length; f++) if (age < BLOW_ENDS[f]) return f;
    return -1;
  }

  export class WhaleLayer {
    /** "Effekte reduzieren": a calm surfaced pose, no drift, bob, blow, wake or dive. */
    still = false;
    private readonly reducedMotion = typeof window !== 'undefined' && !!window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    private readonly swims = new WeakMap<HerdMarker, Swim>();
    /** Whales holding room on the sea this cycle (surfaced or about to). */
    private live: Swim[] = [];
    private stamp = 0;
    private colors: string[] = [];

    /** Whether marker m is drawn as a pixel whale here, so the herd layer skips its icon. */
    claims(m: HerdMarker, world: WorldState, tilePx: number, regions?: BiomeRegions): boolean {
      if (tilePx < MIN_TILE || m.c !== Life.Cetacean || !whaleSprite(m.stage, false)) return false;
      const specialist = !!regions && animalSpecialist(regions, world, m.tile, m.c, m.stage) >= 0;
      const id = whaleSprite(m.stage, specialist);
      const sp = id ? FX_MANIFEST.sprites[id] : undefined;
      if (!sp || !FxArt.shared().ready) return false;
      // Open water under the whole body and its drift, either way it faces.
      const reach = Math.ceil((sp.w / 2 + DRIFT / 2 - 8) / 16);
      const x = m.tile % GRID_W;
      const y = (m.tile / GRID_W) | 0;
      for (let dx = -reach; dx <= reach; dx++) if (!world.isWater(idx(wrapX(x + dx), y))) return false;
      return true;
    }

    draw(
      ctx: CanvasRenderingContext2D, cam: LandCamera, markers: readonly HerdMarker[], world: WorldState,
      land: PixelTerrain, now: number, regions?: BiomeRegions,
    ): void {
      const art = FxArt.shared();
      if (!art.ready) return;
      const T = cam.tilePx * cam.dpr;
      const px = T / 16;
      const cols = ctx.canvas.width / T;
      const rows = ctx.canvas.height / T;
      const still = this.still || this.reducedMotion;
      const stamp = ++this.stamp;
      const clock = now / 1000;
      /** Snap a world art coordinate to the device pixel grid, so whale, wake and blow move together. */
      const snap = (v: number): number => Math.round(v * px) / px;
      for (const m of markers) {
        if (!this.claims(m, world, cam.tilePx, regions)) continue;
        const id = whaleSprite(m.stage, false) as string;
        const sp = FX_MANIFEST.sprites[id];
        const period = PERIOD_MIN + (PERIOD_MAX - PERIOD_MIN) * m.rank;
        let s = this.swims.get(m);
        if (!s) {
          // Anywhere in its cycle; one that joins after the boil stays under until its next cycle (decide).
          const offset = Math.random() * period - clock;
          s = { tile: m.tile, flip: m.flip, offset, cycle: NaN, under: true, x0: 0, x1: 0, y0: 0, y1: 0, seen: 0, holds: false, called: NaN };
          this.swims.set(m, s);
        }
        s.seen = stamp;
        const t = clock + s.offset;
        const cycle = still ? -1 : Math.floor(t / period);
        const u = t - Math.floor(t / period) * period;
        if (!still && u >= ACTIVE_END) {
          s.tile = m.tile;
          s.flip = m.flip;
        }
        // Still: no cycles, so a whale left under retries whenever a place on the planet frees up.
        if (cycle !== s.cycle || (still && s.under)) {
          if (still) {
            s.tile = m.tile;
            s.flip = m.flip;
          }
          this.decide(s, sp, cycle, !still && u >= BOIL);
        }
        s.holds = still || u < ACTIVE_END;
        if (s.under) continue;
        const ph = still ? STILL_PHASE : whalePhase(t, period);
        if (!ph.visible && ph.ring < 0) continue;

        // The copy of the tile on the wrapping map nearest the view.
        let rx = (s.tile % GRID_W) - cam.scrollX;
        rx -= Math.floor(rx / GRID_W) * GRID_W;
        if (rx > GRID_W - 3) rx -= GRID_W;
        const ry = ((s.tile / GRID_W) | 0) - cam.scrollY;
        if (rx < -3 || rx > cols + 2 || ry < -2 || ry > rows + 2) continue;

        const dir = s.flip ? -1 : 1;
        const cx = Math.round(cam.scrollX + rx) * 16 + 8;
        const cy = Math.round(cam.scrollY + ry) * 16 + 8;
        const at = (path: number): number => cx + dir * DRIFT * (path - 0.5);
        const bob = still ? 0 : BOB * Math.sin((clock + s.offset) * (2 * Math.PI / BOB_PERIOD));
        const wx = snap(at(ph.path));
        const wy = snap(cy + bob);
        /** A sprite point (east frame column x, row y) on the world, facing taken into account. */
        const point = (k: number, ox: number, oy: number): [number, number] => {
          const x = sp.mouth && sp.mouth.length > k ? sp.mouth[k] : Math.round(DEFAULT_POINTS[k] * sp.w);
          const y = sp.mouth && sp.mouth.length > k + 1 ? sp.mouth[k + 1] : Math.round(DEFAULT_POINTS[k + 1] * sp.h);
          return [ox - sp.ax + (s!.flip ? sp.w - 1 - x : x), oy - sp.ay + y];
        };
        const wake = FX_MANIFEST.sprites[WAKE_ID];
        if (wake && ph.ring >= 0) {
          const [fx, fy] = ph.ringAtFluke ? point(4, wx, wy) : [wx, wy];
          art.drawSprite(ctx, cam, WAKE_ID, 8 + ph.ring, fx, fy);
        }
        if (!ph.visible) continue;
        if (wake && ph.bow && wake.mouth) {
          const [nx, ny] = point(2, wx, wy);
          const f = (Math.floor(clock * WAKE_FPS) & 3) + (s.flip ? 4 : 0);
          art.drawSprite(ctx, cam, WAKE_ID, f, nx, ny, null, s.flip ? wake.w - 1 - wake.mouth[0] : wake.mouth[0], wake.mouth[1]);
        }
        // Facing left: the generator's west set (frames 8–15, column x → w − 1 − x) if there is one, else mirrored here the same way.
        const mirrored = s.flip && sp.frames.length >= 16;
        if (s.flip && !mirrored) ctx.setTransform(-1, 0, 0, 1, 2 * (wx - sp.ax + sp.w / 2 - cam.scrollX * 16) * px, 0);
        art.drawSprite(ctx, cam, id, ph.frame + (mirrored ? 8 : 0), wx, wy);
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        if (ph.blowAge < 0) continue;
        if (s.called !== cycle) {
          s.called = cycle;
          if (Math.random() < CALL_CHANCE) playSfx(WHALE_CALL, clamp((cam.tilePx - EditView.MIN_TILE) / (EditView.MAX_TILE - EditView.MIN_TILE), 0, 1) ** 2);
        }
        const bf = blowFrame(ph.blowAge);
        if (bf < 0) continue;
        // The blow stays where it was blown; the whale swims on under it.
        const [bx, by] = point(0, snap(at(pathAt(u - ph.blowAge))), wy);
        const ahead = id === 'whale_sperm' && FX_MANIFEST.sprites[SPERM_BLOW_ID];
        art.drawSprite(ctx, cam, ahead ? SPERM_BLOW_ID : BLOW_ID, bf + (ahead && s.flip ? 8 : 0), bx, by);
        const la = land.art;
        if (!la || ph.blowAge >= SPRAY_LIFE) continue;
        if (this.colors.length === 0) this.colors = la.manifest.palette.map(([r, g, b]) => `rgb(${r},${g},${b})`);
        const wave = Math.floor(t / period) * 2 + (u - SWIM_AT >= BLOW_SECOND ? 1 : 0);
        sprayDrops(ph.blowAge, BLOW_STRENGTH, s.tile, 0, wave, bx, by, la.manifest.ramps.ice, (c, x, y) => {
          ctx.fillStyle = this.colors[c];
          ctx.fillRect(Math.round((x - cam.scrollX * 16) * px), Math.round((y - cam.scrollY * 16) * px), Math.ceil(px), Math.ceil(px));
        });
      }
      this.live = this.live.filter((o) => o.seen === stamp && o.holds && !o.under);
    }

    /**
     * At the start of a cycle: may this whale surface, or is another surfaced
     * whale within SPACING of the water it will swim through? First come,
     * first served; a whale that loses stays under until its next cycle.
     */
    private decide(s: Swim, sp: FxSprite, cycle: number, late: boolean): void {
      s.cycle = cycle;
      const x = (s.tile % GRID_W) * 16 + 8;
      const y = ((s.tile / GRID_W) | 0) * 16 + 8;
      s.x0 = x - sp.ax - DRIFT / 2;
      s.x1 = x - sp.ax + sp.w + DRIFT / 2;
      s.y0 = y - sp.ay;
      s.y1 = y - sp.ay + sp.h;
      this.live = this.live.filter((o) => o !== s);
      // Joining a cycle after its boil (a whale first seen mid-cycle) would pop up: it stays under.
      s.under = late || this.live.length >= MAX_SURFACED || this.live.some((o) => {
        let dx = (o.x0 + o.x1) / 2 - (s.x0 + s.x1) / 2;
        dx -= Math.round(dx / WORLD_PX) * WORLD_PX;
        return Math.abs(dx) * 2 < o.x1 - o.x0 + s.x1 - s.x0 + 2 * SPACING &&
          Math.abs((o.y0 + o.y1) / 2 - (s.y0 + s.y1) / 2) * 2 < o.y1 - o.y0 + s.y1 - s.y0 + 2 * SPACING;
      });
      s.holds = !s.under;
      if (!s.under) this.live.push(s);
    }
  }
}
