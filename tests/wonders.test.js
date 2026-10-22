'use strict';
/*
 * World wonders (src/wonders.ts): the pyramids on dry, flat ground by a
 * river, the wall over land along a mountain edge on the frontier, progress
 * and the news, only the LAND_USE_WONDER bit, no world.rng, plate drift,
 * the sea, today's Earth and the optional save field `wonders`.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE, makeSim } = require('./helpers');

const SE = loadSE();
const L = SE.Landscape;

/** A flat steppe continent; `cities` as [x, y, tech, pop] of a land species, derived into peoples. */
function planet(cities, shape) {
  const s = makeSim(4242);
  const w = s.world;
  w.elevation.fill(-0.3);
  for (let y = 15; y < 100; y++) {
    for (let x = 10; x < 150; x++) {
      const i = SE.idx(x, y);
      w.elevation[i] = 0.1;
      w.landscape[i] = L.Steppe;
      w.substrate[i] = SE.Substrate.Soil;
    }
  }
  w.riverLevel.fill(0);
  if (shape) shape(w);
  w.sentientClass = SE.Life.Mammal;
  for (const [x, y, tech, pop] of cities) {
    w.tech[SE.idx(x, y)] = tech;
    w.cityPop[SE.idx(x, y)] = pop;
  }
  s.civ.sync(w, s.params);
  return { s, w };
}

/** A desert by a river running north–south at x 70, south of three Bronze Age cities. */
function nile(w) {
  for (let y = 55; y < 75; y++) for (let x = 58; x < 84; x++) w.landscape[SE.idx(x, y)] = L.Desert;
  for (let y = 54; y < 76; y++) w.riverLevel[SE.idx(70, y)] = 1;
}
const BRONZE = [[62, 52, SE.Tech.Bronze, 0.4], [69, 50, SE.Tech.Bronze, 0.4], [76, 52, SE.Tech.Bronze, 0.4]];

/** Plains in the south, a plateau in the north, the steep edge between rows 46 and 49. */
function ridge(w) {
  for (let y = 15; y < 52; y++) {
    for (let x = 10; x < 150; x++) w.elevation[SE.idx(x, y)] = y < 47 ? 0.3 : 0.1 + (52 - y) * 0.01;
  }
}
/** Three Iron Age cities of one people south of the ridge, a foreign one on the plateau. */
const IRON = [[62, 55, SE.Tech.Iron, 0.4], [69, 55, SE.Tech.Iron, 0.4], [76, 55, SE.Tech.Iron, 0.4], [69, 30, SE.Tech.Iron, 0.4]];

/** Tick until `until` holds, collecting the news; ticks run like the civilization's step, without the rest of the planet. */
function run(s, until, max = 2000) {
  const w = s.world;
  const news = [];
  for (let k = 0; k < max && !until(); k++) {
    w.civ.news.length = 0;
    SE.stepWonders(w, s.params);
    news.push(...w.civ.news);
    w.ticks++;
  }
  return news;
}

const chebyshev = (a, b) => {
  let dx = Math.abs((a % SE.GRID_W) - (b % SE.GRID_W));
  dx = Math.min(dx, SE.GRID_W - dx);
  return Math.max(dx, Math.abs(Math.floor(a / SE.GRID_W) - Math.floor(b / SE.GRID_W)));
};

function steepness(w, i) {
  let s = 0;
  for (let k = 0; k < 8; k++) {
    const j = SE.tileAt(i, SE.HAZARD_NX[k], SE.HAZARD_NY[k]);
    if (j >= 0 && !w.isWater(j)) s = Math.max(s, Math.abs(w.elevation[j] - w.elevation[i]));
  }
  return s;
}

