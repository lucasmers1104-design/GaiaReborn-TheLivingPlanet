/* =============================================================================
 * SimEarth 2.0 — launch film: into space (8.75–12 s) and the director
 * -----------------------------------------------------------------------------
 * Out in the dark: the home world — the player's own planet, painted by the
 * title globe — shrinks away to the lower left as the camera draws back, the
 * ship's light leaves it from the launch site on a long arc, its trail teal.
 * Venus (pale, cloud-banded) and Mars (rust red, a white polar cap) wait on
 * the right, lit from the same sun at the upper left; small labels, and at
 * the end "Aufbruch zu neuen Welten". The last frame stays calm, its stars
 * twinkling and the ship drifting on, while the closing dialog shows.
 *
 * LaunchScenes picks the shot for each moment and the dissolves between them.
 * ========================================================================== */

namespace SE {
  /* --------------------------------------------------------------- type -- */

  interface LaunchMask { readonly w: number; readonly h: number; readonly on: Uint8Array }

  /** `text` as a tight 1-bit mask in Pixelify Sans, `size` art px, `track` extra art px between letters (as introtitle.ts). */
  function launchText(text: string, size: number, weight = 700, track = 0): LaunchMask {
    const SUPER = 8;
    const cv = document.createElement('canvas');
    const g = cv.getContext('2d', { willReadFrequently: true });
    if (!g) throw new Error('SimEarth: 2D context unavailable for the launch film');
    const font = `${weight} ${size * SUPER}px "Pixelify Sans", monospace`;
    g.font = font;
    const chars = [...text];
    const adv = chars.map((ch) => g.measureText(ch).width + track * SUPER);
    const pad = 2 * SUPER;
    cv.width = Math.ceil(adv.reduce((a, b) => a + b, 0) + 2 * pad);
    cv.height = Math.ceil(size * SUPER * 1.6 + 2 * pad);
    g.font = font;
    g.fillStyle = '#fff';
    let x = pad;
    chars.forEach((ch, k) => { g.fillText(ch, x, pad + size * SUPER * 1.2); x += adv[k]; });
    const src = g.getImageData(0, 0, cv.width, cv.height).data;
    const w = Math.floor(cv.width / SUPER), h = Math.floor(cv.height / SUPER);
    const full = new Uint8Array(w * h);
    let x0 = w, x1 = -1, y0 = h, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let cx = 0; cx < w; cx++) {
        let sum = 0;
        for (let dy = 0; dy < SUPER; dy++) {
          let i = ((y * SUPER + dy) * cv.width + cx * SUPER) * 4 + 3;
          for (let dx = 0; dx < SUPER; dx++, i += 4) sum += src[i];
        }
        if (sum < 0.5 * 255 * SUPER * SUPER) continue;
        full[y * w + cx] = 1;
        x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
    const tw = Math.max(0, x1 - x0 + 1), th = Math.max(0, y1 - y0 + 1);
    const on = new Uint8Array(tw * th);
    for (let y = 0; y < th; y++) on.set(full.subarray((y + y0) * w + x0, (y + y0) * w + x0 + tw), y * tw);
    return { w: tw, h: th, on };
  }

  /**
   * Type at (x, y) (top left, art px) with a one-pixel dark outline; `p` 0..1 builds it in through the dither
   * (pixels arrive in a hashed order).
   */
  function launchType(art: LaunchArt, m: LaunchMask, x: number, y: number, c: LaunchRgb, p: number, outline: LaunchRgb): void {
    if (p <= 0) return;
    const ox = Math.round(x), oy = Math.round(y);
    const shown = (mx: number, my: number): boolean => mx >= 0 && my >= 0 && mx < m.w && my < m.h && m.on[my * m.w + mx] === 1
      && launchHash(mx, my, 91) * 0.7 + launchDither(mx, my) * 0.3 < p * 1.05;
    for (let my = -1; my <= m.h; my++) {
      for (let mx = -1; mx <= m.w; mx++) {
        if (shown(mx, my)) { art.set(ox + mx, oy + my, c[0], c[1], c[2]); continue; }
        if (shown(mx - 1, my) || shown(mx + 1, my) || shown(mx, my - 1) || shown(mx, my + 1)) art.set(ox + mx, oy + my, outline[0], outline[1], outline[2]);
      }
    }
  }

