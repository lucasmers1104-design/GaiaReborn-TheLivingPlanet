/* =============================================================================
 * SimEarth 2.0 — the hurricane's lightning and its rain floods
 * -----------------------------------------------------------------------------
 * docs/ereignisse-spec.md §3.4. Lightning: in the tick after each step a
 * moving storm sends down 0–4 bolts by strength, within ring 3 of its eye,
 * mostly into the eyewall and the bands. Where they fall is a pure hash of
 * the seed, the hazard and the age, read off the storm's track, so the
 * screen and the simulation see the same bolts at any later time. Their
 * consequences land a tick later, once the screen has drawn them: on land
 * the ground is scorched, life and cities lose a little, and a bolt on dry
 * plants may set them on fire (the hurricane's chain in hazardchain.ts).
 * Rain: over land the storm floods low land in its eye and ring 1 with
 * shallow water that runs off again into mud (hazardflood.ts).
 * ========================================================================== */

namespace SE {
  /** Tiles struck in the tick after hazard age `age`, in strike order; none once the storm has stopped. */
  export function stormStrikesAt(world: WorldState, h: Hazard, age: number): number[] {
    const st = h.storm;
    if (!st || age < 0 || age >= st.path.length || (age === st.path.length - 1 && !st.moving)) return [];
    const s = st.strengths[age];
    if (!(s > 0)) return [];
    const band = s >= 3 ? 2 : s >= 2 ? 1 : 0;
    const seed = world.seed ^ h.id;
    const lo = STORM_STRIKES_MIN[band];
    const count = lo + Math.floor(hazardRoll(seed, age, 0x5701) * (STORM_STRIKES_MAX[band] - lo + 1));
    const eye = st.path[age];
    const ex = eye % GRID_W;
    const ey = (eye / GRID_W) | 0;
    const out: number[] = [];
    for (let n = 0; out.length < count && n < 4 * count; n++) {
      let roll = hazardRoll(seed, age, 0x5702 + 2 * n);
      let r = 1;
      while (r < 3 && roll >= STORM_STRIKE_RINGS[r - 1]) roll -= STORM_STRIKE_RINGS[r++ - 1];
      // The k-th of the 8r tiles on ring r, clockwise from its north-west corner.
      const k = Math.floor(hazardRoll(seed, age, 0x5703 + 2 * n) * 8 * r);
      const o = k % (2 * r);
      const side = (k / (2 * r)) | 0;
      const dx = side === 0 ? o - r : side === 1 ? r : side === 2 ? r - o : -r;
      const dy = side === 0 ? -r : side === 1 ? o - r : side === 2 ? r : r - o;
      const y = ey + dy;
      if (y < 0 || y >= GRID_H) continue;
      const i = idx(wrapX(ex + dx), y);
      if (!out.includes(i)) out.push(i);
    }
    return out;
  }

  /**
   * The tiles lightning strikes between world tick `tick` and the next: the
   * screen draws them then, the simulation applies them in the storm's next
   * step. The same answer at any later tick while the hazard runs.
   */
  export function stormStrikes(world: WorldState, h: Hazard, tick: number): number[] {
    return stormStrikesAt(world, h, h.age - (world.ticks - tick));
  }

  /** The bolts of the tick before come down: scorched ground, a little life and a few people lost. */
  export function hazardStormStrike(world: WorldState, h: Hazard): void {
    for (const i of stormStrikesAt(world, h, h.age - 1)) {
      if (world.elevation[i] < 0) continue;
      hazardKillLife(world, i, STORM_STRIKE_LIFE_LOSS);
      const scar = world.hazards.scar[i];
      // Only plants scorch (bare rock and sand show nothing), and only unscarred ground: thrown forest stays thrown.
      if (world.tech[i] === Tech.None && scar === ScarKind.None && world.vegetation[i] >= STORM_SCORCH_COVER) setScar(world, i, ScarKind.Scorched);
      hazardHitCity(world, i, STORM_STRIKE_CITY_LOSS);
    }
  }

  /** Rain over land: low ground and rivers in the eye and ring 1 flood shallow, rising tile by tile in this tick. */
  export function hazardStormRain(world: WorldState, h: Hazard, eye: number): void {
    const seed = world.seed ^ h.id;
    const ex = eye % GRID_W;
    const ey = (eye / GRID_W) | 0;
    const tiles: number[] = [];
    const at: number[] = [];
    const off: number[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      const y = ey + dy;
      if (y < 0 || y >= GRID_H) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const i = idx(wrapX(ex + dx), y);
        const e = world.elevation[i];
        if (e < 0 || world.tech[i] !== Tech.None || (e >= STORM_FLOOD_LOW && world.riverLevel[i] <= 0)) continue;
        const rise = h.age - 1 + 0.8 * hazardRoll(seed, i, 0x5704);
        tiles.push(i);
        at.push(rise);
        off.push(rise + STORM_FLOOD_TICKS + Math.floor(hazardRoll(seed, i, 0x5705) * (STORM_FLOOD_SPAN + 1)));
      }
    }
    hazardStandWater(world, h, tiles, STORM_FLOOD_DEPTH, at, off);
  }
}
