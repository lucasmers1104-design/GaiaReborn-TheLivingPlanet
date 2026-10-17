'use strict';
/*
 * Conflicts between neighbouring peoples, peace, the atomic war and the
 * battle symbol (docs/zivilisation-spec.md §2.8, §3.7). The planets are drawn
 * by hand — islands of meadow too small for a second city, six water tiles
 * apart, so Stone Age settlers never cross and every city soon runs short of
 * land — and only the civilization ticks.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE, makeSim, hash } = require('./helpers.js');
const { artProblems } = require('../tools/artcheck');

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

/**
 * `cols` × `rows` islands of 7 × 7 tiles, 13 tiles apart, each with a full
 * Stone Age city in its middle: every island a people of its own, each city
 * a neighbour of the cities left, right, above and below it.
 */
function islands(cols, rows, seed) {
  const rects = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) rects.push([40 + c * 13, 40 + r * 13, 47 + c * 13, 47 + r * 13]);
  const s = fixture(rects, seed);
  for (const [x0, y0] of rects) {
    const i = at(s.SE, x0 + 3, y0 + 3);
    s.world.tech[i] = s.SE.Tech.Stone;
    s.world.cityPop[i] = 0.7;
  }
  return s;
}

function warlike(params) {
  params.civAlloc.military = 1;
  params.civAlloc.philosophy = 0;
  params.civAlloc.artMedia = 0;
}

/** Tick only the civilization, calling `each` after every tick with the tick just stepped. */
function run(s, ticks, each) {
  for (let k = 0; k < ticks; k++) {
    s.civ.step(s.world, s.params, s.atmo);
    s.world.ticks++;
    if (each && each(s.world.ticks - 1) === false) return;
  }
}

/** Run and log every conflict: start, end tick (the step it vanished in), sides and the news of both ticks. */
function watch(s, ticks, each) {
  const log = [];
  const open = new Map();
  run(s, ticks, (tick) => {
    const civ = s.world.civ;
    for (const e of open.values()) {
      if (civ.conflicts.includes(e.k)) continue;
      e.end = tick;
      e.endNews = civ.news.slice();
      open.delete(e.k);
    }
    for (const k of civ.conflicts) {
      if (open.has(k) || log.some((e) => e.k === k)) continue;
      const e = {
        k, start: tick, end: -1, startNews: civ.news.slice(), endNews: [], pair: s.SE.peaceKey(k.sides[0].id, k.sides[1].id),
        cities: [civ.city(k.a).name, civ.city(k.b).name],
      };
      log.push(e);
      open.set(k, e);
    }
    assert.ok(civ.conflicts.length <= 1, `tick ${tick}: ${civ.conflicts.length} conflicts at once`);
    if (each) return each(tick);
  });
  return log;
}

test('two neighbouring peoples short of land go to war', () => {
  const s = islands(2, 1);
  const { SE, world: w } = s;
  const log = watch(s, 3000, () => w.civ.conflicts.length === 0);
  assert.equal(log.length, 1, 'a conflict started');
  const { k, start } = log[0];
  const a = w.civ.city(k.a);
  const b = w.civ.city(k.b);
  assert.notEqual(a.tribe, b.tribe);
  assert.ok(SE.tileDistance(a.tile, b.tile) <= SE.CIV_NEIGHBOUR_DIST);
  assert.ok(a.scarcity >= SE.CONFLICT_SCARCITY, 'the attacker is short of land');
  assert.ok(start >= SE.CONFLICT_LOAD_CALM, 'not before the calm after the first sync');
  assert.ok(k.until - k.started >= SE.CONFLICT_TICKS[0] && k.until - k.started <= SE.CONFLICT_TICKS[1]);
});

