/* =============================================================================
 * Gaia Reborn — Gaia's body, part by part (shared by every Gaia artist)
 * -----------------------------------------------------------------------------
 * Every Gaia pose (gaia.js, gaiasleep.js, gaiamood.js, gaiamagic.js) is built
 * from these parts, so her head, hair, dress and skin are the same in each.
 * All coordinates are art pixels in the shared 64 × 48 body box (GAIA_W ×
 * GAIA_H, foot anchor (32, 47) on the rock); `prone()` is the reference pose
 * and PRONE holds where each part sits in it. Draw parts back to front into
 * one Tex, then call rim() once: parts carry no outer outline, rim() puts a
 * 1-px selective outline (the darkest step of the neighbour's own ramp:
 * hair0, skin0, dress0) round the whole figure. Leave the bottom row empty
 * of interior: rim() outlines the body's underside on row 47, the rock contact.
 *
 * API
 *   W, H, LEGEND            box size; grid characters → palette names:
 *                           hair 0–6 (0 darkest), skin K k s S L W (K darkest),
 *                           dress d e f g h (d darkest), flowers w p (petals) y Y (centre)
 *   grid(rows, name)        Tex from equally wide rows in LEGEND ('.' transparent)
 *   shade(t, spans, tones, { ox, oy, crease })
 *                           fill [y, x0, x1] spans (x1 included), shaded per column:
 *                           the top pixel of each column lit, the bottom one dark
 *                           (`tones` light → dark); `crease` colours bottom pixels that
 *                           lie on something already drawn (a lock over a lock)
 *   dots(t, [[x, y, ch]], ox, oy)   single hand-placed pixels in LEGEND
 *   rim(t)                  the selective outline; call last
 *   head(t, { x, y, tilt }) head with a BLANK face, top left at (x, y) (prone: PRONE.head);
 *                           face point = (x, y) + FACE_IN_HEAD; tilt -1 | 0 | 1 shears the
 *                           hair cap 1 px forward | – | back (1 = chin up, looking up);
 *                           the face rows never move, so the overlays stay put
 *   hairLocks(t, { ox, oy, sway, lift })
 *                           the three leaf-shaped locks flowing back over her shoulders
 *                           (draw before head()); sway -1..1 swings their tips; lift 0..2
 *                           raises the tips (hair drifting in the magic breeze)
 *   torso(t, { ox, oy, breath, hem })
 *                           leaf dress over torso and hips, two skirt leaves and a collar;
 *                           breath 0 | 1 lifts back and shoulders 1 px; hem 0 | 1 swings
 *                           the hem tips 1 px back
 *   sleeve(t, { ox, oy })   leaf cap on her near shoulder (draw after the near arm)
 *   arm(t, side, pose, { ox, oy })
 *                           side 'near' | 'far'; pose 'prone' (forearms flat on the rock,
 *                           hands together under her chin) or 'chin' (near only: forearm
 *                           up, hand under her chin)
 *   legs(t, { ox, oy, near, far })
 *                           thighs on the rock, both shins up, bare feet in the air, soles
 *                           up; near / far -2..2 swing each foot (kick: alternate them)
 *   flowers(t, { ox, oy, breath })  the three small white flowers (one on the head, two
 *                           on the top lock; breath lifts the lock ones with the lock)
 *   prone({ breath, sway, hem, tilt }) → Tex   the whole reference pose, blank face
 *   PRONE, FACE_IN_HEAD, FACE_PRONE  part offsets of the prone pose; the face point
 *                           inside the head and in the box (catalog FACE)
 * Moods and wilting: recolour a finished pose with kit.shiftRamp(t, 'hair', 'faded')
 * and kit.shiftRamp(t, 'dress', 'wilt') (dark stays dark), before rim() or after.
 * Deterministic and pure: every call draws into the Tex it gets.
 * ========================================================================== */
'use strict';

const K = require('./kit');
const P = require('./palette');

const W = 64;
const H = 48;

const LEGEND = {
  0: 'hair0', 1: 'hair1', 2: 'hair2', 3: 'hair3', 4: 'hair4', 5: 'hair5', 6: 'hair6',
  K: 'skin0', k: 'skin1', s: 'skin2', S: 'skin3', L: 'skin4', W: 'skin5',
  d: 'dress0', e: 'dress1', f: 'dress2', g: 'dress3', h: 'dress4',
  w: 'petal4', p: 'petal3', y: 'petalY2', Y: 'petalY1',
};

