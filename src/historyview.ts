/* =============================================================================
 * SimEarth 2.0 — the History window
 * -----------------------------------------------------------------------------
 * The recorded series of one sphere at a time over the planet's age, each on
 * its own scale. The chart is drawn on a coarse grid and scaled up without
 * smoothing, so lines step and areas dither like the rest of the pixel UI.
 * Hovering shows the values at that moment; the legend chips toggle a series
 * and carry its current value.
 * ========================================================================== */

namespace SE {
  /** One sphere: its tab icon (from the overview map) and the recorded series it graphs. */
  interface HistoryTab {
    readonly name: string;
    readonly icon: string;
    /** Indices into HistoryRecorder.series. */
    readonly series: readonly number[];
  }

  const HISTORY_TABS: readonly HistoryTab[] = [
    { name: 'Atmosphäre', icon: 'overlay-wind', series: [0, 2, 1, 3, 12] },
    { name: 'Hydrosphäre', icon: 'layer-oceans', series: [11] },
    { name: 'Biosphäre', icon: 'layer-biomes', series: [13, 14] },
    { name: 'Zivilisation', icon: 'layer-cities', series: [6, 16, 10, 15] },
  ];

  /** CSS pixels per chart pixel: the curves are this thick. */
  const PIXEL = 3;
  /** Chart pixels kept free left/right and above the plot, and below it for the time axis. */
  const PAD = 3;
  const AXIS = 8;
  const GRID = 'rgba(255,255,255,0.09)';
  const CROSSHAIR = 'rgba(246,241,223,0.5)';
  const OUTLINE = '#0c1a14';
  const AREA_ALPHA = 0.55;
  /** Side of the dither tile: one dot per tile, so up to four series dot the area without covering each other. */
  const DITHER = 4;

  export class HistoryPanel {
    readonly enabled: boolean[];
    private tab = 0;
    private readonly stage: HTMLElement;
    private readonly canvas: HTMLCanvasElement;
    private readonly tip: HTMLElement;
    private readonly empty: HTMLElement;
    private readonly ticks: HTMLElement[] = [];
    private readonly tabButtons: HTMLButtonElement[] = [];
    private readonly keys: HTMLElement;
    private values: { series: number; el: HTMLElement }[] = [];
    /** A dither tile per series, its dot offset by the series' place in the tab. */
    private readonly dithers = new Map<number, CanvasPattern | null>();
    /** Pointer position over the chart in CSS pixels from its left edge. */
    private hoverX: number | null = null;

    constructor(host: HTMLElement, private readonly recorder: HistoryRecorder) {
      this.enabled = recorder.series.map(() => true);
      const tabs = make('div', 'hist-tabs');
      tabs.setAttribute('role', 'group');
      tabs.setAttribute('aria-label', 'Bereich');
      HISTORY_TABS.forEach((t, k) => {
        const b = button({ label: t.name, icon: uiIcon(t.icon), cls: 'icon-btn map-mode hist-tab', onClick: () => this.showTab(k) });
        tabs.appendChild(b);
        this.tabButtons.push(b);
      });

      this.stage = make('div', 'hist-stage');
      this.canvas = make('canvas', 'hist-canvas');
      this.canvas.setAttribute('aria-label', 'Verlauf der Planetenwerte');
      this.tip = make('div', 'hist-tip');
      this.empty = make('p', 'hist-empty', 'Der Verlauf füllt sich, sobald die Zeit läuft.');
      const axis = make('div', 'hist-axis');
      for (let k = 0; k < 5; k++) {
        const t = make('span', 'hist-tick');
        t.style.transform = `translateX(${k === 0 ? 0 : k === 4 ? -100 : -50}%)`;
        axis.appendChild(t);
        this.ticks.push(t);
      }
      this.stage.append(this.canvas, axis, this.empty, this.tip);
      this.keys = make('div', 'hist-keys');
      host.append(tabs, this.stage, this.keys, make('p', 'graph-note', 'Jede Kurve hat ihre eigene Skala. Fahre über die Grafik, um die Werte eines Zeitpunkts zu sehen.'));

      this.canvas.addEventListener('pointermove', (e) => {
        this.hoverX = e.clientX - this.canvas.getBoundingClientRect().left;
        this.render();
      });
      this.canvas.addEventListener('pointerleave', () => { this.hoverX = null; this.render(); });
      this.showTab(0);
    }

    private showTab(k: number): void {
      this.tab = k;
      this.tabButtons.forEach((b, n) => setPressed(b, n === k));
      this.keys.innerHTML = '';
      this.values = HISTORY_TABS[k].series.map((si) => {
        const s = this.recorder.series[si];
        const b = button({
          label: s.label, icon: uiIcon(s.icon ?? 'history'), cls: 'chip-btn hist-key', showLabel: false, title: s.label,
          onClick: () => { this.enabled[si] = !this.enabled[si]; setPressed(b, this.enabled[si]); this.render(); },
        });
        b.style.setProperty('--series', rgbCss(s.color));
        const el = make('span', 'hist-key-value');
        b.appendChild(el);
        setPressed(b, this.enabled[si]);
        this.keys.appendChild(b);
        return { series: si, el };
      });
      this.render();
    }

    render(): void {
      const r = this.stage.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      // Whole device pixels per chart pixel, or the upscale would make some
      // chart pixels a device pixel wider than their neighbours.
      const dpr = window.devicePixelRatio || 1;
      const scale = Math.max(1, Math.round(PIXEL * dpr));
      const cw = Math.floor((r.width * dpr) / scale);
      const ch = Math.floor((r.height * dpr) / scale);
      const css = scale / dpr;
      if (this.canvas.width !== cw || this.canvas.height !== ch) {
        this.canvas.width = cw;
        this.canvas.height = ch;
        this.canvas.style.width = `${cw * css}px`;
        this.canvas.style.height = `${ch * css}px`;
      }
      const ctx = this.canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, cw, ch);
      const left = PAD;
      const top = PAD;
      const pw = cw - 2 * PAD;
      const ph = ch - PAD - AXIS;
      if (pw < 8 || ph < 8) return;

