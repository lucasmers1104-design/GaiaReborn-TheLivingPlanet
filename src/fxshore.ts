/* =============================================================================
 * SimEarth 2.0 — a tidal wave at the coast
 * -----------------------------------------------------------------------------
 * docs/ereignisse-spec.md §3.5, on the coast's surf pixels (landsurf.ts rings
 * 1–5), from the wave's arrival field sampled per art pixel, so every effect
 * sweeps along an oblique coast instead of popping by tile:
 *   drawdown   a tick before the crest the sea runs off the shore: the foam
 *              line calms, wet sand and the bare shelf show, ring by ring
 *   breaking   the crest rolls in as one white line along the real foam
 *              line, fades to foam and churns as surge water until the
 *              backwash
 *   backwash   a muddy plume spreads out from the shore and dissolves
 *   accents    a few breaker sprites on strong waves (never side by side),
 *              spray bursts at the spray sites (waterspray.ts)
 * Ambient surf (watermotion.ts) leaves the tiles in play alone (`shoreBusy`).
 * Time is the screen's wave time Tvis = age − 1 + phase (fxwater.ts).
 * ========================================================================== */

namespace SE {
  /** Twelve pictures a second. */
  const STEP_MS = 83;
  /** CSS px per tile from which the coast moves (WaterMotion's limit). */
  const MIN_TILE = 16;
  const CHUNK_PX = LAND_CHUNK * 16;
  const CHUNKS_X = GRID_W / LAND_CHUNK;
  const WORLD_PX = GRID_W * 16;
  /** Ticks before the crest that the sea draws back, and the energy below which it does not. */
  const DRAW_TICKS = 1;
  const DRAW_MIN_ENERGY = 0.15;
  /** Ticks the surge churns where no run-up follows (a cliff). */
  const SURGE_CLIFF = 1.5;
  /** Ticks the backwash plume lasts. */
  const PLUME_TICKS = 2;
  /** Breaker sprites: on coast water from this energy, this share of the tiles, at most this many a wave. */
  const BREAK_ENERGY = 0.45;
  const BREAK_SHARE = 0.3;
  const BREAKERS = 4;
  /** Spray strength from which a shore counts as a cliff: spray, no breaker. */
  const BREAK_CLIFF = 0.5;
  /** Art pixels a breaker stands from its tile's centre towards the land, and its jitter along the shore. */
  const BREAK_SHIFT = 6;
  const BREAK_JITTER = 6;
  const BREAK_DELAY_MS = 120;
  /** Ticks after the crest during which the spray sites throw their three bursts. */
  const SPRAY_TICKS = 1.2;
  const DIRECTIONS = 8;
  /** Ticks each surf ring further out is reached before the one inside it. */
  const RING_LEAD = 0.05;

  const R = TERRAIN_MANIFEST.ramps;
  const WATER6 = R.water[6];
  const WATER7 = R.water[7];
  const SAND0 = R.sand[0];
  const SAND1 = R.sand[1];
  const SAND2 = R.sand[2];
  const SOIL3 = R.soil[3];
  const ICE3 = R.ice[3];
  const ICE4 = R.ice[4];
  const WHITE = R.white[0];
  /** The breaking line, brightest first. */
  const BREAK_LADDER = [WHITE, ICE4, ICE3, WATER7];

  /** Tiles where a tidal wave works the coast this picture; ambient surf skips them. */
  export const shoreBusy = new Uint8Array(TILE_COUNT);

  interface Breaker {
    readonly x: number;
    readonly y: number;
    readonly d: number;
    /** Tvis from which it breaks, and the extra real delay of its first frame. */
    readonly at: number;
    readonly delay: number;
    born: number;
  }

  /** One wave as one picture sees it. */
  interface Prep {
    readonly h: Hazard;
    readonly wave: TidalWave;
    /** Tvis. */
    readonly T: number;
    /** Per box cell: when the backwash starts off that coast water (the latest recede of the land it touches), 0 = none. */
    readonly back: Float32Array;
    /** The field with every unreached cell next to reached water filled in (filled()). */
    readonly field: Filled;
  }

  interface Filled { readonly wave: TidalWave; readonly at: Float32Array; readonly energy: Float32Array }

