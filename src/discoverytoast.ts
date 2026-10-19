/* =============================================================================
 * SimEarth 2.0 — discovery notices
 * -----------------------------------------------------------------------------
 * A banner under the top bar whenever the planet produces a sub-species the
 * lexicon has not seen before: it drops in with a soft chime, stays a few
 * seconds (longer while the pointer rests on it) and fades away; the game
 * runs on. One at a time and never on top of a film or milestone; when
 * several wait, they are announced together, so a burst of discoveries (a
 * loaded planet, fast play) never floods the screen.
 * ========================================================================== */

namespace SE {
  const DISCOVERY_MS = 4000;
  /** How long the banner takes to fade away (css/fauna.css `discovery-out`). */
  const DISCOVERY_FADE_MS = 900;
  /** From this many waiting discoveries on, all of them share one notice. */
  const DISCOVERY_BUNDLE = 3;
  /** Names a shared notice spells out before "und n weitere". */
  const DISCOVERY_NAMES = 3;
  /** While a film covers the screen, an expired notice waits this long and looks again. */
  const DISCOVERY_RECHECK_MS = 1000;

  export interface DiscoveryHooks {
    /** A single discovery was clicked: show its entry. */
    open(c: Life, stage: number): void;
    /** A shared notice was clicked: show the whole lexicon. */
    openLexicon(): void;
    /** A film or milestone holds the screen: wait. */
    held(): boolean;
    /** These discoveries are on screen now. */
    shown(events: readonly FaunaEvent[]): void;
  }

  export class DiscoveryToasts {
    private readonly queue: FaunaEvent[] = [];
    private card: HTMLElement | null = null;
    /** The last banner is still fading: the next one waits for it. */
    private fading = false;
    /** Re-reads what holds the notice on screen (hover, focus, a film). */
    private resync: (() => void) | null = null;
    private pumpHandle = 0;

    constructor(private readonly host: HTMLElement, private readonly hooks: DiscoveryHooks) {}

    push(events: readonly FaunaEvent[]): void {
      for (const e of events) {
        if (this.queue.some((q) => q.c === e.c && q.stage === e.stage)) continue;
        this.queue.push(e);
      }
      this.pump();
    }

    /**
     * Try again on the next turn of the event loop, so whoever just closed
     * a film can open the next one first.
     */
    pump(): void {
      if (this.pumpHandle) return;
      this.pumpHandle = window.setTimeout(() => {
        this.pumpHandle = 0;
        this.showNext();
      }, 0);
    }

    /**
     * A film or milestone opened or closed. A notice that came up just before
     * steps aside until it ends, and its time stands still meanwhile.
     */
    setHeld(on: boolean): void {
      this.card?.classList.toggle('is-held', on);
      this.resync?.();
      if (!on) this.pump();
    }

    clear(): void {
      this.queue.length = 0;
      window.clearTimeout(this.pumpHandle);
      this.pumpHandle = 0;
      this.resync = null;
      if (this.card) {
        this.card.remove();
        this.card = null;
      }
    }

    private showNext(): void {
      if (this.card || this.fading || this.queue.length === 0 || this.hooks.held()) return;
      if (this.queue.length >= DISCOVERY_BUNDLE) this.showBundle(this.queue.splice(0));
      else this.showOne(this.queue.shift() as FaunaEvent);
    }

    private showOne(e: FaunaEvent): void {
      const { c, stage } = e;
      const pic = make('span', 'fauna-toast-pic');
      pic.appendChild(pixelArt(speciesPicture(c, stage, 'full', 'fauna-svg'), 24, 'fauna-svg'));
      const text = make('span', 'fauna-toast-text');
      text.append(
        make('span', 'fauna-toast-kicker', 'Neue Art entdeckt'),
        make('span', 'fauna-toast-title', subspeciesName(c, stage)),
        make('span', 'fauna-toast-sub', `${LIFE[c].name} · Unterart ${stage + 1} von ${SUBSPECIES_PER_CLASS}`),
      );
      if (c === Life.Prokaryote && stage === CYANOBACTERIA_STAGE) {
        text.appendChild(make('span', 'fauna-toast-sub', 'Mit Cyanobakterien beginnt die Sauerstoffproduktion im Meer.'));
      }
      this.present([e], [pic], text, 'Im Arten-Lexikon ansehen', () => this.hooks.open(c, stage));
    }

