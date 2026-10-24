/* =============================================================================
 * Gaia Reborn — screenshots of the game in headless Chrome
 * -----------------------------------------------------------------------------
 * Opens _preview.html (a fast-forwarded planet, title screen closed, the
 * planet on the page: SE.app drives it) or index.html, with the repository's
 * simulation.js or an agent's own bundle (tools/ui-bundle.js), waits until
 * the page is ready, runs optional scripts in it and saves PNGs. DevTools
 * protocol over Node 22's global WebSocket. One Chrome at a time across
 * processes (a lock directory in the OS temp folder); every run has its own
 * profile and a free port, and Chrome is always killed and the lock always
 * released, also on Ctrl+C, a timeout or an error. Page exceptions and
 * console errors and warnings are printed as they come.
 *
 *   node tools/ui-shot.js [--bundle file.js] [--page preview|index] [--query "ticks=400&seed=7"]
 *        [--w 1440] [--h 900] [--dpr 1] [--init js] [--media name=value,…] [--wait ms] [--eval js] [--wait2 ms] [--eval2 js]
 *        [--clip x,y,w,h[,scale]] [--frames n] [--gap ms] [--each js] [--out file.png] [--timeout ms]
 *
 *     --bundle   a bundle instead of the repository's simulation.js: the page is
 *                copied next to it with <base> on the repository
 *     --page     preview (default, ready when document.title is 'ready') or
 *                index (ready when SE.app exists; the title screen stays up)
 *     --init     runs in the page before its own scripts (e.g. storage that
 *                throws, or no WebGL2), @file too
 *     --media    emulated CSS media features, e.g. prefers-reduced-motion=reduce
 *     --wait     ms after ready (default 500); --eval runs then (awaited, its
 *                value printed as JSON), then --wait2 and --eval2; @file reads
 *                a script (also for --each) from a file
 *     --clip     CSS px of the viewport, optional scale (default 1)
 *     --frames   n screenshots --gap ms apart (default 200) as file-0.png …
 *     --each     runs before every frame as the body of an async function of
 *                the frame number f, then --gap ms pass before the shot; a
 *                returned { dpr } switches the device pixel ratio first, any
 *                other value is printed. One page, many views: e.g. the same
 *                world with the water effects off and on (`?animclock=` pins
 *                the map's animations, SE.app.editView.animClock steps them)
 *     --out      default <OS temp>/gaia-ui-shot.png
 *     --timeout  whole run (default 180000 ms)
 * ========================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { CHROMES, pathToUrl, sleep } = require('./fx-record');

const ROOT = path.join(__dirname, '..');
const LOCK = path.join(os.tmpdir(), 'gaia-ui-shot.lock');
const LOCK_WAIT = 600000;
const LOCK_STALE = 240000;

let chrome = null;
let profile = null;
let page = null;
let locked = false;

/** Kill Chrome (its whole process tree), release the lock, remove the run's files. Synchronous: it also runs on exit. */
function cleanup() {
  if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
    else try { chrome.kill('SIGKILL'); } catch { /* gone */ }
  }
  chrome = null;
  if (locked) {
    try { fs.rmSync(LOCK, { recursive: true, force: true }); } catch { /* gone */ }
    locked = false;
  }
  if (page) { try { fs.rmSync(page, { force: true }); } catch { /* gone */ } page = null; }
  if (profile) { try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Chrome may still hold it */ } profile = null; }
}

function fail(msg, code = 1) {
  console.error(`ui-shot: ${msg}`);
  process.exit(code);
}

process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) process.on(sig, () => fail(`stopped by ${sig}`, 130));
process.on('uncaughtException', (e) => fail(e.stack || e.message));
process.on('unhandledRejection', (e) => fail((e && e.stack) || String(e)));

