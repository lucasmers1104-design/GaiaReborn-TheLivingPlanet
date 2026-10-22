/* =============================================================================
 * SimEarth 2.0 — world wonders
 * -----------------------------------------------------------------------------
 * Two wonders for now (WONDERS), each begun at most once per planet by a
 * people that has enough cities and people in the wonder's age (or the
 * next), while the planet is at most one age past it: the Pyramids in the
 * Bronze Age, the Great Wall in the Iron Age, WONDER_GAP apart. Their sites
 * echo the real places. The Pyramids stand on dry, flat desert by a river,
 * a few tiles from a city of the builder, 3 × 2 tiles free of rivers,
 * cities and water. The
 * Wall is a chain of 8–16 land tiles along the steepest ground on the frontier
 * towards another people (else towards the steppe, else to the north). On the
 * Earth of today (recognised by its coastlines, wherever the plates took
 * them: `earthPlace`) Giza and the line across northern China win when a
 * city that qualifies lies within reach; at Giza without the river, as the
 * game's Earth has no Nile.
 *
 * A wonder takes PYRAMIDS_BUILD_TICKS / WALL_BUILD_TICKS to build, in the
 * stages of its sprites; the Wall grows piece by piece along its chain. It is
 * built on while any city stands within WONDER_REACH — whichever people holds
 * it then — and rests while none does, so a fallen builder leaves a half-built
 * monument that the next city nearby finishes, as later dynasties did on
 * Earth. Done, it stands for good; only the sea takes it (plate drift, the
 * brush), and it rides the plates like a city. No game bonus: news and
 * chronicle only. Its tiles carry LAND_USE_WONDER (no wild plants there).
 * Rolls are hashes of seed and tick, never world.rng. Pure simulation, no DOM.
 * ========================================================================== */

namespace SE {
  export type WonderKind = 'pyramids' | 'wall';

  export interface Wonder {
    /** Read by the map: 'pyramids' or 'wall'. */
    readonly kind: WonderKind;
    /**
     * Read by the map; follows plate drift. The pyramids: their 3 × 2 tiles,
     * the upper row west to east, then the lower row (tiles[4], the lower
     * middle, is where the sprite stands). The wall: its chain in build order.
     */
    tiles: number[];
    /** Read by the map: 0..1. */
    progress: number;
    /** Read by the map (hover): the people building it; once done, the people that finished it. */
    people: string;
    readonly started: number;
    /** Tick it was finished, -1 while it is built. */
    done: number;
    /** Read by the map: no city stands within reach, the work rests (no builders). */
    paused: boolean;
  }

  interface WonderDef {
    readonly kind: WonderKind;
    /** Name, with its article, and in the genitive. */
    readonly name: string;
    readonly the: string;
    readonly of: string;
    readonly era: Tech;
    readonly ticks: number;
    /** Stages of its sprite, the last the finished wonder: of the whole (pyramids) or of each piece of a chain (wall). */
    readonly stages: number;
    readonly chain: boolean;
    /** Its tiles round the builder's cities of its age, or null. */
    readonly site: (world: WorldState, cities: readonly City[]) => number[] | null;
    readonly sinks: (people: string) => string;
    /** The model on Earth, for the chronicle. */
    readonly earth: string;
  }

  /* ------------------------------------------------------------ ground -- */

  /** A wonder may stand on tile `i`: dry land free of rivers, cities, other works, ice and hazards, below the tree line, WONDER_GAP from another wonder. */
  function freeGround(world: WorldState, i: number): boolean {
    if (i < 0 || world.isWater(i) || world.riverLevel[i] > 0 || world.tech[i] !== Tech.None) return false;
    if ((world.landUse[i] & LAND_USE_WONDER) !== 0 || world.civ.wonders.some((w) => w.tiles.some((t) => tileDistance(t, i) < WONDER_GAP))) return false;
    const ls = world.landscape[i];
    if (ls === Landscape.Ice || ls === Landscape.Snow || aboveTreeLine(world, i)) return false;
    if (world.hazards.tile[i] !== HazardTile.None) return false;
    return i !== world.oilRigLand && i !== world.termiteMound && !spaceportTooClose(world, i);
  }

