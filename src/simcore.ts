/* =============================================================================
 * SimEarth 2.0 — the simulation core
 * -----------------------------------------------------------------------------
 * One planet: its state, every system, the tick in the game's order and the
 * player's actions as commands, each checked against the current state and
 * applied between two ticks. No DOM: the app runs it in place or in a worker
 * (simhost.ts), the tests and probes run it in Node. What the screen should
 * hear about goes to `notes` (messages, disasters that started),
 * `evolution.pending` (chronicle) and `fauna.pending` (discoveries).
 * ========================================================================== */

namespace SE {
  /** Wall-clock milliseconds per simulation tick, index-aligned with the speed names (app.ts). */
  export const SPEED_TICK_MS: readonly number[] = [0, SLOWEST_TICK_MS, 1000, 400, 150];

  /** A message for the player, or a disaster that started without the player's hand (nature, a chain, the comet). */
  export type SimNote =
    | { readonly kind: 'message'; readonly text: string; readonly tone: 'info' | 'warn' | 'ok'; readonly spaceport?: boolean; readonly at?: number }
    | { readonly kind: 'hazard'; readonly id: number; readonly event: EventKind; readonly cause: HazardCause; readonly x: number; readonly y: number };

  /** A player action. Coordinates are tiles; `dabs` is flat [x, y, radius, sign, seconds] per dab. */
  export type SimCommand =
    | { readonly type: 'newPlanet'; readonly seed: number; readonly ocean: number; readonly epoch: EpochId }
    | { readonly type: 'speed'; readonly speed: number }
    | { readonly type: 'devMode'; readonly on: boolean }
    | { readonly type: 'params'; readonly groups: Record<string, Record<string, number>> }
    | { readonly type: 'reported'; readonly key: string }
    | { readonly type: 'announced'; readonly events: readonly FaunaRef[] }
    | { readonly type: 'examine' }
    | { readonly type: 'model'; readonly id: string }
    | { readonly type: 'record'; readonly entry: ChronicleEntry }
    | { readonly type: 'develop'; readonly id: string }
    | { readonly type: 'plant'; readonly flora: Flora; readonly clearing: boolean; readonly x: number; readonly y: number }
    | { readonly type: 'placeLife'; readonly life: Life; readonly x: number; readonly y: number }
    | { readonly type: 'placeCity'; readonly tech: Tech; readonly x: number; readonly y: number }
    | { readonly type: 'terraformer'; readonly tf: Terraformer; readonly x: number; readonly y: number }
    | { readonly type: 'event'; readonly kind: EventKind; readonly x: number; readonly y: number }
    | { readonly type: 'payHazard'; readonly kind: EventKind; readonly x: number; readonly y: number }
    | { readonly type: 'startHazard'; readonly kind: EventKind; readonly x: number; readonly y: number }
    | { readonly type: 'dabs'; readonly dabs: readonly number[] }
    | { readonly type: 'settle'; readonly tiles: readonly number[] }
    | { readonly type: 'dinoFate'; readonly choice: 'survive' | 'comet' }
    | { readonly type: 'comet' }
    | { readonly type: 'launch' }
    | { readonly type: 'load'; readonly doc: Record<string, unknown> }
    /** Nothing: answered once everything before it is. */
    | { readonly type: 'sync' }
    /** Exactly `n` ticks now, whatever the speed (tests, tools); fewer while the dinosaurs' fate holds the world. */
    | { readonly type: 'tick'; readonly n: number };

  export interface SimResult {
    readonly ok: boolean;
    /** Why it was refused, for the player ('' when there is nothing to say). */
    readonly reason?: string;
    /** What happened, for the player. */
    readonly text?: string;
    /** The disaster a command started, and what its show needs to play it (FxShow.begin). */
    readonly hazard?: number;
    readonly started?: { readonly id: number; readonly kind: EventKind; readonly x: number; readonly y: number; readonly strength?: number };
    readonly tone?: 'info' | 'ok';
    /** A save's summary, with its encoded text in `text`. */
    readonly meta?: SaveMeta;
  }

  const OK: SimResult = { ok: true };

