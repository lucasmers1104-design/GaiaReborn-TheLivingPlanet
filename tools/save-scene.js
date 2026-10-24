/* =============================================================================
 * Gaia Reborn — a save as a screenshot scene
 * -----------------------------------------------------------------------------
 * Writes a page script for tools/ui-shot.js (`--page index --eval @<out>`)
 * that loads a save (e.g. tmp/perf/reef.save from `perf-bench.js saves`),
 * pauses the planet, hides everything but the map and centres the camera.
 * The same world, camera and zoom every time: with `?animclock=<ms>` and
 * `--each` one page compares views, e.g. the water effects off and on:
 *
 *   node tools/save-scene.js tmp/perf/reef.save <dir>/reef.js --x 232 --y 77 --zoom 32
 *   node tools/ui-shot.js --page index --query "animclock=20000" --eval @<dir>/reef.js --wait2 2500 \
 *     --frames 2 --gap 2000 --each "SE.app.editView.waterFx.enabled = f === 1; SE.app.editView.markDirty()" --out <dir>/wfx.png
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const [save, out, ...rest] = process.argv.slice(2);
if (!save || !out) {
  console.error('usage: save-scene.js <save> <out.js> [--x tile] [--y tile] [--zoom px]');
  process.exit(1);
}
const opt = (name, def) => {
  const k = rest.indexOf(`--${name}`);
  return k >= 0 ? Number(rest[k + 1]) : def;
};
const x = opt('x', 232);
const y = opt('y', 77);
const zoom = opt('zoom', 32);

fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, `(async () => {
  const app = SE.app;
  // Milestone cards and toasts would cover the map.
  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: '.showcase, .showcase-backdrop, .milestones, .toast-card, .toasts, .magic-layer, .magic-glow { display: none !important; }' }));
  if (app.title) { app.title.close(); app.title = null; }
  localStorage.setItem('scene.save', ${JSON.stringify(fs.readFileSync(save, 'utf8'))});
  const ok = await app.loadFrom('scene.save');
  localStorage.removeItem('scene.save');
  if (!ok) throw new Error('load failed');
  if (app.sim) await app.sim.idle();
  app.enterGame(0);
  app.setSpeed(0);
  // Only the map: every element beside the canvas's ancestors is hidden (a dialog opened later shows).
  let el = document.querySelector('canvas.world-canvas');
  while (el.parentElement) {
    for (const s of el.parentElement.children) if (s !== el && s.tagName !== 'SCRIPT' && s.tagName !== 'STYLE') s.style.visibility = 'hidden';
    el = el.parentElement;
  }
  const v = app.editView;
  v.tilePx = ${zoom};
  v.centerOn(${x}, ${y});
  v.markDirty();
  return { ticks: app.world.ticks, seed: app.world.seed };
})()
`);
console.log(`${out}: ${save} at ${x}, ${y}, ${zoom} px per tile`);
