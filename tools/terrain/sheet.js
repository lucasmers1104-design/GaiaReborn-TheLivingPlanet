/* =============================================================================
 * SimEarth 2.0 — terrain contact sheets
 * -----------------------------------------------------------------------------
 * One PNG per part, so each stays small enough to look at:
 *   palette · materials · transitions · masks · objects · scenes · desert · savanna
 * Labels use a 3×5 pixel font; everything is drawn with nearest-neighbour
 * scaling, exactly as the map shows it.
 * ========================================================================== */
'use strict';

const C = require('./catalog');
const P = require('./palette');
const { Tex } = require('./kit');
const V = require('./preview');

const BG = [28, 34, 32, 255];
const BG_LIGHT = [214, 218, 210, 255];
const INK = [232, 238, 228, 255];
const DIM = [140, 150, 144, 255];

/** 3×5 glyphs, five rows of three. */
const GLYPHS = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], N: ['##.', '#.#', '#.#', '#.#', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '##.'],
  _: ['...', '...', '...', '...', '###'], '-': ['...', '...', '###', '...', '...'], '.': ['...', '...', '...', '...', '.#.'],
  ':': ['...', '.#.', '...', '.#.', '...'], '/': ['..#', '..#', '.#.', '#..', '#..'], '[': ['##.', '#..', '#..', '#..', '##.'],
  ']': ['.##', '..#', '..#', '..#', '.##'], ' ': ['...', '...', '...', '...', '...'],
};
const FONT = Object.fromEntries(Object.entries(GLYPHS).map(([k, rows]) => [k, rows.join('')]));

class Sheet {
  constructor(w, h, bg = BG) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4);
    this.rect(0, 0, w, h, bg);
  }

  rect(x, y, w, h, rgba) {
    for (let yy = Math.max(0, y); yy < Math.min(this.h, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(this.w, x + w); xx++) this.data.set(rgba, (yy * this.w + xx) * 4);
    }
  }

  /** Indexed bitmap at integer scale; transparent pixels leave the sheet alone. */
  blit(t, x, y, scale = 1) {
    for (let sy = 0; sy < t.h; sy++) {
      for (let sx = 0; sx < t.w; sx++) {
        const v = t.px[sy * t.w + sx];
        if (!v) continue;
        this.rect(x + sx * scale, y + sy * scale, scale, scale, P.PALETTE[v]);
      }
    }
  }

  text(str, x, y, rgba = INK, scale = 2) {
    let cx = x;
    for (const ch of String(str).toUpperCase()) {
      const g = FONT[ch] ?? FONT[' '];
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 3; c++) if (g[r * 3 + c] === '#') this.rect(cx + c * scale, y + r * scale, scale, scale, rgba);
      }
      cx += 4 * scale;
    }
  }
}

/** Lay out cells in rows; `cells` = [{ w, h, draw(sheet, x, y) }]. */
function flow(width, cells, gap = 12, top = 12, bg = BG) {
  let x = gap;
  let y = top;
  let rowH = 0;
  const spots = [];
  for (const c of cells) {
    if (x + c.w + gap > width && x > gap) { x = gap; y += rowH + gap; rowH = 0; }
    spots.push([c, x, y]);
    x += c.w + gap;
    rowH = Math.max(rowH, c.h);
  }
  const sheet = new Sheet(width, y + rowH + gap, bg);
  for (const [c, cx, cy] of spots) c.draw(sheet, cx, cy);
  return sheet;
}

/** Tile a seamless texture over `tw`×`th` tiles at world position 0,0. */
function patch(tex, tw, th) {
  const t = new Tex(tw * 16, th * 16);
  t.each((x, y) => tex.get(x, y));
  return t;
}

const LABEL = 14;

function partPalette() {
  const cells = Object.entries(P.RAMP_INDICES).map(([name, idx]) => ({
    w: Math.max(idx.length * 18, name.length * 8),
    h: LABEL + 18,
    draw(s, x, y) {
      s.text(name, x, y, DIM);
      idx.forEach((i, k) => s.rect(x + k * 18, y + LABEL, 16, 16, P.PALETTE[i]));
    },
  }));
  return flow(900, cells);
}

