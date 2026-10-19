'use strict';
/*
 * Coral reefs, lagoons, beaches and palms (src/reefs.ts, src/landshore.ts),
 * drawing only: derived from the simulation's state, never written back.
 * Reefs grow in warm coastal sea where a reef-building sub-species lives,
 * apart from each other and from muddy river mouths; grazing fish grind
 * sand and wash white beaches ashore; lagoons turn turquoise; the main map
 * shows two sea classes; beaches and reefs join across chunk borders;
 * palms stand on dry sand with their crowns over the water.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const { loadSE, makeSim } = require('./helpers');

const SE = loadSE();
const F = SE.Flora;
const L = SE.Landscape;
const M = SE.TERRAIN_MANIFEST;
const N = SE.SUBSPECIES_PER_CLASS;
const LC = SE.LIFE_COUNT;
const STONY = SE.SPECIES[SE.Life.Radiate].stages.findIndex((s) => s.reefBuilder === 'stony');
const RUGOSE = SE.SPECIES[SE.Life.Radiate].stages.findIndex((s) => s.reefBuilder === 'rugose');
const GRAZER = SE.SPECIES[SE.Life.Fish].stages.findIndex((s) => s.reefGrazer);
const tile = (x, y) => y * SE.GRID_W + x;
/** The sea fills columns SEA[0]..SEA[1]; its west shore lies on a chunk border. Coastal sea within COAST columns of either shore. */
const SEA = [112, 151];
const COAST = 6;

/**
 * A warm planet with one sea strip: coastal sea along both shores, open ocean
 * between. Corals of `coral` stage live on all coastal sea, grazing fish on
 * rows `fishRows`, molluscs where `molluscs`. Land is low forest with the
 * flowering plants, which arose at year 1e9; the clock stands at `yearsAgo`.
 */
function reefWorld({ temp = 26, coral = STONY, fishRows = [0, 64], fishStage = GRAZER, grazerEvolved = true, molluscs = false, yearsAgo = 50e6, landscape = () => L.Forest } = {}) {
  const s = makeSim(11);
  const w = s.world;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    const x = i % SE.GRID_W;
    const y = (i / SE.GRID_W) | 0;
    const sea = x >= SEA[0] && x <= SEA[1];
    const coast = sea && (x < SEA[0] + COAST || x > SEA[1] - COAST);
    w.elevation[i] = !sea ? 0.03 : coast ? -0.05 : -0.5;
    w.biome[i] = !sea ? SE.Biome.Forest : coast ? SE.Biome.Coast : SE.Biome.Ocean;
    w.temperature[i] = temp;
    w.moisture[i] = 0.6;
    w.riverLevel[i] = 0;
    w.riverFlow[i] = 0;
    w.riparian[i] = 0;
    w.tech[i] = SE.Tech.None;
    w.landscape[i] = sea ? L.Meadow : landscape(x, y);
    w.landscapeZone[i] = sea ? SE.ZONE_NONE : 4 | (3 << 3);
    w.substrate[i] = SE.Substrate.Soil;
    w.landscapeDensity[i] = 1;
    w.flora[i] = sea ? 0 : (1 << F.Flowering) | (1 << F.Broadleaf);
    w.vegetation[i] = sea ? 0 : 0.7;
    w.floraTop[i] = sea ? F.None : F.Broadleaf;
    for (let c = 0; c < LC; c++) { w.lifeDensity[i * LC + c] = 0; w.lifeStage[i * LC + c] = 0; }
    if (coast && coral >= 0) {
      w.lifeDensity[i * LC + SE.Life.Radiate] = 0.5;
      w.lifeStage[i * LC + SE.Life.Radiate] = coral;
    }
    if (coast && y >= fishRows[0] && y < fishRows[1]) {
      w.lifeDensity[i * LC + SE.Life.Fish] = 0.5;
      w.lifeStage[i * LC + SE.Life.Fish] = fishStage;
    }
    if (coast && molluscs) w.lifeDensity[i * LC + SE.Life.Mollusc] = 0.25;
  }
  w.lifeStageCounts.fill(0);
  if (coral >= 0) w.lifeStageCounts[SE.Life.Radiate * N + coral] = 100;
  if (grazerEvolved) w.lifeStageCounts[SE.Life.Fish * N + GRAZER] = 100;
  w.lifeCounts[SE.Life.Mollusc] = molluscs ? 100 : 0;
  w.evo.developed.set('flowering', { tick: 0, years: 1e9 });
  w.absoluteYears = SE.PLANET_AGE - yearsAgo;
  w.revision++;
  return { s, w };
}

