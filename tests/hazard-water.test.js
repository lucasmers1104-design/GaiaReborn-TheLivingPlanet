'use strict';
/*
 * Tidal wave and hurricane (docs/ereignisse-spec.md §3.4, §3.5) on a
 * synthetic planet: deep ocean with a round island. The wave floods the
 * coast that faces it and only below its remaining height, never a steep
 * rim, crosses deep water faster than shallows, and recedes into mud. The
 * hurricane runs west in the tropics, drifts poleward, recurves east beyond
 * 30°, weakens over land, throws forests, pushes a surge onto a low coast,
 * spins off tornadoes at landfall that stay within their reach, and its
 * hazard ends once the strip it soaked has dried. Both are deterministic on
 * a real planet. On screen, crests are drawn for their heading and break
 * on the coast; tornadoes stand on their tiles.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSim } = require('./helpers');

const CX = 128;
const CY = 64;

let shared = null;
/** One simulation reused by every synthetic test; each call clears its hazards and lays fresh ground. */
function sim() {
  if (!shared) shared = makeSim(4242, 'random');
  shared.world.hazards.clear();
  return shared;
}

/** Ring distance of tile i from the island centre. */
function distance(SE, i) {
  const x = i % SE.GRID_W;
  const y = Math.floor(i / SE.GRID_W);
  const dx = Math.min(Math.abs(x - CX), SE.GRID_W - Math.abs(x - CX));
  return Math.hypot(dx, y - CY);
}

/** Deep ocean with a round island of radius r: its coast stands `rim` high and rises `slope` a tile inland. */
function island(SE, w, { r = 9, rim = 0.005, slope = 0.006, temp = 28 } = {}) {
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    const d = distance(SE, i);
    w.elevation[i] = d <= r ? rim + (r - d) * slope : Math.max(-0.5, -0.02 - (d - r) * 0.04);
    w.temperature[i] = temp;
    w.tech[i] = 0;
  }
}

function run(SE, w, hz, ticks, each = () => {}) {
  for (let t = 0; t < ticks && w.hazards.list.length > 0; t++) {
    hz.step(w);
    each(t);
  }
}

const DIRS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

test('a tidal wave floods the coast facing it, only below its remaining height', () => {
  const s = sim();
  const { SE, world: w } = s;
  for (const [dx, dy] of DIRS) {
    w.hazards.clear();
    island(SE, w);
    const hz = new SE.HazardSystem();
    const len = Math.hypot(dx, dy);
    const ox = Math.round(CX + (dx / len) * 15);
    const oy = Math.round(CY + (dy / len) * 15);
    const h = hz.start(w, SE.EventKind.TidalWave, ox, oy, 'player');
    assert.ok(h, `started from ${dx},${dy}`);
    const flooded = new Set();
    run(SE, w, hz, 80, () => {
      for (const r of h.wave.runs) {
        r.front.forEach((i, f) => {
          assert.ok(w.elevation[i] < r.height[f], `flooded tile ${w.elevation[i].toFixed(3)} high under water ${r.height[f].toFixed(3)} high`);
          assert.ok(r.height[f] <= SE.WAVE_HEIGHT - SE.FLOOD_RUNUP_LOSS * r.steps + 1e-9, 'the wave loses height inland');
        });
      }
      for (let i = 0; i < SE.TILE_COUNT; i++) if (w.hazards.tile[i] === SE.HazardTile.Flood) flooded.add(i);
    });
    assert.equal(w.hazards.list.length, 0, 'the wave is over');
    let facing = 0;
    let away = 0;
    for (const i of flooded) {
      const x = i % SE.GRID_W;
      const y = Math.floor(i / SE.GRID_W);
      if ((x - CX) * dx + (y - CY) * dy > 0) facing++;
      else away++;
      assert.ok(distance(SE, i) > 9 - SE.FLOOD_RUNUP_STEPS - 0.5, 'at most six land steps inland');
    }
    assert.ok(facing >= 5, `${facing} tiles flooded on the side facing ${dx},${dy}`);
    assert.ok(facing > away * 3, `facing ${facing}, far side ${away}`);
  }
});

