/* =============================================================================
 * SimEarth 2.0 — the four windows of the Graphs menu
 * -----------------------------------------------------------------------------
 * Not bare numbers but what they mean: the air as dials with the range life
 * is comfortable in, and a line on what the value does; the habitats as one
 * ring; the life forms as ranked bars; technology as a road of eras.
 * ========================================================================== */

namespace SE {
  export type GraphKind = 'air' | 'biomes' | 'life' | 'tech';

  const KINGDOM_COLOR: Readonly<Record<Kingdom, string>> = { origin: '#5ccfd0', plant: '#8ad16f', animal: '#f2a35c' };
  const KINGDOM_GROUP: Readonly<Record<Kingdom, string>> = { origin: 'Einzeller', plant: 'Pflanzen', animal: 'Tiere' };

  interface Dial {
    readonly label: string;
    readonly icon: string;
    readonly value: string;
    readonly scale: string;
    readonly at: number;
    readonly band: readonly [number, number];
    readonly color: string;
    readonly note: string;
    readonly warn?: boolean;
  }

  /** The lowest oxygen level some animal class still waits for, with who. */
  function oxygenNote(o2: number): string {
    let next = Infinity;
    for (let c = 1; c < LIFE_COUNT; c++) {
      const oxygen = lifeOxygen(c as Life);
      const need = oxygen.medium === 'air' ? oxygen.establish : 0;
      if (need > o2 && need < next) next = need;
    }
    if (next === Infinity) return 'Genug Sauerstoff für alle Tiergruppen.';
    const who: string[] = [];
    for (let c = 1; c < LIFE_COUNT; c++) {
      const oxygen = lifeOxygen(c as Life);
      if (oxygen.medium === 'air' && oxygen.establish === next) who.push(LIFE[c as Life].name);
    }
    return `Ab ${fmt.one(next)} % möglich: ${who.slice(0, 2).join(', ')}${who.length > 2 ? ' …' : ''}`;
  }

  /** What the sea does with the oxygen of its producers right now. */
  function seaOxygenNote(w: WorldState): string {
    if (!OXYGENIC_STAGE.some((on, s) => on && w.lifeStageCounts[Life.Prokaryote * SUBSPECIES_PER_CLASS + s] > 0)) return 'Aktuell keine Cyanobakterien: Die übrigen Mikroben setzen keinen Sauerstoff frei.';
    if (w.oceanIron >= IRON_DEPLETED) return 'Noch bindet gelöstes Eisen einen großen Teil des Sauerstoffs im Wasser.';
    if (w.oceanO2 < OCEAN_O2_RISEN) return 'Das Eisen ist verbraucht – jetzt reichert sich Sauerstoff an.';
    return 'Tauscht Sauerstoff mit der Luft aus, bis beide im Gleichgewicht sind.';
  }

