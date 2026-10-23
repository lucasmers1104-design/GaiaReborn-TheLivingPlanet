/* =============================================================================
 * Gaia Reborn — the vines on screen
 * -----------------------------------------------------------------------------
 * Draws the vine planned in vinegrowth.ts on three pixel canvases: behind the
 * rail (the stem, most leaves, flowers, fireflies), in front of it (leaves on
 * a button's rim, falling leaves) and over the top bar (the stem's
 * climb round the logo plaque, the run along the bar's bottom edge, the
 * cluster hanging from its right end; what hangs below the bar is moved onto
 * a stage canvas under the windows). The shown growth eases toward the
 * planet's greenery a step at a time and leaves unfurl size by size; a new
 * planet or a load snaps. Now and then a wind wave runs up the vine; in a
 * crisis dry leaves fall and later grow back. Anchors are measured only after
 * a resize, the stem is rasterised only when it grew or changed colour, and
 * the canvases redraw only when an art frame changes.
 * ========================================================================== */

namespace SE {
  /** One growth step (ms): the stem moves on, a leaf unfurls by one size. */
  const STEP_MS = 120;
  /** Greenery per step: at least this, or this share of the way left. */
  const GROW_MIN = 0.003;
  const GROW_SHARE = 0.06;
  /** Art px the top bar's overlay hangs below the bar. */
  const HANG = 14;
  /** Art px the stage canvases reach beyond the rail's right edge, for the leaves. */
  const OVERHANG = 18;
  /** The pixel animation's tick (ms), 8 fps. */
  const TICK_MS = 125;
  /** A wind wave: art px per second up the vine, the sway frames a leaf plays as it passes, seconds between waves. */
  const WAVE_SPEED = 150;
  const SWAY = [1, 2, 2, 1];
  const WAVE_GAP_S = [7, 16];
  /** The pointer entering a rail button: the leaves within this many art px of it play these sway frames once. */
  const TWITCH = [1, 2, 1];
  const TWITCH_REACH = 6;
  /** A falling leaf: art px per second down, and its longest flight (ms). */
  const FALL_SPEED = 24;
  const FALL_MS = 9000;
  /** A fallen leaf grows back once vitality is this far above its fall threshold. */
  const REGROW = 0.08;
  /** Greenery past a trunk pixel's birth at which it turns woody, spread over 8 dither steps. */
  const WOOD_AGE = 0.04;
  const WOOD_DITHER = 0.05;
  /** The stem's colours by shade: outline, dark, mid, light. */
  const RAMPS: Record<string, readonly string[]> = {
    wood: ['stem0', 'stem1', 'stem2', 'stem3'],
    vine: ['vine0', 'vine2', 'vine3', 'vine4'],
    faded: ['faded0', 'faded1', 'faded2', 'faded3'],
    dry: ['wilt0', 'wilt1', 'wilt2', 'wilt3'],
  };
  const LEAF_SIZES = ['s', 'm', 'l'];

  interface Falling { x: number; y: number; layer: VineLayerId; t0: number; phase: number }

