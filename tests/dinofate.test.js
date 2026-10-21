'use strict';
/*
 * The dinosaurs' era (src/dinoera.ts) and its end (src/comet.ts): what the
 * era bars for the tree, for nature and for every placement; the birds'
 * descent from living bird precursors; the question and both lasting
 * answers; the comet's crater beside an unchanged meteor's; the strike's
 * losses and refuges; the bars falling and the dinosaurs never returning;
 * and the era through save, load and the migration from format 8.
 * The planets are made lush by hand so each test runs in seconds.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE, makeSim, hash } = require('./helpers');

const SE = loadSE();
const L = SE.LIFE_COUNT;
const SEA = [SE.Life.Prokaryote, SE.Life.Eukaryote, SE.Life.Fish, SE.Life.Arthropod];
const LAND = [SE.Life.Insect, SE.Life.LandArthropod, SE.Life.Mammal, SE.Life.Dinosaur, SE.Life.Reptile, SE.Life.Amphibian];

function develop(w, id) {
  for (let p = id; p && !w.evo.developed.has(p); p = SE.evoNode(p).parent) w.evo.developed.set(p, { tick: 0, years: 0 });
}

/** A planet in full bloom after a few ticks: plants on every land tile, sea and land animals everywhere they fit. */
function lush(seed = 4242) {
  const s = makeSim(seed);
  const w = s.world;
  w.o2 = 21;
  w.oceanO2 = 100;
  w.oceanIron = 0;
  const plants = [SE.Flora.Ferns, SE.Flora.SeedPlants, SE.Flora.Conifers, SE.Flora.Flowering, SE.Flora.Grasses, SE.Flora.Mosses]
    .reduce((m, g) => m | (1 << g), 0);
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    const sea = w.isWater(i);
    w.flora[i] |= sea ? 1 << SE.Flora.MarineAlgae : plants;
    w.vegetation[i] = sea ? 0.3 : 0.7;
    for (const c of sea ? SEA : LAND) w.lifeDensity[i * L + c] = 0.3;
  }
  ['mammals', 'dinosaurs', 'insects', 'landArthropods', 'fish', 'arthropods', 'marineAlgae', 'grasses', 'flowering', 'conifers', 'mosses']
    .forEach((id) => develop(w, id));
  SE.BiomeSystem.step(w, false);
  w.refreshDerived();
  for (let t = 0; t < 30; t++) s.life.stepLife(w, s.params, s.atmo);
  w.refreshDerived();
  w.evo.ep = SE.EP_MAX;
  s.evo.refresh(w, s.params, true);
  return s;
}

/** Turn `n` scattered dinosaur populations into bird precursors; returns their tiles. */
function precursors(s, n = 60) {
  const w = s.world;
  const out = [];
  for (let k = 0; k < SE.TILE_COUNT && out.length < n; k++) {
    const i = (k * 7919) % SE.TILE_COUNT;
    if (w.lifeDensity[i * L + SE.Life.Dinosaur] > SE.LifeSystem.MIN_DENSITY) {
      w.lifeStage[i * L + SE.Life.Dinosaur] = SE.SUBSPECIES_PER_CLASS - 1;
      out.push(i);
    }
  }
  w.refreshDerived();
  s.evo.refresh(w, s.params, true);
  return out;
}

/** A lush planet whose first birds have just put the question. */
function deciding(seed = 4242) {
  const s = lush(seed);
  precursors(s);
  const r = s.evo.develop(s.world, s.params, 'birds');
  assert.ok(r.ok, r.reason);
  return s;
}

function topStage(w, c) {
  let top = -1;
  for (let i = 0; i < SE.TILE_COUNT; i++) if (w.lifeDensity[i * L + c] > 0) top = Math.max(top, w.lifeStage[i * L + c]);
  return top;
}

function scars(w, kind) {
  const out = [];
  for (let i = 0; i < SE.TILE_COUNT; i++) if (w.hazards.scar[i] === kind) out.push(i);
  return out;
}

/** A land tile at mid latitude whose 2 × 2 block and surroundings are land. */
function inland(w) {
  for (let y = 40; y < SE.GRID_H - 40; y++) {
    for (let x = 0; x < SE.GRID_W; x++) {
      let ok = true;
      for (let dy = -6; dy <= 7 && ok; dy++) for (let dx = -6; dx <= 7 && ok; dx++) ok = !w.isWater(SE.idx(SE.wrapX(x + dx), y + dy));
      if (ok) return { x, y };
    }
  }
  throw new Error('no inland site on this planet');
}

