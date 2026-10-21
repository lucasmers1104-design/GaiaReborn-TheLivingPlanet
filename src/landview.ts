/* =============================================================================
 * SimEarth 2.0 — the pixel terrain on screen
 * -----------------------------------------------------------------------------
 * Chunks of 16 × 16 tiles are composed at 1× (landcompose.ts) and cached as
 * canvases; a chunk is recomposed only when the signature of the tiles that
 * reach into it changes. Drawing scales them to the zoom in two steps
 * (spec §4.6): nearest neighbour up to the next whole multiple k of 16 px per
 * tile, then smoothly down to the device tile size T. Exact multiples stay
 * sharp; below 16 px per tile the 1× picture is smoothed down directly. The
 * intermediate is anchored to the world, so every art pixel covers the same
 * width wherever it is and however the map is panned.
 *
 * `?terrain=legacy` in the URL switches back to the sprite-and-icon map, for
 * before/after pictures until the old path is removed.
 * ========================================================================== */

namespace SE {
  export type TerrainStyle = 'pixel' | 'legacy';
  export const TERRAIN_STYLE: TerrainStyle =
    typeof location !== 'undefined' && /[?&]terrain=legacy(&|$)/.test(location.search) ? 'legacy' : 'pixel';

  /** Tiles per chunk side. */
  export const LAND_CHUNK = 16;
  const CHUNKS_X = GRID_W / LAND_CHUNK;
  /** Composed pixels around a chunk, so smoothing at its border reads real neighbours. */
  const MARGIN = 2;
  /** Art pixels each blit reaches past its tiles, so neighbouring blits overlap instead of leaving a seam. */
  const OVERLAP = 1;
  const SMOOTHING: ImageSmoothingQuality = 'high';
  /**
   * Composing stops after this long in one draw; the rest follows on the next
   * frames, so a first zoom-out (90+ chunks) never freezes the game.
   */
  const COMPOSE_BUDGET_MS = 8;
  /** A chunk recomposed this long after a brush last changed tiles near it dissolves into its new picture (landfade.ts). */
  const FADE_WINDOW_MS = 1500;
  /** Tiles around the brushed box whose pictures a brush changes: ridge lines and cones (refreshBox) plus SIGNATURE_REACH. */
  const FADE_REACH = 11;

  interface Chunk {
    readonly canvas: HTMLCanvasElement; readonly ctx: CanvasRenderingContext2D; sig: number;
    /** Below 16 px per tile: the chunk already smoothed down to the device tile size it was last drawn at. */
    small: HTMLCanvasElement | null; smallT: number; smallSig: number;
    /** What moves on the picture, from the same composition. */
    motion: LandMotion;
    /** While it dissolves into a new picture after a brush or a sea ice flip. */
    fade: LandFade | null;
    /** The dissolve is sea ice's (landice.ts), timed and capped as such. */
    ice: boolean;
  }

  /** Where the map is looking: tiles at the top left, CSS pixels per tile, device pixel ratio. */
  export interface LandCamera { readonly scrollX: number; readonly scrollY: number; readonly tilePx: number; readonly dpr: number }

  export class PixelTerrain {
    private static instance: PixelTerrain | null = null;
    static shared(): PixelTerrain {
      return PixelTerrain.instance ?? (PixelTerrain.instance = new PixelTerrain());
    }

    art: LandArt | null = null;
    composer: LandComposer | null = null;
    readonly field = new TerrainField();
    /** Sea ice freezing and thawing: which chunks dissolve, and how. */
    readonly ice = new IceShift();
    /** CSS px per tile of the last draw. */
    private tilePx = 16;
    private state: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
    private readonly listeners: (() => void)[] = [];
    private fieldKey = '';
    private fieldWorld: WorldState | null = null;
    private readonly chunks = new Map<number, Chunk>();
    private seaColor: Uint32Array | null = null;
    private image: ImageData | null = null;
    private scratch: HTMLCanvasElement | null = null;
    private scratchCtx: CanvasRenderingContext2D | null = null;
    /** Chunks composed by the last draw, for measuring. */
    composed = 0;
    /** The last draw ran out of time: some chunks are stale or missing, draw again. */
    pending = false;
    private deadline = Infinity;
    /** One flat colour per tile of the whole planet (overview()), rebuilt after the field changed. */
    private flat: HTMLCanvasElement | null = null;
    private flatFresh = false;
    /** Tiles the brush changed lately (x may run past the wrap), and when it last did. */
    private brushBox: [number, number, number, number] | null = null;
    private brushAt = -Infinity;
    /** Chunk number → chunk, while it dissolves. */
    private readonly fading = new Map<number, Chunk>();
    /** Chunk number → when it was first seen out of date (-Infinity: never composed), until composed. */
    private readonly waiting = new Map<number, number>();

