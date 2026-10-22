/* =============================================================================
 * SimEarth 2.0 — the end of the dinosaurs' era: the choice and the comet
 * -----------------------------------------------------------------------------
 * The player answers the question the first birds put (dinoera.ts): the
 * dinosaurs live on, or a comet strikes. The strike is a meteor of
 * COMET_STRENGTH through the hazard rules (crater, blast rings, scars), and
 * on top of it the era ends: every non-avian dinosaur dies with the other
 * sub-species the end of the Cretaceous took (dinoera.ts), the other groups
 * lose COMET_LOSS of their stock (more near the crater), each of their
 * sub-species keeps one sheltered population until it can grow again, and
 * the era's bars fall. All of it happens in one call that first moves the
 * fate on, so it can never run twice — whatever the show, a double click or
 * a reload does. Deterministic: the site and every loss come from hashes.
 * ========================================================================== */

namespace SE {
  /** A comet's crater lies wholly on land, this far from the poles. */
  const COMET_LAT_MARGIN = 0.15;
  /** Box (tiles round the crater) whose land and dinosaurs make a site a good one. */
  const SITE_REACH = 4;

  /** Distance from tile i's centre to the point (cx, cy), in tiles, on the wrapping map. */
  function distanceTo(i: number, cx: number, cy: number): number {
    const dx = Math.abs((i % GRID_W) - cx);
    return Math.hypot(Math.min(dx, GRID_W - dx), Math.floor(i / GRID_W) - cy);
  }