  /**
   * Arrival and energy where cells next to reached water (land, mostly) take
   * the mean of those neighbours: every lattice corner then has one value,
   * whichever pixel asks, so the coast's field has no seams at tile centres.
   */
  function filled(wave: TidalWave): Filled {
    const at = Float32Array.from(wave.at);
    const energy = Float32Array.from(wave.energy);
    for (let c = 0; c < WAVE_BOX * WAVE_BOX; c++) {
      if (Number.isFinite(wave.at[c])) continue;
      const bx = c % WAVE_BOX;
      const by = (c / WAVE_BOX) | 0;
      let n = 0;
      let t = 0;
      let e = 0;
      for (let k = 0; k < 8; k++) {
        const x = bx + HAZARD_NX[k];
        const y = by + HAZARD_NY[k];
        if (x < 0 || y < 0 || x >= WAVE_BOX || y >= WAVE_BOX) continue;
        const a = wave.at[y * WAVE_BOX + x];
        if (!Number.isFinite(a)) continue;
        n++;
        t += a;
        e += wave.energy[y * WAVE_BOX + x];
      }
      if (n > 0) {
        at[c] = t / n;
        energy[c] = e / n;
      }
    }
    return { wave, at, energy };
  }

  function nearLand(world: WorldState, x: number, y: number): boolean {
    for (let n = 0; n < 8; n++) {
      const ny = y + HAZARD_NY[n];
      if (ny >= 0 && ny < GRID_H && world.elevation[idx(wrapX(x + HAZARD_NX[n]), ny)] >= 0) return true;
    }
    return false;
  }

  /** Direction index (HAZARD_NX/NY) of the land around water tile (x, y), -1 if none. */
  function landward(world: WorldState, x: number, y: number): number {
    let lx = 0;
    let ly = 0;
    for (let n = 0; n < 8; n++) {
      const ny = y + HAZARD_NY[n];
      if (ny < 0 || ny >= GRID_H || world.elevation[idx(wrapX(x + HAZARD_NX[n]), ny)] < 0) continue;
      lx += HAZARD_NX[n];
      ly += HAZARD_NY[n];
    }
    for (let k = 0; k < 8; k++) if (HAZARD_NX[k] === Math.sign(lx) && HAZARD_NY[k] === Math.sign(ly)) return k;
    return -1;
  }

  export class FxShore {
    private key = '';
    private paths = new Map<number, Path2D>();
    private originX = 0;
    private originY = 0;
    private colors: string[] = [];
    private ice: readonly number[] = [];
    private readonly busyList: number[] = [];
    private readonly backs = new Map<number, Float32Array>();
    private readonly fields = new Map<number, Filled>();
    private readonly breakers = new Map<number, Breaker[]>();
    private readonly spray = new WaterSpray();
    /** Real length of a tick, measured, for the spray's seconds. */
    private tick = -1;
    private tickAt = 0;
    private tickMs = 400;
    /** Sample of the last `sample()`: arrival, energy, backwash start. */
    private tc = 0;
    private e = 0;
    private b = 0;
    private readonly put = (color: number, x: number, y: number): void => this.add(color, x, y);

