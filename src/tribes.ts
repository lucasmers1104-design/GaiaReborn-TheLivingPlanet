/* =============================================================================
 * SimEarth 2.0 — tribes
 * -----------------------------------------------------------------------------
 * Every city belongs to a people with its own colour (docs/zivilisation-spec.md
 * §2.6, §2.11): new cities join their mother city's people unless they lie far
 * from its capital or across water; old distant cities rarely break away.
 * ========================================================================== */

namespace SE {
  /** A new people whose first city and capital is `capital`, in the lowest free colour, with a name no other people bears. */
  export function foundTribe(world: WorldState, capital: City, parent: number): Tribe {
    const civ = world.civ;
    let color = 0;
    while (civ.tribes.some((t) => t.color === color)) color++;
    let name = '';
    for (let attempt = 0; !name || civ.tribes.some((o) => o.name === name); attempt++) {
      name = civName(world.seed, capital.tile % GRID_W, Math.floor(capital.tile / GRID_W), true, attempt);
    }
    const t: Tribe = {
      id: civ.nextId++, color, parent, capital: capital.id, founded: world.ticks, landShort: false, shortUntil: 0, name,
    };
    civ.tribes.push(t);
    capital.tribe = t.id;
    civ.revision++;
    return t;
  }

  function announce(world: WorldState, t: Tribe, c: City, text: string, change: string): void {
    world.civ.news.push({
      text, tone: 'info', at: c.tile,
      chronicle: { key: `civ:tribe:${world.ticks}:${t.id}`, title: `Neues Volk: ${t.name}`, change },
    });
  }

  /** The tribe of the city nearest to `tile`, or -1. */
  function nearestTribe(world: WorldState, tile: number, except?: City): { tribe: number; d: number } {
    let tribe = -1;
    let best = Infinity;
    for (const c of world.civ.cities) {
      if (c === except || c.tribe < 0) continue;
      const d = tileDistance(tile, c.tile);
      if (d < best) { best = d; tribe = c.tribe; }
    }
    return { tribe, d: best };
  }

  /** The people of a city founded by settlers of `tribeId` (spec §2.6). */
  export function settleTribe(world: WorldState, c: City, tribeId: number, crossed: boolean): void {
    const civ = world.civ;
    const tribe = civ.tribe(tribeId);
    if (crossed && !world.evo.chronicle.some((e) => e.key === 'civ:crossing')) {
      civ.news.push({
        text: `Erste Überfahrt: Siedler gründen ${c.name} jenseits des Wassers.`, tone: 'info', at: c.tile,
        chronicle: { key: 'civ:crossing', title: 'Erste Überfahrt', change: 'Völker können nun auch andere Küsten besiedeln.' },
      });
    }
    const capital = tribe ? civ.city(tribe.capital) : undefined;
    const far = capital !== undefined && tileDistance(capital.tile, c.tile) >= TRIBE_SPLIT_DIST;
    if (tribe && !far && !crossed) {
      c.tribe = tribe.id;
      return;
    }
    // The distance rule leaves the last colours free for crossings and splits;
    // crossings the last one for the colonists of a continent still to be discovered.
    const kept = crossed && civ.tribes.length === TRIBE_MAX - 1 ? colourForColonists(world) : 0;
    if (civ.tribes.length >= (crossed || !tribe ? TRIBE_MAX - kept : TRIBE_FAR_MAX)) {
      // Colonists on the discovered continent join the nearest people there (discovery.ts).
      const colony = crossed ? colonyTribe(world, c) : -1;
      c.tribe = colony >= 0 ? colony : tribe ? tribe.id : nearestTribe(world, c.tile, c).tribe;
      return;
    }
    const t = foundTribe(world, c, tribe ? tribe.id : -1);
    if (crossed) {
      announce(world, t, c, `Neues Volk: Die ${t.name} gründen ${c.name} jenseits des Wassers.`,
        'Siedler sind übers Wasser gezogen und bilden ein eigenes Volk mit eigener Farbe.');
    } else {
      announce(world, t, c, `Neues Volk: Die ${t.name} gründen ${c.name}.`,
        'Fern der Hauptstadt entsteht ein eigenes Volk mit eigener Farbe.');
    }
  }

