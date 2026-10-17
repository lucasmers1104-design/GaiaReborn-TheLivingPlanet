'use strict';
/*
 * Disasters on one tile (docs/ereignisse-spec.md): a volcano starts on its
 * tile and stays within its reach, its lava only runs downhill (or across
 * level ground as deep as it stands), cools in stages to basalt, and the
 * basalt holds its tile bare for SCAR_MIN_TICKS before succession takes it
 * back. Deep ocean makes no island; the hazard limit holds; everything is
 * deterministic. The effect layer's pixel rings are exact circles.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSim } = require('./helpers');

/** A land tile with land all round within r, moderately high, on a living or bare planet. */
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

function run(hz, w, ticks) {
  for (let t = 0; t < ticks; t++) hz.step(w);
}

test('a volcano starts on one tile, lifts a cone and stays within its reach', () => {
  const s = makeSim(777, 'today');
  const { SE, world: w } = s;
  const hz = new SE.HazardSystem();
  const [x, y] = inlandTile(SE, w);
  const before = Float32Array.from(w.elevation);
  const h = hz.start(w, SE.EventKind.Volcano, x, y, 'player');
  assert.ok(h, 'started');
  assert.equal(w.hazards.scar[SE.idx(x, y)], SE.ScarKind.Vent, 'the vent is a volcano now');
  assert.ok(w.elevation[SE.idx(x, y)] - before[SE.idx(x, y)] > 0.15, 'the vent is lifted');
  run(hz, w, 40);
  assert.equal(w.hazards.list.length, 0, 'the eruption is over after its flow cooled');
  let lava = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    const tx = i % SE.GRID_W;
    const ty = Math.floor(i / SE.GRID_W);
    const d = SE.hazardDistance(x, y, tx, ty);
    if (w.hazards.scar[i] !== 0) {
      lava++;
      assert.ok(d <= SE.VOLCANO_LAVA_REACH, `scar ${d} tiles from the vent`);
    }
    if (Math.abs(w.elevation[i] - before[i]) > 1e-6 && w.hazards.scar[i] === 0) assert.ok(d <= 1, `crust moved ${d} tiles away`);
    assert.equal(w.hazards.tile[i], 0, 'no lava left');
  }
  assert.ok(lava >= 2 && lava <= SE.VOLCANO_LAVA_MIN + SE.VOLCANO_LAVA_SPAN + 1, `${lava} lava tiles`);
});

test('lava runs downhill, cools through its stages and settles as bare basalt', () => {
  const s = makeSim(4242, 'today');
  const { SE, world: w } = s;
  const hz = new SE.HazardSystem();
  const [x, y] = inlandTile(SE, w);
  const h = hz.start(w, SE.EventKind.Volcano, x, y, 'player');
  const stages = new Map();
  let front = [SE.idx(x, y)];
  for (let t = 0; t < 40 && w.hazards.list.length > 0; t++) {
    hz.step(w);
    for (const i of h.lava.front) {
      if (front.includes(i)) continue;
      const fx = i % SE.GRID_W;
      const fy = Math.floor(i / SE.GRID_W);
      const fed = front.some((j) => SE.hazardDistance(fx, fy, j % SE.GRID_W, Math.floor(j / SE.GRID_W)) === 1 &&
        w.elevation[j] + SE.VOLCANO_LAVA_THICK >= w.elevation[i] - 1e-6);
      assert.ok(fed, `tile ${fx},${fy} was fed from a neighbour at least as high as its ground minus the lava's depth`);
    }
    if (h.lava.front.length) front = h.lava.front.slice();
    for (const i of h.lava.tiles) {
      if (w.hazards.tile[i] !== SE.HazardTile.Lava) continue;
      const seen = stages.get(i) ?? new Set();
      seen.add(SE.lavaStage(w.hazards.level[i]));
      stages.set(i, seen);
      assert.equal(w.vegetation[i], 0, 'nothing grows under lava');
      assert.equal(w.landscape[i], SE.Landscape.Rock);
    }
  }
  const first = [...stages.values()][0];
  assert.deepEqual([...first].sort(), [0, 1, 2], 'glowing, dark red and crust');
  for (const i of stages.keys()) {
    assert.equal(w.hazards.tile[i], SE.HazardTile.None);
    assert.ok(w.hazards.scar[i] === SE.ScarKind.Basalt || w.hazards.scar[i] === SE.ScarKind.Vent);
    assert.equal(w.soil[i], 0, 'fresh rock has no soil');
  }
});