test('until the comet, mammals climb no higher than the marsupials', () => {
  const s = lush();
  const w = s.world;
  s.params.bio.mutationRate = 1;
  for (let i = 0; i < SE.TILE_COUNT; i++) if (w.lifeDensity[i * L + SE.Life.Mammal] > 0) w.lifeStage[i * L + SE.Life.Mammal] = SE.MAMMAL_STAGE_BEFORE_COMET;
  w.refreshDerived();
  assert.equal(SE.stageCap(w, SE.Life.Mammal), SE.MAMMAL_STAGE_BEFORE_COMET);
  assert.equal(SE.subspeciesName(SE.Life.Mammal, SE.MAMMAL_STAGE_BEFORE_COMET), 'Beuteltiere');
  for (let t = 0; t < 150; t++) s.life.stepLife(w, s.params, s.atmo);
  assert.equal(topStage(w, SE.Life.Mammal), SE.MAMMAL_STAGE_BEFORE_COMET, 'no later mammal arises before the comet');
  assert.equal(SE.stageCap(w, SE.Life.Reptile), SE.SUBSPECIES_PER_CLASS - 1, 'other classes are not held');

  // The same planet once the comet has struck: the next mammals follow.
  w.dinoEra.fate = 'extinct';
  for (let t = 0; t < 150 && topStage(w, SE.Life.Mammal) <= SE.MAMMAL_STAGE_BEFORE_COMET; t++) s.life.stepLife(w, s.params, s.atmo);
  assert.ok(topStage(w, SE.Life.Mammal) > SE.MAMMAL_STAGE_BEFORE_COMET, 'later mammals arise after the comet');
});

test('whales and grazers stay barred for the tree, for nature and for every placement', () => {
  const s = lush();
  const w = s.world;
  const sea = (() => { for (let i = 0; i < SE.TILE_COUNT; i++) if (w.isWater(i)) return i; return -1; })();
  const ground = inland(w);
  for (const id of ['whales', 'grazers']) {
    const st = s.evo.statusOf(id);
    const era = st.conds.find((c) => c.kind === 'era');
    assert.ok(era && !era.met, `${id}: the tree names the rule`);
    assert.match(era.label, /Spielregel/);
    assert.notEqual(st.state, 'available');
    assert.equal(SE.EvolutionSystem.isReady(st), false, `${id}: nature does not take the step either`);
    const r = s.evo.develop(w, s.params, id);
    assert.equal(r.ok, false);
    assert.match(r.reason, /Komet/);
    assert.equal(s.evo.develop(w, s.params, id, 'spontaneous').ok, false);
  }
  // Nature's own steps, however long they have waited.
  w.evo.readySince.set('whales', -100000);
  w.evo.readySince.set('grazers', -100000);
  for (let k = 0; k < 20; k++) s.evo.spontaneous(w, s.params, () => 0);
  assert.equal(w.evo.isDeveloped('whales') || w.evo.isDeveloped('grazers'), false);
  // Every placement goes through LifeSystem.seed.
  assert.equal(SE.LifeSystem.seed(w, SE.Life.Cetacean, sea % SE.GRID_W, Math.floor(sea / SE.GRID_W)), false);
  assert.equal(SE.LifeSystem.seed(w, SE.Life.Grazer, ground.x, ground.y), false);
  assert.ok(SE.dinoEraLifeBar(w, SE.Life.Grazer));

  w.dinoEra.fate = 'kept';
  assert.match(SE.dinoEraStepBar(w, 'whales'), /überlebt/);
  assert.equal(SE.LifeSystem.seed(w, SE.Life.Grazer, ground.x, ground.y), false);

  w.dinoEra.fate = 'extinct';
  s.evo.refresh(w, s.params, true);
  assert.equal(s.evo.statusOf('whales').conds.some((c) => c.kind === 'era'), false);
  assert.equal(SE.dinoEraLifeBar(w, SE.Life.Grazer), '');
  assert.ok(SE.LifeSystem.seed(w, SE.Life.Grazer, ground.x, ground.y), 'reachable after the comet');
});

