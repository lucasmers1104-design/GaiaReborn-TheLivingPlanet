/* =============================================================================
 * SimEarth 2.0 — the simulation state as a message
 * -----------------------------------------------------------------------------
 * What the worker's core sends after a tick or a command, and how the page
 * takes it over into its own long-lived SimCore (the mirror the screen reads,
 * simhost.ts). The page's objects stay the same objects: typed arrays are
 * filled with .set(), class instances (WorldState, CivState, HazardState,
 * EvolutionState …) keep their prototypes and get their fields replaced, so
 * every cache keyed by world identity, `ticks` or `revision` keeps working.
 * postMessage copies the state as it is at that moment (structured clone),
 * so one message is always one consistent state between two ticks.
 * ========================================================================== */

namespace SE {
  export interface SimState {
    /** WorldState's own fields, without its Rng. */
    readonly world: Record<string, unknown>;
    readonly rng: number;
    readonly params: Record<string, Record<string, number>>;
    /** EvolutionSystem's status cache, which the tree and the goal pill read. */
    readonly evolution: Record<string, unknown>;
    /** FaunaDex's slots, without its pending discoveries (those travel as events). */
    readonly fauna: Record<string, unknown>;
    /** HistoryRecorder's samples, only when they changed since the last state. */
    readonly history: { readonly years: number[]; readonly data: number[][] } | null;
    readonly paidModels: string[];
    readonly offsets: number[];
  }

  const fields = (o: object): Record<string, unknown> => o as Record<string, unknown>;

