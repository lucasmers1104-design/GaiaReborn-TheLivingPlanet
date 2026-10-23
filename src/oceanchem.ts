/* =============================================================================
 * SimEarth 2.0 — ocean oxygen and iron
 * -----------------------------------------------------------------------------
 * The first oxygen of marine producers never reaches the air. The young ocean
 * is full of dissolved iron (Fe²⁺), which the oxygen rusts into insoluble
 * Fe³⁺ that sinks as the banded iron formations. Only when that iron is used
 * up does oxygen accumulate in the water, and only across the sea surface does
 * it reach the air: the Great Oxidation Event. Land plants, which come much
 * later, breathe straight into the air.
 * ========================================================================== */

namespace SE {
  export class OceanChemistry {
    /**
     * Advance the sea by one tick with the marine net oxygen production (in
     * air percent). Returns what the sea hands to the air, negative when it
     * draws oxygen from it.
     */
    static step(world: WorldState, params: ModelParams, marineO2: number): number {
      // Exchange first, iron last: iron binds oxygen far faster than the sea
      // surface trades it, so none of it escapes while iron is left — not even
      // what the sea has just drawn from the air.
      const saturated = (world.o2 / O2_PRESENT) * OCEAN_O2_CAPACITY;
      let dissolved = (world.oceanO2 / 100) * OCEAN_O2_CAPACITY;
      world.gas.seaLevels(world.oceanO2, (world.o2 / O2_PRESENT) * 100);
      const outgassing = OCEAN_GAS_EXCHANGE * (dissolved - saturated);
      dissolved = Math.max(0, dissolved - outgassing + marineO2);

      const bound = dissolved * Math.min(1, IRON_REACTIVITY * world.oceanIron);
      world.gas.addSea('iron', -bound);
      world.oceanIron = clamp(
        world.oceanIron - bound / IRON_O2_DEMAND + IRON_RESUPPLY * mul(params.geo.volcanoes), 0, 1,
      );
      world.oceanO2 = ((dissolved - bound) / OCEAN_O2_CAPACITY) * 100;
      return outgassing;
    }

    /** Reduced gases and fresh rock consuming free oxygen from the air this tick. */
    static reducingSink(o2: number): number {
      return (REDUCING_SINK * o2) / (o2 + REDUCING_HALF);
    }
  }

  /** Air O2 (percent) above which a planet saved before format 6 had used up its iron. */
  const OXIC_AIR = 2;

  /**
   * A plausible sea for a planet that recorded only its air (saves before
   * format 6, which started at 1 % and passed 2 % well after the first
   * oxygen producers): below that, part of the iron was still dissolved.
   */
  export function seaFromAir(o2: number): { iron: number; oxygen: number } {
    const iron = clamp(1 - o2 / OXIC_AIR, 0, 1);
    return { iron, oxygen: iron < IRON_DEPLETED ? (o2 / O2_PRESENT) * 100 : 0 };
  }

  interface OxygenMilestone {
    readonly key: string;
    readonly title: string;
    readonly text: string;
    readonly change: string;
    readonly icon: string;
    readonly major: boolean;
    readonly reached: (w: WorldState) => boolean;
  }

  /** In the order they happen; each waits for the one before it. */
  const OXYGEN_MILESTONES: readonly OxygenMilestone[] = [
    {
      key: 'oxygen:iron', title: 'Eisen im Meer aufgebraucht',
      text: 'Bisher hat das im Meer gelöste Eisen den Sauerstoff der Cyanobakterien gebunden. Als Rost sank es zu Boden und bildete die Bändererze. Nun ist das Eisen verbraucht.',
      change: 'Neuer Sauerstoff bleibt jetzt im Wasser gelöst.',
      icon: 'assets/events/milestone.svg', major: false,
      reached: (w) => w.oceanIron < IRON_DEPLETED,
    },
    {
      key: 'oxygen:sea', title: 'Sauerstoff reichert sich im Meer an',
      text: 'Der große Eisenvorrat ist weitgehend gebunden. Nun bleibt mehr Sauerstoff im Wasser gelöst, zuerst an der Oberfläche.',
      change: 'Das Meer gibt jetzt Sauerstoff an die Luft ab.',
      icon: 'assets/resources/oxygen.svg', major: false,
      reached: (w) => w.oceanO2 >= OCEAN_O2_RISEN,
    },
    {
      key: 'oxygen:air', title: 'Große Sauerstoffkatastrophe',
      text: 'Sauerstoff reichert sich in der Luft an. Für viele Mikroben, die ohne Sauerstoff leben, ist er giftig – sie weichen in sauerstofffreie Nischen aus. In der Höhe bildet sich eine erste Ozonschicht.',
      change: 'Die Sauerstoffproduktion im Meer verändert jetzt auch die Atmosphäre – lange vor den ersten Landpflanzen.',
      icon: 'assets/resources/oxygen.svg', major: true,
      reached: (w) => w.o2 >= AIR_O2_RISEN,
    },
  ];

  /** Oxygen milestones this planet has newly reached, for the chronicle. */
  export function oxygenMilestones(world: WorldState): ChronicleEntry[] {
    const out: ChronicleEntry[] = [];
    for (const m of OXYGEN_MILESTONES) {
      if (world.evo.chronicle.some((e) => e.key === m.key)) continue;
      if (!m.reached(world)) break;
      out.push({
        key: m.key, kind: 'milestone', title: m.title, text: m.text, change: m.change,
        icon: m.icon, tick: world.ticks, years: world.absoluteYears, major: m.major,
      });
    }
    return out;
  }
}
