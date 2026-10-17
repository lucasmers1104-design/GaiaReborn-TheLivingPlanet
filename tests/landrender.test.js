'use strict';
/*
 * The pixel terrain compositor (docs/biomes-spec.md §4): it composes in
 * palette indices without a DOM, so it runs here on a synthetic planet —
 * bands of landscapes, a coast, rivers. Chunks must join without a seam
 * (also across the date line and across rivers), composition must be
 * deterministic and opaque, every plant group must get objects where it
 * grows, the forest must thin towards its edge, rivers must follow their
 * flow (no ladders, no right-angle stairs), and a chunk's signature must
 * change exactly when something that reaches into it changed.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const { loadSE, makeSim } = require('./helpers');

const SE = loadSE();
const M = SE.TERRAIN_MANIFEST;
const CHUNK = 16;
const MARGIN = 2;
const SIDE = CHUNK * 16 + 2 * MARGIN;

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
  for (let y = 0; y < M.height; y++) {
    assert.equal(raw[y * (M.width + 1)], 0, 'atlas rows use PNG filter 0');
    px.set(raw.subarray(y * (M.width + 1) + 1, (y + 1) * (M.width + 1)), y * M.width);
  }
  return px;
}

const art = SE.LandArt.fromIndices(atlasIndices());
const L = SE.Landscape;
const BANDS = [L.Desert, L.Semidesert, L.Savanna, L.Rainforest, L.Forest, L.Taiga, L.Tundra, L.Lichen, L.Meadow, L.Steppe,
  L.Shrubland, L.Fernland, L.Moss, L.Marsh, L.Swampforest, L.Snow, L.Rock, L.Ice];

/** A river through tiles [[x, y], …] in flow order, the last draining into whatever lies beyond. */
function addRiver(w, tiles, level = 0.5) {
  tiles.forEach(([x, y], k) => {
    const i = y * SE.GRID_W + x;
    w.riverLevel[i] = Math.min(1, level + k * 0.01);
    w.riverFlow[i] = 60 + k * 10;
    const next = tiles[k + 1];
    if (next) w.riverDown[i] = next[1] * SE.GRID_W + next[0];
  });
}

/** Tiles of a river going `steps` times one left and one up, from (x, y): a 4-neighbour staircase. */
function staircase(x, y, steps) {
  const out = [[x, y]];
  for (let k = 0; k < steps; k++) {
    out.push([--x, y]);
    out.push([x, --y]);
  }
  return out;
}

/** Sea west of x = 40, then landscape bands 12 tiles wide, every plant group everywhere, rivers around y = 60. */
function bandWorld() {
  const w = new SE.WorldState();
  let all = 0;
  for (let g = 1; g < SE.FLORA_COUNT; g++) all |= 1 << g;
  for (let y = 0; y < SE.GRID_H; y++) {
    for (let x = 0; x < SE.GRID_W; x++) {
      const i = y * SE.GRID_W + x;
      if (x < 40 || x >= 252) {
        w.elevation[i] = -0.02 - Math.abs(x < 40 ? 40 - x : x - 252) * 0.03;
        w.biome[i] = w.elevation[i] > SE.COAST_DEPTH ? SE.Biome.Coast : SE.Biome.Ocean;
      } else {
        w.elevation[i] = 0.15 + 0.1 * Math.sin(x / 7) * Math.cos(y / 5);
        w.biome[i] = SE.Biome.Grass;
        const ls = BANDS[Math.floor((x - 40 + ((y * 7) % 3)) / 12) % BANDS.length];
        w.landscape[i] = ls;
        w.substrate[i] = ls === L.Marsh || ls === L.Swampforest ? SE.Substrate.Mire : ls === L.Desert ? SE.Substrate.Sand : SE.Substrate.Soil;
        w.landscapeDensity[i] = (x + y) % SE.LANDSCAPE_DENSITIES[ls];
      }
      w.flora[i] = all;
      w.floraTop[i] = SE.Flora.Broadleaf;
      w.vegetation[i] = 0.7;
    }
  }
  // A river west into the sea along y = 60, and a staircase tributary across chunk borders joining it.
  const main = [];
  for (let x = 120; x >= 40; x--) main.push([x, 60]);
  addRiver(w, main, 0.4);
  w.riverDown[60 * SE.GRID_W + 40] = 60 * SE.GRID_W + 39;
  const side = staircase(104, 70, 9);
  addRiver(w, side, 0.25);
  const [lx, ly] = side[side.length - 1];
  w.riverDown[ly * SE.GRID_W + lx] = 60 * SE.GRID_W + lx;
  return w;
}

const world = bandWorld();
const field = new SE.TerrainField();
field.refresh(world);
const composer = new SE.LandComposer(art);

function chunk(cx, cy) {
  const out = new Uint32Array(SIDE * SIDE);
  composer.compose(field, cx * CHUNK, cy * CHUNK, CHUNK, CHUNK, MARGIN, out, null);
  return out;
}

test('the atlas turns into textures, masks, rivers and sprites', () => {
  for (const id of Object.keys(M.materials)) {
    const mat = M.materials[id];
    assert.equal(art.ground[mat.rank].length, mat.densities.length, id);
    for (const t of art.ground[mat.rank]) assert.ok(t.px.every((v) => v !== 0), `${id}: opaque`);
  }
  assert.equal(art.masks.length, 16);
  assert.ok(art.masks[15].every((vars) => vars.every((v) => v === 1)), 'case 15 is all inside');
  assert.ok(art.masks[0].every((vars) => vars.every((v) => v === 0)), 'case 0 is all outside');
  for (const id of Object.keys(M.objects)) assert.ok(art.sprites[id].length > 0, id);
  // Ramp shifts stay on their ramp and clamp at its ends.
  const water = M.ramps.water;
  assert.equal(art.shift[SE.LAND_SHIFT_MAX + 1][water[2]], water[3]);
  assert.equal(art.shift[SE.LAND_SHIFT_MAX - 2][water[0]], water[0]);
});

test('composition is deterministic and fully opaque', () => {
  const a = chunk(4, 3);
  const b = chunk(4, 3);
  assert.deepEqual(a, b);
  const alpha = new Uint8Array(a.buffer);
  for (let k = 3; k < alpha.length; k += 4) assert.equal(alpha[k], 255, `pixel ${(k - 3) / 4} is opaque`);
});