function partMaterials(art) {
  const cells = [];
  for (const mat of C.MATERIALS) {
    (art.materials[mat.id] || []).forEach((tex, d) => cells.push({
      w: 192, h: LABEL + 128,
      draw(s, x, y) {
        s.text(`${mat.id} ${mat.densities > 1 ? `d${d}` : ''}`, x, y, DIM);
        s.blit(patch(tex, 6, 4), x, y + LABEL, 2);
      },
    }));
  }
  for (const ov of C.OVERLAYS) {
    const tex = art.overlays[ov.id];
    if (!tex) continue;
    cells.push({
      w: 192, h: LABEL + 128,
      draw(s, x, y) {
        s.text(ov.id, x, y, DIM);
        s.rect(x, y + LABEL, 192, 128, P.PALETTE[P.c('water3')]);
        s.blit(patch(tex, 6, 4), x, y + LABEL, 2);
      },
    });
  }
  return flow(1240, cells);
}

/** Every material over water, and each against its rank neighbours and the climate chains. */
function partTransitions(art) {
  const have = (id) => !!art.materials[id];
  const top = (id) => ({ mat: id, d: art.materials[id].length - 1 });
  const pairs = [];
  for (const m of C.MATERIALS) if (have(m.id)) pairs.push([top(m.id), { mat: 'water', d: 0, depth: 5 }, `${m.id} / water`]);
  const chain = [
    ['rainforest', 'savanna'], ['savanna', 'semidesert_sand'], ['semidesert_sand', 'sand'], ['semidesert_rock', 'stony_desert'],
    ['lichen_rock', 'ice'], ['tundra', 'lichen_rock'], ['taiga', 'tundra'], ['forest', 'taiga'], ['forest', 'meadow'],
    ['meadow', 'steppe'], ['steppe', 'semidesert_sand'], ['shrub', 'meadow'], ['forest', 'shrub'], ['marsh', 'meadow'],
    ['swamp_forest', 'marsh'], ['marsh', 'mud'], ['moss', 'rock'], ['fern', 'moss'], ['forest', 'fern'], ['snow', 'rock'],
    ['barren', 'rock'], ['sea_ice', 'ice'],
  ];
  for (const [a, b] of chain) if (have(a) && have(b)) pairs.push([top(a), top(b), `${a} / ${b}`]);
  const cells = pairs.map(([a, b, label]) => ({
    w: 160, h: LABEL + 128,
    draw(s, x, y) {
      s.text(label, x, y + 3, DIM, 1);
      s.blit(V.pairPatch(art, a, b), x, y + LABEL, 2);
    },
  }));
  return flow(1240, cells);
}

function partMasks(art) {
  const cells = [];
  art.masks.forEach((vars, kase) => vars.forEach((mask, v) => cells.push({
    w: 64, h: LABEL + 64,
    draw(s, x, y) {
      s.text(`${kase}.${v}`, x, y, DIM);
      for (let i = 0; i < 256; i++) s.rect(x + (i % 16) * 4, y + LABEL + ((i / 16) | 0) * 4, 4, 4, mask[i] ? INK : [70, 80, 76, 255]);
    },
  })));
  return flow(1240, cells, 10);
}

/** A typical ground for an object, from where its group shows it. */
function groundFor(art, ob) {
  if (ob.kind === 'water' || ob.kind === 'reef') return null;
  const entry = ob.group ? C.GROUPS[ob.group].objects.find((o) => o.id === ob.id) : null;
  let wanted = ['meadow'];
  if (entry && entry.where !== '*') wanted = entry.where.filter((w) => w !== 'sea');
  if (!ob.group) wanted = C.ABIOTIC.find((a) => a.id === ob.id)?.where ?? ['rock'];
  // With --family only that family's grounds exist: take the first one built,
  // else any ground of the object's own family.
  const mats = wanted.map((ls) => C.LANDSCAPES.find((l) => l.id === ls).materials.soil);
  const own = C.MATERIALS.filter((m) => m.family === ob.family).map((m) => m.id);
  const mat = [...mats, 'meadow', ...own].find((id) => art.materials[id]);
  const tex = mat ? art.materials[mat] : null;
  return tex ? tex[tex.length - 1] : null;
}

