/* =============================================================================
 * SimEarth 2.0 — species art: Schwämme & Nesseltiere (earlyAnimals)
 * -----------------------------------------------------------------------------
 * From the first sponges to reef corals: sessile forms stand on the sea floor
 * (y ≈ 29), jellies drift mid-box with bells opaque enough (o ≥ 0.5) to keep
 * the ink outline; one flat colour per part, the right side shaded.
 * ========================================================================== */

namespace SE {
  /** A tentacle, stalk or branch as a round-capped line. */
  const line = (s: PaletteKey, w: number, d: string): ArtStroke => ({ s, w, d });
  const r = (v: number): number => Math.round(v * 10) / 10;

  /**
   * One comb row of a ctenophore, bowing `bow` units sideways at the equator,
   * in three coloured stretches that stop short of the poles.
   */
  function combRow(bow: number, top: number, bottom: number): Art {
    const at = (t: number): string => `${r(16 + 4 * bow * t * (1 - t))} ${r(top + (bottom - top) * t)}`;
    const span = (t0: number, t1: number): string => {
      const pts: string[] = [];
      for (let k = 0; k <= 4; k++) pts.push(at(t0 + ((t1 - t0) * k) / 4));
      return `M${pts.join(' L')}`;
    };
    return [
      line('pink', 1.8, span(0.17, 0.39)),
      line('gold', 1.8, span(0.39, 0.61)),
      line('mint', 1.8, span(0.61, 0.83)),
    ];
  }

