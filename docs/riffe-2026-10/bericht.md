# Riffe, Lagunen, Strände und Palmen: Umbau und Prüfung

Stand: 18. 10. 2026 · Regeln: `docs/biomes-spec.md` §4.10 · Code: `src/reefs.ts`, `src/landshore.ts`, `src/landwater.ts`

## Was sich geändert hat

- **Strand-Biom entfernt.** Der Strand war seit v0.8.4 ein eigener Boden (`beach`, ganze Kacheln) mit `src/beaches.ts`. Jetzt ist er ein schmales Detail des Küstenpasses.
  - Textur, Schichten (nasse Linie, trockener Sand, Rippel, Muscheln) und Palmen-Sprites sind unverändert übernommen. Der Sand liegt jetzt als Overlay `beach_sand` im Atlas.
  - `SAVE_FORMAT` war für den Strand nie erhöht worden. Es gibt nichts zu migrieren.
- **Riffe und Lagunen** werden nur beim Zeichnen aus dem Simulationszustand abgeleitet. Die Simulation selbst ist unverändert: kein neues Speicherfeld, kein Tick-Schritt, keine Zufallszahlen. Das gilt auch für Seeds und Spielstände.
- **Hauptkarte:** nur noch Küstenmeer und Hochsee, Türkis nur in Lagunen. Tiefe zeigen nur die Tiefenansichten, dort in Metern nach den Erddaten (3.500 m am Schelfrand, 6.000 m in der Tiefsee).
- **Palette:** 88 Farben. Die Rampen `waterWarm` (Lagune) und `reefUnder` (Korallen, Riffsand) hängen hinter `mask`, alle alten Indizes bleiben. Terrain-, Effekt- und Stadt-Atlas sind neu erzeugt.

## Aufbau der Prüfung

- **Bundle:** eigenes `tsc --outFile` im Scratchpad, Node 22 und headless Chrome. Das geteilte `simulation.js` ist am Ende einmal neu gebaut.
- **Spielstände:**
  - Epoche „Heute“, Seed 12345, gieriger Evolutionsbaum, 4.701 Ticks (vor 1,78 Mio. J.).
  - Für die Strandbilder eine Kopie davon, in der an 131 Rifffeldern Echte Knochenfische gesetzt sind. Nur zum Ansehen, die Fische sterben im Lauf schnell aus.
- **Tests:**
  - neu: `tests/reefs.test.js` (15 Tests, auch in `test:quick`)
  - `npm run test:quick` auf dem neu gebauten `simulation.js`: grün, 0 Fehler
  - Terrain-, fx- und Stadt-Atlas byte-genau
  - Wellen-Test (`hazard-water`) grün
  - Die volle Suite ist nicht gelaufen.

## Ergebnis