const reefs = (w) => {
  const m = new SE.ReefMap();
  m.compute(w);
  return m;
};
const count = (a, f = (v) => v > 0) => a.reduce((n, v) => n + (f(v) ? 1 : 0), 0);

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
const art = SE.LandArt.fromIndices(atlasIndices());

test('the species art marks the reef builders and the grazing fish', () => {
  assert.equal(SE.SPECIES[SE.Life.Radiate].stages[RUGOSE].name, 'Runzelkorallen');
  assert.equal(SE.SPECIES[SE.Life.Radiate].stages[STONY].name, 'Steinkorallen');
  assert.equal(SE.SPECIES[SE.Life.Fish].stages[GRAZER].name, 'Echte Knochenfische');
});

test('the palette keeps every index: the lagoon, reef and shelf ramps come after the mask', () => {
  const names = Object.keys(M.ramps);
  assert.deepEqual(names.slice(-4), ['mask', 'waterWarm', 'reefUnder', 'shelf']);
  assert.equal(M.maskIndex, M.ramps.mask[0]);
  assert.ok(M.ramps.waterWarm[0] > M.maskIndex && M.ramps.reefUnder[0] > M.maskIndex && M.ramps.shelf[0] > M.maskIndex);
  assert.ok(M.overlays.beach_sand && !M.materials.beach, 'beach sand is an overlay, no ground of its own');
  for (const id of ['coral_rugose', 'coral_stony', 'reef_sand']) assert.equal(M.objects[id].kind, 'reef', id);
});

test('reefs grow only in warm coastal sea with reef builders, and never touch the simulation', () => {
  const { w } = reefWorld();
  const before = [w.elevation, w.lifeDensity, w.lifeStage, w.biome, w.temperature, w.landscape].map((a) => Array.from(a));
  const m = reefs(w);
  assert.deepEqual([w.elevation, w.lifeDensity, w.lifeStage, w.biome, w.temperature, w.landscape].map((a) => Array.from(a)), before);
  assert.ok(m.reefTiles > 20, `${m.reefTiles} reef tiles`);
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    if (!m.coral[i]) continue;
    assert.equal(w.biome[i], SE.Biome.Coast, 'coastal sea only');
    assert.equal(m.coral[i], 2, 'stony corals');
    const x = i % SE.GRID_W;
    assert.ok(x - SEA[0] < SE.REEF_SHORE_REACH || SEA[1] - x < SE.REEF_SHORE_REACH, `reef at column ${x} within REEF_SHORE_REACH of land`);
  }
  // Cnidarians a little further out still settle the shallows by the land (larvae).
  const out = reefWorld().w;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    const x = i % SE.GRID_W;
    if (x !== SEA[0] + 4) out.lifeDensity[i * LC + SE.Life.Radiate] = 0;
  }
  const settled = reefs(out);
  assert.ok(settled.reefTiles > 0, 'reefs from cnidarians two tiles away');
  for (let i = 0; i < SE.TILE_COUNT; i++) if (settled.coral[i]) assert.ok(Math.abs((i % SE.GRID_W) - (SEA[0] + 4)) <= SE.REEF_LARVA_REACH, 'within REEF_LARVA_REACH of them');
  // At most one reef per seed-offset cell of REEF_CELL tiles, a stony reef no wider than radius 2.
  const cells = (SE.GRID_W / SE.REEF_CELL) * (SE.GRID_H / SE.REEF_CELL + 1);
  assert.ok(m.reefTiles <= cells * 21);
  assert.ok(m.reefTiles < count(w.biome, (b) => b === SE.Biome.Coast) / 2, 'reefs stand apart, not along the whole coast');
  assert.equal(reefs(reefWorld({ temp: SE.CORAL_MIN_TEMP - 0.5 }).w).reefTiles, 0, 'no reefs in water below CORAL_MIN_TEMP');
  assert.ok(reefs(reefWorld({ temp: SE.CORAL_MIN_TEMP }).w).reefTiles > 0, 'reefs from CORAL_MIN_TEMP on');
  assert.equal(reefs(reefWorld({ coral: STONY - 2 }).w).reefTiles, 0, 'no reefs without a reef-building stage');
  const rugose = reefs(reefWorld({ coral: RUGOSE }).w);
  assert.ok(rugose.reefTiles > 0 && count(rugose.coral, (k) => k === 1) === rugose.reefTiles, 'rugose reefs');
  assert.ok(rugose.reefTiles < m.reefTiles, 'rugose reefs are smaller');
});

