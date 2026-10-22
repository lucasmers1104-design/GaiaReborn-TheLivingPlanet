/* =============================================================================
 * SimEarth 2.0 — title screen
 * -----------------------------------------------------------------------------
 * The first thing the player sees: their freshly formed planet turning in
 * space, the name of the game, and the ways in — continue the last world,
 * start this one (the Earth or a random planet, see titleplanet.ts), the
 * saves and the settings. The simulation stays paused until the player
 * chooses. Decoration lives in titledecor.ts.
 * ========================================================================== */

namespace SE {
  export interface TitleHooks {
    world(): WorldState;
    /** The waiting planet's seed (the world may still be on its way from the simulation worker). */
    seed(): number;
    /** The automatic save to offer, if there is one. */
    readonly autosave: SaveMeta | null;
    /** Load the automatic save; true on success. */
    continueGame(): Promise<boolean>;
    /** Replace the waiting planet with a new one. */
    reroll(): void;
    /** Remake the waiting planet from an earlier seed. */
    remake(seed: number): void;
    /** Sea share new planets are made with, 0..1. */
    readonly oceanShare: number;
    /** Remake the waiting planet from its own seed with another sea share. */
    reshape(oceanShare: number): void;
    /** The planet new games start on. */
    readonly epoch: EpochId;
    /** Remake the waiting planet as another epoch's. */
    chooseEpoch(id: EpochId): void;
    /** The Saves dialog; true if a planet was loaded from it. */
    openSaves(): Promise<boolean>;
    openSettings(): Promise<void>;
    /** "Effekte reduzieren": the globe stands still and nothing twinkles. */
    reduceEffects(): boolean;
    /** The title is gone: start playing; `fresh` after "Spiel starten", not after loading a save. */
    start(fresh: boolean): void;
  }

  /** Radians the title globe turns per frame drawn. */
  const SPIN_STEP = 0.004;
  const FRAME_MS = 33;
  /** A still globe is only redrawn this often, to follow a resized window. */
  const STILL_MS = 500;
  /**
   * Remaking a planet takes about 30 ms, so a dragged sea slider remakes it at
   * most this often; the share it ends on is always applied.
   */
  const RESHAPE_MS = 90;

  const LEAD = 'Forme eine lebendige Welt. Lasse aus den ersten Zellen einen Planeten erwachen. Entwickle Klima, Ozeane, Pflanzen und Tiere – und erlebe, wie aus einer Welt eine Zivilisation entstehen kann.';

  /** A title button: icon, label and the chevron of the design. */
  function titleButton(label: string, icon: string, cls: string, onClick: () => void): HTMLButtonElement {
    const b = button({ label, icon: uiIcon(icon), cls: `btn title-btn ${cls}`, onClick });
    b.appendChild(img(uiIcon('chevron-right'), 'ico title-btn-go'));
    return b;
  }

  export class TitleScreen {
    private readonly root: HTMLElement;
    private readonly canvas: HTMLCanvasElement;
    private globe: TitleGlobe;
    private last = 0;
    private closed = false;
    private still = false;
    /** The globe must be drawn on the next frame, even when it stands still. */
    private dirty = true;
    private reshapeTimer = 0;
    private pendingShare = 0;

