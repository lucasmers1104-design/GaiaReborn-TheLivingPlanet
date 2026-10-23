/* =============================================================================
 * Gaia Reborn — Gaia's moods (family gaiamood)
 * -----------------------------------------------------------------------------
 * Four looping poses on her rock, built from gaia-body.js, each with a blank
 * face at its own points.face (the runtime adds gaia_eyes / brows / mouth /
 * blush there). The head of a pose never moves between its frames, so the
 * face overlays never jitter.
 *   gaia_kick    joy: prone, the feet kick in turn, body and hair bob with
 *                each kick, the near hand pats the rock once per cycle
 *   gaia_chin    worry: chin propped in both hands, shoulders drawn up, the
 *                feet and hair sway slowly
 *   gaia_slump   sadness, exhaustion: chest down on the rock, head on her
 *                folded arms, legs sunk, the hair draped over her back with
 *                faded tips, the hem wilted; a slow sigh
 *   gaia_lookup  hope: head lifted to the sky at the upper right, the far hand
 *                half raised, palm up, to catch the first light
 * ========================================================================== */
'use strict';

const K = require('./kit');
const B = require('./gaia-body');

const [HX, HY] = B.PRONE.head;

/* ------------------------------------------------------------- kick -- */
// One cycle of 6 frames: the near foot is up front on 0, the far one on 3 (it swings less forward: the hair hides it).
const KICK = {
  near: [2, 1, -1, -2, -1, 1],
  far: [-2, -1, 0, 1, 0, -1],
  bob: [1, 0, 0, 1, 0, 0],
  lift: [0, 1, 0, 0, 1, 0],
  sway: [0, 0, 1, 0, 0, 1],
  hem: [0, 1, 0, 0, 1, 0],
  pat: [0, 0, 1, 0, 0, 0],
};
// The near forearm with the hand lifted from the wrist, about to pat the rock.
const NEAR_PAT = B.grid([
  'LSs..........',
  'LSs..........',
  'LSs..........',
  'LSs.......Ls.',
  'LSs......LSSs',
  'LSs.....LSSs.',
  'LSSLLLLLSSs..',
  'sSSSSSSSSSs..',
  'kssssssssss..',
  '.kkkkkkkkk...',
], 'arm near pat');

function kick(f) {
  const b = KICK.bob[f];
  const t = new K.Tex(B.W, B.H);
  B.arm(t, 'far', 'prone');
  B.legs(t, { near: KICK.near[f], far: KICK.far[f] });
  B.torso(t, { breath: b, hem: KICK.hem[f] });
  B.hairLocks(t, { oy: -b, sway: KICK.sway[f], lift: KICK.lift[f] });
  if (KICK.pat[f]) t.stamp(NEAR_PAT, 41, 37);
  else B.arm(t, 'near', 'prone');
  B.sleeve(t, { oy: -b });
  B.head(t);
  B.flowers(t, { breath: b });
  return B.rim(t);
}

/* ------------------------------------------------------------- chin -- */
const CHIN = {
  near: [0, 1, 1, 0],
  far: [1, 0, 0, 1],
  sway: [0, 0, 1, 1],
  hem: [0, 1, 1, 0],
};
// The far forearm right behind the near one (a shaded strip along its right side), the far hand beside the near one under her chin.
const FAR_CHIN = B.grid([
  '.........SSSs.',
  '........sSSSsk',
  '........ssSsk.',
  '......sssk....',
  '.....ssk......',
  '....ssk.......',
  '...ssk........',
  '..ssk.........',
  '.ssk..........',
  'ssk...........',
  'kkk...........',
], 'arm far chin');

function chin(f) {
  const t = new K.Tex(B.W, B.H);
  B.legs(t, { near: CHIN.near[f], far: CHIN.far[f] });
  B.torso(t, { breath: 1, hem: CHIN.hem[f] });
  t.stamp(FAR_CHIN, 44, 34);
  B.hairLocks(t, { oy: -1, sway: CHIN.sway[f] });
  B.arm(t, 'near', 'chin');
  B.sleeve(t, { oy: -2 });
  B.head(t);
  B.flowers(t, { breath: 1 });
  chinShadow(t, HX, HY);
  return B.rim(t);
}

/** The shadow her chin casts on what it rests on, so chin and hands never merge. */
function chinShadow(t, hx, hy) {
  for (let x = hx + 13; x <= hx + 17; x++) if (t.get(x, hy + 20)) K.put(t, x, hy + 20, 'skin1');
  return t;
}

/* ------------------------------------------------------------ slump -- */
const SLUMP_DROP = 5;
const SLUMP_HEAD = [HX, HY + SLUMP_DROP];
const SIGH = [0, 1, 1, 0];
/** How far the shins sink: the knees bend less, the feet hang lower. */
const SHIN_SINK = 3;
const THIGH_TOP = B.PRONE.legs[1] + 16;
// The torso flat on the rock: chest and shoulders 3 px lower than prone, the hips as they were.
const TORSO_SLUMP = [
  [37, 21, 26], [38, 20, 28], [38, 41, 45], [39, 19, 29], [39, 36, 46],
  [40, 16, 47], [41, 13, 47], [42, 11, 47], [43, 14, 47], [44, 13, 47], [45, 12, 47], [46, 15, 46],
];
const DRESS_TONES = ['dress4', 'dress3', 'dress3', 'dress2', 'dress2', 'dress2', 'dress1', 'dress1'];
// The near arm folded flat in front of her: a short upper arm, the hand over the far wrist.
const NEAR_FOLD = B.grid([
  'LSs..........',
  'LSs..........',
  'LSs.....LLLs.',
  'LSSLLLLLSSSSs',
  'sSSSSSSSSSSSs',
  'ksssssssssss.',
  '.kkkkkkkkkk..',
], 'arm near fold');
/** Hair this far from where the locks leave her head has faded. */
const FADE_FROM = 16;
/** The skirt leaves' tips have wilted: their last pixels from the left end, on the rows from SKIRT_TOP down. */
const WILT_TIP = 4;
const SKIRT_TOP = 40;

