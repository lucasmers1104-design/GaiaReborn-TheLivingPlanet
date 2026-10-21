'use strict';
/*
 * The space project (src/spaceport.ts): unlocked once by the first Nanotech
 * city, a launch site in the desert that overwrites nothing, progress that
 * pauses and resumes with the Nanotech cities, a site that moves when it is
 * wrecked, one launch only, and the `space` field of save format 10.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE, makeSim } = require('./helpers');

const SE = loadSE();
const ctx = (s) => ({ world: s.world, params: s.params, geo: s.geo, history: s.history });

/** A flat steppe continent with a desert patch and one Nanotech city of a sentient species. */
function planet(species = SE.Life.Mammal) {
  const s = makeSim(4242);
  const w = s.world;
  w.elevation.fill(-0.3);
  for (let y = 20; y < 100; y++) {
    for (let x = 10; x < 150; x++) {
      const i = SE.idx(x, y);
      w.elevation[i] = 0.1;
      w.landscape[i] = SE.Landscape.Steppe;
      w.substrate[i] = SE.Substrate.Soil;
    }
  }
  for (let y = 60; y < 70; y++) for (let x = 60; x < 80; x++) w.landscape[SE.idx(x, y)] = SE.Landscape.Desert;
  w.riverLevel.fill(0);
  w.sentientClass = species;
  const city = SE.idx(40, 50);
  w.tech[city] = SE.Tech.Nanotech;
  w.cityPop[city] = 0.8;
  s.civ.sync(w, s.params);
  return { s, w, city };
}

function step(w, n = 1) {
  for (let k = 0; k < n; k++) {
    w.civ.news.length = 0;
    SE.stepSpaceport(w);
    w.ticks++;
  }
}

const isDesert = (w, i) => w.landscape[i] === SE.Landscape.Desert;

test('the first Nanotech city unlocks the project once, for any sentient species, with a chronicle entry', () => {
  for (const species of [SE.Life.Mammal, SE.Life.Insect]) {
    const { w } = planet(species);
    assert.equal(SE.spacePause(w), 'locked');
    w.civ.news.length = 0;
    SE.stepSpaceport(w);
    assert.ok(w.space.unlocked >= 0, 'unlocked');
    const entries = w.civ.news.filter((n) => n.chronicle && n.chronicle.key === SE.SPACE_KEY_UNLOCKED);
    assert.equal(entries.length, 1, 'one chronicle entry');
    assert.ok(w.civ.news.every((n) => n.space), 'all its news belong to the project');
    const at = w.space.unlocked;
    step(w, 5);
    assert.equal(w.space.unlocked, at, 'never unlocked twice');
    assert.equal(w.civ.news.filter((n) => n.chronicle && n.chronicle.key === SE.SPACE_KEY_UNLOCKED).length, 0);
  }
});

test('no project without an inhabited Nanotech city', () => {
  const { s, w, city } = planet();
  w.tech[city] = SE.Tech.Information;
  s.civ.sync(w, s.params);
  step(w, 10);
  assert.equal(w.space.unlocked, -1);
  assert.equal(w.space.site, -1);
});

test('the site lies in the desert nearest the city and overwrites nothing', () => {
  const { w, city } = planet();
  const tech = w.tech.slice();
  const land = w.landscape.slice();
  const elev = w.elevation.slice();
  step(w);
  const site = w.space.site;
  assert.ok(site >= 0, 'a site is found');
  assert.ok(isDesert(w, site), 'in the desert');
  assert.equal(site, SE.idx(60, 60), 'the desert tile nearest the city');
  assert.ok(SE.spaceSiteFits(w, site));
  assert.deepEqual(w.tech, tech, 'no city written or removed');
  assert.deepEqual(w.landscape, land, 'no landscape changed');
  assert.deepEqual(w.elevation, elev, 'no ground changed');
  assert.equal(w.tech[city], SE.Tech.Nanotech);
  // Settlers and players found no city on or right beside it.
  assert.equal(SE.citySiteAllowed(w, site), false);
  assert.equal(SE.citySiteAllowed(w, SE.idx(61, 59)), false, 'not under the rocket');
  const beside = SE.idx(59, 61);
  w.temperature[beside] = 15;
  assert.match(SE.citySiteProblem(w, beside, SE.Life.Mammal), /Raumhafen/);
});

