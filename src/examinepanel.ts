/* The docked readout of one tile; simulation state is only read here. */
namespace SE {
  export class ExaminePanel {
    private signature = '';
    private tileSignature = '';
    private tile = -1;
    private hero: HTMLElement | null = null;
    onShowInTree: ((id: string) => void) | null = null;
    onShowSpecies: ((c: Life, stage: number) => void) | null = null;
    /** The creature the map shows on a tile (render.ts `creatureOn`). */
    creatureOn: ((world: WorldState, i: number) => { key: string; draw: () => HTMLCanvasElement } | null) | null = null;

    constructor(private readonly host: HTMLElement) {}

    invalidate(): void { this.signature = ''; }

    update(world: WorldState, x: number, y: number): void {
      const i = idx(x, y);
      const species = [...world.speciesOn(i)].sort((a, b) => b - a);
      const plants: Flora[] = [];
      for (let g = 1; g < FLORA_COUNT; g++) if (world.flora[i] & floraBit(g as Flora)) plants.push(g as Flora);
      plants.sort((a, b) => Number(b === world.floraTop[i]) - Number(a === world.floraTop[i]) || a - b);
      const state = LifeSystem.biomeStatusLabel(world, i);
      const creature = this.creatureOn?.(world, i) ?? null;
      const tileSig = [i, world.biome[i], world.landscape[i], world.landscapeZone[i], world.substrate[i], world.landscapeDensity[i],
        state, Math.round(world.temperature[i]), Math.round(world.rainfallCm(i)), world.altitudeMeters(i),
        Math.round(world.magma[i] * 30), landDigest(world, x, y), creature?.key ?? ''].join('|');
      const city = world.tech[i] === Tech.None ? '' : ExaminePanel.cityText(world, i);
      const river = world.riverLevel[i] > 0 ? `Fluss · ${fmt.int(RiverSystem.discharge(world, i))} m³/s` : '';
      const event = world.eventTtl[i] > 0 ? `Ereignis: ${EVENT_NAMES[world.eventKind[i]]}` : '';
      const scar = hazardLabel(world, i);
      const reef = reefNotes(world, i);
      const sig = [tileSig, fmt.pct(world.vegetation[i]), city, river, event, scar, ...reef,
        species.map(c => `${c}:${world.stage(i, c)}:${fmt.int(world.density(i, c) * 100)}:${LifeSystem.habitatLabel(world.density(i, c))}:${fmt.pct(world.lifeCounts[c] / TILE_COUNT)}:${examineAge(world, world.lifeFirstSeen[c])}`).join(','),
        plants.map(g => `${g}:${fmt.pct(world.floraCounts[g] / TILE_COUNT)}:${examineAge(world, world.evo.developed.get(FLORA[g].id)?.years ?? -1)}`).join(','),
        world.floraTop[i], growsAsCacti(world, i) ? 'cacti' : '',
      ].join('|');
      if (sig === this.signature) return;
      this.signature = sig;

      const sameTile = i === this.tile;
      const open = new Set(sameTile ? Array.from(this.host.querySelectorAll<HTMLDetailsElement>('details[open]'), d => d.dataset.entry) : []);
      const active = document.activeElement as HTMLElement | null;
      const focusKey = active && this.host.contains(active) ? active.dataset.focusKey : undefined;
      const scroller = this.host.closest<HTMLElement>('.win-body');
      const scrollTop = sameTile ? scroller?.scrollTop ?? 0 : 0;
      this.tile = i;
      if (!this.hero || tileSig !== this.tileSignature) {
        this.hero = this.tileHead(world, i, x, y, state, creature?.draw() ?? null);
        this.tileSignature = tileSig;
      }
      const actions: ExamineActions = {
        openTree: id => this.onShowInTree?.(id),
        openSpecies: (c, stage) => this.onShowSpecies?.(c, stage),
      };
      const flora = this.section('Pflanzen', 'tool-plant', plants.length ? `${fmt.pct(world.vegetation[i])} bedeckt` : '');
      if (!plants.length) flora.append(make('p', 'ex-empty', 'Keine Pflanzen'));
      for (const g of plants) flora.append(examinePlant(world, i, g, actions));
      const animals = this.section('Tiere & Einzeller', 'tool-life', species.length ? `${species.length} ${species.length === 1 ? 'Art' : 'Arten'}` : '');
      if (!species.length) animals.append(make('p', 'ex-empty', 'Keine Tiere oder Einzeller'));
      for (const c of species) animals.append(examineAnimal(world, i, c, actions));
      for (const details of [...flora.querySelectorAll('details'), ...animals.querySelectorAll('details')]) {
        details.open = open.has(details.dataset.entry);
      }
      const notes = make('div', 'ex-notes');
      if (river) notes.append(make('p', undefined, river));
      for (const line of reef) notes.append(make('p', undefined, line));
      if (city) {
        const line = make('p', undefined, city);
        const tribe = cityTribeColor(world, i);
        if (tribe >= 0) {
          const dot = make('span', 'chip-dot');
          dot.style.background = ART_PALETTE[tribeArtColor(tribe)];
          line.prepend(dot);
        }
        notes.append(line);
      }
      for (const text of [event, scar]) if (text) notes.append(make('p', 'ex-event', text));
      this.host.replaceChildren(this.hero, flora, animals);
      if (notes.childElementCount) this.host.append(notes);
      if (focusKey) this.host.querySelector<HTMLElement>(`[data-focus-key="${focusKey}"]`)?.focus({ preventScroll: true });
      if (scroller) scroller.scrollTop = scrollTop;
    }