test('neighbouring chunks join without a seam, across the date line too', () => {
  const pairs = [[[3, 3], [4, 3]], [[15, 2], [0, 2]], [[6, 3], [6, 4]], [[5, 3], [6, 3]], [[2, 1], [3, 1]]];
  for (const [[ax, ay], [bx, by]] of pairs) {
    const a = chunk(ax, ay);
    const b = chunk(bx, by);
    if (ay === by) {
      // A's right margin is B's first columns.
      for (let y = 0; y < SIDE; y++) {
        for (let j = 0; j < 2 * MARGIN; j++) {
          assert.equal(a[y * SIDE + CHUNK * 16 + j], b[y * SIDE + j], `chunk ${ax},${ay} | ${bx},${by} at row ${y}`);
        }
      }
    } else {
      for (let x = 0; x < SIDE; x++) {
        for (let j = 0; j < 2 * MARGIN; j++) {
          assert.equal(a[(CHUNK * 16 + j) * SIDE + x], b[j * SIDE + x], `chunk ${ax},${ay} / ${bx},${by} at column ${x}`);
        }
      }
    }
  }
});

test('every plant group gets objects where it grows', () => {
  const T = SE.LandTables.shared();
  const f = new SE.TerrainField();
  for (let g = 1; g < SE.FLORA_COUNT; g++) {
    const id = SE.FLORA[g].id;
    const group = M.groups[id];
    if (group.objects.length === 0) { assert.ok(group.swatch, `${id} shows in the ground`); continue; }
    const scene = [...T.showable.keys()].find((s) => (T.showable[s] & (1 << g)) !== 0);
    assert.ok(scene !== undefined, `${id} has a scene to show in`);
    for (let y = 10; y < 20; y++) {
      for (let x = 10; x < 20; x++) {
        const i = y * SE.GRID_W + x;
        f.scene[i] = scene;
        f.groups[i] = 1 << g;
        f.top[i] = g;
        f.density[i] = 2;
        f.edge[i] = 2;
      }
    }
    const list = [];
    SE.placeLandObjects(f, art, 10, 10, 19, 19, list);
    const own = new Set(group.objects.map((o) => o.id));
    assert.ok(list.some((p) => own.has(p.sprite.id)), `${id} shows one of its objects in ${scene === SE.LAND_SCENE_SEA ? 'the sea' : SE.LANDSCAPE_IDS[scene]}`);
  }
});

test('the forest thins and stays small towards its edge', () => {
  const f = new SE.TerrainField();
  const count = (edge) => {
    for (let y = 30; y < 50; y++) {
      for (let x = 30; x < 50; x++) {
        const i = y * SE.GRID_W + x;
        f.scene[i] = L.Forest;
        f.groups[i] = 1 << SE.Flora.Broadleaf;
        f.top[i] = SE.Flora.Broadleaf;
        f.density[i] = 1;
        f.edge[i] = edge;
      }
    }
    const list = [];
    SE.placeLandObjects(f, art, 30, 30, 49, 49, list);
    return list;
  };
  const inside = count(2);
  const edge = count(0);
  const trees = (list) => list.filter((p) => p.sprite.size !== '');
  assert.ok(edge.length < inside.length * 0.5, `edge ${edge.length} vs inside ${inside.length}`);
  assert.ok(trees(edge).every((p) => p.sprite.size === 's'), 'edge trees are small');
  assert.ok(trees(inside).some((p) => p.sprite.size === 'l'), 'inside trees grow tall');
  assert.ok(edge.some((p) => p.sprite.size === ''), 'bushes form the mantle');
  // Sorted for drawing: row by row from the top.
  for (let k = 1; k < inside.length; k++) assert.ok(inside[k - 1].fy <= inside[k].fy);
});

test('no objects on rivers and cities; kelp only in coastal water with marine algae', () => {
  assert.equal(field.scene[60 * SE.GRID_W + 80], SE.LAND_SCENE_NONE, 'river tile');
  assert.ok(field.river[60 * SE.GRID_W + 80] > 0);
  assert.equal(field.scene[60 * SE.GRID_W + 38], SE.LAND_SCENE_SEA, 'coastal water');
  assert.equal(field.scene[60 * SE.GRID_W + 5], SE.LAND_SCENE_NONE, 'open ocean');
  const w = bandWorld();
  w.tech[70 * SE.GRID_W + 100] = SE.Tech.Stone;
  const f = new SE.TerrainField();
  f.refresh(w);
  assert.equal(f.scene[70 * SE.GRID_W + 100], SE.LAND_SCENE_NONE, 'city tile');
});

/** Bare sand with the sea west of x = 40: nothing but rivers is drawn in water colours inland. */
function sandWorld() {
  const w = new SE.WorldState();
  for (let y = 0; y < SE.GRID_H; y++) {
    for (let x = 0; x < SE.GRID_W; x++) {
      const i = y * SE.GRID_W + x;
      w.elevation[i] = x < 40 ? -0.1 : 0.1;
      w.biome[i] = x < 40 ? SE.Biome.Coast : SE.Biome.Desert;
      w.landscape[i] = L.Desert;
      w.substrate[i] = SE.Substrate.Sand;
    }
  }
  return w;
}

/** Compose tiles [tx, tx + tw) × [ty, ty + th) and mark the pixels drawn in a water colour. */
function riverPixels(w, tx, ty, tw, th) {
  const f = new SE.TerrainField();
  f.refresh(w);
  const out = new Uint32Array(tw * 16 * th * 16);
  new SE.LandComposer(art).compose(f, tx, ty, tw, th, 0, out, null);
  const blue = new Set(M.ramps.water.map((v) => art.rgba[v]));
  return { w: tw * 16, h: th * 16, wet: out.map((v) => (blue.has(v) ? 1 : 0)) };
}

test('rivers join along their flow only: two side by side stay apart', () => {
  const w = sandWorld();
  const row = (y) => Array.from({ length: 41 }, (_, k) => [80 - k, y]);
  addRiver(w, row(40));
  addRiver(w, row(41));
  w.riverDown[40 * SE.GRID_W + 40] = 40 * SE.GRID_W + 39;
  w.riverDown[41 * SE.GRID_W + 40] = 41 * SE.GRID_W + 39;
  assert.equal(SE.RiverSystem.connectionMask(w, 60, 40), 1 | 2, 'west and east, no rung to the river beside it');
  assert.equal(SE.RiverSystem.connectionMask(w, 40, 41), 1 | 2, 'into the sea and upstream');
  const img = riverPixels(w, 50, 38, 20, 6);
  // Tile rows 40 and 41 meet at pixel row 2·16 of the picture: land between the two rivers.
  for (let x = 0; x < img.w; x++) assert.equal(img.wet[2 * 16 * img.w + x], 0, `dry between the rivers at x ${x}`);
  let wet = 0;
  for (let k = 0; k < img.wet.length; k++) wet += img.wet[k];
  assert.ok(wet > img.w * 4, 'both rivers are drawn');
});

