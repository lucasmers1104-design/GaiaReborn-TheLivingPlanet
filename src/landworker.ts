/* =============================================================================
 * SimEarth 2.0 — landscape chunks composed in a worker
 * -----------------------------------------------------------------------------
 * Composing a 16 × 16-tile chunk (landcompose.ts) is pure arithmetic over the
 * terrain field and took about a third of the page's time on a living planet
 * at the fastest speed (tools/perf-bench.js). A second Blob worker runs the
 * same composer: the page sends its field when chunks are wanted after it
 * changed, asks for the chunks it shows, and installs each picture only if
 * it was composed from the field the page has now (the answer carries the
 * signature of the field it was composed from). The page keeps the field,
 * the dissolves and every draw; without the worker it composes as before.
 *
 * Jobs wait in the worker in order of priority — visible chunks out of date,
 * then the chunk ahead of the moving camera (landahead.ts), then zoom
 * pictures of current chunks (landzoom.ts) — and run one per task, so a
 * field, a drop or a new priority sent meanwhile is taken first. A job not
 * started yet can be dropped or made more urgent; a running one finishes.
 * ========================================================================== */

namespace SE {
  /** What the composer and the signature read of TerrainField; the rest is the page's own bookkeeping. */
  const FIELD_PARTS = [
    'key', 'sea', 'lagoon', 'seaTile', 'reef', 'corals', 'sands', 'cay', 'beach', 'shade', 'rugged', 'volcano', 'ridges',
    'river', 'paths', 'algae', 'edge', 'scene', 'density', 'groups', 'top', 'cactus', 'savannaTree', 'palm', 'rail', 'sig',
  ] as const;
  /** Visible chunks asked for at once: enough to keep the worker busy, few enough that a newer field is used soon. */
  export const LAND_JOBS_MAX = 6;
  /** Of lesser priority, at once: one chunk ahead of the camera, two zoom pictures. They never take a visible chunk's place. */
  const AHEAD_JOBS_MAX = 1;
  const ZOOM_JOBS_MAX = 2;

  /**
   * Most urgent first: a visible chunk out of date, a creature picture for a
   * new zoom (tilecache.ts), the chunk ahead of the moving camera, a zoom
   * picture of a current chunk.
   */
  export enum LandPriority { Visible = 0, Sprite = 1, Ahead = 2, Zoom = 3 }

  /** A creature picture to raster (artdraw.ts rasterArt, crisp): class, stage, specialist, mirrored, device px per tile. */
  interface SpriteJob {
    readonly t: 'sprite';
    readonly id: number;
    readonly c: number;
    readonly stage: number;
    readonly specialist: number;
    readonly flip: boolean;
    readonly px: number;
    readonly prio: LandPriority;
  }

  interface LandJob {
    readonly t: 'job';
    readonly id: number;
    readonly n: number;
    readonly tx: number;
    readonly ty: number;
    readonly side: number;
    readonly margin: number;
    /** Compose from the page's field (sent with 'field') rather than the one refreshed here (fed). */
    readonly page: boolean;
    prio: LandPriority;
    /** Magnification for a zoom picture, 0 for none. */
    readonly k: number;
    /** The signature the page shows for this chunk now: an answer at it carries no pixels. */
    readonly have: number;
    /** The page's planet generation, echoed. */
    readonly gen: number;
  }

  type ToLandWorker =
    | { readonly t: 'art'; readonly indices: Uint8Array }
    /** The simulation worker's states arrive on `port` (SimHost.feed): from then on this worker keeps the field. */
    | { readonly t: 'feed'; readonly port: MessagePort }
    | { readonly t: 'field'; readonly parts: Record<string, unknown>; readonly seaColor: Uint32Array | null }
    | LandJob
    | SpriteJob
    /** Jobs not started yet that are not wanted any more, or all of them (another planet). */
    | { readonly t: 'drop'; readonly ids: readonly number[]; readonly all: boolean }
    /** A queued job became more urgent (the chunk ahead came into view). */
    | { readonly t: 'prio'; readonly id: number; readonly prio: LandPriority };

  /** A composed chunk: words null when the page showed this signature already (a zoom job). */
  export interface LandChunkAnswer {
    readonly t: 'chunk';
    readonly id: number;
    readonly n: number;
    readonly gen: number;
    readonly prio: LandPriority;
    readonly sig: number;
    readonly words: Uint32Array | null;
    readonly motion: LandMotion;
    /** The magnification asked for; `later`: its picture follows in a 'zoom' message (else none comes). */
    readonly k: number;
    readonly later: boolean;
    /** Worker milliseconds composing; bytes of the worker's zoom canvases. */
    readonly ms: number;
    readonly held: number;
  }

