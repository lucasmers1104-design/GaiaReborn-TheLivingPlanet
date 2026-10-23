'use strict';
/*
 * The kapok tree (src/kapok.ts): once a rainforest is large, one tree rises
 * in its heart and stays while its tile fits; the Examine tool finds it once,
 * on its tile or the one its crown fills; the optional save field keeps it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE, makeSim } = require('./helpers');

const SE = loadSE();
const ctx = (s) => ({ world: s.world, params: s.params, geo: s.geo, history: s.history });

test('a large rainforest raises one kapok tree in its heart, found once with the Examine tool, kept by the save', () => {
  const s = makeSim(3);
  const w = s.world;
  /** A square of dry rainforest, `r` tiles from its centre to its edge. */
  const forest = (cx, cy, r) => {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        const i = SE.idx(x, y);
        w.elevation[i] = Math.max(w.elevation[i], 0.2);
        w.landscape[i] = SE.Landscape.Rainforest;
        w.riverLevel[i] = 0;
        w.tech[i] = SE.Tech.None;
      }
    }
  };
  SE.placeKapok(w);
  assert.equal(w.kapokTree, -1, 'no rainforest, no tree');
  forest(40, 60, 1);
  SE.placeKapok(w);
  assert.equal(w.kapokTree, -1, 'not in a small patch');

  forest(100, 60, 4);
  const rng = w.rng.getState();
  SE.placeKapok(w);
  assert.equal(w.kapokTree, SE.idx(100, 60), 'in the heart of the rainforest');
  assert.equal(w.rng.getState(), rng, 'placing draws no random numbers');

  forest(160, 60, 5);
  SE.placeKapok(w);
  assert.equal(w.kapokTree, SE.idx(100, 60), 'stays while its tile fits');
  w.riverLevel[SE.idx(100, 60)] = 1;
  SE.placeKapok(w);
  assert.equal(w.kapokTree, SE.idx(160, 60), 'rises again in the deepest rainforest once its tile no longer fits');

  const tree = w.kapokTree;
  assert.equal(SE.kapokMilestone(w, SE.idx(100, 60)), null, 'only on its tile');
  assert.ok(SE.onKapok(w, tree - 2 * SE.GRID_W + 1), 'its crown spreads over the tiles above and beside');
  assert.ok(!SE.onKapok(w, tree + 1), 'not beside its foot');
  assert.ok(!SE.onKapok(w, tree - 3 * SE.GRID_W), 'not above its crown');
  const entry = SE.kapokMilestone(w, tree - SE.GRID_W - 1);
  assert.ok(entry, 'the tiles its crown fills find it too');
  assert.equal(entry.at, tree);
  w.evo.chronicle.push(entry);
  assert.equal(SE.kapokMilestone(w, tree), null, 'found once');

  const doc = SE.SaveSystem.serialize(ctx(s));
  const c = makeSim(1);
  SE.SaveSystem.load(JSON.parse(JSON.stringify(doc)), ctx(c), c.life, c.flora);
  assert.equal(c.world.kapokTree, tree);
  delete doc.kapok;
  const d = makeSim(1);
  SE.SaveSystem.load(JSON.parse(JSON.stringify(doc)), ctx(d), d.life, d.flora);
  assert.equal(d.world.kapokTree, -1, 'an older save raises it anew');
});
