/* =============================================================================
 * Gaia Reborn — the gas balance at its number
 * -----------------------------------------------------------------------------
 * The small signed number of the last tick's change beside O₂ in the air,
 * CO₂ and CH₄ in the window "Luftzusammensetzung", a native button that
 * looks like one (a parchment chip with the info sign, the usual mark of
 * "details here"), and the balance it opens, with a caret pointing at it
 * (gasbalance.ts has its words and rules). The balance sits
 * right after its number in the DOM, so Tab goes from one into the other,
 * and shows in the top layer as a manual popover: never clipped by the
 * window, blocking nothing, kept inside the viewport. Built once per gas; an
 * update rewrites texts and reuses rows, so the window's refresh keeps the
 * open state, the focus and the place. Position and size are inline.
 * ========================================================================== */

namespace SE {
  /** CSS px kept free at the viewport's edges, and between a number and its balance (room for the caret). */
  const EDGE = 8;
  const GAP = 10;
  const BALANCE_W = 320;
  /** The info sign's box, CSS px, and the caret's width (css/gasbalance.css). */
  const INFO_BOX = 18;
  const CARET_W = 14;

  interface Line {
    readonly row: HTMLElement;
    readonly label: HTMLElement;
    readonly value: HTMLElement;
  }

  interface Section {
    readonly box: HTMLElement;
    readonly list: HTMLElement;
    readonly lines: Line[];
  }

  interface Item {
    readonly gas: GasId;
    readonly button: HTMLButtonElement;
    readonly num: HTMLElement;
    readonly pop: HTMLElement;
    readonly head: HTMLElement;
    readonly body: HTMLElement;
    readonly sub: HTMLElement;
    readonly missing: HTMLElement;
    readonly empty: HTMLElement;
    readonly sources: Section;
    readonly sinks: Section;
    readonly sums: HTMLElement;
    readonly sumSources: HTMLElement;
    readonly sumSinks: HTMLElement;
    readonly net: HTMLElement;
    readonly levels: HTMLElement;
    readonly since: HTMLElement;
    /** What the balance shows: the tick it belongs to and the interventions since. */
    shown: string;
  }

  function line(label: string): Line {
    const row = make('div', 'gas-pop-row');
    const l = make('span', 'gas-pop-label', label);
    const value = make('span', 'gas-pop-num');
    row.append(l, value);
    return { row, label: l, value };
  }

  function section(title: string): Section {
    const box = make('div', 'gas-pop-part');
    const list = make('div', 'gas-pop-list');
    box.append(make('div', 'gas-pop-h', title), list);
    return { box, list, lines: [] };
  }

  /** `lines` into the section's rows, reusing them; surplus rows hide. */
  function fillSection(s: Section, lines: readonly BalanceLine[], unit: string): void {
    s.box.hidden = lines.length === 0;
    lines.forEach((l, k) => {
      let row = s.lines[k];
      if (!row) {
        row = line('');
        s.lines.push(row);
        s.list.appendChild(row.row);
      }
      row.row.hidden = false;
      setText(row.label, l.label);
      setText(row.value, `${fmtChange(l.value)} ${unit}`);
    });
    for (let k = lines.length; k < s.lines.length; k++) s.lines[k].row.hidden = true;
  }

  function setText(el: HTMLElement, text: string): void {
    if (el.textContent !== text) el.textContent = text;
  }

  export class GasBalanceView {
    private readonly toggle = new BalanceToggle();
    private readonly items = new Map<GasId, Item>();
    private ledger: GasLedger | null = null;
    /** The balance on screen, which follows `toggle.open` in sync(). */
    private shownGas: GasId | null = null;
    /** Above its number instead of below: chosen when it opens, kept while it fits. */
    private above = false;
    /** Where the balance hangs, CSS px: its right edge and the line it starts from (below) or ends at (above). */
    private anchor = { right: 0, y: 0 };
    private timer = 0;
    private seen: IntersectionObserver | null = null;
    private readonly icons: PixelCanvas[] = [];
    private iconsArt = '';

    /** `onOpen`: a balance has just opened (the window hides its hover tip). */
    constructor(private readonly onOpen: () => void) {
      // Capture: a press that some control stops still closes the balance.
      document.addEventListener('pointerdown', (e) => {
        if (!this.shownGas || (e.target instanceof Node && this.within(e.target))) return;
        this.toggle.pressOutside();
        this.sync();
      }, true);
      window.addEventListener('resize', () => {
        if (!this.shownGas) return;
        this.toggle.close();
        this.sync();
      });
      // The window body scrolls: the balance follows its number.
      document.addEventListener('scroll', () => { if (this.shownGas) this.place(true); }, true);
    }

