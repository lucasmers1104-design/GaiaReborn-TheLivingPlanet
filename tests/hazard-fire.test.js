'use strict';
/*
 * Wildfire (docs/ereignisse-spec.md §3.3): it starts on one vegetated tile,
 * spreads tile by tile with fuel, dryness and wind, stops at water, rivers,
 * bare ground and rock, never burns a city, keeps to its caps, leaves burnt
 * earth without trees that holds the tile bare for SCAR_MIN_TICKS before
 * succession grows it back, and runs the same way every time. On screen
 * the burning tiles carry flames and a capped number of smoke plumes.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSim, loadSE } = require('./helpers');

const SE0 = loadSE();
const WOODY = (1 << SE0.Flora.Conifers) | (1 << SE0.Flora.Broadleaf);

/** Uniform woodland over the rectangle; the lifeless planet around it carries nothing that burns. */
function forest(SE, w, x0, y0, x1, y1, { moisture = 0, temp = 30, veg = 0.9 } = {}) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = SE.idx(SE.wrapX(x), y);
      w.elevation[i] = 0.2;
      w.vegetation[i] = veg;
      w.flora[i] = WOODY;
      w.landscape[i] = SE.Landscape.Forest;
      w.moisture[i] = moisture;
      w.temperature[i] = temp;
      w.riverLevel[i] = 0;
      w.tech[i] = SE.Tech.None;
      w.cityPop[i] = 0;
      w.soil[i] = 220;
    }
  }
}

/** Run the hazards until every fire is out; the number of ticks it took. */
function burn(hz, w, limit = 100) {
  let t = 0;
  while (w.hazards.list.length > 0 && t < limit) { hz.step(w); t++; }
  return t;
}

function burnt(SE, w) {
  const out = [];
  for (let i = 0; i < SE.TILE_COUNT; i++) if (w.hazards.scar[i] === SE.ScarKind.Burnt) out.push(i);
  return out;
}

const X = 100;
const Y = 40;

test('fire never crosses water, a river, rock or bare ground', () => {
  const barriers = {
    water: (SE, w, i) => { w.elevation[i] = -0.1; },
    river: (SE, w, i) => { w.riverLevel[i] = 1; },
    rock: (SE, w, i) => { w.landscape[i] = SE.Landscape.Rock; },
    bare: (SE, w, i) => { w.vegetation[i] = SE.BARE_COVER * 0.5; },
  };
  for (const [name, put] of Object.entries(barriers)) {
    const { SE, world: w } = makeSim(777, 'today');
    const hz = new SE.HazardSystem();
    // A dry, hot strip whose fire is certain to run into the barrier column at X + 3.
    forest(SE, w, X - 8, Y - 2, X + 8, Y + 2);
    for (let y = Y - 3; y <= Y + 3; y++) put(SE, w, SE.idx(X + 3, y));
    assert.ok(hz.start(w, SE.EventKind.Fire, X, Y, 'player'), `${name}: started`);
    burn(hz, w);
    const tiles = burnt(SE, w);
    assert.ok(tiles.some((i) => i % SE.GRID_W === X + 2), `${name}: the fire reached the barrier`);
    for (const i of tiles) assert.ok(i % SE.GRID_W < X + 3, `${name}: tile ${i % SE.GRID_W},${Math.floor(i / SE.GRID_W)} burnt behind it`);
  }
});

test('a city does not burn but loses a fifth of its people', () => {
  const { SE, world: w } = makeSim(777, 'today');
  const hz = new SE.HazardSystem();
  forest(SE, w, X - 6, Y - 3, X + 6, Y + 3);
  const city = SE.idx(X + 2, Y);
  w.tech[city] = SE.Tech.Iron;
  w.cityPop[city] = 0.8;
  assert.notEqual(hz.refusal(w, SE.EventKind.Fire, X + 2, Y), '', 'a city is no place to start a fire');
  hz.start(w, SE.EventKind.Fire, X, Y, 'player');
  let ever = false;
  for (let t = 0; t < 50 && w.hazards.list.length > 0; t++) {
    hz.step(w);
    if (w.hazards.tile[city] !== SE.HazardTile.None) ever = true;
  }
  assert.equal(ever, false, 'the city tile never burns');
  assert.equal(w.tech[city], SE.Tech.Iron, 'the city stands');
  assert.ok(Math.abs(w.cityPop[city] - 0.8 * (1 - SE.FIRE_CITY_LOSS)) < 1e-6, `once a fifth: ${w.cityPop[city]}`);
  assert.equal(w.hazards.scar[city], SE.ScarKind.None);
});