  export class VineLayer {
    private readonly art = UiArt.shared();
    private readonly canvases: readonly PixelCanvas[] = [
      new PixelCanvas('vines-back', 46), new PixelCanvas('vines-front', 51), new PixelCanvas('vines-top', 50),
      // The top overlay's rows below the bar, on the stage: in the bar's context (z 600) they would cover the windows.
      new PixelCanvas('vines-hang', 51),
    ];
    /** The back canvas's vine without the fireflies, off the page: a firefly tick copies it instead of redrawing every canvas. */
    private readonly backArt = new PixelCanvas('vines-back-art', 0);
    private readonly observer: ResizeObserver | null = null;
    private readonly watched = new Set<Element>();
    private dirty = true;
    private scaleKey = '';
    /** Rows of the top overlay above the stage's top edge (the bar's height in art px). */
    private topOff = 0;
    private plan: VinePlan | null = null;
    private state: LivingState = SLEEPING_STATE;
    private snap = true;
    /** The greenery shown, easing toward the state's. */
    private g = 0;
    private lastStep = 0;
    private sizes = new Int8Array(0);
    private looks = new Int8Array(0);
    private fallen = new Uint8Array(0);
    private flowerF = new Int8Array(0);
    private curlF = new Int8Array(0);
    private stemKey = '';
    private stemStale = true;
    private stems: (ImageData | null)[] = [null, null, null];
    private falling: Falling[] = [];
    private waveT0 = -Infinity;
    private nextWave = 0;
    /** Per leaf: when its hover twitch started. */
    private twitchAt = new Float64Array(0);
    private twitchEnd = 0;
    private hovered: Element | null = null;
    /** The rail buttons' boxes as last laid out. */
    private btnBoxes = new Map<Element, VineBox>();
    private still = false;
    /** Bumps whenever a step changed what is drawn. */
    private version = 0;
    private drawn = '';
    private drawnArt = '';
    private rgb: Record<string, readonly [number, number, number]> = {};

    constructor(private readonly stage: HTMLElement, private readonly topbar: HTMLElement) {
      stage.append(this.canvases[0].canvas, this.canvases[1].canvas, this.canvases[3].canvas);
      topbar.appendChild(this.canvases[2].canvas);
      if (typeof ResizeObserver === 'function') this.observer = new ResizeObserver(() => { this.dirty = true; });
      this.watch(stage);
      this.watch(topbar);
      this.watch(stage.querySelector('.dock'));
      window.addEventListener('resize', () => { this.dirty = true; });
      stage.addEventListener('pointerover', (e) => this.hover(e.target instanceof Element ? e.target.closest('.rail-btn') : null));
    }

    /** The living state, about ten times a second. */
    update(state: LivingState): void {
      if (state.generation !== this.state.generation) this.snap = true;
      this.state = state;
    }

    /** Call every frame; draws only when an art frame changes. */
    render(now: number, still: boolean): void {
      const art = this.art;
      if (!art.ready) { art.load(); return; }
      this.still = still;
      const scale = uiScale();
      const key = `${scale.s}|${scale.dpr}`;
      if (this.dirty || key !== this.scaleKey) this.layout(scale, key);
      const plan = this.plan;
      if (!plan) return;
      if (this.snap) {
        this.snap = false;
        this.g = this.state.greenery;
        this.falling = [];
        this.settle(now, still, false);
      } else if (now - this.lastStep >= STEP_MS) {
        // Still: the end state at once, no unfurling and no falling leaves.
        this.lastStep = now;
        const d = this.state.greenery - this.g;
        const move = Math.max(GROW_MIN, Math.abs(d) * GROW_SHARE);
        this.g = still || Math.abs(d) <= move ? this.state.greenery : this.g + Math.sign(d) * move;
        this.settle(now, still, !still);
      }

      if (!still && now >= this.nextWave) {
        if (this.nextWave > 0 && this.sizes.some((z) => z >= 0)) this.waveT0 = now;
        this.nextWave = now + (WAVE_GAP_S[0] + Math.random() * (WAVE_GAP_S[1] - WAVE_GAP_S[0])) * 1000;
      }
      if (this.falling.length) {
        this.falling = this.falling.filter((p) => {
          const y = this.fallAt(p, now)[1] + (p.layer === 2 ? this.topOff : 0);
          return now - p.t0 < FALL_MS && y < this.canvases[p.layer].h + 4;
        });
      }
      const waving = now - this.waveT0 < (plan.reach / WAVE_SPEED) * 1000 + SWAY.length * TICK_MS;
      const tick = Math.floor(now / TICK_MS);
      const anim = !still && (waving || now < this.twitchEnd || this.falling.length > 0);
      const lit = !still && this.motes();
      const vine = `${this.version}|${art.version}|${anim ? tick : -1}|${still}`;
      const sig = `${vine}|${lit ? tick : -1}`;
      if (sig === this.drawn) return;
      this.drawn = sig;
      if (vine !== this.drawnArt) {
        this.drawnArt = vine;
        this.draw(plan, now, still);
        // Only the bar's own rows stay over the bar; what hangs below it moves under the windows.
        const [, , over, hang] = this.canvases;
        hang.clear();
        hang.ctx.drawImage(over.canvas, 0, this.topOff, over.w, HANG, 0, 0, over.w, HANG);
        over.ctx.clearRect(0, this.topOff, over.w, HANG);
      }
      this.drawLights(plan, now, lit);
    }