test('the pyramids stand on dry, flat ground by a river near the builder, 3 × 2 tiles without river or city', () => {
  const { s, w } = planet(BRONZE, nile);
  const news = run(s, () => w.civ.wonders.length > 0);
  const p = w.civ.wonders[0];
  assert.ok(p && p.kind === 'pyramids', 'begun');
  assert.equal(p.tiles.length, 6);
  const [x0, y0] = [p.tiles[0] % SE.GRID_W, Math.floor(p.tiles[0] / SE.GRID_W)];
  p.tiles.forEach((t, k) => assert.equal(t, SE.idx(x0 + (k % 3), y0 + Math.floor(k / 3)), 'a 3 × 2 block, upper row first'));
  let lo = Infinity;
  let hi = -Infinity;
  for (const t of p.tiles) {
    assert.ok([L.Desert, L.Semidesert].includes(w.landscape[t]), 'dry ground');
    assert.ok(!w.isWater(t) && w.riverLevel[t] === 0 && w.tech[t] === SE.Tech.None, 'no water, river or city');
    lo = Math.min(lo, w.elevation[t]);
    hi = Math.max(hi, w.elevation[t]);
  }
  assert.ok(hi - lo <= SE.PYRAMIDS_FLAT, 'flat');
  const rivers = [];
  for (let i = 0; i < SE.TILE_COUNT; i++) if (w.riverLevel[i] > 0) rivers.push(i);
  assert.ok(p.tiles.some((t) => rivers.some((r) => chebyshev(t, r) <= SE.PYRAMIDS_RIVER_NEAR)), 'a river within reach');
  assert.ok(w.civ.cities.some((c) => SE.tileDistance(c.tile, p.tiles[4]) <= SE.WONDER_REACH), 'near a city of the builder');
  const begun = news.filter((n) => /beginnen .* mit dem Bau der Pyramiden/.test(n.text));
  assert.equal(begun.length, 1, 'one news when the work begins');
  assert.ok(!begun[0].chronicle);
});

test('the pyramids are built through their six stages, then the chronicle reports the wonder once', () => {
  const { s, w } = planet(BRONZE, nile);
  run(s, () => w.civ.wonders.length > 0);
  const p = w.civ.wonders[0];
  const stages = new Set();
  const news = run(s, () => { stages.add(SE.wonderStage(p)); return p.done >= 0; }, SE.PYRAMIDS_BUILD_TICKS + 5);
  stages.add(SE.wonderStage(p));
  assert.ok(p.done >= 0 && p.progress === 1, 'finished');
  assert.deepEqual([...stages].sort(), [0, 1, 2, 3, 4, 5], 'every stage shows, the last only when done');
  const done = news.filter((n) => n.chronicle && n.chronicle.key === 'civ:wonder:pyramids');
  assert.equal(done.length, 1);
  assert.ok(done[0].chronicle.major);
  assert.match(done[0].text, /haben ein Weltwunder errichtet: die Pyramiden/);
  assert.match(done[0].chronicle.change, /^Vorbild sind die Pyramiden von Gizeh/);
  assert.doesNotMatch(done[0].text, /höchste|Bauwerk der/, 'no claim about the species or the age');
  run(s, () => false, 50);
  assert.equal(w.civ.wonders.length, 1, 'never a second one');
});

test('the wall runs over land along the mountain edge between the peoples, 8–16 connected tiles, and grows piece by piece', () => {
  const { s, w } = planet(IRON, ridge);
  assert.equal(new Set(w.civ.cities.map((c) => c.tribe)).size, 2, 'two peoples');
  run(s, () => w.civ.wonders.length > 0);
  const m = w.civ.wonders[0];
  assert.ok(m && m.kind === 'wall', 'begun');
  assert.ok(m.tiles.length >= SE.WALL_LENGTH[0] && m.tiles.length <= SE.WALL_LENGTH[1], `${m.tiles.length} tiles`);
  for (let k = 0; k < m.tiles.length; k++) {
    const t = m.tiles[k];
    assert.ok(!w.isWater(t) && w.riverLevel[t] === 0, 'over land, never water');
    assert.ok(steepness(w, t) >= 0.1, 'on the mountain edge');
    const y = Math.floor(t / SE.GRID_W);
    assert.ok(y > 30 && y < 55, 'between the peoples');
    assert.ok(w.civ.cities.every((c) => chebyshev(c.tile, t) >= SE.WALL_CITY_GAP), 'clear of the cities');
    if (k > 0) assert.equal(chebyshev(m.tiles[k - 1], t), 1, 'a connected chain');
  }
  // It grows from one end: a piece shows only after the one before it.
  let shown = 1;
  run(s, () => {
    const now = m.tiles.filter((_, k) => SE.wonderStage(m, k) >= 0).length;
    assert.ok(now >= shown, 'pieces never vanish');
    for (let k = 1; k < m.tiles.length; k++) assert.ok(SE.wonderStage(m, k) <= SE.wonderStage(m, k - 1));
    shown = now;
    return m.done >= 0;
  }, SE.WALL_BUILD_TICKS + 5);
  assert.ok(m.tiles.every((_, k) => SE.wonderStage(m, k) === 2), 'finished along its length');
});

