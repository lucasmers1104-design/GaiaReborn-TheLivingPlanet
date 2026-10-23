/* =============================================================================
 * Gaia Reborn — the living navigation rail
 * -----------------------------------------------------------------------------
 * The column of round parchment buttons down the left edge of the map
 * (concept: left-toolbar.png): the six tools, a vine knot, then Evolution,
 * Planet and Fenster. The buttons are real, focusable <button>s with clear
 * faces; one canvas below them carries their pixel art (rail_btn state, ico_*
 * icon, the selected tool's tab and glow, the focus ring, the evolution
 * badge), laid out by UI_RAIL at uiScale() and redrawn only when a state or
 * an art frame changes. The vine layer climbs the buttons' and the knot's
 * client rects. The rail also sets the CSS variables the panels beside it
 * use: --rail-w (where they start), --rail-top, --rail-foot (Gaia's corner).
 * ========================================================================== */

namespace SE {
  /** data-rail of each button; ico_<id> is its icon. */
  export type RailId = 'examine' | 'move' | 'altitude' | 'plant' | 'life' | 'event' | 'evolution' | 'planet' | 'windows';
  /** The tools' rail ids, index-aligned with Tool and TOOL_NAMES. */
  export const RAIL_TOOLS: readonly RailId[] = ['examine', 'move', 'altitude', 'plant', 'life', 'event'];

  export interface RailItem {
    readonly id: RailId;
    /** Name for assistive technology. */
    readonly label: string;
    /** Tooltip. */
    readonly title: string;
    /** Shortcut, shown small on the button. */
    readonly key?: string;
    /** Opens a flyout menu. */
    readonly menu?: boolean;
    readonly onClick: (button: HTMLButtonElement) => void;
  }

  /** Badge frames after the count rose (at the badge's fps): two soft pulses, then still. */
  const BADGE_PULSE = [1, 2, 3, 2, 1, 2, 3, 2, 1];
  /** Art px of the glow round a selected button (a lit line, then a dithered fringe). */
  const HALO = 2;

  interface Look { hover: boolean; down: boolean; focus: boolean }
  interface Slot { readonly item: RailItem; readonly b: HTMLButtonElement; readonly key: HTMLElement | null; readonly look: Look; readonly tool: boolean; y: number }

  export class LivingRail {
    readonly root: HTMLElement;
    readonly buttons = new Map<RailId, HTMLButtonElement>();
    /** CSS px from the stage's left edge to where the panels beside the rail start (= --rail-w). */
    width = 0;
    private readonly slots: Slot[] = [];
    private readonly art = new PixelCanvas('rail-art', 0);
    private readonly knotEl: HTMLElement;
    private knotY = 0;
    private knotFrame = 0;
    private scale: UiScale | null = null;
    private count = -1;
    private generation = -1;
    /** The UI update has run once: changes from now on are the player's. */
    private armed = false;
    private pulseAt = -Infinity;
    private sparkle: { slot: Slot; at: number } | null = null;
    /** The glows round a selected (green) and a hovered (gold) button, rebuilt when the atlas loads. */
    private halos: { on: HTMLCanvasElement | null; hover: HTMLCanvasElement | null } = { on: null, hover: null };
    private haloVersion = -1;
    private queued = 0;
    private dirty = true;
    private drawnKey = '';
    private waits = 0;