  /* -------------------------------------------------------------- space -- */

  /** Globe sizes kept for the shrinking home world, pixels across; the disc is GLOBE_DISC of that. */
  const GLOBE_SIZES = [80, 120, 180, 280, 432];
  const CAPTION = 'Aufbruch zu neuen Welten';

  interface Disc { readonly side: number; readonly px: Uint8ClampedArray }

  /** The home world as the title globe paints it, at a few sizes, turned so the launch site faces the camera's right. */
  class HomeWorld {
    private readonly discs = new Map<number, Disc>();
    /** One globe, resized for each disc: its texture of the world is painted only once. */
    private readonly canvas = make('canvas');
    private readonly globe = new TitleGlobe(this.canvas);
    readonly spin: number;
    /** The launch site on the disc: x right, y down, in disc radii. */
    readonly site: [number, number];

    constructor(private readonly world: WorldState) {
      let tile = world.space.site;
      if (tile < 0) tile = landmark(world);
      const sx = tile % GRID_W, sy = Math.floor(tile / GRID_W);
      const lon = 0.5;
      const turn = sx - (lon / (Math.PI * 2)) * GRID_W;
      this.spin = Math.PI * 2 * (turn / GRID_W - 0.5);
      const lat = (0.5 - (sy + 0.5) / GRID_H) * Math.PI;
      this.site = [Math.cos(lat) * Math.sin(lon), -Math.sin(lat)];
    }

    /** The smallest kept size whose disc is at least `r` pixels, painted on first use. */
    disc(r: number): Disc {
      const side = GLOBE_SIZES.find((s) => s * GLOBE_DISC >= r) ?? GLOBE_SIZES[GLOBE_SIZES.length - 1];
      let d = this.discs.get(side);
      if (d) return d;
      const globe = this.globe;
      globe.size = side;
      globe.spin = this.spin;
      globe.render(this.world);
      const ctx = this.canvas.getContext('2d');
      d = { side, px: ctx ? ctx.getImageData(0, 0, side, side).data : new Uint8ClampedArray(side * side * 4) };
      this.discs.set(side, d);
      return d;
    }

    /** Paint one more size ahead of need; false once all are there. */
    warm(): boolean {
      const side = GLOBE_SIZES.find((s) => !this.discs.has(s));
      if (side === undefined) return false;
      this.disc(side * GLOBE_DISC);
      return true;
    }

    draw(art: LaunchArt, cx: number, cy: number, r: number): void {
      const d = this.disc(r), side = d.side, R = side * GLOBE_DISC, k = R / r;
      const ext = r * 1.12 + 2;
      const x0 = Math.max(0, Math.floor(cx - ext)), x1 = Math.min(art.W - 1, Math.ceil(cx + ext));
      const y0 = Math.max(0, Math.floor(cy - ext)), y1 = Math.min(art.H - 1, Math.ceil(cy + ext));
      for (let y = y0; y <= y1; y++) {
        const gy = Math.floor(side / 2 + (y + 0.5 - cy) * k);
        if (gy < 0 || gy >= side) continue;
        for (let x = x0; x <= x1; x++) {
          const gx = Math.floor(side / 2 + (x + 0.5 - cx) * k);
          if (gx < 0 || gx >= side) continue;
          const q = (gy * side + gx) * 4, a = d.px[q + 3] / 255;
          if (a <= 0) continue;
          const c: LaunchRgb = [launchSnap(d.px[q] / 255), launchSnap(d.px[q + 1] / 255), launchSnap(d.px[q + 2] / 255)];
          if (a >= 0.99) art.set(x, y, c[0], c[1], c[2]);
          else art.blend(x, y, c, a);
        }
      }
    }
  }

  /** Without a launch site: a land tile in the column with the most land, near the equator. */
  function landmark(world: WorldState): number {
    let best = 0, bestLand = -1;
    for (let x = 0; x < GRID_W; x += 2) {
      let land = 0;
      for (let y = GRID_H * 0.3; y < GRID_H * 0.7; y += 2) {
        for (let dx = -10; dx <= 10; dx += 2) if (!world.isWater(idx(wrapX(x + dx), Math.floor(y)))) land++;
      }
      if (land > bestLand) { bestLand = land; best = x; }
    }
    for (let d = 0; d < GRID_H / 3; d++) {
      for (const y of [GRID_H / 2 - d, GRID_H / 2 + d]) if (!world.isWater(idx(best, y))) return idx(best, y);
    }
    return idx(best, GRID_H >> 1);
  }

