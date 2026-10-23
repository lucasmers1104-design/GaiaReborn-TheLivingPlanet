/* =============================================================================
 * Gaia Reborn — a bundle with its own UI atlas
 * -----------------------------------------------------------------------------
 * For living-interface work in parallel: builds the UI atlas from the current
 * recipes into a folder of one's own, compiles the game with that atlas in
 * place of src/uiatlas.ts and wraps it for the Blob workers
 * (tools/wrap-bundle.js). Neither simulation.js nor src/uiatlas.ts is
 * touched; only the lead writes those (ui-atlas --write, npm run build).
 *
 *   node tools/ui-bundle.js --out <dir> [--placeholders]
 *
 * Prints the bundle path last (<dir>/simulation.js) for tools/ui-shot.js
 * --bundle and SE_BUNDLE. Other agents' files may not compile for a moment:
 * TypeScript errors are printed, and the bundle tsc still emitted is kept
 * (exit 0); exit 1 only when there is no bundle. Atlas problems are printed
 * and never stop the build (broken frames show as placeholders). The bundle
 * replaces the old one in one rename, so a screenshot never reads half of it.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const P = require('./uiart/palette');
const { build } = require('./uiart/build');
const { assemble, writeOutputs } = require('./uiart/atlas');
const { encodeIndexed } = require('./terrain/png');

const ROOT = path.join(__dirname, '..');
const TSC = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');

function fail(msg) {
  console.error(`ui-bundle: ${msg}`);
  process.exit(1);
}

const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function main() {
  const argv = process.argv.slice(2);
  let out = null;
  let placeholders = false;
  for (let k = 0; k < argv.length; k++) {
    if (argv[k] === '--out' && argv[k + 1]) out = path.resolve(argv[++k]);
    else if (argv[k] === '--placeholders') placeholders = true;
    else fail(`unknown argument ${argv[k]} (usage: --out <dir> [--placeholders])`);
  }
  if (!out) fail('--out <dir> is required');
  fs.mkdirSync(out, { recursive: true });

  const art = build({ placeholders });
  for (const p of art.problems) console.log(`PROBLEM ${p}`);
  const atlas = assemble(art);
  writeOutputs(encodeIndexed(atlas.size.w, atlas.size.h, atlas.px, P.PALETTE), atlas.manifest, out);

  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'tsconfig.json'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''));
  const files = config.files.map((f) => (f === 'src/uiatlas.ts' ? path.join(out, 'uiatlas.ts') : path.join(ROOT, f)));
  const o = config.compilerOptions;
  const tmp = path.join(out, `simulation.${process.pid}.tmp.js`);
  const bundle = path.join(out, 'simulation.js');
  fs.rmSync(tmp, { force: true });
  try {
    execFileSync(process.execPath, [
      TSC, '--outFile', tmp, '--module', o.module, '--target', o.target, '--lib', o.lib.join(','),
      ...(o.strict ? ['--strict'] : []), ...(o.noImplicitOverride ? ['--noImplicitOverride'] : []),
      ...(o.noFallthroughCasesInSwitch ? ['--noFallthroughCasesInSwitch'] : []), ...(o.skipLibCheck ? ['--skipLibCheck'] : []),
      '--forceConsistentCasingInFileNames', '--newLine', o.newLine, ...files,
    ], { cwd: ROOT, stdio: 'pipe', maxBuffer: 64 << 20 });
  } catch (e) {
    console.error(`ui-bundle: TypeScript errors:\n${(e.stdout || '').toString()}${(e.stderr || '').toString()}`);
  }
  if (!fs.existsSync(tmp)) fail('tsc emitted no bundle');
  execFileSync(process.execPath, [path.join(__dirname, 'wrap-bundle.js'), tmp], { stdio: 'inherit' });
  // A screenshot may be reading the old bundle; Windows refuses the rename until it lets go.
  for (let k = 0; ; k++) {
    try {
      fs.renameSync(tmp, bundle);
      break;
    } catch (e) {
      if (k === 20) { fs.rmSync(tmp, { force: true }); fail(`cannot replace ${bundle}: ${e.message}`); }
      pause(100);
    }
  }
  console.log(bundle);
}

main();
