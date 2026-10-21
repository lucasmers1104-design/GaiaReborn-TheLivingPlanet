/* =============================================================================
 * SimEarth 2.0 — wandering groups and the figures of thinking non-humans
 * -----------------------------------------------------------------------------
 * A wandering group (band) before anyone settles: for humans two Stone Age
 * people walking one behind the other, for every other thinking class its own creature,
 * a little smaller, with a torch on a pole behind it, so the group never
 * reads as a plain herd icon. Non-human settlers walk the same way with a
 * bundle and their tribe's pennant on the pole instead of the torch.
 * 32 × 32 art facing right, outline and shadow from artdraw.ts.
 * Style: docs/oekosystem-2026-10/grafikstil.md. Pure data, Node-safe.
 * ========================================================================== */

namespace SE {
  /** Two Stone Age people walking apart: a spear carrier ahead, one with a bundle on the back behind. */
  export function humanBandArt(): Art {
    return [
      // behind: the bundle carrier
      { f: 'cream', d: artEllipse(4.6, 13.8, 2.9, 3.7) },
      { f: 'bone', d: 'M4.6 10.1 C6.2 10.1 7.5 11.8 7.5 13.8 C7.5 15.8 6.2 17.5 4.6 17.5 Z', o: 0.8 },
      { s: 'furDark', w: 2.6, d: 'M6.8 21 L4.2 28.4' },
      { s: 'tan', w: 2.6, d: 'M9.4 21 L12 28.4' },
      { f: 'furLight', d: 'M6.4 11.6 C7.2 10.8 9.6 10.8 10.4 11.6 L11.4 20.8 C9.8 21.6 6.4 21.6 4.8 20.8 Z' },
      { s: 'bark', w: 1.6, d: 'M6.8 11.8 L5.8 17' },
      { s: 'tan', w: 2.2, d: 'M10 12.8 L12.4 17.2' },
      { f: 'tan', d: artCircle(8.6, 7.9, 2.7) },
      { f: 'furDark', d: 'M5.9 7.6 C5.9 5.4 7.6 4.7 9.2 5 C10.2 5.2 10.8 5.7 11 6.3 C9.4 6.1 7.6 6.6 5.9 7.6 Z' },
      // ahead: the spear carrier
      { s: 'bark', w: 1.8, d: 'M28.4 4.8 L27.2 27.4' },
      { f: 'greyDark', d: 'M28.8 1.6 L27.2 5.4 L29.8 5.6 Z' },
      { s: 'furDark', w: 2.8, d: 'M20.2 20.6 L17.4 28.4' },
      { s: 'tan', w: 2.8, d: 'M23 20.6 L25.6 28.4' },
      { f: 'fur', d: 'M20 10.8 C20.8 10 23.2 10 24 10.8 L25 20.4 C23.4 21.2 20 21.2 18.4 20.4 Z' },
      { f: 'furDark', d: 'M22.4 10.2 C23.1 10.3 23.7 10.5 24 10.8 L25 20.4 C24.4 20.7 23.6 20.9 22.8 21 Z', o: 0.55 },
      { s: 'tan', w: 2.2, d: 'M23.4 12.4 L27.4 15' },
      { f: 'tan', d: artCircle(22, 6.7, 2.7) },
      { f: 'furDark', d: 'M19.3 6.4 C19.3 4.2 21 3.5 22.6 3.8 C23.6 4 24.2 4.5 24.4 5.1 C22.8 4.9 21 5.4 19.3 6.4 Z' },
      { f: 'ink', d: artCircle(23.6, 6.7, 0.7) },
    ];
  }

  /** Path data `d` shrunk by `k` towards (ax, ay); arc radii scale, arc flags and rotation stay. */
  function shrinkPath(d: string, k: number, ax: number, ay: number): string {
    const out: string[] = [];
    let cmd = '';
    let arg = 0;
    const x = (v: number): number => ax + (v - ax) * k;
    const y = (v: number): number => ay + (v - ay) * k;
    for (const t of d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? []) {
      if (/[A-Za-z]/.test(t)) {
        cmd = t;
        arg = 0;
        out.push(t);
        continue;
      }
      const v = Number(t);
      const j = cmd === 'A' ? arg % 7 : arg % 2;
      const r = cmd === 'H' ? x(v) : cmd === 'V' ? y(v)
        : cmd === 'A' ? (j < 2 ? v * k : j < 5 ? v : j === 5 ? x(v) : y(v))
          : j === 0 ? x(v) : y(v);
      arg++;
      out.push(String(Math.round(r * 100) / 100));
    }
    return out.join(' ');
  }

  /** Where a thinking creature stands, shrunk towards its feet and right side to leave room for the pole. */
  const THINKER_SCALE = 0.8;
  const THINKER_ANCHOR_X = 30;
  const THINKER_ANCHOR_Y = 29;

  /**
   * A thinking non-human's figure: its own `creature`, a little smaller,
   * with a pole behind it that carries a torch (a band, `flag` null) or a
   * bundle and the tribe pennant in `flag` (settlers). Lines keep their
   * width, so they stay as legible as the creature's own.
   */
  export function thinkerArt(creature: Art, flag: PaletteKey | null): Art {
    const pole: Art = flag
      ? [
        { s: 'bark', w: 2, d: 'M9.6 26 L6.6 3.4' },
        { f: flag, d: 'M6.8 3.2 L1.8 5.6 L7.6 8.6 Z' },
        { f: 'cream', d: artEllipse(5.4, 12.6, 3, 3.4) },
        { s: 'bark', w: 1.6, d: 'M3 11.4 L8 10.6' },
      ]
      : [
        { s: 'bark', w: 2, d: 'M9.6 26 L6.2 6.6' },
        { f: 'orange', d: 'M5.6 1.8 C8 4 8.6 6.4 7.2 7.8 C6.2 8.8 4.6 8.6 3.9 7.4 C3 5.8 3.6 3.8 5.6 1.8 Z' },
        { f: 'yellow', d: artEllipse(5.8, 6.4, 1.3, 1.5) },
      ];
    const body = creature.map((s): ArtShape => ({ ...s, d: shrinkPath(s.d, THINKER_SCALE, THINKER_ANCHOR_X, THINKER_ANCHOR_Y) }));
    return [...pole, ...body];
  }

  /** The figure of a wandering group of thinking class `c`, non-humans at sub-species `stage`. */
  export function bandArt(c: Life, stage: number): Art {
    const creature = SPECIES[c]?.stages[clamp(stage, 0, SUBSPECIES_PER_CLASS - 1)]?.art;
    return c === Life.Mammal || !creature ? humanBandArt() : thinkerArt(creature, null);
  }
}