  export class SimCore {
    readonly world = new WorldState();
    readonly params = new ModelParams();
    readonly geo = new GeoSystem();
    readonly climate = new ClimateSystem();
    readonly flora = new FloraSystem();
    readonly life = new LifeSystem();
    readonly evolution = new EvolutionSystem(this.life, this.flora);
    readonly civ = new CivSystem();
    readonly events = new EventSystem();
    readonly hazards = new HazardSystem();
    readonly atmo = new AtmosphereSystem();
    readonly history = new HistoryRecorder();
    readonly fauna = new FaunaDex();
    /** Model panels already paid for on this planet. */
    readonly paidModels = new Set<string>();
    readonly notes: SimNote[] = [];
    /** The game speed; 0 is paused (a paused world rebuilds the evolution statuses after a stroke). */
    speed = 0;
    /** A finished stroke's settling, a step at a time (beginSettle); always done before the next tick. */
    private settling: (() => void)[] = [];
    /** Disasters paid for and waiting for their omen to end ('kind|x|y'); startHazard needs and uses one up. */
    private hazardsPaid: string[] = [];

    constructor() {
      this.hazards.onStart = (h) => this.notes.push({ kind: 'hazard', id: h.id, event: h.kind, cause: h.cause, x: h.x, y: h.y });
    }

    /** Wire the late-bound sinks of this realm to this core: one live core per realm. */
    bind(): void {
      driftProbe = (y) => this.geo.plateVelocity(y);
      civEventSink = (kind, x, y) => this.events.trigger(this.world, kind, x, y);
      hazardSink = (kind, i, cause) => !!this.hazards.start(this.world, kind, i % GRID_W, Math.floor(i / GRID_W), cause);
    }

    /** Milliseconds per tick at `speed`: a burning fire holds the world at the slowest (its sound is as long as FIRE_MAX_TICKS). */
    tickMs(speed: number): number {
      return speed > 0 && this.world.hazards.list.some((h) => (h.fire?.burning.length ?? 0) > 0) ? SLOWEST_TICK_MS : SPEED_TICK_MS[speed];
    }

    /* =========================================================== tick === */

    /** One tick in the game's order; false while the dinosaurs' fate holds the world (dinoera.ts). */
    tick(): boolean {
      const w = this.world;
      const p = this.params;
      if (dinoEraHoldsTime(w)) return false;
      this.finishSettle();
      this.geo.step(w, p);
      this.events.step(w, p);
      this.hazards.step(w);
      // Rivers before the climate: their corridors are an input to it.
      RiverSystem.maybeRebuild(w);
      this.climate.step(w, p);
      this.flora.step(w, p);
      BiomeSystem.step(w);
      CoalSystem.step(w);
      OilSystem.step(w);
      this.life.stepLife(w, p, this.atmo); // also refreshes derived aggregates
      placeTermiteMound(w);
      placeKapok(w);
      this.fauna.step(w);
      this.evolution.step(w, p);
      this.civ.step(w, p, this.atmo);
      this.atmo.step(w, p);

      regenOmega(w);
      w.ticks++;
      w.absoluteYears += w.yearsPerTick;
      w.scaleYears += w.yearsPerTick;

      this.advanceTimeScale();
      this.history.sample(w);
      this.recordCiv();
      // First reef and first white beach: from the map's own derivation (reefs.ts), not from the simulation.
      for (const e of reefMilestones(w)) this.evolution.record(w, e);
      return true;
    }

    /**
     * The tick of the test harness (tests/helpers.js) and the probes, kept as
     * it always was: without disasters, the lexicon, the time scales and the
     * civilization's chronicle, and with termite mounds only if `termites`
     * (tools/headless.js never placed them). Their seeds are tuned to it.
     */
    harnessTick(termites = true): void {
      const w = this.world;
      const p = this.params;
      this.geo.step(w, p);
      this.events.step(w, p);
      RiverSystem.maybeRebuild(w);
      this.climate.step(w, p);
      this.flora.step(w, p);
      BiomeSystem.step(w);
      CoalSystem.step(w);
      OilSystem.step(w);
      this.life.stepLife(w, p, this.atmo);
      if (termites) {
        placeTermiteMound(w);
        placeKapok(w);
      }
      this.evolution.step(w, p);
      this.civ.step(w, p, this.atmo);
      this.atmo.step(w, p);
      regenOmega(w);
      w.ticks++;
      w.absoluteYears += w.yearsPerTick;
      w.scaleYears += w.yearsPerTick;
      this.history.sample(w);
    }

