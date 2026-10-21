#!/usr/bin/env node
/* =============================================================================
 * SimEarth 2.0 — comet probe
 * -----------------------------------------------------------------------------
 * Plays a planet greedily (cheapest step first) until the first birds put the
 * dinosaurs' question, answers it as told, and follows the planet after it:
 * how many tiles each group holds at the strike and later, which groups were
 * lost, how high the mammals climb and when whales and grazers arrive.
 *
 *   node tools/comet-probe.js [ticksAfter] [seed …] [--survive]
 *
 * Defaults: 1500 ticks after the answer, seeds 12345 2024 99. Honours
 * SE_BUNDLE like the tests. The answer is the probe's, never the simulation's.
 * ========================================================================== */
'use strict';
const path = require('path');
const { makeSim } = require(path.join(__dirname, '..', 'tests', 'helpers.js'));

const args = process.argv.slice(2);
const survive = args.includes('--survive');
const nums = args.filter((a) => /^\d+$/.test(a)).map(Number);
const after = nums.length > 0 ? nums[0] : 1500;
const seeds = nums.length > 1 ? nums.slice(1) : [12345, 2024, 99];
const MAX_TICKS_TO_BIRDS = 14000;
const MARKS = [0, 10, 35, 65, 95, 150, 200, 400, 800, 1500, 3000];

function cheapest(s) {
  const ids = s.evo.availableIds();
  return ids.length ? ids.sort((a, b) => s.SE.evoNode(a).cost - s.SE.evoNode(b).cost)[0] : null;
}

for (const seed of seeds) {
  const s = makeSim(seed);
  const { SE, world: w } = s;
  s.evo.develop(w, s.params, 'cells');
  let t = 0;
  for (; t < MAX_TICKS_TO_BIRDS && w.dinoEra.fate !== 'deciding'; t++) {
    s.tick();
    if (t % 5 !== 0) continue;
    s.evo.refresh(w, s.params, true);
    const id = cheapest(s);
    if (id) s.evo.develop(w, s.params, id);
  }
  if (w.dinoEra.fate !== 'deciding') {
    console.log(`seed ${seed}: no birds after ${t} ticks (developed ${w.evo.developed.size})`);
    continue;
  }
  w.refreshDerived();
  const tiles = () => Array.from(w.lifeCounts);
  const before = tiles();
  const groups = [];
  for (let c = 1; c < SE.LIFE_COUNT; c++) if (before[c] > 0) groups.push(c);
  const floraBefore = Array.from(w.floraCounts);
  let mammalTop = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    if (w.lifeDensity[i * SE.LIFE_COUNT + SE.Life.Mammal] > 0) mammalTop = Math.max(mammalTop, w.lifeStage[i * SE.LIFE_COUNT + SE.Life.Mammal]);
  }
  console.log(`seed ${seed}: birds at tick ${w.ticks} (${SE.formatEarthDate(w.absoluteYears)}), mammal stage ≤ ${mammalTop + 1}, choice ${survive ? 'survive' : 'comet'}`);
  const bio = Array.from(w.lifeBiomass);
  s.resolveDinoFate(survive ? 'survive' : 'comet');
  w.refreshDerived();
  if (!survive) {
    const lost = groups.map((c) => `${SE.LIFE[c].id} ${Math.round((1 - w.lifeBiomass[c] / bio[c]) * 100)}%`).join(', ');
    console.log(`  stock lost at the strike: ${lost}`);
    console.log(`  crater at ${w.dinoEra.target % SE.GRID_W}/${Math.floor(w.dinoEra.target / SE.GRID_W)}, dust ${w.dust.toFixed(2)}`);
  }
  // The comet's winter: its share now, land under ice (all / the comet's), mean plant cover on land.
  const winter = () => {
    let land = 0, ice = 0, comet = 0, veg = 0;
    for (let i = 0; i < SE.TILE_COUNT; i++) {
      if (w.isWater(i)) continue;
      land++;
      veg += w.vegetation[i];
      if (w.landscape[i] === SE.Landscape.Ice) { ice++; if (SE.cometIceAt(w, i)) comet++; }
    }
    return `ice ${SE.cometIceShare(w).toFixed(2)}, land ice ${Math.round(ice / land * 100)}% (comet ${Math.round(comet / land * 100)}%), cover ${(veg / land).toFixed(2)}`;
  };
  const start = w.ticks;
  const firstOf = {};
  let mark = 0;
  for (let k = 0; k <= after; k++) {
    if (k === MARKS[mark] || k === after) {
      const now = tiles();
      const row = groups.map((c) => `${SE.LIFE[c].id} ${now[c]}`).join(' · ');
      console.log(`  +${String(k).padStart(4)}  ${row}  | ${w.globalTemp.toFixed(1)} °C, ${w.dinoEra.refuges.length} sheltered, ${winter()}`);
      while (MARKS[mark] <= k) mark++;
    }
    if (k === after) break;
    s.tick();
    if (k % 5 === 0) {
      s.evo.refresh(w, s.params, true);
      const id = cheapest(s);
      if (id && s.evo.develop(w, s.params, id).ok) firstOf[id] = w.ticks - start;
    }
  }
  const lostGroups = groups.filter((c) => w.lifeCounts[c] === 0 && c !== SE.Life.Dinosaur).map((c) => SE.LIFE[c].id);
  const lostPlants = floraBefore.map((n, g) => (g > 0 && n > 0 && w.floraCounts[g] === 0 ? SE.FLORA[g].id : '')).filter(Boolean);
  mammalTop = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    if (w.lifeDensity[i * SE.LIFE_COUNT + SE.Life.Mammal] > 0) mammalTop = Math.max(mammalTop, w.lifeStage[i * SE.LIFE_COUNT + SE.Life.Mammal]);
  }
  console.log(`  after ${after} ticks: lost animals [${lostGroups.join(', ')}], lost plants [${lostPlants.join(', ')}], mammal stage ≤ ${mammalTop + 1}, dinosaurs ${w.lifeCounts[SE.Life.Dinosaur]}`);
  console.log(`  developed later: ${Object.entries(firstOf).map(([id, k]) => `${id} +${k}`).join(', ') || '—'}`);
}
