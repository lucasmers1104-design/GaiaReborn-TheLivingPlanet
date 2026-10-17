/* =============================================================================
 * SimEarth 2.0 — the species info box
 * -----------------------------------------------------------------------------
 * One sub-species of the lexicon: its portrait and story, where it stands
 * among its neighbours, why it arose on this planet and under which
 * circumstances, and what its group needs and does in the simulation.
 * Everything under "Spielwerte" is read from the same tables the simulation
 * uses, and is the same for all eight sub-species of a group.
 * Undiscovered entries show only a silhouette, a hint and how they arise.
 * ========================================================================== */

namespace SE {
  export function faunaStageLabel(stage: number): string {
    return `Unterart ${stage + 1} von ${SUBSPECIES_PER_CLASS}`;
  }

  /** "lebt", "ausgestorben", "wieder aufgetaucht" — null while undiscovered. */
  export function faunaStatus(dex: FaunaDex, c: Life, stage: number): { readonly text: string; readonly cls: string } | null {
    const st = dex.status(c, stage);
    if (st === 'unknown') return null;
    if (st === 'extinct') return { text: 'ausgestorben', cls: 'is-extinct' };
    return dex.returns(c, stage) > 0 ? { text: 'wieder aufgetaucht', cls: 'is-returned' } : { text: 'lebt', cls: 'is-living' };
  }

