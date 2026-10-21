/* =============================================================================
 * SimEarth 2.0 — plant groups that are outgrown: the giant clubmosses and others
 * -----------------------------------------------------------------------------
 * One table says which plant groups later ones displace (FLORA_DISPLACEMENT).
 * Descent comes first: a group is only pressed once every daughter group of
 * it in the tree has arisen, so no line is cut off before it began. Then, on
 * a tile where a rival grows, it keeps only its niche, or next to nothing;
 * while few are left, river banks count as a niche too, so the rivals never
 * finish it off by themselves. Once the rivals lead `endShare` of the land
 * its era is over for good:
 *
 *   herbs  the giant clubmosses (Lepidodendron, Sigillaria) of the coal swamps
 *          live on as the small, herbaceous clubmosses of today: no longer
 *          woody, low cover, not drawn on the map, still in the Examine window
 *   gone   the early vascular plants (Cooksonia) and the first trees
 *          (Archaeopteris) die out: they die back wherever they still grow
 *          and their ground goes to the plants around them
 *
 * While the giants live their spores drift over the whole planet, so they
 * reach every warm wetland, not only the one they were founded in.
 * ========================================================================== */

namespace SE {
  const CLUBMOSS = floraBit(Flora.Clubmosses);
  /** Seed-plant trees that outgrow the clubmosses. Seed ferns and cycads shared the coal swamps with them. */
  export const CLUBMOSS_RIVALS = floraBit(Flora.Conifers) | floraBit(Flora.Broadleaf);
  const HERB_WOODY_MASK = WOODY_FLORA_MASK & ~CLUBMOSS;

  export interface FloraDisplacement {
    readonly group: Flora;
    /** Groups that outgrow it. */
    readonly rivals: number;
    /** Its last niche among the rivals, if it has one. */
    readonly niche?: (world: WorldState, i: number) => boolean;
    /** Share of the land the rivals must lead before its era is over. */
    readonly endShare: number;
    /** What is left of it afterwards. */
    readonly after: 'herbs' | 'gone';
    readonly key: string;
    readonly title: string;
    readonly text: string;
    readonly change: string;
  }

  export const FLORA_DISPLACEMENT: readonly FloraDisplacement[] = [
    {
      group: Flora.Clubmosses, rivals: CLUBMOSS_RIVALS, niche: (w, i) => FloraSystem.isWetland(w, i),
      endShare: LYCOPSID_END_FOREST_SHARE, after: 'herbs', key: 'lycopsids:gone',
      title: 'Die Schuppenbäume verschwinden',
      text: 'Nadel- und Laubwälder haben die baumhohen Bärlappe verdrängt. Ihre Verwandten überleben als kleine, krautige Bärlappe in feuchten Nischen.',
      change: 'Bärlappe wachsen nur noch als niedrige Kräuter in Feuchtgebieten. Neue Sümpfe bilden viel weniger Kohle.',
    },
    {
      group: Flora.Vascular, rivals: floraBit(Flora.Ferns) | floraBit(Flora.Clubmosses) | floraBit(Flora.FirstTrees),
      endShare: FLORA_GONE_SHARE, after: 'gone', key: 'flora-end:vascular',
      title: 'Frühe Gefäßpflanzen ausgestorben',
      text: 'Farne, Bärlappe und Urbäume haben die blattlosen Gefäßpflanzen wie Cooksonia abgelöst.',
      change: 'Ihre Standorte gehen an ihre Nachfahren. Ausgestorbene Pflanzengruppen kehren nicht zurück.',
    },
    {
      group: Flora.FirstTrees, rivals: floraBit(Flora.SeedPlants) | floraBit(Flora.Conifers) | floraBit(Flora.Broadleaf),
      endShare: FLORA_GONE_SHARE, after: 'gone', key: 'flora-end:firstTrees',
      title: 'Urbäume ausgestorben',
      text: 'Samenpflanzen haben Archaeopteris und die ersten Wälder abgelöst: Samen brauchen kein Wasser zur Befruchtung.',
      change: 'Ihre Wälder gehen an Samenpflanzen und Nadelbäume. Ausgestorbene Pflanzengruppen kehren nicht zurück.',
    },
  ];

  const DISPLACED: (FloraDisplacement | undefined)[] = [];
  for (const d of FLORA_DISPLACEMENT) DISPLACED[d.group] = d;

  /** Has group g's era ended for good? */
  export function floraEnded(world: WorldState, g: Flora): boolean {
    return (world.floraEnded & floraBit(g)) !== 0;
  }

  /** Has group g died out for good — not only lost its giants? */
  export function floraGone(world: WorldState, g: Flora): boolean {
    return floraEnded(world, g) && DISPLACED[g]?.after === 'gone';
  }

  /** Tree ids of each group's daughters, filled on first use (the tree is defined after this file). */
  const DAUGHTERS: string[][] = [];

  /** Every daughter group of g in the tree has arisen: pressing or ending g cuts off no line. */
  function daughtersArisen(world: WorldState, g: Flora): boolean {
    if (DAUGHTERS.length === 0) {
      for (let k = 0; k < FLORA_COUNT; k++) DAUGHTERS.push(EVO_NODES.filter((n) => n.parent === FLORA[k as Flora].id).map((n) => n.id));
    }
    return DAUGHTERS[g].every((id) => world.evo.isDeveloped(id));
  }

