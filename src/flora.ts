/* =============================================================================
 * SimEarth 2.0 — the plant layer
 * -----------------------------------------------------------------------------
 * Plants are not populations the way animals are. Each tile carries a bitmask
 * of the plant groups growing there (`WorldState.flora`) and a single cover
 * value (`vegetation`, which on water tiles is the density of marine algae).
 *
 * Which groups a tile can hold is decided by one suitability function per
 * group — temperature, relative wetness, access to open water, altitude — so
 * the order the planet greens in is a consequence of the climate the player
 * already sees, not of scripted placement:
 *
 *   the first land plants need a wet shore or a river bank next door,
 *   mosses need damp ground but tolerate cold,
 *   vascular plants follow the rivers inland,
 *   only seed plants, conifers and grasses reach the dry interior,
 *   the flowering plants the deserts once they grow as cacti (cacti.ts).
 *
 * Groups spread tile by tile into suitable neighbours, with a little long
 * range dispersal on top, and die back where the climate turns against them.
 * Earlier groups are never replaced wholesale — a tile can hold many — so a
 * moss survives in the tundra and the bog long after the forests arrive.
 * ========================================================================== */

namespace SE {
  /** Suitability below which a group dies back on a tile. */
  const DIEBACK = 0.04;
  /** Suitability a neighbour must offer before a group spreads into it. */
  const SPREAD_MIN = 0.15;
  /** Random target tiles examined per tick for long-range dispersal. */
  const JUMP_SAMPLES = 80;
  /** Radius, in tiles, from which long-range dispersal can arrive. */
  const JUMP_RADIUS = 8;
  /** Random tiles per tick that may receive planet-wide dispersal. */
  const GLOBAL_SAMPLES = 12;

  /** Pollinators boost these groups' cover and spread where they live. */
  export const POLLINATED_MASK =
    floraBit(Flora.Flowering) | floraBit(Flora.Broadleaf) | floraBit(Flora.Carnivorous);
  /** Cover multiplier for pollinated groups on a tile with pollinators. */
  export const POLLINATION_COVER = 1.2;
  /** Spread multiplier for pollinated groups from a tile with pollinators. */
  export const POLLINATION_SPREAD = 2.0;
  /** Seed groups that birds carry further. */
  export const BIRD_DISPERSED_MASK =
    floraBit(Flora.SeedPlants) | floraBit(Flora.Conifers) |
    floraBit(Flora.Flowering) | floraBit(Flora.Broadleaf);
  /** Long-range dispersal multiplier for those groups once birds are common. */
  export const BIRD_DISPERSAL = 2.0;
  /** Pollinator density on a tile that counts as "pollinators live here". */
  const POLLINATOR_PRESENT = 0.05;

  export class FloraSystem {
    /**
     * Moisture over what the air could hold at the tile's temperature, so a
     * cold tundra with little water and a hot coast with plenty can both be
     * judged on how *wet* they feel to a plant.
     */
    readonly wetness = new Float32Array(TILE_COUNT);
    /** 0..1: how directly a land tile touches open water. */
    readonly waterAccess = new Float32Array(TILE_COUNT);
    private readonly tempLo = new Float32Array(FLORA_COUNT);
    private readonly tempHi = new Float32Array(FLORA_COUNT);
    private readonly tempCore = new Float32Array(FLORA_COUNT);
    private preparedTick = -1;
    private preparedWorld: WorldState | null = null;
    /** Cacti exist: flowering plants reach drier desert ground (cacti.ts). */
    private cacti = false;
    /** Groups present anywhere on the planet, refreshed each step. */
    private presentMask = 0;

    /* -------------------------------------------------------- preparation -- */

