/* =============================================================================
 * Gaia Reborn — how the vines grow: geometry and growth order (no DOM)
 * -----------------------------------------------------------------------------
 * From the rail's buttons, its knot, the rock's root point and the top bar's
 * logo plaque (all in art px) one vine is planned: a stem from Gaia's rock up
 * the rail's left edge into the top bar, where it climbs round the plaque's
 * left end (no plaque: up into the open band, where the map shows between the
 * status clouds); side branches through the gaps between the buttons,
 * curling up or down beside them; leaves, curls and flowers.
 * Every part carries the greenery it is born at, so greenery 0 → 1 reveals the
 * vine in order (a sprout on the rock at about 0.04, halfway up at 0.3, lush
 * at 1); leaves carry their own wilt and fall thresholds in vitality, flowers
 * their own opening in bloom. The same anchors always give the same vine.
 * ========================================================================== */

namespace SE {
  /** A box in art px of the stage's top-left frame; y < 0 is up in the top bar. */
  export interface VineBox { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

  export interface VineAnchors {
    /** The rail's buttons, top to bottom (the gap with the rail's knot is one of the gaps between them). */
    readonly buttons: readonly VineBox[];
    /** Where the stem leaves the rock. */
    readonly root: readonly [number, number];
    /** The logo plaque in the top bar. */
    readonly brand: VineBox | null;
    /** The top bar spans x 0 … barW and y −barH … 0. */
    readonly barW: number;
    readonly barH: number;
  }

  /** 0 behind the rail, 1 in front of it, 2 over the top bar. */
  export type VineLayerId = 0 | 1 | 2;

  export interface VinePixel {
    readonly x: number;
    readonly y: number;
    /** Body width when grown, 1–3 art px. */
    readonly w: number;
    readonly birth: number;
    /** The main stem turns woody with age; branches stay green. */
    readonly wood: boolean;
    readonly layer: VineLayerId;
  }

  export interface VineLeaf {
    /** Where the leaf's `base` pixel goes. */
    readonly x: number;
    readonly y: number;
    readonly dir: 'r' | 'l' | 'hang';
    /** Largest size: 0 small, 1 medium, 2 large. */
    readonly max: number;
    readonly birth: number;
    /** Greenery from one size to the next: the lush leaves round the buttons keep growing as the planet greens. */
    readonly step: number;
    readonly layer: VineLayerId;
    /** Vitality below which it is faded, wilted, dry. */
    readonly wilt: readonly [number, number, number];
    /** Vitality below which the dry leaf falls; 0: it never does. */
    readonly fall: number;
    /** Art px along the vine from the root: when a wind wave reaches it. */
    readonly wave: number;
  }

  export interface VineFlower {
    /** Centre. */
    readonly x: number;
    readonly y: number;
    readonly id: string;
    readonly birth: number;
    /** Bloom at which the bud shows; it opens over the next three BLOOM_STEPs. */
    readonly open: number;
    /** Vitality below which it wilts. */
    readonly wilt: number;
    readonly layer: VineLayerId;
  }

  /** A tendril curl; (x, y) is where its `base` pixel goes. */
  export interface VineCurl { readonly x: number; readonly y: number; readonly dir: 'r' | 'l'; readonly birth: number; readonly layer: VineLayerId }

  export interface VinePlan {
    /** Every stem and branch pixel. */
    readonly pixels: readonly VinePixel[];
    /** The main stem from the root to its tip (also in `pixels`). */
    readonly trunk: readonly VinePixel[];
    /** In order of birth. */
    readonly leaves: readonly VineLeaf[];
    readonly flowers: readonly VineFlower[];
    readonly curls: readonly VineCurl[];
    /** The largest `wave`: how far a wind wave travels. */
    readonly reach: number;
  }

