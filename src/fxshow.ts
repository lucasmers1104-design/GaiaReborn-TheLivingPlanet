/* =============================================================================
 * SimEarth 2.0 — staging a disaster
 * -----------------------------------------------------------------------------
 * The real-time half of docs/ereignisse-spec.md §2.1. A requested hazard
 * first plays its omen (HAZARD_OMEN_MS) and only then starts in the
 * simulation; its main animation (HAZARD_MAIN_MS) plays from that moment,
 * while the spread runs per tick. Off screen nothing is staged: the hazard
 * starts at once. Each frame the show assembles an FxScene — sprites,
 * shakes, particles — from the scripts that fx*.ts register in FX_SCRIPTS,
 * and from the timed sprites (ash clouds, steam) that drift on by themselves.
 * ========================================================================== */

namespace SE {
  /** One sprite to draw this frame; (x, y) is the world art pixel of its anchor (or of sx, sy). */
  export interface FxDraw {
    readonly id: string;
    readonly frame: number;
    readonly x: number;
    readonly y: number;
    /** World art pixel row the sprite stands on, for sorting with the map's objects. */
    readonly foot: number;
    /** Order among sprites on the same row: a column stands in its cone's crater. */
    readonly z?: number;
    readonly rows?: readonly [number, number] | null;
    readonly sx?: number;
    readonly sy?: number;
  }

  /** A pixel ring around world art pixel (x, y): a shock wave in the air, a ground wave on the ground. */
  export interface FxRing {
    readonly x: number; readonly y: number; readonly r: number; readonly light: string; readonly dark: string; readonly ground: boolean;
    /** Art pixels of arc per dash and per gap; 0 draws the ring solid. */
    readonly dash: number;
  }

  /** Tiles around (x, y) that tremble by `amp` art pixels. */
  export interface FxShake { readonly x: number; readonly y: number; readonly radius: number; readonly amp: number }

  /** A hazard whose main animation is playing. */
  export interface FxStarted { readonly id: number; readonly kind: EventKind; readonly x: number; readonly y: number; readonly born: number }

  /** A sprite that lives on by itself: it drifts, animates and dissolves (ash clouds, steam, puffs). */
  export interface FxTimed {
    readonly id: string;
    x: number;
    y: number;
    /** Art pixels per second. */
    readonly vx: number;
    readonly vy: number;
    readonly born: number;
    readonly life: number;
    /** 'once' spreads all frames over the life; 'loop' loops and plays the dissolve frames at the end. */
    readonly mode: 'once' | 'loop';
  }

  /** What a disaster looks like; each fx*.ts registers one by EventKind. */
  export interface FxScript {
    /** The omen at tile (x, y), `t` ms after the hazard was asked for. */
    omen(s: FxScene, x: number, y: number, t: number): void;
    /** The main animation, `t` ms after the hazard started. */
    main(s: FxScene, st: FxStarted, t: number, world: WorldState): void;
    /** What the world shows every frame from the state hazards leave behind (lava steam, vents). */
    live?(s: FxScene, world: WorldState): void;
    /** Forget what the script keeps by hazard id: a new planet numbers its hazards from 1 again. */
    reset?(): void;
  }

  export const FX_SCRIPTS: (FxScript | undefined)[] = [];

  /** The frame being assembled. */
  export class FxScene {
    readonly objects: FxDraw[] = [];
    /** Flat sprites lying on the ground (fissures): drawn right after the ground, under herds and objects. */
    readonly decals: FxDraw[] = [];
    readonly tops: FxDraw[] = [];
    readonly shakes: FxShake[] = [];
    readonly rings: FxRing[] = [];
    now = 0;
    /** Seconds since the last frame. */
    dt = 0;
    /** "Effekte reduzieren": no shaking, no flashes. */
    reduce = false;
    /** Device pixels per art pixel. */
    pixel = 1;
    /** Below 16 CSS px a tile the map is zoomed out past the art, whatever the screen's pixel ratio. */
    zoomedOut = false;
    /** Tiles in view, with a margin for tall sprites. */
    x0 = 0;
    y0 = 0;
    x1 = 0;
    y1 = 0;
    /** Tiles whose scar objects stay hidden this frame (a fissure still opening). */
    readonly hidden = new Set<number>();

    constructor(readonly particles: FxParticles, private readonly show: FxShow) {}

