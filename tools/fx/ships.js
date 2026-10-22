/* =============================================================================
 * Gaia Reborn — ships on the sea, and their sea battles
 * -----------------------------------------------------------------------------
 * Every ship is a small voxel model (x east, y south, z up from the
 * waterline) drawn in the map's 3/4 relief view: seen from the south at 45°,
 * a voxel rising z px shows z px higher, so its top face lands on row
 * y − z − 1 and its south face on row y − z. Voxels are painted back to
 * front (by y + z); each visible face is lit from the upper left by the
 * normal of its part's surface (solids: from the voxels round it; sheets
 * such as sails: from their own bulge), and the lower-right silhouette of
 * every solid and sheet takes its darkest step. The west set mirrors the
 * model, not the picture, and lights it afresh. Below the waterline nothing
 * is drawn: the map's own sea shows round the hull, foam lies on it.
 * Style: docs/ereignisse-2026-10/stil.md · contract: tools/fx/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');
const P = require('../terrain/palette');
const fx = require('./kit');

const TAU = Math.PI * 2;

/* ---------------------------------------------------------- the stage -- */

const norm = (v) => {
  const l = Math.hypot(...v) || 1;
  return v.map((c) => c / l);
};

/** Light from the upper left: from the west, a little from the north, mostly from above. */
const LIGHT = norm([-0.6, -0.25, 0.76]);

/**
 * Parts: `ramp` dark to light (step 0 is the outline), `cuts` the light
 * values (n · LIGHT) that start steps 1, 2, …; `kind` 'solid' (normal from
 * the voxels round it), 'sheet' (normal given per voxel), 'line' (a pixel
 * thin, one tone per voxel, no outline), 'flat' (top faces its lightest
 * step, south faces its darkest, no outline), 'decal' (lies on the water:
 * top face only, no outline).
 */
const SOLID = [-1, 0.05, 0.5];
const BOX = [-1, -0.05, 0.3];
const SHEET = [-1, -0.5, -0.3, -0.05];
const PARTS = {
  // Wood: planked hulls, logs, decks, the dark hollow of a dugout.
  wood: { kind: 'solid', ramp: ['bark0', 'bark1', 'bark2', 'soil3'], cuts: SOLID },
  log: { kind: 'solid', ramp: ['bark0', 'bark0', 'bark1', 'bark2'], cuts: SOLID },
  raftLog: { kind: 'flat', ramp: ['bark0', 'bark1', 'bark2'] },
  deck: { kind: 'solid', ramp: ['bark0', 'bark2', 'soil3', 'sand1'], cuts: [-1, 0.2, 0.6] },
  hollow: { kind: 'solid', ramp: ['bark0', 'bark0', 'bark1', 'bark1'], cuts: SOLID },
  hide: { kind: 'solid', ramp: ['laterite0', 'laterite1', 'laterite2', 'laterite3'], cuts: SOLID },
  bundle: { kind: 'solid', ramp: ['soil0', 'soil1', 'soil2', 'soil3'], cuts: SOLID },
  // Pitch-black hulls (trireme, steamer) with their planked decks, the red wale, the bronze ram.
  pitch: { kind: 'solid', ramp: ['pine0', 'rock0', 'rock0', 'rock1'], cuts: SOLID },
  deckPitch: { kind: 'solid', ramp: ['pine0', 'bark2', 'soil3', 'soil3'], cuts: SOLID },
  wale: { kind: 'solid', ramp: ['pine0', 'red1', 'red1', 'red1'], cuts: SOLID },
  bronze: { kind: 'solid', ramp: ['sand2', 'sand2', 'orange0', 'orange0'], cuts: SOLID },
  // Paint and steel.
  white: { kind: 'solid', ramp: ['rock1', 'rock3', 'rock3', 'white0'], cuts: SOLID },
  funnel: { kind: 'solid', ramp: ['red0', 'red0', 'red1', 'red1'], cuts: SOLID },
  funnelBlue: { kind: 'solid', ramp: ['water1', 'water2', 'water2', 'water3'], cuts: SOLID },
  soot: { kind: 'solid', ramp: ['pine0', 'pine0', 'rock0', 'rock0'], cuts: SOLID },
  maroon: { kind: 'solid', ramp: ['pine0', 'red0', 'red0', 'red1'], cuts: SOLID },
  steel: { kind: 'solid', ramp: ['rock0', 'rock1', 'rock2', 'rock3'], cuts: SOLID },
  steelTop: { kind: 'solid', ramp: ['rock0', 'rock2', 'rock3', 'rock4'], cuts: SOLID },
  teak: { kind: 'solid', ramp: ['rock0', 'bark2', 'soil3', 'soil3'], cuts: SOLID },
  turret: { kind: 'solid', ramp: ['rock0', 'rock1', 'rock2', 'rock3'], cuts: [-1, 0.05, 0.4] },
  // Containers: a lit top, a darker side.
  boxRed: { kind: 'solid', ramp: ['pine0', 'red0', 'red0', 'red1'], cuts: BOX },
  boxBlue: { kind: 'solid', ramp: ['water1', 'water2', 'water2', 'water3'], cuts: BOX },
  boxOrange: { kind: 'solid', ramp: ['laterite1', 'laterite1', 'laterite1', 'orange0'], cuts: BOX },
  boxGrey: { kind: 'solid', ramp: ['rock1', 'rock1', 'rock3', 'rock3'], cuts: BOX },
  // Sails: linen, lit by their own bulge.
  sail: { kind: 'sheet', ramp: ['sand1', 'sand2', 'sand3', 'sand4', 'white0'], cuts: SHEET },
  sailT: { kind: 'sheet', ramp: ['sand2', 'sand2', 'sand3', 'sand4', 'white0'], cuts: SHEET },
  // A pixel thin: masts, yards, guns, figures (their tones given per voxel).
  spar: { kind: 'line', ramp: ['bark0', 'bark1', 'bark2', 'soil3'] },
  oar: { kind: 'line', ramp: ['bark1', 'bark2', 'soil3', 'sand1'] },
  gun: { kind: 'line', ramp: ['rock0', 'rock1', 'rock2'] },
  crew: { kind: 'line', ramp: ['bark0', 'laterite2', 'laterite3', 'sand3'] },
  foam: { kind: 'decal', ramp: ['water5', 'water6', 'water7', 'white0'] },
};

class Model {
  constructor() {
    this.cells = new Map();
  }

  /**
   * Put a voxel of `part`. `opt.n` a sheet's normal; `opt.tone` a line's ramp
   * step or a fixed palette name; `opt.shift` steps lighter (+) or darker;
   * `opt.inst` keeps two sails of one part apart, so the nearer gets its outline.
   */
  add(x, y, z, part, opt = {}) {
    x = Math.round(x); y = Math.round(y); z = Math.round(z);
    this.cells.set(`${x},${y},${z}`, { x, y, z, part, n: opt.n || null, tone: opt.tone ?? null, shift: opt.shift || 0, inst: opt.inst || part });
  }