  /** A job's zoom picture, sent after its pixels; the page owns the bitmap from now on (null if it could not be made). */
  export interface LandZoomAnswer {
    readonly t: 'zoom';
    readonly id: number;
    readonly n: number;
    readonly gen: number;
    readonly sig: number;
    readonly k: number;
    readonly bitmap: ImageBitmap | null;
    readonly ms: number;
    readonly held: number;
  }

  type FromLandWorker =
    | LandChunkAnswer
    | LandZoomAnswer
    /** The field refreshed here from world `key` (seed|ticks|revision), `ms` and `tiles` as TerrainField measured it. */
    | { readonly t: 'field'; readonly parts: Record<string, unknown>; readonly key: string; readonly ms: number; readonly tiles: number }
    /** What the worker can do: zoom pictures need OffscreenCanvas, creature pictures also Path2D. */
    | { readonly t: 'caps'; readonly zoom: boolean; readonly sprites: boolean }
    /** A creature picture, the page's from now on; null if it could not be made. */
    | { readonly t: 'sprite'; readonly id: number; readonly bitmap: ImageBitmap | null; readonly ms: number }
    | { readonly t: 'fatal'; readonly message: string };

  interface Asked { readonly sig: number; readonly id: number; prio: LandPriority; readonly k: number }

  /** Bytes of the typed arrays in a message's payload, for measuring. */
  function payloadBytes(parts: Record<string, unknown>): number {
    let b = 0;
    for (const v of Object.values(parts)) if (ArrayBuffer.isView(v)) b += v.byteLength;
    return b;
  }

  export class LandJobs {
    /** Chunk number → the job asked for it: field signature, id, priority, magnification. */
    private readonly asked = new Map<number, Asked>();
    private jobId = 0;
    private fieldSent = false;
    private dead = false;
    /** This worker refreshes its own field from the simulation's states (feedPort); the page's goes over only for page jobs. */
    fed = false;
    /** The worker makes zoom pictures (OffscreenCanvas); known after its first answer. */
    zoomCapable = false;
    /** The worker rasters creature pictures (OffscreenCanvas and Path2D). */
    spriteCapable = false;
    /** Creature pictures asked for → who gets them. */
    private readonly sprites = new Map<number, (bitmap: ImageBitmap | null) => void>();
    /** The planet generation: answers for an earlier one are dropped. */
    gen = 0;
    /** A composed chunk arrived; `own` when it answers the job asked for that chunk now (not one replaced since). */
    onChunk: ((m: LandChunkAnswer, own: boolean, prio: LandPriority) => void) | null = null;
    /** A zoom picture arrived after its chunk; `reserved`: it settles the reservation made for it. */
    onZoom: ((m: LandZoomAnswer, reserved: boolean) => void) | null = null;
    /** A field refreshed here arrived (fed mode). */
    onField: ((parts: Record<string, unknown>, key: string, ms: number, tiles: number) => void) | null = null;
    /** A job will not be answered (dropped, replaced at another magnification, the worker gone): its zoom reservation can go. */
    onDrop: ((n: number, k: number) => void) | null = null;
    /** The worker failed: the page composes again. */
    onFail: (() => void) | null = null;

    private constructor(private readonly worker: Worker, private url: string) {
      worker.onmessage = (e: MessageEvent) => this.receive(e.data as FromLandWorker);
      worker.onerror = (e) => {
        e.preventDefault();
        this.fail(e.message);
      };
    }

    /** The worker, with the atlas it composes from; null where none can start. */
    static start(indices: Uint8Array): LandJobs | null {
      const started = bundleWorker('SE.landWorkerMain(self);', 'simearth-land');
      if (!started) return null;
      started.worker.postMessage({ t: 'art', indices } satisfies ToLandWorker);
      return new LandJobs(started.worker, started.url);
    }

    get alive(): boolean {
      return !this.dead;
    }

    /** Visible chunks asked for and not answered yet. */
    get busy(): number {
      return this.count(LandPriority.Visible);
    }

    /** The chunk of the job ahead of the camera on its way, or -1. */
    get aheadChunk(): number {
      for (const [n, a] of this.asked) if (a.prio === LandPriority.Ahead) return n;
      return -1;
    }

