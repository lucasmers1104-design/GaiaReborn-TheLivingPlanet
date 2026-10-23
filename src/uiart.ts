/* =============================================================================
 * Gaia Reborn — the living interface's pixel art on screen
 * -----------------------------------------------------------------------------
 * Draws the generated UI atlas (uiatlas.ts, recipes in tools/uiart/) the way
 * pixel art must look: every art pixel a whole number of device pixels
 * (uiScale), nearest neighbour, never rotated, blurred or faded by alpha.
 * Each living layer draws into a PixelCanvas, whose backing store is in art
 * pixels and which the browser enlarges with image-rendering: pixelated.
 * UI_RAIL and UI_SCENE are the geometry the rail, the vines and Gaia's
 * corner share. No DOM at load time: the bundle also runs in Node tests and
 * web workers.
 * ========================================================================== */

namespace SE {
  /**
   * The navigation rail in art px: inset from the stage's left and top edges,
   * button box, step from one button to the next, the extra gap where the knot
   * parts the tool buttons from the window buttons, rail width, button count.
   */
  export const UI_RAIL = Object.freeze({ left: 4, top: 4, btn: 24, pitch: 28, knot: 10, width: 36, buttons: 9 });
  /** Gaia's corner scene in art px: the canvas at the stage's bottom left (right of the rail when beside), and the column of the rock's foot anchor (its row is h - 1). */
  export const UI_SCENE = Object.freeze({ w: 112, h: 72, rockFootX: 44 });

  /**
   * s: device px per art px (whole); dpr: device px per CSS px; u = s / dpr: CSS px per art px;
   * beside: Gaia's scene stands right of the rail instead of under it (the stage is too short for both at s).
   */
  export interface UiScale { readonly s: number; readonly dpr: number; readonly u: number; readonly beside: boolean }

  /** The rail plus a margin, and the rail above Gaia's scene, in art px: what must fit below the top bar. */
  const UI_RAIL_H = UI_RAIL.top + UI_RAIL.buttons * UI_RAIL.pitch + UI_RAIL.knot + 8;
  const UI_STACK = UI_RAIL_H + UI_SCENE.h;
  let scaleKey = '';
  let scaleNow: UiScale = { s: 1, dpr: 1, u: 1, beside: false };

  /**
   * The one scale of every living canvas: about innerHeight / 450 CSS px per
   * art px (1.5–3), rounded to whole device px, then stepped down until the
   * rail fits below the top bar; where Gaia's scene no longer fits under it
   * too, she moves beside it. Cached per viewport height and device pixel ratio.
   */
  export function uiScale(): UiScale {
    const dpr = window.devicePixelRatio || 1;
    const vh = window.innerHeight;
    const key = `${vh}|${dpr}`;
    if (key === scaleKey) return scaleNow;
    const room = vh - (document.getElementById('topbar')?.offsetHeight || 60);
    let s = Math.max(1, Math.round(Math.min(3, Math.max(1.5, vh / 450)) * dpr));
    // Halving every living canvas costs more than moving Gaia aside: only the rail must fit under the bar.
    while (s > 1 && (UI_RAIL_H * s) / dpr > room) s--;
    scaleKey = key;
    scaleNow = { s, dpr, u: s / dpr, beside: (UI_STACK * s) / dpr > room };
    return scaleNow;
  }

  export class UiArt {
    private static instance: UiArt | null = null;
    static shared(): UiArt {
      return UiArt.instance ?? (UiArt.instance = new UiArt());
    }

    private state: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
    private img: HTMLImageElement | null = null;
    private readonly warned = new Set<string>();
    /** Bumps when the atlas has loaded: a layer that drew before redraws when it changes. */
    version = 0;

    get ready(): boolean {
      return this.state === 'ready';
    }

    /** Decode the atlas once (a data URL: never tainted); draw() starts it too. */
    load(): void {
      if (this.state !== 'idle') return;
      this.state = 'loading';
      const img = new Image();
      img.onload = () => {
        this.img = img;
        this.state = 'ready';
        this.version++;
      };
      img.onerror = () => {
        this.state = 'failed';
        console.warn('Gaia Reborn: the UI atlas did not decode, the living interface draws no pixel art');
      };
      img.src = UI_ATLAS_PNG;
    }

    sprite(id: string): UiSprite | null {
      return UI_MANIFEST.sprites[id] ?? null;
    }

