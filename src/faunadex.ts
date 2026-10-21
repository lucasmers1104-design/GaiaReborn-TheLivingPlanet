/* =============================================================================
 * SimEarth 2.0 — species lexicon (game logic)
 * -----------------------------------------------------------------------------
 * Remembers which of the 136 animal sub-species the player's planet has
 * produced, where and under what conditions each first appeared, and whether
 * it still lives. Reads only the derived per-stage counters every tick; the
 * tile grid is searched only when something new turns up.
 * ========================================================================== */

namespace SE {
  /**
   * Ticks a sub-species must be missing before the lexicon marks it extinct.
   * Measured: half of all gaps in a sub-species' range last 15 ticks or less.
   */
  export const FAUNA_EXTINCT_GRACE = 20;

  export interface FaunaDiscovery {
    readonly tick: number;
    readonly years: number;
    /** Tile of the first sighting, -1 if unknown. */
    readonly tile: number;
    /** Biome of that tile, -1 if unknown. */
    readonly biome: number;
    /** Temperature on that tile, °C. */
    readonly temp: number | null;
    /** Atmospheric oxygen, percent. */
    readonly o2: number | null;
    /** Taken over from a save without lexicon data: circumstances unknown. */
    readonly adopted?: boolean;
  }

  export type FaunaStatus = 'unknown' | 'living' | 'extinct';

  export interface FaunaRef { readonly c: Life; readonly stage: number; }

  export interface FaunaEvent extends FaunaRef { readonly tick: number; }

  interface FaunaSlot {
    rec: FaunaDiscovery;
    extinct: boolean;
    /** Tick the current gap in the sub-species' range began, -1 while present. */
    gapSince: number;
    returns: number;
    /** Its notice has been on screen (adopted entries count as announced). */
    announced: boolean;
  }

  const FAUNA_SAVE_VERSION = 1;
  const FAUNA_CLASS_BY_ID = new Map<string, Life>();
  for (let c = 1; c < LIFE_COUNT; c++) FAUNA_CLASS_BY_ID.set(LIFE[c as Life].id, c as Life);

