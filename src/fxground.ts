/* =============================================================================
 * SimEarth 2.0 — the ground of hazards and their scars
 * -----------------------------------------------------------------------------
 * Lava, flood water, embers and the scars disasters leave (burnt earth,
 * craters, ash) are ground, so they are composed like the terrain's ground
 * (landcompose.ts): a dual grid whose cells read their four corner tiles
 * and lay each layer through the terrain's own frayed edge masks, with the
 * same mask variant per cell. Later layers in GROUND_LAYERS draw over
 * earlier ones; where a layer meets plain ground it gets its texture's
 * darker rim (glow always sits inside a dark edge; flood water gets foam).
 * Film textures (puddles, fallout) are transparent where they show nothing.
 * The map's objects are then laid back over it — a tree beside the flow
 * stands in front of the lava, as it stands in front of any ground.
 *
 * Basalt and scree are the height task's ground and drawn by the terrain
 * itself (hazardadapter.ts); every other scar ground is drawn here, which
 * keeps the terrain atlas to the landscape and height tasks.
 *
 * Composed per chunk of LAND_CHUNK × LAND_CHUNK tiles and per texture frame,
 * only again when the chunk's ground or objects change, and a chunk with no
 * moving layer only once.
 *
 * Flood water is composed for a run's whole plan when the run starts
 * (hazardflood.ts), by depth: deep near the coast, shallow and silty inland,
 * dissolving into muddy backwash the tick before it runs off. A copy of the picture then
 * shows only what the water has reached: the flood and dry times of the
 * tile centres, bilinear per art pixel with an ordered-dither fringe, a foam
 * rim riding the moving edge and brown foam as the water falls back.
 * ========================================================================== */

namespace SE {
  /** A ground layer: the texture it shows and the tiles that carry it. */
  interface GroundLayer {
    readonly tex: string;
    readonly has: (world: WorldState, i: number) => boolean;
  }

