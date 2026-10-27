/* =============================================================================
 * Gaia Reborn — record the trailer's raw footage
 * -----------------------------------------------------------------------------
 * Records the shots of tools/trailer/shots.js as numbered PNG sequences:
 * tmp/trailer/<shot>/0000.png …, 1920×1080, 30 fps, plus sheet.png (a contact
 * sheet). The films come frame-exact from tools/intro-record.js and
 * tools/launch-record.js (--clean); scenes in the game from tools/ui-shot.js
 * under the virtual clock of tools/trailer/page.js: requestAnimationFrame,
 * timers, Web Animations, performance.now and Date.now only move when a frame
 * is taken, so every frame lands 1/30 s after the last however slow the capture.
 * No sound; but every effect the game starts is logged with its frame
 * (sfx.json), for tools/trailer-cut.js to lay the same file in step.
 *
 *   node tools/trailer-record.js [shot …]   (ids or their number, e.g. 05; default all)
 * ========================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { ROOT, contactSheet } = require('./fx-record');
const { VIRTUAL_CLOCK, CSS_UI, CSS_MAP, CSS_CLEAN } = require('./trailer/page');
const { SHOTS } = require('./trailer/shots');

const OUT = path.join(ROOT, 'tmp', 'trailer');
const FPS = 30;
const W = 1920;
const H = 1080;
/** Map shots take these frames first and drop them: right after the camera arrives, the landscape may still be composing. */
const PREROLL = 8;

/**
 * Page script: a save from tmp/perf or a new planet of `epoch`; game speed 0..4, camera at x, y (else where a pan
 * starts) with zoom px per tile, then `then`.
 */
function setup({ css = CSS_CLEAN, epoch, seed, save, x = undefined, y = undefined, from, zoom, speed = 0, then = '' }) {
  if (x === undefined && from) [x, y] = from;
  const load = save
    ? `localStorage.setItem('scene.save', ${JSON.stringify(fs.readFileSync(path.join(ROOT, save), 'utf8'))});
  const ok = await app.loadFrom('scene.save');
  localStorage.removeItem('scene.save');
  if (!ok) throw new Error('load failed');`
    : `${seed !== undefined ? `app.world.seed = ${seed};` : ''}
  app.setEpoch(${JSON.stringify(epoch)});
  app.newPlanet({ quiet: true, keepSeed: true });`;
  return `(async () => {
  const app = SE.app;
  // Effects play (muted by Chrome) only at a volume above 0: so that they are logged.
  SE.SFX.volume = () => 1;
  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: ${JSON.stringify(css)} }));
  if (app.title) app.title.close();
  ${load}
  app.setSpeed(${speed});
  const v = app.editView;
  ${zoom ? `v.tilePx = ${zoom};` : ''}
  ${x !== undefined ? `v.centerOn(${x}, ${y});` : ''}
  v.markDirty();
  ${then}
  return { ticks: app.world.ticks, seed: app.world.seed };
})()`;
}

/**
 * Frame script: an eased pan from `from` to `to` (tiles), `act` at frame f (0 after the preroll), then 1/30 s on the
 * clock; after the last frame the sounds started (sfx.json) and the value of `log` (log.json), which record() saves.
 */
function each({ frames, from, to, act = '', log }) {
  const pan = from && to
    ? `const k = Math.max(0, f) / ${frames - 1};
  const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
  SE.app.editView.centerOn(${from[0]} + ${to[0] - from[0]} * e, ${from[1]} + ${to[1] - from[1]} * e);`
    : '';
  return `if (f === 0) __vt.start();
  f -= ${PREROLL};
  window.__f = f;
  const app = SE.app;
  ${pan}
  if (f >= 0) {
    ${act}
  }
  app.editView.markDirty();
  __vt.step(${1000 / FPS});
  if (f === ${frames - 1}) return { sfx: __sfx.filter((e) => e[0] >= 0), log: ${log || 'null'} };`;
}