    private section(title: string, icon: string, note: string): HTMLElement {
      const sec = make('section', 'ex-section');
      const head = make('h3', 'ex-section-title');
      head.append(img(uiIcon(icon)), document.createTextNode(title), make('span', undefined, note));
      sec.append(head);
      return sec;
    }

    private tileHead(world: WorldState, i: number, x: number, y: number, state: string, creature: HTMLCanvasElement | null): HTMLElement {
      const el = make('div', 'ex-tile');
      const picture = make('div', 'ex-picture');
      const canvas = examineTilePicture(world, x, y, creature);
      if (canvas) picture.append(canvas);
      else picture.append(img(habitatAsset(BIOME_ICONS[world.biome[i]]), 'ex-picture-fallback'));
      const meta = make('div', 'ex-meta');
      const name = world.isWater(i) ? BIOME_NAMES[world.biome[i]] : LANDSCAPE_NAMES[world.landscape[i]];
      const heading = make('h3', 'ex-place', name);
      heading.title = [landscapeLabel(world, i), altitudeBelt(world, i)].filter(Boolean).join(' · ');
      meta.append(heading, make('div', 'ex-state', `· ${state.toLocaleLowerCase('de')}`));
      const wind = ClimateSystem.airCurrent(y);
      const windName = `${wind.dy > 0 ? 'S' : 'N'}${wind.dx > 0 ? 'O' : 'W'}`;
      const rows: [string, string][] = [
        ['Temperatur', `${fmt.int(world.temperature[i])} °C`],
        ['Niederschlag', `${fmt.int(world.rainfallCm(i))} cm/Jahr`],
        [world.isWater(i) ? 'Tiefe' : 'Höhe', `${fmt.int(Math.abs(world.altitudeMeters(i)))} m`],
        ['Wind nach', windName],
        ['Magma', `${fmt.int(world.magma[i] * 30)} cm/Jahr`],
        ['Koordinaten', `${x} / ${y}`],
      ];
      const grid = make('dl', 'ex-facts');
      for (const [label, value] of rows) {
        const cell = make('div');
        const dd = make('dd', undefined, value);
        if (label === 'Wind nach') {
          const arrow = img(uiIcon('wind-arrow'), 'ex-wind');
          arrow.style.transform = `rotate(${Math.atan2(wind.dy, wind.dx) * 180 / Math.PI + 90}deg)`;
          dd.prepend(arrow);
        }
        cell.append(make('dt', undefined, label), dd);
        grid.append(cell);
      }
      meta.append(grid);
      el.append(picture, meta);
      return el;
    }

    private static cityText(world: WorldState, i: number): string {
      const era = TECH_NAMES[world.tech[i]];
      const pop = world.cityPop[i];
      const city = world.civ.cityAt(i);
      if (!city) return `${era}-Stadt, ${fmt.int(pop * 100)} %`;
      const tribe = world.civ.tribe(city.tribe);
      const g = cityGround(world, i);
      const lie = [g.river || riverBeside(world, i) ? 'am Fluss' : '', g.coast ? 'an der Küste' : ''].filter(Boolean).join(', ');
      return [
        city.name, tribe ? `Volk der ${tribe.name}` : '', `${CITY_SIZE_NAMES[citySize(pop)]}, ${era}`,
        `${fmt.int(city.capacity > 0 ? (pop / city.capacity) * 100 : 100)} % der Tragfähigkeit`, lie,
      ].filter(Boolean).join(' · ');
    }
  }
}
