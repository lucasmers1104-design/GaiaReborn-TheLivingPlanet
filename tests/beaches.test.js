'use strict';
/*
 * Tropical sandy beaches and coconut palms (src/beaches.ts), drawing only:
 * a beach lies on the first land tile next to open, non-Arctic sea, low,
 * warm, not wet, in stretches; palms come PALM_DELAY_YEARS after the
 * flowering plants, on some beach tiles, more often in the tropics than on
 * warm coasts.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const { loadSE, makeSim } = require('./helpers');

const SE = loadSE();
const F = SE.Flora;
const L = SE.Landscape;
const M = SE.TERRAIN_MANIFEST;
const FLOWERING = 1 << F.Flowering;
const GRASSES = 1 << F.Grasses;
// TempClass / MoistClass are const enums (gone at runtime): Cool 2, Warm 3, Tropical 4; Moist 3.
const zone = (temp, moist = 3) => temp | (moist << 3);
const TROPICAL = zone(4);
const WARM = zone(3);
const COOL = zone(2);

const tile = (x, y) => y * SE.GRID_W + x;
/** The sea fills columns SEA[0]..SEA[1] over every row; the coast is the land column on either side. */
const SEA = [100, 139];
const COAST = [SEA[0] - 1, SEA[1] + 1];

/**
 * A land planet with one sea strip. Every land tile has zone `z`, height
 * `elev`, landscape `ls` and the flowering plants (with grasses); the sea
 * is `seaBiome`. The flowering plants arose at year 1e9; the clock stands
 * `age` years later.
 */
function coast({ z = TROPICAL, elev = SE.BEACH_MAX_ELEVATION / 2, ls = L.Meadow, seaBiome = SE.Biome.Ocean, age = SE.PALM_DELAY_YEARS } = {}) {
  const s = makeSim(11);
  const w = s.world;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    const x = i % SE.GRID_W;
    const sea = x >= SEA[0] && x <= SEA[1];
    w.elevation[i] = sea ? -0.3 : elev;
    w.biome[i] = sea ? seaBiome : SE.Biome.Grass;
    w.temperature[i] = 26;
    w.moisture[i] = 0.5;
    w.riverLevel[i] = 0;
    w.riparian[i] = 0;
    w.tech[i] = SE.Tech.None;
    w.landscape[i] = sea ? L.Meadow : ls;
    w.landscapeZone[i] = sea ? SE.ZONE_NONE : z;
    w.substrate[i] = SE.Substrate.Soil;
    w.landscapeDensity[i] = 1;
    w.flora[i] = sea ? 0 : FLOWERING | GRASSES;
    w.vegetation[i] = sea ? 0 : 0.5;
    w.floraTop[i] = sea ? F.None : F.Grasses;
  }
  w.absoluteYears = 1e9 + age;
  w.evo.developed.set('flowering', { tick: 0, years: 1e9 });
  return w;
}

const beachCount = (w) => {
  let n = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) n += SE.isBeach(w, i) ? 1 : 0;
  return n;
};

const field = (w) => {
  const f = new SE.TerrainField();
  f.refresh(w);
  return f;
};

test('beaches lie only on the first land column next to the sea, in stretches', () => {
  const w = coast();
  let coastTiles = 0;
  let beaches = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    const x = i % SE.GRID_W;
    const onCoast = COAST.includes(x);
    coastTiles += onCoast ? 1 : 0;
    if (SE.isBeach(w, i)) {
      assert.ok(onCoast, `beach off the coast at x ${x}`);
      beaches++;
    }
  }
  assert.ok(beaches > 0.1 * coastTiles, `some coast is beach: ${beaches} of ${coastTiles}`);
  assert.ok(beaches < coastTiles, `not all of the coast: ${beaches} of ${coastTiles}`);
});

test('no beaches on cool coasts, marsh, wetland, high ground or next to Arctic sea', () => {
  assert.ok(beachCount(coast({ z: WARM })) > 0, 'warm coasts have beaches');
  assert.equal(beachCount(coast({ z: COOL })), 0, 'cool');
  assert.equal(beachCount(coast({ ls: L.Marsh })), 0, 'marsh');
  assert.equal(beachCount(coast({ z: WARM, ls: L.Swampforest })), 0, 'warm swamp forest');
  assert.equal(beachCount(coast({ z: WARM | SE.ZONE_WETLAND })), 0, 'warm wetland zone');
  assert.ok(beachCount(coast({ ls: L.Swampforest })) > 0, 'tropical swamp coasts get beach stretches');
  assert.ok(beachCount(coast({ z: TROPICAL | SE.ZONE_WETLAND })) > 0, 'tropical wetland coasts get beach stretches');
  assert.equal(beachCount(coast({ elev: SE.BEACH_MAX_ELEVATION + 1e-3 })), 0, 'high ground (elevation is float32, so just above the bound)');
  assert.equal(beachCount(coast({ seaBiome: SE.Biome.Arctic })), 0, 'Arctic sea');
});