function partObjects(art, bg) {
  const cells = [];
  for (const ob of C.OBJECTS) {
    const vars = art.objects[ob.id];
    if (!vars) continue;
    const ground = groundFor(art, ob);
    const [boxW, boxH] = C.KIND_BOX[ob.kind];
    const step = boxW * 3 + 8;
    cells.push({
      w: Math.max(vars.length * step, 200), h: LABEL + boxH * 3 + 6 + 24,
      draw(s, x, y) {
        s.text(`${ob.id} - ${ob.group || 'abiotic'}`, x, y, DIM);
        vars.forEach((v, n) => {
          const cx = x + n * step;
          const cell = new Tex(boxW, boxH);
          if (ground) cell.each((px, py) => ground.get(px % ground.w, (py + 4) % ground.h));
          else cell.fill(P.c(ob.kind === 'reef' ? 'waterWarm1' : 'water4'));
          cell.stamp(v.tex, Math.floor((boxW - v.tex.w) / 2), boxH - v.tex.h);
          s.blit(cell, cx, y + LABEL, 3);
          s.blit(cell, cx + step - 6 - boxW, y + LABEL + boxH * 3 + 6, 1);
        });
      },
    });
  }
  return flow(1240, cells, 14, 12, bg);
}

const SCENES = [
  {
    name: 'warm gradient: sea - sand - desert - semidesert - savanna - rainforest',
    bands: [['water', 3], ['desert', 2, 'sand'], ['desert', 2], ['semidesert', 3, 'sand'], ['savanna', 5], ['rainforest', 7]],
    groups: ['marineAlgae', 'grasses', 'flowering', 'broadleaf', 'seedPlants', 'ferns'],
    cacti: true,
  },
  {
    name: 'cold gradient: sea ice - ice - lichen - tundra - taiga - mixed forest - meadow - steppe',
    bands: [['ice', 3], ['lichen', 2, 'rock'], ['tundra', 3], ['taiga', 5], ['forest', 4], ['meadow', 3], ['steppe', 2]],
    groups: ['mosses', 'conifers', 'flowering', 'grasses', 'broadleaf'],
  },
  {
    name: 'wet: coast - mud - marsh - swamp forest - fernland',
    bands: [['water', 4], ['barren', 2, 'mire'], ['marsh', 5], ['swampforest', 6], ['fernland', 5]],
    groups: ['marineAlgae', 'freshwaterAlgae', 'landPlants', 'clubmosses', 'ferns', 'carnivorous', 'grasses', 'conifers'],
  },
  {
    name: 'devonian: rock - lichen - moss - fernland - first forest',
    bands: [['water', 3], ['rock', 3, 'rock'], ['lichen', 3, 'rock'], ['moss', 4], ['fernland', 5], ['forest', 4]],
    groups: ['landPlants', 'mosses', 'vascular', 'ferns', 'firstTrees', 'clubmosses'],
  },
];

function partScenes(art) {
  const W = 22;
  const H = 10;
  const cells = SCENES.map((sc, n) => ({
    w: W * 16 * 2, h: LABEL + H * 16 * 2,
    draw(s, x, y) {
      s.text(sc.name, x, y, DIM);
      s.blit(V.bandScene(art, W, H, sc.bands, sc.groups, 31 + n, sc.cacti), x, y + LABEL, 2);
    },
  }));
  return flow(W * 32 + 24, cells, 12);
}

/** Desert to grassland before and after the first cacti, at the map's two typical zooms (×2, ×4). */
const DESERT_BANDS = [['desert', 3, 'sand'], ['desert', 3, 'rock'], ['semidesert', 4, 'sand'], ['semidesert', 3, 'rock'], ['steppe', 3], ['savanna', 4]];
const DESERT_GROUPS = ['grasses', 'flowering', 'broadleaf', 'seedPlants', 'conifers'];

