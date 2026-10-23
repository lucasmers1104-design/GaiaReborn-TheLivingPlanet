/* =============================================================================
 * Gaia Reborn — the status bar's pixel art
 * -----------------------------------------------------------------------------
 * What the living status bar (livingtopbar.ts) draws on its pixel canvases:
 * the wood beam with a gold-rimmed parchment panel behind every chip, wood
 * posts with brass studs between the panels and the logo; single sprites;
 * the Ω store, the era bar and the sparklines. Everything in art px on a
 * PixelCanvas; the bar decides when to draw.
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

  /** Wood rows above and below the panels: 3, fewer where the 60 px bar is only some 20 art px tall (3 CSS px per art px), so a panel keeps room for the logo inside its rim. */
  export const topbarMargin = (rows: number): number => clamp(Math.floor((rows - 18) / 2), 1, 3);

  /** A panel's columns in art px of the bar, and 1 when it is lit. */
  export type TopbarPanel = readonly [x0: number, x1: number, lit: number];

  const frames = new Map<string, HTMLCanvasElement>();
  let framesVersion = -1;

  /** One frame of a sprite alone on a small canvas, for slicing and tiling. */
  function frame(id: string, f: number): HTMLCanvasElement | null {
    const ui = UiArt.shared();
    if (framesVersion !== ui.version) { frames.clear(); framesVersion = ui.version; }
    const key = `${id}:${f}`;
    const have = frames.get(key);
    const sp = ui.sprite(id);
    if (have || !sp || !ui.ready) return have ?? null;
    const c = document.createElement('canvas');
    c.width = sp.w;
    c.height = sp.h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ui.draw(ctx, id, f, sp.ax, sp.ay);
    frames.set(key, c);
    return c;
  }

  /** The part (sx, sy, sw, sh) of `src` repeated over the box (x, y, w, h), cut at its far edges. */
  function rep(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number, x: number, y: number, w: number, h: number): void {
    if (sw <= 0 || sh <= 0) return;
    for (let ty = y; ty < y + h; ty += sh) {
      const ch = Math.min(sh, y + h - ty);
      for (let tx = x; tx < x + w; tx += sw) {
        const cw = Math.min(sw, x + w - tx);
        ctx.drawImage(src, sx, sy, cw, ch, tx, ty, cw, ch);
      }
    }
  }

  function tile(ctx: CanvasRenderingContext2D, id: string, f: number, x: number, y: number, w: number, h: number): void {
    const src = frame(id, f);
    if (src) rep(ctx, src, 0, 0, src.width, src.height, x, y, w, h);
  }

  /** The gold-rimmed panel, nine-sliced: corners (a third of the sprite) as drawn, edges and centre repeated. */
  function nine(ctx: CanvasRenderingContext2D, f: number, x: number, y: number, w: number, h: number): void {
    const s = frame('panel9', f);
    if (!s || w <= 0 || h <= 0) return;
    const cx = Math.floor(s.width / 3);
    const cy = Math.floor(s.height / 3);
    const mw = s.width - 2 * cx;
    const mh = s.height - 2 * cy;
    const rx = s.width - cx;
    const ry = s.height - cy;
    rep(ctx, s, cx, cy, mw, mh, x + cx, y + cy, w - 2 * cx, h - 2 * cy);
    rep(ctx, s, cx, 0, mw, cy, x + cx, y, w - 2 * cx, cy);
    rep(ctx, s, cx, ry, mw, cy, x + cx, y + h - cy, w - 2 * cx, cy);
    rep(ctx, s, 0, cy, cx, mh, x, y + cy, cx, h - 2 * cy);
    rep(ctx, s, rx, cy, cx, mh, x + w - cx, y + cy, cx, h - 2 * cy);
    ctx.drawImage(s, 0, 0, cx, cy, x, y, cx, cy);
    ctx.drawImage(s, rx, 0, cx, cy, x + w - cx, y, cx, cy);
    ctx.drawImage(s, 0, ry, cx, cy, x, y + h - cy, cx, cy);
    ctx.drawImage(s, rx, ry, cx, cy, x + w - cx, y + h - cy, cx, cy);
  }

  /**
   * The bar's background, W × H art px of which `rows` are the bar: wood, a
   * panel for every box, a post with a stud above and below where two panels
   * are close, and the logo with its left edge at art px `logoX` (null while
   * the plaque is hidden). Without the atlas only cleared.
   */
  export function drawTopbarBg(pc: PixelCanvas, W: number, H: number, rows: number, boxes: readonly TopbarPanel[], logoX: number | null, sc: UiScale): void {
    const ui = UiArt.shared();
    pc.size(W, H, sc);
    pc.place({ left: 0, top: 0 });
    pc.clear();
    if (!ui.ready) return;
    const ctx = pc.ctx;
    tile(ctx, 'wood_tile', 0, 0, 0, W, H);
    const y = topbarMargin(rows);
    const h = rows - 2 * y;
    const post = ui.sprite('post_tile');
    boxes.forEach(([x0, x1, f], k) => {
      nine(ctx, f, x0, y, x1 - x0, h);
      const next = boxes[k + 1];
      if (!post || !next || next[0] <= x1 || next[0] - x1 > 2 * (post.w + 2)) return;
      const px = Math.floor((x1 + next[0] - post.w) / 2);
      tile(ctx, 'post_tile', 0, px, 0, post.w, H);
      ui.draw(ctx, 'stud', 0, px + Math.floor(post.w / 2), y - 1);
      ui.draw(ctx, 'stud', 0, px + Math.floor(post.w / 2), y + h);
    });
    const logo = ui.sprite('logo');
    if (logo && logoX !== null) ui.draw(ctx, 'logo', 0, logoX + logo.ax, y + Math.floor((h - logo.h) / 2) + logo.ay);
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
