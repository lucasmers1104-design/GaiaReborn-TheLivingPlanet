/* =============================================================================
 * SimEarth 2.0 — today's Earth
 * -----------------------------------------------------------------------------
 * The real continents from EARTH_MAP (tools/earth-map.js), turned into the
 * game's elevation scale, with mountain belts read from the relief and the
 * mantle field drawn along the real volcanic belts: the Pacific Ring of Fire,
 * the hotspots, the East African Rift and, weaker, the mid-ocean ridges.
 * ========================================================================== */

namespace SE {
  /**
   * Sea depth (m) at COAST_DEPTH, the edge of the sunlit sea that marine algae
   * need. Far below the true shelf break (~200 m), measured with the greedy
   * probe over two seeds: at 1000 m only 14 % of the sea is coast (a random
   * planet has 48 %), oxygen rises half as fast and the tree stalls at 24 of
   * 31 steps; at 2500 m it stalls too. At 3500 m 41 % is coast — the
   * continental margins and the shallower mid-ocean ridges — and all 31 steps
   * arrive on a random planet's timeline.
   */
  const SHELF_DEPTH = 3500;
  /** Sea depth (m) at elevation -1. */
  const ABYSS_DEPTH = 6000;
  /**
   * Relief (spread of heights within a tile, m) where a mountain belt starts
   * and where it is fully active. Ice sheets and old worn-down ranges stay
   * below it; the Himalaya, Andes, Alps and Rockies lie above.
   */
  const BELT_RELIEF_MIN = 250;
  const BELT_RELIEF_FULL = 900;
  /** Tiles around a tile whose land sets the base a range stands out from. */
  const BELT_BASE_RADIUS = 6;
  /** Height over that base (elevation scale) a fully active belt holds against erosion, as a random planet's do. */
  const BELT_HEIGHT = 0.75;
  /** Width (tiles) of a volcanic belt in the mantle field. */
  const VOLCANIC_SPREAD = 1.4;
  /** Mantle heat away from the belts: low, so eruptions keep to the belts. */
  const MANTLE_FLOOR = 0.1;
  const MANTLE_NOISE = 0.2;

  type LatLon = readonly [number, number];
  interface VolcanicBelt {
    readonly name: string;
    /** Mantle heat on the belt, 0..1. */
    readonly heat: number;
    /** A polyline, or a single point for a hotspot. */
    readonly path: readonly LatLon[];
  }

