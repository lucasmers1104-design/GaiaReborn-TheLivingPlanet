'use strict';
/*
 * The city art contract (docs/zivilisation-spec.md §3): the committed civ
 * atlas is what the recipes produce and keeps the pixel style rules; every
 * era has its set of blocks; the tribe colours agree between pixel pennant
 * and SVG; a city's layout stays on its own tile and clear of the river,
 * grows with its size stage (a ring wall for the walled eras' metropolises,
 * towers only in a modern metropolis), crosses a straight river by bridge
 * from the Bronze Age and is the same every time; its yard leaves the river
 * bank free; the settler, marker and label keep their formats.
 *
 * CIV_ATLAS_MEMORY=1 checks the layout against the atlas the recipes build
 * now instead of the committed one (and skips the staleness test), so a
 * recipe or plan under work can be tested before the atlas is written.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadSE } = require('./helpers');
const { build } = require('../tools/civ/build');
const { assemble, renderTs } = require('../tools/civ/atlas');
const { encodeIndexed } = require('../tools/terrain/png');
const P = require('../tools/terrain/palette');
const { artProblems } = require('../tools/artcheck');

const SE = loadSE();
const MEMORY = !!process.env.CIV_ATLAS_MEMORY;
const BUILT = MEMORY ? assemble(build()) : null;
const M = BUILT ? BUILT.manifest : SE.CIV_MANIFEST;
const ERAS = M.eras.map((id, k) => ({ id, tech: k + 1 }));
const WALLED = ['stone', 'bronze', 'iron'];
const BUILDINGS = ['dwelling', 'hall', 'landmark'];
const role = (p) => M.blocks[p.id].role;
const sprite = (p) => M.blocks[p.id].variants[p.v];
const count = (list) => list.filter((p) => BUILDINGS.includes(role(p))).length;

/** A straight river from (x0, y0) to (x1, y1) in world pixels, `r` px wide on each side. */
function river(x0, y0, x1, y1, r) {
  const dist = (x, y) => {
    const vx = x1 - x0;
    const vy = y1 - y0;
    const t = Math.max(0, Math.min(1, ((x - x0) * vx + (y - y0) * vy) / (vx * vx + vy * vy)));
    return Math.hypot(x - x0 - t * vx, y - y0 - t * vy) - r;
  };
  return { dist, near: (x, y, pad) => dist(x, y) <= pad };
}

function layout(x, y, size, tech = SE.Tech.Stone, near = () => false, extra = {}) {
  return SE.layoutCity({ x, y, era: tech, size, tribe: (x + y) % 8, near, rivers: 0, ...extra }, M);
}

/** Art pixels of the box beside the tile on either side. */
const SIDE = (M.box.w - 16) / 2;

/** Pixels of the blocks other than the yard, on the city box. */
function covered(list) {
  const g = new Uint8Array(M.box.w * M.box.h);
  for (const p of list) {
    if (role(p) === 'ground') continue;
    const s = sprite(p);
    const left = p.fx - s.ax + SIDE;
    const top = p.fy - s.ay + M.box.h - 16;
    for (let r = 0; r < s.rect.h; r++) for (let c = s.spans[2 * r]; c <= s.spans[2 * r + 1]; c++) g[(top + r) * M.box.w + left + c] = 1;
  }
  return g.reduce((a, b) => a + b, 0);
}

/** The picture stays in the city box and the ground footprint on the tile. */
function inBox(p) {
  const s = sprite(p);
  const left = p.fx - s.ax;
  return left >= -SIDE && left + s.rect.w <= 16 + SIDE && p.fy - s.ay >= 16 - M.box.h &&
    left + s.bx0 >= 0 && left + s.bx1 <= 15;
}