  function airDials(w: WorldState): Dial[] {
    const co2 = w.co2;
    return [
      {
        label: 'Mitteltemperatur', icon: resIcon('temperature'), value: `${fmt.one(w.globalTemp)} °C`, scale: '−20 … 40 °C',
        at: (w.globalTemp + 20) / 60, band: [30 / 60, 40 / 60], color: '#ff7a6b',
        note: w.globalTemp < 0 ? 'Eiszeit – Leben zieht sich zurück.' : w.globalTemp > 30 ? 'Treibhausklima – viele Arten leiden.' : 'Angenehm für die meisten Lebensformen.',
        warn: w.globalTemp < 0 || w.globalTemp > 30,
      },
      {
        label: 'O₂ in der Luft', icon: resIcon('oxygen'), value: `${fmt.one(w.o2)} %`, scale: '0 … 40 %',
        at: w.o2 / 40, band: [15 / 40, 25 / 40], color: '#7fe0f0', note: oxygenNote(w.o2),
      },
      {
        label: 'O₂ im Meer', icon: uiIcon('layer-oceans'), value: `${fmt.int(w.oceanO2)} %`, scale: '0 … 120 % der heutigen Sättigung',
        at: w.oceanO2 / 120, band: [70 / 120, 1], color: '#4cb6d6', note: seaOxygenNote(w),
      },
      {
        label: 'Gelöstes Eisen', icon: uiIcon('map-terrain'), value: `${fmt.int(w.oceanIron * 100)} %`, scale: '0 … 100 % des Urmeers',
        at: w.oceanIron, band: [0, 0.1], color: '#c46a48',
        note: w.oceanIron >= IRON_DEPLETED
          ? 'Fängt den Sauerstoff im Meer ab und sinkt als Rost zu Boden: die Bändererze.'
          : 'Fast verbraucht – heiße Quellen am Meeresgrund liefern nur wenig nach.',
      },
      {
        label: 'Kohlendioxid', icon: resIcon('co2'), value: `${fmt.int(co2)} ppm`, scale: '0 … 2.000 ppm',
        at: co2 / 2000, band: [200 / 2000, 800 / 2000], color: '#c8a078',
        note: co2 < 280 ? 'Schwacher Treibhauseffekt.' : co2 <= 800 ? 'Gemäßigter Treibhauseffekt.' : co2 <= 1500 ? 'Starke Erwärmung durch Treibhausgas.' : 'Treibhaus außer Kontrolle.',
        warn: co2 > 1500,
      },
      {
        label: 'Wasserdampf', icon: uiIcon('layer-clouds'), value: `${fmt.int(w.vapor * 100)} %`, scale: 'Sättigung',
        at: w.vapor, band: [0.3, 0.7], color: '#6ea8ff', note: 'Bringt Wolken und Regen und hält Wärme fest.',
      },
      {
        label: 'Stickstoff', icon: uiIcon('overlay-wind'), value: `${fmt.int(w.n2)} %`, scale: '0 … 100 %',
        at: w.n2 / 100, band: [0.7, 0.85], color: '#aab4be', note: 'Trägt den Luftdruck – dichte Luft hält etwas Wärme.',
      },
      {
        label: 'Staub', icon: uiIcon('overlay-magma'), value: `${fmt.int(w.dust * 100)} %`, scale: 'Trübung',
        at: w.dust, band: [0, 0.08], color: '#c98a4a',
        note: w.dust < 0.05 ? 'Klare Luft.' : w.dust < 0.2 ? 'Dunst schluckt etwas Sonnenlicht.' : 'Verdunkelt die Sonne – der Planet kühlt ab.',
        warn: w.dust >= 0.2,
      },
    ];
  }

  export class GraphPanel {
    private sig = '';

    constructor(private readonly host: HTMLElement, private readonly kind: GraphKind) {}

    render(world: WorldState): void {
      switch (this.kind) {
        case 'air': this.renderAir(world); break;
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

    private renderAir(world: WorldState): void {
      const dials = airDials(world);
      if (!this.changed(dials.map((d) => `${d.value}|${Math.round(d.at * 300)}|${d.note}`).join('/'))) return;
      const grid = make('div', 'dial-grid');
      for (const d of dials) {
        const card = make('div', `dial-card${d.warn ? ' warn' : ''}`);
        const face = make('div', 'dial-face');
        face.innerHTML = gaugeSvg({ value: d.at, color: d.color, band: d.band, size: 104 });
        const mid = make('div', 'dial-mid');
        mid.append(img(d.icon, 'ico'), make('span', 'dial-value', d.value));
        face.appendChild(mid);
        const text = make('div', 'dial-text');
        const label = make('div', 'dial-label', d.label);
        label.style.setProperty('--chars', String(Math.max(...d.label.split(/[\s-]/).map((w) => w.length))));
        text.append(label, make('div', 'dial-scale', d.scale), make('p', 'dial-note', d.note));
        card.append(face, text);
        grid.appendChild(card);
      }
      const legend = make('p', 'graph-note');
      legend.append(make('span', 'band-key'), make('span', undefined, 'Der helle Bogen außen markiert den Bereich, in dem sich das Leben am wohlsten fühlt.'));
      this.host.append(grid, legend);
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
