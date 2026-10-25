/* =============================================================================
 * SimEarth 2.0 — atmosphere and climate
 * -----------------------------------------------------------------------------
 * A deliberately transparent energy-balance model:
 *
 *   target = SOLAR * insolation * (1 - albedo) - radiativeLoss + greenhouse
 *            - altitude lapse
 *
 * Tiles chase that target with thermal inertia (oceans far more slowly than
 * land), then a diffusion pass stands in for winds and ocean currents. Every
 * coefficient is scaled by the matching Atmosphere Model Control Panel slider.
 * ========================================================================== */

namespace SE {
  export class ClimateSystem {
    private readonly tempScratch = new Float32Array(TILE_COUNT);
    private readonly moistScratch = new Float32Array(TILE_COUNT);
    /**
     * Per tile, refreshed every few ticks as the terrain moves slowly
     * (`updateRelief`): orographic rain, the share of rain the rain shadow
     * leaves, and its inverse — the vapour the air carries on out of it.
     */
    private readonly orographic = new Float32Array(TILE_COUNT);
    private readonly leeRain = new Float32Array(TILE_COUNT).fill(1);
    private readonly leeVapour = new Float32Array(TILE_COUNT).fill(1);
    private leeWorld: WorldState | null = null;
    private leeSeed = -1;
    private leeShifts = -1;
    private leeBucket = -1;

    /**
     * Normalized insolation for a row: 1.0 at the equator falling to a floor at
     * the poles. The floor stands in for the annual average at high latitudes —
     * a pole in permanent midsummer is not dark — and axial tilt moves it: a
     * steeply tilted world spreads its sunlight far more evenly.
     */
    static insolationAt(y: number, axialTilt: number): number {
      const floor = clamp(0.35 * mul(axialTilt), 0, 0.85);
      const latRad = (latitudeDeg(y) * Math.PI) / 180;
      return floor + (1 - floor) * Math.max(0, Math.cos(latRad));
    }

    /** Each part of the greenhouse forcing in degrees, before the "Treibhauseffekt" slider. */
    static greenhouseTerms(world: WorldState): { co2: number; ch4: number; vapor: number; pressure: number } {
      return {
        co2: GH_CO2 * Math.log2(1 + world.co2 / CO2_REF),
        ch4: GH_CH4 * Math.log2(1 + Math.max(0, world.ch4 - CH4_BASE)),
        vapor: GH_VAPOR * world.vapor,
        // Denser air broadens absorption lines a little; thin air loses heat.
        pressure: clamp(GH_PRESSURE * (airPressure(world) - 1), -4, 4),
      };
    }

    /** Total greenhouse forcing in degrees, from the global gas mix. */
    static greenhouseForcing(world: WorldState, params: ModelParams): number {
      const t = ClimateSystem.greenhouseTerms(world);
      return (t.co2 + t.ch4 + t.vapor + t.pressure) * mul(params.atmo.greenhouse);
    }

    step(world: WorldState, params: ModelParams): void {
      this.updateTemperature(world, params);
      this.updateMoisture(world, params);
    }

