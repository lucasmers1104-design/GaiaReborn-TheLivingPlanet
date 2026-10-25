/* =============================================================================
 * Gaia Reborn — the climate's thermostat and its tipping points on hard
 * -----------------------------------------------------------------------------
 * Easy and normal pull a planet that left the comfortable band back towards
 * it (DIFFICULTY_CONFIG.climate.thermostat); inside the band they leave the
 * climate exactly as it was tuned. Hard pushes it further out instead (ice
 * reflects more sunlight, a hot sea gives off more vapour), and its own
 * history tips it four times (TippingDifficulty): the first oxygen destroys
 * the methane that kept the young planet warm, the coal swamps bury CO₂, a
 * flood basalt at the Permian's end floods the air with it, and a
 * civilization's fossil fuel heats twice over. Meanwhile the sun brightens
 * and undoes every warming fix. All triggers are the calendar and the
 * planet's state; no random numbers. Node-safe.
 * ========================================================================== */

namespace SE {
  /** The crises of hard, as bits of DifficultyState.crises: each is announced once. */
  const enum HardCrisis { Methane, Coal, Basalt, Industry }

  const CRISIS_TEXT: Readonly<Record<HardCrisis, string>> = {
    [HardCrisis.Methane]: 'Der erste Sauerstoff zerstört das Methan in der Luft – dem jungen Planeten fehlt seine Wärme. Ohne mehr Treibhauseffekt (Modell Atmosphäre) oder Vulkanismus (Modell Geosphäre) droht eine Eiszeit.',
    [HardCrisis.Coal]: 'Die Kohlewälder saugen CO₂ aus der Luft und begraben es im Sumpf. Weniger CO₂-Aufnahme (Modell Biosphäre) oder mehr Vulkanismus (Modell Geosphäre) hält die Eiszeit fern.',
    [HardCrisis.Basalt]: 'Flutbasalte brechen auf: Lava und CO₂ ohne Ende. Erst verdunkelt Asche den Himmel, dann droht Hitze – mehr Wolken- und Boden-Rückstrahlung (Modell Atmosphäre) kühlen den Planeten.',
    [HardCrisis.Industry]: 'Die Industrie verbrennt Kohle und Öl – auf diesem Planeten heizt jede Tonne doppelt. Verschiebe den Energiemix im Modell Zivilisation weg von fossilen Brennstoffen.',
  };

  /** Extra forcing in degrees for the temperature equation (climate.ts): the thermostat, on hard also the drifts. Exactly 0 on normal inside its band. */
  export function climateDifficultyForcing(world: WorldState, params: ModelParams): number {
    void params;
    const c = difficultyConfig(world).climate;
    const t = world.globalTemp;
    const out = t < c.comfortLow ? t - c.comfortLow : t > c.comfortHigh ? t - c.comfortHigh : 0;
    let f = out === 0 ? 0 : clamp(-c.thermostat * out, -c.thermostatCap, c.thermostatCap);
    const tp = c.tipping;
    if (tp) f += sunDrift(tp, yearsAgo(world.absoluteYears) / 1e6) - methaneLoss(world, tp);
    return f;
  }

  /** The brightening sun's forcing at `ma` million years before the present. */
  function sunDrift(tp: TippingDifficulty, ma: number): number {
    const p = tp.sunDrift;
    if (ma >= p[0][0]) return p[0][1];
    for (let k = 1; k < p.length; k++) {
      if (ma >= p[k][0]) return lerp(p[k - 1][1], p[k][1], (p[k - 1][0] - ma) / (p[k - 1][0] - p[k][0]));
    }
    return p[p.length - 1][1];
  }

  /** Degrees the methane lost since its peak takes off the young planet. */
  function methaneLoss(world: WorldState, tp: TippingDifficulty): number {
    const doublings = (ch4: number): number => Math.log2(1 + Math.max(0, ch4 - CH4_BASE));
    return Math.min(tp.methaneCap, tp.methaneWeight * Math.max(0, doublings(world.difficulty.ch4Peak) - doublings(world.ch4)));
  }

