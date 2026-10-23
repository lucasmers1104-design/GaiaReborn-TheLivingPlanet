/* =============================================================================
 * Gaia Reborn — Gaia asleep on the bare rock, and her waking (family gaiasleep)
 * -----------------------------------------------------------------------------
 * gaia_sleep: before the first life she sleeps curled on her left side,
 * facing the viewer: knees drawn up, cheek on her hands, eyes closed with a
 * little smile, her leafy hair over her back and spread on the stone. 0–3
 * breathe (the locks on her back rise 1 px, the lock over her shoulder a
 * frame later); 4–5 stir once (knee drawn up, head nestled into her hand, a
 * wider smile, then settling).
 * gaia_wake: frame 0 is gaia_sleep 0; her eyes flutter, she lifts her head,
 * looks left, then right towards the planet, blinks, yawns and stretches onto
 * her belly, pushes up onto her elbows; the last frame is gaia_prone 0 with
 * gaia_eyes 0 and gaia_mouth 1 stamped on, pixel for pixel what the runtime
 * shows next. Faces are baked in: the tilted sleeping face is drawn here,
 * the upright ones are gaia.js's own overlays. Built from gaia-body.js.
 * ========================================================================== */
'use strict';

const K = require('./kit');
const B = require('./gaia-body');
const G = require('./gaia');
const C = require('./catalog');

const CAT = Object.fromEntries(C.SPRITES.map((s) => [s.id, s]));

/* ------------------------------------------------------- tilted head -- */

/** Three-shear rotation: every pixel lands on exactly one pixel, no new colours. */
function rotate(src, deg, cx, cy) {
  const th = (deg * Math.PI) / 180;
  const a = -Math.tan(th / 2);
  const b = Math.sin(th);
  const out = new K.Tex(src.w, src.h);
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const v = src.px[y * src.w + x];
      if (!v) continue;
      let X = x - cx;
      let Y = y - cy;
      X += Math.round(a * Y);
      Y += Math.round(b * X);
      X += Math.round(a * Y);
      out.set(X + cx, Y + cy, v);
    }
  }
  return out;
}

/** The upright head's two sprouts (rows 0–2 of its grid), drawn again after the tilt so they stay whole. */
const SPROUT = B.grid([
  '...56.....65',
  '45...45.54..',
  '4......3....',
], 'sprout');

/** The head with a blank face, tilted `deg` clockwise about the face centre, its upright top left at (x, y). */
function tiltedHead(t, x, y, deg) {
  const pad = 4;
  const h = new K.Tex(30, 28);
  B.head(h, { x: pad, y: pad });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 22; c++) h.set(pad + c, pad + r, 0);
  t.stamp(rotate(h, deg, pad + 14, pad + 13), x - pad, y - pad);
  return t.stamp(SPROUT, x + 8, y - 1);
}

/* -------------------------------------------------------- the curl -- */

const DRESS_TONES = ['dress4', 'dress3', 'dress3', 'dress2', 'dress2', 'dress2', 'dress1', 'dress1'];
/** Her hip and side in the leaf dress, the hip the highest point of the curl; the chest goes on under the hair. */
const TORSO = [
  [32, 18, 23], [33, 16, 26], [34, 15, 36], [35, 14, 36], [36, 13, 36], [37, 12, 36], [38, 12, 36], [39, 11, 36],
  [40, 11, 36], [41, 10, 36], [42, 10, 36], [43, 9, 36], [44, 9, 35], [45, 9, 34], [46, 10, 33],
];
/** The skirt's leaves overlap like shingles: each lower edge catches the light, its shadow falls just below. */
const SKIRT = [
  ['dress3', [[11, 39], [15, 37], [20, 36], [25, 36], [27, 37]]],
  ['dress0', [[11, 40], [15, 38], [20, 37], [25, 37], [28, 38]]],
  ['dress3', [[9, 43], [14, 41], [19, 40], [24, 41]]],
  ['dress0', [[9, 44], [14, 42], [19, 41], [24, 42]]],
];

/** Her upper leg drawn up: thigh out of the skirt to the knee, the shin folded back, the foot; top left at (8, 36). */
const LEG = B.grid([
  '..................LLLLs...',
  '............LLLLLLLSSSSs..',
  '...........LSSSSSSSSSSSSs.',
  '...........sSSSSSSSSSSSSs.',
  '............ssssssssSSSs..',
  '....................SSSs..',
  '......LLs.........LSSs....',
  '....LLSSSs.....LLLSSs.....',
  '...LSSSSSSLLLLLSSSs.......',
  '..LSSSSSSSSSSSSss.........',
  '..skkkkkkkkkkk............',
], 'sleep leg');