    private updateTemperature(world: WorldState, params: ModelParams): void {
      const { elevation, temperature, moisture, biome } = world;
      const scratch = this.tempScratch;

      const solar = SOLAR_INPUT_BASE * mul(params.atmo.solarInput);
      // The level's thermostat and, on hard, its tipping points (hardclimate.ts); 0 on normal inside its band.
      const greenhouse = ClimateSystem.greenhouseForcing(world, params) + climateDifficultyForcing(world, params);
      const surfAlb = mul(params.atmo.surfaceAlbedo);
      const cloudAlb = 0.28 * mul(params.atmo.cloudAlbedo);
      const diffusion = clamp(TEMP_DIFFUSION_BASE * mul(params.atmo.thermalTransfer), 0, 0.24);

      // Suspended dust scatters sunlight straight back to space.
      const dustExtinction = Math.min(0.9, world.dust * 1.1);

      for (let y = 0; y < GRID_H; y++) {
        const insolation =
          ClimateSystem.insolationAt(y, params.geo.axialTilt) * (1 - dustExtinction);

        for (let x = 0; x < GRID_W; x++) {
          const i = idx(x, y);
          const e = elevation[i];

          // Cloud cover is humidity that actually has vapour to condense from.
          const cloud = Math.min(0.6, world.vapor * moisture[i]);
          const albedo = clamp(BIOME_ALBEDO[biome[i]] * surfAlb + cloudAlb * cloud, 0, 0.92);

          let target = solar * insolation * (1 - albedo) - RADIATIVE_OFFSET + greenhouse;
          if (e > 0) target -= e * ELEVATION_KM * LAPSE_RATE;

          const inertia = e < 0 ? OCEAN_INERTIA : LAND_INERTIA;
          scratch[i] = temperature[i] + (target - temperature[i]) * inertia;
        }
      }

      // Lateral mixing: winds and currents smear the latitudinal gradient.
      // Several passes rather than a larger coefficient — see
      // TEMP_DIFFUSION_PASSES for why the reach has to be restored at all.
      for (let pass = 0; pass < TEMP_DIFFUSION_PASSES; pass++) {
        for (let y = 0; y < GRID_H; y++) {
          for (let x = 0; x < GRID_W; x++) {
            const i = idx(x, y);
            temperature[i] =
              scratch[i] * (1 - diffusion) + neighborMean(scratch, x, y) * diffusion;
          }
        }
        if (pass + 1 < TEMP_DIFFUSION_PASSES) scratch.set(temperature);
      }
    }

    /**
     * Moisture: oceans evaporate in proportion to warmth, prevailing zonal
     * winds carry that humidity downwind, and land rains it out — which is what
     * produces continental interiors and rain shadows behind mountains.
     *
     * Air temperature and the global vapour supply enter as a *ceiling* on how
     * much water the air over a tile can hold, not as a discount on what blew
     * in. That distinction is the whole difference between a living planet and
     * a desert one. Applied as a multiplier they compounded along the wind
     * chain — about 18% lost per tile on top of the transmission loss — which
     * dried the air out within five tiles of any coast whatever
     * MOISTURE_TRANSMISSION was set to. Measured on the old model: mean land
     * moisture 0.12-0.20 against a desert threshold of 0.16, so half of every
     * continent was desert by construction, and raising transmission to 1.0
     * changed the figure by 0.01.
     *
     * The wind model knows no circulation cells, so a zonal factor stands in
     * for them over land (ZONAL_RAIN_PROFILE): rising air at the equator
     * carries rain further inland, sinking air in the subtropics and at the
     * poles dries it out. Measured at 21 Ma (seeds 12345/777): land moisture
     * at the equator 0.41-0.45/0.30-0.33 before, 0.48-0.57 after; at 30-40°
     * 0.16-0.23; at 40-60° 0.34-0.48.
     *
     * Orographic rain alone left the lee nearly as wet as the windward side
     * (lee a moisture class drier behind 43-62% of crests over 2 km), since
     * the wind carries the rain of each slope on to the next tile. Air that
     * has crossed a crest now sinks and warms in the lee (`updateRelief`):
     * it rains less there, but carries its vapour on, so the land beyond the
     * shadow gets rain again. Taking the moisture out of the air instead
     * compounded tile by tile and dried all land (seed 777: mean 0.31 to
     * 0.26, forests gone); so did letting the slope rain fall out of the air
     * (0.22): the interiors live on it.
     */
    private updateMoisture(world: WorldState, params: ModelParams): void {
      const { elevation, temperature, moisture, riparian } = world;
      const scratch = this.moistScratch;
      scratch.set(moisture);
      this.updateRelief(world);
      const { orographic, leeRain, leeVapour } = this;

      const rainMul = mul(params.atmo.rainfall);
      const zonalMul = mul(params.atmo.zonalRain);
      // A dry atmosphere cannot rain, however warm it is.
      const vaporGate = clamp(0.25 + 1.35 * world.vapor, 0, 1);

      for (let y = 0; y < GRID_H; y++) {
        const wind = windDirection(y);
        const zonal = ClimateSystem.zonalRain(y) * zonalMul;
        const transmission = clamp(MOISTURE_TRANSMISSION * rainMul * (1 + ZONAL_RAIN_TRANSMISSION * zonal), 0, 0.999);
        // Rising air only carries the rain further inland; sinking air dries out.
        const source = ZONAL_RAIN_SOURCE * Math.min(0, zonal);

        for (let x = 0; x < GRID_W; x++) {
          const i = idx(x, y);
          const e = elevation[i];
          const upwind = idx(wrapX(x - wind), y);

          // Warm air holds more water; freezing air holds almost none.
          const holding = clamp((temperature[i] + 12) / 42, 0, 1);
          const capacity = (0.35 + 0.65 * holding) * vaporGate;
          let target: number;

          if (e < 0) {
            // Open water evaporates until the air above it is saturated.
            target = capacity;
          } else {
            // Land inherits what the wind brings, minus what it rains out;
            // the air left the shadow of the tile upwind with its vapour.
            const carried = scratch[upwind] * leeVapour[upwind] * transmission;
            // Air forced up a slope dumps its load on the windward side;
            // sinking air behind a crest rains less.
            target = clamp(Math.min(capacity, carried + orographic[i] + source * capacity) * leeRain[i], 0, 1);

            // A river is a moisture source of its own, so its channel and banks
            // stay green even where the wind arrives with nothing left — which
            // is exactly how a desert river valley works.
            const bank = riparian[i] * capacity;
            if (bank > target) target = bank;
          }

          moisture[i] = scratch[i] + (target - scratch[i]) * MOISTURE_RATE;
        }
      }
    }

