/* =============================================================================
 * Gaia Reborn — Gaia prone on her rock, and her face (family gaia)
 * -----------------------------------------------------------------------------
 * gaia_prone: the reference pose from gaia-body.js. She lies on her belly on
 * the top of her rock, propped on her elbows, chin up, looking right towards
 * the planet; her lower legs are bent up behind her, bare feet in the air.
 * Blank face (the runtime adds the overlays at points.face). Four frames at
 * 4 fps: 0 rest; 1–2 breathing in (back, shoulders and the hair on them 1 px
 * up); the lock tips swing on 2–3 and the hem on 1–2. The head and the flower
 * in it never move, so the face overlays never jitter.
 *
 * Face overlays, each drawn with its top left at points.face + points.at, all
 * in the same 12-px-wide eyes box: the near (left) eye in columns 0–3, the far
 * eye in 7–10, so brows, blush and mouth line up with them.
 *   gaia_eyes   10 variants, 4 px tall (5 when wide or teary): dark green iris,
 *               a 1-px highlight, a dark upper lash line
 *   gaia_brows  4 variants on the forehead between the fringe locks
 *   gaia_mouth  8 variants, under and right of the eyes (3/4 view)
 *   gaia_blush  one: soft pink under each eye
 * ========================================================================== */
'use strict';

const K = require('./kit');
const B = require('./gaia-body');

const FACE_LEGEND = {
  K: 'ink0', I: 'hair0', i: 'hair2', g: 'hair4', o: 'glowT5', W: 'white0', b: 'ice3', B: 'ice4',
  m: 'skin0', r: 'red0', t: 'petal1', p: 'petal2', q: 'petal3', n: 'hair0',
};

function box(w, h, rows) {
  const t = new K.Tex(w, h);
  return t.stamp(K.grid(rows, FACE_LEGEND), 0, 0);
}

const EYES = [
  // 0 open, looking right (towards the planet)
  ['KKKK...KKKK.', 'WIoI...WIoI.', 'WIII...WIII.', '.igi....igi.'],
  // 1 open, looking at the viewer
  ['KKKK...KKKK.', 'IoIW...IoIW.', 'IIII...IIII.', 'igi....igi..'],
  // 2 open, looking up
  ['KKKK...KKKK.', 'IoIi...IoIi.', 'IIIg...IIIg.', 'WWW....WWW..'],
  // 3 half closed
  ['............', 'KKKK...KKKK.', 'IoII...IoII.', '.igi....igi.'],
  // 4 closed (blink, asleep)
  ['............', '............', '.KKK....KKK.', 'K......K....'],
  // 5 happy ^^
  ['............', '.KK.....KK..', 'K..K...K..K.', '............'],
  // 6 sad, closed, teary
  ['............', '............', 'KKK....KKK..', '...b......b.'],
  // 7 wide, amazed: taller, two highlights
  ['KKKK...KKKK.', 'IoII...IoII.', 'IIII...IIII.', 'IIoI...IIoI.', '.gg.....gg..'],
  // 8 teary: open, a bright brim and a drop
  ['KKKK...KKKK.', 'WIoI...WIoI.', 'WIII...WIII.', '.BbB....BbB.', '..b.......b.'],
  // 9 looking down
  ['............', 'KKKK...KKKK.', 'WIII...WIII.', 'WIoI...WIoI.'],
];
const BROWS = [
  // 0 calm, 1 raised, 2 worried (inner ends up), 3 sad (outer ends down)
  ['............', '.nnn...nnn..'],
  ['.nnn...nnn..', '............'],
  ['...n...n....', '.nn.....nn..'],
  ['..nn...nn...', 'nn.......nn.'],
];
const MOUTHS = [
  ['..mm..'],
  ['.m..m.', '..mm..'],
  ['.mmmm.', '.mrtm.', '..mm..'],
  ['..mm..', '.mrrm.', '..mm..'],
  ['..mm..', '.m..m.'],
  ['.m.m..', '..m.m.'],
  ['...m..'],
  ['..mm..', '.mrrm.', '.m..m.'],
];

const BREATH = [0, 1, 1, 0];
const SWAY = [0, 0, 1, 1];
const HEM = [0, 1, 1, 0];

module.exports = {
  sprites: {
    gaia_prone: (f) => B.prone({ breath: BREATH[f], sway: SWAY[f], hem: HEM[f] }),
    gaia_eyes: (f, s) => box(s.w, s.h, EYES[f]),
    gaia_brows: (f, s) => box(s.w, s.h, BROWS[f]),
    gaia_mouth: (f, s) => box(s.w, s.h, MOUTHS[f]),
    gaia_blush: (f, s) => box(s.w, s.h, ['qpq....qpq..']),
  },
};
