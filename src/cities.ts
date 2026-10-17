/* =============================================================================
 * SimEarth 2.0 — cities
 * -----------------------------------------------------------------------------
 * City records beside the grid (docs/zivilisation-spec.md §2.1, §2.3, §2.4,
 * §2.11): derived from it after a load, matched to it every tick against
 * plate drift, disasters and the player, grown by the food of their
 * surroundings, and advanced in tech level by invention and by exchange
 * inside their people.
 * ========================================================================== */

namespace SE {
  /** Where to look for a city plate drift has moved: same row, nearest first. */
  const DRIFT_STEPS = [1, -1, 2, -2];

  /** The name of the place, or the next one for it while another city bears that name. */
  function uniqueCityName(world: WorldState, tile: number): string {
    for (let attempt = 0; ; attempt++) {
      const name = civName(world.seed, tile % GRID_W, Math.floor(tile / GRID_W), false, attempt);
      if (!world.civ.cities.some((c) => c.name === name)) return name;
    }
  }

  /** A record for the city standing on `tile`, without a people yet; `name` is kept from a save. */
  export function addCityRecord(world: WorldState, params: ModelParams, tile: number, name = uniqueCityName(world, tile)): City {
    const civ = world.civ;
    const c: City = {
      id: civ.nextId++, tile, tribe: -1, name,
      founded: world.ticks, capacity: cityCapacity(world, tile, world.tech[tile], params),
      scarcity: 0, settleAfter: world.ticks + SETTLER_COOLDOWN[world.tech[tile]], immuneUntil: 0, cramped: false,
    };
    civ.addCity(c);
    return c;
  }

  /** A city founded by settlers of `tribe` on `tile`, whose tech and people are on the grid already. */
  export function foundCity(world: WorldState, params: ModelParams, tile: number, tribe: number, crossed: boolean): City {
    const c = addCityRecord(world, params, tile);
    settleTribe(world, c, tribe, crossed);
    return c;
  }

  function loseCity(world: WorldState, c: City, text: string): void {
    const civ = world.civ;
    civ.removeCity(c);
    for (let k = civ.outbreaks.length - 1; k >= 0; k--) if (civ.outbreaks[k].city === c.id) civ.outbreaks.splice(k, 1);
    civ.report('cityLost', world.ticks, CIV_NEWS_GAP, { text, tone: 'warn', at: c.tile });
  }

  /** Move the people of tile `from` into the city on `into`, up to its capacity; returns that capacity. */
  function mergeInto(world: WorldState, params: ModelParams, into: number, from: number): number {
    const tech = Math.max(world.tech[into], world.tech[from]) as Tech;
    world.tech[into] = tech;
    const cap = cityCapacity(world, into, tech, params);
    const pop = world.cityPop[into];
    world.cityPop[into] = Math.max(pop, Math.min(cap, pop + world.cityPop[from]));
    world.tech[from] = Tech.None;
    world.cityPop[from] = 0;
    return cap;
  }

  /** Another city tile lies closer than CITY_MIN_DIST: the tile is part of an old city carpet. */
  function inCarpet(world: WorldState, i: number): boolean {
    for (let k = 0; k < CITY_NEAR_DISC.length; k += 2) {
      const j = tileAt(i, CITY_NEAR_DISC[k], CITY_NEAR_DISC[k + 1]);
      if (j >= 0 && j !== i && world.tech[j] !== Tech.None) return true;
    }
    return false;
  }

  /**
   * Records from the grid, for a loaded or new planet (spec §2.11): carpet
   * tiles on forbidden ground go first, then the rest is thinned out by
   * population so that no two stand closer than CITY_MIN_DIST, and peoples
   * are derived. A lone city whose ground turned forbidden in play stays, as
   * it would have in play.
   */
  export function deriveCities(world: WorldState, params: ModelParams): void {
    const civ = world.civ;
    civ.clear();
    const ground = newCityGround();
    const tiles: number[] = [];
    const clear: number[] = [];
    for (let i = 0; i < TILE_COUNT; i++) {
      if (world.tech[i] === Tech.None) continue;
      if (cityGround(world, i, ground).forbidden && inCarpet(world, i)) clear.push(i);
      else tiles.push(i);
    }
    for (const i of clear) {
      world.tech[i] = Tech.None;
      world.cityPop[i] = 0;
    }
    tiles.sort((a, b) => world.cityPop[b] - world.cityPop[a] || a - b);
    const kept: number[] = [];
    for (const t of tiles) {
      let near = -1;
      let nearD = CITY_MIN_DIST;
      for (const k of kept) {
        const d = tileDistance(t, k);
        if (d < nearD) { nearD = d; near = k; }
      }
      if (near >= 0) mergeInto(world, params, near, t);
      else kept.push(t);
    }
    for (const t of kept) addCityRecord(world, params, t).settleAfter = loadedSettleAfter(world, t);
    deriveTribes(world);
    civ.driftSeen = world.driftShifts;
    civ.calmUntil = world.ticks + CONFLICT_LOAD_CALM;
    civ.synced = true;
    const parts: string[] = [];
    if (clear.length > 0) parts.push(`${clear.length} Stadtfelder auf Fels, Wüste oder Eis geräumt.`);
    if (kept.length < tiles.length) {
      parts.push(`${tiles.length} Stadtfelder zu ${kept.length} Städten mit mindestens ${CITY_MIN_DIST} Feldern Abstand zusammengelegt.`);
    }
    if (parts.length > 0) civ.news.push({ text: parts.join(' '), tone: 'info', at: kept.length > 0 ? kept[0] : -1 });
  }

