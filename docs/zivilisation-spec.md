# Spezifikation: Zivilisation – Städte, Wanderung, Stämme, Konflikte

Stand: 14. 10. 2026 · **Revision 2, freigegeben** mit den Entscheidungen in Abschnitt 7.

Ziel: Wenige, gut erkennbare Städte statt flächiger Bebauung. Städte wachsen mit ihrem Umland, senden Siedler aus,
die sichtbar über die Karte ziehen und neue Städte gründen. Jede Stadt gehört zu einem Volk mit eigener Farbe.
Später tragen benachbarte Völker selten und nachvollziehbar Konflikte aus. Die Stadtoptik wechselt mit dem Zeitalter.

**Nicht Teil dieses Schritts:**
- Geologie, Tektonik, Höhe, Biome, Landschaft und Vegetations-Rendering (`geo.ts`, `climate.ts`, `succession.ts`,
  `biome.ts`, `landscape.ts`, `land*.ts`, `tools/terrain/`). Gelände wird nur gelesen.
- Die Formatnummer des Speicherstands.
- Zivilisationen wasserlebender Arten.
- Die Übersichtskarte.

---

## 1. Ist-Zustand (Code gelesen, Messwerte Headless)

### 1.1 Was es gibt

| Baustein | Stand | Ort |
|---|---|---|
| Stadt | **pro Kachel**: `tech[i]` (Zeitalter, 0 = keine Stadt) und `cityPop[i]` (0..1). Keine Stadt-Objekte, keine Namen, keine Völker | `world.ts` |
| Zeitalter | 7 Stufen: Steinzeit, Bronzezeit, Eisenzeit, Industrie-, Atom-, Informations-, Nanotech-Zeitalter | `constants.ts` (`Tech`, `TECH_*`) |
| Intelligenz | Eine Art pro Welt (`sentientClass`). Möglich sind Weichtiere und Wale (Meer) sowie Insekten, Reptilien, Dinosaurier, Vögel und Säugetiere (letzte Unterart „Hominiden“) | `LIFE[].sentient`, `civ.ts` |
| Wachstum | logistisch zur Lagequalität des **eigenen** Feldes | `CivSystem.growCities` |
| Ausbreitung | jede Stadt mit `cityPop ≥ 0,55` besetzt ein **direktes Nachbarfeld** | `CivSystem.growCities` |
| Konflikt | nur Atomkrieg ab 16 Atom-Stadtkacheln | `CivSystem.warfare` |
| Drift, Katastrophen | Drift verschiebt `tech`/`cityPop` zeilenweise. Katastrophen löschen Stadtkacheln oder senken `cityPop`. Seuche ab `totalCityPop > 32`, Ziel per 200 Zufallsversuchen | `geo.ts` |
| Darstellung | 8×8-Sprite je Zeitalter auf **jeder** Stadtkachel | `sprites.ts` `CITY_SPRITES`, `render.ts` `drawTileTop` |
| Landschaft | auf Stadtkacheln **keine** Pflanzenobjekte (`scene` bleibt leer), der Boden bleibt; Herden meiden Stadtkacheln | `landfield.ts`, `herds.ts` |
| Pixel-Landschaft | Chunks von 16 × 16 Kacheln, in Palettenindizes bei 16 px pro Kachel zusammengesetzt. Objektschatten als Rampen-Verschiebung um −2. Skalierung in zwei Schritten: Nearest Neighbour auf das k-Fache, dann weich auf die Zoomstufe | `landcompose.ts`, `landobjects.ts`, `landview.ts` |

### 1.2 Messung (gieriger Evolutionsbaum, Headless)

| Seed | Intelligenz | +500 Ticks | +1500 Ticks |
|---|---|---|---|
| 12345 | Insekten, natürlich bei Tick 4305 | 53 Stadtkacheln, **1 Cluster** | 278 Kacheln, 1 Cluster, CO₂ 400 → 503 ppm |
| 777 | keine bis Tick 6000, per Monolith gesetzt | 12 Kacheln, 1 Cluster | 17 Kacheln, 1 Cluster |

Plattendrift im Zivilisationszeitalter: 2 Bandverschiebungen in 500 Ticks. Eine Stadt rückt also im Mittel etwa alle
1000 Ticks um ein Feld.

### 1.3 Befunde

1. Die Ausbreitung kennt nur das Nachbarfeld. Deshalb entsteht immer ein einziger Teppich.
2. Die Tragfähigkeit hängt nur am eigenen Feld.
3. Es gibt keine Völker.
4. Die Höhe gibt es schon (Baumgrenze 0,5 = 2,25 km). Die Lageprüfung wird trotzdem gekapselt.
5. Die Schwellen für Seuche, Atomkrieg und CO₂ sind auf hunderte Stadtkacheln geeicht.
6. Wasserlebende Arten bauen heute keine Städte im Wasser, sondern an Land an der Küste. Eine Unterwasserstadt
   kommt im Code nicht vor.

