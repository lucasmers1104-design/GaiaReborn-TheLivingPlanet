/* =============================================================================
 * SimEarth 2.0 — wandering bands
 * -----------------------------------------------------------------------------
 * A newly sentient species first roams as a few small bands
 * (docs/zivilisation-spec.md §2.13). Each camps a while, walks a few tiles
 * over land to a better camp and, once it has wandered long enough, settles
 * at a site with food and water and founds a village. The demands relax with
 * time, so every band settles in the end or joins a village. Rolls are hashes
 * of seed, tick and band, so a loaded band goes on exactly as it would have.
 * ========================================================================== */

namespace SE {
  /** What the news calls the thinking kind: the hominids among mammals once they live, else the class. */
  export function mindName(world: WorldState, c: Life = world.sentientClass): string {
    if (c === Life.Mammal) {
      for (let i = 0; i < TILE_COUNT; i++) {
        if (world.density(i, c) > 0 && world.stage(i, c) >= HOMINID_STAGE) return subspeciesName(c, HOMINID_STAGE);
      }
    }
    return LIFE[c].name;
  }

  /** Chronicle key of the sentient species' first village. */
  function settledKey(world: WorldState): string {
    return `civ:settled:${LIFE[world.sentientClass].id}`;
  }

  /** A band of this species has settled; the chronicle remembers it across a load. */
  function hasSettled(world: WorldState): boolean {
    return world.civ.settled || world.evo.chronicle.some((e) => e.key === settledKey(world));
  }

  /** A roll in [0, 1) for band `b`, fixed by seed, tick and `salt`. */
  function roll(world: WorldState, b: Band, salt: number): number {
    return spontaneousRoll(world.seed, world.ticks, b.id * TILE_COUNT + salt);
  }

  function pitch(world: WorldState, b: Band, tile: number): void {
    const [lo, hi] = BAND_CAMP_TICKS;
    b.path = [tile];
    b.step = 0;
    b.campAt = world.ticks;
    b.breakAt = world.ticks + lo + Math.floor(roll(world, b, -1) * (hi - lo + 1));
    if (b.camps[b.camps.length - 1] !== tile) b.camps.push(tile);
    if (b.camps.length > BAND_CAMPS_KEPT) b.camps.shift();
  }