  get(x, y, z) {
    return this.cells.get(`${x},${y},${z}`) || null;
  }

  /** A straight run of voxels from a to b ([x, y, z]), every voxel touching the next. */
  line(a, b, part, opt = {}) {
    const n = Math.max(1, Math.ceil(Math.max(...a.map((v, i) => Math.abs(b[i] - v))) * 2));
    for (let s = 0; s <= n; s++) this.add(...a.map((v, i) => v + ((b[i] - v) * s) / n), part, opt);
  }

  /** Fill the box x0..x1 × y0..y1 × z0..z1 (inclusive). */
  box(x0, x1, y0, y1, z0, z1, part, opt = {}) {
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.add(x, y, z, part, opt);
  }

  /** The same model mirrored east–west within a box `w` wide: the form only, the light comes later. */
  mirrored(w) {
    const m = new Model();
    for (const c of this.cells.values()) {
      m.add(w - 1 - c.x, c.y, c.z, c.part, { n: c.n ? [-c.n[0], c.n[1], c.n[2]] : null, tone: c.tone, shift: c.shift, inst: c.inst });
    }
    return m;
  }
}

/** Surface normal of a solid voxel from the empty cells round it. */
function solidNormal(m, c) {
  const solid = (x, y, z) => {
    const o = m.get(x, y, z);
    return o && PARTS[o.part].kind === 'solid';
  };
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy || dz) && !solid(c.x + dx, c.y + dy, c.z + dz)) {
          const w = 1 / Math.hypot(dx, dy, dz);
          nx += dx * w; ny += dy * w; nz += dz * w;
        }
      }
    }
  }
  return norm([nx, ny, nz]);
}

/** Whether a face of voxel c (1 top, 2 south) lies in the cast shadow of another solid, towards the light. */
function shadowed(m, c, f) {
  let x = c.x + 0.5;
  let y = f === 1 ? c.y + 0.5 : c.y + 1.05;
  let z = f === 1 ? c.z + 1.05 : c.z + 0.5;
  for (let s = 0; s < 3; s++) {
    x += LIGHT[0] * 0.5; y += LIGHT[1] * 0.5; z += LIGHT[2] * 0.5;
    const o = m.get(Math.floor(x), Math.floor(y), Math.floor(z));
    if (o && o !== c && PARTS[o.part].kind === 'solid') return true;
  }
  return false;
}

/** Paint the model into a `w` × `h` sprite. */
function render(m, w, h) {
  const t = new k.Tex(w, h);
  const who = new Array(w * h).fill(null);
  const face = new Uint8Array(w * h);
  const cells = [...m.cells.values()].sort((a, b) => a.y + a.z - (b.y + b.z) || a.z - b.z);
  for (const c of cells) {
    const kind = PARTS[c.part].kind;
    // A decal lies on the water (its top face only); a line is a pixel thin (its south face only).
    const rows = kind === 'decal' ? [[c.y - c.z - 1, 1]] : kind === 'line' ? [[c.y - c.z, 2]] : [[c.y - c.z - 1, 1], [c.y - c.z, 2]];
    for (const [row, f] of rows) {
      if (c.x < 0 || c.x >= w || row < 0 || row >= h) continue;
      who[row * w + c.x] = c;
      face[row * w + c.x] = f;
    }
  }
  const depth = (c) => c.y + c.z;
  const tone = (i) => {
    const c = who[i];
    const part = PARTS[c.part];
    if (typeof c.tone === 'string') return P.c(c.tone);
    if (part.kind === 'line' || part.kind === 'decal') return P.c(part.ramp[Math.min(part.ramp.length - 1, c.tone ?? 1)]);
    if (part.kind === 'flat') return P.c(part.ramp[Math.max(0, Math.min(part.ramp.length - 1, (face[i] === 1 ? part.ramp.length - 1 : 0) + c.shift))]);
    let n = c.n;
    let shade = 0;
    if (part.kind === 'solid') {
      // The face's own normal, tilted by the surface round the voxel: across its edges more than up and down it.
      const s = solidNormal(m, c);
      n = face[i] === 1 ? norm([s[0] * 0.8, s[1] * 0.8, 1]) : norm([s[0] * 0.8, 1, s[2] * 0.3]);
      if (shadowed(m, c, face[i])) shade = -1;
    }
    const lam = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
    let step = 0;
    part.cuts.forEach((cut, j) => { if (lam >= cut) step = j + 1; });
    step = Math.max(1, Math.min(part.ramp.length - 1, step + c.shift + shade));
    // Selective outline: where the right or lower neighbour is open water, or a farther part, the darkest step.
    const x = i % w;
    const y = (i / w) | 0;
    const open = (xx, yy) => {
      if (xx >= w || yy >= h) return true;
      const o = who[yy * w + xx];
      if (!o || PARTS[o.part].kind === 'decal') return true;
      return o.inst !== c.inst && PARTS[o.part].kind !== 'line' && depth(o) < depth(c) - 1;
    };
    if (open(x + 1, y) || open(x, y + 1)) step = 0;
    return P.c(part.ramp[step]);
  };
  for (let i = 0; i < w * h; i++) if (who[i]) t.px[i] = tone(i);
  return t;
}

/** Build the east model with `make(m)`, mirror it for the west set, render. */
function ship(w, h, west, make, paint = null) {
  const m = new Model();
  make(m);
  const t = render(west ? m.mirrored(w) : m, w, h);
  if (paint) paint(pen(t, west));
  return t;
}

/**
 * Drawing straight onto a rendered ship in east coordinates (the west set
 * mirrors x): `put` over everything, `under` only into open water, `line`
 * a pixel-thin 2D line. For thin things lit evenly, such as oars.
 */
function pen(t, west) {
  const X = (x) => (west ? t.w - 1 - Math.round(x) : Math.round(x));
  const d = {
    put: (x, y, c) => t.set(X(x), Math.round(y), P.c(c)),
    under: (x, y, c) => { if (t.get(X(x), Math.round(y)) === 0) d.put(x, y, c); },
    line: (x0, y0, x1, y1, c, mode = 'put') => {
      const n = Math.max(Math.abs(Math.round(x1) - Math.round(x0)), Math.abs(Math.round(y1) - Math.round(y0)), 1);
      for (let s = 0; s <= n; s++) d[mode](x0 + ((x1 - x0) * s) / n, y0 + ((y1 - y0) * s) / n, c);
    },
  };
  return d;
}

/* ---------------------------------------------------------- hull kit -- */

/**
 * A hull from stern (x0) to bow (x1) round row yc: `half(s)` its half beam
 * and `top(s)` its gunwale height along s = 0 (stern) .. 1 (bow). With
 * `rim`, the deck lies a voxel below the gunwale, so the far bulwark shows
 * its inner face. `paint(x, y, z)` may return another part for a voxel.
 * Returns the waterline rows per x: { x: [north, south] }.
 */
