/* =============================================================================
 * SimEarth 2.0 — the History window
 * -----------------------------------------------------------------------------
 * Every recorded series over the planet's age, each on its own scale, with a
 * soft area under the line. Hovering shows the values at that moment; the
 * legend chips toggle a series and carry its current value.
 * ========================================================================== */

namespace SE {
  const FONT = '"Pixelify Sans", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif';
  const INK_DIM = '#8394a8';
  const GRID = 'rgba(255,255,255,0.07)';

  export class HistoryPanel {
    readonly enabled: boolean[];
    private readonly canvas: HTMLCanvasElement;
    private readonly tip: HTMLElement;
    private readonly values: HTMLElement[] = [];
    /** Pointer position over the chart as a 0..1 fraction of the plot width. */
    private hoverAt: number | null = null;

    constructor(host: HTMLElement, private readonly recorder: HistoryRecorder) {
      this.enabled = recorder.series.map((_, i) => i !== 3 && i !== 6);
      const stage = make('div', 'hist-stage');
      this.canvas = make('canvas', 'fill-canvas');
      this.canvas.setAttribute('aria-label', 'Verlauf der Planetenwerte');
      this.tip = make('div', 'hist-tip');
      stage.append(this.canvas, this.tip);
      const keys = make('div', 'hist-keys');
      recorder.series.forEach((s, i) => {
        const b = button({
          label: s.label, cls: 'chip-btn hist-key',
          onClick: () => { this.enabled[i] = !this.enabled[i]; setPressed(b, this.enabled[i]); },
        });
        const dot = make('span', 'chip-dot');
        dot.style.background = rgbCss(s.color);
        const value = make('span', 'hist-key-value');
        b.prepend(dot);
        b.appendChild(value);
        setPressed(b, this.enabled[i]);
        keys.appendChild(b);
        this.values.push(value);
      });
      host.append(stage, keys, make('p', 'graph-note', 'Jede Kurve hat ihre eigene Skala. Fahre über die Grafik, um die Werte eines Zeitpunkts zu sehen.'));
      this.canvas.addEventListener('pointermove', (e) => {
        const r = this.canvas.getBoundingClientRect();
        this.hoverAt = r.width > 24 ? clamp((e.clientX - r.left - 12) / (r.width - 24), 0, 1) : null;
        this.render();
      });
      this.canvas.addEventListener('pointerleave', () => { this.hoverAt = null; this.render(); });
    }

    render(): void {
      if (!fitCanvas(this.canvas)) return;
      const ctx = this.canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = this.canvas.width / dpr;
      const h = this.canvas.height / dpr;
      ctx.clearRect(0, 0, w, h);
      const left = 12;
      const top = 12;
      const pw = w - 24;
      const ph = h - top - 28;

      ctx.strokeStyle = GRID;
      ctx.lineWidth = 2;
      for (let g = 0; g <= 4; g++) {
        const y = Math.round(top + (ph * g) / 4);
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(left + pw, y);
        ctx.stroke();
      }

      const years = this.recorder.years;
      const series = this.recorder.series;
      series.forEach((s, i) => {
        const last = s.data[s.data.length - 1];
        this.values[i].textContent = last === undefined ? '' : s.format(last);
      });
      if (years.length < 2) {
        ctx.fillStyle = INK_DIM;
        ctx.font = `13px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('Der Verlauf füllt sich, sobald die Zeit läuft.', w / 2, h / 2);
        this.tip.classList.remove('show');
        return;
      }

      ctx.fillStyle = INK_DIM;
      ctx.font = `11px ${FONT}`;
      for (const f of [0, 0.25, 0.5, 0.75, 1]) {
        const k = Math.round(f * (years.length - 1));
        ctx.textAlign = f === 0 ? 'left' : f === 1 ? 'right' : 'center';
        ctx.fillText(formatEarthDate(years[k], true), left + f * pw, h - 8);
      }

      const yOf = (s: HistorySeries, v: number): number => top + ph - clamp((v - s.min) / (s.max - s.min), 0, 1) * ph;
      series.forEach((s, si) => {
        if (!this.enabled[si] || s.data.length < 2) return;
        const xOf = (i: number): number => left + (i / (s.data.length - 1)) * pw;
        ctx.beginPath();
        for (let i = 0; i < s.data.length; i++) {
          if (i === 0) ctx.moveTo(xOf(i), yOf(s, s.data[i]));
          else ctx.lineTo(xOf(i), yOf(s, s.data[i]));
        }
        const area = ctx.createLinearGradient(0, top, 0, top + ph);
        area.addColorStop(0, `rgba(${s.color.join(',')},0.16)`);
        area.addColorStop(1, `rgba(${s.color.join(',')},0)`);
        ctx.save();
        ctx.lineTo(left + pw, top + ph);
        ctx.lineTo(left, top + ph);
        ctx.closePath();
        ctx.fillStyle = area;
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        for (let i = 0; i < s.data.length; i++) {
          if (i === 0) ctx.moveTo(xOf(i), yOf(s, s.data[i]));
          else ctx.lineTo(xOf(i), yOf(s, s.data[i]));
        }
        ctx.strokeStyle = rgbCss(s.color);
        ctx.lineWidth = 2;
        ctx.lineJoin = 'miter';
        ctx.lineCap = 'square';
        ctx.stroke();
      });
      this.drawHover(ctx, left, top, pw, ph, yOf);
    }

    /** The crosshair, a dot on every visible series, and the values beside it. */
    private drawHover(
      ctx: CanvasRenderingContext2D, left: number, top: number, pw: number, ph: number,
      yOf: (s: HistorySeries, v: number) => number,
    ): void {
      const years = this.recorder.years;
      if (this.hoverAt === null) { this.tip.classList.remove('show'); return; }
      const k = Math.round(this.hoverAt * (years.length - 1));
      const x = left + (k / (years.length - 1)) * pw;
      ctx.strokeStyle = 'rgba(246,241,223,0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(Math.round(x), top);
      ctx.lineTo(Math.round(x), top + ph);
      ctx.stroke();
      this.tip.innerHTML = '';
      this.tip.appendChild(make('div', 'hist-tip-when', `${formatEarthDate(years[k])} · ${eraAt(years[k]).name}`));
      this.recorder.series.forEach((s, si) => {
        if (!this.enabled[si] || k >= s.data.length) return;
        const v = s.data[k];
        ctx.fillStyle = rgbCss(s.color);
        ctx.fillRect(Math.round(x) - 3, Math.round(yOf(s, v)) - 3, 6, 6);
        const row = make('div', 'hist-tip-row');
        const dot = make('span', 'chip-dot');
        dot.style.background = rgbCss(s.color);
        row.append(dot, make('span', undefined, s.label), make('b', undefined, s.format(v)));
        this.tip.appendChild(row);
      });
      const right = this.hoverAt > 0.55;
      this.tip.style.left = right ? '' : `${Math.round(x + 14)}px`;
      this.tip.style.right = right ? `${Math.round(left + pw - x + 26)}px` : '';
      this.tip.classList.add('show');
    }
  }
}
