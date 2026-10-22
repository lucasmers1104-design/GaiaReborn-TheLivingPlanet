/* =============================================================================
 * SimEarth 2.0 — the train on the map
 * -----------------------------------------------------------------------------
 * From 16 px per tile a train runs the one railway line (railway.ts) back and
 * forth: a locomotive (or a power car at either end) and its cars glide along
 * the same curves the track is drawn with (landrail.ts), each piece facing
 * along the track in 8 directions (effect-atlas sprites, tools/fx/trains.js),
 * easing into a short stop beside every station city. The age of the line picks
 * the train: Industrial a steam locomotive with coaches and puffs of steam
 * over its chimney, Atomic a high-speed train, from the Information age a
 * maglev. A steam train keeps its locomotive at the eastern end and runs
 * tender first on the way back. The run is a function of the clock alone, so
 * nothing is stored per frame. With "Effekte reduzieren" the train stands at
 * its western terminus. Sprites missing from the atlas are skipped. Visual
 * only: the simulation never reads this.
 *
 * Wiring (render.ts): `draw` expects ctx at identity (device pixels) and
 * leaves it there.
 * ========================================================================== */

namespace SE {
  /** CSS px per tile from which the train is drawn. */
  const MIN_TILE = 16;
  /** Samples along each tile's curve. */
  const STEPS = 8;
  /**
   * Positions along the line count track steps: art px along its major axis
   * (16 per tile, straight or diagonal), as the pieces are drawn — each
   * covers one step, stretched on the diagonals (tools/fx/trains.js).
   * Cruising speed in steps per second: steam, high-speed, maglev.
   */
  const SPEED = [12, 22, 32];
  /** Seconds a train stands at a station. */
  const STOP = 3;
  /** Steps between the centres of two pieces. */
  const PIECE_GAP = 16;
  /** The pieces of each train, east to west; a power car at the western end faces west. */
  const TRAINS: readonly (readonly string[])[] = [
    ['train_steam_loco', 'train_steam_car', 'train_steam_car', 'train_steam_car'],
    ['train_express_head', 'train_express_car', 'train_express_car', 'train_express_head'],
    ['train_maglev_head', 'train_maglev_car', 'train_maglev_car', 'train_maglev_head'],
  ];
  /** Steam puffs: one every PUFF_EVERY s while moving (three times as slow standing), rising PUFF_RISE art px per s. */
  const PUFF = 'train_steam_puff';
  const PUFF_EVERY = 0.3;
  const PUFF_RISE = 7;
  /** Where the chimney's top sits on the locomotive: steps ahead of its centre, art px above the track. */
  const CHIMNEY_AHEAD = 5;
  const CHIMNEY_UP = 8;
  /** Direction (HAZARD_NX/NY order) by octant of the heading, clockwise from east (y runs down). */
  const OCTANT_DIR: readonly number[] = [4, 7, 6, 5, 3, 0, 1, 2];
  const WORLD_PX = GRID_W * 16;

  interface Run { s: number; dir: number; moving: boolean }

  export class TrainLayer {
    /** "Effekte reduzieren": everything stands still. */
    still = false;
    private key = -1;
    /** The line as a polyline in world art px (x unwrapped from its first tile), with the steps to each point. */
    private xs = new Float32Array(0);
    private ys = new Float32Array(0);
    private arc = new Float32Array(0);
    /** Steps along the line where the train's middle stops, west to east. */
    private halts: number[] = [];
    /** Start of each leg's stop in the cycle (s), its run time, and the whole cycle. */
    private legStart: number[] = [];
    private legTime: number[] = [];
    private cycle = 0;
    private readonly run: Run = { s: 0, dir: 1, moving: false };

