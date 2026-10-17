/* =============================================================================
 * SimEarth 2.0 — model window scenes: geosphere and atmosphere
 * -----------------------------------------------------------------------------
 * Each model window opens on a small illustrated cross-section that is drawn
 * from the slider values, so moving a slider visibly does something before
 * the planet has had time to respond: the core glows hotter, plates part
 * faster, clouds thicken, the greenhouse band darkens. Plain SVG markup.
 * ========================================================================== */

namespace SE {
  /** Width and height of every model scene's viewBox. */
  export const SCENE_W = 400;
  export const SCENE_H = 168;

  const n = (v: number): string => v.toFixed(1);

  function arrowHead(x: number, y: number, dx: number, dy: number, size: number): string {
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    return `M${n(x - ux * size - uy * size * 0.6)} ${n(y - uy * size + ux * size * 0.6)}L${n(x)} ${n(y)}L${n(x - ux * size + uy * size * 0.6)} ${n(y - uy * size - ux * size * 0.6)}`;
  }

  /** A straight arrow from (x0,y0) to (x1,y1). */
  function arrow(x0: number, y0: number, x1: number, y1: number, cls: string, width: number): string {
    const head = Math.max(4, width * 2.2);
    return `<path class="${cls}" stroke-width="${n(width)}" d="M${n(x0)} ${n(y0)}L${n(x1)} ${n(y1)}${arrowHead(x1, y1, x1 - x0, y1 - y0, head)}"/>`;
  }

  /* ------------------------------------------------------------- geosphere -- */

