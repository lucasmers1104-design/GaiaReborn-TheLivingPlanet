/* =============================================================================
 * SimEarth 2.0 — the termite mound on the savanna
 * -----------------------------------------------------------------------------
 * Once ants (insect sub-species 8) live on a savanna, one termite mound rises
 * on the savanna tile where they are densest; it stands while its tile stays
 * savanna and without a city, then moves to the next. A landmark only: the
 * map draws it (termitelayer.ts), the simulation never reads it. Finding it
 * with the Examine tool puts it in the chronicle once. The optional save
 * field `termites` keeps its tile.
 * ========================================================================== */

namespace SE {
  /** Ants: the insects' last sub-species. */
  export const TERMITE_STAGE = 7;

  /** The Examine window's card on the mound's tile. */
  export const TERMITE_INFO = {
    title: 'Termitenhügel', icon: 'insects',
    text: 'Termiten sind keine Ameisen, sondern staatenbildende Verwandte der Schaben. Im Lehmhügel züchten sie einen Pilz, der ihnen Gras und Holz aufschließt; Schlote und Gänge lüften das Nest.',
  } as const;

  const TERMITE_ENTRY = {
    key: 'sight:termites', title: 'Termitenhügel entdeckt',
    text: 'Mitten in der Savanne ragt ein Hügel aus hartem Lehm auf. Darin lebt ein Staat aus Millionen Termiten, die im Dunkeln einen Pilz als Nahrung züchten.',
    change: 'Termitenhügel reichern den Boden mit Nährstoffen an und werden zu grünen Inseln in der Savanne.',
  };

  function moundFits(world: WorldState, i: number): boolean {
    return world.landscape[i] === Landscape.Savanna && !world.isWater(i) && world.tech[i] === Tech.None;
  }

  /** Keep the mound while its tile fits, else raise it where ants on a savanna are densest. Draws no random numbers. */
  export function placeTermiteMound(world: WorldState): void {
    if (world.termiteMound >= 0 && moundFits(world, world.termiteMound)) return;
    world.termiteMound = -1;
    if (world.lifeStageCounts[Life.Insect * SUBSPECIES_PER_CLASS + TERMITE_STAGE] === 0) return;
    let best = 0;
    for (let i = 0; i < TILE_COUNT; i++) {
      const li = i * LIFE_COUNT + Life.Insect;
      const d = world.lifeDensity[li];
      if (d > best && world.lifeStage[li] >= TERMITE_STAGE && moundFits(world, i)) {
        best = d;
        world.termiteMound = i;
      }
    }
  }

  /** The chronicle entry for examining tile `at`, or null if the mound isn't there or is in the chronicle. */
  export function termiteMilestone(world: WorldState, at: number): ChronicleEntry | null {
    if (at < 0 || at !== world.termiteMound || world.evo.chronicle.some((c) => c.key === TERMITE_ENTRY.key)) return null;
    return {
      ...TERMITE_ENTRY, kind: 'milestone', icon: evoIcon(TERMITE_INFO.icon),
      tick: world.ticks, years: world.absoluteYears, major: false, at,
    };
  }

  /** Saves from before the mound have none; the next tick raises it anew. */
  export function restoreTermites(world: WorldState, raw: unknown): void {
    world.termiteMound = Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) < TILE_COUNT ? raw as number : -1;
  }
}
