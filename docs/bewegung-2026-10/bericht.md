# Mehr Bewegung auf der Erde: Holz, Felder, Entdeckung, Schiffe, Eisenbahn, Weltwunder

Stand: 22. 10. 2026.

## 1. Was der Spieler sieht

| Zeitalter | Neu auf der Karte |
|---|---|
| Steinzeit | erste Hackgärten am Dorf; wenig Holzeinschlag |
| Bronzezeit | Streifenfluren, Reisfelder, Terrassen; Rodungen um die Städte; Galeeren vor den Küstenstädten; die Pyramiden entstehen |
| Eisenzeit | die stärkste Abholzung; Triremen; Seeschlachten; die Chinesische Mauer wächst Stück für Stück; am Ende die Entdeckerfahrt mit drei Karavellen |
| Industrie | Kolonien auf dem neuen Kontinent; Raddampfer; Linienschiffe zwischen den Kontinenten; die erste Eisenbahn mit Dampflok; Heckenlandschaft |
| Atomzeitalter | Schnellzug, Containerschiffe, große Felder; die Wälder wachsen nach |
| ab Informationszeitalter | Magnetschwebebahn |

Jedes Ereignis mit Gewicht bekommt eine Meldung und einen Chronik-Eintrag mit kurzer Erklärung: Aufbruch ins
Unbekannte, Ein neuer Kontinent, die erste Eisenbahn, Baubeginn und Vollendung jedes Weltwunders.

Alles gilt für jede intelligente Art, die Texte nennen Art und Völker.

## 2. Holz und Abholzung (`src/wood.ts`, Werte `WOOD_*` in `src/constants.ts`)

- Jede Stadt holzt ihr Umland ab, Reichweite ≈ 4,5 Felder (68 Felder).
  - Betroffen sind Wald- und Gebüschfelder, nie mehr als die Hälfte von ihnen.
  - Die nächsten 60 % davon werden gerodet und werden über die Sukzession zu Wiese, Steppe, Savanne oder Sumpf.
  - Der Rest wird ausgelichtet (lichter Wald). Der Rand der Rodung ist durch einen Hash-Wurf je Feld unregelmäßig.
- Holzbedarf je Zeitalter (Felder bei voller Bevölkerung):

  | Stein | Bronze | Eisen | Industrie | Atom | Information | Nanotech |
  |---|---|---|---|---|---|---|
  | 3 | 16 | 28 | 12 | 4 | 3 | 2 |

  Kohle ersetzt Holzkohle, deshalb wachsen die Wälder in der Neuzeit sichtbar nach.
- **Nachwachsen:** Je Feld merkt sich `world.logged` (ein Byte), wie weit die Pflanzendecke höchstens reichen darf.
  - Ohne Nutzung wird ein gerodetes Feld in etwa 400 Jahren wieder Wald, über Gebüsch und lichten Wald.
  - Im Atomzeitalter sind das rund 40 Ticks.
  - Das gilt auch, wenn eine Zivilisation untergeht.
- **Pflanzendecke, CO₂, Tiere und Biomasse folgen der Abholzung von selbst.** Felder, die eine Stadt gerade gerodet
  hält, tragen das Landnutzungs-Bit `LAND_USE_LOGGED`; die Felder (Abschnitt 3) bevorzugen sie.
- **Holzvorrat:** der Wald des ganzen Planeten, 0,3 Gt Trockenholz je voll bewachsenem Feld, zusammen etwa
  1.000–1.600 Gt.
  - „Geschlagenes Holz“ zählt, was die Städte geschlagen haben, über ein Spiel 170–475 Gt.
  - Beide Werte stehen in der Zivilisationsstatistik (Grafiken und Bericht) neben Kohle und Öl.
- **Holzmangel hat genau eine Folge:** Gibt das Umland einer Stadt weniger als die Hälfte ihres Holzbedarfs her
  (`cityWood` < 0,5), baut sie keine neuen Schiffe. Das betrifft je nach Planet 10–30 % der Städte.
