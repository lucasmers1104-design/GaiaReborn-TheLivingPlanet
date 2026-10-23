/* =============================================================================
 * Gaia Reborn — the interface's frames: rail buttons, status bar, window vines
 * -----------------------------------------------------------------------------
 * Concept: left-toolbar.png and top-bar.png (style only). Light from the
 * upper left, a dark 1-px outline, gold rims, warm parchment and dark wood.
 *   rail_btn    rounded octagon, face rows 0..21 (0..22 pressed); rows 22..23
 *               carry the drop shadow, so hover lifts by growing it
 *   rail_focus  dotted gold/ink ring one pixel outside the face
 *   rail_tab    gold pointer with a parchment heart, grown out of the rim
 *   badge       gold coin; digits 3 × 5 glyphs at (0, 1) of their 4 × 6 cell
 *   wood_tile   two planks, seamless both ways (the bar may be any height)
 *   parch_tile  calm parchment, seamless both ways
 *   panel9      inset parchment in a bevelled gold rim; rows/cols 4..7 are
 *               flat so edges and centre tile at any period
 *   post_tile   round wood post, seamless vertically; stud a brass rivet
 *   logo        GAIA REBORN, the I with slab serifs
 *   win_corner  a sprig hugging a window corner's frame, growing in four steps;
 *               _r is the mirrored shape, re-shaded with light from the left
 * Contract: tools/uiart/catalog.js.
 * ========================================================================== */
'use strict';

const K = require('./kit');

/* ------------------------------------------------------------- masks -- */

/** A w × h mask from inside(x, y). */
function mask(w, h, inside) {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(x, y)) m[y * w + x] = 1;
  return { w, h, m };
}

const on = (M, x, y) => x >= 0 && y >= 0 && x < M.w && y < M.h && M.m[y * M.w + x] === 1;

/** City-block distance of every inside pixel to the outside: 1 on the edge, 0 outside. */
function depth(M) {
  const d = new Int16Array(M.w * M.h);
  let ring = [];
  for (let y = 0; y < M.h; y++) {
    for (let x = 0; x < M.w; x++) {
      if (on(M, x, y) && (!on(M, x - 1, y) || !on(M, x + 1, y) || !on(M, x, y - 1) || !on(M, x, y + 1))) {
        d[y * M.w + x] = 1;
        ring.push([x, y]);
      }
    }
  }
  for (let k = 2; ring.length; k++) {
    const next = [];
    for (const [x, y] of ring) {
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (on(M, nx, ny) && d[ny * M.w + nx] === 0) {
          d[ny * M.w + nx] = k;
          next.push([nx, ny]);
        }
      }
    }
    ring = next;
  }
  return d;
}

/** 0 lit (facing the upper left), 1 side, 2 shaded: the direction of (x, y) seen from (cx, cy). */
function side(x, y, cx, cy) {
  const dx = x - cx;
  const dy = y - cy;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return 1;
  const v = -(dx + dy) / (len * Math.SQRT2);
  return v > 0.38 ? 0 : v < -0.38 ? 2 : 1;
}

/** A mask from left offsets per row, mirrored about the vertical axis of a w-wide box, starting at row `top`. */
function symmetric(w, h, left, top = 0) {
  return mask(w, h, (x, y) => {
    const l = left[y - top];
    return l !== undefined && x >= l && x <= w - 1 - l;
  });
}

/* --------------------------------------------------------- rail_btn -- */

const BTN = 24;
const FACE_H = 22;
/** Left edge of the face per row: flat top and sides, 45° cuts, every corner softened by a pixel. */
const FACE_L = [8, 6, 5, 4, 3, 2, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 2, 3, 4, 5, 6, 8];

/**
 * Per look, [lit, side, shaded] for each ring of the face: out (outline), rim (outer gold),
 * bevel (inner gold, lit on the far side: a round rim), edge and soft (the inner shading),
 * fill (the flat middle the icon sits on), shine (a highlight in the lit part of the middle),
 * drop (rows of drop shadow under the face), dy (the face's offset), glint (a specular spot on the
 * rim's upper left cut, when the button is lit).
 */