    /** Add a sprite; its manifest layer decides the pass. */
    add(d: FxDraw): void {
      const sp = FX_MANIFEST.sprites[d.id];
      if (!sp) return;
      (sp.layer === 'top' ? this.tops : this.objects).push(d);
    }

    /** Add a flat sprite that lies on the ground; the trees on and in front of its tile stay in front of it. */
    decal(d: FxDraw): void {
      if (FX_MANIFEST.sprites[d.id]) this.decals.push(d);
    }

    shake(x: number, y: number, radius: number, amp: number): void {
      if (!this.reduce) this.shakes.push({ x, y, radius, amp });
    }

    /** A local flash (a top sprite); left out with reduced effects, so show a calmer frame then. */
    flash(d: FxDraw): void {
      if (!this.reduce) this.tops.push(d);
    }

    ring(x: number, y: number, r: number, light: string, dark: string, ground = false, dash = 0): void {
      this.rings.push({ x, y, r, light, dark, ground, dash });
    }

    /** True once per key and planet: for spawning something exactly one time. */
    once(key: string): boolean {
      return this.show.once(key);
    }

    spawn(t: Omit<FxTimed, 'born'>): void {
      this.show.spawn({ ...t, born: this.now });
    }

    /** Whether tile (x, y) lies in view (the margin included). */
    sees(x: number, y: number): boolean {
      if (y < this.y0 || y > this.y1) return false;
      const dx = ((x - this.x0) % GRID_W + GRID_W) % GRID_W;
      return dx <= this.x1 - this.x0;
    }
  }

  interface Staged {
    readonly kind: EventKind;
    readonly x: number;
    readonly y: number;
    readonly born: number;
    readonly generation: number;
    readonly commit: () => Hazard | null;
    /** How long the omen plays before commit: HAZARD_OMEN_MS, or longer while a lead-in sound runs. */
    readonly omen: number;
  }

  /** Tiles of margin around the view for tall sprites and drifting clouds. */
  const VIEW_MARGIN = 4;
  /** Once-keys kept per planet before the oldest half is dropped. */
  const SEEN_MAX = 4096;

  export class FxShow {
    reduce = false;
    private readonly staged: Staged[] = [];
    private readonly started: FxStarted[] = [];
    private readonly timed: FxTimed[] = [];
    private readonly seen = new Set<string>();
    /** Hazards whose main animation has been decided on (played or skipped). */
    private readonly known = new Set<number>();
    private generation = -1;
    private view = { x0: 0, y0: 0, x1: -1, y1: -1 };

    /**
     * Play the omen of `kind` at (x, y), then call `commit`, which starts the
     * hazard in the simulation. Off screen, or for a hazard without an omen,
     * it starts at once.
     */
    stage(world: WorldState, kind: EventKind, x: number, y: number, commit: () => Hazard | null): void {
      const v = this.view;
      const dx = ((x - v.x0) % GRID_W + GRID_W) % GRID_W;
      const visible = y >= v.y0 && y <= v.y1 && dx <= v.x1 - v.x0;
      if (!FX_SCRIPTS[kind] || !visible || HAZARD_OMEN_MS[kind] <= 0) {
        const h = commit();
        if (h) this.begin(h, performance.now());
        return;
      }
      // The bomb waits out its siren, so it goes off with the bang in the sound.
      const lead = kind === EventKind.AtomicBomb && playSfx('siren-and-nuke') ? NUKE_BOOM_MS : 0;
      this.staged.push({ kind, x, y, born: performance.now(), generation: world.hazards.generation, commit, omen: Math.max(lead, HAZARD_OMEN_MS[kind]) });
    }

    /** Start every staged hazard of this planet at once: with the effect layer off, nothing shows their omens. */
    flush(world: WorldState): void {
      for (const st of this.staged.splice(0)) if (st.generation === world.hazards.generation) st.commit();
    }

    begin(h: Hazard, now: number): void {
      this.known.add(h.id);
      if (FX_SCRIPTS[h.kind]) this.started.push({ id: h.id, kind: h.kind, x: h.x, y: h.y, born: now });
    }

    once(key: string): boolean {
      if (this.seen.has(key)) return false;
      // The oldest keys belong to hazards long over; a Set keeps them in insertion order.
      if (this.seen.size >= SEEN_MAX) {
        let n = 0;
        for (const k of this.seen) {
          if (n++ >= SEEN_MAX / 2) break;
          this.seen.delete(k);
        }
      }
      this.seen.add(key);
      return true;
    }

