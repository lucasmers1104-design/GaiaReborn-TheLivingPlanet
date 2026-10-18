/* =============================================================================
 * SimEarth 2.0 — dolphin pods leaping in warm seas
 * -----------------------------------------------------------------------------
 * Once the dolphins (Cetacean sub-species 6) live on a tropical sea, their
 * herd markers there become pods of three to five pixel dolphins that
 * porpoise along: each leaps twice, the others following the leader a beat
 * later, then the pod swims on unseen until its next round. The leap and its
 * splashes are all in the sprite (dolphin_leap, tools/fx/fauna.js); this file
 * only places the pod and times the leaps. Like a whale (whalelayer.ts), a
 * pod takes over its marker's tile and facing only while out of sight, and
 * one first seen mid-round sits that round out, so nothing pops. In cooler
 * water, by the coast, below 16 px per tile and with "Effekte reduzieren"
 * the herd icon stays. Visual only: the simulation never reads this.
 *
 * Wiring (render.ts / herds.ts): `draw` expects ctx at identity (device
 * pixels) and leaves it there; pass `claims` to the herd layer's skip so the
 * icon isn't drawn where a pod swims.
 * ========================================================================== */

namespace SE {
  /** CSS px per tile from which pods are drawn; below that an art pixel is under a screen pixel. */
  const MIN_TILE = 16;
  /** The Cetacean sub-species that leaps. */
  export const DOLPHIN_STAGE = 6;
  /** Sea temperature from which dolphins leap, °C: the tropics, about 27° either side of the equator on today's Earth. */
  export const DOLPHIN_WARM = 25;
  const SPRITE = 'dolphin_leap';
  /** Frames per direction (east, then west). */
  const FRAMES = 16;
  /** Round length in s, staggered by marker rank. */
  const PERIOD_MIN = 6;
  const PERIOD_MAX = 10;
  /** Leaps per dolphin and round; the next begins this many s after the last; how much further on it surfaces, art px. */
  const LEAPS = 2;
  const LEAP_EVERY = 1.05;
  const ADVANCE = 24;
  /** The pod, east-facing: art px behind the leader, art px south (+) of it, s after it (ascending). */
  const POD: readonly (readonly [number, number, number])[] = [
    [0, 0, 0], [-8, -5, 0.3], [-6, 5, 0.45], [-14, -1, 0.7], [-13, 6, 0.85],
  ];
  /** Up to this many s later than its place in the pod, per round, so no two rounds look alike. */
  const JITTER = 0.2;
  /** Free water kept between two leaping pods along the way, art px; across it, pods a tile row apart count as close. */
  const SPACING = 8;
  const ROW_GAP = 24;
  const WORLD_PX = GRID_W * 16;

  /** Frame (0–15) of leap `leap` of pod member `k`, `u` s into round `round`; −1 while that leap is out of sight. */
  export function dolphinFrame(u: number, k: number, leap: number, round: number, seed: number, fps: number): number {
    const start = POD[k][2] + JITTER * landHash(k, round, seed) + leap * LEAP_EVERY;
    const f = Math.floor((u - start) * fps);
    return f >= 0 && f < FRAMES ? f : -1;
  }

  /** Seconds into a round after which every leap and splash is over. */
  export function dolphinActive(fps: number): number {
    return POD[POD.length - 1][2] + JITTER + (LEAPS - 1) * LEAP_EVERY + FRAMES / fps;
  }

  /** Along the way, art px from the leader's first exit: the middle of all the pod's leaps and half their length. */
  function podSpan(sp: FxSprite): [number, number] {
    const mx = (sp.mouth as readonly number[])[0];
    const from = Math.min(...POD.map((p) => p[0])) - mx;
    const to = (LEAPS - 1) * ADVANCE + sp.w - mx;
    return [Math.round((from + to) / 2), (to - from) / 2];
  }

  interface Pod {
    tile: number;
    flip: boolean;
    /** Added to the clock in s, so pods don't leap together. */
    offset: number;
    /** A round it sits out (first seen mid-round, or another pod leaps close by), and the draw that last saw it. */
    wait: number;
    seen: number;
    /** The round decided last; while leaping, its tile centre in world art px and the clock (s) its leaps end. */
    round: number;
    x: number;
    y: number;
    until: number;
  }

  export class DolphinLayer {
    /** "Effekte reduzieren": no pods, the herd icon stays. */
    still = false;
    private readonly reducedMotion = typeof window !== 'undefined' && !!window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    private readonly pods = new WeakMap<HerdMarker, Pod>();
    /** Pods leaping this round, holding their stretch of sea. */
    private live: Pod[] = [];
    private stamp = 0;

