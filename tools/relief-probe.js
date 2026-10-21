/* =============================================================================
 * SimEarth 2.0 — relief probe: the height task's acceptance figures
 * -----------------------------------------------------------------------------
 * Plays planets headless with the evolution tree taken greedily (as
 * tools/headless.js --life does) and prints, at fixed ticks, what
 * docs/hoehe-spec.md §4 measures: hypsometry, mountain belts by type, where
 * bare rock lies, tree line and snow, the rain shadow, and the cost of the
 * vertical systems per tick. Lines starting with CHECK carry a target.
 *
 *   node tools/relief-probe.js [ticks] [seed ...] [--epoch random|youngEarth|today] [--at t1,t2,...]
 *
 * Defaults: 4870 ticks (today), seeds 777 2718 4242, epoch random. Set
 * SE_BUNDLE to probe a build other than simulation.js. Coherence of the
 * landscapes is measured by `node tools/headless.js --life --biomes`.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BUNDLE = process.env.SE_BUNDLE || path.join(__dirname, '..', 'simulation.js');
const DEFAULT_AT = [1, 400, 1500, 2500, 3500, 4500];
/** A Rock tile counts as bare in the lowland once the planet is older than this (spec §4: from 1 Ga on). */
const YOUNG_EARTH_YEARS = 3.6e9;
/** Hazard scars that leave fresh rock (docs/ereignisse-spec.md): Basalt, Vent, Crater — by name, read at load. */
const FRESH_SCARS = ['Basalt', 'Vent', 'Crater'];

function loadSE() {
  vm.runInThisContext(fs.readFileSync(BUNDLE, 'utf8'), { filename: BUNDLE });
  if (!globalThis.SE) throw new Error('no SE namespace — build first');
  return globalThis.SE;
}

function makePlanet(SE, seed, epoch) {
  const p = {
    world: new SE.WorldState(), params: new SE.ModelParams(), geo: new SE.GeoSystem(),
    climate: new SE.ClimateSystem(), flora: new SE.FloraSystem(), life: new SE.LifeSystem(),
    civ: new SE.CivSystem(), events: new SE.EventSystem(), atmo: new SE.AtmosphereSystem(),
  };
  p.evo = new SE.EvolutionSystem(p.life, p.flora);
  SE.civEventSink = (k, x, y) => p.events.trigger(p.world, k, x, y);
  p.world.reset(seed, SE.OCEAN_FRACTION, epoch);
  if (SE.applyEpochParams) SE.applyEpochParams(p.params, epoch);
  p.evo.develop(p.world, p.params, 'cells');
  return p;
}

const T = {};
function timed(name, fn) {
  const t = process.hrtime.bigint();
  fn();
  T[name] = (T[name] || 0) + Number(process.hrtime.bigint() - t) / 1e6;
}

function step(SE, p) {
  const { world, params } = p;
  timed('geo', () => p.geo.step(world, params));
  timed('events', () => p.events.step(world, params));
  timed('river', () => SE.RiverSystem.maybeRebuild(world));
  timed('climate', () => p.climate.step(world, params));
  timed('flora', () => p.flora.step(world, params));
  timed('biome', () => SE.BiomeSystem.step(world));
  timed('other', () => {
    p.life.stepLife(world, params, p.atmo);
    p.evo.step(world, params);
    p.civ.step(world, params, p.atmo);
    p.atmo.step(world, params);
  });
  SE.regenOmega(world);
  world.ticks++;
  world.absoluteYears += world.yearsPerTick;
  world.scaleYears += world.yearsPerTick;
  if (world.ticks % 5 === 0) {
    p.evo.refresh(world, params, true);
    const ids = p.evo.availableIds().sort((a, b) => SE.evoNode(a).cost - SE.evoNode(b).cost);
    if (ids.length) p.evo.develop(world, params, ids[0]);
  }
}

const median = (a) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const quantile = (a, q) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
};
const pct = (n, d) => `${d ? ((100 * n) / d).toFixed(1) : '-'}%`;

/** Connected belt runs (by default uplift > 0 on land), 8-neighbour; returns the extent of each in tiles. */
function beltExtents(SE, w, inBelt = (i) => w.uplift[i] > 0 && w.elevation[i] >= 0) {
  const { GRID_W, GRID_H, TILE_COUNT } = SE;
  const seen = new Uint8Array(TILE_COUNT);
  const out = [];
  const stack = [];
  for (let s = 0; s < TILE_COUNT; s++) {
    if (seen[s] || !inBelt(s)) continue;
    seen[s] = 1;
    stack.push(s);
    let minY = GRID_H, maxY = 0, n = 0;
    const xs = new Set();
    while (stack.length) {
      const i = stack.pop();
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      n++;
      xs.add(x);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= GRID_H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const j = ny * GRID_W + SE.wrapX(x + dx);
          if (!seen[j] && inBelt(j)) { seen[j] = 1; stack.push(j); }
        }
      }
    }
    out.push({ tiles: n, extent: Math.max(xs.size, maxY - minY + 1) });
  }
  return out;
}

