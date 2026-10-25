/* =============================================================================
 * SimEarth 2.0 — sub-species that die out for good
 * -----------------------------------------------------------------------------
 * Sub-species whose kind is extinct on Earth name a later sub-species of
 * their class as successor (STAGE_SUCCESSORS). Once the successor and those
 * after it hold STAGE_SUCCESSOR_TILES tiles between them, the older one is
 * gone for good: its populations pass to the successor, climbing skips it
 * and founders start past it. With the comet's losses (dinoera.ts) these are
 * the sub-species the lexicon marks R.I.P. Only ecology decides when; no
 * Earth date is read.
 * ========================================================================== */

namespace SE {
  const N = SUBSPECIES_PER_CLASS;

  /**
   * [class, sub-species, successor]. Only kinds that are extinct on Earth;
   * Vasenamöben and Stummelfüßer, for one, have living relatives of that name.
   */
  const STAGE_SUCCESSORS: readonly (readonly [Life, number, number])[] = [
    [Life.Prokaryote, 0, 1], // Urzellen → Archaeen
    [Life.Radiate, 1, 3], [Life.Radiate, 2, 3], // Ediacara-Wedel, Dickinsonien → Becherschwämme
    [Life.Radiate, 3, 6], // Becherschwämme → Runzelkorallen
    [Life.Radiate, 6, 7], // Runzelkorallen → Steinkorallen
    [Life.Bilateria, 0, 2], [Life.Bilateria, 1, 2], // Urwürmer, Kalkröhrchen → Priapswürmer
    [Life.Arthropod, 1, 2], // Anomalocariden → Seeskorpione
    [Life.Arthropod, 0, 5], [Life.Arthropod, 2, 5], // Trilobiten, Seeskorpione → Zehnfußkrebse
    [Life.Mollusc, 0, 2], // Urschnecken → Käferschnecken
    [Life.Mollusc, 3, 4], // Orthoceren → Ammoniten
    [Life.Fish, 1, 4], [Life.Fish, 2, 4], // Kopfschildfische, Panzerfische → Haie
    [Life.Cetacean, 0, 4], [Life.Cetacean, 1, 4], [Life.Cetacean, 2, 4], [Life.Cetacean, 3, 4], // Urwale … Basilosaurier → Bartenwale
    [Life.Insect, 1, 5], [Life.Insect, 2, 5], // Urflügler, Riesenlibellen → Käfer
    [Life.Amphibian, 0, 1], [Life.Amphibian, 1, 2], // Tiktaalik → Ichthyostega → Panzerlurche
    [Life.Amphibian, 2, 5], // Panzerlurche → Frösche
    [Life.Amphibian, 3, 4], // Diplocaulus → Salamander
    [Life.Reptile, 0, 3], [Life.Reptile, 1, 3], [Life.Reptile, 2, 3], // Ursaurier, Pareiasaurier, Gleitechsen → Schildkröten
    [Life.Dinosaur, 0, 1], [Life.Dinosaur, 1, 2], // Urdinosaurier → Plateosaurier → Sauropoden
    [Life.Dinosaur, 3, 5], // Kammsaurier → Megalosaurier
    [Life.Avian, 0, 1], [Life.Avian, 1, 2], // Archaeopteryx → Konfuziusvögel → Zahnvögel
    [Life.Mammal, 0, 3], [Life.Mammal, 1, 3], // Ursäuger, Gleitsäuger → Beuteltiere
    [Life.Grazer, 0, 5], // Urpferde → Pferde
    [Life.Grazer, 1, 2], // Brontotherien → Riesennashörner
    [Life.Grazer, 2, 4], // Riesennashörner → Antilopen
  ];
  const SUCCESSOR: readonly Int8Array[] = (() => {
    const t = Array.from({ length: LIFE_COUNT }, () => new Int8Array(N).fill(-1));
    for (const [c, s, e] of STAGE_SUCCESSORS) t[c][s] = e;
    return t;
  })();

  /** The later sub-species that ends sub-species s of class c, or -1. */
  export function stageSuccessor(c: Life, s: number): number {
    return SUCCESSOR[c][s];
  }

  export function stageEnded(world: WorldState, c: Life, s: number): boolean {
    return ((world.stageEnded[c] >> s) & 1) === 1;
  }

  /** Gone for good: displaced by its successor, or ended by the comet. */
  export function stageGone(world: WorldState, c: Life, s: number): boolean {
    return stageEnded(world, c, s) || cometLost(world, c, s) || hardLifeLost(world, c);
  }

  /** Where founders of class c start: its oldest sub-species not gone for good. */
  export function firstStage(world: WorldState, c: Life): number {
    for (let s = 0; s < N; s++) if (!stageGone(world, c, s)) return s;
    return 0;
  }

