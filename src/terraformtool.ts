/* =============================================================================
 * SimEarth 2.0 — terraforming brush (the tool in the player's hand)
 * -----------------------------------------------------------------------------
 * The stroke of the "Höhe ändern" tool: while the pointer is held, every frame
 * dabs the ground (terraform.ts) along the way the pointer went since the last
 * frame, so fast lines stay continuous and holding still keeps working. The
 * push starts soft and builds up, so a tap is a small step and holding piles
 * on. It also draws the brush cursor with the height stage under it, a glint
 * on every tile that just moved, the dust and bubbles the brush throws up, and
 * drives its sound (terraformsound.ts). Energy, settling and the map redraw
 * stay with the app.
 * ========================================================================== */

namespace SE {
  const DUST: readonly string[] = [fxColor('sand', 3), fxColor('soil', 3), fxColor('soil', 2), fxColor('soil', 1)];
  const GRIT: readonly string[] = [fxColor('rock', 3), fxColor('rock', 2), fxColor('rock', 1)];
  const SNOW: readonly string[] = [fxColor('white', 0), fxColor('ice', 4), fxColor('ice', 3)];
  const BUBBLE: readonly string[] = [fxColor('white', 0), fxColor('water', 7), fxColor('water', 6), fxColor('water', 5)];
  const RAISE_INK = '#ffe9a6';
  const LOWER_INK = fxColor('water', 7);
  const SHADOW_INK = 'rgba(6,14,12,0.6)';
  /** Ring colour per TERRAFORM_STAGES entry, deep sea to summit. */
  const STAGE_INK: readonly string[] = [
    fxColor('water', 3), fxColor('water', 5), fxColor('water', 7), fxColor('sand', 4), fxColor('meadow', 3),
    fxColor('straw', 3), fxColor('soil', 3), fxColor('rock', 4), fxColor('white', 0),
  ];
  /**
   * Elevation moved per second and tile of brush area when the brush pushes
   * freely: TERRAFORM_RATE 0.6 times the mean smoothstep falloff over a disc
   * (≈ 0.3). Sets `work` to about 1 for a free brush at full strength.
   */
  const FULL_PUSH = 0.18;
  /** Brush strengths: the share of terraform.ts's full rate. */
  const STRENGTHS: readonly { readonly name: string; readonly k: number }[] = [
    { name: 'Sanft', k: 0.3 }, { name: 'Normal', k: 0.6 }, { name: 'Stark', k: 1.2 },
  ];
  /** Seconds a held brush takes to reach its strength, and the share it starts with. */
  const RAMP_S = 0.3;
  const RAMP_FLOOR = 0.15;
  /** Particles per unit of elevation a tile moved. */
  const PARTICLES_PER_UNIT = 50;
  /** A moved tile glints this long, at most this bright; full brightness at this much change in a frame. */
  const GLINT_MS = 200;
  const GLINT_ALPHA = 0.3;
  const GLINT_FULL = 0.012;
  /** The stage label pops this long when the brush centre crosses into the next stage. */
  const POP_MS = 320;

  /** How the brush is used, under its options. */
  export const TERRAFORM_NOTE = 'Gedrückt halten: tippen für kleine Schritte, halten baut auf. Umschalt kehrt die Richtung um, [ und ] oder Alt + Mausrad ändern die Größe. Kostet Energie, je mehr Erde sich bewegt.';

  /** One frame of a stroke: the dabs merged, how hard the brush worked, and the tiles to redraw. */
  export interface TerraformStep extends TerraformDab {
    readonly work: number;
    /** Tile box around the dabs; x may run past the wrap. */
    readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number;
  }

  export class TerraformTool {
    /** Brush radius in tiles. */
    radius = 3;
    /** Index into STRENGTHS. */
    strength = 1;
    /** Shift held: the brush works the other way round. */
    invert = false;
    /** The pointer over the map, CSS pixels from the canvas corner; null when it is off the map. */
    pointer: { x: number; y: number } | null = null;
    /** Elevation moved in the current stroke. */
    moved = 0;
    /** Elevation moved per second in the last frame, for pacing the energy. */
    perSecond = 0;
    /** Which way the running (or last) stroke works. */
    sign: 1 | -1 = 1;
    private last: { x: number; y: number } | null = null;
    private held = 0;
    private readonly touched = new Set<number>();
    private readonly particles = new FxParticles();
    private readonly sound = new TerraformSound();
    /** Elevation as the glints last saw it, so each dab knows how far every tile moved. */
    private readonly seen = new Float32Array(TILE_COUNT);
    private readonly glints = new Map<number, { t: number; a: number; up: boolean }>();
    private readonly cursor = { x: 0, y: 0, shown: false };
    private stage = -1;
    private popAt = -Infinity;
    private lastDraw = 0;

