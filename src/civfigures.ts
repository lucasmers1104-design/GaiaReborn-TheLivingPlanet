/* =============================================================================
 * SimEarth 2.0 — settler groups on the map
 * -----------------------------------------------------------------------------
 * Draws `world.civ.settlers` every frame (spec §3.6): a group stands on
 * `path[step]` and glides there from the tile it stood on before, over the
 * time between two ticks (at most 800 ms), facing the way it goes, like the
 * herds (herds.ts). Its figure shows the era it carries, on land and on
 * water (raft to freighter). People other than humans walk as their own
 * creature with a bundle and the pennant on a pole (civart/bands.ts); the
 * wandering groups glide the same way (bandlayer.ts). Between two cities at war stands the battle
 * symbol (spec §3.7). Graphics only.
 * ========================================================================== */

namespace SE {
  const GLIDE_MAX_MS = 800;
  /** Weight of the newest tick interval in the running estimate of the tick rate. */
  const INTERVAL_WEIGHT = 0.3;

  export type SettlerKind = 'land' | 'water' | 'bundle';

  /** Figures by Tech (index 0 unused): on land, on water. */
  const LAND_FIGURES: readonly ((flag: PaletteKey) => Art)[] = [
    stoneSettlerArt, stoneSettlerArt, bronzeSettlerArt, ironSettlerArt, industrialSettlerArt,
    truckSettlerArt, truckSettlerArt, gliderSettlerArt,
  ];
  const WATER_FIGURES: readonly ((flag: PaletteKey) => Art)[] = [
    raftArt, raftArt, dugoutArt, sailingShipArt, steamshipArt, freighterArt, freighterArt, freighterArt,
  ];

  interface Track { tile: number; from: number; since: number; flip: boolean; seen: number }