test('basalt holds its tile bare for its minimum ticks, then succession takes it back', { timeout: 300000 }, () => {
  const s = makeSim(4242, 'today');
  const { SE, world: w } = s;
  const hz = new SE.HazardSystem();
  const [x, y] = inlandTile(SE, w);
  // Plants all around, so the rock has something to grow back from.
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
  hz.start(w, SE.EventKind.Volcano, x, y, 'player');
  while (w.hazards.list.length > 0) { s.tick(); hz.step(w); }
  const basalt = [];
  for (let i = 0; i < SE.TILE_COUNT; i++) if (w.hazards.scar[i] === SE.ScarKind.Basalt) basalt.push(i);
  assert.ok(basalt.length > 0, 'the flow left basalt');
  const min = SE.SCAR_MIN_TICKS[SE.ScarKind.Basalt];
  // Each tile's minimum runs from the tick its own lava cooled.
  for (let t = 0; t < min; t++) {
    green();
    s.tick();
    hz.step(w);
    for (const i of basalt) {
      if (w.hazards.scar[i] !== SE.ScarKind.Basalt || w.hazards.scarAge[i] > min) continue;
      assert.equal(w.landscape[i], SE.Landscape.Rock, `still bare rock at age ${w.hazards.scarAge[i]}`);
      assert.equal(w.vegetation[i], 0);
    }
  }
  let healed = 0;
  for (let t = 0; t < 150 && healed < basalt.length; t++) {
    green();
    s.tick();
    hz.step(w);
    healed = basalt.filter((i) => w.hazards.scar[i] === 0).length;
  }
  assert.ok(healed > basalt.length / 2, `${healed}/${basalt.length} basalt tiles taken back by succession`);
  const vent = SE.idx(x, y);
  assert.equal(w.hazards.scar[vent], SE.ScarKind.Vent, 'the volcano itself stays');
});

test('a volcano in deep ocean steams but makes no island; on the shelf it does', () => {
  const s = makeSim(777, 'today');
  const { SE, world: w } = s;
  const hz = new SE.HazardSystem();
  let deep = -1;
  let shelf = -1;
  for (let i = 0; i < SE.TILE_COUNT && (deep < 0 || shelf < 0); i++) {
    const e = w.elevation[i];
    const y = Math.floor(i / SE.GRID_W);
    if (y < 20 || y > SE.GRID_H - 20) continue;
    if (deep < 0 && e < -0.5) deep = i;
    if (shelf < 0 && e > -0.12 && e < -0.06) shelf = i;
  }
  const d = hz.start(w, SE.EventKind.Volcano, deep % SE.GRID_W, Math.floor(deep / SE.GRID_W), 'player');
  assert.ok(w.elevation[deep] < 0, 'still under the sea');
  assert.ok(d.lava.steam.length > 0 && d.lava.tiles.length === 0, 'steam, no lava');
  hz.start(w, SE.EventKind.Volcano, shelf % SE.GRID_W, Math.floor(shelf / SE.GRID_W), 'player');
  assert.ok(w.elevation[shelf] > 0, 'a new volcanic island');
  assert.equal(w.hazards.scar[shelf], SE.ScarKind.Vent);
});

