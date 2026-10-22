'use strict';
/*
 * Landscape prefetch and zoom pictures without a browser: LandJobs
 * (src/landworker.ts) against a fake worker, LandZoomCache (src/landzoom.ts)
 * with fake bitmaps, CameraMotion and aheadChunks (src/landahead.ts) as plain
 * arithmetic. Grid: 16 × 8 chunks of 16 tiles, chunk n = cy * 16 + cx.
 */
const test = require('node:test');
const assert = require('node:assert');
const { loadSE } = require('./helpers.js');

const SE = loadSE();
const P = SE.LandPriority;

/** LandJobs on a fake worker, recording what it posts and what it calls back. */
function jobsOn() {
  const w = {
    sent: [], terminated: false, onmessage: null, onerror: null,
    postMessage(m) { this.sent.push(m); },
    terminate() { this.terminated = true; },
  };
  const jobs = new SE.LandJobs(w, '');
  const log = { chunks: [], zooms: [], drops: [], fails: 0 };
  jobs.onChunk = (m, own) => log.chunks.push({ id: m.id, own });
  jobs.onZoom = (m, reserved) => log.zooms.push({ id: m.id, reserved });
  jobs.onDrop = (n, k) => log.drops.push([n, k]);
  jobs.onFail = () => log.fails++;
  return { w, jobs, log, posted: () => w.sent.filter((m) => m.t === 'job') };
}

/** Ask for chunk n from the worker's own field (page = false: no field goes over). */
const ask = (jobs, n, sig, prio = P.Visible, k = 0) => jobs.ask(null, null, n, 0, 0, 16, 2, sig, false, prio, k);

/** The worker answers a posted job. */
function answer(w, job, extra = {}) {
  w.onmessage({ data: {
    t: 'chunk', id: job.id, n: job.n, gen: job.gen, prio: job.prio, sig: 0, words: null, motion: null,
    k: job.k, later: false, ms: 0, held: 0, ...extra,
  } });
}

const bitmap = (px) => ({ width: px, height: px, closed: false, close() { this.closed = true; } });

// --- LandJobs: priorities, dedupe, direction change, failure -----------------

test('LandJobs: the same chunk at the same signature is asked once; a new signature replaces the job', () => {
  const { jobs, posted } = jobsOn();
  assert.ok(ask(jobs, 5, 1));
  assert.ok(ask(jobs, 5, 1));
  assert.equal(posted().length, 1);
  assert.ok(ask(jobs, 5, 2));
  const [a, b] = posted();
  assert.equal(b.n, 5);
  assert.notEqual(b.id, a.id);
  assert.equal(jobs.busy, 1);
});

test('LandJobs: the page field goes over once before the first page job after it changed', () => {
  const { w, jobs } = jobsOn();
  const field = { key: new Uint8Array(4) };
  jobs.ask(field, null, 1, 16, 0, 16, 2, 1, true);
  jobs.ask(field, null, 2, 32, 0, 16, 2, 1, true);
  assert.deepEqual(w.sent.map((m) => m.t), ['field', 'job', 'job']);
  assert.equal(w.sent[0].parts.key, field.key);
  jobs.fieldChanged();
  jobs.ask(field, null, 3, 48, 0, 16, 2, 1, true);
  assert.deepEqual(w.sent.slice(3).map((m) => m.t), ['field', 'job']);
});