  /**
   * Where the comet strikes: the upper left tile of a 2 × 2 block of land
   * away from the poles, inland and among dinosaurs if the planet allows it.
   * Ties go to a hash of the seed, so a planet always gets the same site.
   */
  export function cometSite(world: WorldState): number {
    const y0 = Math.round(GRID_H * COMET_LAT_MARGIN);
    const y1 = Math.round(GRID_H * (1 - COMET_LAT_MARGIN)) - 1;
    const land = (x: number, y: number): boolean => !world.isWater(idx(wrapX(x), y));
    let best = -1;
    let bestScore = -Infinity;
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (!land(x, y) || !land(x + 1, y) || !land(x, y + 1) || !land(x + 1, y + 1)) continue;
        let ground = 0;
        let dinos = 0;
        for (let dy = -SITE_REACH; dy <= SITE_REACH + 1; dy++) {
          const ty = y + dy;
          if (ty < 0 || ty >= GRID_H) continue;
          for (let dx = -SITE_REACH; dx <= SITE_REACH + 1; dx++) {
            const j = idx(wrapX(x + dx), ty);
            if (world.isWater(j)) continue;
            ground++;
            dinos += world.lifeDensity[j * LIFE_COUNT + Life.Dinosaur];
          }
        }
        const i = idx(x, y);
        const score = ground + 4 * dinos + hazardRoll(world.seed, i, 0xc0e7);
        if (score > bestScore) { bestScore = score; best = i; }
      }
    }
    // A planet without such a block: any land tile, else its centre.
    if (best < 0) for (let i = 0; i < TILE_COUNT && best < 0; i++) if (!world.isWater(i)) best = i;
    return best >= 0 ? best : idx(GRID_W >> 1, GRID_H >> 1);
  }

  /**
   * The player's answer, taken only while the question stands: 'survive'
   * keeps the dinosaurs for good, 'comet' fixes where the comet will strike.
   * False if nothing is being asked (a second click, a stale dialog).
   */
  export function chooseDinoFate(world: WorldState, evolution: EvolutionSystem, choice: 'survive' | 'comet'): boolean {
    const era = world.dinoEra;
    if (era.fate !== 'deciding') return false;
    if (choice === 'survive') {
      era.fate = 'kept';
      evolution.record(world, {
        key: 'dinofate:kept', kind: 'milestone', title: 'Die Dinosaurier bleiben',
        text: 'Kein Komet trifft den Planeten. Die Zeit der Dinosaurier geht weiter.',
        change: `Säugetiere entwickeln sich auf diesem Planeten höchstens bis zu den ${subspeciesName(Life.Mammal, MAMMAL_STAGE_BEFORE_COMET)}; Wale sowie Huftiere & Weidetiere bleiben gesperrt.`,
        icon: 'assets/events/milestone.svg', tick: world.ticks, years: world.absoluteYears, major: false,
      });
      return true;
    }
    era.target = cometSite(world);
    era.fate = 'impactPending';
    return true;
  }

  /**
   * Let the chosen comet strike, once: crater and blast through the hazard
   * rules, then the end of the era. Null, and nothing changed, unless a
   * strike is pending. The caller refreshes rivers, cities and views.
   */
  export function applyComet(world: WorldState, params: ModelParams, life: LifeSystem, hazards: HazardSystem, evolution: EvolutionSystem): Hazard | null {
    const era = world.dinoEra;
    if (era.fate !== 'impactPending') return null;
    if (!(era.target >= 0 && era.target < TILE_COUNT)) era.target = cometSite(world);
    // First of all, so that nothing below can ever run a second time.
    era.fate = 'extinct';
    era.struck = world.ticks;
    const x = era.target % GRID_W;
    const y = Math.floor(era.target / GRID_W);

    // The sky darkens as after a meteor; the winter's ice is drawn by
    // cometwinter.ts, not by more dust, which froze the planet for good.
    const h =hazards.start(world, EventKind.Meteor, x, y, 'player', COMET_STRENGTH);

    endCometLost(world);
    const civEnded = world.sentientClass === Life.Dinosaur && endDinosaurCivilization(world);
    cometLosses(world, params, life, x + (COMET_STRENGTH - 1) / 2, y + (COMET_STRENGTH - 1) / 2);
    world.refreshDerived();

    // The ordinary notice would offer to bring them back.
    world.evo.extinct.add('dinosaurs');
    const at = era.target;
    evolution.record(world, {
      key: 'comet:impact', kind: 'milestone', title: 'Der Komet schlägt ein',
      text: `Ein gewaltiger Komet trifft den Planeten. Staub verdunkelt den Himmel, und alle Dinosaurier außer den Vögeln sterben aus, ebenso ${cometLostNames()}. Auch die übrigen Tiere und Pflanzen verlieren den größten Teil ihrer Bestände.`,
      change: `Säugetiere entwickeln sich jetzt über die Beuteltiere hinaus, Wale sowie Huftiere & Weidetiere werden erreichbar. Dinosaurier, ${cometLostNames()} kehren nie zurück.`,
      icon: 'assets/events/meteor.svg', tick: world.ticks, years: world.absoluteYears, major: true, at,
    });
    evolution.record(world, {
      key: 'extinct:dinosaurs:comet', kind: 'extinction', nodeId: 'dinosaurs', title: 'Dinosaurier für immer ausgestorben',
      text: 'Nur ihre gefiederten Nachfahren, die Vögel, überleben den Einschlag.',
      change: 'Auf diesem Planeten können keine Dinosaurier mehr entstehen oder angesiedelt werden.',
      icon: evoIcon('dinosaurs'), tick: world.ticks, years: world.absoluteYears, major: false, at, rip: true,
    });
    if (civEnded) {
      evolution.record(world, {
        key: 'comet:civ', kind: 'civ', title: 'Die Zivilisation der Dinosaurier ist untergegangen',
        text: 'Mit den Dinosauriern sind auch ihre Städte verschwunden; nur Ruinen bleiben.',
        change: 'Eine andere Tiergruppe kann später Intelligenz entwickeln.',
        icon: 'assets/events/civilization.svg', tick: world.ticks, years: world.absoluteYears, major: false, at,
      });
    }
    evolution.refresh(world, params, true);
    return h;
  }

  /**
   * Every population the comet ends for good (cometLost) dies: all dinosaurs
   * and the other groups' lost sub-species. A group that lived only at lost
   * rungs keeps those populations one rung down instead, so no group but the
   * dinosaurs vanishes. Also run on loading a struck planet, whatever the file says.
   */
  export function endCometLost(world: WorldState): void {
    const L = LIFE_COUNT;
    for (let c = 1; c < L; c++) {
      let lost = false;
      let kept = false;
      for (let i = 0; i < TILE_COUNT && !kept; i++) {
        const k = i * L + c;
        if (world.lifeDensity[k] <= 0) continue;
        if (cometLost(world, c as Life, world.lifeStage[k])) lost = true;
        else kept = true;
      }
      if (!lost && !kept) continue;
      for (let i = 0; i < TILE_COUNT; i++) {
        const k = i * L + c;
        let s = world.lifeStage[k];
        if (world.lifeDensity[k] <= 0 || !cometLost(world, c as Life, s)) continue;
        if (kept || c === Life.Dinosaur) {
          world.lifeDensity[k] = 0;
          world.lifeStage[k] = 0;
        } else {
          while (s > 0 && stageGone(world, c as Life, s)) s--;
          world.lifeStage[k] = stageGone(world, c as Life, s) ? firstStage(world, c as Life) : s;
        }
      }
    }
  }

  /**
   * Intelligent dinosaurs die with their kind: their cities fall to ruins and
   * the planet goes back to the age of evolution, open to another mind.
   */
  function endDinosaurCivilization(world: WorldState): boolean {
    for (let i = 0; i < TILE_COUNT; i++) hazardHitCity(world, i, 1);
    world.civ.clear();
    world.civ.clearWorks();
    world.landUse.fill(0);
    world.sentientClass = Life.None;
    if (world.timeScale > TimeScale.Evolution) {
      world.timeScale = TimeScale.Evolution;
      world.scaleYears = 0;
    }
    return true;
  }

  /**
   * Every other group loses COMET_LOSS of its stock, more towards the
   * crater at (cx, cy). Then every sub-species of every animal group that
   * lived before gets one sheltered population (guardCometRefuges) on its
   * best-fed tile beyond COMET_NEAR and the winter's ice, and each plant group keeps its best
   * tile — never on a tile it did not hold, so no group appears that was
   * not there.
   */
  function cometLosses(world: WorldState, params: ModelParams, life: LifeSystem, cx: number, cy: number): void {
    const L = LIFE_COUNT;
    const d = world.lifeDensity;
    const before = d.slice();
    const stages = world.lifeStage.slice();
    const floraBefore = world.flora.slice();
    const near = new Uint8Array(TILE_COUNT);

    for (let i = 0; i < TILE_COUNT; i++) {
      const r = distanceTo(i, cx, cy);
      near[i] = r < COMET_NEAR ? 1 : 0;
      const base = COMET_LOSS + (hazardRoll(world.seed, i, 0xc0e8) * 2 - 1) * COMET_LOSS_JITTER;
      const loss = clamp(base + (COMET_NEAR_LOSS - base) * clamp(1 - r / COMET_NEAR, 0, 1), 0, 1);
      world.vegetation[i] *= 1 - loss;
      if (world.vegetation[i] < 0.002) world.vegetation[i] = 0;
      for (let c = 1; c < L; c++) {
        const k = i * L + c;
        if (d[k] <= 0) continue;
        const next = d[k] * (1 - loss);
        if (next < LifeSystem.MIN_DENSITY) {
          d[k] = 0;
          world.lifeStage[k] = 0;
        } else {
          d[k] = next;
        }
      }
    }
    world.refreshDerived();
    life.prepare(world, params, true);

    const refuges = world.dinoEra.refuges;
    refuges.length = 0;
    for (let c = 1; c < L; c++) {
      if (c === Life.Dinosaur) continue;
      for (let s = 0; s < SUBSPECIES_PER_CLASS; s++) {
        let best = -1;
        let bestScore = -Infinity;
        // Beyond the blast and the winter's ice if anywhere, then beyond the blast; a sub-species that lived only near it is sheltered there.
        for (let pass = 0; pass < 3 && best < 0; pass++) {
          for (let i = 0; i < TILE_COUNT; i++) {
            const k = i * L + c;
            if (before[k] <= 0 || stages[k] !== s || (pass < 2 && near[i]) || (pass === 0 && !cometIceSpares(world, i))) continue;
            const score = life.capacity(world, i, c as Life) + hazardRoll(world.seed, i, c * SUBSPECIES_PER_CLASS + s) * 1e-4;
            if (score > bestScore) { bestScore = score; best = i; }
          }
        }
        if (best >= 0) refuges.push({ tile: best, c: c as Life, stage: s, since: world.ticks });
      }
    }
    guardCometRefuges(world, life);

    for (let g = 1; g < FLORA_COUNT; g++) {
      const bit = 1 << g;
      let held = false;
      let refuge = -1;
      let far = -1;
      for (let i = 0; i < TILE_COUNT; i++) {
        if (world.flora[i] & bit) { held = true; break; }
        if (!(floraBefore[i] & bit)) continue;
        const r = distanceTo(i, cx, cy);
        if (r > far) { far = r; refuge = i; }
      }
      if (held || refuge < 0) continue;
      world.flora[refuge] |= bit;
      world.vegetation[refuge] = Math.max(world.vegetation[refuge], COMET_REFUGE_COVER);
    }
  }

  /**
   * Called by LifeSystem every tick once the losses are done: a sheltered
   * population cannot fall below COMET_REFUGE_DENSITY, and comes back at its
   * own sub-species if it died. Past the strike's winter its shelter ends
   * once the tile leaves it room to grow again (COMET_REFUGE_ROOM, rivals'
   * crowding included), after COMET_REFUGE_TICKS at the latest, or when its
   * tile is no home any more.
   */
  export function guardCometRefuges(world: WorldState, life: LifeSystem): void {
    const refuges = world.dinoEra.refuges;
    for (let n = refuges.length - 1; n >= 0; n--) {
      const r = refuges[n];
      const k = r.tile * LIFE_COUNT + r.c;
      const d = world.lifeDensity[k];
      const age = world.ticks - r.since;
      const free = age >= COMET_REFUGE_MIN_TICKS && cometIceShare(world) === 0 &&
        d >= COMET_REFUGE_DENSITY - 1e-6 && life.roomFor(world, r.tile, r.c) >= COMET_REFUGE_ROOM;
      if (free || age >= COMET_REFUGE_TICKS || world.isWater(r.tile) !== (LIFE[r.c].realm === 'sea') || stageGone(world, r.c, r.stage)) {
        refuges.splice(n, 1);
        continue;
      }
      if (d >= COMET_REFUGE_DENSITY) continue;
      world.lifeDensity[k] = COMET_REFUGE_DENSITY;
      if (d <= 0) world.lifeStage[k] = r.stage;
    }
  }
}
