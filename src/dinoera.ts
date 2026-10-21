/* =============================================================================
 * SimEarth 2.0 — the dinosaurs' era and the player's choice about its end
 * -----------------------------------------------------------------------------
 * A rule of this game, not of nature: until a comet has ended the era of the
 * dinosaurs, mammals climb no further than the marsupials and the whales and
 * grazers stay barred. The first birds put the question to the player — let
 * the dinosaurs live, or let the comet strike (comet.ts does the strike).
 * Every way life can arise or be placed asks the functions below, so the
 * bars hold for the tree, for nature's own steps and for the placement tool.
 * Pure rules on WorldState; the dialog and the show live in the app.
 * ========================================================================== */

namespace SE {
  /**
   *   open           no birds yet; the era's bars hold
   *   deciding       the first birds have arisen; the world waits for the player
   *   kept           the dinosaurs live on: the era and its bars stay for good
   *   impactPending  the comet is chosen and its target fixed; it has not struck
   *   extinct        the comet struck: no dinosaur ever again, mammals are free
   *   exempt         a save from before this rule whose mammals had gone further
   *                  already: it keeps the freedom it had (Bestandsschutz)
   */
  export type DinoFate = 'open' | 'deciding' | 'kept' | 'impactPending' | 'extinct' | 'exempt';
  export const DINO_FATES: readonly DinoFate[] = ['open', 'deciding', 'kept', 'impactPending', 'extinct', 'exempt'];

  /** A population the comet left sheltered (comet.ts): class `c` at sub-species `stage` on `tile`, since tick `since`. */
  export interface CometRefuge {
    readonly tile: number;
    readonly c: Life;
    readonly stage: number;
    readonly since: number;
  }

  /** What belongs in a save file about the era. */
  export class DinoEraState {
    fate: DinoFate = 'open';
    /** Upper left tile of the comet's 2 × 2 crater once it is chosen, -1 before. */
    target = -1;
    /** Tick of the strike, -1 before: its winter (cometwinter.ts) runs from here. */
    struck = -1;
    /** Sheltered populations after the strike, until each can grow again. */
    readonly refuges: CometRefuge[] = [];

    reset(): void {
      this.fate = 'open';
      this.target = -1;
      this.struck = -1;
      this.refuges.length = 0;
    }

    copyFrom(o: DinoEraState): void {
      this.fate = o.fate;
      this.target = o.target;
      this.struck = o.struck;
      this.refuges.length = 0;
      this.refuges.push(...o.refuges);
    }
  }

  /**
   * Sub-species of other groups the comet ends for good beside the
   * dinosaurs, as the end of the Cretaceous did on Earth: pterosaurs,
   * ammonites, belemnites and the toothed birds. Their groups live on and
   * climb past these rungs afterwards.
   */
  const COMET_LOST: readonly (readonly [Life, number])[] = [
    [Life.Reptile, 4], [Life.Mollusc, 4], [Life.Mollusc, 5], [Life.Avian, 2],
  ];
  const COMET_LOST_MASK: readonly number[] = (() => {
    const m = new Array<number>(LIFE_COUNT).fill(0);
    for (const [c, s] of COMET_LOST) m[c] |= 1 << s;
    m[Life.Dinosaur] = (1 << SUBSPECIES_PER_CLASS) - 1;
    return m;
  })();

  /** Did the comet end sub-species `stage` of class `c` for good? Every dinosaur, and the COMET_LOST. */
  export function cometLost(world: WorldState, c: Life, stage: number): boolean {
    return world.dinoEra.fate === 'extinct' && (COMET_LOST_MASK[c] & (1 << stage)) !== 0;
  }

  /** "Flugsaurier, Ammoniten, Belemniten und Zahnvögel": the comet's victims beside the dinosaurs. */
  export function cometLostNames(): string {
    const names = COMET_LOST.map(([c, s]) => subspeciesName(c, s));
    return `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`;
  }

  /** Steps the era bars until the comet has struck. */
  export const DINO_ERA_BARRED_STEPS: readonly string[] = ['whales', 'grazers'];

  /** The era's bars hold: mammals stop at the marsupials, whales and grazers wait. */
  export function dinoEraHolds(world: WorldState): boolean {
    const f = world.dinoEra.fate;
    return f !== 'extinct' && f !== 'exempt';
  }

  /** The choice is waiting or the comet is on its way: time stands still until it is settled. */
  export function dinoEraHoldsTime(world: WorldState): boolean {
    const f = world.dinoEra.fate;
    return f === 'deciding' || f === 'impactPending';
  }

  /** Highest sub-species a class may climb to on this planet now. */
  export function stageCap(world: WorldState, c: Life): number {
    return c === Life.Mammal && dinoEraHolds(world) ? MAMMAL_STAGE_BEFORE_COMET : SUBSPECIES_PER_CLASS - 1;
  }

  /** Why the era bars an evolution step now, or ''. */
  export function dinoEraStepBar(world: WorldState, id: string): string {
    if (id === 'dinosaurs' && world.dinoEra.fate === 'extinct') {
      return 'Der Komet hat die Dinosaurier auf diesem Planeten für immer ausgelöscht.';
    }
    if (!DINO_ERA_BARRED_STEPS.includes(id) || !dinoEraHolds(world)) return '';
    const name = evoNode(id).name;
    return world.dinoEra.fate === 'kept'
      ? `Die Dinosaurier haben überlebt: Auf diesem Planeten bleiben ${name} gesperrt.`
      : `Spielregel: ${name} bleiben gesperrt, bis ein Komet die Zeit der Dinosaurier beendet.`;
  }

  /**
   * Why class `c` may not take hold on this planet now, or ''. The one check
   * founding, the placement tool and every migration pass through.
   */
  export function dinoEraLifeBar(world: WorldState, c: Life): string {
    const node = nodeForLife(c);
    return node ? dinoEraStepBar(world, node.id) : '';
  }

  /** What the mammals' entries say about the stages the era holds back. */
  export function mammalCapNote(world: WorldState): string {
    if (!dinoEraHolds(world)) return '';
    const top = `Unterart ${MAMMAL_STAGE_BEFORE_COMET + 1} (${subspeciesName(Life.Mammal, MAMMAL_STAGE_BEFORE_COMET)})`;
    return world.dinoEra.fate === 'kept'
      ? `Die Dinosaurier haben überlebt: Säugetiere entwickeln sich auf diesem Planeten nur bis ${top}.`
      : `Spielregel: Säugetiere entwickeln sich nur bis ${top}. Ab Unterart ${MAMMAL_STAGE_BEFORE_COMET + 2} müssen die Dinosaurier durch einen Kometen ausgestorben sein.`;
  }

  /** A step was just developed: the first birds put the dinosaurs' fate to the player. */
  export function dinoEraOnDeveloped(world: WorldState, id: string): void {
    if (id === 'birds' && world.dinoEra.fate === 'open') world.dinoEra.fate = 'deciding';
  }
}
