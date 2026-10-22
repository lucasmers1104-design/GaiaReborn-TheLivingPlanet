/* =============================================================================
 * SimEarth 2.0 — world wonders on the map
 * -----------------------------------------------------------------------------
 * Draws the wonders wonders.ts builds with the effect-atlas sprites of their
 * stage (tools/fx/wonders.js): the pyramids over their 3 × 2 tiles, the wall
 * one piece per tile with an arm towards each neighbour on its chain and a
 * watchtower on every WALL_TOWER_EVERY-th piece, and while it is built a crew
 * hauling a block at the foot of the pyramids or at the head of the wall.
 * Every piece stands on the ground of the 3/4 relief, lifted by landRiseAt
 * at its place like the train, so the wall runs along the ridges.
 * "Effekte reduzieren" stills the crew. Below 16 px per tile the sprites are
 * scaled down like the trees: wonders are landmarks. A sprite missing from
 * the atlas is skipped. Visual only: the simulation never reads this.
 *
 * Wiring (render.ts): `draw` expects ctx at identity (device pixels) and
 * leaves it there.
 * ========================================================================== */

namespace SE {
  /** Milliseconds the crew takes there and back. */
  const CREW_PERIOD = 9000;
  /** Tiles the relief may lift a piece from below the view into it. */
  const RISE_TILES = 4;

  /** Art pixels the relief lifts ground point (wx, wy), as the compositor draws it. */
  function lift(field: TerrainField, wx: number, wy: number): number {
    return Math.round(landRiseAt(field, wx, wy));
  }

  export class WonderLayer {
    /** "Effekte reduzieren": the crew stands still. */
    still = false;
    private readonly reducedMotion = typeof window !== 'undefined' && !!window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /** Expects ctx at identity (device pixels) and leaves it there. */
    draw(ctx: CanvasRenderingContext2D, cam: LandCamera, world: WorldState, field: TerrainField, now: number): void {
      if (world.civ.wonders.length === 0 || !FxArt.shared().ready) return;
      for (const w of world.civ.wonders) {
        if (w.kind === 'pyramids') this.drawPyramids(ctx, cam, field, w, now);
        else this.drawWall(ctx, cam, field, w, now);
      }
    }

    /**
     * Tile x of the copy of `tile` on the wrapping map nearest the view, or
     * null if a picture reaching `side` tiles left and right and `up` tiles
     * above it lies out of view.
     */
    private viewX(ctx: CanvasRenderingContext2D, cam: LandCamera, tile: number, side: number, up: number): number | null {
      const T = cam.tilePx * cam.dpr;
      let rx = (tile % GRID_W) - cam.scrollX;
      rx -= Math.floor(rx / GRID_W) * GRID_W;
      if (rx > GRID_W - side - 1) rx -= GRID_W;
      const ry = Math.floor(tile / GRID_W) - cam.scrollY;
      if (rx < -side - 1 || rx > ctx.canvas.width / T + side || ry < -1 || ry > ctx.canvas.height / T + up) return null;
      return Math.round(cam.scrollX + rx);
    }

    private drawPyramids(ctx: CanvasRenderingContext2D, cam: LandCamera, field: TerrainField, w: Wonder, now: number): void {
      const sp = FX_MANIFEST.sprites.wonder_pyramids;
      const a = w.tiles[4];
      const x = sp ? this.viewX(ctx, cam, a, 2, RISE_TILES + 3) : null;
      if (!sp || x === null) return;
      const foot = Math.floor(a / GRID_W) * 16 + 15;
      const wx = x * 16 + 8;
      FxArt.shared().drawSprite(ctx, cam, 'wonder_pyramids', Math.min(wonderStage(w), sp.frames.length - 1), wx, foot - lift(field, wx, foot));
      if (w.done < 0 && !w.paused) this.drawCrew(ctx, cam, field, wx, foot, 28, now);
    }

