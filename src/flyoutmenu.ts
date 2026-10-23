/* =============================================================================
 * Gaia Reborn — the menus that fly out of the rail and the status-bar gear
 * -----------------------------------------------------------------------------
 * One menu at a time (a MenuDef, its rows built like the MenuBar's), appended
 * to the body and anchored to the button that opened it: to the right of a
 * rail button, below and left of the gear, always inside the viewport. Enter,
 * Space, ↓ or → on a menu button open it with the first row focused; ↑/↓
 * move, Esc (or ←) closes and gives the focus back to the button; a press
 * anywhere else closes it. Vine sprigs grow round its top corners like a
 * window's, a tendril down the edge by its button. Position, size and stacking
 * are inline, so a stale stylesheet can never let it overflow;
 * css/rail-living.css paints it.
 * ========================================================================== */

namespace SE {
  /** CSS px between the menu and its button, and the least margin to the viewport's edges. */
  const FLYOUT_GAP = 8;
  /** One growth step of the vine sprigs, the windows' pace (src/windowmotion.ts). */
  const SPRIG_STEP_MS = 80;

  interface Flyout {
    readonly root: HTMLElement;
    readonly menu: MenuRows;
    readonly decor: WindowDecor;
  }

  export class FlyoutMenu {
    private readonly built = new Map<MenuDef, Flyout>();
    private shown: { def: MenuDef; anchor: HTMLElement; fly: Flyout } | null = null;
    /** The next open comes from a key on its menu button: it focuses the first row. */
    private byKey = false;
    private sprigTimer = 0;

    /** `reduced`: "Effekte reduzieren" or the OS preference, read at each open: the menu shows without its slide. */
    constructor(private readonly reduced: () => boolean) {
      // Capture: a press that some control stops still closes the menu.
      document.addEventListener('pointerdown', (e) => {
        this.byKey = false;
        const o = this.shown;
        if (!o || !(e.target instanceof Node)) return;
        if (!o.fly.root.contains(e.target) && !o.anchor.contains(e.target)) this.close(false);
      }, true);
      // Enter and Space click a menu button; ↓ and → open its menu too.
      document.addEventListener('keydown', (e) => {
        const t = e.target;
        if (!(t instanceof HTMLButtonElement) || t.getAttribute('aria-haspopup') !== 'menu') return;
        if (e.key === 'Enter' || e.key === ' ') { this.byKey = true; return; }
        if ((e.key !== 'ArrowDown' && e.key !== 'ArrowRight') || this.shown?.anchor === t) return;
        e.preventDefault();
        this.byKey = true;
        t.click();
      });
      window.addEventListener('resize', () => this.close(false));
    }

    get isOpen(): boolean {
      return this.shown !== null;
    }

    /** Re-reads the open menu's check marks: a window shortcut can toggle a window while it shows. */
    refresh(): void {
      this.shown?.fly.menu.refresh();
    }

    /** Opens `def` at `anchor`, or closes it when it is already open there. */
    toggle(def: MenuDef, anchor: HTMLElement): void {
      if (this.shown && this.shown.def === def && this.shown.anchor === anchor) {
        this.byKey = false;
        this.close(false);
      } else {
        this.open(def, anchor);
      }
    }

    open(def: MenuDef, anchor: HTMLElement): void {
      this.close(false);
      const fly = this.built.get(def) ?? this.build(def);
      fly.menu.refresh();
      const still = this.reduced();
      fly.root.style.animation = still ? 'none' : '';
      fly.root.style.display = 'block';
      this.place(fly.root, anchor);
      // The tendril hangs down the edge nearest the button: the rail's on the left, the gear's on the right.
      fly.decor.side = fly.root.dataset.side === 'right' ? 'l' : 'r';
      this.sprout(fly.decor, still);
      anchor.setAttribute('aria-haspopup', 'menu');
      anchor.setAttribute('aria-expanded', 'true');
      this.shown = { def, anchor, fly };
      // Opened from the keyboard: the first row takes the focus.
      if (this.byKey || anchor.matches(':focus-visible')) fly.menu.focus(0, 1);
      this.byKey = false;
    }

    /** Closes the open menu; `refocus` gives the focus back to its button. */
    close(refocus = true): void {
      const o = this.shown;
      if (!o) return;
      this.shown = null;
      clearTimeout(this.sprigTimer);
      o.fly.root.style.display = 'none';
      o.anchor.setAttribute('aria-expanded', 'false');
      if (refocus) o.anchor.focus({ preventScroll: true });
    }

    private build(def: MenuDef): Flyout {
      const root = make('div', 'flyout glass');
      Object.assign(root.style, {
        position: 'fixed', left: '0px', top: '0px', zIndex: '700', display: 'none',
        width: 'max-content', overflowX: 'hidden', overflowY: 'auto', boxSizing: 'border-box',
      });
      const title = make('div', 'flyout-title', def.title);
      title.setAttribute('aria-hidden', 'true');
      const list = make('div', 'flyout-menu');
      list.setAttribute('role', 'menu');
      list.setAttribute('aria-label', def.title);
      const menu = buildMenuRows(list, def.items, (e, row) => this.onKey(e, row), () => this.close(root.contains(document.activeElement)));
      root.append(title, list);
      document.body.appendChild(root);
      const fly = { root, menu, decor: new WindowDecor(root, true) };
      this.built.set(def, fly);
      return fly;
    }

    /** The sprigs grow from a sprout to grown in steps while the menu slides in; still mode shows them grown. */
    private sprout(decor: WindowDecor, still: boolean): void {
      clearTimeout(this.sprigTimer);
      decor.g = still ? decor.full() : 0;
      decor.draw();
      const step = (): void => {
        if (decor.g >= decor.full()) return;
        decor.g++;
        decor.draw();
        this.sprigTimer = window.setTimeout(step, SPRIG_STEP_MS);
      };
      if (!still) this.sprigTimer = window.setTimeout(step, SPRIG_STEP_MS);
    }

    /** Beside a button in the left half (the rail), else below it and right-aligned (the gear); clamped to the viewport. */
    private place(root: HTMLElement, anchor: HTMLElement): void {
      const g = FLYOUT_GAP;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      root.style.maxWidth = `${vw - 2 * g}px`;
      root.style.maxHeight = `${vh - 2 * g}px`;
      const a = anchor.getBoundingClientRect();
      const w = root.offsetWidth;
      const h = root.offsetHeight;
      const beside = a.left + a.width / 2 < vw / 2;
      root.dataset.side = beside ? 'right' : 'below';
      const x = beside ? a.right + g : a.right - w;
      const y = beside ? a.top : a.bottom + g;
      root.style.left = `${Math.round(clamp(x, g, Math.max(g, vw - w - g)))}px`;
      root.style.top = `${Math.round(clamp(y, g, Math.max(g, vh - h - g)))}px`;
    }

    private onKey(e: KeyboardEvent, row: number): void {
      const o = this.shown;
      if (!o) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); o.fly.menu.focus(row + 1, 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); o.fly.menu.focus(row - 1, -1); }
      else if (e.key === 'Home') { e.preventDefault(); o.fly.menu.focus(0, 1); }
      else if (e.key === 'End') { e.preventDefault(); o.fly.menu.focus(-1, -1); }
      // On a volume slider the side arrows change the value.
      else if (e.key === 'Escape' || e.key === 'Tab' || (e.key === 'ArrowLeft' && !(e.target instanceof HTMLInputElement))) {
        e.preventDefault();
        e.stopPropagation();
        this.close(true);
      }
    }
  }
}
