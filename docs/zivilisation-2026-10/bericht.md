# Zivilisation neu: Städte, Siedler, Völker, Konflikte

Stand: 15. 10. 2026 · Spezifikation: `docs/zivilisation-spec.md` (Revision 2 mit den Entscheidungen vom 14. und
15. 10.) · Prüfung: `review.md` in diesem Ordner.

## Vorher und nachher

**Vorher:** Eine Stadt war nur ein Wert pro Kachel. Jede volle Stadt besetzte ihr direktes Nachbarfeld, daraus wuchs
immer ein einziger Teppich aus 8×8-Sprites. Bei Seed 12345 waren es nach 1500 Ticks 278 Stadtkacheln in einem
zusammenhängenden Gebiet. Völker, Wanderung und Konflikte außer dem Atomkrieg gab es nicht.

**Nachher:** Städte sind einzelne Orte mit mindestens 7 Feldern Abstand. Siedler ziehen sichtbar über die Karte und
gründen neue Städte an Flüssen und Küsten. Jede Stadt gehört zu einem Volk mit Farbe und Namen. Hunger, Seuchen und
seltene Kriege entstehen aus Knappheit. Die Stadtgrafik ist Pixel-Art im Stil der Landschaft und wechselt mit dem
Zeitalter.

| Bild | Inhalt |
|---|---|
| `zeitalter-staedte.png` | alle 7 Zeitalter, Dorf · Stadt · Großstadt, Flussstädte mit Brücke |
| `zeitalter-bausteine.png` | alle Bausteine, Höfe, Brücken und Wimpel |
| `zeitalter-figuren.png` | Siedler und Boote je Zeitalter in allen Volksfarben |
| `steinzeit-staedte.png` | Steinzeit mit Hof, Palisadenring und Tierabstand |
| `karte-namen.png` | Namen ab 24 px, Hover-Text, Markierungen bei 10 px |
| `nachher-16px.png`, `nachher-32px.png`, `nachher-fluss.png` | gespielter Planet nach den Korrekturen |
| `review-*.png`, `review2-*.png` | Belege der unabhängigen Prüfung |

## Was das Spiel jetzt tut

- **Städte** stehen auf genau einer Kachel. Ort, Zeitalter und Bevölkerung bleiben im Raster (`tech`, `cityPop`).
  Plattendrift und Katastrophen wirken deshalb unverändert.
  - Die Tragfähigkeit kommt aus dem Umland (Radius 3): Landschaft, Boden, Temperatur, Fluss und Meer.
  - Größenstufen: Dorf, Stadt, Großstadt.
- **Standorte:** nie auf Wasser, Eis, Schnee, Fels, Wüste, Ödland, Alpiner Matte oder im Hochgebirge über der
  Baumgrenze. Bevorzugt an Flüssen, Küsten und auf fruchtbarem Land.
- **Siedler:** Eine volle Stadt schickt eine Gruppe los, höchstens 5 sind gleichzeitig unterwegs. Reichweite und
  Wasser hängen vom Zeitalter ab:
  - Steinzeit: Flüsse und bis 2 Wasserfelder
  - Bronzezeit: bis 3 Wasserfelder
  - Eisenzeit: bis 6 Wasserfelder
  - ab der Industrie: offenes Meer

  Ab 0,6 % bebautem Land bricht niemand mehr auf. Die Städte wachsen dann nur noch in die Größe.
- **Völker:** höchstens 8, mit eigener Farbe und eigenem Namen.
  - Ein neues Volk entsteht ab 15 Feldern Abstand zur Hauptstadt (höchstens 6 auf diese Weise), nach einer Überfahrt
    oder selten durch Abspaltung.
- **Zeitalter:** Die Leitstadt eines Volkes erfindet die nächste Stufe, mit einer Rate für den ganzen Planeten. Andere
  Städte lernen von ihrem Volk und von weiter entwickelten Nachbarn.
  - Zwischen zwei neuen Höchststufen liegen mindestens 100 Ticks.
- **Hunger und Seuchen:** Hunger und Seuchen treten nur bei Knappheit auf. Eine Seuche springt auf Nachbarstädte über.
  Ab der Industrie dämpfen Hygiene und der Medizin-Regler die Seuchen.
