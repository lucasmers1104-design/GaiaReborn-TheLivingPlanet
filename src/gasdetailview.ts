/* =============================================================================
 * Gaia Reborn — a line of the gas balance by group
 * -----------------------------------------------------------------------------
 * The info button beside a line of the gas balance whose share the model
 * sums by group (the animals' breath, the plants, photosynthesis, the sea
 * behind O₂'s exchange), and the panel it opens beside the balance: who made
 * how much and which part of it, how the share was split, and for the sea
 * what flowed into it in that tick (gasbalance.ts groupView). The same rules
 * as the balance (BalanceToggle): hover and focus open, a click holds, the
 * pointer may cross over, focus inside keeps it, one at a time, Escape
 * closes it before the balance. The panel sits inside the balance's DOM, so
 * going into it never leaves the balance; it shows in the top layer beside
 * it. Built once per line; a refresh rewrites texts and keeps the order of
 * its rows, its place and the focus. Position and size are inline.
 * ========================================================================== */

namespace SE {
  const EDGE = 8;
  const GAP = 10;
  const DETAIL_W = 300;
  /** The side caret's height (css/gasbalance.css). */
  const CARET_H = 14;

  interface Row {
    readonly row: HTMLElement;
    readonly label: HTMLElement;
    readonly share: HTMLElement;
    readonly value: HTMLElement;
  }

  interface Detail {
    readonly key: string;
    readonly gas: GasId;
    readonly id: GasProcess;
    readonly button: HTMLButtonElement;
    readonly pop: HTMLElement;
    readonly head: HTMLElement;
    readonly body: HTMLElement;
    readonly title: HTMLElement;
    readonly sub: HTMLElement;
    readonly seaText: HTMLElement;
    readonly listHead: HTMLElement;
    readonly list: HTMLElement;
    /** Rows by group, in the order they had when the panel opened. */
    readonly rows: Map<string, Row>;
    readonly sum: Row;
    readonly empty: HTMLElement;
    readonly note: HTMLElement;
    /** The tick the panel shows. */
    shown: string;
  }

  function setText(el: HTMLElement, text: string): void {
    if (el.textContent !== text) el.textContent = text;
  }

  /** A group with an icon shows only the icon, its name as the hover title; one without keeps its name as text. */
  function setLabel(el: HTMLElement, l: GroupLine): void {
    if (!l.icon) {
      if (el.dataset.icon) {
        delete el.dataset.icon;
        el.removeAttribute('title');
        el.removeAttribute('aria-label');
      }
      setText(el, l.label);
      return;
    }
    if (el.dataset.icon !== l.key) {
      el.textContent = '';
      el.appendChild(pixelArt(artSvg(l.icon.art, l.icon.look), 18, 'gas-group-icon'));
      el.dataset.icon = l.key;
    }
    el.title = l.label;
    el.setAttribute('aria-label', l.label);
  }

  function row(label: string): Row {
    const r = make('div', 'gas-detail-row');
    const l = make('span', 'gas-pop-label', label);
    const share = make('span', 'gas-detail-share');
    const value = make('span', 'gas-pop-num');
    r.append(l, share, value);
    return { row: r, label: l, share, value };
  }

  const shareText = (s: number): string => (s >= 0.995 ? '100 %' : s >= 0.01 ? `${fmt.int(s * 100)} %` : '<1 %');

  export class GasDetailView {
    private readonly toggle = new BalanceToggle<string>();
    private readonly details = new Map<string, Detail>();
    private ledger: GasLedger | null = null;
    private shownKey: string | null = null;
    private timer = 0;
    /** Left of the balance (else right of it), and where the panel hangs: its near edge and its button's middle. */
    private left = true;
    private anchor = { x: 0, y: 0 };

    /** `infoSign` makes an info sign drawn like the balance's own. */
    constructor(private readonly infoSign: () => HTMLCanvasElement) {
      document.addEventListener('pointerdown', (e) => {
        const d = this.shownKey ? this.details.get(this.shownKey) : undefined;
        if (!d || (e.target instanceof Node && this.inDetail(d, e.target))) return;
        this.toggle.pressOutside();
        this.sync();
      }, true);
    }

    get isOpen(): boolean {
      return this.shownKey !== null;
    }

    close(): void {
      if (!this.shownKey) return;
      this.toggle.close();
      this.sync();
    }

