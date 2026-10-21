/* =============================================================================
 * SimEarth 2.0 — civilization state
 * -----------------------------------------------------------------------------
 * Cities, tribes, settlers, epidemics and conflicts as records beside the
 * grid. The grid (`tech`, `cityPop`) stays the truth for where a city stands,
 * its tech level and its people: plate drift, disasters and the save file all
 * work on it unchanged. These records add who lives there and what is under
 * way. They live in memory only and are derived again from the grid after a
 * load (docs/zivilisation-spec.md §2.1, §2.11). Pure data, no DOM.
 *
 * The fields documented as read by the map are the contract with the map
 * layers (citylayer.ts, civfigures.ts); the rest is the simulation's own
 * bookkeeping and may change with it.
 * ========================================================================== */

namespace SE {
  export const enum CitySize { Village = 0, Town = 1, Metropolis = 2 }
  export const CITY_SIZE_NAMES: readonly string[] = ['Dorf', 'Stadt', 'Großstadt'];

  export function citySize(pop: number): CitySize {
    return pop >= CITY_METRO_POP ? CitySize.Metropolis : pop >= CITY_TOWN_POP ? CitySize.Town : CitySize.Village;
  }

  export interface City {
    readonly id: number;
    /** Read by the map. Follows plate drift. */
    tile: number;
    /** Read by the map: `Tribe.id`. */
    tribe: number;
    /** Read by the map. */
    readonly name: string;
    /** Tick of founding (of the load, for a city derived from a save). */
    founded: number;
    /** Carrying capacity of its surroundings, 0..1. */
    capacity: number;
    /** Ticks in a row over capacity with nowhere to send settlers. */
    scarcity: number;
    /** No settlers leave before this tick. */
    settleAfter: number;
    /** No epidemic breaks out before this tick. */
    immuneUntil: number;
    /** Its last search for a settlers' site found none. */
    cramped: boolean;
  }

  export interface Tribe {
    readonly id: number;
    /** Read by the map: index into the tribe colours, 0..TRIBE_MAX-1. */
    readonly color: number;
    /** Read by the map: the people's name, plural ("Arkani"). */
    readonly name: string;
    /** Tribe it split from, or -1. */
    parent: number;
    /** `City.id` of its capital. */
    capital: number;
    founded: number;
    /** A settler group of this tribe found no site lately. */
    landShort: boolean;
    /** Tick until which that failed search counts as isolation; a later failure renews it. */
    shortUntil: number;
  }

  export interface Settler {
    readonly id: number;
    /** Read by the map. */
    tribe: number;
    /** `City.id` of the mother city (it may be gone by now). */
    from: number;
    /** Read by the map: the tech level the group carries. */
    tech: Tech;
    /** Read by the map: tiles from the mother city to the site. */
    path: number[];
    /** Read by the map: index into `path` of the tile it stands on. */
    step: number;
    pop: number;
    /** Its way leads across water to another shore. */
    crossed: boolean;
  }

  /**
   * A wandering group of the newly sentient species before it settles
   * (docs/zivilisation-spec.md §2.13): it walks `path` to its next camp,
   * camps there a while and at last founds a village. No tribe yet: peoples
   * begin with the first villages.
   */
  export interface Band {
    readonly id: number;
    /** Read by the map: tiles from its last camp to the next one; just [tile] while camped. */
    path: number[];
    /** Read by the map: index into `path` of the tile it stands on. */
    step: number;
    /** Read by the map: tick it pitched its camp on `path[step]`, or -1 while it walks. */
    campAt: number;
    /** Read by the map: the tick it strikes camp (and walks on, or settles there). */
    breakAt: number;
    /** Read by the map: shelters its camp has, 1..CAMP_SHELTERS_MAX. */
    shelters: number;
    /** People it carries; a village it founds starts with them. */
    pop: number;
    /** Tick it set out: how long it has wandered. */
    since: number;
    /** Tiles of its last camps, newest last, so it moves on rather than back. */
    camps: number[];
  }

  /**
   * Shelters of a band's camp standing at `tick`: one more each tick after
   * it is pitched, one fewer each tick before it is struck, the last one
   * still standing on the tick it is struck (the map draws between ticks, so
   * the camp never vanishes before the band walks on or its village
   * appears); 0 while it walks.
   */
  export function campShelters(b: Band, tick: number): number {
    if (b.campAt < 0) return 0;
    return Math.max(0, Math.min(tick - b.campAt + 1, b.breakAt - tick + 1, b.shelters));
  }

  export interface Outbreak {
    readonly city: number;
    until: number;
  }

  export interface Conflict {
    /** Read by the map: the two cities fighting (`City.id`); `a` attacks, `b` is fought over. */
    readonly a: number;
    readonly b: number;
    readonly started: number;
    /** Read by the map: the last tick it is shown. */
    until: number;
    /** The peoples of `a` and `b` at the start; one may be gone by the end. */
    readonly sides: readonly [Tribe, Tribe];
  }

  /** A short message for the player from one civilization step, optionally also a chronicle entry. */
  export interface CivNews {
    readonly text: string;
    readonly tone: 'info' | 'warn';
    /** Tile it happened on. */
    readonly at: number;
    /** Set for news worth a chronicle entry: unique key, title and what changes. */
    readonly chronicle?: { readonly key: string; readonly title: string; readonly change: string; readonly major?: boolean };
    /** News of the space project (spaceport.ts): the player can open its window from it. */
    readonly space?: boolean;
  }