    /**
     * Orographic rain of every land tile — air forced up a slope dumps its
     * load on the windward side — and its rain shadow, 0..1
     * (docs/hoehe-spec.md §3.5): the height of the crest upwind, which falls
     * by LEE_DECAY per tile behind it and ends at open water, times how far
     * the tile lies below it; the shadow keeps 1 - LEE_DRYING · shadow of the
     * rain. Each row is swept along its wind twice round, so a crest across
     * the date line counts.
     */
    private updateRelief(world: WorldState): void {
      const bucket = Math.floor(world.ticks / LEE_REFRESH_TICKS);
      if (world === this.leeWorld && world.seed === this.leeSeed && world.driftShifts === this.leeShifts &&
        bucket === this.leeBucket) return;
      this.leeWorld = world;
      this.leeSeed = world.seed;
      this.leeShifts = world.driftShifts;
      this.leeBucket = bucket;
      const { elevation } = world;
      const { orographic, leeRain, leeVapour } = this;
      const span = LEE_FULL_CREST - LEE_MIN_CREST;
      for (let y = 0; y < GRID_H; y++) {
        const wind = windDirection(y);
        const row = y * GRID_W;
        let crest = 0;
        let upwindE = 0;
        for (let s = 0; s < 2 * GRID_W; s++) {
          const x = s % GRID_W;
          const i = row + (wind > 0 ? x : GRID_W - 1 - x);
          const e = elevation[i];
          if (s >= GRID_W) {
            const lee = e < 0 ? 0 : clamp((crest - LEE_MIN_CREST) / span, 0, 1) * clamp((crest - e) / LEE_FULL_DROP, 0, 1);
            leeRain[i] = 1 - LEE_DRYING * lee;
            leeVapour[i] = 1 / leeRain[i];
            orographic[i] = e < 0 ? 0 : Math.min(0.35, Math.max(0, e - Math.max(0, upwindE)) * 1.6);
          }
          upwindE = e;
          crest = e < 0 ? 0 : Math.max(e, crest - LEE_DECAY);
        }
      }
    }

    /**
     * Zonal rain factor of a row, -1..+1 (ZONAL_RAIN_PROFILE): wet where air
     * rises (equator, westerlies), dry where it sinks (subtropics, poles).
     */
    static zonalRain(y: number): number {
      const lat = Math.abs(latitudeDeg(y));
      const p = ZONAL_RAIN_PROFILE;
      for (let k = 1; k < p.length; k++) {
        if (lat <= p[k][0]) {
          const t = (lat - p[k - 1][0]) / (p[k][0] - p[k - 1][0]);
          return lerp(p[k - 1][1], p[k][1], t);
        }
      }
      return p[p.length - 1][1];
    }

    /* ------------------------------------------------- overlay derivations -- */

    /**
     * Air current vector for a tile, used by the Winds overlay and Air Currents
     * map. Zonal flow plus a weak meridional component toward the poles.
     */
    static airCurrent(y: number): { dx: number; dy: number } {
      const absLat = Math.abs(latitudeDeg(y));
      const dx = windDirection(y);
      // Hadley/Ferrel/Polar cells: alternating poleward and equatorward drift.
      const dy = absLat < 30 ? 1 : absLat < 60 ? -1 : 1;
      const hemi = latitudeDeg(y) >= 0 ? 1 : -1;
      return { dx, dy: dy * hemi };
    }