    /* --------------------------------------------------------- layout -- */

    private watch(e: Element | null): void {
      if (!e || !this.observer || this.watched.has(e)) return;
      this.watched.add(e);
      this.observer.observe(e);
    }

    /** Reads the anchors (the only rect reads) and sizes the canvases. */
    private layout(scale: UiScale, key: string): void {
      this.dirty = false;
      this.scaleKey = key;
      this.plan = null;
      const u = scale.u;
      const sr = this.stage.getBoundingClientRect();
      const tr = this.topbar.getBoundingClientRect();
      if (sr.width <= 0 || sr.height <= 0) return;
      const box = (r: DOMRect): VineBox => ({
        x: Math.round((r.left - sr.left) / u), y: Math.round((r.top - sr.top) / u), w: Math.round(r.width / u), h: Math.round(r.height / u),
      });
      const shown = (e: Element | null): DOMRect | null => {
        const r = e?.getBoundingClientRect();
        return r && r.width > 0 && r.height > 0 ? r : null;
      };
      const h = Math.ceil(sr.height / u);
      let buttons: VineBox[] = [];
      this.btnBoxes.clear();
      this.stage.querySelectorAll('.dock .rail-btn').forEach((e) => {
        const r = shown(e);
        if (!r) return;
        buttons.push(box(r));
        this.btnBoxes.set(e, buttons[buttons.length - 1]);
      });
      buttons.sort((p, q) => p.y - q.y);
      if (!buttons.length) {
        // The rail is not built (yet): its geometry from UI_RAIL, the knot's gap after the tool buttons.
        const R = UI_RAIL;
        buttons = Array.from({ length: R.buttons }, (_, i) => ({ x: R.left, y: R.top + i * R.pitch + (i >= TOOL_NAMES.length ? R.knot : 0), w: R.btn, h: R.btn }));
      }
      const sceneEl = this.stage.querySelector('.companion-scene');
      this.watch(sceneEl);
      const scene = shown(sceneEl);
      const sx = scene ? box(scene).x : 0;
      const sy = scene ? box(scene).y : h - UI_SCENE.h;
      const rp = this.art.point('rock', 'root') ?? [0, 0];
      const root: [number, number] = [sx + UI_SCENE.rockFootX + rp[0], sy + UI_SCENE.h - 1 + rp[1]];
      const brandEl = this.topbar.querySelector('.lt-brand');
      this.watch(brandEl);
      const brand = shown(brandEl);
      const topOff = Math.max(1, Math.ceil((sr.top - tr.top) / u));
      const barW = Math.max(1, Math.ceil(tr.width / u));
      this.topOff = topOff;
      const plan = planVine({ buttons, root, brand: brand ? box(brand) : null, barW, barH: topOff });

      // Gaia beside the rail (uiScale().beside) puts the root right of it.
      const w = Math.max(...buttons.map((b) => b.x + b.w), root[0]) + OVERHANG;
      const [back, front, over, hang] = this.canvases;
      back.size(w, h, scale);
      this.backArt.size(w, h, scale);
      front.size(w, h, scale);
      over.size(barW, topOff + HANG, scale);
      hang.size(barW, HANG, scale);
      back.place({ left: 0, top: 0 });
      front.place({ left: 0, top: 0 });
      hang.place({ left: 0, top: 0 });
      // Relative to the bar's padding box; row topOff of the overlay lies on the stage's top row.
      over.place({ left: sr.left - tr.left - this.topbar.clientLeft, top: sr.top - topOff * u - tr.top - this.topbar.clientTop });
      this.stems = [new ImageData(w, h), null, new ImageData(barW, topOff + HANG)];
      this.plan = plan;
      this.sizes = new Int8Array(plan.leaves.length).fill(-1);
      this.looks = new Int8Array(plan.leaves.length).fill(-1);
      this.fallen = new Uint8Array(plan.leaves.length);
      this.twitchAt = new Float64Array(plan.leaves.length).fill(-Infinity);
      this.flowerF = new Int8Array(plan.flowers.length).fill(-2);
      this.curlF = new Int8Array(plan.curls.length).fill(-2);
      this.falling = [];
      this.stemKey = '';
      // A new layout shows the growth it had at once; only the planet's changes animate.
      this.settle(0, true, false);
    }

