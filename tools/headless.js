/* =============================================================================
 * SimEarth 2.0 — headless probe
 * -----------------------------------------------------------------------------
 * Runs the simulation with no browser at all and prints what the planet turned
 * into. The tuning in this project is empirical — how much of a continent ends
 * up desert, how many rivers reach the sea, whether mountains survive erosion —
 * and none of that is visible from reading the code or from a unit test.
 *
 * It works because `tsc` emits one classic script in which every cross-file
 * reference goes through the `SE` namespace object, and the bootstrap at the
 * end of app.ts is guarded on `typeof document`. Running the bundle therefore
 * defines everything and starts nothing.
 *
 *   node tools/headless.js [ticks] [seed ...] [--life] [--map] [--track] [--timeline] [--biomes] [--epoch=<id>]
 *
 *     --life   play the evolution tree greedily (develop the cheapest
 *              available step every few ticks), so the planet grows a
 *              biosphere the way a player's planet does; reports plants,
 *              biomes and, per animal class, tiles, map icons and stages
 *     --map    print an ASCII relief map of the first planet
 *     --track  watch relief and drainage over a long run
 *     --timeline  after the report, list every developed tree step with its
 *              tick, calendar date and real date on Earth, and the ticks
 *              at which air O2 first reaches 1, 5, 10 and 15 %
 *     --biomes how coherent the habitats and landscapes are at ticks 800,
 *              1500, 2500, 3500, 4500 and the last one: boundary edges, lone
 *              tiles, small regions, area-weighted region size, unnatural
 *              neighbours, shares and the latitude profile against the
 *              targets of docs/biomes-spec.md §3.7/§3.8
 *     --dino=comet|survive  answer the first birds' question that way as
 *              soon as it stands (src/comet.ts); without it the question
 *              stays open and the dinosaurs' era holds the mammals back
 *     --epoch  start on an epoch's planet (random, youngEarth, today; see
 *              src/epochs.ts) with the Geosphere sliders it opens with
 *
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// SE_BUNDLE lets parallel work probe its own build without touching simulation.js.
const BUNDLE = process.env.SE_BUNDLE || path.join(__dirname, '..', 'simulation.js');

/**
 * Load into *this* realm's global scope, not a fresh `vm` context.
 *
 * This matters far more than it looks. Every cross-file reference in the bundle
 * is a property read off the `SE` object, and in a separate vm context those
 * reads do not get the inline caching they get in an ordinary global scope:
 * measured 111 ms/tick there against 8.7 ms/tick here, for byte-identical code
 * on the same planet. Timings from a vm context are therefore worthless as a
 * guide to what the browser does — a 13x penalty is easily mistaken for a
 * performance regression that does not exist.
 */
function loadBundle() {
  vm.runInThisContext(fs.readFileSync(BUNDLE, 'utf8'));
  if (!globalThis.SE) throw new Error('simulation.js defined no SE namespace — run `npm run build`');
  return globalThis.SE;
}

/**
 * Every system, wired as App wires them. Without the tree nothing ever lives:
 * life starts when the player develops the first cells, and the plants
 * follow step by step — so `--life` plays the tree greedily.
 */
/** Set from --epoch and --dino in main(). */
let EPOCH = 'random';
let DINO_FATE = '';

function makePlanet(SE, seed, withLife) {
  const core = new SE.SimCore();
  const p = { core, world: core.world, params: core.params, life: core.life, events: core.events, evo: core.evolution, hazards: core.hazards };
  SE.civEventSink = (k, x, y) => p.events.trigger(p.world, k, x, y);
  p.world.reset(seed, SE.OCEAN_FRACTION, EPOCH);
  SE.applyEpochParams(p.params, EPOCH);
  if (withLife) p.evo.develop(p.world, p.params, 'cells');
  return p;
}

/**
 * One tick of the app's core in the harness order the probe was tuned to
 * (SimCore.harnessTick: no disasters, lexicon or time scales, and here no
 * termite mounds), plus the time bookkeeping.
 */
