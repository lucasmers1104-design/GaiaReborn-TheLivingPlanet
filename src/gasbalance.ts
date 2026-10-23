/* =============================================================================
 * Gaia Reborn — what the air window says about a gas balance
 * -----------------------------------------------------------------------------
 * The last tick's balance of O₂, CO₂ or CH₄ (gasbudget.ts) as the window
 * shows it: names of the booked processes, sources and sinks with their
 * sums, the net change and the levels at its start and end, at German
 * precisions that fit their size. And the rules of the number that opens
 * it: hover and focus open, a click holds, the pointer may cross over, focus
 * inside keeps it, one at a time. No DOM (gasbalanceview.ts draws it), so
 * Node tests read the same rules.
 * ========================================================================== */

namespace SE {
  /** Name, formula, unit of a change and unit of a level, per gas. */
  export const GAS_NAMES: Readonly<Record<GasId, { name: string; formula: string; unit: string; level: string }>> = {
    o2: { name: 'Sauerstoff', formula: 'O₂', unit: 'Pp.', level: '%' },
    co2: { name: 'Kohlendioxid', formula: 'CO₂', unit: 'ppm', level: 'ppm' },
    ch4: { name: 'Methan', formula: 'CH₄', unit: 'ppm', level: 'ppm' },
  };

  /** What each booked process is called; 'sea' depends on its direction (balanceLabel). */
  const PROCESS_NAMES: Readonly<Record<GasId, Partial<Record<GasProcess, string>>>> = {
    o2: {
      plants: 'Landpflanzen',
      breath: 'Atmung der Landtiere und Wale',
      fossil: 'Fossile Verbrennung',
      fire: 'Brände',
      oxidation: 'Oxidation von Gestein und toter Biomasse',
      reducing: 'Reduzierende Gase und frisches Gestein',
    },
    co2: {
      volcanism: 'Hintergrundvulkanismus',
      volcano: 'Vulkanausbrüche',
      impact: 'Einschläge',
      fire: 'Brände',
      breath: 'Atmung der Lebewesen',
      cityBreath: 'Atmung der Städte',
      fossil: 'Fossile Verbrennung',
      photosynthesis: 'Photosynthese',
      weathering: 'Verwitterung',
    },
    ch4: {
      archaea: 'Methanbildende Archaeen',
      swamps: 'Sümpfe',
      abiotic: 'Gestein und heiße Quellen',
      civ: 'Zivilisation (Vieh, Reisfelder, Erdgas)',
      decay: 'Abbau in der Luft',
    },
  };

  /** What a group of a share is called (gasbudget.ts GasGroups). */
  export function groupLabel(key: string): string {
    const [kind, n] = key.split(':');
    if (kind === 'life') return LIFE[Number(n) as Life]?.name ?? key;
    if (kind === 'flora') return Number(n) === Flora.None ? 'Pflanzendecke ohne führende Gruppe' : FLORA[Number(n) as Flora]?.name ?? key;
    if (key === 'plankton') return 'Cyanobakterien (Plankton)';
    if (key === 'algae') return 'Meeresalgen';
    if (key === 'iron') return 'Bindung durch gelöstes Eisen';
    return key;
  }

  /** How a process's groups were split, as the window says it. */
  const GROUP_NOTES: Readonly<Record<GasId, Partial<Record<GasProcess, string>>>> = {
    o2: {
      plants: 'Aufgeteilt nach der Pflanzengruppe, die auf jedem Feld die Pflanzendecke trägt; das Modell rechnet mit der ganzen Pflanzendecke an Land.',
      breath: 'Nach der Biomasse jeder Tiergruppe. Meerestiere atmen den Sauerstoff des Meeres, nicht den der Luft; Wale atmen Luft.',
    },
    co2: {
      breath: 'Nach der Biomasse jeder Gruppe, an Land und im Meer; Bakterien zählt das Modell hier nicht.',
      photosynthesis: 'Landpflanzen nach der Gruppe, die auf jedem Feld die Pflanzendecke trägt, dazu Cyanobakterien und Meeresalgen im Meer.',
    },
    ch4: {},
  };