    constructor(host: HTMLElement, items: readonly RailItem[], private readonly reduced: () => boolean) {
      this.root = make('div', 'rail');
      this.root.setAttribute('role', 'group');
      this.root.setAttribute('aria-label', 'Werkzeuge und Fenster');
      Object.assign(this.root.style, { position: 'absolute', left: '0px', top: '0px', pointerEvents: 'none' });
      this.root.appendChild(this.art.canvas);
      this.knotEl = make('div', 'rail-knot');
      this.knotEl.setAttribute('aria-hidden', 'true');
      Object.assign(this.knotEl.style, { position: 'absolute', pointerEvents: 'none' });

      const watch = new MutationObserver((changes) => {
        for (const c of changes) {
          const slot = this.slots.find((s) => s.b === c.target);
          // A tool just chosen gets a glint (once play runs: not the tool armed at start-up).
          if (this.armed && slot?.tool && c.oldValue === 'false' && slot.b.getAttribute('aria-pressed') === 'true' && !this.reduced()) {
            this.sparkle = { slot, at: performance.now() };
          }
        }
        this.invalidate();
      });
      items.forEach((item, i) => {
        const b = button({ label: item.label, cls: 'rail-btn', showLabel: false, title: item.title, onClick: () => item.onClick(b) });
        b.dataset.rail = item.id;
        b.setAttribute('aria-pressed', 'false');
        Object.assign(b.style, {
          position: 'absolute', margin: '0', padding: '0', border: '0', background: 'transparent',
          zIndex: '1', pointerEvents: 'auto', cursor: 'pointer',
        });
        if (item.menu) {
          b.removeAttribute('aria-pressed');
          b.setAttribute('aria-haspopup', 'menu');
          b.setAttribute('aria-expanded', 'false');
        }
        let key: HTMLElement | null = null;
        if (item.key) {
          b.setAttribute('aria-keyshortcuts', item.key);
          key = make('span', 'rail-key', item.key);
          key.setAttribute('aria-hidden', 'true');
          Object.assign(key.style, { position: 'absolute', lineHeight: '1', pointerEvents: 'none' });
          b.appendChild(key);
        }
        const slot: Slot = { item, b, key, look: { hover: false, down: false, focus: false }, tool: i < RAIL_TOOLS.length, y: 0 };
        const set = (k: keyof Look, v: boolean): void => {
          if (slot.look[k] === v) return;
          slot.look[k] = v;
          this.invalidate();
        };
        b.addEventListener('pointerenter', () => set('hover', true));
        b.addEventListener('pointerleave', () => { set('hover', false); set('down', false); });
        b.addEventListener('pointerdown', (e) => { if (e.button === 0) set('down', true); });
        b.addEventListener('pointerup', () => set('down', false));
        b.addEventListener('pointercancel', () => set('down', false));
        b.addEventListener('focus', () => set('focus', b.matches(':focus-visible')));
        b.addEventListener('blur', () => set('focus', false));
        watch.observe(b, { attributes: true, attributeOldValue: true, attributeFilter: ['aria-pressed', 'aria-expanded'] });
        this.slots.push(slot);
        this.buttons.set(item.id, b);
        if (i === RAIL_TOOLS.length) this.root.appendChild(this.knotEl);
        this.root.appendChild(b);
      });
      host.appendChild(this.root);

      this.layout();
      window.addEventListener('resize', () => this.layout());
      this.watchDpr();
    }

    /** The evolution badge and pressed state, the knot's growth; cheap when nothing changed (called about 10 times a second). */
    sync(available: number, treeOpen: boolean, living: LivingState): void {
      const evo = this.buttons.get('evolution');
      if (evo && (evo.getAttribute('aria-pressed') === 'true') !== treeOpen) setPressed(evo, treeOpen);
      if (available !== this.count) {
        // A load or a new planet sets the count; only a rise during play pulses.
        if (available > this.count && this.count >= 0 && living.generation === this.generation && !this.reduced()) this.pulseAt = performance.now();
        this.count = available;
        evo?.setAttribute('aria-label', available > 0
          ? `Evolutionsbaum öffnen, ${available} ${available === 1 ? 'Schritt' : 'Schritte'} entwickelbar` : 'Evolutionsbaum öffnen');
        this.invalidate();
      }
      this.generation = living.generation;
      this.armed = true;
      // The knot has no wilt frames: like the vines' curls it sheds its flower, then its leaves, as freshness falls.
      const knot = living.bloom > 0.2 && living.vitality >= 0.5 ? 2 : living.greenery > 0.1 && living.vitality >= 0.45 ? 1 : 0;
      if (knot !== this.knotFrame) {
        this.knotFrame = knot;
        this.invalidate();
      }
    }

    /* ---------------------------------------------------------- layout -- */

