/* =============================================================================
 * SimEarth 2.0 — earthquake: fissure, offset, landslides
 * -----------------------------------------------------------------------------
 * docs/ereignisse-spec.md §3.6. The shock tears a fissure 2·M + 1 tiles long
 * through the epicentre — along a plate boundary when one is near (M 3),
 * else along the mountain belt or in a hashed direction (M 2) — and lifts
 * the ground on one side of it. Cities nearby lose people; the ruined ones
 * leave ruins, the standing ones lie in rubble for a few ticks. Over the
 * next ticks steep slopes come down as landslides and leave scree. Under
 * the sea the shock only hits the cities on the coast (the tidal wave it
 * could set off is a later chain, spec §3.9).
 * ========================================================================== */

namespace SE {
  /** A quake's state while its slopes come down and its cities lie in rubble. */
  export interface QuakeState {
    readonly magnitude: number;
    /** Fissure direction, in the order of the fissure sprite's frames: 0 −, 1 |, 2 /, 3 \. */
    readonly dir: number;
    /** Tiles the fissure tore. */
    readonly line: number[];
    /** Slopes steep enough to slide, sliding or not. */
    readonly steep: number[];
    /** Landslides still to come, at the hazard age they come down. */
    pending: { tile: number; at: number }[];
    /** Landslides so far: from the slope onto its lowest neighbour, in that tick. */
    readonly slid: { from: number; to: number; tick: number }[];
    /** Damaged cities still in rubble. */
    rubble: number[];
  }

  export interface Hazard {
    quake?: QuakeState;
  }

  /** Fissure directions as tile steps, in the order of the fissure sprite's frames (fxscars.ts walks the line with them). */
  export const QUAKE_DIR_X: readonly number[] = [1, 0, 1, 1];
  export const QUAKE_DIR_Y: readonly number[] = [0, 1, -1, 1];
  /** The side that rises, the one the fissure sprite draws lit: north, west, north-west, north-east. */
  const RISE_X: readonly number[] = [0, -1, -1, 1];
  const RISE_Y: readonly number[] = [-1, 0, -1, -1];
  const FISSURE: readonly ScarKind[] = [ScarKind.FissureH, ScarKind.FissureV, ScarKind.FissureD1, ScarKind.FissureD2];

  /** Whether a plate boundary row lies within QUAKE_PLATE_ROWS of row y. */
  export function quakeNearPlate(y: number): boolean {
    const rows = GRID_H / PLATE_COUNT;
    for (let k = 1; k < PLATE_COUNT; k++) if (Math.abs(y - k * rows) <= QUAKE_PLATE_ROWS) return true;
    return false;
  }

  /** A land tile the quake may tear, lift into scree or slide: no city, vent, ruins or running hazard on it. */
  function open(world: WorldState, i: number): boolean {
    const s = world.hazards.scar[i];
    return world.elevation[i] >= 0 && world.tech[i] === Tech.None && world.hazards.tile[i] === HazardTile.None &&
      s !== ScarKind.Vent && s !== ScarKind.Ruins;
  }

  /**
   * A tile a landslide may start on or come down onto: open, and no fissure.
   * The fissure mostly runs along the mountain belt, so its own slopes would
   * bury it in scree within a tick or two, long before its 30 ticks.
   */
  function slidable(world: WorldState, i: number): boolean {
    return open(world, i) && !FISSURE.includes(world.hazards.scar[i] as ScarKind);
  }

