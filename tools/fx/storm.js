/* =============================================================================
 * SimEarth 2.0 — hurricane art (Wirbelsturm), seen from orbit
 * -----------------------------------------------------------------------------
 * The mature storm (96×96) and the small forming one (48×48), one set per
 * hemisphere. The cloud is a height field: a dense central overcast domed
 * round a clear eye, spiral rain bands curling out of it and breaking into
 * cells, thin outflow cirrus fraying at the rim, and cumulus towers bubbling
 * on top of it all. The surface is lit from the upper left by its slope,
 * taller cloud shades lower cloud behind it, and the whole cloud throws a
 * dithered shadow down-right onto the ground. The eye is a pit: its far
 * (lower-right) inner wall catches the light, its near wall lies in shadow.
 * Rotation loops: a storm is built from identical arms, and one loop turns it
 * by the angle between two arms (hurricane: 4 arms, 90° over 8 frames; the
 * forming storm: 3 arms, 120° over 4 frames). A static envelope in screen space (fuller
 * bands in the north-east, broken in the south-west) keeps it from reading
 * as a pinwheel. The southern set mirrors the form, never the finished
 * pixels, and lights it afresh (docs/ereignisse-2026-10/stil.md).
 * Hurricane frames 8–15 repeat 0–7 with a few towers lit from within
 * (lightning), and differ from them only round those towers.
 * Style: docs/ereignisse-2026-10/stil.md · contract: tools/fx/catalog.js.
 * ========================================================================== */
'use strict';

const k = require('../terrain/kit');
const P = require('../terrain/palette');

const smoothstep = (a, b, v) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Light from the upper left and above; its slope sets how far tall cloud shades lower cloud. */
const LIGHT = (() => {
  const v = [-1, -1, 1.1];
  const n = Math.hypot(...v);
  return v.map((c) => c / n);
})();
const SUN_SLOPE = LIGHT[2] / Math.hypot(LIGHT[0], LIGHT[1]);

/** Cloud tones, dark to light; the cirrus veil takes two of them, the ground shadow one dark sea colour. */
const RAMP = ['rock0', 'rock1', 'ice0', 'ice1', 'ice2', 'ice3', 'ice4', 'white0'];
const VEIL = ['ice1', 'ice2'];
const SHADOW = 'water0';

/* ------------------------------------------------------------- form -- */

/** 1-D value noise, smooth, 0..1. */
function noise1(v, seed) {
  const i = Math.floor(v);
  const t = v - i;
  const s = t * t * (3 - 2 * t);
  return k.hash(i, 0, seed) * (1 - s) + k.hash(i + 1, 0, seed) * s;
}

/**
 * A storm's form in its own frame (north: arms wind clockwise outwards):
 * `base(rho, theta, env)` the height of the overcast and the bands, `env`
 * the screen-space envelope at that pixel; `towers` the cumulus domes
 * ({ rho, theta, r, dome, id }) bubbling on top, identical in every sector.
 */
function makeForm(o) {
  const sector = (Math.PI * 2) / o.arms;
  const base = (rho, theta, env) => {
    if (rho < o.eye) return 0;
    // Spiral phase: whole numbers on the arms' crests; s > 0 outside a band, < 0 inside it.
    const psi = (theta + o.twist * Math.log(rho / o.root)) / sector;
    const u = psi - Math.floor(psi);
    const s = u < 0.5 ? u : u - 1;
    const band = Math.exp(-((s / (s > 0 ? o.outer : o.inner)) ** 2));
    // Central dense overcast: highest on the eyewall, its rim pulled out along the arms' roots.
    const wall = smoothstep(o.eye - 0.4, o.eye + 2.6, rho);
    const cdoH = o.cdoTop - (o.cdoTop - o.cdoRim) * smoothstep(o.eye + 2, o.cdo, rho);
    const cdo = (o.eyeFloor + (cdoH - o.eyeFloor) * wall) * (1 - smoothstep(o.cdo - 3, o.cdo + 4, rho - band * o.pull)) + Math.exp(-((s / 0.3) ** 2)) * o.etch;
    // Bands: lower outwards, broken by gaps that open wide where the envelope is low, fading out at `reach`.
    let gate = 1;
    for (const [at, half] of o.gaps) {
      const open = half * (1.5 - env);
      gate *= smoothstep(open - 0.5, open + 0.5, Math.abs(rho - at));
    }
    const bandH = (o.bandIn - (o.bandIn - o.bandOut) * smoothstep(o.root, o.reach, rho)) * (1 - smoothstep(o.reach - 4, o.reach + 2, rho));
    const arm = band * bandH * gate * (0.75 + 0.25 * env) * smoothstep(o.root - 6, o.root, rho);
    return Math.max(cdo, arm);
  };
  // Towers: a jittered polar grid over one sector, copied to the others.
  const towers = [];
  let id = 0;
  for (let ring = 0, rho = o.eye + 1.5; rho < o.reach + 2; ring++) {
    const r = o.tower(rho);
    const per = Math.max(1, Math.round((sector * rho) / (r * 1.25)));
    for (let n = 0; n < per; n++) {
      const j = (s) => k.hash(ring, n, o.seed + s) - 0.5;
      const rr = rho + j(1) * r * 0.9;
      const th = ((n + 0.5 + j(2) * 0.7) / per) * sector;
      const tr = r * (1 + j(3) * 0.6);
      for (let a = 0; a < o.arms; a++) {
        towers.push({ rho: rr, theta: th + a * sector, r: tr, dome: o.dome(rr), id: id++ });
      }
    }
    rho += r * 1.1;
  }
  return { base, towers, sector };
}

