/* =============================================================================
 * SimEarth 2.0 — the effect layer
 * -----------------------------------------------------------------------------
 * Draws the disasters over the map in the passes of docs/ereignisse-spec.md
 * §2.3, interleaved by EditView with its own layers:
 *   shake    tiles around an epicentre copied from the base picture with a
 *            stepped offset — local, never the whole screen
 *   ground   lava, flood water, scars (fxground.ts), with objects and cities
 *            laid back over it, then ground waves
 *   objects  sprites that stand on a tile, sorted by foot row; after each,
 *            the trees and cities of the row in front are drawn again over
 *            it (they are baked into the terrain below it), then shock
 *            waves and embers
 *   top      smoke, ash and steam above everything, then airborne particles
 * All passes draw in device pixels (identity transform).
 * ========================================================================== */

namespace SE {
  /** Rows of the tile in front that its trees and cities reach up into (style: ≤ 4 px; mountains 8). */
  const OCCLUDER_ROWS = 8;
  /** Occluder patches kept before the cache starts afresh. */
  const OCCLUDER_CACHE = 1024;
  /** Steps of the local tremor, 12 per second. */
  const SHAKE_STEP_MS = 83;
  const SHAKE_PATH: readonly (readonly [number, number])[] = [[1, 0], [-1, 1], [0, -1], [-1, 0]];

  export class EffectLayer {
    readonly show = new FxShow();
    private readonly particles = new FxParticles();
    private readonly ground = new FxGround();
    private readonly sea = new SeaWave();
    private readonly shore = new FxShore();
    private scene: FxScene | null = null;
    private last = 0;
    /** Occluder patches by position, each with the terrain signature of the row it was cut from. */
    private readonly occluders = new Map<string, { sig: number; canvas: HTMLCanvasElement | null }>();
    private readonly placements: LandPlacement[] = [];
    /** World tick the map's base picture shows; the renderer keeps it current. */
    baseTick = -1;

    constructor() {
      FxArt.shared().load();
    }

    get reduce(): boolean {
      return this.show.reduce;
    }

    set reduce(on: boolean) {
      this.show.reduce = on;
    }

    /** Build this frame's scene and move the particles; `phase` is how far the game is between two ticks. */
    update(world: WorldState, cam: LandCamera, cols: number, rows: number, now: number, phase?: number): void {
      const dt = this.last ? Math.min(0.25, (now - this.last) / 1000) : 0;
      this.last = now;
      this.particles.update(dt);
      this.scene = this.show.build(world, cam, cols, rows, now, dt, this.particles, phase);
    }

    drawShake(ctx: CanvasRenderingContext2D, base: HTMLCanvasElement, cam: LandCamera, now: number): void {
      const s = this.scene;
      if (!s || s.shakes.length === 0) return;
      const T = cam.tilePx * cam.dpr;
      const step = SHAKE_PATH[Math.floor(now / SHAKE_STEP_MS) % SHAKE_PATH.length];
      for (const q of s.shakes) {
        const off = (T / 16) * q.amp;
        // The nearest copy on the wrapping map, which may start left of the view.
        const rx = ((q.x - q.radius - cam.scrollX) % GRID_W + GRID_W * 1.5) % GRID_W - GRID_W / 2;
        const sx = Math.round(rx * T);
        const sy = Math.round((q.y - q.radius - cam.scrollY) * T);
        const side = Math.round((2 * q.radius + 1) * T);
        ctx.drawImage(base, sx, sy, side, side, sx + Math.round(step[0] * off), sy + Math.round(step[1] * off), side, side);
      }
    }

    drawGround(ctx: CanvasRenderingContext2D, world: WorldState, cam: LandCamera, land: PixelTerrain, now: number,
      cities: (x0: number, y0: number, x1: number, y1: number) => void): void {
      if (this.scene) this.sea.draw(ctx, world, cam, land, this.scene, now);
      this.ground.draw(ctx, cam, world, land, now, cities, this.baseTick, this.scene?.phase);
      if (this.scene) this.shore.draw(ctx, world, cam, land, this.scene);
      this.drawRings(ctx, cam, true);
      this.drawDecals(ctx, world, cam, land, cities);
    }

