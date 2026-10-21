/* =============================================================================
 * SimEarth 2.0 — the effect art contract
 * -----------------------------------------------------------------------------
 * Ids, boxes, frames and anchors of every disaster effect: sprites the effect
 * layer draws over the map, and seamless animated ground textures it lays
 * through the terrain's edge masks (lava, later flood water and embers).
 * One recipe file per family under tools/fx/ draws what is listed here;
 * src/fx*.ts reads the manifest the generator writes (src/fxatlas.ts).
 * Spec: docs/ereignisse-spec.md §2.4 · style: docs/ereignisse-2026-10/stil.md.
 *
 * Sprites:
 *   w × h     box in 8-px steps; `tile: true` marks a tile-bound object
 *             16 wide and 20 or 24 high, built like a tree or a city
 *   frames    animation frames (variants for a still sprite, fps 0)
 *   fps       8–12 for animations; `loop` frames repeat, the rest play once
 *   anchor    'foot': bottom centre stands on the tile's last row and the
 *             sprite grows upwards like a tree; 'center': centred on the tile
 *   layer     'object' (sorted by foot with the map's objects) or 'top'
 *   mirror    'generator' when a mirrored set exists (form mirrored, light
 *             re-applied from the upper left); 'runtime' only for sprites
 *             whose light is symmetric; absent: never mirrored
 *   directions  directed sprites: frames hold this many directions in the
 *             order of HAZARD_NX/HAZARD_NY, frames / directions each; every
 *             direction is drawn by the generator, never rotated
 * ========================================================================== */
'use strict';

/** Recipe files, one per family; a family without a file has no art yet. */
const FAMILIES = ['smoke', 'volcano', 'fire', 'impact', 'water', 'storm', 'bolt', 'twister', 'earth', 'fauna', 'ice', 'offshore', 'oilfield', 'spaceport', 'reeffish', 'termites'];