    /** A job for chunk n is on its way. */
    asking(n: number): boolean {
      return this.asked.has(n);
    }

    /** A job of this priority would get a slot now. */
    room(prio: LandPriority): boolean {
      return !this.dead && this.count(prio) < LandJobs.slots(prio);
    }

    private static slots(prio: LandPriority): number {
      return prio === LandPriority.Visible ? LAND_JOBS_MAX : prio === LandPriority.Ahead ? AHEAD_JOBS_MAX : ZOOM_JOBS_MAX;
    }

    /** A port for the simulation worker's states; this worker gets the other end. Set `fed` once it is connected. */
    feedPort(): MessagePort | null {
      if (this.dead || typeof MessageChannel === 'undefined') return null;
      const ch = new MessageChannel();
      this.worker.postMessage({ t: 'feed', port: ch.port2 } satisfies ToLandWorker, [ch.port2]);
      return ch.port1;
    }

    /** The page's field changed: it goes over before the next chunk is asked for. */
    fieldChanged(): void {
      this.fieldSent = false;
    }

    /**
     * Ask for chunk `n` (tiles from tx, ty) at field signature `sig`. False
     * while that priority's slots are full; asking again at the same
     * signature costs nothing, and at a higher priority makes the queued job
     * more urgent. `page`: from the page's own field (sent first if it
     * changed), which is ahead of the worker's while a brush moves ground, or
     * the only one when the worker is not fed. `k` > 1 brings a zoom picture
     * along; `have` is the signature the page shows now.
     */
    ask(field: TerrainField, seaColor: Uint32Array | null, n: number, tx: number, ty: number, side: number, margin: number, sig: number,
      page = true, prio = LandPriority.Visible, k = 0, have = -1): boolean {
      if (this.dead) return false;
      const a = this.asked.get(n);
      if (a && a.sig === sig) {
        if (prio < a.prio) {
          if (a.prio === LandPriority.Ahead) landStats.aheadUpgraded++;
          a.prio = prio;
          this.post({ t: 'prio', id: a.id, prio });
        }
        return true;
      }
      if (this.count(prio) - (a && a.prio === prio ? 1 : 0) >= LandJobs.slots(prio)) return false;
      if (page && !this.fieldSent) {
        const parts: Record<string, unknown> = {};
        for (const key of FIELD_PARTS) parts[key] = field[key];
        this.post({ t: 'field', parts, seaColor }, payloadBytes(parts));
        this.fieldSent = true;
      }
      // The worker drops a queued job for the same chunk when the new one arrives.
      if (a && a.k !== k) this.onDrop?.(n, a.k);
      const id = ++this.jobId;
      this.asked.set(n, { sig, id, prio, k });
      this.post({ t: 'job', id, n, tx, ty, side, margin, page, prio, k, have, gen: this.gen });
      if (prio === LandPriority.Ahead) landStats.aheadAsked++;
      return true;
    }

    /**
     * Ask for a creature picture (tilecache.ts); `done` gets the bitmap, which
     * the page owns from then on, or null if the worker failed. False when
     * the worker cannot raster them.
     */
    sprite(c: Life, stage: number, specialist: number, flip: boolean, px: number, done: (bitmap: ImageBitmap | null) => void): boolean {
      if (this.dead || !this.spriteCapable) return false;
      const id = ++this.jobId;
      this.sprites.set(id, done);
      this.post({ t: 'sprite', id, c, stage, specialist, flip, px, prio: LandPriority.Sprite });
      return true;
    }

    /** Drop the job for chunk n unless it has started (the chunk ahead the camera turned away from). */
    cancel(n: number): void {
      const a = this.asked.get(n);
      if (!a) return;
      this.asked.delete(n);
      this.post({ t: 'drop', ids: [a.id], all: false });
      this.onDrop?.(n, a.k);
    }

    /** The zoom moved to magnification k: zoom jobs for another k are dropped unless started. */
    dropZoom(k: number): void {
      for (const [n, a] of [...this.asked]) if (a.prio === LandPriority.Zoom && a.k !== k) this.cancel(n);
    }

    /** Another planet: every job dropped, answers for the planet before ignored. */
    clear(): void {
      this.gen++;
      for (const [n, a] of this.asked) this.onDrop?.(n, a.k);
      this.asked.clear();
      this.fieldSent = false;
      if (!this.dead) this.post({ t: 'drop', ids: [], all: true });
    }

