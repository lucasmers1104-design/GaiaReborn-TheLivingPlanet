/* =============================================================================
 * SimEarth 2.0 — chunk pictures magnified in the landscape worker
 * -----------------------------------------------------------------------------
 * Above 16 device px per tile the map draws a chunk in two steps
 * (landview.ts): nearest neighbour to k × 16 px per tile, then smoothly down
 * to T. The worker prepares the first step once per chunk picture and k
 * (OffscreenCanvas, sent as an ImageBitmap); every zoom between 16 (k − 1)
 * and 16 k then only does the second, an exact multiple only copies.
 *
 * Ownership: the worker draws into its own canvases and gives up the bitmap
 * with the message (transferToImageBitmap leaves its canvas blank). From
 * arrival the page owns it; it closes it when it is replaced, evicted, comes
 * late or the planet changes, and never draws a closed one. One budget
 * covers the pictures on the page, those on their way and the worker's
 * canvases, in bytes; past it, or without OffscreenCanvas in the worker, the
 * page draws as before.
 * ========================================================================== */

namespace SE {
  const MIB = 1024 * 1024;
  /** A picture refused for lack of room is asked for again after about a second. */
  const REFUSED_FRAMES = 60;
  /**
   * Shared budget for the zoom pictures (page, on their way, the worker's
   * canvases): six screens of device pixels, 64–192 MiB. The pictures in
   * view grow with the screen's device pixels. Measured best at about 5½
   * screens: 96 MiB at DPR 1.5, 160 MiB at DPR 2; the 64 MiB start value
   * refused and evicted most pictures there (docs/performance-2026-10/bericht.md).
   * `?zoombudget=N` (MiB) fixes one for measuring.
   */
  export function landZoomBudget(deviceW: number, deviceH: number): number {
    const m = typeof location !== 'undefined' ? /[?&]zoombudget=(\d+)(&|$)/.exec(location.search) : null;
    if (m) return Number(m[1]) * MIB;
    return clamp(6 * deviceW * deviceH * 4, 64 * MIB, 192 * MIB);
  }

  interface ZoomPicture {
    readonly n: number;
    readonly k: number;
    readonly sig: number;
    readonly bitmap: ImageBitmap;
    readonly bytes: number;
    /** The frame it was last drawn in, or arrived in: a picture just come counts as needed like one just drawn. */
    drawnAt: number;
    /** Drawn at least once (a picture closed without is counted as unused). */
    used: boolean;
  }

  /** The page's zoom pictures, keyed by chunk and magnification, each for one picture signature. */
  export class LandZoomCache {
    private readonly pictures = new Map<string, ZoomPicture>();
    /** Pictures asked for and not arrived: bytes they will take. */
    private readonly flight = new Map<string, number>();
    /**
     * Asked for past the budget → the frame of it: not asked again for
     * REFUSED_FRAMES or until the zoom changes, so a view bigger than the
     * budget never cycles through evicting and rebuilding.
     */
    private readonly refused = new Map<string, number>();
    private frame = 0;
    bytes = 0;
    flightBytes = 0;
    /** The worker's own canvases (it reports them). */
    workerBytes = 0;

    /** Bytes in all; the map sets it from its size (landZoomBudget). */
    constructor(public budget = 64 * MIB) {}

    static bytesOf(side: number, k: number): number {
      return side * k * side * k * 4;
    }

    /** A new frame: what was drawn in it and the frame before counts as needed now. */
    nextFrame(): void {
      this.frame++;
    }

    /** Chunk n's picture at k if it shows signature `sig`; a hit marks it as needed. */
    get(n: number, k: number, sig: number): ImageBitmap | null {
      const p = this.pictures.get(`${n}|${k}`);
      if (!p || p.sig !== sig) {
        landStats.zoomMisses++;
        return null;
      }
      if (!p.used) landStats.zoomUsed++;
      p.used = true;
      p.drawnAt = this.frame;
      landStats.zoomHits++;
      return p.bitmap;
    }

    /** Chunk n's picture at k for signature `sig` is here. */
    holds(n: number, k: number, sig: number): boolean {
      return this.pictures.get(`${n}|${k}`)?.sig === sig;
    }

    /**
     * Room for chunk n's picture at k: true once reserved (evicting pictures
     * not drawn in this frame or the one before, least recently drawn first);
     * false past the budget, and then for a while not again (refused).
     */
    reserve(n: number, k: number, side: number): boolean {
      const key = `${n}|${k}`;
      if (this.flight.has(key)) return true;
      const at = this.refused.get(key);
      if (at !== undefined && this.frame - at < REFUSED_FRAMES) return false;
      const bytes = LandZoomCache.bytesOf(side, k);
      if (!this.makeRoom(bytes)) {
        this.refused.set(key, this.frame);
        landStats.zoomOverBudget++;
        return false;
      }
      this.flight.set(key, bytes);
      this.flightBytes += bytes;
      this.report();
      return true;
    }

    /** The reservation for chunk n at k is not needed any more (the job was dropped, or came back without a picture). */
    release(n: number, k: number): void {
      const key = `${n}|${k}`;
      const bytes = this.flight.get(key);
      if (bytes === undefined) return;
      this.flight.delete(key);
      this.flightBytes -= bytes;
      this.report();
    }