  function reducedMotion(): boolean {
    return typeof window !== 'undefined' && !!window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * The figure of a group of era `tech`, on land or on water. Non-human
   * peoples walk on land as `creature` (their class's figure) with a bundle
   * and the pennant on a pole, or as a plain bundle without one.
   */
  export function settlerArt(kind: SettlerKind, flag: PaletteKey, tech: Tech = Tech.Stone, creature?: Art): Art {
    const t = clamp(tech, Tech.Stone, Tech.Nanotech);
    if (kind === 'water') return WATER_FIGURES[t](flag);
    if (kind === 'bundle') return creature ? thinkerArt(creature, flag) : bundleSettlerArt(flag);
    return LAND_FIGURES[t](flag);
  }

  /** The sub-species a thinking class walks as: its most advanced one alive on the planet, else its last. */
  export function thinkerStage(world: WorldState, c: Life): number {
    for (let s = SUBSPECIES_PER_CLASS - 1; s >= 0; s--) if (world.lifeStageCounts[c * SUBSPECIES_PER_CLASS + s] > 0) return s;
    return SUBSPECIES_PER_CLASS - 1;
  }

  /** A figure's place this frame in view tiles (rx on the copy of the planet nearest the view's left edge). */
  export interface FigureSpot { readonly rx: number; readonly ry: number; readonly rest: number; readonly from: number; readonly flip: boolean }

  /**
   * Figures that walk tile by tile: each glides to the tile it stands on from
   * the one before, over the time between two ticks (at most GLIDE_MAX_MS),
   * facing the way it goes, like the herds (herds.ts). Without motion
   * (prefers-reduced-motion) they step.
   */
  export class FigureGlide {
    private readonly tracks = new Map<number, Track>();
    private tick = -1;
    private tickAt = 0;
    private interval = GLIDE_MAX_MS;
    private glide = GLIDE_MAX_MS;
    /** Counts the frames. */
    frame = 0;

    constructor(readonly still = reducedMotion()) {}

    /** Start a frame of the world at tick `ticks`. */
    begin(ticks: number, now: number): void {
      if (ticks !== this.tick) {
        if (this.tick >= 0 && ticks === this.tick + 1) {
          this.interval += (Math.min(GLIDE_MAX_MS * 4, now - this.tickAt) - this.interval) * INTERVAL_WEIGHT;
        }
        this.tick = ticks;
        this.tickAt = now;
      }
      this.glide = Math.min(GLIDE_MAX_MS, this.interval);
      this.frame++;
    }

    /** Where figure `id` stands this frame: on `tile`, coming from `before` when first seen. */
    place(id: number, tile: number, before: number, now: number, view: AmbientView): FigureSpot {
      let tr = this.tracks.get(id);
      if (!tr) {
        tr = { tile, from: before, since: now, flip: false, seen: this.frame };
        this.tracks.set(id, tr);
      } else if (tr.tile !== tile) {
        tr.from = tr.tile;
        tr.tile = tile;
        tr.since = now;
      }
      tr.seen = this.frame;
      let dx = (tile % GRID_W) - (tr.from % GRID_W);
      if (dx > GRID_W / 2) dx -= GRID_W;
      if (dx < -GRID_W / 2) dx += GRID_W;
      if (dx !== 0) tr.flip = dx < 0;
      const dy = ((tile / GRID_W) | 0) - ((tr.from / GRID_W) | 0);
      const rest = this.still ? 0 : 1 - smoothstep(clamp((now - tr.since) / this.glide, 0, 1));
      let rx = (tile % GRID_W) - dx * rest - view.scrollX;
      rx -= Math.floor(rx / GRID_W) * GRID_W;
      if (rx > GRID_W - SHADOW_SPAN) rx -= GRID_W;
      const ry = ((tile / GRID_W) | 0) - dy * rest - view.scrollY;
      return { rx, ry, rest, from: tr.from, flip: tr.flip };
    }

    /** End the frame: forget the figures it did not place. */
    end(): void {
      for (const [id, tr] of this.tracks) if (tr.seen !== this.frame) this.tracks.delete(id);
    }
  }

  /** A conflict can be over within a second at full speed; its symbol stays at least this long. */
  const BATTLE_MIN_MS = 3000;
  /** Size of the battle symbol in tiles, its bob in tiles and the bob's pace. */
  const BATTLE_TILES = 1.5;
  const BATTLE_BOB = 0.06;
  const BATTLE_BOB_MS = 120;

  /** The point in tiles halfway between two tiles, the short way round the planet. */
  export function battleSpot(a: number, b: number): { x: number; y: number } {
    const ax = a % GRID_W;
    let dx = (b % GRID_W) - ax;
    if (dx > GRID_W / 2) dx -= GRID_W;
    if (dx < -GRID_W / 2) dx += GRID_W;
    const x = ax + dx / 2;
    return { x: x - Math.floor(x / GRID_W) * GRID_W, y: (Math.floor(a / GRID_W) + Math.floor(b / GRID_W)) / 2 };
  }

  interface Battle { x: number; y: number; tech: Tech; since: number; seen: number }

  /** The battle symbol halfway between the two cities of each conflict, for as long as it lasts but BATTLE_MIN_MS at least. */
  class BattleMarks {
    private readonly battles = new Map<string, Battle>();
    private readonly pictures = new Map<number, HTMLCanvasElement>();
    private picturePx = 0;

    draw(ctx: CanvasRenderingContext2D, view: AmbientView, world: WorldState, now: number, dpr: number, frame: number, still: boolean): void {
      const civ = world.civ;
      for (const k of civ.conflicts) {
        // Fought at sea, it shows as the fleets' battle of pixel ships instead (shiplayer.ts).
        if (seaBattleShown(k, view.tilePx)) continue;
        const key = `${k.a}:${k.b}:${k.started}`;
        let bt = this.battles.get(key);
        const a = civ.city(k.a);
        const b = civ.city(k.b);
        if (a && b) {
          const spot = battleSpot(a.tile, b.tile);
          const tech = Math.max(world.tech[a.tile], world.tech[b.tile]) as Tech;
          if (bt) Object.assign(bt, spot, { tech });
          else this.battles.set(key, bt = { ...spot, tech, since: now, seen: frame });
        }
        if (bt) bt.seen = frame;
      }
      if (this.battles.size === 0) return;
      const tile = view.tilePx;
      const span = BATTLE_TILES * SHADOW_SPAN;
      const px = Math.max(8, Math.round(tile * BATTLE_TILES * dpr));
      if (px !== this.picturePx) {
        this.pictures.clear();
        this.picturePx = px;
      }
      for (const [key, bt] of this.battles) {
        if (bt.seen !== frame && now - bt.since >= BATTLE_MIN_MS) {
          this.battles.delete(key);
          continue;
        }
        const smoke = +(bt.tech >= Tech.Industrial);
        let pic = this.pictures.get(smoke);
        if (!pic) {
          pic = rasterArt(battleArt(bt.tech), px, CREATURE_LOOK, false, true);
          this.pictures.set(smoke, pic);
        }
        const bob = still ? 0 : Math.sin((now - bt.since) / BATTLE_BOB_MS) * BATTLE_BOB;
        let rx = bt.x + 0.5 - BATTLE_TILES / 2 - view.scrollX;
        rx -= Math.floor(rx / GRID_W) * GRID_W;
        if (rx > GRID_W - span) rx -= GRID_W;
        const ry = bt.y + 0.5 - BATTLE_TILES / 2 - view.scrollY + bob;
        if (rx >= view.cols || ry <= -span || ry >= view.rows) continue;
        const sy = Math.round(ry * tile);
        for (let x = rx; x < view.cols; x += GRID_W) ctx.drawImage(pic, Math.round(x * tile), sy, span * tile, span * tile);
      }
    }
  }

  export class SettlerLayer {
    /** "Effekte reduzieren": the pixel boats ride still, on frame 0 without a wake. */
    still = false;
    private readonly battles = new BattleMarks();
    private readonly glide = new FigureGlide();
    private readonly pictures = new Map<string, HTMLCanvasElement>();
    private picturePx = 0;

    /** `cities` supplies the civ atlas for the pixel boats' pennants. */
    draw(ctx: CanvasRenderingContext2D, view: AmbientView, world: WorldState, now: number, dpr: number, cities: CityLayer | null = null): void {
      this.glide.begin(world.ticks, now);
      const size = view.tilePx;
      const big = size * SHADOW_SPAN;
      const px = Math.max(8, Math.round(size * dpr));
      if (px !== this.picturePx) {
        this.pictures.clear();
        this.picturePx = px;
      }
      const c = world.sentientClass;
      const human = c === Life.Mammal;
      const stage = human ? 0 : thinkerStage(world, c);
      ctx.imageSmoothingEnabled = false;
      for (const s of world.civ.settlers) {
        if (s.path.length === 0) continue;
        const tile = s.path[clamp(s.step, 0, s.path.length - 1)];
        const spot = this.glide.place(s.id, tile, s.step > 0 ? s.path[s.step - 1] : tile, now, view);
        const { rx, ry } = spot;
        if (rx >= view.cols || ry <= -SHADOW_SPAN || ry >= view.rows) continue;
        const kind: SettlerKind = world.isWater(spot.rest > 0.5 ? spot.from : tile) ? 'water' : human ? 'land' : 'bundle';
        const boat = kind === 'water' ? settlerBoatSprite(s.tech, !!s.voyage, size) : null;
        if (boat) {
          // On the water from SHIP_MIN_TILE on: the pixel ship of its era (shiplayer.ts), in device pixels.
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          const cam: LandCamera = { scrollX: view.scrollX, scrollY: view.scrollY, tilePx: size, dpr };
          drawSettlerBoat(ctx, cam, cities, boat, !!s.voyage, (view.scrollX + rx + 0.5) * 16, (view.scrollY + ry + 0.5) * 16,
            spot.flip, spot.rest > 0, world.civ.tribe(s.tribe)?.color ?? -1, s.id, now, this.still || this.glide.still);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.imageSmoothingEnabled = false;
          continue;
        }
        const flag = tribeArtColor(world.civ.tribe(s.tribe)?.color ?? -1);
        const key = `${kind}|${s.tech}|${flag}|${+spot.flip}|${c}|${stage}`;
        let pic = this.pictures.get(key);
        if (!pic) {
          pic = rasterArt(settlerArt(kind, flag, s.tech, SPECIES[c]?.stages[stage]?.art), px, CREATURE_LOOK, spot.flip, true);
          this.pictures.set(key, pic);
        }
        const sy = Math.round(ry * size);
        for (let x = rx; x < view.cols; x += GRID_W) ctx.drawImage(pic, Math.round(x * size), sy, big, big);
      }
      this.glide.end();
      this.battles.draw(ctx, view, world, now, dpr, this.glide.frame, this.glide.still);
    }
  }
}
