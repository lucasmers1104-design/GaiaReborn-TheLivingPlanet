'use strict';
/*
 * The termite mound (src/termites.ts): once ants live on a savanna, one mound
 * rises where they are densest and stays while its tile fits; the Examine
 * tool finds it once; the optional save field keeps it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE, makeSim } = require('./helpers');

const SE = loadSE();
const ctx = (s) => ({ world: s.world, params: s.params, geo: s.geo, history: s.history });

test('ants on a savanna raise one termite mound, found once with the Examine tool, kept by the save', () => {
  const s = makeSim(3);
  const w = s.world;
  const land = [];
  for (let i = 0; i < SE.TILE_COUNT && land.length < 2; i++) if (!w.isWater(i) && w.tech[i] === SE.Tech.None) land.push(i);
  const [a, b] = land;
  const ants = (i, d) => {
    w.landscape[i] = SE.Landscape.Savanna;
    w.lifeDensity[i * SE.LIFE_COUNT + SE.Life.Insect] = d;
    w.lifeStage[i * SE.LIFE_COUNT + SE.Life.Insect] = SE.TERMITE_STAGE;
  };
  ants(a, 0.4);
  ants(b, 0.8);
  SE.placeTermiteMound(w);
  assert.equal(w.termiteMound, -1, 'not before ants count on the planet');
  w.lifeStageCounts[SE.Life.Insect * SE.SUBSPECIES_PER_CLASS + SE.TERMITE_STAGE] = 2;
  const rng = w.rng.getState();
  SE.placeTermiteMound(w);
  assert.equal(w.termiteMound, b, 'where ants are densest');
  assert.equal(w.rng.getState(), rng, 'placing draws no random numbers');
  w.lifeDensity[a * SE.LIFE_COUNT + SE.Life.Insect] = 1;
  SE.placeTermiteMound(w);
  assert.equal(w.termiteMound, b, 'stays while its tile is savanna');
  w.landscape[b] = SE.Landscape.Steppe;
  SE.placeTermiteMound(w);
  assert.equal(w.termiteMound, a, 'moves once its savanna is gone');

  assert.equal(SE.termiteMilestone(w, b), null, 'only on its tile');
  const entry = SE.termiteMilestone(w, a);
  assert.equal(entry.at, a);
  w.evo.chronicle.push(entry);
  assert.equal(SE.termiteMilestone(w, a), null, 'found once');

  const doc = SE.SaveSystem.serialize(ctx(s));
  const c = makeSim(1);
  SE.SaveSystem.load(JSON.parse(JSON.stringify(doc)), ctx(c), c.life, c.flora);
  assert.equal(c.world.termiteMound, a);
  delete doc.termites;
  const d = makeSim(1);
  SE.SaveSystem.load(JSON.parse(JSON.stringify(doc)), ctx(d), d.life, d.flora);
  assert.equal(d.world.termiteMound, -1, 'an older save raises it anew');
});
