'use strict';
/*
 * Civilization: city sites and spacing, settlers, water crossings per tech
 * level, tribes, deriving cities after a load, determinism, sentience on land
 * only, hunger and epidemics (docs/zivilisation-spec.md §2, §6). The planets
 * are drawn by hand — sea, rectangles of meadow — and only the civilization
 * ticks, so the whole file runs in seconds.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSim, hash } = require('./helpers.js');

/** A planet of sea with meadow on mature soil at 15 °C in each [x0, y0, x1, y1) rectangle; mammals think. */
function fixture(rects, seed = 7) {
  const s = makeSim(seed);
  const { SE, world: w } = s;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    w.elevation[i] = -0.3;
    w.landscape[i] = SE.Landscape.Meadow;
    w.substrate[i] = SE.Substrate.Soil;
    w.soil[i] = 200;
    w.temperature[i] = 15;
    w.riverLevel[i] = 0;
    w.landscapeZone[i] = SE.ZONE_NONE;
    w.tech[i] = 0;
    w.cityPop[i] = 0;
  }
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) w.elevation[y * SE.GRID_W + x] = 0.1;
  }
  w.sentientClass = SE.Life.Mammal;
  w.civ.clear();
  return s;
}

const at = (SE, x, y) => y * SE.GRID_W + x;

function city(s, x, y, tech, pop) {
  const i = at(s.SE, x, y);
  s.world.tech[i] = tech ?? s.SE.Tech.Stone;
  s.world.cityPop[i] = pop ?? 0.3;
  return i;
}

/** Tick only the civilization, calling `each` after every tick. */
function run(s, ticks, each) {
  for (let k = 0; k < ticks; k++) {
    s.civ.step(s.world, s.params, s.atmo);
    s.world.ticks++;
    if (each && each(k) === false) return;
  }
}

function cityTiles(s) {
  const out = [];
  for (let i = 0; i < s.SE.TILE_COUNT; i++) if (s.world.tech[i] !== 0) out.push(i);
  return out;
}

function minSpacing(s, tiles) {
  let best = Infinity;
  for (let a = 0; a < tiles.length; a++) {
    for (let b = a + 1; b < tiles.length; b++) best = Math.min(best, s.SE.tileDistance(tiles[a], tiles[b]));
  }
  return best;
}

