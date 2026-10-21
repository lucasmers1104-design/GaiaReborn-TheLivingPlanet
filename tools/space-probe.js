/* =============================================================================
 * SimEarth 2.0 — space project probe
 * -----------------------------------------------------------------------------
 * Plays a planet like a greedy player to sentience (forced with a first city,
 * as the Monolith would, if it does not come by itself), then on until a city
 * reaches the Nanotech age, and measures the space project (src/spaceport.ts):
 * when it unlocks, where the site lies, the speed factor, each phase, pauses
 * and moves, and the build time in ticks and in minutes at each game speed.
 *
 *   node tools/space-probe.js [seed ...] [--epoch=random|youngEarth|today]
 *                             [--evolve=<ticks>] [--civ=<ticks>] [--nano] [--dino=comet|survive]
 *
 *     --evolve   most ticks of greedy evolution before sentience is forced (default 6000)
 *     --civ      most ticks after sentience to wait for Nanotech (default 6000)
 *     --nano     raise the largest city to Nanotech 50 ticks after sentience,
 *                as the player's city tool would (quick run)
 *     --dino     how the first birds' question is answered (default comet, so
 *                the mammals may wake; src/comet.ts)
 *
 * Standard: node tools/space-probe.js 12345 2024 99 (about 20 minutes per seed)
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
const seeds = args.length ? args.map(Number) : [12345];
const epoch = opt('epoch', 'random');
const evolveMax = Number(opt('evolve', 6000));
const civMax = Number(opt('civ', 6000));
const quick = process.argv.includes('--nano');
const dinoFate = opt('dino', 'comet');
/** Wall-clock ms per tick of the game speeds (app.ts SPEED_TICK_MS). */
const SPEEDS = { Langsam: 1000, Mittel: 400, Schnell: 150 };

/** App.advanceTimeScale, which lives in app.ts. */
function advanceScale(SE, w) {
  if (w.timeScale === SE.TimeScale.Geologic && w.totalBiomass > 0) w.timeScale = SE.TimeScale.Evolution;
  else if (w.timeScale === SE.TimeScale.Evolution && w.sentientClass !== SE.Life.None) w.timeScale = SE.TimeScale.Civilized;
  else if (w.timeScale === SE.TimeScale.Civilized) {
    for (let t = SE.Tech.Industrial; t < SE.TECH_COUNT; t++) if (w.techCounts[t] > 0) { w.timeScale = SE.TimeScale.Technology; break; }
  }
}

/** The densest land class able to think wakes on a free tile, as the Monolith would. */
function forceSentience(SE, w) {
  let best = -1;
  let bestD = 0;
  let cls = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) {
    if (!SE.cityGroundFits(w, i, SE.Life.None)) continue;
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

const minutes = (ticks) => Object.entries(SPEEDS).map(([n, ms]) => `${n} ${((ticks * ms) / 60000).toFixed(1)} min`).join(', ');

function probe(seed) {
  const s = makeSim(seed, epoch);
  const { SE, world: w, params } = s;
  const t0 = Date.now();
  s.evo.develop(w, params, 'cells');
  let t = 0;
  for (; t < evolveMax && w.sentientClass === SE.Life.None; t++) {
    if (w.dinoEra.fate === 'deciding') s.resolveDinoFate(dinoFate);
    s.tick();
    advanceScale(SE, w);
    if (w.ticks % 5 === 0) {
      s.evo.refresh(w, params, true);
      const ids = s.evo.availableIds().sort((a, b) => SE.evoNode(a).cost - SE.evoNode(b).cost);
      if (ids.length) s.evo.develop(w, params, ids[0]);
    }
  }
  const natural = w.sentientClass !== SE.Life.None;
  if (!natural && !forceSentience(SE, w)) { console.log(`seed ${seed}: no land class able to think — nothing to measure`); return; }
  console.log(`seed ${seed} (${epoch}): sentience ${natural ? 'natural' : 'forced'} at tick ${w.ticks}, ${SE.LIFE[w.sentientClass].id}`);

  const sp = w.space;
  let nanoAt = -1;
  let forced = false;
  const phaseAt = [];
  let paused = 0;
  let pauseNoSite = 0;
  let rateSum = 0;
  let rateN = 0;
  let lastNews = [];
  for (let k = 0; k < civMax + SE.SPACE_BUILD_TICKS * 3 && sp.progress < 1; k++) {
    if (quick && !forced && k >= 50 && w.civ.cities.length > 0) {
      const big = w.civ.cities.reduce((a, b) => (w.cityPop[b.tile] > w.cityPop[a.tile] ? b : a));
      w.tech[big.tile] = SE.Tech.Nanotech;
      forced = true;
    }
    s.tick();
    advanceScale(SE, w);
    lastNews = w.civ.news.filter((n) => n.space);
    for (const n of lastNews) console.log(`  tick ${w.ticks}: ${n.text}`);
    if (nanoAt < 0 && w.techCounts[SE.Tech.Nanotech] > 0) nanoAt = w.ticks;
    if (nanoAt < 0 && k >= civMax) break;
    if (sp.unlocked < 0) continue;
    const ph = SE.spacePhase(sp.progress);
    if (phaseAt[ph] === undefined) phaseAt[ph] = w.ticks;
    const pause = SE.spacePause(w);
    if (pause !== '') { paused++; if (pause === 'noSite') pauseNoSite++; continue; }
    rateSum += SE.spaceRate(w);
    rateN++;
  }
  if (sp.unlocked < 0) { console.log(`  no Nanotech city within ${civMax} ticks after sentience (${((Date.now() - t0) / 1000).toFixed(0)} s)`); return; }
  const build = (phaseAt[3] ?? w.ticks) - sp.unlocked;
  const nano = SE.nanotechCities(w);
  const site = sp.site;
  console.log(`  Nanotech at tick ${nanoAt}${forced ? ' (raised by the probe)' : ''}, unlocked ${sp.unlocked}, site ${site >= 0 ? `${site % SE.GRID_W}/${Math.floor(site / SE.GRID_W)}` : 'none'}, moves ${sp.moves}`);
  console.log(`  phases at ticks ${phaseAt.join(' / ')}; ready ${sp.progress >= 1 ? 'yes' : 'no'}; paused ${paused} ticks (no site ${pauseNoSite})`);
  console.log(`  Nanotech cities ${nano.length}, mean speed factor ${(rateN ? rateSum / rateN : 0).toFixed(2)}`);
  console.log(`  build ${build} ticks: ${minutes(build)}  (run ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (sp.progress >= 1) {
    const problem = SE.spaceLaunchProblem(w);
    console.log(`  launch: ${problem || 'allowed'}; launched ${SE.commitLaunch(w)}, again ${SE.commitLaunch(w)}`);
  }
}

for (const seed of seeds) probe(seed);
