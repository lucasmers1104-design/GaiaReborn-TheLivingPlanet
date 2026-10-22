/* =============================================================================
 * SimEarth 2.0 — the space project
 * -----------------------------------------------------------------------------
 * Once a city of the sentient species, whichever it is, reaches the Nanotech
 * age, its civilization begins a space project: once per planet, the tick
 * after (so the age's own chronicle entry comes first). The launch site
 * always lies in the desert: the desert tile nearest to a Nanotech city that
 * is flat, dry and free, with no water, river, city or oil derrick under the
 * pad, its apron or the rocket rising above it (spaceSiteFits); semi-desert and
 * then other open land only where the planet has no such desert. Nothing on
 * the map is overwritten. The rocket then grows by
 * itself in four phases (SPACE_PHASE_AT) while at least one inhabited
 * Nanotech city exists, a little faster the more people live in them
 * (SPACE_RATE_MIN..MAX, capped). Ready, it waits for the player's launch.
 *
 * A site that becomes unusable — a city, lava, a crater, a fissure, scree,
 * a flood or the sea on the pad, a river through it, ground made too steep
 * by a quake, the brush or drift — is given up: the build moves to the best
 * free site (the same search) and falls back to the start of the phase
 * under way (a ready rocket to the start of the full rocket), never further.
 * Without a free site it rests and looks again every SPACE_SITE_RETRY ticks;
 * without a Nanotech city it rests until there is one again. No random
 * numbers are drawn: planets keep their history.
 *
 * News goes out through `world.civ.news`. Pure simulation, no DOM.
 * ========================================================================== */

namespace SE {
  export const enum SpacePhase { Pad = 0, Stage = 1, Rocket = 2, Ready = 3 }

  /** Why the build stands still: not unlocked yet, no inhabited Nanotech city, no site, launched; '' while it goes on or waits ready. */
  export type SpacePause = '' | 'locked' | 'noCity' | 'noSite' | 'launched';

  /** Chronicle keys of the project. */
  export const SPACE_KEY_UNLOCKED = 'space:unlocked';
  export const SPACE_KEY_READY = 'space:ready';
  export const SPACE_KEY_LAUNCHED = 'space:launched';

  /** Hazards on a tile that wreck a pad standing there. */
  const WRECKING_HAZARDS: ReadonlySet<number> = new Set([HazardTile.Lava, HazardTile.Flood, HazardTile.Rubble]);
  /** Scars no pad can be built on, nor stand on. Burnt, scorched, muddy or ashen ground only needs sweeping. */
  const WRECKING_SCARS: ReadonlySet<number> = new Set([
    ScarKind.Basalt, ScarKind.Vent, ScarKind.Crater, ScarKind.FissureH, ScarKind.FissureV, ScarKind.FissureD1,
    ScarKind.FissureD2, ScarKind.Scree, ScarKind.Ruins,
  ]);

  /** The phase of a build at `progress`: Pad, Stage and Rocket while it grows, Ready at 1. */
  export function spacePhase(progress: number): SpacePhase {
    let k = 0;
    while (k + 1 < SPACE_PHASE_AT.length && progress >= SPACE_PHASE_AT[k + 1]) k++;
    return k as SpacePhase;
  }

  /** The inhabited Nanotech cities. */
  export function nanotechCities(world: WorldState): City[] {
    return world.civ.cities.filter((c) => world.tech[c.tile] === Tech.Nanotech && world.cityPop[c.tile] > 0);
  }

  /** Speed factor of the build from the people of the Nanotech cities, SPACE_RATE_MIN..SPACE_RATE_MAX; 0 without one. */
  export function spaceRate(world: WorldState, cities: readonly City[] = nanotechCities(world)): number {
    if (cities.length === 0) return 0;
    let people = 0;
    for (const c of cities) people += world.cityPop[c.tile];
    return SPACE_RATE_MIN + (SPACE_RATE_MAX - SPACE_RATE_MIN) * clamp(people / SPACE_POP_FULL, 0, 1);
  }

  export function spacePause(world: WorldState): SpacePause {
    const s = world.space;
    if (s.launched >= 0) return 'launched';
    if (s.unlocked < 0) return 'locked';
    if (nanotechCities(world).length === 0) return 'noCity';
    if (s.site < 0) return 'noSite';
    return '';
  }

