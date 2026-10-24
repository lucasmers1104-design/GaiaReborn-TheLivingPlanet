/* =============================================================================
 * Gaia Reborn — water effects (experimental): caustics and a glint
 * -----------------------------------------------------------------------------
 * Optional, off by default ("Wassereffekte verbessern (experimentell)"):
 *   - caustics: slow, wandering lines of light on the corals, the reef sand
 *     and the water of reefs and lagoons, so they read as lying under water;
 *   - glint: now and then a short crest a step lighter on the open sea, in
 *     broad zones drifting over it; never within 5 px of ground, where the
 *     surf (watermotion.ts) and the reef swell (reefswell.ts) live.
 * Both only lift the composed colour to a palette colour, one art pixel
 * each, on the terrain's pixel grid; the picture comes from WebGL2
 * (waterfxgl.ts) and is copied into the map right over the cached terrain,
 * under the surf, the swell and everything standing or moving on the map.
 * Its masks are the composed chunks' own (LandMotion.sea: corals and reef
 * sand under water are sea there; cays, palms, beaches and ice are not),
 * uploaded when a chunk is composed anew, and per tile the field's reefs and
 * lagoons and what the base picture paints over the sea (cities, event
 * icons) or what moves there (a tidal wave, a dissolving chunk).
 * A new picture every STEP_MS (with the surf's) or when the view moves a
 * tile; weaker zoomed out, gone below MIN_TILE. Nothing runs while off, with
 * "Effekte reduzieren", prefers-reduced-motion, the oceans hidden or a
 * climate overlay; without WebGL2, a failed shader or a lost context the
 * map keeps its water as before, for the session.
 * ========================================================================== */

namespace SE {
  /** Seven pictures a second, in step with the surf. */
  const STEP_MS = 140;
  /** CSS px per tile from which the effects show, at LOW strength, full from FULL_TILE. */
  const MIN_TILE = 16;
  const FULL_TILE = 32;
  const LOW = 0.35;
  /** Chunks (64 KiB each) uploaded per picture at most: a first view fills in over a few frames, never in one long one. */
  const UPLOADS_PER_PICTURE = 8;
  /** The shader's clock starts over after this long, s: a float on the GPU loses its fractions with hours. */
  const CLOCK_WRAP_S = 7200;
  const CHUNK_PX = LAND_CHUNK * 16;
  const CHUNKS_X = GRID_W / LAND_CHUNK;

  /** For tools/perf-bench.js: counters that only grow. */
  export const waterFxStats = { active: false, renders: 0, chunkUploads: 0, uploadBytes: 0, tileUploads: 0, canvasPx: 0 };

  /** `?waterfx=on|off`: the switch's value for this page load only, or null. */
  export function waterFxQuery(search: string): boolean | null {
    const m = /[?&]waterfx=(on|off)(&|$)/.exec(search);
    return m ? m[1] === 'on' : null;
  }

  /** How strongly the effects show at a zoom, 0..1. */
  export function waterFxStrength(tilePx: number): number {
    if (tilePx < MIN_TILE) return 0;
    return LOW + (1 - LOW) * clamp((tilePx - MIN_TILE) / (FULL_TILE - MIN_TILE), 0, 1);
  }

  /**
   * 256 × 3 RGBA: per palette index the colour a caustic lifts it to (the
   * reef swell's lift, reefSwellLift), the colour a glint lifts open water
   * to (a step up its ramp) and its core (two steps); none onto foam, ice or
   * white.
   */
  export function waterFxColors(art: LandArt): Uint8Array {
    const pal = art.manifest.palette;
    const out = new Uint8Array(256 * 3 * 4);
    const lift = reefSwellLift(art);
    const up = art.shift[LAND_SHIFT_MAX + 1];
    const up2 = art.shift[LAND_SHIFT_MAX + 2];
    const glare = new Uint8Array(256);
    glare[art.water[art.water.length - 1]] = 1;
    for (const i of [...(art.manifest.ramps.ice ?? []), ...(art.manifest.ramps.white ?? [])]) glare[i] = 1;
    const put = (row: number, i: number, c: number): void => {
      out.set([pal[c][0], pal[c][1], pal[c][2], 255], (row * 256 + i) * 4);
    };
    for (let i = 1; i < pal.length; i++) {
      if (lift[i] !== 0 && !glare[lift[i]]) put(0, i, lift[i]);
      if (!art.isWater[i] || up[i] === i || glare[up[i]]) continue;
      put(1, i, up[i]);
      if (up2[i] !== up[i] && !glare[up2[i]]) put(2, i, up2[i]);
    }
    return out;
  }