    /** Whether marker m is drawn as a dolphin pod here, so the herd layer skips its icon. */
    claims(m: HerdMarker, world: WorldState, tilePx: number): boolean {
      if (this.still || this.reducedMotion || tilePx < MIN_TILE) return false;
      if (m.c !== Life.Cetacean || m.stage !== DOLPHIN_STAGE || world.temperature[m.tile] < DOLPHIN_WARM) return false;
      const sp = FX_MANIFEST.sprites[SPRITE];
      if (!sp || !sp.mouth || !FxArt.shared().ready) return false;
      // Sea under every leap, whichever way the pod swims.
      const reach = Math.ceil((podSpan(sp)[1] - 8) / 16);
      const x = m.tile % GRID_W;
      const y = (m.tile / GRID_W) | 0;
      for (let dx = -reach; dx <= reach; dx++) if (!world.isWater(idx(wrapX(x + dx), y))) return false;
      return true;
    }

    draw(ctx: CanvasRenderingContext2D, cam: LandCamera, markers: readonly HerdMarker[], world: WorldState, now: number): void {
      const art = FxArt.shared();
      const sp = FX_MANIFEST.sprites[SPRITE];
      if (!art.ready || !sp || !sp.mouth) return;
      const T = cam.tilePx * cam.dpr;
      const cols = ctx.canvas.width / T;
      const rows = ctx.canvas.height / T;
      const clock = now / 1000;
      const stamp = ++this.stamp;
      const active = dolphinActive(sp.fps);
      const [mid, half] = podSpan(sp);
      for (const m of markers) {
        if (!this.claims(m, world, cam.tilePx)) continue;
        const period = PERIOD_MIN + (PERIOD_MAX - PERIOD_MIN) * m.rank;
        let pod = this.pods.get(m);
        if (!pod) {
          pod = { tile: m.tile, flip: m.flip, offset: Math.random() * period - clock, wait: NaN, seen: 0, round: NaN, x: 0, y: 0, until: 0 };
          this.pods.set(m, pod);
        }
        const t = clock + pod.offset;
        const round = Math.floor(t / period);
        const u = t - round * period;
        if (pod.seen !== stamp - 1 && u < active) pod.wait = round;
        pod.seen = stamp;
        if (u >= active) {
          pod.tile = m.tile;
          pod.flip = m.flip;
          continue;
        }
        if (round !== pod.round && round !== pod.wait) this.decide(pod, round, half, clock, clock + active - u);
        if (round === pod.wait) continue;

        // The copy of the tile on the wrapping map nearest the view.
        let rx = (pod.tile % GRID_W) - cam.scrollX;
        rx -= Math.floor(rx / GRID_W) * GRID_W;
        if (rx > GRID_W - 4) rx -= GRID_W;
        const ry = ((pod.tile / GRID_W) | 0) - cam.scrollY;
        if (rx < -4 || rx > cols + 3 || ry < -2 || ry > rows + 2) continue;

        const dir = pod.flip ? -1 : 1;
        const lead = Math.round(cam.scrollX + rx) * 16 + 8 - dir * mid;
        const cy = Math.round(cam.scrollY + ry) * 16 + 8;
        const seed = Math.floor(m.rank * 1e6);
        // Three to five dolphins, the formation mirrored in every other pod; the northern ones first, so the southern overlap them.
        const size = 3 + Math.floor(((m.rank * 31) % 1) * 3);
        const side = (m.rank * 97) % 1 < 0.5 ? 1 : -1;
        const members = POD.slice(0, size).map((p, k) => k).sort((a, b) => (POD[a][1] - POD[b][1]) * side);
        const mx = pod.flip ? sp.w - 1 - sp.mouth[0] : sp.mouth[0];
        for (const k of members) {
          for (let leap = 0; leap < LEAPS; leap++) {
            const f = dolphinFrame(u, k, leap, round, seed, sp.fps);
            if (f < 0) continue;
            const x = lead + dir * (POD[k][0] + leap * ADVANCE);
            art.drawSprite(ctx, cam, SPRITE, f + (pod.flip ? FRAMES : 0), x, cy + side * POD[k][1], null, mx, sp.mouth[1]);
          }
        }
      }
    }

    /**
     * At the start of a round: may this pod leap, or is another pod leaping
     * within reach of its stretch of sea? First come, first served; a pod that
     * loses sits the round out.
     */
    private decide(pod: Pod, round: number, half: number, clock: number, until: number): void {
      pod.round = round;
      const x = (pod.tile % GRID_W) * 16 + 8;
      const y = ((pod.tile / GRID_W) | 0) * 16 + 8;
      this.live = this.live.filter((o) => o !== pod && o.until > clock);
      const close = this.live.some((o) => {
        let dx = o.x - x;
        dx -= Math.round(dx / WORLD_PX) * WORLD_PX;
        return Math.abs(dx) < 2 * half + SPACING && Math.abs(o.y - y) < ROW_GAP;
      });
      if (close) {
        pod.wait = round;
        return;
      }
      pod.x = x;
      pod.y = y;
      pod.until = until;
      this.live.push(pod);
    }
  }
}
