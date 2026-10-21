/* =============================================================================
 * SimEarth 2.0 — shared UI building blocks
 * -----------------------------------------------------------------------------
 * Every panel, menu and dialog is assembled from these few pieces so the
 * whole interface shares one look and one set of behaviours: SVG icons from
 * assets/, buttons with real labels (never icon-only without a name), German
 * number formatting, and a small modal for questions that need an answer.
 * ========================================================================== */

namespace SE {
  /* ------------------------------------------------------------- icons -- */

  export function uiIcon(name: string): string {
    return `assets/ui/${name}.svg`;
  }
  export function resIcon(name: string): string {
    return `assets/resources/${name}.svg`;
  }
  export function habitatAsset(name: string): string {
    return `assets/habitats/${name}.svg`;
  }
  export function eventIcon(name: string): string {
    return `assets/events/${name}.svg`;
  }

  /**
   * An <img> for an SVG asset. Decorative by default (empty alt): every icon
   * in this UI sits next to a visible label or carries an aria-label on its
   * control, so screen readers would only hear the name twice.
   */
  export function img(src: string, cls = 'ico', alt = ''): HTMLImageElement {
    const el = document.createElement('img');
    el.src = src;
    el.className = cls;
    el.alt = alt;
    el.draggable = false;
    el.decoding = 'async';
    return el;
  }

  /* ----------------------------------------------------------- buttons -- */

  export interface ButtonOptions {
    readonly label: string;
    readonly icon?: string;
    readonly cls?: string;
    /** Tooltip and accessible description beyond the label. */
    readonly title?: string;
    /** Show the label visually (default) or only to assistive technology. */
    readonly showLabel?: boolean;
    readonly onClick?: (e: MouseEvent) => void;
  }

  export function button(opts: ButtonOptions): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = opts.cls ?? 'btn';
    if (opts.icon) b.appendChild(img(opts.icon));
    const label = make('span', opts.showLabel === false ? 'sr-only' : 'btn-label', opts.label);
    b.appendChild(label);
    if (opts.title) b.title = opts.title;
    if (opts.onClick) b.addEventListener('click', opts.onClick);
    return b;
  }

  /** Set a button's pressed/selected look and its ARIA state together. */
  export function setPressed(b: HTMLElement, on: boolean): void {
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  /* -------------------------------------------------------- formatting -- */

  const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  export const fmt = {
    int: (n: number): string => nf0.format(Math.round(n)),
    one: (n: number): string => nf1.format(n),
    two: (n: number): string => nf2.format(n),
    pct: (share: number): string => `${nf1.format(share * 100)} %`,
  };

  /** A date like "12. Okt. 2026, 14:05" for save slots. */
  export function formatDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'unbekannt';
    return d.toLocaleString('de-DE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  /* -------------------------------------------------------- modal box -- */

  export interface ModalAction {
    readonly label: string;
    readonly value: string;
    readonly kind?: 'primary' | 'danger' | 'ghost' | 'secondary';
  }

  /**
   * A centred dialog with focus trapped inside, Escape to cancel, and focus
   * returned to wherever it came from. Used for the few questions that must
   * not be missed: discarding a planet, overwriting a save. A `mandatory`
   * one closes only through its buttons — no Escape, no click beside it —
   * and starts with no button focused, so no key press chooses by accident.
   */
  export class Modal {
    private static root: HTMLElement | null = null;

    static attach(root: HTMLElement): void {
      Modal.root = root;
    }

    static get open(): boolean {
      return !!Modal.root && Modal.root.childElementCount > 0;
    }

    static show(opts: {
      title: string;
      icon?: string;
      body: string | HTMLElement;
      actions: readonly ModalAction[];
      wide?: boolean;
      /** Extra class on the dialog box, for a dialog with its own look. */
      cls?: string;
      /** Receives the close function, for buttons inside a custom body. */
      bind?: (close: (value: string) => void) => void;
      mandatory?: boolean;
    }): Promise<string> {
      const root = Modal.root;
      if (!root) return Promise.resolve('');
      const previous = document.activeElement as HTMLElement | null;

      return new Promise((resolve) => {
        const backdrop = make('div', 'modal-backdrop');
        const box = make('div', `modal glass${opts.wide ? ' wide' : ''}${opts.cls ? ` ${opts.cls}` : ''}`);
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        const titleId = `modal-title-${Date.now()}`;
        box.setAttribute('aria-labelledby', titleId);

        const head = make('div', 'modal-head');
        if (opts.icon) head.appendChild(img(opts.icon, 'modal-icon'));
        const h = make('h2', 'modal-title', opts.title);
        h.id = titleId;
        head.appendChild(h);

        const body = make('div', 'modal-body');
        if (typeof opts.body === 'string') body.appendChild(make('p', undefined, opts.body));
        else body.appendChild(opts.body);

        const foot = make('div', 'modal-foot');
        const finish = (value: string): void => {
          document.removeEventListener('keydown', onKey, true);
          backdrop.remove();
          previous?.focus?.();
          resolve(value);
        };
        const buttons: HTMLButtonElement[] = [];
        for (const a of opts.actions) {
          const b = button({
            label: a.label,
            cls: `btn ${a.kind === 'primary' ? 'btn-primary' : a.kind === 'danger' ? 'btn-danger' : a.kind === 'secondary' ? '' : 'btn-ghost'}`,
            onClick: () => finish(a.value),
          });
          buttons.push(b);
          foot.appendChild(b);
        }

        const onKey = (e: KeyboardEvent): void => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            if (!opts.mandatory) finish('');
            return;
          }
          if (e.key !== 'Tab') return;
          const focusable = Array.from(box.querySelectorAll<HTMLElement>('button, [href], input, select, [tabindex]:not([tabindex="-1"])'))
            .filter((el) => !el.hasAttribute('disabled'));
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          const at = document.activeElement;
          // Focus on the box itself (a mandatory dialog's start) or outside it goes to the ends, never past them.
          if (!(at instanceof HTMLElement) || !focusable.includes(at)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
          else if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
        };
        document.addEventListener('keydown', onKey, true);
        backdrop.addEventListener('pointerdown', (e) => {
          if (e.target === backdrop && !opts.mandatory) finish('');
        });

        box.append(head, body, foot);
        backdrop.appendChild(box);
        root.appendChild(backdrop);
        opts.bind?.(finish);
        if (opts.mandatory) {
          box.tabIndex = -1;
          box.focus();
          return;
        }
        const primary = buttons.find((_, k) => opts.actions[k].kind === 'primary') ?? buttons[0];
        primary?.focus();
      });
    }

    static async confirm(title: string, text: string, yes: string, icon?: string, danger = false): Promise<boolean> {
      const v = await Modal.show({
        title, icon, body: text,
        actions: [
          { label: 'Abbrechen', value: '', kind: 'ghost' },
          { label: yes, value: 'yes', kind: danger ? 'danger' : 'primary' },
        ],
      });
      return v === 'yes';
    }
  }
}
