/* =============================================================================
 * Gaia Reborn — the stone beam along the bottom edge
 * -----------------------------------------------------------------------------
 * A row of flat stones across the bottom of the map with Gaia's rock at its
 * left end (gaiacompanion.ts draws the rock in front); right of the rock a
 * boulder steps down to the row. Moss grows on it with the planet, as on her
 * rock (groundLook). One pixel canvas above the map and the falling snow,
 * below Gaia's corner, the rail and the windows; redrawn only when the width,
 * the scale, the look or the art changes.
 * ========================================================================== */

namespace SE {
  /** The tiles' variants along the row (as tools' beam previews lay them): no variant twice in a row. */
  const ORDER = [0, 1, 2, 0, 2, 1];
  /** Art px of beam_end tucked under the rock's right flank. */
  const TUCK = 6;
  const Z = 30;

  export class StoneBeam {
    /** CSS px of the stone row at the bottom of the stage (0 until the art is ready). */
    height = 0;
    private readonly pc = new PixelCanvas('stone-beam', Z);
    private sig = '';

    constructor(private readonly stage: HTMLElement) {
      stage.appendChild(this.pc.canvas);
    }

    /** About ten times a second, with the living state; draws only when what it shows changed. */
    update(state: LivingState): void {
      const ui = UiArt.shared();
      const sc = uiScale();
      const look = groundLook(state);
      const W = Math.ceil(this.stage.clientWidth / sc.u);
      const sig = `${look}|${W}|${sc.s}|${sc.dpr}|${sc.beside}|${ui.version}|${ui.ready}`;
      if (sig === this.sig) return;
      this.sig = sig;
      const tile = ui.sprite('beam_tile');
      const end = ui.sprite('beam_end');
      const rock = ui.sprite('rock');
      if (!ui.ready || !tile || W <= 0) {
        this.pc.size(0, 0, sc);
        this.height = 0;
        return;
      }
      this.height = tile.h * sc.u;
      const H = Math.max(tile.h, end?.h ?? 0);
      this.pc.size(W, H, sc);
      this.pc.place({ left: 0, bottom: 0 });
      this.pc.clear();
      const ctx = this.pc.ctx;
      for (let i = 0, x = 0; x < W; i++, x += tile.w) ui.draw(ctx, 'beam_tile', ORDER[i % ORDER.length] * 4 + look, x + tile.ax, H - tile.h + tile.ay);
      if (end && rock) {
        // Gaia's corner stands right of the rail when the stage is too short for both (uiScale().beside).
        const scene = sc.beside ? UI_RAIL.left + UI_RAIL.width : 0;
        const x = scene + UI_SCENE.rockFootX - rock.ax + rock.w - TUCK;
        ui.draw(ctx, 'beam_end', look, x + end.ax, H - end.h + end.ay);
      }
    }
  }
}
