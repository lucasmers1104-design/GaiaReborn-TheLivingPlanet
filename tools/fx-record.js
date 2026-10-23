/* =============================================================================
 * SimEarth 2.0 — record a disaster on the map
 * -----------------------------------------------------------------------------
 * Opens a fast-forwarded planet (_preview.js) in headless Chrome over the
 * DevTools protocol, raises a disaster through the one-tile flow
 * (App.raiseHazard) and captures frames of the map at roughly 10 per second:
 * an animated PNG (plays in any browser), a contact sheet of evenly spaced
 * frames and the single frames. Chrome runs one recording or sheet at a time
 * (the lock tools/species-sheet.js uses). Uses SE_BUNDLE or --bundle, so a
 * parallel build never touches simulation.js.
 *
 *   node tools/fx-record.js --kind volcano [--x N --y N] [--seed N] [--epoch id]
 *        [--ticks N] [--zoom px] [--speed 0-4] [--frames N] [--every ms]
 *        [--size WxH] [--reduce] [--bundle file] [--out dir]
 *
 *     --kind    EventKind name in lower case (volcano, meteor, fire, …)
 *     --x/--y   the tile; without them the page picks one for --site:
 *               inland (a vegetated slope, the default), fuel (dry woods
 *               that burn best), coast, shelf, sea
 *     --ticks   fast-forward before recording (default 1500)
 *     --speed   game speed while recording (default 3, "Mittel")
 *     --frames  frames to capture (default 90), --every ms apart (default 100)
 *     --count   raise N disasters at once, spread over the view
 *     --perf    measure for this many ms instead of capturing: the effect
 *               layer's time per frame and the frame interval
 *     --whales  no disaster: put great whales (Cetacean stages 4/5/7) on the
 *               open sea around the tile (site 'sea'); use with --speed 0
 *     --stages  with --whales, the Cetacean stages to put there (default
 *               4,5,7; 6 for dolphins, which leap only on warm seas)
 *     --setup   JavaScript run in the page once the view is placed, e.g. to
 *               put the world into a state; with --count 0 no disaster
 * ========================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');
const { encodeRGBA } = require('./terrain/png');

const ROOT = path.join(__dirname, '..');
const CHROMES = [
  process.env.CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

function fail(msg) {
  console.error(`fx-record: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const a = { kind: 'volcano', x: null, y: null, seed: null, epoch: null, ticks: 1500, zoom: 32, speed: 3, frames: 90, every: 100, w: 640, h: 400, reduce: false, bundle: null, out: null, count: 1, perf: 0, site: 'inland', whales: false, stages: [4, 5, 7] };
  for (let k = 0; k < argv.length; k++) {
    const v = argv[k];
    const next = () => argv[++k];
    if (v === '--kind') a.kind = next();
    else if (v === '--x') a.x = Number(next());
    else if (v === '--y') a.y = Number(next());
    else if (v === '--seed') a.seed = Number(next());
    else if (v === '--epoch') a.epoch = next();
    else if (v === '--ticks') a.ticks = Number(next());
    else if (v === '--zoom') a.zoom = Number(next());
    else if (v === '--speed') a.speed = Number(next());
    else if (v === '--frames') a.frames = Number(next());
    else if (v === '--every') a.every = Number(next());
    else if (v === '--size') [a.w, a.h] = next().split('x').map(Number);
    else if (v === '--reduce') a.reduce = true;
    else if (v === '--count') a.count = Number(next());
    else if (v === '--site') { a.site = next(); a.siteGiven = true; }
    else if (v === '--perf') a.perf = Number(next());
    else if (v === '--whales') a.whales = true;
    else if (v === '--stages') a.stages = next().split(',').map(Number);
    else if (v === '--setup') a.setup = next();
    else if (v === '--bundle') a.bundle = next();
    else if (v === '--out') a.out = next();
    else fail(`unknown argument ${v}`);
  }
  return a;
}

/* ------------------------------------------------------------- PNG I/O -- */

function chunks(buf) {
  const out = [];
  for (let p = 8; p < buf.length;) {
    const len = buf.readUInt32BE(p);
    out.push({ type: buf.toString('ascii', p + 4, p + 8), data: buf.subarray(p + 8, p + 8 + len) });
    p += 12 + len;
  }
  return out;
}