test('a big river mouth keeps its muddy water free of reefs and beaches', () => {
  const { w } = reefWorld();
  const R = SE.REEF_RIVER_REACH;
  const box = (m, y0, f) => {
    let n = 0;
    for (let y = y0 - R; y <= y0 + R; y++) for (let x = SEA[0] - 1 - R; x <= SEA[0] - 1 + R; x++) n += f(m, tile(x, y));
    return n;
  };
  const both = (m, i) => (m.coral[i] ? 1 : 0) + (m.beach[i] ? 1 : 0);
  // A row where, without the river, a reef and a beach lie within reach of the mouth.
  const clear = reefs(w);
  const y0 = [...Array(SE.GRID_H - 2 * R).keys()].map((k) => k + R).find((y) => box(clear, y, (m, i) => (m.coral[i] ? 1 : 0)) > 0 && box(clear, y, (m, i) => (m.beach[i] ? 1 : 0)) > 0);
  assert.ok(y0 !== undefined, 'a coast with reef and beach to test on');
  const mouth = tile(SEA[0] - 1, y0);
  w.riverLevel[mouth] = 1;
  w.riverFlow[mouth] = SE.REEF_RIVER_FLOW;
  assert.equal(box(reefs(w), y0, both), 0, `no reef or beach within ${R} tiles of the mouth at row ${y0}`);
  w.riverFlow[mouth] = SE.REEF_RIVER_FLOW - 1;
  assert.ok(box(reefs(w), y0, both) > 0, 'a smaller river leaves them');
});

test('grazing fish grind coral to sand and wash white beaches ashore; without them none', () => {
  const { w } = reefWorld({ fishRows: [0, 64] });
  const m = reefs(w);
  let sandy = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    if (!m.coral[i]) continue;
    const y = (i / SE.GRID_W) | 0;
    if (y < 62) {
      assert.ok(m.fish[i] > 0, 'fish on the reef');
      sandy += m.sands[i] > 0 ? 1 : 0;
      assert.equal(m.lagoon[i], m.sands[i] > 0 ? 3 : 2);
    }
    // A reef is grazed as a whole: one reaching up to the fish rows (radius ≤ 2) still lies above row 70.
    if (y > 70) assert.equal(m.sands[i], 0, 'no sand without fish');
    assert.ok(m.corals[i] + m.sands[i] >= SE.REEF_PATCHES && m.corals[i] + m.sands[i] <= SE.REEF_PATCHES + 1);
  }
  assert.ok(sandy > 0, 'the fish leave sand on their reefs');
  // White beaches: land within BEACH_REACH of a grazed reef, on most of that coast.
  let near = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    if (m.beach[i] !== 2) continue;
    near++;
    const x = i % SE.GRID_W;
    const y = (i / SE.GRID_W) | 0;
    let grazed = false;
    for (let dy = -SE.BEACH_REACH; dy <= SE.BEACH_REACH; dy++) {
      for (let dx = -SE.BEACH_REACH; dx <= SE.BEACH_REACH; dx++) {
        const j = tile(SE.wrapX(x + dx), Math.max(0, Math.min(SE.GRID_H - 1, y + dy)));
        if (m.coral[j] && m.fish[j]) grazed = true;
      }
    }
    assert.ok(grazed, `beach ${x},${y} beside a grazed reef`);
  }
  assert.ok(near > 5, `${near} white beach tiles`);
  assert.equal(count(reefs(reefWorld({ fishRows: [0, 0] }).w).beach, (b) => b === 2), 0, 'no white beach without fish');
  // The stage a tile shows is only its newest form: fish of an older stage graze once the grazing sub-species has evolved.
  assert.ok(count(reefs(reefWorld({ fishStage: GRAZER - 3 }).w).beach, (b) => b === 2) > 5, 'older fish graze once bony fish exist');
  assert.equal(count(reefs(reefWorld({ grazerEvolved: false }).w).beach, (b) => b === 2), 0, 'none before bony fish evolved');
  const marsh = reefs(reefWorld({ landscape: () => L.Marsh }).w);
  assert.equal(count(marsh.beach), 0, 'no beach on marsh');
});

