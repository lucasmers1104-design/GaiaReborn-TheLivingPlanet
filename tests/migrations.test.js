'use strict';
/*
 * Salmon runs and stork flights (src/migrations.ts): which sub-species unlock
 * them, and the chronicle entry for the first one watched with the Examine
 * tool. Where they show on the map is salmonlayer.ts / storklayer.ts.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE } = require('./helpers');

const SE = loadSE();
const N = SE.SUBSPECIES_PER_CLASS;

test('salmon need true bony fish, storks ducks or later birds', () => {
  const w = new SE.WorldState();
  assert.equal(SE.salmonCanRun(w), false);
  assert.equal(SE.storksCanFly(w), false);
  w.lifeStageCounts[SE.Life.Fish * N + 4] = 10; // sharks
  w.lifeStageCounts[SE.Life.Avian * N + 2] = 10; // toothed birds
  assert.equal(SE.salmonCanRun(w), false);
  assert.equal(SE.storksCanFly(w), false);
  w.lifeStageCounts[SE.Life.Fish * N + 7] = 1;
  w.lifeStageCounts[SE.Life.Avian * N + 3] = 1;
  assert.equal(SE.salmonCanRun(w), true);
  assert.equal(SE.storksCanFly(w), true);
});

test('the first salmon run and stork flight watched go into the chronicle once each', () => {
  const w = new SE.WorldState();
  const evolution = new SE.EvolutionSystem(new SE.LifeSystem(), new SE.FloraSystem());
  const salmon = SE.migrationMilestone(w, 'salmon', 42);
  assert.equal(salmon.key, 'migration:salmon');
  assert.equal(salmon.title, 'Lachswanderung beobachtet');
  assert.equal(salmon.kind, 'milestone');
  assert.equal(salmon.major, false);
  assert.equal(salmon.at, 42);
  assert.equal(salmon.icon, SE.evoIcon('fish'));
  evolution.record(w, salmon);
  assert.equal(SE.migrationMilestone(w, 'salmon', 7), null, 'once');
  const storks = SE.migrationMilestone(w, 'storks', 9);
  assert.equal(storks.key, 'migration:storks');
  assert.equal(storks.title, 'Vogelzug beobachtet');
  assert.equal(storks.icon, SE.evoIcon('birds'));
  evolution.record(w, storks);
  assert.deepEqual(evolution.pending.map((e) => e.key), ['migration:salmon', 'migration:storks'], 'queued for the toast card');
  assert.deepEqual(w.evo.chronicle.map((e) => e.key), ['migration:salmon', 'migration:storks']);
});
