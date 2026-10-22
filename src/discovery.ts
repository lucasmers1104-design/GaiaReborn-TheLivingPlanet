/* =============================================================================
 * SimEarth 2.0 — the voyage of discovery that opens the Industrial age
 * -----------------------------------------------------------------------------
 * A continent without a city may lie across the sea (docs/bewegung-2026-10).
 * While one does, the first invention of the Industrial age is held and a
 * coastal city sends three sailing ships to the largest such continent
 * instead. Their landfall founds the first colony and frees the invention;
 * from then on settlers of the Iron Age and later sail the open sea to the
 * new continent's coasts and found peoples of their own there. Without such
 * a continent, or without a port and a way to it for DISCOVERY_WAIT ticks,
 * the gate lapses. No world.rng: choices are the nearest or the best, the
 * one roll a hash of seed, tick and city.
 * ========================================================================== */

namespace SE {
  export interface Discovery {
    /** 'open' before the voyage, 'sailing' under way, 'found' after landfall, 'waived' when there was nothing to find. */
    state: 'open' | 'sailing' | 'found' | 'waived';
    /** Read by railway.ts: the coastal tile the voyage reached, −1 before. Follows plate drift like a city. */
    landfall: number;
    /** `City.id` whose invention of the Industrial age waits for the discovery; −1 or missing: none. */
    held?: number;
    /** Tick the held invention began to wait for a port and a way. */
    since?: number;
    /** Tick the ships set out on their present way. */
    departed?: number;
  }

  /** The eight neighbours, the four straight ones first: east, west, south, north. */
  const DX = [1, -1, 0, 0, 1, 1, -1, -1];
  const DY = [0, 0, 1, -1, 1, -1, 1, -1];
  let around = new Int32Array(0);

  /** Neighbour k of every tile at [8 × tile + k], x wrapping, −1 beyond a pole; built once, for the searches over the whole planet. */
  function neighbours(): Int32Array {
    if (around.length !== 8 * TILE_COUNT) {
      around = new Int32Array(8 * TILE_COUNT);
      for (let i = 0; i < TILE_COUNT; i++) for (let k = 0; k < 8; k++) around[8 * i + k] = tileAt(i, DX[k], DY[k]);
    }
    return around;
  }

  let labelled: WorldState | null = null;
  let labelledAt = -1;
  let labelledDrift = -1;
  let labels: Landmasses | null = null;

  /**
   * The planet's landmasses, labelled at most once a tick; for colonists
   * (`fresh` false) labels up to DISCOVERY_EVERY ticks old do unless the
   * plates moved, since labelling the whole planet is not cheap.
   */
  function landNow(world: WorldState, fresh = true): Landmasses {
    const age = world.ticks - labelledAt;
    if (!labels || labelled !== world || labelledDrift !== world.driftShifts || age < 0 || (fresh ? age > 0 : age >= DISCOVERY_EVERY)) {
      labels = landmasses(world);
      labelled = world;
      labelledAt = world.ticks;
      labelledDrift = world.driftShifts;
    }
    return labels;
  }

  let seen = new Int32Array(0);
  let back = new Int32Array(0);
  let steps = new Int32Array(0);
  let queue = new Int32Array(0);
  let stamp = 0;

  function buffers(): void {
    if (seen.length === TILE_COUNT) return;
    seen = new Int32Array(TILE_COUNT);
    back = new Int32Array(TILE_COUNT);
    steps = new Int32Array(TILE_COUNT);
    queue = new Int32Array(TILE_COUNT);
  }

