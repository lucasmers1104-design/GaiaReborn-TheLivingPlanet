'use strict';
/*
 * Shared test harness. Loads the built bundle into this process's global scope
 * (the bootstrap in app.ts only starts when a document with #desktop exists,
 * so running the bundle here defines everything and starts nothing) and wires
 * the simulation systems together in the same order as App.tick.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let SE = null;

function loadSE() {
  if (SE) return SE;
  // SE_BUNDLE lets parallel work test its own build without touching simulation.js.
  const bundle = process.env.SE_BUNDLE || path.join(__dirname, '..', 'simulation.js');
  vm.runInThisContext(fs.readFileSync(bundle, 'utf8'), { filename: bundle });
  SE = globalThis.SE;
  if (!SE) throw new Error('simulation.js defined no SE namespace — run `npm run build`');
  return SE;
}

/**
 * A complete simulation without any UI on an epoch's planet (src/epochs.ts):
 * the app's own core (src/simcore.ts), ticked by its harness tick, which is
 * the order these tests were tuned to (no disasters, lexicon or time scales;
 * SimCore.tick is the app's full order). `s.core` is the SimCore.
 */
function makeSim(seed = 12345, epoch = 'random') {
  const SE = loadSE();
  const core = new SE.SimCore();
  const s = {
    SE, core,
    world: core.world, params: core.params, geo: core.geo, climate: core.climate, flora: core.flora, life: core.life,
    civ: core.civ, events: core.events, atmo: core.atmo, history: core.history, evo: core.evolution, hazards: core.hazards,
  };
  // Only the civilization's events reach the harness; disasters never start by themselves here (no hazardSink).
  SE.civEventSink = (k, x, y) => s.events.trigger(s.world, k, x, y);
  s.world.reset(seed, SE.OCEAN_FRACTION, epoch);
  SE.applyEpochParams(s.params, epoch);
  s.evo.refresh(s.world, s.params, true);

  s.tick = () => core.harnessTick();

  /**
   * Answer the dinosaurs' question for the player (src/comet.ts): 'survive'
   * or 'comet', which also lets the comet strike at once. The simulation
   * never answers it by itself. Returns whether a question stood.
   */
  s.resolveDinoFate = (choice) => {
    const w = s.world;
    if (!SE.chooseDinoFate(w, s.evo, choice)) return false;
    if (choice === 'comet') SE.applyComet(w, s.params, s.life, s.hazards, s.evo);
    return true;
  };

  /**
   * Play like a greedy player: every few ticks develop one available node,
   * chosen by `pick` (default: the cheapest). With `dinoFate`, the question
   * the first birds put is answered that way as soon as it stands; without,
   * it stays open and the era's bars hold. Returns the development order.
   */
  s.play = (maxTicks, pick, dinoFate) => {
    const order = [];
    for (let t = 0; t < maxTicks; t++) {
      // Answered before time runs on, as the app holds the world until it is.
      if (dinoFate && s.world.dinoEra.fate === 'deciding') s.resolveDinoFate(dinoFate);
      s.tick();
      if (t % 5 !== 0) continue;
      s.evo.refresh(s.world, s.params, true);
      const ids = s.evo.availableIds();
      if (ids.length === 0) continue;
      const id = pick ? pick(ids) : ids.sort((a, b) => SE.evoNode(a).cost - SE.evoNode(b).cost)[0];
      const r = s.evo.develop(s.world, s.params, id);
      if (!r.ok) throw new Error(`develop(${id}) failed although available: ${r.reason}`);
      order.push({ id, tick: s.world.ticks });
      if (s.world.evo.developed.size === SE.EVO_NODES.length) break;
    }
    return order;
  };

  return s;
}

/** Cheap fingerprint of a typed array, to prove "unchanged". */
function hash(arr) {
  let h = 2166136261;
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

module.exports = { loadSE, makeSim, hash };