function grid(rows, name) {
  const w = rows[0].length;
  rows.forEach((r, i) => { if (r.length !== w) throw new Error(`${name}: row ${i} is ${r.length} wide, not ${w}`); });
  return K.grid(rows, LEGEND);
}

function spanPixels(rows, ox, oy) {
  const out = [];
  for (const [y, x0, x1] of rows) for (let x = x0; x <= x1; x++) out.push([x + ox, y + oy]);
  return out;
}

function shade(t, rows, tones, { ox = 0, oy = 0, crease = null } = {}) {
  const px = spanPixels(rows, ox, oy);
  const col = new Map();
  for (const [x, y] of px) {
    const c = col.get(x) ?? [Infinity, -Infinity];
    col.set(x, [Math.min(c[0], y), Math.max(c[1], y)]);
  }
  const lies = crease ? new Set(px.filter(([x, y]) => t.get(x, y + 1) !== 0).map(([x, y]) => y * W + x)) : null;
  const n = tones.length;
  for (const [x, y] of px) {
    const [a, b] = col.get(x);
    const v = b > a ? (y - a) / (b - a) : 0.5;
    t.set(x, y, P.c(tones[Math.round(v * (n - 1))]));
  }
  if (crease) for (const [x, y] of px) if (col.get(x)[1] === y && lies.has(y * W + x)) t.set(x, y, P.c(crease));
  return t;
}

function dots(t, list, ox = 0, oy = 0) {
  for (const [x, y, ch] of list) t.set(x + ox, y + oy, P.c(LEGEND[ch]));
  return t;
}

/** Selective 1-px outline round the figure: each rim pixel takes the darkest step of its darkest neighbour's ramp. */
function rim(t) {
  const out = [];
  const darkOf = (v) => {
    const r = P.RAMP_OF[v];
    return r === 'petal' || r === 'petalY' ? P.c('hair0') : P.ramp(r)[0];
  };
  const lum = (i) => { const [r, g, b] = P.PALETTE[i]; return r * 0.3 + g * 0.59 + b * 0.11; };
  for (let y = 0; y < t.h; y++) {
    for (let x = 0; x < t.w; x++) {
      if (t.get(x, y) !== 0) continue;
      let best = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const v = t.get(x + dx, y + dy);
        if (v === 0 || x + dx < 0 || x + dx >= t.w || y + dy < 0 || y + dy >= t.h) continue;
        const d = darkOf(v);
        if (!best || lum(d) < lum(best)) best = d;
      }
      if (best) out.push([x, y, best]);
    }
  }
  for (const [x, y, v] of out) t.set(x, y, v);
  return t;
}

/* ------------------------------------------------------------- head -- */
// 3/4 view facing right: leafy hair cap with a sprout, a fringe of three locks
// (the forehead shows between them, where the brows go), a lock in front of the
// ear, blank skin where the overlays go. Rows 0–8 are the cap (tilt shears them).
const HEAD_ROWS = [
  '........56.....65.....',
  '.....45...45.54.......',
  '.....4......3.........',
  '......3455665543......',
  '....33455666655443....',
  '...3445566665554433...',
  '..234556655554443332..',
  '.23445554554345434432.',
  '.23344433443234323322.',
  '.....44332sss32ssss23.',
  '.....432sLLLSSSSSSSss.',
  '.....432sLLSSSSSSSSSs.',
  '.....432sLLSSSSSSSSSs.',
  '.....432sLSSSSSSSSSSs.',
  '.....432sLSSSSSSSSSSs.',
  '.....432sLLSSSSSSSSSs.',
  '.....432sSLSSSSSSSSs..',
  '.....32kksSSSSSSSSSs..',
  '......2kkksSSSSSSSs...',
  '......2kk....sSSSs....',
];
const FACE_IN_HEAD = [9, 11];
const HEAD = grid(HEAD_ROWS, 'head');
const CAP_ROWS = 9;

function head(t, { x = PRONE.head[0], y = PRONE.head[1], tilt = 0 } = {}) {
  for (let r = 0; r < HEAD.h; r++) {
    const dx = r < CAP_ROWS ? -tilt * (r < 5 ? 1 : 0) : 0;
    for (let c = 0; c < HEAD.w; c++) {
      const v = HEAD.px[r * HEAD.w + c];
      if (v) t.set(x + c + dx, y + r, v);
    }
  }
  return t;
}

