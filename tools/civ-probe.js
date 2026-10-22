/* =============================================================================
 * SimEarth 2.0 — civilization probe
 * -----------------------------------------------------------------------------
 * Plays a planet to sentience and then measures what docs/zivilisation-spec.md
 * §6 asks of the civilization: spacing, sites, settlers, tribes, epidemics,
 * conflicts, CO2 and the time civ.step takes. Sites are judged here by the
 * spec's own rule, independently of src/civsite.ts, so the probe checks the
 * code instead of repeating it.
 *
 *   node tools/civ-probe.js [civTicks] [seed ...] [--epoch=random|youngEarth|today]
 *                           [--evolve=<ticks>] [--every=<ticks>]
 *
 *     civTicks   ticks to run after sentience (default 1500)
 *     --evolve   most ticks of greedy evolution before sentience is forced
 *                with a first city, as the Monolith would (default 6000)
 *     --every    ticks per report line (default 100)
 *     --dino     comet|survive: answer the first birds' question that way
 *                (src/comet.ts); without it the question stays open
 *
 * Standard set (each reaches sentience by itself, tree of 15. 10. 2026):
 *   node tools/civ-probe.js 1700 12345 2024 99
 *   node tools/civ-probe.js 1700 12345 --epoch=today
 *
 * SE_BUNDLE=<file> probes another build than simulation.js.
 * ========================================================================== */
'use strict';

const path = require('path');
const { makeSim } = require(path.join(__dirname, '..', 'tests', 'helpers.js'));

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const opt = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const civTicks = Number(args[0] || 1500);
const seeds = args.length > 1 ? args.slice(1).map(Number) : [12345];
const epoch = opt('epoch', 'random');
const evolveMax = Number(opt('evolve', 6000));
const every = Number(opt('every', 100));
const dinoFate = opt('dino', '');

/** App.advanceTimeScale, which lives in app.ts and so is not in the bundle's systems. */
function advanceScale(SE, w) {
  if (w.timeScale === SE.TimeScale.Geologic && w.totalBiomass > 0) w.timeScale = SE.TimeScale.Evolution;
  else if (w.timeScale === SE.TimeScale.Evolution && w.sentientClass !== SE.Life.None) w.timeScale = SE.TimeScale.Civilized;
  else if (w.timeScale === SE.TimeScale.Civilized) {
    for (let t = SE.Tech.Industrial; t < SE.TECH_COUNT; t++) {
      if (w.techCounts[t] > 0) { w.timeScale = SE.TimeScale.Technology; break; }
    }
  }
}

/**
 * The spec's site rule (§2.2): land, not ice, snow, rock, desert, barren or alpine meadow, not on rock, below the
 * tree line — by the climate zone's tree-line flag, by height on a tile without a zone.
 */
function forbidden(SE, w, i) {
  if (w.isWater(i)) return true;
  const L = SE.Landscape;
  const ls = w.landscape[i];
  const z = w.landscapeZone[i];
  const high = z === SE.ZONE_NONE ? w.elevation[i] > SE.TREE_LINE : (z & SE.ZONE_TREELINE) !== 0;
  return ls === L.Ice || ls === L.Snow || ls === L.Rock || ls === L.Desert || ls === L.Barren || ls === L.Alpine ||
    w.substrate[i] === SE.Substrate.Rock || high;
}

function around(SE, i, r, fn) {
  const x = i % SE.GRID_W;
  const y = Math.floor(i / SE.GRID_W);
  for (let dy = -r; dy <= r; dy++) {
    const ny = y + dy;
    if (ny < 0 || ny >= SE.GRID_H) continue;
    for (let dx = -r; dx <= r; dx++) {
      if (dx === 0 && dy === 0) continue;
      fn(ny * SE.GRID_W + (((x + dx) % SE.GRID_W) + SE.GRID_W) % SE.GRID_W, dx, dy);
    }
  }
}

function site(SE, w, i) {
  let river = w.riverLevel[i] > 0;
  let coast = false;
  around(SE, i, 1, (j) => {
    if (w.riverLevel[j] > 0) river = true;
    if (w.isWater(j)) coast = true;
  });
  return { river, coast, bad: forbidden(SE, w, i) };
}