    /**
     * A picture arrived (`reserved`: for the reservation made when it was
     * asked for). Kept if `current` (it shows the chunk's picture now) and it
     * fits; otherwise closed at once. Older pictures of the chunk with another
     * signature are closed too: they will not be drawn again.
     */
    put(n: number, k: number, sig: number, bitmap: ImageBitmap, current: boolean, reserved = true): boolean {
      if (reserved) this.release(n, k);
      if (!current) {
        bitmap.close();
        landStats.zoomLate++;
        return false;
      }
      for (const p of [...this.pictures.values()]) if (p.n === n && (p.sig !== sig || p.k === k)) this.drop(p, false);
      const bytes = LandZoomCache.bytesOf(bitmap.width / k, k);
      if (!this.makeRoom(bytes)) {
        bitmap.close();
        landStats.zoomOverBudget++;
        return false;
      }
      this.pictures.set(`${n}|${k}`, { n, k, sig, bitmap, bytes, drawnAt: this.frame, used: false });
      this.bytes += bytes;
      landStats.zoomBuilt++;
      this.report();
      return true;
    }

    /** Chunk n shows another picture now: its magnifications are closed. */
    forgetChunk(n: number): void {
      for (const p of [...this.pictures.values()]) if (p.n === n) this.drop(p, false);
    }

    /** The zoom moved to another magnification: pictures past the budget may be asked for again. */
    forgetRefusals(): void {
      this.refused.clear();
    }

    /** Another planet, a failed worker or another look: every picture closed, nothing on its way counted. */
    clear(): void {
      for (const p of [...this.pictures.values()]) this.drop(p, false);
      this.flight.clear();
      this.flightBytes = 0;
      this.refused.clear();
      this.report();
    }

    /** Pictures kept now. */
    get size(): number {
      return this.pictures.size;
    }

    private makeRoom(bytes: number): boolean {
      if (bytes > this.budget) return false;
      while (this.bytes + this.flightBytes + this.workerBytes + bytes > this.budget) {
        let victim: ZoomPicture | null = null;
        for (const p of this.pictures.values()) {
          if (p.drawnAt >= this.frame - 1) continue;
          if (!victim || p.drawnAt < victim.drawnAt) victim = p;
        }
        if (!victim) return false;
        this.drop(victim, true);
      }
      return true;
    }

    private drop(p: ZoomPicture, evicted: boolean): void {
      this.pictures.delete(`${p.n}|${p.k}`);
      this.bytes -= p.bytes;
      p.bitmap.close();
      if (evicted) landStats.zoomEvicted++;
      if (!p.used) landStats.zoomUnused++;
      this.report();
    }

    private report(): void {
      landStats.pageZoomBytes = this.bytes;
      landStats.flightBytes = this.flightBytes;
      landStats.workerBytes = this.workerBytes;
      landStats.peakZoomBytes = Math.max(landStats.peakZoomBytes, this.bytes + this.flightBytes + this.workerBytes);
    }
  }

  /**
   * The worker's side: a composed chunk (1×, `side` px square, as words)
   * magnified k times by nearest neighbour into a bitmap. Null where the
   * worker has no OffscreenCanvas with a 2D context.
   */
  export class ZoomMagnifier {
    private src: OffscreenCanvas | null = null;
    private srcCtx: OffscreenCanvasRenderingContext2D | null = null;
    private readonly dst = new Map<number, { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D }>();

    static capable(): boolean {
      try {
        if (typeof OffscreenCanvas === 'undefined') return false;
        const c = new OffscreenCanvas(1, 1);
        return !!c.getContext('2d') && typeof c.transferToImageBitmap === 'function';
      } catch {
        return false;
      }
    }

    /** Bytes of the canvases held here (blank between pictures, still allocated). */
    get bytes(): number {
      let b = this.src ? this.src.width * this.src.height * 4 : 0;
      for (const d of this.dst.values()) b += d.canvas.width * d.canvas.height * 4;
      return b;
    }

    /** Take the composed pixels (copied: the words may go to the page right after). False without a 2D context. */
    load(words: Uint32Array, side: number): boolean {
      if (!this.src || this.src.width !== side) {
        this.src = new OffscreenCanvas(side, side);
        this.srcCtx = this.src.getContext('2d');
      }
      const sctx = this.srcCtx;
      if (!sctx) return false;
      sctx.putImageData(new ImageData(new Uint8ClampedArray(words.buffer as ArrayBuffer, words.byteOffset, side * side * 4), side, side), 0, 0);
      return true;
    }

    /** The loaded chunk magnified k times; the page owns the bitmap. */
    magnify(k: number): ImageBitmap | null {
      if (!this.src) return null;
      const side = this.src.width;
      let d = this.dst.get(k);
      if (!d || d.canvas.width !== side * k) {
        const canvas = new OffscreenCanvas(side * k, side * k);
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        d = { canvas, ctx };
        this.dst.set(k, d);
      }
      // Only the latest magnification stays allocated: a zoom settles on one k at a time.
      for (const [kk] of this.dst) if (kk !== k) this.dst.delete(kk);
      d.ctx.imageSmoothingEnabled = false;
      d.ctx.clearRect(0, 0, side * k, side * k);
      d.ctx.drawImage(this.src, 0, 0, side * k, side * k);
      return d.canvas.transferToImageBitmap();
    }
  }
}
