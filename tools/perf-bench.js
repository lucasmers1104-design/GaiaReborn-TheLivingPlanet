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
 *        [--laps N] [--repeat N] [--variants plain,ahead,zoom,both] [--paused]
 *        [--gpu on|off]
 *        frame gaps and work, missed frames, tick times, simulation pace,
 *        state age, messages, heap, the landscape's SE.landStats and the WebGL
 *        water's SE.waterFxStats (each when the build has it, else "–"; water:
 *        renders/s, chunk and tile uploads, upload KiB, canvas MPx over the
 *        lap) in headless Chrome over the DevTools protocol; writes
 *        tmp/perf/<label>.json. Uses SE_BUNDLE like the other tools. One
 *        browser check at a time (the shared lock). --query goes to the page
 *        as is (e.g. "waterfx=on"); the first line of each run shows the
 *        viewport as WxH@dpr.
 *          --laps N      the camera path N times in one page, each lap reported
 *                        on its own (lap 1 cold, later laps warm); the camera
 *                        returns to its start between laps
 *          --repeat N    every scenario × variant N times, each in a fresh browser
 *          --variants    adds land=<variant> to the page query; runs interleave
 *                        (A plain, A ahead, …, next repeat, then scenario B)
 *          --paused      the world stands still (speed 0 instead of "Schnell")
 *          --gpu off     Chrome with --disable-gpu (software raster)
 *        Ends with a comparison per scenario × variant × lap: the median over
 *        repeats and, with --repeat > 1, the worst repeat ("median/worst").
 *        Zoom MiB at the end = pageZoomBytes + flightBytes + workerBytes.
 *
 * Scenarios: young (young Earth, no life), bio (dense biosphere), civ
 * (cities), hazards (bio plus six disasters), terraform (bio plus a held
 * brush), pan (bio, WASD panning and zooming out and in), autosave (bio,
 * an autosave every 3 s), panzoom (bio, WASD incl. diagonals and right-drag
 * panning while wheel notches zoom out fully and back in, faster and slower
 * than the 140 ms zoom settle), zoomsteps (bio, one notch per 450 ms down to
 * the smallest tiles, up to the largest and back; ignores --seconds; work
 * per tile size), drag (bio, right-drag panning at 900 px/s: straight,
 * diagonal, a reversal), reef (today's Earth with a grown biosphere, the
 * camera still over the Great Barrier Reef at 32 px per tile; the first
 * line counts the reef and lagoon tiles in view), reefpan (the same place:
 * WASD over the reef and back, right-drag there and back at 2700 px/s,
 * four wheel notches out and in again, then still). All run at the fastest
 * speed ("Schnell"); reef and reefpan always at speed 0.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'tmp', 'perf');
