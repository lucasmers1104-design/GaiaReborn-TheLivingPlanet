/* =============================================================================
 * SimEarth 2.0 — the four windows of the Graphs menu
 * -----------------------------------------------------------------------------
 * Not bare numbers but what they mean: the air in its own pixel-art window
 * (airpanel.ts); the habitats as one ring; the life forms as ranked bars;
 * technology as a road of eras.
 * ========================================================================== */

namespace SE {
  export type GraphKind = 'air' | 'biomes' | 'life' | 'tech';

  const KINGDOM_COLOR: Readonly<Record<Kingdom, string>> = { origin: '#5ccfd0', plant: '#8ad16f', animal: '#f2a35c' };
  const KINGDOM_GROUP: Readonly<Record<Kingdom, string>> = { origin: 'Einzeller', plant: 'Pflanzen', animal: 'Tiere' };

  export class GraphPanel {
    private sig = '';
    private air: AirPanel | null = null;

    constructor(private readonly host: HTMLElement, private readonly kind: GraphKind) {}

    render(world: WorldState, params: ModelParams): void {
      switch (this.kind) {
        case 'air': (this.air ??= new AirPanel(this.host)).render(world, params); break;
        case 'biomes': this.renderBiomes(world); break;
        case 'life': this.renderLife(world); break;
        case 'tech': this.renderTech(world); break;
      }
    }

    /** Rebuild only when what is shown actually changed. */
    private changed(sig: string): boolean {
      if (sig === this.sig) return false;
      this.sig = sig;
      this.host.innerHTML = '';
      return true;
    }

    private renderBiomes(world: WorldState): void {
      const rows: { b: number; share: number }[] = [];
      for (let b = 0; b < BIOME_COUNT; b++) {
        const share = world.biomeCounts[b] / TILE_COUNT;
        if (share >= 0.0005) rows.push({ b, share });
      }
      rows.sort((a, z) => z.share - a.share);
      if (!this.changed(rows.map((r) => `${r.b}:${Math.round(r.share * 1000)}`).join(','))) return;

      const wrap = make('div', 'biome-chart');
      const ring = make('div', 'biome-ring');
      ring.innerHTML = donutSvg(rows.map((r) => ({ value: r.share, color: rgbCss(BIOME_COLORS[r.b]) })), 176, 0.2);
      const centre = make('div', 'biome-ring-mid');
      const sea = world.oceanFraction;
      centre.append(make('span', 'biome-ring-big', fmt.pct(1 - sea)), make('span', 'biome-ring-small', 'Land'),
        make('span', 'biome-ring-sub', `${fmt.pct(sea)} Meer`));
      ring.appendChild(centre);
      const list = make('ul', 'biome-list');
      for (const r of rows) {
        const li = make('li');
        const sw = make('span', 'legend-swatch');
        sw.style.background = rgbCss(BIOME_COLORS[r.b]);
        li.append(sw, img(habitatAsset(BIOME_ICONS[r.b]), 'ico'), make('span', 'biome-name', BIOME_NAMES[r.b]), make('span', 'biome-share', fmt.pct(r.share)));
        list.appendChild(li);
      }
      wrap.append(ring, list);
      this.host.appendChild(wrap);
    }

    private renderLife(world: WorldState): void {
      const items = EVO_NODES.filter((n) => world.evo.isDeveloped(n.id)).map((n) => {
        const tiles = n.life !== undefined ? world.lifeCounts[n.life] : n.flora !== undefined ? world.floraCounts[n.flora] : 0;
        return { n, share: tiles / TILE_COUNT };
      });
      if (!this.changed(items.map((i) => `${i.n.id}:${Math.round(i.share * 2000)}`).join(',') || 'empty')) return;
      if (items.length === 0) {
        this.empty('life-formed', 'Noch gibt es hier nichts zu zeigen. Entwickle im Evolutionsbaum die ersten Lebensformen.');
        return;
      }
      const alive = items.filter((i) => i.share > 0).length;
      const top = Math.max(...items.map((i) => i.share), 0.0001);
      const summary = make('div', 'graph-summary');
      summary.append(make('span', 'chip chip-ok', `${alive} ${alive === 1 ? 'Gruppe lebt' : 'Gruppen leben'}`));
      if (alive < items.length) summary.append(make('span', 'chip chip-warn', `${items.length - alive} ausgestorben`));
      this.host.appendChild(summary);
      for (const kingdom of ['origin', 'plant', 'animal'] as const) {
        const group = items.filter((i) => i.n.kingdom === kingdom).sort((a, z) => z.share - a.share);
        if (group.length === 0) continue;
        this.host.appendChild(make('h4', 'graph-group', KINGDOM_GROUP[kingdom]));
        for (const { n, share } of group) {
          const row = make('div', `life-row${share > 0 ? '' : ' extinct'}`);
          const bar = make('div', 'life-bar');
          const fill = make('span');
          fill.style.width = `${Math.max(share > 0 ? 2 : 0, Math.round((share / top) * 1000) / 10)}%`;
          fill.style.background = KINGDOM_COLOR[kingdom];
          bar.appendChild(fill);
          const name = make('div', 'life-name');
          name.append(make('span', undefined, n.name), bar);
          row.append(img(evoIcon(n.id), 'life-icon'), name, make('span', 'life-share', share > 0 ? fmt.pct(share) : 'ausgestorben'));
          this.host.appendChild(row);
        }
      }
    }

