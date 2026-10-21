/* =============================================================================
 * SimEarth 2.0 — coral reefs, lagoons, beaches and palms
 * -----------------------------------------------------------------------------
 * Drawing only: derived from what the simulation already holds, never saved
 * and never read back by it (no field, no tick step, no random numbers).
 *   - reef: warm (≥ CORAL_MIN_TEMP) coastal sea where a reef-building
 *     sub-species (species art `reefBuilder`) lives densely enough, away from
 *     muddy river mouths. At most one centre per seed-offset cell of
 *     REEF_CELL tiles, REEF_SPACING apart; the reef takes in the candidates
 *     around it, rugose corals 0–1 tiles, stony corals 1–2, its outer ring
 *     ragged;
 *   - growth: reefs spread from the first one, whose chronicle entry holds
 *     the date and the tile. Each starts after a delay by its distance from
 *     it and by chance, then grows ring by ring and patch by patch
 *     (REEF_*_YEARS). Stony corals take over the same way from the first
 *     stony reef. The chronicle is the only memory: a reef that dies out
 *     and comes back later shows grown at once;
 *   - grazing fish (`reefGrazer`) on or beside a grown reef grind part of its
 *     coral to sand and wash it ashore: white beaches on the land nearby,
 *     longer the more fish; sand cays on the reef's outer tiles;
 *   - lagoon: turquoise over the reef and the coastal sea a tile landward;
 *   - shell beaches: in stretches on coasts beside molluscs and shelled
 *     arthropods, more of them the denser those live;
 *   - palms on the beaches, since the oldest palm fossils; once broadleaf
 *     trees exist, warm small islands become palm islands and palms grow on
 *     the sand cays.
 * Densities are read in levels, so a reef's size, patches and sand change
 * only when a population crosses a level, not with every small change. The
 * thresholds themselves have no hysteresis: that would need saved state.
 * Pure functions, no DOM: the renderer, the Examine window, the chronicle
 * (app.ts) and the tests share them.
 * ========================================================================== */

namespace SE {
  export const enum CoralKind { None = 0, Rugose = 1, Stony = 2 }
  export const enum BeachKind { None = 0, Shell = 1, Reef = 2 }

  const N = SUBSPECIES_PER_CLASS;
  /** Per class × stage: the coral kind it builds (0 none). */
  const BUILDS = new Uint8Array(LIFE_COUNT * N);
  /**
   * Per class: its grazing sub-species (N where it has none). Once that has
   * evolved anywhere, the class grazes every reef it lives on or beside:
   * the stage a tile shows is only its newest form, the others live on.
   */
  const GRAZE_FROM = new Uint8Array(LIFE_COUNT).fill(N);
  const BUILDERS: Life[] = [];
  const GRAZERS: Life[] = [];
  /** The sub-species name of each coral kind, for the Examine window, and its date on Earth (Ma). */
  const CORAL_NAMES = ['', '', ''];
  const CORAL_MA = [0, 0, 0];
  for (let c = 1; c < LIFE_COUNT; c++) {
    (SPECIES[c as Life]?.stages ?? []).forEach((s, k) => {
      if (s.reefBuilder) {
        const kind = s.reefBuilder === 'stony' ? CoralKind.Stony : CoralKind.Rugose;
        BUILDS[c * N + k] = kind;
        CORAL_NAMES[kind] = s.name;
        CORAL_MA[kind] = s.ma;
        if (!BUILDERS.includes(c)) BUILDERS.push(c);
      }
      if (s.reefGrazer && k < GRAZE_FROM[c]) {
        GRAZE_FROM[c] = k;
        if (!GRAZERS.includes(c)) GRAZERS.push(c);
      }
    });
  }

  /** Grid sizes as locals: in these loops an SE lookup would cost more than the work. */
  const W = GRID_W;
  const H = GRID_H;
  const LC = LIFE_COUNT;
  const LARVA_REACH = REEF_LARVA_REACH;
  const SPACING2 = REEF_SPACING * REEF_SPACING;
  const CELL = REEF_CELL;
  const DENSITY_STEP = REEF_DENSITY_STEP;
  const GRAZER_MIN = REEF_GRAZER_MIN;
  const COAST = Biome.Coast;
  /** The density from which a reef grows large (REEF_WIDE_LEVEL). */
  const WIDE_DENSITY = REEF_WIDE_LEVEL * REEF_DENSITY_STEP;
  /** Years from the first reef until every reef has grown in full: what a reef the planet starts with has behind it. */
  const REEF_GROWN_YEARS = REEF_SPREAD_YEARS + 3 * REEF_RING_YEARS + (REEF_PATCHES + 1) * REEF_PATCH_YEARS;
  /** The farthest a reef lies from the first one, in tiles (x wraps). */
  const FARTHEST = Math.hypot(W / 2, H / 2);