| Prüfpunkt | Ergebnis |
|---|---|
| Strandbreite | vorher eine ganze Kachel (16 px bei 1×, `riffe-1`), jetzt 2–4 px, in Buchten bis 5, auf Landzungen 1 oder keiner (`riffe-2`, `riffe-3`) |
| Zwei Meeresklassen | flach, Schelfrand 3–4 px gedithert, Rippel je Klasse (`riffe-4`, `riffe-7`); vorher Tiefenverlauf (`riffe-6`) |
| Tiefe nur in Tiefenansichten | „Ozeane“ aus: Tiefenrampe je Feld (`riffe-5`); Übersicht „Gelände“ und „Meeresboden“ mit Meter-Legende aus `seaDepthMeters` |
| Riffe und Strände auf „Heute“ | 692 Rifffelder, nur im Warmen und höchstens 3 Felder vor dem Land; 337 beweidet mit Sand; 138 Riffstrand-, 4 Muschelstrand-Felder |
| Zufallsplanet (Seed 777, vor 96 Mio. J.) | 143 Rifffelder, 35 Riffstrand-, 33 Muschelstrand-Felder; Palmen kommen dort erst ab 86 Mio. J. |
| Warum anfangs kaum Strände | Die Unterarten-Stufe eines Feldes ist eine kosmetische Leiter: Sie zeigt nur die jüngste Form. Auf den meisten Feldern steht noch eine ältere. Korallen-Stufen lagen auf dem Zufallsplaneten fast nur auf der Hochsee (939 von 951 Feldern), Knochenfische selten neben Riffen. Jetzt gilt: Sobald Korallen bzw. Echte Knochenfische auf dem Planeten entstanden sind, bauen Nesseltiere an warmen Küsten Riffe (Larven aus bis zu 2 Feldern) und Fische beweiden das ganze Riff. |
| Testplanet mit Fischen | 173 Riffe mit Sand, 108 Riffstrand-Felder (`riffe-2`) |
| Palmen | 19 von 59 per Hash gewünschten stehen (Testplanet). Der Rest findet keinen Platz, an dem Fuß (auf dem eigenen Feld, 1–2 px hinter der nassen Linie, Streifen ≥ 2 px) und Krone (3–6 px über dem Wasser) zugleich passen. Nord- und Südküsten tragen keine, weil die Sprites nur nach links oder rechts neigen. Paare: groß und mittel, 3 px Höhenunterschied. |
| Keine Nähte | Strand, Riff und Riffkante sind an Chunk-Grenzen pixelgleich (Test). Der gezeichnete Strand ist pixelgleich mit `landBeachAt` (Test). |
| Kronen über Wasser | weder Brandung noch Meer für die Wellen-Effekte (Test) |
| Flackern | „Heute“, 500 weitere Ticks: nur 2 Ticks mit Änderung, zusammen 4 Feldwechsel (1 Riff, 1 Lagune, 3 Strand gezählt je Wert). Kein Feld wechselt hin und zurück. Das liegt am ruhigen Zustand, nicht an einer Hysterese (siehe unten). |
| Kosten der Riffkarte | Chrome 0,91–0,93 ms je Neuberechnung (Erde mit 692 Rifffeldern, Zufallsplanet). |
| Kosten der Komposition | „Heute“: 2,43 ms je Chunk (vorher 2,70; flache Meereszellen sind billiger). Testplanet mit vielen Stränden: 3,04 ms. |

Bilder:
- `riffe-1-strand-vorher-zoom48.png` / `riffe-2-strand-nachher-zoom48.png`: dieselbe Bucht vorher und nachher, ohne Tierebene
- `riffe-3-riff-lagune-zoom64.png`: Riff unter den Rippeln, Lagune, Strandstreifen
- `riffe-4-meer-zwei-klassen-zoom16.png`
- `riffe-5-ozeane-aus-tiefe-zoom16.png`
- `riffe-6-golf-vorher-zoom48.png` / `riffe-7-golf-nachher-zoom48.png`: echter Spielstand, mit Tieren
- `riffe-8-clownfisch-ablauf-zoom32.png`: ein Clownfisch-Ausflug bei 32 px, 4× vergrößert (aus der Koralle, Runde, zurück)
- `riffe-9-clownfisch-ansicht-zoom32.png`: dieselbe Stelle mit Umgebung, 3× vergrößert

## Abgestimmte Werte

- **Lagune:** Türkis-Rampe wie vorgeschlagen (`#1f9fb0 … #7fe0d6`), Grundton `waterWarm1`. Die Stufen werden pixelweise per Bayer eingemischt. Ein 2×2-Block-Dither wirkte am Bildschirm wie ein Raster und ist verworfen.
- **Korallenfarben:** Eine Mischung zu 50 % in RGB machte aus Ocker Salbeigrün, aus Violett Blau und aus Gelb Limette. Sie sind deshalb in OKLCH gemischt, der Farbton nur zu 12 %. Damit bleiben Braun und Ocker (Farbton 31–46°), Rosa (321°), Orange (32°), Violett (271°) und Gelb (59°) gedämpft erkennbar. Seit 20. 10. stärker ins Wasser gezogen (siehe unten).
- **Quantisierung:** Die Dichten werden in Stufen von 0,2 gelesen. Riffgröße, Fleckenzahl und Sand ändern sich daher nur beim Stufenwechsel; besiedelte Korallen und Fische liegen mit etwa 0,5 mitten in einer Stufe.
  - Die Schwellen selbst (20 °C, Mindestdichte) haben keine Hysterese. Eine echte Hysterese bräuchte gespeicherten Zustand, und den schließt die Grundregel aus.
  - Eine Temperaturstufe von 2 °C hätte nichts entschieden und ist entfallen.