---

## 2. Simulation

### 2.1 Datenmodell

- **Das Raster bleibt die Wahrheit** für Ort, Zeitalter und Bevölkerung: `tech[i]`, `cityPop[i]`. Eine Stadt belegt
  genau eine Kachel. Drift, Katastrophen und Speichern bleiben damit unverändert.
- **`world.civ: CivState`** ist ein reiner Arbeitsspeicher-Zustand. Er wird nie gespeichert und beim Laden aus dem
  Raster abgeleitet (2.11). Er enthält:
  - `cities`: id, Kachel, Volk, Gründungstick, Name, Tragfähigkeit, Knappheitszähler, Abklingzeiten
  - `tribes` (≤ 8): id, Farbindex, Elternvolk, Hauptstadt, Name, „Land knapp“
  - `settlers` (≤ 5): Volk, Mutterstadt, Zeitalter, Weg, Schritt, Bevölkerung
  - `conflicts` und `outbreaks`: aktive Konflikte und Seuchen, mit Ende als Tick
- **Abgleich** zu Beginn jedes `civ.step`:
  - Ein Datensatz ohne Stadtkachel wird in derselben Zeile ±2 gesucht (Drift). Findet er keine, ist die Stadt
    untergegangen.
  - Eine Stadtkachel ohne Datensatz (Spieler, Monolith, Laden) wird aufgenommen oder eingemeindet (2.11).

### 2.2 Standorte (`src/civsite.ts`)

Eine Funktion liest das Gelände, alles andere fragt nur sie: `cityGround(world, i)` liefert
`{ water, forbidden, river, coast, fertility, slope }`.

- **Verboten (`forbidden`):** Landschaft Eis, Schnee, Fels, Wüste, Ödland oder Alpine Matte, Untergrund Fels,
  Hochgebirge. Hochgebirge ist die temperaturabhängige Baumgrenze der Geologie (`landscapeZone & ZONE_TREELINE`);
  ohne Zone gilt die feste Höhe `TREE_LINE`. Tropisches Hochland unter seiner Baumgrenze ist besiedelbar.
- **`citySiteAllowed(world, i)`:** Land, nicht verboten, Temperatur im Fenster der intelligenten Art,
  Mindestabstand **7 Felder** zu Städten und Siedlerzielen (euklidisch, x läuft um).
- **`citySiteScore(world, i)`:** Fluss auf dem Feld +0,6, Fluss im Nachbarfeld +0,3, Küste +0,3, Fruchtbarkeit des
  Umlands, Hang −. Der Fluss liegt bevorzugt auf der Stadtkachel selbst, damit die Brücke sichtbar wird.
- Die Regel gilt für **Neugründungen**. Eine bestehende Stadt, deren Umland später zu Wüste oder Eis wird, verliert
  über die Tragfähigkeit Bevölkerung und kann aufgegeben werden.

### 2.3 Tragfähigkeit (ein zentraler Wert)

`capacity(city)` ist die gewichtete Summe über das Umland im Radius 3 (29 Felder, Mitte doppelt). Bei 7 Feldern
Abstand überlappen sich die Umländer nicht.

- **Landfelder:** Fruchtbarkeit der Landschaft × Boden × Temperatur.
  - Wiese, Steppe, Savanne und Laubwald hoch
  - Regenwald, Taiga und Sumpf mittel
  - Halbwüste, Tundra, Moos und Flechten niedrig
  - verbotene Böden 0
- **Flussfelder:** +50 %.
- **Meer:** Fischerei, klein, ab der Eisenzeit mehr.
- **Gesamt:** × Zeitalter-Faktor (Ackerbau, Bewässerung, Industrie), × Agrar-Regler, gedeckelt auf 1.
- Neu berechnet alle 10 Ticks und nach Drift.

**Ablauf je Stadt:**

1. Die Bevölkerung wächst logistisch Richtung Tragfähigkeit.
2. Über 90 % der Tragfähigkeit: zuerst **Auswanderung** (2.5).
3. Findet sich kein Platz, steigt der **Knappheitszähler**. Dann folgen **Hunger** (die Bevölkerung über der
   Tragfähigkeit schrumpft) und ein wachsendes **Seuchenrisiko** (2.7).
4. Dauerhafte Knappheit an Völkergrenzen löst **Konflikte** aus (2.8).

### 2.4 Größenstufen, Zeitalter

