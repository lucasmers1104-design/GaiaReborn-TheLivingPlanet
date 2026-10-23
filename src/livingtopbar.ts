/* =============================================================================
 * Gaia Reborn — the living status bar
 * -----------------------------------------------------------------------------
 * The top bar in the living style: a wood beam, a gold-rimmed parchment panel
 * behind every chip, wood posts with brass studs between the panels and the
 * GAIA REBORN plaque, all in one pixel canvas behind the content that is
 * redrawn only when the layout, a highlight, the scale or the art changes.
 * The text stays crisp DOM and grows a little with the art at large scales;
 * icons, sparklines, the Ω bar and the era bar are small pixel canvases
 * inside the chips (the drawing: topbarart.ts). When the bar runs out of room the
 * sparklines, the labels and then the minor chips give way in a fixed order,
 * measured against the real layout, so nothing is ever cut off.
 * Layout-critical styles are inline (a cached older stylesheet must not break
 * the bar); css/topbar-living.css only colours and polishes.
 * ========================================================================== */

namespace SE {
  /** What the bar's controls do: the app owns the speed, the windows and the menus. */
  export interface TopbarHooks {
    /** By speed index; 0 is the pause. */
    readonly speedNames: readonly string[];
    togglePause(): void;
    setSpeed(speed: number): void;
    /** The one button that steps through the speeds where the pips have no room. */
    cycleSpeed(): void;
    toggleAir(): void;
    airOpen(): boolean;
    openGameMenu(anchor: HTMLElement): void;
    fillOmega(pop: HTMLElement): void;
    fillEp(pop: HTMLElement): void;
  }

  /** Art px: the chips' side padding, the plaque's padding (the left one is room for the vines). */
  const PAD = 5;
  const BRAND_PAD = [10, 6] as const;
  /** CSS px of the Earth-time line with full and with short era names: the longest dates (and the planet age) measured in the pixel font. */
  const DATE_W = [240, 206] as const;
  /** The text's scale beside u CSS px per art px: from u 2 on it grows at a quarter of the art's pace (×1.25 at 3), so the icons never dwarf it and the panels still hold it. */
  const fontScale = (u: number): number => Math.max(1, 1 + (u - 2) / 4);

  /**
   * What gives way when the bar runs out of room, first to last; the fit level
   * counts how many are gone. 'label' also shortens the era names, 'pips'
   * leaves the one button that steps through the speeds.
   */
  const GIVE_WAY = ['spark', 'label', 'sea', 'temp', 'co2', 'life', 'detail', 'air', 'pips', 'time', 'brand'] as const;
  type Part = typeof GIVE_WAY[number];

  type ChipKey = 'omega' | 'ep' | 'life' | 'air' | 'sea' | 'co2' | 'temp';

  interface ChipSpec {
    readonly key: ChipKey;
    readonly icon: string;
    /** The accessible name, followed by the current value; the tip is its description. */
    readonly name: string;
    readonly tip: string;
    readonly label?: string;
    /** HistoryRecorder series of the sparkline, and the change over it that still reads as steady. */
    readonly series?: number;
    readonly still?: number;
    /** CSS px: the widest value in the pixel font, which has no tabular figures, so changing values never move the bar. */
    readonly minW: number;
    /** Opens the air composition window. */
    readonly air?: boolean;
  }

  const CHIPS: readonly ChipSpec[] = [
    { key: 'omega', icon: 'hud_energy', name: 'Energie (Ω)', tip: 'Energie (Ω) für Werkzeuge – füllt sich, während die Zeit läuft', minW: 46 },
    { key: 'ep', icon: 'hud_ep', name: 'Evolutionspunkte', tip: 'Evolutionspunkte – entstehen aus der Vielfalt lebender Gruppen', minW: 28 },
    { key: 'life', icon: 'hud_life', name: 'Leben', tip: 'Leben: wie viel der Planetenoberfläche belebt ist', label: 'belebt', series: 5, still: 0.002, minW: 54 },
    { key: 'air', icon: 'hud_air', name: 'O₂ Luft', tip: 'O₂ Luft: Sauerstoff in der Atmosphäre, in Prozent', label: 'O₂ Luft', series: 2, still: 0.1, minW: 48, air: true },
    {
      key: 'sea', icon: 'hud_sea', name: 'O₂ Meer', label: 'O₂ Meer', series: 8, still: 0.5, minW: 41, air: true,
      tip: 'O₂ Meer: gelöster Sauerstoff, in Prozent der heutigen Sättigung. Er steigt erst, wenn das gelöste Eisen im Meer verbraucht ist.',
    },
    { key: 'co2', icon: 'hud_co2', name: 'CO₂', tip: 'Kohlendioxid in der Atmosphäre', label: 'CO₂', series: 1, still: 2, minW: 72, air: true },
    { key: 'temp', icon: 'hud_temp', name: 'Temperatur', tip: 'Mittlere Temperatur des Planeten', label: 'Temperatur', series: 0, still: 0.1, minW: 54 },
  ];

