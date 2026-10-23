/* =============================================================================
 * Gaia Reborn — living-interface atlas generator
 * -----------------------------------------------------------------------------
 * Builds every sprite of the living interface (Gaia, her rock, vines, frames,
 * icons, magic) from the recipes in tools/uiart/, in the UI palette
 * (tools/uiart/palette.js), packs them into one indexed PNG and writes the
 * manifest src/uiart.ts reads. Contract: tools/uiart/catalog.js.
 * Deterministic: the same recipes give the same bytes.
 *
 *   node tools/ui-atlas.js [--check] [--sheet [file]] [--preview [file]] [--part a,b]
 *        [--family a,b] [--placeholders] [--write | --out dir]
 *
 *     (none)          build in memory and list problems
 *     --check         also build twice and compare the PNG bytes; exit 1 on any problem
 *     --sheet         contact sheet PNG, every frame ×4 (default <OS temp>/gaia-ui-sheet.png)
 *     --preview       composed scenes ×3 (default <OS temp>/gaia-ui-preview.png);
 *                     --part limits them to gaia, face, rail, topbar, vines, magic
 *     --family        build only these families (the others count as not drawn yet)
 *     --placeholders  stand-in frames for every sprite without art
 *     --write         write assets/uiart/atlas.png and src/uiatlas.ts (the lead only);
 *                     refuses with problems or --family
 *     --out           write atlas.png and uiatlas.ts into dir instead, even with
 *                     problems (an agent's own bundle: tools/ui-bundle.js)
 * ========================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('./uiart/catalog');
const P = require('./uiart/palette');
const { build } = require('./uiart/build');
const { assemble, writeOutputs } = require('./uiart/atlas');
const { sheet } = require('./uiart/sheet');
const { preview, PARTS } = require('./uiart/preview');
const { encodeIndexed, encodeRGBA } = require('./terrain/png');

function fail(msg) {
  console.error(`ui-atlas: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const a = { check: false, sheet: null, preview: null, parts: null, write: false, families: null, out: null, placeholders: false };
  const given = (k) => argv[k + 1] !== undefined && !argv[k + 1].startsWith('--');
  for (let k = 0; k < argv.length; k++) {
    const v = argv[k];
    if (v === '--check') a.check = true;
    else if (v === '--write') a.write = true;
    else if (v === '--placeholders') a.placeholders = true;
    else if (v === '--family') a.families = (argv[++k] ?? '').split(',').filter(Boolean);
    else if (v === '--part') a.parts = (argv[++k] ?? '').split(',').filter(Boolean);
    else if (v === '--out') a.out = argv[++k];
    else if (v === '--sheet') a.sheet = given(k) ? argv[++k] : path.join(os.tmpdir(), 'gaia-ui-sheet.png');
    else if (v === '--preview') a.preview = given(k) ? argv[++k] : path.join(os.tmpdir(), 'gaia-ui-preview.png');
    else fail(`unknown argument ${v}`);
  }
  for (const f of a.families ?? []) if (!C.FAMILIES.includes(f)) fail(`unknown family '${f}' (families: ${C.FAMILIES.join(', ')})`);
  for (const p of a.parts ?? []) if (!PARTS[p]) fail(`unknown preview part '${p}' (parts: ${Object.keys(PARTS).join(', ')})`);
  if (a.write && a.out) fail('--write and --out exclude each other');
  if (a.out === undefined) fail('--out needs a directory');
  return a;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const opts = { families: args.families, placeholders: args.placeholders };
  const art = build(opts);
  const problems = [...art.problems];
  const out = assemble(art);
  const png = encodeIndexed(out.size.w, out.size.h, out.px, P.PALETTE);
  if (args.check) {
    const again = assemble(build(opts));
    if (!png.equals(encodeIndexed(again.size.w, again.size.h, again.px, P.PALETTE))) {
      problems.push('determinism: two builds differ — a recipe uses Math.random, Date or shared state');
    }
  }
  for (const p of problems) console.log(`PROBLEM ${p}`);
  const ids = Object.keys(art.sprites);
  const stand = ids.filter((id) => art.placeholder[id]).length;
  console.log(`${problems.length} problem(s); ${ids.length} of ${C.SPRITES.length} sprites (${stand} placeholders), atlas ${out.size.w}×${out.size.h}`);
  if (args.sheet) {
    const s = sheet(art);
    fs.writeFileSync(args.sheet, encodeRGBA(s.w, s.h, s.data));
    for (const l of s.legend) console.log(`  ${l}`);
    console.log(`sheet ${args.sheet} (${s.w}×${s.h})`);
  }
  if (args.preview) {
    const s = preview(art, args.parts);
    fs.writeFileSync(args.preview, encodeRGBA(s.w, s.h, s.data));
    console.log(`preview ${args.preview} (${s.w}×${s.h})`);
  }
  if (args.write) {
    if (args.families) fail('--write needs every family (no --family)');
    if (problems.length) fail('not writing: fix the problems first');
    writeOutputs(png, out.manifest);
  } else if (args.out) {
    if (problems.length) console.log(`writing anyway into ${args.out}: ${problems.length} problem(s) above`);
    fs.mkdirSync(path.resolve(args.out), { recursive: true });
    writeOutputs(png, out.manifest, path.resolve(args.out));
  }
  if (args.check && problems.length) process.exit(1);
}

main();
