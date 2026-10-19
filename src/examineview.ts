/* Height and landscape labels shared by the Examine readout and terrain checks. */

namespace SE {
  const DENSITY_NAMES: readonly (readonly string[])[] = [[], [], ['licht', 'dicht'], ['spärlich', 'mittel', 'dicht']];

  /** "Höhe 2.340 m" or "Tiefe 1.200 m": a tile's mean height, to 10 m. */
  export function altitudeLabel(world: WorldState, i: number): string {
    const m = Math.round(elevationMeters(world.elevation[i]) / 10) * 10;
    return m < 0 ? `Tiefe ${fmt.int(-m)} m` : `Höhe ${fmt.int(m)} m`;
  }

  /** The altitude belt of a land tile, by its height and the belts the landscape rules gave it; '' at sea. */
  export function altitudeBelt(world: WorldState, i: number): string {
    const e = world.elevation[i];
    if (e < 0) return '';
    if (e < UPLAND_ELEVATION) return 'Tiefland';
    if (e < ALPINE_MIN_ELEVATION) return 'Bergland';
    const z = world.landscapeZone[i];
    const flag = (bit: number): boolean => z !== ZONE_NONE && (z & bit) !== 0;
    const ls = world.landscape[i];
    if (flag(ZONE_SNOW) || ls === Landscape.Snow || ls === Landscape.Ice) return 'Nival (Schnee und Eis)';
    if (flag(ZONE_ROCKBELT)) return 'Subnival (Fels und Schutt)';
    if (flag(ZONE_TREELINE) || ls === Landscape.Alpine) return 'Alpin (Matten)';
    return 'Montan (Bergwald)';
  }

  /** "Wiese (dicht) auf Erde": a land tile's landscape as the Examine window names it. */
  export function landscapeLabel(world: WorldState, i: number): string {
    if (world.isWater(i)) return BIOME_NAMES[world.biome[i]];
    const ls = world.landscape[i] as Landscape;
    const dens = DENSITY_NAMES[LANDSCAPE_DENSITIES[ls]]?.[world.landscapeDensity[i]];
    const name = LANDSCAPE_NAMES[ls] + (dens ? ` (${dens})` : '');
    // Ice and snow are covers, not grounds: they lie on whatever is beneath.
    return ls === Landscape.Ice || ls === Landscape.Snow ? name : `${name} auf ${SUBSTRATE_NAMES[world.substrate[i]]}`;
  }

  export function landDigest(world: WorldState, x: number, y: number): string {
    const land = PixelTerrain.shared();
    if (TERRAIN_STYLE !== 'pixel' || !land.ready) return '';
    land.ensure(world);
    return String(land.field.signature(x, y, 1, 1, 0));
  }

  /** Does the map draw a savanna tree on tile i? Part of the tile's signature, so landDigest follows it. */
  export function landShowsSavannaTree(world: WorldState, i: number): boolean {
    const land = PixelTerrain.shared();
    if (TERRAIN_STYLE !== 'pixel' || !land.ready) return false;
    land.ensure(world);
    return land.field.savannaTree[i] === 1;
  }
}