test('natural eruptions and meteors go through hazardSink, on the highest land nearby, with no old markers', () => {
  const s = makeSim(777, 'today');
  const { SE, world: w, params: p } = s;
  const hz = new SE.HazardSystem();
  const calls = [];
  const sink = SE.hazardSink;
  const chance = w.rng.chance;
  SE.hazardSink = (kind, i, cause) => {
    calls.push([kind, cause]);
    return !!hz.start(w, kind, i % SE.GRID_W, Math.floor(i / SE.GRID_W), cause);
  };
  w.rng.chance = () => true;
  w.eventTtl.fill(0);
  try {
    s.events.step(w, p);
  } finally {
    w.rng.chance = chance;
    SE.hazardSink = sink;
  }
  assert.deepEqual(calls, [[SE.EventKind.Volcano, 'natural'], [SE.EventKind.Meteor, 'natural']]);
  assert.ok(w.hazards.list.some((h) => h.kind === SE.EventKind.Volcano && h.cause === 'natural'), 'the eruption runs as a hazard');
  assert.ok(w.eventTtl.every((t) => t === 0), 'no 8×8 icon stamped');
  assert.ok(!w.eventKind.includes(SE.EventKind.Volcano) && !w.eventKind.includes(SE.EventKind.Meteor), 'no event kind stamped');

  const [x, y] = inlandTile(SE, w);
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) w.elevation[SE.idx(x + dx, y + dy)] = 0.1;
  w.elevation[SE.idx(x + 2, y - 1)] = 0.5;
  w.elevation[SE.idx(x + 3, y)] = 0.9;
  assert.equal(SE.EventSystem.coneTile(w, SE.idx(x, y)), SE.idx(x + 2, y - 1), 'the cone snaps to the highest land within 2 tiles');
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) w.elevation[SE.idx(x + dx, y + dy)] = -0.5;
  assert.equal(SE.EventSystem.coneTile(w, SE.idx(x, y)), SE.idx(x, y), 'at sea the vent stays put');
});

test('hazards are deterministic, limited and refuse what has no rule yet', () => {
  const runOnce = () => {
    const s = makeSim(31337, 'today');
    const { SE, world: w } = s;
    const hz = new SE.HazardSystem();
    const [x, y] = inlandTile(SE, w);
    hz.start(w, SE.EventKind.Volcano, x, y, 'player');
    run(hz, w, 30);
    return { SE, scar: Array.from(w.hazards.scar), elev: Array.from(w.elevation) };
  };
  const a = runOnce();
  const b = runOnce();
  assert.deepEqual(a.scar, b.scar);
  assert.deepEqual(a.elev, b.elev);

  const s = makeSim(777, 'today');
  const { SE, world: w } = s;
  const hz = new SE.HazardSystem();
  const [x, y] = inlandTile(SE, w, 3);
  for (let k = 0; k < SE.HAZARD_MAX_ACTIVE; k++) assert.ok(hz.start(w, SE.EventKind.Volcano, x + k * 9, y, 'player'));
  assert.equal(hz.start(w, SE.EventKind.Volcano, x + 80, y, 'natural'), null, 'a natural hazard over the limit is dropped');
  const first = w.hazards.list[0];
  assert.ok(hz.start(w, SE.EventKind.Volcano, x + 90, y, 'player'), 'a player hazard makes room');
  assert.equal(w.hazards.list.length, SE.HAZARD_MAX_ACTIVE);
  assert.ok(!w.hazards.list.includes(first), 'the oldest jumped to its aftermath');
  for (const i of first.lava.tiles) assert.notEqual(w.hazards.tile[i], SE.HazardTile.Lava);
  assert.notEqual(hz.refusal(w, SE.EventKind.Plague, x, y), '', 'no rule yet');
  assert.equal(hz.start(w, SE.EventKind.Plague, x, y, 'player'), null);

  const t0 = process.hrtime.bigint();
  run(hz, w, 20);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 20;
  assert.ok(ms < 5, `${ms.toFixed(2)} ms per tick with ${SE.HAZARD_MAX_ACTIVE} eruptions`);
});

test('pixel rings are exact one-pixel circles', () => {
  const { SE } = makeSim(1, 'today');
  for (const r of [1, 3, 8, 24, 64]) {
    const px = SE.ringPixels(r);
    const seen = new Set();
    for (let k = 0; k < px.length; k += 2) {
      const d = Math.hypot(px[k], px[k + 1]);
      assert.ok(Math.abs(d - r) < 0.75, `radius ${r}: pixel at distance ${d.toFixed(2)}`);
      const key = `${px[k]},${px[k + 1]}`;
      assert.ok(!seen.has(key), 'every pixel once');
      seen.add(key);
    }
    for (let k = 0; k < px.length; k += 2) assert.ok(seen.has(`${-px[k]},${px[k + 1]}`) && seen.has(`${px[k]},${-px[k + 1]}`), 'symmetric');
  }
});

