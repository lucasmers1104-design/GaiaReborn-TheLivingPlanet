/* =============================================================================
 * SimEarth 2.0 — species art: Dinosaurier (dinosaurs)
 * -----------------------------------------------------------------------------
 * Non-avian dinosaurs as side views facing right, feet on y ≈ 28: each stage
 * told by its silhouette (runner, rearing neck, giant, crests, scutes, big
 * jaws, plates, feathers), far limbs a shade darker, the outline left to the
 * renderer. The line ends with the bird precursors, all of them Jurassic, so
 * the later giants of the Cretaceous (armour, bill, frill, Tyrannosaurus)
 * appear as biome specialists of that last stage. The stages show the
 * diversity of the group, not a line of descent: neither sauropods nor
 * tyrannosaurs are ancestors of the birds.
 * ========================================================================== */

namespace SE {
  /** A limb, tail or horn as a round-capped line. */
  const line = (s: PaletteKey, w: number, d: string): ArtStroke => ({ s, w, d });

  SPECIES[Life.Dinosaur] = {
    stages: [
      // 1 · Urdinosaurier — vor 230 Mio. J. (Eoraptor, Herrerasaurus (~231 Ma, Argentina)). A
      //   small slim two-legged runner with the tail held straight out, grasping hands and a small
      //   head. Farben: sand-brown with dark stripes.
      {
        name: 'Urdinosaurier', ma: 230, art: [
          line('fur', 2.2, 'M10.5 17.5 L10 22 L6.5 25.4 L8.5 27.8'),
          { f: 'tan', d: 'M2 14.6 C6 14 9.5 13.4 13 13.4 C16 13.4 18.5 13.5 20.2 14.4 C21.6 15.2 22 16.6 21.2 17.8 C20 19.3 17 20 14 19.8 C11.5 19.6 9.5 18.4 7 17 C5.5 16.2 3.8 15.6 2 15.4 Z' },
          line('tan', 3, 'M19.5 15 C20.5 13.5 21.5 12 22.6 10.5'),
          { f: 'tan', d: 'M21.2 9.8 C21.6 8 23.4 7.3 25.2 7.6 C26.8 7.9 28.2 8.6 29 9.6 C28.5 10.6 27 11 25.5 11.1 C23.6 11.4 21.8 11.2 21.2 9.8 Z' },
          { f: 'furDark', d: 'M8.5 14.2 L10 13.8 L10.6 16.6 L9.2 16.8 Z', o: 0.6 },
          { f: 'furDark', d: 'M12.5 13.5 L14 13.4 L14.4 17 L13 17 Z', o: 0.6 },
          { f: 'furDark', d: 'M16.5 13.5 L18 13.6 L18 17.4 L16.6 17.4 Z', o: 0.6 },
          { f: 'furDark', d: 'M4.5 14.4 L5.8 14.2 L6 16 L4.8 15.8 Z', o: 0.6 },
          { f: 'tan', d: artEllipse(13, 18.2, 2.8, 2.3) },
          line('tan', 2.4, 'M13.5 19 L16 22.8 L14 26.4 L16.8 27.8'),
          line('tan', 1.8, 'M19.5 16.5 L22 19 L23.5 18.2'),
          { f: 'ink', d: artCircle(24.4, 9, 0.8) },
        ],
      },
      // 2 · Plateosaurier — vor 214 Mio. J. (Plateosaurus (~214-204 Ma, Trossingen, Germany)). A
      //   long-necked plant eater rearing on its hind legs, small head, long tail, clawed thumbs.
      //   Farben: olive green, pale belly.
      {
        name: 'Plateosaurier', ma: 214, art: [
          line('scaleDark', 2.4, 'M12.6 21.6 L16.8 24 L17 27.8 L19.4 27.8'),
          { f: 'olive', d: 'M8.4 18.6 C6 21.4 3.8 24.6 1.9 28 L3.6 28.8 C6.2 26.4 9 24.4 12 23 Z' },
          { f: 'olive', d: 'M8 21.2 C7.6 16.8 10.4 12.4 14.6 10.4 C17.2 9.2 19.4 10.2 19.6 12.6 C20 16 18.2 20.2 15.2 22.8 C13 24.6 8.4 24.6 8 21.2 Z' },
          { f: 'olive', d: 'M15.6 11.4 C16.4 8 18.2 5 20.8 3.4 L22.4 5.4 C20.6 6.6 19.4 9.2 19.2 12.4 Z' },
          { f: 'olive', d: 'M20 4.2 C20.2 2.6 22 1.9 23.8 2.2 C25.4 2.5 26.6 3.2 27.2 4.2 C26.4 5.2 25 5.6 23.6 5.6 C21.8 5.8 20.4 5.4 20 4.2 Z' },
          { f: 'sand', d: 'M10.4 23.8 C13.6 23.4 17.6 19.6 19.4 14.6 C19.4 18 17.8 21 15.2 22.9 C13.6 24.2 11.8 24.4 10.4 23.8 Z' },
          { f: 'olive', d: artEllipse(11, 21.4, 3.2, 3.8) },
          line('olive', 2.6, 'M12 24 L11.8 27.6 L15 27.8'),
          line('olive', 2, 'M17.4 14.4 L21.8 16.8'),
          line('bone', 1.6, 'M21.8 16.8 L23 15'),
          { f: 'ink', d: artCircle(23.4, 3.6, 0.75) },
        ],
      },
      // 3 · Sauropoden — vor 200 Mio. J. (Early sauropods (Vulcanodon ~200-195 Ma); giants like
      //   Brachiosaurus ~154 Ma). A huge four-legged body on column legs with a very long neck
      //   reaching up-right and a long tapering tail. Farben: grey-green, lighter neck underside.
      {
        name: 'Sauropoden', ma: 200, art: [
          { f: 'greyDark', d: 'M10 21 L13.2 21 L13.2 28.6 L10 28.6 Z' },
          { f: 'greyDark', d: 'M20.4 19 L23.4 19 L23.4 28.6 L20.4 28.6 Z' },
          { f: 'grey', d: 'M7 15.5 C4.5 16.5 2.8 19 1.8 23 C3.8 21 6 20 8.5 19.5 Z' },
          { f: 'grey', d: 'M5.5 18.5 C5.5 14.5 9.5 11.5 14.5 11.5 C18.5 11.5 21.5 13 22.5 16 C23.2 18.5 22.4 20.8 20 21.8 C15.5 23 9.5 23 7 22 C6 21.4 5.5 20.2 5.5 18.5 Z' },
          { f: 'grey', d: 'M16.5 14 C18.5 10.5 20.5 7 22.5 4.6 L26 5.8 C24.6 8.6 23.2 12.4 22.4 16.5 Z' },
          { f: 'grey', d: 'M22 4.4 C22.4 2.8 24.4 2 26.4 2.3 C28 2.6 29.4 3.3 30 4.4 C29.2 5.4 27.6 5.9 26 5.9 C24 6 22.4 5.7 22 4.4 Z' },
          { f: 'bone', d: 'M22.4 16.5 C23.2 12.4 24.6 8.6 26 5.8 L24.8 5.4 C23.4 8.4 22 12 21.2 16 Z' },
          { f: 'scaleDark', d: 'M5.6 18 C10 18.6 16 17 21.4 13.4 C22.2 14.2 22.6 15 22.8 16 C23.2 18.5 22.4 20.8 20 21.8 C15.5 23 9.5 23 7 22 C6 21.4 5.5 20.2 5.6 18 Z', o: 0.5 },
          { f: 'grey', d: 'M7 21 L10.4 21 L10.6 28.6 L6.8 28.6 Z' },
          { f: 'grey', d: 'M17.2 20 L20.6 20 L20.8 28.6 L17 28.6 Z' },
          { f: 'ink', d: artCircle(25.2, 3.6, 0.8) },
        ],
      },
      // 4 · Kammsaurier — vor 193 Mio. J. (Dilophosaurus wetherilli, Kayenta Fm., Arizona; Early
      //   Jurassic). A slender two-legged predator of medium size with a long neck, three-fingered
      //   hands and two thin bony crests along the top of the skull. Farben: yellow-green, red crests.
      {
        name: 'Kammsaurier', ma: 193, art: [
          line('scaleDark', 2.4, 'M12.6 18 L12 22.6 L9.4 25.8 L11.2 27.8'),
          { f: 'scale', d: 'M11.4 12.6 C8 13 4.8 13.8 1.8 15 C5 16.2 8.4 17.4 11.8 18 Z' },
          { f: 'scale', d: 'M9.8 15.4 C10 12.4 13.6 10.8 17.6 11 C20.4 11.2 22 12.4 22.4 14.4 C22.6 16.6 21 18.6 18 19.6 C15 20.4 11.2 19.8 10.2 18 Z' },
          { f: 'scale', d: 'M19.4 12.6 C20.4 10.6 21.6 8.8 23.2 7.4 L25.4 9.6 C24 10.6 23 12.2 22.4 14.4 Z' },
          { f: 'red', d: 'M22.8 6.4 C22.8 3.6 24.6 1.8 27 1.8 C28.8 1.8 30 2.8 30.2 4.2 L28.4 5.2 C28.2 4.2 27.4 3.6 26.6 3.8 C25.4 4 24.8 5.2 24.8 6.6 Z' },
          { f: 'scale', d: 'M22.2 7.8 C22.6 6 24.4 5.2 26.4 5.4 C28.2 5.6 29.6 6.4 30.4 7.4 C30 8.6 28.8 9.2 27.4 9.4 L24.4 9.8 C23 9.8 22.2 9 22.2 7.8 Z' },
          { f: 'scaleDark', d: 'M13 11.4 L14.6 11.1 L15 15.4 L13.4 15.6 Z', o: 0.6 },
          { f: 'scaleDark', d: 'M16.8 11.1 L18.4 11.4 L18.2 15.8 L16.6 15.8 Z', o: 0.6 },
          { f: 'scaleDark', d: 'M6 13.6 L7.6 13.2 L7.8 15.8 L6.2 15.4 Z', o: 0.6 },
          { f: 'sand', d: 'M11.6 18.8 C14.4 19.8 18.4 19.4 21 17.4 C20.2 18.8 18.6 19.6 16.6 19.9 C14.4 20.2 12.8 19.8 11.6 18.8 Z' },
          { f: 'scale', d: 'M10.8 15.6 C11.2 12.8 14.8 12.2 16.8 14.2 C18.2 15.8 17.8 19.2 15.8 21 C14.4 22.2 12.4 21.8 11.6 20.4 C11 19.2 10.7 17.4 10.8 15.6 Z' },
          line('scale', 2.8, 'M15 20.6 L14 25.6'),
          line('scale', 2.2, 'M13.8 26 L15 27.8 L18.4 27.8'),
          line('scale', 1.8, 'M20.4 15.4 L23 18.4 L24.8 17.6'),
          { f: 'ink', d: artCircle(26.2, 6.9, 0.8) },
        ],
      },
      // 5 · Panzerdinosaurier — vor 191 Mio. J. (Scelidosaurus harrisonii, Charmouth Mudstone,
      //   Dorset; Late Sinemurian). An early armoured plant eater on four legs, hind legs longer,
      //   small low head, long tail; rows of small bony scutes along back and flanks, no plates or
      //   club yet. Farben: olive body, bone-coloured scutes.
      {
        name: 'Panzerdinosaurier', ma: 191, art: [
          { f: 'scaleDark', d: 'M9.6 21 L12.2 21 L12.2 28.6 L9.6 28.6 Z' },
          { f: 'scaleDark', d: 'M20.2 21.4 L22.6 21.4 L22.6 28.6 L20.2 28.6 Z' },
          { f: 'olive', d: 'M8 16.8 C5.6 17.2 3.6 18.2 1.8 19.6 C3.8 20.4 6 20.8 8.6 20.8 Z' },
          { f: 'olive', d: 'M6.6 19.8 C7 15.6 11 13 15.8 12.8 C20 12.8 23 14.6 24.4 17.6 C25 19.4 24.4 21 22.6 21.8 C18.6 23 11.4 23 8.6 22.2 C7.2 21.6 6.6 20.8 6.6 19.8 Z' },
          { f: 'olive', d: 'M23 16.4 C24.6 16.2 26.4 16.6 27.6 17.6 C28.8 18.4 29.8 19.4 30.2 20.6 C29.6 21.6 28.4 22 27 21.8 C25.6 21.6 24.4 21 23.6 20 Z' },
          { f: 'scaleDark', d: 'M7 20.6 C11 21.4 18 21.4 23.6 19.2 C24.6 20.2 24 21.2 22.6 21.8 C18.6 23 11.4 23 8.6 22.2 C7.6 21.8 7.1 21.3 7 20.6 Z', o: 0.55 },
          { f: 'bone', d: 'M8.4 16.6 L9.2 14.4 L10.6 16 Z' },
          { f: 'bone', d: 'M11.4 14.8 L12.6 12.6 L13.8 14.4 Z' },
          { f: 'bone', d: 'M14.8 14 L16 11.8 L17.2 13.8 Z' },
          { f: 'bone', d: 'M18.2 14.2 L19.6 12.2 L20.6 14.4 Z' },
          { f: 'bone', d: 'M21.4 15.6 L23 14 L23.6 16.4 Z' },
          { f: 'bone', d: artCircle(11.6, 18.4, 0.9) },
          { f: 'bone', d: artCircle(15.2, 17.6, 0.9) },
          { f: 'bone', d: artCircle(18.8, 17.8, 0.9) },
          { f: 'olive', d: 'M7.6 21 L10.8 21 L11 28.6 L7.4 28.6 Z' },
          { f: 'olive', d: 'M18.6 21.4 L21.2 21.4 L21.2 28.6 L18.6 28.6 Z' },
          { f: 'ink', d: artCircle(27.4, 18.6, 0.75) },
        ],
      },
      // 6 · Megalosaurier — vor 167 Mio. J. (Megalosaurus bucklandii, Taynton Limestone Fm.,
      //   Stonesfield, Oxfordshire; middle Bathonian; the first non-avian dinosaur ever named, 1824).
      //   A big two-legged predator with a long, low skull and strong three-clawed arms — unlike the
      //   later tyrannosaurs' tiny ones. Farben: brown with darker back stripes, cream belly.
      {
        name: 'Megalosaurier', ma: 167, art: [
          line('furDark', 2.8, 'M12.4 17.4 L11.2 22.4 L8.2 25.6 L10 27.8'),
          { f: 'fur', d: 'M11.6 11.6 C8 12 4.8 12.8 1.8 14 C5 15.4 8.6 16.8 12.2 17.4 Z' },
          { f: 'fur', d: 'M9.6 14.6 C9.8 11.4 13.6 9.6 18 9.8 C21 10 23.2 11.2 23.8 13.4 C24.2 16 22.4 18.4 19 19.6 C15.6 20.6 11.2 20 10.2 17.6 Z' },
          { f: 'fur', d: 'M20.4 9.4 C20.8 7.2 23 5.8 26 6 C28.2 6.2 29.8 7 30.5 8.4 L30.5 10.6 C30 11.6 29 12 27.6 12 L23.6 12.4 C21.6 12.4 20.4 11.4 20.4 9.4 Z' },
          { f: 'cream', d: 'M22 12 L30.2 11.2 C29.8 12.6 28.8 13.4 27.2 13.6 L23.6 13.8 C22.6 13.6 22 13 22 12 Z' },
          { f: 'furDark', d: 'M13.2 10.2 L15 9.9 L15.4 13.6 L13.6 13.8 Z', o: 0.6 },
          { f: 'furDark', d: 'M17.2 9.9 L19 10.1 L18.8 13.8 L17 13.8 Z', o: 0.6 },
          { f: 'furDark', d: 'M5.6 12.6 L7.4 12.2 L7.6 14.8 L5.8 14.4 Z', o: 0.6 },
          { f: 'cream', d: 'M11.2 18.2 C14.6 19.4 19.4 19 22.6 16.4 C21.8 18 20.4 19 18.6 19.6 C15.8 20.4 12.8 20 11.2 18.2 Z' },
          { f: 'fur', d: 'M10.4 15 C10.8 11.8 15 11.2 17.2 13.4 C18.8 15.2 18.2 19 16 21 C14.4 22.4 12.2 22 11.2 20.4 C10.6 19 10.3 17 10.4 15 Z' },
          line('fur', 3.2, 'M15.2 20.4 L14 25.6'),
          line('fur', 2.6, 'M13.8 26 L15 27.8 L18.6 27.8'),
          line('fur', 2.2, 'M21 15.2 L23.6 18.4 L25.4 17.6'),
          line('bone', 1.6, 'M25.4 17.6 L26.4 16.2'),
          { f: 'ink', d: artCircle(26.4, 8.2, 0.85) },
        ],
      },
      // 7 · Stegosaurier — vor 165 Mio. J. (Stegosauria, Huayangosaurus (~165 Ma); Stegosaurus
      //   ~155 Ma). A quadruped with a tiny low head, high-arched back with two rows of big plates
      //   and tail spikes. Farben: green-brown body, orange-red plates.
      {
        name: 'Stegosaurier', ma: 165, art: [
          { f: 'rust', d: 'M8 15 L5.2 12.6 L5.8 8.8 L8.8 11 Z' },
          { f: 'rust', d: 'M15.5 11 L13.4 7.6 L15.4 2.8 L17.6 7.2 Z' },
          { f: 'rust', d: 'M23 15 L22.2 11.6 L25 9.6 L25.8 13.2 Z' },
          { f: 'orange', d: 'M11.5 12 L8.8 9.8 L10 4.8 L13.2 8.2 Z' },
          { f: 'orange', d: 'M19.5 12.2 L17.8 8.4 L20.4 4.4 L22.4 9 Z' },
          { f: 'bark', d: 'M5.8 19.5 L8.8 19.5 L8.8 28.6 L5.8 28.6 Z' },
          { f: 'bark', d: 'M17 20.5 L19.8 20.5 L19.8 28.6 L17 28.6 Z' },
          { f: 'kelp', d: 'M7 16.5 C5 16.5 3.4 17.2 1.8 18.4 C3.6 19.4 5.4 20.2 7.4 20.6 Z' },
          line('bone', 1.8, 'M3.8 17.6 L2.6 14'),
          line('bone', 1.8, 'M5.8 17 L5 13'),
          { f: 'kelp', d: 'M5.5 19.5 C6 14.5 10 11 15 10.8 C19 10.8 22 13 24 16.5 C25 18.5 24.8 20.6 23 21.6 C19 23 11 23 8 22 C6.5 21.5 5.5 20.6 5.5 19.5 Z' },
          { f: 'kelp', d: 'M22 15.5 C24.5 16.5 26.5 18.3 28 19.6 C29.2 20.4 29.6 21.4 29 22.2 C28 22.8 26.5 22.6 25 22 C23.5 21.4 22.5 20.5 22 19.5 Z' },
          { f: 'kelp', d: 'M8.5 20 L12 20 L12.2 28.6 L8.6 28.6 Z' },
          { f: 'kelp', d: 'M19.8 20.5 L22.6 20.5 L22.8 28.6 L20 28.6 Z' },
          { f: 'ink', d: artCircle(27.2, 20.3, 0.8) },
        ],
      },
      // 8 · Vogelvorläufer — vor 160 Mio. J. (Anchiornis huxleyi, Tiaojishan Fm., Liaoning,
      //   ~160.9-160.3 Ma; a feathered paravian close to the origin of birds, not a proven
      //   ancestor). Crow-sized, feathers on arms and legs, a long feathered tail and a crest.
      //   Farben from fossil melanosomes: grey body, black-and-white wings, rust-red crest.
      {
        name: 'Vogelvorläufer', ma: 160, art: [
          { f: 'black', d: 'M11.4 17.2 C8.2 18 5.2 19.4 2.6 21.6 C5.4 21.9 8.6 21.2 11.8 19.8 Z' },
          line('black', 1.8, 'M14.2 21.2 L13.8 25.2 L13.2 27.8'),
          { f: 'grey', d: 'M10.4 18.4 C10.6 15.4 13.4 13.4 16.6 13.6 C19 13.8 20.6 15.2 20.6 17.4 C20.6 19.6 18.6 21.4 15.6 21.6 C13 21.8 10.6 20.6 10.4 18.4 Z' },
          { f: 'grey', d: 'M18.4 14.8 C19 12.6 20 10.6 21.4 9.4 L23.4 11 C22.2 12 21.4 13.6 21 15.8 Z' },
          { f: 'rust', d: 'M20.8 9 C20.2 7.2 20.6 5.6 21.8 4.6 C22.4 5.8 23.2 6.8 24.2 7.6 Z' },
          { f: 'grey', d: 'M20.8 9.8 C21 8.2 22.4 7.4 24 7.6 C25.4 7.8 26.8 8.6 27.6 9.6 C27 10.4 25.8 10.8 24.6 10.8 C22.8 11 21.2 11 20.8 9.8 Z' },
          { f: 'black', d: 'M12.6 15.6 C15.4 14.6 18.6 15.4 20 17.6 C18.4 19.8 15.2 21.6 11.2 22.2 C10.4 20.4 10.8 17.4 12.6 15.6 Z' },
          { f: 'white', d: 'M13.2 16 C15.4 15.2 17.8 15.8 19 17.4 C17.4 18.8 15.2 19.6 12.6 19.8 C12.2 18.4 12.4 16.8 13.2 16 Z' },
          { f: 'black', d: 'M11.2 22.2 C12.2 21.6 13.6 21.2 15 21 C13.8 22.4 12.4 23.4 10.8 23.8 Z' },
          { f: 'black', d: 'M15 20.8 C14.2 22.6 12.8 23.8 11 24.6 C12 22.8 12.8 21.8 13.8 20.8 Z' },
          line('greyDark', 1.8, 'M16.4 21.2 L16.8 25.2 L16 27.8'),
          line('greyDark', 1.6, 'M15.8 27.8 L18.6 27.8'),
          { f: 'ink', d: artCircle(24.4, 9, 0.7) },
        ],
      },
    ],
    specialists: [
      // Ankylosaurier — Wüste, ab Unterart 8 (Gobi ankylosaurids such as Pinacosaurus (~75 Ma,
      //   Djadochta Fm.); Ankylosauridae from ~122 Ma (Liaoningosaurus, stiffened tail); full tail
      //   club from ~90 Ma; Ankylosaurus 68 Ma). A low, wide, tank-like
      //   armoured body with rows of studs, flank spikes and a stiff tail ending in a small knob.
      //   Farben: dull ochre-brown, cream studs.
      {
        name: 'Ankylosaurier', biome: Biome.Desert, minStage: 7, art: [
          { f: 'furDark', d: 'M15.2 22 L17.8 22 L17.8 28.6 L15.2 28.6 Z' },
          { f: 'furDark', d: 'M24.6 22 L27 22 L27 28.6 L24.6 28.6 Z' },
          line('fur', 2, 'M12 19.6 L6 19.6'),
          { f: 'tan', d: artEllipse(4.2, 19.6, 2.5, 2.3) },
          { f: 'cream', d: 'M12.4 17.2 L14 15.6 L11.4 14.4 Z' },
          { f: 'cream', d: 'M15.8 15 L18 14.5 L15.6 12 Z' },
          { f: 'cream', d: 'M19.6 14.4 L21.8 14.7 L20 11.8 Z' },
          { f: 'cream', d: 'M23.4 15.4 L25.2 16.4 L24.6 13 Z' },
          { f: 'fur', d: 'M10.6 21.4 C10.8 17 14 14.4 18.8 14.4 C23.4 14.4 26.6 16.8 27 20.2 C27.2 22 26 23.2 24 23.2 L12.6 23.2 C11.4 23.2 10.6 22.6 10.6 21.4 Z' },
          { f: 'tan', d: 'M12 19 C12.8 16.6 15.4 15.4 18.8 15.4 C22 15.4 24.2 16.4 25.4 18.2 C21.6 17.2 15.6 17.4 12 19 Z' },
          { f: 'fur', d: 'M26 17.4 C27.6 17 29.4 17.8 30.2 19.4 C30.6 20.6 30 21.6 28.8 21.8 L26.4 21.8 Z' },
          { f: 'cream', d: artCircle(14.6, 20, 1) },
          { f: 'cream', d: artCircle(18.2, 19.6, 1) },
          { f: 'cream', d: artCircle(21.8, 19.6, 1) },
          { f: 'cream', d: artCircle(25, 20.2, 1) },
          { f: 'fur', d: 'M12.6 22 L15.6 22 L15.8 28.6 L12.4 28.6 Z' },
          { f: 'fur', d: 'M21.8 22 L24.8 22 L25 28.6 L21.8 28.6 Z' },
          { f: 'ink', d: artCircle(28.4, 19.2, 0.8) },
        ],
      },
      // Entenschnabelsaurier — Nadelwald, ab Unterart 8 (Edmontosaurus herds in the polar forests
      //   of Alaska (~70 Ma, Prince Creek Fm.); hadrosauroids with duck-bill (Eolambia, Protohadros
      //   ~96 Ma); hadrosaurids ~86-66 Ma). A large plant eater standing semi-upright
      //   with a broad flat duck-bill snout and a long stiff tail; no crest. Farben: dusky green
      //   with lighter stripes.
      {
        name: 'Entenschnabelsaurier', biome: Biome.Boreal, minStage: 7, art: [
          line('forest', 2.6, 'M10.6 18 L9.8 27.4'),
          line('forest', 2, 'M21.4 18.6 L23.4 23.4 L23 27.6'),
          { f: 'scaleDark', d: 'M11 12.4 C7.6 12.6 4.6 13.2 1.8 14.2 C4.8 15.4 8.2 16.4 11.4 17 Z' },
          { f: 'scaleDark', d: 'M8.6 15.6 C8.8 12.4 12 10.8 15.6 11.2 C18.6 11.6 21 13 22 15.4 C22.8 17.6 22 19.8 19.8 20.8 C16.6 22 12 21.6 10 19.8 C9 18.8 8.6 17.4 8.6 15.6 Z' },
          { f: 'scaleDark', d: 'M18.8 14.4 C19.6 11.4 21 8.8 23.2 7.4 L25.4 9.8 C23.8 10.8 22.8 13 22.4 16.4 Z' },
          { f: 'scaleDark', d: 'M21.8 7.4 C22 5.4 23.8 4.4 25.8 4.8 C27 5 27.8 5.8 28.4 6.6 C29.4 7 30.2 7.6 30.5 8.6 C30.6 9.8 29.8 10.6 28.6 10.6 C27.4 10.6 26.2 10.2 25.2 10 C23.2 10 22 9 21.8 7.4 Z' },
          { f: 'bone', d: 'M27.8 6.4 C29 6.8 30.2 7.6 30.5 8.6 C30.6 9.8 29.8 10.6 28.6 10.6 C27.8 10.6 27 10.4 26.4 10.2 C27.2 9 27.8 7.8 27.8 6.4 Z' },
          { f: 'scale', d: 'M11.6 11.6 L13.4 11.1 L14 15.8 L12.2 16 Z', o: 0.6 },
          { f: 'scale', d: 'M15.8 11.2 L17.6 11.5 L17.6 16.2 L15.8 16.2 Z', o: 0.6 },
          { f: 'scale', d: 'M5.6 13.3 L7.4 12.9 L7.6 15.6 L5.8 15.1 Z', o: 0.6 },
          { f: 'scaleDark', d: artEllipse(12.2, 16.4, 3.6, 4.2) },
          line('scaleDark', 3, 'M12.8 19.6 L12.4 27.4'),
          line('scaleDark', 2.2, 'M12.2 27.8 L15.4 27.8'),
          line('scaleDark', 2.2, 'M20 18.6 L21.2 23.6 L20.6 27.6 L22.4 27.8'),
          { f: 'ink', d: artCircle(25.4, 6.6, 0.8) },
        ],
      },
      // Hornsaurier — Offenland, ab Unterart 8 (Ceratopsoidea with brow horns and frill (Zuniceratops
      //   ~91 Ma); Triceratops 68-66 Ma). A stocky quadruped with a big bony neck frill, two long
      //   brow horns and a parrot beak. Farben: red-brown frill, olive body.
      {
        name: 'Hornsaurier', biome: Biome.Grass, minStage: 7, art: [
          { f: 'scaleDark', d: 'M9.8 21 L12.8 21 L12.8 28.6 L9.8 28.6 Z' },
          { f: 'scaleDark', d: 'M19.2 21.6 L22 21.6 L22 28.6 L19.2 28.6 Z' },
          { f: 'olive', d: 'M6 16.5 C4 17.5 2.6 19 1.8 21 C3.6 20.8 5.4 20.6 7 20 Z' },
          { f: 'olive', d: 'M4.6 19 C4.8 15 8.5 12.5 13 12.5 C17 12.5 20 14 21 17 C21.6 19.4 20.6 21.8 18.2 22.6 C14 23.6 9 23.4 6.6 22.4 C5.4 21.8 4.6 20.6 4.6 19 Z' },
          { f: 'rust', d: 'M16.4 19 C15 13.6 16.8 8.6 21 6.6 C23.2 5.6 25 6.6 25.2 8.8 L24.4 18 Z' },
          { f: 'olive', d: 'M20.4 15.6 C21.6 13 24.6 12.6 26.6 14 C28 15 29.4 16.8 30 18.6 C29.2 20.2 27.6 21 26 21 C23.6 21.2 21.2 20.2 20.4 18.4 Z' },
          { f: 'greyDark', d: 'M28.4 17.4 C29.4 17.8 30.2 18.6 30.4 19.8 C29.6 20.8 28.6 21 27.8 20.8 Z' },
          line('bone', 1.8, 'M24.2 14 C25.6 11.4 27.4 9.8 29.4 9.2'),
          line('bone', 1.6, 'M28 16.4 L28.8 14.2'),
          { f: 'olive', d: 'M6.6 21 L10.2 21 L10.4 28.6 L6.6 28.6 Z' },
          { f: 'olive', d: 'M16 21.6 L19.4 21.6 L19.6 28.6 L16.2 28.6 Z' },
          { f: 'ink', d: artCircle(24.6, 15.4, 0.85) },
        ],
      },
      // Tyrannosaurier — Wald, ab Unterart 8 (Tyrannosauridae from ~80 Ma (Lythronax);
      //   Tyrannosaurus rex 68-66 Ma). A huge-headed two-legged predator with powerful hind legs,
      //   tiny two-fingered arms and a balancing tail. Farben: dark grey-brown, lighter jaw.
      {
        name: 'Tyrannosaurier', biome: Biome.Forest, minStage: 7, art: [
          line('black', 2.6, 'M12.4 17.6 L11 22.4 L8 25.6 L9.8 27.8'),
          { f: 'furDark', d: 'M12 10.8 C8.4 11.2 5 12 1.8 13.2 C5 14.6 8.6 16.2 12.4 17 Z' },
          { f: 'furDark', d: 'M9.8 14 C10 11 13.8 9.4 18.2 9.6 C21 9.8 22.8 11 23.2 13 C23.4 15.6 21.6 18 18.4 19.2 C15 20.2 11 19.4 10.2 17 Z' },
          { f: 'furDark', d: 'M18.6 7.6 C19 4.8 21.8 3.2 25.4 3.4 C28.2 3.6 30 4.8 30.5 7 L30.5 10.4 C30.2 11.6 29 12.2 27.6 12.2 L22.4 12.6 C20.2 12.6 18.6 11 18.6 7.6 Z' },
          { f: 'sand', d: 'M20.6 12.2 L30.2 11.2 C30 12.8 28.8 14 26.8 14.4 L22.8 14.6 C21.4 14.4 20.6 13.4 20.6 12.2 Z' },
          { f: 'furDark', d: 'M10.6 15 C11 11.8 15.2 11.2 17.4 13.4 C19 15.2 18.4 19 16.2 21 C14.6 22.4 12.4 22 11.4 20.4 C10.8 19 10.5 17 10.6 15 Z' },
          line('furDark', 3.2, 'M15.4 20.4 L14.2 25.6'),
          line('furDark', 2.6, 'M14 26 L15.2 27.8 L18.8 27.8'),
          line('furDark', 1.8, 'M21.4 16 L23.8 17.6 L24.6 16.8'),
          { f: 'ink', d: artCircle(25, 6.2, 0.9) },
        ],
      },
      // Protoceratops — Wüste, ab Unterart 8 (Protoceratops andrewsi (~75-71 Ma), Gobi dune
      //   deposits (Djadochta Fm.)). A pig-sized dinosaur with a short frill and parrot beak
      //   standing on a sand dune. Farben: sandy beige, rust frill.
      {
        name: 'Protoceratops', biome: Biome.Desert, minStage: 7, art: [
          { f: 'tan', d: 'M1.5 29.8 C5 27.8 10 26.9 16 26.8 C22 26.8 27 27.8 30.5 29.8 Z' },
          { f: 'chitin', d: 'M16 26.8 C22 26.8 27 27.8 30.5 29.8 L16 29.8 Z', o: 0.55 },
          { f: 'sand', d: 'M9.4 16 C7.2 16.6 5 17.8 3.6 19.8 C5.6 20 7.8 19.6 9.8 19 Z' },
          { f: 'sand', d: 'M8 18.2 C8.2 14.6 11.6 12.4 15.6 12.4 C18.8 12.4 21.2 14 21.8 16.6 C22.2 18.8 21.2 20.8 19 21.2 L11 21.2 C9 21.2 8 20 8 18.2 Z' },
          { f: 'rust', d: 'M18.2 17.4 C17.2 13.4 18.6 10 21.6 9 C23.2 8.5 24.4 9.4 24.4 11 L23.8 17 Z' },
          { f: 'sand', d: 'M21 14.6 C22 12.6 24.6 12.4 26.4 13.6 C27.6 14.4 28.8 15.8 29.2 17.6 C28.4 19 27 19.6 25.4 19.6 C23.2 19.6 21.6 18.6 21 17 Z' },
          { f: 'greyDark', d: 'M27.4 16 C28.8 16.4 30 17.4 30.3 18.8 C29.4 19.8 28.2 20 27.2 19.8 Z' },
          { f: 'sand', d: 'M9.6 20 L12.6 20 L12.8 27.4 L9.6 27.4 Z' },
          { f: 'sand', d: 'M19 20 L22 20 L22.2 27.2 L19 27.2 Z' },
          { f: 'ink', d: artCircle(24.6, 15, 0.8) },
        ],
      },
      // Spinosaurus — Sumpf, ab Unterart 8 (Spinosaurus (~99-94 Ma), semi-aquatic fish eater of
      //   river and delta landscapes (Kem Kem)). A long-snouted, crocodile-headed predator with a
      //   huge sail on its back, wading in water. Farben: dark olive body, red-orange sail.
      {
        name: 'Spinosaurus', biome: Biome.Swamp, minStage: 7, art: [
          { f: 'orange', d: 'M8 15.5 C7.6 9 10.4 4 14.6 3.2 C18.8 2.6 21.4 7 21.6 14.4 Z' },
          { f: 'rust', d: 'M14.6 3.2 C18.8 2.6 21.4 7 21.6 14.4 L15 15 Z', o: 0.55 },
          { f: 'scaleDark', d: 'M9 15.6 C6 15.8 3.8 17 1.8 19 C4.4 19.6 7 19.8 9.4 19.6 Z' },
          { f: 'scaleDark', d: 'M7.5 17.6 C8 14.6 12 13 16.5 13 C20 13 22.4 14 23.2 16 C23.8 18.2 22.6 20.6 20 21.8 C16 23.2 11 23 9 21.8 C7.8 21 7.4 19.4 7.5 17.6 Z' },
          { f: 'scaleDark', d: 'M20.6 15 C21.4 13.4 22.6 12.2 24 11.6 L25.4 14.4 C24.4 15.2 23.6 16.4 23.2 17.6 Z' },
          { f: 'scaleDark', d: 'M22.6 12.4 C23 10.8 24.6 10.2 26 10.6 L30.4 12.2 C30.6 13.2 30.2 14 29.2 14.2 L25 14.6 C23.6 14.8 22.6 14 22.6 12.4 Z' },
          line('scaleDark', 1.8, 'M21 18.6 L23.6 21'),
          { f: 'scaleDark', d: artEllipse(12.5, 21.5, 3.4, 3) },
          { f: 'sky', d: 'M1.5 24 C4 22.8 6.5 22.8 9 24 C11.5 25.2 14 25.2 16.5 24 C19 22.8 21.5 22.8 24 24 C26.5 25.2 28.5 25 30.5 24 L30.5 28.5 L1.5 28.5 Z' },
          { f: 'blue', d: 'M1.5 26.6 C6 25.8 10 26.6 16 26.4 C22 26.2 26 25.8 30.5 26.6 L30.5 28.5 L1.5 28.5 Z', o: 0.55 },
          { f: 'ink', d: artCircle(25.4, 11.8, 0.8) },
        ],
      },
    ],
  };
}