function dist(SE, a, b) {
  let dx = Math.abs((a % SE.GRID_W) - (b % SE.GRID_W));
  dx = Math.min(dx, SE.GRID_W - dx);
  const dy = Math.floor(a / SE.GRID_W) - Math.floor(b / SE.GRID_W);
  return Math.hypot(dx, dy);
}

function cityTiles(SE, w) {
  const out = [];
  for (let i = 0; i < SE.TILE_COUNT; i++) if (w.tech[i] !== 0) out.push(i);
  return out;
}

function minSpacing(SE, tiles) {
  let best = Infinity;
  for (let a = 0; a < tiles.length; a++) {
    for (let b = a + 1; b < tiles.length; b++) best = Math.min(best, dist(SE, tiles[a], tiles[b]));
  }
  return best;
}

/** First city where the Monolith would wake the densest land class able to think. */
function forceSentience(SE, w) {
  let best = -1;
  let bestD = 0;
  let cls = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    if (forbidden(SE, w, i)) continue;
    for (let c = 1; c < SE.LIFE_COUNT; c++) {
      if (!SE.LIFE[c].sentient || SE.LIFE[c].realm !== 'land') continue;
      const d = w.lifeDensity[i * SE.LIFE_COUNT + c];
      if (d > bestD) { bestD = d; best = i; cls = c; }
    }
  }
  if (best < 0) return false;
  w.sentientClass = cls;
  w.tech[best] = SE.Tech.Stone;
  w.cityPop[best] = 0.3;
  return true;
}

