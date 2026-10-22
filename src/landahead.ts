/* =============================================================================
 * SimEarth 2.0 — landscape ahead of the moving camera
 * -----------------------------------------------------------------------------
 * The map asks the landscape worker for the chunks it shows (landview.ts).
 * While the camera moves, the chunk it is about to show is asked for a little
 * earlier — about AHEAD_MS ahead, never more than one chunk past the view,
 * one at a time and after everything visible — so it is current when it
 * comes into view. The camera's velocity is read off how it actually moved
 * over the last frames (keys, drags and flights alike); a zoom re-anchors the
 * estimate and a jump (a centring, a load) clears it.
 *
 * `?land=plain|ahead|zoom|both` picks the variants for measuring
 * (tools/perf-bench.js): plain is the path without this and without the zoom
 * pictures of landzoom.ts.
 * ========================================================================== */

namespace SE {
  /** How far ahead of the moving camera chunks are asked for. */
  const AHEAD_MS = 250;
  /** Time constant of the velocity's moving average. */
  const MOTION_SMOOTH_MS = 90;
  /** No frame for this long: the camera rested meanwhile, the estimate starts afresh. */
  const MOTION_GAP_MS = 200;
  /** Slower than this the camera counts as resting (CSS px per second). */
  const MOTION_MIN_PX_S = 30;
  /** Moves faster than this are jumps, not motion (CSS px per second); flights glide well below. */
  const MOTION_MAX_PX_S = 30000;

  /** `auto`, the game's own: ahead always, zoom pictures from ZOOM_FROM_DPR up. */
  type LandVariant = 'plain' | 'ahead' | 'zoom' | 'both' | 'auto';
  /**
   * Zoom pictures shortened the longest frame gaps at device pixel ratio
   * 1.5 and 2 and changed nothing measurable at 1 (docs/performance-2026-10/bericht.md):
   * below this they stay off and take no memory.
   */
  const ZOOM_FROM_DPR = 1.5;

  function landVariant(): LandVariant {
    const m = typeof location !== 'undefined' ? /[?&]land=(plain|ahead|zoom|both)(&|$)/.exec(location.search) : null;
    return m ? m[1] as LandVariant : 'auto';
  }

  /** Which landscape extensions run: chunks asked for ahead of the camera, and from which device pixel ratio up zoom pictures (Infinity: never). */
  export const LAND_FEATURES = {
    ahead: landVariant() !== 'plain' && landVariant() !== 'zoom',
    zoomFromDpr: landVariant() === 'zoom' || landVariant() === 'both' ? 0 : landVariant() === 'auto' ? ZOOM_FROM_DPR : Infinity,
  };

  /**
   * Landscape counts and timings for tools/perf-bench.js and tests. Counters
   * always run; the timing lists only after reset() (a measurement), so a
   * long game does not grow them.
   */
  export const landStats = {
    recording: false,
    /** Chunks that came into view, and how many of them were current then. */
    entered: 0,
    readyOnEntry: 0,
    /** Milliseconds from a chunk coming into view out of date until it was current. */
    ready: [] as number[],
    aheadAsked: 0,
    aheadInstalled: 0,
    aheadUsed: 0,
    aheadUnused: 0,
    aheadDropped: 0,
    aheadUpgraded: 0,
    zoomHits: 0,
    zoomMisses: 0,
    zoomBuilt: 0,
    zoomUsed: 0,
    zoomUnused: 0,
    zoomLate: 0,
    zoomEvicted: 0,
    zoomOverBudget: 0,
    /** Worker milliseconds per job: composing, and magnifying for the zoom pictures. */
    composeMs: [] as number[],
    scaleMs: [] as number[],
    /** Worker milliseconds per creature picture (tilecache.ts). */
    spriteMs: [] as number[],
    msgsOut: 0,
    msgsIn: 0,
    bytesOut: 0,
    bytesIn: 0,
    /** Computed canvas and bitmap memory now, in bytes: zoom pictures, those on their way, the worker's canvases, the most of all three together, and the existing 1× chunks and shrunk copies. */
    pageZoomBytes: 0,
    flightBytes: 0,
    workerBytes: 0,
    peakZoomBytes: 0,
    baseBytes: 0,
    smallBytes: 0,
    features: { ahead: LAND_FEATURES.ahead, zoom: LAND_FEATURES.zoomFromDpr < Infinity, zoomCapable: false },
    reset(): void {
      for (const k of ['entered', 'readyOnEntry', 'aheadAsked', 'aheadInstalled', 'aheadUsed', 'aheadUnused', 'aheadDropped', 'aheadUpgraded',
        'zoomHits', 'zoomMisses', 'zoomBuilt', 'zoomUsed', 'zoomUnused', 'zoomLate', 'zoomEvicted', 'zoomOverBudget',
        'msgsOut', 'msgsIn', 'bytesOut', 'bytesIn'] as const) this[k] = 0;
      this.ready = [];
      this.composeMs = [];
      this.scaleMs = [];
      this.spriteMs = [];
      this.peakZoomBytes = this.pageZoomBytes + this.flightBytes + this.workerBytes;
      this.recording = true;
    },
  };

  /** The camera's velocity, in CSS pixels per second (the same at every zoom), from where it actually was frame by frame. */
  export class CameraMotion {
    vx = 0;
    vy = 0;
    private x = 0;
    private y = 0;
    private tilePx = 0;
    private at = -Infinity;