  /**
   * The new continent: the largest landmass without a city that has
   * DISCOVERY_MIN_LAND tiles or more and DISCOVERY_MIN_SITES city sites, as
   * a label of `landNow`; −1 when there is none. Whether Iron Age settlers
   * could have crossed to it does not matter: they have not settled it.
   */
  function newContinent(world: WorldState): number {
    const { label, size } = landNow(world);
    const settled = size.map(() => false);
    for (const c of world.civ.cities) if (label[c.tile] >= 0) settled[label[c.tile]] = true;
    const sites: number[][] = size.map(() => []);
    for (let i = 0; i < TILE_COUNT; i++) {
      const l = label[i];
      if (l < 0 || settled[l] || size[l] < DISCOVERY_MIN_LAND) continue;
      const got = sites[l];
      if (got.length >= DISCOVERY_MIN_SITES || !cityGroundFits(world, i)) continue;
      if (got.every((t) => tileDistance(t, i) >= CITY_MIN_DIST) && citySiteScore(world, i) >= SITE_MIN_SCORE) got.push(i);
    }
    let best = -1;
    for (let l = 0; l < size.length; l++) {
      if (sites[l].length >= DISCOVERY_MIN_SITES && (best < 0 || size[l] > size[best])) best = l;
    }
    return best;
  }

  /**
   * Breadth-first over the sea from `sources`, open sea of any width, at
   * most `range` steps: the way to the land tile `value(tile, steps)` rates
   * highest, the nearest first on a tie; null if it rates every one
   * −Infinity. Land ends a way and is never crossed, so every tile it finds
   * lies on a coast; no slipping diagonally between two land tiles.
   */
  function seaRoute(
    world: WorldState, sources: readonly number[], range: number, value: (tile: number, d: number) => number,
  ): number[] | null {
    buffers();
    const nb = neighbours();
    const cur = ++stamp;
    let head = 0;
    let tail = 0;
    for (const s of sources) {
      if (seen[s] === cur) continue;
      seen[s] = cur;
      back[s] = -1;
      steps[s] = 0;
      queue[tail++] = s;
    }
    let best = -Infinity;
    let at = -1;
    while (head < tail) {
      const i = queue[head++];
      const d = steps[i] + 1;
      if (d > range) continue;
      for (let k = 0; k < 8; k++) {
        const j = nb[8 * i + k];
        if (j < 0 || seen[j] === cur) continue;
        if (k >= 4 && !world.isWater(nb[8 * i + (DX[k] > 0 ? 0 : 1)]) && !world.isWater(nb[8 * i + (DY[k] > 0 ? 2 : 3)])) continue;
        seen[j] = cur;
        back[j] = i;
        steps[j] = d;
        if (world.isWater(j)) {
          queue[tail++] = j;
        } else {
          const v = value(j, d);
          if (v > best) { best = v; at = j; }
        }
      }
    }
    if (at < 0) return null;
    const path: number[] = [];
    for (let t = at; t >= 0; t = back[t]) path.push(t);
    return path.reverse();
  }

  /** How a landing rates for the ships: on the new continent `target`, a city site before any other coast, the nearest first. */
  function landing(world: WorldState, target: number): (tile: number, d: number) => number {
    const { label } = landNow(world);
    return (tile, d) => label[tile] !== target ? -Infinity : (citySiteAllowed(world, tile) ? 0 : -TILE_COUNT) - d;
  }

  /** Ticks a crossing of `tiles` takes: DISCOVERY_VOYAGE_SPEED tiles a tick, within DISCOVERY_VOYAGE_TICKS. */
  function voyageTicks(tiles: number): number {
    return clamp(Math.round(tiles / DISCOVERY_VOYAGE_SPEED), DISCOVERY_VOYAGE_TICKS[0], DISCOVERY_VOYAGE_TICKS[1]);
  }