const LOOKS = [
  { // 0 normal
    out: ['ink1', 'ink1', 'ink1'], rim: ['gold4', 'gold3', 'gold2'], bevel: ['gold2', 'gold2', 'gold3'],
    edge: ['parch3', 'parch2', 'parch1'], soft: ['parch4', 'parch3', 'parch3'], fill: 'parch4', shine: 'parch5', drop: 1, dy: 0,
  },
  { // 1 hover: lighter, rim brighter and catching the light, lifted (the shadow grows)
    out: ['ink1', 'ink1', 'ink1'], rim: ['gold5', 'gold4', 'gold3'], bevel: ['gold3', 'gold3', 'gold4'],
    edge: ['parch4', 'parch3', 'parch2'], soft: ['parch5', 'parch4', 'parch4'], fill: 'parch5', shine: 'parch5', drop: 2, dy: 0, glint: 'parch5',
  },
  { // 2 pressed: one pixel down into its socket: the upper rim's shadow falls on the face, the lower lip catches the light
    out: ['ink1', 'ink1', 'ink1'], rim: ['gold3', 'gold2', 'gold2'], bevel: ['gold1', 'gold2', 'gold4'],
    edge: ['parch0', 'parch1', 'parch3'], soft: ['parch1', 'parch2', 'parch3'], fill: 'parch3', shine: 'parch3', drop: 0, dy: 1,
  },
  { // 3 selected: deep green, a faint glow inside the gold rim
    out: ['ink1', 'ink1', 'ink1'], rim: ['gold4', 'gold3', 'gold2'], bevel: ['gold2', 'gold2', 'gold3'],
    edge: ['vine3', 'vine2', 'vine2'], soft: ['vine2', 'dress2', 'dress2'], fill: 'dress1', shine: 'dress1', drop: 1, dy: 0,
  },
  { // 4 selected + hover: brighter green, rim lit
    out: ['ink1', 'ink1', 'ink1'], rim: ['gold5', 'gold4', 'gold3'], bevel: ['gold3', 'gold3', 'gold4'],
    edge: ['vine4', 'vine3', 'vine3'], soft: ['vine3', 'vine2', 'vine2'], fill: 'dress2', shine: 'dress2', drop: 2, dy: 0, glint: 'parch5',
  },
  { // 5 disabled: dull and grey
    out: ['rock0', 'rock0', 'rock0'], rim: ['rock3', 'rock2', 'rock2'], bevel: ['rock2', 'rock2', 'rock2'],
    edge: ['rock3', 'rock3', 'rock3'], soft: ['lichen0', 'lichen0', 'lichen0'], fill: 'lichen0', shine: 'lichen0', drop: 0, dy: 0,
  },
];

function railBtn(f) {
  const L = LOOKS[f];
  const t = new K.Tex(BTN, BTN);
  const M = symmetric(BTN, BTN, FACE_L, L.dy);
  const d = depth(M);
  const cx = (BTN - 1) / 2;
  const cy = (FACE_H - 1) / 2 + L.dy;
  // Drop shadow: the face moved down, where it is not the face.
  for (let s = 1; s <= L.drop; s++) {
    for (let y = 0; y < BTN; y++) {
      for (let x = 0; x < BTN; x++) if (!on(M, x, y) && on(M, x, y - s)) K.put(t, x, y, s === 1 ? 'ink1' : 'wood1');
    }
  }
  for (let y = 0; y < BTN; y++) {
    for (let x = 0; x < BTN; x++) {
      const k = d[y * BTN + x];
      if (!k) continue;
      const sd = side(x, y, cx, cy);
      let col;
      if (k === 1) col = L.out[sd];
      else if (k === 2) col = L.glint && x + y - L.dy === 8 && y - L.dy >= 2 && y - L.dy <= 4 ? L.glint : L.rim[sd];
      else if (k === 3) col = L.bevel[sd];
      else if (k === 4) col = L.edge[sd];
      else if (k === 5) col = L.soft[sd];
      else col = (k <= 7 && sd === 0) ? L.shine : L.fill;
      K.put(t, x, y, col);
    }
  }
  return t;
}