  /**
   * Direction of the mountain belt at (x, y): across the steepest uplift
   * gradient within 2 tiles, or -1 where there is no belt.
   */
  function beltDir(world: WorldState, x: number, y: number): number {
    const u = world.uplift;
    let best = QUAKE_BELT_GRADIENT;
    let gx = 0;
    let gy = 0;
    for (let dy = -2; dy <= 2; dy++) {
      const ty = y + dy;
      if (ty < 1 || ty >= GRID_H - 1) continue;
      for (let dx = -2; dx <= 2; dx++) {
        const tx = x + dx;
        const ax = u[idx(wrapX(tx + 1), ty)] - u[idx(wrapX(tx - 1), ty)];
        const ay = u[idx(wrapX(tx), ty + 1)] - u[idx(wrapX(tx), ty - 1)];
        const g = Math.hypot(ax, ay);
        if (g < best) continue;
        best = g;
        gx = ax;
        gy = ay;
      }
    }
    if (gx === 0 && gy === 0) return -1;
    let a = Math.atan2(gx, -gy);
    if (a < 0) a += Math.PI;
    // 0° −, 45° \ (y runs down), 90° |, 135° /.
    return [0, 3, 1, 2][Math.round(a / (Math.PI / 4)) % 4];
  }

  /** The lowest land neighbour of tile i, or -1: the seabed below a coast is no slope to slide down. */
  function lowestLand(world: WorldState, i: number): number {
    const e = world.elevation;
    const x = i % GRID_W;
    const y = (i / GRID_W) | 0;
    let lo = -1;
    for (let k = 0; k < 8; k++) {
      const ny = y + HAZARD_NY[k];
      if (ny < 0 || ny >= GRID_H) continue;
      const j = idx(wrapX(x + HAZARD_NX[k]), ny);
      if (e[j] >= 0 && (lo < 0 || e[j] < e[lo])) lo = j;
    }
    return lo;
  }

  function steep(world: WorldState, i: number): boolean {
    const lo = lowestLand(world, i);
    return lo >= 0 && world.elevation[i] - world.elevation[lo] > QUAKE_SLIDE_DROP;
  }

  /** Cities lose people by distance; the standing ones lie in rubble for a few ticks. */
  function shakeCities(world: WorldState, h: Hazard, q: QuakeState): void {
    const hz = world.hazards;
    const r = QUAKE_CITY_FAR;
    for (let dy = -r; dy <= r; dy++) {
      const y = h.y + dy;
      if (y < 0 || y >= GRID_H) continue;
      for (let dx = -r; dx <= r; dx++) {
        const i = idx(wrapX(h.x + dx), y);
        if (world.tech[i] === Tech.None) continue;
        const near = Math.max(Math.abs(dx), Math.abs(dy)) <= QUAKE_CITY_NEAR;
        hazardHitCity(world, i, near ? QUAKE_CITY_NEAR_LOSS : QUAKE_CITY_FAR_LOSS);
        if (world.tech[i] === Tech.None || hz.tile[i] !== HazardTile.None) continue;
        hz.tile[i] = HazardTile.Rubble;
        hz.level[i] = QUAKE_RUBBLE_MIN + Math.floor(hazardRoll(world.seed ^ h.id, i, 0x2b) * (QUAKE_RUBBLE_SPAN + 1));
        hz.revision++;
        q.rubble.push(i);
      }
    }
  }

  /** Tear the fissure through the epicentre, then lift the ground on its rising side. */
  function crack(world: WorldState, h: Hazard, q: QuakeState): void {
    const M = q.magnitude;
    const dx = QUAKE_DIR_X[q.dir];
    const dy = QUAKE_DIR_Y[q.dir];
    for (let k = -M; k <= M; k++) {
      const y = h.y + k * dy;
      if (y < 0 || y >= GRID_H) continue;
      const i = idx(wrapX(h.x + k * dx), y);
      if (!open(world, i)) continue;
      setScar(world, i, FISSURE[q.dir]);
      q.line.push(i);
    }
    // Rows parallel to the fissure, counted in steps of the rising side's normal; within the fissure's length.
    const nx = RISE_X[q.dir];
    const ny = RISE_Y[q.dir];
    const reach = M * (dx * dx + dy * dy);
    const box = M + QUAKE_OFFSET_DEPTH;
    for (let oy = -box; oy <= box; oy++) {
      const y = h.y + oy;
      if (y < 0 || y >= GRID_H) continue;
      for (let ox = -box; ox <= box; ox++) {
        const across = ox * nx + oy * ny;
        if (across < 1 || across > QUAKE_OFFSET_DEPTH || Math.abs(ox * dx + oy * dy) > reach) continue;
        const i = idx(wrapX(h.x + ox), y);
        // Land only: a lifted shoal would surface as a one-tile island.
        if (world.elevation[i] >= 0) raiseCrust(world, i, QUAKE_OFFSET_PER_M * M, UpliftKind.None);
      }
    }
  }

