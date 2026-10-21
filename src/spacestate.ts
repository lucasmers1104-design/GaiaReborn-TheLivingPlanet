/* =============================================================================
 * SimEarth 2.0 — the space project's state
 * -----------------------------------------------------------------------------
 * One launch site per planet, unlocked once a city of its sentient species
 * reaches the Nanotech age; its rules are in spaceport.ts. The tech levels
 * stay as they are: the project only reads them. Saved as the `space` field
 * from format 10 on. Pure data, no DOM.
 * ========================================================================== */

namespace SE {
  export class SpaceState {
    /** Tick the project was unlocked, −1 while it is not. */
    unlocked = -1;
    /** Pad tile of the launch site, −1 while none is found (the map draws it there). */
    site = -1;
    /** Build progress 0..1; the rocket stands ready at 1. */
    progress = 0;
    /** Tick of the launch, −1 before. After it no second rocket is ever built. */
    launched = -1;
    /** Planet age at the launch, years. */
    launchedYears = 0;
    /** Highest phase announced so far, −1 before the first (spaceport.ts announces each once). */
    announced = -1;
    /** No site search before this tick, after one found none. */
    retryAt = 0;
    /** Times the site had to move. */
    moves = 0;

    reset(): void {
      this.unlocked = -1;
      this.site = -1;
      this.progress = 0;
      this.launched = -1;
      this.launchedYears = 0;
      this.announced = -1;
      this.retryAt = 0;
      this.moves = 0;
    }

    copyFrom(o: SpaceState): void {
      this.unlocked = o.unlocked;
      this.site = o.site;
      this.progress = o.progress;
      this.launched = o.launched;
      this.launchedYears = o.launchedYears;
      this.announced = o.announced;
      this.retryAt = o.retryAt;
      this.moves = o.moves;
    }
  }
}
