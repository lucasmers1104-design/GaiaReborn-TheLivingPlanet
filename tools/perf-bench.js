/* =============================================================================
 * SimEarth 2.0 — performance scenarios
 * -----------------------------------------------------------------------------
 * The same scenarios before and after a performance change, in Node and in
 * headless Chrome. Saves for the scenarios are played once in Node and cached
 * in tmp/perf/ (a save is lossy, but before and after load the same file).
 *
 *   node tools/perf-bench.js saves [--force]
 *        plays the scenario planets and writes tmp/perf/<name>.save
 *   node tools/perf-bench.js systems [scenario …] [--ticks N]
 *        ms per tick of every simulation system, in App.tick's order (Node)
 *   node tools/perf-bench.js browser [scenario …] [--seconds S] [--warmup S]
 *        [--size WxH] [--dpr N] [--label name] [--query "sim=direct"] [--throttle N]
 *        frame gaps and work, missed frames, tick times, simulation pace,
 *        state age, messages and heap in headless Chrome over the DevTools
 *        protocol; writes tmp/perf/<label>.json. Uses SE_BUNDLE like the
 *        other tools. One browser check at a time (the shared lock).
 *
 * Scenarios: young (young Earth, no life), bio (dense biosphere), civ
 * (cities), hazards (bio plus six disasters), terraform (bio plus a held
 * brush), pan (bio, WASD panning and zooming out and in), autosave (bio,
 * an autosave every 3 s). All run at the fastest speed ("Schnell").
 * ========================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'tmp', 'perf');
const BUNDLE = path.resolve(process.env.SE_BUNDLE || path.join(ROOT, 'simulation.js'));
const SCENARIOS = ['young', 'bio', 'civ', 'hazards', 'terraform', 'pan', 'autosave'];
/** Which save each scenario starts from; young makes its planet in the page. */
const SAVE_OF = { bio: 'bio', civ: 'civ', hazards: 'bio', terraform: 'bio', pan: 'bio', autosave: 'bio' };
const SEED = 12345;
const CHROMES = [
  process.env.CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

function fail(msg) {
  console.error(`perf-bench: ${msg}`);
  process.exit(1);
}

function opt(argv, name, def) {
  const k = argv.indexOf(`--${name}`);
  return k >= 0 && k + 1 < argv.length ? argv[k + 1] : def;
}

function quantiles(values) {
  const a = [...values].sort((x, y) => x - y);
  const q = (f) => (a.length ? a[Math.min(a.length - 1, Math.floor(f * a.length))] : 0);
  return { n: a.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: a.length ? a[a.length - 1] : 0, mean: a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0 };
}

const fmtQ = (s) => `p50 ${s.p50.toFixed(1)} p95 ${s.p95.toFixed(1)} p99 ${s.p99.toFixed(1)} max ${s.max.toFixed(1)}`;

/* ------------------------------------------------------------------ Node -- */

function sim(epoch = 'random') {
  const { makeSim } = require(path.join(ROOT, 'tests', 'helpers.js'));
  return makeSim(SEED, epoch);
}

/** App.advanceTimeScale without its chronicle entry (as tools/civ-probe.js). */
function advanceScale(SE, w) {
  if (w.timeScale === SE.TimeScale.Geologic && w.totalBiomass > 0) w.timeScale = SE.TimeScale.Evolution;
  else if (w.timeScale === SE.TimeScale.Evolution && w.sentientClass !== SE.Life.None) w.timeScale = SE.TimeScale.Civilized;
}

/** The densest sentient-capable land class wakes up with a first camp (tools/civ-probe.js forceSentience, simplified). */
function wake(SE, w) {
  let best = -1;
  let bestD = 0;
  let cls = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    if (!SE.citySiteAllowed(w, i)) continue;
    for (let c = 1; c < SE.LIFE_COUNT; c++) {
      if (!SE.LIFE[c].sentient || SE.LIFE[c].realm !== 'land') continue;
      const d = w.lifeDensity[i * SE.LIFE_COUNT + c];
      if (d > bestD) { bestD = d; best = i; cls = c; }
    }
  }
  if (best < 0) return false;
  w.sentientClass = cls;
  w.tech[best] = SE.Tech.Stone;
  w.cityPop[best] = 0.3;
  return true;
}

