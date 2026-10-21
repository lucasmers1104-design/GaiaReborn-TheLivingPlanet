'use strict';
/*
 * The wandering creatures on the map (src/herds.ts): which classes get
 * markers, where they may stand and how they move. Runs the graphics-only
 * HerdLayer against a greedily played planet, without any DOM.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE, makeSim } = require('./helpers');

const SE = loadSE();
const MARINE_ANIMALS = [SE.Life.Radiate, SE.Life.Bilateria, SE.Life.Arthropod, SE.Life.Mollusc, SE.Life.Fish, SE.Life.Cetacean];

function seeded(seed) {
  const rng = new SE.Rng(seed);
  return () => rng.next();
}

let played = null;
/** One planet played greedily for 2500 ticks, with a herd layer following it. */
function planet() {
  if (played) return played;
  const s = makeSim(4242);
  s.evo.develop(s.world, s.params, 'cells');
  s.play(2500);
  const herds = new SE.HerdLayer(false);
  const rand = seeded(99);
  let now = 0;
  herds.update(s.world, now, rand);
  played = { s, herds, rand, advance: () => { s.tick(); now += 1000; herds.update(s.world, now, rand); } };
  return played;
}

/** Tiles where class c lives densely enough to show, in its own realm and outside cities. */
function livingTiles(world, c) {
  let n = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    if (world.isWater(i) !== SE.isSeaLife(c) || world.tech[i] !== 0) continue;
    if (world.lifeDensity[i * SE.LIFE_COUNT + c] >= SE.HERD_MIN_DENSITY) n++;
  }
  return n;
}

function markersPerClass(herds) {
  const out = new Array(SE.LIFE_COUNT).fill(0);
  for (const m of herds.markers) out[m.c]++;
  return out;
}

test('every living class shows on the map, rare ones and predators included', () => {
  const { s, herds } = planet();
  const per = markersPerClass(herds);
  const rows = [];
  for (let c = 1; c < SE.LIFE_COUNT; c++) {
    const tiles = livingTiles(s.world, c);
    rows.push(`${SE.LIFE[c].id}: ${tiles} tiles, ${per[c]} markers`);
    if (tiles >= 20) assert.ok(per[c] >= 1, `${SE.LIFE[c].id} lives on ${tiles} tiles but has no marker`);
  }
  console.log(`${herds.markers.length} markers after ${s.world.ticks} ticks\n${rows.join('\n')}`);
});

test('marine animals get markers when they are alive', () => {
  const { s, herds } = planet();
  const per = markersPerClass(herds);
  const alive = MARINE_ANIMALS.filter((c) => livingTiles(s.world, c) >= 3);
  assert.ok(alive.length >= 3, `only ${alive.length} marine animal classes alive — the test planet is too young`);
  for (const c of alive) assert.ok(per[c] >= 1, `${SE.LIFE[c].id} is alive in the sea but has no marker`);
});

test('markers stand only where their class lives, some of them in small groups', () => {
  const { s, herds } = planet();
  const w = s.world;
  const taken = new Set();
  for (const m of herds.markers) {
    assert.ok(w.lifeDensity[m.tile * SE.LIFE_COUNT + m.c] > 0, `${SE.LIFE[m.c].id} marker on a tile without it`);
    assert.equal(w.isWater(m.tile), SE.isSeaLife(m.c), `${SE.LIFE[m.c].id} marker in the wrong realm`);
    assert.equal(m.stage, w.lifeStage[m.tile * SE.LIFE_COUNT + m.c]);
    assert.ok(!taken.has(m.tile), 'two markers on one tile');
    taken.add(m.tile);
  }
  let grouped = 0;
  for (const m of herds.markers) {
    const x = m.tile % SE.GRID_W;
    const y = Math.floor(m.tile / SE.GRID_W);
    let beside = false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && y + dy >= 0 && y + dy < SE.GRID_H && taken.has(SE.idx(SE.wrapX(x + dx), y + dy))) beside = true;
      }
    }
    if (beside) grouped++;
  }
  const share = grouped / herds.markers.length;
  console.log(`${grouped} of ${herds.markers.length} markers stand beside another`);
  assert.ok(share > 0.1 && share < 0.8, `${Math.round(share * 100)} % of the markers stand in groups`);
});

test('where classes live together none takes over the picture, and the first cells show on half their tiles', () => {
  const { s, herds } = planet();
  const w = s.world;
  const L = SE.LIFE_COUNT;
  const shown = new Array(L).fill(0);
  let mixed = 0;
  let cellsBesideAnimals = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    let n = 0;
    let animal = false;
    for (let c = 1; c < L; c++) {
      if (SE.isSeaLife(c) !== w.isWater(i) || w.lifeDensity[i * L + c] < SE.HERD_MIN_DENSITY) continue;
      n++;
      if (c > SE.Life.Eukaryote) animal = true;
    }
    const c = herds.slot[i];
    if (n < 3 || c === SE.Life.None) continue;
    shown[c]++;
    mixed++;
    if (animal && c <= SE.Life.Eukaryote) cellsBesideAnimals++;
  }
  const top = Math.max(...shown);
  console.log(`${mixed} mixed tiles show a creature; the commonest class ${SE.LIFE[shown.indexOf(top)].id} on ${top}`);
  assert.ok(top / mixed <= 0.5, `${SE.LIFE[shown.indexOf(top)].id} shows on ${Math.round((100 * top) / mixed)} % of the mixed tiles`);
  assert.ok(cellsBesideAnimals > 0, 'the first cells vanish wherever animals live');

  const young = makeSim(7);
  young.evo.develop(young.world, young.params, 'cells');
  young.play(150);
  const h = new SE.HerdLayer(true);
  h.update(young.world, 0, seeded(5));
  let cells = 0;
  let shows = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    if (young.world.lifeDensity[i * L + SE.Life.Prokaryote] < SE.HERD_MIN_DENSITY) continue;
    cells++;
    if (h.slot[i] !== SE.Life.None) shows++;
  }
  // Half the tiles, less the empty patches (a fifth of the map).
  assert.ok(shows / cells > 0.3 && shows / cells < 0.5, `${Math.round((100 * shows) / cells)} % of the cells' tiles show them`);
});