  export class CivState {
    readonly cities: City[] = [];
    readonly tribes: Tribe[] = [];
    readonly settlers: Settler[] = [];
    /** Read by the map: wandering groups before (and while) the first villages are founded. */
    readonly bands: Band[] = [];
    readonly outbreaks: Outbreak[] = [];
    readonly conflicts: Conflict[] = [];
    /** What the last step (or sync) has to tell the player; emptied at the start of each. */
    readonly news: CivNews[] = [];
    /** False until the records were derived from the grid (new planet, after a load). */
    synced = false;
    /** Next id for cities, tribes, settlers and bands alike. */
    nextId = 1;
    /** Bumped on every change the map shows: founding, loss, tribe, name, move. */
    revision = 0;
    /** `world.driftShifts` the records were last matched against. */
    driftSeen = 0;
    /** No conflict starts before this tick (they rest after a load and after each conflict). */
    calmUntil = 0;
    /** Highest tech level on the planet so far, and the tick it was reached (after a load: the load). */
    topTech = 0;
    topSince = 0;
    /** A band has settled since the records were last cleared (the chronicle keeps it across a load: bands.ts). */
    settled = false;
    /** Every people has sworn off the bomb after its first use (conflict.ts); kept in the save. */
    atomBan = false;
    /** No conflict before this tick: per pair of tribes (`peaceKey`), and per tribe against anyone (`restKey`). */
    readonly peace = new Map<string, number>();
    private readonly byTile = new Map<number, City>();
    /** Tick of the last news per kind, to keep repeated kinds quiet. */
    private readonly newsAt = new Map<string, number>();

    clear(): void {
      this.cities.length = 0;
      this.tribes.length = 0;
      this.settlers.length = 0;
      this.bands.length = 0;
      this.outbreaks.length = 0;
      this.conflicts.length = 0;
      this.peace.clear();
      this.news.length = 0;
      this.byTile.clear();
      this.newsAt.clear();
      this.synced = false;
      this.nextId = 1;
      this.driftSeen = 0;
      this.calmUntil = 0;
      this.topTech = 0;
      this.topSince = 0;
      this.settled = false;
      this.atomBan = false;
      this.revision++;
    }

    /** Add news unless the same kind was reported less than `gap` ticks ago. */
    report(kind: string, tick: number, gap: number, news: CivNews): void {
      const last = this.newsAt.get(kind);
      if (last !== undefined && tick - last < gap && tick >= last) return;
      this.newsAt.set(kind, tick);
      this.news.push(news);
    }

    cityAt(tile: number): City | undefined {
      return this.byTile.get(tile);
    }

    city(id: number): City | undefined {
      return this.cities.find((c) => c.id === id);
    }

    tribe(id: number): Tribe | undefined {
      return this.tribes.find((t) => t.id === id);
    }

    addCity(c: City): void {
      this.cities.push(c);
      this.byTile.set(c.tile, c);
      this.revision++;
    }

    removeCity(c: City): void {
      const k = this.cities.indexOf(c);
      if (k >= 0) this.cities.splice(k, 1);
      if (this.byTile.get(c.tile) === c) this.byTile.delete(c.tile);
      this.revision++;
    }

    moveCity(c: City, tile: number): void {
      if (this.byTile.get(c.tile) === c) this.byTile.delete(c.tile);
      c.tile = tile;
      this.byTile.set(tile, c);
      this.revision++;
    }
  }

  const SYLLABLES = [
    'ka', 'te', 'lu', 'mi', 'ra', 'no', 'si', 'va', 'do', 're', 'an', 'el', 'or', 'ul', 'ba', 'ze', 'ti', 'mo',
    'ne', 'sa', 'li', 'gu', 'ha', 'fe', 'ro', 'di', 'tha', 'ke', 'ma', 'lo', 'ar', 'is', 'be', 'go', 'pa', 'vo',
  ];
  const CITY_ENDINGS = ['n', 'r', 's', 'ra', 'ria', 'um', 'on', 'ar', 'eth', 'os', 'in', 'ga', 'dor', 'mar'];
  const TRIBE_ENDINGS = ['ni', 'ren', 'ker', 'ari', 'aner', 'iden', 'osi', 'unen'];

  function nameHash(seed: number, x: number, y: number, salt: number): number {
    let h = Math.imul(seed ^ 0x5bd1e995, 0x27d4eb2d) ^ Math.imul(x + 0x3c6ef372, 0x165667b1) ^
      Math.imul(y + 0x1b873593, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca77);
    h ^= h >>> 15;
    h = Math.imul(h, 0xc2b2ae3d);
    h ^= h >>> 13;
    h = Math.imul(h, 0x846ca68b);
    h ^= h >>> 16;
    return h >>> 0;
  }

  /**
   * A made-up name, fixed by the planet's seed and a position, so a city
   * derived again after a load keeps it. `tribe` gives a people's plural,
   * always of two syllables; `attempt` > 0 gives further names for the same
   * place, for when the first is taken.
   */
  export function civName(seed: number, x: number, y: number, tribe = false, attempt = 0): string {
    let h = nameHash(seed, x, y, (tribe ? 2 : 1) + 2 * attempt);
    const next = (n: number): number => {
      const v = h % n;
      h = (Math.floor(h / n) ^ Math.imul(h, 0x2c1b3c6d)) >>> 0;
      return v;
    };
    const syllables = tribe ? 2 : 1 + next(2);
    let s = '';
    for (let k = 0; k < syllables; k++) s += SYLLABLES[next(SYLLABLES.length)];
    const endings = tribe ? TRIBE_ENDINGS : CITY_ENDINGS;
    s += endings[next(endings.length)];
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
