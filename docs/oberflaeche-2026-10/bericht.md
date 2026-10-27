# Die lebendige Oberfläche: Gaia, Ranken und Magie

Stand: 27. 10. 2026.

Die Oberfläche lebt mit dem Planeten. Unten links schläft Gaia auf einem kahlen Felsen, bis das erste Leben entsteht.
Mit den ersten Pflanzen wachsen Ranken aus ihrem Felsen die Navigationsleiste hinauf, blühen mit den Blütenpflanzen und
welken in Krisen. Die Anzeigen oben sitzen in Pixelwolken über der Karte, die Navigationsleiste ist aus Holz, Pergament
und Goldrahmen in Pixelkunst, Fenster
gleiten mit Rankenzweigen herein, und vor jedem großen Evolutionsschritt zaubert Gaia einen leuchtenden DNA-Doppelstrang.
Vorlage war das Konzept in `assets/ui/Gaia_Reborn_Living_UI_Concept/` (KI-Entwurf, nur Stilvorlage: jedes Pixel kommt
aus einem Rezept).

## 1. Was der Spieler sieht

**Gaia (unten links, `src/gaiacompanion.ts`)**
- Auf einem leblosen Planeten schläft sie zusammengerollt auf dem kahlen Felsen, atmet ruhig und regt sich alle 8–15 s
  im Schlaf; kleine Z steigen auf.
- Mit dem ersten Leben erwacht sie (2,8 s): sie blinzelt, hebt den Kopf, schaut sich um und stützt sich auf die
  Ellbogen. Steht dabei eine Evolutionskarte offen, wartet das Erwachen, bis sie geschlossen ist. Ein geladener Spielstand
  spielt das Erwachen nie ab.
- Danach liegt sie auf dem Bauch und schaut zur Karte, blinzelt alle 3–6 s und blickt sich um. Ihre Stimmung folgt dem
  Planeten:
  - **froh** (strampelt mit den Füßen, Herzchen): Gaias Wohlbefinden über 0,8, und 6–8 s nach jedem neuen Evolutionsschritt
  - **besorgt** (Kinn in den Händen, Schweißtropfen): Klima oder Luft kippen, drei oder mehr Katastrophen zugleich, die
    Frage nach den Dinosauriern steht offen, oder Wohlbefinden unter 0,45
  - **traurig, erschöpft** (Kopf auf den Armen, welkes Haar, Tränen): Kometenwinter, ein Massensterben, ein Einbruch von
    Pflanzendecke oder belebter Fläche oder drei verlorene Gruppen, oder Wohlbefinden unter 0,3
  - **hoffnungsvoll** (hebt den Kopf zum Himmel, Funkeln): wenn sich die Natur erholt und 20 s nach jeder überstandenen Krise
- Eine Stimmung hält mindestens 3 s, damit Gaia nie zuckt. Pausiert das Spiel länger als 8 s, döst sie ein.
- Sie sagt an den großen Momenten einen kurzen Satz (Erwachen, das erste Grün, eine Krise, die Erholung), höchstens alle
  25 s und nie über einer Karte oder während ihres Zaubers. Klick: anstupsen (fünfmal hintereinander wird sie
  ungehalten). Doppelklick oder Enter öffnet das Gaia-Fenster, das Planetengesicht des Originals. Das Fenster öffnet sich
  beim Spielstart nicht mehr von selbst.
- Ihr Felsen hat vier Bilder: kahl, erste Flechten, bemoost (Grün ab 0,35), üppig mit Farnen und Blüten (ab 0,7).
- Mit „Effekte reduzieren“ hält sie still in ihrer Pose (kein Atmen, kein Strampeln, die Kugel dreht sich nicht); sie
  blinzelt nur und wechselt den Ausdruck.
- Die Werkzeugkarte und das angedockte Untersuchen-Fenster lassen unten Platz für ihre Ecke; ihre Sprechblase liegt über
  der Werkzeugkarte.