    /** The brush size slider for the tool options. */
    sizeControl(): HTMLElement {
      const row = make('label', 'brush-size');
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(TERRAFORM_RADIUS_MIN);
      input.max = String(TERRAFORM_RADIUS_MAX);
      input.step = '0.25';
      input.value = String(this.radius);
      const value = make('span', 'brush-size-value');
      const show = (): void => { value.textContent = `Ø ${(this.radius * 2).toLocaleString('de-DE')} Felder`; };
      input.addEventListener('input', () => {
        this.radius = Number(input.value);
        show();
      });
      show();
      row.append(make('span', 'brush-size-label', 'Pinselgröße'), input, value);
      return row;
    }

    /** Sanft / Normal / Stark. */
    strengthControl(): HTMLElement {
      const row = make('div', 'brush-size');
      const seg = make('div', 'seg brush-strength');
      seg.setAttribute('role', 'radiogroup');
      seg.setAttribute('aria-label', 'Stärke');
      const buttons = STRENGTHS.map((s, k) => {
        const b = button({ label: s.name, cls: 'seg-btn', onClick: () => { this.strength = k; buttons.forEach((o, j) => setPressed(o, j === k)); } });
        setPressed(b, k === this.strength);
        return b;
      });
      seg.append(...buttons);
      row.append(make('span', 'brush-size-label', 'Stärke'), seg);
      return row;
    }

    /** Grow (1) or shrink (-1) the brush by one step, finer when it is small. */
    resize(dir: 1 | -1): void {
      const next = Math.round(this.radius * (dir > 0 ? 1.15 : 1 / 1.15) * 4) / 4;
      this.radius = clamp(next === this.radius ? this.radius + dir * 0.25 : next, TERRAFORM_RADIUS_MIN, TERRAFORM_RADIUS_MAX);
    }

    get active(): boolean {
      return this.last !== null;
    }

    begin(world: WorldState, sign: 1 | -1, x: number, y: number): void {
      this.sign = sign;
      this.last = { x, y };
      this.held = 0;
      this.touched.clear();
      this.moved = 0;
      this.perSecond = 0;
      this.seen.set(world.elevation);
      this.stage = terraformStage(world.elevation[idx(x, y)]);
      this.sound.start(sign);
    }