    /** Hand the civilization's news to the chronicle, or else to the player as a message. */
    civNews(): void {
      const w = this.world;
      for (const n of w.civ.news) {
        if (!n.chronicle) {
          this.notes.push({ kind: 'message', text: n.text, tone: n.tone, spaceport: n.space || undefined, at: n.at >= 0 ? n.at : undefined });
          continue;
        }
        this.evolution.record(w, {
          key: n.chronicle.key, kind: 'civ', title: n.chronicle.title, text: n.text, change: n.chronicle.change,
          icon: eventIcon(n.space ? 'spaceport' : 'civilization'), tick: w.ticks, years: w.absoluteYears, major: !!n.chronicle.major, at: n.at,
        });
      }
      w.civ.news.length = 0;
    }

    private recordCiv(): void {
      this.civNews();
      const civ = this.civ;
      if (!civ.lastKind) return;
      const w = this.world;
      if (civ.lastKind === 'sentience' && w.sentientClass !== Life.None) {
        this.evolution.record(w, {
          key: 'civ:sentience', kind: 'civ', title: 'Intelligenz erwacht',
          text: civ.lastNotice,
          change: 'Das Zeitalter der Zivilisation beginnt: Ein Zeitschritt umfasst nur noch 100 Jahre. Werden die Gruppen sesshaft, entstehen die ersten Dörfer.',
          icon: eventIcon('sentience'), tick: w.ticks, years: w.absoluteYears, major: true,
        });
      } else if (civ.lastKind === 'tech') {
        const t = civ.lastTech;
        this.evolution.record(w, {
          key: `civ:tech:${t}`, kind: 'civ', title: TECH_NAMES[t],
          text: civ.lastNotice,
          change: t === Tech.Industrial
            ? 'Fossile Energie setzt nun spürbar CO₂ frei. Den Energiemix steuerst du im Modell „Zivilisation“.'
            : t === Tech.Atomic ? 'Mit Atomwaffen wächst die Kriegsgefahr – Philosophie und Kunst dämpfen sie.'
              : 'Städte entwickeln sich weiter und verbrauchen mehr Energie.',
          icon: eventIcon('civilization'), tick: w.ticks, years: w.absoluteYears, major: false,
        });
      } else if (civ.lastKind === 'war') {
        this.notes.push({ kind: 'message', text: civ.lastNotice, tone: 'warn' });
      }
    }

    /** Move up a time scale as the planet reaches each milestone. */
    private advanceTimeScale(): void {
      const w = this.world;
      let next = w.timeScale;
      if (w.timeScale === TimeScale.Geologic && w.totalBiomass > 0) {
        next = TimeScale.Evolution;
      } else if (w.timeScale === TimeScale.Evolution && w.sentientClass !== Life.None) {
        next = TimeScale.Civilized;
      } else if (w.timeScale === TimeScale.Civilized) {
        let industrial = 0;
        for (let t = Tech.Industrial; t < TECH_COUNT; t++) industrial += w.techCounts[t];
        if (industrial > 0) next = TimeScale.Technology;
      }
      if (next !== w.timeScale) {
        w.timeScale = next;
        w.scaleYears = 0;
        this.evolution.record(w, {
          key: `timescale:${next}`, kind: 'milestone', title: `Zeitalter: ${TIMESCALE_NAMES[next]}`,
          text: next === TimeScale.Evolution ? 'Mit dem ersten Leben beginnt das Zeitalter der Evolution.'
            : next === TimeScale.Civilized ? 'Eine intelligente Art prägt nun den Planeten.'
              : 'Die Industrialisierung verändert Atmosphäre und Klima.',
          change: next === TimeScale.Evolution
            ? 'Die Zeit folgt dem Kalender der Erde: in der Urzeit große Schritte, ab dem Kambrium feine.'
            : `Ein Zeitschritt umfasst jetzt ${fmt.int(YEARS_PER_TICK[next])} Jahre.`,
          icon: eventIcon('timescale'), tick: w.ticks, years: w.absoluteYears, major: false,
        });
      }
    }

