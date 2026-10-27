/* =============================================================================
 * Gaia Reborn — the trailer's shots
 * -----------------------------------------------------------------------------
 * Every shot tools/trailer-record.js records, in cut order: a stretch of a film
 * (intro, launch), or a scene in the game with its world, camera and what
 * happens frame by frame (the fields: setup() and each() in the recorder).
 * The scenes play the real game; where a shot steers it (a player's tool, an
 * evolution step, the dinosaurs' fate, a whale put in view) the comment says
 * so. Worlds: tmp/perf/civ.save (node tools/perf-bench.js saves) and
 * tmp/trailer/worlds/dino.save (node tools/trailer/dino-world.js).
 * ========================================================================== */
'use strict';

const { CSS_UI, CSS_CLEAN } = require('./page');

const CIV = 'tmp/perf/civ.save';

/* ------------------------------------------------------ life takes Africa -- */

/** Seed 60 played as _preview.js does to tick 700 (cells … freshwater algae): Africa is still bare rock and sand. No notes, no magic. */
const AFRICA_THEN = `app.notifier.push = () => {};
  app.notifier.message = () => {};
  window.__greedy = () => {
    const w = app.world;
    app.tick();
    if (w.ticks % 5 !== 0) return;
    app.evolution.refresh(w, app.params, true);
    const ids = app.evolution.availableIds().sort((a, b) => SE.evoNode(a).cost - SE.evoNode(b).cost);
    if (ids.length) app.developNode(ids[0]);
  };
  app.developNode('cells');
  while (app.world.ticks < 700) __greedy();
  v.markDirty();`;

/**
 * Six ticks a frame. Land life starts in the Amazon on its own, so the player steps in: each plant step arises on
 * schedule (developer mode only for the instant of the call, so the top bar never shows it) and the player plants the
 * group along Africa's coasts, rivers and interior with the game's plant tool (5×5 brush, suitable tiles only).
 */
const AFRICA_ACT = `const K = 6;
  const F = SE.Flora;
  const dev = (id) => { SE.devMode.on = true; app.developNode(id); SE.devMode.on = false; };
  const plant = (g, p) => {
    app.world.omega = SE.OMEGA_MAX;
    const cmd = { type: 'plant', flora: g, clearing: false, x: p[0], y: p[1] };
    if (!app.sim.view.check(cmd)) app.act(cmd);
  };
  const C = [[130,59],[125,60],[118,58],[135,61],[134,64],[136,68],[155,68],[156,66],[152,78],[149,85],[141,88],[162,76],[115,53]];
  const R = [[142,64],[128,55],[151,53],[149,75],[151,65],[150,44],[137,62],[146,70],[133,58],[154,60]];
  const W = [[141,64],[145,63],[144,66],[133,61],[137,66],[150,67],[127,59],[155,71]];
  const I = [[139,55],[154,66],[146,78],[156,58],[130,55],[148,72]];
  const S = [[139,55],[154,66],[146,78],[156,58],[130,55],[148,72],[124,56],[143,58]];
  const B = [[141,64],[145,63],[144,66],[136,63],[148,62]];
  const at = (from, every, list, g) => { const k = (f - from) / every; if (k >= 0 && k < list.length && k === Math.floor(k)) plant(g, list[k]); };
  if (f === 4) dev('landPlants');
  at(6, 4, C, F.LandPlants);
  if (f === 50) { dev('mosses'); dev('vascular'); }
  at(56, 4, R, F.Vascular);
  at(58, 8, C.slice(0, 5), F.Mosses);
  if (f === 90) { dev('clubmosses'); dev('ferns'); dev('firstTrees'); }
  at(96, 4, W, F.FirstTrees);
  at(98, 4, W, F.Ferns);
  if (f === 125) { dev('seedPlants'); dev('conifers'); }
  at(128, 4, I, F.SeedPlants);
  if (f === 150) dev('flowering');
  at(152, 3, S, F.Flowering);
  if (f === 172) { dev('grasses'); dev('broadleaf'); }
  at(176, 4, S, F.Grasses);
  at(178, 4, B, F.Broadleaf);
  for (let k = 0; k < K; k++) app.tick();`;

/** The whole of Africa at zoom 16; the landscape worker needs the longer gap to recompose what changed each frame. */
const AFRICA = { epoch: 'today', seed: 60, zoom: 16, x: 140, y: 63, frames: 240, gap: 150, settle: 3000, then: AFRICA_THEN, act: AFRICA_ACT };

/* ---------------------------------------------------------------- the sea -- */

