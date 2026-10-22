/* =============================================================================
 * SimEarth 2.0 — the Edit window's tile cache
 * -----------------------------------------------------------------------------
 * Every tile graphic the map draws, rasterised once and found by number:
 * grounds with their relief already shaded in, sea tiles with their ripple,
 * creatures and trees with their drop shadow. One blit per layer
 * instead of up to three, and no string built per tile — a full redraw of a
 * large screen touches fifteen thousand tiles and more.
 * ========================================================================== */

namespace SE {
  /** Rasterisation scale: the 8x8 sprites become 16x16 canvases. */
  const SCALE = 2;
  /** Relief steps either side of flat, as the Edit window quantises them. */
  export const RELIEF_STEPS = 16;
  /** Ground tiles marked with this index are perpetual snow, not a biome. */
  export const SNOW_GROUND = BIOME_COUNT;

  /**
   * Creature pictures asked of the landscape worker per frame, and on their
   * way at once. Rastering one costs the GPU 3–6 ms (supersampled paths);
   * on the page each waited for that in a readback, 100–300 ms whenever a
   * zoom settled on a new size. A few per frame keep the GPU free for the
   * frames themselves.
   */
  const SPRITES_PER_FRAME = 2;
  const SPRITES_ON_THE_WAY = 4;

  const RIPPLE_ALPHA = { coast: 0.2, ocean: 0.12 };
  const SURF_ALPHA = 0.55;

  function blank(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('SimEarth: cannot rasterise a tile');
    ctx.imageSmoothingEnabled = false;
    return { canvas, ctx };
  }

  /** A picture from the worker (closed when dropped), not a canvas of the page's. */
  function isBitmap(p: HTMLCanvasElement | ImageBitmap): p is ImageBitmap {
    return 'close' in p;
  }

  /** Sprite art drawn at an opacity, as one canvas. */
  function faded(rows: SpriteRows, alpha: number): HTMLCanvasElement {
    const { canvas, ctx } = blank(8 * SCALE, 8 * SCALE);
    ctx.globalAlpha = alpha;
    ctx.drawImage(drawPixelArt(rows, SCALE), 0, 0);
    return canvas;
  }

  export class TileCache {
    private readonly grounds: HTMLCanvasElement[] = [];
    private readonly seas: HTMLCanvasElement[] = [];
    /** Vector art rastered per device tile size, keyed by size and picture; creatures from the worker are bitmaps. */
    private readonly vectors = new Map<string, HTMLCanvasElement | ImageBitmap>();
    /** Device pixels per tile, and the size before it (kept while zooming back). */
    private deviceTile = 32;
    private previousTile = 32;
    /** The newest raster of each creature picture, whatever its size: it stands in while its new size is made. */
    private readonly latest = new Map<string, HTMLCanvasElement | ImageBitmap>();
    /** Creature pictures wanted at this size (key → picture), asked of the worker after the frame (flush). */
    private readonly wanted = new Map<string, { readonly c: Life; readonly stage: number; readonly specialist: number; readonly flip: boolean; readonly px: number }>();
    /** Creature pictures on their way from the worker. */
    private readonly asked = new Set<string>();
    /** The landscape worker, when it can raster creature pictures (PixelTerrain.sprites); null: they are made here. */
    remote: (() => LandJobs | null) | null = null;
    private readonly rivers: HTMLCanvasElement[] = [];
    private readonly surfs: HTMLCanvasElement[] = [];
    private readonly events: HTMLCanvasElement[] = [];
    private riverAlgaeTile: HTMLCanvasElement | null = null;

