/* =============================================================================
 * Gaia Reborn — Gaia's evolution magic (family gaiamagic)
 * -----------------------------------------------------------------------------
 * She props herself on her near elbow and lifts her far hand, palm up, beside
 * her face; a little glowing world floats over it while her hair drifts in
 * the magic breeze; then she lowers it again. Built from gaia-body.js; only
 * the far arm is drawn here (the near shoulder sits too far left of her face
 * for that hand to rise past it, the far one comes up from behind her chin).
 *   gaia_magic_up    0 blink, 1 "oh!" (wide eyes), 2 the forearm lifts off the
 *                    rock, 3 rises past her chin, 4 reaches one pixel high with
 *                    the fingers opening, 5 the hold with its face baked in
 *   gaia_magic_hold  blank face (the runtime draws it); lock tips lift and sway,
 *                    the hem flutters, outline pixels facing the orb turn teal,
 *                    glints wander over the lock tips and the dress
 *   gaia_magic_down  0 the hand closes, she looks back at the planet, 1–2 it
 *                    sinks, 3 gaia_prone frame 0 with a contented smile
 *   gaia_orb         the 9-px world in a soft band: the map turns west to east
 *                    once in 16 frames, the band flares once a second and sends
 *                    a ring of light out, two twinkles circle it
 *   gaia_orb_flare   once as the orb appears: white-hot flash with four rays, a
 *                    ring swelling out (teal heart, violet rim), eight sparks
 * Faces in up and down are gaia.js's own overlay frames, stamped where the
 * runtime puts them. The orb and the flare leave out every pixel that would
 * lie on the held pose, so their light passes behind her.
 * ========================================================================== */
'use strict';

const K = require('./kit');
const C = require('./catalog');
const B = require('./gaia-body');
const G = require('./gaia');

/** Rows [y, x0, pattern] in box coordinates, pattern in gaia-body LEGEND ('.' skips). */
function rows(t, list) {
  for (const [y, x0, pat] of list) {
    for (let i = 0; i < pat.length; i++) if (pat[i] !== '.') K.put(t, x0 + i, y, B.LEGEND[pat[i]]);
  }
  return t;
}

// The far arm on its way up (the near arm stays on the rock and holds her up). Rows [y, x0, pattern]; the
// near hand, chin and face are drawn over them, so only what shows beside her chin needs care.
/** From the elbow on the rock before her chin up beside her face, shared by every raised hand so it never jitters. */
const FOREARM = [
  [29, 59, 'Ssk'],
  [30, 59, 'Ssk'],
  [31, 59, 'Ssk'],
  [32, 58, 'Ssk'],
  [33, 58, 'Ssk'],
  [34, 57, 'Ssk'],
  [35, 56, 'Sssk'],
  [36, 55, 'Sssk'],
  [37, 54, 'sssk'],
  [38, 54, 'kkk'],
];
/** Open, palm up: thumb and fingertips curl up round the orb's glow. */
const HAND_OPEN = [
  [25, 59, 'S..S'],
  [26, 59, 'sSSs'],
  [27, 59, 'kssk'],
  [28, 60, 'sk'],
];
const ARM = {
  // the forearm lifts off the rock, hand curled, beside the near hand
  lift: [
    [35, 57, 'SS'],
    [36, 55, 'sSSs'],
    [37, 54, 'sSssk'],
    [38, 52, 'ssSssk'],
    [39, 50, 'ssssssk'],
    [40, 48, 'kkssssk'],
    [41, 46, 'kkkkkkk'],
  ],
  // the forearm rises past her chin, hand still curled
  rise: [
    [30, 59, 'SS'],
    [31, 58, 'sSSk'],
    [32, 58, 'ssSk'],
    [33, 58, 'Ssk'],
    [34, 57, 'Ssk'],
    [35, 56, 'Ssk'],
    [36, 55, 'Sssk'],
    [37, 54, 'sssk'],
    [38, 53, 'kkkk'],
  ],
  // one pixel above the hold, the fingers opening
  reach: [...HAND_OPEN.map(([y, x, p]) => [y - 1, x, p]), [28, 59, 'Ssk'], ...FOREARM],
  hold: [...HAND_OPEN, ...FOREARM],
  // the hand closes before it sinks
  close: [[26, 60, 'SS'], [27, 59, 'sSSs'], [28, 59, 'kssk'], ...FOREARM],
};

