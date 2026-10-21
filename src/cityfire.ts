/* =============================================================================
 * SimEarth 2.0 — flickering fire places and smoking chimneys
 * -----------------------------------------------------------------------------
 * City and camp pictures are composed once and kept (citylayer.ts); their
 * fire places and chimneys are static. This layer draws the moving part over
 * them every frame: the flame (civ atlas block `flame`) over each fire place
 * and the smoke (block `smoke`) over each chimney opening, each anchored one
 * row above its spot and scaled exactly like the pictures: nearest neighbour
 * to k × 16 px per tile, then smoothly to the device tile size. Every fire and
 * chimney keeps its own pace; with "Effekte reduzieren" all stand still on
 * frame 0. Peaceful: nothing here touches the disasters.
 * ========================================================================== */

namespace SE {
  const PAD = CITY_PAD;

  export type CityPuff = 'flame' | 'smoke';

  /**
   * Per atlas block: how long a frame lasts (its pace hashed from where it
   * is, in that range of ms) and whether it flickers (frames in a hashed
   * order) or runs through them in order (smoke rising).
   */
  const PUFFS: Record<CityPuff, { readonly msMin: number; readonly msMax: number; readonly flicker: boolean }> = {
    flame: { msMin: 110, msMax: 160, flicker: true },
    smoke: { msMin: 180, msMax: 220, flicker: false },
  };

  /**
   * The frame a flame or smoke at world pixel (x, y) shows at time `now`: 0
   * while `still`; a flame flickers in a hashed order that seldom holds one
   * frame twice in a row, smoke runs through its frames in order.
   */
  export function cityPuffFrame(kind: CityPuff, x: number, y: number, now: number, still: boolean, frames: number): number {
    if (still || frames < 2) return 0;
    const p = PUFFS[kind];
    const ms = p.msMin + landHash(x, y, 1) * (p.msMax - p.msMin);
    const step = Math.floor(now / ms + landHash(x, y, 2) * 64);
    if (!p.flicker) return step % frames;
    const pick = (s: number): number => Math.floor(landHash(x, y, s + 3) * frames);
    const f = pick(step);
    return f === pick(step - 1) ? (f + 1) % frames : f;
  }

  /** The frames of one block at 1× with PAD all round, and enlarged k times. */
  interface PuffFrames { readonly base: HTMLCanvasElement[]; big: HTMLCanvasElement[]; bigK: number }

  export class CityFireLayer {
    /** "Effekte reduzieren": every flame and smoke on its still frame. */
    still = false;
    private readonly frames = new Map<CityPuff, PuffFrames>();

