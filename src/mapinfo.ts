/* =============================================================================
 * Gaia Reborn — the overview map's field card beside its globe
 * -----------------------------------------------------------------------------
 * The field last clicked on the map or the globe (the middle of the view until
 * then): its picture as the Examine window draws it, its landscape and state,
 * the value the current map mode shows there, then height, climate, life and
 * plants, so the overview's colours can be read as values.
 * ========================================================================== */

namespace SE {
  /** The field picture's box, CSS px. */
  const PICTURE_PX = 64;

  /** "23° N · 12° O": the centre of tile (x, y) as rounded latitude and longitude. */
  function placeLabel(x: number, y: number): string {
    const lat = latitudeDeg(y);
    const lon = ((x + 0.5) / GRID_W) * 360 - 180;
    return `${fmt.int(Math.abs(lat))}° ${lat < 0 ? 'S' : 'N'} · ${fmt.int(Math.abs(lon))}° ${lon < 0 ? 'W' : 'O'}`;
  }

  /** The value behind the overview's colour on tile i in `mode`. */
  export function mapReadout(world: WorldState, i: number, mode: MapMode): string {
    const water = world.isWater(i);
    switch (mode) {
      case MapMode.Terrain:
      case MapMode.Oceans:
        return altitudeLabel(world, i);
      case MapMode.Events:
        return world.eventTtl[i] > 0 ? EVENT_NAMES[world.eventKind[i]] : 'Kein Ereignis';
      case MapMode.Drift: {
        const v = driftProbe ? driftProbe(Math.floor(i / GRID_W)) : 0;
        return v > 0 ? 'Platte zieht nach Osten' : v < 0 ? 'Platte zieht nach Westen' : 'Platte ruht';
      }
      case MapMode.OceanTemp:
        return water ? `${fmt.int(world.temperature[i])} °C` : 'Land';
      case MapMode.OceanCurrents:
        if (!water) return 'Land';
        return ClimateSystem.oceanCurrent(i % GRID_W, Math.floor(i / GRID_W)).dx > 0 ? 'Strömung nach Osten' : 'Strömung nach Westen';
      case MapMode.AirTemp:
        return `${fmt.int(world.temperature[i])} °C`;
      case MapMode.Rainfall:
        return `${fmt.int(world.rainfallCm(i))} cm/Jahr`;
      case MapMode.AirCurrents:
        return WIND_BELTS[windBelt(i)].name;
      case MapMode.Biomes:
        return BIOME_NAMES[world.biome[i]];
      case MapMode.LifeMap: {
        const c = world.dominantLife[i] as Life;
        if (c !== Life.None) return LIFE[c].name;
        const g = world.floraTop[i] as Flora;
        return g !== Flora.None ? FLORA[g].name : 'Kein Leben';
      }
      case MapMode.Technology:
        return cityLabel(world, i) ?? 'Keine Siedlung';
    }
  }

  /** The current mode's value first, then the facts that mode does not already give. */
  function fieldFacts(world: WorldState, i: number, mode: MapMode): [string, string][] {
    const water = world.isWater(i);
    const life = world.dominantLife[i] as Life;
    const flora = world.floraTop[i] as Flora;
    const rows: [string, string][] = [[MAP_MODES[mode].name, mapReadout(world, i, mode)]];
    // At sea the card's name already is the habitat.
    if (!water && mode !== MapMode.Biomes) rows.push(['Lebensraum', BIOME_NAMES[world.biome[i]]]);
    if (mode !== MapMode.Terrain && mode !== MapMode.Oceans) rows.push([water ? 'Tiefe' : 'Höhe', `${fmt.int(Math.abs(world.altitudeMeters(i)))} m`]);
    if (mode !== MapMode.AirTemp && !(water && mode === MapMode.OceanTemp)) rows.push(['Temperatur', `${fmt.int(world.temperature[i])} °C`]);
    if (mode !== MapMode.Rainfall) rows.push(['Niederschlag', `${fmt.int(world.rainfallCm(i))} cm/Jahr`]);
    if (mode !== MapMode.LifeMap) rows.push(['Leben', life !== Life.None ? LIFE[life].name : '–']);
    rows.push(['Pflanzen', flora === Flora.None ? '–' : FLORA[flora].name]);
    return rows;
  }

  /** The field as the Examine window shows it, whole pixels where it fits; its habitat's picture while the pixel atlas is missing. */
  function fieldPicture(world: WorldState, x: number, y: number): HTMLElement {
    const canvas = examineTilePicture(world, x, y);
    if (!canvas) {
      const icon = img(habitatAsset(BIOME_ICONS[world.biome[idx(x, y)]]), 'map-picture-icon');
      icon.width = icon.height = PICTURE_PX;
      return icon;
    }
    const fit = Math.min(PICTURE_PX / canvas.width, PICTURE_PX / canvas.height);
    const k = fit >= 1 ? Math.floor(fit) : fit;
    canvas.style.cssText = `flex: none; width: ${canvas.width * k}px; height: ${canvas.height * k}px; image-rendering: pixelated`;
    return canvas;
  }

  function setText(el: Element, text: string): void {
    if (el.textContent === text) return;
    el.textContent = text;
    if (el instanceof HTMLElement) el.title = text;
  }

  /** The card for tile (x, y) into `host`; `clicked`: the player picked it, else it is the middle of the view. */
  export function renderMapInfo(host: HTMLElement, world: WorldState, mode: MapMode, x: number, y: number, clicked: boolean): void {
    // Built once and only retexted, so the periodic refresh keeps a selection and the tooltips alive.
    if (!host.firstElementChild) {
      const head = make('div', 'map-field');
      const picture = make('div', 'map-picture');
      // Sized here too: a cached old stylesheet must not let the picture push the card around.
      picture.style.cssText = `flex: none; width: ${PICTURE_PX}px; height: ${PICTURE_PX}px; overflow: hidden`;
      const name = make('div', 'map-name');
      name.append(make('span', 'map-where'), make('strong', 'map-title'), make('span', 'map-state'));
      head.append(picture, name);
      host.append(head, make('dl', 'map-info'));
    }
    const i = idx(x, y);
    const head = host.children[0];
    const picture = head.children[0] as HTMLElement;
    const [where, title, state] = Array.from(head.children[1].children);
    const list = host.children[1];

    const key = `${i}|${world.biome[i]}|${landDigest(world, x, y)}`;
    if (picture.dataset.key !== key) {
      picture.dataset.key = key;
      picture.replaceChildren(fieldPicture(world, x, y));
    }
    setText(where, `${clicked ? 'Angeklicktes Feld' : 'Bildmitte'} · ${placeLabel(x, y)}`);
    setText(title, landscapeLabel(world, i));
    const covered = !world.isWater(i) && world.floraTop[i] !== Flora.None ? ` · ${fmt.int(world.vegetation[i] * 100)} % bedeckt` : '';
    setText(state, LifeSystem.biomeStatusLabel(world, i) + covered);

    const rows = fieldFacts(world, i, mode);
    if (list.childElementCount !== rows.length) {
      list.replaceChildren(...rows.map(() => {
        const row = make('div');
        row.append(make('dt'), make('dd'));
        return row;
      }));
    }
    rows.forEach(([label, value], n) => {
      const row = list.children[n];
      setText(row.firstElementChild as Element, label);
      setText(row.lastElementChild as Element, value);
    });
  }
}