  /** A city tile without a record (the player, the Monolith, a new mind): a new city, or part of one too close. */
  function adoptCity(world: WorldState, params: ModelParams, tile: number): void {
    let near: City | undefined;
    let nearD = CITY_MIN_DIST;
    for (const c of world.civ.cities) {
      const d = tileDistance(tile, c.tile);
      if (d < nearD) { nearD = d; near = c; }
    }
    if (near) {
      near.capacity = mergeInto(world, params, near.tile, tile);
      return;
    }
    adoptTribe(world, addCityRecord(world, params, tile));
  }

  /** Two cities the plates pushed closer than CITY_MIN_DIST become one: the smaller joins the bigger. */
  function mergeCrowded(world: WorldState, params: ModelParams): void {
    const civ = world.civ;
    for (let merged = true; merged;) {
      merged = false;
      for (const a of civ.cities) {
        const b = civ.cities.find((o) => o !== a && tileDistance(a.tile, o.tile) < CITY_MIN_DIST);
        if (!b) continue;
        const [big, small] = world.cityPop[a.tile] >= world.cityPop[b.tile] ? [a, b] : [b, a];
        big.capacity = mergeInto(world, params, big.tile, small.tile);
        civ.removeCity(small);
        merged = true;
        break;
      }
    }
  }

  /**
   * Match the records to the grid (spec §2.1): a record whose tile lost its
   * city looks two tiles along its row for where drift took it, else the city
   * is gone; a city whose ground sank below the sea is given up; a city tile
   * without a record is adopted. True if the plates moved since the last match.
   */
  export function reconcileCities(world: WorldState, params: ModelParams): boolean {
    const civ = world.civ;
    for (const c of civ.cities.slice()) {
      if (world.tech[c.tile] === Tech.None) {
        let moved = -1;
        for (const dx of DRIFT_STEPS) {
          const j = tileAt(c.tile, dx, 0);
          if (world.tech[j] !== Tech.None && !civ.cityAt(j)) { moved = j; break; }
        }
        if (moved < 0) {
          loseCity(world, c, `${c.name} ist untergegangen.`);
          continue;
        }
        civ.moveCity(c, moved);
      }
      if (world.isWater(c.tile)) {
        world.tech[c.tile] = Tech.None;
        world.cityPop[c.tile] = 0;
        loseCity(world, c, `${c.name} versinkt im Meer.`);
      }
    }
    for (let i = 0; i < TILE_COUNT; i++) {
      if (world.tech[i] === Tech.None || civ.cityAt(i)) continue;
      if (world.isWater(i)) {
        world.tech[i] = Tech.None;
        world.cityPop[i] = 0;
      } else {
        adoptCity(world, params, i);
      }
    }
    if (world.driftShifts === civ.driftSeen) return false;
    civ.driftSeen = world.driftShifts;
    mergeCrowded(world, params);
    refreshCapacities(world, params);
    return true;
  }

  export function refreshCapacities(world: WorldState, params: ModelParams): void {
    for (const c of world.civ.cities) c.capacity = cityCapacity(world, c.tile, world.tech[c.tile], params);
  }

  /**
   * Logistic growth towards capacity, hunger above it, and the scarcity
   * count of a full city that has nowhere to send settlers (spec §2.3).
   */
  export function growCities(world: WorldState, params: ModelParams): void {
    const vigour = (0.9 + 0.1 * mul(params.civAlloc.artMedia)) * (0.8 + 0.2 * mul(params.civAlloc.medicine));
    const settles = isLandLife(world.sentientClass);
    for (const c of world.civ.cities.slice()) {
      const i = c.tile;
      const cap = c.capacity;
      let pop = world.cityPop[i];
      if (pop > cap) pop = starve(pop, cap);
      else if (cap > 0) pop += pop * CITY_GROWTH[world.tech[i]] * vigour * (1 - pop / cap);
      if (pop < CITY_ABANDON_POP) {
        world.tech[i] = Tech.None;
        world.cityPop[i] = 0;
        loseCity(world, c, `${c.name} wurde aufgegeben.`);
        continue;
      }
      world.cityPop[i] = Math.min(1, pop);
      // Scarce is full with nowhere to go; a city that just sent settlers is not.
      if (pop >= SETTLER_DEPART_SHARE * cap && (c.cramped || !settles)) c.scarcity++;
      else if (c.scarcity > 0) c.scarcity--;
    }
  }

  /** Share of the full chance to invent the level after `t`, by the number of cities on the planet. */
  function civilizationShare(cities: number, t: Tech): number {
    if (cities < TECH_CITIES_MIN[t]) return 0;
    const share = Math.min(1, cities / TECH_CIVILIZATION[t]);
    return share * share;
  }