    /**
     * A land ground — a Biome, or SNOW_GROUND — in one of four variants, with
     * the relief `step` (−RELIEF_STEPS..RELIEF_STEPS) shaded in as `wash`.
     */
    ground(ground: number, variant: number, step: number, wash: string | null): HTMLCanvasElement {
      const k = (ground * 4 + variant) * (2 * RELIEF_STEPS + 1) + step + RELIEF_STEPS;
      let tile = this.grounds[k];
      if (!tile) {
        const rows = ground === SNOW_GROUND ? SNOW_VARIANTS[variant] : GROUND_VARIANTS[ground][variant];
        const { canvas, ctx } = blank(8 * SCALE, 8 * SCALE);
        ctx.drawImage(drawPixelArt(rows, SCALE), 0, 0);
        if (wash) {
          ctx.fillStyle = wash;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        tile = this.grounds[k] = canvas;
      }
      return tile;
    }

    /** Open water, coastal sea or open ocean in the main map's flat colours, with its ripple. */
    sea(coast: boolean, variant: number): HTMLCanvasElement {
      const k = (coast ? 1 : 0) * 4 + variant;
      let tile = this.seas[k];
      if (!tile) {
        const { canvas, ctx } = blank(8 * SCALE, 8 * SCALE);
        ctx.fillStyle = rgbCss(BIOME_COLORS[coast ? Biome.Coast : Biome.Ocean]);
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = coast ? RIPPLE_ALPHA.coast : RIPPLE_ALPHA.ocean;
        ctx.drawImage(drawPixelArt(GROUND_VARIANTS[coast ? Biome.Coast : Biome.Ocean][variant], SCALE), 0, 0);
        tile = this.seas[k] = canvas;
      }
      return tile;
    }

    /**
     * Rasterise vector art at this many device pixels per tile from now on.
     * Pictures of the size before are kept, anything older is dropped.
     */
    setDeviceTile(px: number): void {
      const size = Math.max(8, Math.round(px));
      if (size === this.deviceTile) return;
      this.previousTile = this.deviceTile;
      this.deviceTile = size;
      for (const [key, tile] of [...this.vectors]) {
        const at = Number(key.slice(0, key.indexOf('|')));
        if (at === size || at === this.previousTile) continue;
        this.vectors.delete(key);
        // A bitmap of the worker's is closed once nothing draws it any more; the newest of a picture stands in.
        if (isBitmap(tile) && this.latest.get(key.slice(key.indexOf('|') + 1)) !== tile) tile.close();
      }
    }

    private vector(key: string, art: Art | undefined, look: ArtLook, flip = false): HTMLCanvasElement | ImageBitmap {
      const k = `${this.deviceTile}|${key}`;
      let tile = this.vectors.get(k);
      if (!tile) {
        tile = rasterArt(art ?? [], this.deviceTile, look, flip, true);
        this.vectors.set(k, tile);
      }
      return tile;
    }

    /**
     * A creature with its shadow; draw it SHADOW_SPAN times the tile size.
     * `specialist` picks one of the class's biome specialists instead of the
     * stage's own picture; `flip` makes it face left. With the landscape
     * worker the picture is rastered there: until it arrives, the picture of
     * another size stands in (null for a creature never drawn before).
     */
    life(c: Life, stage: number, specialist = -1, flip = false): HTMLCanvasElement | ImageBitmap | null {
      const picture = `l${c}|${stage}|${specialist}|${+flip}`;
      const k = `${this.deviceTile}|${picture}`;
      const tile = this.vectors.get(k);
      if (tile) return tile;
      if (!this.remote?.()) {
        const sp = SPECIES[c];
        return this.vector(picture, specialist >= 0 ? sp?.specialists[specialist]?.art : sp?.stages[stage]?.art, CREATURE_LOOK, flip);
      }
      if (!this.asked.has(k)) this.wanted.set(k, { c, stage, specialist, flip, px: this.deviceTile });
      return this.latest.get(picture) ?? null;
    }

    /** After a frame: a few of the creature pictures it wanted at this size are asked of the worker. */
    flush(): void {
      const jobs = this.remote?.();
      if (!jobs) {
        this.wanted.clear();
        // The worker is gone: pictures are made here now, its bitmaps no longer stand in.
        for (const [picture, tile] of this.latest) {
          if (isBitmap(tile) && ![...this.vectors.values()].includes(tile)) tile.close();
          this.latest.delete(picture);
        }
        return;
      }
      let sent = 0;
      for (const [k, w] of this.wanted) {
        if (sent >= SPRITES_PER_FRAME || this.asked.size >= SPRITES_ON_THE_WAY) break;
        this.wanted.delete(k);
        // Wanted at a size the zoom has left already: not made.
        if (w.px !== this.deviceTile) continue;
        if (!jobs.sprite(w.c, w.stage, w.specialist, w.flip, w.px, (bitmap) => this.arrived(k, bitmap))) break;
        this.asked.add(k);
        sent++;
      }
    }

    /** A creature picture from the worker; null when the worker failed (then pictures are made here again). */
    private arrived(k: string, bitmap: ImageBitmap | null): void {
      this.asked.delete(k);
      if (!bitmap) return;
      const at = Number(k.slice(0, k.indexOf('|')));
      const picture = k.slice(k.indexOf('|') + 1);
      const old = this.latest.get(picture);
      this.latest.set(picture, bitmap);
      if (old && isBitmap(old) && ![...this.vectors.values()].includes(old)) old.close();
      // A size dropped meanwhile (the zoom moved on) only stands in.
      if (at === this.deviceTile || at === this.previousTile) this.vectors.set(k, bitmap);
    }

    /**
     * A plant group's cover, or one of its biome specialists. Trees come with
     * a shadow (draw them SHADOW_SPAN times the tile size); kelp comes faded
     * by the water above it.
     */
    plant(g: Flora, dense: number, specialist = -1): HTMLCanvasElement | ImageBitmap {
      const fa = FLORA_ART[g];
      const art = specialist >= 0 ? fa?.specialists[specialist]?.art : dense ? fa?.dense : fa?.sparse;
      const look = FLORA[g].woody ? TREE_LOOK : FLORA[g].realm === 'sea' ? KELP_LOOK : PLANT_LOOK;
      return this.vector(`p${g}|${dense}|${specialist}`, art, look);
    }

    river(wide: number, mask: number): HTMLCanvasElement {
      const k = wide * 16 + mask;
      return this.rivers[k] ?? (this.rivers[k] = faded(RIVER_SPRITES[wide][mask], 1));
    }

    riverAlgae(): HTMLCanvasElement {
      return this.riverAlgaeTile ?? (this.riverAlgaeTile = faded(RIVER_ALGAE_SPRITE, 1));
    }

    surf(mask: number): HTMLCanvasElement {
      return this.surfs[mask] ?? (this.surfs[mask] = faded(SURF_SPRITES[mask], SURF_ALPHA));
    }

    event(k: EventKind): HTMLCanvasElement {
      return this.events[k] ?? (this.events[k] = faded(EVENT_SPRITES[k], 1));
    }
  }
}