test('birds arise only beside living bird precursors', () => {
  const s = lush();
  const w = s.world;
  assert.equal(SE.subspeciesName(SE.Life.Dinosaur, SE.SUBSPECIES_PER_CLASS - 1), 'Vogelvorläufer');
  const lineage = () => s.evo.statusOf('birds').conds.find((c) => c.kind === 'lineage');
  assert.ok(w.lifeCounts[SE.Life.Dinosaur] > 0);
  assert.equal(lineage().met, false, 'dinosaurs alone are not enough');
  assert.match(lineage().detail, /Vogelvorläufer/);
  assert.equal(s.evo.foundingSites(w, s.params, SE.evoNode('birds'), 60).length, 0);
  assert.equal(s.evo.develop(w, s.params, 'birds').ok, false);
  // A discovery in the lexicon is history, not a population.
  const dex = new SE.FaunaDex();
  dex.adoptLiving(w);
  assert.equal(lineage().met, false);

  const sites = new Set(precursors(s));
  assert.equal(lineage().met, true);
  const dinos = w.lifeCounts[SE.Life.Dinosaur];
  assert.ok(s.evo.develop(w, s.params, 'birds').ok);
  const near = (i, r) => {
    const x = i % SE.GRID_W;
    const y = Math.floor(i / SE.GRID_W);
    for (const j of sites) if (SE.hazardDistance(x, y, j % SE.GRID_W, Math.floor(j / SE.GRID_W)) <= r) return true;
    return false;
  };
  // The spawn point lies beside the precursors; its founders spread to the spawn point's neighbours.
  const centre = w.evo.chronicle.find((e) => e.key === 'evo:birds').at;
  assert.ok(near(centre, 1), 'the birds are founded beside a bird precursor');
  let founded = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    if (w.lifeDensity[i * L + SE.Life.Avian] <= 0) continue;
    founded++;
    assert.ok(near(i, 2), `bird founder on tile ${i} lies at the precursors' spawn point`);
  }
  assert.ok(founded > 0);
  assert.equal(w.lifeCounts[SE.Life.Dinosaur], dinos, 'the dinosaurs live on beside the first birds');
});

test('the first birds ask once, and each answer holds for good', () => {
  const s = deciding();
  const w = s.world;
  assert.equal(w.dinoEra.fate, 'deciding');
  assert.ok(SE.dinoEraHoldsTime(w), 'time waits for the answer');
  assert.equal(SE.chooseDinoFate(w, s.evo, 'survive'), true);
  assert.equal(w.dinoEra.fate, 'kept');
  assert.equal(SE.dinoEraHoldsTime(w), false);
  assert.equal(SE.chooseDinoFate(w, s.evo, 'comet'), false, 'there is no second question');
  assert.equal(w.dinoEra.fate, 'kept');
  assert.ok(w.evo.chronicle.some((e) => e.key === 'dinofate:kept'));
  assert.equal(SE.stageCap(w, SE.Life.Mammal), SE.MAMMAL_STAGE_BEFORE_COMET);
  // Killing the birds and bringing them back asks nothing either.
  SE.dinoEraOnDeveloped(w, 'birds');
  assert.equal(w.dinoEra.fate, 'kept');

  const b = deciding();
  assert.equal(SE.chooseDinoFate(b.world, b.evo, 'comet'), true);
  assert.equal(b.world.dinoEra.fate, 'impactPending');
  assert.ok(SE.dinoEraHoldsTime(b.world), 'and waits for the strike');
  const t = b.world.dinoEra.target;
  const x = t % SE.GRID_W;
  const y = Math.floor(t / SE.GRID_W);
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) assert.ok(!b.world.isWater(SE.idx(SE.wrapX(x + dx), y + dy)), 'the crater lies on land');
  assert.equal(SE.cometSite(b.world), t, 'the site is deterministic');
  assert.equal(SE.cometSite(deciding().world), t, 'the same planet, the same site');
});

