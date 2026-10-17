'use strict';
/*
 * Meteor and atomic strike (docs/ereignisse-spec.md §3.2, §3.7): a meteor
 * sinks only its own tile into a crater, scorches ring 1 and a hashed half
 * of ring 2 and leaves everything further out untouched; at sea it only
 * harms sea life. An atomic strike leaves ash at ground zero, fallout that
 * reaches further downwind than upwind and outlasts 150 ticks, life there
 * dying for 20 ticks, and a fire ring that goes out by itself. Both are
 * deterministic; the show strikes as the omen ends and keeps its flashes
 * out of reduced effects.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSim } = require('./helpers');

/** A land tile with land all round within r. */
function inlandTile(SE, w, r = 7) {
  for (let y = 30; y < SE.GRID_H - 30; y += 2) {
    for (let x = 0; x < SE.GRID_W; x += 3) {
      const e = w.elevation[SE.idx(x, y)];
      if (e < 0.15 || e > 0.45) continue;
      let ok = true;
      for (let dy = -r; dy <= r && ok; dy++) {
        for (let dx = -r; dx <= r; dx++) if (w.elevation[SE.idx(SE.wrapX(x + dx), y + dy)] < 0) { ok = false; break; }
      }
      if (ok) return [x, y];
    }
  }
  throw new Error('no inland tile');
}

/** A deep-sea tile with water all round within 3. */
function seaTile(SE, w) {
  for (let y = 30; y < SE.GRID_H - 30; y += 2) {
    for (let x = 0; x < SE.GRID_W; x += 3) {
      let ok = true;
      for (let dy = -3; dy <= 3 && ok; dy++) {
        for (let dx = -3; dx <= 3; dx++) if (w.elevation[SE.idx(SE.wrapX(x + dx), y + dy)] > -0.1) { ok = false; break; }
      }
      if (ok) return [x, y];
    }
  }
  throw new Error('no sea tile');
}

/** Every tile within r of (x, y) with its distance. */
function around(SE, x, y, r) {
  const out = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) out.push({ i: SE.idx(SE.wrapX(x + dx), y + dy), d: Math.max(Math.abs(dx), Math.abs(dy)), dx, dy });
  }
  return out;
}

/** Shortest x offset from x0 to x1 on the wrapping map. */
function wrapDx(SE, x0, x1) {
  let dx = x1 - x0;
  if (dx > SE.GRID_W / 2) dx -= SE.GRID_W;
  if (dx < -SE.GRID_W / 2) dx += SE.GRID_W;
  return dx;
}

/** Plants, animals and a city on every tile within r, so the strike has something to hit. */
function populate(SE, w, x, y, r) {
  for (const { i } of around(SE, x, y, r)) {
    w.lifeDensity[i * SE.LIFE_COUNT + 1] = 1;
    w.lifeStage[i * SE.LIFE_COUNT + 1] = 1;
    if (w.elevation[i] < 0) continue;
    w.vegetation[i] = 0.8;
    w.flora[i] |= (1 << SE.Flora.Grasses) | (1 << SE.Flora.Broadleaf);
    w.landscape[i] = SE.Landscape.Forest;
    w.tech[i] = SE.Tech.Iron;
    w.cityPop[i] = 1;
  }
}

/** The per-tile state a strike may change. */
function snapshot(w) {
  return {
    elevation: Float32Array.from(w.elevation),
    vegetation: Float32Array.from(w.vegetation),
    flora: Uint16Array.from(w.flora),
    landscape: Uint8Array.from(w.landscape),
    life: Float32Array.from(w.lifeDensity),
    tech: Uint8Array.from(w.tech),
    cityPop: Float32Array.from(w.cityPop),
    scar: Uint8Array.from(w.hazards.scar),
  };
}

function changedAt(SE, a, b, i) {
  for (const key of ['elevation', 'vegetation', 'flora', 'landscape', 'tech', 'cityPop', 'scar']) if (a[key][i] !== b[key][i]) return key;
  for (let c = 0; c < SE.LIFE_COUNT; c++) if (a.life[i * SE.LIFE_COUNT + c] !== b.life[i * SE.LIFE_COUNT + c]) return 'life';
  return null;
}

