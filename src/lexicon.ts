/* =============================================================================
 * SimEarth 2.0 — the species lexicon
 * -----------------------------------------------------------------------------
 * All 136 sub-species at a glance, group by group in the order of the
 * evolution tree: what the planet has produced as portraits, what is still
 * missing as silhouettes with a hint. Every entry opens the info box.
 * ========================================================================== */

namespace SE {
  type LexiconFilter = 'all' | 'found' | 'missing' | 'extinct';

  const LEXICON_FILTERS: readonly (readonly [LexiconFilter, string])[] = [
    ['all', 'Alle'], ['found', 'Entdeckt'], ['missing', 'Fehlend'], ['extinct', 'Ausgestorben'],
  ];

  export class LexiconPanel {
    private filter: LexiconFilter = 'all';
    private builtVersion = '';
    /** Portraits are the bulk of the markup (~1.7 MB for all 136): a rebuild moves them instead of parsing them anew. */
    private readonly pics = new Map<string, HTMLElement>();

    constructor(
      private readonly host: HTMLElement,
      private readonly deps: { world: () => WorldState; dex: () => FaunaDex; open: (c: Life, stage: number) => void },
    ) {}

    update(force = false): void {
      const dex = this.deps.dex();
      // The era's fate changes what the dinosaurs' and mammals' heads say.
      const version = `${dex.version}|${this.deps.world().dinoEra.fate}`;
      if (!force && version === this.builtVersion) return;
      this.builtVersion = version;
      this.build();
    }

    private matches(c: Life, s: number): boolean {
      const st = this.deps.dex().status(c, s);
      switch (this.filter) {
        case 'found': return st !== 'unknown';
        case 'missing': return st === 'unknown';
        case 'extinct': return st === 'extinct';
        default: return true;
      }
    }

    private build(): void {
      const dex = this.deps.dex();
      const active = document.activeElement as HTMLElement | null;
      const focusKey = active && this.host.contains(active) ? active.dataset.focusKey ?? null : null;

      const root = make('div', 'fauna-lex');
      root.appendChild(this.header(dex));
      let shown = 0;
      for (const n of EVO_NODES) {
        if (n.life === undefined) continue;
        const group = this.group(dex, n.life, n.id);
        if (group) { root.appendChild(group); shown++; }
      }
      if (shown === 0) {
        const empty = make('div', 'empty-state');
        empty.append(img(uiIcon('tool-life'), 'empty-art'), make('p', undefined, this.filter === 'extinct'
          ? 'Bisher ist keine entdeckte Art ausgestorben.'
          : this.filter === 'found' ? 'Noch keine Art entdeckt. Entwickle im Evolutionsbaum die ersten Zellen.' : 'Alle Arten sind entdeckt.'));
        root.appendChild(empty);
      }
      this.host.replaceChildren(root);
      if (focusKey) this.host.querySelector<HTMLElement>(`[data-focus-key="${focusKey}"]`)?.focus({ preventScroll: true });
    }

    private header(dex: FaunaDex): HTMLElement {
      const head = make('div', 'fauna-lex-head');
      const found = dex.discoveredCount();
      const total = FaunaDex.TOTAL;
      const count = make('div', 'fauna-lex-count');
      count.append(make('strong', undefined, `${found} / ${total}`), make('span', undefined, ' entdeckt'));
      const bar = make('div', 'fauna-progress');
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-label', 'Entdeckte Arten');
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', String(total));
      bar.setAttribute('aria-valuenow', String(found));
      const fill = make('span');
      fill.style.width = `${(found / total) * 100}%`;
      bar.appendChild(fill);

      const filters = make('div', 'fauna-filters');
      filters.setAttribute('role', 'group');
      filters.setAttribute('aria-label', 'Anzeigen');
      for (const [key, label] of LEXICON_FILTERS) {
        const b = button({ label, cls: 'chip-btn', onClick: () => { this.filter = key; this.build(); } });
        b.dataset.focusKey = `filter:${key}`;
        setPressed(b, this.filter === key);
        filters.appendChild(b);
      }
      head.append(count, bar, filters);
      return head;
    }