/* ------------------------------------------------------ hair locks -- */
// Three leaf-shaped locks in box coordinates, lowest first; each one's tip rows swing.
const LOCKS = [
  {
    tones: ['hair4', 'hair3', 'hair3', 'hair2', 'hair2', 'hair1'], tip: 36, crease: null,
    rows: [[31, 38, 43], [32, 36, 43], [33, 35, 43], [34, 34, 42], [35, 34, 41], [36, 34, 39], [37, 34, 37], [38, 35, 36], [39, 35, 35]],
  },
  {
    tones: ['hair5', 'hair4', 'hair4', 'hair3', 'hair3', 'hair2'], tip: 34, crease: 'hair1',
    rows: [[26, 36, 43], [27, 34, 43], [28, 33, 43], [29, 32, 43], [30, 31, 42], [31, 30, 39], [32, 29, 37], [33, 29, 35],
      [34, 29, 34], [35, 29, 33], [36, 29, 32], [37, 30, 31], [38, 30, 30]],
  },
  {
    tones: ['hair5', 'hair4', 'hair4', 'hair3', 'hair3', 'hair2'], tip: 31, crease: 'hair1',
    rows: [[19, 36, 42], [20, 33, 42], [21, 31, 42], [22, 30, 42], [23, 29, 42], [24, 28, 41], [25, 27, 39], [26, 26, 36],
      [27, 26, 34], [28, 25, 32], [29, 25, 31], [30, 25, 30], [31, 25, 29], [32, 25, 28], [33, 25, 27], [34, 26, 27], [35, 26, 26]],
  },
];
const LOCK_SHINE = [[35, 21, '6'], [34, 21, '6'], [32, 22, '6'], [31, 23, '5'], [30, 24, '5'], [37, 27, '5'], [36, 27, '5'], [34, 28, '5']];

function hairLocks(t, { ox = 0, oy = 0, sway = 0, lift = 0 } = {}) {
  for (const lock of LOCKS) {
    const rows = lock.rows.map(([y, a, b]) => {
      if (y < lock.tip) return [y, a, b];
      const k = y - lock.tip + 1;
      return [y - Math.min(lift, k), a + sway, b + sway];
    });
    shade(t, rows, lock.tones, { ox, oy, crease: lock.crease });
  }
  return dots(t, LOCK_SHINE, ox, oy);
}

/* ----------------------------------------------------------- torso -- */
const TORSO = [
  [35, 42, 45], [36, 39, 46], [37, 21, 26], [37, 36, 47], [38, 20, 28], [38, 33, 47], [39, 19, 29], [39, 31, 47],
  [40, 16, 47], [41, 13, 47], [42, 11, 47], [43, 14, 47], [44, 13, 47], [45, 12, 47], [46, 15, 46],
];
const DRESS_TONES = ['dress4', 'dress3', 'dress3', 'dress2', 'dress2', 'dress2', 'dress1', 'dress1'];

function torso(t, { ox = 0, oy = 0, breath = 0, hem = 0 } = {}) {
  const b = breath ? 1 : 0;
  const rows = TORSO.map(([y, x0, x1]) => {
    const tipRow = y === 42 || y === 45;
    return [y < 44 ? y - b : y, tipRow ? x0 - hem : x0, x1];
  });
  if (b) rows.push([43, 14, 47]);
  shade(t, rows, DRESS_TONES, { ox, oy });
  K.line(t, ox + 31, oy + 42 - b, ox + 14, oy + 43, 'dress0');
  K.line(t, ox + 28, oy + 39 - b, ox + 14, oy + 41 - b, 'dress4');
  K.line(t, ox + 30, oy + 44, ox + 14, oy + 45, 'dress3');
  return dots(t, [[44, 36 - b, 'h'], [45, 36 - b, 'g'], [46, 37 - b, 'h'], [47, 37 - b, 'g']], ox, oy);
}

function sleeve(t, { ox = 0, oy = 0 } = {}) {
  return dots(t, [[41, 36, 'h'], [42, 36, 'h'], [43, 36, 'g'], [40, 37, 'h'], [41, 37, 'g'], [42, 37, 'g'], [43, 37, 'g'], [44, 37, 'f'],
    [40, 38, 'g'], [41, 38, 'f'], [42, 38, 'f'], [40, 39, 'f']], ox, oy);
}

