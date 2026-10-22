/* =============================================================================
 * SimEarth 2.0 — conflicts
 * -----------------------------------------------------------------------------
 * Neighbouring cities of two peoples that run short of land go to war
 * (docs/zivilisation-spec.md §2.8): rarely, one conflict at a time on the
 * planet, then peace between the same two peoples for a while and a rest
 * for both against everyone, so no people wages war after war on its
 * neighbours in turn. The loser loses people and may be taken over or
 * destroyed. A people in the atomic age ends a war against one not there
 * yet with the bomb, and two atomic peoples may use it without one; after
 * the first bomb every people swears it off for good. Peace lives in memory
 * only, like every civilization record, and rests after a load.
 * ========================================================================== */

namespace SE {
  /** What became of the city that lost a conflict. */
  export type ConflictEnd = 'held' | 'taken' | 'destroyed';

  export interface AtomicStrike {
    readonly target: City;
    readonly by: Tribe;
    readonly on: Tribe;
  }

  /** Key of a pair of tribes in `CivState.peace`, either way round. */
  export function peaceKey(a: number, b: number): string {
    return a < b ? `${a}:${b}` : `${b}:${a}`;
  }

  /** Key of one tribe's rest against everyone in `CivState.peace`; it never clashes with a pair's. */
  export function restKey(t: number): string {
    return `${t}`;
  }

  function resting(civ: CivState, t: number, tick: number): boolean {
    return (civ.peace.get(restKey(t)) ?? 0) > tick;
  }

  /** After a war or a strike: peace for the pair, a rest for each, a pause for the planet. */
  function makePeace(world: WorldState, ta: number, tb: number): void {
    const civ = world.civ;
    civ.peace.set(peaceKey(ta, tb), world.ticks + CONFLICT_PEACE);
    civ.peace.set(restKey(ta), world.ticks + CONFLICT_TRIBE_REST);
    civ.peace.set(restKey(tb), world.ticks + CONFLICT_TRIBE_REST);
    civ.calmUntil = Math.max(civ.calmUntil, world.ticks + CONFLICT_GAP);
  }

  /**
   * A people's strength in a conflict between cities `a` and `b`: the people
   * of its cities within CIV_NEIGHBOUR_DIST of either, each weighted by its
   * tech level. A great people outweighs a small one at the front, so the
   * outcome follows the balance of power there instead of two lone cities.
   */
  export function conflictStrength(world: WorldState, tribe: number, a: City, b: City): number {
    let s = 0;
    for (const c of world.civ.cities) {
      if (c.tribe !== tribe || (tileDistance(c.tile, a.tile) > CIV_NEIGHBOUR_DIST && tileDistance(c.tile, b.tile) > CIV_NEIGHBOUR_DIST)) continue;
      s += world.cityPop[c.tile] * (1 + CONFLICT_TECH_EDGE * world.tech[c.tile]);
    }
    return s;
  }

  /** Factor on the conflict chance: 1 + `CivSystem.aggression`, so about 1 at the default budget and 0 for a deeply peaceful one. */
  export function conflictFactor(params: ModelParams): number {
    return Math.max(0, 1 + CivSystem.aggression(params));
  }

  function scarce(c: City): boolean {
    return c.scarcity >= CONFLICT_SCARCITY;
  }

  /**
   * Pairs of cities that may go to war: two peoples at peace no longer and
   * neither resting, within CIV_NEIGHBOUR_DIST, one scarce and the other
   * scarce as well or full. Each pair once, as [attacker, city fought over];
   * the scarcer city attacks.
   */
  export function conflictPairs(world: WorldState): [City, City][] {
    const civ = world.civ;
    const out: [City, City][] = [];
    for (const a of civ.cities) {
      if (a.tribe < 0 || !scarce(a) || resting(civ, a.tribe, world.ticks)) continue;
      for (const b of civ.cities) {
        if (b.tribe < 0 || b.tribe === a.tribe || resting(civ, b.tribe, world.ticks)) continue;
        if (scarce(b)) {
          if (b.scarcity > a.scarcity || (b.scarcity === a.scarcity && b.id < a.id)) continue;
        } else if (world.cityPop[b.tile] <= CONFLICT_FULL * b.capacity) {
          continue;
        }
        if ((civ.peace.get(peaceKey(a.tribe, b.tribe)) ?? 0) > world.ticks) continue;
        if (tileDistance(a.tile, b.tile) > CIV_NEIGHBOUR_DIST) continue;
        out.push([a, b]);
      }
    }
    return out;
  }

