'use strict';
/*
 * The evolution tree: data integrity, the rules that keep descent, habitat
 * and ecology apart, the development action, and that every planned stage is
 * actually reachable — by more than one route.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSE, makeSim } = require('./helpers');

const SE = loadSE();
const NODES = SE.EVO_NODES;
const byId = (id) => SE.evoNode(id);

test('node ids are unique and every reference resolves', () => {
  const ids = NODES.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate node id');
  for (const n of NODES) {
    if (n.parent !== null) assert.ok(SE.EVO_BY_ID.has(n.parent), `${n.id}: unknown parent ${n.parent}`);
    for (const need of n.eco) {
      assert.ok(need.any.length > 0, `${n.id}: empty ecological need`);
      for (const id of need.any) assert.ok(SE.EVO_BY_ID.has(id), `${n.id}: unknown eco reference ${id}`);
      assert.ok(!need.any.includes(n.id), `${n.id}: needs itself`);
    }
  }
});

test('descent has exactly one root and no cycles', () => {
  const roots = NODES.filter((n) => n.parent === null);
  assert.deepEqual(roots.map((n) => n.id), ['cells']);
  for (const n of NODES) {
    const seen = new Set();
    let p = n.id;
    while (p) {
      assert.ok(!seen.has(p), `cycle through ${p}`);
      seen.add(p);
      p = byId(p).parent;
    }
    assert.ok(seen.has('cells'), `${n.id} does not descend from the root`);
  }
});

test('every simulated class and plant group has exactly one node', () => {
  for (let c = 1; c < SE.LIFE_COUNT; c++) {
    const hits = NODES.filter((n) => n.life === c);
    assert.equal(hits.length, 1, `life class ${c} (${SE.LIFE[c].name})`);
    assert.equal(hits[0].id, SE.LIFE[c].id, `life class ${c}: id mismatch`);
  }
  for (let g = 1; g < SE.FLORA_COUNT; g++) {
    const hits = NODES.filter((n) => n.flora === g);
    assert.equal(hits.length, 1, `flora group ${g}`);
    assert.equal(hits[0].id, SE.FLORA[g].id, `flora group ${g}: id mismatch`);
  }
  for (const n of NODES) {
    assert.ok((n.life !== undefined) !== (n.flora !== undefined), `${n.id}: must be exactly one of life/flora`);
  }
});

test('plants and animals have separate lineages joined only at the single-celled origin', () => {
  for (const n of NODES) {
    if (!n.parent) continue;
    const p = byId(n.parent);
    if (n.kingdom === 'animal') assert.notEqual(p.kingdom, 'plant', `${n.id}: an animal descends from a plant`);
    if (n.kingdom === 'plant') assert.notEqual(p.kingdom, 'animal', `${n.id}: a plant descends from an animal`);
  }
  assert.deepEqual(NODES.filter((n) => n.kingdom === 'origin').map((n) => n.id).sort(), ['cells', 'eukaryotes']);
});

test('the land-plant lineage runs through freshwater green algae, not marine algae as a whole', () => {
  assert.equal(byId('landPlants').parent, 'freshwaterAlgae');
  assert.equal(byId('freshwaterAlgae').parent, 'marineAlgae');
  // Mosses are a sister line of the vascular plants, not their ancestor.
  assert.equal(byId('vascular').parent, 'landPlants');
  assert.equal(byId('ferns').parent, 'vascular');
  for (const n of NODES) assert.notEqual(n.parent, 'mosses', `${n.id} must not descend from mosses`);
  // Broadleaf trees are flowering plants; conifers come from seed plants.
  assert.equal(byId('broadleaf').parent, 'flowering');
  assert.equal(byId('conifers').parent, 'seedPlants');
  // Corrections of the original game's tree.
  assert.equal(byId('fish').parent, 'bilaterians');
  assert.equal(byId('whales').parent, 'mammals');
  assert.equal(byId('birds').parent, 'dinosaurs');
  assert.notEqual(byId('mammals').parent, 'reptiles');
});

test('first flowering plants need no pollinator; pollinators need flowers', () => {
  for (const need of byId('flowering').eco) {
    assert.ok(!need.any.includes('pollinators'), 'flowering plants must be reachable without pollinators');
  }
  const pol = byId('pollinators');
  assert.equal(pol.parent, 'insects');
  const partner = pol.eco.find((e) => e.kind === 'partner');
  assert.ok(partner && partner.any.includes('flowering'), 'pollinators need flowering plants');
  // And no other cycle through ecology: an eco partner may not depend on the node itself.
  const needs = (id) => new Set(byId(id).eco.flatMap((e) => e.any));
  for (const n of NODES) {
    for (const other of needs(n.id)) {
      assert.ok(!needs(other).has(n.id) || n.id === other, `ecological deadlock between ${n.id} and ${other}`);
    }
  }
});

test('food conditions in the tree match what the simulation feeds the class', () => {
  for (const n of NODES) {
    if (n.life === undefined) continue;
    const diet = SE.LIFE[n.life].diet;
    for (const need of n.eco.filter((e) => e.kind === 'food')) {
      for (const id of need.any) {
        const m = byId(id);
        let fed = false;
        if (m.life !== undefined) {
          fed = (diet.prey || []).includes(m.life) ||
            ((m.life === SE.Life.Prokaryote || m.life === SE.Life.Eukaryote) && (diet.plankton || 0) > 0);
        } else if (m.flora === SE.Flora.MarineAlgae) {
          fed = (diet.algae || 0) > 0 || (diet.plankton || 0) > 0;
        } else {
          fed = (diet.plants || []).some(([mask]) => (mask & (1 << m.flora)) !== 0);
        }
        assert.ok(fed, `${n.id}: tree says it eats ${id}, but its diet does not include it`);
      }
    }
  }
});

test('every node is fully described', () => {
  for (const n of NODES) {
    for (const k of ['name', 'short', 'description', 'ecosystem']) assert.ok(n[k] && n[k].length > 3, `${n.id}.${k}`);
    assert.ok(n.benefits.length >= 1, `${n.id}: no benefit`);
    assert.ok(n.habitat.tags.length >= 1 && n.habitat.text.length > 3, `${n.id}: habitat`);
    for (const k of ['title', 'text', 'change']) assert.ok(n.event[k] && n.event[k].length > 3, `${n.id}.event.${k}`);
    assert.ok(n.cost >= 0, `${n.id}: negative cost`);
  }
  assert.equal(byId('cells').cost, 0, 'the first step must be free');
});

test('tree layout: unique positions, plants above, animals below the origin', () => {
  const pos = new Set();
  for (const n of NODES) {
    const key = `${n.col},${n.row}`;
    assert.ok(!pos.has(key), `two nodes at ${key}`);
    pos.add(key);
    if (n.kingdom === 'plant') assert.ok(n.row < 0, `${n.id} must sit in the plant band`);
    if (n.kingdom === 'animal') assert.ok(n.row > 0, `${n.id} must sit in the animal band`);
    if (n.kingdom === 'origin') assert.equal(n.row, 0);
    if (n.parent) assert.ok(byId(n.parent).col < n.col, `${n.id} must lie right of its parent`);
  }
});

test('statuses on a fresh planet and the develop action', () => {
  const s = makeSim(4242);
  const st = (id) => s.evo.statusOf(id);
  assert.equal(st('cells').state, 'available');
  assert.equal(st('eukaryotes').state, 'locked');
  assert.equal(st('landPlants').state, 'locked');

  // Developing something not yet available changes nothing.
  const before = s.world.evo.ep;
  assert.equal(s.evo.develop(s.world, s.params, 'eukaryotes').ok, false);
  assert.equal(s.world.evo.ep, before);
  assert.equal(s.world.evo.developed.size, 0);

  const r = s.evo.develop(s.world, s.params, 'cells');
  assert.ok(r.ok, r.reason);
  assert.ok(s.world.lifeCounts[SE.Life.Prokaryote] > 0, 'founders were placed');
  // A second click is refused and changes nothing.
  const again = s.evo.develop(s.world, s.params, 'cells');
  assert.equal(again.ok, false);
  assert.equal(s.world.evo.developed.size, 1);
  assert.equal(s.evo.pending.filter((e) => e.key === 'evo:cells').length, 1, 'exactly one event');

  // Eukaryotes now only lack oxygen and points; the summary names them.
  s.evo.refresh(s.world, s.params, true);
  const eu = st('eukaryotes');
  assert.equal(eu.state, 'partial');
  const missing = SE.EvolutionSystem.missingSummary(eu);
  assert.match(missing, /^Benötigt /);
  assert.match(missing, /EP/);
});

test('insufficient evolution points block development and are charged once', () => {
  const s = makeSim(99);
  s.evo.develop(s.world, s.params, 'cells');
  // Earn enough for the second step, then hold the oxygen condition open.
  for (let t = 0; t < 400 && s.evo.statusOf('eukaryotes').state !== 'available'; t++) s.tick();
  s.evo.refresh(s.world, s.params, true);
  assert.equal(s.evo.statusOf('eukaryotes').state, 'available');
  const ep = s.world.evo.ep;
  assert.ok(s.evo.develop(s.world, s.params, 'eukaryotes').ok);
  assert.equal(s.world.evo.ep, ep - byId('eukaryotes').cost);
  assert.equal(s.evo.develop(s.world, s.params, 'eukaryotes').ok, false);
  assert.equal(s.world.evo.ep, ep - byId('eukaryotes').cost, 'no second charge');

  s.world.evo.ep = 0;
  s.evo.refresh(s.world, s.params, true);
  const algae = s.evo.statusOf('marineAlgae');
  assert.notEqual(algae.state, 'available');
  assert.ok(algae.conds.some((c) => c.kind === 'cost' && !c.met));
});

test('an extinct ancestor blocks its descendants until it is re-introduced', () => {
  const s = makeSim(7);
  s.evo.develop(s.world, s.params, 'cells');
  for (let t = 0; t < 600 && !s.world.evo.isDeveloped('eukaryotes'); t++) {
    s.tick();
    if (s.evo.statusOf('eukaryotes').state === 'available') s.evo.develop(s.world, s.params, 'eukaryotes');
  }
  assert.ok(s.world.evo.isDeveloped('eukaryotes'));
  // Wipe out the complex cells.
  const L = SE.LIFE_COUNT;
  let anyTile = -1;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    if (s.world.lifeDensity[i * L + SE.Life.Eukaryote] > 0) anyTile = i;
    s.world.lifeDensity[i * L + SE.Life.Eukaryote] = 0;
  }
  s.world.refreshDerived();
  s.evo.refresh(s.world, s.params, true);
  const lineage = s.evo.statusOf('marineAlgae').conds.find((c) => c.kind === 'lineage');
  assert.equal(lineage.met, false);
  assert.match(lineage.detail, /ausgestorben/);
  // Re-introduce with the placement tool's own function.
  assert.ok(SE.LifeSystem.seed(s.world, SE.Life.Eukaryote, anyTile % SE.GRID_W, Math.floor(anyTile / SE.GRID_W)));
  s.world.refreshDerived();
  s.evo.refresh(s.world, s.params, true);
  assert.equal(s.evo.statusOf('marineAlgae').conds.find((c) => c.kind === 'lineage').met, true);
});

// The whales and grazers wait for the comet (src/dinoera.ts), so these players let it strike.
test('the full tree is reachable: cheapest first', { timeout: 600000 }, () => {
  const s = makeSim(12345);
  s.evo.develop(s.world, s.params, 'cells');
  const order = s.play(9000, undefined, 'comet');
  assert.equal(s.world.evo.developed.size, NODES.length, `stuck after ${order.map((o) => o.id).join(', ')}`);
  const at = (id) => order.findIndex((o) => o.id === id);
  assert.ok(at('flowering') < at('pollinators'), 'flowers before pollinators');
  assert.ok(at('landPlants') < at('landArthropods'), 'plants ashore before animals');
  // No NaN or runaway values anywhere after a whole game.
  for (const f of ['elevation', 'temperature', 'moisture', 'vegetation', 'lifeDensity']) {
    assert.ok(s.world[f].every((v) => Number.isFinite(v)), `${f} has a non-finite value`);
  }
  assert.ok(s.world.vegetation.every((v) => v >= 0 && v <= 1));
});

test('the full tree is reachable on another planet, animals first', { timeout: 600000 }, () => {
  const s = makeSim(777);
  s.evo.develop(s.world, s.params, 'cells');
  const order = s.play(12000, (ids) => {
    const animals = ids.filter((id) => byId(id).kingdom !== 'plant');
    return (animals.length ? animals : ids).sort((a, b) => byId(a).cost - byId(b).cost)[0];
  }, 'comet');
  assert.equal(s.world.evo.developed.size, NODES.length, `stuck after ${order.map((o) => o.id).join(', ')}`);
});

test('the full tree is reachable plants first, most expensive first', { timeout: 600000 }, () => {
  const s = makeSim(31337);
  s.evo.develop(s.world, s.params, 'cells');
  const order = s.play(12000, (ids) => {
    const plants = ids.filter((id) => byId(id).kingdom === 'plant');
    return (plants.length ? plants : ids).sort((a, b) => byId(b).cost - byId(a).cost)[0];
  }, 'comet');
  assert.equal(s.world.evo.developed.size, NODES.length, `stuck after ${order.map((o) => o.id).join(', ')}`);
});