test('a meteor makes a crater on its tile, scorches only within 2 and changes nothing further out', () => {
  const { SE, world: w } = makeSim(777, 'today');
  const hz = new SE.HazardSystem();
  const [x, y] = inlandTile(SE, w);
  populate(SE, w, x, y, 4);
  const before = snapshot(w);
  const dust = w.dust;
  const h = hz.start(w, SE.EventKind.Meteor, x, y, 'player');
  assert.ok(h, 'started');
  const target = SE.idx(x, y);
  assert.equal(w.hazards.scar[target], SE.ScarKind.Crater, 'a crater on the target');
  assert.ok(Math.abs(before.elevation[target] - w.elevation[target] - SE.METEOR_CRATER_DEPTH) < 1e-6, 'the crater is sunk');
  assert.equal(w.landscape[target], SE.Landscape.Rock);
  assert.equal(w.soil[target], 0, 'fresh rock');
  assert.equal(w.vegetation[target], 0);
  assert.equal(w.tech[target], SE.Tech.None, 'the city on the target is gone');
  assert.ok(w.dust > dust, 'dust in the atmosphere (K6)');

  let ring2Scorched = 0;
  let ring2 = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    const c = SE.hazardDistance(x, y, i % SE.GRID_W, Math.floor(i / SE.GRID_W));
    const d = c > 2 ? c : SE.impactRing(w, h, wrapDx(SE, x, i % SE.GRID_W), Math.floor(i / SE.GRID_W) - y);
    const what = changedAt(SE, before, snapshot(w), i);
    if (d > 2) {
      assert.equal(what, null, `tile ${d} away changed its ${what}`);
      continue;
    }
    if (d > 0) assert.ok(Math.abs(w.elevation[i] - before.elevation[i]) < 1e-9, 'only the target sinks');
    if (d === 1) {
      assert.equal(w.hazards.scar[i], SE.ScarKind.Ruins, 'a destroyed city in ring 1 leaves ruins');
      assert.equal(w.tech[i], SE.Tech.None);
      assert.ok(Math.abs(w.vegetation[i] - 0.8 * SE.METEOR_RING1_KEEP) < 1e-6, 'ring 1 keeps a fifth of its plant cover');
      assert.equal(w.flora[i] & SE.WOODY_FLORA_MASK, 0, 'no woodland left in ring 1');
      assert.ok(Math.abs(w.lifeDensity[i * SE.LIFE_COUNT + 1] - (1 - SE.METEOR_RING1_KILL)) < 1e-6);
    }
    if (d === 2) {
      ring2++;
      assert.notEqual(w.tech[i], SE.Tech.None, 'a city in ring 2 survives');
      assert.ok(Math.abs(w.cityPop[i] - (1 - SE.METEOR_RING2_CITY_LOSS)) < 1e-6, 'and loses half its people');
      if (w.hazards.scar[i] === SE.ScarKind.Scorched) {
        ring2Scorched++;
        assert.ok(Math.abs(w.vegetation[i] - 0.8 * SE.METEOR_RING2_KEEP) < 1e-6);
      } else {
        assert.equal(w.hazards.scar[i], 0);
        assert.equal(w.vegetation[i], before.vegetation[i], 'an unscorched tile in ring 2 keeps its plants');
      }
    }
  }
  assert.ok(ring2Scorched >= 3 && ring2Scorched <= ring2 - 3, `${ring2Scorched}/${ring2} ring-2 tiles scorched, about half`);
  hz.step(w);
  assert.equal(w.hazards.list.length, 0, 'a meteor is over after its first tick');
});

