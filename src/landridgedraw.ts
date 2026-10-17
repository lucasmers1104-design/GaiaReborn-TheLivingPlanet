/* =============================================================================
 * SimEarth 2.0 — raising the mountain ranges in 3/4 view
 * -----------------------------------------------------------------------------
 * The compositor first paints the ground flat. Here the ground under each
 * ridge line (landridges.ts) is lifted: a pixel at distance d from the crest
 * rises H·(1 − d/W)^1.5 — steep at the top, easing out at the foot — with a
 * ridged noise cutting gullies and notches. Seen from the south at 45°, a
 * point that rises z pixels shows z pixels higher on screen, so every column
 * is redrawn front to back: each ground pixel covers the screen rows from its
 * raised position up to what nearer ground already covers. A range thus shows
 * its south face and its crest against the land behind it, and hides what
 * lies right behind it.
 *
 * The face shows the ground of its tiles, and above the tree line, the rock
 * line and the snow line (by the crest's own temperature) alpine turf, bare
 * rock and snow, sampled where they show on screen so steep faces do not
 * stretch them. Every lifted pixel is shaded by its slope, light from the
 * upper left: west and north faces lighter, east and south faces darker, and
 * the skyline gets a one-step darker rim.
 *
 * `depth` keeps, per screen pixel, the ground row it shows, so objects can
 * stand on the faces and hide behind a crest (landobjects.ts). The effect
 * layers read the same lift through landRiseAt and landRiseMap.
 * ========================================================================== */

namespace SE {
  /** The lifted ground of one composition, for the objects that stand on it. */
  export interface LandRise {
    readonly ridges: RidgePaths;
    /** Rise of the ground at each buffer pixel (ground position), px. */
    readonly z: Float32Array;
    /** Ridge segment the rise of each ground pixel comes from, −1 where flat. */
    readonly seg: Int32Array;
    /** Ground row (buffer y) each screen pixel shows, valid in rows [top, bottom] of its column (riseDepth). */
    readonly depth: Int16Array;
    readonly top: Int16Array;
    readonly bottom: Int32Array;
  }

  /** Ramp steps per unit of slope (px of rise per px) across and down the screen. */
  const SLOPE_GAIN_X = 2.6;
  const SLOPE_GAIN_Y = 1.3;
  const SLOPE_LIMIT = 3;
  /** Share of the rise the gullies cut away at their deepest. */
  const GULLY = 0.3;
  /** Faces steeper than this (px of rise per px) show bare rock whatever grows below; this much steeper, also above the snow line. */
  const CLIFF_SLOPE = 0.75;
  const SNOW_CLIFF_SLOPE = 1.15;
  /**
   * The far foot of a range, where it would rise less than this, stays flat;
   * the rest comes down by as much, so the foot has no step.
   */
  const RISE_MIN = 0.75;
  /** Ground rows between a pixel and the one above it that make a skyline. */
  const SKYLINE_GAP = 4;
  const GULLY_SIZE = 128;
  /** How far a cone's crater floor lies below its rim, px, and how many ramp steps darker its pit shows. */
  const CRATER_DIP = 3;
  const CRATER_SHADE = 3;
  /** A cone keeps a clean outline: its gullies cut this share of the rise; instead ravines run down it as shading, this many around. */
  const CONE_GULLY = 0.08;
  const CONE_RIBS = 13;
  const CONE_RIB_EDGE = 0.6;
  const CONE_GAIN_X = 1.6;
  const CONE_GAIN_Y = 0.4;
  const CRATER_LIP = 1;
  /** A cone's outline is drawn where it stands at least this high, px: lower, it would ring the flat foot. */
  const CONE_OUTLINE_Z = 1.5;
  /**
   * Ramp steps darker the outline shows; the most a lit cone flank brightens,
   * and how much darker the whole cone shows: dark volcanic scree, not a pale
   * dome like a boulder.
   */
  const CONE_OUTLINE_SHADE = 2;
  const CONE_LIGHT_MAX = 1;
  const CONE_DARKEN = 1;

  /**
   * Rise at `q` = distance / foot radius from a ridge line of rise `top`:
   * (1 − q)^1.5, and inside a cone's crater (`pit` = crater radius / foot
   * radius) a bowl CRATER_DIP below the rim. sample and sampleAt both take it
   * from here, so they agree bit for bit.
   */
  function gullyDepth(ridges: RidgePaths, seg: number): number {
    return ridges.crater[seg] > 0 ? CONE_GULLY : GULLY;
  }

  function ridgeProfile(top: number, q: number, pit: number): number {
    if (q >= pit) {
      const u = 1 - q;
      return top * u * Math.sqrt(u);
    }
    const u = 1 - pit;
    const r = q / pit;
    return top * u * Math.sqrt(u) - CRATER_DIP * (1 - r * r);
  }