- **Gemessen (Erde heute, Seed 12345):**
  - Auf dem Höhepunkt der Eisenzeit sind 29 % der Wälder im Umland abgeholzt, die Pflanzendecke sinkt dort auf 0,70.
  - Im Informationszeitalter sind es noch 9 %, und 85 % des Umlandwalds sind wieder dicht.
  - Andere Seeds: 13–23 % am Höhepunkt.

## 3. Felder (`src/fields.ts`, Bodentexturen `tools/terrain/fields.js`)

- Felder gibt es ab dem ersten Steinzeitdorf.
  - Ein Dorf hat 1–2 kleine Hackgärten, eine Großstadt im Atomzeitalter bis zu 9 Felder.
  - Mit jedem Zeitalter werden es mehr (`FIELD_COUNT` je Zeitalter und Größe).
- Felder liegen nur im Umland: bis 2 Felder weit beim Dorf, bis 3 bei der Großstadt. Die Felder zweier Städte
  (≥ 7 Felder Abstand) berühren sich also nie.
- **Wo:** auf fruchtbarem, offenem Land (Wiese, Steppe, Savanne, Gebüsch, Farnflur).
  - Im Wald nur, wo er licht oder abgeholzt ist; gerodetes Land wird bevorzugt.
  - Sumpf nur als Reisfeld, Halbwüste nur am Fluss, bewässert wie am Nil.
  - Nie auf Wasser, Fluss, Wüste, Fels oder Eis, nie an Hängen über 0,25, nie unter Bahn oder Weltwunder.
  - Flussnähe zieht Felder an. Die Wahl ist gierig, so liegen die Felder beieinander und an der Stadt.
- **Sieben Feldbilder:**

  | Zeitalter | gewöhnliches Land | trockenes Land | Hang ≥ 0,15 | warmes, feuchtes Tiefland |
  |---|---|---|---|---|
  | Steinzeit | Hackgärten | Hackgärten | keine | Hackgärten |
  | Bronze, Eisen | Streifenflur mit Getreide | Hirse | Terrassen | Reisfelder |
  | Industrie | Heckenlandschaft | große Felder | Terrassen | Reisfelder |
  | ab Atom | große Felder | große Felder | Terrassen | Reisfelder |

- **Darstellung:** Die Felder sind Bodentexturen des Landschafts-Atlas aus Rezepten in der gemeinsamen Palette.
  - Ihr Rang liegt über dem offenen Land und unter Gebüsch, Sumpf und Wald. So fransen ihre Ränder in Wiese und
    Steppe aus, und Waldränder legen sich über sie.
  - Auf Feldern wachsen keine wilden Pflanzen.
- Rein grafisch und abgeleitet: Sie werden nicht gespeichert, nach dem Laden sofort neu gelegt und verschwinden mit
  ihrer Stadt.

## 4. Entdeckerfahrt und Kolonien (`src/discovery.ts`, Werte `DISCOVERY_*`)

- **Unentdeckter Kontinent:** die größte Landmasse mit mindestens 150 Feldern und 3 Stadtplätzen, auf der noch
  keine Stadt steht. Ob Siedler der Eisenzeit sie hätten erreichen können, spielt keine Rolle.
- **Sperre:** Solange es einen solchen Kontinent gibt, wird die erste gelungene Erfindung des Industriezeitalters
  zurückgehalten.
  - Stattdessen laufen drei Segelschiffe aus. Hafen ist die Küstenstadt mit dem kürzesten Seeweg zu diesem Kontinent,
    bevorzugt eine des erfindenden Volkes.
  - Die Schiffe fahren 1,5 Felder je Tick, mindestens 10 und höchstens 30 Ticks lang.
  - Sie warten auf keinen freien Siedlerplatz; die Obergrenze von 5 Siedlergruppen gilt neben ihnen.
- **Landung:**
  - Die Expedition gründet die erste Kolonie, sofort als eigenes Volk.
  - Die zurückgehaltene Erfindung kommt im nächsten Tick.
  - Das Industriezeitalter beginnt so 11–31 Ticks nach der Erfindung.
