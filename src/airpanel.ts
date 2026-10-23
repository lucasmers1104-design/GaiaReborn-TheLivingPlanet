/* =============================================================================
 * Gaia Reborn — the window "Luftzusammensetzung"
 * -----------------------------------------------------------------------------
 * The air in the status bar's materials: gold-rimmed parchment cards on dark
 * wood, every gas with its molecule in pixel art, a pixel bar with the range
 * life is comfortable in, and its value. What a value means and how much it
 * warms the planet shows only in a tooltip, on hover or keyboard focus. From
 * the top: pressure and mean temperature, the air's mix, the oxygen's way
 * from the sea's iron into the air, then nitrogen, CO₂, methane, water vapour
 * and dust. Once the sea's iron is used up, that way gives place to an oxygen
 * row above nitrogen, like the other gases. Built once; a render rewrites only what changed. Canvas sizes and
 * the tooltip's position are inline (safe with a stale stylesheet);
 * css/airpanel.css paints.
 * ========================================================================== */

namespace SE {
  /** CSS px per art px the window's pixel art aims for; drawn in whole device px. */
  const AIR_U = 2;
  /** A value bar in art px: the bar's rows, then a gap row and the comfort band's two rows. */
  const BAR = { w: 56, h: 7, band: 3 } as const;
  /** The bars under the oxygen's three stages. */
  const STEP_BAR_W = 40;
  const MIX_H = 8;
  const MIX_MIN_W = 40;

  /** The gauges whose value carries the last tick's change, a button for its gas balance (gasbalanceview.ts). */
  const BALANCE_OF: Partial<Record<GaugeKey, GasId>> = { air: 'o2', o2: 'o2', co2: 'co2', ch4: 'ch4' };
  /** The gas rows' bars, art px: shorter than the cards', so a name keeps its room beside value and change. */
  const ROW_BAR_W = 48;

  /** UI palette steps of a bar's fill: shade, base, lit, glint. */
  type Ramp = readonly [string, string, string, string];

  interface Reading {
    readonly value: string;
    /** 0..1 along the bar, and the range life is comfortable in. */
    readonly at: number;
    readonly band: readonly [number, number];
    readonly text: string;
    readonly warn?: boolean;
  }

  /** The world and each gas's warming in °C, the "Treibhauseffekt" slider applied. */
  interface AirView {
    readonly w: WorldState;
    readonly heat: { readonly co2: number; readonly ch4: number; readonly vapor: number; readonly pressure: number };
    readonly bar: number;
  }

  type GaugeKey = 'press' | 'temp' | 'iron' | 'sea' | 'air' | 'o2' | 'n2' | 'co2' | 'ch4' | 'vapor' | 'dust';

  interface Gauge {
    readonly key: GaugeKey;
    readonly name: string;
    readonly formula?: string;
    readonly sprite: string;
    readonly ramp: Ramp;
    readonly scale: string;
    readonly read: (v: AirView) => Reading;
  }