test('a meteor at sea harms sea life in ring 1 and leaves no crater or scar', () => {
  const { SE, world: w } = makeSim(777, 'today');
  const hz = new SE.HazardSystem();
  const [x, y] = seaTile(SE, w);
  populate(SE, w, x, y, 3);
  const before = snapshot(w);
  assert.ok(hz.start(w, SE.EventKind.Meteor, x, y, 'player'));
  for (const { i, d } of around(SE, x, y, 3)) {
    assert.equal(w.hazards.scar[i], 0, 'no scar at sea');
    assert.equal(w.elevation[i], before.elevation[i], 'no crater at sea');
    const life = w.lifeDensity[i * SE.LIFE_COUNT + 1];
    if (d <= 1) assert.ok(Math.abs(life - (1 - SE.METEOR_SEA_KILL)) < 1e-6, 'sea life in ring 1 is hit');
    else assert.equal(life, 1, 'sea life further out is not');
  }
  assert.equal(w.hazards.scar.reduce((n, s) => n + (s !== 0), 0), 0);
});

test('an atomic strike leaves ash at ground zero, a fire ring that goes out and fallout that drifts downwind', () => {
  const { SE, world: w } = makeSim(4242, 'today');
  const hz = new SE.HazardSystem();
  const [x, y] = inlandTile(SE, w, 8);
  populate(SE, w, x, y, 7);
  const h = hz.start(w, SE.EventKind.AtomicBomb, x, y, 'player');
  assert.ok(h, 'started');
  const hzs = w.hazards;
  const zone0 = new Set(h.impact.fallout);
  let ring2 = 0;
  for (const { i, dx, dy } of around(SE, x, y, 2)) {
    const d = SE.atomicRing(w, h, dx, dy);
    if (d > 2) continue;
    assert.equal(w.tech[i], SE.Tech.None, `the city ${d} away is destroyed`);
    if (d <= 1) {
      assert.equal(hzs.scar[i], SE.ScarKind.Ash, 'ash within ring 1');
      if (zone0.has(i)) assert.equal(hzs.scarNext[i], SE.ScarKind.Fallout, 'the fallout waits under the ash');
      assert.equal(w.vegetation[i], 0);
      assert.equal(w.lifeDensity[i * SE.LIFE_COUNT + 1], 0, 'no life left at ground zero');
    } else {
      ring2++;
      assert.equal(hzs.scar[i], SE.ScarKind.Ruins, 'its ruins stand in ring 2');
      assert.equal(hzs.tile[i], SE.HazardTile.Burning, 'ring 2 burns where there is fuel');
      assert.ok(Math.abs(w.lifeDensity[i * SE.LIFE_COUNT + 1] - (1 - SE.ATOMIC_RING2_KILL)) < 1e-6);
    }
  }
  assert.equal(h.impact.fires.length, ring2, 'every ring-2 tile with fuel burns');
  assert.ok(ring2 >= 8 && ring2 <= 20, `${ring2} tiles in ring 2: a ragged ring, not the 16 of a square`);

  // Fallout: further downwind than upwind, never further than the ring plus the plume.
  const wind = SE.ClimateSystem.airCurrent(y);
  let down = 0;
  let up = 0;
  const zone = new Set(h.impact.fallout);
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    const tx = i % SE.GRID_W;
    const ty = Math.floor(i / SE.GRID_W);
    const d = SE.hazardDistance(x, y, tx, ty);
    if (hzs.scar[i] === SE.ScarKind.Fallout) assert.ok(zone.has(i), 'fallout only in the zone');
    if (!zone.has(i)) continue;
    assert.ok(d <= SE.ATOMIC_FALLOUT_RADIUS + SE.ATOMIC_PLUME, `fallout ${d} tiles away`);
    let dx = tx - x;
    if (dx > SE.GRID_W / 2) dx -= SE.GRID_W;
    if (dx < -SE.GRID_W / 2) dx += SE.GRID_W;
    const along = dx * wind.dx + (ty - y) * wind.dy;
    down = Math.max(down, along);
    up = Math.max(up, -along);
  }
  assert.ok(down > up, `fallout reaches ${down} downwind and ${up} upwind`);
  for (const { i, d } of around(SE, x, y, 3)) if (d === 3 && zone.has(i)) assert.equal(hzs.scar[i], SE.ScarKind.Fallout, 'ring 3 carries the fallout film');

  // Life in the zone keeps dying for 20 ticks; the fires go out after two.
  const watch = h.impact.fallout.filter((i) => SE.hazardDistance(x, y, i % SE.GRID_W, Math.floor(i / SE.GRID_W)) === 3);
  const lifeAt = () => watch.reduce((s, i) => s + w.lifeDensity[i * SE.LIFE_COUNT + 1], 0);
  let last = lifeAt();
  for (let t = 1; t <= SE.ATOMIC_FALLOUT_TICKS; t++) {
    hz.step(w);
    const now = lifeAt();
    assert.ok(now < last, `life on the fallout falls at tick ${t}`);
    last = now;
    if (t === SE.ATOMIC_FIRE_TICKS) {
      for (const i of h.impact.fires) assert.equal(hzs.tile[i], SE.HazardTile.None, 'the fire ring is out');
    }
  }
  assert.equal(hzs.list.length, 0, 'the strike is over after 20 ticks');
  hz.step(w);
  assert.equal(lifeAt(), last, 'then the fallout no longer kills');
  for (const i of watch) assert.ok(Math.abs(w.lifeDensity[i * SE.LIFE_COUNT + 1] - (1 - SE.ATOMIC_FALLOUT_TICKS * SE.ATOMIC_FALLOUT_KILL)) < 1e-4);
});