- **Ohne Kontinent** entfällt die Bedingung sofort, ohne Hafen oder Seeweg nach 150 Ticks. Ebenso bei einer
  intelligenten Meeresart oder wenn es das Industriezeitalter schon gibt (Städte-Werkzeug, alter Spielstand).
- **Kolonien:** Nach der Entdeckung segeln Siedler ab der Eisenzeit bis 160 Felder über das offene Meer, zuerst zu
  Küstenplätzen des neuen Kontinents.
  - Etwa jede zweite Gruppe einer vollen Küstenstadt versucht es zuerst dort.
  - Von den Kolonien aus geht es nach den gewohnten Regeln landeinwärts.
  - Eine Stadt, deren einziger Ausweg das Meer zum neuen Kontinent ist, gilt weiter als beengt. Knappheit, Seuchen
    und Kriege entstehen also wie vor der Entdeckung, auch solange der neue Kontinent Platz hat.
- **Volksfarben:** Solange ein Kontinent wartet, lassen Überfahrten und Abspaltungen die letzte der 8 Volksfarben
  frei. So wird die erste Kolonie ein eigenes Volk. Sind trotzdem alle Farben vergeben, schließen sich Kolonisten
  dem nächsten Volk auf dem neuen Kontinent an.
- **Meldungen:** große Chronik-Einträge „Aufbruch ins Unbekannte“ und „Ein neuer Kontinent“. Der Bezug zur Erde ist
  vorsichtig formuliert: Kolumbus segelte 1492 mit drei Schiffen; die feste Kopplung an die Industrie ist eine
  Spielregel.
- **Gemessen** (Probe, 2500 Ticks):

  | Planet | Fahrt | Industrie |
  |---|---|---|
  | Erde heute, Seed 12345 | die Zivilisation erwachte in Nordamerika; 55 Felder über den Pazifik nach Australien, 30 Ticks | +1372 statt +890 |
  | Seed 99 | 41 Felder, 27 Ticks | +1091 statt +1063 |
  | Seed 2024 | 41 Felder | +1396 statt +1309 |
  | Seed 42 | 30 Felder | +1171 statt +1495 |

  - Nur 11–31 Ticks der Verschiebung kommen von der Sperre selbst. Der Rest ist Zufall der Zeitalter, weil die
    Farbreservierung eine Abspaltung verhindert und die Geschichte danach anders verläuft.
  - 100 Ticks nach der Landung standen 1–5 Städte auf dem neuen Kontinent, nach 300 Ticks 5–9.

## 5. Schiffe und Seeschlachten (`src/fleets.ts`, `src/shiplayer.ts`, Werte `SHIP*`, `LINER*`)

- **Küstenschiffe:** Küstenstädte am offenen Meer halten ab der Bronzezeit Schiffe: Dorf 0, Stadt 1, Großstadt 2.
  - Offenes Meer heißt: ≥ 60 Wasserfelder, kein Binnensee, eisfrei ab 5 °C.
  - Planetenweit fahren höchstens 13 Küstenschiffe und 3 Linienschiffe.
  - Ein neues Schiff braucht Holz (Abschnitt 2).
- **Routen:** Jedes Schiff fährt eine feste Route hin und her, mit kurzem Halt in jedem Hafen.
  - Es ankert auf freiem Wasser vor seiner Stadt, höchstens 4 Felder vor dem Hafen.
  - Es fährt nur dort, wo der ganze Rumpf über Wasser liegt: nie über Land, Gleis, Stadt oder Weltwunder.
  - Wartende Schiffe (Anker, Routenende, Gefechtsposition) halten mindestens 3 Spalten oder 2 Reihen Abstand.
  - Ziel ist eine Küstenstadt des eigenen Volkes in höchstens 30 Schritten, sonst eine Schleife von etwa 10 Feldern
    entlang der eigenen Küste.
  - Vor der Industrie bleiben Schiffe höchstens 2 Felder vom Land.