test('a staircase river is drawn as a smooth diagonal, without right-angle steps', () => {
  const w = sandWorld();
  addRiver(w, staircase(90, 70, 12));
  const img = riverPixels(w, 60, 40, 34, 34);
  let last = null;
  for (let y = 4 * 16; y < 30 * 16; y++) {
    let count = 0;
    let run = 0;
    let longest = 0;
    let sum = 0;
    for (let x = 0; x < img.w; x++) {
      if (img.wet[y * img.w + x]) { count++; run++; sum += x; longest = Math.max(longest, run); } else run = 0;
    }
    if (count === 0) continue;
    assert.ok(longest <= 12, `row ${y}: a straight run of ${longest} px is a stair step`);
    const mid = sum / count;
    if (last !== null) assert.ok(Math.abs(mid - last) <= 3, `row ${y}: the river jumps sideways by ${(mid - last).toFixed(1)} px`);
    last = mid;
  }
  assert.ok(last !== null, 'the river is drawn');
});

test('rivers: every segment knows how far down its strand it starts, and runs downstream', () => {
  const p = field.paths;
  const length = new Map();
  const west = new Map();
  for (let id = 0; id < p.ax.length; id++) {
    const s = p.strand[id];
    if (id === 0 || s !== p.strand[id - 1]) {
      assert.equal(p.along[id], 0, 'a strand starts at its source');
    } else {
      assert.equal(p.ax[id], p.bx[id - 1], 'segments of a strand follow on');
      assert.ok(Math.abs(p.along[id] - p.along[id - 1] - Math.hypot(p.bx[id - 1] - p.ax[id - 1], p.by[id - 1] - p.ay[id - 1])) < 1e-6);
    }
    length.set(s, p.along[id] + Math.hypot(p.bx[id] - p.ax[id], p.by[id] - p.ay[id]));
    west.set(s, (west.get(s) || 0) + p.ax[id] - p.bx[id]);
  }
  // The longest strand is the main river, which flows west into the sea.
  const main = [...length].sort((a, b) => b[1] - a[1])[0][0];
  assert.ok(west.get(main) > 60 * 16, `the main river runs ${west.get(main).toFixed(0)} px west`);
});

test('surf and river water are read off a composed chunk without changing it', () => {
  const water = M.ramps.water;
  const foam = water[water.length - 1];
  const out = chunk(2, 3);
  const m = composer.motion;
  const rings = [0, 0, 0, 0];
  const phase = new Map();
  for (let k = 0; k < m.surf.length; k++) {
    const x = m.surfAt[k] & 0xffff;
    const y = m.surfAt[k] >>> 16;
    const color = m.surf[k] & 255;
    const ring = (m.surf[k] >>> 8) & 255;
    assert.ok(x < CHUNK * 16 && y < CHUNK * 16, 'inside the chunk');
    rings[ring]++;
    const shown = out[(MARGIN + y) * SIDE + MARGIN + x];
    assert.ok(water.includes(color), 'surf takes a water colour');
    assert.notEqual(art.rgba[color], shown, 'surf changes the pixel');
    if (ring === 1) assert.equal(shown, art.rgba[foam], 'ring 1 is the foam line');
    else assert.ok(water.some((c) => art.rgba[c] === shown), 'rings 2 and 3 lie on water');
    phase.set(y * 4096 + x, (m.surf[k] >>> 16) & 255);
  }
  assert.ok(rings[1] > 50 && rings[2] > 50 && rings[3] > 50, `all three rings: ${rings.slice(1)}`);
  // The phase drifts along the coast: close together next to each other, spread over the chunk.
  for (const [at, v] of phase) {
    for (const n of [at + 1, at + 4096]) if (phase.has(n)) assert.ok(Math.abs(phase.get(n) - v) <= 5, 'neighbours pulse almost together');
  }
  assert.ok(Math.max(...phase.values()) - Math.min(...phase.values()) > 32, 'distant stretches pulse apart');
  let river = 0;
  for (let bit = 0; bit < CHUNK * 16 * CHUNK * 16; bit++) {
    if (((m.river[bit >>> 5] >>> (bit & 31)) & 1) === 0) continue;
    river++;
    const shown = out[(MARGIN + Math.floor(bit / (CHUNK * 16))) * SIDE + MARGIN + (bit % (CHUNK * 16))];
    assert.ok(water.some((c) => art.rgba[c] === shown), 'the river mask marks river water');
  }
  assert.ok(river > 300, `${river} river pixels`);
  chunk(2, 3);
  assert.deepEqual(composer.motion.surf, m.surf, 'deterministic');
  // The glacier band meets the sea in chunk 15: ice has no surf. Inland there is none either.
  chunk(15, 3);
  assert.equal(composer.motion.surf.length, 0, 'no surf along the ice');
  chunk(5, 3);
  assert.equal(composer.motion.surf.length, 0, 'no surf inland');
  assert.ok(composer.motion.river, 'but the river');
});

test('spray: sites on the foam line of the open sea, none along the ice; drops rise, fade and end', () => {
  const spray = new SE.WaterSpray();
  chunk(2, 3);
  const m = composer.motion;
  const sites = spray.sitesOf(m, 2, 3, world);
  assert.ok(sites.length > 0, 'the open coast has spray sites');
  assert.equal(spray.sitesOf(m, 2, 3, world), sites, 'worked out once per composition');
  for (const v of sites) {
    assert.equal((m.surf[v & 0xffffff] >>> 8) & 255, 1, 'on the foam line');
    assert.ok(v >>> 24 > 0, 'with a strength');
  }
  chunk(15, 3);
  assert.equal(spray.sitesOf(composer.motion, 15, 3, world).length, 0, 'no spray along the ice');
  const ice = M.ramps.ice;
  const burst = (age, strength, wave) => {
    const drops = [];
    SE.sprayDrops(age, strength, 1000, 900, wave, 1000, 900, ice, (c, x, y) => drops.push([c, x, y]));
    return drops;
  };
  for (let age = 0; age < SE.SPRAY_LIFE; age += 0.1) {
    const drops = burst(age, 1, 7);
    if (age < SE.SPRAY_LIFE / 3) assert.ok(drops.length > 0, `the wave breaks white at ${age.toFixed(1)} s`);
    for (const [c, x, y] of drops) {
      assert.ok(ice.includes(c), 'whites of the ice ramp');
      assert.ok(y <= 900 && y >= 888 && Math.abs(x - 1000) <= 10, `a drop near the foam line, above it: ${x}, ${y}`);
    }
  }
  assert.equal(burst(SE.SPRAY_LIFE, 1, 7).length, 0, 'the burst is over');
  // A cliff throws spray higher and more often than a flat shore.
  const top = (strength) => {
    let high = 0;
    for (let wave = 0; wave < 50; wave++) for (const [, , y] of burst(0.5, strength, wave)) high = Math.max(high, 900 - y);
    return high;
  };
  assert.ok(top(1) >= top(0.15) + 4, `${top(1)} px against ${top(0.15)} px`);
  assert.ok(SE.sprayChance(1) > 2 * SE.sprayChance(0.15));
});