    /* ======================================================= planets === */

    newPlanet(seed: number, ocean: number, epoch: EpochId): void {
      this.fauna.reset();
      this.paidModels.clear();
      this.settling = [];
      this.hazardsPaid = [];
      this.world.reset(seed >>> 0, ocean, epoch);
      this.params.reset();
      applyEpochParams(this.params, epoch);
      this.geo.resetDrift();
      this.history.reset();
      this.evolution.pending.length = 0;
      this.notes.length = 0;
      this.evolution.refresh(this.world, this.params, true);
    }

    /** A save document (SaveSystem.decode) over this planet; on any failure the planet stays as it was. */
    load(doc: Record<string, unknown>): SimResult {
      const w = this.world;
      let notes: string[];
      try {
        notes = SaveSystem.load(doc, { world: w, params: this.params, geo: this.geo, history: this.history, fauna: this.fauna, paidModels: this.paidModels }, this.life, this.flora).notes;
      } catch (err) {
        return { ok: false, reason: err instanceof SaveIncompatible || err instanceof SaveCorrupt ? err.message : 'Der Spielstand ist unlesbar.' };
      }
      this.settling = [];
      this.hazardsPaid = [];
      // Cities, peoples and names are derived from the grid; a city carpet thins out here.
      this.civ.sync(w, this.params);
      w.refreshDerived();
      const civNote = w.civ.news.length > 0 ? w.civ.news[0].text : '';
      w.civ.news.length = 0;
      this.evolution.pending.length = 0;
      this.notes.length = 0;
      this.evolution.refresh(w, this.params, true);
      // Reefs and white beaches the planet already has are history, not news.
      for (const e of reefMilestones(w, true)) {
        w.evo.chronicle.push(e);
        w.evo.reported.add(e.key);
      }
      return { ok: true, text: notes.length > 0 ? notes[0] : civNote || 'Planet geladen.' };
    }

    /** The planet as a save document. */
    serialize(): Record<string, unknown> {
      return SaveSystem.serialize({ world: this.world, params: this.params, geo: this.geo, history: this.history, fauna: this.fauna, paidModels: this.paidModels });
    }

    /** The planet as a save's text (gzip where the platform can) and its summary; serialized now, between two ticks. */
    saveText(): Promise<SimResult> {
      const doc = this.serialize();
      return SaveSystem.encode(doc).then((text) => ({ ok: true, text, meta: SaveSystem.meta(doc) }));
    }

    /** A save's text over this planet; on any failure the planet stays as it was. */
    loadText(text: string): Promise<SimResult> {
      return SaveSystem.decode(text).then(
        (doc) => this.apply({ type: 'load', doc }),
        (err: unknown) => ({ ok: false, reason: err instanceof SaveIncompatible || err instanceof SaveCorrupt ? err.message : 'Der Spielstand ist unlesbar.' }),
      );
    }

    /* ====================================================== commands === */

    /** Why Ω cannot pay `cost` now, or ''. */
    spendProblem(cost: number): string {
      if (isDevMode()) return ''; // DEVMODE
      const w = this.world;
      return w.omega < cost ? `Zu wenig Energie – ${fmt.int(cost)} Ω benötigt, ${fmt.int(w.omega)} Ω vorhanden.` : '';
    }

    private spend(cost: number): void {
      if (isDevMode()) return; // DEVMODE
      this.world.omega -= cost;
    }

    /** After any edit: the derived state and the tree's statuses. */
    private afterEdit(): void {
      this.world.refreshDerived();
      this.evolution.refresh(this.world, this.params, true);
    }

