/* =============================================================================
 * SimEarth 2.0 — directed tidal-wave crests and the breaking wave
 * -----------------------------------------------------------------------------
 * The low crest out at sea, the steepening crest near the coast and the wave
 * breaking on the shore, each in the 8 travel directions of HAZARD_NX /
 * HAZARD_NY (src/hazards.ts), one block of frames per direction.
 * Every direction is drawn from the same 3D body, never rotated or flipped:
 * the wave is an implicit volume in wave coordinates (u along the travel
 * direction, v along the crest, z up), ray-marched in the map's oblique view
 * (plan x, y and height z show at x, y − z) and lit from the upper left on
 * screen (north-west and above), so every direction gets its light afresh.
 * Loops: foam rolls along the crest by a quarter of its period a frame.
 * Style: docs/ereignisse-2026-10/stil.md · contract: tools/fx/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');
const P = require('../terrain/palette');

/** Travel directions in HAZARD_NX / HAZARD_NY order. */
const DIRS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

const LIGHT = (() => {
  const l = [-0.55, -0.45, 0.7];
  const n = Math.hypot(...l);
  return l.map((c) => c / n);
})();

const BODY = ['water3', 'water4', 'water5', 'water6', 'water7'];
const FOAM = ['ice2', 'ice3', 'ice4', 'white0'];

function tone(ramp, light, cuts) {
  let s = 0;
  while (s < cuts.length && light > cuts[s]) s++;
  return ramp[Math.min(ramp.length - 1, s)];
}

const body = (l) => tone(BODY, l, [0.05, 0.3, 0.55, 0.8]);
const foam = (l) => tone(FOAM, l, [0.1, 0.35, 0.6]);

/**
 * Ray-march `field(u, v, z)` → { f, kind } (f > 0 inside) in a w × h box
 * whose plan centre is (cx, cy), travelling along DIRS[d]. `paint(kind, u, v,
 * z, light, x, y)` names the colour of a hit, or null to leave it clear.
 */
function render(w, h, cx, cy, d, zMax, field, paint) {
  const [dx, dy] = DIRS[d];
  const len = Math.hypot(dx, dy);
  const nx = dx / len;
  const ny = dy / len;
  const local = (px, py) => [(px - cx) * nx + (py - cy) * ny, -(px - cx) * ny + (py - cy) * nx];
  const at = (px, py, z) => {
    const [u, v] = local(px, py);
    return field(u, v, z);
  };
  const t = new k.Tex(w, h);
  const e = 0.35;
  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      const px = sx + 0.5;
      for (let z = zMax; z >= 0; z -= 0.25) {
        const py = sy + 0.5 + z;
        const hit = at(px, py, z);
        if (hit.f <= 0) continue;
        const gx = at(px + e, py, z).f - at(px - e, py, z).f;
        const gy = at(px, py + e, z).f - at(px, py - e, z).f;
        const gz = at(px, py, z + e).f - at(px, py, Math.max(0, z - e)).f;
        const gl = Math.hypot(gx, gy, gz) || 1;
        // The outward normal is −∇f.
        const light = -(gx * LIGHT[0] + gy * LIGHT[1] + gz * LIGHT[2]) / gl;
        const [u, v] = local(px, py);
        const name = paint(hit.kind, u, v, z, light, sx, sy);
        if (name) t.set(sx, sy, P.c(name));
        break;
      }
    }
  }
  return t;
}

/** Period of the crest's lumps along v: one tile between neighbouring crests, so lines of them join. */
const period = (d) => 16 * Math.hypot(...DIRS[d]);

/**
 * How far a crest sinks beyond its own stretch of the front (|v| past 7 px;
 * a diagonal front steps by half a diagonal, 11.3 px, along the crest):
 * neighbouring tiles' crests still overlap and join, but a lone crest ends
 * round instead of running out to the corners of its box as a slab.
 */
const taper = (v) => Math.max(0, Math.abs(v) - 7) * 0.9;

/** A swell: gentle back slope `back`, steep front `front`, `a` high, lumpy along the crest; foam on its top share `cap`. */
function swell(d, f, o) {
  const p = period(d);
  return render(o.w, o.h, 8, o.cy, d, o.a * 1.6 + 1, (u, v, z) => {
    const roll = Math.sin(((v / p) + f / 4) * Math.PI * 2);
    const top = o.a * (1 + o.lump * roll);
    const prof = u < 0 ? Math.exp(-((u / o.back) ** 2)) : Math.exp(-((u / o.front) ** 2));
    return { f: top * prof - o.flat - z - taper(v), kind: prof * (1 + o.lump * roll * 0.5) > o.cap ? 'foam' : 'body' };
  }, (kind, u, v, z, light, x, y) => {
    if (kind === 'foam') return foam(light + 0.1);
    // The trough in front of the face lies in the crest's shadow.
    if (u > 0 && z < o.flat + 0.6) return BODY[0];
    // Streaks of foam run down the front face of a steep crest.
    if (o.streaks && u > 0 && k.hash(Math.round(v * 0.7 + 50), Math.floor(z * 1.5) + f, 401 + d) < o.streaks) return foam(light);
    return body(light);
  });
}