- **Linienschiffe:** Ab der Industrie verbinden 1–3 Linienschiffe große Hafenstädte auf verschiedenen Landmassen auf
  dem kürzesten Seeweg (≥ 16 Felder). In der Probe waren das Routen von 29–104 Feldern.
- **Aussehen nach Zeitalter:** Bronzezeit Galeere, Eisenzeit Trireme, Industrie Raddampfer, ab Atomzeitalter
  Containerschiff, in der Schlacht ab der Industrie Kriegsschiff. Jedes Schiff trägt den Wimpel seines Volkes,
  Dampfer und Frachter rauchen.
- **Seeschlacht:** Liegen beide Städte eines Krieges (`conflict.ts`) am selben Meer, laufen ihre Flotten zu einem Punkt
  auf halbem Seeweg aus und kämpfen dort, mit Pfeilhagel oder Geschützen und Einschlägen im Wasser.
  - Wer gewinnt, entscheidet weiter `conflict.ts`; es setzt dafür `Conflict.winner`.
  - Die Schiffe der Verlierer sinken: Der Rumpf taucht an der Wasserlinie ab, das Wrack brennt, Ring und Planken
    gehen unter. Nichts wird ausgeblendet.
  - In der Seeschlacht nimmt jedes Schiff eine eigene Position auf seiner Seite des Kampfplatzes ein.
  - Eine Kriegsstadt ohne Schiff baut sofort eines, auch über die Obergrenze; sonst würde kaum ein Krieg eine
    Seeschlacht. Holzmangel verhindert aber auch dieses Schiff: Im Probelauf hatten zwei abgeholzte
    Eisenzeit-Küstenstädte kein Schiff, ihr Krieg blieb eine Landschlacht.
  - Ab 16 px je Feld ersetzt die Seeschlacht das gekreuzte Kampfsymbol, darunter bleibt das Symbol.
- **Siedlerboote:** Siedler auf dem Wasser fahren ab 16 px je Feld als Pixelboot ihres Zeitalters (Floß, Einbaum,
  Karavelle, Dampfer, Frachter) mit Volkswimpel; darunter bleibt die SVG-Figur. Die Entdeckerfahrt erscheint als drei
  Karavellen im Verband.
- Ein Schiff bleibt, auch wenn seine Stadt schrumpft oder ihr Holz ausgeht. Es verschwindet nur mit seiner Stadt,
  durch Untergang oder wenn keine Route mehr zu finden ist.
- Schiffe werden nicht gespeichert: Nach dem Laden bauen die Städte sie neu, ein Schiff je Tick. Routen werden nur
  beim Stapellauf gesucht oder wenn Drift, Pinsel, Eis, eine neue Stadt oder die Bahn sie unterbrechen.
- „Effekte reduzieren“ hält auch die Siedlerboote an.

## 6. Eisenbahn (`src/railway.ts`, `src/landrail.ts`, `src/trainlayer.ts`, Werte `RAIL_*`)

- **Eine einzige Linie je Planet**, kein Straßennetz. Gebaut wird sie, sobald ein Kontinent mindestens 3 Städte ab dem
  Industriezeitalter hat, die mindestens 20 Felder von West nach Ost auseinanderliegen.
  - Vorrang hat der neu entdeckte Kontinent, wie bei der ersten transkontinentalen Bahn 1869.
  - Ist er nach 150 Ticks im Industriezeitalter nicht so weit, oder wurde nichts entdeckt, bekommt die kleinste
    geeignete Landmasse die Linie. So fahren auch dort Dampfzüge.
- **Trasse:** eine saubere Linie vom westlichsten zum östlichsten Bahnhof, nur über Land, auch über die Datumsgrenze.
  - Höchstens 6 Bahnhöfe. Zwischen den Enden nur Städte, die höchstens 6 Felder neben der geraden Verbindung liegen
    und mindestens 8 Felder auseinander.
  - Kein Abschnitt liegt neben einem anderen. Bahnhöfe, für die die Linie umkehren müsste (Stichbahn, Haarnadel um
    einen See), fallen weg.
  - Die Strecke meidet Stadtfelder. Der Zug hält auf einem Feld neben der Bahnhofsstadt, vorzugsweise davor (südlich),
    damit das Stadtbild sichtbar bleibt.
  - Die Wegsuche (A*) meidet steile Hänge, Hochgebirge über der Baumgrenze, Eis und Weltwunder.
  - Sie bevorzugt Täler, quert Flüsse auf Brücken und überquert kein Meer.