/**
 * Crest lines of the mountain ranges: land tiles of a fold belt or coastal
 * range (upliftKind 1 or 2) at 0.2 (900 m) or higher that stand above both
 * neighbours along at least two of the four axes (E-W, N-S, both diagonals).
 * A range is an 8-connected run of them, its length the tile count. Returns
 * the lengths, longest first. tests/tectonics.test.js uses the same definition.
 */
function crestRanges(SE, w) {
  const { GRID_W, GRID_H, TILE_COUNT } = SE;
  const e = w.elevation;
  const at = (x, y) => (y < 0 || y >= GRID_H ? -9 : e[y * GRID_W + SE.wrapX(x)]);
  const crest = (i) => {
    const k = w.upliftKind ? w.upliftKind[i] : 0;
    if (e[i] < 0.2 || (k !== 1 && k !== 2)) return false;
    const x = i % GRID_W;
    const y = (i / GRID_W) | 0;
    let axes = 0;
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) if (e[i] > at(x + dx, y + dy) && e[i] > at(x - dx, y - dy)) axes++;
    return axes >= 2;
  };
  const mask = new Uint8Array(TILE_COUNT);
  for (let i = 0; i < TILE_COUNT; i++) if (crest(i)) mask[i] = 1;
  return beltExtents(SE, w, (i) => mask[i] === 1).map((r) => r.tiles).sort((a, b) => b - a);
}

