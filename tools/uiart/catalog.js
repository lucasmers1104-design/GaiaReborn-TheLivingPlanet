/* =============================================================================
 * Gaia Reborn — the living-interface art contract
 * -----------------------------------------------------------------------------
 * Ids, boxes, frames, anchors and named points of every pixel sprite of the
 * living interface: Gaia and her rock in the lower left corner, the vines
 * that grow up the navigation rail and along the status bar, the parchment
 * and wood of the frames, the rail and status-bar icons, and the magic of
 * the evolution moments. One recipe file per family under tools/uiart/ draws
 * what is listed here; src/uiart.ts reads the manifest the generator writes
 * (src/uiatlas.ts). Style reference: assets/ui/Gaia_Reborn_Living_UI_Concept/
 * (concept art only, never traced or copied: every pixel comes from a recipe).
 *
 * Units are art pixels. The runtime draws each art pixel as a whole number of
 * device pixels (src/uiart.ts, uiScale), usually 2–3 CSS px.
 *
 * Sprites:
 *   w × h     exact box of every frame
 *   frames    animation frames, or variants when fps is 0
 *   fps       playback rate; `loop` frames repeat, the frames after them play
 *             once (a tail); without `loop` all frames loop
 *   anchor    'foot': bottom centre (floor(w/2), h-1) stands on the point the
 *             runtime gives; 'center': (floor(w/2), floor(h/2)); 'topleft': (0, 0)
 *   points    named art-pixel points inside the box, the same for every frame
 *             ({ face: [x, y] } …); the runtime reads them from the manifest and
 *             never hard-codes them, so the family that draws a sprite owns them
 *   layout    for variant sprites: how frames are numbered, e.g. 'v*3+s'
 *   placeholder  never set here: the generator marks sprites whose family has
 *             no recipe yet (tools/ui-atlas.js --placeholders)
 *
 * Owners: each family belongs to one artist. An artist may change the boxes,
 * frame counts, fps and points of their own family's entries (and must keep
 * the documented frame meaning); ids and families are fixed by the lead.
 * ========================================================================== */
'use strict';

/** Recipe files, one per family; a family without a file has no art yet. */
const FAMILIES = ['gaia', 'gaiasleep', 'gaiamood', 'gaiamagic', 'scene', 'vine', 'chrome', 'icons', 'magic', 'air', 'snow', 'ground'];

/** Every Gaia body sprite shares this box and its foot anchor, so poses swap without a jump. */
const GAIA_W = 64;
const GAIA_H = 48;
/** Where the face overlays sit on a body pose: top left of the eyes box (gaia-body.js FACE_PRONE: the head at its prone place). */
const FACE = [46, 27];