function waveDeep(i) {
  const d = Math.floor(i / 4);
  return swell(d, i % 4, { w: 16, h: 8, cy: 5, a: 2, back: 1.8, front: 0.9, lump: 0.25, flat: 0.75, cap: 1.04, streaks: 0 });
}

function waveCoast(i) {
  const d = Math.floor(i / 4);
  return swell(d, i % 4, { w: 16, h: 16, cy: 10, a: 3.7, back: 2, front: 0.9, lump: 0.22, flat: 0.9, cap: 0.9, streaks: 0.1 });
}

/* ------------------------------------------------------------ breaking -- */

/** Distance from (u, z) to the polyline `pts`. */
function toLine(u, z, pts) {
  let best = Infinity;
  for (let n = 1; n < pts.length; n++) {
    const [u0, z0] = pts[n - 1];
    const [u1, z1] = pts[n];
    const du = u1 - u0;
    const dz = z1 - z0;
    const s = Math.max(0, Math.min(1, ((u - u0) * du + (z - z0) * dz) / (du * du + dz * dz || 1)));
    best = Math.min(best, Math.hypot(u - u0 - du * s, z - z0 - dz * s));
  }
  return best;
}

/**
 * The wave breaking, frame by frame: the wall rises and its lip throws
 * forward (0, 1), plunges (2), bursts into spray (3), the spray falls as
 * whitewater runs up ahead (4) and the foam thins out (5).
 */
const BREAK = [
  { wall: 4, front: 0.9, lip: [[0, 4.2], [1.2, 4.5]], spray: null, run: 0, fade: 0 },
  { wall: 4.5, front: 0.8, lip: [[-0.2, 4.7], [1.4, 5.1], [2.5, 4.2]], spray: null, run: 0, fade: 0 },
  { wall: 3.8, front: 0.8, lip: [[-0.2, 4.1], [1.5, 4.5], [2.7, 3.2], [3, 0.8]], spray: { u: 3, z: 2, r: 1.3, rows: 1 }, run: 2.5, fade: 0 },
  { wall: 2.4, front: 1.1, lip: null, spray: { u: 3, z: 4, r: 1.8, rows: 2 }, run: 4.5, fade: 0 },
  { wall: 1.3, front: 1.4, lip: null, spray: { u: 3.8, z: 6.5, r: 1.5, rows: 2 }, run: 6.5, fade: 0.35 },
  { wall: 0, front: 1.4, lip: null, spray: { u: 4.4, z: 8.5, r: 1.1, rows: 1 }, run: 8, fade: 0.6 },
];

function waveBreak(i) {
  const d = Math.floor(i / 6);
  const f = i % 6;
  const o = BREAK[f];
  const p = period(d);
  const t = render(16, 24, 8, 16, d, 22, (u, v, z) => {
    const lump = Math.sin((v / p) * Math.PI * 2 + d);
    let best = { f: -1, kind: 'body' };
    const take = (val, kind) => { if (val > best.f) best = { f: val, kind }; };
    if (o.wall > 0) {
      const prof = Math.exp(-((u / (u < 0 ? 2 : o.front)) ** 2));
      const top = o.wall * (1 + 0.1 * lump);
      take(top * prof - 0.9 - z, z > top * 0.86 ? 'foam' : 'body');
    }
    if (o.lip) take(0.65 + 0.15 * lump - toLine(u, z, o.lip), 'foam');
    if (o.spray) {
      // A lumpy ridge of spray along the crest, a smaller one above it; fading spray breaks into clumps, never a mesh.
      for (let m = 0; m < o.spray.rows; m++) {
        if (k.hash(Math.floor((v + 40) / 3), m, 15 + f) < o.fade) continue;
        const swell = Math.sin((v / p) * Math.PI * 4 + m * 2.1 + d);
        const r = o.spray.r * (1 - m * 0.35) * (0.8 + 0.3 * swell);
        take(r - Math.hypot(u - o.spray.u - m * 0.8, z - o.spray.z - m * 2.4 - swell), 'spray');
      }
    }
    // Whitewater running up ahead in lines parallel to the crest.
    if (o.run > 0 && u > 0.3 && u < o.run) {
      const line = (u - o.run + 40) % 2.2;
      if (line < 1.3 && k.hash(Math.floor(v / 3), Math.floor(u / 2.2), 17 + f) > o.fade) take(0.8 - z, 'run');
    }
    best.f -= taper(v);
    return best;
  }, (kind, u, v, z, light) => {
    // The face under the lip stays in its shadow.
    if (kind === 'body') return body(u > 0 ? light - 0.25 : light);
    if (kind === 'run') return u > o.run - 1.3 ? 'white0' : light > 0.5 ? 'ice4' : 'water7';
    return foam(light + 0.15);
  });
  // Foot sprites stand on their last row: a streak of surf there if nothing else reached it.
  let foot = false;
  for (let x = 0; x < 16; x++) if (t.get(x, 23) !== 0) foot = true;
  if (!foot) {
    const x = 6 + Math.floor(k.hash(d, f, 451) * 3);
    t.set(x, 23, P.c('water7'));
    t.set(x + 1, 23, P.c('ice4'));
  }
  return t;
}

module.exports = { waveDeep, waveCoast, waveBreak, DIRS };