/* ------------------------------------------------------------ arms -- */
// [grid, top left in the prone box]
const ARMS = {
  near: {
    prone: [grid([
      'LSs..........',
      'LSs..........',
      'LSs..........',
      'LSs..........',
      'LSs..........',
      'LSs......LLs.',
      'LSSLLLLLLSSSs',
      'sSSSSSSSSSSSs',
      'ksssssssssss.',
      '.kkkkkkkkkk..',
    ], 'arm near prone'), [41, 37]],
    chin: [grid([
      '........LLs..',
      '.......LSSSs.',
      '......LSSSs..',
      'LSs..LSSs....',
      'LSs.LSSs.....',
      'LSsLSSs......',
      'LSSSSs.......',
      'LSSSs........',
      'LSSs.........',
      'sSs..........',
      'kss..........',
    ], 'arm near chin'), [41, 35]],
  },
  far: {
    prone: [grid([
      '.........ss.',
      'ssssssssssSs',
      'kkkkkkkkksSs',
      '.........kk.',
    ], 'arm far prone'), [45, 40]],
  },
};

function arm(t, side, pose = 'prone', { ox = 0, oy = 0 } = {}) {
  const a = ARMS[side]?.[pose];
  if (!a) throw new Error(`gaia-body: no ${side} arm pose '${pose}'`);
  return t.stamp(a[0], a[1][0] + ox, a[1][1] + oy);
}

/* ------------------------------------------------------------ legs -- */
// Rows 0–15 hold the shins and feet: x < 8 the near leg, x >= 8 the far one (behind); 16–20 the thighs.
const LEGS_ROWS = [
  '....................',
  '....................',
  '...LS...............',
  '..LSSS..............',
  '..sSSSL.............',
  '...sSSSs......sS....',
  '....LSs......sSSS...',
  '....LSs......ssSSL..',
  '...LSSs.......ssSSs.',
  '...LSSSs.......sSs..',
  '..LSSSs........sSs..',
  '..LSSs........sSSs..',
  '.LSSs........sSSSs..',
  '.LSs........sSSs....',
  'LSSs.......sSSs.....',
  'LSs.......sSs.......',
  'LSSLLLLLLLLLL.......',
  'LSSSSSSSSSSSSs......',
  'LSSSSSSSSSSSSs......',
  'sssssssssssss.......',
  '.kkkkkkkkkkk........',
];
const LEGS = grid(LEGS_ROWS, 'legs');
const SHIN_ROWS = 16;
const LEG_SPLIT = 8;

function legs(t, { ox = PRONE.legs[0], oy = PRONE.legs[1], near = 0, far = 0 } = {}) {
  const swing = (k, r) => Math.round((k * (SHIN_ROWS - 1 - r)) / 7);
  const draw = (pick, k) => {
    for (let r = 0; r < LEGS.h; r++) {
      const dx = r < SHIN_ROWS ? swing(k, r) : 0;
      for (let c = 0; c < LEGS.w; c++) {
        const v = LEGS.px[r * LEGS.w + c];
        if (v && pick(r, c)) t.set(ox + c + dx, oy + r, v);
      }
    }
  };
  draw((r, c) => r < SHIN_ROWS && c >= LEG_SPLIT, far);
  draw((r, c) => r >= SHIN_ROWS || c < LEG_SPLIT, near);
  return t;
}

/* -------------------------------------------------------- flowers -- */
const FLOWER_S = grid(['.w.', 'wyw', '.w.'], 'flower s');
const FLOWER_M = grid(['.ww.', 'wyYw', 'wYyp', '.pp.'], 'flower m');

function flowers(t, { ox = 0, oy = 0, breath = 0 } = {}) {
  t.stamp(FLOWER_M, 39 + ox, 21 + oy);
  t.stamp(FLOWER_S, 29 + ox, 25 + oy - breath);
  t.stamp(FLOWER_S, 32 + ox, 30 + oy - breath);
  return t;
}

/* ------------------------------------------------------- the pose -- */
const PRONE = { head: [37, 16], legs: [5, 26] };
const FACE_PRONE = [PRONE.head[0] + FACE_IN_HEAD[0], PRONE.head[1] + FACE_IN_HEAD[1]];

function prone({ breath = 0, sway = 0, hem = 0, tilt = 0 } = {}) {
  const t = new K.Tex(W, H);
  arm(t, 'far', 'prone');
  legs(t);
  torso(t, { breath, hem });
  hairLocks(t, { oy: -breath, sway });
  arm(t, 'near', 'prone');
  sleeve(t, { oy: -breath });
  head(t, { tilt });
  flowers(t, { breath });
  return rim(t);
}

module.exports = {
  W, H, LEGEND, grid, shade, dots, rim, head, hairLocks, torso, sleeve, arm, legs, flowers, prone,
  PRONE, FACE_IN_HEAD, FACE_PRONE,
};
