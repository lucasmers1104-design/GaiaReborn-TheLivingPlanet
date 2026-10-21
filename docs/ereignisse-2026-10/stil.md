# Stil der Katastrophen-Effekte

Gilt für alle Effekte der Naturkatastrophen: Sprites, animierte Bodentexturen, Partikel und Ringe.
Spezifikation: [../ereignisse-spec.md](../ereignisse-spec.md). Die Landschaftsregeln aus
[../landschaft-2026-10/stil.md](../landschaft-2026-10/stil.md) gelten weiter, hier steht nur, was für Effekte dazukommt
oder anders ist. Referenz für alle Ereignisse ist der Vulkanausbruch (`tools/fx/volcano.js`, `src/fxvolcano.ts`).

## Palette

- **Eine Palette:** `tools/terrain/palette.js`. Keine freien Farben, keine Halbtransparenz.
- **Neue Farben schlägt man vor**, ändern darf sie nur der Lead. Der Vulkan kommt mit den vorhandenen Rampen aus:

  | Zweck | Farben, von dunkel nach hell |
  |---|---|
  | Glut, Lava | `red0`, `red1`, `orange0`, `yellow0`, `white0` |
  | dunkler Rand der Glut | `soil0`, `red0` |
  | Asche, Rauch | `rock0` … `rock4`, Lichtkante `white0` |
  | Basalt, Kruste | `pine0` (fast schwarz), `rock0`, `rock1`, `rock2` |
  | Dampf | `ice2`, `ice3`, `ice4`, `white0` |

- **Höchstens 12 Farben** je Frame (der Generator prüft das).

## Licht und Leuchten

- **Licht kommt von oben links**, auch bei Rauch, Wolken und Dampf: Lichtkante oben links, Schattenseite unten rechts.
  `billow()` im Effekt-Kit macht das für Wolken aus runden Ballen.
- **Leuchten** ist eine helle Palettenstufe innen mit einer dunkleren am Rand. Bodentexturen bekommen ihren dunklen
  Rand vom Renderer (`rim` im Katalog), Sprites zeichnen ihn selbst.
- **Kein Weichzeichner, kein Alpha.** Ausgeblendet wird mit Auflöse-Frames:
  - `dissolve()`: geordnetes Raster, für kleine Wölkchen
  - `crumble()`: zerfällt in Klumpen, für große Wolken (ein Raster wirkt dort wie ein Netz)

## Größen, Anker und Ebenen

- **Größen** in 8-px-Schritten: 8×8, 16×16, 16×32, 32×32, 32×48, 48×48. Kachelgebundene Objekte wie Flammen sind
  16×20 oder 16×24, genau wie Bäume und Städte.
- **Anker im Katalog:**
  - `foot`: Die letzte Zeile steht unten mittig auf der Kachel und das Sprite wächst nach oben (Säule, Pilzwolke,
    Trichter, Schlot). Die letzte Zeile darf nicht leer sein.
  - `center`: Das Sprite liegt mittig auf der Kachel (Aschewolke, Wirbelsturm, Staubwolke).
- **Ebene im Katalog:**
  - `object`: Das Sprite wird mit den Kartenobjekten nach Fußzeile sortiert. Bäume und Städte der Zeile davor zeichnet
    die Effektebene danach erneut darüber.
  - `top`: Rauch, Asche und Wolken liegen über allem.
- **Bodenzustände in Bewegung** (Lava, später Flutwasser und Glut) sind nahtlose Texturen. Der Renderer legt sie durch
  die Randmasken des Geländes und zeichnet die Pflanzen darüber.

## Animation

- **4–8 Frames, 8–12 Bilder pro Sekunde**, stufig.
- **Schleifen müssen nahtlos sein:**
  - Was aufsteigt, hängt nur von der Höhe ab (Säule: Ballen steigen 1 px je Frame, 6 px Abstand, 6 Frames).
  - Tropfen laufen auf Parabeln mit einer Phase, die je Frame um 1/Frames weiterrückt.
  - Lava wechselt die Farbe bandweise (Palettenwechsel).
- **`loop` im Katalog:** Die ersten `loop` Frames wiederholen sich, danach folgen einmal die Auflöse-Frames
  (Aschewolke: 4 + 3).