- **Schneise:** Auf den Gleisfeldern wachsen keine Pflanzen, Bäume rücken nicht über das Gleis.
- **Gleis:** Teil der Landschaft, gezeichnet beim Zusammensetzen der Chunks im Landschafts-Worker, skaliert wie ein
  Fluss.
  - Industrie: Holzschwellen auf grauem Schotter.
  - Atomzeitalter: Betonschwellen.
  - Ab dem Informationszeitalter: ein schlanker Betonfahrweg.
  - Über Wasser eine Brücke mit Trägern; das Gleis wirft einen Schatten nach unten rechts.
- **Zug:** Ab 16 px je Feld fährt ein Zug aus 4 Teilen hin und her und hält an jedem Bahnhof 3 s.
  - Dampflok (4-4-0 mit Tender) mit Holzwagen und Dampfwölkchen, Schnellzug oder Magnetschwebebahn, nach dem
    höchsten Zeitalter der Linie.
  - Jedes Teil zeigt in eine der 8 Fahrtrichtungen. Bei „Effekte reduzieren“ steht der Zug am westlichen Endbahnhof.
- **Meldungen:** „Die erste Eisenbahn verbindet <West> und <Ost>“ (großer Chronik-Eintrag).
  - Der Text nennt Dampflokomotiven, Hochgeschwindigkeitszüge oder die Magnetbahn („Die erste Magnetbahn …“), je
    nach Zeitalter der Eröffnung.
  - Kurze Meldungen gibt es beim Schnellzug, bei der Magnetbahn und wenn die Linie unterbrochen wird.
- **Instandhaltung:**
  - Plattendrift verlegt die Linie neu; ein zu Wasser gewordenes Feld verlegt nur seinen Abschnitt.
  - Fehlt ein Bahnhof, fällt er heraus. Bleiben weniger als 2, wird die Linie aufgegeben und später neu gebaut.

## 7. Weltwunder (`src/wonders.ts`, `src/wonderlayer.ts`, Werte `WONDER_*`, `PYRAMIDS_*`, `WALL_*`)

- **Zwei Wunder, je eines pro Planet:**
  - die **Pyramiden** (Bronzezeit), Bauzeit 160 Ticks, 6 sichtbare Bauphasen;
  - die **Chinesische Mauer** (Eisenzeit), Bauzeit 240 Ticks; sie wächst Stück für Stück vom Ende nahe den Städten
    aus.

  Die Tabelle `WONDERS` ist für weitere Wunder offen.
- **Beginn:** ein Volk mit mindestens 2 Städten in diesem oder dem nächsten Zeitalter und zusammen ≥ 0,6
  Bevölkerung; 2 % Chance je Tick (Hash-Wurf).
  - Nur solange der Planet höchstens ein Zeitalter weiter ist: Pyramiden beginnen bis zur Eisenzeit, die Mauer bis
    zur Industrie. Ein laufender Bau wird fertig.
  - Die Völker versuchen es der Reihe nach, das bevölkerungsreichste zuerst.
  - Zwei Wunder liegen mindestens 5 Felder auseinander.
- **Pyramiden-Bauplatz:**
  - 3 × 2 ebene Felder in Wüste oder Halbwüste, sonst trockenes, offenes Land.
  - Kein Fluss und keine Stadt auf oder direkt neben der Fläche.
  - Ein Fluss höchstens 2 Felder entfernt, bis 8 Felder von einer Stadt des Volkes.
- **Mauer-Bauplatz:**
  - Eine Kette aus 8–16 Landfeldern auf dem steilsten Gelände (Gebirgsrand), an der Grenze zum nächsten fremden Volk.
    Ohne Nachbarn verläuft sie zur Steppe hin, sonst nach Norden.
  - Nie über Wasser oder Flüsse, 2 Felder Abstand zu Städten.
  - Ein Wachturm steht auf jedem 4. Stück und an beiden Enden.