test('a chunk is recomposed exactly when something reaching into it changed', () => {
  const w = bandWorld();
  const f = new SE.TerrainField();
  f.refresh(w);
  const sig = (cx, cy) => f.signature(cx * CHUNK, cy * CHUNK, CHUNK, CHUNK, 0);
  const before = [sig(5, 3), sig(6, 3), sig(9, 6)];
  // A plant group arrives on a tile at the right border of chunk (5, 3).
  const i = (3 * CHUNK + 4) * SE.GRID_W + 5 * CHUNK + 15;
  w.flora[i] = 1 << SE.Flora.Mosses;
  f.refresh(w);
  assert.notEqual(sig(5, 3), before[0], 'its own chunk');
  assert.notEqual(sig(6, 3), before[1], 'the neighbour its objects reach into');
  assert.equal(sig(9, 6), before[2], 'a far chunk');
  // Same world, same field: nothing changes.
  const again = new SE.TerrainField();
  again.refresh(w);
  assert.equal(again.signature(5 * CHUNK, 3 * CHUNK, CHUNK, CHUNK, 0), sig(5, 3));
});

/* ------------------------------------------- mountain ranges (hoehe-spec) -- */

/**
 * Lowland forest everywhere and one mountain belt along tile row 48, from
 * x = 230 across the date line to x = 29: a crest at 0.75 with a summit at
 * x = 240, flanks falling 0.15 per tile. Every tile has temperature `temp`
 * and no plants, so nothing but snow is drawn in ice colours.
 */
function rangeWorld(temp, kind = 1) {
  const w = new SE.WorldState();
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    w.elevation[i] = 0.1;
    w.biome[i] = SE.Biome.Forest;
    w.landscape[i] = L.Rock;
    w.substrate[i] = SE.Substrate.Rock;
    w.temperature[i] = temp;
  }
  for (let k = 0; k < 56; k++) {
    const x = (230 + k) % SE.GRID_W;
    for (let dy = -3; dy <= 3; dy++) {
      const i = (48 + dy) * SE.GRID_W + x;
      w.elevation[i] = 0.75 - 0.15 * Math.abs(dy) + (x === 240 && dy === 0 ? 0.05 : 0);
      w.uplift[i] = 0.5;
      w.upliftKind[i] = kind;
    }
  }
  return w;
}

function rangeField(w) {
  const f = new SE.TerrainField();
  f.refresh(w);
  return f;
}

function rangeChunk(f, cx, cy) {
  const out = new Uint32Array(SIDE * SIDE);
  new SE.LandComposer(art).compose(f, cx * CHUNK, cy * CHUNK, CHUNK, CHUNK, MARGIN, out, null);
  return out;
}

/** A compositor buffer of plain ground around tiles [tx, tx + tw) × [ty, ty + th), lifted by the ranges. */
function liftedBuffer(f, tx, ty, tw, th) {
  const ox = tx * 16 - 8;
  const oy = ty * 16 - 8;
  const w = tw * 16 + 16;
  const h = th * 16 + 16 + 32;
  const b = { px: new Uint8Array(w * h).fill(M.ramps.soil[1]), water: new Uint8Array(w * h), w, h };
  return { b, ox, oy, rise: SE.riseRidges(f.ridges, b, art, ox, oy) };
}

test('ranges: crest lines only on mountain belts, deterministic, one chain across the date line', () => {
  assert.equal(field.ridges.ax.length, 0, 'no range on the band world: it has no belts');
  const w = rangeWorld(10);
  const a = rangeField(w);
  const b = rangeField(w);
  assert.ok(a.ridges.ax.length > 20, 'the belt has a crest line');
  for (const k of ['ax', 'ay', 'bx', 'by', 'ha', 'hb', 'wa', 'wb', 'zTree', 'zRock', 'zSnow']) assert.deepEqual(a.ridges[k], b.ridges[k], k);
  assert.deepEqual(a.ridges.sig, b.ridges.sig);
  let crest = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    if (!a.ridges.crest[i]) continue;
    crest++;
    assert.ok(w.elevation[i] >= SE.ALPINE_MIN_ELEVATION && w.uplift[i] > 0, `crest tile ${i} lies on the belt`);
  }
  assert.ok(crest >= 50, `the crest runs the length of the belt (${crest} tiles)`);
  const xs = a.ridges.ax.map((x) => ((Math.round(x) % 4096) + 4096) % 4096);
  assert.ok(xs.some((x) => x < 256) && xs.some((x) => x > 3700), 'the line crosses the date line');
  for (let k = 0; k < a.ridges.ax.length; k++) {
    assert.ok(Math.max(a.ridges.ha[k], a.ridges.hb[k]) <= SE.RIDGE_RISE_MAX, 'rise within what the compositor composes below a chunk');
  }
  // An ice sheet stays flat.
  for (let i = 0; i < SE.TILE_COUNT; i++) w.landscape[i] = L.Ice;
  assert.equal(rangeField(w).ridges.ax.length, 0, 'no crest under an ice sheet');
});

test('ranges: no crest along the polar rows, nor where the sea-level climate is frozen', () => {
  // A high belt along the south pole and one in the middle.
  const polar = () => {
    const w = rangeWorld(10);
    for (let x = 0; x < SE.GRID_W; x++) {
      for (let y = SE.GRID_H - 5; y < SE.GRID_H; y++) {
        w.elevation[y * SE.GRID_W + x] = 0.7 - 0.1 * (SE.GRID_H - 1 - y);
        w.uplift[y * SE.GRID_W + x] = 0.5;
      }
    }
    return w;
  };
  let f = rangeField(polar());
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    if (f.ridges.crest[i]) assert.ok(((i / SE.GRID_W) | 0) < SE.GRID_H - 2, `no crest in the last two rows (tile ${i})`);
  }
  // Frozen at sea level, before succession laid down the ice: no crest; frozen by height alone: crests.
  const w = polar();
  w.temperature.fill(-40);
  assert.equal(rangeField(w).ridges.ax.length, 0, 'no crest where an ice sheet belongs');
  w.landscapeZone.fill(SE.ZONE_MOUNTAIN | 1);
  w.landscape.fill(L.Snow);
  f = rangeField(w);
  assert.ok(f.ridges.ax.length > 0, 'summit snow on a mountain only frozen by its height keeps its crest');
  w.landscapeZone.fill(0);
  assert.equal(rangeField(w).ridges.ax.length, 0, 'a zone frozen at sea level: none');
});