## Drehen und Spiegeln

- **Nie zur Laufzeit drehen.** Jede Richtung ist ein eigener Frame (die Wellenkämme haben zum Beispiel 8 Richtungen).
- **Gespiegelt wird im Generator.** Erst wird die Form gespiegelt, dann wird das Licht oben links neu angewendet. Ein
  gespiegeltes fertiges Bild hätte sein Licht oben rechts. Beispiele: Wirbelsturm der Südhalbkugel, Rauchneigung mit
  dem Wind.
- **Zur Laufzeit gespiegelt** werden nur Sprites mit symmetrischem Licht (Flammen, Funken).

## Partikel und Ringe

- **Partikel** (Glut, Funken, Asche, Staub, Trümmer, Regen) sind einzelne Kunstpixel im Raster der Zoomstufe.
  - Sie laufen ihre Rampe hinunter: Glut kühlt von gelb nach dunkelrot.
  - Höchstens 384 gleichzeitig. Wird der Pool voll, verschwindet der älteste Partikel.
- **Ringe** (Druck- und Bodenwellen) sind pixelgenaue Kreise (`drawRing`), ein Kunstpixel breit, oben links hell und
  unten rechts dunkel.

## Wackeln und Blitze

- **Nur örtlich:** Es wackeln die Kacheln um das Epizentrum, ±1–2 Kunstpixel, mit 12 Schritten pro Sekunde. Ein Blitz
  bleibt auf 32×32 begrenzt. Der Bildschirm selbst wackelt nie.
- **„Effekte reduzieren“** schaltet Wackeln und Blitze ab (`FxScene.shake` macht dann nichts). Wer einen Blitz baut,
  braucht einen Ersatz-Frame ohne Weiß.

## Wirbelsturm

- **Wolke von oben** (`tools/fx/storm.js`, 96×96): Höhenfeld aus dichter Zentralwolke mit klarem Auge, vier
  Spiralbändern aus Quellwolken-Ketten und Zirrusfransen am Rand. Licht nach Neigung von oben links, höhere Wolke
  beschattet tiefere: die Schattenseiten in `rock0`/`rock1` geben die Wucht. Nach außen Lücken zwischen den Bändern,
  damit Blitze und Regen darunter sichtbar bleiben. Bodenschatten `water0` im Bayer-Raster, +5/+5 px.
- **Drehung:** 8 Frames = 90° (vier Arme), nahtlos; Süden gespiegelt und neu belichtet. Frames 8–15 sind dieselben
  Frames mit drei von innen leuchtenden Türmen (Wetterleuchten), nur zum kurzen Austauschen.
- **Blitz** (`tools/fx/bolt.js`, 24×64, Fuß = Einschlag): 1 px weißer Kern, gebrochener hellblauer Rand, sparsam
  Violett, Äste verlöschen nach außen. Weiß nur in den Frames 1, 2, 4 je Form; 0, 3, 5 sind der Ersatz bei „Effekte
  reduzieren“. Das Glühen am Boden geht von Gelb über Orange zu Glut und Brandfleck.
- **Regenvorhang:** spärliche Schlieren 2–3 px und ein Hauch Grau, zur Mitte dichter, zum Rand nichts, damit sich
  viele Vorhänge ohne Kanten überlagern.
- **Tornado** (`tools/fx/twister.js`, 32×64): dunkle Wolkenbasis mit Wolkenkragen, Trichter zum 5 px dünnen Schlauch,
  diagonale Schlieren wandern 1 px je Frame (er dreht sichtbar), Staubkragen am Fuß. Trümmer (8×8): Erdklumpen,
  Stein, Ast mit Laub, Brett, je zwei Taumelframes; nie zur Laufzeit spiegeln (Licht einseitig).

## Wale

Wale auf offener See sind ab 16 px pro Kachel Effekt-Sprites der Familie `fauna` (`tools/fx/fauna.js`), weiter
herausgezoomt bleiben sie SVG-Symbole.

- **Von oben gesehen**, wie die übrige Karte: spindelförmiger Körper, runder Kopf, zwei Brustflossen, breite Fluke
  mit Kerbe am schmalen Schwanzstiel. Diese Silhouette sagt „Wal“, nicht die Seitenansicht (die wirkte wie ein U-Boot).