function hull(m, o) {
  const water = {};
  for (let x = o.x0; x <= o.x1; x++) {
    const s = (x - o.x0) / (o.x1 - o.x0);
    const hw = o.half(s);
    const top = Math.round(o.top(s));
    let n = Infinity;
    let so = -Infinity;
    for (let y = Math.floor(o.yc - hw - 1); y <= Math.ceil(o.yc + hw + 1); y++) {
      if (Math.abs(y - o.yc) > hw + 0.25) continue;
      n = Math.min(n, y);
      so = Math.max(so, y);
      const edge = Math.abs(y - o.yc) > hw - 0.75 || x === o.x0 || x === o.x1;
      const zTop = o.rim && !edge ? top - 1 : top;
      for (let z = 0; z <= zTop; z++) {
        const part = (o.paint && o.paint(x, y, z, zTop)) || (z === zTop && !edge && o.deck ? o.deck : o.part);
        m.add(x, y, z, part);
      }
    }
    if (n <= so) water[x] = [n, so];
  }
  return water;
}

/**
 * Foam along the south waterline of `water` (hull rows per x) that laps
 * with the phase, and a bow wave at the east end `bow` px long.
 */
function foam(m, water, ph, bow = 2) {
  const xs = Object.keys(water).map(Number).sort((a, b) => a - b);
  const xb = xs[xs.length - 1];
  for (const x of xs) {
    const [n, s] = water[x];
    const lap = k.hash(x, Math.floor(ph * 4) & 3, 61) < 0.3;
    m.add(x, s + 1, -1, 'foam', { tone: lap ? 3 : 2 });
    if (x >= xb - bow) m.add(x, n - 1, -1, 'foam', { tone: 2 });
  }
  const [n, s] = water[xb];
  m.add(xb + 1, Math.round((n + s) / 2), -1, 'foam', { tone: 3 });
  m.add(xb + 1, s, -1, 'foam', { tone: 3 });
  for (let i = 0; i <= bow; i++) m.add(xb - i, s + 2 + (i >> 1), -1, 'foam', { tone: i === 0 ? 3 : 2 });
}

/**
 * A square sail on a yard in the plane of the masts (row y), from x0 to x1,
 * its foot at z0 and its head at z1, bellying `belly` px to the south:
 * the head stays on the yard, the foot hangs a little loose.
 */
function squareSail(m, o) {
  const xc = (o.x0 + o.x1) / 2;
  const hw = (o.x1 - o.x0) / 2 + 0.5;
  const b = (x, z) => {
    const u = Math.max(-1, Math.min(1, (x - xc) / hw));
    const v = Math.max(0, Math.min(1, (o.z1 - z) / (o.z1 - o.z0)));
    return o.belly * (1 - u * u) * Math.sin(0.9 * Math.PI * v);
  };
  for (let x = o.x0; x <= o.x1; x++) {
    for (let z = o.z0; z <= o.z1; z++) {
      const n = norm([-(b(x + 0.5, z) - b(x - 0.5, z)), 1, -(b(x, z + 0.5) - b(x, z - 0.5))]);
      m.add(x, o.y + b(x, z), z, o.part || 'sail', { n, inst: o.inst });
    }
  }
  m.line([o.x0 - 1, o.y, o.z1 + 1], [o.x1 + 1, o.y, o.z1 + 1], 'spar', { tone: 2 });
}

/** A triangular sail (lateen) through the corners a, b, c ([x, z]) in row y, bellying to the south. */
function triSail(m, o) {
  const [a, b, c] = o.corners;
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  const bary = (x, z) => {
    const wa = ((b[0] - x) * (c[1] - z) - (c[0] - x) * (b[1] - z)) / area;
    const wb = ((c[0] - x) * (a[1] - z) - (a[0] - x) * (c[1] - z)) / area;
    return [wa, wb, 1 - wa - wb];
  };
  const bulge = (x, z) => {
    const [wa, wb, wc] = bary(x, z);
    return wa < 0 || wb < 0 || wc < 0 ? 0 : o.belly * 27 * wa * wb * wc;
  };
  const xs = [a[0], b[0], c[0]];
  const zs = [a[1], b[1], c[1]];
  for (let x = Math.min(...xs); x <= Math.max(...xs); x++) {
    for (let z = Math.min(...zs); z <= Math.max(...zs); z++) {
      const [wa, wb, wc] = bary(x, z);
      if (wa < -0.04 || wb < -0.04 || wc < -0.04) continue;
      const n = norm([-(bulge(x + 0.5, z) - bulge(x - 0.5, z)), 1, -(bulge(x, z + 0.5) - bulge(x, z - 0.5))]);
      m.add(x, o.y + bulge(x, z), z, 'sail', { n, inst: o.inst });
    }
  }
}

/**
 * Oars on the south side, drawn straight onto the picture at 45°: from
 * the hull's bottom row `row` down and aft into the water, `len` rows
 * long. One stroke in six steps: catch (blades forward, biting), drive,
 * finish (aft), then lifted a pixel: out, back, forward again. A splash
 * where a blade bites.
 */
const STROKE = [[1, 0], [0, 0], [-1, 0], [-1, 1], [0, 1], [1, 1]];

function oarBank(d, o) {
  const [swing, lift] = STROKE[Math.floor(o.ph * STROKE.length) % STROKE.length];
  for (const x of o.xs) {
    // The whole oar sweeps fore and aft and stays at 45°, so a close bank never runs into stripes.
    const len = o.len - lift;
    const bx = x + swing - len;
    const by = o.row + len;
    d.line(x + swing, o.row, bx, by, o.shaft ?? 'bark2');
    if (o.blade === 'tip') d.put(bx, by, o.bladeTone ?? 'soil3');
    else if (o.blade !== false) d.put(bx - 1, by, o.bladeTone ?? 'soil3');
    if (!lift && o.splash !== false) d.under(bx, by + 1, swing > 0 ? 'white0' : 'water7');
  }
}

/**
 * A paddle held by a figure: from the hands at h down to a blade beside the
 * hull on `side`; one stroke over `ph`: catch forward, pull, finish aft,
 * lifted forward again.
 */
function paddle(m, h, side, ph, reach = 2) {
  const PULL = [[1.5, 0], [-0.5, 0], [-2.5, 0], [-0.5, 1.5]];
  const [dx, z] = PULL[Math.floor(ph * 4) % 4];
  const blade = [h[0] + dx, h[1] + side * reach, z];
  m.line(h, blade, 'oar', { tone: side > 0 ? 2 : 1 });
  m.add(blade[0] - 1, blade[1], blade[2], 'oar', { tone: side > 0 ? 3 : 1 });
  if (z < 0.5 && side > 0) m.add(blade[0], blade[1] + 1, -1, 'foam', { tone: dx > 0 ? 3 : 2 });
}

