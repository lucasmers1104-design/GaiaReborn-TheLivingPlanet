'use strict';
/*
 * The height task's contract (docs/hoehe-spec.md §3.1, §3.2): one write path
 * for the crust, a mountain type per tile that rides the plates, and a save
 * format that keeps it — old saves get it from their belts.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE, makeSim } = require('./helpers');

const SE = loadSE();
const ctx = (s) => ({ world: s.world, params: s.params, geo: s.geo, history: s.history });

function hash(arr) {
  let h = 0x811c9dc5;
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 0x01000193);
  return h >>> 0;
}

test('raiseCrust clamps, marks the rivers stale and records the mountain type', () => {
  const { world } = makeSim(7);
  const i = SE.idx(10, 60);
  world.elevation[i] = 0.95;
  world.upliftKind[i] = 0;
  world.terrainDirty = false;
  SE.raiseCrust(world, i, 0.2, 4);
  assert.equal(world.elevation[i], 1, 'clamped at the top of the scale');
  assert.equal(world.upliftKind[i], 4, 'raising records the kind');
  assert.equal(world.terrainDirty, true);
  SE.raiseCrust(world, i, -2.5, 0);
  assert.equal(world.elevation[i], -1, 'clamped at the bottom');
  assert.equal(world.upliftKind[i], 4, 'lowering keeps the kind');
});

test('a new planet types its belts: coastal ranges and fold belts', () => {
  const { world } = makeSim(777);
  const counts = new Array(SE.UPLIFT_KIND_COUNT).fill(0);
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    counts[world.upliftKind[i]]++;
    if (world.uplift[i] > 0) assert.notEqual(world.upliftKind[i], 0, 'every belt tile has a type');
  }
  assert.ok(counts[1] > 0 && counts[2] > 0, `fold ${counts[1]}, coastal ${counts[2]}`);
});

test('the mountain type rides the plates with the crust', () => {
  const s = makeSim(777);
  const w = s.world;
  const before = Uint8Array.from(w.upliftKind);
  const rows = SE.GRID_H / SE.PLATE_COUNT;
  s.geo.driftOffsets = [0.9999, 0, 0, 0];
  const shifts = w.driftShifts;
  s.geo.step(w, s.params);
  assert.equal(w.driftShifts, shifts + 1, 'the first plate shifted by one tile');
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < SE.GRID_W; x++) {
      assert.equal(w.upliftKind[SE.idx(x, y)], before[SE.idx(SE.wrapX(x - 1), y)]);
    }
  }
  for (let y = rows; y < SE.GRID_H; y++) {
    for (let x = 0; x < SE.GRID_W; x++) assert.equal(w.upliftKind[SE.idx(x, y)], before[SE.idx(x, y)]);
  }
});

test('format 8 keeps the mountain type; a format-7 save gets it from its belts', async () => {
  const a = makeSim(31);
  for (let k = 0; k < 5; k++) a.tick();
  // A type no belt would give, so the round trip is not passed by re-deriving it.
  a.world.upliftKind[SE.idx(3, 3)] = 4;
  const text = await SE.SaveSystem.encode(SE.SaveSystem.serialize(ctx(a)));
  const doc = await SE.SaveSystem.decode(text);
  assert.equal(doc.version, 8);
  const b = makeSim(1);
  SE.SaveSystem.load(doc, ctx(b), b.life, b.flora);
  assert.equal(hash(b.world.upliftKind), hash(a.world.upliftKind), 'the type survives the round trip');

  const bad = JSON.parse(JSON.stringify(doc));
  const bytes = Buffer.from(bad.fields.upliftKind, 'base64');
  bytes[9] = 200;
  bad.fields.upliftKind = bytes.toString('base64');
  assert.throws(() => SE.SaveSystem.load(bad, ctx(b), b.life, b.flora), (e) => e instanceof SE.SaveCorrupt);

  const old = JSON.parse(JSON.stringify(doc));
  old.version = 7;
  delete old.fields.upliftKind;
  const c = makeSim(1);
  SE.SaveSystem.load(old, ctx(c), c.life, c.flora);
  const expect = new SE.WorldState();
  expect.elevation.set(c.world.elevation);
  expect.uplift.set(c.world.uplift);
  SE.classifyBelts(expect);
  assert.equal(hash(c.world.upliftKind), hash(expect.upliftKind), 'migrated from the belts');
});

/*
 * Geology (docs/hoehe-spec.md §3.3, §3.4): typed ranges at generation,
 * uplift sources, hotspots, erosion and deposition.
 */