function parseArgs(argv) {
  const a = {
    bundle: null, page: 'preview', query: '', w: 1440, h: 900, dpr: 1, wait: 500, eval: '', wait2: 0, eval2: '', each: '', init: '', media: '',
    clip: null, frames: 1, gap: 200, out: path.join(os.tmpdir(), 'gaia-ui-shot.png'), timeout: 180000,
  };
  const num = ['w', 'h', 'dpr', 'wait', 'wait2', 'frames', 'gap', 'timeout'];
  for (let k = 0; k < argv.length; k++) {
    const key = argv[k].replace(/^--/, '');
    const v = argv[k + 1];
    if (!argv[k].startsWith('--') || !(key in a) || v === undefined) fail(`bad argument ${argv[k]} (see the header of tools/ui-shot.js)`);
    k++;
    if (num.includes(key)) {
      a[key] = Number(v);
      if (!Number.isFinite(a[key]) || a[key] < 0) fail(`--${key} needs a number`);
    } else if (key === 'clip') {
      a.clip = v.split(',').map(Number);
      if (a.clip.length < 4 || a.clip.some((n) => !Number.isFinite(n))) fail('--clip is x,y,w,h[,scale]');
    } else if (['eval', 'eval2', 'each', 'init'].includes(key) && v.startsWith('@')) {
      // A script from a file: a whole save does not fit on a command line.
      a[key] = fs.readFileSync(v.slice(1), 'utf8');
    } else a[key] = v;
  }
  if (a.page !== 'preview' && a.page !== 'index') fail('--page is preview or index');
  a.out = path.resolve(a.out);
  return a;
}

/** The page to open: the repository's own, or a copy beside the bundle that loads it. */
function pageUrl(a) {
  const file = path.join(ROOT, a.page === 'index' ? 'index.html' : '_preview.html');
  const query = a.query ? `?${a.query.replace(/^\?/, '')}` : '';
  if (!a.bundle) return pathToUrl(file) + query;
  const bundle = path.resolve(a.bundle);
  if (!fs.existsSync(bundle)) fail(`no bundle at ${bundle}`);
  let html = fs.readFileSync(file, 'utf8').replace(/<head>/i, `<head>\n  <base href="${pathToUrl(ROOT)}/">`);
  const script = /<script src="simulation\.js"><\/script>/;
  if (!script.test(html)) fail(`${path.basename(file)} has no <script src="simulation.js">`);
  html = html.replace(script, `<script src="${pathToUrl(bundle)}"></script>`)
    .replace(/<script src="_preview\.js"><\/script>/, `<script src="${pathToUrl(path.join(ROOT, '_preview.js'))}"></script>`);
  page = path.join(path.dirname(bundle), `ui-shot-${process.pid}-${a.page}.html`);
  fs.writeFileSync(page, html);
  return pathToUrl(page) + query;
}

async function takeLock() {
  const deadline = Date.now() + LOCK_WAIT;
  for (let said = false; ;) {
    try {
      fs.mkdirSync(LOCK);
      locked = true;
      // Keep the lock fresh, so only a lock whose holder died goes stale.
      setInterval(() => { try { const t = new Date(); fs.utimesSync(LOCK, t, t); } catch { /* released */ } }, 30000).unref();
      return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    try {
      if (Date.now() - fs.statSync(LOCK).mtimeMs > LOCK_STALE) {
        fs.rmSync(LOCK, { recursive: true, force: true });
        console.log('ui-shot: removed a stale lock');
        continue;
      }
    } catch { /* released meanwhile */ }
    if (Date.now() > deadline) fail('waited ten minutes for other screenshots');
    if (!said) { console.log('ui-shot: waiting for another screenshot to finish'); said = true; }
    await sleep(500);
  }
}

let shown = 0;
function report(m) {
  let line = null;
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    line = `page exception: ${d.exception?.description || d.text}`;
  } else if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(m.params.type)) {
    line = `console.${m.params.type}: ${m.params.args.map((x) => x.value ?? x.description ?? '').join(' ')}`;
  } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    line = `page log: ${m.params.entry.text}${m.params.entry.url ? ` (${m.params.entry.url})` : ''}`;
  }
  if (!line) return;
  shown++;
  if (shown <= 40) console.log(line.slice(0, 1200));
  else if (shown === 41) console.log('ui-shot: more page messages not shown');
}