test("a comet's crater covers four times a meteor's, and the meteor's is unchanged", () => {
  const s = lush();
  const w = s.world;
  const hz = new SE.HazardSystem();
  const at = inland(w);
  // A meteor's rings are the impact rings they always were.
  const plain = { id: 7, kind: SE.EventKind.Meteor, x: at.x, y: at.y };
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) assert.equal(SE.meteorRing(w, plain, dx, dy), SE.impactRing(w, plain, dx, dy));
  const e0 = w.elevation[SE.idx(at.x, at.y)];
  assert.ok(hz.start(w, SE.EventKind.Meteor, at.x, at.y, 'player'));
  const meteor = scars(w, SE.ScarKind.Crater);
  assert.deepEqual(meteor, [SE.idx(at.x, at.y)], "a meteor's crater is its one tile");
  const meteorDrop = e0 - w.elevation[SE.idx(at.x, at.y)];
  assert.ok(Math.abs(meteorDrop - SE.METEOR_CRATER_DEPTH) < 1e-6 || w.elevation[SE.idx(at.x, at.y)] >= SE.METEOR_CRATER_FLOOR - 1e-6);
  const meteorBlast = scars(w, SE.ScarKind.Scorched).length;

  const c = lush();
  const cw = c.world;
  assert.ok(new SE.HazardSystem().start(cw, SE.EventKind.Meteor, at.x, at.y, 'player', SE.COMET_STRENGTH));
  const comet = scars(cw, SE.ScarKind.Crater).sort((a, b) => a - b);
  const block = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dy]) => SE.idx(SE.wrapX(at.x + dx), at.y + dy)).sort((a, b) => a - b);
  assert.deepEqual(comet, block, 'one crater of 2 × 2 tiles: four times the area, twice the diameter');
  const cometBlast = scars(cw, SE.ScarKind.Scorched).length;
  assert.ok(cometBlast >= 3 * meteorBlast && cometBlast <= 6 * meteorBlast, `blast ${cometBlast} tiles against a meteor's ${meteorBlast}`);
});

test('the comet ends every dinosaur, costs the others most of their stock, but no group', () => {
  const s = deciding();
  const w = s.world;
  const groups = [];
  for (let c = 1; c < L; c++) if (w.lifeCounts[c] > 0) groups.push(c);
  const kinds = [];
  for (const c of groups) for (let st = 0; st < SE.SUBSPECIES_PER_CLASS; st++) if (c !== SE.Life.Dinosaur && w.lifeStageCounts[c * SE.SUBSPECIES_PER_CLASS + st] > 0) kinds.push([c, st]);
  const tilesBefore = Array.from(w.lifeCounts);
  const absent = [];
  for (let c = 1; c < L; c++) if (w.lifeCounts[c] === 0) absent.push(c);
  const plants = [];
  for (let g = 1; g < SE.FLORA_COUNT; g++) if (w.floraCounts[g] > 0) plants.push(g);
  const bio = Array.from(w.lifeBiomass);
  SE.chooseDinoFate(w, s.evo, 'comet');
  const h = SE.applyComet(w, s.params, s.life, s.hazards, s.evo);
  assert.ok(h, 'the comet strikes');
  assert.equal(h.strength, SE.COMET_STRENGTH);
  assert.equal(w.dinoEra.fate, 'extinct');
  assert.equal(w.lifeCounts[SE.Life.Dinosaur], 0, 'no dinosaur of any sub-species is left');
  for (let i = 0; i < SE.TILE_COUNT; i++) assert.equal(w.lifeDensity[i * L + SE.Life.Dinosaur], 0);
  let before = 0;
  let after = 0;
  for (const c of groups) {
    if (c === SE.Life.Dinosaur) continue;
    assert.ok(w.lifeCounts[c] > 0, `${SE.LIFE[c].id} survive as a group`);
    const loss = 1 - w.lifeBiomass[c] / bio[c];
    if (tilesBefore[c] >= 100) assert.ok(loss > 0.5, `${SE.LIFE[c].id} lose most of their stock (${loss.toFixed(2)})`);
    let refuge = 0;
    for (let i = 0; i < SE.TILE_COUNT; i++) if (w.lifeDensity[i * L + c] >= SE.LifeSystem.MIN_DENSITY * 2 - 1e-6) refuge++;
    assert.ok(refuge > 0, `${SE.LIFE[c].id} keep a viable refuge`);
    before += bio[c];
    after += w.lifeBiomass[c];
  }
  const loss = 1 - after / before;
  assert.ok(loss > 0.7 && loss < 0.9, `the stock falls by about ${SE.COMET_LOSS * 100} % (${(loss * 100).toFixed(0)} %)`);
  for (const c of absent) assert.equal(w.lifeCounts[c], 0, `${SE.LIFE[c].id} do not appear from nowhere`);
  for (const [c, st] of kinds) assert.ok(w.lifeStageCounts[c * SE.SUBSPECIES_PER_CLASS + st] > 0, `${SE.LIFE[c].id} keep sub-species ${st + 1}`);
  assert.equal(w.dinoEra.refuges.length, kinds.length, 'one sheltered population per sub-species');
  assert.ok(w.dinoEra.refuges.every((r) => r.c !== SE.Life.Dinosaur));
  for (const g of plants) assert.ok(w.floraCounts[g] > 0, `${SE.FLORA[g].id} survive`);
  assert.ok(w.evo.chronicle.some((e) => e.key === 'comet:impact'));
  assert.ok(w.evo.chronicle.some((e) => e.key === 'extinct:dinosaurs:comet'));

  // Once only, whatever calls it again.
  const life = hash(w.lifeDensity);
  const ground = hash(w.elevation);
  assert.equal(SE.applyComet(w, s.params, s.life, s.hazards, s.evo), null);
  assert.equal(hash(w.lifeDensity), life);
  assert.equal(hash(w.elevation), ground);
});

