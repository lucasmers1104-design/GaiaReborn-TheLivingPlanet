/* =============================================================================
 * SimEarth 2.0 — a tidal wave on the open sea
 * -----------------------------------------------------------------------------
 * docs/ereignisse-spec.md §3.5. The wave is made of the sea itself: every sea
 * pixel the composed terrain shows (landsurf.ts `sea`) steps along one colour
 * ladder, water0 … water7, ice2 … ice4, white0, by how far behind the front
 * it lies. The front is the line where the wave's arrival field (bilinear
 * between tile centres) meets the screen's wave time Tvis = age − 1 + phase:
 *   drawdown  a faint darkening runs ahead of it
 *   face      the sea brightens towards the crest
 *   crest     a thin line, brighter and wider the stronger the wave and the
 *             shallower the water, lit on its edge towards the top left
 *   back      foam the crest leaves behind dissolves where it lies
 *   trough    a faint darkening, then a second, weaker crest
 * The wave fades out with its energy by dissolving (ordered dither in world
 * pixels), never at a hard edge. Omen and start marks (FxScene.seaMarks) are
 * painted into the same pixels. One art pixel per buffer pixel, rebuilt when
 * the front has moved an art pixel; the coast, breakers and run-up are drawn
 * over it (fxshore.ts, fxground.ts).
 * ========================================================================== */

namespace SE {
  /** Wavelength in deep water, art px, and the share it shortens by in the shallows. */
  const L_DEEP = 56;
  const L_SHOAL = 0.5;
  /** Band widths in wavelengths: drawdown ahead, face, back, trough, and where the second crest rides. */
  const DRAW = 0.3;
  const FACE = 0.15;
  const BACK = 0.45;
  const TROUGH = 0.25;
  const CREST2 = 0.95;
  /** Strength × energy that makes the brightest wave. */
  const A_REF = 1.4;
  /** Amplitude over which a dying wave dissolves. */
  const FADE0 = 0.04;
  const FADE1 = 0.2;
  /** Build time (smoothed) above which the faint drawdown and trough bands are left out, ms. */
  const GUARD_MS = 2;
  /** "Effekte reduzieren": a new picture at most this often, ms. */
  const REDUCE_STEP_MS = 100;
  /** Zoomed out, one sample per this many art px. */
  const FAR_SAMPLE = 4;
  /** Below this many px a tile, paint 2×2 art-px blocks (zoom 16 shows art px 1:1, so it stays fine-grained). */
  const NEAR_TILE = 24;
  /** Tiles built around the view. */
  const MARGIN = 2;
  /** Rebuild when the wave time moved this much, ticks: about an art pixel of deep-sea travel. */
  const TIME_STEP = 1 / 48;
  /** The same over GUARD_MS: every other frame at speed 3 (30 pictures a second). */
  const SLOW_STEP = 4 * TIME_STEP;
  const CHUNK_PX = LAND_CHUNK * 16;
  const WORLD_PX = GRID_W * 16;
  /** Ladder position of each lagoon turquoise (waterWarm), by lightness. */
  const LAGOON_LADDER = [5, 6, 6, 7];
  /** Ladder positions above the water ramp. */
  const P_ICE2 = 8;
  const P_ICE3 = 9;
  const P_ICE4 = 10;
  const P_WHITE = 11;
  const LIGHT = Math.SQRT1_2;

  /** The crest's floor on the ladder for crest intensity c. */
  function crestFloor(c: number): number {
    return c < 0.2 ? 0 : c < 0.45 ? 5 : c < 0.65 ? 7 : c < 0.85 ? P_ICE3 : P_ICE4;
  }