  export function geoScene(p: GeoParams): string {
    const ground = 96;
    const peak = 14 + p.coreHeat * 34 - p.erosion * 12;
    // Erosion rounds the summits: the control point sits lower and wider.
    const round = 6 + p.erosion * 18;
    let s = `<svg viewBox="0 0 ${SCENE_W} ${SCENE_H}" class="model-scene" role="img" aria-label="Querschnitt durch die Erdkruste">`;
    s += '<defs>' +
      '<radialGradient id="geo-core"><stop offset="0" stop-color="#fff4c2"/><stop offset="0.45" stop-color="#f6b44a"/><stop offset="1" stop-color="#d4501f"/></radialGradient>' +
      '<linearGradient id="geo-mantle" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b2414"/><stop offset="1" stop-color="#a5401c"/></linearGradient>' +
      '<linearGradient id="geo-crust" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8c6440"/><stop offset="1" stop-color="#5e3f27"/></linearGradient>' +
      '</defs>';

    // Mantle and its convection, faster and brighter with faster drift.
    s += `<rect x="0" y="${ground + 16}" width="${SCENE_W}" height="${SCENE_H - ground - 16}" fill="url(#geo-mantle)"/>`;
    const flow = 0.2 + p.drift * 0.6;
    for (const [cx, dir] of [[100, -1], [300, 1]] as const) {
      s += `<path class="geo-flow" opacity="${n(flow)}" d="M${cx + dir * 70} 158C${cx + dir * 70} 124 ${cx - dir * 70} 124 ${cx - dir * 66} 150${arrowHead(cx - dir * 66, 150, -dir * 0.3, 1, 6)}"/>`;
    }
    // The core, glowing with the planet's internal heat.
    const coreR = 40 + p.coreHeat * 16;
    s += `<circle cx="200" cy="${SCENE_H + 26}" r="${n(coreR + 26)}" fill="#f6b44a" opacity="${n(0.08 + p.coreHeat * 0.3)}"/>`;
    s += `<circle cx="200" cy="${SCENE_H + 26}" r="${n(coreR)}" fill="url(#geo-core)"/>`;

    // Two plates parting at a rift, magma welling up between them.
    s += `<rect x="0" y="${ground}" width="197" height="16" fill="url(#geo-crust)"/>`;
    s += `<rect x="203" y="${ground}" width="197" height="16" fill="url(#geo-crust)"/>`;
    s += `<rect x="197" y="${ground}" width="6" height="16" fill="#f08a3a" opacity="${n(0.4 + p.coreHeat * 0.6)}"/>`;
    const reach = 10 + p.drift * 46;
    s += arrow(170, ground + 8, 170 - reach, ground + 8, 'geo-arrow', 2.2);
    s += arrow(230, ground + 8, 230 + reach, ground + 8, 'geo-arrow', 2.2);

    // Land with its ranges, and the sea on the right.
    const hill = (x: number, w: number, h: number): string =>
      `L${n(x - w)} ${ground}Q${n(x - round)} ${n(ground - h)} ${n(x)} ${n(ground - h)}Q${n(x + round)} ${n(ground - h)} ${n(x + w)} ${ground}`;
    s += `<path class="geo-land" d="M0 ${ground}${hill(46, 30, peak * 0.55)}${hill(108, 40, peak)}${hill(158, 26, peak * 0.7)}L330 ${ground}L330 ${ground + 1}L0 ${ground + 1}Z"/>`;
    s += `<path class="geo-snow" d="M${n(108 - 9)} ${n(ground - peak + 6)}Q108 ${n(ground - peak - 1)} ${n(108 + 9)} ${n(ground - peak + 6)}Z" opacity="${n(clamp((peak - 18) / 20, 0, 1))}"/>`;
    s += `<rect x="330" y="${ground - 6}" width="70" height="7" class="geo-sea"/>`;

    // The volcano: more smoke and a lava flow as volcanism rises.
    const vx = 268;
    s += `<path class="geo-volcano" d="M${vx - 34} ${ground}L${vx - 7} ${ground - 34}L${vx + 7} ${ground - 34}L${vx + 34} ${ground}Z"/>`;
    s += `<rect x="${vx - 7}" y="${ground - 35}" width="14" height="3" rx="1.5" fill="#f08a3a" opacity="${n(0.3 + p.volcanoes * 0.7)}"/>`;
    if (p.volcanoes > 0.55) s += `<path d="M${vx + 4} ${ground - 33}Q${vx + 10} ${ground - 18} ${vx + 22} ${ground - 2}" stroke="#f08a3a" stroke-width="3" fill="none" stroke-linecap="round" opacity="${n((p.volcanoes - 0.55) * 2.2)}"/>`;
    const puffs = Math.round(p.volcanoes * 4);
    for (let k = 0; k < puffs; k++) {
      s += `<circle cx="${vx - 2 + k * 7}" cy="${ground - 44 - k * 11}" r="${5 + k * 2.4}" class="geo-smoke" opacity="${n(0.75 - k * 0.12)}"/>`;
    }

    // Rain wearing the mountains down.
    const drops = Math.round(p.erosion * 6);
    for (let k = 0; k < drops; k++) {
      const x = 74 + k * 14;
      const y = 22 + (k % 3) * 9;
      s += `<path class="geo-rain" d="M${x} ${y}l-3 8"/>`;
    }

    // Meteors over the right-hand sky.
    const streaks = [[352, 12], [384, 30], [318, 6], [372, 52]];
    for (let k = 0; k < Math.round(p.meteors * 4); k++) {
      const [x, y] = streaks[k];
      s += `<path class="geo-meteor" d="M${x} ${y}l-24 15"/><circle cx="${x - 24}" cy="${y + 15}" r="2.6" fill="#ffd27a"/>`;
    }

    // A small globe on its tilted axis.
    const tilt = (p.axialTilt * 47 * Math.PI) / 180;
    const ax = Math.sin(tilt) * 22;
    const ay = Math.cos(tilt) * 22;
    s += '<g transform="translate(34 34)">' +
      '<circle r="15" fill="#2b78a8"/><path d="M-9 -6q6 -6 11 -1t6 9q-5 4 -9 1t-8 -9z" fill="#6aa34f"/>' +
      `<path d="M${n(-ax)} ${n(ay)}L${n(ax)} ${n(-ay)}" class="geo-axis"/>` +
      `<ellipse rx="15" ry="4" fill="none" class="geo-equator" transform="rotate(${n((tilt * 180) / Math.PI)})"/>` +
      '</g>';
    return `${s}</svg>`;
  }

  /* ------------------------------------------------------------ atmosphere -- */

