/* =============================================================================
 * SimEarth 2.0 — spray where big waves break on the coast
 * -----------------------------------------------------------------------------
 * A few pixels of every foam line on the open sea are spray sites; when a big
 * wave breaks there (watermotion.ts decides when), white drops fly up from
 * the foam line and fall back, a burst of under a second. The higher the land
 * behind the site, the likelier and the taller the spray: cliffs throw it
 * often, flat shores rarely and low. Lakes and lagoons, far from deep water,
 * throw none. Drops are single art pixels in the ice ramp's whites, from a
 * hash of the site and the wave, so nothing is stored.
 * ========================================================================== */

namespace SE {
  /** Share of the foam line's pixels that are spray sites. */
  const SITE_SHARE = 0.015;
  /** Land height (elevation) from which a shore counts as a cliff, and where it is a full one. */
  const CLIFF_LOW = 0.02;
  const CLIFF_HIGH = 0.22;
  /** Strength of a site on the flattest open shore (a cliff is 1). */
  const FLAT = 0.15;
  /** Open sea: water deeper than OPEN_SEA_DEPTH (elevation, 360 m) within OPEN_SEA_REACH tiles. */
  const OPEN_SEA_DEPTH = -0.08;
  const OPEN_SEA_REACH = 4;
  /** Chance a big wave throws spray at a site of strength 0 and 1. */
  const CHANCE_FLAT = 0.12;
  const CHANCE_CLIFF = 0.65;
  /** How long a burst lasts, s; drops thrown, from a flat shore and from a cliff; their speed up, art px/s. */
  export const SPRAY_LIFE = 0.9;
  const DROPS_FLAT = 3;
  const DROPS_CLIFF = 12;
  const RISE_FLAT = 12;
  const RISE_CLIFF = 34;
  const GRAVITY = 60;
  const CHUNK_PX = LAND_CHUNK * 16;

  /** How strongly the shore at tile (tx, ty) throws spray, 0 none .. 1 a high cliff. */
  export function sprayStrength(world: WorldState, tx: number, ty: number): number {
    let high = -1;
    let open = false;
    for (let dy = -OPEN_SEA_REACH; dy <= OPEN_SEA_REACH; dy++) {
      const y = ty + dy;
      if (y < 0 || y >= GRID_H) continue;
      for (let dx = -OPEN_SEA_REACH; dx <= OPEN_SEA_REACH; dx++) {
        const e = world.elevation[y * GRID_W + wrapX(tx + dx)];
        if (e < OPEN_SEA_DEPTH) open = true;
        if (dx >= -1 && dx <= 1 && dy >= -1 && dy <= 1 && e > high) high = e;
      }
    }
    if (!open || high < 0) return 0;
    return FLAT + (1 - FLAT) * clamp((high - CLIFF_LOW) / (CLIFF_HIGH - CLIFF_LOW), 0, 1);
  }

  /** Chance that a big wave throws spray at a site of this strength. */
  export function sprayChance(strength: number): number {
    return CHANCE_FLAT + (CHANCE_CLIFF - CHANCE_FLAT) * strength;
  }

  export class WaterSpray {
    private readonly sites = new WeakMap<LandMotion, Uint32Array>();

    /**
     * The spray sites of chunk (cx, cy)'s foam line, worked out once per
     * composition: surf index | strength << 24 (1..255).
     */
    sitesOf(m: LandMotion, cx: number, cy: number, world: WorldState): Uint32Array {
      const known = this.sites.get(m);
      if (known) return known;
      const out: number[] = [];
      for (let k = 0; k < m.surf.length; k++) {
        if (((m.surf[k] >>> 8) & 255) !== 1) continue;
        const x = cx * CHUNK_PX + (m.surfAt[k] & 0xffff);
        const y = cy * CHUNK_PX + (m.surfAt[k] >>> 16);
        if (landHash(x, y, 405) >= SITE_SHARE) continue;
        const strength = sprayStrength(world, x >> 4, y >> 4);
        if (strength > 0) out.push(k | (Math.max(1, Math.round(strength * 255)) << 24));
      }
      const sites = Uint32Array.from(out);
      this.sites.set(m, sites);
      return sites;
    }
  }

  /**
   * One burst `age` seconds after wave `wave` broke at the site at world pixel
   * (hx, hy) (x wrapped, for the hash), drawn at (x, y): first a white patch on
   * the foam line, then drops on their arcs, whitest while fresh. `ice` is the
   * ice ramp; `put` takes a palette index and a world pixel.
   */
  export function sprayDrops(
    age: number, strength: number, hx: number, hy: number, wave: number, x: number, y: number,
    ice: readonly number[], put: (color: number, x: number, y: number) => void,
  ): void {
    const white = ice[ice.length - 1];
    if (age < SPRAY_LIFE / 3) for (let dx = -1; dx <= 1; dx++) put(white, x + dx, y);
    const drops = Math.round(DROPS_FLAT + (DROPS_CLIFF - DROPS_FLAT) * strength);
    const rise = RISE_FLAT + (RISE_CLIFF - RISE_FLAT) * strength;
    const row = hy + wave * 977;
    for (let j = 0; j < drops; j++) {
      const id = hx * 16 + j;
      const life = SPRAY_LIFE * (0.55 + 0.45 * landHash(id, row, 407));
      if (age >= life) continue;
      const up = rise * (0.5 + 0.5 * landHash(id, row, 408)) * age - 0.5 * GRAVITY * age * age;
      if (up < 0) continue;
      const side = (landHash(id, row, 409) - 0.5) * (8 + 10 * strength) * age;
      const fade = age / life;
      put(fade < 0.35 ? white : fade < 0.7 ? ice[ice.length - 2] : ice[ice.length - 3], Math.floor(x + side), Math.floor(y - up));
    }
  }
}