test('ranges: lifted chunks join without a seam, across the date line and between chunk rows', () => {
  const f = rangeField(rangeWorld(-20));
  const pairs = [[[14, 3], [15, 3]], [[15, 3], [0, 3]], [[0, 3], [1, 3]], [[15, 2], [15, 3]], [[0, 2], [0, 3]], [[1, 2], [1, 3]]];
  for (const [[ax, ay], [bx, by]] of pairs) {
    const a = rangeChunk(f, ax, ay);
    const b = rangeChunk(f, bx, by);
    if (ay === by) {
      for (let y = 0; y < SIDE; y++) {
        for (let j = 0; j < 2 * MARGIN; j++) assert.equal(a[y * SIDE + CHUNK * 16 + j], b[y * SIDE + j], `chunk ${ax},${ay} | ${bx},${by} at row ${y}`);
      }
    } else {
      for (let x = 0; x < SIDE; x++) {
        for (let j = 0; j < 2 * MARGIN; j++) assert.equal(a[(CHUNK * 16 + j) * SIDE + x], b[j * SIDE + x], `chunk ${ax},${ay} / ${bx},${by} at column ${x}`);
      }
    }
  }
  // The crest rises into the chunk row above it: compare with the same world without the belt.
  const low = rangeWorld(-20);
  low.uplift.fill(0);
  for (let i = 0; i < SE.TILE_COUNT; i++) low.elevation[i] = Math.min(low.elevation[i], 0.19);
  const lifted = rangeChunk(f, 15, 2);
  const flat = rangeChunk(rangeField(low), 15, 2);
  let changed = 0;
  for (let k = (CHUNK * 16 - 16) * SIDE; k < lifted.length; k++) if (lifted[k] !== flat[k]) changed++;
  assert.ok(changed > 200, `the faces reach into the chunk above (${changed} px)`);
  const c = rangeChunk(f, 15, 3);
  assert.deepEqual(c, rangeChunk(f, 15, 3), 'deterministic');
  const alpha = new Uint8Array(c.buffer);
  for (let k = 3; k < alpha.length; k += 4) assert.equal(alpha[k], 255);
});

test('ranges: snow only above the snow line, none on a warm crest', () => {
  const ice = new Set(M.ramps.ice);
  const snowPixels = (temp) => {
    const f = rangeField(rangeWorld(temp));
    const { b, rise } = liftedBuffer(f, 236, 44, 10, 6);
    assert.ok(rise, 'the range reaches into the buffer');
    let snow = 0;
    for (let k = 0; k < b.px.length; k++) {
      if (!ice.has(b.px[k])) continue;
      const g = SE.riseDepth(rise, k % b.w, (k / b.w) | 0, b.w) * b.w + (k % b.w);
      const z = rise.z[g];
      assert.ok(z > 0, 'snow only on lifted ground');
      assert.ok(z >= f.ridges.zSnow[rise.seg[g]], `snow at a rise of ${z.toFixed(1)} px, under the snow line at ${f.ridges.zSnow[rise.seg[g]]}`);
      snow++;
    }
    return { snow, f };
  };
  assert.equal(snowPixels(25).snow, 0, 'a crest at 25 °C carries no snow');
  // At −2 °C on the tile mean, the snow line lies (−2 − SNOW_TEMP) / 6.5 km above it, inside the crest.
  const cold = snowPixels(-2);
  const line = Math.round(((-2 - SE.SNOW_TEMP) / SE.LAPSE_RATE) * SE.RIDGE_PX_PER_KM);
  assert.ok(cold.f.ridges.zSnow.every((z) => z === line), `snow line at ${line} px of rise`);
  assert.ok(cold.snow > 0, 'the crest above it carries snow');
  // The crest's own lines decide, not the broader belt flags of its tiles; in dry air the snow line lies higher.
  const zoned = (zone) => {
    const w = rangeWorld(-2);
    w.landscapeZone.fill(zone);
    return rangeField(w).ridges;
  };
  const moist = zoned(SE.ZONE_MOUNTAIN | SE.ZONE_TREELINE | SE.ZONE_ROCKBELT | SE.ZONE_SNOW | (2 << 3) | 1);
  assert.ok(moist.zSnow.every((z) => z === line) && moist.zRock.every((z) => z > 0), 'snow and rock only on the high parts');
  const dry = Math.round(((-2 - SE.snowTemp(0)) / SE.LAPSE_RATE) * SE.RIDGE_PX_PER_KM);
  assert.ok(dry > line && zoned(1).zSnow.every((z) => z === dry), `dry snow line at ${dry} px`);
});

test('ranges: trees stand on the lifted ground, stop at the tree line and hide behind nearer ground', () => {
  const w = rangeWorld(4);
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    w.landscape[i] = L.Taiga;
    w.substrate[i] = SE.Substrate.Soil;
    w.flora[i] = 1 << SE.Flora.Conifers;
    w.floraTop[i] = SE.Flora.Conifers;
    w.vegetation[i] = 0.8;
  }
  const f = rangeField(w);
  const list = [];
  SE.placeLandObjects(f, art, 234, 43, 246, 53, list);
  const trees = list.filter((p) => p.sprite.size !== '');
  assert.ok(trees.length > 40, 'trees grow on the belt');
  const { b, ox, oy, rise } = liftedBuffer(f, 234, 43, 13, 11);
  // The same lifted ground without anything standing in front of anything.
  const open = { ...rise, top: new Int16Array(b.w).fill(b.h) };
  let high = 0;
  let behind = 0;
  for (const p of trees) {
    const foot = p.fy - oy;
    const k = foot * b.w + (p.fx - ox);
    const draw = (r) => {
      const px = new Uint8Array(b.px.length);
      const occupied = new Uint8Array(b.px.length);
      SE.drawLandObjects([p], art, px, b.water, occupied, b.w, b.h, ox, oy, r);
      return occupied;
    };
    const shown = draw(rise);
    let n = 0;
    for (let q = 0; q < shown.length; q++) {
      if (shown[q] !== 1) continue;
      n++;
      assert.ok(SE.riseDepth(rise, q % b.w, (q / b.w) | 0, b.w) <= foot + 1, 'a tree pixel never covers ground nearer than its foot');
    }
    if (rise.z[k] > 0 && rise.z[k] >= f.ridges.zTree[rise.seg[k]]) {
      high++;
      assert.equal(n, 0, 'no tree above the tree line of the crest');
      continue;
    }
    let all = 0;
    for (const v of draw(open)) if (v === 1) all++;
    if (all > n) behind++;
  }
  assert.ok(high > 0, 'some trees stood above the tree line');
  assert.ok(behind > 0, 'some trees hide behind the crest');
});