function step(SE, p, withLife) {
  const { world, params } = p;
  // The app holds the world until the player answers; the probe answers as told.
  if (DINO_FATE && world.dinoEra.fate === 'deciding' && SE.chooseDinoFate(world, p.evo, DINO_FATE) && DINO_FATE === 'comet') {
    SE.applyComet(world, params, p.life, p.hazards, p.evo);
  }
  p.core.harnessTick(false);
  if (withLife && world.ticks % 5 === 0) {
    p.evo.refresh(world, params, true);
    const ids = p.evo.availableIds().sort((a, b) => SE.evoNode(a).cost - SE.evoNode(b).cost);
    if (ids.length) p.evo.develop(world, params, ids[0]);
  }
}

/** Drive one planet for `ticks`; `onTick` sees the world after every tick. */
function simulate(SE, seed, ticks, withLife, onTick) {
  const p = makePlanet(SE, seed, withLife);
  const started = Date.now();
  for (let t = 0; t < ticks; t++) {
    step(SE, p, withLife);
    if (onTick) onTick(p.world);
  }
  return { world: p.world, msPerTick: (Date.now() - started) / Math.max(1, ticks) };
}

function survey(SE, world) {
  const { TILE_COUNT, GRID_W } = SE;
  const s = {
    land: 0, moisture: 0, vegetation: 0,
    arid: 0, mid: 0, wet: 0,
    hills: 0, mountain: 0, peak: 0,
    river: 0, mouths: 0, orphans: 0, riparian: 0,
    dryRiver: 0, lake: 0,
  };

  for (let i = 0; i < TILE_COUNT; i++) {
    if (world.elevation[i] < 0) continue;
    s.land++;

    const m = world.moisture[i];
    s.moisture += m;
    s.vegetation += world.vegetation[i];
    if (m < 0.16) s.arid++;
    else if (m < 0.50) s.mid++;
    else s.wet++;

    const e = world.elevation[i];
    if (e > 0.30) s.hills++;
    if (e > 0.50) s.mountain++;
    if (e > 0.75) s.peak++;

    const down = world.riverDown[i];
    // Every land tile must have somewhere to send its water. This is the real
    // invariant the depression fill exists to guarantee.
    if (down < 0) s.orphans++;
    // Drainage is chosen on the *filled* surface, so a tile inside a basin
    // sends water toward ground that is higher on the raw terrain — that is
    // the lake surface, and it is correct, not a routing failure.
    else if (world.elevation[down] > e + 1e-4) s.lake++;

    if (world.riparian[i] > 0) s.riparian++;
    if (world.riverLevel[i] > 0) {
      s.river++;
      if (down >= 0 && world.elevation[down] < 0) s.mouths++;
      // The point of the whole feature: a river keeps its own tile green even
      // where the country around it is desert. Frozen ground is exempt — a
      // river under ice waters nothing, and should not.
      if (m < 0.22 && world.temperature[i] > 2) s.dryRiver++;
    }
  }
  return s;
}

/**
 * Share of land under each land biome — water zones are left out, since a
 * share "of land" that counted the oceans was simply wrong.
 */
function biomeLine(SE, world, land) {
  // Counted here rather than read from biomeCounts: Arctic covers sea ice too.
  const counts = new Array(SE.BIOME_COUNT).fill(0);
  for (let i = 0; i < SE.TILE_COUNT; i++) if (world.elevation[i] >= 0) counts[world.biome[i]]++;
  return SE.BIOME_NAMES
    .map((name, b) => [name, (counts[b] / land) * 100])
    .filter(([, share]) => share >= 0.5 && land > 0)
    .map(([name, share]) => `${name} ${share.toFixed(0)}%`)
    .join('  ');
}

/**
 * One line per living animal class: tiles held, summed density, map icons
 * and how many tiles stand at each sub-species stage. Shows at a glance which
 * classes dominate, which never make it onto the map and how far up its
 * ladder each lineage has climbed.
 */