test('the show plays the omen before the hazard starts, then the column; reduced effects never shake', () => {
  const s = makeSim(4242, 'today');
  const { SE, world: w } = s;
  const hz = new SE.HazardSystem();
  const [x, y] = inlandTile(SE, w);
  const cam = { scrollX: x - 10, scrollY: y - 6, tilePx: 32, dpr: 1 };
  const play = (reduce) => {
    const show = new SE.FxShow();
    show.reduce = reduce;
    const particles = new SE.FxParticles();
    show.build(w, cam, 20, 12, 0, 0, particles);
    let started = null;
    show.stage(w, SE.EventKind.Volcano, x, y, () => (started = hz.start(w, SE.EventKind.Volcano, x, y, 'player')));
    const t0 = performance.now();
    const omen = show.build(w, cam, 20, 12, t0 + 100, 0.1, particles);
    assert.equal(started, null, 'nothing has happened yet during the omen');
    assert.ok(omen.tops.some((d) => d.id === 'smoke_puff'), 'smoke rises as the omen');
    const main = show.build(w, cam, 20, 12, t0 + SE.HAZARD_OMEN_MS[SE.EventKind.Volcano] + 1, 0.1, particles);
    assert.ok(started, 'the hazard started once the omen was over');
    const later = show.build(w, cam, 20, 12, t0 + SE.HAZARD_OMEN_MS[SE.EventKind.Volcano] + 1500, 0.1, particles);
    assert.ok(later.objects.some((d) => d.id === 'volcano_column'), 'the eruption column stands');
    assert.ok(later.objects.some((d) => d.id === 'crater_glow'), 'the active cone glows');
    hz.step(w);
    for (const h of w.hazards.list) SE.HAZARD_RULES[h.kind].finish(w, h);
    w.hazards.list.length = 0;
    return omen.shakes.length + main.shakes.length;
  };
  assert.ok(play(false) > 0, 'the ground trembles');
  assert.equal(play(true), 0, 'no shaking with reduced effects');
});

test('a scar heals no further than the tile was before, and trunks stand only where trees stood', () => {
  const { SE, world: w } = makeSim(4242, 'today');
  const [x, y] = inlandTile(SE, w);
  const steppe = SE.idx(x, y);
  const forest = SE.idx(x + 2, y);
  SE.setScar(w, steppe, SE.ScarKind.Burnt, SE.LANDSCAPE_LEVEL[SE.Landscape.Steppe]);
  SE.setScar(w, forest, SE.ScarKind.Burnt, SE.LANDSCAPE_LEVEL[SE.Landscape.Forest]);

  const show = new SE.FxShow();
  const cam = { scrollX: x - 10, scrollY: y - 6, tilePx: 32, dpr: 1 };
  const scene = show.build(w, cam, 20, 12, 0, 0, new SE.FxParticles());
  const trunks = (i) => scene.objects.filter((d) => d.id === 'charred_trunk' && Math.floor(d.x / 16) === i % SE.GRID_W).length;
  assert.equal(trunks(steppe), 0, 'no charred trunks on a burnt steppe');
  assert.ok(trunks(forest) > 0, 'charred trunks where the forest stood');

  // Past the minimum ticks, both tiles grown back to open land: the steppe has healed, the forest not yet.
  for (const i of [steppe, forest]) {
    w.hazards.scarAge[i] = SE.SCAR_MIN_TICKS[SE.ScarKind.Burnt];
    w.landscape[i] = SE.Landscape.Steppe;
  }
  SE.stepScars(w);
  assert.equal(w.hazards.scar[steppe], SE.ScarKind.None, 'the steppe is back to what it was');
  assert.equal(w.hazards.scar[forest], SE.ScarKind.Burnt, 'the forest is not back yet');
});

test('a scar laid under another takes over at the same age once the top one heals', () => {
  const { SE, world: w } = makeSim(4242, 'today');
  const [x, y] = inlandTile(SE, w);
  const i = SE.idx(x, y);
  SE.setScar(w, i, SE.ScarKind.Ash, SE.LANDSCAPE_LEVEL[SE.Landscape.Steppe]);
  SE.setScarUnder(w, i, SE.ScarKind.Fallout);
  assert.equal(w.hazards.scar[i], SE.ScarKind.Ash, 'the ash shows first');
  const age = SE.SCAR_MIN_TICKS[SE.ScarKind.Ash];
  w.hazards.scarAge[i] = age;
  w.landscape[i] = SE.Landscape.Steppe;
  SE.stepScars(w);
  assert.equal(w.hazards.scar[i], SE.ScarKind.Fallout, 'the fallout takes over');
  assert.equal(w.hazards.scarAge[i], age + 1, 'at the age the ash had');
  SE.setScar(w, i, SE.ScarKind.Burnt);
  assert.equal(w.hazards.scarNext[i], SE.ScarKind.Fallout, 'a fire over the fallout leaves it waiting below');

  const j = SE.idx(x + 2, y);
  SE.setScarUnder(w, j, SE.ScarKind.Fallout);
  assert.equal(w.hazards.scar[j], SE.ScarKind.Fallout, 'on a bare tile it lies at once');
});