**Die Ranken (`src/vinegrowth.ts`, `src/vinelayer.ts`)**
- Mit der ersten Pflanzengruppe (Meeresalgen) sprießt ein Trieb am Felsen. Mit jeder weiteren Gruppe und mit der
  Pflanzendecke an Land klettert die Ranke die Leiste hinauf, schickt Zweige zwischen die Knöpfe, bekommt Blätter und
  Spiralen und wächst oben links über die Leiste hinaus, wo zwischen den Statuswolken die Karte zu sehen ist.
- Knospen und Blüten kommen mit den Blütenpflanzen und öffnen sich mit ihrer Verbreitung (stärker mit Bestäubern).
- In einer Krise verblassen die Blätter, welken, werden braun und fallen taumelnd ab; mit der Erholung wachsen sie nach.
- Ab und zu läuft eine Windwelle die Ranke hinauf; fährt die Maus über einen Knopf, zucken die Blätter daneben. Auf einem
  üppigen, gesunden Planeten schweben ein paar Glühwürmchen.
- Wachstum gleitet schrittweise (alle 120 ms ein Schritt); ein neuer Planet oder ein Spielstand springt sofort in den
  richtigen Zustand.

**Statusleiste (`src/livingtopbar.ts`, `src/topbarart.ts`)**
- Kein Balken mehr: Jede Anzeige sitzt in einer weißen Haufenwolke, die Karte läuft unter der Leiste weiter und ist
  neben und zwischen den Wolken zu sehen (Klicks zwischen den Wolken gehen an die Karte). Die Wolken berechnet
  `src/cloudshape.ts` zur Laufzeit für jede Anzeige: flache Unterseite mit wandernder Schattenkante, darüber Kuppeln
  nach einem von sieben Typen je Anzeige (Turm, Doppelturm, flache Krone, ansteigend, treibender Haufen, Congestus,
  Haufen; das Zahnrad als kleines Wölkchen), Licht von oben links, ein voller Umriss in Schieferblau, heller zum Licht
  hin. Hinter Symbol und Text liegen nur helle, ruhige Töne: Das Spiel misst, wo Symbol und Text jeder Anzeige wirklich
  stehen, und die Wolke deckt genau diese Fläche. Der Inhalt sitzt etwas unter der Mitte (wie bei echten Haufenwolken
  trägt die flache Unterseite den Text, oben ist Platz für die Kuppeln); bei 3 CSS-px je Kunstpixel (1440p) wird die
  Leiste dafür 72 statt 60 px hoch. Jede Anzeige behält ihre Wolke, auch wenn sich ihre Breite ändert. Unter der Maus
  oder bei offenem Fenster bekommt die Wolke einen blauen Rand und einen hellen Saum. Die Farben stehen als Rampen
  `cloud`, `cloudLit` und `halo` in der UI-Palette. Entstanden aus drei Entwürfen, zwei Bewertungsrunden und einer
  Verfeinerung.
- O₂ und CO₂ zeigen die Moleküle aus der Luftzusammensetzung (`hud_air`, `hud_co2` sind `air_o2`, `air_co2` auf ihre
  Pixel zugeschnitten).
- Unter 10 °C Mitteltemperatur sinkt die Säule im Thermometer, und hinter ihm steht groß eine sechsstrahlige
  Schneeflocke (`hud_temp`, 19 × 17, zwei Bilder: warm und kalt, aus `tools/uiart/snow.js`). Aus der Temperaturwolke schneit es dann ohne Pause bis hinunter zum Steinbalken: große, mittlere und
  kleine Flocken, die taumeln und im Wind pendeln, die großen näher und schneller; je kälter, desto dichter (1,6 Flocken
  je Sekunde knapp unter 10 °C, 5 ab −10 °C). Die Flocken fallen hinter Fenstern, Leiste, Gaia und dem Steinbalken
  (`src/cloudsnow.ts`; nicht mit „Effekte reduzieren“).