function slumpTorso(t, s) {
  const rows = TORSO_SLUMP.map(([y, x0, x1]) => [y < 44 ? y - s : y, x0, x1]);
  if (s) rows.push([43, 14, 47]);
  B.shade(t, rows, DRESS_TONES);
  K.line(t, 31, 42 - s, 14, 43, 'dress0');
  K.line(t, 28, 39 - s, 14, 41 - s, 'dress4');
  K.line(t, 30, 44, 14, 45, 'dress3');
  return B.dots(t, [[44, 39 - s, 'h'], [45, 39 - s, 'g'], [46, 40 - s, 'h'], [47, 40 - s, 'g']]);
}

/** The legs with the shins sunk: drawn as prone, the shins and feet moved down under the thighs. */
function sunkLegs(t, near, far) {
  const l = new K.Tex(B.W, B.H);
  B.legs(l, { near, far });
  for (let y = 0; y < THIGH_TOP; y++) for (let x = 0; x < B.W; x++) if (l.get(x, y)) t.set(x, y + SHIN_SINK, l.get(x, y));
  for (let y = THIGH_TOP; y < B.H; y++) for (let x = 0; x < B.W; x++) if (l.get(x, y)) t.set(x, y, l.get(x, y));
  return t;
}

/** Recolour the pixels of ramp `from` where `inside(x, y)`: step → name in `map`. */
function tint(t, from, map, inside) {
  const steps = new Map(K.ramp(from).map((v, s) => [v, s]));
  return t.each((x, y) => {
    const s = steps.get(t.get(x, y));
    if (s === undefined || !map[s] || !inside(x, y)) return undefined;
    return K.c(map[s]);
  });
}

function slump(f) {
  const s = SIGH[f];
  const [hx, hy] = SLUMP_HEAD;
  const t = new K.Tex(B.W, B.H);
  B.arm(t, 'far', 'prone');
  sunkLegs(t, -1, -1);
  slumpTorso(t, s);
  B.hairLocks(t, { oy: SLUMP_DROP - s, lift: -1 });
  t.stamp(NEAR_FOLD, 41, 40);
  B.sleeve(t, { oy: 3 - s });
  B.head(t, { x: hx, y: hy, tilt: -1 });
  B.flowers(t, { oy: SLUMP_DROP, breath: s });
  chinShadow(t, hx, hy);
  // Tinted after rim(), so the outline stays hair0 / dress0, and the shine (hair6, petalY1) goes out of her
  // hair and flowers: that keeps the frame within MAX_COLORS.
  B.rim(t);
  const [cx, cy] = [hx + 5, hy + 5 - s];
  tint(t, 'hair', { 1: 'faded1', 2: 'faded1', 3: 'faded2', 4: 'faded3', 5: 'faded3', 6: 'faded3' }, (x, y) => Math.hypot(x - cx, y - cy) > FADE_FROM);
  tint(t, 'hair', { 6: 'hair5' }, () => true);
  tint(t, 'petalY', { 1: 'petalY2' }, () => true);
  const left = (y) => { for (let x = 0; x < B.W; x++) if (K.ramp('dress').includes(t.get(x, y))) return x; return B.W; };
  const tips = Array.from({ length: B.H }, (_, y) => left(y));
  tint(t, 'dress', { 2: 'wilt2', 3: 'wilt3', 4: 'wilt3' }, (x, y) => y >= SKIRT_TOP && x < tips[y] + WILT_TIP);
  return t;
}

/* ----------------------------------------------------------- lookup -- */
const LOOK_RISE = 2;
const LOOK_HEAD = [HX, HY - LOOK_RISE];
const LOOK = {
  hand: [0, 1, 1, 0],
  sway: [0, 1, 1, 0],
  hem: [0, 0, 1, 1],
};
// The far arm raised behind her chin: elbow on the rock, forearm up and forward, the palm cupped upwards, lit.
const FAR_REACH = B.grid([
  '.................',
  '............L...L',
  '............SLLLS',
  '...........SSSSSs',
  '.........SSSssss.',
  '........SSsk.....',
  '.......SSsk......',
  '......SSsk.......',
  '.....SSsk........',
  '....SSsk.........',
  '...SSsk..........',
  '..SSsk...........',
  '.SSsk............',
  'kkkk.............',
], 'arm far reach');

function lookup(f) {
  const [hx, hy] = LOOK_HEAD;
  const t = new K.Tex(B.W, B.H);
  t.stamp(FAR_REACH, 46, 30 - LOOK.hand[f]);
  B.legs(t);
  B.torso(t, { breath: 1, hem: LOOK.hem[f] });
  B.hairLocks(t, { oy: -1, sway: LOOK.sway[f] });
  B.arm(t, 'near', 'prone');
  B.sleeve(t, { oy: -1 });
  B.head(t, { x: hx, y: hy, tilt: 1 });
  B.flowers(t, { oy: -LOOK_RISE, breath: -1 });
  return B.rim(t);
}

module.exports = {
  sprites: {
    gaia_kick: (f) => kick(f),
    gaia_chin: (f) => chin(f),
    gaia_slump: (f) => slump(f),
    gaia_lookup: (f) => lookup(f),
  },
};