  /** Portrait (or silhouette) in its dark frame. */
  export function faunaPicture(c: Life, stage: number, known: boolean, cls: string): HTMLElement {
    const box = make('span', `fauna-pic ${cls}${known ? '' : ' is-unknown'}`);
    // Pixel resolution: half (lg: a third) of the frame's inner CSS size; the 22 px examine entry
    // stays 1:1, at 11 px its animals were unreadable blobs.
    const size = cls.includes('fauna-pic-lg') ? 40 : cls.includes('fauna-pic-md') ? 28 : cls.includes('fauna-pic-sm') ? 20 : 22;
    // An image can't inherit `color`, so the silhouette gets the frame's ink baked in.
    const svg = speciesPicture(c, stage, known ? 'full' : 'silhouette', 'fauna-svg')
      .replace(/currentColor/g, getComputedStyle(document.documentElement).getPropertyValue('--ink-3').trim() || '#8394a8');
    box.appendChild(svg
      ? pixelArt(svg, size, /^<svg class="([^"]*)"/.exec(svg)?.[1] ?? 'fauna-svg')
      : pixelArt(evoIcon(LIFE[c].id), size, 'fauna-svg'));
    return box;
  }

  function biomeChips(list: readonly number[]): HTMLElement {
    const wrap = make('span', 'fauna-biomes');
    for (const b of list) {
      const chip = make('span', 'fauna-biome');
      chip.append(img(habitatAsset(BIOME_ICONS[b]), 'ico'), make('span', undefined, BIOME_NAMES[b]));
      wrap.appendChild(chip);
    }
    return wrap;
  }

  function rows(list: readonly (readonly [string, string | HTMLElement])[]): HTMLElement {
    const dl = make('dl', 'fauna-dl');
    for (const [k, v] of list) {
      const dd = make('dd');
      if (typeof v === 'string') dd.textContent = v;
      else dd.appendChild(v);
      dl.append(make('dt', undefined, k), dd);
    }
    return dl;
  }

  export function faunaSection(title: string, hint?: string): { el: HTMLElement; body: HTMLElement } {
    const el = make('section', 'fauna-sec');
    const head = make('div', 'fauna-sec-head');
    head.appendChild(make('h4', 'fauna-sec-title', title));
    if (hint) head.appendChild(make('span', 'fauna-sec-hint', hint));
    const body = make('div', 'fauna-sec-body');
    el.append(head, body);
    return { el, body };
  }

  export class SpeciesInfoPanel {
    private cur: FaunaRef | null = null;
    private builtSig = '';
    private live: { group: HTMLElement; stage: HTMLElement; share: HTMLElement | null; prev: HTMLElement | null; jump: HTMLButtonElement | null; reason: HTMLElement | null } | null = null;

    constructor(
      private readonly host: HTMLElement,
      private readonly deps: {
        world: () => WorldState;
        params: () => ModelParams;
        dex: () => FaunaDex;
        jump: (c: Life, stage: number) => boolean;
        openTree: (nodeId: string) => void;
      },
    ) {}

    show(c: Life, stage: number): void {
      if (!(c >= 1 && c < LIFE_COUNT && stage >= 0 && stage < SUBSPECIES_PER_CLASS)) return;
      const moved = !this.cur || this.cur.c !== c || this.cur.stage !== stage;
      this.cur = { c, stage };
      this.build(moved);
    }

    update(): void {
      if (!this.cur) return;
      if (this.signature() !== this.builtSig) this.build(false);
      else this.refreshLive();
    }

    /** Only what this box shows: a rebuild elsewhere in the lexicon would swallow a click here. */
    private signature(): string {
      const { c, stage } = this.cur as FaunaRef;
      const dex = this.deps.dex();
      const bio = this.deps.params().bio;
      const rec = this.deps.world().evo.developed.get(LIFE[c].id);
      const { before, after } = faunaNeighbours(dex, c, stage);
      const near = [...before, ...after].map(({ ref }) => `${ref.c}.${ref.stage}${dex.isDiscovered(ref.c, ref.stage) ? '+' : ''}`).join(',');
      const d = dex.discovery(c, stage);
      return [c, stage, dex.status(c, stage), dex.returns(c, stage) > 0, d ? `${d.tick}@${d.tile}${d.adopted ? 'a' : ''}` : '-', near,
        bio.tolerance, bio.mutationRate, bio.evolutionRate,
        rec ? `${rec.tick}${rec.spontaneous ? 's' : ''}${rec.migrated ? 'm' : ''}` : '-'].join('|');
    }

    private build(moved: boolean): void {
      const { c, stage } = this.cur as FaunaRef;
      const active = document.activeElement as HTMLElement | null;
      const focusKey = !moved && active && this.host.contains(active) ? active.dataset.focusKey ?? null : null;
      const dex = this.deps.dex();
      const known = dex.isDiscovered(c, stage);
      this.live = null;
      const root = make('div', `fauna-info${known ? '' : ' is-unknown'}`);
      const lineage = faunaLineage(dex, c, stage, (lc, ls) => this.show(lc, ls));
      if (known) root.append(this.head(c, stage), this.story(c, stage), lineage, this.origin(c, stage), this.values(c, stage));
      else root.append(this.unknownHead(c, stage), this.howItArises(c, stage), lineage);
      this.host.replaceChildren(root);
      this.builtSig = this.signature();
      this.refreshLive();
      if (focusKey) this.host.querySelector<HTMLElement>(`[data-focus-key="${focusKey}"]`)?.focus({ preventScroll: true });
      if (moved) {
        const scroller = this.host.closest<HTMLElement>('.win-body') ?? this.host;
        scroller.scrollTop = 0;
      }
    }

    /* ------------------------------------------------------- discovered -- */

    private head(c: Life, stage: number): HTMLElement {
      const dex = this.deps.dex();
      const st = faunaStatus(dex, c, stage);
      const head = make('div', 'fauna-info-head');
      head.appendChild(faunaPicture(c, stage, true, `fauna-pic-lg${st?.cls === 'is-extinct' ? ' is-extinct' : ''}`));
      const text = make('div', 'fauna-info-text');
      text.append(make('h3', 'fauna-info-name', subspeciesName(c, stage)), make('div', 'fauna-info-sub', `${LIFE[c].name} · ${faunaStageLabel(stage)}`));
      const chips = make('div', 'fauna-chips');
      if (st) chips.appendChild(make('span', `chip fauna-status ${st.cls}`, st.text));
      chips.appendChild(make('span', 'chip', LIFE[c].realm === 'sea' ? 'Meer' : 'Land'));
      text.appendChild(chips);
      const ma = subspeciesMa(c, stage);
      if (ma > 0) text.appendChild(make('p', 'fauna-info-ma', `Auf der Erde erstmals vor ${formatYearsAmount(ma * 1e6)} Jahren`));

      const actions = make('div', 'fauna-actions');
      const jump = button({ label: 'Zur Art springen', icon: uiIcon('target'), cls: 'btn btn-small btn-primary' });
      jump.dataset.focusKey = 'jump';
      const reason = make('p', 'fauna-reason', 'Derzeit lebt keine Population dieser Unterart.');
      jump.addEventListener('click', () => {
        if (jump.getAttribute('aria-disabled') === 'true') return;
        if (!this.deps.jump(c, stage)) this.setJumpable(false);
      });
      actions.append(jump, this.treeButton(c), reason);
      text.appendChild(actions);
      head.appendChild(text);
      this.live = { group: make('span'), stage: make('span'), share: null, prev: null, jump, reason };
      return head;
    }

    private treeButton(c: Life): HTMLButtonElement {
      const b = button({ label: 'Im Evolutionsbaum', icon: uiIcon('evolution'), cls: 'btn btn-small btn-ghost', onClick: () => this.deps.openTree(LIFE[c].id) });
      b.dataset.focusKey = 'tree';
      return b;
    }

    private story(c: Life, stage: number): HTMLElement {
      const lore = SPECIES_LORE[c]?.[stage];
      if (!lore) {
        const { el, body } = faunaSection('Über die Gruppe');
        body.appendChild(make('p', 'fauna-text', nodeForLife(c)?.description ?? ''));
        return el;
      }
      const { el, body } = faunaSection('Kurzbeschreibung');
      body.append(make('p', 'fauna-text', lore.about), make('h5', 'fauna-sub-title', 'Weiterentwicklung'), make('p', 'fauna-text', lore.evolution));
      return el;
    }

    private origin(c: Life, stage: number): HTMLElement {
      const { el, body } = faunaSection('Warum sie entstanden ist');
      body.appendChild(make('p', 'fauna-text', this.ruleText(c, stage, true)));
      const d = this.deps.dex().discovery(c, stage);
      body.appendChild(make('h5', 'fauna-sub-title', 'Umstände der Entdeckung'));
      if (!d || d.adopted) {
        body.appendChild(make('p', 'fauna-note', 'Aus einem älteren Spielstand übernommen – Umstände nicht überliefert.'));
        return el;
      }
      if (d.tile < 0) {
        body.appendChild(make('p', 'fauna-note', 'Nicht direkt beobachtet: Sie muss gelebt haben, weil eine spätere Unterart der Gruppe auftauchte.'));
        return el;
      }
      const list: [string, string][] = [['Wann', formatEarthDate(d.years)]];
      if (d.biome >= 0) list.push(['Lebensraum', BIOME_NAMES[d.biome]]);
      if (d.temp !== null) list.push(['Temperatur auf dem Feld', `${fmt.int(d.temp)} °C`]);
      if (d.o2 !== null) list.push(['Sauerstoff der Luft', `${d.o2 < 1 ? fmt.two(d.o2) : fmt.one(d.o2)} %`]);
      list.push(['Feld', `${d.tile % GRID_W} / ${Math.floor(d.tile / GRID_W)}`]);
      body.appendChild(rows(list));
      return el;
    }

    private ruleText(c: Life, stage: number, known: boolean): string {
      return faunaOriginRule(this.deps.world(), this.deps.params(), this.deps.dex(), c, stage, known);
    }

    private values(c: Life, stage: number): HTMLElement {
      const def = LIFE[c];
      const { el, body } = faunaSection('Lebensraum und Spielwerte', `gilt für die ganze Gruppe „${def.name}“`);
      const { best, more } = faunaBiomesBySuit(c);
      const [lo, hi] = faunaTempWindow(c, this.deps.params());
      const tolerance = fmt.int(mul(this.deps.params().bio.tolerance) * 100);
      const list: [string, string | HTMLElement][] = [['Lebensbereich', def.realm === 'sea' ? 'Meer' : 'Land']];
      if (best.length > 0) list.push(['Bevorzugt', biomeChips(best)]);
      if (more.length > 0) list.push(['Auch', biomeChips(more)]);
      list.push(['Temperatur', `${fmt.int(lo)} bis ${fmt.int(hi)} °C (Regler „Toleranz“ ${tolerance} %)`]);
      const oxygen = lifeOxygen(c);
      list.push(['Sauerstoff', oxygen.min > 0 ? `über ${faunaNum(oxygen.min)} ${oxygenUnit(oxygen.medium)}, volle Stärke ab ${faunaNum(oxygen.full)} %` : 'braucht keinen']);
      list.push(['Nahrung', faunaFoodText(c)]);
      if (def.diet.prey?.length) list.push(['Beute', faunaLifeNames(def.diet.prey)]);
      const enemies = faunaPredators(c);
      list.push(['Fressfeinde', enemies.length > 0 ? faunaLifeNames(enemies) : 'keine']);
      if (def.raft > 0) list.push(['Weite Ausbreitung', `gründet neue Populationen bis zu ${def.raft} Felder entfernt, auch jenseits von ${def.realm === 'sea' ? 'Land' : 'Wasser'}`]);
      list.push(['Intelligenz', def.sentient ? 'kann Intelligenz entwickeln und Städte gründen' : 'entwickelt keine Intelligenz']);
      body.appendChild(rows(list));

      const effects = make('ul', 'fauna-effects');
      for (const t of faunaEffects(c, this.deps.params())) effects.appendChild(make('li', undefined, t));
      body.append(make('h5', 'fauna-sub-title', 'Einfluss auf die Simulation'), effects);
      const needs = EVO_NODES.filter((n) => n.eco.some((e) => e.any.includes(def.id)));
      if (needs.length > 0) {
        body.appendChild(make('h5', 'fauna-sub-title', 'Wird gebraucht von'));
        const wrap = make('div', 'fauna-needed');
        for (const n of needs) {
          const label = n.eco.filter((e) => e.any.includes(def.id)).map((e) => e.label).join(', ');
          const b = button({ label: `${n.name} (${label})`, icon: evoIcon(n.id), cls: 'chip-btn', title: 'Im Evolutionsbaum ansehen', onClick: () => this.deps.openTree(n.id) });
          b.dataset.focusKey = `need:${n.id}`;
          wrap.appendChild(b);
        }
        body.appendChild(wrap);
      }

      body.appendChild(make('h5', 'fauna-sub-title', 'Aktuell'));
      const live = this.live;
      if (live) {
        const list2: [string, HTMLElement][] = [['Felder der Gruppe', live.group], ['Felder dieser Unterart', live.stage]];
        if (stage > 0) {
          live.share = make('span');
          list2.push([`Ab Unterart ${stage + 1}`, live.share]);
        }
        body.appendChild(rows(list2));
      }
      return el;
    }

    /* ----------------------------------------------------- undiscovered -- */

    private unknownHead(c: Life, stage: number): HTMLElement {
      const head = make('div', 'fauna-info-head');
      head.appendChild(faunaPicture(c, stage, false, 'fauna-pic-lg'));
      const text = make('div', 'fauna-info-text');
      text.append(make('h3', 'fauna-info-name', 'Unbekannte Art'), make('div', 'fauna-info-sub', `${LIFE[c].name} · ${faunaStageLabel(stage)}`));
      const chips = make('div', 'fauna-chips');
      chips.appendChild(make('span', 'chip fauna-status is-unknown', 'noch nicht entdeckt'));
      text.appendChild(chips);
      const hint = SPECIES_LORE[c]?.[stage]?.hint;
      if (hint) text.appendChild(make('p', 'fauna-hint', `Hinweis: ${hint}`));
      head.appendChild(text);
      return head;
    }

    private howItArises(c: Life, stage: number): HTMLElement {
      const { el, body } = faunaSection('Wie sie entsteht');
      body.appendChild(make('p', 'fauna-text', this.ruleText(c, stage, false)));
      const { best, more } = faunaBiomesBySuit(c);
      const [lo, hi] = faunaTempWindow(c, this.deps.params());
      const where = (best.length > 0 ? best : more).map((b) => BIOME_NAMES[b]).join(', ');
      body.appendChild(make('p', 'fauna-note', `Lebensraum der Gruppe: ${LIFE[c].realm === 'sea' ? 'Meer' : 'Land'} · bevorzugt ${where} · ${fmt.int(lo)} bis ${fmt.int(hi)} °C`));
      if (stage > 0) {
        const prev = make('span');
        body.appendChild(rows([[this.deps.dex().isDiscovered(c, stage - 1) ? `Felder mit „${subspeciesName(c, stage - 1)}“` : `Felder mit Unterart ${stage}`, prev]]));
        this.live = { group: make('span'), stage: make('span'), share: null, prev, jump: null, reason: null };
      }
      const actions = make('div', 'fauna-actions');
      actions.appendChild(this.treeButton(c));
      body.appendChild(actions);
      return el;
    }

    /* ------------------------------------------------------------- live -- */

    private setJumpable(on: boolean): void {
      const live = this.live;
      if (!live?.jump || !live.reason) return;
      const state = on ? 'false' : 'true';
      if (live.jump.getAttribute('aria-disabled') === state) return;
      live.jump.setAttribute('aria-disabled', state);
      live.jump.title = on ? 'Die Karte fährt zur dichtesten Population dieser Unterart' : 'Derzeit lebt keine Population dieser Unterart';
      live.reason.classList.toggle('hidden', on);
    }

    private refreshLive(): void {
      const live = this.live;
      const cur = this.cur;
      if (!live || !cur) return;
      const w = this.deps.world();
      const n = SUBSPECIES_PER_CLASS;
      const here = w.lifeStageCounts[cur.c * n + cur.stage];
      const set = (el: HTMLElement | null, text: string): void => { if (el && el.textContent !== text) el.textContent = text; };
      set(live.group, fmt.int(w.lifeCounts[cur.c]));
      set(live.stage, fmt.int(here));
      if (live.share) {
        let above = 0;
        for (let s = cur.stage; s < n; s++) above += w.lifeStageCounts[cur.c * n + s];
        const total = w.lifeCounts[cur.c];
        set(live.share, `${total > 0 ? fmt.int((above / total) * 100) : 0} % der Gruppe (neue entstehen nur unter ${fmt.int(STAGE_MAX_SHARE[cur.stage] * 100)} %)`);
      }
      if (live.prev && cur.stage > 0) set(live.prev, fmt.int(w.lifeStageCounts[cur.c * n + cur.stage - 1]));
      this.setJumpable(here > 0);
    }
  }
}
