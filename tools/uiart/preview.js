/* =============================================================================
 * Gaia Reborn — composed previews of the living interface
 * -----------------------------------------------------------------------------
 * The sprites put together the way the runtime puts them together, at ×3 on
 * the dark stage ground (#0c1520) and on map teal (#226ca4), so each artist
 * sees anchors, points and overlays meet before a line of runtime code:
 *   gaia    the rock's four looks with Gaia prone on its `bed` point and her
 *           face overlays, then every body pose on rock 2
 *   face    gaia_prone with every eyes / brows / mouth variant (and blush)
 *   rail    button states with an icon, tab, focus ring, badges, all icons
 *   topbar  a 240 × 30 status-bar mock: wood, nine-sliced panels, posts and
 *           studs, the logo plaque, status and control icons
 *   vines   a 2-px stem per leaf state with every leaf at its `base` point,
 *           flowers, curls, knot, falling leaf, firefly, window corners
 *   magic   every frame of the magic sprites
 * Leaves sit with their `base` pixel on the stem's outer column; overlays
 * (face parts, tab, focus ring, window corners) with their top left at the
 * target point plus their `points.at`.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const C = require('./catalog');
const K = require('./kit');
const { anchorOf } = require('./build');
const { UiSheet } = require('./sheet');

const SCALE = 3;
const GAP = 8;
const PAD = 12;
const LABEL = 14;
const MAX = 460;
const GROUNDS = [[12, 21, 32, 255], [34, 108, 164, 255]];
const BG = [52, 56, 60, 255];
const INK = [232, 238, 228, 255];
const CAT = Object.fromEntries(C.SPRITES.map((s) => [s.id, s]));
const ICONS = ['examine', 'move', 'altitude', 'plant', 'life', 'event', 'evolution', 'planet', 'windows'].map((n) => `ico_${n}`);
const HUD = ['energy', 'ep', 'life', 'air', 'sea', 'co2', 'temp', 'time'].map((n) => `hud_${n}`);

/** UI_SCENE as src/uiart.ts declares it: the runtime owns the scene box. */
function sceneBox() {
  let body = '';
  try {
    body = /export const UI_SCENE\b[^{]*\{([^}]*)\}/.exec(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'uiart.ts'), 'utf8'))?.[1] ?? '';
  } catch { /* no runtime file: the defaults */ }
  const get = (k, d) => Number(new RegExp(`\\b${k}\\s*:\\s*(\\d+)`).exec(body)?.[1] ?? d);
  return { w: get('w', 112), h: get('h', 72), rockFootX: get('rockFootX', 44) };
}

/** Cells laid out left to right, wrapping at `max` art px; br() starts a new row. */
class Flow {
  constructor(max = MAX, gap = 4) {
    this.max = max;
    this.gap = gap;
    this.cells = [];
    this.x = 0;
    this.y = 0;
    this.rowH = 0;
  }

  add(t) {
    if (this.x > 0 && this.x + t.w > this.max) this.br();
    this.cells.push([t, this.x, this.y]);
    this.x += t.w + this.gap;
    this.rowH = Math.max(this.rowH, t.h);
    return this;
  }

  br() {
    if (this.x === 0) return;
    this.x = 0;
    this.y += this.rowH + 2 * this.gap;
    this.rowH = 0;
  }

  done() {
    const out = new K.Tex(Math.max(1, ...this.cells.map(([t, x]) => x + t.w)), Math.max(1, ...this.cells.map(([t, , y]) => y + t.h)));
    for (const [t, x, y] of this.cells) out.stamp(t, x, y);
    return out;
  }
}

function makeKit(art) {
  const frame = (id, f) => {
    const fr = art.sprites[id];
    return fr ? fr[((f % fr.length) + fr.length) % fr.length] : null;
  };
  const tl = (dst, id, f, x, y) => {
    const t = frame(id, f);
    if (t) dst.stamp(t, x, y);
  };
  const at = (dst, id, f, x, y) => {
    if (!CAT[id]) return;
    const [ax, ay] = anchorOf(CAT[id]);
    tl(dst, id, f, x - ax, y - ay);
  };
  const over = (dst, id, f, x, y) => {
    const a = CAT[id]?.points?.at ?? [0, 0];
    tl(dst, id, f, x + a[0], y + a[1]);
  };
  return { frame, tl, at, over };
}