const SPRITES = [
  { id: 'smoke_puff', name: 'Rauchwölkchen', family: 'smoke', w: 8, h: 8, frames: 4, fps: 8, anchor: 'center', layer: 'top' },
  { id: 'steam_puff', name: 'Dampfwolke', family: 'smoke', w: 16, h: 16, frames: 4, fps: 8, anchor: 'center', layer: 'top' },
  {
    id: 'volcano_column', name: 'Ausbruchssäule mit Lavafontäne', family: 'volcano', w: 32, h: 48, frames: 8, fps: 10,
    anchor: 'foot', layer: 'object',
  },
  {
    id: 'ash_cloud', name: 'Aschewolke', family: 'volcano', w: 48, h: 32, frames: 7, loop: 4, fps: 6,
    anchor: 'center', layer: 'top',
  },
  // The cone is landscape relief (src/landridgedraw.ts); an erupting one glows in its crater.
  { id: 'crater_glow', name: 'Glühender Lavasee im Krater', family: 'volcano', w: 16, h: 16, frames: 4, fps: 6, anchor: 'center', layer: 'object' },
  { id: 'lava_splash', name: 'Lavaspritzer', family: 'volcano', w: 8, h: 8, frames: 4, fps: 10, anchor: 'center', layer: 'object' },

  // Fire (Flächenbrand): flames stand on burning tiles, smoke drifts with the wind.
  { id: 'flame_small', name: 'Flamme, klein', family: 'fire', w: 16, h: 20, tile: true, frames: 6, fps: 10, anchor: 'foot', layer: 'object', mirror: 'runtime' },
  { id: 'flame_medium', name: 'Flamme, mittel', family: 'fire', w: 16, h: 20, tile: true, frames: 6, fps: 10, anchor: 'foot', layer: 'object', mirror: 'runtime' },
  { id: 'flame_large', name: 'Flamme, groß', family: 'fire', w: 16, h: 20, tile: true, frames: 6, fps: 10, anchor: 'foot', layer: 'object', mirror: 'runtime' },
  { id: 'smoke_plume', name: 'Rauchfahne, aufrecht', family: 'fire', w: 16, h: 32, frames: 6, fps: 8, anchor: 'foot', layer: 'top' },
  { id: 'smoke_plume_east', name: 'Rauchfahne, nach Osten geneigt', family: 'fire', w: 24, h: 32, frames: 6, fps: 8, anchor: 'foot', layer: 'top', mirror: 'generator' },
  { id: 'smoke_plume_west', name: 'Rauchfahne, nach Westen geneigt', family: 'fire', w: 24, h: 32, frames: 6, fps: 8, anchor: 'foot', layer: 'top', mirror: 'generator' },
  { id: 'charred_trunk', name: 'Verkohlter Stamm', family: 'fire', w: 8, h: 16, frames: 3, fps: 0, anchor: 'foot', layer: 'object' },

  // Impacts (Meteorit, Atomschlag).
  { id: 'meteor_streak', name: 'Feuerschweif', family: 'impact', w: 32, h: 32, frames: 4, fps: 12, anchor: 'center', layer: 'top' },
  { id: 'flash', name: 'Örtlicher Blitz (Frames 0, 1) und Feuerball ohne Weiß (2)', family: 'impact', w: 32, h: 32, frames: 3, fps: 12, anchor: 'center', layer: 'top' },
  { id: 'dust_cloud', name: 'Staubwolke', family: 'impact', w: 48, h: 48, frames: 8, fps: 6, anchor: 'center', layer: 'top' },
  { id: 'mushroom', name: 'Pilzwolke', family: 'impact', w: 32, h: 48, frames: 8, fps: 6, anchor: 'foot', layer: 'object' },
  { id: 'water_fountain', name: 'Wasserfontäne', family: 'impact', w: 16, h: 32, frames: 6, fps: 10, anchor: 'foot', layer: 'object' },
  { id: 'crater_rim', name: 'Kraterrand (frisch, verwittert)', family: 'impact', w: 24, h: 16, frames: 2, fps: 0, anchor: 'foot', layer: 'object' },
  { id: 'crater_rim_large', name: 'Kraterrand des Kometen über 2 × 2 Feldern (frisch, verwittert)', family: 'impact', w: 48, h: 32, frames: 2, fps: 0, anchor: 'foot', layer: 'object' },
  { id: 'stump', name: 'Versengter Stumpf', family: 'impact', w: 8, h: 8, frames: 3, fps: 0, anchor: 'foot', layer: 'object' },

  // Water and wind (Flutwelle, Wirbelsturm).
  // Directed sprites hold 8 directions one after another (HAZARD_NX/NY order), each with its own frames.
  { id: 'wave_break', name: 'Brechende Welle: 8 Richtungen × 6 Frames', family: 'water', w: 16, h: 16, frames: 48, fps: 10, anchor: 'foot', layer: 'object', mirror: 'generator', directions: 8 },
  { id: 'fallen_tree', name: 'Umgestürzter Baum', family: 'water', w: 16, h: 8, frames: 3, fps: 0, anchor: 'foot', layer: 'object' },
  { id: 'driftwood', name: 'Treibgut', family: 'water', w: 8, h: 8, frames: 3, fps: 0, anchor: 'foot', layer: 'object' },

  // The hurricane (Wirbelsturm) and its weather (src/fxstorm.ts). The cloud is seen from above, rotating; everything
  // that rises (bolts, funnels, debris) stands upright like the rest of the map's objects.
  // storm: frames 0–7 one turn step each (counterclockwise in the north, the south set its own, lit afresh);
  // frames 8–15 the same steps with lightning glowing inside the cloud, swapped in for a flash. `loop` 8.
  { id: 'hurricane', name: 'Wirbelsturm, Nordhalbkugel: 8 Drehframes, 8 mit Wetterleuchten', family: 'storm', w: 96, h: 96, frames: 16, loop: 8, fps: 8, anchor: 'center', layer: 'top', mirror: 'generator' },
  { id: 'hurricane_south', name: 'Wirbelsturm, Südhalbkugel: 8 Drehframes, 8 mit Wetterleuchten', family: 'storm', w: 96, h: 96, frames: 16, loop: 8, fps: 8, anchor: 'center', layer: 'top', mirror: 'generator' },
  { id: 'storm_small', name: 'Sich formender Sturm, Nordhalbkugel', family: 'storm', w: 48, h: 48, frames: 4, fps: 6, anchor: 'center', layer: 'top', mirror: 'generator' },
  { id: 'storm_small_south', name: 'Sich formender Sturm, Südhalbkugel', family: 'storm', w: 48, h: 48, frames: 4, fps: 6, anchor: 'center', layer: 'top', mirror: 'generator' },
  // bolt: a lightning strike from the cloud to the ground, two shapes × 6 frames (leader, strike, strike, afterglow,
  // re-strike, fade), played once; the ground glow where it hits; rain curtains under the bands, slanting left (0–3)
  // or right (4–7), looped per slant.
  { id: 'lightning', name: 'Blitzeinschlag: 2 Formen × 6 Frames', family: 'bolt', w: 24, h: 64, frames: 12, fps: 15, anchor: 'foot', layer: 'top' },
  { id: 'lightning_glow', name: 'Glühen am Einschlag', family: 'bolt', w: 32, h: 16, frames: 4, fps: 12, anchor: 'center', layer: 'object' },
  { id: 'rain_veil', name: 'Regenvorhang: schräg nach links (0–3), nach rechts (4–7)', family: 'bolt', w: 32, h: 32, frames: 8, loop: 4, fps: 12, anchor: 'center', layer: 'top' },
  // twister: the tornado funnel from the cloud base to the ground with its debris collar, looped; the debris it lifts,
  // four kinds × 2 tumble frames (clod, rock, branch, plank), placed and turned by the runtime.
  { id: 'tornado', name: 'Tornado-Trichter mit Trümmerkragen', family: 'twister', w: 32, h: 64, frames: 8, fps: 12, anchor: 'foot', layer: 'object' },
  { id: 'tornado_debris', name: 'Trümmer im Tornado: 4 Arten × 2 Frames', family: 'twister', w: 8, h: 8, frames: 8, fps: 0, anchor: 'center', layer: 'object' },

  // Earth (Erdbeben), and the ruins every disaster can leave.
  { id: 'dust_puff', name: 'Staubwölkchen', family: 'earth', w: 16, h: 16, frames: 5, fps: 10, anchor: 'center', layer: 'top' },
  { id: 'rubble', name: 'Trümmer über einer Stadt', family: 'earth', w: 16, h: 16, frames: 2, fps: 4, anchor: 'foot', layer: 'object' },
  { id: 'fissure', name: 'Erdriss, flach: 4 Richtungen (−, |, /, \\) × Mitte, Ende, Abzweigung', family: 'earth', w: 16, h: 16, frames: 12, fps: 0, anchor: 'center', layer: 'object' },
  { id: 'ruin', name: 'Ruine', family: 'earth', w: 16, h: 20, tile: true, frames: 3, fps: 0, anchor: 'foot', layer: 'object' },

  // Fauna: whales seen from above on the open sea (src/whalelayer.ts). Two directions (east, then west) × 8
  // frames: 0–1 rise, 2–3 swim, 4–7 fluke dive (back arches, fluke rises, fluke peak, fluke sinks). The runtime
  // picks the frames itself. `mouth`, east frames (west: w − 1 − x): [blowX, blowY, snoutX, snoutY, flukeX,
  // flukeY] — the pixel above the blowhole in frames 1–3, where the blow's foot stands; the snout tip on the
  // spine (frames 2–3, the bow wave); the foot of the raised fluke (frames 6–7). whale_blow plays once.
  { id: 'whale_great', name: 'Blauwal: 2 Richtungen × 8 Frames', family: 'fauna', w: 48, h: 24, frames: 16, fps: 8, anchor: 'center', layer: 'object', mirror: 'generator', directions: 2, mouth: [40, 12, 45, 13, 8, 13] },
  { id: 'whale_baleen', name: 'Buckelwal: 2 Richtungen × 8 Frames', family: 'fauna', w: 40, h: 24, frames: 16, fps: 8, anchor: 'center', layer: 'object', mirror: 'generator', directions: 2, mouth: [30, 10, 35, 11, 8, 11] },
  { id: 'whale_sperm', name: 'Pottwal: 2 Richtungen × 8 Frames', family: 'fauna', w: 40, h: 24, frames: 16, fps: 8, anchor: 'center', layer: 'object', mirror: 'generator', directions: 2, mouth: [37, 8, 37, 12, 8, 12] },
  { id: 'whale_blow', name: 'Blas eines Wals', family: 'fauna', w: 24, h: 24, frames: 8, fps: 10, anchor: 'foot', layer: 'object' },
  { id: 'whale_blow_sperm', name: 'Blas des Pottwals, schräg nach vorn: 2 Richtungen × 8 Frames', family: 'fauna', w: 24, h: 24, frames: 16, fps: 10, anchor: 'foot', layer: 'object', mirror: 'generator', directions: 2 },
  // Drawn under the whale: bow wave (east 0–3, west 4–7, looped; `mouth` its tip in the east frames, set on
  // the snout) and the footprint ring before a whale rises and after its fluke sinks (8–11, once).
  { id: 'whale_wake', name: 'Bugwelle (Osten, Westen) und Fußabdruck-Ring', family: 'fauna', w: 24, h: 16, frames: 12, loop: 4, fps: 8, anchor: 'center', layer: 'object', mirror: 'generator', mouth: [18, 7] },
  // Dolphins leaping in warm seas (src/dolphinlayer.ts), seen from the side like everything that rises off the
  // map: east 0–15, west 16–31, played once per leap. The whole arc is in the box; `mouth` is where the body
  // leaves the water, on the waterline, in the east frames (west: w − 1 − x).
  { id: 'dolphin_leap', name: 'Delfinsprung: 2 Richtungen × 16 Frames', family: 'fauna', w: 32, h: 24, frames: 32, fps: 12, anchor: 'center', layer: 'object', mirror: 'generator', directions: 2, mouth: [6, 18] },
  // A salmon leaping upstream out of a river (src/salmonlayer.ts), from the side: east 0–9, west 10–19, played once
  // per leap. A short steep arc, so it fits a river running any way: waterline row 12, `mouth` is where the fish
  // leaves the water (east frames), it dives back in 6 px further on (x 10).
  { id: 'salmon_leap', name: 'Lachssprung flussaufwärts: 2 Richtungen × 10 Frames', family: 'fauna', w: 16, h: 16, frames: 20, fps: 12, anchor: 'center', layer: 'object', mirror: 'generator', directions: 2, mouth: [4, 12] },
  // A migrating stork seen from above like the map (src/storklayer.ts): south 0–7 (flying down the screen, beak
  // down, legs trailing up), north 8–15 (beak up, legs trailing down); each set looped by the runtime: 0–3 one slow
  // wing beat (raised, level, lowered, level), 4–7 gliding on outstretched wings. Body centred in the box.
  { id: 'stork_glide', name: 'Ziehender Storch: Süden, Norden × 8 Frames', family: 'fauna', w: 24, h: 24, frames: 16, fps: 8, anchor: 'center', layer: 'top', directions: 2 },
  // A clownfish under the lagoon's water, seen from above like the map and the corals (src/clownfishlayer.ts): 8
  // directions in HAZARD_NX/NY order (NW, N, NE, W, E, SW, S, SE), 6 frames each: 0–1 slipping out of a coral
  // (deep and dim, then half its colour), 2–5 one swim cycle (tail beat), looped by the runtime, which plays 1, 0
  // when the fish slips back in. Body (5–6 px nose to tail) centred in the box.
  { id: 'clownfish', name: 'Clownfisch unter Wasser: 8 Richtungen × 6 Frames', family: 'reeffish', w: 8, h: 8, frames: 48, fps: 10, anchor: 'center', layer: 'object', directions: 8 },

  // A termite mound on the savanna (src/termitelayer.ts), raised once ants (insect sub-species 8) live there and fixed
  // while its tile stays savanna. A cathedral mound of red-orange savanna clay in the map's 3/4 relief (a heightfield
  // seen from the south at 45°, like the volcano cones), 24 px wide and 20 high: rows 0–3 stay clear, its foot spreads
  // 4 px onto the tiles left and right, its towers reach 4 px into the tile above. Frames 0–7 one quiet loop: a few
  // termites (2 px: pale sand4 body, laterite0 head) go in and out of an opening at the south foot; the mound itself
  // never changes. Frame 0 alone is the still picture. The trails to the neighbouring tiles are drawn by the runtime.
  { id: 'termite_mound', name: 'Termitenhügel in der Savanne: 8 Frames krabbelnde Termiten', family: 'termites', w: 24, h: 24, frames: 8, fps: 4, anchor: 'foot', layer: 'object' },

  // Sea ice calving off the pack edge (src/icecalving.ts); the runtime picks every frame. Crack and slab come wide
  // (0–3, open water north or south) and tall (4–7, east or west), never rotated. The crack is drawn over the
  // edge tile's own ice, the slab on the water's half of it; splash, berg and melt sit on the water.
  { id: 'ice_crack', name: 'Riss durch eine Randscholle: waagrecht (0–3), senkrecht (4–7)', family: 'ice', w: 16, h: 16, frames: 8, fps: 0, anchor: 'center', layer: 'object' },
  { id: 'ice_calve', name: 'Abbrechende Scholle kippt ins Meer: breit (0–3), hoch (4–7)', family: 'ice', w: 16, h: 16, frames: 8, fps: 0, anchor: 'center', layer: 'object' },
  { id: 'ice_splash', name: 'Gischt mit Wasserring', family: 'ice', w: 16, h: 16, frames: 6, fps: 10, anchor: 'center', layer: 'object' },
  { id: 'iceberg_drift', name: 'Treibender Eisberg, wippend (0, 1, 0, 2)', family: 'ice', w: 16, h: 16, frames: 3, fps: 0, anchor: 'center', layer: 'object' },
  { id: 'iceberg_melt', name: 'Schmelzender Eisberg', family: 'ice', w: 16, h: 16, frames: 5, fps: 0, anchor: 'center', layer: 'object' },

  // Oil (src/oillayer.ts): placed once when the first city reaches the Industrial age, then fixed. Both stand on
  // their tile's last row like a tree and reach up to 16 px into the tile above and 8 px into the tiles beside it.
  // Frames 0–7 one working cycle, looped; frame 8 the same rig shut down, shown once the planet's oil is gone.
  // oil_platform: a steel platform on legs in the sea off the coast, its waterline on the bottom rows; the working
  // cycle flickers the gas flare and laps the water at the legs. oil_derrick: a lattice drilling tower on desert
  // ground with a pumpjack beside it; the working cycle is one full stroke of the pumpjack (the beam nods, the horse
  // head sinks and rises over the well, the crank and counterweight turn once).
  { id: 'oil_platform', name: 'Bohrinsel vor der Küste: 8 Frames Betrieb, 1 stillgelegt', family: 'offshore', w: 32, h: 32, frames: 9, loop: 8, fps: 8, anchor: 'foot', layer: 'object' },
  { id: 'oil_derrick', name: 'Förderturm mit Pferdekopfpumpe in der Wüste: 8 Frames Betrieb, 1 stillgelegt', family: 'oilfield', w: 32, h: 32, frames: 9, loop: 8, fps: 6, anchor: 'foot', layer: 'object' },

  // The space project (src/spaceport.ts, src/spaceportlayer.ts): one launch site in a desert, built in four phases and
  // drawn by the sprite of the phase it is in, in the map's 3/4 isometric view (slab, cylinder and lattice with their
  // top and side faces). Every phase stands on the same concrete pad on desert sand: it covers its
  // tile's last row and reaches 16 px into the tiles left and right and up to 48 px into the three tiles above. The
  // phases must read apart at a glance at 10–16 px per tile (silhouette and height first, detail second): a flat pad
  // with a crane, a squat lower stage in scaffolding, the full rocket at its tower, the rocket alone on the finished
  // ramp. Frames are a short working loop (crane, welding sparks, lights, venting), frame 0 the still picture for
  // "Effekte reduzieren". spaceport_launched: the empty pad after the launch, for good.
  { id: 'spaceport_pad', name: 'Raumhafen, Phase 1: Fundament und Startplatz im Bau', family: 'spaceport', w: 48, h: 64, frames: 4, fps: 6, anchor: 'foot', layer: 'object' },
  { id: 'spaceport_stage', name: 'Raumhafen, Phase 2: untere Raketenstufe im Baugerüst', family: 'spaceport', w: 48, h: 64, frames: 4, fps: 6, anchor: 'foot', layer: 'object' },
  { id: 'spaceport_rocket', name: 'Raumhafen, Phase 3: vollständige Rakete am Startturm', family: 'spaceport', w: 48, h: 64, frames: 4, fps: 6, anchor: 'foot', layer: 'object' },
  { id: 'spaceport_ready', name: 'Raumhafen, Phase 4: startbereite Rakete auf der fertigen Rampe, Abdampf und Positionslichter', family: 'spaceport', w: 48, h: 64, frames: 8, fps: 8, anchor: 'foot', layer: 'object' },
  { id: 'spaceport_launched', name: 'Raumhafen nach dem Start: leere Rampe, versengter Beton', family: 'spaceport', w: 48, h: 64, frames: 1, fps: 0, anchor: 'foot', layer: 'object' },
];

