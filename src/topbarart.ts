/* =============================================================================
 * Gaia Reborn — the status bar's pixel art
 * -----------------------------------------------------------------------------
 * What the living status bar (livingtopbar.ts) draws on its pixel canvases:
 * a white cumulus (cloudshape.ts) behind every chip, the map showing between
 * them; single sprites; the Ω store, the era bar and the sparklines.
 * Everything in art px on a PixelCanvas; the bar decides when to draw.
 * ========================================================================== */

namespace SE {
  /** Art px of the readouts drawn inside the chips: one sparkline column per history sample. */
  const SPARK = [20, 9] as const;
  const ERA_BAR = [48, 7] as const;
  const OMEGA_BAR = [24, 4] as const;

  /** The era bar, oldest first (GEO_ERAS): the hues of the international stratigraphic chart in UI palette colours. */
  const ERA_COLORS = [
    'petal0', 'petal1', 'blossom0', 'laterite3', 'gold3', 'gold4', 'petalY2',
    'moss2', 'pine3', 'glowG3', 'wilt3', 'water6', 'red1',
    'violet0', 'glowT2', 'vine4', 'orange0', 'yellow0', 'petalY3',
  ];

  /** A panel's columns in art px of the bar, 1 when it is lit, the seed of its cloud's shape, its content's box. */
  export type TopbarPanel = readonly [x0: number, x1: number, lit: number, seed: number, box: CloudBox];