    /**
     * Why `cmd` would be refused against the state now, or ''. The app asks
     * this of what it shows before sending; apply() asks again of the state
     * the command meets.
     */
    check(cmd: SimCommand): string {
      const w = this.world;
      switch (cmd.type) {
        case 'examine': return this.spendProblem(EXAMINE_COST);
        case 'model': return this.paidModels.has(cmd.id) ? '' : this.spendProblem(MODEL_PANEL_COST);
        case 'plant': return this.plantPlan(cmd).reason;
        case 'placeLife': return this.lifeProblem(cmd.life, cmd.x, cmd.y);
        case 'placeCity': return this.cityProblem(cmd.tech, cmd.x, cmd.y);
        case 'terraformer': return this.terraformerProblem(cmd.tf, cmd.x, cmd.y);
        case 'event': return this.spendProblem(EVENT_COST);
        case 'payHazard': return this.hazards.refusal(w, cmd.kind, cmd.x, cmd.y) || this.spendProblem(EVENT_COST);
        case 'launch': return spaceLaunchProblem(w);
        default: return '';
      }
    }

    apply(cmd: SimCommand): SimResult {
      const why = this.check(cmd);
      if (why) return { ok: false, reason: why };
      const w = this.world;
      switch (cmd.type) {
        case 'newPlanet':
          this.newPlanet(cmd.seed, cmd.ocean, cmd.epoch);
          return OK;
        case 'load':
          return this.load(cmd.doc);
        case 'sync':
          return OK;
        case 'tick':
          for (let k = 0; k < cmd.n; k++) if (!this.tick()) break;
          return OK;
        case 'speed':
          this.speed = cmd.speed;
          return OK;
        case 'devMode':
          devMode.on = cmd.on;
          return OK;
        case 'params':
          for (const [group, values] of Object.entries(this.params.groups())) {
            const v = cmd.groups[group];
            if (v) Object.assign(values, v);
          }
          return OK;
        case 'reported':
          w.evo.reported.add(cmd.key);
          return OK;
        case 'announced':
          this.fauna.markAnnounced(cmd.events);
          return OK;
        case 'examine':
          this.spend(EXAMINE_COST);
          return OK;
        case 'model':
          // Paid once per planet: closing it by accident must not cost again.
          if (!this.paidModels.has(cmd.id)) {
            this.spend(MODEL_PANEL_COST);
            this.paidModels.add(cmd.id);
          }
          return OK;
        case 'record':
          this.evolution.record(w, cmd.entry);
          return OK;
        case 'develop': {
          const res = this.evolution.develop(w, this.params, cmd.id);
          if (res.ok) this.afterEdit();
          return res.ok ? OK : { ok: false, reason: res.reason };
        }
        case 'plant':
          return this.plant(cmd);
        case 'placeLife': {
          const def = LIFE[cmd.life];
          this.spend(def.cost);
          LifeSystem.seed(w, cmd.life, cmd.x, cmd.y);
          this.afterEdit();
          return { ok: true, text: `${def.name} angesiedelt.` };
        }
        case 'placeCity':
          return this.placeCity(cmd.tech, cmd.x, cmd.y);
        case 'terraformer':
          return this.terraformer(cmd.tf, cmd.x, cmd.y);
        case 'event':
          this.spend(EVENT_COST);
          this.events.trigger(w, cmd.kind, cmd.x, cmd.y);
          if (w.terrainDirty) RiverSystem.rebuild(w);
          this.civ.sync(w, this.params);
          this.afterEdit();
          this.civNews();
          return { ok: true, text: `${EVENT_NAMES[cmd.kind]} ausgelöst.`, tone: 'info' };
        case 'payHazard':
          this.spend(EVENT_COST);
          this.hazardsPaid.push(`${cmd.kind}|${cmd.x}|${cmd.y}`);
          return OK;
        case 'startHazard': {
          // Only what was paid for starts, and only that is paid back.
          const paid = this.hazardsPaid.indexOf(`${cmd.kind}|${cmd.x}|${cmd.y}`);
          if (paid < 0) return { ok: false, reason: '' };
          this.hazardsPaid.splice(paid, 1);
          const h = this.hazards.start(w, cmd.kind, cmd.x, cmd.y, 'player');
          if (!h) {
            // The tile changed during the omen (another hazard took it): the energy comes back.
            w.omega = Math.min(omegaCap(w), w.omega + EVENT_COST);
            return { ok: false, reason: this.hazards.refusal(w, cmd.kind, cmd.x, cmd.y) || `${EVENT_NAMES[cmd.kind]} ist hier nicht mehr möglich.` };
          }
          if (w.terrainDirty) RiverSystem.rebuild(w);
          this.civ.sync(w, this.params);
          this.afterEdit();
          this.civNews();
          return { ok: true, hazard: h.id, started: { id: h.id, kind: h.kind, x: h.x, y: h.y, strength: h.strength } };
        }
        case 'dabs':
          return this.dabs(cmd.dabs);
        case 'settle':
          this.beginSettle(cmd.tiles);
          this.finishSettle();
          return OK;
        case 'dinoFate':
          return chooseDinoFate(w, this.evolution, cmd.choice) ? OK : { ok: false, reason: '' };
        case 'comet': {
          const h = applyComet(w, this.params, this.life, this.hazards, this.evolution);
          if (!h) return { ok: false, reason: '' };
          if (w.terrainDirty) RiverSystem.rebuild(w);
          this.civ.sync(w, this.params);
          this.fauna.step(w);
          this.afterEdit();
          this.civNews();
          return { ok: true, hazard: h.id, started: { id: h.id, kind: h.kind, x: h.x, y: h.y, strength: h.strength } };
        }
        case 'launch':
          if (!commitLaunch(w)) return { ok: false, reason: '' };
          this.evolution.record(w, {
            key: SPACE_KEY_LAUNCHED, kind: 'civ', title: 'Start in neue Welten',
            text: `Die Rakete der ${mindName(w)} hebt ab und lässt ihre Heimatwelt hinter sich.`,
            change: 'Terraforming auf Mars, Venus und weiteren Welten wird in der Vollversion verfügbar sein. Dein Planet bleibt spielbar.',
            icon: eventIcon('spaceport'), tick: w.ticks, years: w.absoluteYears, major: true, at: w.space.site,
          });
          // The closing dialog tells it: no card over the film.
          w.evo.reported.add(SPACE_KEY_LAUNCHED);
          return OK;
      }
    }

