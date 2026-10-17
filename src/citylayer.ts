/* =============================================================================
 * SimEarth 2.0 — cities on the map
 * -----------------------------------------------------------------------------
 * A transparent layer over the finished terrain (docs/zivilisation-spec.md
 * §3.3): each city is composed once at 1× (citylayout.ts places its blocks,
 * citycompose.ts paints yard, shadows and blocks) into a 16 × 20 picture,
 * its tile plus 4 px above, and kept until its tile, era, size, tribe colour
 * or river changes. Drawing scales it exactly like the terrain
 * (landview.ts): nearest neighbour up to the next whole multiple k of 16 px
 * per tile, then smoothly down to the device tile size, so cities stay fixed
 * in the landscape and scale like its trees.
 * Up to 16 px per tile a pennant marker in the tribe colour is added at a
 * fixed screen size: among the herd icons a city that small is hard to find.
 * ========================================================================== */

namespace SE {
  /** Marker size in CSS pixels, shown up to and including this many CSS pixels per tile. */
  const MARKER_PX = 12;
  const MARKER_UNTIL = 16;
  const MARKER_LOOK: ArtLook = { outline: 3, outlineAlpha: 1, shadow: 0.35, alpha: 1 };
  const PAD = CITY_PAD;
  const SMOOTHING: ImageSmoothingQuality = 'high';
  /**
   * Composing a city costs 1–2 ms; a first view of many cities stops after
   * this long and finishes on the next frames (the map redraws while
   * `pending`), so it never stalls one frame.
   */
  const COMPOSE_BUDGET_MS = 6;

  interface CityPicture {
    readonly key: string;
    /** 1× with PAD all round: (16 + 2·PAD) × (20 + 2·PAD). */
    readonly base: HTMLCanvasElement;
    /** `base` enlarged k times, nearest neighbour. */
    big: HTMLCanvasElement | null;
    bigK: number;
  }

  export class CityLayer {
    private atlas: CivAtlasPixels | null = null;
    private state: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
    private readonly listeners: (() => void)[] = [];
    private readonly pictures = new Map<number, CityPicture>();
    private readonly markers = new Map<string, HTMLCanvasElement>();
    private deadline = Infinity;
    private prunedAt = -1;
    /** The last draw ran out of time: some cities still show an old picture or none; draw again. */
    pending = false;

    get ready(): boolean {
      return this.state === 'ready';
    }

    /** Decode the atlas once; `fn` runs when it is ready or has failed. */
    whenReady(fn: () => void): void {
      if (this.state === 'ready' || this.state === 'failed') { fn(); return; }
      this.listeners.push(fn);
      if (this.state !== 'idle') return;
      this.state = 'loading';
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const c = canvas.getContext('2d', { willReadFrequently: true });
        if (c) {
          c.drawImage(img, 0, 0);
          this.atlas = { w: img.width, data: c.getImageData(0, 0, img.width, img.height).data };
        }
        this.state = this.atlas ? 'ready' : 'failed';
        for (const l of this.listeners.splice(0)) l();
      };
      img.onerror = () => {
        this.state = 'failed';
        console.warn('SimEarth: the city atlas did not decode, cities stay hidden');
        for (const l of this.listeners.splice(0)) l();
      };
      img.src = CIV_ATLAS_PNG;
    }

