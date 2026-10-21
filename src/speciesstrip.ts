/* =============================================================================
 * SimEarth 2.0 — the sub-species strip
 * -----------------------------------------------------------------------------
 * The eight sub-species of an animal class as a row of portraits in the tree's
 * detail panel: discovered stages with their names and first appearance on
 * Earth, undiscovered stages hidden behind a question mark, those gone for
 * good greyed under the R.I.P. band. A click opens the stage's lexicon entry.
 * ========================================================================== */

namespace SE {
  export function speciesStrip(c: Life, dex: FaunaDex, world: WorldState, open: (c: Life, stage: number) => void): HTMLElement {
    const strip = make('div', 'species-strip');
    SPECIES[c]?.stages.forEach((st, s) => {
      const known = dex.isDiscovered(c, s);
      const gone = known && stageGone(world, c, s);
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `species-stage${known ? ' reached' : ''}${gone ? ' is-gone' : ''}`;
      const pic = make('div', `species-pic${known ? '' : ' is-unknown'}`);
      if (known) {
        const when = st.ma >= 1000
          ? `${(st.ma / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Mrd.`
          : `${st.ma.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Mio.`;
        item.title = `Unterart ${s + 1} von ${SUBSPECIES_PER_CLASS}: ${st.name}${gone ? ' – für immer ausgestorben' : ''} – auf der Erde erstmals vor ${when} Jahren. Im Arten-Lexikon ansehen`;
        pic.appendChild(pixelArt(artSvg(st.art, CREATURE_LOOK), 18, 'art'));
        if (gone) pic.appendChild(ripBand());
      } else {
        item.title = `Unterart ${s + 1} von ${SUBSPECIES_PER_CLASS}: Noch nicht entdeckt. Im Arten-Lexikon ansehen`;
        pic.textContent = '?';
      }
      item.append(pic, make('span', 'species-stage-name', known ? st.name : 'Unentdeckt'));
      item.addEventListener('click', () => open(c, s));
      strip.appendChild(item);
    });
    return strip;
  }
}