const SPRITE = Object.fromEntries(C.SPRITES.map((s) => [s.id, s]));
const FACE_PARTS = ['gaia_eyes', 'gaia_brows', 'gaia_mouth'];

/** Stamp a face (overlay frames from gaia.js) at the catalog's face point, as the runtime would. */
function bake(t, face) {
  FACE_PARTS.forEach((id, k) => {
    const s = SPRITE[id];
    t.stamp(G.sprites[id](face[k], s), C.FACE[0] + s.points.at[0], C.FACE[1] + s.points.at[1]);
  });
  return t;
}

/** A magic pose: the far arm `arm` ('prone' or a key of ARM), the rest as gaia-body draws it. */
function body({ arm = 'hold', breath = 1, sway = 0, lift = 0, hem = 0, tilt = 0, face = null } = {}) {
  const t = new K.Tex(B.W, B.H);
  if (arm === 'prone') B.arm(t, 'far', 'prone');
  else rows(t, ARM[arm]);
  B.legs(t);
  B.torso(t, { breath, hem });
  B.hairLocks(t, { oy: -breath, sway, lift });
  B.arm(t, 'near', 'prone');
  B.sleeve(t, { oy: -breath });
  B.head(t, { tilt });
  B.flowers(t, { breath });
  B.rim(t);
  return face ? bake(t, face) : t;
}

/**
 * The orb's light on her: outline pixels that face the orb (a transparent neighbour on its side) turn teal,
 * brighter the closer they are; `glints` are single edge pixels that catch the magic, [x, y, tone].
 */
function orbLight(t, glints = []) {
  const [hx, hy] = SPRITE.gaia_magic_hold.points.hand;
  const dark = new Set(['hair0', 'skin0', 'dress0'].map(K.c));
  const out = [];
  for (let y = 0; y < t.h; y++) {
    for (let x = 0; x < t.w; x++) {
      if (!dark.has(t.get(x, y))) continue;
      const d = Math.hypot(hx - x, hy - y);
      if (d > 11) continue;
      const faces = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        const open = nx < 0 || ny < 0 || nx >= t.w || ny >= t.h || t.get(nx, ny) === 0;
        return open && dx * (hx - x) + dy * (hy - y) > 0;
      });
      if (faces) out.push([x, y, d <= 6.5 ? 'glowT3' : d <= 9 ? 'glowT2' : 'glowT1']);
    }
  }
  for (const [x, y, v] of [...out, ...glints]) K.put(t, x, y, v);
  return t;
}

/** The lowest pixel of hair in columns x0..x1 that has open air or outline below it: a lock's tip. */
function tipOf(t, x0, x1) {
  const hair = new Set(K.ramp('hair').slice(1));
  let best = null;
  for (let x = x0; x <= x1; x++) {
    for (let y = t.h - 2; y >= 0; y--) {
      if (!hair.has(t.get(x, y))) continue;
      if (t.get(x, y + 1) !== K.c('hair0') && t.get(x, y + 1) !== 0) continue;
      if (!best || y > best[1]) best = [x, y];
      break;
    }
  }
  return best;
}

/** Lock tips (columns of the three locks) and dress edges that catch the magic, by hold frame: [site, tone]. */
const LOCK_COLS = [[24, 28], [29, 32], [33, 37]];
const DRESS_EDGE = [[24, 35], [11, 41]];
const TWINKLE = [
  [['lock', 0, 'glowT3'], ['dress', 0, 'glowT2']],
  [['lock', 1, 'glowT3'], ['dress', 1, 'glowT2'], ['lock', 0, 'glowT1']],
  [['lock', 2, 'glowT3'], ['dress', 0, 'glowT1']],
  [['lock', 1, 'glowT2'], ['dress', 1, 'glowT3'], ['lock', 2, 'glowT1']],
];

function glints(t, f) {
  const out = [];
  for (const [kind, i, tone] of TWINKLE[f]) {
    const p = kind === 'lock' ? tipOf(t, ...LOCK_COLS[i]) : DRESS_EDGE[i];
    if (p) out.push([p[0], p[1], tone]);
  }
  return out;
}

/** Faces as [eyes, brows, mouth] overlay frames (catalog: gaia_eyes / gaia_brows / gaia_mouth). */
const FACE_BLINK = [4, 1, 0];
const FACE_NOTICE = [7, 1, 3];
const FACE_MAGIC = [2, 1, 1];
const FACE_PLANET = [0, 0, 1];