  /** Greenery of the stem's first pixel, of the sprout's end and of the stem's tip. */
  const G_SPROUT = 0.005;
  const G_CLIMB = 0.08;
  const G_TOP = 0.62;
  /** Art px of the sprout on the rock (the first few hide behind the rock's edge). */
  const SPROUT_PX = 12;
  /** Greenery per art px of a side branch. */
  const BRANCH_G = 0.0018;
  /** Greenery from one leaf size to the next; bloom from one flower stage to the next. */
  const LEAF_AGE = 0.05;
  const BLOOM_STEP = 0.08;
  /** Greenery from which the vine turns lush: clusters at the joints, leaves in front of the rims. */
  const LUSH = 0.78;
  /** Vitality below which the tendril curls (no wilt frames of their own) have shrivelled away. */
  const CURL_DRY = 0.3;
  const FLOWERS = ['flower_w', 'flower_p', 'flower_y', 'flower_b'];

  type Pt = [number, number];

  /** Appends the 8-connected line from the path's last point to (x, y). */
  function lineTo(path: Pt[], x: number, y: number): void {
    const [x0, y0] = path[path.length - 1];
    const n = Math.max(Math.abs(x - x0), Math.abs(y - y0));
    for (let i = 1; i <= n; i++) path.push([Math.round(x0 + ((x - x0) * i) / n), Math.round(y0 + ((y - y0) * i) / n)]);
  }

  /** Dice of its own for every part, so one part's rolls never shift another's. */
  const dice = (a: number, b: number): Rng => new Rng(Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca6b));