/**
 * A figure at (x, y) on z, two voxels across: a hide tunic lit on its left,
 * the bare head over its left shoulder (`stand`: on dark legs).
 */
function figure(m, x, y, z, stand = false) {
  let z0 = z;
  if (stand) { m.add(x, y, z0, 'crew', { tone: 'bark0' }); z0++; }
  for (let i = 0; i < 2; i++) {
    m.add(x, y, z0 + i, 'crew', { tone: 'sand3' });
    m.add(x + 1, y, z0 + i, 'crew', { tone: 'sand1' });
  }
  m.add(x, y, z0 + 2, 'crew', { tone: 'laterite3' });
}

/** A round solid of radius r round (xc, yc) from z0 to z1 (funnels, turrets). */
function cylinder(m, xc, yc, r, z0, z1, part, opt = {}) {
  for (let z = z0; z <= z1; z++) {
    for (let y = Math.floor(yc - r); y <= Math.ceil(yc + r); y++) {
      for (let x = Math.floor(xc - r); x <= Math.ceil(xc + r); x++) {
        if ((x - xc) ** 2 + (y - yc) ** 2 <= r * r + 0.01) m.add(x, y, z, typeof part === 'function' ? part(z) : part, opt);
      }
    }
  }
}

/* -------------------------------------------------------------- raft -- */

/**
 * Stone Age raft, 16 × 16: five lashed logs, a hide-covered bundle, a
 * kneeling paddler and the pole for the tribe's pennant at the stern.
 * Frames 0–3 one paddle stroke.
 */
const RAFT = { w: 16, h: 16, frames: 4 };

function raft(f, west) {
  const R = RAFT;
  return ship(R.w, R.h, west, (m) => {
    const ph = f / R.frames;
    const water = {};
    // Three logs two voxels across, lit on their upper half; the cut ends pale on the west, dark on the east.
    const ends = [[4, 12], [3, 13], [4, 11]];
    ends.forEach(([a, b], i) => {
      for (const j of [0, 1]) {
        const y = 8 + i * 2 + j;
        for (let x = a; x <= b; x++) {
          const tone = x === a ? 'soil3' : x === b ? 'bark0' : null;
          m.add(x, y, 0, 'raftLog', tone ? { tone } : { shift: j ? -1 : 0 });
          water[x] = [Math.min(water[x]?.[0] ?? 99, y), Math.max(water[x]?.[1] ?? -99, y)];
        }
      }
    });
    // The pennant pole and a bundle of hides at the stern, the paddler standing on the far log.
    for (let z = 1; z <= 6; z++) m.add(4, 9, z, 'spar', { tone: 1 });
    m.box(5, 6, 11, 12, 1, 1, 'hide');
    figure(m, 8, 9, 1, true);
    paddle(m, [9, 10, 3], 1, ph, 4);
    foam(m, water, ph, 1);
  });
}

/* ------------------------------------------------------------ dugout -- */

/**
 * Bronze Age dugout canoe, 24 × 16: one long hollowed log pointed and
 * raised at both ends, two paddlers kneeling on alternate sides, bundles
 * between them and the pennant pole at the stern. Frames 0–3 one stroke,
 * the paddlers half a stroke apart.
 */
const DUGOUT = { w: 24, h: 16, frames: 4, x0: 2, x1: 21, yc: 10 };

function dugout(f, west) {
  const D = DUGOUT;
  return ship(D.w, D.h, west, (m) => {
    const ph = f / D.frames;
    const water = hull(m, {
      x0: D.x0, x1: D.x1, yc: D.yc, part: 'log', deck: 'hollow', rim: true,
      half: (s) => 2.4 * Math.sin(Math.PI * s),
      top: (s) => 1 + (s < 0.04 || s > 0.96 ? 1 : 0),
    });
    m.add(D.x0 + 8, D.yc, 1, 'bundle');
    m.add(D.x0 + 9, D.yc, 1, 'bundle');
    m.add(D.x0 + 9, D.yc - 1, 1, 'bundle');
    for (let z = 1; z <= 7; z++) m.add(D.x0 + 3, D.yc, z, 'spar', { tone: 1 });
    figure(m, D.x0 + 6, D.yc, 1);
    figure(m, D.x0 + 13, D.yc, 1);
    paddle(m, [D.x0 + 14, D.yc + 1, 2], 1, ph);
    paddle(m, [D.x0 + 7, D.yc - 1, 2], -1, (ph + 0.5) % 1);
    foam(m, water, ph, 2);
  });
}

/* ------------------------------------------------------------ galley -- */

/**
 * Bronze Age galley, 32 × 24: a broad wooden hull with an upswept stern
 * post and a short stem, one bank of oars (the south side's in view, every
 * 3 px; the far side's hide behind the hull), rowers' heads on the benches,
 * a square linen sail on a yard. Frames 0–5 one oar stroke, the sail
 * breathing.
 */
const GALLEY = { w: 32, h: 24, frames: 6, x0: 5, x1: 26, yc: 15, mast: 16 };

function galley(f, west) {
  const G = GALLEY;
  const ph = f / G.frames;
  const xs = [];
  for (let x = G.x0 + 5; x <= G.x1 - 3; x += 3) xs.push(x);
  return ship(G.w, G.h, west, (m) => {
    const water = hull(m, {
      x0: G.x0, x1: G.x1, yc: G.yc, part: 'wood', deck: 'deck', rim: true,
      half: (s) => 2.2 * Math.pow(Math.sin(Math.PI * s), 0.45),
      top: (s) => 2 + (s < 0.15 ? (0.15 - s) * 22 : 0) + (s > 0.88 ? (s - 0.88) * 14 : 0),
    });
    // Stern post curling up and forward.
    m.add(G.x0 - 1, G.yc, 5, 'wood');
    m.add(G.x0 - 1, G.yc, 6, 'wood');
    m.add(G.x0, G.yc, 7, 'wood');
    for (const x of xs) m.add(x, G.yc, 2, 'crew', { tone: 'laterite3' });
    for (let z = 2; z <= 13; z++) m.add(G.mast, G.yc, z, 'spar', { tone: 1 });
    squareSail(m, { x0: G.mast - 5, x1: G.mast + 5, z0: 5, z1: 11, y: G.yc, belly: 1 + 0.5 * Math.sin(TAU * ph) });
    foam(m, water, ph);
  }, (d) => oarBank(d, { xs, row: G.yc + 2, len: 4, ph, blade: 'tip' }));
}

/* ----------------------------------------------------------- trireme -- */