function faunaLines(SE, world) {
  const markers = new Array(SE.LIFE_COUNT).fill(0);
  const herds = new SE.HerdLayer(true);
  herds.update(world, 0);
  for (const m of herds.markers) markers[m.c]++;
  const lines = [`    fauna     ${'class'.padEnd(15)} ${'tiles'.padStart(6)} ${'biomass'.padStart(8)} ${'icons'.padStart(6)}  stages 1..${SE.SUBSPECIES_PER_CLASS}`];
  for (let c = 1; c < SE.LIFE_COUNT; c++) {
    if (world.lifeCounts[c] === 0) continue;
    const stages = [];
    for (let s = 0; s < SE.SUBSPECIES_PER_CLASS; s++) stages.push(world.lifeStageCounts[c * SE.SUBSPECIES_PER_CLASS + s]);
    lines.push(`              ${SE.LIFE[c].id.padEnd(15)} ${String(world.lifeCounts[c]).padStart(6)} ` +
      `${world.lifeBiomass[c].toFixed(0).padStart(8)} ${String(markers[c]).padStart(6)}  ${stages.join('/')}`);
  }
  return lines;
}

/* ------------------------------------------------------------- biomes -- */

const BIOME_CHECKPOINTS = [800, 1500, 2500, 3500, 4500];

/**
 * How fragmented a per-tile field is over land. Boundary edges: share of
 * 4-neighbour land pairs with different values. Lone: tiles none of whose 8
 * neighbours shares their value. Outvoted: tiles where >= 5 of 8 neighbours
 * agree on another value. Regions: 4-connected areas of one value; weighted:
 * the region size an average land tile sits in.
 */
function patchiness(SE, world, field) {
  const W = SE.GRID_W;
  const H = SE.GRID_H;
  const water = (i) => world.elevation[i] < 0;
  let land = 0, lone = 0, outvoted = 0, pairs = 0, diff = 0;
  const tally = new Map();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = SE.idx(x, y);
    if (water(i)) continue;
    land++;
    let same = 0;
    tally.clear();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const ny = y + dy;
      if (ny < 0 || ny >= H) continue;
      const j = SE.idx(SE.wrapX(x + dx), ny);
      if (water(j)) continue;
      if (field[j] === field[i]) same++;
      tally.set(field[j], (tally.get(field[j]) || 0) + 1);
    }
    if (same === 0) lone++;
    let best = -1, bestN = 0;
    for (const [k, v] of tally) if (v > bestN) { bestN = v; best = k; }
    if (best !== field[i] && bestN >= 5) outvoted++;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const ny = y + dy;
      if (ny >= H) continue;
      const j = SE.idx(SE.wrapX(x + dx), ny);
      if (water(j)) continue;
      pairs++;
      if (field[j] !== field[i]) diff++;
    }
  }
  const seen = new Uint8Array(SE.TILE_COUNT);
  const q = new Int32Array(SE.TILE_COUNT);
  const sizes = [];
  for (let st = 0; st < SE.TILE_COUNT; st++) {
    if (seen[st] || water(st)) continue;
    let h = 0, t = 0;
    q[t++] = st;
    seen[st] = 1;
    while (h < t) {
      const i = q[h++];
      const x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ny = y + dy;
        if (ny < 0 || ny >= H) continue;
        const j = SE.idx(SE.wrapX(x + dx), ny);
        if (seen[j] || water(j) || field[j] !== field[st]) continue;
        seen[j] = 1;
        q[t++] = j;
      }
    }
    sizes.push(t);
  }
  return {
    land,
    boundary: (100 * diff) / Math.max(1, pairs),
    lone: (100 * lone) / Math.max(1, land),
    outvoted: (100 * outvoted) / Math.max(1, land),
    regions: sizes.length,
    tiny: sizes.filter((n) => n <= 3).length,
    weighted: sizes.reduce((a, n) => a + n * n, 0) / Math.max(1, land),
  };
}

