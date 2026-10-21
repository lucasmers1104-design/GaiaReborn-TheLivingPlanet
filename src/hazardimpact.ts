/* =============================================================================
 * SimEarth 2.0 — meteor and atomic strike: craters, scorch, fallout
 * -----------------------------------------------------------------------------
 * docs/ereignisse-spec.md §3.2, §3.7. Both strike in one tick and damage
 * only rings around their tile (impactRing: round, with ragged edges); their
 * dust and CO₂ stay global (K6).
 *   meteor   the tile sinks into a crater of fresh rock, ring 1 is scorched,
 *            ring 2 on a hashed half; at sea only a splash that harms sea
 *            life (the tidal wave it may set off is a chain, stage 2); the
 *            comet that ends the dinosaurs (comet.ts) is a meteor of
 *            strength 2: a 2 × 2 crater and rings of twice the size
 *   atomic   ash at ground zero (ring 1, at most two of its corners), ring 2
 *            scorched and its fuel burning for two ticks; fallout over
 *            ring 3 and a plume downwind, where life keeps dying for
 *            ATOMIC_FALLOUT_TICKS
 * The scars heal by themselves (scars.ts).
 * ========================================================================== */

namespace SE {
  /** What an atomic strike keeps doing after its first tick. */
  export interface ImpactState {
    /** The fallout zone: its life keeps dying for ATOMIC_FALLOUT_TICKS. */
    readonly fallout: number[];
    /** Ring tiles that caught fire in the blast; each burns out by itself. */
    readonly fires: number[];
  }

  export interface Hazard {
    impact?: ImpactState;
  }

  /** Every tile within Chebyshev distance r of (x, y), with its distance and offset. */
  function around(x: number, y: number, r: number, fn: (i: number, d: number, dx: number, dy: number) => void): void {
    for (let dy = -r; dy <= r; dy++) {
      const ty = y + dy;
      if (ty < 0 || ty >= GRID_H) continue;
      for (let dx = -r; dx <= r; dx++) fn(idx(wrapX(x + dx), ty), Math.max(Math.abs(dx), Math.abs(dy)), dx, dy);
    }
  }

  /** The blast ring tile (h.x + dx, h.y + dy) lies in: its rounded distance with a hashed wobble; never below the Chebyshev distance, so the reach stays in the box. */
  export function impactRing(world: WorldState, h: Hazard, dx: number, dy: number): number {
    const i = idx(wrapX(h.x + dx), clamp(h.y + dy, 0, GRID_H - 1));
    return Math.round(Math.hypot(dx, dy) + (hazardRoll(world.seed ^ h.id, i, 0x71) - 0.5) * IMPACT_RING_WOBBLE);
  }

  /** A meteor's size: 1, or more for the comet (COMET_STRENGTH), whose crater is s × s tiles from (h.x, h.y) to the lower right. */
  export function meteorScale(h: Hazard): number {
    return Math.max(1, Math.round(h.strength ?? 1));
  }

  /**
   * The meteor's ring for tile (h.x + dx, h.y + dy): impactRing at scale 1.
   * Larger, 0 on its s × s crater and beyond it the wobbled distance from the
   * crater's centre over s, at least 1 — the same rings at s times the size,
   * so one crater of s² tiles instead of s² small ones.
   */
  export function meteorRing(world: WorldState, h: Hazard, dx: number, dy: number): number {
    const s = meteorScale(h);
    if (s === 1) return impactRing(world, h, dx, dy);
    if (dx >= 0 && dx < s && dy >= 0 && dy < s) return 0;
    const c = (s - 1) / 2;
    const i = idx(wrapX(h.x + dx), clamp(h.y + dy, 0, GRID_H - 1));
    return Math.max(1, Math.round(Math.hypot(dx - c, dy - c) / s + (hazardRoll(world.seed ^ h.id, i, 0x71) - 0.5) * IMPACT_RING_WOBBLE));
  }

