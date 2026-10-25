/* =============================================================================
 * SimEarth 2.0 — the evolution tree window
 * -----------------------------------------------------------------------------
 * Time runs left to right. Plants grow in the upper band, animals in the
 * lower, and the shared single-celled origin sits between them — so where a
 * node stands already says what it is. Three kinds of connection, three
 * looks, explained by the legend:
 *
 *   solid line     descent: arose from early members of the parent group
 *   dashed arrow   ecology: needs this as food, as a partner or as soil
 *   habitat chips  the kind of place it needs, on the card itself
 *
 * Everything needed to decide is on the card or one tap away in the detail
 * panel — nothing depends on hovering. Drag or wheel to move and zoom, pinch
 * on touch, arrow keys move the selection, Enter develops.
 * ========================================================================== */

namespace SE {
  const COL_W = 232;
  const ROW_H = 112;
  const NODE_W = 190;
  const NODE_H = 86;
  const PAD_X = 36;
  const PAD_TOP = 64;
  const MIN_ROW = -3;
  const MAX_ROW = 5;
  const COLS = 10;
  const MIN_SCALE = 0.22;
  const MAX_SCALE = 1.6;
  /** Below this the tree is an overview, too small to read; zoom stays continuous there. */
  const CRISP_MIN = 0.5;

  /**
   * The zoom level next to `s` (upwards for dir > 0, downwards for dir < 0,
   * nearest for 0) at which 2 px lines, even card edges and the 2× pixel art
   * land on whole device pixels: multiples of 0.5 / devicePixelRatio. Any
   * other scale smears the pixel style.
   */
  function crispScale(s: number, dir: number): number {
    if (s < CRISP_MIN) return s;
    const q = 0.5 / (window.devicePixelRatio || 1);
    const k = dir > 0 ? Math.ceil(s / q - 1e-6) : dir < 0 ? Math.floor(s / q + 1e-6) : Math.round(s / q);
    return Math.max(1, Math.min(k, Math.floor(MAX_SCALE / q))) * q;
  }

  const KINGDOM_NAMES: Readonly<Record<Kingdom, string>> = {
    origin: 'Ursprung', plant: 'Pflanzen', animal: 'Tiere',
  };
  const STATE_NAMES: Readonly<Record<NodeState, string>> = {
    locked: 'Gesperrt', partial: 'Voraussetzungen teilweise erfüllt',
    available: 'Jetzt entwickelbar', developed: 'Entwickelt',
  };
  const ECO_KIND_NAMES: Readonly<Record<EcoKind, string>> = {
    food: 'Nahrung', partner: 'Partner', soil: 'Boden',
  };

  function nodeX(n: EvoNode): number {
    return PAD_X + n.col * COL_W;
  }
  function nodeY(n: EvoNode): number {
    // Even, like every card edge, so cards stay sharp at half-pixel zoom levels.
    return PAD_TOP + (n.row - MIN_ROW) * ROW_H + Math.floor((ROW_H - NODE_H) / 4) * 2;
  }
  /** Colour class: sea animals take the ocean blue of the first cells. */
  function tint(n: EvoNode): string {
    const sea = n.kingdom === 'animal'
      && n.habitat.tags.every((t) => t === 'coastalsea' || t === 'opensea' || t === 'atmosphere');
    return `k-${sea ? 'origin' : n.kingdom}`;
  }

  /** Why developed step n is gone for good, or '': a plant group its rivals displaced, the comet's dinosaurs. */
  export function stepGoneReason(world: WorldState, n: EvoNode, alive: boolean): string {
    if (n.flora !== undefined && floraGone(world, n.flora)) return `Für immer ausgestorben – abgelöst durch ${floraRivalNames(n.flora)}.`;
    if (hardStepLost(world, n)) return 'Für immer ausgestorben – nicht rechtzeitig wieder angesiedelt.';
    return alive ? '' : dinoEraStepBar(world, n.id);
  }

  export interface TreeHooks {
    /** Develop the step; `done` hears the outcome once the simulation has it. */
    develop(id: string, done: (res: { ok: boolean; reason: string }) => void): void;
    showOnMap(id: string): boolean;
    placeTool(id: string): void;
    world(): WorldState;
    evo(): EvolutionSystem;
    dex(): FaunaDex;
    /** Open a sub-species' lexicon entry. */
    openSpecies(c: Life, stage: number): void;
  }

  export class EvolutionTreeView {
    readonly root: HTMLElement;
    private readonly viewport: HTMLElement;
    private readonly canvas: HTMLElement;
    private readonly edgeSvg: SVGSVGElement;
    private readonly ecoGroup: SVGGElement;
    private readonly detail: HTMLElement;
    private readonly legend: HTMLElement;
    private readonly zoomLabel: HTMLElement;
    private readonly availChip: HTMLElement;
    private readonly cards = new Map<string, HTMLButtonElement>();
    private readonly lineagePaths = new Map<string, SVGPathElement>();

    private selected: string | null = null;
    private filter: 'all' | Kingdom = 'all';
    private allEco = false;
    private scale = 0.8;
    private tx = 0;
    private ty = 0;
    private fitted = false;
    private lastRevision = -1;
    private lastFaunaVersion = -1;
    private detailSig = '';
    private readonly pointers = new Map<number, { x: number; y: number }>();
    private pan: { x: number; y: number; tx: number; ty: number; moved: boolean } | null = null;
    private pinch: { d: number; scale: number; cx: number; cy: number } | null = null;
    private settleTimer = 0;