    private renderTech(world: WorldState): void {
      let cities = 0;
      let top = Tech.None;
      for (let t = 1; t < TECH_COUNT; t++) {
        cities += world.techCounts[t];
        if (world.techCounts[t] > 0) top = t as Tech;
      }
      const coal = `${fmt.int(world.coal)} Gt`;
      const mined = `${fmt.int(world.coalMined)} Gt`;
      const oil = `${fmt.int(world.oil)} Gt`;
      const pumped = `${fmt.int(world.oilMined)} Gt`;
      const wood = `${fmt.int(world.wood)} Gt`;
      const cut = `${fmt.int(world.woodCut)} Gt`;
      if (!this.changed(`${Array.from(world.techCounts).join(',')}|${world.sentientClass}|${coal}|${mined}|${oil}|${pumped}|${wood}|${cut}`)) return;
      const road = make('ol', `tech-road${cities === 0 ? ' dormant' : ''}`);
      for (let t = 1; t < TECH_COUNT; t++) {
        const count = world.techCounts[t];
        const li = make('li', `tech-step${t <= top ? ' reached' : ''}${t === top ? ' current' : ''}`);
        const dot = make('span', 'tech-dot', String(t));
        // A soft hyphen before "…zeit…" lets the long names break where German would.
        const name = TECH_NAMES[t].replace(/([a-zß])(zeit)/, '$1­$2');
        li.append(make('span', 'tech-count', count > 0 ? fmt.int(count) : ''), dot, make('span', 'tech-name', name));
        road.appendChild(li);
      }
      this.host.appendChild(road);
      const facts = make('div', 'stat-grid');
      const stat = (icon: string, label: string, value: string): void => {
        const s = make('div', 'stat');
        s.append(img(icon, 'ico'), make('span', 'stat-label', label), make('span', 'stat-value', value));
        facts.appendChild(s);
      };
      if (cities === 0) {
        this.host.appendChild(make('p', 'graph-note', world.sentientClass !== Life.None
          ? `Noch gibt es keine Städte. Kleine Gruppen der ${mindName(world)} ziehen umher; bald werden sie sesshaft.`
          : 'Noch gibt es keine Städte. Eine Zivilisation entsteht, wenn Hominiden (nach dem Kometen) oder überlebende Dinosaurier Intelligenz entwickeln – oder durch den Monolithen.'));
      } else {
        stat(uiIcon('city'), 'Städte', fmt.int(cities));
        stat(eventIcon('civilization'), 'Höchste Stufe', TECH_NAMES[top]);
        if (world.sentientClass !== Life.None) stat(eventIcon('sentience'), 'Intelligente Art', LIFE[world.sentientClass].name);
        stat(resIcon('population'), 'Bevölkerungsindex', fmt.one(world.totalCityPop));
      }
      stat(evoIcon('clubmosses'), 'Kohlevorrat', coal);
      if (world.coalMined > 0) stat(evoIcon('clubmosses'), 'Abgebaute Kohle', mined);
      stat(uiIcon('oil'), 'Ölvorrat', oil);
      if (world.oilMined > 0) stat(uiIcon('oil'), 'Gefördertes Öl', pumped);
      stat(evoIcon('broadleaf'), 'Holzvorrat', wood);
      if (world.woodCut > 0) stat(evoIcon('broadleaf'), 'Geschlagenes Holz', cut);
      this.host.appendChild(facts);
    }

    private empty(art: string, text: string): void {
      const box = make('div', 'empty-state');
      box.append(img(eventIcon(art), 'empty-art'), make('p', undefined, text));
      this.host.appendChild(box);
    }
  }
}
