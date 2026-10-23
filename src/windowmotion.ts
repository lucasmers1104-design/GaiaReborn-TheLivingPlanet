/* =============================================================================
 * Gaia Reborn — windows moved by nature
 * -----------------------------------------------------------------------------
 * A window slides in from the nearer side of the stage while vine sprigs grow
 * round its top corners; on close the sprigs retract and it slides out softly.
 * Windows opened all the time stay quick; the others get a longer entrance
 * with a tendril down the side they came from. Only translate and opacity
 * move, through WAAPI (a stale stylesheet changes nothing): the examine dock
 * and the canvas fits measure boxes that must never be scaled. Still mode
 * shows and hides at once, the sprigs grown. The sprigs are UI pixel art in
 * two small canvases at the corners, redrawn only when a growth step, the
 * scale or the planet's state changes: the leaves fade in a crisis and a
 * flower opens while the planet blooms.
 * ========================================================================== */

namespace SE {
  /** Opened all the time: a quick slide. Every other window gets the vines' longer entrance. */
  const QUICK = /^(examine|species|evolution|lexicon|map|graph-.+)$/;
  /** Durations (ms), slide distances (CSS px) and the sprigs' first growth frame. */
  const QUICK_MOTION = { enter: 200, exit: 180, slide: 32, out: 24, first: 1 };
  const SPECIAL_MOTION = { enter: 420, exit: 260, slide: 88, out: 48, first: 0 };
  /** One growth step of the sprigs: the pixel art's pace, about 12 fps. */
  const STEP_MS = 80;
  /** Art px the sprigs sit out over the window's clipped edge: their outer outline hides under the frame (tools/uiart/chrome.js FREE). */
  const SPRIG_OUT = 1;
  /** Length of a special window's tendril when grown, art px. */
  const TENDRIL = 30;
  /** Rows of the tendril's leaves: below the title bar's icon tile down to 1.6 CSS px per art px. */
  const TENDRIL_LEAVES = [20, 27];
  /** Art px a tendril's leaves and curl need beside the frame edge. */
  const TENDRIL_ROOM = 10;
  const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
  const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';
  /** Freshness (LivingMood vitality) below which the leaves fade, and wilt. */
  const FADED_BELOW = 0.6;
  const WILTED_BELOW = 0.3;
  /** Bloom above which the grown sprigs carry their flower. */
  const FLOWER_BLOOM = 0.3;

  type Side = 'l' | 'r';

  /** Windows on screen: their sprigs follow the planet's freshness and bloom. */
  const onScreen = new Set<WindowMotion>();
  let pollTimer = 0;

  function watch(m: WindowMotion, on: boolean): void {
    if (on) onScreen.add(m);
    else onScreen.delete(m);
    if (onScreen.size && !pollTimer) pollTimer = window.setInterval(() => { for (const w of onScreen) w.refresh(); }, 1000);
    else if (!onScreen.size && pollTimer) { clearInterval(pollTimer); pollTimer = 0; }
  }

  export class WindowMotion {
    private readonly cfg: typeof QUICK_MOTION;
    private readonly decor: WindowDecor;
    private anim: Animation | null = null;
    private dir: 'in' | 'out' | null = null;
    private dur = 1;
    /** Animation time this run began at (a run that turns round begins part-way), and the sprigs' frame then. */
    private startAt = 0;
    private g0 = -1;
    private raf = 0;

    constructor(private readonly root: HTMLElement, id: string) {
      const special = !QUICK.test(id);
      this.cfg = special ? SPECIAL_MOTION : QUICK_MOTION;
      this.decor = new WindowDecor(root, special);
    }

    /** The window was just shown and laid out at its place; a close still running turns round. */
    enter(still: boolean): void {
      const from = this.dir === 'out' ? 1 - this.progress() : 0;
      this.stop();
      watch(this, true);
      this.decor.side = this.side();
      if (still) {
        this.decor.g = this.decor.full();
        this.decor.draw();
        return;
      }
      const sign = this.decor.side === 'l' ? -1 : 1;
      const start = { transform: `translateX(${sign * this.cfg.slide}px)`, opacity: 0, easing: EASE_OUT };
      // The special ones swing a little past their place and settle, as if held.
      const frames: Keyframe[] = this.cfg === SPECIAL_MOTION
        ? [start, { transform: `translateX(${-sign * 3}px)`, opacity: 1, offset: 0.7, easing: 'ease-in-out' }, { transform: 'none', opacity: 1 }]
        : [start, { transform: 'none', opacity: 1 }];
      this.g0 = Math.max(this.decor.g, this.cfg.first);
      this.run('in', frames, this.cfg.enter, 'none', from);
    }

