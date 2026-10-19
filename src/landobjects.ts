/* =============================================================================
 * SimEarth 2.0 — plant and rock objects on the pixel terrain
 * -----------------------------------------------------------------------------
 * Every tile expects a number of trees, bushes and low plants by landscape and
 * density (catalog `objects`); each slot goes to one of the plant groups that
 * grow there, the group that shapes the tile weighted up, so a mixed forest
 * shows spruces and broadleaf trees and a marsh reed and sundew. Near a lower
 * ground the cover thins (×0.35 / ×0.7) and trees stay small, at the very edge
 * they give way to bushes — the forest mantle (spec §4.5).
 *
 * Position, jitter, size and variant all come from hashes of the tile, never
 * per frame. Objects are drawn row by row from the top, so crowns overlap into
 * a closed canopy, each over a small ramp-shift shadow on the ground. On a
 * lifted mountain range (landridgedraw.ts) an object stands as high as the
 * ground under its foot and hides behind nearer ground; plants stop at the
 * crest's tree line. Volcanic cones are relief, not objects (landridges.ts).
 * Reefs show coral and sand patches under the water's ripples; on a beach
 * only palms stand, on the dry sand, their crowns leaning over the sea.
 * ========================================================================== */

namespace SE {
  export interface LandPlacement {
    readonly sprite: LandSprite;
    /** Foot in world pixels (x unwrapped, as the caller's tiles were). */
    readonly fx: number;
    readonly fy: number;
    /** Kelp, corals: drawn on sea water only, without a shadow. */
    readonly water: boolean;
    /** World-stable tie-break for objects with the same foot. */
    readonly seq: number;
  }

  /**
   * A slot goes to one of the groups present that has an object of its kind
   * here, weighted: the group that shapes the tile, a group drawn for this
   * landscape in particular, any other. The flora keeps old groups for ever,
   * so without weights a modern forest would be half palm ferns; with them
   * the leading group shapes the picture and every other group still shows.
   */
  const WEIGHT_TOP = 4;
  const WEIGHT_SPECIFIC = 2;
  const WEIGHT_OTHER = 1;
  /** Object density by distance to a lower ground: at the edge, one tile in, inside. */
  const EDGE_FALLOFF = [0.35, 0.7, 1];
  /** Share of edge trees that become bushes. */
  const MANTLE = 0.6;
  /** Shadow: fraction of the sprite width, and ramp steps. */
  const SHADOW_WIDTH = 0.35;
  const SHADOW_SHIFT = -2;
  /** A cactus's slot: on the 2×2 pattern a quarter apart from the first two slots and from the rock (slot 9). */
  const CACTUS_SLOT = 10;
  /** A savanna tree's slot: the quarter the first three slots (the rock's and a cactus's among them) leave free. */
  const SAVANNA_TREE_SLOT = 11;
  /** Ground rows a shadow may lie from its object's foot on lifted ground. */
  const SHADOW_DEPTH = 2;
  /** Ground rows in front of its foot that still leave an object in view. */
  const DEPTH_SLACK = 1;

  /** Objects of tiles [x0, x1] × [y0, y1] (inclusive, x unwrapped), sorted for drawing. */
  export function placeLandObjects(f: TerrainField, art: LandArt, x0: number, y0: number, x1: number, y1: number, out: LandPlacement[]): void {
    out.length = 0;
    for (let y = Math.max(0, y0); y <= Math.min(GRID_H - 1, y1); y++) {
      for (let x = x0; x <= x1; x++) placeTile(f, art, x, y, out);
    }
    out.sort((a, b) => a.fy - b.fy || a.fx - b.fx || a.seq - b.seq);
  }

