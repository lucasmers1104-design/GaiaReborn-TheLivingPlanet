/* =============================================================================
 * Gaia Reborn — the DNA double helix of Gaia's evolution magic
 * -----------------------------------------------------------------------------
 * Put together at run time from the magic sprites (tools/uiart/catalog.js):
 * two strands of beads half a turn apart wind round a vertical axis and turn
 * about it in space. Everything is depth-sorted, back to front: the sparks
 * behind, the back halves of the rungs, the back beads, the front halves of
 * the rungs, the front beads, the sparks in front. Beads shrink and dim in
 * four steps with depth; rungs are one-art-pixel lines whose colour dims
 * with depth; sparks and motes circle on tilted ellipses. The breathing aura
 * behind the whole helix and the glows behind the nearest beads go to a
 * second canvas that the page adds onto what lies beneath (gaiamagic.ts),
 * so their light only ever brightens.
 * ========================================================================== */

namespace SE {
  /** Bead pairs from tip to tip, art px between pairs, the strands' radius (art px) and their twist per pair (rad, B-DNA's pitch to width). */
  const DNA_PAIRS = 19;
  const DNA_PAIR_PX = 3;
  const DNA_RADIUS = 10;
  const DNA_TWIST = 0.52;
  const DNA_HALF = (DNA_PAIRS - 1) / 2;
  /** Every other pair is joined by a rung; a shorter one would hide under its beads. */
  const RUNG_EVERY = 2;
  const RUNG_MIN = 4;
  /** dna_bead frames depth · 3 + light: strand A teal, strand B violet; a bead at least this near (the cosine of its turn) takes depth step 0, 1, 2, else 3. */
  const BEAD_A = 0;
  const BEAD_B = 2;
  const BEAD_DEPTHS = [0.6, 0, -0.6] as const;
  /** Only the nearest beads glow: the light gathers where the strands come forward. */
  const GLOW_NEAR = 0.6;
  /** aura frames 0–1 while the helix grows, then the breath at AURA_FPS, starting small where gaiamagic.ts completes it (≈ 600 ms); the still image's frame. */
  const AURA_BREATH = [4, 3, 2, 3, 4, 5] as const;
  const AURA_FPS = 4;
  const AURA_STILL = 4;
  /** Rung colours from back to front (UI palette names). */
  const RUNG_RAMP = ['glowG0', 'glowG1', 'glowG2'] as const;
  /** The sparks' twinkle frame in the still image. */
  const STILL_TWINKLE = 1;

  /** Half the helix's height, centre to tip, in art px. */
  export const DNA_HALF_H = DNA_HALF * DNA_PAIR_PX;

  /**
   * A light circling the helix: radius and height off the centre (art px), ms per round, the ellipse's flattening and
   * tilt, start angle; `f` fixes the frame of a still sprite (a mote), sparks twinkle.
   */
  interface DnaOrbit {
    readonly id: string; readonly r: number; readonly y: number; readonly ms: number;
    readonly flat: number; readonly tilt: number; readonly at: number; readonly f?: number;
  }
  const DNA_ORBITS: readonly DnaOrbit[] = [
    { id: 'spark', r: 16, y: -17, ms: 1600, flat: 0.28, tilt: 0.2, at: 0 },
    { id: 'spark_v', r: 19, y: -2, ms: 2100, flat: 0.32, tilt: -0.22, at: 2.1 },
    { id: 'spark', r: 15, y: 15, ms: 1400, flat: 0.26, tilt: 0.3, at: 4.2 },
    { id: 'spark_v', r: 13, y: -29, ms: 1250, flat: 0.3, tilt: -0.3, at: 1.2 },
    { id: 'spark', r: 18, y: 6, ms: 2500, flat: 0.22, tilt: 0.12, at: 3.4 },
    { id: 'spark', r: 14, y: 27, ms: 1800, flat: 0.3, tilt: -0.2, at: 5.3 },
    { id: 'mote', r: 21, y: 18, ms: 2900, flat: 0.25, tilt: 0.15, at: 0.6, f: 4 },
    { id: 'mote', r: 22, y: -12, ms: 3300, flat: 0.3, tilt: -0.1, at: 2.8, f: 7 },
    { id: 'mote', r: 17, y: -33, ms: 2300, flat: 0.28, tilt: 0.2, at: 4.6, f: 1 },
  ];

  const beadDepth = (z: number): number => {
    let d = 0;
    while (d < BEAD_DEPTHS.length && z < BEAD_DEPTHS[d]) d++;
    return d;
  };