/** The focus ring: dotted, one pixel clear of the face, light and dark dots so it reads on any ground. */
function railFocus() {
  const W = BTN + 4;
  const H = FACE_H + 4;
  const face = symmetric(W, H, FACE_L.map((l) => l + 2), 2);
  const grown = mask(W, H, (x, y) => {
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (on(face, x + i, y + j)) return true;
    return false;
  });
  const t = new K.Tex(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (on(grown, x, y)) continue;
      if (on(grown, x - 1, y) || on(grown, x + 1, y) || on(grown, x, y - 1) || on(grown, x, y + 1)) {
        K.put(t, x, y, (x + y) % 2 === 0 ? (side(x, y, (W - 1) / 2, (H - 1) / 2) === 2 ? 'gold4' : 'gold5') : 'ink1');
      }
    }
  }
  return t;
}

/* ---------------------------------------------------------- rail_tab -- */

// Column 0 sits on the button's column 23 and rows 0..11 on its rows 5..16 (rail_tab points.at): the base
// (r) covers the outline of the face's flat side, so the tab's gold grows out of the button's rim.
const TAB = [
  '......',
  'oo....',
  'rgo...',
  'rhgo..',
  'rhpgo.',
  'rppqgo',
  'rppqgo',
  'rpqgo.',
  'rpgo..',
  'rgo...',
  'oo....',
  '......',
];

function railTab(f) {
  const lit = f === 1;
  return K.grid(TAB, {
    o: 'ink1',
    r: lit ? 'gold3' : 'gold2',
    g: lit ? 'gold4' : 'gold3',
    h: lit ? 'gold5' : 'gold4',
    p: lit ? 'parch5' : 'parch4',
    q: lit ? 'parch3' : 'parch2',
  });
}

/* ------------------------------------------------------ badge, digits -- */

function badge(f) {
  const t = new K.Tex(11, 11);
  const M = mask(11, 11, (x, y) => {
    const nx = (x + 0.5 - 5.5) / 5.5;
    const ny = (y + 0.5 - 5.5) / 5.5;
    return nx * nx + ny * ny <= 1;
  });
  const d = depth(M);
  const glow = [0, 1, 2, 1][f];
  const rim = [['gold3', 'gold2', 'gold1'], ['gold4', 'gold3', 'gold2'], ['gold5', 'gold4', 'gold3'], ['gold4', 'gold3', 'gold2']][f];
  const face = ['gold4', 'gold4', 'gold5', 'gold4'][f];
  for (let y = 0; y < 11; y++) {
    for (let x = 0; x < 11; x++) {
      const k = d[y * 11 + x];
      if (!k) continue;
      const sd = side(x, y, 5, 5);
      let col;
      if (k === 1) col = 'ink1';
      else if (k === 2) col = rim[sd];
      else if (sd === 2 && k === 3) col = glow === 2 ? 'gold4' : 'gold3';
      else col = face;
      K.put(t, x, y, col);
    }
  }
  // The shine at the upper left grows with the pulse; frame 3 lets it slide down as it fades.
  const shine = [[[3, 3]], [[3, 3], [4, 3], [3, 4]], [[3, 3], [4, 3], [3, 4], [5, 3], [3, 5]], [[4, 4], [3, 4]]][f];
  for (const [x, y] of shine) K.put(t, x, y, glow === 2 ? 'parch5' : 'gold5');
  return t;
}

const GLYPHS = [
  ['###', '#.#', '#.#', '#.#', '###'],
  ['.#.', '##.', '.#.', '.#.', '###'],
  ['##.', '..#', '.#.', '#..', '###'],
  ['##.', '..#', '.#.', '..#', '##.'],
  ['#.#', '#.#', '###', '..#', '..#'],
  ['###', '#..', '##.', '..#', '##.'],
  ['.##', '#..', '###', '#.#', '###'],
  ['###', '..#', '.#.', '.#.', '.#.'],
  ['###', '#.#', '###', '#.#', '###'],
  ['###', '#.#', '###', '..#', '##.'],
  ['...', '.#.', '###', '.#.', '...'],
];

