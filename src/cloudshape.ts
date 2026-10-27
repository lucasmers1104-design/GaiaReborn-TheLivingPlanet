/* =============================================================================
 * Gaia Reborn — the status bar's clouds: shape and light (no DOM)
 * -----------------------------------------------------------------------------
 * One white cumulus per readout (topbarart.ts draws it, livingtopbar.ts
 * places it): a core over the readout's icon and text (`box`, measured in the
 * game), a crown of domes in the free rows above it after one of seven
 * archetypes picked by the panel's seed (a tower, twin towers, a flat top, a
 * rising slope, a drifting heap, a congestus, a mound; a small panel gets a
 * small cumulus), rounded ends and a flat base. A smooth union of the circles
 * rounds the notches; each puff is lit as a sphere from the upper left; behind
 * the readout lies only a calm band; below it a shade that wanders and
 * deepens to the lower right; a full outline, lighter where it faces the
 * light. The style comes from the seed alone and the positions from seed and
 * size, so a panel keeps its cloud when its width changes.
 * ========================================================================== */

namespace SE {
  /** Art px [x0, y0, x1, y1) of a cloud that must be cloud: where its panel's icon and text are. */
  export type CloudBox = readonly [number, number, number, number];

  /**
   * Tones per pixel, indices into the palette ramps 'cloud' and 'cloudLit': 0 outline in shadow, 1 outline
   * facing the light, 2 deep underside, 3 shade, 4 soft shade, 5 cool body, 6 body, 7 white.
   */
  export const CLOUD_TONES = 8;

  /** Light from the upper left, towards the viewer. */
  const LX = -0.52, LY = -0.7, LZ = 0.49;
  /** Art px of the fillet between two puffs in the smooth union. */
  const FILLET = 1.8;
  type Arch = 'tower' | 'twin' | 'flat' | 'slope' | 'drift' | 'congestus' | 'mound';
  const ARCH: readonly Arch[] = ['tower', 'twin', 'flat', 'slope', 'drift', 'congestus', 'mound', 'tower'];
  /** How high the two ends' upper puffs reach (0 the top row … 1 the core's top), before mirroring. */
  const ENDS: Readonly<Record<Arch, readonly [number, number]>> = {
    tower: [0.72, 0.8], twin: [0.7, 0.82], flat: [0.42, 0.48], slope: [0.9, 0.2], drift: [0.95, 0.6], congestus: [0.62, 0.7], mound: [0.85, 0.8],
  };

  /** A puff: centre and radius in art px, the height its sphere sits at (for the heightfield), kind 0 back puff, 1 foot or side, 2 dome. */
  interface Puff { readonly x: number; readonly y: number; readonly r: number; readonly z: number; readonly kind: number }

  const smin = (a: number, b: number): number => {
    const e = Math.max(FILLET - Math.abs(a - b), 0) / FILLET;
    return Math.min(a, b) - e * e * FILLET * 0.25;
  };