  const scarGround = (kind: ScarKind) => (w: WorldState, i: number): boolean => w.hazards.scar[i] === kind && scarShowsGround(w, i);
  const tileIs = (t: HazardTile) => (w: WorldState, i: number): boolean => w.hazards.tile[i] === t;
  /** Share of the other soaked tiles that show puddles too. */
  const PUDDLE_EXTRA = 0.2;
  /**
   * Soaked ground shows puddles where water gathers: in hollows (lower than
   * its four neighbours on average), along rivers and in a few other spots.
   * The edge masks fray these tiles into patches, so a storm's wet strip is
   * no even carpet of puddles.
   */
  const puddled = (w: WorldState, i: number): boolean => {
    if (w.hazards.tile[i] !== HazardTile.Wet) return false;
    if (w.riverLevel[i] > 0 || landHash(i, 0, 91) < PUDDLE_EXTRA) return true;
    const x = i % GRID_W;
    const y = (i / GRID_W) | 0;
    let sum = 0;
    let n = 0;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      if (y + dy < 0 || y + dy >= GRID_H) continue;
      sum += w.elevation[idx(wrapX(x + dx), y + dy)];
      n++;
    }
    return w.elevation[i] <= sum / n;
  };
  const lavaAt = (stage: number) => (w: WorldState, i: number): boolean =>
    w.hazards.tile[i] === HazardTile.Lava && lavaStage(w.hazards.level[i]) === stage;
  /**
   * World tick of the map's base picture. It redraws at most every 250 ms, so freshly settled lava keeps
   * its crust until the base has caught up; before, it would show the ground from before the flow.
   */
  let baseTick = -1;
  const enum FloodLook { None, Shallow, Water, Deep }
  /** Flood look per tile, from the runs' plans whenever the hazards change. */
  const floodLook = new Uint8Array(TILE_COUNT);
  const floodIs = (look: FloodLook) => (_w: WorldState, i: number): boolean => floodLook[i] === look;
  const crustFlowing = lavaAt(2);
  const crustAt = (w: WorldState, i: number): boolean => {
    if (crustFlowing(w, i)) return true;
    const hz = w.hazards;
    if (hz.tile[i] !== HazardTile.None || hz.scar[i] !== ScarKind.Basalt) return false;
    // The scar aged once in the tick it settled.
    const settled = w.ticks - hz.scarAge[i] + 1;
    return hz.scarAge[i] <= 1 || baseTick < settled;
  };

  /**
   * Lowest first: a tile shows the last layer it carries, and a later layer
   * frays over an earlier one. Layers whose texture is not drawn yet are
   * skipped. The ids are the contract with tools/fx/catalog.js.
   */
  const GROUND_LAYERS: readonly GroundLayer[] = [
    { tex: 'fallout_film', has: (w, i) => w.hazards.scar[i] === ScarKind.Fallout },
    { tex: 'ground_ash', has: scarGround(ScarKind.Ash) },
    { tex: 'ground_scorched', has: scarGround(ScarKind.Scorched) },
    { tex: 'ground_burnt', has: scarGround(ScarKind.Burnt) },
    { tex: 'ground_crater', has: scarGround(ScarKind.Crater) },
    { tex: 'wet_ground', has: puddled },
    { tex: 'flood_shallow', has: floodIs(FloodLook.Shallow) },
    { tex: 'flood_water', has: floodIs(FloodLook.Water) },
    { tex: 'flood_deep', has: floodIs(FloodLook.Deep) },
    { tex: 'embers', has: tileIs(HazardTile.Burning) },
    { tex: 'lava_crust', has: crustAt },
    { tex: 'lava_dim', has: lavaAt(1) },
    { tex: 'lava_hot', has: lavaAt(0) },
  ];

  /** Composed frames per moving chunk, at the hot lava's rate. */
  const FRAMES = 4;
  const FRAME_MS = 125;
  /**
   * Chunk frames composed per screen frame at most; the rest keep showing
   * their last picture for a few frames. Without the cap, four eruptions
   * whose lava changes stage in the same tick cost one 45 ms frame; with 2,
   * four spreading fires still peaked at 5.7 ms (one compose ≈ 2.8 ms).
   */
  const COMPOSES_PER_FRAME = 1;
  const SIDE = LAND_CHUNK * 16 + 16;
  const GRID = LAND_CHUNK + 2;
  const CHUNKS_X = GRID_W / LAND_CHUNK;
  const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  /** Flood depth (hazard level, elevation × 1000) from which the water looks normal, and deep. */
  const FLOOD_WATER_LEVEL = 12;
  const FLOOD_DEEP_LEVEL = 30;
  /** Ticks a tile stays composed after it dried: the map's base redraws at most every 250 ms. */
  const FLOOD_KEEP = 3;
  /** Fringe, foam rim, backwash and wet sheen, in ticks (the water runs up a tile a tick). */
  const FRINGE = 0.12;
  const FOAM_WHITE = 0.1;
  const FOAM = 0.22;
  const BACKWASH = 0.12;
  const SHEEN = 0.35;
  /** Ticks before it runs off in which the water dissolves into muddy backwash, and the dithered width of its dry edge. */
  const MUD_TICKS = 1;
  const DRY_AMP = 0.4;
  /** A revealed picture is rebuilt at most this often, like the ambient surf (12 fps). */
  const REVEAL_MS = 83;
  /** Revealed pictures rebuilt per screen frame at most, besides ones shown for the first time. */
  const REVEALS_PER_FRAME = 2;

  function word(rgb: readonly number[]): number {
    const [r, g, b] = rgb;
    return LITTLE_ENDIAN ? ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0 : ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0;
  }

  /** One composed picture of a chunk; with flood water also its pixels, to reveal from. */
  interface GroundPicture {
    readonly canvas: HTMLCanvasElement;
    /** Per pixel 1 for flood water, 2 for flood water under an object (no foam there), else 0; null without flood. */
    readonly flood: Uint8Array | null;
    readonly px: Uint32Array | null;
    /** The revealed copy, when and for which tick phase it was built, and its cells' states. */
    shown: HTMLCanvasElement | null;
    shownAt: number;
    shownTau: number;
    shownSig: number;
  }

  interface GroundChunk {
    sig: number;
    /** Whether any layer in it moves; a still chunk is composed once, as frame 0. */
    moving: boolean;
    /** Distinct pictures it cycles through: the most frames of any texture in it. */
    readonly period: number;
    readonly frames: (GroundPicture | null)[];
    /** The last picture composed, shown while a new one waits for its turn. */
    stale: GroundPicture | null;
  }

  export class FxGround {
    private readonly chunks = new Map<number, GroundChunk>();
    private readonly keys = new Uint8Array(GRID * GRID);
    private readonly px = new Uint32Array(SIDE * SIDE);
    private readonly layer = new Uint8Array(SIDE * SIDE);
    private readonly objects = new Uint8Array(SIDE * SIDE);
    private readonly water = new Uint8Array(SIDE * SIDE);
    private readonly occupied = new Uint8Array(SIDE * SIDE);
    private readonly placements: LandPlacement[] = [];
    private readonly order = new Uint8Array(4);
    private readonly edge = new Uint8Array(SIDE * SIDE);
    private image: ImageData | null = null;
    private budget = 0;
    /** Layer index + 1 of drawn textures, 0 for one not drawn yet. */
    private present: number[] | null = null;
    private activeSet = new Set<number>();
    private activeKey = '';
    /** Per tile, relative to its hazard's age: when the water reaches it and when it has run off; NaN away from floods. */
    private readonly floodAt = new Float32Array(TILE_COUNT).fill(NaN);
    private readonly dryAt = new Float32Array(TILE_COUNT).fill(NaN);
    /** World tick from which the map's base shows a flooded tile's mud. */
    private readonly mudTick = new Float64Array(TILE_COUNT);
    private floodTiles: number[] = [];
    private reveals = 0;
    private colors: Record<string, number> | null = null;

    /** The ground layer key of a tile (1 + its index in GROUND_LAYERS), 0 for none. */
    private keyOf(world: WorldState, i: number): number {
      const hz = world.hazards;
      if (hz.tile[i] === 0 && hz.scar[i] === 0 && floodLook[i] === 0) return 0;
      const present = this.present as number[];
      for (let k = GROUND_LAYERS.length - 1; k >= 0; k--) {
        if (present[k] !== 0 && GROUND_LAYERS[k].has(world, i)) return k + 1;
      }
      return 0;
    }

    /** Chunks any hazard ground reaches into, as cy · CHUNKS_X + cx; found again when the hazards change. */
    private active(world: WorldState): Set<number> {
      const ages = world.hazards.list.reduce((n, h) => n + h.age, 0);
      const key = `${world.ticks}|${world.hazards.revision}|${world.hazards.generation}|${world.revision}|${ages}`;
      if (key === this.activeKey) return this.activeSet;
      this.activeKey = key;
      this.plans(world);
      const out = new Set<number>();
      for (let i = 0; i < TILE_COUNT; i++) {
        if (this.keyOf(world, i) === 0) continue;
        const x = i % GRID_W;
        const y = (i / GRID_W) | 0;
        // A tile's cells reach half a tile into its neighbours' chunks.
        for (let dy = -1; dy <= 1; dy++) {
          const yy = clampY(y + dy);
          for (let dx = -1; dx <= 1; dx++) out.add(Math.floor(yy / LAND_CHUNK) * CHUNKS_X + Math.floor(wrapX(x + dx) / LAND_CHUNK));
        }
      }
      this.activeSet = out;
      return out;
    }

    /**
     * Flood looks and times from every run's plan. Next to a plan the water
     * comes from the sea half a tick earlier, reaches land that stays dry a
     * tick later, and runs off the land first and the sea last.
     */
    private plans(world: WorldState): void {
      const { floodAt, dryAt, mudTick } = this;
      for (const i of this.floodTiles) {
        floodLook[i] = FloodLook.None;
        floodAt[i] = dryAt[i] = NaN;
        for (let k = 0; k < 8; k++) {
          const j = hazardNeighbour(i, k);
          if (j >= 0) floodAt[j] = dryAt[j] = NaN;
        }
      }
      const tiles: number[] = [];
      for (const h of world.hazards.list) {
        for (const run of h.wave?.runs ?? h.storm?.runs ?? []) {
          run.tiles.forEach((i, m) => {
            const off = run.off[m] - h.age;
            if (off <= -FLOOD_KEEP) return;
            const level = run.depth[m] * 1000;
            floodLook[i] = level < FLOOD_WATER_LEVEL ? FloodLook.Shallow : level < FLOOD_DEEP_LEVEL ? FloodLook.Water : FloodLook.Deep;
            floodAt[i] = run.at[m] - h.age;
            dryAt[i] = off;
            mudTick[i] = world.ticks - h.age + floodDryTick(run.off[m]);
            tiles.push(i);
          });
        }
      }
      const e = world.elevation;
      for (const i of tiles) {
        for (let k = 0; k < 8; k++) {
          const j = hazardNeighbour(i, k);
          if (j < 0 || floodLook[j] !== FloodLook.None) continue;
          const sea = e[j] < 0;
          const f = floodAt[i] + (sea ? -0.5 : 1);
          const r = dryAt[i] + (sea ? 1 : -0.5);
          if (Number.isNaN(floodAt[j])) {
            floodAt[j] = f;
            dryAt[j] = r;
          } else {
            floodAt[j] = sea ? Math.min(floodAt[j], f) : Math.max(floodAt[j], f);
            dryAt[j] = sea ? Math.max(dryAt[j], r) : Math.min(dryAt[j], r);
          }
        }
      }
      this.floodTiles = tiles;
    }

    /**
     * Draw the hazard ground in view (identity transform). `cities(x0, y0,
     * x1, y1)` redraws the cities over a device rectangle, since a city
     * beside the flow stands in front of it too. `phase` is how far the
     * screen is from the last tick to the next (0..1); 1 shows each tick's
     * flood whole.
     */
    draw(
      ctx: CanvasRenderingContext2D, cam: LandCamera, world: WorldState, land: PixelTerrain, now: number,
      cities: (x0: number, y0: number, x1: number, y1: number) => void, base: number, phase = 1,
    ): void {
      baseTick = base;
      const art = FxArt.shared();
      if (!art.ready || !land.art) return;
      if (!this.present) this.present = GROUND_LAYERS.map((l, k) => (art.texture(l.tex).length > 0 ? k + 1 : 0));
      const active = this.active(world);
      for (const n of [...this.chunks.keys()]) if (!active.has(n)) this.chunks.delete(n);
      if (active.size === 0) return;
      const T = cam.tilePx * cam.dpr;
      const s = T / 16;
      const g = Math.floor(now / FRAME_MS) % FRAMES;
      this.budget = COMPOSES_PER_FRAME;
      this.reveals = REVEALS_PER_FRAME;
      const muds = art.texture('flood_mud');
      const mud = muds.length > 0 ? muds[Math.floor((g * muds.length) / FRAMES) % muds.length] : null;
      const cuA = Math.floor(cam.scrollX / LAND_CHUNK);
      const cuB = Math.floor((cam.scrollX + ctx.canvas.width / T) / LAND_CHUNK);
      const cyA = Math.max(0, Math.floor(cam.scrollY / LAND_CHUNK));
      const cyB = Math.min(GRID_H / LAND_CHUNK - 1, Math.floor((cam.scrollY + ctx.canvas.height / T) / LAND_CHUNK));
      for (let cy = cyA; cy <= cyB; cy++) {
        for (let cu = cuA; cu <= cuB; cu++) {
          const cx = ((cu % CHUNKS_X) + CHUNKS_X) % CHUNKS_X;
          const n = cy * CHUNKS_X + cx;
          if (!active.has(n)) continue;
          const pic = this.chunk(world, land, art, cx, cy, g);
          const canvas = pic && (pic.flood ? this.reveal(pic, cx, cy, phase - 1, cam.tilePx >= 16, now, mud) : pic.canvas);
          if (!canvas) continue;
          const wx = cu * LAND_CHUNK * 16 - 8;
          const wy = cy * LAND_CHUNK * 16 - 8;
          art.drawPixels(ctx, cam, canvas, 0, 0, SIDE, SIDE, wx, wy);
          const x0 = (wx - cam.scrollX * 16) * s;
          const y0 = (wy - cam.scrollY * 16) * s;
          cities(x0, y0, x0 + SIDE * s, y0 + SIDE * s);
        }
      }
    }

    private chunk(world: WorldState, land: PixelTerrain, art: FxArt, cx: number, cy: number, now: number): GroundPicture | null {
      const tx0 = cx * LAND_CHUNK;
      const ty0 = cy * LAND_CHUNK;
      const keys = this.keys;
      let sig = 0x811c9dc5;
      let period = 1;
      for (let l = 0; l < GRID; l++) {
        const ty = clampY(ty0 + l - 1);
        for (let k = 0; k < GRID; k++) {
          const v = this.keyOf(world, ty * GRID_W + wrapX(tx0 + k - 1));
          keys[l * GRID + k] = v;
          if (v !== 0) period = Math.max(period, art.texture(GROUND_LAYERS[v - 1].tex).length);
          sig = Math.imul(sig ^ v, 0x01000193);
        }
      }
      // Embers and flood water have 2 frames: their chunks need only 2 distinct pictures, not FRAMES.
      if (FRAMES % period !== 0) period = FRAMES;
      const moving = period > 1;
      sig = (sig ^ land.field.signature(tx0, ty0, LAND_CHUNK, LAND_CHUNK, 0)) >>> 0;
      const n = cy * CHUNKS_X + cx;
      let c = this.chunks.get(n);
      if (!c || c.sig !== sig) {
        const stale = c ? c.frames.find((f) => f !== null) ?? c.stale : null;
        c = { sig, moving, period, frames: new Array<GroundPicture | null>(FRAMES).fill(null), stale };
        this.chunks.set(n, c);
      }
      const step = FRAMES / c.period;
      const g = c.moving ? Math.floor(now / step) * step : 0;
      const hit = c.frames[g];
      if (hit) return hit;
      if (this.budget <= 0) return c.frames.find((f) => f !== null) ?? c.stale;
      this.budget--;
      const pic = this.compose(land, art, tx0, ty0, g);
      c.frames[g] = pic;
      c.stale = pic;
      return pic;
    }

    private compose(land: PixelTerrain, art: FxArt, tx0: number, ty0: number, g: number): GroundPicture | null {
      const landArt = land.art as LandArt;
      const { px, layer, keys, order } = this;
      px.fill(0);
      layer.fill(0);
      const textures = GROUND_LAYERS.map((l) => {
        const frames = art.texture(l.tex);
        return frames.length ? frames[Math.floor((g * frames.length) / FRAMES) % frames.length] : null;
      });
      const sizes = GROUND_LAYERS.map((l) => FX_MANIFEST.textures[l.tex]?.size ?? 64);
      const variants = landArt.masks[0].length;
      for (let l = 0; l <= LAND_CHUNK; l++) {
        const ty = ty0 + l - 1;
        for (let k = 0; k <= LAND_CHUNK; k++) {
          const k0 = keys[l * GRID + k];
          const k1 = keys[l * GRID + k + 1];
          const k2 = keys[(l + 1) * GRID + k];
          const k3 = keys[(l + 1) * GRID + k + 1];
          if ((k0 | k1 | k2 | k3) === 0) continue;
          const tx = tx0 + k - 1;
          let count = 0;
          for (const v of [k0, k1, k2, k3]) {
            if (v === 0) continue;
            let j = 0;
            while (j < count && order[j] < v) j++;
            if (j < count && order[j] === v) continue;
            for (let m = count; m > j; m--) order[m] = order[m - 1];
            order[j] = v;
            count++;
          }
          const variant = Math.floor(landHash(wrapX(tx), ty, 77) * variants);
          const wx = tx * 16 + 8;
          const wy = ty * 16 + 8;
          for (let o = 0; o < count; o++) {
            const v = order[o];
            const kase = (k0 >= v ? 1 : 0) | (k1 >= v ? 2 : 0) | (k2 >= v ? 4 : 0) | (k3 >= v ? 8 : 0);
            const mask = kase === 15 ? null : landArt.masks[kase][variant];
            const tex = textures[v - 1];
            if (!tex) continue;
            const size = sizes[v - 1];
            const wrap = size - 1;
            for (let ly = 0; ly < 16; ly++) {
              const row = ((wy + ly) & wrap) * size;
              let b = (l * 16 + ly) * SIDE + k * 16;
              for (let lx = 0; lx < 16; lx++, b++) {
                if (mask && mask[ly * 16 + lx] === 0) continue;
                const p = tex[row + ((wx + lx) & wrap)];
                if (p === 0) continue;
                px[b] = p;
                layer[b] = v;
              }
            }
          }
        }
      }
      this.rim();
      this.objectsOver(land, landArt, tx0, ty0);
      if (!this.image) this.image = new ImageData(SIDE, SIDE);
      new Uint32Array(this.image.data.buffer).set(px);
      const canvas = document.createElement('canvas');
      canvas.width = SIDE;
      canvas.height = SIDE;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.putImageData(this.image, 0, 0);
      const first = GROUND_LAYERS.findIndex((l) => l.tex === 'flood_shallow') + 1;
      let flood: Uint8Array | null = null;
      for (let b = 0; b < layer.length; b++) {
        if (layer[b] < first || layer[b] > first + 2) continue;
        flood ??= new Uint8Array(SIDE * SIDE);
        flood[b] = this.objects[b] !== 0 ? 2 : 1;
      }
      return { canvas, flood, px: flood ? px.slice() : null, shown: null, shownAt: -Infinity, shownTau: NaN, shownSig: 0 };
    }

    /**
     * The picture with only the water the floods have reached at `tau` (ticks
     * relative to the hazards' age, -1..0): a dithered fringe and, with
     * `detail`, the foam rim, the backwash and the wet sheen it leaves. The
     * water dissolves into `mud` (a flood_mud frame) before it runs off.
     */
    private reveal(
      pic: GroundPicture, cx: number, cy: number, tau: number, detail: boolean, now: number, mud: Uint32Array | null,
    ): HTMLCanvasElement | null {
      if (pic.shown && (tau === pic.shownTau || now - pic.shownAt < REVEAL_MS || this.reveals <= 0)) return pic.shown;
      const { floodAt, dryAt, mudTick } = this;
      const flood = pic.flood as Uint8Array;
      const out = this.px;
      out.set(pic.px as Uint32Array);
      const c = this.colors ??= Object.fromEntries(
        ([['white', 0], ['ice', 4], ['ice', 3], ['soil', 3], ['soil', 1]] as const).map(([r, n]) =>
          [r + n, word(TERRAIN_MANIFEST.palette[TERRAIN_MANIFEST.ramps[r][n]])]),
      );
      const amp = detail ? FRINGE : 0;
      const tx0 = cx * LAND_CHUNK;
      const ty0 = cy * LAND_CHUNK;
      const F = [0, 0, 0, 0];
      const R = [0, 0, 0, 0];
      const C = [0, 0, 0, 0];
      const mudSize = FX_MANIFEST.textures.flood_mud?.size ?? 64;
      let sig = 0x811c9dc5;
      let partial = false;
      for (let l = 0; l <= LAND_CHUNK; l++) {
        for (let k = 0; k <= LAND_CHUNK; k++) {
          let live = false;
          let caught = true;
          let deep = false;
          for (let q = 0; q < 4; q++) {
            const i = clampY(ty0 + l - 1 + (q >> 1)) * GRID_W + wrapX(tx0 + k - 1 + (q & 1));
            F[q] = floodAt[i];
            R[q] = dryAt[i];
            C[q] = 1;
            if (floodLook[i] === FloodLook.None) continue;
            live = true;
            if (baseTick < mudTick[i]) {
              caught = false;
              C[q] = 0;
            }
            if (floodLook[i] >= FloodLook.Water) deep = true;
          }
          const minF = Math.min(...F);
          const minR = Math.min(...R);
          // Cell state: 0 calm water, 1 hidden, 2 dried, 3 pixel by pixel.
          let state = 3;
          if (!live || Number.isNaN(minF + minR) || minF - amp / 2 > tau) state = 1;
          else if (caught && Math.max(...R) + DRY_AMP / 2 + SHEEN <= tau) state = 2;
          else if (Math.max(...F) + amp / 2 + FOAM <= tau && minR - DRY_AMP / 2 - Math.max(MUD_TICKS, BACKWASH) > tau) state = 0;
          sig = Math.imul(sig ^ state, 0x01000193);
          if (state === 0) continue;
          if (state === 3) partial = true;
          const wx = (tx0 + k - 1) * 16 + 8;
          const wy = (ty0 + l - 1) * 16 + 8;
          for (let ly = 0; ly < 16; ly++) {
            const fy = (ly + 0.5) / 16;
            const row = ((wy + ly) & (mudSize - 1)) * mudSize;
            let b = (l * 16 + ly) * SIDE + k * 16;
            for (let lx = 0; lx < 16; lx++, b++) {
              const kind = flood[b];
              if (kind === 0) continue;
              if (state !== 3) {
                out[b] = 0;
                continue;
              }
              const fx = (lx + 0.5) / 16;
              const w0 = (1 - fx) * (1 - fy);
              const w1 = fx * (1 - fy);
              const w2 = (1 - fx) * fy;
              const w3 = fx * fy;
              const bayer = BAYER4[(ly & 3) * 4 + (lx & 3)];
              const dither = amp * (bayer - 0.5);
              const v = tau - (F[0] * w0 + F[1] * w1 + F[2] * w2 + F[3] * w3 + dither);
              if (v < 0) {
                out[b] = 0;
                continue;
              }
              const left = R[0] * w0 + R[1] * w1 + R[2] * w2 + R[3] * w3 - tau;
              const w = left + DRY_AMP * (bayer - 0.5);
              // The map shows the mud under this pixel: blended between the corners, dithered.
              const shows = C[0] * w0 + C[1] * w1 + C[2] * w2 + C[3] * w3 >= bayer;
              if (w <= 0 && shows) {
                // Dried: a wet sheen dissolves into the mud.
                out[b] = detail && bayer < 1 + w / SHEEN ? c.soil1 : 0;
                continue;
              }
              if (kind === 2) continue;
              // Before it runs off, the water dissolves into muddy backwash.
              if (mud && left < MUD_TICKS && bayer >= left / MUD_TICKS) out[b] = mud[row + ((wx + lx) & (mudSize - 1))];
              if (!detail) continue;
              if (v < FOAM_WHITE) out[b] = deep ? c.white0 : c.ice4;
              else if (v < FOAM && bayer < 0.5) out[b] = c.ice3;
              else if (w > 0 && w < BACKWASH) out[b] = bayer < 0.4 ? c.ice3 : c.soil3;
            }
          }
        }
      }
      if (pic.shown && !partial && sig === pic.shownSig) {
        pic.shownTau = tau;
        return pic.shown;
      }
      if (pic.shown) this.reveals--;
      if (!this.image) this.image = new ImageData(SIDE, SIDE);
      new Uint32Array(this.image.data.buffer).set(out);
      if (!pic.shown) {
        pic.shown = document.createElement('canvas');
        pic.shown.width = SIDE;
        pic.shown.height = SIDE;
      }
      pic.shown.getContext('2d')?.putImageData(this.image, 0, 0);
      pic.shownAt = now;
      pic.shownTau = tau;
      pic.shownSig = sig;
      return pic.shown;
    }

    /** One pixel of each layer's rim where it meets plain ground; films have none. */
    private rim(): void {
      const { px, layer, edge } = this;
      const rims = GROUND_LAYERS.map((l) => {
        const rgb = FX_MANIFEST.textures[l.tex]?.rim;
        return rgb ? word(rgb) : 0;
      });
      edge.fill(0);
      for (let y = 0; y < SIDE; y++) {
        for (let x = 0; x < SIDE; x++) {
          const b = y * SIDE + x;
          if (layer[b] === 0 || rims[layer[b] - 1] === 0) continue;
          if ((x > 0 && layer[b - 1] === 0) || (x < SIDE - 1 && layer[b + 1] === 0) ||
            (y > 0 && layer[b - SIDE] === 0) || (y < SIDE - 1 && layer[b + SIDE] === 0)) edge[b] = 1;
        }
      }
      for (let b = 0; b < edge.length; b++) if (edge[b]) px[b] = rims[layer[b] - 1];
    }

    /** The terrain's objects where they overlap the hazard ground, drawn as the compositor draws them. */
    private objectsOver(land: PixelTerrain, landArt: LandArt, tx0: number, ty0: number): void {
      const { px, layer, objects } = this;
      objects.fill(0);
      this.occupied.fill(0);
      const f = land.field;
      placeLandObjects(f, landArt, tx0 - 1, ty0 - 1, tx0 + LAND_CHUNK, ty0 + LAND_CHUNK, this.placements);
      const list = this.placements.filter((p) => !p.water && !f.paths.near(p.fx + 0.5, p.fy + 0.5, RIVER_CLEARANCE));
      drawLandObjects(list, landArt, objects, this.water, this.occupied, SIDE, SIDE, tx0 * 16 - 8, ty0 * 16 - 8, null, null, f.shade);
      for (let b = 0; b < px.length; b++) if (layer[b] !== 0 && objects[b] !== 0) px[b] = landArt.rgba[objects[b]];
    }
  }
}
