/* =============================================================================
 * Gaia Reborn — trailer: the dinosaurs' world (tmp/trailer/worlds/dino.save)
 * -----------------------------------------------------------------------------
 * Plays today's Earth as an eager player would (the cheapest step every 5
 * ticks, as tools/comet-probe.js) until the first birds put the dinosaurs'
 * question, then lets dinosaurs settle round the Gulf of Mexico as the
 * placement tool would (LifeSystem.seed, only where habitable): the natural
 * run leaves few, far from Chicxulub. All news counts as shown, so no card
 * opens on load. About 8 minutes.
 *
 *   node tools/trailer/dino-world.js [seed]   (default 12345)
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const { makeSim } = require(path.join(ROOT, 'tests', 'helpers.js'));
/** Where the herds settle: the camera of shot 08-dino-fall, ± half its view in tiles. */
const GULF = { x: 62, y: 50, dx: 28, dy: 14 };

(async () => {
  const s = makeSim(Number(process.argv[2] || 12345), 'today');
  const { SE, world: w } = s;
  s.evo.develop(w, s.params, 'cells');
  for (let t = 0; t < 14000 && w.dinoEra.fate !== 'deciding'; t++) {
    s.tick();
    // What the app's tick adds: the lexicon and the time scale.
    s.core.fauna.step(w);
    if (w.timeScale === SE.TimeScale.Geologic && w.totalBiomass > 0) w.timeScale = SE.TimeScale.Evolution;
    if (t % 5 !== 0) continue;
    s.evo.refresh(w, s.params, true);
    const ids = s.evo.availableIds().sort((a, b) => SE.evoNode(a).cost - SE.evoNode(b).cost);
    if (ids.length) s.evo.develop(w, s.params, ids[0]);
  }
  if (w.dinoEra.fate !== 'deciding') throw new Error('the birds never came');

  // The rungs this planet's dinosaurs reached and kept: sauropods, hadrosaurs, ankylosaurs, megalosaurs, stegosaurs.
  const L = SE.LIFE_COUNT;
  const D = SE.Life.Dinosaur;
  let top = 0;
  for (let i = 0; i < SE.TILE_COUNT; i++) if (w.lifeDensity[i * L + D] > 0) top = Math.max(top, w.lifeStage[i * L + D]);
  const mix = [2, 3, 4, 5, 6].filter((k) => k <= top && !SE.stageGone(w, D, k));
  let placed = 0;
  for (let y = GULF.y - GULF.dy; y <= GULF.y + GULF.dy; y++) {
    for (let x = GULF.x - GULF.dx; x <= GULF.x + GULF.dx; x++) {
      const i = SE.idx(SE.wrapX(x), y);
      if (w.isWater(i) || s.life.habitabilityProblem(w, s.params, i, D)) continue;
      if (SE.LifeSystem.seed(w, D, SE.wrapX(x), y, 0.35)) {
        w.lifeStage[i * L + D] = mix[(x * 7 + y * 13 + ((x * y) >> 2)) % mix.length];
        placed++;
      }
    }
  }
  for (let t = 0; t < 20; t++) {
    s.tick();
    s.core.fauna.step(w);
  }
  w.refreshDerived();
  for (const e of w.evo.chronicle) w.evo.reported.add(e.key);

  const dir = path.join(ROOT, 'tmp', 'trailer', 'worlds');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'dino.save'), await SE.SaveSystem.encode(s.core.serialize()));
  console.log(`dino.save: tick ${w.ticks}, ${placed} dinosaur tiles placed round the Gulf, fate ${w.dinoEra.fate}`);
})().catch((e) => { console.error(`dino-world: ${e.message}`); process.exit(1); });
