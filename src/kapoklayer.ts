/* =============================================================================
 * SimEarth 2.0 — the kapok tree on the map
 * -----------------------------------------------------------------------------
 * Draws the tree kapok.ts raised in the largest rainforest as an effect-atlas
 * sprite (tools/fx/kapok.js), over the rainforest's own trees, which it
 * outgrows. Part of the landscape, so it shows with every layer. Visual only:
 * the simulation never reads this.
 *
 * Wiring (render.ts, after the creatures and settlers, before the disaster
 * objects and storks): `draw` expects ctx at identity
 * (device pixels) and leaves it there.
 * ========================================================================== */

namespace SE {
  export const KAPOK_SPRITE = 'kapok_tree';

  export class KapokLayer {
    draw(ctx: CanvasRenderingContext2D, cam: LandCamera, world: WorldState): void {
      const tile = world.kapokTree;
      if (tile < 0 || !FX_MANIFEST.sprites[KAPOK_SPRITE] || !FxArt.shared().ready) return;
      const T = cam.tilePx * cam.dpr;
      // The copy of the tile on the wrapping map nearest the view.
      let rx = (tile % GRID_W) - cam.scrollX;
      rx -= Math.floor(rx / GRID_W) * GRID_W;
      if (rx > GRID_W - 2) rx -= GRID_W;
      const y = (tile / GRID_W) | 0;
      const ry = y - cam.scrollY;
      if (rx < -2 || rx > ctx.canvas.width / T + 2 || ry < -1 || ry > ctx.canvas.height / T + 2) return;
      FxArt.shared().drawSprite(ctx, cam, KAPOK_SPRITE, 0, Math.round(cam.scrollX + rx) * 16 + 8, y * 16 + 15);
    }
  }
}