  /** A city stands within `r` tiles (Chebyshev) of tile `i`. */
  function cityWithin(world: WorldState, i: number, r: number): boolean {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const j = tileAt(i, dx, dy);
        if (j >= 0 && world.tech[j] !== Tech.None) return true;
      }
    }
    return false;
  }

  /** Steepest elevation step from tile `i` to a land neighbour. */
  function steepness(world: WorldState, i: number): number {
    let s = 0;
    for (let k = 0; k < 8; k++) {
      const j = tileAt(i, HAZARD_NX[k], HAZARD_NY[k]);
      if (j >= 0 && !world.isWater(j)) s = Math.max(s, Math.abs(world.elevation[j] - world.elevation[i]));
    }
    return s;
  }

  /* ------------------------------------------------- the Earth of today -- */

  /** Land (1) or sea (0) per tile of today's Earth, decoded once from EARTH_MAP. */
  let earthLand: Uint8Array | null = null;

  /** earthPlace's answers per world and place, with the place's elevation then: kept until the plates move or the ground changes. */
  const earthSeen = new WeakMap<WorldState, { seed: number; shifts: number; at: Map<number, readonly [number, number]> }>();

  /**
   * Where `at` (latitude, longitude) lies now if this planet is today's Earth,
   * or -1. Five land rows round it are matched against EARTH_MAP at every
   * shift along the row; a match of WONDER_EARTH_MATCH says it is the Earth,
   * and the best shift is how far the plates have carried that latitude.
   * About 3–8 ms, so the answer is kept until the plates move.
   */
  export function earthPlace(world: WorldState, at: readonly [number, number]): number {
    const home = latLonTile(at);
    let seen = earthSeen.get(world);
    if (!seen || seen.seed !== world.seed || seen.shifts !== world.driftShifts) {
      earthSeen.set(world, seen = { seed: world.seed, shifts: world.driftShifts, at: new Map() });
    }
    const known = seen.at.get(home);
    if (known && known[1] === world.elevation[home]) return known[0];
    if (!earthLand) {
      const bin = atob(EARTH_MAP.heights);
      earthLand = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) earthLand[i] = bin.charCodeAt(i) < 128 ? 1 : 0;
    }
    const y = Math.floor(home / GRID_W);
    const y0 = Math.max(0, y - 2);
    const y1 = Math.min(GRID_H - 1, y + 2);
    let best = -1;
    let shift = 0;
    for (let s = 0; s < GRID_W; s++) {
      let same = 0;
      for (let yy = y0; yy <= y1; yy++) {
        const row = yy * GRID_W;
        for (let x = 0; x < GRID_W; x++) if ((world.elevation[row + ((x + s) % GRID_W)] >= 0 ? 1 : 0) === earthLand[row + x]) same++;
      }
      if (same > best) { best = same; shift = s; }
    }
    const place = best >= WONDER_EARTH_MATCH * (y1 - y0 + 1) * GRID_W ? tileAt(home, shift, 0) : -1;
    seen.at.set(home, [place, world.elevation[home]]);
    return place;
  }

  /* ---------------------------------------------------------- pyramids -- */

  /** The Pyramids of Giza. */
  const GIZA: readonly [number, number] = [29.98, 31.13];

  /** The 3 × 2 footprint whose lower middle tile is `a`: upper row west to east, then the lower row; null at a pole. */
  function pyramidFootprint(a: number): number[] | null {
    const out: number[] = [];
    for (let dy = -1; dy <= 0; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const t = tileAt(a, dx, dy);
        if (t < 0) return null;
        out.push(t);
      }
    }
    return out;
  }

  /** Rank of a pyramid tile's ground: desert or semi-desert 0, other dry open land 1, anything else −1. */
  function pyramidGround(world: WorldState, i: number): number {
    const ls = world.landscape[i];
    if (ls === Landscape.Desert || ls === Landscape.Semidesert) return 0;
    return ls === Landscape.Barren || ls === Landscape.Steppe || ls === Landscape.Savanna || ls === Landscape.Shrubland ? 1 : -1;
  }

  /**
   * Rank of the footprint round lower middle tile `a` (its worst tile's
   * ground), or −1: six free tiles, flat to PYRAMIDS_FLAT, no city on or
   * next to it or under the tops rising into the row above, and a river
   * within PYRAMIDS_RIVER_NEAR unless `river` is false.
   */
  function pyramidRank(world: WorldState, a: number, river = true): number {
    const tiles = pyramidFootprint(a);
    if (!tiles) return -1;
    let rank = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (const t of tiles) {
      const g = freeGround(world, t) ? pyramidGround(world, t) : -1;
      if (g < 0) return -1;
      rank = Math.max(rank, g);
      lo = Math.min(lo, world.elevation[t]);
      hi = Math.max(hi, world.elevation[t]);
    }
    if (hi - lo > PYRAMIDS_FLAT) return -1;
    let nearRiver = !river;
    const r = PYRAMIDS_RIVER_NEAR;
    for (let dy = -1 - r; dy <= r; dy++) {
      for (let dx = -1 - r; dx <= 1 + r; dx++) {
        const j = tileAt(a, dx, dy);
        if (j < 0) continue;
        if (world.tech[j] !== Tech.None && Math.abs(dx) <= 2 && dy >= -2 && dy <= 1) return -1;
        if (world.riverLevel[j] > 0 && !world.isWater(j)) nearRiver = true;
      }
    }
    return nearRiver ? rank : -1;
  }

  /** The best footprint within WONDER_REACH of the cities: by Giza on today's Earth when in reach, else the driest ground, then the nearest. */
  function pyramidSite(world: WorldState, cities: readonly City[]): number[] | null {
    const real = earthPlace(world, GIZA);
    let best = -1;
    let bestScore = Infinity;
    const r = WONDER_REACH;
    const tried = new Set<number>();
    for (const c of cities) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const a = tileAt(c.tile, dx, dy);
          if (a < 0 || tried.has(a)) continue;
          tried.add(a);
          // The game's drainage carries no Nile through the Sahara (today's Earth, seed 12345, ticks 3000 and 6574): at Giza the river is waived.
          const atGiza = real >= 0 && tileDistance(real, a) <= WONDER_REAL_NEAR;
          const rank = pyramidRank(world, a, !atGiza);
          if (rank < 0) continue;
          let near = Infinity;
          for (const o of cities) near = Math.min(near, tileDistance(o.tile, a));
          const score = atGiza ? -1e6 + tileDistance(real, a) : rank * 1e3 + near;
          if (score < bestScore) { bestScore = score; best = a; }
        }
      }
    }
    return best < 0 ? null : pyramidFootprint(best);
  }

  /* ------------------------------------------------------------- wall -- */

  /** The wall across northern China: its middle, and half its length in tiles along the row. */
  const WALL_EARTH: readonly [number, number] = [40.5, 110];
  const WALL_EARTH_HALF = 7;

  /** Tiles round the frontier point the wall may start from, and how many of the steepest it tries. */
  const WALL_START_RANGE = 5;
  const WALL_START_TRIES = 8;
  /** Steppe tiles round a city without foreign neighbours that make its wall face them. */
  const WALL_STEPPE_MIN = 10;

  /** The eight steps clockwise from east (y runs down): E SE S SW W NW N NE. */
  const STEPS: readonly (readonly [number, number])[] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

  function stepOf(dx: number, dy: number): number {
    return ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
  }

  /** (dx, dy) from tile a to tile b, x the short way round. */
  function offset(a: number, b: number): [number, number] {
    let dx = (b % GRID_W) - (a % GRID_W);
    if (dx > GRID_W / 2) dx -= GRID_W;
    else if (dx < -GRID_W / 2) dx += GRID_W;
    return [dx, Math.floor(b / GRID_W) - Math.floor(a / GRID_W)];
  }

  /** Tile `i` may carry a piece of wall: free ground at least WALL_CITY_GAP from any city. Its worth is its steepness: a mountain edge. */
  function wallWorth(world: WorldState, i: number): number {
    return freeGround(world, i) && !cityWithin(world, i, WALL_CITY_GAP - 1) ? steepness(world, i) : -Infinity;
  }

  /**
   * A chain of up to `length` tiles through `start`, grown alternately both
   * ways along step `along` and its opposite. Each step goes straight on or
   * 45° to either side, to the steepest tile less WALL_STRAY for every tile
   * it strays from the line through `start` (WALL_BAND at most), so it
   * follows a mountain edge without wandering off; a side ends at water, a
   * river, a city or a pole.
   */
  function growWall(world: WorldState, start: number, along: number, length: number): number[] {
    const [ux, uy] = STEPS[along];
    const ulen = Math.hypot(ux, uy);
    const sides: number[][] = [[], []];
    const at = [{ t: start, x: 0, y: 0 }, { t: start, x: 0, y: 0 }];
    const open = [true, true];
    const used = new Set([start]);
    const size = (): number => 1 + sides[0].length + sides[1].length;
    while (size() < length && (open[0] || open[1])) {
      for (let s = 0; s < 2 && size() < length; s++) {
        if (!open[s]) continue;
        const d0 = s === 0 ? along : (along + 4) % 8;
        let best = -1;
        let bestValue = -Infinity;
        let bx = 0;
        let by = 0;
        for (const d of [d0, (d0 + 7) % 8, (d0 + 1) % 8]) {
          const [dx, dy] = STEPS[d];
          const t = tileAt(at[s].t, dx, dy);
          if (t < 0 || used.has(t)) continue;
          const worth = wallWorth(world, t);
          if (worth === -Infinity) continue;
          const x = at[s].x + dx;
          const y = at[s].y + dy;
          const stray = Math.abs(x * uy - y * ux) / ulen;
          if (stray > WALL_BAND) continue;
          const value = worth - WALL_STRAY * stray;
          if (value > bestValue) { bestValue = value; best = t; bx = x; by = y; }
        }
        if (best < 0) { open[s] = false; continue; }
        used.add(best);
        sides[s].push(best);
        at[s] = { t: best, x: bx, y: by };
      }
    }
    return [...sides[1].reverse(), start, ...sides[0]];
  }

  /** Where the wall of city `c` stands and which way it faces: towards the nearest foreign city, else the steppe, else north. */
  function wallFront(world: WorldState, c: City): { at: number; out: [number, number]; foe: number } {
    let out: [number, number] = [0, -1];
    let far = WALL_FRONT_DIST;
    let foe = -1;
    let foeD = WALL_FRONT_MAX;
    for (const o of world.civ.cities) {
      const d = tileDistance(c.tile, o.tile);
      if (o.tribe !== c.tribe && d <= foeD) { foeD = d; foe = o.tile; }
    }
    if (foe >= 0) {
      out = offset(c.tile, foe);
      far = Math.min(far, foeD / 2);
    } else {
      // The steppe beyond the city's own surroundings: the centroid of its tiles round the city.
      let sx = 0;
      let sy = 0;
      let n = 0;
      const r = WALL_FRONT_MAX / 2;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const d2 = dx * dx + dy * dy;
          const j = tileAt(c.tile, dx, dy);
          if (d2 <= CITY_UMLAND * CITY_UMLAND || d2 > r * r || j < 0 || world.landscape[j] !== Landscape.Steppe || world.isWater(j)) continue;
          sx += dx;
          sy += dy;
          n++;
        }
      }
      if (n >= WALL_STEPPE_MIN && Math.hypot(sx / n, sy / n) >= CITY_UMLAND) out = [sx / n, sy / n];
    }
    const len = Math.hypot(out[0], out[1]);
    const at = tileAt(c.tile, Math.round((out[0] / len) * far), Math.round((out[1] / len) * far));
    return { at: at < 0 ? c.tile : at, out, foe: foe >= 0 ? foeD : Infinity };
  }

  /**
   * The first chain of WALL_LENGTH[0] or more grown across `out` from the
   * steepest starts round `at`, not behind it (towards the cities) and within
   * WONDER_REACH of the builder's `cities`, so the work begins on the
   * frontier and in their reach; null if none.
   */
  function wallFrom(world: WorldState, cities: readonly City[], at: number, out: readonly [number, number], length: number): number[] | null {
    const starts: { t: number; worth: number }[] = [];
    const r = WALL_START_RANGE;
    const olen = Math.hypot(out[0], out[1]);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if ((dx * out[0] + dy * out[1]) / olen < -1) continue;
        const t = tileAt(at, dx, dy);
        const reach = t >= 0 && cities.some((c) => tileDistance(c.tile, t) <= WONDER_REACH);
        const worth = reach ? wallWorth(world, t) : -Infinity;
        if (worth > -Infinity) starts.push({ t, worth: worth - WALL_STRAY * Math.hypot(dx, dy) });
      }
    }
    starts.sort((a, b) => b.worth - a.worth || a.t - b.t);
    const along = stepOf(-out[1], out[0]);
    for (const s of starts.slice(0, WALL_START_TRIES)) {
      const chain = growWall(world, s.t, along, length);
      if (chain.length >= WALL_LENGTH[0]) return chain;
    }
    return null;
  }

  /**
   * The wall of a people's `cities`: on today's Earth along the line across
   * northern China if one of them lies within reach of it, facing north;
   * otherwise on the frontier of the city nearest a foreign people first.
   * Built from the end nearer its cities.
   */
  function wallSite(world: WorldState, cities: readonly City[]): number[] | null {
    const [lo, hi] = WALL_LENGTH;
    const length = lo + Math.floor(spontaneousRoll(world.seed, world.ticks, WONDER_ROLL_SALT + 99) * (hi - lo + 1));
    let chain: number[] | null = null;
    const mid = earthPlace(world, WALL_EARTH);
    if (mid >= 0) {
      let at = -1;
      let atD = WONDER_REACH;
      for (let dx = -WALL_EARTH_HALF; dx <= WALL_EARTH_HALF; dx++) {
        const t = tileAt(mid, dx, 0);
        for (const c of cities) {
          const d = tileDistance(c.tile, t);
          if (d <= atD) { atD = d; at = t; }
        }
      }
      if (at >= 0) chain = wallFrom(world, cities, at, [0, -1], length);
    }
    if (!chain) {
      const fronts = cities.map((c) => ({ c, ...wallFront(world, c) }));
      // The city nearest a foreign people first; those without one after, oldest first.
      fronts.sort((a, b) => (a.foe === b.foe ? 0 : a.foe < b.foe ? -1 : 1) || a.c.id - b.c.id);
      for (const f of fronts) {
        chain = wallFrom(world, cities, f.at, f.out, length);
        if (chain) break;
      }
    }
    if (!chain) return null;
    const near = (t: number): number => Math.min(...cities.map((c) => tileDistance(c.tile, t)));
    return near(chain[chain.length - 1]) < near(chain[0]) ? chain.reverse() : chain;
  }

  /* ------------------------------------------------------------ table -- */

  const WONDERS: readonly WonderDef[] = [
    {
      kind: 'pyramids', name: 'Pyramiden', the: 'die Pyramiden', of: 'der Pyramiden', era: Tech.Bronze,
      ticks: PYRAMIDS_BUILD_TICKS, stages: 6, chain: false, site: pyramidSite,
      sinks: (people) => `Die Pyramiden der ${people} versinken im Meer.`,
      earth: 'Vorbild sind die Pyramiden von Gizeh in Ägypten, erbaut um 2600–2500 v. Chr. Die größte, die ' +
        'Cheops-Pyramide, war ursprünglich rund 146 m hoch und über 3800 Jahre lang das höchste Bauwerk der Erde.',
    },
    {
      kind: 'wall', name: 'Chinesische Mauer', the: 'die Chinesische Mauer', of: 'der Chinesischen Mauer', era: Tech.Iron,
      ticks: WALL_BUILD_TICKS, stages: 3, chain: true, site: wallSite,
      sinks: (people) => `Die Chinesische Mauer der ${people} versinkt im Meer.`,
      earth: 'Vorbild ist die Chinesische Mauer: Ab dem 7. Jahrhundert v. Chr. bauten chinesische Staaten Grenzmauern, ' +
        'Qin Shi Huang verband nach 221 v. Chr. viele davon. Das meiste, was heute steht, stammt aus der Ming-Zeit ' +
        '(1368–1644). Alle Abschnitte zusammen sind rund 21.000 km lang.',
    },
  ];

  function wonderDef(kind: WonderKind): WonderDef {
    return WONDERS.find((d) => d.kind === kind) as WonderDef;
  }

  /** Chronicle key of a finished wonder: each is finished once per planet. */
  function wonderKey(kind: WonderKind): string {
    return `civ:wonder:${kind}`;
  }

  /** Salt of the hash rolls (spontaneousRoll's node), clear of the evolution nodes and the bands. */
  const WONDER_ROLL_SALT = 0x574f4e00;

  /* ------------------------------------------------------------- stage -- */

  /**
   * Build stage of piece `k` for the map, −1 while it is not begun: a chain
   * (the wall) grows piece by piece, each through its stages behind the one
   * before; the pyramids are one piece. The last stage only once it is done.
   */
  export function wonderStage(w: Wonder, k = 0): number {
    const def = wonderDef(w.kind);
    const n = def.chain ? w.tiles.length : 1;
    const t = w.progress * (n + def.stages - 2) - k;
    return t < 0 || k >= n ? -1 : Math.min(def.stages - 1, Math.floor(t));
  }

  /** The wonder's piece `k` has begun, for the hover text. */
  function standsOn(w: Wonder, k: number): boolean {
    return wonderStage(w, wonderDef(w.kind).chain ? k : 0) >= 0;
  }

  /** „Pyramiden · Arkani · im Bau, 40 %“ for a wonder on tile `i`, or null. */
  export function wonderLabel(world: WorldState, i: number): string | null {
    for (const w of world.civ.wonders) {
      const k = w.tiles.indexOf(i);
      if (k < 0 || !standsOn(w, k)) continue;
      const state = w.done >= 0 ? 'Weltwunder' : w.paused ? 'Bau ruht' : `im Bau, ${Math.floor(w.progress * 100)} %`;
      return `${wonderDef(w.kind).name} · ${w.people} · ${state}`;
    }
    return null;
  }

  /* -------------------------------------------------------------- step -- */

  /** LAND_USE_WONDER on every tile of a wonder from its beginning: the wall's course is cleared and kept free of cities before it gets there. */
  function markLand(world: WorldState): void {
    for (const w of world.civ.wonders) for (const t of w.tiles) world.landUse[t] |= LAND_USE_WONDER;
  }

  function clearLand(world: WorldState, w: Wonder): void {
    for (const t of w.tiles) world.landUse[t] &= ~LAND_USE_WONDER;
  }

  /** Elevation rows under the wonders as the plates last stood, per world: to find where drift took them. */
  const driftRows = new WeakMap<WorldState, { shifts: number; rows: Map<number, Float32Array> }>();

  /** How far row `y` rolled since `before` was taken: the shift (±2 at most) that fits the elevation best. */
  function rowShift(world: WorldState, y: number, before: Float32Array): number {
    let best = 0;
    let bestErr = Infinity;
    for (const dx of [0, 1, -1, 2, -2]) {
      let err = 0;
      for (let x = 0; x < GRID_W; x++) err += Math.abs(world.elevation[y * GRID_W + wrapX(x + dx)] - before[x]);
      if (err < bestErr) { bestErr = err; best = dx; }
    }
    return best;
  }

  /** Wonders ride the plates: each row of their tiles moves as far as its elevation did (like cities, reconcileCities). */
  function followDrift(world: WorldState): void {
    const mem = driftRows.get(world);
    if (!mem || mem.shifts === world.driftShifts) return;
    const moved = new Map<number, number>();
    for (const [y, row] of mem.rows) moved.set(y, rowShift(world, y, row));
    for (const w of world.civ.wonders) {
      const dx = (t: number): number => moved.get(Math.floor(t / GRID_W)) ?? 0;
      if (w.tiles.every((t) => dx(t) === 0)) continue;
      clearLand(world, w);
      w.tiles = w.tiles.map((t) => tileAt(t, dx(t), 0));
    }
  }

  /** Remember the elevation rows under the wonders: all of them after the plates moved, else only rows not seen yet. */
  function noteRows(world: WorldState): void {
    let mem = driftRows.get(world);
    const fresh = !mem || mem.shifts !== world.driftShifts;
    if (!mem) driftRows.set(world, mem = { shifts: world.driftShifts, rows: new Map() });
    mem.shifts = world.driftShifts;
    for (const w of world.civ.wonders) {
      for (const t of w.tiles) {
        const y = Math.floor(t / GRID_W);
        let row = mem.rows.get(y);
        if (row && !fresh) continue;
        if (!row) mem.rows.set(y, row = new Float32Array(GRID_W));
        row.set(world.elevation.subarray(y * GRID_W, (y + 1) * GRID_W));
      }
    }
  }

  /** The city nearest to any tile of the wonder within WONDER_REACH, or undefined. */
  function builderOf(world: WorldState, w: Wonder): City | undefined {
    let best: City | undefined;
    let bestD = WONDER_REACH;
    for (const c of world.civ.cities) {
      for (const t of w.tiles) {
        const d = tileDistance(c.tile, t);
        if (d <= bestD) { bestD = d; best = c; }
      }
    }
    return best;
  }

  function peopleOf(world: WorldState, c: City): string {
    return world.civ.tribe(c.tribe)?.name ?? mindName(world);
  }

  /** One tick of building: on while a city stands within reach, finished with the chronicle entry. */
  function build(world: WorldState, w: Wonder): void {
    const def = wonderDef(w.kind);
    const civ = world.civ;
    const city = builderOf(world, w);
    const at = w.tiles[def.chain ? 0 : 4];
    if (!city) {
      if (!w.paused) civ.news.push({ text: `Der Bau ${def.of} ruht: Keine Stadt steht mehr in der Nähe.`, tone: 'warn', at });
      w.paused = true;
      return;
    }
    const people = peopleOf(world, city);
    if (w.paused) {
      w.paused = false;
      civ.news.push({ text: `Die ${people} bauen ${def.the} weiter.`, tone: 'info', at });
    }
    w.progress = Math.min(1, w.progress + 1 / def.ticks);
    if (w.progress < 1) return;
    w.done = world.ticks;
    w.people = people;
    civ.news.push({
      text: `Die ${people} haben ein Weltwunder errichtet: ${def.the} bei ${city.name}.`, tone: 'info', at,
      chronicle: { key: wonderKey(w.kind), title: `Weltwunder: ${def.the}`, change: def.earth, major: true },
    });
  }

  /** A people meeting the wonder's conditions may begin it now: the one with the most people in its age (or the next) that has a site. */
  function maybeBegin(world: WorldState, def: WonderDef, salt: number): void {
    const civ = world.civ;
    if (civ.wonders.some((w) => w.kind === def.kind) || world.evo.chronicle.some((e) => e.key === wonderKey(def.kind))) return;
    // Never once the planet has gone two ages past it: no pyramids from a lagging people in the Industrial age.
    if (civ.topTech > def.era + 1 || spontaneousRoll(world.seed, world.ticks, WONDER_ROLL_SALT + salt) >= WONDER_CHANCE) return;
    const byTribe = new Map<number, City[]>();
    for (const c of civ.cities) {
      if (world.tech[c.tile] !== def.era && world.tech[c.tile] !== def.era + 1) continue;
      const list = byTribe.get(c.tribe);
      if (list) list.push(c);
      else byTribe.set(c.tribe, [c]);
    }
    // The peoples that qualify, most people first; the first with a site begins.
    const peoples = [...byTribe.entries()]
      .map(([id, list]) => ({ id, list, pop: list.reduce((s, c) => s + world.cityPop[c.tile], 0) }))
      .filter((p) => p.list.length >= WONDER_CITIES_MIN && p.pop >= WONDER_POP_MIN)
      .sort((a, b) => b.pop - a.pop || a.id - b.id);
    let cities: City[] = [];
    let tiles: number[] | null = null;
    for (const p of peoples) {
      cities = p.list;
      tiles = def.site(world, cities);
      if (tiles) break;
    }
    if (!tiles) return;
    let city = cities[0];
    for (const c of cities) if (tileDistance(c.tile, tiles[0]) < tileDistance(city.tile, tiles[0])) city = c;
    const people = peopleOf(world, city);
    civ.wonders.push({ kind: def.kind, tiles, progress: 0, people, started: world.ticks, done: -1, paused: false });
    civ.news.push({ text: `Die ${people} beginnen bei ${city.name} mit dem Bau ${def.of}.`, tone: 'info', at: tiles[def.chain ? 0 : 4] });
  }

  /** One civilization tick of the world wonders (civ.ts calls it after the conflicts). */
  export function stepWonders(world: WorldState, params: ModelParams): void {
    void params;
    const civ = world.civ;
    followDrift(world);
    for (const w of civ.wonders.slice()) {
      if (w.tiles.some((t) => world.isWater(t))) {
        clearLand(world, w);
        civ.wonders.splice(civ.wonders.indexOf(w), 1);
        civ.news.push({ text: wonderDef(w.kind).sinks(w.people), tone: 'warn', at: w.tiles[0] });
        continue;
      }
      if (w.done < 0) build(world, w);
    }
    WONDERS.forEach((def, k) => maybeBegin(world, def, k));
    markLand(world);
    noteRows(world);
  }

  /* -------------------------------------------------------------- save -- */

  interface SavedWonder {
    readonly kind: WonderKind;
    readonly tiles: number[];
    readonly progress: number;
    readonly people: string;
    readonly started: number;
    readonly done: number;
  }

  /** The optional save field `wonders`; undefined writes none. */
  export function wondersToJSON(world: WorldState): SavedWonder[] | undefined {
    const ws = world.civ.wonders;
    if (ws.length === 0) return undefined;
    return ws.map((w) => ({ kind: w.kind, tiles: w.tiles.slice(), progress: w.progress, people: w.people, started: w.started, done: w.done }));
  }

  /** One saved wonder, or null if any part of it is unsound for a planet at `ticks`. */
  function readWonder(raw: unknown, ticks: number): Wonder | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const def = WONDERS.find((d) => d.kind === r.kind);
    const int = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
    const { tiles, progress, people, started, done } = r;
    if (!def || !Array.isArray(tiles) || !tiles.every((t) => int(t, 0, TILE_COUNT - 1))) return null;
    if (def.chain ? tiles.length < 1 || tiles.length > 2 * WALL_LENGTH[1] : tiles.length !== 6) return null;
    if (typeof progress !== 'number' || !(progress >= 0 && progress <= 1)) return null;
    if (typeof people !== 'string' || people.length === 0 || people.length > 40) return null;
    if (!int(started, 0, ticks) || !int(done, -1, ticks) || (done >= 0) !== (progress >= 1) || (done >= 0 && done < started)) return null;
    return { kind: def.kind, tiles: tiles.slice() as number[], progress, people, started, done, paused: false };
  }

  /** Take over the optional save field `wonders` after the civilization's records (save.ts); a missing or unsound one changes nothing. */
  export function restoreWonders(world: WorldState, raw: unknown): void {
    if (!Array.isArray(raw)) return;
    const read = raw.map((r) => readWonder(r, world.ticks));
    if (read.some((w) => !w) || new Set(read.map((w) => (w as Wonder).kind)).size !== read.length) return;
    const civ = world.civ;
    for (const w of civ.wonders) clearLand(world, w);
    civ.wonders.length = 0;
    for (const w of read) civ.wonders.push(w as Wonder);
    driftRows.delete(world);
    markLand(world);
  }
}