function probe(seed) {
  const s = makeSim(seed, epoch);
  const { SE, world: w, params } = s;
  const t0 = Date.now();

  let t = 0;
  // Developed exactly as tools/headless.js --life does, so both probes play the same planet.
  s.evo.develop(w, params, 'cells');
  for (; t < evolveMax && w.sentientClass === SE.Life.None; t++) {
    if (dinoFate && w.dinoEra.fate === 'deciding') s.resolveDinoFate(dinoFate);
    s.tick();
    advanceScale(SE, w);
    if (w.ticks % 5 === 0) {
      s.evo.refresh(w, params, true);
      const ids = s.evo.availableIds().sort((a, b) => SE.evoNode(a).cost - SE.evoNode(b).cost);
      if (ids.length) s.evo.develop(w, params, ids[0]);
    }
  }
  const natural = w.sentientClass !== SE.Life.None;
  if (!natural && !forceSentience(SE, w)) {
    console.log(`seed ${seed}: no land class able to think after ${t} ticks — nothing to measure`);
    return;
  }
  const cls = SE.LIFE[w.sentientClass].id;
  console.log(`seed ${seed} (${epoch}): sentience ${natural ? 'natural' : 'forced'} at tick ${t}, ${cls}, ` +
    `${((Date.now() - t0) / 1000).toFixed(0)} s`);

  // Time civ.step inside the regular tick.
  let civMs = 0;
  const step = s.civ.step.bind(s.civ);
  s.civ.step = (...a) => { const c0 = process.hrtime.bigint(); step(...a); civMs += Number(process.hrtime.bigint() - c0) / 1e6; };

  let land = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) if (!w.isWater(i)) land++;
  const prev = new Uint8Array(SE.TILE_COUNT);
  const seenConflicts = new Set();
  const seenOutbreaks = new Set();
  const conflictStarts = [];
  const tot = { foundings: 0, riverCoast: 0, bad: 0, settlerTicks: 0, settlerMax: 0, conflictMax: 0, spacing: Infinity, outbreaks: 0 };
  let row = { foundings: 0, riverCoast: 0, bad: 0, outbreaks: 0, conflicts: 0 };
  // Growth phase: until the last founding. Eras: tick each tech level first appears.
  const underway = [];
  let lastFounding = -1;
  const eraAt = [];
  eraAt[SE.Tech.Stone] = 0;
  const eraCities = [];
  const eraLand = [];
  // Per top tech level: ticks spent and epidemics broken out; highest land share before the industrial age.
  const eraTicks = new Array(SE.TECH_COUNT).fill(0);
  const eraOutbreaks = new Array(SE.TECH_COUNT).fill(0);
  let landBeforeIndustry = 0;
  let landMax = 0;
  let co2Industrial = 0;
  // Why each people arose: the first or a lone city, settlers far from the capital or across water, or a split.
  const tribesSeen = new Set();
  const tribeCause = { first: [], far: [], water: [], split: [] };
  const tribeSizes = (civ) => civ.tribes.map((t) => civ.cities.filter((c) => c.tribe === t.id).length).sort((a, b) => b - a).join(',');
  // Conflicts: when two tribes first are neighbours, each war's start, end, pair and outcome, the news on them.
  let neighboursAt = -1;
  const wars = [];
  const openWars = new Map();
  const warNews = { start: 0, end: 0 };
  // The voyage of discovery (src/discovery.ts): each change of its state, and the cities on the new continent after landfall.
  const voyage = { state: 'open', held: -1, found: -1, log: [], colonies: [] };

  console.log('   tick  cities  minDist  land%  found  river/coast  bad  settlers  tribes  outbreaks  conflicts  top           CO2  civ ms');
  for (let k = 0; k <= civTicks; k++) {
    prev.set(w.tech);
    s.tick();
    advanceScale(SE, w);

    for (let i = 0; i < SE.TILE_COUNT; i++) {
      if (w.tech[i] === 0 || prev[i] !== 0) continue;
      // A city that drifted one tile is no founding.
      let moved = false;
      around(SE, i, 2, (j) => { if (prev[j] !== 0) moved = true; });
      if (moved) continue;
      const q = site(SE, w, i);
      row.foundings++;
      lastFounding = k;
      if (q.river || q.coast) row.riverCoast++;
      if (q.bad) row.bad++;
    }
    const civ = w.civ;
    underway.push(civ.settlers.length > 0);
    const dsc = civ.discovery;
    if (voyage.held < 0 && dsc.held >= 0) {
      voyage.held = k;
      voyage.log.push(`held +${k}`);
    }
    if (dsc.state !== voyage.state) {
      voyage.state = dsc.state;
      const ships = civ.settlers.find((x) => x.voyage);
      const xy = (t) => `${t % SE.GRID_W},${Math.floor(t / SE.GRID_W)}`;
      const lm = ships || dsc.state === 'found' ? SE.landmasses(w) : null;
      const to = ships ? ships.path[ships.path.length - 1] : dsc.landfall;
      voyage.log.push(ships && dsc.state === 'sailing'
        ? `ships out +${k} from ${civ.cityAt(ships.path[0])?.name} (${xy(ships.path[0])}) to (${xy(to)}) on ${lm.size[lm.label[to]]} land tiles, ${ships.path.length - 1} tiles`
        : `${dsc.state} +${k}${dsc.state === 'found' ? ` at (${xy(to)})` : ''}`);
      if (dsc.state === 'found') voyage.found = k;
    }
    if (voyage.found >= 0 && [100, 300, 500].includes(k - voyage.found)) {
      const { label } = SE.landmasses(w);
      const home = label[dsc.landfall];
      voyage.colonies.push(`${civ.cities.filter((c) => label[c.tile] === home).length} at +${k - voyage.found}`);
    }
    // Told apart by the news each founding sends (src/tribes.ts); a people without one is the first or a lone city.
    for (const n of civ.news) {
      if (!n.chronicle || !n.chronicle.key.startsWith('civ:tribe:')) continue;
      if (/jenseits des Wassers/.test(n.text)) tribeCause.water.push(k);
      else if (/sagen sich/.test(n.text)) tribeCause.split.push(k);
      else if (/^Neues Volk: Die \S+ gründen/.test(n.text)) tribeCause.far.push(k);
      else tribeCause.first.push(k);
    }
    for (const tr of civ.tribes) {
      if (tribesSeen.has(tr.id)) continue;
      tribesSeen.add(tr.id);
      if (tr.parent < 0 && k === 0) tribeCause.first.push(k);
    }
    let topNow = 0;
    for (let i = 0; i < SE.TILE_COUNT; i++) if (w.tech[i] > topNow) topNow = w.tech[i];
    const landNow = 100 * civ.cities.length / land;
    landMax = Math.max(landMax, landNow);
    for (let tt = SE.Tech.Bronze; tt <= topNow; tt++) {
      if (eraAt[tt] !== undefined) continue;
      eraAt[tt] = k;
      eraCities[tt - 1] = cityTiles(SE, w).length;
      eraLand[tt - 1] = 100 * eraCities[tt - 1] / land;
      if (tt === SE.Tech.Industrial) co2Industrial = w.co2;
      console.log(`  era ${SE.TECH_NAMES[tt]} at +${k}: the ${SE.TECH_NAMES[tt - 1]} ends with ${eraCities[tt - 1]} cities ` +
        `(${eraLand[tt - 1].toFixed(2)} % of the land), ${civ.tribes.length} tribes (cities each: ${tribeSizes(civ)})`);
    }
    if (topNow < SE.Tech.Industrial) landBeforeIndustry = Math.max(landBeforeIndustry, landNow);
    eraTicks[topNow]++;
    if (eraAt[SE.Tech.Industrial] !== undefined && k === eraAt[SE.Tech.Industrial] + 500) {
      const d = w.co2 - co2Industrial;
      console.log(`  CO2 over 500 ticks from the first industrial city: ${co2Industrial.toFixed(0)} → ${w.co2.toFixed(0)} ppm (${d >= 0 ? '+' : ''}${d.toFixed(0)}), top ${SE.TECH_NAMES[topNow]}`);
    }
    if (civ.settlers.length > 0) tot.settlerTicks++;
    // The voyage of discovery (discovery.ts) sails beside the capped settler groups.
    tot.settlerMax = Math.max(tot.settlerMax, civ.settlers.filter((s) => !s.voyage).length);
    tot.conflictMax = Math.max(tot.conflictMax, civ.conflicts.length);
    for (const c of civ.conflicts) {
      if (seenConflicts.has(c)) continue;
      seenConflicts.add(c);
      conflictStarts.push(w.ticks);
      row.conflicts++;
    }
    for (const o of civ.outbreaks) {
      if (seenOutbreaks.has(o)) continue;
      seenOutbreaks.add(o);
      row.outbreaks++;
      eraOutbreaks[topNow]++;
    }
    if (neighboursAt < 0 && civ.cities.some((a) => civ.cities.some((b) => b.tribe !== a.tribe && dist(SE, a.tile, b.tile) <= SE.CIV_NEIGHBOUR_DIST))) {
      neighboursAt = k;
    }
    for (const [c, war] of openWars) {
      if (civ.conflicts.includes(c)) continue;
      openWars.delete(c);
      war.end = k;
      const [a, b] = [civ.city(c.a), civ.city(c.b)];
      war.outcome = !a || !b ? 'destroyed' : a.tribe !== c.sides[0].id || b.tribe !== c.sides[1].id ? 'taken' : 'held';
    }
    for (const c of civ.conflicts) {
      if (openWars.has(c) || wars.some((x) => x.c === c)) continue;
      const size = (id) => civ.cities.filter((x) => x.tribe === id).length;
      const largest = civ.tribes.every((tr) => size(tr.id) <= size(c.sides[0].id));
      const war = { c, start: k, end: -1, outcome: '', largest, pair: [c.sides[0].id, c.sides[1].id].sort((x, y) => x - y).join(':') };
      wars.push(war);
      openWars.set(c, war);
    }
    for (const n of civ.news) {
      if (n.text.startsWith('Krieg zwischen')) warNews.start++;
      if (n.chronicle && n.chronicle.key.startsWith('civ:war:')) warNews.end++;
    }

    if (k % every === 0) {
      const tiles = cityTiles(SE, w);
      const spacing = minSpacing(SE, tiles);
      tot.spacing = Math.min(tot.spacing, spacing);
      let top = 0;
      for (let tt = 1; tt < SE.TECH_COUNT; tt++) if (w.techCounts[tt] > 0) top = tt;
      console.log(`  ${String(k).padStart(5)}  ${String(tiles.length).padStart(6)}  ${(spacing === Infinity ? '-' : spacing.toFixed(1)).padStart(7)}  ` +
        `${(100 * tiles.length / land).toFixed(2).padStart(5)}  ${String(row.foundings).padStart(5)}  ` +
        `${(row.foundings ? `${Math.round(100 * row.riverCoast / row.foundings)}%` : '-').padStart(11)}  ${String(row.bad).padStart(3)}  ` +
        `${String(civ.settlers.length).padStart(8)}  ${String(civ.tribes.length).padStart(6)}  ${String(row.outbreaks).padStart(9)}  ` +
        `${String(row.conflicts).padStart(9)}  ${SE.TECH_NAMES[top].padEnd(12)}  ${w.co2.toFixed(0).padStart(4)}  ${(civMs / every).toFixed(2)}`);
      tot.foundings += row.foundings;
      tot.riverCoast += row.riverCoast;
      tot.bad += row.bad;
      tot.outbreaks += row.outbreaks;
      row = { foundings: 0, riverCoast: 0, bad: 0, outbreaks: 0, conflicts: 0 };
      civMs = 0;
    }
  }

  let gap = Infinity;
  for (let k = 1; k < conflictStarts.length; k++) gap = Math.min(gap, conflictStarts[k] - conflictStarts[k - 1]);
  const check = (ok, what) => console.log(`  CHECK ${ok ? 'ok  ' : 'FAIL'} ${what}`);
  check(tot.spacing >= SE.CITY_MIN_DIST, `spacing ≥ ${SE.CITY_MIN_DIST} (min ${tot.spacing === Infinity ? '-' : tot.spacing.toFixed(1)})`);
  check(tot.bad === 0, `no founding on water, ice, snow, rock, desert, barren or above the tree line (${tot.bad})`);
  check(tot.foundings === 0 || tot.riverCoast / tot.foundings >= 0.7,
    `≥ 70 % of foundings at a river or coast (${tot.foundings ? Math.round(100 * tot.riverCoast / tot.foundings) : '-'} % of ${tot.foundings})`);
  const growth = underway.slice(0, lastFounding + 1);
  const growthShare = growth.length ? `${Math.round(100 * growth.filter(Boolean).length / growth.length)} %` : '-';
  check(tot.settlerMax <= SE.SETTLERS_MAX, `≤ ${SE.SETTLERS_MAX} settler groups at once (max ${tot.settlerMax}); under way in ${Math.round(100 * tot.settlerTicks / (civTicks + 1))} % of ticks, ${growthShare} until the last founding (+${lastFounding})`);
  check(tot.conflictMax <= 1, `≤ 1 conflict at once (max ${tot.conflictMax}); ${conflictStarts.length} conflicts, shortest gap ${gap === Infinity ? '-' : gap} ticks`);
  const ended = wars.filter((x) => x.end >= 0);
  let pause = Infinity;
  for (let n = 1; n < wars.length; n++) if (wars[n - 1].end >= 0) pause = Math.min(pause, wars[n].start - wars[n - 1].end);
  let peace = Infinity;
  const pairEnd = new Map();
  for (const x of wars) {
    if (pairEnd.has(x.pair)) peace = Math.min(peace, x.start - pairEnd.get(x.pair));
    if (x.end >= 0) pairEnd.set(x.pair, x.end);
  }
  check(pause >= SE.CONFLICT_GAP, `pause after a conflict ≥ ${SE.CONFLICT_GAP} ticks (min ${pause === Infinity ? '-' : pause})`);
  check(peace >= SE.CONFLICT_PEACE, `peace between the same two tribes ≥ ${SE.CONFLICT_PEACE} ticks (min ${peace === Infinity ? '-' : peace})`);
  const outcomes = ['held', 'taken', 'destroyed'].map((o) => `${ended.filter((x) => x.outcome === o).length} ${o}`).join(', ');
  if (neighboursAt < 0) {
    console.log('  conflicts: no two tribes ever were neighbours');
  } else {
    const span = Math.min(1000, civTicks - neighboursAt);
    const inWindow = wars.filter((x) => x.start >= neighboursAt && x.start < neighboursAt + 1000).length;
    console.log(`  conflicts: ${inWindow} in the ${span} ticks after two tribes became neighbours (+${neighboursAt}); outcomes of all: ${outcomes}`);
    check(wars.length >= 2, `≥ 2 conflicts over the whole run (${wars.length})`);
  }
  check(warNews.start === wars.length && warNews.end === ended.length,
    `news on every conflict: ${warNews.start} at the start of ${wars.length}, ${warNews.end} at the end of ${ended.length}`);
  let busiest = 0;
  for (let a = 0, b = 0; b < wars.length; b++) {
    while (wars[b].start - wars[a].start >= 1000) a++;
    busiest = Math.max(busiest, b - a + 1);
  }
  check(busiest <= 12, `≤ 12 conflicts in any 1000 ticks of the whole run (max ${busiest})`);
  const byLargest = wars.filter((x) => x.largest).length;
  console.log(`  conflicts started by the largest tribe: ${byLargest} of ${wars.length}${wars.length ? ` (${Math.round(100 * byLargest / wars.length)} %)` : ''}`);
  check(landBeforeIndustry < 0.5, `city tiles < 0.5 % of the land until the end of the Iron Age (max ${landBeforeIndustry.toFixed(2)} %)`);
  check(landMax <= 0.65, `city tiles ≤ 0.65 % of the land over the whole run (highest ${landMax.toFixed(2)} %, ${(100 * w.civ.cities.length / land).toFixed(2)} % at the end)`);
  const eraCheck = (t, lo, hi) => {
    const what = `cities at the end of the ${SE.TECH_NAMES[t]} ${lo}–${hi}`;
    if (eraCities[t] === undefined) console.log(`  CHECK n/a  ${what} (not reached)`);
    else check(eraCities[t] >= lo && eraCities[t] <= hi, `${what} (${eraCities[t]})`);
  };
  eraCheck(SE.Tech.Stone, 3, 10);
  eraCheck(SE.Tech.Iron, 8, 25);
  const eras = [];
  for (let tt = SE.Tech.Stone; tt < SE.TECH_COUNT; tt++) {
    if (eraAt[tt] === undefined) break;
    const until = eraAt[tt + 1] ?? civTicks;
    const per1000 = eraTicks[tt] ? (1000 * eraOutbreaks[tt] / eraTicks[tt]).toFixed(0) : '-';
    eras.push(`${SE.TECH_NAMES[tt]} ${until - eraAt[tt]}${eraAt[tt + 1] === undefined ? '+' : ''} ticks, ${per1000} epidemics/1000` +
      (eraLand[tt] !== undefined ? `, ${eraLand[tt].toFixed(2)} % land at its end` : ''));
  }
  console.log(`  eras: ${eras.join('; ')}`);
  const when = (ks) => `${ks.length}${ks.length ? ` (+${ks.join(", +")})` : ""}`;
  console.log(`  peoples: ${when(tribeCause.first)} first or lone, ${when(tribeCause.far)} far from the capital, ${when(tribeCause.water)} across water, ${when(tribeCause.split)} by split; at the end ${tribeSizes(w.civ)} cities each`);
  const industryAt = eraAt[SE.Tech.Industrial];
  console.log(`  discovery: ${voyage.log.join(', ') || 'nothing'}` +
    (voyage.held >= 0 && industryAt !== undefined ? `; Industrial age ${industryAt - voyage.held} ticks after the first hold` : '') +
    (voyage.colonies.length ? `; cities on the new continent ${voyage.colonies.join(', ')}` : ''));
  console.log(`  epidemics ${tot.outbreaks}; done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

for (const seed of seeds) probe(seed);