  const FIRST_REEF = 'reefs:first';
  const STONY_REEF = 'reefs:stony';
  const FIRST_BEACH = 'reefs:beach';
  const PALM_ISLES = 'reefs:palms';

  /** The classes whose grazing sub-species has evolved: they graze with every stage. */
  function grazersNow(world: WorldState): Life[] {
    return GRAZERS.filter((c) => {
      for (let s = GRAZE_FROM[c]; s < N; s++) if (world.lifeStageCounts[c * N + s] > 0) return true;
      return false;
    });
  }

  /** Years since the chronicle entry `key` (0 without one) and the tile it points to (−1 none). */
  function since(world: WorldState, key: string): { age: number; origin: number } {
    const e = world.evo.chronicle.find((c) => c.key === key);
    return e ? { age: world.absoluteYears - e.years, origin: e.at ?? -1 } : { age: 0, origin: -1 };
  }

  /** Column x wrapped round the planet, for x within one width of it. */
  function col(x: number): number {
    return x < 0 ? x + W : x >= W ? x - W : x;
  }

  /** Density level 0..3 in steps of DENSITY_STEP. */
  function level(d: number): number {
    return Math.min(3, Math.floor(d / DENSITY_STEP));
  }

  /** Grazing fish or shell life level 0..3: 0 below GRAZER_MIN (where they count as living), then one more per DENSITY_STEP. */
  function grazing(d: number): number {
    return d < GRAZER_MIN ? 0 : Math.min(3, 1 + Math.floor(d / DENSITY_STEP));
  }

  /** Is water of this temperature warm enough for corals? */
  export function coralWarm(temperature: number): boolean {
    return temperature >= CORAL_MIN_TEMP;
  }

  /** Columns of the land sums: the grid, 3 wrapped columns past each edge, and the leading zero column. */
  const SW = W + 7;

  /** Can land tile i carry a beach: low, not ice, snow, marsh, swamp forest, mountain or rock belt, no fresh scar? */
  function beachable(world: WorldState, i: number): boolean {
    const h = world.elevation[i];
    if (h < 0 || h >= UPLAND_ELEVATION || world.hazards.scar[i] !== ScarKind.None) return false;
    const ls = world.landscape[i];
    if (ls === Landscape.Ice || ls === Landscape.Snow || ls === Landscape.Marsh || ls === Landscape.Swampforest) return false;
    const z = world.landscapeZone[i];
    return z === ZONE_NONE || (z & (ZONE_MOUNTAIN | ZONE_ROCKBELT | ZONE_SNOW)) === 0;
  }

  export class ReefMap {
    /** Coral kind of a reef tile, CoralKind.None elsewhere. */
    readonly coral = new Uint8Array(TILE_COUNT);
    /** Coral and sand patches drawn on a reef tile. */
    readonly corals = new Uint8Array(TILE_COUNT);
    readonly sands = new Uint8Array(TILE_COUNT);
    /** Grazing fish on or beside a reef tile, density level 0..3. */
    readonly fish = new Uint8Array(TILE_COUNT);
    /**
     * Turquoise of a sea tile: 0 none, 1 landward beside a reef, 2 a reef (or
     * beside a sandy one), 3 a reef with sand. A land tile holds its sea
     * neighbours' highest, so the turquoise reaches the shore.
     */
    readonly lagoon = new Uint8Array(TILE_COUNT);
    /** BeachKind of a land tile. */
    readonly beach = new Uint8Array(TILE_COUNT);
    /** 1 where a sand cay sits on a reef tile. */
    readonly cay = new Uint8Array(TILE_COUNT);
    /** Coconut palms on a beach tile or a sand cay, 0..2. */
    readonly palms = new Uint8Array(TILE_COUNT);
    reefTiles = 0;
    reefBeachTiles = 0;
    /** Beach tiles of palm islands and cays with palms. */
    palmIsleTiles = 0;
    /** The centre of the first reef and of the first stony reef, −1 none: where the chronicle entries point. */
    origin = -1;
    stonyOrigin = -1;