test('one conflict at a time, a pause after each, peace per pair, a rest per people, news at start and end', () => {
  const s = islands(4, 2);
  const { SE, world: w } = s;
  warlike(s.params);
  const log = watch(s, 3000);
  const done = log.filter((e) => e.end >= 0);
  assert.ok(done.length >= 6, `${done.length} conflicts`);
  for (const e of done) {
    assert.equal(e.end, e.k.until, 'ends on its last tick');
    assert.ok(e.k.until - e.k.started >= 6 && e.k.until - e.k.started <= 12, `lasts ${e.k.until - e.k.started} ticks`);
    const [ta, tb] = e.k.sides;
    const names = (n) => n.text.includes(ta.name) && n.text.includes(tb.name);
    const start = e.startNews.find((n) => names(n) && n.text.startsWith('Krieg zwischen'));
    assert.ok(start, 'start news names both peoples');
    assert.ok(e.cities.every((c) => start.text.includes(c)), `start news names both cities: ${start.text}`);
    assert.equal(start.chronicle && start.chronicle.key, `civ:war-start:${e.k.started}:${e.k.a}:${e.k.b}`, 'the start stays in the chronicle');
    const end = e.endNews.find((n) => n.chronicle && n.chronicle.key === `civ:war:${e.k.started}:${e.k.a}:${e.k.b}`);
    assert.ok(end, 'end news with a chronicle entry');
    assert.ok(names(end), `end news names both peoples: ${end.text}`);
  }
  for (let n = 1; n < log.length; n++) {
    assert.ok(log[n].start - log[n - 1].end >= SE.CONFLICT_GAP, `pause of ${log[n].start - log[n - 1].end} ticks`);
  }
  const lastEnd = new Map();
  const tribeEnd = new Map();
  let pairs = 0;
  for (const e of log) {
    if (lastEnd.has(e.pair)) {
      pairs++;
      assert.ok(e.start - lastEnd.get(e.pair) >= SE.CONFLICT_PEACE, `peace of ${e.start - lastEnd.get(e.pair)} ticks`);
    }
    for (const t of e.k.sides) {
      if (tribeEnd.has(t.id)) assert.ok(e.start - tribeEnd.get(t.id) >= SE.CONFLICT_TRIBE_REST, `rest of ${e.start - tribeEnd.get(t.id)} ticks`);
      tribeEnd.set(t.id, e.end);
    }
    lastEnd.set(e.pair, e.end);
  }
  assert.ok(pairs > 0, 'some pair fought twice');
  assert.equal(w.civ.cities.length, SE.TILE_COUNT - w.tech.filter((t) => t === 0).length, 'one record per city tile');
});

test('no conflict without scarcity, inside one people or before the calm ends', () => {
  // Never short of land: no war, however warlike.
  const calm = islands(4, 2);
  warlike(calm.params);
  const none = watch(calm, 1500, () => { for (const c of calm.world.civ.cities) c.scarcity = 0; });
  assert.equal(none.length, 0);
  const { SE } = calm;
  for (const c of calm.world.civ.cities) c.scarcity = SE.CONFLICT_SCARCITY - 1;
  assert.deepEqual(SE.conflictPairs(calm.world), []);

  // Two neighbours of one people (stopped before a split could part them).
  const one = islands(2, 1);
  warlike(one.params);
  run(one, 1);
  const [a, b] = one.world.civ.cities;
  b.tribe = a.tribe;
  const scarce = () => { for (const c of one.world.civ.cities) c.scarcity = 100; };
  scarce();
  assert.deepEqual(SE.conflictPairs(one.world), []);
  assert.equal(watch(one, SE.TRIBE_SPLIT_AGE - 20, scarce).length, 0);

  // Before calmUntil nothing starts, after it soon.
  const rest = islands(2, 1);
  warlike(rest.params);
  run(rest, 1);
  rest.world.civ.calmUntil = 600;
  const later = watch(rest, 1200, () => {
    for (const c of rest.world.civ.cities) c.scarcity = 100;
    return rest.world.civ.conflicts.length === 0;
  });
  assert.equal(later.length, 1);
  assert.ok(later[0].start >= 600, `started at ${later[0].start}`);
});