  /**
   * Factor on group g's suitability of tile i: 1 without rivals there or
   * while its daughters have yet to arise, else its niche or next to nothing,
   * 0 once it has died out.
   */
  export function floraCompetition(world: WorldState, g: Flora, i: number): number {
    const d = DISPLACED[g];
    if (!d) return 1;
    if (d.after === 'gone' && floraEnded(world, g)) return 0;
    if ((world.flora[i] & d.rivals) === 0 || !daughtersArisen(world, g)) return 1;
    if (d.niche?.(world, i)) return CLUBMOSS_NICHE;
    const refuge = world.floraCounts[g] < CLUBMOSS_REFUGE_TILES &&
      (world.riverLevel[i] > 0 || world.riparian[i] > 0);
    return refuge ? CLUBMOSS_NICHE : CLUBMOSS_OUTCOMPETED;
  }

  /** "Farne & Schachtelhalme, Bärlapppflanzen und Urbäume": the groups that displaced g. */
  export function floraRivalNames(g: Flora): string {
    const by: string[] = [];
    const rivals = DISPLACED[g]?.rivals ?? 0;
    for (let k = 1; k < FLORA_COUNT; k++) if (rivals & floraBit(k as Flora)) by.push(FLORA[k as Flora].name);
    return by.length > 1 ? `${by.slice(0, -1).join(', ')} und ${by[by.length - 1]}` : by[0] ?? '';
  }

  /** Why group g no longer grows anywhere, for the planting tool; null while it can. */
  export function floraGoneReason(world: WorldState, g: Flora): string | null {
    return floraGone(world, g) ? `für immer ausgestorben – abgelöst durch ${floraRivalNames(g)}` : null;
  }

  /** Do giant clubmosses grow on tile i without rivals? */
  export function isLycopsidSwamp(world: WorldState, i: number): boolean {
    return !world.lycopsidsGone && (world.flora[i] & (CLUBMOSS | CLUBMOSS_RIVALS)) === CLUBMOSS;
  }

  /** The densest cover group g sustains on this planet: the clubmosses stay low once the giants are gone. */
  export function floraStature(world: WorldState, g: Flora): number {
    return g === Flora.Clubmosses && world.lycopsidsGone ? CLUBMOSS_HERB_STATURE : FLORA[g].stature;
  }

  /** Groups that form woodland on this planet: the clubmosses only while the giants live. */
  export function woodyFloraMask(world: WorldState): number {
    return world.lycopsidsGone ? HERB_WOODY_MASK : WOODY_FLORA_MASK;
  }

  /** Plant groups the map draws: no clubmosses once only the small ones are left. */
  export function mapFloraMask(world: WorldState): number {
    return world.lycopsidsGone ? ~CLUBMOSS : ~0;
  }

  /** Spores on the wind: while the giants live, a suitable tile anywhere on the planet may catch them. */
  export function clubmossSpores(world: WorldState, flora: FloraSystem, present: number): void {
    if (world.lycopsidsGone || (present & CLUBMOSS) === 0) return;
    const rng = world.rng;
    for (let n = 0; n < CLUBMOSS_SPORE_SAMPLES; n++) {
      const j = rng.int(TILE_COUNT);
      if ((world.flora[j] & CLUBMOSS) !== 0 || !rng.chance(CLUBMOSS_SPORE_CHANCE)) continue;
      if (flora.suit(world, Flora.Clubmosses, j) < CLUBMOSS_SPORE_SUIT) continue;
      world.flora[j] |= CLUBMOSS;
      if (world.vegetation[j] < 0.02) world.vegetation[j] = 0.02;
    }
  }

  /** Share of the land tiles that groups in `rivals` lead. */
  export function rivalShare(world: WorldState, rivals: number): number {
    let land = 0;
    let led = 0;
    for (let i = 0; i < TILE_COUNT; i++) {
      if (world.elevation[i] < 0) continue;
      land++;
      if ((floraBit(world.floraTop[i] as Flora) & rivals) !== 0) led++;
    }
    return land > 0 ? led / land : 0;
  }

  /** Share of the land tiles that conifers or broadleaf trees lead. */
  export function rivalForestShare(world: WorldState): number {
    return rivalShare(world, CLUBMOSS_RIVALS);
  }

  /** End an era for good once the rivals lead enough of the land. */
  export function updateFloraEras(world: WorldState, present: number): void {
    for (const d of FLORA_DISPLACEMENT) {
      if (floraEnded(world, d.group) || (present & d.rivals) === 0) continue;
      if (!daughtersArisen(world, d.group) || rivalShare(world, d.rivals) < d.endShare) continue;
      world.floraEnded |= floraBit(d.group);
    }
  }

  /** The chronicle entries for the ended eras, once each; a group gone for good gets its R.I.P. */
  export function lycopsidMilestones(world: WorldState): ChronicleEntry[] {
    const out: ChronicleEntry[] = [];
    for (const d of FLORA_DISPLACEMENT) {
      if (!floraEnded(world, d.group) || world.evo.chronicle.some((e) => e.key === d.key)) continue;
      const gone = d.after === 'gone';
      out.push({
        key: d.key, kind: gone ? 'extinction' : 'milestone', nodeId: gone ? FLORA[d.group].id : undefined,
        title: d.title, text: d.text, change: d.change,
        icon: evoIcon(FLORA[d.group].id), tick: world.ticks, years: world.absoluteYears, major: false,
        rip: gone || undefined,
      });
    }
    return out;
  }
}
