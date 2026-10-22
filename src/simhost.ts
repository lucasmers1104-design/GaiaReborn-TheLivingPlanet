/* =============================================================================
 * SimEarth 2.0 — the page's side of the simulation
 * -----------------------------------------------------------------------------
 * The screen always reads `view`, a SimCore that lives as long as the page.
 * In worker mode the planet runs in a classic Blob worker built from the
 * bundle's own source (tools/wrap-bundle.js): `view` is a mirror that takes
 * over each state the worker posts (simstate.ts), commands go out numbered
 * and in order, and their results come back with the state that contains
 * them. In direct mode — no worker possible, preview pages, `?sim=direct`, or
 * after the worker failed — `view` itself is the planet and every command is
 * applied at once. Rendering never waits for the worker: it draws the last
 * complete state.
 *
 * A few commands are predicted (applied to the mirror at once and again over
 * each newer state until the worker has them): the brush's dabs, so the
 * ground moves under the pointer, and bookkeeping like `reported`.
 * ========================================================================== */

namespace SE {
  export type SimMode = 'direct' | 'worker';

  interface Waiting {
    readonly cmd: SimRequest;
    readonly done?: (r: SimResult) => void;
    /** Answer it even after a new planet or a load (a save of the planet before). */
    readonly always: boolean;
    readonly session: number;
    /** A load: the session its planet becomes, once it has loaded. */
    readonly load?: number;
  }

  /** Call a result's receiver; a fault in the screen's follow-up must not stop the answers after it. */
  function answer(done: ((r: SimResult) => void) | undefined, r: SimResult): void {
    try {
      done?.(r);
    } catch (err) {
      console.error('SimEarth: handling a simulation result failed', err);
    }
  }

  /** No word from a worker that owes answers for this long: it is taken for dead. */
  const SIM_WATCHDOG_MS = 20000;