- **Größe aus `cityPop`:** Dorf < 0,35 ≤ Stadt < 0,7 ≤ Großstadt.
- **Zeitalter pro Stadt, Erfindung je Planet:** Ein neues Zeitalter erfindet die Leitstadt eines Volkes, mit einer
  Rate für den ganzen Planeten (Wissenschafts-Regler × Bevölkerungsanteil des Volkes), damit das Tempo nicht mit der
  Zahl der Völker wächst. Ein Volk erfindet erst weiter, wenn die Hälfte seiner Städte die Stufe erreicht hat; eine
  anderswo schon bekannte Stufe holt es mit voller Rate nach. Städte lernen von ihrem Volk und von weiter
  entwickelten Nachbarn; Tochterstädte erben das Zeitalter der Mutterstadt.
  Einzelne Zeitalter streuen trotzdem stark (13–600 Ticks), weil jede Erfindung ein Zufall ohne Gedächtnis ist.

### 2.5 Wanderung (`src/migration.ts`)

- **Aufbruch:** Eine Stadt bricht auf, wenn alle diese Bedingungen gelten:
  - `cityPop ≥ 0,9 × capacity` und `cityPop ≥ 0,25`
  - Abklingzeit 40 Ticks seit dem letzten Aufbruch dieser Stadt
  - auf dem Planeten sind < 5 Gruppen unterwegs, vom eigenen Volk < 2

  Die Gruppe nimmt 0,1 Bevölkerung mit.
- **Ziel und Weg:** Breitensuche ab der Stadt bis zur Reichweite.
  - Kandidat ist jedes Feld, das `citySiteAllowed` erfüllt und mindestens 7 Felder entfernt liegt.
  - Gewählt wird nach `citySiteScore − 0,02 × Weglänge`. Bei Gleichstand entscheidet `world.rng`.
  - Der Weg wird gespeichert.
  - Ohne Kandidaten bricht niemand auf. Das Volk ist dann „Land knapp“.

| Zeitalter | Reichweite (Felder Weg) | Wasser am Stück |
|---|---|---|
| Steinzeit | 12 | Flüsse ja, bis 2 Wasserfelder |
| Bronzezeit | 16 | bis 3 |
| Eisenzeit | 20 | bis 6 |
| Industrie | 30 | offenes Meer |
| ab Atomzeitalter | 40 | offenes Meer |

- **Bewegung:** 1 Feld pro Tick, auf Wasser 2.
- **Ankunft:** Das Ziel wird erneut geprüft. Gültig: Gründung mit dem Zeitalter der Gruppe und `cityPop` 0,1.
  Belegt: Ausweichen im Umkreis 2, sonst löst sich die Gruppe auf.
- **Weicher Deckel** (Entscheidung 15. 10.): Belegen Städte 0,6 % der Landfelder (`CITY_LAND_CAP`), bricht niemand
  mehr auf; Städte wachsen dann nur noch in die Größe. Das gilt als Sättigung, nicht als Knappheit.
- Ab der Industrie ist die Abklingzeit je Stadt lang (500–800 Ticks): Städte wachsen eher in die Größe als in die Zahl.
- Gilt für **alle landlebenden** intelligenten Arten. Zufall nur aus `world.rng`.

### 2.6 Völker

- Die erste Stadt gründet das erste Volk. Neugründungen gehören zum Volk der Mutterstadt.
- **Neues Volk:**
  - sofort bei ≥ 15 Feldern Abstand zur Hauptstadt oder nach einer Überfahrt;
  - sonst selten: Eine Stadt, die ≥ 300 Ticks alt ist und ≥ 8 Felder von der Hauptstadt entfernt liegt, spaltet sich
    mit 1 % Chance je 10 Ticks ab und nimmt die Städte ihres Volkes mit, die ihr näher sind als der Hauptstadt.
- **Höchstens 8 Völker,** 8 feste Volksfarben. Die Farbe eines ausgestorbenen Volkes wird wieder frei. Die
  15-Felder-Regel gründet nur, solange weniger als 6 Völker leben (`TRIBE_FAR_MAX`, Entscheidung 15. 10.); die
  letzten beiden Farben bleiben für Überfahrten und Abspaltungen.
- **Hauptstadt** ist die älteste Stadt des Volkes, nach ihrem Fall die größte.
- **Namen** für Völker und Städte kommen deterministisch aus Seed und Position, über einen Silbengenerator. Er
  verbraucht kein `world.rng`.

### 2.7 Hunger und Seuchen (`src/epidemic.ts`, eigene Städteliste)

- **Hunger:** Über der Tragfähigkeit verliert eine Stadt je Tick 10 % ihres Überschusses.
- **Seuchenrisiko je Tick:** Es steigt mit dem Verhältnis Bevölkerung zu Tragfähigkeit und mit dem Knappheitszähler.
  - **Ab der Industrie** senkt Medizin das Risiko, je nach Medizin-Regler um 30–80 %.
  - Eine Stadt, die vor Kurzem eine Seuche hatte, ist eine Zeit lang immun.