/**
 * Iron Age trireme, 40 × 24: a long, low hull black with pitch, a red wale,
 * the painted eye and the bronze ram at the bow, the stern curling up into
 * the aphlaston, a small square sail amidships. Its banks show as long and
 * short oars in turn every 2 px, a dense fringe against the galley's few
 * (a third length would run into a solid band at this size). Frames 0–5
 * one oar stroke, the short oars a step behind.
 */
const TRIREME = { w: 40, h: 24, frames: 6, x0: 3, x1: 34, yc: 15, mast: 20 };

function trireme(f, west) {
  const T = TRIREME;
  const ph = f / T.frames;
  const bank = (from, step) => {
    const xs = [];
    for (let x = from; x <= T.x1 - 5; x += step) xs.push(x);
    return xs;
  };
  return ship(T.w, T.h, west, (m) => {
    const water = hull(m, {
      x0: T.x0, x1: T.x1, yc: T.yc, part: 'pitch', deck: 'deckPitch', rim: true,
      half: (s) => 2.2 * Math.pow(Math.sin(Math.PI * Math.min(1, s * 0.95 + 0.03)), 0.4),
      top: (s) => 2 + (s > 0.93 ? 1 : 0),
      paint: (x, y, z) => (z === 1 && y >= T.yc + 2 && x > T.x0 + 1 && x < T.x1 - 1 ? 'wale' : null),
    });
    // Aphlaston: the stern post curling up and forward over the helmsman.
    m.line([T.x0, T.yc, 3], [T.x0 - 1, T.yc, 6], 'pitch');
    m.add(T.x0 - 1, T.yc, 7, 'pitch');
    m.add(T.x0, T.yc, 8, 'pitch');
    m.add(T.x0 + 1, T.yc, 8, 'pitch');
    m.add(T.x0 + 2, T.yc, 7, 'pitch');
    // Bronze ram at the waterline, the painted eye on the bow.
    m.box(T.x1 + 1, T.x1 + 2, T.yc, T.yc, 0, 0, 'bronze');
    m.add(T.x1 + 3, T.yc, 0, 'bronze');
    m.add(T.x1 - 3, T.yc + 2, 1, 'pitch', { tone: 'white0' });
    for (let z = 2; z <= 14; z++) m.add(T.mast, T.yc, z, 'spar', { tone: 2 });
    squareSail(m, { x0: T.mast - 4, x1: T.mast + 4, z0: 7, z1: 12, y: T.yc, belly: 1 + 0.5 * Math.sin(TAU * ph), part: 'sailT' });
    foam(m, water, ph, 3);
  }, (d) => {
    oarBank(d, { xs: bank(T.x0 + 7, 4), row: T.yc + 2, len: 5, ph });
    oarBank(d, { xs: bank(T.x0 + 9, 4), row: T.yc + 2, len: 3, ph: (ph + 1 / 6) % 1, splash: false });
  });
}

/* ------------------------------------------------------------ caravel -- */

/**
 * The caravel (Iron Age settlers, the voyage of discovery), 32 × 32: a
 * rounded hull with a high sterncastle, three masts — square sails on the
 * fore and main, a lateen on the mizzen — and a bowsprit. Frames 0–3 the
 * sails breathing.
 */
const CARAVEL = { w: 32, h: 32, frames: 4, x0: 4, x1: 27, yc: 23, main: 15, fore: 22, mizzen: 8 };

function caravel(f, west) {
  const C = CARAVEL;
  return ship(C.w, C.h, west, (m) => {
    const ph = f / C.frames;
    // A round-bellied hull, its sterncastle two voxels over the waist, a low forecastle.
    const water = hull(m, {
      x0: C.x0, x1: C.x1, yc: C.yc, part: 'wood', deck: 'deck', rim: true,
      half: (s) => 2.4 * Math.pow(Math.sin(Math.PI * Math.min(1, s * 0.8 + 0.2)), 0.6),
      top: (s) => (s < 0.24 ? 4 : s > 0.86 ? 3 : 2),
    });
    m.line([C.x1, C.yc, 3], [C.x1 + 3, C.yc, 5], 'spar', { tone: 2 });
    const breathe = 1.2 + 0.6 * Math.sin(TAU * ph);
    for (let z = 2; z <= 22; z++) m.add(C.main, C.yc, z, 'spar', { tone: 1 });
    for (let z = 3; z <= 16; z++) m.add(C.fore, C.yc, z, 'spar', { tone: 1 });
    for (let z = 4; z <= 16; z++) m.add(C.mizzen, C.yc, z, 'spar', { tone: 1 });
    squareSail(m, { x0: C.main - 4, x1: C.main + 4, z0: 5, z1: 19, y: C.yc, belly: breathe, inst: 'main' });
    squareSail(m, { x0: C.fore - 3, x1: C.fore + 3, z0: 5, z1: 14, y: C.yc, belly: breathe * 0.8, inst: 'fore' });
    triSail(m, { corners: [[C.mizzen + 3, 6], [C.mizzen - 3, 17], [C.mizzen - 3, 6]], y: C.yc, belly: breathe * 0.7, inst: 'mizzen' });
    m.line([C.mizzen + 4, C.yc, 5], [C.mizzen - 4, C.yc, 18], 'spar', { tone: 2 });
    foam(m, water, ph, 3);
  });
}

/* ------------------------------------------------------------ steamer -- */

/**
 * Industrial paddle steamer, 32 × 24: a black hull with a planked deck, a
 * white deckhouse with a row of windows, a tall red funnel with a black
 * top, the paddle wheel on the south side under the arc of its box, a mast
 * forward for the pennant. Frames 0–3 the wheel turning on by one spoke
 * (seamless) and churning the water. Smoke comes from the map at the funnel.
 */
const STEAMER = { w: 32, h: 24, frames: 4, x0: 3, x1: 28, yc: 16, funnel: 15, mast: 24, wheel: 15 };

