/* One field of terrain with only its own objects, including their overhang. */
namespace SE {
  const EMPTY_SCENE = new Uint8Array(TILE_COUNT).fill(LAND_SCENE_NONE);
  const EMPTY_VOLCANO = new Uint8Array(TILE_COUNT);
  const EMPTY = new Uint8Array(TILE_COUNT);

  export interface ExaminedTile {
    readonly width: number;
    readonly height: number;
    readonly left: number;
    readonly top: number;
    readonly pixels: Uint32Array;
  }

  export function composeExaminedTile(art: LandArt, field: TerrainField, x: number, y: number): ExaminedTile {
    // Share terrain inputs, but suppress all objects while composing the field's ground.
    const bare = Object.assign(Object.create(TerrainField.prototype) as TerrainField, field, { scene: EMPTY_SCENE, volcano: EMPTY_VOLCANO, reef: EMPTY, palm: EMPTY });
    const ground = new Uint32Array(16 * 16);
    new LandComposer(art).compose(bare, x, y, 1, 1, 0, ground, null);
    const placed: LandPlacement[] = [];
    placeLandObjects(field, art, x, y, x, y, placed);
    const objects: LandPlacement[] = [];
    for (const p of placed) {
      if (!p.water && field.paths.near(p.fx + 0.5, p.fy + 0.5, RIVER_CLEARANCE)) continue;
      if (landObjectOnBeach(field, art, p)) continue;
      const rise = p.water ? { z: 0, seg: -1 } : footRise(field.ridges, p.fx, p.fy);
      if (rise.z > 0 && landObjectAboveLine(art, p.sprite, field.ridges, rise.seg, rise.z)) continue;
      objects.push({ ...p, fy: p.fy - Math.round(rise.z) });
    }
    objects.sort((a, b) => a.fy - b.fy || a.fx - b.fx || a.seq - b.seq);
    let left = 0, top = 0, right = 16, bottom = 16;
    for (const p of objects) {
      left = Math.min(left, p.fx - x * 16 - p.sprite.ax);
      top = Math.min(top, p.fy - y * 16 - p.sprite.ay);
      right = Math.max(right, p.fx - x * 16 - p.sprite.ax + p.sprite.w);
      bottom = Math.max(bottom, p.fy - y * 16 - p.sprite.ay + p.sprite.h);
    }
    const width = right - left, height = bottom - top;
    const indices = new Uint8Array(width * height);
    const base = LandArt.indicesOf(new Uint8ClampedArray(ground.buffer), art.manifest);
    const water = new Uint8Array(indices.length);
    for (let py = 0; py < 16; py++) {
      for (let px = 0; px < 16; px++) {
        const k = (py - top) * width + px - left;
        indices[k] = base[py * 16 + px];
        water[k] = art.isWater[indices[k]];
      }
    }
    drawLandObjects(objects, art, indices, water, new Uint8Array(indices.length), width, height, x * 16 + left, y * 16 + top);
    const pixels = Uint32Array.from(indices, v => art.rgba[v]);
    return { width, height, left, top, pixels };
  }

  /** `creature`: the animal standing here, a 32 px sprite; the ground is then doubled so it shows as on the map at 32 px per tile. */
  export function examineTilePicture(world: WorldState, x: number, y: number, creature: HTMLCanvasElement | null = null): HTMLCanvasElement | null {
    const land = PixelTerrain.shared();
    if (TERRAIN_STYLE !== 'pixel' || !land.ready || !land.art) return null;
    land.ensure(world);
    const tile = composeExaminedTile(land.art, land.field, x, y);
    const k = creature ? 2 : 1;
    const canvas = document.createElement('canvas');
    canvas.width = tile.width * k;
    canvas.height = tile.height * k;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const image = ctx.createImageData(tile.width, tile.height);
    new Uint32Array(image.data.buffer).set(tile.pixels);
    ctx.putImageData(image, 0, 0);
    if (creature) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(canvas, 0, 0, tile.width, tile.height, 0, 0, canvas.width, canvas.height);
      ctx.drawImage(creature, -tile.left * k, -tile.top * k);
    }
    const scale = Math.max(1, Math.min(8, Math.floor(136 / tile.width), Math.floor(152 / tile.height)));
    canvas.style.width = `${tile.width * scale}px`;
    canvas.style.height = `${tile.height * scale}px`;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Das ausgewählte Feld mit seinen Pflanzenobjekten');
    return canvas;
  }
}