- **Erde „Heute“:** Das Spiel erkennt die echte Erde an ihren Küsten, auch nach Plattendrift. Liegt eine passende
  Stadt in Reichweite, gewinnen Gizeh bzw. die Linie bei 40,5° N, 100–120° O. Auf der Spielerde fließt kein Nil durch
  die Sahara, deshalb entfällt dort die Flussbedingung für Gizeh.
- **Wenn die Baustadt fällt:** Die nächste Stadt in 8 Feldern baut weiter, gleich welchen Volkes. Ohne Stadt ruht
  der Bau, mit je einer Meldung.
- **Fertig:** Meldung „Die <Volk> haben ein Weltwunder errichtet: die Pyramiden bei <Stadt>.“ und großer
  Chronik-Eintrag „Weltwunder: die Pyramiden“ bzw. „… die Chinesische Mauer“. Die Erklärung beginnt mit dem Vorbild
  auf der Erde und passt so zu jeder Art und jedem Zeitalter:
  - Gizeh um 2600–2500 v. Chr., die Cheops-Pyramide ursprünglich ~146 m hoch, über 3800 Jahre das höchste Bauwerk.
  - Die Mauern entstanden ab dem 7. Jh. v. Chr., unter Qin Shi Huang verbunden, das meiste stammt aus der Ming-Zeit;
    alle Abschnitte zusammen ~21.000 km.
- Die Wunder folgen dem 3/4-Relief: Die Mauer steigt über Kämme und Felsnadeln.
- Wunder wandern mit den Platten, versinken nur im Meer und bringen keinen Spielbonus.
  - Auf ihren Feldern wachsen keine Wildpflanzen und entstehen keine Städte, kein Förderturm und kein Raumhafen.
  - Der Hover-Text zeigt z. B. „Pyramiden · Arkani · im Bau, 40 %“.
- **Gemessen:** In drei Probe-Spielen (Seeds 12345, 2024, 12345 Heute) entstanden jeweils beide Wunder, 40–330 Ticks
  nach Beginn der Bronze- bzw. Eisenzeit. In „Heute“ stand die Mauer genau auf der echten Linie in Nordchina.

## 8. Grafik

Alles ist Pixel-Art aus Rezepten in der 3/4-Ansicht der Berge: gesehen von Süden unter 45°, Licht von oben links,
dunklere Silhouettenkante, nur Farben der gemeinsamen Palette, höchstens 12 Farben je Bild. Kontaktbögen liegen in
diesem Ordner.

- **Schiffe** (`tools/fx/ships.js`): acht Schiffstypen als Voxelmodelle.

  | Schiff | Größe | Merkmale |
  |---|---|---|
  | Floß | 16×16 | Paddler, Bündel, Wimpelstange |
  | Einbaum | 24×16 | zwei Paddler |
  | Galeere | 32×24 | Ruderreihe, Rahsegel |
  | Trireme | 40×24 | schwarz, rotes Bergholz, Auge, Bronzerammsporn |
  | Karavelle | 32×32 | zwei Rahsegel und ein Lateinersegel |
  | Raddampfer | 32×24 | roter Schlot, Schaufelrad |
  | Containerschiff | 40×24 | weinroter Rumpf, bunte Container |
  | Kriegsschiff | 40×24 | grau, drei Geschütztürme |

  Dazu kommen Kielwasser, Pfeilhagel, Mündungsfeuer, Gischtsäule und das brennende Wrack. Ruder, Segel und
  Schaufelrad bewegen sich in kurzen Schleifen.
- **Züge** (`tools/fx/trains.js`): Jedes Fahrzeug ist ein 3D-Körper, in allen 8 Richtungen eigens gerendert (24×32,
  Mitte auf dem Gleis).
  - Ein Teil ist genau einen Gleisschritt lang, die Wagen schließen lückenlos aneinander.
  - Die Lok hat 4 Bilder für Treibräder und Kuppelstange.