  /**
   * A classic worker running this very bundle and then `entry`, from a Blob of
   * the bundle's own source (tools/wrap-bundle.js): over file:// a page can
   * neither fetch its script nor start a worker from a file. Null for an
   * unwrapped build or where no worker can start. Revoke `url` once the worker
   * has spoken.
   */
  export function bundleWorker(entry: string, name: string): { worker: Worker; url: string } | null {
    const fn = (globalThis as { seBundle?: unknown }).seBundle;
    if (typeof fn !== 'function' || typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') return null;
    let url = '';
    try {
      url = URL.createObjectURL(new Blob([`${fn.toString()}\nseBundle();\n${entry}\n`], { type: 'text/javascript' }));
      return { worker: new Worker(url, { name }), url };
    } catch (err) {
      if (url) URL.revokeObjectURL(url);
      console.warn(`SimEarth: no ${name} worker, its work stays on the page`, err);
      return null;
    }
  }

  export class SimHost {
    readonly view = new SimCore();
    private port: SimPort | null = null;
    private worker: Worker | null = null;
    private url = '';
    private seq = 0;
    /** The planet shown; `sessions` counts the ones asked for (a load only becomes one when it worked). */
    private session = 0;
    private sessions = 0;
    /** Last command the worker had applied in a state that arrived. */
    private applied = 0;
    private readonly waiting = new Map<number, Waiting>();
    private readonly predicted: { seq: number; cmd: SimCommand }[] = [];
    /** When the shown state was posted (performance.timeOrigin + now), and when one with a new tick arrived (page time). */
    private stateAt = 0;
    private tickedAt = 0;
    private lastTicks = -1;
    private heardAt = 0;
    /** A command failed on the page as well after the worker had failed: the planet may be inconsistent, nothing more is applied or ticked. */
    broken = false;
    /** The worker failed and the page took over; the reason, for the player. */
    onFailover: ((why: string) => void) | null = null;

    /** `port` runs the worker on a given MessagePort (tests); otherwise `mode` asks for a Blob worker if one can start. */
    constructor(mode: SimMode, port?: SimPort) {
      if (port) this.attach(port);
      else if (mode === 'worker') this.startWorker();
      // The page's sinks: the drift map reads driftProbe; in worker mode the rest wait for a failover.
      this.view.bind();
    }

    get mode(): SimMode {
      return this.port ? 'worker' : 'direct';
    }

    private startWorker(): void {
      const started = bundleWorker('SE.simWorkerMain(self);', 'simearth-sim');
      if (!started) return;
      const w = started.worker;
      this.url = started.url;
      w.onerror = (e) => {
        e.preventDefault();
        this.failover(e.message || 'Fehler im Simulations-Worker');
      };
      w.onmessageerror = () => this.failover('unlesbare Nachricht vom Simulations-Worker');
      this.worker = w;
      this.attach(w);
    }

    private attach(port: SimPort): void {
      this.port = port;
      this.heardAt = performance.now();
      port.onmessage = (e: MessageEvent) => this.receive(e.data as FromSimWorker);
    }

    /* ======================================================== commands === */

    /** Apply a command (direct) or send it; `done` gets its result once the state that contains it is on screen. */
    run(cmd: SimRequest, done?: (r: SimResult) => void, always = false): void {
      const fresh = cmd.type === 'newPlanet' || cmd.type === 'loadText';
      if (this.broken) {
        // Only a whole new planet (or a loaded one) gets out of it.
        if (!fresh) {
          answer(done, { ok: false, reason: 'Die Simulation ist angehalten.' });
          return;
        }
        const then = done;
        done = (r) => {
          if (r.ok) this.broken = false;
          then?.(r);
        };
      }
      if (!this.port) {
        this.runHere(cmd, done);
        return;
      }
      const seq = ++this.seq;
      if (this.waiting.size === 0) this.heardAt = performance.now();
      if (cmd.type === 'newPlanet') {
        this.session = ++this.sessions;
        this.predicted.length = 0;
        this.waiting.set(seq, { cmd, done, always, session: this.session });
        this.port.postMessage({ t: 'cmd', seq, session: this.session, cmd });
        return;
      }
      // A load that fails leaves the planet, its session and its news as they were.
      const load = cmd.type === 'loadText' ? ++this.sessions : undefined;
      this.waiting.set(seq, { cmd, done, always: always || load !== undefined, session: this.session, load });
      this.port.postMessage({ t: 'cmd', seq, session: load ?? this.session, cmd });
    }

    request(cmd: SimRequest, always = false): Promise<SimResult> {
      return new Promise((resolve) => this.run(cmd, resolve, always));
    }

    /** Apply to the screen's state at once; in worker mode the worker follows. */
    predict(cmd: SimCommand): void {
      this.view.apply(cmd);
      this.send(cmd);
    }

    /** The brush moved the view's ground already (terraformtool.ts): pay for it, and let the worker dab the same. */
    brush(dabs: readonly number[], moved: number): void {
      this.view.chargeDabs(moved);
      // A copy: the tool reuses its array next frame, and a prediction may be replayed after that.
      this.send({ type: 'dabs', dabs: dabs.slice() });
    }

    private send(cmd: SimCommand): void {
      if (!this.port) return;
      const seq = ++this.seq;
      if (this.waiting.size === 0) this.heardAt = performance.now();
      this.predicted.push({ seq, cmd });
      this.waiting.set(seq, { cmd, always: false, session: this.session });
      this.port.postMessage({ t: 'cmd', seq, session: this.session, cmd });
    }

    private runHere(cmd: SimRequest, done?: (r: SimResult) => void): void {
      const core = this.view;
      if (cmd.type === 'saveText' || cmd.type === 'loadText') {
        // Serialized now, between two ticks; only the encoding (or decoding) waits.
        (cmd.type === 'saveText' ? core.saveText() : core.loadText(cmd.text)).then((r) => answer(done, r), () => answer(done, { ok: false, reason: '' }));
        return;
      }
      const r = core.apply(cmd);
      answer(done, r);
    }

    /* ========================================================== states === */

    private receive(m: FromSimWorker): void {
      // After a failover the page's planet is the planet: a late word from the old worker changes nothing.
      if (!this.port) return;
      this.heardAt = performance.now();
      if (m.t === 'fatal') {
        this.failover(m.message, m.seq);
        return;
      }
      if (this.url) {
        URL.revokeObjectURL(this.url);
        this.url = '';
      }
      try {
        // A load that worked makes its planet the one shown, from this state on.
        for (const { seq, result } of m.results) {
          const w = this.waiting.get(seq);
          if (w?.load !== undefined && result.ok) {
            this.session = w.load;
            this.predicted.length = 0;
          }
        }
        // A state from before the latest new planet or load belongs to a planet no longer shown.
        if (m.session === this.session) {
          const view = this.view;
          applySimState(view, m.state);
          this.stateAt = m.at;
          if (view.world.ticks !== this.lastTicks) {
            this.lastTicks = view.world.ticks;
            this.tickedAt = performance.now();
          }
          while (this.predicted.length > 0 && this.predicted[0].seq <= m.seq) this.predicted.shift();
          for (const p of this.predicted) view.apply(p.cmd);
          view.notes.push(...m.notes);
          view.evolution.pending.push(...m.chronicle);
          view.fauna.pending.push(...m.fauna);
          perfHud.message(simStateBytes(m.state));
        }
      } catch (err) {
        // The mirror is only the picture of the planet: the next state replaces it whole.
        console.error('SimEarth: a simulation state could not be taken over', err);
      } finally {
        // Taken over (or dropped): the worker may post the next state, in the buffers of this one.
        const transfer: Transferable[] = [];
        const buffers = pooledArrays(m.state, transfer);
        this.port?.postMessage({ t: 'ack', buffers } satisfies ToSimWorker, transfer);
      }
      this.applied = Math.max(this.applied, m.seq);
      for (const ms of m.tickMs) perfHud.tick(ms);
      for (const { seq, result } of m.results) {
        const w = this.waiting.get(seq);
        this.waiting.delete(seq);
        if (w && (w.session === this.session || w.always)) answer(w.done, result);
      }
    }

    /**
     * The worker is gone: the page takes over from the last complete state it
     * shows and answers what was still open, in order. Dabs and bookkeeping it
     * predicted are in that state already; the command the worker failed on
     * (`culprit`) is answered as failed, not tried again. Should one still
     * fail here, the planet may be half changed: `broken`, nothing more runs.
     */
    private failover(why: string, culprit = -1): void {
      if (!this.port) return;
      console.warn(`SimEarth: the simulation worker failed (${why}); the planet runs on the page from its last complete state`);
      this.worker?.terminate();
      this.worker = null;
      this.port = null;
      if (this.url) URL.revokeObjectURL(this.url);
      this.url = '';
      this.view.bind();
      const predicted = new Set(this.predicted.map((p) => p.seq));
      this.predicted.length = 0;
      const open = [...this.waiting.entries()].sort((a, b) => a[0] - b[0]);
      this.waiting.clear();
      for (const [seq, w] of open) {
        // Applied by the worker already (in the state shown), or predicted into it: never twice.
        if (predicted.has(seq) || seq <= this.applied) continue;
        if (w.session !== this.session && !w.always) continue;
        if (seq === culprit) {
          answer(w.done, { ok: false, reason: 'Die Simulation konnte diesen Schritt nicht ausführen.' });
          continue;
        }
        try {
          this.runHere(w.cmd, w.done);
        } catch (err) {
          this.broken = true;
          console.error('SimEarth: a command failed on the page too; the simulation stops', err);
          break;
        }
      }
      this.onFailover?.(why);
    }

    /** Every frame: a worker that owes answers and stays silent too long is taken for dead. */
    watch(now: number): void {
      if (this.port && this.worker && this.waiting.size > 0 && now - this.heardAt > SIM_WATCHDOG_MS) this.failover('keine Antwort');
    }

    /** How far the world is between its last tick and the next, 0..1, for effects that play between ticks. */
    phase(now: number, tickMs: number): number {
      return tickMs > 0 ? clamp((now - this.tickedAt) / tickMs, 0, 0.999) : 0;
    }

    /** Milliseconds since the shown state was posted. */
    stateAge(): number {
      return this.port ? performance.timeOrigin + performance.now() - this.stateAt : 0;
    }

    /** Worker mode: let the worker send each state's world to `port` too (the landscape worker's feed). False in direct mode. */
    feed(port: MessagePort): boolean {
      if (!this.worker) return false;
      this.worker.postMessage({ t: 'feed', port } satisfies ToSimWorker, [port]);
      return true;
    }

    /** Commands sent and not yet answered. */
    get pending(): number {
      return this.waiting.size;
    }

    /** Resolves once every command sent so far is answered (benchmarks, tests). */
    idle(): Promise<void> {
      return this.port ? this.request({ type: 'sync' }).then(() => undefined) : Promise.resolve();
    }
  }
}
