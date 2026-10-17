/* =============================================================================
 * SimEarth 2.0 — terrain atlas generator
 * -----------------------------------------------------------------------------
 * Builds every landscape texture, edge mask, water overlay and plant object from the
 * recipes in tools/terrain/, packs them into one indexed PNG and writes the
 * manifest the renderer reads. Deterministic: the same recipes give the same
 * bytes. See docs/biomes-spec.md (§4.8) and docs/landschaft-2026-10/stil.md.
 *
 *   node tools/terrain-atlas.js [--check] [--sheet [dir]] [--part a,b] [--family f] [--write]
 *
 *     (none)    build in memory and list problems
 *     --check   also verify determinism; exit 1 on any problem
 *     --sheet   write contact sheets (one PNG per part) to dir
 *               (default: <OS temp>/simearth-terrain); parts: palette,
 *               materials, transitions, masks, objects, objects-light,
 *               scenes, desert, savanna — pick some with --part
 *     --family  build and show only cold | temperate | warm | wet | mountain | coast
 *               (sheets that need other families are skipped)
 *     --write   write assets/terrain/atlas.png, assets/terrain/manifest.json
 *               and src/terrainatlas.ts — the lead does this when merging,
 *               never several agents at once
 * ========================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('./terrain/catalog');
const P = require('./terrain/palette');
const { build } = require('./terrain/build');
const { assemble, writeOutputs } = require('./terrain/atlas');
const { encodeIndexed, encodeRGBA } = require('./terrain/png');
const { PARTS } = require('./terrain/sheet');

function parseArgs(argv) {
  const a = { check: false, sheet: null, parts: null, family: null, write: false };
  for (let k = 0; k < argv.length; k++) {
    const v = argv[k];
    if (v === '--check') a.check = true;
    else if (v === '--write') a.write = true;
    else if (v === '--sheet') a.sheet = argv[k + 1] && !argv[k + 1].startsWith('--') ? argv[++k] : path.join(os.tmpdir(), 'simearth-terrain');
    else if (v === '--part') a.parts = argv[++k].split(',');
    else if (v === '--family') a.family = argv[++k];
    else throw new Error(`unknown argument ${v}`);
  }
  if (a.family && !C.FAMILIES.includes(a.family)) throw new Error(`--family must be one of ${C.FAMILIES.join(', ')}`);
  if (a.family && a.write) throw new Error('--write needs every family');
  return a;
}

function writeSheets(art, dir, parts, family) {
  fs.mkdirSync(dir, { recursive: true });
  const needAll = new Set(['transitions', 'scenes', 'desert', 'savanna']);
  for (const name of parts || Object.keys(PARTS)) {
    if (!PARTS[name]) throw new Error(`unknown part ${name}`);
    if (family && needAll.has(name)) { console.log(`skip ${name} (needs every family)`); continue; }
    const s = PARTS[name](art);
    const file = path.join(dir, `${name}.png`);
    fs.writeFileSync(file, encodeRGBA(s.w, s.h, s.data));
    console.log(`sheet ${file} (${s.w}×${s.h})`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const art = build(args.family);
  const problems = [...art.problems];

  let out = null;
  if (!args.family) {
    // A missing recipe is already a problem; packing would only fail on it again.
    try { out = assemble(art); } catch (e) { problems.push(`atlas: cannot pack (${e.message})`); }
    if (args.check && out) {
      const again = assemble(build());
      const a = encodeIndexed(out.size.w, out.size.h, out.px, P.PALETTE);
      const b = encodeIndexed(again.size.w, again.size.h, again.px, P.PALETTE);
      if (!a.equals(b)) problems.push('determinism: two builds differ — a recipe uses Math.random, Date or shared state');
    }
  }

  for (const p of problems) console.log(`PROBLEM ${p}`);
  console.log(`${problems.length} problem(s); palette ${P.PALETTE.length - 1} colours`);

  if (args.sheet) writeSheets(art, args.sheet, args.parts, args.family);
  if (args.write) {
    if (problems.length) { console.error('not writing: fix the problems first'); process.exit(1); }
    writeOutputs(encodeIndexed(out.size.w, out.size.h, out.px, P.PALETTE), out.manifest);
  }
  if (args.check && problems.length) process.exit(1);
}

main();