  function placeTile(f: TerrainField, art: LandArt, x: number, y: number, out: LandPlacement[]): void {
    const xw = wrapX(x);
    const i = y * GRID_W + xw;
    if (f.reef[i] !== CoralKind.None) {
      placeLandReef(f, art, xw, x, y, out);
      return;
    }
    const palms = f.palm[i];
    if (palms > 0 && art.sprites.coconut_palm) placeLandPalms(f, art, xw, x, y, palms, out);
    const scene = f.scene[i];
    if (scene === LAND_SCENE_NONE) return;
    const T = LandTables.shared();
    const counts = T.counts[scene];
    const edge = f.edge[i];
    const d = f.density[i];
    // A volcano's tile and the ones in front of and behind it keep its cone in view: young trees only, no boulders.
    const cone = f.volcano[i] !== 0 || (y > 0 && f.volcano[i - GRID_W] !== 0) || (y < GRID_H - 1 && f.volcano[i + GRID_W] !== 0);
    let slot = 0;
    for (let kind = 0; kind < counts.length; kind++) {
      const c = counts[kind];
      if (!c) continue;
      const expect = c[Math.min(d, c.length - 1)] * EDGE_FALLOFF[edge];
      const n = Math.floor(expect) + (landHash(xw, y, 500 + kind) < expect % 1 ? 1 : 0);
      for (let s = 0; s < n; s++, slot++) {
        const mantle = kind === LAND_KIND_TREE && edge === 0 && landHash(xw, y, 600 + slot) < MANTLE;
        let id = pick(f, T, i, scene, mantle ? LAND_KIND_BUSH : kind, xw, y, slot);
        // No bush grows here: a young tree stands at the edge instead.
        if (!id && mantle) id = pick(f, T, i, scene, kind, xw, y, slot);
        if (id) out.push(spot(art, id, xw, x, y, slot, edge, mantle || cone));
      }
    }
    const cacti = T.cactusIds;
    if (f.cactus[i] && cacti.length > 0) {
      out.push(spot(art, cacti[Math.floor(landHash(xw, y, 821) * cacti.length)], xw, x, y, CACTUS_SLOT, 2, false));
    }
    if (f.savannaTree[i]) out.push(spot(art, savannaTreeId(art, xw, y), xw, x, y, SAVANNA_TREE_SLOT, edge, false));
    const rate = T.abioticRate[scene];
    if (rate > 0 && !cone && landHash(xw, y, 800) < rate) {
      const ids = T.abioticIds[scene];
      if (ids.length > 0) out.push(spot(art, ids[Math.floor(landHash(xw, y, 801) * ids.length)], xw, x, y, 9, 2, false));
    }
  }

  /** The object a slot shows: a group by weight, then one of its objects for this scene. */
  function pick(f: TerrainField, T: LandTables, i: number, scene: number, kind: number, xw: number, y: number, slot: number): string | null {
    const groups = f.groups[i];
    const top = f.top[i];
    const weight = (g: number): number =>
      g === top ? WEIGHT_TOP : T.isSpecific(scene, g, kind) ? WEIGHT_SPECIFIC : WEIGHT_OTHER;
    let total = 0;
    for (let g = 1; g < FLORA_COUNT; g++) {
      if ((groups & (1 << g)) !== 0 && T.choices(scene, g, kind).length > 0) total += weight(g);
    }
    if (total === 0) return null;
    let roll = landHash(xw, y, 700 + slot) * total;
    for (let g = 1; g < FLORA_COUNT; g++) {
      if ((groups & (1 << g)) === 0) continue;
      const list = T.choices(scene, g, kind);
      if (list.length === 0) continue;
      roll -= weight(g);
      if (roll < 0) return list[Math.floor(landHash(xw, y, 710 + slot) * list.length)];
    }
    return null;
  }

  function spot(art: LandArt, id: string, xw: number, x: number, y: number, slot: number, edge: number, small: boolean): LandPlacement {
    const vars = art.sprites[id];
    let sprite = vars[0];
    if (vars[0].size) {
      const r = landHash(xw, y, 900 + slot);
      const size = small || edge === 0 ? 's' : edge === 1 ? (r < 0.5 ? 's' : 'm') : (r < 0.3 ? 'm' : 'l');
      const form = landHash(xw, y, 910 + slot) < 0.5 ? 0 : 1;
      sprite = vars.find((v) => v.size === size && v.form === form) ?? vars.find((v) => v.size === size) ?? vars[0];
    } else {
      sprite = vars[Math.floor(landHash(xw, y, 920 + slot) * vars.length)];
    }
    // Slots spread over a jittered 2×2 pattern, feet in the lower part of the tile.
    const p = (slot + Math.floor(landHash(xw, y, 930) * 4)) % 4;
    const fx = x * 16 + 4 + (p % 2) * 8 + Math.floor((landHash(xw, y, 940 + slot) - 0.5) * 5);
    const fy = y * 16 + 7 + (p >> 1) * 6 + Math.floor((landHash(xw, y, 950 + slot) - 0.5) * 4);
    const water = art.manifest.objects[id].kind === 'water';
    return { sprite, fx, fy, water, seq: (y * GRID_W + xw) * 16 + slot };
  }