/** Page helpers: open sea near a tile; a whale or dolphin pod of a stage put there, pinned for the herd layer. */
const SEA = `const w = app.world, C = SE.Life.Cetacean, LC = SE.LIFE_COUNT, h = v.herds;
  h.update(w, performance.now());
  const water = (x, y) => y >= 1 && y < SE.GRID_H - 1 && w.isWater(SE.idx(SE.wrapX(x), y));
  const open = (x, y, r) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -r; dx <= r; dx++) if (!water(x + dx, y + dy)) return false; return true; };
  const near = (tx, ty, ok) => { let b = null, bd = 1e9;
    for (let y = ty - 10; y <= ty + 10; y++) for (let x = tx - 12; x <= tx + 12; x++) {
      if (!ok(x, y)) continue; const d = (x - tx) ** 2 + (y - ty) ** 2; if (d < bd) { bd = d; b = [x, y]; } }
    return b; };
  const put = (xy, stage, rank, flip) => {
    const i = SE.idx(SE.wrapX(xy[0]), xy[1]);
    w.lifeDensity[i * LC + C] = 0.6; w.lifeStage[i * LC + C] = stage;
    const old = h.markerOn(i); if (old) h.remove(h.markers.indexOf(old));
    h.add(w, C, i, Math.random, true, rank);
    const m = h.markers[h.markers.length - 1]; m.flip = flip; return m; };`;

/** The game rolls whether a whale calls or a pod whistles: the next Math.random() after `called` is set returns 0, once. Nothing drawn changes. */
const SURE_CALL = `const sure = (o) => { let called = NaN; Object.defineProperty(o, 'called', { configurable: true, get: () => called,
    set: (c) => { called = c; const r = Math.random; Math.random = () => { Math.random = r; return 0; }; } }); };`;

/** A pod of five porpoising east; its round starts 6 frames in (whistle at 7, leaps from 11). */
const DOLPHINS_THEN = `${SEA}
  const P = near(258, 57, (x, y) => open(x, y, 4) && w.temperature[SE.idx(SE.wrapX(x), y)] >= SE.DOLPHIN_WARM + 1);
  window.__dm = put(P, SE.DOLPHIN_STAGE, 0.025, false);
  v.centerOn(P[0] + 1, P[1] - 2);`;
const DOLPHINS_ACT = `const L = app.editView.dolphins, m = __dm, period = 6 + 4 * m.rank;
  if (f === 0) {
    ${SURE_CALL}
    const decide = L.decide;
    L.decide = function (pod, ...a) { decide.call(this, pod, ...a); if (pod === this.pods.get(m)) pod.wait = NaN; };
    const pod = L.pods.get(m);
    if (pod) {
      pod.offset = 7 * period - 0.2 - (performance.now() + 1000 / 30) / 1000;
      pod.round = NaN; pod.wait = NaN; pod.tile = m.tile; pod.flip = m.flip;
      sure(pod);
    }
  }`;

/** A blue whale rises and blows (from 58: its call) while a humpback beside it dives with its fluke (76–113). */
const WHALE_THEN = `${SEA}
  const A = near(251, 57, (x, y) => open(x, y, 3));
  const B = near(A[0] + 6, A[1] + 2, (x, y) => open(x, y, 3) && Math.abs(x - A[0]) >= 5);
  // B: a cycle without a second blow, so it only swims and dives in the shot.
  let rb = 0.3; while (SE.landHash(5, Math.round((14 + 10 * rb) * 1000), 411) < 0.5) rb += 0.01;
  window.__wA = put(A, 7, 0.1, false);
  window.__wB = put(B, 4, rb, false);
  v.centerOn((A[0] + B[0]) / 2, (A[1] + B[1]) / 2 - 3);`;
const WHALE_ACT = `const L = app.editView.whales;
  if (f === 0) {
    ${SURE_CALL}
    // Past the layer's limit of two surfaced whales a planet and its spacing check: both show.
    const decide = L.decide;
    L.decide = function (s, sp, cycle, late) {
      decide.call(this, s, sp, cycle, late);
      if (s === this.swims.get(__wA) || s === this.swims.get(__wB)) { s.under = false; s.holds = true; if (!this.live.includes(s)) this.live.push(s); }
    };
    const clock = (performance.now() + 1000 / 30) / 1000;
    for (const [m, u0] of [[__wA, -0.3], [__wB, 6.1]]) {
      const s = L.swims.get(m);
      if (!s) continue;
      s.offset = 5 * (14 + 10 * m.rank) + u0 - clock;
      s.cycle = NaN; s.tile = m.tile; s.flip = m.flip;
      sure(s);
    }
  }`;

/* ---------------------------------------------------------------- the air -- */

/**
 * The air window over the world at tick 5900; a drawn cursor hovers O₂'s change (its balance, f22), the land plants'
 * share by group (f62), then the breathing of land animals and whales by group (f110). The popovers open on their
 * pointerenter listeners. One tick fills the balance (it is not saved); then no tick rewrites the numbers mid-shot.
 */