  export interface GroupLine {
    readonly key: string;
    readonly label: string;
    readonly value: number;
    /** Of all lines with the same sign, 0..1. */
    readonly share: number;
  }

  /** One process's share by group, or for O₂'s exchange the sea behind it. */
  export interface GroupView {
    readonly gas: GasId;
    readonly id: GasProcess;
    readonly tick: number;
    /** The process's share, as the balance lists it. */
    readonly total: number;
    readonly lines: readonly GroupLine[];
    readonly note: string;
    /** For 'sea': the sea's level and what the air lets it hold (% of today's saturation). */
    readonly sea: { readonly level: number; readonly saturated: number } | null;
  }

  function groupLines(groups: GasGroups): GroupLine[] {
    let plus = 0;
    let minus = 0;
    for (const v of Object.values(groups)) {
      if (v > 0) plus += v;
      else minus += v;
    }
    return Object.entries(groups)
      .filter(([, v]) => v !== 0)
      .map(([key, value]) => ({ key, label: groupLabel(key), value, share: value > 0 ? value / plus : value / minus }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  }

  /** Whether process `id` of `gas` has groups to show in the last tick's balance. */
  export function hasGroups(ledger: GasLedger, gas: GasId, id: GasProcess): boolean {
    const b = ledger.last;
    if (!b || b[gas].parts[id] === undefined) return false;
    return id === 'sea' && gas === 'o2' ? b.sea !== null : b[gas].groups[id] !== undefined;
  }

  /** The groups of process `id` of `gas` in the last tick, or null while it has none. */
  export function groupView(ledger: GasLedger, gas: GasId, id: GasProcess): GroupView | null {
    const b = ledger.last;
    if (!b || !hasGroups(ledger, gas, id)) return null;
    const total = b[gas].parts[id] ?? 0;
    if (id === 'sea' && b.sea) {
      const giving = total > 0;
      return {
        gas, id, tick: b.tick, total, lines: groupLines(b.sea.flows), sea: { level: b.sea.sea, saturated: b.sea.saturated },
        note: `Diese Mengen änderten in diesem Schritt den Sauerstoff im Meer, nicht die Luft. ${giving ? 'Abgegeben wird' : 'Aufgenommen wird'} er über den Austausch mit der Luft, Schritt für Schritt.`,
      };
    }
    return { gas, id, tick: b.tick, total, lines: groupLines(b[gas].groups[id] ?? {}), sea: null, note: GROUP_NOTES[gas][id] ?? '' };
  }

  export function balanceLabel(gas: GasId, id: GasProcess, v: number): string {
    if (id === 'limit') return 'Modellbegrenzung';
    if (id === 'player') return 'Eingriff';
    if (id === 'sea') return v > 0 ? 'Abgabe aus dem Meer' : 'Aufnahme durch das Meer';
    return PROCESS_NAMES[gas][id] ?? id;
  }

  const NF0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
  const NF1 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const SIG2 = new Intl.NumberFormat('de-DE', { maximumSignificantDigits: 2 });
  const FIXED: Intl.NumberFormat[] = [];

  /** A signed change at a precision that fits its size: exact zero is "0", a change too small to show never reads as zero. */
  export function fmtChange(v: number): string {
    if (v === 0) return '0';
    const a = Math.abs(v);
    const sign = v < 0 ? '−' : '+';
    if (a < 0.0001) return `${sign}<0,0001`;
    return sign + (a >= 100 ? NF0.format(a) : a >= 1 ? NF1.format(a) : SIG2.format(a));
  }

  /** A level with at least `base` decimals, and enough that a start and an end `net` apart differ. */
  export function fmtLevel(v: number, net: number, base: number): string {
    const a = Math.abs(net);
    const dec = a > 0 ? clamp(Math.ceil(-Math.log10(a)) + 1, base, 6) : base;
    const nf = FIXED[dec] ??= new Intl.NumberFormat('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    return nf.format(v);
  }

  export interface BalanceLine {
    readonly id: GasProcess;
    readonly label: string;
    readonly value: number;
  }

  /** One gas's balance as the window lists it. */
  export interface BalanceView {
    readonly gas: GasId;
    readonly tick: number;
    readonly start: number;
    readonly end: number;
    /** End minus start: the actual change. */
    readonly net: number;
    /** Largest first. */
    readonly sources: readonly BalanceLine[];
    readonly sinks: readonly BalanceLine[];
    readonly sumSources: number;
    readonly sumSinks: number;
    /** What the player's actions changed since this tick. */
    readonly since: number;
  }

  /** The last completed tick's balance of `gas`, or null while there is none. */
  export function balanceView(ledger: GasLedger, gas: GasId): BalanceView | null {
    const budget = ledger.last;
    if (!budget) return null;
    const b = budget[gas];
    const lines: BalanceLine[] = [];
    for (const [id, value] of Object.entries(b.parts) as [GasProcess, number][]) {
      if (value) lines.push({ id, label: balanceLabel(gas, id, value), value });
    }
    lines.sort((x, y) => Math.abs(y.value) - Math.abs(x.value));
    const sources = lines.filter((l) => l.value > 0);
    const sinks = lines.filter((l) => l.value < 0);
    return {
      gas, tick: budget.tick, start: b.start, end: b.end, net: b.end - b.start,
      sources, sinks,
      sumSources: sources.reduce((s, l) => s + l.value, 0),
      sumSinks: sinks.reduce((s, l) => s + l.value, 0),
      since: ledger.since[gas],
    };
  }

  /** Ms a hover-opened balance waits after the pointer left its number: time to reach the balance. */
  export const BALANCE_CLOSE_DELAY = 250;

  /**
   * Which gas's balance is open and whether a click holds it. Hover and
   * focus open it; a click holds it, another click on its number, Escape or
   * a press elsewhere close it; the pointer may cross from the number into
   * it; focus inside keeps it; only one is open. A held balance ignores the
   * pointer over another number, focus on one switches to it.
   */
  export class BalanceToggle<K extends string = GasId> {
    open: K | null = null;
    pinned = false;
    /** Page time at which a hover-opened balance closes; 0 for none. */
    closeAt = 0;
    private pointer = false;
    private focus = false;
    /** The number focus goes back to after Escape: that focus must not reopen it. */
    private quiet: K | null = null;

    enterNumber(gas: K): void {
      this.pointer = true;
      this.closeAt = 0;
      if (!this.pinned) this.show(gas);
    }

    enterBalance(): void {
      if (!this.open) return;
      this.pointer = true;
      this.closeAt = 0;
    }

    leave(now: number): void {
      this.pointer = false;
      if (this.open && !this.pinned && !this.focus) this.closeAt = now + BALANCE_CLOSE_DELAY;
    }

    focusNumber(gas: K): void {
      if (this.quiet === gas) {
        this.quiet = null;
        return;
      }
      this.focus = true;
      this.closeAt = 0;
      if (this.open !== gas) this.pinned = false;
      this.show(gas);
    }

    focusBalance(): void {
      if (this.open) this.focus = true;
    }

    /** Focus left the number or its balance; `inside` when it went to the other of the two. */
    blur(inside: boolean): void {
      if (inside) return;
      this.focus = false;
      this.quiet = null;
      if (this.open && !this.pinned && !this.pointer) this.close();
    }

    click(gas: K): void {
      if (this.open === gas && this.pinned) {
        this.close();
        return;
      }
      this.open = gas;
      this.pinned = true;
      this.closeAt = 0;
    }

    /** Closes; with focus inside the balance, returns the gas whose number gets it back without reopening. */
    escape(focusInBalance: boolean): K | null {
      const refocus = focusInBalance ? this.open : null;
      this.close();
      this.quiet = refocus;
      return refocus;
    }

    pressOutside(): void {
      this.close();
    }

    /** Closes a hover-opened balance whose wait ran out. */
    tick(now: number): void {
      if (this.closeAt && now >= this.closeAt) this.close();
    }

    close(): void {
      this.open = null;
      this.pinned = false;
      this.closeAt = 0;
    }

    private show(gas: K): void {
      if (this.open === gas) return;
      this.open = gas;
    }
  }
}
