/* =============================================================================
 * SimEarth 2.0 — the lineage row of the species info box
 * -----------------------------------------------------------------------------
 * Before → this → after: the neighbouring sub-species of the group, or at the
 * ends the parent group and the daughter groups from the evolution tree.
 * Undiscovered neighbours show as "?" silhouettes, which is what keeps the
 * next find something to look forward to.
 * ========================================================================== */

namespace SE {
  /** The most advanced discovered stage of a class, else its first. */
  function latestKnown(dex: FaunaDex, c: Life): number {
    for (let s = SUBSPECIES_PER_CLASS - 1; s >= 0; s--) if (dex.isDiscovered(c, s)) return s;
    return 0;
  }

  function column(
    dex: FaunaDex, world: WorldState, title: string, items: readonly { ref: FaunaRef; label: string }[], empty: string,
    pick: (c: Life, stage: number) => void, self = false,
  ): HTMLElement {
    const col = make('div', `fauna-lineage-col${self ? ' is-self' : ''}`);
    col.appendChild(make('span', 'fauna-lineage-title', title));
    if (items.length === 0) col.appendChild(make('span', 'fauna-note', empty || '—'));
    for (const { ref, label } of items) {
      const known = dex.isDiscovered(ref.c, ref.stage);
      const name = known ? subspeciesName(ref.c, ref.stage) : '?';
      const item = self ? make('div', 'fauna-link is-self') : document.createElement('button');
      item.className = `fauna-link${self ? ' is-self' : ''}${known ? '' : ' is-unknown'}`;
      const gone = known && stageGone(world, ref.c, ref.stage);
      item.append(faunaPicture(ref.c, ref.stage, known, `fauna-pic-sm${gone ? ' is-gone' : ''}`), make('span', 'fauna-link-name', name), make('span', 'fauna-link-label', label));
      if (item instanceof HTMLButtonElement) {
        item.type = 'button';
        item.dataset.focusKey = `link:${ref.c}:${ref.stage}`;
        item.setAttribute('aria-label', `${known ? name : 'Unbekannte Art'} – ${LIFE[ref.c].name}, ${faunaStageLabel(ref.stage)}`);
        item.addEventListener('click', () => pick(ref.c, ref.stage));
      }
      col.appendChild(item);
    }
    return col;
  }

  /** The entries left and right of a sub-species in its lineage row. */
  export function faunaNeighbours(dex: FaunaDex, c: Life, stage: number): {
    before: { ref: FaunaRef; label: string }[]; after: { ref: FaunaRef; label: string }[];
  } {
    const node = nodeForLife(c);
    const before: { ref: FaunaRef; label: string }[] = [];
    if (stage > 0) before.push({ ref: { c, stage: stage - 1 }, label: `Unterart ${stage}` });
    else if (node?.parent) {
      const p = EVO_BY_ID.get(node.parent);
      if (p?.life !== undefined) before.push({ ref: { c: p.life, stage: node?.parentStage ?? latestKnown(dex, p.life) }, label: p.name });
    }
    const after: { ref: FaunaRef; label: string }[] = [];
    if (stage < SUBSPECIES_PER_CLASS - 1) after.push({ ref: { c, stage: stage + 1 }, label: `Unterart ${stage + 2}` });
    else {
      for (const n of EVO_NODES) {
        if (n.parent === LIFE[c].id && n.life !== undefined) after.push({ ref: { c: n.life, stage: 0 }, label: n.name });
      }
    }
    return { before, after };
  }

  export function faunaLineage(dex: FaunaDex, world: WorldState, c: Life, stage: number, pick: (c: Life, stage: number) => void): HTMLElement {
    const { el, body } = faunaSection('Stammbaum');
    const row = make('div', 'fauna-lineage');
    const { before, after } = faunaNeighbours(dex, c, stage);
    row.append(
      column(dex, world, 'Vorher', before, stage === 0 ? 'Anfang des Lebens' : '', pick),
      make('span', 'fauna-arrow', '→'),
      column(dex, world, 'Diese', [{ ref: { c, stage }, label: `Unterart ${stage + 1}` }], '', pick, true),
      make('span', 'fauna-arrow', '→'),
      column(dex, world, 'Danach', after, 'Keine Tochtergruppe', pick),
    );
    body.append(row, make('p', 'fauna-note', 'Im Spiel geht jede Unterart aus der vorigen hervor; ausgestorbene (R.I.P.) kehren nicht zurück. Auf der Erde sind sie nach ihrem ersten Auftreten geordnet – dort stammt nicht jede direkt von der vorigen ab.'));
    return el;
  }
}