test('LandJobs: slots cap at 6 visible, 1 ahead, 2 zoom, and lesser jobs never take a visible slot', () => {
  const { jobs } = jobsOn();
  assert.ok(ask(jobs, 100, 1, P.Ahead));
  assert.ok(!ask(jobs, 101, 1, P.Ahead));
  assert.ok(ask(jobs, 110, 1, P.Zoom, 2));
  assert.ok(ask(jobs, 111, 1, P.Zoom, 2));
  assert.ok(!ask(jobs, 112, 1, P.Zoom, 2));
  assert.ok(!jobs.room(P.Ahead) && !jobs.room(P.Zoom));
  assert.equal(jobs.busy, 0);
  for (let n = 0; n < 6; n++) assert.ok(jobs.room(P.Visible) && ask(jobs, n, 1), `visible ${n}`);
  assert.ok(!jobs.room(P.Visible));
  assert.ok(!ask(jobs, 6, 1));
  assert.equal(jobs.busy, 6);
  // A newer signature for a chunk already asked for replaces its job even with every slot taken.
  assert.ok(ask(jobs, 0, 2));
  assert.equal(jobs.busy, 6);
});

test('LandJobs: asking the chunk ahead again as visible makes its queued job urgent', () => {
  const { w, jobs, posted } = jobsOn();
  SE.landStats.reset();
  ask(jobs, 40, 7, P.Ahead);
  assert.equal(SE.landStats.aheadAsked, 1);
  assert.equal(jobs.aheadChunk, 40);
  const id = posted()[0].id;
  assert.ok(ask(jobs, 40, 7, P.Visible));
  assert.deepEqual(w.sent.at(-1), { t: 'prio', id, prio: P.Visible });
  assert.equal(posted().length, 1);
  assert.equal(SE.landStats.aheadUpgraded, 1);
  assert.equal(jobs.busy, 1);
  assert.equal(jobs.aheadChunk, -1);
  // Asking at a lesser priority again changes nothing.
  const sent = w.sent.length;
  assert.ok(ask(jobs, 40, 7, P.Ahead));
  assert.equal(w.sent.length, sent);
  assert.equal(SE.landStats.aheadUpgraded, 1);
});

test('LandJobs: a cancelled or replaced job is dropped and a late answer to it is not its own', () => {
  const { w, jobs, log, posted } = jobsOn();
  ask(jobs, 3, 1, P.Zoom, 2);
  const cancelled = posted()[0];
  jobs.cancel(3);
  assert.deepEqual(w.sent.at(-1), { t: 'drop', ids: [cancelled.id], all: false });
  assert.deepEqual(log.drops, [[3, 2]]);
  assert.ok(!jobs.asking(3));
  answer(w, cancelled); // it had started already
  assert.deepEqual(log.chunks, [{ id: cancelled.id, own: false }]);

  ask(jobs, 4, 1);
  ask(jobs, 4, 2);
  const [, older, newer] = posted();
  answer(w, older);
  assert.ok(jobs.asking(4), 'the newer job is still on its way');
  answer(w, newer);
  assert.ok(!jobs.asking(4));
  assert.deepEqual(log.chunks.slice(1).map((c) => c.own), [false, true]);

  // Replaced at another magnification: the old one's zoom reservation can go.
  ask(jobs, 5, 1, P.Zoom, 2);
  ask(jobs, 5, 2, P.Visible, 0);
  assert.deepEqual(log.drops.at(-1), [5, 2]);
});

test('LandJobs: clear() drops every job and ignores answers for the planet before', () => {
  const { w, jobs, log, posted } = jobsOn();
  ask(jobs, 2, 1, P.Zoom, 2);
  const old = posted()[0];
  jobs.clear();
  assert.equal(jobs.gen, 1);
  assert.deepEqual(w.sent.at(-1), { t: 'drop', ids: [], all: true });
  assert.deepEqual(log.drops, [[2, 2]]);
  assert.ok(!jobs.asking(2));
  const zoom = bitmap(32);
  answer(w, old, { later: true });
  w.onmessage({ data: { t: 'zoom', id: old.id, n: old.n, gen: old.gen, sig: 0, k: 2, bitmap: zoom, ms: 0, held: 0 } });
  assert.equal(log.chunks.length, 0);
  assert.equal(log.zooms.length, 0);
  assert.ok(zoom.closed, 'the old planet\'s zoom picture is closed');
  ask(jobs, 2, 1, P.Zoom, 2);
  const fresh = posted()[1];
  assert.equal(fresh.gen, 1);
  const kept = bitmap(32);
  answer(w, fresh, { later: true });
  w.onmessage({ data: { t: 'zoom', id: fresh.id, n: fresh.n, gen: fresh.gen, sig: 0, k: 2, bitmap: kept, ms: 0, held: 0 } });
  assert.deepEqual(log.chunks, [{ id: fresh.id, own: true }]);
  assert.deepEqual(log.zooms, [{ id: fresh.id, reserved: true }], 'the picture comes after its pixels and settles the reservation');
  assert.ok(!kept.closed);
});