- **Konflikte:**
  - Krieg gibt es nur zwischen benachbarten Völkern bei Knappheit.
  - Planetenweit läuft höchstens ein Krieg, danach folgen 120 Ticks Pause.
  - Dasselbe Völkerpaar hat danach 200 Ticks Frieden, beide Völker ruhen 150 Ticks gegenüber allen.
  - Beginn und Ende kommen als Meldung und Chronik-Eintrag mit beiden Völkern und Städten. Auf der Karte steht ein
    Kampfsymbol.
  - Der Atomkrieg braucht zwei Völker mit Atom-Städten.
  - Kämpft ein Volk im Atomzeitalter gegen eines ohne, beendet eine Atombombe den Krieg. Danach ächten alle Völker
    die Bombe für immer (20. 10. 2026).
- **Klima:** Energie und Atmung der Städte sind gewichtet, weil eine Stadt für ihr Umland steht. Die Industrie hebt
  das CO₂ spürbar.
- **Speichern:** Die Formatnummer ist unverändert. Ein optionales Feld `civ` hält Namen und Völker.
  - Fehlt das Feld, oder ist es ungültig, wird der Zustand aus dem Raster abgeleitet.
  - Alte Spielstände mit Stadtteppich werden dabei auf Einzelstädte ausgedünnt.
  - Siedler unterwegs, Friedenszeiten und Abklingzeiten gehen beim Laden verloren.
- **Wasserlebende Arten** bekommen vorerst keine Zivilisation.

## Darstellung

- **Städte:**
  - Pixel-Art aus Bausteinen je Zeitalter, ausgewählt nach Kachel-Hash.
  - Erzeugt aus Rezepten mit `tools/civ-atlas.js` in der Palette der Landschaft.
  - Gezeichnet als eigene Ebene über Boden und Vegetation, mit derselben Skalierung wie die Landschaft.
  - Hohe Gebäude ragen bis 4 px in die Kachel darüber.
  - Unter der Stadt liegt ein Hof, dessen Belag mit dem Zeitalter wechselt.
- **Größenstufen:** Großstädte bis zur Eisenzeit haben einen geschlossenen Ring, Städte ein Mauerstück. Ab der
  Industrie zeigt sich die Stufe über die Höhe der Gebäude.
- **Flüsse:** Die Gebäude stehen auf beiden Ufern, ab der Bronzezeit mit einer Brücke aus Holz, Stein oder Stahl.
- **Zoom:**
  - bis 16 px pro Kachel eine Markierung mit Volkswimpel in fester Größe
  - ab 24 px Namen unter den Städten
  - beim Überfahren Name, Volk, Größe und Zeitalter
- **Tiere** halten ein Feld Abstand zu Städten.
- **Siedler und Boote** sind SVG wie die Tiere und gleiten zwischen den Feldern. Menschen haben je Zeitalter eigene
  Figuren, andere Arten vorerst ein Bündel mit Volkswimpel.

## Messwerte

Probe `tools/civ-probe.js 2500` auf Seed 12345, 2024 und 99, Stand 15. 10. Die Probe spielt den Evolutionsbaum genau
wie `tools/headless.js --life`.

| Prüfung | 12345 | 2024 | 99 (erzwungen) |
|---|---|---|---|
| Intelligenz | Insekten, Tick 3919 | Insekten, Tick 3375 | erzwungen bei 6000 |
| Mindestabstand | 7,0 | 7,0 | 7,0 |
| Gründungen auf verbotenem Boden | 0 | 0 | 0 |
| an Fluss oder Küste | 93 % von 92 | 92 % von 90 | 96 % von 90 |
| Siedler unterwegs (Anteil der Ticks), höchstens gleichzeitig | 39 %, 5 | 37 %, 5 | 38 %, 5 |
| Landanteil Ende Eisenzeit / höchstens | 0,35 % / 0,62 % | 0,23 % / 0,62 % | 0,10 % / 0,61 % |
| Städte Ende Steinzeit (Ziel 3–10) | 4 | 3 | 4 |
| Städte Ende Eisenzeit (Ziel 8–25) | **48** | **32** | 14 |
| Kriege im ganzen Lauf, höchstens in 1000 Ticks | 11, 7 | 10, 7 | 9, 6 |
| Meldung zu Beginn und Ende | alle | alle | alle |
| Seuchen je 1000 Ticks: Eisenzeit / Industrie | 40 / 42 | 13 / 14 | 5 / 8 |
| CO₂ in 500 Ticks ab der ersten Industriestadt | +187 | +136 | +94 |
| Völker nach Überfahrt | 2 | 6 | 6 |

