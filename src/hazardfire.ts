/* =============================================================================
 * SimEarth 2.0 — wildfire: spread, burnt earth
 * -----------------------------------------------------------------------------
 * docs/ereignisse-spec.md §3.3. A cellular automaton, one step per tick:
 * every burning tile may light each of its eight neighbours — the likelier
 * the more fuel the neighbour carries (plant cover, in full where woody
 * plants grow), the drier and hotter it is, and the more it lies downwind.
 * Water, rivers, bare ground and burnt tiles stop the fire; a city does not
 * burn but loses people. A tile burns FIRE_BURN_MIN–FIRE_BURN_MAX ticks by
 * its fuel, then keeps a fifth of its cover, loses its trees and becomes
 * burnt earth: a scar that holds it at bare soil for SCAR_MIN_TICKS before
 * succession grows it back (scars.ts). Every burning tile uses up air O₂ by
 * its fuel each tick (FIRE_O2), and above today's O₂ the fire spreads faster
 * (fireOxygen, hazardlightning.ts).
 * ========================================================================== */

namespace SE {
  /** A wildfire's state. */
  export interface FireFront {
    /** Tiles burning now. */
    burning: number[];
    /** Tiles that have caught so far, the origin included. */
    caught: number;
    /** Dust this fire has put into the air. */
    dust: number;
    /** Cities this fire has reached; each loses people once. */
    cities: number[];
  }

  export interface Hazard {
    fire?: FireFront;
  }

  const NO_FUEL = 'Hier gibt es nichts, was brennen kann.';

  /** Landscapes a fire cannot cross, whatever plant cover the tile still has. */
  const FIREPROOF: readonly boolean[] = (() => {
    const out = new Array<boolean>(LANDSCAPE_COUNT).fill(false);
    for (const l of [Landscape.Rock, Landscape.Ice, Landscape.Snow, Landscape.Desert, Landscape.Barren]) out[l] = true;
    return out;
  })();

  /** What a tile's plants give a fire: their cover, in full where woody plants grow. */
  export function fireFuel(world: WorldState, i: number): number {
    return world.vegetation[i] * ((world.flora[i] & WOODY_FLORA_MASK) !== 0 ? 1 : FIRE_HERB_FUEL);
  }

  /** How readily a tile's plants catch: dry and hot more, wet and frozen less. */
  export function fireDryness(world: WorldState, i: number): number {
    const t = world.temperature[i];
    const dry = clamp(FIRE_DRY_BASE - FIRE_DRY_MOIST * world.moisture[i], 0, 1);
    return dry * (t > FIRE_HOT_C ? FIRE_HOT_DRY : t < 0 ? FIRE_COLD_DRY : 1);
  }

  /** Ticks a tile with this fuel burns once it has caught. */
  export function fireBurnTicks(fuel: number): number {
    const span = FIRE_BURN_MAX - FIRE_BURN_MIN;
    return FIRE_BURN_MIN + Math.min(span, Math.floor(fuel * (span + 1)));
  }

  /** Whether the fire can take a tile next to it. */
  function burnable(world: WorldState, i: number): boolean {
    const hz = world.hazards;
    return world.elevation[i] >= 0 && world.riverLevel[i] <= 0 && !FIREPROOF[world.landscape[i]] &&
      world.vegetation[i] >= BARE_COVER && hz.tile[i] === HazardTile.None && hz.scar[i] !== ScarKind.Burnt &&
      world.tech[i] === Tech.None;
  }

  function ignite(world: WorldState, fire: FireFront, i: number, into: number[]): void {
    const hz = world.hazards;
    hz.tile[i] = HazardTile.Burning;
    hz.level[i] = fireBurnTicks(fireFuel(world, i));
    hz.revision++;
    fire.caught++;
    into.push(i);
  }

  /** The fire on a tile is out: the trees are gone, a fifth of the cover is left, the ground is burnt. */
  function burnOut(world: WorldState, fire: FireFront, i: number): void {
    const hz = world.hazards;
    const before = world.vegetation[i];
    const from = LANDSCAPE_LEVEL[world.landscape[i]];
    hz.tile[i] = HazardTile.None;
    hz.level[i] = 0;
    const left = before * FIRE_KEEP;
    world.vegetation[i] = left < 0.002 ? 0 : left;
    world.flora[i] &= ~WOODY_FLORA_MASK;
    SuccessionSystem.burn(world, i);
    hazardKillLife(world, i, FIRE_LIFE_LOSS);
    shiftGas(world, 'co2', 'fire', before * FIRE_CO2, 0, 5000);
    const dust = Math.min(FIRE_DUST_TILE, FIRE_DUST_MAX - fire.dust);
    if (dust > 0) {
      world.dust = clamp(world.dust + dust, 0, 1);
      fire.dust += dust;
    }
    setScar(world, i, ScarKind.Burnt, from);
  }