  function without(o: object, skip: readonly string[]): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) if (!skip.includes(k)) out[k] = v;
    return out;
  }

  /** Typed arrays at least this long travel in pooled buffers (TransferPool); smaller ones are simply copied. */
  const POOLED_MIN = 4096;

  /**
   * Buffers for the big typed arrays of a state, handed back and forth: the
   * worker copies the live arrays into them and transfers them, the page takes
   * them over (applySimState) and transfers them back with its ack. Without it
   * every state left 5 MB of garbage on the page (35 MB/s at the fastest speed).
   */
  export class TransferPool {
    private readonly free = new Map<string, ArrayBufferView>();

    /** A pooled copy of `live` under `key`, its buffer added to `transfer`. */
    copy(key: string, live: ArrayBufferView, transfer: Transferable[]): ArrayBufferView {
      let buf = this.free.get(key);
      const n = (live as Uint8Array).length;
      if (!buf || buf.constructor !== live.constructor || (buf as Uint8Array).length !== n) {
        buf = new (live.constructor as new (n: number) => ArrayBufferView)(n);
      } else {
        this.free.delete(key);
      }
      (buf as Uint8Array).set(live as Uint8Array);
      transfer.push(buf.buffer as ArrayBuffer);
      return buf;
    }

    /** Buffers the page sent back. */
    give(buffers: Record<string, ArrayBufferView>): void {
      for (const [k, v] of Object.entries(buffers)) this.free.set(k, v);
    }
  }

  /** The big typed arrays of a received state's world (and its hazards), by pool key: to send back. */
  export function pooledArrays(s: SimState, transfer: Transferable[]): Record<string, ArrayBufferView> {
    const out: Record<string, ArrayBufferView> = {};
    const walk = (o: Record<string, unknown>, prefix: string): void => {
      for (const [k, v] of Object.entries(o)) {
        if (ArrayBuffer.isView(v) && (v as Uint8Array).length >= POOLED_MIN) {
          out[prefix + k] = v;
          transfer.push(v.buffer as ArrayBuffer);
        } else if (!prefix && k === 'hazards' && v && typeof v === 'object') {
          walk(v as Record<string, unknown>, 'hazards.');
        }
      }
    };
    walk(s.world, '');
    return out;
  }

  /** The world's own fields with its big typed arrays (and its hazards') copied into pooled buffers. */
  function pooledWorld(core: SimCore, pool: TransferPool, transfer: Transferable[]): Record<string, unknown> {
    const swap = (o: Record<string, unknown>, prefix: string): Record<string, unknown> => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(o)) {
        if (!prefix && k === 'rng') continue;
        if (ArrayBuffer.isView(v) && (v as Uint8Array).length >= POOLED_MIN) out[k] = pool.copy(prefix + k, v, transfer);
        else if (!prefix && k === 'hazards' && v && typeof v === 'object') out[k] = swap(v as Record<string, unknown>, 'hazards.');
        else out[k] = v;
      }
      return out;
    };
    return swap(fields(core.world), '');
  }

  /**
   * The core's state for postMessage: references to the live objects, which
   * postMessage copies at once; with a pool, the big arrays go as pooled
   * copies whose buffers are added to `transfer`.
   */
  export function captureSimState(core: SimCore, withHistory: boolean, pool?: TransferPool, transfer?: Transferable[]): SimState {
    const h = core.history;
    return {
      world: pool && transfer ? pooledWorld(core, pool, transfer) : without(core.world, ['rng']),
      rng: core.world.rng.getState(),
      params: core.params.groups(),
      evolution: without(core.evolution, ['life', 'flora', 'pending']),
      fauna: without(core.fauna, ['pending']),
      history: withHistory ? { years: h.years, data: h.series.map((s) => s.data) } : null,
      paidModels: Array.from(core.paidModels),
      offsets: core.geo.driftOffsets,
    };
  }

  function isInstance(v: unknown): v is object {
    if (!v || typeof v !== 'object' || ArrayBuffer.isView(v) || Array.isArray(v) || v instanceof Map || v instanceof Set) return false;
    const proto = Object.getPrototypeOf(v);
    return proto !== Object.prototype && proto !== null;
  }

  /**
   * Take `data` over into `target`: same-size typed arrays are copied into,
   * nested class instances merged field by field, everything else replaced.
   */
  export function mergeInto(target: Record<string, unknown>, data: Record<string, unknown>): void {
    for (const k of Object.keys(data)) {
      const v = data[k];
      const t = target[k];
      if (ArrayBuffer.isView(v) && ArrayBuffer.isView(t) && (t as Uint8Array).length === (v as Uint8Array).length && t.constructor === v.constructor) {
        (t as Uint8Array).set(v as Uint8Array);
      } else if (isInstance(t) && v && typeof v === 'object' && !ArrayBuffer.isView(v) && !Array.isArray(v) && !(v instanceof Map) && !(v instanceof Set)) {
        mergeInto(fields(t), v as Record<string, unknown>);
      } else {
        // A received typed array is never kept: its buffer may go back to the worker (TransferPool).
        target[k] = ArrayBuffer.isView(v) ? (v as Uint8Array).slice() : v;
      }
    }
  }

  /** Take a received state over into the page's mirror core. */
  export function applySimState(view: SimCore, s: SimState): void {
    mergeInto(fields(view.world), s.world);
    // The mirror never draws a random number; this keeps it ready to take over (simhost.ts failover).
    view.world.rng.setState(s.rng);
    for (const [group, values] of Object.entries(view.params.groups())) {
      const v = s.params[group];
      if (v) Object.assign(values, v);
    }
    mergeInto(fields(view.evolution), s.evolution);
    mergeInto(fields(view.fauna), s.fauna);
    if (s.history) {
      const h = view.history;
      h.years.length = 0;
      h.years.push(...s.history.years);
      h.series.forEach((series, k) => {
        series.data.length = 0;
        series.data.push(...(s.history!.data[k] ?? []));
      });
    }
    view.paidModels.clear();
    for (const id of s.paidModels) view.paidModels.add(id);
    view.geo.driftOffsets = s.offsets;
  }

  /** Bytes of the typed arrays in a state: what dominates a message. */
  export function simStateBytes(s: SimState): number {
    let n = 0;
    const walk = (o: Record<string, unknown>, depth: number): void => {
      for (const v of Object.values(o)) {
        if (ArrayBuffer.isView(v)) n += v.byteLength;
        else if (depth < 2 && isInstanceData(v)) walk(v as Record<string, unknown>, depth + 1);
      }
    };
    walk(s.world, 0);
    return n;
  }

  function isInstanceData(v: unknown): boolean {
    return !!v && typeof v === 'object' && !ArrayBuffer.isView(v) && !Array.isArray(v) && !(v instanceof Map) && !(v instanceof Set);
  }
}
