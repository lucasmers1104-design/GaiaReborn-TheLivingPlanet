/* =============================================================================
 * SimEarth 2.0 — a city's picture at 1×
 * -----------------------------------------------------------------------------
 * Composes the blocks of one city (citylayout.ts) from the civ atlas into a
 * small RGBA picture: the civ box (its tile, 2 px on either side and up to
 * 8 px above), with a transparent pixel all round. First the yard, without its pixels near the river, then the union of
 * the blocks' drop shadows blended once, then the blocks back to front.
 * Pure arithmetic on typed arrays, so tests compose cities in Node; the map
 * (citylayer.ts) puts the result into a canvas.
 * ========================================================================== */

namespace SE {
  /** RGBA pixels of the civ atlas, `w` wide. */
  export interface CivAtlasPixels { readonly w: number; readonly data: Uint8ClampedArray | Uint8Array }

  /** Transparent art pixels around a city picture, so smoothing fades its edge instead of cutting it. */
  export const CITY_PAD = 1;

  /** Width and height of a city picture in art pixels. */
  export function cityPictureSize(m: CivManifest = CIV_MANIFEST): { w: number; h: number } {
    return { w: m.box.w + 2 * CITY_PAD, h: m.box.h + 2 * CITY_PAD };
  }

  /** Art pixels of the box beside the tile on either side. */
  export function cityBoxSide(m: CivManifest = CIV_MANIFEST): number {
    return (m.box.w - 16) / 2;
  }

  /** Ground and bridges cast no shadow: the yard is ground itself, a bridge stands over water. */
  function casts(role: string): boolean {
    return role !== 'ground' && role !== 'bridge';
  }

  /**
   * The drop shadow of a block whose sprite's left edge is at `left` and foot
   * row at `fy` (tile pixels): a flat ellipse under its footprint, one column
   * right of the footprint's centre (tools/civ/sheet.js draws the same).
   */
  export function cityShadow(sp: CivSprite, left: number, fy: number, plot: (x: number, y: number) => void, m: CivManifest = CIV_MANIFEST): void {
    const S = m.shadow;
    const rx = Math.max(2, (sp.bx1 - sp.bx0 + 1) * S.width);
    const cx = left + Math.floor((sp.bx0 + sp.bx1) / 2) + 1;
    const reach = Math.ceil(rx);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -reach; dx <= reach; dx++) if ((dx / rx) ** 2 + (dy / S.ry) ** 2 <= 1) plot(cx + dx, fy + dy);
    }
  }

  /**
   * Compose `blocks` into `out` (cityPictureSize RGBA, cleared here). `wet`
   * is the tile's cityWetMask: yard pixels on it are left out, so the river
   * keeps its banks.
   */
  export function composeCity(
    blocks: readonly CityBlock[], wet: Uint8Array, atlas: CivAtlasPixels, out: Uint8ClampedArray | Uint8Array,
    m: CivManifest = CIV_MANIFEST,
  ): void {
    const { w: W, h: H } = cityPictureSize(m);
    const oy = CITY_PAD + m.box.h - 16;
    const side = cityBoxSide(m);
    const ox = CITY_PAD + side;
    out.fill(0);
    const solid = new Uint8Array(W * H);
    const copy = (b: CityBlock, yard: boolean): void => {
      const sp = m.blocks[b.id].variants[b.v];
      const r = sp.rect;
      const left = b.fx - sp.ax;
      const top = b.fy - sp.ay;
      for (let sy = 0; sy < r.h; sy++) {
        for (let sx = 0; sx < r.w; sx++) {
          const a = ((r.y + sy) * atlas.w + r.x + sx) * 4;
          if (atlas.data[a + 3] < 128) continue;
          const px = left + sx;
          const py = top + sy;
          if (yard && (px < 0 || px >= 16 || py < 0 || py >= 16 || wet[py * 16 + px] !== 0)) continue;
          const o = ((oy + py) * W + ox + px) * 4;
          if (!yard && casts(m.blocks[b.id].role)) solid[o >> 2] = 1;
          out[o] = atlas.data[a];
          out[o + 1] = atlas.data[a + 1];
          out[o + 2] = atlas.data[a + 2];
          out[o + 3] = 255;
        }
      }
    };
    for (const b of blocks) if (m.blocks[b.id].role === 'ground') copy(b, true);

    // Shadows as one union, so where two overlap the ground darkens once; on the tile's rows, across the box.
    const BW = m.box.w;
    const shade = new Uint8Array(BW * 16);
    for (const b of blocks) {
      const blk = m.blocks[b.id];
      if (!casts(blk.role)) continue;
      const sp = blk.variants[b.v];
      cityShadow(sp, b.fx - sp.ax, b.fy, (px, py) => {
        if (px >= -side && px < 16 + side && py >= 0 && py < 16) shade[py * BW + px + side] = 1;
      }, m);
    }
    const { rgb, alpha } = m.shadow;
    for (let i = 0; i < BW * 16; i++) {
      if (shade[i] === 0) continue;
      const o = ((oy + Math.floor(i / BW)) * W + CITY_PAD + (i % BW)) * 4;
      if (out[o + 3] === 255) {
        for (let c = 0; c < 3; c++) out[o + c] = Math.round(out[o + c] * (1 - alpha) + rgb[c] * alpha);
      } else {
        out[o] = rgb[0];
        out[o + 1] = rgb[1];
        out[o + 2] = rgb[2];
        out[o + 3] = Math.round(alpha * 255);
      }
    }
    for (const b of blocks) if (m.blocks[b.id].role !== 'ground') copy(b, false);

    // A dark rim round the buildings, so the city keeps its silhouette on busy ground and among the animal icons.
    const RIM = 0.6;
    for (let p = 0; p < W * H; p++) {
      if (solid[p] === 1) continue;
      const x = p % W;
      if (!((x > 0 && solid[p - 1]) || (x < W - 1 && solid[p + 1]) || (p >= W && solid[p - W]) || (p < W * (H - 1) && solid[p + W]))) continue;
      const o = p * 4;
      const a = out[o + 3] / 255;
      for (let c = 0; c < 3; c++) out[o + c] = Math.round((out[o + c] * a * (1 - RIM) + rgb[c] * RIM) / (a + RIM - a * RIM));
      out[o + 3] = Math.round((a + RIM - a * RIM) * 255);
    }
  }
}