  const warmth = (deg: number): string => (Math.abs(deg) < 0.05 ? '±0 °C' : `${deg < 0 ? '−' : '+'}${fmt.one(Math.abs(deg))} °C`);

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
    return `Ab ${fmt.one(next)} % möglich: ${who.slice(0, 2).join(', ')}${who.length > 2 ? ' …' : ''}.`;
  }

  /** What the sea does with the oxygen of its producers right now. */
  function seaOxygenNote(w: WorldState): string {
    if (!OXYGENIC_STAGE.some((on, s) => on && w.lifeStageCounts[Life.Prokaryote * SUBSPECIES_PER_CLASS + s] > 0)) return 'Aktuell keine Cyanobakterien: Die übrigen Mikroben setzen keinen Sauerstoff frei.';
    if (w.oceanIron >= IRON_DEPLETED) return 'Noch bindet gelöstes Eisen einen großen Teil des Sauerstoffs im Wasser.';
    if (w.oceanO2 < OCEAN_O2_RISEN) return 'Das Eisen ist verbraucht – jetzt reichert sich Sauerstoff an.';
    return 'Tauscht Sauerstoff mit der Luft aus, bis beide im Gleichgewicht sind.';
  }

  /** The air's oxygen, in the oxygen's way and in its own row. */
  function airOxygen(w: WorldState): Reading {
    return {
      value: `${fmt.one(w.o2)} %`, at: w.o2 / 40, band: [15 / 40, 25 / 40],
      text: `Kommt aus dem Meer, sobald es gesättigt ist, später auch von Landpflanzen. ${oxygenNote(w.o2)}`,
    };
  }

  function methaneNote(w: WorldState): string {
    if (w.o2 < AIR_O2_RISEN) return 'Starkes Treibhausgas. Archaeen bilden es im sauerstofffreien Meer; ohne Sauerstoff in der Luft reichert es sich an und hält den jungen Planeten warm.';
    if (w.ch4 > 5) return 'Der Sauerstoff baut das Methan ab: Das Methan-Treibhaus des jungen Planeten schwindet, es wird kühler.';
    const cities = w.techCounts.some((n, t) => t > 0 && n > 0);
    return `Sauerstoff baut Methan rasch ab. Es stammt aus Sümpfen und von Archaeen in sauerstoffarmem Schlamm${cities ? ', dazu aus Viehherden, Reisfeldern und Erdgas der Städte' : ''}.`;
  }

  const GAUGES: readonly Gauge[] = [
    {
      key: 'press', name: 'Luftdruck', sprite: 'air_baro', ramp: ['gold1', 'gold2', 'gold4', 'gold5'], scale: '0 … 2 bar',
      read: ({ bar, heat }) => ({
        value: `${fmt.two(bar)} bar`, at: bar / 2, band: [0.4, 0.6],
        text: `Die Summe aller Gase. Stickstoff trägt den größten Teil, den Sauerstoff hat erst das Leben hinzugefügt. Dichtere Luft hält mehr Wärme: ${warmth(heat.pressure)}.`,
      }),
    },
    {
      key: 'temp', name: 'Mitteltemperatur', sprite: 'air_temp', ramp: ['red0', 'red1', 'orange0', 'petalY3'], scale: '−20 … 40 °C',
      read: ({ w, heat }) => ({
        value: `${fmt.one(w.globalTemp)} °C`, at: (w.globalTemp + 20) / 60, band: [30 / 60, 40 / 60],
        text: `${w.globalTemp < 0 ? 'Eiszeit – Leben zieht sich zurück.' : w.globalTemp > 30 ? 'Treibhausklima – viele Arten leiden.' : 'Angenehm für die meisten Lebensformen.'} Treibhauswirkung: CO₂ ${warmth(heat.co2)}, Wasserdampf ${warmth(heat.vapor)}, Methan ${warmth(heat.ch4)}, Luftdruck ${warmth(heat.pressure)}.`,
        warn: w.globalTemp < 0 || w.globalTemp > 30,
      }),
    },
    {
      key: 'iron', name: 'Gelöstes Eisen', sprite: 'air_fe', ramp: ['laterite0', 'laterite1', 'laterite2', 'laterite3'], scale: '0 … 100 % des Urmeers',
      read: ({ w }) => ({
        value: `${fmt.int(w.oceanIron * 100)} %`, at: w.oceanIron, band: [0, 0.1],
        text: w.oceanIron >= IRON_DEPLETED
          ? 'Das Eisen (Fe²⁺) fängt den Sauerstoff im Meer ab und sinkt als Rost zu Boden: die Bändererze.'
          : 'Fast verbraucht – heiße Quellen am Meeresgrund liefern nur wenig nach.',
      }),
    },
    {
      key: 'sea', name: 'O₂ im Meer', sprite: 'air_o2_sea', ramp: ['water2', 'water4', 'water6', 'water7'], scale: '0 … 120 % der heutigen Sättigung',
      read: ({ w }) => ({ value: `${fmt.int(w.oceanO2)} %`, at: w.oceanO2 / 120, band: [70 / 120, 1], text: seaOxygenNote(w) }),
    },
    {
      key: 'air', name: 'O₂ in der Luft', sprite: 'air_o2_sky', ramp: ['glowT1', 'glowT2', 'glowT3', 'glowT4'], scale: '0 … 40 %',
      read: ({ w }) => airOxygen(w),
    },
    {
      key: 'o2', name: 'Sauerstoff', formula: 'O₂', sprite: 'air_o2', ramp: ['glowT1', 'glowT2', 'glowT3', 'glowT4'], scale: '0 … 40 % der Luft',
      read: ({ w }) => airOxygen(w),
    },
    {
      key: 'n2', name: 'Stickstoff', formula: 'N₂', sprite: 'air_n2', ramp: ['petalB0', 'petalB1', 'petalB2', 'petalB3'], scale: '0 … 100 % der Luft',
      read: ({ w }) => {
        const share = inertShares(w).n2;
        return {
          value: `${fmt.int(share)} %`, at: share / 100, band: [0.7, 0.85],
          text: 'Reaktionsträge Hauptmasse der Luft. Seine Menge ändert sich über die Erdgeschichte kaum; sein Anteil sinkt, wenn Sauerstoff dazukommt.',
        };
      },
    },
    {
      key: 'co2', name: 'Kohlendioxid', formula: 'CO₂', sprite: 'air_co2', ramp: ['rock1', 'rock2', 'rock3', 'rock4'], scale: '0 … 2.000 ppm',
      read: ({ w, heat }) => ({
        value: `${fmt.int(w.co2)} ppm`, at: w.co2 / 2000, band: [200 / 2000, 800 / 2000],
        text: `${w.co2 < 280 ? 'Schwacher Treibhauseffekt.' : w.co2 <= 800 ? 'Gemäßigter Treibhauseffekt.' : w.co2 <= 1500 ? 'Starke Erwärmung durch Treibhausgas.' : 'Treibhaus außer Kontrolle.'} Vulkane geben es ab, Pflanzen und Verwitterung binden es. Treibhauswirkung ${warmth(heat.co2)}.`,
        warn: w.co2 > 1500,
      }),
    },
    {
      key: 'ch4', name: 'Methan', formula: 'CH₄', sprite: 'air_ch4', ramp: ['petalY0', 'petalY1', 'petalY2', 'petalY3'], scale: '0 … 1.000 ppm, logarithmisch',
      read: ({ w, heat }) => ({
        value: `${w.ch4 < 10 ? fmt.one(w.ch4) : fmt.int(w.ch4)} ppm`, at: Math.log10(1 + w.ch4) / 3, band: [0, Math.log10(3) / 3],
        text: `${methaneNote(w)} Treibhauswirkung ${warmth(heat.ch4)}.`,
      }),
    },
    {
      key: 'vapor', name: 'Wasserdampf', formula: 'H₂O', sprite: 'air_h2o', ramp: ['ice1', 'ice2', 'ice3', 'ice4'], scale: '0 … 100 % Sättigung',
      read: ({ w, heat }) => ({
        value: `${fmt.int(w.vapor * 100)} %`, at: w.vapor, band: [0.3, 0.7],
        text: `Bringt Wolken und Regen und hält Wärme fest; warme Luft trägt mehr davon. Treibhauswirkung ${warmth(heat.vapor)}.`,
      }),
    },
    {
      key: 'dust', name: 'Staub', sprite: 'air_dust', ramp: ['soil0', 'soil1', 'soil2', 'soil3'], scale: '0 … 100 % Trübung',
      read: ({ w }) => ({
        value: `${fmt.int(w.dust * 100)} %`, at: w.dust, band: [0, 0.08],
        text: w.dust < 0.05 ? 'Klare Luft.' : w.dust < 0.2 ? 'Dunst schluckt etwas Sonnenlicht.' : 'Verdunkelt die Sonne – der Planet kühlt ab.',
        warn: w.dust >= 0.2,
      }),
    },
  ];

  /** The air's mix, largest first, with each gas's colours (bar fill: shade, base, lit) and share in percent. */
  function mixOf(w: WorldState): { label: string; ramp: readonly [string, string, string]; share: number }[] {
    const inert = inertShares(w);
    return [
      { label: 'N₂', ramp: ['petalB0', 'petalB1', 'petalB2'], share: inert.n2 },
      { label: 'O₂', ramp: ['glowT1', 'glowT2', 'glowT3'], share: w.o2 },
      { label: 'Ar', ramp: ['rock2', 'rock3', 'rock4'], share: inert.ar },
      { label: 'CO₂', ramp: ['rock0', 'rock1', 'rock2'], share: w.co2 / 1e4 },
      { label: 'CH₄', ramp: ['petalY1', 'petalY2', 'petalY3'], share: w.ch4 / 1e4 },
    ];
  }

  const shareText = (p: number): string => (p >= 10 ? fmt.int(p) : p >= 0.1 ? fmt.one(p) : p >= 0.01 ? fmt.two(p) : '< 0,01');

  /** A value bar: wood rim (red when warn), parchment inside, filled to `at`; the comfort band a green line below. */
  function drawBar(pc: PixelCanvas, w: number, r: Reading, ramp: Ramp, sc: UiScale): void {
    const ui = UiArt.shared();
    const ctx = pc.ctx;
    pc.size(w, BAR.h + BAR.band, sc);
    pc.clear();
    const fill = (c: string, x: number, y: number, fw: number, fh: number): void => {
      ctx.fillStyle = ui.color(c);
      ctx.fillRect(x, y, fw, fh);
    };
    const rim = r.warn ? 'red0' : 'wood1';
    fill(rim, 1, 0, w - 2, BAR.h);
    fill(rim, 0, 1, w, BAR.h - 2);
    fill('parch2', 1, 1, w - 2, BAR.h - 2);
    fill('parch1', 1, 1, w - 2, 1);
    const inner = w - 2;
    const n = Math.round(clamp(r.at, 0, 1) * inner);
    if (n > 0) {
      fill(ramp[1], 1, 1, n, BAR.h - 2);
      fill(ramp[2], 1, 1, n, 1);
      fill(ramp[0], 1, BAR.h - 2, n, 1);
      fill(ramp[3], n, 2, 1, BAR.h - 4);
    }
    const b0 = 1 + Math.round(clamp(r.band[0], 0, 1) * inner);
    const b1 = 1 + Math.round(clamp(r.band[1], 0, 1) * inner);
    if (b1 <= b0) return;
    fill('vine4', b0, BAR.h + 1, b1 - b0, 1);
    fill('vine2', b0, BAR.h + 2, b1 - b0, 1);
  }

  /** The mix as one bar of segments; every gas present gets at least a pixel, taken from the largest. */
  function drawMix(pc: PixelCanvas, w: number, mix: ReturnType<typeof mixOf>, sc: UiScale): void {
    const ui = UiArt.shared();
    const ctx = pc.ctx;
    pc.size(w, MIX_H, sc);
    pc.clear();
    const inner = w - 2;
    const total = mix.reduce((s, m) => s + m.share, 0) || 1;
    const widths = mix.map((m) => (m.share > 0 ? Math.max(1, Math.round((m.share / total) * inner)) : 0));
    widths[0] += inner - widths.reduce((s, x) => s + x, 0);
    ctx.fillStyle = ui.color('wood1');
    ctx.fillRect(1, 0, w - 2, MIX_H);
    ctx.fillRect(0, 1, w, MIX_H - 2);
    let x = 1;
    mix.forEach((m, k) => {
      const sw = widths[k];
      if (sw <= 0) return;
      const rows: [string, number, number][] = [[m.ramp[1], 1, MIX_H - 2], [m.ramp[2], 1, 1], [m.ramp[0], MIX_H - 2, 1]];
      for (const [c, y, h] of rows) {
        ctx.fillStyle = ui.color(c);
        ctx.fillRect(x, y, sw, h);
      }
      x += sw;
    });
  }

  interface Slot {
    readonly el: HTMLElement;
    readonly value: HTMLElement;
    readonly bar: PixelCanvas;
    readonly barW: number;
    readonly sprite: PixelCanvas;
    drawn: string;
    art: string;
  }

  interface Tip {
    readonly title: string;
    readonly scale: string;
    readonly text: string;
  }

  export class AirPanel {
    private root: HTMLElement | null = null;
    private readonly slots = new Map<GaugeKey, Slot>();
    private readonly steps: HTMLElement[] = [];
    private readonly arrows: PixelCanvas[] = [];
    private arrowsArt = '';
    private readonly tips = new Map<HTMLElement, Tip>();
    private readonly tip = make('div', 'air-tip');
    private tipFor: HTMLElement | null = null;
    private mixCard: HTMLElement | null = null;
    private readonly mixBar = new PixelCanvas('air-mix-bar', 0);
    private readonly mixLegend = make('div', 'air-legend');
    private mixDrawn = '';
    private readonly balance = new GasBalanceView(() => { if (this.tipFor) this.hideTip(this.tipFor); });
    /** Each gauge's value box, and the number with its balance that each gas has once. */
    private readonly amounts = new Map<GaugeKey, HTMLElement>();
    private readonly balanceNodes = new Map<GasId, HTMLElement[]>();
    private oxyCard: HTMLElement | null = null;
    /** The sea's iron is used up: oxygen shows as a gas row; null before the first render. */
    private ironGone: boolean | null = null;

    constructor(private readonly host: HTMLElement) {
      this.tip.id = 'air-tip';
      this.tip.setAttribute('role', 'tooltip');
      Object.assign(this.tip.style, { position: 'absolute', left: '0px', top: '0px', zIndex: '20', pointerEvents: 'none', display: 'none' });
      this.mixBar.canvas.style.position = 'static';
    }

    render(world: WorldState, params: ModelParams): void {
      if (!this.root) this.build();
      const ui = UiArt.shared();
      ui.load();
      const dpr = window.devicePixelRatio || 1;
      const s = Math.max(1, Math.round(AIR_U * dpr));
      const sc: UiScale = { s, dpr, u: s / dpr, beside: false };
      const art = `${ui.version}|${s}|${dpr}`;
      const terms = ClimateSystem.greenhouseTerms(world);
      const g = mul(params.atmo.greenhouse);
      const view: AirView = {
        w: world,
        heat: { co2: terms.co2 * g, ch4: terms.ch4 * g, vapor: terms.vapor * g, pressure: terms.pressure * g },
        bar: airPressure(world),
      };
      for (const gauge of GAUGES) {
        const slot = this.slots.get(gauge.key);
        if (!slot) continue;
        const r = gauge.read(view);
        if (slot.value.textContent !== r.value) slot.value.textContent = r.value;
        const sig = `${art}|${Math.round(clamp(r.at, 0, 1) * slot.barW)}|${r.warn ? 1 : 0}`;
        if (sig !== slot.drawn) {
          slot.drawn = sig;
          drawBar(slot.bar, slot.barW, r, gauge.ramp, sc);
        }
        if (slot.art !== art) {
          slot.art = art;
          drawUiSprite(slot.sprite, gauge.sprite, 0, sc);
        }
        slot.el.classList.toggle('warn', r.warn === true);
        const label = `${gauge.name}: ${r.value}`;
        if (slot.el.getAttribute('aria-label') !== label) slot.el.setAttribute('aria-label', label);
        this.tips.set(slot.el, { title: `${gauge.name}${gauge.formula ? ` (${gauge.formula})` : ''} · ${r.value}`, scale: gauge.scale, text: r.text });
      }
      const ironGone = world.oceanIron < IRON_DEPLETED || world.evo.chronicle.some((e) => e.key === 'oxygen:iron');
      if (ironGone !== this.ironGone) this.showOxygenAs(ironGone);
      this.renderOxygenWay(world, sc, art);
      this.renderMix(world, sc, art);
      this.balance.update(world.gas);
      if (this.tipFor) this.fillTip(this.tipFor);
    }

    /**
     * The oxygen's way while the sea still holds iron, else oxygen as a gas
     * row above nitrogen; its change number moves along (inline display: a
     * stale stylesheet cannot show both).
     */
    private showOxygenAs(row: boolean): void {
      this.ironGone = row;
      if (this.oxyCard) this.oxyCard.style.display = row ? 'none' : '';
      const o2 = this.slots.get('o2')?.el;
      if (o2) o2.style.display = row ? '' : 'none';
      const nodes = this.balanceNodes.get('o2');
      const host = this.amounts.get(row ? 'o2' : 'air');
      if (!nodes || !host || host.contains(nodes[0])) return;
      this.balance.close();
      host.append(...nodes);
    }

    /** The stage the oxygen is at: the iron still binds it, it fills the sea, it reaches the air, or all three are done. */
    private renderOxygenWay(w: WorldState, sc: UiScale, art: string): void {
      const now = w.oceanIron >= IRON_DEPLETED ? 0 : w.oceanO2 < OCEAN_O2_RISEN ? 1 : w.o2 < AIR_O2_RISEN ? 2 : -1;
      this.steps.forEach((el, k) => el.classList.toggle('now', k === now));
      if (art === this.arrowsArt) return;
      this.arrowsArt = art;
      for (const pc of this.arrows) drawUiSprite(pc, 'air_arrow', 0, sc);
    }

    private renderMix(w: WorldState, sc: UiScale, art: string): void {
      const card = this.mixCard;
      if (!card) return;
      const mix = mixOf(w);
      const width = Math.max(MIX_MIN_W, Math.floor((card.clientWidth - 24) / sc.u));
      const legend = mix.map((m) => `${m.label} ${shareText(m.share)} %`).join(' · ');
      const sig = `${art}|${width}|${mix.map((m) => Math.round(m.share * 100)).join(',')}`;
      if (sig !== this.mixDrawn) {
        this.mixDrawn = sig;
        drawMix(this.mixBar, width, mix, sc);
        this.mixLegend.replaceChildren(...mix.map((m) => {
          const item = make('span', 'air-legend-item');
          const sw = make('span', 'air-swatch');
          sw.style.background = UiArt.shared().color(m.ramp[1]);
          item.append(sw, make('span', undefined, `${m.label} ${shareText(m.share)} %`));
          return item;
        }));
      }
      card.setAttribute('aria-label', `Zusammensetzung der Luft: ${legend}`);
      this.tips.set(card, {
        title: 'Zusammensetzung der Luft', scale: 'Anteile am Luftdruck',
        text: 'Stickstoff und Argon ändern sich kaum. Sauerstoff kam mit dem Leben dazu; CO₂ und Methan sind nur Spuren, wärmen den Planeten aber stark.',
      });
    }

    private build(): void {
      const root = make('div', 'air');
      root.style.position = 'relative';
      const sum = make('div', 'air-sum');
      sum.append(this.card('press', 'air-card air-big'), this.card('temp', 'air-card air-big'));

      const mix = make('div', 'air-card air-mix');
      mix.append(make('div', 'air-name', 'Zusammensetzung der Luft'), this.mixBar.canvas, this.mixLegend);
      this.hoverable(mix);
      this.mixCard = mix;

      const oxy = make('div', 'air-card air-oxy');
      this.oxyCard = oxy;
      const way = make('div', 'air-way');
      (['iron', 'sea', 'air'] as const).forEach((key, k) => {
        if (k > 0) {
          const arrow = new PixelCanvas('air-arrow', 0);
          arrow.canvas.style.position = 'static';
          this.arrows.push(arrow);
          way.appendChild(arrow.canvas);
        }
        const step = this.card(key, 'air-step', STEP_BAR_W);
        this.steps.push(step);
        way.appendChild(step);
      });
      oxy.append(make('div', 'air-name', 'Sauerstoff: vom Meer in die Luft'), way);

      const list = make('div', 'air-list');
      for (const key of ['o2', 'n2', 'co2', 'ch4', 'vapor', 'dust'] as const) list.appendChild(this.card(key, 'air-card air-row', ROW_BAR_W));

      const key = make('p', 'air-key');
      key.append(make('span', 'air-key-line'), make('span', undefined, 'Grüne Linie unter einem Balken: der Bereich, in dem sich das Leben am wohlsten fühlt.'));
      const delta = make('p', 'air-key');
      delta.append(this.balance.legendChip('+0,1'), make('span', undefined, 'Δ letzter Simulationsschritt: Zeiger darauf oder anklicken öffnet die Details zu Quellen und Senken.'));
      root.append(sum, mix, oxy, list, key, delta, this.tip);
      this.host.appendChild(root);
      this.root = root;
    }

    /** One gauge's element: molecule, name (and formula), bar, value. */
    private card(key: GaugeKey, cls: string, barW: number = BAR.w): HTMLElement {
      const gauge = GAUGES.find((g) => g.key === key);
      if (!gauge) throw new Error(`AirPanel: no gauge '${key}'`);
      const el = make('div', cls);
      const sprite = new PixelCanvas('air-sprite', 0);
      const bar = new PixelCanvas('air-bar', 0);
      sprite.canvas.style.position = 'static';
      bar.canvas.style.position = 'static';
      const name = make('div', 'air-name', gauge.name);
      if (gauge.formula) name.appendChild(make('span', 'air-formula', gauge.formula));
      const value = make('span', 'air-value');
      const amount = make('div', 'air-amount');
      amount.appendChild(value);
      this.amounts.set(key, amount);
      const gas = BALANCE_OF[key];
      if (gas && !this.balanceNodes.has(gas)) {
        const nodes = this.balance.mount(gas);
        this.balanceNodes.set(gas, nodes);
        amount.append(...nodes);
      }
      el.append(sprite.canvas, name, bar.canvas, amount);
      this.hoverable(el);
      this.slots.set(key, { el, value, bar, barW, sprite, drawn: '', art: '' });
      return el;
    }

    /** The description shows only on hover or keyboard focus. */
    private hoverable(el: HTMLElement): void {
      el.tabIndex = 0;
      el.setAttribute('role', 'group');
      const show = (): void => this.showTip(el);
      const hide = (): void => this.hideTip(el);
      el.addEventListener('pointerenter', show);
      el.addEventListener('pointerleave', hide);
      el.addEventListener('focus', show);
      el.addEventListener('blur', hide);
    }

    private showTip(el: HTMLElement): void {
      // An open gas balance says more; the tip would cover it.
      if (this.balance.isOpen) return;
      this.tipFor?.removeAttribute('aria-describedby');
      this.tipFor = el;
      el.setAttribute('aria-describedby', this.tip.id);
      this.fillTip(el);
      this.tip.style.display = 'block';
      this.placeTip(el);
    }

    private hideTip(el: HTMLElement): void {
      if (this.tipFor !== el) return;
      el.removeAttribute('aria-describedby');
      this.tipFor = null;
      this.tip.style.display = 'none';
    }

    private fillTip(el: HTMLElement): void {
      const t = this.tips.get(el);
      if (!t) return;
      const sig = `${t.title}|${t.text}`;
      if (this.tip.dataset.sig === sig) return;
      this.tip.dataset.sig = sig;
      this.tip.replaceChildren(make('b', 'air-tip-title', t.title), make('span', 'air-tip-scale', t.scale), make('p', 'air-tip-text', t.text));
    }

    /** Below the element, or above it when the window's view has no room there; never past its sides. */
    private placeTip(el: HTMLElement): void {
      const root = this.root;
      if (!root) return;
      const view = root.parentElement?.closest('.win-body') ?? root;
      const r = el.getBoundingClientRect();
      const box = root.getBoundingClientRect();
      const seen = view.getBoundingClientRect();
      const tw = Math.min(320, box.width - 8);
      this.tip.style.width = `${tw}px`;
      const th = this.tip.offsetHeight;
      const below = r.bottom + 6 + th <= seen.bottom || r.top - 6 - th < seen.top;
      const left = clamp(r.left - box.left + 12, 4, Math.max(4, box.width - tw - 4));
      const top = below ? r.bottom - box.top + 6 : r.top - box.top - 6 - th;
      this.tip.style.left = `${Math.round(left)}px`;
      this.tip.style.top = `${Math.round(top)}px`;
    }
  }
}