/** 8-neighbour land pairs whose landscapes never border each other in nature. */
function unnaturalPairs(SE, world) {
  let n = 0;
  const kinds = new Map();
  for (let y = 0; y < SE.GRID_H; y++) for (let x = 0; x < SE.GRID_W; x++) {
    const i = SE.idx(x, y);
    if (world.elevation[i] < 0) continue;
    const a = world.landscape[i];
    for (const [dx, dy] of [[1, 0], [1, 1], [0, 1], [-1, 1]]) {
      const ny = y + dy;
      if (ny >= SE.GRID_H) continue;
      const j = SE.idx(SE.wrapX(x + dx), ny);
      if (world.elevation[j] < 0) continue;
      const b = world.landscape[j];
      if (!(SE.LANDSCAPE_CLASH[a] & (1 << b))) continue;
      n++;
      const key = [SE.LANDSCAPE_IDS[a], SE.LANDSCAPE_IDS[b]].sort().join('/');
      kinds.set(key, (kinds.get(key) || 0) + 1);
    }
  }
  return { n, kinds: [...kinds].sort((p, q) => q[1] - p[1]).map(([k, v]) => `${k} ${v}`).join(', ') };
}

function shares(names, counts, total) {
  return counts.map((c, k) => [names[k], c]).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1])
    .map(([nm, c]) => `${nm} ${((100 * c) / total).toFixed(0)}%`).join('  ');
}

/** Land tiles per value of `field` in the latitude band lo..hi (absolute degrees, both hemispheres). */
function bandCounts(SE, world, field, count, lo, hi) {
  const c = new Array(count).fill(0);
  for (let y = 0; y < SE.GRID_H; y++) {
    const l = Math.abs(SE.latitudeDeg(y));
    if (l < lo || l >= hi) continue;
    for (let x = 0; x < SE.GRID_W; x++) {
      const i = SE.idx(x, y);
      if (world.elevation[i] >= 0) c[field[i]]++;
    }
  }
  return c;
}