test('progress goes on with a Nanotech city, pauses without one and resumes', () => {
  const { s, w, city } = planet();
  step(w, 50);
  const p = w.space.progress;
  assert.ok(p > 0 && p < 1, `progress ${p}`);
  const rate = SE.spaceRate(w);
  assert.ok(rate >= SE.SPACE_RATE_MIN && rate <= SE.SPACE_RATE_MAX, `rate ${rate}`);
  w.tech[city] = SE.Tech.Information;
  s.civ.sync(w, s.params);
  step(w, 30);
  assert.equal(w.space.progress, p, 'paused');
  assert.equal(SE.spacePause(w), 'noCity');
  assert.equal(SE.spaceTicksLeft(w), Infinity);
  w.tech[city] = SE.Tech.Nanotech;
  s.civ.sync(w, s.params);
  step(w);
  assert.ok(w.space.progress > p, 'resumed');
  assert.equal(SE.spacePause(w), '');
});

test('the build time is about SPACE_BUILD_TICKS and every phase is announced once', () => {
  const { w } = planet();
  const phases = [];
  let ticks = 0;
  while (w.space.progress < 1 && ticks < SE.SPACE_BUILD_TICKS * 2) {
    step(w);
    ticks++;
    for (const n of w.civ.news) phases.push(n.text);
  }
  assert.ok(w.space.progress >= 1, 'ready');
  assert.ok(ticks >= SE.SPACE_BUILD_TICKS / SE.SPACE_RATE_MAX && ticks <= SE.SPACE_BUILD_TICKS / SE.SPACE_RATE_MIN + 2, `${ticks} ticks`);
  assert.equal(SE.spacePhase(w.space.progress), 3, 'the ready phase');
  // Unlock, pad, stage, rocket, ready: five news, no repeats.
  assert.equal(phases.length, 5, phases.join(' | '));
  step(w, 20);
  assert.equal(w.civ.news.length, 0, 'a ready rocket is quiet');
});

test('a wrecked site moves to another desert tile and falls back to the start of its phase', () => {
  const { w } = planet();
  while (w.space.progress < 0.5) step(w);
  const old = w.space.site;
  const before = w.space.progress;
  w.hazards.tile[old] = SE.HazardTile.Lava;
  const tech = w.tech.slice();
  step(w);
  assert.notEqual(w.space.site, old, 'moved');
  assert.ok(w.space.site >= 0 && isDesert(w, w.space.site) && SE.spaceSiteFits(w, w.space.site));
  assert.equal(w.space.moves, 1);
  assert.ok(Math.abs(w.space.progress - SE.SPACE_PHASE_AT[1]) < 2 / SE.SPACE_BUILD_TICKS, `back to the stage's start, from ${before} to ${w.space.progress}`);
  assert.deepEqual(w.tech, tech, 'the move overwrites no city');
});

test('a city on the pad or the sea over it moves the site, never the city', () => {
  const { s, w } = planet();
  step(w);
  const old = w.space.site;
  w.tech[old] = SE.Tech.Stone;
  w.cityPop[old] = 0.3;
  s.civ.sync(w, s.params);
  step(w);
  assert.notEqual(w.space.site, old);
  assert.equal(w.tech[old], SE.Tech.Stone, 'the city stays');
  const next = w.space.site;
  w.elevation[next] = -0.2;
  step(w);
  assert.notEqual(w.space.site, next, 'flooded: moved again');
  assert.equal(w.space.moves, 2);
});