    private drawWall(ctx: CanvasRenderingContext2D, cam: LandCamera, field: TerrainField, w: Wonder, now: number): void {
      const arm = FX_MANIFEST.sprites.wonder_wall;
      const tower = FX_MANIFEST.sprites.wonder_wall_tower;
      const art = FxArt.shared();
      const n = w.tiles.length;
      const perDir = arm ? arm.frames.length / 8 : 0;
      // Tiles from north to south, as the map's objects stand.
      const order = w.tiles.map((_, k) => k).sort((p, q) => w.tiles[p] - w.tiles[q]);
      let head = -1;
      for (const k of order) {
        const stage = wonderStage(w, k);
        if (stage < 0) continue;
        if (stage < 2 && k > head) head = k;
        const t = w.tiles[k];
        const x = this.viewX(ctx, cam, t, 1, RISE_TILES + 2);
        if (x === null) continue;
        // Both sprites are centred on the tile's lifted centre; its arms northern first, so each runs on under the next one drawn.
        const wx = x * 16 + 8;
        const cy = Math.floor(t / GRID_W) * 16 + 8;
        const y = cy - lift(field, wx, cy);
        if (arm) {
          const dirs = [k - 1, k + 1].filter((nb) => nb >= 0 && nb < n).map((nb) => wallArm(t, w.tiles[nb])).filter((d) => d >= 0);
          for (const d of dirs.sort((p, q) => p - q)) art.drawSprite(ctx, cam, 'wonder_wall', d * perDir + Math.min(stage, perDir - 1), wx, y);
        }
        // Towers on every WALL_TOWER_EVERY-th piece and at the far end, unless one stands right beside it.
        if (tower && (k % WALL_TOWER_EVERY === 0 || (k === n - 1 && k % WALL_TOWER_EVERY > 1))) {
          art.drawSprite(ctx, cam, 'wonder_wall_tower', Math.min(stage, tower.frames.length - 1), wx, y);
        }
      }
      if (w.done >= 0 || w.paused || head < 0) return;
      const t = w.tiles[head];
      const x = this.viewX(ctx, cam, t, 1, RISE_TILES + 1);
      if (x !== null) this.drawCrew(ctx, cam, field, x * 16 + 8, Math.floor(t / GRID_W) * 16 + 15, 8, now);
    }

    /** Builders hauling a block, there and back over `span` art pixels round ground point (wx, wy), lifted by the relief; still on frame 0 with reduced effects. */
    private drawCrew(ctx: CanvasRenderingContext2D, cam: LandCamera, field: TerrainField, wx: number, wy: number, span: number, now: number): void {
      const sp = FX_MANIFEST.sprites.wonder_crew;
      if (!sp) return;
      const art = FxArt.shared();
      if (this.still || this.reducedMotion) {
        art.drawSprite(ctx, cam, 'wonder_crew', 0, wx, wy - lift(field, wx, wy));
        return;
      }
      const phase = (now % CREW_PERIOD) / CREW_PERIOD;
      const back = phase >= 0.5;
      const x = Math.round(wx + ((back ? 2 - 2 * phase : 2 * phase) - 0.5) * span);
      const y = wy - lift(field, x, wy);
      const frame = Math.floor((now / 1000) * sp.fps) % sp.frames.length;
      if (!back) {
        art.drawSprite(ctx, cam, 'wonder_crew', frame, x, y);
        return;
      }
      // Walking west: the sprite mirrored about its anchor on the screen (its light is symmetric, catalog `mirror: 'runtime'`).
      const sx = Math.round((x - cam.scrollX * 16) * (cam.tilePx * cam.dpr / 16));
      ctx.setTransform(-1, 0, 0, 1, 2 * sx, 0);
      art.drawSprite(ctx, cam, 'wonder_crew', frame, x, y);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  /** Direction (HAZARD_NX/NY order) of the arm from tile `a` towards its chain neighbour `b`, or −1 if drift tore them apart. */
  function wallArm(a: number, b: number): number {
    let dx = (b % GRID_W) - (a % GRID_W);
    if (dx > GRID_W / 2) dx -= GRID_W;
    else if (dx < -GRID_W / 2) dx += GRID_W;
    const dy = Math.floor(b / GRID_W) - Math.floor(a / GRID_W);
    for (let k = 0; k < 8; k++) if (HAZARD_NX[k] === dx && HAZARD_NY[k] === dy) return k;
    return -1;
  }
}
