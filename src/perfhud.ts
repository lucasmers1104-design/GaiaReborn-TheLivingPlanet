/* =============================================================================
 * SimEarth 2.0 — performance display (F3)
 * -----------------------------------------------------------------------------
 * Frame, tick, redraw, chunk and terrain-field timings, averaged over the
 * last second with their maximum. app.ts, render.ts and landview.ts report
 * here; hidden, every report returns at once, and the text is rewritten at
 * most twice a second.
 * ========================================================================== */

namespace SE {
  class PerfStat {
    sum = 0;
    n = 0;
    max = 0;
    add(v: number): void {
      this.sum += v;
      this.n++;
      if (v > this.max) this.max = v;
    }
  }

  const PERF_KEYS = ['frame', 'gap', 'tick', 'steps', 'base', 'chunks', 'pending', 'field', 'tiles', 'full', 'age', 'msg'] as const;
  type PerfWindow = Record<(typeof PERF_KEYS)[number], PerfStat>;
  const perfWindow = (): PerfWindow => Object.fromEntries(PERF_KEYS.map((k) => [k, new PerfStat()])) as PerfWindow;
  /** Half a second per window; the display joins the last two. */
  const PERF_WINDOW_MS = 500;

  class PerfHud {
    private el: HTMLElement | null = null;
    private on = false;
    private at = 0;
    private older = perfWindow();
    private newer = perfWindow();
    private cur = perfWindow();

    toggle(): void {
      this.on = !this.on;
      if (!this.el) this.el = document.body.appendChild(make('div', 'perf-hud'));
      this.el.hidden = !this.on;
      this.older = perfWindow();
      this.newer = perfWindow();
      this.cur = perfWindow();
      this.at = performance.now();
      if (this.on) this.el.textContent = '…';
    }

    /** End of a frame: ms since the last one began, ms this one worked. */
    frame(gap: number, work: number): void {
      if (!this.on) return;
      this.cur.gap.add(gap);
      this.cur.frame.add(work);
      const now = performance.now();
      if (now - this.at < PERF_WINDOW_MS) return;
      this.at = now;
      this.older = this.newer;
      this.newer = this.cur;
      this.cur = perfWindow();
      this.render();
    }

    tick(ms: number): void {
      if (this.on) this.cur.tick.add(ms);
    }

    ticksInFrame(n: number): void {
      if (this.on) this.cur.steps.add(n);
    }

    /** Worker mode: how old the state on screen is, ms. */
    stateAge(ms: number): void {
      if (this.on) this.cur.age.add(ms);
    }

    /** Worker mode: a state arrived carrying this many bytes of typed arrays. */
    message(bytes: number): void {
      if (this.on) this.cur.msg.add(bytes);
    }

    drawBase(ms: number): void {
      if (this.on) this.cur.base.add(ms);
    }

    chunks(composed: number, pending: boolean): void {
      if (!this.on) return;
      this.cur.chunks.add(composed);
      this.cur.pending.add(pending ? 1 : 0);
    }

    /** TerrainField.refresh: ms and tiles read again (-1: all). */
    field(ms: number, tiles: number): void {
      if (!this.on) return;
      this.cur.field.add(ms);
      if (tiles >= 0) this.cur.tiles.add(tiles);
      else this.cur.full.add(1);
    }

    private render(): void {
      if (!this.el) return;
      const w = this.older;
      const v = this.newer;
      const joined = (k: keyof PerfWindow): PerfStat => {
        const s = new PerfStat();
        s.sum = w[k].sum + v[k].sum;
        s.n = w[k].n + v[k].n;
        s.max = Math.max(w[k].max, v[k].max);
        return s;
      };
      const span = (w.gap.sum + v.gap.sum) / 1000 || 1;
      const mean = (s: PerfStat): string => (s.n > 0 ? s.sum / s.n : 0).toFixed(1);
      const frame = joined('frame');
      const tick = joined('tick');
      const steps = joined('steps');
      const base = joined('base');
      const chunks = joined('chunks');
      const field = joined('field');
      const tiles = joined('tiles');
      const age = joined('age');
      const msg = joined('msg');
      this.el.textContent = [
        `Bilder ${(frame.n / span).toFixed(0)}/s  Bild Ø ${mean(frame)} max ${frame.max.toFixed(1)} ms  Abstand max ${joined('gap').max.toFixed(0)} ms`,
        `Ticks ${(tick.n / span).toFixed(1)}/s  Ø ${mean(tick)} max ${tick.max.toFixed(1)} ms  je Bild Ø ${(steps.n > 0 ? steps.sum / steps.n : 0).toFixed(2)} max ${steps.max}`,
        `drawBase ${(base.n / span).toFixed(1)}/s  Ø ${mean(base)} max ${base.max.toFixed(1)} ms`,
        `Chunks je Bild Ø ${(frame.n > 0 ? chunks.sum / frame.n : 0).toFixed(2)} max ${chunks.max}  pending ${joined('pending').sum}×`,
        `Feld ${(field.n / span).toFixed(1)}/s  Ø ${mean(field)} max ${field.max.toFixed(1)} ms  Kacheln Ø ${tiles.n > 0 ? Math.round(tiles.sum / tiles.n) : '–'} max ${tiles.max}  voll ${joined('full').n}×`,
        age.n > 0 ? `Worker: Zustand Ø ${mean(age)} max ${age.max.toFixed(0)} ms alt  Nachrichten ${(msg.n / span).toFixed(1)}/s ${(msg.sum / 1048576 / span).toFixed(1)} MB/s` : 'Simulation im Hauptthread',
      ].join('\n');
    }
  }

  export const perfHud = new PerfHud();
}
