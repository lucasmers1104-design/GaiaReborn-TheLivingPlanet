/* =============================================================================
 * SimEarth 2.0 — tidal wave and hurricane: wave front, run-up, storm track
 * -----------------------------------------------------------------------------
 * docs/ereignisse-spec.md §3.4, §3.5.
 *
 * Tidal wave: at its start an arrival field spreads over the water from the
 * origin (fast marching on tile centres, axis + diagonal stencil; speed after
 * the shallow-water law, so fronts stay round, bend towards the coast and
 * wrap round islands), in a WAVE_BOX square around it, for at most
 * WAVE_PATH_MAX tiles of path (less for a weaker wave), the energy falling by
 * WAVE_DECAY a tile. Each tick the front is the water whose arrival falls
 * into it; where the front touches land, the wave runs up the coast
 * (hazardflood.ts).
 *
 * Hurricane: the eye moves one tile a tick — west with the trade winds and a
 * poleward drift, east beyond HURRICANE_RECURVE_LAT — gaining strength over
 * warm sea and losing it over cool sea and land. It soaks a strip five tiles
 * wide, throws forests and, making landfall strong, pushes a storm surge up
 * the coast through the same run-up, spinning off tornadoes (hazardtornado.ts).
 * Its lightning and its rain floods over land are in hazardstorm.ts.
 * The hazard lasts until its strip dries.
 * ========================================================================== */

namespace SE {
  /** Side of the square box around the origin that holds a tidal wave's field, in tiles. */
  export const WAVE_BOX = 2 * WAVE_PATH_MAX + 1;

  /** A tidal wave: its arrival field, the water tiles it has yet to pass in order of arrival, and its floods. */
  export interface TidalWave {
    readonly tiles: number[];
    /** Ticks after the start. */
    readonly arrival: number[];
    /** Tiles of path from the origin; the energy left is min(1, strength) · WAVE_DECAY ** path. */
    readonly path: number[];
    /** Direction of travel, an index into HAZARD_NX / HAZARD_NY. */
    readonly heading: number[];
    readonly runs: FloodRun[];
    /** Top-left tile of the WAVE_BOX² field box; x0 is unwrapped (may be < 0 or ≥ GRID_W). */
    readonly x0: number;
    readonly y0: number;
    /** Per box cell (waveCell), on tile centres, never spliced: arrival in ticks; Infinity where never reached. */
    readonly at: Float32Array;
    /** min(1, strength) · WAVE_DECAY ** path; 0 where never reached. */
    readonly energy: Float32Array;
    /** Direction of travel in radians (atan2 of the arrival gradient, y down); NaN where never reached. */
    readonly angle: Float32Array;
    /** Reached water touching land, in order of arrival, never spliced. */
    readonly coast: { readonly tiles: number[]; readonly at: number[]; readonly energy: number[] };
    /** Arrival at the last tile reached. */
    readonly last: number;
  }

  export interface StormTrack {
    /** The eye's tile at every tick so far, the current one last. */
    readonly path: number[];
    /** Its strength at every tick so far, beside path (0 where it died). */
    readonly strengths: number[];
    strength: number;
    /** Poleward drift gathered towards the next row, in tiles. */
    drift: number;
    /** East–west speed in tiles per tick (turning gradually), and the part of a tile gathered towards the next column. */
    vx: number;
    ax: number;
    /** Where between tiles the eye really is at every tick, beside path: x, y pairs in tiles off the tile's centre; the screen glides along these. */
    readonly offsets: number[];
    /** False once the storm has died out; its strip may still be drying. */
    moving: boolean;
    /** Tiles it soaked, drying out. */
    readonly wet: number[];
    /** Its storm surges. */
    readonly runs: FloodRun[];
    /** Funnels spun off at landfall (hazardtornado.ts). */
    readonly tornadoes: Tornado[];
  }

  export interface Hazard {
    wave?: TidalWave;
    storm?: StormTrack;
  }