- **Ausbruch:** −25 % Bevölkerung sofort, danach einige Ticks lang −3 % je Tick.
  - Er springt mit kleiner Chance auf Städte bis 14 Felder Entfernung über.
  - Sichtbar über das bestehende Seuchen-Ereignissymbol (`eventKind`/`eventTtl`) und als kurze Meldung mit dem
    Stadtnamen.
- Die natürliche Seuche in `geo.ts` ist abgeschaltet; natürliche Seuchen laufen nur noch über die Städteliste. Ihr
  Wurf zieht weiter dieselben Zufallszahlen (ohne Wirkung), damit jede Saat ihre Geschichte behält.

### 2.8 Konflikte (Phase 2, `src/conflict.ts`)

- **Wann:**
  - zwei Städte verschiedener Völker, höchstens 14 Felder auseinander,
  - **und** beide sind knapp (Knappheitszähler ≥ 30 Ticks), oder eine ist knapp und die andere über 85 % ihrer
    Tragfähigkeit,
  - **und** zwischen beiden Völkern herrscht kein Frieden.
- **Häufigkeit:**
  - Grundchance klein, multipliziert mit dem Aggressionsfaktor (`CivSystem.aggression`)
  - planetenweit **höchstens 1 Konflikt gleichzeitig**, danach ≥ 120 Ticks Pause (`CONFLICT_GAP`)
  - je Völkerpaar 200 Ticks Frieden; danach ruhen **beide Völker 150 Ticks gegenüber allen**, damit das größte Volk
    nicht reihum Krieg führt
- **Verlauf:**
  - Ein Konflikt dauert 6–12 Ticks.
  - **Meldung zu Beginn** (auch als Chronik-Eintrag): „Krieg zwischen den Arkani (Ken) und den Velunen (Teluma).“
  - **Meldung am Ende:** z. B. „Frieden: Die Arkani übernehmen Teluma von den Velunen.“ oder „Frieden: Die Velunen
    wehren den Angriff der Arkani ab.“
- **Ausgang:** Die Stärke ist die Bevölkerung aller Städte des Volkes an der Front (14 Felder um beide Städte) ×
  (1 + 0,25 × Zeitalter). Der Militär-Regler wirkt über die Häufigkeit, weil er für beide Seiten gleich ist. Der
  Sieger wird nach Stärke gewichtet ausgelost.
  - Der Verlierer verliert 30 %.
  - Bei Stärkeverhältnis ≥ 1,5 oder Rest < 0,12 wird die Stadt **übernommen**.
  - Unter 0,05 wird sie **zerstört**.
  - Der Sieger verliert 10 %.
- **Atomkrieg** braucht zwei Völker mit Atom-Städten, insgesamt mindestens 4. Das Ziel ist eine Stadt des Gegners,
  ausgelöst über das bestehende Ereignis (`civEventSink`). Er fällt nie während eines Krieges und setzt danach
  Frieden und Ruhe wie ein Krieg.

### 2.9 Klima und Schwellen

- **CO₂-Ausstoß:** `CITY_WEIGHT` (geeicht auf 3) gewichtet Energie und Atmung, denn eine Stadt steht für ihr Umland.
  Ziel: Industrie hebt das CO₂ um 60–150 ppm in 500 Ticks (heute bei Seed 12345 rund +100).
- **Seuche:** eigene Schwellen in 2.7. Die Schwelle in `geo.ts` wird nach dem Merge angepasst.
- **Atomkrieg:** siehe 2.8.
- `world.totalCityPop` bleibt die ungewichtete Summe. Sie dient als Bevölkerungsindex.
- **Kohle (15. 10. 2026, `src/coal.ts`):** ein weltweiter Vorrat in Gt, gebildet aus den Sumpfwäldern der Erdgeschichte.
  - Schnittstelle: `coalReserve(world)` fragt ab, `mineCoal(world, menge)` baut ab und gibt die tatsächlich
    abgebaute Menge zurück. `coalDemand(world, params)` ist der Bedarf eines Ticks.
  - Ab dem Industriezeitalter verbrennt jede Stadt den Kohleanteil ihrer fossilen Energie (`COAL_SHARE`: 90 % im
    Industriezeitalter, danach 40 %). `CivSystem.step` ruft dafür nur `mineCoal` auf.
  - Bisher reine Statistik: Die CO₂-Rechnung bleibt unverändert, ein leerer Vorrat hat noch keine Folgen.

### 2.10 Spieler

- **Werkzeug „Städte“:** `app.ts` prüft vor dem Abbuchen den Standort und den Mindestabstand.
  - Meldungen: „Zu nah an Teluma (mind. 7 Felder).“ bzw. „Hier kann keine Stadt stehen: Fels, Wüste oder Eis.“
  - Das Volk kommt aus dem nächsten Volk in Siedlerreichweite, sonst entsteht ein neues.
