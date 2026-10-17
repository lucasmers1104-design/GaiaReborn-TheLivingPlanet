'use strict';
/*
 * The effect art contract (docs/ereignisse-spec.md §2.4): the committed fx
 * atlas is what the recipes produce and keeps the style rules, and the
 * effect layer never rotates pixel art, blurs or fades with transparency.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { build } = require('../tools/fx/build');
const { assemble, renderTs } = require('../tools/fx/atlas');
const C = require('../tools/fx/catalog');
const { encodeIndexed } = require('../tools/terrain/png');
const P = require('../tools/terrain/palette');

test('the committed effect atlas is what the recipes produce', () => {
  const art = build();
  assert.deepEqual(art.problems, []);
  const out = assemble(art);
  const png = encodeIndexed(out.size.w, out.size.h, out.px, P.PALETTE);
  const committed = fs.readFileSync(path.join(__dirname, '..', 'src', 'fxatlas.ts'), 'utf8');
  assert.ok(committed === renderTs(png, out.manifest), 'src/fxatlas.ts is stale: run node tools/fx-atlas.js --write');
  assert.ok(fs.readFileSync(path.join(__dirname, '..', 'assets', 'fx', 'atlas.png')).equals(png), 'assets/fx/atlas.png is stale');
});

test('every catalog entry with a family file has its art, in 8-px boxes or as a tile object', () => {
  const art = build();
  const families = C.FAMILIES.filter((f) => fs.existsSync(path.join(__dirname, '..', 'tools', 'fx', `${f}.js`)));
  for (const s of C.SPRITES) {
    if (!families.includes(s.family)) continue;
    assert.equal(art.sprites[s.id]?.length, s.frames, s.id);
    if (s.tile) assert.ok(s.w === 16 && (s.h === 20 || s.h === 24), `${s.id} tile object 16×20 or 16×24`);
    else assert.equal(s.w % 8 + s.h % 8, 0, `${s.id} box in 8-px steps`);
  }
  for (const t of C.TEXTURES) if (families.includes(t.family)) assert.equal(art.textures[t.id]?.length, t.frames, t.id);
});

test('every frame lies inside the atlas and no two frames overlap', () => {
  const { manifest } = assemble(build());
  const rects = [...Object.entries(manifest.sprites), ...Object.entries(manifest.textures)]
    .flatMap(([id, e]) => e.frames.map((r, f) => ({ ...r, name: `${id}#${f}` })));
  for (const r of rects) assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= manifest.width && r.y + r.h <= manifest.height, `${r.name} outside the atlas`);
  for (let a = 0; a < rects.length; a++) {
    for (let b = a + 1; b < rects.length; b++) {
      const p = rects[a];
      const q = rects[b];
      assert.ok(p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y, `${p.name} overlaps ${q.name}`);
    }
  }
});

test('the effect layer never rotates, blurs or fades pixel art', () => {
  const dir = path.join(__dirname, '..', 'src');
  for (const f of fs.readdirSync(dir).filter((n) => /^(fx.*|whalelayer)\.ts$/.test(n) && n !== 'fxatlas.ts')) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    for (const bad of ['.rotate(', '.filter =', 'shadowBlur', 'globalAlpha']) assert.ok(!src.includes(bad), `${f} uses ${bad}`);
  }
});
