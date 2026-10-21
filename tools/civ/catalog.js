/* =============================================================================
 * SimEarth 2.0 — the city art contract
 * -----------------------------------------------------------------------------
 * Ids, roles and boxes of every city building block, the eras they belong to
 * and the 8 tribe colours. The recipes (tools/civ/<era>.js) draw what is
 * listed here; src/citylayout.ts places blocks by role and reads their sizes
 * from the manifest the generator writes (src/civatlas.ts).
 * Spec: docs/zivilisation-spec.md §3.
 * ========================================================================== */
'use strict';

/** Era ids in the order of the simulation's Tech enum, from Tech.Stone (1) on. */
const ERAS = ['stone', 'bronze', 'iron', 'industrial', 'atomic', 'information', 'nanotech'];

/**
 * The box a city's picture stays in: its tile, 2 px into the tiles left and
 * right and up to 8 px into the tile above, so tall houses and towers may
 * rise over the neighbours. Feet and ground footprints stay on the tile.
 */
const BOX = { w: 20, h: 24 };
/** Colours a block may use, shading included. */
const MAX_COLORS = 9;

/**
 * The tribe colours, one table for both looks: `pixel` is the terrain
 * palette entry of the pixel banner, `art` the ART_PALETTE key of the SVG
 * banner on settlers and markers. Each SVG colour must be nearer to its own
 * pixel colour than to any other (tests/civart.test.js).
 */
const TRIBE_COLORS = [
  { id: 'red', name: 'Rot', pixel: 'red1', art: 'red' },
  { id: 'blue', name: 'Blau', pixel: 'water3', art: 'blue' },
  { id: 'yellow', name: 'Gelb', pixel: 'yellow0', art: 'yellow' },
  { id: 'white', name: 'Weiß', pixel: 'white0', art: 'white' },
  { id: 'violet', name: 'Violett', pixel: 'violet0', art: 'violet' },
  { id: 'orange', name: 'Orange', pixel: 'orange0', art: 'orange' },
  { id: 'green', name: 'Grün', pixel: 'meadow3', art: 'leafLight' },
  { id: 'pink', name: 'Rosa', pixel: 'blossom0', art: 'pink' },
];

/**
 * Roles, as the layout uses them:
 *   dwelling  houses in sizes s, m, l (the bulk of every city)
 *   hall      a large communal building (town and up)
 *   landmark  one per metropolis
 *   yard      small things between the houses (standing stone, well, chimney)
 *   wall      the enclosure of the walled eras: a straight piece (0), a
 *             piece running into the picture (1) and a long piece (2); a
 *             metropolis is ringed by 0 and 1, a town has one 2
 *   bridge    across the river, horizontal (0) and vertical (1); an era
 *             without its own keeps the latest one before it
 *   ground    the worn yard under the city, one per size stage
 *   fire      a fire place: stones and embers, static; the map draws the
 *             flickering flame (role flame) over its foot, one row up
 *   flame     frames of the flame, drawn per frame by the map (src/cityfire.ts),
 *             never placed by the layout; frame 0 is the still flame
 *   smoke     frames of the exhaust over a chimney, drawn per frame like the
 *             flame; frame 0 is the still puff. A recipe marks the openings
 *             of its chimneys by setting `tex.smoke = [x, y, …]` (pixels of
 *             the sprite, the topmost pixel of the opening); the manifest
 *             carries them per sprite and the map puts the smoke frame's foot
 *             one row above each
 *   shelter   a wandering group's camp: lean-to, hide tent, brush hut
 *   banner    the tribe's pennant, one variant per tribe colour (all eras)
 * Blocks of no era (era null) are shared: their recipes are in camp.js
 * (shelter, campfire), fire.js (flame), smoke.js (smoke) and banner.js.
 * `depth`: rows of the block's ground footprint, which must keep clear of
 * rivers and of other footprints.
 */
