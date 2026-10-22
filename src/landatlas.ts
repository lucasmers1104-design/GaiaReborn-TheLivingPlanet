/* =============================================================================
 * SimEarth 2.0 — the terrain atlas as palette indices
 * -----------------------------------------------------------------------------
 * The pixel landscape is composed in palette indices (docs/biomes-spec.md
 * §4.7): masks, relief, shore rims and object shadows are all moves along a
 * colour ramp, never a tint. This file turns the generated atlas
 * (terrainatlas.ts) into those indices once — textures, masks and object
 * sprites as small typed arrays — plus the ramp-shift tables and the
 * palette as RGBA words for the final putImageData.
 *
 * Node-safe: `LandArt.fromIndices` takes already decoded indices (tests decode
 * the PNG themselves); only `decodeLandAtlas` touches the DOM.
 * ========================================================================== */

namespace SE {
  /** A seamless indexed texture; `size` is a power of two. */
  export interface LandTex { readonly size: number; readonly px: Uint8Array }
  /** One object drawing; (ax, ay) is its foot. */
  export interface LandSprite {
    readonly id: string; readonly w: number; readonly h: number; readonly ax: number; readonly ay: number;
    readonly size: string; readonly form: number; readonly px: Uint8Array;
  }

  /** Ramp shifts the compositor applies: relief ±2–3, rim −1, shadow −2, combined. */
  export const LAND_SHIFT_MAX = 4;

  const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

  function rgbaWord(c: readonly number[]): number {
    const [r, g, b, a] = c;
    return LITTLE_ENDIAN ? ((a << 24) | (b << 16) | (g << 8) | r) >>> 0 : ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
  }

  export class LandArt {
    readonly manifest: TerrainManifest;
    /** Ground textures by material rank (1-based, as in the manifest) and density. */
    readonly ground: LandTex[][] = [];
    /** Material id by rank. */
    readonly materialAt: string[] = [];
    /** [case: TL=1 TR=2 BL=4 BR=8][variant] → 256 cells, 1 = inside. */
    readonly masks: Uint8Array[][];
    readonly rippleCoast: LandTex;
    readonly rippleOcean: LandTex;
    readonly algae: LandTex;
    /** Beach sand along the shores reefs.ts marks (landshore.ts). */
    readonly beach: LandTex;
    readonly sprites: Readonly<Record<string, readonly LandSprite[]>>;
    /** shift[by + LAND_SHIFT_MAX][index] → index moved `by` steps along its ramp. */
    readonly shift: Uint8Array[] = [];
    /** Palette as RGBA words in the platform's byte order, for a Uint32Array view on ImageData. */
    readonly rgba: Uint32Array;
    /** Water ramp, deep to shallow; the last step is the foam. */
    readonly water: readonly number[];
    /** Lagoon turquoise, dark to light (reefs.ts). */
    readonly waterWarm: readonly number[];
    /** Fade over the first open-ocean tile beside coastal sea, from the ocean outwards to the shelf edge (landwater.ts). */
    readonly shelf: readonly number[];
    /** 1 where a palette index belongs to the water, lagoon or shelf ramp. */
    readonly isWater: Uint8Array;