function steamer(f, west) {
  const S = STEAMER;
  const ph = f / S.frames;
  return ship(S.w, S.h, west, (m) => {
    const water = hull(m, {
      x0: S.x0, x1: S.x1, yc: S.yc, part: 'pitch', deck: 'deckPitch', rim: false,
      half: (s) => 2.6 * Math.pow(Math.sin(Math.PI * Math.min(1, s * 0.8 + 0.2)), 0.5),
      top: (s) => 2 + (s > 0.9 ? 1 : 0),
    });
    m.box(8, 21, S.yc - 1, S.yc + 1, 3, 4, 'white');
    for (let x = 9; x <= 20; x += 2) if (x < 13 || x > 16) m.add(x, S.yc + 1, 4, 'white', { tone: 'rock1' });
    cylinder(m, S.funnel - 0.5, S.yc - 0.5, 1, 5, 11, (z) => (z >= 10 ? 'soot' : 'funnel'));
    for (let z = 3; z <= 14; z++) m.add(S.mast, S.yc, z, 'spar', { tone: 1 });
    m.line([S.mast + 1, S.yc, 13], [S.x1 - 1, S.yc, 4], 'spar', { tone: 0 });
    // The wheel in the plane south of the hull: the arc of its box, dark inside, six paddles turning round a red hub.
    const yb = S.yc + 3;
    for (let x = S.wheel - 4; x <= S.wheel + 4; x++) {
      for (let z = 0; z <= 5; z++) {
        const d = Math.hypot(x - S.wheel, z - 0.6);
        if (d <= 4.1 && z >= 1 && d > 3.1) m.add(x, yb, z, 'crew', { tone: d > 3.6 && x <= S.wheel ? 'white0' : 'rock3' });
        else if (d <= 3.1) m.add(x, yb, z, 'crew', { tone: 'pine0' });
      }
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6 + ph / 6) * TAU;
      for (let s = 1; s <= 3; s += 0.5) {
        const z = 0.6 + Math.sin(a) * s;
        if (z >= -0.4) m.add(S.wheel + Math.cos(a) * s, yb, z, 'crew', { tone: s > 2.4 ? 'bark2' : 'rock1' });
      }
    }
    m.add(S.wheel, yb, 1, 'crew', { tone: 'red1' });
    for (let x = S.wheel - 4; x <= S.wheel + 4; x++) water[x] = [water[x][0], yb];
    foam(m, water, ph, 2);
    for (let x = S.wheel - 4; x <= S.wheel + 3; x++) if (k.hash(x, f, 71) < 0.5) m.add(x, yb + 2, -1, 'foam', { tone: k.hash(x, f, 72) < 0.5 ? 3 : 2 });
  });
}

/* --------------------------------------------------------- freighter -- */

/**
 * Container ship (from the Atomic age), 40 × 24: a long, flat maroon hull
 * with a flared bow and a square stern, the white accommodation block with
 * the bridge windows and a blue funnel aft, the deck stacked with
 * containers in rows of bays, two and three high. Frames 0–1 the bow wave
 * and the foam along the hull.
 */
const FREIGHTER = { w: 40, h: 24, frames: 2, x0: 2, x1: 37, yc: 16 };

function freighter(f, west) {
  const F = FREIGHTER;
  return ship(F.w, F.h, west, (m) => {
    const water = hull(m, {
      x0: F.x0, x1: F.x1, yc: F.yc, part: 'maroon', deck: 'boxGrey', rim: false,
      half: (s) => 2.6 * Math.min(1, Math.pow((1 - s) * 4.5, 0.6), 0.8 + s * 4),
      top: (s) => 2 + (s > 0.92 ? 1 : 0),
    });
    // Accommodation block with the bridge, its funnel behind it, a mast on the roof.
    m.box(4, 8, F.yc - 2, F.yc + 2, 3, 9, 'white');
    for (let x = 4; x <= 8; x++) m.add(x, F.yc + 2, 9, 'white', { tone: 'pine0' });
    for (const z of [5, 7]) for (let x = 5; x <= 8; x += 2) m.add(x, F.yc + 2, z, 'white', { tone: 'rock1' });
    m.box(2, 3, F.yc - 1, F.yc, 3, 10, 'funnelBlue');
    m.add(2, F.yc - 1, 10, 'funnelBlue', { tone: 'pine0' });
    m.add(3, F.yc - 1, 10, 'funnelBlue', { tone: 'pine0' });
    for (let z = 10; z <= 13; z++) m.add(6, F.yc, z, 'spar', { tone: 'rock1' });
    // Containers two voxels long (about a 40-foot box at this scale), a stack of two rows to the north and three to
    // the south, two tiers, three where a bay is stowed higher; colours by a hash, mostly blue, so they read as a
    // mosaic of boxes.
    const KINDS = ['boxBlue', 'boxBlue', 'boxOrange', 'boxRed', 'boxGrey', 'boxBlue', 'boxRed', 'boxOrange'];
    for (let x = 11; x + 1 <= F.x1 - 3; x += 2) {
      const bay = (x - 11) >> 2;
      for (const [y0, y1, st] of [[F.yc - 2, F.yc - 1, 0], [F.yc, F.yc + 2, 1]]) {
        const tiers = 2 + (k.hash(bay, st, 81) < 0.4 ? 1 : 0);
        for (let z = 3; z < 3 + tiers; z++) {
          const kind = KINDS[Math.floor(k.hash(x, st * 4 + z, 89) * KINDS.length)];
          m.box(x, x + 1, y0, y1, z, z, kind, { inst: `${x}.${st}.${z}` });
        }
      }
    }
    foam(m, water, f / 2, 3);
  });
}

/* ----------------------------------------------------------- warship -- */

/**
 * Steel warship (sea battles from the Industrial age), 40 × 24: a slender
 * grey hull with a teak deck, a light grey superstructure with a tripod
 * mast and two funnels amidships, twin gun turrets fore (one raised over
 * the other) and aft. Frames 0–1 the bow wave.
 */
const WARSHIP = { w: 40, h: 24, frames: 2, x0: 3, x1: 36, yc: 16, mast: 20 };

function warship(f, west) {
  const W = WARSHIP;
  return ship(W.w, W.h, west, (m) => {
    const water = hull(m, {
      x0: W.x0, x1: W.x1, yc: W.yc, part: 'steel', deck: 'teak', rim: false,
      half: (s) => 2.9 * Math.pow(Math.sin(Math.PI * Math.min(1, s * 0.85 + 0.15)), 0.6),
      top: (s) => 2 + (s > 0.95 ? 1 : 0),
    });
    // Superstructure north of the centre line, so the teak deck shows in front of it; the bridge on top.
    const yn = W.yc - 1;
    m.box(16, 23, yn - 1, yn + 1, 3, 4, 'steelTop');
    m.box(20, 23, yn - 1, yn + 1, 5, 6, 'steelTop', { inst: 'bridge' });
    for (let x = 20; x <= 23; x++) m.add(x, yn + 1, 6, 'steelTop', { tone: 'rock0' });
    // Tripod mast with a spotting top.
    for (let z = 7; z <= 13; z++) m.add(W.mast, yn, z, 'gun', { tone: 1 });
    m.line([W.mast - 2, yn, 7], [W.mast, yn, 12], 'gun', { tone: 0 });
    m.box(W.mast - 1, W.mast + 1, yn, yn, 12, 12, 'steelTop', { inst: 'top' });
    cylinder(m, 14.5, yn - 0.5, 1, 3, 8, (z) => (z >= 8 ? 'soot' : 'steelTop'), { inst: 'f1' });
    cylinder(m, 11.5, yn - 0.5, 1, 3, 7, (z) => (z >= 7 ? 'soot' : 'steelTop'), { inst: 'f2' });
    // Turrets with one long barrel each: at this size twin barrels would run into a dark block.
    const turret = (xc, z0, dir, len, inst) => {
      cylinder(m, xc, W.yc, 1.5, z0, z0 + 1, 'turret', { inst });
      m.line([xc + dir * 2, W.yc, z0 + 1], [xc + dir * (1 + len), W.yc, z0 + 1], 'gun', { tone: 0 });
    };
    m.box(25, 27, W.yc - 1, W.yc + 1, 3, 3, 'steel', { inst: 'barbette' });
    turret(30, 3, 1, 5, 'A');
    turret(26, 4, 1, 3, 'B');
    turret(8, 3, -1, 5, 'Y');
    foam(m, water, f / 2, 3);
  });
}