    spawn(t: FxTimed): void {
      this.timed.push(t);
    }

    /** Assemble this frame's scene. */
    build(world: WorldState, cam: LandCamera, cols: number, rows: number, now: number, dt: number, particles: FxParticles): FxScene {
      if (world.hazards.generation !== this.generation) {
        this.generation = world.hazards.generation;
        this.staged.length = 0;
        this.started.length = 0;
        this.timed.length = 0;
        this.seen.clear();
        this.known.clear();
        particles.clear();
        for (const script of FX_SCRIPTS) script?.reset?.();
        for (const h of world.hazards.list) this.known.add(h.id);
      }
      const s = new FxScene(particles, this);
      s.now = now;
      s.dt = dt;
      s.reduce = this.reduce;
      s.pixel = (cam.tilePx * cam.dpr) / 16;
      s.zoomedOut = cam.tilePx < 16;
      s.x0 = Math.floor(cam.scrollX) - VIEW_MARGIN;
      s.x1 = Math.ceil(cam.scrollX + cols) + VIEW_MARGIN;
      s.y0 = Math.max(0, Math.floor(cam.scrollY) - VIEW_MARGIN);
      s.y1 = Math.min(GRID_H - 1, Math.ceil(cam.scrollY + rows) + VIEW_MARGIN);
      this.view = { x0: Math.floor(cam.scrollX), y0: Math.floor(cam.scrollY), x1: Math.ceil(cam.scrollX + cols), y1: Math.ceil(cam.scrollY + rows) };

      for (let k = this.staged.length - 1; k >= 0; k--) {
        const st = this.staged[k];
        const t = now - st.born;
        if (st.generation !== world.hazards.generation) { this.staged.splice(k, 1); continue; }
        if (t >= st.omen) {
          this.staged.splice(k, 1);
          const h = st.commit();
          if (h) this.begin(h, now);
          continue;
        }
        // A long lead-in holds the omen's opening, then plays the rest up to commit.
        if (s.sees(st.x, st.y)) FX_SCRIPTS[st.kind]?.omen(s, st.x, st.y, Math.max(0, t - (st.omen - HAZARD_OMEN_MS[st.kind])));
      }
      // A hazard that started without the show (nature, a load) plays its main animation if it is fresh and in view.
      for (const h of world.hazards.list) {
        if (this.known.has(h.id)) continue;
        this.known.add(h.id);
        if (world.ticks - h.startTick <= 1 && s.sees(h.x, h.y)) this.begin(h, now);
      }
      for (let k = this.started.length - 1; k >= 0; k--) {
        const st = this.started[k];
        const t = now - st.born;
        if (t > HAZARD_MAIN_MS[st.kind]) { this.started.splice(k, 1); continue; }
        if (s.sees(st.x, st.y)) FX_SCRIPTS[st.kind]?.main(s, st, t, world);
      }
      for (const script of FX_SCRIPTS) script?.live?.(s, world);
      fxScarObjects(s, world);
      fxMarkers(s, world);
      this.timedSprites(s, now, dt);
      return s;
    }

    private timedSprites(s: FxScene, now: number, dt: number): void {
      for (let k = this.timed.length - 1; k >= 0; k--) {
        const t = this.timed[k];
        const age = now - t.born;
        const sp = FX_MANIFEST.sprites[t.id];
        if (!sp || age >= t.life) { this.timed.splice(k, 1); continue; }
        t.x += t.vx * dt;
        t.y += t.vy * dt;
        let frame: number;
        if (t.mode === 'once') {
          frame = Math.floor((age / t.life) * sp.frames.length);
        } else {
          const ms = 1000 / Math.max(1, sp.fps);
          const tail = (sp.frames.length - sp.loop) * ms;
          frame = age > t.life - tail ? sp.loop + Math.floor((age - (t.life - tail)) / ms) : Math.floor(age / ms) % sp.loop;
        }
        const tx = Math.floor(t.x / 16);
        const ty = Math.floor(t.y / 16);
        if (s.sees(wrapX(tx), ty)) s.add({ id: t.id, frame: Math.min(sp.frames.length - 1, frame), x: t.x, y: t.y, foot: t.y });
      }
    }
  }
}