- Felder: Energie (Ω, mit Balken und Aufschlüsselung), Evolutionspunkte (mit Zuwachs und Aufschlüsselung), **Leben**
  (neu: belebte Fläche in %, mit Verlaufskurve), O₂ Luft, O₂ Meer, CO₂ und Temperatur (mit Verlaufskurven; die Gasfelder
  öffnen die Luftzusammensetzung), Erdzeit (Datum, Zeitalter, Zeitskala und ein kleiner Balken der Erdzeitalter mit
  Marke), Tempo (Weiter/Pause und vier Blatt-Punkte) und das Zahnrad mit dem Spielmenü.
- Wird es eng, weichen erst die Verlaufskurven, dann die Beschriftungen, dann O₂ Meer, Temperatur, CO₂, Leben usw.; nichts
  wird abgeschnitten.

**Steinbalken (`src/stonebeam.ts`)**
- Am unteren Bildrand läuft eine Reihe flacher Steine über die ganze Breite; Gaias Felsen ist ihr linkes Ende, rechts
  daneben steigt ein Findling zur Steinreihe ab (`beam_tile`, `beam_end` aus `tools/uiart/ground.js`). Der Balken wächst mit dem Planeten wie ihr Felsen (`groundLook`): kahl,
  erste Flechten, Moospolster, üppig mit kleinen Blüten. Drei Steinvarianten wechseln sich ab, damit sich nichts sichtbar
  wiederholt.
- Die Kartenknöpfe unten rechts (Ebenen, Übersichtskarte, Zoom) sind entfallen: Zoomen mit Mausrad oder + und −, die
  Übersichtskarte mit M oder im Menü Fenster, die **Kartenebenen** (Ebenen und Klima-Überlagerung) jetzt im Menü Fenster
  oder mit **N**; sie öffnen unten rechts. Die Kamera hält die unterste Kartenreihe über dem Steinbalken, und ein Klick
  auf eine Wolke geht nie an die Karte darunter (nur in den Lücken zwischen den Wolken).
- Die Randabdunkelung der Karte (Vignette) ist weg, die Karte hat überall denselben Kontrast. Ein im Browser
  zwischengespeichertes altes Stylesheet zeichnet sie auch nicht mehr (das Spiel schaltet sie selbst ab).

**Navigationsleiste (`src/livingrail.ts`, `src/flyoutmenu.ts`)**
- Neun Münzknöpfe: die sechs Werkzeuge (wie bisher, mit Tastenkürzel im Eck), ein Rankenknoten, dann **Evolution** (mit
  Zähler der entwickelbaren Schritte; vorher ein Knopf in der Statusleiste), **Planet** (Menü: Modelle und Diagramme) und
  **Fenster** (Menü aller Fenster).
- Zustände: normal, Hover (goldener Rand), gedrückt, gewählt (grün mit Pfeillasche und Leuchten), Tastaturfokus
  (goldener Ring).
- Die drei Menüs Spiel, Planet und Fenster öffnen sich als Ausklappmenüs neben ihrem Knopf (Spiel am Zahnrad); Inhalte
  und Tastenbedienung wie bisher, die alte Menüzeile ist entfallen. Wie an den Fenstern wachsen beim Öffnen Rankenzweige
  an den oberen Ecken ein (alle 80 ms ein Schritt, bei „Effekte reduzieren“ sofort ausgewachsen), dazu eine Ranke an der
  Kante zum Knopf.
- Das Menü Planet hat Pixel-Icons (`menu_*`, 12 × 12, farbig für das dunkle Holz): Vulkan über Gesteinsschichten, Sonne
  hinter einer Wolke, Laubbaum und Häuschen für die vier Modelle; Windwirbel mit Bläschen, Tortendiagramm der
  Lebensräume, Fisch mit Seetang und Messing-Zahnrad für die vier Diagramme. Die acht Fenster tragen dasselbe Pixel-Icon
  in ihrer Titelleiste. Spiel und Fenster zeigen noch die SVG-Icons.