- **Monolith:** zusätzlich die Standortprüfung.

### 2.11 Speichern und Laden (Formatnummer unverändert, ein optionales Feld)

**Optionales Feld `civ`** (Entscheidung 15. 10., `src/civsave.ts`): Name und Volk je Stadtkachel sowie Name, Farbe
und Elternvolk je Volk. Die Formatnummer bleibt. Fehlt das Feld (alte Spielstände) oder ist es in irgendeinem Punkt
ungültig, wird es ganz verworfen und der Zustand wie unten abgeleitet; der Spielstand bleibt immer ladbar.

Ohne gültiges Feld leitet `CivSystem.sync` den Zustand aus dem Raster ab:

1. Stadtkacheln auf verbotenem Boden werden **zuerst** entfernt, aber nur als Teil eines Teppichs (eine andere
   Stadtkachel näher als 7). Eine einzelne Stadt, deren Boden im Spiel verboten wurde, bleibt.
2. Ausdünnen nach Bevölkerung, absteigend: Liegt eine Stadt näher als 7 Felder an einer behaltenen, wird ihre
   Bevölkerung dort aufgeschlagen (bis zur Tragfähigkeit), und ihre Kachel wird geleert. So wird aus einem alten
   Stadtteppich eine Handvoll Städte.
3. **Völker:** Die größte noch freie Stadt wird Hauptstadt eines neuen Volkes. Alle freien Städte, die über Land
   höchstens 15 Felder entfernt sind, schließen sich an. Das wiederholt sich. Bei mehr als 8 Völkern geht das
   kleinste im nächsten auf.
4. Namen kommen aus Seed und Position, Farben aus der Reihenfolge der Hauptstädte (Kachelindex).
5. Nach dem Laden ruhen Konflikte 100 Ticks.

**Was beim Laden verloren geht:**
- Unterwegs befindliche Siedler samt ihrer Bevölkerung.
- Friedenszeiten, Ruhe der Völker, Seuchen-Immunität, Abklingzeiten und das Alter der Städte (es zählt ab dem
  Laden).
- Nur bei Spielständen ohne das Feld `civ` (ältere): Namen und Volkszugehörigkeit werden neu abgeleitet. In langen
  Spielen sind 50–90 % der Städte mit den Platten gewandert und heißen danach anders.

### 2.12 Wasserlebende Arten

Vorerst keine Zivilisation:
- Intelligenz entsteht nur noch bei landlebenden Arten.
- Unterwasserstädte gibt es im Code nicht.
- Alte Spielstände mit Walen oder Weichtieren als intelligenter Art behalten ihre Küstenstädte. Diese wachsen und
  schrumpfen, senden aber keine Siedler aus und führen keine Konflikte.

---

## 3. Darstellung

### 3.1 Stadt-Pixelkunst (`tools/civ/`, `tools/civ-atlas.js`)

- **Pixel-Art im Landschaftsstil** nach `docs/landschaft-2026-10/stil.md`:
  - 3/4-Ansicht, Licht von oben links
  - selektive Kontur aus der eigenen Rampe, keine Tinte, keine Halbtransparenz
  - nur Farben der gemeinsamen Palette `tools/terrain/palette.js`
- **Erzeugt aus Rezepten, nie von Hand gemalt.**
  - `tools/civ-atlas.js` nutzt `tools/terrain/palette.js`, `kit.js` und `png.js` nur lesend. Daraus entstehen
    `assets/civ/atlas.png` und `src/civatlas.ts` (Data-URI und Manifest, wie `terrainatlas.ts`).
  - Der Landschafts-Atlas bleibt unberührt.
  - `tests/civart.test.js` schlägt fehl, solange der Stadt-Atlas veraltet ist.
- **Bausteine je Zeitalter (4–5):** Gebäude in 2–3 Größen, bis 16 × 20 px. Dazu Zubehör (Feuerstelle, Palisade,
  Mauerstück, Schlot), Brücken waagerecht und senkrecht (ab der Bronzezeit) und ein 3 × 4 px großer Wimpel in den
  8 Volksfarben.

| Zeitalter | Bausteine (Richtwert) |
|---|---|
| Steinzeit | Rundhütte (Stroh oder Fell), Langhaus, Feuerstelle, Palisadenstück, Menhir |
| Bronzezeit | Lehmziegelhaus mit Flachdach, Speicher, Stufentempel, Lehmmauer |
| Eisenzeit | Fachwerkhaus, Steinhaus mit Ziegeldach, Turm, Steinmauer, Säulentempel |
| Industrie | Ziegelreihenhaus, Fabrikhalle, Schlot, Bahnhofshalle |
| Atomzeitalter | Betonblock, Wohnhochhaus, Kühlturm |
| Informationszeitalter | Glasturm, Pavillon, Funkturm |
| Nanotech | Kuppel mit Grün, organischer Turm, Megaturm |