test('a steep coast stops the wave; the flooded flat coast recedes into mud', () => {
  const s = sim();
  const { SE, world: w } = s;
  island(SE, w, { rim: 0.1 });
  let hz = new SE.HazardSystem();
  hz.start(w, SE.EventKind.TidalWave, CX + 13, CY, 'player');
  let wet = 0;
  run(SE, w, hz, 80, () => {
    for (let i = 0; i < SE.TILE_COUNT; i++) if (w.hazards.tile[i] === SE.HazardTile.Flood) wet++;
  });
  assert.equal(wet, 0, 'nothing floods behind a rim higher than the wave');

  w.hazards.clear();
  island(SE, w);
  hz = new SE.HazardSystem();
  const h = hz.start(w, SE.EventKind.TidalWave, CX + 13, CY, 'player');
  const ever = new Set();
  const runs = new Set();
  const drained = new Map();
  let standing = 0;
  run(SE, w, hz, 80, () => {
    for (const r of h.wave.runs) runs.add(r);
    let now = 0;
    for (let i = 0; i < SE.TILE_COUNT; i++) {
      if (w.hazards.tile[i] !== SE.HazardTile.Flood) {
        // Early mud may heal before the wave ends: check each tile as its water goes.
        if (ever.has(i) && !drained.has(i)) drained.set(i, [w.hazards.scar[i], SE.LANDSCAPE_LEVEL[w.landscape[i]]]);
        continue;
      }
      ever.add(i);
      now++;
    }
    standing = Math.max(standing, now);
  });
  assert.ok(ever.size >= 5, `${ever.size} tiles flooded`);
  assert.equal(h.done, true);
  // Smooth run-up: the water arrives later with every land step, and its edge runs back to the sea inland first, not in two jumps.
  let levels = 0;
  for (const r of runs) {
    const lv = [];
    r.tiles.forEach((_, m) => {
      assert.ok(r.at[m] < r.off[m], 'water comes before it goes');
      const l = (lv[r.reach[m]] ??= { a0: Infinity, a1: -Infinity, off: -Infinity });
      l.a0 = Math.min(l.a0, r.at[m]);
      l.a1 = Math.max(l.a1, r.at[m]);
      l.off = Math.max(l.off, r.off[m]);
    });
    const steps = lv.filter(Boolean);
    for (let k = 1; k < steps.length; k++) {
      assert.ok(steps[k].a0 >= steps[k - 1].a0 && steps[k].a1 >= steps[k - 1].a1, `step ${k} floods later`);
      assert.ok(steps[k].off < steps[k - 1].off, `step ${k} dries earlier`);
    }
    if (steps.length >= 3) assert.ok(new Set(r.off.map((v) => v.toFixed(6))).size >= 3, 'the edge recedes continuously');
    levels = Math.max(levels, steps.length);
  }
  assert.ok(levels >= 3, `${levels} land steps run up`);
  for (const i of ever) {
    assert.equal(w.hazards.tile[i], SE.HazardTile.None, 'the water has gone');
    assert.deepEqual(drained.get(i), [SE.ScarKind.Mud, 0], 'mud on raw ground is left');
  }
  // Mud holds its ground for its minimum ticks, then succession may take it back.
  const min = SE.SCAR_MIN_TICKS[SE.ScarKind.Mud];
  const age0 = new Map([...ever].filter((i) => w.hazards.scar[i] === SE.ScarKind.Mud).map((i) => [i, w.hazards.scarAge[i]]));
  for (let t = 1; t < min; t++) {
    hz.step(w);
    for (const [i, a] of age0) {
      if (a + t >= min) continue;
      assert.equal(w.hazards.scar[i], SE.ScarKind.Mud, `still mud at age ${w.hazards.scarAge[i]}`);
      assert.equal(SE.LANDSCAPE_LEVEL[w.landscape[i]], 0, 'nothing grows on young mud');
    }
  }
});

