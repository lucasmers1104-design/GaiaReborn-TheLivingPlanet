'use strict';
/*
 * The living-interface art contract (tools/uiart/catalog.js): the committed
 * UI atlas is what the recipes produce, every catalog sprite is in it, and
 * src/uiart.ts touches no DOM while the bundle loads (Node tests, workers).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { build } = require('../tools/uiart/build');
const { assemble, renderTs } = require('../tools/uiart/atlas');
const C = require('../tools/uiart/catalog');
const P = require('../tools/uiart/palette');
const { encodeIndexed } = require('../tools/terrain/png');

const ROOT = path.join(__dirname, '..');
const STALE = 'run node tools/ui-atlas.js --write (with --placeholders while a family has no recipe file)';

test('the committed UI atlas is what the recipes produce', () => {
  const art = build({ placeholders: true });
  assert.deepEqual(art.problems, []);
  const out = assemble(art);
  const png = encodeIndexed(out.size.w, out.size.h, out.px, P.PALETTE);
  const committed = fs.readFileSync(path.join(ROOT, 'src', 'uiatlas.ts'), 'utf8');
  assert.ok(committed === renderTs(png, out.manifest), `src/uiatlas.ts is stale: ${STALE}`);
  assert.ok(fs.readFileSync(path.join(ROOT, 'assets', 'uiart', 'atlas.png')).equals(png), `assets/uiart/atlas.png is stale: ${STALE}`);
});

test('every catalog sprite is in the manifest with its box and frames', () => {
  const { manifest } = assemble(build({ placeholders: true }));
  for (const s of C.SPRITES) {
    const m = manifest.sprites[s.id];
    assert.ok(m, `${s.id} is missing`);
    assert.equal(m.frames.length, s.frames, `${s.id} frames`);
    for (const r of m.frames) assert.ok(r.w === s.w && r.h === s.h, `${s.id} frame ${r.w}×${r.h}, the catalog says ${s.w}×${s.h}`);
  }
});

test('every frame lies inside the atlas and no two frames overlap', () => {
  const { manifest } = assemble(build({ placeholders: true }));
  const rects = Object.entries(manifest.sprites).flatMap(([id, e]) => e.frames.map((r, f) => ({ ...r, name: `${id}#${f}` })));
  for (const r of rects) assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= manifest.width && r.y + r.h <= manifest.height, `${r.name} outside the atlas`);
  for (let a = 0; a < rects.length; a++) {
    for (let b = a + 1; b < rects.length; b++) {
      const p = rects[a];
      const q = rects[b];
      assert.ok(p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y, `${p.name} overlaps ${q.name}`);
    }
  }
});

test('src/uiart.ts touches no DOM while the bundle loads', () => {
  const file = path.join(ROOT, 'src', 'uiart.ts');
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.ES2020, true);
  const DOM = new Set(['document', 'window', 'Image', 'matchMedia', 'innerWidth', 'innerHeight', 'devicePixelRatio', 'navigator', 'localStorage']);
  // Function bodies and instance fields run later (on a call, in a constructor); static fields run at load.
  const later = (n) => ts.isFunctionLike(n) || (ts.isPropertyDeclaration(n) && !n.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword));
  const found = [];
  const walk = (n) => {
    if (later(n) || ts.isTypeNode(n)) return;
    const named = n.parent && (ts.isPropertyAccessExpression(n.parent) || ts.isPropertyAssignment(n.parent)) && n.parent.name === n;
    if (ts.isIdentifier(n) && DOM.has(n.text) && !named) found.push(`${n.text} at line ${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`);
    ts.forEachChild(n, walk);
  };
  walk(sf);
  assert.deepEqual(found, []);
});