    private constructor(px: Uint8Array, m: TerrainManifest) {
      this.manifest = m;
      const cut = (r: TerrainRect): Uint8Array => {
        const out = new Uint8Array(r.w * r.h);
        for (let y = 0; y < r.h; y++) out.set(px.subarray((r.y + y) * m.width + r.x, (r.y + y) * m.width + r.x + r.w), y * r.w);
        return out;
      };
      const tex = (r: TerrainRect, size: number): LandTex => ({ size, px: cut(r) });

      for (const id of Object.keys(m.materials)) {
        const mat = m.materials[id];
        this.ground[mat.rank] = mat.densities.map((r) => tex(r, mat.size));
        this.materialAt[mat.rank] = id;
      }
      this.masks = m.masks.map((vars) => vars.map((r) => cut(r).map((v) => (v === m.maskIndex ? 1 : 0))));
      const ov = m.overlays;
      this.rippleCoast = tex(ov.ripple_coast.rect, ov.ripple_coast.size);
      this.rippleOcean = tex(ov.ripple_ocean.rect, ov.ripple_ocean.size);
      this.algae = tex(ov.algae_film.rect, ov.algae_film.size);
      this.beach = tex(ov.beach_sand.rect, ov.beach_sand.size);

      const sprites: Record<string, LandSprite[]> = {};
      for (const id of Object.keys(m.objects)) {
        sprites[id] = m.objects[id].variants.map((v) => ({
          id, w: v.rect.w, h: v.rect.h, ax: v.ax, ay: v.ay, size: v.size, form: v.form, px: cut(v.rect),
        }));
      }
      this.sprites = sprites;

      // Ramp of every index, for the shift tables.
      const rampOf = new Int16Array(256).fill(-1);
      const stepOf = new Uint8Array(256);
      const ramps = Object.values(m.ramps);
      ramps.forEach((r, k) => r.forEach((index, step) => { rampOf[index] = k; stepOf[index] = step; }));
      for (let by = -LAND_SHIFT_MAX; by <= LAND_SHIFT_MAX; by++) {
        const t = new Uint8Array(256);
        for (let i = 0; i < 256; i++) {
          if (i === 0 || rampOf[i] < 0) { t[i] = i; continue; }
          const r = ramps[rampOf[i]];
          t[i] = r[Math.max(0, Math.min(r.length - 1, stepOf[i] + by))];
        }
        this.shift.push(t);
      }
      this.rgba = new Uint32Array(256);
      m.palette.forEach((c, i) => { this.rgba[i] = rgbaWord(c); });
      this.water = m.ramps.water;
      this.waterWarm = m.ramps.waterWarm;
      this.shelf = m.ramps.shelf;
      this.isWater = new Uint8Array(256);
      for (const i of [...this.water, ...this.waterWarm, ...this.shelf]) this.isWater[i] = 1;
    }

    /** Art from atlas pixels already turned into palette indices (row-major, manifest width). */
    static fromIndices(px: Uint8Array, m: TerrainManifest = TERRAIN_MANIFEST): LandArt {
      if (px.length !== m.width * m.height) throw new Error('SimEarth: terrain atlas size does not match its manifest');
      return new LandArt(px, m);
    }

    /** Palette indices of RGBA pixels: exact colours, else the nearest palette entry. */
    static indicesOf(data: Uint8ClampedArray, m: TerrainManifest = TERRAIN_MANIFEST): Uint8Array {
      const exact = new Map<number, number>();
      m.palette.forEach((c, i) => { if (i > 0) exact.set((c[0] << 16) | (c[1] << 8) | c[2], i); });
      const out = new Uint8Array(data.length >> 2);
      for (let p = 0, o = 0; p < data.length; p += 4, o++) {
        if (data[p + 3] < 128) continue;
        const key = (data[p] << 16) | (data[p + 1] << 8) | data[p + 2];
        let i = exact.get(key);
        if (i === undefined) {
          // A browser that colour-manages the image moves colours a little.
          let best = 1;
          let bestD = Infinity;
          for (let k = 1; k < m.palette.length; k++) {
            const c = m.palette[k];
            const d = (c[0] - data[p]) ** 2 + (c[1] - data[p + 1]) ** 2 + (c[2] - data[p + 2]) ** 2;
            if (d < bestD) { bestD = d; best = k; }
          }
          i = best;
          exact.set(key, i);
        }
        out[o] = i;
      }
      return out;
    }
  }

  /**
   * Decode the atlas PNG in the browser. A data URI neither needs a fetch over
   * file:// nor taints the canvas, so getImageData is allowed.
   */
  export function decodeLandAtlas(done: (art: LandArt, indices: Uint8Array) => void, failed: (why: string) => void): void {
    const img = new Image();
    img.onload = () => {
      const m = TERRAIN_MANIFEST;
      const canvas = document.createElement('canvas');
      canvas.width = m.width;
      canvas.height = m.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) { failed('no 2D context'); return; }
      ctx.drawImage(img, 0, 0);
      const indices = LandArt.indicesOf(ctx.getImageData(0, 0, m.width, m.height).data, m);
      done(LandArt.fromIndices(indices, m), indices);
    };
    img.onerror = () => failed('the atlas image did not decode');
    img.src = TERRAIN_ATLAS_PNG;
  }
}