  /**
   * The Industrial gate, asked by advanceCityTech for every Iron Age city at
   * its people's best level after its roll: whether the city reaches the
   * Industrial age now. While an undiscovered continent waits, the first
   * invention is held and the ships set out (stepDiscovery); after the
   * landfall, or once the gate has lapsed, the held one comes at once.
   */
  export function industrialGate(world: WorldState, c: City, invented: boolean): boolean {
    const civ = world.civ;
    const d = civ.discovery;
    if (d.state === 'found' || d.state === 'waived') {
      if (d.held !== c.id) return invented;
      d.held = -1;
      return true;
    }
    if (!invented) return false;
    if (d.held === undefined || !civ.city(d.held)) {
      if (d.state === 'open' && (civ.topTech >= Tech.Industrial || !isLandLife(world.sentientClass) || newContinent(world) < 0)) {
        d.state = 'waived';
        return true;
      }
      d.held = c.id;
      d.since = world.ticks;
    }
    return false;
  }

  /** The ships set out for the new continent from the port with the shortest way over the sea, the held people's own first; none while all can wait. */
  function setSail(world: WorldState, d: Discovery): void {
    const civ = world.civ;
    // Not bound by SETTLERS_MAX: waiting for a free settlers' slot held the Industrial age up to DISCOVERY_WAIT.
    const target = newContinent(world);
    if (target < 0) {
      d.state = 'waived';
      return;
    }
    const people = civ.city(d.held ?? -1)?.tribe;
    // A port gives the crew and keeps a city.
    const ports = (own: boolean): number[] => civ.cities
      .filter((c) => world.tech[c.tile] >= Tech.Iron && world.cityPop[c.tile] >= 2 * SETTLER_POP && (!own || c.tribe === people))
      .map((c) => c.tile);
    const value = landing(world, target);
    const path = seaRoute(world, ports(true), TILE_COUNT, value) ?? seaRoute(world, ports(false), TILE_COUNT, value);
    const port = path ? civ.cityAt(path[0]) : undefined;
    if (!path || !port) return;
    world.cityPop[port.tile] -= SETTLER_POP;
    civ.settlers.push({
      id: civ.nextId++, tribe: port.tribe, from: port.id, tech: world.tech[port.tile] as Tech, path, step: 0,
      pop: SETTLER_POP, crossed: true, voyage: true,
    });
    d.state = 'sailing';
    d.departed = world.ticks;
    const name = civ.tribe(port.tribe)?.name;
    civ.news.push({
      text: `Aufbruch ins Unbekannte: Drei Schiffe${name ? ` der ${name}` : ''} laufen aus ${port.name} aus, hinaus aufs offene Meer.`,
      tone: 'info', at: port.tile,
      chronicle: {
        key: 'civ:voyage', title: 'Aufbruch ins Unbekannte', major: true,
        change: 'Seefahrer der späten Eisenzeit wagen sich zum ersten Mal weit über das offene Meer, außer Sicht jeder Küste. ' +
          'Das Industriezeitalter beginnt erst, wenn sie Land finden. Auf der Erde überquerte Kolumbus 1492 mit drei Schiffen den Atlantik.',
      },
    });
  }

  /** The rest of the ships' way is still sea and ends on land. */
  function afloat(world: WorldState, s: Settler): boolean {
    const end = s.path.length - 1;
    for (let k = s.step + 1; k < end; k++) if (!world.isWater(s.path[k])) return false;
    return end > 0 && !world.isWater(s.path[end]);
  }

  /** The ships reach the coast: the discovery, and the first colony where a city may stand. */
  function landfall(world: WorldState, params: ModelParams, s: Settler): void {
    const civ = world.civ;
    civ.settlers.splice(civ.settlers.indexOf(s), 1);
    const tile = s.path[s.path.length - 1];
    const d = civ.discovery;
    d.state = 'found';
    d.landfall = tile;
    const name = civ.tribe(s.tribe)?.name;
    // The discovery is told before the colony's new people.
    const at = civ.news.length;
    let colony = '';
    if (citySiteAllowed(world, tile)) {
      world.tech[tile] = s.tech;
      world.cityPop[tile] = s.pop;
      colony = ` Dort entsteht ${foundCity(world, params, tile, s.tribe, true).name}.`;
    }
    civ.news.splice(at, 0, {
      text: `Ein neuer Kontinent: Die Schiffe${name ? ` der ${name}` : ''} erreichen eine unbekannte Küste.${colony}`,
      tone: 'info', at: tile,
      chronicle: {
        key: 'civ:discovery', title: 'Ein neuer Kontinent', major: true,
        change: 'Handel und Auswanderung über den Ozean beginnen: Siedler können nun das offene Meer zum neuen Kontinent ' +
          'überqueren und gründen dort eigene Völker. Im Spiel öffnet die Entdeckung den Weg ins Industriezeitalter; ' +
          'auf der Erde trugen Rohstoffe und Märkte aus Übersee zur Industrialisierung bei.',
      },
    });
  }

