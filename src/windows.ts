/* =============================================================================
 * SimEarth 2.0 — window manager and menu bar
 * -----------------------------------------------------------------------------
 * The original's desktop of overlapping windows and its pull-down menu bar
 * are kept — they are much of what makes the game recognisable — but as
 * glass panels that stay on screen at any size, close with a proper target,
 * stack predictably however long the session runs, and work from the
 * keyboard. On a phone every window becomes a full-width sheet.
 * ========================================================================== */

namespace SE {
  export interface WindowOptions {
    readonly id: string;
    readonly title: string;
    readonly icon: string;
    /** Default geometry as fractions-or-pixels of the stage; see place(). */
    readonly width: number;
    readonly height: number;
    readonly x: number;
    readonly y: number;
    /** Extra class on the window root (e.g. 'win-tree'). */
    readonly cls?: string;
    /** A fixed side panel or mobile sheet, without free dragging. */
    readonly docked?: boolean;
    /** Called whenever the window is shown. */
    readonly onShow?: () => void;
    /** Opens at its default place every time, wherever the player left it. */
    readonly resetOnOpen?: boolean;
  }

  /** Below this stage width windows become full-width sheets. */
  export const NARROW_PX = 760;

  export class SimWindow {
    readonly id: string;
    readonly root: HTMLDivElement;
    readonly body: HTMLDivElement;
    readonly head: HTMLDivElement;
    private readonly titleText: HTMLHeadingElement;
    private manager: WindowManager | null = null;
    /** Set once the player has moved or resized it; layout resets clear it. */
    userPlaced = false;
    private pressed = false;

    constructor(readonly opts: WindowOptions) {
      this.id = opts.id;
      this.root = make('div', `win glass hidden${opts.cls ? ` ${opts.cls}` : ''}`);
      this.root.dataset.win = opts.id;
      this.root.setAttribute('role', 'dialog');
      this.root.setAttribute('aria-labelledby', `win-title-${opts.id}`);

      this.head = make('div', 'win-head');
      this.head.appendChild(img(opts.icon, 'win-icon'));
      this.titleText = make('h2', 'win-title', opts.title);
      this.titleText.id = `win-title-${opts.id}`;
      this.titleText.tabIndex = -1;
      const close = button({
        label: `${opts.title} schließen`, icon: uiIcon('close'), cls: 'icon-btn win-close', showLabel: false,
        onClick: (e) => { e.stopPropagation(); this.hide(); },
      });
      this.head.append(this.titleText, close);

      this.body = make('div', 'win-body');
      this.root.append(this.head, this.body);

      this.makeDraggable();
      this.root.addEventListener('pointerdown', () => { this.pressed = true; this.manager?.focus(this); }, true);
      window.addEventListener('pointerup', () => { this.pressed = false; });
      // The native resize corner: only a size change while the player holds
      // the window counts as "the player chose this size".
      new ResizeObserver(() => {
        if (this.visible && this.pressed && this.manager?.dragging !== this) this.manager?.noteResize(this);
      }).observe(this.root);
    }

    attach(manager: WindowManager): void {
      this.manager = manager;
    }

    setTitle(text: string): void {
      if (this.titleText.textContent !== text) this.titleText.textContent = text;
    }

    get visible(): boolean {
      return !this.root.classList.contains('hidden');
    }

    /** Where the focus was when the window opened, to return it on close. */
    private returnFocus: HTMLElement | null = null;

    show(takeFocus = true): void {
      const was = this.visible;
      this.root.classList.remove('hidden');
      this.manager?.focus(this);
      if (!was) {
        if (this.opts.resetOnOpen) this.manager?.place(this, true);
        this.manager?.clamp(this);
        this.root.classList.remove('win-enter');
        void this.root.offsetWidth;
        this.root.classList.add('win-enter');
        if (takeFocus) {
          const active = document.activeElement;
          this.returnFocus = active instanceof HTMLElement && active !== document.body && !this.root.contains(active) ? active : null;
          this.titleText.focus({ preventScroll: true });
        }
      }
      this.opts.onShow?.();
    }

