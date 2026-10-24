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

## Wassereffekte, experimentell (24. 10. 2026)

Prototyp, **standardmäßig aus**. Einschalten unter Einstellungen → „Wassereffekte verbessern (experimentell)“ (sofort, ohne Neustart, Kamera bleibt). Gespeichert in `simearth2.settings` (`waterFx`); ältere Einstellungen ohne das Feld laden als „aus“. `?waterfx=on|off` setzt den Startwert nur für diesen Seitenaufruf und speichert nichts; der Schalter bleibt bedienbar.

- **Kaustiken:** langsam wandernde Lichtnetze auf Korallen, Riffsand und Wasser in Riffen und Lagunen. Farben wie bei der Dünung (`reefSwellLift`): Wasser eine Rampenstufe heller, Korallen ihre Glanzfarbe. Das Netz besteht aus runden Zellen von etwa 16 × 14 px, langsam verbogen, an Knoten dicker. Es fließt in Flecken über das Riff und wird zum Land hin schmaler; das letzte Pixel vor dem Trockenen bleibt frei.
- **Glanz:** kurze waagrechte Lichtkämme von 1–4 px auf offener See, eine Stufe heller, die Mitte langer Kämme zwei Stufen. Sie liegen in breiten, langsam ziehenden Zonen, erscheinen über rund 2–3 s und vergehen wieder. Sie lesen sich wie die gebackenen Rippelstriche, die sich bewegen. Der Glanz kommt nie näher als 5 px ans Ufer (dort sind Brandung und Dünung) und wird nie zu Schaum, Eis oder Weiß. Die funkelnden Sterne aus `ambient.ts` bleiben unverändert.
- **Aufbau:**
  - `src/waterfxgl.ts`: WebGL2-Programm auf eigener Leinwand, die nicht in der Seite hängt. Ein Pixel ist ein Atlaspixel.
  - `src/waterfx.ts`: Schalter, Masken und die Kopie ins Kartenbild. Sie liegt direkt über dem gecachten Gelände (`EditView.render`) und unter Brandung, Dünung, Clownfischen, Tieren, Schiffen, Ereignissen und Beschriftung.
  - Masken: `LandMotion.sea` jedes Chunks, also die komponierte Farbe, wo Meer sichtbar ist. Untergetauchte Korallen und Riffsand gehören dazu, Sandinseln, Palmen, Strand und Meereis nicht. Je Chunk ein 256 × 256-Platz. Ein Chunk wird nur hochgeladen, wenn er neu komponiert ist und sich sein Meer geändert hat (Prüfsumme), höchstens 8 je Bild. Ohne die Prüfsumme lud das laufende Spiel rund 70 Chunks je Sekunde hoch, weil die Landschaft Chunks für Pflanzen und Land laufend neu komponiert. Ein Besitzerfeld verhindert, dass ein noch leerer Platz einen fremden Chunk zeigt.
  - Je Feld: Riff oder Lagune aus `TerrainField`, bilinear zwischen den Feldmitten. Gesperrt sind Felder mit Ereignis-Symbol oder Flutwelle und solche, deren Bild gerade überblendet (Pinsel, Meereis); bei Städten ihr Bildkasten (2 px seitlich, 8 px nach oben).
  - Alle Gitter wickeln an der Weltbreite. Darum gibt es keine Naht an Feld-, Chunk- und Weltgrenzen, und der Effekt bleibt beim Verschieben ortsfest.