  /** One tick at sea, paced by `voyageTicks`; a way the plates cut is planned again from where the ships are. */
  function sail(world: WorldState, params: ModelParams, d: Discovery): void {
    const civ = world.civ;
    const s = civ.settlers.find((x) => x.voyage);
    if (s && !afloat(world, s)) {
      const target = newContinent(world);
      const path = target >= 0 ? seaRoute(world, [s.path[s.step]], TILE_COUNT, landing(world, target)) : null;
      if (path) {
        s.path = path;
        s.step = 0;
        d.departed = world.ticks;
      } else {
        civ.settlers.splice(civ.settlers.indexOf(s), 1);
      }
    }
    if (!s || !civ.settlers.includes(s)) {
      // Lost: the held invention sends ships again, or the gate lapses.
      d.state = 'open';
      d.since = world.ticks;
      return;
    }
    const end = s.path.length - 1;
    s.step = Math.min(end, Math.floor((world.ticks - (d.departed ?? world.ticks)) * end / voyageTicks(end)));
    if (s.step >= end) landfall(world, params, s);
  }

  /**
   * A held invention looks for a port every DISCOVERY_EVERY ticks. The gate
   * lapses after DISCOVERY_WAIT, and at once when the Industrial age came
   * another way (the city tool, an older save).
   */
  function awaitPort(world: WorldState, d: Discovery): void {
    const civ = world.civ;
    if (civ.topTech >= Tech.Industrial) {
      d.state = 'waived';
      return;
    }
    if (d.held === undefined || d.held < 0) return;
    if (!civ.city(d.held)) {
      d.held = -1;
      return;
    }
    const waited = world.ticks - (d.since ?? world.ticks);
    if (waited >= DISCOVERY_WAIT) d.state = 'waived';
    else if (waited % DISCOVERY_EVERY === 0) setSail(world, d);
  }

  /** Plate drift: a landfall the sea took moves along its row to land, as a city does. */
  function keepAshore(world: WorldState, d: Discovery): void {
    if (d.landfall < 0 || !world.isWater(d.landfall)) return;
    for (const dx of [1, -1, 2, -2]) {
      const j = tileAt(d.landfall, dx, 0);
      if (!world.isWater(j)) {
        d.landfall = j;
        return;
      }
    }
  }

  /** One civilization tick of the voyage of discovery (civ.ts calls it after the conflicts). */
  export function stepDiscovery(world: WorldState, params: ModelParams): void {
    const d = world.civ.discovery;
    if (d.state === 'open') awaitPort(world, d);
    else if (d.state === 'sailing') sail(world, params, d);
    else if (d.state === 'found') keepAshore(world, d);
  }