    /** Dab from where the last frame left off to tile (x, y), sharing `dt` seconds (real time) among the dabs. */
    step(world: WorldState, x: number, y: number, dt: number): TerraformStep {
      const from = this.last ?? { x, y };
      let dx = x - from.x;
      if (dx > GRID_W / 2) dx -= GRID_W;
      if (dx < -GRID_W / 2) dx += GRID_W;
      const dy = y - from.y;
      const r = this.radius;
      const brush: TerraformBrush = { radius: r, sign: this.sign };
      // Soft start: a tap moves a little, holding builds up to the strength.
      this.held += dt;
      const ramp = RAMP_FLOOR + (1 - RAMP_FLOOR) * smoothstep(Math.min(1, this.held / RAMP_S));
      const push = dt * STRENGTHS[this.strength].k * ramp;
      const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / Math.max(1, r * 0.5)));
      const tiles: number[] = [];
      let moved = 0;
      let emerged = 0;
      let flooded = 0;
      let height = 0;
      for (let k = 1; k <= n; k++) {
        const d = terraformDab(world, wrapX(Math.round(from.x + (dx * k) / n)), Math.round(from.y + (dy * k) / n), brush, push / n);
        for (const t of d.tiles) { tiles.push(t); this.touched.add(t); }
        moved += d.moved;
        emerged += d.emerged;
        flooded += d.flooded;
        height += d.height;
      }
      this.last = { x, y };
      this.moved += moved;
      this.perSecond = dt > 0 ? moved / dt : 0;
      const work = dt > 0 ? clamp(moved / dt / (FULL_PUSH * Math.PI * r * r), 0, 1) : 0;
      const reach = Math.ceil(r) + 1;
      const s: TerraformStep = {
        tiles, moved, emerged, flooded, height: height / n, work,
        x0: Math.min(from.x, from.x + dx) - reach, x1: Math.max(from.x, from.x + dx) + reach,
        y0: Math.min(from.y, y) - reach, y1: Math.max(from.y, y) + reach,
      };
      this.sound.update(s, work);
      this.react(world, s);
      // The stage under the brush centre: the sound marks a crossing, the label pops.
      const stage = terraformStage(world.elevation[idx(x, y)]);
      if (stage !== this.stage) {
        if (this.stage >= 0) this.sound.stage(this.stage, stage);
        this.stage = stage;
        this.popAt = performance.now();
      }
      return s;
    }

    /** Pointer up: the tiles the stroke touched, or null when no stroke was running. */
    end(): Set<number> | null {
      if (!this.last) return null;
      this.last = null;
      this.sound.stop();
      return this.touched;
    }

    /**
     * Every moved tile glints and throws particles in proportion to how far it
     * moved: dust off rising ground, grit off sinking ground, bubbles where
     * water is, and a burst where land breaks the surface or drowns.
     */
    private react(world: WorldState, s: TerraformStep): void {
      const e = world.elevation;
      const now = performance.now();
      const burst = s.tiles.length > 0 ? (s.emerged + s.flooded) * 4 / s.tiles.length : 0;
      for (const i of s.tiles) {
        const d = e[i] - this.seen[i];
        if (d === 0) continue;
        this.seen[i] = e[i];
        const a = Math.abs(d);
        this.glints.set(i, { t: now, a: Math.min(1, a / GLINT_FULL), up: d > 0 });
        const count = Math.floor(a * PARTICLES_PER_UNIT + burst + Math.random());
        for (let k = 0; k < count; k++) {
          const px = (i % GRID_W) * 16 + Math.random() * 16;
          const py = ((i / GRID_W) | 0) * 16 + Math.random() * 16;
          if (e[i] < 0) {
            this.particles.spawn(px, py, (Math.random() - 0.5) * 8, -10 - Math.random() * 10, 0.5 + Math.random() * 0.4, 0, BUBBLE);
          } else if (d > 0) {
            this.particles.spawn(px, py, (Math.random() - 0.5) * 30, -24 - Math.random() * 26, 0.45 + Math.random() * 0.35, 110,
              e[i] > SNOW_LINE ? SNOW : DUST);
          } else {
            this.particles.spawn(px, py, (Math.random() - 0.5) * 12, -8 - Math.random() * 8, 0.3 + Math.random() * 0.25, 70, GRIT);
          }
        }
      }
    }

    /**
     * The brush over the map, identity transform (device pixels): glints on
     * the tiles that just moved, the particles, a ring of art-pixel squares
     * at the radius tinted by the height stage under its centre, a dotted
     * ring where the falloff is half, a plus or minus in the middle, and a
     * label with the stage and the height.
     */
    draw(ctx: CanvasRenderingContext2D, cam: LandCamera, world: WorldState, sign: 1 | -1, now: number): void {
      const dt = this.lastDraw ? Math.min(0.1, (now - this.lastDraw) / 1000) : 0;
      this.lastDraw = now;
      const T = cam.tilePx * cam.dpr;
      const viewW = ctx.canvas.width;
      const nearView = (x: number, reach: number): number => {
        let rx = (((x - cam.scrollX) % GRID_W) + GRID_W) % GRID_W;
        if (rx * T - reach > viewW) rx -= GRID_W;
        return rx * T;
      };
      this.drawGlints(ctx, cam, nearView, now);
      this.particles.update(dt);
      this.particles.draw(ctx, cam, false);
      const p = this.pointer;
      if (!p) {
        this.cursor.shown = false;
        return;
      }
      // The ring follows the pointer, eased a little against uneven pointer events.
      const tx = cam.scrollX + p.x / cam.tilePx;
      const ty = cam.scrollY + p.y / cam.tilePx;
      const c = this.cursor;
      if (!c.shown) {
        c.x = tx;
        c.y = ty;
        c.shown = true;
      }
      const ease = 1 - Math.exp(-dt * 40);
      let ddx = tx - c.x;
      if (ddx > GRID_W / 2) ddx -= GRID_W;
      if (ddx < -GRID_W / 2) ddx += GRID_W;
      c.x = (c.x + ddx * ease + GRID_W) % GRID_W;
      c.y += (ty - c.y) * ease;
      const tileX = wrapX(Math.floor(tx));
      const tileY = clamp(Math.floor(ty), 0, GRID_H - 1);
      const elevation = world.elevation[idx(tileX, tileY)];
      const stage = this.active ? this.stage : terraformStage(elevation);

      const R = this.radius * T;
      const sq = Math.max(2, Math.round(T / 8));
      // The whole ring moves in steps of its own squares, so it never shimmers.
      const gx = Math.round(nearView(c.x, R) / sq) * sq;
      const gy = Math.round(((c.y - cam.scrollY) * T) / sq) * sq;
      const ink = sign > 0 ? RAISE_INK : LOWER_INK;
      const tint = STAGE_INK[stage];

      ctx.fillStyle = sign > 0 ? `rgba(255,233,166,${this.active ? 0.1 : 0.05})` : `rgba(128,200,204,${this.active ? 0.13 : 0.07})`;
      ctx.beginPath();
      ctx.arc(gx, gy, R, 0, Math.PI * 2);
      ctx.fill();

      const outer: number[] = [];
      const inner: number[] = [];
      const ring = (into: number[], radius: number, gap: number): void => {
        const steps = Math.max(12, Math.round((Math.PI * 2 * radius) / (sq * gap)));
        for (let k = 0; k < steps; k++) {
          const a = (k / steps) * Math.PI * 2;
          into.push(gx + Math.round((Math.cos(a) * radius) / sq) * sq, gy + Math.round((Math.sin(a) * radius) / sq) * sq);
        }
      };
      ring(outer, R, 1.5);
      ring(inner, R / 2, 3.5);
      // The sign: a plus to raise, a minus to lower, three squares wide.
      const glyph = [gx - sq, gy, gx, gy, gx + sq, gy];
      if (sign > 0) glyph.push(gx, gy - sq, gx, gy + sq);
      const half = sq / 2;
      ctx.fillStyle = SHADOW_INK;
      for (const list of [outer, inner, glyph]) {
        for (let k = 0; k < list.length; k += 2) ctx.fillRect(list[k] - half - 1, list[k + 1] - half - 1, sq + 2, sq + 2);
      }
      const squares = (list: number[], color: string, alpha: number): void => {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        for (let k = 0; k < list.length; k += 2) ctx.fillRect(list[k] - half, list[k + 1] - half, sq, sq);
      };
      squares(outer, tint, 1);
      squares(inner, ink, 0.6);
      squares(glyph, ink, 1);
      ctx.globalAlpha = 1;
      this.drawLabel(ctx, cam, gx + R * 0.72 + 6 * cam.dpr, gy + R * 0.72, stage, elevation, now);
    }

    /** Tiles that moved in the last GLINT_MS: lighter where they rose, darker where they sank. */
    private drawGlints(ctx: CanvasRenderingContext2D, cam: LandCamera, nearView: (x: number, reach: number) => number, now: number): void {
      if (this.glints.size === 0) return;
      const T = cam.tilePx * cam.dpr;
      const size = Math.ceil(T);
      for (const [i, g] of this.glints) {
        const age = (now - g.t) / GLINT_MS;
        if (age >= 1) { this.glints.delete(i); continue; }
        const a = GLINT_ALPHA * g.a * (1 - age);
        ctx.fillStyle = g.up ? `rgba(255,244,214,${a})` : `rgba(4,18,34,${a})`;
        ctx.fillRect(Math.round(nearView(i % GRID_W, T)), Math.round((((i / GRID_W) | 0) - cam.scrollY) * T), size, size);
      }
    }

    /** "Hügel · 1.240 m" in a dark pixel box beside the ring; it pops when the stage changes under a stroke. */
    private drawLabel(ctx: CanvasRenderingContext2D, cam: LandCamera, x: number, y: number, stage: number, elevation: number,
      now: number): void {
      const meters = Math.round((elevation * ELEVATION_KM * 1000) / 10) * 10;
      const text = `${TERRAFORM_STAGES[stage].name} · ${fmt.int(meters).replace('-', '−')} m`;
      const pop = Math.max(0, 1 - (now - this.popAt) / POP_MS);
      const scale = 1 + 0.3 * pop * pop;
      const px = 13 * cam.dpr;
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.scale(scale, scale);
      ctx.font = `600 ${px}px "Pixelify Sans", "Segoe UI", sans-serif`;
      ctx.textBaseline = 'middle';
      const chip = Math.round(px * 0.6);
      const pad = Math.round(px * 0.45);
      const w = Math.round(ctx.measureText(text).width) + chip + pad * 3;
      const h = Math.round(px * 1.7);
      ctx.fillStyle = 'rgba(8,14,18,0.86)';
      ctx.fillRect(0, -h / 2, w, h);
      ctx.fillStyle = pop > 0 ? `rgba(255,255,255,${0.35 + 0.65 * pop})` : 'rgba(255,255,255,0.18)';
      const b = Math.max(1, Math.round(cam.dpr * (pop > 0 ? 2 : 1)));
      ctx.fillRect(0, -h / 2, w, b);
      ctx.fillRect(0, h / 2 - b, w, b);
      ctx.fillRect(0, -h / 2, b, h);
      ctx.fillRect(w - b, -h / 2, b, h);
      ctx.fillStyle = STAGE_INK[stage];
      ctx.fillRect(pad, -chip / 2, chip, chip);
      ctx.fillStyle = '#f6f1df';
      ctx.fillText(text, pad * 2 + chip, 1);
      ctx.restore();
    }
  }
}