test('ranges: trees on the faces join without a seam where chunks meet', () => {
  // Forest everywhere and a few ranges that end, bend and lie at different heights near chunk edges.
  const w = new SE.WorldState();
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    w.elevation[i] = 0.1;
    w.biome[i] = SE.Biome.Forest;
    w.landscape[i] = L.Taiga;
    w.substrate[i] = SE.Substrate.Soil;
    w.temperature[i] = 6;
    w.flora[i] = 1 << SE.Flora.Conifers;
    w.floraTop[i] = SE.Flora.Conifers;
    w.vegetation[i] = 0.8;
    w.landscapeDensity[i] = 3;
  }
  const belt = (x0, x1, y, slope, top) => {
    for (let k = 0; k <= x1 - x0; k++) {
      for (let dy = -3; dy <= 3; dy++) {
        const i = (Math.round(y + k * slope) + dy) * SE.GRID_W + x0 + k;
        w.elevation[i] = Math.max(w.elevation[i], top + 0.05 * Math.sin(k) - 0.15 * Math.abs(dy));
        w.uplift[i] = 0.5;
        w.upliftKind[i] = 1;
      }
    }
  };
  belt(20, 44, 60, 0, 0.75);
  belt(40, 70, 66, 0, 0.7);
  belt(90, 130, 44, 0.5, 0.8);
  const f = rangeField(w);
  const chunks = new Map();
  const chunk = (cx, cy) => {
    if (!chunks.has(cy * 16 + cx)) chunks.set(cy * 16 + cx, rangeChunk(f, cx, cy));
    return chunks.get(cy * 16 + cx);
  };
  for (let cy = 2; cy <= 4; cy++) {
    for (let cx = 0; cx <= 7; cx++) {
      const a = chunk(cx, cy);
      const right = chunk(cx + 1, cy);
      const down = chunk(cx, cy + 1);
      let off = 0;
      for (let y = 0; y < SIDE; y++) {
        for (let j = 0; j < 2 * MARGIN; j++) {
          off += +(a[y * SIDE + CHUNK * 16 + j] !== right[y * SIDE + j]) + +(a[(CHUNK * 16 + j) * SIDE + y] !== down[j * SIDE + y]);
        }
      }
      assert.equal(off, 0, `chunk ${cx},${cy} and its neighbours: ${off} px differ`);
    }
  }
});

test('volcanoes: cones on volcanic belts only, raised in the relief, fresh on basalt and on a young vent', () => {
  const fold = rangeField(rangeWorld(10, 1));
  assert.ok(fold.volcano.every((v) => v === 0), 'a fold belt has no volcanoes');
  const w = rangeWorld(10, 2);
  const summit = 48 * SE.GRID_W + 240;
  assert.ok(rangeField(w).volcano.every((v) => v === 0), 'a coastal range over a cold mantle has no volcanoes');
  // Hot mantle under one half of the range only: the other half is a plain coast.
  for (let i = 0; i < SE.TILE_COUNT; i++) if (i % SE.GRID_W >= 230) w.magma[i] = 0.5;
  let f = rangeField(w);
  assert.equal(f.volcano[summit], 1, 'a dormant cone on the arc summit');
  let cones = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    if (!f.volcano[i]) continue;
    cones++;
    assert.equal(f.volcano[i], 1, 'no basalt, no vent: dormant');
    assert.ok(SE.isVolcanicKind(w.upliftKind[i]) && w.magma[i] >= 0.3, 'only on a volcanic belt over hot mantle');
  }
  assert.ok(cones > 1 && f.volcano.slice(48 * SE.GRID_W, 48 * SE.GRID_W + 30).every((v) => v === 0), `${cones} cones, none on the cold half`);
  assert.ok(f.ridges.cone[summit] >= 0, 'the cone is part of the relief');
  const list = [];
  SE.placeLandObjects(f, art, 236, 44, 246, 52, list);
  assert.ok(list.every((p) => p.sprite.id !== 'volcano'), 'no cone sprite among the objects');
  w.hazards.scar[summit] = SE.ScarKind.Basalt;
  assert.equal(rangeField(w).volcano[summit], 2, 'fresh on basalt');
  w.hazards.scar[summit] = SE.ScarKind.Vent;
  assert.equal(rangeField(w).volcano[summit], 2, 'a young vent is fresh');
  w.hazards.scarAge[summit] = SE.SCAR_MIN_TICKS[SE.ScarKind.Basalt];
  assert.equal(rangeField(w).volcano[summit], 1, 'an old vent is dormant');
  // A vent anywhere on land is a cone, and the belt's own cone keeps its distance.
  w.hazards.scar[summit] = SE.ScarKind.None;
  const plain = 20 * SE.GRID_W + 100;
  const near = summit + 2;
  w.hazards.scar[plain] = SE.ScarKind.Vent;
  w.hazards.scar[near] = SE.ScarKind.Vent;
  f = rangeField(w);
  assert.equal(f.volcano[plain], 2, 'a vent off any belt');
  assert.equal(f.volcano[near], 2, 'a vent on the range');
  assert.equal(f.volcano[summit], 0, 'no second cone right beside a vent');
});

test('volcanoes: one dormant cone whatever grows or lies around it, no green on a lifeless planet, hotspots whatever the mantle', () => {
  const summit = 48 * SE.GRID_W + 240;
  const look = (kind, magma, ground) => {
    const w = rangeWorld(10, kind);
    w.magma.fill(magma);
    ground(w);
    return rangeField(w).volcano[summit];
  };
  assert.equal(look(2, 0.5, () => {}), 1, 'lifeless rock');
  assert.equal(look(2, 0.5, (w) => w.landscape.fill(L.Forest)), 1, 'forest all around');
  assert.equal(look(2, 0.5, (w) => { w.landscape.fill(L.Forest); w.landscape[summit] = L.Ice; }), 1, 'on ice');
  assert.equal(look(2, 0.5, (w) => { w.landscape[summit] = L.Snow; }), 1, 'under summit snow');
  assert.equal(look(4, 0, () => {}), 1, 'a hotspot needs no hot mantle field');
  assert.equal(look(3, 0, () => {}), 1, 'nor does an island arc');
  assert.equal(look(2, 0.2, () => {}), 0, 'a coastal range over a cold mantle: none');
  // The lifeless range with its cone composes without a single plant colour.
  const w = rangeWorld(10, 2);
  w.magma.fill(0.5);
  const f = rangeField(w);
  assert.equal(f.volcano[summit], 1);
  const green = new Set(['leaf', 'pine', 'jungle', 'meadow', 'moss'].flatMap((r) => M.ramps[r].map((v) => art.rgba[v])));
  for (const [cx, cy] of [[14, 2], [14, 3], [15, 2], [15, 3]]) {
    assert.ok(rangeChunk(f, cx, cy).every((c) => !green.has(c)), `chunk ${cx},${cy}: no green on a lifeless planet`);
  }
});