- **Arten:** Blauwal (`whale_great`, 48×24, lang und schlank, hell schieferblau gefleckt, kleine Flipper, kleine Finne
  weit hinten als dunkler Strich durchs Wasser, Spritzschutz vor dem Blasloch), Buckelwal (`whale_baleen`, 40×24,
  gedrungen, fast schwarz, Buckel, sehr lange helle Flipper, Fluke mit weißer Unterseite und gezacktem Rand), Pottwal
  (`whale_sperm`, 40×24, dunkelgrau, kastenförmiger Kopf ≈ ⅓ des Körpers, Blasloch vorn links, Runzeln, Knubbel,
  breite dreieckige Fluke).
- **Frames:** je Richtung (Osten, dann Westen) 8 Frames: 0–1 Auftauchen (Silhouette tief, dann Kopf bricht durch),
  2–3 Schwimmen (Flukenschlag: Fluke verkürzt, Schwanz leicht gebogen), 4–7 Abtauchen (Rücken wölbt sich und der Kopf
  geht unter, Fluke halb oben, Fluke ganz oben mit ablaufendem Wasser, Fluke sinkt in Gischt). Die gehobene Fluke ist
  von hinten gezeichnet, als „Y“. Welche Frames wann laufen, entscheidet die Laufzeit.
- **Wasser:** Der ganze Wal liegt als Silhouette unter einem Schleier aus Meer (Blauwal `water3`/`water4`, dunkle Wale
  `water2` mit Rand `water0`, Buckelwal-Flipper `water6`/`water7`), tiefer = lichteres Raster; so liest er sich auf
  Tief- und Schelfwasser. Nur der Rücken über der Wasserlinie ist Haut, 1 px höher gezeichnet, mit Schaum am Bug.
- **Form gemessen, Licht vom Rezept:** Breitenprofil längs der Wirbelsäule, Flipper und Fluke als Polygone. Je Frame
  hebt eine Höhenkurve die Wirbelsäule gegen die Wasserlinie; wo der Querschnitt darüber ragt, ist Rücken. Das
  Höhenfeld wird von oben links beleuchtet (nasser Glanz längs des Rückgrats, dunkelste Stufe nur am Rand unten rechts).
  Der Westsatz spiegelt die Form und wird neu beleuchtet.
- **`mouth`** (Ostframes, West: `w − 1 − x`): `[blasX, blasY, schnauzeX, schnauzeY, flukeX, flukeY]` — der Pixel über
  dem Blasloch (Frames 1–3, Fuß von `whale_blow`), die Schnauzenspitze (Bugwelle) und der Fuß der gehobenen Fluke.
- **Blas** (`whale_blow`, 16×24, Fuß, 8 Frames, einmal): ein dünner Strahl fächert zu einer buschigen Krone auf, deren
  Rand im Raster ausfranst; dann reißt der Strahl ab, die Krone treibt ab und löst sich mit `dissolve()` auf.
  Gischt am Fuß hält die letzte Zeile besetzt.

## Delfine

Delfine (Wal-Unterart 6) springen ab 16 px pro Kachel als Schulen aus tropischem Meer (Kachel ≥ 25 °C, Wasser zwei
Kacheln nach Osten und Westen); im kühleren Wasser, an der Küste und bei „Effekte reduzieren“ bleibt das SVG-Symbol.

- **Von der Seite gesehen**, wie alles, was sich über die Karte erhebt (Blas, Seegras, Bäume): ein Sprung ist eine
  Bewegung nach oben, kein Liegen auf dem Wasser.
- **Sprite** `dolphin_leap` (32×24, Osten 0–15, Westen 16–31, einmal): Der ganze Bogen liegt im Kasten, Wasserlinie
  Zeile 18, `mouth` = Austrittspunkt. 0 Schnauze wölbt das Wasser, 1–2 Durchbruch mit Schaumkragen, 3–5 Tropfen von
  der Fluke, Scheitel gekrümmt, 9–11 Eintauchen, 12–15 nur Spritzkrone und Ring. Unter Wasser ein Schleier wie bei
  den Walen (`water2`, Rand `water1`/`water4`), tiefer lichter.