/* ---------------------------------------------------------- painting -- */

/**
 * Paint one frame: the form turned anticlockwise by `turn` (mirrored for the
 * south, which then turns clockwise), lit, its veil and ground shadow added.
 * `flash`: a flash frame's number, lighting a few towers from within.
 */
function paint(size, o, form, turn, south, flash = null) {
  const c = size / 2;
  const n = size * size;
  // Screen pixel -> the storm's own frame.
  const frame = (px, py) => {
    let dx = px - c;
    const dy = py - c;
    if (south) dx = -dx;
    return { rho: Math.hypot(dx, dy), theta: Math.atan2(-dy, dx) - turn, ang: Math.atan2(-dy, dx) };
  };
  const envAt = (ang, rho) => 0.5 + 0.5 * Math.cos(ang - o.envAngle) * smoothstep(o.cdo, o.reach, rho);
  // Base heights on a grid one pixel wider all round, for slopes by central differences.
  const W = size + 2;
  const zb = new Float32Array(W * W);
  for (let y = -1; y <= size; y++) {
    for (let x = -1; x <= size; x++) {
      const f = frame(x + 0.5, y + 0.5);
      zb[(y + 1) * W + x + 1] = form.base(f.rho, f.theta, envAt(f.ang, f.rho));
    }
  }
  const B = (x, y) => zb[(y + 1) * W + x + 1];
  // Towers in screen space.
  const towers = form.towers.map((t) => {
    const th = t.theta + turn;
    let x = Math.cos(th) * t.rho;
    if (south) x = -x;
    return { x: c + x, y: c - Math.sin(th) * t.rho, r: t.r, dome: t.dome, rho: t.rho, id: t.id };
  });
  const z = new Float32Array(n);
  const owner = new Int32Array(n).fill(-1);
  const gx = new Float32Array(n);
  const gy = new Float32Array(n);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const b = B(x, y);
      if (b <= 0.05) continue;
      let h = 0;
      let tx = 0;
      let ty = 0;
      let who = -1;
      for (let p = 0; p < towers.length; p++) {
        const q = towers[p];
        const dx = x + 0.5 - q.x;
        const dy = y + 0.5 - q.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= q.r * q.r) continue;
        const s = Math.sqrt(q.r * q.r - d2);
        const hh = q.dome * s;
        if (hh > h) {
          h = hh;
          who = p;
          // The slope is capped at the rim, so two towers meet in a soft crease, not a hard seam.
          const k2 = q.dome / Math.max(o.rim, s);
          tx = -dx * k2;
          ty = -dy * k2;
        }
      }
      // Towers grow where there is cloud to grow from: thin at the fringe.
      const grow = Math.min(1, b / o.growAt);
      z[i] = b + h * grow;
      if (z[i] < o.edge) continue;
      owner[i] = who;
      gx[i] = (B(x + 1, y) - B(x - 1, y)) / 2 + tx * grow;
      gy[i] = (B(x, y + 1) - B(x, y - 1)) / 2 + ty * grow;
    }
  }
  // Crumbs go: a cloud pixel needs two cloud neighbours.
  const raw = (x, y) => x >= 0 && y >= 0 && x < size && y < size && z[y * size + x] >= o.edge;
  const mask = new Uint8Array(n);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (raw(x, y)) mask[y * size + x] = raw(x - 1, y) + raw(x + 1, y) + raw(x, y - 1) + raw(x, y + 1) >= 2 ? 1 : 0;
    }
  }
  const cloud = (x, y) => x >= 0 && y >= 0 && x < size && y < size && mask[y * size + x] === 1;
  const t = new k.Tex(size, size);
  const steps = new Int8Array(n).fill(-1);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (!cloud(x, y)) continue;
      const len = Math.hypot(gx[i], gy[i], 1);
      const diffuse = Math.max(0, (-gx[i] * LIGHT[0] - gy[i] * LIGHT[1] + LIGHT[2]) / len);
      let shade = 0;
      for (let s = 1; s < 30; s++) {
        const sx = x - s;
        const sy = y - s;
        if (sx < 0 || sy < 0) break;
        const over = z[sy * size + sx] - (z[i] + s * Math.SQRT2 * SUN_SLOPE);
        if (over > 0.8) { shade = Math.min(1, over / 3 + 0.4); break; }
      }
      // Height lifts the tone: the overcast's tops shine, the low bands stay grey.
      let b = o.ambient + diffuse * (1 - 0.6 * shade) + (z[i] - o.mid) * o.lift;
      // The silhouette: a dark lower-right edge, no outline up-left.
      if (!cloud(x + 1, y) || !cloud(x, y + 1)) b -= 0.14;
      steps[i] = Math.max(0, Math.min(RAMP.length - 1, Math.floor(b * RAMP.length)));
    }
  }
  if (flash !== null) lightning(size, towers, steps, o, flash);
  for (let i = 0; i < n; i++) if (steps[i] >= 0) t.px[i] = P.c(RAMP[steps[i]]);
  // Outflow cirrus: fine streaks along the spiral beyond the bands, thinning outwards in an ordered pattern.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (cloud(x, y)) continue;
      const f = frame(x + 0.5, y + 0.5);
      if (f.rho < o.veilFrom || f.rho > c - 1) continue;
      // Streaks parallel to the bands, on their outer side, broken into wisps along them.
      const psi = (f.theta + o.twist * Math.log(f.rho / o.root)) / form.sector;
      const u = psi - Math.floor(psi);
      const side = Math.exp(-(((u - o.veilPhase) / o.veilWidth) ** 2));
      const streak = (0.5 + 0.5 * Math.cos(psi * Math.PI * 2 * o.veilStreaks)) ** 2;
      const strand = ((Math.floor(psi * o.veilStreaks + 0.5) % o.veilStreaks) + o.veilStreaks) % o.veilStreaks;
      const wisp = noise1(Math.log(f.rho / o.root) * 18 + strand * 3.7, o.seed + 5);
      const v = side * streak * wisp * 1.6 * smoothstep(o.veilFrom, o.veilFrom + 6, f.rho) * (1 - smoothstep(o.veilTo, c - 0.5, f.rho));
      if (v * 16 <= k.BAYER4[y & 3][x & 3] + 2) continue;
      t.set(x, y, P.c(v > 0.55 ? VEIL[1] : VEIL[0]));
    }
  }
  // Ground shadow down-right of the cloud: a half-tone under thick cloud, sparser under its fringe.
  const dark = P.c(SHADOW);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (cloud(x, y)) continue;
      const sx = x - o.shadow;
      const sy = y - o.shadow;
      if (!cloud(sx, sy)) continue;
      let thick = 0;
      for (let v = -1; v <= 1; v++) for (let u = -1; u <= 1; u++) if (cloud(sx + u, sy + v)) thick++;
      if (thick < 4) continue;
      if (k.BAYER4[y & 3][x & 3] < (thick >= 9 ? 8 : 4)) t.set(x, y, dark);
    }
  }
  return t;
}

