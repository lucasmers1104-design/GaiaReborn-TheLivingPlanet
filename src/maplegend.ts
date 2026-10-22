/* =============================================================================
 * SimEarth 2.0 — legend of the overview map
 * -----------------------------------------------------------------------------
 * Continuous maps (height, temperature, rain) get a gradient strip with its
 * ends named; habitats, life and eras get icons that switch each category on
 * and off, the other categorical ones (currents, drift) swatches. "Werte"
 * swaps the legend for the planet's headline figures.
 * ========================================================================== */

namespace SE {
  function swatch(host: HTMLElement, label: string, color: Rgb): void {
    const row = make('div', 'legend-line');
    const sw = make('span', 'legend-swatch');
    sw.style.background = rgbCss(color);
    row.append(sw, make('span', undefined, label));
    host.appendChild(row);
  }

  /** A colour scale sampled from `color` between two values, labelled below. */
  function strip(host: HTMLElement, from: number, to: number, color: (v: number) => Rgb, labels: readonly string[]): void {
    const box = make('div', 'legend-strip');
    const bar = make('div', 'legend-strip-bar');
    const stops: string[] = [];
    for (let k = 0; k <= 12; k++) stops.push(`${rgbCss(color(lerp(from, to, k / 12)))} ${Math.round((k / 12) * 100)}%`);
    bar.style.background = `linear-gradient(90deg, ${stops.join(', ')})`;
    const marks = make('div', 'legend-strip-labels');
    for (const l of labels) marks.appendChild(make('span', undefined, l));
    box.append(bar, marks);
    host.appendChild(box);
  }

  interface LegendToggle {
    readonly bit: number;
    readonly icon: string;
    readonly name: string;
    readonly color: Rgb;
    readonly detail: string;
  }

  /**
   * One small icon per category; a click shows or hides it on the map. Rebuilt
   * only when the set changes, so the periodic refresh keeps the button under
   * the pointer and its tooltip alive.
   */
  function toggles(host: HTMLElement, mode: MapMode, items: readonly LegendToggle[], hidden: number, onToggle: (bit: number) => void): void {
    const key = `${mode}:${items.map(t => t.bit).join(',')}`;
    if (host.dataset.toggles !== key) {
      host.innerHTML = '';
      host.dataset.toggles = key;
      host.classList.add('legend-icons');
      for (const t of items) {
        const b = button({ label: t.name, icon: t.icon, cls: 'icon-btn legend-toggle', showLabel: false, onClick: () => onToggle(t.bit) });
        b.style.setProperty('--swatch', rgbCss(t.color));
        host.appendChild(b);
      }
    }
    items.forEach((t, k) => {
      const b = host.children[k] as HTMLElement;
      const off = (hidden & (1 << t.bit)) !== 0;
      b.classList.toggle('off', off);
      b.setAttribute('aria-pressed', off ? 'false' : 'true');
      b.title = `${t.name}\n${t.detail}\nKlicken: ${off ? 'einblenden' : 'ausblenden'}`;
    });
  }

  /** Up to three names whose score reaches 0.75, best first. */
  function bestFits<T>(items: readonly T[], score: (t: T) => number, name: (t: T) => string): string {
    return items.filter(t => score(t) >= 0.75).sort((a, b) => score(b) - score(a)).slice(0, 3).map(name).join(', ');
  }

  function biomeToggles(world: WorldState): LegendToggle[] {
    const living: Life[] = [];
    for (let c = 1; c < LIFE_COUNT; c++) if (world.lifeCounts[c] > 0) living.push(c);
    const out: LegendToggle[] = [];
    for (let b = 0; b < BIOME_COUNT; b++) {
      if (world.biomeCounts[b] === 0) continue;
      const fits = bestFits(living, c => LIFE[c].suit[b], c => LIFE[c].name);
      out.push({
        bit: b, icon: habitatAsset(BIOME_ICONS[b]), name: BIOME_NAMES[b], color: BIOME_COLORS[b],
        detail: `${fmt.pct(world.biomeCounts[b] / TILE_COUNT)} der Oberfläche` + (fits ? `\nAm besten angepasst: ${fits}` : ''),
      });
    }
    return out;
  }

  function lifeToggles(world: WorldState): LegendToggle[] {
    const out: LegendToggle[] = [];
    for (let c = 1; c < LIFE_COUNT; c++) {
      if (world.lifeCounts[c] === 0) continue;
      const def = LIFE[c as Life];
      const home = bestFits(def.suit.map((_, b) => b), b => def.suit[b], b => BIOME_NAMES[b]);
      out.push({
        bit: c, icon: evoIcon(def.id), name: def.name, color: def.color,
        detail: `${def.realm === 'sea' ? 'Meer' : 'Land'} · ${fmt.pct(world.lifeCounts[c] / TILE_COUNT)} der Oberfläche besiedelt` +
          `\nVerträgt ${fmt.int(def.temp[0]).replace('-', '−')} bis ${fmt.int(def.temp[1])} °C` + (home ? `\nZu Hause: ${home}` : ''),
      });
    }
    out.sort((a, b) => world.lifeFirstSeen[a.bit] - world.lifeFirstSeen[b.bit]);
    out.push({
      bit: 0, icon: evoIcon(FLORA[Flora.LandPlants].id), name: 'Pflanzen ohne Tiere', color: [70, 110, 60],
      detail: 'Wo kein Tier lebt, zeigt die Karte blass die häufigste Pflanzengruppe.',
    });
    return out;
  }