function biomeLines(SE, world) {
  const hab = patchiness(SE, world, world.biome);
  const lsc = patchiness(SE, world, world.landscape);
  const fmt = (m) => `boundary ${m.boundary.toFixed(1)}%  lone ${m.lone.toFixed(2)}%  outvoted ${m.outvoted.toFixed(1)}%  ` +
    `regions ${m.regions} (<=3: ${m.tiny})  weighted ${m.weighted.toFixed(0)}`;
  const bad = unnaturalPairs(SE, world);
  const habCounts = new Array(SE.BIOME_COUNT).fill(0);
  const lsCounts = new Array(SE.LANDSCAPE_COUNT).fill(0);
  // Plants the landscape does not show: cover >= 0.3 still drawn as rock, bare soil or lichen.
  let covered = 0, hidden = 0;
  const L = SE.Landscape;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    if (world.elevation[i] < 0) continue;
    habCounts[world.biome[i]]++;
    lsCounts[world.landscape[i]]++;
    if (world.vegetation[i] < 0.3) continue;
    covered++;
    const l = world.landscape[i];
    if (l === L.Rock || l === L.Barren || l === L.Lichen) hidden++;
  }
  const lines = [
    `  biomes @ tick ${world.ticks}  ${SE.formatEarthDate(world.absoluteYears)}  ${world.evo.developed.size} steps developed`,
    `    habitat    ${fmt(hab)}`,
    `    landscape  ${fmt(lsc)}`,
    `    unnatural neighbours ${bad.n}${bad.n ? ` (${bad.kinds})` : ''}`,
    `    hidden plants  ${covered ? ((100 * hidden) / covered).toFixed(1) : '0.0'}% of land with cover >= 0.3 is Fels/Rohboden/Flechten (${hidden} of ${covered})`,
    `    habitats   ${shares(SE.BIOME_NAMES, habCounts, hab.land)}`,
    `    landscapes ${shares(SE.LANDSCAPE_NAMES, lsCounts, lsc.land)}`,
  ];
  // Habitat leaders per 15° band, north to south, as the spec's baseline was taken.
  const bands = [];
  for (let lat = 90; lat > -90; lat -= 15) {
    const c = new Array(SE.BIOME_COUNT).fill(0);
    for (let y = 0; y < SE.GRID_H; y++) {
      const l = SE.latitudeDeg(y);
      if (l > lat || l <= lat - 15) continue;
      for (let x = 0; x < SE.GRID_W; x++) { const i = SE.idx(x, y); if (world.elevation[i] >= 0) c[world.biome[i]]++; }
    }
    const tot = c.reduce((a, v) => a + v, 0);
    const top = c.map((v, k) => [k, v]).sort((a, z) => z[1] - a[1]).slice(0, 2).filter(([, v]) => v > 0)
      .map(([k, v]) => `${SE.BIOME_NAMES[k]} ${((100 * v) / tot).toFixed(0)}`).join('/');
    bands.push(`${lat}..${lat - 15}: ${top || '-'}`);
  }
  lines.push(`    latitude   ${bands.join(' | ')}`);
  // The latitude targets of spec §3.8, on landscapes, both hemispheres together.
  const pct = (part, whole) => (whole ? `${((100 * part) / whole).toFixed(0)}%` : '-');
  const eq = bandCounts(SE, world, world.landscape, SE.LANDSCAPE_COUNT, 0, 10);
  const eqVeg = eq.reduce((a, v, k) => a + (SE.LANDSCAPE_LEVEL[k] >= 1 ? v : 0), 0);
  const sub = bandCounts(SE, world, world.landscape, SE.LANDSCAPE_COUNT, 15, 35);
  const subLand = sub.reduce((a, v) => a + v, 0);
  const mid = bandCounts(SE, world, world.landscape, SE.LANDSCAPE_COUNT, 40, 60);
  const midLand = mid.reduce((a, v) => a + v, 0);
  const pol = bandCounts(SE, world, world.landscape, SE.LANDSCAPE_COUNT, 60, 90);
  const polLand = pol.reduce((a, v) => a + v, 0);
  const top3 = (c) => shares(SE.LANDSCAPE_NAMES, c, c.reduce((a, v) => a + v, 0)).split('  ').slice(0, 3).join(', ');
  // Bergregenwald is rainforest of the tropical highlands (docs/hoehe-spec.md §6, E5).
  const rain = eq[L.Rainforest] + eq[L.Cloudforest];
  lines.push(`    zones      ±10°: Regenwald+Wald ${pct(rain + eq[L.Forest], eqVeg)} of vegetated (target >=40%; Regenwald ${pct(rain, eqVeg)}) — ${top3(eq)}`);
  lines.push(`               15-35°: Wüste+Halbwüste+Savanne ${pct(sub[L.Desert] + sub[L.Semidesert] + sub[L.Savanna], subLand)} (target >=40%) — ${top3(sub)}`);
  lines.push(`               40-60°: Wald+Steppe+Wiese ${pct(mid[L.Forest] + mid[L.Steppe] + mid[L.Meadow], midLand)} — ${top3(mid)}`);
  lines.push(`               >60°: Nadelwald+Tundra+Eis ${pct(pol[L.Taiga] + pol[L.Tundra] + pol[L.Ice], polLand)} — ${top3(pol)}`);
  return lines;
}

const O2_MARKS = [1, 5, 10, 15];

/** First tick at which the Earth calendar reaches a planet age. */
function calendarTick(SE, age) {
  let t = 0;
  for (let a = 0; a < age; t++) a += SE.yearsPerTickAt(a);
  return t;
}

/**
 * When each developed step arrived on the calendar against when it happened
 * on Earth. Deviation is relative to the real date: + came too early (an
 * older date), - too late. `target` is the tick the calendar reaches the
 * real date — what the balance aims for.
 */