test('LandJobs: zoom jobs for a magnification the zoom has left are dropped', () => {
  const { w, jobs, log } = jobsOn();
  ask(jobs, 3, 1, P.Zoom, 2);
  ask(jobs, 4, 1, P.Zoom, 3);
  jobs.dropZoom(3);
  assert.ok(!jobs.asking(3) && jobs.asking(4));
  assert.deepEqual(log.drops, [[3, 2]]);
  assert.equal(w.sent.at(-1).t, 'drop');
});

test('LandZoomCache: a picture refused for lack of room is asked for again after a while', () => {
  SE.landStats.reset();
  const z = new SE.LandZoomCache(2 * SE.LandZoomCache.bytesOf(4, 2));
  assert.ok(z.reserve(1, 2, 4));
  assert.ok(z.reserve(2, 2, 4));
  assert.ok(!z.reserve(3, 2, 4), 'full: everything is on its way');
  assert.ok(!z.reserve(3, 2, 4));
  z.release(1, 2);
  assert.ok(!z.reserve(3, 2, 4), 'room again, but the refusal still holds');
  for (let f = 0; f < 60; f++) z.nextFrame();
  assert.ok(z.reserve(3, 2, 4), 'a second later it is asked again');
});

test('LandJobs: a fatal worker error hands every job back and refuses new ones', (t) => {
  t.mock.method(console, 'warn', () => {});
  const { w, jobs, log } = jobsOn();
  ask(jobs, 1, 1);
  ask(jobs, 9, 1, P.Ahead);
  ask(jobs, 2, 1, P.Zoom, 2);
  const sent = w.sent.length;
  w.onmessage({ data: { t: 'fatal', message: 'boom' } });
  assert.equal(jobs.alive, false);
  assert.ok(w.terminated);
  assert.equal(log.fails, 1);
  assert.deepEqual(log.drops.sort((a, b) => a[0] - b[0]), [[1, 0], [2, 2], [9, 0]]);
  for (const p of [P.Visible, P.Ahead, P.Zoom]) assert.equal(jobs.room(p), false, `room ${p}`);
  assert.equal(ask(jobs, 3, 1), false);
  assert.equal(jobs.busy, 0);
  w.onerror({ message: 'again', preventDefault() {} });
  assert.equal(log.fails, 1, 'fails once');
  jobs.clear();
  assert.equal(w.sent.length, sent, 'nothing posted to a dead worker');
});

// --- CameraMotion: velocity, wrapping, jumps --------------------------------

/** Steady frames of 16 ms from (x, y) at t0, dx/dy tiles per frame; returns the last sample. */
function glide(m, { x = 100, y = 64, dx = 0, dy = 0, tilePx = 16, frames = 30, t0 = 0, cols = 80, rows = 40 } = {}) {
  for (let i = 0; i <= frames; i++) m.sample(x + dx * i, y + dy * i, tilePx, t0 + 16 * i, cols, rows);
  return { x: x + dx * frames, y: y + dy * frames, t: t0 + 16 * frames };
}

