/* =============================================================================
 * SimEarth 2.0 — volcanic eruption
 * -----------------------------------------------------------------------------
 * docs/ereignisse-spec.md §3.1. The eruption raises a cone on its tile and
 * the ring around it; the vent stays a volcano with a crater. Lava then
 * runs downhill one step per tick: each front tile flows to its lowest
 * neighbour and splits where a second one lies almost as low; standing
 * VOLCANO_LAVA_THICK deep, it crosses level ground and small bumps. Water
 * stops it in a cloud of steam, after turning at most LAVA_LAND_MAX
 * shallow tiles into new land. Every lava tile cools from
 * glowing through dark red to a crust and settles as basalt — fresh rock
 * that succession takes back once the scar lets it (scars.ts).
 * Under the sea the cone stays submerged in deep water and only steams.
 * ========================================================================== */

namespace SE {
  const COOL_TICKS = LAVA_STAGE_TICKS[0] + LAVA_STAGE_TICKS[1] + LAVA_STAGE_TICKS[2];

  /** Cooling stage of a lava tile from its level: 0 glowing, 1 dark red, 2 crust. */
  export function lavaStage(level: number): number {
    if (level > LAVA_STAGE_TICKS[1] + LAVA_STAGE_TICKS[2]) return 0;
    if (level > LAVA_STAGE_TICKS[2]) return 1;
    return 2;
  }

  /** Lava over a land tile: everything on it is gone, the ground is fresh rock. */
  function cover(world: WorldState, flow: LavaFlow, i: number): void {
    const hz = world.hazards;
    const from = LANDSCAPE_LEVEL[world.landscape[i]];
    hazardKillLife(world, i, 1);
    hazardStripPlants(world, i);
    hazardHitCity(world, i, 1, false);
    SuccessionSystem.scour(world, i);
    if (hz.scar[i] !== ScarKind.Vent) setScar(world, i, ScarKind.Basalt, from);
    hz.tile[i] = HazardTile.Lava;
    hz.level[i] = COOL_TICKS;
    flow.tiles.push(i);
  }

  /** The lava on a tile has cooled to basalt: its scar starts to age. */
  function settle(world: WorldState, i: number): void {
    const hz = world.hazards;
    hz.tile[i] = HazardTile.None;
    hz.level[i] = 0;
    hz.scarAge[i] = 0;
    hz.revision++;
  }

  function cool(world: WorldState, flow: LavaFlow): void {
    const hz = world.hazards;
    for (let k = flow.tiles.length - 1; k >= 0; k--) {
      const i = flow.tiles[k];
      if (hz.tile[i] !== HazardTile.Lava) {
        flow.tiles.splice(k, 1);
        continue;
      }
      const level = hz.level[i] - 1;
      if (level <= 0) {
        settle(world, i);
        flow.tiles.splice(k, 1);
        continue;
      }
      if (lavaStage(level) !== lavaStage(hz.level[i])) hz.revision++;
      hz.level[i] = level;
    }
  }

  /** Move every front tile one step downhill. */
  function advance(world: WorldState, h: Hazard, flow: LavaFlow): void {
    if (flow.budget <= 0) {
      flow.front.length = 0;
      return;
    }
    const e = world.elevation;
    const hz = world.hazards;
    const next: number[] = [];
    for (const f of flow.front) {
      if (flow.budget <= 0) break;
      const fx = f % GRID_W;
      const fy = (f / GRID_W) | 0;
      let lo = -1;
      let lo2 = -1;
      for (let k = 0; k < 8; k++) {
        const ny = fy + HAZARD_NY[k];
        if (ny < 0 || ny >= GRID_H) continue;
        const nx = wrapX(fx + HAZARD_NX[k]);
        if (hazardDistance(h.x, h.y, nx, ny) > VOLCANO_LAVA_REACH) continue;
        const j = idx(nx, ny);
        if (hz.tile[j] === HazardTile.Lava) continue;
        if (lo < 0 || e[j] < e[lo]) {
          lo2 = lo;
          lo = j;
        } else if (lo2 < 0 || e[j] < e[lo2]) {
          lo2 = j;
        }
      }
      if (lo < 0) continue;
      // The flow's surface stands VOLCANO_LAVA_THICK above its ground.
      const top = e[f] + VOLCANO_LAVA_THICK;
      if (e[lo] > top) continue;
      const targets = [lo];
      const split = lo2 >= 0 && e[lo2] <= top && e[lo2] - e[lo] <= VOLCANO_BRANCH_DROP;
      if (split && hazardRoll(world.seed ^ h.id, lo2, h.age) < VOLCANO_BRANCH_CHANCE) targets.push(lo2);
      for (const t of targets) {
        if (flow.budget <= 0) break;
        if (e[t] < 0) {
          if (e[t] < LAVA_LAND_DEPTH || flow.land >= LAVA_LAND_MAX) {
            flow.steam.push({ tile: t, tick: world.ticks });
            continue;
          }
          hazardLift(world, t, LAVA_LAND_HEIGHT - e[t]);
          flow.land++;
        }
        cover(world, flow, t);
        flow.budget--;
        next.push(t);
      }
    }
    flow.front = next;
  }