  /** The people of a city that appeared without settlers: the nearest in settlers' reach, else a new one. */
  export function adoptTribe(world: WorldState, c: City): void {
    const civ = world.civ;
    const near = nearestTribe(world, c.tile, c);
    if (near.tribe >= 0 && (near.d <= SETTLER_RANGE[world.tech[c.tile]] || civ.tribes.length >= TRIBE_MAX)) {
      c.tribe = near.tribe;
      civ.revision++;
      return;
    }
    const first = civ.tribes.length === 0;
    const t = foundTribe(world, c, -1);
    if (!first) {
      announce(world, t, c, `Neues Volk: Die ${t.name} in ${c.name}.`,
        'Eine Stadt fern der anderen Völker begründet ein eigenes Volk mit eigener Farbe.');
    }
  }

  /** A fallen capital passes to the biggest city; a people without cities or settlers is gone. */
  export function updateTribes(world: WorldState): void {
    const civ = world.civ;
    for (let k = civ.tribes.length - 1; k >= 0; k--) {
      const t = civ.tribes[k];
      let biggest: City | undefined;
      let capital = false;
      for (const c of civ.cities) {
        if (c.tribe !== t.id) continue;
        if (c.id === t.capital) { capital = true; break; }
        if (!biggest || world.cityPop[c.tile] > world.cityPop[biggest.tile]) biggest = c;
      }
      if (capital) continue;
      if (biggest) {
        t.capital = biggest.id;
      } else {
        if (civ.settlers.some((s) => s.tribe === t.id)) continue;
        civ.tribes.splice(k, 1);
      }
      civ.revision++;
    }
  }

  /**
   * Rarely a people splits (spec §2.6): its city furthest from the capital,
   * if old and far enough, breaks away with the cities nearer to it. One roll
   * per people, not per city, so a big people does not split ever more often.
   */
  export function splitTribes(world: WorldState): void {
    const civ = world.civ;
    if (world.ticks % TRIBE_SPLIT_EVERY !== 0 || civ.tribes.length >= TRIBE_MAX) return;
    for (const tribe of civ.tribes.slice()) {
      const capital = civ.city(tribe.capital);
      if (!capital) continue;
      let c: City | undefined;
      let far = TRIBE_SPLIT_MIN_DIST;
      for (const o of civ.cities) {
        if (o.tribe !== tribe.id || o === capital || world.ticks - o.founded < TRIBE_SPLIT_AGE) continue;
        const d = tileDistance(o.tile, capital.tile);
        if (d >= far) { far = d; c = o; }
      }
      if (!c || !world.rng.chance(TRIBE_SPLIT_CHANCE)) continue;
      // The last colour waits for the first colony of a continent still to be discovered (discovery.ts).
      if (civ.tribes.length === TRIBE_MAX - 1 && colourForColonists(world) > 0) return;
      const t = foundTribe(world, c, tribe.id);
      for (const o of civ.cities) {
        if (o.tribe === tribe.id && tileDistance(o.tile, c.tile) < tileDistance(o.tile, capital.tile)) o.tribe = t.id;
      }
      announce(world, t, c, `Die ${t.name} in ${c.name} sagen sich von den ${tribe.name} los.`,
        'Ein Teil des Volkes geht eigene Wege, mit eigener Farbe und eigener Hauptstadt.');
      return;
    }
  }

  /**
   * Peoples for cities derived from the grid (spec §2.11): the biggest free
   * city leads a people of every free city within TRIBE_SPLIT_DIST over land;
   * beyond TRIBE_MAX the smallest joins its nearest neighbour. Colours follow
   * the capitals' tile order.
   */
  export function deriveTribes(world: WorldState): void {
    const civ = world.civ;
    const byPop = civ.cities.slice().sort((a, b) => world.cityPop[b.tile] - world.cityPop[a.tile] || a.tile - b.tile);
    const taken = new Set<City>();
    const groups: City[][] = [];
    for (const capital of byPop) {
      if (taken.has(capital)) continue;
      const reach = landWithin(world, capital.tile, TRIBE_SPLIT_DIST);
      const group = [capital];
      taken.add(capital);
      for (const c of byPop) {
        if (!taken.has(c) && reach(c.tile)) { group.push(c); taken.add(c); }
      }
      groups.push(group);
    }
    while (groups.length > TRIBE_MAX) {
      let small = 0;
      for (let k = 1; k < groups.length; k++) if (groups[k].length <= groups[small].length) small = k;
      const [gone] = groups.splice(small, 1);
      let into = 0;
      let best = Infinity;
      groups.forEach((g, k) => {
        const d = tileDistance(g[0].tile, gone[0].tile);
        if (d < best) { best = d; into = k; }
      });
      groups[into].push(...gone);
    }
    groups.sort((a, b) => a[0].tile - b[0].tile);
    for (const g of groups) {
      const t = foundTribe(world, g[0], -1);
      for (const c of g) c.tribe = t.id;
    }
  }
}
