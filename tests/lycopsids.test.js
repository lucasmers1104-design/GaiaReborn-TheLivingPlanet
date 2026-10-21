'use strict';
/*
 * The giant clubmosses (src/lycopsids.ts): their spores reach wetlands far
 * from any clubmoss; conifers and broadleaf trees outgrow them except in a
 * wetland, their niche, while seed ferns and cycads do not; once those
 * forests lead a tenth of the land the giants are gone for good. The group
 * survives, herbaceous: no longer woody, low, and not drawn on the map.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE, makeSim } = require('./helpers');

const SE = loadSE();
const F = SE.Flora;

/**
 * A warm planet of land without relief: the north half a wetland (unless
 * `wetNorth` is false), the south half a river plain that suits clubmosses
 * less and is no wetland. Every tile carries `groups`; the climate never
 * steps, only the plants.
 */
function plain(groups, wetNorth = true) {
  const s = makeSim(11);
  const w = s.world;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    const north = wetNorth && Math.floor(i / SE.GRID_W) < SE.GRID_H / 2;
    w.elevation[i] = north ? 0.05 : 0.2;
    w.temperature[i] = 22;
    w.moisture[i] = north ? 0.85 : 0.65;
    w.riverLevel[i] = north ? 0 : 0.3;
    w.riparian[i] = 0;
    w.flora[i] = groups;
    w.vegetation[i] = groups ? 0.5 : 0;
    w.floraTop[i] = 0;
    w.lifeDensity.fill(0, i * SE.LIFE_COUNT, (i + 1) * SE.LIFE_COUNT);
  }
  w.co2 = 400;
  s.flora.prepare(w, s.params, true);
  return s;
}

const tile = (x, y) => y * SE.GRID_W + x;

test('conifers and broadleaf trees outgrow the clubmosses except in a wetland; seed ferns do not', () => {
  const s = plain(0);
  const { world: w, flora } = s;
  const bit = (g) => 1 << g;
  const wet = tile(20, 10);
  const dry = tile(20, SE.GRID_H - 10);
  assert.ok(SE.FloraSystem.isWetland(w, wet) && !SE.FloraSystem.isWetland(w, dry));

  w.flora[wet] = w.flora[dry] = bit(F.Clubmosses);
  const alone = [flora.suit(w, F.Clubmosses, wet), flora.suit(w, F.Clubmosses, dry)];
  assert.ok(alone[0] > 0.5 && alone[1] > 0.15, `clubmosses grow on both: ${alone}`);

  w.flora[wet] = w.flora[dry] = bit(F.Clubmosses) | bit(F.SeedPlants);
  assert.equal(flora.suit(w, F.Clubmosses, dry), alone[1], 'seed ferns and cycads shared the coal swamps');

  // Plenty of clubmosses elsewhere on the planet: no refuge on the river plain.
  w.floraCounts[F.Clubmosses] = 1000;
  for (const rival of [F.Conifers, F.Broadleaf]) {
    w.flora[wet] = w.flora[dry] = bit(F.Clubmosses) | bit(rival);
    assert.ok(flora.suit(w, F.Clubmosses, dry) < 0.04, `${SE.FLORA[rival].id} drives them off the plain`);
    assert.ok(flora.suit(w, F.Clubmosses, wet) >= 0.15, `${SE.FLORA[rival].id} leaves them their wet niche`);
    assert.equal(flora.problem(w, F.Clubmosses, dry), 'Nadel- und Laubbäume verdrängen dort die Bärlappe');
    assert.equal(flora.problem(w, F.Clubmosses, wet), null);
  }
  w.floraCounts[F.Clubmosses] = SE.CLUBMOSS_REFUGE_TILES - 1;
  assert.ok(flora.suit(w, F.Clubmosses, dry) >= 0.15, 'the last few hold the river bank');
});

test('where conifers arrive the clubmosses retreat into the wetlands and stop leading, but never die out', () => {
  const s = plain((1 << F.Clubmosses) | (1 << F.Conifers));
  const { world: w, flora, params } = s;
  for (let t = 0; t < 150; t++) {
    flora.step(w, params);
    w.refreshDerived();
    w.ticks++;
  }
  let north = 0;
  let south = 0;
  let led = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    if ((w.flora[i] & (1 << F.Clubmosses)) === 0) continue;
    if (Math.floor(i / SE.GRID_W) < SE.GRID_H / 2) north++;
    else south++;
    if (w.floraTop[i] === F.Clubmosses) led++;
  }
  const half = SE.TILE_COUNT / 2;
  assert.ok(north > half * 0.95, `they hold the wetland: ${north} of ${half}`);
  assert.ok(south < half * 0.01, `they lose the plain: ${south} of ${half} left`);
  assert.equal(led, 0, 'conifers lead every tile');
  assert.ok(w.lycopsidsGone, 'conifer forests on the whole planet end the giants');
});