    get ready(): boolean {
      return this.state === 'ready';
    }

    /** The atlas could not be decoded: the map keeps the old look. */
    get failed(): boolean {
      return this.state === 'failed';
    }

    /** Decode the atlas once; `fn` runs when it is ready or has failed (at once if it already is ready). */
    whenReady(fn: () => void): void {
      if (this.state === 'ready') { fn(); return; }
      this.listeners.push(fn);
      if (this.state !== 'idle') return;
      this.state = 'loading';
      decodeLandAtlas((art) => {
        this.art = art;
        this.composer = new LandComposer(art);
        this.state = 'ready';
        for (const l of this.listeners.splice(0)) l();
      }, (why) => {
        this.state = 'failed';
        console.warn(`SimEarth: pixel terrain unavailable (${why}), keeping the old map`);
        for (const l of this.listeners.splice(0)) l();
      });
    }

    /** Read the world into the field when it changed; `oceans` false draws water as flat elevation colours. */
    refresh(world: WorldState, oceans: boolean): void {
      const key = PixelTerrain.keyOf(world, oceans);
      if (key === this.fieldKey && world === this.fieldWorld) return;
      this.fieldKey = key;
      this.fieldWorld = world;
      const t0 = performance.now();
      this.field.refresh(world);
      this.ice.update(world, this.field, t0);
      perfHud.field(performance.now() - t0, this.field.lastRead);
      this.flatFresh = false;
      if (oceans) {
        this.seaColor = null;
      } else {
        const sea = this.seaColor ?? new Uint32Array(TILE_COUNT);
        const bytes = new Uint8Array(4);
        const word = new Uint32Array(bytes.buffer);
        for (let i = 0; i < TILE_COUNT; i++) {
          const c = sampleRamp(DEPTH_RAMP, world.elevation[i]);
          bytes[0] = c[0]; bytes[1] = c[1]; bytes[2] = c[2]; bytes[3] = 255;
          sea[i] = word[0];
        }
        this.seaColor = sea;
      }
    }

    /** The field describes `world` as it is now: drawing will not re-read it. */
    current(world: WorldState, oceans: boolean): boolean {
      return world === this.fieldWorld && PixelTerrain.keyOf(world, oceans) === this.fieldKey;
    }

    private static keyOf(world: WorldState, oceans: boolean): string {
      return `${world.seed}|${world.ticks}|${world.revision}|${+oceans}`;
    }

    /**
     * A brush changed the height of tiles [x0, x1] × [y0, y1]: re-read only
     * those (TerrainField.refreshBox) and count the field as current, so
     * ticks during the stroke don't force full re-reads; the edit's
     * refreshDerived at the stroke's end brings in everything else. True
     * when that took long (a full read, or the ridges rebuilt).
     */
    refreshBox(world: WorldState, oceans: boolean, x0: number, y0: number, x1: number, y1: number): boolean {
      if (world !== this.fieldWorld || !oceans) {
        this.fieldKey = '';
        this.refresh(world, oceans);
        return true;
      }
      const slow = this.field.refreshBox(world, x0, y0, x1 + 1, y1 + 1);
      this.flatFresh = false;
      const now = performance.now();
      const b = this.brushBox;
      if (b && now - this.brushAt < FADE_WINDOW_MS) {
        const s = Math.round((b[0] - x0) / GRID_W) * GRID_W;
        this.brushBox = [Math.min(b[0], x0 + s), Math.min(b[1], y0), Math.max(b[2], x1 + s), Math.max(b[3], y1)];
      } else {
        this.brushBox = [x0, y0, x1, y1];
      }
      this.brushAt = now;
      this.fieldKey = PixelTerrain.keyOf(world, oceans);
      return slow;
    }