  HAZARD_RULES[EventKind.Volcano] = {
    refuse: () => '',

    start(world: WorldState, h: Hazard): void {
      const vent = idx(h.x, h.y);
      const deep = world.elevation[vent] <= COAST_DEPTH;
      const lift = (i: number, amount: number): void => {
        // In deep ocean the cone grows but never breaks the surface (K5).
        const room = deep ? Math.max(0, VOLCANO_DEEP_CAP - world.elevation[i]) : amount;
        hazardLift(world, i, Math.min(amount, room));
      };
      lift(vent, VOLCANO_VENT_LIFT);
      for (let k = 0; k < 8; k++) {
        const ny = h.y + HAZARD_NY[k];
        if (ny >= 0 && ny < GRID_H) lift(idx(wrapX(h.x + HAZARD_NX[k]), ny), VOLCANO_RING_LIFT);
      }
      shiftGas(world, 'co2', 'volcano', VOLCANO_CO2, 0, 5000);
      world.dust = clamp(world.dust + VOLCANO_DUST, 0, 1);
      for (let dy = -VOLCANO_ASH_RADIUS; dy <= VOLCANO_ASH_RADIUS; dy++) {
        const y = h.y + dy;
        if (y < 0 || y >= GRID_H) continue;
        for (let dx = -VOLCANO_ASH_RADIUS; dx <= VOLCANO_ASH_RADIUS; dx++) {
          if (dx !== 0 || dy !== 0) hazardHitCity(world, idx(wrapX(h.x + dx), y), VOLCANO_ASH_LOSS);
        }
      }

      const span = Math.floor(hazardRoll(world.seed ^ h.id, vent, 0x1a7a) * (VOLCANO_LAVA_SPAN + 1));
      const flow: LavaFlow = { budget: VOLCANO_LAVA_MIN + span, front: [], tiles: [], land: 0, steam: [], steamLeft: 0 };
      h.lava = flow;
      if (world.elevation[vent] < 0) {
        hazardKillLife(world, vent, 0.6);
        flow.budget = 0;
        flow.steamLeft = VOLCANO_STEAM_TICKS;
        flow.steam.push({ tile: vent, tick: world.ticks });
        return;
      }
      cover(world, flow, vent);
      setScar(world, vent, ScarKind.Vent);
      flow.front.push(vent);
    },

    step(world: WorldState, h: Hazard): boolean {
      const flow = h.lava;
      if (!flow) return false;
      if (flow.steamLeft > 0) {
        flow.steamLeft--;
        if (flow.steamLeft % 2 === 0) flow.steam.push({ tile: idx(h.x, h.y), tick: world.ticks });
        return flow.steamLeft > 0;
      }
      cool(world, flow);
      advance(world, h, flow);
      return flow.front.length > 0 || flow.tiles.length > 0;
    },

    finish(world: WorldState, h: Hazard): void {
      const flow = h.lava;
      if (!flow) return;
      flow.front.length = 0;
      flow.budget = 0;
      flow.steamLeft = 0;
      for (const i of flow.tiles) if (world.hazards.tile[i] === HazardTile.Lava) settle(world, i);
      flow.tiles.length = 0;
    },
  };
}