const UP = [
  { arm: 'prone', breath: 0, face: FACE_BLINK },
  { arm: 'prone', breath: 0, face: FACE_NOTICE },
  { arm: 'lift', breath: 1, face: FACE_MAGIC },
  { arm: 'rise', breath: 1, lift: 1, face: FACE_MAGIC },
  { arm: 'reach', breath: 1, lift: 1, tilt: 1, face: FACE_MAGIC },
  { arm: 'hold', breath: 1, lift: 1, tilt: 1, face: FACE_MAGIC },
];
const HOLD = [
  { lift: 1, sway: 0, hem: 0 },
  { lift: 2, sway: 0, hem: 0 },
  { lift: 2, sway: 1, hem: 1 },
  { lift: 1, sway: 1, hem: 1 },
];
const DOWN = [
  { arm: 'close', breath: 1, lift: 1, tilt: 1, face: FACE_PLANET },
  { arm: 'rise', breath: 1, face: FACE_PLANET },
  { arm: 'lift', breath: 0, face: FACE_PLANET },
  { arm: 'prone', breath: 0, face: FACE_PLANET },
];

/* ------------------------------------------------------------- orb -- */

/** The held pose's first frame: the orb and its flare are centred on `hand` and pass behind her. */
const HOLD_SHAPE = (() => {
  const t = body({ ...HOLD[0], tilt: 1 });
  return orbLight(t, glints(t, 0));
})();

/** Clear what would lie on Gaia: `t` is centred on the held pose's hand point. */
function behindHer(t) {
  const [hx, hy] = SPRITE.gaia_magic_hold.points.hand;
  const cx = Math.floor(t.w / 2);
  const cy = Math.floor(t.h / 2);
  return t.each((x, y) => (HOLD_SHAPE.get(hx + x - cx, hy + y - cy) !== 0 ? 0 : undefined));
}

const TAU = Math.PI * 2;
/** The world's map: land (#) on a 16-column strip round the globe, one row per pixel row; 8 columns face us. */
const LANDS = [
  '................',
  '..##....###.###.',
  '.###....########',
  '..##...#####.##.',
  '...##..####.....',
  '...##...##...##.',
  '....#...#.......',
  '................',
  '................',
];
/** The world's pixel rows, [x0, x1] in the 15-px box: a 9-px disc. */
const WORLD = [[5, 9], [4, 10], [3, 11], [3, 11], [3, 11], [3, 11], [3, 11], [4, 10], [5, 9]];
const WORLD_R = 4.5;
/** Light from the upper left, a little from the front. */
const LIGHT = [-0.55, -0.6, 0.58];

function orb(f, s) {
  const t = new K.Tex(s.w, s.h);
  const c = 7;
  // A soft band hugs the world; once a second it flares and a ring of light swells out of it and fades.
  const phase = f % 8;
  const rp = [5.9, 6.4, 6.9][phase];
  const ringTone = ['glowT3', 'glowT2', 'glowT1'][phase];
  t.each((x, y) => {
    const d = Math.hypot(x - c, y - c);
    if (d <= 4.7) return undefined;
    if (d <= 5.6) return K.c(phase === 0 || phase === 7 ? 'glowT2' : 'glowT1');
    if (ringTone && Math.abs(d - rp) < 0.5) return K.c(ringTone);
    return undefined;
  });
  // Two twinkles circle the world.
  for (const k of [0, 8]) {
    const a = ((f + k) * TAU) / 16 - Math.PI / 2;
    K.put(t, Math.round(c + 6 * Math.cos(a)), Math.round(c + 6 * Math.sin(a)), 'glowT4');
  }
  behindHer(t);
  // The world itself clears her (see `hand`). It turns west to east: the map slides one column a frame.
  WORLD.forEach(([x0, x1], r) => {
    const y = 3 + r;
    const half = (x1 - x0 + 1) / 2;
    const dy = (r - 4) / WORLD_R;
    for (let x = x0; x <= x1; x++) {
      const u = (x + 0.5 - (x0 + half)) / half;
      const col = ((Math.floor((Math.asin(Math.max(-1, Math.min(1, u))) / Math.PI + 0.5) * 8 - f) % 16) + 16) % 16;
      const dx = (x - c) / WORLD_R;
      const nz = Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy));
      const lit = dx * LIGHT[0] + dy * LIGHT[1] + nz * LIGHT[2];
      const rimPx = x === x0 || x === x1 || r === 0 || r === 8;
      let v;
      if (rimPx) v = lit > 0.25 ? 'glowT4' : lit > -0.25 ? 'glowT3' : 'glowT2';
      else if (LANDS[r][col] === '#') v = lit > 0.75 ? 'glowG3' : lit > 0.3 ? 'glowG2' : 'glowG1';
      else v = lit > 0.75 ? 'glowT3' : lit > 0.3 ? 'glowT2' : 'glowT1';
      K.put(t, x, y, v);
    }
  });
  K.put(t, 5, 5, 'glowT5');
  return t;
}

