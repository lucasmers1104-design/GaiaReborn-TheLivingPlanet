/* =============================================================================
 * SimEarth 2.0 — the dialog about the dinosaurs' fate
 * -----------------------------------------------------------------------------
 * Asked once, when the first birds have arisen (dinoera.ts): both lasting
 * consequences side by side before the choice. Only a choice closes it — no
 * Escape, no click beside it, no time limit — and no button starts focused.
 * Stacked blocks without css/dinofate.css, side by side with it. After the
 * strike a second, ordinary dialog tells what it did.
 * ========================================================================== */

namespace SE {
  function fateOption(title: string, lines: readonly string[]): HTMLElement {
    const box = make('section', 'dinofate-option');
    box.appendChild(make('h3', 'dinofate-title', title));
    const list = make('ul', 'dinofate-list');
    for (const line of lines) list.appendChild(make('li', undefined, line));
    box.appendChild(list);
    return box;
  }

  /** Ask the player; resolves with the choice, or null if no dialog could be shown — never with a choice of its own. */
  export async function askDinoFate(): Promise<'survive' | 'comet' | null> {
    const top = subspeciesName(Life.Mammal, MAMMAL_STAGE_BEFORE_COMET);
    const body = make('div', 'dinofate');
    body.appendChild(make('p', 'dinofate-intro',
      'Die ersten Vögel sind entstanden. Sie sind selbst Dinosaurier und könnten als einzige Linie einen gewaltigen Kometeneinschlag überstehen. Wie geht es auf deinem Planeten weiter? Die Entscheidung gilt für immer.'));
    const options = make('div', 'dinofate-options');
    options.append(
      fateOption('Dinos überleben', [
        'Kein Komet: Die Zeit der Dinosaurier geht weiter.',
        `Säugetiere entwickeln sich höchstens bis zu den ${top}.`,
        'Wale sowie Huftiere & Weidetiere bleiben gesperrt.',
        'Eine spätere Kometenentscheidung gibt es nicht.',
      ]),
      fateOption('Dinos sterben aus', [
        'Ein riesiger Komet schlägt ein und reißt einen gewaltigen Krater.',
        `Alle Dinosaurier außer den Vögeln verschwinden für immer, ebenso ${cometLostNames()}.`,
        'Die übrigen Tiere und Pflanzen verlieren rund drei Viertel ihrer Bestände. Von jeder Tierart und Unterart bleibt eine geschützte Population, bis sie wieder wachsen kann.',
        'Danach entwickeln sich Säugetiere weiter; Wale sowie Huftiere & Weidetiere werden erreichbar.',
      ]),
    );
    body.append(options, make('p', 'dinofate-note',
      'Kostet weder EP noch Ω. Dass die Säugetiere auf das Ende der Dinosaurier warten, ist eine Spielregel dieses Spiels, kein Naturgesetz.'));
    const value = await Modal.show({
      title: 'Das Schicksal der Dinosaurier', icon: eventIcon('meteor'), body, wide: true, mandatory: true,
      actions: [
        { label: 'Dinos überleben', value: 'survive', kind: 'secondary' },
        { label: 'Dinos sterben aus', value: 'comet', kind: 'secondary' },
      ],
    });
    return value === 'comet' || value === 'survive' ? value : null;
  }

  /** After the strike: what it did to this planet and, side by side, what Chicxulub did to the Earth. */
  export async function showCometNews(): Promise<void> {
    const body = make('div', 'dinofate');
    const sides = make('div', 'dinofate-options');
    sides.append(
      fateOption('Auf deinem Planeten', [
        `Alle Dinosaurier außer den Vögeln sind für immer ausgestorben, ebenso ${cometLostNames()}.`,
        'Die übrigen Tiere und Pflanzen haben rund drei Viertel ihrer Bestände verloren, nahe dem Krater fast alles.',
        'Staub verdunkelt den Himmel: Ein Impaktwinter lässt zwei Drittel des Planeten kurz zufrieren. Unter dem Eis überdauern die Pflanzen und wachsen wieder, sobald es zurückweicht. Jede Unterart der Tiere behält einen geschützten Rückzugsort.',
        'Säugetiere entwickeln sich jetzt über die Beuteltiere hinaus; Wale sowie Huftiere & Weidetiere werden erreichbar.',
      ]),
      fateOption('Auf der Erde vor 66 Millionen Jahren', [
        'Ein mindestens 10 km großer Himmelskörper traf die heutige Halbinsel Yucatán in Mexiko. Sein Krater Chicxulub ist über 180 km breit.',
        'Staub, Ruß und Schwefel verdunkelten den Himmel. Modellrechnungen zufolge stand die Photosynthese fast zwei Jahre still, und es wurde weltweit um bis zu 15 °C kälter.',
        'Rund drei Viertel aller Arten starben aus, darunter alle Dinosaurier außer den Vögeln, Flugsaurier, Ammoniten, Belemniten und Zahnvögel.',
        'Kleine Säugetiere überlebten und eroberten danach die frei gewordenen Lebensräume.',
      ]),
    );
    body.append(sides, make('p', 'dinofate-note',
      'Im Spiel ist es ein Komet; auf der Erde war es nach heutigem Wissen ein Asteroid aus dem äußeren Sonnensystem. Zu zwei Dritteln zugefroren ist die Erde damals nicht – das Eis zeigt hier, wie hart der Winter Pflanzen und Tiere traf.'));
    await Modal.show({
      title: 'Der Einschlag und seine Folgen', icon: eventIcon('meteor'), body, wide: true,
      actions: [{ label: 'Weiter', value: 'ok', kind: 'primary' }],
    });
  }
}