test('a fire keeps to its caps: reach, tiles and ticks (the ticks are as long as its sound at the slowest speed)', () => {
  {
    const { SE, world: w } = makeSim(777, 'today');
    const hz = new SE.HazardSystem();
    forest(SE, w, X - 20, Y - 15, X + 20, Y + 15);
    const h = hz.start(w, SE.EventKind.Fire, X, Y, 'player');
    const ticks = burn(hz, w);
    const tiles = burnt(SE, w);
    assert.ok(ticks <= SE.FIRE_MAX_TICKS, `${ticks} ticks`);
    // Six ticks spread a fire less far than 90 tiles used to; the tile cap only holds.
    assert.ok(tiles.length > 50 && tiles.length <= SE.FIRE_MAX_TILES, `${tiles.length} tiles`);
    assert.equal(h.fire.caught, tiles.length);
    for (const i of tiles) assert.ok(SE.hazardDistance(X, Y, i % SE.GRID_W, Math.floor(i / SE.GRID_W)) <= SE.FIRE_REACH);
  }
  {
    // A long narrow strip: the fire spreads one tile per tick, so the tick cap binds before the reach.
    const { SE, world: w } = makeSim(777, 'today');
    const hz = new SE.HazardSystem();
    forest(SE, w, X - 30, Y, X + 30, Y + 1);
    hz.start(w, SE.EventKind.Fire, X, Y, 'player');
    burn(hz, w);
    const reach = Math.max(...burnt(SE, w).map((i) => SE.hazardDistance(X, Y, i % SE.GRID_W, Math.floor(i / SE.GRID_W))));
    assert.ok(reach > 3 && reach <= Math.min(SE.FIRE_REACH, SE.FIRE_MAX_TICKS), `reach ${reach}`);
  }
  {
    // A tile that would smoulder on for ever: the fire still ends at the tick cap, in its aftermath.
    const { SE, world: w } = makeSim(777, 'today');
    const hz = new SE.HazardSystem();
    forest(SE, w, X, Y, X, Y);
    hz.start(w, SE.EventKind.Fire, X, Y, 'player');
    w.hazards.level[SE.idx(X, Y)] = 200;
    assert.equal(burn(hz, w), SE.FIRE_MAX_TICKS);
    assert.equal(w.hazards.tile[SE.idx(X, Y)], SE.HazardTile.None);
    assert.equal(w.hazards.scar[SE.idx(X, Y)], SE.ScarKind.Burnt);
  }
});

test('on uniform fuel the fire runs further downwind than upwind', () => {
  let along = 0;
  let down = 0;
  let up = 0;
  for (const y of [40, 54, 72, 90]) {
    const { SE, world: w } = makeSim(4242, 'today');
    const hz = new SE.HazardSystem();
    forest(SE, w, X - 14, y - 14, X + 14, y + 14, { moisture: 0.6, temp: 15 });
    hz.start(w, SE.EventKind.Fire, X, y, 'player');
    burn(hz, w);
    const wind = SE.ClimateSystem.airCurrent(y);
    const len = Math.hypot(wind.dx, wind.dy);
    for (const i of burnt(SE, w)) {
      const p = ((i % SE.GRID_W - X) * wind.dx + (Math.floor(i / SE.GRID_W) - y) * wind.dy) / len;
      along += p;
      down = Math.max(down, p);
      up = Math.max(up, -p);
    }
  }
  assert.ok(along > 0, `burnt tiles lie downwind on average (${along.toFixed(1)})`);
  assert.ok(down > up, `downwind ${down.toFixed(1)} tiles, upwind ${up.toFixed(1)}`);
});