async function writeSave(s, name) {
  const SE = s.SE;
  const doc = SE.SaveSystem.serialize({ world: s.world, params: s.params, geo: s.geo, history: s.history });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${name}.save`), await SE.SaveSystem.encode(doc));
}

/** A built-up civilization: CIV_CITIES cities of every age on the best sites, at least 6 tiles apart. */
const CIV_CITIES = 40;
function buildCities(SE, s) {
  const w = s.world;
  const sites = [];
  for (let i = 0; i < SE.TILE_COUNT; i++) if (SE.citySiteAllowed(w, i)) sites.push([SE.citySiteScore(w, i), i]);
  sites.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const placed = [];
  for (const [, i] of sites) {
    if (placed.length >= CIV_CITIES) break;
    const x = i % SE.GRID_W;
    const y = Math.floor(i / SE.GRID_W);
    const near = placed.some((j) => {
      const dx = Math.abs((j % SE.GRID_W) - x);
      return Math.min(dx, SE.GRID_W - dx) < 6 && Math.abs(Math.floor(j / SE.GRID_W) - y) < 6;
    });
    if (near) continue;
    w.tech[i] = 1 + (placed.length % 7);
    w.cityPop[i] = 0.6;
    placed.push(i);
  }
  s.civ.sync(w, s.params);
  w.civ.news.length = 0;
}

async function makeSaves(force) {
  const want = ['bio', 'civ'].filter((n) => force || !fs.existsSync(path.join(OUT, `${n}.save`)));
  for (const name of want) {
    const t0 = Date.now();
    const s = sim();
    const { SE, world: w } = s;
    s.evo.develop(w, s.params, 'cells');
    // A dense biosphere: the greedy tree over 1500 ticks.
    for (let t = 0; t < 1500; t += 100) { s.play(100, null, 'survive'); advanceScale(SE, w); }
    if (name === 'civ') {
      for (let t = 0; t < 3000 && w.sentientClass === SE.Life.None; t += 100) { s.play(100, null, 'survive'); advanceScale(SE, w); }
      if (w.sentientClass === SE.Life.None && !wake(SE, w)) fail('no land class able to think');
      s.civ.sync(w, s.params);
      advanceScale(SE, w);
      for (let t = 0; t < 1200; t += 100) { s.play(100, null, 'survive'); advanceScale(SE, w); }
      buildCities(SE, s);
      for (let t = 0; t < 200; t += 100) { s.play(100, null, 'survive'); advanceScale(SE, w); }
      if (w.techCounts.slice(SE.Tech.Industrial).some((n) => n > 0)) w.timeScale = SE.TimeScale.Technology;
    }
    await writeSave(s, name);
    let cities = 0;
    for (let i = 0; i < SE.TILE_COUNT; i++) if (w.tech[i] > 0) cities++;
    console.log(`${name}: tick ${w.ticks}, ${w.evo.developed.size} steps, ${cities} city tiles, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  if (want.length === 0) console.log('saves are there (--force plays them again)');
}

/** A simulation from a scenario's save, loaded as App.loadFrom does. */
async function loaded(name) {
  if (name === 'young') return sim('youngEarth');
  const file = path.join(OUT, `${SAVE_OF[name] || name}.save`);
  if (!fs.existsSync(file)) fail(`no ${file}: run "node tools/perf-bench.js saves" first`);
  const s = sim();
  const SE = s.SE;
  s.fauna = new SE.FaunaDex();
  const doc = await SE.SaveSystem.decode(fs.readFileSync(file, 'utf8'));
  SE.SaveSystem.load(doc, { world: s.world, params: s.params, geo: s.geo, history: s.history, fauna: s.fauna }, s.life, s.flora);
  s.civ.sync(s.world, s.params);
  s.world.refreshDerived();
  s.world.civ.news.length = 0;
  s.evo.refresh(s.world, s.params, true);
  return s;
}