test('the wave crosses deep water faster than the shelf and the shallows', () => {
  const s = sim();
  const { SE, world: w } = s;
  const wave = (depth, strength) => {
    w.hazards.clear();
    w.elevation.fill(depth);
    return new SE.HazardSystem().start(w, SE.EventKind.TidalWave, CX, CY, 'player', strength).wave;
  };
  const arrivalAt = (depth) => {
    const wv = wave(depth);
    const k = wv.tiles.indexOf(SE.idx(CX + 10, CY));
    assert.ok(k >= 0, 'reached ten tiles away');
    assert.ok(wv.tiles.every((i) => SE.hazardDistance(CX, CY, i % SE.GRID_W, Math.floor(i / SE.GRID_W)) <= SE.WAVE_PATH_MAX));
    assert.ok(Math.abs(wv.at[SE.waveCell(wv, CX + 10, CY)] - wv.arrival[k]) < 1e-5, 'the box holds the list arrival');
    return wv.arrival[k];
  };
  const deep = arrivalAt(-0.5);
  const shelf = arrivalAt(-0.1);
  const shallow = arrivalAt(-0.02);
  assert.ok(Math.abs(deep - 10 * SE.WAVE_TICKS_DEEP) < 0.05, `deep ${deep}`);
  assert.ok(deep < shelf && shelf < shallow, `deep ${deep}, shelf ${shelf}, shallows ${shallow}`);
  // Uniform deep sea: a round front, not an octagon; a weaker wave reaches less far.
  const reach = (wv) => {
    let far = 0;
    for (let dy = -SE.WAVE_PATH_MAX; dy <= SE.WAVE_PATH_MAX; dy++) {
      for (let dx = -SE.WAVE_PATH_MAX; dx <= SE.WAVE_PATH_MAX; dx++) {
        const T = wv.at[SE.waveCell(wv, SE.wrapX(CX + dx), CY + dy)];
        if (!Number.isFinite(T)) continue;
        const d = Math.hypot(dx, dy);
        if (d >= 20) assert.ok(Math.abs(T / (SE.WAVE_TICKS_DEEP * d) - 1) < 0.02, `round at ${dx},${dy}: ${T}`);
        far = Math.max(far, d);
      }
    }
    return far;
  };
  const full = reach(wave(-0.5));
  const half = reach(wave(-0.5, 0.5));
  assert.ok(half < full - 5, `strength 0.5 reaches ${half.toFixed(1)}, strength 1 ${full.toFixed(1)}`);
  w.hazards.clear();
  island(SE, w);
  assert.equal(new SE.HazardSystem().refusal(w, SE.EventKind.TidalWave, CX, CY), 'Eine Flutwelle beginnt im Meer.');
});

/** Unwrapped x steps of a track. */
function steps(SE, path) {
  const out = [];
  for (let k = 1; k < path.length; k++) {
    let dx = (path[k] % SE.GRID_W) - (path[k - 1] % SE.GRID_W);
    if (dx > SE.GRID_W / 2) dx -= SE.GRID_W;
    if (dx < -SE.GRID_W / 2) dx += SE.GRID_W;
    out.push([dx, Math.floor(path[k] / SE.GRID_W) - Math.floor(path[k - 1] / SE.GRID_W)]);
  }
  return out;
}

test('a hurricane runs west in the tropics, drifts poleward and recurves east beyond 30°', () => {
  const s = sim();
  const { SE, world: w } = s;
  const ocean = () => {
    w.hazards.clear();
    w.elevation.fill(-0.5);
    w.temperature.fill(28);
  };
  for (const [y, pole] of [[56, -1], [71, 1]]) {
    ocean();
    const hz = new SE.HazardSystem();
    const h = hz.start(w, SE.EventKind.Hurricane, 100, y, 'player');
    assert.equal(h.storm.strength, 3, 'warm sea: strength 3');
    for (let t = 0; t < 20; t++) hz.step(w);
    const st = steps(SE, h.storm.path);
    assert.equal(st.length, 20);
    assert.ok(st.every(([dx]) => dx === -1), 'one tile west a tick');
    const drift = st.reduce((a, [, dy]) => a + dy, 0);
    assert.ok(drift * pole >= 4 && drift * pole <= 8, `poleward drift ${drift} over 20 ticks`);
    assert.ok(st.every(([, dy]) => dy === 0 || dy === pole), 'never towards the equator');
    assert.equal(h.storm.strength, SE.HURRICANE_MAX, 'warm sea feeds it up to 4');
  }
  ocean();
  const hz = new SE.HazardSystem();
  const h = hz.start(w, SE.EventKind.Hurricane, 100, 34, 'player');
  for (let t = 0; t < 6; t++) hz.step(w);
  assert.ok(steps(SE, h.storm.path).every(([dx]) => dx === 1), 'east beyond 30°');
});