  export function atmoScene(p: AtmoParams, world: WorldState): string {
    const ground = 124;
    let s = `<svg viewBox="0 0 ${SCENE_W} ${SCENE_H}" class="model-scene" role="img" aria-label="Energiebilanz der Atmosphäre">`;
    s += '<defs>' +
      '<linearGradient id="atmo-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1f33"/><stop offset="1" stop-color="#2a5a78"/></linearGradient>' +
      '<radialGradient id="atmo-sun"><stop offset="0" stop-color="#fff6cf"/><stop offset="0.6" stop-color="#f6c453"/><stop offset="1" stop-color="#e3962c"/></radialGradient>' +
      '</defs>';
    s += `<rect width="${SCENE_W}" height="${ground}" fill="url(#atmo-sky)"/>`;

    // The greenhouse layer: the stronger the effect, the denser the blanket.
    s += `<rect x="0" y="56" width="${SCENE_W}" height="16" fill="#ff8a5c" opacity="${n(0.05 + p.greenhouse * 0.32)}"/>`;
    const heat = 1 + Math.round(p.greenhouse * 3);
    for (let k = 0; k < heat; k++) {
      const x = 286 + k * 26;
      s += `<path class="atmo-heat" d="M${x} ${ground - 4}q-5 -8 0 -16t0 -16t0 -16${arrowHead(x, ground - 52, 0, -1, 5)}"/>`;
      s += `<path class="atmo-heat back" d="M${x + 10} 74q5 8 0 14t0 14${arrowHead(x + 10, 102, 0, 1, 4)}"/>`;
    }

    // The sun and its light.
    const sunR = 12 + p.solarInput * 9;
    s += `<circle cx="34" cy="30" r="${n(sunR + 10)}" fill="#f6c453" opacity="0.14"/>`;
    s += `<circle cx="34" cy="30" r="${n(sunR)}" fill="url(#atmo-sun)"/>`;
    const beam = 1.2 + p.solarInput * 3;
    for (let k = 0; k < 3; k++) s += arrow(56 + k * 12, 44 + k * 4, 118 + k * 34, ground - 4, 'atmo-sunbeam', beam);

    // Ice, land and sea, each reflecting by its albedo.
    s += `<rect x="0" y="${ground}" width="120" height="${SCENE_H - ground}" fill="#e3ecec"/>`;
    s += `<rect x="120" y="${ground}" width="140" height="${SCENE_H - ground}" fill="#4f8a45"/>`;
    s += `<rect x="260" y="${ground}" width="140" height="${SCENE_H - ground}" fill="#2b78a8"/>`;
    s += `<path d="M268 ${ground + 12}q8 -5 16 0t16 0t16 0t16 0t16 0t16 0t16 0t16 0" class="atmo-wave"/>`;
    s += arrow(70, ground - 4, 40, 74, 'atmo-reflect', 0.8 + p.surfaceAlbedo * 3.2);

    // Clouds: whiter and larger as they reflect more, with rain below.
    const cs = 0.75 + p.cloudAlbedo * 0.5;
    s += `<g transform="translate(206 38) scale(${n(cs)})" opacity="${n(0.55 + p.cloudAlbedo * 0.45)}" class="atmo-cloud">` +
      '<circle cx="-18" cy="6" r="12"/><circle cx="0" cy="-2" r="16"/><circle cx="20" cy="6" r="12"/><rect x="-30" y="6" width="62" height="12" rx="6"/></g>';
    s += arrow(214, 22, 250, 4, 'atmo-reflect', 0.8 + p.cloudAlbedo * 3);
    for (let k = 0; k < Math.round(p.rainfall * 7); k++) {
      s += `<path class="atmo-rain" d="M${184 + k * 8} ${66 + (k % 2) * 8}l-3 9"/>`;
    }

    // Winds and currents carrying heat across the coast.
    const mix = 0.8 + p.thermalTransfer * 3;
    s += `<path class="atmo-mix" stroke-width="${n(mix)}" d="M300 112C276 96 244 96 222 110${arrowHead(222, 110, -1, 0.6, 5 + mix)}"/>`;
    s += `<path class="atmo-mix" stroke-width="${n(mix)}" d="M224 132C246 146 276 146 296 134${arrowHead(296, 134, 1, -0.6, 5 + mix)}"/>`;

    // What the planet makes of it all, right now.
    s += `<g transform="translate(${SCENE_W - 104} 10)"><rect width="94" height="38" class="scene-chip"/>` +
      `<text x="47" y="16" class="scene-chip-label">Mitteltemperatur</text>` +
      `<text x="47" y="31" class="scene-chip-value">${esc(`${fmt.one(world.globalTemp)} °C`)}</text></g>`;
    return `${s}</svg>`;
  }
}