async function systems(names, ticks) {
  for (const name of names) {
    if (!['young', 'bio', 'civ'].includes(name)) continue;
    const s = await loaded(name);
    const SE = s.SE;
    const fauna = s.fauna || new SE.FaunaDex();
    const steps = [
      ['geo', (w, p) => s.geo.step(w, p)], ['events', (w, p) => s.events.step(w, p)], ['hazards', (w) => s.hazards.step(w)],
      ['river', (w) => SE.RiverSystem.maybeRebuild(w)], ['climate', (w, p) => s.climate.step(w, p)], ['flora', (w, p) => s.flora.step(w, p)],
      ['biome', (w) => SE.BiomeSystem.step(w)], ['coal', (w) => SE.CoalSystem.step(w)], ['oil', (w) => SE.OilSystem.step(w)],
      ['life', (w, p) => s.life.stepLife(w, p, s.atmo)], ['termites', (w) => SE.placeTermiteMound(w)], ['fauna', (w) => fauna.step(w)],
      ['evolution', (w, p) => s.evo.step(w, p)], ['civ', (w, p) => s.civ.step(w, p, s.atmo)], ['atmo', (w, p) => s.atmo.step(w, p)],
      ['rest', (w) => {
        SE.regenOmega(w); w.ticks++; w.absoluteYears += w.yearsPerTick; w.scaleYears += w.yearsPerTick;
        advanceScale(SE, w); s.history.sample(w); SE.reefMilestones(w);
      }],
    ];
    const times = steps.map(() => []);
    const total = [];
    for (let k = 0; k < ticks; k++) {
      const t0 = performance.now();
      steps.forEach(([, fn], j) => {
        const a = performance.now();
        fn(s.world, s.params);
        times[j].push(performance.now() - a);
      });
      total.push(performance.now() - t0);
    }
    console.log(`${name}: ${ticks} ticks from tick ${s.world.ticks - ticks}, tick ms ${fmtQ(quantiles(total))}`);
    steps.forEach(([n], j) => {
      const q = quantiles(times[j]);
      if (q.max >= 0.3) console.log(`  ${n.padEnd(10)} mean ${q.mean.toFixed(2).padStart(6)}  ${fmtQ(q)}`);
    });
  }
}

/* --------------------------------------------------------------- Chrome -- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function lock() {
  const dir = path.join(os.tmpdir(), 'simearth-sheet.lock');
  const deadline = Date.now() + 900000;
  return (async () => {
    for (;;) {
      try {
        fs.mkdirSync(dir);
        return () => fs.rmSync(dir, { recursive: true, force: true });
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
        try { if (Date.now() - fs.statSync(dir).mtimeMs > 300000) fs.rmSync(dir, { recursive: true, force: true }); } catch { /* taken */ }
        if (Date.now() > deadline) fail('waited fifteen minutes for other browser checks');
        await sleep(400);
      }
    }
  })();
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.wait = new Map();
    /** Page exceptions, console errors and warnings, for the report. */
    this.problems = [];
    /** DevTools sessions of the page's workers. */
    this.workers = [];
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Target.attachedToTarget' && msg.params.targetInfo.type === 'worker') {
        this.workers.push(msg.params.sessionId);
        this.send('Runtime.runIfWaitingForDebugger', {}, msg.params.sessionId).catch(() => {});
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        this.problems.push(`exception: ${(d.exception && d.exception.description) || d.text}`.slice(0, 400));
      }
      if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) {
        this.problems.push(`${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`.slice(0, 400));
      }
      if (msg.id && this.wait.has(msg.id)) {
        const [ok, ko] = this.wait.get(msg.id);
        this.wait.delete(msg.id);
        if (msg.error) ko(new Error(msg.error.message));
        else ok(msg.result);
      }
    };
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    return new Promise((ok, ko) => this.wait.set(id, [ok, ko]));
  }

  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
}

function pathToUrl(p) {
  return `file:///${path.resolve(p).replace(/\\/g, '/')}`;
}

/** index.html with the bundle under test, beside the project so every relative path resolves. */
function benchPage(work, query) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .replace('<head>', `<head><base href="${pathToUrl(ROOT)}/">`)
    .replace('<script src="simulation.js"></script>', `<script src="${pathToUrl(BUNDLE)}"></script>`);
  const file = path.join(work, 'bench.html');
  fs.writeFileSync(file, html);
  return `${pathToUrl(file)}${query ? `?${query}` : ''}`;
}