    private layout(): void {
      const sc = uiScale();
      if (this.scale && sc.s === this.scale.s && sc.dpr === this.scale.dpr) return;
      this.scale = sc;
      const R = UI_RAIL;
      const u = sc.u;
      const px = (v: number): string => `${v * u}px`;
      const h = R.top + R.buttons * R.pitch + R.knot;
      this.art.size(R.width, h, sc);
      this.art.place({ left: 0, top: 0 });
      Object.assign(this.root.style, { width: px(R.width), height: px(h) });
      this.slots.forEach((slot, i) => {
        slot.y = R.top + i * R.pitch + (slot.tool ? 0 : R.knot);
        Object.assign(slot.b.style, { left: px(R.left), top: px(slot.y), width: px(R.btn), height: px(R.btn) });
        // Under 2 device px per art px the letters shrink to 3×4 px blobs; the shortcut stays in title and aria-keyshortcuts.
        if (slot.key) Object.assign(slot.key.style, { display: sc.s < 2 ? 'none' : '', right: px(-1), bottom: px(0), fontSize: `${Math.round(4.5 * u)}px` });
      });
      // The knot sits in the middle of the gap between the tools and the window buttons.
      const above = R.top + (RAIL_TOOLS.length - 1) * R.pitch + R.btn;
      this.knotY = Math.floor((above + R.top + RAIL_TOOLS.length * R.pitch + R.knot) / 2);
      const k = UiArt.shared().sprite('knot');
      if (k) {
        Object.assign(this.knotEl.style, {
          left: px(R.left + R.btn / 2 - k.ax), top: px(this.knotY - k.ay), width: px(k.w), height: px(k.h),
        });
      }
      this.width = Math.round((R.width + R.left) * u);
      const root = document.documentElement.style;
      root.setProperty('--rail-w', `${this.width}px`);
      root.setProperty('--rail-top', px(R.top));
      root.setProperty('--rail-foot', px(UI_SCENE.h + R.top));
      this.invalidate();
    }

    /** A device pixel ratio change without a resize (the window moved to another screen). */
    private watchDpr(): void {
      const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      mq.addEventListener('change', () => { this.layout(); this.watchDpr(); }, { once: true });
    }

    /* --------------------------------------------------------- drawing -- */

    private invalidate(): void {
      this.dirty = true;
      this.schedule();
    }

    private schedule(): void {
      if (this.queued) return;
      this.queued = requestAnimationFrame((now) => this.frame(now));
    }

    /** Draws when a state changed or an animation reached its next art frame; keeps ticking while one plays. */
    private frame(now: number): void {
      this.queued = 0;
      const art = UiArt.shared();
      if (!art.ready) {
        art.load();
        // The atlas decodes in a moment; give up quietly after ten seconds (it failed and said so).
        if (this.waits++ < 100) setTimeout(() => this.schedule(), 100);
        return;
      }
      const pulse = this.pulseFrame(now);
      const glint = this.sparkleFrame(now);
      const key = `${pulse}|${glint}`;
      if (this.dirty || key !== this.drawnKey) {
        this.dirty = false;
        this.drawnKey = key;
        this.draw(art, pulse, glint);
      }
      if (pulse > 0 || glint >= 0) this.schedule();
    }

    private pulseFrame(now: number): number {
      const fps = UiArt.shared().sprite('badge')?.fps || 8;
      const k = Math.floor(((now - this.pulseAt) * fps) / 1000);
      return k >= 0 && k < BADGE_PULSE.length ? BADGE_PULSE[k] : 0;
    }

    /** The glint's frame, or -1 when none plays. */
    private sparkleFrame(now: number): number {
      const sp = UiArt.shared().sprite('sparkle');
      if (!this.sparkle || !sp) return -1;
      const k = Math.floor(((now - this.sparkle.at) * (sp.fps || 8)) / 1000);
      if (k < sp.frames.length) return k;
      this.sparkle = null;
      return -1;
    }

