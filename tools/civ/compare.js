/* =============================================================================
 * SimEarth 2.0 — comparison board of settlements
 * -----------------------------------------------------------------------------
 *   compare  per era the camp of a wandering group (Stone Age only), village,
 *            town and metropolis, and a metropolis astride a river, all on
 *            the same tile of meadow with the same tribe colour, so only era
 *            and size differ. Composed by the map's own code (layoutCity,
 *            layoutCamp, composeCity from the bundle: SE_BUNDLE or
 *            simulation.js) from the atlas built in memory, so a recipe
 *            shows here before the atlas is written. Each case at 3× and,
 *            below, the whole board at 1× (16 px per tile) and 2×.
 * ========================================================================== */
'use strict';

const C = require('./catalog');
const P = require('../terrain/palette');
const { assemble } = require('./atlas');
const { build: buildTerrain } = require('../terrain/build');

/** The tile every case stands on: the same hashes for all, so only era and size differ. */
const TX = 40;
const TY = 30;
const TRIBE = 1;
/** Patch of 3 × 3 tiles around the city tile, and a river down its middle for the last column. */
const W = 48;
const H = 48;
const RIVER = [24, 0, 24, 48, 2];

function riverDistance(r, x, y) {
  const [ax, ay, bx, by, rad] = r;
  const vx = bx - ax;
  const vy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(x - ax - t * vx, y - ay - t * vy) - rad;
}

/** The in-memory atlas as the map decodes it: RGBA and manifest. */
function memoryAtlas(art) {
  const { px, size, manifest } = assemble(art);
  const data = new Uint8Array(size.w * size.h * 4);
  for (let i = 0; i < px.length; i++) data.set(P.PALETTE[px[i]], i * 4);
  return { atlas: { w: size.w, data }, m: manifest };
}

/**
 * One case as a W × H RGBA patch: meadow (and water where the river runs),
 * the composed picture over it. `kind` is 'camp' or a size stage 0..2.
 */
function patch(SE, atlas, m, ground, era, kind, river) {
  const ox = TX * 16 - 16;
  const oy = TY * 16 - 16;
  const near = (x, y, pad) => !!river && riverDistance(river, x - ox, y - oy) <= pad;
  const wet = SE.cityWetMask(TX, TY, near);
  let list;
  if (kind === 'camp') {
    if (!SE.layoutCamp) return null;
    list = SE.layoutCamp({ x: TX, y: TY, shelters: 3, near, wet }, m);
  } else {
    list = SE.layoutCity({ x: TX, y: TY, era: era + 1, size: kind, tribe: TRIBE, near, rivers: river ? 12 : 0, wet }, m);
  }
  const { w: PW, h: PH } = SE.cityPictureSize(m);
  const pic = new Uint8Array(PW * PH * 4);
  SE.composeCity(list, wet, atlas, pic, m);
  // The still frames the map draws over fire places and chimneys (src/cityfire.ts), as with reduced effects.
  const still = (id, x, y) => {
    const sp = m.blocks[id] && m.blocks[id].variants[0];
    if (!sp) return;
    const left = (PW - 16) / 2 + x - sp.ax;
    const top = PH - 16 - SE.CITY_PAD + y - 1 - sp.ay;
    for (let sy = 0; sy < sp.rect.h; sy++) {
      for (let sx = 0; sx < sp.rect.w; sx++) {
        const a = ((sp.rect.y + sy) * atlas.w + sp.rect.x + sx) * 4;
        const px = left + sx;
        const py = top + sy;
        if (atlas.data[a + 3] < 128 || px < 0 || py < 0 || px >= PW || py >= PH) continue;
        pic.set([atlas.data[a], atlas.data[a + 1], atlas.data[a + 2], 255], (py * PW + px) * 4);
      }
    }
  };
  for (const b of list) {
    const sp = m.blocks[b.id].variants[b.v];
    if (m.blocks[b.id].role === 'fire') still('flame', b.fx, b.fy);
    for (let k = 0; sp.smoke && k < sp.smoke.length; k += 2) still('smoke', b.fx - sp.ax + sp.smoke[k], b.fy - sp.ay + sp.smoke[k + 1]);
  }
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = river && riverDistance(river, x, y) <= 0 ? P.c('water4') : ground.get(x, y);
      rgba.set(P.PALETTE[v], (y * W + x) * 4);
    }
  }
  // The picture's pixel (PAD + side, PAD + above) is the tile's top left, at (16, 16) of the patch.
  const px0 = 16 - SE.CITY_PAD - (m.box.w - 16) / 2;
  const py0 = 16 - SE.CITY_PAD - (m.box.h - 16);
  for (let y = 0; y < PH; y++) {
    for (let x = 0; x < PW; x++) {
      const a = pic[(y * PW + x) * 4 + 3] / 255;
      const tx = px0 + x;
      const ty = py0 + y;
      if (a === 0 || tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
      const o = (ty * W + tx) * 4;
      for (let c = 0; c < 3; c++) rgba[o + c] = Math.round(rgba[o + c] * (1 - a) + pic[(y * PW + x) * 4 + c] * a);
    }
  }
  return rgba;
}

function partCompare(art, { loadSE, put, flow, groundTex, ERA_NAMES, INK, DIM }) {
  const SE = loadSE();
  const { atlas, m } = memoryAtlas(art);
  const ground = groundTex(buildTerrain(), 'meadow');
  const COLS = [['Lager', 'camp', null], ['Dorf', 0, null], ['Stadt', 1, null], ['Grossstadt', 2, null], ['Grossstadt am Fluss', 2, RIVER]];
  const rows = C.ERAS.map((era, e) => COLS.map(([label, kind, river]) => ({
    label, rgba: kind === 'camp' && e > 0 ? null : patch(SE, atlas, m, ground, e, kind, river),
  })));
  const WIDTH = 14 + 110 + 14 + COLS.length * (W * 3 + 14) + 14;
  const cells = [];
  C.ERAS.forEach((era, e) => {
    cells.push({ w: 110, h: 10 + H * 3, draw: (s, x, y) => s.text(ERA_NAMES[era], x, y + 10 + H * 1.5 - 4, INK) });
    for (const c of rows[e]) {
      cells.push({
        w: W * 3, h: 10 + H * 3,
        draw(s, x, y) {
          if (!c.rgba) return;
          s.text(c.label, x, y, DIM, 1);
          put(s, c.rgba, W, H, x, y + 10, 3);
        },
      });
    }
  });
  // The whole board again at map size: 1× (16 px per tile) and 2×, one row per era.
  for (const scale of [1, 2]) {
    cells.push({ w: WIDTH - 40, h: 12, draw: (s, x, y) => s.text(`${scale}x (${16 * scale} px je feld)`, x, y + 2, INK) });
    C.ERAS.forEach((era, e) => {
      cells.push({ w: 110, h: H * scale, draw: (s, x, y) => s.text(ERA_NAMES[era], x, y + H * scale / 2 - 4, DIM, 1) });
      for (const c of rows[e]) {
        cells.push({ w: W * scale, h: H * scale, draw: (s, x, y) => { if (c.rgba) put(s, c.rgba, W, H, x, y, scale); } });
      }
      cells.push({ w: WIDTH, h: 0, draw: () => {} });
    });
  }
  return flow(WIDTH, cells);
}

module.exports = { partCompare };