test('the sheltered populations outlast the winter, and only that long', () => {
  const s = deciding();
  const w = s.world;
  const groups = [];
  for (let c = 1; c < L; c++) if (w.lifeCounts[c] > 0 && c !== SE.Life.Dinosaur) groups.push(c);
  s.resolveDinoFate('comet');
  const sheltered = w.dinoEra.refuges.length;
  assert.ok(sheltered > 0);
  // However hard the times, no group is lost while its shelter holds.
  for (let t = 0; t < SE.COMET_REFUGE_MIN_TICKS; t++) {
    s.life.stepLife(w, s.params, s.atmo);
    w.ticks++;
  }
  for (const c of groups) assert.ok(w.lifeCounts[c] > 0, `${SE.LIFE[c].id} outlast the winter`);
  for (const r of w.dinoEra.refuges) assert.ok(w.lifeDensity[r.tile * L + r.c] >= SE.COMET_REFUGE_DENSITY - 1e-6);
  // A shelter is no immortality: it ends at the latest after COMET_REFUGE_TICKS.
  w.ticks += SE.COMET_REFUGE_TICKS;
  s.life.stepLife(w, s.params, s.atmo);
  assert.equal(w.dinoEra.refuges.length, 0);
});

test("the comet's winter freezes two thirds of the planet for a while, and the plants beneath outlast it", () => {
  const s = deciding();
  const w = s.world;
  s.resolveDinoFate('comet');
  assert.equal(w.dinoEra.struck, w.ticks);
  const frozenAtHeight = [];
  for (let i = 0; i < SE.TILE_COUNT; i++) if (SE.cometIceAt(w, i, SE.COMET_ICE_SHARE)) frozenAtHeight.push(i);
  const share = frozenAtHeight.length / SE.TILE_COUNT;
  assert.ok(share > 0.6 && share < 0.75, `two thirds of the planet freeze (${(share * 100).toFixed(0)} %)`);
  // Tiles are counted, not followed one by one: the plates may shift the crust meanwhile.
  const underIce = (share) => {
    const out = [];
    for (let i = 0; i < SE.TILE_COUNT; i++) if (!w.isWater(i) && SE.cometIceAt(w, i, share)) out.push(i);
    return out;
  };
  const groupTiles = (tiles) => Array.from({ length: SE.FLORA_COUNT }, (_, g) => tiles.filter((i) => w.flora[i] & (1 << g)).length);
  const before = groupTiles(underIce(SE.COMET_ICE_SHARE));

  while (w.ticks - w.dinoEra.struck < SE.COMET_ICE_GROW + SE.COMET_ICE_HOLD - 1) s.tick();
  assert.equal(SE.cometIceShare(w), SE.COMET_ICE_SHARE);
  const land = underIce(SE.COMET_ICE_SHARE);
  const iced = land.filter((i) => w.landscape[i] === SE.Landscape.Ice).length;
  assert.ok(iced >= land.length * 0.95, `the land under it is ice (${iced} of ${land.length})`);
  groupTiles(land).forEach((n, g) => {
    if (before[g] > 0) assert.ok(n >= before[g] * 0.97, `${SE.FLORA[g].id} hold on under the ice (${before[g]} → ${n} tiles)`);
  });
  for (const i of land) if (w.flora[i]) assert.ok(w.vegetation[i] <= SE.COMET_ICE_COVER + 1e-6, 'at a trace of cover');
  const plants = land.filter((i) => w.flora[i] !== 0);
  // Reloaded mid-winter, the winter goes on.
  const io = (x, fauna) => ({ world: x.world, params: x.params, geo: x.geo, history: x.history, fauna });
  const doc = JSON.parse(JSON.stringify(SE.SaveSystem.serialize(io(s))));
  const b = makeSim(1);
  SE.SaveSystem.load(doc, io(b, new SE.FaunaDex()), b.life, b.flora);
  assert.equal(b.world.dinoEra.struck, w.dinoEra.struck);
  assert.equal(SE.cometIceShare(b.world), SE.COMET_ICE_SHARE);

  while (w.ticks - w.dinoEra.struck < SE.COMET_ICE_GROW + SE.COMET_ICE_HOLD + SE.COMET_ICE_MELT) s.tick();
  assert.equal(SE.cometIceShare(w), 0, 'the ice draws back');
  assert.ok(!frozenAtHeight.some((i) => SE.cometIceAt(w, i)));
  const cover = () => plants.reduce((sum, i) => sum + w.vegetation[i], 0) / plants.length;
  const thawed = cover();
  for (let t = 0; t < 20; t++) s.tick();
  assert.ok(cover() > thawed && cover() > SE.COMET_ICE_COVER * 4, `the plants grow back (${thawed.toFixed(3)} → ${cover().toFixed(3)})`);
});