  /** Approximate, to the tile (≈ 1.4°): positions of the named volcanoes, rifts and ridge axes. */
  const VOLCANIC_BELTS: readonly VolcanicBelt[] = [
    // Subduction arcs: the Ring of Fire and the smaller arcs.
    { name: 'Andes, northern zone', heat: 1, path: [[4.9, -75.3], [1.2, -77.4], [-0.7, -78.4], [-2.0, -78.3]] },
    { name: 'Andes, central zone', heat: 1, path: [[-14.5, -73.0], [-16.3, -71.4], [-19.0, -68.8], [-23.4, -67.7], [-27.1, -68.5]] },
    { name: 'Andes, southern zone', heat: 1, path: [[-33.4, -69.8], [-36.5, -70.6], [-39.4, -71.9], [-42.8, -72.6], [-45.9, -72.9], [-49.0, -73.5]] },
    { name: 'Mexico and Central America', heat: 1, path: [[19.5, -103.6], [19.0, -98.6], [19.0, -97.3], [17.4, -93.2], [15.1, -92.1], [14.5, -90.9], [13.7, -89.6], [12.0, -86.2], [10.5, -84.7], [8.8, -82.5]] },
    { name: 'Lesser Antilles', heat: 0.9, path: [[17.6, -63.2], [16.7, -62.2], [14.8, -61.2], [13.3, -61.2], [12.2, -61.6]] },
    { name: 'Cascades', heat: 1, path: [[40.5, -121.5], [41.4, -122.2], [42.9, -122.1], [45.4, -121.7], [46.9, -121.8], [48.8, -121.8], [49.9, -123.0]] },
    { name: 'Alaska and Aleutians', heat: 1, path: [[62.0, -144.0], [60.5, -152.7], [58.3, -155.0], [56.0, -159.0], [54.8, -164.0], [53.4, -168.0], [52.0, -174.0], [51.9, -177.0], [52.0, 177.6]] },
    { name: 'Kamchatka and Kurils', heat: 1, path: [[56.1, 160.6], [53.3, 158.8], [50.3, 155.5], [47.0, 152.0], [44.0, 145.5]] },
    { name: 'Japan', heat: 1, path: [[43.5, 144.0], [42.5, 141.0], [39.0, 140.8], [36.5, 138.5], [35.4, 138.7], [32.9, 131.1], [31.6, 130.7], [29.6, 129.7], [27.9, 128.2]] },
    { name: 'Izu, Bonin and Mariana', heat: 1, path: [[34.1, 139.5], [30.5, 140.3], [27.2, 140.9], [24.8, 141.3], [20.5, 144.9], [18.1, 145.8], [15.6, 145.6]] },
    { name: 'Philippines', heat: 1, path: [[19.5, 121.9], [15.1, 120.4], [14.0, 121.0], [13.3, 123.7], [10.4, 123.1], [7.0, 125.3]] },
    { name: 'Sunda and Banda arcs', heat: 1, path: [[5.4, 95.7], [2.6, 98.8], [-1.7, 101.3], [-6.1, 105.4], [-7.5, 110.4], [-7.9, 112.9], [-8.3, 115.5], [-8.3, 118.0], [-8.5, 121.0], [-8.3, 124.5], [-7.2, 128.7], [-4.5, 129.9]] },
    { name: 'Sangihe', heat: 0.9, path: [[1.4, 124.8], [3.7, 125.5]] },
    { name: 'Halmahera', heat: 0.9, path: [[0.8, 127.3], [1.7, 127.9]] },
    { name: 'New Guinea and New Britain', heat: 1, path: [[-4.1, 145.0], [-5.1, 151.3], [-4.3, 152.2]] },
    { name: 'Solomons and Vanuatu', heat: 1, path: [[-6.1, 155.2], [-9.1, 159.8], [-10.4, 165.8], [-14.3, 167.5], [-16.3, 168.1], [-19.5, 169.4], [-22.3, 171.3]] },
    { name: 'Tonga, Kermadec and New Zealand', heat: 1, path: [[-15.6, -175.6], [-20.5, -175.4], [-25.0, -177.0], [-29.3, -177.9], [-34.0, -179.0], [-37.5, 177.2], [-38.8, 176.0], [-39.3, 175.6]] },
    { name: 'South Sandwich', heat: 0.8, path: [[-56.3, -27.6], [-59.0, -26.5]] },
    { name: 'Italy', heat: 0.8, path: [[40.8, 14.4], [38.8, 15.2], [37.8, 15.0]] },
    { name: 'Aegean', heat: 0.7, path: [[36.4, 25.4]] },
    { name: 'Anatolia and Iran', heat: 0.6, path: [[39.7, 44.3], [35.9, 52.1]] },
    // Rifts and hotspots.
    { name: 'East African Rift', heat: 1, path: [[13.6, 40.7], [11.5, 41.5], [8.5, 39.5], [4.0, 36.5], [2.3, 36.6], [-0.9, 36.4], [-2.8, 35.9], [-3.1, 37.4]] },
    { name: 'Virunga', heat: 0.9, path: [[-1.5, 29.3]] },
    { name: 'Mount Cameroon', heat: 0.8, path: [[4.2, 9.2]] },
    { name: 'Hawaii', heat: 1, path: [[19.4, -155.3]] },
    { name: 'Iceland', heat: 1, path: [[63.6, -19.0], [64.6, -17.5], [65.7, -16.8]] },
    { name: 'Yellowstone', heat: 0.9, path: [[44.4, -110.7]] },
    { name: 'Galápagos', heat: 1, path: [[-0.4, -91.5]] },
    { name: 'Réunion', heat: 0.9, path: [[-21.2, 55.7]] },
    { name: 'Canary Islands', heat: 0.8, path: [[28.3, -16.6]] },
    { name: 'Azores', heat: 0.8, path: [[38.7, -28.0]] },
    { name: 'Erebus', heat: 0.8, path: [[-77.5, 167.2]] },
    // Mid-ocean ridges: most of the planet's volcanism, but under the sea.
    { name: 'Mid-Atlantic Ridge', heat: 0.55, path: [[71.0, -8.0], [66.5, -18.0], [62.0, -24.5], [56.0, -34.0], [52.0, -31.0], [45.0, -28.0], [38.0, -30.5], [30.0, -42.0], [22.0, -45.0], [15.0, -46.0], [8.0, -38.0], [0.5, -20.0], [-5.0, -12.0], [-15.0, -13.5], [-25.0, -13.5], [-35.0, -15.0], [-45.0, -14.0], [-50.0, -8.0], [-54.4, 3.4]] },
    { name: 'East Pacific Rise and Pacific-Antarctic Ridge', heat: 0.55, path: [[23.0, -108.5], [15.0, -104.5], [8.0, -103.5], [0.0, -102.5], [-10.0, -110.0], [-20.0, -113.0], [-30.0, -112.0], [-40.0, -111.0], [-50.0, -114.0], [-55.0, -125.0], [-60.0, -150.0], [-63.0, -170.0], [-61.5, 161.0]] },
    { name: 'Red Sea and Gulf of Aden', heat: 0.55, path: [[27.5, 34.5], [21.0, 38.0], [15.5, 41.5], [12.5, 43.5], [12.0, 45.0], [13.5, 51.0], [12.0, 57.0]] },
    { name: 'Central Indian Ridge', heat: 0.55, path: [[12.0, 57.0], [10.0, 57.5], [5.0, 61.5], [0.0, 66.5], [-10.0, 66.5], [-20.0, 68.0], [-25.5, 70.0]] },
    { name: 'Southwest Indian Ridge', heat: 0.55, path: [[-25.5, 70.0], [-32.0, 58.0], [-38.0, 47.0], [-44.0, 37.0], [-50.0, 20.0], [-54.4, 3.4]] },
    { name: 'Southeast Indian Ridge', heat: 0.55, path: [[-25.5, 70.0], [-38.0, 77.5], [-42.0, 85.0], [-48.0, 100.0], [-50.0, 115.0], [-50.0, 125.0], [-55.0, 140.0], [-61.5, 161.0]] },
  ];