    /** This frame's camera: scroll in tiles, CSS px per tile, the view in tiles. */
    sample(scrollX: number, scrollY: number, tilePx: number, now: number, cols: number, rows: number): void {
      const dt = now - this.at;
      const zoomed = tilePx !== this.tilePx;
      const dxT = wrapTiles(scrollX - this.x);
      const dyT = scrollY - this.y;
      this.x = scrollX;
      this.y = scrollY;
      this.tilePx = tilePx;
      this.at = now;
      if (dt <= 0) return;
      // A zoom moves the scroll around the pointer: not motion. The estimate goes on from here, fading as on a frame without motion.
      if (zoomed) {
        const fade = Math.exp(-dt / MOTION_SMOOTH_MS);
        this.vx *= fade;
        this.vy *= fade;
        return;
      }
      const vx = (dxT * tilePx * 1000) / dt;
      const vy = (dyT * tilePx * 1000) / dt;
      if (dt > MOTION_GAP_MS || Math.abs(dxT) > cols / 2 || Math.abs(dyT) > rows / 2 || Math.hypot(vx, vy) > MOTION_MAX_PX_S) {
        this.vx = 0;
        this.vy = 0;
        return;
      }
      const a = 1 - Math.exp(-dt / MOTION_SMOOTH_MS);
      this.vx += (vx - this.vx) * a;
      this.vy += (vy - this.vy) * a;
      if (Math.hypot(this.vx, this.vy) < MOTION_MIN_PX_S) {
        this.vx = 0;
        this.vy = 0;
      }
    }

    /** A jump or another planet: no motion until the camera moves again. */
    reset(): void {
      this.vx = 0;
      this.vy = 0;
      this.at = -Infinity;
    }

    /** How far ahead to look, in tiles at `tilePx`, at most one chunk either way. */
    ahead(tilePx: number): [number, number] {
      const f = AHEAD_MS / 1000 / tilePx;
      return [clamp(this.vx * f, -LAND_CHUNK, LAND_CHUNK), clamp(this.vy * f, -LAND_CHUNK, LAND_CHUNK)];
    }
  }

  /** Signed shortest horizontal distance on the wrapping map, in tiles. */
  function wrapTiles(d: number): number {
    if (d > GRID_W / 2) return d - GRID_W;
    if (d < -GRID_W / 2) return d + GRID_W;
    return d;
  }

  /** Chunk numbers (as landview.ts counts them) over tiles [x0, x1) × [y0, y1); x may run past the wrap, y is clipped at the poles. */
  export function chunksIn(x0: number, y0: number, x1: number, y1: number): number[] {
    const out: number[] = [];
    const cols = GRID_W / LAND_CHUNK;
    const ya = Math.max(0, y0);
    const yb = Math.min(GRID_H, y1);
    if (x1 <= x0 || yb <= ya) return out;
    for (let cy = Math.floor(ya / LAND_CHUNK); cy <= Math.floor((yb - 1e-9) / LAND_CHUNK); cy++) {
      for (let cu = Math.floor(x0 / LAND_CHUNK); cu <= Math.floor((x1 - 1e-9) / LAND_CHUNK); cu++) {
        const n = cy * cols + (((cu % cols) + cols) % cols);
        if (!out.includes(n)) out.push(n);
      }
    }
    return out;
  }

  /**
   * The chunks the camera is about to show: within (ax, ay) tiles ahead of
   * the view [x0, x0 + w) × [y0, y0 + h) and not in it, soonest first. Only
   * ahead in the direction of motion; nothing past a pole, nothing when the
   * view already spans the planet's width (horizontally) or height.
   */
  export function aheadChunks(x0: number, y0: number, w: number, h: number, ax: number, ay: number): number[] {
    ax = clamp(ax, -LAND_CHUNK, LAND_CHUNK);
    ay = clamp(ay, -LAND_CHUNK, LAND_CHUNK);
    const vy0 = Math.max(0, y0);
    const vy1 = Math.min(GRID_H, y0 + h);
    if (w >= GRID_W) ax = 0;
    if ((ay < 0 && vy0 <= 0) || (ay > 0 && vy1 >= GRID_H)) ay = 0;
    if (ax === 0 && ay === 0) return [];
    const visible = new Set(chunksIn(x0, vy0, x0 + w, vy1));
    const cols = GRID_W / LAND_CHUNK;
    const soon = new Map<number, number>();
    const ry0 = Math.max(0, vy0 + Math.min(ay, 0));
    const ry1 = Math.min(GRID_H, vy1 + Math.max(ay, 0));
    const rx0 = x0 + Math.min(ax, 0);
    const rx1 = x0 + w + Math.max(ax, 0);
    for (let cy = Math.floor(ry0 / LAND_CHUNK); cy <= Math.floor((ry1 - 1e-9) / LAND_CHUNK); cy++) {
      for (let cu = Math.floor(rx0 / LAND_CHUNK); cu <= Math.floor((rx1 - 1e-9) / LAND_CHUNK); cu++) {
        const n = cy * cols + (((cu % cols) + cols) % cols);
        if (visible.has(n)) continue;
        // When the moving view first overlaps the chunk, as a share of the lookahead (0..1).
        const tx = entry(cu * LAND_CHUNK, x0, x0 + w, ax);
        const ty = entry(cy * LAND_CHUNK, vy0, vy1, ay);
        const t = Math.max(tx, ty);
        if (t > 1) continue;
        const was = soon.get(n);
        if (was === undefined || t < was) soon.set(n, t);
      }
    }
    return [...soon.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0]).map((e) => e[0]);
  }

  /** Share of the lookahead `a` after which the span [v0, v1) first overlaps the chunk at c; Infinity if it never does. */
  function entry(c: number, v0: number, v1: number, a: number): number {
    if (c + LAND_CHUNK > v0 && c < v1) return 0;
    const gap = c >= v1 ? c - v1 : c + LAND_CHUNK - v0;
    if (a === 0 || Math.sign(gap) !== Math.sign(a)) return gap === 0 ? 0 : Infinity;
    return gap / a;
  }
}