  interface Chip {
    readonly spec: ChipSpec;
    readonly el: HTMLElement;
    readonly icon: PixelCanvas;
    readonly value: HTMLElement;
    readonly sub: HTMLElement | null;
    readonly spark: PixelCanvas | null;
  }

  type Style = Partial<CSSStyleDeclaration>;
  const css = (e: HTMLElement, s: Style): void => { Object.assign(e.style, s); };
  const put = (e: HTMLElement, text: string): void => { if (e.textContent !== text) e.textContent = text; };
  /** A CSS length of n art px, and of n px of text: the bar carries the scales as --lt-u and --lt-f. */
  const ap = (n: number): string => `calc(var(--lt-u) * ${n})`;
  const tp = (n: number): string => `calc(var(--lt-f) * ${n}px)`;

  const PANEL: Style = { position: 'relative', display: 'flex', alignItems: 'center', height: 'var(--lt-ch)', boxSizing: 'border-box', whiteSpace: 'nowrap' };
  const COLUMN: Style = { display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: '0' };
  const BUTTON: Style = { display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', padding: '0', border: '0', background: 'transparent', cursor: 'pointer' };

  /** A pixel canvas that sits in the flow of a chip. */
  function inline(cls: string): PixelCanvas {
    const pc = new PixelCanvas(cls, 0);
    css(pc.canvas, { position: 'static', display: 'block', flex: 'none' });
    return pc;
  }

  export class LivingTopbar {
    /** The Ω and EP drop-down; the app closes it on Escape. */
    readonly info = new HudInfo();
    private readonly bg = new PixelCanvas('lt-bg', -1);
    private readonly brand = make('div', 'lt-brand');
    private readonly chips = {} as Record<ChipKey, Chip>;
    private readonly time = make('div', 'lt-chip lt-time');
    private readonly timeIcon = inline('lt-ico');
    private readonly date = make('span', 'lt-date');
    private readonly eraRow = make('div', 'lt-era-row');
    private readonly eraBar = inline('lt-era');
    private readonly scale = make('span', 'lt-label lt-scale');
    private readonly omegaBar = inline('lt-omega-bar');
    private readonly devTag = make('span', 'lt-tag', 'DEV'); // DEVMODE
    private readonly speedBox = make('div', 'lt-speed');
    private readonly play = make('button', 'lt-btn lt-play');
    private readonly playIcon = inline('lt-ico');
    private readonly playLabel = make('span', 'sr-only', 'Pause');
    private readonly pips: { readonly btn: HTMLButtonElement; readonly icon: PixelCanvas }[] = [];
    private readonly cycle = make('button', 'lt-btn lt-cycle');
    private readonly cycleIcon = inline('lt-ico');
    private readonly gear = make('button', 'lt-btn lt-gear');
    private readonly gearIcon = inline('lt-ico');
    /** Boxes with a parchment panel behind them, in bar order. */
    private readonly panels: HTMLElement[] = [];
    private readonly parts = new Map<Part, { el: HTMLElement; display: string }[]>();
    private level = 0;
    private hover: HTMLElement | null = null;
    private hoverCtl: HTMLElement | null = null;
    private speed = 0;
    private lastRunning = 1;
    private age = -1;
    private relativeDate = true;
    private litSig = '';
    private bgSig = '';
    private scaleSig = '';
    private sparkSig = '';
    private eraSig = '';
    private omegaSig = '';
    private artVersion = -1;
    private queued = false;
    private refit = false;

    constructor(private readonly top: HTMLElement, private readonly hud: HTMLElement, private readonly hooks: TopbarHooks) {
      const ui = UiArt.shared();
      ui.load();
      const post = ui.sprite('post_tile');
      const gap = ap((post?.w ?? 5) + 2);
      top.classList.remove('glass');
      // Its own stacking context, so the background canvas (z -1) stays inside the bar, under all of its content.
      css(top, { position: 'relative', zIndex: '600', padding: `0 ${ap(2)}`, gap, background: ui.color('wood1') });
      // 'safe': content too wide overflows to the right, where fit() sees it in scrollWidth (and is never pushed off the left edge).
      css(hud, { display: 'flex', alignItems: 'center', justifyContent: 'safe flex-end', flex: '1 1 auto', minWidth: '0', marginLeft: '0', gap });
      top.prepend(this.brand);
      top.prepend(this.bg.canvas);

      const logo = ui.sprite('logo');
      this.brand.setAttribute('role', 'img');
      this.brand.setAttribute('aria-label', 'Gaia Reborn');
      css(this.brand, { ...PANEL, flex: 'none', width: ap(BRAND_PAD[0] + (logo?.w ?? 88) + BRAND_PAD[1]) });
      this.panels.push(this.brand);
      this.part('brand', this.brand, 'flex');

      for (const spec of CHIPS) this.chips[spec.key] = this.chip(spec);
      const c = this.chips;
      c.omega.value.after(this.devTag); // DEVMODE
      c.omega.value.parentElement?.after(this.omegaBar.canvas);
      this.info.attach(c.omega.el, (pop) => hooks.fillOmega(pop));
      this.info.attach(c.ep.el, (pop) => hooks.fillEp(pop));

      this.buildTime();
      this.buildSpeed();
      css(this.gear, { ...BUTTON, ...PANEL, width: ap(PAD * 2 + (ui.sprite('ctl_gear')?.w ?? 10)) });
      this.gear.type = 'button';
      this.gear.title = 'Spielmenü';
      this.gear.setAttribute('aria-haspopup', 'menu');
      this.gear.setAttribute('aria-expanded', 'false');
      this.gear.append(this.gearIcon.canvas, make('span', 'sr-only', 'Spielmenü'));
      this.gear.addEventListener('click', () => hooks.openGameMenu(this.gear));
      this.panels.push(this.gear);
      hud.append(...CHIPS.map((s) => c[s.key].el), this.time, this.speedBox, this.gear);

      for (const p of this.panels) {
        p.addEventListener('pointerenter', () => { this.hover = p; this.queue(false); });
        p.addEventListener('pointerleave', () => { if (this.hover === p) this.hover = null; this.queue(false); });
        p.addEventListener('focusin', () => this.queue(false));
        p.addEventListener('focusout', () => this.queue(false));
        p.addEventListener('click', () => this.queue(false));
      }
      for (const b of [this.play, this.gear]) {
        b.addEventListener('pointerenter', () => { this.hoverCtl = b; this.drawControls(); });
        b.addEventListener('pointerleave', () => { if (this.hoverCtl === b) this.hoverCtl = null; this.drawControls(); });
      }
      const observer = new ResizeObserver(() => this.queue(true));
      for (const e of [top, hud, ...this.panels]) observer.observe(e);
      window.addEventListener('resize', () => this.queue(true));
      this.rescale();
      this.queue(true);
    }

    /** The planet's figures, about ten times a second; the pixel readouts redraw only when what they show changed. */
    update(w: WorldState, history: HistoryRecorder, epRate: number, relativeDate: boolean): void {
      const c = this.chips;
      const ui = UiArt.shared();
      if (ui.version !== this.artVersion) {
        this.artVersion = ui.version;
        this.sparkSig = this.eraSig = this.omegaSig = '';
        this.drawIcons();
        this.queue(false);
      }
      let omega = fmt.int(w.omega);
      let ep = fmt.int(w.evo.ep);
      let fill = w.omega / omegaCap(w);
      if (isDevMode()) { omega = ep = '∞'; fill = 1; } // DEVMODE
      this.devTag.hidden = !isDevMode(); // DEVMODE
      put(c.omega.value, omega);
      put(c.ep.value, ep);
      if (c.ep.sub) put(c.ep.sub, epRate > 0 ? `+${fmt.two(epRate)}` : '');
      put(c.life.value, fmt.pct(w.lifeCover));
      put(c.air.value, `${fmt.one(w.o2)} %`);
      put(c.sea.value, `${fmt.int(w.oceanO2)} %`);
      put(c.co2.value, `${fmt.int(w.co2)} ppm`);
      put(c.temp.value, `${fmt.one(w.globalTemp)} °C`);
      for (const spec of CHIPS) {
        const { el, value } = c[spec.key];
        const name = `${spec.name}: ${value.textContent}`;
        // Not while focused: screen readers re-read a focused element's changed name, and Ω changes on nearly every update.
        if (el !== document.activeElement && el.getAttribute('aria-label') !== name) el.setAttribute('aria-label', name);
      }
      put(this.scale, TIMESCALE_NAMES[w.timeScale]);
      this.age = w.absoluteYears;
      this.relativeDate = relativeDate;
      this.writeDate();

      const sc = uiScale();
      this.omegaSig = drawOmegaBar(this.omegaBar, fill, sc, this.omegaSig);
      if (this.age >= 0) this.eraSig = drawEraBar(this.eraBar, this.age, sc, this.eraSig);
      const n = history.years.length;
      const sig = `${n}|${history.years[n - 1]}|${sc.s}|${sc.dpr}|${ui.version}`;
      if (sig !== this.sparkSig) {
        this.sparkSig = sig;
        for (const spec of CHIPS) {
          const chip = c[spec.key];
          if (chip.spark && spec.series !== undefined) drawSparkline(chip.spark, history.series[spec.series]?.data ?? [], spec.still ?? 0, sc);
        }
      }
      const lit = this.panels.map((p) => (this.lit(p) ? 1 : 0)).join('');
      if (lit !== this.litSig) { this.litSig = lit; this.queue(false); }
    }

    /** The speed control after a speed change: the pressed pip, play or pause, the cycle button's name. */
    syncSpeed(speed: number, lastRunning: number): void {
      this.speed = speed;
      this.lastRunning = lastRunning;
      const names = this.hooks.speedNames;
      this.pips.forEach((p, k) => setPressed(p.btn, speed === k + 1));
      const shown = speed === 0 ? lastRunning : speed;
      const name = `Tempo: ${names[shown]}${speed === 0 ? ' (pausiert)' : ''} – klicken zum Wechseln`;
      this.cycle.setAttribute('aria-label', name);
      this.cycle.title = name;
      this.playLabel.textContent = speed === 0 ? 'Weiter' : 'Pause';
      this.play.classList.toggle('paused', speed === 0);
      this.drawControls();
    }

    /* ------------------------------------------------------------ build -- */

    private chip(spec: ChipSpec): Chip {
      const el = make('div', `lt-chip lt-${spec.key}`);
      css(el, { ...PANEL, flex: '1 0 auto', maxWidth: ap(112), padding: `0 ${ap(PAD)}`, gap: ap(3) });
      // Focusable, so the explanation is reachable by keyboard, not only by hovering.
      el.dataset.tip = spec.tip;
      el.tabIndex = 0;
      el.setAttribute('role', 'group');
      el.setAttribute('aria-label', spec.name);
      el.setAttribute('aria-description', spec.tip);
      const icon = inline('lt-ico');
      const text = make('div', 'lt-text');
      css(text, COLUMN);
      const row = make('div', 'lt-row');
      css(row, { display: 'flex', alignItems: 'baseline', gap: '4px' });
      const value = make('span', 'lt-value');
      css(value, { display: 'inline-block', minWidth: tp(spec.minW) });
      row.appendChild(value);
      text.appendChild(row);
      let sub: HTMLElement | null = null;
      if (spec.key === 'ep') {
        sub = text.appendChild(make('span', 'lt-label lt-rate'));
        sub.style.minWidth = tp(30);
        this.part('detail', sub, 'block');
      } else if (spec.label) {
        sub = text.appendChild(make('span', 'lt-label', spec.label));
        this.part('label', sub, 'block');
      }
      el.append(icon.canvas, text);
      let spark: PixelCanvas | null = null;
      if (spec.series !== undefined) {
        spark = inline('lt-spark');
        spark.canvas.style.marginLeft = 'auto';
        el.appendChild(spark.canvas);
        this.part('spark', spark.canvas, 'block');
      }
      if (spec.air) {
        el.setAttribute('role', 'button');
        el.classList.add('hud-link', 'lt-air');
        el.addEventListener('click', () => this.hooks.toggleAir());
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.hooks.toggleAir(); }
        });
      }
      if (spec.key !== 'omega' && spec.key !== 'ep') this.part(spec.key, el, 'flex');
      this.panels.push(el);
      return { spec, el, icon, value, sub, spark };
    }

    private buildTime(): void {
      const t = this.time;
      css(t, { ...PANEL, flex: 'none', padding: `0 ${ap(PAD)}`, gap: ap(3) });
      t.dataset.tip = 'Erdzeit und Zeitalter (Optionen: Datum vor heute oder Planetenalter)';
      t.tabIndex = 0;
      t.setAttribute('role', 'group');
      t.setAttribute('aria-label', 'Erdzeit');
      const text = make('div', 'lt-text');
      css(text, COLUMN);
      css(this.date, { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' });
      css(this.eraRow, { display: 'flex', alignItems: 'center', gap: ap(3) });
      this.eraRow.append(this.eraBar.canvas, this.scale);
      text.append(this.date, this.eraRow);
      t.append(this.timeIcon.canvas, text);
      this.part('detail', this.eraRow, 'flex');
      this.part('time', t, 'flex');
      this.panels.push(t);
    }

    private buildSpeed(): void {
      const ui = UiArt.shared();
      const ctl = ui.sprite('ctl_play');
      const pip = ui.sprite('ctl_pip');
      const h = ap((ctl?.h ?? 10) + 4);
      const box = this.speedBox;
      css(box, { ...PANEL, flex: 'none', padding: `0 ${ap(4)}`, gap: ap(1) });
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', 'Tempo');
      const btn = (b: HTMLButtonElement, w: number, onClick: () => void): void => {
        b.type = 'button';
        css(b, { ...BUTTON, width: ap(w), height: h });
        b.addEventListener('click', onClick);
        box.appendChild(b);
      };
      btn(this.play, (ctl?.w ?? 10) + 4, () => this.hooks.togglePause());
      this.play.title = 'Pause / Weiter (Leertaste)';
      this.play.append(this.playIcon.canvas, this.playLabel);
      const names = this.hooks.speedNames;
      for (let s = 1; s < names.length; s++) {
        const b = make('button', 'lt-btn lt-pip');
        btn(b, (pip?.w ?? 4) + 4, () => this.hooks.setSpeed(s));
        b.title = `${names[s]} (${s})`;
        const icon = inline('lt-ico');
        b.append(icon.canvas, make('span', 'sr-only', names[s]));
        this.pips.push({ btn: b, icon });
        this.part('pips', b, 'flex');
      }
      btn(this.cycle, (names.length - 1) * ((pip?.w ?? 4) + 1) + 3, () => this.hooks.cycleSpeed());
      this.cycle.style.display = 'none';
      this.cycle.appendChild(this.cycleIcon.canvas);
      this.panels.push(box);
    }

    /** `el` gives way with `part`; `display` is how it shows otherwise. */
    private part(part: Part, el: HTMLElement, display: string): void {
      const list = this.parts.get(part) ?? [];
      list.push({ el, display });
      this.parts.set(part, list);
      el.style.display = display;
    }

    /* -------------------------------------------------------------- fit -- */

    private gone(part: Part): boolean {
      return GIVE_WAY.indexOf(part) < this.level;
    }

    private setLevel(level: number): void {
      this.level = level;
      for (const [part, list] of this.parts) {
        const on = !this.gone(part);
        for (const { el, display } of list) el.style.display = on ? display : 'none';
      }
      this.cycle.style.display = this.gone('pips') ? 'flex' : 'none';
      this.date.style.width = tp(DATE_W[this.gone('label') ? 1 : 0]);
      this.writeDate();
    }

    /** The least that must give way so the bar's content fits its width (measured; a few forced layouts, only on a resize). */
    private fit(): void {
      for (let lv = 0; lv <= GIVE_WAY.length; lv++) {
        this.setLevel(lv);
        if (this.hud.scrollWidth <= this.hud.clientWidth) return;
      }
    }

    private writeDate(): void {
      if (this.age < 0) return;
      const era = eraAt(this.age);
      put(this.date, this.relativeDate
        ? `${formatEarthDate(this.age, true)} · ${this.gone('label') ? era.short : era.name}`
        : `Planetenalter ${formatYears(this.age)}`);
    }

    /** One pass on the next frame: rescale and refit if asked, then redraw the background if anything it shows changed. */
    private queue(refit: boolean): void {
      this.refit ||= refit;
      if (this.queued) return;
      this.queued = true;
      requestAnimationFrame(() => {
        this.queued = false;
        if (this.refit) {
          this.refit = false;
          this.rescale();
          this.fit();
        }
        this.drawBg();
      });
    }

    private rescale(): void {
      const sc = uiScale();
      const rows = Math.round(this.top.clientHeight / sc.u);
      const sig = `${sc.s}|${sc.dpr}|${rows}`;
      if (sig === this.scaleSig) return;
      this.scaleSig = sig;
      this.top.style.setProperty('--lt-u', `${sc.u}px`);
      this.top.style.setProperty('--lt-f', String(fontScale(sc.u)));
      this.top.style.setProperty('--lt-ch', `${(rows - 2 * topbarMargin(rows)) * sc.u}px`);
      this.sparkSig = this.eraSig = this.omegaSig = '';
      this.drawIcons();
    }

    /* ------------------------------------------------------------- draw -- */

    private lit(p: HTMLElement): boolean {
      if (p === this.brand) return false;
      if (p === this.hover || p.getAttribute('aria-expanded') === 'true') return true;
      const a = document.activeElement;
      if (a instanceof HTMLElement && p.contains(a) && a.matches(':focus-visible')) return true;
      return p.classList.contains('lt-air') && this.hooks.airOpen();
    }

    /** Wood, panels, posts, studs and the logo, from the boxes' places after layout. */
    private drawBg(): void {
      const ui = UiArt.shared();
      const sc = uiScale();
      const u = sc.u;
      const rows = Math.round(this.top.clientHeight / u);
      const W = Math.ceil(this.top.clientWidth / u - 1e-6);
      const H = Math.max(rows, Math.ceil(this.top.clientHeight / u - 1e-6));
      const left = this.top.getBoundingClientRect().left;
      const boxes: [number, number, number][] = [];
      for (const p of this.panels) {
        const r = p.getBoundingClientRect();
        if (r.width > 0) boxes.push([Math.round((r.left - left) / u), Math.round((r.right - left) / u), this.lit(p) ? 1 : 0]);
      }
      const sig = `${W}|${H}|${rows}|${sc.s}|${sc.dpr}|${ui.version}|${boxes.join(';')}`;
      if (sig === this.bgSig) return;
      this.bgSig = sig;
      this.top.classList.toggle('lt-noart', !ui.ready);
      // The ink comes with the parchment it is drawn on: an older stylesheet would leave the text light on the pale panels.
      this.hud.style.color = ui.ready ? ui.color('ink1') : '';
      const brandShown = this.brand.getBoundingClientRect().width > 0;
      drawTopbarBg(this.bg, W, H, rows, boxes, brandShown ? boxes[0][0] + BRAND_PAD[0] : null, sc);
    }

    private drawIcons(): void {
      const sc = uiScale();
      for (const spec of CHIPS) drawUiSprite(this.chips[spec.key].icon, spec.icon, 0, sc);
      drawUiSprite(this.timeIcon, 'hud_time', 0, sc);
      this.drawControls(sc);
    }

    /** Play or pause (lit while paused or hovered), the pips up to the speed as leaves, the cycle's pips, the gear. */
    private drawControls(sc = uiScale()): void {
      const paused = this.speed === 0;
      drawUiSprite(this.playIcon, paused ? 'ctl_play' : 'ctl_pause', paused || this.hoverCtl === this.play ? 1 : 0, sc);
      this.pips.forEach((p, k) => drawUiSprite(p.icon, 'ctl_pip', !paused && k < this.speed ? 1 : 0, sc));
      drawPipRow(this.cycleIcon, this.pips.length, paused ? this.lastRunning : this.speed, sc);
      drawUiSprite(this.gearIcon, 'ctl_gear', this.hoverCtl === this.gear || this.gear.getAttribute('aria-expanded') === 'true' ? 1 : 0, sc);
    }
  }
}