function timelineLines(SE, world, o2Ticks) {
  const ma = (age) => SE.yearsAgo(age) / 1e6;
  const fmtMa = (v) => v.toFixed(1).padStart(8);
  const rows = [...world.evo.developed.entries()].sort((a, b) => a[1].tick - b[1].tick);
  const lines = [`    timeline  ${'step'.padEnd(16)} ${'tick'.padStart(5)} ${'game Ma'.padStart(8)} ${'Earth Ma'.padStart(8)} ${'dev'.padStart(6)} ${'target'.padStart(6)}`];
  for (const [id, rec] of rows) {
    const real = SE.EARTH_DATES_MA[id];
    const game = ma(rec.years);
    const dev = real === undefined ? '' : `${game >= real ? '+' : ''}${(((game - real) / real) * 100).toFixed(0)}%`;
    const target = real === undefined ? '' : String(calendarTick(SE, SE.PLANET_AGE - real * 1e6));
    lines.push(`              ${id.padEnd(16)} ${String(rec.tick).padStart(5)} ${fmtMa(game)} ${real === undefined ? '       ?' : fmtMa(real)} ` +
      `${dev.padStart(6)} ${target.padStart(6)}${rec.spontaneous ? '  (spontaneous)' : ''}`);
  }
  for (let k = 0; k < O2_MARKS.length; k++) {
    const t = o2Ticks[k];
    lines.push(`    O2 ${String(O2_MARKS[k]).padStart(2)} %   ${t === undefined ? 'not reached' : `tick ${String(t.tick).padStart(5)}  ${t.date}`}`);
  }
  return lines;
}

function report(SE, seed, ticks, withLife, withTimeline, withBiomes) {
  const o2Ticks = [];
  const biomeReports = [];
  const watch = (world) => {
    for (let k = o2Ticks.length; k < O2_MARKS.length && world.o2 >= O2_MARKS[k]; k++) {
      o2Ticks.push({ tick: world.ticks, date: SE.formatEarthDate(world.absoluteYears) });
    }
    if (withBiomes && (BIOME_CHECKPOINTS.includes(world.ticks) || world.ticks === ticks)) {
      biomeReports.push(...biomeLines(SE, world));
    }
  };
  const { world, msPerTick } = simulate(SE, seed, ticks, withLife, watch);
  const s = survey(SE, world);
  const pct = (n) => `${((n / s.land) * 100).toFixed(1)}%`;

  console.log(
    `seed ${String(seed).padStart(7)}  ${msPerTick.toFixed(1)} ms/tick  ` +
    `T=${world.globalTemp.toFixed(1)}C  O2=${world.o2.toFixed(1)}%  ` +
    `land ${((s.land / SE.TILE_COUNT) * 100).toFixed(0)}% of ${SE.TILE_COUNT}`);
  console.log(
    `    moisture  mean ${(s.moisture / s.land).toFixed(3)}   ` +
    `arid ${pct(s.arid)}  mid ${pct(s.mid)}  wet ${pct(s.wet)}`);
  console.log(
    `    relief    hills ${pct(s.hills)}  mountain ${pct(s.mountain)}  peak ${pct(s.peak)}`);
  console.log(
    `    rivers    ${pct(s.river)} of land, ${s.mouths} reach the sea, ` +
    `banks ${pct(s.riparian)}, lake surface ${pct(s.lake)}`);
  if (withLife) {
    console.log(`    plants    mean cover ${(s.vegetation / s.land).toFixed(3)}`);
    console.log(`    biomes    ${biomeLine(SE, world, s.land)}`);
    console.log(`    tree      ${world.evo.developed.size} of ${SE.EVO_NODES.length} steps developed, ${world.evo.ep.toFixed(0)} EP banked`);
    for (const line of faunaLines(SE, world)) console.log(line);
  }

  const problems = [];
  if (s.orphans > 0) problems.push(`${s.orphans} land tiles drain nowhere`);
  if (s.mouths === 0) problems.push('no river reaches the sea');
  if (s.dryRiver > 0) problems.push(`${s.dryRiver} unfrozen river tiles are too dry to grow grass`);
  if (s.river === 0) problems.push('no rivers at all');
  console.log(problems.length ? `    !! ${problems.join('; ')}` : '    ok');
  if (withTimeline) for (const line of timelineLines(SE, world, o2Ticks)) console.log(line);
  for (const line of biomeReports) console.log(line);
  return s;
}