/**
 * Crest lines: land tiles of a fold belt or coastal range at 900 m or more
 * that stand higher than both neighbours along at least two of the four axes
 * (E-W, N-S and the diagonals). A range is an 8-connected run of them; its
 * length is its tile count. Returns the lengths, longest first. The same
 * definition as the "crests" line of tools/relief-probe.js.
 */
function crestRanges(w) {
  const { GRID_W, GRID_H, TILE_COUNT } = SE;
  const e = w.elevation;
  const crest = new Uint8Array(TILE_COUNT);
  const at = (x, y) => (y < 0 || y >= GRID_H ? -9 : e[SE.idx(SE.wrapX(x), y)]);
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const i = SE.idx(x, y);
      const k = w.upliftKind[i];
      if (e[i] < 0.2 || (k !== 1 && k !== 2)) continue;
      const axes = [[1, 0], [0, 1], [1, 1], [1, -1]].filter(([dx, dy]) => e[i] > at(x + dx, y + dy) && e[i] > at(x - dx, y - dy)).length;
      if (axes >= 2) crest[i] = 1;
    }
  }
  const seen = new Uint8Array(TILE_COUNT);
  const out = [];
  for (let s = 0; s < TILE_COUNT; s++) {
    if (!crest[s] || seen[s]) continue;
    seen[s] = 1;
    const stack = [s];
    let n = 0;
    while (stack.length) {
      const i = stack.pop();
      n++;
      const x = i % GRID_W;
      const y = (i - x) / GRID_W;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (y + dy < 0 || y + dy >= GRID_H) continue;
          const j = SE.idx(SE.wrapX(x + dx), y + dy);
          if (crest[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
        }
      }
    }
    out.push(n);
  }
  return out.sort((a, b) => b - a);
}

test('a new planet has long typed ranges: coastal, fold, fossil fold and island arcs', () => {
  for (const seed of [777, 2718, 4242]) {
    const w = new SE.WorldState();
    w.reset(seed, SE.OCEAN_FRACTION, 'random');
    const ranges = crestRanges(w);
    assert.ok(ranges.filter((n) => n >= 25).length >= 3, `seed ${seed}: crest ranges ${ranges.slice(0, 5).join(' ')}`);
    let arc = 0, fold = 0, fossil = 0, islands = 0, peak = 0;
    for (let i = 0; i < SE.TILE_COUNT; i++) {
      if (w.elevation[i] < 0) continue;
      const k = w.upliftKind[i];
      if (k === 2) arc++;
      if (k === 1 && w.uplift[i] > 0) fold++;
      if (k === 1 && w.uplift[i] === 0) fossil++;
      if (k === 3) islands++;
      if (k === 1 || k === 2) peak = Math.max(peak, w.elevation[i] * SE.ELEVATION_KM);
    }
    assert.ok(arc > 0 && fold > 0 && fossil > 0 && islands > 0, `seed ${seed}: arc ${arc} fold ${fold} fossil ${fossil} island arcs ${islands}`);
    assert.ok(peak >= 3.5 && peak <= 4.5, `seed ${seed}: highest crest ${peak.toFixed(2)} km`);
  }
});

test('the young Earth types its island arcs, today\'s Earth its belts', () => {
  const young = new SE.WorldState();
  young.reset(777, SE.OCEAN_FRACTION, 'youngEarth');
  let islands = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) if (young.elevation[i] >= 0 && young.upliftKind[i] === 3) islands++;
  assert.ok(islands > 0, 'island arcs typed');

  const today = new SE.WorldState();
  today.reset(1, SE.OCEAN_FRACTION, 'today');
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    if (today.uplift[i] > 0) assert.ok([1, 2, 5].includes(today.upliftKind[i]), 'every belt is a fold belt, a coastal range or an active volcano');
  }
});

