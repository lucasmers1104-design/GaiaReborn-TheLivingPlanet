/* =============================================================================
 * SimEarth 2.0 — terrain catalog: the contract between art, renderer and sim
 * -----------------------------------------------------------------------------
 * Every id here is fixed: the generator, the runtime manifest, the renderer
 * and the simulation's Landscape enum all refer to these strings. Asset
 * authors fill in recipes for the ids their family owns; they do not add,
 * rename or re-rank entries — propose changes instead (see the style guide,
 * docs/landschaft-2026-10/stil.md).
 *
 * Families (one recipe file each under tools/terrain/):
 *   cold · temperate · warm · wet · mountain (docs/hoehe-spec.md) · coast (beaches, reefs)
 * ========================================================================== */
'use strict';

/**
 * Ground materials, lowest rank first. Rank = position + 1; water is rank 0
 * and drawn by the renderer itself. A higher material draws its frayed edge
 * over a lower one (spec §5.1); within a material, denser draws over sparser.
 * `size` is the side of the seamless texture; a tile shows the 16×16 window
 * at its world position, (x mod size/16, y mod size/16).
 */
const MATERIALS = [
  { id: 'rock', name: 'Fels', family: 'cold', size: 64, densities: 1 },
  { id: 'basalt', name: 'Basalt', family: 'mountain', size: 64, densities: 1 },
  { id: 'scree', name: 'Schutt', family: 'mountain', size: 64, densities: 1 },
  { id: 'stony_desert', name: 'Felswüste', family: 'warm', size: 64, densities: 1 },
  { id: 'sand', name: 'Sand', family: 'warm', size: 128, densities: 1 },
  { id: 'barren', name: 'Rohboden', family: 'temperate', size: 64, densities: 1 },
  { id: 'mud', name: 'Schlamm', family: 'wet', size: 64, densities: 1 },
  { id: 'semidesert_rock', name: 'Halbwüste auf Fels', family: 'warm', size: 64, densities: 3 },
  { id: 'semidesert_sand', name: 'Halbwüste auf Sand', family: 'warm', size: 64, densities: 3 },
  { id: 'lichen_rock', name: 'Flechten & Moos auf Fels', family: 'cold', size: 64, densities: 3 },
  { id: 'tundra', name: 'Tundra', family: 'cold', size: 64, densities: 3 },
  { id: 'moss', name: 'Moosteppich', family: 'temperate', size: 64, densities: 3 },
  { id: 'fern', name: 'Farnflur', family: 'temperate', size: 64, densities: 3 },
  { id: 'steppe', name: 'Steppe', family: 'temperate', size: 128, densities: 3 },
  { id: 'savanna', name: 'Savanne', family: 'warm', size: 128, densities: 3 },
  { id: 'meadow', name: 'Wiese', family: 'temperate', size: 64, densities: 3 },
  { id: 'alpine_meadow', name: 'Alpine Matte', family: 'mountain', size: 64, densities: 3 },
  { id: 'marsh', name: 'Sumpf', family: 'wet', size: 64, densities: 3 },
  { id: 'shrub', name: 'Gebüsch', family: 'temperate', size: 64, densities: 3 },
  { id: 'swamp_forest', name: 'Sumpfwaldboden', family: 'wet', size: 64, densities: 2 },
  { id: 'taiga', name: 'Nadelwaldboden', family: 'cold', size: 64, densities: 2 },
  { id: 'forest', name: 'Waldboden', family: 'temperate', size: 64, densities: 2 },
  { id: 'rainforest', name: 'Regenwaldboden', family: 'warm', size: 64, densities: 2 },
  { id: 'rainforest_montane', name: 'Bergregenwaldboden', family: 'mountain', size: 64, densities: 2 },
  { id: 'sea_ice', name: 'Meereis', family: 'cold', size: 128, densities: 1 },
  { id: 'ice', name: 'Eis', family: 'cold', size: 128, densities: 1 },
  { id: 'snow', name: 'Gipfelschnee', family: 'cold', size: 64, densities: 1 },
];

/**
 * Overlays: drawn by the renderer over water, transparent where nothing is,
 * or along the shore. Not ranked and never masked. `colors`: more than the
 * overlay limit allows.
 */
