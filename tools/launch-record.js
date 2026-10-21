/* =============================================================================
 * SimEarth 2.0 — record the launch film
 * -----------------------------------------------------------------------------
 * Opens the game in headless Chrome over the DevTools protocol, waits for the
 * title screen, starts the launch film over it (new SE.LaunchFilm with
 * silent hooks) and steps its clock frame by frame (LaunchFilm.hold), so
 * every frame lands on its exact time however slow the capture: an animated
 * PNG, a contact sheet and the single frames, named by their time. Shares
 * Chrome, the lock and the PNG writers with tools/fx-record.js. Uses
 * SE_BUNDLE or --bundle, so a parallel build never touches simulation.js.
 *
 *   node tools/launch-record.js [--from s] [--to s] [--fps N] [--at s,s,…]
 *        [--size WxH] [--reduce] [--seed N] [--epoch id] [--bundle file] [--out dir]
 *
 *     --from/--to  the stretch of the film to record (default 0 to 12)
 *     --fps        frames per film second (default 4)
 *     --at         only these times, e.g. --at 3,3.1,7 (overrides --fps)
 *     --size       viewport (default 960x540)
 *     --reduce     with "Effekte reduzieren"
 *     --seed/--epoch  the home planet (default: the title screen's)
 * ========================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { CHROMES, ROOT, apng, contactSheet, lock, launchChrome, connect, pathToUrl, sleep } = require('./fx-record');

function fail(msg) {
  console.error(`launch-record: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const a = { from: 0, to: 12, fps: 4, at: null, w: 960, h: 540, reduce: false, seed: null, epoch: null, bundle: null, out: null };
  for (let k = 0; k < argv.length; k++) {
    const v = argv[k];
    const next = () => argv[++k];
    if (v === '--from') a.from = Number(next());
    else if (v === '--to') a.to = Number(next());
    else if (v === '--fps') a.fps = Number(next());
    else if (v === '--at') a.at = next().split(',').map(Number);
    else if (v === '--size') [a.w, a.h] = next().split('x').map(Number);
    else if (v === '--reduce') a.reduce = true;
    else if (v === '--seed') a.seed = Number(next());
    else if (v === '--epoch') a.epoch = next();
    else if (v === '--bundle') a.bundle = next();
    else if (v === '--out') a.out = next();
    else fail(`unknown argument ${v}`);
  }
  return a;
}

const PAGE = (bundle) => `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><base href="${pathToUrl(ROOT)}/">
<link rel="stylesheet" href="styles.css"></head><body>
<header id="topbar" class="topbar glass"><nav id="menubar" class="menubar"></nav><div id="hud" class="hud"></div></header>
<main id="desktop" class="stage"></main><div id="toasts" class="toasts"></div><div id="milestones" class="milestones"></div><div id="modal-root" class="modal-root"></div>
<script src="${pathToUrl(bundle)}"></script></body></html>`;

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const bundle = path.resolve(a.bundle || process.env.SE_BUNDLE || path.join(ROOT, 'simulation.js'));
  if (!fs.existsSync(bundle)) fail(`no bundle at ${bundle}`);
  const chrome = CHROMES.find((c) => fs.existsSync(c));
  if (!chrome) fail('no Chrome or Edge found; set CHROME to its path');
  const out = path.resolve(a.out || path.join(os.tmpdir(), 'simearth-launch'));
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(out)) if (f.endsWith('.png')) fs.rmSync(path.join(out, f));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'simearth-launch-'));
  const html = path.join(work, 'launch.html');
  fs.writeFileSync(html, PAGE(bundle));

  const release = await lock();
  const proc = launchChrome(chrome, work, a.w, a.h);
  try {
    const { ws, cdp } = await connect(work, a.w, a.h);
    await cdp.send('Page.navigate', { url: pathToUrl(html) });
    for (let k = 0; ; k++) {
      await sleep(250);
      try { if (await cdp.eval('!!(window.SE && SE.app && SE.app.title)')) break; } catch { /* still loading */ }
      if (k === 240) fail('the title screen never appeared');
    }
    const built = await cdp.eval(`(async () => {
      const app = SE.app;
      ${a.seed !== null ? `app.world.seed = ${a.seed >>> 0}; app.newPlanet({ quiet: true, keepSeed: true });` : ''}
      ${a.epoch ? `app.setEpoch(${JSON.stringify(a.epoch)}); app.newPlanet({ quiet: true, keepSeed: true });` : ''}
      await document.fonts.ready;
      const t0 = performance.now();
      window.__launchDone = null;
      new SE.LaunchFilm(document.body, {
        world: () => app.world,
        reduceEffects: () => ${a.reduce},
        volume: () => 0,
        done: (skipped) => { window.__launchDone = skipped; },
      });
      return performance.now() - t0;
    })()`);
    console.log(`film built in ${built.toFixed(0)} ms`);
    await sleep(700);
    const times = a.at ?? Array.from({ length: Math.floor((a.to - a.from) * a.fps + 1e-9) + 1 }, (_, n) => a.from + n / a.fps);
    const frames = [];
    let slowest = 0;
    for (const t of times) {
      const ms = await cdp.eval(`(() => { const t0 = performance.now(); SE.activeLaunchFilm.hold(${t}); return performance.now() - t0; })()`);
      slowest = Math.max(slowest, ms);
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const png = Buffer.from(shot.data, 'base64');
      frames.push(png);
      fs.writeFileSync(path.join(out, `t${t.toFixed(2).padStart(5, '0')}.png`), png);
    }
    ws.close();
    const ms = times.map((t) => (t - times[0]) * 1000);
    fs.writeFileSync(path.join(out, 'anim.png'), apng(frames, ms.map((m, n) => (n + 1 < ms.length ? ms[n + 1] - m : 1000 / a.fps))));
    fs.writeFileSync(path.join(out, 'sheet.png'), contactSheet(frames, ms, 6));
    console.log(`${frames.length} frames, ${times[0]}–${times[times.length - 1]} s, slowest frame ${slowest.toFixed(1)} ms · ${out}`);
  } finally {
    proc.kill();
    release();
    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* Chrome may still hold the profile */ }
  }
}

main().catch((e) => fail(e.stack || e.message));
