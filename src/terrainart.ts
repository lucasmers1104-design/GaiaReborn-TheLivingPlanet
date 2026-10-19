/* =============================================================================
 * SimEarth 2.0 — ground and sea art for the Edit window
 * -----------------------------------------------------------------------------
 * The sea shows two flat classes, coastal sea and open ocean, like the pixel
 * map; the old Coast and Ocean sprites stay on top as a sparse ripple
 * texture. Depth (DEPTH_RAMP) only shows with the Oceans layer off and in the
 * overview's depth maps.
 * Every coast gets a line of surf, every ground one of four mirrored variants
 * picked per tile, so large plains no longer show a repeating stamp.
 * ========================================================================== */

namespace SE {
  /** Lagoon turquoise as the pixel map draws it (waterWarm), for the maps that show the sea flat. */
  export const LAGOON_RGB: Rgb = ((c) => [c[0], c[1], c[2]] as Rgb)(TERRAIN_MANIFEST.palette[TERRAIN_MANIFEST.ramps.waterWarm[SEA_LAGOON_STEP]]);

  /** Sea colour by elevation below sea level: from the abyss to the shore. */
  export const DEPTH_RAMP: readonly (readonly [number, Rgb])[] = [
    [-1.0, [10, 32, 72]],
    [-0.6, [16, 52, 104]],
    [-0.35, [24, 78, 136]],
    [COAST_DEPTH, [34, 112, 164]],
    [-0.07, [48, 146, 182]],
    [0.0, [86, 184, 192]],
  ];

  const DEPTH_STEPS = 48;

  /** Fill styles along DEPTH_RAMP, built once so drawing allocates nothing. */
  const DEPTH_STYLES: readonly string[] = (() => {
    const out: string[] = [];
    for (let k = 0; k <= DEPTH_STEPS; k++) out.push(rgbCss(sampleRamp(DEPTH_RAMP, -k / DEPTH_STEPS)));
    return out;
  })();

  /** Quantised depth of a sea tile, 0 at the shore to DEPTH_STEPS in the abyss. */
  export function depthStep(elevation: number): number {
    return Math.round(clamp(-elevation, 0, 1) * DEPTH_STEPS);
  }

  export function depthStyleAt(step: number): string {
    return DEPTH_STYLES[step];
  }

  /**
   * Stable per-tile noise in 0..1 for purely visual variation. Never the world
   * RNG: the render loop runs every frame and must not flicker or advance it.
   */
  export function tileNoise(i: number): number {
    let h = Math.imul(i ^ 0x27d4eb2f, 0x165667b1);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca77);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  }

  /* ------------------------------------------------------- ground variants -- */

  function mirrorRows(rows: SpriteRows, flipX: boolean, flipY: boolean): SpriteRows {
    const out = rows.map((r) => (flipX ? r.split('').reverse().join('') : r));
    return flipY ? out.reverse() : out;
  }

  /** Each ground sprite as drawn, mirrored in X, in Y and in both. */
  export const GROUND_VARIANTS: readonly (readonly SpriteRows[])[] = BIOME_SPRITES.map((rows) => [
    rows, mirrorRows(rows, true, false), mirrorRows(rows, false, true), mirrorRows(rows, true, true),
  ]);

  export const SNOW_VARIANTS: readonly SpriteRows[] = [
    SNOW_SPRITE, mirrorRows(SNOW_SPRITE, true, false), mirrorRows(SNOW_SPRITE, false, true), mirrorRows(SNOW_SPRITE, true, true),
  ];

  /* ------------------------------------------------------------------ surf -- */

  /**
   * Surf along the sides of a water tile that touch land, as a bitmask
   * W=1 E=2 N=4 S=8 — the same convention as the river tiles, and for the
   * same reason: generated, so neighbouring tiles join into one shoreline.
   * The outer line is the wet edge, the broken inner one the breaking wave.
   */
  function buildSurfSprite(mask: number): SpriteRows {
    const cells: string[] = new Array(64).fill('.');
    const inner = [false, true, false, false, true, true, false, false];
    const put = (x: number, y: number, ch: string): void => {
      if (cells[y * 8 + x] !== 'W') cells[y * 8 + x] = ch;
    };
    for (let k = 0; k < 8; k++) {
      if (mask & 1) { put(0, k, 'W'); if (inner[k]) put(1, k, 'C'); }
      if (mask & 2) { put(7, k, 'W'); if (inner[7 - k]) put(6, k, 'C'); }
      if (mask & 4) { put(k, 0, 'W'); if (inner[7 - k]) put(k, 1, 'C'); }
      if (mask & 8) { put(k, 7, 'W'); if (inner[k]) put(k, 6, 'C'); }
    }
    const rows: string[] = [];
    for (let y = 0; y < 8; y++) rows.push(cells.slice(y * 8, y * 8 + 8).join(''));
    return rows;
  }

  export const SURF_SPRITES: readonly SpriteRows[] = Array.from({ length: 16 }, (_, mask) => buildSurfSprite(mask));

  /** Which sides of a water tile border land, as a surf mask. */
  export function shoreMask(world: WorldState, x: number, y: number): number {
    const e = world.elevation;
    let m = 0;
    if (e[idx(wrapX(x - 1), y)] >= 0) m |= 1;
    if (e[idx(wrapX(x + 1), y)] >= 0) m |= 2;
    if (y > 0 && e[idx(x, y - 1)] >= 0) m |= 4;
    if (y < GRID_H - 1 && e[idx(x, y + 1)] >= 0) m |= 8;
    return m;
  }
}
