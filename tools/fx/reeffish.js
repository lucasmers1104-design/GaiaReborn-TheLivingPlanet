/* =============================================================================
 * SimEarth 2.0 — a clownfish under the lagoon's water, seen from above
 * -----------------------------------------------------------------------------
 * Amphiprion ocellaris over a modern reef (src/clownfishlayer.ts): an oval
 * orange body three pixels wide with three white bands across it (behind
 * the head, mid-body, at the tail stalk), a fan tail and a pointed nose,
 * 7 px from tail to nose. 8 directions in HAZARD_NX / HAZARD_NY order (NW,
 * N, NE, W, E, SW, S, SE), 6 frames each:
 *   0  deep in the coral: a dark teal silhouette, barely there
 *   1  coming up: half its colour, rust with grey-blue bands
 *   2–5 one swim cycle, looped by the runtime: tail left, tail centred with
 *      the left pectoral fin out, tail right, tail centred with the right fin
 *      (clownfish row with their pectoral fins)
 * The runtime plays 1, 0 when the fish slips back in.
 * Two bases are drawn by hand, east (axial) and north-east (diagonal; there
 * the orange runs two diagonal rows thick between one-row bands, so the
 * stripes never turn into a checkerboard). Each base is turned in 90° steps
 * on the pixel grid as materials, never as a finished image, centred, and
 * lit afresh from the upper left. Frames 1–5 cast a 1 px dark-teal shadow
 * down-right on the ground below; the fish sits half a pixel up-left of the
 * box centre so that fish and shadow fit the box in every direction.
 * Under water the colours cool: bands white to ice blue, the shaded flank
 * rust; the lit orange stays the warmest spot on the reef. The band shades
 * stay off the turquoise ramp, which the light sandy lagoon would swallow.
 * Style: docs/ereignisse-2026-10/stil.md · contract: tools/fx/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');
const P = require('../terrain/palette');

const N = 8;

/**
 * The straight fish per base: 'O' orange, 'W' white band, 'T' tail fan.
 * `frames` change it per frame with [x, y, material] ('.' clears): the tail
 * fan swings to the fish's left (frame 2) and right (4), one pectoral fin
 * 'F' sticks out on the left (3) or right (5).
 */
const BASES = {
  E: {
    grid: [
      '........',
      '........',
      'T.OWOW..',
      'TWOWOWO.',
      'T.OWOW..',
      '........',
      '........',
      '........',
    ],
    frames: {
      2: [[0, 4, '.'], [0, 1, 'T']],
      3: [[4, 1, 'F']],
      4: [[0, 2, '.'], [0, 5, 'T']],
      5: [[4, 5, 'F']],
    },
  },
  NE: {
    grid: [
      '........',
      '....WOO.',
      '...OOWO.',
      '..OWOOW.',
      '..OOWO..',
      '.TWOO...',
      '..T.....',
      '........',
    ],
    frames: {
      2: [[2, 6, '.'], [0, 4, 'T']],
      3: [[3, 1, 'F']],
      4: [[1, 5, '.'], [3, 7, 'T']],
      5: [[6, 4, 'F']],
    },
  },
};

/** HAZARD_NX / HAZARD_NY order → base and quarter turns clockwise (east → south → west → north). */
const DIRS = [['NE', 3], ['E', 3], ['NE', 0], ['E', 2], ['E', 0], ['NE', 2], ['E', 1], ['NE', 1]];

/** Colour set per frame: deep silhouette, half colour, then the swim cycle in full colour. */
const LOOK_OF = ['deep', 'half', 'full', 'full', 'full', 'full'];

/**
 * Ramps per look and material: [shade (open below or right), middle, lit
 * (open above or left)]. Orange from the palette's own orange, white bands
 * cooled by the water; the deep fish is one dark turquoise, the same as the
 * shadow it becomes when it sinks back.
 */
const LOOKS = {
  deep: {
    O: ['waterWarm0', 'waterWarm0', 'waterWarm0'],
    W: ['waterWarm0', 'waterWarm0', 'waterWarm0'],
    T: ['waterWarm0', 'waterWarm0', 'waterWarm0'],
    F: ['waterWarm0', 'waterWarm0', 'waterWarm0'],
  },
  half: {
    O: ['laterite1', 'laterite2', 'laterite2'],
    W: ['ice1', 'ice2', 'ice2'],
    T: ['laterite1', 'laterite1', 'laterite2'],
    F: ['laterite2', 'laterite2', 'laterite2'],
  },
  full: {
    O: ['laterite2', 'orange0', 'orange0'],
    W: ['ice2', 'ice3', 'white0'],
    T: ['laterite1', 'laterite2', 'laterite2'],
    F: ['laterite3', 'laterite3', 'laterite3'],
  },
};
const SHADOW = 'waterWarm0';

/** Material grid (rows of characters) of base `b` in frame f, before turning. */
function layout(b, f) {
  const g = BASES[b].grid.map((row) => row.split(''));
  for (const [x, y, m] of BASES[b].frames[f] || []) g[y][x] = m;
  return g;
}

/** Turn a material grid by 90° clockwise `q` times. */
function turn(g, q) {
  let out = g;
  for (let n = 0; n < q; n++) {
    const src = out;
    out = Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => src[N - 1 - x][y]));
  }
  return out;
}

/** Shift that puts the straight fish's box centre on pixel 3 (half a pixel up-left of the box centre). */
function centring(g) {
  let x0 = N, y0 = N, x1 = -1, y1 = -1;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (g[y][x] === '.') continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  return [3 - Math.floor((x0 + x1) / 2), 3 - Math.floor((y0 + y1) / 2)];
}

/** Frame i of the clownfish: direction ⌊i / 6⌋, frame i mod 6. */
function clownfish(i) {
  const [b, q] = DIRS[Math.floor(i / 6)];
  const f = i % 6;
  const [sx, sy] = centring(turn(layout(b, 0), q));
  const g = turn(layout(b, f), q);
  const at = (x, y) => {
    const gx = x - sx;
    const gy = y - sy;
    return gx < 0 || gy < 0 || gx >= N || gy >= N ? '.' : g[gy][gx];
  };
  const S = (x, y) => at(x, y) !== '.';
  const look = LOOKS[LOOK_OF[f]];
  const t = new k.Tex(N, N);
  // The shadow first, down-right on the ground below; the fish covers its own.
  if (LOOK_OF[f] !== 'deep') {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (S(x, y) && !S(x + 1, y + 1)) t.set(x + 1, y + 1, P.c(SHADOW));
  }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const m = at(x, y);
      if (m === '.') continue;
      const lr = !S(x + 1, y) || !S(x, y + 1);
      const ul = !S(x - 1, y) || !S(x, y - 1);
      const s = lr && !ul ? 0 : ul && !lr ? 2 : 1;
      t.set(x, y, P.c(look[m][s]));
    }
  }
  return t;
}

module.exports = {
  sprites: { clownfish },
  textures: {},
};