  /** Every burning tile tries to light its neighbours; tiles lit this tick spread from the next. */
  function spread(world: WorldState, h: Hazard, fire: FireFront, lit: number[]): void {
    const seed = world.seed ^ h.id;
    const oxygen = fireOxygen(world.o2);
    for (const i of fire.burning) {
      if (world.hazards.tile[i] !== HazardTile.Burning) continue;
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      const wind = ClimateSystem.airCurrent(y);
      for (let k = 0; k < 8; k++) {
        const ny = y + HAZARD_NY[k];
        if (ny < 0 || ny >= GRID_H) continue;
        const nx = wrapX(x + HAZARD_NX[k]);
        if (hazardDistance(h.x, h.y, nx, ny) > FIRE_REACH) continue;
        const j = idx(nx, ny);
        if (world.tech[j] !== Tech.None) {
          if (!fire.cities.includes(j)) {
            fire.cities.push(j);
            hazardHitCity(world, j, FIRE_CITY_LOSS);
          }
          continue;
        }
        if (fire.caught >= FIRE_MAX_TILES || !burnable(world, j)) continue;
        const along = HAZARD_NX[k] * wind.dx + HAZARD_NY[k] * wind.dy;
        const wf = along > 0 ? FIRE_DOWNWIND : along < 0 ? FIRE_UPWIND : FIRE_CROSSWIND;
        const diagonal = HAZARD_NX[k] !== 0 && HAZARD_NY[k] !== 0 ? FIRE_DIAGONAL : 1;
        const p = FIRE_SPREAD * fireFuel(world, j) * fireDryness(world, j) * wf * diagonal * oxygen;
        if (hazardRoll(seed, i * 8 + k, h.age) < p) ignite(world, fire, j, lit);
      }
    }
  }

  HAZARD_RULES[EventKind.Fire] = {
    refuse(world: WorldState, x: number, y: number): string {
      const i = idx(x, y);
      const hz = world.hazards;
      if (hz.tile[i] === HazardTile.Burning) return 'Hier brennt es schon.';
      if (world.tech[i] !== Tech.None) return 'Eine Stadt fängt kein Feuer. Wähle ein bewachsenes Feld daneben.';
      if (world.elevation[i] < 0 || world.riverLevel[i] > 0) return 'Wasser brennt nicht.';
      if (hz.tile[i] === HazardTile.Wet || hz.tile[i] === HazardTile.Flood) return 'Hier ist alles zu nass, um zu brennen.';
      if (hz.scar[i] === ScarKind.Burnt) return 'Hier ist schon alles verbrannt.';
      if (hz.tile[i] === HazardTile.Lava) return 'Hier fließt glühende Lava.';
      if (hz.tile[i] === HazardTile.Rubble) return 'Hier liegen Trümmer.';
      if (world.vegetation[i] < BARE_COVER) return NO_FUEL;
      return '';
    },

    start(world: WorldState, h: Hazard): void {
      const fire: FireFront = { burning: [], caught: 0, dust: 0, cities: [] };
      h.fire = fire;
      ignite(world, fire, idx(h.x, h.y), fire.burning);
    },

    step(world: WorldState, h: Hazard): boolean {
      const fire = h.fire;
      if (!fire) return false;
      if (h.age >= FIRE_MAX_TICKS) {
        HAZARD_RULES[EventKind.Fire]?.finish(world, h);
        return false;
      }
      const hz = world.hazards;
      const lit: number[] = [];
      spread(world, h, fire, lit);
      const still: number[] = [];
      let fuel = 0;
      for (const i of fire.burning) {
        if (hz.tile[i] !== HazardTile.Burning) continue;
        fuel += fireFuel(world, i);
        const level = hz.level[i] - 1;
        if (level <= 0) {
          burnOut(world, fire, i);
        } else {
          hz.level[i] = level;
          still.push(i);
        }
      }
      fire.burning = still.concat(lit);
      // Oxygen-rich air burns hotter and more completely: the fire window's brake on too much O₂.
      const burnt = fuel * FIRE_O2 * fireOxygen(world.o2);
      const raw = world.o2 - burnt;
      world.o2 = Math.max(0, raw);
      world.gas.add('o2', 'fire', -burnt);
      world.gas.add('o2', 'limit', world.o2 - raw);
      return fire.burning.length > 0;
    },

    finish(world: WorldState, h: Hazard): void {
      const fire = h.fire;
      if (!fire) return;
      for (const i of fire.burning) if (world.hazards.tile[i] === HazardTile.Burning) burnOut(world, fire, i);
      fire.burning.length = 0;
    },
  };
}
