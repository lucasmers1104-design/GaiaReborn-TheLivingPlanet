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
    /** Vector art rastered per device tile size, keyed by size and picture. */
    private readonly vectors = new Map<string, HTMLCanvasElement>();
    /** Device pixels per tile, and the size before it (kept while zooming back). */
    private deviceTile = 32;
    private previousTile = 32;
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

    /** Open water at a depth step (see depthStep) with its ripple. */
    sea(depth: number, coast: boolean, variant: number): HTMLCanvasElement {
      const k = (depth * 2 + (coast ? 1 : 0)) * 4 + variant;
      let tile = this.seas[k];
      if (!tile) {
        const { canvas, ctx } = blank(8 * SCALE, 8 * SCALE);
        ctx.fillStyle = depthStyleAt(depth);
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
      for (const key of [...this.vectors.keys()]) {
        const at = Number(key.slice(0, key.indexOf('|')));
        if (at !== size && at !== this.previousTile) this.vectors.delete(key);
      }
    }

    private vector(key: string, art: Art | undefined, look: ArtLook, flip = false): HTMLCanvasElement {
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
     * stage's own picture; `flip` makes it face left.
     */
    life(c: Life, stage: number, specialist = -1, flip = false): HTMLCanvasElement {
      const sp = SPECIES[c];
      const art = specialist >= 0 ? sp?.specialists[specialist]?.art : sp?.stages[stage]?.art;
      return this.vector(`l${c}|${stage}|${specialist}|${+flip}`, art, CREATURE_LOOK, flip);
    }

    /**
     * A plant group's cover, or one of its biome specialists. Trees come with
     * a shadow (draw them SHADOW_SPAN times the tile size); kelp comes faded
     * by the water above it.
     */
    plant(g: Flora, dense: number, specialist = -1): HTMLCanvasElement {
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
