/* =============================================================================
 * SimEarth 2.0 — the spaceport on the map
 * -----------------------------------------------------------------------------
 * Draws the launch site spaceport.ts placed with the effect-atlas sprite of
 * its phase (tools/fx/spaceport.js): the pad, the lower stage in scaffolding,
 * the full rocket at its tower, the rocket ready on the finished ramp, and
 * the empty pad after the launch. Each phase's frames loop; with "Effekte
 * reduzieren" it stands still on frame 0. Visual only: the simulation never
 * reads this. `hit` tells the app which map tiles the picture covers, so a
 * click on the rocket opens the project window.
 *
 * Wiring (render.ts): `draw` expects ctx at identity (device pixels) and
 * leaves it there.
 * ========================================================================== */

namespace SE {
  /** Sprite per phase (SpacePhase order). */
  const PHASE_SPRITES: readonly string[] = ['spaceport_pad', 'spaceport_stage', 'spaceport_rocket', 'spaceport_ready'];

  /** The sprite the spaceport shows now. */
  export function spaceportSprite(s: SpaceState): string {
    return s.launched >= 0 ? 'spaceport_launched' : PHASE_SPRITES[spacePhase(s.progress)];
  }

  export class SpaceportLayer {
    /** "Effekte reduzieren": the site stands still. */
    still = false;
    private readonly reducedMotion = typeof window !== 'undefined' && !!window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    draw(ctx: CanvasRenderingContext2D, cam: LandCamera, world: WorldState, now: number): void {
      const tile = world.space.site;
      if (tile < 0 || world.isWater(tile) || !FxArt.shared().ready) return;
      const id = spaceportSprite(world.space);
      const sp = FX_MANIFEST.sprites[id];
      if (!sp) return;
      const T = cam.tilePx * cam.dpr;
      // The copy of the tile on the wrapping map nearest the view.
      let rx = (tile % GRID_W) - cam.scrollX;
      rx -= Math.floor(rx / GRID_W) * GRID_W;
      if (rx > GRID_W - 2) rx -= GRID_W;
      const y = (tile / GRID_W) | 0;
      const ry = y - cam.scrollY;
      if (rx < -2 || rx > ctx.canvas.width / T + 2 || ry < -1 || ry > ctx.canvas.height / T + SPACE_RISE + 1) return;
      const frame = this.still || this.reducedMotion || sp.fps <= 0 ? 0 : Math.floor((now / 1000) * sp.fps) % sp.frames.length;
      FxArt.shared().drawSprite(ctx, cam, id, frame, Math.round(cam.scrollX + rx) * 16 + 8, y * 16 + 15);
    }

    /** Tile (x, y) lies under the drawn site: the pad, its apron or the rocket above it. */
    static hit(world: WorldState, x: number, y: number): boolean {
      const tile = world.space.site;
      if (tile < 0) return false;
      let dx = Math.abs(x - (tile % GRID_W));
      dx = Math.min(dx, GRID_W - dx);
      const dy = Math.floor(tile / GRID_W) - y;
      return dx <= 1 && dy >= 0 && dy <= SPACE_RISE;
    }
  }
}