test('a hurricane weakens over land and dies; its wet strip dries and the hazard ends', () => {
  const s = sim();
  const { SE, world: w } = s;
  w.hazards.clear();
  w.temperature.fill(28);
  const forest = SE.LANDSCAPE_LEVEL.indexOf(4);
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    const x = i % SE.GRID_W;
    w.elevation[i] = x < 92 ? 0.004 + (92 - x) * 0.03 : -0.5;
    w.landscape[i] = x < 92 ? forest : 0;
  }
  const hz = new SE.HazardSystem();
  const h = hz.start(w, SE.EventKind.Hurricane, 97, 60, 'player');
  let wet = 0;
  let surge = 0;
  const strength = [];
  const thrown = new Set();
  run(SE, w, hz, 60, () => {
    strength.push(h.storm.strength);
    for (let i = 0; i < SE.TILE_COUNT; i++) {
      if (w.hazards.tile[i] === SE.HazardTile.Wet) wet++;
      if (w.hazards.tile[i] === SE.HazardTile.Flood) surge++;
      if (w.hazards.scar[i] === SE.ScarKind.Windthrow) thrown.add(i);
    }
  });
  assert.equal(h.done, true, 'the hazard ended');
  assert.equal(h.storm.moving, false);
  // It crosses a good stretch of land before it rains itself out, but dies on it.
  assert.ok(h.storm.path.length > 10 && h.storm.path.length < 30, `died ${h.storm.path.length - 1} ticks in, ${strength.map((v) => v.toFixed(2)).join(' ')}`);
  for (let k = 1; k < strength.length && strength[k] > 0; k++) {
    const x = h.storm.path[k + 1] % SE.GRID_W;
    if (x < 92) assert.ok(strength[k] < strength[k - 1], 'weaker over land');
  }
  assert.ok(wet > 0, 'it soaked its strip');
  assert.ok(surge > 0, 'landfall at strength 3 pushed a surge onto the low coast');
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    assert.notEqual(w.hazards.tile[i], SE.HazardTile.Wet, 'all dry again');
    assert.notEqual(w.hazards.tile[i], SE.HazardTile.Flood, 'the surge has run off');
  }
  // Counted while it ran: windthrow heals 10-16 ticks later, before a long storm is over. The track drifts poleward.
  const rows = h.storm.path.map((i) => Math.floor(i / SE.GRID_W));
  for (const i of thrown) {
    const y = Math.floor(i / SE.GRID_W);
    assert.ok(y >= Math.min(...rows) - 1 && y <= Math.max(...rows) + 1, 'windthrow only along the track');
  }
  assert.ok(thrown.size > 0, 'forest thrown');
});

