/* =============================================================================
 * SimEarth 2.0 — the Report window
 * -----------------------------------------------------------------------------
 * Where the planet stands and where it is heading: the next step, the vital
 * signs each with its recent course as a sparkline and a trend, the surface
 * as one bar of habitats, and the state of civilization.
 * ========================================================================== */

namespace SE {
  export interface NextStep {
    readonly title: string;
    readonly text: string;
    readonly id: string | null;
  }

  interface Vital {
    readonly key: string;
    readonly icon: string;
    readonly label: string;
    /** Index into HistoryRecorder.series. */
    readonly series: number;
    readonly color: string;
    readonly value: (w: WorldState) => string;
    readonly delta: (d: number) => string;
    /** Changes smaller than this read as steady. */
    readonly still: number;
  }

  /** How far back the trend looks, in history samples. */
  const TREND_SAMPLES = 24;

  const landShare = (w: WorldState): number => Math.max(0.01, 1 - w.oceanFraction);

  function vitals(): readonly Vital[] {
    return [
      { key: 'temp', icon: resIcon('temperature'), label: 'Mitteltemperatur', series: 0, color: '#ff7a6b', value: (w) => `${fmt.one(w.globalTemp)} °C`, delta: (d) => `${fmt.one(d)} °C`, still: 0.1 },
      { key: 'o2', icon: resIcon('oxygen'), label: 'Sauerstoff', series: 2, color: '#7fe0f0', value: (w) => `${fmt.one(w.o2)} %`, delta: (d) => `${fmt.one(d)} %`, still: 0.1 },
      { key: 'co2', icon: resIcon('co2'), label: 'Kohlendioxid', series: 1, color: '#c8a078', value: (w) => `${fmt.int(w.co2)} ppm`, delta: (d) => `${fmt.int(d)} ppm`, still: 2 },
      { key: 'veg', icon: resIcon('biomass'), label: 'Pflanzendecke an Land', series: 4, color: '#8ad16f', value: (w) => fmt.pct(w.vegetationCoverage / landShare(w)), delta: (d) => `${fmt.one(d * 100)} Pkt.`, still: 0.001 },
      { key: 'cover', icon: uiIcon('layer-life'), label: 'Belebte Fläche', series: 5, color: '#f2a35c', value: (w) => fmt.pct(w.lifeCover), delta: (d) => `${fmt.one(d * 100)} Pkt.`, still: 0.001 },
      { key: 'groups', icon: resIcon('diversity'), label: 'Lebende Gruppen', series: 7, color: '#b48cff', value: (w) => fmt.int(livingGroups(w)), delta: (d) => fmt.int(d), still: 0.5 },
    ];
  }

  export class ReportPanel {
    onOpenNode: ((id: string) => void) | null = null;
    private built = false;
    private nextArt!: HTMLImageElement;
    private nextTitle!: HTMLElement;
    private nextText!: HTMLElement;
    private nextBtn!: HTMLButtonElement;
    private nextId: string | null = null;
    private readonly cards = new Map<string, { value: HTMLElement; trend: HTMLElement; spark: HTMLElement; sig: string }>();
    private readonly meta = new Map<string, { value: HTMLElement; sub: HTMLElement; fill: HTMLElement | null }>();
    private surfaceHost!: HTMLElement;
    private surfaceSig = '';
    private civHost!: HTMLElement;
    private civSig = '';
    private readonly vitals = vitals();

    constructor(private readonly host: HTMLElement, private readonly nextStep: () => NextStep, private readonly recorder: HistoryRecorder) {}

