/* =============================================================================
 * SimEarth 2.0 — species art registry
 * -----------------------------------------------------------------------------
 * The data behind every creature and plant icon: on the map, in the Examine
 * window and in the tree. Each animal class runs through eight sub-species,
 * oldest first, each with its name, its first appearance and its icon. Each
 * plant group has a sparse and a dense icon.
 *
 * Biome specialists (a polar bear on a large ice sheet, a cactus in the
 * desert) are graphics only: the map shows them in fitting country, and no
 * window ever names them as a sub-species.
 *
 * Icons are flat SVG path data in a 32x32 box, facing right, coloured from one
 * shared palette. The renderer (artdraw.ts) gives every icon the same outline
 * and shadow, which is what keeps art from many hands reading as one set.
 * Pure data: the simulation and the tests load this file in Node.
 * ========================================================================== */

namespace SE {
  /**
   * The only colours an icon may use. Natural, slightly muted tones taken from
   * the map's sprite palette and the UI badges, so creatures sit on the pixel
   * ground without shouting over it.
   */
  export const ART_PALETTE = {
    ink: '#101816',
    // fur, hide and bone
    fur: '#a8703f',
    furLight: '#d6a874',
    furDark: '#6a452a',
    tan: '#cc9c64',
    cream: '#f2e6c8',
    white: '#f2f6f0',
    grey: '#a29d90',
    greyDark: '#66655f',
    black: '#2b302e',
    bone: '#e2d6b8',
    // scales and skin
    scale: '#96b446',
    scaleDark: '#5e7a32',
    olive: '#68843e',
    frog: '#6ebe5a',
    sand: '#d8bc7c',
    // bright accents
    yellow: '#f2cc5c',
    gold: '#f8b830',
    orange: '#ec802c',
    rust: '#ac4032',
    red: '#d2304c',
    coral: '#ec705c',
    pink: '#ec98d6',
    violet: '#aa6edc',
    // water creatures
    mint: '#78deca',
    teal: '#2c9696',
    cyan: '#92dae4',
    sky: '#6eb8e6',
    fish: '#5aaae6',
    blue: '#3c82c8',
    navy: '#26486e',
    shell: '#c8648c',
    chitin: '#d28c3c',
    // plants
    leaf: '#40883c',
    leafLight: '#8ecc62',
    jungle: '#34964a',
    forest: '#1e542a',
    spruce: '#1c6e50',
    moss: '#b0ce46',
    clubmoss: '#56b096',
    straw: '#dace78',
    bark: '#644226',
    kelp: '#8a6a34',
    blossom: '#f6aac8',
  } as const;

  export type PaletteKey = keyof typeof ART_PALETTE;

  /** A filled shape; `o` is its opacity. */
  export interface ArtFill {
    readonly f: PaletteKey;
    readonly d: string;
    readonly o?: number;
  }
  /** A stroked line of width `w` art units, with round caps and joins. */
  export interface ArtStroke {
    readonly s: PaletteKey;
    readonly w: number;
    readonly d: string;
    readonly o?: number;
  }
  export type ArtShape = ArtFill | ArtStroke;
  /** One icon: shapes painted in order, in a 32x32 box, facing right. */
  export type Art = readonly ArtShape[];

  export interface StageArt {
    /** German group name, shown as "Unterart n von 8". */
    readonly name: string;
    /** First appearance, million years ago. Drives when the stage can appear. */
    readonly ma: number;
    readonly art: Art;
    /** Builds reefs in warm shallow sea; the map draws them (src/reefs.ts). */
    readonly reefBuilder?: 'rugose' | 'stony';
    /** Grazes reefs and grinds their lime to sand; once it has evolved, its whole class does (src/reefs.ts). */
    readonly reefGrazer?: true;
  }

  export interface Specialist {
    /** For the source and the tests only — never shown in the game. */
    readonly name: string;
    readonly biome: Biome;
    /** The class must stand at least at this stage before it appears. */
    readonly minStage: number;
    readonly art: Art;
  }

  export interface SpeciesArt {
    readonly stages: readonly StageArt[];
    readonly specialists: readonly Specialist[];
  }

  export interface FloraSpecialist {
    /** For the source and the tests only — never shown in the game. */
    readonly name: string;
    readonly biome: Biome;
    readonly art: Art;
  }

  export interface FloraArt {
    readonly sparse: Art;
    readonly dense: Art;
    readonly specialists: readonly FloraSpecialist[];
  }

  /** Path data for an ellipse, in absolute commands. */
  export function artEllipse(cx: number, cy: number, rx: number, ry: number): string {
    return `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
  }

  /** Path data for a circle, in absolute commands. */
  export function artCircle(cx: number, cy: number, r: number): string {
    return artEllipse(cx, cy, r, r);
  }

  /** Filled in by one file per class in src/species/. */
  export const SPECIES: Partial<Record<Life, SpeciesArt>> = {};
  /** Filled in by one file per group in src/floraart/. */
  export const FLORA_ART: Partial<Record<Flora, FloraArt>> = {};

  export function subspeciesName(c: Life, stage: number): string {
    return SPECIES[c]?.stages[stage]?.name ?? '—';
  }

  /** First appearance of a sub-species, million years ago; 0 if unknown. */
  export function subspeciesMa(c: Life, stage: number): number {
    return SPECIES[c]?.stages[stage]?.ma ?? 0;
  }
}
