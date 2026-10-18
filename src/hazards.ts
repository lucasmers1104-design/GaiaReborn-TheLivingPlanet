/* =============================================================================
 * SimEarth 2.0 — hazards: disasters that start on one tile and spread
 * -----------------------------------------------------------------------------
 * The simulation half of docs/ereignisse-spec.md §2: a hazard starts on
 * exactly one tile with its impact, then spreads one step per tick by its
 * own rules (hazard*.ts register them in HAZARD_RULES) and leaves scars
 * (scars.ts) that heal through succession. Omen and main animation are pure
 * presentation and live in the fx*.ts files. Randomness comes from
 * `hazardRoll`, never from world.rng, so a disaster does not shift the
 * random stream the rest of the planet runs on.
 * ========================================================================== */

namespace SE {
  /** A disaster's rules. */
  export interface HazardRule {
    /** Why the hazard cannot start at (x, y), or '' where it can. */
    refuse(world: WorldState, x: number, y: number): string;
    /** The impact, the moment the hazard starts. */
    start(world: WorldState, h: Hazard): void;
    /** One tick of spread; false once the hazard is over. */
    step(world: WorldState, h: Hazard): boolean;
    /** Jump straight to the aftermath, to make room for a new hazard. */
    finish(world: WorldState, h: Hazard): void;
  }

  /** Indexed by EventKind; each hazard*.ts file registers its rule. */
  export const HAZARD_RULES: (HazardRule | undefined)[] = [];

  /** Stable 0..1 roll from three integers. */
  export function hazardRoll(a: number, b: number, c: number): number {
    let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77) ^ Math.imul(c | 0, 0xc2b2ae3d);
    h ^= h >>> 16;
    h = Math.imul(h, 0x7feb352d);
    h ^= h >>> 15;
    h = Math.imul(h, 0x846ca68b);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  /** The eight neighbours, as x and y offsets. */
  export const HAZARD_NX: readonly number[] = [-1, 0, 1, -1, 1, -1, 0, 1];
  export const HAZARD_NY: readonly number[] = [-1, -1, -1, 0, 0, 1, 1, 1];

  /** Chebyshev distance between two tiles on the wrapping map. */
  export function hazardDistance(x0: number, y0: number, x1: number, y1: number): number {
    const dx = Math.abs(x1 - x0);
    return Math.max(Math.min(dx, GRID_W - dx), Math.abs(y1 - y0));
  }

  export class HazardSystem {
    /** Told of every hazard that starts without the player — nature or a chain — so the app can report it. */
    onStart: ((h: Hazard) => void) | null = null;

    /** Why `kind` cannot start at (x, y), or '' where it can. Checked before the player pays. */
    refusal(world: WorldState, kind: EventKind, x: number, y: number): string {
      const rule = HAZARD_RULES[kind];
      if (!rule) return 'Dieses Ereignis läuft noch nicht im neuen Ablauf.';
      if (y < 0 || y >= GRID_H) return 'Dieses Feld liegt außerhalb der Karte.';
      return rule.refuse(world, wrapX(x), y);
    }

    /**
     * Start a hazard on one tile now. With HAZARD_MAX_ACTIVE running, a
     * natural or chained one is dropped and a player's makes the oldest jump
     * to its aftermath. Null where the hazard cannot start. `strength` (1 for
     * a full one) is set before the impact, so the rule's start sees it.
     */
    start(world: WorldState, kind: EventKind, x: number, y: number, cause: HazardCause, strength?: number): Hazard | null {
      const rule = HAZARD_RULES[kind];
      if (!rule || this.refusal(world, kind, x, y) !== '') return null;
      const hz = world.hazards;
      if (hz.list.length >= HAZARD_MAX_ACTIVE) {
        if (cause === 'natural' || cause === 'chain') return null;
        const oldest = hz.list.shift() as Hazard;
        HAZARD_RULES[oldest.kind]?.finish(world, oldest);
        oldest.done = true;
      }
      const h: Hazard = {
        id: hz.nextId++, kind, x: wrapX(x), y, cause, startTick: world.ticks, age: 0, done: false, chainUsed: false,
      };
      if (strength !== undefined) h.strength = strength;
      hz.list.push(h);
      rule.start(world, h);
      hz.revision++;
      if (cause !== 'player') this.onStart?.(h);
      this.chain(world, h);
      return h;
    }

    /** One tick: every running hazard spreads, then every scar ages or heals. */
    step(world: WorldState): void {
      const hz = world.hazards;
      for (const h of hz.list.slice()) {
        h.age++;
        const rule = HAZARD_RULES[h.kind];
        const going = !!rule && rule.step(world, h);
        this.chain(world, h);
        if (going) continue;
        h.done = true;
        hz.list.splice(hz.list.indexOf(h), 1);
        hz.revision++;
      }
      stepScars(world);
    }

    /** Let `h` set off the one other hazard it may (spec §3.9); a chained hazard sets off none. */
    private chain(world: WorldState, h: Hazard): void {
      if (h.cause === 'chain' || h.chainUsed) return;
      const next = HAZARD_CHAINS[h.kind]?.(world, h);
      if (next && this.start(world, next.kind, next.x, next.y, 'chain', next.strength)) h.chainUsed = true;
    }
  }

  /* ------------------------------------------------------------ helpers -- */

  /** Every species on the tile loses `amount` of density; below 0.02 it is gone. */
  export function hazardKillLife(world: WorldState, i: number, amount: number): void {
    const base = i * LIFE_COUNT;
    for (let c = 1; c < LIFE_COUNT; c++) {
      const d = world.lifeDensity[base + c];
      if (d <= 0) continue;
      const next = d - amount;
      if (next < 0.02) {
        world.lifeDensity[base + c] = 0;
        world.lifeStage[base + c] = 0;
      } else {
        world.lifeDensity[base + c] = next;
      }
    }
  }

  /** Nothing left growing on the tile. */
  export function hazardStripPlants(world: WorldState, i: number): void {
    world.vegetation[i] = 0;
    world.flora[i] = 0;
  }

  /**
   * A city loses `share` of its people; at 1, or once almost nobody is left,
   * it is gone — leaving ruins unless `ruins` is false (buried under lava).
   * The civilization notices at its next reconcile and reports it.
   */
  export function hazardHitCity(world: WorldState, i: number, share: number, ruins = true): void {
    if (world.tech[i] === Tech.None) return;
    world.cityPop[i] *= 1 - share;
    if (share >= 1 || world.cityPop[i] <= 0.05) {
      world.tech[i] = Tech.None;
      world.cityPop[i] = 0;
      if (ruins) setScar(world, i, ScarKind.Ruins);
    }
  }
}
