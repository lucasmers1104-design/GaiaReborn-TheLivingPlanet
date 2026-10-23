'use strict';
/*
 * The gas balance of the last tick (src/gasbudget.ts, src/gasbalance.ts):
 * its parts add up to the actual change, sources and sinks stay visible when
 * they cancel, the sea's exchange counts once in either direction, clamps
 * are the model's limit, disasters in a tick are processes and the player's
 * actions between ticks interventions; booking changes nothing in the
 * simulation; pause keeps the balance, loading and a new planet drop it, the
 * worker's state carries it; and the rules of the number that opens it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE, makeSim, hash } = require('./helpers');

const SE = loadSE();
const GASES = ['o2', 'co2', 'ch4'];

/** Booked parts minus the actual change, relative to the level. */
function residual(b) {
  const sum = Object.values(b.parts).reduce((s, v) => s + v, 0);
  return Math.abs(sum - (b.end - b.start)) / Math.max(1, Math.abs(b.start));
}

/** Greedy play like tools/headless.js --life, calling `each` after every tick. */
function play(s, ticks, each) {
  for (let t = 0; t < ticks; t++) {
    s.tick();
    if (each) each(t);
    if (t % 5 !== 0) continue;
    s.evo.refresh(s.world, s.params, true);
    const ids = s.evo.availableIds();
    if (ids.length) s.evo.develop(s.world, s.params, ids.sort((a, b) => SE.evoNode(a).cost - SE.evoNode(b).cost)[0]);
  }
}

function fingerprint(w) {
  return [hash(w.elevation), hash(w.temperature), hash(w.lifeDensity), hash(w.vegetation), w.o2, w.co2, w.ch4, w.oceanO2, w.rng.getState()].join('|');
}

test('every tick\'s parts add up to its change, from one tick\'s end to the next tick\'s start', () => {
  const s = makeSim(2024);
  const w = s.world;
  assert.equal(w.gas.last, null, 'no balance before the first tick');
  let prev = null;
  play(s, 160, () => {
    const last = w.gas.last;
    assert.equal(last.tick, w.ticks);
    for (const g of GASES) {
      const b = last[g];
      assert.ok(residual(b) < 1e-9, `${g} at tick ${w.ticks}: parts ${JSON.stringify(b.parts)} vs ${b.end - b.start}`);
      assert.equal(b.end, w[g]);
      if (prev) assert.equal(b.start, prev[g].end, `${g} starts where the last tick ended`);
    }
    // Marine oxygen goes into the sea: only the exchange with it is the air's.
    for (const k of Object.keys(last.o2.parts)) assert.ok(['plants', 'sea', 'breath', 'fossil', 'fire', 'oxidation', 'reducing', 'limit'].includes(k), k);
    prev = last;
  });
  assert.ok(Object.keys(prev.co2.parts).includes('volcanism') && Object.keys(prev.co2.parts).includes('weathering'));
});

test("a share's groups add up to it, and the sea behind O₂'s exchange shows what flowed into it", () => {
  const s = makeSim(2024);
  const w = s.world;
  let checked = 0;
  play(s, 260, () => {
    const b = w.gas.last;
    for (const gas of ['o2', 'co2']) {
      for (const [id, groups] of Object.entries(b[gas].groups)) {
        const part = b[gas].parts[id];
        const sum = Object.values(groups).reduce((a, v) => a + v, 0);
        assert.ok(Math.abs(sum - part) <= 1e-9 * Math.abs(part) + 1e-15, `${gas} ${id}: groups ${sum} vs ${part} at ${w.ticks}`);
        checked++;
      }
    }
    assert.ok(b.sea && Number.isFinite(b.sea.sea) && Number.isFinite(b.sea.saturated));
    for (const k of Object.keys(b.sea.flows)) assert.ok(k === 'plankton' || k === 'algae' || k === 'iron' || k.startsWith('life:'), k);
  });
  assert.ok(checked > 0);
  const photo = SE.groupView(w.gas, 'co2', 'photosynthesis');
  assert.ok(photo.lines.some((l) => l.label === 'Cyanobakterien (Plankton)'), JSON.stringify(photo.lines));
  assert.ok(Math.abs(photo.lines.reduce((a, l) => a + l.share, 0) - 1) < 1e-9, 'the shares of a sink add up to all of it');
  assert.equal(SE.groupLabel('life:7'), 'Wale');
  assert.equal(SE.groupLabel(`flora:${SE.Flora.Grasses}`), 'Gräser');
  const sea = SE.groupView(w.gas, 'o2', 'sea');
  if (sea) assert.ok(sea.sea && sea.lines.every((l) => !l.key.startsWith('flora:')));
  assert.equal(SE.groupView(w.gas, 'ch4', 'decay'), null, 'methane has no groups');
});