/** Page script: hooks the performance display's reports and the frame clock, then sets the scenario up. */
const SETUP = (name, save, seed) => `(async () => {
  const app = SE.app;
  const rec = window.__bench = { frames: [], work: [], ticks: [], age: [], chunks: 0, composeMs: [], field: [], fieldFull: [], storage: [], long: [], msgs: 0, bytes: 0, on: false };
  const hud = SE.perfHud;
  const orig = { frame: hud.frame.bind(hud), tick: hud.tick.bind(hud), field: hud.field.bind(hud), chunks: hud.chunks.bind(hud) };
  hud.frame = (gap, work) => { if (rec.on) { rec.frames.push(gap); rec.work.push(work); } orig.frame(gap, work); };
  hud.tick = (ms) => { if (rec.on) rec.ticks.push(ms); orig.tick(ms); };
  hud.field = (ms, tiles) => { if (rec.on) { rec.field.push(ms); if (tiles < 0) rec.fieldFull.push(ms); } orig.field(ms, tiles); };
  hud.chunks = (n, pending) => { if (rec.on) rec.chunks += n; orig.chunks(n, pending); };
  if (hud.stateAge) { const o = hud.stateAge.bind(hud); hud.stateAge = (ms) => { if (rec.on) rec.age.push(ms); o(ms); }; }
  if (hud.message) { const o = hud.message.bind(hud); hud.message = (n) => { if (rec.on) { rec.msgs++; rec.bytes += n; } o(n); }; }
  // The synchronous part of saving: localStorage writes on the page.
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { const t = performance.now(); try { return setItem.call(this, k, v); } finally { if (rec.on) rec.storage.push(performance.now() - t); } };
  new PerformanceObserver((l) => { if (rec.on) for (const e of l.getEntries()) rec.long.push(e.duration); }).observe({ type: 'longtask' });
  SE.devMode.on = true;
  // Milestone cards and toasts would cover the map where the scenarios point and click.
  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: '.showcase, .showcase-backdrop, .milestones, .toast-card, .toasts { display: none !important; }' }));
  if (app.title) { app.title.close(); app.title = null; }
  if (${JSON.stringify(name)} === 'young') {
    app.settings.epoch = 'youngEarth';
    app.newPlanet({ quiet: true, seed: ${seed} });
  } else {
    localStorage.setItem('perf.bench', ${JSON.stringify(save)});
    if (!(await app.loadFrom('perf.bench'))) throw new Error('load failed');
  }
  if (app.sim) await app.sim.idle();
  app.enterGame(4);
  return true;
})()`;

/** Page script: the scenario's own action while measuring (input that the CDP side does not drive). */
const ACTION = (name) => `(() => {
  const app = SE.app;
  const w = app.world;
  if (${JSON.stringify(name)} === 'hazards') {
    const kinds = [SE.EventKind.Volcano, SE.EventKind.Fire, SE.EventKind.Hurricane, SE.EventKind.Earthquake, SE.EventKind.Meteor, SE.EventKind.TidalWave];
    const v = app.editView;
    const raised = [];
    for (const kind of kinds) {
      let done = false;
      for (let k = 0; k < 4000 && !done; k++) {
        const x = SE.wrapX(Math.floor(v.scrollX + ((k * 37) % Math.max(1, v.cols))));
        const y = Math.max(2, Math.min(SE.GRID_H - 3, Math.floor(v.scrollY + ((k * 17) % Math.max(1, v.rows)))));
        if (app.hazards.refusal(w, kind, x, y)) continue;
        app.raiseHazard(kind, x, y);
        raised.push(kind);
        done = true;
      }
    }
    return raised.length;
  }
  if (${JSON.stringify(name)} === 'autosave') {
    const t = setInterval(() => { if (!window.__bench.on) { clearInterval(t); return; } app.unsaved = true; app.lastAutosave = -Infinity; }, 3000);
  }
  if (${JSON.stringify(name)} === 'terraform') app.selectTool(SE.Tool.SetAltitude);
  return 0;
})()`;