    get isOpen(): boolean {
      return this.shownGas !== null;
    }

    /** Closes the open balance, e.g. before its number moves to another row. */
    close(): void {
      if (!this.shownGas) return;
      this.toggle.close();
      this.sync();
    }

    /** A still copy of a number with its info sign, for the window's legend. */
    legendChip(text: string): HTMLElement {
      const chip = make('span', 'gas-delta gas-delta-sample');
      chip.setAttribute('aria-hidden', 'true');
      chip.append(make('span', 'gas-delta-num', text), this.infoSign());
      return chip;
    }

    private infoSign(): HTMLCanvasElement {
      const pc = new PixelCanvas('gas-delta-info', 0);
      pc.canvas.style.position = 'static';
      this.icons.push(pc);
      return pc.canvas;
    }

    /** The number of `gas` and, right after it, its balance (hidden), for the caller to append in this order. */
    mount(gas: GasId): [HTMLButtonElement, HTMLElement] {
      const names = GAS_NAMES[gas];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gas-delta';
      const num = make('span', 'gas-delta-num', '—');
      button.append(num, this.infoSign());
      const pop = make('div', 'gas-pop');
      pop.id = `gas-pop-${gas}`;
      pop.tabIndex = -1;
      pop.setAttribute('role', 'dialog');
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-controls', pop.id);
      button.setAttribute('aria-expanded', 'false');
      if (typeof pop.showPopover === 'function') pop.setAttribute('popover', 'manual');
      else pop.hidden = true;
      // The body scrolls, not the balance: its caret stands out over the edge.
      Object.assign(pop.style, { position: 'fixed', inset: 'auto', margin: '0', left: '0px', top: '0px', width: `${BALANCE_W}px`, boxSizing: 'border-box', overflow: 'visible', zIndex: '650' });

      const head = make('div', 'gas-pop-head');
      const title = make('div', 'gas-pop-title', `${names.name} (${names.formula})`);
      title.id = `${pop.id}-title`;
      pop.setAttribute('aria-labelledby', title.id);
      const sub = make('div', 'gas-pop-sub', 'Letzter abgeschlossener Simulationsschritt');
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'gas-pop-close';
      close.textContent = '×';
      close.setAttribute('aria-label', 'Bilanz schließen');
      head.append(title, sub, close);

      const body = make('div', 'gas-pop-body');
      body.style.overflowY = 'auto';
      const missing = make('p', 'gas-pop-missing', 'Noch keine Bilanz verfügbar');
      const empty = make('p', 'gas-pop-empty', `In diesem Schritt hat kein Prozess den Wert von ${names.formula} verändert.`);
      const sources = section('Quellen');
      const sinks = section('Senken');
      const sums = make('div', 'gas-pop-sums');
      const sumSources = line('Summe der Quellen');
      const sumSinks = line('Summe der Senken');
      const net = line('Nettoänderung');
      net.row.classList.add('gas-pop-net');
      sums.append(sumSources.row, sumSinks.row, net.row);
      const levels = make('p', 'gas-pop-levels');
      const since = make('p', 'gas-pop-since');
      body.append(missing, empty, sources.box, sinks.box, sums, levels);
      if (gas === 'o2') {
        body.append(
          make('p', 'gas-pop-note', 'Pp. = Prozentpunkte: die absolute Änderung des Sauerstoffanteils der Luft, keine relative Änderung.'),
          make('p', 'gas-pop-note', 'Meeresalgen und Cyanobakterien geben ihren Sauerstoff zuerst ins Meer, wo gelöstes Eisen einen Teil bindet. Die Luft erreicht er nur über den Austausch mit dem Meer.'),
        );
      }
      body.appendChild(since);
      pop.append(head, body);

      const item: Item = {
        gas, button, num, pop, head, body, sub, missing, empty, sources, sinks, sums,
        sumSources: sumSources.value, sumSinks: sumSinks.value, net: net.value, levels, since, shown: '',
      };
      this.items.set(gas, item);
      this.wire(item, close);
      this.updateNumber(item);
      return [button, pop];
    }