test('the oil derrick and the pad never share ground', () => {
  const { w } = planet();
  w.oilRigLand = SE.idx(60, 60);
  step(w);
  assert.ok(w.space.site >= 0 && SE.tileDistance(w.space.site, w.oilRigLand) >= SE.SPACE_CITY_GAP, 'the pad keeps off the derrick');
  // A derrick placed later (a civilization raised to Nanotech at once) keeps off the pad.
  w.oilRigLand = -1;
  w.oilRigSea = -1;
  SE.placeOilRigs(w);
  assert.ok(w.oilRigLand < 0 || SE.tileDistance(w.space.site, w.oilRigLand) >= SE.SPACE_CITY_GAP);
  assert.ok(SE.spaceSiteFits(w, w.space.site));
});

test('without a free site the build rests and searches again later; without desert it takes dry open land', () => {
  const { w } = planet();
  for (let i = 0; i < SE.TILE_COUNT; i++) if (w.elevation[i] >= 0) w.landscape[i] = SE.Landscape.Forest;
  step(w);
  assert.equal(w.space.site, -1);
  assert.equal(SE.spacePause(w), 'noSite');
  const retry = w.space.retryAt;
  assert.equal(retry, w.ticks - 1 + SE.SPACE_SITE_RETRY);
  w.landscape[SE.idx(90, 40)] = SE.Landscape.Steppe;
  step(w, 3);
  assert.equal(w.space.site, -1, 'not before the retry');
  while (w.ticks <= retry) step(w);
  assert.equal(w.space.site, SE.idx(90, 40), 'found on the next search');
  assert.equal(w.space.progress > 0, true);
});

test('the rocket launches once, only when ready, and no second one is built', () => {
  const { w } = planet();
  step(w, 10);
  assert.ok(SE.spaceLaunchProblem(w), 'not ready yet');
  assert.equal(SE.commitLaunch(w), false);
  while (w.space.progress < 1) step(w);
  assert.equal(SE.spaceLaunchProblem(w), '');
  assert.equal(SE.commitLaunch(w), true);
  assert.equal(SE.commitLaunch(w), false, 'a double click launches nothing');
  const launched = w.space.launched;
  step(w, 50);
  assert.equal(w.space.launched, launched);
  assert.equal(w.space.progress, 1);
  assert.equal(SE.spacePause(w), 'launched');
  assert.equal(w.civ.news.length, 0);
});

test('save format 10 keeps the project; older formats start without one; damage is refused', () => {
  const { s: a, w } = planet();
  step(w, 120);
  const doc = SE.SaveSystem.serialize(ctx(a));
  assert.equal(doc.version, 10);
  const b = makeSim(1);
  SE.SaveSystem.load(JSON.parse(JSON.stringify(doc)), ctx(b), b.life, b.flora);
  for (const k of ['unlocked', 'site', 'progress', 'launched', 'announced', 'retryAt', 'moves']) assert.equal(b.world.space[k], w.space[k], k);

  const old = JSON.parse(JSON.stringify(doc));
  old.version = 9;
  delete old.space;
  const c = makeSim(1);
  SE.SaveSystem.load(old, ctx(c), c.life, c.flora);
  assert.equal(c.world.space.unlocked, -1, 'a format-9 planet has no project yet');
  // Its Nanotech city opens it on the first tick.
  c.civ.sync(c.world, c.params);
  c.world.civ.news.length = 0;
  SE.stepSpaceport(c.world);
  assert.ok(c.world.space.unlocked >= 0);

  for (const bad of [{ progress: 2 }, { site: -5 }, { launched: 0, progress: 0.5 }, { unlocked: w.ticks + 10 }, null]) {
    const d = JSON.parse(JSON.stringify(doc));
    d.space = bad === null ? undefined : { ...d.space, ...bad };
    assert.throws(() => SE.SaveSystem.load(d, ctx(c), c.life, c.flora), (e) => e instanceof SE.SaveCorrupt, JSON.stringify(bad));
  }
  // A new planet starts without project data.
  b.world.reset(99);
  assert.equal(b.world.space.unlocked, -1);
  assert.equal(b.world.space.site, -1);
  assert.equal(b.world.space.launched, -1);
});