test('a burnt-out tile keeps a fifth of its cover, loses its trees and becomes burnt earth', () => {
  const { SE, world: w } = makeSim(777, 'today');
  const hz = new SE.HazardSystem();
  forest(SE, w, X - 5, Y - 5, X + 5, Y + 5);
  const co2 = w.co2;
  const dust = w.dust;
  hz.start(w, SE.EventKind.Fire, X, Y, 'player');
  burn(hz, w);
  const tiles = burnt(SE, w);
  assert.ok(tiles.length > 20, `${tiles.length} tiles burnt`);
  for (const i of tiles) {
    assert.equal(w.hazards.tile[i], SE.HazardTile.None, 'the fire is out');
    assert.equal(w.flora[i] & SE.WOODY_FLORA_MASK, 0, 'no trees left');
    assert.ok(Math.abs(w.vegetation[i] - 0.9 * SE.FIRE_KEEP) < 1e-6, `cover ${w.vegetation[i]}`);
    assert.equal(w.landscape[i], SE.Landscape.Barren, 'held at bare soil');
  }
  const expected = tiles.length * 0.9 * SE.FIRE_CO2;
  assert.ok(Math.abs(w.co2 - co2 - expected) < 1e-3, `CO₂ from the burnt biomass: +${(w.co2 - co2).toFixed(2)}`);
  const d = w.dust - dust;
  assert.ok(d > 0 && d <= SE.FIRE_DUST_MAX + 1e-9, `dust +${d.toFixed(4)}`);
  assert.ok(Math.abs(d - Math.min(SE.FIRE_DUST_MAX, tiles.length * SE.FIRE_DUST_TILE)) < 1e-6);
});

test('burnt earth holds its tile bare for its minimum ticks, then succession grows it back', { timeout: 300000 }, () => {
  const s = makeSim(4242, 'today');
  const { SE, world: w } = s;
  const hz = new SE.HazardSystem();
  let site = null;
  for (let y = 30; y < SE.GRID_H - 30 && !site; y += 2) {
    for (let x = 0; x < SE.GRID_W && !site; x += 3) {
      const e = w.elevation[SE.idx(x, y)];
      let ok = e > 0.15 && e < 0.45;
      for (let dy = -7; dy <= 7 && ok; dy++) {
        for (let dx = -7; dx <= 7; dx++) if (w.elevation[SE.idx(SE.wrapX(x + dx), y + dy)] < 0) { ok = false; break; }
      }
      if (ok) site = [x, y];
    }
  }
  assert.ok(site, 'an inland site');
  const [x, y] = site;
  forest(SE, w, x - 2, y - 2, x + 2, y + 2, { moisture: 0, temp: 30 });
  hz.start(w, SE.EventKind.Fire, x, y, 'player');
  burn(hz, w);
  const tiles = burnt(SE, w);
  assert.ok(tiles.length >= 10, `${tiles.length} tiles burnt`);
  // Plants all around, so the burnt ground has something to grow back from.
  const plants = (1 << SE.Flora.LandPlants) | (1 << SE.Flora.Mosses) | (1 << SE.Flora.Vascular) | (1 << SE.Flora.Grasses);
  const green = () => {
    for (let dy = -9; dy <= 9; dy++) {
      for (let dx = -9; dx <= 9; dx++) {
        const j = SE.idx(SE.wrapX(x + dx), y + dy);
        if (w.hazards.scar[j] !== 0) continue;
        w.flora[j] |= plants;
        w.vegetation[j] = Math.max(w.vegetation[j], 0.5);
      }
    }
  };
  const min = SE.SCAR_MIN_TICKS[SE.ScarKind.Burnt];
  for (let t = 0; t < min; t++) {
    green();
    s.tick();
    hz.step(w);
    for (const i of tiles) {
      assert.equal(w.hazards.scar[i], SE.ScarKind.Burnt, 'the scar holds');
      if (w.hazards.scarAge[i] > min) continue;
      assert.equal(w.landscape[i], SE.Landscape.Barren, `still bare soil at age ${w.hazards.scarAge[i]}`);
      assert.ok(SE.scarShowsGround(w, i), 'the burnt ground shows');
    }
  }
  let grown = 0;
  let after = 0;
  for (; after < 150 && grown <= tiles.length / 2; after++) {
    green();
    s.tick();
    hz.step(w);
    grown = tiles.filter((i) => SE.LANDSCAPE_LEVEL[w.landscape[i]] >= 1).length;
  }
  assert.ok(grown > tiles.length / 2, `${grown}/${tiles.length} burnt tiles green again ${after} ticks after the hold`);
});