function digit(f) {
  return K.grid(['....', ...GLYPHS[f].map((r) => `${r}.`)], { '#': 'ink0' });
}

/* -------------------------------------------------------- bar stuff -- */

// Two planks: a dark joint (0), a lit upper edge (3, 4 specks), grain lines that drift a row now and then
// and run on across the tile's ends, a shaded lower edge (1). No knots: a knot would repeat every 32 px.
const WOOD = [
  '00000000000000000000000000000000',
  '33333433333333333333333334333333',
  '22223333222222222222233332222222',
  '11222222111111112222222222211111',
  '22111222222222221111222222222222',
  '22222222222333222222111111222222',
  '22222222222222222222222222221122',
  '11111111111111111111111111111111',
  '00000000000000000000000000000000',
  '33433333333334333333333333333343',
  '22222222333322222222222222233322',
  '22222211111122222222333222222222',
  '11112222222211111222222211111111',
  '22221111222222221111111222222222',
  '22222222222222222222222222222222',
  '11111111111111111111111111111111',
];

function woodTile() {
  return K.grid(WOOD, { 0: 'wood0', 1: 'wood1', 2: 'wood2', 3: 'wood3', 4: 'wood4' });
}

/** Flat paper with a few fibres and flecks: any blob in a 16-px tile repeats as wallpaper. */
function parchTile() {
  const t = new K.Tex(16, 16, true).fill(K.c('parch3'));
  for (const [x, y] of [[2, 3], [3, 3], [4, 4], [11, 9], [12, 9], [7, 13], [14, 0]]) K.put(t, x, y, 'parch2');
  for (const [x, y] of [[9, 2], [10, 2], [1, 10], [5, 7], [13, 13], [14, 13]]) K.put(t, x, y, 'parch4');
  return t;
}

/** The 12 × 12 panel: a rounded rect (corner cut 2), rings by depth, sides by the nearest edge. */
function panel9(f) {
  const lit = f === 1;
  const t = new K.Tex(12, 12);
  const M = mask(12, 12, (x, y) => {
    const ex = Math.min(x, 11 - x);
    const ey = Math.min(y, 11 - y);
    return !(ex + ey < 2);
  });
  const d = depth(M);
  const ramp = {
    out: ['ink1', 'ink1'],
    rim: lit ? ['gold5', 'gold3'] : ['gold4', 'gold2'],
    bevel: lit ? ['gold3', 'gold2'] : ['gold2', 'gold1'],
    edge: lit ? ['parch3', 'parch5'] : ['parch2', 'parch4'],
  };
  const fill = lit ? 'parch4' : 'parch3';
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      const k = d[y * 12 + x];
      if (!k) continue;
      const near = Math.min(x, y, 11 - x, 11 - y);
      const shaded = (near === 11 - x || near === 11 - y) && !(near === x || near === y) ? 1 : 0;
      const col = k === 1 ? ramp.out[shaded] : k === 2 ? ramp.rim[shaded] : k === 3 ? ramp.bevel[shaded] : k === 4 ? ramp.edge[shaded] : fill;
      K.put(t, x, y, col);
    }
  }
  return t;
}

function postTile() {
  return K.grid(['o554o', 'o553o', 'o543o', 'o543o', 'o543o', 'o542o', 'o553o', 'o543o'],
    { o: 'ink1', 5: 'wood5', 4: 'wood4', 3: 'wood3', 2: 'wood2' });
}

function stud() {
  return K.grid([
    '.ooo.',
    'o543o',
    'o432o',
    'o321o',
    '.ooo.',
  ], { o: 'gold0', 5: 'gold5', 4: 'gold4', 3: 'gold3', 2: 'gold2', 1: 'gold1' });
}

/* -------------------------------------------------------------- logo -- */