  export function planVine(a: VineAnchors): VinePlan {
    const pixels: VinePixel[] = [];
    const leaves: VineLeaf[] = [];
    const flowers: VineFlower[] = [];
    const curls: VineCurl[] = [];
    let reach = 0;

    const leaf = (x: number, y: number, dir: VineLeaf['dir'], max: number, birth: number, layer: VineLayerId, wave: number, r: Rng, step = LEAF_AGE): void => {
      const dry = 0.14 + 0.16 * r.next();
      const wilt: [number, number, number] = [0.55 + 0.25 * r.next(), 0.32 + 0.16 * r.next(), dry];
      const fall = r.chance(0.45) ? Math.min(dry - 0.02, 0.08 + 0.16 * r.next()) : 0;
      leaves.push({ x, y, dir, max, birth, step, layer, wilt, fall, wave });
      reach = Math.max(reach, wave);
    };
    /** A leaf on a stem pixel, its base on the stem's outer column (or row, hanging). */
    const onStem = (p: VinePixel, dir: VineLeaf['dir'], max: number, delay: number, wave: number, r: Rng, layer = p.layer): void => {
      const x = dir === 'r' ? p.x + (p.w >> 1) : dir === 'l' ? p.x - ((p.w - 1) >> 1) : p.x;
      leaf(x, dir === 'hang' ? p.y + (p.w >> 1) : p.y, dir, max, p.birth + delay, layer, wave, r);
    };
    const flower = (x: number, y: number, birth: number, open: number, layer: VineLayerId, r: Rng): void => {
      flowers.push({ x, y, id: FLOWERS[r.int(FLOWERS.length)], birth, open, wilt: 0.3 + 0.2 * r.next(), layer });
    };
    const empty: VinePlan = { pixels, trunk: [], leaves, flowers, curls, reach: 0 };

    const btns = a.buttons;
    const [rx, ry] = [Math.round(a.root[0]), Math.round(a.root[1])];
    if (ry < 8) return empty;
    const railX = btns.length ? Math.min(...btns.map((b) => b.x)) : 4;
    const railR = btns.length ? Math.max(...btns.map((b) => b.x + b.w)) : 28;
    const low = btns.length ? Math.max(...btns.map((b) => b.y + b.h)) : 0;
    const pitch = btns.length > 1 ? Math.max(8, (btns[btns.length - 1].y - btns[0].y) / (btns.length - 1)) : 28;

    /* ---- the main stem: off the rock, up the rail's left edge, into the bar ---- */
    // One point per row up to the stage's top, so the stem pixel of row y is pts[ry - y].
    const pts: Pt[] = [[rx, ry]];
    // Up and to the left out of the rock first, so the sprout shows at once; then a smooth bend onto the rail.
    const lead = clamp(rx - railX, 0, 5);
    const y0 = ry - lead;
    const join = Math.min(y0 - 4, low + 8);
    const home = (y: number): number => railX - 1 + Math.round(1.6 * Math.sin((Math.PI * y) / pitch));
    for (let y = ry - 1; y >= 0; y--) {
      const t = smoothstep(clamp((y0 - y) / Math.max(1, y0 - join), 0, 1));
      const want = y >= y0 ? rx - (ry - y) : Math.round(lerp(rx - lead, home(y), t));
      const px = pts[pts.length - 1][0];
      pts.push([px + clamp(want - px, -1, 1), y]);
    }
    const inStage = pts.length;
    const xTop = pts[inStage - 1][0];
    const b = a.brand;
    const ceil = -a.barH + 1;
    const xl = b ? clamp(b.x - 2, 1, Math.max(1, a.barW - 8)) : xTop + 2;
    const yEnd = b ? Math.max(ceil, b.y - 1) : Math.max(ceil, -Math.round(a.barH * 0.6));
    lineTo(pts, xTop, -1);
    lineTo(pts, xl, -3);
    lineTo(pts, xl, Math.min(-3, yEnd + 2));
    lineTo(pts, xl + 2, yEnd);
    lineTo(pts, xl + 5, yEnd);

    const n = pts.length;
    const birthAt = (k: number): number => (k < SPROUT_PX
      ? G_SPROUT + ((G_CLIMB - G_SPROUT) * k) / SPROUT_PX
      : G_CLIMB + ((G_TOP - G_CLIMB) * (k - SPROUT_PX)) / Math.max(1, n - 1 - SPROUT_PX));
    const trunk: VinePixel[] = pts.map(([x, y], k) => ({
      x, y, w: y < 0 ? 2 : k < 0.5 * n ? 3 : 2, birth: birthAt(k), wood: true, layer: (y < 0 ? 2 : 0) as VineLayerId,
    }));
    pixels.push(...trunk);

    /** A side branch off trunk pixel k; `path` starts next to the trunk. */
    const branch = (k: number, path: Pt[], layer: VineLayerId, delay = 0.012): VinePixel[] => {
      const b0 = trunk[k].birth + delay;
      const out = path.map(([x, y], m): VinePixel => ({ x, y, w: 1, birth: b0 + m * BRANCH_G, wood: false, layer }));
      pixels.push(...out);
      return out;
    };

    /* ---- the sprout on the rock and the open stretch up to the rail ---- */
    const r0 = dice(0, 0);
    if (inStage > 9) {
      onStem(trunk[4], 'r', 1, 0.004, 4, r0);
      onStem(trunk[8], 'l', 1, 0.004, 8, r0);
    }
    const open = ry - low;
    for (let k = 13, j = 0; k < Math.min(inStage - 1, open - 4); j++) {
      const r = dice(2, j);
      onStem(trunk[k], j % 3 === 1 ? 'l' : 'r', j % 3 === 1 ? 1 : 2, 0.01 + 0.03 * r.next(), k, r);
      k += 6 + r.int(6);
    }
    if (open > 30 && inStage > open) {
      const k = Math.round(open * 0.45);
      const p = trunk[k];
      const path: Pt[] = [[p.x + 1, p.y]];
      lineTo(path, p.x + 6, p.y - 3);
      lineTo(path, p.x + 11, p.y - 4);
      const br = branch(k, path, 0);
      const tip = br[br.length - 1];
      curls.push({ x: tip.x, y: tip.y, dir: 'r', birth: tip.birth + 0.004, layer: 0 });
      onStem(br[4], 'r', 1, 0.01, k + 4, dice(3, 0));
      flower(trunk[6].x + 3, trunk[6].y - 1, trunk[8].birth + 0.02, 0.02, 0, dice(3, 1));
      flower(tip.x - 2, tip.y - 4, tip.birth, 0.2, 0, dice(3, 2));
    }

    /* ---- branches through the gaps between the buttons, curling up or down beside them ---- */
    let side = 0;
    for (let i = 0; i + 1 < btns.length; i++) {
      const g0 = btns[i].y + btns[i].h;
      const g1 = btns[i + 1].y;
      const gy = (g0 + g1 - 1) >> 1;
      const k = ry - gy;
      if (g1 - g0 < 2 || k < 1 || k >= inStage) continue;
      const r = dice(1, i);
      const up = side++ % 2 === 0;
      const tx = trunk[k].x;
      const len = 3 + r.int(4);
      const path: Pt[] = [[tx + 1, gy]];
      lineTo(path, railR, gy);
      const corner = path.length - 1;
      lineTo(path, railR + 2, up ? gy - 2 : gy + 2);
      lineTo(path, railR + 2, up ? gy - 2 - len : gy + 2 + len);
      const br = branch(k, path, 0);
      const tip = br[br.length - 1];
      if (up) {
        curls.push({ x: tip.x, y: tip.y, dir: 'r', birth: tip.birth + 0.004, layer: 0 });
        onStem(br[br.length - 1 - (len >> 1)], 'r', 1 + r.int(2), 0.01, k + br.length, r);
        flower(railR + 5, gy - 1, Math.max(tip.birth, 0.5), 0.3 + 0.6 * r.next(), 0, r);
      } else {
        onStem(br[corner], 'r', 1 + r.int(2), 0.008, k + corner, r);
        if (r.chance(0.5)) flower(tip.x, tip.y + 3, tip.birth, 0.05 + 0.6 * r.next(), 0, r);
        else onStem(tip, 'hang', 0, 0.006, k + br.length, r);
      }
      // Lush: one more large leaf beside the button, behind the rail.
      const at = up ? corner : br.length - 3;
      onStem(br[at], 'r', 2, Math.max(0.02, G_TOP - 0.02 + 0.3 * r.next() - br[at].birth), k + at, r);
      // A small leaf tucked in front of the button's lower left rim (from the gap's top row, so its tip stays
      // below the icon): every other gap, the rest once lush.
      const kr = ry - g0;
      if (kr >= 1 && kr < inStage) onStem(trunk[kr], 'r', 0, i % 2 ? 0.03 : Math.max(0.03, 0.8 + 0.15 * r.next() - trunk[kr].birth), kr, r, 1);
      // A cluster at the joint once lush: a leaf hanging from the corner, one more reaching out.
      const rj = dice(8, i);
      onStem(br[corner], 'hang', 0, Math.max(0.02, LUSH + 0.1 * rj.next() - br[corner].birth), k + corner, rj);
      onStem(br[corner], 'r', 1, Math.max(0.02, LUSH + 0.05 + 0.1 * rj.next() - br[corner].birth), k + corner, rj);
    }

    /* ---- leaves tucked behind every button's right rim, growing from small to large as the planet greens ---- */
    // Offsets are from the button's top left; its face is rows 0–21, the icon x 5–18, y 4–17, the keycap at the
    // lower right, the selected tool's tab x 23–28, y 5–16: back leaves may pass under them, front ones never.
    btns.forEach((bt, i) => {
      const k = clamp(ry - (bt.y + 12), 1, inStage - 1);
      const r = dice(7, i);
      const g0 = Math.max(trunk[k].birth + 0.06, 0.28);
      const dy = r.int(3) - 1;
      leaf(bt.x + 22, bt.y + 16 + dy, 'r', 2, g0 + 0.04 * r.next(), 0, k + 20, r, 0.13);
      leaf(bt.x + 17, bt.y + 4, 'r', 1 + r.int(2), Math.max(g0 + 0.12, 0.5) + 0.1 * r.next(), 0, k + 26, r, 0.1);
      leaf(bt.x + 22, bt.y + 22, 'r', 1 + r.int(2), Math.max(g0 + 0.2, 0.68) + 0.1 * r.next(), 0, k + 18, r, 0.1);
      // In front of the upper right rim, clear of the tab and the keycap above.
      leaf(bt.x + 19, bt.y + 4, 'r', 0, LUSH + 0.04 + 0.1 * r.next(), 1, k + 26, r);
      flower(bt.x + 29, bt.y + 9 + dy, Math.max(g0 + 0.08, 0.45), 0.2 + 0.65 * r.next(), 0, r);
    });

    /* ---- the top bar: round the plaque's left end ---- */
    const rb = dice(5, 0);
    const kc = (inStage + n - 1) >> 1;
    // Round the plaque's left end: leaves out to the left where the bar leaves room, else in front of its frame
    // (a medium leaf stays clear of the lettering).
    onStem(trunk[kc], xl >= 8 ? 'l' : 'r', 1, 0.01, kc, rb);
    for (const [k, m] of [[inStage + 2, 1], [kc + 2, 1], [n - 6, 0]]) {
      if (k > inStage && k < n - 1 && trunk[k].y <= -2) onStem(trunk[k], 'r', m, Math.max(0.03, LUSH - 0.1 + 0.15 * rb.next() - trunk[k].birth), k, rb);
    }
    onStem(trunk[n - 3], 'r', 0, 0.01, n - 3, rb);
    // The tip curls up over the plaque's corner when the bar leaves room above it, else a flower ends it.
    if (yEnd - 5 > -a.barH) curls.push({ x: trunk[n - 1].x, y: trunk[n - 1].y, dir: 'r', birth: G_TOP + 0.004, layer: 2 });
    else flower(trunk[n - 1].x + 1, trunk[n - 1].y + 1, G_TOP, 0.15, 2, rb);
    flower(trunk[n - 4].x - 1, trunk[n - 4].y + 2, G_TOP, 0.35, 2, rb);

    leaves.sort((p, q) => p.birth - q.birth);
    return { pixels, trunk, leaves, flowers, curls, reach };
  }

