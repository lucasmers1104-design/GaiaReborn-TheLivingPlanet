/* =============================================================================
 * SimEarth 2.0 — tectonics: what raises the crust
 * -----------------------------------------------------------------------------
 * `raiseCrust` is the one write path for vertical crust motion: mountain
 * belts, hotspots, eruptions, craters and quakes all go through it.
 * `UpliftSource` is where a plate model docks on. The plate bands of
 * `GeoSystem.drift` only slide past each other (transform margins) and build
 * nothing, so today the sources are the belts the generator laid down
 * (`world.uplift`) and mantle-fixed hotspots (docs/hoehe-spec.md §1.2, §3.2).
 * ========================================================================== */

namespace SE {
  /** Mountain type of a tile's crust (`world.upliftKind`). Saved: append only. */
  export const enum UpliftKind {
    None = 0,
    /** Fold belt of a continental collision: high, broad, no volcanoes. */
    Fold = 1,
    /** Coastal range over a subducting ocean plate, with a volcanic chain. */
    Arc = 2,
    /** Arc of volcanic islands where one ocean plate dives under another. */
    IslandArc = 3,
    /** Track of a mantle-fixed hotspot the plate has moved over. */
    Hotspot = 4,
    /** A volcano that never rests: always a cone, lava in its crater, a thin plume (Kīlauea, Etna). */
    ActiveVolcano = 5,
  }
  export const UPLIFT_KIND_COUNT = 6;

  /** What raises the crust each tick: generator belts and hotspots today, a plate model later. */
  export interface UpliftSource {
    /**
     * Apply uplift through `raiseCrust`. `timeF` is how many calibrated
     * geological ticks this call stands for: `geoTimeFactor(world)` times the
     * ticks since the last call, times the Kernwärme slider (1 = calibrated).
     */
    apply(world: WorldState, timeF: number): void;
  }

  /**
   * Share of a calibrated geologic tick that one tick of the current time
   * scale represents. The vertical rates were tuned per Phanerozoic tick; in
   * human time scales the relief stands still instead of eroding as fast
   * per tick as in the Devonian.
   */
  export function geoTimeFactor(world: WorldState): number {
    return Math.min(1, world.yearsPerTick / GEO_REFERENCE_YEARS);
  }

  /** True for the mountain types that carry volcanoes. */
  export function isVolcanicKind(kind: number): boolean {
    return kind === UpliftKind.Arc || kind === UpliftKind.IslandArc || kind === UpliftKind.Hotspot || kind === UpliftKind.ActiveVolcano;
  }

  /**
   * Raise (with a negative amount: lower) one tile's crust. Clamps to the
   * elevation range and marks the river network stale. Raising with a kind
   * other than None records that kind on the tile, unless it is an active
   * volcano; lowering never clears it.
   */
  export function raiseCrust(world: WorldState, i: number, amount: number, kind: UpliftKind): void {
    if (amount === 0) return;
    world.elevation[i] = clamp(world.elevation[i] + amount, -1, 1);
    if (amount > 0 && kind !== UpliftKind.None && world.upliftKind[i] !== UpliftKind.ActiveVolcano) world.upliftKind[i] = kind;
    world.terrainDirty = true;
  }

  /**
   * Uplift of an active belt tile that needs none to hold its shape: above
   * zero, and above the 16-bit resolution of the save, but too small to
   * raise it measurably (0.4 % of a belt's height in 12,000 ticks).
   */
  export const UPLIFT_TRACE = 1e-4;

  /** A belt within this many tiles of the sea is a coastal range over a subduction zone. */
  export const ARC_SHORE = 8;

  /**
   * Mountain type of every tile from the belts a planet (or a save from
   * before format 8) carries: belts near the coast are coastal ranges with
   * volcanoes, belts inland fold belts.
   */
  export function classifyBelts(world: WorldState): void {
    const { uplift, upliftKind } = world;
    const shore = TerrainGenerator.distanceToWater(world.elevation);
    upliftKind.fill(UpliftKind.None);
    for (let i = 0; i < TILE_COUNT; i++) {
      if (uplift[i] <= 0) continue;
      upliftKind[i] = shore[i] <= ARC_SHORE ? UpliftKind.Arc : UpliftKind.Fold;
    }
  }

  /**
   * Type the mountain belts of a freshly shaped crust: the generator's typed
   * belts (fossil fold belts included), the young Earth's island arcs, and on
   * a random planet its own island arcs and the trenches in front of its
   * coastal ranges. Today's Earth is typed from its belts by shore distance.
   * Then every active belt gets the uplift that holds it in balance.
   */
  export function shapeBelts(world: WorldState, epoch: EpochId): void {
    const kinds = TerrainGenerator.takeBeltKinds();
    if (epoch === 'today' || !kinds) {
      classifyBelts(world);
      if (epoch === 'today') markActiveVolcanoes(world);
    } else {
      world.upliftKind.set(kinds);
      if (epoch === 'youngEarth') {
        typeYoungArcs(world);
      } else {
        deepenTrenches(world);
        raiseIslandArcs(world);
      }
    }
    balanceUplift(world);
  }

  /**
   * Set each active belt tile's uplift to what erosion takes from it, so a
   * fresh range is in balance and keeps its shape: its crest stays sharp
   * instead of slumping onto its flanks over the first ages. Tiles that gain
   * more from the slope above than they lose (the foot of a range) need no
   * uplift, but keep a trace of it: they belong to an active belt, and only
   * a belt without any uplift is fossil.
   */
  export function balanceUplift(world: WorldState): void {
    const { elevation, uplift } = world;
    const wet = new Float32Array(TILE_COUNT).fill(UPLIFT_BALANCE_MOISTURE);
    const change = new Erosion().slopeChange(elevation, wet, world.upliftKind);
    for (let i = 0; i < TILE_COUNT; i++) {
      if (uplift[i] <= 0 || elevation[i] < 0) continue;
      uplift[i] = clamp(-change[i] / UPLIFT_RATE_BASE, UPLIFT_TRACE, 1);
    }
  }