  /**
   * Colonists' way after the discovery (migration.ts asks first for
   * `colonyFirst` departures, else when a city found no other site):
   * settlers of the Iron Age and later sail from a coastal
   * city over the open sea, within DISCOVERY_COLONY_RANGE, to the best site
   * on a coast of the discovered continent; settling inland follows from the
   * colonies by the usual rules. `except` and `keep` as in findSettlerRoute.
   */
  export function colonyRoute(world: WorldState, from: number, tech: Tech, except?: Settler, keep = -1): SettlerRoute | null {
    const d = world.civ.discovery;
    if (d.state !== 'found' || d.landfall < 0 || tech < Tech.Iron) return null;
    const { label } = landNow(world, false);
    const home = label[d.landfall];
    if (home < 0 || label[from] === home) return null;
    // The spacing test is the dear one: only for a site that would beat the best so far.
    let top = -Infinity;
    const path = seaRoute(world, [from], DISCOVERY_COLONY_RANGE, (tile, steps) => {
      if (label[tile] !== home || !cityGroundFits(world, tile)) return -Infinity;
      let value = Infinity;
      if (tile !== keep) {
        const score = citySiteScore(world, tile);
        if (score < SITE_MIN_SCORE) return -Infinity;
        value = score - SETTLER_PATH_COST * steps;
      }
      if (value <= top || !citySiteAllowed(world, tile, except)) return -Infinity;
      top = value;
      return value;
    });
    return path ? { path, crossed: true, colony: true } : null;
  }

  /**
   * Colours crossings and splits leave free (tribes.ts): one while a
   * continent waits to be discovered, so that its first colony founds a
   * people of its own.
   */
  export function colourForColonists(world: WorldState): number {
    const s = world.civ.discovery.state;
    return (s === 'open' || s === 'sailing') && newContinent(world) >= 0 ? 1 : 0;
  }

  /** This departure from city `c` tries the discovered continent first: DISCOVERY_COLONY_SHARE of them, by a hash roll, not world.rng. */
  export function colonyFirst(world: WorldState, c: City): boolean {
    return world.civ.discovery.state === 'found' && spontaneousRoll(world.seed ^ 0x51ed27, world.ticks, c.id) < DISCOVERY_COLONY_SHARE;
  }

  /** The people of the city nearest to `c` on the discovered continent, for colonists when every colour is taken; −1 if none. */
  export function colonyTribe(world: WorldState, c: City): number {
    const d = world.civ.discovery;
    if (d.state !== 'found' || d.landfall < 0) return -1;
    const { label } = landNow(world, false);
    const home = label[d.landfall];
    if (home < 0 || label[c.tile] !== home) return -1;
    let tribe = -1;
    let best = Infinity;
    for (const o of world.civ.cities) {
      if (o === c || o.tribe < 0 || label[o.tile] !== home) continue;
      const dist = tileDistance(o.tile, c.tile);
      if (dist < best) { best = dist; tribe = o.tribe; }
    }
    return tribe;
  }

  /** The optional save field `discovery`; undefined writes none. */
  export function discoveryToJSON(world: WorldState): unknown {
    const d = world.civ.discovery;
    const held = world.civ.city(d.held ?? -1)?.tile;
    if (d.state === 'open' && d.landfall < 0 && held === undefined) return undefined;
    // Ships under way are lost on load, like settlers: the held invention sends them again.
    return { state: d.state === 'sailing' ? 'open' : d.state, landfall: d.landfall, held };
  }

  const STATES: readonly string[] = ['open', 'sailing', 'found', 'waived'];

  /** Take over the optional save field `discovery` after the civilization's records (save.ts); a missing or unsound one changes nothing. */
  export function restoreDiscovery(world: WorldState, raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) return;
    const r = raw as Record<string, unknown>;
    const tile = (v: unknown, min: number): boolean => Number.isInteger(v) && (v as number) >= min && (v as number) < TILE_COUNT;
    if (typeof r.state !== 'string' || !STATES.includes(r.state) || !tile(r.landfall, r.state === 'found' ? 0 : -1)) return;
    if (r.held !== undefined && !tile(r.held, 0)) return;
    const civ = world.civ;
    civ.discovery = {
      state: r.state === 'sailing' ? 'open' : r.state as Discovery['state'],
      landfall: r.landfall as number,
      held: r.held === undefined ? -1 : civ.cityAt(r.held as number)?.id ?? -1,
      since: world.ticks,
    };
  }
}
