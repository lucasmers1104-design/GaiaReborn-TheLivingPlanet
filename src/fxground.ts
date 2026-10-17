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
 * ========================================================================== */

namespace SE {
  /** A ground layer: the texture it shows and the tiles that carry it. */
  interface GroundLayer {
    readonly tex: string;
    readonly has: (world: WorldState, i: number) => boolean;
  }

  const scarGround = (kind: ScarKind) => (w: WorldState, i: number): boolean => w.hazards.scar[i] === kind && scarShowsGround(w, i);
  const tileIs = (t: HazardTile) => (w: WorldState, i: number): boolean => w.hazards.tile[i] === t;
  const lavaAt = (stage: number) => (w: WorldState, i: number): boolean =>
    w.hazards.tile[i] === HazardTile.Lava && lavaStage(w.hazards.level[i]) === stage;
  /**
   * World tick of the map's base picture. It redraws at most every 250 ms, so freshly settled lava keeps
   * its crust until the base has caught up; before, it would show the ground from before the flow.
   */
  let baseTick = -1;
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
    { tex: 'wet_ground', has: tileIs(HazardTile.Wet) },
    { tex: 'flood_water', has: tileIs(HazardTile.Flood) },
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

  function word(rgb: readonly number[]): number {
    const [r, g, b] = rgb;
    return LITTLE_ENDIAN ? ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0 : ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0;
  }

  interface GroundChunk {
    sig: number;
    /** Whether any layer in it moves; a still chunk is composed once, as frame 0. */
    moving: boolean;
    /** Distinct pictures it cycles through: the most frames of any texture in it. */
    readonly period: number;
    readonly frames: (HTMLCanvasElement | null)[];
    /** The last picture composed, shown while a new one waits for its turn. */
    stale: HTMLCanvasElement | null;
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

    /** The ground layer key of a tile (1 + its index in GROUND_LAYERS), 0 for none. */
    private keyOf(world: WorldState, i: number): number {
      const hz = world.hazards;
      if (hz.tile[i] === 0 && hz.scar[i] === 0) return 0;
      const present = this.present as number[];
      for (let k = GROUND_LAYERS.length - 1; k >= 0; k--) {
        if (present[k] !== 0 && GROUND_LAYERS[k].has(world, i)) return k + 1;
      }
      return 0;
    }

    /** Chunks any hazard ground reaches into, as cy · CHUNKS_X + cx; found again when the hazards change. */
    private active(world: WorldState): Set<number> {
      const key = `${world.ticks}|${world.hazards.revision}|${world.hazards.generation}|${world.revision}`;
      if (key === this.activeKey) return this.activeSet;
      this.activeKey = key;
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
     * Draw the hazard ground in view (identity transform). `cities(x0, y0,
     * x1, y1)` redraws the cities over a device rectangle, since a city
     * beside the flow stands in front of it too.
     */
    draw(
      ctx: CanvasRenderingContext2D, cam: LandCamera, world: WorldState, land: PixelTerrain, now: number,
      cities: (x0: number, y0: number, x1: number, y1: number) => void, base: number,
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
      const cuA = Math.floor(cam.scrollX / LAND_CHUNK);
      const cuB = Math.floor((cam.scrollX + ctx.canvas.width / T) / LAND_CHUNK);
      const cyA = Math.max(0, Math.floor(cam.scrollY / LAND_CHUNK));
      const cyB = Math.min(GRID_H / LAND_CHUNK - 1, Math.floor((cam.scrollY + ctx.canvas.height / T) / LAND_CHUNK));
      for (let cy = cyA; cy <= cyB; cy++) {
        for (let cu = cuA; cu <= cuB; cu++) {
          const cx = ((cu % CHUNKS_X) + CHUNKS_X) % CHUNKS_X;
          const n = cy * CHUNKS_X + cx;
          if (!active.has(n)) continue;
          const canvas = this.chunk(world, land, art, cx, cy, g);
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

    private chunk(world: WorldState, land: PixelTerrain, art: FxArt, cx: number, cy: number, now: number): HTMLCanvasElement | null {
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
        c = { sig, moving, period, frames: new Array<HTMLCanvasElement | null>(FRAMES).fill(null), stale };
        this.chunks.set(n, c);
      }
      const step = FRAMES / c.period;
      const g = c.moving ? Math.floor(now / step) * step : 0;
      const hit = c.frames[g];
      if (hit) return hit;
      if (this.budget <= 0) return c.frames.find((f) => f !== null) ?? c.stale;
      this.budget--;
      const canvas = this.compose(land, art, tx0, ty0, g);
      c.frames[g] = canvas;
      c.stale = canvas;
      return canvas;
    }

    private compose(land: PixelTerrain, art: FxArt, tx0: number, ty0: number, g: number): HTMLCanvasElement | null {
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
      return canvas;
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
