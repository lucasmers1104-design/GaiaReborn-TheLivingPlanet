'use strict';
/*
 * Clownfish slipping out of the corals (src/clownfishlayer.ts), drawing only:
 * when they show (the date), where (stony reefs grazing fish grind sand out
 * of), how rarely (hash rounds, a calm after each trip, a cap in view) and
 * that a trip leaves a coral head and ends in one, over reef and lagoon water all the way.
 * Drawing them needs the effect atlas and a canvas.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const { loadSE, makeSim } = require('./helpers');

const SE = loadSE();
const L = SE.Landscape;
const M = SE.TERRAIN_MANIFEST;
const N = SE.SUBSPECIES_PER_CLASS;
const LC = SE.LIFE_COUNT;
const STONY = SE.SPECIES[SE.Life.Radiate].stages.findIndex((s) => s.reefBuilder === 'stony');
const RUGOSE = SE.SPECIES[SE.Life.Radiate].stages.findIndex((s) => s.reefBuilder === 'rugose');
const GRAZER = SE.SPECIES[SE.Life.Fish].stages.findIndex((s) => s.reefGrazer);
/** CoralKind.Stony (a const enum, inlined in the bundle). */
const CORAL_STONY = 2;
const FPS = 10;
/** The sea fills columns SEA[0]..SEA[1], coastal within COAST columns of either shore (as in reefs.test.js). */
const SEA = [112, 151];
const COAST = 6;

/** A warm planet with one sea strip, reefs of stage `coral` on its coastal sea and grazing fish on rows `fishRows`, `yearsAgo` before today. */
function reefWorld({ coral = STONY, fishRows = [0, 64], yearsAgo = 1e6 } = {}) {
  const s = makeSim(11);
  const w = s.world;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    const x = i % SE.GRID_W;
    const y = (i / SE.GRID_W) | 0;
    const sea = x >= SEA[0] && x <= SEA[1];
    const coast = sea && (x < SEA[0] + COAST || x > SEA[1] - COAST);
    w.elevation[i] = !sea ? 0.03 : coast ? -0.05 : -0.5;
    w.biome[i] = !sea ? SE.Biome.Forest : coast ? SE.Biome.Coast : SE.Biome.Ocean;
    w.temperature[i] = 26;
    w.moisture[i] = 0.6;
    w.riverLevel[i] = 0;
    w.riverFlow[i] = 0;
    w.riparian[i] = 0;
    w.tech[i] = SE.Tech.None;
    w.landscape[i] = sea ? L.Meadow : L.Forest;
    w.landscapeZone[i] = sea ? SE.ZONE_NONE : 4 | (3 << 3);
    w.substrate[i] = SE.Substrate.Soil;
    w.landscapeDensity[i] = 1;
    w.flora[i] = sea ? 0 : (1 << SE.Flora.Flowering) | (1 << SE.Flora.Broadleaf);
    w.vegetation[i] = sea ? 0 : 0.7;
    w.floraTop[i] = sea ? SE.Flora.None : SE.Flora.Broadleaf;
    for (let c = 0; c < LC; c++) { w.lifeDensity[i * LC + c] = 0; w.lifeStage[i * LC + c] = 0; }
    if (coast) {
      w.lifeDensity[i * LC + SE.Life.Radiate] = 0.5;
      w.lifeStage[i * LC + SE.Life.Radiate] = coral;
    }
    if (coast && y >= fishRows[0] && y < fishRows[1]) {
      w.lifeDensity[i * LC + SE.Life.Fish] = 0.5;
      w.lifeStage[i * LC + SE.Life.Fish] = GRAZER;
    }
  }
  w.lifeStageCounts.fill(0);
  w.lifeStageCounts[SE.Life.Radiate * N + coral] = 100;
  w.lifeStageCounts[SE.Life.Fish * N + GRAZER] = 100;
  w.evo.developed.set('flowering', { tick: 0, years: 1e9 });
  w.absoluteYears = SE.PLANET_AGE - yearsAgo;
  w.revision++;
  for (const e of SE.reefMilestones(w, true)) w.evo.chronicle.push(e);
  const f = new SE.TerrainField();
  f.refresh(w);
  return { w, f };
}