    constructor(private readonly hooks: TreeHooks) {
      this.root = make('div', 'tree-layout');

      /* ---- toolbar ---- */
      const bar = make('div', 'tree-toolbar');
      const seg = make('div', 'seg');
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', 'Filter');
      const filters: [typeof this.filter, string][] = [['all', 'Alle'], ['plant', 'Pflanzen'], ['animal', 'Tiere']];
      const segBtns: HTMLButtonElement[] = [];
      for (const [f, label] of filters) {
        const b = button({ label, cls: 'seg-btn', onClick: () => {
          this.filter = f;
          segBtns.forEach((x, k) => setPressed(x, filters[k][0] === f));
          this.applyFilter();
        } });
        setPressed(b, f === 'all');
        segBtns.push(b);
        seg.appendChild(b);
      }
      this.availChip = make('span', 'chip chip-avail');
      const ecoToggle = button({
        label: 'Alle Abhängigkeiten', icon: uiIcon('link-food'), cls: 'btn btn-small btn-ghost',
        title: 'Nahrungs-, Partner- und Bodenbeziehungen aller Knoten zeigen (sonst nur die der Auswahl)',
        onClick: () => { this.allEco = !this.allEco; setPressed(ecoToggle, this.allEco); this.drawEco(); },
      });
      setPressed(ecoToggle, false);
      const zoomOut = button({ label: 'Verkleinern', icon: uiIcon('zoom-out'), cls: 'icon-btn', showLabel: false, onClick: () => this.zoomBy(1 / 1.2) });
      this.zoomLabel = make('span', 'zoom-label', '80 %');
      const zoomIn = button({ label: 'Vergrößern', icon: uiIcon('zoom-in'), cls: 'icon-btn', showLabel: false, onClick: () => this.zoomBy(1.2) });
      const fit = button({ label: 'Ganzen Baum zeigen', icon: uiIcon('zoom-fit'), cls: 'icon-btn', showLabel: false, onClick: () => this.fit() });
      const center = button({
        label: 'Auswahl in die Mitte holen', icon: uiIcon('center'), cls: 'icon-btn', showLabel: false,
        onClick: () => { if (this.selected) this.centerOn(this.selected); },
      });
      const legendBtn = button({
        label: 'Legende', icon: uiIcon('help'), cls: 'btn btn-small btn-ghost',
        onClick: () => { const on = this.legend.classList.toggle('hidden'); setPressed(legendBtn, !on); },
      });
      setPressed(legendBtn, false);
      const zoom = make('div', 'zoom-group');
      zoom.append(zoomOut, this.zoomLabel, zoomIn, center, fit);
      const hint = make('span', 'tree-hint');
      hint.append(img(uiIcon('drag'), 'ico'), make('span', undefined, 'Ziehen verschiebt · Mausrad zoomt'));
      bar.append(seg, this.availChip, hint, make('span', 'spacer'), ecoToggle, legendBtn, zoom);

      /* ---- viewport ---- */
      this.viewport = make('div', 'tree-viewport');
      this.viewport.tabIndex = -1;
      this.canvas = make('div', 'tree-canvas');
      const W = PAD_X * 2 + (COLS - 1) * COL_W + NODE_W;
      const H = PAD_TOP + (MAX_ROW - MIN_ROW + 1) * ROW_H + 24;
      this.canvas.style.width = `${W}px`;
      this.canvas.style.height = `${H}px`;

      this.canvas.appendChild(this.buildLanes(W));
      this.edgeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.edgeSvg.classList.add('tree-edges');
      this.edgeSvg.setAttribute('width', String(W));
      this.edgeSvg.setAttribute('height', String(H));
      this.edgeSvg.innerHTML = `<defs>
        <marker id="tree-arrow-food" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#8ad16f"/></marker>
        <marker id="tree-arrow-prey" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#f2a35c"/></marker>
        <marker id="tree-arrow-partner" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#b48cff"/></marker>
        <marker id="tree-arrow-soil" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#c9a36b"/></marker>
      </defs>`;
      this.canvas.appendChild(this.edgeSvg);
      this.buildLineage();
      this.ecoGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      this.edgeSvg.appendChild(this.ecoGroup);
      for (const n of EVO_NODES) this.canvas.appendChild(this.buildCard(n));
      this.viewport.appendChild(this.canvas);
      this.wireViewport();

      /* ---- legend ---- */
      this.legend = this.buildLegend();
      this.viewport.appendChild(this.legend);
      // Closed by default: open, it covered the very first card.
      this.legend.classList.add('hidden');

      /* ---- detail ---- */
      this.detail = make('aside', 'tree-detail');
      this.detail.setAttribute('aria-label', 'Details zum ausgewählten Schritt');

      const main = make('div', 'tree-main');
      main.append(this.viewport, this.detail);
      this.root.append(bar, main);
    }

    /* ------------------------------------------------------------ build -- */

