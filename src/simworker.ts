/* =============================================================================
 * SimEarth 2.0 — the simulation worker
 * -----------------------------------------------------------------------------
 * Owns the planet: one SimCore, ticked on its own clock at the game speed,
 * with the page's commands applied in order between two ticks. After a tick
 * or a command it posts the whole state with every result and one-off event
 * since the last post. At most one state is on its way: the next waits for
 * the page's ack, and while it waits at most one more tick is computed, so no
 * tick is ever skipped on screen; an overloaded page or worker slows the
 * planet down instead. Runs in a Blob worker (simhost.ts) and, for tests, on
 * any MessagePort.
 * ========================================================================== */

namespace SE {
  /** Requests: a command, saving (the encoded text comes back as `text`) or loading a save's text. */
  export type SimRequest = SimCommand | { readonly type: 'saveText' } | { readonly type: 'loadText'; readonly text: string };

  export type ToSimWorker =
    | { readonly t: 'cmd'; readonly seq: number; readonly session: number; readonly cmd: SimRequest }
    /** The page took the last state over; `buffers` are its pooled arrays, back for the next (TransferPool). */
    | { readonly t: 'ack'; readonly buffers?: Record<string, ArrayBufferView> }
    /** A port to the landscape worker (landworker.ts): it gets each state's world too, and acks it. */
    | { readonly t: 'feed'; readonly port: MessagePort };

  export interface SimStateMessage {
    readonly t: 'state';
    readonly session: number;
    /** Last command applied. */
    readonly seq: number;
    readonly state: SimState;
    readonly results: { readonly seq: number; readonly result: SimResult }[];
    readonly notes: SimNote[];
    readonly chronicle: ChronicleEntry[];
    readonly fauna: FaunaEvent[];
    /** Milliseconds each tick since the last post took. */
    readonly tickMs: number[];
    /** performance.timeOrigin + performance.now() when posted. */
    readonly at: number;
  }

  /** `seq`: the command being applied when it failed, or -1 (a tick, encoding or decoding). */
  export type FromSimWorker = SimStateMessage | { readonly t: 'fatal'; readonly message: string; readonly seq: number };

  export interface SimPort {
    postMessage(message: unknown, transfer?: Transferable[]): void;
    onmessage: ((e: MessageEvent) => void) | null;
  }

  export function simWorkerMain(port: SimPort): void {
    const core = new SimCore();
    core.bind();
    const queue: { seq: number; session: number; cmd: SimRequest }[] = [];
    const results: { seq: number; result: SimResult }[] = [];
    const pool = new TransferPool();
    const tickMs: number[] = [];
    let session = 0;
    let seq = 0;
    let busy = false;
    let dead = false;
    let inFlight = false;
    let dirty = false;
    let tickedSincePost = false;
    /** The loop stopped without a clock (paused, held, loading): the next run does not count the time since. */
    let idle = true;
    let acc = 0;
    let last = performance.now();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let historyKey = '';
    /** The landscape worker's port: one world on its way at a time, the newest when it asks for more. */
    let feed: MessagePort | null = null;
    let feedBusy = false;
    let feedDirty = false;

    const feedPost = (): void => {
      if (!feed) return;
      if (feedBusy) {
        feedDirty = true;
        return;
      }
      feed.postMessage({ world: captureSimState(core, false).world });
      feedBusy = true;
      feedDirty = false;
    };

    /** The command being applied, for the page to leave out when it takes over. */
    let applying = -1;

    const fail = (err: unknown): void => {
      dead = true;
      port.postMessage({ t: 'fatal', message: err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err), seq: applying });
    };

    const post = (): void => {
      const h = core.history;
      const key = `${h.years.length}|${h.years[h.years.length - 1] ?? ''}`;
      const transfer: Transferable[] = [];
      const msg: SimStateMessage = {
        t: 'state', session, seq,
        state: captureSimState(core, key !== historyKey, pool, transfer),
        results: results.splice(0),
        notes: core.notes.splice(0),
        chronicle: core.evolution.pending.splice(0),
        fauna: core.fauna.pending.splice(0),
        tickMs: tickMs.splice(0),
        at: performance.timeOrigin + performance.now(),
      };
      historyKey = key;
      port.postMessage(msg, transfer);
      inFlight = true;
      dirty = false;
      tickedSincePost = false;
      feedPost();
    };

    const wake = (delay = 0): void => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(loop, delay);
    };

    const take = (m: { seq: number; session: number; cmd: SimRequest }): void => {
      const cmd = m.cmd;
      if (cmd.type === 'newPlanet') session = m.session;
      seq = m.seq;
      if (cmd.type === 'saveText') {
        // Serialized now, between two ticks; only the encoding runs on meanwhile.
        core.saveText().then((result) => {
          results.push({ seq: m.seq, result });
          dirty = true;
          wake();
        }, fail);
        return;
      }
      if (cmd.type === 'loadText') {
        // Decoding is async (gzip); nothing else runs meanwhile, so the order holds. Only a loaded planet is a new session.
        busy = true;
        core.loadText(cmd.text).then((result) => {
          if (result.ok) session = m.session;
          results.push({ seq: m.seq, result });
          dirty = true;
          busy = false;
          idle = true;
          wake();
        }, fail);
        return;
      }
      if (cmd.type === 'speed') acc = core.speed === 0 ? 0 : Math.min(acc, core.tickMs(cmd.speed));
      applying = m.seq;
      results.push({ seq: m.seq, result: core.apply(cmd) });
      applying = -1;
      dirty = true;
    };

    function loop(): void {
      timer = null;
      if (dead) return;
      try {
        while (queue.length > 0 && !busy) take(queue.shift()!);
        const now = performance.now();
        const ms = core.tickMs(core.speed);
        // After a pause, a hold or a load the clock starts afresh: no burst of ticks for the time it stood.
        if (idle) last = now;
        idle = false;
        if (ms > 0 && !busy) acc += now - last;
        else acc = 0;
        last = now;
        // One tick ahead of the page at most: never two ticks in one post.
        if (ms > 0 && !busy && acc >= ms && !tickedSincePost) {
          const t0 = performance.now();
          if (core.tick()) {
            tickMs.push(performance.now() - t0);
            dirty = true;
            tickedSincePost = true;
            acc = Math.min(acc - ms, ms * SIM_BACKLOG_TICKS);
          } else {
            acc = 0; // the dinosaurs' fate holds the world until the page answers
          }
        }
        if (dirty && !inFlight) post();
        if (busy || ms === 0 || dinoEraHoldsTime(core.world)) {
          idle = true; // a message wakes it
          return;
        }
        if (tickedSincePost && inFlight) return; // the ack wakes it
        wake(Math.max(0, ms - acc));
      } catch (err) {
        fail(err);
      }
    }

    port.onmessage = (e: MessageEvent): void => {
      const m = e.data as ToSimWorker;
      if (m.t === 'feed') {
        feed = m.port;
        feed.onmessage = () => {
          feedBusy = false;
          if (feedDirty) feedPost();
        };
        feedPost();
        return;
      }
      if (m.t === 'ack') {
        inFlight = false;
        if (m.buffers) pool.give(m.buffers);
      }
      else queue.push({ seq: m.seq, session: m.session, cmd: m.cmd });
      if (!dead) wake();
    };
  }
}
