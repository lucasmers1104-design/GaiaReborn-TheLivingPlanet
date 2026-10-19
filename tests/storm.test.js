'use strict';
/*
 * The hurricane's lightning and rain (docs/ereignisse-spec.md §3.4,
 * hazardstorm.ts) on a synthetic coast: the bolts are a pure function of the
 * track, the same a tick later and on a rerun, more for a stronger storm;
 * on land they scorch the ground one tick after they are drawn and may set
 * dry plants on fire; over low land the rain stands as shallow flood water
 * and runs off into mud.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSim } = require('./helpers');

let shared = null;
function sim() {
  if (!shared) shared = makeSim(4242, 'random');
  shared.world.hazards.clear();
  return shared;
}

/** Warm sea east of x 92; land west of it `height` high (x 91 `cliff` high), grass, no rivers or cities. */
function coast(SE, w, { height = 0.1, cliff = height, moisture = 0.9, vegetation = 0.6, temp = 28 } = {}) {
  w.hazards.clear();
  const grass = SE.LANDSCAPE_LEVEL.indexOf(2);
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    const x = i % SE.GRID_W;
    const land = x < 92;
    w.elevation[i] = !land ? -0.5 : x === 91 ? cliff : height;
    w.temperature[i] = temp;
    w.landscape[i] = land ? grass : 0;
    w.moisture[i] = land ? moisture : 1;
    w.vegetation[i] = land ? vegetation : 0;
    w.riverLevel[i] = 0;
    w.tech[i] = SE.Tech.None;
    w.cityPop[i] = 0;
  }
}

/** Run hazards like App.tick (the world tick advances after them), recording each tick's bolts before its step. */
function play(SE, w, hz, h, ticks, each = () => {}) {
  const seen = [];
  for (let t = 0; t < ticks && w.hazards.list.length > 0; t++) {
    seen.push(SE.stormStrikes(w, h, w.ticks));
    hz.step(w);
    w.ticks++;
    each(seen);
  }
  return seen;
}

const band = (s) => (s >= 3 ? 2 : s >= 2 ? 1 : 0);

test('lightning is a pure function of the track: the same a tick later and on a rerun, more for a stronger storm', () => {
  const { SE, world: w } = sim();
  const totals = {};
  for (const temp of [28, 22, 15]) {
    const storm = () => {
      w.hazards.clear();
      w.elevation.fill(-0.5);
      w.temperature.fill(temp);
      const hz = new SE.HazardSystem();
      const h = hz.start(w, SE.EventKind.Hurricane, 100, 60, 'player');
      const seen = play(SE, w, hz, h, 80, (s) => {
        assert.deepEqual(SE.stormStrikes(w, h, w.ticks - 1), s[s.length - 1], 'the bolts of the tick before, unchanged a tick later');
      });
      return { h, seen, end: w.ticks };
    };
    const { h, seen, end } = storm();
    const st = h.storm;
    const moving = st.path.length - 1;
    seen.forEach((tiles, a) => {
      assert.deepEqual(SE.stormStrikes(w, h, end - seen.length + a), tiles, 'still the same once the storm is over');
      if (a >= moving) return assert.deepEqual(tiles, [], 'no lightning once the storm has stopped');
      const b = band(st.strengths[a]);
      assert.ok(tiles.length >= SE.STORM_STRIKES_MIN[b] && tiles.length <= SE.STORM_STRIKES_MAX[b], `${tiles.length} bolts at strength ${st.strengths[a]}`);
      assert.equal(new Set(tiles).size, tiles.length, 'never twice on one tile');
      const ex = st.path[a] % SE.GRID_W;
      const ey = Math.floor(st.path[a] / SE.GRID_W);
      for (const i of tiles) {
        const r = SE.hazardDistance(ex, ey, i % SE.GRID_W, Math.floor(i / SE.GRID_W));
        assert.ok(r >= 1 && r <= 3, `a bolt ${r} tiles from the eye`);
      }
    });
    assert.deepEqual(storm().seen, seen, 'a rerun strikes the same tiles');
    totals[temp] = { bolts: seen.flat().length, ticks: moving };
  }
  assert.ok(totals[28].bolts >= 2 * totals[28].ticks, `warm sea: ${totals[28].bolts} bolts in ${totals[28].ticks} ticks`);
  assert.ok(totals[15].bolts <= totals[15].ticks, `cool sea: ${totals[15].bolts} bolts in ${totals[15].ticks} ticks`);
});