  /**
   * FNV-1a over a chunk's sea mask. A running planet recomposes chunks many
   * times a second for their land and plants (bio scenario: ~70 a second in
   * view); their sea mostly stays the same and needs no upload.
   */
  function seaHash(sea: Uint8Array): number {
    let h = 0x811c9dc5;
    if ((sea.byteOffset & 3) === 0) {
      const words = new Uint32Array(sea.buffer, sea.byteOffset, sea.length >> 2);
      for (let i = 0; i < words.length; i++) h = Math.imul(h ^ words[i], 0x01000193);
    } else {
      for (let i = 0; i < sea.length; i++) h = Math.imul(h ^ sea[i], 0x01000193);
    }
    return h >>> 0;
  }

  export type WaterFxState = 'off' | 'on' | 'reduced' | WaterFxFailure;

  /** The settings dialog's line under the switch, '' when there is nothing to say. */
  export function waterFxNote(state: WaterFxState): string {
    switch (state) {
      case 'nowebgl': return 'Standardwasser aktiv: WebGL2 ist hier nicht verfügbar.';
      case 'shader': return 'Standardwasser aktiv: der Wasser-Shader ließ sich nicht starten.';
      case 'lost': return 'Standardwasser aktiv: die Grafikkarte hat den Wasser-Shader beendet.';
      case 'reduced': return 'Standardwasser aktiv, solange Effekte oder Bewegung reduziert sind.';
      default: return '';
    }
  }

  /** What the map shows besides the water, for what covers it. */
  export interface WaterFxLayers { readonly oceans: boolean; readonly events: boolean; readonly cities: boolean }

  export class WaterFx {
    /** Makes the stage's canvas (tests hand in their own). */
    static makeCanvas: () => HTMLCanvasElement = () => document.createElement('canvas');
    /** "Effekte reduzieren". */
    still = false;
    private on = false;
    private stage: WaterFxGl | null = null;
    private failure: WaterFxFailure | null = null;
    private readonly motionQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    private key = '';
    private colorsOf: LandArt | null = null;
    /** Per slot: the chunk number + 1 whose sea it shows (the owner texture), 0 for none. */
    private owner = new Uint8Array(0);
    /** Per slot: the chunk and the composition its state came from. */
    private slotChunk = new Int16Array(0);
    private slotMotion: (LandMotion | null)[] = [];
    private slotHash = new Uint32Array(0);
    /** Chunks waited for the upload budget: the next frame goes on. */
    private pending = false;
    /** Any chunk in view shows sea; without, nothing is rendered or drawn. */
    private seaInView = false;
    /** The last picture came out (the browser gave its canvas the size asked for). */
    private shown = false;
    private bits = new Uint8Array(0);

    get enabled(): boolean {
      return this.on;
    }

    /** Switch on or off at once; the first switch on makes the stage, once. */
    set enabled(v: boolean) {
      this.on = v;
      if (v) this.start();
      else this.stop();
    }

    get state(): WaterFxState {
      if (!this.on) return 'off';
      if (this.failure) return this.failure;
      return this.still || this.motionQuery?.matches ? 'reduced' : 'on';
    }

    private start(): void {
      if (this.stage || this.failure) return;
      const made = WaterFxGl.create(WaterFx.makeCanvas());
      if (typeof made === 'string') this.fail(made);
      else this.stage = made;
    }

    private stop(): void {
      this.stage?.release();
      this.key = '';
      this.owner = new Uint8Array(0);
      this.slotChunk = new Int16Array(0);
      this.slotMotion = [];
      this.slotHash = new Uint32Array(0);
      this.colorsOf = null;
      waterFxStats.active = false;
    }

    private fail(why: WaterFxFailure): void {
      this.failure = why;
      this.stage = null;
      waterFxStats.active = false;
      console.warn(`Wassereffekte aus (${why}): Standardwasser.`);
    }