async function inputDriver(cdp, name, ms, size) {
  const [W, H] = size;
  const end = Date.now() + ms;
  const mouse = (type, x, y, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, pointerType: 'mouse', clickCount: 1, ...extra });
  const key = (type, code, k) => cdp.send('Input.dispatchKeyEvent', { type, code, key: k, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) });
  if (name === 'terraform') {
    // Strokes of 2.5 s in a circle, released for 0.5 s (the settle steps run then).
    let a = 0;
    while (Date.now() < end) {
      const cx = W * 0.5 + Math.cos(a) * W * 0.15;
      const cy = H * 0.55 + Math.sin(a) * H * 0.15;
      await mouse('mousePressed', cx, cy);
      const strokeEnd = Math.min(end, Date.now() + 2500);
      while (Date.now() < strokeEnd) {
        a += 0.05;
        await mouse('mouseMoved', W * 0.5 + Math.cos(a) * W * 0.15, H * 0.55 + Math.sin(a) * H * 0.15);
        await sleep(16);
      }
      await mouse('mouseReleased', W * 0.5 + Math.cos(a) * W * 0.15, H * 0.55 + Math.sin(a) * H * 0.15);
      await sleep(500);
    }
  } else if (name === 'pan') {
    // Hold D, zoom out to the smallest tiles, hold S and A, zoom back in.
    const phases = [['D', 3000], ['out', 0], ['S', 3000], ['A', 3000], ['in', 0], ['D', 3000]];
    for (const [what, dur] of phases) {
      if (Date.now() > end) break;
      if (what === 'out' || what === 'in') {
        for (let k = 0; k < 14; k++) {
          await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: W / 2, y: H / 2, deltaX: 0, deltaY: what === 'out' ? 100 : -100, pointerType: 'mouse' });
          await sleep(60);
        }
        continue;
      }
      await key('keyDown', `Key${what}`, what.toLowerCase());
      await sleep(dur);
      await key('keyUp', `Key${what}`, what.toLowerCase());
    }
    const rest = end - Date.now();
    if (rest > 0) await sleep(rest);
  } else {
    await sleep(ms);
  }
}

/** A DevTools call that may never answer (a worker target): give up after `ms`. */
function within(p, ms) {
  return Promise.race([p, new Promise((_, ko) => setTimeout(() => ko(new Error('timeout')), ms))]);
}

/** Heap of the page and of every worker it started (sessions from Target.setAutoAttach, set before the page loads). */
async function heap(cdp) {
  const page = await cdp.send('Runtime.getHeapUsage');
  let workers = 0;
  for (const sessionId of cdp.workers) {
    try {
      workers += (await within(cdp.send('Runtime.getHeapUsage', {}, sessionId), 3000)).usedSize;
    } catch { /* gone */ }
  }
  return { pageMB: page.usedSize / 1048576, workersMB: workers / 1048576 };
}

