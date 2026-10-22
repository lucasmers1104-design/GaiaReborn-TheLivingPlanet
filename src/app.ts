/* =============================================================================
 * SimEarth 2.0 — application wiring
 * -----------------------------------------------------------------------------
 * Builds the stage (the living map with its tool dock), the status bar, the
 * menus and every window, then runs the fixed-timestep tick loop. All game
 * rules live in the systems; this file only connects them to the screen.
 * ========================================================================== */

namespace SE {
  /** Index-aligned with SPEED_TICK_MS (simcore.ts). */
  const SPEED_NAMES = ['Pause', 'Sehr langsam', 'Langsam', 'Mittel', 'Schnell'];
  /** Keyboard shortcut of each tool, index-aligned with TOOL_NAMES (wired in wireKeyboard). */
  const TOOL_KEYS = ['U', 'V', 'H', 'P', 'L', 'K'];
  /** The overview-map legend that matches a climate overlay's colours (winds and currents are arrows). */
  const OVERLAY_LEGEND_MODES: readonly (MapMode | null)[] = [MapMode.AirTemp, MapMode.Rainfall, null, null, MapMode.OceanTemp, null];
  /** Unsaved play is written to the autosave slot this often while running. */
  const AUTOSAVE_MS = 3 * 60 * 1000;
  const SETTINGS_KEY = 'simearth2.settings';
  /** Minimum gap between flat overview-map redraws. */
  const MAP_RENDER_MS = 250;
  /** A finger held this long without moving starts the terraforming brush. */
  const TOUCH_HOLD_MS = 150;
  /** WASD by KeyboardEvent.code: the direction each key pans the map. */
  const PAN_KEYS: Readonly<Record<string, readonly [number, number]>> = {
    KeyW: [0, -1], KeyA: [-1, 0], KeyS: [0, 1], KeyD: [1, 0],
  };
  /** Screen pixels per second the held keys pan at full speed, reached over PAN_EASE_MS: a tap nudges, holding sweeps. */
  const PAN_PX_PER_S = 900;
  const PAN_EASE_MS = 200;
  /** A tap with the brush pushes as long as a hold of this many ms. */
  const TAP_PUSH_MS = 150;

  /** Footprint radius of each disaster, matching EventSystem's brushes. */
  const EVENT_RADIUS: readonly number[] = [8, 8, 6, 4, 6, 6, 6, 8];
  /** The ping where the camera lands on a disaster, in the disaster tool's colour. */
  const HAZARD_PING = '#ff7a6b';
  /** The overview map's ring over other news: the sun gold of the civilization badges. */
  const NEWS_PING = '#f6c453';
  function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  type LifeMode = 'life' | 'city' | 'terraformer';

  interface ToolSelection {
    tool: Tool;
    altitudeRaise: boolean;
    flora: Flora;
    /** The plant palette's "clear" brush. */
    clearing: boolean;
    life: Life;
    tech: Tech;
    terraformer: Terraformer;
    event: EventKind;
    lifeMode: LifeMode;
  }

  interface Settings {
    relativeDate: boolean;
    pauseOnMilestone: boolean;
    dockCollapsed: boolean;
    lastSlot: number;
    /** The chime when a new step arises. */
    sound: boolean;
    /** Background music on the title screen and in the game. */
    music: boolean;
    /** The sea's murmur while coasts are in view. */
    ambient: boolean;
    /** Volume sliders, 0..1: sea murmur, effects (chime and disasters), music. */
    ambientVolume: number;
    soundVolume: number;
    musicVolume: number;
    /** Sea share new planets are made with, OCEAN_SHARE_MIN..OCEAN_SHARE_MAX. */
    oceanShare: number;
    /** The planet new games start on: random, or the Earth in an epoch. */
    epoch: EpochId;
    /** "Effekte reduzieren": disasters without shaking or flashes, no surf or river current. */
    reduceEffects: boolean;
    /** The full intro has played (or been skipped); it only comes before the first world, later ones get the short intro. */
    introSeen: boolean;
    /** Developer mode (INTRO_DEV) only: every "Spiel starten" plays the short intro; otherwise the full one. */
    introDevOff: boolean;
  }

  /** A disaster to fly to: where it started, and its storm's path if it has one. */
  type HazardSpot = { readonly x: number; readonly y: number; readonly storm?: { readonly path: readonly number[] } };

  export class App {
    /* ---- simulation ---- */
    /** The planet, in a worker or on the page (simhost.ts); everything on screen reads `sim.view`. */
    readonly sim: SimHost;
    get world(): WorldState { return this.sim.view.world; }
    get params(): ModelParams { return this.sim.view.params; }
    get geo(): GeoSystem { return this.sim.view.geo; }
    get flora(): FloraSystem { return this.sim.view.flora; }
    get life(): LifeSystem { return this.sim.view.life; }
    get evolution(): EvolutionSystem { return this.sim.view.evolution; }
    get civ(): CivSystem { return this.sim.view.civ; }
    get hazards(): HazardSystem { return this.sim.view.hazards; }
    get fauna(): FaunaDex { return this.sim.view.fauna; }
    private get history(): HistoryRecorder { return this.sim.view.history; }
    /** Model panels already paid for on this planet. */
    private get paidModels(): Set<string> { return this.sim.view.paidModels; }
    /** Hazards that started without the player since the last report (nature, chains). */
    private readonly hazardNews: Extract<SimNote, { kind: 'hazard' }>[] = [];
    /** The latest disaster and the planet it belongs to, for "Zum letzten Ereignis springen". */
    private lastHazard: { id: number; x: number; y: number; generation: number } | null = null;
    /** Ticks of the state last seen on screen (worker mode: a new one means unsaved progress). */
    private seenTicks = -1;
    /** The developer mode as the simulation last heard it. */
    private devModeSent = false;
    /** The seed of the planet asked for last: in worker mode the state showing it may still be on its way. */
    private planetSeed = 0;

    /* ---- views ---- */
    editView!: EditView;
    private mapView!: MapView;
    private gaiaPanel!: GaiaPanel;
    private historyPanel!: HistoryPanel;
    private reportPanel!: ReportPanel;
    private examinePanel!: ExaminePanel;
    private chroniclePanel!: ChroniclePanel;
    private spaceportPanel!: SpaceportPanel;
    private tree!: EvolutionTreeView;
    private readonly graphs = new Map<GraphKind, GraphPanel>();
    private readonly sliderPanels: SliderPanel[] = [];
    private readonly modelHeroes = new Map<string, ModelHero>();

    /* ---- ui ---- */
    private readonly stage: HTMLElement;
    private readonly windows: WindowManager;
    private readonly notifier: Notifier;
    private menuBar!: MenuBar;
    private title: TitleScreen | null = null;
    private readonly music: MusicPlayer;
    private readonly surf = new AmbientLoop('assets/audio/ambient/ocean-waves.mp3', SURF_VOLUME);
    private surfTarget = 0;
    private readonly bubbling = new AmbientLoop('assets/audio/sfx/simmering-water.mp3', BUBBLE_VOLUME);
    private bubblingTarget = 0;
    private readonly stormWind = new AmbientLoop('assets/audio/sfx/hurricane-wind.mp3', STORM_WIND_VOLUME);
    private stormWindTarget = 0;
    private lastSurfCheck = 0;
    private canvas!: HTMLCanvasElement;
    private dock!: HTMLElement;
    private toolTitle!: HTMLElement;
    private toolKey!: HTMLElement;
    private layerPop!: HTMLElement;
    private layerBtn!: HTMLButtonElement;
    private mapBtn!: HTMLButtonElement;
    private overlayLegend!: HTMLElement;
    private toolHint!: HTMLElement;
    private toolOptions!: HTMLElement;
    private goalNotice!: GoalNotice;
    private hoverTip!: HTMLElement;
    private mapLegendEl!: HTMLElement;
    private readonly toolButtons = new Map<Tool, HTMLButtonElement>();
    private readonly layerButtons: HTMLButtonElement[] = [];
    private readonly overlayButtons = new Map<Overlay, HTMLButtonElement>();
    private readonly mapButtons = new Map<MapMode, HTMLButtonElement>();
    private readonly speedButtons: HTMLButtonElement[] = [];
    private hud!: {
      omega: HTMLElement; omegaBar: HTMLElement; ep: HTMLElement; epRate: HTMLElement;
      o2: HTMLElement; co2: HTMLElement; temp: HTMLElement; date: HTMLElement; scale: HTMLElement;
      play: HTMLButtonElement; evoBadge: HTMLElement; evoBtn: HTMLButtonElement;
      oceanO2: HTMLElement;
      devTag: HTMLElement; // DEVMODE
    };
    private hudInfo!: HudInfo;

    /* ---- state ---- */
    /** The Ω tier last announced, so a new planet or a load starts silent. */
    private omegaStageSeen = 0;
    private speed = 3;
    private lastRunningSpeed = 3;
    private settings: Settings = { relativeDate: true, pauseOnMilestone: false, dockCollapsed: false, lastSlot: 1, sound: true, music: true, ambient: true, ambientVolume: 0.8, soundVolume: 0.8, musicVolume: 0.8, oceanShare: OCEAN_FRACTION, epoch: 'random', reduceEffects: prefersReducedMotion(), introSeen: false, introDevOff: false };
    private mapShowsInfo = false;
    private selection: ToolSelection = {
      tool: Tool.Examine, altitudeRaise: true, flora: Flora.LandPlants, clearing: false,
      life: Life.Prokaryote, tech: Tech.Stone, terraformer: Terraformer.OxygenGenerator,
      event: EventKind.Volcano, lifeMode: 'life',
    };
    private examineTile: { x: number; y: number } | null = null;
    private painting = false;
    /** The tile the current stroke last acted on, so a drag never re-fires on it. */
    private lastPainted: number | null = null;
    private panState: { x: number; y: number; sx: number; sy: number; id: number } | null = null;
    private readonly touches = new Map<number, { x: number; y: number }>();
    private pinch: { d: number; px: number } | null = null;
    /** A finger that has touched the map but not yet tapped, stroked or pinched. */
    private touchPending: { id: number; x: number; y: number; t: number } | null = null;
    /** The terraforming brush, and where the pointer holding it is (client pixels). */
    private readonly terraform = new TerraformTool();
    private strokeAt: { x: number; y: number } | null = null;
    /** WASD keys held down (KeyboardEvent.code), and how far the pan has eased in, 0..1. */
    private readonly panKeys = new Set<string>();
    private panEase = 0;
    private lastNudge = 0;
    /** Direct mode: a finished stroke whose settling (SimCore.beginSettle) runs a step a frame, so releasing the brush never stalls the frame that shows it. */
    private settleDue: { phase: 0 | 1 | 2 } | null = null;
    /** Progress made since the last save — guards New Planet and Load. */
    private unsaved = false;
    private savingNow = false;
    private milestonePaused = false;
    private speedBeforeMilestone = 3;
    /** Speed to return to once the dinosaurs' fate is settled; null while it holds nothing (dinoera.ts). */
    private fateResume: number | null = null;
    /** The fate dialog is on screen. */
    private fateAsking = false;
    /** Hazard generation (planet) whose comet show has been started. */
    private cometShown = -1;
    /** The launch film on screen, until the closing dialog is answered. */
    private launchFilm: LaunchFilm | null = null;
    /** The launch is on its way to the simulation: a second click must not launch twice. */
    private launching = false;
    private lexicon!: LexiconPanel;
    private speciesInfo!: SpeciesInfoPanel;
    private readonly discoveries: DiscoveryToasts;
    private readonly ripStamps: RipStamps;
    private screenHeld = false;

    private lastFrame = 0;
    private accumulator = 0;
    private lastUi = 0;
    private lastMapRender = 0;
    private lastAutosave = 0;
    private toolRevision = -1;