    private showBundle(events: readonly FaunaEvent[]): void {
      const pics = events.slice(0, DISCOVERY_NAMES).map((e) => {
        const pic = make('span', 'fauna-toast-pic');
        pic.appendChild(pixelArt(speciesPicture(e.c, e.stage, 'full', 'fauna-svg'), 18, 'fauna-svg'));
        return pic;
      });
      const names = events.slice(0, DISCOVERY_NAMES).map((e) => subspeciesName(e.c, e.stage));
      const more = events.length - names.length;
      const text = make('span', 'fauna-toast-text');
      text.append(
        make('span', 'fauna-toast-kicker', 'Arten-Lexikon'),
        make('span', 'fauna-toast-title', `${events.length} neue Arten entdeckt`),
        make('span', 'fauna-toast-sub', more > 0 ? `${names.join(', ')} und ${more} weitere` : names.join(', ')),
      );
      if (events.some((e) => e.c === Life.Prokaryote && e.stage === CYANOBACTERIA_STAGE)) {
        text.appendChild(make('span', 'fauna-toast-sub', 'Mit Cyanobakterien beginnt die Sauerstoffproduktion im Meer.'));
      }
      this.present(events, pics, text, 'Arten-Lexikon öffnen', () => this.hooks.openLexicon());
    }

    private present(events: readonly FaunaEvent[], pics: readonly HTMLElement[], text: HTMLElement, action: string, onOpen: () => void): void {
      const card = make('div', 'toast fauna-toast glass');
      card.setAttribute('role', 'status');
      card.setAttribute('aria-live', 'polite');

      const main = document.createElement('button');
      main.type = 'button';
      main.className = 'fauna-toast-main';
      main.title = action;
      const art = make('span', `fauna-toast-art${pics.length > 1 ? ' is-stack' : ''}`);
      art.append(...pics);
      main.append(art, text, make('span', 'sr-only', `– ${action}`));
      const x = button({ label: 'Meldung schließen', icon: uiIcon('close'), cls: 'icon-btn toast-close fauna-toast-close', showLabel: false });
      const timer = make('div', 'toast-timer');
      timer.style.animationDuration = `${DISCOVERY_MS}ms`;
      card.append(main, x, timer);

      let left = DISCOVERY_MS;
      let started = 0;
      /** The running timer; 0 while hover, focus or a film hold the notice. */
      let handle = 0;
      let hovered = false;
      let focused = false;
      const finish = (clicked: boolean): void => {
        if (this.card !== card) return;
        window.clearTimeout(handle);
        handle = 0;
        this.card = null;
        this.resync = null;
        const hadFocus = card.contains(document.activeElement);
        card.classList.add('leaving');
        window.setTimeout(() => card.remove(), DISCOVERY_FADE_MS);
        if (hadFocus && !clicked) document.querySelector<HTMLElement>('.world-canvas')?.focus({ preventScroll: true });
        this.fading = true;
        window.setTimeout(() => { this.fading = false; this.pump(); }, DISCOVERY_FADE_MS);
      };
      const expire = (): void => {
        // Under a film the notice would run out unseen.
        if (this.hooks.held()) handle = window.setTimeout(expire, DISCOVERY_RECHECK_MS);
        else finish(false);
      };
      // Reading takes as long as it takes: hover or focus holds the notice.
      const sync = (): void => {
        if (this.card !== card) return;
        const hold = hovered || focused || this.hooks.held();
        if (hold && handle) {
          window.clearTimeout(handle);
          handle = 0;
          left = Math.max(1500, left - (performance.now() - started));
          timer.style.animationPlayState = 'paused';
        } else if (!hold && !handle) {
          started = performance.now();
          handle = window.setTimeout(expire, left);
          timer.style.animationPlayState = 'running';
        }
      };
      card.addEventListener('pointerenter', () => { hovered = true; sync(); });
      card.addEventListener('pointerleave', () => { hovered = false; sync(); });
      card.addEventListener('focusin', () => { focused = true; sync(); });
      card.addEventListener('focusout', (e) => { focused = card.contains(e.relatedTarget as Node | null); sync(); });
      main.addEventListener('click', () => { finish(true); onOpen(); });
      x.addEventListener('click', () => finish(false));

      this.card = card;
      this.resync = sync;
      this.host.appendChild(card);
      this.hooks.shown(events);
      sync();
    }
  }
}