test('fallout outlasts 150 ticks, then fades tile by tile', { timeout: 120000 }, () => {
  const { SE, world: w } = makeSim(4242, 'today');
  const hz = new SE.HazardSystem();
  const [x, y] = inlandTile(SE, w, 8);
  const h = hz.start(w, SE.EventKind.AtomicBomb, x, y, 'player');
  const fallout = h.impact.fallout.filter((i) => w.hazards.scar[i] === SE.ScarKind.Fallout);
  assert.ok(fallout.length > 10, `${fallout.length} fallout tiles`);
  const min = SE.SCAR_MIN_TICKS[SE.ScarKind.Fallout];
  for (let t = 0; t < min; t++) hz.step(w);
  for (const i of fallout) assert.equal(w.hazards.scar[i], SE.ScarKind.Fallout, `still fallout after ${min} ticks`);
  for (let t = 0; t < 60; t++) hz.step(w);
  const left = fallout.filter((i) => w.hazards.scar[i] === SE.ScarKind.Fallout).length;
  assert.equal(left, 0, `${left} fallout tiles left after ${min + 60} ticks`);
});

test('meteor and atomic strike are deterministic', () => {
  const runOnce = () => {
    const { SE, world: w } = makeSim(31337, 'today');
    const hz = new SE.HazardSystem();
    const [x, y] = inlandTile(SE, w, 8);
    populate(SE, w, x, y, 7);
    hz.start(w, SE.EventKind.Meteor, x, y, 'player');
    hz.start(w, SE.EventKind.AtomicBomb, x + 12, y, 'player');
    for (let t = 0; t < 25; t++) hz.step(w);
    return snapshot(w);
  };
  const a = runOnce();
  const b = runOnce();
  for (const key of Object.keys(a)) assert.deepEqual(Array.from(a[key]), Array.from(b[key]), key);
});

