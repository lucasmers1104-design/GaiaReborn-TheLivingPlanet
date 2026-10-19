/* Compact, expandable entries using the lexicon portraits and tree data. */
namespace SE {
  export interface ExamineActions {
    openTree(id: string): void;
    openSpecies(c: Life, stage: number): void;
  }

  export function examineAge(world: WorldState, born: number): string {
    if (born < 0) return '—';
    const age = Math.max(0, world.absoluteYears - born);
    return formatYears(age > 0 ? Number(age.toPrecision(2)) : 0);
  }

  export function examineRows(list: readonly (readonly [string, string])[]): HTMLElement {
    const grid = make('dl', 'ex-detail-facts');
    for (const [label, value] of list) grid.append(make('dt', undefined, label), make('dd', undefined, value));
    return grid;
  }

  function entry(key: string, icon: HTMLElement, name: string, stock: string): { el: HTMLDetailsElement; body: HTMLElement } {
    const el = document.createElement('details');
    el.className = 'ex-entry';
    el.dataset.entry = key;
    const summary = document.createElement('summary');
    summary.dataset.focusKey = key;
    summary.append(icon, make('span', 'ex-entry-name', name), make('span', 'ex-stock', stock));
    const body = make('div', 'ex-entry-body');
    el.append(summary, body);
    return { el, body };
  }

  function treeLink(id: string, actions: ExamineActions): HTMLButtonElement {
    const b = button({ label: 'Im Evolutionsbaum', icon: uiIcon('evolution'), cls: 'btn btn-small btn-ghost', onClick: () => actions.openTree(id) });
    b.dataset.focusKey = `tree:${id}`;
    return b;
  }

  export function examineAnimal(world: WorldState, i: number, c: Life, actions: ExamineActions): HTMLDetailsElement {
    // Corals only in warm water: elsewhere the class's highest form that builds no reef, as on the map.
    const stage = reefShownStage(world, i, c, world.stage(i, c));
    const density = world.density(i, c);
    const { el, body } = entry(`life:${c}`, faunaPicture(c, stage, true, ''), subspeciesName(c, stage), `${fmt.int(density * 100)} %`);
    body.append(make('div', 'ex-group', `${LIFE[c].name} · ${faunaStageLabel(stage)}`));
    body.append(examineRows([
      ['Bestand', `${LifeSystem.habitatLabel(density)} (${fmt.int(density * 100)} %)`],
      ['Verbreitung', fmt.pct(world.lifeCounts[c] / TILE_COUNT)],
      ['Alter der Gruppe', examineAge(world, world.lifeFirstSeen[c])],
    ]));
    const links = make('div', 'ex-links');
    const node = nodeForLife(c);
    if (node) links.append(treeLink(node.id, actions));
    const lexicon = button({ label: 'Art im Lexikon', icon: uiIcon('layer-life'), cls: 'btn btn-small btn-ghost', onClick: () => actions.openSpecies(c, stage) });
    lexicon.dataset.focusKey = `lexicon:${c}`;
    links.append(lexicon);
    body.append(links, examineHabitats(LIFE[c].suit, world.biome[i], `life:${c}`));
    return el;
  }

  export function examinePlant(world: WorldState, i: number, g: Flora, actions: ExamineActions): HTMLDetailsElement {
    const def = FLORA[g];
    const node = nodeForFlora(g);
    const lead = g === world.floraTop[i];
    const form = g !== Flora.Flowering ? '' : growsAsCacti(world, i) ? ' – hier als Kakteen'
      : landShowsSavannaTree(world, i) ? ' – hier als Savannenbaum' : '';
    const name = def.name + form;
    const { el, body } = entry(`flora:${g}`, img(evoIcon(def.id)), name, lead ? 'prägend' : 'vorhanden');
    body.append(make('div', 'ex-group', 'Pflanzengruppe'));
    body.append(examineRows([
      ['Bestand', lead ? 'Prägt das Feld' : 'Auf diesem Feld vorhanden'],
      ['Verbreitung', fmt.pct(world.floraCounts[g] / TILE_COUNT)],
      ['Alter der Gruppe', examineAge(world, node ? world.evo.developed.get(node.id)?.years ?? -1 : -1)],
    ]));
    if (node) {
      const links = make('div', 'ex-links');
      links.append(treeLink(node.id, actions));
      body.append(links, make('div', 'ex-group', 'Lebensräume'));
      const habitats = make('div', 'fauna-biomes ex-plant-habitats');
      for (const tag of node.habitat.tags) {
        const chip = make('span', 'fauna-biome');
        chip.append(img(habitatAsset(tag), 'ico'), make('span', undefined, HABITAT_TAG_NAMES[tag]));
        habitats.append(chip);
      }
      body.append(habitats);
    }
    return el;
  }

  /** `current`: the examined tile's biome, framed; -1 outside the Examine window. */
  export function examineHabitats(suit: readonly number[], current: number, key: string): HTMLElement {
    const root = make('div');
    const label = make('div', 'ex-habitats-label');
    label.append(make('span', undefined, 'Lebensräume'));
    if (current >= 0) label.append(make('span', 'ex-current-key', 'dieses Feld'));
    const icons = make('div', 'ex-habitats');
    for (let b = 0; b < BIOME_COUNT; b++) {
      const value = suit[b];
      const verdict = value <= 0 ? 'no' : value <= 0.30 ? 'bad' : value <= 0.80 ? 'medium' : 'good';
      const name = { no: 'nicht möglich', bad: 'schlecht', medium: 'mittel', good: 'gut' }[verdict];
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `ex-habitat${b === current ? ' is-current' : ''}`;
      item.dataset.verdict = verdict;
      item.dataset.focusKey = `${key}:habitat:${b}`;
      const tip = `${BIOME_NAMES[b]} · ${name}${b === current ? ' · Lebensraum dieses Feldes' : ''}`;
      item.title = tip;
      item.setAttribute('aria-label', tip);
      const tooltip = make('span', 'ex-habitat-tip', tip);
      item.append(img(habitatAsset(BIOME_ICONS[b]), 'ex-habitat-art'), img(uiIcon(`habitat-${verdict}`), 'ex-verdict'), tooltip);
      icons.append(item);
    }
    root.append(label, icons);
    return root;
  }
}