  export interface DnaPose {
    /** Turn about the vertical axis, rad. */
    readonly spin: number;
    /** Share of the strands shown, from the centre out, 0..1. */
    readonly grow: number;
    /** The sequence clock (ms) the sparks circle and twinkle by. */
    readonly ms: number;
    /** The circling sparks show. */
    readonly sparks: boolean;
    /** The still image: nothing twinkles. */
    readonly still: boolean;
  }

  /** The helix centred on art px (cx, cy) of `ctx`; its glows go additively to `glow`, a canvas on the same grid. */
  export function drawDnaHelix(ctx: CanvasRenderingContext2D, glow: CanvasRenderingContext2D, cx: number, cy: number, pose: DnaPose): void {
    if (pose.grow <= 0) return;
    const art = UiArt.shared();
    const reach = Math.round(DNA_HALF * Math.min(1, pose.grow));
    // Beads as x, y, depth, light; rung pixels as x, y, depth.
    const beads: number[] = [];
    const rungs: number[] = [];
    for (let i = -reach; i <= reach; i++) {
      const y = cy + i * DNA_PAIR_PX;
      const a = pose.spin + i * DNA_TWIST;
      const dx = Math.round(DNA_RADIUS * Math.sin(a));
      const z = Math.cos(a);
      beads.push(cx + dx, y, z, BEAD_A, cx - dx, y, -z, BEAD_B);
      if ((i + DNA_HALF) % RUNG_EVERY !== 0 || Math.abs(dx) < RUNG_MIN) continue;
      // The rung runs straight through the axis, so its depth at offset k is z · k / dx.
      const end = Math.abs(dx) - 2;
      for (let k = -end; k <= end; k++) rungs.push(cx + k, y, (z * k) / dx);
    }
    const order: number[] = [];
    for (let b = 0; b < beads.length; b += 4) order.push(b);
    order.sort((p, q) => beads[p + 2] - beads[q + 2]);
    const bead = (b: number): void => art.draw(ctx, 'dna_bead', beadDepth(beads[b + 2]) * 3 + beads[b + 3], beads[b], beads[b + 1]);

    const op = glow.globalCompositeOperation;
    glow.globalCompositeOperation = 'lighter';
    const aura = pose.still ? AURA_STILL : pose.grow < 1 ? Math.floor(pose.grow * 2)
      : AURA_BREATH[Math.floor((pose.ms * AURA_FPS) / 1000) % AURA_BREATH.length];
    art.draw(glow, 'aura', aura, cx, cy);
    for (const b of order) if (beads[b + 2] >= GLOW_NEAR) art.draw(glow, 'glow', 0, beads[b], beads[b + 1]);
    glow.globalCompositeOperation = op;
    if (pose.sparks) orbit(ctx, art, cx, cy, pose, false);
    rungPass(ctx, art, rungs, false);
    for (const b of order) if (beads[b + 2] < 0) bead(b);
    rungPass(ctx, art, rungs, true);
    for (const b of order) if (beads[b + 2] >= 0) bead(b);
    if (pose.sparks) orbit(ctx, art, cx, cy, pose, true);
    // The strands' four tips sparkle while they grow.
    if (reach < DNA_HALF && !pose.still) {
      for (const b of [0, 4, beads.length - 8, beads.length - 4]) {
        const id = beads[b + 3] === BEAD_A ? 'spark' : 'spark_v';
        art.draw(ctx, id, art.loopFrame(id, pose.ms, b), beads[b], beads[b + 1]);
      }
    }
  }

  function rungPass(ctx: CanvasRenderingContext2D, art: UiArt, rungs: readonly number[], front: boolean): void {
    for (let r = 0; r < rungs.length; r += 3) {
      const z = rungs[r + 2];
      if ((z >= 0) !== front) continue;
      ctx.fillStyle = art.color(RUNG_RAMP[z < -1 / 3 ? 0 : z <= 1 / 3 ? 1 : 2]);
      ctx.fillRect(rungs[r], rungs[r + 1], 1, 1);
    }
  }

  /**
   * The circling lights on the near (front) or far halves of their ellipses, turning the way the helix turns; the near half
   * lies lower, as seen from a little above.
   */
  function orbit(ctx: CanvasRenderingContext2D, art: UiArt, cx: number, cy: number, pose: DnaPose, front: boolean): void {
    DNA_ORBITS.forEach((o, k) => {
      const a = o.at + (2 * Math.PI * pose.ms) / o.ms;
      const z = Math.cos(a);
      if ((z >= 0) !== front) return;
      const x = cx + o.r * Math.sin(a);
      const y = cy + o.y + o.r * (o.flat * z + o.tilt * Math.sin(a));
      const f = o.f ?? (pose.still ? STILL_TWINKLE : art.loopFrame(o.id, pose.ms, k * 2));
      art.draw(ctx, o.id, f, Math.round(x), Math.round(y));
    });
  }
}
