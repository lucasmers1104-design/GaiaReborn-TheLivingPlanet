/* =============================================================================
 * SimEarth 2.0 — hunger and epidemics
 * -----------------------------------------------------------------------------
 * A city over its capacity starves back towards it; a full city with nowhere
 * to send settlers risks an epidemic that spreads to its neighbours
 * (docs/zivilisation-spec.md §2.7). The only natural plague: the old one in
 * geo.ts is gone (decision E5); the player's plague tool still uses it.
 * ========================================================================== */

namespace SE {
  /** Population after one tick of hunger, for a city over its capacity. */
  export function starve(pop: number, capacity: number): number {
    return pop - (pop - capacity) * HUNGER_RATE;
  }

  /** Share of the risk a city keeps by its tech level, and from the industrial age by medicine. */
  function protection(world: WorldState, params: ModelParams, c: City): number {
    const t = world.tech[c.tile];
    if (t < Tech.Industrial) return EPIDEMIC_TECH[t];
    const [lo, hi] = EPIDEMIC_MEDICINE;
    return EPIDEMIC_TECH[t] * (1 - (lo + (hi - lo) * clamp(params.civAlloc.medicine, 0, 1)));
  }

  /** Chance of an outbreak this tick: none without scarcity, more the fuller and the longer scarce. */
  export function epidemicRisk(world: WorldState, params: ModelParams, c: City): number {
    if (c.scarcity <= 0 || world.ticks < c.immuneUntil || c.capacity <= 0) return 0;
    const fill = world.cityPop[c.tile] / c.capacity;
    return EPIDEMIC_RISK * fill * fill * Math.min(EPIDEMIC_SCARCITY_MAX, 1 + c.scarcity / EPIDEMIC_SCARCITY) *
      protection(world, params, c);
  }

  function breakOut(world: WorldState, c: City, caught: boolean): void {
    const civ = world.civ;
    world.cityPop[c.tile] *= 1 - EPIDEMIC_HIT;
    c.immuneUntil = world.ticks + EPIDEMIC_IMMUNITY;
    civ.outbreaks.push({ city: c.id, until: world.ticks + EPIDEMIC_TICKS });
    world.eventKind[c.tile] = EventKind.Plague;
    world.eventTtl[c.tile] = EPIDEMIC_MARK_TTL;
    civ.report('plague', world.ticks, CIV_NEWS_GAP, {
      text: caught ? `Die Seuche greift auf ${c.name} über.` : `Seuche in ${c.name}.`, tone: 'warn', at: c.tile,
    });
  }

  /** Running outbreaks wear on and spread; scarce cities may fall ill. */
  export function spreadEpidemics(world: WorldState, params: ModelParams): void {
    const civ = world.civ;
    for (const o of civ.outbreaks.slice()) {
      const c = civ.city(o.city);
      if (!c || world.ticks > o.until) {
        civ.outbreaks.splice(civ.outbreaks.indexOf(o), 1);
        continue;
      }
      world.cityPop[c.tile] *= 1 - EPIDEMIC_DECAY;
      // One jump a tick at most, to one of the neighbours: a chance per
      // neighbour let one outbreak seed several in a densely settled world.
      if (!world.rng.chance(EPIDEMIC_SPREAD)) continue;
      const near = civ.cities.filter((d) => d !== c && world.ticks >= d.immuneUntil &&
        tileDistance(c.tile, d.tile) <= CIV_NEIGHBOUR_DIST);
      if (near.length === 0) continue;
      const d = near[world.rng.int(near.length)];
      if (world.rng.next() < protection(world, params, d)) breakOut(world, d, true);
    }
    for (const c of civ.cities) {
      const risk = epidemicRisk(world, params, c);
      if (risk > 0 && world.rng.chance(risk)) breakOut(world, c, false);
    }
  }
}