/** DevTools connection to the page of the Chrome whose profile is `dir`. */
async function connect(dir) {
  const portFile = path.join(dir, 'DevToolsActivePort');
  let port = 0;
  for (let k = 0; k < 300 && !port; k++) {
    try { port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]); } catch { /* not yet */ }
    if (!port) await sleep(100);
  }
  if (!port) fail('Chrome opened no DevTools port');
  let target = null;
  for (let k = 0; k < 100 && !target; k++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* not yet */ }
    if (!target) await sleep(100);
  }
  if (!target) fail('Chrome has no page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = () => ko(new Error('the DevTools connection failed')); });
  let id = 0;
  const wait = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (!m.id) { report(m); return; }
    const w = wait.get(m.id);
    if (!w) return;
    wait.delete(m.id);
    if (m.error) w[1](new Error(m.error.message));
    else w[0](m.result);
  };
  const send = (method, params = {}) => new Promise((ok, ko) => {
    const i = ++id;
    wait.set(i, [ok, ko]);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  return { ws, send, evaluate };
}

async function runEval(cdp, label, js) {
  try {
    const v = await cdp.evaluate(js);
    console.log(`${label}: ${v === undefined ? 'undefined' : JSON.stringify(v)}`);
  } catch (e) {
    console.log(`${label} error: ${e.message}`);
  }
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const exe = CHROMES.find((c) => fs.existsSync(c));
  if (!exe) fail('no Chrome or Edge found; set CHROME to its path');
  setTimeout(() => fail(`timed out after ${a.timeout} ms`, 2), a.timeout).unref();
  const url = pageUrl(a);
  await takeLock();
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gaia-ui-shot-'));
  chrome = spawn(exe, [
    '--headless=new', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required', '--mute-audio',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${a.w},${a.h}`, 'about:blank',
  ], { stdio: 'ignore' });
  const cdp = await connect(profile);
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: a.w, height: a.h, deviceScaleFactor: a.dpr, mobile: false });
  // As a focused window: headless pages get no focus events otherwise, and keyboard paths could not be checked.
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  if (a.init) await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: a.init });
  if (a.media) {
    const features = a.media.split(',').map((m) => { const [name, value] = m.split('='); return { name, value }; });
    await cdp.send('Emulation.setEmulatedMedia', { features });
  }
  await cdp.send('Page.navigate', { url });
  const ready = a.page === 'index' ? '!!(window.SE && SE.app)' : "document.title === 'ready'";
  for (;;) {
    let ok = false;
    try { ok = (await cdp.evaluate(ready)) === true; } catch { /* navigating */ }
    if (ok) break;
    await sleep(250);
  }
  await sleep(a.wait);
  if (a.eval) await runEval(cdp, 'eval', a.eval);
  if (a.wait2) await sleep(a.wait2);
  if (a.eval2) await runEval(cdp, 'eval2', a.eval2);
  fs.mkdirSync(path.dirname(a.out), { recursive: true });
  for (let f = 0; f < a.frames; f++) {
    if (a.each) {
      let r;
      try { r = await cdp.evaluate(`(async (f) => { ${a.each}
})(${f})`); } catch (e) { r = { error: e.message }; }
      if (r && typeof r === 'object' && r.dpr) await cdp.send('Emulation.setDeviceMetricsOverride', { width: a.w, height: a.h, deviceScaleFactor: r.dpr, mobile: false });
      if (r !== undefined) console.log(`each ${f}: ${JSON.stringify(r)}`);
      await sleep(a.gap);
    }
    const p = { format: 'png' };
    if (a.clip) p.clip = { x: a.clip[0], y: a.clip[1], width: a.clip[2], height: a.clip[3], scale: a.clip[4] || 1 };
    const shot = await cdp.send('Page.captureScreenshot', p);
    const file = a.frames > 1 ? a.out.replace(/(\.png)?$/i, `-${f}.png`) : a.out;
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    console.log(`saved ${file}`);
    if (!a.each && f < a.frames - 1) await sleep(a.gap);
  }
  cdp.ws.close();
}

main().then(() => process.exit(0));
