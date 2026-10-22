'use strict';
/*
 * The simulation worker (src/simworker.ts, src/simhost.ts) against the page's
 * own core: the same ordered commands give the same planet, a state of an
 * older planet never shows, saving and loading go through the worker, and a
 * failing worker hands the planet over to the page. The worker runs the built
 * bundle in a worker_threads thread, its own realm as in the browser.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { Worker } = require('worker_threads');
const { loadSE } = require('./helpers.js');

const SE = loadSE();
const BUNDLE = process.env.SE_BUNDLE || path.join(__dirname, '..', 'simulation.js');

const THREAD = `
const { parentPort, workerData } = require('worker_threads');
require('vm').runInThisContext(require('fs').readFileSync(workerData.bundle, 'utf8'), { filename: workerData.bundle });
const port = { postMessage: (m, t) => parentPort.postMessage(m, t), onmessage: null };
parentPort.on('message', (data) => port.onmessage && port.onmessage({ data }));
globalThis.SE.simWorkerMain(port);
`;

/** A SimHost whose worker is a thread; `kill()` ends it. */
function workerHost() {
  const thread = new Worker(THREAD, { eval: true, workerData: { bundle: BUNDLE } });
  const port = { postMessage: (m, t) => thread.postMessage(m, t), onmessage: null };
  thread.on('message', (data) => port.onmessage && port.onmessage({ data }));
  const host = new SE.SimHost('worker', port);
  host.kill = () => thread.terminate();
  return host;
}

/** World, rng and tree, as one number. */
function hashOf(core) {
  const w = core.world;
  let h = 2166136261;
  const mix = (bytes) => { for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 16777619); } };
  for (const [k, v] of Object.entries(w)) {
    if (ArrayBuffer.isView(v)) mix(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
    else if (['number', 'boolean', 'string'].includes(typeof v)) mix(Buffer.from(`${k}=${v};`));
  }
  mix(Buffer.from(JSON.stringify({
    rng: w.rng.getState(), developed: [...w.evo.developed.keys()], chronicle: w.evo.chronicle.map((e) => e.key), ep: w.evo.ep,
    hazards: w.hazards.list.map((x) => [x.id, x.kind, x.x, x.y, x.age]), cities: w.civ.cities.map((c) => [c.tile, c.name]),
    history: core.history.years.length,
  })));
  return h >>> 0;
}

const SCRIPT = [
  { type: 'newPlanet', seed: 4242, ocean: SE.OCEAN_FRACTION, epoch: 'random' },
  { type: 'develop', id: 'cells' },
  { type: 'tick', n: 40 },
  { type: 'terraformer', tf: SE.Terraformer.OxygenGenerator, x: 40, y: 60 },
  { type: 'tick', n: 25 },
  { type: 'reported', key: 'test:seen' },
  { type: 'tick', n: 15 },
];

test('the worker and the page make the same planet from the same ordered commands', async () => {
  const direct = new SE.SimHost('direct');
  for (const cmd of SCRIPT) direct.run(cmd);
  const expected = hashOf(direct.view);
  assert.strictEqual(direct.view.world.ticks, 80);

  const host = workerHost();
  try {
    const results = await Promise.all(SCRIPT.map((cmd) => host.request(cmd)));
    assert.ok(results.every((r) => typeof r.ok === 'boolean'));
    assert.strictEqual(host.mode, 'worker');
    assert.strictEqual(host.view.world.ticks, 80);
    assert.strictEqual(hashOf(host.view), expected, 'the mirror holds exactly the worker\'s planet');
    assert.strictEqual(host.pending, 0);
  } finally {
    host.kill();
  }
});

test('a state of an older planet never shows after a new planet', async () => {
  const host = workerHost();
  try {
    host.run({ type: 'newPlanet', seed: 1, ocean: SE.OCEAN_FRACTION, epoch: 'random' });
    host.run({ type: 'develop', id: 'cells' });
    let oldAnswered = false;
    host.run({ type: 'tick', n: 20 }, () => { oldAnswered = true; });
    host.run({ type: 'newPlanet', seed: 2, ocean: SE.OCEAN_FRACTION, epoch: 'random' });
    await host.idle();
    assert.strictEqual(host.view.world.seed, 2);
    assert.strictEqual(host.view.world.ticks, 0);
    assert.strictEqual(host.view.world.evo.developed.size, 0, 'nothing of the first planet');
    assert.strictEqual(oldAnswered, false, 'an answer for the planet before is not delivered');
  } finally {
    host.kill();
  }
});

