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
const FAMILIES = ['smoke', 'volcano', 'fire', 'impact', 'water', 'storm', 'bolt', 'twister', 'earth', 'fauna', 'ice', 'offshore', 'oilfield', 'spaceport', 'reeffish', 'termites', 'sharks', 'ships', 'trains', 'wonders', 'kapok'];

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
  // Sharks circling, now and then where sharks (fish sub-species 5) live (src/sharklayer.ts): two dorsal fins, a big
  // and a smaller one about 140° behind it, run counter-clockwise seen from above (east end northwards, near side
  // eastwards) round an ellipse on the water in the map's 3/4 view (from the south at 45°), the path about 24 × 14
  // px and centred in the box. On the near and far side a fin shows its profile (leading edge sloping, trailing edge
  // steep), at the east and west ends it turns edge-on. Frames 0–3 the fins break the surface and rise, 4–27 one lap
  // of 24 steps (looped by the runtime), 28–31 they sink and the water settles; the fins move on one step every
  // frame throughout (0–3 are steps 20–23, 28–31 steps 0–3), so in and out join the lap seamlessly. The sea stays
  // transparent: only the fins, their foam wake and the stirred water along the path are drawn.
  { id: 'shark_fins', name: 'Kreisende Haiflossen: 4 Auftauchen, 24 Runde, 4 Abtauchen', family: 'sharks', w: 32, h: 24, frames: 32, loop: 24, fps: 10, anchor: 'center', layer: 'object' },
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

  // The kapok tree (src/kapoklayer.ts, src/kapok.ts): one per planet, an emergent in the heart of the largest
  // rainforest, fixed while its tile stays rainforest. Ceiba pentandra in the map's 3/4 view, lit from the upper left:
  // a broad, flat, tiered umbrella crown high over the canopy, a thick straight trunk, plank buttress roots flaring
  // at the foot, in colours of its own (a sunlit lime crown, a silvery green-grey trunk) so it reads as special.
  // 32 × 40, twice the canopy trees: the foot on the tile's last row, the crown up to 24 px into the tiles above
  // and 8 px over the tiles left and right. It stands over the rainforest's own trees. Still: one frame.
  { id: 'kapok_tree', name: 'Kapokbaum, Urwaldriese', family: 'kapok', w: 32, h: 40, frames: 1, fps: 0, anchor: 'foot', layer: 'object' },

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

  // Ships on the sea (src/shiplayer.ts, src/fleets.ts; settlers on water in src/civfigures.ts), drawn from 16 px per
  // tile on, in the map's 3/4 view: hull and deck seen from above and a little from the south, the side of the hull
  // facing south, masts, sails and funnels standing up. Two directions (east, then west, generator-mirrored) x the
  // frames each: a short loop of oars, sails, paddles or bobbing; the waterline is the sprite's lower third.
  // `mouth` in the east frames (west: w − 1 − x): [pennantX, pennantY, funnelX, funnelY, sternX, sternY, waterY] —
  // the topmost pixel of the mast or pole where the tribe's pennant flies (draw the pennant from there, the sprite
  // has none); the topmost pixel of the funnel, where smoke rises (-1 where there is none); the stern on the water
  // at the centre line, where ship_wake's `mouth` goes; the foam row under the middle of the hull: a sinking ship is
  // cut off from this row down. Hull lengths grow with the era.
  { id: 'ship_raft', name: 'Floß mit Paddler (Siedler der Steinzeit): 2 Richtungen × 4 Frames', family: 'ships', w: 16, h: 16, frames: 8, fps: 6, anchor: 'center', layer: 'object', mirror: 'generator', directions: 2, mouth: [4, 3, -1, -1, 2, 10, 14] },
  { id: 'ship_dugout', name: 'Einbaum mit Paddlern (Siedler der Bronzezeit): 2 Richtungen × 4 Frames', family: 'ships', w: 24, h: 16, frames: 8, fps: 6, anchor: 'center', layer: 'object', mirror: 'generator', directions: 2, mouth: [5, 3, -1, -1, 1, 10, 13] },
  { id: 'ship_galley', name: 'Galeere mit Rudern und Rahsegel (Bronzezeit): 2 Richtungen × 6 Frames Ruderschlag', family: 'ships', w: 32, h: 24, frames: 12, fps: 8, anchor: 'center', layer: 'object', mirror: 'generator', directions: 2, mouth: [16, 2, -1, -1, 4, 15, 18] },
  { id: 'ship_trireme', name: 'Trireme mit drei Ruderreihen, Rammsporn und Rahsegel (Eisenzeit): 2 Richtungen × 6 Frames', family: 'ships', w: 40, h: 24, frames: 12, fps: 8, anchor: 'center', layer: 'object', mirror: 'generator', directions: 2, mouth: [20, 1, -1, -1, 2, 15, 18] },
  { id: 'ship_sailer', name: 'Segelschiff, Karavelle mit drei Masten (Siedler der Eisenzeit, Entdeckerfahrt): 2 Richtungen × 4 Frames', family: 'ships', w: 32, h: 32, frames: 8, fps: 6, anchor: 'center', layer: 'object', mirror: 'generator', directions: 2, mouth: [15, 1, -1, -1, 3, 23, 26] },
  { id: 'ship_steamer', name: 'Dampfschiff mit Schaufelrad und Schlot (Industrie): 2 Richtungen × 4 Frames', family: 'ships', w: 32, h: 24, frames: 8, fps: 8, anchor: 'center', layer: 'object', mirror: 'generator', directions: 2, mouth: [24, 2, 15, 3, 2, 16, 19] },
  { id: 'ship_freighter', name: 'Containerschiff (ab dem Atomzeitalter): 2 Richtungen × 2 Frames', family: 'ships', w: 40, h: 24, frames: 4, fps: 3, anchor: 'center', layer: 'object', mirror: 'generator', directions: 2, mouth: [6, 3, 3, 4, 1, 16, 19] },
  { id: 'ship_warship', name: 'Kriegsschiff aus Stahl mit Geschütztürmen (Seeschlacht ab der Industrie): 2 Richtungen × 2 Frames', family: 'ships', w: 40, h: 24, frames: 4, fps: 3, anchor: 'center', layer: 'object', mirror: 'generator', directions: 2, mouth: [20, 2, 15, 5, 2, 16, 20] },
  // Drawn under a moving ship at its stern: the white wake fanning out behind it (east 0-3, west 4-7, looped);
  // `mouth` (east) is its apex, set on the ship's stern point.
  { id: 'ship_wake', name: 'Kielwasser: 2 Richtungen × 4 Frames', family: 'ships', w: 24, h: 8, frames: 8, fps: 8, anchor: 'center', layer: 'object', mirror: 'generator', directions: 2, mouth: [23, 3] },
  // A sea battle (src/shiplayer.ts): what flies between the fleets and where it lands; the sinking ship itself sinks
  // by its own sprite cut off from the waterline down, with ship_wreck over it, never by fading. ship_volley: 0–3 a
  // looped hail of falling arrows, 4–7 a gun's flash and smoke, once. ship_wreck: 0–3 burning (looped while the hull
  // sinks, flames on its deck line about row 14), 4–7 once when it has gone (foam, ring, smoke drifting off).
  { id: 'ship_volley', name: 'Pfeilhagel und Brandpfeile (antik, 0–3), Mündungsfeuer mit Rauch (ab Industrie, 4–7)', family: 'ships', w: 16, h: 16, frames: 8, fps: 10, anchor: 'center', layer: 'object' },
  { id: 'ship_splash', name: 'Einschlag im Wasser, Gischtsäule', family: 'ships', w: 8, h: 16, frames: 5, fps: 10, anchor: 'foot', layer: 'object' },
  { id: 'ship_wreck', name: 'Sinkendes Wrack: Feuer, Rauch, Trümmer und Ring auf dem Wasser', family: 'ships', w: 32, h: 24, frames: 8, loop: 4, fps: 6, anchor: 'center', layer: 'object' },

  // The railway (src/trainlayer.ts; the track is part of the composed landscape, src/landrail.ts): locomotive and
  // cars of the era, each piece one track step long, in 8 directions (HAZARD_NX/NY order: NW N NE W E SW S SE) x its
  // frames, the box centre on the track point. Solid bodies in the map's 3/4 view, every direction rendered and lit
  // afresh (tools/fx/trains.js): going E or W a piece shows roof and south side (14 px body + couplings = 16 px),
  // going N or S its roof and one end (about 20 px tall), on the diagonals it is stretched along the track to 16·√2
  // px. So pieces on consecutive track tiles (one path step apart, in any direction) join with only their couplings
  // between them; draw them back to front by the track point's y. Industrial: a black 4-4-0 steam engine with tender
  // and wooden coaches; Atomic: a white and red streamlined express; from the Information age: a white maglev with a
  // blue band, hovering over its own shadow. train_steam_loco: frames 0–3 of each direction turn the drivers a
  // quarter (the rods show going E or W and on the diagonals); `mouth`: the opening of its stack, [x, y] for each
  // direction in the same order, where a train_steam_puff starts (its box centre there, played once, drifting up
  // and back).
  { id: 'train_steam_loco', name: 'Dampflok: 8 Richtungen × 4 Frames Treibstangen', family: 'trains', w: 24, h: 32, frames: 32, fps: 10, anchor: 'center', layer: 'object', mirror: 'generator', directions: 8, mouth: [6, 2, 12, 2, 17, 2, 6, 7, 17, 7, 6, 12, 12, 12, 17, 12] },
  { id: 'train_steam_car', name: 'Personenwagen der Dampfbahn: 8 Richtungen', family: 'trains', w: 24, h: 32, frames: 8, fps: 0, anchor: 'center', layer: 'object', mirror: 'generator', directions: 8 },
  { id: 'train_express_head', name: 'Triebkopf des Schnellzugs: 8 Richtungen', family: 'trains', w: 24, h: 32, frames: 8, fps: 0, anchor: 'center', layer: 'object', mirror: 'generator', directions: 8 },
  { id: 'train_express_car', name: 'Mittelwagen des Schnellzugs: 8 Richtungen', family: 'trains', w: 24, h: 32, frames: 8, fps: 0, anchor: 'center', layer: 'object', mirror: 'generator', directions: 8 },
  { id: 'train_maglev_head', name: 'Kopf der Magnetschwebebahn: 8 Richtungen', family: 'trains', w: 24, h: 32, frames: 8, fps: 0, anchor: 'center', layer: 'object', mirror: 'generator', directions: 8 },
  { id: 'train_maglev_car', name: 'Mittelteil der Magnetschwebebahn: 8 Richtungen', family: 'trains', w: 24, h: 32, frames: 8, fps: 0, anchor: 'center', layer: 'object', mirror: 'generator', directions: 8 },
  { id: 'train_steam_puff', name: 'Dampfwolke über dem Schornstein der Lok', family: 'trains', w: 8, h: 8, frames: 5, fps: 8, anchor: 'center', layer: 'top' },

  // World wonders (src/wonderlayer.ts, src/wonders.ts), built in stages the player watches: frames are build stages
  // (fps 0), the last frame the finished wonder. In the 3/4 view of the cities and the space port, on their own
  // ground (sand, stone), lit from the upper left; a stage must read apart from the next at 16 px per tile.
  // wonder_pyramids: the three pyramids of Giza and their quarry ramps over 3 x 2 tiles, foot on the lower tile row,
  // up to 16 px into the tile row above that: 0 marked ground and quarry, 1 the first courses of the great pyramid
  // with a ramp, 2 half its height, 3 the great pyramid near its top and the second begun, 4 two done and the third
  // in scaffolding, 5 all three with white casing and gilded tips.
  { id: 'wonder_pyramids', name: 'Pyramiden: 6 Bauphasen', family: 'wonders', w: 48, h: 48, frames: 6, fps: 0, anchor: 'foot', layer: 'object' },
  // wonder_wall: the Great Wall along a chain of tiles, one piece per tile. An arm runs from the tile's centre to its
  // edge towards one neighbour (8 directions, HAZARD_NX/NY order) and a tile draws the arms towards both of its
  // neighbours on the wall; 3 stages per direction (0 foundation and rubble, 1 half its height in scaffolding,
  // 2 finished with walkway and crenellations). wonder_wall_tower: a watchtower over the centre of every few tiles,
  // 3 stages. Both are centred on their tile, 16 x 32: the tile's ground on rows 8–23, up to 8 px into the tiles above
  // and below (an arm runs on past its tile's edge, under the neighbour's arm drawn after it; one that does not run
  // south leaves the last rows empty, so they are not foot sprites). Draw a tile's arms in direction order (northern
  // first), its tower after them, and the tiles from north to south; a platform over every tile's centre joins the arms.
  { id: 'wonder_wall', name: 'Chinesische Mauer, Mauerarm: 8 Richtungen × 3 Bauphasen', family: 'wonders', w: 16, h: 32, frames: 24, fps: 0, anchor: 'center', layer: 'object', mirror: 'generator', directions: 8 },
  { id: 'wonder_wall_tower', name: 'Wachturm der Mauer: 3 Bauphasen', family: 'wonders', w: 16, h: 32, frames: 3, fps: 0, anchor: 'center', layer: 'object' },
  // Builders at work beside a wonder under construction: tiny figures hauling a block on a sledge, looped.
  { id: 'wonder_crew', name: 'Bauleute mit Steinblock auf dem Schlitten: 6 Frames', family: 'wonders', w: 16, h: 8, frames: 6, fps: 6, anchor: 'foot', layer: 'object', mirror: 'runtime' },
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