const OVERLAYS = [
  { id: 'ripple_coast', name: 'Rippel Küstenmeer', family: 'wet', size: 128 },
  { id: 'ripple_ocean', name: 'Rippel Hochsee', family: 'wet', size: 128 },
  { id: 'algae_film', name: 'Algenfilm', family: 'wet', size: 64 },
  // Opaque: the strip of a beach along the shore (src/landshore.ts), no ground of its own.
  { id: 'beach_sand', name: 'Strandsand', family: 'coast', size: 64, colors: 9 },
];

/**
 * Landscapes, in the order of the simulation's `Landscape` enum
 * (src/landscape.ts). `materials` picks the ground per substrate
 * (rock · sand · soil · mire). `objects` is the expected number of objects
 * per tile by density step and kind; the renderer hands each slot to a plant
 * group present on the tile (see GROUPS) and drops it when none fits.
 * `abiotic` is the expected number of rocks or ice blocks per tile.
 */
const LANDSCAPES = [
  { id: 'ice', name: 'Eis', materials: m('ice'), abiotic: 0.04 },
  { id: 'snow', name: 'Gipfelschnee', materials: m('snow'), abiotic: 0.06 },
  // Bare ground still shows the first plants that settle on it, as small
  // cushions, until they have built a landscape of their own.
  { id: 'rock', name: 'Fels', materials: m('rock', { sand: 'sand', mire: 'mud' }), abiotic: 0.25, objects: { low: [0.6] } },
  { id: 'barren', name: 'Rohboden', materials: m('barren', { rock: 'rock', sand: 'sand', mire: 'mud' }), abiotic: 0.05, objects: { low: [0.6] } },
  { id: 'desert', name: 'Wüste', materials: m('stony_desert', { sand: 'sand', mire: 'mud' }), abiotic: 0.06, objects: { low: [0.6] } },
  {
    id: 'lichen', name: 'Flechten & Moos auf Fels', materials: m('lichen_rock'), abiotic: 0.12,
    objects: { low: [0.1, 0.2, 0.35] },
  },
  {
    id: 'moss', name: 'Moosteppich', materials: m('moss', { rock: 'lichen_rock' }),
    objects: { low: [0.2, 0.4, 0.6] },
  },
  {
    id: 'tundra', name: 'Tundra', materials: m('tundra', { rock: 'lichen_rock' }), abiotic: 0.08,
    objects: { bush: [0.05, 0.1, 0.15], low: [0.2, 0.35, 0.5] },
  },
  {
    id: 'fernland', name: 'Farnflur', materials: m('fern'),
    objects: { bush: [0.1, 0.2, 0.3], low: [0.5, 0.9, 1.3] },
  },
  {
    id: 'steppe', name: 'Steppe', materials: m('steppe'), abiotic: 0.02,
    objects: { bush: [0.02, 0.04, 0.06], low: [0.3, 0.5, 0.7] },
  },
  {
    id: 'meadow', name: 'Wiese', materials: m('meadow'),
    objects: { bush: [0.03, 0.05, 0.08], low: [0.3, 0.5, 0.7] },
  },
  {
    id: 'savanna', name: 'Savanne', materials: m('savanna'),
    objects: { tree: [0.08, 0.15, 0.22], bush: [0.05, 0.1, 0.15], low: [0.3, 0.5, 0.7] },
  },
  {
    id: 'semidesert', name: 'Halbwüste', materials: m('semidesert_rock', { sand: 'semidesert_sand' }), abiotic: 0.06,
    objects: { bush: [0.1, 0.18, 0.25], low: [0.1, 0.2, 0.3] },
  },
  {
    id: 'shrubland', name: 'Gebüsch', materials: m('shrub'),
    objects: { tree: [0.1, 0.15, 0.2], bush: [0.6, 1.0, 1.4], low: [0.2, 0.3, 0.3] },
  },
  {
    id: 'forest', name: 'Wald', materials: m('forest'),
    objects: { tree: [1.5, 2.6], bush: [0.2, 0.1], low: [0.3, 0.2] },
  },
  {
    id: 'taiga', name: 'Nadelwald', materials: m('taiga'),
    objects: { tree: [1.5, 2.6], low: [0.2, 0.1] },
  },
  {
    id: 'rainforest', name: 'Regenwald', materials: m('rainforest'),
    objects: { tree: [1.8, 3.0], low: [0.3, 0.2] },
  },
  {
    id: 'marsh', name: 'Sumpf', materials: m('marsh'),
    objects: { bush: [0, 0.05, 0.1], low: [0.5, 0.9, 1.3] },
  },
  {
    id: 'swampforest', name: 'Sumpfwald', materials: m('swamp_forest'),
    objects: { tree: [1.2, 2.2], low: [0.6, 0.4] },
  },
  {
    id: 'alpine', name: 'Alpine Matte', materials: m('alpine_meadow', { rock: 'lichen_rock', mire: 'marsh' }), abiotic: 0.1,
    objects: { bush: [0.02, 0.04, 0.06], low: [0.3, 0.5, 0.7] },
  },
  {
    id: 'cloudforest', name: 'Bergregenwald', materials: m('rainforest_montane'),
    objects: { tree: [1.8, 3.0], low: [0.3, 0.2] },
  },
];