    /* --------------------------------------------------------- growth -- */

    /** Brings every part to the shown greenery and the state's vitality and bloom: a step, or at once. */
    private settle(now: number, still: boolean, unfurl: boolean): void {
      const plan = this.plan;
      if (!plan) return;
      const { vitality, bloom } = this.state;
      const g = this.g;
      let changed = false;
      plan.leaves.forEach((l, i) => {
        if (l.fall > 0) {
          if (!this.fallen[i] && vitality < l.fall) {
            this.fallen[i] = 1;
            if (unfurl && !still && this.sizes[i] >= 0) this.drop(l, this.sizes[i], now);
          } else if (this.fallen[i] && vitality > l.fall + REGROW) this.fallen[i] = 0;
        }
        const want = this.fallen[i] ? -1 : leafSize(l, g);
        const was = this.sizes[i];
        const size = !unfurl || this.fallen[i] ? want : was < want ? was + 1 : was > want ? was - 1 : was;
        const look = leafLook(l, vitality);
        if (size !== was || look !== this.looks[i]) changed = true;
        this.sizes[i] = size;
        this.looks[i] = look;
      });
      plan.flowers.forEach((f, i) => {
        const fr = flowerFrame(f, g, bloom, vitality);
        if (fr !== this.flowerF[i]) { this.flowerF[i] = fr; changed = true; }
      });
      plan.curls.forEach((c, i) => {
        const fr = curlFrame(c, g, vitality);
        if (fr !== this.curlF[i]) { this.curlF[i] = fr; changed = true; }
      });
      // The stem's pixels change only where a part is born, widens or turns woody (per dither step): key on how far they got.
      let grown = 0;
      for (const p of plan.pixels) {
        grown += stemWidth(p, g);
        if (p.wood) for (let k = 0; k < 8; k++) if (g - p.birth > WOOD_AGE + WOOD_DITHER * (k / 8)) grown++;
      }
      const sk = `${grown}|${Math.round(vitality * 50)}`;
      if (sk !== this.stemKey) { this.stemKey = sk; this.stemStale = true; changed = true; }
      if (changed) this.version++;
    }

    /** The pointer entered a rail button (or left them all): the leaves next to it twitch once. */
    private hover(btn: Element | null): void {
      if (btn === this.hovered) return;
      this.hovered = btn;
      const b = btn && this.btnBoxes.get(btn);
      const plan = this.plan;
      if (!b || !plan || this.still) return;
      // On the animation tick, so the first frame shows at once and each lasts a whole tick.
      const now = Math.floor(performance.now() / TICK_MS) * TICK_MS;
      plan.leaves.forEach((l, i) => {
        if (l.layer === 2 || this.sizes[i] < 0) return;
        const d = Math.max(b.x - l.x, l.x - b.x - b.w, 0) + Math.max(b.y - l.y, l.y - b.y - b.h, 0);
        if (d <= TWITCH_REACH) this.twitchAt[i] = now;
      });
      this.twitchEnd = now + TWITCH.length * TICK_MS;
    }

