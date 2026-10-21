/* =============================================================================
 * SimEarth 2.0 — the objects scars leave on the map
 * -----------------------------------------------------------------------------
 * Charred trunks on burnt ground, driftwood in the mud, fallen trees,
 * ruins, fissures and crater rims (docs/ereignisse-spec.md §4). They are
 * effect sprites placed per tile by hash — the same every frame — and sorted
 * with the map's objects like any standing effect. They can outlast the
 * scar's ground: the stumps stay in the grass until shrubs grow over them.
 * A sprite that is not drawn yet is simply left out.
 * ========================================================================== */

namespace SE {
  interface ScarObjects {
    readonly id: string;
    /** Expected sprites per tile; the fraction is placed by hash. */
    readonly count: number;
    /** Landscape succession level at which they are gone. */
    readonly untilLevel: number;
    /** Least succession level the tile had before (trunks and stumps only where trees stood). */
    readonly fromLevel: number;
  }

  /** Scattered objects by ScarKind. */
  const SCATTERED: Partial<Record<ScarKind, ScarObjects>> = {
    [ScarKind.Burnt]: { id: 'charred_trunk', count: 2.2, untilLevel: 3, fromLevel: 3 },
    [ScarKind.Scorched]: { id: 'stump', count: 1.4, untilLevel: 2, fromLevel: 3 },
    [ScarKind.Mud]: { id: 'driftwood', count: 1.3, untilLevel: 2, fromLevel: 0 },
    [ScarKind.Windthrow]: { id: 'fallen_tree', count: 1.6, untilLevel: 9, fromLevel: 0 },
  };

  /** Fissure scars in the order of their sprite's frames: −, |, /, \. */
  const FISSURES = [ScarKind.FissureH, ScarKind.FissureV, ScarKind.FissureD1, ScarKind.FissureD2];
  /** Pieces of each direction in the fissure sprite (tools/fx/earth.js), and the share of middles that branch. */
  const FISSURE_MIDDLE = 0;
  const FISSURE_END = 1;
  const FISSURE_BRANCHED = 2;
  const FISSURE_BRANCH_SHARE = 1 / 3;

  /**
   * The fissure piece on tile (x, y), or null for no fissure: a middle (about
   * every third one branched, by hash) where the line goes on to both sides,
   * else the end piece. The end piece is a lens that tapers to both sides;
   * it is laid centred on the tile edge towards the rest of the line (dx, dy
   * in art pixels), so its outer half is the tip and its inner half covers
   * the neighbour's middle pixel for pixel: one frame serves both ends,
   * without mirroring. Alone on its tile it lies on the centre. Tiles in
   * `hidden` (still opening) count as no fissure, so an opening fissure ends
   * in a tip.
   */
  export function fxFissurePiece(world: WorldState, x: number, y: number, hidden: ReadonlySet<number> | null = null): { piece: number; dx: number; dy: number } | null {
    const i = idx(wrapX(x), y);
    const scar = world.hazards.scar[i];
    const dir = FISSURES.indexOf(scar as ScarKind);
    if (dir < 0) return null;
    const sx = QUAKE_DIR_X[dir];
    const sy = QUAKE_DIR_Y[dir];
    const joins = (k: number): boolean => {
      const ny = y + k * sy;
      if (ny < 0 || ny >= GRID_H) return false;
      const j = idx(wrapX(x + k * sx), ny);
      return world.hazards.scar[j] === scar && !hidden?.has(j);
    };
    const back = joins(-1);
    const ahead = joins(1);
    if (back && ahead) return { piece: hazardRoll(world.seed, i, 0x46) < FISSURE_BRANCH_SHARE ? FISSURE_BRANCHED : FISSURE_MIDDLE, dx: 0, dy: 0 };
    if (!back && !ahead) return { piece: FISSURE_END, dx: 0, dy: 0 };
    const k = ahead ? 8 : -8;
    return { piece: FISSURE_END, dx: k * sx, dy: k * sy };
  }
  /** Ticks after which a crater rim shows weathered. */
  const RIM_WEATHERED = 120;