  /** The summit craters of the most active volcanoes (Smithsonian GVP), each typed UpliftKind.ActiveVolcano. */
  export const ACTIVE_VOLCANOES: readonly { readonly name: string; readonly at: LatLon }[] = [
    { name: 'Kīlauea', at: [19.421, -155.287] },
    { name: 'Ätna', at: [37.748, 14.999] },
  ];

  /** Tile of a position: the one whose cell holds it, as tools/earth-map.js bins its samples. */
  export function latLonTile([lat, lon]: LatLon): number {
    return idx(wrapX(Math.floor(((lon + 180) / 360) * GRID_W)), clamp(Math.floor(((90 - lat) / 180) * GRID_H), 0, GRID_H - 1));
  }

  /**
   * After the belts are typed, before their uplift is balanced: the active
   * volcanoes, where they stand on land. Each gets a trace of uplift, so it is
   * balanced like a belt and builds up as fast as it wears down.
   */
  export function markActiveVolcanoes(world: WorldState): void {
    for (const v of ACTIVE_VOLCANOES) {
      const i = latLonTile(v.at);
      if (world.elevation[i] <= 0) continue;
      world.upliftKind[i] = UpliftKind.ActiveVolcano;
      world.uplift[i] = Math.max(world.uplift[i], UPLIFT_TRACE);
    }
  }