    /** A dry leaf lets go: it falls from about its middle. */
    private drop(l: VineLeaf, size: number, now: number): void {
      const half = (3 + 3 * size) >> 1;
      const dx = l.dir === 'r' ? half : l.dir === 'l' ? -half : 0;
      const dy = l.dir === 'hang' ? 4 : -half;
      this.falling.push({ x: l.x + dx, y: l.y + dy, layer: l.layer === 0 ? 1 : l.layer, t0: now, phase: Math.random() * 6.3 });
    }

    /** Where a falling leaf is now (art px, unified frame), and the canvas it shows on. */
    private fallAt(p: Falling, now: number): [number, number] {
      const t = (now - p.t0) / 1000;
      const x = p.x + 2.5 * Math.sin(t * 2.4 + p.phase) + 3 * t;
      const y = p.y + FALL_SPEED * t;
      // Leaves from the bar's left end fall on into the stage's front canvas.
      if (p.layer === 2 && y >= HANG - 4 && x < this.canvases[1].w) p.layer = 1;
      return [x, y];
    }

    /** Fireflies and pollen light: only on a lush, healthy, blooming vine. */
    private motes(): boolean {
      const s = this.state;
      return this.g > 0.5 && s.vitality > 0.7 && s.bloom > 0.3;
    }

    /* ----------------------------------------------------------- draw -- */

    private draw(plan: VinePlan, now: number, still: boolean): void {
      const art = this.art;
      const [, front, over] = this.canvases;
      if (this.stemStale) this.raster(plan);
      const [sb, , st] = this.stems;
      if (sb) this.backArt.ctx.putImageData(sb, 0, 0);
      front.clear();
      if (st) over.ctx.putImageData(st, 0, 0);
      const put = (layer: VineLayerId, id: string, f: number, x: number, y: number): void => {
        art.draw((layer === 0 ? this.backArt : this.canvases[layer]).ctx, id, f, x, layer === 2 ? y + this.topOff : y);
      };
      const atBase = (layer: VineLayerId, id: string, f: number, x: number, y: number): void => {
        const b = art.point(id, 'base') ?? [0, 0];
        put(layer, id, f, x - b[0], y - b[1]);
      };

      // The growing tip searches with a little hook until the stem is done.
      let front0 = -1;
      for (let k = 0; k < plan.trunk.length && plan.trunk[k].birth <= this.g; k++) front0 = k;
      if (front0 >= 2 && front0 < plan.trunk.length - 1) {
        const p = plan.trunk[front0];
        atBase(p.layer, (front0 >> 3) % 2 ? 'curl_l' : 'curl_r', front0 < 14 ? 0 : 1, p.x, p.y);
      }
      plan.curls.forEach((c, i) => {
        if (this.curlF[i] >= 0) atBase(c.layer, `curl_${c.dir}`, this.curlF[i], c.x, c.y);
      });
      plan.leaves.forEach((l, i) => {
        const size = this.sizes[i];
        if (size < 0) return;
        let sway = 0;
        if (!still) {
          const t = now - this.waveT0 - (l.wave / WAVE_SPEED) * 1000;
          if (t >= 0 && t < SWAY.length * TICK_MS) sway = SWAY[Math.floor(t / TICK_MS)];
          const h = now - this.twitchAt[i];
          if (h >= 0 && h < TWITCH.length * TICK_MS) sway = Math.max(sway, TWITCH[Math.floor(h / TICK_MS)]);
        }
        const id = l.dir === 'hang' ? 'leaf_hang' : `leaf_${LEAF_SIZES[size]}_${l.dir}`;
        atBase(l.layer, id, this.looks[i] * 3 + sway, l.x, l.y);
      });
      plan.flowers.forEach((f, i) => {
        if (this.flowerF[i] >= 0) put(f.layer, f.id, this.flowerF[i], f.x, f.y);
      });
      if (still) return;
      for (const p of this.falling) {
        const [x, y] = this.fallAt(p, now);
        put(p.layer, 'leaf_fall', art.loopFrame('leaf_fall', now - p.t0), x, y);
      }
    }