test('fallout outlives the scars laid over it, ruins give way to a new city, windthrow fades in 12–16 ticks', () => {
  const { SE, world: w } = makeSim(4242, 'today');
  const [x, y] = inlandTile(SE, w);
  const i = SE.idx(x, y);
  SE.setScar(w, i, SE.ScarKind.Ash);
  SE.setScarUnder(w, i, SE.ScarKind.Fallout);
  SE.setScar(w, i, SE.ScarKind.Mud);
  assert.equal(w.hazards.scarNext[i], SE.ScarKind.Fallout, 'a flood over the ash keeps the fallout waiting');
  SE.setScar(w, i, SE.ScarKind.Basalt);
  assert.equal(w.hazards.scarNext[i], SE.ScarKind.None, 'fresh lava buries it');

  const r = SE.idx(x + 2, y);
  SE.setScar(w, r, SE.ScarKind.Ruins);
  w.tech[r] = SE.Tech.Stone;
  SE.stepScars(w);
  assert.equal(w.hazards.scar[r], SE.ScarKind.None, 'a new city clears the ruins');

  const t = SE.idx(x + 4, y);
  SE.setScar(w, t, SE.ScarKind.Windthrow);
  let ticks = 0;
  while (w.hazards.scar[t] === SE.ScarKind.Windthrow && ticks < 40) { SE.stepScars(w); ticks++; }
  const min = SE.SCAR_MIN_TICKS[SE.ScarKind.Windthrow];
  assert.ok(ticks > min && ticks <= min + 5, `windthrow gone after ${ticks} ticks`);
});

test('with the effect layer off, a staged hazard starts at once instead of waiting for its omen', () => {
  const { SE, world: w } = makeSim(4242, 'today');
  const hz = new SE.HazardSystem();
  const [x, y] = inlandTile(SE, w);
  const show = new SE.FxShow();
  show.build(w, { scrollX: x - 10, scrollY: y - 6, tilePx: 32, dpr: 1 }, 20, 12, 0, 0, new SE.FxParticles());
  let started = null;
  show.stage(w, SE.EventKind.Volcano, x, y, () => (started = hz.start(w, SE.EventKind.Volcano, x, y, 'player')));
  assert.equal(started, null, 'in view, the omen comes first');
  show.flush(w);
  assert.ok(started, 'the layer went off: the hazard starts');
});

test('windthrow keeps ageing while the storm has soaked the ground', () => {
  const { SE, world: w } = makeSim(4242, 'today');
  const [x, y] = inlandTile(SE, w);
  const i = SE.idx(x, y);
  SE.setScar(w, i, SE.ScarKind.Windthrow);
  w.hazards.tile[i] = SE.HazardTile.Wet;
  for (let t = 0; t < 5; t++) SE.stepScars(w);
  assert.equal(w.hazards.scarAge[i], 5, 'wet ground does not hold the scar');
  w.hazards.tile[i] = SE.HazardTile.Flood;
  SE.stepScars(w);
  assert.equal(w.hazards.scarAge[i], 5, 'standing water does');
});

test('a hazard lift goes through raiseCrust: no change, no stale terrain', () => {
  const { SE, world: w } = makeSim(777, 'today');
  w.terrainDirty = false;
  SE.hazardLift(w, SE.idx(10, 40), 0);
  assert.equal(w.terrainDirty, false);
});

test('the disaster tool fires once per tap: a drag does not set off one disaster per tile crossed', () => {
  const { SE } = makeSim(777, 'today');
  assert.equal(SE.App.isSingleShot(SE.Tool.TriggerEvent), true);
});