  /** Ticks left to the ready rocket at today's pace; Infinity while it rests, 0 once ready. */
  export function spaceTicksLeft(world: WorldState): number {
    const s = world.space;
    if (s.progress >= 1) return 0;
    const rate = spacePause(world) === '' ? spaceRate(world) : 0;
    return rate > 0 ? Math.ceil(((1 - s.progress) * SPACE_BUILD_TICKS) / rate) : Infinity;
  }

  /** The pad tile's ground is wrecked by a disaster or its aftermath. */
  function wrecked(world: WorldState, i: number): boolean {
    return WRECKING_HAZARDS.has(world.hazards.tile[i]) || WRECKING_SCARS.has(world.hazards.scar[i]);
  }

  const ground = newCityGround();
  /** Ground no pad stands on, whatever the climate makes of it later: ice, snow, bare rock faces, alpine meadow, bog. */
  const NO_PAD: ReadonlySet<number> = new Set([Landscape.Ice, Landscape.Snow, Landscape.Rock, Landscape.Alpine, Landscape.Marsh, Landscape.Swampforest]);

  /**
   * A launch site may stand on tile `i`: dry, flat land below the tree line
   * without a river or a wrecking scar, land beside it for the apron, no
   * city or oil derrick under the apron or the rising rocket, and no city
   * closer than SPACE_CITY_GAP. A built site keeps standing on any such
   * ground; only the search asks for desert (findSpaceSite).
   */
  export function spaceSiteFits(world: WorldState, i: number): boolean {
    const y = Math.floor(i / GRID_W);
    if (y < SPACE_RISE || y >= GRID_H - 1) return false;
    if (world.tech[i] !== Tech.None || wrecked(world, i) || NO_PAD.has(world.landscape[i]) || aboveTreeLine(world, i)) return false;
    cityGround(world, i, ground);
    if (ground.water || ground.river || ground.slope > SPACE_SLOPE_MAX) return false;
    for (const dx of [-1, 1]) {
      const j = tileAt(i, dx, 0);
      if (world.isWater(j) || world.riverLevel[j] > 0 || wrecked(world, j)) return false;
      if (Math.abs(world.elevation[j] - world.elevation[i]) > SPACE_SLOPE_MAX) return false;
    }
    for (let dy = -SPACE_RISE; dy <= SPACE_CITY_GAP; dy++) {
      for (let dx = -SPACE_CITY_GAP; dx <= SPACE_CITY_GAP; dx++) {
        const j = tileAt(i, dx, dy);
        if (j < 0) continue;
        const under = Math.abs(dx) <= 1 && dy <= 0;
        if (under && (world.isWater(j) || world.riverLevel[j] > 0)) return false;
        const near = under || tileDistance(i, j) < SPACE_CITY_GAP;
        if (near && (j === world.oilRigLand || world.tech[j] !== Tech.None || (world.landUse[j] & LAND_USE_WONDER) !== 0)) return false;
      }
    }
    return true;
  }

  /**
   * Search rank of tile `i`'s landscape: desert 0, semi-desert 1, other open
   * land 2 (only for a planet without a free desert site, so the build never
   * stalls for good), forest and the like −1 (never).
   */
  function siteTier(world: WorldState, i: number): number {
    const ls = world.landscape[i];
    if (ls === Landscape.Desert) return 0;
    if (ls === Landscape.Semidesert) return 1;
    return LANDSCAPE_LEVEL[ls] <= 3 ? 2 : -1;
  }