/* ----------------------------------------------------------- flare -- */

/** Pixels of a ring of radius r and width w round the centre c: tone(e, angle), e 0 on the ring's middle .. 1 at its edges, signed by side. */
function ring(t, c, r, w, tone) {
  return t.each((x, y) => {
    const d = Math.hypot(x - c, y - c);
    const e = (d - r) / (w / 2);
    if (Math.abs(e) >= 1) return undefined;
    const v = tone(e, Math.atan2(y - c, x - c));
    return v ? K.c(v) : undefined;
  });
}

/** A four-point spark centred on (x, y): size 2 the full star, 1 a cross, 0 a dot; hot centre, mid arms. */
function spark(t, x, y, size, hot, mid) {
  K.put(t, x, y, hot);
  if (size >= 1) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) K.put(t, x + dx, y + dy, mid);
  if (size >= 2) for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) K.put(t, x + dx, y + dy, mid);
  return t;
}

/**
 * The orb charging, played once as the orb appears: it flashes white-hot with four rays, a ring swells out
 * of it, teal at its heart and violet at its rim, and breaks into eight sparks. Everything that would lie on
 * Gaia is left out: the orb floats over her far hand, so its light passes behind her head.
 */
function flare(f, s) {
  const t = new K.Tex(s.w, s.h);
  const c = Math.floor(s.w / 2);
  if (f === 0) {
    const o = c - 7;
    WORLD.forEach(([x0, x1], r) => {
      for (let x = x0; x <= x1; x++) K.put(t, x + o, 3 + r + o, x === x0 || x === x1 || r === 0 || r === 8 ? 'glowT4' : 'glowT5');
    });
    ring(t, c, 6, 1.6, () => 'glowT4');
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ['glowT5', 'glowT4', 'glowT3'].forEach((v, k) => K.put(t, c + dx * (7 + k), c + dy * (7 + k), v));
    }
    return behindHer(t);
  }
  const R = [0, 7.4, 9, 10.2, 10.6, 11.3][f];
  if (f <= 3) {
    const w = [0, 2.4, 2, 1.6][f];
    ring(t, c, R, w, (e, a) => {
      if (f === 3) {
        // Breaking up: eight arcs, gaps where the sparks will not be.
        const k = (((a / TAU) * 8 + 0.5) % 1 + 1) % 1;
        if (Math.abs(k - 0.5) > 0.28) return null;
      }
      if (e > 0.2) return f === 1 ? 'glowV3' : 'glowV2';
      if (e > -0.4) return f === 1 ? 'glowT5' : f === 2 ? 'glowT4' : 'glowT3';
      return f === 1 ? 'glowT3' : 'glowT2';
    });
    if (f === 1) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) K.put(t, c + dx * 11, c + dy * 11, 'glowT3');
  }
  if (f >= 3) {
    for (let i = 0; i < 8; i++) {
      const a = (i * TAU) / 8;
      const x = Math.round(c + R * Math.cos(a));
      const y = Math.round(c + R * Math.sin(a));
      const violet = i % 2 === 1;
      const size = [0, 0, 0, 1, 2, 0][f];
      spark(t, x, y, size, violet ? 'glowV4' : 'glowT5', violet ? 'glowV3' : 'glowT3');
    }
  }
  return behindHer(t);
}

module.exports = {
  sprites: {
    gaia_magic_up: (f) => body(UP[f]),
    gaia_magic_hold: (f) => {
      const t = body({ ...HOLD[f], tilt: 1 });
      return orbLight(t, glints(t, f));
    },
    gaia_magic_down: (f) => body(DOWN[f]),
    gaia_orb: orb,
    gaia_orb_flare: flare,
  },
};