  function isCrater(world: WorldState, x: number, y: number): boolean {
    return y >= 0 && y < GRID_H && world.hazards.scar[idx(wrapX(x), y)] === ScarKind.Crater;
  }

  /** Crater tile (x, y): 1 as the upper left of a 2 × 2 block of crater, 2 inside such a block elsewhere, 0 alone. */
  function craterBlockAt(world: WorldState, x: number, y: number): 0 | 1 | 2 {
    const corner = (cx: number, cy: number): boolean =>
      isCrater(world, cx, cy) && isCrater(world, cx + 1, cy) && isCrater(world, cx, cy + 1) && isCrater(world, cx + 1, cy + 1);
    if (corner(x, y)) return 1;
    return corner(x - 1, y) || corner(x, y - 1) || corner(x - 1, y - 1) ? 2 : 0;
  }

  /** Add the objects of every scar in view to the scene. */
  export function fxScarObjects(s: FxScene, world: WorldState): void {
    const hz = world.hazards;
    for (let y = s.y0; y <= s.y1; y++) {
      for (let xx = s.x0; xx <= s.x1; xx++) {
        const x = wrapX(xx);
        const i = y * GRID_W + x;
        const kind = hz.scar[i] as ScarKind;
        if (kind === ScarKind.None || kind === ScarKind.Vent || kind === ScarKind.Basalt || s.hidden.has(i)) continue;
        const fx = xx * 16 + 8;
        const fy = y * 16 + 15;
        const f = FISSURES.indexOf(kind);
        if (f >= 0) {
          const p = fxFissurePiece(world, x, y, s.hidden);
          // A flat decal: its foot is its top row, so what stands on the tiles it covers sorts in front of it.
          const cy = y * 16 + 8 + (p?.dy ?? 0);
          if (p) s.decal({ id: 'fissure', frame: f * 3 + p.piece, x: fx + p.dx, y: cy, foot: cy - 8 });
          continue;
        }
        if (kind === ScarKind.Crater) {
          // A 2 × 2 block of crater (the comet's) is one crater with one large rim, drawn from its upper left tile.
          const block = craterBlockAt(world, x, y);
          if (block === 0) s.add({ id: 'crater_rim', frame: hz.scarAge[i] < RIM_WEATHERED ? 0 : 1, x: fx, y: fy, foot: fy });
          else if (block === 1) s.add({ id: 'crater_rim_large', frame: hz.scarAge[i] < RIM_WEATHERED ? 0 : 1, x: fx + 8, y: fy + 16, foot: fy + 16 });
          continue;
        }
        if (kind === ScarKind.Ruins) {
          if (LANDSCAPE_LEVEL[world.landscape[i]] < 3 && world.tech[i] === Tech.None) s.add({ id: 'ruin', frame: Math.floor(hazardRoll(world.seed, i, 3) * 3), x: fx, y: fy, foot: fy });
          continue;
        }
        const o = SCATTERED[kind];
        if (!o || LANDSCAPE_LEVEL[world.landscape[i]] >= o.untilLevel || hz.scarFrom[i] < o.fromLevel) continue;
        const frames = FX_MANIFEST.sprites[o.id]?.frames.length ?? 0;
        if (frames === 0) continue;
        const n = Math.floor(o.count + hazardRoll(world.seed, i, kind));
        for (let k = 0; k < n; k++) {
          const px = xx * 16 + 3 + Math.floor(hazardRoll(i, k, 11) * 10);
          const py = y * 16 + 5 + Math.floor(hazardRoll(i, k, 12) * 10);
          s.add({ id: o.id, frame: Math.floor(hazardRoll(i, k, 13) * frames), x: px, y: py, foot: py });
        }
      }
    }
  }
}