  /** Once a tick, after the atmosphere: on hard the crises' gases, their announcements and the warnings. */
  export function stepHardClimate(world: WorldState, params: ModelParams, notes: SimNote[]): void {
    const c = difficultyConfig(world).climate;
    const tp = c.tipping;
    if (!tp) return;
    const d = world.difficulty;
    if (world.ch4 > d.ch4Peak) d.ch4Peak = world.ch4;
    const announce = (k: HardCrisis): void => {
      if (d.crises & (1 << k)) return;
      d.crises |= 1 << k;
      notes.push({ kind: 'message', tone: 'warn', text: CRISIS_TEXT[k] });
    };

    if (world.o2 >= tp.methaneAnnounceO2 && world.ch4 < d.ch4Peak / 2 && methaneLoss(world, tp) > 1) announce(HardCrisis.Methane);

    // Only the giant clubmosses' swamp forests: the later swamps' lignite is a tenth of it (coal.ts).
    const buried = CoalSystem.lastDeposit.lycopsid;
    if (buried > 0) {
      shiftGas(world, 'co2', 'photosynthesis', -tp.coalDrawdown * buried * mul(params.bio.co2Absorption), 0, 5000);
      if (buried >= tp.coalAnnounce) announce(HardCrisis.Coal);
    }

    const ma = yearsAgo(world.absoluteYears) / 1e6;
    if (ma <= tp.basaltFromMa && ma > tp.basaltToMa) {
      shiftGas(world, 'co2', 'volcanism', tp.basaltCO2 * mul(params.geo.volcanoes), 0, 5000);
      world.dust = Math.min(1, world.dust + tp.basaltDust);
      announce(HardCrisis.Basalt);
    }

    const fossil = world.gas.part('co2', 'fossil');
    if (fossil > 0) {
      shiftGas(world, 'co2', 'fossil', fossil * tp.industryBoost, 0, 5000);
      announce(HardCrisis.Industry);
    }

    warn(world, c, tp, notes);
  }

  /** A warning when the planet leaves the band and keeps going; again after the cooldown, or at once after it came back. */
  function warn(world: WorldState, c: ClimateDifficulty, tp: TippingDifficulty, notes: SimNote[]): void {
    const d = world.difficulty;
    const t = world.globalTemp;
    const prev = d.lastTemp;
    d.lastTemp = t;
    if (t > c.comfortLow + tp.warnHysteresis) d.coldWarned = -Infinity;
    if (t < c.comfortHigh - tp.warnHysteresis) d.hotWarned = -Infinity;
    const deg = `${t.toLocaleString('de-DE', { maximumFractionDigits: 1 })} °C`;
    if (t < c.comfortLow && t < prev && world.ticks - d.coldWarned >= tp.warnCooldown) {
      d.coldWarned = world.ticks;
      notes.push({
        kind: 'message', tone: 'warn',
        text: `Klima-Warnung: Der Planet kühlt gefährlich ab (${deg}) – erhöhe Treibhauseffekt oder Sonneneinstrahlung im Modell Atmosphäre oder den Vulkanismus im Modell Geosphäre!`,
      });
    }
    if (t > c.comfortHigh && t > prev && world.ticks - d.hotWarned >= tp.warnCooldown) {
      d.hotWarned = world.ticks;
      const industry = d.crises & (1 << HardCrisis.Industry) ? ', oder senke die fossilen Brennstoffe im Modell Zivilisation' : '';
      notes.push({
        kind: 'message', tone: 'warn',
        text: `Klima-Warnung: Der Planet heizt sich gefährlich auf (${deg}) – erhöhe Wolken- oder Boden-Rückstrahlung, senke den Treibhauseffekt im Modell Atmosphäre oder den Vulkanismus im Modell Geosphäre${industry}!`,
      });
    }
  }

  /* -------------------------------------------------------------- save -- */

  /** The climate's part of the difficulty save field; the warnings' cooldowns are not kept. */
  export function hardClimateToJSON(world: WorldState): unknown {
    const d = world.difficulty;
    return { ch4Peak: d.ch4Peak, crises: d.crises };
  }

  /** A save without it, or with bad values, measures the methane from now on and announces the crises again. */
  export function restoreHardClimate(world: WorldState, raw: unknown): void {
    const r = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
    const d = world.difficulty;
    const peak = r.ch4Peak;
    if (typeof peak === 'number' && Number.isFinite(peak) && peak >= 0 && peak <= CH4_MAX) d.ch4Peak = peak;
    const crises = r.crises;
    if (typeof crises === 'number' && Number.isInteger(crises) && crises >= 0 && crises < 1 << 4) d.crises = crises;
  }
}