function report(SE, w) {
  const { GRID_W, GRID_H, TILE_COUNT, ELEVATION_KM: KM } = SE;
  const L = SE.Landscape;
  const e = w.elevation;
  const scar = w.hazards && w.hazards.scar;
  const fresh = new Set(FRESH_SCARS.map((n) => SE.ScarKind && SE.ScarKind[n]).filter((v) => v !== undefined));
  const zones = w.landscapeZone;
  // Rock belongs to the rock belt (spec 3.7, case 2); builds before it have only the old flags.
  const high = SE.ZONE_ROCKBELT !== undefined ? SE.ZONE_ROCKBELT | SE.ZONE_SNOW : SE.ZONE_TREELINE | SE.ZONE_SNOW;

  let land = 0, over1 = 0, over2 = 0, over3 = 0, maxE = 0;
  let rock = 0, rockHigh = 0, rockFresh = 0, rockLow = 0, snow = 0, alpine = 0, cloud = 0, ice = 0;
  const kinds = new Array(8).fill(0);
  for (let i = 0; i < TILE_COUNT; i++) {
    if (e[i] < 0) continue;
    land++;
    const h = e[i] * KM;
    if (h > 1) over1++;
    if (h > 2) over2++;
    if (h > 3) over3++;
    if (e[i] > maxE) maxE = e[i];
    kinds[w.upliftKind ? w.upliftKind[i] : 0]++;
    const ls = w.landscape[i];
    if (ls === L.Snow) snow++;
    if (ls === L.Ice) ice++;
    if (L.Alpine !== undefined && ls === L.Alpine) alpine++;
    if (L.Cloudforest !== undefined && ls === L.Cloudforest) cloud++;
    if (ls !== L.Rock) continue;
    rock++;
    if (zones[i] !== SE.ZONE_NONE && (zones[i] & high)) rockHigh++;
    else if (scar && fresh.has(scar[i])) rockFresh++;
    else rockLow++;
  }
  const belts = beltExtents(SE, w);
  const long = belts.filter((b) => b.extent >= 15).length;

  console.log(`  tick ${w.ticks}  ${SE.formatEarthDate(w.absoluteYears)}  land ${land}`);
  console.log(`    relief    >1 km ${pct(over1, land)}  >2 km ${pct(over2, land)}  >3 km ${pct(over3, land)}  max ${(maxE * KM).toFixed(2)} km`);
  console.log(`    belts     ${belts.length} runs, ${long} at least 15 tiles long; land by type none/fold/arc/islandArc/hotspot ${kinds.slice(0, 5).join('/')}`);
  if (w.upliftKind) {
    const ranges = crestRanges(SE, w);
    const typed = beltExtents(SE, w, (i) => (w.upliftKind[i] === 1 || w.upliftKind[i] === 2) && e[i] >= 0);
    let fossil = 0;
    for (let i = 0; i < TILE_COUNT; i++) if (w.upliftKind[i] === 1 && w.uplift[i] === 0 && e[i] >= 0) fossil++;
    console.log(`    ranges    ${typed.length} typed runs, ${typed.filter((b) => b.extent >= 15).length} at least 15 tiles long, ${fossil} fossil fold tiles; crest lines longest ${ranges.slice(0, 5).join(' ')}`);
    console.log(`CHECK ranges  ${ranges.filter((n) => n >= 25).length} crest lines of at least 25 tiles (target >= 3)`);
  }
  console.log(`    rock      ${pct(rock, land)} of land: high ${rockHigh}, fresh ${rockFresh}, elsewhere ${rockLow} (${pct(rockLow, land)})`);
  console.log(`    belts     snow ${pct(snow, land)}  alpine ${pct(alpine, land)}  cloud forest ${pct(cloud, land)}`);
  if (w.ticks <= 1) console.log(`CHECK young-earth-rock  ${pct(rock, land)} of land is rock, ${pct(rock + ice + snow, land)} with ice and snow (target >= 90% with ice)`);
  console.log(`CHECK snow  ${pct(snow, land)} of land is summit snow (target >= 0.5% today)`);
  if (w.absoluteYears >= YOUNG_EARTH_YEARS) {
    console.log(`CHECK rock-elsewhere   ${pct(rockLow, land)} (target <= 0.5%)  ${rockLow / land <= 0.005 ? 'ok' : 'FAIL'}`);
  }

  // Tree line: the 10th percentile elevation of land above it, per band.
  for (const [lo, hi] of [[0, 15], [40, 50]]) {
    const hs = [];
    for (let y = 0; y < GRID_H; y++) {
      const lat = Math.abs(SE.latitudeDeg(y));
      if (lat < lo || lat >= hi) continue;
      for (let x = 0; x < GRID_W; x++) {
        const i = y * GRID_W + x;
        if (e[i] >= 0 && zones[i] !== SE.ZONE_NONE && (zones[i] & SE.ZONE_TREELINE)) hs.push(e[i] * KM);
      }
    }
    const target = lo === 0 ? '3.0-4.0' : '1.7-2.4';
    console.log(`CHECK treeline ${lo}-${hi}°  ${hs.length ? quantile(hs, 0.1).toFixed(2) : '-'} km over ${hs.length} tiles (target ${target} km)`);
    // Spec §4 "Median der untersten alpinen Kachel": the alpine tiles on the tree line itself, i.e. next to
    // forest-belt mountain tiles (not next to the lowland, where the mountain threshold makes the edge).
    if (SE.ZONE_MOUNTAIN === undefined) continue;
    const edge = [];
    const edgeRead = [];
    for (let y = 0; y < GRID_H; y++) {
      const lat = Math.abs(SE.latitudeDeg(y));
      if (lat < lo || lat >= hi) continue;
      for (let x = 0; x < GRID_W; x++) {
        const i = y * GRID_W + x;
        if (e[i] < 0 || zones[i] === SE.ZONE_NONE || !(zones[i] & SE.ZONE_TREELINE)) continue;
        let onLine = false;
        for (let dy = -1; dy <= 1 && !onLine; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= GRID_H) continue;
          for (let dx = -1; dx <= 1 && !onLine; dx++) {
            const z = zones[ny * GRID_W + SE.wrapX(x + dx)];
            onLine = z !== SE.ZONE_NONE && e[ny * GRID_W + SE.wrapX(x + dx)] >= 0 && (z & SE.ZONE_MOUNTAIN) !== 0 && !(z & SE.ZONE_TREELINE);
          }
        }
        if (!onLine) continue;
        edge.push(e[i] * KM);
        // The height the landscape reads the belts at: the tile's 3×3 land mean (src/succession.ts).
        let sum = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= GRID_H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const v = e[ny * GRID_W + SE.wrapX(x + dx)];
            if (v >= 0) { sum += v; n++; }
          }
        }
        edgeRead.push((sum / n) * KM);
      }
    }
    console.log(`CHECK treeline-edge ${lo}-${hi}°  median ${edge.length ? median(edge).toFixed(2) : '-'} km (${edge.length ? median(edgeRead).toFixed(2) : '-'} km as the landscape reads it, 3×3 mean) over ${edge.length} tiles on the tree line (target ${target} km)`);
  }

  // Equator (spec E5): rainforest and cloud forest lead the land within ±10°.
  const eq = new Array(SE.LANDSCAPE_COUNT).fill(0);
  let eqLand = 0, eqTropical = 0, eqBroadleaf = 0;
  for (let y = 0; y < GRID_H; y++) {
    if (Math.abs(SE.latitudeDeg(y)) >= 10) continue;
    for (let x = 0; x < GRID_W; x++) {
      const i = y * GRID_W + x;
      if (e[i] < 0) continue;
      eqLand++;
      eq[w.landscape[i]]++;
      if (zones[i] !== SE.ZONE_NONE && (zones[i] & 7) === 4) eqTropical++;
      if (w.flora[i] & (1 << SE.Flora.Broadleaf)) eqBroadleaf++;
    }
  }
  const rainforest = eq[L.Rainforest] + (L.Cloudforest !== undefined ? eq[L.Cloudforest] : 0);
  let rival = -1;
  for (let k = 0; k < eq.length; k++) {
    if (k !== L.Rainforest && k !== L.Cloudforest && (rival < 0 || eq[k] > eq[rival])) rival = k;
  }
  console.log(`CHECK equator  rainforest+cloud forest ${pct(rainforest, eqLand)} of land within ±10° (cloud forest ${pct(L.Cloudforest !== undefined ? eq[L.Cloudforest] : 0, eqLand)}); next ${SE.LANDSCAPE_IDS[rival]} ${pct(eq[rival], eqLand)} (target: dominant)  ${rainforest > eq[rival] ? 'ok' : 'FAIL'}; tropical class ${pct(eqTropical, eqLand)}, broadleaf on ${pct(eqBroadleaf, eqLand)}`);

  // Rain shadow across crests of 2 km and more, 3 tiles up- and downwind.
  const cls = (v) => { let c = 0; while (c < SE.MOISTURE_BOUNDS.length && v >= SE.MOISTURE_BOUNDS[c]) c++; return c; };
  const ratio = [];
  let drier = 0, crests = 0, woodUp = 0, woodLee = 0, openUp = 0, openLee = 0;
  const open = new Set([L.Desert, L.Semidesert, L.Steppe, L.Savanna]);
  for (let y = 0; y < GRID_H; y++) {
    const wd = SE.windDirection(y);
    for (let x = 0; x < GRID_W; x++) {
      const i = y * GRID_W + x;
      if (e[i] * KM < 2) continue;
      if (e[y * GRID_W + SE.wrapX(x - 1)] > e[i] || e[y * GRID_W + SE.wrapX(x + 1)] > e[i]) continue;
      const up = y * GRID_W + SE.wrapX(x - 3 * wd);
      const dn = y * GRID_W + SE.wrapX(x + 3 * wd);
      if (e[up] < 0 || e[dn] < 0) continue;
      crests++;
      ratio.push(w.moisture[dn] / Math.max(1e-3, w.moisture[up]));
      if (cls(w.moisture[dn]) < cls(w.moisture[up])) drier++;
      if (SE.LANDSCAPE_LEVEL[w.landscape[up]] >= 3) woodUp++;
      if (SE.LANDSCAPE_LEVEL[w.landscape[dn]] >= 3) woodLee++;
      if (open.has(w.landscape[up])) openUp++;
      if (open.has(w.landscape[dn])) openLee++;
    }
  }
  console.log(`CHECK rain-shadow  ${crests} crests >= 2 km; lee/windward ${median(ratio).toFixed(2)}; lee a class drier in ${pct(drier, crests)} (target >= 70%); woody windward ${woodUp}, lee ${woodLee}; dry open windward ${openUp}, lee ${openLee}`);
}

function main() {
  const argv = process.argv.slice(2);
  const flag = (name) => { const k = argv.indexOf(name); return k >= 0 ? argv.splice(k, 2)[1] : null; };
  const epoch = flag('--epoch') || 'random';
  const atArg = flag('--at');
  const nums = argv.map(Number).filter((v) => Number.isFinite(v));
  const ticks = nums.length ? nums[0] : 4870;
  const seeds = nums.length > 1 ? nums.slice(1) : [777, 2718, 4242];
  const at = new Set((atArg ? atArg.split(',').map(Number) : DEFAULT_AT).concat([ticks]));
  const SE = loadSE();
  console.log(`relief probe  ${path.basename(BUNDLE)}  epoch ${epoch}  ${ticks} ticks  seeds ${seeds.join(' ')}`);
  for (const seed of seeds) {
    console.log(`seed ${seed}`);
    for (const k of Object.keys(T)) delete T[k];
    const p = makePlanet(SE, seed, epoch);
    for (let t = 1; t <= ticks; t++) {
      step(SE, p);
      if (at.has(t)) report(SE, p.world);
    }
    console.log('  ms/tick  ' + Object.entries(T).map(([k, v]) => `${k} ${(v / ticks).toFixed(2)}`).join('  '));
  }
}

main();
