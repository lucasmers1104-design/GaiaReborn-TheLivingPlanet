/* =============================================================================
 * SimEarth 2.0 — notifications
 * -----------------------------------------------------------------------------
 * Four registers, from quiet to prominent:
 *
 *   message    a one-line toast for feedback on what the player just did
 *              ("Zu wenig Energie", "Planet gespeichert")
 *   card       a small illustrated card for notable happenings — extinctions,
 *              new eras of civilization — in the corner, never blocking play
 *   milestone  a larger card with a soft glow for big moments that are not a
 *              step of the tree, such as intelligence awakening
 *   showcase   every new evolution step: its film and story (showcase.ts)
 *
 * Entries are shown strictly in the order they happened. Only when a card or
 * milestone is actually on screen is it reported back as seen, so whatever
 * was still queued when the game was saved is shown again after loading —
 * and nothing that was already shown ever is.
 * ========================================================================== */

namespace SE {
  /** At most this many cards on screen; the rest wait their turn. */
  const MAX_CARDS = 2;
  const CARD_MS = 9000;
  const MILESTONE_MS = 15000;
  const MESSAGE_MS = 4500;

  const KICKER: Readonly<Record<ChronicleKind, string>> = {
    evolution: 'Neue Entwicklung',
    milestone: 'Meilenstein',
    civ: 'Zivilisation',
    extinction: 'Ausgestorben',
    info: 'Hinweis',
  };

  /**
   * A chronicle entry's picture, `px` pixels across: a sub-species' portrait,
   * else its icon. What is gone for good shows greyed under the R.I.P. band.
   */
  export function chronicleArt(e: ChronicleEntry, cls: string, px: number): HTMLElement {
    const life = e.nodeId !== undefined ? EVO_BY_ID.get(e.nodeId)?.life : undefined;
    const pic = life !== undefined && e.stage !== undefined
      ? pixelArt(speciesPicture(life, e.stage, 'full', 'fauna-svg'), px, cls)
      : img(e.icon, cls);
    if (!e.rip) return pic;
    const box = make('span', 'rip-art');
    box.append(pic, ripBand());
    return box;
  }

  export class Notifier {
    private readonly queue: ChronicleEntry[] = [];
    private cards = 0;
    private milestone: HTMLElement | null = null;
    /** An evolution showcase is on screen (see Showcase). */
    private showcaseOpen = false;
    private messageEl: HTMLElement | null = null;
    private messageTimer = 0;
    /** Pause the world while a milestone is open (an option). */
    pauseOnMilestone = false;

    constructor(
      private readonly host: HTMLElement,
      private readonly milestoneHost: HTMLElement,
      private readonly hooks: {
        reported: (key: string) => void;
        view: (nodeId: string) => void;
        milestone: (open: boolean) => void;
        /** Small screen: one card at a time, never under a milestone. */
        narrow: () => boolean;
        /** Open the space project's window, from its cards (keys `space:…`). */
        spaceport: () => void;
        /** Every new evolution step gets the showcase; `done` when it closes. */
        showcase: { show(e: ChronicleEntry, done: () => void): void; close(): void };
      },
    ) {}

    /* ------------------------------------------------------- messages -- */

    /** `action` adds one button to the line, e.g. "Zum Ereignis springen". */
    message(text: string, kind: 'info' | 'warn' | 'ok' = 'info', action?: { label: string; run: () => void }): void {
      // One line at a time: a new message replaces the old one rather than
      // stacking, so rapid feedback (a drag across costly tiles) stays calm.
      if (!this.messageEl) {
        this.messageEl = make('div', 'toast toast-msg glass');
        this.messageEl.setAttribute('role', kind === 'warn' ? 'alert' : 'status');
        this.host.prepend(this.messageEl);
      }
      const el = this.messageEl;
      el.className = `toast toast-msg glass toast-${kind}`;
      el.innerHTML = '';
      el.append(
        img(kind === 'warn' ? uiIcon('warning') : kind === 'ok' ? uiIcon('check') : uiIcon('info'), 'ico toast-msg-icon'),
        make('span', 'toast-msg-text', text),
      );
      if (action) {
        el.appendChild(button({ label: action.label, icon: uiIcon('target'), cls: 'btn btn-small', onClick: () => { action.run(); this.dropMessage(); } }));
      }
      el.classList.remove('leaving');
      window.clearTimeout(this.messageTimer);
      this.messageTimer = window.setTimeout(() => this.dropMessage(), MESSAGE_MS);
    }