  /** Decode EARTH_MAP into elevation, mountain belts and the volcanic mantle field. */
  export function shapeEarthToday(seed: number, elevation: Float32Array, uplift: Float32Array, magma: Float32Array): void {
    const map = EARTH_MAP;
    if (map.width !== GRID_W || map.height !== GRID_H) {
      throw new Error(`EARTH_MAP is ${map.width}×${map.height}, the grid ${GRID_W}×${GRID_H}: rerun tools/earth-map.js`);
    }
    const heights = decodeBase64(map.heights);
    const relief = decodeBase64(map.relief);
    for (let i = 0; i < TILE_COUNT; i++) {
      const b = heights[i];
      elevation[i] = b < 128
        ? Math.min(1, (map.maxHeight * (b / 127) ** 2) / (ELEVATION_KM * 1000))
        : seaElevation(map.maxDepth * ((256 - b) / 128) ** 2);
    }
    mountainBelts(elevation, relief, map.reliefStep, uplift);
    volcanicMantle(seed, magma);
  }

  function seaElevation(depth: number): number {
    if (depth <= SHELF_DEPTH) return Math.min(-1e-3, COAST_DEPTH * (depth / SHELF_DEPTH));
    return COAST_DEPTH + (-1 - COAST_DEPTH) * Math.min(1, (depth - SHELF_DEPTH) / (ABYSS_DEPTH - SHELF_DEPTH));
  }

  function decodeBase64(text: string): Uint8Array {
    const bin = atob(text);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /**
   * A belt is a rugged tile standing above the land around it, scaled so it
   * holds about its present height against erosion, the way the generated
   * belts of a random planet do.
   */
  function mountainBelts(elevation: Float32Array, relief: Uint8Array, reliefStep: number, uplift: Float32Array): void {
    uplift.fill(0);
    const r = BELT_BASE_RADIUS;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const i = idx(x, y);
        const rugged = (relief[i] * reliefStep - BELT_RELIEF_MIN) / (BELT_RELIEF_FULL - BELT_RELIEF_MIN);
        if (elevation[i] <= 0 || rugged <= 0) continue;
        let sum = 0;
        let n = 0;
        for (let dy = -r; dy <= r; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= GRID_H) continue;
          for (let dx = -r; dx <= r; dx++) {
            const e = elevation[idx(wrapX(x + dx), yy)];
            if (e > 0) { sum += e; n++; }
          }
        }
        const rise = elevation[i] - sum / n;
        uplift[i] = clamp(Math.min(1, rugged) * rise / BELT_HEIGHT, 0, 1);
      }
    }
  }

  function volcanicMantle(seed: number, magma: Float32Array): void {
    TerrainGenerator.mantle(seed, magma);
    for (let i = 0; i < TILE_COUNT; i++) magma[i] = MANTLE_FLOOR + MANTLE_NOISE * magma[i];
    const reach = Math.ceil(VOLCANIC_SPREAD * 2.5);
    for (const belt of VOLCANIC_BELTS) {
      // Tile coordinates, unwrapped so a belt across the date line stays one line.
      const pts = belt.path.map(([lat, lon]) => [(lon + 180) / 360 * GRID_W - 0.5, (90 - lat) / 180 * GRID_H - 0.5]);
      for (let k = 1; k < pts.length; k++) {
        if (pts[k][0] - pts[k - 1][0] > GRID_W / 2) pts[k][0] -= GRID_W;
        else if (pts[k - 1][0] - pts[k][0] > GRID_W / 2) pts[k][0] += GRID_W;
      }
      const segments = pts.length === 1 ? [[pts[0], pts[0]]] : pts.slice(1).map((p, k) => [pts[k], p]);
      for (const [a, b] of segments) {
        const x0 = Math.floor(Math.min(a[0], b[0])) - reach;
        const x1 = Math.ceil(Math.max(a[0], b[0])) + reach;
        const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1])) - reach);
        const y1 = Math.min(GRID_H - 1, Math.ceil(Math.max(a[1], b[1])) + reach);
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const d = distanceToSegment(x, y, a, b) / VOLCANIC_SPREAD;
            const i = idx(wrapX(x), y);
            magma[i] = Math.max(magma[i], belt.heat * Math.exp(-d * d));
          }
        }
      }
    }
  }

  function distanceToSegment(x: number, y: number, a: readonly number[], b: readonly number[]): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? clamp(((x - a[0]) * dx + (y - a[1]) * dy) / len2, 0, 1) : 0;
    return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
  }
}
