/* =============================================================================
 * SimEarth 2.0 — ambient life over the Edit window
 * -----------------------------------------------------------------------------
 * Drifting clouds with their shadows, and the odd glint of sun on open water.
 * Pure decoration over the cached map: it reads the water mask and the
 * planet's humidity, changes nothing, and costs two scaled blits and a few
 * rectangles a frame. The clouds are pixel art like the map below them.
 * ========================================================================== */

namespace SE {
  /** Cloud texels per tile along each axis: two ground-art pixels per texel; at 4 the edges read as blocks. */
  const CLOUD_RES = 8;
  /** Tiles per second the cloud deck drifts east. */
  const CLOUD_DRIFT = 0.22;
  /** Cloud shadows fall this many tiles south-east of their clouds. */
  const SHADOW_OFFSET = 1.25;
  /** Largest sideways shift of the cloud noise lookup, texels. */
  const CLOUD_WARP = 3.5 * CLOUD_RES;
  const GLINT_MAX = 20;
  const GLINT_MS = 1100;
  /** Wall-clock gap between attempts to start a new glint. */
  const GLINT_EVERY_MS = 70;
  /** How long a ping's rings spread. */
  const PING_MS = 2600;

  export interface AmbientView {
    readonly scrollX: number;
    readonly scrollY: number;
    readonly tilePx: number;
    readonly cols: number;
    readonly rows: number;
  }

  interface Glint {
    /** Position in tiles, snapped to the sprite-pixel grid. */
    readonly x: number;
    readonly y: number;
    readonly born: number;
  }

  export class AmbientLayer {
    private deck: HTMLCanvasElement | null = null;
    private shade: HTMLCanvasElement | null = null;
    private readonly glints: Glint[] = [];
    private lastSpawn = 0;
    private readonly pings: { x: number; y: number; color: string; born: number }[] = [];
    private readonly still = typeof window !== 'undefined' &&
      !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    draw(ctx: CanvasRenderingContext2D, view: AmbientView, world: WorldState, now: number, sea: boolean, clouds: boolean): void {
      if (sea && !this.still) this.drawGlints(ctx, view, world, now);
      if (clouds) this.drawClouds(ctx, view, world, this.still ? 0 : now);
      if (this.pings.length > 0) this.drawPings(ctx, view, now);
    }

    ping(x: number, y: number, color: string, now: number): void {
      this.pings.push({ x, y, color, born: now });
    }