test('CameraMotion: a steady move gives its velocity in CSS px/s, the same at any zoom', () => {
  const right = new SE.CameraMotion();
  glide(right, { dx: 0.6 }); // 0.6 tiles × 16 px per 16 ms = 600 px/s
  assert.ok(Math.abs(right.vx - 600) < 12, `vx ${right.vx}`);
  assert.equal(right.vy, 0);
  const diag = new SE.CameraMotion();
  glide(diag, { dx: -0.4, dy: -0.4 });
  assert.ok(diag.vx < -390 && diag.vy < -390 && Math.abs(diag.vx - diag.vy) < 1e-9, `${diag.vx}, ${diag.vy}`);
  const near = new SE.CameraMotion();
  glide(near, { dx: 0.3, tilePx: 32 });
  assert.ok(Math.abs(near.vx - right.vx) < 1e-6, `${near.vx} vs ${right.vx}`);
});

test('CameraMotion: crossing the wrap seam is a small move, not a jump', () => {
  const seam = new SE.CameraMotion();
  const plain = new SE.CameraMotion();
  seam.sample(255.5, 64, 16, 0, 80, 40);
  seam.sample(0.5, 64, 16, 16, 80, 40);
  plain.sample(254.5, 64, 16, 0, 80, 40);
  plain.sample(255.5, 64, 16, 16, 80, 40);
  assert.ok(seam.vx > 0);
  assert.equal(seam.vx, plain.vx);
  assert.equal(seam.vy, 0);
  const back = new SE.CameraMotion();
  back.sample(0.5, 64, 16, 0, 80, 40);
  back.sample(255.5, 64, 16, 16, 80, 40);
  assert.equal(back.vx, -plain.vx);
});

test('CameraMotion: a jump or a pause clears the velocity, a zoom makes none and lets it fade', () => {
  const m = new SE.CameraMotion();
  let at = glide(m, { dx: 0.6 });
  assert.ok(m.vx > 500);
  // 41 tiles in 100 ms: more than half the 80-tile view, though below the speed cap (6560 px/s).
  m.sample(at.x + 41, at.y, 16, at.t + 100, 80, 40);
  assert.deepEqual([m.vx, m.vy], [0, 0]);

  at = glide(m, { x: at.x + 41, dx: 0.6, t0: at.t + 116 });
  assert.ok(m.vx > 500);
  m.sample(at.x + 0.6, at.y, 16, at.t + 250, 80, 40); // the first frame after a 250 ms rest
  assert.deepEqual([m.vx, m.vy], [0, 0]);

  at = glide(m, { x: at.x + 0.6, dx: 0.6, t0: at.t + 266 });
  const v = m.vx;
  assert.ok(v > 500);
  m.sample(at.x + 10, at.y - 5, 32, at.t + 16, 40, 20); // zoom in around the pointer: the scroll jumps
  assert.ok(Math.abs(m.vx - v * Math.exp(-16 / 90)) < 1e-9, "fades as on a frame without motion, not made by the scroll jump");
  assert.equal(m.vy, 0);
  glide(m, { x: at.x + 10.3, y: at.y - 5, dx: 0.3, tilePx: 32, t0: at.t + 32, cols: 40, rows: 20, frames: 10 });
  assert.ok(Math.abs(m.vx - 600) < 30, `vx ${m.vx} after the zoom`);

  const rest = new SE.CameraMotion();
  rest.sample(50, 64, 16, 0, 80, 40);
  rest.sample(50, 64, 16, 16, 80, 40);
  rest.sample(60, 60, 32, 32, 40, 20);
  assert.deepEqual([rest.vx, rest.vy], [0, 0]);
});

test('CameraMotion: the lookahead is at most one chunk either way', () => {
  const m = new SE.CameraMotion();
  m.vx = 600;
  assert.deepEqual(m.ahead(16), [9.375, 0]); // 600 px/s × 250 ms / 16 px
  m.vx = 50000;
  m.vy = -50000;
  assert.deepEqual(m.ahead(16), [16, -16]);
});

// --- aheadChunks: direction, diagonals, wrap, poles --------------------------