    /**
     * Built once, then only the figures are written. Rebuilding the window on
     * a timer (as it first did) replaced buttons under the pointer, so a
     * click that started on one node and ended on its replacement was lost.
     */
    private build(): void {
      this.built = true;
      const host = this.host;
      host.innerHTML = '';

      const next = make('section', 'report-next');
      this.nextArt = img(eventIcon('evolution'), 'report-next-art');
      const text = make('div', 'report-next-text');
      this.nextTitle = make('div', 'report-next-title');
      this.nextText = make('p');
      this.nextBtn = button({
        label: 'Im Evolutionsbaum ansehen', icon: uiIcon('evolution'), cls: 'btn btn-small',
        onClick: () => { if (this.nextId) this.onOpenNode?.(this.nextId); },
      });
      text.append(make('div', 'report-kicker', 'Nächster Schritt'), this.nextTitle, this.nextText, this.nextBtn);
      next.append(this.nextArt, text);

      const metaRow = make('div', 'report-meta');
      const metaCard = (key: string, icon: string, label: string, bar: boolean): void => {
        const card = make('div', 'meta-card');
        const value = make('div', 'meta-value');
        const sub = make('div', 'meta-sub');
        let fill: HTMLElement | null = null;
        card.append(img(icon, 'ico'), make('div', 'meta-label', label), value);
        if (bar) {
          const track = make('div', 'meta-bar');
          fill = make('span');
          track.appendChild(fill);
          card.appendChild(track);
        }
        card.appendChild(sub);
        metaRow.appendChild(card);
        this.meta.set(key, { value, sub, fill });
      };
      metaCard('age', uiIcon('globe'), 'Datum', false);
      metaCard('dev', uiIcon('evolution'), 'Evolutionsbaum', true);
      metaCard('gaia', uiIcon('gaia'), 'Gaia', true);

      const grid = make('div', 'vital-grid');
      for (const v of this.vitals) {
        const card = make('div', 'vital');
        card.style.setProperty('--c', v.color);
        const value = make('div', 'vital-value');
        const trend = make('span', 'vital-trend');
        const spark = make('div', 'vital-spark');
        const head = make('div', 'vital-head');
        head.append(img(v.icon, 'ico'), make('span', 'vital-label', v.label));
        card.append(head, value, trend, spark);
        grid.appendChild(card);
        this.cards.set(v.key, { value, trend, spark, sig: '' });
      }

      this.surfaceHost = make('div', 'report-surface');
      this.civHost = make('div', 'report-civ');
      host.append(next, metaRow, make('h4', 'report-h', 'Lebenszeichen'), grid,
        make('h4', 'report-h', 'Oberfläche'), this.surfaceHost, make('h4', 'report-h', 'Zivilisation'), this.civHost);
    }

    update(world: WorldState): void {
      if (!this.built) this.build();
      const step = this.nextStep();
      if (this.nextTitle.textContent !== step.title) this.nextTitle.textContent = step.title;
      if (this.nextText.textContent !== step.text) this.nextText.textContent = step.text;
      const art = step.id ? evoIcon(step.id) : eventIcon('evolution');
      if (!this.nextArt.src.endsWith(art)) this.nextArt.src = art;
      this.nextId = step.id;
      this.nextBtn.hidden = !step.id;

      this.updateMeta(world);
      for (const v of this.vitals) this.updateVital(world, v);
      this.updateSurface(world);
      this.updateCiv(world);
    }

    private updateMeta(world: WorldState): void {
      const put = (key: string, value: string, sub: string, fill?: number, color?: string): void => {
        const m = this.meta.get(key);
        if (!m) return;
        if (m.value.textContent !== value) m.value.textContent = value;
        if (m.sub.textContent !== sub) m.sub.textContent = sub;
        if (m.fill && fill !== undefined) {
          m.fill.style.width = `${Math.round(fill * 1000) / 10}%`;
          if (color) m.fill.style.background = color;
        }
      };
      put('age', formatEarthDate(world.absoluteYears), `${eraAt(world.absoluteYears).name} · Planetenalter ${formatYears(world.absoluteYears)}`);
      const dev = world.evo.developed.size;
      put('dev', `${dev} von ${EVO_NODES.length}`, `Schritte entwickelt · Schwierigkeit ${difficultyConfig(world).name}`,dev / EVO_NODES.length, 'var(--ep)');
      const mood = world.gaiaMood;
      put('gaia', GaiaPanel.moodLabel(mood), `Wohlbefinden ${Math.round(mood * 100)} %`, mood,
        mood > 0.66 ? 'var(--ok)' : mood > 0.33 ? 'var(--amber)' : 'var(--warn)');
    }

    private updateVital(world: WorldState, v: Vital): void {
      const card = this.cards.get(v.key);
      if (!card) return;
      const value = v.value(world);
      if (card.value.textContent !== value) card.value.textContent = value;
      const s = this.recorder.series[v.series];
      const data = s.data;
      const sig = `${data.length}|${data.length > 0 ? data[data.length - 1] : ''}`;
      if (sig === card.sig) return;
      card.sig = sig;
      card.spark.innerHTML = sparklineSvg(data, s.min, s.max, v.color, 120, 30);
      if (data.length < 2) {
        card.trend.textContent = 'noch kein Verlauf';
        card.trend.className = 'vital-trend';
        return;
      }
      const d = data[data.length - 1] - data[Math.max(0, data.length - 1 - TREND_SAMPLES)];
      const dir = Math.abs(d) < v.still ? 'flat' : d > 0 ? 'up' : 'down';
      card.trend.className = `vital-trend ${dir}`;
      card.trend.textContent = dir === 'flat' ? 'stabil' : `${d > 0 ? '+' : '−'}${v.delta(Math.abs(d))}`;
    }