test('ground: new land of a hotspot or an island arc is basalt until it weathers, the rock belt scree', () => {
  const T = SE.LandTables.shared();
  const basalt = T.materialKey('basalt');
  const rock = T.groundKey(L.Rock, SE.Substrate.Rock, 0);
  const tile = 48 * SE.GRID_W + 250;
  const keyOf = (kind, soil = 0, zone = SE.ZONE_NONE, scar = SE.ScarKind.None) => {
    const w = rangeWorld(10, kind);
    w.soil[tile] = soil;
    w.landscapeZone[tile] = zone;
    w.hazards.scar[tile] = scar;
    return rangeField(w).key[tile];
  };
  assert.equal(keyOf(4), basalt, 'hotspot: fresh basalt');
  assert.equal(keyOf(3), basalt, 'island arc: fresh basalt');
  assert.equal(keyOf(4, Math.ceil(SE.SOIL_EARTH * 255)), rock, 'weathered: grey rock');
  assert.equal(keyOf(2), rock, 'a coastal range is grey rock');
  const belt = SE.ZONE_MOUNTAIN | SE.ZONE_TREELINE | SE.ZONE_ROCKBELT;
  assert.equal(keyOf(2, 0, belt), T.materialKey('scree'), 'the rock belt of a coastal range is scree');
  assert.equal(keyOf(4, 0, SE.ZONE_NONE, SE.ScarKind.Scree), rock, "a fresh scar's ground comes first");
});

test('hillshade: light from the upper left, stronger in the mountains, no steps on the tile grid', () => {
  // Slopes of 0.06 per tile: hills around x = 60, mountains around x = 160.
  const shadeAt = (dir) => {
    const w = new SE.WorldState();
    for (let i = 0; i < SE.TILE_COUNT; i++) {
      const x = i % SE.GRID_W;
      const base = x < 128 ? 0.12 : 0.5;
      w.elevation[i] = base + dir * 0.06 * (x - (x < 128 ? 60 : 160));
      w.landscape[i] = L.Rock;
    }
    const f = rangeField(w);
    return [f.shade[40 * SE.GRID_W + 60], f.shade[40 * SE.GRID_W + 160]];
  };
  const [hillEast, mountEast] = shadeAt(1);
  const [hillWest, mountWest] = shadeAt(-1);
  assert.ok(hillEast > hillWest, 'a slope rising towards the lower right faces the light, its mirror image faces away');
  assert.ok(mountEast - mountWest > hillEast - hillWest + 1, `mountain flanks shade more strongly (${mountEast - mountWest} vs ${hillEast - hillWest})`);
  // A steady ramp of shading across the tiles is drawn as a steady ramp: no
  // jump at the tile grid (the shading is a spline, not per-tile steps).
  // Bare rock of one even tone, so every pixel shows the shading alone.
  const plain = atlasIndices();
  const r = M.materials.rock.densities[0];
  for (let y = r.y; y < r.y + r.h; y++) plain.fill(M.ramps.rock[2], y * M.width + r.x, y * M.width + r.x + r.w);
  const plainArt = SE.LandArt.fromIndices(plain);
  const ramp = (slope) => {
    const g = new SE.TerrainField();
    const key = SE.LandTables.shared().groundKey(L.Rock, SE.Substrate.Rock, 0);
    for (let i = 0; i < SE.TILE_COUNT; i++) {
      g.key[i] = key;
      g.depth[i] = SE.LAND_SHALLOW;
      g.shade[i] = ((i % SE.GRID_W) - 56) * slope;
      g.scene[i] = SE.LAND_SCENE_NONE;
    }
    const out = new Uint32Array(SIDE * SIDE);
    new SE.LandComposer(plainArt).compose(g, 3 * CHUNK, 2 * CHUNK, CHUNK, CHUNK, MARGIN, out, null);
    return out;
  };
  const stepOf = new Map();
  for (const r of Object.values(M.ramps)) r.forEach((index, step) => stepOf.set(art.rgba[index], step));
  const shaded = ramp(0.15);
  const flat = ramp(0);
  // Averaged over 8 columns, two periods of the dither.
  const mid = art.rgba[M.ramps.rock[2]];
  const mean = [];
  for (let x0 = 0; x0 + 8 <= SIDE; x0 += 8) {
    let sum = 0;
    let n = 0;
    for (let x = x0; x < x0 + 8; x++) {
      for (let y = 0; y < SIDE; y++) {
        if (flat[y * SIDE + x] !== mid) continue;
        sum += stepOf.get(shaded[y * SIDE + x]) - 2;
        n++;
      }
    }
    mean.push(sum / n);
  }
  for (let k = 1; k < mean.length; k++) assert.ok(Math.abs(mean[k] - mean[k - 1]) <= 0.3, `columns ${k * 8}: the shading jumps by ${(mean[k] - mean[k - 1]).toFixed(2)} steps`);
  assert.ok(mean[mean.length - 1] > mean[0] + 1, 'the ramp is drawn');
});

test('examine: height to 10 m, depth below the sea, altitude belt in German', () => {
  const w = new SE.WorldState();
  const at = (e, zone = SE.ZONE_NONE, ls = L.Forest) => {
    w.elevation[0] = e;
    w.landscapeZone[0] = zone;
    w.landscape[0] = ls;
    return [SE.altitudeLabel(w, 0), SE.altitudeBelt(w, 0)];
  };
  assert.deepEqual(at(0.52), ['Höhe 2.340 m', 'Montan (Bergwald)']);
  assert.deepEqual(at(-0.1), ['Tiefe 450 m', '']);
  assert.deepEqual(at(0.02), ['Höhe 90 m', 'Tiefland']);
  assert.deepEqual(at(0.15)[1], 'Bergland');
  assert.equal(at(0.5, SE.ZONE_TREELINE, L.Alpine)[1], 'Alpin (Matten)');
  assert.equal(at(0.6, SE.ZONE_TREELINE | SE.ZONE_ROCKBELT, L.Rock)[1], 'Subnival (Fels und Schutt)');
  assert.equal(at(0.7, SE.ZONE_TREELINE | SE.ZONE_ROCKBELT | SE.ZONE_SNOW, L.Snow)[1], 'Nival (Schnee und Eis)');
});

test('examine: only the selected field and its own objects, without changing map inputs', () => {
  const f = Object.assign(Object.create(SE.TerrainField.prototype), field, {
    scene: new Uint8Array(SE.TILE_COUNT).fill(SE.LAND_SCENE_NONE),
    volcano: new Uint8Array(SE.TILE_COUNT), ridges: new SE.RidgePaths(),
    density: field.density.slice(), edge: field.edge.slice(), groups: field.groups.slice(), top: field.top.slice(),
  });
  const x = 140, y = 30, i = SE.idx(x, y);
  const bare = SE.composeExaminedTile(art, f, x, y);
  assert.deepEqual([bare.width, bare.height, bare.left, bare.top], [16, 16, 0, 0]);
  const neighbour = i + SE.GRID_W;
  f.scene[neighbour] = L.Forest;
  f.density[neighbour] = 1;
  f.edge[neighbour] = 2;
  f.groups[neighbour] = SE.floraBit(SE.Flora.Broadleaf);
  f.top[neighbour] = SE.Flora.Broadleaf;
  const map = new Uint32Array(256);
  new SE.LandComposer(art).compose(f, x, y, 1, 1, 0, map);
  assert.notDeepEqual(map, bare.pixels, 'the neighbouring tree really reaches the selected field on the map');
  assert.deepEqual(SE.composeExaminedTile(art, f, x, y).pixels, bare.pixels, 'the neighbouring tree is excluded from Examine');
  assert.equal(f.scene[neighbour], L.Forest, 'drawing the preview preserves the map objects');
  assert.equal(f.scene[i], SE.LAND_SCENE_NONE);
});