test('a fire is deterministic and refuses ground with nothing to burn', () => {
  const once = () => {
    const { SE, world: w } = makeSim(31337, 'today');
    const hz = new SE.HazardSystem();
    forest(SE, w, X - 14, Y - 14, X + 14, Y + 14, { moisture: 0.55, temp: 20 });
    hz.start(w, SE.EventKind.Fire, X, Y, 'player');
    const ticks = burn(hz, w);
    return { ticks, scar: Array.from(w.hazards.scar), veg: Array.from(w.vegetation), co2: w.co2 };
  };
  assert.deepEqual(once(), once());

  const { SE, world: w } = makeSim(777, 'today');
  const hz = new SE.HazardSystem();
  const bare = SE.idx(X, Y);
  w.elevation[bare] = 0.2;
  w.vegetation[bare] = SE.BARE_COVER * 0.9;
  assert.equal(hz.refusal(w, SE.EventKind.Fire, X, Y), 'Hier gibt es nichts, was brennen kann.');
  assert.equal(hz.start(w, SE.EventKind.Fire, X, Y, 'player'), null);
  let sea = -1;
  for (let i = 0; i < SE.TILE_COUNT && sea < 0; i++) if (w.elevation[i] < -0.2) sea = i;
  w.vegetation[sea] = 0.9;
  assert.equal(hz.refusal(w, SE.EventKind.Fire, sea % SE.GRID_W, Math.floor(sea / SE.GRID_W)), 'Wasser brennt nicht.');
  forest(SE, w, X, Y, X, Y);
  assert.equal(hz.refusal(w, SE.EventKind.Fire, X, Y), '');
  hz.start(w, SE.EventKind.Fire, X, Y, 'player');
  assert.notEqual(hz.refusal(w, SE.EventKind.Fire, X, Y), '', 'a burning tile cannot be lit again');
});

test('the show: a smoke thread first, then a growing flame; flames and capped plumes over the fire', {
  skip: !SE0.FX_MANIFEST.sprites.flame_large && 'the fire art is not in the atlas yet',
}, () => {
  const { SE, world: w } = makeSim(777, 'today');
  const hz = new SE.HazardSystem();
  forest(SE, w, X - 20, Y - 15, X + 20, Y + 15);
  const cam = { scrollX: X - 14, scrollY: Y - 9, tilePx: 32, dpr: 1 };
  const show = new SE.FxShow();
  const particles = new SE.FxParticles();
  show.build(w, cam, 28, 18, 0, 0, particles);
  let h = null;
  show.stage(w, SE.EventKind.Fire, X, Y, () => (h = hz.start(w, SE.EventKind.Fire, X, Y, 'player')));
  const t0 = performance.now();
  const omen = show.build(w, cam, 28, 18, t0 + 400, 0.1, particles);
  assert.equal(h, null, 'nothing burns during the omen');
  assert.ok(omen.tops.some((d) => d.id === 'smoke_puff'), 'a thread of smoke');
  show.build(w, cam, 28, 18, t0 + SE.HAZARD_OMEN_MS[SE.EventKind.Fire] + 1, 0.1, particles);
  assert.ok(h, 'the fire started once the omen was over');
  const main = show.build(w, cam, 28, 18, t0 + SE.HAZARD_OMEN_MS[SE.EventKind.Fire] + 1200, 0.1, particles);
  const origin = (d) => Math.floor(d.x / 16) === X && Math.floor(d.foot / 16) === Y;
  assert.equal(main.objects.filter((d) => d.id.startsWith('flame_') && origin(d)).length, 1, 'the growing flame stands alone on its tile');
  for (let t = 0; t < SE.FIRE_MAX_TICKS - 1; t++) hz.step(w);
  const n = h.fire.burning.length;
  assert.ok(n > 40, `${n} tiles burning`);
  const live = show.build(w, cam, 28, 18, t0 + 20000, 0.1, particles);
  const flames = live.objects.filter((d) => d.id.startsWith('flame_'));
  const seen = h.fire.burning.filter((i) => live.sees(i % SE.GRID_W, Math.floor(i / SE.GRID_W))).length;
  assert.equal(flames.length, seen, 'one flame per tile beyond 40 burning');
  // One sprite per plume, leaning downwind; no more bands.
  const plumes = live.tops.filter((d) => d.id.startsWith('smoke_plume'));
  assert.ok(plumes.length > 0 && plumes.length <= 12, `${plumes.length} plumes, at most 12 per fire`);
  const lean = SE.ClimateSystem.airCurrent(Y).dx > 0 ? 'smoke_plume_east' : 'smoke_plume_west';
  assert.ok(plumes.every((d) => d.id === lean && !d.rows), `every plume is ${lean}`);
  // The flames follow fuel and burn level, here in a dry woodland: large unless just caught or dying down.
  for (const d of flames.filter((f) => Math.floor(f.x / 16) !== X || Math.floor(f.foot / 16) !== Y)) {
    const i = SE.idx(Math.floor(d.x / 16), Math.floor(d.foot / 16));
    const size = SE.fireFlameSize(SE.fireFuel(w, i), w.hazards.level[i]);
    assert.equal(d.id, SE.FLAME_SPRITES[size], `flame on tile ${i} at level ${w.hazards.level[i]}`);
  }
  assert.ok(flames.some((d) => d.id === 'flame_large'), 'a woodland fire burns large');
  for (let t = 0; t < 60 && w.hazards.list.length > 0; t++) hz.step(w);
  const after = show.build(w, cam, 28, 18, t0 + 40000, 0.1, particles);
  assert.ok(after.objects.some((d) => d.id === 'charred_trunk'), 'charred trunks stand on the burnt ground');
  assert.ok(!after.objects.some((d) => d.id.startsWith('flame_')), 'no flames once the fire is out');
});