  /** Ticks a tidal wave takes to cross one water tile of elevation `e`: speed grows with √depth, clamped. */
  export function waveTicks(e: number): number {
    return clamp(WAVE_TICKS_DEEP * Math.sqrt(COAST_DEPTH / e), WAVE_TICKS_DEEP, WAVE_TICKS_SHALLOW);
  }

  /** Box cell of tile (x, y) in this wave's field, or -1 outside the box. x may be unwrapped. */
  export function waveCell(w: TidalWave, x: number, y: number): number {
    const bx = (((x - w.x0) % GRID_W) + GRID_W) % GRID_W;
    const by = y - w.y0;
    return bx >= WAVE_BOX || by < 0 || by >= WAVE_BOX ? -1 : by * WAVE_BOX + bx;
  }

  function touchesLand(world: WorldState, i: number): boolean {
    for (let k = 0; k < 8; k++) {
      const j = hazardNeighbour(i, k);
      if (j >= 0 && world.elevation[j] >= 0) return true;
    }
    return false;
  }

  /* ------------------------------------------------------- arrival field -- */

  // Module-local copies: reading SE.* inside the marching loop costs a namespace property lookup each time.
  const BOX = WAVE_BOX;
  const NX = HAZARD_NX;
  const NY = HAZARD_NY;
  const GW = GRID_W;
  const GH = GRID_H;
  // Box-local scratch, doubles: a float32 copy of an arrival rounds below its heap key and would read as stale.
  const CELLS = BOX * BOX;
  const fT = new Float64Array(CELLS);
  const fL = new Float64Array(CELLS);
  /** Ticks per tile; 0 = wall (land, past a pole). */
  const fSlow = new Float64Array(CELLS);
  /** 0 far, 1 trial, 2 done. */
  const fState = new Uint8Array(CELLS);
  /** Tile of each cell; -1 past a pole. */
  const fTile = new Int32Array(CELLS);
  const nT = new Float64Array(8);
  const nB = new Int32Array(8);
  /** Octant of the travel angle (0 = +x, 1 = +x+y, …) → HAZARD_NX / HAZARD_NY index. */
  const OCTANT_DIR = [4, 7, 6, 5, 3, 0, 1, 2];