Außerdem:
- **Speichern und Laden (Prüfung C4):** 38 von 38 Städten behalten Namen und Volk, auch nach Drift und Übernahme. Ein
  manipuliertes Feld wird verworfen. Ein alter Teppich aus 3445 Stadtfeldern wird zu 158 Städten mit Abstand ≥ 7.
- **Leistung:** `civ.step` höchstens 0,4–1,5 ms pro Tick; die Stadtebene braucht 0,1–0,6 ms je Neuzeichnung.
- **Tests:** zuletzt mit dem Gesamtstand 236 von 236 grün; nach den letzten kleinen Änderungen die 50 Tests der
  Zivilisation, der Herden und des Speicherns.

**Nicht erreicht:** Die Dauer der Zeitalter streut stark, die Eisenzeit zum Beispiel zwischen 300 und 700 Ticks. Eine
lange Eisenzeit füllt die Kontinente schon vor der Industrie: 32–48 Städte statt höchstens 25. Auf einem Planeten
gibt es dann in Eisenzeit und Industrie etwa 40 Seuchen je 1000 Ticks, und das CO₂ steigt um 187 statt höchstens
150 ppm. Der Deckel bei 0,6 % Land hält trotzdem.

## Werkzeuge

- `node tools/civ-probe.js [Ticks] [Seeds …] [--epoch=…]`: Abnahmewerte als CHECK-Zeilen.
- `node tools/civ-atlas.js [--check] [--sheet] [--era] [--write]`: Stadt-Atlas und Kontaktbögen.
- Tests: `civ`, `conflict`, `civart` und `herds`; dazu `save` für das optionale Feld.

## Einschränkungen und offene Punkte

- **Nur in headless Chrome geprüft.** Andere Browser, echte Touch-Geräte, Handys (nur Geräteemulation) und Klang sind
  nicht geprüft.
- **Menschliche Siedlerfiguren** sind nur auf Kontaktbögen zu sehen. In den gespielten Browserläufen wurden Vögel
  oder Insekten intelligent.
- **Bei 16 px** stehen weiter viele Tier-Icons im Bild. Die Städte findet man über die Wimpel-Markierung.
- **Zeitalter streuen** trotz der Mindestdauer stark, weil jede Erfindung ein Zufall ohne Gedächtnis ist.
- **Seuche in `geo.ts`:** Sie sucht Städte noch mit 200 Zufallsversuchen und feuert bei lockerer Besiedlung kaum. Sie
  wird nach dem Merge der Geologie über die Städteliste geführt.
- **Vorgeschichte:** Bis zur Intelligenz zieht `CivSystem.step` die Zufallszahlen der alten Stadtlogik. So verläuft
  die Geschichte jedes Planeten bis dahin genau wie vor dem Umbau.
- **Laden ohne Feld:** Bei Spielständen ohne das Feld `civ` können gedriftete Städte und die Völker andere Namen
  bekommen.

## Nachtrag 20. 10. 2026: Beginn der Zivilisation und Epochen-Optik

**Vorher:** Mit der Intelligenz stand sofort eine Stadt auf der Karte. Alle Zeitalter bauten nach demselben Plan
einen dichten Klumpen in die Feldmitte; Dorf, Stadt und Großstadt unterschieden sich kaum (`vergleich-vorher.png`).