test('from 8 directions the wave runs head-on into the facing coast and floods only below its remaining height', () => {
  const s = sim();
  const { SE, world: w } = s;
  for (const [dx, dy] of DIRS) {
    w.hazards.clear();
    // A coast 0.02 high: only a wave that has kept enough of its height floods it.
    island(SE, w, { rim: 0.02, slope: 0.008 });
    const hz = new SE.HazardSystem();
    const len = Math.hypot(dx, dy);
    const h = hz.start(w, SE.EventKind.TidalWave, Math.round(CX + (dx / len) * 15), Math.round(CY + (dy / len) * 15), 'player');
    // Where the wave reaches the facing coast it travels towards the island: the crests are drawn that way.
    let toward = 0;
    let coast = 0;
    h.wave.tiles.forEach((i, k) => {
      const x = i % SE.GRID_W;
      const y = Math.floor(i / SE.GRID_W);
      if (distance(SE, i) > 10.5 || (x - CX) * dx + (y - CY) * dy <= 0) return;
      coast++;
      const d = h.wave.heading[k];
      if (SE.HAZARD_NX[d] * (CX - x) + SE.HAZARD_NY[d] * (CY - y) > 0) toward++;
    });
    assert.ok(coast > 0 && toward >= coast * 0.8, `${toward} of ${coast} coast tiles reached head-on from ${dx},${dy}`);
    const flooded = new Map();
    run(SE, w, hz, 80, () => {
      for (let i = 0; i < SE.TILE_COUNT; i++) {
        if (w.hazards.tile[i] === SE.HazardTile.Flood && !flooded.has(i)) flooded.set(i, w.hazards.level[i] / 1000);
      }
    });
    assert.ok(flooded.size >= 3, `${flooded.size} tiles flooded from ${dx},${dy}`);
    let sx = 0;
    let sy = 0;
    let deepest = 0;
    let dir = 0;
    for (const [i, depth] of flooded) {
      const ux = (i % SE.GRID_W) - CX;
      const uy = Math.floor(i / SE.GRID_W) - CY;
      // Weakened by its longer path, a wave bending round the island no longer tops the coast there.
      assert.ok((ux * dx + uy * dy) / (Math.hypot(ux, uy) * len) > -0.2, `tile ${ux},${uy} lies on the far side from ${dx},${dy}`);
      if (depth > deepest) { deepest = depth; dir = (ux * dx + uy * dy) / (Math.hypot(ux, uy) * len); }
      // Never above the wave: the depth is what the wave had left over the tile.
      assert.ok(depth > 0 && w.elevation[i] + depth <= SE.WAVE_HEIGHT + 1e-3, `tile ${w.elevation[i].toFixed(3)} under ${depth.toFixed(3)} of water`);
      sx += ux;
      sy += uy;
    }
    const facing = (sx * dx + sy * dy) / (Math.hypot(sx, sy) * len);
    assert.ok(dir > Math.cos(Math.PI / 4), `the deepest flood faces ${dx},${dy} (cos ${dir.toFixed(2)})`);
    assert.ok(facing > Math.cos(Math.PI / 6), `the flood centres within 30° of the side facing ${dx},${dy} (cos ${facing.toFixed(2)})`);
  }
});

/** A low coast west of x 92 (landscape level `level`, cities near the shore) under warm sea: a storm from 97, 60 makes landfall strong. */
function landfall(SE, w, level) {
  w.hazards.clear();
  w.temperature.fill(28);
  const ls = SE.LANDSCAPE_LEVEL.indexOf(level);
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    const x = i % SE.GRID_W;
    const land = x < 92;
    w.elevation[i] = land ? 0.004 + (92 - x) * 0.03 : -0.5;
    w.landscape[i] = land ? ls : 0;
    w.tech[i] = land && x > 80 ? SE.Tech.Industrial : SE.Tech.None;
    w.cityPop[i] = w.tech[i] ? 1 : 0;
  }
}

/** Run a landfall storm to its end, gathering every tornado path. */
function stormWithTornadoes(SE, w) {
  const hz = new SE.HazardSystem();
  const h = hz.start(w, SE.EventKind.Hurricane, 97, 60, 'player');
  const paths = new Map();
  const thrown = new Set();
  run(SE, w, hz, 60, () => {
    for (const t of h.storm.tornadoes) paths.set(t.path[0], t.path.slice());
    for (let i = 0; i < SE.TILE_COUNT; i++) if (w.hazards.scar[i] === SE.ScarKind.Windthrow) thrown.add(i);
  });
  return { h, paths: [...paths.values()], thrown };
}