test('the meteor strikes as its omen ends; flashes stay out of reduced effects', () => {
  const { SE, world: w } = makeSim(4242, 'today');
  const hz = new SE.HazardSystem();
  const [x, y] = inlandTile(SE, w);
  const cam = { scrollX: x - 10, scrollY: y - 6, tilePx: 32, dpr: 1 };
  const play = (kind, reduce) => {
    const show = new SE.FxShow();
    show.reduce = reduce;
    const particles = new SE.FxParticles();
    show.build(w, cam, 20, 12, 0, 0, particles);
    let started = null;
    show.stage(w, kind, x, y, () => (started = hz.start(w, kind, x, y, 'player')));
    const t0 = performance.now();
    const omenMs = SE.HAZARD_OMEN_MS[kind];
    const omen = show.build(w, cam, 20, 12, t0 + 100, 0.1, particles);
    assert.equal(started, null, 'nothing has happened during the omen');
    const late = show.build(w, cam, 20, 12, t0 + omenMs - 100, 0.1, particles);
    const hit = show.build(w, cam, 20, 12, t0 + omenMs + 1, 0.016, particles);
    assert.ok(started, 'the strike starts as the omen ends');
    const mid = show.build(w, cam, 20, 12, t0 + omenMs + 1500, 0.1, particles);
    for (const h of w.hazards.list) SE.HAZARD_RULES[h.kind].finish(w, h);
    w.hazards.list.length = 0;
    return { omen, late, hit, mid };
  };
  for (const reduce of [false, true]) {
    const m = play(SE.EventKind.Meteor, reduce);
    assert.ok(m.omen.rings.some((r) => r.ground), 'a shadow grows on the ground');
    assert.ok(m.late.tops.some((d) => d.id === 'meteor_streak'), 'the streak flies in at the end of the omen');
    const flash = m.hit.tops.filter((d) => d.id === 'flash');
    assert.equal(flash.length, 1, 'one flash at the impact');
    assert.equal(flash[0].frame === 2, reduce, reduce ? 'the calm fireball with reduced effects' : 'the white flash');
    assert.ok(m.hit.rings.some((r) => !r.ground), 'a shock ring');
    assert.ok(m.mid.tops.some((d) => d.id === 'dust_cloud'), 'the dust cloud stands');
    assert.equal(m.hit.shakes.length > 0, !reduce, 'the ground trembles unless effects are reduced');

    const a = play(SE.EventKind.AtomicBomb, reduce);
    assert.equal(a.hit.tops.filter((d) => d.id === 'flash' && d.frame < 2).length, reduce ? 0 : 1);
    assert.ok(a.mid.objects.some((d) => d.id === 'mushroom'), 'the mushroom cloud rises');
  }
});

test('ground zero of an atomic strike is round: a plus of ash with at most two corners', () => {
  const corners = [];
  for (const seed of [4242, 777, 31337, 12345, 2024, 99]) {
    const { SE, world: w } = makeSim(seed, 'today');
    const hz = new SE.HazardSystem();
    const [x, y] = inlandTile(SE, w, 8);
    const h = hz.start(w, SE.EventKind.AtomicBomb, x, y, 'player');
    assert.ok(h, 'started');
    const ash = (dx, dy) => w.hazards.scar[SE.idx(SE.wrapX(x + dx), y + dy)] === SE.ScarKind.Ash;
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) assert.ok(ash(dx, dy), `ash at ${dx},${dy}`);
    let kept = 0;
    for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      assert.equal(SE.atomicRing(w, h, dx, dy) <= 1, ash(dx, dy), 'atomicRing says which corners are ash');
      if (ash(dx, dy)) kept++;
      else assert.equal(w.hazards.scar[SE.idx(SE.wrapX(x + dx), y + dy)], SE.ScarKind.Scorched, 'a corner left out is scorched like ring 2');
    }
    assert.ok(kept <= SE.ATOMIC_ASH_CORNERS, `${kept} ash corners`);
    corners.push(kept);
    for (const { i, d } of around(SE, x, y, 4)) {
      if (d > 1) assert.notEqual(w.hazards.scar[i], SE.ScarKind.Ash, `no ash ${d} tiles away`);
      if (d > 2) assert.ok(w.hazards.scar[i] === 0 || w.hazards.scar[i] === SE.ScarKind.Fallout, `nothing but fallout ${d} tiles away`);
    }
  }
  assert.ok(new Set(corners).size > 1, `the ash corners vary from strike to strike: ${corners}`);
});