/**
 * Seamless ground textures (`size` square), drawn per tile through the
 * terrain's frayed edge masks; `rim` outlines the layer where it meets
 * plain ground, so glowing lava always has a darker edge. A film (rim null)
 * is transparent where it shows nothing. Which tiles carry which texture,
 * and which draws over which, is GROUND_LAYERS in src/fxground.ts.
 */
const TEXTURES = [
  { id: 'lava_hot', name: 'Lava, glühend', family: 'volcano', size: 64, frames: 4, fps: 8, rim: 'red0' },
  { id: 'lava_dim', name: 'Lava, dunkelrot', family: 'volcano', size: 64, frames: 4, fps: 6, rim: 'soil0' },
  { id: 'lava_crust', name: 'Lavakruste mit Glutrissen', family: 'volcano', size: 64, frames: 2, fps: 3, rim: 'rock0' },
  { id: 'embers', name: 'Glut unter den Flammen', family: 'fire', size: 64, frames: 2, fps: 4, rim: 'soil0' },
  { id: 'ground_burnt', name: 'Verbrannte Erde', family: 'fire', size: 64, frames: 1, fps: 0, rim: 'soil0' },
  { id: 'ground_crater', name: 'Kraterboden', family: 'impact', size: 64, frames: 1, fps: 0, rim: 'rock0' },
  { id: 'ground_scorched', name: 'Versengter Boden', family: 'impact', size: 64, frames: 1, fps: 0, rim: 'soil0' },
  { id: 'ground_ash', name: 'Asche', family: 'impact', size: 64, frames: 1, fps: 0, rim: 'rock1' },
  { id: 'fallout_film', name: 'Fahler Schleier (Fallout)', family: 'impact', size: 64, frames: 1, fps: 0, rim: null },
  { id: 'flood_mud', name: 'Rückströmung, schlammig', family: 'water', size: 64, frames: 2, fps: 4, rim: 'soil2' },
  { id: 'flood_shallow', name: 'Flutwasser, flach und trüb', family: 'water', size: 64, frames: 2, fps: 4, rim: 'water7' },
  { id: 'flood_water', name: 'Flutwasser', family: 'water', size: 64, frames: 2, fps: 4, rim: 'water7' },
  { id: 'flood_deep', name: 'Flutwasser, tief', family: 'water', size: 64, frames: 2, fps: 4, rim: 'water7' },
  // 128 px: a hurricane soaks wide strips, and a 64-px puddle pattern repeated every 4 tiles read as a grid.
  { id: 'wet_ground', name: 'Nasser Boden (Pfützen)', family: 'water', size: 128, frames: 1, fps: 0, rim: null },
];

/** Colours one sprite frame or texture frame may use, shading included. */
const MAX_COLORS = 12;

module.exports = { FAMILIES, SPRITES, TEXTURES, MAX_COLORS };