  function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
  }

  function intIn(v: unknown, lo: number, hi: number): number | null {
    return typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null;
  }

  /** A number in range, null for an absent value, false for anything invalid. */
  function nullableIn(v: unknown, lo: number, hi: number): number | null | false {
    if (v === null || v === undefined) return null;
    return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : false;
  }

  function readSlot(e: unknown): FaunaSlot | null {
    if (!isRecord(e)) return null;
    const tick = intIn(e.t, 0, Number.MAX_SAFE_INTEGER);
    const years = typeof e.y === 'number' && Number.isFinite(e.y) ? e.y : null;
    const tile = intIn(e.i, -1, TILE_COUNT - 1);
    const biome = intIn(e.b, -1, BIOME_COUNT - 1);
    const temp = nullableIn(e.k, -200, 200);
    const o2 = nullableIn(e.o, 0, 100);
    const gapSince = e.g === undefined ? -1 : intIn(e.g, 0, Number.MAX_SAFE_INTEGER);
    const returns = e.r === undefined ? 0 : intIn(e.r, 0, Number.MAX_SAFE_INTEGER);
    if (tick === null || years === null || tile === null || biome === null ||
      temp === false || o2 === false || gapSince === null || returns === null) return null;
    const rec: FaunaDiscovery = e.a === 1
      ? { tick, years, tile, biome, temp, o2, adopted: true }
      : { tick, years, tile, biome, temp, o2 };
    // Saves from before the `n` flag never re-announce anything.
    return { rec, extinct: e.x === 1, gapSince, returns, announced: e.n !== 1 };
  }

  function writeSlot(s: FaunaSlot): Record<string, number | null> {
    const r = s.rec;
    const out: Record<string, number | null> = { t: r.tick, y: r.years, i: r.tile, b: r.biome, k: r.temp, o: r.o2 };
    if (r.adopted) out.a = 1;
    if (s.extinct) out.x = 1;
    if (s.gapSince >= 0) out.g = s.gapSince;
    if (s.returns > 0) out.r = s.returns;
    if (!s.announced) out.n = 1;
    return out;
  }

  export class FaunaDex {
    static readonly TOTAL = (LIFE_COUNT - 1) * SUBSPECIES_PER_CLASS;

    readonly pending: FaunaEvent[] = [];
    /** Indexed like `WorldState.lifeStageCounts`: `[c * SUBSPECIES_PER_CLASS + stage]`. */
    private readonly slots: (FaunaSlot | null)[] = new Array(LIFE_COUNT * SUBSPECIES_PER_CLASS).fill(null);
    private rev = 0;

    get version(): number {
      return this.rev;
    }

    reset(): void {
      this.slots.fill(null);
      this.pending.length = 0;
      this.rev++;
    }

    step(world: WorldState): void {
      const n = SUBSPECIES_PER_CLASS;
      const counts = world.lifeStageCounts;
      let changed = false;
      for (let c = 1; c < LIFE_COUNT; c++) {
        const groupGone = world.lifeCounts[c] === 0;
        for (let s = 0; s < n; s++) {
          const k = c * n + s;
          const present = counts[k] > 0;
          const slot = this.slots[k];
          if (!slot) {
            if (present) {
              this.discover(world, c as Life, s);
              changed = true;
            }
            continue;
          }
          if (present) {
            if (slot.extinct) {
              slot.extinct = false;
              slot.returns++;
              changed = true;
            }
            slot.gapSince = -1;
            continue;
          }
          if (slot.gapSince < 0) slot.gapSince = world.ticks;
          if (!slot.extinct && (groupGone || stageGone(world, c as Life, s) || world.ticks - slot.gapSince >= FAUNA_EXTINCT_GRACE)) {
            slot.extinct = true;
            changed = true;
          }
        }
      }
      if (changed) this.rev++;
    }

    /**
     * A higher stage can only descend from the lower ones, so any still
     * missing below it are entered first. In play that happens only after
     * an adoption; those stages are absent right now, hence extinct.
     */
    private discover(world: WorldState, c: Life, stage: number): void {
      const base = c * SUBSPECIES_PER_CLASS;
      for (let s = 0; s < stage; s++) {
        if (this.slots[base + s]) continue;
        this.slots[base + s] = {
          rec: { tick: world.ticks, years: world.absoluteYears, tile: -1, biome: -1, temp: null, o2: world.o2 },
          extinct: true, gapSince: world.ticks, returns: 0, announced: false,
        };
        this.pending.push({ c, stage: s, tick: world.ticks });
      }
      const tile = FaunaDex.findTile(world, c, stage);
      this.slots[base + stage] = {
        rec: {
          tick: world.ticks,
          years: world.absoluteYears,
          tile,
          biome: tile >= 0 ? world.biome[tile] : -1,
          temp: tile >= 0 ? world.temperature[tile] : null,
          o2: world.o2,
        },
        extinct: false, gapSince: -1, returns: 0, announced: false,
      };
      this.pending.push({ c, stage, tick: world.ticks });
    }

    adoptLiving(world: WorldState): void {
      const n = SUBSPECIES_PER_CLASS;
      // Counted here from the tiles: right after loading, the derived
      // counters may still describe the previous planet.
      const living = new Uint32Array(LIFE_COUNT * n);
      for (let i = 0; i < TILE_COUNT; i++) {
        const base = i * LIFE_COUNT;
        for (let c = 1; c < LIFE_COUNT; c++) {
          if (world.lifeDensity[base + c] <= 0) continue;
          const s = world.lifeStage[base + c];
          if (s < n) living[c * n + s]++;
        }
      }
      let changed = false;
      for (let c = 1; c < LIFE_COUNT; c++) {
        let highest = -1;
        for (let s = n - 1; s >= 0 && highest < 0; s--) if (living[c * n + s] > 0) highest = s;
        if (highest < 0 && world.lifeFirstSeen[c] >= 0) highest = 0;
        for (let s = 0; s <= highest; s++) {
          const k = c * n + s;
          if (this.slots[k]) continue;
          const gone = living[k] === 0;
          this.slots[k] = {
            rec: { tick: world.ticks, years: world.absoluteYears, tile: -1, biome: -1, temp: null, o2: null, adopted: true },
            extinct: gone, gapSince: gone ? world.ticks : -1, returns: 0, announced: true,
          };
          changed = true;
        }
      }
      if (changed) this.rev++;
    }

    private slot(c: Life, stage: number): FaunaSlot | null {
      if (!(c >= 1 && c < LIFE_COUNT && stage >= 0 && stage < SUBSPECIES_PER_CLASS)) return null;
      return this.slots[c * SUBSPECIES_PER_CLASS + stage] ?? null;
    }

    discovery(c: Life, stage: number): FaunaDiscovery | null {
      return this.slot(c, stage)?.rec ?? null;
    }

    isDiscovered(c: Life, stage: number): boolean {
      return this.slot(c, stage) !== null;
    }

    status(c: Life, stage: number): FaunaStatus {
      const s = this.slot(c, stage);
      return !s ? 'unknown' : s.extinct ? 'extinct' : 'living';
    }

    returns(c: Life, stage: number): number {
      return this.slot(c, stage)?.returns ?? 0;
    }

    markAnnounced(events: readonly FaunaRef[]): void {
      for (const e of events) {
        const s = this.slot(e.c, e.stage);
        if (s) s.announced = true;
      }
    }

    /** Discoveries whose notice never showed (e.g. saved while it waited), in discovery order. */
    unannounced(): FaunaEvent[] {
      const out: FaunaEvent[] = [];
      for (let k = 0; k < this.slots.length; k++) {
        const s = this.slots[k];
        if (s && !s.announced) out.push({ c: Math.floor(k / SUBSPECIES_PER_CLASS) as Life, stage: k % SUBSPECIES_PER_CLASS, tick: s.rec.tick });
      }
      return out.sort((a, b) => a.tick - b.tick);
    }

    discoveredCount(c?: Life): number {
      const n = SUBSPECIES_PER_CLASS;
      if (c !== undefined && !(c >= 1 && c < LIFE_COUNT)) return 0;
      const from = c === undefined ? n : c * n;
      const to = c === undefined ? LIFE_COUNT * n : from + n;
      let count = 0;
      for (let k = from; k < to; k++) if (this.slots[k]) count++;
      return count;
    }

    /** Ties go to the lowest tile index, so the answer is deterministic. */
    static findTile(world: WorldState, c: Life, stage: number): number {
      let best = -1;
      let bestDensity = 0;
      for (let i = 0; i < TILE_COUNT; i++) {
        const li = i * LIFE_COUNT + c;
        const d = world.lifeDensity[li];
        if (d > bestDensity && world.lifeStage[li] === stage) {
          best = i;
          bestDensity = d;
        }
      }
      return best;
    }

    toJSON(): unknown {
      const entries: Record<string, (Record<string, number | null> | null)[]> = {};
      for (let c = 1; c < LIFE_COUNT; c++) {
        const row: (Record<string, number | null> | null)[] = [];
        for (let s = 0; s < SUBSPECIES_PER_CLASS; s++) {
          const slot = this.slots[c * SUBSPECIES_PER_CLASS + s];
          row.push(slot ? writeSlot(slot) : null);
        }
        while (row.length > 0 && row[row.length - 1] === null) row.pop();
        if (row.length > 0) entries[LIFE[c as Life].id] = row;
      }
      return { v: FAUNA_SAVE_VERSION, entries };
    }

    static fromJSON(raw: unknown): FaunaDex | null {
      try {
        if (!isRecord(raw) || raw.v !== FAUNA_SAVE_VERSION || !isRecord(raw.entries)) return null;
        const entries = raw.entries;
        const dex = new FaunaDex();
        for (const id of Object.keys(entries)) {
          const c = FAUNA_CLASS_BY_ID.get(id);
          const row = entries[id];
          if (c === undefined || !Array.isArray(row)) continue;
          const len = Math.min(row.length, SUBSPECIES_PER_CLASS);
          for (let s = 0; s < len; s++) dex.slots[c * SUBSPECIES_PER_CLASS + s] = readSlot(row[s]);
        }
        return dex;
      } catch {
        return null;
      }
    }

    copyFrom(o: FaunaDex): void {
      for (let k = 0; k < this.slots.length; k++) {
        const s = o.slots[k];
        this.slots[k] = s ? { ...s } : null;
      }
      this.pending.length = 0;
      this.rev++;
    }
  }
}