test('the loser loses people and may be taken over or destroyed', () => {
  const setup = (popA, popB, techA) => {
    const s = islands(2, 1);
    run(s, 1);
    const [a, b] = s.world.civ.cities;
    s.world.cityPop[a.tile] = popA;
    s.world.cityPop[b.tile] = popB;
    s.world.tech[a.tile] = techA;
    s.world.civ.calmUntil = 0;
    return { s, a, b, k: s.SE.startConflict(s.world, a, b) };
  };
  const SE = loadSE();

  // Even: the attack is repelled, both lose; peace for the pair, rest for both.
  let { s, a, b, k } = setup(0.5, 0.5, SE.Tech.Stone);
  let tribes = [a.tribe, b.tribe];
  assert.equal(SE.settleConflict(s.world, k, 0.99), 'held');
  assert.deepEqual([a.tribe, b.tribe], tribes);
  assert.ok(Math.abs(s.world.cityPop[b.tile] - 0.45) < 1e-6 && Math.abs(s.world.cityPop[a.tile] - 0.35) < 1e-6);
  assert.equal(s.world.civ.news.at(-1).text, `Frieden: Die ${k.sides[1].name} wehren den Angriff der ${k.sides[0].name} ab.`);
  assert.equal(s.world.civ.conflicts.length, 0);
  const civ = s.world.civ;
  assert.equal(civ.peace.get(SE.peaceKey(...tribes)), s.world.ticks + SE.CONFLICT_PEACE);
  for (const t of tribes) assert.equal(civ.peace.get(SE.restKey(t)), s.world.ticks + SE.CONFLICT_TRIBE_REST);
  assert.equal(civ.calmUntil, s.world.ticks + SE.CONFLICT_GAP);

  // The attacker wins without taking: the city fought over holds.
  ({ s, a, b, k } = setup(0.5, 0.5, SE.Tech.Stone));
  assert.equal(SE.settleConflict(s.world, k, 0), 'held');
  assert.equal(s.world.civ.news.at(-1).text, `Frieden zwischen den ${k.sides[0].name} und den ${k.sides[1].name}: ${b.name} hält stand.`);

  // A failed attack can cost the attacker its own city, and the message names it.
  ({ s, a, b, k } = setup(0.3, 0.9, SE.Tech.Stone));
  assert.equal(SE.settleConflict(s.world, k, 0.99), 'taken');
  assert.equal(a.tribe, b.tribe);
  assert.equal(s.world.civ.news.at(-1).text,
    `Frieden: Die ${k.sides[1].name} wehren den Angriff der ${k.sides[0].name} ab und übernehmen ${a.name}.`);

  // Far stronger: the city is taken; its people's only city, so the people is gone.
  ({ s, a, b, k } = setup(0.9, 0.3, SE.Tech.Iron));
  tribes = [a.tribe, b.tribe];
  const revision = s.world.civ.revision;
  assert.equal(SE.settleConflict(s.world, k, 0), 'taken');
  assert.equal(b.tribe, a.tribe);
  assert.ok(s.world.civ.revision > revision);
  assert.ok(Math.abs(s.world.cityPop[b.tile] - 0.21) < 1e-6);
  assert.equal(s.world.civ.tribe(tribes[1]), undefined, 'the conquered people has no city left');
  const taken = s.world.civ.news.at(-1);
  assert.equal(taken.text, `Frieden: Die ${k.sides[0].name} übernehmen ${b.name} von den ${k.sides[1].name}.`);
  assert.ok(taken.chronicle);

  // Too few left: destroyed, tile and record cleared, no further loss reported.
  ({ s, a, b, k } = setup(0.5, 0.06, SE.Tech.Stone));
  const tile = b.tile;
  assert.equal(SE.settleConflict(s.world, k, 0), 'destroyed');
  assert.equal(s.world.tech[tile], 0);
  assert.equal(s.world.cityPop[tile], 0);
  assert.equal(s.world.civ.cityAt(tile), undefined);
  assert.equal(s.world.civ.city(b.id), undefined);
  assert.match(s.world.civ.news.at(-1).text, /wurde im Krieg zerstört\.$/);
  run(s, 1);
  assert.equal(s.world.civ.cities.length, 1);
  assert.ok(!s.world.civ.news.some((n) => n.text.includes(b.name)), 'no second report of the loss');
});

test('a great people outweighs a lone city: the strength counts every city of a people near the front', () => {
  // Three cities of one people on a long island (the capital in the middle), one city of another people across a strait.
  const s = fixture([[39, 40, 58, 47], [62, 40, 69, 47]]);
  const { SE, world: w } = s;
  const tiles = [[41, 43], [49, 43], [56, 43], [65, 43]].map(([x, y]) => at(SE, x, y));
  const pops = [0.6, 0.7, 0.5, 0.45];
  tiles.forEach((i, n) => {
    w.tech[i] = SE.Tech.Stone;
    w.cityPop[i] = pops[n];
  });
  s.civ.sync(w, s.params);
  const [far, near, a, b] = tiles.map((i) => w.civ.cityAt(i));
  assert.ok(far.tribe === a.tribe && near.tribe === a.tribe);
  assert.notEqual(a.tribe, b.tribe);
  const unit = 1 + SE.CONFLICT_TECH_EDGE * SE.Tech.Stone;
  assert.ok(Math.abs(SE.conflictStrength(w, a.tribe, a, b) - (0.7 + 0.5) * unit) < 1e-6, 'the city far from the front does not count');
  assert.ok(Math.abs(SE.conflictStrength(w, b.tribe, a, b) - 0.45 * unit) < 1e-6);
  // City against city 0.5 : 0.45 would not reach CONFLICT_TAKE_RATIO; the people does.
  assert.ok(0.5 / 0.45 < SE.CONFLICT_TAKE_RATIO && 0.45 * (1 - SE.CONFLICT_LOSS) >= SE.CONFLICT_TAKE_POP);
  const k = SE.startConflict(w, a, b);
  assert.equal(SE.settleConflict(w, k, 0), 'taken');
  assert.equal(b.tribe, a.tribe);
  assert.ok(Math.abs(w.cityPop[near.tile] - 0.7) < 1e-6, 'only the two cities at war lose people');
});