/**
 * Lightning inside the cloud: in flash frame `flash`, one tower in the
 * eyewall and two out in the bands glow from within, chosen among those
 * that lie in shade (a flash on a sunlit top would not show). The glow is
 * white at the core, ice towards its rim, and lifts the tones round it.
 */
function lightning(size, towers, steps, o, flash) {
  const tone = (q) => {
    const x = Math.floor(q.x);
    const y = Math.floor(q.y);
    return x < 0 || y < 0 || x >= size || y >= size ? -1 : steps[y * size + x];
  };
  const dim = (q) => tone(q) >= 0 && tone(q) <= 3;
  const pick = (list, salt) => (list.length ? [list[Math.floor(k.hash(flash, salt, o.seed + 77) * list.length)]] : []);
  const lit = [
    ...pick(towers.filter((q) => q.rho < o.eye + 5 && dim(q)), 1),
    ...pick(towers.filter((q) => q.rho > o.cdo && q.rho < o.cdo + 9 && dim(q)), 2),
    ...pick(towers.filter((q) => q.rho >= o.cdo + 9 && q.rho < o.reach - 4 && dim(q)), 3),
  ];
  for (const q of lit) {
    const reach = q.r + 3.5;
    for (let y = Math.floor(q.y - reach); y <= q.y + reach; y++) {
      for (let x = Math.floor(q.x - reach); x <= q.x + reach; x++) {
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const i = y * size + x;
        if (steps[i] < 0) continue;
        const d = Math.hypot(x + 0.5 - q.x, y + 0.5 - q.y) / reach;
        if (d >= 1) continue;
        // White at the core, fading through the ice tones in an ordered pattern, never darker than it was.
        const glow = Math.min(7, Math.floor(3 + (1 - d) * 6 + k.BAYER4[y & 3][x & 3] / 16));
        steps[i] = Math.max(steps[i], glow);
      }
    }
  }
}