  function heapPush(keys: number[], vals: number[], key: number, val: number): void {
    let n = keys.length;
    keys.push(key);
    vals.push(val);
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (keys[p] <= key) break;
      keys[n] = keys[p];
      vals[n] = vals[p];
      n = p;
    }
    keys[n] = key;
    vals[n] = val;
  }

  function heapPop(keys: number[], vals: number[]): void {
    const key = keys.pop() as number;
    const val = vals.pop() as number;
    const size = keys.length;
    if (size === 0) return;
    let n = 0;
    for (;;) {
      let c = 2 * n + 1;
      if (c >= size) break;
      if (c + 1 < size && keys[c + 1] < keys[c]) c++;
      if (keys[c] >= key) break;
      keys[n] = keys[c];
      vals[n] = vals[c];
      n = c;
    }
    keys[n] = key;
    vals[n] = val;
  }

  let solvedT = 0;
  let solvedL = 0;

  /** One stencil pair of done neighbours (ta, la), (tb, lb) at spacing h onto a cell of slowness s: sets solvedT/L. */
  function solvePair(ta: number, la: number, tb: number, lb: number, s: number, h: number): void {
    if (ta > tb) {
      const t = ta; ta = tb; tb = t;
      const l = la; la = lb; lb = l;
    }
    const sh = s * h;
    if (ta === Infinity) {
      solvedT = Infinity;
      return;
    }
    if (tb === Infinity || tb - ta >= sh) {
      solvedT = ta + sh;
      solvedL = la + h;
      return;
    }
    const t = (ta + tb + Math.sqrt(2 * sh * sh - (tb - ta) * (tb - ta))) / 2;
    const ga = t - ta;
    const gb = t - tb;
    solvedT = t;
    // The path rides along the ray between the two neighbours.
    solvedL = (ga * la + gb * lb + h * Math.sqrt(ga * ga + gb * gb)) / (ga + gb);
  }

  /** Travel time of a done box cell, Infinity outside the box or where not (yet) reached. */
  function doneT(bx: number, by: number): number {
    if (bx < 0 || by < 0 || bx >= BOX || by >= BOX) return Infinity;
    const b = by * BOX + bx;
    return fState[b] === 2 ? fT[b] : Infinity;
  }

  /** A box cell not on the box rim with a land neighbour. */
  function besideLand(b: number): boolean {
    for (let k = 0; k < 8; k++) {
      const j = b + NY[k] * BOX + NX[k];
      if (fTile[j] >= 0 && fSlow[j] === 0) return true;
    }
    return false;
  }

  /** One-sided or central difference of the arrival along one axis. */
  function slope(t: number, before: number, after: number): number {
    if (before < Infinity && after < Infinity) return (after - before) / 2;
    if (after < Infinity) return after - t;
    return before < Infinity ? t - before : 0;
  }

  /**
   * The arrival field of a wave of `strength` from tile (ox, oy): fast marching
   * over the water of the box, first order, on axis and diagonal stencils;
   * cells within WAVE_FMM_INIT of the origin start exactly on a circle.
   */
  function arrivalField(world: WorldState, ox: number, oy: number, strength: number): TidalWave {
    const R = WAVE_PATH_MAX;
    const S = BOX;
    const x0 = ox - R;
    const y0 = oy - R;
    const e = world.elevation;
    const power = Math.min(1, strength);
    const pathMax = Math.max(WAVE_PATH_MIN, WAVE_PATH_MAX + Math.log(power) / -Math.log(WAVE_DECAY));
    for (let b = 0; b < CELLS; b++) {
      const y = y0 + ((b / S) | 0);
      fT[b] = Infinity;
      fState[b] = 0;
      fTile[b] = y < 0 || y >= GH ? -1 : y * GW + ((((x0 + (b % S)) % GW) + GW) % GW);
      const v = fTile[b] < 0 ? 0 : e[fTile[b]];
      fSlow[b] = v < 0 ? waveTicks(v) : 0;
    }
    const keys: number[] = [];
    const vals: number[] = [];
    const o = R * S + R;
    for (let dy = -WAVE_FMM_INIT; dy <= WAVE_FMM_INIT; dy++) {
      for (let dx = -WAVE_FMM_INIT; dx <= WAVE_FMM_INIT; dx++) {
        const d = Math.hypot(dx, dy);
        const b = o + dy * S + dx;
        if (d > WAVE_FMM_INIT || fSlow[b] === 0) continue;
        fT[b] = d * fSlow[o];
        fL[b] = d;
        fState[b] = 1;
        heapPush(keys, vals, fT[b], b);
      }
    }
    const order: number[] = [];
    while (keys.length > 0) {
      const t = keys[0];
      const i = vals[0];
      heapPop(keys, vals);
      if (fState[i] === 2 || t > fT[i]) continue;
      fState[i] = 2;
      order.push(i);
      const ix = i % S;
      const iy = (i / S) | 0;
      for (let k = 0; k < 8; k++) {
        const jx = ix + NX[k];
        const jy = iy + NY[k];
        if (jx < 0 || jy < 0 || jx >= S || jy >= S) continue;
        const j = jy * S + jx;
        if (fSlow[j] === 0 || fState[j] === 2) continue;
        for (let n = 0; n < 8; n++) {
          nT[n] = doneT(jx + NX[n], jy + NY[n]);
          nB[n] = (jy + NY[n]) * S + jx + NX[n];
        }
        // Axis pair W/E with N/S, diagonal pair NW/SE with NE/SW (NX / NY order).
        const w = nT[3] <= nT[4] ? 3 : 4;
        const ns = nT[1] <= nT[6] ? 1 : 6;
        const nw = nT[0] <= nT[7] ? 0 : 7;
        const ne = nT[2] <= nT[5] ? 2 : 5;
        solvePair(nT[w], fL[nB[w]], nT[ns], fL[nB[ns]], fSlow[j], 1);
        let bt = solvedT;
        let bl = solvedL;
        solvePair(nT[nw], fL[nB[nw]], nT[ne], fL[nB[ne]], fSlow[j], Math.SQRT2);
        if (solvedT < bt) {
          bt = solvedT;
          bl = solvedL;
        }
        if (bl > pathMax || bt >= fT[j]) continue;
        fT[j] = bt;
        fL[j] = bl;
        fState[j] = 1;
        heapPush(keys, vals, bt, j);
      }
    }
    const wave: TidalWave = {
      tiles: [], arrival: [], path: [], heading: [], runs: [], x0, y0,
      at: new Float32Array(CELLS).fill(Infinity), energy: new Float32Array(CELLS), angle: new Float32Array(CELLS).fill(NaN),
      coast: { tiles: [], at: [], energy: [] }, last: order.length > 0 ? fT[order[order.length - 1]] : 0,
    };
    for (const b of order) {
      const bx = b % S;
      const by = (b / S) | 0;
      const t = fT[b];
      const gx = slope(t, doneT(bx - 1, by), doneT(bx + 1, by));
      const gy = slope(t, doneT(bx, by - 1), doneT(bx, by + 1));
      const angle = gx === 0 && gy === 0 ? 0 : Math.atan2(gy, gx);
      const energy = power * Math.pow(WAVE_DECAY, fL[b]);
      const i = fTile[b];
      wave.at[b] = t;
      wave.energy[b] = energy;
      wave.angle[b] = angle;
      wave.tiles.push(i);
      wave.arrival.push(t);
      wave.path.push(fL[b]);
      wave.heading.push(OCTANT_DIR[((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8]);
      const rim = bx === 0 || by === 0 || bx === S - 1 || by === S - 1;
      if (rim ? !touchesLand(world, i) : !besideLand(b)) continue;
      wave.coast.tiles.push(i);
      wave.coast.at.push(t);
      wave.coast.energy.push(energy);
    }
    return wave;
  }

  /* ---------------------------------------------------------- tidal wave -- */

  HAZARD_RULES[EventKind.TidalWave] = {
    refuse: (world, x, y) => (world.elevation[idx(x, y)] < 0 ? '' : 'Eine Flutwelle beginnt im Meer.'),

    start(world: WorldState, h: Hazard): void {
      h.wave = arrivalField(world, h.x, h.y, h.strength ?? 1);
    },

    step(world: WorldState, h: Hazard): boolean {
      const wave = h.wave;
      if (!wave) return false;
      const a = h.age;
      // The front of the last tick stays for the screen; what passed before it is dropped.
      let gone = 0;
      while (gone < wave.arrival.length && wave.arrival[gone] < a - 2) gone++;
      if (gone > 0) for (const list of [wave.tiles, wave.arrival, wave.path, wave.heading]) list.splice(0, gone);
      // Tick a commits the coast the wave reaches in [a-1, a); the screen plays that window one tick behind.
      const c = wave.coast;
      const coast: number[] = [];
      const height: number[] = [];
      const at: number[] = [];
      for (let k = 0; k < c.at.length && c.at[k] < a; k++) {
        if (c.at[k] < a - 1) continue;
        coast.push(c.tiles[k]);
        height.push(WAVE_HEIGHT * c.energy[k]);
        at.push(c.at[k]);
      }
      hazardRunUp(world, h, coast, height, at);
      hazardStepFloods(world, wave.runs);
      // The foam trail behind the last front fades for WAVE_TRAIL_TICKS on screen.
      return a - 1 <= wave.last + WAVE_TRAIL_TICKS || wave.runs.length > 0;
    },

    finish(world: WorldState, h: Hazard): void {
      const wave = h.wave;
      if (!wave) return;
      hazardDrainFloods(world, wave.runs);
      for (const list of [wave.tiles, wave.arrival, wave.path, wave.heading]) list.length = 0;
    },
  };

  /* ----------------------------------------------------------- hurricane -- */

  /** Strength from the sea surface under the eye; over land a storm is weak. */
  function stormStrength(world: WorldState, i: number): number {
    if (world.elevation[i] >= 0) return 1;
    const t = world.temperature[i];
    return t >= HURRICANE_WARM_SEA ? 3 : t >= HURRICANE_MILD_SEA ? 2 : 1;
  }

  /** Rain, wind and wet ground in the strip around the eye. */
  function lash(world: WorldState, h: Hazard, st: StormTrack): void {
    const hz = world.hazards;
    const eye = st.path[st.path.length - 1];
    const ex = eye % GRID_W;
    const ey = (eye / GRID_W) | 0;
    const s = st.strength;
    for (let dy = -2; dy <= 2; dy++) {
      const y = ey + dy;
      if (y < 0 || y >= GRID_H) continue;
      for (let dx = -2; dx <= 2; dx++) {
        const i = idx(wrapX(ex + dx), y);
        const inner = Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
        world.moisture[i] = Math.min(1, world.moisture[i] + (inner ? HURRICANE_MOISTURE : HURRICANE_OUTER_MOISTURE));
        if (world.elevation[i] < 0) continue;
        if (inner) {
          hazardKillLife(world, i, HURRICANE_LIFE_LOSS * s);
          if (s >= HURRICANE_WINDTHROW_MIN && LANDSCAPE_LEVEL[world.landscape[i]] >= 4 && hz.scar[i] === ScarKind.None) {
            setScar(world, i, ScarKind.Windthrow);
            world.vegetation[i] *= HURRICANE_WINDTHROW_KEEP;
          }
          hazardHitCity(world, i, HURRICANE_CITY_LOSS * s);
        }
        if (hz.tile[i] === HazardTile.None) {
          hz.tile[i] = HazardTile.Wet;
          hz.level[i] = 0;
          st.wet.push(i);
          hz.revision++;
        }
        if (hz.tile[i] === HazardTile.Wet) {
          const ticks = HURRICANE_WET_TICKS + Math.floor(hazardRoll(world.seed ^ h.id, i, h.age) * (HURRICANE_WET_SPAN + 1));
          hz.level[i] = Math.max(hz.level[i], ticks);
        }
      }
    }
  }

  /** Every soaked tile dries a tick. */
  function dry(world: WorldState, st: StormTrack): void {
    const hz = world.hazards;
    let n = 0;
    for (const i of st.wet) {
      if (hz.tile[i] !== HazardTile.Wet) continue;
      if (hz.level[i] > 1) {
        hz.level[i]--;
        st.wet[n++] = i;
        continue;
      }
      hz.tile[i] = HazardTile.None;
      hz.level[i] = 0;
      hz.revision++;
    }
    st.wet.length = n;
  }

  /** East–west course at row y: west with the trade winds in the tropics, east beyond. */
  function course(y: number): number {
    return Math.abs(latitudeDeg(y)) < HURRICANE_RECURVE_LAT ? windDirection(y) : 1;
  }

  /**
   * The eye's offset off its tile's centre (tiles): the part of a step it has gathered, and poleward its drift.
   * Each grows by exactly what the tile loses when it steps, so the screen's eye moves on evenly; the drift is
   * counted from half a tile, so the eye stays within half a tile of its tile.
   */
  function pushOffset(st: StormTrack, y: number): void {
    st.offsets.push(st.ax, (latitudeDeg(y) >= 0 ? -1 : 1) * (st.drift - 0.5));
  }

  /** On along its course, turning gradually, drifting poleward; strength follows the sea below. */
  function move(world: WorldState, h: Hazard, st: StormTrack): void {
    const from = st.path[st.path.length - 1];
    const y = (from / GRID_W) | 0;
    const lat = latitudeDeg(y);
    st.vx += clamp(course(y) - st.vx, -HURRICANE_TURN, HURRICANE_TURN);
    st.ax += st.vx;
    let dx = 0;
    if (st.ax >= 1) {
      st.ax -= 1;
      dx = 1;
    } else if (st.ax <= -1) {
      st.ax += 1;
      dx = -1;
    }
    st.drift += HURRICANE_DRIFT + (hazardRoll(world.seed ^ h.id, h.age, 0xd21f7) - 0.5) * HURRICANE_DRIFT_JITTER;
    let dy = 0;
    if (st.drift >= 1) {
      st.drift -= 1;
      dy = lat >= 0 ? -1 : 1;
    }
    const nx = wrapX((from % GRID_W) + dx);
    const ny = clamp(y + dy, 1, GRID_H - 2);
    const to = idx(nx, ny);
    st.path.push(to);
    pushOffset(st, ny);
    const sea = world.elevation[to] < 0;
    if (world.elevation[from] < 0 && !sea && st.strength >= HURRICANE_SURGE_MIN) surge(world, h, st, to);
    if (world.elevation[from] < 0 && !sea && st.strength >= TORNADO_MIN_STRENGTH) hazardSpawnTornadoes(world, h, st.tornadoes, from, to);
    if (!sea && st.strength >= STORM_FLOOD_MIN) hazardStormRain(world, h, to);
    const warm = world.temperature[to] >= HURRICANE_WARM_SEA;
    st.strength = Math.max(0, Math.min(HURRICANE_MAX, st.strength + (!sea ? -HURRICANE_LAND_LOSS : warm ? HURRICANE_GAIN : -HURRICANE_SEA_LOSS)));
    st.strengths.push(st.strength);
    if (st.strength <= 0) {
      st.moving = false;
      return;
    }
    lash(world, h, st);
    if (st.path.length > HURRICANE_TRACK_MAX) st.moving = false;
  }

  /** Landfall: the sea around the eye runs up the coast HURRICANE_SURGE × strength high. */
  function surge(world: WorldState, h: Hazard, st: StormTrack, eye: number): void {
    const coast: number[] = [];
    const height: number[] = [];
    const ex = eye % GRID_W;
    const ey = (eye / GRID_W) | 0;
    for (let dy = -2; dy <= 2; dy++) {
      const y = ey + dy;
      if (y < 0 || y >= GRID_H) continue;
      for (let dx = -2; dx <= 2; dx++) {
        const i = idx(wrapX(ex + dx), y);
        if (world.elevation[i] >= 0 || !touchesLand(world, i)) continue;
        coast.push(i);
        height.push(HURRICANE_SURGE * st.strength);
      }
    }
    hazardRunUp(world, h, coast, height);
  }

  HAZARD_RULES[EventKind.Hurricane] = {
    refuse: () => '',

    start(world: WorldState, h: Hazard): void {
      const i = idx(h.x, h.y);
      const strength = stormStrength(world, i);
      const st: StormTrack = {
        path: [i], strengths: [strength], strength, drift: hazardRoll(world.seed ^ h.id, i, 0xd21f), vx: course(h.y), ax: 0, offsets: [],
        moving: true, wet: [], runs: [], tornadoes: [],
      };
      pushOffset(st, h.y);
      h.storm = st;
      lash(world, h, st);
    },

    step(world: WorldState, h: Hazard): boolean {
      const st = h.storm;
      if (!st) return false;
      dry(world, st);
      hazardStepTornadoes(world, st.tornadoes);
      hazardStormStrike(world, h);
      if (st.moving) move(world, h, st);
      hazardStepFloods(world, st.runs);
      return st.moving || st.wet.length > 0 || st.runs.length > 0 || st.tornadoes.length > 0;
    },

    finish(world: WorldState, h: Hazard): void {
      const st = h.storm;
      if (!st) return;
      st.moving = false;
      const hz = world.hazards;
      for (const i of st.wet) {
        if (hz.tile[i] !== HazardTile.Wet) continue;
        hz.tile[i] = HazardTile.None;
        hz.level[i] = 0;
      }
      st.wet.length = 0;
      st.tornadoes.length = 0;
      hz.revision++;
      hazardDrainFloods(world, st.runs);
    },
  };
}