function partDesert(art) {
  const W = 20;
  const H = 8;
  const cells = [];
  for (const [cacti, name] of [[false, 'before the first cacti'], [true, 'with cacti']]) {
    cells.push({
      w: W * 16 * 2, h: LABEL + H * 16 * 2,
      draw(s, x, y) {
        s.text(`desert - semidesert - steppe - savanna, ${name}, x2`, x, y, DIM);
        s.blit(V.bandScene(art, W, H, DESERT_BANDS, DESERT_GROUPS, 47, cacti), x, y + LABEL, 2);
      },
    });
  }
  for (const [cacti, name] of [[false, 'before'], [true, 'with cacti']]) {
    const tex = V.bandScene(art, W, H, DESERT_BANDS, DESERT_GROUPS, 47, cacti);
    const part = new Tex(10 * 16, 5 * 16);
    part.each((px, py) => tex.get(px + 2 * 16, py + 2 * 16));
    cells.push({
      w: part.w * 4, h: LABEL + part.h * 4,
      draw(s, x, y) {
        s.text(`close-up ${name}, x4`, x, y, DIM);
        s.blit(part, x, y + LABEL, 4);
      },
    });
  }
  return flow(W * 32 + 24, cells, 12);
}

/** Desert to forest through the savanna at its three densities, without and with savanna trees (×2, ×4). */
const SAVANNA_BANDS = [['desert', 2, 'sand'], ['semidesert', 3, 'sand'], ['savanna', 4, 'soil', 0], ['savanna', 4, 'soil', 1],
  ['savanna', 4, 'soil', 2], ['forest', 4]];
const SAVANNA_GROUPS = ['grasses', 'flowering', 'broadleaf', 'seedPlants', 'conifers'];
/** The savanna-tree chance by distance to desert and forest (src/savannatrees.ts). */
function savannaTreeShare(dDesert, dForest) {
  const t = dDesert > 6 && dForest > 6 ? 0.5 : dDesert > 6 ? 1 : dForest > 6 ? 0 : dDesert / (dDesert + dForest);
  return 0.08 + (0.35 - 0.08) * t;
}

function partSavanna(art) {
  const W = 21;
  const H = 8;
  const cells = [];
  for (const [trees, name] of [[false, 'before the broadleaf trees'], [true, 'with savanna trees']]) {
    cells.push({
      w: W * 16 * 2, h: LABEL + H * 16 * 2,
      draw(s, x, y) {
        s.text(`desert - semidesert - savanna d0 d1 d2 - forest, ${name}, x2`, x, y, DIM);
        const groups = trees ? SAVANNA_GROUPS : SAVANNA_GROUPS.filter((g) => g !== 'broadleaf');
        s.blit(V.bandScene(art, W, H, SAVANNA_BANDS, groups, 53, true, trees ? savannaTreeShare : undefined), x, y + LABEL, 2);
      },
    });
  }
  const tex = V.bandScene(art, W, H, SAVANNA_BANDS, SAVANNA_GROUPS, 53, true, savannaTreeShare);
  for (const [x0, name] of [[4, 'semidesert to savanna'], [12, 'savanna to forest']]) {
    const part = new Tex(9 * 16, 5 * 16);
    part.each((px, py) => tex.get(px + x0 * 16, py + 2 * 16));
    cells.push({
      w: part.w * 4, h: LABEL + part.h * 4,
      draw(s, x, y) {
        s.text(`close-up ${name}, x4`, x, y, DIM);
        s.blit(part, x, y + LABEL, 4);
      },
    });
  }
  return flow(W * 32 + 24, cells, 12);
}

const PARTS = {
  palette: () => partPalette(),
  materials: (art) => partMaterials(art),
  transitions: (art) => partTransitions(art),
  masks: (art) => partMasks(art),
  objects: (art) => partObjects(art, BG),
  'objects-light': (art) => partObjects(art, BG_LIGHT),
  scenes: (art) => partScenes(art),
  desert: (art) => partDesert(art),
  savanna: (art) => partSavanna(art),
};

module.exports = { PARTS, Sheet };
