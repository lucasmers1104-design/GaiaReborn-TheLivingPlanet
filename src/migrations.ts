/* =============================================================================
 * SimEarth 2.0 — salmon runs and stork migrations: who may show them, and what
 * the Examine window and the chronicle say when the player watches one (or
 * clownfish out of their coral, a sighting of the same kind).
 * The animations are salmonlayer.ts, storklayer.ts and clownfishlayer.ts;
 * visual only, the simulation never reads this.
 * ========================================================================== */

namespace SE {
  export type Migration = 'salmon' | 'storks' | 'clownfish';

  /** First stage of each class that migrates: true bony fish (sub-species 6), ducks and modern birds (sub-species 4). */
  export const SALMON_STAGE = 5;
  export const STORK_STAGE = 3;

  /** Whether sub-species `from` or a later one of class c lives anywhere on the planet. */
  function livesFrom(world: WorldState, c: Life, from: number): boolean {
    for (let s = from; s < SUBSPECIES_PER_CLASS; s++) if (world.lifeStageCounts[c * SUBSPECIES_PER_CLASS + s] > 0) return true;
    return false;
  }

  export function salmonCanRun(world: WorldState): boolean {
    return livesFrom(world, Life.Fish, SALMON_STAGE);
  }

  export function storksCanFly(world: WorldState): boolean {
    return livesFrom(world, Life.Avian, STORK_STAGE);
  }

  /** The Examine window's card while one is in sight. */
  export const MIGRATION_INFO: Readonly<Record<Migration, { title: string; text: string; icon: string }>> = {
    salmon: {
      title: 'Lachswanderung am Fluss', icon: 'fish',
      text: 'Knochenfische ziehen aus dem Meer flussaufwärts zu ihren Laichgründen im klaren Oberlauf und überwinden selbst starke Strömungen im Sprung.',
    },
    storks: {
      title: 'Storchenzug am Himmel', icon: 'birds',
      text: 'Große Zugvögel nutzen Aufwinde über dem Land und gleiten in Formation zwischen ihren Brut- und Rastgebieten in den Feuchtgebieten und Steppen.',
    },
    clownfish: {
      title: 'Clownfische im Riff', icon: 'fish',
      text: 'Clownfische leben paarweise oder in kleinen Gruppen zwischen den Tentakeln großer Seeanemonen im Riff. Eine Schleimschicht schützt sie vor den Nesselzellen; selten entfernen sie sich mehr als ein paar Meter von ihrem Wirt.',
    },
  };

  const MIGRATION_ENTRIES: Readonly<Record<Migration, { key: string; title: string; text: string; change: string }>> = {
    salmon: {
      key: 'migration:salmon', title: 'Lachswanderung beobachtet',
      text: 'Vom Meer zieht ein Schwarm Knochenfische den Fluss hinauf. Im Sprung überwinden sie die Strömung auf dem Weg zu ihren Laichgründen.',
      change: 'Flüsse verbinden nun Meer und Land im Kreislauf der Nährstoffe.',
    },
    storks: {
      key: 'migration:storks', title: 'Vogelzug beobachtet',
      text: 'Hoch über dem Land segelt ein Zug Störche in Formation von einem Lebensraum zum nächsten und folgt den Jahreszeiten und Aufwinden.',
      change: 'Zugvögel verbinden weit entfernte Lebensräume über Kontinente hinweg.',
    },
    clownfish: {
      key: 'sight:clownfish', title: 'Clownfische entdeckt',
      text: 'Zwischen den Korallen wagen sich orange-weiß gestreifte Fische aus ihrer Seeanemone hervor, drehen eine kurze Runde und schlüpfen gleich wieder zwischen die Tentakel zurück.',
      change: 'Clownfisch und Anemone helfen einander: Die Nesselzellen schützen den Fisch, und der Fisch vertreibt Fressfeinde der Anemone.',
    },
  };

  /** The chronicle entry for watching `kind` on tile `at` with the Examine tool, or null once it is in the chronicle. */
  export function migrationMilestone(world: WorldState, kind: Migration, at: number): ChronicleEntry | null {
    const e = MIGRATION_ENTRIES[kind];
    if (world.evo.chronicle.some((c) => c.key === e.key)) return null;
    return {
      ...e, kind: 'milestone', icon: evoIcon(MIGRATION_INFO[kind].icon),
      tick: world.ticks, years: world.absoluteYears, major: false, at,
    };
  }
}