  function names(c: Life, stages: readonly number[]): string {
    const out = stages.map((s) => subspeciesName(c, s));
    return out.length > 1 ? `${out.slice(0, -1).join(', ')} und ${out[out.length - 1]}` : out[0];
  }

  /** End the sub-species whose successors have spread. One chronicle entry per class and successor. */
  export function stepFates(world: WorldState): ChronicleEntry[] {
    const out: ChronicleEntry[] = [];
    const counts = world.lifeStageCounts;
    for (let c = 1; c < LIFE_COUNT; c++) {
      const cls = c as Life;
      let ending = 0;
      for (let s = 0; s < N; s++) {
        const e = SUCCESSOR[c][s];
        if (e < 0 || stageGone(world, cls, s)) continue;
        let spread = 0;
        for (let t = e; t < N; t++) spread += counts[c * N + t];
        if (spread >= STAGE_SUCCESSOR_TILES) ending |= 1 << s;
      }
      if (ending === 0) continue;
      // Populations pass to the successor, or the next sub-species after it that lives.
      const heir = new Array<number>(N).fill(-1);
      for (let s = 0; s < N; s++) {
        if (((ending >> s) & 1) === 0) continue;
        for (let t = SUCCESSOR[c][s]; t < N && heir[s] < 0; t++) {
          if (counts[c * N + t] > 0 && !stageGone(world, cls, t) && ((ending >> t) & 1) === 0) heir[s] = t;
        }
        if (heir[s] < 0) ending &= ~(1 << s);
      }
      if (ending === 0) continue;
      world.stageEnded[c] |= ending;
      for (let i = 0; i < TILE_COUNT; i++) {
        const k = i * LIFE_COUNT + c;
        if (world.lifeDensity[k] > 0 && ((ending >> world.lifeStage[k]) & 1) === 1) world.lifeStage[k] = heir[world.lifeStage[k]];
      }
      for (let e = 0; e < N; e++) {
        const ended: number[] = [];
        for (let s = 0; s < N; s++) if (((ending >> s) & 1) === 1 && SUCCESSOR[c][s] === e) ended.push(s);
        if (ended.length === 0) continue;
        const by = subspeciesName(cls, e);
        out.push({
          key: `stage-end:${LIFE[cls].id}:${ended[0]}`, kind: 'extinction', nodeId: LIFE[cls].id,
          title: `${names(cls, ended)} ausgestorben`,
          text: `Abgelöst durch ${by}. Ausgestorbene Unterarten kehren nicht zurück.`,
          change: `Ihre Lebensräume gehen an ${by}.`,
          icon: evoIcon(LIFE[cls].id), tick: world.ticks, years: world.absoluteYears, major: false,
          rip: true, stage: ended[0],
        });
      }
    }
    if (out.length > 0) world.refreshDerived();
    return out;
  }

  /* -------------------------------------------------------------- save -- */

  /**
   * Optional save field: the sub-species and plant groups gone for good. The
   * giant clubmosses keep their own flag in the coal field. A save without it
   * learns them on its first tick, quietly (EvolutionSystem.step).
   */
  export function fatesToJSON(world: WorldState): unknown {
    const stages: Record<string, number> = {};
    for (let c = 1; c < LIFE_COUNT; c++) if (world.stageEnded[c]) stages[LIFE[c as Life].id] = world.stageEnded[c];
    const flora: string[] = [];
    for (let g = 1; g < FLORA_COUNT; g++) if (floraGone(world, g as Flora)) flora.push(FLORA[g as Flora].id);
    return { stages, flora };
  }

  /** After restoreCoal, which sets the clubmosses' flag. */
  export function restoreFates(world: WorldState, raw: unknown): void {
    world.stageEnded.fill(0);
    world.floraEnded &= floraBit(Flora.Clubmosses);
    if (typeof raw !== 'object' || raw === null) {
      world.fatesQuiet = true;
      return;
    }
    const r = raw as Record<string, unknown>;
    if (Array.isArray(r.flora)) {
      for (const d of FLORA_DISPLACEMENT) {
        if (d.after === 'gone' && r.flora.includes(FLORA[d.group].id)) world.floraEnded |= floraBit(d.group);
      }
    }
    const stages = typeof r.stages === 'object' && r.stages !== null ? r.stages as Record<string, unknown> : {};
    for (let c = 1; c < LIFE_COUNT; c++) {
      const v = stages[LIFE[c as Life].id];
      if (typeof v === 'number' && Number.isInteger(v)) world.stageEnded[c] = v & ((1 << N) - 1);
    }
  }
}