  /** Every tile a meteor of scale s can reach with ring 2: the box 2s round its crater. */
  function aroundMeteor(h: Hazard, fn: (i: number, dx: number, dy: number) => void): void {
    const s = meteorScale(h);
    for (let dy = -2 * s; dy < 3 * s; dy++) {
      const ty = h.y + dy;
      if (ty < 0 || ty >= GRID_H) continue;
      for (let dx = -2 * s; dx < 3 * s; dx++) fn(idx(wrapX(h.x + dx), ty), dx, dy);
    }
  }

  /**
   * The atomic strike's ring for tile (h.x + dx, h.y + dy): impactRing, but of
   * the four ring-1 corners at most ATOMIC_ASH_CORNERS stay in ring 1, a hashed
   * run of neighbours; the rest fall to ring 2. Ground zero is then a plus with
   * a corner or two, which reads round and ragged instead of a 3×3 square.
   */
  export function atomicRing(world: WorldState, h: Hazard, dx: number, dy: number): number {
    const d = impactRing(world, h, dx, dy);
    if (d > 1 || Math.abs(dx) !== 1 || Math.abs(dy) !== 1) return d;
    // Corners numbered clockwise from the upper left, so the kept ones lie side by side.
    const corner = dy < 0 ? (dx < 0 ? 0 : 1) : dx > 0 ? 2 : 3;
    const seed = world.seed ^ h.id;
    const at = idx(h.x, h.y);
    const first = Math.floor(hazardRoll(seed, at, 0x5a) * 4);
    const kept = Math.floor(hazardRoll(seed, at, 0x5b) * (ATOMIC_ASH_CORNERS + 1));
    return (corner - first + 4) % 4 < kept ? 1 : 2;
  }

  /** Fresh rock and volcanoes keep their own scar under a scorch. */
  function lasting(s: ScarKind): boolean {
    return s === ScarKind.Vent || s === ScarKind.Crater || s === ScarKind.Basalt;
  }

  /** A land tile in a blast ring: plant cover cut to `keep`, woodland burnt down if `woody`, ground scorched. */
  function scorch(world: WorldState, i: number, keep: number, woody: boolean): void {
    if (world.elevation[i] < 0) return;
    const from = LANDSCAPE_LEVEL[world.landscape[i]];
    world.vegetation[i] *= keep;
    if (world.vegetation[i] < 0.002) world.vegetation[i] = 0;
    if (woody) {
      world.flora[i] &= ~WOODY_FLORA_MASK;
      SuccessionSystem.burn(world, i);
    }
    if (!lasting(world.hazards.scar[i] as ScarKind)) setScar(world, i, ScarKind.Scorched, from);
  }

  /** The fires of the blast ring burn down one tick (`all`: at once). */
  function burnDown(world: WorldState, im: ImpactState, all: boolean): void {
    const hz = world.hazards;
    for (const i of im.fires) {
      if (hz.tile[i] !== HazardTile.Burning) continue;
      const level = all ? 0 : hz.level[i] - 1;
      hz.level[i] = Math.max(0, level);
      if (level > 0) continue;
      hz.tile[i] = HazardTile.None;
      hz.revision++;
    }
  }

  HAZARD_RULES[EventKind.Meteor] = {
    refuse: () => '',

    start(world: WorldState, h: Hazard): void {
      world.dust = clamp(world.dust + METEOR_DUST, 0, 1);
      world.co2 = clamp(world.co2 + METEOR_CO2, 0, 5000);
      if (world.elevation[idx(h.x, h.y)] < 0) {
        around(h.x, h.y, 1, (i) => {
          if (world.elevation[i] < 0) hazardKillLife(world, i, METEOR_SEA_KILL);
        });
        return;
      }
      const depth = METEOR_CRATER_DEPTH * meteorScale(h);
      aroundMeteor(h, (i, dx, dy) => {
        const d = meteorRing(world, h, dx, dy);
        if (d > 2) return;
        if (d === 0) {
          // Nothing of a city is left in the crater, so it leaves no ruins.
          hazardHitCity(world, i, 1, false);
          hazardKillLife(world, i, 1);
          hazardStripPlants(world, i);
          raiseCrust(world, i, -Math.min(depth, Math.max(0, world.elevation[i] - METEOR_CRATER_FLOOR)), UpliftKind.None);
          SuccessionSystem.scour(world, i);
          setScar(world, i, ScarKind.Crater);
        } else if (d === 1) {
          hazardKillLife(world, i, METEOR_RING1_KILL);
          scorch(world, i, METEOR_RING1_KEEP, true);
          hazardHitCity(world, i, 1);
        } else {
          if (hazardRoll(world.seed ^ h.id, i, 0x3e7) < METEOR_RING2_SHARE) {
            hazardKillLife(world, i, METEOR_RING2_KILL);
            scorch(world, i, METEOR_RING2_KEEP, false);
          }
          hazardHitCity(world, i, METEOR_RING2_CITY_LOSS);
        }
      });
    },

    step: () => false,

    finish: () => undefined,
  };