/** The terrain atlas PNG (indexed, filter 0 on every row) as palette indices. */
function atlasIndices() {
  const buf = Buffer.from(SE.TERRAIN_ATLAS_PNG.slice(SE.TERRAIN_ATLAS_PNG.indexOf(',') + 1), 'base64');
  const idat = [];
  for (let p = 8; p < buf.length;) {
    const len = buf.readUInt32BE(p);
    if (buf.toString('ascii', p + 4, p + 8) === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(M.width * M.height);
  for (let y = 0; y < M.height; y++) px.set(raw.subarray(y * (M.width + 1) + 1, (y + 1) * (M.width + 1)), y * M.width);
  return px;
}
const art = SE.LandArt.fromIndices(atlasIndices());

/** Reef water as composed (cays and palm crowns hide the sea), by world art pixel: what the layer reads off LandMotion. */
function composedSea(f) {
  const water = SE.clownfishWater(art);
  const CHUNK = 16;
  const MARGIN = 2;
  const PX = CHUNK * 16;
  const W = SE.GRID_W * 16;
  const side = PX + 2 * MARGIN;
  const composer = new SE.LandComposer(art);
  const seas = new Map();
  return (x, y) => {
    if (y < 0 || y >= SE.GRID_H * 16) return false;
    const wx = ((x % W) + W) % W;
    const cx = Math.floor(wx / PX);
    const cy = Math.floor(y / PX);
    const key = cy * 1000 + cx;
    if (!seas.has(key)) {
      composer.compose(f, cx * CHUNK, cy * CHUNK, CHUNK, CHUNK, MARGIN, new Uint32Array(side * side), null);
      seas.set(key, composer.motion.sea);
    }
    const sea = seas.get(key);
    return !!sea && water[sea[(y % PX) * PX + (wx % PX)]] === 1;
  };
}

const tilesOf = (f) => {
  const out = [];
  for (let i = 0; i < SE.TILE_COUNT; i++) if (SE.clownfishReef(f, i)) out.push(i);
  return out;
};

test('clownfish live on every reef, at any time, with or without grazing fish', () => {
  const { f } = reefWorld({ fishRows: [0, 0], yearsAgo: 300e6 });
  const tiles = tilesOf(f);
  assert.ok(tiles.length > 10, `${tiles.length} clownfish tiles`);
  for (let i = 0; i < SE.TILE_COUNT; i++) assert.equal(SE.clownfishReef(f, i), f.reef[i] !== 0);
  const rugose = reefWorld({ coral: RUGOSE }).f;
  assert.ok(tilesOf(rugose).length > 10, 'on a rugose reef too');
  assert.ok(SE.clownfishHomes(rugose, art, tilesOf(rugose)[0] % SE.GRID_W, (tilesOf(rugose)[0] / SE.GRID_W) | 0).length > 0, 'rugose heads are homes');
  // They swim over lagoon, reef and coral, never over the open sea's blue.
  const water = SE.clownfishWater(art);
  for (const k of [...M.ramps.water, ...M.ramps.shelf]) assert.equal(water[k], 0);
  for (const k of [...M.ramps.waterWarm, ...M.ramps.reefUnder, ...M.ramps.coral]) assert.equal(water[k], 1);
});

test('a reef tile makes a trip only now and then, never two at once', () => {
  let active = 0;
  let rounds = 0;
  for (let tile = 1000; tile < 1200; tile++) {
    let last = null;
    for (let clock = 0; clock < 600; clock += 0.5) {
      const r = SE.clownfishRound(tile, clock);
      if (!r || (last && last[0] === r[0])) continue;
      if (last) assert.ok(r[1] - last[1] >= 7.6, 'trips of one tile never overlap');
      last = r;
      active++;
    }
    rounds += 600 / 35;
  }
  const share = active / rounds;
  assert.ok(share > 0.2 && share < 0.5, `a trip in ${(share * 100).toFixed(0)} % of rounds`);
});

test('in view, a trip keeps the others in for a while, and at most CLOWNFISH_MAX run at once', () => {
  const tiles = Array.from({ length: 150 }, (_, k) => 3000 + k * 7);
  for (const calmed of [true, false]) {
    const live = [];
    let admitted = 0;
    const decided = new Set();
    for (let clock = 0; clock < 900; clock += 1 / 30) {
      for (const tile of tiles) {
        const r = SE.clownfishRound(tile, clock);
        if (!r || clock < r[1] || decided.has(`${tile}:${r[0]}`)) continue;
        decided.add(`${tile}:${r[0]}`);
        if (!SE.clownfishAdmit(live, r[1])) continue;
        const running = live.filter((t) => t.end > r[1]).length;
        assert.ok(running < SE.CLOWNFISH_MAX, `${running + 1} trips at once`);
        if (calmed) assert.ok(live.every((t) => t.calm <= r[1]), 'not while another keeps the reef calm');
        live.push({ start: r[1], end: r[1] + 7.6, calm: calmed ? r[1] + SE.clownfishCalm(tile, r[0]) : r[1] });
        admitted++;
      }
    }
    const perMinute = admitted / 15;
    if (calmed) assert.ok(perMinute > 4 && perMinute < 15, `${perMinute.toFixed(1)} trips per minute on a large reef`);
    else assert.ok(live.some((t, k) => k >= 2 && live[k - 2].end > t.start), 'without the calm the cap holds them back');
  }
});

test('a trip slips out of a large coral head, loops over reef water and slips back into a head', () => {
  const { f } = reefWorld();
  const sea = composedSea(f);
  const { NX, NY } = { NX: SE.HAZARD_NX, NY: SE.HAZARD_NY };
  let trips = 0;
  let pairs = 0;
  for (const i of tilesOf(f).slice(0, 30)) {
    const homes = SE.clownfishHomes(f, art, i % SE.GRID_W, (i / SE.GRID_W) | 0);
    assert.ok(homes.length > 0, 'a stony reef tile has coral heads');
    for (let round = 0; round < 6; round++) {
      const t = SE.clownfishTrip(i, round, 100, homes, sea, FPS);
      if (!t) continue;
      trips++;
      if (t.fish === 2) pairs++;
      assert.ok(t.reach >= 6 && t.reach <= 14, `reach ${t.reach}`);
      for (let k = 0; k < t.fish; k++) {
        const seen = [];
        for (let u = 0; u < t.end - t.start + 0.1; u += 0.01) {
          const at = SE.clownfishAt(t, k, u, FPS);
          if (at) seen.push([u, ...at]);
        }
        const [u0, x0, y0, f0] = seen[0];
        const [u1, x1, y1, f1] = seen[seen.length - 1];
        const off = (p, q) => p[0] === q[0] + k * t.ox && p[1] === q[1] + k * t.oy;
        assert.ok(homes.slice(0, 3).some((h) => off([x0, y0], h)), `fish ${k} leaves one of the largest heads`);
        assert.ok(homes.some((h) => off([x1, y1], h)), `fish ${k} ends in a head`);
        assert.equal(f0 % 6, 0, 'slipping out: deep and dim first');
        assert.equal(f1 % 6, 0, 'slipping in: deep and dim last');
        const frames = seen.map((s) => s[3] % 6).filter((v, n, a) => n === 0 || v !== a[n - 1]);
        assert.deepEqual(frames.slice(0, 3), [0, 1, 2], 'out: 0, 1, then the swim cycle');
        assert.deepEqual(frames.slice(-2), [1, 0], 'in: 1, 0');
        assert.ok(frames.slice(2, -2).every((v) => v >= 2), 'swimming in between');
        const time = u1 - u0;
        assert.ok(time >= 3.98 && time <= 7.02, `a fish is out ${time.toFixed(2)} s`);
        if (k === 1) {
          assert.ok(Math.abs(u0 - t.trail) < 0.011 && t.trail >= 0.3 && t.trail <= 0.6, 'the second trails by 0.3–0.6 s');
          const gap = Math.max(Math.abs(t.ox), Math.abs(t.oy));
          assert.ok(gap >= 1 && gap <= 2, `and ${gap} px aside`);
        }
        for (let n = 0; n < seen.length; n++) {
          const [, x, y, fr] = seen[n];
          assert.ok(sea(x, y), `fish ${k} over reef water at ${x},${y}`);
          // Heading: the direction drawn points the way the fish moves.
          const ahead = seen[Math.min(seen.length - 1, n + 20)];
          const dx = ahead[1] - x;
          const dy = ahead[2] - y;
          const d = Math.floor(fr / 6);
          if (Math.hypot(dx, dy) >= 2 && fr % 6 >= 2) assert.ok(NX[d] * dx + NY[d] * dy > 0, `heading ${d} against the motion ${dx},${dy}`);
        }
      }
    }
  }
  assert.ok(trips >= 60, `${trips} trips`);
  assert.ok(pairs > trips * 0.35 && pairs < trips * 0.85, `${pairs} of ${trips} trips by a pair`);
});

test('the first clownfish caught with the Examine tool go into the chronicle once', () => {
  const w = new SE.WorldState();
  const evolution = new SE.EvolutionSystem(new SE.LifeSystem(), new SE.FloraSystem());
  const seen = SE.migrationMilestone(w, 'clownfish', 42);
  assert.equal(seen.key, 'sight:clownfish');
  assert.equal(seen.title, 'Clownfische entdeckt');
  assert.equal(seen.at, 42);
  assert.equal(seen.icon, SE.evoIcon('fish'));
  assert.equal(SE.MIGRATION_INFO.clownfish.title, 'Clownfische im Riff');
  evolution.record(w, seen);
  assert.equal(SE.migrationMilestone(w, 'clownfish', 7), null, 'once');
});

test('the layer reports no clownfish in sight before it has drawn any', () => {
  const layer = new SE.ClownfishLayer();
  assert.equal(layer.activeOn(new SE.WorldState(), 0, 0), false);
});

test('the Examine notes of every reef tell that clownfish live there', () => {
  const { w } = reefWorld({ coral: RUGOSE, fishRows: [0, 0], yearsAgo: 400e6 });
  const m = SE.reefMap(w);
  const reef = m.coral.findIndex((k) => k > 0);
  assert.equal(SE.reefNotes(w, reef).at(-1), 'Clownfische leben in Seeanemonen dazwischen');
});
