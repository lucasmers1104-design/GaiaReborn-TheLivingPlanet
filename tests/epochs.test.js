'use strict';
/*
 * Epochs: today's Earth decodes into the real continents, mountain belts and
 * volcanic belts; the young Earth is a wide ocean of small proto-continents;
 * every epoch survives a save and opens with its own Geosphere sliders.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE, makeSim, hash } = require('./helpers');

const SE = loadSE();

function tileAt(lat, lon) {
  const x = Math.floor(((lon + 180) / 360) * SE.GRID_W) % SE.GRID_W;
  const y = Math.min(SE.GRID_H - 1, Math.floor(((90 - lat) / 180) * SE.GRID_H));
  return SE.idx(x, y);
}

function planet(epoch, seed = 12345) {
  const w = new SE.WorldState();
  w.reset(seed, SE.OCEAN_FRACTION, epoch);
  return w;
}

function landShare(w) {
  let land = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) if (w.elevation[i] >= 0) land++;
  return land / SE.TILE_COUNT;
}

/** Connected landmasses, 4-neighbourhood, wrapping in X. */
function landmasses(w) {
  const seen = new Uint8Array(SE.TILE_COUNT);
  let count = 0;
  for (let s = 0; s < SE.TILE_COUNT; s++) {
    if (w.elevation[s] < 0 || seen[s]) continue;
    count++;
    const queue = [s];
    seen[s] = 1;
    while (queue.length) {
      const i = queue.pop();
      const x = i % SE.GRID_W;
      const y = (i - x) / SE.GRID_W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (y + dy < 0 || y + dy >= SE.GRID_H) continue;
        const j = SE.idx(SE.wrapX(x + dx), y + dy);
        if (!seen[j] && w.elevation[j] >= 0) { seen[j] = 1; queue.push(j); }
      }
    }
  }
  return count;
}

test('the earth map covers the grid', () => {
  for (const field of ['heights', 'relief']) {
    assert.equal(Buffer.from(SE.EARTH_MAP[field], 'base64').length, SE.TILE_COUNT, field);
  }
});

test('today\'s Earth has the real continents, seas and heights', () => {
  const w = planet('today');
  const km = (lat, lon) => w.elevation[tileAt(lat, lon)] * SE.ELEVATION_KM;
  // A third of the tiles: the true 29 % of the area, with the polar rows widened by the grid.
  assert.ok(landShare(w) > 0.31 && landShare(w) < 0.37, `land ${landShare(w)}`);
  for (const [name, lat, lon] of [
    ['Sahara', 23, 10], ['Amazonas', -4, -62], ['Sibirien', 62, 100], ['Australien', -25, 134],
    ['Grönland', 74, -40], ['Antarktis', -82, 30], ['Großbritannien', 53, -1.5], ['Japan', 36, 139],
    ['Madagaskar', -19, 46.5], ['Neuseeland', -43.5, 171],
  ]) assert.ok(km(lat, lon) > 0, `${name} is land`);
  for (const [name, lat, lon] of [
    ['Pazifik', 0, -150], ['Atlantik', 30, -40], ['Indischer Ozean', -20, 80],
    ['Mittelmeer', 35, 18], ['Kaspisches Meer', 42, 50.5], ['Hudson Bay', 59, -86],
  ]) assert.ok(km(lat, lon) < 0, `${name} is sea`);
  assert.ok(km(33, 88) > 4, `Tibet ${km(33, 88)} km`);
  assert.ok(km(-75, 60) > 2.5, `East Antarctic ice ${km(-75, 60)} km`);
  assert.ok(km(-4, -62) < 0.5, `Amazon lowland ${km(-4, -62)} km`);
  assert.ok(w.elevation[tileAt(0, -150)] < SE.COAST_DEPTH, 'the Pacific is open ocean');
});

test('today\'s isthmuses and long islands hold together, narrow seas stay open', () => {
  const w = planet('today');
  const reach = (from, to) => {
    const goal = tileAt(...to);
    const seen = new Set([tileAt(...from)]);
    const queue = [...seen];
    while (queue.length) {
      const i = queue.pop();
      if (i === goal) return true;
      const x = i % SE.GRID_W;
      const y = (i - x) / SE.GRID_W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (y + dy < 0 || y + dy >= SE.GRID_H) continue;
        const j = SE.idx(SE.wrapX(x + dx), y + dy);
        if (!seen.has(j) && w.elevation[j] >= 0) { seen.add(j); queue.push(j); }
      }
    }
    return false;
  };
  for (const [name, from, to] of [
    ['Panama', [19.4, -99.1], [4.6, -74.1]], ['Baja California', [27.0, -113.0], [29.1, -111.0]],
    ['Kuba', [22.4, -83.7], [20.0, -75.8]], ['Malaiische Halbinsel', [3.1, 101.7], [13.8, 100.5]],
    ['Alaska-Halbinsel', [57.0, -157.0], [61.2, -150.0]], ['Java', [-6.9, 107.6], [-7.6, 112.7]],
  ]) assert.ok(reach(from, to), `${name} holds together`);
  assert.ok(!reach([37.75, 15.0], [40.85, 14.3]), 'Sizilien is an island');
  assert.ok(w.elevation[tileAt(27.4, -110.4)] < 0, 'the Gulf of California is sea');
});