    /**
     * Frame f (wrapped into the sprite's frames) of sprite `id` with its anchor
     * at art px (x, y) of a canvas whose backing store is in art px; `mirror`
     * flips it left–right about the anchor column.
     */
    draw(ctx: CanvasRenderingContext2D, id: string, f: number, x: number, y: number, mirror = false): void {
      if (!this.img) { this.load(); return; }
      const sp = UI_MANIFEST.sprites[id];
      if (!sp) { this.warn(`sprite '${id}'`); return; }
      const n = sp.frames.length;
      const r = sp.frames[((Math.floor(f) % n) + n) % n];
      const px = Math.round(x);
      const top = Math.round(y) - sp.ay;
      ctx.imageSmoothingEnabled = false;
      if (!mirror) {
        ctx.drawImage(this.img, r.x, r.y, r.w, r.h, px - sp.ax, top, r.w, r.h);
        return;
      }
      // Source column c lands on px + ax - c, so the anchor column stays on px.
      ctx.save();
      ctx.translate(px + sp.ax + 1, top);
      ctx.scale(-1, 1);
      ctx.drawImage(this.img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      ctx.restore();
    }

    /** A named point of the sprite relative to its anchor (art px), or null. */
    point(id: string, name: string): readonly [number, number] | null {
      const sp = UI_MANIFEST.sprites[id];
      const p = sp?.points[name];
      return sp && p ? [p[0] - sp.ax, p[1] - sp.ay] : null;
    }

    /** The looping frame at page time `now` (ms): floor(now / 1000 · fps + phase) modulo the loop; 0 for a still sprite. */
    loopFrame(id: string, now: number, phase = 0): number {
      const sp = UI_MANIFEST.sprites[id];
      if (!sp || sp.fps <= 0 || sp.loop <= 0) return 0;
      const k = Math.floor((now / 1000) * sp.fps + phase) % sp.loop;
      return k < 0 ? k + sp.loop : k;
    }

    /** '#rrggbb' of a UI palette name such as 'vine3'; magenta for a name the palette lacks. */
    color(name: string): string {
      const c = UI_MANIFEST.colors[name];
      if (!c) this.warn(`colour '${name}'`);
      return c ?? '#ff00ff';
    }

    private warn(what: string): void {
      if (this.warned.has(what)) return;
      this.warned.add(what);
      console.warn(`Gaia Reborn: the UI atlas has no ${what}`);
    }
  }

  /**
   * A canvas whose backing store is in art px, shown at u CSS px per art px.
   * Everything layout-critical is inline (safe with a stale stylesheet); it
   * takes no pointer events and is hidden from assistive technology.
   */
  export class PixelCanvas {
    readonly canvas: HTMLCanvasElement;
    readonly ctx: CanvasRenderingContext2D;
    /** Backing store size in art px. */
    w = 0;
    h = 0;
    private s = 0;
    private dpr = 0;
    private placed = '';

    constructor(cls: string, z: number) {
      const c = document.createElement('canvas');
      c.className = cls;
      c.setAttribute('aria-hidden', 'true');
      c.width = 0;
      c.height = 0;
      Object.assign(c.style, {
        position: 'absolute', left: '0px', top: '0px', width: '0px', height: '0px',
        pointerEvents: 'none', imageRendering: 'pixelated', zIndex: String(z),
      });
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('PixelCanvas: no 2D context');
      this.canvas = c;
      this.ctx = ctx;
    }

    /** Backing store w × h art px shown at scale.u; true when anything changed (then redraw: a resize clears it). */
    size(w: number, h: number, scale: UiScale): boolean {
      if (w === this.w && h === this.h && scale.s === this.s && scale.dpr === this.dpr) return false;
      if (w !== this.w || h !== this.h) {
        this.canvas.width = w;
        this.canvas.height = h;
        this.w = w;
        this.h = h;
      }
      this.s = scale.s;
      this.dpr = scale.dpr;
      this.canvas.style.width = `${w * scale.u}px`;
      this.canvas.style.height = `${h * scale.u}px`;
      this.ctx.imageSmoothingEnabled = false;
      this.placed = '';
      return true;
    }

    /** Position in CSS px from the edges of the positioned parent, snapped to device px; edges left out stay auto. */
    place(at: { left?: number; top?: number; right?: number; bottom?: number }): void {
      const d = this.dpr || window.devicePixelRatio || 1;
      const css = (v?: number): string => (v === undefined ? '' : `${Math.round(v * d) / d}px`);
      const left = css(at.left);
      const top = css(at.top);
      const right = css(at.right);
      const bottom = css(at.bottom);
      const key = `${left}|${top}|${right}|${bottom}`;
      if (key === this.placed) return;
      this.placed = key;
      const st = this.canvas.style;
      st.left = left;
      st.top = top;
      st.right = right;
      st.bottom = bottom;
    }

    clear(): void {
      this.ctx.clearRect(0, 0, this.w, this.h);
    }
  }
}