test('a meteor at sea throws up a water fountain with spray and steam, and no dust cloud', () => {
  const { SE, world: w } = makeSim(777, 'today');
  const hz = new SE.HazardSystem();
  const [x, y] = seaTile(SE, w);
  const cam = { scrollX: x - 10, scrollY: y - 6, tilePx: 32, dpr: 1 };
  const show = new SE.FxShow();
  const particles = new SE.FxParticles();
  let sprayed = 0;
  const spawn = particles.spawn.bind(particles);
  particles.spawn = (...a) => { sprayed++; spawn(...a); };
  show.build(w, cam, 20, 12, 0, 0, particles);
  let started = null;
  show.stage(w, SE.EventKind.Meteor, x, y, () => (started = hz.start(w, SE.EventKind.Meteor, x, y, 'player')));
  const t0 = performance.now() + SE.HAZARD_OMEN_MS[SE.EventKind.Meteor];
  const frames = [];
  for (let t = 1; t <= 2400; t += 100) frames.push(show.build(w, cam, 20, 12, t0 + t, 0.1, particles));
  assert.ok(started, 'the meteor struck');
  const all = (pick) => frames.flatMap(pick);
  const fountain = all((s) => s.objects.filter((d) => d.id === 'water_fountain'));
  assert.ok(fountain.length >= 6, `the fountain stands for ${fountain.length} frames`);
  const shown = new Set(fountain.map((d) => d.frame));
  const n = SE.FX_MANIFEST.sprites.water_fountain.frames.length;
  for (let f = 0; f < n; f++) assert.ok(shown.has(f), `fountain frame ${f} plays`);
  for (const d of fountain) assert.equal(d.foot, y * 16 + 15, 'it stands on the tile');
  assert.ok(all((s) => s.tops).some((d) => d.id === 'steam_puff'), 'steam rises');
  assert.ok(all((s) => s.rings).some((r) => r.ground), 'splash rings spread over the water');
  assert.ok(sprayed >= 40, `${sprayed} drops of spray fly`);
  assert.equal(all((s) => [...s.tops, ...s.objects]).filter((d) => d.id === 'dust_cloud').length, 0, 'no dust cloud at sea');
});

test('zoomed out to 10 px per tile, the meteor shadow stays a dithered disc of spaced rings', () => {
  const { SE, world: w } = makeSim(4242, 'today');
  const [x, y] = inlandTile(SE, w);
  for (const [tilePx, gap] of [[10, 2], [32, 1]]) {
    const cam = { scrollX: x - 10, scrollY: y - 6, tilePx, dpr: 1 };
    const show = new SE.FxShow();
    const particles = new SE.FxParticles();
    show.build(w, cam, 20, 12, 0, 0, particles);
    show.stage(w, SE.EventKind.Meteor, x, y, () => null);
    const t0 = performance.now();
    const late = show.build(w, cam, 20, 12, t0 + SE.HAZARD_OMEN_MS[SE.EventKind.Meteor] - 200, 0.1, particles);
    const radii = late.rings.filter((r) => r.ground).map((r) => r.r).sort((a, b) => a - b);
    assert.ok(radii.length >= 2, `${radii.length} shadow rings at ${tilePx} px`);
    const px = (tilePx * cam.dpr) / 16;
    for (let k = 1; k < radii.length; k++) {
      assert.ok((radii[k] - radii[k - 1]) * px >= gap, `rings ${radii[k - 1]} and ${radii[k]} lie ${(radii[k] - radii[k - 1]) * px} device px apart at ${tilePx} px`);
    }
  }
});

test('an atomic strike sets no fire on ground another hazard holds, such as standing flood water', () => {
  const { SE, world: w } = makeSim(4242, 'today');
  const hz = new SE.HazardSystem();
  const [x, y] = inlandTile(SE, w, 8);
  for (const { i } of around(SE, x, y, 2)) {
    w.vegetation[i] = 0.8;
    w.hazards.tile[i] = SE.HazardTile.Flood;
    w.hazards.level[i] = 50;
  }
  const h = hz.start(w, SE.EventKind.AtomicBomb, x, y, 'player');
  assert.equal(h.impact.fires.length, 0, 'nothing under water catches fire');
  for (const { i } of around(SE, x, y, 2)) assert.notEqual(w.hazards.tile[i], SE.HazardTile.Burning);
});