test('a strong landfall spins off one or two tornadoes; they run straight inland and stay within their reach', () => {
  const s = sim();
  const { SE, world: w } = s;
  // Landscape level 3: too low for the hurricane's own windthrow, so every fallen tree is a tornado's.
  landfall(SE, w, 3);
  const { h, paths, thrown } = stormWithTornadoes(SE, w);
  assert.equal(h.done, true, 'the hazard ended');
  assert.equal(h.storm.tornadoes.length, 0, 'every funnel has lifted');
  assert.ok(paths.length >= 1 && paths.length <= 2, `${paths.length} tornadoes`);
  const eye = h.storm.path.find((i) => i % SE.GRID_W < 92);
  const ex = eye % SE.GRID_W;
  const ey = Math.floor(eye / SE.GRID_W);
  const on = new Set();
  for (const p of paths) {
    assert.ok(p.length - 1 >= 1 && p.length - 1 <= SE.TORNADO_RUN_MAX, `ran ${p.length - 1} tiles`);
    assert.ok(SE.hazardDistance(ex, ey, p[0] % SE.GRID_W, Math.floor(p[0] / SE.GRID_W)) <= SE.TORNADO_SPAWN_RING, 'touched down near the landfall');
    let step = null;
    p.forEach((i, k) => {
      on.add(i);
      const x = i % SE.GRID_W;
      const y = Math.floor(i / SE.GRID_W);
      assert.ok(w.elevation[i] >= 0, 'only over land');
      assert.ok(SE.hazardDistance(ex, ey, x, y) <= SE.TORNADO_SPAWN_RING + SE.TORNADO_RUN_MAX, 'within reach');
      if (x > 80) assert.ok(w.cityPop[i] <= 1 - SE.TORNADO_CITY_LOSS + 1e-6, 'the city on its path was hit');
      if (k === 0) return;
      const d = [x - (p[k - 1] % SE.GRID_W), y - Math.floor(p[k - 1] / SE.GRID_W)];
      assert.equal(Math.max(Math.abs(d[0]), Math.abs(d[1])), 1, 'one tile a tick');
      assert.ok(d[0] <= 0, 'inland, never back to sea');
      if (step) assert.deepEqual(d, step, 'straight on');
      step = d;
    });
  }
  // Counted while the storm ran: windthrow heals 10-16 ticks later, before a long storm is over.
  for (const i of thrown) assert.ok(on.has(i), 'windthrow only on a tornado path');
  assert.ok(thrown.size >= 2, `${thrown.size} tiles of trees thrown`);
  w.tech.fill(0);
  w.cityPop.fill(0);
});

test('tornadoes are deterministic and need a strong storm', () => {
  const s = sim();
  const { SE, world: w } = s;
  landfall(SE, w, 3);
  const a = stormWithTornadoes(SE, w);
  const scarA = Array.from(w.hazards.scar);
  landfall(SE, w, 3);
  const b = stormWithTornadoes(SE, w);
  assert.ok(a.paths.length > 0);
  assert.deepEqual(a.paths, b.paths);
  assert.deepEqual(scarA, Array.from(w.hazards.scar));
  // A mild sea keeps the storm below strength 3: no funnels.
  landfall(SE, w, 3);
  w.temperature.fill(22);
  assert.equal(stormWithTornadoes(SE, w).paths.length, 0, 'no tornado below strength 3');
  w.tech.fill(0);
  w.cityPop.fill(0);
});

test('tidal wave and hurricane are deterministic on a real planet', () => {
  const once = () => {
    const s = makeSim(31337, 'today');
    const { SE, world: w } = s;
    const hz = new SE.HazardSystem();
    let sea = -1;
    for (let i = 0; i < SE.TILE_COUNT && sea < 0; i++) {
      const y = Math.floor(i / SE.GRID_W);
      if (y > 40 && y < 88 && w.elevation[i] < -0.1 && w.elevation[i] > -0.3) sea = i;
    }
    const wave = hz.start(w, SE.EventKind.TidalWave, sea % SE.GRID_W, Math.floor(sea / SE.GRID_W), 'player');
    const storm = hz.start(w, SE.EventKind.Hurricane, (sea % SE.GRID_W) + 20, Math.floor(sea / SE.GRID_W), 'player');
    const t0 = process.hrtime.bigint();
    for (let t = 0; t < 40; t++) hz.step(w);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 40;
    return { ms, scar: Array.from(w.hazards.scar), tile: Array.from(w.hazards.tile), path: storm.storm.path.slice(), field: wave.wave.tiles.length };
  };
  const a = once();
  const b = once();
  assert.deepEqual(a.scar, b.scar);
  assert.deepEqual(a.tile, b.tile);
  assert.deepEqual(a.path, b.path);
  assert.ok(a.ms < 5, `${a.ms.toFixed(2)} ms per tick`);
});