    private group(dex: FaunaDex, c: Life, id: string): HTMLElement | null {
      const tiles = make('div', 'fauna-grid');
      for (let s = 0; s < SUBSPECIES_PER_CLASS; s++) if (this.matches(c, s)) tiles.appendChild(this.tile(dex, c, s));
      if (tiles.childElementCount === 0) return null;
      const sec = make('section', 'fauna-group');
      sec.dataset.group = id;
      const head = make('div', 'fauna-group-head');
      const title = make('h3', 'fauna-group-name', LIFE[c].name);
      title.id = `fauna-group-${id}`;
      sec.setAttribute('aria-labelledby', title.id);
      head.append(pixelArt(evoIcon(id), 15, 'fauna-group-icon'), title, make('span', 'fauna-group-count', `${dex.discoveredCount(c)} / ${SUBSPECIES_PER_CLASS} entdeckt`));
      const world = this.deps.world();
      const era = c === Life.Dinosaur && world.dinoEra.fate === 'extinct' ? 'Durch den Kometen für immer ausgestorben'
        : stageCap(world, c) < SUBSPECIES_PER_CLASS - 1
          ? `Unterart ${stageCap(world, c) + 2} bis ${SUBSPECIES_PER_CLASS} ${world.dinoEra.fate === 'kept' ? 'gesperrt: Die Dinosaurier haben überlebt' : 'erst nach dem Kometeneinschlag'}` : '';
      if (era) head.appendChild(make('span', 'fauna-group-count', `· ${era}`));
      sec.append(head, tiles);
      return sec;
    }

    private tile(dex: FaunaDex, c: Life, s: number): HTMLButtonElement {
      const known = dex.isDiscovered(c, s);
      const st = faunaStatus(dex, c, s, this.deps.world());
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `fauna-tile${known ? '' : ' is-unknown'}${st ? ` ${st.cls}` : ''}`;
      b.dataset.focusKey = `tile:${c}:${s}`;
      b.appendChild(this.picture(c, s, known, st?.cls.includes('is-gone') === true));
      const where = `${LIFE[c].name}, ${faunaStageLabel(s)}`;
      if (known) {
        const name = subspeciesName(c, s);
        const label = make('span', 'fauna-tile-name', name);
        label.style.setProperty('--chars', String(Math.max(...name.split(/[\s-]/).map((w) => w.length))));
        b.appendChild(label);
        // The R.I.P. band says "for good"; the tile keeps the short word.
        if (st && st.cls !== 'is-living') b.appendChild(make('span', `fauna-tile-mark ${st.cls}`, st.cls.includes('is-gone') ? 'ausgestorben' : st.text));
        b.setAttribute('aria-label', `${name} – ${where}${st && st.cls !== 'is-living' ? `, ${st.text}` : ''}`);
      } else {
        b.appendChild(make('span', 'fauna-tile-name', '???'));
        const hint = SPECIES_LORE[c]?.[s]?.hint;
        if (hint) b.appendChild(make('span', 'fauna-tile-hint', hint));
        b.setAttribute('aria-label', `Unbekannte Art – ${where}${hint ? `. Hinweis: ${hint}` : ''}`);
      }
      b.addEventListener('click', () => this.deps.open(c, s));
      return b;
    }

    private picture(c: Life, s: number, known: boolean, gone: boolean): HTMLElement {
      const key = `${c}:${s}:${known ? 'k' : 'u'}${gone ? 'g' : ''}`;
      let pic = this.pics.get(key);
      if (!pic) {
        pic = faunaPicture(c, s, known, `fauna-pic-md${gone ? ' is-gone' : ''}`);
        this.pics.set(key, pic);
      }
      return pic;
    }
  }
}