    /** Read the world into the field if it describes another planet (the map keeps it current). */
    ensure(world: WorldState): void {
      if (this.fieldWorld !== world || !this.fieldKey.startsWith(`${world.seed}|`)) this.refresh(world, true);
    }

    /** The whole planet at `tilePx` CSS px per tile, every chunk composed (the map snapshot); null before the atlas is ready. */
    picture(world: WorldState, tilePx: number): HTMLCanvasElement | null {
      if (!this.ready) return null;
      this.ensure(world);
      const out = document.createElement('canvas');
      out.width = GRID_W * tilePx;
      out.height = GRID_H * tilePx;
      const ctx = out.getContext('2d');
      if (!ctx) return null;
      const cam: LandCamera = { scrollX: 0, scrollY: 0, tilePx, dpr: 1 };
      // Each draw composes for COMPOSE_BUDGET_MS; repeat until no chunk is missing.
      for (let pass = 0; pass < CHUNKS_X * (GRID_H / LAND_CHUNK) + 1; pass++) {
        this.draw(ctx, cam, 0, 0, out.width, out.height);
        if (!this.pending) return out;
      }
      return out;
    }

    /** The chunk canvas for chunk (cx, cy), composed if its tiles changed. */
    private chunk(cx: number, cy: number): Chunk | null {
      const composer = this.composer;
      if (!composer) return null;
      const n = cy * CHUNKS_X + cx;
      let c = this.chunks.get(n);
      const side = LAND_CHUNK * 16 + 2 * MARGIN;
      if (!c) {
        const canvas = document.createElement('canvas');
        canvas.width = side;
        canvas.height = side;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        c = { canvas, ctx, sig: -1, small: null, smallT: 0, smallSig: -1, motion: NO_LAND_MOTION, fade: null, ice: false };
        this.chunks.set(n, c);
      }
      const sig = this.field.signature(cx * LAND_CHUNK, cy * LAND_CHUNK, LAND_CHUNK, LAND_CHUNK, this.seaColor ? 1 : 0);
      if (sig !== c.sig) {
        if (performance.now() > this.deadline) {
          this.pending = true;
          return c.sig === -1 ? null : c;
        }
        if (!this.image) this.image = c.ctx.createImageData(side, side);
        const words = new Uint32Array(this.image.data.buffer);
        composer.compose(this.field, cx * LAND_CHUNK, cy * LAND_CHUNK, LAND_CHUNK, LAND_CHUNK, MARGIN, words, this.seaColor);
        const now = performance.now();
        const brush = c.sig !== -1 && this.brushNear(cx, cy, now);
        // Sea ice dissolves when zoomed in far enough and below the cap; a calving tile always does.
        const ice = c.sig !== -1 && !brush && this.ice.near(cx, cy, now) && (this.ice.holding(cx, cy) ||
          (this.tilePx >= ICE_ANIM.minTilePx && (c.ice || this.iceFades() < ICE_ANIM.maxFades)));
        // A chunk already dissolving keeps going rather than jump to its newest picture.
        if (brush || ice || (c.fade !== null && !c.fade.settled)) {
          const ox = cx * LAND_CHUNK * 16 - MARGIN;
          const oy = cy * LAND_CHUNK * 16 - MARGIN;
          c.fade ??= new LandFade(c.ctx.getImageData(0, 0, side, side), side, ox, oy);
          if (brush || ice) c.ice = ice;
          const timing = c.ice && this.art ? this.ice.timing(this.art, new Uint32Array(c.fade.image.data.buffer), words, side, ox, oy) : null;
          c.fade.retarget(words, now, timing);
          c.fade.step(now);
          c.ctx.putImageData(c.fade.image, 0, 0);
          if (!c.fade.settled) this.fading.set(n, c);
        } else {
          c.fade = null;
          c.ice = false;
          this.fading.delete(n);
          c.ctx.putImageData(this.image, 0, 0);
        }
        c.motion = composer.motion;
        c.sig = sig;
        this.waiting.delete(n);
        this.composed++;
      } else if (c.fade) {
        const now = performance.now();
        if (c.fade.step(now)) {
          c.ctx.putImageData(c.fade.image, 0, 0);
          c.smallSig = -1;
        }
        if (c.fade.settled) {
          this.fading.delete(n);
          if (now - this.brushAt > FADE_WINDOW_MS) c.fade = null;
        }
      }
      return c;
    }