test('aheadChunks: the chunks the moving view reaches next, soonest first, wrapping and stopping at the poles', () => {
  const A = SE.aheadChunks;
  const all = [];
  const run = (...args) => { const r = A(...args); all.push(r); return r; };
  assert.deepEqual(run(32, 32, 46, 14, 0, 0), []);
  // View tiles [32, 78) × [32, 46): chunk columns 2–4, row 2.
  assert.deepEqual(run(32, 32, 46, 14, 16, 0), [37]);
  assert.deepEqual(run(32, 32, 46, 20, 16, 0), [37, 53], 'every row of the view');
  assert.deepEqual(run(32, 32, 46, 14, 1, 0), [], 'the next column is 2 tiles away, the lookahead 1');
  // Down-right: column 5 after 2 of 16 tiles, row 3 (and the corner) after 2 of 8.
  assert.deepEqual(run(32, 32, 46, 14, 16, 8), [37, 50, 51, 52, 53]);
  // The wrap seam: column 15 is followed by 0 and 1, column 0 preceded by 15 (row 4).
  assert.deepEqual(run(250, 64, 6, 10, 16, 0), [64]);
  assert.deepEqual(run(250, 64, 20, 10, 16, 0), [65]);
  assert.deepEqual(run(2, 64, 10, 10, -16, 0), [79]);
  // Nothing past the poles; along them only sideways.
  assert.deepEqual(run(32, 0, 48, 20, 0, -8), []);
  assert.deepEqual(run(32, -8, 48, 20, 0, -8), []);
  assert.deepEqual(run(32, 118, 48, 10, 0, 8), []);
  assert.deepEqual(run(32, 0, 48, 20, 16, -8), [5, 21]);
  // A view as wide as the planet: nothing sideways, the whole row below once.
  assert.deepEqual(run(0, 32, 256, 16, 16, 0), []);
  assert.deepEqual(run(8, 32, 256, 16, 16, 16), Array.from({ length: 16 }, (_, i) => 48 + i));
  for (const r of all) assert.equal(new Set(r).size, r.length, `duplicates in ${r}`);
});

// --- LandZoomCache: validity, late results, budget ---------------------------
// A zoom picture of a 4 px chunk at k = 2 is 8 × 8 px: 256 bytes.

test('LandZoomCache: a picture is found only at its own signature and magnification', () => {
  SE.landStats.reset();
  const z = new SE.LandZoomCache(1024);
  const b = bitmap(8);
  assert.ok(z.reserve(1, 2, 4));
  assert.ok(z.put(1, 2, 7, b, true));
  assert.ok(z.holds(1, 2, 7));
  assert.ok(!z.holds(1, 2, 8));
  assert.ok(!z.holds(1, 3, 7));
  assert.equal(z.get(1, 2, 8), null);
  assert.equal(z.get(1, 3, 7), null);
  assert.equal(z.get(2, 2, 7), null);
  assert.equal(z.get(1, 2, 7), b);
  assert.equal(z.get(1, 2, 7), b);
  const s = SE.landStats;
  assert.deepEqual([s.zoomMisses, s.zoomHits, s.zoomUsed, s.zoomBuilt], [3, 2, 1, 1]);
});

test('LandZoomCache: late pictures, replaced pictures and a changed chunk are closed', () => {
  SE.landStats.reset();
  const z = new SE.LandZoomCache(4096);
  const late = bitmap(8);
  z.reserve(1, 2, 4);
  assert.equal(z.put(1, 2, 7, late, false), false);
  assert.ok(late.closed);
  assert.equal(SE.landStats.zoomLate, 1);
  assert.deepEqual([z.size, z.bytes, z.flightBytes], [0, 0, 0]);

  const a = bitmap(8), b = bitmap(8), c = bitmap(12), d = bitmap(8);
  z.put(1, 2, 7, a, true, false);
  z.put(1, 2, 8, b, true, false); // the chunk's picture changed
  assert.ok(a.closed);
  assert.equal(z.get(1, 2, 8), b);
  z.put(1, 3, 8, c, true, false); // the same picture at another magnification: both kept
  z.put(2, 2, 8, d, true, false);
  assert.equal(z.size, 3);
  assert.ok(!b.closed);
  z.forgetChunk(1);
  assert.ok(b.closed && c.closed && !d.closed);
  assert.equal(z.size, 1);
  assert.equal(z.bytes, 256);
});

