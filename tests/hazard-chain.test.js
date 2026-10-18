'use strict';
/*
 * Chain reactions and the zoomed-out beacon (docs/ereignisse-spec.md §3.9):
 * a quake or a meteor at sea raises a tidal wave, lava beside dry plants
 * lights a fire, each hazard sets off at most one other and a chained one
 * none; below 16 px a tile every running hazard shows pulsing rings.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSim } = require('./helpers');

/** A water tile deep enough for a tidal wave, away from the poles. */
function seaTile(SE, w) {
  for (let y = 30; y < SE.GRID_H - 30; y += 2) {
    for (let x = 0; x < SE.GRID_W; x += 3) if (w.elevation[SE.idx(x, y)] < -0.1) return [x, y];
  }
  throw new Error('no sea tile');
}

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

test('a quake and a meteor at sea raise one tidal wave, which sets off nothing more', () => {
  for (const kind of ['Earthquake', 'Meteor']) {
    const { SE, world: w } = makeSim(777, 'today');
    const hz = new SE.HazardSystem();
    const told = [];
    hz.onStart = (h) => told.push(h);
    const [x, y] = seaTile(SE, w);
    const h = hz.start(w, SE.EventKind[kind], x, y, 'player');
    assert.ok(h, `${kind} started`);
    assert.ok(h.chainUsed, `${kind} used its one chain`);
    const wave = w.hazards.list.find((o) => o.kind === SE.EventKind.TidalWave);
    assert.ok(wave, `${kind} at sea raises a tidal wave`);
    assert.equal(wave.cause, 'chain');
    assert.equal(wave.chainUsed, false, 'a chained hazard sets off nothing');
    assert.deepEqual(told.map((o) => o.kind), [SE.EventKind.TidalWave], 'the app is told of the chained wave only');
    for (let t = 0; t < 40 && w.hazards.list.length > 0; t++) hz.step(w);
    assert.equal(told.length, 1, 'no further chain');
  }
});

test('lava beside dry plants lights one fire; wet plants do not burn', () => {
  const run = (moisture) => {
    const { SE, world: w } = makeSim(4242, 'today');
    const hz = new SE.HazardSystem();
    const [x, y] = inlandTile(SE, w);
    for (let dy = -8; dy <= 8; dy++) {
      for (let dx = -8; dx <= 8; dx++) {
        const i = SE.idx(SE.wrapX(x + dx), y + dy);
        w.vegetation[i] = 0.6;
        w.flora[i] |= 1 << SE.Flora.Broadleaf;
        w.landscape[i] = SE.Landscape.Shrubland;
        w.moisture[i] = moisture;
      }
    }
    const h = hz.start(w, SE.EventKind.Volcano, x, y, 'player');
    let fires = 0;
    for (let t = 0; t < 30 && w.hazards.list.length > 0; t++) {
      hz.step(w);
      fires = Math.max(fires, w.hazards.list.filter((o) => o.kind === SE.EventKind.Fire).length);
    }
    return { h, fires };
  };
  const dry = run(0.2);
  assert.ok(dry.h.chainUsed, 'the eruption set off a fire');
  assert.equal(dry.fires, 1, 'one fire at most');
  const wet = run(0.7);
  assert.equal(wet.h.chainUsed, false, 'wet plants do not catch');
});

test('below 16 px a tile every running hazard shows a beacon; closer in it does not', () => {
  const { SE, world: w } = makeSim(4242, 'today');
  const hz = new SE.HazardSystem();
  const [x, y] = inlandTile(SE, w);
  hz.start(w, SE.EventKind.Volcano, x, y, 'player');
  hz.step(w);
  const rings = (tilePx, dpr = 1) => {
    const show = new SE.FxShow();
    const cam = { scrollX: x - 20, scrollY: y - 12, tilePx, dpr };
    show.build(w, cam, 40, 24, 0, 0, new SE.FxParticles());
    return show.build(w, cam, 40, 24, 5000, 0.016, new SE.FxParticles()).rings.filter((r) => Math.floor(r.x / 16) === x).length;
  };
  assert.equal(rings(10), 2, 'two pulsing rings at 10 px');
  assert.equal(rings(10, 2), 2, 'on a retina screen too');
  assert.equal(rings(32), 0, 'none at 32 px');
});

test('a quake at sea raises a weaker wave by its magnitude; the eruption chooses no fire before its lava has settled', () => {
  const { SE, world: w } = makeSim(777, 'today');
  const hz = new SE.HazardSystem();
  const [x, y] = seaTile(SE, w);
  const quake = hz.start(w, SE.EventKind.Earthquake, x, y, 'player');
  const wave = w.hazards.list.find((o) => o.kind === SE.EventKind.TidalWave);
  assert.ok(Math.abs(wave.strength - SE.CHAIN_QUAKE_WAVE * quake.quake.magnitude) < 1e-9, 'strength by magnitude');
  assert.ok(wave.strength < 1, 'weaker than a full wave');
  const reach = SE.WAVE_PATH_MAX + Math.log(wave.strength) / -Math.log(SE.WAVE_DECAY);
  assert.ok(wave.wave.path.every((p) => p <= reach + 1e-6), 'and reaches less far');

  const s = makeSim(4242, 'today');
  const hz2 = new s.SE.HazardSystem();
  const [vx, vy] = inlandTile(s.SE, s.world);
  const h = hz2.start(s.world, s.SE.EventKind.Volcano, vx, vy, 'player');
  assert.equal(h.chainUsed, false, 'no chain at the start: the flow has not run yet');
});
