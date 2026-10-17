/* =============================================================================
 * SimEarth 2.0 — the terrain catalog as lookup tables
 * -----------------------------------------------------------------------------
 * What the manifest says per landscape, flattened once into arrays the
 * compositor reads per tile: the ground key of every landscape × substrate ×
 * density, which object each plant group shows in each landscape, how many
 * objects of each kind a tile expects, and where rocks lie (spec §4.5, §5.5).
 *
 * Ground keys sort the dual grid: water is 0, then material rank × 4 plus the
 * density step, so a higher material — and a denser cover of the same one —
 * draws its frayed edge over a lower one.
 * ========================================================================== */

namespace SE {
  export const LAND_KIND_TREE = 0;
  export const LAND_KIND_BUSH = 1;
  export const LAND_KIND_LOW = 2;
  export const LAND_KIND_WATER = 3;
  const KIND_IDS = ['tree', 'bush', 'low', 'water'];
  const KINDS = KIND_IDS.length;

  /** Scene index of coastal water (kelp); land scenes are the Landscape values. */
  export const LAND_SCENE_SEA = LANDSCAPE_COUNT;
  /** A tile that shows no objects at all: open sea, a city or a river. */
  export const LAND_SCENE_NONE = 255;
  /** Expected kelp per coastal tile by algae density step. */
  const KELP_COUNTS = [0.04, 0.1, 0.18];

  export function landKey(rank: number, density: number): number {
    return rank * 4 + density + 1;
  }
  export function landKeyRank(key: number): number {
    return (key - 1) >> 2;
  }
  export function landKeyDensity(key: number): number {
    return (key - 1) & 3;
  }

  export class LandTables {
    private static instance: LandTables | null = null;
    static shared(): LandTables {
      return LandTables.instance ?? (LandTables.instance = new LandTables(TERRAIN_MANIFEST));
    }

    /** Ground key by (landscape * 4 + substrate) * 4 + density. */
    readonly keys = new Uint8Array(LANDSCAPE_COUNT * 16);
    /** Density steps the ground of a landscape × substrate distinguishes. */
    readonly steps = new Uint8Array(LANDSCAPE_COUNT * 4);
    readonly seaIceKey: number;
    /** Object ids a group shows in a scene, by kind: [(scene * FLORA_COUNT + group) * KINDS + kind]. */
    readonly choice: (readonly string[])[] = [];
    /** 1 where that list names the scene (rather than coming from '*'). */
    readonly specific: number[] = [];
    /** Expected objects per tile: [scene][kind] → per density step, or null. */
    readonly counts: (readonly (readonly number[] | null)[])[] = [];
    /** Plant groups with an object in a scene. */
    readonly showable = new Uint16Array(LANDSCAPE_COUNT + 1);
    /** Rocks and ice blocks: expected per tile, and which. */
    readonly abioticRate: number[] = [];
    readonly abioticIds: string[][] = [];
    /** The cacti: no slot of their own, landobjects.ts sets one on some desert tiles. */
    readonly cactusIds: readonly string[];

    private constructor(private readonly manifest: TerrainManifest) {
      const m = manifest;
      LANDSCAPE_IDS.forEach((id, ls) => {
        const land = m.landscapes[id];
        SUBSTRATE_IDS.forEach((sub, s) => {
          const mat = m.materials[land.materials[sub]];
          this.steps[ls * 4 + s] = mat.densities.length;
          for (let d = 0; d < 4; d++) this.keys[(ls * 4 + s) * 4 + d] = landKey(mat.rank, Math.min(d, mat.densities.length - 1));
        });
        const o = land.objects;
        this.counts.push([o.tree ?? null, o.bush ?? null, o.low ?? null, null]);
        this.abioticRate.push(land.abiotic);
        this.abioticIds.push(m.abiotic.filter((a) => a.where.includes(id)).map((a) => a.id));
      });
      this.counts.push([null, null, null, KELP_COUNTS]);
      this.abioticRate.push(0);
      this.abioticIds.push([]);
      this.seaIceKey = landKey(m.materials.sea_ice.rank, 0);
      this.cactusIds = Object.keys(m.objects).filter((id) => m.objects[id].kind === 'cactus');

      const scenes = [...LANDSCAPE_IDS, 'sea'];
      scenes.forEach((scene, s) => {
        for (let g = 0; g < FLORA_COUNT; g++) {
          const group = g === 0 ? undefined : m.groups[FLORA[g as Flora].id];
          for (let k = 0; k < KINDS; k++) {
            const [list, specific] = group ? LandTables.resolve(m, group, scene, KIND_IDS[k]) : [[], false];
            this.choice.push(list);
            this.specific.push(specific ? 1 : 0);
            if (list.length > 0 && this.counts[s][k]) this.showable[s] |= 1 << g;
          }
        }
      });
    }

    /**
     * The objects of one kind a group shows in a scene: its entries naming the
     * scene, else its '*' entries. Resolved per group, so one group's
     * specialist never pushes another group off the tile.
     */
    private static resolve(m: TerrainManifest, group: TerrainGroup, scene: string, kind: string): [string[], boolean] {
      const specific: string[] = [];
      const fallback: string[] = [];
      for (const o of group.objects) {
        if (m.objects[o.id]?.kind !== kind) continue;
        if (o.where === '*') { if (scene !== 'sea') fallback.push(o.id); } else if (o.where.includes(scene)) specific.push(o.id);
      }
      return specific.length > 0 ? [specific, true] : [fallback, false];
    }

    choices(scene: number, group: number, kind: number): readonly string[] {
      return this.choice[(scene * FLORA_COUNT + group) * KINDS + kind];
    }

    /** Whether a group's objects of a kind are drawn for this scene in particular. */
    isSpecific(scene: number, group: number, kind: number): boolean {
      return this.specific[(scene * FLORA_COUNT + group) * KINDS + kind] === 1;
    }

    groundKey(ls: number, substrate: number, density: number): number {
      return this.keys[(ls * 4 + substrate) * 4 + Math.min(3, density)];
    }

    /** Ground key of a material no landscape owns, such as basalt or scree under a scar; 0 if unknown. */
    materialKey(id: string, density = 0): number {
      const mat = this.manifest.materials[id];
      return mat ? landKey(mat.rank, Math.min(density, mat.densities.length - 1)) : 0;
    }
  }
}