  /** A lit ball: banded light from the upper left with dithered edges, the surface from `paint` (lat, lon → colour). */
  function ball(art: LaunchArt, cx: number, cy: number, r: number, paint: (lat: number, lon: number) => LaunchRgb, night: LaunchRgb): void {
    const L = [-0.62, -0.5, 0.6].map((c, _, v) => c / Math.hypot(...v));
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const nx = (x + 0.5 - cx) / r, ny = (y + 0.5 - cy) / r, d2 = nx * nx + ny * ny;
        if (d2 > 1) continue;
        const nz = Math.sqrt(1 - d2);
        const lit = nx * L[0] + ny * L[1] + nz * L[2] + (launchDither(x, y) - 0.5) * 0.18;
        const k = lit > 0.55 ? 1 : lit > 0.25 ? 0.8 : lit > 0.02 ? 0.58 : lit > -0.2 ? 0.34 : 0;
        const c = paint(Math.asin(-ny), Math.atan2(nx, nz));
        art.set(x, y, launchSnap(lerp(night[0], c[0], k)), launchSnap(lerp(night[1], c[1], k)), launchSnap(lerp(night[2], c[2], k)));
      }
    }
  }

  const MARS = { base: launchHex('#c8643c'), dark: launchHex('#8c3c2d'), light: launchHex('#e19164'), cap: launchHex('#f5ebe1'), label: launchHex('#e19164') };
  const VENUS = { base: launchHex('#e6d291'), band: launchHex('#cdb473'), light: launchHex('#f5ebc3'), label: launchHex('#f0dc9b') };
  const NIGHT = launchHex('#0a0c1c');
  const INK = launchHex('#05060f');
  const TEXT = launchHex('#f2efe2');

  export class LaunchSpace {
    private readonly home: HomeWorld;
    private sky: Float32Array | null = null;
    private skyW = 0;
    private skyH = 0;
    private readonly stars: { x: number; y: number; lum: number; tw: number; glint: boolean }[];
    private type: { venus: LaunchMask; mars: LaunchMask; caption: LaunchMask } | null = null;

    constructor(world: WorldState) {
      this.home = new HomeWorld(world);
      // Every size now, before the first frame: one globe of the largest size alone would stall a frame by far.
      while (this.home.warm()) { /* next size */ }
      const rng = new Rng(0xa57e0);
      this.stars = Array.from({ length: 420 }, () => ({ x: rng.next(), y: rng.next(), lum: rng.chance(0.05) ? rng.range(0.7, 1) : rng.range(0.1, 0.45), tw: rng.range(0, 6.3), glint: rng.chance(0.03) }));
    }

    private typeReady(): boolean {
      if (this.type) return true;
      if (!document.fonts.check('700 16px "Pixelify Sans"') || !document.fonts.check('400 16px "Pixelify Sans"')) return false;
      this.type = { venus: launchText('Venus', 11, 400), mars: launchText('Mars', 11, 400), caption: launchText(CAPTION, 13, 700) };
      return true;
    }

    /** The far sky, painted once per size: deep blue-black, a faint band of the galaxy, the sun's glow from the upper left. */
    private background(art: LaunchArt): Float32Array {
      const { W, H } = art;
      if (this.sky && this.skyW === W && this.skyH === H) return this.sky;
      const sky = new Float32Array(W * H * 3);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const u = x / W, v = y / H;
          const band = Math.exp(-(((v - 0.15 - u * 0.55) / 0.16) ** 2)) * (0.6 + 0.4 * Math.sin(u * 23 + v * 9) * Math.sin(u * 7 - v * 17));
          const sun = Math.max(0, 1 - Math.hypot(u * (W / H), v) / 1.1) ** 2;
          const q = (y * W + x) * 3;
          sky[q] = 0.012 + band * 0.05 + sun * 0.16;
          sky[q + 1] = 0.016 + band * 0.035 + sun * 0.1;
          sky[q + 2] = 0.045 + band * 0.07 + sun * 0.05;
        }
      }
      this.sky = sky; this.skyW = W; this.skyH = H;
      return sky;
    }

    /** The shot at t (held at 12 s, `idle` seconds on). */
    paint(art: LaunchArt, t: number, still: boolean, idle: number): void {
      const { W, H } = art;
      art.buf.set(this.background(art));
      const live = t + idle;
      for (const s of this.stars) {
        const x = Math.floor(s.x * W), y = Math.floor(s.y * H);
        const l = s.lum * (still ? 1 : 0.7 + 0.3 * Math.sin(live * (1.3 + s.lum * 2) + s.tw * 9));
        art.add(x, y, l * 0.9, l * 0.94, l);
        if (s.glint) { const g = l * 0.4; art.add(x + 1, y, g, g, g); art.add(x - 1, y, g, g, g); art.add(x, y + 1, g, g, g); art.add(x, y - 1, g, g, g); }
      }

      // The home world draws back and down to the left; it starts as the curve the climb left below.
      const back = smooth(introSpan(t, 8.75, 11.4)), shrink = 1 - Math.pow(1 - back, 2.2);
      const r = H * Math.exp(lerp(Math.log(1.47), Math.log(0.21), shrink));
      const cx = W * lerp(0.5, 0.25, 1 - Math.pow(1 - back, 1.4)), cy = lerp(H * 0.7 + r, H * 0.59, shrink);
      this.home.draw(art, cx, cy, r);

      // Venus and Mars, drifting in a little as the view widens.
      const come = smooth(introSpan(t, 9.1, 10.6));
      const vx = W * (0.6 + 0.04 * (1 - come)), vy = H * 0.24, vr = H * 0.075;
      const mx = W * (0.85 + 0.05 * (1 - come)), my = H * 0.58, mr = H * 0.058;
      if (come > 0) {
        art.glow(vx, vy, vr * 1.8, [0.9, 0.85, 0.6], 0.16 * come);
        ball(art, vx, vy, vr, (lat, lon) => {
          const sw = Math.sin(lat * 6 + Math.sin(lon * 2.5 + lat * 3) * 1.6);
          return sw > 0.75 ? VENUS.light : sw < -0.8 ? VENUS.band : VENUS.base;
        }, NIGHT);
        ball(art, mx, my, mr, (lat, lon) => {
          if (lat > 1.05) return MARS.cap;
          const n = Math.sin(lon * 4 + 1) * Math.cos(lat * 3) + 0.6 * Math.sin(lon * 7 - lat * 5);
          return n > 0.7 ? MARS.dark : n < -0.9 ? MARS.light : MARS.base;
        }, NIGHT);
        if (come < 1) {
          // Out of the dark: dissolve them in.
          for (const [x, y, rr] of [[vx, vy, vr], [mx, my, mr]]) {
            for (let yy = Math.floor(y - rr - 2); yy <= y + rr + 2; yy++) for (let xx = Math.floor(x - rr - 2); xx <= x + rr + 2; xx++) {
              if (launchDither(xx, yy) >= come && (xx - x) ** 2 + (yy - y) ** 2 <= (rr + 1.5) ** 2) {
                const q = (yy * W + xx) * 3, sk = this.background(art);
                if (xx >= 0 && yy >= 0 && xx < W && yy < H) art.set(xx, yy, sk[q], sk[q + 1], sk[q + 2]);
              }
            }
          }
        }
      }

      // The ship: a light leaving the launch site on a long arc between them, its trail teal.
      const go = introSpan(t, 9.0, 12);
      const u = Math.min(0.97, 0.78 * (1 - Math.pow(1 - go, 2)) + (still ? 0 : Math.min(0.12, idle * 0.004)));
      const p0x = cx + this.home.site[0] * r, p0y = cy + this.home.site[1] * r;
      const p2x = lerp(vx, mx, 0.7), p2y = lerp(vy, my, 0.6);
      const p1x = lerp(p0x, p2x, 0.45), p1y = Math.min(p0y, p2y) - H * 0.08;
      const at = (k: number): [number, number] => {
        const a = (1 - k) * (1 - k), b2 = 2 * k * (1 - k), c = k * k;
        return [a * p0x + b2 * p1x + c * p2x, a * p0y + b2 * p1y + c * p2y];
      };
      if (go > 0) {
        const tail = 0.32;
        for (let n = 0; n <= 90; n++) {
          const k = u - (n / 90) * tail;
          if (k < 0) break;
          const [x, y] = at(k);
          const v = 0.6 * (1 - n / 90) ** 1.5 * (n % 2 === 0 || n < 30 ? 1 : 0.5);
          art.add(Math.round(x), Math.round(y), v * 0.3, v * 0.85, v * 0.9);
          if (n < 18) art.add(Math.round(x), Math.round(y) + 1, v * 0.15, v * 0.4, v * 0.45);
        }
        const [sx, sy] = at(u);
        const pulse = still ? 1 : 0.85 + 0.15 * Math.sin(live * 6);
        art.glow(sx, sy, 7, [0.6, 0.95, 1], 0.6 * pulse);
        art.set(Math.round(sx), Math.round(sy), 1.4, 1.4, 1.3);
        art.add(Math.round(sx) + 1, Math.round(sy), 0.5, 0.6, 0.6);
        art.add(Math.round(sx), Math.round(sy) + 1, 0.5, 0.6, 0.6);
      }

      // Labels, then the caption.
      if (this.typeReady() && this.type) {
        const ty = this.type, lab = introSpan(t, 9.9, 10.7), cap = introSpan(t, 10.3, 11.3);
        launchType(art, ty.venus, vx - ty.venus.w / 2, vy + vr + 4, VENUS.label, lab, INK);
        launchType(art, ty.mars, mx - ty.mars.w / 2, my + mr + 4, MARS.label, lab, INK);
        launchType(art, ty.caption, W / 2 - ty.caption.w / 2, H * 0.88 - ty.caption.h / 2, TEXT, cap, INK);
      }
    }
  }

  const smooth = (v: number): number => smoothstep(clamp(v, 0, 1));

  /** The film's frames: which shot when, and the dissolves between them. */
  export class LaunchScenes {
    private readonly art = new LaunchArt();
    private readonly ground: LaunchGroundKit;
    private readonly high: LaunchSkyKit;
    private readonly space: LaunchSpace;

    constructor(world: WorldState) {
      this.ground = launchGroundKit();
      this.high = launchSkyKit(this.ground.puffs);
      this.space = new LaunchSpace(world);
      // One frame of each shot off screen, so none stutters the first time it is painted.
      const art = this.art;
      art.fit(window.innerWidth || 960, window.innerHeight || 540, window.devicePixelRatio || 1);
      for (const t of [0.5, 2.6, 3.4]) paintPadShot(art, this.ground, t, false, t > 2 && t < 3.7);
      for (const t of [4.4, 6.6]) paintPadShot(art, this.ground, t, false, false);
      paintHighShot(art, this.high, 7.3, false);
      this.space.paint(art, 10, false, 0);
    }

    /** Keep the frame on screen, for the dissolve after a skip. */
    keepFrame(): void {
      this.art.hold();
    }

    /** The frame at t on ctx (CSS px w × h); `idle` s on the held last frame; `fade` < 1 dissolves from the kept frame. */
    draw(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, t: number, still: boolean, idle: number, fade: number): void {
      const art = this.art;
      art.fit(w, h, dpr);
      const T = LAUNCH_T;
      const pad = (close: boolean) => (): void => paintPadShot(art, this.ground, t, still, close);
      const high = (): void => paintHighShot(art, this.high, t, still);
      const space = (): void => this.space.paint(art, Math.min(t, FILM_SECONDS), still, idle);
      const cut = (a: () => void, b: () => void, from: number, to: number): void => {
        a();
        art.hold();
        b();
        art.dissolve(introSpan(t, from, to));
      };
      const d1 = still ? 0.25 : 0.15, d4 = still ? 0.4 : 0.25;
      if (fade < 1) {
        // After a skip: the last frame, dissolving in over what was on screen.
        space();
        art.dissolve(fade);
      } else if (t < T.close - d1) pad(false)();
      else if (t < T.close + d1) cut(pad(false), pad(true), T.close - d1, T.close + d1);
      else if (t < T.wide) pad(true)();
      else if (still && t < T.wide + 0.3) cut(pad(true), pad(false), T.wide, T.wide + 0.3);
      else if (t < T.breach) pad(false)();
      else if (t < T.space - d4) high();
      else if (t < T.space + d4) cut(high, space, T.space - d4, T.space + d4);
      else space();
      art.present(ctx, dpr);
    }
  }
}