    /* ---- plants, life, cities, terraformers ---- */

    /** The tiles of a 5×5 plant stroke that it would change, or why none. */
    private plantPlan(cmd: { readonly flora: Flora; readonly clearing: boolean; readonly x: number; readonly y: number }): { reason: string; targets: number[] } {
      const w = this.world;
      this.flora.prepare(w, this.params, true);
      const tiles: number[] = [];
      for (let dy = -2; dy <= 2; dy++) {
        const y = cmd.y + dy;
        if (y < 0 || y >= GRID_H) continue;
        for (let dx = -2; dx <= 2; dx++) tiles.push(idx(wrapX(cmd.x + dx), y));
      }
      if (cmd.clearing) {
        const targets = tiles.filter((j) => !w.isWater(j) && (w.flora[j] !== 0 || w.vegetation[j] > 0));
        if (targets.length === 0) return { reason: 'Hier wächst nichts, was gerodet werden könnte.', targets };
        return { reason: this.spendProblem(BIOME_COST), targets };
      }
      const n = nodeForFlora(cmd.flora);
      if (!n || !(isDevMode() || w.evo.isDeveloped(n.id))) return { reason: 'Diese Pflanzengruppe ist noch nicht entwickelt.', targets: [] }; // DEVMODE
      const suitable = tiles.filter((j) => this.flora.suit(w, cmd.flora, j) >= 0.15);
      if (suitable.length === 0) {
        const why = this.flora.problem(w, cmd.flora, idx(cmd.x, cmd.y)) ?? 'die Bedingungen sind dort zu ungünstig';
        return { reason: `${n.name}: ${why}.`, targets: [] };
      }
      // Charge only for a stroke that adds something.
      const targets = suitable.filter((j) => this.flora.wouldPlant(w, cmd.flora, j, 0.7));
      if (targets.length === 0) return { reason: `${n.name} wachsen hier bereits so dicht, wie es der Standort erlaubt.`, targets };
      return { reason: this.spendProblem(BIOME_COST), targets };
    }