    draw(ctx: CanvasRenderingContext2D, world: WorldState, cam: LandCamera, land: PixelTerrain, s: FxScene): void {
      if (world.ticks !== this.tick) {
        if (world.ticks === this.tick + 1) this.tickMs = clamp(s.now - this.tickAt, 60, 4000);
        this.tick = world.ticks;
        this.tickAt = s.now;
      }
      const preps: Prep[] = [];
      for (const h of world.hazards.list) {
        if (!h.wave) continue;
        let field = this.fields.get(h.id);
        if (field?.wave !== h.wave) {
          field = filled(h.wave);
          this.fields.set(h.id, field);
        }
        preps.push({ h, wave: h.wave, T: h.age - 1 + s.phase, back: this.backOf(h.id, h.wave, world), field });
      }
      for (const id of [...this.breakers.keys()]) if (!world.hazards.hazard(id)) this.breakers.delete(id);
      for (const id of [...this.backs.keys()]) if (!world.hazards.hazard(id)) this.backs.delete(id);
      for (const id of [...this.fields.keys()]) if (!world.hazards.hazard(id)) this.fields.delete(id);
      const art = land.art;
      if (preps.length === 0 || cam.tilePx < MIN_TILE || !land.ready || !art) {
        if (this.busyList.length > 0) this.markBusy(world, []);
        return;
      }
      if (!s.reduce) for (const p of preps) this.breakersOf(s, world, p);
      const ox = Math.floor(cam.scrollX);
      const oy = Math.floor(cam.scrollY);
      const key = `${Math.floor(s.now / STEP_MS)}|${ox}|${oy}|${s.x0}|${s.x1}|${s.y0}|${s.y1}`;
      if (key !== this.key) {
        this.key = key;
        this.originX = ox;
        this.originY = oy;
        if (this.colors.length === 0) this.colors = art.manifest.palette.map(([r, g, b]) => `rgb(${r},${g},${b})`);
        this.ice = art.manifest.ramps.ice;
        this.markBusy(world, preps);
        this.build(world, land, preps, s);
      }
      const T = cam.tilePx * cam.dpr;
      ctx.setTransform(T / 16, 0, 0, T / 16, (ox - cam.scrollX) * T, (oy - cam.scrollY) * T);
      for (const [color, path] of this.paths) {
        ctx.fillStyle = this.colors[color];
        ctx.fill(path);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    /** Backwash start per box cell: the latest recede (FloodRun.off) of the run tiles each coast water cell touches. */
    private backOf(id: number, wave: TidalWave, world: WorldState): Float32Array {
      let back = this.backs.get(id);
      if (!back) {
        back = new Float32Array(WAVE_BOX * WAVE_BOX);
        this.backs.set(id, back);
      }
      back.fill(0);
      for (const run of wave.runs) {
        for (let j = 0; j < run.tiles.length; j++) {
          const i = run.tiles[j];
          for (let n = 0; n < 8; n++) {
            const k = hazardNeighbour(i, n);
            if (k < 0 || world.elevation[k] >= 0) continue;
            const c = waveCell(wave, k % GRID_W, (k / GRID_W) | 0);
            if (c >= 0 && run.off[j] > back[c]) back[c] = run.off[j];
          }
        }
      }
      return back;
    }

    /** Mark the tiles round every coast water cell whose window [arrival − DRAW_TICKS, end] holds Tvis. */
    private markBusy(world: WorldState, preps: readonly Prep[]): void {
      for (const i of this.busyList) shoreBusy[i] = 0;
      this.busyList.length = 0;
      for (const p of preps) {
        const { wave, T } = p;
        for (let c = 0; c < WAVE_BOX * WAVE_BOX; c++) {
          const a = wave.at[c];
          if (!(a <= T + DRAW_TICKS + 4 * RING_LEAD)) continue;
          const end = p.back[c] > 0 ? p.back[c] + PLUME_TICKS : a + SURGE_CLIFF;
          if (T > end) continue;
          const x = wave.x0 + (c % WAVE_BOX);
          const y = wave.y0 + ((c / WAVE_BOX) | 0);
          if (!nearLand(world, x, y)) continue;
          for (let dy = -1; dy <= 1; dy++) {
            if (y + dy < 0 || y + dy >= GRID_H) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const i = idx(wrapX(x + dx), y + dy);
              if (shoreBusy[i]) continue;
              shoreBusy[i] = 1;
              this.busyList.push(i);
            }
          }
        }
      }
    }

    private build(world: WorldState, land: PixelTerrain, preps: readonly Prep[], s: FxScene): void {
      this.paths = new Map();
      const tx0 = s.x0;
      const tx1 = s.x1 + 1;
      const ty0 = s.y0;
      const ty1 = s.y1 + 1;
      for (let cy = Math.floor(ty0 / LAND_CHUNK); cy <= Math.floor((ty1 - 1) / LAND_CHUNK); cy++) {
        for (let cu = Math.floor(tx0 / LAND_CHUNK); cu <= Math.floor((tx1 - 1) / LAND_CHUNK); cu++) {
          const cw = ((cu % CHUNKS_X) + CHUNKS_X) % CHUNKS_X;
          const m = land.motion(cw, cy);
          if (!m) continue;
          for (let k = 0; k < m.surf.length; k++) {
            const at = m.surfAt[k];
            const x = cu * CHUNK_PX + (at & 0xffff);
            const y = cy * CHUNK_PX + (at >>> 16);
            const tx = x >> 4;
            const ty = y >> 4;
            if (tx < tx0 || tx >= tx1 || ty < ty0 || ty >= ty1 || !shoreBusy[ty * GRID_W + wrapX(tx)]) continue;
            if (world.tech[ty * GRID_W + wrapX(tx)] !== Tech.None) continue;
            const info = m.surf[k];
            const ring = (info >>> 8) & 255;
            const h = (info >>> 24) / 256;
            const hx = cw * CHUNK_PX + (at & 0xffff);
            for (const p of preps) {
              const color = this.colorAt(p, x, y, hx, ring, h, info & 255, s.reduce);
              if (color < 0) continue;
              this.add(color, x, y);
              break;
            }
          }
          if (!s.reduce) this.sprayAt(m, cu, cw, cy, world, preps, tx0, ty0, tx1, ty1);
        }
      }
    }

    /** What surf pixel (x, y) (hx: x wrapped) shows under wave p, or -1. */
    private colorAt(p: Prep, x: number, y: number, hx: number, ring: number, h: number, own: number, still: boolean): number {
      if (!this.sample(p, x, y)) return -1;
      // Outer rings are reached first: the crest rolls shoreward across the band.
      const u = p.T - this.tc + (ring - 1) * RING_LEAD;
      if (u < -DRAW_TICKS) return -1;
      if (u < 0) {
        if (this.e < DRAW_MIN_ENERGY) return -1;
        const q = (u + DRAW_TICKS) * (u + DRAW_TICKS);
        if (ring === 1) return q > 0.15 + 0.3 * h ? (h < 0.3 ? SAND1 : SAND2) : WATER6;
        if (ring === 2) return q > 0.4 + 0.3 * h ? (h < 0.5 ? SAND1 : WATER7) : own;
        if (ring === 3) return q > 0.65 + 0.3 * h ? WATER7 : own;
        return u >= -0.15 ? WATER7 : own;
      }
      const back = this.b;
      // Frozen with reduced effects: the surge churns without twinkling.
      const churn = still ? 0 : Math.floor(p.T * 4);
      if (back > 0 ? p.T < back : u < SURGE_CLIFF) {
        const weak = this.e < 0.08 ? 2 : this.e < 0.2 ? 1 : 0;
        if (u < 0.15) return BREAK_LADDER[weak];
        if (u < 0.35) return BREAK_LADDER[Math.min(2, 1 + weak)];
        if (u < 0.7) return h < 1 - (u - 0.35) / 0.35 ? BREAK_LADDER[Math.min(3, 2 + (weak >> 1))] : -1;
        const r = landHash(hx + churn * 4099, y, 431);
        return r < 0.1 ? ICE3 : r < 0.28 ? WATER7 : -1;
      }
      const t = p.T - back;
      if (back <= 0 || t >= PLUME_TICKS) return -1;
      if (t / 0.4 > ring - 1 + 0.8 * h && h < 2 - t) {
        if (h < 0.35) return SAND0;
        if (h < 0.55) return SOIL3;
      }
      return landHash(hx + churn * 4099, y, 432) < 0.06 ? ICE3 : -1;
    }

    /**
     * Arrival, energy and backwash start at world art pixel (x, y): bilinear
     * between the four tile centres round it, over the reached ones only.
     */
    private sample(p: Prep, x: number, y: number): boolean {
      const fx = (x - 8) / 16;
      const fy = (y - 8) / 16;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const ax = fx - ix;
      const ay = fy - iy;
      let w = 0;
      let tc = 0;
      let e = 0;
      let b = 0;
      for (let k = 0; k < 4; k++) {
        const c = waveCell(p.wave, ix + (k & 1), iy + (k >> 1));
        if (c < 0) continue;
        const a = p.field.at[c];
        if (!Number.isFinite(a)) continue;
        const wk = ((k & 1) ? ax : 1 - ax) * ((k >> 1) ? ay : 1 - ay) + 1e-6;
        w += wk;
        tc += a * wk;
        e += p.field.energy[c] * wk;
        if (p.back[c] > b) b = p.back[c];
      }
      if (w === 0) return false;
      this.tc = tc / w;
      this.e = e / w;
      this.b = b;
      return true;
    }

    /** Spray sites in the band throw three bursts as the crest hits, higher on a strong wave. */
    private sprayAt(m: LandMotion, cu: number, cw: number, cy: number, world: WorldState, preps: readonly Prep[],
      tx0: number, ty0: number, tx1: number, ty1: number): void {
      const sites = this.spray.sitesOf(m, cw, cy, world);
      for (let j = 0; j < sites.length; j++) {
        const at = m.surfAt[sites[j] & 0xffffff];
        const x = cu * CHUNK_PX + (at & 0xffff);
        const y = cy * CHUNK_PX + (at >>> 16);
        const tx = x >> 4;
        const ty = y >> 4;
        if (tx < tx0 || tx >= tx1 || ty < ty0 || ty >= ty1 || !shoreBusy[ty * GRID_W + wrapX(tx)]) continue;
        if (world.tech[ty * GRID_W + wrapX(tx)] !== Tech.None) continue;
        for (const p of preps) {
          if (!this.sample(p, x, y)) continue;
          const u = p.T - this.tc;
          if (u < 0 || u >= SPRAY_TICKS) continue;
          const wave = Math.floor(u * 3);
          const age = ((u - wave / 3) * this.tickMs) / 1000;
          if (age >= SPRAY_LIFE) continue;
          const strength = Math.min(1.6, (sites[j] >>> 24) / 255 + 0.6 * this.e);
          sprayDrops(age, strength, cw * CHUNK_PX + (at & 0xffff), y, wave, x, y, this.ice, this.put);
          break;
        }
      }
    }

    /** Breaker sprites of wave h: chosen once, each playing its frames once as the crest reaches its tile. */
    private breakersOf(s: FxScene, world: WorldState, p: Prep): void {
      const { h, wave, T } = p;
      let list = this.breakers.get(h.id);
      if (!list) {
        list = FxShore.chooseBreakers(world, h, wave);
        this.breakers.set(h.id, list);
      }
      const sp = FX_MANIFEST.sprites.wave_break;
      if (!sp) return;
      const ms = 1000 / Math.max(1, sp.fps);
      const per = sp.frames.length / DIRECTIONS;
      for (const b of list) {
        if (T < b.at) continue;
        if (Number.isNaN(b.born)) b.born = s.now + b.delay;
        const f = Math.floor((s.now - b.born) / ms);
        if (f < 0 || f >= per || !s.sees(wrapX(b.x >> 4), b.y >> 4)) continue;
        s.add({ id: 'wave_break', frame: b.d * per + f, x: b.x, y: b.y, foot: b.y });
      }
    }

    /** Coast water tiles hit hard enough, about BREAK_SHARE of them, never two side by side, at most BREAKERS. */
    private static chooseBreakers(world: WorldState, h: Hazard, wave: TidalWave): Breaker[] {
      const cand: { c: number; roll: number }[] = [];
      for (let c = 0; c < WAVE_BOX * WAVE_BOX; c++) {
        if (!Number.isFinite(wave.at[c]) || wave.energy[c] < BREAK_ENERGY) continue;
        const x = wave.x0 + (c % WAVE_BOX);
        const y = wave.y0 + ((c / WAVE_BOX) | 0);
        const i = idx(wrapX(x), y);
        const roll = hazardRoll(h.id, i, 31);
        if (roll < BREAK_SHARE) cand.push({ c, roll });
      }
      // In roll order, so the few breakers spread over the whole coast.
      cand.sort((a, b) => a.roll - b.roll);
      const taken = new Set<number>();
      const out: Breaker[] = [];
      for (const { c } of cand) {
        if (out.length >= BREAKERS) break;
        const x = wrapX(wave.x0 + (c % WAVE_BOX));
        const y = wave.y0 + ((c / WAVE_BOX) | 0);
        const i = idx(x, y);
        const d = landward(world, x, y);
        if (d < 0 || sprayStrength(world, x, y) >= BREAK_CLIFF) continue;
        let near = false;
        for (let n = 0; n < 8 && !near; n++) near = taken.has(hazardNeighbour(i, n));
        if (near) continue;
        taken.add(i);
        const along = (hazardRoll(h.id, i, 34) - 0.5) * BREAK_JITTER;
        const nx = HAZARD_NX[d];
        const ny = HAZARD_NY[d];
        const len = Math.hypot(nx, ny);
        out.push({
          x: Math.round(x * 16 + 8 + (nx / len) * BREAK_SHIFT - (ny / len) * along),
          y: Math.round(y * 16 + 15 + (ny / len) * BREAK_SHIFT + (nx / len) * along),
          d, at: wave.at[c] + 0.25 * hazardRoll(h.id, i, 32), delay: hazardRoll(h.id, i, 33) * BREAK_DELAY_MS, born: NaN,
        });
      }
      return out;
    }

    /** One art pixel at world pixel (x, y), x unwrapped like the origin. */
    private add(color: number, x: number, y: number): void {
      let path = this.paths.get(color);
      if (!path) {
        path = new Path2D();
        this.paths.set(color, path);
      }
      path.rect(x - this.originX * 16, y - this.originY * 16, 1, 1);
    }
  }
}
