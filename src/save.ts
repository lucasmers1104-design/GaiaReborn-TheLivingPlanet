/* =============================================================================
 * SimEarth 2.0 — save files
 * -----------------------------------------------------------------------------
 * Format 10. Every per-tile field is quantised into a typed array and base64
 * encoded, the whole document is gzipped where the browser can, and classes,
 * plant groups and evolution steps are named by their stable string ids — so
 * the numeric order of an enum can change without breaking a save.
 *
 * Loading is all-or-nothing. A file is decoded and validated into a *staging*
 * world first; only when every field has passed is it copied over the live
 * one. A broken save therefore never leaves a half-overwritten planet behind
 * (the old loader wrote the height map before it had checked the rest).
 *
 * Version 4 files — the 256x128 format before the evolution rework — are
 * migrated, never discarded: see `migrateV4`, which also explains every
 * reinterpretation it makes. Versions 4 and 5 then pass through `migrateV5`
 * (eight sub-species instead of three, the sea's own oxygen and iron), and
 * every version before 7 through `migrateV6` (landscapes and soil), every
 * version before 8 through `migrateV7` (the mountain type of the crust), and
 * every version before 9 through `migrateV8` (the dinosaurs' era and its new
 * sub-species). Format 10 adds the space project (`space`, spaceport.ts):
 * a planet from before it starts without one, and a civilization that has
 * already reached the Nanotech age unlocks it on its first tick, with the
 * usual news, as if it had just got there.
 * ========================================================================== */

namespace SE {
  /** A well-formed file that cannot be used here (other version or size). */
  export class SaveIncompatible extends Error {}
  /** A file that is damaged or fails validation. */
  export class SaveCorrupt extends Error {}

  export const SAVE_FORMAT = 10;
  /** Where every earlier version wrote its single save. Read, never deleted. */
  export const LEGACY_SAVE_KEY = 'simearth2.save.v2';
  export const SLOT_COUNT = 3;
  export const AUTOSAVE_KEY = 'simearth2.autosave';

  export function slotKey(slot: number): string {
    return `simearth2.slot.${slot}`;
  }

  /** What the load dialog shows about a save without decoding the planet. */
  export interface SaveMeta {
    readonly format: number;
    readonly name: string;
    readonly savedAt: string;
    readonly years: number;
    readonly timeScale: number;
    readonly developed: number;
    readonly totalNodes: number;
    /** Simulation ticks played; missing in metadata written before format 6. */
    readonly ticks?: number;
    /** A small picture of the planet (data URL), added by the app when it saves. */
    readonly thumb?: string;
  }

  /** Version-4 class numbers, mapped onto this version's lineages. */
  const V4_LIFE: readonly (string | null)[] = [
    null, 'cells', 'eukaryotes', 'earlyAnimals', 'arthropods', 'molluscs', 'fish', 'whales',
    // 8 was the fictional Trichordate: its niche — the first animals ashore,
    // at home on bare highland — is the land arthropods'.
    'landArthropods',
    'insects', 'amphibians', 'reptiles', 'dinosaurs', 'birds', 'mammals',
    // 15 was the Carnifern, a "mobile carnivorous plant" said to evolve from
    // insects. It becomes what it really is: a carnivorous plant group.
    null,
  ];
  const V4_CARNIFERN = 15;
  /** Highest sub-species stage of formats 4 and 5, which had three per class. */
  const OLD_STAGE_MAX = 2;
  /**
   * Dinosaur stages of formats 6 to 8 on this version's ladder: Urdinosaurier,
   * Plateosaurier and Sauropoden keep their place, the Stegosaurier move to 6.
   * Ankylosaurier, Entenschnabel-, Horn- and Tyrannosaurier are biome
   * specialists of the last stage now, so their populations stand at 7.
   */
  const V8_DINO_STAGE: readonly number[] = [0, 1, 2, 6, 7, 7, 7, 7];
  /** The same for the lexicon, where only the same animal keeps its entry: the four that are no sub-species any more lose theirs. */
  const V8_DINO_ENTRY: readonly (number | null)[] = [0, 1, 2, 6, null, null, null, null];

  /* ------------------------------------------------------------- base64 -- */