  /**
   * Up to BAND_COUNT bands camped on `site` and on the best fitting tiles
   * within BAND_SPAWN_RANGE steps over land, BAND_SPACING apart. `site` must
   * fit (cityGroundFits).
   */
  export function spawnBands(world: WorldState, site: number): void {
    const civ = world.civ;
    const reach = landWithin(world, site, BAND_SPAWN_RANGE);
    const r = BAND_SPAWN_RANGE;
    const tiles: number[] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const t = tileAt(site, dx, dy);
        if (t >= 0 && t !== site && reach(t) && cityGroundFits(world, t)) tiles.push(t);
      }
    }
    const score = new Map(tiles.map((t) => [t, citySiteScore(world, t)]));
    tiles.sort((a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0) || a - b);
    tiles.unshift(site);
    for (const t of tiles) {
      if (civ.bands.length >= BAND_COUNT) break;
      if (civ.bands.some((o) => tileDistance(o.path[0], t) < BAND_SPACING)) continue;
      const b: Band = {
        id: civ.nextId++, path: [t], step: 0, campAt: -1, breakAt: -1, shelters: 2, pop: BAND_POP, since: world.ticks, camps: [],
      };
      b.shelters = 2 + Math.floor(roll(world, b, -2) * (CAMP_SHELTERS_MAX - 1));
      pitch(world, b, t);
      civ.bands.push(b);
    }
  }

  /** Where the species sets out again when its bands were lost before any settled: its best fitting tile, or -1. */
  function respawnSite(world: WorldState): number {
    const c = world.sentientClass;
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < TILE_COUNT; i++) {
      if (world.density(i, c) <= 0 || !cityGroundFits(world, i)) continue;
      const score = citySiteScore(world, i);
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best;
  }

  /** A band that has wandered `wandered` ticks may settle on `tile`; the demands drop with time. */
  function settlesOn(world: WorldState, params: ModelParams, tile: number, wandered: number): boolean {
    if (wandered < BAND_SETTLE_AFTER || !citySiteAllowed(world, tile)) return false;
    if (wandered >= BAND_SETTLE_MAX) return true;
    const capacity = cityCapacity(world, tile, Tech.Stone, params);
    if (wandered >= BAND_RELAX_AFTER) return capacity >= BAND_RELAX_CAPACITY;
    const g = cityGround(world, tile);
    return capacity >= SENTIENCE_SITE_CAPACITY && (g.river || g.coast || riverBeside(world, tile));
  }

  function settle(world: WorldState, params: ModelParams, b: Band, tile: number): void {
    const civ = world.civ;
    world.tech[tile] = Tech.Stone;
    world.cityPop[tile] = b.pop;
    const c = addCityRecord(world, params, tile);
    adoptTribe(world, c);
    const name = mindName(world);
    if (!hasSettled(world)) {
      civ.news.push({
        text: `Die ersten Gruppen der ${name} werden sesshaft. Ein dauerhaftes Dorf entsteht: ${c.name}.`, tone: 'info', at: tile,
        chronicle: {
          key: settledKey(world), title: 'Sesshaftigkeit',
          change: 'Aus Lagern werden Dörfer: Von hier aus wachsen Städte, und die Steinzeit kann zur Bronzezeit fortschreiten.',
        },
      });
    } else {
      civ.report('bandSettled', world.ticks, CIV_NEWS_GAP, { text: `Eine weitere Gruppe der ${name} wird sesshaft: ${c.name}.`, tone: 'info', at: tile });
    }
    civ.settled = true;
  }

  /** The band's people join the nearest village; false if there is none. */
  function joinVillage(world: WorldState, b: Band): boolean {
    let near: City | undefined;
    let nearD = Infinity;
    for (const c of world.civ.cities) {
      const d = tileDistance(c.tile, b.path[b.step]);
      if (d < nearD) { nearD = d; near = c; }
    }
    if (!near) return false;
    world.cityPop[near.tile] = Math.min(1, world.cityPop[near.tile] + b.pop);
    world.civ.report('bandJoined', world.ticks, CIV_NEWS_GAP, {
      text: `Eine Gruppe der ${mindName(world)} schließt sich ${near.name} an.`, tone: 'info', at: near.tile,
    });
    return true;
  }

  /**
   * The way to the band's next camp: a fitting tile BAND_LEG steps away over
   * land, clear of the other bands, by site score and a little chance, away
   * from its recent camps and from cities, best of all one it may settle on
   * by the time it strikes that camp. Null if no tile fits.
   */
  function nextLeg(world: WorldState, params: ModelParams, b: Band, from: number, wandered: number): number[] | null {
    const others: number[] = [];
    for (const o of world.civ.bands) if (o !== b) others.push(o.path[o.step], o.path[o.path.length - 1]);
    const then = wandered + BAND_LEG[0] + BAND_CAMP_TICKS[0];
    return bestLandRoute(world, from, BAND_LEG[1], (t, d) => {
      if (d < BAND_LEG[0] || !cityGroundFits(world, t) || others.some((o) => tileDistance(o, t) < BAND_SPACING)) return -Infinity;
      let v = citySiteScore(world, t) + BAND_JITTER * roll(world, b, t);
      if (b.camps.some((c) => tileDistance(c, t) < BAND_SPACING)) v -= BAND_REVISIT;
      if (cityTooClose(world, t) >= 0) v -= BAND_CITY_AVOID;
      if (settlesOn(world, params, t, then)) v += BAND_SETTLE_BONUS;
      return v;
    });
  }

  /** Land beside a band the plates left on water, along its row as for a city (cities.ts), or -1. */
  function dryLand(world: WorldState, tile: number): number {
    for (const dx of [1, -1, 2, -2]) {
      const j = tileAt(tile, dx, 0);
      if (!world.isWater(j)) return j;
    }
    return -1;
  }

  /**
   * One tick of the bands: a camp is struck at `breakAt` and the band settles
   * there or walks on, one tile a tick; a way the sea cuts ends in a camp
   * where the band stands. A species whose bands were lost before any
   * settled (a dropped save field, an old save) sets out again.
   */
  export function stepBands(world: WorldState, params: ModelParams): void {
    const civ = world.civ;
    if (!isLandLife(world.sentientClass)) return;
    if (civ.bands.length === 0 && civ.cities.length === 0 && civ.settlers.length === 0 && !hasSettled(world)) {
      const site = respawnSite(world);
      if (site >= 0) spawnBands(world, site);
    }
    for (const b of civ.bands.slice()) {
      let here = b.path[b.step];
      if (world.isWater(here)) {
        here = dryLand(world, here);
        if (here < 0) {
          civ.bands.splice(civ.bands.indexOf(b), 1);
          continue;
        }
        b.path = [here];
        b.step = 0;
      }
      if (b.campAt < 0) {
        if (b.path.slice(b.step + 1).some((t) => world.isWater(t))) b.path.length = b.step + 1;
        b.step = Math.min(b.step + 1, b.path.length - 1);
        if (b.step === b.path.length - 1) pitch(world, b, b.path[b.step]);
        continue;
      }
      if (world.ticks < b.breakAt) continue;
      const wandered = world.ticks - b.since;
      if (settlesOn(world, params, here, wandered)) {
        civ.bands.splice(civ.bands.indexOf(b), 1);
        settle(world, params, b, here);
        continue;
      }
      const way = nextLeg(world, params, b, here, wandered);
      if (wandered >= BAND_SETTLE_MAX && !(way && settlesOn(world, params, way[way.length - 1], wandered)) && joinVillage(world, b)) {
        civ.bands.splice(civ.bands.indexOf(b), 1);
        continue;
      }
      if (!way) {
        pitch(world, b, here);
        continue;
      }
      b.path = way;
      b.step = 0;
      b.campAt = -1;
    }
  }
}