**Fenster (`src/windowmotion.ts`)**
- Ein Fenster gleitet von der näheren Seite herein; oft genutzte Fenster (Untersuchen, Art, Evolutionsbaum, Lexikon,
  Übersichtskarte, Diagramme) in 200 ms, alle anderen in 420 ms mit leichtem Nachschwingen und einer Ranke an der Seite,
  aus der sie kamen. An den oberen Ecken wachsen Rankenzweige ein; im Gaia-Fenster und bei Blüte mit Blume, in Krisen welk.
- Schließen: die Zweige ziehen sich zurück, das Fenster gleitet weich hinaus (180 bzw. 260 ms). Logisch ist es sofort zu,
  also bleiben Tastenkürzel, Esc und Knöpfe so schnell wie bisher.
- Rahmen aus dunklem Holz mit feiner Goldlinie, warmer Titelleiste und cremefarbenem Titel; die Inhalte bleiben dunkel und
  gut lesbar.

**Übersichtskarte (`src/mapinfo.ts`, `MapView` in `src/render.ts`)**
- Von oben: flache Karte, die Leiste der zwölf Kartenmodi, die Legende, unten links immer ein Globus über die halbe
  Fensterbreite im gewählten Modus. Er dreht sich in etwa 2 s zum Ausschnitt der Hauptkarte und zeigt ihn als Rahmen. Die Schalter „Globus“ und „Werte“
  sind entfallen.
- Ein Klick auf Karte oder Globus springt dorthin und zeigt das Feld rechts neben dem Globus; ein Klick mit „Untersuchen“
  auf der Hauptkarte zeigt dort ebenso sein Feld (vor dem ersten Klick und nach einem neuen Planeten die Bildmitte): sein Bild wie im Untersuchen-Fenster, Breiten- und Längengrad, Landschaft, Zustand (karg bis üppig) und
  Bedeckung, dann grün der Wert des Kartenmodus dort (z. B. 4 °C, Westwinde, Platte zieht nach Osten, Stadtname) und in zwei
  Spalten, soweit der Modus sie nicht schon nennt, Lebensraum, Höhe oder Tiefe, Temperatur, Niederschlag, vorherrschendes
  Leben und Pflanzen.
- Ein stillstehender Globus verwendet seine Projektion wieder (knapp 1 ms je Bild statt 8 ms bei dpr 1,25); neu gerechnet
  wird nur, während er sich dreht.
- Eine Klapplasche aus Pergament mit Goldrand (`fold_tab` im UI-Atlas) zwischen Legende und Globus blendet Globus und
  Feldkarte aus und wieder ein: Pfeil nach oben, solange sie zu sehen sind, nach unten, wenn sie eingeklappt sind; Hover
  und Tastaturfokus lassen sie aufleuchten. Die Wahl bleibt gespeichert (Einstellung `mapGlobe`).
- Das Fenster ist ausgeklappt 696 px hoch, eingeklappt 455 px (ein verschobenes oder in der Größe geändertes Fenster wächst
  und schrumpft um die Globuszeile), und steht 12 px vom rechten Rand; das Gaia-Fenster öffnet darunter.

**Gaias Zauber (`src/gaiamagic.ts`, `src/dnahelix.ts`)**
- Nur bei den neun großen Schritten: Leben entsteht, Landpflanzen, Gefäßpflanzen, erste Wälder, Blütenpflanzen, erste
  Tiere, Landgang der Gliederfüßer, Amphibien, Säugetiere – entwickelt oder von selbst entstanden.