    /** Flat sprites on the ground; the trees and cities standing on every tile row they touch cover them again. */
    private drawDecals(ctx: CanvasRenderingContext2D, world: WorldState, cam: LandCamera, land: PixelTerrain,
      cities: (x0: number, y0: number, x1: number, y1: number) => void): void {
      const s = this.scene;
      const art = FxArt.shared();
      const landArt = land.art;
      if (!s || !art.ready || !landArt) return;
      for (const d of s.decals) {
        const sp = FX_MANIFEST.sprites[d.id];
        if (!sp) continue;
        const x = this.nearView(d.x, cam, ctx);
        art.drawSprite(ctx, cam, d.id, d.frame, x, d.y, d.rows ?? null, d.sx, d.sy);
        const left = Math.floor(x - (d.sx ?? sp.ax));
        const top = Math.floor(d.y - (d.sy ?? sp.ay));
        const bottom = top + sp.h;
        // A row's objects cover their own tiles and reach OCCLUDER_ROWS up into the row behind.
        const h = 16 + OCCLUDER_ROWS;
        for (let row = Math.floor(top / 16); row <= Math.floor((bottom - 1 + OCCLUDER_ROWS) / 16) && row < GRID_H; row++) {
          if (row < 0) continue;
          const y0 = Math.max(top, row * 16 - OCCLUDER_ROWS);
          const y1 = Math.min(bottom, (row + 1) * 16);
          if (y1 <= y0) continue;
          const patch = this.occluderPatch(land, landArt, left, row, sp.w, (row + 1) * 16, h);
          if (patch) art.drawPixels(ctx, cam, patch, 0, y0 - ((row + 1) * 16 - h), sp.w, y1 - y0, left, y0);
          this.coverCities(ctx, world, cam, row, left, sp.w, y0, y1, cities);
        }
      }
    }

    /** Redraw the cities of tile row `row` over the art rows [y0, y1) of columns [left, left + w), if any stand there. */
    private coverCities(ctx: CanvasRenderingContext2D, world: WorldState, cam: LandCamera, row: number, left: number, w: number,
      y0: number, y1: number, cities: (x0: number, y0: number, x1: number, y1: number) => void): void {
      if (row < 0 || row >= GRID_H) return;
      let city = false;
      for (let tx = Math.floor(left / 16) - 1; tx <= Math.floor((left + w) / 16) + 1 && !city; tx++) city = world.tech[idx(wrapX(tx), row)] !== Tech.None;
      if (!city) return;
      const s = (cam.tilePx * cam.dpr) / 16;
      cities((left - cam.scrollX * 16) * s, (y0 - cam.scrollY * 16) * s, (left + w - cam.scrollX * 16) * s, (y1 - cam.scrollY * 16) * s);
    }

    drawObjects(ctx: CanvasRenderingContext2D, world: WorldState, cam: LandCamera, land: PixelTerrain,
      cities: (x0: number, y0: number, x1: number, y1: number) => void): void {
      const s = this.scene;
      if (!s) return;
      const art = FxArt.shared();
      if (art.ready) {
        const list = s.objects.sort((a, b) => a.foot - b.foot || (a.z ?? 0) - (b.z ?? 0) || a.x - b.x);
        // Positions of moving sprites never repeat; drop the patches now and then rather than keep them all.
        if (this.occluders.size > OCCLUDER_CACHE) this.occluders.clear();
        for (const d of list) {
          const x = this.nearView(d.x, cam, ctx);
          art.drawSprite(ctx, cam, d.id, d.frame, x, d.y, d.rows ?? null, d.sx, d.sy);
          this.occlude(ctx, world, cam, land, d, x, cities);
        }
      }
      this.drawRings(ctx, cam, false);
      this.particles.draw(ctx, cam, false);
    }

    private drawRings(ctx: CanvasRenderingContext2D, cam: LandCamera, ground: boolean): void {
      const s = this.scene;
      if (!s) return;
      for (const r of s.rings) if (r.ground === ground) drawRing(ctx, cam, this.nearView(r.x, cam, ctx), r.y, r.r, r.light, r.dark, r.dash);
    }

