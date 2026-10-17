/* =============================================================================
 * SimEarth 2.0 — the evolution showcase
 * -----------------------------------------------------------------------------
 * When a step of the tree arises — chosen by the player or on its own — it
 * gets its moment: a burst of light and colour, a chime, and a card with the
 * step's short film, captions in time with its four beats, when it happened
 * on Earth, what it changed, the breakthrough and why it spread, and one
 * fact to take away.
 * ========================================================================== */

namespace SE {
  /** The card leaves on its own after this long without being looked at. */
  const SHOWCASE_IDLE_MS = 30000;

  const KINGDOM_LABEL: Readonly<Record<Kingdom, string>> = { origin: 'Ursprung', plant: 'Pflanzen', animal: 'Tiere' };
  export const KINGDOM_COLOR: Readonly<Record<Kingdom, string>> = { origin: '#5ccfd0', plant: '#8ad16f', animal: '#f2a35c' };

  export interface ShowcaseHooks {
    view(nodeId: string): void;
    showOnMap(entry: ChronicleEntry): void;
    /** Steps developed so far and in all. */
    progress(): { developed: number; total: number };
    /** Effect volume 0..1; 0 while sound is off. */
    sound(): number;
  }

  /** A film for a step that has none: its badge, glowing, with the sparkle. */
  function fallbackFilm(n: EvoNode): string {
    const color = KINGDOM_COLOR[n.kingdom];
    return film(`fallback-${n.id}`, glowGrad(`fallback-${n.id}-glow`, color, 0.55),
      `<rect width="${FILM_W}" height="${FILM_H}" fill="#0b1d1a"/>` +
      `<circle cx="240" cy="135" r="120" fill="url(#fallback-${n.id}-glow)"${mo('pulse', { dur: 3, s: 1.08 })}/>` +
      `<g transform="translate(184 79)"><g${once('pop', { delay: 0.4, dur: 0.9 })}><image href="${evoIcon(n.id)}" width="112" height="112"/></g></g>` +
      sparkle(240, 135, color, 1.2, 1.6) + motes(`fallback-${n.id}`, 24, color, 60, 420, 40, 240, 5, 1.6));
  }

  export class Showcase {
    private root: HTMLElement | null = null;
    private done: (() => void) | null = null;
    private timers: number[] = [];
    private idle = 0;
    private returnFocus: HTMLElement | null = null;

    constructor(private readonly host: HTMLElement, private readonly hooks: ShowcaseHooks) {}

    get open(): boolean {
      return this.root !== null;
    }