    private dropMessage(): void {
      const el = this.messageEl;
      if (!el) return;
      el.classList.add('leaving');
      window.setTimeout(() => {
        if (this.messageEl === el && el.classList.contains('leaving')) {
          el.remove();
          this.messageEl = null;
        }
      }, 260);
    }

    /* ---------------------------------------------------------- queue -- */

    push(entries: readonly ChronicleEntry[], reported: ReadonlySet<string>): void {
      for (const e of entries) {
        if (reported.has(e.key)) continue;
        if (this.queue.some((q) => q.key === e.key)) continue;
        this.queue.push(e);
      }
      this.pump();
    }

    /** Drop everything on screen and queued — for a new or loaded planet. */
    clear(): void {
      this.queue.length = 0;
      this.host.querySelectorAll('.toast-card').forEach((n) => n.remove());
      this.cards = 0;
      if (this.milestone) {
        this.milestone.remove();
        this.milestone = null;
        this.hooks.milestone(false);
      }
      if (this.showcaseOpen) this.hooks.showcase.close();
    }

    get busy(): boolean {
      return this.queue.length > 0 || this.cards > 0 || !!this.milestone || this.showcaseOpen;
    }

    private pump(): void {
      while (this.queue.length > 0) {
        const next = this.queue[0];
        if (next.kind === 'evolution' && next.nodeId) {
          // One showcase at a time, never on top of a milestone; the rest
          // wait their turn in the order they happened.
          if (this.milestone || this.showcaseOpen) return;
          this.queue.shift();
          this.hooks.reported(next.key);
          this.showcaseOpen = true;
          this.hooks.milestone(true);
          this.hooks.showcase.show(next, () => {
            this.showcaseOpen = false;
            this.hooks.milestone(false);
            this.pump();
          });
          return;
        }
        if (next.major) {
          if (this.milestone || this.showcaseOpen) return;
          this.queue.shift();
          this.showMilestone(next);
        } else {
          const narrow = this.hooks.narrow();
          // On a phone a card under the milestone would run out unseen.
          if (narrow && (this.milestone || this.showcaseOpen)) return;
          if (this.cards >= (narrow ? 1 : MAX_CARDS)) return;
          this.queue.shift();
          this.showCard(next);
        }
      }
    }

    /* ---------------------------------------------------------- cards -- */

    private kicker(e: ChronicleEntry): string {
      let k = KICKER[e.kind];
      if (e.kind === 'evolution' && e.nodeId) {
        const n = EVO_BY_ID.get(e.nodeId);
        if (n) k += n.kingdom === 'plant' ? ' · Pflanzen' : n.kingdom === 'animal' ? ' · Tiere' : ' · Ursprung';
      }
      return k;
    }