test('the comet ends the pterosaurs, ammonites, belemnites and toothed birds for good, and their groups climb past them', () => {
  const s = deciding();
  const w = s.world;
  const R = SE.Life.Reptile;
  const M = SE.Life.Mollusc;
  const N = SE.SUBSPECIES_PER_CLASS;
  const lost = [[R, 4], [M, 4], [M, 5], [SE.Life.Avian, 2]];
  assert.deepEqual(lost.map(([c, st]) => SE.subspeciesName(c, st)), ['Flugsaurier', 'Ammoniten', 'Belemniten', 'Zahnvögel']);
  assert.ok(!lost.some(([c, st]) => SE.cometLost(w, c, st)), 'nothing is lost before the strike');
  // Reptiles on every rung up to the pterosaurs; molluscs only on the two lost rungs.
  const reptiles = [];
  for (let i = 0; i < SE.TILE_COUNT; i++) if (w.lifeDensity[i * L + R] > 0) reptiles.push(i);
  reptiles.forEach((i, k) => { w.lifeStage[i * L + R] = k % 5; });
  let molluscs = 0;
  for (let i = 0; i < SE.TILE_COUNT && molluscs < 200; i++) {
    if (!w.isWater(i)) continue;
    w.lifeDensity[i * L + M] = 0.3;
    w.lifeStage[i * L + M] = 4 + (molluscs++ % 2);
  }
  w.refreshDerived();

  s.resolveDinoFate('comet');
  for (const [c, st] of lost) {
    assert.ok(SE.cometLost(w, c, st));
    assert.equal(w.lifeStageCounts[c * N + st], 0, `no ${SE.subspeciesName(c, st)} are left`);
  }
  assert.ok(!SE.cometLost(w, R, 3) && w.lifeStageCounts[R * N + 3] > 0, 'the turtles live on');
  assert.ok(w.lifeCounts[M] > 0 && w.lifeStageCounts[M * N + 3] > 0, 'a group that lived only on lost rungs keeps them one rung down');
  assert.ok(!w.dinoEra.refuges.some((r) => SE.cometLost(w, r.c, r.stage)), 'nothing lost is sheltered');
  assert.match(SE.faunaOriginRule(w, s.params, new SE.FaunaDex(), R, 4, true), /für immer ausgestorben/);

  // The turtles climb straight to the crocodiles.
  s.params.bio.mutationRate = 1;
  for (let t = 0; t < 300 && w.lifeStageCounts[R * N + 5] === 0; t++) {
    s.life.stepLife(w, s.params, s.atmo);
    w.ticks++;
    assert.equal(w.lifeStageCounts[R * N + 4], 0, 'no pterosaur arises again');
  }
  assert.ok(w.lifeStageCounts[R * N + 5] > 0, 'reptiles reach the crocodiles past the lost rung');

  // A struck planet saved before this rule loses them on loading.
  const i = reptiles[0];
  w.lifeDensity[i * L + R] = 0.3;
  w.lifeStage[i * L + R] = 4;
  const io = (x, fauna) => ({ world: x.world, params: x.params, geo: x.geo, history: x.history, fauna });
  const doc = JSON.parse(JSON.stringify(SE.SaveSystem.serialize(io(s))));
  const b = makeSim(1);
  SE.SaveSystem.load(doc, io(b, new SE.FaunaDex()), b.life, b.flora);
  assert.equal(b.world.lifeStageCounts[R * N + 4], 0);
});