  /** Objects take this share of their tile's ground shading (TerrainField.shade), rounded to whole steps. */
  const OBJECT_RELIEF = 0.6;

  /**
   * Draw placements into an index buffer of width `w` whose pixel (0, 0) is
   * world pixel (ox, oy): first each shadow on bare ground (never on water,
   * never twice), then the sprite. With `rise`, objects stand on the lifted
   * ground and every pixel whose screen shows nearer ground stays hidden.
   * `lifts`, when given, is the lift under each foot (the caller has dropped
   * the plants above their line); else it is read from `rise`. `shade`, the
   * field's ground shading, tones each object like its tile's ground.
   */
  export function drawLandObjects(
    list: readonly LandPlacement[], art: LandArt,
    px: Uint8Array, water: Uint8Array, occupied: Uint8Array, w: number, h: number, ox: number, oy: number,
    rise: LandRise | null = null, lifts: Float32Array | null = null, shade: Float32Array | null = null,
  ): void {
    const shadow = art.shift[LAND_SHIFT_MAX + SHADOW_SHIFT];
    const rip = art.rippleCoast;
    const rw = rip.size - 1;
    const top = rise ? rise.top : null;
    const bottom = rise ? rise.bottom : null;
    const depth = rise ? rise.depth : null;
    for (let q = 0; q < list.length; q++) {
      const p = list[q];
      const t = p.sprite;
      const look = spriteLook(art, t);
      const fx = p.fx - ox;
      const ground = p.fy - oy;
      let fy = ground;
      if (lifts) {
        if (lifts[q] > 0) fy = ground - ((lifts[q] + 0.5) | 0);
      } else if (rise && fx >= 0 && fx < w && ground >= 0 && ground < h) {
        const k = ground * w + fx;
        const z = rise.z[k];
        if (z > 0) {
          // Trees end at the crest's tree line, every other plant at its rock line.
          const s = rise.seg[k];
          if (landObjectAboveLine(art, t, rise.ridges, s, z)) continue;
          fy = ground - ((z + 0.5) | 0);
        }
      }
      if (!p.water) {
        const sx = look.shadowX;
        const sy = look.shadowY;
        for (let n = 0; n < sx.length; n++) {
          const y = fy + sy[n];
          const x = fx + 1 + sx[n];
          if (y < 0 || y >= h || x < 0 || x >= w) continue;
          const k = y * w + x;
          if (occupied[k] !== 0 || water[k] !== 0) continue;
          if (depth && y >= (top as Int16Array)[x] && y <= (bottom as Int32Array)[x] && Math.abs(depth[k] - ground) > SHADOW_DEPTH) continue;
          px[k] = shadow[px[k]];
          occupied[k] = 2;
        }
      }
      // The relief of the tile it stands on, in whole steps: hills read through a forest too.
      let tone: Uint8Array | null = null;
      if (shade) {
        const s = Math.round(shade[clampY(Math.floor(p.fy / 16)) * GRID_W + wrapX(Math.floor(p.fx / 16))] * OBJECT_RELIEF);
        if (s !== 0) tone = art.shift[LAND_SHIFT_MAX + clamp(s, -LAND_SHIFT_MAX, LAND_SHIFT_MAX)];
      }
      const left = fx - t.ax;
      const up = fy - t.ay;
      const ux = look.x;
      const uy = look.y;
      const uv = look.v;
      // The whole sprite inside the buffer, on plain land, no lifted ground in front: no test per pixel.
      let clear = !p.water && left >= 0 && up >= 0 && left + t.w <= w && up + t.h <= h;
      if (clear && depth) {
        const low = up + t.h - 1;
        for (let x = left; x < left + t.w; x++) {
          if ((top as Int16Array)[x] <= low && (bottom as Int32Array)[x] >= up) { clear = false; break; }
        }
      }
      if (clear) {
        const base = up * w + left;
        for (let n = 0; n < uv.length; n++) {
          const k = base + uy[n] * w + ux[n];
          px[k] = tone ? tone[uv[n]] : uv[n];
          occupied[k] = 1;
          // Over the sea a crown hides the water: no surf or wave is drawn on it.
          if (water[k] === 1) water[k] = 0;
        }
        continue;
      }
      for (let n = 0; n < uv.length; n++) {
        const y = up + uy[n];
        const x = left + ux[n];
        if (y < 0 || y >= h || x < 0 || x >= w) continue;
        const k = y * w + x;
        if (p.water && water[k] !== 1) continue;
        // Corals lie under the water: its ripples and the shore's foam and lighter band show over them.
        if (look.under && (rip.px[((oy + y) & rw) * rip.size + ((ox + x) & rw)] !== 0 || x < 2 || y < 2 || x >= w - 2 || y >= h - 2 ||
          water[k - 1] !== 1 || water[k + 1] !== 1 || water[k - w] !== 1 || water[k + w] !== 1 ||
          water[k - 2] !== 1 || water[k + 2] !== 1 || water[k - 2 * w] !== 1 || water[k + 2 * w] !== 1)) continue;
        // Nearer ground shows here (riseDepth, inlined: this runs for every sprite pixel).
        if (depth && y >= (top as Int16Array)[x] && y <= (bottom as Int32Array)[x] && depth[k] > ground + DEPTH_SLACK) continue;
        px[k] = tone ? tone[uv[n]] : uv[n];
        occupied[k] = 1;
        if (!p.water && water[k] === 1) water[k] = 0;
      }
    }
  }