    /** The info button for process `id` of `gas` on one balance line (`key` names that line) and right after it its panel. */
    mount(gas: GasId, id: GasProcess, key: string): [HTMLButtonElement, HTMLElement] {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gas-info';
      button.hidden = true;
      button.appendChild(this.infoSign());
      const pop = make('div', 'gas-pop gas-detail');
      pop.id = `gas-detail-${key.replace(/[^a-z0-9]+/gi, '-')}`;
      pop.tabIndex = -1;
      pop.setAttribute('role', 'dialog');
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-controls', pop.id);
      button.setAttribute('aria-expanded', 'false');
      if (typeof pop.showPopover === 'function') pop.setAttribute('popover', 'manual');
      else pop.hidden = true;
      Object.assign(pop.style, { position: 'fixed', inset: 'auto', margin: '0', left: '0px', top: '0px', width: `${DETAIL_W}px`, boxSizing: 'border-box', overflow: 'visible', zIndex: '660' });

      const head = make('div', 'gas-pop-head');
      const title = make('div', 'gas-pop-title');
      title.id = `${pop.id}-title`;
      pop.setAttribute('aria-labelledby', title.id);
      const sub = make('div', 'gas-pop-sub');
      head.append(title, sub);
      const body = make('div', 'gas-pop-body');
      body.style.overflowY = 'auto';
      const seaText = make('p', 'gas-detail-sea');
      const listHead = make('div', 'gas-pop-h');
      const list = make('div', 'gas-pop-list');
      const sum = row('Summe');
      sum.row.classList.add('gas-detail-sum');
      const empty = make('p', 'gas-pop-empty', 'In diesem Schritt hat keine Gruppe beigetragen.');
      const note = make('p', 'gas-pop-note');
      body.append(seaText, listHead, list, sum.row, empty, note);
      pop.append(head, body);

      const d: Detail = { key, gas, id, button, pop, head, body, title, sub, seaText, listHead, list, rows: new Map(), sum, empty, note, shown: '' };
      this.details.set(key, d);
      this.wire(d);
      return [button, pop];
    }

    /** New simulation data: which lines have groups, and the open panel; nothing is rebuilt. */
    update(ledger: GasLedger): void {
      this.ledger = ledger;
      for (const d of this.details.values()) {
        const has = hasGroups(ledger, d.gas, d.id);
        if (d.button.hidden === has) d.button.hidden = !has;
        const label = `${balanceLabel(d.gas, d.id, ledger.last?.[d.gas].parts[d.id] ?? 0)}: nach Gruppen anzeigen`;
        if (d.button.getAttribute('aria-label') !== label) d.button.setAttribute('aria-label', label);
      }
      const open = this.shownKey ? this.details.get(this.shownKey) : undefined;
      if (!open) return;
      if (open.button.hidden || open.button.closest('[hidden]')) {
        // Its line left the balance.
        this.close();
        return;
      }
      if (this.fill(open, false)) this.place(false);
    }

    private wire(d: Detail): void {
      const { key, button, pop } = d;
      const now = (): number => performance.now();
      button.addEventListener('pointerenter', () => { this.toggle.enterNumber(key); this.sync(); });
      button.addEventListener('pointerleave', () => { this.toggle.leave(now()); this.sync(); });
      button.addEventListener('focus', () => { this.toggle.focusNumber(key); this.sync(); });
      button.addEventListener('blur', (e) => { this.toggle.blur(this.inDetail(d, e.relatedTarget)); this.sync(); });
      button.addEventListener('click', () => { this.toggle.click(key); this.sync(); });
      pop.addEventListener('pointerenter', () => { this.toggle.enterBalance(); this.sync(); });
      pop.addEventListener('pointerleave', () => { this.toggle.leave(now()); this.sync(); });
      pop.addEventListener('focusin', () => { this.toggle.focusBalance(); });
      pop.addEventListener('focusout', (e) => { this.toggle.blur(this.inDetail(d, e.relatedTarget)); this.sync(); });
      // Escape closes the panel first; the balance it sits in hears it only when no panel is open.
      const escape = (e: KeyboardEvent): void => {
        if (e.key !== 'Escape' || this.shownKey !== key) return;
        e.preventDefault();
        e.stopPropagation();
        const refocus = this.toggle.escape(pop.contains(document.activeElement));
        if (refocus) button.focus({ preventScroll: true });
        this.sync();
      };
      button.addEventListener('keydown', escape);
      pop.addEventListener('keydown', escape);
    }

    private inDetail(d: Detail, t: EventTarget | null): boolean {
      return t instanceof Node && (d.button.contains(t) || d.pop.contains(t));
    }