const LETTERS = {
  G: ['..####..', '.######.', '###..###', '##....##', '##......', '##......', '##..####', '##..####', '##....##', '###..###', '.######.', '..####..'],
  A: ['..####..', '.######.', '###..###', '##....##', '##....##', '##....##', '########', '########', '##....##', '##....##', '##....##', '##....##'],
  // Slab serifs as heavy as E's bars: a bare stem read as a thin l, a leaf on top as the accent of í.
  I: ['######', '######', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '######', '######'],
  R: ['######.', '#######', '##...##', '##...##', '##...##', '#######', '######.', '##.##..', '##..##.', '##..##.', '##...##', '##...##'],
  E: ['#######', '#######', '##.....', '##.....', '##.....', '######.', '######.', '##.....', '##.....', '##.....', '#######', '#######'],
  B: ['######.', '#######', '##...##', '##...##', '##...##', '######.', '#######', '##...##', '##...##', '##...##', '#######', '######.'],
  O: ['..####..', '.######.', '###..###', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '###..###', '.######.', '..####..'],
  N: ['###...##', '####..##', '####..##', '##.##.##', '##.##.##', '##.##.##', '##..####', '##..####', '##..####', '##...###', '##...###', '##....##'],
};

/** Rows of the letters from the cap line down: a light cap, deep green, a darker foot. */
const LETTER_BANDS = ['hair4', 'hair3', 'hair3', 'hair2', 'hair2', 'hair2', 'hair2', 'hair2', 'hair2', 'hair2', 'hair1', 'hair1'];

function logo() {
  // One outline column either side of the letters: G at 1, N ending at W − 2.
  const W = 90;
  const H = 14;
  const owner = new Int16Array(W * H).fill(-1);
  let x = 1;
  let g = 0;
  for (const ch of 'GAIA REBORN') {
    if (ch === ' ') { x += 5; continue; }
    const rows = LETTERS[ch];
    rows.forEach((row, gy) => {
      for (let i = 0; i < row.length; i++) if (row[i] !== '.') owner[(gy + 1) * W + x + i] = g;
    });
    x += rows[0].length + 1;
    g++;
  }
  const own = (px, py) => (px < 0 || py < 0 || px >= W || py >= H ? -1 : owner[py * W + px]);
  // The outline runs round each word but stays out of counters and the narrow gaps inside a letter, which
  // a 12-px letter cannot spare: a pixel between two pixels of the same letter at most four apart is left open.
  const reach = (px, py, dx, dy) => {
    for (let s = 1; s <= 4; s++) {
      const o = own(px + dx * s, py + dy * s);
      if (o >= 0) return [o, s];
    }
    return [-1, 0];
  };
  const inside = (px, py) => [[1, 0], [0, 1]].some(([dx, dy]) => {
    const [a, sa] = reach(px, py, -dx, -dy);
    const [b, sb] = reach(px, py, dx, dy);
    return a >= 0 && a === b && sa + sb <= 5;
  });
  const t = new K.Tex(W, H);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const i = py * W + px;
      if (owner[i] >= 0) {
        K.put(t, px, py, LETTER_BANDS[py - 1]);
      } else if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => own(px + dx, py + dy) >= 0) && !inside(px, py)) {
        K.put(t, px, py, 'hair0');
      }
    }
  }
  return t;
}

/* -------------------------------------------------- window corners -- */

// The sprig grows out of the corner along the top and down the side. Stems a, b, c and leaves e, f, g
// appear in frames 0, 1, 2 (a and e from frame 0); k is the curl at the top tip, which opens into the
// flower (centre FLOWER) in frame 3. Light is applied after mirroring, so _r is lit from the left too.
// The window draws the sprite one art px out over its clipped frame edge (row 0 and column 0 are hidden),
// and the title bar's icon tile and close button begin 8–10 CSS px in from the frame: at up to 3 CSS px
// per art px only rows ≤ 2 and columns ≤ 3 stay clear of them (FREE), so the sprig hugs the frame there.
const CORNER = [
  '..................',
  '.aaabfffbbcggccc..',
  '.aee..fff...gg..k.',
  '.aee...........k..',
  '.b................',
  '.bf...............',
  '.bff..............',
  '.b.f..............',
  '.b................',
  '.cg...............',
  '.cgg..............',
  '.c.g..............',
  '.c................',
  '..c...............',
];
const CORNER_W = 18;
const CORNER_H = 14;
const FLOWER = [16, 2];
/** Pixels clear of the icon tile and the close button (see CORNER); the tip beyond the tile may droop a row more. */
const FREE = (x, y) => y <= 2 || x <= 3 || (x >= 15 && y <= 3);