  /**
   * The belts the generator laid down (`world.uplift`), pushed up against
   * erosion. The push follows the rain as erosion does, as a crust unloaded
   * by erosion rebounds: `uplift` is balanced at UPLIFT_BALANCE_MOISTURE, and
   * without this a dry flank would keep rising and a wet one sinking.
   */
  export class BeltUplift implements UpliftSource {
    apply(world: WorldState, timeF: number): void {
      const { elevation, uplift, upliftKind, moisture } = world;
      const rate = (UPLIFT_RATE_BASE * timeF) / erosionWetness(UPLIFT_BALANCE_MOISTURE);
      for (let i = 0; i < TILE_COUNT; i++) {
        const u = uplift[i];
        if (u <= 0 || elevation[i] < 0) continue;
        raiseCrust(world, i, u * rate * erosionWetness(moisture[i]), upliftKind[i] === UpliftKind.None ? UpliftKind.Fold : upliftKind[i]);
      }
    }
  }

  /** A mantle plume under a fixed grid tile; `cap` is the height its volcano grows to. */
  export interface Hotspot {
    readonly x: number;
    readonly y: number;
    readonly cap: number;
  }

  const HOTSPOTS_MIN = 3;
  const HOTSPOTS_MAX = 6;
  /** Hotspots keep to these latitudes and this far (tiles) apart. */
  const HOTSPOT_MAX_LAT = 55;
  const HOTSPOT_SPACING = 24;
  /** Height range of a hotspot volcano: about 1.5 to 2.5 km. */
  const HOTSPOT_CAP_MIN = 0.33;
  const HOTSPOT_CAP_MAX = 0.55;
  /** The four tiles around the plume: their share of its cap and of its growth. */
  const HOTSPOT_FLANK_CAP = 0.55;
  const HOTSPOT_FLANK_RATE = 0.4;

  /** 0..1 from two integers; the same pair always gives the same value. */
  function pulseHash(a: number, b: number): number {
    let h = Math.imul(a ^ 0x2545f491, 0x85ebca6b) ^ b;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h = Math.imul(h ^ (h >>> 16), 0x27d4eb2f);
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  }

  /**
   * The hotspots of a planet, from its seed alone: they sit in the mantle, so
   * they are neither saved nor moved by the drift. With most of a planet
   * under the sea, about half of them lie there too.
   */
  export function hotspotsOf(seed: number): Hotspot[] {
    const rng = new Rng((seed ^ 0x1b873593) >>> 0);
    const count = HOTSPOTS_MIN + rng.int(HOTSPOTS_MAX - HOTSPOTS_MIN + 1);
    const out: Hotspot[] = [];
    for (let tries = 0; out.length < count && tries < 200; tries++) {
      const lat = rng.range(-HOTSPOT_MAX_LAT, HOTSPOT_MAX_LAT);
      const x = rng.int(GRID_W);
      const y = clampY(Math.floor(((90 - lat) / 180) * GRID_H));
      const cap = rng.range(HOTSPOT_CAP_MIN, HOTSPOT_CAP_MAX);
      const near = out.some((h) => {
        const dx = Math.abs(h.x - x);
        return Math.hypot(Math.min(dx, GRID_W - dx), h.y - y) < HOTSPOT_SPACING;
      });
      if (!near) out.push({ x, y, cap });
    }
    return out;
  }

  /**
   * Mantle plumes that build a volcano on whatever crust lies over them. They
   * pulse, active in some windows of HOTSPOT_PULSE_TICKS and quiet in others,
   * so as the plate drifts on, the volcanoes it carries away form a chain of
   * islands with gaps rather than one ridge.
   */
  export class Hotspots implements UpliftSource {
    private seed = -1;
    private list: Hotspot[] = [];

    apply(world: WorldState, timeF: number): void {
      if (world.seed !== this.seed) {
        this.seed = world.seed;
        this.list = hotspotsOf(world.seed);
      }
      const window = Math.floor(world.ticks / HOTSPOT_PULSE_TICKS);
      const rate = HOTSPOT_RATE * timeF;
      for (let k = 0; k < this.list.length; k++) {
        if (pulseHash(world.seed, k * 7919 + window) >= HOTSPOT_ACTIVE_SHARE) continue;
        const { x, y, cap } = this.list[k];
        Hotspots.build(world, idx(x, y), cap, rate);
        const flankCap = cap * HOTSPOT_FLANK_CAP;
        const flankRate = rate * HOTSPOT_FLANK_RATE;
        Hotspots.build(world, idx(wrapX(x - 1), y), flankCap, flankRate);
        Hotspots.build(world, idx(wrapX(x + 1), y), flankCap, flankRate);
        if (y > 0) Hotspots.build(world, idx(x, y - 1), flankCap, flankRate);
        if (y < GRID_H - 1) Hotspots.build(world, idx(x, y + 1), flankCap, flankRate);
      }
    }

    private static build(world: WorldState, i: number, cap: number, rate: number): void {
      const room = cap - world.elevation[i];
      if (room <= 0) return;
      raiseCrust(world, i, Math.min(room, rate * Math.min(1, room / HOTSPOT_RAMP)), UpliftKind.Hotspot);
    }
  }
}