- Ablauf (etwa 4,5 s, danach die gewohnte Evolutionskarte): Gaia hebt die Hand mit einer kleinen leuchtenden Weltkugel;
  türkise, grüne und violette Lichtteilchen strömen spiralig in die Kugel; das Licht steigt auf und ein DNA-Doppelstrang
  wächst daraus, der sich räumlich um seine Achse dreht, umkreist von Funken; dann zieht sich die Energie zu einem Kometen
  zusammen, fliegt zu dem Ort auf der Karte, an dem die neue Lebensform entstand (oder zur Bildschirmmitte, wenn der Ort
  nicht zu sehen ist), und zerstiebt dort mit einem leisen Klang.
- Bei „Leben entsteht“ erwacht Gaia zuerst und zaubert dann den allerersten DNA-Strang.
- „Effekte reduzieren“: 1,2 s erhobene Hand mit ruhigem Leuchten und stehender Helix, kein Flug.

## 2. Woraus Gaia und die Ranken lesen (`src/uimood.ts`)

`LivingMood` berechnet etwa zehnmal pro Sekunde aus dem gespiegelten Weltzustand (auch im Worker-Modus):
- **wach**: Leben ist entstanden (Zeitskala nicht mehr „Geologie“ oder belebte Fläche > 0); bleibt bis zum neuen Planeten.
- **Grün** 0..1 = 0,55 × Anteil der entwickelten Pflanzengruppen (14) + 0,45 × Pflanzendecke an Land / 0,5; ab der ersten
  Pflanzengruppe mindestens 0,02.
- **Blüte** 0..1: 0 vor den Blütenpflanzen, danach 0,15 + 0,85 × Anteil der Landfläche unter Blütenpflanzen (Laubwald und
  Gräser zählen teilweise) / 0,25; × 0,7 ohne Bestäuber; welkt mit der Frische.
- **Frische** 0..1: das Minimum aus Klima (Gaias Klimafaktor), sauberer Luft, dem Anteil, den Pflanzendecke und belebte
  Fläche von ihrem jüngsten Höchststand noch halten (letzte 24 Verlaufsproben), und dem Eis des Kometenwinters.
- **Stimmung**: wie oben, mit Ein- und Austrittsschwellen und 3 s Mindestdauer.

Alles stammt aus gespeicherten Daten (entwickelte Schritte, Chronik, Verlauf, Kometenschicksal). Es gibt **kein neues
Speicherfeld**; Spielstände bleiben unverändert und sehen nach dem Laden sofort richtig aus.

## 3. Pixelkunst und Technik

- Alle 109 Sprites kommen aus Rezepten in `tools/uiart/` (`node tools/ui-atlas.js`), Vertrag `tools/uiart/catalog.js`.
  Die Palette ist die der Landschaft plus 105 eigene Farben (Pergament, Gold, Holz, Haut, Haar, Ranken, Welken, Blüten,
  Zauberlicht, Wolken), 210 insgesamt (`tools/uiart/palette.js`). Der Atlas (512 × 577, 25 KB) steckt als Daten-URL in
  `src/uiatlas.ts`, damit er über `file://` ohne Server lädt.
- Gaias Körper baut `tools/uiart/gaia-body.js` für alle Posen; ihre Posen haben ein leeres Gesicht, Augen, Brauen, Mund und
  Wangenröte setzt das Spiel an den Gesichtspunkt der Pose (zehn Augen, vier Brauen, acht Münder).
- Jedes Kunstpixel wird als ganze Zahl von Gerätepixeln gezeichnet (`uiScale` in `src/uiart.ts`, meist 2–3 CSS-px), ohne
  Glättung; gezeichnet wird nur, wenn sich ein Bild wirklich ändert.
- Der Maßstab richtet sich nach der Navigationsleiste: Passen Leiste und Gaias Ecke nicht übereinander (bei dpr 1 unter
  etwa 752 px Fensterhöhe), rückt Gaia rechts neben die Leiste, statt dass alles auf halbe Größe schrumpft. Unter 2
  Gerätepixeln je Kunstpixel verschwinden die Tasten-Buchstaben in den Knöpfen (Kürzel stehen weiter im Tooltip).