/* ------------------------------------------------------------ storms -- */

const HURRICANE = {
  seed: 11,
  arms: 4,
  eye: 4.3,
  eyeFloor: 4,
  cdoTop: 16,
  cdoRim: 10,
  cdo: 18,
  pull: 6,
  etch: 1.2,
  root: 15,
  twist: 2.4,
  inner: 0.12,
  outer: 0.24,
  gaps: [[26.5, 0.9], [31.5, 1.4], [36.5, 1.8]],
  growAt: 1.2,
  bandIn: 10,
  bandOut: 2.6,
  reach: 40,
  ambient: 0.08,
  edge: 2,
  mid: 9,
  lift: 0.025,
  envAngle: Math.PI / 4,
  tower: (rho) => (rho < 9 ? 2.8 : rho < 20 ? 3.6 : rho < 30 ? 3.2 : 2.7),
  dome: (rho) => (rho < 9 ? 0.9 : rho < 18 ? 0.4 : 0.9),
  rim: 1.3,
  veilFrom: 30,
  veilTo: 42,
  veilStreaks: 9,
  veilPhase: 0.3,
  veilWidth: 0.2,
};

/** The forming storm: three thin arms round a small core with no eye yet, lower and sparser. */
const SMALL = {
  size: 48,
  frames: 4,
  seed: 23,
  arms: 3,
  eye: 0,
  eyeFloor: 8,
  cdoTop: 8,
  cdoRim: 6,
  cdo: 5,
  pull: 3,
  etch: 0.8,
  root: 5,
  twist: 1.9,
  inner: 0.1,
  outer: 0.17,
  gaps: [[11.5, 0.5], [15, 0.8], [18, 1]],
  growAt: 1.2,
  bandIn: 7,
  bandOut: 2.4,
  reach: 19,
  ambient: 0.12,
  edge: 2,
  mid: 6,
  lift: 0.03,
  envAngle: Math.PI / 4,
  tower: (rho) => (rho < 6 ? 2.2 : 2),
  dome: () => 1,
  rim: 1.3,
  veilFrom: 13,
  veilTo: 20,
  veilStreaks: 6,
  veilPhase: 0.3,
  veilWidth: 0.2,
  shadow: 4,
};
Object.assign(HURRICANE, { size: 96, frames: 8, shadow: 5, flash: true });

const forms = new Map();
/** Frame `f` of a storm: one loop turns it by the angle between two arms; flash frames follow the loop. */
function storm(o, f, south) {
  if (!forms.has(o)) forms.set(o, makeForm(o));
  const form = forms.get(o);
  const step = f % o.frames;
  const turn = (step / o.frames) * form.sector;
  return paint(o.size, o, form, turn, south, o.flash && f >= o.frames ? step : null);
}

module.exports = {
  sprites: {
    hurricane: (f) => storm(HURRICANE, f, false),
    hurricane_south: (f) => storm(HURRICANE, f, true),
    storm_small: (f) => storm(SMALL, f, false),
    storm_small_south: (f) => storm(SMALL, f, true),
  },
};
