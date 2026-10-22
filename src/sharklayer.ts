/* =============================================================================
 * SimEarth 2.0 — shark fins circling
 * -----------------------------------------------------------------------------
 * Once sharks (Fish sub-species 5) live in the sea, now and then two dorsal
 * fins break the surface on one of their tiles in view, circle a few laps and
 * sink again; never more than MAX_CIRCLES at once. Surfacing, the lap and
 * sinking are all in the sprite (shark_fins, tools/fx/sharks.js); this file
 * only picks the spot and times the frames. A spot is open, ice-free water
 * with no creature icon close by, so nothing is hidden or drawn over. Below
 * 16 px per tile and with "Effekte reduzieren" no fins. Visual only: the
 * simulation never reads this.
 *
 * Wiring (render.ts): `draw` expects ctx at identity (device pixels) and
 * leaves it there.
 * ========================================================================== */

namespace SE {
  /** CSS px per tile from which fins are drawn; below that an art pixel is under a screen pixel. */
  const MIN_TILE = 16;
  /** The Fish sub-species whose fins circle. */
  export const SHARK_STAGE = 4;
  const SPRITE = 'shark_fins';
  /** Sprite frames: rising, one lap (looped), then sinking. */
  const RISE = 4;
  const LAP = 24;
  const SINK = 4;
  /** Laps per sighting. */
  const LAPS = 4;
  /** Most circles on the planet at once; s before the next may start, and before looking again where none fits. */
  const MAX_CIRCLES = 2;
  const GAP_MIN = 4;
  const GAP_MAX = 20;
  const RETRY = 2;
  /** Sea temperature from which the map never draws pack ice (landfield.ts: ICE_TEMP + ICE_WOBBLE), °C. */
  const ICE_FREE = 5;
  /** Tiles kept free of creature icons (east–west, north–south) round a circle's tile, and kept between two circles. */
  const ICON_GAP_X = 2;
  const ICON_GAP_Y = 1;
  const CIRCLE_GAP = 3;

  /** Frame of the sprite `u` s into a sighting; −1 before it and once it is over. */
  export function sharkFrame(u: number, fps: number): number {
    const f = Math.floor(u * fps);
    const sink = RISE + LAPS * LAP;
    if (f < 0 || f >= sink + SINK) return -1;
    if (f < RISE) return f;
    return f < sink ? RISE + ((f - RISE) % LAP) : f - sink + RISE + LAP;
  }

  interface Circle {
    tile: number;
    /** Clock (s) it surfaced. */
    start: number;
  }

  export class SharkLayer {
    /** "Effekte reduzieren": no fins. */
    still = false;
    private readonly reducedMotion = typeof window !== 'undefined' && !!window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    private circles: Circle[] = [];
    /** Clock (s) from which another circle may start. */
    private next = 0;

    draw(ctx: CanvasRenderingContext2D, cam: LandCamera, markers: readonly HerdMarker[], world: WorldState, now: number): void {
      const art = FxArt.shared();
      const sp = FX_MANIFEST.sprites[SPRITE];
      if (this.still || this.reducedMotion || cam.tilePx < MIN_TILE || !sp || !art.ready) {
        // Gone rather than popping back mid-lap when the fins may show again.
        this.circles.length = 0;
        return;
      }
      const T = cam.tilePx * cam.dpr;
      const cols = ctx.canvas.width / T;
      const rows = ctx.canvas.height / T;
      const clock = now / 1000;
      this.circles = this.circles.filter((c) => sharkFrame(clock - c.start, sp.fps) >= 0);
      if (this.circles.length < MAX_CIRCLES && clock >= this.next) {
        const tile = this.pick(cam, cols, rows, markers, world);
        if (tile >= 0) this.circles.push({ tile, start: clock });
        this.next = clock + (tile >= 0 ? GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN) : RETRY);
      }
      for (const c of this.circles) {
        // The copy of the tile on the wrapping map nearest the view.
        let rx = (c.tile % GRID_W) - cam.scrollX;
        rx -= Math.floor(rx / GRID_W) * GRID_W;
        if (rx > GRID_W - 4) rx -= GRID_W;
        const ty = (c.tile / GRID_W) | 0;
        if (rx < -2 || rx > cols + 1 || ty - cam.scrollY < -2 || ty - cam.scrollY > rows + 1) continue;
        art.drawSprite(ctx, cam, SPRITE, sharkFrame(clock - c.start, sp.fps), Math.round(cam.scrollX + rx) * 16 + 8, ty * 16 + 8);
      }
    }

    /** A random shark tile fully in view where a circle fits, or −1. */
    private pick(cam: LandCamera, cols: number, rows: number, markers: readonly HerdMarker[], world: WorldState): number {
      const share = cometIceShare(world);
      const x0 = Math.ceil(cam.scrollX) + 1;
      const y0 = Math.max(1, Math.ceil(cam.scrollY) + 1);
      const x1 = Math.floor(cam.scrollX + cols) - 2;
      const y1 = Math.min(GRID_H - 2, Math.floor(cam.scrollY + rows) - 2);
      const near = (a: number, b: number, gx: number, gy: number): boolean => {
        let dx = Math.abs((a % GRID_W) - (b % GRID_W));
        dx = Math.min(dx, GRID_W - dx);
        return dx <= gx && Math.abs(((a / GRID_W) | 0) - ((b / GRID_W) | 0)) <= gy;
      };
      const found: number[] = [];
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = idx(wrapX(x), y);
          const li = i * LIFE_COUNT + Life.Fish;
          if (world.lifeStage[li] !== SHARK_STAGE || world.lifeDensity[li] <= 0) continue;
          if (!world.isWater(idx(wrapX(x - 1), y)) || !world.isWater(i) || !world.isWater(idx(wrapX(x + 1), y))) continue;
          if (world.temperature[i] < ICE_FREE || cometIceAt(world, i, share)) continue;
          found.push(i);
        }
      }
      // A few tries at random; after a miss the layer looks again RETRY s later.
      for (let n = 0; n < 8 && found.length > 0; n++) {
        const i = found[Math.floor(Math.random() * found.length)];
        if (this.circles.some((c) => near(c.tile, i, CIRCLE_GAP, CIRCLE_GAP))) continue;
        if (markers.some((m) => near(m.tile, i, ICON_GAP_X, ICON_GAP_Y))) continue;
        return i;
      }
      return -1;
    }
  }
}