test('no wonder is begun once the planet has gone two ages past it', () => {
  const { s, w } = planet(BRONZE, nile);
  w.civ.topTech = SE.Tech.Industrial;
  run(s, () => false, 600);
  assert.equal(w.civ.wonders.length, 0, 'no pyramids by a lagging people');
  w.civ.topTech = SE.Tech.Iron;
  run(s, () => w.civ.wonders.length > 0, 2000);
  assert.equal(w.civ.wonders.length, 1, 'in the Iron age they still may');
});

test('a wonder sets only its own land-use bit, and no random number is drawn', () => {
  const { s, w } = planet(BRONZE, nile);
  const others = SE.LAND_USE_FIELD | SE.LAND_USE_RAIL | SE.LAND_USE_LOGGED;
  w.landUse.fill(others);
  const rng = w.rng.getState();
  run(s, () => w.civ.wonders.length > 0 && w.civ.wonders[0].done >= 0);
  assert.equal(w.rng.getState(), rng, 'world.rng untouched');
  const tiles = new Set(w.civ.wonders[0].tiles);
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    assert.equal(w.landUse[i] & ~SE.LAND_USE_WONDER, others, 'other bits kept');
    assert.equal((w.landUse[i] & SE.LAND_USE_WONDER) !== 0, tiles.has(i), 'the wonder bit on its tiles only');
  }
});

test('the same planet builds the same wonders at the same ticks', () => {
  const a = planet(IRON, ridge);
  const b = planet(IRON, ridge);
  run(a.s, () => a.w.civ.wonders.length > 0 && a.w.civ.wonders[0].progress > 0.5);
  run(b.s, () => b.w.ticks >= a.w.ticks);
  assert.deepEqual(b.w.civ.wonders, a.w.civ.wonders);
});

test('wonders ride the plates in their rows and are lost to the sea', () => {
  const { s, w } = planet(BRONZE, nile);
  run(s, () => w.civ.wonders.length > 0);
  const p = w.civ.wonders[0];
  const before = p.tiles.slice();
  // The plate carrying the pyramids rolls one tile east.
  for (const y of new Set(before.map((t) => Math.floor(t / SE.GRID_W)))) {
    const row = w.elevation.slice(y * SE.GRID_W, (y + 1) * SE.GRID_W);
    for (let x = 0; x < SE.GRID_W; x++) w.elevation[y * SE.GRID_W + SE.wrapX(x + 1)] = row[x];
  }
  w.driftShifts++;
  run(s, () => false, 1);
  assert.deepEqual(p.tiles, before.map((t) => SE.tileAt(t, 1, 0)), 'moved with the land');
  for (const t of before) if (!p.tiles.includes(t)) assert.equal(w.landUse[t] & SE.LAND_USE_WONDER, 0, 'old tiles cleared');
  w.elevation[p.tiles[2]] = -0.1;
  const news = run(s, () => false, 1);
  assert.equal(w.civ.wonders.length, 0, 'lost');
  assert.ok(news.some((n) => /versinken im Meer/.test(n.text)));
  assert.ok(p.tiles.every((t) => (w.landUse[t] & SE.LAND_USE_WONDER) === 0));
});

test('the work rests while no city stands within reach and goes on when one does', () => {
  const { s, w } = planet(BRONZE, nile);
  run(s, () => w.civ.wonders.length > 0);
  const p = w.civ.wonders[0];
  run(s, () => p.progress > 0.2);
  const keep = w.civ.cities.map((c) => [c.tile, w.tech[c.tile], w.cityPop[c.tile]]);
  for (const [t] of keep) { w.tech[t] = SE.Tech.None; w.cityPop[t] = 0; }
  s.civ.sync(w, s.params);
  const at = p.progress;
  let news = run(s, () => false, 20);
  assert.equal(p.progress, at, 'rests');
  assert.ok(p.paused);
  assert.equal(news.filter((n) => /ruht/.test(n.text)).length, 1, 'said once');
  for (const [t, tech, pop] of keep) { w.tech[t] = tech; w.cityPop[t] = pop; }
  s.civ.sync(w, s.params);
  news = run(s, () => false, 5);
  assert.ok(p.progress > at && !p.paused, 'goes on');
  assert.ok(news.some((n) => /bauen die Pyramiden weiter/.test(n.text)));
});