const BUNDLE = path.resolve(process.env.SE_BUNDLE || path.join(ROOT, 'simulation.js'));
const SCENARIOS = ['young', 'bio', 'civ', 'hazards', 'terraform', 'pan', 'autosave', 'panzoom', 'zoomsteps', 'drag', 'reef', 'reefpan'];
/** Which save each scenario starts from; young makes its planet in the page. */
const SAVE_OF = { bio: 'bio', civ: 'civ', hazards: 'bio', terraform: 'bio', pan: 'bio', autosave: 'bio', panzoom: 'bio', zoomsteps: 'bio', drag: 'bio', reef: 'reef', reefpan: 'reef' };
/** The epoch a save's planet starts on (src/epochs.ts); the others are random planets. */
const EPOCH_OF = { reef: 'today' };
/** The reef scenarios' camera: the Great Barrier Reef on today's Earth, 32 CSS px per tile, the world standing still. */
const REEF_VIEW = { x: 232, y: 77, px: 32 };
const VARIANTS = ['plain', 'ahead', 'zoom', 'both'];
/** Flags without a value (everything else after "--name" takes the next argument). */
const FLAGS = ['--force', '--paused'];
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
  const want = ['bio', 'civ', 'reef'].filter((n) => force || !fs.existsSync(path.join(OUT, `${n}.save`)));
  for (const name of want) {
    const t0 = Date.now();
    const s = sim(EPOCH_OF[name]);
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
const SETUP = (name, save, seed, speed) => `(async () => {
  const app = SE.app;
  const rec = window.__bench = { frames: [], work: [], px: [], ticks: [], age: [], chunks: 0, composeMs: [], field: [], fieldFull: [], storage: [], long: [], msgs: 0, bytes: 0, on: false };
  window.__benchReset = () => { for (const k in rec) if (Array.isArray(rec[k])) rec[k] = []; rec.chunks = rec.msgs = rec.bytes = 0; };
  const hud = SE.perfHud;
  const orig = { frame: hud.frame.bind(hud), tick: hud.tick.bind(hud), field: hud.field.bind(hud), chunks: hud.chunks.bind(hud) };
  hud.frame = (gap, work) => { if (rec.on) { rec.frames.push(gap); rec.work.push(work); rec.px.push(Math.round(app.editView.tilePx)); } orig.frame(gap, work); };
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
  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: '.showcase, .showcase-backdrop, .milestones, .toast-card, .toasts, .magic-layer, .magic-glow { display: none !important; }' }));
  if (app.title) { app.title.close(); app.title = null; }
  if (${JSON.stringify(name)} === 'young') {
    app.settings.epoch = 'youngEarth';
    app.newPlanet({ quiet: true, seed: ${seed} });
  } else {
    localStorage.setItem('perf.bench', ${JSON.stringify(save)});
    if (!(await app.loadFrom('perf.bench'))) throw new Error('load failed');
  }
  if (app.sim) await app.sim.idle();
  app.enterGame(${speed});
  if (${JSON.stringify(name)}.startsWith('reef')) { const v = app.editView; v.tilePx = ${REEF_VIEW.px}; v.centerOn(${REEF_VIEW.x}, ${REEF_VIEW.y}); v.markDirty(); }
  return true;
})()`;

/** Page script: sheltered reef and lagoon water in view, as src/reefswell.ts finds it in the terrain field. */
const REEF_IN_VIEW = `(() => {
  const v = SE.app.editView;
  const f = SE.PixelTerrain.shared().field;
  let n = 0;
  for (let y = Math.max(0, Math.floor(v.scrollY)); y < Math.min(SE.GRID_H, Math.ceil(v.scrollY + v.rows)); y++) {
    for (let x = Math.floor(v.scrollX); x < Math.ceil(v.scrollX + v.cols); x++) {
      const j = y * SE.GRID_W + SE.wrapX(x);
      if (f.key[j] === 0 && (f.reef[j] !== 0 || f.lagoon[j] > 0)) n++;
    }
  }
  return n;
})()`;

/** Page scripts: the map camera, and putting it back where a lap started. */
const CAMERA = '(() => { const v = SE.app.editView; return { x: v.scrollX, y: v.scrollY, px: v.tilePx }; })()';
const RESTORE = (c) => `(() => { const v = SE.app.editView; v.glideZoom(${c.px}); v.scrollX = ${c.x}; v.scrollY = ${c.y}; v.scrollBy(0, 0); return true; })()`;

const LAND_KEYS = ['entered', 'readyOnEntry', 'ready', 'aheadAsked', 'aheadInstalled', 'aheadUsed', 'aheadUnused', 'aheadDropped', 'aheadUpgraded',
  'zoomHits', 'zoomMisses', 'zoomBuilt', 'zoomUsed', 'zoomUnused', 'zoomLate', 'zoomEvicted', 'zoomOverBudget', 'composeMs', 'scaleMs',
  'msgsOut', 'msgsIn', 'bytesOut', 'bytesIn', 'pageZoomBytes', 'flightBytes', 'workerBytes', 'peakZoomBytes', 'baseBytes', 'smallBytes'];
/** Page script: SE.landStats read key by key (getters included), or null in builds without it. */
const LAND = `(() => {
  const s = SE.landStats;
  if (!s) return null;
  const o = { features: Object.assign({}, s.features) };
  for (const k of ${JSON.stringify(LAND_KEYS)}) { const v = s[k]; o[k] = v && typeof v === 'object' ? Array.from(v) : v; }
  return o;
})()`;

const WATER_KEYS = ['renders', 'chunkUploads', 'uploadBytes', 'tileUploads', 'canvasPx'];
/** Page script: the WebGL water's SE.waterFxStats counters (they only grow), or null in builds without it. */
const WATER = `(() => {
  const s = SE.waterFxStats;
  if (!s) return null;
  const o = { active: !!s.active };
  for (const k of ${JSON.stringify(WATER_KEYS)}) o[k] = Number(s[k]) || 0;
  return o;
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
  } else if (name === 'panzoom' || name === 'zoomsteps' || name === 'drag' || name === 'reefpan') {
    await cameraDriver(cdp, name, end, W, H);
  } else {
    await sleep(ms);
  }
}

/** Right-drag strokes as fractions of the viewport: straight, diagonal, a reversal in one press. */
const STROKES = [[[0.8, 0.5], [0.2, 0.5]], [[0.5, 0.85], [0.5, 0.15]], [[0.75, 0.8], [0.25, 0.2]], [[0.3, 0.5], [0.7, 0.5], [0.3, 0.5]], [[0.2, 0.3], [0.8, 0.7]]];
/** The drag speed, the same screen speed as held WASD (PAN_PX_PER_S in app.ts). */
const DRAG_PX_PER_S = 900;
/** reefpan's fast pan: there and back in one press, so the camera stays over the reef. */
const FAST_STROKES = [[[0.85, 0.5], [0.15, 0.5], [0.85, 0.5]], [[0.5, 0.9], [0.5, 0.1], [0.5, 0.9]]];

/** The camera scenarios: held keys, wheel notches and right-button drags, alone or together. */
async function cameraDriver(cdp, name, end, W, H) {
  const cur = { x: W / 2, y: H / 2 };
  const held = new Set();
  const key = (type, code) => cdp.send('Input.dispatchKeyEvent', { type, code, key: code.slice(3).toLowerCase(), windowsVirtualKeyCode: code.charCodeAt(3) });
  const hold = async (codes) => {
    for (const c of [...held]) if (!codes.includes(c)) { held.delete(c); await key('keyUp', c); }
    for (const c of codes) if (!held.has(c)) { held.add(c); await key('keyDown', c); }
  };
  const mouse = (type, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x: cur.x, y: cur.y, pointerType: 'mouse', ...extra });
  const right = (type) => mouse(type, { button: 'right', buttons: type === 'mouseReleased' ? 0 : 2, clickCount: 1 });
  /** Wheel notches at the cursor as [direction, wait after]: +1 out, -1 in, 0 only waits. */
  const wheels = async (plan) => {
    for (const [dir, wait] of plan) {
      if (Date.now() >= end) return;
      if (dir) await mouse('mouseWheel', { deltaX: 0, deltaY: dir * 100 });
      await sleep(wait);
    }
  };
  const notches = (n, dir, every) => Array.from({ length: n }, () => [dir, every]);
  /** One press with the right button along a stroke, positions by elapsed time (moves every ~16 ms). */
  const stroke = async (pts, until, speed) => {
    [cur.x, cur.y] = [pts[0][0] * W, pts[0][1] * H];
    await mouse('mouseMoved');
    await right('mousePressed');
    try {
      for (let k = 1; k < pts.length; k++) {
        const [x0, y0, x1, y1] = [pts[k - 1][0] * W, pts[k - 1][1] * H, pts[k][0] * W, pts[k][1] * H];
        const dur = (Math.hypot(x1 - x0, y1 - y0) / speed) * 1000;
        const t0 = Date.now();
        for (let f = 0; f < 1 && Date.now() < until;) {
          await sleep(16);
          f = Math.min(1, (Date.now() - t0) / dur);
          [cur.x, cur.y] = [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
          await right('mouseMoved');
        }
      }
    } finally {
      await right('mouseReleased');
    }
  };
  /** Strokes until `until`; `whole` finishes the last one instead of cutting it there. */
  const strokes = async (until, list = STROKES, speed = DRAG_PX_PER_S, whole = false) => {
    for (let k = 0; Date.now() < until; k++) {
      await stroke(list[k % list.length], whole ? Infinity : until, speed);
      await sleep(100);
    }
  };
  /** Phases of 15 s, the holds scaled to the scenario's time; notch spacing stays absolute (the map settles 140 ms after the last notch). */
  const play = async (phases) => {
    const f = (end - Date.now()) / 15000;
    for (const p of phases) {
      if (Date.now() >= end) break;
      await hold(p.keys);
      const until = Math.min(end, Date.now() + p.dur * f);
      await Promise.all([wheels(p.wheel), p.drag ? strokes(until, ...p.drag) : null, sleep(until - Date.now())]);
    }
    await hold([]);
    const rest = end - Date.now();
    if (rest > 0) await sleep(rest);
  };
  try {
    if (name === 'drag') {
      await strokes(end);
    } else if (name === 'reefpan') {
      // Over the reef and back: slow (held WASD, 900 px/s), fast (right-drag at 3×), four notches out and in again (32 → 18 → 32 px), then still.
      await play([
        { keys: ['KeyD'], dur: 2000, wheel: [] },
        { keys: ['KeyA'], dur: 2000, wheel: [] },
        { keys: ['KeyS'], dur: 1000, wheel: [] },
        { keys: ['KeyW'], dur: 1000, wheel: [] },
        { keys: [], dur: 4000, drag: [FAST_STROKES, 3 * DRAG_PX_PER_S, true], wheel: [] },
        { keys: [], dur: 3500, wheel: [...notches(4, 1, 250), [0, 600], ...notches(4, -1, 250)] },
        { keys: [], dur: 1500, wheel: [] },
      ]);
    } else if (name === 'zoomsteps') {
      const px = () => cdp.eval('SE.app.editView.tilePx');
      const start = await px();
      const step = async (dir) => {
        const a = await px();
        await mouse('mouseWheel', { deltaX: 0, deltaY: dir * 100 });
        await sleep(450);
        return (await px()) !== a;
      };
      while (await step(1)) { /* down to the smallest tiles */ }
      while (await step(-1)) { /* up to the largest */ }
      while ((await px()) > start && (await step(1))) { /* back to the start */ }
    } else {
      await play([
        { keys: ['KeyW', 'KeyD'], dur: 2500, wheel: notches(16, 1, 90) },
        { keys: ['KeyS', 'KeyA'], dur: 2500, wheel: notches(6, -1, 300) },
        { keys: ['KeyD'], dur: 2000, wheel: [...notches(4, -1, 60), [0, 400], ...notches(8, -1, 180)] },
        { keys: ['KeyW'], dur: 1500, wheel: [...notches(3, 1, 120), ...notches(3, -1, 160)] },
        { keys: [], dur: 3500, drag: [], wheel: [...notches(8, 1, 100), [0, 300], ...notches(4, -1, 250)] },
        { keys: ['KeyS', 'KeyD'], dur: 1500, wheel: notches(4, 1, 200) },
        { keys: ['KeyA'], dur: 1500, wheel: [] },
      ]);
    }
  } finally {
    await hold([]);
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
  const laps = Math.max(1, Number(opt(argv, 'laps', 1)) || 1);
  const repeat = Math.max(1, Number(opt(argv, 'repeat', 1)) || 1);
  const paused = argv.includes('--paused');
  const gpu = opt(argv, 'gpu', 'on');
  if (gpu !== 'on' && gpu !== 'off') fail('--gpu takes on or off');
  const variants = opt(argv, 'variants', '') ? opt(argv, 'variants', '').split(',') : [null];
  for (const v of variants) if (v !== null && !VARIANTS.includes(v)) fail(`unknown variant ${v} (${VARIANTS.join(', ')})`);
  const runs = [];
  for (const name of names) for (let rep = 1; rep <= repeat; rep++) for (const variant of variants) runs.push({ name, rep, variant });
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
    for (const [k, { name, rep, variant }] of runs.entries()) {
      const profile = path.join(work, `profile-${k}`);
      const proc = spawn(chrome, [
        '--headless=new', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
        ...(gpu === 'off' ? ['--disable-gpu'] : []),
        '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${size[0]},${size[1]}`, 'about:blank',
      ], { stdio: 'ignore' });
      try {
        const portFile = path.join(profile, 'DevToolsActivePort');
        // Chrome may still hold the file open (EBUSY on Windows), or not have written the port yet.
        let port = '';
        for (let k = 0; k < 100 && !port; k++) {
          try { port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim(); } catch { /* not there or busy */ }
          if (!port) await sleep(100);
        }
        if (!port) throw new Error(`no DevTools port in ${portFile}`);
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
        await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko; });
        const cdp = new Cdp(ws);
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: size[0], height: size[1], deviceScaleFactor: dpr, mobile: false });
        if (process.env.PERF_DEBUG) console.error("navigate");
        const runQuery = [query, variant && `land=${variant}`].filter(Boolean).join('&');
        await cdp.send('Page.navigate', { url: benchPage(work, runQuery) });
        for (let j = 0; j < 200 && !(await cdp.eval('!!(window.SE && SE.app)').catch(() => false)); j++) await sleep(100);
        if (process.env.PERF_DEBUG) console.error("setup");
        // An indicator for slower machines only: DevTools slows the page (and, where it can, its workers) by this factor.
        if (throttle > 1) for (const s of [undefined, ...cdp.workers]) await within(cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle }, s), 3000).catch(() => {});
        await cdp.eval(SETUP(name, saves[SAVE_OF[name]] || '', SEED, paused || name.startsWith('reef') ? 0 : 4));
        if (process.env.PERF_DEBUG) console.error("warmup");
        await sleep(warmup * 1000);
        const reefTiles = name.startsWith('reef') ? await cdp.eval(REEF_IN_VIEW) : null;
        const start = await cdp.eval(CAMERA);
        for (let lap = 1; lap <= laps; lap++) {
          if (lap > 1) {
            // Back to the lap's start, then a settle that is not measured: the same path again, now over warm caches.
            await cdp.eval(RESTORE(start));
            await sleep(1500);
          }
          await cdp.eval('window.__benchReset(); if (SE.landStats) SE.landStats.reset(); true');
          const water0 = await cdp.eval(WATER);
          const before = await cdp.eval('({ ticks: SE.app.world.ticks, t: performance.now() })');
          const from = await cdp.eval(CAMERA);
          await cdp.eval('window.__bench.on = true');
          const acted = await cdp.eval(ACTION(name));
          if (process.env.PERF_DEBUG) console.error("measure");
          await inputDriver(cdp, name, seconds * 1000, size);
          await cdp.eval('window.__bench.on = false');
          const after = await cdp.eval("({ ticks: SE.app.world.ticks, t: performance.now(), sim: SE.app.sim ? SE.app.sim.mode : \"main\", view: `${innerWidth}x${innerHeight}@${devicePixelRatio}` })");
          const water1 = await cdp.eval(WATER);
          const to = await cdp.eval(CAMERA);
          const rec = await cdp.eval('window.__bench');
          const land = await cdp.eval(LAND);
          if (process.env.PERF_DEBUG) console.error(`camera ${JSON.stringify(from)} → ${JSON.stringify(to)}`);
          const mem = await heap(cdp);
          const errors = cdp.problems.splice(0);
          const span = (after.t - before.t) / 1000;
          const r = {
            name, variant, repeat: rep, lap, sim: after.sim, view: after.view, seconds: span, reefTiles,
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
            camera: { from, to }, workByPx: workByPx(rec), land: landSummary(land, span), water: waterSummary(water0, water1, span),
          };
          results.push(r);
          const tag = `${name}${variant ? `/${variant}` : ''}${repeat > 1 ? ` #${rep}` : ''}${laps > 1 ? ` lap ${lap}` : ''}`;
          console.log(`${tag.padEnd(9)} [${r.sim} ${r.view}${reefTiles === null ? '' : `, ${reefTiles} reef/lagoon tiles in view`}] ${r.fps.toFixed(1)} fps  gap ${fmtQ(r.gap)}  work ${fmtQ(r.work)}  over 16.7 ms ${(r.over60 * 100).toFixed(1)} %  missed ${r.missed} dropped ${r.dropped}${r.storage.n ? `  localStorage ${r.storage.n}× max ${r.storage.max.toFixed(1)} ms` : ''}`);
          console.log(`${''.padEnd(9)} ticks ${r.ticksPerS.toFixed(2)}/s  tick ${fmtQ(r.tick)}  age ${r.age.n ? fmtQ(r.age) : '–'}  long tasks ${r.long.n} (Σ ${r.long.sum.toFixed(0)} ms, max ${r.long.max.toFixed(0)})`);
          for (const e of errors.slice(0, 5)) console.log(`${''.padEnd(9)} ! ${e}`);
          console.log(`${''.padEnd(9)} field ${r.field.n ? fmtQ(r.field) : '–'} (full ${r.fieldFull.n}× ${r.fieldFull.n ? fmtQ(r.fieldFull) : ''})  chunks ${r.chunks}  msgs ${r.msgsPerS.toFixed(1)}/s ${r.kBPerS.toFixed(0)} kB/s  heap page ${mem.pageMB.toFixed(0)} MB workers ${mem.workersMB.toFixed(0)} MB${acted ? `  acted ${acted}` : ''}`);
          console.log(`${''.padEnd(9)} ${fmtLand(r.land)}`);
          console.log(`${''.padEnd(9)} ${fmtWater(r.water)}`);
          if (name === 'zoomsteps') console.log(`${''.padEnd(9)} work by tile px: ${Object.entries(r.workByPx).map(([px, q]) => `${px} p95 ${q.p95.toFixed(1)} max ${q.max.toFixed(1)}`).join(' | ')}`);
        }
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
  const compare = comparison(results);
  printComparison(compare, repeat);
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${label}.json`);
  fs.writeFileSync(file, JSON.stringify({
    label, bundle: BUNDLE, size, dpr, query, throttle, gpu, paused, laps, repeat, variants: variants.filter(Boolean),
    seconds, warmup, at: new Date().toISOString(), results, compare,
  }, null, 1));
  console.log(`→ ${path.relative(ROOT, file)}`);
}

/** Frame work grouped by the tile size the frame was drawn at. */
function workByPx(rec) {
  const by = {};
  rec.px.forEach((px, i) => (by[px] = by[px] || []).push(rec.work[i]));
  return Object.fromEntries(Object.entries(by).sort((a, b) => a[0] - b[0]).map(([px, w]) => [px, quantiles(w)]));
}

const sum = (a) => a.reduce((s, v) => s + v, 0);
const MiB = (b) => (b || 0) / 1048576;

/** One lap's SE.landStats as the report needs it; null when the build has none. */
function landSummary(l, span) {
  if (!l) return null;
  const scalars = Object.fromEntries(Object.entries(l).filter(([, v]) => typeof v === 'number'));
  return {
    ...scalars, features: l.features,
    readyShare: l.entered ? l.readyOnEntry / l.entered : null,
    ready: quantiles(l.ready || []),
    compose: { ...quantiles(l.composeMs || []), sum: sum(l.composeMs || []) },
    scale: { ...quantiles(l.scaleMs || []), sum: sum(l.scaleMs || []) },
    msgsPerS: ((l.msgsOut || 0) + (l.msgsIn || 0)) / span,
    kBPerS: ((l.bytesOut || 0) + (l.bytesIn || 0)) / 1024 / span,
    zoomPeakMiB: MiB(l.peakZoomBytes),
    zoomEndMiB: MiB((l.pageZoomBytes || 0) + (l.flightBytes || 0) + (l.workerBytes || 0)),
    baseMiB: MiB(l.baseBytes), smallMiB: MiB(l.smallBytes),
  };
}

function fmtLand(l) {
  if (!l) return 'land –';
  const f = l.features || {};
  return `land [${['ahead', 'zoom'].filter((k) => f[k]).join('+') || 'plain'}${f.zoomCapable ? '' : ', no zoom cache'}]`
    + `  entered ${l.entered} ready on entry ${l.readyShare === null ? '–' : `${(l.readyShare * 100).toFixed(1)} %`}  ready ${l.ready.n ? `p50 ${l.ready.p50.toFixed(0)} p95 ${l.ready.p95.toFixed(0)} max ${l.ready.max.toFixed(0)} ms` : '–'}`
    + `  ahead asked/used/unused/dropped/upgraded ${[l.aheadAsked, l.aheadUsed, l.aheadUnused, l.aheadDropped, l.aheadUpgraded].join('/')}`
    + `  zoom hit/miss/built/used/unused/late/evicted/over ${[l.zoomHits, l.zoomMisses, l.zoomBuilt, l.zoomUsed, l.zoomUnused, l.zoomLate, l.zoomEvicted, l.zoomOverBudget].join('/')}`
    + `  compose p50 ${l.compose.p50.toFixed(1)} p95 ${l.compose.p95.toFixed(1)} Σ ${l.compose.sum.toFixed(0)} ms  scale p50 ${l.scale.p50.toFixed(1)} p95 ${l.scale.p95.toFixed(1)} Σ ${l.scale.sum.toFixed(0)} ms`
    + `  land msgs ${l.msgsPerS.toFixed(1)}/s ${l.kBPerS.toFixed(0)} kB/s  zoom peak ${l.zoomPeakMiB.toFixed(1)} end ${l.zoomEndMiB.toFixed(1)} MiB  base ${l.baseMiB.toFixed(1)} small ${l.smallMiB.toFixed(1)} MiB`;
}

/** SE.waterFxStats over one lap: the counters' growth; null when the build has none. */
function waterSummary(a, b, span) {
  if (!a || !b) return null;
  const d = Object.fromEntries(WATER_KEYS.map((k) => [k, b[k] - a[k]]));
  return { active: b.active, ...d, rendersPerS: d.renders / span, uploadKiB: d.uploadBytes / 1024, canvasMpx: d.canvasPx / 1e6 };
}

function fmtWater(w) {
  if (!w) return 'water –';
  return `water [${w.active ? 'on' : 'off'}]  renders ${w.renders} (${w.rendersPerS.toFixed(1)}/s)  uploads chunk ${w.chunkUploads} tile ${w.tileUploads} ${w.uploadKiB.toFixed(0)} KiB  canvas ${w.canvasMpx.toFixed(1)} MPx`;
}

/** Comparison columns: [header, value of one lap result (null = none), 'low' or 'high' is better, decimals]. */
const COMPARE = [
  ['frames', [
    ['work95', (r) => r.work.p95, 'low', 1], ['work99', (r) => r.work.p99, 'low', 1], ['workMax', (r) => r.work.max, 'low', 1],
    ['gap95', (r) => r.gap.p95, 'low', 1], ['gap99', (r) => r.gap.p99, 'low', 1], ['>16.7%', (r) => r.over60 * 100, 'low', 1],
    ['long', (r) => r.long.n, 'low', 0], ['longMax', (r) => r.long.max, 'low', 0], ['tick/s', (r) => r.ticksPerS, 'high', 2],
    ['age50', (r) => (r.age.n ? r.age.p50 : null), 'low', 0],
  ]],
  ['land: readiness and prefetch', [
    ['entered', (l) => l.entered, 'low', 0], ['ready%', (l) => (l.readyShare === null ? null : l.readyShare * 100), 'high', 1],
    ['rdy50', (l) => l.ready.p50, 'low', 0], ['rdy95', (l) => l.ready.p95, 'low', 0], ['rdyMax', (l) => l.ready.max, 'low', 0],
    ['asked', (l) => l.aheadAsked, 'low', 0], ['used', (l) => l.aheadUsed, 'high', 0], ['unused', (l) => l.aheadUnused, 'low', 0],
    ['dropped', (l) => l.aheadDropped, 'low', 0], ['upgraded', (l) => l.aheadUpgraded, 'low', 0],
  ]],
  ['land: zoom cache', [
    ['hits', (l) => l.zoomHits, 'high', 0], ['misses', (l) => l.zoomMisses, 'low', 0], ['built', (l) => l.zoomBuilt, 'low', 0],
    ['used', (l) => l.zoomUsed, 'high', 0], ['unused', (l) => l.zoomUnused, 'low', 0], ['late', (l) => l.zoomLate, 'low', 0],
    ['evicted', (l) => l.zoomEvicted, 'low', 0], ['over', (l) => l.zoomOverBudget, 'low', 0],
  ]],
  ['land: cost', [
    ['comp50', (l) => l.compose.p50, 'low', 1], ['comp95', (l) => l.compose.p95, 'low', 1], ['compΣ', (l) => l.compose.sum, 'low', 0],
    ['scale50', (l) => l.scale.p50, 'low', 1], ['scale95', (l) => l.scale.p95, 'low', 1], ['scaleΣ', (l) => l.scale.sum, 'low', 0],
    ['msg/s', (l) => l.msgsPerS, 'low', 1], ['kB/s', (l) => l.kBPerS, 'low', 0], ['peakMiB', (l) => l.zoomPeakMiB, 'low', 1],
    ['zoomMiB', (l) => l.zoomEndMiB, 'low', 1], ['baseMiB', (l) => l.baseMiB, 'low', 1], ['smallMiB', (l) => l.smallMiB, 'low', 1],
  ]],
  ['water fx', [
    ['on', (w) => (w.active ? 1 : 0), 'high', 0], ['rend/s', (w) => w.rendersPerS, 'high', 1],
    ['chunkUp', (w) => w.chunkUploads, 'low', 0], ['tileUp', (w) => w.tileUploads, 'low', 0],
    ['upKiB', (w) => w.uploadKiB, 'low', 0], ['MPx', (w) => w.canvasMpx, 'low', 1],
  ]],
];
/** What a comparison table reads of one lap result. */
const SOURCE = (title, r) => (title === 'frames' ? r : title === 'water fx' ? r.water : r.land);

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Per scenario × variant × lap: every comparison column's median over the repeats and its worst repeat. */
function comparison(results) {
  const groups = new Map();
  for (const r of results) {
    const key = `${r.name}|${r.variant}|${r.lap}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  return [...groups.values()].map((rs) => {
    const row = { name: rs[0].name, variant: rs[0].variant, lap: rs[0].lap, repeats: rs.length, tables: {} };
    for (const [title, cols] of COMPARE) {
      row.tables[title] = Object.fromEntries(cols.map(([head, get, better]) => {
        const vals = rs.map((r) => SOURCE(title, r)).filter(Boolean).map(get).filter((v) => typeof v === 'number' && Number.isFinite(v));
        if (!vals.length) return [head, null];
        return [head, { median: median(vals), worst: better === 'high' ? Math.min(...vals) : Math.max(...vals) }];
      }));
    }
    return row;
  });
}