- **Takt und Zoom:** Ein neues Bild entsteht alle 140 ms im Takt der Brandung oder wenn die Ansicht ein Feld weiterrückt; dazwischen wird nur kopiert. Ab 16 px pro Feld zeigt sich der Effekt mit 35 %, ab 32 px voll, darunter gar nicht. Skaliert wird wie das Gelände: bei ganzzahligem Faktor scharf. Dazwischen (z. B. 24 px oder DPR 1,5) entsteht das Bild k-fach mit scharfen Blöcken und wird dann glatt verkleinert, wie bei `landview.blit`. Ein einfaches weiches Vergrößern machte die Linien sichtbar unschärfer als das Gelände.
- **Wann nichts läuft:** AUS, „Effekte reduzieren“, `prefers-reduced-motion`, Ebene „Ozeane“ aus, Klimaüberlagerung und Zoom-Vorschau. AUS legt keinen WebGL-Kontext an; Zurückschalten gibt Texturen und Bild frei.
- **Ohne WebGL2:** Gilt auch für reines Software-WebGL (`failIfMajorPerformanceCaveat`), einen Shaderfehler und einen Kontextverlust. Dann bleibt für die Sitzung das Standardwasser, es kommt eine Warnung und kein neuer Versuch. Der Dialog zeigt „Standardwasser aktiv: …“.
- **Prüfhilfen:**
  - `?animclock=<ms>` hält alle Kartenanimationen an einer Zeit fest; `SE.app.editView.animClock` schaltet sie weiter.
  - `tools/save-scene.js` macht aus einem Spielstand eine Szene: geladen, pausiert, nur die Karte, Kamera gesetzt.
  - `tools/ui-shot.js` hat neu `--each` (viele Ansichten in einer Seite), `--init` (vor dem Start, z. B. kein WebGL2 oder gesperrter Speicher), `--media` (reduzierte Bewegung) und `@datei`.
  - `tools/perf-bench.js` hat die Szenarien `reef` und `reefpan` und die Tabelle `water fx`.
- **Vergleich reproduzieren** (Spielstand `reef`: Erde „Heute“, Seed 12345, 1500 Ticks, Great Barrier Reef 232/77, 32 px):
  ```
  node tools/perf-bench.js saves
  node tools/save-scene.js tmp/perf/reef.save <dir>/reef.js --x 232 --y 77 --zoom 32
  node tools/ui-shot.js --page index --query "animclock=20000" --w 1280 --h 800 --eval @<dir>/reef.js --wait2 2500 \
    --frames 2 --gap 2000 --each "SE.app.editView.waterFx.enabled = f === 1; SE.app.editView.markDirty()" --out <dir>/wfx.png
  ```
- **Bilder** (Spielstand `reef`, Uhr fest; AUS | EIN | geänderte Pixel rot):
  - `riffe-10-wasser-aus-ein-zoom32.png`: Lagune und Riff bei 32 px.
  - `riffe-11-wasser-aus-ein-zoom48.png`: dasselbe bei 48 px.
  - `riffe-12-wasser-aus-ein-zoom16.png`: dasselbe bei 16 px.
  - `riffe-13-wasser-zoom16-dpr15.png`: 16 px bei DPR 1,5, geglättet.
  - `riffe-14-wasser-weltnaht-zoom32.png`: Riff über der Weltnaht.
  - `riffe-15-wasser-meereis-zoom32.png`: Meereis bleibt frei.
  - `riffe-16-wasser-ablauf-riff-zoom32.gif` und `riffe-17-wasser-ablauf-see-zoom32.gif`: je 22 Schritte zu 140 ms.
  - `riffe-18-wasser-terraforming-zoom48.png`: vor dem Pinselstrich, beim Überblenden und danach.