    private plant(cmd: { readonly flora: Flora; readonly clearing: boolean; readonly x: number; readonly y: number }): SimResult {
      const w = this.world;
      const { targets } = this.plantPlan(cmd);
      this.spend(BIOME_COST);
      if (cmd.clearing) {
        for (const j of targets) this.flora.clear(w, j);
        BiomeSystem.step(w, false);
        this.afterEdit();
        return OK;
      }
      let changed = 0;
      for (const j of targets) if (this.flora.plant(w, cmd.flora, j, 0.7)) changed++;
      BiomeSystem.step(w, false);
      this.afterEdit();
      return { ok: true, text: `${nodeForFlora(cmd.flora)!.name} auf ${changed} ${changed === 1 ? 'Feld' : 'Feldern'} angesiedelt.` };
    }

    private lifeProblem(c: Life, x: number, y: number): string {
      const w = this.world;
      const def = LIFE[c];
      const node = nodeForLife(c);
      const bar = dinoEraLifeBar(w, c);
      if (bar) return bar;
      if (!node || !(isDevMode() || w.evo.isDeveloped(node.id))) return `${def.name} sind noch nicht entwickelt – öffne den Evolutionsbaum.`; // DEVMODE
      const i = idx(x, y);
      const problem = this.life.habitabilityProblem(w, this.params, i, c);
      if (problem) return `${def.name} ${problem}.`;
      if (w.lifeDensity[lifeIdx(i, c)] >= LifeSystem.FOUNDER_DENSITY) return `${def.name} leben hier bereits.`;
      return this.spendProblem(def.cost);
    }

    private cityProblem(tech: Tech, x: number, y: number): string {
      const w = this.world;
      const i = idx(x, y);
      if (w.isWater(i)) return 'Städte brauchen festes Land.';
      // A city implies someone to live in it: a species that has woken up.
      // Waking one is the Monolith's job (civ.ts has the rule).
      const founder = w.sentientClass;
      if (founder === Life.None) return 'Städte brauchen eine intelligente Art. Erwecke eine mit dem Monolithen.';
      if (w.tech[i] >= tech && w.cityPop[i] >= 0.3) return 'Hier steht bereits eine solche Stadt.';
      // A shrunken city may be revived, but never knocked back to an older age (and charged for it).
      if (w.tech[i] > tech) return `Hier steht bereits eine weiter entwickelte Stadt (${TECH_NAMES[w.tech[i]]}).`;
      const problem = w.tech[i] !== Tech.None ? '' : citySiteProblem(w, i, founder);
      return problem || this.spendProblem(TECH_COST[tech]);
    }

    private placeCity(tech: Tech, x: number, y: number): SimResult {
      const w = this.world;
      const i = idx(x, y);
      const upgrade = w.tech[i] !== Tech.None;
      this.spend(TECH_COST[tech]);
      w.tech[i] = tech;
      w.cityPop[i] = Math.max(w.cityPop[i], 0.3);
      this.civ.sync(w, this.params);
      this.afterEdit();
      this.civNews();
      const name = w.civ.cityAt(i)?.name ?? 'Stadt';
      return { ok: true, text: upgrade ? `${name}: ${TECH_NAMES[tech]}.` : `${name} gegründet (${TECH_NAMES[tech]}).` };
    }

    /** Terraformers: every validity check before the charge. */
    private terraformerProblem(tf: Terraformer, x: number, y: number): string {
      const w = this.world;
      const i = idx(x, y);
      if (tf === Terraformer.Monolith) {
        if (w.isWater(i)) return 'Der Monolith braucht festes Land.';
        // One sentient species per world: the Monolith only awakens the first.
        if (w.sentientClass !== Life.None) return `${LIFE[w.sentientClass].name} sind bereits intelligent. Neue Städte gründest du mit dem Städte-Werkzeug.`;
        const resident = this.sentientResident(i);
        if (resident === Life.None) return 'Der Monolith braucht eine heimische Tiergruppe, die Intelligenz entwickeln kann – etwa Säugetiere, Reptilien, Insekten oder Vögel.';
        const site = citySiteProblem(w, i, resident);
        if (site) return site;
      }
      return this.spendProblem(TERRAFORMER_COST[tf]);
    }