    /** Flames over the fire places of the cities and camps in view, smoke over the chimneys (device pixels, identity transform). */
    draw(
      ctx: CanvasRenderingContext2D, cam: LandCamera, world: WorldState, field: TerrainField, cities: CityLayer,
      cols: number, rows: number, now: number,
    ): void {
      const flame = this.load(cities, 'flame');
      const smoke = this.load(cities, 'smoke');
      if (!flame && !smoke) return;
      const T = cam.tilePx * cam.dpr;
      const s = T / 16;
      const k = T > 16 ? Math.ceil(T / 16 - 1e-6) : 1;
      const sharp = Math.abs(T - 16 * k) < 1e-6;
      ctx.imageSmoothingEnabled = !sharp;
      if (!sharp) ctx.imageSmoothingQuality = 'high';
      // tx: view column, unwrapped, as CityLayer.put takes it; spots as x, y pairs in tile pixels.
      const puffs = (kind: CityPuff, pf: PuffFrames | null, tx: number, ty: number, spots: readonly number[]): void => {
        if (!pf || spots.length === 0) return;
        const block = CIV_MANIFEST.blocks[kind];
        const pics = sharp || T < 16 ? pf.base : this.enlarged(pf, k);
        for (let n = 0; n < spots.length; n += 2) {
          const fx = spots[n];
          const fy = spots[n + 1];
          const f = cityPuffFrame(kind, wrapX(tx) * 16 + fx, ty * 16 + fy, now, this.still, pics.length);
          const sp = block.variants[f];
          ctx.drawImage(pics[f],
            (tx - cam.scrollX) * T + (fx - sp.ax - PAD) * s, (ty - cam.scrollY) * T + (fy - 1 - sp.ay - PAD) * s,
            (sp.rect.w + 2 * PAD) * s, (sp.rect.h + 2 * PAD) * s);
        }
      };
      const txA = Math.floor(cam.scrollX) - 1;
      const txB = Math.ceil(cam.scrollX + cols) + 1;
      const tyA = Math.max(0, Math.floor(cam.scrollY) - 1);
      const tyB = Math.min(GRID_H, Math.ceil(cam.scrollY + rows) + 1);
      for (let ty = tyA; ty < tyB; ty++) {
        for (let tx = txA; tx < txB; tx++) {
          const i = idx(wrapX(tx), ty);
          if (world.tech[i] === Tech.None) continue;
          puffs('flame', flame, tx, ty, cities.cityFires(i));
          puffs('smoke', smoke, tx, ty, cities.citySmokes(i));
        }
      }
      if (!flame) return;
      for (const b of world.civ.bands) {
        const pic = cities.campPicture(world, field, b);
        if (!pic || pic.fires.length === 0) continue;
        const tile = b.path[b.step];
        // The copy of the tile on the wrapping map nearest the view, as CityLayer.drawCamps.
        let tx = (tile % GRID_W) - cam.scrollX;
        tx -= Math.floor(tx / GRID_W) * GRID_W;
        if (tx > GRID_W - 2) tx -= GRID_W;
        const ty = Math.floor(tile / GRID_W);
        if (tx < -2 || tx > cols + 1 || ty - cam.scrollY < -2 || ty - cam.scrollY > rows + 1) continue;
        puffs('flame', flame, tx + cam.scrollX, ty, pic.fires);
      }
    }

    /** The frames of block `kind`, cut out of the decoded atlas once; null until it is ready or while the atlas has none. */
    private load(cities: CityLayer, kind: CityPuff): PuffFrames | null {
      const old = this.frames.get(kind);
      if (old) return old;
      const block = CIV_MANIFEST.blocks[kind];
      const atlas = cities.pixels;
      if (!block || block.variants.length === 0 || !atlas) return null;
      const base = block.variants.map((sp) => {
        const r = sp.rect;
        const canvas = document.createElement('canvas');
        canvas.width = r.w + 2 * PAD;
        canvas.height = r.h + 2 * PAD;
        const c = canvas.getContext('2d');
        if (!c) return canvas;
        const image = c.createImageData(r.w, r.h);
        for (let y = 0; y < r.h; y++) {
          for (let x = 0; x < r.w; x++) {
            const a = ((r.y + y) * atlas.w + r.x + x) * 4;
            if (atlas.data[a + 3] < 128) continue;
            const o = (y * r.w + x) * 4;
            image.data[o] = atlas.data[a];
            image.data[o + 1] = atlas.data[a + 1];
            image.data[o + 2] = atlas.data[a + 2];
            image.data[o + 3] = 255;
          }
        }
        c.putImageData(image, PAD, PAD);
        return canvas;
      });
      const pf: PuffFrames = { base, big: [], bigK: 0 };
      this.frames.set(kind, pf);
      return pf;
    }

    private enlarged(pf: PuffFrames, k: number): HTMLCanvasElement[] {
      if (pf.bigK === k) return pf.big;
      pf.big = pf.base.map((f) => {
        const canvas = document.createElement('canvas');
        canvas.width = f.width * k;
        canvas.height = f.height * k;
        const c = canvas.getContext('2d');
        if (c) {
          c.imageSmoothingEnabled = false;
          c.drawImage(f, 0, 0, canvas.width, canvas.height);
        }
        return canvas;
      });
      pf.bigK = k;
      return pf.big;
    }
  }
}