test('their rivals never finish them off: the last clubmosses hold out on river banks', () => {
  const s = plain((1 << F.Clubmosses) | (1 << F.Conifers), false);
  const { world: w, flora, params } = s;
  let least = Infinity;
  for (let t = 0; t < 400; t++) {
    flora.step(w, params);
    w.refreshDerived();
    w.ticks++;
    if (t > 100) least = Math.min(least, w.floraCounts[F.Clubmosses]);
  }
  assert.ok(least > 0, 'never extinct');
  assert.ok(w.floraCounts[F.Clubmosses] < 10 * SE.CLUBMOSS_REFUGE_TILES, `only a remnant: ${w.floraCounts[F.Clubmosses]}`);
});

test('spores carry clubmosses to wetlands far away while the giants live', () => {
  const s = plain(0);
  const { world: w, flora, params } = s;
  const club = 1 << F.Clubmosses;
  const home = tile(5, 5);
  w.flora[home] = club;
  w.vegetation[home] = 0.5;
  const far = (i) => {
    const dx = Math.abs((i % SE.GRID_W) - 5);
    return Math.min(dx, SE.GRID_W - dx) > 40 || Math.floor(i / SE.GRID_W) > 45;
  };
  const count = () => {
    let n = 0;
    for (let i = 0; i < SE.TILE_COUNT; i++) if ((w.flora[i] & club) && far(i)) n++;
    return n;
  };
  for (let t = 0; t < 20; t++) { flora.step(w, params); w.ticks++; }
  assert.ok(count() > 20, `clubmosses took root far from home: ${count()}`);

  // Once the giants are gone the small clubmosses spread only from tile to tile.
  const t2 = plain(0);
  t2.world.flora[home] = club;
  t2.world.vegetation[home] = 0.5;
  t2.world.lycopsidsGone = true;
  for (let t = 0; t < 20; t++) { t2.flora.step(t2.world, t2.params); t2.world.ticks++; }
  let farAfter = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) if ((t2.world.flora[i] & club) && far(i)) farAfter++;
  assert.equal(farAfter, 0);
});

test('the giants end for good once conifer and broadleaf forests lead a tenth of the land', () => {
  const s = plain(0);
  const w = s.world;
  const rivals = (1 << F.Conifers) | (1 << F.Broadleaf);
  const lead = (share) => {
    const n = Math.round(SE.TILE_COUNT * share);
    for (let i = 0; i < SE.TILE_COUNT; i++) w.floraTop[i] = i < n ? (i % 2 ? F.Conifers : F.Broadleaf) : F.Clubmosses;
  };
  lead(0.5);
  SE.updateFloraEras(w, 1 << F.Clubmosses);
  assert.equal(w.lycopsidsGone, false, 'no rivals on the planet, no end');
  lead(0.09);
  SE.updateFloraEras(w, rivals);
  assert.equal(w.lycopsidsGone, false, '9 % of the land is not enough');
  lead(0.11);
  SE.updateFloraEras(w, rivals);
  assert.equal(w.lycopsidsGone, true);
  lead(0);
  SE.updateFloraEras(w, rivals);
  assert.equal(w.lycopsidsGone, true, 'they do not come back when the forests do not');

  const notes = SE.lycopsidMilestones(w);
  assert.equal(notes.length, 1);
  w.evo.chronicle.push(notes[0]);
  assert.equal(SE.lycopsidMilestones(w).length, 0, 'the chronicle says it once');
});

test('after the giants the clubmosses are low herbs that make no swamp forest and are not drawn', () => {
  const s = plain(0);
  const w = s.world;
  const L = SE.Landscape;
  const club = 1 << F.Clubmosses;
  const z = SE.landscapeZone(22, 0.85, 0.05, 0.7, SE.ZONE_NONE);
  assert.ok(z & SE.ZONE_WETLAND);
  const target = () => {
    const lad = [0, 0, 0, 0, 0];
    return SE.ladderTarget(SE.fillLadder(z, club, true, lad, SE.woodyFloraMask(w)), lad);
  };

  const i = tile(30, 10);
  w.flora[i] = club;
  w.landscape[i] = L.Swampforest;
  const field = new SE.TerrainField();
  field.refresh(w);
  assert.equal(target(), L.Swampforest, 'giant clubmosses make swamp forest');
  assert.equal(SE.floraStature(w, F.Clubmosses), SE.FLORA[F.Clubmosses].stature);
  assert.ok(field.groups[i] & club, 'the map draws Schuppenbäume');

  w.lycopsidsGone = true;
  field.refresh(w);
  assert.equal(target(), L.Marsh, 'small clubmosses make a marsh');
  assert.ok(SE.floraStature(w, F.Clubmosses) < 0.3);
  assert.equal(field.groups[i] & club, 0, 'the map draws none');
  assert.ok(w.flora[i] & club, 'the group still lives there (the Examine window lists it)');

  const objects = Object.entries(SE.TERRAIN_MANIFEST.groups).filter(([, g]) => g.objects.some((o) => o.id === 'lepidodendron'));
  assert.deepEqual(objects.map(([id]) => id), ['clubmosses'], 'only the clubmosses draw Schuppenbäume');
});