/* --------------------------------------------------------------- wake -- */

/**
 * Wake behind a moving ship, 24 × 8, east frames 0–3: two foam arms
 * fanning out from the stern (the apex at the right, rows 3–4) and the
 * churned water between them near the stern. The foam lies still on the
 * sea while the ship moves on, so its crests run back 1 px a frame (period
 * 4, seamless); further back it thins out and darkens.
 */
const WAKE = { w: 24, h: 8, frames: 4 };

function wake(f, west) {
  const t = new k.Tex(WAKE.w, WAKE.h);
  const put = (x, y, c) => t.set(west ? WAKE.w - 1 - x : x, y, P.c(c));
  for (let d = 0; d < WAKE.w; d++) {
    const x = WAKE.w - 1 - d;
    const u = d - f;
    const age = d / (WAKE.w - 1);
    // Two arms opening from the stern: crests every 4 px running back, gaps and losses further out.
    const out = Math.round(d * 0.135);
    if (d >= 3) {
      for (const y of [3 - out, 4 + out]) {
        if (y < 0 || y >= WAKE.h) continue;
        const phase = ((u % 4) + 4) % 4;
        if (age > 0.45 && phase === 3) continue;
        if (age > 0.6 && k.hash(Math.floor(u / 4), y, 91) < (age - 0.6) * 2) continue;
        put(x, y, phase === 0 && age < 0.7 ? 'white0' : age < 0.75 ? 'water7' : 'water6');
      }
    }
    // Churned water behind the stern, breaking up as it falls back.
    if (d < 11) {
      for (const y of [3, 4]) {
        if (d > 2 && k.hash(u, y, 93) < age * 1.7) continue;
        put(x, y, d < 4 || k.hash(u, y, 94) < 0.45 ? 'white0' : 'water7');
      }
    }
  }
  return t;
}

/* ------------------------------------------------------------- battle -- */

/**
 * A volley, 16 × 16. Frames 0–3 a hail of arrows falling steeply, two of
 * them burning (fletching up, head down, the flame and a wisp of smoke
 * trailing up behind the head); a looped fall of 4 px a frame. Frames 4–7
 * a gun firing, once: the flash, the fireball choking in its smoke, the
 * white powder smoke rising and thinning out.
 */
function volley(f) {
  const t = new k.Tex(16, 16);
  const put = (x, y, c) => t.set(x, ((y % 16) + 16) % 16, P.c(c));
  if (f < 4) {
    const ARROWS = [[2, 1, 0], [6, 9, 1], [9, 3, 0], [12, 12, 0], [4, 14, 0], [11, 7, 1], [14, 0, 0]];
    for (const [x, y0, fire] of ARROWS) {
      const y = y0 + f * 4;
      put(x, y, 'ice4');
      put(x, y + 1, 'bark2');
      put(x, y + 2, 'bark1');
      if (fire) {
        put(x, y - 1, 'rock2');
        put(x + 1, y + 2, 'orange0');
        put(x, y + 3, 'yellow0');
        put(x - 1, y + 1, 'red1');
      } else {
        put(x, y + 3, 'rock0');
      }
    }
    return t;
  }
  const g = f - 4;
  if (g === 0) {
    // The flash: a white core, yellow round it, ragged orange tongues and red sparks.
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const dx = x + 0.5 - 8;
        const dy = y + 0.5 - 9;
        const a = Math.atan2(dy, dx);
        const r = Math.hypot(dx, dy) / (2.6 + 1.6 * Math.max(0, Math.cos(a * 4 + 0.6)) + k.hash(Math.round(a * 3), 0, 99));
        if (r > 1) continue;
        put(x, y, r < 0.35 ? 'white0' : r < 0.65 ? 'yellow0' : 'orange0');
      }
    }
    for (const [x, y] of [[2, 6], [13, 5], [3, 13], [14, 12], [8, 2]]) put(x, y, 'red1');
    return t;
  }
  const smoke = [
    [{ x: 8, y: 9, r: 3.4 }, { x: 5.5, y: 10, r: 2.4 }, { x: 10.5, y: 9.5, r: 2.6 }],
    [{ x: 8, y: 7.5, r: 4 }, { x: 4.5, y: 9, r: 3 }, { x: 11.5, y: 8.5, r: 3.2 }, { x: 8, y: 11, r: 2.6 }],
    [{ x: 8, y: 6, r: 4.4 }, { x: 4, y: 7.5, r: 3.2 }, { x: 12, y: 7, r: 3.4 }, { x: 7, y: 10, r: 2.4 }],
  ][g - 1];
  fx.billow(t, smoke, ['rock1', 'rock2', 'rock3', 'rock4', 'white0']);
  if (g === 1) {
    for (const [x, y, c] of [[8, 9, 'yellow0'], [7, 9, 'orange0'], [8, 10, 'orange0'], [9, 9, 'orange0'], [7, 10, 'red1'], [9, 10, 'red1']]) put(x, y, c);
  }
  if (g === 3) fx.crumble(t, 0.4, 103);
  return t;
}

/**
 * A shot falling into the water, 8 × 16, standing on its last row: 0 the
 * crown where it hits, 1–2 the column of spray shooting up with a crown
 * opening at its top, 3 the column collapsing into drops over a foam
 * mound, 4 the foam settling with the last drops falling back.
 */