    /** Chunks dissolving sea ice now. */
    private iceFades(): number {
      let n = 0;
      for (const c of this.fading.values()) if (c.ice) n++;
      return n;
    }

    /** Chunk (cx, cy) lies near tiles a brush changed within FADE_WINDOW_MS. */
    private brushNear(cx: number, cy: number, now: number): boolean {
      const b = this.brushBox;
      if (!b || now - this.brushAt > FADE_WINDOW_MS) return false;
      const y0 = cy * LAND_CHUNK;
      if (y0 > b[3] + FADE_REACH || y0 + LAND_CHUNK <= b[1] - FADE_REACH) return false;
      for (let s = -GRID_W; s <= GRID_W; s += GRID_W) {
        const x0 = cx * LAND_CHUNK + s;
        if (x0 <= b[2] + FADE_REACH && x0 + LAND_CHUNK > b[0] - FADE_REACH) return true;
      }
      return false;
    }

    /**
     * Tiles still dissolving into their new picture, x0, y0, x1, y1 (x may run
     * past the wrap), or null: the map redraws them every frame until done.
     */
    fadeBox(): [number, number, number, number] | null {
      let box: [number, number, number, number] | null = null;
      const now = performance.now();
      for (const [n, c] of this.fading) {
        const f = c.fade;
        if (!f || f.settled) { this.fading.delete(n); continue; }
        // Nothing changes on it before its next moment: no redraw this frame.
        if (f.next > now) continue;
        const cx = (n % CHUNKS_X) * LAND_CHUNK;
        const cy = Math.floor(n / CHUNKS_X) * LAND_CHUNK;
        const tile = (p: number): number => Math.floor((p - MARGIN) / 16);
        let x0 = cx + tile(f.x0);
        let x1 = cx + tile(f.x1 - 1);
        const y0 = Math.max(0, cy + tile(f.y0));
        const y1 = Math.min(GRID_H - 1, cy + tile(f.y1 - 1));
        if (!box) { box = [x0, y0, x1, y1]; continue; }
        const s = Math.round((box[0] - x0) / GRID_W) * GRID_W;
        x0 += s;
        x1 += s;
        box = [Math.min(box[0], x0), Math.min(box[1], y0), Math.max(box[2], x1), Math.max(box[3], y1)];
      }
      return box;
    }

    /** Surf and river water of chunk (cx, cy) as it is drawn now; null before it was composed. */
    motion(cx: number, cy: number): LandMotion | null {
      const c = this.chunks.get(cy * CHUNKS_X + cx);
      return c && c.sig !== -1 ? c.motion : null;
    }

