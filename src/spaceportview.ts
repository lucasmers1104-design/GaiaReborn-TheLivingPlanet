/* =============================================================================
 * SimEarth 2.0 — the space project window and the closing dialog
 * -----------------------------------------------------------------------------
 * The window "Raumfahrt" shows the launch site as the map draws it (the
 * phase's effect-atlas sprite on a dusk desert), the four phases, progress,
 * pace or the reason for a pause, and from the ready rocket on the big red
 * button "Start in neue Welten". The button is a request only: the app asks
 * spaceLaunchProblem again on the click, launches once and plays the film.
 * After the launch the window shows it as the end of the project.
 * `showLaunchFinale` is the dialog after the film. Built entirely in code;
 * css/spaceport.css styles it (without it everything still stacks and works).
 * ========================================================================== */

namespace SE {
  export interface SpaceportHooks {
    /** The player pressed the launch button (the app checks everything again). */
    launch(): void;
    /** Fly the map to the launch site. */
    locate(): void;
    reduceEffects(): boolean;
  }

  /** Art pixels of the window's picture, scaled up by ART_SCALE. */
  const ART_W = 112;
  const ART_H = 70;
  const ART_SCALE = 3;
  /** Dusk sky from the top down, and the sand from the dune crest down. */
  const SKY: readonly string[] = ['#1d1838', '#2e2350', '#4b2f63', '#7a3f62', '#b4585a', '#e08a5a', '#f2b56b'];
  const SAND: readonly string[] = ['#e0b47a', '#c99a62', '#a87c4c', '#86603a'];
  const PRESS_HOLD_MS = 2000;
  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((b) => (b + 0.5) / 16);

  const PAUSE_TEXT: Readonly<Record<SpacePause, string>> = {
    '': '',
    locked: 'Das Projekt beginnt, sobald die erste Stadt das Nanotech-Zeitalter erreicht.',
    noCity: 'Baupause: Es gibt keine bewohnte Nanotech-Stadt mehr. Der Bau geht weiter, sobald wieder eine besteht.',
    noSite: 'Baupause: Weder in einer Wüste noch auf offenem Land ist ein Bauplatz frei. Der Raumhafen sucht regelmäßig weiter.',
    launched: '',
  };

  export class SpaceportPanel {
    private readonly art: HTMLCanvasElement;
    private readonly phases: HTMLElement[] = [];
    private readonly bar: HTMLElement;
    private readonly percent: HTMLElement;
    private readonly status: HTMLElement;
    private readonly where: HTMLElement;
    private readonly locate: HTMLButtonElement;
    private readonly go: HTMLElement;
    private readonly launch: HTMLButtonElement;
    private readonly launchHint: HTMLElement;
    private readonly done: HTMLElement;
    private readonly doneText: HTMLElement;
    private drawn = '';
    /** Time of the press, until the world says what came of it (or a moment passed): the button stays off in between. */
    private pressedAt = -Infinity;

    constructor(host: HTMLElement, private readonly hooks: SpaceportHooks) {
      const root = make('div', 'spaceport');
      const hero = make('div', 'spaceport-hero');
      this.art = make('canvas', 'spaceport-art');
      this.art.width = ART_W * ART_SCALE;
      this.art.height = ART_H * ART_SCALE;
      this.art.setAttribute('role', 'img');
      hero.appendChild(this.art);

      const steps = make('ol', 'spaceport-phases');
      SPACE_PHASE_NAMES.forEach((name, k) => {
        const li = make('li', 'spaceport-phase');
        li.append(make('span', 'spaceport-phase-num', String(k + 1)), make('span', 'spaceport-phase-name', name));
        steps.appendChild(li);
        this.phases.push(li);
      });

      const progress = make('div', 'spaceport-progress');
      const head = make('div', 'spaceport-progress-head');
      this.percent = make('span', 'spaceport-percent');
      head.append(make('span', undefined, 'Baufortschritt'), this.percent);
      const track = make('div', 'spaceport-track');
      track.setAttribute('role', 'progressbar');
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', '100');
      this.bar = make('div', 'spaceport-bar');
      track.appendChild(this.bar);
      progress.append(head, track);

      this.status = make('p', 'spaceport-status');
      this.status.setAttribute('aria-live', 'polite');
      const site = make('div', 'spaceport-site');
      this.where = make('span', 'spaceport-where');
      this.locate = button({ label: 'Auf der Karte zeigen', icon: uiIcon('target'), cls: 'btn btn-small btn-ghost', onClick: () => this.hooks.locate() });
      site.append(this.where, this.locate);

      this.go = make('div', 'spaceport-go');
      this.launch = button({ label: 'Start in neue Welten', cls: 'btn launch-btn', onClick: () => this.press() });
      this.launchHint = make('p', 'spaceport-go-hint');
      this.go.append(this.launch, this.launchHint);

      this.done = make('div', 'spaceport-done');
      this.doneText = make('p', 'spaceport-done-text');
      this.done.append(img(eventIcon('spaceport'), 'spaceport-done-icon'), make('h3', 'spaceport-done-title', 'Die Reise geht weiter'), this.doneText);

      root.append(hero, steps, progress, this.status, site, this.go, this.done);
      host.appendChild(root);
    }

