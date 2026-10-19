/* =============================================================================
 * SimEarth 2.0 — species art: Fische (fish)
 * -----------------------------------------------------------------------------
 * Reference set for the swimmers (see docs/oekosystem-2026-10/grafikstil.md):
 * side views facing right around y ≈ 16, fins as separate flat shapes in a
 * darker or contrasting tone, the outline left to the renderer.
 * ========================================================================== */

namespace SE {
  SPECIES[Life.Fish] = {
    stages: [
      // 1 · Kieferlose Fische — vor 518 Mio. J. (Haikouichthys, Myllokunmingia (Chengjiang ~518
      //   Ma)). A small slender tadpole-like fish with a continuous fin fold along the back, a row
      //   of gill pores and a round mouth; no paired fins. Farben: silver-grey, faint gill dots.
      {
        name: 'Kieferlose Fische', ma: 518, art: [
          { f: 'cyan', d: 'M5 16 C8 12.6 12.5 11.6 17 12 C13.5 13.2 9.5 14.6 5.5 17 Z' },
          { f: 'cyan', d: 'M6 16.5 L2 13 L3 16.5 L2 20 Z' },
          { f: 'grey', d: 'M4 16.5 C7 14 13 13.2 19 13.6 C23.5 14 27 15 28.5 16.5 C27 18 23.5 19 19 19.4 C13 19.8 7 19 4 16.5 Z' },
          { f: 'white', d: 'M7 17.5 C12 18.8 19 19 25.5 17.8 C23 18.8 21 19.2 19 19.4 C14 19.8 9.5 19.2 7 17.5 Z' },
          { f: 'greyDark', d: artCircle(20.5, 16.7, 0.6) },
          { f: 'greyDark', d: artCircle(22, 16.7, 0.6) },
          { f: 'greyDark', d: artCircle(23.5, 16.7, 0.6) },
          { f: 'ink', d: artCircle(25.6, 15.6, 0.9) },
        ],
      },
      // 2 · Kopfschildfische — vor 480 Mio. J. (Armoured jawless fishes (Ostracodermi): Arandaspis
      //   ~480 Ma, Sacabambaspis ~465 Ma, later Cephalaspis (descriptive name)). A small
      //   flat-bellied fish with a broad bony head shield, tiny eyes at the very front and a small
      //   slit mouth, scaly tail behind. Farben: bronze head shield, grey-blue scales.
      {
        name: 'Kopfschildfische', ma: 480, art: [
          { f: 'sky', d: 'M14 14.5 C10 14 7 13.8 4.5 12.5 L2.5 10.5 L3.5 15.5 L2.5 19.5 C5 18.6 9 18.4 14 19 Z' },
          { f: 'sky', d: 'M9.5 14.2 L12 11 L13.4 14.4 Z' },
          { f: 'chitin', d: 'M12 14 C15 11.5 21 11 25.5 12.5 C28 13.3 29.8 15 29.8 16.8 C29.5 18.5 27 19.5 24 19.6 L13 19.6 L10.4 21.8 L11.4 18.5 C11 17 11 15.5 12 14 Z' },
          { f: 'yellow', d: 'M14 13.4 C17.5 12 22 11.9 25.5 13 C21 13.2 17 13.8 14 15 Z', o: 0.6 },
          { f: 'ink', d: artCircle(24.6, 13.8, 0.9) },
        ],
      },
      // 3 · Panzerfische — vor 438 Mio. J. (Placodermi, earliest jawed fishes ~439-436 Ma (Zhu et
      //   al. 2022, Nature); Dunkleosteus ~372 Ma). A heavy armoured head-and-shoulder block with a
      //   gaping jaw showing bony blades, shark-like tail behind. Farben: dark slate plates, lighter
      //   belly, white blade edges.
      {
        name: 'Panzerfische', ma: 438, art: [
          { f: 'greyDark', d: 'M13 13 C9.5 13.5 6.5 14.3 4.6 15.4 L2.2 10.5 L3 16.6 L2.6 21.6 L5.2 18.2 C8 19 11 19.5 13 19.5 Z' },
          { f: 'navy', d: 'M11 12.5 C14 9.5 20 8.5 25 9.5 C28 10.2 29.6 12 29.5 14 L24 15.4 L29 17.8 C28.5 20.5 25.5 22.5 21 22.8 C16 23 12.5 21.5 11 19.5 Z' },
          { f: 'grey', d: 'M12 19.8 C15 21.6 19 22.4 22.5 22.4 C19 21.2 15.5 20.2 12 19.8 Z' },
          { s: 'white', w: 1.6, d: 'M28.6 14.2 L25.2 15.3' },
          { s: 'white', w: 1.6, d: 'M25.2 15.6 L28.2 17.6' },
          { f: 'white', d: artCircle(23, 12.4, 1.5) },
          { f: 'ink', d: artCircle(23.2, 12.4, 0.8) },
        ],
      },
      // 4 · Fleischflosser — vor 423 Mio. J. (Sarcopterygii, Guiyu oneiros (~423 Ma); coelacanths
      //   and lungfish today). A stout fish with fleshy lobed fins on stalks like little paddles and
      //   a three-lobed tail (coelacanth). Farben: deep blue with white spots.
      {
        name: 'Fleischflosser', ma: 423, art: [
          { f: 'blue', d: 'M9 14 L4 9.5 L4.5 14.5 L1.8 16.5 L4.5 18.5 L4 23.5 L9 19 Z' },
          { f: 'navy', d: 'M11 12.5 C11.5 10 13 8.5 14.5 8.4 C14.6 10 14.1 11.5 13.5 12.2 Z' },
          { f: 'navy', d: 'M12 20.5 C12 23 13 24.8 14.5 25 C14.8 23.5 14.5 21.8 14 20.8 Z' },
          { f: 'blue', d: 'M7.5 16.5 C9 12.5 14 10.5 20 10.8 C25 11 28.5 13.5 29.5 16.5 C28.5 19.5 25 22 20 22.2 C14 22.5 9 20.5 7.5 16.5 Z' },
          { f: 'navy', d: 'M17.5 11 L19 7.4 L21.6 10.8 Z' },
          { f: 'navy', d: 'M16.5 20.5 C16 23 17 25 18.5 25.5 C19 23.5 18.8 21.8 18 20.8 Z' },
          { f: 'navy', d: 'M21 17 C20 19.5 20.5 22 22.5 23.5 C23.5 21.5 23.5 19 22.5 17 Z' },
          { f: 'white', d: artCircle(13, 15, 0.7), o: 0.85 },
          { f: 'white', d: artCircle(16.2, 13.6, 0.7), o: 0.85 },
          { f: 'white', d: artCircle(17.4, 17.4, 0.7), o: 0.85 },
          { f: 'white', d: artCircle(11, 18, 0.7), o: 0.85 },
          { f: 'white', d: artCircle(25.6, 14.4, 1.3) },
          { f: 'ink', d: artCircle(25.9, 14.4, 0.7) },
        ],
      },
      // 5 · Haie — vor 410 Mio. J. (Chondrichthyes, Doliodus problematicus (~409 Ma); shark-like
      //   scales from ~450 Ma). Classic shark profile: pointed snout, tall triangular dorsal fin,
      //   gill slits, uneven upturned tail. Farben: blue-grey back, white belly.
      {
        name: 'Haie', ma: 410, art: [
          { f: 'grey', d: 'M8 15.5 L2.5 8 L4 16 L3.5 21 L8 18 Z' },
          { f: 'grey', d: 'M6.5 16.5 C10 13.5 16 12.6 22 13 C26 13.3 28.8 14.7 30 16.2 C28.5 17.7 25.5 19.5 21 19.9 C15 20.4 9.5 19 6.5 16.5 Z' },
          { f: 'white', d: 'M9.5 18.2 C14 19.5 20 20 25.5 18.8 C28 18.2 29.2 17.3 30 16.2 C28.5 17.7 25.5 19.5 21 19.9 C15.5 20.3 11.5 19.5 9.5 18.2 Z' },
          { f: 'grey', d: 'M14.6 13.4 L18.4 6.4 L20.6 13.1 Z' },
          { f: 'greyDark', d: 'M19 18 L16.4 23.6 L22.2 19.4 Z' },
          { f: 'ink', d: artCircle(26.3, 15.3, 0.8) },
        ],
      },
      // 6 · Echte Knochenfische — vor 240 Mio. J. (Teleostei; stem teleosts Middle Triassic ~240
      //   Ma; today ~96 % of all fish species). A deep-bodied perch-like fish with a spiny dorsal
      //   fin, gill cover and symmetric forked tail. Farben: green-gold with dark vertical bars,
      //   orange fins.
      {
        name: 'Echte Knochenfische', ma: 240, reefGrazer: true, art: [
          { f: 'orange', d: 'M8.5 16 L3 9.6 L5.5 16 L3 22.4 Z' },
          { f: 'orange', d: 'M11.5 11.5 L13 7 L14.5 9.8 L16 6.5 L17.5 9.6 L19 7 L20.5 10.5 Z' },
          { f: 'orange', d: 'M15 21.2 L14 25 L18.2 21.8 Z' },
          { f: 'scale', d: 'M7.5 16 C10 10.8 16 9.5 21 10 C25.5 10.5 28.5 13 29.5 16 C28.5 19 25.5 21.5 21 22 C16 22.5 10 21.2 7.5 16 Z' },
          { f: 'yellow', d: 'M10 18.5 C14 21 20 22 25.5 20.5 C23 21.8 20 22.2 17 22 C13.5 21.6 11 20.3 10 18.5 Z' },
          { f: 'scaleDark', d: 'M12.6 12 L14.8 11.2 L15.4 21.4 L13.2 20.8 Z', o: 0.75 },
          { f: 'scaleDark', d: 'M17.2 10.4 L19.4 10.3 L19.6 22 L17.4 22 Z', o: 0.75 },
          { f: 'scaleDark', d: 'M21.6 10.6 L23.4 11.2 L23.4 21.2 L21.6 21.8 Z', o: 0.75 },
          { f: 'white', d: artCircle(25.6, 14.4, 1.3) },
          { f: 'ink', d: artCircle(25.9, 14.4, 0.7) },
        ],
      },
      // 7 · Rochen — vor 185 Mio. J. (Batoidea, Antiquaobatis grimmenensis (Pliensbachian ~185 Ma,
      //   Grimmen, Germany)). Top view (flat organism), slightly tilted: a flat diamond disc with
      //   broad wing fins and a thin whip tail to the left. Farben: sandy brown with dark spots,
      //   pale rim.
      {
        name: 'Rochen', ma: 185, art: [
          { s: 'tan', w: 1.6, d: 'M11 16.4 C7.5 17 4.5 18.4 2 20.5' },
          { f: 'cream', d: 'M29 16 C26 14 22 10 17.5 5.4 C15.5 9 13 13 10 16 C13 19 15.5 23 17.5 26.6 C22 22 26 18 29 16 Z' },
          { f: 'sand', d: 'M26.8 16 C24.5 14.4 21.4 11.2 17.8 7.8 C16.2 10.6 14.2 13.6 12 16 C14.2 18.4 16.2 21.4 17.8 24.2 C21.4 20.8 24.5 17.6 26.8 16 Z' },
          { f: 'furDark', d: artCircle(17.5, 13.4, 0.8), o: 0.75 },
          { f: 'furDark', d: artCircle(16.4, 18.4, 0.8), o: 0.75 },
          { f: 'furDark', d: artCircle(20.4, 16.4, 0.8), o: 0.75 },
          { f: 'ink', d: artCircle(24.6, 14.9, 0.7) },
          { f: 'ink', d: artCircle(24.6, 17.1, 0.7) },
        ],
      },
      // 8 · Seepferdchen — vor 13 Mio. J. (Hippocampus, oldest fossils ~13 Ma (Slovenia; Žalohar
      //   et al. 2009); molecular origin ~25 Ma). An upright S-shaped body with a horse-like head
      //   and tube snout facing right, ridged belly and curled tail. Farben: yellow-orange, small
      //   darker bumps.
      {
        name: 'Seepferdchen', ma: 13, art: [
          { s: 'gold', w: 3, d: 'M16.5 19.5 C15.4 23 16 26.6 18.6 27.6 C21 28.6 22.6 26.2 21.2 24.8 C20.2 24 18.8 24.8 19.2 25.8' },
          { f: 'orange', d: 'M13.2 14.6 L10.4 13.6 L10.8 17.4 L13.6 17.2 Z' },
          { f: 'gold', d: 'M15 10 C12.5 12.5 12.6 16 14.5 18.5 C16 20.5 19.5 21 21 19 C22.5 17 21.5 14 19.5 12.5 C18.5 11.6 18 10.5 18.5 9.5 Z' },
          { f: 'gold', d: 'M15.2 5.8 L15.6 2.8 L17.4 4.6 Z' },
          { f: 'gold', d: 'M14 7 C15 4.5 18 4 19.5 5.5 C20.5 6.3 21 7.2 21.5 7.6 L27 7.8 C27.5 8.6 27.2 9.6 26.5 9.8 L21.2 10.2 C20 11.5 18 12 16.5 11.5 Z' },
          { f: 'orange', d: artCircle(19.6, 15.2, 0.7) },
          { f: 'orange', d: artCircle(20.2, 17.6, 0.7) },
          { f: 'orange', d: artCircle(18.2, 19.2, 0.7) },
          { f: 'ink', d: artCircle(18.5, 7.4, 0.8) },
        ],
      },
    ],
    specialists: [
      // Polardorsche — Eis, ab Unterart 8 (Boreogadus saida (Arctic cod), lives under the sea
      //   ice). A slender cod with three dorsal fins and a chin barbel, swimming beneath an ice
      //   edge. Farben: silver-brown back, white belly, white ice.
      {
        name: 'Polardorsche', biome: Biome.Arctic, minStage: 7, art: [
          { f: 'white', d: 'M1.5 2 L30.5 2 L30.5 6 L26 7.5 L21 6 L15 8 L9 6.2 L4 7.6 L1.5 6.5 Z' },
          { f: 'cyan', d: 'M1.5 6.5 L4 7.6 L9 6.2 L15 8 L21 6 L26 7.5 L30.5 6 L30.5 7.6 L26 9 L21 7.6 L15 9.6 L9 7.8 L4 9.2 L1.5 8 Z' },
          { f: 'tan', d: 'M6.5 18.5 L2.5 15 L3.5 18.5 L2.5 22 Z' },
          { f: 'tan', d: 'M10.5 15.8 L12 13 L14 15.4 Z' },
          { f: 'tan', d: 'M15.5 15.2 L17 12.4 L19 15 Z' },
          { f: 'tan', d: 'M20.5 15.2 L22 12.8 L23.6 15.4 Z' },
          { f: 'tan', d: 'M5 18.5 C9 15.5 15 14.6 21 15 C25.5 15.3 28.5 16.8 29.5 18.5 C28 20.2 25 21.5 21 21.8 C15 22.3 9 21.3 5 18.5 Z' },
          { f: 'white', d: 'M8 19.6 C13 21.2 20 21.6 26 20.4 C24 21.4 22.5 21.7 21 21.8 C15.5 22.2 11 21.4 8 19.6 Z' },
          { s: 'tan', w: 1.6, d: 'M27.4 20.4 L27 23' },
          { f: 'ink', d: artCircle(26.2, 17.6, 0.8) },
        ],
      },
      // Tiefsee-Anglerfische — Hochsee, ab Unterart 8 (Ceratioidei (deep-sea anglerfishes),
      //   molecular origin ~50-35 Ma). A round dark fish with a huge toothy mouth and a glowing lure
      //   dangling from a rod over its head. Farben: black-brown body, cyan glowing lure.
      {
        name: 'Tiefsee-Anglerfische', biome: Biome.Ocean, minStage: 7, art: [
          { f: 'mint', d: artCircle(26.6, 6.6, 3.4), o: 0.4 },
          { s: 'greyDark', w: 1.6, d: 'M15 11 C16.5 5.5 22 3.5 26.4 5.2' },
          { f: 'black', d: 'M7 18.5 L2.5 14.5 L3 18.5 L2.5 22.5 Z' },
          { f: 'black', d: 'M5.5 18 C5.5 12.5 10 9.5 15.5 9.5 C21 9.5 25.5 12 27.5 15 L19 18.8 L28 21.5 C26 24.8 21.5 27 15.5 27 C10 27 5.5 23.5 5.5 18 Z' },
          { f: 'rust', d: 'M19 18.8 L27.5 15 C28.4 16.5 28.6 19.8 28 21.5 Z' },
          { f: 'white', d: 'M21 18 L22 16.4 L23 17.4 L24 15.7 L25 16.8 L26 15.4 L26.6 16.4 Z' },
          { f: 'white', d: 'M21 19.6 L22 21.2 L23 20.2 L24 22 L25 20.9 L26 22.3 L26.8 21.3 Z' },
          { f: 'cyan', d: artCircle(26.6, 6.6, 1.8) },
          { f: 'white', d: artCircle(19.4, 13.6, 1.1) },
        ],
      },
    ],
  };
}