    /** The back canvas: its vine as last drawn, then a few lights drifting round flowers on the rail, each glowing for a while, then resting. */
    private drawLights(plan: VinePlan, now: number, lit: boolean): void {
      const back = this.canvases[0];
      back.clear();
      back.ctx.drawImage(this.backArt.canvas, 0, 0);
      if (!lit) return;
      const hosts = plan.flowers.filter((f) => f.layer === 0);
      const t = now / 1000;
      for (let i = 0; i < Math.min(3, hosts.length); i++) {
        const f = hosts[(i * 5 + 2) % hosts.length];
        if ((t * 0.09 + i * 0.37) % 1 > 0.45) continue;
        const x = f.x + 7 * Math.sin(t * 0.37 + i * 2.1);
        const y = f.y - 4 + 5 * Math.sin(t * 0.29 + i * 1.3);
        this.art.draw(back.ctx, 'firefly', this.art.loopFrame('firefly', now, i), x, y);
      }
    }

    /** The stem and branches as pixels: shaded from the upper left, outlined, woody where old, faded in a crisis. */
    private raster(plan: VinePlan): void {
      this.stemStale = false;
      const g = this.g;
      const v = this.state.vitality;
      const body = new Map<number, number>();
      const key = (x: number, y: number): number => (y + 1024) * 16384 + x + 1024;
      plan.pixels.forEach((p, i) => {
        const w = stemWidth(p, g);
        if (w <= 0) return;
        const o = (w - 1) >> 1;
        for (let dy = 0; dy < w; dy++) {
          for (let dx = 0; dx < w; dx++) {
            const k = key(p.x - o + dx, p.y - o + dy);
            const j = body.get(k);
            // The older pixel keeps its colour where the trunk and a branch overlap.
            if (j === undefined || plan.pixels[j].birth > p.birth) body.set(k, i);
          }
        }
      });
      for (const img of this.stems) img?.data.fill(0);
      const set = (layer: VineLayerId, x: number, y: number, c: readonly [number, number, number]): void => {
        const img = this.stems[layer];
        const yy = layer === 2 ? y + this.topOff : y;
        if (!img || x < 0 || yy < 0 || x >= img.width || yy >= img.height) return;
        const o = (yy * img.width + x) * 4;
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = 255;
      };
      const colour = (p: VinePixel, shade: number, x: number, y: number): readonly [number, number, number] => {
        // A per-pixel dither spreads the turn to wood and the wilting over a range instead of a hard edge.
        const jit = ((x * 7 + y * 13) & 7) / 8;
        if (p.wood && g - p.birth > WOOD_AGE + WOOD_DITHER * jit) {
          return this.colorOf(shade === 3 && y % 7 === 0 ? 'stem4' : RAMPS.wood[shade]);
        }
        const vv = v + (jit - 0.44) * 0.12;
        return this.colorOf((vv >= 0.5 ? RAMPS.vine : vv >= 0.27 ? RAMPS.faded : RAMPS.dry)[shade]);
      };
      const N4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [k, i] of body) {
        const x = (k % 16384) - 1024;
        const y = Math.floor(k / 16384) - 1024;
        const p = plan.pixels[i];
        const has = (dx: number, dy: number): boolean => body.has(key(x + dx, y + dy));
        const lit = !has(-1, 0) || !has(0, -1);
        const dark = !has(1, 0) || !has(0, 1);
        set(p.layer, x, y, colour(p, lit && !dark ? 3 : dark && !lit ? 1 : 2, x, y));
        for (const [dx, dy] of N4) if (!has(dx, dy)) set(p.layer, x + dx, y + dy, colour(p, 0, x, y));
      }
    }

    private colorOf(name: string): readonly [number, number, number] {
      let c = this.rgb[name];
      if (!c) {
        const n = parseInt(this.art.color(name).slice(1), 16);
        c = this.rgb[name] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      }
      return c;
    }
  }
}