function splash(f) {
  const t = new k.Tex(8, 16);
  const put = (x, y, c) => t.set(x, y, P.c(c));
  const foot = (wide) => {
    for (let x = 4 - wide; x < 4 + wide; x++) put(x, 15, x === 4 - wide || x === 3 + wide ? 'water6' : 'water7');
  };
  // A column of spray from row `top` down to the foam, narrow in the middle, flaring into a ragged crown.
  const column = (top, seed, flare = 1.6) => {
    const hgt = 14 - top;
    for (let y = top; y <= 14; y++) {
      const u = (14 - y) / hgt;
      const half = 1.6 + flare * Math.max(0, u - 0.55) * 2.2 + (u < 0.15 ? 1.2 : 0);
      for (let x = 0; x < 8; x++) {
        const d = (x + 0.5 - 4) / half;
        if (Math.abs(d) > 1) continue;
        if (u > 0.65 && Math.abs(d) > 0.45 && k.hash(x, y, seed) < 0.4) continue;
        const grain = k.hash(x, y >> 1, seed + 1);
        put(x, y, d > 0.5 ? 'ice3' : d < -0.2 || grain < 0.5 ? 'white0' : 'ice4');
      }
    }
  };
  const drops = (list) => { for (const [x, y] of list) put(x, y, 'ice4'); };
  switch (f) {
    case 0:
      foot(3);
      for (const x of [2, 3, 4, 5]) put(x, 14, x < 4 ? 'white0' : 'ice4');
      put(2, 13, 'white0'); put(5, 13, 'ice4');
      drops([[1, 12], [6, 11]]);
      break;
    case 1:
      foot(4);
      column(8, 131, 0.5);
      drops([[1, 7], [6, 8]]);
      break;
    case 2:
      foot(4);
      column(2, 133);
      drops([[0, 4], [7, 5], [2, 0], [5, 1]]);
      break;
    case 3:
      foot(4);
      column(9, 135);
      drops([[1, 3], [3, 2], [5, 4], [6, 2], [2, 6], [4, 5], [0, 7], [7, 8]]);
      break;
    default:
      foot(4);
      for (const x of [2, 3, 4, 5]) put(x, 14, x < 4 ? 'white0' : 'ice4');
      put(3, 13, 'white0'); put(4, 13, 'ice4');
      drops([[1, 9], [6, 11], [3, 7]]);
  }
  return t;
}

/**
 * A ship lost in battle, 32 × 24, drawn over the sinking hull (its deck
 * line about row 14, its waterline about row 17). Frames 0–3 burning,
 * looped: three fires flicker along the deck, black smoke rises in
 * puffs 1 px a frame and leans east with the wind, foam churns at the
 * waterline, planks float. Frames 4–7 once, the hull gone: foam boils up
 * where it went down, the last smoke drifts off and breaks up, a ring of
 * foam spreads and breaks, the planks drift apart and the last go under.
 */
const FIRES = [[10, 3.5, 0], [16, 4.5, 1.7], [22, 3, 3.1]];

function flameAt(t, cx, base, hgt) {
  for (let y = base; y > base - hgt - 1; y--) {
    const u = (base - y + 0.5) / hgt;
    if (u > 1) continue;
    const half = 1.6 * (1 - u * u * 0.9) + 0.2;
    for (let x = Math.floor(cx - 2); x <= Math.ceil(cx + 2); x++) {
      const d = Math.abs(x + 0.5 - cx) / half;
      if (d > 1) continue;
      const hot = (1 - d) * (1 - u);
      t.set(x, y, P.c(d > 0.7 || u > 0.8 ? 'red1' : hot > 0.45 ? 'yellow0' : 'orange0'));
    }
  }
}

function wreck(f) {
  const t = new k.Tex(32, 24);
  const put = (x, y, c) => t.set(x, y, P.c(c));
  const burning = f < 4;
  const g = burning ? f : f - 4;
  // Planks drifting, the last ones going under.
  const PLANKS = [[5, 19, 3, 1], [24, 20, 2, -1], [12, 21, 2, 0], [27, 17, 3, 1], [7, 16, 2, -1]];
  PLANKS.forEach(([x, y, l, dir], i) => {
    if (!burning && i >= 5 - g) return;
    const dx = burning ? 0 : dir * g;
    for (let j = 0; j < l; j++) put(x + dx + j, y, j === 0 ? 'soil3' : 'bark1');
    put(x + dx - 1, y, 'water7');
  });
  if (burning) {
    // Foam churning along the waterline under the fires.
    for (let x = 7; x <= 25; x++) if (k.hash(x, g, 117) < 0.45) put(x, 17 + (k.hash(x, g, 118) < 0.3 ? 1 : 0), k.hash(x, g, 119) < 0.4 ? 'white0' : 'water7');
  } else {
    // The ring of foam where the hull went down, spreading and breaking up.
    const rx = 9 + g * 2.5;
    const ry = 2 + g * 0.8;
    for (let s = 0; s < 160; s++) {
      const a = (s / 160) * TAU;
      if (k.hash(Math.floor(s / 6), g, 111) < g * 0.25) continue;
      const x = Math.round(16 + rx * Math.cos(a) - 0.5);
      const y = Math.round(17 + ry * Math.sin(a));
      if (x >= 0 && x < 32 && y < 24) put(x, y, Math.sin(a) < 0 || g > 1 ? 'water6' : 'water7');
    }
    // Boiling foam and bubbles inside it.
    const boil = [10, 6, 3, 1][g];
    for (let i = 0; i < boil; i++) {
      const x = 9 + Math.floor(k.hash(i, g, 121) * 14);
      const y = 16 + Math.floor(k.hash(i, g, 122) * 3);
      put(x, y, 'white0');
      if (g === 0) { put(x + 1, y, 'white0'); put(x, y - 1, 'water7'); }
    }
  }
  // Black smoke: puffs rising 1 px a frame, 4 px apart (seamless over 4 frames), growing and leaning east.
  const smoke = new k.Tex(32, 24);
  const puffs = [];
  const rise = burning ? g : 4 + g * 2.5;
  for (let i = 0; i < 4; i++) {
    const up = i * 4 + (rise % 4);
    if (!burning && i < g) continue;
    puffs.push({ x: 16 + up * 0.4 + (i % 2 ? 0.8 : -0.6), y: 12 - up, r: 2 + up * 0.2 });
  }
  if (puffs.length) fx.billow(smoke, puffs, ['pine0', 'rock0', 'rock1', 'rock2']);
  if (!burning) fx.crumble(smoke, 0.15 + g * 0.2, 125 + g);
  t.stamp(smoke, 0, 0);
  if (burning) {
    for (const [x, h, phase] of FIRES) flameAt(t, x, 15, h + 1.2 * Math.sin((TAU * g) / 4 + phase));
    for (const [x] of FIRES) { put(Math.round(x) - 1, 16, 'red1'); put(Math.round(x), 16, 'orange0'); }
  }
  return t;
}

/* ------------------------------------------------------------ frames -- */

/** East frames first, then the same frames for the west set. */
const directed = (fn, per) => (f) => fn(f % per, f >= per);

module.exports = {
  sprites: {
    ship_raft: directed(raft, RAFT.frames),
    ship_dugout: directed(dugout, DUGOUT.frames),
    ship_galley: directed(galley, GALLEY.frames),
    ship_trireme: directed(trireme, TRIREME.frames),
    ship_sailer: directed(caravel, CARAVEL.frames),
    ship_steamer: directed(steamer, STEAMER.frames),
    ship_freighter: directed(freighter, FREIGHTER.frames),
    ship_warship: directed(warship, WARSHIP.frames),
    ship_wake: directed(wake, 4),
    ship_volley: volley,
    ship_splash: splash,
    ship_wreck: wreck,
  },
  textures: {},
};