  /** Value noise, size² px wrapping, on a lattice of `cell` px. */
  function valueNoise(size: number, cell: number, seed: number): Float32Array {
    const n = size / cell;
    const out = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      const gy = Math.floor(y / cell);
      const fy = smoothstep((y % cell) / cell);
      for (let x = 0; x < size; x++) {
        const gx = Math.floor(x / cell);
        const fx = smoothstep((x % cell) / cell);
        const a = landHash(gx, gy, seed);
        const b = landHash((gx + 1) % n, gy, seed);
        const c = landHash(gx, (gy + 1) % n, seed);
        const d = landHash((gx + 1) % n, (gy + 1) % n, seed);
        out[y * size + x] = lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
      }
    }
    return out;
  }

  let wobble: Float32Array | null = null;
  let flecks: Float32Array | null = null;

  export class SeaWave {
    private canvas: HTMLCanvasElement | null = null;
    private cctx: CanvasRenderingContext2D | null = null;
    private img: ImageData | null = null;
    private words = new Uint32Array(0);
    private rank = new Uint8Array(0);
    private w = 0;
    private h = 0;
    /** Origin tile of the buffer, unwrapped. */
    private ox = 0;
    private oy = 0;
    /** Pixels written by the last build: x0, y0, x1, y1 (exclusive); empty when x1 ≤ x0. */
    private box = [0, 0, 0, 0];
    private key = '';
    private builtAt = -Infinity;
    /** Build time, smoothed, ms. */
    private cost = 0;
    /** Ladder position → palette index, and palette index → ladder position (7 off the water ramp). */
    private readonly ladder = new Uint8Array(12);
    private readonly pos = new Uint8Array(256).fill(7);
    private ladderOf: LandArt | null = null;
    /** Per tile centre around the view, for the wave being painted: arrival, slowness, energy, travel direction. */
    private cT = new Float32Array(0);
    private cS = new Float32Array(0);
    private cE = new Float32Array(0);
    private cX = new Float32Array(0);
    private cY = new Float32Array(0);
    /** Below NEAR_TILE px a tile: the sea of the tile being painted and the 2×2 block's first pixel in it. */
    private blkSea: Uint8Array | null = null;
    private blkAt = 0;

    draw(ctx: CanvasRenderingContext2D, world: WorldState, cam: LandCamera, land: PixelTerrain, s: FxScene, now: number): void {
      const art = land.art;
      if (!art || !land.ready) return;
      let waves = '';
      for (const h of world.hazards.list) if (h.wave && h.wave.at.length > 0) waves += `${h.id}:${Math.floor((h.age - 1 + s.phase) / (this.cost > GUARD_MS ? SLOW_STEP : TIME_STEP))},`;
      if (waves === '' && s.seaMarks.length === 0) {
        this.key = '';
        return;
      }
      const T = cam.tilePx * cam.dpr;
      const ox = Math.floor(cam.scrollX) - MARGIN;
      const oy = Math.floor(cam.scrollY) - MARGIN;
      const tw = Math.ceil(ctx.canvas.width / T) + 2 * MARGIN + 1;
      const th = Math.ceil(ctx.canvas.height / T) + 2 * MARGIN + 1;
      const key = `${ox}|${oy}|${tw}|${th}|${T}|${+s.reduce}|${waves}|${s.seaMarks.length > 0 ? now : ''}`;
      if (key !== this.key && !(s.reduce && now - this.builtAt < REDUCE_STEP_MS)) {
        this.key = key;
        this.builtAt = now;
        const t0 = performance.now();
        this.build(world, land, art, s, cam.tilePx, ox, oy, tw, th);
        this.cost = 0.8 * this.cost + 0.2 * (performance.now() - t0);
      }
      const [x0, y0, x1, y1] = this.box;
      if (x1 <= x0 || !this.canvas) return;
      const smooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.setTransform(T / 16, 0, 0, T / 16, (this.ox - cam.scrollX) * T, (this.oy - cam.scrollY) * T);
      ctx.drawImage(this.canvas, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = smooth;
    }

    private build(world: WorldState, land: PixelTerrain, art: LandArt, s: FxScene, tilePx: number,
      ox: number, oy: number, tw: number, th: number): void {
      const w = tw * 16;
      const h = th * 16;
      if (!this.canvas || this.w !== w || this.h !== h) {
        this.canvas = this.canvas ?? document.createElement('canvas');
        this.canvas.width = w;
        this.canvas.height = h;
        this.cctx = this.canvas.getContext('2d');
        this.img = this.cctx ? this.cctx.createImageData(w, h) : null;
        this.words = this.img ? new Uint32Array(this.img.data.buffer) : new Uint32Array(0);
        this.rank = new Uint8Array(w * h);
        this.w = w;
        this.h = h;
        this.box = [0, 0, 0, 0];
      }
      if (!this.img || !this.cctx) return;
      if (this.ladderOf !== art) {
        this.ladderOf = art;
        const ice = art.manifest.ramps.ice;
        art.water.forEach((p, k) => { this.ladder[k] = p; this.pos[p] = k; });
        // Lagoon turquoise climbs the ladder from the water step of its lightness.
        art.waterWarm.forEach((p, k) => { if (art.water.indexOf(p) < 0) this.pos[p] = LAGOON_LADDER[k]; });
        this.ladder[P_ICE2] = ice[2];
        this.ladder[P_ICE3] = ice[3];
        this.ladder[P_ICE4] = ice[4];
        this.ladder[P_WHITE] = art.manifest.ramps.white[0];
      }
      const old = this.box;
      for (let y = old[1]; y < old[3]; y++) {
        this.words.fill(0, y * w + old[0], y * w + old[2]);
        this.rank.fill(0, y * w + old[0], y * w + old[2]);
      }
      this.ox = ox;
      this.oy = oy;
      this.box = [w, h, 0, 0];
      const n = (tw + 2) * (th + 2);
      if (this.cT.length < n) {
        this.cT = new Float32Array(n);
        this.cS = new Float32Array(n);
        this.cE = new Float32Array(n);
        this.cX = new Float32Array(n);
        this.cY = new Float32Array(n);
      }
      wobble = wobble ?? valueNoise(256, 8, 420);
      flecks = flecks ?? valueNoise(64, 2, 423);
      for (const hz of world.hazards.list) if (hz.wave && hz.wave.at.length > 0) this.paintWave(world, land, hz, hz.wave, s, tilePx, tw, th);
      for (const m of s.seaMarks) this.paintMark(land, m, s.reduce);
      const b = this.box;
      const ux0 = Math.min(old[0], b[0]);
      const uy0 = Math.min(old[1], b[1]);
      const ux1 = Math.max(old[2], b[2]);
      const uy1 = Math.max(old[3], b[3]);
      if (ux1 > ux0 && uy1 > uy0) this.cctx.putImageData(this.img, 0, 0, ux0, uy0, ux1 - ux0, uy1 - uy0);
    }

    /** The sea's palette index at world art pixel (x, y), x unwrapped; 0 off the sea. */
    private static seaAt(land: PixelTerrain, x: number, y: number): number {
      if (y < 0 || y >= GRID_H * 16) return 0;
      const wx = ((x % WORLD_PX) + WORLD_PX) % WORLD_PX;
      const m = land.motion(Math.floor(wx / CHUNK_PX), Math.floor(y / CHUNK_PX));
      return m && m.sea ? m.sea[(y % CHUNK_PX) * CHUNK_PX + (wx % CHUNK_PX)] : 0;
    }

    /** Write ladder position p over buffer pixel o (sea colour at b) if `rank` outranks what is there. */
    private put(o: number, bx: number, by: number, p: number, b: number, rank: number): void {
      if (rank <= this.rank[o]) return;
      const q = p < 0 ? 0 : p > P_WHITE ? P_WHITE : p;
      if (q === b) return;
      this.rank[o] = rank;
      this.words[o] = this.ladderOf!.rgba[this.ladder[q]];
      const box = this.box;
      if (bx < box[0]) box[0] = bx;
      if (by < box[1]) box[1] = by;
      if (bx >= box[2]) box[2] = bx + 1;
      if (by >= box[3]) box[3] = by + 1;
    }

    /** put() for the wave bands; below NEAR_TILE over the 2×2 block, each sea pixel shifted from its own colour. */
    private putPx(o: number, bx: number, by: number, p: number, b: number, rank: number): void {
      const sea = this.blkSea;
      if (!sea) { this.put(o, bx, by, p, b, rank); return; }
      for (let yy = 0; yy < 2; yy++) {
        for (let xx = 0; xx < 2; xx++) {
          const si = sea[this.blkAt + yy * CHUNK_PX + xx];
          if (si === 0) continue;
          const b2 = this.pos[si];
          this.put(o + yy * this.w + xx, bx + xx, by + yy, p + b2 - b, b2, rank);
        }
      }
    }

    private paintWave(world: WorldState, land: PixelTerrain, hz: Hazard, wave: TidalWave, s: FxScene,
      tilePx: number, tw: number, th: number): void {
      const Tvis = hz.age - 1 + s.phase;
      const amp = Math.max(1, hz.strength ?? 1) / A_REF;
      const far = s.zoomedOut;
      const faint = this.cost <= GUARD_MS && !far;
      const second = !s.reduce && !far && tilePx >= NEAR_TILE;
      const ahead = faint ? DRAW : 0;
      // Where the last band drawn ends, in wavelengths (+ crest width and jitter, px).
      const tail = second ? CREST2 : faint ? FACE + BACK + TROUGH : FACE + BACK;
      const uLo = -ahead * L_DEEP - 3;
      const uHi = tail * L_DEEP + 8;
      const minWidth = tilePx < NEAR_TILE ? 3 : 1;
      const step = far ? FAR_SAMPLE : tilePx < NEAR_TILE ? 2 : 1;
      const half = step === 2;
      const { cT, cS, cE, cX, cY } = this;
      const cw = tw + 2;
      // Tile centres [ox − 1, ox + tw] × [oy − 1, oy + th].
      for (let j = 0; j < th + 2; j++) {
        const ty = this.oy - 1 + j;
        for (let i = 0; i < cw; i++) {
          const k = j * cw + i;
          const c = ty < 0 || ty >= GRID_H ? -1 : waveCell(wave, this.ox - 1 + i, ty);
          const t = c < 0 ? Infinity : wave.at[c];
          if (!Number.isFinite(t)) { cT[k] = Infinity; continue; }
          cT[k] = t;
          cS[k] = waveTicks(world.elevation[ty * GRID_W + wrapX(this.ox - 1 + i)]);
          cE[k] = wave.energy[c];
          const a = wave.angle[c];
          cX[k] = Number.isNaN(a) ? 0 : Math.cos(a);
          cY[k] = Number.isNaN(a) ? 0 : Math.sin(a);
        }
      }
      const N1 = wobble!;
      const N2 = flecks!;
      const jit = s.reduce || far ? 0 : 1;
      for (let j = 0; j < th; j++) {
        const ty = this.oy + j;
        if (ty < 0 || ty >= GRID_H) continue;
        for (let i = 0; i < tw; i++) {
          const tx = this.ox + i;
          // The 3×3 centres round the tile: in reach and in the time window?
          let lo = Infinity;
          let hi = -Infinity;
          let slow = 0;
          let eMax = 0;
          for (let dy = 0; dy < 3; dy++) {
            for (let dx = 0; dx < 3; dx++) {
              const k = (j + dy) * cw + i + dx;
              const t = cT[k];
              if (t === Infinity) continue;
              if (t < lo) lo = t;
              if (t > hi) hi = t;
              if (cS[k] > slow) slow = cS[k];
              if (cE[k] > eMax) eMax = cE[k];
            }
          }
          if (lo === Infinity || amp * eMax < FADE0) continue;
          if (Tvis < lo - (ahead * L_DEEP * slow) / 16 - 0.1 || Tvis > hi + ((CREST2 * L_DEEP + 6) * slow) / 16) continue;
          if (world.tech[ty * GRID_W + wrapX(tx)] !== Tech.None) continue;
          const wx0 = wrapX(tx) * 16;
          const m = land.motion(Math.floor(wx0 / CHUNK_PX), Math.floor((ty * 16) / CHUNK_PX));
          const sea = m && m.sea;
          if (!sea) continue;
          this.blkSea = half ? sea : null;
          const seaRow = (ty * 16) % CHUNK_PX;
          const seaCol = wx0 % CHUNK_PX;
          for (let qy = 0; qy < 2; qy++) {
            for (let qx = 0; qx < 2; qx++) {
              const k00 = (j + qy) * cw + i + qx;
              const k10 = k00 + 1;
              const k01 = k00 + cw;
              const k11 = k01 + 1;
              const m00 = cT[k00] !== Infinity ? 1 : 0;
              const m10 = cT[k10] !== Infinity ? 1 : 0;
              const m01 = cT[k01] !== Infinity ? 1 : 0;
              const m11 = cT[k11] !== Infinity ? 1 : 0;
              if (m00 + m10 + m01 + m11 === 0) continue;
              const T00 = m00 ? cT[k00] : 0, T10 = m10 ? cT[k10] : 0, T01 = m01 ? cT[k01] : 0, T11 = m11 ? cT[k11] : 0;
              const S00 = m00 ? cS[k00] : 0, S10 = m10 ? cS[k10] : 0, S01 = m01 ? cS[k01] : 0, S11 = m11 ? cS[k11] : 0;
              // The quadrant's arrival and slowness lie between its corners': skip it whole when no pixel can be in a band.
              const tLo = Math.min(m00 ? T00 : Infinity, m10 ? T10 : Infinity, m01 ? T01 : Infinity, m11 ? T11 : Infinity);
              const tHi = Math.max(m00 ? T00 : -Infinity, m10 ? T10 : -Infinity, m01 ? T01 : -Infinity, m11 ? T11 : -Infinity);
              const sLo = Math.min(m00 ? S00 : Infinity, m10 ? S10 : Infinity, m01 ? S01 : Infinity, m11 ? S11 : Infinity);
              const sHi = Math.max(S00, S10, S01, S11);
              if (((Tvis - tHi) * 16) / sHi > uHi) continue;
              if (((Tvis - tLo) * 16) / (Tvis < tLo ? sHi : sLo) < uLo) continue;
              const E00 = m00 ? cE[k00] : 0, E10 = m10 ? cE[k10] : 0, E01 = m01 ? cE[k01] : 0, E11 = m11 ? cE[k11] : 0;
              let dirX = m00 * cX[k00] + m10 * cX[k10] + m01 * cX[k01] + m11 * cX[k11];
              let dirY = m00 * cY[k00] + m10 * cY[k10] + m01 * cY[k01] + m11 * cY[k11];
              const dl = Math.hypot(dirX, dirY) || 1;
              dirX /= dl;
              dirY /= dl;
              const lit = -(dirX + dirY) * LIGHT;
              for (let ly = qy * 8; ly < qy * 8 + 8; ly += step) {
                const sy = far ? ly + 2 : ly;
                const fy = qy === 0 ? (sy + 8.5) / 16 : (sy - 7.5) / 16;
                const y = ty * 16 + sy;
                const by = j * 16 + ly;
                for (let lx = qx * 8; lx < qx * 8 + 8; lx += step) {
                  const sx = far ? lx + 2 : lx;
                  const at = (seaRow + sy) * CHUNK_PX + seaCol + sx;
                  const seaIdx = sea[at];
                  if (seaIdx === 0) continue;
                  this.blkAt = at;
                  const fx = qx === 0 ? (sx + 8.5) / 16 : (sx - 7.5) / 16;
                  const w00 = (1 - fx) * (1 - fy) * m00;
                  const w10 = fx * (1 - fy) * m10;
                  const w01 = (1 - fx) * fy * m01;
                  const w11 = fx * fy * m11;
                  const W = w00 + w10 + w01 + w11;
                  const t = (w00 * T00 + w10 * T10 + w01 * T01 + w11 * T11) / W;
                  const sl = (w00 * S00 + w10 * S10 + w01 * S01 + w11 * S11) / W;
                  const x = tx * 16 + sx;
                  const S = clamp((sl - WAVE_TICKS_DEEP) / (WAVE_TICKS_SHALLOW - WAVE_TICKS_DEEP), 0, 1);
                  const L = L_DEEP * (1 - L_SHOAL * S);
                  let u = ((Tvis - t) * 16) / sl;
                  if (u < -ahead * L - 3 || u > tail * L + 8) continue;
                  const A = clamp(amp * ((w00 * E00 + w10 * E10 + w01 * E01 + w11 * E11) / W), 0, 1);
                  if (A < FADE0) continue;
                  u += jit * (N1[(y & 255) * 256 + (x & 255)] - 0.5) * (2 + 2 * A);
                  const F = smoothstep(clamp((A - FADE0) / (FADE1 - FADE0), 0, 1));
                  const c = A * (0.55 + 0.45 * S);
                  const bx = i * 16 + lx;
                  const o = by * this.w + bx;
                  const b = this.pos[seaIdx];
                  const face = FACE * L;
                  if (far) {
                    if (u < face - 2 || u >= face + 2) continue;
                    const p = A < 0.5 ? P_ICE3 : A < 0.85 ? P_ICE4 : P_WHITE;
                    for (let yy = 0; yy < step; yy++) for (let xx = 0; xx < step; xx++) this.put(o + yy * this.w + xx, bx + xx, by + yy, p, b, 4);
                    continue;
                  }
                  const B = half ? BAYER4[((y >> 1) & 3) * 4 + ((x >> 1) & 3)] : BAYER4[(y & 3) * 4 + (x & 3)];
                  if (u < 0) {
                    if (!faint || u < -DRAW * L) continue;
                    const q = 1 + u / (DRAW * L);
                    if (A > 0.7 && B < 0.25 * q) this.putPx(o, bx, by, b - 2, b, 1);
                    else if (B < F * (0.25 + 0.35 * A) * q) this.putPx(o, bx, by, b - 1, b, 1);
                    continue;
                  }
                  if (u < face) {
                    if (B < F * (0.3 + (0.7 * u) / face)) this.putPx(o, bx, by, b + 1, b, 2);
                    continue;
                  }
                  const wc = Math.max(minWidth, 1 + Math.round(1.5 * A + 2 * S * A));
                  const crestEnd = face + wc;
                  const Fo = F * clamp(A * (0.3 + 0.7 * S) - 0.15, 0, 1);
                  if (u < crestEnd) {
                    if (B >= F) continue;
                    let p = Math.max(b + 2, crestFloor(c));
                    if (c >= 0.45 && ((lit > 0.3 && u - face < 1) || (lit < -0.3 && crestEnd - u <= 1))) p++;
                    else if (!s.reduce && c >= 0.65 && landHash(Math.floor((x * -dirY + y * dirX) / 3), Math.floor(u / 2), 422) < 0.5 * Fo) p = P_ICE3;
                    this.putPx(o, bx, by, s.reduce ? Math.min(p, P_ICE3) : p, b, 4);
                    continue;
                  }
                  const backEnd = crestEnd + BACK * L;
                  if (u < backEnd) {
                    const f = (u - crestEnd) / (BACK * L);
                    const h2 = 0.55 * N2[(y & 63) * 64 + (x & 63)] + 0.45 * B;
                    if (!s.reduce && h2 < 0.4 * Fo * (1 - f)) this.putPx(o, bx, by, P_ICE3, b, 3);
                    else if (h2 < Fo * Math.pow(1 - f, 1.5)) this.putPx(o, bx, by, P_ICE2, b, 3);
                    else if (B < F * (1 - f)) this.putPx(o, bx, by, b + 1, b, 2);
                    continue;
                  }
                  const troughEnd = backEnd + TROUGH * L;
                  if (u < troughEnd) {
                    if (faint && B < F * 0.3 * A * (1 - (u - backEnd) / (TROUGH * L))) this.putPx(o, bx, by, b - 1, b, 1);
                    continue;
                  }
                  if (second && A >= 0.4 && u >= CREST2 * L && u < CREST2 * L + 1 && B < 0.8 * F) {
                    this.putPx(o, bx, by, Math.max(b + 1, crestFloor(c / 2)), b, 4);
                  }
                }
              }
            }
          }
        }
      }
    }

    /** A mark on the sea (FxScene.seaMarks): drawdown, dome or cavity. */
    private paintMark(land: PixelTerrain, m: SeaMark, reduce: boolean): void {
      const R = m.r;
      const ox = this.ox * 16;
      const oy = this.oy * 16;
      const span = WORLD_PX;
      // The copy of the mark nearest the buffer.
      const cx = m.x + Math.round((ox + this.w / 2 - m.x) / span) * span;
      for (let y = Math.floor(m.y - R); y <= Math.ceil(m.y + R); y++) {
        const by = y - oy;
        if (by < 0 || by >= this.h) continue;
        for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
          const bx = x - ox;
          if (bx < 0 || bx >= this.w) continue;
          const r = Math.hypot(x + 0.5 - cx, y + 0.5 - m.y);
          if (r >= R) continue;
          const seaIdx = SeaWave.seaAt(land, x, y);
          if (seaIdx === 0) continue;
          const b = this.pos[seaIdx];
          const o = by * this.w + bx;
          const B = BAYER4[(y & 3) * 4 + (x & 3)];
          const k = m.k;
          const rim = r >= R - 1;
          if (m.kind === 'draw') {
            const p = m.p;
            if (rim) { if (B < 0.6 * k) this.put(o, bx, by, b + 1, b, 2); continue; }
            const wx = ((x % span) + span) % span;
            if (!reduce && landHash(wx, y, 421) < 0.15 * p * k) this.put(o, bx, by, P_ICE2, b, 3);
            else if (r < R / 2 && B < 0.4 * p * k) this.put(o, bx, by, b - 2, b, 1);
            else if (B < (0.3 + 0.5 * p) * k) this.put(o, bx, by, b - 1, b, 1);
          } else if (m.kind === 'dome') {
            if (r < R / 2 && B < 0.5 * k) this.put(o, bx, by, b + 2, b, 4);
            else if (B < 0.7 * k) this.put(o, bx, by, b + 1, b, 2);
          } else if (rim) {
            if (B < k) this.put(o, bx, by, P_ICE3, b, 4);
          } else if (B < 0.8 * k) {
            this.put(o, bx, by, b - 2, b, 1);
          }
        }
      }
    }
  }
}