    private showCard(e: ChronicleEntry): void {
      this.cards++;
      this.hooks.reported(e.key);

      const card = make('div', `toast toast-card glass kind-${e.kind}`);
      card.setAttribute('role', 'status');
      const art = chronicleArt(e, 'toast-art', 28);
      const main = make('div', 'toast-main');
      main.append(
        make('div', 'toast-kicker', this.kicker(e)),
        make('div', 'toast-title', e.title),
        make('p', 'toast-text', e.text),
      );
      if (e.change) {
        const ch = make('p', 'toast-change');
        ch.append(img(uiIcon(e.kind === 'extinction' ? 'info' : 'check'), 'ico'), make('span', undefined, e.change));
        main.appendChild(ch);
      }
      if (e.nodeId) {
        const actions = make('div', 'toast-actions');
        actions.appendChild(button({
          label: 'Im Evolutionsbaum ansehen', icon: uiIcon('evolution'), cls: 'btn btn-small',
          onClick: () => { this.hooks.view(e.nodeId as string); close(); },
        }));
        main.appendChild(actions);
      } else if (e.key.startsWith('space:')) {
        const actions = make('div', 'toast-actions');
        actions.appendChild(button({ label: 'Zum Raumhafen', icon: uiIcon('rocket'), cls: 'btn btn-small', onClick: () => { this.hooks.spaceport(); close(); } }));
        main.appendChild(actions);
      }
      const x = button({ label: 'Hinweis schließen', icon: uiIcon('close'), cls: 'icon-btn toast-close', showLabel: false, onClick: () => close() });
      const timer = make('div', 'toast-timer');
      card.append(art, main, x, timer);
      this.host.appendChild(card);

      let left = CARD_MS;
      let started = performance.now();
      let handle = 0;
      let closed = false;
      const close = (): void => {
        if (closed) return;
        closed = true;
        window.clearTimeout(handle);
        card.classList.add('leaving');
        window.setTimeout(() => {
          if (!card.isConnected) return; // cleared with its planet: no longer counted
          card.remove();
          this.cards = Math.max(0, this.cards - 1);
          this.pump();
        }, 260);
      };
      const run = (): void => {
        started = performance.now();
        handle = window.setTimeout(close, left);
        timer.style.animationPlayState = 'running';
      };
      const hold = (): void => {
        window.clearTimeout(handle);
        left = Math.max(1500, left - (performance.now() - started));
        timer.style.animationPlayState = 'paused';
      };
      // Reading takes as long as it takes: hover or focus holds the card.
      card.addEventListener('pointerenter', hold);
      card.addEventListener('pointerleave', run);
      card.addEventListener('focusin', hold);
      card.addEventListener('focusout', run);
      timer.style.animationDuration = `${CARD_MS}ms`;
      run();
    }

    /* ------------------------------------------------------ milestone -- */

    private showMilestone(e: ChronicleEntry): void {
      this.hooks.reported(e.key);
      const box = make('div', 'milestone glass');
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');

      const spores = make('div', 'milestone-spores');
      for (let k = 0; k < 10; k++) {
        const s = make('span');
        s.style.left = `${8 + k * 9}%`;
        s.style.animationDelay = `${(k % 5) * 0.45}s`;
        spores.appendChild(s);
      }
      const art = make('div', 'milestone-art');
      art.appendChild(img(e.icon, 'milestone-img'));
      const kicker = make('div', 'milestone-kicker', e.kind === 'evolution' ? 'Meilenstein der Evolution' : KICKER[e.kind]);
      const title = make('h3', 'milestone-title', e.title);
      const text = make('p', 'milestone-text', e.text);
      const change = make('p', 'milestone-change');
      change.append(img(uiIcon('check'), 'ico'), make('span', undefined, e.change));
      const actions = make('div', 'milestone-actions');
      const close = (): void => {
        window.clearTimeout(handle);
        restore();
        box.classList.add('leaving');
        window.setTimeout(() => {
          box.remove();
          if (this.milestone === box) {
            this.milestone = null;
            this.hooks.milestone(false);
          }
          this.pump();
        }, 320);
      };
      if (e.nodeId) {
        actions.appendChild(button({
          label: 'Im Evolutionsbaum ansehen', icon: uiIcon('evolution'), cls: 'btn btn-primary',
          onClick: () => { this.hooks.view(e.nodeId as string); close(); },
        }));
      } else if (e.key.startsWith('space:')) {
        actions.appendChild(button({ label: 'Zum Raumhafen', icon: uiIcon('rocket'), cls: 'btn btn-primary', onClick: () => { this.hooks.spaceport(); close(); } }));
      }
      const ok = button({ label: 'Weiter', cls: 'btn btn-ghost', onClick: () => close() });
      actions.appendChild(ok);

      const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const restore = (): void => {
        if (!box.contains(document.activeElement)) return;
        const back = before && before.isConnected && before !== document.body ? before : document.querySelector<HTMLElement>('.world-canvas');
        back?.focus({ preventScroll: true });
      };
      box.append(spores, art, kicker, title, text, change, actions);
      this.milestoneHost.appendChild(box);
      this.milestone = box;
      this.hooks.milestone(true);

      let handle = window.setTimeout(close, MILESTONE_MS);
      box.addEventListener('pointerenter', () => window.clearTimeout(handle));
      box.addEventListener('pointerleave', () => { handle = window.setTimeout(close, 5000); });
      box.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Escape') return;
        ev.preventDefault();
        ev.stopPropagation();
        close();
      });
      if (this.pauseOnMilestone) ok.focus({ preventScroll: true });
    }
  }
}