    /** Over the cached terrain, before the surf (`ctx` in any transform; left at identity when it draws). */
    draw(
      ctx: CanvasRenderingContext2D, cam: LandCamera, cols: number, rows: number, world: WorldState,
      land: PixelTerrain, layers: WaterFxLayers, overlay: boolean, now: number,
    ): void {
      const stage = this.stage;
      waterFxStats.active = false;
      if (!stage || !this.on) return;
      if (stage.lost) { this.fail('lost'); return; }
      const strength = waterFxStrength(cam.tilePx);
      const art = land.art;
      if (this.still || this.motionQuery?.matches || !layers.oceans || overlay || strength === 0 || !land.ready || !art) return;
      if (this.colorsOf !== art) {
        stage.colors(waterFxColors(art));
        this.colorsOf = art;
      }
      const tx0 = Math.floor(cam.scrollX);
      const tx1 = tx0 + Math.ceil(cols) + 1;
      const ty0 = Math.max(0, Math.floor(cam.scrollY));
      const ty1 = Math.min(GRID_H, Math.floor(cam.scrollY) + Math.ceil(rows) + 1);
      if (ty1 <= ty0) return;
      // The chunks of the tiles and one tile around: the shader reads a pixel's neighbours.
      const cu0 = Math.floor((tx0 - 1) / LAND_CHUNK);
      const cu1 = Math.floor(tx1 / LAND_CHUNK);
      const cy0 = Math.floor(Math.max(0, ty0 - 1) / LAND_CHUNK);
      const cy1 = Math.floor(Math.min(GRID_H - 1, ty1) / LAND_CHUNK);
      // Slots by chunk column modulo a power of two, so the world's seam keeps neighbours apart.
      let nx = 1;
      while (nx < Math.min(CHUNKS_X, cu1 - cu0 + 1)) nx *= 2;
      const ny = cy1 - cy0 + 1;
      if (nx > stage.slotsX || ny > stage.slotsY) {
        stage.slots(Math.max(nx, stage.slotsX), Math.max(ny, stage.slotsY));
        this.owner = new Uint8Array(stage.slotsX * stage.slotsY);
        this.slotChunk = new Int16Array(this.owner.length).fill(-1);
        this.slotMotion = new Array<LandMotion | null>(this.owner.length).fill(null);
        this.slotHash = new Uint32Array(this.owner.length);
      }
      const filled = this.fill(stage, land, cu0, cu1, cy0, cy1);
      if (!this.seaInView) return;
      // Scaled like the terrain (landview.ts): whole multiples of 16 device px per tile sharp; between them
      // the picture is made k times larger (nearest) and smoothly scaled down, so art pixels keep their edges.
      const T = cam.tilePx * cam.dpr;
      const k = T > 16 ? Math.ceil(T / 16 - 1e-6) : 1;
      const sharp = Math.abs(T - 16 * k) < 1e-6;
      const scale = sharp ? 1 : k;
      const step = Math.floor(now / STEP_MS);
      const key = `${step}|${tx0}|${ty0}|${tx1}|${ty1}|${strength}|${scale}`;
      if (filled || key !== this.key) {
        this.key = key;
        const originX = (((tx0 % GRID_W) + GRID_W) % GRID_W) * 16 + GRID_W * 16;
        this.tileBits(stage, world, land, layers, tx0, ty0, tx1, ty1, cu0, cu1, cy0, cy1);
        this.shown = stage.render({
          originX, originY: ty0 * 16, width: (tx1 - tx0) * 16, height: (ty1 - ty0) * 16, scale,
          tileX: originX / 16 - 1, tileY: ty0 - 1, time: ((step * STEP_MS) / 1000) % CLOCK_WRAP_S, strength,
        });
        waterFxStats.renders++;
        waterFxStats.canvasPx = (tx1 - tx0) * (ty1 - ty0) * 256 * scale * scale;
      }
      if (stage.lost) { this.fail('lost'); return; }
      if (!this.shown) return;
      waterFxStats.active = true;
      const s = T / 16;
      const smooth = ctx.imageSmoothingEnabled;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = !sharp;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(stage.canvas, (tx0 - cam.scrollX) * T, (ty0 - cam.scrollY) * T, (tx1 - tx0) * 16 * s, (ty1 - ty0) * 16 * s);
      ctx.imageSmoothingEnabled = smooth;
    }