- **Farben:** Gegenschattierung, Rücken `rock0`/`rock1` mit nassem Glanz `ice0`, Bauch `ice2`–`white0`, Rand unten
  rechts `rock0` bzw. `ice1`; Licht oben links, der Westsatz neu beleuchtet.
- **Schule:** 3–5 Tiere in lockerer Staffel, je zwei Sprünge hintereinander, die Folgenden einen Takt nach dem
  Anführer; Runde 6–10 s, davon etwa 3,4 s sichtbar. Eine Schule springt nur, wenn daneben gerade keine springt.

## Lachse

Lachse springen ab Echten Knochenfischen (Fisch-Unterart 6) flussaufwärts, ab 16 px pro Kachel und nicht bei „Effekte
reduzieren“. Jeder Fluss, dessen Mündung in ein Meer mit Fischen führt, bekommt Lachszüge. Ein Zug steigt von der Mündung
fast bis zur Quelle auf. Knapp hinter seiner Spitze springen die Lachse einer nach dem anderen, abwechselnd. Danach
ruht der Fluss ein paar Sekunden, und der nächste Zug beginnt an der Mündung.

- **Sprite** `salmon_leap` (16×16, Osten 0–9, Westen 10–19, einmal), von der Seite wie die Delfine. Der Bogen ist
  kurz und steil, damit der ganze Sprung über einem Fluss jeder Richtung bleibt. Wasserlinie Zeile 12, `mouth` =
  Austritt (4, 12), Wiedereintritt 6 px weiter bei x 10.
- **Frames:** 0 der Kopf bricht mit Schaumkragen durch, 1–3 fast senkrechter Aufstieg mit abfallenden Spritzern, 4
  Scheitel (Zeilen 2–4 über x 7) mit Glanzpunkt, 5–6 der Fisch dreht nach unten, 7 er taucht kopfüber ein, 8
  Spritzkrone und Ring, 9 nur noch der verblassende Ring. Die Gischt bleibt in x 1–14. Unter Wasser wird nichts
  gezeichnet, der Fluss liegt darunter.
- **Fisch** etwa 8 px mit Gabelschwanz, in Laichfarben und kräftigem Kontrast: Rücken und Kopf `rock0`/`rock1`,
  Flanke `red0`/`red1`, Bauch `ice3`/`white0`, Glanz `white0`/`ice4`. Gischt `white0`, `ice4`, `ice3`, Ring
  `ice4`/`water7`. Licht oben links, der Westsatz neu beleuchtet.

## Störche

Störche ziehen ab Entenvögeln (Vogel-Unterart 4) über eisfreiem Land zum Äquator hin, auf der Nordhalbkugel also von
Norden nach Süden. Jeder Planet hat eine feste Zugroute vom Brutgebiet in der gemäßigten Zone zum Winterquartier in der
warmen Zone; auf der heutigen Erde von Mitteleuropa in den Sahel am Niger, über die schmale Stelle des Mittelmeers.
Gesucht wird sie einmal und behalten, solange beide Enden Storchenland bleiben; alle 25–45 s startet ein Zug. Ein Zug aus 5–7 Störchen fliegt als V, dessen Spitze in die Flugrichtung zeigt, mit
Bodenschatten. Beim Landen werden die Vögel kleiner, beim Auffliegen wachsen sie wieder.

- **Sprite** `stork_glide` (24×24, Süden 0–7, Norden 8–15, je als Schleife, Ebene `top`), von oben wie die Karte:
  Rumpf fest in der Mitte (x 10–13, Zeilen 8–15), Hals und Schnabel voraus, Schwanz und Beine hinten, Flügel quer.
  Der Nordsatz ist dasselbe Raster, von oben nach unten umgedreht und neu beleuchtet, nie ein gespiegeltes Bild.
- **Frames:** 0–3 ein Flügelschlag. Von oben verkürzt sich ein gehobener oder gesenkter Flügel: 0 gehoben (Spanne
  18 px, die Handschwingen etwas heller), 1 und 3 waagrecht (22 px), 2 gesenkt (16 px, die Unterseite dunkler). 4–7
  Gleiten mit 22 px Spanne. Die äußere Handschwinge links (5–6) und ein Fuß (6–7) bewegen sich je zwei Frames, damit
  nichts flackert.