test('relief stands still in the Civilization time scale', () => {
  // After the geological ages, as in a game: a fresh planet's river plains and
  // shelves first fill up with what its ranges shed.
  const run = (scale) => {
    const s = makeSim(777);
    s.params.geo.drift = 0;
    for (let t = 0; t < 800; t++) { s.geo.step(s.world, s.params); s.world.ticks++; }
    s.world.timeScale = scale;
    const before = Float32Array.from(s.world.elevation);
    for (let t = 0; t < 400; t++) { s.geo.step(s.world, s.params); s.world.ticks++; }
    let max = 0;
    let sum = 0;
    for (let i = 0; i < SE.TILE_COUNT; i++) {
      const d = Math.abs(s.world.elevation[i] - before[i]);
      max = Math.max(max, d);
      sum += d;
    }
    return { max, mean: sum / SE.TILE_COUNT };
  };
  const civ = run(2);
  const geologic = run(0);
  // 0.005 is 22 m, on the one tile that moves most, over 40,000 years.
  assert.ok(civ.max < 0.005 && civ.mean < geologic.mean / 100, `civilization: max ${civ.max}, mean ${civ.mean}`);
  assert.ok(geologic.max > 0.02, `geologic: max ${geologic.max}, mean ${geologic.mean}`);
});

/** A lowland continent with two straight ranges, one active and one fossil, for geology without climate or drift. */
function twoRanges() {
  const ACTIVE = 80, FOSSIL = 170, LOW = 0.08, TOP = 0.75, SIGMA = 2;
  const w = new SE.WorldState();
  w.elevation.fill(-0.5);
  w.moisture.fill(1);
  for (let y = 30; y < 98; y++) {
    for (let x = 30; x < 226; x++) {
      const i = SE.idx(x, y);
      w.elevation[i] = LOW;
      w.moisture[i] = SE.UPLIFT_BALANCE_MOISTURE;
      for (const cx of [ACTIVE, FOSSIL]) {
        const dx = x - cx;
        if (Math.abs(dx) > 6 || y < 40 || y > 87) continue;
        w.elevation[i] = Math.max(w.elevation[i], LOW + (TOP - LOW) * Math.exp(-(dx * dx) / (2 * SIGMA * SIGMA)));
        if (Math.abs(dx) > 4) continue;
        w.upliftKind[i] = 1;
        if (cx === ACTIVE) w.uplift[i] = 1;
      }
    }
  }
  SE.balanceUplift(w);
  SE.RiverSystem.rebuild(w);
  /** Height of a range's crest over the lowland 12-14 tiles to either side. */
  const excess = (cx) => {
    let crest = 0, base = 0;
    for (let y = 50; y < 78; y++) {
      crest += w.elevation[SE.idx(cx, y)];
      for (const dx of [-14, -13, -12, 12, 13, 14]) base += w.elevation[SE.idx(cx + dx, y)];
    }
    return crest / 28 - base / (28 * 6);
  };
  return { w, active: () => excess(ACTIVE), fossil: () => excess(FOSSIL) };
}

test('a fossil range wears down to half in about a thousand ticks while an active one holds', () => {
  const { w, active, fossil } = twoRanges();
  const a0 = active();
  const f0 = fossil();
  const erosion = new SE.Erosion();
  const belts = new SE.BeltUplift();
  const span = SE.EROSION_INTERVAL;
  const at = {};
  for (let t = 1; t <= 1500; t++) {
    if (t % span === 0) {
      erosion.pass(w, span);
      belts.apply(w, span);
    }
    w.ticks = t;
    SE.RiverSystem.maybeRebuild(w);
    if (t % 250 !== 0) continue;
    at[t] = fossil() / f0;
    const held = active() / a0;
    assert.ok(held > 0.9 && held < 1.1, `tick ${t}: the active range at ${held.toFixed(3)} of its height`);
  }
  assert.ok(at[750] > 0.5, `fossil at 750 ticks: ${at[750].toFixed(3)}`);
  assert.ok(at[1500] < 0.5, `fossil at 1500 ticks: ${at[1500].toFixed(3)}`);
});

test('erosion moves crust but never makes or drowns land', () => {
  const { world } = makeSim(2718);
  const land = () => { let n = 0; for (let i = 0; i < SE.TILE_COUNT; i++) if (world.elevation[i] >= 0) n++; return n; };
  const sum = () => { let s = 0; for (let i = 0; i < SE.TILE_COUNT; i++) s += world.elevation[i]; return s; };
  const before = Float32Array.from(world.elevation);
  const tiles = land();
  const total = sum();
  const erosion = new SE.Erosion();
  for (let k = 0; k < 20; k++) erosion.pass(world, 8);
  assert.equal(land(), tiles, 'no land made or drowned');
  let moved = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    moved = Math.max(moved, Math.abs(world.elevation[i] - before[i]));
    if (before[i] < 0 && world.elevation[i] > before[i]) assert.ok(world.elevation[i] <= SE.SHELF_FILL_CAP + 1e-6, 'a shelf fills only to just below sea level');
  }
  assert.ok(moved > 0.01, `crust moved: ${moved}`);
  const balance = sum() + erosion.exported - total;
  assert.ok(Math.abs(balance) < 1e-3, `mass balance ${balance}, carried off the shelf ${erosion.exported}`);
});

