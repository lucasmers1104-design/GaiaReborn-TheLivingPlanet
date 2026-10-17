/* =============================================================================
 * SimEarth 2.0 — stand-ins for the height task's interface
 * -----------------------------------------------------------------------------
 * The hazards need three things the height task (docs/hoehe-spec.md §3.2,
 * §3.8) owns: `raiseCrust`, the basalt ground and scree (Schutt). Until that
 * task is merged they go through this file only; afterwards each function calls the
 * real one and this file shrinks to nothing (docs/ereignisse-spec.md K1).
 * ========================================================================== */

namespace SE {
  /** Raise (or with a negative amount lower) the crust of one tile; hazardlava.ts still calls it. */
  export function hazardLift(world: WorldState, i: number, amount: number): void {
    raiseCrust(world, i, amount, UpliftKind.None);
  }

  /** Ramp steps the stand-in basalt darkens bare rock by. */
  const BASALT_SHADE = -2;
  /** Fresh flood mud is drawn lighter than the marsh's own, almost black mud. */
  const MUD_SHADE = 2;

  /**
   * Terrain ground key and extra shading of a scar whose ground the terrain
   * draws, or null where the effect layer draws it (fxground.ts) or the
   * landscape's own ground stays. Basalt is bare rock drawn dark and scree
   * bare rock until the real materials exist; mud is the terrain's own, lighter.
   */
  export function scarGround(scar: ScarKind, T: LandTables): { key: number; shade: number } | null {
    switch (scar) {
      case ScarKind.Basalt:
      case ScarKind.Vent:
        return { key: T.groundKey(Landscape.Rock, Substrate.Rock, 0), shade: BASALT_SHADE };
      case ScarKind.Scree:
        return { key: T.groundKey(Landscape.Rock, Substrate.Rock, 0), shade: 0 };
      case ScarKind.Mud:
        return { key: T.groundKey(Landscape.Rock, Substrate.Mire, 0), shade: MUD_SHADE };
      default:
        return null;
    }
  }
}