test('a bolt on land scorches the ground one tick after it is drawn', () => {
  const { SE, world: w } = sim();
  coast(SE, w);
  const hz = new SE.HazardSystem();
  const h = hz.start(w, SE.EventKind.Hurricane, 97, 60, 'player');
  const struck = new Set();
  let landed = 0;
  play(SE, w, hz, h, 60, (seen) => {
    // The bolts drawn in the tick before have come down in this step; the ones the screen draws next not yet.
    for (const i of seen[seen.length - 1]) {
      struck.add(i);
      if (w.elevation[i] < 0) continue;
      assert.equal(w.hazards.scar[i], SE.ScarKind.Scorched, 'scorched in the next step');
      landed++;
    }
    for (const i of SE.stormStrikes(w, h, w.ticks)) {
      if (w.elevation[i] >= 0 && !struck.has(i)) assert.equal(w.hazards.scar[i], SE.ScarKind.None, 'not before the screen has drawn the bolt');
    }
  });
  assert.equal(h.done, true, 'the hazard ended');
  assert.ok(landed >= 2, `${landed} bolts on land`);
  assert.equal(h.chainUsed, false, 'nothing burns on wet land');
});

test('a bolt on dry plants can start one wildfire; wet land does not burn', () => {
  const { SE, world: w } = sim();
  const fires = (moisture) => {
    let n = 0;
    for (const y of [54, 57, 60, 63, 66]) {
      coast(SE, w, { moisture });
      const hz = new SE.HazardSystem();
      const chained = [];
      hz.onStart = (o) => chained.push(o);
      const h = hz.start(w, SE.EventKind.Hurricane, 97, y, 'player');
      play(SE, w, hz, h, 80, (seen) => {
        for (const f of chained.splice(0)) {
          assert.equal(f.kind, SE.EventKind.Fire);
          assert.equal(f.cause, 'chain');
          assert.ok(seen[seen.length - 1].includes(SE.idx(f.x, f.y)), 'on a tile struck in the tick before');
          n++;
        }
      });
      assert.ok(w.hazards.list.length === 0, 'storm and fire are over');
    }
    return n;
  };
  const dry = fires(0.2);
  assert.ok(dry >= 1, `${dry} of 5 storms over dry grass lit a fire`);
  assert.equal(fires(0.6), 0, 'no fire on wet land');
});

test('rain floods low land in the eye and ring 1 shallow, then runs off into mud', () => {
  const { SE, world: w } = sim();
  // A high first row keeps the storm surge out: every flood here is rain.
  coast(SE, w, { height: 0.02, cliff: 0.2 });
  const hz = new SE.HazardSystem();
  const h = hz.start(w, SE.EventKind.Hurricane, 97, 60, 'player');
  const flooded = new Set();
  // Mud heals some ticks after the water has gone, so it is checked as the water runs off.
  const muddy = new Set();
  play(SE, w, hz, h, 60, () => {
    for (const i of flooded) {
      if (muddy.has(i) || w.hazards.tile[i] === SE.HazardTile.Flood) continue;
      assert.equal(w.hazards.scar[i], SE.ScarKind.Mud, 'the water ran off and left mud');
      muddy.add(i);
    }
    for (let i = 0; i < SE.TILE_COUNT; i++) {
      if (w.hazards.tile[i] !== SE.HazardTile.Flood || flooded.has(i)) continue;
      flooded.add(i);
      assert.ok(w.elevation[i] < SE.STORM_FLOOD_LOW, 'only low land');
      assert.equal(w.hazards.level[i], Math.round(SE.STORM_FLOOD_DEPTH * 1000), 'shallow water');
      assert.ok(h.storm.runs.some((r) => r.tiles.includes(i)), 'in a flood plan, which the ground layer draws');
      const near = h.storm.path.some((e) => SE.hazardDistance(e % SE.GRID_W, Math.floor(e / SE.GRID_W), i % SE.GRID_W, Math.floor(i / SE.GRID_W)) <= 1);
      assert.ok(near, 'in the eye or ring 1');
    }
  });
  assert.equal(h.done, true, 'the hazard ended');
  assert.ok(flooded.size >= 3, `${flooded.size} tiles flooded`);
  for (const i of flooded) assert.notEqual(w.hazards.tile[i], SE.HazardTile.Flood, 'the water has run off');
  assert.equal(muddy.size, flooded.size, 'every flood left mud');
});
