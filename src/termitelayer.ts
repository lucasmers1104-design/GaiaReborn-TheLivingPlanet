/* =============================================================================
 * SimEarth 2.0 — the termite mound on the map
 * -----------------------------------------------------------------------------
 * Draws the mound termites.ts raised on the savanna as an effect-atlas sprite
 * (tools/fx/termites.js): frames 0–7 a few termites at its opening, looped.
 * Under it, termites walk both ways along a few trails out to the
 * neighbouring land tiles (not onto water or a city), drawn here pixel by
 * pixel in the sprite's termite look: a pale body and a dark head. With
 * "Effekte reduzieren" everything stands still. Visual only: the simulation
 * never reads this.
 *
 * Wiring (render.ts, life layer): `draw` expects ctx at identity (device
 * pixels) and leaves it there.
 * ========================================================================== */

namespace SE {
  const SPRITE = 'termite_mound';
  /** Trails out to the neighbouring tiles, at most; each is walked both ways. */
  const TRAILS = 5;
  /** Termites per direction on one trail. */
  const PER_LANE = 4;
  /** Walking speed, art px per second. */
  const SPEED = 3;
  /** Below this many device px per tile a termite would shrink under a pixel. */
  const MIN_TILE = 16;
  /** Where the trails start, under the mound: art px from the tile's top left. */
  const NEST_X = 8;
  const NEST_Y = 10;
  const NEIGHBOURS: readonly (readonly [number, number])[] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

  interface Trail { sx: number; sy: number; cx: number; cy: number; ex: number; ey: number; len: number; phase: number }

  export class TermiteLayer {
    /** "Effekte reduzieren": the termites stand still. */
    still = false;
    private readonly reducedMotion = typeof window !== 'undefined' && !!window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    draw(ctx: CanvasRenderingContext2D, cam: LandCamera, world: WorldState, now: number): void {
      const tile = world.termiteMound;
      const sp = FX_MANIFEST.sprites[SPRITE];
      if (tile < 0 || !sp || world.isWater(tile) || !FxArt.shared().ready) return;
      const T = cam.tilePx * cam.dpr;
      // The copy of the tile on the wrapping map nearest the view.
      let rx = (tile % GRID_W) - cam.scrollX;
      rx -= Math.floor(rx / GRID_W) * GRID_W;
      if (rx > GRID_W - 2) rx -= GRID_W;
      const y = (tile / GRID_W) | 0;
      const ry = y - cam.scrollY;
      if (rx < -3 || rx > ctx.canvas.width / T + 2 || ry < -2 || ry > ctx.canvas.height / T + 2) return;
      const ox = Math.round(cam.scrollX + rx) * 16;
      const moving = !this.still && !this.reducedMotion;
      // Under the mound, so the termites come out from beneath its foot.
      if (T >= MIN_TILE) this.drawTrails(ctx, cam, world, tile, ox, y * 16, moving ? now / 1000 : 0);
      const frame = moving ? Math.floor((now / 1000) * sp.fps) % sp.frames.length : 0;
      FxArt.shared().drawSprite(ctx, cam, SPRITE, frame, ox + 8, y * 16 + 15);
    }

    private drawTrails(ctx: CanvasRenderingContext2D, cam: LandCamera, world: WorldState, tile: number, ox: number, oy: number, t: number): void {
      const s = (cam.tilePx * cam.dpr) / 16;
      const size = Math.ceil(s);
      const body = fxColor('sand', 4);
      const head = fxColor('laterite', 0);
      const dot = (wx: number, wy: number, color: string): void => {
        ctx.fillStyle = color;
        ctx.fillRect(Math.round((wx - cam.scrollX * 16) * s), Math.round((wy - cam.scrollY * 16) * s), size, size);
      };
      for (const r of trails(world, tile, ox, oy)) {
        for (let k = 0; k < PER_LANE * 2; k++) {
          const out = k < PER_LANE;
          const run = (t * SPEED) / r.len + r.phase + (k % PER_LANE) / PER_LANE + (out ? 0 : 0.5 / PER_LANE);
          const u = out ? run - Math.floor(run) : 1 - (run - Math.floor(run));
          const a = 1 - u;
          let dx = 2 * a * (r.cx - r.sx) + 2 * u * (r.ex - r.cx);
          let dy = 2 * a * (r.cy - r.sy) + 2 * u * (r.ey - r.cy);
          const d = Math.hypot(dx, dy) || 1;
          dx /= d;
          dy /= d;
          // The way home runs a pixel beside the way out.
          const side = out ? 0 : 1;
          const px = Math.floor(a * a * r.sx + 2 * a * u * r.cx + u * u * r.ex - dy * side);
          const py = Math.floor(a * a * r.sy + 2 * a * u * r.cy + u * u * r.ey + dx * side);
          const dir = out ? 1 : -1;
          dot(px, py, body);
          dot(px + Math.round(dx * dir), py + Math.round(dy * dir), head);
        }
      }
    }
  }

  /** The trails from the mound on `tile` to its land neighbours, in art px with the tile's top left at (ox, oy); fixed per tile. */
  function trails(world: WorldState, tile: number, ox: number, oy: number): Trail[] {
    const x = tile % GRID_W;
    const y = (tile / GRID_W) | 0;
    const open = NEIGHBOURS.map((n, k) => ({ n, k, order: tileHash(tile, 410 + k) })).filter(({ n }) => {
      const ny = y + n[1];
      if (ny < 0 || ny >= GRID_H) return false;
      const j = idx(wrapX(x + n[0]), ny);
      return !world.isWater(j) && world.tech[j] === Tech.None;
    });
    open.sort((p, q) => p.order - q.order);
    return open.slice(0, TRAILS).map(({ n, k }) => {
      const sx = ox + NEST_X;
      const sy = oy + NEST_Y;
      const ex = ox + 8 + n[0] * 16 + Math.round((tileHash(tile, 420 + k) - 0.5) * 8);
      const ey = oy + 8 + n[1] * 16 + Math.round((tileHash(tile, 430 + k) - 0.5) * 8);
      // A gentle bend to one side, so the trails meander instead of radiating like spokes.
      const bend = (tileHash(tile, 440 + k) - 0.5) * 10;
      const l = Math.hypot(ex - sx, ey - sy) || 1;
      const cx = (sx + ex) / 2 - ((ey - sy) / l) * bend;
      const cy = (sy + ey) / 2 + ((ex - sx) / l) * bend;
      return { sx, sy, cx, cy, ex, ey, len: Math.hypot(cx - sx, cy - sy) + Math.hypot(ex - cx, ey - cy), phase: tileHash(tile, 450 + k) };
    });
  }
}