    /**
     * Draw the terrain into `ctx` (device pixels, identity transform), only
     * where it meets the device-pixel rectangle [x0, x1) × [y0, y1).
     */
    draw(ctx: CanvasRenderingContext2D, cam: LandCamera, x0: number, y0: number, x1: number, y1: number): void {
      if (!this.ready) return;
      this.tilePx = cam.tilePx;
      this.composed = 0;
      this.pending = false;
      this.deadline = performance.now() + COMPOSE_BUDGET_MS;
      const T = cam.tilePx * cam.dpr;
      const k = T > 16 ? Math.ceil(T / 16 - 1e-6) : 1;
      const mode = Math.abs(T - 16 * k) < 1e-6 ? 'sharp' : T > 16 ? 'twostep' : 'smooth';
      const txA = Math.floor(cam.scrollX + x0 / T);
      const txB = Math.ceil(cam.scrollX + x1 / T);
      const tyA = Math.max(0, Math.floor(cam.scrollY + y0 / T));
      const tyB = Math.min(GRID_H, Math.ceil(cam.scrollY + y1 / T));
      if (txB <= txA || tyB <= tyA) return;
      this.composeDue(txA, txB, tyA, tyB);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, x1 - x0, y1 - y0);
      ctx.clip();
      for (let cy = Math.floor(tyA / LAND_CHUNK); cy <= Math.floor((tyB - 1) / LAND_CHUNK); cy++) {
        for (let cu = Math.floor(txA / LAND_CHUNK); cu <= Math.floor((txB - 1) / LAND_CHUNK); cu++) {
          const c = this.chunk(((cu % CHUNKS_X) + CHUNKS_X) % CHUNKS_X, cy);
          if (!c) {
            this.drawFlat(ctx, cu, cy, cam);
            continue;
          }
          // Visible tiles of this chunk, in art pixels from its corner.
          const ax = (Math.max(txA, cu * LAND_CHUNK) - cu * LAND_CHUNK) * 16;
          const bx = (Math.min(txB, (cu + 1) * LAND_CHUNK) - cu * LAND_CHUNK) * 16;
          const ay = (Math.max(tyA, cy * LAND_CHUNK) - cy * LAND_CHUNK) * 16;
          const by = (Math.min(tyB, (cy + 1) * LAND_CHUNK) - cy * LAND_CHUNK) * 16;
          // Reach past the tiles, except beyond the poles.
          const top = cy * LAND_CHUNK * 16 + ay === 0 ? 0 : OVERLAP;
          const bottom = cy * LAND_CHUNK * 16 + by === GRID_H * 16 ? 0 : OVERLAP;
          const sx = ax - OVERLAP;
          const sy = ay - top;
          const sw = bx - ax + 2 * OVERLAP;
          const sh = by - ay + top + bottom;
          const s = T / 16;
          const ox = (cu * LAND_CHUNK - cam.scrollX) * T;
          const oy = (cy * LAND_CHUNK - cam.scrollY) * T;
          const small = mode === 'smooth' ? this.small(c, T) : null;
          if (small) {
            // Whole device pixels of the cached picture, copied one to one.
            const side = small.width;
            const ux = Math.max(0, Math.round(ax * s) - 1);
            const vx = Math.min(side, Math.round(bx * s) + 1);
            const uy = Math.max(0, Math.round(ay * s) - 1);
            const vy = Math.min(side, Math.round(by * s) + 1);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(small, ux, uy, vx - ux, vy - uy, Math.round(ox) + ux, Math.round(oy) + uy, vx - ux, vy - uy);
            continue;
          }
          this.blit(ctx, c.canvas, mode, k, sx, sy, sw, sh, ox + sx * s, oy + sy * s, sw * s, sh * s);
        }
      }
      ctx.restore();
      perfHud.chunks(this.composed, this.pending);
    }

    /**
     * Compose the changed chunks over tiles [txA, txB) × [tyA, tyB) within
     * the budget: missing ones first, then the longest waiting. In screen
     * order, a running planet changes the first chunks on every tick and the
     * last ones would never get their turn.
     */
    private composeDue(txA: number, txB: number, tyA: number, tyB: number): void {
      const due: number[] = [];
      for (let cy = Math.floor(tyA / LAND_CHUNK); cy <= Math.floor((tyB - 1) / LAND_CHUNK); cy++) {
        for (let cu = Math.floor(txA / LAND_CHUNK); cu <= Math.floor((txB - 1) / LAND_CHUNK); cu++) {
          const n = cy * CHUNKS_X + (((cu % CHUNKS_X) + CHUNKS_X) % CHUNKS_X);
          const c = this.chunks.get(n);
          if (due.includes(n) || (c && c.sig === this.field.signature((n % CHUNKS_X) * LAND_CHUNK, cy * LAND_CHUNK, LAND_CHUNK, LAND_CHUNK, this.seaColor ? 1 : 0))) continue;
          due.push(n);
          if (!this.waiting.has(n)) this.waiting.set(n, c && c.sig !== -1 ? performance.now() : -Infinity);
        }
      }
      due.sort((a, b) => (this.waiting.get(a) ?? 0) - (this.waiting.get(b) ?? 0));
      for (const n of due) {
        this.chunk(n % CHUNKS_X, Math.floor(n / CHUNKS_X));
        if (this.pending) return;
      }
    }

    /** A chunk not composed yet: one flat colour per tile, from its ground or sea class. */
    private drawFlat(ctx: CanvasRenderingContext2D, cu: number, cy: number, cam: LandCamera): void {
      const flat = this.overview();
      if (!flat) return;
      const T = cam.tilePx * cam.dpr;
      const sx = (((cu % CHUNKS_X) + CHUNKS_X) % CHUNKS_X) * LAND_CHUNK;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(flat, sx, cy * LAND_CHUNK, LAND_CHUNK, LAND_CHUNK,
        (cu * LAND_CHUNK - cam.scrollX) * T, (cy * LAND_CHUNK - cam.scrollY) * T, LAND_CHUNK * T, LAND_CHUNK * T);
    }