  /**
   * The launch site: always in the desert if the planet has a free one —
   * the desert tile nearest to a Nanotech city, then the nearest semi-desert,
   * and only without either the driest open land nearest to one. Flatter
   * ground breaks near-ties; full ties go to the first tile. −1 if none fits.
   */
  export function findSpaceSite(world: WorldState, cities: readonly City[]): number {
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < TILE_COUNT; i++) {
      const tier = siteTier(world, i);
      if (tier < 0 || world.isWater(i) || !spaceSiteFits(world, i)) continue;
      // Settlers bound for a site there would found their city under the rocket; a termite mound would stand in it.
      if (world.civ.settlers.some((t) => tileDistance(t.path[t.path.length - 1], i) < SPACE_CITY_GAP)) continue;
      if (world.termiteMound >= 0 && tileDistance(world.termiteMound, i) < SPACE_CITY_GAP) continue;
      let d = Infinity;
      for (const c of cities) d = Math.min(d, tileDistance(c.tile, i));
      cityGround(world, i, ground);
      const score = tier * 1e6 + (tier === 2 ? world.moisture[i] * 1e4 : 0) + d + SITE_SLOPE * ground.slope;
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return best;
  }

  /** Where the site lies, for the news. */
  function siteWhere(world: WorldState, i: number): string {
    const ls = world.landscape[i];
    return ls === Landscape.Desert ? 'in der Wüste' : ls === Landscape.Semidesert ? 'in der Halbwüste' : 'auf trockenem, offenem Land';
  }

  /** The Nanotech city nearest to tile `i`, for the news. */
  function nearestCity(world: WorldState, i: number, cities: readonly City[]): City | undefined {
    let best: City | undefined;
    for (const c of cities) if (!best || tileDistance(c.tile, i) < tileDistance(best.tile, i)) best = c;
    return best;
  }

  function news(world: WorldState, text: string, tone: 'info' | 'warn', at: number, chronicle?: CivNews['chronicle']): void {
    world.civ.news.push({ text, tone, at, space: true, chronicle });
  }

  /** One tick of the project; call before the cities advance their tech, so a new age is reported first. */
  export function stepSpaceport(world: WorldState): void {
    const s = world.space;
    if (s.launched >= 0) return;
    const cities = nanotechCities(world);
    if (s.unlocked < 0) {
      if (cities.length === 0) return;
      s.unlocked = world.ticks;
      const city = cities[0];
      news(world, `${city.name} erreicht als erste Stadt das Nanotech-Zeitalter. ${mindName(world)} wollen ihre Heimatwelt verlassen: Ein Raumhafen soll entstehen.`,
        'info', city.tile, {
          key: SPACE_KEY_UNLOCKED, title: 'Aufbruch ins All', major: true,
          change: 'In der Wüste wächst nun von selbst eine Rakete, solange eine bewohnte Nanotech-Stadt besteht. Den Fortschritt zeigt das Fenster „Raumfahrt“.',
        });
    }
    let lost = false;
    if (s.site >= 0 && !spaceSiteFits(world, s.site)) {
      const phase = spacePhase(s.progress);
      s.progress = Math.min(s.progress, SPACE_PHASE_AT[Math.min(phase, SpacePhase.Rocket)]);
      s.announced = Math.min(s.announced, spacePhase(s.progress));
      s.site = -1;
      s.retryAt = 0;
      s.moves++;
      lost = true;
    }
    if (s.site < 0) {
      if (cities.length === 0 || world.ticks < s.retryAt) return;
      const site = findSpaceSite(world, cities);
      const city = nearestCity(world, site >= 0 ? site : cities[0].tile, cities) as City;
      if (site < 0) {
        s.retryAt = world.ticks + SPACE_SITE_RETRY;
        if (lost) news(world, 'Der Bauplatz der Rakete ist unbrauchbar geworden. Noch findet sich kein neuer – der Bau ruht und sucht weiter.', 'warn', city.tile);
        return;
      }
      s.site = site;
      if (lost || s.moves > 0) {
        news(world, `${lost ? 'Der Bauplatz der Rakete ist unbrauchbar geworden. ' : ''}Der Raumhafen von ${city.name} entsteht neu ${siteWhere(world, site)}: ` +
          `Der Bau setzt mit „${SPACE_PHASE_NAMES[spacePhase(s.progress)]}“ wieder ein.`, 'warn', site);
      } else if (s.announced < SpacePhase.Pad) {
        s.announced = SpacePhase.Pad;
        news(world, `${city.name} baut ${siteWhere(world, site)} Fundament und Startplatz eines Raumhafens.`, 'info', site);
      }
    }
    if (cities.length === 0 || s.progress >= 1) return;
    s.progress = Math.min(1, s.progress + spaceRate(world, cities) / SPACE_BUILD_TICKS);
    const phase = spacePhase(s.progress);
    if (phase <= s.announced) return;
    s.announced = phase;
    if (phase === SpacePhase.Ready) {
      // Ready again after a move: the chronicle has its entry already, a message says it.
      const again = world.evo.chronicle.some((e) => e.key === SPACE_KEY_READY);
      news(world, 'Die Rakete steht startbereit auf der Rampe. Sie wartet auf deinen Startbefehl.', 'info', s.site, again ? undefined : {
        key: SPACE_KEY_READY, title: 'Die Rakete ist startbereit',
        change: 'Im Fenster „Raumfahrt“ startest du sie mit „Start in neue Welten“ – wann du willst.',
      });
    } else if (phase !== SpacePhase.Pad) {
      news(world, phase === SpacePhase.Stage
        ? 'Raumhafen: Die untere Raketenstufe wächst im Baugerüst empor.'
        : 'Raumhafen: Die Rakete ist vollständig und steht am Startturm.', 'info', s.site);
    }
  }