/** Forearm under her cheek and the hand, fingers curled against it, top left at (37, 39). */
const ARM = B.grid([
  '..............LLs...',
  '.............LSSSs..',
  '...kkkkk....LSSSSSs.',
  '..kssssss..LSSkSSSs.',
  'LLLLLLLLLLLSSSSkSSs.',
  'sSSSSSSSSSSSSSSSSSs.',
  'sSSSSSSSSSSSSSSSSs..',
  '.kkkkkkkkkkkkkkkkk..',
], 'sleep arm');

/** Her collar and neck, seen once she lifts her head off her hand. */
const COLLAR = [[38, 42, 48], [39, 41, 48], [40, 40, 48], [41, 39, 48], [42, 39, 47]];

const HAIR_TONES = ['hair5', 'hair4', 'hair4', 'hair3', 'hair3', 'hair2'];
/** Front lock: falls over her shoulder and arm and spreads on the stone. */
const LOCK_FRONT = [[34, 40, 41], [35, 38, 41], [36, 36, 41], [37, 35, 41], [38, 34, 41], [39, 33, 41], [40, 33, 41], [41, 32, 41],
  [42, 32, 41], [43, 31, 40], [44, 30, 40], [45, 28, 40], [46, 25, 40]];
/** Two locks over her shoulder and back, tips at her waist; the upper one last. */
const LOCKS_BACK = [
  [[30, 39, 41], [31, 37, 41], [32, 34, 41], [33, 31, 41], [34, 29, 40], [35, 27, 39], [36, 26, 37], [37, 26, 34], [38, 27, 30]],
  [[25, 39, 41], [26, 36, 41], [27, 33, 41], [28, 30, 41], [29, 28, 40], [30, 26, 38], [31, 24, 36], [32, 23, 33], [33, 22, 29],
    [34, 22, 26], [35, 23, 24]],
];
const LOCK_SHINE = [[37, 26, '6'], [36, 26, '6'], [34, 27, '6'], [32, 28, '5'], [30, 29, '5'], [38, 31, '5'], [36, 32, '5']];

const FLOWER_S = B.grid(['.w.', 'wyw', '.w.'], 'flower s');
/** gaia-body's flowers; the big one with a plain centre, so a face with open eyes stays within the colour budget. */
const FLOWER_M = B.grid(['.ww.', 'wyyw', 'wyyp', '.pp.'], 'flower m');

const FACE_LEGEND = { K: 'ink0', I: 'hair0', m: 'skin0', p: 'petal2', q: 'petal3' };
const face = (t, rows, x, y) => t.stamp(K.grid(rows, FACE_LEGEND), x, y);

/** The tilted face: blush, eyes 'shut' | 'half', mouth 'smile' | 'calm' | 'grin'; (dx, dy) moves it with the head. */
const TILT_EYES = { shut: ['K...', '.KKK'], half: ['KKKK', '.II.'] };
const TILT_MOUTH = { smile: ['m..', '.mm'], calm: ['.mm'], grin: ['m..m', '.mm.'] };
function tiltFace(t, eyes, mouth, dx = 0, dy = 0) {
  face(t, ['qp'], 43 + dx, 37 + dy);
  face(t, ['pq'], 51 + dx, 38 + dy);
  face(t, TILT_EYES[eyes], 43 + dx, 34 + dy);
  face(t, TILT_EYES[eyes], 50 + dx, 35 + dy);
  return face(t, TILT_MOUTH[mouth], 47 + dx, 39 + dy);
}

/** The runtime's own face overlays (gaia.js) on an upright head whose face point is (fx, fy). */
function overlays(t, fx, fy, { eyes, brows = 0, mouth, blush = false }) {
  const put = (id, f) => {
    const s = CAT[id];
    t.stamp(G.sprites[id](f, s), fx + s.points.at[0], fy + s.points.at[1]);
  };
  if (blush) put('gaia_blush', 0);
  put('gaia_eyes', eyes);
  put('gaia_brows', brows);
  put('gaia_mouth', mouth);
  return t;
}

/**
 * The curl. breath lifts the locks over her back, front the upper half of the lock over her arm;
 * knee [dx, dy] moves the knee, shin and foot; nestle moves the tilted head; `up` [x, y] puts the
 * upright head there instead (lifted off her hand), its locks raised by `lift`.
 */