- **Geprüft** (headless Chrome, Windows, GPU):
  - Zoom 12 (keine Änderung), 16, 24, 32 und 48 bei DPR 1, 1,5 und 2.
  - Ortsfest: Eine Verschiebung um 1 Feld, ½ Feld und 3 Felder über die Weltnaht ist pixelgleich; Abweichungen gibt es nur am bildschirmfesten Rahmen.
  - Ruhe: Pro 140-ms-Schritt wechseln 10–12 % der Effektpixel, jedes Pixel leuchtet im Mittel rund 1,3 s.
  - Masken: Meereis, Land, Inseln, Tiere, Clownfische und Küstenstadt mit Namen bleiben unberührt.
  - Terraforming: Eine neue Insel bleibt frei, auch während des Überblendens.
  - Umschalten: über 40-mal im Wechsel in einer Seite (AUS gibt frei, EIN lädt neu).
  - `file://` ohne `--allow-file-access-from-files`.
  - Fehlerfälle: kein WebGL2 beim Start, Kontextverlust (`WEBGL_lose_context`), gesperrter Einstellungsspeicher (Schalter wirkt), `prefers-reduced-motion`. `?waterfx=on` lässt den gespeicherten Wert unverändert.
  - Simulation: Hash über alle Weltfelder nach 400 Ticks vor und nach der Änderung gleich.
  - Tests: `tests/waterfx.test.js` (10), Riff-, Dünungs- und Landschaftstests sowie `test:quick` grün.
- **Messung** (`tools/perf-bench.js`, headless Chrome mit GPU, 1920 × 1080 CSS-Pixel, je Konfiguration 3 Wiederholungen mit 3 s Aufwärmen und 10 s Messzeit; Median aus 3; „vorher“ = Build v0.92.3; `reef` und `reefpan` pausiert, `bio` läuft auf „Schnell“):

  | Szene | DPR | Arbeit p95 ms<br>vorher / AUS / EIN | Frames > 16,7 ms %<br>vorher / AUS / EIN | Abstand p95 ms<br>vorher / AUS / EIN |
  |---|---|---|---|---|
  | `reef` (stehend) | 1 | 4,9 / 5,3 / 4,6 | 0,3 / 0,3 / 0,3 | 26,7 / 26,7 / 26,7 |
  | `reefpan` (WASD, Ziehen, Zoom) | 1 | 10,7 / 9,9 / 10,9 | 0,4 / 0,3 / 0,3 | 26,7 / 26,6 / 26,6 |
  | `bio` (dicht, läuft) | 1 | 11,6 / 11,5 / 13,0 | 1,7 / 2,0 / 2,1 | 13,5 / 13,6 / 13,5 |
  | `reef` | 1,5 | 6,6 / 6,4 / 6,8 | 1,6 / 2,1 / 1,9 | 40,1 / 44,4 / 44,3 |
  | `reefpan` | 1,5 | 17,9 / 19,3 / 17,5 | 8,1 / 11,7 / 6,1 | 40,1 / 44,5 / 44,0 |
  | `bio` | 1,5 | 16,5 / 17,6 / 17,3 | 4,6 / 5,9 / 5,3 | 44,7 / 45,2 / 44,8 |

  - AUS kostet nichts Messbares; die Abweichungen liegen in der Streuung zwischen den Wiederholungen.
  - EIN: In der dichten laufenden Szene steigt bei DPR 1 die Arbeit p95 um etwa 1,5 ms, verpasste Frames und Simulationstempo (6,7 Ticks/s) bleiben gleich. In den Riffszenen gibt es keinen messbaren Unterschied.
  - DPR 1,5 liegt auf diesem Rechner schon vorher an der Grenze, das Rauschen ist dort größer als jeder Effekt.
  - Uploads bei EIN: `reef` 7,2 Bilder/s ohne Chunk-Uploads. `reefpan` 18 Bilder/s und 15 Chunks (0,9 MiB) in 10 s. `bio` 12 Bilder/s und 55 Chunks (3,5 MiB) in 10 s.
  - Vor der Prüfsumme (Zwischenstand) waren es in `bio` 50 Bilder/s und rund 900 Chunks (57 MiB) in 10 s, und 3,0 % statt 2,1 % der Frames lagen über 16,7 ms.
  - Je Bild wird das Feldmuster (unter 10 KiB) neu geladen.
  - Seiten-Heap 16–41 MB in allen Konfigurationen, ohne systematischen Unterschied.
  - GPU-Zeit und GPU-Speicher sind nicht gemessen, die Arbeitszeit erfasst die Grafikkarte nur zum Teil. Die Speicherschätzung steht unter „Grenzen“.