  /** Why the rocket may not launch now, or '' if it may. The app asks again on the click itself. */
  export function spaceLaunchProblem(world: WorldState): string {
    const s = world.space;
    if (s.launched >= 0) return 'Die Rakete ist bereits gestartet.';
    if (s.unlocked < 0) return 'Das Raumfahrtprojekt beginnt erst mit dem Nanotech-Zeitalter.';
    if (s.progress < 1) return 'Die Rakete ist noch nicht fertig.';
    if (s.site < 0 || !spaceSiteFits(world, s.site)) return 'Die Rakete hat keinen intakten Startplatz.';
    if (nanotechCities(world).length === 0) return 'Ohne bewohnte Nanotech-Stadt gibt es keine Startmannschaft.';
    return '';
  }

  /** Launch: once, only while spaceLaunchProblem is ''. True if it launched. */
  export function commitLaunch(world: WorldState): boolean {
    if (spaceLaunchProblem(world)) return false;
    world.space.launched = world.ticks;
    world.space.launchedYears = world.absoluteYears;
    return true;
  }

  /* -------------------------------------------------------------- save -- */

  interface SavedSpace {
    readonly unlocked: number;
    readonly site: number;
    readonly progress: number;
    readonly launched: number;
    readonly launchedYears: number;
    readonly announced: number;
    readonly retryAt: number;
    readonly moves: number;
  }

  export function spaceToJSON(world: WorldState): SavedSpace {
    const s = world.space;
    return {
      unlocked: s.unlocked, site: s.site, progress: s.progress, launched: s.launched,
      launchedYears: s.launchedYears, announced: s.announced, retryAt: s.retryAt, moves: s.moves,
    };
  }

  /** Read a saved project into `into`; false (and `into` untouched) if any part is unsound for a planet at `ticks`. */
  export function readSpace(raw: unknown, ticks: number, into: SpaceState): boolean {
    if (!raw || typeof raw !== 'object') return false;
    const r = raw as Record<string, unknown>;
    const int = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
    const { unlocked, site, progress, launched, launchedYears, announced, retryAt, moves } = r;
    if (!int(unlocked, -1, ticks) || !int(site, -1, TILE_COUNT - 1) || !int(launched, -1, ticks)) return false;
    if (typeof progress !== 'number' || !(progress >= 0 && progress <= 1)) return false;
    if (typeof launchedYears !== 'number' || !Number.isFinite(launchedYears) || launchedYears < 0) return false;
    if (!int(announced, -1, SpacePhase.Ready) || !int(retryAt, 0, Number.MAX_SAFE_INTEGER) || !int(moves, 0, Number.MAX_SAFE_INTEGER)) return false;
    // A locked project has nothing; a launch needs the ready rocket.
    if (unlocked < 0 && (site >= 0 || progress > 0 || launched >= 0)) return false;
    if (launched >= 0 && progress < 1) return false;
    into.unlocked = unlocked;
    into.site = site;
    into.progress = progress;
    into.launched = launched;
    into.launchedYears = launchedYears;
    into.announced = announced;
    into.retryAt = retryAt;
    into.moves = moves;
    return true;
  }
}