test('sources and sinks that cancel stay listed, and an exact zero reads 0', () => {
  const w = new SE.WorldState();
  w.gas.begin(w);
  w.gas.add('co2', 'volcanism', 3);
  w.gas.add('co2', 'weathering', -3);
  w.gas.close(w);
  const v = SE.balanceView(w.gas, 'co2');
  assert.equal(v.net, 0);
  assert.deepEqual(v.sources.map((l) => [l.label, l.value]), [['Hintergrundvulkanismus', 3]]);
  assert.deepEqual(v.sinks.map((l) => [l.label, l.value]), [['Verwitterung', -3]]);
  assert.equal(v.sumSources + v.sumSinks, 0);
  assert.equal(SE.fmtChange(0), '0');
  assert.equal(SE.fmtChange(0.8), '+0,8');
  assert.equal(SE.fmtChange(-0.00042), '−0,00042');
  assert.equal(SE.fmtChange(12.34), '+12,3');
  assert.equal(SE.fmtChange(3e-7), '+<0,0001', 'a tiny change never reads as zero');
  assert.equal(SE.fmtLevel(466.9213, 0.0034, 1), '466,9213');
  assert.equal(SE.fmtLevel(466.9213, 25, 1), '466,9');
});

test('the sea\'s exchange with the air counts once, as a source or a sink', () => {
  const params = new SE.ModelParams();
  const run = (oceanO2, o2) => {
    const w = new SE.WorldState();
    const atmo = new SE.AtmosphereSystem();
    w.oceanIron = 0;
    w.oceanO2 = oceanO2;
    w.o2 = o2;
    // Marine production enters the sea; it must not show up in the air's balance.
    atmo.oceanO2Delta = 0.05;
    w.gas.begin(w);
    atmo.step(w, params);
    w.gas.close(w);
    const b = w.gas.last.o2;
    assert.ok(residual(b) < 1e-9);
    assert.deepEqual(Object.keys(b.parts).filter((k) => !['oxidation', 'reducing', 'limit'].includes(k)), ['sea']);
    return SE.balanceView(w.gas, 'o2');
  };
  const giving = run(150, 1);
  assert.ok(giving.sources.some((l) => l.label === 'Abgabe aus dem Meer'));
  const taking = run(0, 21);
  assert.ok(taking.sinks.some((l) => l.label === 'Aufnahme durch das Meer'));
});

test('a clamp is the model\'s limit, booked so the sum still holds', () => {
  const params = new SE.ModelParams();
  const w = new SE.WorldState();
  const atmo = new SE.AtmosphereSystem();
  w.o2 = 39.99;
  w.oceanIron = 0;
  w.oceanO2 = (39.99 / SE.O2_PRESENT) * 100;
  w.gas.begin(w);
  // As life books its plants' oxygen where it computes it.
  atmo.o2Delta = 1;
  w.gas.add('o2', 'plants', 1);
  atmo.step(w, params);
  w.gas.close(w);
  assert.equal(w.o2, 40);
  const o2 = w.gas.last.o2;
  assert.ok(o2.parts.limit < 0 && residual(o2) < 1e-9, JSON.stringify(o2.parts));
  assert.ok(SE.balanceView(w.gas, 'o2').sinks.some((l) => l.label === 'Modellbegrenzung'));

  w.co2 = 4999;
  w.gas.begin(w);
  SE.shiftGas(w, 'co2', 'volcano', 25, 0, 5000);
  w.gas.close(w);
  assert.equal(w.co2, 5000);
  assert.deepEqual(w.gas.last.co2.parts, { volcano: 25, limit: -24 });
});

test('disasters within a tick are processes; the player\'s actions between ticks are interventions', () => {
  const s = makeSim(2024);
  const w = s.world;
  for (let t = 0; t < 5; t++) s.tick();
  const last = w.gas.last;
  const near = (a, b) => Math.abs(a - b) < 1e-9;

  // Between ticks: a volcano, a meteor and an oxygen generator set off by hand.
  s.events.trigger(w, SE.EventKind.Volcano, 10, 60);
  assert.ok(near(w.gas.since.co2, w.co2 - last.co2.end) && w.gas.since.co2 > 0, 'the volcano is an intervention');
  w.omega = 1e6;
  const r = s.core.apply({ type: 'terraformer', tf: SE.Terraformer.OxygenGenerator, x: 10, y: 60 });
  assert.ok(r.ok, r.reason);
  assert.ok(near(w.gas.since.o2, w.o2 - last.o2.end) && w.gas.since.o2 > 0);
  assert.equal(w.gas.last, last, 'the balance of the last tick stays as it was');
  const view = SE.balanceView(w.gas, 'o2');
  assert.ok(view.since > 0 && view.end !== w.o2, 'the window can tell the level moved since');

  s.tick();
  assert.deepEqual(w.gas.since, { o2: 0, co2: 0, ch4: 0 });
  assert.ok(near(w.gas.last.o2.start, last.o2.end + view.since), 'the next tick starts from the changed air');
  for (const g of GASES) assert.ok(!('player' in w.gas.last[g].parts));

  // Within a tick the same disaster is a process of that tick.
  w.gas.begin(w);
  s.events.trigger(w, SE.EventKind.Volcano, 10, 60);
  s.hazards.start(w, SE.EventKind.Meteor, 40, 30, 'natural');
  w.gas.close(w);
  assert.ok(w.gas.last.co2.parts.volcano > 0 && w.gas.last.co2.parts.impact > 0, JSON.stringify(w.gas.last.co2.parts));
  assert.ok(residual(w.gas.last.co2) < 1e-9);
});