const frames = (id) => CAT[id]?.frames ?? 0;

/** A row of frames side by side, top-aligned: [[id, f], …]. */
function strip(k, list, gap = 2) {
  const cells = list.filter(([id]) => k.frame(id, 0));
  const t = new K.Tex(Math.max(1, cells.reduce((a, [id]) => a + CAT[id].w + gap, -gap)), Math.max(1, ...cells.map(([id]) => CAT[id].h)));
  let x = 0;
  for (const [id, f] of cells) {
    k.tl(t, id, f, x, 0);
    x += CAT[id].w + gap;
  }
  return t;
}

function tile(k, dst, id, f, x, y, w, h) {
  const t = k.frame(id, f);
  if (!t) return;
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const v = t.px[(yy % t.h) * t.w + (xx % t.w)];
      if (v) dst.set(x + xx, y + yy, v);
    }
  }
}

/** Nine-slice: corners c × c copied, edges and centre tiled from the middle of the source. */
function nine(k, dst, id, f, x, y, w, h, c = 4) {
  const t = k.frame(id, f);
  if (!t) return;
  const src = (v, size, n) => (v < c ? v : v >= size - c ? n - (size - v) : c + ((v - c) % Math.max(1, n - 2 * c)));
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const v = t.px[src(yy, h, t.h) * t.w + src(xx, w, t.w)];
      if (v) dst.set(x + xx, y + yy, v);
    }
  }
}

/* -------------------------------------------------------------- gaia -- */

/** Body pose with its foot anchor at (x, y), face overlays at points.face, the orb at points.hand. */
function pose(k, dst, id, f, x, y, face = { eyes: 0, brows: 0, mouth: 1, blush: false }) {
  const s = CAT[id];
  if (!s) return;
  const [ax, ay] = anchorOf(s);
  const ox = x - ax;
  const oy = y - ay;
  k.tl(dst, id, f, ox, oy);
  const fp = s.points?.face;
  if (fp) {
    if (face.blush) k.over(dst, 'gaia_blush', 0, ox + fp[0], oy + fp[1]);
    k.over(dst, 'gaia_eyes', face.eyes, ox + fp[0], oy + fp[1]);
    k.over(dst, 'gaia_brows', face.brows, ox + fp[0], oy + fp[1]);
    k.over(dst, 'gaia_mouth', face.mouth, ox + fp[0], oy + fp[1]);
  }
  const hand = s.points?.hand;
  if (hand) k.at(dst, 'gaia_orb', 0, ox + hand[0], oy + hand[1]);
}

/** Gaia's corner: the rock's foot at (rockFootX, h - 1), the pose on its bed. */
function scene(k, box, look, id, f) {
  const t = new K.Tex(box.w, box.h);
  const rock = CAT.rock;
  const [rax, ray] = anchorOf(rock);
  const rx = box.rockFootX - rax;
  const ry = box.h - 1 - ray;
  k.tl(t, 'rock', look, rx, ry);
  const bed = rock.points?.bed ?? [rax, 0];
  pose(k, t, id, f, rx + bed[0], ry + bed[1]);
  return t;
}

function partGaia(k, box) {
  const F = new Flow();
  for (let look = 0; look < 4; look++) F.add(scene(k, box, look, 'gaia_prone', 0));
  F.br();
  const poses = [['gaia_sleep', 0], ['gaia_wake', frames('gaia_wake') - 1], ['gaia_kick', 0], ['gaia_chin', 0], ['gaia_slump', 0],
    ['gaia_lookup', 0], ['gaia_magic_up', frames('gaia_magic_up') - 1], ['gaia_magic_hold', 0], ['gaia_magic_down', 0]];
  for (const [id, f] of poses) F.add(scene(k, box, 2, id, f));
  return F.done();
}

function partFace(k) {
  const F = new Flow();
  const s = CAT.gaia_prone;
  const cell = (face) => {
    const t = new K.Tex(s.w, s.h);
    const [ax, ay] = anchorOf(s);
    pose(k, t, 'gaia_prone', 0, ax, ay, face);
    return t;
  };
  for (let e = 0; e < frames('gaia_eyes'); e++) F.add(cell({ eyes: e, brows: 0, mouth: 0 }));
  F.br();
  for (let b = 0; b < frames('gaia_brows'); b++) F.add(cell({ eyes: 0, brows: b, mouth: 0 }));
  F.br();
  for (let m = 0; m < frames('gaia_mouth'); m++) F.add(cell({ eyes: 0, brows: 0, mouth: m }));
  F.br();
  F.add(cell({ eyes: 5, brows: 1, mouth: 2, blush: true }));
  return F.done();
}