### 3.2 Zusammensetzung (`src/citylayout.ts`, rein, in Node testbar)

- **Eingaben:** Kachel, Zeitalter, Größenstufe, Flusslauf.
- **Ausgabe:** eine Liste von Bausteinen mit Fußpunkt in der Kachel. Wahl, Lage und Variante kommen aus dem
  Kachel-Hash, nie pro Bild.
- **Wachstum:** Das Dorf hat 2–3 kleine Gebäude, die Stadt 4–5 mit mittleren, die Großstadt 6–8 mit einem
  Wahrzeichen. **Immer innerhalb der eigenen Kachel**: Füße in x 2..13, y 5..13. Hohe Gebäude ragen bis 4 px in
  die Kachel darüber.
- Die untersten 2 Zeilen bleiben frei. Dorthin reichen Baumkronen der Kachel darunter.
- **Fluss:**
  - Die Bausteine halten Abstand zum Flusslauf. Dafür dient dieselbe Abfrage wie bei den Pflanzen
    (`TerrainField.paths.near`, Abstand 2).
  - Gebäude stehen links und rechts des Flusses.
  - Ab der Bronzezeit kommt eine Brücke quer zur Flussrichtung (`RiverSystem.connectionMask`) in Kachelmitte.

### 3.3 Stadtebene (`src/citylayer.ts`)

- **Eigene transparente Ebene über Boden und Vegetation**, nicht pro Biom vorgerendert. Boden, Übergänge und
  Vegetation darunter verändern sich weiter von selbst.
- **Zeichnen:** `render.ts` zeichnet die Ebene im Grundbild direkt nach `land.draw`, mit **derselben Skalierung**
  wie die Landschaft (Nearest Neighbour auf das k-Fache, dann weich auf die Zoomstufe). Sie bleibt dadurch fest in
  der Landschaft und skaliert wie Bäume.
- **Zwischenspeicher:** je Stadt ein Bild bei 16 × 20 px (RGBA), Schlüssel aus Kachel, Zeitalter, Größe,
  Volksfarbe und Flussform; dazu je Zoomstufe die k-fache Vergrößerung.
- **Schlagschatten** zeichnet der Renderer unter jedem Baustein: eine flache Ellipse wie bei den Bäumen, als
  halbtransparentes Dunkel, etwa wie eine Rampenstufe −2.
- **Überstand:** Bei Teilneuzeichnungen (Verschieben der Karte) werden auch die Städte der Zeile unter dem Bereich
  gezeichnet, beschnitten auf den Bereich, damit der Überstand nach oben nicht abreißt.
- **Altes Zeichnen entfällt:** `drawTileTop` zeichnet keine Städte mehr. `CITY_SPRITES` und `TileCache.city` werden
  nach Prüfung aller Verweise entfernt.

### 3.4 Vegetation auf der Stadtkachel

**Kein Eingriff nötig.** `landfield.ts` setzt schon heute auf Stadtkacheln keine Pflanzenobjekte; der Boden bleibt
sichtbar. Ein Dorf im Wald steht also auf einer Lichtung, und die Gebäude bleiben lesbar. Sollen einzelne niedrige
Pflanzen zwischen den Gebäuden stehen bleiben, wäre das eine Änderung in `landfield.ts`. Die würde ich vorher zeigen.

### 3.5 Herausgezoomt, Namen, Überfahren

- Unter 16 px pro Kachel erscheint zusätzlich eine kleine **Markierung mit Volkswimpel** in fester Bildschirmgröße
  (SVG, 12 px).
- **Namen** stehen ab 24 px pro Kachel unter der Stadt (kleine Schrift mit dunkler Kante). Beim Überfahren mit der
  Maus erscheinen sie immer, im bestehenden Hover-Text: „Teluma · Arkani · Dorf, Steinzeit“.

### 3.6 Siedler (SVG wie die Tiere)

- **Format:** `Art` aus `species/types.ts`, gezeichnet mit `artdraw.ts` (Tintenkontur, Schatten). 1 Kachel groß,
  gleitet zwischen den Feldern und spiegelt nach der Laufrichtung, wie `HerdLayer`. Ein kleiner Wimpel trägt die
  Volksfarbe.

| Zeitalter | Menschen (Säugetiere) | auf Wasser |
|---|---|---|
| Steinzeit | Mensch mit Keule und Bündel | Floß |
| Bronzezeit | Mensch mit Speer, Packesel | Einbaum |
| Eisenzeit | Ochsenkarren | Segelschiff |
| Industrie | Planwagen | Dampfschiff |
| Atom- bis Nanotech | Lastwagen, später Schwebegleiter | Frachter |