test('atomic war needs two atomic peoples with four atomic cities and a warlike budget, and never falls in a war', () => {
  const s = fixture([[40, 40, 52, 47], [60, 40, 72, 47]]);
  const { SE, world: w, params } = s;
  for (const [x, y] of [[42, 43], [50, 43], [62, 43], [70, 43]]) {
    w.tech[at(SE, x, y)] = SE.Tech.Atomic;
    w.cityPop[at(SE, x, y)] = 0.6;
  }
  s.civ.sync(w, params);
  w.civ.calmUntil = 0;
  assert.equal(w.civ.tribes.length, 2);
  const sink = SE.civEventSink;
  const hits = [];
  SE.civEventSink = (kind, x, y) => hits.push({ kind, tile: at(SE, x, y) });
  /** Call the rule once per tick; each strike with the tick it fell on. */
  const strikes = (n) => {
    const out = [];
    for (let k = 0; k < n; k++) {
      w.ticks++;
      const st = SE.atomicWar(w, params);
      if (st) out.push({ ...st, tick: w.ticks, calm: w.civ.calmUntil, rest: [st.by.id, st.on.id].map((t) => w.civ.peace.get(SE.restKey(t))) });
    }
    return out;
  };
  try {
    assert.equal(strikes(20000).length, 0, 'never at the default budget');
    warlike(params);
    const war = strikes(20000);
    assert.ok(war.length >= 3, `${war.length} strikes`);
    for (const st of war) {
      assert.notEqual(st.by.id, st.on.id);
      assert.equal(st.target.tribe, st.on.id, 'the target belongs to the rival');
      assert.equal(st.calm, st.tick + SE.CONFLICT_GAP, 'a pause follows');
      assert.deepEqual(st.rest, [st.tick + SE.CONFLICT_TRIBE_REST, st.tick + SE.CONFLICT_TRIBE_REST], 'both peoples rest');
    }
    for (let n = 1; n < war.length; n++) assert.ok(war[n].tick - war[n - 1].tick >= SE.CONFLICT_TRIBE_REST);
    assert.equal(hits.length, war.length);
    assert.ok(hits.every((h) => h.kind === SE.EventKind.AtomicBomb && war.some((st) => st.target.tile === h.tile)));

    const [c0, c1, c2, c3] = w.civ.cities;
    SE.startConflict(w, c1, c2);
    assert.equal(strikes(20000).length, 0, 'never during a conventional war');
    w.civ.conflicts.length = 0;
    w.tech[c3.tile] = SE.Tech.Industrial;
    assert.equal(strikes(20000).length, 0, 'three atomic cities are not enough');
    w.tech[c3.tile] = SE.Tech.Atomic;
    for (const c of [c0, c1, c2, c3]) c.tribe = c0.tribe;
    assert.equal(strikes(20000).length, 0, 'one atomic people does not bomb itself');
  } finally {
    SE.civEventSink = sink;
  }

  // Through the tick: the warning names the target and both peoples.
  const t = fixture([[40, 40, 52, 47], [60, 40, 72, 47]]);
  warlike(t.params);
  for (const [x, y] of [[42, 43], [50, 43], [62, 43], [70, 43]]) {
    t.world.tech[at(SE, x, y)] = SE.Tech.Atomic;
    t.world.cityPop[at(SE, x, y)] = 0.6;
  }
  SE.civEventSink = () => {};
  try {
    run(t, 20000, () => t.civ.lastKind !== 'war');
  } finally {
    SE.civEventSink = sink;
  }
  assert.equal(t.civ.lastKind, 'war');
  const m = t.civ.lastNotice.match(/^Warnung: Atomschlag auf (.+)! Ein Krieg zwischen den (.+) und den (.+) zerstört Städte und Leben\.$/);
  assert.ok(m, t.civ.lastNotice);
  const names = t.world.civ.tribes.map((tr) => tr.name);
  assert.ok(m[2] !== m[3] && names.includes(m[2]) && names.includes(m[3]), 'names two peoples');
  assert.ok(t.world.civ.cities.some((c) => c.name === m[1]), 'names the target');
});