**Nachher:**
- **Wandergruppen** (`src/bands.ts`, Spezifikation 2.13): Mit der Intelligenz (von selbst oder durch den Monolithen)
  erscheinen 3 Gruppen ohne Stadt. Sie lagern 12–20 Ticks (2–4 Unterstände um ein Feuer, einzeln auf- und abgebaut),
  ziehen 4–8 Felder über Land weiter und werden nach frühestens 90 Ticks an einem Ort mit Nahrung und Wasser
  sesshaft. Später sinken die Ansprüche (ab 160 Ticks ohne Wasser, ab 240 jeder erlaubte Ort), damit nie etwas
  dauerhaft hängt. Das Städte-Werkzeug gründet weiter sofort.
- **Meldungen:** „“ und „“ („“) sind getrennte Chronik-Einträge. Andere Arten heißen mit ihrem Klassennamen.
- **Speichern:** Die Gruppen stehen im Feld `civ` (`bands`) und laden exakt. Fehlen sie oder sind sie ungültig,
  ziehen vor der ersten Sesshaftigkeit neue Gruppen los.
- **Epochen:** eigene Baupläne mit freien Flächen (`src/cityplans.ts`) und überarbeitete Bausteine aller Zeitalter.
  Der Stadtrahmen ist 20 × 24 px; Türme und Schlote ragen in die Nachbarfelder (`vergleich-nachher.png`).
- **Animation:** Lager- und Dorffeuer flackern, Fabrikschlote rauchen. Beides zeichnet `src/cityfire.ts` jedes Bild
  über die zwischengespeicherten Stadtbilder; bei „“ steht Bild 0 still.
- **Figuren:** Menschen ziehen als Zweiergruppe. Andere Arten erscheinen als ihre eigene Tierfigur mit Fackel
  (Wandergruppe) oder mit Bündel und Volkswimpel (Siedler); der neutrale Platzhalter entfällt. Tier-Icons halten
  ein Feld Abstand zu Lagern wie zu Städten.

| Bild | Inhalt |
|---|---|
| `vergleich-vorher.png`, `vergleich-nachher.png` | Lager, Dorf, Stadt, Großstadt, Großstadt am Fluss je Zeitalter am selben Ort, 3× sowie 1× und 2× |
| `spiel-lager-32px.png` | Lager zweier Gruppen an der Küste, gespielter Planet (Seed 12345, Komet), 32 px |
| `spiel-wandergruppe-32px.png` | eine Gruppe unterwegs zum nächsten Lager |
| `spiel-erstes-dorf-32px.png` | das erste Dorf mit Feuerplatz, 98 Ticks nach der Intelligenz |
| `spiel-industrie-rauch-32px.png` | derselbe Ort als Industrie-Großstadt mit Rauch über dem Schlot |

**Messung** (Spielstände bei der Intelligenz, dann weitergespielt):

| Seed | Dörfer aus den Gruppen (Ticks nach der Intelligenz) | Lager je Gruppe |
|---|---|---|
| 12345 | +98, +104, +110 | 5 |
| 2024 | +94, +102, +139 | 5–6 |
| 99 | +103, +147, +173 | 5–8 |

Bei „“ (400 ms je Tick) dauert die Wanderphase also gut eine Minute. `tools/civ-probe.js 2500 12345|2024
--dino=comet` besteht danach dieselben Prüfungen wie vorher; die Stadtzahl am Ende der Eisenzeit streut vorher wie
nachher über die Grenze.

**Werkzeuge:** `node tools/civ-atlas.js --sheet <dir> --part compare` erzeugt die Vergleichstafel aus dem im Speicher
gebauten Atlas; `CIV_ATLAS_MEMORY=1 node --test tests/civart.test.js` prüft Rezepte vor dem Schreiben des Atlas.

**Einschränkungen:**
- Nur in headless Chrome geprüft, nur die Menschen im echten Spielablauf; andere Arten auf Kontaktbögen und mit
  eingesetzten Gruppen.
- Wandergruppen gleiten nur bei der Systemeinstellung „“ nicht; „“ hält nur
  Flamme und Rauch an.
- Die Großstadt des Informationszeitalters bleibt eng, weil alle Grundflächen auf der eigenen Kachel stehen. Eine
  Steinzeit-Großstadt mit Fluss durch die Feldmitte hat keinen Palisadenring und wirkt dünn.
- Der Monolith schreibt wie zuvor keinen Chronik-Eintrag „“, nur eine Meldung.