  /** Ridged periodic noise 0..1, world pixels: lines of 1 are the gullies. */
  const GULLIES: Float32Array = (() => {
    const S = GULLY_SIZE;
    const out = new Float32Array(S * S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const n = 0.65 * landOctave(x, y, S, 16, 1301) + 0.35 * landOctave(x, y, S, 32, 1302);
        out[y * S + x] = 1 - Math.min(1, Math.abs(n * 2 - 1) * 2.2);
      }
    }
    return out;
  })();

  let zBuf = new Float32Array(0);
  let segBuf = new Int32Array(0);
  let depthBuf = new Int16Array(0);
  let gridZ = new Float32Array(0);
  let gridSeg = new Int32Array(0);
  let rowLo = new Int32Array(0);
  let rowHi = new Int32Array(0);
  let colLo = new Int32Array(0);
  let colHi = new Int32Array(0);
  let colTop = new Int16Array(0);
  let colPx = new Uint8Array(0);
  let colWater = new Uint8Array(0);
  let liftMinX = 0;
  let liftMaxX = -1;
  /** Per sample row j, the buffer columns the last fill went over in rows 2j and 2j + 1; fillHi −1 where it skipped. */
  let fillLo = new Int32Array(0);
  let fillHi = new Int32Array(0);
  /** Index range of zBuf written by the last fill. */
  let dirtyLo = Infinity;
  let dirtyHi = -1;

  /** The ground row a screen pixel (x, y) of the buffer shows: its own row unless lifted ground stands there. */
  export function riseDepth(rise: LandRise, x: number, y: number, w: number): number {
    return y >= rise.top[x] && y <= rise.bottom[x] ? rise.depth[y * w + x] : y;
  }

  /** The per-pixel working buffers, large enough for w × h. */
  function allocate(w: number, h: number): void {
    if (zBuf.length < w * h) {
      dirtyHi = -1;
      zBuf = new Float32Array(w * h);
      segBuf = new Int32Array(w * h);
      depthBuf = new Int16Array(w * h);
    }
    if (colLo.length < w) { colLo = new Int32Array(w); colHi = new Int32Array(w); colTop = new Int16Array(w); }
  }

  let sliceLo = 0;
  let sliceHi = 0;

  /** Columns [sliceLo, sliceHi] of sample row y that lie within `r` of segment a → b: a convex slice. */
  function slice(ax: number, ay: number, bx: number, by: number, r: number, y: number): void {
    let lo = Infinity;
    let hi = -Infinity;
    const da = y - ay;
    if (Math.abs(da) < r) {
      const half = Math.sqrt(r * r - da * da);
      lo = ax - half;
      hi = ax + half;
    }
    const db = y - by;
    if (Math.abs(db) < r) {
      const half = Math.sqrt(r * r - db * db);
      lo = Math.min(lo, bx - half);
      hi = Math.max(hi, bx + half);
    }
    const vy = by - ay;
    if (y > Math.min(ay, by) && y < Math.max(ay, by) && vy !== 0) {
      const vx = bx - ax;
      const xc = ax + ((y - ay) * vx) / vy;
      const half = (r * Math.sqrt(vx * vx + vy * vy)) / Math.abs(vy);
      lo = Math.min(lo, xc - half);
      hi = Math.max(hi, xc + half);
    }
    sliceLo = lo;
    sliceHi = hi;
  }

  /**
   * The rise of the ranges on every second world pixel of a w × h buffer at
   * (ox, oy), both even: sample (i, j) is buffer pixel (2i, 2j). Fills the
   * sample grid and, per sample row, the columns that rose; false when
   * nothing rises.
   */
  function sample(ridges: RidgePaths, ids: number[], ox: number, oy: number, w: number, h: number): boolean {
    const gw = (w >> 1) + 1;
    const gh = (h >> 1) + 1;
    if (gridZ.length < gw * gh) { gridZ = new Float32Array(gw * gh); gridSeg = new Int32Array(gw * gh); }
    if (rowLo.length < gh) { rowLo = new Int32Array(gh); rowHi = new Int32Array(gh); }
    const G = gridZ;
    const GS = gridSeg;
    rowLo.fill(gw, 0, gh);
    rowHi.fill(-1, 0, gh);
    const { ax: pax, ay: pay, bx: pbx, by: pby, ha, hb, wa, wb, crater } = ridges;
    sortByPeak(ridges, ids);
    let any = false;
    for (const id of ids) {
      const shift = landWrapShift(ox + w / 2, (pax[id] + pbx[id]) / 2);
      const ax = (pax[id] + shift - ox - 0.5) / 2;
      const bx = (pbx[id] + shift - ox - 0.5) / 2;
      const ay = (pay[id] - oy - 0.5) / 2;
      const by = (pby[id] - oy - 0.5) / 2;
      const reach = Math.max(wa[id], wb[id]) / 2;
      const sj0 = Math.max(0, Math.ceil(Math.min(ay, by) - reach));
      const sj1 = Math.min(gh - 1, Math.floor(Math.max(ay, by) + reach));
      if (sj0 > sj1) continue;
      const vx = bx - ax;
      const vy = by - ay;
      const len = vx * vx + vy * vy;
      const inv = len > 0 ? 1 / len : 0;
      const fa = wa[id] / 2;
      const fd = (wb[id] - wa[id]) / 2;
      const h0 = ha[id];
      const hd = hb[id] - ha[id];
      // No sample this segment cannot beat is worth the distance.
      const peak = Math.max(ha[id], hb[id]);
      const pit = crater[id] / wa[id];
      for (let j = sj0; j <= sj1; j++) {
        slice(ax, ay, bx, by, reach, j);
        const si0 = Math.max(0, Math.ceil(sliceLo));
        const si1 = Math.min(gw - 1, Math.floor(sliceHi));
        if (si0 > si1) continue;
        // A row seen for the first time this composition starts empty.
        if (rowHi[j] === -1) { G.fill(0, j * gw, (j + 1) * gw); rowHi[j] = -2; }
        const py = j - ay;
        const row = j * gw;
        let lo = gw;
        let hi = -1;
        for (let i = si0; i <= si1; i++) {
          const g = row + i;
          if (G[g] >= peak) continue;
          const pxx = i - ax;
          let t = (pxx * vx + py * vy) * inv;
          if (t < 0) t = 0;
          else if (t > 1) t = 1;
          const dx = pxx - t * vx;
          const dy = py - t * vy;
          const foot = fa + fd * t;
          const d2 = dx * dx + dy * dy;
          const f2 = foot * foot;
          if (d2 >= f2) continue;
          // (1 − d/foot)^1.5 ≤ 1 − d²/foot²: most samples another segment already beat need no root.
          const top = h0 + hd * t;
          if (top * (f2 - d2) <= G[g] * f2) continue;
          const rise = ridgeProfile(top, Math.sqrt(d2) / foot, pit);
          if (rise <= G[g]) continue;
          G[g] = rise;
          GS[g] = id;
          if (i < lo) lo = i;
          hi = i;
        }
        if (hi < 0) continue;
        if (lo < rowLo[j]) rowLo[j] = lo;
        if (hi > rowHi[j]) rowHi[j] = hi;
        any = true;
      }
    }
    return any;
  }

  /**
   * Highest segment first, so lower ones find most samples already out of
   * reach. The order is the same in every buffer: equal rises (around a shared
   * vertex) go to the same segment on both sides of a chunk edge, and
   * footRise below takes the same sum.
   */
  function sortByPeak(ridges: RidgePaths, ids: number[]): void {
    const { ha, hb } = ridges;
    ids.sort((p, q) => Math.max(ha[q], hb[q]) - Math.max(ha[p], hb[p]) || p - q);
  }

  /**
   * Fill in the rise of every pixel from the samples around it (a sample's
   * own pixel takes it, the pixels between average their two or four), cut
   * the gullies, flatten the far foot, and note each column's lifted rows.
   * Open water stays flat: the pixels `water` marks 1 in its first
   * `waterRows` rows, below them the pixels of sea tiles (`depth`, when
   * given). False when nothing rises.
   */
  function fill(ridges: RidgePaths, ox: number, oy: number, w: number, h: number, water: Uint8Array, waterRows: number, depth: Float32Array | null): boolean {
    const gw = (w >> 1) + 1;
    const gh = (h >> 1) + 1;
    allocate(w, h);
    const G = gridZ;
    const GS = gridSeg;
    const z = zBuf;
    const seg = segBuf;
    // Only what the last call wrote is not zero.
    if (dirtyHi >= dirtyLo) z.fill(0, dirtyLo, dirtyHi + 1);
    dirtyLo = Infinity;
    dirtyHi = -1;
    colLo.fill(h, 0, w);
    colHi.fill(-1, 0, w);
    if (fillHi.length < gh) { fillLo = new Int32Array(gh); fillHi = new Int32Array(gh); }
    fillHi.fill(-1, 0, gh);
    const gm = GULLY_SIZE - 1;
    liftMinX = w;
    liftMaxX = -1;
    for (let j = 0; j < gh - 1; j++) {
      const a0 = rowHi[j] >= 0;
      const c0 = rowHi[j + 1] >= 0;
      if (!a0 && !c0) continue;
      const lo = Math.min(a0 ? rowLo[j] : gw, c0 ? rowLo[j + 1] : gw);
      const hi = Math.max(rowHi[j], rowHi[j + 1]);
      const i0 = Math.max(0, lo - 1);
      const i1 = Math.min(gw - 2, hi);
      if (i0 > i1) continue;
      // Cell (i, j) covers pixels 2i..2i + 1 of rows 2j..2j + 1, inside the buffer since i ≤ gw − 2 and j ≤ gh − 2.
      fillLo[j] = 2 * i0;
      fillHi[j] = 2 * i1 + 1;
      const ra = j * gw;
      const rc = (j + 1) * gw;
      for (let i = i0; i <= i1; i++) {
        const a = a0 ? G[ra + i] : 0;
        const b = a0 ? G[ra + i + 1] : 0;
        const c = c0 ? G[rc + i] : 0;
        const d = c0 ? G[rc + i + 1] : 0;
        if (a <= 0 && b <= 0 && c <= 0 && d <= 0) continue;
        // The cell's four pixels: (2i, 2j) takes a; the others average their samples.
        for (let q = 0; q < 4; q++) {
          const xo = q & 1;
          const yo = q >> 1;
          const x = 2 * i + xo;
          const y = 2 * j + yo;
          const v0 = xo === 0 ? (yo === 0 ? a : (a + c) / 2) : (yo === 0 ? (a + b) / 2 : (a + b + c + d) / 4);
          if (v0 <= 0) continue;
          const k = y * w + x;
          if (y < waterRows ? water[k] === 1 : depth !== null && seaTile(depth, ox + x, oy + y)) continue;
          // The thresholds of the strongest sample the pixel reads.
          let s = ra + i;
          let top = a;
          if (xo && b > top) { top = b; s = ra + i + 1; }
          if (yo && c > top) { top = c; s = rc + i; }
          if (xo && yo && d > top) { s = rc + i + 1; }
          const v = v0 * (1 - gullyDepth(ridges, GS[s]) * GULLIES[((oy + y) & gm) * GULLY_SIZE + ((ox + x) & gm)]) - RISE_MIN;
          if (v <= 0) continue;
          z[k] = v;
          seg[k] = GS[s];
          if (k < dirtyLo) dirtyLo = k;
          if (k > dirtyHi) dirtyHi = k;
          if (y < colLo[x]) colLo[x] = y;
          if (y > colHi[x]) colHi[x] = y;
          if (x < liftMinX) liftMinX = x;
          if (x > liftMaxX) liftMaxX = x;
        }
      }
    }
    return liftMaxX >= 0;
  }

  /**
   * Lift the ranges in a compositor buffer whose pixel (0, 0) is world pixel
   * (ox, oy), both even. Null when no range reaches into it. The rise is
   * taken on every second world pixel and filled in between, which keeps
   * the crest sharp to a pixel at a quarter of the work.
   */
  export function riseRidges(
    ridges: RidgePaths, b: LandBuffer, art: LandArt, ox: number, oy: number, limit: number = b.h,
    place: string | null = null, coast = 0,
  ): LandRise | null {
    const ids = ridges.query(ox, oy, ox + b.w, oy + b.h);
    if (ids.length === 0) return null;
    const key = place === null ? 0 : riseKey(ridges, ids, coast);
    const kept = place === null ? undefined : RISE_CACHE.get(place);
    if (kept && kept.key === key) {
      // Used again: keep it longest.
      RISE_CACHE.delete(place as string);
      RISE_CACHE.set(place as string, kept);
      if (!recall(kept, b.w, b.h)) return null;
    } else {
      const risen = sample(ridges, ids, ox, oy, b.w, b.h) && fill(ridges, ox, oy, b.w, b.h, b.water, b.h, null);
      if (place !== null) keep(place, key, risen, b.w, b.h);
      if (!risen) return null;
    }
    colTop.fill(b.h, 0, b.w);
    lift(ridges, b, art, ox, oy, true, limit);
    return { ridges, z: zBuf, seg: segBuf, depth: depthBuf, top: colTop, bottom: colHi };
  }

  /**
   * A place's rise as fill left it — the rows that rose, each column's lifted
   * rows — kept for the next composition of the same place: most chunks are
   * composed again because their plants changed, not their ranges.
   */
  interface KeptRise {
    readonly key: number;
    /** Buffer rows y0, y0 + 1, … with the columns [xs, xe] fill went over in each, packed one after another into z and seg. */
    readonly y0: number; readonly xs: Int32Array; readonly xe: Int32Array;
    readonly z: Float32Array; readonly seg: Int32Array;
    /** Lifted columns [x0, x1] and their lifted rows. */
    readonly x0: number; readonly x1: number; readonly lo: Int32Array; readonly hi: Int32Array;
  }
  const RISE_CACHE = new Map<string, KeptRise>();
  /** Places kept, the most recently used last; a chunk's takes a few dozen kB. */
  const RISE_CACHE_MAX = 96;

  /** Forget every kept rise (tests and measurements of a first composition). */
  export function landRiseForget(): void {
    RISE_CACHE.clear();
  }

  /** What decides a place's rise: the ranges reaching into it and, from the caller, where its sea is. */
  function riseKey(r: RidgePaths, ids: readonly number[], coast: number): number {
    let h = Math.imul(0x811c9dc5 ^ coast, 0x01000193);
    const mix = (v: number): void => {
      KEY_F64[0] = v;
      h = Math.imul(Math.imul(h ^ KEY_U32[0], 0x01000193) ^ KEY_U32[1], 0x01000193);
    };
    for (const id of ids) {
      mix(r.ax[id]); mix(r.ay[id]); mix(r.bx[id]); mix(r.by[id]);
      mix(r.ha[id]); mix(r.hb[id]); mix(r.wa[id]); mix(r.wb[id]);
      mix(r.crater[id]); mix(r.rockKey[id]);
      // The id too: the kept seg buffer holds ids, and a rebuild renumbers segments of the same shape.
      mix(id);
    }
    return h >>> 0;
  }
  /** The exact bits of a number, for hashing. */
  const KEY_F64 = new Float64Array(1);
  const KEY_U32 = new Uint32Array(KEY_F64.buffer);

  const NO_ROWS = new Int32Array(0);

  function keep(place: string, key: number, risen: boolean, w: number, h: number): void {
    let entry: KeptRise;
    if (!risen) {
      entry = { key, y0: 0, xs: NO_ROWS, xe: NO_ROWS, z: new Float32Array(0), seg: NO_ROWS, x0: 0, x1: -1, lo: NO_ROWS, hi: NO_ROWS };
    } else {
      const gh = (h >> 1) + 1;
      let j0 = -1;
      let j1 = -1;
      for (let j = 0; j < gh - 1; j++) {
        if (fillHi[j] < 0) continue;
        if (j0 < 0) j0 = j;
        j1 = j;
      }
      const y0 = 2 * j0;
      const rows = 2 * (j1 - j0 + 1);
      const xs = new Int32Array(rows);
      const xe = new Int32Array(rows);
      let size = 0;
      for (let r = 0; r < rows; r++) {
        const j = j0 + (r >> 1);
        xs[r] = fillLo[j];
        xe[r] = fillHi[j];
        if (fillHi[j] >= 0) size += fillHi[j] - fillLo[j] + 1;
      }
      const z = new Float32Array(size);
      const seg = new Int32Array(size);
      for (let r = 0, at = 0; r < rows; r++) {
        if (xe[r] < 0) continue;
        const k = (y0 + r) * w;
        z.set(zBuf.subarray(k + xs[r], k + xe[r] + 1), at);
        seg.set(segBuf.subarray(k + xs[r], k + xe[r] + 1), at);
        at += xe[r] - xs[r] + 1;
      }
      const x0 = liftMinX;
      const x1 = liftMaxX;
      entry = { key, y0, xs, xe, z, seg, x0, x1, lo: colLo.slice(x0, x1 + 1), hi: colHi.slice(x0, x1 + 1) };
    }
    RISE_CACHE.delete(place);
    RISE_CACHE.set(place, entry);
    if (RISE_CACHE.size > RISE_CACHE_MAX) RISE_CACHE.delete(RISE_CACHE.keys().next().value as string);
  }

  /** Put a kept rise back into the working buffers; false when nothing rose there. */
  function recall(k: KeptRise, w: number, h: number): boolean {
    if (k.x1 < 0) return false;
    allocate(w, h);
    if (dirtyHi >= dirtyLo) zBuf.fill(0, dirtyLo, dirtyHi + 1);
    colLo.fill(h, 0, w);
    colHi.fill(-1, 0, w);
    for (let r = 0, at = 0; r < k.xs.length; r++) {
      if (k.xe[r] < 0) continue;
      const n = k.xe[r] - k.xs[r] + 1;
      const o = (k.y0 + r) * w + k.xs[r];
      zBuf.set(k.z.subarray(at, at + n), o);
      segBuf.set(k.seg.subarray(at, at + n), o);
      at += n;
    }
    colLo.set(k.lo, k.x0);
    colHi.set(k.hi, k.x0);
    dirtyLo = k.y0 * w;
    dirtyHi = (k.y0 + k.xs.length) * w - 1;
    liftMinX = k.x0;
    liftMaxX = k.x1;
    return true;
  }

  /* ------------------------------------------- for the other map layers -- */

  const NO_WATER = new Uint8Array(0);
  /** Art pixels below a buffer whose ground a range can lift into it. */
  const LIFT_BELOW = Math.ceil(RIDGE_RISE_MAX / 16) * 16;

  /**
   * How the compositor warps the ground of a w × h buffer whose pixel (0, 0)
   * is world art pixel (ox, oy), both even (a chunk buffer is at
   * (tx0·16 − 8, ty0·16 − 8)): screen pixel (x, y) shows the ground of buffer
   * pixel (x, riseDepth(rise, x, y, w)), which lies at or below y. `rise.z`
   * is the lift of each ground pixel. The ground rows it reads reach up to
   * LIFT_BELOW (32) rows past h, so the result covers w × (h + 32); compose
   * those rows of your own layer too, or treat them as empty.
   *
   * `sea` marks open water (stays flat), as the compositor's water flags do;
   * without it a pixel counts as sea when its tile lies below sea level, which
   * differs from the composed map only within the frayed coast. The arrays
   * are shared and valid until the next call of this or of the compositor.
   * Null when no range reaches into the buffer.
   */
  export function landRiseMap(field: TerrainField, ox: number, oy: number, w: number, h: number, sea: Uint8Array | null = null): LandRise | null {
    const ridges = field.ridges;
    const hh = h + LIFT_BELOW;
    const ids = ridges.query(ox, oy, ox + w, oy + hh);
    if (ids.length === 0 || !sample(ridges, ids, ox, oy, w, hh)) return null;
    if (!fill(ridges, ox, oy, w, hh, sea ?? NO_WATER, sea ? h : 0, field.depth)) return null;
    colTop.fill(hh, 0, w);
    lift(ridges, { px: new Uint8Array(0), water: new Uint8Array(0), w, h: hh }, null, ox, oy, false, h);
    return { ridges, z: zBuf, seg: segBuf, depth: depthBuf, top: colTop, bottom: colHi };
  }

  /** Whether world art pixel (wx, wy) lies on a sea tile (the field's water depth below the shallowest). */
  function seaTile(depth: Float32Array, wx: number, wy: number): boolean {
    return depth[clampY(Math.floor(wy / 16)) * GRID_W + wrapX(Math.floor(wx / 16))] < LAND_SHALLOW;
  }

  /**
   * Lift of the ground at world art pixel (wx, wy), x wrapped or not: the
   * compositor draws that ground point round(lift) art pixels higher, at
   * (wx, wy − round(lift)). 0 off the ranges and on sea tiles. It is the
   * same sum the compositor makes, bit for bit, so it matches the drawn map
   * everywhere but on the frayed coast and in rivers (water stays flat).
   */
  export function landRiseAt(field: TerrainField, wx: number, wy: number): number {
    return seaTile(field.depth, wx, wy) ? 0 : footRise(field.ridges, wx, wy).z;
  }

  /** What footRise found: the lift of the ground point and the segment it comes from (−1 where flat). */
  export interface FootRise { z: number; seg: number }
  const FOOT: FootRise = { z: 0, seg: -1 };

  /**
   * Lift of the land at world pixel (wx, wy), x wrapped or not, and its
   * segment — bit for bit what sample and fill leave for that pixel in any
   * buffer, without touching their buffers: for an object whose foot lies
   * outside the buffer it is drawn in. The result is reused by the next call.
   */
  export function footRise(ridges: RidgePaths, wx: number, wy: number): FootRise {
    FOOT.z = 0;
    FOOT.seg = -1;
    const x0 = Math.floor(wx / 2) * 2;
    const y0 = Math.floor(wy / 2) * 2;
    const ids = ridges.query(x0, y0, x0 + 3, y0 + 3);
    if (ids.length === 0) return FOOT;
    sortByPeak(ridges, ids);
    const xo = wx - x0;
    const yo = wy - y0;
    const a = sampleAt(ridges, ids, x0, y0);
    const sa = sampleSeg;
    const b = xo ? sampleAt(ridges, ids, x0 + 2, y0) : 0;
    const sb = sampleSeg;
    const c = yo ? sampleAt(ridges, ids, x0, y0 + 2) : 0;
    const sc = sampleSeg;
    const d = xo && yo ? sampleAt(ridges, ids, x0 + 2, y0 + 2) : 0;
    const sd = sampleSeg;
    // fill, for one pixel.
    const v0 = xo === 0 ? (yo === 0 ? a : (a + c) / 2) : (yo === 0 ? (a + b) / 2 : (a + b + c + d) / 4);
    if (v0 <= 0) return FOOT;
    let s = sa;
    let top = a;
    if (xo && b > top) { top = b; s = sb; }
    if (yo && c > top) { top = c; s = sc; }
    if (xo && yo && d > top) s = sd;
    const gm = GULLY_SIZE - 1;
    const v = v0 * (1 - gullyDepth(ridges, s) * GULLIES[(wy & gm) * GULLY_SIZE + (wx & gm)]) - RISE_MIN;
    if (v <= 0) return FOOT;
    FOOT.z = Math.fround(v);
    FOOT.seg = s;
    return FOOT;
  }

  let sampleSeg = -1;

  /** One rise sample at even world pixel (X, Y), as sample() takes it (its segment in sampleSeg); `ids` in sortByPeak order. */
  function sampleAt(ridges: RidgePaths, ids: readonly number[], X: number, Y: number): number {
    const { ax: pax, ay: pay, bx: pbx, by: pby, ha, hb, wa, wb, crater } = ridges;
    // The sample is (0, 0) of a buffer at (X, Y): the same exact coordinates as in any other buffer.
    let G = 0;
    sampleSeg = -1;
    for (const id of ids) {
      const shift = landWrapShift(X, (pax[id] + pbx[id]) / 2);
      const ax = (pax[id] + shift - X - 0.5) / 2;
      const bx = (pbx[id] + shift - X - 0.5) / 2;
      const ay = (pay[id] - Y - 0.5) / 2;
      const by = (pby[id] - Y - 0.5) / 2;
      const vx = bx - ax;
      const vy = by - ay;
      const len = vx * vx + vy * vy;
      const inv = len > 0 ? 1 / len : 0;
      const pxx = 0 - ax;
      const py = 0 - ay;
      let t = (pxx * vx + py * vy) * inv;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const dx = pxx - t * vx;
      const dy = py - t * vy;
      const foot = wa[id] / 2 + ((wb[id] - wa[id]) / 2) * t;
      const d2 = dx * dx + dy * dy;
      if (d2 >= foot * foot) continue;
      const rise = ridgeProfile(ha[id] + (hb[id] - ha[id]) * t, Math.sqrt(d2) / foot, crater[id] / wa[id]);
      if (rise <= G) continue;
      G = Math.fround(rise);
      sampleSeg = id;
    }
    return G;
  }

  /** Lift at the foot of tile (x, y) as the effect layers place it: world art pixel (x·16 + 8, y·16 + 15). */
  export function landRiseAtTile(field: TerrainField, x: number, y: number): number {
    return landRiseAt(field, x * 16 + 8, y * 16 + 15);
  }

  /**
   * Where the crater of the volcano cone on tile (x, y) shows: the world art
   * pixel of its centre as the compositor draws it, lifted. Null without a cone.
   */
  export function volcanoMouth(field: TerrainField, x: number, y: number): [number, number] | null {
    if (y < 0 || y >= GRID_H) return null;
    const r = field.ridges;
    const s = r.cone[y * GRID_W + wrapX(x)];
    if (s < 0) return null;
    const wx = Math.round(r.ax[s]);
    const wy = Math.round(r.ay[s]);
    return [wx, wy - ((landRiseAt(field, wx, wy) + 0.5) | 0)];
  }

  /**
   * Redraw the lifted columns front to back, shaded, with the belts and a
   * skyline rim; with `paint` false only note which ground row each screen
   * pixel shows. Each column is read into a copy first, since its lifted
   * pixels land on rows not read yet. Only rows above `limit` matter: ground
   * that cannot rise above it is left as it is (`bottom` says so).
   */
  /** The ground texture of a key; null for a key the art lacks, so the caller falls back instead of throwing mid-composition. */
  function groundTex(art: LandArt, key: number): LandTex | null {
    const g = art.ground[landKeyRank(key)];
    return g ? g[landKeyDensity(key)] ?? g[0] ?? null : null;
  }

  function lift(ridges: RidgePaths, b: LandBuffer, art: LandArt | null, ox: number, oy: number, paint: boolean, limit: number): void {
    const { px, water, w, h } = b;
    const z = zBuf;
    const seg = segBuf;
    const depth = depthBuf;
    let rock: LandTex | null = null;
    let snow: LandTex | null = null;
    if (art) {
      const T = LandTables.shared();
      rock = art.ground[landKeyRank(T.groundKey(Landscape.Rock, Substrate.Rock, 0))][0];
      snow = art.ground[landKeyRank(T.groundKey(Landscape.Snow, Substrate.Rock, 0))][0];
    }
    const shift = art ? art.shift : [];
    const { zTree, zRock, zSnow, upper, crater, rockKey } = ridges;
    const rim = art ? art.shift[LAND_SHIFT_MAX - 1] : null;
    const turf: LandTex[] = [];
    const stones: LandTex[] = [];
    const wrapW = GRID_W * 16;
    const cliff2 = CLIFF_SLOPE * CLIFF_SLOPE;
    const snowCliff2 = SNOW_CLIFF_SLOPE * SNOW_CLIFF_SLOPE;
    if (colPx.length < h) { colPx = new Uint8Array(h); colWater = new Uint8Array(h); }
    const deepest = limit + RIDGE_RISE_MAX - 1;
    for (let x = liftMinX; x <= liftMaxX; x++) {
      const lo = colLo[x];
      if (colHi[x] < 0) continue;
      const hi = colHi[x] < deepest ? colHi[x] : deepest;
      colHi[x] = hi;
      if (hi < lo) continue;
      if (paint) for (let y = lo, k = lo * w + x; y <= hi; y++, k += w) { colPx[y] = px[k]; colWater[y] = water[k]; }
      const wx = ox + x;
      const bx = (wx >> 1) & 3;
      const left = x > 0 ? -1 : 0;
      const right = x + 1 < w ? 1 : 0;
      let top = hi + 1;
      // The ground row of the nearer pixels drawn last, for the skyline rim.
      let prev = -1;
      for (let y = hi; y >= lo; y--) {
        const k = y * w + x;
        const zz = z[k];
        const sy = y - ((zz + 0.5) | 0);
        if (sy >= top) continue;
        const r0 = sy < 0 ? 0 : sy;
        // Skyline: the nearer pixel's top row has much farther ground right above it.
        if (paint && rim && prev >= 0 && prev - y >= SKYLINE_GAP && z[prev * w + x] > 0) {
          const o = top * w + x;
          if (water[o] === 0) px[o] = rim[px[o]];
        }
        prev = y;
        if (!paint || zz <= 0) {
          if (paint) for (let r = r0, o = r0 * w + x; r < top; r++, o += w) { px[o] = colPx[y]; water[o] = colWater[y]; depth[o] = y; }
          else for (let r = r0, o = r0 * w + x; r < top; r++, o += w) depth[o] = y;
          top = sy;
          continue;
        }
        const s = seg[k];
        // Which belt the lifted ground lies in, by the crest's temperature at this height.
        const gx = (z[k + right] - z[k + left]) / 2;
        const gy = (z[y + 1 < h ? k + w : k] - z[y > 0 ? k - w : k]) / 2;
        const steep = gx * gx + gy * gy;
        const rk = rockKey[s] ?? 0;
        const stone = rk === 0 ? rock : stones[rk] ?? (stones[rk] = groundTex(art as LandArt, rk) ?? (rock as LandTex));
        let slope = SLOPE_GAIN_X * gx + SLOPE_GAIN_Y * gy;
        // A cone's belts follow its height alone: its flanks are steep all over, and would all be cliff.
        let cliff = cliff2;
        let snowCliff = snowCliff2;
        let pit = false;
        if (crater[s] > 0) {
          cliff = Infinity;
          snowCliff = Infinity;
          // Lit from the left, softer than a range so its ravines show; its
          // front, all of it in view, would go dark from the downhill slope.
          slope = Math.min(CONE_LIGHT_MAX, CONE_GAIN_X * gx + CONE_GAIN_Y * gy) - CONE_DARKEN;
          // The crater: a dark rock pit inside a lit lip; ravines run down the flanks.
          let dx = wx - ridges.ax[s];
          dx -= Math.round(dx / wrapW) * wrapW;
          const dy = oy + y - ridges.ay[s];
          const d2 = dx * dx + dy * dy;
          const c = crater[s];
          if (d2 < (c - 1) * (c - 1)) { slope = -CRATER_SHADE; pit = true; }
          else if (d2 < (c + 1) * (c + 1)) slope = CRATER_LIP;
          else if (Math.cos(CONE_RIBS * Math.atan2(dy, dx) + s) > CONE_RIB_EDGE) slope -= 1;
        }
        let tex: LandTex | null = null;
        if (pit) tex = stone;
        else if (zz >= zSnow[s]) tex = steep > snowCliff ? stone : snow;
        else if (zz >= zRock[s] || steep > cliff) tex = stone;
        else if (zz >= zTree[s] && upper[s]) {
          const u = upper[s];
          tex = turf[u] ?? (turf[u] = groundTex(art as LandArt, u) ?? (rock as LandTex));
        }
        const wet = colWater[y];
        const ground = colPx[y];
        const tpx = tex !== null && wet === 0 ? tex.px : null;
        const tm = tex !== null ? tex.size - 1 : 0;
        const tcol = wx & tm;
        const tsh = tex !== null ? 31 - Math.clz32(tex.size) : 0;
        for (let r = r0, o = r0 * w + x; r < top; r++, o += w) {
          const wy = oy + r;
          const v = tpx !== null ? tpx[((wy & tm) << tsh) + tcol] : ground;
          let by = Math.floor(slope + BAYER4[((wy >> 1) & 3) * 4 + bx]);
          if (by > SLOPE_LIMIT) by = SLOPE_LIMIT;
          else if (by < -SLOPE_LIMIT) by = -SLOPE_LIMIT;
          px[o] = by === 0 || wet !== 0 ? v : shift[LAND_SHIFT_MAX + by][v];
          water[o] = wet;
          depth[o] = y;
        }
        top = sy;
      }
      colTop[x] = top < 0 ? 0 : top;
      // The topmost lifted pixel against the flat ground above it; a cone's whole outline, so it stands out on ground of its own colour.
      const tz = prev >= 0 ? z[prev * w + x] : 0;
      if (paint && rim && top >= 1 && tz > 0) {
        const o = top * w + x;
        const outline = crater[seg[prev * w + x]] > 0 && tz >= CONE_OUTLINE_Z;
        if (water[o] === 0 && (outline || prev - (top - 1) >= SKYLINE_GAP)) px[o] = (outline ? shift[LAND_SHIFT_MAX - CONE_OUTLINE_SHADE] : rim)[px[o]];
      }
    }
  }
}