/** RGBA pixels of an 8-bit, non-interlaced RGB or RGBA PNG (what Chrome writes). */
function decode(buf) {
  const cs = chunks(buf);
  const ihdr = cs.find((c) => c.type === 'IHDR').data;
  const w = ihdr.readUInt32BE(0);
  const h = ihdr.readUInt32BE(4);
  const bpp = ihdr[9] === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(cs.filter((c) => c.type === 'IDAT').map((c) => c.data)));
  const stride = w * bpp;
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const r = raw[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = r;
      if (f === 1) v = r + a;
      else if (f === 2) v = r + b;
      else if (f === 3) v = r + ((a + b) >> 1);
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = r + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      px[y * stride + x] = v & 255;
    }
  }
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = px[i * bpp];
    rgba[i * 4 + 1] = px[i * bpp + 1];
    rgba[i * 4 + 2] = px[i * bpp + 2];
    rgba[i * 4 + 3] = 255;
  }
  return { w, h, rgba };
}

/** An animated PNG from frames of equal size; `delays` in ms. */
function apng(frames, delays) {
  const crcTable = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b) => {
    let c = 0xffffffff;
    for (const v of b) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, c]);
  };
  const first = chunks(frames[0]);
  const ihdr = first.find((c) => c.type === 'IHDR').data;
  const out = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr)];
  const actl = Buffer.alloc(8);
  actl.writeUInt32BE(frames.length, 0);
  out.push(chunk('acTL', actl));
  let seq = 0;
  frames.forEach((png, n) => {
    const fctl = Buffer.alloc(26);
    fctl.writeUInt32BE(seq++, 0);
    fctl.writeUInt32BE(ihdr.readUInt32BE(0), 4);
    fctl.writeUInt32BE(ihdr.readUInt32BE(4), 8);
    fctl.writeUInt16BE(Math.max(1, Math.round(delays[n])), 20);
    fctl.writeUInt16BE(1000, 22);
    out.push(chunk('fcTL', fctl));
    for (const c of chunks(png).filter((x) => x.type === 'IDAT')) {
      if (n === 0) out.push(chunk('IDAT', c.data));
      else {
        const s = Buffer.alloc(4);
        s.writeUInt32BE(seq++);
        out.push(chunk('fdAT', Buffer.concat([s, c.data])));
      }
    }
  });
  out.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(out);
}

/** Evenly spaced frames in a grid, `cols` wide, each with a time bar under it. */
function contactSheet(frames, times, cols) {
  const pick = Math.min(frames.length, cols * 3);
  const chosen = Array.from({ length: pick }, (_, k) => Math.round((k * (frames.length - 1)) / Math.max(1, pick - 1)));
  const imgs = chosen.map((k) => decode(frames[k]));
  const fw = imgs[0].w;
  const fh = imgs[0].h;
  const gap = 4;
  const bar = 4;
  const rows = Math.ceil(pick / cols);
  const w = cols * (fw + gap) + gap;
  const h = rows * (fh + bar + gap) + gap;
  const out = new Uint8Array(w * h * 4).fill(40);
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  const total = times[times.length - 1] || 1;
  imgs.forEach((img, n) => {
    const ox = gap + (n % cols) * (fw + gap);
    const oy = gap + Math.floor(n / cols) * (fh + bar + gap);
    for (let y = 0; y < fh; y++) out.set(img.rgba.subarray(y * fw * 4, (y + 1) * fw * 4), ((oy + y) * w + ox) * 4);
    const len = Math.round((times[chosen[n]] / total) * fw);
    for (let y = 0; y < bar; y++) {
      for (let x = 0; x < len; x++) {
        const o = ((oy + fh + y) * w + ox + x) * 4;
        out[o] = 240; out[o + 1] = 180; out[o + 2] = 60;
      }
    }
  });
  return encodeRGBA(w, h, out);
}

/* -------------------------------------------------------------- Chrome -- */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.wait.has(msg.id)) {
        const [ok, ko] = this.wait.get(msg.id);
        this.wait.delete(msg.id);
        if (msg.error) ko(new Error(`${msg.error.message}`));
        else ok(msg.result);
      }
    };
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((ok, ko) => this.wait.set(id, [ok, ko]));
  }

  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
}

/** Headless Chrome with a fresh profile in `work`, at w × h. */
function launchChrome(chrome, work, w, h) {
  return spawn(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--remote-debugging-port=0', `--user-data-dir=${path.join(work, 'profile')}`, `--window-size=${w},${h}`, 'about:blank',
  ], { stdio: 'ignore' });
}

/** The DevTools connection to the launched Chrome's page, sized w × h at device scale 1. */
async function connect(work, w, h) {
  const portFile = path.join(work, 'profile', 'DevToolsActivePort');
  for (let k = 0; k < 100 && !fs.existsSync(portFile); k++) await sleep(100);
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = list.find((t) => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko; });
  const cdp = new Cdp(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  return { ws, cdp };
}