test('markers keep a tile away from cities, and leave when a city is founded beside them', () => {
  const { s, herds, rand } = planet();
  const w = s.world;
  assert.ok(herds.markers.length > 0, 'the test planet has creatures');
  const m = herds.markers.find((k) => !k.pinned && !w.isWater(k.tile)) ?? herds.markers.find((k) => !k.pinned);
  const x = m.tile % SE.GRID_W;
  const y = Math.floor(m.tile / SE.GRID_W);
  const beside = SE.idx(SE.wrapX(x + 1), y);
  const before = { tech: w.tech[beside], pop: w.cityPop[beside] };
  w.tech[beside] = SE.Tech.Stone;
  w.cityPop[beside] = 0.3;
  w.refreshDerived();
  try {
    herds.update(w, 1e9, rand);
    assert.ok(!herds.markers.includes(m), 'the marker beside the new city is gone');
    for (const k of herds.markers) assert.ok(k.pinned || !SE.nearCity(w, k.tile), 'no marker on or next to a city');
  } finally {
    w.tech[beside] = before.tech;
    w.cityPop[beside] = before.pop;
    w.refreshDerived();
    herds.update(w, 2e9, rand);
  }
});

test('markers wander one tile at a time over their own class’s tiles and face where they go', () => {
  const { s, herds, advance } = planet();
  const w = s.world;
  let moves = 0;
  let west = 0;
  for (let t = 0; t < 12; t++) {
    const before = new Map(herds.markers.map((m) => [m, m.tile]));
    advance();
    for (const m of herds.markers) {
      const from = before.get(m);
      if (from === undefined || from === m.tile) continue;
      moves++;
      let dx = (m.tile % SE.GRID_W) - (from % SE.GRID_W);
      if (dx > SE.GRID_W / 2) dx -= SE.GRID_W;
      if (dx < -SE.GRID_W / 2) dx += SE.GRID_W;
      const dy = Math.floor(m.tile / SE.GRID_W) - Math.floor(from / SE.GRID_W);
      assert.ok(Math.abs(dx) <= 1 && Math.abs(dy) <= 1, `a marker jumped ${dx},${dy}`);
      assert.equal(m.dx, dx);
      assert.equal(m.dy, dy);
      assert.ok(w.lifeDensity[m.tile * SE.LIFE_COUNT + m.c] >= SE.HERD_MIN_DENSITY, 'stepped off its class’s tiles');
      assert.equal(w.isWater(m.tile), SE.isSeaLife(m.c), 'stepped into the wrong realm');
      if (dx !== 0) assert.equal(m.flip, dx < 0, 'faces away from where it went');
      if (dx < 0) west++;
    }
  }
  console.log(`${moves} steps in 12 ticks, ${west} of them west`);
  assert.ok(moves > herds.markers.length * 0.2, `only ${moves} steps for ${herds.markers.length} markers`);
  assert.ok(west > 0);
});

test('every living sub-species keeps a creature of its own, and the jump finds it', () => {
  const { s, herds, advance } = planet();
  const w = s.world;
  const n = SE.SUBSPECIES_PER_CLASS;
  advance();
  for (let c = 1; c < SE.LIFE_COUNT; c++) {
    for (let st = 0; st < n; st++) {
      if (w.lifeStageCounts[c * n + st] === 0) continue;
      const own = herds.markers.find((m) => m.c === c && m.stage === st && m.pinned);
      assert.ok(own, `${SE.LIFE[c].id} stage ${st} lives but has no creature`);
      assert.equal(herds.pin(w, c, st), own.tile);
    }
  }
  const dead = w.lifeStageCounts.findIndex((k, i) => k === 0 && i >= n);
  assert.equal(herds.pin(w, Math.floor(dead / n), dead % n), -1, 'a sub-species that doesn’t live gets no creature');
});

test('a new planet or an older save starts the herds afresh', () => {
  const s = makeSim(7);
  s.evo.develop(s.world, s.params, 'cells');
  s.play(150);
  const herds = new SE.HerdLayer(true);
  const rand = seeded(3);
  herds.update(s.world, 0, rand);
  assert.ok(herds.markers.length > 0, 'cells alone already show');
  const old = herds.markers[0];

  s.world.ticks -= 50;
  herds.update(s.world, 10, rand);
  assert.ok(!herds.markers.includes(old), 'markers kept across a load of an older state');

  s.world.reset(8);
  s.world.refreshDerived();
  herds.update(s.world, 20, rand);
  assert.equal(herds.markers.length, 0, 'a lifeless new planet shows no creatures');
});