    /**
     * Draw the cities whose pictures meet the device-pixel rectangle
     * [x0, x1) × [y0, y1), clipped to it. A city reaches 4 px into the tile
     * above, so the row below the rectangle is drawn too and a partial
     * redraw never cuts its top off. `field` supplies the river lines.
     */
    draw(
      ctx: CanvasRenderingContext2D, cam: LandCamera, world: WorldState, field: TerrainField,
      x0: number, y0: number, x1: number, y1: number,
    ): void {
      if (!this.atlas) return;
      this.pending = false;
      this.deadline = performance.now() + COMPOSE_BUDGET_MS;
      if (world.revision !== this.prunedAt) {
        // Pictures of cities that are gone (lost, or moved on by plate drift).
        for (const tile of [...this.pictures.keys()]) if (world.tech[tile] === Tech.None) this.pictures.delete(tile);
        this.prunedAt = world.revision;
      }
      const T = cam.tilePx * cam.dpr;
      const s = T / 16;
      const box = CIV_MANIFEST.box;
      const above = (box.h - 16) / 16;
      const txA = Math.floor(cam.scrollX + x0 / T) - 1;
      const txB = Math.ceil(cam.scrollX + x1 / T) + 1;
      const tyA = Math.max(0, Math.floor(cam.scrollY + y0 / T) - 1);
      const tyB = Math.min(GRID_H, Math.ceil(cam.scrollY + y1 / T + above) + 1);
      const k = T > 16 ? Math.ceil(T / 16 - 1e-6) : 1;
      const sharp = Math.abs(T - 16 * k) < 1e-6;
      const marker = cam.tilePx <= MARKER_UNTIL;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, x1 - x0, y1 - y0);
      ctx.clip();
      for (let ty = tyA; ty < tyB; ty++) {
        for (let tx = txA; tx < txB; tx++) {
          const i = idx(wrapX(tx), ty);
          const era = world.tech[i] as Tech;
          if (era === Tech.None) continue;
          const pic = this.picture(world, field, i, era);
          if (!pic) continue;
          const dx = (tx - cam.scrollX) * T - PAD * s;
          const dy = (ty - above - cam.scrollY) * T - PAD * s;
          const dw = pic.base.width * s;
          const dh = pic.base.height * s;
          if (sharp || T < 16) {
            ctx.imageSmoothingEnabled = !sharp;
            if (!sharp) ctx.imageSmoothingQuality = SMOOTHING;
            ctx.drawImage(pic.base, dx, dy, dw, dh);
          } else {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = SMOOTHING;
            ctx.drawImage(this.enlarged(pic, k), dx, dy, dw, dh);
          }
        }
      }
      if (marker) this.drawMarkers(ctx, cam, world, txA, txB, tyA, tyB);
      ctx.restore();
    }

    /**
     * Pennants at a fixed screen size, for the zoomed-out map. Below 16 px per
     * tile one stands on the city's middle; at 16 px the city's buildings are
     * legible, so it stands at the tile's upper right corner, over the ring of
     * tiles the herds keep free (herds.ts), and leaves the city in sight.
     */
    private drawMarkers(ctx: CanvasRenderingContext2D, cam: LandCamera, world: WorldState, txA: number, txB: number, tyA: number, tyB: number): void {
      const T = cam.tilePx * cam.dpr;
      const size = Math.round(MARKER_PX * cam.dpr);
      const beside = cam.tilePx >= 16;
      ctx.imageSmoothingEnabled = false;
      for (let ty = tyA; ty < tyB; ty++) {
        for (let tx = txA; tx < txB; tx++) {
          const i = idx(wrapX(tx), ty);
          if (world.tech[i] === Tech.None) continue;
          const color = tribeArtColor(cityTribeColor(world, i));
          const key = `${size}|${color}`;
          let pic = this.markers.get(key);
          if (!pic) {
            pic = rasterArt(cityMarkerArt(color), size, MARKER_LOOK, false, true);
            this.markers.set(key, pic);
          }
          // The pole's foot is at (11, 27.6) of the 32 art units.
          const cx = (tx + (beside ? 0.95 : 0.5) - cam.scrollX) * T;
          const cy = (ty + (beside ? 0.2 : 0.55) - cam.scrollY) * T;
          ctx.drawImage(pic, Math.round(cx - (11 / 32) * size), Math.round(cy - (27.6 / 32) * size));
        }
      }
    }

    /** The 1× picture of the city on tile `i`, composed when anything it shows has changed. */
    private picture(world: WorldState, field: TerrainField, i: number, era: Tech): CityPicture | null {
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      const size = citySize(world.cityPop[i]);
      const tribe = cityTribeColor(world, i);
      const rivers = RiverSystem.connectionMask(world, x, y);
      const sig = field.paths.sig;
      const river = `${sig[i]}.${sig[idx(wrapX(x - 1), y)]}.${sig[idx(wrapX(x + 1), y)]}.${sig[idx(x, clampY(y - 1))]}.${sig[idx(x, clampY(y + 1))]}`;
      const key = `${era}|${size}|${tribe}|${rivers}|${river}`;
      const old = this.pictures.get(i);
      if (old && old.key === key) return old;
      const atlas = this.atlas;
      if (!atlas) return null;
      if (performance.now() > this.deadline) {
        this.pending = true;
        return old ?? null;
      }
      const { w, h } = cityPictureSize();
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const c = canvas.getContext('2d');
      if (!c) return null;
      const near = (px: number, py: number, pad: number): boolean => field.paths.near(px, py, pad);
      const image = c.createImageData(w, h);
      const wet = cityWetMask(x, y, near);
      composeCity(layoutCity({ x, y, era, size, tribe, rivers, near, wet }), wet, atlas, image.data);
      c.putImageData(image, 0, 0);
      const pic: CityPicture = { key, base: canvas, big: null, bigK: 0 };
      this.pictures.set(i, pic);
      return pic;
    }

    private enlarged(pic: CityPicture, k: number): HTMLCanvasElement {
      if (pic.big && pic.bigK === k) return pic.big;
      const canvas = pic.big ?? document.createElement('canvas');
      canvas.width = pic.base.width * k;
      canvas.height = pic.base.height * k;
      const c = canvas.getContext('2d');
      if (c) {
        c.imageSmoothingEnabled = false;
        c.drawImage(pic.base, 0, 0, canvas.width, canvas.height);
      }
      pic.big = canvas;
      pic.bigK = k;
      return canvas;
    }
  }
}