- **Sand:** Die Zahl der Sandflecken wird aufgerundet. Wo Weidefische leben, zeigt das Riff also immer etwas Sand.
- **Große Flussmündung:** `riverFlow` ≥ 200. Auf „Heute“ führen die Mündungen 100–430.
- **Weidefische** zählen ab Dichte 0,05, wie Tiere für die Kartenmarker. Mit der Dichtestufe 0,2 gab es kein einziges beweidetes Riff.

## Behoben nach dem Review (drei parallele Gutachter)

- **Palmen an Chunk-Grenzen:** Ein Palmenfuß konnte bis 13 px außerhalb seines Feldes stehen und wurde dann am Chunk-Rand abgeschnitten. Jetzt bleibt er auf dem eigenen Feld.
- **Untersuchen-Bild:** Es zeigte Korallen der Nachbarfelder. Kalte Korallen erscheinen dort jetzt wie auf der Karte als höchste Nicht-Korallen-Form.
- **„Art auf der Karte zeigen“:** Für Korallen wird ein warmes Feld gewählt.
- **Chronik:** Riffe und Strände, die ein geladener Spielstand schon hat, kommen still in die Chronik, wie bei den Sauerstoff-Meilensteinen.
- **Riffkanten-Schaum:** an der Datumsgrenze nahtlos.
- **Ozeane aus:** Pflanzen bleiben auf dem dann nicht gezeichneten Strand stehen.
- **Titel-Globus:** teilt das Meer nach Biom ein wie die Hauptkarte.
- **Höhenschwelle:** `UPLAND_ELEVATION` gemeinsam für Strand und Höhenstufe.
- **Mündungstest:** prüft jetzt eine Stelle, an der ohne Fluss Riff und Strand lägen.
- **Bekannt und dokumentiert:** Während eines Pinselstrichs behalten Riffe, Lagunen und Strände ihren letzten Stand, wie die Flüsse. Am Ende des Strichs liest die Karte alles neu.

## Unter Wasser: Tönung, Dünung, Clownfische (20. 10. 2026)

Die Korallen wirkten wie auf die Wasseroberfläche geklebt. Drei Änderungen, alle nur im Bild:

- **Tönung** (`tools/terrain/palette.js`, `coast.js`): Rampen `reefUnder` und `coral` neu, Länge und Indizes gleich. Alle drei Atlanten sind neu erzeugt, weil sie die Palette tragen.
  - Körper und Lichter: Helligkeit 0,61–0,75 (OKLCH) um das Lagunen-Türkis (0,716), Lichter höchstens 0,75 und damit unter der Rippel-Stufe `waterWarm2`; Sättigung höchstens 0,094; Farbton weiter nur 12 %. Ein türkiser Schleier in OKLab machte Braun und Ocker oliv und ist verworfen.
  - Schattenseiten: die Körperfarbe zu 42 % ins Lücken-Türkis, Helligkeit 0,585. Sie lesen sich als Türkisgrau statt als dunkler Umriss. Lücken-Türkis `coral0` von `#187d8e` auf `#3b9099`.
  - Ränder: Wo eine Kolonie mindestens 2 px dick ist, weicht jedes zweite Umrisspixel; oben links zeigt es das Wasser, unten rechts das Schatten-Türkis.
- **Dünung** (`src/reefswell.ts`): Ab und zu läuft ein heller Kamm von der offenen See über das Riff zum Land und verebbt über der Lagune.
  - Das Feld dahinter: Abstand jeder Kachelmitte zur offenen See (bis 3 Felder) plus ein langsamer Zeitversatz, dazwischen bilinear. Die Fronten laufen deshalb ohne Naht über Kacheln und Chunks.
  - Takt: alle 6 s eine Welle, bis 1,8 s verspätet, 11 px/s. Die Stärke schwankt entlang der Küste, eine Stelle sieht etwa alle 6–14 s einen Kamm.
  - Farben: Wasser eine Stufe heller auf seiner Rampe; Korallen die nächste hellere Palettenfarbe zu 25 % Richtung `waterWarm3` (OKLab, Farbton gewichtet), so bleibt ihr Ton erhalten.
  - Ab 16 px pro Feld, mit der Ebene „Ozeane“; nicht bei „Effekte reduzieren“.
  - Kosten in Chrome: 0,3 ms je Bild bei 48 px, 0,7–1,0 ms bei 16 px mit 178 Rifffeldern.