    /**
     * Ocean current vector: wind-driven gyres that reverse across the equator,
     * which is what the SeaFlow overlay draws.
     */
    static oceanCurrent(x: number, y: number): { dx: number; dy: number } {
      const lat = latitudeDeg(y);
      const gyre = Math.sin((x / GRID_W) * Math.PI * 4);
      const dx = lat > 0 ? (gyre >= 0 ? 1 : -1) : (gyre >= 0 ? -1 : 1);
      const dy = Math.abs(lat) < 45 ? (lat >= 0 ? -1 : 1) : (lat >= 0 ? 1 : -1);
      return { dx, dy };
    }
  }

  /* -------------------------------------------------------------------------- */

  /** Collects every global source and sink, then clamps the mix to sane bounds. */
  export class AtmosphereSystem {
    /** Net gas exchange computed by the biosphere this tick. */
    o2Delta = 0;
    /** Marine net O2 production: it enters the sea, not the air. */
    oceanO2Delta = 0;
    co2Delta = 0;
    dustDelta = 0;
    /** Methane the civilization released this tick, ppm; the biosphere's own is counted in stepMethane. */
    ch4Delta = 0;

    step(world: WorldState, params: ModelParams): void {
      // --- Carbon dioxide ---
      // The carbonate-silicate thermostat: weathering accelerates sharply with
      // temperature, which is what stops a volcanic world cooking indefinitely.
      const landFraction = 1 - world.oceanFraction;
      const weathering =
        world.co2 * WEATHERING * landFraction *
        clamp((world.globalTemp + 5) / 25, 0, 2.5);

      const volcanic = VOLCANIC_CO2 * mul(params.geo.volcanoes);
      world.co2 += volcanic + this.co2Delta - weathering;
      // co2Delta's parts were booked where life and the civilization computed them (gasbudget.ts).
      world.gas.add('co2', 'volcanism', volcanic);
      world.gas.add('co2', 'weathering', -weathering);

      // --- Oxygen ---
      // Marine oxygen reaches the air only through the sea (OceanChemistry).
      // The oxidation sink grows faster than linearly: the more free oxygen
      // there is, the more aggressively it attacks rock and dead organics.
      const outgassing = OceanChemistry.step(world, params, this.oceanO2Delta);
      const oxidation = world.o2 * OXIDATION * (0.5 + world.o2 / 40);
      const reducing = OceanChemistry.reducingSink(world.o2);
      world.o2 += this.o2Delta + outgassing - oxidation - reducing;
      // The marine production went into the sea; only the exchange with it reaches the air.
      world.gas.add('o2', 'sea', outgassing);
      world.gas.add('o2', 'oxidation', -oxidation);
      world.gas.add('o2', 'reducing', -reducing);

      // --- Methane --- (after the oxygen, which destroys it)
      stepMethane(world, params, this.ch4Delta);

      // --- Water vapour ---
      // Equilibrium humidity rises with sea area and global temperature. The
      // loop gain stays well under 1, so this amplifies without running away.
      const vaporTarget = clamp(
        world.oceanFraction * clamp((world.globalTemp + 25) / 45, 0, 1.3), 0, 1,
      );
      world.vapor += (vaporTarget - world.vapor) * 0.01;

      // --- Dust ---
      world.dust += this.dustDelta;
      world.dust -= world.dust * DUST_SETTLING;

      // --- Bounds ---
      const co2 = world.co2;
      const o2 = world.o2;
      world.co2 = clamp(world.co2, 0, 5000);
      world.o2 = clamp(world.o2, 0, 40);
      world.gas.add('co2', 'limit', world.co2 - co2);
      world.gas.add('o2', 'limit', world.o2 - o2);
      world.n2 = clamp(world.n2, 0, 100);
      world.vapor = clamp(world.vapor, 0, 1);
      world.dust = clamp(world.dust, 0, 1);

      this.o2Delta = 0;
      this.oceanO2Delta = 0;
      this.co2Delta = 0;
      this.dustDelta = 0;
      this.ch4Delta = 0;
    }
  }
}