test('today\'s most active volcanoes stand where they are, always a fresh cone', () => {
  const s = makeSim(12345, 'today');
  s.tick();
  const f = new SE.TerrainField();
  f.refresh(s.world);
  assert.deepEqual(SE.ACTIVE_VOLCANOES.map((v) => v.name), ['Kīlauea', 'Ätna']);
  for (const v of SE.ACTIVE_VOLCANOES) {
    const i = tileAt(...v.at);
    assert.equal(SE.latLonTile(v.at), i, `${v.name}: tile`);
    assert.equal(s.world.upliftKind[i], 5, `${v.name}: an active volcano`);
    assert.equal(f.volcano[i], 2, `${v.name}: a fresh cone`);
    SE.raiseCrust(s.world, i, 0.01, 4);
    assert.equal(s.world.upliftKind[i], 5, `${v.name}: a hotspot does not retype it`);
  }
  assert.ok(planet('random').upliftKind.every((k) => k !== 5), 'only today\'s Earth has them');
});

test('today\'s mountain belts are the young ranges, not the ice sheets', () => {
  const w = planet('today');
  for (const [name, lat, lon] of [['Anden', -20, -68], ['Himalaya', 28.5, 85], ['Alpen', 47, 11]]) {
    assert.ok(w.uplift[tileAt(lat, lon)] > 0.05, `${name} uplift ${w.uplift[tileAt(lat, lon)]}`);
  }
  for (const [name, lat, lon] of [['Antarktis', -82, 30], ['Grönland', 74, -40], ['Sahara', 23, 10], ['Ural', 60, 59]]) {
    assert.equal(w.uplift[tileAt(lat, lon)], 0, `${name} has no belt`);
  }
});

test('today\'s volcanism follows the real belts', () => {
  const w = planet('today');
  for (const [name, lat, lon] of [['Island', 64.6, -17.5], ['Hawaii', 19.4, -155.3], ['Japan', 35.4, 138.7], ['Anden', -23.4, -67.7], ['Ostafrika', 2.3, 36.6]]) {
    assert.ok(w.magma[tileAt(lat, lon)] > 0.8, `${name} magma ${w.magma[tileAt(lat, lon)]}`);
  }
  for (const [name, lat, lon] of [['Australien', -25, 134], ['Sibirien', 62, 100], ['Brasilien', -12, -50]]) {
    assert.ok(w.magma[tileAt(lat, lon)] < 0.35, `${name} magma ${w.magma[tileAt(lat, lon)]}`);
  }
});

test('the real Earth is the same planet for every seed', () => {
  assert.equal(hash(planet('today', 1).elevation), hash(planet('today', 99).elevation));
});

test('the young Earth is a wide ocean of small proto-continents and island arcs', () => {
  const a = planet('youngEarth', 777);
  const random = planet('random', 777);
  const land = landShare(a);
  assert.ok(land > 0.12 && land < 0.2, `land ${land}`);
  assert.ok(landmasses(a) >= 3 * landmasses(random), `${landmasses(a)} landmasses against ${landmasses(random)}`);

  let high = 0;
  let landTiles = 0;
  let magma = 0;
  let magmaRandom = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    magma += a.magma[i];
    magmaRandom += random.magma[i];
    if (a.elevation[i] < 0) continue;
    landTiles++;
    if (a.elevation[i] * SE.ELEVATION_KM > 2) high++;
  }
  assert.ok(high / landTiles < 0.15, `${((high / landTiles) * 100).toFixed(1)} % of the land above 2 km`);
  assert.ok(magma > magmaRandom * 1.2, 'a hotter mantle than a random planet');

  assert.equal(hash(planet('youngEarth', 777).elevation), hash(a.elevation), 'same seed, same planet');
  assert.notEqual(hash(planet('youngEarth', 778).elevation), hash(a.elevation), 'another seed, another planet');
});

test('every epoch opens with its own Geosphere sliders', () => {
  for (const e of SE.EPOCHS) {
    const s = makeSim(5, e.id);
    for (const key of Object.keys(s.params.geo)) {
      assert.equal(s.params.geo[key], e.geo[key] ?? 0.5, `${e.id}.${key}`);
    }
  }
  assert.ok(SE.epochOf('youngEarth').geo.drift > 0.5 && SE.epochOf('youngEarth').geo.volcanoes > 0.5, 'young Earth: fast plates, many volcanoes');
  assert.ok(SE.isEpochId('today') && !SE.isEpochId('pangaea') && !SE.isEpochId(undefined));
});

test('an epoch\'s planet survives a save', async () => {
  for (const epoch of ['today', 'youngEarth']) {
    const a = makeSim(31, epoch);
    for (let t = 0; t < 30; t++) a.tick();
    const ctx = (s) => ({ world: s.world, params: s.params, geo: s.geo, history: s.history });
    const doc = await SE.SaveSystem.decode(await SE.SaveSystem.encode(SE.SaveSystem.serialize(ctx(a))));
    const b = makeSim(1);
    SE.SaveSystem.load(doc, ctx(b), b.life, b.flora);
    let worst = 0;
    for (let i = 0; i < SE.TILE_COUNT; i++) {
      assert.equal(b.world.elevation[i] >= 0, a.world.elevation[i] >= 0, `${epoch}: tile ${i} keeps its coast`);
      worst = Math.max(worst, Math.abs(b.world.elevation[i] - a.world.elevation[i]));
    }
    assert.ok(worst < 1e-3, `${epoch}: elevation off by ${worst}`);
    assert.deepEqual(b.world.upliftKind, a.world.upliftKind, `${epoch}: mountain types and active volcanoes`);
    assert.deepEqual({ ...b.params.geo }, { ...a.params.geo }, `${epoch}: sliders`);
  }
});