    private sync(): void {
      const want = this.toggle.open;
      if (this.shownKey && this.shownKey !== want) this.hide(this.shownKey);
      if (want && this.shownKey !== want) this.show(want);
      for (const d of this.details.values()) {
        const open = d.key === want;
        if (d.button.getAttribute('aria-expanded') !== String(open)) d.button.setAttribute('aria-expanded', String(open));
        d.button.classList.toggle('held', open && this.toggle.pinned);
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

    private show(key: string): void {
      const d = this.details.get(key);
      if (!d) return;
      this.shownKey = key;
      d.shown = '';
      this.fill(d, true);
      if (d.pop.hasAttribute('popover')) d.pop.showPopover();
      else d.pop.hidden = false;
      this.place(true);
    }

    private hide(key: string): void {
      const d = this.details.get(key);
      this.shownKey = null;
      if (!d) return;
      if (d.pop.hasAttribute('popover')) {
        if (d.pop.matches(':popover-open')) d.pop.hidePopover();
      } else {
        d.pop.hidden = true;
      }
    }

    /**
     * Beside the balance, left of it where there is room, at the height of its
     * button, inside the viewport. `follow` takes the button's place anew
     * (on opening); a refresh keeps where the panel hangs.
     */
    private place(follow: boolean): void {
      const d = this.shownKey ? this.details.get(this.shownKey) : undefined;
      if (!d) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      d.pop.style.width = `${Math.min(DETAIL_W, vw - 2 * EDGE)}px`;
      d.body.style.maxHeight = `${Math.max(60, vh - 2 * EDGE - d.head.offsetHeight - 4)}px`;
      const r = d.button.getBoundingClientRect();
      const balance = d.pop.parentElement?.closest('.gas-pop');
      const b = balance ? balance.getBoundingClientRect() : r;
      const w = d.pop.offsetWidth;
      const h = d.pop.offsetHeight;
      if (follow) {
        this.left = b.left - GAP - w >= EDGE || b.right + GAP + w > vw - EDGE;
        this.anchor = { x: this.left ? b.left - GAP : b.right + GAP, y: r.top + r.height / 2 };
      }
      const left = Math.round(clamp(this.left ? this.anchor.x - w : this.anchor.x, EDGE, Math.max(EDGE, vw - w - EDGE)));
      const top = Math.round(clamp(this.anchor.y - 24, EDGE, Math.max(EDGE, vh - h - EDGE)));
      d.pop.style.left = `${left}px`;
      d.pop.style.top = `${top}px`;
      d.pop.dataset.side = this.left ? 'left' : 'right';
      d.pop.style.setProperty('--caret-y', `${Math.round(clamp(this.anchor.y - top - CARET_H / 2, 6, h - CARET_H - 6))}px`);
    }

    /** Rewrites the open panel when its tick changed; `fresh` (on opening) also orders its rows anew. True when it did. */
    private fill(d: Detail, fresh: boolean): boolean {
      const v = this.ledger ? groupView(this.ledger, d.gas, d.id) : null;
      const shown = v ? String(v.tick) : '-';
      if (shown === d.shown) return false;
      d.shown = shown;
      const names = GAS_NAMES[d.gas];
      const total = v ? v.total : 0;
      setText(d.title, `${balanceLabel(d.gas, d.id, total)} · ${fmtChange(total)} ${names.unit}`);
      setText(d.sub, v ? `${names.name} (${names.formula}) · Schritt ${fmt.int(v.tick)}` : `${names.name} (${names.formula})`);
      const sea = v?.sea ?? null;
      d.seaText.hidden = !sea;
      if (sea) {
        setText(d.seaText, `Im Meer gelöst: ${fmt.int(sea.level)} % der heutigen Sättigung; zur jetzigen Luft passen ${fmt.int(sea.saturated)} %. ${total > 0 ? 'Den Überschuss gibt das Meer an die Luft ab.' : 'Die Differenz nimmt das Meer aus der Luft auf.'}`);
      }
      setText(d.listHead, sea ? 'In diesem Schritt ins Meer' : 'Nach Gruppen');
      const lines = v ? v.lines : [];
      const seen = new Set<string>();
      for (const l of lines) {
        let r = d.rows.get(l.key);
        if (!r) {
          r = row('');
          d.rows.set(l.key, r);
          d.list.appendChild(r.row);
        } else if (fresh) {
          d.list.appendChild(r.row);
        }
        seen.add(l.key);
        r.row.hidden = false;
        setLabel(r.label, l);
        setText(r.share, sea ? '' : shareText(l.share));
        setText(r.value, `${fmtChange(l.value)} ${names.unit}`);
      }
      for (const [k, r] of d.rows) if (!seen.has(k)) r.row.hidden = true;
      d.listHead.hidden = lines.length === 0;
      d.empty.hidden = lines.length > 0;
      d.sum.row.hidden = !!sea || lines.length < 2;
      setText(d.sum.value, `${fmtChange(total)} ${names.unit}`);
      d.note.hidden = !v || !v.note;
      setText(d.note, v ? v.note : '');
      return true;
    }
  }
}