function printComparison(rows, repeat) {
  if (!rows.length) return;
  console.log(`\ncomparison${repeat > 1 ? ` (median/worst of ${repeat} repeats)` : ''}`);
  const any = (title) => rows.some((row) => Object.values(row.tables[title]).some(Boolean));
  const anyLand = any('land: cost');
  for (const [title, cols] of COMPARE) {
    if (title === 'water fx' ? !any(title) : title !== 'frames' && !anyLand) {
      console.log(`${title}: – (no SE.${title === 'water fx' ? 'waterFxStats' : 'landStats'} in this build)`);
      continue;
    }
    const lines = [['', ...cols.map(([head]) => head)]];
    for (const row of rows) {
      lines.push([`${row.name} ${row.variant || '-'} L${row.lap}`, ...cols.map(([head, , , dec]) => {
        const c = row.tables[title][head];
        return c ? (repeat > 1 ? `${c.median.toFixed(dec)}/${c.worst.toFixed(dec)}` : c.median.toFixed(dec)) : '–';
      })]);
    }
    const widths = lines[0].map((_, j) => Math.max(...lines.map((l) => l[j].length)));
    console.log(title);
    for (const l of lines) console.log(l.map((c, j) => (j === 0 ? c.padEnd(widths[j]) : c.padStart(widths[j]))).join('  '));
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const names = argv.slice(1).filter((a, k, all) => !a.startsWith('--') && !(k > 0 && all[k - 1].startsWith('--') && !FLAGS.includes(all[k - 1])));
  const picked = names.length ? names : SCENARIOS;
  for (const n of picked) if (!SCENARIOS.includes(n)) fail(`unknown scenario ${n} (${SCENARIOS.join(', ')})`);
  if (cmd === 'saves') return makeSaves(argv.includes('--force'));
  if (cmd === 'systems') return systems(picked, Number(opt(argv, 'ticks', 100)));
  if (cmd === 'browser') return browser(picked, argv);
  fail('usage: perf-bench.js saves|systems|browser [scenario …] (see the header)');
}

main().catch((e) => fail(e.stack || String(e)));
