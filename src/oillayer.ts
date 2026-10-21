/* =============================================================================
 * SimEarth 2.0 — the oil platform and the desert derrick on the map
 * -----------------------------------------------------------------------------
 * Draws the two rigs oil.ts placed once with the Industrial age as effect-atlas
 * sprites (tools/fx/offshore.js, oilfield.js): frames 0–7 work in a loop,
 * frame 8 is the rig shut down once the planet's oil is gone. With "Effekte
 * reduzieren" the working rig stands still on frame 0. A rig whose tile has
 * drifted or been brushed to the other side of the shore is not drawn.
 * Visual only: the simulation never reads this.
 *
 * Wiring (render.ts): `draw` expects ctx at identity (device pixels) and
 * leaves it there.
 * ========================================================================== */

namespace SE {
  export class OilRigLayer {
    /** "Effekte reduzieren": the rigs stand still. */
    still = false;
    private readonly reducedMotion = typeof window !== 'undefined' && !!window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    draw(ctx: CanvasRenderingContext2D, cam: LandCamera, world: WorldState, now: number): void {
      if (!FxArt.shared().ready) return;
      this.drawRig(ctx, cam, world, now, world.oilRigSea, 'oil_platform', true);
      this.drawRig(ctx, cam, world, now, world.oilRigLand, 'oil_derrick', false);
    }

    private drawRig(ctx: CanvasRenderingContext2D, cam: LandCamera, world: WorldState, now: number, tile: number, id: string, sea: boolean): void {
      const sp = FX_MANIFEST.sprites[id];
      if (tile < 0 || !sp || world.isWater(tile) !== sea) return;
      const T = cam.tilePx * cam.dpr;
      // The copy of the tile on the wrapping map nearest the view.
      let rx = (tile % GRID_W) - cam.scrollX;
      rx -= Math.floor(rx / GRID_W) * GRID_W;
      if (rx > GRID_W - 2) rx -= GRID_W;
      const y = (tile / GRID_W) | 0;
      const ry = y - cam.scrollY;
      if (rx < -2 || rx > ctx.canvas.width / T + 1 || ry < -1 || ry > ctx.canvas.height / T + 2) return;
      const frame = world.oil <= 0 ? sp.loop
        : this.still || this.reducedMotion ? 0
          : Math.floor((now / 1000) * sp.fps) % sp.loop;
      FxArt.shared().drawSprite(ctx, cam, id, frame, Math.round(cam.scrollX + rx) * 16 + 8, y * 16 + 15);
    }
  }
}