    constructor() {
      // Preview pages and `?sim=direct` drive the planet on the page; everything else in a worker when one starts.
      const direct = /[?&]sim=direct(&|$)/.test(location.search) || !!document.querySelector('script[src*="_preview"]');
      this.sim = new SimHost(direct ? 'direct' : 'worker');
      this.sim.onFailover = () => this.simFailed();
      this.stage = el<HTMLElement>('desktop');
      Modal.attach(el<HTMLElement>('modal-root'));
      this.loadSettings();
      this.music = new MusicPlayer(this.settings.music, this.settings.musicVolume);
      SFX.volume = () => (this.settings.sound ? this.settings.soundVolume : 0);
      // Every press anywhere, UI or map: capture phase, so stopPropagation can't swallow it.
      // Not under the intro: its music has the stage. Not for the altitude brush on the map: it has its own sound.
      document.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || activeIntro) return;
        if (e.target === this.canvas && this.selection.tool === Tool.SetAltitude) return;
        playClick();
      }, { capture: true });

      this.windows = new WindowManager(this.stage);
      this.notifier = new Notifier(el<HTMLElement>('toasts'), el<HTMLElement>('milestones'), {
        reported: (key) => this.sim.predict({ type: 'reported', key }),
        view: (id) => this.openTree(id),
        milestone: (open) => { this.screenHeld = open; this.onMilestone(open); this.discoveries.setHeld(open); },
        narrow: () => this.windows.narrow,
        spaceport: () => this.openSpaceport(),
        showcase: new Showcase(document.body, {
          view: (id) => this.openTree(id),
          showOnMap: (e) => this.showEntryOnMap(e),
          progress: () => ({ developed: this.world.evo.developed.size, total: EVO_NODES.length }),
          sound: () => (this.settings.sound ? this.settings.soundVolume : 0),
        }),
      });
      this.notifier.pauseOnMilestone = this.settings.pauseOnMilestone;
      // Made here, not in index.html: a cached old page must still boot with a new bundle.
      const discoveryHost = make('div', 'discoveries');
      discoveryHost.setAttribute('aria-live', 'polite');
      document.body.appendChild(discoveryHost);
      this.discoveries = new DiscoveryToasts(discoveryHost, {
        open: (c, s) => { this.speciesInfo.show(c, s); this.windows.show('species'); },
        openLexicon: () => this.windows.show('lexicon'),
        held: () => this.screenHeld,
        shown: (events) => { this.sim.predict({ type: 'announced', events: events.map((e) => ({ c: e.c, stage: e.stage })) }); playDiscoveryChime(SFX.volume()); },
      });
      this.ripStamps = new RipStamps(document.body, {
        held: () => !!this.title || !!activeIntro || this.screenHeld || Modal.open || this.fateAsking || !!this.launchFilm,
        reduced: () => this.settings.reduceEffects,
      });

      this.buildStage();
      // Hidden, the page draws no frames and so never paused for a milestone or saved: the worker holds the planet meanwhile.
      document.addEventListener('visibilitychange', () => {
        if (this.sim.mode === 'worker') this.sim.predict({ type: 'speed', speed: document.hidden ? 0 : this.speed });
      });
      // Worker mode: the landscape worker refreshes the map's field from the simulation worker's states itself.
      PixelTerrain.shared().whenReady(() => {
        if (this.sim.mode === 'worker') PixelTerrain.shared().feedFrom((port) => this.sim.feed(port));
      });
      this.buildMapWindow();
      this.buildInfoWindows();
      this.buildModelWindows();
      this.buildGraphWindows();
      this.buildTreeWindow();
      this.buildHud();
      this.buildMenus();
      this.wireKeyboard();
      this.windows.onChange = () => {
        this.syncWindowButtons();
        this.stage.classList.toggle('examining', this.windows.isVisible('examine'));
      };

      this.newPlanet();
      this.unsaved = false;
      // The overview map opens when play starts (not on a phone, where every
      // window is a full-screen sheet and the planet comes first).
      this.showTitle();
    }

    /* ============================================================ stage === */

    private buildStage(): void {
      const canvas = make('canvas', 'world-canvas');
      canvas.setAttribute('aria-label', 'Planetenkarte – Werkzeug anwenden, ziehen zum Verschieben, Mausrad zum Zoomen');
      canvas.tabIndex = 0;
      this.canvas = canvas;
      this.stage.appendChild(canvas);
      this.editView = new EditView(canvas);
      this.editView.reduceEffects = this.settings.reduceEffects;
      this.wireCanvas(canvas);

      /* ---- tool rail and the active tool's card ---- */
      const dock = make('aside', 'dock');
      dock.setAttribute('aria-label', 'Werkzeuge');
      this.dock = dock;
      const tools = make('div', 'dock-tools glass');
      tools.setAttribute('role', 'toolbar');
      tools.setAttribute('aria-label', 'Werkzeuge');
      tools.setAttribute('aria-orientation', 'vertical');
      for (let t = 0; t < TOOL_NAMES.length; t++) {
        const tool = t as Tool;
        const b = button({
          label: TOOL_NAMES[t], icon: uiIcon(TOOL_ICONS[t]), cls: 'tool-btn', showLabel: false,
          title: `${TOOL_NAMES[t]} (Taste ${TOOL_KEYS[t]})`,
          // The active tool's button opens and closes its card.
          onClick: () => {
            if (this.selection.tool === tool && !this.settings.dockCollapsed) this.setDockCollapsed(true);
            else this.selectTool(tool);
          },
        });
        b.setAttribute('aria-keyshortcuts', TOOL_KEYS[t]);
        const key = make('span', 'tool-key', TOOL_KEYS[t]);
        key.setAttribute('aria-hidden', 'true');
        b.appendChild(key);
        tools.appendChild(b);
        this.toolButtons.set(tool, b);
      }

      const panel = make('section', 'dock-panel glass');
      panel.id = 'tool-card';
      const head = make('div', 'dock-head');
      this.toolTitle = make('h2', 'dock-title');
      this.toolKey = make('span', 'kbd');
      this.toolKey.setAttribute('aria-hidden', 'true');
      const close = button({
        label: 'Werkzeugkarte schließen', icon: uiIcon('close'), cls: 'icon-btn dock-close', showLabel: false,
        onClick: () => this.setDockCollapsed(true),
      });
      head.append(this.toolTitle, this.toolKey, close);
      panel.setAttribute('aria-labelledby', 'tool-card-title');
      this.toolTitle.id = 'tool-card-title';
      this.toolHint = make('p', 'dock-hint');
      this.toolOptions = make('div', 'tool-options');
      panel.append(head, this.toolHint, this.toolOptions);
      dock.append(tools, panel);
      this.stage.appendChild(dock);
      this.setDockCollapsed(this.settings.dockCollapsed);

      /* ---- next step ---- */
      this.goalNotice = new GoalNotice(this.stage, (id) => this.openTree(id));

      /* ---- map controls: layers, overview map, zoom ---- */
      const zoom = make('div', 'map-zoom glass');
      zoom.setAttribute('role', 'toolbar');
      zoom.setAttribute('aria-label', 'Karte');
      zoom.setAttribute('aria-orientation', 'vertical');
      this.layerBtn = button({
        label: 'Kartenebenen', icon: uiIcon('layers'), cls: 'icon-btn', showLabel: false, title: 'Kartenebenen und Klima-Überlagerung',
        onClick: () => this.setLayersOpen(this.layerPop.hidden),
      });
      this.layerBtn.setAttribute('aria-expanded', 'false');
      this.layerBtn.setAttribute('aria-controls', 'layer-pop');
      this.mapBtn = button({
        label: 'Übersichtskarte', icon: uiIcon('map'), cls: 'icon-btn', showLabel: false, title: 'Übersichtskarte (M)',
        onClick: () => this.windows.toggle('map'),
      });
      zoom.append(
        this.layerBtn, this.mapBtn, make('div', 'map-zoom-sep'),
        button({ label: 'Hineinzoomen', icon: uiIcon('zoom-in'), cls: 'icon-btn', showLabel: false, title: 'Hineinzoomen (+)', onClick: () => this.zoomMap(1.25) }),
        button({ label: 'Herauszoomen', icon: uiIcon('zoom-out'), cls: 'icon-btn', showLabel: false, title: 'Herauszoomen (−)', onClick: () => this.zoomMap(0.8) }),
      );
      this.layerPop = this.buildLayerPopover();
      this.stage.append(this.layerPop, zoom);
      // A click anywhere else closes the popover, as a menu would.
      document.addEventListener('pointerdown', (e) => {
        if (this.layerPop.hidden || !(e.target instanceof Node)) return;
        if (!this.layerPop.contains(e.target) && !this.layerBtn.contains(e.target)) this.setLayersOpen(false);
      });

      this.hoverTip = make('div', 'hover-tip');
      this.hoverTip.setAttribute('aria-hidden', 'true');
      this.stage.appendChild(this.hoverTip);

      this.selectTool(Tool.Examine, false);
    }

    /** The map-layers popover beside the map controls: additive layers and one climate overlay. */
    private buildLayerPopover(): HTMLElement {
      const pop = make('section', 'layer-pop glass');
      pop.id = 'layer-pop';
      pop.hidden = true;
      pop.setAttribute('aria-labelledby', 'layer-pop-title');
      const head = make('div', 'layer-pop-head');
      const title = make('h2', 'layer-pop-title', 'Kartenebenen');
      title.id = 'layer-pop-title';
      head.append(img(uiIcon('layers'), 'ico'), title, button({
        label: 'Kartenebenen schließen', icon: uiIcon('close'), cls: 'icon-btn layer-pop-close', showLabel: false,
        onClick: () => this.setLayersOpen(false, true),
      }));

      const layers = make('div', 'layer-grid');
      layers.setAttribute('role', 'group');
      layers.setAttribute('aria-label', 'Ebenen, beliebig kombinierbar');
      const keys: (keyof EditView['layers'])[] = ['oceans', 'biomes', 'cities', 'life', 'events', 'clouds'];
      DATA_LAYERS.forEach((name, i) => {
        const key = keys[i];
        const b = button({
          label: name, icon: uiIcon(DATA_LAYER_ICONS[i]), cls: 'layer-tg',
          onClick: () => { this.editView.layers[key] = !this.editView.layers[key]; this.syncLayerButtons(); this.editView.markDirty(); },
        });
        layers.appendChild(b);
        this.layerButtons.push(b);
      });

      const overlays = make('div', 'overlay-list');
      overlays.setAttribute('role', 'radiogroup');
      overlays.setAttribute('aria-labelledby', 'overlay-h');
      const radio = (ov: Overlay, name: string, icon: string | null): void => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'overlay-radio';
        b.setAttribute('role', 'radio');
        b.append(make('i', 'overlay-dot'), icon ? img(icon, 'ico') : make('span', 'ico'), make('span', undefined, name));
        b.addEventListener('click', () => { this.editView.overlay = ov; this.syncLayerButtons(); this.editView.markDirty(); });
        overlays.appendChild(b);
        this.overlayButtons.set(ov, b);
      };
      radio(Overlay.None, 'Keine', null);
      OVERLAY_NAMES.forEach((name, i) => radio(i as Overlay, name, uiIcon(OVERLAY_ICONS[i])));
      const overlayHead = make('div', 'layer-h', 'Klima-Überlagerung · eine zur Zeit');
      overlayHead.id = 'overlay-h';
      this.overlayLegend = make('div', 'map-legend overlay-legend');
      pop.append(head, layers, overlayHead, overlays, this.overlayLegend);
      pop.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.setLayersOpen(false, true); }
      });
      return pop;
    }

    private setLayersOpen(open: boolean, refocus = false): void {
      this.layerPop.hidden = !open;
      setPressed(this.layerBtn, open);
      this.layerBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) this.syncLayerButtons();
      if (refocus) this.layerBtn.focus();
    }

    private syncLayerButtons(): void {
      const keys: (keyof EditView['layers'])[] = ['oceans', 'biomes', 'cities', 'life', 'events', 'clouds'];
      this.layerButtons.forEach((b, i) => setPressed(b, this.editView.layers[keys[i]]));
      for (const [ov, b] of this.overlayButtons) {
        const on = this.editView.overlay === ov;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      }
      // The layers button glows while the map shows a climate overlay.
      this.layerBtn.classList.toggle('lit', this.editView.overlay !== Overlay.None);
      this.renderOverlayLegend();
    }

    /** The colour scale of the active climate overlay, under its radio list. */
    private renderOverlayLegend(): void {
      const host = this.overlayLegend;
      const ov = this.editView.overlay;
      const mode = ov === Overlay.None ? null : OVERLAY_LEGEND_MODES[ov];
      host.hidden = ov === Overlay.None;
      if (mode !== null) { renderMapLegend(host, this.world, mode, false); return; }
      host.innerHTML = '';
      if (ov === Overlay.Magma) {
        const box = make('div', 'legend-strip');
        const bar = make('div', 'legend-strip-bar');
        bar.style.background = `linear-gradient(90deg, ${MAGMA_RAMP.map(([v, c]) => `${rgbCss(c)} ${v * 100}%`).join(', ')})`;
        const marks = make('div', 'legend-strip-labels');
        marks.append(make('span', undefined, 'wenig Magma'), make('span', undefined, 'viel'));
        box.append(bar, marks);
        host.appendChild(box);
      } else if (ov !== Overlay.None) {
        host.appendChild(make('p', 'overlay-note', 'Pfeile zeigen die Richtung.'));
      }
    }

    /** Closes or reopens the active tool's card; the rail stays. */
    private setDockCollapsed(on: boolean): void {
      this.settings.dockCollapsed = on;
      this.dock.classList.toggle('collapsed', on);
      this.saveSettings();
    }

    private zoomMap(factor: number): void {
      const r = this.canvas.getBoundingClientRect();
      this.editView.zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2);
    }

    /* ---------------------------------------------------- canvas input -- */

    private wireCanvas(canvas: HTMLCanvasElement): void {
      canvas.addEventListener('pointerdown', (e) => {
        canvas.focus({ preventScroll: true });
        if (e.pointerType === 'touch') {
          this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (this.touches.size >= 2) {
            // A second finger means pinch: whatever the first finger was
            // about to do with the tool is cancelled, and nothing is charged.
            this.touchPending = null;
            this.painting = false;
            this.endStroke();
            const [a, b] = Array.from(this.touches.values());
            this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, px: this.editView.tilePx };
            this.panState = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, sx: this.editView.scrollX, sy: this.editView.scrollY, id: -1 };
            return;
          }
          canvas.setPointerCapture(e.pointerId);
          if (this.selection.tool === Tool.Move) {
            this.panState = { x: e.clientX, y: e.clientY, sx: this.editView.scrollX, sy: this.editView.scrollY, id: e.pointerId };
            return;
          }
          // One finger: wait to see whether this is a tap, a stroke or the
          // start of a pinch before the tool does anything.
          this.touchPending = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
          return;
        }
        // Only the primary button uses the tool. Middle and right drag the
        // map — a stray right click used to fire the armed tool and charge it.
        const panButton = e.pointerType === 'mouse' && (e.button === 1 || e.button === 2);
        if (e.pointerType === 'mouse' && e.button !== 0 && !panButton) return;
        canvas.setPointerCapture(e.pointerId);
        if (panButton || this.selection.tool === Tool.Move) {
          this.panState = { x: e.clientX, y: e.clientY, sx: this.editView.scrollX, sy: this.editView.scrollY, id: e.pointerId };
          canvas.classList.add('panning');
          return;
        }
        if (this.selection.tool === Tool.SetAltitude) {
          this.beginStroke(e.clientX, e.clientY, e.shiftKey);
          return;
        }
        this.painting = true;
        this.lastPainted = null;
        this.applyAt(e.clientX, e.clientY);
      });

      canvas.addEventListener('pointermove', (e) => {
        this.editView.hover = this.editView.tileAt(e.clientX, e.clientY);
        const box = canvas.getBoundingClientRect();
        this.terraform.pointer = this.editView.hover ? { x: e.clientX - box.left, y: e.clientY - box.top } : null;
        this.updateHoverTip(e);
        if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
          this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (this.touches.size >= 2 && this.pinch && this.panState) {
            const [a, b] = Array.from(this.touches.values());
            const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
            const cx = (a.x + b.x) / 2;
            const cy = (a.y + b.y) / 2;
            const target = this.pinch.px * d / this.pinch.d;
            this.editView.zoomAt(target / this.editView.tilePx, cx, cy);
            const size = this.editView.tilePx;
            this.editView.scrollBy((this.panState.x - cx) / size, (this.panState.y - cy) / size);
            this.panState.x = cx;
            this.panState.y = cy;
            return;
          }
          const pending = this.touchPending;
          if (pending && pending.id === e.pointerId) {
            if (Math.hypot(e.clientX - pending.x, e.clientY - pending.y) < 10) return;
            this.touchPending = null;
            if (App.isSingleShot(this.selection.tool)) {
              // Dragging with a one-shot tool moves the map, as any map app does.
              this.panState = { x: pending.x, y: pending.y, sx: this.editView.scrollX, sy: this.editView.scrollY, id: e.pointerId };
            } else if (this.selection.tool === Tool.SetAltitude) {
              this.beginStroke(pending.x, pending.y, false);
            } else {
              this.painting = true;
              this.lastPainted = null;
              this.applyAt(pending.x, pending.y);
            }
          }
        }
        if (this.panState && this.panState.id === e.pointerId) {
          const size = this.editView.tilePx;
          this.editView.scrollX = this.panState.sx + (this.panState.x - e.clientX) / size;
          this.editView.scrollY = this.panState.sy + (this.panState.y - e.clientY) / size;
          this.editView.scrollBy(0, 0);
          return;
        }
        if (e.pointerType === 'mouse') this.terraform.invert = e.shiftKey;
        if (this.strokeAt) {
          this.strokeAt = { x: e.clientX, y: e.clientY };
          return;
        }
        if (this.painting && !App.isSingleShot(this.selection.tool)) this.applyAt(e.clientX, e.clientY);
      });

      const stop = (e: PointerEvent, tap: boolean): void => {
        const pending = this.touchPending;
        // A single finger lifted without moving is a tap: now the tool acts.
        if (tap && pending && pending.id === e.pointerId && this.touches.size <= 1) {
          this.touchPending = null;
          this.lastPainted = null;
          this.applyAt(pending.x, pending.y);
        }
        if (pending && pending.id === e.pointerId) this.touchPending = null;
        this.touches.delete(e.pointerId);
        if (this.touches.size < 2) this.pinch = null;
        if (this.panState && (this.panState.id === e.pointerId || this.touches.size === 0)) this.panState = null;
        this.painting = false;
        this.lastPainted = null;
        this.endStroke();
        canvas.classList.remove('panning');
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      };
      canvas.addEventListener('pointerup', (e) => stop(e, true));
      canvas.addEventListener('pointercancel', (e) => stop(e, false));
      canvas.addEventListener('pointerleave', () => {
        this.editView.hover = null;
        this.terraform.pointer = null;
        this.hoverTip.classList.remove('show');
      });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (e.altKey && this.selection.tool === Tool.SetAltitude) {
          this.resizeBrush(e.deltaY < 0 ? 1 : -1);
          return;
        }
        this.editView.zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
      }, { passive: false });
      canvas.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 8 : 2;
        const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        const m = moves[e.key];
        if (m) { e.preventDefault(); this.editView.scrollBy(m[0], m[1]); }
      });
    }

    private updateHoverTip(e: PointerEvent): void {
      const tile = this.editView.hover;
      // The brush shows stage and height in its own label.
      if (!tile || e.pointerType !== 'mouse' || this.panState || this.selection.tool === Tool.SetAltitude) {
        this.hoverTip.classList.remove('show');
        return;
      }
      const i = idx(tile.x, tile.y);
      const w = this.world;
      const cost = this.toolCost();
      const parts = [`${BIOME_NAMES[w.biome[i]]} · ${fmt.int(w.temperature[i])} °C`];
      const city = cityLabel(w, i) ?? bandLabel(w, i) ?? wonderLabel(w, i);
      if (city) parts.unshift(city);
      if (cost > 0) parts.push(`${TOOL_NAMES[this.selection.tool]} · ${cost} Ω`);
      const text = parts.join('  ·  ');
      if (this.hoverTip.textContent !== text) this.hoverTip.textContent = text;
      const r = this.stage.getBoundingClientRect();
      this.hoverTip.style.transform = `translate(${Math.round(e.clientX - r.left + 16)}px, ${Math.round(e.clientY - r.top + 18)}px)`;
      this.hoverTip.classList.add('show');
    }

    /* ======================================================== windows === */

    private buildMapWindow(): void {
      const win = this.windows.create({
        id: 'map', title: 'Übersichtskarte', icon: uiIcon('map'),
        x: -12, y: 12, width: 500, height: 436, cls: 'win-map',
      });
      const layout = make('div', 'map-layout');
      const canvas = make('canvas', 'map-canvas');
      canvas.setAttribute('aria-label', 'Übersichtskarte – tippen, um dorthin zu springen');
      layout.appendChild(canvas);

      const modes = make('div', 'map-modes');
      for (const groupName of MAP_GROUPS) {
        const group = make('div', 'map-group');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', groupName);
        group.appendChild(make('span', 'map-group-label', groupName));
        const icons = make('div', 'map-icons');
        MAP_MODES.forEach((def, m) => {
          if (def.group !== groupName) return;
          const mode = m as MapMode;
          const b = button({ label: def.name, icon: uiIcon(def.icon), cls: 'icon-btn map-mode', showLabel: false, title: def.name, onClick: () => this.setMapMode(mode) });
          icons.appendChild(b);
          this.mapButtons.set(mode, b);
        });
        group.appendChild(icons);
        modes.appendChild(group);
      }
      const footer = make('div', 'map-footer');
      this.mapLegendEl = make('div', 'map-legend');
      const buttons = make('div', 'map-buttons');
      const globeBtn = button({
        label: 'Globus', icon: uiIcon('globe'), cls: 'btn btn-small btn-ghost',
        onClick: () => { this.mapView.globe = !this.mapView.globe; setPressed(globeBtn, this.mapView.globe); },
      });
      const infoBtn = button({
        label: 'Werte', icon: uiIcon('info'), cls: 'btn btn-small btn-ghost',
        onClick: () => { this.mapShowsInfo = !this.mapShowsInfo; setPressed(infoBtn, this.mapShowsInfo); this.refreshMapLegend(); },
      });
      setPressed(globeBtn, false);
      setPressed(infoBtn, false);
      buttons.append(globeBtn, infoBtn);
      footer.append(this.mapLegendEl, buttons);
      layout.append(modes, footer);
      win.body.appendChild(layout);

      this.mapView = new MapView(canvas);
      canvas.addEventListener('pointerdown', (e) => {
        const tile = this.mapView.tileAt(e.clientX, e.clientY);
        if (tile) this.editView.centerOn(tile.x, tile.y);
      });
      this.setMapMode(MapMode.Terrain);
    }

    private setMapMode(mode: MapMode): void {
      this.mapView.mode = mode;
      for (const [m, b] of this.mapButtons) setPressed(b, m === mode);
      this.windows.get('map')?.setTitle(`Übersichtskarte · ${MAP_MODES[mode].name}`);
      this.refreshMapLegend();
    }

    private refreshMapLegend(): void {
      const mode = this.mapView.mode;
      renderMapLegend(this.mapLegendEl, this.world, mode, this.mapShowsInfo, this.mapView.hidden[mode], (bit) => {
        this.mapView.hidden[mode] ^= 1 << bit;
        this.refreshMapLegend();
      });
    }

    private buildInfoWindows(): void {
      // Gaia
      const gaia = this.windows.create({ id: 'gaia', title: 'Gaia', icon: uiIcon('gaia'), cls: 'win-gaia', x: -12, y: 456, width: 300, height: 396 });
      const gaiaWrap = make('div', 'gaia-layout');
      gaia.body.appendChild(gaiaWrap);
      this.gaiaPanel = new GaiaPanel(gaiaWrap);

      // History: 4 px clear of the tool card (12 px in, 64 px rail, 8 px gap,
      // 340 px card) and of the overview map (500 px wide, 12 px from the
      // right), down to just above the bottom.
      const hist = this.windows.create({
        id: 'history', title: 'Verlauf', icon: uiIcon('history'), resetOnOpen: true,
        x: 428, y: 12, width: -(428 + 516), height: -(12 + 27),
      });
      const histWrap = make('div', 'hist-layout');
      hist.body.appendChild(histWrap);
      this.historyPanel = new HistoryPanel(histWrap, this.history);

      // Report
      const report = this.windows.create({ id: 'report', title: 'Bericht', icon: uiIcon('report'), x: 0.24, y: 0.06, width: 580, height: 680 });
      const reportBody = make('div', 'report-body');
      report.body.appendChild(reportBody);
      this.reportPanel = new ReportPanel(reportBody, () => this.nextStep(), this.history);
      this.reportPanel.onOpenNode = (id) => this.openTree(id);

      // Glossary
      const gloss = this.windows.create({ id: 'glossary', title: 'Glossar', icon: uiIcon('glossary'), x: 0.3, y: 0.1, width: 480, height: 520 });
      const glossBody = make('div', 'gloss-body');
      gloss.body.appendChild(glossBody);
      buildGlossary(glossBody);

      // Examine
      const exam = this.windows.create({ id: 'examine', title: 'Untersuchen', icon: uiIcon('examine'), x: 84, y: 12, width: 398, height: 540, cls: 'win-examine', docked: true, onShow: () => revealExaminedTile() });
      const revealExaminedTile = installExamineDock(exam, this.editView, this.canvas, () => this.examineTile);
      const examBody = make('div', 'examine-body');
      exam.body.appendChild(examBody);
      this.examinePanel = new ExaminePanel(examBody);
      this.examinePanel.onShowInTree = (id) => this.openTree(id);
      this.examinePanel.onShowSpecies = (c, stage) => { this.speciesInfo.show(c, stage); this.windows.show('species'); };
      this.examinePanel.creatureOn = (world, i) => this.editView.creatureOn(world, i);
      this.examinePanel.migrationOn = (world, i) => this.editView.migrationOn(world, i);

      // Chronicle
      const chron = this.windows.create({ id: 'chronicle', title: 'Chronik', icon: uiIcon('chronicle'), x: 0.34, y: 0.08, width: 460, height: 560 });
      const chronBody = make('div', 'chronicle-body');
      chron.body.appendChild(chronBody);
      this.chroniclePanel = new ChroniclePanel(chronBody);
      this.chroniclePanel.onOpenNode = (id) => this.openTree(id);
      this.chroniclePanel.onOpenSpaceport = () => this.openSpaceport();

      // Space project
      const space = this.windows.create({
        id: 'spaceport', title: 'Raumfahrt', icon: uiIcon('rocket'), x: -16, y: 0.06, width: 400, height: 760,
        onShow: () => this.spaceportPanel.update(this.world),
      });
      this.spaceportPanel = new SpaceportPanel(space.body, {
        launch: () => this.launchRocket(),
        locate: () => this.locateSpaceport(),
        reduceEffects: () => this.settings.reduceEffects,
      });

      // Species lexicon and the info box of one sub-species
      const lex = this.windows.create({ id: 'lexicon', title: 'Arten-Lexikon', icon: uiIcon('layer-life'), x: 0.06, y: 0.06, width: 560, height: 640, onShow: () => this.lexicon.update() });
      this.lexicon = new LexiconPanel(lex.body, { world: () => this.world, dex: () => this.fauna, open: (c, s) => { this.speciesInfo.show(c, s); this.windows.show('species'); } });
      const sp = this.windows.create({ id: 'species', title: 'Art', icon: uiIcon('tool-life'), x: -16, y: 0.06, width: 540, height: 680 });
      this.speciesInfo = new SpeciesInfoPanel(sp.body, {
        world: () => this.world, params: () => this.params, dex: () => this.fauna,
        jump: (c, s) => this.jumpToSpecies(c, s), openTree: (id) => this.openTree(id),
      });
    }

    private buildModelWindows(): void {
      const add = (id: string, title: string, kind: ModelKind, height: number, parts: (onChange: (group: string) => () => void) => SliderPanel[]): void => {
        const win = this.windows.create({ id, title, icon: uiIcon('menu-models'), x: 0.2, y: 0.06, width: 460, height, cls: `win-model model-${kind}` });
        const hero = new ModelHero(kind, this.params, () => this.world);
        this.modelHeroes.set(id, hero);
        win.body.append(hero.el, make('p', 'model-intro', 'Die Marke auf jedem Regler zeigt den kalibrierten Ausgangswert. Änderungen wirken sofort – Doppelklick setzt einen Regler zurück.'));
        // Only the group moved, as a copy: the command keeps these values while newer states overwrite the panel's.
        const changed = (group: string) => (): void => {
          hero.render();
          this.sim.predict({ type: 'params', groups: { [group]: { ...this.params.groups()[group] } } });
        };
        for (const p of parts(changed)) {
          win.body.appendChild(p.el);
          this.sliderPanels.push(p);
        }
        hero.render();
      };
      add('model-geo', 'Modell: Geosphäre', 'geo', 700, (onChange) => [buildSliderPanel(this.params.geo, GEO_SLIDERS, { onChange: onChange('geo') })]);
      add('model-atmo', 'Modell: Atmosphäre', 'atmo', 700, (onChange) => [buildSliderPanel(this.params.atmo, ATMO_SLIDERS, { onChange: onChange('atmo') })]);
      add('model-bio', 'Modell: Biosphäre', 'bio', 640, (onChange) => [buildSliderPanel(this.params.bio, BIO_SLIDERS, { onChange: onChange('bio') })]);
      add('model-civ', 'Modell: Zivilisation', 'civ', 760, (onChange) => [
        buildSliderPanel(this.params.civEnergy, CIV_ENERGY_SLIDERS, { heading: 'Energiequellen', share: true, onChange: onChange('civEnergy') }),
        buildSliderPanel(this.params.civAlloc, CIV_ALLOC_SLIDERS, { heading: 'Energieverwendung', onChange: onChange('civAlloc') }),
      ]);
    }

    private buildGraphWindows(): void {
      const specs: [string, string, GraphKind, string, number, number][] = [
        ['graph-air', 'Luftzusammensetzung', 'air', 'overlay-wind', 540, 560],
        ['graph-biomes', 'Lebensraumanteile', 'biomes', 'layer-biomes', 520, 380],
        ['graph-life', 'Lebensformen', 'life', 'layer-life', 460, 600],
        ['graph-tech', 'Technologie', 'tech', 'layer-cities', 560, 360],
      ];
      specs.forEach(([id, title, kind, icon, width, height], k) => {
        const win = this.windows.create({ id, title, icon: uiIcon(icon), x: 0.22 + k * 0.03, y: 0.1 + k * 0.03, width, height });
        const body = make('div', 'graph-body');
        win.body.appendChild(body);
        this.graphs.set(kind, new GraphPanel(body, kind));
      });
    }

    private buildTreeWindow(): void {
      const win = this.windows.create({
        id: 'evolution', title: 'Evolutionsbaum', icon: uiIcon('evolution'),
        x: 0.03, y: 0.03, width: 0.94, height: 0.9, cls: 'win-tree',
        onShow: () => { this.evolution.refresh(this.world, this.params, true); this.tree.update(true); this.tree.onShown(); },
      });
      this.tree = new EvolutionTreeView({
        develop: (id, done) => this.developNode(id, done),
        showOnMap: (id) => this.showNodeOnMap(id),
        placeTool: (id) => this.armToolFor(id),
        world: () => this.world,
        evo: () => this.evolution,
        dex: () => this.fauna,
        openSpecies: (c, s) => { this.speciesInfo.show(c, s); this.windows.show('species'); },
      });
      win.body.appendChild(this.tree.root);
    }

    /* ============================================================ HUD === */

    private buildHud(): void {
      const top = el<HTMLElement>('topbar');
      const brand = make('div', 'brand');
      brand.append(img(uiIcon('new-planet'), 'brand-icon'), make('span', 'brand-name', 'SimEarth'), make('span', 'brand-ver', '2.0'));
      top.prepend(brand);

      const hud = el<HTMLElement>('hud');
      const chip = (icon: string, title: string, cls = ''): { el: HTMLElement; value: HTMLElement } => {
        const c = make('div', `hud-chip ${cls}`);
        // Focusable, so the explanation is reachable by keyboard and by tap,
        // not only by hovering.
        c.dataset.tip = title;
        c.tabIndex = 0;
        c.setAttribute('role', 'group');
        c.setAttribute('aria-label', title);
        const v = make('span', 'hud-value');
        c.append(img(icon, 'ico'), v);
        return { el: c, value: v };
      };
      const omega = chip(resIcon('energy'), 'Energie (Ω) für Werkzeuge – füllt sich, während die Zeit läuft', 'hud-omega');
      const omegaBar = make('span', 'hud-bar');
      omegaBar.appendChild(make('span'));
      const devTag = omega.el.appendChild(make('span', 'hud-tag', 'DEV')); // DEVMODE
      omega.el.appendChild(omegaBar);
      const ep = chip(resIcon('ep'), 'Evolutionspunkte – entstehen aus der Vielfalt lebender Gruppen', 'hud-ep');
      const epRate = make('span', 'hud-sub');
      ep.el.appendChild(epRate);
      const o2 = chip(resIcon('oxygen'), 'O₂ Luft: Sauerstoff in der Atmosphäre, in Prozent', 'hud-minor hud-o2');
      o2.el.appendChild(make('span', 'hud-tag', 'Luft'));
      const oceanO2 = chip(uiIcon('layer-oceans'), 'O₂ Meer: gelöster Sauerstoff, in Prozent der heutigen Sättigung. Er steigt erst, wenn das gelöste Eisen im Meer verbraucht ist.', 'hud-minor hud-o2');
      oceanO2.el.appendChild(make('span', 'hud-tag', 'Meer'));
      const co2 = chip(resIcon('co2'), 'Kohlendioxid in der Atmosphäre', 'hud-minor hud-co2');
      const temp = chip(resIcon('temperature'), 'Mittlere Temperatur des Planeten', 'hud-minor hud-temp');
      // The gas chips open the air composition window.
      for (const c of [o2, oceanO2, co2]) {
        c.el.setAttribute('role', 'button');
        c.el.classList.add('hud-link');
        c.el.addEventListener('click', () => this.windows.toggle('graph-air'));
        c.el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.windows.toggle('graph-air'); }
        });
      }

      const time = make('div', 'hud-time');
      const scale = make('span', 'hud-scale');
      const date = make('span', 'hud-date');
      time.append(scale, date);
      time.title = 'Erdzeit und Zeitalter (Optionen: Datum vor heute oder Planetenalter)';

      const speed = make('div', 'speed seg');
      speed.setAttribute('role', 'group');
      speed.setAttribute('aria-label', 'Tempo');
      const play = button({
        label: 'Pause', icon: uiIcon('pause'), cls: 'icon-btn speed-play', showLabel: false,
        title: 'Pause / Weiter (Leertaste)', onClick: () => this.togglePause(),
      });
      speed.appendChild(play);
      for (let s = 1; s < SPEED_NAMES.length; s++) {
        const b = button({ label: SPEED_NAMES[s], cls: 'seg-btn speed-btn', title: `${SPEED_NAMES[s]} (${s})`, onClick: () => this.setSpeed(s) });
        b.textContent = '';
        const dots = make('span', 'speed-dots');
        for (let k = 0; k < s; k++) dots.appendChild(make('i'));
        b.append(dots, make('span', 'sr-only', SPEED_NAMES[s]));
        speed.appendChild(b);
        this.speedButtons[s] = b;
      }

      const cycle = button({
        label: 'Tempo wechseln', cls: 'speed-cycle', showLabel: false,
        onClick: () => this.setSpeed(this.speed >= SPEED_NAMES.length - 1 || this.speed === 0 ? 1 : this.speed + 1),
      });
      cycle.prepend(make('span', 'speed-dots'));
      speed.appendChild(cycle);
      this.speedCycle = cycle;

      const evoBtn = button({ label: 'Evolution', icon: uiIcon('evolution'), cls: 'btn btn-primary evo-btn', title: 'Evolutionsbaum öffnen (E)', onClick: () => this.windows.toggle('evolution') });
      const evoBadge = make('span', 'badge');
      evoBtn.appendChild(evoBadge);

      this.hudInfo = new HudInfo();
      this.hudInfo.attach(omega.el, (pop) => fillOmegaInfo(pop, this.world));
      this.hudInfo.attach(ep.el, (pop) => fillEpInfo(pop, this.world, this.evolution, this.params));

      hud.append(omega.el, ep.el, o2.el, oceanO2.el, co2.el, temp.el, time, speed, evoBtn);
      this.hud = {
        omega: omega.value, omegaBar: omegaBar.firstChild as HTMLElement, ep: ep.value, epRate,
        o2: o2.value, co2: co2.value, temp: temp.value, date, scale, play, evoBadge, evoBtn,
        oceanO2: oceanO2.value,
        devTag, // DEVMODE
      };
      this.syncSpeedButtons();
    }

    private speedCycle: HTMLButtonElement | null = null;

    private syncSpeedButtons(): void {
      this.speedButtons.forEach((b, s) => { if (b) setPressed(b, this.speed === s); });
      if (this.speedCycle) {
        const dots = this.speedCycle.querySelector('.speed-dots');
        const shown = this.speed === 0 ? this.lastRunningSpeed : this.speed;
        if (dots) {
          dots.innerHTML = '';
          for (let k = 0; k < shown; k++) dots.appendChild(make('i'));
        }
        const name = `Tempo: ${SPEED_NAMES[shown]}${this.speed === 0 ? ' (pausiert)' : ''} – tippen zum Wechseln`;
        this.speedCycle.setAttribute('aria-label', name);
        this.speedCycle.title = name;
      }
      const paused = this.speed === 0;
      const playImg = this.hud.play.querySelector('img');
      if (playImg) playImg.src = uiIcon(paused ? 'play' : 'pause');
      const label = this.hud.play.querySelector('.sr-only');
      if (label) label.textContent = paused ? 'Weiter' : 'Pause';
      this.hud.play.classList.toggle('paused', paused);
    }

    /* ========================================================== menus === */

    private buildMenus(): void {
      const winItem = (label: string, id: string, icon: string, hint?: string): MenuItem => ({
        label, icon: uiIcon(icon), hint,
        action: () => this.windows.toggle(id),
        checked: () => this.windows.isVisible(id),
      });
      const modelItem = (label: string, id: string): MenuItem => ({
        label, icon: uiIcon('menu-models'), hint: `${MODEL_PANEL_COST} Ω einmalig`,
        action: () => {
          if (this.windows.isVisible(id)) { this.windows.hide(id); return; }
          // Paid once per planet (simcore.ts): closing it by accident must not cost again.
          const cmd = { type: 'model', id } as const;
          const why = this.sim.view.check(cmd);
          if (why) { this.notifier.message(why, 'warn'); return; }
          this.sim.run(cmd, (r) => {
            if (r.ok) return;
            this.windows.hide(id);
            if (r.reason) this.notifier.message(r.reason, 'warn');
          });
          this.sliderPanels.forEach((p) => p.sync());
          this.windows.show(id);
        },
        checked: () => this.windows.isVisible(id),
      });

      // Three menus with text; speed lives in the status bar, map layers at the map.
      const defs: MenuDef[] = [
        {
          title: 'Spiel', icon: uiIcon('menu-file'),
          items: [
            { label: 'Neuer Planet …', icon: uiIcon('new-planet'), action: () => void this.confirmNewPlanet() },
            { label: 'Spielstände …', icon: uiIcon('slot'), hint: 'O', action: () => void this.openSaves() },
            { label: 'Schnell speichern', icon: uiIcon('save'), hint: 'Strg+S', action: () => void this.saveTo(this.settings.lastSlot) },
            { label: 'Schnappschuss der Karte', icon: uiIcon('snapshot'), action: () => this.snapshot() },
            { separator: true, label: '' },
            { label: 'Zum letzten Ereignis springen', icon: uiIcon('target'), action: () => this.gotoEvent() },
            { separator: true, label: '' },
            { label: 'Einstellungen …', icon: uiIcon('menu-options'), action: () => void openSettings(this.settingDefs()) },
          ],
        },
        {
          title: 'Fenster', icon: uiIcon('menu-windows'),
          items: [
            winItem('Evolutionsbaum', 'evolution', 'evolution', 'E'),
            winItem('Chronik', 'chronicle', 'chronicle', 'C'),
            winItem('Raumfahrt', 'spaceport', 'rocket'),
            winItem('Arten-Lexikon', 'lexicon', 'layer-life', 'X'),
            winItem('Übersichtskarte', 'map', 'map', 'M'),
            winItem('Gaia', 'gaia', 'gaia'),
            winItem('Verlauf', 'history', 'history'),
            winItem('Bericht', 'report', 'report', 'B'),
            winItem('Glossar', 'glossary', 'glossary'),
            { separator: true, label: '' },
            { label: 'Fenster zurücksetzen', icon: uiIcon('zoom-fit'), action: () => this.windows.resetLayout() },
          ],
        },
        {
          title: 'Planet', icon: uiIcon('menu-models'),
          items: [
            modelItem('Modell Geosphäre', 'model-geo'),
            modelItem('Modell Atmosphäre', 'model-atmo'),
            modelItem('Modell Biosphäre', 'model-bio'),
            modelItem('Modell Zivilisation', 'model-civ'),
            { separator: true, label: '' },
            winItem('Luftzusammensetzung', 'graph-air', 'overlay-wind'),
            winItem('Lebensraumanteile', 'graph-biomes', 'layer-biomes'),
            winItem('Lebensformen', 'graph-life', 'layer-life'),
            winItem('Technologie', 'graph-tech', 'layer-cities'),
          ],
        },
      ];
      this.menuBar = new MenuBar(el('menubar'), defs);
    }

    /** The lasting preferences, for the "Einstellungen" dialog (menu "Spiel" and the title screen). */
    private settingDefs(): SettingDef[] {
      return [
        {
          kind: 'choice', label: 'Datum',
          options: [
            { label: 'Datum als „vor … Jahren“ mit Erdzeitalter', icon: uiIcon('history'), on: () => this.settings.relativeDate, choose: () => { this.settings.relativeDate = true; this.saveSettings(); } },
            { label: 'Datum als Planetenalter', icon: uiIcon('globe'), on: () => !this.settings.relativeDate, choose: () => { this.settings.relativeDate = false; this.saveSettings(); } },
          ],
        },
        {
          kind: 'toggle', label: 'Entwicklungen und Meilensteine pausieren', icon: uiIcon('bell'),
          on: () => this.settings.pauseOnMilestone,
          toggle: () => { this.settings.pauseOnMilestone = !this.settings.pauseOnMilestone; this.notifier.pauseOnMilestone = this.settings.pauseOnMilestone; this.saveSettings(); },
        },
        {
          kind: 'toggle', group: true, label: 'Effekte reduzieren (kein Wackeln, keine Blitze)', icon: uiIcon('layer-events'),
          on: () => this.settings.reduceEffects,
          toggle: () => { this.settings.reduceEffects = !this.settings.reduceEffects; this.editView.reduceEffects = this.settings.reduceEffects; this.saveSettings(); },
        },
        {
          kind: 'toggle', label: INTRO_DEV ? 'Studio- und Logo-Intro bei jedem Start zeigen (Dev)' : 'Ganzes Intro beim nächsten „Spiel starten“ zeigen', icon: uiIcon('play'),
          on: () => this.fullIntroWanted,
          toggle: () => {
            if (INTRO_DEV) this.settings.introDevOff = !this.settings.introDevOff;
            else this.settings.introSeen = !this.settings.introSeen;
            this.saveSettings();
          },
        },
        {
          kind: 'toggle', group: true, label: 'Meeresrauschen', icon: uiIcon('menu-sound-on'), iconOff: uiIcon('menu-sound'),
          on: () => this.settings.ambient,
          toggle: () => { this.settings.ambient = !this.settings.ambient; this.saveSettings(); },
          volume: { get: () => this.settings.ambientVolume, set: (v) => { this.settings.ambientVolume = v; this.saveSettings(); } },
        },
        {
          kind: 'toggle', label: 'Effekt-Klänge', icon: uiIcon('menu-sound-on'), iconOff: uiIcon('menu-sound'),
          on: () => this.settings.sound,
          toggle: () => { this.settings.sound = !this.settings.sound; this.saveSettings(); },
          volume: { get: () => this.settings.soundVolume, set: (v) => { this.settings.soundVolume = v; this.saveSettings(); } },
        },
        {
          kind: 'toggle', label: 'Musik', icon: uiIcon('menu-sound-on'), iconOff: uiIcon('menu-sound'),
          on: () => this.settings.music,
          toggle: () => { this.settings.music = !this.settings.music; this.music.setEnabled(this.settings.music); this.saveSettings(); },
          volume: { get: () => this.settings.musicVolume, set: (v) => { this.settings.musicVolume = v; this.music.setVolume(v); this.saveSettings(); } },
        },
      ];
    }

    private syncWindowButtons(): void {
      setPressed(this.hud.evoBtn, this.windows.isVisible('evolution'));
      setPressed(this.mapBtn, this.windows.isVisible('map'));
    }

    /* ======================================================= keyboard === */

    private wireKeyboard(): void {
      // Shift flips the brush preview at once, not only on the next pointer move.
      const shift = (e: KeyboardEvent): void => { if (e.key === 'Shift') this.terraform.invert = e.type === 'keydown'; };
      document.addEventListener('keydown', shift);
      document.addEventListener('keyup', shift);
      document.addEventListener('keyup', (e) => { this.panKeys.delete(e.code); });
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'F3') return;
        e.preventDefault();
        perfHud.toggle();
      });
      // A key released outside the window never sends its keyup.
      window.addEventListener('blur', () => this.panKeys.clear());
      document.addEventListener('keydown', (e) => {
        if (Modal.open || e.defaultPrevented || this.title || this.launchFilm) return;
        // Quick save works wherever the focus is — a slider included.
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          void this.saveTo(this.settings.lastSlot);
          return;
        }
        const target = e.target instanceof HTMLElement ? e.target : document.body;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        // Before the modifier check: on a German keyboard [ and ] need AltGr.
        if ((e.key === '[' || e.key === ']') && this.selection.tool === Tool.SetAltitude) {
          this.resizeBrush(e.key === ']' ? 1 : -1);
          return;
        }
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        // WASD by key position, so it is the same block on any layout; works with a tool button focused too.
        if (PAN_KEYS[e.code]) {
          this.panKeys.add(e.code);
          e.preventDefault();
          return;
        }
        // Let buttons and the tree keep their own keys.
        const inControl = !!target.closest('button, .tree-viewport, [role="menu"], [role="menubar"]');
        switch (e.key) {
          case 'Escape': {
            // An open menu takes the Escape for itself: one key, one thing closed.
            if (this.menuBar.isOpen) { this.menuBar.closeAll(); e.preventDefault(); return; }
            if (!this.layerPop.hidden) { this.setLayersOpen(false); e.preventDefault(); return; }
            if (this.hudInfo.isOpen) { this.hudInfo.close(); e.preventDefault(); return; }
            const top = this.windows.topmost();
            if (top) { top.hide(); e.preventDefault(); }
            return;
          }
          case ' ':
            if (inControl) return;
            e.preventDefault();
            this.togglePause();
            return;
          case '1': case '2': case '3': case '4':
            this.setSpeed(Number(e.key));
            return;
          case 'e': case 'E': this.windows.toggle('evolution'); return;
          case 'c': case 'C': this.windows.toggle('chronicle'); return;
          case 'x': case 'X': this.windows.toggle('lexicon'); return;
          case 'm': case 'M': this.windows.toggle('map'); return;
          case 'b': case 'B': this.windows.toggle('report'); return;
          case 'o': case 'O': void this.openSaves(); return;
          case '+': this.zoomMap(1.25); return;
          case '-': this.zoomMap(0.8); return;
          case 'u': case 'U': this.selectTool(Tool.Examine); return;
          case 'v': case 'V': this.selectTool(Tool.Move); return;
          case 'h': case 'H': this.selectTool(Tool.SetAltitude); return;
          case 'p': case 'P': this.selectTool(Tool.PlantBiome); return;
          case 'l': case 'L': this.selectTool(Tool.PlaceLife); return;
          case 'k': case 'K': this.selectTool(Tool.TriggerEvent); return;
        }
      });
    }

    /* ========================================================== tools === */

    /** Arm a tool; `reveal` reopens its card when the player closed it. */
    private selectTool(tool: Tool, reveal = true): void {
      this.endStroke();
      if (tool !== Tool.Examine) this.windows.hide('examine');
      this.selection.tool = tool;
      this.editView.decor = tool === Tool.SetAltitude
        ? (ctx, cam, now) => this.terraform.draw(ctx, cam, this.world, this.terraform.active ? this.terraform.sign : this.brushSign(), now)
        : null;
      for (const [t, b] of this.toolButtons) setPressed(b, t === tool);
      this.canvas.dataset.tool = String(tool);
      this.buildToolOptions();
      if (reveal && this.settings.dockCollapsed) this.setDockCollapsed(false);
    }

    /** Cost of one application of the armed tool. */
    private toolCost(): number {
      const s = this.selection;
      switch (s.tool) {
        case Tool.Examine: return EXAMINE_COST;
        case Tool.SetAltitude: return 0; // paid by the elevation moved, see strokeFrame
        case Tool.PlantBiome: return BIOME_COST;
        case Tool.TriggerEvent: return EVENT_COST;
        case Tool.PlaceLife:
          return s.lifeMode === 'life' ? LIFE[s.life].cost : s.lifeMode === 'city' ? TECH_COST[s.tech] : TERRAFORMER_COST[s.terraformer];
        default: return 0;
      }
    }

    private brushRadius(): number {
      const s = this.selection;
      switch (s.tool) {
        case Tool.SetAltitude: return Math.round(this.terraform.radius);
        case Tool.PlantBiome: return 2;
        case Tool.TriggerEvent: return HAZARD_RULES[s.event] ? 0 : EVENT_RADIUS[s.event]; // one tile for disasters with a rule (docs/ereignisse-spec.md)
        case Tool.PlaceLife: return s.lifeMode === 'terraformer' && s.terraformer === Terraformer.VaporGenerator ? 2 : 0;
        default: return 0;
      }
    }

    /** The palette under the tool rail for tools with choices. */
    private buildToolOptions(): void {
      const s = this.selection;
      const host = this.toolOptions;
      // A pick rebuilds the card; keep keyboard focus inside it.
      const hadFocus = host.contains(document.activeElement);
      host.innerHTML = '';
      this.toolRevision = this.evolution.revision;
      this.toolTitle.textContent = TOOL_NAMES[s.tool];
      this.toolKey.textContent = TOOL_KEYS[s.tool];
      this.toolHint.textContent = TOOL_HINTS[s.tool];
      this.dock.dataset.tool = String(s.tool);
      this.editView.brushRadius = this.brushRadius();
      this.editView.brushColor = s.tool === Tool.TriggerEvent ? 'rgba(255,122,107,0.95)' : 'rgba(246,241,223,0.9)';

      const list = make('div', 'opt-list');
      list.setAttribute('role', 'listbox');
      list.setAttribute('aria-label', TOOL_NAMES[s.tool]);
      type Option = {
        label: string; icon: string; cost?: number; active: boolean; locked?: string; sub?: string;
        onPick: () => void;
      };
      const costTag = (n: number): HTMLElement => {
        const cost = make('span', 'opt-cost');
        cost.append(make('span', undefined, fmt.int(n)), img(resIcon('energy'), 'ico'));
        return cost;
      };
      // Locked choices fold into one row under the tiles; the chosen one gets the details.
      const locked: Option[] = [];
      let picked: Option | null = null;
      let longestWord = 0;
      const option = (o: Option): void => {
        if (o.locked) { locked.push(o); return; }
        if (o.active) picked = o;
        longestWord = Math.max(longestWord, ...o.label.split(/[\s-]/).map((w) => w.length));
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `opt-tile${o.active ? ' on' : ''}`;
        b.setAttribute('role', 'option');
        b.setAttribute('aria-selected', o.active ? 'true' : 'false');
        b.title = o.sub ? `${o.label} – ${o.sub}` : o.label;
        b.append(img(o.icon, 'opt-icon'), make('span', 'opt-label', o.label));
        if (o.cost !== undefined && o.cost > 0) b.appendChild(costTag(o.cost));
        b.addEventListener('click', () => { o.onPick(); this.buildToolOptions(); });
        list.appendChild(b);
      };
      const tabs = (items: [LifeMode, string][]): void => {
        const seg = make('div', 'seg opt-tabs');
        seg.setAttribute('role', 'tablist');
        for (const [mode, label] of items) {
          const t = button({ label, cls: 'seg-btn', onClick: () => { s.lifeMode = mode; this.buildToolOptions(); } });
          t.setAttribute('role', 'tab');
          t.setAttribute('aria-selected', s.lifeMode === mode ? 'true' : 'false');
          setPressed(t, s.lifeMode === mode);
          seg.appendChild(t);
        }
        host.appendChild(seg);
      };

      switch (s.tool) {
        case Tool.SetAltitude:
          option({ label: 'Anheben', icon: uiIcon('tool-altitude'), active: s.altitudeRaise, sub: 'Land steigt aus dem Meer, hohe Gipfel tragen Schnee', onPick: () => { s.altitudeRaise = true; } });
          option({ label: 'Absenken', icon: uiIcon('chevron-down'), active: !s.altitudeRaise, sub: 'Täler und Buchten, tief unten quillt Grundwasser', onPick: () => { s.altitudeRaise = false; } });
          break;

        case Tool.PlantBiome: {
          const selected = nodeForFlora(s.flora);
          if (!selected || !(isDevMode() || this.world.evo.isDeveloped(selected.id))) { // DEVMODE
            const first = EVO_NODES.find((n) => n.flora !== undefined && this.world.evo.isDeveloped(n.id));
            if (first && first.flora !== undefined) s.flora = first.flora;
          }
          for (const n of EVO_NODES) {
            if (n.flora === undefined) continue;
            const g = n.flora;
            const dev = isDevMode() || this.world.evo.isDeveloped(n.id); // DEVMODE
            option({
              label: n.name, icon: evoIcon(n.id), cost: dev ? BIOME_COST : undefined,
              active: dev && !s.clearing && s.flora === g,
              sub: n.habitat.text, locked: dev ? undefined : 'Erst im Evolutionsbaum entwickeln',
              onPick: () => { if (!dev) { this.openTree(n.id); return; } s.flora = g; s.clearing = false; },
            });
          }
          option({ label: 'Roden', icon: uiIcon('trash'), cost: BIOME_COST, active: s.clearing, sub: 'Entfernt alle Pflanzen im Feld', onPick: () => { s.clearing = true; } });
          break;
        }

        case Tool.PlaceLife:
          tabs([['life', 'Leben'], ['city', 'Städte'], ['terraformer', 'Terraformer']]);
          if (s.lifeMode === 'life') {
            for (const n of EVO_NODES) {
              if (n.life === undefined) continue;
              const c = n.life;
              const bar = dinoEraLifeBar(this.world, c);
              const dev = !bar && (isDevMode() || this.world.evo.isDeveloped(n.id)); // DEVMODE
              option({
                label: n.name, icon: evoIcon(n.id), cost: dev ? LIFE[c].cost : undefined, active: s.life === c,
                sub: n.habitat.text, locked: dev ? undefined : bar || 'Erst im Evolutionsbaum entwickeln',
                onPick: () => { if (!dev) { this.openTree(n.id); return; } s.life = c; },
              });
            }
          } else if (s.lifeMode === 'city') {
            for (let t = 1; t < TECH_COUNT; t++) {
              const tech = t as Tech;
              option({ label: TECH_NAMES[t], icon: uiIcon('city'), cost: TECH_COST[t], active: s.tech === tech, onPick: () => { s.tech = tech; } });
            }
          } else {
            TERRAFORMER_NAMES.forEach((name, i) => {
              const tf = i as Terraformer;
              option({ label: name, icon: uiIcon(TERRAFORMER_ICONS[i]), cost: TERRAFORMER_COST[i], active: s.terraformer === tf, sub: TERRAFORMER_HINTS[i], onPick: () => { s.terraformer = tf; } });
            });
          }
          break;

        case Tool.TriggerEvent:
          EVENT_NAMES.forEach((name, i) => {
            const kind = i as EventKind;
            option({ label: name, icon: eventIcon(EVENT_ICONS[i]), cost: EVENT_COST, active: s.event === kind, sub: EVENT_HINTS[i], onPick: () => { s.event = kind; } });
          });
          break;

        default: {
          const cost = s.tool === Tool.Examine ? `Kosten: ${EXAMINE_COST} Ω je Feld.` : 'Kostenlos.';
          host.appendChild(make('p', 'opt-note', cost));
        }
      }
      // Words like "Informationszeitalter" don't fit three tiles a row in the pixel font.
      list.classList.toggle('opt-list-wide', longestWord >= 17);
      if (list.childElementCount > 0) host.appendChild(list);
      if (locked.length > 0) {
        const first = locked[0];
        const more = button({
          label: `+${locked.length} noch nicht entwickelt`, icon: uiIcon('lock'), cls: 'opt-more',
          title: `Im Evolutionsbaum: ${locked.map((o) => o.label).join(', ')}`,
          onClick: () => first.onPick(),
        });
        more.appendChild(make('span', 'opt-more-go', 'Baum ›'));
        host.appendChild(more);
      }
      const chosen = picked as Option | null;
      if (chosen && (chosen.sub || chosen.cost)) {
        const detail = make('div', 'opt-detail');
        detail.appendChild(make('span', 'opt-detail-title', chosen.label));
        if (chosen.cost) detail.appendChild(costTag(chosen.cost));
        if (chosen.sub) detail.appendChild(make('span', 'opt-sub', chosen.sub));
        host.appendChild(detail);
      }
      if (hadFocus) (host.querySelector<HTMLElement>('.opt-tile.on') ?? host.querySelector<HTMLElement>('button'))?.focus();
      if (s.tool === Tool.SetAltitude) {
        host.append(this.terraform.strengthControl(), this.terraform.sizeControl(), make('p', 'opt-note', TERRAFORM_NOTE));
      }
      this.editView.brushRadius = this.brushRadius();
    }

    /** Arm the matching placement tool for a developed tree node. */
    private armToolFor(id: string): void {
      const n = evoNode(id);
      if (n.life !== undefined) {
        this.selection.life = n.life;
        this.selection.lifeMode = 'life';
        this.selectTool(Tool.PlaceLife);
      } else if (n.flora !== undefined) {
        this.selection.flora = n.flora;
        this.selection.clearing = false;
        this.selectTool(Tool.PlantBiome);
      }
      this.windows.hide('evolution');
      this.notifier.message(`${TOOL_NAMES[this.selection.tool]}: ${n.name} – tippe auf einen geeigneten Ort.`);
    }

    /**
     * A player action: checked against what the screen shows, then applied by
     * the simulation, which checks it again against its state; the result is
     * told when the state that contains it is on screen.
     */
    private act(cmd: SimCommand, then?: (r: SimResult) => void): void {
      const why = this.sim.view.check(cmd);
      if (why) {
        this.notifier.message(why, 'warn');
        return;
      }
      this.sim.run(cmd, (r) => {
        if (!r.ok) {
          if (r.reason) this.notifier.message(r.reason, 'warn');
          return;
        }
        this.afterEdit();
        if (r.text) this.notifier.message(r.text, r.tone ?? 'ok');
        then?.(r);
      });
    }

    private static isSingleShot(tool: Tool): boolean {
      return tool === Tool.Examine || tool === Tool.PlaceLife || tool === Tool.TriggerEvent;
    }

    /* ---- terraforming brush ---- */

    private brushSign(): 1 | -1 {
      return this.selection.altitudeRaise !== this.terraform.invert ? 1 : -1;
    }

    private beginStroke(clientX: number, clientY: number, invert: boolean): void {
      const tile = this.editView.tileAt(clientX, clientY);
      if (!tile) return;
      this.settle(true);
      this.terraform.invert = invert;
      this.terraform.begin(this.world, this.brushSign(), tile.x, tile.y);
      this.strokeAt = { x: clientX, y: clientY };
      this.editView.holdWorld = true;
    }

    /** One frame of a held brush: dab along the pointer's way, pay for the elevation moved, redraw those tiles. */
    private strokeFrame(deltaMs: number): void {
      const at = this.strokeAt;
      const tile = at && this.editView.tileAt(at.x, at.y);
      if (!tile) return;
      const w = this.world;
      const t = this.terraform;
      if (isDevMode()) w.omega = omegaCap(w); // DEVMODE: the brush never runs dry
      // The brush slows down to what the energy left can pay, from what the last frame cost per second.
      const perSecond = t.perSecond * TERRAFORM_COST_PER_UNIT;
      if (w.omega < 1) {
        this.notifier.message(`Zu wenig Energie – ${fmt.int(Math.max(1, perSecond))} Ω je Sekunde benötigt, ${fmt.int(w.omega)} Ω vorhanden.`, 'warn');
        this.endStroke(true);
        return;
      }
      const dt = perSecond > 0 ? Math.min(deltaMs / 1000, w.omega / perSecond) : deltaMs / 1000;
      // The ground moves on screen at once; in worker mode the worker dabs the same (SimHost.brush).
      const s = t.step(w, tile.x, tile.y, dt);
      if (s.moved === 0) return;
      this.sim.brush(t.dabs, s.moved);
      this.editView.markDirtyTiles(s.x0, s.y0, s.x1, s.y1);
      const now = performance.now();
      if ((s.emerged > 0 || s.flooded > 0) && now - this.lastNudge > 900) {
        this.lastNudge = now;
        if (!this.settings.reduceEffects) {
          this.canvas.animate([
            { transform: 'translate(0, 0)' }, { transform: 'translate(1px, -2px)' },
            { transform: 'translate(-1px, 1px)' }, { transform: 'translate(0, 0)' },
          ], { duration: 160 });
        }
      }
    }

    /** Pointer up: the slow consequences over everything the stroke touched, as after any edit. */
    private endStroke(quiet = false): void {
      const tiles = this.terraform.end();
      this.strokeAt = null;
      if (!tiles) return;
      if (this.terraform.moved === 0) {
        this.editView.holdWorld = false;
        if (!quiet) this.notifier.message(this.terraform.sign > 0 ? 'Hier ist bereits die größte Höhe erreicht.' : 'Hier ist bereits die größte Tiefe erreicht.', 'warn');
        return;
      }
      if (this.sim.mode === 'worker') {
        // The worker settles it in one go before its next tick; the screen follows with that state.
        this.sim.run({ type: 'settle', tiles: [...tiles] }, () => {
          this.examinePanel.invalidate();
          this.unsaved = true;
          this.takeNotes();
          this.editView.warm(this.world);
          this.editView.markDirty();
          this.editView.holdWorld = this.terraform.active;
        });
        return;
      }
      this.sim.view.beginSettle(tiles);
      this.settleDue = { phase: 0 };
    }

    /**
     * Direct mode: settle a finished stroke one step per frame, so its costs
     * never pile onto one frame: the frame that shows the release, then the
     * settling, then re-reading the map's field, then (next render) the full
     * redraw. `all` does what is left at once, before a new stroke starts. A
     * tick due meanwhile finishes the settling first (SimCore.tick).
     */
    private settle(all = false): void {
      const due = this.settleDue;
      if (!due) return;
      const core = this.sim.view;
      if (due.phase === 0 && !all) { due.phase = 1; return; }
      if (due.phase <= 1) {
        // One settle step a frame (terraformSettleSteps: none stalls a frame alone).
        if (all) core.finishSettle();
        else if (core.settlePending && core.settleStep()) return;
        due.phase = 2;
        this.examinePanel.invalidate();
        this.unsaved = true;
        this.takeNotes();
        if (!all) return;
      }
      if (!all) this.editView.warm(this.world);
      this.editView.markDirty();
      this.settleDue = null;
      this.editView.holdWorld = this.terraform.active;
    }

    private resizeBrush(dir: 1 | -1): void {
      this.terraform.resize(dir);
      this.buildToolOptions();
    }

    /** After any edit (the simulation refreshed its derived state and the tree): map, open panels, news. */
    private afterEdit(): void {
      this.editView.markDirty();
      this.examinePanel.invalidate();
      this.unsaved = true;
      this.takeNotes();
    }

    private applyAt(clientX: number, clientY: number): void {
      const tile = this.editView.tileAt(clientX, clientY);
      if (!tile) return;
      const { x, y } = tile;
      const w = this.world;
      const s = this.selection;
      const here = idx(x, y);
      if (here === this.lastPainted) return;
      this.lastPainted = here;

      switch (s.tool) {
        case Tool.Examine:
          // The spaceport's picture opens its project window, free of charge (where it is drawn).
          if (this.editView.layers.cities && w.space.site >= 0 && !w.isWater(w.space.site) && SpaceportLayer.hit(w, x, y)) {
            this.openSpaceport();
            break;
          }
          // The open window already follows its tile live: clicking it again buys nothing, but may catch a migration.
          if (!this.examineTile || this.examineTile.x !== x || this.examineTile.y !== y || !this.windows.isVisible('examine')) {
            const why = this.sim.view.check({ type: 'examine' });
            if (why) { this.notifier.message(why, 'warn'); return; }
            // The window opens at once; the charge follows with the simulation, which checks it again.
            this.sim.run({ type: 'examine' }, (r) => { if (!r.ok && r.reason) this.notifier.message(r.reason, 'warn'); });
            this.examineTile = { x, y };
            this.examinePanel.invalidate();
            this.examinePanel.update(w, x, y);
            this.windows.show('examine');
          }
          this.watchMigration(here);
          break;

        case Tool.SetAltitude:
          // A tap (touch): a short push, as if the brush were held for a moment.
          this.beginStroke(clientX, clientY, false);
          this.strokeFrame(TAP_PUSH_MS);
          this.endStroke();
          break;

        case Tool.PlantBiome:
          this.plantAt(x, y);
          break;

        case Tool.PlaceLife:
          this.placeLife(x, y);
          break;

        case Tool.TriggerEvent:
          if (HAZARD_RULES[s.event]) {
            this.raiseHazard(s.event, x, y);
            break;
          }
          this.act({ type: 'event', kind: s.event, x, y });
          break;

        case Tool.Move:
          break;
      }

      if (this.examineTile && this.examineTile.x === x && this.examineTile.y === y) {
        this.examinePanel.update(w, x, y);
      }
    }

    /**
     * A disaster on exactly one tile (docs/ereignisse-spec.md §2.1): checked
     * and paid for now, started in the simulation once its omen has played.
     * In worker mode the show picks the hazard up when its state arrives
     * (FxShow.build: a fresh hazard in view plays its main animation).
     */
    raiseHazard(kind: EventKind, x: number, y: number): void {
      const pay = { type: 'payHazard', kind, x, y } as const;
      const why = this.sim.view.check(pay);
      if (why) { this.notifier.message(why, 'warn'); return; }
      this.sim.run(pay, (r) => { if (!r.ok && r.reason) this.notifier.message(r.reason, 'warn'); });
      this.editView.fx.show.stage(this.world, kind, x, y, () => {
        let started: Hazard | null = null;
        this.sim.run({ type: 'startHazard', kind, x, y }, (r) => {
          if (!r.ok) {
            if (r.reason) this.notifier.message(r.reason, 'warn');
            return;
          }
          const w = this.world;
          started = w.hazards.hazard(r.hazard ?? -1) ?? null;
          // The worker's hazard: its show starts here, a one-step meteor may be over before any state shows it.
          if (this.sim.mode === 'worker' && r.started) this.editView.fx.show.begin(r.started, performance.now());
          this.lastHazard = { id: r.hazard ?? -1, x, y, generation: w.hazards.generation };
          this.editView.markDirty();
          this.examinePanel.invalidate();
          this.unsaved = true;
          this.takeNotes(`${EVENT_NAMES[kind]}!`);
        });
        // Direct mode answers at once; the worker's hazard arrives with its state.
        return this.sim.mode === 'direct' ? started : null;
      });
    }

    /** Plant a developed group (or clear) over a 5x5 brush. */
    private plantAt(x: number, y: number): void {
      const s = this.selection;
      this.act({ type: 'plant', flora: s.flora, clearing: s.clearing, x, y });
    }

    private placeLife(x: number, y: number): void {
      const s = this.selection;
      if (s.lifeMode === 'life') this.act({ type: 'placeLife', life: s.life, x, y });
      else if (s.lifeMode === 'city') this.act({ type: 'placeCity', tech: s.tech, x, y });
      else this.act({ type: 'terraformer', tf: s.terraformer, x, y });
    }

    /**
     * What the simulation had to say since the last look (SimCore.notes):
     * disasters into one line, with the player's own (`first`) leading, then
     * its messages.
     */
    private takeNotes(first = ''): void {
      const notes = this.sim.view.notes.splice(0);
      for (const n of notes) if (n.kind === 'hazard') this.hazardNews.push(n);
      for (const n of this.hazardNews) this.mapView.ping(n.x, n.y, HAZARD_PING);
      this.reportHazards(first);
      for (const n of notes) {
        if (n.kind !== 'message') continue;
        this.notifier.message(n.text, n.tone, n.spaceport ? { label: 'Zum Raumhafen', run: () => this.openSpaceport() } : undefined);
        if (n.at !== undefined) this.mapView.ping(n.at % GRID_W, Math.floor(n.at / GRID_W), n.tone === 'warn' ? HAZARD_PING : NEWS_PING);
      }
    }

    /**
     * One line for the disasters that just started: the player's own (`first`)
     * and those nature or a chain set off, with a button that flies there.
     */
    private reportHazards(first = ''): void {
      const news = this.hazardNews.splice(0);
      if (news.length === 0) {
        if (first) this.notifier.message(first);
        return;
      }
      const parts = first ? [first] : [];
      for (const h of news) {
        parts.push(h.cause === 'chain' ? `Folge: ${EVENT_NAMES[h.event]}.`
          : h.cause === 'natural' && h.event === EventKind.Fire ? `Blitzeinschlag: ${EVENT_NAMES[h.event]}!` : `${EVENT_NAMES[h.event]}!`);
      }
      const target = news[news.length - 1];
      this.lastHazard = { id: target.id, x: target.x, y: target.y, generation: this.world.hazards.generation };
      this.notifier.message(parts.join(' '), 'info', { label: 'Zum Ereignis springen', run: () => this.flyToHazard(this.world.hazards.hazard(target.id) ?? target) });
    }

    /** Fly to a disaster; a hurricane is found where its eye is now. */
    private flyToHazard(h: HazardSpot): void {
      const eye = h.storm?.path[h.storm.path.length - 1];
      const x = eye === undefined ? h.x : eye % GRID_W;
      const y = eye === undefined ? h.y : Math.floor(eye / GRID_W);
      flyTo(this.editView, x, y, () => this.editView.ping(x, y, HAZARD_PING));
    }

    private gotoEvent(): void {
      const w = this.world;
      const last = this.lastHazard && this.lastHazard.generation === w.hazards.generation ? w.hazards.hazard(this.lastHazard.id) ?? this.lastHazard : null;
      const running: HazardSpot | null = w.hazards.list[w.hazards.list.length - 1] ?? last;
      if (running) { this.flyToHazard(running); return; }
      let best = -1;
      let bestTtl = 0;
      for (let i = 0; i < TILE_COUNT; i++) {
        if (w.eventTtl[i] > bestTtl) { bestTtl = w.eventTtl[i]; best = i; }
      }
      if (best < 0) { this.notifier.message('Derzeit gibt es kein aktives Ereignis.', 'warn'); return; }
      this.editView.centerOn(best % GRID_W, Math.floor(best / GRID_W));
    }

    /* ====================================================== evolution === */

    /** Develop a step; `done` hears whether it worked (at once in direct mode, which preview pages rely on). */
    developNode(id: string, done?: (res: { ok: boolean; reason: string }) => void): void {
      this.sim.run({ type: 'develop', id }, (r) => {
        const res = { ok: r.ok, reason: r.reason ?? '' };
        if (!res.ok) this.notifier.message(res.reason, 'warn');
        else {
          this.afterEdit();
          this.buildToolOptions();
          this.flushChronicle();
        }
        done?.(res);
      });
    }

    /** Centre the map on the densest population of a node. */
    /** Centre the map on where a step was founded, and mark the spot. */
    private showEntryOnMap(e: ChronicleEntry): void {
      if (e.at === undefined) return;
      const x = e.at % GRID_W;
      const y = Math.floor(e.at / GRID_W);
      this.windows.hide('evolution');
      this.editView.centerOn(x, y);
      const n = e.nodeId ? EVO_BY_ID.get(e.nodeId) : undefined;
      this.editView.ping(x, y, n ? KINGDOM_COLOR[n.kingdom] : '#f6f1df');
    }

    private showNodeOnMap(id: string): boolean {
      const n = evoNode(id);
      const w = this.world;
      let best = -1;
      let bestV = 0;
      for (let i = 0; i < TILE_COUNT; i++) {
        const v = n.life !== undefined ? w.lifeDensity[i * LIFE_COUNT + n.life]
          : n.flora !== undefined && (w.flora[i] & (1 << n.flora)) ? 0.01 + w.vegetation[i] : 0;
        if (v > bestV) { bestV = v; best = i; }
      }
      if (best < 0) return false;
      this.windows.hide('evolution');
      this.editView.centerOn(best % GRID_W, Math.floor(best / GRID_W));
      this.notifier.message(`${n.name}: eine der dichtesten Populationen.`);
      return true;
    }

    openTree(id?: string): void {
      this.windows.show('evolution');
      if (id) this.tree.reveal(id);
    }

    /** What the player should do next, for the report. */
    private nextStep(): NextStep {
      const w = this.world;
      const evo = this.evolution;
      if (!w.evo.isDeveloped('cells')) {
        return { id: 'cells', title: 'Erste Zellen entwickeln', text: 'Öffne den Evolutionsbaum und entwickle die ersten Zellen – das ist kostenlos.' };
      }
      const nodes = EVO_NODES.filter((n) => !w.evo.isDeveloped(n.id));
      if (nodes.length === 0) {
        return { id: null, title: 'Alle Entwicklungen erreicht', text: 'Beobachte, wie sich dein Ökosystem ausbreitet – oder begleite eine Zivilisation.' };
      }
      const status = (n: EvoNode): NodeStatus => evo.statusOf(n.id);
      const available = nodes.filter((n) => status(n).state === 'available').sort((a, b) => a.cost - b.cost);
      if (available.length > 0) {
        const n = available[0];
        const more = available.length > 1 ? ` (${available.length} Schritte verfügbar)` : '';
        return { id: n.id, title: `${n.name} entwickeln`, text: `Jetzt im Evolutionsbaum möglich${n.cost > 0 ? ` für ${n.cost} EP` : ''}${more}.` };
      }
      const partial = nodes.filter((n) => status(n).state === 'partial');
      const onlyCost = partial.filter((n) => status(n).conds.every((c) => c.met || c.kind === 'cost')).sort((a, b) => a.cost - b.cost);
      const rate = evo.epRate(w, this.params);
      if (onlyCost.length > 0) {
        const n = onlyCost[0];
        const missing = Math.ceil(n.cost - w.evo.ep);
        const ticks = rate > 0 ? Math.ceil(missing / rate) : 0;
        return { id: n.id, title: n.name, text: `Noch ${missing} EP${ticks > 0 ? ` – etwa ${fmt.int(ticks)} Zeitschritte bei +${fmt.two(rate)} EP je Schritt` : ''}. Mehr lebende Gruppen bringen mehr EP.` };
      }
      const best = partial.sort((a, b) => status(b).conds.filter((c) => c.met).length - status(a).conds.filter((c) => c.met).length)[0];
      if (best) return { id: best.id, title: best.name, text: `${EvolutionSystem.missingSummary(status(best))}.` };
      return { id: null, title: 'Lebensräume schaffen', text: 'Lass die Zeit laufen: Sauerstoff, Klima und Pflanzen öffnen neue Wege.' };
    }

    /** The first salmon run, stork flight, clownfish, termite mound or kapok tree caught with the Examine tool goes into the chronicle, with its card. */
    private watchMigration(i: number): void {
      const kind = this.editView.migrationOn(this.world, i);
      const entry = (kind && migrationMilestone(this.world, kind, i)) || termiteMilestone(this.world, i) || kapokMilestone(this.world, i);
      if (!entry) return;
      this.sim.run({ type: 'record', entry }, () => {
        this.flushChronicle();
        this.unsaved = true;
      });
    }

    /** Hand new chronicle entries to the notifier. */
    private flushChronicle(): void {
      if (this.evolution.pending.length === 0) return;
      const entries = this.evolution.pending.splice(0);
      for (const e of entries) {
        if (e.at === undefined || e.at < 0 || this.world.evo.reported.has(e.key)) continue;
        const n = e.nodeId ? EVO_BY_ID.get(e.nodeId) : undefined;
        this.mapView.ping(e.at % GRID_W, Math.floor(e.at / GRID_W), n ? KINGDOM_COLOR[n.kingdom] : NEWS_PING);
      }
      this.notifier.push(entries, this.world.evo.reported);
    }

    /** Fly the map to the creature standing for a sub-species; false if none lives. */
    private jumpToSpecies(c: Life, stage: number): boolean {
      const i = this.editView.pinSpecies(this.world, c, stage);
      if (i < 0) return false;
      if (!this.editView.layers.life) {
        this.editView.layers.life = true;
        this.syncLayerButtons();
      }
      const x = i % GRID_W;
      const y = Math.floor(i / GRID_W);
      if (this.windows.narrow) { this.windows.hide('species'); this.windows.hide('lexicon'); }
      flyTo(this.editView, x, y, () => this.editView.ping(x, y, KINGDOM_COLOR[nodeForLife(c)?.kingdom ?? 'animal']));
      return true;
    }

    /* ======================================================= dinosaurs === */

    /**
     * Every frame: while the dinosaurs' fate holds the world (dinoera.ts),
     * keep it paused, ask once the birds' film is over, and start the comet
     * once it is chosen — again after a reload, never twice on one planet.
     */
    private tendDinoFate(): void {
      const w = this.world;
      if (!dinoEraHoldsTime(w)) return;
      if (this.fateResume === null) {
        this.fateResume = this.milestonePaused ? this.speedBeforeMilestone : this.speed;
        this.milestonePaused = false;
        if (this.speed !== 0) this.setSpeed(0, true);
      }
      if (this.title || activeIntro) return;
      if (w.dinoEra.fate === 'impactPending') {
        if (this.cometShown !== w.hazards.generation) this.showComet();
        return;
      }
      if (this.fateAsking || this.screenHeld || Modal.open) return;
      // The birds' film plays to its end first.
      const birds = w.evo.chronicle.find((e) => e.key === 'evo:birds');
      if (birds && !w.evo.reported.has(birds.key)) return;
      this.fateAsking = true;
      const generation = w.hazards.generation;
      void askDinoFate().then((choice) => {
        if (choice === null) return;
        // A choice made for this planet only, and only while it is asked.
        if (w.hazards.generation !== generation) {
          this.fateAsking = false;
          return;
        }
        this.sim.run({ type: 'dinoFate', choice }, (r) => {
          this.fateAsking = false;
          if (!r.ok || w.hazards.generation !== generation) return;
          this.unsaved = true;
          this.flushChronicle();
          this.tree.update(true);
          if (choice === 'survive') this.releaseDinoFate();
          else this.showComet();
        });
      });
    }

    /**
     * The comet's show: the camera flies to the crater, the omen plays, and
     * the strike commits through applyComet, which acts once only. A player
     * taking the camera over in flight does not stop it.
     */
    private showComet(): void {
      const w = this.world;
      if (w.dinoEra.fate !== 'impactPending') return;
      const generation = w.hazards.generation;
      this.cometShown = generation;
      const t = w.dinoEra.target >= 0 ? w.dinoEra.target : cometSite(w);
      const x = t % GRID_W;
      const y = Math.floor(t / GRID_W);
      this.windows.hide('evolution');
      let staged = false;
      const stage = (): void => {
        if (staged || w.hazards.generation !== generation || w.dinoEra.fate !== 'impactPending') return;
        staged = true;
        this.editView.centerOn(x + 1, y + 1);
        // One frame for the effect layer to see where the camera now is: off screen it would strike unseen.
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
          if (w.hazards.generation !== generation) return;
          this.editView.fx.show.stage(w, EventKind.Meteor, x, y, () => this.commitComet(generation), { omen: COMET_OMEN_MS, strength: COMET_STRENGTH });
        }));
      };
      flyTo(this.editView, x + 1, y + 1, stage);
      window.setTimeout(stage, COMET_FLY_FALLBACK_MS);
    }

    /** The strike (SimCore 'comet'); direct mode returns its hazard for the show, the worker's arrives with its state. */
    private commitComet(generation: number): Hazard | null {
      const w = this.world;
      if (w.hazards.generation !== generation) return null;
      let started: Hazard | null = null;
      this.sim.run({ type: 'comet' }, (r) => {
        if (!r.ok || w.hazards.generation !== generation) return;
        started = w.hazards.hazard(r.hazard ?? -1) ?? null;
        if (this.sim.mode === 'worker' && r.started) this.editView.fx.show.begin(r.started, performance.now());
        this.editView.markDirty();
        this.examinePanel.invalidate();
        this.buildToolOptions();
        this.lastHazard = { id: r.hazard ?? -1, x: started?.x ?? 0, y: started?.y ?? 0, generation };
        this.takeNotes('Der Komet schlägt ein!');
        // Its cards would cover the impact: once it has played out the news
        // tells what they would (the rest come after), and then time runs again.
        const news = this.evolution.pending.splice(0);
        this.unsaved = true;
        window.setTimeout(() => {
          if (w.hazards.generation !== generation) return;
          for (const e of news) if (e.key === 'comet:impact' || e.key === 'extinct:dinosaurs:comet') this.sim.predict({ type: 'reported', key: e.key });
          void showCometNews().then(() => {
            if (w.hazards.generation !== generation) return;
            this.evolution.pending.unshift(...news);
            this.flushChronicle();
            this.releaseDinoFate();
          });
        }, COMET_MAIN_MS);
      });
      return this.sim.mode === 'direct' ? started : null;
    }

    /** The fate is settled: the world runs again at the speed it had, a paused one stays paused. */
    private releaseDinoFate(): void {
      if (dinoEraHoldsTime(this.world)) return;
      const resume = this.fateResume;
      this.fateResume = null;
      if (resume === null || resume === this.speed) return;
      // A milestone still open (the strike's own card) keeps its pause, if the player wants those.
      if (resume > 0 && this.settings.pauseOnMilestone && this.screenHeld) {
        this.speedBeforeMilestone = resume;
        this.milestonePaused = true;
        return;
      }
      this.setSpeed(resume, true);
    }

    private onMilestone(open: boolean): void {
      if (!this.settings.pauseOnMilestone) return;
      if (open && this.speed !== 0) {
        this.speedBeforeMilestone = this.speed;
        this.milestonePaused = true;
        this.setSpeed(0, true);
      } else if (!open && this.milestonePaused) {
        this.milestonePaused = false;
        if (this.speed === 0) this.setSpeed(this.speedBeforeMilestone, true);
      }
    }

    /* ======================================================= spaceport === */

    private openSpaceport(): void {
      this.spaceportPanel.update(this.world);
      this.windows.show('spaceport');
    }

    /** Fly the map to the launch site. */
    private locateSpaceport(): void {
      const site = this.world.space.site;
      if (site < 0) return;
      const x = site % GRID_W;
      const y = Math.floor(site / GRID_W);
      flyTo(this.editView, x, y - 1, () => this.editView.ping(x, y, '#f6f1df'));
    }

    /**
     * "Start in neue Welten": everything is asked again here, whatever the
     * window showed, and the launch commits at once, so a second click, a
     * stale window or a reload during the film never launches twice and a
     * load never plays the film. Time stands still from here through the
     * film and the closing dialog, then runs on as it did.
     */
    private launchRocket(): void {
      const w = this.world;
      if (this.launchFilm || this.launching || this.title || activeIntro || Modal.open) return;
      const problem = spaceLaunchProblem(w);
      if (problem) {
        this.notifier.message(problem, 'warn');
        return;
      }
      // Time stands still before the simulation commits it (SimCore 'launch' asks again).
      this.launching = true;
      const resume = this.milestonePaused ? this.speedBeforeMilestone : this.speed;
      this.milestonePaused = false;
      this.setSpeed(0, true);
      this.sim.run({ type: 'launch' }, (r) => {
        this.launching = false;
        if (!r.ok) {
          if (r.reason) this.notifier.message(r.reason, 'warn');
          if (resume > 0) this.setSpeed(resume, true);
          return;
        }
        this.flushChronicle();
        this.unsaved = true;
        this.spaceportPanel.update(w);
        this.music.setEnabled(false);
        const generation = w.hazards.generation;
        try {
          this.launchFilm = new LaunchFilm(document.body, {
            world: () => this.world,
            reduceEffects: () => this.settings.reduceEffects,
            volume: () => SFX.volume(),
            done: () => void this.endLaunch(resume, generation),
          });
        } catch (err) {
          // Launched all the same: without its film the closing dialog follows at once.
          console.warn('SimEarth: the launch film could not start', err);
          document.querySelectorAll('.launchfilm').forEach((n) => n.remove());
          setGameInert(false);
          this.launchFilm = null;
          void this.endLaunch(resume, generation);
        }
      });
    }

    /** The film is over or skipped: the closing dialog, then this planet goes on, or the main menu opens. */
    private async endLaunch(resume: number, generation: number): Promise<void> {
      const choice = await showLaunchFinale();
      this.launchFilm?.close();
      this.launchFilm = null;
      this.music.setEnabled(this.settings.music);
      if (choice === 'menu' && await this.toMainMenu()) return;
      if (this.world.hazards.generation !== generation || resume <= 0) return;
      // A milestone still open keeps its pause, if the player wants those.
      if (this.settings.pauseOnMilestone && this.screenHeld) {
        this.speedBeforeMilestone = resume;
        this.milestonePaused = true;
        return;
      }
      this.setSpeed(resume, true);
    }

    /** "Zum Hauptmenü": unsaved progress is handled as for a new planet, then the title with a fresh waiting planet. True if it went. */
    private async toMainMenu(): Promise<boolean> {
      if (this.unsaved && this.world.evo.developed.size > 0) {
        const choice = await Modal.show({
          title: 'Zum Hauptmenü?', icon: uiIcon('new-planet'),
          body: 'Der aktuelle Planet hat ungespeicherte Fortschritte. Sie gehen verloren, wenn du jetzt zum Hauptmenü wechselst.',
          actions: [
            { label: 'Abbrechen', value: '', kind: 'ghost' },
            { label: 'Erst speichern', value: 'save', kind: 'secondary' },
            { label: 'Zum Hauptmenü', value: 'menu', kind: 'danger' },
          ],
        });
        if (choice === '') return false;
        if (choice === 'save' && !(await this.saveTo(this.settings.lastSlot))) return false;
      }
      this.newPlanet({ quiet: true });
      this.showTitle();
      return true;
    }

    /* ====================================================== lifecycle === */

    /** `keepSeed` remakes the same planet (another sea share), `seed` an earlier one; `quiet` skips the toast. */
    newPlanet(opts: { quiet?: boolean; keepSeed?: boolean; seed?: number } = {}): void {
      this.notifier.clear();
      this.discoveries.clear();
      this.ripStamps.clear();
      this.goalNotice.reset();
      // What the old planet still had to say goes with it.
      const view = this.sim.view;
      view.notes.length = 0;
      view.evolution.pending.length = 0;
      view.fauna.pending.length = 0;
      this.hazardNews.length = 0;
      this.editView.holdWorld = false;
      this.launching = false;
      this.fateAsking = false;
      const seed = opts.seed !== undefined ? opts.seed >>> 0 : opts.keepSeed ? this.currentSeed : (Math.random() * 0xffffffff) >>> 0;
      this.planetSeed = seed;
      this.accumulator = 0;
      this.editView.tickPhase = 0;
      this.milestonePaused = false;
      this.settleDue = null;
      // A new planet always starts paused.
      this.fateResume = null;
      this.setSpeed(0, true);
      this.examineTile = null;
      this.windows.hide('examine');
      this.sim.run({ type: 'newPlanet', seed, ocean: this.settings.oceanShare, epoch: this.settings.epoch }, () => {
        this.seenTicks = this.world.ticks;
        this.omegaStageSeen = omegaStage(this.world);
        this.sliderPanels.forEach((p) => p.sync());
        this.centerOnLand();
        this.editView.markDirty();
        this.examinePanel.invalidate();
        this.chroniclePanel.update(this.world, true);
        this.tree.update(true);
        this.buildToolOptions();
        this.refreshMapLegend();
        this.unsaved = false;
        if (!opts.quiet) this.notifier.message(`${epochOf(this.settings.epoch).greeting} Öffne den Evolutionsbaum, um das Leben zu beginnen.`);
      });
    }

    private async confirmNewPlanet(): Promise<void> {
      const risky = this.unsaved && this.world.evo.developed.size > 0;
      const body = make('div', 'new-planet-body');
      body.appendChild(make('p', undefined, risky
        ? 'Der aktuelle Planet hat ungespeicherte Fortschritte. Sie gehen verloren, wenn du jetzt einen neuen Planeten erschaffst.'
        : 'Ein neuer Planet ersetzt den jetzigen. Welcher soll es sein?'));
      const sea = buildOceanSlider(this.settings.oceanShare);
      const picker = buildPlanetPicker(this.settings.epoch, (id) => { sea.el.hidden = !epochOf(id).playerSea; });
      sea.el.hidden = !epochOf(picker.value).playerSea;
      body.append(picker.el, sea.el);
      const choice = await Modal.show({
        title: 'Neuen Planeten erschaffen?', icon: uiIcon('new-planet'), body,
        actions: risky
          ? [
            { label: 'Abbrechen', value: '', kind: 'ghost' },
            { label: 'Erst speichern', value: 'save', kind: 'secondary' },
            { label: 'Neuer Planet', value: 'new', kind: 'danger' },
          ]
          : [
            { label: 'Abbrechen', value: '', kind: 'ghost' },
            { label: 'Neuer Planet', value: 'new', kind: 'primary' },
          ],
      });
      if (choice === '') return;
      if (choice === 'save') {
        const ok = await this.saveTo(this.settings.lastSlot);
        if (!ok) return;
      }
      this.setOceanShare(sea.value);
      this.setEpoch(picker.value);
      this.newPlanet();
    }

    private setOceanShare(share: number): void {
      if (!Number.isFinite(share)) return;
      this.settings.oceanShare = clamp(share, OCEAN_SHARE_MIN, OCEAN_SHARE_MAX);
      this.saveSettings();
    }

    private setEpoch(id: EpochId): void {
      if (!isEpochId(id)) return;
      this.settings.epoch = id;
      this.saveSettings();
    }

    /** Open the edit view over a temperate continent rather than open sea. */
    private centerOnLand(): void {
      const w = this.world;
      let best = -1;
      let bestScore = -Infinity;
      for (let i = 0; i < TILE_COUNT; i += 7) {
        if (w.isWater(i)) continue;
        const y = Math.floor(i / GRID_W);
        const score = w.elevation[i] * 0.3 - Math.abs(latitudeDeg(y)) / 60;
        if (score > bestScore) { bestScore = score; best = i; }
      }
      if (best < 0) best = idx(GRID_W >> 1, GRID_H >> 1);
      this.editView.centerOn(best % GRID_W, Math.floor(best / GRID_W));
    }

    private setSpeed(i: number, quiet = false): void {
      if (i > 0 && dinoEraHoldsTime(this.world)) {
        // Asked for while the fate holds the world: that is the speed to go on at.
        this.fateResume = i;
        if (!quiet) this.notifier.message('Zuerst über das Schicksal der Dinosaurier entscheiden.', 'warn');
        return;
      }
      if (i > 0) this.lastRunningSpeed = i;
      this.speed = i;
      this.sim.predict({ type: 'speed', speed: i });
      // Keep the phase, so a speed change never throws a moving effect back.
      this.accumulator = this.editView.tickPhase * SPEED_TICK_MS[i];
      if (i !== 0) this.milestonePaused = false;
      this.syncSpeedButtons();
      if (!quiet) this.notifier.message(i === 0 ? 'Pausiert.' : `Tempo: ${SPEED_NAMES[i]}`);
    }

    private togglePause(): void {
      this.setSpeed(this.speed === 0 ? this.lastRunningSpeed : 0);
    }

    /** The waiting planet's seed: as asked for in worker mode; on the page the world's own (preview pages set it there). */
    private get currentSeed(): number {
      return this.sim.mode === 'direct' ? this.world.seed : this.planetSeed;
    }

    /** `relativeDate` picks the Earth date with its era over the planet age. */
    private dateText(): string {
      const age = this.world.absoluteYears;
      if (!this.settings.relativeDate) return `Planetenalter ${formatYears(age)}`;
      const era = eraAt(age);
      return `${formatEarthDate(age, true)} · ${this.windows.narrow ? era.short : era.name}`;
    }

    /* =========================================================== tick === */

    /** One tick on the page (direct mode; preview pages call it to fast-forward). The worker ticks on its own. */
    tick(): void {
      if (this.sim.mode !== 'direct' || this.sim.broken) return;
      if (this.sim.view.tick()) this.unsaved = true;
    }

    /** The worker failed; the page carries on from the last complete state (SimHost.failover), paused so the player can save. */
    private simFailed(): void {
      PixelTerrain.shared().fieldHere();
      this.setSpeed(0, true);
      if (this.sim.broken) {
        void Modal.show({
          title: 'Simulation angehalten', icon: eventIcon('error'),
          body: 'In der Simulation ist ein Fehler aufgetreten. Damit kein beschädigter Planet weiterläuft, steht sie still. Lade deinen letzten Spielstand oder die automatische Sicherung, oder erschaffe einen neuen Planeten. Hilft das nicht, lade die Seite neu.',
          actions: [{ label: 'Verstanden', value: 'ok', kind: 'primary' }],
        });
        return;
      }
      this.notifier.message('Die Simulation im Hintergrund ist ausgefallen. Der Planet läuft ab jetzt im Hauptfenster weiter (vom letzten vollständigen Zeitschritt an) – am besten jetzt speichern.', 'warn');
    }

    /* ========================================================== frame === */

    /** DOM writes, throttled to about 10 Hz. */
    private updateUi(): void {
      const w = this.world;
      const h = this.hud;
      const stage = omegaStage(w);
      if (stage > this.omegaStageSeen) {
        const s = OMEGA_STAGES[stage];
        this.notifier.message(`Energiestufe ${stage + 1}: ${s.name} – jetzt +${fmt.one(s.regen)} Ω je Zeitschritt, bis ${fmt.int(s.max)} Ω.`, 'ok');
      }
      this.omegaStageSeen = stage;
      h.omega.textContent = fmt.int(w.omega);
      h.omegaBar.style.width = `${Math.round((w.omega / OMEGA_STAGES[stage].max) * 100)}%`;
      h.ep.textContent = fmt.int(w.evo.ep);
      if (isDevMode()) { h.omega.textContent = h.ep.textContent = '∞'; h.omegaBar.style.width = '100%'; } // DEVMODE
      h.devTag.hidden = !isDevMode(); // DEVMODE
      const rate = this.evolution.epRate(w, this.params);
      h.epRate.textContent = rate > 0 ? `+${fmt.two(rate)}` : '';
      this.hudInfo.refresh();
      h.o2.textContent = `${fmt.one(w.o2)} %`;
      h.co2.textContent = `${fmt.int(w.co2)} ppm`;
      h.temp.textContent = `${fmt.one(w.globalTemp)} °C`;
      h.scale.textContent = TIMESCALE_NAMES[w.timeScale];
      h.date.textContent = this.dateText();
      const available = this.evolution.availableIds().length;
      h.evoBadge.textContent = available > 0 ? String(available) : '';
      h.evoBadge.classList.toggle('show', available > 0);
      h.evoBtn.setAttribute('aria-label', available > 0
        ? `Evolutionsbaum öffnen, ${available} ${available === 1 ? 'Schritt' : 'Schritte'} entwickelbar` : 'Evolutionsbaum öffnen');

      this.goalNotice.update(this.evolution.availableIds(), performance.now(), !!this.title || !!activeIntro || this.screenHeld || Modal.open, this.settings.reduceEffects);
      if (this.evolution.revision !== this.toolRevision && (this.selection.tool === Tool.PlaceLife || this.selection.tool === Tool.PlantBiome)) {
        this.buildToolOptions();
      }

      if (this.windows.isVisible('evolution')) this.tree.update();
      for (const [id, hero] of this.modelHeroes) if (this.windows.isVisible(id)) hero.render();
      if (this.windows.isVisible('report')) this.reportPanel.update(w);
      if (this.windows.isVisible('history')) this.historyPanel.render();
      if (this.windows.isVisible('chronicle')) this.chroniclePanel.update(w);
      if (this.windows.isVisible('spaceport')) this.spaceportPanel.update(w);
      if (this.windows.isVisible('lexicon')) this.lexicon.update();
      if (this.windows.isVisible('species')) this.speciesInfo.update();
      if (this.mapShowsInfo || this.mapView.mode === MapMode.LifeMap || this.mapView.mode === MapMode.Biomes || this.mapView.mode === MapMode.Technology) {
        if ((w.ticks & 15) === 0 || this.mapShowsInfo) this.refreshMapLegend();
      }
      if (this.examineTile && this.windows.isVisible('examine')) {
        this.examinePanel.update(w, this.examineTile.x, this.examineTile.y);
      }
      for (const [kind, graph] of this.graphs) {
        if (this.windows.isVisible(`graph-${kind === 'biomes' ? 'biomes' : kind}`)) graph.render(w);
      }
      this.flushChronicle();
      if (this.fauna.pending.length > 0) this.discoveries.push(this.fauna.pending.splice(0));
      this.ripStamps.collect(w, this.fauna, this.evolution);
      h.oceanO2.textContent = `${fmt.int(w.oceanO2)} %`;
    }

    /** Held WASD keys glide the map, at the same screen speed at every zoom; opposite keys cancel out. */
    private panFrame(delta: number): void {
      let dx = 0;
      let dy = 0;
      for (const code of this.panKeys) {
        dx += PAN_KEYS[code][0];
        dy += PAN_KEYS[code][1];
      }
      if (dx === 0 && dy === 0) {
        this.panEase = 0;
        return;
      }
      this.panEase = Math.min(1, this.panEase + delta / PAN_EASE_MS);
      const tiles = (PAN_PX_PER_S * (delta / 1000) * smoothstep(this.panEase)) / (Math.hypot(dx, dy) * this.editView.tilePx);
      this.editView.scrollBy(dx * tiles, dy * tiles);
    }

    private frame = (now: number): void => {
      const start = performance.now();
      const gap = now - this.lastFrame;
      const delta = Math.min(250, gap);
      this.lastFrame = now;

      // A burning fire holds the game at the slowest speed (SimCore.tickMs).
      const tickMs = this.sim.view.tickMs(this.speed);
      if (devMode.on !== this.devModeSent) {
        this.devModeSent = devMode.on;
        this.sim.predict({ type: 'devMode', on: devMode.on });
      }
      if (this.sim.mode === 'worker') {
        // The worker ticks on its own clock; effects play between its ticks by the time since the last one arrived.
        if (tickMs > 0) this.editView.tickPhase = this.sim.phase(now, tickMs);
        this.sim.watch(now);
        perfHud.stateAge(this.sim.stateAge());
        if (this.world.ticks !== this.seenTicks) {
          this.seenTicks = this.world.ticks;
          this.unsaved = true;
        }
      } else if (tickMs > 0) {
        this.accumulator += delta;
        let steps = 0;
        // The first due tick always runs, more only within the frame's budget.
        while (this.accumulator >= tickMs && steps < MAX_TICKS_PER_FRAME && (steps === 0 || performance.now() - start < SIM_BUDGET_MS) && !dinoEraHoldsTime(this.world)) {
          const t0 = performance.now();
          this.tick();
          perfHud.tick(performance.now() - t0);
          this.accumulator -= tickMs;
          steps++;
        }
        // Too slow a machine runs the planet slower than set instead of freezing on ticks it can never catch up on.
        this.accumulator = Math.min(this.accumulator, tickMs * SIM_BACKLOG_TICKS);
        perfHud.ticksInFrame(steps);
        // Effects play between two ticks by this; paused, it stays where it was.
        // A pause from inside a tick (milestone) leaves the accumulator below 0.
        this.editView.tickPhase = clamp(this.accumulator / tickMs, 0, 0.999);
      } else {
        this.accumulator = 0;
      }

      // A finger held still on the map starts the brush.
      const held = this.touchPending;
      if (held && this.selection.tool === Tool.SetAltitude && now - held.t > TOUCH_HOLD_MS) {
        this.touchPending = null;
        this.beginStroke(held.x, held.y, false);
      }
      this.takeNotes();
      this.tendDinoFate();
      this.strokeFrame(delta);
      this.panFrame(delta);
      this.editView.editRectInto(this.mapView);
      this.editView.render(this.world);
      if (now - this.lastSurfCheck > 400) {
        this.lastSurfCheck = now;
        // The launch film brings its own sound.
        const quiet = !!this.title || !!this.launchFilm || !this.settings.ambient;
        this.surfTarget = quiet ? 0 : this.editView.surfPresence(this.world) * this.settings.ambientVolume;
        this.bubblingTarget = quiet ? 0 : this.editView.bubblePresence() * this.settings.ambientVolume;
        this.stormWindTarget = quiet ? 0 : this.editView.stormPresence(now) * this.settings.ambientVolume;
      }
      this.surf.update(this.surfTarget, delta, now);
      this.bubbling.update(this.bubblingTarget, delta, now);
      this.stormWind.update(this.stormWindTarget, delta, now);
      if (this.windows.isVisible('map')) {
        if (this.mapView.globe || this.mapView.pulsing) {
          if (now - this.lastMapRender > 50) {
            this.mapView.render(this.world);
            this.lastMapRender = now;
          }
        } else if (now - this.lastMapRender > MAP_RENDER_MS) {
          this.lastMapRender = now;
          this.mapView.render(this.world);
        }
      }
      if (this.windows.isVisible('gaia')) this.gaiaPanel.render(this.world, now, this.settings.reduceEffects, this.speed === 0);

      if (now - this.lastUi > 100) {
        this.lastUi = now;
        this.updateUi();
      }
      this.settle();
      if (this.speed > 0 && this.unsaved && now - this.lastAutosave > AUTOSAVE_MS && this.world.evo.developed.size > 0) {
        this.lastAutosave = now;
        void this.writeSave(AUTOSAVE_KEY, true);
      }
      perfHud.frame(gap, performance.now() - start);
      window.requestAnimationFrame(this.frame);
    };

    start(): void {
      this.lastFrame = performance.now();
      this.lastAutosave = this.lastFrame;
      window.requestAnimationFrame(this.frame);
    }

    /* ====================================================== save/load === */

    private loadSettings(): void {
      try {
        const raw = window.localStorage.getItem(SETTINGS_KEY);
        if (!raw) return;
        const s = JSON.parse(raw) as Partial<Settings>;
        if (typeof s.relativeDate === 'boolean') this.settings.relativeDate = s.relativeDate;
        if (typeof s.pauseOnMilestone === 'boolean') this.settings.pauseOnMilestone = s.pauseOnMilestone;
        if (typeof s.sound === 'boolean') this.settings.sound = s.sound;
        if (typeof s.music === 'boolean') this.settings.music = s.music;
        if (typeof s.ambient === 'boolean') this.settings.ambient = s.ambient;
        if (typeof s.ambientVolume === 'number' && Number.isFinite(s.ambientVolume)) this.settings.ambientVolume = clamp(s.ambientVolume, 0, 1);
        if (typeof s.soundVolume === 'number' && Number.isFinite(s.soundVolume)) this.settings.soundVolume = clamp(s.soundVolume, 0, 1);
        if (typeof s.musicVolume === 'number' && Number.isFinite(s.musicVolume)) this.settings.musicVolume = clamp(s.musicVolume, 0, 1);
        if (typeof s.dockCollapsed === 'boolean') this.settings.dockCollapsed = s.dockCollapsed;
        if (typeof s.lastSlot === 'number' && s.lastSlot >= 1 && s.lastSlot <= SLOT_COUNT) this.settings.lastSlot = s.lastSlot;
        if (typeof s.oceanShare === 'number' && Number.isFinite(s.oceanShare)) this.settings.oceanShare = clamp(s.oceanShare, OCEAN_SHARE_MIN, OCEAN_SHARE_MAX);
        if (isEpochId(s.epoch)) this.settings.epoch = s.epoch;
        if (typeof s.reduceEffects === 'boolean') this.settings.reduceEffects = s.reduceEffects;
        if (typeof s.introSeen === 'boolean') this.settings.introSeen = s.introSeen;
        if (typeof s.introDevOff === 'boolean') this.settings.introDevOff = s.introDevOff;
      } catch {
        // Settings are a convenience; defaults are fine.
      }
    }

    private saveSettings(): void {
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
      } catch {
        // Private mode or blocked storage: settings simply do not persist.
      }
    }

    private readMeta(key: string): SaveMeta | null {
      try {
        const raw = window.localStorage.getItem(`${key}.meta`);
        return raw ? (JSON.parse(raw) as SaveMeta) : null;
      } catch {
        return null;
      }
    }

    /** Write the planet under a storage key. Returns success. */
    private async writeSave(key: string, quiet: boolean): Promise<boolean> {
      if (this.savingNow) {
        if (key === AUTOSAVE_KEY) return false;
        // The player's own save waits for an autosave in flight instead of silently doing nothing.
        while (this.savingNow) await new Promise((r) => setTimeout(r, 50));
      }
      this.savingNow = true;
      try {
        // Serialized between two ticks where the planet lives, and encoded there (in worker mode off this thread).
        const r = await this.sim.request({ type: 'saveText' }, true);
        if (!r.ok || r.text === undefined || !r.meta) throw new Error(r.reason || 'Speichern fehlgeschlagen');
        const meta: SaveMeta = { ...r.meta, thumb: planetThumbnail(this.world) };
        window.localStorage.setItem(key, r.text);
        try {
          window.localStorage.setItem(`${key}.meta`, JSON.stringify(meta));
        } catch {
          // The planet is stored; a stale summary would describe the one it replaced.
          window.localStorage.removeItem(`${key}.meta`);
        }
        this.unsaved = false;
        if (!quiet) this.notifier.message('Planet gespeichert.', 'ok');
        return true;
      } catch (err) {
        const full = err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22);
        this.notifier.message(full
          ? 'Speichern fehlgeschlagen – der Browserspeicher ist voll. Lösche einen anderen Spielstand.'
          : 'Speichern fehlgeschlagen – der Browserspeicher ist nicht verfügbar.', 'warn');
        return false;
      } finally {
        this.savingNow = false;
      }
    }

    private async saveTo(slot: number): Promise<boolean> {
      this.settings.lastSlot = slot;
      this.saveSettings();
      const ok = await this.writeSave(slotKey(slot), true);
      if (ok) this.notifier.message(`Planet in Speicherplatz ${slot} gespeichert.`, 'ok');
      return ok;
    }

    /** Load from a storage key; the current planet stays intact on any failure. */
    private async loadFrom(key: string): Promise<boolean> {
      let raw: string | null = null;
      try {
        raw = window.localStorage.getItem(key);
      } catch {
        this.notifier.message('Laden fehlgeschlagen – der Browserspeicher ist nicht verfügbar.', 'warn');
        return false;
      }
      if (!raw) {
        this.notifier.message('Dieser Speicherplatz ist leer.', 'warn');
        return false;
      }
      // Paused before the planet is taken over, so the worker never ticks it unasked.
      const speed = this.speed;
      this.setSpeed(0, true);
      // Decoded, validated and taken over where the planet lives (SimCore.load).
      const r = await this.sim.request({ type: 'loadText', text: raw });
      if (!r.ok) {
        if (speed > 0) this.setSpeed(speed, true);
        const reason = r.reason || 'Der Spielstand ist unlesbar.';
        // A failed load deserves more than a passing toast: say what happened
        // and that nothing was lost.
        void Modal.show({
          title: 'Laden fehlgeschlagen', icon: eventIcon('error'),
          body: `${reason}${/[.!?]$/.test(reason) ? '' : '.'} Der aktuelle Planet bleibt unverändert – es ist nichts verloren gegangen.`,
          actions: [{ label: 'Verstanden', value: 'ok', kind: 'primary' }],
        });
        return false;
      }
      this.afterLoad();
      this.notifier.message(r.text ?? 'Planet geladen.', 'ok');
      return true;
    }

    private afterLoad(): void {
      PixelTerrain.shared().field.forget();
      this.notifier.clear();
      this.discoveries.clear();
      this.ripStamps.clear();
      this.goalNotice.reset();
      this.evolution.pending.length = 0;
      this.sim.view.notes.length = 0;
      this.fauna.pending.length = 0;
      this.hazardNews.length = 0;
      this.editView.holdWorld = false;
      this.launching = false;
      this.fateAsking = false;
      this.seenTicks = this.world.ticks;
      this.planetSeed = this.world.seed;
      this.settleDue = null;
      this.omegaStageSeen = omegaStage(this.world);
      this.milestonePaused = false;
      // A loaded planet always starts paused.
      this.fateResume = null;
      this.setSpeed(0, true);
      this.accumulator = 0;
      this.editView.tickPhase = 0;
      this.examineTile = null;
      this.windows.hide('examine');
      this.sliderPanels.forEach((p) => p.sync());
      this.editView.markDirty();
      this.examinePanel.invalidate();
      this.chroniclePanel.update(this.world, true);
      this.tree.update(true);
      this.buildToolOptions();
      this.refreshMapLegend();
      this.centerOnLand();
      this.unsaved = false;
      // Whatever was still waiting to be shown when the planet was saved.
      const unseen = this.world.evo.chronicle.filter((e) => !this.world.evo.reported.has(e.key));
      this.notifier.push(unseen, this.world.evo.reported);
      this.discoveries.push(this.fauna.unannounced());
    }

    /** The save/load dialog: three slots, the autosave and any old save. True if a planet was loaded. */
    private async openSaves(): Promise<boolean> {
      const body = make('div', 'saves');
      const rows: { key: string; title: string; slot: number }[] = [];
      for (let s = 1; s <= SLOT_COUNT; s++) rows.push({ key: slotKey(s), title: `Speicherplatz ${s}`, slot: s });
      rows.push({ key: AUTOSAVE_KEY, title: 'Automatische Sicherung', slot: 0 });
      let hasLegacy = false;
      try { hasLegacy = !!window.localStorage.getItem(LEGACY_SAVE_KEY); } catch { /* storage blocked */ }
      if (hasLegacy) rows.push({ key: LEGACY_SAVE_KEY, title: 'Älterer Spielstand (Version 4)', slot: -1 });

      let close: (value: string) => void = () => undefined;
      const choose = (value: string): void => close(value);
      for (const r of rows) {
        let exists = false;
        try { exists = !!window.localStorage.getItem(r.key); } catch { /* storage blocked */ }
        const actions: HTMLElement[] = [];
        if (r.slot > 0) {
          actions.push(button({ label: 'Hier speichern', icon: uiIcon('save'), cls: 'btn btn-small', onClick: () => choose(`save:${r.slot}`) }));
        }
        if (exists) {
          actions.push(button({ label: 'Laden', icon: uiIcon('load'), cls: 'btn btn-small btn-primary', onClick: () => choose(`load:${r.key}`) }));
          if (r.slot >= 0) actions.push(button({ label: `${r.title} löschen`, icon: uiIcon('trash'), cls: 'icon-btn', showLabel: false, onClick: () => choose(`delete:${r.key}`) }));
        }
        body.appendChild(saveSlotCard({ title: r.title, exists, meta: r.slot === -1 ? null : this.readMeta(r.key), legacy: r.slot === -1, actions }));
      }
      body.appendChild(make('p', 'save-note', 'Spielstände liegen im Speicher dieses Browsers. Strg+S speichert schnell in den zuletzt benutzten Platz.'));

      const result = Modal.show({
        title: 'Spielstände', icon: uiIcon('slot'), body, wide: true,
        actions: [{ label: 'Schließen', value: '', kind: 'ghost' }],
        bind: (fn) => { close = fn; },
      });
      const value = await result;
      if (!value) return false;
      const [verb, arg] = [value.slice(0, value.indexOf(':')), value.slice(value.indexOf(':') + 1)];
      if (verb === 'save') {
        const slot = Number(arg);
        let exists = false;
        try { exists = !!window.localStorage.getItem(slotKey(slot)); } catch { /* storage blocked */ }
        if (exists && !(await Modal.confirm('Speicherplatz überschreiben?', `Speicherplatz ${slot} enthält bereits einen Planeten. Er wird ersetzt.`, 'Überschreiben', uiIcon('save'), true))) return false;
        await this.saveTo(slot);
      } else if (verb === 'load') {
        if (this.unsaved && this.world.evo.developed.size > 0 &&
          !(await Modal.confirm('Planet laden?', 'Ungespeicherte Fortschritte des aktuellen Planeten gehen verloren.', 'Laden', uiIcon('load')))) return false;
        if (await this.loadFrom(arg)) {
          const slot = SLOT_COUNT >= 1 ? [1, 2, 3].find((s) => slotKey(s) === arg) : undefined;
          if (slot) { this.settings.lastSlot = slot; this.saveSettings(); }
          return true;
        }
      } else if (verb === 'delete') {
        if (!(await Modal.confirm('Spielstand löschen?', 'Dieser Spielstand wird endgültig aus dem Browser entfernt.', 'Löschen', uiIcon('trash'), true))) return false;
        try {
          window.localStorage.removeItem(arg);
          window.localStorage.removeItem(`${arg}.meta`);
          this.notifier.message('Spielstand gelöscht.', 'ok');
        } catch {
          this.notifier.message('Löschen fehlgeschlagen – der Browserspeicher ist nicht verfügbar.', 'warn');
        }
      }
      return false;
    }

    /** On start: the title screen, paused, until the player chooses a planet. */
    private showTitle(): void {
      this.setSpeed(0, true);
      let meta: SaveMeta | null = null;
      try {
        if (window.localStorage.getItem(AUTOSAVE_KEY)) meta = this.readMeta(AUTOSAVE_KEY);
      } catch {
        // Storage blocked: there is simply nothing to continue.
      }
      this.music.play('title');
      this.title = new TitleScreen(document.body, {
        world: () => this.world,
        seed: () => this.currentSeed,
        autosave: meta,
        continueGame: () => this.loadFrom(AUTOSAVE_KEY),
        reroll: () => this.newPlanet(),
        remake: (seed) => this.newPlanet({ seed }),
        oceanShare: this.settings.oceanShare,
        reshape: (share) => {
          this.setOceanShare(share);
          this.newPlanet({ quiet: true, keepSeed: true });
        },
        epoch: this.settings.epoch,
        chooseEpoch: (id) => {
          this.setEpoch(id);
          this.newPlanet({ quiet: true, keepSeed: true });
        },
        openSaves: () => this.openSaves(),
        openSettings: () => openSettings(this.settingDefs()),
        reduceEffects: () => this.settings.reduceEffects,
        start: (fresh) => {
          this.title = null;
          if (fresh) {
            // New and continued planets both start paused.
            this.playIntro(0, this.fullIntroWanted);
          } else {
            this.music.play('game');
            this.enterGame(0);
          }
        },
      });
    }

    /** Whether "Spiel starten" plays the full intro (studio card, logo): in developer mode as switched, else only before the first world. */
    private get fullIntroWanted(): boolean {
      return INTRO_DEV ? !this.settings.introDevOff : !this.settings.introSeen;
    }

    private enterGame(speed: number): void {
      this.setSpeed(speed, true);
      if (!this.windows.narrow) {
        this.windows.show('map', false);
        this.windows.show('gaia', false);
      }
      this.canvas.focus({ preventScroll: true });
    }

    /**
     * The intro before a new world: `full` with studio card and logo, else from
     * INTRO_SHORT_FROM. It hands over on the map at the tile it dived into: the
     * map glides in from INTRO_GLIDE_FROM while the clouds part, and the world
     * only starts turning once the intro is gone.
     */
    private playIntro(speed: number, full: boolean): void {
      if (full && !INTRO_DEV) {
        this.settings.introSeen = true;
        this.saveSettings();
      }
      const from = full ? 0 : INTRO_SHORT_FROM;
      this.music.play('intro', from);
      const view = this.editView;
      const zoom = view.tilePx;
      new IntroPlayer(document.body, {
        world: () => this.world,
        reduceEffects: () => this.settings.reduceEffects,
        musicTime: () => this.music.time(),
        land: (x, y, skipped) => {
          // Played through, the intro track dies away over the map and the game's music follows on the dot.
          if (skipped) this.music.play('game');
          else this.music.playThen('game', INTRO_MUSIC_END);
          if (!skipped) view.glideZoom(INTRO_GLIDE_FROM);
          view.centerOn(x, y);
          // A fresh picture at this zoom for the glide to stretch, not the title's stale one.
          view.markDirty();
        },
        // The first stretch stays put: the map composes its picture while the white still covers it.
        reveal: (p) => view.glideZoom(lerp(INTRO_GLIDE_FROM, zoom, 1 - Math.pow(1 - introSpan(p, 0.12, 1), 3))),
        done: () => {
          view.glideZoom(zoom);
          this.enterGame(speed);
        },
      }, from);
    }

    /** Save the whole planet as a PNG: the pixel landscape, or the overview map's mode while its atlas is missing. */
    private snapshot(): void {
      try {
        const canvas = PixelTerrain.shared().picture(this.world, 16) ?? this.mapView.exportImage(this.world);
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = `simearth-${new Date().toISOString().slice(0, 10)}.png`;
        a.click();
        this.notifier.message('Schnappschuss gespeichert.', 'ok');
      } catch {
        this.notifier.message('Schnappschuss nicht möglich.', 'warn');
      }
    }
  }

  /* -------------------------------------------------------------- bootstrap -- */

  /** The running application. Exposed for debugging and the test harness. */
  export let app: App | null = null;

  function boot(): void {
    app = new App();
    app.start();
  }

  if (typeof document !== 'undefined' && document.getElementById('desktop')) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  } else if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => { if (document.getElementById('desktop')) boot(); });
  }
}