test('LandZoomCache: reservations, pictures and the worker share one budget', () => {
  SE.landStats.reset();
  const z = new SE.LandZoomCache(1024);
  const within = () => assert.ok(z.bytes + z.flightBytes + z.workerBytes <= z.budget);
  assert.equal(SE.LandZoomCache.bytesOf(4, 3), 576);
  assert.ok(z.reserve(0, 2, 4));
  assert.ok(z.reserve(0, 2, 4));
  assert.equal(z.flightBytes, 256, 'one reservation per chunk and k');
  assert.ok(z.reserve(1, 3, 4));
  assert.equal(z.flightBytes, 832);
  within();
  assert.ok(!z.reserve(2, 2, 4));
  assert.ok(!z.reserve(2, 2, 4));
  assert.equal(SE.landStats.zoomOverBudget, 1, 'a refusal is counted once and not retried');
  z.release(1, 3);
  z.release(1, 3);
  assert.equal(z.flightBytes, 256);
  assert.ok(!z.reserve(2, 2, 4), 'refused until the refusals are forgotten');
  z.forgetRefusals();
  assert.ok(z.reserve(2, 2, 4));
  z.workerBytes = 512;
  within();
  assert.ok(!z.reserve(3, 2, 4), 'the worker\'s canvases count');
  assert.ok(!z.reserve(9, 16, 4), 'bigger than the whole budget');
  const huge = bitmap(64);
  assert.equal(z.put(9, 16, 1, huge, true, false), false);
  assert.ok(huge.closed);
  assert.equal(SE.landStats.zoomOverBudget, 4);
  within();
});

test('LandZoomCache: when full, the least recently drawn picture goes, never one drawn this or the last frame', () => {
  SE.landStats.reset();
  const z = new SE.LandZoomCache(1024);
  const within = () => assert.ok(z.bytes + z.flightBytes + z.workerBytes <= z.budget);
  const pics = [0, 1, 2, 3].map((n) => {
    const b = bitmap(8);
    assert.ok(z.reserve(n, 2, 4));
    assert.ok(z.put(n, 2, 1, b, true));
    return b;
  });
  assert.deepEqual([z.bytes, z.flightBytes], [1024, 0]);
  for (const n of [0, 1, 2, 3]) {
    z.nextFrame();
    z.get(n, 2, 1); // picture n last drawn in frame n + 1
  }
  // Frame 4: pictures 2 and 3 were drawn in this frame and the one before.
  assert.ok(z.reserve(4, 2, 4));
  assert.ok(pics[0].closed && !pics[1].closed);
  assert.ok(z.reserve(5, 2, 4));
  assert.ok(pics[1].closed);
  assert.ok(!z.reserve(6, 2, 4));
  assert.ok(!pics[2].closed && !pics[3].closed);
  assert.equal(SE.landStats.zoomEvicted, 2);
  assert.equal(SE.landStats.zoomOverBudget, 1);
  within();
  z.nextFrame();
  z.nextFrame();
  z.forgetRefusals();
  assert.ok(z.reserve(6, 2, 4));
  assert.ok(pics[2].closed && !pics[3].closed);
  within();

  z.release(4, 2);
  assert.equal(z.flightBytes, 512);
  z.clear();
  assert.ok(pics.every((b) => b.closed));
  assert.deepEqual([z.size, z.bytes, z.flightBytes], [0, 0, 0]);
  assert.deepEqual([SE.landStats.pageZoomBytes, SE.landStats.flightBytes], [0, 0]);
});

// --- Creature pictures from the worker (src/tilecache.ts) --------------------