test('lagoons: turquoise over the reef, a tile landward of it, and up to the shore', () => {
  const { w } = reefWorld();
  const m = reefs(w);
  let landward = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    const g = m.lagoon[i];
    if (g === 0) continue;
    const x = i % SE.GRID_W;
    const y = (i / SE.GRID_W) | 0;
    let reefNear = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const j = tile(SE.wrapX(x + dx), Math.max(0, Math.min(SE.GRID_H - 1, y + dy)));
      if (m.coral[j] || (w.elevation[i] >= 0 && m.lagoon[j] && w.elevation[j] < 0)) reefNear = true;
    }
    assert.ok(m.coral[i] || reefNear, `lagoon ${x},${y} beside a reef or a lagoon`);
    if (!m.coral[i] && w.elevation[i] < 0) landward++;
  }
  assert.ok(landward > 0, 'coastal sea beside a reef turns turquoise too');
  assert.ok(count(m.lagoon, (g) => g > 0) > m.reefTiles);
});

test('shell beaches: now and then on warm coasts beside molluscs, never in cold water', () => {
  const { w } = reefWorld({ coral: -1, molluscs: true });
  const m = reefs(w);
  const coastal = 2 * SE.GRID_H;
  const shells = count(m.beach, (b) => b === 1);
  assert.equal(count(m.beach, (b) => b === 2), 0);
  assert.ok(shells > 0.05 * coastal && shells < 0.3 * coastal, `${shells} shell beaches on ${coastal} coastal tiles`);
  assert.equal(count(reefs(reefWorld({ coral: -1, molluscs: true, temp: 12 }).w).beach), 0);
});

test('palms: once the flowering plants exist and the calendar has passed the oldest palm fossils', () => {
  const { w } = reefWorld({ yearsAgo: SE.PALM_FIRST_YEARS_AGO });
  assert.equal(SE.palmsArrived(w), true);
  w.absoluteYears -= 1;
  assert.equal(SE.palmsArrived(w), false, 'before Sabalites');
  w.absoluteYears += 1;
  w.evo.developed.delete('flowering');
  assert.equal(SE.palmsArrived(w), false, 'no flowering plants');
  const k = [0, 0, 0];
  for (let i = 0; i < 20000; i++) k[SE.beachPalms(i)]++;
  assert.ok(Math.abs(k[0] / 20000 - 0.6) < 0.03 && Math.abs(k[1] / 20000 - 0.3) < 0.03 && Math.abs(k[2] / 20000 - 0.1) < 0.02, k.join('/'));
});

test('corals show only in warm water: in cold water the class shows its highest form that builds no reef', () => {
  const { w } = reefWorld();
  const i = tile(SEA[0], 10);
  assert.equal(SE.reefShownStage(w, i, SE.Life.Radiate, STONY), STONY);
  w.temperature[i] = SE.CORAL_MIN_TEMP - 3;
  assert.equal(SE.reefShownStage(w, i, SE.Life.Radiate, STONY), RUGOSE - 1);
  assert.equal(SE.reefShownStage(w, i, SE.Life.Radiate, RUGOSE - 1), RUGOSE - 1);
  assert.equal(SE.reefShownStage(w, i, SE.Life.Fish, GRAZER), GRAZER);
});