- **Nicht-menschliche Arten:** vorerst ein neutraler Platzhalter (Bündel mit Volkswimpel). Eigene Figuren werden
  nachgeliefert.

### 3.7 Kampf- und Seuchensymbol

- **Konflikt:** ein SVG-Kampfsymbol zwischen den beiden Städten, solange er dauert. Bis zur Eisenzeit gekreuzte
  Waffen mit Staubwolke, ab der Industrie eine Rauchwolke.
- **Seuche:** das bestehende Ereignissymbol.

### 3.8 Untersuchen-Fenster, Meldungen, Chronik

- **Untersuchen:** Name, Volk (Farbpunkt), Zeitalter, Größe, Bevölkerung in % der Tragfähigkeit, Lage
  (Fluss, Küste).
- **Kurze Meldungen:** neues Volk, Seuche, Konflikt (Beginn und Ende), aufgegebene Stadt.
- **Chronik:** neues Volk, erste Überfahrt, neues Zeitalter (wie heute), Konflikt mit Ausgang.

---

## 4. Dateien und Zuständigkeiten

| Datei | Inhalt | Wer |
|---|---|---|
| `src/civstate.ts` (neu) | `CivState`, Typen, Größenstufe, Namensgenerator | C0 |
| `constants.ts` | Abschnitt „civilization tuning“ (Abstände, Reichweiten, Raten) | C0, Werte C1 |
| `world.ts` | Feld `civ`, Leeren in `reset`/`copyFrom` (≈ 4 Zeilen) | C0 |
| `tools/civ-probe.js` (neu) | Headless-Messung aller Abnahmewerte je 100 Ticks | C0 |
| `src/civsite.ts`, `cities.ts`, `migration.ts`, `epidemic.ts` (neu) | Standorte, Tragfähigkeit, Abgleich/Laden, Wachstum, Zeitalter, Völker, Wanderung, Hunger/Seuchen | C1 |
| `src/civ.ts` | Taktgeber, Intelligenz nur an Land, Energie | C1 |
| `app.ts`, `panels.ts` | Werkzeugprüfung, `sync` nach Laden/Bearbeiten, Meldungen, Untersuchen-Fenster (nur Verdrahtung) | C1 |
| `tests/civ.test.js` (neu) | Abstand, Standorte, Siedler, Wasser je Zeitalter, Völker, Laden/Ausdünnen, Determinismus | C1 |
| `tools/civ-atlas.js`, `tools/civ/*.js` (neu) | Rezepte, Prüfungen, Kontaktbögen | C2 |
| `assets/civ/atlas.png`, `src/civatlas.ts` (erzeugt) | Stadt-Atlas | C2 (einziger Schreiber) |
| `src/citylayout.ts`, `src/citylayer.ts`, `src/civart/*.ts`, `src/civfigures.ts` (neu) | Zusammensetzung, Stadtebene, Siedler- und Markierungs-SVGs, Siedler auf der Karte | C2 |
| `render.ts`, Hover in `app.ts` | Einhängen der Ebenen (nur Verdrahtung) | C2 |
| `tests/civart.test.js` (neu) | Atlas aktuell, Bausteine im Stil, Layout in der Kachel und neben dem Fluss | C2 |
| `src/conflict.ts` (neu) + Test | Konflikte, Frieden, Atomkrieg zwischen Völkern | C3 |

**Unberührt:** `geo.ts` (bis nach dem Merge), `climate.ts`, `succession.ts`, `biome.ts`, `landscape.ts`, `land*.ts`,
`tools/terrain/`, `save.ts`. `herds.ts` nur für den Abstand der Tier-Icons zu Städten (Freigabe Steinzeit).

---

## 5. Ablauf

Alle arbeiten im selben Arbeitsbaum und bauen mit `SE_BUNDLE` in eigene Dateien. Gemeinsame Dateien werden nur
punktuell geändert und jeweils direkt vorher frisch gelesen; parallel läuft die Epochen-Sitzung. Committet wird nur
auf Wunsch.

1. **C0 Lead:** Grundgerüst (siehe Tabelle).
2. **C1 Logik** und **C2 Grafik** parallel.
   - C2 liefert zuerst die **Steinzeit-Referenz**: Bausteine sowie Beispielstädte (Dorf, Stadt, Großstadt) in
     mehreren Biomen und an einem Fluss, als Kontaktbogen und Karten-Screenshot. **Dann Freigabe durch dich.**
   - Danach folgen die übrigen 6 Zeitalter und die Kartenebene.
3. **C3 Konflikte**, sobald Städte und Wanderung laufen.
4. **C4 Review:** ein unabhängiger Agent prüft gegen Abschnitt 6. Bericht in `docs/zivilisation-2026-10/review.md`.
5. **Doku:** `docs/zivilisation-2026-10/bericht.md` und `AGENTS.md` (Layout, Befehle).

