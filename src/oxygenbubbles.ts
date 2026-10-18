/* =============================================================================
 * SimEarth 2.0 — oxygen pearling off the coasts before the Great Oxidation
 * -----------------------------------------------------------------------------
 * From the moment the sea's iron is used up (the chronicle's "Eisen im Meer
 * aufgebraucht") until the air turns oxic (the Great Oxidation Event), the
 * cyanobacteria's oxygen stays in the water and leaves it across the surface
 * (oceanchem.ts). On the map it pearls up all along the coasts: a spot in the
 * sea next to land sends up a string of bubbles for a few seconds, then goes
 * quiet, and another starts elsewhere; more as the sea fills with oxygen. A
 * bubble rises like the terraform brush's, swells from one art pixel to a
 * 3×3 ring lit from the upper left and pops in three specks. None with
 * "Effekte reduzieren". Visual only: the simulation never reads this.
 * ========================================================================== */

namespace SE {
  /** New pearling spots per second and coastal sea tile in view, at full strength (about one spot per 6 tiles). */
  const SPOT_RATE = 0.055;
  /** A spot pearls for 2–4 s, a bubble every BEAT s on average; at most SPOTS_MAX at once. */
  const SPOT_LIFE_MIN = 2;
  const SPOT_LIFE_MAX = 4;
  const BEAT = 0.3;
  const SPOTS_MAX = 120;
  /** A bubble's life in s and how far it rises, art px; shares of its life at which it grows and pops. */
  const BUBBLE_LIFE = 1.1;
  const RISE = 9;
  const PEARL_AT = 0.2;
  const RING_AT = 0.45;
  const POP_AT = 0.85;
  /** Spots pearling in view from which the bubbling sounds at full level: few, since a zoomed-in view holds only a stretch of coast. */
  const FULL_SOUND_SPOTS = 3;
  /** Strength once the iron is gone; full when the sea counts as oxygenated (OCEAN_O2_RISEN). */
  const FAINT = 0.6;
  const WHITE = fxColor('white', 0);
  const LIT = fxColor('ice', 4);
  const SHADE = fxColor('ice', 3);

  /** How strongly the sea gives off oxygen: 0 before its iron runs out and from the Great Oxidation Event on. */
  export function oxygenPearling(world: WorldState): number {
    if (world.oceanIron >= IRON_DEPLETED || world.o2 >= AIR_O2_RISEN) return 0;
    return FAINT + (1 - FAINT) * clamp(world.oceanO2 / OCEAN_O2_RISEN, 0, 1);
  }

  /** Sea with land on one of its eight neighbours. */
  function coastalSea(world: WorldState, x: number, y: number): boolean {
    if (!world.isWater(idx(wrapX(x), y))) return false;
    for (let dy = -1; dy <= 1; dy++) {
      if (y + dy < 0 || y + dy >= GRID_H) continue;
      for (let dx = -1; dx <= 1; dx++) if (!world.isWater(idx(wrapX(x + dx), y + dy))) return true;
    }
    return false;
  }

  interface Spot {
    /** World art px. */
    x: number;
    y: number;
    /** Clock (s) it goes quiet, when its next bubble rises, and its bubbles' birth times. */
    until: number;
    next: number;
    born: number[];
  }

  export class OxygenBubbles {
    /** "Effekte reduzieren": no bubbles. */
    still = false;
    private readonly reducedMotion = typeof window !== 'undefined' && !!window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    private spots: Spot[] = [];
    private lastDraw = 0;
    /** Spots pearling in view at the last draw. */
    private inView = 0;

    /** How much bubbling is in view, 0..1, for its sound (before the zoom). */
    presence(): number {
      return Math.min(1, this.inView / FULL_SOUND_SPOTS);
    }

    /** `cols` × `rows` tiles in view; ctx at identity (device pixels). */
    draw(ctx: CanvasRenderingContext2D, cam: LandCamera, cols: number, rows: number, world: WorldState, now: number): void {
      const clock = now / 1000;
      const dt = this.lastDraw ? Math.min(0.1, clock - this.lastDraw) : 0;
      this.lastDraw = clock;
      const strength = this.still || this.reducedMotion ? 0 : oxygenPearling(world);
      // Random tiles in view; a spot starts where one is coastal sea.
      for (let n = cols * rows * SPOT_RATE * strength * dt; n > 0 && this.spots.length < SPOTS_MAX; n--) {
        if (n < 1 && Math.random() >= n) break;
        const x = Math.floor(cam.scrollX + Math.random() * cols);
        const y = Math.floor(cam.scrollY + Math.random() * rows);
        if (y < 0 || y >= GRID_H || !coastalSea(world, x, y)) continue;
        this.spots.push({
          x: x * 16 + 2 + Math.floor(Math.random() * 11), y: y * 16 + 7 + Math.floor(Math.random() * 7),
          until: clock + SPOT_LIFE_MIN + Math.random() * (SPOT_LIFE_MAX - SPOT_LIFE_MIN), next: clock, born: [],
        });
      }
      // A spot that went quiet lets its last bubbles rise and pop before it goes.
      this.spots = this.spots.filter((s) => s.until > clock - BUBBLE_LIFE && (strength > 0 || s.born.length > 0));

      const px = (cam.tilePx * cam.dpr) / 16;
      const span = GRID_W * 16;
      const viewW = ctx.canvas.width;
      const dot = (color: string, x: number, y: number): void => {
        // The map wraps in x: the copy that lands in or just left of the view.
        let ax = ((x - cam.scrollX * 16) % span + span) % span;
        if (ax * px > viewW) ax -= span;
        const ay = y - cam.scrollY * 16;
        const x0 = Math.round(ax * px);
        const y0 = Math.round(ay * px);
        ctx.fillStyle = color;
        ctx.fillRect(x0, y0, Math.max(1, Math.round((ax + 1) * px) - x0), Math.max(1, Math.round((ay + 1) * px) - y0));
      };
      this.inView = 0;
      for (const s of this.spots) {
        let sx = ((s.x - cam.scrollX * 16) % span + span) % span;
        if (sx * px > viewW) sx -= span;
        const sy = (s.y - cam.scrollY * 16) * px;
        if (s.until > clock && sx >= 0 && sx * px <= viewW && sy >= 0 && sy <= ctx.canvas.height) this.inView++;
        // After a hidden tab the clock jumps: no backlog of bubbles.
        s.next = Math.max(s.next, clock - BEAT);
        for (; s.next <= clock && s.next < s.until && strength > 0; s.next += BEAT * (0.5 + Math.random())) s.born.push(s.next);
        s.born = s.born.filter((b) => clock - b < BUBBLE_LIFE);
        for (const b of s.born) {
          const u = (clock - b) / BUBBLE_LIFE;
          const x = s.x + Math.round(Math.sin(b * 37 + u * 9) * 0.7);
          const y = s.y - Math.floor(u * RISE);
          if (u >= POP_AT) {
            dot(LIT, x - 2, y);
            dot(LIT, x + 2, y);
            dot(WHITE, x, y - 2);
          } else if (u >= RING_AT) {
            dot(WHITE, x, y - 1);
            dot(WHITE, x - 1, y);
            dot(LIT, x + 1, y);
            dot(SHADE, x, y + 1);
          } else if (u >= PEARL_AT) {
            dot(WHITE, x, y);
            dot(LIT, x + 1, y);
            dot(SHADE, x, y + 1);
            dot(SHADE, x + 1, y + 1);
          } else {
            dot(SHADE, x, y);
          }
        }
      }
    }
  }
}