function curl({ breath = 0, front = 0, knee = [0, 0], nestle = 0, up = null, lift = 0 } = {}) {
  const t = new K.Tex(B.W, B.H);
  B.shade(t, TORSO, DRESS_TONES);
  for (const [col, pts] of SKIRT) for (let i = 1; i < pts.length; i++) K.line(t, ...pts[i - 1], ...pts[i], col);
  t.stamp(ARM, 37, 39);
  const fl = LOCK_FRONT.map(([y, a, b]) => [y <= 40 ? y - front : y, a, b]);
  if (front) fl.push([40, 33, 41]);
  B.shade(t, fl, HAIR_TONES, { crease: 'hair1' });
  const oy = -breath - lift;
  for (const lock of LOCKS_BACK) B.shade(t, lock, HAIR_TONES, { oy, crease: 'hair1' });
  B.dots(t, LOCK_SHINE, 0, oy);
  t.stamp(LEG, 8 + knee[0], 36 + knee[1]);
  if (up) {
    B.shade(t, COLLAR, DRESS_TONES);
    B.head(t, { x: up[0], y: up[1] });
    t.stamp(FLOWER_M, up[0] + 2, up[1] + 5);
  } else {
    tiltedHead(t, 34 + nestle, 23, 16);
    t.stamp(FLOWER_M, 38 + nestle, 25);
  }
  t.stamp(FLOWER_S, 28, 30 + oy);
  t.stamp(FLOWER_S, 33, 34 + oy);
  return B.rim(t);
}

/** Rolled onto her belly with a stretch: the prone pose with her head low and the shins half up. */
function stretch(swing) {
  const t = new K.Tex(B.W, B.H);
  B.arm(t, 'far', 'prone');
  B.legs(t, { near: swing, far: swing });
  B.torso(t, {});
  B.hairLocks(t, { oy: 2, sway: -1 });
  B.arm(t, 'near', 'prone');
  B.sleeve(t, {});
  B.head(t, { x: B.PRONE.head[0], y: B.PRONE.head[1] + 3 });
  t.stamp(FLOWER_M, 39, 24);
  t.stamp(FLOWER_S, 29, 27);
  t.stamp(FLOWER_S, 32, 32);
  return B.rim(t);
}

const upFace = (t, head, face) => overlays(t, head[0] + B.FACE_IN_HEAD[0], head[1] + B.FACE_IN_HEAD[1], face);
const LIFTED = [35, 21];
const UP = [35, 20];
const PEEK = [36, 20];

/** 0–3 breathe: back, then the shoulder; 4–5 the stir. */
const SLEEP = [
  () => tiltFace(curl(), 'shut', 'smile'),
  () => tiltFace(curl({ breath: 1 }), 'shut', 'smile'),
  () => tiltFace(curl({ breath: 1, front: 1 }), 'shut', 'smile'),
  () => tiltFace(curl({ front: 1 }), 'shut', 'smile'),
  () => tiltFace(curl({ breath: 1, front: 1, knee: [1, -1], nestle: 1 }), 'shut', 'grin', 1),
  () => tiltFace(curl({ breath: 1, knee: [1, 0] }), 'shut', 'smile'),
];

const LOW = [B.PRONE.head[0], B.PRONE.head[1] + 3];

/** Flutter, lift, look left, look right towards the planet, blink, yawn and stretch, push up, smile. */
const WAKE = [
  SLEEP[0],
  () => tiltFace(curl(), 'half', 'calm'),
  () => tiltFace(curl(), 'shut', 'calm'),
  () => tiltFace(curl(), 'half', 'calm'),
  () => upFace(curl({ up: LIFTED, lift: 1 }), LIFTED, { eyes: 3, mouth: 0 }),
  () => upFace(curl({ up: UP, lift: 2 }), UP, { eyes: 1, mouth: 0 }),
  () => upFace(curl({ up: UP, lift: 2 }), UP, { eyes: 1, brows: 1, mouth: 3 }),
  () => upFace(curl({ up: PEEK, lift: 2 }), PEEK, { eyes: 0, brows: 1, mouth: 3 }),
  () => upFace(curl({ up: PEEK, lift: 2 }), PEEK, { eyes: 0, brows: 1, mouth: 1 }),
  () => upFace(curl({ up: PEEK, lift: 2 }), PEEK, { eyes: 4, brows: 1, mouth: 1 }),
  () => upFace(stretch(-2), LOW, { eyes: 5, mouth: 3 }),
  () => upFace(stretch(-1), LOW, { eyes: 5, mouth: 3 }),
  () => overlays(B.prone({ breath: 1 }), ...B.FACE_PRONE, { eyes: 0, brows: 1, mouth: 1 }),
  () => overlays(B.prone(), ...B.FACE_PRONE, { eyes: 0, mouth: 1 }),
];

module.exports = {
  sprites: {
    gaia_sleep: (f) => SLEEP[f](),
    gaia_wake: (f) => WAKE[f](),
  },
};