    /** New simulation data, with the window's refresh: the numbers and the open balance; nothing is rebuilt. */
    update(ledger: GasLedger): void {
      this.ledger = ledger;
      const ui = UiArt.shared();
      const art = `${ui.version}|${window.devicePixelRatio || 1}`;
      if (ui.ready && art !== this.iconsArt) {
        this.iconsArt = art;
        for (const pc of this.icons) drawUiIcon(pc, 'air_info', INFO_BOX);
      }
      for (const item of this.items.values()) this.updateNumber(item);
      const open = this.shownGas ? this.items.get(this.shownGas) : undefined;
      if (open && this.fill(open)) this.place(false);
    }

    private wire(item: Item, close: HTMLButtonElement): void {
      const { gas, button, pop } = item;
      const now = (): number => performance.now();
      button.addEventListener('pointerenter', () => { this.toggle.enterNumber(gas); this.sync(); });
      button.addEventListener('pointerleave', () => { this.toggle.leave(now()); this.sync(); });
      button.addEventListener('focus', () => { this.toggle.focusNumber(gas); this.sync(); });
      button.addEventListener('blur', (e) => { this.toggle.blur(this.inItem(item, e.relatedTarget)); this.sync(); });
      button.addEventListener('click', () => { this.toggle.click(gas); this.sync(); });
      pop.addEventListener('pointerenter', () => { this.toggle.enterBalance(); this.sync(); });
      pop.addEventListener('pointerleave', () => { this.toggle.leave(now()); this.sync(); });
      pop.addEventListener('focusin', () => { this.toggle.focusBalance(); });
      pop.addEventListener('focusout', (e) => { this.toggle.blur(this.inItem(item, e.relatedTarget)); this.sync(); });
      const escape = (e: KeyboardEvent): void => {
        if (e.key !== 'Escape' || this.shownGas !== gas) return;
        e.preventDefault();
        e.stopPropagation();
        this.dismiss(item);
      };
      button.addEventListener('keydown', escape);
      pop.addEventListener('keydown', escape);
      close.addEventListener('click', () => this.dismiss(item));
    }

    /** Escape or the close button: closed, and focus that was inside goes back to the number without reopening it. */
    private dismiss(item: Item): void {
      const inside = item.pop.contains(document.activeElement);
      const refocus = this.toggle.escape(inside);
      if (refocus) item.button.focus({ preventScroll: true });
      this.sync();
    }

    private inItem(item: Item, t: EventTarget | null): boolean {
      return t instanceof Node && (item.button.contains(t) || item.pop.contains(t));
    }

    private within(t: Node): boolean {
      for (const item of this.items.values()) if (this.inItem(item, t)) return true;
      return false;
    }

    /** The DOM after the toggle's state: one balance at most, the hover wait as a timer. */
    private sync(): void {
      const want = this.toggle.open;
      if (this.shownGas && this.shownGas !== want) this.hide(this.shownGas);
      if (want && this.shownGas !== want) this.show(want);
      for (const item of this.items.values()) {
        const open = item.gas === want;
        if (item.button.getAttribute('aria-expanded') !== String(open)) item.button.setAttribute('aria-expanded', String(open));
        item.button.classList.toggle('held', open && this.toggle.pinned);
      }
      clearTimeout(this.timer);
      this.timer = 0;
      if (this.toggle.closeAt) {
        this.timer = window.setTimeout(() => {
          this.toggle.tick(performance.now());
          this.sync();
        }, Math.max(0, this.toggle.closeAt - performance.now()) + 5);
      }
    }

    private show(gas: GasId): void {
      const item = this.items.get(gas);
      if (!item) return;
      this.shownGas = gas;
      item.shown = '';
      this.fill(item);
      if (item.pop.hasAttribute('popover')) item.pop.showPopover();
      else item.pop.hidden = false;
      this.above = false;
      this.place(true, true);
      this.seen ??= new IntersectionObserver((entries) => {
        // Its number scrolled away or its window closed: the balance goes with it.
        if (entries.some((en) => !en.isIntersecting && this.shownGas && en.target === this.items.get(this.shownGas)?.button)) {
          this.toggle.close();
          this.sync();
        }
      });
      this.seen.observe(item.button);
      this.onOpen();
    }

    private hide(gas: GasId): void {
      const item = this.items.get(gas);
      this.shownGas = null;
      if (!item) return;
      this.seen?.unobserve(item.button);
      if (item.pop.hasAttribute('popover')) {
        if (item.pop.matches(':popover-open')) item.pop.hidePopover();
      } else {
        item.pop.hidden = true;
      }
    }