  HAZARD_RULES[EventKind.AtomicBomb] = {
    refuse: () => '',

    start(world: WorldState, h: Hazard): void {
      world.dust = clamp(world.dust + ATOMIC_DUST, 0, 1);
      const hz = world.hazards;
      const im: ImpactState = { fallout: [], fires: [] };
      h.impact = im;
      around(h.x, h.y, 2, (i, _c, dx, dy) => {
        const d = atomicRing(world, h, dx, dy);
        if (d > 2) return;
        if (d <= 1) {
          // Ground zero turns to ash; a tile holds one scar, so its cities leave no ruins.
          const from = LANDSCAPE_LEVEL[world.landscape[i]];
          hazardKillLife(world, i, 1);
          hazardStripPlants(world, i);
          hazardHitCity(world, i, 1, false);
          SuccessionSystem.clear(world, i);
          if (hz.scar[i] !== ScarKind.Vent) setScar(world, i, ScarKind.Ash, from);
          return;
        }
        // A tile another hazard holds (flood, lava, a wildfire) stays that hazard's.
        const fuel = world.elevation[i] >= 0 && world.vegetation[i] >= BARE_COVER && hz.tile[i] === HazardTile.None;
        hazardKillLife(world, i, ATOMIC_RING2_KILL);
        scorch(world, i, ATOMIC_RING2_KEEP, true);
        hazardHitCity(world, i, 1);
        if (fuel) {
          hz.tile[i] = HazardTile.Burning;
          hz.level[i] = ATOMIC_FIRE_TICKS;
          im.fires.push(i);
        }
      });

      const zone = new Set<number>();
      const r = ATOMIC_FALLOUT_RADIUS;
      // The ring's corners lie further out than r, so the zone is rounded off there.
      around(h.x, h.y, r, (i, _d, dx, dy) => {
        if (Math.abs(dx) + Math.abs(dy) < 2 * r) zone.add(i);
      });
      const wind = ClimateSystem.airCurrent(h.y);
      for (let k = 1; k <= ATOMIC_PLUME; k++) {
        around(wrapX(h.x + wind.dx * (r + k)), h.y + wind.dy * (r + k), k < ATOMIC_PLUME ? 1 : 0, (i) => zone.add(i));
      }
      // Under ash, scorch and older scars the fallout waits and takes over when they heal.
      for (const i of zone) {
        im.fallout.push(i);
        if (!lasting(hz.scar[i] as ScarKind)) setScarUnder(world, i, ScarKind.Fallout);
      }
      hz.revision++;
    },

    step(world: WorldState, h: Hazard): boolean {
      const im = h.impact;
      if (!im) return false;
      burnDown(world, im, false);
      for (const i of im.fallout) hazardKillLife(world, i, ATOMIC_FALLOUT_KILL);
      return h.age < ATOMIC_FALLOUT_TICKS;
    },

    finish(world: WorldState, h: Hazard): void {
      const im = h.impact;
      if (!im) return;
      burnDown(world, im, true);
      const left = Math.max(0, ATOMIC_FALLOUT_TICKS - h.age);
      if (left > 0) for (const i of im.fallout) hazardKillLife(world, i, ATOMIC_FALLOUT_KILL * left);
    },
  };
}