- **Weltwunder** (`tools/fx/wonders.js`):
  - Pyramiden von Gizeh über 3 × 2 Feldern (48×48), in Wirklichkeit gestaffelt.
  - Die Bauphasen zeigen eine echte Baustelle: abgesteckter Grund, grauer Rohstein mit dunkler Ostflanke, eine
    Lehmziegelrampe im Zickzack, Steinbruch und Blöcke, zuletzt ein Holzgerüst. Fertig sind die Pyramiden weiß mit
    vergoldeter Spitze.
  - Die Mauer besteht aus Mauerarmen in 8 Richtungen je Feld (16×32), die sich nahtlos zu Geraden, Diagonalen und
    Knicken fügen. Drei Bauphasen, dazu Wachtürme im Ming-Stil und Bauleute mit einem Steinblock auf dem Schlitten.
- **Felder:** sieben Bodentexturen der Familie `fields` im Landschafts-Atlas (Abschnitt 3).
- **Atlanten:** Schiffe, Züge und Wunder liegen im Effekt-Atlas (`assets/fx/`, 84 Sprites), die Felder im
  Landschafts-Atlas (`assets/terrain/`). Das Gleis zeichnet der Code des Landschafts-Workers mit Palettenfarben.

## 9. Technik

- **`world.landUse`** (ein Byte je Feld, abgeleitet, nie gespeichert):
  - Bits für Felder (Bildnummer 1–7), Bahn, Wunder und gerodet.
  - Jede Funktion setzt und löscht nur ihre eigenen Bits.
  - Die Landschaft setzt auf Feldern mit Feld-, Bahn- oder Wunderbit keine wilden Pflanzen (`landfield.ts`).
- **`src/landmass.ts`:** Landmassen mit 8 Nachbarn über die Datumsgrenze, ≈ 1–2,5 ms je Aufruf. Entdeckung, Bahn und
  Linienschiffe rufen es nur bei Bedarf auf.
- **Determinismus:** Keine neue Funktion zieht Zufallszahlen aus `world.rng`; alle Würfe sind Hashes aus Seed, Tick und
  Feld. Die Geschichte eines Planeten ändert sich also erst dort, wo die Funktionen eingreifen.
- **Worker:**
  - Logik und Wegsuchen laufen in der Simulation im Simulations-Worker.
  - Das Gleis wird im Landschafts-Worker in die Chunks gezeichnet.
  - Schiffe, Zug und Bauleute bewegt die Seite zwischen den Ticks nach der Zeit.
- **Speichern:** optionale Felder `wood`, `discovery`, `rail` und `wonders`; die Formatnummer bleibt. Ein ungültiges
  Feld wird verworfen, der Spielstand lädt immer.
  - Nicht gespeichert werden Schiffe, Felder und eine Entdeckerfahrt unterwegs. Diese bricht nach dem Laden neu auf.

## 10. Geprüft

- **Tests:**
  - Neue Testdateien: `tests/wood.test.js` (4), `fields.test.js` (7), `discovery.test.js` (8), `fleets.test.js` (10),
    `railway.test.js` (10), `wonders.test.js` (12).
  - Zusammen mit `npm run test:quick` und den betroffenen Dateien (save, landfield-incremental, landscape, simworker,
    spaceport, faunasave): 383 Tests, 0 Fehler (einer übersprungen, weil er nur gegen das eingecheckte Bundle läuft).
- **Probe:** `tools/civ-probe.js` (Seeds 12345, 2024, 99, 42, 12345 Heute) je Funktion, mit Vorher-Nachher-Vergleich.
- **Gesamtprüfung im Spiel:** ein unabhängiger Agent prüfte alles zusammen bei 10–48 px pro Feld und dpr 1 und 1,5.
  Seine Befunde sind behoben: Gleisknäuel bei vielen Industriestädten, Zug über der Stadt, Schiffe übereinander und
  über Land, Siedlerboote bei „Effekte reduzieren“, Mauer ohne Relief, Texte der Wunder.