    private updateSurface(world: WorldState): void {
      const rows: { b: number; share: number }[] = [];
      for (let b = 0; b < BIOME_COUNT; b++) {
        const share = world.biomeCounts[b] / TILE_COUNT;
        if (share >= 0.0005) rows.push({ b, share });
      }
      rows.sort((a, z) => z.share - a.share);
      const sig = rows.map((r) => `${r.b}:${Math.round(r.share * 200)}`).join(',');
      if (sig === this.surfaceSig) return;
      this.surfaceSig = sig;
      const host = this.surfaceHost;
      host.innerHTML = '';
      host.appendChild(segmentBar(rows.map((r) => ({ value: r.share, color: rgbCss(BIOME_COLORS[r.b]), title: `${BIOME_NAMES[r.b]}: ${fmt.pct(r.share)}` }))));
      const legend = make('ul', 'surface-legend');
      for (const r of rows) {
        const li = make('li');
        const sw = make('span', 'legend-swatch');
        sw.style.background = rgbCss(BIOME_COLORS[r.b]);
        li.append(sw, make('span', undefined, BIOME_NAMES[r.b]), make('span', 'surface-share', fmt.pct(r.share)));
        legend.appendChild(li);
      }
      host.appendChild(legend);
    }

    private updateCiv(world: WorldState): void {
      let top = Tech.None;
      let cities = 0;
      for (let t = TECH_COUNT - 1; t >= 1; t--) {
        cities += world.techCounts[t];
        if (world.techCounts[t] > 0 && top === Tech.None) top = t as Tech;
      }
      const coal = `${fmt.int(world.coal)} Gt`;
      const oil = `${fmt.int(world.oil)} Gt`;
      const wood = `${fmt.int(world.wood)} Gt`;
      const cut = `${fmt.int(world.woodCut)} Gt`;
      const civSig = `${world.sentientClass}|${top}|${cities}|${fmt.one(world.totalCityPop)}|${coal}|${oil}|${wood}|${cut}`;
      if (civSig === this.civSig) return;
      this.civSig = civSig;
      const civ = this.civHost;
      civ.innerHTML = '';
      if (world.sentientClass === Life.None) {
        civ.appendChild(make('p', 'report-note', 'Noch keine intelligente Art. Von selbst erwachen nur die Hominiden, nachdem ein Komet die Dinosaurier ausgelöscht hat – oder die Dinosaurier, wenn sie überlebt haben. Dazu müssen sie weit verbreitet sein, und die Luft muss mindestens 14 % Sauerstoff enthalten. Andere Tiergruppen erweckt nur der Monolith.'));
        return;
      }
      const grid = make('div', 'stat-grid');
      const stat = (icon: string, label: string, value: string): void => {
        const s = make('div', 'stat');
        s.append(img(icon, 'ico'), make('span', 'stat-label', label), make('span', 'stat-value', value));
        grid.appendChild(s);
      };
      stat(eventIcon('sentience'), 'Intelligente Art', LIFE[world.sentientClass].name);
      stat(eventIcon('civilization'), 'Technologie', TECH_NAMES[top]);
      stat(uiIcon('city'), 'Städte', fmt.int(cities));
      stat(resIcon('population'), 'Bevölkerungsindex', fmt.one(world.totalCityPop));
      stat(uiIcon('coal'), 'Kohlevorrat', coal);
      stat(uiIcon('oil'), 'Ölvorrat', oil);
      stat(evoIcon('broadleaf'), 'Holzvorrat', wood);
      if (world.woodCut > 0) stat(evoIcon('broadleaf'), 'Geschlagenes Holz', cut);
      civ.appendChild(grid);
      if (top === Tech.Nanotech) {
        civ.appendChild(make('p', 'report-note', 'Deine Zivilisation hat die höchste Technologiestufe erreicht. Das Spiel geht frei weiter – halte den Planeten im Gleichgewicht.'));
      }
    }
  }
}