  /** Steep slopes within reach; each comes down with a chance by magnitude, in one of the next ticks. */
  function planSlides(world: WorldState, h: Hazard, q: QuakeState): void {
    const r = QUAKE_SLIDE_RADIUS;
    const chance = (QUAKE_SLIDE_CHANCE * q.magnitude) / QUAKE_MAG_PLATE;
    for (let dy = -r; dy <= r; dy++) {
      const y = h.y + dy;
      if (y < 0 || y >= GRID_H) continue;
      for (let dx = -r; dx <= r; dx++) {
        const i = idx(wrapX(h.x + dx), y);
        if (!slidable(world, i) || !steep(world, i)) continue;
        q.steep.push(i);
        if (hazardRoll(world.seed ^ h.id, i, 0x5d) >= chance) continue;
        q.pending.push({ tile: i, at: 1 + Math.floor(hazardRoll(world.seed ^ h.id, i, 0x5e) * QUAKE_SLIDE_TICKS) });
      }
    }
  }

  /** A slope comes down onto its lowest neighbour; both are bare scree. Earlier slides may have eased it. */
  function slide(world: WorldState, q: QuakeState, from: number): void {
    if (!slidable(world, from) || !steep(world, from)) return;
    const to = lowestLand(world, from);
    if (!slidable(world, to)) return;
    raiseCrust(world, from, -QUAKE_SLIDE_AMOUNT, UpliftKind.None);
    raiseCrust(world, to, QUAKE_SLIDE_AMOUNT, UpliftKind.None);
    for (const i of [from, to]) {
      hazardStripPlants(world, i);
      setScar(world, i, ScarKind.Scree);
    }
    q.slid.push({ from, to, tick: world.ticks });
  }

  function clearRubble(world: WorldState, i: number): void {
    const hz = world.hazards;
    hz.tile[i] = HazardTile.None;
    hz.level[i] = 0;
    hz.revision++;
  }

  HAZARD_RULES[EventKind.Earthquake] = {
    refuse: () => '',

    start(world: WorldState, h: Hazard): void {
      const plate = quakeNearPlate(h.y);
      const M = plate ? QUAKE_MAG_PLATE : QUAKE_MAG_INLAND;
      let dir = plate ? 0 : beltDir(world, h.x, h.y);
      if (dir < 0) dir = Math.floor(hazardRoll(world.seed ^ h.id, idx(h.x, h.y), 0x3c) * 4);
      const q: QuakeState = { magnitude: M, dir, line: [], steep: [], pending: [], slid: [], rubble: [] };
      h.quake = q;
      shakeCities(world, h, q);
      if (world.elevation[idx(h.x, h.y)] < 0) return;
      crack(world, h, q);
      planSlides(world, h, q);
    },

    step(world: WorldState, h: Hazard): boolean {
      const q = h.quake;
      if (!q) return false;
      const due = q.pending.filter((p) => p.at <= h.age);
      q.pending = q.pending.filter((p) => p.at > h.age);
      for (const p of due) slide(world, q, p.tile);
      const hz = world.hazards;
      q.rubble = q.rubble.filter((i) => {
        if (hz.tile[i] !== HazardTile.Rubble) return false;
        hz.level[i] = Math.max(0, hz.level[i] - 1);
        if (hz.level[i] > 0) return true;
        clearRubble(world, i);
        return false;
      });
      return q.pending.length > 0 || q.rubble.length > 0;
    },

    finish(world: WorldState, h: Hazard): void {
      const q = h.quake;
      if (!q) return;
      for (const p of q.pending) slide(world, q, p.tile);
      q.pending = [];
      for (const i of q.rubble) if (world.hazards.tile[i] === HazardTile.Rubble) clearRubble(world, i);
      q.rubble = [];
    },
  };
}