  /**
   * Whether an object stands above its line on a crest of segment `seg` at
   * lift z: trees end at the tree line, other plants at the rock line, and a
   * volcano cone carries nothing at all, so its outline reads at a glance.
   */
  export function landObjectAboveLine(art: LandArt, t: LandSprite, ridges: RidgePaths, seg: number, z: number): boolean {
    if (ridges.crater[seg] > 0) return true;
    const look = spriteLook(art, t);
    return look.plant && z >= (look.tree ? ridges.zTree[seg] : ridges.zRock[seg]);
  }

  /** What drawing needs of a sprite, worked out once: its opaque pixels, its shadow, its kind. */
  interface SpriteLook {
    readonly x: Uint8Array; readonly y: Uint8Array; readonly v: Uint8Array;
    readonly shadowX: Int8Array; readonly shadowY: Int8Array;
    readonly plant: boolean; readonly tree: boolean;
    /** Lies under the water's surface (corals): drawn below its ripples. */
    readonly under: boolean;
  }
  const LOOKS = new WeakMap<LandSprite, SpriteLook>();

  function spriteLook(art: LandArt, t: LandSprite): SpriteLook {
    const known = LOOKS.get(t);
    if (known) return known;
    const xs: number[] = [];
    const ys: number[] = [];
    const vs: number[] = [];
    for (let sy = 0; sy < t.h; sy++) {
      for (let sx = 0; sx < t.w; sx++) {
        const v = t.px[sy * t.w + sx];
        if (v === 0) continue;
        xs.push(sx); ys.push(sy); vs.push(v);
      }
    }
    // The shadow: an ellipse of a third of the sprite's width, three rows high, at the foot.
    const rx = Math.max(2, t.w * SHADOW_WIDTH);
    const reach = Math.ceil(rx);
    const dxs: number[] = [];
    const dys: number[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        if ((dx / rx) ** 2 + (dy / 1.5) ** 2 > 1) continue;
        dxs.push(dx); dys.push(dy);
      }
    }
    const ob = art.manifest.objects[t.id];
    const look: SpriteLook = {
      x: Uint8Array.from(xs), y: Uint8Array.from(ys), v: Uint8Array.from(vs),
      shadowX: Int8Array.from(dxs), shadowY: Int8Array.from(dys),
      plant: ob.group !== null, tree: ob.kind === 'tree', under: ob.kind === 'reef',
    };
    LOOKS.set(t, look);
    return look;
  }
}