    private readonly cand = new Uint8Array(TILE_COUNT);
    private readonly candLevel = new Uint8Array(TILE_COUNT);
    /** Tiles of the land a tile lies on, up to a little past PALM_ISLAND_TILES; 0 not looked at yet. */
    private readonly island = new Uint8Array(TILE_COUNT);
    /** 1 within REEF_RIVER_REACH of a big river: muddy water, no reef, no beach. */
    private readonly mud = new Uint8Array(TILE_COUNT);
    /** Prefix sums of the land tiles (rows + 1 × SW), so the distance to land is a few lookups. */
    private readonly landSum = new Int32Array(SW * (H + 1));
    /** Per land tile: the highest grazing fish level of a sandy reef, and of shell life, within reach. */
    private readonly shoreFish = new Uint8Array(TILE_COUNT);
    private readonly shoreShell = new Uint8Array(TILE_COUNT);
    /** 1 on a palm island's beach: palms stand denser. */
    private readonly lush = new Uint8Array(TILE_COUNT);
    /** Hash of each candidate, and the best candidate per centre cell (−1 none). */
    private readonly score = new Float32Array(TILE_COUNT);
    private readonly best = new Int32Array((W / CELL) * (H / CELL + 1));

    compute(world: WorldState): void {
      for (const a of [this.coral, this.corals, this.sands, this.fish, this.lagoon, this.beach, this.cay, this.palms, this.cand, this.island, this.mud, this.shoreFish, this.shoreShell, this.lush]) a.fill(0);
      this.reefTiles = 0;
      this.reefBeachTiles = 0;
      this.palmIsleTiles = 0;
      this.origin = -1;
      this.stonyOrigin = -1;
      const { elevation: e, biome, temperature, lifeDensity: dens } = world;
      // The coral kind each builder class has evolved so far, anywhere: the
      // stage a tile shows is only its newest form, so a class builds reefs
      // wherever it lives densely in warm coastal sea once it has corals.
      const built = new Uint8Array(LIFE_COUNT);
      for (const c of BUILDERS) for (let s = 0; s < N; s++) if (world.lifeStageCounts[c * N + s] > 0) built[c] = Math.max(built[c], BUILDS[c * N + s]);
      const reefs = BUILDERS.some((c) => built[c] > 0);
      const shells = world.lifeCounts[Life.Mollusc] > 0 || world.lifeCounts[Life.Arthropod] > 0;
      const islands = palmIslandsArrived(world);
      if (!reefs && !shells && !islands) return;
      this.sumLand(e);
      this.markMud(world);
      const list: number[] = [];
      const shellShore: number[] = [];
      const coast = Biome.Coast;
      const mollusc = Life.Mollusc;
      const arthropod = Life.Arthropod;
      const tMin = CORAL_MIN_TEMP;
      const shellTemp = SHELL_MIN_TEMP;
      const dStep = DENSITY_STEP;
      const builderMin = REEF_BUILDER_MIN;
      const shoreReach = REEF_SHORE_REACH;
      const count = TILE_COUNT;
      for (let i = 0; i < count; i++) {
        // coralWarm and level, inlined: this runs over the whole planet.
        if (biome[i] !== coast || e[i] >= 0 || temperature[i] < shellTemp) continue;
        const base = i * LC;
        const shell = shells ? grazing(Math.max(dens[base + mollusc], dens[base + arthropod])) : 0;
        if (shell > 0) this.markShore(e, i, 1, shell, this.shoreShell, shellShore);
        // Warm shallow sea along the land: on a broad shelf the "coastal sea" reaches mid-ocean ridges.
        if (!reefs || temperature[i] < tMin || this.distance(e, i) > shoreReach) continue;
        let kind = 0;
        let lvl = 0;
        for (let b = 0; b < BUILDERS.length; b++) {
          const c = BUILDERS[b];
          const k = built[c];
          if (k === 0) continue;
          const d = this.nearDensity(world, i, c);
          if (d < builderMin) continue;
          const l = Math.min(3, Math.floor(d / dStep));
          if (k > kind || (k === kind && l > lvl)) { kind = k; lvl = l; }
        }
        if (kind === 0 || this.muddy(world, i)) continue;
        this.cand[i] = kind;
        this.candLevel[i] = lvl;
        list.push(i);
      }
      if (list.length > 0) this.reefs(world, list);
      this.shellBeaches(world, shellShore);
      if (islands) this.palmIslands(world);
      if (palmsArrived(world)) this.plantPalms(islands);
    }