/** Runs a tool; its output is passed on and returned. */
function node(args) {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', maxBuffer: 64 << 20 });
  process.stdout.write(r.stdout || '');
  if (r.status !== 0) throw new Error(`${path.basename(args[0])} failed (${r.status})`);
  return r.stdout;
}

/** The recorder's frames, in time order, as 0000.png … and a contact sheet. */
function renumber(dir, pattern) {
  const files = fs.readdirSync(dir).filter((f) => pattern.test(f));
  const num = (f) => Number(f.match(/([\d.]+)\.png$/)[1]);
  files.sort((a, b) => num(a) - num(b));
  const named = files.map((f, n) => {
    const to = `${String(n).padStart(4, '0')}.png`;
    fs.renameSync(path.join(dir, f), path.join(dir, `_${to}`));
    return to;
  });
  for (const f of named) fs.renameSync(path.join(dir, `_${f}`), path.join(dir, f));
  for (const f of ['anim.png', 'sheet.png']) fs.rmSync(path.join(dir, f), { force: true });
  const frames = named.map((f) => fs.readFileSync(path.join(dir, f)));
  fs.writeFileSync(path.join(dir, 'sheet.png'), contactSheet(frames, frames.map((_, n) => (n * 1000) / FPS), 3));
  return named.length;
}

function record(shot) {
  const dir = path.join(OUT, shot.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  if (shot.film) {
    node([path.join(__dirname, `${shot.film}-record.js`), '--clean', '--size', `${W}x${H}`, '--fps', String(FPS),
      '--from', String(shot.from), '--to', String(shot.to), '--out', dir]);
    return renumber(dir, /^t[\d.]+\.png$/);
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'gaia-trailer-'));
  try {
    const file = (name, text) => { const p = path.join(work, name); fs.writeFileSync(p, text); return `@${p}`; };
    const out = node([path.join(__dirname, 'ui-shot.js'), '--page', 'index', '--wait', '0', '--query', 'sim=direct&waterfx=off',
      '--w', String(W / (shot.dpr || 1)), '--h', String(H / (shot.dpr || 1)), '--dpr', String(shot.dpr || 1), '--init', file('clock.js', VIRTUAL_CLOCK), '--eval', file('setup.js', setup(shot)),
      '--wait2', String(shot.settle ?? 2500), '--frames', String(shot.frames + PREROLL), '--gap', String(shot.gap ?? 40), '--each', file('each.js', each(shot)),
      '--timeout', '900000', '--out', path.join(dir, 'f.png')]);
    const last = out.match(/^each \d+: (\{"sfx".*)$/m);
    if (!last) throw new Error(`${shot.id}: no sound log after the last frame`);
    const { sfx, log } = JSON.parse(last[1]);
    fs.writeFileSync(path.join(dir, 'sfx.json'), JSON.stringify(sfx));
    if (log) fs.writeFileSync(path.join(dir, 'log.json'), JSON.stringify(log));
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  for (let n = 0; n < PREROLL; n++) fs.rmSync(path.join(dir, `f-${n}.png`));
  return renumber(dir, /^f-\d+\.png$/);
}

function main() {
  const want = process.argv.slice(2);
  const picked = want.length ? SHOTS.filter((s) => want.some((w) => s.id === w || s.id.startsWith(`${w}-`))) : SHOTS;
  if (!picked.length) throw new Error(`no shot ${want.join(' ')} (${SHOTS.map((s) => s.id).join(', ')})`);
  for (const shot of picked) {
    const t0 = Date.now();
    const n = record(shot);
    console.log(`${shot.id}: ${n} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s · ${path.join(OUT, shot.id)}`);
  }
}

// Required, it records shots defined elsewhere (trying out a new shot before it joins SHOTS).
module.exports = { SHOTS, record, CSS_UI, CSS_MAP, CSS_CLEAN, PREROLL, FPS, OUT };

if (require.main === module) {
  try { main(); } catch (e) { console.error(`trailer-record: ${e.message}`); process.exit(1); }
}
