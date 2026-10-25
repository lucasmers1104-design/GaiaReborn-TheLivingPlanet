/* =============================================================================
 * Gaia Reborn — extinction for good on hard
 * -----------------------------------------------------------------------------
 * When a developed animal class or plant group vanishes from the planet, the
 * player has DIFFICULTY_CONFIG.extinction.graceTicks to settle it again. If
 * not, it is gone for good: the tools refuse it, its successors in the tree
 * stay barred, and the chronicle gives it its R.I.P. The first cells, the
 * plant groups their rivals displace (lycopsids.ts) and the comet's
 * dinosaurs (dinoera.ts) follow their own rules and are left out.
 * ========================================================================== */

namespace SE {
  export function hardLifeLost(world: WorldState, c: Life): boolean {
    return (world.difficulty.lifeLost & (1 << c)) !== 0;
  }

  /** Has step n's group died out for good on hard? */
  export function hardStepLost(world: WorldState, n: EvoNode): boolean {
    if (n.life !== undefined) return hardLifeLost(world, n.life);
    return n.flora !== undefined && (world.difficulty.floraLost & floraBit(n.flora)) !== 0;
  }

  /** Why the tools refuse step n's group, or ''. */
  export function hardLostReason(world: WorldState, n: EvoNode): string {
    return hardStepLost(world, n) ? `${n.name} sind für immer ausgestorben und kehren nie zurück.` : '';
  }

  /** Does vanishing from the planet put step n's group at risk of dying out for good? */
  export function hardExtinctionWatches(world: WorldState, n: EvoNode): boolean {
    if (difficultyConfig(world).extinction.graceTicks <= 0) return false;
    if (n.life !== undefined) return n.life !== Life.Prokaryote && n.life !== Life.Eukaryote && dinoEraLifeBar(world, n.life) === '';
    return n.flora !== undefined && !floraGone(world, n.flora);
  }

  /** Once a tick: grace periods, warnings and R.I.P. for classes and plant groups gone from the planet. */
  export function stepHardExtinctions(world: WorldState, notes: SimNote[], evolution: EvolutionSystem): void {
    const grace = difficultyConfig(world).extinction.graceTicks;
    if (grace <= 0) return;
    const d = world.difficulty;
    for (const id of world.evo.developed.keys()) {
      const n = evoNode(id);
      const until = d.graceUntil[id];
      if (hardStepLost(world, n) || !hardExtinctionWatches(world, n)) {
        if (until !== undefined) delete d.graceUntil[id];
        continue;
      }
      if (evolution.presence(world, n) > 0) {
        if (until === undefined) continue;
        delete d.graceUntil[id];
        notes.push({ kind: 'message', tone: 'ok', text: `Gerettet: Die ${n.name} leben wieder auf dem Planeten.` });
        continue;
      }
      if (until === undefined) {
        d.graceUntil[id] = world.ticks + grace;
        const span = formatYearsAmount(grace * world.yearsPerTick);
        notes.push({
          kind: 'message', tone: 'warn',
          text: `Aussterbe-Warnung: Die ${n.name} sind vom Planeten verschwunden! Siedle sie in den nächsten ${span} Jahren wieder an, sonst sterben sie für immer aus.`,
        });
        continue;
      }
      if (world.ticks < until) continue;
      delete d.graceUntil[id];
      if (n.life !== undefined) d.lifeLost |= 1 << n.life;
      else d.floraLost |= floraBit(n.flora as Flora);
      evolution.record(world, {
        key: `hard-extinct:${id}`, kind: 'extinction', nodeId: id,
        title: `${n.name} für immer ausgestorben`,
        text: 'Sie wurden nicht rechtzeitig wieder angesiedelt. Ausgestorbene Gruppen kehren nicht zurück.',
        change: 'Sie lassen sich nicht mehr ansiedeln, und was im Evolutionsbaum aus ihnen hervorgeht, bleibt gesperrt.',
        icon: evoIcon(id), tick: world.ticks, years: world.absoluteYears, major: false, rip: true,
      });
    }
  }

  /* -------------------------------------------------------------- save -- */

  /** Part of the difficulty's save field: ids gone for good, ticks left of each grace period. */
  export function hardExtinctionToJSON(world: WorldState): unknown {
    const d = world.difficulty;
    const life: string[] = [];
    const flora: string[] = [];
    for (let c = 1; c < LIFE_COUNT; c++) if (hardLifeLost(world, c as Life)) life.push(LIFE[c as Life].id);
    for (let g = 1; g < FLORA_COUNT; g++) if (d.floraLost & floraBit(g as Flora)) flora.push(FLORA[g as Flora].id);
    const grace: Record<string, number> = {};
    for (const id of Object.keys(d.graceUntil)) grace[id] = d.graceUntil[id] - world.ticks;
    return { life, flora, grace };
  }

  /** After the level and world.ticks are restored; unknown ids and bad numbers are dropped. */
  export function restoreHardExtinction(world: WorldState, raw: unknown): void {
    const max = difficultyConfig(world).extinction.graceTicks;
    if (max <= 0 || typeof raw !== 'object' || raw === null) return;
    const d = world.difficulty;
    const r = raw as Record<string, unknown>;
    const listed = (list: unknown, id: string): boolean => Array.isArray(list) && list.includes(id);
    for (let c = Life.Eukaryote + 1; c < LIFE_COUNT; c++) if (listed(r.life, LIFE[c as Life].id)) d.lifeLost |= 1 << c;
    for (let g = 1; g < FLORA_COUNT; g++) if (listed(r.flora, FLORA[g as Flora].id)) d.floraLost |= floraBit(g as Flora);
    const grace = typeof r.grace === 'object' && r.grace !== null ? r.grace as Record<string, unknown> : {};
    for (const [id, left] of Object.entries(grace)) {
      const n = EVO_BY_ID.get(id);
      if (!n || (n.life === undefined && n.flora === undefined) || typeof left !== 'number' || !Number.isFinite(left)) continue;
      d.graceUntil[id] = world.ticks + Math.max(0, Math.min(max, Math.round(left)));
    }
  }
}