  /** The leaf's size at greenery g: −1 not yet, 0 small, 1 medium, 2 large. */
  export function leafSize(l: VineLeaf, g: number): number {
    return g < l.birth ? -1 : Math.min(l.max, Math.floor((g - l.birth) / l.step));
  }

  /** The leaf's state at this vitality: 0 fresh, 1 faded, 2 wilted, 3 dry. */
  export function leafLook(l: VineLeaf, vitality: number): number {
    return vitality >= l.wilt[0] ? 0 : vitality >= l.wilt[1] ? 1 : vitality >= l.wilt[2] ? 2 : 3;
  }

  /** The flower's frame: −1 not there, 0 bud … 3 full bloom, 4 wilted, 5 dry. */
  export function flowerFrame(f: VineFlower, g: number, bloom: number, vitality: number): number {
    if (g < f.birth || bloom < f.open) return -1;
    if (vitality < f.wilt) return vitality < f.wilt - 0.12 ? 5 : 4;
    return Math.min(3, Math.floor((bloom - f.open) / BLOOM_STEP));
  }

  /** The curl's frame: −1 not there (not yet, or shrivelled in a crisis), 0 hook, 1 half, 2 full spiral. */
  export function curlFrame(c: VineCurl, g: number, vitality: number): number {
    return g < c.birth || vitality < CURL_DRY ? -1 : Math.min(vitality < 0.45 ? 0 : 2, Math.floor((g - c.birth) / 0.02));
  }

  /** A stem pixel's body width at greenery g: thin while young, its full width once old. */
  export function stemWidth(p: VinePixel, g: number): number {
    const age = g - p.birth;
    return age < 0 ? 0 : Math.min(p.w, age < 0.025 ? 1 : age < 0.07 ? 2 : 3);
  }
}