  /** `a` goes to war over `b` for CONFLICT_TICKS; null if either has no people record. */
  export function startConflict(world: WorldState, a: City, b: City): Conflict | null {
    const civ = world.civ;
    const ta = civ.tribe(a.tribe);
    const tb = civ.tribe(b.tribe);
    if (!ta || !tb) return null;
    const [lo, hi] = CONFLICT_TICKS;
    const k: Conflict = {
      a: a.id, b: b.id, started: world.ticks, until: world.ticks + lo + world.rng.int(hi - lo + 1), sides: [ta, tb],
    };
    civ.conflicts.push(k);
    // A chronicle entry rather than a one-line message, which the next message would replace at once.
    civ.news.push({
      text: `Krieg zwischen den ${ta.name} (${a.name}) und den ${tb.name} (${b.name}).`, tone: 'warn', at: b.tile,
      chronicle: {
        key: `civ:war-start:${k.started}:${k.a}:${k.b}`, title: `Krieg zwischen den ${ta.name} und den ${tb.name}`,
        change: `${a.name} greift ${b.name} an. Beide verlieren Menschen, eine Stadt kann an das andere Volk fallen.`,
      },
    });
    return k;
  }

  function destroyCity(world: WorldState, c: City): void {
    const civ = world.civ;
    world.tech[c.tile] = Tech.None;
    world.cityPop[c.tile] = 0;
    civ.removeCity(c);
    for (let k = civ.outbreaks.length - 1; k >= 0; k--) if (civ.outbreaks[k].city === c.id) civ.outbreaks.splice(k, 1);
  }

  /**
   * End a conflict. `roll` (0..1) picks the winner, each people by its share
   * of the strength at the front (`conflictStrength`). The losing city loses
   * CONFLICT_LOSS of its people, the winning one CONFLICT_WIN_LOSS. The
   * losing city is destroyed below CONFLICT_RUIN_POP, else taken at
   * CONFLICT_TAKE_RATIO times the strength or below CONFLICT_TAKE_POP. Peace
   * and rest follow. Returns the outcome, or null when one city fell to
   * something else meanwhile.
   */
  export function settleConflict(world: WorldState, k: Conflict, roll: number): ConflictEnd | null {
    const civ = world.civ;
    const at = civ.conflicts.indexOf(k);
    if (at >= 0) civ.conflicts.splice(at, 1);
    const [ta, tb] = k.sides;
    makePeace(world, ta.id, tb.id);
    const both = `den ${ta.name} und den ${tb.name}`;
    const key = `civ:war:${k.started}:${k.a}:${k.b}`;
    const title = `Frieden zwischen ${both}`;
    const a = civ.city(k.a);
    const b = civ.city(k.b);
    if (!a || !b || a.tribe === b.tribe) {
      k.winner = -1;
      const near = b ?? a;
      civ.news.push({
        text: `${title}.`, tone: 'info', at: near ? near.tile : -1,
        chronicle: { key, title, change: 'Der Krieg endet ohne Sieger.' },
      });
      return null;
    }
    const sa = conflictStrength(world, a.tribe, a, b);
    const sb = conflictStrength(world, b.tribe, a, b);
    const aWins = sa + sb > 0 ? roll * (sa + sb) < sa : roll < 0.5;
    const [w, l, sw, sl] = aWins ? [a, b, sa, sb] : [b, a, sb, sa];
    const tw = aWins ? ta : tb;
    k.winner = tw.id;
    world.cityPop[w.tile] *= 1 - CONFLICT_WIN_LOSS;
    const rest = world.cityPop[l.tile] * (1 - CONFLICT_LOSS);
    let end: ConflictEnd = 'held';
    if (rest < CONFLICT_RUIN_POP) {
      destroyCity(world, l);
      end = 'destroyed';
    } else {
      world.cityPop[l.tile] = rest;
      if (sw >= CONFLICT_TAKE_RATIO * sl || rest < CONFLICT_TAKE_POP) {
        l.tribe = w.tribe;
        civ.revision++;
        end = 'taken';
      }
    }
    if (end !== 'held') updateTribes(world);
    // When the attack fails the attacker's own city is what is lost, so the message says so.
    const repelled = `Frieden: Die ${tb.name} wehren den Angriff der ${ta.name} ab`;
    const text = aWins ? {
      held: `${title}: ${b.name} hält stand.`,
      taken: `Frieden: Die ${ta.name} übernehmen ${b.name} von den ${tb.name}.`,
      destroyed: `${title}: ${b.name} wurde im Krieg zerstört.`,
    }[end] : {
      held: `${repelled}.`,
      taken: `${repelled} und übernehmen ${a.name}.`,
      destroyed: `${repelled}, ${a.name} wurde zerstört.`,
    }[end];
    const change = {
      held: 'Beide Völker haben Menschen verloren, die Grenze bleibt.',
      taken: `${l.name} gehört nun zu den ${tw.name}.`,
      destroyed: `${l.name} ist zerstört, das Land liegt wieder frei.`,
    }[end];
    civ.news.push({
      text, tone: end === 'held' ? 'info' : 'warn', at: end === 'held' ? b.tile : l.tile, chronicle: { key, title, change },
    });
    return end;
  }

  function atomicPower(world: WorldState, tribe: number): boolean {
    return world.civ.cities.some((c) => c.tribe === tribe && world.tech[c.tile] >= Tech.Atomic);
  }