const SPRITES = [
  // ---------------------------------------------------------------- gaia ---
  // Gaia, a small nature goddess with long leafy green hair (white flowers in it), a leaf dress and warm skin,
  // seen from the side-front in 3/4 view, lying on the top of her rock. She faces RIGHT, towards the planet on
  // the map. All body poses: box GAIA_W × GAIA_H, anchor 'foot' at the rock contact under her hips, so the
  // runtime places every pose at the rock's `bed` point. Poses with `points.face` have a blank face (skin
  // only, no eyes, brows or mouth): the runtime draws gaia_eyes / gaia_brows / gaia_mouth / gaia_blush there.
  // Poses without `points.face` have the face drawn in ("baked").
  {
    id: 'gaia_prone', name: 'Gaia liegt auf dem Bauch, auf die Ellbogen gestützt, und schaut zur Karte (Ruhe: Atmen, Haar weht)',
    family: 'gaia', w: GAIA_W, h: GAIA_H, frames: 4, fps: 4, anchor: 'foot', points: { face: FACE },
  },
  // Face overlays, drawn with their top left at the pose's face point + `points.at` (offset from the face point).
  {
    id: 'gaia_eyes', name: 'Augen: 0 offen nach rechts, 1 offen nach vorn, 2 offen nach oben, 3 halb, 4 zu, 5 fröhlich ^^, 6 traurig zu, 7 staunend weit, 8 tränennass, 9 nach unten',
    family: 'gaia', w: 12, h: 5, frames: 10, fps: 0, anchor: 'topleft', points: { at: [0, 0] },
  },
  {
    id: 'gaia_brows', name: 'Brauen: 0 ruhig, 1 gehoben, 2 besorgt (innen hoch), 3 traurig (außen tief)',
    family: 'gaia', w: 12, h: 2, frames: 4, fps: 0, anchor: 'topleft', points: { at: [0, -3] },
  },
  {
    id: 'gaia_mouth', name: 'Mund: 0 ruhig, 1 Lächeln, 2 offenes Lachen, 3 staunendes o, 4 Schmollen, 5 zittrig besorgt, 6 schlafend, 7 traurig offen',
    family: 'gaia', w: 6, h: 3, frames: 8, fps: 0, anchor: 'topleft', points: { at: [4, 5] },
  },
  {
    id: 'gaia_blush', name: 'Wangenröte', family: 'gaia', w: 12, h: 1, frames: 1, fps: 0, anchor: 'topleft', points: { at: [0, 4] },
  },

  // ----------------------------------------------------------- gaiasleep ---
  // Asleep on the bare rock before the first life, curled on her side, head on her arm, hair spread over the
  // stone. 0–3 breathe (loop, one calm breath in 2 s); 4–5 stir once (she snuggles and settles), then the
  // runtime returns to the loop. `zzz` is where the Z bubbles rise from, just above her head.
  {
    id: 'gaia_sleep', name: 'Gaia schläft zusammengerollt: 0–3 atmen, 4–5 regt sich im Schlaf',
    family: 'gaiasleep', w: GAIA_W, h: GAIA_H, frames: 6, loop: 4, fps: 2, anchor: 'foot', points: { zzz: [56, 19] },
  },
  // Waking with the first life, played once: eyes flutter, she lifts her head, looks left, then right towards the
  // planet, blinks, yawns and stretches onto her belly, pushes up onto her elbows. Frame 0 matches gaia_sleep
  // frame 0; the last frame matches gaia_prone frame 0 with open eyes (gaia_eyes 0, gaia_mouth 1) drawn in.
  {
    id: 'gaia_wake', name: 'Gaia erwacht: blinzelt, hebt den Kopf, schaut sich um, gähnt, stützt sich auf',
    family: 'gaiasleep', w: GAIA_W, h: GAIA_H, frames: 14, fps: 5, anchor: 'foot',
  },

  // ------------------------------------------------------------ gaiamood ---
  // Mood poses, each looped, each with a blank face at its own face point (the runtime adds the overlays).
  // Kick and chin keep the prone head; the slump lowers it 5 px onto her arms, the look-up lifts it 2 px.
  { id: 'gaia_kick', name: 'Freude: auf dem Bauch, die Füße schwingen, das Haar wippt', family: 'gaiamood', w: GAIA_W, h: GAIA_H, frames: 6, fps: 8, anchor: 'foot', points: { face: FACE } },
  { id: 'gaia_chin', name: 'Sorge: Kinn in die Hände gestützt, Schultern hochgezogen', family: 'gaiamood', w: GAIA_W, h: GAIA_H, frames: 4, fps: 3, anchor: 'foot', points: { face: FACE } },
  { id: 'gaia_slump', name: 'Trauer, Erschöpfung: Kopf auf den Armen, Haar und Kleid welk, langsamer Atem', family: 'gaiamood', w: GAIA_W, h: GAIA_H, frames: 4, fps: 2, anchor: 'foot', points: { face: [FACE[0], FACE[1] + 5] } },
  { id: 'gaia_lookup', name: 'Hoffnung: hebt den Kopf zum Himmel, eine Hand halb erhoben', family: 'gaiamood', w: GAIA_W, h: GAIA_H, frames: 4, fps: 4, anchor: 'foot', points: { face: [FACE[0], FACE[1] - 2] } },

  // ----------------------------------------------------------- gaiamagic ---
  // The evolution magic: she props herself on her near elbow and lifts her far hand, palm up, beside her face
  // towards the upper right (up: once; 0–1 she notices, 2–5 the hand rises and opens), holds it while a little
  // glowing world floats over her palm (hold: loop, hair drifting in a magic breeze, the orb's light on her
  // hair, glints on the lock tips and the dress), and lowers it again (down: once; its last frame matches
  // gaia_prone frame 0). Faces are baked into up and down; the hold has a blank face.
  // `hand`: the art pixel above her palm where the orb's centre floats (the world clears her head).
  { id: 'gaia_magic_up', name: 'Zauber: hebt die Hand', family: 'gaiamagic', w: GAIA_W, h: GAIA_H, frames: 6, fps: 8, anchor: 'foot' },
  { id: 'gaia_magic_hold', name: 'Zauber: hält die Hand erhoben, Haar schwebt', family: 'gaiamagic', w: GAIA_W, h: GAIA_H, frames: 4, fps: 5, anchor: 'foot', points: { face: FACE, hand: [61, 19] } },
  { id: 'gaia_magic_down', name: 'Zauber: senkt die Hand', family: 'gaiamagic', w: GAIA_W, h: GAIA_H, frames: 4, fps: 8, anchor: 'foot' },
  // The little world over her palm (drawn at `hand`): ocean teal, green land turning west to east once in the
  // 16 frames, a bright rim, a soft glow band that flares once a second with a ring of light swelling out.
  // Whatever would lie on Gaia is left out, so the light passes behind her head.
  { id: 'gaia_orb', name: 'Leuchtende kleine Weltkugel: dreht sich, pulsiert', family: 'gaiamagic', w: 15, h: 15, frames: 16, fps: 8, anchor: 'center' },
  // The orb charging, once, centred like the orb: a white-hot flash with four rays, a ring that swells (teal
  // heart, violet rim) and breaks into eight sparks; it too leaves Gaia out.
  { id: 'gaia_orb_flare', name: 'Die Kugel lädt sich auf: Lichtring schwillt an', family: 'gaiamagic', w: 25, h: 25, frames: 6, fps: 10, anchor: 'center' },

  // --------------------------------------------------------------- scene ---
  // Gaia's rock in the lower left corner: a rounded boulder with a flattish top where she lies. Its four looks
  // follow the planet: 0 bare young rock (grey, cracks, dust), 1 first life (tiny teal and green lichen spots),
  // 2 mossy (moss patches, grass tufts), 3 lush (a moss cushion on top, ferns and small flowers at its foot).
  // `bed`: where Gaia's foot anchor goes, on the top's middle row (rows 7–9 of the top stay visible in front of
  // her), the same in every look; `root`: the crevice on the left flank where the vine stem leaves the rock
  // (towards the rail; the box's left column is free beside it).
  {
    id: 'rock', name: 'Gaias Felsen: 0 kahl, 1 erste Flechten, 2 bemoost, 3 üppig',
    family: 'scene', w: 80, h: 26, frames: 4, fps: 0, anchor: 'foot', points: { bed: [40, 6], root: [1, 11] },
  },
  { id: 'zzz', name: 'Schlaf-Z, steigt auf und verblasst', family: 'scene', w: 7, h: 7, frames: 4, fps: 3, anchor: 'center' },
  { id: 'tear', name: 'Träne, fällt', family: 'scene', w: 3, h: 5, frames: 4, fps: 6, anchor: 'center' },
  { id: 'sweat', name: 'Schweißtropfen (Hitze, Sorge)', family: 'scene', w: 3, h: 5, frames: 3, fps: 6, anchor: 'center' },
  { id: 'sparkle', name: 'Funkeln: vierzackiger Stern', family: 'scene', w: 7, h: 7, frames: 4, fps: 8, anchor: 'center' },
  { id: 'heart', name: 'Herzchen, ploppt auf', family: 'scene', w: 7, h: 6, frames: 3, fps: 6, anchor: 'center' },

  // ---------------------------------------------------------------- vine ---
  // Leaves for the procedurally grown vines. `_r` points to the upper right, `_l` to the upper left (drawn
  // mirrored by the generator, light kept from the upper left). Frames: layout 'v*3+s' with v the state
  // (0 fresh, 1 faded, 2 wilted, 3 dry and brown) and s the sway (0 rest, 1 bent with the wind, 2 bent further).
  // The wind blows from the left: on every leaf (`_r`, `_l`, hanging) each sway step moves the tip about one
  // pixel to the right, so one gust bends the whole vine the same way.
  // `base`: the pixel where the leaf's stalk meets the stem (put it on the stem's outer column).
  { id: 'leaf_s_r', name: 'Blatt klein, nach rechts', family: 'vine', w: 7, h: 6, frames: 12, fps: 0, anchor: 'topleft', layout: 'v*3+s', points: { base: [0, 5] } },
  { id: 'leaf_s_l', name: 'Blatt klein, nach links', family: 'vine', w: 7, h: 7, frames: 12, fps: 0, anchor: 'topleft', layout: 'v*3+s', points: { base: [5, 6] } },
  { id: 'leaf_m_r', name: 'Blatt mittel, nach rechts', family: 'vine', w: 9, h: 9, frames: 12, fps: 0, anchor: 'topleft', layout: 'v*3+s', points: { base: [0, 8] } },
  { id: 'leaf_m_l', name: 'Blatt mittel, nach links', family: 'vine', w: 9, h: 10, frames: 12, fps: 0, anchor: 'topleft', layout: 'v*3+s', points: { base: [7, 9] } },
  { id: 'leaf_l_r', name: 'Blatt groß, nach rechts', family: 'vine', w: 12, h: 11, frames: 12, fps: 0, anchor: 'topleft', layout: 'v*3+s', points: { base: [0, 10] } },
  { id: 'leaf_l_l', name: 'Blatt groß, nach links', family: 'vine', w: 11, h: 12, frames: 12, fps: 0, anchor: 'topleft', layout: 'v*3+s', points: { base: [10, 11] } },
  { id: 'leaf_hang', name: 'Hängendes Blatt (unter der Statusleiste)', family: 'vine', w: 7, h: 10, frames: 12, fps: 0, anchor: 'topleft', layout: 'v*3+s', points: { base: [3, 0] } },
  // Buds open into flowers: 0 bud, 1 half open, 2 open, 3 full bloom, 4 wilted, 5 dry. Four colours.
  { id: 'flower_w', name: 'Blüte weiß mit gelber Mitte', family: 'vine', w: 9, h: 9, frames: 6, fps: 0, anchor: 'center' },
  { id: 'flower_p', name: 'Blüte rosa', family: 'vine', w: 9, h: 9, frames: 6, fps: 0, anchor: 'center' },
  { id: 'flower_y', name: 'Blüte gelb', family: 'vine', w: 9, h: 9, frames: 6, fps: 0, anchor: 'center' },
  { id: 'flower_b', name: 'Blüte blauviolett', family: 'vine', w: 9, h: 9, frames: 6, fps: 0, anchor: 'center' },
  // Tendril curls at branch tips: 0 tiny hook, 1 half curl, 2 full spiral (growth stages).
  { id: 'curl_r', name: 'Rankenspirale, nach rechts', family: 'vine', w: 6, h: 6, frames: 3, fps: 0, anchor: 'topleft', points: { base: [0, 5] } },
  { id: 'curl_l', name: 'Rankenspirale, nach links', family: 'vine', w: 6, h: 6, frames: 3, fps: 0, anchor: 'topleft', points: { base: [5, 5] } },
  // The knot that parts the rail's tool buttons from its window buttons: 0 bare knot, 1 with leaves, 2 with a flower.
  { id: 'knot', name: 'Rankenknoten zwischen den Knopfgruppen', family: 'vine', w: 21, h: 8, frames: 3, fps: 0, anchor: 'center' },
  { id: 'leaf_fall', name: 'Welkes Blatt, fällt taumelnd', family: 'vine', w: 5, h: 5, frames: 4, fps: 8, anchor: 'center' },
  { id: 'firefly', name: 'Glühwürmchen / Pollenlicht', family: 'vine', w: 3, h: 3, frames: 4, fps: 6, anchor: 'center' },

  // -------------------------------------------------------------- chrome ---
  // Rail button: a rounded octagon of parchment in a gold rim with a dark outline (concept: left-toolbar.png).
  // 0 normal, 1 hover (lighter, a glint on the brighter rim, lifted: its shadow grows), 2 pressed (one pixel down, recessed),
  // 3 selected (deep green fill, gold rim), 4 selected and hovered (brighter green, faint glow inside the rim),
  // 5 disabled (dull). `icon`: top left of the 14 × 14 icon on frames 0, 1, 3, 4, 5 (frame 2 adds one pixel down).
  // The face is rows 0..21 (1..22 pressed); the rows under it hold the drop shadow, which grows on hover.
  { id: 'rail_btn', name: 'Navigationsknopf: normal, Hover, gedrückt, gewählt, gewählt+Hover, gesperrt', family: 'chrome', w: 24, h: 24, frames: 6, fps: 0, anchor: 'topleft', points: { icon: [5, 4] } },
  { id: 'rail_focus', name: 'Tastatur-Fokusring um den Knopf (golden gepunktet)', family: 'chrome', w: 28, h: 26, frames: 1, fps: 0, anchor: 'topleft', points: { at: [-2, -2] } },
  // The arrow tab that sticks out to the right of the selected button (concept: the sprout button): gold with a
  // parchment heart; its column 0 covers the outline of the face's flat side, so it grows out of the rim.
  { id: 'rail_tab', name: 'Pfeillasche am gewählten Knopf: 0 ruhig, 1 leuchtend', family: 'chrome', w: 6, h: 12, frames: 2, fps: 0, anchor: 'topleft', points: { at: [23, 5] } },
  // Count badge (the evolution button's available steps): a gold berry-coin; 0 still, 1–3 pulse. Digits on top.
  { id: 'badge', name: 'Zählabzeichen: 0 ruhig, 1–3 Puls', family: 'chrome', w: 11, h: 11, frames: 4, fps: 8, anchor: 'center' },
  { id: 'digits', name: 'Ziffern 0–9 und + für das Abzeichen (dunkle Tinte)', family: 'chrome', w: 4, h: 6, frames: 11, fps: 0, anchor: 'topleft' },
  // Status bar materials, tiled by the runtime: a dark wood beam (seamless left–right, and up–down too: two
  // planks, so any bar height works), parchment paper (seamless both ways), a 9-slice gold-rimmed parchment
  // panel (corners 4 × 4, edges and centre tiled; rows and columns 4..7 are uniform, so stretching the middle
  // equals tiling it; 0 normal, 1 lit for hover/active), a vertical wood post between panels (seamless
  // up–down) and a brass stud.
  { id: 'wood_tile', name: 'Holzbalken der Statusleiste, nahtlos waagerecht', family: 'chrome', w: 32, h: 16, frames: 1, fps: 0, anchor: 'topleft' },
  { id: 'parch_tile', name: 'Pergament, nahtlos', family: 'chrome', w: 16, h: 16, frames: 1, fps: 0, anchor: 'topleft' },
  { id: 'panel9', name: 'Pergamentfeld mit Goldrand (9-Slice, Ecken 4 × 4): 0 normal, 1 beleuchtet', family: 'chrome', w: 12, h: 12, frames: 2, fps: 0, anchor: 'topleft' },
  { id: 'post_tile', name: 'Holzpfosten zwischen den Feldern, nahtlos senkrecht', family: 'chrome', w: 5, h: 8, frames: 1, fps: 0, anchor: 'topleft' },
  { id: 'stud', name: 'Messingniete', family: 'chrome', w: 5, h: 5, frames: 1, fps: 0, anchor: 'center' },
  // The word mark: GAIA REBORN in chunky pixel capitals, deep green with a light top edge and a dark outline
  // (round the outside only: counters stay open); the I has slab serifs. Drawn for a parchment ground.
  { id: 'logo', name: 'Schriftzug GAIA REBORN', family: 'chrome', w: 90, h: 14, frames: 1, fps: 0, anchor: 'topleft' },
  // Window corners: a vine sprig curling round a window's top corner, growing in when it opens:
  // 0 sprout, 1 short, 2 grown with leaves, 3 grown with a flower. `_l` for the top left corner, `_r` mirrored.
  { id: 'win_corner_l', name: 'Rankenzweig an der linken oberen Fensterecke: 0–3 wächst', family: 'chrome', w: 18, h: 14, frames: 4, fps: 0, anchor: 'topleft' },
  { id: 'win_corner_r', name: 'Rankenzweig an der rechten oberen Fensterecke: 0–3 wächst', family: 'chrome', w: 18, h: 14, frames: 4, fps: 0, anchor: 'topleft' },
  // The handle that folds a window's lower part away (the overview map's globe): a parchment pill in a gold rim
  // with an ink chevron. 0 chevron up (fold away), 1 the same lit (hover, focus), 2 chevron down (unfold), 3 lit.
  { id: 'fold_tab', name: 'Klapplasche: 0 Pfeil hoch, 1 hoch beleuchtet, 2 Pfeil runter, 3 runter beleuchtet', family: 'chrome', w: 21, h: 10, frames: 4, fps: 0, anchor: 'topleft' },

  // --------------------------------------------------------------- icons ---
  // Rail icons, 14 × 14: 0 dark ink on parchment (normal, hover), 1 pale yellow-green on deep green (selected).
  { id: 'ico_examine', name: 'Lupe (Untersuchen)', family: 'icons', w: 14, h: 14, frames: 2, fps: 0, anchor: 'topleft' },
  { id: 'ico_move', name: 'Hand (Verschieben)', family: 'icons', w: 14, h: 14, frames: 2, fps: 0, anchor: 'topleft' },
  { id: 'ico_altitude', name: 'Berg mit Pfeilen (Höhe ändern)', family: 'icons', w: 14, h: 14, frames: 2, fps: 0, anchor: 'topleft' },
  { id: 'ico_plant', name: 'Keimling (Pflanzen)', family: 'icons', w: 14, h: 14, frames: 2, fps: 0, anchor: 'topleft' },
  { id: 'ico_life', name: 'Pfote (Leben ansiedeln)', family: 'icons', w: 14, h: 14, frames: 2, fps: 0, anchor: 'topleft' },
  { id: 'ico_event', name: 'Blitz (Ereignis auslösen)', family: 'icons', w: 14, h: 14, frames: 2, fps: 0, anchor: 'topleft' },
  { id: 'ico_evolution', name: 'DNA-Doppelstrang (Evolution)', family: 'icons', w: 14, h: 14, frames: 2, fps: 0, anchor: 'topleft' },
  { id: 'ico_planet', name: 'Globus (Planet: Modelle und Diagramme)', family: 'icons', w: 14, h: 14, frames: 2, fps: 0, anchor: 'topleft' },
  { id: 'ico_windows', name: 'Offenes Buch (Fenster)', family: 'icons', w: 14, h: 14, frames: 2, fps: 0, anchor: 'topleft' },
  // Status bar icons, 12 × 12, in colour (concept: top-bar.png), one frame each.
  { id: 'hud_energy', name: 'Sonne (Energie Ω)', family: 'icons', w: 12, h: 12, frames: 1, fps: 0, anchor: 'topleft' },
  { id: 'hud_ep', name: 'DNA, violett (Evolutionspunkte)', family: 'icons', w: 12, h: 12, frames: 1, fps: 0, anchor: 'topleft' },
  { id: 'hud_life', name: 'Blatt (Leben)', family: 'icons', w: 12, h: 12, frames: 1, fps: 0, anchor: 'topleft' },
  { id: 'hud_sea', name: 'Wellen (Sauerstoff im Meer)', family: 'icons', w: 12, h: 12, frames: 1, fps: 0, anchor: 'topleft' },
  { id: 'hud_time', name: 'Sanduhr mit Blatt (Erdzeit)', family: 'icons', w: 12, h: 12, frames: 1, fps: 0, anchor: 'topleft' },
  // The altitude brush's choices in the tool dock, 18 × 16, in colour (for the wood tile and the green selected one).
  { id: 'opt_raise', name: 'Schneeberg mit Pfeil hoch (Anheben)', family: 'icons', w: 18, h: 16, frames: 1, fps: 0, anchor: 'topleft' },
  { id: 'opt_lower', name: 'Grünes Tal mit Fluss und Pfeil runter (Absenken)', family: 'icons', w: 18, h: 16, frames: 1, fps: 0, anchor: 'topleft' },
  // The Planet menu's rows, 12 × 12, in colour with a dark selective outline, read on the flyout's dark wood,
  // its lit hover row and its green checked row: the four sphere models above, the four diagrams below.
  { id: 'menu_geo', name: 'Vulkan mit Glut über Gesteinsschichten (Modell Geosphäre)', family: 'icons', w: 12, h: 12, frames: 1, fps: 0, anchor: 'topleft' },
  { id: 'menu_atmo', name: 'Sonne hinter einer Wolke (Modell Atmosphäre)', family: 'icons', w: 12, h: 12, frames: 1, fps: 0, anchor: 'topleft' },
  { id: 'menu_bio', name: 'Laubbaum auf einem Grashügel (Modell Biosphäre)', family: 'icons', w: 12, h: 12, frames: 1, fps: 0, anchor: 'topleft' },
  { id: 'menu_civ', name: 'Häuschen mit rotem Dach und Rauch (Modell Zivilisation)', family: 'icons', w: 12, h: 12, frames: 1, fps: 0, anchor: 'topleft' },
  { id: 'menu_air', name: 'Windwirbel mit Luftbläschen (Diagramm Luftzusammensetzung)', family: 'icons', w: 12, h: 12, frames: 1, fps: 0, anchor: 'topleft' },
  { id: 'menu_biomes', name: 'Tortendiagramm: Wald, Wüste, Meer, Eis (Diagramm Lebensraumanteile)', family: 'icons', w: 12, h: 12, frames: 1, fps: 0, anchor: 'topleft' },
  { id: 'menu_life', name: 'Fisch mit Seetang (Diagramm Lebensformen)', family: 'icons', w: 12, h: 12, frames: 1, fps: 0, anchor: 'topleft' },
  { id: 'menu_tech', name: 'Messing-Zahnrad mit Funke (Diagramm Technologie)', family: 'icons', w: 12, h: 12, frames: 1, fps: 0, anchor: 'topleft' },
  // Controls, 10 × 10, dark ink: 0 normal, 1 lit (pressed or active).
  { id: 'ctl_play', name: 'Weiter', family: 'icons', w: 10, h: 10, frames: 2, fps: 0, anchor: 'topleft' },
  { id: 'ctl_pause', name: 'Pause', family: 'icons', w: 10, h: 10, frames: 2, fps: 0, anchor: 'topleft' },
  { id: 'ctl_gear', name: 'Zahnrad (Spielmenü)', family: 'icons', w: 10, h: 10, frames: 2, fps: 0, anchor: 'topleft' },
  { id: 'ctl_pip', name: 'Tempo-Punkt: 0 aus, 1 an (ein kleines Blatt)', family: 'icons', w: 4, h: 6, frames: 2, fps: 0, anchor: 'topleft' },

  // --------------------------------------------------------------- magic ---
  // The DNA helix is put together by the runtime from these: beads on the two strands at four depths, layout
  // 'd*3+c' with d 0 nearest (large, glossy) … 3 farthest (a dim little cross) and c the light (0 teal, 1 green,
  // 2 violet), and the aura behind the whole helix (additive, like glow).
  { id: 'dna_bead', name: 'Perle des Doppelstrangs: 4 Tiefen (ganz vorn groß … ganz hinten klein) × 3 Lichter (türkis, grün, violett)', family: 'magic', w: 7, h: 7, frames: 12, fps: 0, anchor: 'center', layout: 'd*3+c' },
  { id: 'aura', name: 'Leuchten hinter der Doppelhelix (gerastert): 0–1 wächst, 2–5 atmet (klein … groß)', family: 'magic', w: 39, h: 83, frames: 6, fps: 0, anchor: 'center' },
  { id: 'spark', name: 'Funke, türkis-weiß, funkelt', family: 'magic', w: 5, h: 5, frames: 4, fps: 8, anchor: 'center' },
  { id: 'spark_v', name: 'Funke, violett, funkelt', family: 'magic', w: 5, h: 5, frames: 4, fps: 8, anchor: 'center' },
  // Gathering light motes: layout 'c*3+z', c the light (0 teal, 1 green, 2 violet), z the size (0 small … 2 large).
  { id: 'mote', name: 'Lichtteilchen: 3 Farben × 3 Größen', family: 'magic', w: 3, h: 3, frames: 9, fps: 0, anchor: 'center', layout: 'c*3+z' },
  { id: 'glow', name: 'Weiches Leuchten (gerastert): 0 klein, 1 mittel, 2 groß', family: 'magic', w: 17, h: 17, frames: 3, fps: 0, anchor: 'center' },
  { id: 'comet', name: 'Kopf des Energiestroms, flackert', family: 'magic', w: 9, h: 9, frames: 4, fps: 12, anchor: 'center' },
  { id: 'burst', name: 'Lichtausbruch am Ziel: Ring dehnt sich, zerfällt in Funken', family: 'magic', w: 33, h: 33, frames: 7, fps: 10, anchor: 'center' },

  // ----------------------------------------------------------------- air ---
  // The window "Luftzusammensetzung" (src/airpanel.ts): parchment cards on dark wood, read at 2 CSS px per art px.
  // Molecules as ball-and-stick models in the usual atom colours (O red, N blue, C dark grey, H white), lit from
  // the upper left, with a dark selective outline so the white hydrogen reads on parchment; transparent around.
  { id: 'air_n2', name: 'Stickstoff N₂: zwei blaue Kugeln, Dreifachbindung', family: 'air', w: 20, h: 14, frames: 1, fps: 0, anchor: 'topleft' },
  // The air's oxygen as a gas row like the others, once the sea's iron is used up.
  { id: 'air_o2', name: 'Sauerstoff O₂: zwei rote Kugeln, Doppelbindung', family: 'air', w: 20, h: 14, frames: 1, fps: 0, anchor: 'topleft' },
  { id: 'air_co2', name: 'Kohlendioxid CO₂: dunkelgraues C zwischen zwei roten O, gerade, Doppelbindungen', family: 'air', w: 20, h: 14, frames: 1, fps: 0, anchor: 'topleft' },
  { id: 'air_ch4', name: 'Methan CH₄: dunkelgraues C, vier weiße H als Tetraeder (eins vorn, eins dahinter)', family: 'air', w: 20, h: 14, frames: 1, fps: 0, anchor: 'topleft' },
  { id: 'air_h2o', name: 'Wasserdampf H₂O: rotes O, zwei weiße H im Winkel, ein Dampfwölkchen', family: 'air', w: 20, h: 14, frames: 1, fps: 0, anchor: 'topleft' },
  // The status bar's O₂ and CO₂ (src/livingtopbar.ts): the molecules above, cut to their pixels.
  { id: 'hud_air', name: 'Sauerstoff O₂ der Statusleiste: das Molekül aus air_o2', family: 'air', w: 18, h: 7, frames: 1, fps: 0, anchor: 'topleft' },
  { id: 'hud_co2', name: 'Kohlendioxid CO₂ der Statusleiste: das Molekül aus air_co2', family: 'air', w: 20, h: 6, frames: 1, fps: 0, anchor: 'topleft' },
  { id: 'air_dust', name: 'Staub: schwebende Körner und Flocken in Braun und Grau', family: 'air', w: 20, h: 14, frames: 1, fps: 0, anchor: 'topleft' },
  // The oxygen's way, left to right: iron in the sea binds it first, then it fills the sea, then the air.
  { id: 'air_fe', name: 'Gelöstes Eisen Fe²⁺: rostorange Kugel im Meerwasser, Rostflocken sinken', family: 'air', w: 24, h: 16, frames: 1, fps: 0, anchor: 'topleft' },
  { id: 'air_o2_sea', name: 'O₂ im Meer: O₂-Molekül (zwei rote Kugeln) im Meerwasser mit Bläschen', family: 'air', w: 24, h: 16, frames: 1, fps: 0, anchor: 'topleft' },
  { id: 'air_o2_sky', name: 'O₂ in der Luft: O₂-Molekül vor hellem Himmel mit Wölkchen', family: 'air', w: 24, h: 16, frames: 1, fps: 0, anchor: 'topleft' },
  { id: 'air_arrow', name: 'Goldener Pfeil nach rechts zwischen den Sauerstoff-Stufen', family: 'air', w: 7, h: 7, frames: 1, fps: 0, anchor: 'topleft' },
  // On the change numbers that open a gas balance: the usual sign for "details here".
  { id: 'air_info', name: 'Info-Zeichen: blaue runde Plakette mit weißem i', family: 'air', w: 9, h: 9, frames: 1, fps: 0, anchor: 'topleft' },
  // The two summary cards above the gases.
  { id: 'air_baro', name: 'Barometer: runde Messingdose mit Skala und Zeiger (Luftdruck)', family: 'air', w: 16, h: 16, frames: 1, fps: 0, anchor: 'topleft' },
  { id: 'air_temp', name: 'Thermometer mit roter Säule und Kugel (Mitteltemperatur)', family: 'air', w: 16, h: 16, frames: 1, fps: 0, anchor: 'topleft' },

  // ---------------------------------------------------------------- snow ---
  // Frost for the status bar's temperature cloud (src/livingtopbar.ts) and the snow falling from it over the
  // map (src/cloudsnow.ts). The thermometer is read on a white cloud; the flakes over ocean, ice and rock.
  { id: 'hud_temp', name: 'Thermometer (Temperatur): 0 Säule hoch; 1 kalt (unter 10 °C): Säule tief, große sechsstrahlige Schneeflocke dahinter', family: 'snow', w: 19, h: 17, frames: 2, fps: 0, anchor: 'topleft' },
  { id: 'snow_l', name: 'Große Schneeflocke, sechsstrahlig, taumelt im Fallen', family: 'snow', w: 11, h: 11, frames: 6, fps: 6, anchor: 'center' },
  { id: 'snow_m', name: 'Mittlere Schneeflocke, taumelt im Fallen', family: 'snow', w: 7, h: 7, frames: 4, fps: 6, anchor: 'center' },
  { id: 'snow_s', name: 'Kleine Schneeflocke, funkelt', family: 'snow', w: 5, h: 5, frames: 2, fps: 3, anchor: 'center' },

  // -------------------------------------------------------------- ground ---
  // The stone beam along the screen's bottom edge (src/stonebeam.ts), Gaia's rock standing at its left end.
  // Looks follow the planet like the rock's: 0 bare, 1 first lichen, 2 moss tufts, 3 lush moss, tiny flowers.
  { id: 'beam_tile', name: 'Steinbalken, nahtlos waagerecht aneinander: Bild = Variante · 4 + Aussehen (3 Varianten; 0 kahl, 1 Flechten, 2 Moos, 3 üppig)', family: 'ground', w: 96, h: 14, frames: 12, fps: 0, anchor: 'topleft' },
  { id: 'beam_end', name: 'Anfang des Balkens rechts an Gaias Felsen: runder und kleiner Findling, zur Steinreihe abfallend; 0 kahl … 3 üppig', family: 'ground', w: 44, h: 24, frames: 4, fps: 0, anchor: 'topleft' },
];

/** Most colours one frame may use. Gaia's poses need more than an effect. */
const MAX_COLORS = 24;

module.exports = { FAMILIES, SPRITES, MAX_COLORS, GAIA_W, GAIA_H, FACE };