test('today\'s Earth is recognised wherever the plates took it; a random planet is not', () => {
  const giza = [29.98, 31.13];
  const earth = makeSim(7, 'today').world;
  assert.equal(SE.earthPlace(earth, giza), SE.latLonTile(giza));
  const y0 = Math.floor(SE.latLonTile(giza) / SE.GRID_W);
  for (let y = y0 - 4; y <= y0 + 4; y++) {
    const row = earth.elevation.slice(y * SE.GRID_W, (y + 1) * SE.GRID_W);
    for (let x = 0; x < SE.GRID_W; x++) earth.elevation[y * SE.GRID_W + SE.wrapX(x + 3)] = row[x];
  }
  earth.driftShifts += 3;
  assert.equal(SE.earthPlace(earth, giza), SE.tileAt(SE.latLonTile(giza), 3, 0), 'drifted three tiles east');
  assert.equal(SE.earthPlace(makeSim(7).world, giza), -1);
});

test('on today\'s Earth the pyramids rise by Giza and the wall along the line across northern China', () => {
  const s = makeSim(7, 'today');
  const w = s.world;
  const near = (at, r, fn) => {
    const c = SE.earthPlace(w, at);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) fn(SE.tileAt(c, dx, dy), dx, dy);
    return c;
  };
  // A fresh planet has no landscape yet: dry land round Giza and steppe in northern China.
  const giza = near([29.98, 31.13], 10, (i) => { if (!w.isWater(i)) w.landscape[i] = L.Desert; });
  const line = near([40.5, 110], 14, (i) => { if (!w.isWater(i)) w.landscape[i] = L.Steppe; });
  w.riverLevel.fill(0);
  w.sentientClass = SE.Life.Mammal;
  const found = (c, tech, dxs, dy) => {
    for (const dx of dxs) {
      for (let k = 0; k < 6; k++) {
        const i = SE.tileAt(c, dx, dy + k);
        if (w.isWater(i)) continue;
        w.landscape[i] = L.Steppe;
        w.tech[i] = tech;
        w.cityPop[i] = 0.4;
        break;
      }
    }
  };
  found(giza, SE.Tech.Bronze, [-6, 1, 8], 3);
  found(line, SE.Tech.Iron, [-7, 0, 7], 4);
  s.civ.sync(w, s.params);
  run(s, () => w.civ.wonders.length === 2, 3000);
  const p = w.civ.wonders.find((x) => x.kind === 'pyramids');
  const m = w.civ.wonders.find((x) => x.kind === 'wall');
  assert.ok(p && SE.tileDistance(p.tiles[4], giza) <= SE.WONDER_REAL_NEAR, 'pyramids by Giza (no river needed there)');
  assert.ok(m && m.tiles.every((t) => Math.abs(Math.floor(t / SE.GRID_W) - Math.floor(line / SE.GRID_W)) <= 5), 'wall along the line');
  assert.ok(p.tiles.every((a) => m.tiles.every((b) => SE.tileDistance(a, b) >= SE.WONDER_GAP)), 'wonders apart');
});

test('the save field round-trips; an unsound one changes nothing', () => {
  const { s, w } = planet(IRON, ridge);
  run(s, () => w.civ.wonders.length > 0 && w.civ.wonders[0].progress > 0.3);
  const raw = JSON.parse(JSON.stringify(SE.wondersToJSON(w)));
  const b = planet([]);
  b.w.ticks = w.ticks;
  SE.restoreWonders(b.w, raw);
  assert.deepEqual(b.w.civ.wonders, w.civ.wonders);
  for (const t of w.civ.wonders[0].tiles) assert.ok((b.w.landUse[t] & SE.LAND_USE_WONDER) !== 0, 'bits set again');
  const c = planet([]);
  c.w.ticks = w.ticks;
  for (const bad of [{ ...raw[0], progress: 2 }, { ...raw[0], kind: 'colossus' }, { ...raw[0], tiles: [-1] }, { ...raw[0], done: 5 }]) {
    SE.restoreWonders(c.w, [bad]);
    assert.equal(c.w.civ.wonders.length, 0, JSON.stringify(Object.keys(bad)));
  }
  SE.restoreWonders(c.w, [raw[0], raw[0]]);
  assert.equal(c.w.civ.wonders.length, 0, 'one of each kind');
  assert.equal(SE.wondersToJSON(c.w), undefined, 'no field without wonders');
});