  /**
   * The bar's background, W × H art px: no beam, the map shows through; a
   * cloud behind every panel from the bar's second row down, so the map
   * shows above it too; a lit cloud with a halo. Without the atlas only
   * cleared.
   */
  export function drawTopbarClouds(pc: PixelCanvas, W: number, H: number, boxes: readonly TopbarPanel[], sc: UiScale): void {
    const ui = UiArt.shared();
    pc.size(W, H, sc);
    pc.place({ left: 0, top: 0 });
    pc.clear();
    if (!ui.ready) return;
    const ctx = pc.ctx;
    const h = H - 1;
    if (h <= 0) return;
    for (const [x0, x1, lit, seed, box] of boxes) {
      const w = x1 - x0;
      if (w <= 2) continue;
      const tones = cloudTones(w, h, seed, box);
      const colors = Array.from({ length: CLOUD_TONES }, (_, t) => ui.color(lit ? `cloudLit${t}` : `cloud${t}`));
      // Runs of one tone per row: a few hundred rectangles a cloud.
      for (let y = 0; y < h; y++) {
        let x = 0;
        while (x < w) {
          const t = tones[y * w + x];
          let e = x + 1;
          while (e < w && tones[y * w + e] === t) e++;
          if (t >= 0) {
            ctx.fillStyle = colors[t];
            ctx.fillRect(x0 + x, y + 1, e - x, 1);
          }
          x = e;
        }
      }
      if (lit) {
        const at = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && tones[y * w + x] >= 0;
        ctx.fillStyle = ui.color('halo0');
        for (let y = -1; y < h; y++) {
          for (let x = -1; x <= w; x++) {
            if (!at(x, y) && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1))) ctx.fillRect(x0 + x, y + 1, 1, 1);
          }
        }
      }
    }
  }

  /** Frame f of sprite `id` alone on its pixel canvas. */
  export function drawUiSprite(pc: PixelCanvas, id: string, f: number, sc: UiScale): void {
    const ui = UiArt.shared();
    const sp = ui.sprite(id);
    if (!sp) return;
    pc.size(sp.w, sp.h, sc);
    pc.clear();
    ui.draw(pc.ctx, id, f, sp.ax, sp.ay);
  }

  /** Frame 0 of sprite `id`, as large as fits a `box` CSS px square in whole device px: where an SVG icon stood. */
  export function drawUiIcon(pc: PixelCanvas, id: string, box: number): void {
    const sp = UiArt.shared().sprite(id);
    if (!sp) return;
    const dpr = window.devicePixelRatio || 1;
    const s = Math.max(1, Math.floor((box * dpr) / Math.max(sp.w, sp.h)));
    drawUiSprite(pc, id, 0, { s, dpr, u: s / dpr, beside: false });
  }

  /** `n` speed pips in a row, the first `lit` of them lit: the one button that steps through the speeds. */
  export function drawPipRow(pc: PixelCanvas, n: number, lit: number, sc: UiScale): void {
    const ui = UiArt.shared();
    const pip = ui.sprite('ctl_pip');
    if (!pip) return;
    pc.size(n * (pip.w + 1) - 1, pip.h, sc);
    pc.clear();
    for (let k = 0; k < n; k++) ui.draw(pc.ctx, 'ctl_pip', k < lit ? 1 : 0, k * (pip.w + 1) + pip.ax, pip.ay);
  }

  /** The Ω store as a small gold bar in a wood rim. Returns what it shows; draws only when that differs from `drawn`. */
  export function drawOmegaBar(pc: PixelCanvas, fill: number, sc: UiScale, drawn: string): string {
    const [W, H] = OMEGA_BAR;
    const n = Math.round(clamp(fill, 0, 1) * (W - 2));
    const sig = `${n}|${sc.s}|${sc.dpr}`;
    if (sig === drawn) return sig;
    const ui = UiArt.shared();
    pc.size(W, H, sc);
    const ctx = pc.ctx;
    pc.clear();
    ctx.fillStyle = ui.color('wood2');
    ctx.fillRect(1, 0, W - 2, H);
    ctx.fillRect(0, 1, W, H - 2);
    ctx.fillStyle = ui.color('parch1');
    ctx.fillRect(1, 1, W - 2, H - 2);
    if (n <= 0) return sig;
    ctx.fillStyle = ui.color('gold3');
    ctx.fillRect(1, 1, n, H - 2);
    ctx.fillStyle = ui.color('gold5');
    ctx.fillRect(1, 1, n, 1);
    return sig;
  }

  /**
   * The eras side by side, equally wide so the short ones stay visible, in
   * the chart's hues; still to come they are dithered with parchment; a gold
   * diamond marks where in its era a planet of `age` years is. Returns what
   * it shows; draws only when that differs from `drawn`.
   */
  export function drawEraBar(pc: PixelCanvas, age: number, sc: UiScale, drawn: string): string {
    const [W, H] = ERA_BAR;
    const n = GEO_ERAS.length;
    const k = eraIndexAt(age);
    const e = GEO_ERAS[k];
    const t = clamp((e.fromMa * 1e6 - yearsAgo(age)) / ((e.fromMa - e.toMa) * 1e6), 0, 1);
    const x0 = 3;
    const inner = W - 2 * x0;
    const mx = x0 + Math.min(inner - 1, Math.floor(((k + t) / n) * inner));
    const sig = `${mx}|${sc.s}|${sc.dpr}`;
    if (sig === drawn) return sig;
    const ui = UiArt.shared();
    pc.size(W, H, sc);
    pc.clear();
    const ctx = pc.ctx;
    const mid = H >> 1;
    ctx.fillStyle = ui.color('wood1');
    ctx.fillRect(x0 - 1, mid - 2, inner + 2, 5);
    const future = ui.color('parch2');
    for (let x = x0; x < x0 + inner; x++) {
      const era = ui.color(ERA_COLORS[Math.min(n - 1, Math.floor(((x - x0) / inner) * n))] ?? 'rock2');
      for (let y = mid - 1; y <= mid + 1; y++) {
        ctx.fillStyle = x > mx && (x + y) % 2 === 1 ? future : era;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const d = Math.abs(dx) + Math.abs(dy);
        if (d > 3) continue;
        ctx.fillStyle = ui.color(d === 3 ? 'wood1' : dx + dy < 0 ? 'gold5' : 'gold3');
        ctx.fillRect(mx + dx, mid + dy, 1, 1);
      }
    }
    return sig;
  }

  /**
   * The newest samples, one per column, as a 1-px line scaled to their own
   * range (never tighter than the steady band `still`), coloured by the
   * trend: green rising, red falling, brown steady. A dotted line until
   * there is a history.
   */
  export function drawSparkline(pc: PixelCanvas, data: readonly number[], still: number, sc: UiScale): void {
    const [W, H] = SPARK;
    const ui = UiArt.shared();
    pc.size(W, H, sc);
    pc.clear();
    const ctx = pc.ctx;
    const n = Math.min(W, data.length);
    if (n < 2) {
      ctx.fillStyle = ui.color('parch0');
      for (let x = 0; x < W; x += 2) ctx.fillRect(x, H >> 1, 1, 1);
      return;
    }
    const v = data.slice(data.length - n);
    let lo = Math.min(...v);
    let hi = Math.max(...v);
    if (hi - lo < 2 * still) {
      const m = (hi + lo) / 2;
      lo = m - still;
      hi = m + still;
    }
    const d = v[n - 1] - v[0];
    ctx.fillStyle = ui.color(d > still ? 'vine2' : d < -still ? 'red0' : 'wood3');
    const yOf = (x: number): number => clamp(Math.round(((hi - x) / (hi - lo)) * (H - 1)), 0, H - 1);
    const column = (x: number, a: number, b: number): void => { ctx.fillRect(x, Math.min(a, b), 1, Math.abs(b - a) + 1); };
    let py = yOf(v[0]);
    for (let i = 0; i < n; i++) {
      const x = W - n + i;
      const y = yOf(v[i]);
      if (i > 0 && Math.abs(y - py) > 1) {
        // Half the step in the column before, the rest in this one: a connected line.
        const half = Math.trunc((y - py) / 2);
        column(x - 1, py, py + half);
        column(x, py + half + Math.sign(y - py), y);
      } else {
        column(x, y, y);
      }
      py = y;
    }
  }
}