  function techToggles(world: WorldState): LegendToggle[] {
    const count = new Array<number>(TECH_COUNT).fill(0);
    const largest = new Array<number>(TECH_COUNT).fill(-1);
    for (let i = 0; i < TILE_COUNT; i++) {
      const t = world.tech[i];
      if (t === Tech.None) continue;
      count[t]++;
      if (largest[t] < 0 || world.cityPop[i] > world.cityPop[largest[t]]) largest[t] = i;
    }
    const out: LegendToggle[] = [];
    for (let t = 1; t < TECH_COUNT; t++) {
      if (count[t] === 0) continue;
      const big = world.civ.cityAt(largest[t]);
      out.push({
        bit: t, icon: eventIcon(TECH_ICONS[t]), name: TECH_NAMES[t], color: TECH_COLORS[t],
        detail: (count[t] === 1 ? 'Eine Siedlung' : `${fmt.int(count[t])} Siedlungen`) +
          (big ? `\nGrößte: ${big.name} (${CITY_SIZE_NAMES[citySize(world.cityPop[largest[t]])]})` : ''),
      });
    }
    return out;
  }

  /** "−3.500 m": an elevation as a legend mark, to 10 m. */
  function metersLabel(elevation: number): string {
    return `${fmt.int(Math.round(elevationMeters(elevation) / 10) * 10).replace('-', '−')} m`;
  }

  export function renderMapLegend(host: HTMLElement, world: WorldState, mode: MapMode, values: boolean,
    hidden = 0, onToggle: (bit: number) => void = () => {}): void {
    const items = values ? [] : mode === MapMode.Biomes ? biomeToggles(world) : mode === MapMode.LifeMap ? lifeToggles(world)
      : mode === MapMode.Technology ? techToggles(world) : [];
    if (items.length > 0) {
      toggles(host, mode, items, hidden, onToggle);
      return;
    }
    delete host.dataset.toggles;
    host.classList.remove('legend-icons');
    host.innerHTML = '';
    if (values) {
      const stats: [string, string][] = [
        [resIcon('temperature'), `${fmt.one(world.globalTemp)} °C`],
        [resIcon('co2'), `${fmt.int(world.co2)} ppm CO₂`],
        [resIcon('oxygen'), `${fmt.one(world.o2)} % O₂ Luft`],
        [uiIcon('layer-oceans'), `${fmt.int(world.oceanO2)} % O₂ Meer`],
        [resIcon('biomass'), `${fmt.pct(world.lifeCover)} belebt`],
      ];
      for (const [icon, s] of stats) {
        const row = make('div', 'legend-line');
        row.append(img(icon, 'ico'), make('span', undefined, s));
        host.appendChild(row);
      }
      return;
    }
    switch (mode) {
      case MapMode.Terrain:
        strip(host, -1, 1, (v) => sampleRamp(v < 0 ? DEPTH_RAMP : ELEV_RAMP, v), [-1, 0, 1].map(metersLabel));
        swatch(host, 'Flüsse', RIVER_MAP_COLOR);
        break;
      case MapMode.Oceans:
        // Open sea and coastal sea get half the strip each, so the middle label sits on the shelf edge.
        strip(host, 0, 1, (v) => sampleRamp(DEPTH_RAMP, v < 0.5 ? lerp(-1, COAST_DEPTH, v * 2) : lerp(COAST_DEPTH, 0, v * 2 - 1)),
          [-1, COAST_DEPTH, 0].map(metersLabel));
        swatch(host, 'Land', SEAFLOOR_LAND_COLOR);
        swatch(host, 'Flüsse', RIVER_MAP_COLOR);
        break;
      case MapMode.Technology:
        host.appendChild(make('span', 'legend-line', 'Noch keine Städte'));
        break;
      case MapMode.AirTemp:
      case MapMode.OceanTemp:
        // Each arm of the diverging ramp gets half the strip, so the middle
        // label sits on the neutral midpoint.
        strip(host, 0, 1, (v) => sampleRamp(TEMP_RAMP, v < 0.5 ? lerp(-36, TEMP_MILD, v * 2) : lerp(TEMP_MILD, 36, v * 2 - 1)),
          ['−36 °C', `${TEMP_MILD} °C`, '36 °C']);
        break;
      case MapMode.Rainfall:
        strip(host, 0, 1, (v) => sampleRamp(RAIN_RAMP, v), ['trocken', 'mittel', 'sehr nass']);
        break;
      case MapMode.Drift:
        swatch(host, 'Platte zieht nach Osten', [240, 100, 60]);
        swatch(host, 'Platte zieht nach Westen', [60, 100, 240]);
        break;
      case MapMode.OceanCurrents:
        swatch(host, 'Strömung nach Osten', [70, 140, 230]);
        swatch(host, 'Strömung nach Westen', [30, 60, 150]);
        break;
      case MapMode.AirCurrents:
        swatch(host, 'Passate', WIND_BELTS[2].color);
        swatch(host, 'Westwinde', WIND_BELTS[1].color);
        swatch(host, 'Polare Ostwinde', WIND_BELTS[0].color);
        host.appendChild(make('span', 'legend-line', 'Bodenwinde · Pfeile zeigen die Richtung'));
        break;
      case MapMode.Events:
        swatch(host, 'Aktuelles Ereignis', EGA.lightRed);
        break;
    }
  }
}
