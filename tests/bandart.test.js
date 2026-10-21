'use strict';
/*
 * Wandering groups on the map: the flame frames the map flickers over a fire
 * place, the band and thinking-settler figures, the flame's frame choice and
 * the band's hover text.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE } = require('./helpers');
const { build } = require('../tools/civ/build');
const { assemble } = require('../tools/civ/atlas');
const { artProblems } = require('../tools/artcheck');

const SE = loadSE();
const THINKERS = Object.keys(SE.LIFE).map(Number).filter((c) => SE.LIFE[c].sentient && SE.LIFE[c].realm === 'land');

test('the flame has 4 frames of role flame and no era, within the style rules', () => {
  const art = build('stone');
  const flame = assemble(art).manifest.blocks.flame;
  assert.ok(flame, 'tools/civ/fire.js draws the flame');
  assert.equal(flame.role, 'flame');
  assert.equal(flame.era, null);
  assert.equal(flame.variants.length, 4);
  assert.deepEqual(art.problems.filter((p) => p.startsWith('flame')), []);
  assert.equal(new Set(flame.variants.map((v) => v.rect.w)).size, 1, 'every frame has the same foot');
});

test('band and thinking-settler figures keep the art format for every thinking land class', () => {
  assert.ok(THINKERS.includes(SE.Life.Mammal) && THINKERS.length >= 4);
  assert.deepEqual(artProblems(SE, SE.humanBandArt(), 'humans'), []);
  for (const c of THINKERS) {
    for (let s = 0; s < SE.SUBSPECIES_PER_CLASS; s++) {
      const band = SE.bandArt(c, s);
      assert.deepEqual(artProblems(SE, band, `band ${c}/${s}`), []);
      if (c === SE.Life.Mammal) continue;
      assert.ok(band.some((p) => p.f === 'orange'), `band ${c}/${s} carries a torch`);
      const settler = SE.settlerArt('bundle', 'violet', SE.Tech.Stone, SE.SPECIES[c].stages[s].art);
      assert.deepEqual(artProblems(SE, settler, `settler ${c}/${s}`), []);
      assert.ok(settler.some((p) => p.f === 'violet'), 'the pennant carries the tribe colour');
    }
  }
  assert.notDeepEqual(SE.bandArt(SE.Life.Mammal, 7), SE.stoneSettlerArt('red'), 'a band is not the settler figure');
});

test('a flame stands still on frame 0 with reduced effects and flickers otherwise', () => {
  const seen = new Set();
  for (let t = 0; t < 5000; t += 37) {
    assert.equal(SE.cityPuffFrame('flame', 100, 200, t, true, 4), 0);
    assert.equal(SE.cityPuffFrame('smoke', 100, 200, t, true, 6), 0);
    const f = SE.cityPuffFrame('flame', 100, 200, t, false, 4);
    assert.ok(f >= 0 && f < 4);
    seen.add(f);
  }
  assert.equal(seen.size, 4, 'every frame shows');
});

test('the hover text names a band and whether it camps', () => {
  const w = new SE.WorldState();
  w.reset(4, SE.OCEAN_FRACTION);
  const i = SE.idx(20, 30);
  assert.equal(SE.bandLabel(w, i), null, 'no thinking species, no band');
  w.sentientClass = SE.Life.Mammal;
  w.civ.bands.push({ id: 1, path: [i], step: 0, campAt: w.ticks, breakAt: w.ticks + 10, shelters: 3, pop: 1, since: 0, camps: [] });
  assert.equal(SE.bandLabel(w, i), `Wandergruppe der ${SE.subspeciesName(SE.Life.Mammal, 7)} · Lager`);
  Object.assign(w.civ.bands[0], { campAt: -1, path: [i - 1, i], step: 1 });
  w.sentientClass = SE.Life.Dinosaur;
  assert.equal(SE.bandLabel(w, i), 'Wandergruppe der Dinosaurier · unterwegs');
  assert.equal(SE.bandLabel(w, i - 1), null, 'only the tile it stands on');
});