function winCorner(f, mirrored) {
  const W = CORNER_W;
  const H = CORNER_H;
  const stem = new Uint8Array(W * H);
  const leaf = new Uint8Array(W * H);
  const fx = (x) => (mirrored ? W - 1 - x : x);
  CORNER.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const s = 'abc'.indexOf(ch);
      const l = 'efg'.indexOf(ch);
      if ((s >= 0 && s <= f) || (ch === 'k' && f === 2)) stem[y * W + fx(x)] = 1;
      if (l >= 0 && l <= f) leaf[y * W + fx(x)] = 1;
    }
  });
  const S = { w: W, h: H, m: stem };
  const L = { w: W, h: H, m: leaf };
  const t = new K.Tex(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (on(L, x, y)) {
        // Leaves two pixels deep: lit where the light falls on them, the underside in shade.
        K.put(t, x, y, on(L, x, y - 1) ? 'vine3' : on(L, x - 1, y) ? 'vine4' : 'vine5');
      } else if (on(S, x, y)) {
        K.put(t, x, y, !on(S, x, y - 1) || !on(S, x - 1, y) ? 'stem4' : 'stem3');
      }
    }
  }
  if (f === 3) {
    const cx = fx(FLOWER[0]);
    const cy = FLOWER[1];
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) K.put(t, cx + dx, cy + dy, dx < 0 || dy < 0 ? 'petal4' : 'petal3');
    K.put(t, cx, cy, 'petalY2');
  }
  K.outline(t, 'vine0');
  t.each((x, y) => (FREE(mirrored ? W - 1 - x : x, y) ? undefined : 0));
  return t;
}

/* ---------------------------------------------------------- fold_tab -- */

// A parchment pill in a bevelled gold rim (light top and left, shade bottom and right), its face lit along the
// top and shaded along the bottom; the chevron sits on face rows 3..6, two pixels thick, its tip on column 10.
const FOLD_PILL = [
  '..kkkkkkkkkkkkkkkkk..',
  '.khhhhhhhhhhhhhhhhhk.',
  'khlllllllllllllllllgk',
  'khpppppppppppppppppgk',
  'khpppppppppppppppppgk',
  'khpppppppppppppppppgk',
  'khpppppppppppppppppgk',
  'kgdddddddddddddddddsk',
  '.ksssssssssssssssssk.',
  '..kkkkkkkkkkkkkkkkk..',
];
const FOLD_UP = [[3, [9, 10, 11]], [4, [8, 9, 11, 12]], [5, [7, 8, 12, 13]], [6, [6, 7, 13, 14]]];
const FOLD_LIGHT = [
  { k: 'ink0', h: 'gold5', g: 'gold3', s: 'gold1', l: 'parch4', p: 'parch3', d: 'parch2', '#': 'ink1' },
  { k: 'ink0', h: 'gold5', g: 'gold4', s: 'gold2', l: 'parch5', p: 'parch4', d: 'parch3', '#': 'ink0' },
];

/** 0 up, 1 up lit, 2 down, 3 down lit: the down chevron is the up one turned over on the same face rows. */
function foldTab(f) {
  const rows = FOLD_PILL.map((r) => r.split(''));
  for (const [y, xs] of FOLD_UP) for (const x of xs) rows[f < 2 ? y : 9 - y][x] = '#';
  return K.grid(rows.map((r) => r.join('')), FOLD_LIGHT[f % 2]);
}

module.exports = {
  sprites: {
    fold_tab: (f) => foldTab(f),
    rail_btn: (f) => railBtn(f),
    rail_focus: () => railFocus(),
    rail_tab: (f) => railTab(f),
    badge: (f) => badge(f),
    digits: (f) => digit(f),
    wood_tile: () => woodTile(),
    parch_tile: () => parchTile(),
    panel9: (f) => panel9(f),
    post_tile: () => postTile(),
    stud: () => stud(),
    logo: () => logo(),
    win_corner_l: (f) => winCorner(f, false),
    win_corner_r: (f) => winCorner(f, true),
  },
};