    private draw(art: UiArt, pulse: number, glint: number): void {
      const ctx = this.art.ctx;
      this.art.clear();
      if (this.haloVersion !== art.version) {
        this.halos = { on: this.makeHalo(art, 3, 'glowG2', 'glowG1'), hover: this.makeHalo(art, 1, 'gold4', 'gold2') };
        this.haloVersion = art.version;
      }
      const R = UI_RAIL;
      art.draw(ctx, 'knot', this.knotFrame, R.left + R.btn / 2, this.knotY);
      const btn = art.sprite('rail_btn');
      const icon = btn?.points.icon ?? [0, 0];
      for (const slot of this.slots) {
        const x = R.left;
        const y = slot.y;
        const b = slot.b;
        const on = b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-expanded') === 'true';
        const { hover, down, focus } = slot.look;
        // 0 normal, 1 hover, 2 pressed, 3 selected, 4 selected and hovered (tools/uiart/catalog.js).
        const frame = on ? (hover && !down ? 4 : 3) : down ? 2 : hover ? 1 : 0;
        const halo = on ? this.halos.on : hover && !down ? this.halos.hover : null;
        if (halo) ctx.drawImage(halo, x - HALO, y - HALO);
        this.tl(art, 'rail_btn', frame, x, y);
        this.tl(art, `ico_${slot.item.id}`, on ? 1 : 0, x + icon[0], y + icon[1] + (frame === 2 ? 1 : 0));
        if (on && slot.tool) this.over(art, 'rail_tab', hover || focus ? 1 : 0, x, y);
        if (focus) this.over(art, 'rail_focus', 0, x, y);
        if (slot.item.id === 'evolution' && this.count > 0 && btn) this.badge(art, x + btn.w - 3, y + 2, pulse);
        if (glint >= 0 && this.sparkle?.slot === slot && btn) art.draw(ctx, 'sparkle', glint, x + btn.w - 5, y + 5);
      }
    }

    /** The count on its berry coin, centred at (cx, cy). */
    private badge(art: UiArt, cx: number, cy: number, frame: number): void {
      art.draw(this.art.ctx, 'badge', frame, cx, cy);
      const d = art.sprite('digits');
      if (!d) return;
      const text = this.count > 99 ? '9+' : String(this.count);
      let x = cx - Math.floor((text.length * d.w - 1) / 2);
      for (const ch of text) {
        this.tl(art, 'digits', ch === '+' ? 10 : Number(ch), x, cy - Math.floor(d.h / 2));
        x += d.w;
      }
    }

    /** Sprite `id` with the top left of its box at (x, y). */
    private tl(art: UiArt, id: string, f: number, x: number, y: number): void {
      const sp = art.sprite(id);
      if (sp) art.draw(this.art.ctx, id, f, x + sp.ax, y + sp.ay);
    }

    /** An overlay with its top left at (x, y) plus its own `at` point. */
    private over(art: UiArt, id: string, f: number, x: number, y: number): void {
      const at = art.sprite(id)?.points.at ?? [0, 0];
      this.tl(art, id, f, x + at[0], y + at[1]);
    }

    /** A glow following the outline of rail_btn frame `frame`: a `lit` line one art px out, a dithered `soft` fringe the next. */
    private makeHalo(art: UiArt, frame: number, litName: string, softName: string): HTMLCanvasElement | null {
      const sp = art.sprite('rail_btn');
      if (!sp) return null;
      const w = sp.w + 2 * HALO;
      const h = sp.h + 2 * HALO;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      art.draw(ctx, 'rail_btn', frame, HALO + sp.ax, HALO + sp.ay);
      const mask = ctx.getImageData(0, 0, w, h).data;
      const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && mask[(y * w + x) * 4 + 3] > 0;
      const rgb = (name: string): readonly number[] => {
        const v = parseInt(art.color(name).slice(1), 16);
        return [v >> 16, (v >> 8) & 255, v & 255, 255];
      };
      const lit = rgb(litName);
      const soft = rgb(softName);
      const out = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (inside(x, y)) continue;
          const near = inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1);
          const far = inside(x - 2, y) || inside(x + 2, y) || inside(x, y - 2) || inside(x, y + 2)
            || inside(x - 1, y - 1) || inside(x + 1, y - 1) || inside(x - 1, y + 1) || inside(x + 1, y + 1);
          const col = near ? lit : far && ((x + y) & 1) === 0 ? soft : null;
          if (col) out.data.set(col, (y * w + x) * 4);
        }
      }
      ctx.putImageData(out, 0, 0);
      return c;
    }
  }
}
