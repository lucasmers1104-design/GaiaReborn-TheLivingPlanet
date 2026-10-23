/* =============================================================================
 * SimEarth 2.0 — the kapok tree, the rainforest's giant
 * -----------------------------------------------------------------------------
 * Once a rainforest has grown large, one kapok tree rises in its heart: on
 * the rainforest tile farthest from any other landscape, at least
 * KAPOK_CORE tiles in. It stands while its tile stays rainforest, with no
 * river, city, field or logging on it, then rises again in the deepest
 * rainforest left. One per planet, a landmark only: the map draws it
 * (kapoklayer.ts), the simulation never reads it. Finding it with the
 * Examine tool puts it in the chronicle once. The optional save field
 * `kapok` keeps its tile.
 * ========================================================================== */

namespace SE {
  /** Tiles from the rainforest's edge (eight neighbours) the tree needs: 3 is a solid 5 × 5 block around it. */
  export const KAPOK_CORE = 3;

  /** The Examine window's card on the tree's tile and the tiles its crown fills. */
  export const KAPOK_INFO = {
    title: 'Kapokbaum, ein Urwaldriese', icon: 'broadleaf',
    text: 'Ein Kapokbaum wird bis zu 70 m hoch und ragt weit über das Kronendach. Weil seine Wurzeln im nährstoffarmen Boden flach bleiben, stützen ihn mächtige Brettwurzeln. ' +
      'Bäume sind die größten Lebewesen der Erde: Der Küstenmammutbaum „Hyperion“ misst rund 116 m, der Riesenmammutbaum „General Sherman“ trägt fast 1.500 m³ Holz im Stamm. ' +
      'Die Grannenkiefer „Methusalem“ ist über 4.800 Jahre alt. Sie keimte, bevor in Ägypten die erste Pyramide stand.',
  } as const;

  const KAPOK_ENTRY = {
    key: 'sight:kapok', title: 'Urwaldriese entdeckt',
    text: 'Mitten im Regenwald ragt ein Kapokbaum weit über das Kronendach hinaus. Seine Schirmkrone fängt das Sonnenlicht, lange bevor es den dunklen Waldboden erreicht.',
    change: 'Ein einzelner Urwaldriese ist eine eigene Welt: In seiner Krone wachsen Orchideen und Bromelien, darin leben Frösche, Insekten und Vögel.',
  };

  let dist: Int16Array | null = null;
  let queue: Int32Array | null = null;

  function kapokFits(world: WorldState, i: number): boolean {
    return world.landscape[i] === Landscape.Rainforest && !world.isWater(i) && world.tech[i] === Tech.None &&
      world.riverLevel[i] <= 0 && world.logged[i] === 0 && (world.landUse[i] & LAND_USE_CLEARS) === 0;
  }

  /** Keep the tree while its tile fits, else raise it in the deepest rainforest. Draws no random numbers. */
  export function placeKapok(world: WorldState): void {
    if (world.kapokTree >= 0 && kapokFits(world, world.kapokTree)) return;
    world.kapokTree = -1;
    const d = dist ??= new Int16Array(TILE_COUNT);
    const q = queue ??= new Int32Array(TILE_COUNT);
    // Distance to the rainforest's edge: a breadth-first walk in from every other tile.
    let head = 0, tail = 0;
    for (let i = 0; i < TILE_COUNT; i++) {
      if (world.landscape[i] === Landscape.Rainforest && !world.isWater(i)) d[i] = -1;
      else { d[i] = 0; q[tail++] = i; }
    }
    if (TILE_COUNT - tail < (2 * KAPOK_CORE - 1) ** 2) return;
    while (head < tail) {
      const i = q[head++];
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= GRID_H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const j = ny * GRID_W + wrapX(x + dx);
          if (d[j] === -1) { d[j] = d[i] + 1; q[tail++] = j; }
        }
      }
    }
    let best = KAPOK_CORE;
    let bestOrder = 0;
    for (let i = 0; i < TILE_COUNT; i++) {
      if (d[i] < best || !kapokFits(world, i)) continue;
      // Among equally deep tiles a scrambled order, so the tree doesn't drift to the map's top left.
      const order = Math.imul(i + 1, 0x9e3779b1) >>> 0;
      if (d[i] === best && world.kapokTree >= 0 && order >= bestOrder) continue;
      best = d[i];
      bestOrder = order;
      world.kapokTree = i;
    }
  }

  /** Whether tile `i` shows the tree: its own, or one of the 3 × 2 tiles above that its crown (32 × 40 px) fills. */
  export function onKapok(world: WorldState, i: number): boolean {
    const k = world.kapokTree;
    if (k < 0) return false;
    // −1, 0, 1 for the tree's column and its neighbours, across the east-west wrap.
    const dx = ((i % GRID_W) - (k % GRID_W) + GRID_W + 1) % GRID_W - 1;
    const dy = ((k / GRID_W) | 0) - ((i / GRID_W) | 0);
    return dy === 0 ? dx === 0 : (dy === 1 || dy === 2) && Math.abs(dx) <= 1;
  }

  /** The chronicle entry for examining tile `at`, or null if the tree isn't there or is in the chronicle. */
  export function kapokMilestone(world: WorldState, at: number): ChronicleEntry | null {
    if (at < 0 || !onKapok(world, at) || world.evo.chronicle.some((c) => c.key === KAPOK_ENTRY.key)) return null;
    return {
      ...KAPOK_ENTRY, kind: 'milestone', icon: evoIcon(KAPOK_INFO.icon),
      tick: world.ticks, years: world.absoluteYears, major: false, at: world.kapokTree,
    };
  }

  /** Saves from before the tree have none; the next tick raises it anew. */
  export function restoreKapok(world: WorldState, raw: unknown): void {
    world.kapokTree = Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) < TILE_COUNT ? raw as number : -1;
  }
}