---

## 6. Abnahmekriterien (messbar)

| Kriterium | Messung | Ziel |
|---|---|---|
| Keine flächige Bebauung | `tools/civ-probe.js` jede Runde; Test | jedes Stadtpaar ≥ 7 Felder; Stadtkacheln < 0,5 % des Landes bis Ende Eisenzeit, ≤ 0,65 % im ganzen Spiel |
| Wenige, erkennbare Städte | Probe, 3 Seeds | Ende Steinzeit 3–10, Ende Eisenzeit 8–25 Städte |
| Standorte | Probe | 0 Neugründungen auf Fels, Wüste, Eis oder Wasser; ≥ 70 % an Fluss oder Küste (Feld oder Nachbar) |
| Siedler sichtbar | Probe; Screenshot mitten im Weg | in der Wachstumsphase in ≥ 30 % der Ticks ≥ 1 Gruppe unterwegs; ≤ 5 gleichzeitig; Weg ≥ 7 |
| Wasser je Zeitalter | Test | Stein ≤ 2, Bronze ≤ 3, Eisen ≤ 6 Wasserfelder am Stück |
| Optik wechselt mit dem Zeitalter | Kontaktbogen; Screenshot-Folge | 7 klar verschiedene Bausätze; jede Größenstufe erkennbar bei 16 px |
| Städte fest in der Landschaft | Screenshots bei 10, 16, 32, 48 px | gleiche Pixelgröße wie Bäume; Fluss frei, Brücke ab Bronze; Markierung unter 16 px |
| Völker | Probe | ≥ 2 Völker auf großen Kontinenten bis zur Eisenzeit |
| Hunger und Seuchen | Probe, voller Kontinent | Seuchen nur bei Knappheit; ab Industrie mit Medizin seltener |
| Konflikte selten, nachvollziehbar | Probe über die ganze Laufzeit | ≥ 2 Konflikte im Spiel, ≤ 12 in jeden 1000 Ticks; nie 2 gleichzeitig; Pause ≥ 120 Ticks; Paar-Frieden ≥ 200; Meldung zu Beginn und Ende |
| Vegetation und Tiere sichtbar | Screenshot Zoom 16; Herdenzählung | Herden-Icons zwischen den Städten; Landschaft zwischen den Städten unverändert |
| Klima wirksam | Probe Seed 12345 | Industrie +60–150 ppm CO₂ in 500 Ticks |
| Laden | Test | Altstand mit Stadtteppich lädt, verbotene Böden zuerst geräumt, ≥ 7 Felder Abstand |
| Leistung | Probe, Browser | `civ.step` < 2 ms pro Tick; Stadtebene < 2 ms je Neuzeichnung |
| Gesamt | `npm test` | grün |

---

## 7. Entscheidungen (14. 10. 2026)

| Nr. | Entscheidung |
|---|---|
| Grafik | Städte als Pixel-Art im Landschaftsstil, aus Bausteinen per Kachel-Hash, eigene Ebene, immer eine Kachel (16 × 20); Siedler und andere mobile Figuren als SVG |
| E1 | Mindestabstand **7 Felder** |
| E2 | Wasser: Stein Flüsse + 2, Bronze 3, Eisen 6, ab Industrie offenes Meer |
| E3 | neues Volk ab 15 Feldern oder nach Überfahrt, sonst selten; höchstens 8 |
| E4 | Formatnummer unverändert. Zunächst kein Zusatzfeld; nach dem Review (15. 10.) ein **optionales Feld `civ`** für Namen und Völker, weil sonst die meisten Namen das Laden nicht überstehen |
| Spätphase (15. 10.) | weicher Deckel bei 0,6 % Landanteil |
| Volksfarben (15. 10.) | 15-Felder-Regel höchstens 6 Völker, 2 Farben für Überfahrten und Abspaltungen |
| E5 | eigene Seuchen über die Städteliste; `geo.ts` erst nach dem Merge |
| E6 | Siedlergrafik vorerst nur Menschen, Platzhalter für andere landlebende Arten; Logik für alle landlebenden Arten |
| E7 | Namen für Völker und Städte |
| Wasserarten | vorerst keine Zivilisation; Intelligenz nur bei landlebenden Arten |
| Steinzeit-Referenz | freigegeben mit zwei Verbesserungen: Erdplatz unter jeder Stadt, Tier-Icons halten ein Feld Abstand zu Städten (`herds.ts`); Stadt und Großstadt deutlicher unterschieden (Großstadt mit geschlossenem Ring, Stadt mit Teilstück). Übernommen: Flussabstand nur für den Fuß, höhere Füße auf Flusskacheln, einzeilige Hütten-Grundrisse |