async function browser(names, argv) {
  const chrome = CHROMES.find((c) => fs.existsSync(c));
  if (!chrome) fail('no Chrome or Edge found; set CHROME to its path');
  const seconds = Number(opt(argv, 'seconds', 15));
  const warmup = Number(opt(argv, 'warmup', 4));
  const size = opt(argv, 'size', '1920x1080').split('x').map(Number);
  const dpr = Number(opt(argv, 'dpr', 1));
  const label = opt(argv, 'label', 'run');
  const query = opt(argv, 'query', '');
  const throttle = Number(opt(argv, 'throttle', 1));
  const saves = {};
  for (const n of names) {
    const s = SAVE_OF[n];
    if (s && !saves[s]) {
      const file = path.join(OUT, `${s}.save`);
      if (!fs.existsSync(file)) fail(`no ${file}: run "node tools/perf-bench.js saves" first`);
      saves[s] = fs.readFileSync(file, 'utf8');
    }
  }
  const release = await lock();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'simearth-perf-'));
  const results = [];
  try {
    for (const name of names) {
      const proc = spawn(chrome, [
        '--headless=new', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
        '--remote-debugging-port=0', `--user-data-dir=${path.join(work, `profile-${name}`)}`, `--window-size=${size[0]},${size[1]}`, 'about:blank',
      ], { stdio: 'ignore' });
      try {
        const portFile = path.join(work, `profile-${name}`, 'DevToolsActivePort');
        for (let k = 0; k < 100 && !fs.existsSync(portFile); k++) await sleep(100);
        const port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
        await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko; });
        const cdp = new Cdp(ws);
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: size[0], height: size[1], deviceScaleFactor: dpr, mobile: false });
        if (process.env.PERF_DEBUG) console.error("navigate");
        await cdp.send('Page.navigate', { url: benchPage(work, query) });
        for (let k = 0; k < 200 && !(await cdp.eval('!!(window.SE && SE.app)').catch(() => false)); k++) await sleep(100);
        if (process.env.PERF_DEBUG) console.error("setup");
        // An indicator for slower machines only: DevTools slows the page (and, where it can, its workers) by this factor.
        if (throttle > 1) for (const s of [undefined, ...cdp.workers]) await within(cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle }, s), 3000).catch(() => {});
        await cdp.eval(SETUP(name, saves[SAVE_OF[name]] || '', SEED));
        if (process.env.PERF_DEBUG) console.error("warmup");
        await sleep(warmup * 1000);
        const before = await cdp.eval('({ ticks: SE.app.world.ticks, t: performance.now() })');
        await cdp.eval('window.__bench.on = true');
        const acted = await cdp.eval(ACTION(name));
        if (process.env.PERF_DEBUG) console.error("measure");
        await inputDriver(cdp, name, seconds * 1000, size);
        await cdp.eval('window.__bench.on = false');
        const after = await cdp.eval("({ ticks: SE.app.world.ticks, t: performance.now(), sim: SE.app.sim ? SE.app.sim.mode : \"main\" })");
        const rec = await cdp.eval('window.__bench');
        if (process.env.PERF_DEBUG) console.error("heap");
        const mem = await heap(cdp);
        const errors = cdp.problems.splice(0);
        const span = (after.t - before.t) / 1000;
        const r = {
          name, sim: after.sim, seconds: span,
          gap: quantiles(rec.frames), work: quantiles(rec.work),
          fps: rec.frames.length / span,
          missed: rec.frames.filter((g) => g > 25).length,
          over60: rec.work.filter((w) => w > 1000 / 60).length / Math.max(1, rec.work.length),
          storage: quantiles(rec.storage),
          dropped: rec.frames.reduce((s, g) => s + Math.max(0, Math.round(g / (1000 / 60)) - 1), 0),
          tick: quantiles(rec.ticks), ticksPerS: (after.ticks - before.ticks) / span,
          age: quantiles(rec.age), field: quantiles(rec.field), fieldFull: quantiles(rec.fieldFull), chunks: rec.chunks,
          long: { n: rec.long.length, sum: rec.long.reduce((s, v) => s + v, 0), max: Math.max(0, ...rec.long) },
          msgsPerS: rec.msgs / span, kBPerS: rec.bytes / 1024 / span, heap: mem, acted, errors,
        };
        results.push(r);
        console.log(`${name.padEnd(9)} [${r.sim}] ${r.fps.toFixed(1)} fps  gap ${fmtQ(r.gap)}  work ${fmtQ(r.work)}  over 16.7 ms ${(r.over60 * 100).toFixed(1)} %  missed ${r.missed} dropped ${r.dropped}${r.storage.n ? `  localStorage ${r.storage.n}× max ${r.storage.max.toFixed(1)} ms` : ''}`);
        console.log(`${''.padEnd(9)} ticks ${r.ticksPerS.toFixed(2)}/s  tick ${fmtQ(r.tick)}  age ${r.age.n ? fmtQ(r.age) : '–'}  long tasks ${r.long.n} (Σ ${r.long.sum.toFixed(0)} ms, max ${r.long.max.toFixed(0)})`);
        for (const e of errors.slice(0, 5)) console.log(`${''.padEnd(9)} ! ${e}`);
        console.log(`${''.padEnd(9)} field ${r.field.n ? fmtQ(r.field) : '–'} (full ${r.fieldFull.n}× ${r.fieldFull.n ? fmtQ(r.fieldFull) : ''})  chunks ${r.chunks}  msgs ${r.msgsPerS.toFixed(1)}/s ${r.kBPerS.toFixed(0)} kB/s  heap page ${mem.pageMB.toFixed(0)} MB workers ${mem.workersMB.toFixed(0)} MB${acted ? `  acted ${acted}` : ''}`);
        ws.close();
      } finally {
        proc.kill();
        await sleep(300);
      }
    }
  } finally {
    release();
    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* Chrome still holds it */ }
  }
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${label}.json`);
  fs.writeFileSync(file, JSON.stringify({ label, bundle: BUNDLE, size, dpr, query, throttle, at: new Date().toISOString(), results }, null, 1));
  console.log(`→ ${path.relative(ROOT, file)}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const names = argv.slice(1).filter((a, k, all) => !a.startsWith('--') && !(k > 0 && all[k - 1].startsWith('--')));
  const picked = names.length ? names : SCENARIOS;
  for (const n of picked) if (!SCENARIOS.includes(n)) fail(`unknown scenario ${n} (${SCENARIOS.join(', ')})`);
  if (cmd === 'saves') return makeSaves(argv.includes('--force'));
  if (cmd === 'systems') return systems(picked, Number(opt(argv, 'ticks', 100)));
  if (cmd === 'browser') return browser(picked, argv);
  fail('usage: perf-bench.js saves|systems|browser [scenario …] (see the header)');
}

main().catch((e) => fail(e.stack || String(e)));
