/* =============================================================================
 * SimEarth 2.0 — legend of the overview map
 * -----------------------------------------------------------------------------
 * Continuous maps (height, temperature, rain) get a gradient strip with its
 * ends named; categorical ones (habitats, life, technology, currents) get
 * swatches. "Werte" swaps the legend for the planet's headline figures.
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

  /** "−3.500 m": an elevation as a legend mark, to 10 m. */
  function metersLabel(elevation: number): string {
    return `${fmt.int(Math.round(elevationMeters(elevation) / 10) * 10).replace('-', '−')} m`;
  }

  export function renderMapLegend(host: HTMLElement, world: WorldState, mode: MapMode, values: boolean): void {
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
      case MapMode.Biomes:
        for (let b = 0; b < BIOME_COUNT; b++) if (world.biomeCounts[b] > 0) swatch(host, BIOME_NAMES[b], BIOME_COLORS[b]);
        break;
      case MapMode.LifeMap: {
        let shown = 0;
        for (let c = 1; c < LIFE_COUNT && shown < 8; c++) {
          if (world.lifeCounts[c] > 0) { swatch(host, LIFE[c as Life].name, LIFE[c as Life].color); shown++; }
        }
        swatch(host, 'Pflanzen ohne Tiere (blass)', [70, 110, 60]);
        break;
      }
      case MapMode.Technology:
        for (let t = 1; t < TECH_COUNT; t++) swatch(host, TECH_NAMES[t], TECH_COLORS[t]);
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