    /** Raise `at` to `level` on the land within R tiles of sea tile i; tiles raised from 0 go on `list`. */
    private markShore(e: Float32Array, i: number, R: number, level: number, at: Uint8Array, list: number[]): void {
      const x = i % W;
      const y = (i / W) | 0;
      for (let ny = Math.max(0, y - R); ny <= Math.min(H - 1, y + R); ny++) {
        for (let dx = -R; dx <= R; dx++) {
          const k = ny * W + col(x + dx);
          if (e[k] < 0 || at[k] >= level) continue;
          if (at[k] === 0) list.push(k);
          at[k] = level;
        }
      }
    }

    /** 0..1, alike over stretches of about BEACH_STRETCH tiles with ragged ends: beaches come in lengths, not specks. */
    private stretch(k: number, salt: number): number {
      const x = k % W;
      const y = (k / W) | 0;
      const S = BEACH_STRETCH;
      const jx = landOctave(x, y, W, W / (2 * S), salt + 1) * S;
      const jy = landOctave(x, y, W, W / (2 * S), salt + 2) * S;
      return landHash(Math.floor((x + jx) / S), Math.floor((y + jy) / S), salt);
    }

    /**
     * When a reef centre starts, in years after the first reef (salt 1509) or
     * the first stony reef (1515) whose centre is `origin`: by its distance
     * from it and by chance, as larvae drift along the coasts.
     */
    private delay(c: number, origin: number, salt: number): number {
      if (c === origin) return 0;
      const x = c % W;
      const y = (c / W) | 0;
      let far = 1;
      if (origin >= 0) {
        const dx = Math.abs(x - (origin % W));
        far = Math.min(1, Math.hypot(Math.min(dx, W - dx), y - ((origin / W) | 0)) / FARTHEST);
      }
      return REEF_SPREAD_YEARS * (0.6 * far + 0.4 * landHash(x, y, salt));
    }

    /**
     * The densest population of class c on or within REEF_LARVA_REACH tiles of
     * tile i: coral larvae settle from nearby, and on many planets the other
     * sea life crowds the cnidarians out of the coastal sea itself.
     */
    private nearDensity(world: WorldState, i: number, c: Life): number {
      const x = i % W;
      const y = (i / W) | 0;
      const R = LARVA_REACH;
      const dens = world.lifeDensity;
      let most = dens[i * LC + c];
      // Past the large reef's level nothing more is read.
      for (let ny = Math.max(0, y - R); ny <= Math.min(H - 1, y + R) && most < WIDE_DENSITY; ny++) {
        for (let dx = -R; dx <= R; dx++) {
          const d = dens[(ny * W + col(x + dx)) * LC + c];
          if (d > most) most = d;
        }
      }
      return most;
    }

    /** Mark the muddy water within REEF_RIVER_REACH of every big river. */
    private markMud(world: WorldState): void {
      const { riverLevel, riverFlow, elevation: e } = world;
      const flow = REEF_RIVER_FLOW;
      const R = REEF_RIVER_REACH;
      const count = TILE_COUNT;
      for (let i = 0; i < count; i++) {
        if (riverFlow[i] < flow || riverLevel[i] <= 0 || e[i] < 0) continue;
        const x = i % W;
        const y = (i / W) | 0;
        for (let ny = Math.max(0, y - R); ny <= Math.min(H - 1, y + R); ny++) for (let dx = -R; dx <= R; dx++) this.mud[ny * W + col(x + dx)] = 1;
      }
    }

    /** A big river within REEF_RIVER_REACH tiles of tile i. */
    private muddy(world: WorldState, i: number): boolean {
      return this.mud[i] !== 0;
    }

    /** Prefix sums of the land tiles, the columns wrapped 3 past each edge. */
    private sumLand(e: Float32Array): void {
      const s = this.landSum;
      for (let y = 0; y < H; y++) {
        const row = y * W;
        const above = y * SW;
        const here = (y + 1) * SW;
        let run = 0;
        for (let k = 0; k < SW - 1; k++) {
          if (e[row + col(k - 3)] >= 0) run++;
          s[here + k + 1] = s[above + k + 1] + run;
        }
      }
    }