test('a hotspot leaves a chain of volcanoes on the plate drifting over it', () => {
  const w = new SE.WorldState();
  w.seed = 4242;
  w.elevation.fill(-0.45);
  w.moisture.fill(1);
  SE.RiverSystem.rebuild(w);
  const spots = SE.hotspotsOf(w.seed);
  assert.ok(spots.length >= 3 && spots.length <= 6, `${spots.length} hotspots`);
  const geo = new SE.GeoSystem();
  const params = new SE.ModelParams();
  for (let t = 0; t < 5000; t++) { geo.step(w, params); w.ticks++; }
  assert.ok(w.driftShifts > 0, 'the plates moved');
  for (const h of spots) {
    const track = [];
    for (let x = 0; x < SE.GRID_W; x++) if (w.upliftKind[SE.idx(x, h.y)] === 4) track.push(x);
    const islands = track.filter((x) => w.elevation[SE.idx(x, h.y)] >= 0).length;
    assert.ok(track.length >= 3 && islands >= 1, `hotspot at ${h.x},${h.y}: track ${track.join(',')}, ${islands} above the sea`);
  }
});

test('the river network is rebuilt right after a plate shift, not up to 31 ticks later', () => {
  const s = makeSim(777);
  for (let k = 0; k < 3; k++) s.tick();
  const w = s.world;
  assert.notEqual(w.ticks % 32, 0, 'off the regular rebuild tick');
  s.geo.driftOffsets = [0.9999, 0, 0, 0];
  const shifts = w.driftShifts;
  s.tick();
  assert.equal(w.driftShifts, shifts + 1, 'a plate shifted');
  let orphans = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) if (w.elevation[i] >= 0 && w.riverDown[i] < 0) orphans++;
  assert.equal(orphans, 0, 'every land tile drains somewhere');
});

test('erosion on a plate-shift tick carries its load down the shifted rivers', () => {
  const run = (fresh) => {
    const s = makeSim(777);
    const w = s.world;
    assert.equal(w.ticks % SE.EROSION_INTERVAL, 0, 'an erosion tick');
    s.geo.driftOffsets = [0.9999, 0, 0, -0.9999];
    if (!fresh) { s.geo.step(w, s.params); return w.elevation; }
    // The same tick by hand, with the rivers rebuilt between drift and erosion.
    s.geo.drift(w, SE.mul(s.params.geo.drift) * SE.geoTimeFactor(w));
    SE.RiverSystem.rebuild(w);
    s.geo.vertical(w, s.params, SE.mul(s.params.geo.coreHeat));
    return w.elevation;
  };
  const stepped = run(false);
  const fresh = run(true);
  let diff = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) diff = Math.max(diff, Math.abs(stepped[i] - fresh[i]));
  assert.equal(diff, 0, `elevation off by up to ${diff}`);
});

test('plates stand still in human time scales, like erosion and uplift', () => {
  const s = makeSim(777);
  const w = s.world;
  w.timeScale = SE.TimeScale.Civilized;
  s.geo.driftOffsets = [0.9999, 0, 0, 0];
  const shifts = w.driftShifts;
  s.geo.step(w, s.params);
  assert.equal(w.driftShifts, shifts, '100 years do not move a plate by a tile');
});

test('Kernwärme off 0.5 neither empties nor saturates the mantle field', () => {
  const spread = (heat) => {
    const s = makeSim(12345);
    s.params.geo.coreHeat = heat;
    s.params.geo.drift = 0;
    const w = s.world;
    for (let t = 0; t < 400; t++) { s.geo.step(w, s.params); w.ticks++; }
    let lo = 1, hi = 0;
    for (const v of w.magma) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    return hi - lo;
  };
  const calibrated = spread(0.5);
  for (const heat of [0.4, 0.6]) {
    const sp = spread(heat);
    assert.ok(sp > calibrated * 0.8, `core heat ${heat}: magma spread ${sp.toFixed(3)}, calibrated ${calibrated.toFixed(3)}`);
  }
});
