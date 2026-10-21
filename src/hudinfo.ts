namespace SE {
  const nf3 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 });

  /**
   * One drop-down shared by the HUD chips that explain themselves (Ω, EP):
   * a click opens it under its chip, filled with what the planet earns now
   * and why; another click, a click elsewhere or Escape closes it.
   */
  export class HudInfo {
    readonly pop = make('section', 'hud-info glass');
    private chip: HTMLElement | null = null;
    private fill: ((pop: HTMLElement) => void) | null = null;
    private tip = '';

    constructor() {
      this.pop.id = 'hud-info';
      this.pop.hidden = true;
      // Placed inline, so a cached older stylesheet still shows it as an overlay.
      this.pop.style.position = 'fixed';
      document.body.appendChild(this.pop);
      document.addEventListener('pointerdown', (e) => {
        if (!this.chip || !(e.target instanceof Node)) return;
        if (!this.pop.contains(e.target) && !this.chip.contains(e.target)) this.close();
      });
    }

    get isOpen(): boolean { return this.chip !== null; }

    /** Makes `chip` open the drop-down, filled by `fill` on every refresh. */
    attach(chip: HTMLElement, fill: (pop: HTMLElement) => void): void {
      chip.setAttribute('role', 'button');
      chip.setAttribute('aria-controls', this.pop.id);
      chip.setAttribute('aria-expanded', 'false');
      chip.classList.add('hud-link');
      const toggle = (): void => { if (this.chip === chip) this.close(); else this.open(chip, fill); };
      chip.addEventListener('click', toggle);
      chip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    }

    close(): void {
      if (!this.chip) return;
      this.chip.setAttribute('aria-expanded', 'false');
      this.chip.dataset.tip = this.tip;
      this.chip = this.fill = null;
      this.pop.hidden = true;
    }

    /** Re-fill and re-place while open; runs with the HUD's own refresh. */
    refresh(): void {
      if (!this.chip || !this.fill) return;
      this.pop.replaceChildren();
      this.fill(this.pop);
      const r = this.chip.getBoundingClientRect();
      this.pop.style.top = `${Math.round(r.bottom + 8)}px`;
      this.pop.style.left = `${Math.round(Math.max(8, Math.min(r.left, innerWidth - this.pop.offsetWidth - 8)))}px`;
    }

    private open(chip: HTMLElement, fill: (pop: HTMLElement) => void): void {
      this.close();
      this.chip = chip;
      this.fill = fill;
      // The drop-down says more than the hover tip, which would cover it.
      this.tip = chip.dataset.tip ?? '';
      delete chip.dataset.tip;
      chip.setAttribute('aria-expanded', 'true');
      this.pop.hidden = false;
      this.refresh();
    }
  }

  function head(title: string, value: string): HTMLElement {
    const h = make('div', 'hud-info-head');
    h.append(make('h2', 'hud-info-title', title), make('span', 'hud-info-num', value));
    return h;
  }

  function row(label: string, value: string): HTMLElement {
    const r = make('div', 'hud-info-row');
    r.append(make('span', '', label), make('span', 'hud-info-num', value));
    return r;
  }

  /** Ω: income and cap of the planet's tier, and what the next tier asks for. */
  export function fillOmegaInfo(pop: HTMLElement, world: WorldState): void {
    const at = omegaStage(world);
    const s = OMEGA_STAGES[at];
    const pips = make('span', 'hud-info-pips');
    for (let i = 0; i < OMEGA_STAGES.length; i++) pips.appendChild(make('i', i <= at ? 'on' : ''));
    const stage = make('div', 'hud-info-row');
    stage.append(make('span', '', `Stufe ${at + 1} von ${OMEGA_STAGES.length} · ${s.name}`), pips);
    pop.append(
      head('Energie', `${fmt.int(world.omega)} / ${fmt.int(s.max)} Ω`),
      make('div', 'hud-info-rate hud-info-omega', `+${fmt.one(s.regen)} Ω je Zeitschritt`),
      stage,
    );
    const next = OMEGA_STAGES[at + 1];
    if (next) {
      pop.append(
        row(`Nächste: ${next.name}`, `+${fmt.one(next.regen)} Ω · bis ${fmt.int(next.max)}`),
        make('div', 'hud-info-note', next.unlock === 'city'
          ? 'Weg dorthin: Eine Art wird intelligent.'
          : `Weg dorthin: ${evoNode(next.unlock).name} entwickeln.`),
      );
    } else {
      pop.append(make('div', 'hud-info-note', 'Höchste Stufe erreicht.'));
    }
    pop.append(make('div', 'hud-info-note', world.omega >= s.max
      ? 'Speicher voll – was jetzt entsteht, verfällt.'
      : 'Energie entsteht nur, während die Zeit läuft.'));
  }

  /** EP: the parts of `epRate` – life, living groups, the evolution-speed slider. */
  export function fillEpInfo(pop: HTMLElement, world: WorldState, evo: EvolutionSystem, params: ModelParams): void {
    const d = evo.diversity(world);
    const m = mul(params.bio.evolutionRate);
    pop.append(head('Evolutionspunkte', `${fmt.int(world.evo.ep)} / ${fmt.int(EP_MAX)}`));
    if (d === 0) {
      pop.append(
        make('div', 'hud-info-rate hud-info-ep', 'Noch keine Punkte'),
        make('div', 'hud-info-note', 'EP entstehen aus der Vielfalt lebender Gruppen – sobald Leben auf dem Planeten ist.'),
      );
      return;
    }
    pop.append(
      make('div', 'hud-info-rate hud-info-ep', `+${fmt.two(evo.epRate(world, params))} EP je Zeitschritt`),
      row('Leben vorhanden', nf3.format(EP_BASE)),
      row(`${d} lebende ${d === 1 ? 'Gruppe' : 'Gruppen'} × ${nf3.format(EP_PER_GROUP)}`, nf3.format(EP_PER_GROUP * d)),
    );
    if (m !== 1) pop.append(row('Regler Evolutionstempo', `×${fmt.two(m)}`));
    pop.append(make('div', 'hud-info-note', world.evo.ep >= EP_MAX
      ? 'Voll – entwickle einen Schritt, sonst verfallen neue Punkte.'
      : `Jede weitere lebende Gruppe: +${nf3.format(EP_PER_GROUP * m)} EP. Ausgestorbene zählen nicht.`));
  }
}