    /**
     * The window is hidden for every caller already; it only leaves the screen:
     * inert, click-through, sprigs retracting, then `.hidden`.
     */
    exit(still: boolean): void {
      const from = this.dir === 'in' ? 1 - this.progress() : 0;
      this.stop();
      if (still) {
        this.done();
        return;
      }
      this.root.inert = true;
      this.root.style.pointerEvents = 'none';
      const sign = this.side() === 'l' ? -1 : 1;
      this.g0 = this.decor.g;
      // Hidden on the slide's own clock, not a timer: a slide that starts a long frame late is not cut short.
      this.run('out', [
        { transform: 'none', opacity: 1, easing: EASE_IN },
        { transform: `translateX(${sign * this.cfg.out}px)`, opacity: 0 },
      ], this.cfg.exit, 'forwards', from).onfinish = () => this.done();
    }

    /** Follow the planet while the window rests on screen (bloom, freshness, scale, the atlas loading). */
    refresh(): void {
      if (this.dir === 'out' || (this.dir === 'in' && this.progress() < 1)) return;
      this.dir = null;
      this.decor.g = this.decor.full();
      this.decor.draw();
    }

    private run(dir: 'in' | 'out', frames: Keyframe[], dur: number, fill: FillMode, from: number): Animation {
      this.dir = dir;
      this.dur = dur;
      this.startAt = from * dur;
      const anim = this.root.animate(frames, { duration: dur, fill });
      anim.currentTime = this.startAt;
      this.anim = anim;
      this.grow();
      return anim;
    }

    /** One growth step of the sprigs per STEP_MS of the slide (its clock waits for its first frame), towards grown or gone. */
    private readonly grow = (): void => {
      this.raf = 0;
      if (!this.dir) return;
      const t = this.anim?.currentTime;
      const steps = Math.floor(Math.max(0, (typeof t === 'number' ? t : 0) - this.startAt) / STEP_MS);
      const full = this.decor.full();
      const g = this.dir === 'in' ? Math.min(full, this.g0 + steps) : Math.max(-1, this.g0 - steps);
      this.decor.g = g;
      this.decor.draw();
      if (this.dir === 'in' ? g < full : g >= 0) this.raf = requestAnimationFrame(this.grow);
    };

    /** How far the running slide has come, 0..1. */
    private progress(): number {
      const t = this.anim?.currentTime;
      return typeof t === 'number' ? clamp(t / this.dur, 0, 1) : 1;
    }

    private side(): Side {
      const host = this.root.parentElement;
      return !host || this.root.offsetLeft + this.root.offsetWidth / 2 <= host.clientWidth / 2 ? 'l' : 'r';
    }

    /** Off screen: display none, nothing running; the next entrance grows the sprigs anew. */
    private done(): void {
      this.stop();
      this.root.classList.add('hidden');
      this.decor.g = -1;
      watch(this, false);
    }

    private stop(): void {
      this.anim?.cancel();
      this.anim = null;
      this.dir = null;
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.root.inert = false;
      this.root.style.pointerEvents = '';
    }
  }

  /* -------------------------------------------------------------- decor -- */

  /** The sprigs at a window's (or a flyout menu's) top corners and, for a special window, its tendril. */
  export class WindowDecor {
    /** The sprigs' frame: 0 sprout … 2 grown, 3 grown with a flower; -1 none. */
    g = -1;
    /** The side the window came from: its tendril hangs there. */
    side: Side = 'l';
    private readonly corners: Record<Side, PixelCanvas>;
    private key = '';

    constructor(root: HTMLElement, private readonly tendril: boolean) {
      this.corners = { l: new PixelCanvas('wm-sprig wm-sprig-l', 5), r: new PixelCanvas('wm-sprig wm-sprig-r', 5) };
      // Children of the root, not of .win-body: they stay at the corners however the body scrolls.
      root.append(this.corners.l.canvas, this.corners.r.canvas);
      UiArt.shared().load();
    }

    /** The grown frame: with a flower only while the planet blooms. */
    full(): number {
      return LivingMood.current.bloom > FLOWER_BLOOM ? 3 : 2;
    }

    draw(): void {
      const art = UiArt.shared();
      const scale = uiScale();
      const v = LivingMood.current.vitality;
      const wither = v < WILTED_BELOW ? 2 : v < FADED_BELOW ? 1 : 0;
      const full = this.full();
      const key = `${art.version}|${scale.s}|${scale.dpr}|${this.g}|${full}|${this.side}|${wither}`;
      if (key === this.key) return;
      this.key = key;
      for (const side of ['l', 'r'] as const) this.drawCorner(side, art, scale, wither, full);
    }