/** The same material on every substrate, with exceptions. */
function m(all, except = {}) {
  return { rock: all, sand: all, soil: all, mire: all, ...except };
}

/**
 * Plant and rock objects. kind: tree (≤ 16×20, 3 sizes × 2 forms), bush and
 * low (≤ 16×16, 3 variants), rock (≤ 16×16), water (≤ 16×16, drawn in the
 * sea), cactus (≤ 16×20, 3 variants; no slot of its own: the renderer sets
 * one on some desert tiles once cacti exist, src/cacti.ts), reef (≤ 12×10,
 * patches under the lagoon's water, set by src/reefs.ts), cay (≤ 14×10, a
 * sand islet on a reef, drawn over the water). Anchored bottom
 * centre; a tree may reach 4 px into the tile above.
 * `group` is the flora id the object belongs to (null for rocks and ice).
 */
const OBJECTS = [
  // --- trees ---
  { id: 'lepidodendron', name: 'Schuppenbaum', group: 'clubmosses', kind: 'tree', family: 'wet' },
  { id: 'archaeopteris', name: 'Urbaum', group: 'firstTrees', kind: 'tree', family: 'temperate' },
  { id: 'cycad', name: 'Palmfarn', group: 'seedPlants', kind: 'tree', family: 'warm' },
  { id: 'spruce', name: 'Fichte', group: 'conifers', kind: 'tree', family: 'cold' },
  { id: 'swamp_cypress', name: 'Sumpfzypresse', group: 'conifers', kind: 'tree', family: 'wet' },
  { id: 'oak', name: 'Laubbaum', group: 'broadleaf', kind: 'tree', family: 'temperate' },
  { id: 'jungle_giant', name: 'Tropenriese', group: 'broadleaf', kind: 'tree', family: 'warm' },
  { id: 'acacia', name: 'Schirmbaum', group: 'broadleaf', kind: 'tree', family: 'warm' },
  // In no group's list: only the savanna-tree rule (src/savannatrees.ts) sets it, beside the Schirmbaum.
  { id: 'baobab', name: 'Affenbrotbaum', group: 'flowering', kind: 'tree', family: 'warm' },
  // In no group's list either: only the beach rule (src/reefs.ts) sets it on beach tiles.
  // Form 0 curves left, form 1 curves right.
  { id: 'coconut_palm', name: 'Kokospalme', group: 'flowering', kind: 'tree', family: 'coast' },
  // --- bushes ---
  { id: 'tree_fern', name: 'Baumfarn', group: 'ferns', kind: 'bush', family: 'warm' },
  { id: 'seed_fern', name: 'Samenfarn-Busch', group: 'seedPlants', kind: 'bush', family: 'temperate' },
  { id: 'juniper', name: 'Wacholder', group: 'conifers', kind: 'bush', family: 'cold' },
  { id: 'flower_bush', name: 'Blütenstrauch', group: 'flowering', kind: 'bush', family: 'temperate' },
  { id: 'shrub', name: 'Laubstrauch', group: 'broadleaf', kind: 'bush', family: 'temperate' },
  { id: 'thorn_bush', name: 'Dornbusch', group: 'broadleaf', kind: 'bush', family: 'warm' },
  // --- low plants ---
  { id: 'liverwort', name: 'Lebermoos-Polster', group: 'landPlants', kind: 'low', family: 'wet' },
  { id: 'moss_cushion', name: 'Moospolster', group: 'mosses', kind: 'low', family: 'cold' },
  { id: 'rhynia', name: 'Urfarn-Stängel', group: 'vascular', kind: 'low', family: 'temperate' },
  { id: 'fern_frond', name: 'Farnwedel', group: 'ferns', kind: 'low', family: 'temperate' },
  { id: 'horsetail', name: 'Schachtelhalm', group: 'ferns', kind: 'low', family: 'temperate' },
  { id: 'flowers', name: 'Blumen', group: 'flowering', kind: 'low', family: 'temperate' },
  { id: 'dwarf_shrub', name: 'Heide', group: 'flowering', kind: 'low', family: 'cold' },
  { id: 'grass_tuft', name: 'Grasbüschel', group: 'grasses', kind: 'low', family: 'temperate' },
  { id: 'tall_grass', name: 'Hochgras', group: 'grasses', kind: 'low', family: 'warm' },
  { id: 'reed', name: 'Schilf', group: 'grasses', kind: 'low', family: 'wet' },
  { id: 'sundew', name: 'Sonnentau', group: 'carnivorous', kind: 'low', family: 'wet' },
  // --- cacti: the flowering plants' desert form ---
  { id: 'cactus_column', name: 'Säulenkaktus', group: 'flowering', kind: 'cactus', family: 'warm' },
  { id: 'cactus_barrel', name: 'Kugelkaktus', group: 'flowering', kind: 'cactus', family: 'warm' },
  { id: 'cactus_opuntia', name: 'Feigenkaktus', group: 'flowering', kind: 'cactus', family: 'warm' },
  // --- water ---
  { id: 'kelp', name: 'Tang', group: 'marineAlgae', kind: 'water', family: 'wet' },
  // --- reefs: in no group's list, src/reefs.ts sets them ---
  // Variants run from small heads to large colonies (landcoast.ts picks by that order).
  { id: 'coral_rugose', name: 'Runzelkorallen', group: null, kind: 'reef', family: 'coast', variants: 12 },
  { id: 'coral_stony', name: 'Steinkorallen', group: null, kind: 'reef', family: 'coast', variants: 12 },
  { id: 'reef_sand', name: 'Riffsand', group: null, kind: 'reef', family: 'coast', variants: 4 },
  { id: 'reef_cay', name: 'Sandinsel', group: null, kind: 'cay', family: 'coast', variants: 3 },
  // --- rocks and ice ---
  { id: 'boulder', name: 'Felsbrocken', group: null, kind: 'rock', family: 'cold', variants: 3 },
  { id: 'scree', name: 'Geröll', group: null, kind: 'rock', family: 'cold', variants: 2 },
  { id: 'ice_block', name: 'Eisbrocken', group: null, kind: 'rock', family: 'cold', variants: 2 },
  // Mountain ranges and volcanic cones are no objects: the renderer lifts the
  // ground along their crests and around their craters (landridges.ts).
];

