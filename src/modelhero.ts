/* =============================================================================
 * SimEarth 2.0 — model window scenes: biosphere, civilization, and the frame
 * -----------------------------------------------------------------------------
 * The biosphere shows its five levers side by side, each drawn as strongly as
 * it is set. The civilization shows what its sliders add up to: the energy
 * mix as a ring, the budget as bars, and the war risk the budget implies —
 * computed by the same rule the simulation uses (CivSystem.aggression).
 * ========================================================================== */

namespace SE {
  export type ModelKind = 'geo' | 'atmo' | 'bio' | 'civ';

  const n = (v: number): string => v.toFixed(1);

  /* ------------------------------------------------------------- biosphere -- */

  function bioScene(p: BioParams): string {
    const x0 = 8;
    const col = (SCENE_W - 2 * x0) / 5;
    const base = 128;
    let s = `<svg viewBox="0 0 ${SCENE_W} ${SCENE_H}" class="model-scene" role="img" aria-label="Die fünf Stellschrauben der Biosphäre">`;
    const caption = (k: number, text: string): string =>
      `<text x="${n(x0 + col * k + col / 2)}" y="${SCENE_H - 12}" class="scene-caption">${esc(text)}</text>`;
    s += `<path d="M8 ${base}H${SCENE_W - 8}" class="bio-ground"/>`;

    // Evolution: evolution points rising, more and higher the faster it runs.
    const sparks = 3 + Math.round(p.evolutionRate * 9);
    for (let k = 0; k < sparks; k++) {
      const x = 16 + ((k * 37) % 48);
      const y = base - 10 - ((k * 23) % 70) * (0.4 + p.evolutionRate * 0.6);
      s += `<circle cx="${x}" cy="${n(y)}" r="${n(2 + (k % 3))}" class="bio-ep" opacity="${n(0.45 + (k % 3) * 0.2)}"/>`;
    }
    s += `<path class="bio-arrow" d="M66 ${base - 8}V${n(base - 30 - p.evolutionRate * 60)}m-6 8l6 -8l6 8"/>`;
    s += caption(0, 'Evolution');

    // Mutation: a lineage splitting into more and more variants.
    const tips = 2 + Math.round(p.mutationRate * 5);
    const cx = x0 + col * 1.5;
    s += `<path class="bio-branch" d="M${cx} ${base}V${base - 34}"/>`;
    for (let k = 0; k < tips; k++) {
      const tx = cx - 28 + (56 * k) / Math.max(1, tips - 1);
      const ty = base - 70 - (k % 2) * 14;
      s += `<path class="bio-branch" d="M${cx} ${base - 34}Q${n(tx)} ${base - 40} ${n(tx)} ${ty}"/>`;
      s += `<circle cx="${n(tx)}" cy="${ty}" r="4.2" fill="${['#8ad16f', '#f2a35c', '#5ccfd0', '#b48cff', '#f6c453', '#ff7a6b', '#f29ad8'][k]}"/>`;
    }
    s += caption(1, 'Mutation');

    // Reproduction: a growth curve, steeper and higher with faster breeding.
    const gx = x0 + col * 2 + 8;
    const top = base - 30 - p.reproductionRate * 60;
    const knee = gx + 52 - p.reproductionRate * 26;
    s += `<path class="bio-curve" d="M${gx} ${base - 4}C${n(knee)} ${base - 4} ${n(knee - 10)} ${n(top)} ${gx + 60} ${n(top)}"/>`;
    for (let k = 0; k < 2 + Math.round(p.reproductionRate * 4); k++) {
      const x = gx + 6 + k * 10;
      s += `<path class="bio-sprout" d="M${x} ${base}v-7m0 3q-4 -1 -5 -5m5 3q4 -1 5 -5"/>`;
    }
    s += caption(2, 'Vermehrung');

    // Tolerance: how wide a band of temperatures life can stand.
    const bx = x0 + col * 3 + 8;
    const bw = col - 16;
    const width = bw * (0.25 + p.tolerance * 0.65);
    s += `<rect x="${bx}" y="${base - 58}" width="${bw}" height="12" fill="url(#bio-temp)"/>`;
    s += `<rect x="${n(bx + (bw - width) / 2)}" y="${base - 64}" width="${n(width)}" height="24" class="bio-band"/>`;
    s += `<text x="${bx}" y="${base - 26}" class="scene-small">kalt</text><text x="${bx + bw}" y="${base - 26}" class="scene-small end">heiß</text>`;
    s += caption(3, 'Toleranz');

    // CO₂ uptake: bubbles drawn into a leaf.
    const lx = x0 + col * 4 + col / 2;
    s += `<path class="bio-leaf" d="M${lx - 24} ${base - 12}C${lx - 24} ${base - 58} ${lx + 10} ${base - 72} ${lx + 26} ${base - 74}C${lx + 26} ${base - 40} ${lx + 6} ${base - 12} ${lx - 24} ${base - 12}Z"/>`;
    s += `<path class="bio-vein" d="M${lx - 24} ${base - 12}Q${lx} ${base - 40} ${lx + 24} ${base - 72}"/>`;
    const bubbles = 1 + Math.round(p.co2Absorption * 6);
    for (let k = 0; k < bubbles; k++) {
      s += `<circle cx="${n(lx - 30 + (k % 3) * 8 - k * 2)}" cy="${n(base - 80 - (k % 4) * 9 + k * 3)}" r="${n(2.4 + (k % 2) * 1.4)}" class="bio-co2"/>`;
    }
    s += caption(4, 'CO₂-Aufnahme');

    s += '<defs><linearGradient id="bio-temp"><stop offset="0" stop-color="#4c8fd6"/><stop offset="0.5" stop-color="#8ad16f"/><stop offset="1" stop-color="#ef6a4f"/></linearGradient></defs>';
    return `${s}</svg>`;
  }