    /**
     * Refresh the per-tile inputs every suitability test reads. Called once a
     * tick by the step, and by anything that needs suitabilities in between
     * (the tree's site search, the planting tool) — cheap enough to redo.
     */
    prepare(world: WorldState, params: ModelParams, force = false): void {
      if (!force && this.preparedWorld === world && this.preparedTick === world.ticks) return;
      this.preparedWorld = world;
      this.preparedTick = world.ticks;
      this.cacti = cactiArrived(world);

      const tolerance = clamp(mul(params.bio.tolerance), 0.2, 2);
      for (let g = 1; g < FLORA_COUNT; g++) {
        const def = FLORA[g as Flora];
        const mid = (def.temp[0] + def.temp[1]) / 2;
        const half = ((def.temp[1] - def.temp[0]) / 2) * tolerance;
        this.tempLo[g] = mid - half;
        this.tempHi[g] = mid + half;
        this.tempCore[g] = Math.max(1e-6, half * 2 * 0.18);
      }

      const { elevation, moisture, temperature, riverLevel, riparian } = world;
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          const i = idx(x, y);
          const t = temperature[i];
          const hold = 0.35 + 0.65 * clamp((t + 12) / 42, 0, 1);
          this.wetness[i] = Math.min(1.2, moisture[i] / hold);

          if (elevation[i] < 0) { this.waterAccess[i] = 0; continue; }
          let access = 0;
          if (riverLevel[i] > 0) access = 1;
          else if (riparian[i] > 0) access = 0.85;
          if (moisture[i] >= WETLAND_MOISTURE && elevation[i] < WETLAND_MAX_ELEVATION) access = 1;
          if (access < 0.9) {
            const coast =
              elevation[idx(wrapX(x - 1), y)] < 0 || elevation[idx(wrapX(x + 1), y)] < 0 ||
              elevation[idx(x, clampY(y - 1))] < 0 || elevation[idx(x, clampY(y + 1))] < 0;
            if (coast) access = 0.9;
          }
          this.waterAccess[i] = access;
        }
      }
    }

    /** Is this land tile a wetland — a bog, a marsh, standing water? */
    static isWetland(world: WorldState, i: number): boolean {
      return world.elevation[i] >= 0 && world.moisture[i] >= WETLAND_MOISTURE && world.elevation[i] < WETLAND_MAX_ELEVATION;
    }

    /* -------------------------------------------------------- suitability -- */

    /**
     * How well group `g` grows on tile `i`, 0..1. The single source of truth
     * for where a plant can live: growth, spread, die-back, the tree's habitat
     * condition and the planting tool all ask this.
     */
    suit(world: WorldState, g: Flora, i: number): number {
      const def = FLORA[g];
      const t = world.temperature[i];
      const lo = this.tempLo[g];
      const hi = this.tempHi[g];
      if (t <= lo || t >= hi) return 0;
      const core = this.tempCore[g];
      const tempF = Math.min(1, (t - lo) / core, (hi - t) / core);

      const e = world.elevation[i];
      switch (def.realm) {
        case 'sea': {
          if (e >= 0) return 0;
          // Algae meadows need light: the sunlit shelf, barely the open ocean.
          const depth = e > COAST_DEPTH ? 1 : 0.1;
          return tempF * depth;
        }
        case 'fresh': {
          if (e < 0) return 0;
          const access = world.riverLevel[i] > 0 ? 1
            : FloraSystem.isWetland(world, i) ? 0.85
              : this.waterAccess[i] >= 0.85 ? 0.45 : 0;
          return tempF * access;
        }
        case 'land': {
          if (e < 0) return 0;
          const w = this.wetness[i];
          let wetF = clamp((w - def.wet[0]) / Math.max(0.01, def.wet[1] - def.wet[0]), 0, 1);
          if (this.cactusGround(world, g, i)) wetF = Math.max(wetF, cactusWetFactor(w));
          if (wetF <= 0) return 0;
          const waterF = 1 - def.needsWater * (1 - this.waterAccess[i]);
          const altF = e <= def.maxElevation ? 1 : clamp(1 - (e - def.maxElevation) / 0.15, 0, 1);
          const s = tempF * wetF * waterF * altF;
          return s * floraCompetition(world, g, i);
        }
      }
    }

    /** Flowering plants on desert ground once cacti exist. */
    private cactusGround(world: WorldState, g: Flora, i: number): boolean {
      return g === Flora.Flowering && this.cacti && isCactusLandscape(world.landscape[i]);
    }

    /** Why a group cannot grow on a tile, in plain German, or null. */
    problem(world: WorldState, g: Flora, i: number): string | null {
      const def = FLORA[g];
      const e = world.elevation[i];
      const gone = floraGoneReason(world, g);
      if (gone) return gone;
      if (def.realm === 'sea' && e >= 0) return 'braucht flaches Meerwasser';
      if (def.realm === 'sea' && e <= COAST_DEPTH) return 'braucht lichtdurchflutetes Küstenmeer';
      if (def.realm !== 'sea' && e < 0) return 'wächst nicht im Meer';
      const t = world.temperature[i];
      if (t <= this.tempLo[g]) return 'es ist dort zu kalt';
      if (t >= this.tempHi[g]) return 'es ist dort zu heiß';
      if (def.realm === 'fresh' && this.suit(world, g, i) <= 0) return 'braucht einen Fluss oder ein Feuchtgebiet';
      // Only explain a suitability too low to spread into: these checks are coarser than suit().
      if (def.realm === 'land' && this.suit(world, g, i) < SPREAD_MIN) {
        if (this.wetness[i] <= (this.cactusGround(world, g, i) ? CACTUS_WET_MIN : def.wet[0])) return 'es ist dort zu trocken';
        if (def.needsWater >= 0.6 && this.waterAccess[i] < 0.5) return 'braucht Wasser in der Nähe (Ufer, Fluss oder Feuchtgebiet)';
        if (e > def.maxElevation + 0.1) return 'das Gelände liegt zu hoch';
      }
      if (this.suit(world, g, i) < SPREAD_MIN) {
        if (g === Flora.Clubmosses && floraCompetition(world, g, i) < 1) return 'Nadel- und Laubbäume verdrängen dort die Bärlappe';
        if (floraCompetition(world, g, i) < 1) return `${floraRivalNames(g)} verdrängen sie dort`;
        return 'die Bedingungen sind dort zu ungünstig';
      }
      return null;
    }

    /* ------------------------------------------------------------- acting -- */

    /**
     * Put a group on a tile with an initial cover. Returns whether anything
     * changed — the planting tool charges only when it did.
     */
    plant(world: WorldState, g: Flora, i: number, strength: number): boolean {
      const bit = 1 << g;
      const had = (world.flora[i] & bit) !== 0;
      world.flora[i] |= bit;
      const start = this.suit(world, g, i) * floraStature(world, g) * strength;
      const before = world.vegetation[i];
      if (start > world.vegetation[i]) world.vegetation[i] = start;
      world.floraTop[i] = this.leader(world, i);
      return !had || world.vegetation[i] > before + 1e-6;
    }

    /** Cover a group reaches on a tile of suitability `s` (pollinators and insects included). */
    private reach(world: WorldState, g: Flora, s: number, pollinated: boolean, insects: boolean): number {
      let stature = floraStature(world, g);
      if (pollinated && ((1 << g) & POLLINATED_MASK)) stature *= POLLINATION_COVER;
      if (g === Flora.Carnivorous) stature *= insects ? 1.4 : 0.7;
      return s * stature;
    }

    /** The group that leads a tile, as the step picks it — without its die-back roll. */
    private leader(world: WorldState, i: number): Flora {
      const pollinated = world.lifeDensity[i * LIFE_COUNT + Life.Pollinator] > POLLINATOR_PRESENT;
      const insects = world.lifeDensity[i * LIFE_COUNT + Life.Insect] > POLLINATOR_PRESENT;
      let top = Flora.None;
      let topScore = 0;
      let m = world.flora[i];
      while (m !== 0) {
        const g = 31 - Math.clz32(m & -m);
        m &= m - 1;
        const s = this.suit(world, g as Flora, i);
        if (s < DIEBACK) continue;
        const score = this.reach(world, g as Flora, s, pollinated, insects) * (1 + g * 0.03);
        if (score > topScore) { topScore = score; top = g as Flora; }
      }
      return top;
    }

    /** Would `plant` change this tile? (Not already there at that cover.) */
    wouldPlant(world: WorldState, g: Flora, i: number, strength: number): boolean {
      if ((world.flora[i] & (1 << g)) === 0) return true;
      return this.suit(world, g, i) * floraStature(world, g) * strength > world.vegetation[i] + 1e-6;
    }

    /**
     * Clear every plant group off a land tile (the "clearing" brush). The
     * landscape falls back to bare soil at once and has to regrow stage by
     * stage.
     */
    clear(world: WorldState, i: number): boolean {
      if (world.isWater(i)) return false;
      const changed = world.flora[i] !== 0 || world.vegetation[i] > 0;
      world.flora[i] = 0;
      world.vegetation[i] = 0;
      world.floraTop[i] = Flora.None;
      SuccessionSystem.clear(world, i);
      return changed;
    }

    /* --------------------------------------------------------------- tick -- */

    step(world: WorldState, params: ModelParams): void {
      this.prepare(world, params);
      // Logged woodland (wood.ts) grows back a little before the plants grow; a city cuts what grew.
      regrowWood(world);
      const { flora, vegetation, floraTop, lifeDensity, logged } = world;
      const rng = world.rng;
      const growth = 0.12 * mul(params.bio.reproductionRate);
      const co2Gate = clamp((world.co2 - 20) / 60, 0, 1);
      const insectBase = Life.Insect;
      const pollBase = Life.Pollinator;

      let present = 0;
      const iceShare = cometIceShare(world);

      // --- growth, die-back and which group leads each tile ---
      for (let i = 0; i < TILE_COUNT; i++) {
        let mask = flora[i];
        if (mask === 0) {
          const v = vegetation[i];
          vegetation[i] = v < 0.002 ? 0 : v * 0.94;
          floraTop[i] = Flora.None;
          continue;
        }

        const pollinated = lifeDensity[i * LIFE_COUNT + pollBase] > POLLINATOR_PRESENT;
        const insects = lifeDensity[i * LIFE_COUNT + insectBase] > POLLINATOR_PRESENT;
        let cap = 0;
        let top = Flora.None;
        let topScore = 0;
        // Within the reach of the comet's winter (cometwinter.ts) every group holds on
        // until it is over, under the ice at a trace of cover.
        const dormant = iceShare > 0 && cometIceAt(world, i, COMET_ICE_SHARE);
        const frozen = dormant && cometIceAt(world, i, iceShare);

        let m = mask;
        while (m !== 0) {
          const g = 31 - Math.clz32(m & -m);
          m &= m - 1;
          const s = this.suit(world, g as Flora, i);
          if (s < DIEBACK) {
            if (!dormant && rng.chance(0.06)) mask &= ~(1 << g);
            continue;
          }
          const k = this.reach(world, g as Flora, s, pollinated, insects);
          if (k > cap) cap = k;
          const score = k * (1 + g * 0.03);
          if (score > topScore) { topScore = score; top = g as Flora; }
        }
        flora[i] = mask;
        floraTop[i] = top;
        present |= mask;

        // Photosynthesis needs carbon; the sea's algae are gated the same way.
        cap = Math.min(1, cap) * co2Gate;
        if (logged[i] !== 0) cap = Math.min(cap, 1 - logged[i] / 255);
        const v = vegetation[i];
        let next: number;
        if (cap > 0.02) {
          const seed = v < 0.01 ? 0.01 : v;
          next = seed + seed * growth * (1 - seed / cap);
        } else {
          next = v - v * 0.06;
        }
        if (frozen) next = COMET_ICE_COVER;
        vegetation[i] = next < 0.002 ? 0 : Math.min(1, next);
      }
      this.presentMask = present;

      // --- spread into one neighbour per tile ---
      for (let i = 0; i < TILE_COUNT; i++) {
        const mask = flora[i];
        if (mask === 0 || vegetation[i] < 0.03) continue;
        const x = i % GRID_W;
        const y = (i / GRID_W) | 0;
        const dir = rng.int(4);
        const j = dir === 0 ? idx(wrapX(x - 1), y) : dir === 1 ? idx(wrapX(x + 1), y)
          : dir === 2 ? idx(x, clampY(y - 1)) : idx(x, clampY(y + 1));
        if (j === i) continue;
        let cand = mask & ~flora[j];
        if (cand === 0) continue;
        const pollinated = lifeDensity[i * LIFE_COUNT + pollBase] > POLLINATOR_PRESENT;
        while (cand !== 0) {
          const g = 31 - Math.clz32(cand & -cand);
          cand &= cand - 1;
          let p = FLORA[g as Flora].spread;
          if (pollinated && ((1 << g) & POLLINATED_MASK)) p *= POLLINATION_SPREAD;
          if (!rng.chance(p)) continue;
          if (this.suit(world, g as Flora, j) < SPREAD_MIN) continue;
          flora[j] |= 1 << g;
          if (vegetation[j] < 0.02) vegetation[j] = 0.02;
        }
      }

      // --- long-range dispersal: spores on the wind, seeds in birds ---
      const birds = world.lifeCounts[Life.Avian] > ECO_MIN_TILES * 4;
      for (let n = 0; n < JUMP_SAMPLES; n++) {
        const j = rng.int(TILE_COUNT);
        let cand = present & ~flora[j];
        if (cand === 0) continue;
        // What grows within reach of this tile? Sample instead of scanning.
        const x = j % GRID_W;
        const y = (j / GRID_W) | 0;
        let near = 0;
        for (let k = 0; k < 10; k++) {
          const sx = wrapX(x + rng.int(JUMP_RADIUS * 2 + 1) - JUMP_RADIUS);
          const sy = clampY(y + rng.int(JUMP_RADIUS * 2 + 1) - JUMP_RADIUS);
          near |= flora[idx(sx, sy)];
        }
        cand &= near;
        while (cand !== 0) {
          const g = 31 - Math.clz32(cand & -cand);
          cand &= cand - 1;
          let p = FLORA[g as Flora].jumps * 0.12;
          if (birds && ((1 << g) & BIRD_DISPERSED_MASK)) p *= BIRD_DISPERSAL;
          if (!rng.chance(p)) continue;
          if (this.suit(world, g as Flora, j) < 0.25) continue;
          flora[j] |= 1 << g;
          if (vegetation[j] < 0.02) vegetation[j] = 0.02;
        }
      }

      this.globalDispersal(world, present);
      clubmossSpores(world, this, present);
      updateFloraEras(world, present);
    }

    /**
     * Rare dispersal across the whole planet - spores in the jet stream,
     * seeds on drift, later in birds - scaled by how common the group already
     * is. Without it a continent separated from the first green coast by more
     * than JUMP_RADIUS of open sea would stay bare for the rest of the game.
     */
    private globalDispersal(world: WorldState, present: number): void {
      const rng = world.rng;
      const birds = world.lifeCounts[Life.Avian] > ECO_MIN_TILES * 4;
      for (let n = 0; n < GLOBAL_SAMPLES; n++) {
        const j = rng.int(TILE_COUNT);
        let cand = present & ~world.flora[j];
        while (cand !== 0) {
          const g = 31 - Math.clz32(cand & -cand);
          cand &= cand - 1;
          const share = Math.min(1, world.floraCounts[g] / 1500);
          let p = FLORA[g as Flora].jumps * 0.01 * share;
          if (birds && ((1 << g) & BIRD_DISPERSED_MASK)) p *= BIRD_DISPERSAL;
          if (!rng.chance(p)) continue;
          if (this.suit(world, g as Flora, j) < 0.3) continue;
          world.flora[j] |= 1 << g;
          if (world.vegetation[j] < 0.02) world.vegetation[j] = 0.02;
        }
      }
    }

    /** Groups present anywhere at the end of the last step. */
    get present(): number {
      return this.presentMask;
    }
  }
}