test('examine: tall objects keep their full overhang on an opaque single-field base', () => {
  const f = Object.assign(Object.create(SE.TerrainField.prototype), field, {
    scene: new Uint8Array(SE.TILE_COUNT).fill(SE.LAND_SCENE_NONE),
    volcano: new Uint8Array(SE.TILE_COUNT), ridges: new SE.RidgePaths(),
    density: field.density.slice(), edge: field.edge.slice(), groups: field.groups.slice(), top: field.top.slice(),
  });
  const x = 140, y = 30;
  const i = SE.idx(x, y);
  f.scene[i] = L.Forest;
  f.density[i] = 1;
  f.edge[i] = 2;
  f.groups[i] = SE.floraBit(SE.Flora.Broadleaf);
  f.top[i] = SE.Flora.Broadleaf;
  const tile = SE.composeExaminedTile(art, f, x, y);
  assert.ok(tile.top < 0 && tile.height > 16, 'the tree rises above its field');
  const placements = [];
  SE.placeLandObjects(f, art, x, y, x, y, placements);
  for (const p of placements) {
    assert.ok(p.fx - x * 16 - p.sprite.ax >= tile.left);
    assert.ok(p.fy - y * 16 - p.sprite.ay >= tile.top);
    assert.ok(p.fx - x * 16 - p.sprite.ax + p.sprite.w <= tile.left + tile.width);
    assert.ok(p.fy - y * 16 - p.sprite.ay + p.sprite.h <= tile.top + tile.height);
  }
  for (let py = 0; py < 16; py++) for (let px = 0; px < 16; px++) {
    assert.notEqual(tile.pixels[(py - tile.top) * tile.width + px - tile.left] >>> 24, 0, 'base is opaque');
  }
  assert.ok(tile.pixels.slice(0, -tile.top * tile.width).some(v => v >>> 24), 'overhang is actually drawn');
  assert.deepEqual(SE.composeExaminedTile(art, f, x, y).pixels, tile.pixels, 'stable preview');
});

test('effect layers: landRiseAt and landRiseMap give the lift the compositor draws', () => {
  const f = rangeField(rangeWorld(-20));
  const { b, ox, oy, rise } = liftedBuffer(f, 236, 44, 10, 6);
  // The compositor's lift and warp, copied: the API calls reuse the same buffers.
  const z = Float32Array.from(rise.z.subarray(0, b.w * b.h));
  const seg = Int32Array.from(rise.seg.subarray(0, b.w * b.h));
  const shows = Int16Array.from({ length: b.w * b.h }, (_, k) => SE.riseDepth(rise, k % b.w, (k / b.w) | 0, b.w));
  let crest = 0;
  for (let y = 0; y < b.h; y += 3) {
    for (let x = 0; x < b.w; x += 5) {
      const k = y * b.w + x;
      assert.equal(SE.landRiseAt(f, ox + x, oy + y), z[k], `lift at ${x},${y}`);
      // Taken alone, bit for bit as in the buffer: objects beside a buffer stand on it.
      const foot = SE.footRise(f.ridges, ox + x, oy + y);
      assert.equal(foot.z, z[k]);
      if (z[k] > 0) assert.equal(foot.seg, seg[k], `segment at ${x},${y}`);
      if (z[k] > 10) crest++;
    }
  }
  assert.ok(crest > 10, `crest pixels checked (${crest})`);
  // Across the date line the same: world pixels are taken wrapped or not.
  assert.equal(SE.landRiseAt(f, ox + 40 - 4096, oy + 30), SE.landRiseAt(f, ox + 40, oy + 30));
  // The tile foot the effect layers use.
  assert.equal(SE.landRiseAtTile(f, 240, 48), SE.landRiseAt(f, 240 * 16 + 8, 48 * 16 + 15));
  // The warp of the buffer's own rows, as the compositor draws them.
  const h = b.h - 32;
  const map = SE.landRiseMap(f, ox, oy, b.w, h, b.water);
  assert.ok(map, 'the range reaches into the buffer');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < b.w; x++) assert.equal(SE.riseDepth(map, x, y, b.w), shows[y * b.w + x], `ground shown at ${x},${y}`);
  }
  assert.equal(SE.landRiseMap(f, 100 * 16 - 8, 20 * 16 - 8, 64, 64), null, 'no range, no warp');
  assert.equal(SE.landRiseAt(f, 100 * 16, 20 * 16), 0);
});

test('ranges: a recomposed chunk with a kept rise looks exactly like a fresh one', () => {
  const f = rangeField(rangeWorld(-20));
  SE.landRiseForget();
  const cold = rangeChunk(f, 15, 3);
  const warm = rangeChunk(f, 15, 3);
  assert.deepEqual(warm, cold);
  SE.landRiseForget();
  assert.deepEqual(rangeChunk(f, 15, 3), cold);
});

test('ranges: a meteor on a slope renumbers the segments; kept rises never recall stale ids', () => {
  // Regression: the kept rise was keyed by the ranges' shape alone, so after a
  // rebuild it handed back segment ids of the old list, and lift() threw on a
  // rockKey that no longer existed: the map stopped redrawing.
  const s = makeSim(12345, 'today');
  const f = new SE.TerrainField();
  const composer = new SE.LandComposer(art);
  const out = new Uint32Array(SIDE * SIDE);
  const [mx, my] = [79, 82];
  const around = () => {
    for (let cy = my - 24; cy < my + 24; cy += CHUNK) {
      for (let cx = mx - 24; cx < mx + 24; cx += CHUNK) composer.compose(f, cx, cy, CHUNK, CHUNK, MARGIN, out, null);
    }
  };
  SE.landRiseForget();
  f.refresh(s.world);
  around();
  const hz = new SE.HazardSystem();
  assert.ok(hz.start(s.world, SE.EventKind.Meteor, mx, my, 'player'));
  for (let t = 0; t < 4; t++) {
    s.tick();
    hz.step(s.world);
    f.refresh(s.world);
    assert.doesNotThrow(around, `tick ${t}`);
  }
});

test('bare ground shows the first plants that settle on it', () => {
  const T = SE.LandTables.shared();
  const L = SE.Landscape;
  for (const ls of [L.Rock, L.Barren, L.Desert]) {
    for (const g of [SE.Flora.LandPlants, SE.Flora.Mosses, SE.Flora.Vascular]) {
      assert.ok(T.showable[ls] & (1 << g), `${SE.LANDSCAPE_IDS[ls]} shows ${SE.FLORA[g].id}`);
    }
  }
});