const PAGE = (bundle) => `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><base href="${pathToUrl(ROOT)}/">
<link rel="stylesheet" href="styles.css">
<style>.showcase, .showcase-backdrop, .milestones, .toast-card, .toast, .win, .dock, .goal, .map-zoom, .companion, .companion-say, .vines-back, .vines-front, .vines-top, .vines-hang, .magic-layer, .magic-glow { display: none !important; }</style></head><body>
<header id="topbar" class="topbar glass"><nav id="menubar" class="menubar"></nav><div id="hud" class="hud"></div></header>
<main id="desktop" class="stage"></main><div id="toasts" class="toasts"></div><div id="milestones" class="milestones"></div><div id="modal-root" class="modal-root"></div>
<script src="${pathToUrl(bundle)}"></script><script src="_preview.js"></script></body></html>`;

function pathToUrl(p) {
  return `file:///${path.resolve(p).replace(/\\/g, '/')}`;
}

/** Page script: pick a tile for the disaster on the given kind of site. */
const PICK = (site) => `(() => {
  const app = SE.app, w = app.world, site = ${JSON.stringify(site)};
  const at = (x, y) => w.elevation[SE.idx(SE.wrapX(x), Math.max(0, Math.min(SE.GRID_H - 1, y)))];
  let best = -1, bestScore = -Infinity;
  for (let y = 24; y < SE.GRID_H - 24; y++) for (let x = 0; x < SE.GRID_W; x++) {
    const i = SE.idx(x, y), e = w.elevation[i];
    let water = 0, land = 0, green = 0, drop = 0, fuel = 0;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const v = at(x + dx, y + dy);
      const j = SE.idx(SE.wrapX(x + dx), y + dy);
      if (v < 0) water++; else { land++; green += w.vegetation[j]; fuel += SE.fireFuel(w, j) * SE.fireDryness(w, j); }
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) drop = Math.max(drop, e - v);
    }
    let score = -Infinity;
    if (site === 'inland' && e > 0.12 && e < 0.45 && water === 0 && w.tech[i] === 0) score = green + drop * 40;
    if (site === 'coast' && e > 0.03 && e < 0.2 && water >= 12 && water <= 40 && w.tech[i] === 0) score = green + drop * 30;
    if (site === 'shelf' && e > -0.12 && e < -0.05 && land >= 12) score = land;
    if (site === 'sea' && e < -0.2 && land === 0) score = -e;
    if (site === 'fuel' && water === 0 && !SE.HAZARD_RULES[SE.EventKind.Fire].refuse(w, x, y)) score = fuel;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best < 0 ? null : [best % SE.GRID_W, Math.floor(best / SE.GRID_W)];
})()`;

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const bundle = path.resolve(a.bundle || process.env.SE_BUNDLE || path.join(ROOT, 'simulation.js'));
  if (!fs.existsSync(bundle)) fail(`no bundle at ${bundle}`);
  const chrome = CHROMES.find((c) => fs.existsSync(c));
  if (!chrome) fail('no Chrome or Edge found; set CHROME to its path');
  const out = path.resolve(a.out || path.join(os.tmpdir(), `simearth-fx-${a.whales ? 'whales' : a.kind}`));
  fs.mkdirSync(out, { recursive: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'simearth-rec-'));
  const html = path.join(work, 'record.html');
  fs.writeFileSync(html, PAGE(bundle));
  const q = new URLSearchParams({ hazards: '1', ticks: String(a.ticks) });
  if (a.seed !== null) q.set('seed', String(a.seed));
  if (a.epoch) q.set('epoch', a.epoch);

  const release = await lock();
  const proc = launchChrome(chrome, work, a.w, a.h);
  try {
    const { ws, cdp } = await connect(work, a.w, a.h);
    await cdp.send('Page.navigate', { url: `${pathToUrl(html)}?${q}` });
    for (let k = 0; k < 600; k++) {
      await sleep(250);
      try { if ((await cdp.eval('document.title')) === 'ready') break; } catch { /* still loading */ }
      if (k === 599) fail('the page never became ready');
    }
    const kindId = `SE.EventKind[${JSON.stringify(a.kind)}] ?? SE.EventKind[Object.keys(SE.EventKind).find((n) => n.toLowerCase() === ${JSON.stringify(a.kind)})]`;
    const tile = a.x !== null && a.y !== null ? [a.x, a.y] : await cdp.eval(PICK((a.kind === 'tidalwave' || a.whales) && !a.siteGiven ? 'sea' : a.site));
    if (!tile) fail('no suitable tile on this planet');
    // Hide every window: only the map counts.
    await cdp.eval(`(() => { const app = SE.app; for (const el of document.querySelectorAll('.win')) el.style.display = 'none';
      app.setDockCollapsed(true);
      app.editView.tilePx = ${a.zoom}; app.editView.centerOn(${tile[0]}, ${tile[1]} - 1);
      app.settings.reduceEffects = ${a.reduce}; app.editView.reduceEffects = ${a.reduce};
      app.setSpeed(${a.speed}, true); app.editView.markDirty(); })()`);
    await sleep(1500);
    const rect = await cdp.eval(`(() => { const r = document.querySelector('.world-canvas').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()`);
    const ticks0 = await cdp.eval('SE.app.world.ticks');
    if (a.whales) {
      // Cetaceans on the water within 6 tiles, stages mixed; the herd layer re-selects 300 ms after an edit.
      await cdp.eval(`(() => { const w = SE.app.world, stages = ${JSON.stringify(a.stages)};
        for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
          const y = ${tile[1]} + dy, i = SE.idx(SE.wrapX(${tile[0]} + dx), y);
          if (y < 0 || y >= SE.GRID_H || !w.isWater(i) || dx * dx + dy * dy > 36) continue;
          w.lifeDensity[i * SE.LIFE_COUNT + SE.Life.Cetacean] = 0.6;
          w.lifeStage[i * SE.LIFE_COUNT + SE.Life.Cetacean] = stages[(dx + 7 * dy + 99) % stages.length];
        }
        w.revision++; SE.app.editView.markDirty(); })()`);
      await sleep(600);
    }
    if (a.setup) {
      await cdp.eval(a.setup);
      await sleep(600);
    }
    for (let n = 0; n < (a.whales ? 0 : a.count); n++) {
      const dx = n === 0 ? 0 : Math.round(Math.cos(n * 2.4) * 6);
      const dy = n === 0 ? 0 : Math.round(Math.sin(n * 2.4) * 3);
      await cdp.eval(`SE.app.world.omega = SE.OMEGA_MAX; SE.app.raiseHazard(${kindId}, ${tile[0] + dx}, ${tile[1] + dy})`);
    }
    if (a.perf > 0) {
      const stats = await cdp.eval(`new Promise((done) => {
        const fx = SE.app.editView.fx, spent = [], gaps = [], worst = {};
        let frame = 0, last = performance.now();
        for (const m of ['update', 'drawShake', 'drawGround', 'drawObjects', 'drawTop']) {
          const orig = fx[m].bind(fx);
          fx[m] = (...args) => { const t = performance.now(); const r = orig(...args); const d = performance.now() - t; frame += d; worst[m] = Math.max(worst[m] || 0, d); return r; };
        }
        const tick = (now) => { spent.push(frame); gaps.push(now - last); frame = 0; last = now;
          if (gaps.reduce((x, y) => x + y, 0) < ${a.perf}) requestAnimationFrame(tick); else done({ spent, gaps, worst }); };
        requestAnimationFrame(tick);
      })`);
      const q = (v, p) => [...v].sort((x, y) => x - y)[Math.floor(p * (v.length - 1))];
      const avg = (v) => v.reduce((x, y) => x + y, 0) / v.length;
      console.log(`${a.count} × ${a.kind} at speed ${a.speed}: effect layer ${avg(stats.spent).toFixed(2)} ms/frame (p95 ${q(stats.spent, 0.95).toFixed(2)}, max ${Math.max(...stats.spent).toFixed(2)}), frame interval ${avg(stats.gaps).toFixed(1)} ms (p95 ${q(stats.gaps, 0.95).toFixed(1)}) over ${stats.gaps.length} frames; worst per pass ${Object.entries(stats.worst).map(([k, v]) => k + ' ' + v.toFixed(1)).join(', ')}`);
      ws.close();
      return;
    }
    const frames = [];
    const times = [];
    const t0 = Date.now();
    for (let n = 0; n < a.frames; n++) {
      const due = t0 + n * a.every;
      if (Date.now() < due) await sleep(due - Date.now());
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: rect[0], y: rect[1], width: rect[2], height: rect[3], scale: 1 } });
      frames.push(Buffer.from(shot.data, 'base64'));
      times.push(Date.now() - t0);
    }
    const ticks = (await cdp.eval('SE.app.world.ticks')) - ticks0;
    ws.close();
    const delays = times.map((t, n) => (n + 1 < times.length ? times[n + 1] - t : a.every));
    frames.forEach((f, n) => fs.writeFileSync(path.join(out, `f${String(n).padStart(3, '0')}.png`), f));
    fs.writeFileSync(path.join(out, 'anim.png'), apng(frames, delays));
    fs.writeFileSync(path.join(out, 'sheet.png'), contactSheet(frames, times, 4));
    console.log(`tile ${tile[0]},${tile[1]} · ${ticks} ticks · ${frames.length} frames over ${(times[times.length - 1] / 1000).toFixed(1)} s · ${out}`);
  } finally {
    proc.kill();
    release();
    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* Chrome may still hold the profile */ }
  }
}

module.exports = { CHROMES, ROOT, apng, contactSheet, lock, launchChrome, connect, pathToUrl, sleep };

if (require.main === module) main().catch((e) => fail(e.stack || e.message));