  function bytesToB64(bytes: Uint8Array): string {
    let out = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      out += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
    }
    return btoa(out);
  }

  function b64ToBytes(b64: unknown): Uint8Array {
    if (typeof b64 !== 'string') throw new SaveCorrupt('Feld fehlt');
    let bin: string;
    try {
      bin = atob(b64);
    } catch {
      throw new SaveCorrupt('Feld ist beschädigt');
    }
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  type Quant = 'i16' | 'u16' | 'u8';

  /** Quantise a float field: v*scale+offset rounded into the given type. */
  function packField(a: ArrayLike<number>, q: Quant, scale: number, offset = 0): string {
    const n = a.length;
    if (q === 'u8') {
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i++) out[i] = clamp(Math.round(a[i] * scale + offset), 0, 255);
      return bytesToB64(out);
    }
    const out = q === 'i16' ? new Int16Array(n) : new Uint16Array(n);
    const lo = q === 'i16' ? -32768 : 0;
    const hi = q === 'i16' ? 32767 : 65535;
    for (let i = 0; i < n; i++) out[i] = clamp(Math.round(a[i] * scale + offset), lo, hi);
    return bytesToB64(new Uint8Array(out.buffer));
  }

  /**
   * Elevation as i16, keeping the sign: sea a hair below zero rounded to 0
   * and came back as land, which a reloaded planet then had to start a
   * landscape on.
   */
  function packElevation(a: Float32Array, scale: number): string {
    const out = new Int16Array(a.length);
    for (let i = 0; i < a.length; i++) {
      const v = clamp(Math.round(a[i] * scale), -32768, 32767);
      out[i] = a[i] < 0 && v >= 0 ? -1 : v;
    }
    return bytesToB64(new Uint8Array(out.buffer));
  }

  function unpackField(b64: unknown, n: number, q: Quant, scale: number, offset = 0): Float32Array {
    const bytes = b64ToBytes(b64);
    const width = q === 'u8' ? 1 : 2;
    if (bytes.length !== n * width) throw new SaveCorrupt('Feldgröße stimmt nicht');
    const out = new Float32Array(n);
    if (q === 'u8') {
      for (let i = 0; i < n; i++) out[i] = (bytes[i] - offset) / scale;
    } else {
      const view = q === 'i16' ? new Int16Array(bytes.buffer, 0, n) : new Uint16Array(bytes.buffer, 0, n);
      for (let i = 0; i < n; i++) out[i] = (view[i] - offset) / scale;
    }
    return out;
  }

  function rawU8(b64: unknown, n: number): Uint8Array {
    const bytes = b64ToBytes(b64);
    if (bytes.length !== n) throw new SaveCorrupt('Feldgröße stimmt nicht');
    return bytes;
  }

  function rawU16(b64: unknown, n: number): Uint16Array {
    const bytes = b64ToBytes(b64);
    if (bytes.length !== n * 2) throw new SaveCorrupt('Feldgröße stimmt nicht');
    return new Uint16Array(bytes.buffer, 0, n).slice();
  }

  /* ------------------------------------------------------------ helpers -- */

  function num(v: unknown, lo: number, hi: number, what: string): number {
    const n = typeof v === 'number' ? v : NaN;
    if (!Number.isFinite(n) || n < lo || n > hi) throw new SaveCorrupt(`${what} ist ungültig`);
    return n;
  }

  function int(v: unknown, lo: number, hi: number, what: string): number {
    const n = num(v, lo, hi, what);
    if (!Number.isInteger(n)) throw new SaveCorrupt(`${what} ist ungültig`);
    return n;
  }

  function str(v: unknown, max = 400): string {
    return typeof v === 'string' ? v.slice(0, max) : '';
  }

  const LIFE_BY_ID = new Map<string, Life>();
  for (let c = 1; c < LIFE_COUNT; c++) LIFE_BY_ID.set(LIFE[c as Life].id, c as Life);
  const FLORA_VALID_MASK = (1 << FLORA_COUNT) - 2; // bits 1..FLORA_COUNT-1

  /* --------------------------------------------------------------- save -- */

  export interface SaveContext {
    readonly world: WorldState;
    readonly params: ModelParams;
    readonly geo: GeoSystem;
    readonly history?: HistoryRecorder;
    readonly fauna?: FaunaDex;
    /** Model panels already paid for on this planet (app.ts). */
    readonly paidModels?: Set<string>;
  }

  export class SaveSystem {
    /** The planet as a plain document in the current format. */
    static serialize(ctx: SaveContext): Record<string, unknown> {
      const w = ctx.world;

      // The life matrix is sparse: a handful of classes per tile at most.
      const tiles: number[] = [];
      const cls: number[] = [];
      const den: number[] = [];
      const stg: number[] = [];
      for (let i = 0; i < TILE_COUNT; i++) {
        const base = i * LIFE_COUNT;
        for (let c = 1; c < LIFE_COUNT; c++) {
          const d = w.lifeDensity[base + c];
          if (d <= 0) continue;
          tiles.push(i);
          cls.push(c);
          den.push(d);
          stg.push(w.lifeStage[base + c]);
        }
      }
      const ids: string[] = [];
      for (let c = 0; c < LIFE_COUNT; c++) ids.push(c === 0 ? '' : LIFE[c as Life].id);

      const firstSeen: Record<string, number> = {};
      for (let c = 1; c < LIFE_COUNT; c++) {
        if (w.lifeFirstSeen[c] >= 0) firstSeen[LIFE[c as Life].id] = w.lifeFirstSeen[c];
      }

      const developed: Record<string, { tick: number; years: number; migrated?: boolean }> = {};
      for (const [id, rec] of w.evo.developed) developed[id] = { ...rec };

      const params: Record<string, Record<string, number>> = {};
      for (const [group, values] of Object.entries(ctx.params.groups())) params[group] = { ...values };

      return {
        format: 'simearth2',
        version: SAVE_FORMAT,
        w: GRID_W, h: GRID_H,
        savedAt: new Date().toISOString(),
        name: w.name,
        seed: w.seed, rngState: w.rng.getState(), ticks: w.ticks, omega: w.omega,
        co2: w.co2, o2: w.o2, n2: w.n2, vapor: w.vapor, dust: w.dust,
        oceanIron: w.oceanIron, oceanO2: w.oceanO2,
        timeScale: w.timeScale, absoluteYears: w.absoluteYears, scaleYears: w.scaleYears,
        sentient: w.sentientClass === Life.None ? '' : LIFE[w.sentientClass].id,
        fields: {
          elevation: packElevation(w.elevation, 32000),
          temperature: packField(w.temperature, 'i16', 100),
          moisture: packField(w.moisture, 'u16', 65535),
          vegetation: packField(w.vegetation, 'u16', 65535),
          cityPop: packField(w.cityPop, 'u16', 65535),
          magma: packField(w.magma, 'u16', 65535),
          uplift: packField(w.uplift, 'u16', 65535),
          biome: bytesToB64(w.biome),
          tech: bytesToB64(w.tech),
          flora: bytesToB64(new Uint8Array(w.flora.buffer.slice(0))),
          landscape: bytesToB64(w.landscape),
          landscapeNext: bytesToB64(w.landscapeNext),
          landscapeHold: bytesToB64(w.landscapeHold),
          soil: bytesToB64(w.soil),
          upliftKind: bytesToB64(w.upliftKind),
        },
        life: {
          ids,
          t: bytesToB64(new Uint8Array(Uint32Array.from(tiles).buffer)),
          c: bytesToB64(Uint8Array.from(cls)),
          d: packField(den, 'u16', 65535),
          s: bytesToB64(Uint8Array.from(stg)),
        },
        lifeFirstSeen: firstSeen,
        evolution: {
          ep: w.evo.ep,
          developed,
          reported: Array.from(w.evo.reported),
          chronicle: w.evo.chronicle.map((e) => ({ ...e })),
          ready: Object.fromEntries(w.evo.readySince),
          extinct: Array.from(w.evo.extinct),
        },
        geo: { offsets: ctx.geo.driftOffsets },
        params,
        history: ctx.history ? ctx.history.toJSON() : null,
        fauna: ctx.fauna ? ctx.fauna.toJSON() : undefined,
        civ: civToJSON(w),
        dinoEra: {
          fate: w.dinoEra.fate, target: w.dinoEra.target, struck: w.dinoEra.struck,
          refuges: w.dinoEra.refuges.map((r) => ({ i: r.tile, c: LIFE[r.c].id, s: r.stage, t: r.since })),
        },
        coal: coalToJSON(w),
        oil: oilToJSON(w),
        termites: w.termiteMound,
        terraformed: terraformedToJSON(w),
        fates: fatesToJSON(w),
        paidModels: ctx.paidModels ? Array.from(ctx.paidModels) : undefined,
        space: spaceToJSON(w),
      };
    }

    static meta(data: Record<string, unknown>): SaveMeta {
      const evo = (data.evolution ?? {}) as Record<string, unknown>;
      const developed = evo.developed && typeof evo.developed === 'object'
        ? Object.keys(evo.developed as object).length : 0;
      return {
        format: Number(data.version) || 0,
        name: str(data.name, 40) || 'Erde',
        savedAt: str(data.savedAt, 40),
        years: Number(data.absoluteYears) || 0,
        timeScale: clamp(Math.floor(Number(data.timeScale) || 0), 0, 3),
        developed,
        totalNodes: EVO_NODES.length,
        ticks: Math.max(0, Math.floor(Number(data.ticks) || 0)),
      };
    }

    /* ------------------------------------------------------- encoding -- */

    /** Gzip and base64 where the browser can; plain JSON otherwise. */
    static async encode(doc: unknown): Promise<string> {
      const json = JSON.stringify(doc);
      if (typeof CompressionStream === 'undefined') return json;
      const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
      const buf = new Uint8Array(await new Response(stream).arrayBuffer());
      return `G1:${bytesToB64(buf)}`;
    }

    static async decode(text: string): Promise<Record<string, unknown>> {
      let json = text;
      if (text.startsWith('G1:')) {
        if (typeof DecompressionStream === 'undefined') {
          throw new SaveIncompatible('Dieser Browser kann komprimierte Spielstände nicht lesen.');
        }
        try {
          const bytes = b64ToBytes(text.slice(3));
          const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
          json = await new Response(stream).text();
        } catch (err) {
          if (err instanceof SaveIncompatible) throw err;
          throw new SaveCorrupt('Der Spielstand ist beschädigt.');
        }
      }
      let data: unknown;
      try {
        data = JSON.parse(json);
      } catch {
        throw new SaveCorrupt('Der Spielstand ist beschädigt.');
      }
      if (!data || typeof data !== 'object') throw new SaveCorrupt('Der Spielstand ist beschädigt.');
      return data as Record<string, unknown>;
    }

    /* ------------------------------------------------------- loading -- */

    /**
     * Validate a document into a fresh staging world and, only if all of it
     * passes, copy it over the live state. Returns notes for the player when
     * the file had to be migrated.
     */
    static load(
      raw: Record<string, unknown>, ctx: SaveContext,
      life: LifeSystem, flora: FloraSystem,
    ): { notes: string[] } {
      const version = raw.version;
      if (version !== SAVE_FORMAT && version !== 9 && version !== 8 && version !== 7 && version !== 6 && version !== 5 && version !== 4) {
        throw new SaveIncompatible(version === 2 || version === 3
          ? 'Der Spielstand stammt von der alten 128 × 64-Karte und kann nicht übernommen werden.'
          : 'Unbekanntes Spielstandformat.');
      }
      if (raw.w !== GRID_W || raw.h !== GRID_H) {
        throw new SaveIncompatible(`Der Planet hat ${String(raw.w)} × ${String(raw.h)} Felder, diese Welt ${GRID_W} × ${GRID_H}.`);
      }

      const stage = new WorldState();
      const stageParams = new ModelParams();
      const notes: string[] = [];
      let offsets: number[] = [0, 0, 0, 0];

      if (version === 4) {
        SaveSystem.readV4(raw, stage, stageParams, notes);
      } else {
        offsets = SaveSystem.readV5(raw, stage, stageParams);
      }
      // Required from format 10 on; before it there was no project (see the header).
      if ((version as number) >= 10 && !readSpace(raw.space, stage.ticks, stage.space)) throw new SaveCorrupt('Feld „Raumfahrt“ ist ungültig');

      // Older planets keep their old freedom through the migrations below, so
      // the version-4 founders are not barred; migrateV8 then settles the era.
      if ((version as number) < 9) stage.dinoEra.fate = 'exempt';
      let fauna = raw.fauna;

      // Everything below derives from validated data and cannot fail on input.
      RiverSystem.rebuild(stage);
      if (version === 4) SaveSystem.migrateV4(stage, stageParams, life, flora, raw, notes);
      const redate = version === 4 || version === 5 ? SaveSystem.migrateV5(stage) : null;
      if ((version as number) < 7) SaveSystem.migrateV6(stage);
      if ((version as number) < 8) SaveSystem.migrateV7(stage);
      if ((version as number) < 9) fauna = SaveSystem.migrateV8(stage, fauna, notes);

      // --- commit ---
      ctx.world.copyFrom(stage);
      for (const [group, values] of Object.entries(stageParams.groups())) {
        Object.assign(ctx.params.groups()[group], values);
      }
      ctx.geo.driftOffsets = offsets;
      if (ctx.history) {
        ctx.history.reset();
        if (raw.history) ctx.history.fromJSON(raw.history);
        if (redate) ctx.history.years.forEach((y, k) => { ctx.history!.years[k] = redate(y); });
      }
      // Coal is an optional field too: without a sound one it is estimated
      // (coalsave.ts). Before the landscapes are derived, which ask whether
      // the clubmosses still count as woody.
      restoreCoal(ctx.world, raw.coal);
      restoreOil(ctx.world, raw.oil);
      restoreTermites(ctx.world, raw.termites);
      // What died out for good (optional field, stagefates.ts); without it the first tick finds out.
      restoreFates(ctx.world, raw.fates);
      // Land the brush raised (optional field, terraform.ts): its summits keep their snow.
      restoreTerraformed(ctx.world, raw.terraformed);
      RiverSystem.rebuild(ctx.world);
      BiomeSystem.step(ctx.world, false);
      ctx.world.refreshDerived();
      // The lexicon is an optional field, so the format number stays: a save
      // without one (older, or damaged there) adopts what lives, silently.
      if (ctx.fauna) {
        const dex = FaunaDex.fromJSON(fauna);
        if (dex) ctx.fauna.copyFrom(dex);
        else {
          ctx.fauna.reset();
          ctx.fauna.adoptLiving(ctx.world);
        }
      }
      // Paid model panels: optional, an older save simply has none paid.
      if (ctx.paidModels) {
        ctx.paidModels.clear();
        if (Array.isArray(raw.paidModels)) for (const id of raw.paidModels) if (typeof id === 'string') ctx.paidModels.add(id);
      }
      // City and people names are optional as well: without them, or with a
      // damaged field, the records are derived from the grid at the next sync.
      try {
        restoreCiv(ctx.world, ctx.params, raw.civ);
      } catch {
        ctx.world.civ.clear();
      }
      return { notes };
    }

    private static readScalars(raw: Record<string, unknown>, w: WorldState): void {
      w.seed = int(raw.seed, 0, 0xffffffff, 'Startwert');
      w.rng = new Rng(w.seed);
      w.rng.setState(int(raw.rngState, 0, 0xffffffff, 'Zufallszustand'));
      w.ticks = int(raw.ticks, 0, Number.MAX_SAFE_INTEGER, 'Zeitschritt');
      w.omega = num(raw.omega, 0, OMEGA_MAX, 'Energie');
      w.co2 = num(raw.co2, 0, 5000, 'CO₂');
      w.o2 = num(raw.o2, 0, 40, 'Sauerstoff');
      w.n2 = num(raw.n2, 0, 100, 'Stickstoff');
      w.vapor = num(raw.vapor, 0, 1, 'Wasserdampf');
      w.dust = num(raw.dust, 0, 1, 'Staub');
      if ((raw.version as number) >= 6) {
        w.oceanIron = num(raw.oceanIron, 0, 1, 'Eisen im Meer');
        w.oceanO2 = num(raw.oceanO2, 0, 1000, 'Sauerstoff im Meer');
      }
      w.timeScale = int(raw.timeScale, 0, 3, 'Zeitmaßstab') as TimeScale;
      w.absoluteYears = num(raw.absoluteYears, 0, 1e15, 'Planetenalter');
      w.scaleYears = num(raw.scaleYears, 0, 1e15, 'Zeitalter-Jahre');
      if (typeof raw.name === 'string' && raw.name.trim()) w.name = raw.name.slice(0, 40);
    }

    private static readParams(raw: unknown, into: ModelParams): void {
      if (!raw || typeof raw !== 'object') return; // defaults
      const src = raw as Record<string, unknown>;
      for (const [group, values] of Object.entries(into.groups())) {
        const g = src[group];
        if (!g || typeof g !== 'object') continue;
        for (const key of Object.keys(values)) {
          const v = (g as Record<string, unknown>)[key];
          if (v === undefined) continue;
          values[key] = num(v, 0, 1, `Modellwert ${key}`);
        }
      }
    }

    private static readV5(raw: Record<string, unknown>, w: WorldState, params: ModelParams): number[] {
      SaveSystem.readScalars(raw, w);
      const f = (raw.fields ?? {}) as Record<string, unknown>;
      const n = TILE_COUNT;
      w.elevation.set(unpackField(f.elevation, n, 'i16', 32000));
      w.temperature.set(unpackField(f.temperature, n, 'i16', 100));
      w.moisture.set(unpackField(f.moisture, n, 'u16', 65535));
      w.vegetation.set(unpackField(f.vegetation, n, 'u16', 65535));
      w.cityPop.set(unpackField(f.cityPop, n, 'u16', 65535));
      w.magma.set(unpackField(f.magma, n, 'u16', 65535));
      w.uplift.set(unpackField(f.uplift, n, 'u16', 65535));
      const biome = rawU8(f.biome, n);
      const tech = rawU8(f.tech, n);
      const flora = rawU16(f.flora, n);
      for (let i = 0; i < n; i++) {
        if (biome[i] >= BIOME_COUNT) throw new SaveCorrupt('Lebensraum ungültig');
        if (tech[i] >= TECH_COUNT) throw new SaveCorrupt('Technologiestufe ungültig');
        if ((flora[i] & ~FLORA_VALID_MASK) !== 0) throw new SaveCorrupt('Pflanzendaten ungültig');
      }
      w.biome.set(biome);
      w.tech.set(tech);
      w.flora.set(flora);
      if ((raw.version as number) >= 7) {
        const landscape = rawU8(f.landscape, n);
        const next = rawU8(f.landscapeNext, n);
        for (let i = 0; i < n; i++) {
          if (landscape[i] >= LANDSCAPE_COUNT) throw new SaveCorrupt('Landschaft ungültig');
          if (next[i] >= LANDSCAPE_COUNT && next[i] !== LANDSCAPE_UNSET) throw new SaveCorrupt('Landschaft ungültig');
        }
        w.landscape.set(landscape);
        w.landscapeNext.set(next);
        w.landscapeHold.set(rawU8(f.landscapeHold, n));
        w.soil.set(rawU8(f.soil, n));
      }
      if ((raw.version as number) >= 8) {
        const kind = rawU8(f.upliftKind, n);
        for (let i = 0; i < n; i++) if (kind[i] >= UPLIFT_KIND_COUNT) throw new SaveCorrupt('Gebirgstyp ungültig');
        w.upliftKind.set(kind);
      }

      // --- life ---
      const life = (raw.life ?? {}) as Record<string, unknown>;
      if (!Array.isArray(life.ids)) throw new SaveCorrupt('Lebensdaten fehlen');
      const map: Life[] = (life.ids as unknown[]).map((id) => LIFE_BY_ID.get(str(id)) ?? Life.None);
      const tBytes = b64ToBytes(life.t);
      if (tBytes.length % 4 !== 0) throw new SaveCorrupt('Lebensdaten beschädigt');
      const count = tBytes.length / 4;
      const tiles = new Uint32Array(tBytes.buffer, 0, count);
      const cls = rawU8(life.c, count);
      const den = unpackField(life.d, count, 'u16', 65535);
      const stg = rawU8(life.s, count);
      for (let k = 0; k < count; k++) {
        const i = tiles[k];
        const c = cls[k] < map.length ? map[cls[k]] : Life.None;
        if (i >= TILE_COUNT) throw new SaveCorrupt('Lebensdaten beschädigt');
        if (stg[k] >= SUBSPECIES_PER_CLASS) throw new SaveCorrupt('Unterart ungültig');
        if (c === Life.None) continue; // a class this version no longer knows
        w.lifeDensity[i * LIFE_COUNT + c] = clamp(den[k], 0, 1);
        w.lifeStage[i * LIFE_COUNT + c] = stg[k];
      }

      const seen = raw.lifeFirstSeen;
      if (seen && typeof seen === 'object') {
        for (const [id, v] of Object.entries(seen as Record<string, unknown>)) {
          const c = LIFE_BY_ID.get(id);
          if (c !== undefined && typeof v === 'number' && Number.isFinite(v) && v >= 0) w.lifeFirstSeen[c] = v;
        }
      }
      w.sentientClass = LIFE_BY_ID.get(str(raw.sentient)) ?? Life.None;

      SaveSystem.readEvolution(raw.evolution, w);
      SaveSystem.readParams(raw.params, params);
      if ((raw.version as number) >= 9) SaveSystem.readDinoEra(raw.dinoEra, w);

      const geo = (raw.geo ?? {}) as Record<string, unknown>;
      const offsets = Array.isArray(geo.offsets) ? (geo.offsets as unknown[]) : [];
      return [0, 1, 2, 3].map((p) => {
        const v = offsets[p];
        return typeof v === 'number' && Number.isFinite(v) ? clamp(v, -1, 1) : 0;
      });
    }

    /**
     * The era's fate and the comet's target. Every fate but 'open' and
     * 'exempt' follows the first birds, so any other pairing is a damaged file.
     */
    private static readDinoEra(raw: unknown, w: WorldState): void {
      const src = (raw ?? {}) as Record<string, unknown>;
      const fate = DINO_FATES.find((f) => f === src.fate);
      if (!fate) throw new SaveCorrupt('Dinosaurier-Ära ist ungültig');
      const target = int(src.target, -1, TILE_COUNT - 1, 'Einschlagstelle');
      const birds = w.evo.isDeveloped('birds');
      if (fate !== 'exempt' && (fate === 'open') === birds) throw new SaveCorrupt('Dinosaurier-Ära ist widersprüchlich');
      w.dinoEra.fate = fate;
      w.dinoEra.target = target;
      // The strike's tick, which its winter runs from; files from before the winter have none.
      const struck = src.struck === undefined ? -1 : int(src.struck, -1, Number.MAX_SAFE_INTEGER, 'Kometeneinschlag');
      w.dinoEra.struck = fate === 'extinct' ? struck : -1;
      // The populations the comet left sheltered; only a struck planet has them.
      if (Array.isArray(src.refuges) && fate === 'extinct') {
        for (const e of src.refuges.slice(0, LIFE_COUNT * SUBSPECIES_PER_CLASS)) {
          const r = (e ?? {}) as Record<string, unknown>;
          const c = LIFE_BY_ID.get(str(r.c));
          if (c === undefined || c === Life.Dinosaur) throw new SaveCorrupt('Rückzugsbestand ist ungültig');
          w.dinoEra.refuges.push({
            tile: int(r.i, 0, TILE_COUNT - 1, 'Rückzugsbestand'), c,
            stage: int(r.s, 0, SUBSPECIES_PER_CLASS - 1, 'Rückzugsbestand'),
            since: int(r.t, 0, Number.MAX_SAFE_INTEGER, 'Rückzugsbestand'),
          });
        }
      }
      // Nothing the comet ended outlives it, whatever the file says (a planet struck before the
      // other lost sub-species joined the rule loses them now); nor is it sheltered.
      if (fate === 'extinct') {
        endCometLost(w);
        const kept = w.dinoEra.refuges.filter((r) => !cometLost(w, r.c, r.stage));
        w.dinoEra.refuges.length = 0;
        w.dinoEra.refuges.push(...kept);
      }
    }

    private static readEvolution(raw: unknown, w: WorldState): void {
      const evo = w.evo;
      evo.reset();
      if (!raw || typeof raw !== 'object') throw new SaveCorrupt('Evolutionsdaten fehlen');
      const src = raw as Record<string, unknown>;
      evo.ep = num(src.ep, 0, EP_MAX, 'Evolutionspunkte');
      const dev = src.developed;
      if (dev && typeof dev === 'object') {
        for (const [id, rec] of Object.entries(dev as Record<string, unknown>)) {
          if (!EVO_BY_ID.has(id)) continue; // a step this version does not know
          const r = (rec ?? {}) as Record<string, unknown>;
          evo.developed.set(id, {
            tick: typeof r.tick === 'number' && Number.isFinite(r.tick) ? r.tick : 0,
            years: typeof r.years === 'number' && Number.isFinite(r.years) ? r.years : 0,
            migrated: r.migrated === true || undefined,
            spontaneous: r.spontaneous === true || undefined,
          });
        }
      }
      // The tree must stay consistent: a developed step implies its lineage.
      for (const id of Array.from(evo.developed.keys())) {
        let p = evoNode(id).parent;
        while (p) {
          if (!evo.developed.has(p)) throw new SaveCorrupt('Evolutionsbaum ist widersprüchlich');
          p = evoNode(p).parent;
        }
      }
      if (Array.isArray(src.reported)) {
        for (const k of src.reported) if (typeof k === 'string') evo.reported.add(k.slice(0, 120));
      }
      if (Array.isArray(src.chronicle)) {
        const kinds: ChronicleKind[] = ['evolution', 'milestone', 'civ', 'extinction', 'info'];
        // Keep the newest entries: the chronicle only grows during play.
        for (const e of src.chronicle.slice(-2000)) {
          if (!e || typeof e !== 'object') continue;
          const r = e as Record<string, unknown>;
          const kind = kinds.indexOf(r.kind as ChronicleKind) >= 0 ? (r.kind as ChronicleKind) : 'info';
          const nodeId = typeof r.nodeId === 'string' && EVO_BY_ID.has(r.nodeId) ? r.nodeId : undefined;
          const icon = str(r.icon, 120);
          evo.chronicle.push({
            key: str(r.key, 120) || `restored:${evo.chronicle.length}`,
            kind, nodeId,
            title: str(r.title, 120), text: str(r.text), change: str(r.change),
            // Only our own asset paths: a save file is not allowed to point
            // the page at arbitrary URLs.
            icon: /^assets\/[a-z]+\/[A-Za-z0-9-]+\.svg$/.test(icon) ? icon : 'assets/events/milestone.svg',
            tick: typeof r.tick === 'number' && Number.isFinite(r.tick) ? r.tick : 0,
            years: typeof r.years === 'number' && Number.isFinite(r.years) ? r.years : 0,
            major: r.major === true,
            spontaneous: r.spontaneous === true || undefined,
            at: typeof r.at === 'number' && Number.isInteger(r.at) && r.at >= 0 && r.at < TILE_COUNT ? r.at : undefined,
            rip: r.rip === true || undefined,
            stage: typeof r.stage === 'number' && Number.isInteger(r.stage) && r.stage >= 0 && r.stage < SUBSPECIES_PER_CLASS ? r.stage : undefined,
          });
        }
      }
      // How long each step has stood ready; older saves simply start counting anew.
      const ready = src.ready;
      if (ready && typeof ready === 'object') {
        for (const [id, tick] of Object.entries(ready as Record<string, unknown>)) {
          if (!EVO_BY_ID.has(id) || evo.isDeveloped(id)) continue;
          if (typeof tick === 'number' && Number.isFinite(tick)) evo.readySince.set(id, Math.min(tick, w.ticks));
        }
      }
      // Older saves lack the list: every lineage with an extinction entry
      // counts as extinct; one alive again is cleared by the next check. An
      // entry about one sub-species (`stage`) leaves its group alive.
      const extinct = Array.isArray(src.extinct)
        ? src.extinct
        : evo.chronicle.filter((e) => e.kind === 'extinction' && e.stage === undefined).map((e) => e.nodeId);
      for (const id of extinct) if (typeof id === 'string' && evo.isDeveloped(id)) evo.extinct.add(id);
    }

    /* ------------------------------------------------------- version 4 -- */

    private static readV4(
      raw: Record<string, unknown>, w: WorldState, params: ModelParams, notes: string[],
    ): void {
      SaveSystem.readScalars(raw, w);
      const n = TILE_COUNT;
      const floats = (src: unknown, lo: number, hi: number, what: string): Float32Array => {
        if (!Array.isArray(src) || src.length !== n) throw new SaveCorrupt(`${what} fehlt oder ist unvollständig`);
        const out = new Float32Array(n);
        for (let i = 0; i < n; i++) out[i] = num(src[i], lo, hi, what);
        return out;
      };
      const bytes = (src: unknown, max: number, what: string): Uint8Array => {
        if (!Array.isArray(src) || src.length !== n) throw new SaveCorrupt(`${what} fehlt oder ist unvollständig`);
        const out = new Uint8Array(n);
        for (let i = 0; i < n; i++) out[i] = int(src[i], 0, max - 1, what);
        return out;
      };
      w.elevation.set(floats(raw.elevation, -1, 1, 'Höhe'));
      w.temperature.set(floats(raw.temperature, -200, 200, 'Temperatur'));
      w.moisture.set(floats(raw.moisture, 0, 1, 'Feuchte'));
      w.vegetation.set(floats(raw.vegetation, 0, 1, 'Vegetation'));
      w.cityPop.set(floats(raw.cityPop, 0, 1, 'Städte'));
      w.magma.set(floats(raw.magma, 0, 1, 'Magma'));
      w.uplift.set(floats(raw.uplift, 0, 1, 'Hebung'));
      w.biome.set(bytes(raw.biome, 10, 'Lebensraum'));
      w.tech.set(bytes(raw.tech, TECH_COUNT, 'Technologie'));

      const life = (raw.life ?? {}) as Record<string, unknown>;
      if (!Array.isArray(life.t) || !Array.isArray(life.c) || !Array.isArray(life.d) || !Array.isArray(life.s)) {
        throw new SaveCorrupt('Lebensdaten fehlen');
      }
      const t = life.t as unknown[];
      let carniferns = 0;
      for (let k = 0; k < t.length; k++) {
        const i = int(t[k], 0, TILE_COUNT - 1, 'Lebensdaten');
        const old = int((life.c as unknown[])[k], 1, 15, 'Lebensdaten');
        const d = num((life.d as unknown[])[k], 0, 1, 'Lebensdaten');
        const s = int((life.s as unknown[])[k], 0, OLD_STAGE_MAX, 'Lebensdaten');
        if (old === V4_CARNIFERN) {
          if (w.elevation[i] >= 0) { w.flora[i] |= floraBit(Flora.Carnivorous); carniferns++; }
          continue;
        }
        const c = LIFE_BY_ID.get(V4_LIFE[old] as string) as Life;
        w.lifeDensity[i * LIFE_COUNT + c] = d;
        w.lifeStage[i * LIFE_COUNT + c] = s;
      }
      if (Array.isArray(raw.lifeFirstSeen)) {
        (raw.lifeFirstSeen as unknown[]).forEach((v, old) => {
          const id = V4_LIFE[old];
          if (!id || typeof v !== 'number' || !Number.isFinite(v) || v < 0) return;
          w.lifeFirstSeen[LIFE_BY_ID.get(id) as Life] = v;
        });
      }
      const sentient = typeof raw.sentientClass === 'number' ? raw.sentientClass : 0;
      if (sentient === V4_CARNIFERN) {
        w.sentientClass = Life.Insect;
        notes.push('Die intelligenten Carniferns werden als intelligente Insekten weitergeführt.');
      } else {
        const id = V4_LIFE[int(sentient, 0, 15, 'Intelligente Art')];
        w.sentientClass = id ? (LIFE_BY_ID.get(id) as Life) : Life.None;
      }
      if (t.some((_, k) => (life.c as unknown[])[k] === 8)) {
        notes.push('Trichordaten (eine erfundene Linie des Originals) leben als Landgliederfüßer weiter.');
      }
      if (carniferns > 0) notes.push('Carniferns sind jetzt fleischfressende Pflanzen in ihren Mooren.');
      SaveSystem.readParams(raw.params, params);
    }

    /**
     * Turn a version-4 planet into a consistent version-5 one.
     *
     * Version 4 had no tree, one undifferentiated plant field and evolution
     * by chance. What existed is taken as developed, with every ancestor of
     * it; plant groups are inferred from what the land looked like; and all
     * of it is entered in the chronicle as already reported, so loading an
     * old planet does not bury the player in thirty congratulations.
     */
    private static migrateV4(
      w: WorldState, params: ModelParams, life: LifeSystem, flora: FloraSystem,
      raw: Record<string, unknown>, notes: string[],
    ): void {
      const dev = new Set<string>();
      const add = (id: string): void => {
        let p: string | null = id;
        while (p && !dev.has(p)) { dev.add(p); p = evoNode(p).parent; }
      };

      w.refreshDerived();
      for (let c = 1; c < LIFE_COUNT; c++) {
        if (w.lifeCounts[c] > 0 || w.lifeFirstSeen[c] >= 0) add(LIFE[c as Life].id);
      }
      let landVeg = 0;
      for (let i = 0; i < TILE_COUNT; i++) if (w.elevation[i] >= 0 && w.vegetation[i] > 0.05) landVeg++;
      const woody = w.biomeCounts[Biome.Forest] + w.biomeCounts[Biome.Jungle] + w.biomeCounts[Biome.Boreal];
      if (landVeg > 0) {
        ['marineAlgae', 'freshwaterAlgae', 'landPlants', 'mosses', 'vascular', 'ferns', 'clubmosses'].forEach(add);
      }
      if (woody > 0) {
        ['firstTrees', 'seedPlants', 'conifers', 'flowering', 'broadleaf', 'grasses'].forEach(add);
      }
      let carnivorous = 0;
      for (let i = 0; i < TILE_COUNT; i++) if (w.flora[i] & floraBit(Flora.Carnivorous)) carnivorous++;
      if (carnivorous > 0) add('carnivorous');

      // Plant groups onto the land that had plants, wherever each can grow.
      flora.prepare(w, params, true);
      for (let i = 0; i < TILE_COUNT; i++) {
        for (const id of dev) {
          const n = evoNode(id);
          if (n.flora === undefined) continue;
          const s = flora.suit(w, n.flora, i);
          const water = w.elevation[i] < 0;
          if (water ? s >= 0.3 : (w.vegetation[i] > 0.05 && s >= 0.15)) w.flora[i] |= 1 << n.flora;
        }
        if (w.elevation[i] < 0 && (w.flora[i] & floraBit(Flora.MarineAlgae))) {
          w.vegetation[i] = Math.max(w.vegetation[i], 0.3);
        }
      }

      const evo = w.evo;
      evo.reset();
      evo.ep = 0;
      for (const id of EVO_NODES.map((n) => n.id)) {
        if (!dev.has(id)) continue;
        evo.developed.set(id, { tick: w.ticks, years: w.absoluteYears, migrated: true });
        const n = evoNode(id);
        const key = `evo:${id}`;
        evo.chronicle.push({
          key, kind: 'evolution', nodeId: id, title: n.event.title,
          text: n.event.text, change: n.event.change, icon: evoIcon(id),
          tick: w.ticks, years: w.absoluteYears, major: false,
        });
        evo.reported.add(key);
      }

      // Ancestors the old model never had (the worms, for instance) get
      // their founders now, so the tree is not full of empty lineages.
      w.refreshDerived();
      // Founders are placed by habitat, so the landscapes must exist first.
      SaveSystem.migrateV6(w);
      BiomeSystem.step(w, false);
      const sea = seaFromAir(w.o2);
      w.oceanIron = sea.iron;
      w.oceanO2 = sea.oxygen;
      life.prepare(w, params, true);
      const evoSys = new EvolutionSystem(life, flora);
      // In tree order, ancestors first: a founder needs its parent alive
      // next to it, so the worms cannot be placed before the sponges are.
      for (const n of EVO_NODES) {
        if (!dev.has(n.id) || evoSys.presence(w, n) > 0) continue;
        const sites = evoSys.foundingSites(w, params, n, 12);
        for (const i of sites.slice(0, 4)) {
          if (n.life !== undefined) LifeSystem.seed(w, n.life, i % GRID_W, (i / GRID_W) | 0);
          else if (n.flora !== undefined) flora.plant(w, n.flora, i, 0.6);
        }
        if (sites.length === 0) evo.extinct.add(n.id);
        else w.refreshDerived();
      }
      w.refreshDerived();

      notes.unshift(`Spielstand aus Version 4 übernommen: ${dev.size} Entwicklungen wurden aus dem vorhandenen Leben abgeleitet.`);
      const key = 'migration:v4';
      evo.chronicle.push({
        key, kind: 'info', title: 'Älterer Spielstand übernommen',
        text: notes.join(' '),
        change: 'Der Evolutionsbaum zeigt alle abgeleiteten Entwicklungen. Neue Schritte kosten ab jetzt Evolutionspunkte.',
        icon: 'assets/events/saved.svg', tick: w.ticks, years: w.absoluteYears, major: false,
      });
      void raw;
    }

    /* ------------------------------------------------------- version 5 -- */

    /**
     * Turn a version-5 planet (or a migrated version-4 one) into a version-6
     * one. The sub-species ladder grew from three rungs to eight: each stage
     * keeps its relative height on it. The sea had no chemistry of its own;
     * its iron and oxygen are read off the air (`seaFromAir`).
     *
     * Time ran on the old scale (half a million years a tick until the first
     * life, ten thousand after), so the planet is re-dated on the Earth
     * calendar: whatever kept its tick by that tick, the rest by its share of
     * the old planet age. Returns that share mapping for the history graph.
     */
    private static migrateV5(w: WorldState): (oldYears: number) => number {
      const oldAge = w.absoluteYears;
      const ticks = w.ticks;
      const redate = (years: number): number =>
        ageAtTick(oldAge > 0 ? Math.round(ticks * clamp(years / oldAge, 0, 1)) : 0);
      w.absoluteYears = ageAtTick(ticks);
      for (let c = 0; c < LIFE_COUNT; c++) {
        if (w.lifeFirstSeen[c] >= 0) w.lifeFirstSeen[c] = redate(w.lifeFirstSeen[c]);
      }
      for (const [id, rec] of w.evo.developed) w.evo.developed.set(id, { ...rec, years: ageAtTick(rec.tick) });
      w.evo.chronicle.forEach((e, k) => { w.evo.chronicle[k] = { ...e, years: ageAtTick(e.tick) }; });

      const last = SUBSPECIES_PER_CLASS - 1;
      for (let i = 0; i < w.lifeStage.length; i++) {
        const s = w.lifeStage[i];
        if (s > 0) w.lifeStage[i] = Math.min(last, Math.round((s * last) / OLD_STAGE_MAX));
      }

      const sea = seaFromAir(w.o2);
      w.oceanIron = sea.iron;
      w.oceanO2 = sea.oxygen;
      // Milestones the planet had already passed are history, not news.
      for (const e of oxygenMilestones(w)) {
        w.evo.chronicle.push(e);
        w.evo.reported.add(e.key);
      }
      return redate;
    }

    /* ------------------------------------------------------- version 6 -- */

    /**
     * Give a planet from before format 7 its landscapes. Soil is estimated
     * from the plant cover, full for rooted (vascular) plants and a crust for
     * mosses alone; every land tile is then marked unstarted, so the first
     * biome pass puts it straight at its target — a warm start, no hold.
     */
    private static migrateV6(w: WorldState): void {
      const crust = floraBit(Flora.LandPlants) | floraBit(Flora.Mosses);
      for (let i = 0; i < TILE_COUNT; i++) {
        w.landscapeNext[i] = LANDSCAPE_UNSET;
        w.landscapeHold[i] = 0;
        w.landscapeZone[i] = ZONE_NONE;
        if (w.elevation[i] < 0) { w.soil[i] = 0; continue; }
        const f = w.flora[i];
        const cap = (f & VASCULAR_FLORA_MASK) ? 1 : (f & crust) ? SOIL_CRUST_MAX : 0;
        w.soil[i] = Math.round(clamp(w.vegetation[i] * SOIL_ROOT_FACTOR, 0, cap) * 255);
      }
    }

    /* ------------------------------------------------------- version 7 -- */

    /**
     * Give a planet from before format 8 the mountain type of its belts, and
     * the regolith its age has weathered out of bare rock (rock rule).
     */
    private static migrateV7(w: WorldState): void {
      classifyBelts(w);
      seedRegolith(w);
    }

    /* ------------------------------------------------------- version 8 -- */

    /**
     * Bring a planet from before format 9 into the dinosaurs' era. The
     * dinosaur ladder was rebuilt (V8_DINO_STAGE, V8_DINO_ENTRY): populations
     * move to their new stage; the lexicon keeps only entries of the same
     * animal, the rest are dropped rather than renamed. A planet whose
     * mammals already went past the marsupials, or that has whales or
     * grazers, keeps the freedom it had (exempt); every other one follows the
     * new rule, and one that already has birds is asked about the comet.
     * Returns the lexicon field to load.
     */
    private static migrateV8(w: WorldState, fauna: unknown, notes: string[]): unknown {
      const L = LIFE_COUNT;
      let lateMammals = false;
      for (let i = 0; i < TILE_COUNT; i++) {
        const k = i * L + Life.Dinosaur;
        w.lifeStage[k] = V8_DINO_STAGE[w.lifeStage[k]] ?? 0;
        const m = i * L + Life.Mammal;
        if (w.lifeDensity[m] > 0 && w.lifeStage[m] > MAMMAL_STAGE_BEFORE_COMET) lateMammals = true;
      }

      let out = fauna;
      if (fauna && typeof fauna === 'object' && !Array.isArray(fauna)) {
        const f = fauna as Record<string, unknown>;
        const entries = f.entries && typeof f.entries === 'object' ? { ...(f.entries as Record<string, unknown>) } : null;
        if (entries) {
          const mammals = entries[LIFE[Life.Mammal].id];
          if (Array.isArray(mammals) && mammals.slice(MAMMAL_STAGE_BEFORE_COMET + 1).some((e) => e)) lateMammals = true;
          const dinos = entries[LIFE[Life.Dinosaur].id];
          if (Array.isArray(dinos)) {
            const row: unknown[] = new Array(SUBSPECIES_PER_CLASS).fill(null);
            let dropped = 0;
            dinos.slice(0, SUBSPECIES_PER_CLASS).forEach((e, s) => {
              if (!e) return;
              const to = V8_DINO_ENTRY[s];
              if (to === null) dropped++;
              else row[to] = e;
            });
            while (row.length > 0 && row[row.length - 1] === null) row.pop();
            entries[LIFE[Life.Dinosaur].id] = row;
            if (dropped > 0) {
              notes.push('Die Dinosaurier-Reihe endet jetzt mit den Vogelvorläufern. Ankylosaurier, Entenschnabel-, Horn- und Tyrannosaurier sind keine eigenen Unterarten mehr, sondern erscheinen auf der Karte in passenden Lebensräumen; ihre Lexikoneinträge entfallen.');
            }
          }
          out = { ...f, entries };
        }
      }

      const evo = w.evo;
      if (lateMammals || evo.isDeveloped('whales') || evo.isDeveloped('grazers')) {
        w.dinoEra.fate = 'exempt';
        notes.push('Auf diesem Planeten hatten sich Säugetiere schon über die Beuteltiere hinaus entwickelt: Die Regel zur Dinosaurier-Ära gilt hier nicht.');
      } else if (evo.isDeveloped('birds')) {
        w.dinoEra.fate = 'deciding';
        notes.push('Die ersten Vögel sind schon entstanden: Entscheide über das Schicksal der Dinosaurier.');
      } else {
        w.dinoEra.fate = 'open';
      }
      w.dinoEra.target = -1;
      return out;
    }
  }
}