    private buildLanes(W: number): HTMLElement {
      const lanes = make('div', 'tree-lanes');
      const band = (cls: string, from: number, to: number, label: string, icon: string): void => {
        const b = make('div', `tree-lane ${cls}`);
        b.style.top = `${PAD_TOP + (from - MIN_ROW) * ROW_H}px`;
        b.style.height = `${(to - from + 1) * ROW_H}px`;
        b.style.width = `${W}px`;
        const tag = make('div', 'tree-lane-label');
        tag.append(img(icon, 'ico'), make('span', undefined, label));
        b.appendChild(tag);
        lanes.appendChild(b);
      };
      band('lane-plant', MIN_ROW, -1, 'Pflanzen', uiIcon('tool-plant'));
      band('lane-origin', 0, 0, 'Ursprung', uiIcon('examine'));
      band('lane-animal', 1, MAX_ROW, 'Tiere', uiIcon('tool-life'));
      for (const era of EVO_ERAS) {
        const e = make('div', 'tree-era');
        e.style.left = `${PAD_X + era.from * COL_W - 12}px`;
        e.style.width = `${(era.to - era.from) * COL_W + NODE_W + 24}px`;
        e.appendChild(make('span', undefined, era.name));
        lanes.appendChild(e);
      }
      return lanes;
    }