- Evolutionsbaum und Verlauf öffnen rechts neben der Leiste, das Gaia-Fenster rechts unter der Übersichtskarte.
- Alle Lagen und Größen der neuen Elemente stehen inline im Code: Ein veraltetes Stylesheet im Browser (schon einmal
  passiert) lässt nichts wachsen, schrumpfen oder überlaufen. **Nach dem Update einmal mit Strg+F5 neu laden.**
- Keine Datei der Oberfläche greift beim Laden auf `document` oder `window` zu; das Bündel läuft weiter in Node-Tests und
  in den Workern.

## 4. Werkzeuge

- `node tools/ui-atlas.js --check | --sheet | --preview [--part …] | --write` — prüfen, Kontaktbogen, zusammengesetzte
  Vorschau (Gaia auf dem Felsen mit Gesichtern, Leiste, Statusleiste, Ranken, Magie), schreiben.
- `node tools/ui-bundle.js --out <Ordner>` — Spiel mit frisch gebautem UI-Atlas in einen eigenen Ordner (für parallele Arbeit).
- `node tools/ui-shot.js` — Screenshots im headless Chrome; `?magic=1` lässt den Zauber auf Vorschauseiten spielen.

## 5. Geprüft

- `tests/uiatlas.test.js` (Atlas aktuell, Rechtecke, keine DOM-Zugriffe beim Laden) und `tests/uimood.test.js`
  (schläft bis zum ersten Leben, erwacht genau einmal, Ranken erst ab der ersten Pflanze, ein geladener Planet erwacht nicht).
- Die Wolken (`tests/uimood.test.js`): Bei allen gemessenen Größen (1080p, 1440p, 125 %) und Extremen liegen Symbol und
  Text auf hellen Wolkentönen, und jede Anzeige behält ihre Wolke. Screenshots der Leiste bei 1915 × 941, 1280 × 800,
  2560 × 1300 und 1536 × 864 (dpr 1,25); den Kältefall mit festgehaltener Temperatur (−6 °C).
- Screenshots im headless Chrome bei 1920 × 1080, 1440 × 900, 1280 × 800, 1024 × 768 und dpr 1,25/1,5: leblos, junges Leben,
  üppig, Krise, Menüs, Werkzeugkarten, Fenster, Evolutionsbaum, Zauberablauf als Bildstreifen.
- Fünf Gutachten (Logik, veraltetes CSS und Worker-Modus, Leistung, Bedienbarkeit, Optik); alle 22 bestätigten Befunde
  wurden behoben.

Bilder (headless Chrome, dpr 1):
- `uebersicht-1440.png`: grüner Planet, Gaia freut sich, Ranken mit Blüten, Bericht mit Rankenzweigen
- `leiste-und-gaia.png`: Leiste, Gaia und ein Fensterkopf vergrößert
- `leblos-1024.png`: neuer, lebloser Planet; Gaia schläft auf kahlem Fels, noch keine Ranken
- `niedrig-1366x657.png`: niedriges Fenster; Gaia neben der Leiste, Pflanzen-Karte offen
- `zauber.png`: der DNA-Doppelstrang über ihrer Hand

## 6. Einschränkungen

- Nur im headless Chrome geprüft; andere Browser nicht.
- Die Vorschau `node tools/ui-atlas.js --preview` zeigt noch die alte Holzleiste; ihre Sprites (`wood_tile`, `panel9`,
  `post_tile`, `stud`, `logo`) nutzt das Spiel nicht mehr.
- Den Klang des Zaubers hat niemand gehört (headless läuft stumm).
- Tastaturbedienung mit echter Tab-Taste und Bildschirmleser nur per Skript geprüft.
- Den echten Fall „neues Spiel, altes Stylesheet“ im Browser des Spielers nur nachgestellt (neue Regeln per CSSOM entfernt).