test('after the comet the bars fall for good, and no dinosaur ever comes back', () => {
  const s = deciding();
  const w = s.world;
  s.resolveDinoFate('comet');
  assert.equal(SE.stageCap(w, SE.Life.Mammal), SE.SUBSPECIES_PER_CLASS - 1);
  s.evo.refresh(w, s.params, true);
  assert.equal(s.evo.statusOf('grazers').conds.some((c) => c.kind === 'era'), false);
  assert.equal(w.evo.isDeveloped('whales') || w.evo.isDeveloped('grazers'), false, 'they are not handed out');
  const ground = inland(w);
  assert.equal(SE.LifeSystem.seed(w, SE.Life.Dinosaur, ground.x, ground.y), false, 'no dinosaur can be placed');
  assert.match(SE.dinoEraLifeBar(w, SE.Life.Dinosaur), /für immer/);
  assert.match(SE.dinoEraStepBar(w, 'dinosaurs'), /für immer/);
  for (let t = 0; t < 40; t++) s.tick();
  assert.equal(w.lifeCounts[SE.Life.Dinosaur], 0);
  assert.equal(w.dinoEra.fate, 'extinct');
  assert.ok(!w.evo.chronicle.some((e) => /^extinct:dinosaurs:\d+$/.test(e.key)), 'no notice offers to bring them back');
});

test('an ordinary dinosaur extinction opens nothing and they may be placed again', () => {
  const s = lush();
  const w = s.world;
  for (let i = 0; i < SE.TILE_COUNT; i++) w.lifeDensity[i * L + SE.Life.Dinosaur] = 0;
  w.refreshDerived();
  for (let t = 0; t < 16; t++) s.evo.step(w, s.params);
  assert.equal(w.dinoEra.fate, 'open');
  assert.equal(SE.stageCap(w, SE.Life.Mammal), SE.MAMMAL_STAGE_BEFORE_COMET);
  assert.ok(SE.dinoEraStepBar(w, 'whales'));
  const ground = inland(w);
  assert.ok(SE.LifeSystem.seed(w, SE.Life.Dinosaur, ground.x, ground.y), 'the usual re-introduction still works');
});

const ctx = (s, fauna) => ({ world: s.world, params: s.params, geo: s.geo, history: s.history, fauna });

function reload(s, edit) {
  const doc = JSON.parse(JSON.stringify(SE.SaveSystem.serialize(ctx(s))));
  if (edit) edit(doc);
  const b = makeSim(1);
  const fauna = new SE.FaunaDex();
  const { notes } = SE.SaveSystem.load(doc, ctx(b, fauna), b.life, b.flora);
  return { b, fauna, notes };
}

