/* =============================================================================
 * SimEarth 2.0 — smoke and steam, shared by every family
 * -----------------------------------------------------------------------------
 * A small smoke puff (omens, a resting volcano, later fires) and a white
 * steam cloud where lava meets the sea. Both grow and then dissolve through
 * an ordered dither — the map never fades anything with transparency.
 * Light from the upper left; no hard outline, a light upper-left edge.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');
const fx = require('./kit');

const SMOKE = ['rock2', 'rock3', 'rock4', 'white0'];
const STEAM = ['ice2', 'ice3', 'ice4', 'white0'];

function smokePuff(f) {
  const t = new k.Tex(8, 8);
  // The last frame stays round and thins out: grown to the box edges its 50 % dither read as a checker square.
  const r = [1.7, 2.5, 3.1, 2.9][f];
  const puffs = [{ x: 4.2, y: 4.4, r }];
  if (f >= 2) puffs.push({ x: 3.2, y: 3.4, r: r * 0.7 });
  fx.billow(t, puffs, SMOKE);
  return fx.dissolve(t, f === 3 ? 0.6 : 0);
}

function steamPuff(f) {
  const t = new k.Tex(16, 16);
  const g = [0.45, 0.7, 0.88, 1][f];
  // A flat-bottomed heap of round billows, the larger ones low.
  fx.billow(t, [
    { x: 8, y: 10.6, r: 4.4 * g }, { x: 4.6, y: 11, r: 3.2 * g }, { x: 11.6, y: 10.6, r: 3.4 * g },
    { x: 6.4, y: 7, r: 3.2 * g }, { x: 9.8, y: 6.4, r: 3.4 * g },
  ], STEAM);
  return fx.dissolve(t, [0, 0, 0.3, 0.6][f]);
}

module.exports = { sprites: { smoke_puff: smokePuff, steam_puff: steamPuff }, textures: {} };