test('LandJobs: creature pictures go to the worker, come back to whoever asked, and a failure hands nothing over', () => {
  const { w, jobs } = jobsOn();
  assert.equal(jobs.sprite(3, 1, -1, false, 24, () => {}), false, 'not before the worker said it can');
  w.onmessage({ data: { t: 'caps', zoom: true, sprites: true } });
  const got = [];
  assert.ok(jobs.sprite(3, 1, -1, true, 24, (b) => got.push(b)));
  const job = w.sent.at(-1);
  assert.equal(job.t, 'sprite');
  assert.equal(job.prio, P.Sprite);
  assert.ok(P.Visible < P.Sprite && P.Sprite < P.Ahead, 'after visible chunks, before the chunk ahead');
  const b = bitmap(27);
  w.onmessage({ data: { t: 'sprite', id: job.id, bitmap: b, ms: 3 } });
  assert.deepEqual(got, [b]);
  const stray = bitmap(27);
  w.onmessage({ data: { t: 'sprite', id: 999, bitmap: stray, ms: 3 } });
  assert.ok(stray.closed, 'a picture nobody waits for is closed');
  jobs.sprite(4, 0, -1, false, 24, (x) => got.push(x));
  w.onmessage({ data: { t: 'fatal', message: 'boom' } });
  assert.deepEqual(got, [b, null], 'a failed worker answers null');
  assert.equal(jobs.sprite(4, 0, -1, false, 24, () => {}), false);
});

test('TileCache: a creature picture is asked of the worker a few per frame; the old size stands in; dropped bitmaps are closed', () => {
  const asked = [];
  const remote = { sprite: (c, stage, specialist, flip, px, done) => { asked.push({ c, px, done }); return true; } };
  const tiles = new SE.TileCache();
  tiles.remote = () => remote;
  tiles.setDeviceTile(24);
  for (let c = 1; c <= 5; c++) assert.equal(tiles.life(c, 0), null, 'never drawn: nothing stands in yet');
  tiles.flush();
  assert.equal(asked.length, 2, 'two a frame');
  tiles.flush();
  tiles.flush();
  assert.equal(asked.length, 4, 'at most four on their way');
  const b24 = bitmap(27);
  asked[0].done(b24);
  assert.equal(tiles.life(asked[0].c, 0), b24);
  tiles.setDeviceTile(28);
  assert.equal(tiles.life(asked[0].c, 0), b24, 'the picture of the size before stands in');
  tiles.flush();
  const again = asked.filter((a) => a.c === asked[0].c && a.px === 28);
  assert.equal(again.length, 1, 'the new size is asked for');
  const b28 = bitmap(32);
  again[0].done(b28);
  assert.equal(tiles.life(asked[0].c, 0), b28);
  assert.equal(b24.closed, false, 'the size before is kept for zooming back');
  tiles.setDeviceTile(32);
  tiles.setDeviceTile(37);
  assert.ok(b24.closed, 'two sizes later it is closed');
  assert.equal(b28.closed, false, 'the newest picture stays as the stand-in');
});

test('landZoomBudget: six screens of device pixels, at least 64 and at most 192 MiB', () => {
  const MiB = 1024 * 1024;
  assert.equal(SE.landZoomBudget(1920, 1080), 64 * MiB, 'DPR 1: the floor');
  assert.equal(SE.landZoomBudget(2880, 1530), 6 * 2880 * 1530 * 4, 'DPR 1.5: about 101 MiB');
  assert.equal(SE.landZoomBudget(3840, 2000), 6 * 3840 * 2000 * 4, 'DPR 2 (a 1920 × 1000 map): about 176 MiB');
  assert.equal(SE.landZoomBudget(3840, 2160), 6 * 3840 * 2160 * 4, 'a full 4K screen: about 190 MiB');
  assert.equal(SE.landZoomBudget(5120, 2880), 192 * MiB, '5K: the ceiling');
});
