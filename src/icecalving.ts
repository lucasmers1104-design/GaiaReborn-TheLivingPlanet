/* =============================================================================
 * SimEarth 2.0 — sea ice calving off the pack edge
 * -----------------------------------------------------------------------------
 * Now and then a thawing tile on the pack edge, in view, does not only
 * dissolve (landice.ts) but calves: a crack runs through it with the sound
 * of cracking ice, the slab breaks off and tips into the sea, a splash
 * spreads its ring, and a small berg drifts away from the edge, bobbing,
 * shrinks and is gone. The tile holds its picture until the break
 * (IceShift.hold); then the slab's own pixels open at once under the
 * falling slab and the rest of the notch thaws as usual.
 * Rare by design: after one, none for ICE_ANIM.cooldownMinS–cooldownMaxS s;
 * at most ICE_ANIM.maxCalvings at once; only zoomed in; never with "Effekte
 * reduzieren"; never under a creature. A tile that freezes again before the
 * break cancels its calving and its sound; a berg that meets ice or land
 * melts away fast; another planet or a load drops everything.
 * Visual only: the simulation never reads this. Sprites: tools/fx/ice.js.
 * ========================================================================== */

namespace SE {
  /** Crack frames 0–3 start at these s into the event: on the file's cracks at 2.7 and 3.2 s (ICE_ANIM.soundOffsetS). */
  const CRACK_AT = [0.15, 0.65, 1.4, 2.1];
  /** The splash starts this long after the break, s, and runs at this many frames per s. */
  const SPLASH_AT = 0.25;
  const SPLASH_FPS = 10;
  const SPLASH_FRAMES = 6;
  /** The berg bobs through frames 0, 1, 0, 2, each this long, s. */
  const BOB = [0, 1, 0, 2];
  const BOB_FRAME = 0.45;
  /** Time constant of the drift slowing down, s. */
  const DRIFT_EASE = 8;
  /** A berg that meets ice or land melts this many times as fast. */
  const MELT_FAST = 3;
  const MELT_FRAMES = 5;
  /** Open water a calving tile needs beside it, tiles: the berg must have room to drift. */
  const ROOM = 2;
  const WORLD_PX = GRID_W * 16;
  const SOUND = 'the-sound-of-an-iceberg-cracking';
  /** Ways off the edge, tried in this order: south and north give the wide slab, east and west the tall one. */
  const DIRS: readonly (readonly [number, number])[] = [[0, 1], [0, -1], [1, 0], [-1, 0]];

  interface Calving {
    readonly tile: number;
    /** World art px: the tile's centre and the slab's centre. */
    readonly cx: number;
    readonly cy: number;
    readonly sx: number;
    readonly sy: number;
    /** Open water east or west: the upright crack and slab. */
    readonly tall: boolean;
    /** Drift velocity at the start, art px per s. */
    readonly vx: number;
    readonly vy: number;
    readonly start: number;
    /** The clock runs with the sound's pitch, so the frames keep to its cracks. */
    readonly rate: number;
    readonly sound: HTMLAudioElement | null;
    /** s into the event when the berg starts to melt, and how fast. */
    meltAt: number;
    meltRate: number;
  }

  export class IceCalving implements IceListener {
    /** "Effekte reduzieren": no calving; the ice only dissolves. */
    still = false;
    /** Tile i carries a creature: no slab breaks under it. */
    occupied: (i: number) => boolean = () => false;
    private live: Calving[] = [];
    /** No new calving before this, performance.now() ms. */
    private nextAt = 0;
    private cam: LandCamera | null = null;
    private cols = 0;
    private rows = 0;

    constructor(private readonly land: PixelTerrain) {
      land.ice.listener = this;
    }

    reset(): void {
      for (const c of this.live) this.end(c);
      this.live = [];
    }

    flips(thawed: readonly number[], frozen: readonly number[], now: number): void {
      // Frozen again before the break: the calving never happened.
      if (frozen.length > 0 && this.live.length > 0) {
        const back = new Set(frozen);
        this.live = this.live.filter((c) => {
          if (!back.has(c.tile) || this.age(c, now) >= ICE_ANIM.crackS) return true;
          this.end(c);
          return false;
        });
      }
      const cam = this.cam;
      if (thawed.length === 0 || this.still || !cam || cam.tilePx < ICE_ANIM.calveMinTilePx || now < this.nextAt ||
        this.live.length >= ICE_ANIM.maxCalvings || !FxArt.shared().ready || Math.random() >= ICE_ANIM.calveChance) return;
      const f = this.land.field;
      const thawedNow = new Set(thawed);
      // Open sea there now, and already before this refresh.
      const open = (x: number, y: number): boolean => {
        if (y < 0 || y >= GRID_H) return false;
        const j = idx(wrapX(x), y);
        return f.seaTile[j] === 1 && f.key[j] === 0 && !thawedNow.has(j);
      };
      const first = Math.floor(Math.random() * thawed.length);
      for (let k = 0; k < thawed.length; k++) {
        const i = thawed[(first + k) % thawed.length];
        const x = i % GRID_W;
        const y = (i / GRID_W) | 0;
        if (!this.inView(x, y) || this.occupied(i)) continue;
        const dir = DIRS.find(([dx, dy]) => {
          for (let s = 1; s <= ROOM; s++) if (!open(x + dx * s, y + dy * s)) return false;
          return true;
        });
        if (!dir) continue;
        this.begin(i, x, y, dir[0], dir[1], now);
        return;
      }
    }

