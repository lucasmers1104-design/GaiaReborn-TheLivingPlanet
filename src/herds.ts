/* =============================================================================
 * SimEarth 2.0 — wandering creatures on the Edit window
 * -----------------------------------------------------------------------------
 * The map's animals as persistent markers, as in the original SimEarth: each
 * stands on a tile its class lives on, a tile away from any city, now and
 * then steps one tile to a neighbour its class also holds, glides there and
 * faces the way it goes.
 * Which classes get markers is chosen for variety rather than by raw
 * numbers: each tile shows one of the classes living on it, picked stably
 * with rare classes and predators favoured, no class taking more than its
 * share where several live together, every class on a few tiles gets some,
 * and the first cells show on only half their tiles. Some creatures join one
 * of their kind next door, so small groups form, and patches stay empty.
 * Graphics only — the simulation never reads the markers.
 * ========================================================================== */

namespace SE {
  /** Density from which a class counts as living on a tile, for the map. */
  export const HERD_MIN_DENSITY = 0.05;
  /** A marker stays until its class falls below this on its tile. */
  const HERD_KEEP_DENSITY = 0.02;
  /** Tiles showing a class per marker of it (each inhabited tile shows at most one class). */
  const TILES_PER_MARKER = 7;
  /** Ticks between two rounds of picking new markers. */
  const RESELECT_TICKS = 6;
  /** After a player edit (no tick), pick again at most this often, in ms. */
  const EDIT_RESELECT_MS = 300;
  /** A class on at least QUOTA_MIN_TILES tiles always gets QUOTA_MARKERS markers. */
  const QUOTA_MIN_TILES = 3;
  const QUOTA_MARKERS = 4;
  /** Markers grow with tiles^SHARE_EXPONENT, so rare classes get more than their share. */
  const SHARE_EXPONENT = 0.7;
  const PREDATOR_WEIGHT = 1.6;
  /**
   * Where several classes live on a tile, the share of the tile's picks one
   * class may take at most (never below an even split), and at least.
   */
  const MAX_SHARE = 0.45;
  const MIN_SHARE = 0.1;
  /** Share of the first cells' tiles that show them, so the young sea leaves room for later life. */
  const EARLY_CELLS_SHOWN = 0.5;
  /** Chance that a new creature gets one of its kind on a tile next to it, and that one another. */
  const GROUP_CHANCE = 0.35;
  /** Share of the map, in square patches of EMPTY_PATCH tiles, that shows no creature at all. */
  const EMPTY_SHARE = 0.2;
  const EMPTY_PATCH = 5;
  /** Tiles tried per missing marker before a round gives up; the next round goes on. */
  const PLACE_TRIES = 12;
  /** A class holding more than its target times this sheds the excess. */
  const EXCESS = 1.25;
  /** Chance per tick that a marker steps, or turns round where it stands. */
  const STEP_CHANCE = 0.15;
  const TURN_CHANCE = 0.03;
  /** With reduced motion: this share of the steps and turns, and no glide. */
  const STILL_FACTOR = 0.3;
  /** Wall-clock rest between two steps, so the fastest speed doesn't make them scurry. */
  const STEP_GAP_MS = 1500;
  const GLIDE_MS = 400;
  /**
   * CSS pixels squared per creature on a view where markers stand at their
   * full rate: zoomed out, only the markers ranked below a share are drawn.
   * Chosen by rank rather than by distance, so the scatter stays random, with
   * groups and gaps, instead of settling into an even lattice.
   */
  const SPACING_PX = 56;
  /** Least distance between two drawn creatures in tiles, so a group's members don't cover each other. */
  const OVERLAP_TILES = 0.75;
  /** Each creature stands off its tile's corner by up to half this, so they don't line up on the grid. */
  const JITTER = 0.8;
  /** Classes with at most this many markers go first when a crowded view is thinned. */
  const RARE_MARKERS = 12;

  export interface HerdMarker {
    readonly c: Life;
    tile: number;
    stage: number;
    /** Faces left. */
    flip: boolean;
    /** The last step in tiles, and when its glide began (ms). */
    dx: number;
    dy: number;
    since: number;
    /** Stable 0..1, for thinning a crowded view; a group shares about the same rank. */
    readonly rank: number;
    /** Offset from the tile's corner in tiles, set from its first tile and class. */
    readonly ox: number;
    readonly oy: number;
    /** Stands for its sub-species: kept while that lives, never thinned out, never changes stage. */
    pinned: boolean;
  }