test('the same seed fights the same wars', () => {
  const play = () => {
    const s = islands(4, 2, 11);
    warlike(s.params);
    const log = watch(s, 1500);
    return {
      wars: log.map((e) => `${e.start}-${e.end}:${e.k.a}>${e.k.b}`).join(','),
      grid: [hash(s.world.tech), hash(s.world.cityPop)],
      tribes: s.world.civ.cities.map((c) => c.tribe).join(','),
      rng: s.world.rng.getState(),
    };
  };
  const first = play();
  assert.deepEqual(play(), first);
  assert.ok(first.wars.split(',').length >= 3);
});

test('the battle symbol keeps the art format and sits halfway, the short way round', () => {
  const SE = loadSE();
  for (const t of [SE.Tech.Stone, SE.Tech.Iron, SE.Tech.Industrial, SE.Tech.Nanotech]) {
    assert.deepEqual(artProblems(SE, SE.battleArt(t), `battle/${t}`), []);
  }
  assert.deepEqual(SE.battleArt(SE.Tech.Stone), SE.battleArt(SE.Tech.Iron));
  assert.notDeepEqual(SE.battleArt(SE.Tech.Iron), SE.battleArt(SE.Tech.Industrial), 'smoke from the industrial age on');
  assert.deepEqual(SE.battleArt(SE.Tech.Industrial), SE.battleArt(SE.Tech.Nanotech));
  assert.deepEqual(SE.battleSpot(at(SE, 10, 20), at(SE, 20, 30)), { x: 15, y: 25 });
  assert.deepEqual(SE.battleSpot(at(SE, 1, 20), at(SE, SE.GRID_W - 3, 20)), { x: SE.GRID_W - 1, y: 20 });
  assert.deepEqual(SE.battleSpot(at(SE, SE.GRID_W - 2, 20), at(SE, 2, 22)), { x: 0, y: 21 });
});

test('a new tech level and an atomic strike in the same tick are both reported', () => {
  const s = fixture([[40, 40, 52, 47], [60, 40, 72, 47]]);
  const { SE, world: w } = s;
  warlike(s.params);
  for (const [x, y] of [[42, 43], [50, 43], [62, 43], [70, 43]]) {
    w.tech[at(SE, x, y)] = SE.Tech.Atomic;
    w.cityPop[at(SE, x, y)] = 0.6;
  }
  const sink = SE.civEventSink;
  SE.civEventSink = () => {};
  try {
    run(s, 1);
    w.civ.calmUntil = 0;
    w.civ.topSince = -SE.TECH_MIN_AGE;
    // Every roll hits: the leading cities invent the next level and the bomb falls, both in one tick.
    w.rng.next = () => 0;
    run(s, 1);
  } finally {
    SE.civEventSink = sink;
  }
  assert.equal(s.civ.lastKind, 'tech', 'the new level keeps its chronicle entry');
  assert.equal(s.civ.lastTech, SE.Tech.Information);
  assert.ok(w.civ.news.some((n) => n.tone === 'warn' && n.text.startsWith('Warnung: Atomschlag')), 'the strike is still reported');
});

test('peoples whose last city fell are gone before a new city takes a colour', () => {
  const s = islands(4, 2, 5);
  const { SE, world: w } = s;
  run(s, 1);
  assert.equal(w.civ.tribes.length, SE.TRIBE_MAX);
  const first = w.civ.cities[0].tile;
  for (const c of w.civ.cities) { w.tech[c.tile] = 0; w.cityPop[c.tile] = 0; }
  run(s, 1);
  assert.equal(w.civ.cities.length, 0);
  w.tech[first] = SE.Tech.Stone;
  w.cityPop[first] = 0.3;
  s.civ.sync(w, s.params);
  const t = w.civ.tribe(w.civ.cityAt(first).tribe);
  assert.ok(t && t.color < SE.TRIBE_MAX, `colour ${t && t.color}`);
});