  /* ---------------------------------------------------------- civilization -- */

  const MIX_COLORS: readonly string[] = ['#f6c453', '#4cb6d6', '#8f7d6a', '#b48cff'];
  const ALLOC_COLORS: readonly string[] = ['#8ad16f', '#ff7a6b', '#f29ad8', '#5ccfd0', '#b48cff', '#d9714f'];
  const ALLOC_SHORT: readonly string[] = ['Agrar', 'Medizin', 'Kultur', 'Wissen', 'Philos.', 'Militär'];

  function civScene(params: ModelParams): string {
    const mix = params.energyMix();
    const shares = [mix.solarWind, mix.hydroGeo, mix.fossilFuel, mix.nuclear];
    let s = `<svg viewBox="0 0 ${SCENE_W} ${SCENE_H}" class="model-scene" role="img" aria-label="Energiemix und Energieverwendung">`;

    // The energy mix as a ring, the fossil share in the middle.
    s += `<g transform="translate(14 14)">${donutSvg(shares.map((v, k) => ({ value: v, color: MIX_COLORS[k] })), 120, 0.2)}</g>`;
    s += `<text x="74" y="70" class="scene-big">${Math.round(mix.fossilFuel * 100)} %</text>`;
    s += '<text x="74" y="86" class="scene-small mid">fossil</text>';
    s += `<text x="74" y="${SCENE_H - 12}" class="scene-caption">Energiemix</text>`;

    // The budget, one bar per use.
    const alloc = params.civAlloc;
    const values = [alloc.agriculture, alloc.medicine, alloc.artMedia, alloc.science, alloc.philosophy, alloc.military];
    const x0 = 172;
    const step = (SCENE_W - x0 - 8) / values.length;
    const floor = 104;
    values.forEach((v, k) => {
      const h = 6 + v * 76;
      const x = x0 + k * step + step * 0.2;
      s += `<rect x="${n(x)}" y="${n(floor - 82)}" width="${n(step * 0.6)}" height="82" class="civ-slot"/>`;
      s += `<rect x="${n(x)}" y="${n(floor - h)}" width="${n(step * 0.6)}" height="${n(h)}" fill="${ALLOC_COLORS[k]}"/>`;
      s += `<text x="${n(x + step * 0.3)}" y="${floor + 14}" class="scene-small mid">${ALLOC_SHORT[k]}</text>`;
    });

    // What that budget means for peace.
    const aggression = CivSystem.aggression(params);
    const risk = clamp((aggression - CivSystem.PEACEFUL) / 1.2, 0, 1);
    const word = risk <= 0 ? 'keine' : risk < 0.34 ? 'gering' : risk < 0.67 ? 'erheblich' : 'hoch';
    const w = SCENE_W - x0 - 8;
    s += `<text x="${x0}" y="${SCENE_H - 26}" class="scene-small">Kriegsgefahr im Atomzeitalter: <tspan class="${risk > 0.33 ? 'warn' : ''}">${word}</tspan></text>`;
    s += `<rect x="${x0}" y="${SCENE_H - 18}" width="${n(w)}" height="7" class="civ-slot"/>`;
    if (risk > 0) s += `<rect x="${x0}" y="${SCENE_H - 18}" width="${n(Math.max(7, w * risk))}" height="7" fill="url(#civ-risk)"/>`;
    s += '<defs><linearGradient id="civ-risk"><stop offset="0" stop-color="#f6c453"/><stop offset="1" stop-color="#ff5a4a"/></linearGradient></defs>';
    return `${s}</svg>`;
  }

  /* ------------------------------------------------------------------ hero -- */

  /** The illustrated header of one model window; redraws only when it changes. */
  export class ModelHero {
    readonly el: HTMLElement;
    private last = '';

    constructor(private readonly kind: ModelKind, private readonly params: ModelParams, private readonly world: () => WorldState) {
      this.el = make('div', `model-hero model-hero-${kind}`);
    }

    render(): void {
      const p = this.params;
      const svg = this.kind === 'geo' ? geoScene(p.geo)
        : this.kind === 'atmo' ? atmoScene(p.atmo, this.world())
          : this.kind === 'bio' ? bioScene(p.bio)
            : civScene(p);
      if (svg === this.last) return;
      this.last = svg;
      this.el.innerHTML = svg;
    }
  }
}
