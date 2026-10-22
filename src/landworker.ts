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
 * ========================================================================== */

namespace SE {
  /** What the composer and the signature read of TerrainField; the rest is the page's own bookkeeping. */
  const FIELD_PARTS = [
    'key', 'sea', 'lagoon', 'seaTile', 'reef', 'corals', 'sands', 'cay', 'beach', 'shade', 'rugged', 'volcano', 'ridges',
    'river', 'paths', 'algae', 'edge', 'scene', 'density', 'groups', 'top', 'cactus', 'savannaTree', 'palm', 'sig',
  ] as const;
  /** Chunks asked for at once: enough to keep the worker busy, few enough that a newer field is used soon. */
  const LAND_JOBS_MAX = 6;

  type ToLandWorker =
    | { readonly t: 'art'; readonly indices: Uint8Array }
    /** The simulation worker's states arrive on `port` (SimHost.feed): from then on this worker keeps the field. */
    | { readonly t: 'feed'; readonly port: MessagePort }
    | { readonly t: 'field'; readonly parts: Record<string, unknown>; readonly seaColor: Uint32Array | null }
    /** `page`: compose from the page's field (sent with 'field') rather than the one refreshed here (fed). */
    | { readonly t: 'job'; readonly id: number; readonly n: number; readonly tx: number; readonly ty: number; readonly side: number; readonly margin: number; readonly page: boolean };

  type FromLandWorker =
    | { readonly t: 'chunk'; readonly id: number; readonly n: number; readonly sig: number; readonly words: Uint32Array; readonly motion: LandMotion }
    /** The field refreshed here from world `key` (seed|ticks|revision), `ms` and `tiles` as TerrainField measured it. */
    | { readonly t: 'field'; readonly parts: Record<string, unknown>; readonly key: string; readonly ms: number; readonly tiles: number }
    | { readonly t: 'fatal'; readonly message: string };

  export class LandJobs {
    /** Chunk number → the field signature it was asked for at, and the job's id. */
    private readonly asked = new Map<number, { sig: number; id: number }>();
    private jobId = 0;
    private fieldSent = false;
    private dead = false;
    /** This worker refreshes its own field from the simulation's states (feedPort); the page's goes over only for page jobs. */
    fed = false;
    /** A composed chunk arrived: number, signature of the field it was composed from, pixels, moving water. */
    onChunk: ((n: number, sig: number, words: Uint32Array, motion: LandMotion) => void) | null = null;
    /** A field refreshed here arrived (fed mode). */
    onField: ((parts: Record<string, unknown>, key: string, ms: number, tiles: number) => void) | null = null;

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

    /** Chunks asked for and not answered yet. */
    get busy(): number {
      return this.asked.size;
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
     * while enough are on their way; asking again at the same signature costs
     * nothing. `page`: from the page's own field (sent first if it changed),
     * which is ahead of the worker's while a brush moves ground, or the only
     * one when the worker is not fed.
     */
    ask(field: TerrainField, seaColor: Uint32Array | null, n: number, tx: number, ty: number, side: number, margin: number, sig: number, page = true): boolean {
      if (this.dead) return false;
      if (this.asked.get(n)?.sig === sig) return true;
      if (this.asked.size >= LAND_JOBS_MAX) return false;
      if (page && !this.fieldSent) {
        const parts: Record<string, unknown> = {};
        for (const k of FIELD_PARTS) parts[k] = field[k];
        this.worker.postMessage({ t: 'field', parts, seaColor } satisfies ToLandWorker);
        this.fieldSent = true;
      }
      const id = ++this.jobId;
      this.asked.set(n, { sig, id });
      this.worker.postMessage({ t: 'job', id, n, tx, ty, side, margin, page } satisfies ToLandWorker);
      return true;
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
      if (m.t === 'field') {
        this.onField?.(m.parts, m.key, m.ms, m.tiles);
        return;
      }
      if (this.asked.get(m.n)?.id === m.id) this.asked.delete(m.n);
      this.onChunk?.(m.n, m.sig, m.words, m.motion);
    }

    private fail(why: string): void {
      if (this.dead) return;
      this.dead = true;
      this.fed = false;
      this.asked.clear();
      this.worker.terminate();
      if (this.url) URL.revokeObjectURL(this.url);
      console.warn(`SimEarth: the landscape worker failed (${why}); chunks are composed on the page again`);
    }
  }

  /** The worker's side: the same composer over a copy of the page's field, and over the one it refreshes itself when fed. */
  export function landWorkerMain(port: SimPort): void {
    let composer: LandComposer | null = null;
    const pageField = new TerrainField();
    let seaColor: Uint32Array | null = null;
    const field = new TerrainField();
    port.onmessage = (e: MessageEvent) => {
      const m = e.data as ToLandWorker;
      try {
        if (m.t === 'art') {
          composer = new LandComposer(LandArt.fromIndices(m.indices));
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
              port.postMessage({ t: 'fatal', message: err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err) } satisfies FromLandWorker);
            }
            feed.postMessage({ t: 'ack' });
          };
        } else if (composer) {
          const words = new Uint32Array(m.side * m.side);
          const f = m.page ? pageField : field;
          const sea = m.page ? seaColor : null;
          composer.compose(f, m.tx, m.ty, LAND_CHUNK, LAND_CHUNK, m.margin, words, sea);
          const sig = f.signature(m.tx, m.ty, LAND_CHUNK, LAND_CHUNK, sea ? 1 : 0);
          const out: FromLandWorker = { t: 'chunk', id: m.id, n: m.n, sig, words, motion: composer.motion };
          port.postMessage(out, [words.buffer]);
        }
      } catch (err) {
        port.postMessage({ t: 'fatal', message: err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err) } satisfies FromLandWorker);
      }
    };
  }
}