test('the Examine window and the chronicle read the same derivation', () => {
  const { w } = reefWorld();
  const m = SE.reefMap(w);
  const reef = m.coral.findIndex((k, i) => k && m.fish[i]);
  assert.match(SE.reefNotes(w, reef)[0], /^Korallenriff \(Steinkorallen\) · Wassertemperatur 26 °C$/);
  assert.equal(SE.reefNotes(w, reef)[1], 'Fische raspeln Kalk zu Sand');
  assert.deepEqual(SE.reefNotes(w, m.beach.findIndex((b) => b === 2)), ['Weißer Kalksand vom Riff']);
  const first = SE.reefMilestones(w);
  assert.deepEqual(first.map((e) => e.title), ['Erste Riffe', 'Weiße Strände']);
  for (const e of first) w.evo.chronicle.push(e);
  assert.deepEqual(SE.reefMilestones(w), [], 'once each');
});

/* ------------------------------------------------------------- the map -- */

const CHUNK = 16;
const MARGIN = 2;
const SIDE = CHUNK * 16 + 2 * MARGIN;
const mapWorld = reefWorld({ fishRows: [0, 128] });
const field = new SE.TerrainField();
field.refresh(mapWorld.w);
const composer = new SE.LandComposer(art);
function chunk(cx, cy, f = field) {
  const out = new Uint32Array(SIDE * SIDE);
  composer.compose(f, cx * CHUNK, cy * CHUNK, CHUNK, CHUNK, MARGIN, out, null);
  return out;
}

test('the main map: two flat sea classes, turquoise only over lagoons', () => {
  const ocean = new Set([2, 3, 4].map((k) => art.rgba[M.ramps.water[k]]));
  const shelf = new Set([4, 5, 6].map((k) => art.rgba[M.ramps.water[k]]));
  const warm = new Set(M.ramps.waterWarm.map((k) => art.rgba[k]));
  const px = chunk(8, 3);
  // Chunk 8 spans columns 128–143: open ocean from 118 to 145.
  for (let y = MARGIN; y < SIDE - MARGIN; y++) {
    for (let x = MARGIN; x < SIDE - MARGIN; x++) {
      const tx = 128 + Math.floor((x - MARGIN) / 16);
      if (tx >= SEA[0] + COAST + 1 && tx <= SEA[1] - COAST - 1) assert.ok(ocean.has(px[y * SIDE + x]), `open ocean at ${x},${y}`);
    }
  }
  const coastChunk = chunk(7, 3);
  let turquoise = 0;
  for (const v of coastChunk) if (warm.has(v)) turquoise++;
  assert.ok(turquoise > 0, 'lagoons show turquoise');
  // A planet without corals: no turquoise anywhere, the shelf in its one colour.
  const plain = new SE.TerrainField();
  plain.refresh(reefWorld({ coral: -1 }).w);
  for (const v of chunk(7, 3, plain)) assert.ok(!warm.has(v), 'no turquoise without a lagoon');
  assert.ok([...chunk(7, 3, plain)].some((v) => shelf.has(v)));
});

test('beaches and reefs join across chunk borders', () => {
  // The west shore lies on the border of chunks 6 and 7; rows cross the border of chunk rows 1 and 2.
  for (const [[ax, ay], [bx, by]] of [[[6, 2], [7, 2]], [[7, 1], [7, 2]], [[6, 1], [6, 2]]]) {
    const a = chunk(ax, ay);
    const b = chunk(bx, by);
    for (let k = 0; k < SIDE; k++) {
      for (let j = 0; j < 2 * MARGIN; j++) {
        if (ay === by) assert.equal(a[k * SIDE + CHUNK * 16 + j], b[k * SIDE + j], `chunk ${ax},${ay} | ${bx},${by} at row ${k}`);
        else assert.equal(a[(CHUNK * 16 + j) * SIDE + k], b[j * SIDE + k], `chunk ${ax},${ay} / ${bx},${by} at column ${k}`);
      }
    }
  }
});