    private terraformer(tf: Terraformer, x: number, y: number): SimResult {
      const w = this.world;
      const i = idx(x, y);
      this.spend(TERRAFORMER_COST[tf]);
      let text = '';
      switch (tf) {
        case Terraformer.OxygenGenerator:
          w.o2 = clamp(w.o2 + 1.5, 0, 40);
          text = 'Sauerstoff-Generator: +1,5 % Sauerstoff.';
          break;
        case Terraformer.CO2Generator:
          w.co2 = clamp(w.co2 + 120, 0, 5000);
          text = 'CO₂-Generator: +120 ppm CO₂.';
          break;
        case Terraformer.VaporGenerator:
          w.vapor = clamp(w.vapor + 0.08, 0, 1);
          for (let dy = -2; dy <= 2; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= GRID_H) continue;
            for (let dx = -2; dx <= 2; dx++) {
              const j = idx(wrapX(x + dx), yy);
              w.moisture[j] = clamp(w.moisture[j] + 0.4, 0, 1);
            }
          }
          text = 'Wasserdampf-Generator: mehr Feuchtigkeit.';
          break;
        case Terraformer.Monolith: {
          const species = this.sentientResident(i);
          this.civ.sync(w, this.params);
          w.sentientClass = species;
          spawnBands(w, i);
          this.civNews();
          text = `Monolith: ${mindName(w)} erlangen Intelligenz. Kleine Gruppen ziehen umher und schlagen Lager auf.`;
          break;
        }
      }
      this.afterEdit();
      return { ok: true, text };
    }

    /** The most abundant land class on a tile that can become sentient. */
    sentientResident(i: number): Life {
      const w = this.world;
      let best = Life.None;
      let bestD = 0;
      for (let c = 1; c < LIFE_COUNT; c++) {
        const def = LIFE[c as Life];
        if (!def.sentient || def.realm !== 'land') continue;
        const d = w.lifeDensity[i * LIFE_COUNT + c];
        if (d > bestD) { bestD = d; best = c as Life; }
      }
      return best;
    }

    /* ---- terraforming brush ---- */

    /** One frame of a held brush (terraformtool.ts recorded the dabs): pay for the elevation moved. */
    dabs(dabs: readonly number[]): SimResult {
      const w = this.world;
      if (isDevMode()) w.omega = omegaCap(w); // DEVMODE: the brush never runs dry
      if (w.omega < 1) return { ok: false, reason: '' };
      let moved = 0;
      for (let k = 0; k + 4 < dabs.length; k += 5) {
        moved += terraformDab(w, dabs[k], dabs[k + 1], { radius: dabs[k + 2], sign: dabs[k + 3] as 1 | -1 }, dabs[k + 4]).moved;
      }
      this.chargeDabs(moved);
      return OK;
    }

    /** Charge the brush's moved elevation. ponytail: the first dab of a stroke is paid after the fact (no rate known yet), so it can overdraw by one frame; clamped at 0. */
    chargeDabs(moved: number): void {
      const w = this.world;
      if (moved > 0) w.omega = Math.max(0, w.omega - moved * TERRAFORM_COST_PER_UNIT);
    }

    /** A stroke's slow consequences over the tiles it touched (terraformSettleSteps), then what any edit needs. */
    beginSettle(tiles: Iterable<number>): void {
      const w = this.world;
      this.finishSettle();
      this.settling = terraformSettleSteps(w, tiles);
      this.settling.push(
        () => { this.civ.sync(w, this.params); w.refreshDerived(); },
        () => {
          // While the world runs its tick rebuilds the statuses a few times a second anyway.
          if (this.speed === 0) this.evolution.refresh(w, this.params, true);
          this.civNews();
        },
      );
    }

    /** Run the next settle step; false once none is left. */
    settleStep(): boolean {
      const step = this.settling.shift();
      if (step) step();
      return this.settling.length > 0;
    }

    get settlePending(): boolean {
      return this.settling.length > 0;
    }

    finishSettle(): void {
      while (this.settleStep()) { /* all of it */ }
    }
  }
}