test('flame size follows fuel and burn level: it catches smaller, peaks by fuel, dies down small', () => {
  const { SE } = makeSim(777, 'today');
  const size = (fuel, level) => SE.FLAME_SPRITES[SE.fireFlameSize(fuel, level)];
  // Dense woodland burns FIRE_BURN_MAX ticks: medium as it catches, large, large, small in its last tick.
  assert.equal(SE.fireBurnTicks(0.9), SE.FIRE_BURN_MAX);
  assert.deepEqual([4, 3, 2, 1].map((l) => size(0.9, l)), ['flame_medium', 'flame_large', 'flame_large', 'flame_small']);
  // Grass (herb fuel) reaches medium; sparse cover never grows past small.
  const grass = 0.8 * SE.FIRE_HERB_FUEL;
  const ticks = SE.fireBurnTicks(grass);
  assert.equal(size(grass, ticks), 'flame_small', 'just caught');
  assert.equal(size(grass, ticks - 1), 'flame_medium');
  assert.equal(size(grass, 1), 'flame_small');
  for (let l = 1; l <= SE.FIRE_BURN_MAX; l++) assert.equal(size(0.15, l), 'flame_small');
  // Every tile's peak grows with its fuel.
  let last = 0;
  for (let fuel = 0.12; fuel <= 1; fuel += 0.04) {
    const peak = Math.max(...[2, 3, 4].map((l) => SE.fireFlameSize(fuel, l)));
    assert.ok(peak >= last, `peak at fuel ${fuel.toFixed(2)}`);
    last = peak;
  }
  assert.equal(last, 2);
});

test('the plume leans downwind in every wind belt', {
  skip: !SE0.FX_MANIFEST.sprites.smoke_plume_west && 'the leaning plumes are not in the atlas yet',
}, () => {
  const { SE } = makeSim(777, 'today');
  const seen = new Set();
  for (let y = 0; y < SE.GRID_H; y++) {
    const dx = SE.ClimateSystem.airCurrent(y).dx;
    const id = SE.firePlumeSprite(y);
    assert.equal(id, dx > 0 ? 'smoke_plume_east' : dx < 0 ? 'smoke_plume_west' : 'smoke_plume', `row ${y}`);
    seen.add(id);
  }
  assert.ok(seen.has('smoke_plume_east') && seen.has('smoke_plume_west'), 'both leans occur on the planet');
  const east = SE.FX_MANIFEST.sprites.smoke_plume_east;
  const west = SE.FX_MANIFEST.sprites.smoke_plume_west;
  for (const sp of [east, west]) assert.deepEqual([sp.w, sp.h, sp.frames.length], [24, 32, 6]);
  assert.equal(SE.FX_MANIFEST.sprites.smoke_plume.frames.length, 6);
});