const BLOCKS = [
  // Steinzeit
  { id: 'hut_straw', era: 'stone', role: 'dwelling', name: 'Rundhütte (Stroh)', sizes: ['s', 'm', 'l'], depth: 1 },
  { id: 'hut_hide', era: 'stone', role: 'dwelling', name: 'Rundhütte (Fell)', sizes: ['s', 'm', 'l'], depth: 1 },
  { id: 'longhouse', era: 'stone', role: 'hall', name: 'Langhaus', variants: 2, depth: 2 },
  { id: 'megalith', era: 'stone', role: 'landmark', name: 'Steinsetzung', variants: 2, depth: 2 },
  { id: 'firepit', era: 'stone', role: 'fire', name: 'Feuerstelle', variants: 2, depth: 2 },
  { id: 'hearth', era: 'stone', role: 'fire', name: 'Herdfeuer im Palisadenring', variants: 1, depth: 1 },
  { id: 'menhir', era: 'stone', role: 'yard', name: 'Menhir', variants: 2, depth: 1 },
  { id: 'palisade', era: 'stone', role: 'wall', name: 'Palisade', variants: 3, depth: 1 },
  { id: 'yard_stone', era: 'stone', role: 'ground', name: 'Festgetretene Erde', variants: 3, depth: 0 },
  // Bronzezeit
  { id: 'mudbrick', era: 'bronze', role: 'dwelling', name: 'Lehmziegelhaus und Hofhaus', sizes: ['s', 'm', 'l'], depth: 1 },
  { id: 'granary', era: 'bronze', role: 'hall', name: 'Speicher', variants: 1, depth: 2 },
  { id: 'ziggurat', era: 'bronze', role: 'landmark', name: 'Stufentempel', variants: 1, depth: 2 },
  { id: 'well', era: 'bronze', role: 'yard', name: 'Brunnen und Krüge', variants: 2, depth: 1 },
  { id: 'silo', era: 'bronze', role: 'yard', name: 'Kornsilo', variants: 2, depth: 1 },
  { id: 'mudwall', era: 'bronze', role: 'wall', name: 'Lehmmauer', variants: 3, depth: 1 },
  { id: 'bridge_wood', era: 'bronze', role: 'bridge', name: 'Holzbrücke', variants: 2, depth: 2 },
  { id: 'yard_bronze', era: 'bronze', role: 'ground', name: 'Gestampfter Lehm', variants: 3, depth: 0 },
  // Eisenzeit
  { id: 'timberhouse', era: 'iron', role: 'dwelling', name: 'Fachwerkhaus', sizes: ['s', 'm', 'l'], depth: 1 },
  { id: 'stonehouse', era: 'iron', role: 'dwelling', name: 'Steinhaus mit Ziegeldach', sizes: ['s', 'm', 'l'], depth: 1 },
  { id: 'keep', era: 'iron', role: 'hall', name: 'Turm', variants: 1, depth: 2 },
  { id: 'temple', era: 'iron', role: 'landmark', name: 'Säulentempel', variants: 1, depth: 2 },
  { id: 'market', era: 'iron', role: 'yard', name: 'Marktstand und Brunnen', variants: 2, depth: 1 },
  { id: 'stonewall', era: 'iron', role: 'wall', name: 'Steinmauer', variants: 3, depth: 1 },
  { id: 'bridge_stone', era: 'iron', role: 'bridge', name: 'Steinbrücke', variants: 2, depth: 2 },
  { id: 'yard_iron', era: 'iron', role: 'ground', name: 'Kopfsteinpflaster', variants: 3, depth: 0 },
  // Industrie
  { id: 'terrace', era: 'industrial', role: 'dwelling', name: 'Ziegelreihenhaus', sizes: ['s', 'm', 'l'], depth: 1 },
  { id: 'factory', era: 'industrial', role: 'hall', name: 'Fabrikhalle', variants: 1, depth: 2 },
  { id: 'station', era: 'industrial', role: 'landmark', name: 'Bahnhofshalle', variants: 1, depth: 2 },
  { id: 'chimney', era: 'industrial', role: 'yard', name: 'Schlot', variants: 2, depth: 1 },
  { id: 'bridge_steel', era: 'industrial', role: 'bridge', name: 'Stahlbrücke', variants: 2, depth: 2 },
  { id: 'yard_industrial', era: 'industrial', role: 'ground', name: 'Pflaster', variants: 3, depth: 0 },
  // Atomzeitalter
  { id: 'concrete', era: 'atomic', role: 'dwelling', name: 'Betonblock und Wohnhochhaus', sizes: ['s', 'm', 'l'], depth: 1 },
  { id: 'slab', era: 'atomic', role: 'hall', name: 'Betonhalle', variants: 1, depth: 2 },
  { id: 'cooling_tower', era: 'atomic', role: 'landmark', name: 'Kühlturm', variants: 1, depth: 2 },
  { id: 'water_tower', era: 'atomic', role: 'yard', name: 'Wasserturm und Mast', variants: 2, depth: 1 },
  { id: 'yard_atomic', era: 'atomic', role: 'ground', name: 'Asphalt', variants: 3, depth: 0 },
  // Informationszeitalter
  { id: 'glass', era: 'information', role: 'dwelling', name: 'Glaspavillon und schlanker Glasturm', sizes: ['s', 'm', 'l'], depth: 1 },
  { id: 'pavilion', era: 'information', role: 'hall', name: 'Pavillon', variants: 1, depth: 2 },
  { id: 'radio_tower', era: 'information', role: 'landmark', name: 'Funkturm', variants: 1, depth: 1 },
  { id: 'turbine', era: 'information', role: 'yard', name: 'Windrad und Solarfeld', variants: 2, depth: 1 },
  { id: 'yard_information', era: 'information', role: 'ground', name: 'Platz mit Grünstreifen', variants: 3, depth: 0 },
  // Nanotech
  { id: 'biotower', era: 'nanotech', role: 'dwelling', name: 'Kuppelhaus und organischer Turm', sizes: ['s', 'm', 'l'], depth: 1 },
  { id: 'biodome', era: 'nanotech', role: 'hall', name: 'Kuppel mit Grün', variants: 1, depth: 2 },
  { id: 'megatower', era: 'nanotech', role: 'landmark', name: 'Megaturm', variants: 1, depth: 1 },
  { id: 'garden', era: 'nanotech', role: 'yard', name: 'Parkbaum und Pflanzkübel', variants: 2, depth: 1 },
  { id: 'yard_nanotech', era: 'nanotech', role: 'ground', name: 'Park', variants: 3, depth: 0 },
  // Wanderlager und Feuer (alle Zeitalter)
  { id: 'shelter', era: null, role: 'shelter', name: 'Unterstand (Windschirm, Fellzelt, Laubhütte)', variants: 4, depth: 1 },
  { id: 'campfire', era: null, role: 'fire', name: 'Lagerfeuerstelle', variants: 1, depth: 1 },
  { id: 'flame', era: null, role: 'flame', name: 'Flamme (Animation)', variants: 4, depth: 0 },
  { id: 'smoke', era: null, role: 'smoke', name: 'Abgasrauch (Animation)', variants: 6, depth: 0 },
  // alle Zeitalter
  { id: 'banner', era: null, role: 'banner', name: 'Wimpel', variants: TRIBE_COLORS.length, depth: 1 },
];

/** Box limits per size of a dwelling (w × h): later eras build higher; only towers need the large box. */
const SIZE_BOX = { s: [10, 12], m: [12, 16], l: [16, 22] };

/**
 * The drop shadow the map draws under each block: a flat ellipse below the
 * footprint, `width` × its width, one column right of its centre, rows
 * foot − 1 … foot + 1. Cities are a layer of their own over the finished
 * terrain, so the shadow cannot move ground indices along their ramp as the
 * trees' does; this dark at `alpha` comes close to that −2 step on the
 * common grounds (meadow, steppe, forest soil, savanna).
 */
const SHADOW = { rgb: [20, 22, 38], alpha: 0.5, width: 0.5, ry: 1.5 };

module.exports = { ERAS, BOX, MAX_COLORS, TRIBE_COLORS, BLOCKS, SIZE_BOX, SHADOW };