  SPECIES[Life.Radiate] = {
    stages: [
      // 1 · Schwämme — vor 600 Mio. J. (Porifera; sponge biomarkers >=635 Ma debated, fossils
      //   Ediacaran to Cambrian). An upright barrel with a wide opening on top, dotted with pores,
      //   water bubbling out of the opening. Farben: ochre-yellow body, darker pores.
      {
        name: 'Schwämme', ma: 600, art: [
          { f: 'cyan', d: artCircle(13.4, 4, 1.7) },
          { f: 'cyan', d: artCircle(19.4, 5, 1.2) },
          { f: 'gold', d: 'M10.5 29.5 C8 25.5 5.6 18 7.5 11.5 L24.5 11.5 C26.4 18 24 25.5 21.5 29.5 Z' },
          { f: 'kelp', d: 'M16 11.5 L24.5 11.5 C26.4 18 24 25.5 21.5 29.5 L16 29.5 Z', o: 0.5 },
          { f: 'yellow', d: artEllipse(16, 11.5, 8.5, 2.8) },
          { f: 'kelp', d: artEllipse(16, 11.7, 6.2, 1.7) },
          { f: 'kelp', d: artCircle(11, 15.6, 1.15) },
          { f: 'kelp', d: artCircle(16, 16.6, 1.15) },
          { f: 'kelp', d: artCircle(21, 15.6, 1.15) },
          { f: 'kelp', d: artCircle(13.2, 21.4, 1.15) },
          { f: 'kelp', d: artCircle(18.8, 21.4, 1.15) },
          { f: 'kelp', d: artCircle(16, 26.2, 1.15) },
        ],
      },
      // 2 · Ediacara-Wedel — vor 571 Mio. J. (Rangeomorph fronds, Charnia; Mistaken Point ~571-565
      //   Ma). An upright feather-like frond on a short stalk with a round holdfast disc, the frond
      //   split into side branches. Farben: pale salmon/pink-beige, darker branch lines.
      {
        name: 'Ediacara-Wedel', ma: 571, art: [
          { f: 'shell', d: artEllipse(15.5, 27.2, 5.5, 2.4) },
          line('shell', 2.6, 'M16 21 L15.5 26.5'),
          { f: 'blossom', d: 'M16 22.5 C10.5 21 8 15 9.5 9.5 C10.5 6 13.8 3.2 17.2 2 C20 4.8 23 8.5 23 13.2 C23 17.8 20.5 21 16 22.5 Z' },
          { f: 'coral', d: 'M17.2 2 C20 4.8 23 8.5 23 13.2 C23 17.8 20.5 21 16 22.5 C15.6 15 16 8 17.2 2 Z', o: 0.5 },
          line('shell', 1.6, 'M16 21 C15.8 14 16.1 9 16.9 4.5'),
          line('shell', 1.6, 'M16 19 L11.6 16'),
          line('shell', 1.6, 'M16 15 L11.2 11.8'),
          line('shell', 1.6, 'M16.2 11 L12.8 7.8'),
          line('shell', 1.6, 'M16 19 L20.6 16'),
          line('shell', 1.6, 'M16 15 L21 11.8'),
          line('shell', 1.6, 'M16.4 11 L19.8 8'),
        ],
      },
      // 3 · Dickinsonien — vor 558 Mio. J. (Dickinsonia (~558 Ma), an animal confirmed by
      //   cholesterol biomarkers (Bobrovskiy et al. 2018, Science)). Top view (flat organism): an
      //   oval quilt with a midline and paired segments, lying on a microbial mat. Farben: tan
      //   body, brown segment lines, green-grey mat.
      {
        name: 'Dickinsonien', ma: 558, art: [
          { f: 'olive', d: 'M1.8 21.5 C1.5 18 4 16 7 16.5 L25 16.5 C27.5 15.5 30.5 18 29.8 21.5 C30.6 24.5 29 28 26 27.6 C24 29.2 21 28.8 19.5 28 C17 29.4 14 29.3 12.5 28.2 C10 29.4 6.5 29 5.5 27.5 C2.5 27.8 1.2 24.5 1.8 21.5 Z' },
          { f: 'tan', d: artEllipse(16, 15.5, 12.5, 8) },
          { f: 'fur', d: 'M3.5 15.5 L28.5 15.5 A12.5 8 0 0 1 3.5 15.5 Z', o: 0.5 },
          line('furDark', 1.6, 'M5 15.5 L27 15.5'),
          line('furDark', 1.6, 'M6.2 11.2 Q8.4 13.4 8.4 15.5 Q8.4 17.6 6.2 19.8'),
          line('furDark', 1.6, 'M9.4 9.3 Q11.8 12.4 11.8 15.5 Q11.8 18.6 9.4 21.7'),
          line('furDark', 1.6, 'M13 8.6 Q15.2 12 15.2 15.5 Q15.2 19 13 22.4'),
          line('furDark', 1.6, 'M16.8 8.5 Q18.6 12 18.6 15.5 Q18.6 19 16.8 22.5'),
          line('furDark', 1.6, 'M20.6 9 Q22 12.2 22 15.5 Q22 18.8 20.6 22'),
          line('furDark', 1.6, 'M24.2 10.4 Q25.2 13 25.2 15.5 Q25.2 18 24.2 20.6'),
        ],
      },
      // 4 · Becherschwämme — vor 525 Mio. J. (Archaeocyatha, the first animal reef builders, early
      //   Cambrian ~525 Ma). A cluster of three ribbed, double-walled cones (like ice-cream cones)
      //   joined at the base by holdfasts. Farben: cream-white cups, grey ribs.
      {
        name: 'Becherschwämme', ma: 525, art: [
          { f: 'grey', d: 'M8 29.5 C10 26.5 13 25 16 25 C19 25 22 26.5 24 29.5 Z' },
          { f: 'cream', d: 'M2.5 13 C3.5 19 8.5 23.5 12.5 26.5 C12.2 21 10.6 16.5 9.5 13 Z' },
          { f: 'cream', d: 'M22.5 13 C21.4 16.5 19.8 21 19.5 26.5 C23.5 23.5 28.5 19 29.5 13 Z' },
          { f: 'cream', d: 'M12.2 7.5 C12.4 14 14 21 16 26 C18 21 19.6 14 19.8 7.5 Z' },
          { f: 'grey', d: 'M16 7.5 L19.8 7.5 C19.6 14 18 21 16 26 Z', o: 0.5 },
          { f: 'grey', d: 'M26 13 L29.5 13 C28.5 19 23.5 23.5 19.5 26.5 Z', o: 0.5 },
          line('grey', 1.6, 'M5.5 15 L10.5 23'),
          line('grey', 1.6, 'M14.2 9.5 L15.3 21.5'),
          line('grey', 1.6, 'M24.5 15.2 L22.5 22'),
          { f: 'cream', d: artEllipse(6, 13, 3.5, 1.6) },
          { f: 'greyDark', d: artEllipse(6, 13.1, 2, 0.9) },
          { f: 'cream', d: artEllipse(16, 7.5, 3.8, 1.7) },
          { f: 'greyDark', d: artEllipse(16, 7.6, 2.2, 1) },
          { f: 'cream', d: artEllipse(26, 13, 3.5, 1.6) },
          { f: 'greyDark', d: artEllipse(26, 13.1, 2, 0.9) },
        ],
      },
      // 5 · Rippenquallen — vor 518 Mio. J. (Ctenophora, Chengjiang biota ~518 Ma). An upright
      //   oval translucent body with 4 rainbow comb rows running top to bottom and two trailing
      //   tentacles. Farben: glassy clear-white body, rainbow comb rows.
      {
        name: 'Rippenquallen', ma: 518, art: [
          line('pink', 1.8, 'M9 15.5 C4.5 17 2.5 21 3.6 25 C4.6 28 8 28.8 9.4 26.6'),
          line('pink', 1.8, 'M23 15.5 C27.5 17.5 29.2 22 28 25.6 C27 28.6 23.6 29 22.4 27'),
          { f: 'white', d: artEllipse(16, 13, 7.5, 10), o: 0.7 },
          { f: 'mint', d: 'M16 3 A7.5 10 0 0 1 16 23 C21 19.5 21.5 7 16 3 Z', o: 0.55 },
          ...combRow(-5.6, 3.6, 22.4),
          ...combRow(-2.3, 3.6, 22.4),
          ...combRow(2.3, 3.6, 22.4),
          ...combRow(5.6, 3.6, 22.4),
        ],
      },
      // 6 · Quallen — vor 505 Mio. J. (Medusozoa; Burgessomedusa phasmiformis, Burgess Shale ~505
      //   Ma (Moon et al. 2023, Proc. R. Soc. B)). A dome-shaped bell with a scalloped rim and long
      //   trailing tentacles, drifting. Farben: translucent lilac bell, pink tentacles.
      {
        name: 'Quallen', ma: 505, art: [
          line('pink', 1.8, 'M6.5 15.5 C5.5 20 8.5 23 6 29'),
          line('pink', 1.8, 'M25.5 15.5 C26.5 20 23.5 23 26 29'),
          line('pink', 1.8, 'M11 16 C10 21 13 24 11 28'),
          line('pink', 1.8, 'M21 16 C22 21 19 24 21 28'),
          line('pink', 2.8, 'M16 15 C14 19.5 18 22 16 26'),
          { f: 'violet', d: 'M4.5 15 C4.5 7.5 9.5 3 16 3 C22.5 3 27.5 7.5 27.5 15 Q25.2 19 22.9 15 Q20.6 19 18.3 15 Q16 19 13.7 15 Q11.4 19 9.1 15 Q6.8 19 4.5 15 Z', o: 0.8 },
          { f: 'blossom', d: 'M7.5 11 C8 7.5 11 5 15 4.8 C11.5 6.5 9.5 8.5 8.8 11.5 Z', o: 0.7 },
        ],
      },
      // 7 · Runzelkorallen — vor 460 Mio. J. (Rugose corals (Rugosa), Middle Ordovician ~460 Ma to
      //   end-Permian). A single curved horn-shaped cup with growth wrinkles standing on its tip, a
      //   crown of short tentacles at the top opening. Farben: grey-brown horn, orange tentacles.
      {
        name: 'Runzelkorallen', ma: 460, reefBuilder: 'rugose', art: [
          line('orange', 2.2, 'M11 9 L7.5 4.5'),
          line('orange', 2.2, 'M13.5 8 L12 3'),
          line('orange', 2.2, 'M16 7.5 L16.5 2.5'),
          line('orange', 2.2, 'M18.5 8 L21 3'),
          line('orange', 2.2, 'M21 9 L25 5'),
          { f: 'grey', d: 'M12 29.5 C7.5 26 6 17 8.5 9.5 L23.5 9.5 C22.5 17 17 24 12 29.5 Z' },
          { f: 'kelp', d: 'M16 9.5 L23.5 9.5 C22.5 17 17 24 12 29.5 C14 23 15.5 16 16 9.5 Z', o: 0.5 },
          line('kelp', 1.6, 'M8 14.5 Q15 17.2 22 14.2'),
          line('kelp', 1.6, 'M7.8 19.8 Q13.5 22 19.3 19.2'),
          line('kelp', 1.6, 'M9.2 24.6 Q12.8 26 15.6 24'),
          { f: 'bone', d: artEllipse(16, 9.5, 7.5, 2.6) },
          { f: 'kelp', d: artEllipse(16, 9.6, 5.4, 1.6) },
        ],
      },
      // 8 · Steinkorallen — vor 240 Mio. J. (Scleractinia, from Middle Triassic ~240 Ma; today's
      //   reef builders). A branching staghorn colony like antlers, pale polyp tips. Farben: coral
      //   orange/pink branches, pale tips.
      {
        name: 'Steinkorallen', ma: 240, reefBuilder: 'stony', art: [
          line('shell', 2.8, 'M16 22 L16.5 12 L14.5 4.5'),
          line('coral', 3.4, 'M16 29.5 L16 21.5'),
          line('coral', 2.8, 'M16 22 L9.5 15.5 L7 5'),
          line('coral', 2.6, 'M9.5 15.5 L3 13'),
          line('shell', 2.8, 'M16 22 L22.5 15.5 L25 5'),
          line('shell', 2.6, 'M22.5 15.5 L29 13'),
          { f: 'cream', d: artCircle(7, 5, 1.6) },
          { f: 'cream', d: artCircle(3, 13, 1.5) },
          { f: 'cream', d: artCircle(14.5, 4.5, 1.6) },
          { f: 'cream', d: artCircle(25, 5, 1.6) },
          { f: 'cream', d: artCircle(29, 13, 1.5) },
        ],
      },
    ],
    specialists: [
      // Staatsquallen — Hochsee, ab Unterart 6 (Physalia physalis (Portuguese man o' war,
      //   Siphonophorae); no fossils, medusozoans from ~505 Ma). A floating gas bladder with a
      //   crest-like sail on top and long tentacles hanging below. Farben: blue-violet float with
      //   pink sail edge, deep blue tentacles.
      {
        name: 'Staatsquallen', biome: Biome.Ocean, minStage: 5, art: [
          line('blue', 1.8, 'M9 19 C7.5 22.5 10 25.5 8 29.5'),
          line('blue', 1.8, 'M14.5 20 C13.5 23.5 16 26 14.5 29.2'),
          line('blue', 1.8, 'M19.5 19 C19.5 22 22 24 20.8 27'),
          { f: 'blue', d: 'M7 18 C6.5 21 8.5 22.5 10.5 21.5 C11.5 23.5 14.5 23.5 15.5 21.5 C17 22.5 19.5 21.5 20 18.5 Z' },
          { f: 'pink', d: 'M7 13.5 C7.5 10 9.5 8.2 11.5 8 Q12.8 6 14.5 6.5 Q16.2 4.2 18 5 Q19.8 2.6 21.6 3.6 Q23.6 2 24.6 4 L25 10.5 Z' },
          { f: 'violet', d: 'M10 12.5 C12.5 10.5 17.5 8.5 23.8 6.5 L24.5 10 Z', o: 0.55 },
          { f: 'sky', d: 'M3.5 16.5 C3 14 6 12.5 10 12.5 C15 12.5 19 11 22.5 8.5 C25 6.8 28.5 7 29 9.5 C29.5 12.5 27 15.5 23 17.2 C18 19.3 10 19.5 6 18.6 C4.6 18.2 3.6 17.5 3.5 16.5 Z' },
          { f: 'violet', d: 'M4 17.5 C10 17.8 20 16.5 28.6 11.5 C28 14 26 16 23 17.2 C18 19.3 10 19.5 6 18.6 Z', o: 0.55 },
        ],
      },
      // Löwenmähnenquallen — Eis, ab Unterart 6 (Cyanea capillata, the largest jellyfish, cold
      //   northern seas). A broad flattened bell with a huge mane of hair-thin tentacles. Farben:
      //   red-orange to brown bell, yellow-orange mane.
      {
        name: 'Löwenmähnenquallen', biome: Biome.Arctic, minStage: 5, art: [
          { f: 'gold', d: 'M5 11.5 L27 11.5 C28 15 27.5 19 25.5 22.5 C24.5 24 25 25.5 24 26 C22.5 24.5 21.5 25.5 20.5 27.5 C19.5 25.5 18 25.5 16.5 28.5 C15.5 26 14 26 12.5 29.5 C11.5 26.5 9.5 26.5 8 29.5 C7 27 5 27.5 3.5 29.2 C3.8 23 3.2 17 5 11.5 Z' },
          line('orange', 1.6, 'M8.5 13 C7.5 17 9.5 21 8 26'),
          line('orange', 1.6, 'M12.5 13 C11.5 17 13.5 21 12.2 26.5'),
          line('orange', 1.6, 'M16.5 13 C15.5 17 17.5 21 16.4 25.5'),
          line('orange', 1.6, 'M20.5 13 C19.5 17 21.5 20.5 20.4 24'),
          line('orange', 1.6, 'M24 13 C23.5 16 24.5 18.5 23.6 21.5'),
          { f: 'rust', d: 'M3 12.5 C3 6.5 9 3.5 16 3.5 C23 3.5 29 6.5 29 12.5 Q26.8 15.5 24.7 12.5 Q22.5 15.5 20.3 12.5 Q18.2 15.5 16 12.5 Q13.8 15.5 11.7 12.5 Q9.5 15.5 7.3 12.5 Q5.2 15.5 3 12.5 Z' },
          { f: 'orange', d: 'M6 9.5 C7 6.5 10.5 5 15 4.8 C11 6.3 8.5 8 7.6 10.2 Z' },
        ],
      },
    ],
  };
}