  /** The cloud w × h art px around `box` for panel `seed`: a tone per pixel (CLOUD_TONES), -1 where the map shows. */
  export function cloudTones(w: number, h: number, seed: number, box: CloudBox): Int8Array {
    const [bx0, by0, bx1, by1] = box;
    const st = new Rng(seed * 7919 + 1013);
    const rng = new Rng((seed * 7919 + w * 131 + h * 17 + 3) >>> 0);
    const small = w < 1.5 * h || bx1 - bx0 < 0.5 * h;
    // A small cloud floats a little higher, so it keeps a cumulus's proportions instead of a pillar's.
    const base = small ? Math.min(h - 1, by1 + Math.max(2, Math.round(h * 0.12))) : h - 1;
    // The core: the box plus a 1-px ring.
    const xl = Math.max(0, bx0 - 1), xr = Math.min(w - 1, bx1);
    const yt = Math.max(0, by0 - 1);
    const boxH = Math.max(1, by1 - by0);
    const span = xr + 1 - xl;
    const flip = st.next() < 0.5;
    const arch = ARCH[seed % ARCH.length];
    const S: Puff[] = [];
    const put = (x: number, y: number, r: number, z: number, kind = 2): Puff => {
      const rr = Math.max(1.2, Math.min(r, (w - 1.2) / 2));
      const s = { x: clamp(x, rr + 0.4, w - rr - 0.4), y: Math.max(y, rr + 0.05), r: rr, z, kind };
      S.push(s);
      return s;
    };
    const X = (t: number): number => xl + (flip ? 1 - t : t) * span;
    const T = (lvl: number): number => lvl * yt;
    // A dome with its top on row `top`, centred on row `c` inside the body: higher domes are bigger arcs.
    const dome = (x: number, top: number, c: number, z = 2): Puff => put(x, c, Math.max(1.5, c - top), z);
    const cRow = (f: number): number => yt + boxH * f;
    // A tower: a narrow puff on top, wider supports below it down to the body.
    const tower = (x: number, top: number, r: number, lean: number, z = 2.6): void => {
      let c = put(x, top + r, r, z);
      for (let n = 0; n < 4 && c.y < yt + 1; n++) c = put(c.x + lean * c.r * 0.3, c.y + c.r * 0.85, c.r * 1.22, z - 0.3);
    };

    if (small) {
      // A wide base mass, one dome off-centre, a smaller one on the other side; the feet rise to the main
      // dome's widest row, so the sides only widen downwards.
      const sd = flip ? -1 : 1;
      const rm = clamp(w * 0.3, 2.5, 12);
      const top = Math.min(T(st.range(0.05, 0.3)), yt - 2);
      const m = put(w / 2 + sd * w * st.range(0.04, 0.07), Math.max(top + rm, yt + 0.5 - rm * 0.2), rm, 2.4);
      const rb = clamp(Math.min(w * 0.3, (base + 0.5 - m.y) / 1.75), 2.5, 10);
      put(rb + 0.5, base + 0.5 - rb * 0.75, rb, 1, 1);
      put(w - rb - 0.5, base + 0.5 - rb * 0.75, rb, 1, 1);
      const r2 = rm * st.range(0.58, 0.66);
      put(w / 2 - sd * w * st.range(0.16, 0.2), Math.max(T(st.range(0.45, 0.65)) + r2, yt), r2, 2);
    } else {
      // Ends: an upper puff hides the core's top corner, a foot rounds the corner on the base, a middle puff between.
      const endStyle = [st.next() < 0.5 ? 'round' : 'skirt', st.next() < 0.45 && w >= 54 ? 'bulge' : st.next() < 0.5 ? 'round' : 'skirt'];
      for (const sd of [-1, 1]) {
        const style = endStyle[sd < 0 ? 0 : 1];
        const [eU, eM, eF] = style === 'round' ? [st.range(3.6, 4.8), st.range(1.4, 2.2), st.range(0.4, 1)]
          : style === 'skirt' ? [st.range(4.6, 5.6), st.range(2.6, 3.4), st.range(0.3, 0.7)]
            : [st.range(1.2, 2), st.range(1, 1.6), st.range(1.6, 2.4)];
        const rF = clamp(h * st.range(0.27, 0.33), 2.5, 12);
        // The corner to hide, in a frame where this end is on the left; the upper puff's radius keeps that corner
        // inside a circle tangent to x = eU and y = top: r² − (2a + 2b − 0.8) r + a² + b² − 0.16 ≤ 0.
        const ax = (sd < 0 ? xl + 0.5 : w - xr - 0.5) - eU, ay = yt + 0.5;
        const top = T(ENDS[arch][(sd < 0) !== flip ? 0 : 1]);
        const bq = ay - top;
        const B = 2 * ax + 2 * bq - 0.8, C = ax * ax + bq * bq - 0.16, disc = B * B - 4 * C;
        let rU = Math.max(cRow(0.25) - top, h * 0.2);
        if (disc > 0) rU = clamp(rU, (B - Math.sqrt(disc)) / 2 + 0.2, (B + Math.sqrt(disc)) / 2 - 0.2);
        const at = (e: number, r: number): number => (sd < 0 ? e + r : w - e - r);
        const U = put(at(eU, rU), top + rU, rU, 2);
        const F = put(at(eF, rF), base + 0.5 - rF * 0.6, rF, 1, 1);
        if (F.y - U.y > Math.max(U.r, F.r) * 0.7) {
          const rM = (U.r + F.r) / 2;
          put(at(eM, rM), (U.y + F.y) / 2, rM, 1.5, 1);
        }
      }

      // Crown: the archetype's domes at relative places along the core's top.
      const j = (): number => rng.range(-0.025, 0.025);
      const tr = clamp(h * 0.17, 2, 7);
      const lean = flip ? -1 : 1;
      if (arch === 'tower') {
        const t = st.range(0.26, 0.4);
        tower(X(t + j()), T(0), tr, lean);
        dome(X(t + 0.3 + j()), T(st.range(0.5, 0.58)), cRow(0.35));
        dome(X(0.86 + j()), T(st.range(0.7, 0.8)), cRow(0.25));
      } else if (arch === 'twin') {
        const c = st.range(0.42, 0.56), sep = Math.min(span * 0.4, tr * 2.6);
        dome(X(c), T(0.55), cRow(0.4));
        tower(X(c) - sep / 2, T(0), tr * 0.95, -1);
        tower(X(c) + sep / 2, T(st.range(0.12, 0.22)), tr * 0.9, 1);
        dome(X(c > 0.5 ? 0.14 : 0.86), T(0.76), cRow(0.25));
      } else if (arch === 'flat') {
        const r0 = cRow(0.6) - T(0.4);
        const n = Math.max(2, Math.round(span / (r0 * 1.15)));
        for (let i = 0; i < n; i++) dome(X((i + 0.5) / n + j()), T(st.range(0.36, 0.44)), cRow(0.6));
        dome(X(st.range(0.3, 0.6)), T(0.18), cRow(0.05), 2.4);
      } else if (arch === 'slope') {
        dome(X(0.16 + j()), T(0.8), cRow(0.25));
        dome(X(0.4 + j()), T(0.56), cRow(0.3));
        dome(X(0.64 + j()), T(0.3), cRow(0.35));
        dome(X(0.84), T(0), cRow(0.4), 2.4);
      } else if (arch === 'drift') {
        dome(X(0.58 + j()), T(0.22), cRow(0.35), 2.3);
        dome(X(0.84 + j()), T(0.5), cRow(0.3));
        dome(X(0.32 + j()), T(0.74), cRow(0.25));
      } else if (arch === 'congestus') {
        const t = st.range(0.42, 0.55);
        tower(X(t), T(0), tr * 1.15, lean);
        dome(X(t - 0.16 + j()), T(0.45), cRow(0.45));
        dome(X(t + 0.15 + j()), T(0.38), cRow(0.45), 2.3);
        dome(X(t + 0.3 + j()), T(0.62), cRow(0.4));
        dome(X(t - 0.32 + j()), T(0.66), cRow(0.4));
      } else {
        dome(X(st.range(0.44, 0.56)), T(0.02), Math.min(cRow(0.45), T(0.02) + span * 0.3), 2.4);
        dome(X(0.14 + j()), T(0.7), cRow(0.25));
        dome(X(0.86 + j()), T(0.64), cRow(0.25));
      }
    }

    // Shoulders where the core's top edge would still show as a straight line.
    const prof = (x: number): number => {
      let p = 99;
      for (const s of S) {
        const dx = x + 0.5 - s.x;
        if (Math.abs(dx) < s.r) p = Math.min(p, s.y - Math.sqrt(s.r * s.r - dx * dx));
      }
      return p;
    };
    for (let x = xl, run = -1; x <= xr + 1; x++) {
      const open = x <= xr && prof(x) > yt - 0.6;
      if (open && run < 0) run = x;
      if (!open && run >= 0) {
        const len = x - run;
        if (len >= Math.max(5, h * 0.3)) {
          const n = Math.max(1, Math.round(len / (h * 1.1)));
          for (let i = 0; i < n; i++) dome(run + (i + 0.5) * (len / n) + rng.range(-1, 1), T(rng.range(0.6, 0.85)), cRow(rng.range(0.3, 0.45)), 1.9);
        }
        run = -1;
      }
    }

    // Back puffs in the crown's notches, peeking above the lower neighbour only (small ones would read as nubs).
    const crown = S.filter((s) => s.kind === 2 && s.y - s.r < yt - 0.5).sort((a, b) => a.x - b.x);
    const backP = arch === 'congestus' ? 0.35 : arch === 'flat' ? 0.25 : 0.55;
    for (let k = 0; k + 1 < crown.length; k++) {
      const a = crown[k], b = crown[k + 1];
      if (b.x - a.x < (a.r + b.r) * 0.45 || st.next() > backP) continue;
      const r = Math.min(a.r, b.r) * rng.range(0.5, 0.65);
      const vx = (a.x * b.r + b.x * a.r) / (a.r + b.r);
      const t = Math.max(a.y - a.r, b.y - b.r) - rng.range(1.3, 2.3);
      if (r < 2.2 || prof(Math.round(vx)) - t < 2 || t < 0) continue;
      put(vx, t + r, r, 0, 0);
    }

    // Rasterise: the smooth union's distance, the puffs' heightfield and its owner per pixel.
    const N = w * h;
    const D = new Float32Array(N).fill(99);
    const Z = new Float32Array(N).fill(-99);
    const O = new Int16Array(N).fill(-1);
    const core = (x: number, y: number): boolean => x >= xl && x <= xr && y >= yt && y <= base;
    S.forEach((s, k) => {
      const xa = Math.max(0, Math.floor(s.x - s.r - FILLET)), xb = Math.min(w - 1, Math.ceil(s.x + s.r + FILLET));
      const ya = Math.max(0, Math.floor(s.y - s.r - FILLET)), yb = Math.min(base, Math.ceil(s.y + s.r + FILLET));
      for (let y = ya; y <= yb; y++) {
        for (let x = xa; x <= xb; x++) {
          const dx = x + 0.5 - s.x, dy = y + 0.5 - s.y, q = dx * dx + dy * dy, d = Math.sqrt(q) - s.r;
          const i = y * w + x;
          D[i] = smin(D[i], d);
          if (d < 0) {
            const z = s.z + Math.sqrt(s.r * s.r - q);
            if (z > Z[i]) { Z[i] = z; O[i] = k; }
          }
        }
      }
    });
    for (let y = yt; y <= base; y++) for (let x = xl; x <= xr; x++) D[y * w + x] = Math.min(D[y * w + x], -0.5);
    const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y <= base && D[y * w + x] < 0;
    // Drop 1-px spikes (nothing left, right and above), top-down so a whole spike goes.
    for (let y = 0; y < base; y++) {
      for (let x = 0; x < w; x++) {
        if (!core(x, y) && inside(x, y) && !inside(x - 1, y) && !inside(x + 1, y) && !inside(x, y - 1)) D[y * w + x] = 1;
      }
    }

    // The underside: per column the shade's depth, a smooth walk that deepens to the lower right.
    const bottom = new Int16Array(w).fill(-1);
    for (let x = 0; x < w; x++) for (let y = base; y >= 0; y--) if (inside(x, y)) { bottom[x] = y; break; }
    const knots: number[] = [];
    for (let k = 0; k < Math.ceil(w / 19) + 2; k++) knots.push(rng.next());
    const zone = base - by1;
    const under = (x: number): number => {
      const f = x / 19, k = Math.floor(f), a = f - k, sm = a * a * (3 - 2 * a);
      const n = knots[k] + (knots[k + 1] - knots[k]) * sm;
      return zone * clamp(0.42 + 0.3 * (x / w - 0.5) + 0.6 * (n - 0.5), 0.2, 0.9);
    };

    const light = (k: number, px: number, py: number): number => {
      const q = S[k];
      const mx = (px + 0.5 - q.x) / q.r, my = (py + 0.5 - q.y) / q.r;
      return (mx * LX + my * LY + Math.sqrt(Math.max(0, 1 - mx * mx - my * my)) * LZ + 0.5) / 1.4;
    };
    const out = new Int8Array(N).fill(-1);
    // Behind the readout: white at its top, a cool body tone towards its bottom.
    const band = (y: number): number => 0.98 - 0.5 * ((y - by0 + 0.5) / boxH);
    for (let y = 0; y <= base; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!inside(x, y)) continue;
        const up = !inside(x, y - 1), dn = !inside(x, y + 1), lf = !inside(x - 1, y), rt = !inside(x + 1, y);
        if (up || dn || lf || rt) {
          const ox = (rt ? 1 : 0) - (lf ? 1 : 0), oy = (dn ? 1 : 0) - (up ? 1 : 0), ol = Math.sqrt(ox * ox + oy * oy) || 1;
          out[i] = (ox * LX + oy * LY) / ol > 0.3 ? 1 : 0;
          continue;
        }
        let nx = 0, ny = -0.15, nz = 0.99;
        const k = O[i];
        const db = Math.max(bx0 - x, 0, x - (bx1 - 1), by0 - y, y - (by1 - 1));
        if (k >= 0) {
          const s = S[k];
          nx = (x + 0.5 - s.x) / s.r; ny = (y + 0.5 - s.y) / s.r; nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        } else if (!core(x, y)) {
          const gx = D[i + 1] - D[i - 1], gy = D[i + w] - D[i - w], gl = Math.sqrt(gx * gx + gy * gy) || 1;
          nx = (gx / gl) * 0.8; ny = (gy / gl) * 0.8; nz = 0.6;
        }
        let v = k < 0 && core(x, y) ? band(y) : (nx * LX + ny * LY + nz * LZ + 0.5) / 1.4;
        // Feet and side puffs follow the body's gradient, so the lower body has no bright patches.
        if (k >= 0 && S[k].kind === 1 && y >= by0) v = v * 0.4 + band(y) * 0.6;
        v -= 0.14 * clamp((y - by0) / Math.max(1, base - by0), 0, 1);
        const wb = clamp(1 - db / 2.5, 0, 1);
        v = v * (1 - wb) + band(clamp(y, by0, by1 - 1)) * wb;
        // A crease where this puff meets a brighter one to the right or below.
        if (k >= 0 && db > 2 && S[k].kind !== 1) {
          const kr = O[i + 1], kd = y < base ? O[i + w] : -1;
          if ((kr >= 0 && kr !== k && light(kr, x + 1, y) > light(k, x, y) + 0.12)
            || (kd >= 0 && kd !== k && light(kd, x, y + 1) > light(k, x, y) + 0.12)) v = Math.min(v, 0.45);
        }
        let t = v > 0.68 ? 7 : v > 0.52 ? 6 : v > 0.38 ? 5 : v > 0.24 ? 4 : 3;
        if (db === 0) t = Math.max(t, 5);
        else {
          // Below the readout only the wandering shade darkens.
          if (y >= by1) t = Math.max(t, 5);
          const dyB = bottom[x] - y, uu = under(x);
          if (dyB <= uu - Math.max(1.6, 0.55 * zone) && x > w * 0.6) t = Math.min(t, 2);
          else if (dyB <= uu) t = 3;
          else if (dyB <= uu + 1.4) t = Math.min(t, 4);
        }
        out[i] = t;
      }
    }
    // The shadow end only darkens outwards: no lighter pixel right of a darker one.
    for (let y = 0; y < base; y++) {
      for (let x = bx1 + 1; x < w; x++) {
        const i = y * w + x;
        if (out[i] >= 2 && out[i - 1] >= 2 && out[i] > out[i - 1]) out[i] = out[i - 1];
      }
    }
    return out;
  }
}