test('booking changes nothing: the same seed plays to the same planet with the ledger silenced', () => {
  const a = makeSim(12345);
  play(a, 120);
  const add = SE.GasLedger.prototype.add;
  SE.GasLedger.prototype.add = function silenced() {};
  try {
    const b = makeSim(12345);
    play(b, 120);
    assert.equal(fingerprint(b.world), fingerprint(a.world));
  } finally {
    SE.GasLedger.prototype.add = add;
  }
  const c = makeSim(12345);
  play(c, 120);
  assert.deepEqual(c.world.gas.last, a.world.gas.last, 'the same seed books the same balance');
});

test('pause keeps the balance; loading and a new planet start without one', async () => {
  const s = makeSim(2024);
  for (let t = 0; t < 6; t++) s.tick();
  const last = s.world.gas.last;
  s.core.apply({ type: 'speed', speed: 0 });
  assert.equal(s.world.gas.last, last);

  const ctx = { world: s.world, params: s.params, geo: s.geo, history: s.history };
  const text = await SE.SaveSystem.encode(SE.SaveSystem.serialize(ctx));
  assert.ok(!('gas' in SE.SaveSystem.serialize(ctx)), 'the balance is not saved');
  const b = makeSim(1);
  for (let t = 0; t < 3; t++) b.tick();
  SE.SaveSystem.load(await SE.SaveSystem.decode(text), { world: b.world, params: b.params, geo: b.geo, history: b.history }, b.life, b.flora);
  assert.equal(b.world.gas.last, null);
  assert.equal(SE.balanceView(b.world.gas, 'co2'), null);

  s.core.apply({ type: 'newPlanet', seed: 7, ocean: SE.OCEAN_FRACTION, epoch: 'random' });
  assert.equal(s.world.gas.last, null);
  assert.deepEqual(s.world.gas.since, { o2: 0, co2: 0, ch4: 0 });
});

test('the worker\'s state carries the balance to the page as it is', () => {
  const s = makeSim(2024);
  for (let t = 0; t < 8; t++) s.tick();
  s.events.trigger(s.world, SE.EventKind.Volcano, 10, 60);
  const sent = structuredClone(SE.captureSimState(s.core, false));
  const page = new SE.SimCore();
  SE.applySimState(page, sent);
  assert.ok(page.world.gas instanceof SE.GasLedger, 'the mirror keeps its ledger object');
  assert.deepEqual(page.world.gas.last, s.world.gas.last);
  assert.deepEqual(page.world.gas.since, s.world.gas.since);
  assert.deepEqual(SE.balanceView(page.world.gas, 'co2'), SE.balanceView(s.world.gas, 'co2'));
});

test('the number: hover and focus open, a click holds, one at a time, Escape and presses elsewhere close', () => {
  const t = new SE.BalanceToggle();
  t.enterNumber('co2');
  assert.equal(t.open, 'co2');
  assert.equal(t.pinned, false);
  t.leave(1000);
  assert.equal(t.closeAt, 1000 + SE.BALANCE_CLOSE_DELAY, 'a short wait to reach the balance');
  t.enterBalance();
  assert.equal(t.closeAt, 0);
  t.leave(2000);
  t.tick(2000 + SE.BALANCE_CLOSE_DELAY);
  assert.equal(t.open, null);

  t.enterNumber('co2');
  t.click('co2');
  assert.ok(t.pinned);
  t.leave(3000);
  t.tick(9999);
  assert.equal(t.open, 'co2', 'held');
  t.enterNumber('ch4');
  assert.equal(t.open, 'co2', 'the pointer over another number leaves a held balance');
  t.click('co2');
  assert.equal(t.open, null, 'a second click closes');

  t.click('ch4');
  t.pressOutside();
  assert.equal(t.open, null);

  t.focusNumber('o2');
  assert.equal(t.open, 'o2');
  t.blur(true);
  t.focusBalance();
  t.leave(100);
  assert.equal(t.closeAt, 0, 'focus inside keeps it');
  t.blur(false);
  assert.equal(t.open, null);

  t.click('co2');
  t.focusNumber('ch4');
  assert.deepEqual([t.open, t.pinned], ['ch4', false], 'focus on another number switches to it');
  t.focusBalance();
  assert.equal(t.escape(true), 'ch4');
  assert.equal(t.open, null);
  t.focusNumber('ch4');
  assert.equal(t.open, null, 'focus coming back after Escape does not reopen it');
  t.blur(false);
  t.focusNumber('ch4');
  assert.equal(t.open, 'ch4');
  assert.equal(t.escape(false), null);
});