/**
 * Watch relief and drainage over a long run.
 *
 * Erosion is the only force that ever lowers the crust, so without the uplift
 * belts a planet planes itself flat over geological time and takes the rivers'
 * headwaters with it. That failure is invisible in a short run — it needs tens
 * of thousands of ticks, which is a few minutes here and a whole evening in the
 * browser.
 */
function track(SE, seed, ticks, withLife) {
  const p = makePlanet(SE, seed, withLife);
  const world = p.world;

  const step = Math.max(1, Math.round(ticks / 8));
  let first = null;
  console.log(`seed ${seed}, tracking relief and drainage to ${ticks} ticks`);

  for (let t = 0; t <= ticks; t++) {
    if (t % step === 0) {
      const s = survey(SE, world);
      if (!first) first = s;
      const pct = (n) => ((n / s.land) * 100).toFixed(1).padStart(5);
      console.log(
        `  t=${String(t).padStart(6)}  mountain ${pct(s.mountain)}%  peak ${pct(s.peak)}%  ` +
        `rivers ${pct(s.river)}%  mouths ${String(s.mouths).padStart(3)}  ` +
        `arid ${pct(s.arid)}%`);
    }
    step(SE, p, withLife);
  }

  const last = survey(SE, world);
  const kept = last.mountain / Math.max(1, first.mountain);
  console.log(
    `  mountains retained ${(kept * 100).toFixed(0)}% of the starting extent — ` +
    `${kept >= 0.5 ? 'ok' : '!! uplift is not holding against erosion'}`);
  if (last.mouths < 20) console.log(`  !! only ${last.mouths} rivers still reach the sea`);
}

/** A quick look at the terrain, to check ranges are chains and not blobs. */
function asciiMap(SE, world, x0, y0, w, h) {
  const lines = [];
  for (let y = y0; y < y0 + h; y++) {
    let row = '';
    for (let x = x0; x < x0 + w; x++) {
      const i = SE.idx(SE.wrapX(x), SE.clampY(y));
      const e = world.elevation[i];
      if (e < 0) row += ' ';
      else if (world.riverLevel[i] > 0) row += 'R';
      else if (e > 0.75) row += '#';
      else if (e > 0.50) row += '^';
      else if (e > 0.30) row += '-';
      else row += '.';
    }
    lines.push(row);
  }
  return lines.join('\n');
}

function main() {
  const SE = loadBundle();
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));

  const ticks = Number(args[0] || 800);
  const seeds = args.slice(1).map(Number);
  const planets = seeds.length ? seeds : [12345, 777, 42];
  const withLife = flags.has('--life');
  const dinoFlag = [...flags].find((f) => f.startsWith('--dino='));
  if (dinoFlag) {
    DINO_FATE = dinoFlag.slice('--dino='.length);
    if (DINO_FATE !== 'comet' && DINO_FATE !== 'survive') throw new Error(`--dino must be comet or survive, not ${DINO_FATE}`);
  }
  const epochFlag = [...flags].find((f) => f.startsWith('--epoch='));
  if (epochFlag) {
    EPOCH = epochFlag.slice('--epoch='.length);
    if (!SE.isEpochId(EPOCH)) throw new Error(`unknown epoch ${EPOCH}: ${SE.EPOCHS.map((e) => e.id).join(', ')}`);
  }

  console.log(
    `grid ${SE.GRID_W}x${SE.GRID_H} = ${SE.TILE_COUNT} tiles, ${ticks} ticks` +
    `${withLife ? ', evolution tree played greedily' : ''}${EPOCH !== 'random' ? `, epoch ${EPOCH}` : ''}\n`);

  if (flags.has('--track')) {
    for (const seed of planets) track(SE, seed, ticks, withLife);
    return;
  }

  for (const seed of planets) report(SE, seed, ticks, withLife, flags.has('--timeline'), flags.has('--biomes'));

  if (flags.has('--map')) {
    const { world } = simulate(SE, planets[0], ticks, withLife);
    console.log(`\n  ' ' sea   . lowland   - hills   ^ mountain   # peak   R river\n`);
    console.log(asciiMap(SE, world, 40, 26, 110, 46));
  }
}

main();