function longestWaterRun(s, path) {
  let run = 0;
  let best = 0;
  for (const t of path) {
    run = s.world.isWater(t) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

test('cities keep their distance and are founded only on allowed ground', () => {
  const s = fixture([[30, 30, 130, 100]]);
  const { SE, world: w } = s;
  // Stripes of desert and a range above the tree line, where no city may stand.
  for (let y = 30; y < 100; y++) {
    for (let x = 30; x < 130; x++) {
      const i = at(SE, x, y);
      if (x % 12 < 3) w.landscape[i] = SE.Landscape.Desert;
      if (y >= 80 && x >= 90) w.elevation[i] = 0.6;
    }
  }
  city(s, 70, 60);
  run(s, 900, (k) => {
    if (k % 10 !== 0) return;
    const tiles = cityTiles(s);
    assert.ok(minSpacing(s, tiles) >= SE.CITY_MIN_DIST, `tick ${k}: two cities closer than ${SE.CITY_MIN_DIST}`);
    for (const i of tiles) assert.ok(!SE.cityGround(w, i).forbidden, `tick ${k}: city on forbidden ground at ${i}`);
    assert.equal(w.civ.cities.length, tiles.length, 'one record per city tile');
  });
  assert.ok(w.civ.cities.length >= 4, `the civilization spread (${w.civ.cities.length} cities)`);
});

test('settler groups keep to the caps, their range and a visible way', () => {
  const s = fixture([[20, 20, 180, 110]]);
  const { SE, world: w } = s;
  city(s, 60, 50);
  city(s, 140, 80);
  const seen = new Set();
  let underway = 0;
  run(s, 700, () => {
    const groups = w.civ.settlers;
    assert.ok(groups.length <= SE.SETTLERS_MAX);
    const perTribe = new Map();
    for (const g of groups) perTribe.set(g.tribe, (perTribe.get(g.tribe) || 0) + 1);
    for (const n of perTribe.values()) assert.ok(n <= SE.SETTLERS_PER_TRIBE);
    if (groups.length > 0) underway++;
    for (const g of groups) {
      if (seen.has(g.id)) continue;
      seen.add(g.id);
      const steps = g.path.length - 1;
      assert.ok(steps <= SE.SETTLER_RANGE[g.tech], `way of ${steps} tiles within reach`);
      assert.ok(steps >= SE.CITY_MIN_DIST, `way of ${steps} tiles is long enough to be seen`);
      assert.ok(SE.tileDistance(g.path[0], g.path[steps]) >= SE.CITY_MIN_DIST);
    }
  });
  assert.ok(seen.size >= 5, `settlers left (${seen.size} groups)`);
  assert.ok(underway > 0);
});

test('settlers cross as much water as their tech level allows', () => {
  const cases = [['Stone', 2], ['Bronze', 3], ['Iron', 6]];
  for (const [era, limit] of cases) {
    for (const width of [limit, limit + 1]) {
      // A small island with the city, a strait, and a big shore beyond it.
      const s = fixture([[60, 60, 65, 65], [65 + width, 50, 90 + width, 80]]);
      const { SE, world: w } = s;
      const from = city(s, 62, 62, SE.Tech[era]);
      s.civ.sync(w, s.params);
      const route = SE.findSettlerRoute(w, from, SE.Tech[era]);
      if (width <= limit) {
        assert.ok(route, `${era}: crosses ${width} water tiles`);
        assert.ok(route.crossed);
        assert.ok(longestWaterRun(s, route.path) <= limit);
      } else {
        assert.equal(route, null, `${era}: does not cross ${width} water tiles`);
      }
    }
  }
  const s = fixture([[60, 60, 65, 65], [85, 50, 110, 80]]);
  const from = city(s, 62, 62, s.SE.Tech.Industrial);
  s.civ.sync(s.world, s.params);
  assert.ok(s.SE.findSettlerRoute(s.world, from, s.SE.Tech.Industrial), 'the industrial age crosses open sea');
});

test('a lone island people reaches the Bronze Age and then crosses three water tiles', () => {
  // An island too small for a second city; the next shore lies beyond 3 water tiles.
  const s = fixture([[60, 60, 65, 65], [68, 50, 90, 80]]);
  const { SE, world: w } = s;
  const home = city(s, 62, 62);
  let bronzeAt = -1;
  let across = null;
  run(s, 4000, (k) => {
    if (bronzeAt < 0 && w.tech[home] >= SE.Tech.Bronze) bronzeAt = k;
    across = w.civ.cities.find((c) => c.tile % SE.GRID_W >= 68) || null;
    if (across) assert.ok(bronzeAt >= 0, 'nobody crosses 3 water tiles in the Stone Age');
    return !across;
  });
  assert.ok(bronzeAt >= 0, 'the island reached the Bronze Age');
  assert.ok(across, 'and its settlers crossed to the other shore');
});

test('a city far from its capital or across the water starts a tribe of its own', () => {
  // A long, narrow strip: each new city lies further from the capital.
  const strip = fixture([[20, 63, 140, 66]]);
  const capital = city(strip, 21, 64);
  let far = null;
  run(strip, 2500, () => {
    far = strip.world.civ.cities.find((c) => strip.SE.tileDistance(c.tile, capital) >= strip.SE.TRIBE_SPLIT_DIST);
    return !far;
  });
  assert.ok(far, 'the strip was settled far from the capital');
  const first = strip.world.civ.cityAt(capital);
  assert.notEqual(far.tribe, first.tribe);
  assert.equal(strip.world.civ.tribe(far.tribe).parent, first.tribe);

  // An island too small for a second city, a strait of two tiles, a shore beyond.
  const isle = fixture([[60, 60, 65, 65], [67, 50, 90, 80]]);
  const home = city(isle, 62, 62);
  let news = [];
  run(isle, 1500, () => {
    news = news.concat(isle.world.civ.news);
    return isle.world.civ.cities.length < 2;
  });
  const { world: w } = isle;
  assert.equal(w.civ.cities.length, 2, 'settlers crossed the strait');
  const across = w.civ.cities.find((c) => c.tile !== home);
  assert.notEqual(across.tribe, w.civ.cityAt(home).tribe);
  assert.ok(news.some((n) => n.chronicle && n.chronicle.key === 'civ:crossing'));
  assert.ok(news.some((n) => n.chronicle && /^civ:tribe:/.test(n.chronicle.key)));
});

test('a loaded city carpet thins out to spaced cities, forbidden ground cleared first', () => {
  const s = fixture([[30, 30, 100, 90]]);
  const { SE, world: w } = s;
  let grid = 0;
  for (let y = 35; y < 85; y++) {
    for (let x = 35; x < 95; x++) {
      const i = at(SE, x, y);
      w.tech[i] = 1 + ((x * 7 + y * 3) % 3);
      w.cityPop[i] = 0.2 + ((x * 13 + y * 5) % 50) / 100;
      grid++;
    }
  }
  // The most populous tiles stand in a desert: they must go before thinning picks them.
  for (let y = 40; y < 50; y++) {
    for (let x = 40; x < 50; x++) {
      w.landscape[at(SE, x, y)] = SE.Landscape.Desert;
      w.cityPop[at(SE, x, y)] = 1;
    }
  }
  s.civ.sync(w, s.params);
  const tiles = cityTiles(s);
  assert.ok(tiles.length > 5 && tiles.length < grid / 20, `${grid} city tiles became ${tiles.length} cities`);
  assert.ok(minSpacing(s, tiles) >= SE.CITY_MIN_DIST);
  for (const i of tiles) assert.notEqual(w.landscape[i], SE.Landscape.Desert);
  assert.equal(w.civ.cities.length, tiles.length);
  assert.ok(w.civ.tribes.length >= 1 && w.civ.tribes.length <= SE.TRIBE_MAX);
  for (const c of w.civ.cities) {
    assert.ok(w.civ.tribe(c.tribe), 'every city has a tribe');
    assert.ok(c.name.length > 2);
  }
  assert.ok(w.civ.news.length > 0, 'the thinning is reported');

  // Twelve islands far apart: twelve cities but no more than eight tribes.
  const isles = [];
  for (let k = 0; k < 12; k++) isles.push([10 + k * 20, 20 + (k % 3) * 30, 14 + k * 20, 24 + (k % 3) * 30]);
  const t = fixture(isles);
  isles.forEach(([x0, y0]) => city(t, x0 + 2, y0 + 2));
  t.civ.sync(t.world, t.params);
  assert.equal(t.world.civ.cities.length, 12);
  assert.equal(t.world.civ.tribes.length, SE.TRIBE_MAX);
  const colours = new Set(t.world.civ.tribes.map((tr) => tr.color));
  assert.equal(colours.size, SE.TRIBE_MAX, 'one colour per tribe');
});

test('loading keeps a lone city on ground that turned forbidden, and names stay unique', () => {
  const s = fixture([[30, 30, 100, 90], [150, 30, 160, 40]]);
  const { SE, world: w } = s;
  for (let y = 35; y < 85; y++) {
    for (let x = 35; x < 95; x++) {
      w.tech[at(SE, x, y)] = 1;
      w.cityPop[at(SE, x, y)] = 0.2 + ((x * 13 + y * 5) % 50) / 100;
    }
  }
  // A city far from all others whose ground became desert in play.
  const lone = city(s, 155, 35);
  w.landscape[lone] = SE.Landscape.Desert;
  s.civ.sync(w, s.params);
  assert.ok(w.civ.cityAt(lone), 'the lone city on desert survives the load');
  assert.match(w.civ.news[0].text, /zusammengelegt/);
  assert.doesNotMatch(w.civ.news[0].text, /geräumt/, 'no forbidden carpet tile was cleared');
  const cityNames = w.civ.cities.map((c) => c.name);
  assert.equal(new Set(cityNames).size, cityNames.length, 'city names are unique');
  const tribeNames = w.civ.tribes.map((t) => t.name);
  assert.equal(new Set(tribeNames).size, tribeNames.length, 'tribe names are unique');
});

/** Name and people (by name) of every city, keyed by tile. */
function cityNames(w) {
  return new Map(w.civ.cities.map((c) => [c.tile, `${c.name}/${w.civ.tribe(c.tribe).name}/${w.civ.tribe(c.tribe).color}`]));
}

/** The planet through a save document and back into a fresh simulation, synced as the app does. */
function saveAndLoad(s, edit) {
  const { SE } = s;
  const doc = JSON.parse(JSON.stringify(SE.SaveSystem.serialize({ world: s.world, params: s.params, geo: s.geo, history: s.history })));
  if (edit) edit(doc);
  const t = makeSim(1);
  SE.SaveSystem.load(doc, { world: t.world, params: t.params, geo: t.geo, history: t.history }, t.life, t.flora);
  const restored = t.world.civ.synced;
  t.civ.sync(t.world, t.params);
  return { t, restored };
}

test('city and people names survive a save, after a takeover and after drift', () => {
  const s = fixture([[20, 20, 90, 60], [130, 20, 200, 60]]);
  const { SE, world: w } = s;
  for (const [x, y] of [[25, 30], [40, 30], [55, 30], [70, 45], [135, 30], [150, 30]]) city(s, x, y);
  s.civ.sync(w, s.params);
  assert.ok(w.civ.tribes.length >= 2);
  // A takeover: one city goes over to another people.
  const taken = w.civ.cityAt(at(SE, 135, 30));
  taken.tribe = w.civ.cityAt(at(SE, 25, 30)).tribe;
  // Drift: a city moves one tile along its row and keeps its record.
  const from = at(SE, 55, 30);
  const drifted = w.civ.cityAt(from);
  w.tech[from + 1] = w.tech[from];
  w.cityPop[from + 1] = w.cityPop[from];
  w.tech[from] = 0;
  w.cityPop[from] = 0;
  w.driftShifts++;
  s.civ.sync(w, s.params);
  assert.equal(w.civ.cityAt(from + 1), drifted);
  const before = cityNames(w);

  const { t, restored } = saveAndLoad(s);
  assert.ok(restored, 'the records came from the save');
  assert.deepEqual(cityNames(t.world), before);

  // An old save without the field still derives its cities.
  const old = saveAndLoad(s, (doc) => { delete doc.civ; });
  assert.ok(!old.restored);
  assert.equal(old.t.world.civ.cities.length, before.size);
  assert.ok(old.t.world.civ.synced);
});

test('a damaged civ field in a save is ignored and the planet still loads', () => {
  const s = fixture([[20, 20, 90, 60]]);
  const { SE, world: w } = s;
  city(s, 30, 30);
  city(s, 50, 30);
  s.civ.sync(w, s.params);
  const edits = [
    (doc) => { doc.civ.cities[0].t = at(SE, 31, 30); },        // no city on that tile
    (doc) => { doc.civ.cities[0].t = -5; },                     // off the map
    (doc) => { doc.civ.cities[0].p = 999; },                    // unknown people
    (doc) => { doc.civ.cities[1].t = doc.civ.cities[0].t; },    // the same tile twice
    (doc) => { doc.civ.tribes[0].c = 9; },                      // no such colour
    (doc) => { doc.civ.cities[0].n = 42; },                     // name of the wrong type
    (doc) => { doc.civ = 'oops'; },
  ];
  for (const edit of edits) {
    const { t, restored } = saveAndLoad(s, edit);
    assert.ok(!restored, `ignored: ${edit}`);
    assert.equal(t.world.civ.cities.length, 2, 'derived from the grid instead');
  }
});

test('the distance rule leaves the last two colours to crossings', () => {
  const isles = [];
  for (let k = 0; k < 6; k++) isles.push([10 + k * 35, 20, 31 + k * 35, 30]);
  isles.push([10, 70, 30, 80]);
  const s = fixture(isles);
  const { SE, world: w } = s;
  for (let k = 0; k < 6; k++) city(s, 11 + k * 35, 21);
  s.civ.sync(w, s.params);
  assert.equal(w.civ.tribes.length, 6);
  const home = w.civ.cityAt(at(SE, 11, 21)).tribe;
  // Far from its capital on the same island: no seventh people by distance.
  const far = city(s, 29, 21, SE.Tech.Stone, 0.1);
  assert.equal(SE.foundCity(w, s.params, far, home, false).tribe, home);
  assert.equal(w.civ.tribes.length, 6);
  // Across the water: a people of its own, in one of the free colours.
  const over = city(s, 20, 75, SE.Tech.Stone, 0.1);
  assert.notEqual(SE.foundCity(w, s.params, over, home, true).tribe, home);
  assert.equal(w.civ.tribes.length, 7);
  assert.equal(SE.CITY_FERTILITY.length, SE.LANDSCAPE_COUNT, 'a food value for every landscape');
});

test('on a settled planet nobody leaves, and nobody counts as cramped', () => {
  const s = fixture([[40, 40, 100, 90]]);
  const { SE, world: w } = s;
  const i = city(s, 60, 60, SE.Tech.Stone, 0.6);
  s.civ.sync(w, s.params);
  const c = w.civ.cityAt(i);
  c.cramped = true;
  c.settleAfter = 0;
  w.oceanFraction = 1 - 1 / SE.TILE_COUNT; // one land tile: any city fills the cap
  assert.ok(SE.citiesSaturated(w));
  SE.sendSettlers(w);
  assert.equal(w.civ.settlers.length, 0);
  assert.equal(c.cramped, false);
});

test('a sunken city is given up, and an empty city on bare ground makes no NaN', () => {
  const s = fixture([[40, 40, 100, 90]]);
  const { SE, world: w } = s;
  const a = city(s, 60, 60);
  const b = city(s, 80, 70);
  s.civ.sync(w, s.params);
  w.elevation[a] = -0.05;
  s.civ.sync(w, s.params);
  assert.equal(w.civ.cityAt(a), undefined);
  assert.equal(w.tech[a], 0);
  assert.ok(w.civ.news.some((n) => /versinkt/.test(n.text)));

  const c = w.civ.cityAt(b);
  c.capacity = 0;
  w.cityPop[b] = 0;
  SE.growCities(w, s.params);
  assert.ok(!Number.isNaN(w.cityPop[b]));
  assert.equal(w.civ.cityAt(b), undefined, 'the empty city is abandoned');
});

test('a city the plates move keeps its record, name and tribe', () => {
  const s = fixture([[40, 40, 100, 90]]);
  const { SE, world: w } = s;
  const i = city(s, 70, 60);
  run(s, 1);
  const c = w.civ.cityAt(i);
  assert.ok(c);
  w.tech[i + 1] = w.tech[i];
  w.cityPop[i + 1] = w.cityPop[i];
  w.tech[i] = 0;
  w.cityPop[i] = 0;
  w.driftShifts++;
  run(s, 1);
  assert.equal(w.civ.cityAt(i + 1), c);
  assert.equal(w.civ.cities.length, 1);
});

test('the same seed grows the same civilization', () => {
  const play = () => {
    const s = fixture([[30, 30, 130, 100]], 99);
    city(s, 70, 60);
    run(s, 600);
    const w = s.world;
    return {
      grid: [hash(w.tech), hash(w.cityPop)],
      cities: w.civ.cities.map((c) => `${c.name}@${c.tile}:${c.tribe}`).join(','),
      tribes: w.civ.tribes.map((t) => `${t.name}:${t.color}`).join(','),
      settlers: w.civ.settlers.map((g) => g.path.join('-')).join('|'),
      rng: w.rng.getState(),
    };
  };
  const a = play();
  assert.deepEqual(play(), a);
  assert.ok(a.cities.split(',').length > 2);
});

test('sea classes never become sentient', () => {
  const s = fixture([[40, 40, 100, 90]]);
  const { SE, world: w, params } = s;
  w.sentientClass = SE.Life.None;
  w.o2 = 21;
  params.bio.evolutionRate = 1;
  // Whales rule the oceans and nothing on land can think.
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    if (!w.isWater(i)) continue;
    w.lifeDensity[i * SE.LIFE_COUNT + SE.Life.Cetacean] = 0.9;
    w.lifeDensity[i * SE.LIFE_COUNT + SE.Life.Mollusc] = 0.5;
  }
  w.refreshDerived();
  assert.ok(w.coverage(SE.Life.Cetacean) > 0.3);
  assert.equal(SE.CivSystem.sentienceCandidate(w), SE.Life.None);
  run(s, 3000);
  assert.equal(w.sentientClass, SE.Life.None);
  assert.equal(cityTiles(s).length, 0);

  // A land class does wake up, and settles on land.
  for (let i = 0; i < SE.TILE_COUNT; i++) if (!w.isWater(i)) w.lifeDensity[i * SE.LIFE_COUNT + SE.Life.Mammal] = 0.8;
  w.refreshDerived();
  assert.equal(SE.CivSystem.sentienceCandidate(w), SE.Life.Mammal);
  run(s, 4000, () => w.sentientClass === SE.Life.None);
  assert.equal(w.sentientClass, SE.Life.Mammal);
  for (const i of cityTiles(s)) assert.ok(!w.isWater(i));
});

test('epidemics strike only scarce cities, and medicine helps from the industrial age on', () => {
  // Room to send settlers: no scarcity, no epidemic.
  const roomy = fixture([[30, 30, 130, 100]]);
  city(roomy, 70, 60);
  let outbreaks = 0;
  run(roomy, 300, () => { outbreaks += roomy.world.civ.outbreaks.length; });
  assert.equal(outbreaks, 0);

  const { SE } = roomy;
  const c = roomy.world.civ.cities[0];
  c.scarcity = 0;
  assert.equal(SE.epidemicRisk(roomy.world, roomy.params, c), 0);
  c.scarcity = 100;
  roomy.world.cityPop[c.tile] = c.capacity;
  const stone = SE.epidemicRisk(roomy.world, roomy.params, c);
  assert.ok(stone > 0);
  roomy.world.tech[c.tile] = SE.Tech.Industrial;
  roomy.params.civAlloc.medicine = 0;
  const weak = SE.epidemicRisk(roomy.world, roomy.params, c);
  roomy.params.civAlloc.medicine = 1;
  const strong = SE.epidemicRisk(roomy.world, roomy.params, c);
  const hygiene = SE.EPIDEMIC_TECH[SE.Tech.Industrial] / SE.EPIDEMIC_TECH[SE.Tech.Stone];
  assert.ok(hygiene < 1, 'industrial cities fall ill less often');
  assert.ok(Math.abs(weak / stone / hygiene - 0.7) < 1e-9 && Math.abs(strong / stone / hygiene - 0.2) < 1e-9, 'medicine cuts 30-80 %');

  // A crowded island: scarcity, then epidemics — fewer with full medicine.
  const count = (medicine) => {
    const s = fixture([[60, 60, 66, 66]], 3);
    city(s, 62, 62, s.SE.Tech.Industrial, 0.3);
    s.params.civAlloc.medicine = medicine;
    s.params.civAlloc.science = 0; // stays industrial: later ages fall ill less often still
    const ids = new Set();
    let first = null;
    run(s, 15000, () => {
      for (const o of s.world.civ.outbreaks) {
        if (ids.has(o)) continue;
        ids.add(o);
        if (first === null) first = s.world.civ.city(o.city).scarcity;
      }
    });
    if (ids.size > 0) assert.ok(first > 0, 'the first epidemic struck a scarce city');
    return ids.size;
  };
  const without = count(0);
  const withMedicine = count(1);
  assert.ok(without >= 5, `epidemics on a crowded island (${without})`);
  assert.ok(withMedicine < without, `medicine: ${withMedicine} instead of ${without}`);
});

test('the old plague roll in the event system no longer harms cities, but still draws', () => {
  const s = fixture([]);
  const { SE, world: w } = s;
  w.tech.fill(SE.Tech.Stone);
  w.cityPop.fill(1);
  w.totalCityPop = SE.TILE_COUNT;
  s.params.civAlloc.medicine = 0;
  // Only the plague roll (0.0025) succeeds; volcano and meteor (< 0.0005) stay quiet.
  w.rng.chance = (p) => p > 0.002;
  const next = w.rng.next.bind(w.rng);
  let draws = 0;
  w.rng.next = () => { draws++; return next(); };
  s.events.step(w, s.params);
  assert.ok(draws > 0, 'the target pick still draws its random numbers');
  assert.ok(w.cityPop.every((p) => p === 1), 'no city lost people');
  assert.ok(w.eventTtl.every((t) => t === 0), 'no plague marker');
});

test('the city tool names what is wrong with a site', () => {
  const s = fixture([[40, 40, 100, 90]]);
  const { SE, world: w } = s;
  const i = city(s, 70, 60);
  s.civ.sync(w, s.params);
  const name = w.civ.cityAt(i).name;
  assert.equal(SE.citySiteProblem(w, at(SE, 73, 60), SE.Life.Mammal), `Zu nah an ${name} (mind. 7 Felder).`);
  w.landscape[at(SE, 50, 50)] = SE.Landscape.Rock;
  assert.equal(SE.citySiteProblem(w, at(SE, 50, 50), SE.Life.Mammal), 'Hier kann keine Stadt stehen: Fels, Wüste oder Eis.');
  assert.equal(SE.citySiteProblem(w, at(SE, 85, 75), SE.Life.Mammal), '');
});

test('two Stone Age cities on poor land still send settlers while the planet is too small to invent', () => {
  const s = fixture([[40, 40, 100, 90]]);
  const { SE, world: w } = s;
  const a = city(s, 60, 60);
  const b = city(s, 70, 60);
  s.civ.sync(w, s.params);
  assert.equal(w.civ.cityAt(a).tribe, w.civ.cityAt(b).tribe, 'one people');
  for (const i of [a, b]) {
    const c = w.civ.cityAt(i);
    c.capacity = 0.18; // too poor ever to reach SETTLER_DEPART_POP
    c.settleAfter = 0;
    w.cityPop[i] = 0.17;
  }
  assert.ok(w.civ.cities.length < SE.TECH_CITIES_MIN[SE.Tech.Stone]);
  SE.sendSettlers(w);
  assert.ok(w.civ.settlers.length > 0, 'a group leaves');
});