    drawTop(ctx: CanvasRenderingContext2D, cam: LandCamera): void {
      const s = this.scene;
      if (!s) return;
      const art = FxArt.shared();
      if (art.ready) {
        for (const d of s.tops.sort((a, b) => a.foot - b.foot || a.x - b.x)) {
          art.drawSprite(ctx, cam, d.id, d.frame, this.nearView(d.x, cam, ctx), d.y, d.rows ?? null, d.sx, d.sy);
        }
      }
      this.particles.draw(ctx, cam, true);
    }

    /** The copy of world x (art pixels) on the wrapping map that lies in or just left of the view. */
    private nearView(x: number, cam: LandCamera, ctx: CanvasRenderingContext2D): number {
      const span = GRID_W * 16;
      const left = cam.scrollX * 16 - 64;
      let d = ((x - left) % span + span) % span;
      if (d * (cam.tilePx * cam.dpr) / 16 > ctx.canvas.width + 128 * cam.tilePx * cam.dpr / 16) d -= span;
      return left + d;
    }

    /** Redraw over sprite `d` the trees and cities whose foot lies in the row in front of it. */
    private occlude(ctx: CanvasRenderingContext2D, world: WorldState, cam: LandCamera, land: PixelTerrain, d: FxDraw, x: number,
      cities: (x0: number, y0: number, x1: number, y1: number) => void): void {
      const sp = FX_MANIFEST.sprites[d.id];
      const landArt = land.art;
      if (!sp || !landArt) return;
      const front = (Math.floor(d.foot / 16) + 1) * 16;
      const left = Math.floor(x - (d.sx ?? sp.ax));
      const top = d.y - (d.sy ?? sp.ay) + (d.rows ? d.rows[0] : 0);
      const bottom = d.y - (d.sy ?? sp.ay) + (d.rows ? d.rows[1] : sp.h);
      const y0 = Math.max(front - OCCLUDER_ROWS, Math.floor(top));
      const y1 = Math.min(front, Math.ceil(bottom));
      if (y1 <= y0) return;
      const patch = this.occluderPatch(land, landArt, left, front / 16, sp.w, front, OCCLUDER_ROWS);
      if (patch) FxArt.shared().drawPixels(ctx, cam, patch, 0, y0 - (front - OCCLUDER_ROWS), sp.w, y1 - y0, left, y0);
      this.coverCities(ctx, world, cam, front / 16, left, sp.w, y0, y1, cities);
    }

    /**
     * The objects standing in tile row `row`, over columns [left, left + w), as
     * they cover the h art rows that end at world pixel `bottom`: the row's own
     * tiles, or the overhang into the row behind it.
     */
    private occluderPatch(land: PixelTerrain, landArt: LandArt, left: number, row: number, w: number, bottom: number, h: number): HTMLCanvasElement | null {
      // Checked against the field itself: a blast clears the trees in the frame it commits, before the next tick.
      const key = `${left}|${row}|${w}|${bottom}|${h}`;
      const f = land.field;
      const sig = f.signature(Math.floor(left / 16) - 1, row, Math.ceil(w / 16) + 2, 1, 0);
      const hit = this.occluders.get(key);
      if (hit && hit.sig === sig) return hit.canvas;
      placeLandObjects(f, landArt, Math.floor(left / 16) - 1, row, Math.floor((left + w) / 16) + 1, row, this.placements);
      const list = this.placements.filter((p) => !p.water && !f.paths.near(p.fx + 0.5, p.fy + 0.5, RIVER_CLEARANCE));
      let canvas: HTMLCanvasElement | null = null;
      if (list.length > 0 && row < GRID_H) {
        const px = new Uint8Array(w * h);
        drawLandObjects(list, landArt, px, new Uint8Array(w * h), new Uint8Array(w * h), w, h, left, bottom - h, null, null, f.shade);
        if (px.some((v) => v !== 0)) {
          canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const c = canvas.getContext('2d');
          if (c) {
            const image = c.createImageData(w, h);
            const words = new Uint32Array(image.data.buffer);
            for (let k = 0; k < px.length; k++) if (px[k] !== 0) words[k] = landArt.rgba[px[k]];
            c.putImageData(image, 0, 0);
          }
        }
      }
      this.occluders.set(key, { sig, canvas });
      return canvas;
    }
  }
}