    private buildLineage(): void {
      for (const n of EVO_NODES) {
        if (!n.parent) continue;
        const p = evoNode(n.parent);
        const x1 = nodeX(p) + NODE_W;
        const y1 = nodeY(p) + NODE_H / 2;
        const x2 = nodeX(n);
        const y2 = nodeY(n) + NODE_H / 2;
        // Odd x keeps the 2 px elbow on whole pixels at 1× and 0.5×.
        const mx = Math.floor((x1 + x2) / 4) * 2 + 1;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M${x1},${y1} H${mx} V${y2} H${x2}`);
        path.setAttribute('class', `edge-lineage ${tint(n)}`);
        this.edgeSvg.appendChild(path);
        this.lineagePaths.set(n.id, path);
      }
    }

    private buildCard(n: EvoNode): HTMLButtonElement {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `tree-node ${tint(n)}`;
      card.dataset.id = n.id;
      card.style.left = `${nodeX(n)}px`;
      card.style.top = `${nodeY(n)}px`;
      card.style.width = `${NODE_W}px`;
      card.style.height = `${NODE_H}px`;

      const art = pixelArt(evoIcon(n.id), 20, 'tree-node-art');
      const text = make('div', 'tree-node-text');
      text.append(make('div', 'tree-node-name', n.name), make('div', 'tree-node-status', ''));
      const progress = make('div', 'tree-node-progress');
      progress.appendChild(make('span'));
      const badge = make('span', 'tree-node-badge');
      badge.appendChild(img(uiIcon('lock'), 'ico'));
      const chips = make('div', 'tree-node-habitats');
      for (const tag of n.habitat.tags.filter((t) => t !== 'atmosphere').slice(0, 3)) {
        chips.appendChild(img(habitatAsset(tag), 'hab-chip', ''));
      }
      text.appendChild(chips);
      const rip = make('span', 'tree-node-rip', 'R.I.P.');
      rip.setAttribute('aria-hidden', 'true');
      rip.hidden = true;
      card.append(art, rip, text, progress, badge);
      // The lineage note rides above the card it describes rather than on the
      // line, where neighbouring cards kept covering it.
      if (n.lineageNote) {
        const note = make('span', 'tree-node-note', n.lineageNote);
        note.setAttribute('aria-hidden', 'true');
        card.appendChild(note);
      }
      card.addEventListener('click', () => {
        if (this.pan && this.pan.moved) return;
        this.select(n.id, false);
      });
      card.addEventListener('focus', () => {
        // A pointer press focuses the button too; only the keyboard selects
        // on focus, so a drag that starts on a card does not pick it.
        if (!card.matches(':focus-visible')) return;
        if (this.selected !== n.id) this.select(n.id, false);
        // Tabbing onto a card that lies outside the view brings it in.
        this.ensureVisible(n.id);
      });
      card.addEventListener('keydown', (e) => this.onCardKey(e, n));
      this.cards.set(n.id, card);
      return card;
    }

    private buildLegend(): HTMLElement {
      const box = make('div', 'tree-legend glass');
      box.appendChild(make('div', 'legend-title', 'Legende'));
      const row = (iconSrc: string, cls: string, label: string): void => {
        const r = make('div', 'legend-row');
        const key = make('span', 'legend-key');
        if (cls) key.appendChild(make('span', `legend-swatch ${cls}`));
        key.appendChild(img(iconSrc, 'ico'));
        r.append(key, make('span', undefined, label));
        box.appendChild(r);
      };
      row(uiIcon('link-lineage'), 'sw-lineage', 'Abstammung (Vorgänger leben weiter)');
      row(uiIcon('link-food'), 'sw-food', 'Nahrung: Pflanzen (grün), Beutetiere (orange)');
      row(uiIcon('link-partner'), 'sw-partner', 'Partner, z. B. Blüten für Bestäuber');
      row(uiIcon('link-habitat'), 'sw-soil', 'Boden aus früherem Pflanzenwuchs');
      row(habitatAsset('shore'), '', 'Lebensraum-Symbole am Knoten');
      const states = make('div', 'legend-states');
      const st = (cls: string, label: string): void => {
        const s = make('span', `legend-state ${cls}`);
        s.append(make('i'), make('span', undefined, label));
        states.appendChild(s);
      };
      st('state-locked', 'Gesperrt');
      st('state-partial', 'Teilweise erfüllt');
      st('state-available', 'Entwickelbar');
      st('state-developed', 'Entwickelt');
      st('selected', 'Ausgewählt');
      box.appendChild(states);
      return box;
    }

    /* ------------------------------------------------------- navigation -- */

    private apply(): void {
      const dpr = window.devicePixelRatio || 1;
      const px = (v: number): number => Math.round(v * dpr) / dpr;
      this.canvas.style.transform = `translate(${px(this.tx)}px, ${px(this.ty)}px) scale(${this.scale})`;
      this.zoomLabel.textContent = `${Math.round(this.scale * 100)} %`;
    }

    private clampPan(): void {
      const vw = this.viewport.clientWidth;
      const vh = this.viewport.clientHeight;
      const cw = this.canvas.offsetWidth * this.scale;
      const ch = this.canvas.offsetHeight * this.scale;
      const margin = 80;
      this.tx = cw <= vw ? (vw - cw) / 2 : clamp(this.tx, vw - cw - margin, margin);
      this.ty = ch <= vh ? (vh - ch) / 2 : clamp(this.ty, vh - ch - margin, margin);
    }

    private zoomAt(factor: number, cx: number, cy: number): void {
      const next = clamp(this.scale * factor, MIN_SCALE, MAX_SCALE);
      const k = next / this.scale;
      this.tx = cx - (cx - this.tx) * k;
      this.ty = cy - (cy - this.ty) * k;
      this.scale = next;
      this.clampPan();
      this.apply();
    }

    private zoomBy(factor: number): void {
      const next = crispScale(this.scale * factor, factor > 1 ? 1 : -1);
      this.zoomAt(next / this.scale, this.viewport.clientWidth / 2, this.viewport.clientHeight / 2);
    }

    /** End of a wheel or pinch gesture: move on to the next crisp zoom level in its direction. */
    private settle(dir: number, cx: number, cy: number): void {
      this.zoomAt(crispScale(this.scale, dir) / this.scale, cx, cy);
    }

    fit(): void {
      const vw = this.viewport.clientWidth;
      const vh = this.viewport.clientHeight;
      if (vw <= 0 || vh <= 0) return;
      const exact = clamp(Math.min(vw / this.canvas.offsetWidth, vh / this.canvas.offsetHeight) * 0.98, MIN_SCALE, 1);
      const crisp = crispScale(exact, -1);
      this.scale = crisp >= CRISP_MIN ? crisp : exact;
      this.tx = (vw - this.canvas.offsetWidth * this.scale) / 2;
      this.ty = (vh - this.canvas.offsetHeight * this.scale) / 2;
      this.clampPan();
      this.apply();
    }

    /** Scroll a node into the middle of the viewport. */
    centerOn(id: string): void {
      const n = evoNode(id);
      const vw = this.viewport.clientWidth;
      const vh = this.viewport.clientHeight;
      if (vw <= 0) return;
      if (this.scale < 0.6) this.scale = 1;
      this.tx = vw / 2 - (nodeX(n) + NODE_W / 2) * this.scale;
      this.ty = vh / 2 - (nodeY(n) + NODE_H / 2) * this.scale;
      this.clampPan();
      this.apply();
    }

    private wireViewport(): void {
      const vp = this.viewport;
      vp.addEventListener('wheel', (e) => {
        e.preventDefault();
        const r = vp.getBoundingClientRect();
        const dir = e.deltaY < 0 ? 1 : -1;
        const cx = e.clientX - r.left;
        const cy = e.clientY - r.top;
        this.zoomAt(dir > 0 ? 1.12 : 1 / 1.12, cx, cy);
        window.clearTimeout(this.settleTimer);
        this.settleTimer = window.setTimeout(() => this.settle(dir, cx, cy), 180);
      }, { passive: false });

      vp.addEventListener('pointerdown', (e) => {
        if ((e.target as HTMLElement).closest('.tree-legend')) return;
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.pointers.size === 1) {
          this.pan = { x: e.clientX, y: e.clientY, tx: this.tx, ty: this.ty, moved: false };
        } else if (this.pointers.size === 2) {
          const [a, b] = Array.from(this.pointers.values());
          const r = vp.getBoundingClientRect();
          this.pinch = {
            d: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: this.scale,
            cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top,
          };
          this.pan = null;
        }
      });
      vp.addEventListener('pointermove', (e) => {
        if (!this.pointers.has(e.pointerId)) return;
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.pinch && this.pointers.size >= 2) {
          const [a, b] = Array.from(this.pointers.values());
          const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
          this.zoomAt((this.pinch.scale * d / this.pinch.d) / this.scale, this.pinch.cx, this.pinch.cy);
          return;
        }
        const p = this.pan;
        if (!p) return;
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        if (!p.moved && Math.hypot(dx, dy) > 6) {
          p.moved = true;
          vp.setPointerCapture(e.pointerId);
          vp.classList.add('panning');
        }
        if (!p.moved) return;
        this.tx = p.tx + dx;
        this.ty = p.ty + dy;
        this.clampPan();
        this.apply();
      });
      const end = (e: PointerEvent): void => {
        this.pointers.delete(e.pointerId);
        if (this.pinch && this.pointers.size < 2) {
          this.settle(Math.sign(this.scale - this.pinch.scale), this.pinch.cx, this.pinch.cy);
          this.pinch = null;
        }
        if (vp.hasPointerCapture(e.pointerId)) vp.releasePointerCapture(e.pointerId);
        vp.classList.remove('panning');
        // Let the click that ends a drag see `moved`, then forget the drag.
        window.setTimeout(() => { if (this.pointers.size === 0) this.pan = null; }, 0);
      };
      vp.addEventListener('pointerup', end);
      vp.addEventListener('pointercancel', end);
      new ResizeObserver(() => {
        if (!this.fitted && vp.clientWidth > 0) {
          this.fitted = true;
          this.initialView();
        } else {
          this.clampPan();
          this.apply();
        }
      }).observe(vp);
    }

    /** Called whenever the window is shown: keep the selection in view. */
    onShown(): void {
      if (!this.fitted || this.viewport.clientWidth <= 0) return;
      const target = this.selected ?? this.frontier();
      this.ensureVisible(target);
    }

    /** First look: the whole tree on a big screen, the frontier on a small one. */
    private initialView(): void {
      if (this.viewport.clientWidth >= 1100) {
        this.fit();
      } else {
        this.scale = 1;
        const target = this.selected ?? this.frontier();
        this.centerOn(target);
      }
    }

    /** The most interesting node to look at: available, else partial, else the root. */
    private frontier(): string {
      const evo = this.hooks.evo();
      let best: string | null = null;
      for (const n of EVO_NODES) {
        const s = evo.statusOf(n.id).state;
        if (s === 'available') return n.id;
        if (s === 'partial' && !best) best = n.id;
      }
      return best ?? 'cells';
    }

    private onCardKey(e: KeyboardEvent, n: EvoNode): void {
      const dirs: Record<string, [number, number]> = {
        ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1],
      };
      const d = dirs[e.key];
      if (d) {
        e.preventDefault();
        let best: EvoNode | null = null;
        let bestScore = Infinity;
        for (const m of EVO_NODES) {
          if (m === n) continue;
          const dc = m.col - n.col;
          const dr = m.row - n.row;
          const along = dc * d[0] + dr * d[1];
          if (along <= 0) continue;
          const across = Math.abs(dc * d[1]) + Math.abs(dr * d[0]);
          const score = along + across * 2.5;
          if (score < bestScore) { bestScore = score; best = m; }
        }
        if (best) this.select(best.id, true);
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const st = this.hooks.evo().statusOf(n.id);
        if (st.state === 'available') this.tryDevelop(n.id);
        else this.detail.querySelector<HTMLElement>('.detail-main')?.focus();
      }
    }

    /* -------------------------------------------------------- selection -- */

    select(id: string, focusCard: boolean): void {
      this.selected = id;
      for (const [cid, card] of this.cards) card.classList.toggle('selected', cid === id);
      this.detailSig = '';
      this.renderDetail();
      this.drawEco();
      if (focusCard) {
        const card = this.cards.get(id);
        card?.focus({ preventScroll: true });
        this.ensureVisible(id);
      }
    }

    /** Open the window on a node: select it and bring it into view. */
    reveal(id: string): void {
      this.select(id, false);
      if (this.viewport.clientWidth > 0) this.centerOn(id);
      this.cards.get(id)?.focus({ preventScroll: true });
    }

    private ensureVisible(id: string): void {
      const n = evoNode(id);
      const x = nodeX(n) * this.scale + this.tx;
      const y = nodeY(n) * this.scale + this.ty;
      const vw = this.viewport.clientWidth;
      const vh = this.viewport.clientHeight;
      if (x < 0 || y < 0 || x + NODE_W * this.scale > vw || y + NODE_H * this.scale > vh) this.centerOn(id);
    }

    private applyFilter(): void {
      for (const n of EVO_NODES) {
        const card = this.cards.get(n.id);
        if (!card) continue;
        const dim = this.filter !== 'all' && n.kingdom !== this.filter && n.kingdom !== 'origin';
        card.classList.toggle('dimmed', dim);
        this.lineagePaths.get(n.id)?.classList.toggle('dimmed', dim);
      }
      this.drawEco();
    }

    /* ----------------------------------------------------------- update -- */

    /** Refresh states. Cheap when nothing changed. */
    update(force = false): void {
      const evo = this.hooks.evo();
      const dex = this.hooks.dex();
      if (!force && evo.revision === this.lastRevision && dex.version === this.lastFaunaVersion) return;
      this.lastRevision = evo.revision;
      this.lastFaunaVersion = dex.version;
      const world = this.hooks.world();
      let available = 0;

      for (const n of EVO_NODES) {
        const card = this.cards.get(n.id);
        if (!card) continue;
        const st = evo.statusOf(n.id);
        if (st.state === 'available') available++;
        card.classList.remove('state-locked', 'state-partial', 'state-available', 'state-developed');
        card.classList.add(`state-${st.state}`);
        const gone = st.state === 'developed' && stepGoneReason(world, n, st.alive) !== '';
        const extinct = st.state === 'developed' && (!st.alive || gone);
        card.classList.toggle('extinct', extinct);
        card.classList.toggle('gone', gone);
        const rip = card.querySelector<HTMLElement>('.tree-node-rip');
        if (rip) rip.hidden = !gone;

        const met = st.conds.filter((c) => c.met).length;
        const total = st.conds.length;
        let status: string;
        switch (st.state) {
          // "Für immer" is what the R.I.P. band says; the card has room for one word.
          case 'developed': status = extinct ? 'Ausgestorben' : 'Entwickelt'; break;
          case 'available': status = n.cost > 0 ? `Entwickeln · ${n.cost} EP` : 'Entwickeln · kostenlos'; break;
          case 'partial': status = `${met} von ${total} erfüllt`; break;
          default: status = `Gesperrt · ${n.cost} EP`;
        }
        const statusEl = card.querySelector('.tree-node-status');
        if (statusEl) statusEl.textContent = status;
        const bar = card.querySelector<HTMLElement>('.tree-node-progress span');
        if (bar) bar.style.width = `${Math.round((st.state === 'developed' ? 1 : met / Math.max(1, total)) * 100)}%`;
        const badge = card.querySelector<HTMLImageElement>('.tree-node-badge img');
        if (badge) {
          const icon = st.state === 'developed' ? (extinct ? 'warning' : 'check')
            : st.state === 'available' ? 'evolution' : st.state === 'partial' ? 'unlock' : 'lock';
          const src = uiIcon(icon);
          if (!badge.src.endsWith(src)) badge.src = src;
        }
        card.setAttribute('aria-label', `${n.name}, ${KINGDOM_NAMES[n.kingdom]}: ${gone ? 'für immer ausgestorben' : extinct ? 'entwickelt, derzeit ausgestorben' : STATE_NAMES[st.state]}${st.state === 'partial' ? `, ${met} von ${total} Bedingungen erfüllt` : ''}`);

        const path = this.lineagePaths.get(n.id);
        if (path) {
          const parentDev = n.parent ? world.evo.isDeveloped(n.parent) : true;
          path.classList.toggle('active', parentDev && st.state === 'developed');
          path.classList.toggle('reachable', parentDev && st.state !== 'developed');
          path.classList.remove('state-locked', 'state-partial', 'state-available', 'state-developed');
          path.classList.add(`state-${st.state}`);
        }
      }
      this.availChip.textContent = available === 1 ? '1 Schritt entwickelbar' : `${available} Schritte entwickelbar`;
      this.availChip.classList.toggle('hot', available > 0);

      if (!this.selected) this.select(this.frontier(), false);
      else this.renderDetail();
      if (this.allEco) this.drawEco();
    }

    private drawEco(): void {
      const g = this.ecoGroup;
      while (g.firstChild) g.removeChild(g.firstChild);
      const world = this.hooks.world();
      for (const n of EVO_NODES) {
        for (const need of n.eco) {
          for (const id of need.any) {
            const show = this.allEco || this.selected === n.id || this.selected === id;
            if (!show) continue;
            const from = evoNode(id);
            const dim = this.filter !== 'all' &&
              ((n.kingdom !== this.filter && n.kingdom !== 'origin') || (from.kingdom !== this.filter && from.kingdom !== 'origin'));
            const fx = nodeX(from) + NODE_W / 2;
            const fy = nodeY(from) + (from.row < n.row ? NODE_H : 0);
            const toX = nodeX(n) + NODE_W / 2 + (need.any.indexOf(id) - (need.any.length - 1) / 2) * 18;
            const toY = nodeY(n) + (from.row < n.row ? 0 : NODE_H);
            const vertical = from.row !== n.row;
            const d = vertical
              ? `M${fx},${fy} C${fx},${(fy + toY) / 2} ${toX},${(fy + toY) / 2} ${toX},${toY}`
              : `M${nodeX(from) + NODE_W},${nodeY(from) + 14} C${(fx + toX) / 2},${nodeY(from) - 30} ${(fx + toX) / 2},${nodeY(n) - 30} ${nodeX(n)},${nodeY(n) + 14}`;
            const kind = need.kind === 'food' ? (from.kingdom === 'animal' ? 'prey' : 'food') : need.kind;
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', d);
            const established = this.hooks.evo().presence(world, from) >= ECO_MIN_TILES;
            path.setAttribute('class', `edge-eco eco-${kind}${established ? ' met' : ''}${dim ? ' dimmed' : ''}`);
            path.setAttribute('marker-end', `url(#tree-arrow-${kind})`);
            g.appendChild(path);
          }
        }
      }
    }