  /** A city of another people within CIV_NEIGHBOUR_DIST knows more than tech level `t`. */
  function neighbourAhead(world: WorldState, c: City, t: Tech): boolean {
    return world.civ.cities.some((o) => o.tribe !== c.tribe && world.tech[o.tile] > t &&
      tileDistance(o.tile, c.tile) <= CIV_NEIGHBOUR_DIST);
  }

  /**
   * A people with no land left to settle lately, all of it on one landmass
   * (an island): it invents at the full rate, or it could never reach the
   * water it has to cross. A sea people never settles, so it counts as well.
   */
  function isolated(world: WorldState, tribe: Tribe | undefined, lead: City): boolean {
    if (!isLandLife(world.sentientClass)) return true;
    if (!tribe || !tribe.landShort || world.ticks >= tribe.shortUntil) return false;
    const reach = landWithin(world, lead.tile, TECH_ISOLATION_REACH);
    return world.civ.cities.every((o) => o.tribe !== tribe.id || reach(o.tile));
  }

  /**
   * Cooldowns are not saved. Spread by tile over one cooldown, so a loaded
   * planet does not send every full city's settlers out on the same tick.
   */
  export function loadedSettleAfter(world: WorldState, tile: number): number {
    let h = Math.imul(tile ^ world.seed, 0x9e3779b1);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca77);
    h ^= h >>> 13;
    return world.ticks + (h >>> 0) % Math.max(1, SETTLER_COOLDOWN[world.tech[tile]] ?? 1);
  }

  /**
   * Science moves cities up the tech levels (spec §2.4). Each people invents
   * in its leading city — the most populous at its best level. A level new to
   * the planet comes at the planet's rate times the people's share of the
   * planet's population, so the pace does not grow with the number of
   * peoples; one known elsewhere at the full rate. A planet with fewer cities
   * than the level calls for invents more slowly. A people's best level first
   * has to spread to TECH_SPREAD_SHARE of its cities before it invents the
   * next. A city behind the best of its people catches up by exchange, one
   * behind a neighbouring people by trade. Returns the highest level any city
   * reached this tick.
   */
  export function advanceCityTech(world: WorldState, params: ModelParams): Tech {
    const civ = world.civ;
    const rng = world.rng;
    const science = mul(params.civAlloc.science);
    const best = new Map<number, number>();
    const people = new Map<number, number>();
    const size = new Map<number, number>();
    let total = 0;
    let top = 0;
    for (const c of civ.cities) {
      const t = world.tech[c.tile];
      const pop = world.cityPop[c.tile];
      best.set(c.tribe, Math.max(best.get(c.tribe) ?? 0, t));
      people.set(c.tribe, (people.get(c.tribe) ?? 0) + pop);
      size.set(c.tribe, (size.get(c.tribe) ?? 0) + 1);
      total += pop;
      top = Math.max(top, t);
    }
    if (top > civ.topTech) {
      civ.topTech = top;
      civ.topSince = world.ticks;
    }
    const young = world.ticks - civ.topSince < TECH_MIN_AGE;
    const lead = new Map<number, City>();
    const atBest = new Map<number, number>();
    for (const c of civ.cities) {
      if (world.tech[c.tile] < (best.get(c.tribe) ?? 0)) continue;
      atBest.set(c.tribe, (atBest.get(c.tribe) ?? 0) + 1);
      const l = lead.get(c.tribe);
      if (!l || world.cityPop[c.tile] > world.cityPop[l.tile]) lead.set(c.tribe, c);
    }
    let reached = Tech.None;
    for (const c of civ.cities) {
      const t = world.tech[c.tile] as Tech;
      if (t >= Tech.Nanotech) continue;
      const pop = world.cityPop[c.tile];
      let up = false;
      if (t < (best.get(c.tribe) ?? 0)) {
        up = rng.chance(TECH_EXCHANGE);
      } else {
        // A level known elsewhere on the planet is found again at the full rate;
        // only a new one is shared out by population.
        const share = t < top ? 1 : (people.get(c.tribe) ?? 0) / total;
        if (lead.get(c.tribe) === c && pop >= TECH_ADVANCE_MIN_POP && !(t >= top && young) &&
          (atBest.get(c.tribe) ?? 0) >= TECH_SPREAD_SHARE * (size.get(c.tribe) ?? 0) &&
          rng.chance(TECH_ADVANCE[t] * science * share)) {
          // Rolled at the full chance first, so isolation is looked at only on a hit.
          up = isolated(world, civ.tribe(c.tribe), c) || rng.next() < civilizationShare(civ.cities.length, t);
        }
        if (!up && t < top && rng.chance(TECH_TRADE)) up = neighbourAhead(world, c, t);
      }
      if (!up) continue;
      world.tech[c.tile] = t + 1;
      c.capacity = cityCapacity(world, c.tile, t + 1, params);
      if (t + 1 > reached) reached = t + 1;
    }
    return reached;
  }
}