const AIR_THEN = `app.tick();
  app.tick = () => {};
  app.windows.show('graph-air');
  const cur = document.createElement('div');
  cur.setAttribute('popover', 'manual');
  cur.style.cssText = 'position:fixed;inset:auto;margin:0;padding:0;border:0;background:transparent;overflow:visible;pointer-events:none;width:26px;height:39px;left:1500px;top:900px';
  cur.innerHTML = '<svg width="26" height="39" viewBox="0 0 12 18" shape-rendering="crispEdges"><path d="M.5 .5v14l3.5-3.5 2.5 6 2-1-2.5-5.5h5z" fill="#fff" stroke="#1a1a1a" stroke-linejoin="round"/></svg>';
  document.body.appendChild(cur);
  cur.showPopover();
  window.__cur = cur;`;
const AIR_ACT = `const at = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width * 0.6, r.top + r.height * 0.55]; };
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
  // [first frame, arrival frame, target]; on arrival the pointer enters it.
  const legs = [[0, 22, '.win-air button.gas-delta[aria-controls="gas-pop-o2"]'],
    [40, 62, 'button.gas-info[aria-controls="gas-detail-o2-sources-plants"]'],
    [92, 110, 'button.gas-info[aria-controls="gas-detail-o2-sinks-breath"]']];
  if (f === 0) window.__from = [1500, 900];
  for (const [a, b, sel] of legs) {
    const el = document.querySelector(sel);
    if (f < a || f > b || !el) continue;
    if (f === a) __from = [parseFloat(__cur.style.left), parseFloat(__cur.style.top)];
    const [tx, ty] = at(el), e = ease((f - a) / (b - a));
    __cur.style.left = (__from[0] + (tx - __from[0]) * e) + 'px';
    __cur.style.top = (__from[1] + (ty - __from[1]) * e) + 'px';
    if (f === b) {
      const pop = el.closest('.gas-pop');
      if (pop) pop.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
      el.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
      // The cursor back on top of the popover that just opened.
      __cur.hidePopover(); __cur.showPopover();
    }
  }`;

/* ------------------------------------------------------------ the brush -- */

/**
 * The altitude brush held on the screen's middle, circling a little (synthetic pointer: capture would throw on it),
 * without its German height label (drawn on the map canvas). window.__tf logs every call to its sound with the frame,
 * for tools/trailer-cut.js to play the game's brush sound back in step.
 */
const BRUSH = `const c = document.querySelector('canvas.world-canvas');
  if (f === 0) {
    c.setPointerCapture = () => {};
    c.releasePointerCapture = () => {};
    app.terraform.drawLabel = () => {};
    const snd = app.terraform.sound;
    window.__tf = [];
    for (const m of ['start', 'update', 'stage', 'stop']) {
      const call = snd[m].bind(snd);
      snd[m] = (...a) => {
        const d = a[0];
        __tf.push([__f, m, m === 'update' ? [{ height: d.height, emerged: d.emerged, flooded: d.flooded, moved: d.moved, tiles: [] }, a[1]] : a]);
        return call(...a);
      };
    }
    app.selectTool(SE.Tool.SetAltitude, false);
  }
  app.world.omega = SE.OMEGA_MAX;
  const a = f / 10;
  const p = { pointerId: 7, pointerType: 'mouse', button: 0, buttons: 1, clientX: 960 + Math.cos(a) * 60, clientY: 540 + Math.sin(a) * 36, bubbles: true };
  if (f === 6) c.dispatchEvent(new PointerEvent('pointerdown', p));
  else if (f > 6 && f < 80) c.dispatchEvent(new PointerEvent('pointermove', p));
  else if (f === 80) c.dispatchEvent(new PointerEvent('pointerup', { ...p, buttons: 0 }));`;

/* ------------------------------------------------------ the dinosaurs' end -- */

/**
 * The world waits at the dinosaurs' question: the German dialog stays shut (fateAsking), so does the news after the
 * strike; stamps wait; Gaia, who dozes after 8 s paused, stays awake.
 */
const DINO_THEN = `SE.showCometNews = () => Promise.resolve();
  app.fateAsking = true;
  app.ripStamps.busy = true;
  app.companion.pausedAt = performance.now();
  window.__log = {};`;
/**
 * The herds wander (drawn only); at f20 the player answers "comet", aimed near Chicxulub (the nearest land block to
 * 21.4° N 89.5° W on this grid): the game's own show plays. The stamps held until 30 frames after the strike, so the
 * card does not cover it; of the many, only the dinosaurs' shows.
 */