    private press(): void {
      if (this.launch.disabled) return;
      this.pressedAt = performance.now();
      this.launch.disabled = true;
      this.hooks.launch();
    }

    /** About ten times a second while the window is open. */
    update(world: WorldState): void {
      const s = world.space;
      const pause = spacePause(world);
      const phase = spacePhase(s.progress);
      const launched = s.launched >= 0;
      this.drawArt(world);

      this.phases.forEach((li, k) => {
        const reached = s.unlocked >= 0 && (launched || k < phase || (k === phase && phase === SpacePhase.Ready));
        li.classList.toggle('done', reached);
        li.classList.toggle('now', s.unlocked >= 0 && !reached && k === phase);
      });
      const pct = Math.floor(s.progress * 100);
      this.percent.textContent = `${pct} %`;
      this.bar.style.width = `${s.progress * 100}%`;
      this.bar.parentElement?.setAttribute('aria-valuenow', String(pct));
      this.bar.classList.toggle('paused', pause !== '' && !launched);

      this.status.textContent = this.statusText(world, pause);
      this.status.classList.toggle('warn', pause === 'noCity' || pause === 'noSite');
      const site = s.site;
      this.where.textContent = site >= 0 ? `Standort: ${LANDSCAPE_NAMES[world.landscape[site]]}, Feld ${site % GRID_W} / ${Math.floor(site / GRID_W)}` : 'Noch kein Standort';
      this.locate.hidden = site < 0;

      const problem = spaceLaunchProblem(world);
      // Until the world answers a press (launched, refused, or nothing came of it) the button stays off: no second launch.
      const pressed = !launched && problem === '' && performance.now() - this.pressedAt < PRESS_HOLD_MS;
      this.launch.disabled = pressed || problem !== '';
      this.launch.classList.toggle('ready', problem === '');
      this.launch.classList.toggle('still', this.hooks.reduceEffects());
      this.go.hidden = launched;
      this.launchHint.textContent = problem === '' ? 'Die Rakete startet erst auf deinen Klick. Du kannst auch später starten.' : problem;

      this.done.hidden = !launched;
      if (launched) {
        this.doneText.textContent = `Startdatum: ${formatEarthDate(s.launchedYears)}. Deine Zivilisation hat ihre Heimatwelt verlassen. ` +
          'Terraforming auf Mars, Venus und weiteren Welten wird in der Vollversion verfügbar sein.';
      }
    }

    private statusText(world: WorldState, pause: SpacePause): string {
      const s = world.space;
      if (s.launched >= 0) return 'Projekt abgeschlossen: Die Rakete ist zu neuen Welten aufgebrochen.';
      if (pause !== '') return PAUSE_TEXT[pause];
      if (s.progress >= 1) return 'Die Rakete steht startbereit auf der Rampe und wartet auf deinen Befehl.';
      const cities = nanotechCities(world);
      const left = spaceTicksLeft(world);
      return `Der Bau läuft mit ${fmt.int(spaceRate(world, cities) * 100)} % Tempo (${cities.length} ${cities.length === 1 ? 'Nanotech-Stadt' : 'Nanotech-Städte'}). ` +
        `Noch etwa ${fmt.int(left)} Zeitschritte.`;
    }