/** The committed atlas decoded to RGBA (indexed PNG, filter 0 on every row); in memory mode the built one. */
function atlasPixels() {
  if (BUILT) {
    const data = new Uint8Array(BUILT.size.w * BUILT.size.h * 4);
    for (let i = 0; i < BUILT.px.length; i++) data.set(P.PALETTE[BUILT.px[i]], i * 4);
    return { w: BUILT.size.w, data };
  }
  const zlib = require('zlib');
  const buf = Buffer.from(SE.CIV_ATLAS_PNG.slice(SE.CIV_ATLAS_PNG.indexOf(',') + 1), 'base64');
  const idat = [];
  for (let p = 8; p < buf.length;) {
    const len = buf.readUInt32BE(p);
    if (buf.toString('ascii', p + 4, p + 8) === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const data = new Uint8Array(M.width * M.height * 4);
  for (let y = 0; y < M.height; y++) {
    for (let x = 0; x < M.width; x++) data.set(P.PALETTE[raw[y * (M.width + 1) + 1 + x]], (y * M.width + x) * 4);
  }
  return { w: M.width, data };
}

const TILES = Array.from({ length: 60 }, (_, n) => [(n * 37) % SE.GRID_W, 6 + ((n * 13) % (SE.GRID_H - 12))]);

test('the committed city atlas is what the recipes produce', { skip: MEMORY && 'CIV_ATLAS_MEMORY' }, () => {
  const art = build();
  const out = assemble(art);
  const png = encodeIndexed(out.size.w, out.size.h, out.px, P.PALETTE);
  const committed = fs.readFileSync(path.join(__dirname, '..', 'src', 'civatlas.ts'), 'utf8');
  assert.ok(committed === renderTs(png, out.manifest), 'src/civatlas.ts is stale: run node tools/civ-atlas.js --write');
  assert.ok(fs.readFileSync(path.join(__dirname, '..', 'assets', 'civ', 'atlas.png')).equals(png), 'assets/civ/atlas.png is stale');
  assert.ok(SE.CIV_ATLAS_PNG.startsWith('data:image/png;base64,'));
});

test('city blocks keep the pixel style rules', () => {
  assert.deepEqual(build().problems, []);
  for (const [id, b] of Object.entries(M.blocks)) {
    for (const s of b.variants) {
      assert.ok(s.rect.w <= M.box.w && s.rect.h <= M.box.h, `${id}: fits the city box`);
      assert.equal(s.ay, s.rect.h - 1, `${id}: stands on its last row`);
      assert.equal(s.spans.length, s.rect.h * 2);
      if (b.role === 'ground') assert.ok(s.rect.h <= 14, `${id}: the yard leaves the two bottom rows free`);
      // depth 0: never placed on the ground (flame and smoke frames, drawn over the pictures by cityfire.ts).
      else if (b.depth > 0) assert.ok(s.bx0 <= s.bx1, `${id}: has a footprint`);
    }
  }
});

test('every era has its set: houses in three sizes, hall, landmark, yard things, a yard per stage; walls and bridges where due', () => {
  for (const { id, tech } of ERAS) {
    const blocks = Object.values(M.blocks).filter((b) => b.era === id);
    const of = (r) => blocks.filter((b) => b.role === r);
    for (const r of ['dwelling', 'hall', 'landmark', 'yard', 'ground']) assert.ok(of(r).length > 0, `${id}: ${r}`);
    for (const b of of('dwelling')) assert.deepEqual(b.variants.map((v) => v.size), ['s', 'm', 'l'], `${id}: house sizes`);
    assert.equal(of('ground')[0].variants.length, 3, `${id}: a yard per size stage`);
    assert.equal(of('wall').length > 0, WALLED.includes(id), `${id}: walls only in the walled eras`);
    for (const b of of('wall')) assert.equal(b.variants.length, 3, `${id}: straight, running and long wall pieces`);
    for (const b of of('bridge')) assert.equal(b.variants.length, 2, `${id}: a horizontal and a vertical bridge`);
    assert.equal(SE.cityArtEra(tech, M), id, `${id}: drawn`);
    const sizes = blocks.filter((b) => b.role !== 'ground' && b.role !== 'bridge' && b.role !== 'wall').length;
    assert.ok(sizes >= 4, `${id}: 4–5 blocks`);
  }
  for (const id of ['bronze', 'iron', 'industrial']) assert.ok(Object.values(M.blocks).some((b) => b.era === id && b.role === 'bridge'), `${id}: its own bridge`);
  const banner = Object.values(M.blocks).find((b) => b.role === 'banner');
  assert.equal(banner.variants.length, SE.TRIBE_MAX);
  assert.equal(SE.cityArtEra(SE.Tech.None, M), null);
});

test('tribe colours: one table, the SVG colour nearest to its own pixel colour', () => {
  const C = M.tribeColors;
  assert.equal(C.length, SE.TRIBE_MAX);
  const rgb = (hex) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  C.forEach((c, k) => {
    assert.ok(c.art in SE.ART_PALETTE, `${c.id}: ${c.art} is an ART_PALETTE key`);
    assert.deepEqual(c.rgb, P.PALETTE[P.c(c.pixel)].slice(0, 3), `${c.id}: pixel colour`);
    const art = rgb(SE.ART_PALETTE[c.art]);
    const nearest = C.map((o) => d(o.rgb, art)).reduce((best, v, j, all) => (v < all[best] ? j : best), 0);
    assert.equal(nearest, k, `${c.id}: the SVG colour is nearest to its own pixel colour`);
    assert.equal(SE.tribeArtColor(k), c.art);
  });
  assert.equal(SE.tribeArtColor(-1), 'cream', 'no tribe: a neutral pennant');
});

test('a city off the river stays on its own tile: feet in x 2..13, y 5..13, the picture in the city box, the bottom two rows free', () => {
  for (const { tech } of ERAS) {
    for (const [x, y] of TILES) {
      for (let size = 0; size < 3; size++) {
        const list = layout(x, y, size, tech);
        assert.equal(role(list[0]), 'ground', 'the yard comes first');
        assert.equal(list[0].v, size, 'the yard grows with the size stage');
        for (const p of list) {
          const s = sprite(p);
          assert.ok(inBox(p), `${p.id} inside the city box, footprint on the tile`);
          assert.ok(p.fy <= 13, 'rows 14 and 15 stay free');
          if (role(p) === 'ground') {
            assert.ok(p.fy - s.ay >= 0, 'the yard stays on the tile');
          } else if (role(p) === 'wall' && size === 2) {
            assert.ok(p.fy >= 4, 'the ring stands on the tile');
          } else {
            assert.ok(p.fx >= SE.CITY_FOOT_X0 && p.fx <= SE.CITY_FOOT_X1, `${p.id} foot x ${p.fx}`);
            assert.ok(p.fy >= SE.CITY_FOOT_Y0, `${p.id} foot y ${p.fy}`);
          }
        }
      }
    }
  }
});

test('size stages read apart: houses only in a village, a hall in a town, a landmark in a metropolis, more ground covered', () => {
  for (const { id, tech } of ERAS) {
    const cover = [0, 0, 0];
    let towns45 = 0;
    let towersTown = 0;
    let towersMetro = 0;
    for (const [x, y] of TILES) {
      const v = layout(x, y, 0, tech);
      const t = layout(x, y, 1, tech);
      const m = layout(x, y, 2, tech);
      assert.ok(count(v) >= 2 && count(v) <= 3, `${id} village ${x},${y}: ${count(v)} houses`);
      assert.ok(v.every((p) => role(p) !== 'hall' && role(p) !== 'landmark' && role(p) !== 'wall'), `${id}: a village has houses only`);
      assert.ok(count(t) >= 3 && count(t) <= 5, `${id} town ${x},${y}: ${count(t)}`);
      if (count(t) >= 4) towns45++;
      assert.ok(t.some((p) => role(p) === 'hall'), `${id} town ${x},${y}: a hall`);
      assert.ok(count(m) >= 3 && count(m) <= 8, `${id} metropolis ${x},${y}: ${count(m)}`);
      assert.ok(m.some((p) => role(p) === 'landmark'), `${id} metropolis ${x},${y}: a landmark`);
      [v, t, m].forEach((list, s) => { cover[s] += covered(list); });
      const tall = (list) => Math.max(...list.filter((p) => role(p) === 'dwelling').map((p) => sprite(p).rect.h), 0);
      towersTown += tall(t);
      towersMetro += tall(m);
      if (WALLED.includes(id)) {
        const ring = m.filter((p) => role(p) === 'wall');
        assert.ok(ring.length >= 10, `${id} metropolis ${x},${y}: a closed ring (${ring.length} pieces)`);
        const hall = m.find((p) => role(p) === 'hall');
        if (hall) assert.ok(Math.abs(hall.fx - 8) <= 3, `${id}: the hall stands in the middle of the ring`);
        assert.equal(t.filter((p) => role(p) === 'wall').length <= 1, true, `${id}: a town has one piece of wall at most`);
      }
    }
    assert.ok(cover[0] < cover[1] && cover[1] < cover[2], `${id}: covered ${cover.join(' < ')}`);
    assert.ok(towns45 >= TILES.length * 0.6, `${id}: towns with 4–5 buildings ${towns45} of ${TILES.length}`);
    if (!WALLED.includes(id)) assert.ok(towersMetro > towersTown, `${id}: a metropolis builds higher than a town`);
  }
});

/** River courses through tile (x, y): straight, offset, across, diagonal, wide, and a fork of two arms. */
function courses(x, y) {
  const ox = x * 16;
  const oy = y * 16;
  const arm1 = river(ox - 4, oy - 16, ox + 7, oy + 9, 1.5);
  const arm2 = river(ox + 20, oy - 16, ox + 7, oy + 9, 1.5);
  const trunk = river(ox + 7, oy + 9, ox + 6, oy + 32, 2);
  const fork = {
    dist: (px, py) => Math.min(arm1.dist(px, py), arm2.dist(px, py), trunk.dist(px, py)),
    near: (px, py, pad) => arm1.near(px, py, pad) || arm2.near(px, py, pad) || trunk.near(px, py, pad),
  };
  return [
    river(ox + 8, oy - 16, ox + 8, oy + 32, 1.5),
    river(ox + 5, oy - 16, ox + 11, oy + 32, 2),
    river(ox - 16, oy + 7, ox + 32, oy + 10, 2),
    river(ox, oy - 8, ox + 24, oy + 24, 2.5),
    river(ox + 8, oy - 16, ox + 8, oy + 32, 3),
    fork,
  ];
}

test('a river city keeps out of the water, shows a medium building and its pennant, and builds on both banks', () => {
  const T = 16;
  const banner = Object.keys(M.blocks).find((k) => M.blocks[k].role === 'banner');
  const medium = (p) => (role(p) === 'dwelling' && sprite(p).size !== 's') || role(p) === 'hall' || role(p) === 'landmark';
  for (const { id, tech } of ERAS) {
    let both = 0;
    let cases = 0;
    for (const [x, y] of TILES.slice(0, 30)) {
      const ox = x * T;
      const oy = y * T;
      courses(x, y).forEach((r, k) => {
        for (let size = 0; size < 3; size++) {
          const list = SE.layoutCity({ x, y, era: tech, size, tribe: 3, near: r.near, rivers: 0 }, M);
          let loose = 0;
          for (const p of list) {
            const s = sprite(p);
            const b = M.blocks[p.id];
            if (b.role === 'ground' || b.role === 'bridge') continue;
            const left = p.fx - s.ax;
            assert.ok(inBox(p), `${p.id} stays in the city box, footprint on the tile`);
            assert.ok(p.fy >= SE.CITY_FOOT_Y0_RIVER && p.fy <= SE.CITY_FOOT_Y1, `${p.id} foot row ${p.fy}`);
            const foot = r.dist(ox + p.fx + 0.5, oy + p.fy + 0.5);
            assert.ok(foot > SE.CITY_RIVER_CLEARANCE_EDGE, `${id} ${p.id}: foot at least ${SE.CITY_RIVER_CLEARANCE_EDGE} px from the water`);
            let edge = Infinity;
            for (let py = p.fy - b.depth + 1; py <= p.fy; py++) {
              for (let px = left + s.bx0; px <= left + s.bx1; px++) edge = Math.min(edge, r.dist(ox + px + 0.5, oy + py + 0.5));
            }
            assert.ok(edge > 0, `${id} ${p.id}: footprint never in the water`);
            if (foot <= SE.CITY_RIVER_CLEARANCE || edge <= SE.CITY_RIVER_CLEARANCE_EDGE) loose++;
          }
          assert.ok(loose <= 2, `${id}: only the guaranteed house and the pennant take the last resort (${loose})`);
          // A 6 px river right through the middle leaves two 5 px banks: no 7 px house fits there.
          if (k === 4) assert.ok(list.some((p) => BUILDINGS.includes(role(p))), `${id} size ${size}: a house beside a wide river`);
          else assert.ok(list.some(medium), `${id} size ${size} course ${k} at ${x},${y}: a medium building`);
          assert.equal(list.filter((p) => p.id === banner).length, 1, `${id} size ${size} course ${k}: the pennant`);
          if (k === 0 && size > 0) {
            cases++;
            const houses = list.filter((p) => BUILDINGS.includes(role(p)));
            if (houses.some((p) => p.fx < 8) && houses.some((p) => p.fx > 8)) both++;
          }
        }
      });
    }
    assert.ok(both >= cases * 0.85, `${id}: buildings on both banks of a river through the middle: ${both} of ${cases}`);
  }
});

test('the yard leaves the river bank free', () => {
  const atlas = atlasPixels();
  const { w, h } = SE.cityPictureSize(M);
  const x = 50;
  const y = 40;
  const r = river(x * 16 + 8, y * 16 - 16, x * 16 + 8, y * 16 + 32, 2);
  const wet = SE.cityWetMask(x, y, r.near);
  assert.ok(wet.some((v) => v !== 0) && wet.some((v) => v === 0));
  for (const { tech } of ERAS) {
    const yard = layout(x, y, 2, tech, r.near)[0];
    assert.equal(role(yard), 'ground');
    const out = new Uint8Array(w * h * 4);
    SE.composeCity([yard], wet, atlas, out, M);
    const oy = SE.CITY_PAD + M.box.h - 16;
    let kept = 0;
    for (let py = 0; py < 16; py++) {
      for (let px = 0; px < 16; px++) {
        const a = out[((oy + py) * w + SE.CITY_PAD + SIDE + px) * 4 + 3];
        if (wet[py * 16 + px] !== 0) assert.equal(a, 0, `yard pixel ${px},${py} on the bank`);
        else if (a === 255) kept++;
      }
    }
    assert.ok(kept > 40, 'the yard is there beside the river');
  }
});

test('the layout is deterministic and comes from the tile alone', () => {
  for (const { tech } of ERAS) {
    for (const [x, y] of TILES.slice(0, 10)) {
      for (let size = 0; size < 3; size++) {
        const r = river(x * 16 + 3, y * 16 - 16, x * 16 + 12, y * 16 + 32, 2);
        assert.deepEqual(layout(x, y, size, tech, r.near), layout(x, y, size, tech, (a, b, p) => r.near(a, b, p)));
      }
    }
  }
  assert.notEqual(JSON.stringify(layout(40, 40, 2)), JSON.stringify(layout(41, 40, 2)), 'neighbouring tiles look different');
});

test('the pennant shows the tribe colour, and a city without a tribe has none', () => {
  const banner = Object.keys(M.blocks).find((id) => M.blocks[id].role === 'banner');
  for (const { tech } of ERAS) {
    for (let k = 0; k < SE.TRIBE_MAX; k++) {
      for (let size = 0; size < 3; size++) {
        const flags = SE.layoutCity({ x: 30 + k, y: 30, era: tech, size, tribe: k, near: () => false, rivers: 0 }, M).filter((p) => p.id === banner);
        assert.equal(flags.length, 1);
        assert.equal(flags[0].v, k);
      }
    }
  }
  assert.ok(!layout(30, 30, 1, SE.Tech.Stone, () => false, { tribe: -1 }).some((p) => p.id === banner));
});

test('from the Bronze Age a bridge crosses the river where it meets both banks; later eras keep the latest bridge', () => {
  const x = 40;
  const y = 40;
  const ns = river(x * 16 + 10, y * 16 - 16, x * 16 + 10, y * 16 + 32, 1.5);
  const we = river(x * 16 - 16, y * 16 + 6, x * 16 + 32, y * 16 + 6, 1.5);
  const bridges = (tech, rivers, r) => SE.layoutCity({ x, y, era: tech, size: 1, tribe: 0, near: r.near, rivers }, M).filter((p) => role(p) === 'bridge');
  const own = { 2: 'bridge_wood', 3: 'bridge_stone', 4: 'bridge_steel', 5: 'bridge_steel', 6: 'bridge_steel', 7: 'bridge_steel' };
  for (let tech = SE.Tech.Bronze; tech <= SE.Tech.Nanotech; tech++) {
    const [h] = bridges(tech, 4 | 8, ns);
    assert.equal(h.id, own[tech], `era ${tech}`);
    assert.equal(h.v, 0, 'a river from north to south: a horizontal bridge');
    const s = sprite(h);
    const left = h.fx - s.ax;
    assert.ok(left <= 7 && left + s.rect.w - 1 >= 13, 'it spans the water with bank at both ends');
    const [v] = bridges(tech, 1 | 2, we);
    assert.equal(v.v, 1, 'a river from west to east: a vertical bridge');
    const sv = sprite(v);
    assert.ok(v.fy - sv.ay <= 3 && v.fy >= 9, 'it spans the water with bank at both ends');
    assert.deepEqual(bridges(tech, 1 | 8, ns).map((p) => p.v), [0], 'a bend through the middle row is bridged where it crosses');
    for (const [k, r] of courses(x, y).entries()) {
      for (const p of bridges(tech, 0, r)) {
        const sp = sprite(p);
        const l = p.fx - sp.ax;
        const t = p.fy - sp.ay;
        const ends = p.v === 0 ? [[l, 8], [l + sp.rect.w - 1, 8]] : [[8, t], [8, t + sp.rect.h - 1]];
        for (const [px, py] of ends) assert.ok(r.dist(x * 16 + px + 0.5, y * 16 + py + 0.5) > 0, `course ${k}: the bridge ends on land`);
      }
    }
  }
  assert.deepEqual(bridges(SE.Tech.Stone, 4 | 8, ns), [], 'no bridge in the Stone Age');
  assert.deepEqual(SE.layoutCity({ x, y, era: SE.Tech.Iron, size: 1, tribe: 0, near: () => false, rivers: 4 | 8 }, M).filter((p) => role(p) === 'bridge'), [], 'no bridge without water');
});

test('settler, raft to freighter, placeholder and marker art keep the art format in every tribe colour', () => {
  for (let k = -1; k < SE.TRIBE_MAX; k++) {
    const flag = SE.tribeArtColor(k);
    for (let t = SE.Tech.Stone; t <= SE.Tech.Nanotech; t++) {
      for (const kind of ['land', 'water', 'bundle']) {
        const art = SE.settlerArt(kind, flag, t);
        assert.deepEqual(artProblems(SE, art, `${kind}/${t}/${flag}`), []);
        assert.ok(art.some((s) => s.f === flag), `${kind}/${t}: the pennant carries the tribe colour`);
      }
    }
    assert.deepEqual(artProblems(SE, SE.cityMarkerArt(flag), `marker/${flag}`), []);
  }
  const looks = (kind) => new Set([2, 3, 4, 5, 7].map((t) => JSON.stringify(SE.settlerArt(kind, 'red', t)))).size;
  assert.equal(looks('land'), 5, 'donkey, ox cart, wagon, truck and glider differ');
  assert.equal(new Set([1, 2, 3, 4, 5].map((t) => JSON.stringify(SE.settlerArt('water', 'red', t)))).size, 5, 'raft, dugout, sail, steam and freighter differ');
});

test('the hover label names city, people, size and era', () => {
  const w = new SE.WorldState();
  w.reset(4, SE.OCEAN_FRACTION);
  const i = SE.idx(20, 30);
  assert.equal(SE.cityLabel(w, i), null, 'no city, no label');
  w.tech[i] = SE.Tech.Stone;
  w.cityPop[i] = 0.1;
  assert.equal(SE.cityLabel(w, i), 'Dorf, Steinzeit', 'a city without records still says what it is');
  w.civ.tribes.push({ id: 1, color: 2, name: 'Arkani', parent: -1, capital: 2, founded: 0, landShort: false });
  w.civ.addCity({ id: 2, tile: i, tribe: 1, name: 'Teluma', founded: 0, capacity: 1, scarcity: 0, settleAfter: 0, immuneUntil: 0 });
  assert.equal(SE.cityLabel(w, i), 'Teluma · Arkani · Dorf, Steinzeit');
  assert.equal(SE.cityTribeColor(w, i), 2);
});