    /**
     * The whole planet at one pixel per tile, one flat colour each from its
     * ground or sea class (lagoons turquoise): what shows where no chunk has
     * been composed yet.
     */
    overview(): HTMLCanvasElement | null {
      const art = this.art;
      if (!art) return null;
      if (this.flat && this.flatFresh) return this.flat;
      const flat = this.flat ?? (this.flat = document.createElement('canvas'));
      flat.width = GRID_W;
      flat.height = GRID_H;
      const fctx = flat.getContext('2d');
      if (!fctx) return null;
      const image = fctx.createImageData(GRID_W, GRID_H);
      const words = new Uint32Array(image.data.buffer);
      const f = this.field;
      for (let i = 0; i < TILE_COUNT; i++) {
        const key = f.key[i];
        words[i] = art.rgba[key !== 0 ? art.ground[landKeyRank(key)][landKeyDensity(key)].px[0]
          : f.lagoon[i] >= 2 ? art.waterWarm[SEA_LAGOON_STEP]
            : art.water[f.sea[i] === 1 ? SEA_COAST_STEP : SEA_OCEAN_STEP]];
      }
      fctx.putImageData(image, 0, 0);
      this.flatFresh = true;
      return flat;
    }

    /** One chunk region, art pixels (sx, sy, sw, sh) from the chunk corner, to device pixels. */
    private blit(
      ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, mode: string, k: number,
      sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number,
    ): void {
      if (mode !== 'twostep') {
        ctx.imageSmoothingEnabled = mode === 'smooth';
        if (mode === 'smooth') ctx.imageSmoothingQuality = SMOOTHING;
        ctx.drawImage(src, MARGIN + sx, MARGIN + sy, sw, sh, dx, dy, dw, dh);
        return;
      }
      // Step 1: whole pixels, k device pixels per art pixel, with the margin
      // around so step 2 filters across the edge with real neighbours.
      const pad = MARGIN - OVERLAP;
      const w = (sw + 2 * pad) * k;
      const h = (sh + 2 * pad) * k;
      const sc = this.scratchFor(w, h);
      if (!sc) return;
      sc.imageSmoothingEnabled = false;
      sc.drawImage(src, MARGIN + sx - pad, MARGIN + sy - pad, sw + 2 * pad, sh + 2 * pad, 0, 0, w, h);
      // Step 2: smoothly down to the device tile size.
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = SMOOTHING;
      ctx.drawImage(sc.canvas, pad * k, pad * k, sw * k, sh * k, dx, dy, dw, dh);
    }

    /**
     * The chunk smoothed down once to T device pixels per tile, so redraws
     * and pans below 16 px per tile only copy pixels. Null when a chunk
     * would not span whole device pixels (an odd devicePixelRatio).
     */
    private small(c: Chunk, T: number): HTMLCanvasElement | null {
      const side = 16 * LAND_CHUNK * T / 16;
      if (Math.abs(side - Math.round(side)) > 1e-6) return null;
      if (c.small && c.smallT === T && c.smallSig === c.sig) return c.small;
      const canvas = c.small ?? document.createElement('canvas');
      canvas.width = canvas.height = Math.round(side);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const s = T / 16;
      const n = LAND_CHUNK * 16 + 2 * OVERLAP;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = SMOOTHING;
      ctx.drawImage(c.canvas, MARGIN - OVERLAP, MARGIN - OVERLAP, n, n, -OVERLAP * s, -OVERLAP * s, n * s, n * s);
      c.small = canvas;
      c.smallT = T;
      c.smallSig = c.sig;
      return canvas;
    }

    private scratchFor(w: number, h: number): CanvasRenderingContext2D | null {
      const old = this.scratch;
      if (!old || old.width < w || old.height < h) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(w, old ? old.width : 0);
        canvas.height = Math.max(h, old ? old.height : 0);
        this.scratch = canvas;
        this.scratchCtx = canvas.getContext('2d');
      }
      return this.scratchCtx;
    }
  }
}
