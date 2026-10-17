# Strände und Kokospalmen: Prüfung im Spiel

Stand: 17. 10. 2026 · Agent E (Prüfung und Doku) · Regeln: `docs/biomes-spec.md` §4.10

## Aufbau der Prüfung

- **Bundle:** eigenes `tsc --outFile` (nicht das geteilte `simulation.js`), Atlas mit `beach` und `coconut_palm`.
- **Spielstand:** Epoche „Heute“, 6.000 Ticks gieriger Evolutionsbaum (Gegenwart + 11 Mio. J.). Die Blütenpflanzen wurden 100 Mio. Jahre zurückdatiert, damit die Palmen sicher da sind.
- **Bilder:** headless Chrome über DevTools, ein Ladevorgang, alle Ansichten nacheinander. Fenster ausgeblendet, Tierebene aus.
- **Tests (eigenes Bundle):** `beaches` (6/6, der Platzierungstest läuft jetzt, 0 übersprungen), `terrain`, `landrender`, `landscape`, `savannatrees`, `cacti`: alle grün. `tools/green-probe.js`: alle sechs Prüfungen OK.

## Ergebnis

| Prüfpunkt | Urteil | Beleg |
|---|---|---|
| Strände nur an warmen, flachen Küsten, in Abschnitten | **erfüllt** | 182 Strandkacheln auf der Erde. Südnorwegen: 0 (`strand-5`). Golfküste: zusammenhängende Abschnitte, dazwischen Steilküste und Wald (`strand-1`). |
| Sand liest sich als Strand | **erfüllt, mit Einschränkung** | Neben Wald und Savanne ein heller, glatter Streifen (`strand-1`, `strand-3`). An Wüstenküsten geht er fast nahtlos in die Wüste über (`strand-2`). Das ist natürlich, aber dort trennen nur die Palmen Strand von Wüste. |
| Übergang zu Brandung, nassem Saum und Vegetation | **erfüllt** | Brandung und heller Nasssaum wie an jeder Küste. Zum Land hin weiche Maskenkante ohne Treppen (`strand-1`). |
| Palmen stehen auf Sand, neigen sich zum Meer | **erfüllt** | Füße liegen in der eigenen Strandkachel, auch bei Paaren (Overlay geprüft). Die Kronen neigen sich zum Wasser (`strand-2`, `strand-3`). |
| Größe und Dichte | **erfüllt** | Etwa so hoch wie die Palmfarne im Wald. 59 von 182 Strandkacheln tragen Palmen: locker, keine Allee. |
| Kein Flackern bei laufender Zeit | **erfüllt** | Nach 40 bzw. 60 weiteren Ticks sind Strand- und Palmenkacheln identisch. Pixeldifferenz nur in der animierten Brandung, auch an Küsten ohne Strand (`strand-7`, rot). |
| Untersuchen-Fenster sagt „Sandstrand“ | **erfüllt nach Fix** | `strand-6`: Feldbild mit Palme, Überschrift „Sandstrand“. |

## Behobener Fehler

- **Untersuchen-Überschrift:** Sie zeigte auf Strandkacheln „Wüste“ (oder die jeweilige Landschaft). „Sandstrand“ stand nur im Tooltip (`landscapeLabel`).
  - Fix: `src/examinepanel.ts` `tileHead` nimmt bei `isBeach` jetzt „Sandstrand“ als Namen.

## Beobachtungen (kein Fehler, Entscheidung offen)

- **Wenige tropische Strände:** An warmen und tropischen Küstenkacheln scheiden tropische vor allem aus zwei Gründen aus:
  - Feuchtgebiet-Zone (69), dort wächst Sumpfwald
  - Höhe über 0,06 (122)

  Das ergibt 34 tropische gegenüber 127 warmen Strandkacheln. Indonesien hat deshalb kaum Strände (`strand-4`), die Karibik nur an Golf und Bahamas. Mehr Tropenstrände bräuchten eine Lockerung der Zonenregel. Dabei muss die Hysterese gewahrt bleiben: Die Landschaft selbst wechselt öfter als die Zone.
- **Palmen auf Wüstenküsten:** Kokospalmen stehen auch an Wüstenküsten (Arabien, Nordwestaustralien), weil „warm“ genügt.
- **Feldbild im Untersuchen-Fenster:** Es zeigt die Palmen. Die Pflanzenliste bleibt „Keine Pflanzen“, denn die Palmen sind nur Darstellung.

## Nicht geprüft

- Andere Browser, echte Touch-Geräte, Handy-Ansicht
- Zufalls-Planeten außerhalb der Epoche „Heute“ (nur der Unit-Test)
- Zoomstufen unter 16