test('the era survives save and load before the answer, before the strike and after it', () => {
  const s = deciding();
  assert.equal(reload(s).b.world.dinoEra.fate, 'deciding', 'the question stands again after loading');
  SE.chooseDinoFate(s.world, s.evo, 'comet');
  const target = s.world.dinoEra.target;
  const pending = reload(s).b;
  assert.equal(pending.world.dinoEra.fate, 'impactPending');
  assert.equal(pending.world.dinoEra.target, target, 'the strike goes on where it was aimed');
  assert.ok(SE.applyComet(pending.world, pending.params, pending.life, pending.hazards, pending.evo), 'and strikes once loaded');
  assert.equal(pending.world.lifeCounts[SE.Life.Dinosaur], 0);
  assert.equal(SE.applyComet(pending.world, pending.params, pending.life, pending.hazards, pending.evo), null);
  const done = reload(pending).b;
  assert.equal(done.world.dinoEra.fate, 'extinct');
  assert.deepEqual(done.world.dinoEra.refuges, pending.world.dinoEra.refuges, 'the sheltered populations stay sheltered');
  assert.equal(SE.stageCap(done.world, SE.Life.Mammal), SE.SUBSPECIES_PER_CLASS - 1);

  const kept = deciding();
  SE.chooseDinoFate(kept.world, kept.evo, 'survive');
  assert.equal(reload(kept).b.world.dinoEra.fate, 'kept');

  assert.throws(() => reload(kept, (doc) => { doc.dinoEra.fate = 'gone'; }), SE.SaveCorrupt);
  assert.throws(() => reload(lush(), (doc) => { doc.dinoEra.fate = 'deciding'; }), SE.SaveCorrupt, 'a question needs its birds');
  // Whatever an edited file says, the comet left no dinosaur.
  const edited = reload(deciding(), (doc) => { doc.dinoEra.fate = 'extinct'; }).b;
  assert.equal(edited.world.dinoEra.fate, 'extinct');
  assert.equal(edited.world.lifeCounts[SE.Life.Dinosaur], 0);
});

test('format 8 saves move to the new dinosaur ladder and keep late mammals free', () => {
  const s = lush();
  const w = s.world;
  // Old ladder: 3 Stegosaurier, 4 Ankylosaurier, 7 Tyrannosaurier.
  const tiles = [];
  for (let i = 0; i < SE.TILE_COUNT && tiles.length < 3; i++) if (w.lifeDensity[i * L + SE.Life.Dinosaur] > 0) tiles.push(i);
  [3, 4, 7].forEach((st, k) => { w.lifeStage[tiles[k] * L + SE.Life.Dinosaur] = st; });
  const slot = { t: 1, y: 1, i: -1, b: -1, k: null, o: null };
  const old = (doc, extra) => {
    doc.version = 8;
    delete doc.dinoEra;
    doc.fauna = { v: 1, entries: { dinosaurs: [slot, slot, slot, slot, slot, null, null, slot], mammals: [slot, slot, slot, slot], ...extra } };
  };
  const { b, fauna, notes } = reload(s, (doc) => old(doc));
  const bw = b.world;
  assert.equal(bw.lifeStage[tiles[0] * L + SE.Life.Dinosaur], 6, 'Stegosaurier move to their new place');
  assert.equal(bw.lifeStage[tiles[1] * L + SE.Life.Dinosaur], 7, 'the Cretaceous forms stand at the last stage');
  assert.equal(bw.lifeStage[tiles[2] * L + SE.Life.Dinosaur], 7);
  assert.equal(fauna.isDiscovered(SE.Life.Dinosaur, 6), true, 'the Stegosaurier keep their lexicon entry');
  for (const st of [3, 4, 5]) assert.equal(fauna.isDiscovered(SE.Life.Dinosaur, st), false, `no other animal inherits entry ${st}`);
  assert.equal(fauna.isDiscovered(SE.Life.Dinosaur, 7), false, 'the Tyrannosaurier do not become bird precursors');
  assert.ok(notes.some((n) => /Vogelvorläufern/.test(n)));
  assert.equal(bw.dinoEra.fate, 'open', 'a planet without later mammals follows the new rule');

  const birds = lush();
  develop(birds.world, 'birds');
  assert.equal(reload(birds, (doc) => old(doc)).b.world.dinoEra.fate, 'deciding', 'and is asked if its birds exist');

  const late = lush();
  develop(late.world, 'grazers');
  assert.equal(reload(late, (doc) => old(doc)).b.world.dinoEra.fate, 'exempt', 'grazers keep the old freedom');
  const lex = reload(lush(), (doc) => old(doc, { mammals: [slot, slot, slot, slot, slot] }));
  assert.equal(lex.b.world.dinoEra.fate, 'exempt', 'a rodent in the lexicon counts as reached');
  const living = lush();
  for (let i = 0; i < SE.TILE_COUNT; i++) if (living.world.lifeDensity[i * L + SE.Life.Mammal] > 0) { living.world.lifeStage[i * L + SE.Life.Mammal] = 5; break; }
  const freed = reload(living, (doc) => old(doc)).b.world;
  assert.equal(freed.dinoEra.fate, 'exempt');
  assert.equal(SE.stageCap(freed, SE.Life.Mammal), SE.SUBSPECIES_PER_CLASS - 1);
});
