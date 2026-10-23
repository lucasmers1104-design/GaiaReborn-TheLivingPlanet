/* =============================================================================
 * Gaia Reborn — the gas balance of one simulation step
 * -----------------------------------------------------------------------------
 * Which processes changed O₂, CO₂ and CH₄ in the last completed tick. Each
 * share is booked where it is computed or takes effect (life, the
 * civilization, the atmosphere, methane, events and disasters), never
 * re-derived from the changed world. A tick opens the ledger, every process
 * adds its share, a clamp books what it cut off as the model's limit, and
 * closing it keeps the tick's balance: its parts add up to end minus start.
 * Outside a tick every booked change is the player's (a terraformer, a
 * disaster set off by hand, the comet) and is summed apart as intervention
 * since that balance. A diagnosis only: not saved, gone with a new or loaded
 * planet. O₂ in percentage points of the air, CO₂ and CH₄ in ppm. Node-safe.
 * ========================================================================== */

namespace SE {
  export type GasId = 'o2' | 'co2' | 'ch4';

  export type GasProcess =
    | 'plants' | 'sea' | 'breath' | 'cityBreath' | 'fossil' | 'fire' | 'oxidation' | 'reducing'
    | 'volcanism' | 'volcano' | 'impact' | 'photosynthesis' | 'weathering'
    | 'archaea' | 'swamps' | 'abiotic' | 'civ' | 'decay' | 'player' | 'limit';

  /** One gas over one tick: its level before and after, and each process's signed share of the change. */
  export interface GasBalance {
    readonly start: number;
    readonly end: number;
    readonly parts: Readonly<Partial<Record<GasProcess, number>>>;
  }

  /** The balance of one completed tick; `tick` is the world's tick count right after it. */
  export interface GasBudget {
    readonly tick: number;
    readonly o2: GasBalance;
    readonly co2: GasBalance;
    readonly ch4: GasBalance;
  }

  type Parts = Partial<Record<GasProcess, number>>;

  export class GasLedger {
    /** The last completed tick's balance; null before this planet's first tick and after loading. */
    last: GasBudget | null = null;
    /** What the player's actions changed since `last`, per gas. */
    since: Record<GasId, number> = { o2: 0, co2: 0, ch4: 0 };
    /** The tick being booked, its start levels and parts; null between ticks. */
    private open: { start: Record<GasId, number>; parts: Record<GasId, Parts> } | null = null;

    begin(w: WorldState): void {
      this.open = { start: { o2: w.o2, co2: w.co2, ch4: w.ch4 }, parts: { o2: {}, co2: {}, ch4: {} } };
    }

    /** `v` of `gas` from process `id`: part of the open tick, between ticks the player's doing. */
    add(gas: GasId, id: GasProcess, v: number): void {
      if (v === 0) return;
      const o = this.open;
      if (!o) {
        this.since[gas] += v;
        return;
      }
      const parts = o.parts[gas];
      parts[id] = (parts[id] ?? 0) + v;
    }

    close(w: WorldState): void {
      const o = this.open;
      if (!o) return;
      const balance = (gas: GasId): GasBalance => ({ start: o.start[gas], end: w[gas], parts: o.parts[gas] });
      this.last = { tick: w.ticks, o2: balance('o2'), co2: balance('co2'), ch4: balance('ch4') };
      this.since = { o2: 0, co2: 0, ch4: 0 };
      this.open = null;
    }

    reset(): void {
      this.last = null;
      this.since = { o2: 0, co2: 0, ch4: 0 };
      this.open = null;
    }
  }

  /**
   * world[gas] moved by `v` from process `id` and clamped to [lo, hi], as the
   * call sites always computed it; the ledger books `v` and what the clamp
   * cut off as the model's limit.
   */
  export function shiftGas(w: WorldState, gas: GasId, id: GasProcess, v: number, lo: number, hi: number): void {
    const raw = w[gas] + v;
    w[gas] = clamp(raw, lo, hi);
    w.gas.add(gas, id, v);
    w.gas.add(gas, 'limit', w[gas] - raw);
  }
}