  function isMicrobe(c: number): boolean {
    return c === Life.Prokaryote || c === Life.Eukaryote;
  }

  /** A city or a band's camp on tile `i` or one of its eight neighbours: creature icons keep a tile away, so towns and camps stay readable. */
  export function nearCity(world: WorldState, i: number): boolean {
    const x = i % GRID_W;
    const y = (i / GRID_W) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      if (y + dy < 0 || y + dy >= GRID_H) continue;
      for (let dx = -1; dx <= 1; dx++) if (world.tech[idx(wrapX(x + dx), y + dy)] !== Tech.None) return true;
    }
    for (const b of world.civ.bands) if (b.campAt >= 0 && tileDistance(b.path[b.step], i) < 1.5) return true;
    return false;
  }

  function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined' && !!window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  export class HerdLayer {
    readonly markers: HerdMarker[] = [];
    /** Marker index + 1 on each tile, 0 where none stands. */
    private readonly at = new Int32Array(TILE_COUNT);
    /** The class each tile shows, Life.None for none; picked by `select`. */
    private readonly slot = new Uint8Array(TILE_COUNT);
    /** Tiles each class lives on, filled by `select`, and how many of them show it. */
    private readonly lists: Int32Array[] = [];
    private readonly counts = new Int32Array(LIFE_COUNT);
    private readonly shows = new Int32Array(LIFE_COUNT);
    /** One tile's classes and their shares while `select` picks its slot. */
    private readonly here = new Int32Array(LIFE_COUNT);
    private readonly share = new Float64Array(LIFE_COUNT);
    private readonly have = new Int32Array(LIFE_COUNT);
    private readonly targets = new Int32Array(LIFE_COUNT);
    private readonly drop = new Int32Array(LIFE_COUNT);
    private readonly left = new Int32Array(LIFE_COUNT);
    private readonly rare = new Uint8Array(LIFE_COUNT);
    private readonly sea = new Uint8Array(LIFE_COUNT);
    private readonly weight = new Float64Array(LIFE_COUNT);
    private seed = -1;
    private tick = -1;
    private revision = -1;
    private edited = false;
    private selectedTick = -Infinity;
    private selectedAt = -Infinity;
    /** Visible markers of the frame being drawn: position in tiles, marker index. */
    private readonly xs = new Float32Array(TILE_COUNT);
    private readonly ys = new Float32Array(TILE_COUNT);
    private readonly ids = new Int32Array(TILE_COUNT);
    /** Per marker: where it stands (tiles, for the gap) and its turn when thinning. */
    private readonly gx = new Float32Array(TILE_COUNT);
    private readonly gy = new Float32Array(TILE_COUNT);
    private readonly order = new Float64Array(TILE_COUNT);
    /** Screen cells of the creatures drawn this frame (marker index + 1). */
    private gapGrid = new Int32Array(0);

    constructor(private readonly still = prefersReducedMotion()) {
      for (let c = 0; c < LIFE_COUNT; c++) {
        this.lists.push(new Int32Array(c === 0 ? 0 : TILE_COUNT));
        this.sea[c] = isSeaLife(c as Life) ? 1 : 0;
      }
    }

    /** Follow the world: drop markers whose class left, wander on new ticks, pick new ones. */
    update(world: WorldState, now: number, rand: () => number = Math.random): void {
      const fresh = world.seed !== this.seed || world.ticks < this.tick;
      if (fresh) {
        this.clear();
        this.seed = world.seed;
      }
      if (fresh || world.revision !== this.revision) {
        const ticked = !fresh && world.ticks !== this.tick;
        if (!fresh && !ticked) this.edited = true;
        this.revision = world.revision;
        this.tick = world.ticks;
        this.cull(world);
        if (ticked) this.step(world, now, rand);
      }
      if (fresh || world.ticks - this.selectedTick >= RESELECT_TICKS ||
        (this.edited && now - this.selectedAt >= EDIT_RESELECT_MS)) {
        this.select(world, rand);
        this.selectedTick = world.ticks;
        this.selectedAt = now;
        this.edited = false;
      }
    }

    /** The marker standing on tile i, if any. */
    markerOn(i: number): HerdMarker | null {
      const a = this.at[i];
      return a === 0 ? null : this.markers[a - 1];
    }

    /** One tick of wandering: some markers step to a neighbouring tile of their class, some turn round. */
    step(world: WorldState, now: number, rand: () => number = Math.random): void {
      const slow = this.still ? STILL_FACTOR : 1;
      const ms = this.markers;
      for (let k = 0; k < ms.length; k++) {
        const m = ms[k];
        const r = rand();
        if (r < STEP_CHANCE * slow) {
          if (now - m.since >= STEP_GAP_MS) this.tryStep(world, m, k + 1, now, rand);
        } else if (r < (STEP_CHANCE + TURN_CHANCE) * slow && now - m.since >= GLIDE_MS) {
          m.flip = !m.flip;
        }
      }
    }

    draw(
      ctx: CanvasRenderingContext2D, view: AmbientView, world: WorldState, now: number,
      tiles: TileCache, regions: BiomeRegions, skip?: (m: HerdMarker) => boolean,
    ): void {
      const size = view.tilePx;
      const big = size * SHADOW_SPAN;
      const cols = view.cols;
      const rows = view.rows;
      const { markers: ms, xs, ys, gx, gy, ids, order } = this;
      // Zoomed out, the markers ranked below `keep` stand for all; rare classes always show.
      const keep = Math.min(1, (size / SPACING_PX) ** 2 * TILES_PER_MARKER);
      let n = 0;
      for (let k = 0; k < ms.length; k++) {
        const m = ms[k];
        if (m.rank >= keep && !m.pinned && !this.rare[m.c]) continue;
        const rest = this.still ? 0 : 1 - smoothstep(clamp((now - m.since) / GLIDE_MS, 0, 1));
        let sx = (m.tile % GRID_W) + m.ox - view.scrollX;
        sx -= Math.floor(sx / GRID_W) * GRID_W;
        if (sx > GRID_W - SHADOW_SPAN) sx -= GRID_W;
        const sy = ((m.tile / GRID_W) | 0) + m.oy - view.scrollY;
        const rx = sx - m.dx * rest;
        const ry = sy - m.dy * rest;
        if (rx >= cols || ry <= -SHADOW_SPAN || ry >= rows || skip?.(m)) continue;
        xs[k] = rx;
        ys[k] = ry;
        gx[k] = sx;
        gy[k] = sy;
        order[k] = m.pinned ? m.rank - 2 : this.rare[m.c] ? m.rank - 1 : m.rank;
        ids[n++] = k;
      }
      // Rare classes first, then by rank, each a gap away from those already in. The gap
      // counts where a marker stands, not where it glides, so none pops in or out mid-step.
      const shown = ids.subarray(0, n).sort((a, b) => order[a] - order[b]);
      const gap = OVERLAP_TILES;
      const cell = gap / Math.SQRT2;
      const gw = Math.ceil(cols / cell) + 8;
      const gh = Math.ceil(rows / cell) + 8;
      if (this.gapGrid.length < gw * gh) this.gapGrid = new Int32Array(gw * gh);
      const grid = this.gapGrid;
      grid.fill(0, 0, gw * gh);
      for (let v = 0; v < shown.length; v++) {
        const k = shown[v];
        const cx = Math.floor(gx[k] / cell) + 4;
        const cy = Math.floor(gy[k] / cell) + 4;
        const m = ms[k];
        if (cx < 2 || cy < 2 || cx >= gw - 2 || cy >= gh - 2 || (!m.pinned && this.crowded(k, cx, cy, gw, gap))) continue;
        grid[cy * gw + cx] = k + 1;
        // Corals only in warm water: elsewhere the class shows its highest form that builds no reef.
        const stage = reefShownStage(world, m.tile, m.c, m.stage);
        const pic = tiles.life(m.c, stage, animalSpecialist(regions, world, m.tile, m.c, stage), m.flip);
        const py = Math.round(ys[k] * size);
        for (let x = xs[k]; x < cols; x += GRID_W) ctx.drawImage(pic, Math.round(x * size), py, big, big);
      }
    }

    /** A creature drawn this frame stands within `gap` tiles of marker k (grid cell cx, cy). */
    private crowded(k: number, cx: number, cy: number, gw: number, gap: number): boolean {
      const { gapGrid: grid, gx, gy } = this;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const o = grid[(cy + dy) * gw + cx + dx] - 1;
          if (o >= 0 && (gx[o] - gx[k]) ** 2 + (gy[o] - gy[k]) ** 2 < gap * gap) return true;
        }
      }
      return false;
    }

    private clear(): void {
      this.markers.length = 0;
      this.at.fill(0);
      this.tick = -1;
      this.revision = -1;
      this.edited = false;
      this.selectedTick = -Infinity;
      this.selectedAt = -Infinity;
    }

    private cull(world: WorldState): void {
      const ms = this.markers;
      for (let k = ms.length - 1; k >= 0; k--) {
        const m = ms[k];
        const at = m.tile * LIFE_COUNT + m.c;
        const gone = m.pinned
          ? world.lifeDensity[at] <= 0 || world.lifeStage[at] !== m.stage
          : world.lifeDensity[at] < HERD_KEEP_DENSITY || nearCity(world, m.tile);
        if (gone || world.isWater(m.tile) !== (this.sea[m.c] === 1)) {
          this.remove(k);
        } else {
          m.stage = world.lifeStage[at];
        }
      }
    }

    private remove(k: number): void {
      const ms = this.markers;
      this.at[ms[k].tile] = 0;
      const last = ms.pop() as HerdMarker;
      if (k < ms.length) {
        ms[k] = last;
        this.at[last.tile] = k + 1;
      }
    }

    private add(world: WorldState, c: Life, tile: number, rand: () => number, pinned = false, rank = rand()): void {
      this.markers.push({
        c, tile, stage: world.lifeStage[tile * LIFE_COUNT + c], flip: rand() < 0.5,
        dx: 0, dy: 0, since: -Infinity, rank, pinned,
        ox: (tileHash(tile, 500 + c) - 0.5) * JITTER, oy: (tileHash(tile, 600 + c) - 0.5) * JITTER,
      });
      this.at[tile] = this.markers.length;
    }

    /** Now and then the creature on tile j gets one of its kind on a tile beside it, and that one maybe another. */
    private group(world: WorldState, c: Life, j: number, target: number, rand: () => number): void {
      while (this.have[c] < target && rand() < GROUP_CHANCE) {
        const x = j % GRID_W;
        const y = (j / GRID_W) | 0;
        let pick = -1;
        let seen = 0;
        for (let dy = -1; dy <= 1; dy++) {
          if (y + dy < 0 || y + dy >= GRID_H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const k = idx(wrapX(x + dx), y + dy);
            if (this.fits(world, c, k) && rand() * ++seen < 1) pick = k;
          }
        }
        if (pick < 0) return;
        // About the same rank, so zooming out keeps or drops the group as one.
        this.add(world, c, pick, rand, false, this.markers[this.at[j] - 1].rank * (1 - rand() * 0.01));
        this.have[c]++;
        j = pick;
      }
    }

    private tryStep(world: WorldState, m: HerdMarker, self: number, now: number, rand: () => number): void {
      const x = m.tile % GRID_W;
      const y = (m.tile / GRID_W) | 0;
      let pick = -1;
      let pdx = 0;
      let pdy = 0;
      let seen = 0;
      for (let dy = -1; dy <= 1; dy++) {
        if (y + dy < 0 || y + dy >= GRID_H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const j = idx(wrapX(x + dx), y + dy);
          if (!this.fits(world, m.c, j)) continue;
          if (m.pinned && (world.lifeStage[j * LIFE_COUNT + m.c] !== m.stage || reefShownStage(world, j, m.c, m.stage) !== m.stage)) continue;
          seen++;
          if (rand() * seen < 1) {
            pick = j;
            pdx = dx;
            pdy = dy;
          }
        }
      }
      if (pick < 0) return;
      this.at[m.tile] = 0;
      this.at[pick] = self;
      m.tile = pick;
      m.dx = pdx;
      m.dy = pdy;
      m.since = now;
      m.stage = world.lifeStage[pick * LIFE_COUNT + m.c];
      if (pdx !== 0) m.flip = pdx < 0;
    }

    /** Does class `c` live on tile `j`, in its own realm and a tile away from the cities? */
    private suits(world: WorldState, c: Life, j: number): boolean {
      return world.lifeDensity[j * LIFE_COUNT + c] >= HERD_MIN_DENSITY &&
        world.isWater(j) === (this.sea[c] === 1) && !nearCity(world, j);
    }

    /** Can class `c` step or join onto tile `j`: it lives there, the tile shows it, and no creature stands on it. */
    private fits(world: WorldState, c: Life, j: number): boolean {
      return this.slot[j] === c && this.at[j] === 0 && this.suits(world, c, j);
    }

    /** No marker stands on or next to tile (x, y). */
    private free(x: number, y: number): boolean {
      for (let dy = -1; dy <= 1; dy++) {
        if (y + dy < 0 || y + dy >= GRID_H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (this.at[idx(wrapX(x + dx), y + dy)] !== 0) return false;
        }
      }
      return true;
    }

    /**
     * The class tile i shows, Life.None for none: a stable pick among the
     * classes living there by their `weight`, each with at least MIN_SHARE of
     * the picks; the first cells keep only EARLY_CELLS_SHOWN of theirs (the
     * rest stay empty), then no class takes more than MAX_SHARE of what shows.
     * Nothing shows in an empty patch.
     */
    private pick(world: WorldState, i: number): Life {
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      if (tileHash(((y / EMPTY_PATCH) | 0) * GRID_W + ((x / EMPTY_PATCH) | 0), 702) < EMPTY_SHARE) return Life.None;
      const { here, share, weight } = this;
      const sea = world.isWater(i) ? 1 : 0;
      const base = i * LIFE_COUNT;
      let n = 0;
      let sum = 0;
      for (let c = 1; c < LIFE_COUNT; c++) {
        if (this.sea[c] !== sea || world.lifeDensity[base + c] < HERD_MIN_DENSITY) continue;
        here[n] = c;
        share[n++] = weight[c];
        sum += weight[c];
      }
      if (n === 0) return Life.None;
      // ponytail: four clamp passes only come close to the bounds (≈ 0.46 for 0.45), fine for a picture.
      const lo = Math.min(MIN_SHARE, 1 / n);
      for (let pass = 0; pass < 4; pass++) {
        let next = 0;
        for (let k = 0; k < n; k++) next += share[k] = Math.max(share[k] / sum, lo);
        sum = next;
      }
      for (let k = 0; k < n; k++) share[k] = (share[k] / sum) * (isMicrobe(here[k]) ? EARLY_CELLS_SHOWN : 1);
      const hi = Math.max(MAX_SHARE, 1 / n);
      for (let pass = 0; pass < 4; pass++) {
        let shown = 0;
        for (let k = 0; k < n; k++) shown += share[k];
        for (let k = 0; k < n; k++) share[k] = Math.min(share[k], hi * shown);
      }
      let h = tileHash(i, 700);
      for (let k = 0; k < n; k++) {
        h -= share[k];
        if (h < 0) return here[k] as Life;
      }
      return Life.None;
    }

    /** Re-pick: survey where each class lives, choose what each tile shows, shed the over-represented, place the missing. */
    private select(world: WorldState, rand: () => number): void {
      const { lists, counts, shows, have, targets, weight, drop, left, markers: ms } = this;
      counts.fill(0);
      for (let i = 0; i < TILE_COUNT; i++) {
        const sea = world.isWater(i) ? 1 : 0;
        const base = i * LIFE_COUNT;
        for (let c = 1; c < LIFE_COUNT; c++) {
          if (this.sea[c] === sea && world.lifeDensity[base + c] >= HERD_MIN_DENSITY) lists[c][counts[c]++] = i;
        }
      }

      // A tile's pick favours rare classes (tiles^(SHARE_EXPONENT - 1)) and predators.
      for (let c = 1; c < LIFE_COUNT; c++) {
        const prey = LIFE[c as Life].diet.prey;
        weight[c] = counts[c] === 0 ? 0 : Math.pow(counts[c], SHARE_EXPONENT - 1) *
          (prey && prey.length > 0 ? PREDATOR_WEIGHT : 1);
      }
      shows.fill(0);
      for (let i = 0; i < TILE_COUNT; i++) shows[this.slot[i] = this.pick(world, i)]++;
      for (let c = 1; c < LIFE_COUNT; c++) {
        targets[c] = Math.round(shows[c] / TILES_PER_MARKER);
        if (counts[c] >= QUOTA_MIN_TILES) targets[c] = Math.max(targets[c], QUOTA_MARKERS);
      }

      // Shed any excess by selection sampling, so each class loses a uniform random subset.
      have.fill(0);
      for (const m of ms) have[m.c]++;
      for (let c = 1; c < LIFE_COUNT; c++) drop[c] = have[c] > Math.ceil(targets[c] * EXCESS) ? have[c] - targets[c] : 0;
      left.set(have);
      for (let k = ms.length - 1; k >= 0; k--) {
        const m = ms[k];
        const c = m.c;
        if (!m.pinned && drop[c] > 0 && rand() * left[c] < drop[c]) {
          drop[c]--;
          have[c]--;
          this.remove(k);
        }
        left[c]--;
      }

      // Rarest first, so the common classes fill whatever room is left.
      const order: number[] = [];
      for (let c = 1; c < LIFE_COUNT; c++) if (counts[c] > 0) order.push(c);
      order.sort((a, b) => counts[a] - counts[b]);
      for (const c of order) {
        if (have[c] < targets[c]) this.place(world, c as Life, targets[c], true, rand);
        // The promised few go in even where the tile shows another class, pushing a common class's marker aside.
        if (have[c] < QUOTA_MARKERS && counts[c] >= QUOTA_MIN_TILES) this.place(world, c as Life, QUOTA_MARKERS, false, rand);
      }
      // Every living sub-species keeps one creature of its own on the map.
      for (let c = 1; c < LIFE_COUNT; c++) {
        for (let s = 0; s < SUBSPECIES_PER_CLASS; s++) {
          if (world.lifeStageCounts[c * SUBSPECIES_PER_CLASS + s] > 0) this.pin(world, c as Life, s, rand);
        }
      }
      for (let c = 1; c < LIFE_COUNT; c++) this.rare[c] = have[c] <= RARE_MARKERS ? 1 : 0;
    }

    /**
     * The creature standing for sub-species (c, stage): an existing one, or a
     * new one on its densest tile, preferring tiles away from cities and other
     * creatures. Returns its tile, -1 if the sub-species doesn't live.
     */
    pin(world: WorldState, c: Life, stage: number, rand: () => number = Math.random): number {
      const ms = this.markers;
      // Only where it shows as itself: a coral in cold water shows another form (reefShownStage).
      const shows = (m: HerdMarker): boolean => reefShownStage(world, m.tile, c, stage) === stage;
      for (const m of ms) if (m.c === c && m.stage === stage && m.pinned && !shows(m)) m.pinned = false;
      const own = ms.find((m) => m.c === c && m.stage === stage && m.pinned) ?? ms.find((m) => m.c === c && m.stage === stage && shows(m));
      if (own) {
        own.pinned = true;
        return own.tile;
      }
      let best = -1;
      let bestScore = 0;
      for (let i = 0; i < TILE_COUNT; i++) {
        const li = i * LIFE_COUNT + c;
        const d = world.lifeDensity[li];
        if (d <= 0 || world.lifeStage[li] !== stage || world.isWater(i) !== (this.sea[c] === 1)) continue;
        const a = this.at[i];
        if (a !== 0 && ms[a - 1].pinned) continue;
        const far = !nearCity(world, i);
        // A tile where it shows as itself first; a coral only in cold water still gets its creature.
        const shows = reefShownStage(world, i, c, stage) === stage ? 8 : 0;
        const score = d + shows + (far ? 2 : 0) + (far && this.free(i % GRID_W, (i / GRID_W) | 0) ? 2 : 0);
        if (score > bestScore) {
          best = i;
          bestScore = score;
        }
      }
      if (best < 0) return -1;
      if (this.at[best] !== 0) this.remove(this.at[best] - 1);
      this.add(world, c, best, rand, true);
      return best;
    }

    /**
     * Add markers of class `c` on random tiles it lives on until it has `target`.
     * `polite` keeps to tiles that show `c` with no creature on or next to
     * them, now and then followed by a group; otherwise markers of classes
     * with more than their quota make room.
     */
    private place(world: WorldState, c: Life, target: number, polite: boolean, rand: () => number): void {
      const list = this.lists[c];
      const end = this.counts[c];
      const have = this.have;
      const tries = polite ? Math.min(end, (target - have[c]) * PLACE_TRIES + 64) : end;
      for (let p = 0; p < tries && have[c] < target; p++) {
        const q = p + Math.floor(rand() * (end - p));
        const j = list[q];
        list[q] = list[p];
        list[p] = j;
        if (polite ? !this.fits(world, c, j) || !this.free(j % GRID_W, (j / GRID_W) | 0) : !this.suits(world, c, j) || !this.makeRoom(j)) continue;
        this.add(world, c, j, rand);
        have[c]++;
        if (polite) this.group(world, c, j, target, rand);
      }
    }

    /** Remove the markers on and around tile j, if all belong to classes with markers to spare. */
    private makeRoom(j: number): boolean {
      const x = j % GRID_W;
      const y = (j / GRID_W) | 0;
      for (let pass = 0; pass < 2; pass++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (y + dy < 0 || y + dy >= GRID_H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const a = this.at[idx(wrapX(x + dx), y + dy)];
            if (a === 0) continue;
            const c = this.markers[a - 1].c;
            if (pass === 0 && (this.markers[a - 1].pinned || this.have[c] <= QUOTA_MARKERS + 1)) return false;
            if (pass === 1) {
              this.have[c]--;
              this.remove(a - 1);
            }
          }
        }
      }
      return true;
    }
  }
}
