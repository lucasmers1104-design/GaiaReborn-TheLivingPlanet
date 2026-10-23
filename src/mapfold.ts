/* =============================================================================
 * Gaia Reborn — the overview map's fold tab
 * -----------------------------------------------------------------------------
 * The parchment tab (fold_tab in the UI atlas) between the legend and the
 * globe folds the globe and its field card away and back. Its chevron points
 * up while they show and down while they are folded away; hover and keyboard
 * focus light it.
 * ========================================================================== */

namespace SE {
  export class MapFold {
    readonly button: HTMLButtonElement;
    private readonly label: HTMLElement;
    private readonly art = new PixelCanvas('map-fold-art', 0);
    /** Stands in while the atlas has not decoded (or never does). */
    private readonly glyph = make('span', 'map-fold-glyph');
    private open = true;
    private hover = false;
    private drawn = '';

    constructor(onToggle: () => void) {
      this.button = button({ label: '', cls: 'map-fold', showLabel: false, onClick: onToggle });
      this.label = this.button.firstElementChild as HTMLElement;
      this.art.canvas.style.position = 'static';
      this.glyph.setAttribute('aria-hidden', 'true');
      this.button.append(this.art.canvas, this.glyph);
      this.button.addEventListener('pointerenter', () => { this.hover = true; this.render(); });
      this.button.addEventListener('pointerleave', () => { this.hover = false; this.render(); });
      this.button.addEventListener('focus', () => this.render());
      this.button.addEventListener('blur', () => this.render());
    }

    /** `open`: the globe and its card show. */
    set(open: boolean): void {
      this.open = open;
      this.render();
    }

    /** Redraws only when its state, the atlas or the interface scale changed. */
    render(): void {
      const ui = UiArt.shared();
      const sc = uiScale();
      const lit = this.hover || this.button.matches(':focus-visible');
      const key = `${this.open}|${lit}|${ui.version}|${sc.s}|${sc.dpr}`;
      if (key === this.drawn) return;
      this.drawn = key;
      const text = this.open ? 'Globus ausblenden' : 'Globus einblenden';
      this.label.textContent = text;
      this.button.title = text;
      this.button.setAttribute('aria-expanded', String(this.open));
      if (!ui.ready) ui.load();
      this.art.canvas.style.display = ui.ready ? '' : 'none';
      this.glyph.style.display = ui.ready ? 'none' : '';
      this.glyph.textContent = this.open ? '▲' : '▼';
      if (ui.ready) drawUiSprite(this.art, 'fold_tab', (this.open ? 0 : 2) + (lit ? 1 : 0), sc);
    }
  }
}
