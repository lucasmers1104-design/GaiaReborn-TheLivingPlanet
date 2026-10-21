/* =============================================================================
 * SimEarth 2.0 — city contact sheets
 * -----------------------------------------------------------------------------
 *   blocks  every block at 1× on six real grounds and at 4× on three, with
 *           the drop shadow the map draws
 *   cities  village, town and metropolis from src/citylayout.ts (loaded from
 *           the built bundle, SE_BUNDLE or simulation.js) on 3 × 3 tiles of
 *           ground, with and without a river through the city tile
 *   compare  camp, village, town and metropolis of every era on the same
 *           site (tools/civ/compare.js)
 * Pixels are scaled nearest-neighbour, as the map shows them at 16·k px.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const C = require('./catalog');
const P = require('../terrain/palette');
const { Sheet } = require('../terrain/sheet');
const { build: buildTerrain } = require('../terrain/build');
const { partCompare } = require('./compare');

const BG = [28, 34, 32, 255];
const DIM = [140, 150, 144, 255];
const INK = [232, 238, 228, 255];
const LABEL = 14;
/** Grounds to show blocks on: terrain material ids, densest step. */
const GROUNDS = ['meadow', 'steppe', 'forest', 'savanna', 'taiga', 'tundra'];

/** Footprint columns of the bottom `depth` rows. */
function baseOf(t, depth) {
  let l = t.w;
  let r = -1;
  for (let y = Math.max(0, t.h - depth); y < t.h; y++) {
    for (let x = 0; x < t.w; x++) if (t.get(x, y) !== 0) { l = Math.min(l, x); r = Math.max(r, x); }
  }
  return [l, r];
}

/** Shadow pixels of a block whose sprite's top-left is `left` and foot row `fy` (same rule as citylayer.ts). */
function shadowPixels(bx0, bx1, left, fy, out) {
  const S = C.SHADOW;
  const rx = Math.max(2, (bx1 - bx0 + 1) * S.width);
  const cx = left + Math.floor((bx0 + bx1) / 2) + 1;
  const reach = Math.ceil(rx);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -reach; dx <= reach; dx++) if ((dx / rx) ** 2 + (dy / S.ry) ** 2 <= 1) out.push([cx + dx, fy + dy]);
  }
}

/**
 * An RGBA picture w × h: ground indices from `ground(x, y)` (0 = sheet
 * background), the union of the blocks' shadows blended once, then the
 * blocks, drawn in the order given. `blocks` = [{ tex, left, top, bx0, bx1 }].
 */
function compose(w, h, ground, blocks) {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) rgba.set(ground(x, y) ? P.PALETTE[ground(x, y)] : BG, (y * w + x) * 4);
  }
  const shade = new Uint8Array(w * h);
  for (const b of blocks) {
    if (b.shadow === false) continue;
    const pts = [];
    shadowPixels(b.bx0, b.bx1, b.left, b.top + b.tex.h - 1, pts);
    for (const [x, y] of pts) if (x >= 0 && y >= 0 && x < w && y < h) shade[y * w + x] = 1;
  }
  const { rgb, alpha } = C.SHADOW;
  for (let i = 0; i < w * h; i++) {
    if (!shade[i]) continue;
    for (let c = 0; c < 3; c++) rgba[i * 4 + c] = Math.round(rgba[i * 4 + c] * (1 - alpha) + rgb[c] * alpha);
  }
  for (const b of blocks) {
    for (let sy = 0; sy < b.tex.h; sy++) {
      for (let sx = 0; sx < b.tex.w; sx++) {
        const v = b.tex.px[sy * b.tex.w + sx];
        const x = b.left + sx;
        const y = b.top + sy;
        if (v && x >= 0 && y >= 0 && x < w && y < h) rgba.set(P.PALETTE[v], (y * w + x) * 4);
      }
    }
  }
  return rgba;
}

function put(sheet, rgba, w, h, x, y, scale) {
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) sheet.rect(x + px * scale, y + py * scale, scale, scale, rgba.subarray((py * w + px) * 4, (py * w + px) * 4 + 4));
  }
}