    /** Expects ctx at identity (device pixels) and leaves it there. */
    draw(ctx: CanvasRenderingContext2D, cam: LandCamera, world: WorldState, field: TerrainField, now: number): void {
      const rail = world.civ.rail;
      if (!rail || rail.path.length < 2 || cam.tilePx < MIN_TILE || !FxArt.shared().ready) return;
      const first = rail.cities[0];
      const last = rail.cities[rail.cities.length - 1];
      // A line whose end stations are gone (the civilization fell) lies still.
      if (world.tech[first] === Tech.None || world.tech[last] === Tech.None) return;
      this.prepare(rail);
      const look = railLook(rail.era) - 1;
      const pieces = TRAINS[look];
      if (!FX_MANIFEST.sprites[pieces[0]]) return;
      const clock = now / 1000 + landHash(world.seed, rail.built, 2401) * this.cycle;
      const run = this.still ? this.at(-1) : this.at(clock % this.cycle);
      const T = cam.tilePx * cam.dpr;
      const viewX = (cam.scrollX + ctx.canvas.width / T / 2) * 16;
      // The copy of a point on the wrapping map nearest the view.
      const near = (x: number): number => x + Math.round((viewX - x) / WORLD_PX) * WORLD_PX;
      const x0 = cam.scrollX * 16 - 16;
      const y0 = cam.scrollY * 16 - 16;
      const x1 = x0 + ctx.canvas.width / T * 16 + 32;
      const y1 = y0 + ctx.canvas.height / T * 16 + 32;
      const total = this.arc[this.arc.length - 1];
      const half = ((pieces.length - 1) * PIECE_GAP) / 2;
      // Pieces from the eastern end, drawn back to front.
      const drawn: { id: string; f: number; x: number; y: number }[] = [];
      for (let p = 0; p < pieces.length; p++) {
        const id = pieces[p];
        const sp = FX_MANIFEST.sprites[id];
        if (!sp || sp.frames.length < 8) continue;
        const s = clamp(run.s + half - p * PIECE_GAP, 0, total);
        const pt = this.point(s);
        const x = near(pt[0]);
        const y = pt[1];
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        // Eastwards from coupling to coupling, so a car on a curve turns with its neighbours; a power car at the western end faces west.
        const ahead = this.point(clamp(s + PIECE_GAP / 2, 0, total));
        let dx = ahead[0];
        let dy = ahead[1];
        const behind = this.point(clamp(s - PIECE_GAP / 2, 0, total));
        dx -= behind[0];
        dy -= behind[1];
        const back = p === pieces.length - 1 && look > 0;
        const dir = OCTANT_DIR[(Math.round(Math.atan2(back ? -dy : dy, back ? -dx : dx) / (Math.PI / 4)) + 8) % 8];
        const per = Math.floor(sp.frames.length / 8);
        const anim = per > 1 && run.moving ? Math.floor((now / 1000) * (sp.fps || 8) * run.dir) : 0;
        const f = dir * per + (((anim % per) + per) % per);
        drawn.push({ id, f, x, y: y - Math.round(landRiseAt(field, x, y)) });
      }
      drawn.sort((a, b) => a.y - b.y);
      const art = FxArt.shared();
      for (const d of drawn) art.drawSprite(ctx, cam, d.id, d.f, Math.floor(d.x), Math.floor(d.y));
      if (look === 0 && !this.still) this.puffs(ctx, cam, field, clock, half, total, near);
    }

    /** Puffs of steam over the chimney, where the locomotive was when each left it. */
    private puffs(ctx: CanvasRenderingContext2D, cam: LandCamera, field: TerrainField, clock: number, half: number, total: number, near: (x: number) => number): void {
      const sp = FX_MANIFEST.sprites[PUFF];
      if (!sp) return;
      const life = sp.frames.length / (sp.fps || 8);
      const art = FxArt.shared();
      for (let k = Math.floor(clock / PUFF_EVERY); k * PUFF_EVERY > clock - life; k--) {
        const born = k * PUFF_EVERY;
        const then = this.at(((born % this.cycle) + this.cycle) % this.cycle);
        if (!then.moving && k % 3 !== 0) continue;
        const s = clamp(then.s + half, 0, total);
        const pt = this.point(clamp(s + CHIMNEY_AHEAD, 0, total));
        const age = clock - born;
        const x = near(pt[0]);
        const y = pt[1] - CHIMNEY_UP - age * PUFF_RISE - Math.round(landRiseAt(field, x, pt[1]));
        art.drawSprite(ctx, cam, PUFF, Math.min(sp.frames.length - 1, Math.floor(age * (sp.fps || 8))), Math.floor(x), Math.floor(y));
      }
    }

    /**
     * Where the train's middle is `t` s into its cycle: east from halt to
     * halt, then back west, standing STOP s at each; t < 0 is standing at the
     * western terminus.
     */
    private at(t: number): Run {
      const r = this.run;
      r.dir = 1;
      r.moving = false;
      r.s = this.halts[0];
      if (t < 0) return r;
      const legs = this.legTime.length;
      for (let n = 0; n < 2 * legs; n++) {
        const back = n >= legs;
        const leg = back ? 2 * legs - 1 - n : n;
        const start = this.legStart[n];
        if (t >= start + STOP + this.legTime[leg] && n < 2 * legs - 1) continue;
        const from = this.halts[back ? leg + 1 : leg];
        const to = this.halts[back ? leg : leg + 1];
        r.dir = back ? -1 : 1;
        if (t < start + STOP) {
          r.s = from;
          return r;
        }
        const u = clamp((t - start - STOP) / this.legTime[leg], 0, 1);
        r.moving = u > 0 && u < 1;
        r.s = from + (to - from) * u * u * (3 - 2 * u);
        return r;
      }
      return r;
    }