/* -------------------------------------------------------------- rail -- */

/** The badge centred at (cx, cy) with `digits` on it ('+' is frame 10). */
function badge(k, dst, cx, cy, digits, f = 0) {
  k.at(dst, 'badge', f, cx, cy);
  const d = CAT.digits;
  let x = cx - Math.floor((digits.length * d.w - 1) / 2);
  for (const ch of digits) {
    k.tl(dst, 'digits', ch === '+' ? 10 : Number(ch), x, cy - Math.floor(d.h / 2));
    x += d.w;
  }
}

function partRail(k) {
  const F = new Flow();
  const icon = CAT.rail_btn.points?.icon ?? [5, 5];
  const btn = (frame, ico, icoFrame) => {
    const t = new K.Tex(34, 30);
    const o = { t, x: 3, y: 3 };
    k.tl(t, 'rail_btn', frame, o.x, o.y);
    if (ico) k.tl(t, ico, icoFrame, o.x + icon[0], o.y + icon[1] + (frame === 2 ? 1 : 0));
    return o;
  };
  for (let f = 0; f < frames('rail_btn'); f++) {
    const b = btn(f, 'ico_examine', f === 3 || f === 4 ? 1 : 0);
    if (f === 3 || f === 4) k.over(b.t, 'rail_tab', f - 3, b.x, b.y);
    F.add(b.t);
  }
  const focus = btn(0, 'ico_examine', 0);
  k.over(focus.t, 'rail_focus', 0, focus.x, focus.y);
  F.add(focus.t);
  F.br();
  for (const n of ['3', '12']) {
    const b = btn(0, 'ico_evolution', 0);
    badge(k, b.t, b.x + 21, b.y + 2, n);
    F.add(b.t);
  }
  F.add(strip(k, Array.from({ length: frames('badge') }, (_, f) => ['badge', f])));
  F.add(strip(k, Array.from({ length: frames('digits') }, (_, f) => ['digits', f]), 1));
  F.br();
  for (const id of ICONS) F.add(btn(0, id, 0).t);
  F.br();
  for (const id of ICONS) F.add(btn(3, id, 1).t);
  return F.done();
}

/* ------------------------------------------------------------ topbar -- */

function partTopbar(k) {
  const F = new Flow();
  const bar = new K.Tex(240, 30);
  const post = (x) => {
    tile(k, bar, 'post_tile', 0, x, 0, CAT.post_tile.w, bar.h);
    k.at(bar, 'stud', 0, x + Math.floor(CAT.post_tile.w / 2), 15);
  };
  tile(k, bar, 'wood_tile', 0, 0, 0, bar.w, bar.h);
  nine(k, bar, 'panel9', 0, 2, 5, 92, 20);
  k.tl(bar, 'logo', 0, 4, 8);
  post(96);
  nine(k, bar, 'panel9', 0, 103, 5, 48, 20);
  HUD.slice(0, 3).forEach((id, n) => k.tl(bar, id, 0, 107 + 14 * n, 9));
  post(153);
  nine(k, bar, 'panel9', 1, 160, 5, 60, 20);
  HUD.slice(3, 7).forEach((id, n) => k.tl(bar, id, 0, 164 + 14 * n, 9));
  post(222);
  k.tl(bar, 'ctl_pause', 0, 229, 10);
  F.add(bar);
  F.br();
  const row = new K.Tex(240, 16);
  tile(k, row, 'parch_tile', 0, 0, 0, row.w, row.h);
  let x = 2;
  for (const id of HUD) { k.tl(row, id, 0, x, 2); x += 14; }
  for (const id of ['ctl_play', 'ctl_pause', 'ctl_gear', 'ctl_pip']) {
    for (let f = 0; f < frames(id); f++) { k.tl(row, id, f, x, 3); x += CAT[id].w + 2; }
  }
  F.add(row);
  return F.done();
}