/** Lay out cells in rows; `cells` = [{ w, h, draw(sheet, x, y) }]. */
function flow(width, cells, gap = 14) {
  let x = gap;
  let y = gap;
  let rowH = 0;
  const spots = [];
  for (const c of cells) {
    if (x + c.w + gap > width && x > gap) { x = gap; y += rowH + gap; rowH = 0; }
    spots.push([c, x, y]);
    x += c.w + gap;
    rowH = Math.max(rowH, c.h);
  }
  const sheet = new Sheet(width, y + rowH + gap, BG);
  for (const [c, cx, cy] of spots) c.draw(sheet, cx, cy);
  return sheet;
}

function groundTex(terrain, id) {
  const t = terrain.materials[id];
  return t[t.length - 1];
}

const ERA_NAMES = {
  stone: 'Steinzeit', bronze: 'Bronzezeit', iron: 'Eisenzeit', industrial: 'Industrie',
  atomic: 'Atomzeitalter', information: 'Informationszeitalter', nanotech: 'Nanotech',
};

/** Ground and bridges cast no shadow: the yard is ground itself, a bridge stands over water. */
function casts(b) {
  return b.role !== 'ground' && b.role !== 'bridge' && b.role !== 'flame' && b.role !== 'smoke';
}

/** Every block variant by era: 4× on meadow, and 1× on meadow, steppe and forest below it. */
function partBlocks(art, terrain) {
  const W = C.BOX.w;
  const H = C.BOX.h;
  const WIDTH = 1240;
  const cells = [];
  const groups = [...C.ERAS.map((e) => [ERA_NAMES[e], C.BLOCKS.filter((b) => b.era === e)]), ['Wimpel', C.BLOCKS.filter((b) => b.era === null)]];
  for (const [title, list] of groups) {
    const vars = list.flatMap((b) => (art.blocks[b.id] || []).map((v, n) => ({ b, v, n })));
    if (vars.length === 0) continue;
    cells.push({ w: WIDTH - 40, h: 12, draw: (s, x, y) => s.text(title, x, y + 2, INK) });
    for (const { b, v, n } of vars) {
      const tex = v.tex;
      const [bx0, bx1] = baseOf(tex, b.depth);
      const block = { tex, left: Math.floor((W - tex.w) / 2), top: H - 3 - (tex.h - 1), bx0, bx1, shadow: casts(b) };
      const pic = (g) => compose(W, H, (x, y) => groundTex(terrain, g).get(x + 3, y + 5), [block]);
      cells.push({
        w: W * 4, h: 10 + H * 4 + 4 + H,
        draw(s, x, y) {
          s.text(`${b.id} ${v.size || n}`, x, y, DIM, 1);
          put(s, pic('meadow'), W, H, x, y + 10, 4);
          ['meadow', 'steppe', 'forest'].forEach((g, k) => put(s, pic(g), W, H, x + k * (W + 5), y + 10 + H * 4 + 4, 1));
        },
      });
    }
  }
  return flow(WIDTH, cells);
}

/** The bundle's layout, for the cities part. */
function loadSE() {
  const bundle = process.env.SE_BUNDLE || path.join(__dirname, '..', '..', 'simulation.js');
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(bundle, 'utf8'), ctx);
  if (!ctx.SE || !ctx.SE.layoutCity) throw new Error(`${bundle} has no layoutCity — build first`);
  return ctx.SE;
}

/** A river line through the middle tile of a 3 × 3 patch: [x0, y0, x1, y1, radius] in patch pixels, or null. */
const RIVERS = [
  null,
  [24, 0, 24, 48, 2],
  [28, 0, 27, 48, 1.5],
  [21, 0, 27, 48, 2.5],
  [0, 22, 48, 26, 2],
  [16, 0, 48, 30, 2],
];

function riverDistance(r, x, y) {
  const [ax, ay, bx, by, rad] = r;
  const vx = bx - ax;
  const vy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(x - ax - t * vx, y - ay - t * vy) - rad;
}

