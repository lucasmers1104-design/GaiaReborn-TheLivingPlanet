/* =============================================================================
 * SimEarth 2.0 — rivers
 * -----------------------------------------------------------------------------
 * Rivers are not painted on; they are the drainage of the terrain that is
 * already there. Every land tile is given a downhill neighbour, rainfall is
 * routed along those links, and wherever enough of it collects the tile carries
 * a river. That is what makes a river network *look* right: it branches upward
 * into the mountains, never runs uphill, never stops halfway, and rearranges
 * itself when the crust moves.
 *
 * The whole network is derived from `elevation` and `moisture`, so nothing here
 * is saved — it is rebuilt on load, and whenever the geosphere reports that the
 * ground has changed under it.
 * ========================================================================== */

namespace SE {
  /**
   * Discharge, in units of one average land tile's runoff, at which a channel
   * becomes a river.
   *
   * Measured over three planets at 256x128: 60 puts 3.2-3.7% of land under
   * river and 8-10% inside a green corridor, with 29-47 separate rivers
   * reaching the sea. Lower it and every gully is a river; raise it and only
   * the trunk streams survive.
   */
  export const RIVER_THRESHOLD = 60;

  /**
   * Share of the local moisture capacity a river holds over its own channel,
   * from the smallest tributary to a trunk river.
   *
   * The floor is what matters and it is deliberately high. A stream is a stream
   * whatever its discharge — a gallery of trees follows the smallest desert
   * creek — so the *presence* of water is most of the effect and its volume
   * only the rest. Scaled straight off discharge instead, the thin ends of the
   * network sat below the threshold where grass will grow and the map showed
   * rivers running through bare sand, which is precisely wrong.
   */
  const CHANNEL_WETNESS_MIN = 0.55;
  const CHANNEL_WETNESS_MAX = 0.95;
  /**
   * What the tiles either side of the channel get, as a share of the channel.
   * This is the green band in a desert: wide enough to read on the map, and
   * short of the channel itself so a valley still has a shape.
   */
  const BANK_SHARE = 0.72;

  /**
   * A minimum-key binary heap over (float key, tile) pairs, sized once for the
   * whole grid. `RiverSystem` pushes every tile exactly once, so it can never
   * overflow and needs no growth path.
   */
  class TileHeap {
    private readonly keys = new Float32Array(TILE_COUNT);
    private readonly tiles = new Int32Array(TILE_COUNT);
    size = 0;

    clear(): void {
      this.size = 0;
    }

    push(key: number, tile: number): void {
      let i = this.size++;
      this.keys[i] = key;
      this.tiles[i] = tile;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (this.keys[parent] <= this.keys[i]) break;
        this.swap(parent, i);
        i = parent;
      }
    }

    /** Smallest key in the heap. Only valid while `size > 0`. */
    peekKey(): number {
      return this.keys[0];
    }

    pop(): number {
      const top = this.tiles[0];
      this.size--;
      if (this.size > 0) {
        this.keys[0] = this.keys[this.size];
        this.tiles[0] = this.tiles[this.size];
        let i = 0;
        for (;;) {
          const left = 2 * i + 1;
          const right = left + 1;
          let smallest = i;
          if (left < this.size && this.keys[left] < this.keys[smallest]) smallest = left;
          if (right < this.size && this.keys[right] < this.keys[smallest]) smallest = right;
          if (smallest === i) break;
          this.swap(smallest, i);
          i = smallest;
        }
      }
      return top;
    }