- **Clownfische** (`src/clownfishlayer.ts`, Sprite `clownfish` aus `tools/fx/reeffish.js`): 1 Fisch oder ein Paar (60 %) gleitet aus einem der drei größten Korallenköpfe, schwimmt eine Schleife von 6–14 px, verharrt kurz und gleitet in denselben oder einen Nachbarkopf zurück, 4–7 s.
  - Wo: auf jedem Riff, sobald es entstanden ist, ob Stein- oder Runzelkorallen, mit oder ohne Weidefische; über Lagune und Riff, nie über offenem Blau, Sandinseln, Palmen, Land oder Städten.
  - Seit wann: ohne Datumsgrenze, bewusst vereinfacht (Entscheidung des Entwicklers, 20. 10. 2026). Echte Clownfische gibt es erst seit etwa 13 Mio. J. (Radiation auf Seeanemonen; Litsios et al. 2012, *BMC Evol. Biol.*); eine Grenze dort machte sie in den meisten Partien unsichtbar.
  - Wie selten: Jedes Feld hat eine Runde von 25–45 s und macht in 35 % davon einen Ausflug. Im Bild hält jeder Start die anderen 3–10 s zurück, höchstens 3 laufen zugleich. Probe am Great Barrier Reef: in einer Ansicht von 13 × 8 Feldern 6 Ausflüge je Minute, 44 % der Zeit keiner, fast nie zwei.
  - Ab 24 Bildschirmpixeln pro Feld (CSS-Pixel × Skalierung), also bei 150 % Windows-Skalierung schon ab 16 px Zoom. Anfangs lag die Schwelle bei 32 CSS-Pixeln, im obersten Drittel des Zooms (10–48); im Spiel fand man so keine Fische. Nicht bei „Effekte reduzieren“ oder reduzierter Bewegung.
  - Das Untersuchen-Fenster sagt auf jedem Riff „Clownfische leben in Seeanemonen dazwischen“. Gezeichnet über der Dünung, weil ein Kamm die Meeresfarbe malt und sonst Löcher in den Fisch schnitte.
- **Untersuchen:** Wer mit der Lupe auf ein Feld klickt, auf dem oder neben dem gerade Clownfische unterwegs sind (bis 2 s nach dem Zurückschlüpfen), sieht die Karte „Clownfische im Riff“. Beim ersten Mal kommt „Clownfische entdeckt“ in die Chronik (`sight:clownfish`, wie die Lachswanderung in `src/migrations.ts`). Das ist die Bedingung für das Achievement „Nemo gefunden“ (Nr. 51).
- **Tests:** `tests/reefswell.test.js` (2), `tests/clownfish.test.js` (8); dazu Riff-, Terrain-, Effekt- und Stadt-Atlas-Tests grün (48), `test:quick` grün.
- **Geprüft** in headless Chrome am angelegten Riff (Erde „Heute“, Great Barrier Reef) bei 16, 32 und 48 px pro Feld. Bekannt: Die großen Tier-Symbole der Ebene „Leben“ liegen über den Fischen; ein Fisch kann darunter hervorschwimmen.

## Offene Entscheidungen

- **Palmen-Quote:** Fuß 1–2 px hinter der nassen Linie, Streifen ≥ 2 px und Krone 3–6 px über dem Wasser lassen sich an vielen Küsten nicht zugleich erfüllen.
  - Möglichkeit: die Untergrenze des Überhangs auf 2 px senken.
- **„Meeresboden“** zeigt Land jetzt in einem flachen Grau, damit die ganze Farbskala der Tiefe gehört.

## Nicht geprüft

- andere Browser als headless Chrome
- Titel-Globus, Übersichtskarte „Lebensräume“ und Speicherstand-Vorschaubilder nur im Code; beim Laden keine Seitenfehler
- Untersuchen-Fenster und Chronik-Texte nur per Test, nicht im Bild
- die alte Kachelansicht (`?terrain=legacy`)
- Zufallsplaneten nur in den Unit-Tests