/** The committed atlas (indexed PNG, filter 0 on every row) as RGBA, the way the map decodes it. */
function atlasPixels(SE) {
  const buf = Buffer.from(SE.CIV_ATLAS_PNG.slice(SE.CIV_ATLAS_PNG.indexOf(',') + 1), 'base64');
  const M = SE.CIV_MANIFEST;
  const idat = [];
  for (let p = 8; p < buf.length;) {
    const len = buf.readUInt32BE(p);
    if (buf.toString('ascii', p + 4, p + 8) === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const data = new Uint8Array(M.width * M.height * 4);
  for (let y = 0; y < M.height; y++) {
    for (let x = 0; x < M.width; x++) data.set(P.PALETTE[raw[y * (M.width + 1) + 1 + x]], (y * M.width + x) * 4);
  }
  return { w: M.width, data };
}

/**
 * Per era: village, town and metropolis on meadow, and a town and a
 * metropolis astride a river (with its bridge from the Bronze Age), composed
 * by the map's own code (SE.layoutCity, SE.composeCity) at 3×.
 */
function partCities() {
  const SE = loadSE();
  const terrain = buildTerrain();
  const atlas = atlasPixels(SE);
  const { w: PW, h: PH } = SE.cityPictureSize();
  const cells = [];
  const sizes = ['Dorf', 'Stadt', 'Grossstadt'];
  const W = 48;
  const H = 48;
  C.ERAS.forEach((era, e) => {
    cells.push({ w: 1240 - 40, h: 12, draw: (s, x, y) => s.text(ERA_NAMES[era], x, y + 2, INK) });
    const cases = [0, 1, 2].map((size) => ({ size, river: null, g: 'meadow' }));
    cases.push({ size: 1, river: RIVERS[1], g: 'steppe' }, { size: 2, river: RIVERS[4], g: 'forest' });
    cases.forEach((cs, n) => {
      const tx = 40 + n * 9 + e * 3;
      const ty = 30 + e * 5;
      const ox = tx * 16 - 16;
      const oy = ty * 16 - 16;
      const near = (x, y, pad) => !!cs.river && riverDistance(cs.river, x - ox, y - oy) <= pad;
      const rivers = !cs.river ? 0 : cs.river === RIVERS[4] ? 3 : 12;
      const list = SE.layoutCity({ x: tx, y: ty, era: e + 1, size: cs.size, tribe: (e + n) % 8, near, rivers });
      const pic = new Uint8Array(PW * PH * 4);
      SE.composeCity(list, SE.cityWetMask(tx, ty, near), atlas, pic);
      const ground = groundTex(terrain, cs.g);
      const rgba = compose(W, H, (x, y) => (cs.river && riverDistance(cs.river, x, y) <= 0 ? P.c('water4') : ground.get(x, y)), []);
      // The city picture over the ground: its pixel (PAD, PAD + 4) is the tile's top left.
      const px0 = 16 - SE.CITY_PAD - (SE.CIV_MANIFEST.box.w - 16) / 2;
      const py0 = 16 - SE.CITY_PAD - (SE.CIV_MANIFEST.box.h - 16);
      for (let y = 0; y < PH; y++) {
        for (let x = 0; x < PW; x++) {
          const a = pic[(y * PW + x) * 4 + 3] / 255;
          if (a === 0) continue;
          const o = ((py0 + y) * W + px0 + x) * 4;
          for (let c = 0; c < 3; c++) rgba[o + c] = Math.round(rgba[o + c] * (1 - a) + pic[(y * PW + x) * 4 + c] * a);
        }
      }
      cells.push({
        w: W * 3, h: 10 + H * 3,
        draw(s, x, y) {
          s.text(`${sizes[cs.size]}${cs.river ? ' am fluss' : ''}`, x, y, DIM, 1);
          put(s, rgba, W, H, x, y + 10, 3);
        },
      });
    });
  });
  return flow(1240, cells);
}

const PARTS = {
  blocks: (art) => partBlocks(art, buildTerrain()),
  cities: () => partCities(),
  compare: (art) => partCompare(art, { loadSE, put, flow, groundTex, ERA_NAMES, INK, DIM }),
};

module.exports = { PARTS, compose, shadowPixels, baseOf, GROUNDS };
