#!/usr/bin/env node
/*
 * Wraps the built simulation.js in one named function, `seBundle`, and calls
 * it. A page opened over file:// can neither fetch its own script nor start a
 * Worker from a file, but it can read the function's source back
 * (Function.prototype.toString returns the exact source text) and start a
 * classic Blob worker from it: the simulation worker runs byte for byte the
 * code the page runs (src/simhost.ts). Runs after every `npm run build`; an
 * unwrapped bundle (`npm run watch`, a scratch build) simply plays without
 * the worker.
 *
 *   node tools/wrap-bundle.js [bundle]   (default: simulation.js)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const bundle = path.resolve(process.argv[2] || path.join(__dirname, '..', 'simulation.js'));
const HEAD = 'function seBundle() {\n';
const TAIL = '\nglobalThis.SE = SE;\n}\nseBundle();\n';
const src = fs.readFileSync(bundle, 'utf8');
if (src.startsWith(HEAD)) process.exit(0);
if (!src.startsWith('"use strict";')) {
  console.error(`wrap-bundle: ${bundle} does not start with "use strict"; not a tsc bundle`);
  process.exit(1);
}
fs.writeFileSync(bundle, HEAD + src + TAIL);