    private swap(a: number, b: number): void {
      const k = this.keys[a]; this.keys[a] = this.keys[b]; this.keys[b] = k;
      const t = this.tiles[a]; this.tiles[a] = this.tiles[b]; this.tiles[b] = t;
    }
  }

  /* -------------------------------------------------------------------------- */

  export class RiverSystem {
    /**
     * How often the network may be rebuilt, in ticks. Drift and erosion nudge
     * the crust every tick and a rebuild costs about fifteen milliseconds, so
     * the network is allowed to lag the terrain slightly. Player edits and
     * disasters bypass this and rebuild at once — those are the changes anyone
     * is actually watching for.
     */
    static readonly REBUILD_INTERVAL = 32;

    /**
     * Elevation with every closed basin raised to its outlet, so that from any
     * land tile there is a path to the sea that never climbs.
     */
    private static readonly filled = new Float32Array(TILE_COUNT);
    /** Tiles in ascending filled elevation — the order the flood popped them. */
    private static readonly order = new Int32Array(TILE_COUNT);
    /**
     * How much of `order` the last flood actually filled. Short of TILE_COUNT
     * only on a world with no sea to drain into, where the tail would otherwise
     * still hold tile indices from the previous rebuild.
     */
    private static orderCount = 0;
    /** Tiles the flood under way has taken so far, and floods started (a stale split rebuild sees the count move). */
    private static fillCount = 0;
    private static fills = 0;
    private static readonly settled = new Uint8Array(TILE_COUNT);
    private static readonly heap = new TileHeap();

    /**
     * Smallest step by which a filled basin must exceed its outlet. Large
     * enough to survive Float32 rounding at elevations near 1, small enough
     * that filling a wide basin does not visibly raise the ground.
     */
    private static readonly EPSILON = 1e-5;

    /** Plate shifts each world had seen at its last rebuild. */
    private static readonly builtShifts = new WeakMap<WorldState, number>();

    /**
     * Rebuild the network if the terrain has moved since the last one: every
     * REBUILD_INTERVAL ticks for erosion and uplift, at once after a plate
     * shift — the network does not ride the plates, and until it is rebuilt
     * the shifted rows drain into tiles that are no longer next to them.
     */
    static maybeRebuild(world: WorldState): void {
      if (!world.terrainDirty) return;
      const shifted = RiverSystem.builtShifts.get(world) !== world.driftShifts;
      if (!shifted && world.ticks % RiverSystem.REBUILD_INTERVAL !== 0) return;
      RiverSystem.rebuild(world);
    }

    static rebuild(world: WorldState): void {
      RiverSystem.fillDepressions(world);
      RiverSystem.route(world);
      RiverSystem.classify(world);
      world.terrainDirty = false;
      RiverSystem.builtShifts.set(world, world.driftShifts);
    }

    /**
     * `rebuild` in steps for callers that spread it over frames (the
     * terraforming brush's settle): the flood in halves, the routing, the
     * classification. The scratch is shared: if anything rebuilds in
     * between (a tick), that full rebuild stands and the rest is skipped.
     */
    static rebuildSteps(world: WorldState): (() => void)[] {
      let fill = -1;
      const live = (): boolean => fill === RiverSystem.fills;
      return [
        () => {
          RiverSystem.fillStart(world);
          fill = RiverSystem.fills;
          RiverSystem.fillOn(world, TILE_COUNT / 4);
        },
        () => { if (live()) RiverSystem.fillOn(world, TILE_COUNT / 3); },
        () => { if (live()) RiverSystem.fillOn(world, Infinity); },
        () => { if (live()) RiverSystem.route(world); },
        () => {
          if (!live()) return;
          RiverSystem.classify(world);
          world.terrainDirty = false;
          RiverSystem.builtShifts.set(world, world.driftShifts);
        },
      ];
    }

    /**
     * Priority-flood (Barnes, Lehman & Mulla): start from the sea and walk
     * inland always taking the lowest frontier tile, raising anything below the
     * level you arrived at. A tile is therefore fixed at the height of the
     * lowest pass leading to it, which is exactly the water level a lake in
     * that basin would reach.
     *
     * Without this, streams stop in every local dip the noise happens to leave
     * and the map fills with rivers that go nowhere. With it, every land tile
     * provably drains to the sea.
     */
    private static fillDepressions(world: WorldState): void {
      RiverSystem.fillStart(world);
      RiverSystem.fillOn(world, Infinity);
    }

    /** Seed the flood with the sea. */
    private static fillStart(world: WorldState): void {
      const { elevation } = world;
      const filled = RiverSystem.filled;
      const settled = RiverSystem.settled;
      const heap = RiverSystem.heap;
      RiverSystem.fills++;

      heap.clear();
      settled.fill(0);

      for (let i = 0; i < TILE_COUNT; i++) {
        filled[i] = elevation[i];
        if (elevation[i] < 0) {
          settled[i] = 1;
          heap.push(0, i); // the sea is the outlet, at sea level
        }
      }
      RiverSystem.fillCount = 0;
    }

    /** Flood on for at most `budget` tiles; true once the flood is done. */
    private static fillOn(world: WorldState, budget: number): boolean {
      const { elevation } = world;
      const filled = RiverSystem.filled;
      const settled = RiverSystem.settled;
      const heap = RiverSystem.heap;
      const order = RiverSystem.order;
      let n = RiverSystem.fillCount;

      while (heap.size > 0 && budget-- > 0) {
        const level = heap.peekKey();
        const i = heap.pop();
        order[n++] = i;

        const x = i % GRID_W;
        const y = (i / GRID_W) | 0;
        RiverSystem.raise(idx(wrapX(x - 1), y), level, elevation, filled, settled, heap);
        RiverSystem.raise(idx(wrapX(x + 1), y), level, elevation, filled, settled, heap);
        RiverSystem.raise(idx(x, clampY(y - 1)), level, elevation, filled, settled, heap);
        RiverSystem.raise(idx(x, clampY(y + 1)), level, elevation, filled, settled, heap);
      }

      RiverSystem.fillCount = n;
      if (heap.size > 0) return false;
      RiverSystem.orderCount = n;

      // A land tile the flood could not reach has no sea to drain to at all —
      // an entirely landlocked world. Park it above everything so `route`
      // leaves it alone rather than reading a stale height.
      for (let i = 0; i < TILE_COUNT; i++) {
        if (!settled[i]) filled[i] = 1;
      }
      return true;
    }

    private static raise(
      j: number, level: number,
      elevation: Float32Array, filled: Float32Array,
      settled: Uint8Array, heap: TileHeap,
    ): void {
      if (settled[j]) return;
      settled[j] = 1;
      filled[j] = Math.max(elevation[j], level + RiverSystem.EPSILON);
      heap.push(filled[j], j);
    }

    /**
     * Point every land tile at its lowest neighbour and push each tile's runoff
     * down the chain.
     *
     * The flood popped tiles in ascending filled elevation, so walking that
     * record backwards visits every tile after all of its own tributaries —
     * which is what makes a single pass enough, and saves sorting thirteen
     * thousand tiles on every rebuild.
     *
     * Runoff is each tile's own moisture, divided by the planet's mean. That
     * normalisation is what lets one threshold work on a wet world and a dry
     * one alike — and it is why a river born in wet mountains still runs full
     * where it crosses a desert that contributes nothing to it.
     */
    private static route(world: WorldState): void {
      const { elevation, moisture, riverFlow, riverDown } = world;
      const filled = RiverSystem.filled;
      const order = RiverSystem.order;

      let landCount = 0;
      let moistureSum = 0;
      for (let i = 0; i < TILE_COUNT; i++) {
        if (elevation[i] < 0) continue;
        landCount++;
        moistureSum += moisture[i];
      }
      const meanMoisture = landCount > 0 ? Math.max(0.02, moistureSum / landCount) : 1;

      riverFlow.fill(0);
      riverDown.fill(-1);

      for (let n = RiverSystem.orderCount - 1; n >= 0; n--) {
        const i = order[n];
        if (elevation[i] < 0) continue;

        const x = i % GRID_W;
        const y = (i / GRID_W) | 0;
        let best = -1;
        let bestHeight = filled[i];

        const n0 = idx(wrapX(x - 1), y);
        const n1 = idx(wrapX(x + 1), y);
        const n2 = idx(x, clampY(y - 1));
        const n3 = idx(x, clampY(y + 1));
        if (n0 !== i && filled[n0] < bestHeight) { bestHeight = filled[n0]; best = n0; }
        if (n1 !== i && filled[n1] < bestHeight) { bestHeight = filled[n1]; best = n1; }
        if (n2 !== i && filled[n2] < bestHeight) { bestHeight = filled[n2]; best = n2; }
        if (n3 !== i && filled[n3] < bestHeight) { bestHeight = filled[n3]; best = n3; }

        riverDown[i] = best;
        // A bone-dry tile still passes on whatever reached it from upstream;
        // the floor only stops a desert from contributing exactly nothing.
        riverFlow[i] += Math.max(0.05, moisture[i]) / meanMoisture;
        if (best >= 0 && elevation[best] >= 0) riverFlow[best] += riverFlow[i];
      }
    }

    /** Turn discharge into a drawable river and the moisture floor it holds. */
    private static classify(world: WorldState): void {
      const { elevation, riverFlow, riverLevel, riparian, landscape, landscapeNext, temperature } = world;

      riverLevel.fill(0);
      for (let i = 0; i < TILE_COUNT; i++) {
        if (elevation[i] < 0 || riverFlow[i] < RIVER_THRESHOLD) continue;
        // Frozen under ice or snow: the water still drains through (meltwater
        // leaves at the ice edge), but no channel shows until the tile thaws.
        // Before succession has laid a landscape down, the climate decides.
        const ls = landscape[i];
        if (landscapeNext[i] !== LANDSCAPE_UNSET
          ? ls === Landscape.Ice || ls === Landscape.Snow
          : temperature[i] < FROZEN_TEMP) continue;
        // Logarithmic: a river carrying ten times the water is not ten times
        // the river, and without the compression the trunk would saturate
        // while every tributary sat at the minimum.
        riverLevel[i] = clamp(
          Math.log2(riverFlow[i] / RIVER_THRESHOLD + 1) / 3, 0.25, 1,
        );
      }

      riparian.fill(0);
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          const i = idx(x, y);
          if (elevation[i] < 0) continue;

          let wet = RiverSystem.channelWetness(riverLevel[i]);

          const n0 = riverLevel[idx(wrapX(x - 1), y)];
          const n1 = riverLevel[idx(wrapX(x + 1), y)];
          const n2 = riverLevel[idx(x, clampY(y - 1))];
          const n3 = riverLevel[idx(x, clampY(y + 1))];
          const neighbour = Math.max(Math.max(n0, n1), Math.max(n2, n3));
          const bank = RiverSystem.channelWetness(neighbour) * BANK_SHARE;
          if (bank > wet) wet = bank;

          riparian[i] = wet;
        }
      }
    }

    /** Moisture a channel of this size holds, or 0 where there is no river. */
    private static channelWetness(level: number): number {
      if (level <= 0) return 0;
      return CHANNEL_WETNESS_MIN + (CHANNEL_WETNESS_MAX - CHANNEL_WETNESS_MIN) * level;
    }

    /* ---------------------------------------------------------------- query -- */

    /**
     * Which of the four neighbours this river connects to, as a bitmask
     * W=1 E=2 N=4 S=8. The Edit window picks its tile graphic from this, so a
     * river reads as one continuous line rather than a row of blobs.
     *
     * A neighbour counts when the water actually flows between the two — this
     * tile drains into it or it drains into this one — and when this tile
     * drains into open water, so a river visibly meets the sea instead of
     * stopping one tile short of the coast. Two rivers that merely run side by
     * side stay apart.
     */
    static connectionMask(world: WorldState, x: number, y: number): number {
      const i = idx(x, y);
      const w = idx(wrapX(x - 1), y);
      const e = idx(wrapX(x + 1), y);
      const n = idx(x, clampY(y - 1));
      const s = idx(x, clampY(y + 1));

      let mask = 0;
      if (RiverSystem.connects(world, i, w)) mask |= 1;
      if (RiverSystem.connects(world, i, e)) mask |= 2;
      if (n !== i && RiverSystem.connects(world, i, n)) mask |= 4;
      if (s !== i && RiverSystem.connects(world, i, s)) mask |= 8;
      return mask;
    }

    private static connects(world: WorldState, i: number, j: number): boolean {
      if (world.riverLevel[j] > 0) return world.riverDown[i] === j || world.riverDown[j] === i;
      return world.riverDown[i] === j && world.elevation[j] < 0;
    }

    /** Discharge in cubic metres per second, as the Examine window reports it. */
    static discharge(world: WorldState, i: number): number {
      return Math.round(world.riverFlow[i] * 45);
    }
  }
}