test('on screen the sea draws back before the wave; the storm turns over its eye', (t) => {
  const s = sim();
  const { SE, world: w } = s;
  if (!SE.FX_MANIFEST.sprites.hurricane) return t.skip('the effect atlas has no water art yet (fx-atlas --write)');
  island(SE, w);
  const hz = new SE.HazardSystem();
  const particles = new SE.FxParticles();
  const view = (x, y) => ({ scrollX: x - 12, scrollY: y - 8, tilePx: 32, dpr: 1 });
  const play = (kind, x, y) => {
    const cam = view(x, y);
    const show = new SE.FxShow();
    show.build(w, cam, 24, 16, 0, 0, particles);
    let h = null;
    show.stage(w, kind, x, y, () => (h = hz.start(w, kind, x, y, 'player')));
    const t0 = performance.now();
    const omen = show.build(w, cam, 24, 16, t0 + 300, 0.1, particles);
    assert.equal(h, null, 'nothing happens during the omen');
    show.build(w, cam, 24, 16, t0 + SE.HAZARD_OMEN_MS[kind] + 1, 0.1, particles);
    assert.ok(h, 'started after the omen');
    const main = show.build(w, cam, 24, 16, t0 + SE.HAZARD_OMEN_MS[kind] + 600, 0.1, particles);
    for (let k = 0; k < 3; k++) {
      hz.step(w);
      w.ticks++;
    }
    const later = show.build(w, cam, 24, 16, t0 + SE.HAZARD_OMEN_MS[kind] + 3000, 0.1, particles);
    for (const g of w.hazards.list) SE.HAZARD_RULES[g.kind].finish(w, g);
    w.hazards.list.length = 0;
    return { omen, main, later };
  };
  const wave = play(SE.EventKind.TidalWave, CX + 15, CY);
  assert.ok(wave.omen.seaMarks.some((m) => m.kind === 'draw'), 'the sea draws back');
  // Built without a phase, the scene guesses one.
  assert.ok(wave.later.phase >= 0 && wave.later.phase <= 1, `phase ${wave.later.phase}`);
  const north = play(SE.EventKind.Hurricane, CX + 15, 50);
  assert.ok(north.omen.tops.some((d) => d.id === 'storm_small'), 'a small spiral gathers');
  assert.ok(north.later.tops.some((d) => d.id === 'hurricane'), 'the northern storm');
  const south = play(SE.EventKind.Hurricane, CX + 15, 80);
  assert.ok(south.later.tops.some((d) => d.id === 'hurricane_south'), 'the southern storm turns the other way');
});