test('the drawn beach is the one landBeachAt reads off the dual grid', () => {
  // Without objects, every dry beach pixel shows the sand overlay at its world position.
  const bare = Object.assign(Object.create(SE.TerrainField.prototype), field, {
    scene: new Uint8Array(SE.TILE_COUNT).fill(SE.LAND_SCENE_NONE), palm: new Uint8Array(SE.TILE_COUNT),
  });
  const px = chunk(6, 2, bare);
  const sand = art.beach;
  let beach = 0;
  for (let y = 0; y < SIDE; y++) {
    for (let x = 0; x < SIDE; x++) {
      const wx = 6 * CHUNK * 16 - MARGIN + x;
      const wy = 2 * CHUNK * 16 - MARGIN + y;
      const d = SE.landBeachAt(field, art, wx, wy);
      if (d <= 1) continue;
      beach++;
      assert.equal(px[y * SIDE + x], art.rgba[sand.px[(wy & (sand.size - 1)) * sand.size + (wx & (sand.size - 1))]], `sand at ${wx},${wy}`);
    }
  }
  assert.ok(beach > 50, `${beach} beach pixels`);
});

test('palms stand on dry sand, their crowns over the water and out of the surf', () => {
  const list = [];
  SE.placeLandObjects(field, art, SEA[0] - 4, 0, SEA[0] + 1, SE.GRID_H - 1, list);
  const palms = list.filter((p) => p.sprite.id === 'coconut_palm');
  assert.ok(palms.length > 3, `${palms.length} palms`);
  for (const p of palms) {
    const d = SE.landBeachAt(field, art, p.fx, p.fy);
    assert.ok(d > 1 && d <= 3.5, `foot ${p.fx},${p.fy} on dry sand 1–2 px behind the wet line (${d})`);
    assert.ok(SE.landBeachWidthAt(field, art, p.fx, p.fy) >= 2, 'never on a strip under 2 px');
    let over = 0;
    for (let n = 0; n < p.sprite.px.length; n++) {
      if (p.sprite.px[n] && SE.landSeaAt(field, art, p.fx - p.sprite.ax + (n % p.sprite.w), p.fy - p.sprite.ay + Math.floor(n / p.sprite.w))) over++;
    }
    assert.ok(over > 0, 'the crown reaches over the water');
  }
  // Crown pixels over the sea are no surf and no sea for the wave effects (chunk column 6 holds the west shore's land).
  let crowns = 0;
  for (let cy = 0; cy < SE.GRID_H / CHUNK; cy++) {
    const ox = 6 * CHUNK * 16;
    const oy = cy * CHUNK * 16;
    composer.compose(field, 6 * CHUNK, cy * CHUNK, CHUNK, CHUNK, MARGIN, new Uint32Array(SIDE * SIDE), null);
    const motion = composer.motion;
    const here = new Set();
    for (const p of palms) {
      for (let n = 0; n < p.sprite.px.length; n++) {
        if (!p.sprite.px[n]) continue;
        const x = p.fx - p.sprite.ax + (n % p.sprite.w) - ox;
        const y = p.fy - p.sprite.ay + Math.floor(n / p.sprite.w) - oy;
        if (x >= 0 && y >= 0 && x < CHUNK * 16 && y < CHUNK * 16 && SE.landSeaAt(field, art, x + ox, y + oy)) here.add(y * CHUNK * 16 + x);
      }
    }
    crowns += here.size;
    for (const k of here) assert.equal(motion.sea ? motion.sea[k] : 0, 0, 'no sea under a crown');
    for (const at of motion.surfAt) assert.ok(!here.has((at >>> 16) * CHUNK * 16 + (at & 0xffff)), 'no surf under a crown');
  }
  assert.ok(crowns > 0, 'crown pixels over the sea');
});

test('only palms stand on the beach sand', () => {
  const list = [];
  SE.placeLandObjects(field, art, SEA[0] - 4, 0, SEA[0] - 1, SE.GRID_H - 1, list);
  const onSand = list.filter((p) => SE.landObjectOnBeach(field, art, p));
  assert.ok(onSand.length > 0, 'some plants have their foot on the sand: the compositor drops them');
  assert.ok(list.some((p) => p.sprite.id === 'coconut_palm'));
  for (const p of onSand) assert.notEqual(p.sprite.id, 'coconut_palm', 'palms are never dropped');
});