    private count(prio: LandPriority): number {
      let c = 0;
      for (const a of this.asked.values()) if (a.prio === prio) c++;
      return c;
    }

    private post(m: ToLandWorker, bytes = 0): void {
      landStats.msgsOut++;
      landStats.bytesOut += bytes;
      this.worker.postMessage(m);
    }

    private receive(m: FromLandWorker): void {
      if (m.t === 'fatal') {
        this.fail(m.message);
        return;
      }
      if (this.url) {
        URL.revokeObjectURL(this.url);
        this.url = '';
      }
      landStats.msgsIn++;
      if (m.t === 'caps') {
        this.zoomCapable = m.zoom;
        this.spriteCapable = m.sprites;
        landStats.features.zoomCapable = m.zoom;
        return;
      }
      if (m.t === 'sprite') {
        if (landStats.recording) landStats.spriteMs.push(m.ms);
        const done = this.sprites.get(m.id);
        this.sprites.delete(m.id);
        if (done) done(m.bitmap);
        else m.bitmap?.close();
        return;
      }
      if (m.t === 'field') {
        landStats.bytesIn += payloadBytes(m.parts);
        this.onField?.(m.parts, m.key, m.ms, m.tiles);
        return;
      }
      if (m.t === 'zoom') {
        landStats.bytesIn += m.bitmap ? m.bitmap.width * m.bitmap.height * 4 : 0;
        if (landStats.recording && m.bitmap) landStats.scaleMs.push(m.ms);
        if (m.gen !== this.gen || this.dead) {
          m.bitmap?.close();
          return;
        }
        // Its reservation goes with it, unless a newer job for the chunk at the same k holds it now.
        const a = this.asked.get(m.n);
        this.onZoom?.(m, !(a && a.k === m.k));
        return;
      }
      landStats.bytesIn += m.words ? m.words.byteLength : 0;
      if (landStats.recording) landStats.composeMs.push(m.ms);
      const a = this.asked.get(m.n);
      const own = !!a && a.id === m.id;
      if (own) this.asked.delete(m.n);
      if (m.gen !== this.gen || this.dead) return;
      // The page's priority: a job made more urgent after it started still answers with the one it was sent at.
      this.onChunk?.(m, own, own && a ? a.prio : m.prio);
    }

    private fail(why: string): void {
      if (this.dead) return;
      this.dead = true;
      this.fed = false;
      for (const [n, a] of this.asked) this.onDrop?.(n, a.k);
      this.asked.clear();
      for (const done of this.sprites.values()) done(null);
      this.sprites.clear();
      this.worker.terminate();
      if (this.url) URL.revokeObjectURL(this.url);
      console.warn(`SimEarth: the landscape worker failed (${why}); chunks are composed on the page again`);
      this.onFail?.();
    }
  }