- **Leistung:**
  - Im Browser kosten die neuen Ebenen messbar nichts (`tools/perf-bench.js browser civ`: Bildzeit p50 6,9–7,3 ms
    wie ohne sie).
  - Je Bild: Wunder 0,1–0,17 ms, Zug 0,03–0,05 ms, Schiffe 0,02–0,12 ms.
  - Im Takt: Holz 0,11 ms je Tick (vorher 0,73), Schiffe im Mittel 0,15 ms, Bahn und Wunder je unter 0,05 ms
    außerhalb einmaliger Gründungen.
- **Ursachenanalyse Städtezahl:** gepaarte Läufe aus demselben Stand bei der Intelligenz, je eine Neuerung
  abgeschaltet (Abschnitt 11).
- **Bildschirmfotos:** headless Chrome, je Funktion bei 16 und 32 px pro Feld, dazu die Kontaktbögen; alle in diesem
  Ordner.

## 11. Einschränkungen

- **Die Abnahmewerte der Zivilisation schwanken mit der Geschichte, schon ohne diese Neuerungen.**
  - „8–25 Städte am Ende der Eisenzeit“ verfehlt auch das Spiel mit allen Neuerungen abgeschaltet in etwa der Hälfte
    der Geschichten (6 von 12), „Heute“ (Seed 12345) schon im alten Stand mit 33 Städten.
  - Grund: Die Erfindung der Industrie ist ein Wurf mit fester Rate (im Mittel etwa 250 Ticks Wartezeit). Die Städte
    wachsen derweil um 4–5 je 100 Ticks weiter, so streut die Zahl von 13 bis 74.
  - Abholzung und Farbreservierung verändern die zufällige Geschichte (Seed 2024: 41 statt 18 Städte, „Heute“: 42
    statt 33), aber nicht systematisch.
  - Systematisch ist nur die Sperre selbst mit 1–3 Städten mehr. Das Bauverbot für Städte auf Wunderfeldern ändert nichts.
  - Die frühere Kriegsflaute (Seed 99: 0 statt 3 Kriege) kam von den Kolonien; sie ist behoben (Abschnitt 4).
  - CO₂ im Industriezeitalter hängt an der Städtezahl zu seinem Beginn (+35 bis +356 ppm) und verfehlt 60–150 ppm
    ebenfalls oft, mit und ohne Neuerungen.
  - Mögliche Abhilfe, nicht umgesetzt: Die Industrie-Erfindung mit der Zahl der Eisenzeit-Städte schneller machen
    (z. B. Chance × (Städte / 14)², begrenzt sich bei etwa 20–25 Städten) oder `TECH_ADVANCE[3]` verdoppeln.
- **Nicht nachgemessen:** Die beiden letzten Korrekturen der Entdeckung (kein Warten auf Siedlerplätze, beengte
  Küstenstädte) sind mit Tests geprüft, aber nicht mit einem neuen Probe-Lauf.
- **Messfehler bei Zeiten:** Die Rechenzeiten wurden auf einer stark ausgelasteten Maschine gemessen (9 Agenten
  gleichzeitig). Einzelne Spitzen (Platzsuche der Wunder, Liniensuche der Schiffe, erste Bahntrasse bis 160 ms)
  treten nur bei Gründungen auf.
- **Zeichnen:**
  - Herden-Icons liegen über den Schiffen (gewollte Ebenenfolge).
  - Zwei Schiffe können sich kurz überdecken, wenn eines unterwegs am anderen vorbeifährt; wo Schiffe warten, liegen
    sie nie übereinander.
  - An großen Höhensprüngen bleibt zwischen zwei Mauerstücken eine kleine Stufe an der Feldgrenze.
- **Nicht gemacht:** Katastrophen beschädigen Wunder nicht. Wunder erscheinen nur im Hover-Text, nicht im Fenster
  „Untersuchen“.
- **Nur in headless Chrome geprüft;** andere Browser, Ton und echtes Spielgefühl brauchen deinen Test.