    /** Chebyshev distance from tile i to land, 1..3, or 4 beyond (four box sums at most). */
    private distance(e: Float32Array, i: number): number {
      const s = this.landSum;
      const x = (i % W) + 3;
      const y = (i / W) | 0;
      for (let r = 1; r <= 3; r++) {
        const y0 = Math.max(0, y - r) * SW;
        const y1 = (Math.min(H - 1, y + r) + 1) * SW;
        const x0 = x - r;
        const x1 = x + r + 1;
        if (s[y1 + x1] - s[y0 + x1] - s[y1 + x0] + s[y0 + x0] > 0) return r;
      }
      return 4;
    }

    /**
     * Centres on the seed's cell grid, each reef grown around its centre as
     * far as its age allows, then lagoons, sand cays and white beaches.
     */
    private reefs(world: WorldState, list: number[]): void {
      const { elevation: e, lifeDensity: dens } = world;
      const ox = Math.floor(landHash(world.seed, 0, 1501) * CELL);
      const oy = Math.floor(landHash(world.seed, 1, 1501) * CELL);
      const salt = (world.seed * 31 + 1503) | 0;
      const cols = W / CELL;
      const { score, best } = this;
      best.fill(-1);
      for (const i of list) {
        score[i] = landHash(i % W, (i / W) | 0, salt);
        const cell = Math.floor((((i / W) | 0) + oy) / CELL) * cols + (Math.floor(((i % W) + ox) / CELL) % cols);
        if (best[cell] < 0 || score[i] > score[best[cell]]) best[cell] = i;
      }
      const centres: number[] = [];
      for (const c of best) if (c >= 0) centres.push(c);
      centres.sort((a, b) => score[b] - score[a]);
      const kept: number[] = [];
      for (const c of centres) {
        const cx = c % W;
        const cy = (c / W) | 0;
        if (kept.some((k) => {
          const dx = Math.abs((k % W) - cx);
          const dy = ((k / W) | 0) - cy;
          return Math.min(dx, W - dx) ** 2 + dy * dy < SPACING2;
        })) continue;
        kept.push(c);
      }
      // Before its chronicle entry, the first (best) centre is the origin.
      const grow = since(world, FIRST_REEF);
      const stony = since(world, STONY_REEF);
      this.origin = grow.origin >= 0 ? grow.origin : kept.length > 0 ? kept[0] : -1;
      this.stonyOrigin = stony.origin >= 0 ? stony.origin : kept.find((c) => this.cand[c] === CoralKind.Stony) ?? -1;
      const reefTiles: number[] = [];
      /** The reef (index into kept) of each reef tile, and the tile's age in years. */
      const owner: number[] = [];
      const tileAge: number[] = [];
      let ring: number[] = [];
      let next: number[] = [];
      for (let n = 0; n < kept.length; n++) {
        const c = kept[n];
        const age = grow.age - this.delay(c, this.origin, 1509);
        if (age < 0) continue;
        // Not yet taken over: the old reef stands on, even once its rugose corals are gone (they end because the stony ones spread).
        let kind = this.cand[c];
        if (kind === CoralKind.Stony && stony.age < this.delay(c, this.stonyOrigin, 1515)) kind = CoralKind.Rugose;
        const wide = this.candLevel[c] >= REEF_WIDE_LEVEL ? 1 : 0;
        const full = kind === CoralKind.Stony ? 1 + wide : wide;
        const rings = Math.min(full, Math.floor(age / REEF_RING_YEARS));
        // Ring by ring over the candidates (8 neighbours), so a reef follows the coast; the last ring ragged.
        const take = (j: number, r: number): void => {
          this.coral[j] = kind;
          reefTiles.push(j);
          owner.push(n);
          tileAge.push(age - r * REEF_RING_YEARS);
          next.push(j);
        };
        ring.length = 0;
        next.length = 0;
        take(c, 0);
        for (let r = 1; r <= rings; r++) {
          [ring, next] = [next, ring];
          next.length = 0;
          for (const t of ring) {
            const x = t % W;
            const y = (t / W) | 0;
            for (let ny = Math.max(0, y - 1); ny <= Math.min(H - 1, y + 1); ny++) {
              for (let dx = -1; dx <= 1; dx++) {
                const j = ny * W + col(x + dx);
                if (this.cand[j] === 0 || this.coral[j] !== 0) continue;
                if (r === full && landHash(j % W, ny, 1511) >= REEF_EDGE_SHARE) continue;
                take(j, r);
              }
            }
          }
        }
      }
      this.reefTiles = reefTiles.length;
      // Grazing fish on or beside any tile of a reef graze the whole reef and grind a share of its coral to sand.
      const grazers = grazersNow(world);
      const reefFish = new Uint8Array(kept.length);
      for (let n = 0; n < reefTiles.length && grazers.length > 0; n++) {
        if (reefFish[owner[n]] === 3) continue;
        const j = reefTiles[n];
        const x = j % W;
        const y = (j / W) | 0;
        let most = 0;
        for (let ny = Math.max(0, y - 1); ny <= Math.min(H - 1, y + 1); ny++) {
          for (let dx = -1; dx <= 1; dx++) {
            const base = (ny * W + col(x + dx)) * LC;
            for (let g = 0; g < grazers.length; g++) if (dens[base + grazers[g]] > most) most = dens[base + grazers[g]];
          }
        }
        reefFish[owner[n]] = Math.max(reefFish[owner[n]], grazing(most));
      }
      const patches = REEF_PATCHES;
      const wide = REEF_WIDE_LEVEL;
      const share = REEF_FISH_SAND / 3;
      for (let n = 0; n < reefTiles.length; n++) {
        const j = reefTiles[n];
        const fish = reefFish[owner[n]];
        const total = patches + (this.candLevel[j] >= wide ? 1 : 0);
        const grown = Math.min(total, 1 + Math.floor(tileAge[n] / REEF_PATCH_YEARS));
        // Rounded up: wherever grazing fish live, some sand shows once the tile has more than one patch.
        const sand = Math.min(Math.ceil(total * share * fish), grown - 1);
        this.fish[j] = fish;
        this.sands[j] = sand;
        this.corals[j] = grown - sand;
        this.lagoon[j] = sand > 0 ? 3 : 2;
        // The sand piles up into a cay out on the grown reef.
        if (grown === total && fish >= CAY_FISH && this.distance(e, j) >= CAY_OFFSHORE && landHash(j % W, (j / W) | 0, 1513) < CAY_SHARE) this.cay[j] = 1;
      }
      const lagoons = reefTiles.slice();
      // The coastal sea a tile landward of the reef is lagoon too.
      for (const j of reefTiles) {
        const x = j % W;
        const y = (j / W) | 0;
        const dj = this.distance(e, j);
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const k = ny * W + col(x + dx);
            if (e[k] >= 0 || this.coral[k] !== 0 || world.biome[k] !== COAST) continue;
            const dk = this.distance(e, k);
            if (dk >= dj && dk > 1) continue;
            if (this.lagoon[k] === 0) lagoons.push(k);
            this.lagoon[k] = Math.max(this.lagoon[k], this.sands[j] > 0 ? 2 : 1);
          }
        }
      }
      // Land beside a lagoon takes its turquoise up to the shore.
      for (const j of lagoons) {
        const g = this.lagoon[j];
        const x = j % W;
        const y = (j / W) | 0;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const k = ny * W + col(x + dx);
            if (e[k] >= 0 && this.lagoon[k] < g) this.lagoon[k] = g;
          }
        }
      }
      // White beaches on the coast near sandy reefs, in longer stretches the more fish graze.
      const shore: number[] = [];
      for (const j of reefTiles) if (this.sands[j] > 0) this.markShore(e, j, BEACH_REACH, this.fish[j], this.shoreFish, shore);
      for (const k of shore) {
        if (!this.coastal(e, k) || !beachable(world, k) || this.muddy(world, k)) continue;
        const share = this.islandSize(e, k) <= BEACH_ISLAND_TILES ? BEACH_ISLAND_SHARE : BEACH_SHARE[this.shoreFish[k]];
        if (this.stretch(k, 1505) >= share) continue;
        this.beach[k] = BeachKind.Reef;
        this.reefBeachTiles++;
      }
    }

    /** Narrow shell beaches in stretches beside molluscs and shelled arthropods (`shore`: the land beside them, levels in shoreShell). */
    private shellBeaches(world: WorldState, shore: number[]): void {
      for (const k of shore) {
        if (this.beach[k] !== 0 || this.stretch(k, 1507) >= SHELL_BEACH_SHARE[this.shoreShell[k]] || !beachable(world, k) || this.muddy(world, k)) continue;
        this.beach[k] = BeachKind.Shell;
      }
    }

    /** Warm small islands: an almost closed beach ring, white once fish grind sand anywhere. */
    private palmIslands(world: WorldState): void {
      const { elevation: e, temperature } = world;
      const kind = grazersNow(world).length > 0 ? BeachKind.Reef : BeachKind.Shell;
      for (let k = 0; k < TILE_COUNT; k++) {
        if (e[k] < 0 || temperature[k] < PALM_ISLAND_TEMP || !this.coastal(e, k) || this.islandSize(e, k) > PALM_ISLAND_TILES) continue;
        if (!beachable(world, k) || this.muddy(world, k)) continue;
        if (this.beach[k] === 0) {
          if (this.stretch(k, 1517) >= PALM_ISLAND_SHARE) continue;
          this.beach[k] = kind;
        }
        this.lush[k] = 1;
      }
    }

    /** Palms on the beaches, denser on palm islands, and on the sand cays once broadleaf trees exist. */
    private plantPalms(islands: boolean): void {
      for (let i = 0; i < TILE_COUNT; i++) {
        if (this.beach[i] !== 0) this.palms[i] = beachPalms(i, this.lush[i] !== 0);
        else if (this.cay[i] !== 0 && islands) this.palms[i] = landHash(i % W, (i / W) | 0, 1519) < 0.35 ? 2 : 1;
        else continue;
        if (this.palms[i] > 0 && (this.lush[i] !== 0 || this.cay[i] !== 0)) this.palmIsleTiles++;
      }
    }

    /** Land tile i borders the sea (8 neighbours). */
    private coastal(e: Float32Array, i: number): boolean {
      const x = i % W;
      const y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= H) continue;
        for (let dx = -1; dx <= 1; dx++) if (e[ny * W + col(x + dx)] < 0) return true;
      }
      return false;
    }

    /** Tiles of the land (8-connected) that land tile i lies on; past PALM_ISLAND_TILES only "more". */
    private islandSize(e: Float32Array, i: number): number {
      if (this.island[i] === 0) {
        const found = [i];
        const queued = new Set(found);
        for (let q = 0; q < found.length && found.length <= PALM_ISLAND_TILES; q++) {
          const x = found[q] % W;
          const y = (found[q] / W) | 0;
          for (let dy = -1; dy <= 1; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= H) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const j = ny * W + col(x + dx);
              if (e[j] >= 0 && !queued.has(j)) { queued.add(j); found.push(j); }
            }
          }
        }
        const size = Math.min(255, found.length);
        for (const j of found) this.island[j] = size;
      }
      return this.island[i];
    }
  }

  let memo: ReefMap | null = null;
  let memoWorld: WorldState | null = null;
  let memoKey = '';

  /** The reefs, lagoons and beaches of `world` as it is now (worked out once per tick, edit or chronicle entry: the reef entries date the growth). */
  export function reefMap(world: WorldState): ReefMap {
    const key = `${world.seed}|${world.ticks}|${world.revision}|${world.evo.chronicle.length}`;
    if (memo && memoWorld === world && memoKey === key) return memo;
    memo = memo ?? new ReefMap();
    memo.compute(world);
    memoWorld = world;
    memoKey = key;
    return memo;
  }

  /** Have palms evolved: the flowering plants developed, and the date past the oldest palm fossils? */
  export function palmsArrived(world: WorldState): boolean {
    return world.evo.developed.has(FLORA[Flora.Flowering].id) && yearsAgo(world.absoluteYears) <= PALM_FIRST_YEARS_AGO;
  }

  /** Palms on beach tile i: 0, 1 or a pair (2), by the tile's hash; more often on a palm island (`lush`). */
  export function beachPalms(i: number, lush = false): number {
    const h = landHash(i % W, (i / W) | 0, 840);
    return h < (lush ? PALM_ISLAND_ONE : PALM_ONE) ? 0 : h < PALM_PAIR ? 1 : 2;
  }

  /** Do warm small islands turn into palm islands: palms there, and broadleaf trees developed? */
  export function palmIslandsArrived(world: WorldState): boolean {
    return palmsArrived(world) && world.evo.developed.has(FLORA[Flora.Broadleaf].id);
  }

  /**
   * The sub-species a creature of class c shows on tile i: a reef builder
   * only in coral-warm water; elsewhere the class's highest stage below it
   * that builds no reef.
   */
  export function reefShownStage(world: WorldState, i: number, c: Life, stage: number): number {
    if (BUILDS[c * N + stage] === 0 || coralWarm(world.temperature[i])) return stage;
    let s = stage;
    while (s > 0 && BUILDS[c * N + s] !== 0) s--;
    return s;
  }

  /** What the Examine window says about tile i's reef or beach (German), [] for neither. */
  export function reefNotes(world: WorldState, i: number): string[] {
    const m = reefMap(world);
    const kind = m.coral[i];
    if (kind !== CoralKind.None) {
      const out = [`Korallenriff (${CORAL_NAMES[kind]}) · Wassertemperatur ${fmt.int(world.temperature[i])} °C`];
      if (m.fish[i] > 0) out.push('Fische raspeln Kalk zu Sand');
      if (m.cay[i] !== 0) out.push(m.palms[i] > 0 ? 'Sandinsel mit Kokospalmen' : 'Sandinsel aus Riffsand');
      // Clownfish live on every reef (clownfishlayer.ts).
      out.push('Clownfische leben in Seeanemonen dazwischen');
      return out;
    }
    const b = m.beach[i];
    return b === BeachKind.Reef ? ['Weißer Kalksand vom Riff'] : b === BeachKind.Shell ? ['Muschelsand'] : [];
  }

  /**
   * The chronicle entries for the first reef, the first stony reef, the first
   * white beach and the first palm island, once each (called from app.ts).
   * The reef entries also date the reefs' growth. With `past`, what the
   * planet starts with is history: those two are dated back to the corals'
   * date on Earth, and at least as far as the reefs take to grow in full.
   */
  export function reefMilestones(world: WorldState, past = false): ChronicleEntry[] {
    const has = (key: string): boolean => world.evo.chronicle.some((e) => e.key === key);
    const keys = [FIRST_REEF, STONY_REEF, FIRST_BEACH, PALM_ISLES];
    const missing = keys.filter((k) => !has(k));
    if (missing.length === 0) return [];
    const m = reefMap(world);
    const out: ChronicleEntry[] = [];
    const at = { tick: world.ticks, years: world.absoluteYears, major: false, kind: 'milestone' as ChronicleKind };
    const grown = (kind: CoralKind): number => !past ? world.absoluteYears
      : Math.min(world.absoluteYears - REEF_GROWN_YEARS, PLANET_AGE - CORAL_MA[kind] * 1e6);
    if (missing.includes(FIRST_REEF) && m.reefTiles > 0) {
      out.push({
        ...at, years: grown(CoralKind.Rugose), at: m.origin, key: FIRST_REEF, title: 'Erste Riffe',
        text: 'In warmen Flachmeeren bauen Korallen Kalkriffe. Ihre Larven treiben die Küsten entlang und gründen Riff um Riff; über ihnen leuchtet das klare Wasser türkis.',
        change: 'Vom ersten Riff aus wachsen nach und nach Riffe und türkise Lagunen an warmen Küsten.', icon: evoIcon('earlyAnimals'),
      });
    }
    if (missing.includes(STONY_REEF) && m.stonyOrigin >= 0) {
      out.push({
        ...at, years: grown(CoralKind.Stony), at: m.stonyOrigin, key: STONY_REEF, title: 'Steinkorallen bauen Riffe',
        text: 'Steinkorallen übernehmen den Riffbau. Sie wachsen in vielen Formen und Farben, als Knollen, Platten und verzweigte Stöcke.',
        change: 'Riff um Riff wird bunter: Steinkorallen breiten sich von ihrem ersten Riff aus.', icon: evoIcon('earlyAnimals'),
      });
    }
    if (missing.includes(FIRST_BEACH) && m.reefBeachTiles > 0) {
      out.push({
        ...at, key: FIRST_BEACH, title: 'Weiße Strände',
        text: 'Fische raspeln die Korallen ab und scheiden den Kalk als feinen Sand aus. Die Wellen spülen ihn an die Küsten und häufen ihn draußen auf dem Riff zu kleinen Sandinseln.',
        change: 'Neben Riffen mit Fischen liegen jetzt weiße Sandstrände, je mehr Fische, desto längere.', icon: evoIcon('fish'),
      });
    }
    if (missing.includes(PALM_ISLES) && m.palmIsleTiles > 0) {
      out.push({
        ...at, key: PALM_ISLES, title: 'Palmeninseln',
        text: 'Auf warmen Inseln und Sandinseln wachsen Kokospalmen. Ihre Nüsse schwimmen monatelang im Meer und keimen an fernen Stränden.',
        change: 'Kleine Inseln in warmen Meeren tragen jetzt Strände und Palmen.', icon: evoIcon('flowering'),
      });
    }
    return out;
  }
}