    private drawCorner(side: Side, art: UiArt, scale: UiScale, wither: number, full: number): void {
      const pc = this.corners[side];
      const id = `win_corner_${side}`;
      const sp = art.sprite(id);
      const trails = this.tendril && side === this.side;
      // The canvas keeps the tendril's full height while it grows: no resize per step.
      pc.size(sp ? Math.max(sp.w, trails ? TENDRIL_ROOM : 0) : 0, sp ? sp.h + (trails ? TENDRIL : 0) : 0, scale);
      const out = -SPRIG_OUT * scale.u;
      pc.place(side === 'l' ? { left: out, top: out } : { right: out, top: out });
      pc.clear();
      if (!sp || this.g < 0) return;
      const share = clamp((this.g + 1) / (full + 1), 0, 1);
      if (trails) drawTendril(pc, art, side, sp.h, Math.round(TENDRIL * share), share, wither);
      // win_corner_r is right-aligned to the window.
      art.draw(pc.ctx, id, this.g, side === 'l' ? 0 : pc.w - sp.w, 0);
      if (wither > 0) fade(pc, wither);
    }
  }

  /**
   * A thin stem down the window's edge from under the corner sprig, swaying
   * a pixel every four rows, lit from the left; leaves turned inwards and up,
   * and a curl at its tip.
   */
  function drawTendril(pc: PixelCanvas, art: UiArt, side: Side, top: number, len: number, share: number, wither: number): void {
    if (len <= 0) return;
    const ctx = pc.ctx;
    const y0 = top - 3;
    // The corner sprig's stem colours (tools/uiart/chrome.js), so the tendril reads as its continuation.
    const lit = art.color('stem4');
    const dark = art.color('stem3');
    /** Left column of the 2 px stem at row k. */
    const stemX = (k: number): number => {
      const x = 1 + ((k >> 2) & 1);
      return side === 'l' ? x : pc.w - 2 - x;
    };
    for (let k = 0; k < len; k++) {
      ctx.fillStyle = lit;
      ctx.fillRect(stemX(k), y0 + k, 1, 1);
      ctx.fillStyle = dark;
      ctx.fillRect(stemX(k) + 1, y0 + k, 1, 1);
    }
    // The pixel just inside the stem, where a leaf's stalk or the curl's base sits.
    const inner = (k: number): number => (side === 'l' ? stemX(k) + 2 : stemX(k) - 1);
    const stick = (id: string, f: number, k: number): void => {
      const base = art.point(id, 'base') ?? [0, 0];
      art.draw(ctx, id, f, inner(k) - base[0], y0 + k - base[1]);
    };
    const leaf = side === 'l' ? 'leaf_s_r' : 'leaf_s_l';
    for (const k of TENDRIL_LEAVES) if (len > k + 2) stick(leaf, wither * 3, k);
    stick(side === 'l' ? 'curl_r' : 'curl_l', share < 0.5 ? 0 : share < 1 ? 1 : 2, len - 1);
  }

  /** Vine greens to the faded (1) or the wilted (2) ramp, step for step, as 0xrrggbb. */
  const fadeMaps = new Map<number, Map<number, number>>();

  function fadeMap(level: number): Map<number, number> {
    const known = fadeMaps.get(level);
    if (known) return known;
    const from = ramp('vine');
    const to = ramp(level === 1 ? 'faded' : 'wilt');
    const map = new Map<number, number>();
    if (to.length) from.forEach((c, i) => map.set(c, to[Math.round((i * (to.length - 1)) / Math.max(1, from.length - 1))]));
    fadeMaps.set(level, map);
    return map;
  }

  /** A UI palette ramp, dark to light, as 0xrrggbb. */
  function ramp(name: string): number[] {
    const out: number[] = [];
    for (;;) {
      const hex = UI_MANIFEST.colors[`${name}${out.length}`];
      if (!hex) return out;
      out.push(parseInt(hex.slice(1), 16));
    }
  }

  /** Recolour the vine greens of a drawn corner: whole pixels to palette colours, never alpha. */
  function fade(pc: PixelCanvas, level: number): void {
    const map = fadeMap(level);
    if (!map.size || !pc.w || !pc.h) return;
    const im = pc.ctx.getImageData(0, 0, pc.w, pc.h);
    const d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const to = d[i + 3] ? map.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]) : undefined;
      if (to === undefined) continue;
      d[i] = to >> 16;
      d[i + 1] = (to >> 8) & 255;
      d[i + 2] = to & 255;
    }
    pc.ctx.putImageData(im, 0, 0);
  }
}