test('saving and loading run in the worker and give back the same planet', async () => {
  const host = workerHost();
  try {
    for (const cmd of SCRIPT) host.run(cmd);
    const saved = await host.request({ type: 'saveText' }, true);
    assert.ok(saved.ok && typeof saved.text === 'string' && saved.meta && saved.meta.ticks === 80);
    host.run({ type: 'newPlanet', seed: 7, ocean: SE.OCEAN_FRACTION, epoch: 'random' });
    const loaded = await host.request({ type: 'loadText', text: saved.text });
    assert.ok(loaded.ok, loaded.reason);

    // The same commands on the page: a load keeps a few transient values of the planet it replaces, so the history matters.
    const direct = new SE.SimHost('direct');
    for (const cmd of SCRIPT) direct.run(cmd);
    direct.run({ type: 'newPlanet', seed: 7, ocean: SE.OCEAN_FRACTION, epoch: 'random' });
    const again = await direct.request({ type: 'loadText', text: saved.text });
    assert.ok(again.ok);
    assert.strictEqual(hashOf(host.view), hashOf(direct.view), 'the worker loads the save as the page would');

    const bad = await host.request({ type: 'loadText', text: '{"broken"' });
    assert.strictEqual(bad.ok, false);
    assert.ok(bad.reason);
    assert.strictEqual(hashOf(host.view), hashOf(direct.view), 'a failed load leaves the planet as it was');
  } finally {
    host.kill();
  }
});

test('a failing worker hands the planet to the page from its last complete state', async () => {
  const host = workerHost();
  let why = '';
  host.onFailover = (w) => { why = w; };
  try {
    for (const cmd of SCRIPT) host.run(cmd);
    await host.idle();
    const before = hashOf(host.view);
    // A malformed command throws inside the worker's tick loop.
    host.run({ type: 'record', entry: null });
    const after = host.request({ type: 'tick', n: 3 });
    const r = await after;
    assert.ok(why, 'the failure was reported');
    assert.strictEqual(host.mode, 'direct');
    assert.ok(r.ok, 'the command sent after the failure ran on the page');
    assert.strictEqual(host.view.world.ticks, 83);
    assert.notStrictEqual(hashOf(host.view), before);
  } finally {
    host.kill();
  }
});

test('a disaster starts only when it was paid for, and only that is paid back', () => {
  const host = new SE.SimHost('direct');
  host.run({ type: 'newPlanet', seed: 4242, ocean: SE.OCEAN_FRACTION, epoch: 'random' });
  const core = host.view;
  const w = core.world;
  w.omega = 1000;
  let spot = null;
  for (let i = 0; i < SE.TILE_COUNT && !spot; i += 7) {
    const x = i % SE.GRID_W;
    const y = Math.floor(i / SE.GRID_W);
    if (!core.hazards.refusal(w, SE.EventKind.Volcano, x, y)) spot = { kind: SE.EventKind.Volcano, x, y };
  }
  assert.ok(spot, 'a tile where a volcano may erupt');
  const unpaid = core.apply({ type: 'startHazard', ...spot });
  assert.strictEqual(unpaid.ok, false);
  assert.strictEqual(w.hazards.list.length, 0, 'nothing starts unpaid');
  assert.strictEqual(w.omega, 1000, 'and nothing is paid back');
  assert.ok(core.apply({ type: 'payHazard', ...spot }).ok);
  assert.strictEqual(w.omega, 1000 - SE.EVENT_COST);
  const started = core.apply({ type: 'startHazard', ...spot });
  assert.ok(started.ok && started.started && started.started.id === started.hazard);
  assert.strictEqual(w.hazards.list.length, 1);
  assert.strictEqual(core.apply({ type: 'startHazard', ...spot }).ok, false, 'one payment, one disaster');
});
