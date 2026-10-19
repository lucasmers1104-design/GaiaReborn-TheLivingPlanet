/* =============================================================================
 * SimEarth 2.0 — painting the river lines into the pixel terrain
 * -----------------------------------------------------------------------------
 * Each pixel takes its distance to the nearest river segment (landrivers.ts):
 * inside is water, the next pixel the bank, the one after an occasional
 * clump of mud. Analytic per pixel, so two chunks paint the same pixels where
 * they meet and nothing moves from frame to frame. The look follows the river
 * sprites it replaces: body water4, a shaded water3 row under the upper-left
 * bank, water5 glints, a mud bank dark on the upper-left side and lit on the
 * lower-right, algae film where freshwater algae grow. At the mouth the river
 * opens the shore's foam line.
 * ========================================================================== */

namespace SE {
  /** A sea pixel's colour beside buffer pixel k that is not foam, or null. */
  function seaBeside(px: Uint8Array, water: Uint8Array, k: number, w: number, foam: number): number | null {
    for (const o of [k - 1, k + 1, k - w, k + w, k - 2, k + 2, k - 2 * w, k + 2 * w]) {
      if (o >= 0 && o < px.length && water[o] === 1 && px[o] !== foam) return px[o];
    }
    return null;
  }

  let dist = new Float32Array(0);
  let seg = new Int32Array(0);

  /** Paint the rivers into a compositor buffer whose pixel (0, 0) is world pixel (ox, oy). */
  export function paintRivers(paths: RiverPaths, b: LandBuffer, art: LandArt, ox: number, oy: number): void {
    const ids = paths.query(ox, oy, ox + b.w, oy + b.h);
    if (ids.length === 0) return;
    const { px, water, w, h } = b;
    if (dist.length !== w * h) { dist = new Float32Array(w * h); seg = new Int32Array(w * h); }
    const { ax: pax, ay: pay, bx: pbx, by: pby, ra, rb, green } = paths;
    dist.fill(Infinity);
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (const id of ids) {
      const shift = landWrapShift(ox + w / 2, (pax[id] + pbx[id]) / 2);
      const reach = Math.max(ra[id], rb[id]) + LAND_RIVER_BANK + 1;
      const x0 = Math.max(0, Math.floor(Math.min(pax[id], pbx[id]) + shift - reach - ox));
      const x1 = Math.min(w - 1, Math.ceil(Math.max(pax[id], pbx[id]) + shift + reach - ox));
      const y0 = Math.max(0, Math.floor(Math.min(pay[id], pby[id]) - reach - oy));
      const y1 = Math.min(h - 1, Math.ceil(Math.max(pay[id], pby[id]) + reach - oy));
      if (x0 > x1 || y0 > y1) continue;
      minX = Math.min(minX, x0); maxX = Math.max(maxX, x1); minY = Math.min(minY, y0); maxY = Math.max(maxY, y1);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const d = paths.distance(id, ox + x + 0.5, oy + y + 0.5);
          const k = y * w + x;
          if (d < dist[k]) { dist[k] = d; seg[k] = id; }
        }
      }
    }
    const ramp = art.water;
    const mud = art.manifest.ramps.mud;
    const foam = ramp[ramp.length - 1];
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const k = y * w + x;
        const d = dist[k];
        if (d > LAND_RIVER_BANK) continue;
        const wx = ox + x;
        const wy = oy + y;
        if (water[k] === 1) {
          // The mouth opens the shore's foam line, in the colour of the sea beside it (a lagoon's turquoise too).
          if (d <= 0 && px[k] === foam) px[k] = seaBeside(px, water, k, w, foam) ?? ramp[5];
          continue;
        }
        const id = seg[k];
        const ax = pax[id] + landWrapShift(wx, (pax[id] + pbx[id]) / 2);
        const bx = ax + pbx[id] - pax[id];
        const vx = bx - ax;
        const vy = pby[id] - pay[id];
        const len = vx * vx + vy * vy;
        const t = len > 0 ? clamp(((wx + 0.5 - ax) * vx + (wy + 0.5 - pay[id]) * vy) / len, 0, 1) : 0;
        // Which bank: up-left of the line lies in its shade, down-right in the light.
        const upLeft = wx + 0.5 - (ax + t * vx) + (wy + 0.5 - (pay[id] + t * vy)) < 0;
        if (d <= 0) {
          let v = upLeft && d > -1 ? ramp[3] : ramp[4];
          if (d <= -1.2 && landHash(wx >> 1, wy, 977) < 0.05) v = ramp[5];
          if (green[id]) v = art.algae.px[(wy & (art.algae.size - 1)) * art.algae.size + (wx & (art.algae.size - 1))] || v;
          px[k] = v;
          water[k] = 2;
        } else if (d <= 1) {
          px[k] = upLeft ? mud[0] : mud[Math.min(2, mud.length - 1)];
        } else if (landHash(wx >> 1, wy, 978) < 0.25) {
          px[k] = mud[1];
        }
      }
    }
  }
}
