/* =============================================================================
 * SimEarth 2.0 — where the disasters are on a zoomed-out map
 * -----------------------------------------------------------------------------
 * Below 16 px a tile, a disaster's own effects are a few pixels wide, as its
 * local extent asks. So every running hazard also gets two pulsing pixel
 * rings, a beacon the player finds from far out. A hurricane's beacon
 * follows its eye, a tidal wave's the strongest stretch of its front,
 * gliding from tick to tick.
 * ========================================================================== */

namespace SE {
  const PULSE_MS = 1400;
  /** Art pixels the rings grow through: out to about two tiles at 10 px. */
  const R_MIN = 8;
  const R_MAX = 40;
  const LIGHT = fxColor('yellow', 0);
  const DARK = fxColor('red', 1);

  /** Each tidal wave's beacon: the tick it was found for, the tile it glides from and to (x unwrapped). */
  const leads = new Map<number, { age: number; from: [number, number]; to: [number, number] }>();

  /** The tile with the most energy on the front at wave time T (±½ tick), or null. */
  function frontLead(w: TidalWave, T: number): [number, number] | null {
    let best = -1;
    let e = 0;
    for (let b = 0; b < w.at.length; b++) {
      if (Math.abs(w.at[b] - T) <= 0.5 && w.energy[b] > e) {
        e = w.energy[b];
        best = b;
      }
    }
    return best < 0 ? null : [w.x0 + (best % WAVE_BOX), w.y0 + Math.floor(best / WAVE_BOX)];
  }

  /** Where a tidal wave's beacon stands, tiles (x unwrapped, fractional): on its front, by the end of this tick. */
  function waveBeacon(s: FxScene, h: Hazard, w: TidalWave): [number, number] {
    let l = leads.get(h.id);
    if (!l || l.age > h.age) {
      l = { age: -1, from: [h.x, h.y], to: [h.x, h.y] };
      leads.set(h.id, l);
    }
    if (l.age !== h.age) {
      const next = frontLead(w, h.age);
      l.from = l.age === h.age - 1 ? l.to : next ?? l.to;
      if (next) {
        // The copy of the new tile nearest the old one.
        next[0] += Math.round((l.from[0] - next[0]) / GRID_W) * GRID_W;
        l.to = next;
      }
      l.age = h.age;
    }
    return [l.from[0] + (l.to[0] - l.from[0]) * s.phase, l.from[1] + (l.to[1] - l.from[1]) * s.phase];
  }

  /** Beacons over every running hazard in view; only while the map is zoomed out past the art. */
  export function fxMarkers(s: FxScene, world: WorldState): void {
    if (!s.zoomedOut) return;
    for (const id of [...leads.keys()]) if (!world.hazards.hazard(id)) leads.delete(id);
    for (const h of world.hazards.list) {
      const eye = h.storm?.path[h.storm.path.length - 1];
      const [x, y] = h.wave ? waveBeacon(s, h, h.wave) : eye === undefined ? [h.x, h.y] : [eye % GRID_W, Math.floor(eye / GRID_W)];
      if (!s.sees(wrapX(Math.round(x)), Math.round(y))) continue;
      for (let k = 0; k < 2; k++) {
        const p = (s.now / PULSE_MS + k / 2 + hazardRoll(h.id, 0, 0x6d)) % 1;
        s.ring(Math.round(x * 16 + 8), Math.round(y * 16 + 8), R_MIN + (R_MAX - R_MIN) * p, LIGHT, DARK);
      }
    }
  }
}