test('on screen the wave is made of the sea: a round crest on its arrival line; a chained wave heaves the sea at its start', () => {
  const s = sim();
  const { SE, world: w } = s;
  w.elevation.fill(-0.5);
  w.tech.fill(0);
  const hz = new SE.HazardSystem();
  const h = hz.start(w, SE.EventKind.TidalWave, CX, CY, 'player');
  for (let k = 0; k < 3; k++) {
    hz.step(w);
    w.ticks++;
  }
  // A stand-in canvas and an all-sea terrain, so SeaWave paints in Node.
  const fakeCtx = () => ({ createImageData: (cw, ch) => ({ data: new Uint8ClampedArray(cw * ch * 4) }), putImageData() {} });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: fakeCtx }) };
  const m = SE.TERRAIN_MANIFEST;
  const art = { manifest: m, water: m.ramps.water, waterWarm: m.ramps.waterWarm, rgba: new Uint32Array(256) };
  const sea = new Uint8Array((SE.LAND_CHUNK * 16) ** 2).fill(m.ramps.water[2]);
  const land = { art, ready: true, motion: () => ({ sea }) };
  const cam = { scrollX: CX - 12, scrollY: CY - 8, tilePx: 32, dpr: 1 };
  const scene = new SE.FxShow().build(w, cam, 24, 16, 0, 0, new SE.FxParticles(), 0.5);
  const sw = new SE.SeaWave();
  const ctx = { canvas: { width: 24 * 32, height: 16 * 32 }, imageSmoothingEnabled: false, setTransform() {}, drawImage() {} };
  sw.draw(ctx, w, cam, land, scene, 0);
  delete globalThis.document;
  // The outermost crest pixel (rank 4, private to SeaWave) in each of 8 sectors lies just behind the arrival line, the same on every side.
  const Tvis = h.age - 1 + 0.5;
  const front = (Tvis / SE.WAVE_TICKS_DEEP) * 16;
  const outer = new Array(8).fill(0);
  for (let o = 0; o < sw.rank.length; o++) {
    if (sw.rank[o] !== 4) continue;
    const dx = sw.ox * 16 + (o % sw.w) + 0.5 - (CX * 16 + 8);
    const dy = sw.oy * 16 + Math.floor(o / sw.w) + 0.5 - (CY * 16 + 8);
    const sector = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
    outer[sector] = Math.max(outer[sector], Math.hypot(dx, dy));
  }
  for (const r of outer) assert.ok(Math.abs(r - (front - 0.15 * 40)) <= 4, `crest at ${outer.map((v) => v.toFixed(1)).join(' ')} px, front ${front.toFixed(1)} px`);
  for (const g of w.hazards.list) SE.HAZARD_RULES[g.kind].finish(w, g);
  w.hazards.list.length = 0;

  // A quake at sea: its wave starts with the sea heaving up over the epicentre.
  island(SE, w);
  const show = new SE.FxShow();
  const view = { scrollX: CX + 3, scrollY: CY - 8, tilePx: 32, dpr: 1 };
  show.build(w, view, 24, 16, 0, 0, new SE.FxParticles(), 0);
  const quake = new SE.HazardSystem();
  show.stage(w, SE.EventKind.Earthquake, CX + 15, CY, () => quake.start(w, SE.EventKind.Earthquake, CX + 15, CY, 'player'));
  const t0 = performance.now();
  let marks = [];
  for (let f = 1; f <= 12 && marks.length === 0; f++) {
    const sc = show.build(w, view, 24, 16, t0 + f * 200, 0.2, new SE.FxParticles(), 0.1);
    marks = sc.seaMarks.filter((mk) => mk.kind === 'dome');
  }
  const chained = w.hazards.list.find((g) => g.kind === SE.EventKind.TidalWave);
  assert.ok(chained && chained.cause === 'chain', 'the quake raised a wave');
  assert.ok(marks.some((mk) => Math.abs(mk.x - ((CX + 15) * 16 + 8)) <= 8 && Math.abs(mk.y - (CY * 16 + 8)) <= 8), 'the chained wave plays its start');
  for (const g of w.hazards.list) SE.HAZARD_RULES[g.kind].finish(w, g);
  w.hazards.list.length = 0;
});

test('on screen tornadoes stand on their paths', (t) => {
  const s = sim();
  const { SE, world: w } = s;
  if (!SE.FX_MANIFEST.sprites.tornado) return t.skip('the effect atlas has no stage-2 water art yet (fx-atlas --write)');
  const particles = new SE.FxParticles();
  const build = (show, x, y, now) => show.build(w, { scrollX: x - 12, scrollY: y - 8, tilePx: 32, dpr: 1 }, 24, 16, now, 0.05, particles);
  let now = 10000;
  landfall(SE, w, 3);
  const hz = new SE.HazardSystem();
  const storm = hz.start(w, SE.EventKind.Hurricane, 97, 60, 'player');
  const show = new SE.FxShow();
  let seen = 0;
  for (let k = 0; k < 20 && w.hazards.list.length > 0; k++) {
    hz.step(w);
    w.ticks++;
    now += 400;
    // The funnel is drawn on the top layer, above the cloud's bands (fxstorm.ts).
    const scene = build(show, 88, 60, now);
    for (const d of [...scene.objects, ...scene.tops]) {
      if (d.id !== 'tornado') continue;
      seen++;
      const near = storm.storm.tornadoes.some((tw) => tw.path.some((i) => Math.abs((i % SE.GRID_W) * 16 + 8 - d.x) <= 16 && Math.abs(Math.floor(i / SE.GRID_W) * 16 + 15 - d.y) <= 16));
      assert.ok(near, 'a funnel stands on its path');
    }
  }
  assert.ok(seen > 0, 'tornadoes on screen');
  for (const g of w.hazards.list) SE.HAZARD_RULES[g.kind].finish(w, g);
  w.hazards.list.length = 0;
  w.tech.fill(0);
  w.cityPop.fill(0);
});