    /** Every frame, ctx at identity (device pixels); also notes the view the next flips are judged by. */
    draw(ctx: CanvasRenderingContext2D, cam: LandCamera, now: number): void {
      const T = cam.tilePx * cam.dpr;
      this.cam = cam;
      this.cols = ctx.canvas.width / T;
      this.rows = ctx.canvas.height / T;
      if (this.live.length === 0) return;
      if (this.still) { this.reset(); return; }
      const art = FxArt.shared();
      if (!art.ready) return;
      const px = T / 16;
      const mid = (cam.scrollX + this.cols / 2) * 16;
      /** The copy of world x nearest the view, snapped to the device pixel grid. */
      const at = (wx: number): number => Math.round((wx - Math.round((wx - mid) / WORLD_PX) * WORLD_PX) * px) / px;
      const snap = (wy: number): number => Math.round(wy * px) / px;
      const f = this.land.field;
      const crackEnd = ICE_ANIM.crackS;
      const afloat = crackEnd + ICE_ANIM.tipS;
      this.live = this.live.filter((c) => {
        const t = this.age(c, now);
        if (t >= c.meltAt + ICE_ANIM.meltS / c.meltRate) {
          this.end(c);
          return false;
        }
        if (t < crackEnd) {
          let fr = -1;
          for (let k = 0; k < CRACK_AT.length; k++) if (t >= CRACK_AT[k]) fr = k;
          if (fr >= 0) art.drawSprite(ctx, cam, 'ice_crack', fr + (c.tall ? 4 : 0), at(c.cx), c.cy);
          return true;
        }
        if (t < afloat) art.drawSprite(ctx, cam, 'ice_calve', Math.min(3, Math.floor(((t - crackEnd) / ICE_ANIM.tipS) * 4)) + (c.tall ? 4 : 0), at(c.sx), c.sy);
        else {
          // Drifting away from the edge, slowing down; it melts where it has got to.
          const d = t - afloat;
          const ease = DRIFT_EASE * (1 - Math.exp(-d / DRIFT_EASE));
          const bx = c.sx + c.vx * ease;
          const by = c.sy + c.vy * ease;
          const ty = Math.floor(by / 16);
          const j = ty >= 0 && ty < GRID_H ? idx(wrapX(Math.floor(bx / 16)), ty) : -1;
          if (t < c.meltAt && (j < 0 || f.seaTile[j] !== 1 || f.key[j] !== 0)) {
            c.meltAt = t;
            c.meltRate = MELT_FAST;
          }
          if (t < c.meltAt) art.drawSprite(ctx, cam, 'iceberg_drift', BOB[Math.floor(d / BOB_FRAME) % BOB.length], at(bx), snap(by));
          else art.drawSprite(ctx, cam, 'iceberg_melt', Math.min(MELT_FRAMES - 1, Math.floor(((t - c.meltAt) * c.meltRate / ICE_ANIM.meltS) * MELT_FRAMES)), at(bx), snap(by));
        }
        const sf = Math.floor((t - crackEnd - SPLASH_AT) * SPLASH_FPS);
        if (sf >= 0 && sf < SPLASH_FRAMES) art.drawSprite(ctx, cam, 'ice_splash', sf, at(c.sx), c.sy - 1);
        return true;
      });
    }

    private begin(i: number, x: number, y: number, dx: number, dy: number, now: number): void {
      const tall = dx !== 0;
      const cx = x * 16 + 8;
      const cy = y * 16 + 8;
      // The slab on the water's side of the crack (tools/fx/ice.js: the wide slab fills rows 4–9 of its box, the tall one columns 5–11).
      const sx = tall ? cx + dx * 4 : cx;
      const sy = tall ? cy : dy > 0 ? cy + 6 : cy - 3;
      const box: [number, number, number, number] = tall ? [sx - 3, cy - 7, sx + 3, cy + 7] : [cx - 7, sy - 4, cx + 7, sy + 2];
      const rate = 1 + (Math.random() * 2 - 1) * ICE_ANIM.soundPitch;
      this.land.ice.hold(i, now + (ICE_ANIM.crackS / rate) * 1000, box);
      const sound = playSfx(SOUND, ICE_ANIM.soundVolume, rate, ICE_ANIM.soundOffsetS);
      this.live.push({
        tile: i, cx, cy, sx, sy, tall,
        vx: dx * ICE_ANIM.driftSpeed + ICE_ANIM.currentX, vy: dy * ICE_ANIM.driftSpeed + ICE_ANIM.currentY,
        start: now, rate, sound,
        meltAt: ICE_ANIM.crackS + ICE_ANIM.tipS + ICE_ANIM.driftS, meltRate: 1,
      });
      this.nextAt = now + (ICE_ANIM.cooldownMinS + Math.random() * (ICE_ANIM.cooldownMaxS - ICE_ANIM.cooldownMinS)) * 1000;
    }

    /** Stop what a calving left running: its hold on the tile, its sound if it was cut short. */
    private end(c: Calving): void {
      this.land.ice.release(c.tile);
      if (c.sound && !c.sound.paused && !c.sound.ended) c.sound.pause();
    }

    /** s into the event, on the sound's clock. */
    private age(c: Calving, now: number): number {
      return ((now - c.start) / 1000) * c.rate;
    }

    /** Tile (x, y) lies in the last drawn view. */
    private inView(x: number, y: number): boolean {
      const cam = this.cam;
      if (!cam) return false;
      let rx = x - cam.scrollX;
      rx -= Math.floor(rx / GRID_W) * GRID_W;
      const ry = y - cam.scrollY;
      return rx >= 0 && rx < this.cols - 1 && ry >= 0 && ry < this.rows - 1;
    }
  }
}