    show(e: ChronicleEntry, done: () => void): void {
      this.close();
      const n = e.nodeId ? EVO_BY_ID.get(e.nodeId) : undefined;
      if (!n) { done(); return; }
      this.done = done;
      const story = EVO_STORIES[n.id];
      const color = KINGDOM_COLOR[n.kingdom];
      const active = document.activeElement;
      this.returnFocus = active instanceof HTMLElement && active !== document.body ? active : null;

      const backdrop = make('div', 'showcase-backdrop');
      const card = make('div', `showcase glass k-${n.kingdom}${e.spontaneous ? ' spontaneous' : ''}`);
      card.style.setProperty('--k', color);
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-labelledby', 'showcase-title');

      // --- the film ---
      const stage = make('div', 'showcase-film');
      const screen = make('div', 'showcase-screen');
      const caption = make('div', 'showcase-caption');
      caption.setAttribute('aria-live', 'polite');
      const stamp = make('div', 'showcase-stamp');
      if (story) stamp.append(make('b', undefined, story.when), make('span', undefined, story.era));
      const timeline = make('div', 'showcase-timeline');
      const bar = make('span');
      timeline.appendChild(bar);
      const replay = button({ label: 'Film noch einmal', icon: uiIcon('replay'), cls: 'icon-btn showcase-replay', showLabel: false, onClick: () => play() });
      stage.append(screen, stamp, caption, timeline, replay);

      const play = (): void => {
        this.clearTimers();
        screen.innerHTML = EVO_FILMS[n.id]?.() ?? fallbackFilm(n);
        bar.style.animation = 'none';
        void bar.offsetWidth;
        bar.style.animation = '';
        caption.classList.remove('show');
        if (!story) return;
        story.beats.forEach((text, k) => {
          this.timers.push(window.setTimeout(() => {
            caption.classList.remove('show');
            void caption.offsetWidth;
            caption.textContent = text;
            caption.classList.toggle('key', k === FILM_KEY_BEAT);
            caption.classList.add('show');
          }, 300 + k * (FILM_SECONDS / story.beats.length) * 1000));
        });
      };

      // --- the words ---
      const body = make('div', 'showcase-body');
      const head = make('div', 'showcase-head');
      const badge = make('div', 'showcase-badge');
      badge.appendChild(pixelArt(evoIcon(n.id), 38, 'showcase-badge-img'));
      const titles = make('div', 'showcase-titles');
      const kicker = make('div', 'showcase-kicker');
      kicker.append(make('span', undefined, `Neue Entwicklung · ${KINGDOM_LABEL[n.kingdom]}`));
      if (e.spontaneous) kicker.appendChild(make('span', 'showcase-spont', 'Von selbst entstanden'));
      const title = make('h2', 'showcase-title', e.title);
      title.id = 'showcase-title';
      titles.append(kicker, title, make('div', 'showcase-sub', `${n.name} · ${n.short}`));
      const { developed, total } = this.hooks.progress();
      const count = make('div', 'showcase-count');
      count.append(make('b', undefined, String(developed)), make('span', undefined, `von ${total}`));
      count.title = 'Entwickelte Schritte im Evolutionsbaum';
      head.append(badge, titles, count);
      body.appendChild(head);

      if (e.spontaneous) {
        body.appendChild(make('p', 'showcase-note', 'Die Natur war schneller: Alle Bedingungen waren lange erfüllt, und der Schritt ist ganz ohne Evolutionspunkte entstanden.'));
      }
      body.appendChild(make('p', 'showcase-story', story ? story.story : n.description));
      if (story) {
        const learn = make('div', 'showcase-learn');
        const key = make('div', 'showcase-fact showcase-key');
        key.append(make('span', 'showcase-fact-kicker', 'Durchbruch'), make('b', 'showcase-key-name', story.innovation), make('span', undefined, story.advantage));
        const fact = make('div', 'showcase-fact');
        fact.append(make('span', 'showcase-fact-kicker', 'Wusstest du?'), make('span', undefined, story.fact));
        learn.append(key, fact);
        body.appendChild(learn);
      }
      const change = make('div', 'showcase-change');
      change.append(img(uiIcon('check'), 'ico'), make('span', undefined, e.change));
      body.appendChild(change);

      const actions = make('div', 'showcase-actions');
      actions.append(
        button({ label: 'Im Evolutionsbaum', icon: uiIcon('evolution'), cls: 'btn btn-ghost', onClick: () => { this.close(); this.hooks.view(n.id); } }),
      );
      if (e.at !== undefined) {
        actions.append(button({ label: 'Auf der Karte zeigen', icon: uiIcon('target'), cls: 'btn btn-ghost', onClick: () => { this.close(); this.hooks.showOnMap(e); } }));
      }
      const next = button({ label: 'Weiter', cls: 'btn btn-primary showcase-next', onClick: () => this.close() });
      actions.append(next);
      body.appendChild(actions);

      card.append(stage, body);
      backdrop.appendChild(card);
      this.host.appendChild(backdrop);
      this.root = backdrop;

      card.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); this.close(); }
      });
      // Reading takes as long as it takes: the pointer on the card holds it.
      const hold = (): void => window.clearTimeout(this.idle);
      const release = (): void => { hold(); this.idle = window.setTimeout(() => this.close(), SHOWCASE_IDLE_MS); };
      card.addEventListener('pointerenter', hold);
      card.addEventListener('pointerleave', release);
      backdrop.addEventListener('pointerdown', (ev) => { if (ev.target === backdrop) this.close(); });
      release();

      play();
      next.focus({ preventScroll: true });
      const r = badge.getBoundingClientRect();
      // A hidden card has no box: a burst would go off in the top-left corner.
      if (r.width > 0) celebrate(r.left + r.width / 2, r.top + r.height / 2, n.kingdom);
      const volume = this.hooks.sound();
      if (volume > 0) playChime(!!e.spontaneous, volume);
    }

    private clearTimers(): void {
      for (const t of this.timers) window.clearTimeout(t);
      this.timers.length = 0;
    }

    close(): void {
      if (!this.root) return;
      const root = this.root;
      this.root = null;
      this.clearTimers();
      window.clearTimeout(this.idle);
      root.classList.add('leaving');
      window.setTimeout(() => root.remove(), 280);
      const back = this.returnFocus;
      this.returnFocus = null;
      if (root.contains(document.activeElement)) {
        (back && back.isConnected ? back : document.querySelector<HTMLElement>('.world-canvas'))?.focus({ preventScroll: true });
      }
      const done = this.done;
      this.done = null;
      done?.();
    }
  }
}