      ctx.fillStyle = GRID;
      for (let g = 0; g <= 4; g++) {
        const y = top + Math.round(((ph - 1) * g) / 4);
        for (let x = left; x < left + pw; x += 4) ctx.fillRect(x, y, 2, 1);
      }

      const series = this.recorder.series;
      for (const v of this.values) {
        const data = series[v.series].data;
        const text = data.length ? series[v.series].format(data[data.length - 1]) : '';
        if (v.el.textContent !== text) v.el.textContent = text;
      }
      const years = this.recorder.years;
      const n = years.length;
      this.empty.hidden = n >= 2;
      if (n < 2) {
        for (const t of this.ticks) t.textContent = '';
        this.tip.classList.remove('show');
        return;
      }

      // Each sample holds its value over its share of the columns: steps.
      const sampleAt = (col: number): number => Math.min(n - 1, Math.floor((col * n) / pw));
      this.ticks.forEach((t, k) => {
        const col = Math.round((k / 4) * (pw - 1));
        const text = formatEarthDate(years[sampleAt(col)], true);
        if (t.textContent !== text) t.textContent = text;
        t.style.left = `${(left + col) * css}px`;
      });

      const tab = HISTORY_TABS[this.tab];
      const ranges = tab.series.map((si) => {
        const s = series[si];
        const hi = s.autoMax ? Math.max(s.max, 1.1 * s.data.reduce((m, v) => Math.max(m, v), s.min)) : s.max;
        return [s.min, hi] as const;
      });
      /** Chart row of value `v` on the scale of the tab's k-th series. */
      const yOf = (k: number, v: number): number =>
        top + ph - 1 - Math.round(clamp((v - ranges[k][0]) / (ranges[k][1] - ranges[k][0]), 0, 1) * (ph - 1));
      tab.series.forEach((si, k) => {
        const s = series[si];
        if (!this.enabled[si] || s.data.length < n) return;
        const ys = new Int32Array(pw);
        for (let c = 0; c < pw; c++) ys[c] = yOf(k, s.data[sampleAt(c)]);
        const dither = this.dither(ctx, si, k);
        if (dither) {
          ctx.globalAlpha = AREA_ALPHA;
          ctx.fillStyle = dither;
          for (let c = 0; c < pw; c++) ctx.fillRect(left + c, ys[c] + 1, 1, top + ph - ys[c] - 1);
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = rgbCss(s.color);
        for (let c = 0; c < pw; c++) {
          const prev = c > 0 ? ys[c - 1] : ys[c];
          ctx.fillRect(left + c, Math.min(prev, ys[c]), 1, Math.abs(prev - ys[c]) + 1);
        }
      });
      this.drawHover(ctx, left, top, pw, ph, css, sampleAt, yOf);
    }

    private dither(ctx: CanvasRenderingContext2D, si: number, k: number): CanvasPattern | null {
      if (!this.dithers.has(si)) {
        const tile = make('canvas');
        tile.width = DITHER;
        tile.height = DITHER;
        const t = tile.getContext('2d');
        if (t) {
          t.fillStyle = rgbCss(this.recorder.series[si].color);
          t.fillRect((k & 1) * 2, ((k >> 1) & 1) * 2, 1, 1);
        }
        this.dithers.set(si, t ? ctx.createPattern(tile, 'repeat') : null);
      }
      return this.dithers.get(si) ?? null;
    }

    /** A dashed crosshair, a pixel square on every visible series, and the values beside it. */
    private drawHover(
      ctx: CanvasRenderingContext2D, left: number, top: number, pw: number, ph: number, css: number,
      sampleAt: (col: number) => number, yOf: (k: number, v: number) => number,
    ): void {
      if (this.hoverX === null) { this.tip.classList.remove('show'); return; }
      const col = clamp(Math.floor(this.hoverX / css) - left, 0, pw - 1);
      const k = sampleAt(col);
      const x = left + col;
      ctx.fillStyle = CROSSHAIR;
      for (let y = top; y < top + ph; y += 4) ctx.fillRect(x, y, 1, 2);
      const years = this.recorder.years;
      this.tip.innerHTML = '';
      this.tip.appendChild(make('div', 'hist-tip-when', `${formatEarthDate(years[k])} · ${eraAt(years[k]).name}`));
      HISTORY_TABS[this.tab].series.forEach((si, n) => {
        const s = this.recorder.series[si];
        if (!this.enabled[si] || k >= s.data.length) return;
        const v = s.data[k];
        const y = yOf(n, v);
        ctx.fillStyle = OUTLINE;
        ctx.fillRect(x - 2, y - 2, 5, 5);
        ctx.fillStyle = rgbCss(s.color);
        ctx.fillRect(x - 1, y - 1, 3, 3);
        const row = make('div', 'hist-tip-row');
        row.style.setProperty('--series', rgbCss(s.color));
        row.append(img(uiIcon(s.icon ?? 'history')), make('span', undefined, s.label), make('b', undefined, s.format(v)));
        this.tip.appendChild(row);
      });
      const px = x * css;
      const right = col > pw * 0.55;
      this.tip.style.left = right ? '' : `${Math.round(px + 14)}px`;
      this.tip.style.right = right ? `${Math.round(this.stage.clientWidth - px + 14)}px` : '';
      this.tip.classList.add('show');
    }
  }
}
