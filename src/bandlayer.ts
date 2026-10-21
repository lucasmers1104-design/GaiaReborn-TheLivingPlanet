/* =============================================================================
 * SimEarth 2.0 — wandering groups on the map
 * -----------------------------------------------------------------------------
 * Draws the bands of `world.civ.bands` that are on the move, every frame,
 * gliding from tile to tile like the settlers (civfigures.ts): humans as a
 * pair of Stone Age people, other thinking classes as their own
 * creature with a torch (civart/bands.ts). A camped band shows as its camp
 * (CityLayer.drawCamps) and no figure, so the shelters and the fire stay
 * readable. The hover text names either. Graphics only.
 * ========================================================================== */

namespace SE {
  /** „Wandergruppe der Hominiden · Lager“ for a band on tile `i`, or null if none is there. */
  export function bandLabel(world: WorldState, i: number): string | null {
    const c = world.sentientClass;
    if (c === Life.None) return null;
    const b = world.civ.bands.find((x) => x.path[x.step] === i);
    if (!b) return null;
    // ponytail: local name (humans by their last sub-species, others by their class); use the simulation's species name once it has one.
    const who = c === Life.Mammal ? subspeciesName(c, SUBSPECIES_PER_CLASS - 1) : LIFE[c].name;
    return `Wandergruppe der ${who} · ${campShelters(b, world.ticks) > 0 ? 'Lager' : 'unterwegs'}`;
  }

  export class BandLayer {
    private readonly glide = new FigureGlide();
    private readonly pictures = new Map<string, HTMLCanvasElement>();
    private picturePx = 0;

    draw(ctx: CanvasRenderingContext2D, view: AmbientView, world: WorldState, now: number, dpr: number): void {
      const bands = world.civ.bands;
      if (bands.length === 0) return;
      this.glide.begin(world.ticks, now);
      const size = view.tilePx;
      const big = size * SHADOW_SPAN;
      const px = Math.max(8, Math.round(size * dpr));
      if (px !== this.picturePx) {
        this.pictures.clear();
        this.picturePx = px;
      }
      const c = world.sentientClass;
      const stage = c === Life.Mammal ? 0 : thinkerStage(world, c);
      ctx.imageSmoothingEnabled = false;
      for (const b of bands) {
        if (b.path.length === 0 || campShelters(b, world.ticks) > 0) continue;
        const step = clamp(b.step, 0, b.path.length - 1);
        const spot = this.glide.place(b.id, b.path[step], step > 0 ? b.path[step - 1] : b.path[step], now, view);
        if (spot.rx >= view.cols || spot.ry <= -SHADOW_SPAN || spot.ry >= view.rows) continue;
        const key = `${c}|${stage}|${+spot.flip}`;
        let pic = this.pictures.get(key);
        if (!pic) {
          pic = rasterArt(bandArt(c, stage), px, CREATURE_LOOK, spot.flip, true);
          this.pictures.set(key, pic);
        }
        const sy = Math.round(spot.ry * size);
        for (let x = spot.rx; x < view.cols; x += GRID_W) ctx.drawImage(pic, Math.round(x * size), sy, big, big);
      }
      this.glide.end();
    }
  }
}