    /**
     * At its number, right-aligned with it, below (or above where there is no
     * room), inside the viewport. `follow` takes the number's place anew (on
     * opening, on scrolling); a refresh keeps where it hangs, so a number
     * that grows a digit moves nothing.
     */
    private place(follow: boolean, fresh = false): void {
      const item = this.shownGas ? this.items.get(this.shownGas) : undefined;
      if (!item) return;
      const pop = item.pop;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      pop.style.width = `${Math.min(BALANCE_W, vw - 2 * EDGE)}px`;
      item.body.style.maxHeight = `${Math.max(60, vh - 2 * EDGE - item.head.offsetHeight - 4)}px`;
      const r = item.button.getBoundingClientRect();
      const w = pop.offsetWidth;
      const h = pop.offsetHeight;
      if (follow) {
        const fitsBelow = r.bottom + GAP + h <= vh - EDGE;
        const fitsAbove = r.top - GAP - h >= EDGE;
        if (fresh) this.above = !fitsBelow && fitsAbove;
        else if (this.above ? !fitsAbove && fitsBelow : !fitsBelow && fitsAbove) this.above = !this.above;
        this.anchor = { right: r.right, y: this.above ? r.top - GAP : r.bottom + GAP };
      }
      const top = this.above ? this.anchor.y - h : this.anchor.y;
      const left = Math.round(clamp(this.anchor.right - w, EDGE, Math.max(EDGE, vw - w - EDGE)));
      pop.style.left = `${left}px`;
      pop.style.top = `${Math.round(clamp(top, EDGE, Math.max(EDGE, vh - h - EDGE)))}px`;
      // The caret points at the middle of the number, wherever the edges pushed the balance.
      pop.dataset.side = this.above ? 'above' : 'below';
      pop.style.setProperty('--caret-x', `${Math.round(clamp(r.left + r.width / 2 - left - CARET_W / 2, 6, w - CARET_W - 6))}px`);
    }

    private updateNumber(item: Item): void {
      const names = GAS_NAMES[item.gas];
      const b = this.ledger?.last?.[item.gas];
      const text = b ? fmtChange(b.end - b.start) : '—';
      setText(item.num, text);
      const label = b
        ? `${names.formula}, Δ letzter Simulationsschritt: ${text} ${names.unit}. Bilanz anzeigen`
        : `${names.formula}: Noch keine Bilanz verfügbar`;
      if (item.button.getAttribute('aria-label') !== label) item.button.setAttribute('aria-label', label);
    }

    /** Rewrites the open balance when its tick or the interventions since changed; true when it did. */
    private fill(item: Item): boolean {
      const v = this.ledger ? balanceView(this.ledger, item.gas) : null;
      const shown = v ? `${v.tick}|${v.since}` : '-';
      if (shown === item.shown) return false;
      item.shown = shown;
      const names = GAS_NAMES[item.gas];
      item.missing.hidden = v !== null;
      setText(item.sub, v ? `Letzter abgeschlossener Simulationsschritt · Schritt ${fmt.int(v.tick)}` : 'Letzter abgeschlossener Simulationsschritt');
      const parts = v ? v.sources.length + v.sinks.length : 0;
      item.empty.hidden = !v || parts > 0;
      fillSection(item.sources, v ? v.sources : [], names.unit);
      fillSection(item.sinks, v ? v.sinks : [], names.unit);
      item.sums.hidden = !v || parts === 0;
      item.levels.hidden = !v;
      item.since.hidden = !v || v.since === 0;
      if (!v) return true;
      setText(item.sumSources, `${fmtChange(v.sumSources)} ${names.unit}`);
      setText(item.sumSinks, `${fmtChange(v.sumSinks)} ${names.unit}`);
      setText(item.net, `${fmtChange(v.net)} ${names.unit}`);
      const base = item.gas === 'o2' ? 2 : 1;
      setText(item.levels, `Zu Beginn ${fmtLevel(v.start, v.net, base)} ${names.level}, am Ende ${fmtLevel(v.end, v.net, base)} ${names.level}`);
      if (v.since !== 0) {
        setText(item.since, `Seit diesem Schritt durch einen Eingriff verändert: ${fmtChange(v.since)} ${names.unit}. Der aktuelle Wert weicht deshalb vom Ende dieses Schritts ab.`);
      }
      return true;
    }
  }
}
