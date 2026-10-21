namespace SE {
  /**
   * The planet's Ω tier (index into OMEGA_STAGES). Derived from the developed
   * steps and the first city, which only grow, so a tier is never lost and
   * saves need no field of their own.
   */
  export function omegaStage(world: WorldState): number {
    for (let i = OMEGA_STAGES.length - 1; i > 0; i--) {
      const unlock = OMEGA_STAGES[i].unlock;
      if (unlock === 'city' ? world.sentientClass !== Life.None : world.evo.developed.has(unlock)) return i;
    }
    return 0;
  }

  export function omegaCap(world: WorldState): number {
    return OMEGA_STAGES[omegaStage(world)].max;
  }

  /** One tick of Ω income at the planet's tier. */
  export function regenOmega(world: WorldState): void {
    const s = OMEGA_STAGES[omegaStage(world)];
    world.omega = Math.min(s.max, world.omega + s.regen);
  }
}