    constructor(host: HTMLElement, private readonly hooks: TitleHooks) {
      this.root = make('div', 'title-screen');
      this.root.setAttribute('role', 'dialog');
      this.root.setAttribute('aria-modal', 'true');
      this.root.setAttribute('aria-labelledby', 'title-name');

      const stage = make('div', 'title-globe');
      this.canvas = make('canvas', 'title-globe-canvas');
      this.canvas.setAttribute('aria-hidden', 'true');
      const [orbits, ...moons] = globeOrbits();
      stage.append(orbits, this.canvas, ...moons);
      this.globe = this.makeGlobe();
      const space = make('div', 'title-space');
      space.append(stage, titleInfoCard(), titleQuote());

      const name = make('h1', 'title-name');
      name.id = 'title-name';
      name.append(make('span', 'title-word', 'SimEarth'), make('span', 'title-two', '2'));
      const logo = make('div', 'title-logo');
      logo.append(logoOrbit(), name, make('p', 'title-tag', 'Der lebende Planet'));

      const resume = hooks.autosave ? this.continueCard(hooks.autosave) : null;
      const planet = buildTitlePlanet({
        epoch: hooks.epoch,
        oceanShare: hooks.oceanShare,
        seed: () => hooks.seed(),
        chooseEpoch: (id) => this.chooseEpoch(id),
        reshape: (share) => this.reshape(share),
        reroll: () => this.reroll(),
        remake: (seed) => this.remake(seed),
      });
      const start = titleButton('Spiel starten', 'play', 'title-start', () => this.begin());
      // The planet choice heads "Planet anpassen" as two tabs; the menu keeps
      // only actions: the way in, then saves and settings beside each other.
      const modes = make('div', 'title-modes');
      modes.setAttribute('role', 'group');
      modes.setAttribute('aria-label', 'Planet');
      modes.append(planet.earth, planet.random);
      planet.panel.querySelector('.title-custom-head')?.after(modes);
      const buttons = make('div', 'title-buttons');
      buttons.append(
        start,
        titleButton('Spielstände …', 'slot', 'title-saves', () => void this.saves()),
        titleButton('Einstellungen', 'menu-options', 'title-settings', () => void hooks.openSettings()),
      );
      if (DEV_MODE_AVAILABLE) buttons.appendChild(devModeToggle()); // DEVMODE

      const panel = make('div', 'title-panel');
      panel.append(logo, make('p', 'title-lead', LEAD));
      if (resume) panel.appendChild(resume);
      panel.append(buttons, planet.panel);

      const foot = make('footer', 'title-foot');
      foot.appendChild(make('p', 'title-motto', 'Kleine Anfänge. Große Welten.'));

      const frame = make('div', 'title-frame');
      frame.append(titleSky(), titleHud(), panel, space, foot);
      this.root.appendChild(frame);
      host.appendChild(this.root);
      // The game behind stays out of reach of Tab and screen readers; the
      // dialog layer does not, because Saves and Settings open from here.
      this.setBackgroundInert(true);
      window.requestAnimationFrame(this.loop);
      (resume ?? start).focus({ preventScroll: true });
    }

    private makeGlobe(): TitleGlobe {
      return new TitleGlobe(this.canvas);
    }

    private continueCard(meta: SaveMeta): HTMLElement {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'title-continue';
      const text = make('div', 'title-continue-text');
      text.append(make('span', 'title-continue-kicker', 'Weiterspielen'), ...saveSummary(meta));
      b.append(saveThumb(meta, true), text, img(uiIcon('chevron-right'), 'ico title-continue-go'));
      b.addEventListener('click', () => void this.continueGame());
      return b;
    }

    private async continueGame(): Promise<void> {
      if (await this.hooks.continueGame()) this.close();
    }

    private async saves(): Promise<void> {
      if (await this.hooks.openSaves()) this.close();
    }

    private reshape(share: number): void {
      this.pendingShare = share;
      if (this.reshapeTimer) return;
      this.reshapeTimer = window.setTimeout(() => {
        this.reshapeTimer = 0;
        if (this.closed) return;
        this.hooks.reshape(this.pendingShare);
        this.dirty = true;
      }, RESHAPE_MS);
    }

    /** Apply a sea share still waiting out the throttle, so it is not lost. */
    private flushReshape(): void {
      if (!this.reshapeTimer) return;
      window.clearTimeout(this.reshapeTimer);
      this.reshapeTimer = 0;
      this.hooks.reshape(this.pendingShare);
    }

    private begin(): void {
      this.flushReshape();
      this.close(true);
    }

    private reroll(): void {
      this.flushReshape();
      this.hooks.reroll();
      this.renewGlobe();
    }

    private remake(seed: number): void {
      this.flushReshape();
      this.hooks.remake(seed);
      this.renewGlobe();
    }

    private chooseEpoch(id: EpochId): void {
      this.flushReshape();
      this.hooks.chooseEpoch(id);
      this.renewGlobe();
    }

    /** A fresh view for a new planet: the old one caches the previous terrain. */
    private renewGlobe(): void {
      const spin = this.globe.spin;
      this.globe = this.makeGlobe();
      this.globe.spin = spin;
      this.dirty = true;
    }

    private loop = (now: number): void => {
      if (this.closed) return;
      const still = this.hooks.reduceEffects();
      if (still !== this.still) {
        this.still = still;
        this.root.classList.toggle('title-still', still);
      }
      if (this.dirty || now - this.last >= (still ? STILL_MS : FRAME_MS)) {
        this.last = now;
        this.dirty = false;
        if (!still) this.globe.spin += SPIN_STEP;
        this.globe.render(this.hooks.world());
      }
      window.requestAnimationFrame(this.loop);
    };

    private setBackgroundInert(on: boolean): void {
      document.querySelectorAll<HTMLElement>('#topbar, #desktop').forEach((el) => { el.inert = on; });
    }

    close(fresh = false): void {
      if (this.closed) return;
      this.closed = true;
      // A loaded save must not be overwritten by a slider move still pending.
      window.clearTimeout(this.reshapeTimer);
      this.setBackgroundInert(false);
      this.root.classList.add('leaving');
      window.setTimeout(() => this.root.remove(), 480);
      this.hooks.start(fresh);
    }
  }
}