    /** The site as the map draws it, on a dusk desert; redrawn only when its picture changes. */
    private drawArt(world: WorldState): void {
      const s = world.space;
      const fx = FxArt.shared();
      const id = s.unlocked >= 0 && s.site >= 0 ? spaceportSprite(s) : '';
      const sp = id ? FX_MANIFEST.sprites[id] : undefined;
      const still = this.hooks.reduceEffects() || !sp || sp.fps <= 0;
      const frame = sp && !still ? Math.floor((performance.now() / 1000) * sp.fps) % sp.frames.length : 0;
      const key = `${id}|${frame}|${fx.ready}`;
      if (key === this.drawn) return;
      this.drawn = key;
      this.art.setAttribute('aria-label', id ? `Raumhafen: ${s.launched >= 0 ? 'leere Startrampe nach dem Start' : SPACE_PHASE_NAMES[spacePhase(s.progress)]}` : 'Noch kein Raumhafen');
      const ctx = this.art.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(ART_SCALE, 0, 0, ART_SCALE, 0, 0);
      ctx.imageSmoothingEnabled = false;
      const horizon = 52;
      // Dusk sky in dithered bands, a few stars high up, then the dunes.
      for (let y = 0; y < horizon; y++) {
        const t = (y / horizon) * (SKY.length - 1);
        const k = Math.floor(t);
        for (let x = 0; x < ART_W; x++) {
          const up = t - k > BAYER4[(y & 3) * 4 + (x & 3)] ? 1 : 0;
          ctx.fillStyle = SKY[Math.min(SKY.length - 1, k + up)];
          ctx.fillRect(x, y, 1, 1);
        }
      }
      ctx.fillStyle = '#f6f1df';
      for (const [x, y] of [[9, 6], [27, 13], [44, 4], [70, 9], [88, 15], [103, 5], [58, 19]]) ctx.fillRect(x, y, 1, 1);
      for (let x = 0; x < ART_W; x++) {
        const crest = horizon - 3 + Math.round(2.4 * Math.sin(x / 13) + 1.2 * Math.sin(x / 5.3 + 1));
        for (let y = crest; y < ART_H; y++) {
          const depth = (y - crest) / (ART_H - crest);
          const k = clamp(Math.floor(depth * SAND.length + BAYER4[(y & 3) * 4 + (x & 3)] - 0.5), 0, SAND.length - 1);
          ctx.fillStyle = y === crest ? SAND[0] : SAND[k];
          ctx.fillRect(x, y, 1, 1);
        }
      }
      if (!sp || !fx.ready) {
        if (!fx.ready) fx.load();
        return;
      }
      const src = fx.frame(id, frame, 1);
      if (!src) return;
      const pad = (src.width - sp.w) / 2;
      ctx.drawImage(src, Math.round(ART_W / 2 - sp.ax - pad), ART_H - 6 - sp.ay - pad);
    }
  }

  /**
   * The dialog after the launch film: what the launch means and the two ways
   * on. Only a choice closes it — a second click or key press that skipped
   * the film must not throw the ending away. Resolves with 'menu' for
   * "Zum Hauptmenü", else 'continue'.
   */
  export async function showLaunchFinale(): Promise<'continue' | 'menu'> {
    const body = make('div', 'launch-finale');
    body.appendChild(img(eventIcon('spaceport'), 'launch-finale-badge'));
    body.appendChild(make('p', 'launch-finale-lead', 'Deine Zivilisation hat ihre Heimatwelt verlassen.\nNeue Welten warten darauf, zum Leben erweckt zu werden.'));
    const worlds = make('div', 'launch-finale-worlds');
    for (const [cls, name] of [['mars', 'Mars'], ['venus', 'Venus'], ['more', 'weitere Welten']]) {
      const w = make('span', `launch-finale-world ${cls}`);
      w.append(make('span', 'launch-finale-disc'), make('span', 'launch-finale-name', name));
      worlds.appendChild(w);
    }
    body.appendChild(worlds);
    body.appendChild(make('p', 'launch-finale-note', 'Terraforming auf Mars, Venus und weiteren Welten\nwird in der Vollversion verfügbar sein.'));
    const value = await Modal.show({
      title: 'Die Reise geht weiter', icon: eventIcon('spaceport'), body, cls: 'launch-finale-modal', mandatory: true,
      actions: [
        { label: 'Zum Hauptmenü', value: 'menu', kind: 'ghost' },
        { label: 'Auf meinem Planeten weiterspielen', value: 'continue', kind: 'primary' },
      ],
    });
    return value === 'menu' ? 'menu' : 'continue';
  }
}
