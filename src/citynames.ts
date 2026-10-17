/* =============================================================================
 * SimEarth 2.0 — city names on the map and in the hover text
 * -----------------------------------------------------------------------------
 * From 24 px per tile each city's name stands under it in small light text
 * with a dark edge (spec §3.5), drawn every frame over the animals so it is
 * never hidden; below that the map shows the tribe markers instead. The
 * hover text names the city everywhere: „Teluma · Arkani · Dorf, Steinzeit“.
 * ========================================================================== */

namespace SE {
  /** CSS pixels per tile from which names are shown. */
  export const CITY_NAMES_FROM = 24;

  /** „Name · Volk · Größe, Zeitalter“ for the city on tile `i`, or null if none stands there. */
  export function cityLabel(world: WorldState, i: number): string | null {
    const t = world.tech[i] as Tech;
    if (t === Tech.None) return null;
    const stage = `${CITY_SIZE_NAMES[citySize(world.cityPop[i])]}, ${TECH_NAMES[t]}`;
    const city = world.civ.cityAt(i);
    if (!city) return stage;
    const tribe = world.civ.tribe(city.tribe);
    return [city.name, tribe ? tribe.name : '', stage].filter(Boolean).join(' · ');
  }

  /** The names of the cities in view, centred under their tiles. */
  export function drawCityNames(ctx: CanvasRenderingContext2D, view: AmbientView, world: WorldState): void {
    const size = view.tilePx;
    if (size < CITY_NAMES_FROM) return;
    const px = Math.round(clamp(size * 0.42, 11, 14));
    ctx.save();
    ctx.font = `600 ${px}px "Pixelify Sans", system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    // A hard one-pixel edge all round, like the pixel UI's labels, instead of a soft stroke.
    const edge = (text: string, sx: number, sy: number): void => {
      ctx.fillStyle = '#0b1210';
      for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]) ctx.fillText(text, sx + dx, sy + dy);
      ctx.fillStyle = '#f2efe2';
      ctx.fillText(text, sx, sy);
    };
    for (const c of world.civ.cities) {
      let rx = (c.tile % GRID_W) + 0.5 - view.scrollX;
      rx -= Math.floor(rx / GRID_W) * GRID_W;
      if (rx > GRID_W - 2) rx -= GRID_W;
      const ry = ((c.tile / GRID_W) | 0) + 1 - view.scrollY;
      if (ry < -1 || ry > view.rows + 1) continue;
      for (let x = rx; x < view.cols + 2; x += GRID_W) {
        const sx = Math.round(x * size);
        const sy = Math.round(ry * size) - 1;
        edge(c.name, sx, sy);
      }
    }
    ctx.restore();
  }
}