    /** The point s steps along the line and the track's direction there: [x, y, dx, dy]. */
    private readonly pt = [0, 0, 1, 0];
    private point(s: number): number[] {
      const { arc, xs, ys } = this;
      let lo = 0;
      let hi = arc.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (arc[mid] <= s) lo = mid;
        else hi = mid;
      }
      const span = arc[hi] - arc[lo] || 1;
      const u = clamp((s - arc[lo]) / span, 0, 1);
      const p = this.pt;
      p[0] = xs[lo] + (xs[hi] - xs[lo]) * u;
      p[1] = ys[lo] + (ys[hi] - ys[lo]) * u;
      p[2] = xs[hi] - xs[lo];
      p[3] = ys[hi] - ys[lo];
      return p;
    }

    /** The polyline, halts and timetable of the line, built again when it changes; `arc` counts steps. */
    private prepare(rail: Railway): void {
      let key = Math.imul(rail.built | 0, 0x9e3779b1) ^ railLook(rail.era);
      for (const t of rail.path) key = Math.imul(key ^ t, 0x01000193);
      for (const s of rail.stations) key = Math.imul(key ^ s, 0x85ebca77);
      if (key === this.key) return;
      this.key = key;
      const path = rail.path;
      const n = path.length;
      // Tile centres, x unwrapped along the line.
      const cx = new Float32Array(n);
      const cy = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        let x = path[k] % GRID_W;
        if (k > 0) {
          const prev = cx[k - 1] / 16 - 0.53125;
          x += Math.round((prev - x) / GRID_W) * GRID_W;
        }
        cx[k] = x * 16 + 8.5;
        cy[k] = Math.floor(path[k] / GRID_W) * 16 + 8.5;
      }
      // Per tile the curve landrail.ts draws: from the middle of the step in, round the centre, to the middle of the step out.
      const m = n * STEPS + 1;
      const xs = new Float32Array(m);
      const ys = new Float32Array(m);
      const mid = new Int32Array(n);
      let j = 0;
      for (let k = 0; k < n; k++) {
        const ax = k > 0 ? (cx[k - 1] + cx[k]) / 2 : cx[k];
        const ay = k > 0 ? (cy[k - 1] + cy[k]) / 2 : cy[k];
        const bx = k + 1 < n ? (cx[k] + cx[k + 1]) / 2 : cx[k];
        const by = k + 1 < n ? (cy[k] + cy[k + 1]) / 2 : cy[k];
        const kx = k > 0 && k + 1 < n ? cx[k] : (ax + bx) / 2;
        const ky = k > 0 && k + 1 < n ? cy[k] : (ay + by) / 2;
        for (let s = k === 0 ? 0 : 1; s <= STEPS; s++) {
          const t = s / STEPS;
          const u = 1 - t;
          xs[j] = u * u * ax + 2 * u * t * kx + t * t * bx;
          ys[j] = u * u * ay + 2 * u * t * ky + t * t * by;
          if (s === STEPS / 2) mid[k] = j;
          j++;
        }
      }
      this.xs = xs.subarray(0, j);
      this.ys = ys.subarray(0, j);
      this.arc = new Float32Array(j);
      for (let k = 1; k < j; k++) this.arc[k] = this.arc[k - 1] + Math.max(Math.abs(xs[k] - xs[k - 1]), Math.abs(ys[k] - ys[k - 1]));
      const total = this.arc[j - 1];
      // The train's middle stops at each station; at the termini as far out as the train fits.
      const half = (3 * PIECE_GAP) / 2;
      this.halts = rail.stations.map((s, k) => {
        const at = k === 0 ? 0 : k === rail.stations.length - 1 ? total : this.arc[mid[s]];
        return clamp(at, Math.min(half, total / 2), Math.max(total - half, total / 2));
      });
      const speed = SPEED[railLook(rail.era) - 1];
      this.legTime = [];
      for (let k = 1; k < this.halts.length; k++) this.legTime.push(Math.max(0.5, (this.halts[k] - this.halts[k - 1]) / speed));
      const legs = this.legTime.length;
      this.legStart = [];
      let t = 0;
      for (let n2 = 0; n2 < 2 * legs; n2++) {
        this.legStart.push(t);
        t += STOP + this.legTime[n2 < legs ? n2 : 2 * legs - 1 - n2];
      }
      this.cycle = t;
    }
  }
}