- **Bewertung:**
  - Gewinn: Bei 24–48 px pro Feld liegen Riffe und Lagunen sichtbar unter Wasser, denn das Lichtnetz läuft ruhig über Korallen und Sand. Bei 16 px ist es bewusst schwach. Auf offener See ist der Glanz zurückhaltend: Er belebt die gebackenen Rippelstriche, auf dem tiefsten Blau sieht man ihn kaum.
  - Artefakte:
    - Das Netz besteht aus einer Zellschicht und wirkt in großen Lagunen etwas regelmäßig.
    - Die Kaustiken folgen der Riff- und Lagunenlage je Feld. An deren Rand blenden sie weich aus und enden dadurch teils mitten im türkisen Flachwasser.
    - Beim Pinsel und beim Gefrieren oder Tauen von Meereis setzt der Effekt im überblendeten Teil aus, bis die Überblendung fertig ist (etwa 1,5 s).
    - Gesperrt wird nach dem aktuellen Weltstand, das Basisbild hängt bis zu 250 ms nach (beim Pinseln länger). Endet eine Stadt oder ein Ereignis, kann der Effekt kurz über ihr altes Bild laufen. Die Dünung hat dasselbe Muster.
    - Während des Zoomens (Vorschau) gibt es keinen Effekt, wie bei der Brandung.
  - Grenzen:
    - Software-WebGL wird bewusst abgelehnt; ohne GPU-Beschleunigung bleibt das Standardwasser.
    - Nach EIN → AUS bleibt der eine WebGL-Kontext erhalten, Texturen und Bild werden freigegeben. So verbraucht erneutes Einschalten keinen weiteren Kontext.
    - Speicher: Effektbild bis 3872 × 2208 px (≈ 34 MiB bei 1920 × 1080, DPR 1,5, 16 px), Masken bis 4096 × 1536 Byte (6 MiB).
    - Der Uhrumlauf nach 2 h lässt das Muster einmal springen.
  - Empfehlung: als experimentelle Option behalten, nicht standardmäßig einschalten, bis echte Hardware gemessen ist (integrierte Grafik, 4K, Firefox und Safari). Nächste Schritte nach Nutzen:
    1. Das Effektbild auf den sichtbaren Ausschnitt begrenzen und bei DPR ≥ 1,5 und 16–24 px eine Stufe gröber rechnen.
    2. Bei Überblendungen die alte Maske weiterlaufen lassen statt auszusetzen.
    3. Sperren nach dem Stand des Basisbilds statt live.
    4. Eine zweite, gröbere Zellschicht nur in großen Lagunen.

## Offene Entscheidungen

- **Palmen-Quote:** Fuß 1–2 px hinter der nassen Linie, Streifen ≥ 2 px und Krone 3–6 px über dem Wasser lassen sich an vielen Küsten nicht zugleich erfüllen.
  - Möglichkeit: die Untergrenze des Überhangs auf 2 px senken.
- **„Meeresboden“** zeigt Land jetzt in einem flachen Grau, damit die ganze Farbskala der Tiefe gehört.

## Nicht geprüft

- andere Browser als headless Chrome
- Wassereffekte: echte Monitore und Grafikkarten (nur headless Chrome mit GPU), integrierte Grafik, 4K, Windows-Skalierung im Fenster; GPU-Zeit nicht direkt gemessen; Langzeitbetrieb über den Uhrumlauf; Klimaüberlagerungen und Ebene „Ozeane“ aus nur im Code geprüft
- Titel-Globus, Übersichtskarte „Lebensräume“ und Speicherstand-Vorschaubilder nur im Code; beim Laden keine Seitenfehler
- Untersuchen-Fenster und Chronik-Texte nur per Test, nicht im Bild
- die alte Kachelansicht (`?terrain=legacy`)
- Zufallsplaneten nur in den Unit-Tests