    /* ----------------------------------------------------------- detail -- */

    /** The step developed from this window most recently. */
    private justDeveloped: string | null = null;

    private tryDevelop(id: string): void {
      this.hooks.develop(id, (res) => {
        if (!res.ok) return;
        this.justDeveloped = id;
        this.detailSig = '';
        this.update(true);
        this.select(id, false);
        const card = this.cards.get(id);
        if (card) {
          card.classList.remove('just-developed');
          void card.offsetWidth;
          card.classList.add('just-developed');
        }
      });
    }

    private renderDetail(): void {
      const id = this.selected;
      if (!id) return;
      const n = evoNode(id);
      const evo = this.hooks.evo();
      const world = this.hooks.world();
      const st = evo.statusOf(id);
      const gone = st.state === 'developed' ? stepGoneReason(world, n, st.alive) : '';
      const costCond = st.conds.find((c) => c.kind === 'cost');
      const sig = [
        id, st.state, st.alive, world.evo.chronicle.length, n.life !== undefined ? this.hooks.dex().version : -1, world.dinoEra.fate, world.floraEnded,
        st.conds.map((c) => (c.kind === 'cost' ? `${c.met}` : `${c.met}${c.pending}${c.detail}`)).join('|'),
      ].join('#');
      if (sig === this.detailSig) {
        // Same content: only the running point count moves.
        if (this.costDetailEl && costCond) this.costDetailEl.textContent = costCond.detail;
        if (this.missingEl) this.missingEl.textContent = EvolutionSystem.missingSummary(st);
        return;
      }
      this.detailSig = sig;
      this.costDetailEl = null;
      this.missingEl = null;

      const d = this.detail;
      // Keep the keyboard where it was across a rebuild.
      const active = document.activeElement as HTMLElement | null;
      const focusKey = active && d.contains(active) ? active.dataset.focusKey ?? 'main' : null;
      d.innerHTML = '';
      d.className = `tree-detail ${tint(n)} state-${st.state}`;

      const main = make('div', 'detail-main');
      main.tabIndex = -1;
      const head = make('div', 'detail-head');
      head.appendChild(pixelArt(evoIcon(id), 32, 'detail-art'));
      const ht = make('div', 'detail-head-text');
      const chips = make('div', 'detail-chips');
      chips.append(
        make('span', `chip chip-k k-${n.kingdom}`, KINGDOM_NAMES[n.kingdom]),
        make('span', `chip chip-state state-${st.state}`, gone ? 'Für immer ausgestorben' : st.state === 'developed' && !st.alive ? 'Ausgestorben' : STATE_NAMES[st.state]),
      );
      ht.append(chips, make('h3', 'detail-name', n.name), make('div', 'detail-short', n.short));
      head.appendChild(ht);
      main.appendChild(head);

      const fresh = world.evo.chronicle.find((e) => e.key === `evo:${id}`);
      if (fresh && this.justDeveloped === id) {
        const box = make('div', `detail-chronicle fresh${fresh.major ? ' major' : ''}`);
        box.append(
          make('div', 'detail-chronicle-kicker', fresh.major ? 'Meilenstein der Evolution' : 'Neu entwickelt'),
          make('div', 'detail-chronicle-title', fresh.title), make('p', undefined, fresh.text),
          make('p', 'detail-chronicle-change', fresh.change),
        );
        main.appendChild(box);
      }
      main.appendChild(make('p', 'detail-desc', n.description));
      const earthMa = EARTH_DATES_MA[id];
      if (earthMa !== undefined) main.appendChild(make('p', 'detail-short', `Auf der Erde: vor etwa ${formatYearsAmount(earthMa * 1e6)} Jahren`));

      // --- action ---
      const action = make('div', 'detail-action');
      if (st.state === 'developed') {
        const rec = world.evo.developed.get(id);
        const verb = rec?.spontaneous ? 'Von selbst entstanden' : 'Entwickelt';
        const when = !rec ? 'Entwickelt'
          : rec.migrated ? 'Entwickelt – aus einem älteren Spielstand übernommen'
            : `${verb}${yearsAgo(rec.years) > 0 ? '' : ':'} ${formatEarthDate(rec.years)}`;
        action.appendChild(make('div', 'detail-when', when));
        if (!st.alive || gone) {
          const warn = make('div', 'detail-warn');
          warn.append(img(uiIcon('warning'), 'ico'), make('span', undefined,
            gone || (n.life !== undefined
              ? 'Derzeit ausgestorben. Mit „Leben ansiedeln“ an einem geeigneten Ort neu ansiedeln.'
              : 'Derzeit ausgestorben. Mit dem Werkzeug „Pflanzen“ an einem geeigneten Ort neu ansiedeln.')));
          action.appendChild(warn);
        }
        const row = make('div', 'detail-buttons');
        row.appendChild(button({
          label: 'Auf der Karte zeigen', icon: uiIcon('target'), cls: 'btn btn-small',
          onClick: () => { if (!this.hooks.showOnMap(id)) this.flash('Derzeit lebt nirgends eine Population.'); },
        }));
        if (!gone) {
          row.appendChild(button({
            label: n.life !== undefined ? 'Ansiedeln' : 'Pflanzen', icon: uiIcon(n.life !== undefined ? 'tool-life' : 'tool-plant'), cls: 'btn btn-small btn-ghost',
            title: 'Werkzeug mit dieser Gruppe auswählen',
            onClick: () => this.hooks.placeTool(id),
          }));
        }
        action.appendChild(row);
      } else {
        const can = st.state === 'available';
        const dev = button({
          label: can ? (n.cost > 0 ? `Entwickeln · ${n.cost} EP` : 'Entwickeln · kostenlos') : `Entwickeln · ${n.cost} EP`,
          icon: uiIcon('evolution'), cls: `btn btn-primary btn-wide${can ? ' pulse' : ''}`,
          onClick: () => { dev.disabled = true; this.tryDevelop(id); },
        });
        dev.dataset.focusKey = 'develop';
        dev.disabled = !can;
        action.appendChild(dev);
        if (!can) {
          const why = make('div', 'detail-missing');
          this.missingEl = make('span', undefined, EvolutionSystem.missingSummary(st));
          why.append(img(uiIcon('lock'), 'ico'), this.missingEl);
          action.appendChild(why);
        }
        if (EvolutionSystem.isReady(st)) {
          action.appendChild(make('div', 'detail-wild', 'Bleiben alle Bedingungen erfüllt, kann dieser Schritt mit der Zeit auch von selbst entstehen – ganz ohne Evolutionspunkte.'));
        }
      }
      main.appendChild(action);

      const heading = (text: string, icon: string): HTMLElement => {
        const h = make('h4', 'detail-h');
        h.append(img(uiIcon(icon), 'ico'), make('span', undefined, text));
        return h;
      };

      // --- conditions ---
      main.appendChild(heading('Voraussetzungen', 'check'));
      const list = make('ul', 'cond-list');
      for (const c of st.conds) {
        const li = make('li', `cond ${c.met ? 'met' : c.pending ? 'pending' : 'unmet'} cond-${c.kind}`);
        li.append(
          img(uiIcon(c.met ? 'check' : c.pending ? 'info' : c.kind === 'cost' ? 'info' : 'lock'), 'ico'),
          make('span', 'cond-label', c.label),
        );
        if (c.detail) {
          const det = make('span', 'cond-detail', c.detail);
          if (c.kind === 'cost') this.costDetailEl = det;
          li.appendChild(det);
        }
        list.appendChild(li);
      }
      main.appendChild(list);

      // --- habitat ---
      main.appendChild(heading('Lebensraum', 'link-habitat'));
      const habs = make('div', 'detail-habitats');
      for (const tag of n.habitat.tags) {
        const h = make('span', 'hab-pill');
        h.append(img(habitatAsset(tag), 'hab-chip'), make('span', undefined, HABITAT_TAG_NAMES[tag]));
        habs.appendChild(h);
      }
      main.appendChild(habs);

      // --- sub-species ---
      if (n.life !== undefined) {
        main.appendChild(heading('Unterarten', 'tool-life'));
        main.appendChild(speciesStrip(n.life, this.hooks.dex(), this.hooks.world(), (c, s) => this.hooks.openSpecies(c, s)));
        const cap = n.life === Life.Mammal ? mammalCapNote(this.hooks.world()) : '';
        if (cap) {
          const note = make('div', 'detail-warn');
          note.append(img(uiIcon('lock'), 'ico'), make('span', undefined, cap));
          main.appendChild(note);
        }
      }

      // --- ecosystem ---
      main.appendChild(heading('Verbindung zum Ökosystem', 'link-food'));
      main.appendChild(make('p', 'detail-eco', n.ecosystem));
      if (n.eco.length > 0) {
        const ul = make('ul', 'detail-links');
        for (const need of n.eco) {
          const li = make('li');
          li.appendChild(img(uiIcon(need.kind === 'partner' ? 'link-partner' : need.kind === 'soil' ? 'link-habitat' : 'link-food'), 'ico link-ico'));
          li.appendChild(make('span', 'link-kind', `${ECO_KIND_NAMES[need.kind]}: `));
          need.any.forEach((oid, k) => {
            if (k > 0) li.appendChild(document.createTextNode(k === need.any.length - 1 ? ' oder ' : ', '));
            li.appendChild(this.nodeLink(oid));
          });
          ul.appendChild(li);
        }
        main.appendChild(ul);
      }
      const usedBy = EVO_NODES.filter((m) => m.eco.some((e) => e.any.includes(id)));
      if (usedBy.length > 0) {
        const p = make('p', 'detail-related');
        p.appendChild(make('span', 'link-kind', 'Wird gebraucht von: '));
        usedBy.forEach((m, k) => {
          if (k > 0) p.appendChild(document.createTextNode(', '));
          p.appendChild(this.nodeLink(m.id));
        });
        main.appendChild(p);
      }

      // --- benefits ---
      main.appendChild(heading('Nutzen', 'info'));
      const ben = make('ul', 'benefit-list');
      for (const b of n.benefits) {
        const li = make('li');
        li.append(img(uiIcon('check'), 'ico'), make('span', undefined, b));
        ben.appendChild(li);
      }
      main.appendChild(ben);

      // --- lineage ---
      main.appendChild(heading('Abstammung', 'link-lineage'));
      const lin = make('p', 'detail-related');
      if (n.parent) {
        lin.appendChild(make('span', 'link-kind', 'Geht hervor aus: '));
        lin.appendChild(this.nodeLink(n.parent));
        if (n.lineageNote) lin.appendChild(make('span', 'link-note', ` (${n.lineageNote})`));
      } else {
        lin.appendChild(make('span', 'link-kind', 'Ursprung allen Lebens auf deinem Planeten.'));
      }
      const children = EVO_NODES.filter((m) => m.parent === id);
      if (children.length > 0) {
        lin.appendChild(document.createElement('br'));
        lin.appendChild(make('span', 'link-kind', 'Führt zu: '));
        children.forEach((m, k) => {
          if (k > 0) lin.appendChild(document.createTextNode(', '));
          lin.appendChild(this.nodeLink(m.id));
        });
      }
      main.appendChild(lin);

      // --- chronicle text, findable again later ---
      const entry = world.evo.chronicle.find((e) => e.key === `evo:${id}`);
      if (entry && this.justDeveloped !== id) {
        const box = make('div', 'detail-chronicle');
        box.append(make('div', 'detail-chronicle-title', `„${entry.title}“`), make('p', undefined, entry.text), make('p', 'detail-chronicle-change', entry.change));
        main.appendChild(heading('Aus der Chronik', 'chronicle'));
        main.appendChild(box);
      }

      d.appendChild(main);
      if (focusKey) {
        const again = focusKey === 'main' ? null : d.querySelector<HTMLElement>(`[data-focus-key="${focusKey}"]`);
        (again && !again.hasAttribute('disabled') ? again : main).focus({ preventScroll: true });
      }
    }

    private costDetailEl: HTMLElement | null = null;
    private missingEl: HTMLElement | null = null;

    private nodeLink(id: string): HTMLElement {
      const n = evoNode(id);
      const a = button({ label: n.name, cls: `link k-${n.kingdom}`, onClick: () => this.select(id, true) });
      a.dataset.focusKey = `link:${id}`;
      return a;
    }

    private flash(text: string): void {
      const el = make('div', 'detail-flash', text);
      this.detail.prepend(el);
      window.setTimeout(() => el.remove(), 3000);
    }
  }
}