/* ------------------------------------------------------------- vines -- */

/** Leaf `id` in state v (sway 0) with its `base` pixel at (x, y). */
function leaf(k, dst, id, v, x, y) {
  const s = CAT[id];
  const base = s.points?.base ?? [0, s.h - 1];
  k.tl(dst, id, v * 3, x - base[0], y - base[1]);
}

function stemColumn(k, v) {
  const t = new K.Tex(44, 112);
  const sx = 21;
  for (let y = 4; y < t.h; y++) { K.put(t, sx, y, 'stem3'); K.put(t, sx + 1, y, 'stem1'); }
  for (let x = 6; x < 38; x++) { K.put(t, x, 4, 'stem3'); K.put(t, x, 5, 'stem1'); }
  for (const hx of [11, 31]) leaf(k, t, 'leaf_hang', v, hx, 5);
  for (const [id, y] of [['leaf_l_l', 30], ['leaf_l_r', 46], ['leaf_m_l', 62], ['leaf_m_r', 76], ['leaf_s_l', 90], ['leaf_s_r', 100]]) {
    leaf(k, t, id, v, id.endsWith('_r') ? sx + 1 : sx, y);
  }
  return t;
}

/** A dark window's top edge with both vine corners in growth stage f. */
function windowMock(k, f) {
  const t = new K.Tex(80, 34);
  const x0 = 8;
  const y0 = 8;
  const w = 64;
  K.rect(t, x0, y0, w, t.h - y0, 'water0');
  K.rect(t, x0, y0, w, 1, 'water3');
  K.rect(t, x0, y0, 1, t.h - y0, 'water3');
  K.rect(t, x0 + w - 1, y0, 1, t.h - y0, 'water3');
  k.over(t, 'win_corner_l', f, x0, y0);
  k.over(t, 'win_corner_r', f, x0 + w - CAT.win_corner_r.w, y0);
  return t;
}

function partVines(k) {
  const F = new Flow();
  for (let v = 0; v < 4; v++) F.add(stemColumn(k, v));
  F.br();
  for (const id of ['flower_w', 'flower_p', 'flower_y', 'flower_b']) F.add(strip(k, Array.from({ length: frames(id) }, (_, f) => [id, f])));
  F.br();
  for (const id of ['curl_r', 'curl_l', 'knot', 'leaf_fall', 'firefly']) F.add(strip(k, Array.from({ length: frames(id) }, (_, f) => [id, f])));
  F.br();
  for (let f = 0; f < frames('win_corner_l'); f++) F.add(windowMock(k, f));
  return F.done();
}

/* ------------------------------------------------------------- magic -- */

function partMagic(k) {
  const F = new Flow();
  for (const id of ['dna_bead', 'spark', 'spark_v', 'mote', 'glow', 'comet', 'burst']) {
    F.add(strip(k, Array.from({ length: frames(id) }, (_, f) => [id, f]), 3));
    F.br();
  }
  return F.done();
}

const PARTS = { gaia: partGaia, face: partFace, rail: partRail, topbar: partTopbar, vines: partVines, magic: partMagic };

/** The chosen parts (all by default), each at ×3 on both grounds; returns { w, h, data }. */
function preview(art, only = null) {
  const k = makeKit(art);
  const box = sceneBox();
  const parts = Object.entries(PARTS).filter(([name]) => !only || only.includes(name)).map(([name, fn]) => [name, fn(k, box)]);
  const w = Math.max(...parts.map(([, t]) => t.w * SCALE + 2 * PAD)) + 2 * GAP;
  const h = GAP + parts.reduce((a, [, t]) => a + LABEL + GROUNDS.length * (t.h * SCALE + 2 * PAD) + GAP, 0);
  const out = new UiSheet(w, h, BG);
  let y = GAP;
  for (const [name, t] of parts) {
    out.text(name, GAP, y, INK, 2);
    y += LABEL;
    for (const g of GROUNDS) {
      out.rect(GAP, y, t.w * SCALE + 2 * PAD, t.h * SCALE + 2 * PAD, g);
      out.blit(t, GAP + PAD, y + PAD, SCALE);
      y += t.h * SCALE + 2 * PAD;
    }
    y += GAP;
  }
  return out;
}

module.exports = { preview, PARTS };