    /** Bring the slots up to the chunks composed now; true when any slot changed. */
    private fill(stage: WaterFxGl, land: PixelTerrain, cu0: number, cu1: number, cy0: number, cy1: number): boolean {
      let budget = UPLOADS_PER_PICTURE;
      let changed = this.pending;
      this.pending = false;
      this.seaInView = false;
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cu = cu0; cu <= cu1; cu++) {
          const cw = ((cu % CHUNKS_X) + CHUNKS_X) % CHUNKS_X;
          const s = (cy % stage.slotsY) * stage.slotsX + (cw % stage.slotsX);
          const n = cy * CHUNKS_X + cw;
          const m = land.motion(cw, cy);
          if (this.slotChunk[s] === n && this.slotMotion[s] === m) {
            if (this.owner[s] !== 0) this.seaInView = true;
            continue;
          }
          const sea = m && m.sea && m.w === CHUNK_PX && m.sea.length === CHUNK_PX * CHUNK_PX ? m.sea : null;
          const h = sea ? seaHash(sea) : 0;
          if (this.slotChunk[s] === n && (sea ? this.owner[s] === n + 1 && this.slotHash[s] === h : this.owner[s] === 0)) {
            // Composed anew for its land: the slot shows this sea already.
            this.slotMotion[s] = m;
            if (sea) this.seaInView = true;
            continue;
          }
          changed = true;
          if (sea && budget === 0) {
            // Shown as no sea until its turn, never as the slot's last chunk.
            this.owner[s] = 0;
            this.slotChunk[s] = -1;
            this.pending = true;
            this.seaInView = true;
            continue;
          }
          if (sea) {
            stage.chunk(cw % stage.slotsX, cy % stage.slotsY, sea);
            budget--;
            this.slotHash[s] = h;
            waterFxStats.chunkUploads++;
            waterFxStats.uploadBytes += sea.length;
          }
          this.owner[s] = sea ? n + 1 : 0;
          if (sea) this.seaInView = true;
          this.slotChunk[s] = n;
          this.slotMotion[s] = m;
        }
      }
      if (changed) stage.owners(this.owner);
      return changed;
    }

    /** The tiles texture over [tx0 - 1, tx1] × [ty0 - 1, ty1]: see waterfxgl.ts. */
    private tileBits(
      stage: WaterFxGl, world: WorldState, land: PixelTerrain, layers: WaterFxLayers,
      tx0: number, ty0: number, tx1: number, ty1: number, cu0: number, cu1: number, cy0: number, cy1: number,
    ): void {
      const f = land.field;
      const W = tx1 - tx0 + 2;
      const H = ty1 - ty0 + 2;
      if (this.bits.length < W * H) this.bits = new Uint8Array(W * H);
      const bits = this.bits.subarray(0, W * H);
      bits.fill(0);
      for (let y = 0; y < H; y++) {
        const ty = ty0 - 1 + y;
        if (ty < 0 || ty >= GRID_H) continue;
        for (let x = 0; x < W; x++) {
          const j = ty * GRID_W + wrapX(tx0 - 1 + x);
          let b = f.key[j] === 0 && (f.reef[j] !== 0 || f.lagoon[j] > 0) ? 1 : 0;
          if ((layers.events && world.eventTtl[j] > 0) || shoreBusy[j]) b |= 2;
          if (layers.cities && world.tech[j] !== Tech.None) b |= 4;
          bits[y * W + x] = b;
        }
      }
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cu = cu0; cu <= cu1; cu++) {
          const box = land.dissolving(((cu % CHUNKS_X) + CHUNKS_X) % CHUNKS_X, cy);
          if (!box) continue;
          for (let ty = cy * LAND_CHUNK + box[1]; ty <= cy * LAND_CHUNK + box[3]; ty++) {
            for (let tu = cu * LAND_CHUNK + box[0]; tu <= cu * LAND_CHUNK + box[2]; tu++) {
              const x = tu - (tx0 - 1);
              const y = ty - (ty0 - 1);
              if (x >= 0 && x < W && y >= 0 && y < H) bits[y * W + x] |= 2;
            }
          }
        }
      }
      stage.tileBits(bits, W, H);
      waterFxStats.tileUploads++;
    }
  }
}