test('a fire on lava or rubble names what is there instead of claiming nothing can burn', () => {
  const { SE, world: w } = makeSim(777, 'today');
  const hz = new SE.HazardSystem();
  forest(SE, w, X, Y, X, Y);
  w.hazards.tile[SE.idx(X, Y)] = SE.HazardTile.Lava;
  assert.equal(hz.refusal(w, SE.EventKind.Fire, X, Y), 'Hier fließt glühende Lava.');
  w.hazards.tile[SE.idx(X, Y)] = SE.HazardTile.Rubble;
  assert.equal(hz.refusal(w, SE.EventKind.Fire, X, Y), 'Hier liegen Trümmer.');
});

test('a fire uses up air oxygen: the bigger and longer it burns, the more', () => {
  const lost = (x0, y0, x1, y1) => {
    const { SE, world: w } = makeSim(777, 'today');
    const hz = new SE.HazardSystem();
    forest(SE, w, x0, y0, x1, y1);
    w.o2 = 21;
    hz.start(w, SE.EventKind.Fire, X, Y, 'player');
    burn(hz, w);
    return 21 - w.o2;
  };
  const one = lost(X, Y, X, Y);
  const big = lost(X - 20, Y - 15, X + 20, Y + 15);
  assert.ok(one > 0, `a single tile costs ${one} %`);
  assert.ok(big > 20 * one && big > 0.3 && big < 1.5, `a forest fire costs ${big} %, one tile ${one} %`);
});

test('the fire window: above today\'s oxygen plants catch more readily and fire spreads further', () => {
  const { SE } = makeSim(777, 'today');
  assert.equal(SE.fireOxygen(0), 1);
  assert.equal(SE.fireOxygen(SE.O2_PRESENT), 1);
  assert.ok(SE.fireOxygen(30) > 2);
  const tiles = (o2) => {
    const { SE, world: w } = makeSim(777, 'today');
    const hz = new SE.HazardSystem();
    forest(SE, w, X - 20, Y - 15, X + 20, Y + 15, { moisture: 0.5, temp: 20, veg: 0.6 });
    w.o2 = o2;
    hz.start(w, SE.EventKind.Fire, X, Y, 'player');
    burn(hz, w);
    return burnt(SE, w).length;
  };
  const today = tiles(21);
  const rich = tiles(32);
  assert.ok(rich > today * 1.5, `${rich} tiles at 32 % against ${today} at 21 %`);
  // Moist plants that lava or lightning cannot light today catch in oxygen-rich air.
  const { world: w } = makeSim(777, 'today');
  forest(SE, w, X, Y, X, Y, { moisture: 0.6 });
  const i = SE.idx(X, Y);
  w.o2 = 21;
  assert.equal(SE.fireCanCatch(w, i), false);
  w.o2 = 30;
  assert.equal(SE.fireCanCatch(w, i), true);
});

test('lightning lights fires now and then, far more often in oxygen-rich air, on dry plants and without world.rng', () => {
  const strikes = (o2) => {
    const { SE, world: w } = makeSim(777, 'today');
    forest(SE, w, 0, 10, SE.GRID_W - 1, SE.GRID_H - 11, { moisture: 0.2 });
    w.o2 = o2;
    const rng = w.rng.getState();
    let n = 0;
    for (let t = 0; t < 4000; t++) {
      w.ticks = t;
      const i = SE.lightningFireTile(w);
      if (i < 0) continue;
      assert.ok(SE.fireCanCatch(w, i), `tick ${t}: tile ${i} can burn`);
      n++;
    }
    assert.equal(w.rng.getState(), rng, 'the rolls are hashes');
    return n;
  };
  const today = strikes(21);
  const rich = strikes(30);
  assert.ok(today >= 1 && today <= 8, `${today} lightning fires in 4000 ticks at 21 %`);
  assert.ok(rich > 6 * today, `${rich} at 30 % against ${today} at 21 %`);
});