  /** The worker's side: the same composer over a copy of the page's field, and over the one it refreshes itself when fed. */
  export function landWorkerMain(port: SimPort): void {
    let composer: LandComposer | null = null;
    const pageField = new TerrainField();
    let seaColor: Uint32Array | null = null;
    const field = new TerrainField();
    const magnifier = ZoomMagnifier.capable() ? new ZoomMagnifier() : null;
    const sprites = !!magnifier && typeof Path2D !== 'undefined';
    /** Jobs not started yet. */
    const queue: (LandJob | SpriteJob)[] = [];
    let scheduled = false;
    const fatal = (err: unknown): void => {
      port.postMessage({ t: 'fatal', message: err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err) } satisfies FromLandWorker);
    };
    const work = (job: LandJob): void => {
      if (!composer) return;
      const t0 = performance.now();
      const words = new Uint32Array(job.side * job.side);
      const f = job.page ? pageField : field;
      const sea = job.page ? seaColor : null;
      composer.compose(f, job.tx, job.ty, LAND_CHUNK, LAND_CHUNK, job.margin, words, sea);
      const sig = f.signature(job.tx, job.ty, LAND_CHUNK, LAND_CHUNK, sea ? 1 : 0);
      const t1 = performance.now();
      // The pixels go first; the zoom picture follows in a message of its own, so a visible chunk never waits for it.
      const later = job.k > 1 && !!magnifier && magnifier.load(words, job.side);
      const pixels = sig !== job.have;
      const out: LandChunkAnswer = {
        t: 'chunk', id: job.id, n: job.n, gen: job.gen, prio: job.prio, sig, words: pixels ? words : null, motion: composer.motion,
        k: job.k, later, ms: t1 - t0, held: magnifier ? magnifier.bytes : 0,
      };
      port.postMessage(out, pixels ? [words.buffer] : []);
      if (!later || !magnifier) return;
      const t2 = performance.now();
      const bitmap = magnifier.magnify(job.k);
      port.postMessage({
        t: 'zoom', id: job.id, n: job.n, gen: job.gen, sig, k: job.k, bitmap, ms: performance.now() - t2, held: magnifier.bytes,
      } satisfies FromLandWorker, bitmap ? [bitmap] : []);
    };
    // The same rasterArt as on the page, on OffscreenCanvases: pixel for pixel the same picture (checked in headless Chrome, GPU and software).
    const sprite = (job: SpriteJob): void => {
      const t0 = performance.now();
      const sp = SPECIES[job.c as Life];
      const art = job.specialist >= 0 ? sp?.specialists[job.specialist]?.art : sp?.stages[job.stage]?.art;
      const canvas = rasterArt(art ?? [], job.px, CREATURE_LOOK, job.flip, true) as unknown as OffscreenCanvas;
      const bitmap = canvas.transferToImageBitmap();
      port.postMessage({ t: 'sprite', id: job.id, bitmap, ms: performance.now() - t0 } satisfies FromLandWorker, [bitmap]);
    };
    // One job per task, the most urgent (oldest within a priority) first.
    const run = (): void => {
      scheduled = false;
      let best = -1;
      for (let i = 0; i < queue.length; i++) if (best < 0 || queue[i].prio < queue[best].prio) best = i;
      if (best < 0) return;
      const job = queue.splice(best, 1)[0];
      try {
        if (job.t === 'sprite') sprite(job);
        else work(job);
      } catch (err) {
        fatal(err);
      }
      schedule();
    };
    const wake = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
    if (wake) wake.port1.onmessage = run;
    const schedule = (): void => {
      if (scheduled || queue.length === 0) return;
      scheduled = true;
      if (wake) wake.port2.postMessage(0);
      else setTimeout(run, 0);
    };
    port.onmessage = (e: MessageEvent) => {
      const m = e.data as ToLandWorker;
      try {
        if (m.t === 'art') {
          composer = new LandComposer(LandArt.fromIndices(m.indices));
          port.postMessage({ t: 'caps', zoom: !!magnifier, sprites } satisfies FromLandWorker);
        } else if (m.t === 'field') {
          mergeInto(pageField as unknown as Record<string, unknown>, m.parts);
          seaColor = m.seaColor;
        } else if (m.t === 'feed') {
          // The world as the simulation worker has it: refreshed here, sent to the page, one at a time.
          const world = new WorldState();
          const feed = m.port;
          feed.onmessage = (ev: MessageEvent) => {
            try {
              mergeInto(world as unknown as Record<string, unknown>, (ev.data as { world: Record<string, unknown> }).world);
              const t0 = performance.now();
              field.refresh(world);
              const ms = performance.now() - t0;
              const parts: Record<string, unknown> = {};
              for (const k of FIELD_PARTS) parts[k] = field[k];
              port.postMessage({ t: 'field', parts, key: `${world.seed}|${world.ticks}|${world.revision}`, ms, tiles: field.lastRead } satisfies FromLandWorker);
            } catch (err) {
              fatal(err);
            }
            feed.postMessage({ t: 'ack' });
          };
        } else if (m.t === 'sprite') {
          queue.push(m);
          schedule();
        } else if (m.t === 'job') {
          // A newer job for a chunk replaces the queued one in its place, so it keeps its turn.
          const i = queue.findIndex((q) => q.t === 'job' && q.n === m.n);
          if (i >= 0) queue[i] = { ...m };
          else queue.push({ ...m });
          schedule();
        } else if (m.t === 'drop') {
          // Another planet: its chunks go, creature pictures stay wanted.
          if (m.all) for (let i = queue.length - 1; i >= 0; i--) if (queue[i].t === 'job') queue.splice(i, 1);
          for (const id of m.ids) {
            const i = queue.findIndex((q) => q.id === id);
            if (i >= 0) queue.splice(i, 1);
          }
        } else if (m.t === 'prio') {
          const q = queue.find((j) => j.id === m.id);
          if (q && q.t === 'job') q.prio = m.prio;
        }
      } catch (err) {
        fatal(err);
      }
    };
  }
}