    hide(): void {
      if (!this.visible) return;
      const hadFocus = this.root.contains(document.activeElement);
      this.root.classList.add('hidden');
      this.manager?.onHidden(this);
      if (hadFocus) {
        const back = this.returnFocus && this.returnFocus.isConnected && this.returnFocus.offsetParent !== null
          ? this.returnFocus : document.querySelector<HTMLElement>('.world-canvas');
        back?.focus({ preventScroll: true });
      }
      this.returnFocus = null;
    }

    toggle(): void {
      if (this.visible) this.hide();
      else this.show();
    }

    /** Drag by the header, kept within the stage. Disabled on narrow screens. */
    private makeDraggable(): void {
      let startX = 0;
      let startY = 0;
      let originX = 0;
      let originY = 0;
      let dragging = false;
      const handle = this.head;

      handle.addEventListener('pointerdown', (e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        if (e.button !== 0 || this.manager?.narrow || this.opts.docked) return;
        dragging = true;
        handle.setPointerCapture(e.pointerId);
        startX = e.clientX;
        startY = e.clientY;
        originX = this.root.offsetLeft;
        originY = this.root.offsetTop;
        this.manager?.focus(this);
        if (this.manager) this.manager.dragging = this;
      });
      handle.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        this.root.style.left = `${originX + e.clientX - startX}px`;
        this.root.style.top = `${originY + e.clientY - startY}px`;
        this.manager?.clamp(this);
        this.userPlaced = true;
      });
      const stop = (e: PointerEvent): void => {
        if (!dragging) return;
        dragging = false;
        if (this.manager) this.manager.dragging = null;
        if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
      };
      handle.addEventListener('pointerup', stop);
      handle.addEventListener('pointercancel', stop);
      // Double-click the header to snap back to the default place.
      handle.addEventListener('dblclick', (e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        this.manager?.place(this, true);
      });
    }
  }

  /* -------------------------------------------------------------------------- */

  export class WindowManager {
    private readonly windows = new Map<string, SimWindow>();
    /** Stacking order, back to front. Renumbered on every focus. */
    private readonly order: SimWindow[] = [];
    dragging: SimWindow | null = null;
    /** Called when any window opens or closes, for menu check marks. */
    onChange: (() => void) | null = null;

    constructor(private readonly host: HTMLElement) {
      window.addEventListener('resize', () => this.clampAll());
    }

    get narrow(): boolean {
      return this.host.clientWidth < NARROW_PX;
    }

    create(opts: WindowOptions): SimWindow {
      const win = new SimWindow(opts);
      win.attach(this);
      this.windows.set(opts.id, win);
      this.order.push(win);
      this.host.appendChild(win.root);
      this.place(win, false);
      return win;
    }

    get(id: string): SimWindow | undefined {
      return this.windows.get(id);
    }

    /**
     * Default geometry. Values up to 1 are fractions of the stage, larger
     * values pixels; negative x/y count from the right/bottom edge, negative
     * width/height leave that many pixels of the stage free.
     */
    place(win: SimWindow, reset: boolean): void {
      const o = win.opts;
      const sw = Math.max(320, this.host.clientWidth || 1280);
      const sh = Math.max(320, this.host.clientHeight || 800);
      const dim = (v: number, total: number): number => (v > 0 && v <= 1 ? v * total : v);
      const size = (v: number, total: number): number => (v < 0 ? Math.max(320, total + v) : dim(v, total));
      const w = Math.min(size(o.width, sw), sw - 16);
      const h = Math.min(size(o.height, sh), sh - 16);
      let x = dim(Math.abs(o.x), sw);
      let y = dim(Math.abs(o.y), sh);
      if (o.x < 0) x = sw - w - x;
      if (o.y < 0) y = sh - h - y;
      win.root.style.width = `${Math.round(w)}px`;
      win.root.style.height = `${Math.round(h)}px`;
      win.root.style.left = `${Math.round(x)}px`;
      win.root.style.top = `${Math.round(y)}px`;
      if (reset) win.userPlaced = false;
      this.clamp(win);
    }

    /**
     * Keep a window inside the stage. Its size is capped by CSS (max-width,
     * max-height) rather than overwritten, so it returns to its own size
     * when the browser window grows again.
     */
    clamp(win: SimWindow): void {
      if (this.narrow) return; // sheets are positioned by CSS
      const sw = this.host.clientWidth;
      const sh = this.host.clientHeight;
      if (sw <= 0 || sh <= 0) return;
      const r = win.root;
      const w = Math.min(r.offsetWidth || parseFloat(r.style.width) || 300, sw - 8);
      const h = Math.min(r.offsetHeight || parseFloat(r.style.height) || 200, sh - 8);
      const left = clamp(parseFloat(r.style.left) || 0, 4, Math.max(4, sw - w - 4));
      const top = clamp(parseFloat(r.style.top) || 0, 4, Math.max(4, sh - h - 4));
      r.style.left = `${Math.round(left)}px`;
      r.style.top = `${Math.round(top)}px`;
    }

    clampAll(): void {
      for (const w of this.windows.values()) {
        // Windows the player never touched follow the screen's proportions.
        if (!w.userPlaced) this.place(w, false);
        else if (w.visible) this.clamp(w);
      }
    }

    /** Put every window back where it starts. */
    resetLayout(): void {
      for (const w of this.windows.values()) this.place(w, true);
    }

    noteResize(win: SimWindow): void {
      win.userPlaced = true;
    }

    /**
     * Bring a window to the front. The stack is renumbered from a fixed base
     * every time, so z-indices never climb without bound — the old counter
     * was capped instead, after which windows tied and DOM order decided.
     */
    focus(win: SimWindow): void {
      const k = this.order.indexOf(win);
      if (k >= 0) this.order.splice(k, 1);
      this.order.push(win);
      this.order.forEach((w, n) => { w.root.style.zIndex = String(100 + n); });
      for (const w of this.windows.values()) w.root.classList.toggle('focused', w === win);
      this.onChange?.();
    }

    onHidden(_win: SimWindow): void {
      this.onChange?.();
    }

    /** The visible window on top, if any. */
    topmost(): SimWindow | null {
      for (let k = this.order.length - 1; k >= 0; k--) {
        if (this.order[k].visible) return this.order[k];
      }
      return null;
    }

    toggle(id: string): void {
      this.windows.get(id)?.toggle();
    }

    show(id: string, takeFocus = true): void {
      this.windows.get(id)?.show(takeFocus);
    }

    hide(id: string): void {
      this.windows.get(id)?.hide();
    }

    isVisible(id: string): boolean {
      return this.windows.get(id)?.visible ?? false;
    }
  }

  /* ------------------------------------------------------------- menu bar -- */

  export interface MenuItem {
    readonly label: string;
    readonly icon?: string;
    readonly action?: () => void;
    /** Shows a check mark and makes the item a checkbox for assistive tech. */
    readonly checked?: () => boolean;
    /** Replaces `icon` while `checked` is false (sound off vs. on). */
    readonly iconOff?: string;
    readonly separator?: boolean;
    readonly disabled?: () => boolean;
    /** Small right-aligned hint: a cost or a shortcut. */
    readonly hint?: string;
    /** Makes the row a 0..1 slider instead of a button; `label` names it for assistive tech. */
    readonly slider?: VolumeControl;
  }

  export interface VolumeControl {
    readonly get: () => number;
    readonly set: (v: number) => void;
  }

  /** A 0..100 % range input wired to a volume; `sync` re-reads it. */
  export function volumeSlider(label: string, control: VolumeControl): { input: HTMLInputElement; percent: HTMLElement; sync: () => void } {
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.step = '5';
    input.setAttribute('aria-label', label);
    const percent = make('span', 'volume-percent');
    const sync = (): void => {
      const v = Math.round(control.get() * 100);
      input.value = String(v);
      input.style.setProperty('--lo', '0');
      input.style.setProperty('--hi', String(v / 100));
      percent.textContent = `${v} %`;
    };
    input.addEventListener('input', () => { control.set(Number(input.value) / 100); sync(); });
    sync();
    return { input, percent, sync };
  }

  export interface MenuDef {
    readonly title: string;
    readonly icon: string;
    readonly items: readonly MenuItem[];
  }

  /**
   * The pull-down menu bar: click or Enter opens, arrow keys move, Escape
   * closes. Under NARROW_PX it collapses behind one "Menü" button into a
   * sheet that lists every menu at once.
   */
  export class MenuBar {
    private openIndex = -1;
    private readonly titles: HTMLButtonElement[] = [];
    private readonly panels: HTMLElement[] = [];
    private readonly rows: { el: HTMLElement; item: MenuItem }[][] = [];
    private readonly toggleBtn: HTMLButtonElement;
    private readonly sliderSyncs = new Map<HTMLElement, () => void>();

    constructor(private readonly host: HTMLElement, private readonly defs: readonly MenuDef[]) {
      host.setAttribute('role', 'menubar');
      host.setAttribute('aria-label', 'Hauptmenü');

      this.toggleBtn = button({
        label: 'Menü', icon: uiIcon('hamburger'), cls: 'btn btn-ghost menu-toggle',
        onClick: (e) => { e.stopPropagation(); this.toggleSheet(); },
      });
      this.toggleBtn.setAttribute('aria-expanded', 'false');
      host.parentElement?.insertBefore(this.toggleBtn, host);

      defs.forEach((def, i) => {
        const wrap = make('div', 'menu');
        const title = document.createElement('button');
        title.type = 'button';
        title.className = 'menu-title';
        title.setAttribute('role', 'menuitem');
        title.setAttribute('aria-haspopup', 'true');
        title.setAttribute('aria-expanded', 'false');
        title.append(img(def.icon, 'ico menu-title-icon'), make('span', undefined, def.title));
        title.title = def.title;
        title.setAttribute('aria-label', def.title);
        title.addEventListener('click', (e) => { e.stopPropagation(); this.toggle(i); });
        title.addEventListener('pointerenter', () => {
          if (this.openIndex >= 0 && this.openIndex !== i && !this.sheetOpen) this.open(i, false);
        });
        title.addEventListener('keydown', (e) => this.onTitleKey(e, i));

        const panel = make('div', 'menu-panel glass hidden');
        panel.setAttribute('role', 'menu');
        panel.setAttribute('aria-label', def.title);
        const rows: { el: HTMLElement; item: MenuItem }[] = [];
        for (const item of def.items) {
          if (item.separator) { panel.appendChild(make('div', 'menu-sep')); continue; }
          if (item.slider) {
            const { input, percent, sync } = volumeSlider(item.label, item.slider);
            const line = make('div', 'menu-item menu-slider');
            input.tabIndex = -1;
            line.append(make('span'), make('span'), input, percent);
            input.addEventListener('keydown', (e) => this.onItemKey(e, i, rows.findIndex((r) => r.el === input)));
            this.sliderSyncs.set(input, sync);
            panel.appendChild(line);
            rows.push({ el: input, item });
            continue;
          }
          const row = document.createElement('button');
          row.type = 'button';
          row.className = 'menu-item';
          row.setAttribute('role', item.checked ? 'menuitemcheckbox' : 'menuitem');
          row.tabIndex = -1;
          const mark = make('span', 'menu-check');
          mark.appendChild(img(uiIcon('check'), 'ico'));
          row.append(
            mark,
            item.icon ? img(item.icon, 'ico menu-item-icon') : make('span', 'menu-item-icon'),
            make('span', 'menu-label', item.label),
            make('span', 'menu-hint', item.hint ?? ''),
          );
          row.addEventListener('click', (e) => {
            e.stopPropagation();
            if (item.disabled?.()) return;
            this.closeAll();
            item.action?.();
          });
          row.addEventListener('keydown', (e) => this.onItemKey(e, i, rows.findIndex((r) => r.el === row)));
          panel.appendChild(row);
          rows.push({ el: row, item });
        }

        wrap.append(title, panel);
        host.appendChild(wrap);
        this.titles.push(title);
        this.panels.push(panel);
        this.rows.push(rows);
      });

      document.addEventListener('pointerdown', (e) => {
        if (!(e.target as HTMLElement).closest('.menubar, .menu-toggle')) this.closeAll();
      });
    }

    /** Is any menu (or the phone sheet) open right now? */
    get isOpen(): boolean {
      return this.openIndex >= 0 || this.sheetOpen;
    }

    private get sheetOpen(): boolean {
      return this.host.classList.contains('sheet-open');
    }

    private sheetClose: HTMLButtonElement | null = null;

    private toggleSheet(): void {
      const open = !this.sheetOpen;
      this.host.classList.toggle('sheet-open', open);
      this.toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      // In the sheet the menu titles are headings, not controls.
      this.titles.forEach((t) => { t.tabIndex = open ? -1 : 0; t.setAttribute('aria-disabled', open ? 'true' : 'false'); });
      if (open) {
        if (!this.sheetClose) {
          this.sheetClose = button({
            label: 'Menü schließen', icon: uiIcon('close'), cls: 'btn btn-small menu-sheet-close',
            onClick: (e) => { e.stopPropagation(); this.closeAll(); this.toggleBtn.focus(); },
          });
          this.host.prepend(this.sheetClose);
        }
        this.panels.forEach((p, i) => { p.classList.remove('hidden'); this.refreshMarks(i); });
        this.sheetClose.focus();
      } else {
        this.closeAll();
      }
    }

    private toggle(i: number): void {
      if (this.sheetOpen) return;
      if (this.openIndex === i) this.closeAll();
      else this.open(i, false);
    }

    private open(i: number, focusFirst: boolean): void {
      this.closeAll();
      this.openIndex = i;
      this.titles[i].classList.add('open');
      this.titles[i].setAttribute('aria-expanded', 'true');
      this.panels[i].classList.remove('hidden');
      this.refreshMarks(i);
      if (focusFirst) this.focusRow(i, 0, 1);
    }

    closeAll(): void {
      this.openIndex = -1;
      if (this.host.classList.contains('sheet-open')) {
        this.titles.forEach((t) => { t.tabIndex = 0; t.setAttribute('aria-disabled', 'false'); });
      }
      this.host.classList.remove('sheet-open');
      this.toggleBtn.setAttribute('aria-expanded', 'false');
      this.titles.forEach((t) => { t.classList.remove('open'); t.setAttribute('aria-expanded', 'false'); });
      for (const p of this.panels) p.classList.add('hidden');
    }

    private focusRow(menu: number, start: number, dir: number): void {
      const rows = this.rows[menu];
      if (rows.length === 0) return;
      let k = (start + rows.length) % rows.length;
      for (let n = 0; n < rows.length; n++) {
        if (!rows[k].item.disabled?.()) { rows[k].el.focus(); return; }
        k = (k + dir + rows.length) % rows.length;
      }
    }

    private onTitleKey(e: KeyboardEvent, i: number): void {
      const n = this.titles.length;
      if (e.key === 'ArrowRight') { e.preventDefault(); this.titles[(i + 1) % n].focus(); if (this.openIndex >= 0) this.open((i + 1) % n, false); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); this.titles[(i - 1 + n) % n].focus(); if (this.openIndex >= 0) this.open((i - 1 + n) % n, false); }
      else if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.open(i, true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.closeAll(); }
    }

    private onItemKey(e: KeyboardEvent, menu: number, row: number): void {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.focusRow(menu, row + 1, 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this.focusRow(menu, row - 1, -1); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.closeAll(); this.titles[menu].focus(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        // On a slider the side arrows change the value.
        if (e.target instanceof HTMLInputElement) return;
        e.preventDefault();
        const n = this.titles.length;
        const next = (menu + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
        this.open(next, true);
        this.titles[next].focus();
        this.focusRow(next, 0, 1);
      }
    }

    /** Update check marks and disabled rows just before a menu is shown. */
    private refreshMarks(i: number): void {
      for (const { el, item } of this.rows[i]) {
        const checked = item.checked?.() ?? false;
        el.classList.toggle('checked', checked);
        if (item.checked) el.setAttribute('aria-checked', checked ? 'true' : 'false');
        if (item.iconOff && item.icon) (el.querySelector('img.menu-item-icon') as HTMLImageElement).src = checked ? item.icon : item.iconOff;
        const disabled = item.disabled?.() ?? false;
        this.sliderSyncs.get(el)?.();
        if (el instanceof HTMLInputElement) { el.disabled = disabled; el.parentElement?.classList.toggle('disabled', disabled); }
        el.classList.toggle('disabled', disabled);
        el.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      }
    }
  }
}
