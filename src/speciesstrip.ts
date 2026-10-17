/* =============================================================================
 * SimEarth 2.0 — the sub-species strip
 * -----------------------------------------------------------------------------
 * The eight sub-species of an animal class as a row of portraits in the tree's
 * detail panel: discovered stages with their names and first appearance on
 * Earth, undiscovered stages hidden behind a question mark.
 * ========================================================================== */

namespace SE {
  export function speciesStrip(c: Life, dex: FaunaDex): HTMLElement {
    const strip = make('div', 'species-strip');
    SPECIES[c]?.stages.forEach((st, s) => {
      const known = dex.isDiscovered(c, s);
      const item = make('figure', `species-stage${known ? ' reached' : ''}`);
      const pic = make('div', `species-pic${known ? '' : ' is-unknown'}`);
      if (known) {
        const when = st.ma >= 1000
          ? `${(st.ma / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Mrd.`
          : `${st.ma.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Mio.`;
        item.title = `Unterart ${s + 1} von ${SUBSPECIES_PER_CLASS}: ${st.name} – auf der Erde erstmals vor ${when} Jahren`;
        pic.appendChild(pixelArt(artSvg(st.art, CREATURE_LOOK), 18, 'art'));
      } else {
        item.title = `Unterart ${s + 1} von ${SUBSPECIES_PER_CLASS}: Noch nicht entdeckt`;
        pic.textContent = '?';
      }
      item.append(pic, make('figcaption', undefined, known ? st.name : 'Unentdeckt'));
      strip.appendChild(item);
    });
    return strip;
  }
}