- **Farben:** Gefieder `white0`/`ice4`/`ice3`, gesenkt bis `ice2`. Die Schwungfedern hinten und die gefingerten
  Flügelspitzen sind `rock0` mit Lichtkante `rock1` und Rand `pine0`. Schnabel `orange0`/`red1`, Beine `red1`/`red0`.
  Licht oben links. Der Umriss hängt überall an Kanten zusammen, ohne lose Pixel, weil die Laufzeit aus ihm den Schatten
  macht und den Vogel beim Landen bis auf etwa 55 % verkleinert.

## Meereis

Meereis friert und taut auf der Karte über einige Sekunden (`src/landice.ts`), die Simulation schaltet sofort um.
Alle Stellschrauben stehen in `ICE_ANIM`.

- **Auftauen und Zufrieren** sind kein Sprite, sondern die Auflösung des Chunks in sein neues Bild (`src/landfade.ts`),
  so schließen Bruchkante, Schaum und helles Uferwasser der Nachbarn ohne Sprung an. Auftauen: zuerst öffnen sich
  die Rinnen der Packeistextur, dann wird jede Scholle vom Rand her dünn (zwei Stufen dunkler auf der Eisrampe) und
  verschwindet, die Schollen leicht versetzt. Zufrieren: von der alten Eiskante aus ein dünner Film im geordneten Raster
  (halb `ice0`, halb zwei Stufen unter dem Ziel), der sich zur Scholle verdichtet.
- **Kalben** (`tools/fx/ice.js`, `src/icecalving.ts`, alle 16×16, Mitte): Riss `ice_crack` über der Randkachel
  (waagrecht 0–3, senkrecht 4–7; frischer Riss `ice0` mit Meer `water1`/`water2` darin, Lippe `ice3` wie an den Rinnen),
  Scholle `ice_calve` (breit 0–3, hoch 4–7: frei, kippt, halb unter, Trümmereis), Gischt `ice_splash` (Krone, Ring),
  Eisberg `iceberg_drift` (0, 1, 0, 2 wippen), Schmelzen `iceberg_melt` (5 Frames bis nichts). Nur Eis- und
  Wasserrampe: Oberseite `ice4`/`ice3`, Front `ice2`, `ice1`, `ice0` bis zur Wasserlinie, Schaum `water7`, Eis unter
  Wasser ein Halbraster `water6`.
- **Ablauf:** Die Randkachel bleibt bis zum Abbruch fest, dann öffnet sich nur die Fläche der Scholle sofort, der Rest
  der Kerbe taut normal nach. Der Eisberg treibt vom Rand weg zum offenen Wasser und wird langsamer.
- **Selten:** höchstens ein Kalben je 20–40 s, nur im Bild ab 16 px pro Kachel, nie bei „Effekte reduzieren“ und nie
  unter einem Tier.

## Arbeitsablauf für Effekt-Agenten

1. **Katalog:** Neue Einträge kommen in `tools/fx/catalog.js` (Id, Box, Frames, Anker, Ebene). Den Katalog ändert nur
   der Lead, man schlägt Einträge vor.
2. **Rezept:** Es kommt in die eigene Familiendatei `tools/fx/<familie>.js`. Gemeinsames gehört nach `smoke.js` oder
   `kit.js` und geht über den Lead.
3. **Prüfen:** `node tools/fx-atlas.js --check --sheet` meldet jedes `PROBLEM` und schreibt einen Kontaktbogen (1× und
   4× auf Wiese und dunklem Grund).
4. **Drehbuch:** Es kommt in eine eigene Datei `src/fx<ereignis>.ts` und meldet sich in `FX_SCRIPTS` an
   (`omen`, `main`, `live`).
5. **Aufnehmen:**
   - Vorher mit eigenem Bundle bauen: `npx tsc -p tsconfig.json --outFile <scratch>/simulation.js`.
   - Dann `SE_BUNDLE=<scratch>/simulation.js node tools/fx-record.js --kind <id> [--x --y] [--zoom] [--reduce]`.
   - Heraus kommen ein animiertes PNG, ein Kontaktbogen und die Einzelbilder.
6. **Schreiben:** `--write` für beide Atlanten macht nur der Lead.