/** Tree size steps (bounding box) and forms per size. */
const TREE_SIZES = { s: [10, 13], m: [13, 17], l: [16, 20] };
const TREE_FORMS = 2;
/** Largest box per kind, [w, h]. */
const KIND_BOX = { tree: [16, 20], bush: [16, 16], low: [16, 16], water: [16, 16], rock: [16, 16], cactus: [16, 20], reef: [12, 10], cay: [14, 10] };

/**
 * Which object a plant group shows where. A slot of one kind goes to one of
 * the groups present that has an object of that kind for the landscape;
 * within that group an entry with a landscape list wins over a '*' entry,
 * and several matching entries share the slot by tile hash. '*' never
 * applies at sea. `swatch` is the texture the Examine window shows for a
 * group that lives in the ground rather than as an object (null: first
 * object). `sea` stands for coastal water tiles.
 */
const GROUPS = {
  marineAlgae: { name: 'Meeresalgen', objects: [{ id: 'kelp', where: ['sea'] }], swatch: null },
  freshwaterAlgae: { name: 'Süßwasser-Grünalgen', objects: [], swatch: { material: 'algae_film', density: 0 } },
  landPlants: { name: 'Erste Landpflanzen', objects: [{ id: 'liverwort', where: '*' }], swatch: null },
  mosses: { name: 'Moose', objects: [{ id: 'moss_cushion', where: '*' }], swatch: { material: 'moss', density: 2 } },
  vascular: { name: 'Frühe Gefäßpflanzen', objects: [{ id: 'rhynia', where: '*' }], swatch: null },
  clubmosses: { name: 'Bärlapppflanzen', objects: [{ id: 'lepidodendron', where: '*' }], swatch: null },
  ferns: {
    name: 'Farne & Schachtelhalme',
    objects: [
      { id: 'tree_fern', where: ['rainforest', 'cloudforest', 'forest', 'swampforest', 'fernland'] },
      { id: 'horsetail', where: ['marsh', 'swampforest', 'fernland'] },
      { id: 'fern_frond', where: '*' },
    ],
    swatch: null,
  },
  firstTrees: { name: 'Urbäume', objects: [{ id: 'archaeopteris', where: '*' }], swatch: null },
  seedPlants: {
    name: 'Samenpflanzen',
    objects: [
      // Not in the rainforest: there the flowering trees close the canopy.
      { id: 'cycad', where: ['savanna', 'forest', 'semidesert', 'shrubland'] },
      { id: 'seed_fern', where: '*' },
    ],
    swatch: null,
  },
  conifers: {
    name: 'Nadelbäume',
    objects: [
      { id: 'swamp_cypress', where: ['marsh', 'swampforest'] },
      { id: 'juniper', where: ['tundra', 'alpine', 'shrubland', 'semidesert', 'steppe', 'lichen'] },
      // No spruce in the tropics or the desert, whatever else grows there.
      { id: 'spruce', where: ['taiga', 'forest', 'shrubland', 'meadow', 'steppe', 'fernland', 'moss', 'tundra', 'rock', 'barren'] },
    ],
    swatch: null,
  },
  flowering: {
    name: 'Blütenpflanzen',
    objects: [
      { id: 'cactus_column', where: ['semidesert', 'desert'] },
      { id: 'cactus_barrel', where: ['semidesert', 'desert'] },
      { id: 'cactus_opuntia', where: ['semidesert', 'desert'] },
      { id: 'dwarf_shrub', where: ['tundra', 'alpine', 'lichen', 'moss'] },
      { id: 'flower_bush', where: ['shrubland', 'forest', 'meadow'] },
      { id: 'flowers', where: '*' },
    ],
    swatch: null,
  },
  broadleaf: {
    name: 'Laubbäume',
    objects: [
      { id: 'jungle_giant', where: ['rainforest', 'cloudforest'] },
      { id: 'acacia', where: ['savanna', 'semidesert'] },
      { id: 'thorn_bush', where: ['semidesert', 'steppe', 'savanna'] },
      { id: 'shrub', where: ['shrubland', 'meadow', 'forest'] },
      { id: 'oak', where: '*' },
    ],
    swatch: null,
  },
  grasses: {
    name: 'Gräser',
    objects: [
      { id: 'reed', where: ['marsh', 'swampforest'] },
      { id: 'tall_grass', where: ['savanna'] },
      { id: 'grass_tuft', where: '*' },
    ],
    swatch: { material: 'steppe', density: 2 },
  },
  carnivorous: { name: 'Fleischfressende Pflanzen', objects: [{ id: 'sundew', where: '*' }], swatch: null },
};

/** Rocks and ice blocks: where they lie. */
const ABIOTIC = [
  { id: 'boulder', where: ['rock', 'lichen', 'tundra', 'alpine', 'semidesert', 'desert', 'steppe', 'barren'] },
  { id: 'scree', where: ['rock', 'snow', 'alpine'] },
  { id: 'ice_block', where: ['ice'] },
];

/** Edge masks: 16 marching-squares cases (corner bits TL=1 TR=2 BL=4 BR=8) × variants. */
const MASKS = { cases: 16, variants: 3 };

const FAMILIES = ['cold', 'temperate', 'warm', 'wet', 'mountain', 'coast'];

module.exports = {
  MATERIALS, OVERLAYS, LANDSCAPES, OBJECTS, TREE_SIZES, TREE_FORMS, KIND_BOX,
  GROUPS, ABIOTIC, MASKS, FAMILIES,
};
