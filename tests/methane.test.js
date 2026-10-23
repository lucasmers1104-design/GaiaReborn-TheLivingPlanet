'use strict';
/*
 * Methane and the air's pressure (src/methane.ts): archaea build methane up
 * while sea and air hold no oxygen, oxygen destroys it, and only methane above
 * the calibration level warms; the pressure follows the gas mix; saves keep
 * the methane, and a save from before it starts at the calibration level.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE, makeSim } = require('./helpers');

const SE = loadSE();

const ctx = (s) => ({ world: s.world, params: s.params, geo: s.geo, history: s.history });

test('the pressure follows the gas mix: thin without oxygen, 1 bar with today\'s air', () => {
  const w = new SE.WorldState();
  w.o2 = 0;
  w.co2 = 400;
  assert.ok(Math.abs(SE.airPressure(w) - 0.79) < 0.01, `young air ${SE.airPressure(w)} bar`);
  w.o2 = 21;
  assert.ok(Math.abs(SE.airPressure(w) - 1) < 0.01, `today's air ${SE.airPressure(w)} bar`);
  const shares = SE.inertShares(w);
  assert.ok(Math.abs(shares.n2 + shares.ar + w.o2 + (w.co2 + w.ch4) / 1e4 - 100) < 1e-9, 'the shares add up to the whole air');
  const today = SE.ClimateSystem.greenhouseTerms(w).pressure;
  w.o2 = 0;
  assert.ok(SE.ClimateSystem.greenhouseTerms(w).pressure < today, 'thinner air holds less heat');
});

test('archaea build methane up without oxygen; oxygen destroys it', () => {
  const w = new SE.WorldState();
  const params = new SE.ModelParams();
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    w.lifeStage[i * SE.LIFE_COUNT + SE.Life.Prokaryote] = 1;
    w.lifeDensity[i * SE.LIFE_COUNT + SE.Life.Prokaryote] = 0.02;
  }
  w.o2 = 0;
  w.oceanO2 = 0;
  for (let t = 0; t < 150; t++) SE.stepMethane(w, params, 0);
  assert.ok(w.ch4 > 50, `anoxic air holds ${w.ch4} ppm`);
  assert.ok(SE.ClimateSystem.greenhouseTerms(w).ch4 > 1, 'that much methane warms the planet');

  w.o2 = 21;
  w.oceanO2 = 100;
  for (let t = 0; t < 60; t++) SE.stepMethane(w, params, 0);
  assert.ok(w.ch4 < 2, `oxygen leaves ${w.ch4} ppm`);
  w.ch4 = SE.CH4_BASE;
  assert.equal(SE.ClimateSystem.greenhouseTerms(w).ch4, 0, 'the calibration level adds no warmth');
});

test('saves keep the methane; a save without it starts at the calibration level', async () => {
  const a = makeSim(2024);
  for (let t = 0; t < 20; t++) a.tick();
  a.world.ch4 = 123.5;
  const doc = SE.SaveSystem.serialize(ctx(a));
  const b = makeSim(1);
  SE.SaveSystem.load(await SE.SaveSystem.decode(await SE.SaveSystem.encode(doc)), ctx(b), b.life, b.flora);
  assert.equal(b.world.ch4, 123.5);

  const old = JSON.parse(JSON.stringify(doc));
  delete old.ch4;
  SE.SaveSystem.load(old, ctx(b), b.life, b.flora);
  assert.equal(b.world.ch4, SE.CH4_BASE);

  const broken = JSON.parse(JSON.stringify(doc));
  broken.ch4 = -1;
  assert.throws(() => SE.SaveSystem.load(broken, ctx(b), b.life, b.flora), (e) => e instanceof SE.SaveCorrupt);
});