const DINO_ACT = `const w = app.world, L = __log, r = app.ripStamps;
  app.companion.pausedAt = performance.now();
  if (L.impact === undefined && f % 6 === 0) app.editView.herds.step(w, performance.now());
  if (f === 20) {
    r.collect(w, app.fauna, app.evolution);
    for (const q of r.queue) r.seen.add(q.key);
    r.queue.length = 0;
    SE.chooseDinoFate(w, app.evolution, 'comet');
    w.dinoEra.target = 49 * SE.GRID_W + 61;
    app.fateAsking = false;
  }
  if (L.impact === undefined && w.dinoEra.fate === 'extinct') L.impact = f;
  if (L.impact !== undefined && f === L.impact + 30) r.busy = false;
  const st = document.querySelector('.rip-stamp');
  if (L.stampIn === undefined && st && !st.hidden) L.stampIn = f;
  if (L.stampIn !== undefined) { for (const q of r.queue) r.seen.add(q.key); r.queue.length = 0; }`;

/** The stamp's sauropod and its R.I.P. band; its German name and line go. */
const DINO_CSS = `${CSS_UI.replace(', .rip-stamp', '')}
.rip-stamp-name, .rip-stamp-sub { display: none !important; }`;

/* ------------------------------------------------------------ the ages -- */

/** window.__ages: the biggest city of each age shown, as [x, y], each visited once so its landscape is composed before the cuts. */
const AGES = `window.__ages = [];
  const w = app.world;
  for (const t of [SE.Tech.Stone, SE.Tech.Iron, SE.Tech.Industrial, SE.Tech.Nanotech]) {
    let best = -1;
    for (let i = 0; i < SE.TILE_COUNT; i++) if (w.tech[i] === t && (best < 0 || w.cityPop[i] > w.cityPop[best])) best = i;
    if (best >= 0) __ages.push([best % SE.GRID_W, Math.floor(best / SE.GRID_W)]);
  }
  for (const c of [...__ages, __ages[0]]) {
    v.centerOn(c[0], c[1]);
    v.markDirty();
    await new Promise((done) => setTimeout(done, 2500));
  }`;

/* Film times are seconds on each film's clock (SE.INTRO_CUES; the launch film runs 0–12 s, its closing words from 10.5 s). */
const SHOTS = [
  { id: '01-bigbang', film: 'intro', from: 12.0, to: 16.0 },
  { id: '02-planets', film: 'intro', from: 15.6, to: 18.0 },
  { id: '02-clouds', film: 'intro', from: 21.5, to: 27.2 },
  // Today's Earth before life; Gaia sleeps until the first cells. Seed 60 founds them in the Gulf of Aden, in view, so
  // her comet flies across Africa to them ('cells' is free: no developer mode).
  { id: '03-gaia-wakes', css: CSS_UI, epoch: 'today', seed: 60, zoom: 32, x: 146, y: 60, frames: 300, act: "if (f === 45) app.developNode('cells');" },
  { id: '04-africa', css: CSS_CLEAN, ...AFRICA },
  // The same years with the living interface: the vine climbs the rail and blooms, Gaia's rock turns green.
  { id: '04-africa-ui', css: CSS_UI, ...AFRICA },
  { id: '05-dolphins', save: CIV, css: CSS_CLEAN, zoom: 32, frames: 110, then: DOLPHINS_THEN, act: DOLPHINS_ACT },
  { id: '05-whale', save: CIV, css: CSS_CLEAN, zoom: 32, frames: 150, then: WHALE_THEN, act: WHALE_ACT },
  { id: '06-air', save: CIV, css: CSS_UI.replace('.win,', '.win:not(.win-air),'), zoom: 32, speed: 1, x: 252, y: 56, frames: 150, then: AIR_THEN, act: AIR_ACT },
  { id: '07-terraform', save: CIV, zoom: 32, x: 258, y: 66, frames: 90, act: BRUSH, log: '__tf' },
  { id: '08-dino-fall', save: 'tmp/trailer/worlds/dino.save', css: DINO_CSS, zoom: 32, x: 62, y: 50, frames: 256, then: DINO_THEN, act: DINO_ACT, log: '__log' },
  { id: '09-ages', save: CIV, zoom: 32, speed: 1, frames: 120, then: AGES, act: 'const c = __ages[Math.min(__ages.length - 1, Math.floor(f / 30))]; app.editView.centerOn(c[0], c[1]);' },
  { id: '10-coast', save: CIV, zoom: 32, speed: 1, frames: 90, from: [56, 34], to: [66, 36] },
  { id: '11-launch', film: 'launch', from: 2.5, to: 10.0 },
  { id: '12-logo', film: 'intro', from: 6.0, to: 11.0 },
];

module.exports = { SHOTS };