test('palms arrive PALM_DELAY_YEARS after the flowering plants, on some beach tiles', () => {
  const w = coast({ age: 0 });
  assert.equal(SE.PALM_DELAY_YEARS, 45e6);
  assert.equal(SE.palmsArrived(w), false);
  w.absoluteYears = 1e9 + SE.PALM_DELAY_YEARS - 1;
  assert.equal(SE.palmsArrived(w), false);
  w.absoluteYears = 1e9 + SE.PALM_DELAY_YEARS;
  assert.equal(SE.palmsArrived(w), true);
  w.evo.developed.delete('flowering');
  assert.equal(SE.palmsArrived(w), false, 'no flowering plants, no palms');

  const early = coast({ age: SE.PALM_DELAY_YEARS - 1 });
  const fe = field(early);
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    assert.equal(SE.beachPalms(early, i, false), 0);
    assert.equal(fe.palm[i], 0, 'no palms before they arrive');
  }

  const late = coast();
  const fl = field(late);
  let palms = 0;
  let beaches = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    const beach = SE.isBeach(late, i);
    if (!beach) assert.equal(fl.palm[i], 0, 'none off the beach');
    else {
      beaches++;
      assert.equal(fl.palm[i], SE.beachPalms(late, i, true));
      assert.ok(fl.palm[i] <= 2);
      palms += fl.palm[i] > 0 ? 1 : 0;
    }
  }
  assert.ok(palms > 0 && palms < beaches, `palms on some beach tiles: ${palms} of ${beaches}`);

  const count = (f) => f.palm.reduce((n, p) => n + (p > 0 ? 1 : 0), 0);
  const warm = count(field(coast({ z: WARM })));
  assert.ok(warm > 0 && warm < palms, `warm beaches carry fewer palms: ${warm} vs ${palms} tropical`);
  const bare = coast();
  for (let i = 0; i < SE.TILE_COUNT; i++) bare.flora[i] &= ~FLOWERING;
  assert.equal(count(field(bare)), palms, 'once arrived, palms need no flowering plants on or near the beach');
});

test('beaches and palms are fixed per tile: the same input gives the same answer', () => {
  const a = coast();
  const b = coast();
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    assert.equal(SE.isBeach(a, i), SE.isBeach(b, i));
    assert.equal(SE.beachPalms(a, i, true), SE.beachPalms(b, i, true));
  }
  assert.deepEqual([...field(a).palm], [...field(b).palm]);
});

test('beach tiles show sand without landscape objects; a tile is redrawn exactly when it gains a palm', (t) => {
  const T = SE.LandTables.shared();
  const sand = T.materialKey('beach');
  const before = coast({ age: 0 });
  const after = coast();
  const fb = field(before);
  const fa = field(after);
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    if (SE.isBeach(after, i)) {
      assert.equal(fa.scene[i], SE.LAND_SCENE_NONE, 'no landscape objects on the beach');
      if (sand) assert.equal(fa.key[i], sand, 'beach material');
    }
    assert.equal(fa.sig[i] !== fb.sig[i], fa.palm[i] > 0, `tile ${i}: redrawn exactly when it gains a palm`);
  }
  if (!sand) t.diagnostic('atlas has no beach material yet: key not checked');
});

/** The atlas PNG (indexed, filter 0 on every row) as palette indices. */
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

test('on the map: coconut palms stand on the beach tiles that carry them', (t) => {
  if (!M.objects.coconut_palm) {
    t.skip('atlas has no coconut_palm yet (regenerated by the lead)');
    return;
  }
  const art = SE.LandArt.fromIndices(atlasIndices());
  const w = coast();
  const f = field(w);
  const list = [];
  const x0 = COAST[0] - 2;
  const x1 = COAST[1] + 2;
  SE.placeLandObjects(f, art, x0, 0, x1, SE.GRID_H - 1, list);
  const palms = list.filter((p) => p.sprite.id === 'coconut_palm');
  let marked = 0;
  for (let y = 0; y < SE.GRID_H; y++) for (let x = x0; x <= x1; x++) marked += f.palm[tile(x, y)];
  assert.ok(marked > 0);
  assert.equal(palms.length, marked, 'one palm per count on each tile');
  for (const p of palms) {
    const i = tile(Math.floor(p.fx / 16), Math.floor(p.fy / 16));
    assert.ok(f.palm[i] > 0, `palm foot on a palm tile (${p.fx},${p.fy})`);
  }
  const none = [];
  SE.placeLandObjects(field(coast({ age: 0 })), art, x0, 0, x1, SE.GRID_H - 1, none);
  assert.ok(!none.some((p) => p.sprite.id === 'coconut_palm'), 'none before they arrive');
});