  /** The bomb on `target` through `civEventSink`; peace and rest follow as after a war, and every people swears it off. */
  function dropBomb(world: WorldState, target: City, by: Tribe, on: Tribe): void {
    const civ = world.civ;
    makePeace(world, by.id, on.id);
    civ.atomBan = true;
    SE.civEventSink?.(EventKind.AtomicBomb, target.tile % GRID_W, Math.floor(target.tile / GRID_W));
    civ.news.push({
      text: `Nach dem Atomschlag auf ${target.name} schwören alle Völker, nie wieder Atomwaffen einzusetzen.`,
      tone: 'info', at: target.tile,
      chronicle: {
        key: `civ:atom-ban:${world.ticks}`, title: 'Alle Völker ächten die Atombombe',
        change: `Die ${by.name}, die ${on.name} und alle anderen Völker setzen nie wieder Atomwaffen ein.`, major: true,
      },
    });
  }

  /**
   * A war whose time is up between a people in the Atomic age and one not
   * there yet ends with the bomb on the other's city, unless the peoples
   * have sworn it off (`CivState.atomBan`). Null when it ends as usual.
   */
  export function atomicEnd(world: WorldState, k: Conflict): AtomicStrike | null {
    const civ = world.civ;
    if (civ.atomBan) return null;
    const a = civ.city(k.a);
    const b = civ.city(k.b);
    if (!a || !b || a.tribe === b.tribe) return null;
    const pa = atomicPower(world, a.tribe);
    if (pa === atomicPower(world, b.tribe)) return null;
    const [from, target] = pa ? [a, b] : [b, a];
    const by = civ.tribe(from.tribe);
    const on = civ.tribe(target.tribe);
    if (!by || !on) return null;
    k.winner = by.id;
    const at = civ.conflicts.indexOf(k);
    if (at >= 0) civ.conflicts.splice(at, 1);
    civ.news.push({
      text: `Atombombe auf ${target.name}! Die ${by.name} beenden den Krieg gegen die ${on.name}.`, tone: 'warn', at: target.tile,
      chronicle: {
        key: `civ:war:${k.started}:${k.a}:${k.b}`, title: `Atombombe auf ${target.name}`,
        change: `Die ${by.name} beenden den Krieg mit einer Atombombe. ${target.name} und das Leben ringsum sind zerstört.`,
        major: true,
      },
    });
    dropBomb(world, target, by, on);
    return { target, by, on };
  }

  /**
   * One tick: a conflict whose time is up ends (`atomicEnd`, else `settleConflict`); with none under way, past
   * `calmUntil` and between land peoples, a pair that may fight goes to war
   * with CONFLICT_CHANCE times the aggression factor.
   */
  export function stepConflicts(world: WorldState, params: ModelParams): void {
    const civ = world.civ;
    for (const k of civ.conflicts.slice()) {
      if (world.ticks >= k.until && !atomicEnd(world, k)) settleConflict(world, k, world.rng.next());
    }
    if (civ.conflicts.length > 0 || world.ticks < civ.calmUntil || !isLandLife(world.sentientClass)) return;
    const pairs = conflictPairs(world);
    if (pairs.length === 0 || !world.rng.chance(CONFLICT_CHANCE * conflictFactor(params))) return;
    const [a, b] = pairs[pairs.length > 1 ? world.rng.int(pairs.length) : 0];
    startConflict(world, a, b);
  }

  /**
   * The bomb (spec §2.8): two peoples with cities at the Atomic level or
   * higher, ATOMIC_WAR_CITIES of those in all, and a budget more warlike
   * than `CivSystem.PEACEFUL`. Never during a conflict, before `calmUntil`,
   * from or at a resting people or once the peoples have sworn it off. A
   * random atomic city fires at a random city of another atomic people
   * (`dropBomb`).
   */
  export function atomicWar(world: WorldState, params: ModelParams): AtomicStrike | null {
    const civ = world.civ;
    if (civ.atomBan || civ.conflicts.length > 0 || world.ticks < civ.calmUntil) return null;
    const atomic = civ.cities.filter((c) => world.tech[c.tile] >= Tech.Atomic && civ.tribe(c.tribe));
    if (atomic.length < ATOMIC_WAR_CITIES) return null;
    const powers = new Set(atomic.map((c) => c.tribe));
    if (powers.size < 2) return null;
    const aggression = CivSystem.aggression(params);
    if (aggression <= CivSystem.PEACEFUL || !world.rng.chance(ATOMIC_WAR_CHANCE * aggression)) return null;
    const ready = atomic.filter((c) => !resting(civ, c.tribe, world.ticks));
    if (ready.length === 0) return null;
    const from = ready[world.rng.int(ready.length)];
    const rivals = civ.cities.filter((c) => c.tribe !== from.tribe && powers.has(c.tribe) && !resting(civ, c.tribe, world.ticks));
    if (rivals.length === 0) return null;
    const target = rivals[world.rng.int(rivals.length)];
    const by = civ.tribe(from.tribe);
    const on = civ.tribe(target.tribe);
    if (!by || !on) return null;
    dropBomb(world, target, by, on);
    return { target, by, on };
  }
}