    /** Three rings spreading from the tile's centre, one after another. */
    private drawPings(ctx: CanvasRenderingContext2D, view: AmbientView, now: number): void {
      const size = view.tilePx;
      for (let k = this.pings.length - 1; k >= 0; k--) {
        const p = this.pings[k];
        const age = (now - p.born) / PING_MS;
        if (age >= 1) { this.pings.splice(k, 1); continue; }
        let rx = p.x + 0.5 - view.scrollX;
        if (rx < 0) rx += GRID_W;
        const cx = rx * size;
        const cy = (p.y + 0.5 - view.scrollY) * size;
        ctx.strokeStyle = p.color;
        for (let r = 0; r < 3; r++) {
          const t = age * 1.6 - r * 0.25;
          if (t <= 0 || t >= 1) continue;
          ctx.globalAlpha = 1 - t;
          ctx.lineWidth = 3 * (1 - t) + 1;
          ctx.beginPath();
          ctx.arc(cx, cy, size * (0.6 + t * 5), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    /* -------------------------------------------------------------- clouds -- */

    private drawClouds(ctx: CanvasRenderingContext2D, view: AmbientView, world: WorldState, now: number): void {
      if (!this.deck || !this.shade) this.build();
      const deck = this.deck as HTMLCanvasElement;
      const shade = this.shade as HTMLCanvasElement;
      const size = view.tilePx;
      // Close up the player is working on single tiles; let the sky thin out.
      const zoomFade = clamp((44 - size) / 26, 0.3, 1);
      const alpha = (0.2 + 0.3 * clamp(world.vapor, 0, 1)) * zoomFade;
      const drift = (now / 1000) * CLOUD_DRIFT;
      const span = GRID_W * size;
      const height = GRID_H * size;
      const viewW = view.cols * size;

      ctx.imageSmoothingEnabled = false;
      const blit = (img: HTMLCanvasElement, offset: number, a: number): void => {
        ctx.globalAlpha = a;
        let x = ((drift + offset - view.scrollX) * size) % span;
        if (x > 0) x -= span;
        const y = (offset - view.scrollY) * size;
        for (; x < viewW; x += span) ctx.drawImage(img, x, y, span, height);
      };
      blit(shade, SHADOW_OFFSET, alpha * 0.4);
      blit(deck, 0, alpha);
      ctx.globalAlpha = 1;
    }

    /** One seamless deck of clouds for the whole planet, made once. */
    private build(): void {
      const w = GRID_W * CLOUD_RES;
      const h = GRID_H * CLOUD_RES;
      const field = AmbientLayer.noise(w, h, 0x5eed);
      this.deck = AmbientLayer.paint(field, w, h, [246, 250, 250], [0, 0.22, 0.55, 0.9], true);
      this.shade = AmbientLayer.paint(field, w, h, [6, 18, 26], [0, 1, 1, 1]);
    }

    /** Four stepped alpha levels, so the edges stay crisp pixel art. */
    private static paint(field: Float32Array, w: number, h: number, rgb: Rgb, levels: readonly number[], lit = false): HTMLCanvasElement {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return canvas;
      const img = ctx.createImageData(w, h);
      const d = img.data;
      const levelAt = (x: number, y: number): number => {
        const v = field[Math.min(h - 1, Math.max(0, y)) * w + ((x + w) % w)];
        return v > 0.7 ? 3 : v > 0.655 ? 2 : v > 0.625 ? 1 : 0;
      };
      for (let p = 0; p < w * h; p++) {
        const x = p % w;
        const y = (p / w) | 0;
        const level = levelAt(x, y);
        // Lit clouds get volume, light from the upper left like the ground:
        // a bright rim where the cloud thins up-left, a grey one down-right.
        let tone = 0;
        if (lit && level >= 2) {
          if (levelAt(x + 1, y + 1) < level) tone = -34;
          else if (levelAt(x - 1, y - 1) < level) tone = 8;
          else tone = -12;
        }
        d[p * 4] = Math.min(255, rgb[0] + tone);
        d[p * 4 + 1] = Math.min(255, rgb[1] + tone);
        d[p * 4 + 2] = Math.min(255, rgb[2] + tone * 0.6);
        d[p * 4 + 3] = Math.round(levels[level] * 255);
      }
      ctx.putImageData(img, 0, 0);
      return canvas;
    }

    /** Value-noise fBm in 0..1, wrapping in X like the planet. */
    private static noise(w: number, h: number, seed: number): Float32Array {
      const rng = new Rng(seed);
      const base = AmbientLayer.fbm(w, h, rng, [[10, 5, 1], [20, 10, 0.5], [40, 20, 0.25], [80, 40, 0.12]]);
      // Sampled through a slow warp: value noise alone leaves long straight
      // cloud edges along its lattice lines.
      const wx = AmbientLayer.fbm(w, h, rng, [[40, 20, 1], [80, 40, 0.5]]);
      const wy = AmbientLayer.fbm(w, h, rng, [[40, 20, 1], [80, 40, 0.5]]);
      const out = new Float32Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const p = y * w + x;
          const sx = (x + Math.round((wx[p] - 0.5) * 2 * CLOUD_WARP) + w) % w;
          const sy = clamp(y + Math.round((wy[p] - 0.5) * 2 * CLOUD_WARP), 0, h - 1);
          out[p] = base[sy * w + sx];
        }
      }
      return out;
    }

    private static fbm(w: number, h: number, rng: Rng, octaves: readonly (readonly [number, number, number])[]): Float32Array {
      const out = new Float32Array(w * h);
      let total = 0;
      for (const [cx, cy, amp] of octaves) {
        total += amp;
        const lattice = new Float32Array(cx * (cy + 2));
        for (let k = 0; k < lattice.length; k++) lattice[k] = rng.next();
        // Each octave's lattice shifted by a fraction of a cell: aligned
        // lattices stack their flat seams into ruler-straight cloud edges.
        const sx = rng.next();
        const sy = rng.next();
        for (let y = 0; y < h; y++) {
          const fy = (y / h) * cy + sy;
          const y0 = Math.floor(fy);
          const ty = smoothstep(fy - y0);
          for (let x = 0; x < w; x++) {
            const fx = (x / w) * cx + sx;
            const x0 = Math.floor(fx) % cx;
            const tx = smoothstep(fx - Math.floor(fx));
            const x1 = (x0 + 1) % cx;
            const a = lattice[y0 * cx + x0];
            const b = lattice[y0 * cx + x1];
            const c = lattice[(y0 + 1) * cx + x0];
            const e = lattice[(y0 + 1) * cx + x1];
            out[y * w + x] += amp * lerp(lerp(a, b, tx), lerp(c, e, tx), ty);
          }
        }
      }
      for (let p = 0; p < out.length; p++) out[p] /= total;
      return out;
    }

    /* -------------------------------------------------------------- glints -- */

    private drawGlints(ctx: CanvasRenderingContext2D, view: AmbientView, world: WorldState, now: number): void {
      if (now - this.lastSpawn > GLINT_EVERY_MS && this.glints.length < GLINT_MAX) {
        this.lastSpawn = now;
        const tx = wrapX(Math.floor(view.scrollX + Math.random() * view.cols));
        const ty = Math.floor(view.scrollY + Math.random() * view.rows);
        const i = ty >= 0 && ty < GRID_H ? idx(tx, ty) : -1;
        if (i >= 0 && world.isWater(i) && world.biome[i] !== Biome.Arctic) {
          this.glints.push({ x: tx + ((Math.random() * 8) | 0) / 8, y: ty + ((Math.random() * 8) | 0) / 8, born: now });
        }
      }
      const size = view.tilePx;
      const p = Math.max(1, Math.round(size / 8));
      ctx.fillStyle = '#ffffff';
      for (let k = this.glints.length - 1; k >= 0; k--) {
        const g = this.glints[k];
        const t = (now - g.born) / GLINT_MS;
        if (t >= 1) { this.glints.splice(k, 1); continue; }
        let rx = g.x - view.scrollX;
        if (rx < 0) rx += GRID_W;
        const sx = Math.round(rx * size);
        const sy = Math.round((g.y - view.scrollY) * size);
        const a = Math.sin(Math.PI * t);
        ctx.globalAlpha = a * 0.85;
        ctx.fillRect(sx, sy, p, p);
        // At its brightest the glint opens into a little four-point star.
        if (a > 0.7) {
          ctx.globalAlpha = (a - 0.7) * 1.6;
          ctx.fillRect(sx - p, sy, p, p);
          ctx.fillRect(sx + p, sy, p, p);
          ctx.fillRect(sx, sy - p, p, p);
          ctx.fillRect(sx, sy + p, p, p);
        }
      }
      ctx.globalAlpha = 1;
    }
  }
}
