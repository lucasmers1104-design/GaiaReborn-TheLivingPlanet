# Das Evolutionssystem von SimEarth 2.0

Stand: Oktober 2026. Alle Angaben beziehen sich auf `src/evolution.ts` (Baum, Bedingungen, Texte),
`src/constants.ts` (Lebensräume und Ernährung je Gruppe), `src/flora.ts` (Pflanzenschicht) und
`src/life.ts` (Tierschicht). Die Tabelle unten wird aus den Spieldaten erzeugt – Spielmechanik,
Baumansicht und Ereignistexte lesen dieselben Einträge.

## Grundsätze

**Drei Beziehungen, drei Darstellungen.** Der Baum trennt strikt:

| Beziehung | Bedeutung | Darstellung im Baum | Geprüft durch |
|---|---|---|---|
| Abstammung | Eine Gruppe geht aus *frühen Vertretern* der Vorgängergruppe hervor. Die Vorgänger leben weiter. | durchgezogene Linie, Notiz über dem Knoten (z. B. „Amnioten · Synapsiden“) | Vorgänger entwickelt **und** lebt derzeit auf dem Planeten |
| Lebensraum | Umweltbedingungen: Meer, Ufer, Feuchtgebiet, trockenes Land, Kälte, Sauerstoff | Lebensraum-Symbole am Knoten, Abschnitt „Lebensraum“ in der Detailansicht | Es gibt mindestens einen Ort **neben** den Vorfahren, an dem die neue Gruppe auch dann noch Platz hat, wenn alle Arten, die dort leben könnten, eingewandert sind (dieselbe Funktion, die auch Wachstum und Ausbreitung berechnet; seit 14. 10. 2026) |
| Ökologische Beziehung | Nahrung, Partner (Blüten für Bestäuber), Boden | gestrichelte Pfeile: grün = Pflanzen als Nahrung, orange = Beutetiere, violett = Partner, braun = Boden | eine der genannten Gruppen ist auf mindestens 24 Feldern verbreitet |

Eine Futterpflanze wird nie als Vorfahr dargestellt; ein automatischer Test stellt sicher, dass kein
Tier von einer Pflanze und keine Pflanze von einem Tier abstammt (`tests/evolution.test.js`).
Ein weiterer Test prüft, dass jede im Baum genannte Nahrung auch in der Ernährung der Simulation
vorkommt – was der Baum verspricht, tut die Simulation.

**Freischalten statt Zufall.** Neue Gruppen entstehen nicht mehr durch zufällige Artbildung.
Der Spieler entwickelt sie im Baum mit Evolutionspunkten (EP). Seit 14. 10. 2026 entsteht jede neue
Gruppe an **genau einem Ort** neben ihren Vorfahren (bis zu fünf benachbarte Felder, im größten
erreichbaren Lebensraum); von dort breitet sie sich selbst aus. Unterarten entstehen weiterhin von
selbst – seit 14. 10. 2026 acht Stufen je Tierklasse statt drei, mit Namen und Erstauftreten in
`src/species/` (siehe `docs/oekosystem-2026-10/bericht.md`).

**Für immer ausgestorben** (seit 20. 10. 2026, `src/stagefates.ts`, Bericht
`docs/aussterben-2026-10/bericht.md`). 37 Unterarten, deren Formen auf der Erde ausgestorben sind,
nennen eine spätere Unterart ihrer Gruppe als Nachfolger (`STAGE_SUCCESSORS`), etwa Urzellen →
Archaeen, Trilobiten und Seeskorpione → Zehnfußkrebse, Urwale bis Basilosaurier → Bartenwale. Halten
der Nachfolger und die Unterarten nach ihm zusammen 24 Felder (`STAGE_SUCCESSOR_TILES`), stirbt die
ältere für immer aus: Ihre Populationen gehen an den Nachfolger, der Aufstieg überspringt sie, neue
Populationen beginnen hinter ihr. Es entscheidet nur die Ausbreitung, kein Erddatum. Unterarten mit
heute lebenden Vertretern (Vasenamöben, Stummelfüßer, Kieferlose Fische …) bleiben. Zusammen mit den
Opfern des Kometen (`cometLost`) zeigen Lexikon, Unterarten-Leiste im Baum, Meldung und Chronik sie
grau unter einem R.I.P.-Band. Bei den Pflanzen sterben **Frühe Gefäßpflanzen** (Rivalen: Farne,
Bärlappe, Urbäume) und **Urbäume** (Rivalen: Samenpflanzen, Nadel- und Laubbäume) nach dem Muster der
Schuppenbäume aus (`FLORA_DISPLACEMENT` in `src/lycopsids.ts`): erst wenn alle Tochtergruppen im Baum
entstanden sind, dann neben ihren Rivalen zurückgedrängt, endgültig, sobald die Rivalen 10 % des
Landes führen (`FLORA_GONE_SHARE`). Ihre Baumkarte zeigt dann „Ausgestorben“ mit R.I.P., das Werkzeug
„Pflanzen“ lehnt sie ab. Erste Landpflanzen (ähnlich heutigen Lebermoosen) und der Knoten
„Samenpflanzen“ (Nadel- und Blütenpflanzen sind auch Samenpflanzen) bleiben.

**Die Natur wartet nicht ewig** (seit 12. 10. 2026, `src/spontaneous.ts`). Sind für einen Schritt alle
Bedingungen außer den EP-Kosten erfüllt, beginnt eine Uhr zu laufen. Nach einer Schonfrist von
240 Zeitschritten bekommt der Schritt eine sehr kleine Chance je Zeitschritt, ganz ohne EP von selbst
zu entstehen. Die Chance wächst, solange die Bedingungen erfüllt bleiben: Kumuliert liegt sie bei etwa
5 % nach 500, der Hälfte nach 2.000 und 94 % nach 4.000 weiteren Zeitschritten (Regler
„Evolutionstempo“ auf Standard). Fällt eine Bedingung weg, beginnt die Uhr von vorn. Der Zufall ist
ein Hash aus Planetensamen, Zeitschritt und Schritt; er verschiebt den übrigen Zufallsstrom der
Simulation nicht. Der Baum zeigt bei bereiten Schritten einen Hinweis; das Ereignis ist als
„Von selbst entstanden“ markiert.

**Evolutionspunkte** entstehen aus der Vielfalt: je Schritt 0,05 EP + 0,025 EP je lebender
entwickelter Gruppe, multipliziert mit dem Regler „Evolutionstempo“. Ohne Leben gibt es keine EP.

**Keine Sackgassen.** Stirbt eine Gruppe aus, meldet die Chronik das mit dem Hinweis, wie man sie
mit „Leben ansiedeln“ bzw. „Pflanzen“ wieder ansiedelt; abhängige Schritte zeigen
„… sind ausgestorben – neu ansiedeln“. Drei vollständige Testdurchläufe mit verschiedenen Strategien
(günstigste zuerst, Tiere zuerst, Pflanzen zuerst und teuerste zuerst) erreichen alle 31 Schritte; sie
wählen bei der Dinosaurier-Entscheidung ausdrücklich den Kometen (siehe unten). Einzige gewollte
Ausnahme: Nach dem Kometen kehren Dinosaurier nie zurück.

## Sauerstoff seit 16. 10. 2026

Erste Mikroben erzeugen noch keinen Sauerstoff. Cyanobakterien bleiben die fünfte Unterart der „Ersten Zellen“. Sobald sie auftreten und entdeckt werden, produziert ihre lebende Biomasse Sauerstoff, der zunächst ins Meer und über den Gasaustausch später auch in die Luft gelangt. Komplexe Zellen und wasseratmende Meerestiere brauchen gelösten Sauerstoff; Wale bleiben Luftatmer. Die Mindestwerte sind Spielbalance. Die Entstehung von Eukaryoten besitzt keine gesicherte universelle Sauerstoffschwelle. Die Einheiten und Vereinfachungen stehen im [Ökosystem-Bericht](../oekosystem-2026-10/bericht.md).

## Dinosaurier-Ära und Komet (seit 19. 10. 2026)

Eine **Spielregel**, kein Naturgesetz (`src/dinoera.ts`, `src/comet.ts`): Bis ein Komet die Zeit der
Dinosaurier beendet hat, entwickeln sich Säugetiere höchstens bis zur vierten Unterart, den
**Beuteltieren**; spätere Unterarten und ihre Spezialformen sowie die Schritte **Wale** und
**Huftiere & Weidetiere** bleiben gesperrt. Das gilt auch, wenn noch keine Dinosaurier entwickelt
sind, und für jeden Weg: Kauf im Baum, Entwicklung von selbst und „Leben ansiedeln“ (alle Wege laufen
über `LifeSystem.seed`). Der Baum nennt den Grund als eigene Bedingung („Spielregel: …“).

- **Vögel** entstehen nur bei einer **lebenden** Population der letzten Dinosaurier-Unterart, der
  **Vogelvorläufer** (Vorbild *Anchiornis*, ~160 Mio. J.). Eine Lexikon-Entdeckung allein genügt nicht.
  Gegründet wird neben dieser Population; die Dinosaurier leben weiter.
- **Die Entscheidung:** Sobald die ersten Vögel entstanden sind, hält das Spiel an (unabhängig von
  „Pause bei Meilensteinen“). Nach dem Vogelfilm fragt ein Dialog „Das Schicksal der Dinosaurier“ –
  ohne Vorauswahl, Zeitlimit, Escape oder Klick daneben. Danach läuft das Spiel im vorherigen Tempo
  weiter; ein pausiertes Spiel bleibt pausiert.
  - **„Dinos überleben“:** kein Komet, die Sperren bleiben für immer, keine spätere Frage.
    Dinosaurier können wie gewohnt neu angesiedelt werden.
  - **„Dinos sterben aus“:** ein Komet ohne EP- oder Ω-Kosten. Die Einschlagstelle ist ein 2 × 2-Block
    Land fern der Pole, bevorzugt im Inland und bei Dinosauriern, deterministisch je Planet. Alle
    Populationen von `Dinosaurier` sterben; die übrigen Gruppen verlieren 75 % ihres Bestands (± 10 %
    je Feld, nahe dem Krater bis 98 %). Jede Unterart jeder übrigen Tiergruppe behält eine **geschützte
    Population** auf dem Feld mit der meisten Nahrung außerhalb von 14 Feldern um den Krater: Sie fällt
    nicht unter die Dichte 0,1 – mindestens 60 Ticks lang, danach bis ihr Feld ihr wieder Raum zum
    Wachsen lässt, höchstens 600 Ticks (Schutz, keine Unsterblichkeit). Ohne Schutz gingen auf
    Probe-Planeten einzelne Gruppen noch Hunderte Ticks nach dem Einschlag verloren. Keine Gruppe
    entsteht neu. Danach entwickeln sich Säugetiere
    regulär weiter; Wale und Weidetiere werden erreichbar, entstehen aber nicht von selbst sofort.
    Dinosaurier können nie wieder entstehen oder angesiedelt werden; Lexikon und Chronik zeigen sie als
    „für immer ausgestorben“. Mit ihnen enden wie auf der Erde **Flugsaurier** (Reptilien, Unterart 5),
    **Ammoniten** und **Belemniten** (Weichtiere, 5 und 6) und **Zahnvögel** (Vögel, 3) für immer
    (`cometLost`): Ihre Populationen sterben, ihre Gruppen leben weiter und überspringen diese Stufen
    beim Aufstieg (Schildkröten → Krokodile). Lebte eine Gruppe nur auf solchen Stufen, fallen ihre
    Populationen eine Stufe zurück, statt zu sterben. Ein vorher gespeicherter Planet nach dem
    Einschlag verliert sie beim Laden. Eine Zivilisation intelligenter Dinosaurier zerfällt zu Ruinen, der
    Planet kehrt ins Zeitalter der Evolution zurück.
  - **Impaktwinter** (`src/cometwinter.ts`, seit 19. 10. 2026): Eis wächst in 10 Ticks von beiden Polen
    auf zwei Drittel der Oberfläche, bleibt 25 Ticks und zieht sich in 60 Ticks zurück. Der Eisrand
    folgt den Breitengraden mit Rauschen, Hochland friert zuerst. An Land legt die Sukzession Eis auf,
    auf dem Meer zeichnet die Karte Packeis. Bewusst übertrieben, damit man den Schaden sieht; die Erde
    fror damals nicht zu. Im Eisgebiet stirbt vom Einschlag bis zum Ende des Winters keine
    Pflanzengruppe ab; unter dem Eis hält sie sich mit der Deckung 0,02 und wächst nach dem Rückzug
    wieder. Der Boden bleibt erhalten (kein Abschliff wie unter dauerhaftem Eis). Geschützte
    Populationen liegen möglichst außerhalb des Eisgebiets; ihr Schutz endet frühestens mit dem Winter.
    Das Eis hebt die Albedo, die mittlere Temperatur sinkt dadurch von selbst.
  - **Infotafel** nach dem Einschlag („Der Einschlag und seine Folgen“): was er auf dem Planeten
    angerichtet hat, daneben die Folgen von Chicxulub auf der Erde (Prüfpunkt 21 im Quellenbericht).
    Sie ersetzt die Meilensteinkarten zu Einschlag und Aussterben, die in der Chronik bleiben.
- Ein gewöhnliches Aussterben der Dinosaurier öffnet keine Sperre.
- **Spielstände** (Format 9, `migrateV8`): Der Zustand der Entscheidung und das Ziel eines
  ausstehenden Kometen werden gespeichert; ein offener Dialog erscheint nach dem Laden erneut, ein
  ausstehender Einschlag läuft weiter und wirkt genau einmal; geschützte Populationen bleiben geschützt.
  **Bestandsschutz:** Ältere Planeten, auf
  denen Säugetiere schon über die Beuteltiere hinaus waren (lebend oder im Lexikon) oder Wale bzw.
  Weidetiere entwickelt sind, behalten ihre bisherige Freiheit; alle anderen folgen der neuen Regel,
  mit schon entstandenen Vögeln stellt sich die Frage sofort.

Gemessen mit `tools/comet-probe.js` (gieriges Spiel, Vögel nach rund 4.600–5.000 Ticks): Auf den Seeds
12345, 777 und 99 verlieren alle Gruppen beim Einschlag 75–78 % ihres Bestands. Mit dem Impaktwinter
(19. 10. 2026) liegen 63–68 % des Landes unter Eis; die mittlere Temperatur fällt von 14,7–15,6 °C auf
1,9–3,6 °C und ist nach 400 Ticks wieder bei 13,8–14,1 °C. Das Landeis (vorher 18–20 %) sinkt nach
800 Ticks auf 17–26 %, ein Schneeball-Planet entsteht nicht. In 400–800 Ticks geht keine Tier- oder
Pflanzengruppe verloren (Amphibien auf Seed 777 zwischenzeitlich auf 65 Feldern, danach wieder über
2.000), Säugetiere erreichen Unterart 8. Im Überlebens-Zweig (Seed 31337) bleiben sie bei Unterart 4.

Werkzeuge: `node tools/comet-probe.js [ticks] [seed …] [--survive]` spielt bis zur Frage, beantwortet
sie und verfolgt die Erholung; `tools/headless.js` und `tools/civ-probe.js` beantworten sie mit
`--dino=comet|survive`, die Vorschau mit `_preview.html?dino=comet|survive|show`. Die Simulation selbst
entscheidet nie.

## Vom Wasser zur lebendigen Landschaft

Die Reihenfolge, in der der Planet grün wird, ergibt sich aus den Lebensraumansprüchen der
Pflanzengruppen, nicht aus Skripten:

1. **Meer:** Erste Zellen (einschließlich Cyanobakterien) und Komplexe Zellen bilden das Plankton; Meeresalgen bilden Wiesen im
   lichtdurchfluteten Küstenmeer.
2. **Süßwasser:** Eine Grünalgen-Linie besiedelt Flussmündungen, Flüsse und Feuchtgebiete.
3. **Uferzonen:** Erste Landpflanzen brauchen offenes Wasser direkt nebenan (Küste, Flussufer,
   Feuchtgebiet) und einen Mindestgehalt an Sauerstoff (Ozonschicht). Sie wachsen nirgends sonst.
4. **Feuchte und sumpfige Lebensräume:** Moose (feuchte, auch kalte Standorte bis in die Tundra) und
   Bärlapppflanzen (warme Sümpfe, Schuppenbaum-Sumpfwälder).
5. **Flussläufe:** Frühe Gefäßpflanzen sind stark an Wasser gebunden und folgen den Flüssen
   ins Landesinnere; Farne erobern feuchte Gebiete abseits der Flüsse.
6. **Landesinneres:** Urbäume bilden die ersten Wälder; Samenpflanzen, Nadelbäume und später Gräser
   erreichen trockenere und kältere Regionen.

Technisch: Jedes Feld trägt eine Bitmaske der dort wachsenden Pflanzengruppen und einen
Bedeckungswert. Die Eignung einer Gruppe für ein Feld ist Temperatur × relative Feuchte ×
Wasserzugang × Höhenlage. Gruppen breiten sich in geeignete Nachbarfelder aus, selten auch weiter
(Sporen, Samen, später durch Vögel), und sterben dort ab, wo das Klima nicht mehr passt. Frühere
Gruppen werden meist nicht ersetzt – ein Feld kann viele Gruppen tragen, die Moose bleiben in Tundra und
Moor. Ausnahmen sind die Schuppenbäume, die Frühen Gefäßpflanzen und die Urbäume (siehe „Für immer
ausgestorben“ oben).

Seit 14. 10. 2026 trägt jedes Landfeld eine **Landschaft** (`src/landscape.ts`, `src/succession.ts`,
Spezifikation `docs/biomes-spec.md` Abschnitt 3): eine von 19 Sukzessionsstufen wie Fels, Flechten & Moos,
Farnflur, Steppe, Gebüsch, Wald oder Regenwald, dazu Untergrund (Fels, Sand, Erde, Moor) und
Bodenreife. Das Ziel eines Feldes ergibt sich aus geglättetem Klima (7 × 7 Felder) und den Pflanzengruppen,
die auf ihm oder auf mindestens 3 seiner 8 Nachbarn wachsen. Fehlt eine Gruppe, gilt die nächstniedrigere
Stufe derselben Kette: Offenland vor den Gräsern ist Farnflur, vor den Gefäßpflanzen Moos oder Flechten,
Holzpflanzen ohne Kräuter ergeben Gebüsch. Bewachsenes Land wird außer kurz nach einer Störung nicht als
nackter Fels gezeigt.
Die Landschaft wechselt stufenweise: mindestens 3 Ticks pro Stufe (in den Zeitskalen Zivilisation und
Technologie echte Jahre), pro Feld leicht gestreut, an Fronten schneller. Roden, Feuer, Lava, Vereisung und
Überflutung setzen sofort zurück; danach wächst das Land über die Stufen nach.

Das **Biom** (der Lebensraum der Tiere, weiterhin 11 Werte) wird aus der Landschaft abgeleitet und hängt
damit weiter davon ab, welche Pflanzen das Feld prägen: Wald, Regenwald und Nadelwald brauchen baumbildende
Gruppen (Nadelwald: Nadelbäume), kalte bemooste Ebenen werden zur Tundra, offenes Land heißt „Offenland“
(nicht „Grasland“, solange es keine Gräser gibt). Neu seit 14. 10. 2026: Regenwald beginnt bei 16 °C statt
21 °C, oberhalb der Baumgrenze liegt alpine Tundra statt Fels, und Kälte trägt schon ab mäßiger Feuchte
Nadelwald. Ein Breitenfaktor im Niederschlag (Regler „Klimazonen“) macht den Äquator feuchter und die
Subtropen (20–35°) und Pole trockener; das verschiebt, wo Pflanzen wachsen.

## Pflanzen und Tiere greifen ineinander

Die Tragfähigkeit eines Feldes für eine Tiergruppe ist Biom-Eignung × Temperatur × Sauerstoff ×
**Nahrung auf diesem Feld**: Plankton (meerweit), die Algenwiese des Feldes, die dort wachsenden
Pflanzengruppen oder die dort lebenden Beutetiere. Konkurrenz ist stark nur innerhalb gleicher
Lebensweisen (Gilden: Mikroben, Einzeller, Wirbellose und Wirbeltiere je Meer und Land).

Besondere Wechselwirkungen mit echter Spielwirkung:

- **Bestäuber:** Wo Bienen & Bestäuber leben, wachsen Blütenpflanzen, Laubbäume und fleischfressende
  Pflanzen 20 % dichter und breiten sich doppelt so schnell aus. Blütenpflanzen sind ohne Bestäuber
  entwickelbar – die ersten Blüten bestäubten Käfer, Fliegen und Thripse.
- **Fleischfressende Pflanzen** (im Original „Carnifern“) wachsen dichter, wo Insekten leben.
- **Vögel** verdoppeln die Fernverbreitung von Samenpflanzen, Nadelbäumen, Blütenpflanzen und Laubbäumen.
- **Kakteen** sind keine eigene Gruppe und kein Knoten, sondern die Wüstenform der Blütenpflanzen
  (`src/cacti.ts`). Sie erscheinen 95 Mio. Jahre nach den Blütenpflanzen, mit der Chronik-Meldung
  „In den Wüsten wachsen die ersten Kakteen.“ Ab dann wachsen Blütenpflanzen auf Wüsten- und
  Halbwüstenfeldern schon ab einer relativen Feuchte von 0,10 statt 0,26, mit höchstens halber Eignung.
  Das extrem trockene Wüsteninnere bleibt leer. In Wüstenklima machen die Kakteen aus Wüste Halbwüste,
  keine Farnflur.
- **Moose oder Farne** sind als Bodenbildner Voraussetzung für die Urbäume.

## Der Baum (aus den Spieldaten)

| Schritt | Reich | Abstammung | Lebensraum | Ökologische Voraussetzung | EP |
|---|---|---|---|---|---|
| Erste Zellen | Ursprung | – | Lichtdurchflutetes Küstenmeer | – | 0 |
| Komplexe Zellen | Ursprung | Erste Zellen (Endosymbiose) | Küstenmeer; gelöster O₂ ≥ 2 % der heutigen Sättigung | – | 10 |
| Meeresalgen | Pflanze | Komplexe Zellen (Chloroplasten) | Lichtdurchflutetes, nicht vereistes Küstenmeer | – | 15 |
| Süßwasser-Grünalgen | Pflanze | Meeresalgen (Grünalgen-Linie) | Flüsse, Flussmündungen und Feuchtgebiete | – | 25 |
| Erste Landpflanzen | Pflanze | Süßwasser-Grünalgen (Landgang) | Feuchte Uferzonen an Küsten und Flüssen; O₂ ≥ 2 % | – | 35 |
| Moose | Pflanze | Erste Landpflanzen | Feuchte Standorte – Sümpfe, Ufer, Tundra | – | 40 |
| Frühe Gefäßpflanzen | Pflanze | Erste Landpflanzen (Leitgewebe) | Flussufer, Auen und feuchte Ebenen | – | 50 |
| Bärlapppflanzen | Pflanze | Frühe Gefäßpflanzen (Bärlapp-Linie) | Warme Sümpfe und nasse Niederungen | – | 60 |
| Farne & Schachtelhalme | Pflanze | Frühe Gefäßpflanzen (Farn-Linie) | Feuchte, auch schattige Standorte | – | 60 |
| Urbäume | Pflanze | Frühe Gefäßpflanzen (Progymnospermen) | Feuchte Tiefländer | Boden: Moose / Farne & Schachtelhalme | 75 |
| Samenpflanzen | Pflanze | Urbäume | Auch trockenere Böden im Landesinneren | – | 85 |
| Nadelbäume | Pflanze | Samenpflanzen | Kühle, auch trockenere Regionen und Gebirge | – | 95 |
| Blütenpflanzen | Pflanze | Samenpflanzen (Bedecktsamer) | Zuerst feuchte Ufer und Unterholz, später fast überall | – | 110 |
| Laubbäume | Pflanze | Blütenpflanzen | Gemäßigte und tropische feuchte Regionen | – | 120 |
| Gräser | Pflanze | Blütenpflanzen | Offene, eher trockene Ebenen | – | 110 |
| Fleischfressende Pflanzen | Pflanze | Blütenpflanzen | Nährstoffarme Moore und Sümpfe | Nahrung: Insekten | 90 |
| Schwämme & Nesseltiere | Tier | Komplexe Zellen (Vielzeller) | Lichtdurchflutetes Küstenmeer; gelöster O₂ ≥ 19,1 % der heutigen Sättigung | Nahrung: Erste Zellen / Komplexe Zellen | 20 |
| Frühe Zweiseitentiere | Tier | Schwämme & Nesseltiere (Bilateria) | Meeresboden im Küstenmeer; gelöster O₂ ≥ 23,9 % der heutigen Sättigung | Nahrung: Erste Zellen / Komplexe Zellen / Meeresalgen | 25 |
| Gliederfüßer des Meeres | Tier | Frühe Zweiseitentiere | Meeresgrund im Küstenmeer; gelöster O₂ ≥ 28,6 % der heutigen Sättigung | Nahrung: Meeresalgen / Frühe Zweiseitentiere | 30 |
| Weichtiere | Tier | Frühe Zweiseitentiere | Algenreiches Küstenmeer; gelöster O₂ ≥ 38,1 % der heutigen Sättigung | Nahrung: Meeresalgen | 30 |
| Fische | Tier | Frühe Zweiseitentiere (über Chordatiere) | Küstenmeer und Hochsee; gelöster O₂ ≥ 47,7 % der heutigen Sättigung | Nahrung: Gliederfüßer des Meeres / Weichtiere / Frühe Zweiseitentiere | 45 |
| Landgliederfüßer | Tier | Gliederfüßer des Meeres (Landgang) | Bewachsenes Ufer in Küstennähe; O₂ ≥ 9 % | Nahrung: Erste Landpflanzen / Moose / Frühe Gefäßpflanzen | 45 |
| Insekten | Tier | Gliederfüßer des Meeres (krebsartige Vorfahren) | Land mit Gefäßpflanzen in Küstennähe; O₂ ≥ 11 % | Nahrung: Frühe Gefäßpflanzen / Farne & Schachtelhalme / Bärlapppflanzen | 60 |
| Bienen & Bestäuber | Tier | Insekten (Blüten-Spezialisten) | Offenes Land und Wälder mit Blüten; O₂ ≥ 13 % | Partner: Blütenpflanzen / Laubbäume | 100 |
| Amphibien | Tier | Fische (über Fleischflosser) | Sümpfe, Ufer und Feuchtgebiete; O₂ ≥ 12 % | Nahrung: Insekten / Landgliederfüßer | 70 |
| Reptilien | Tier | Amphibien (Amnioten · Sauropsiden) | Auch trockenes Land und Wüsten; O₂ ≥ 13 % | Nahrung: Insekten / Landgliederfüßer / Samenpflanzen | 85 |
| Säugetiere | Tier | Amphibien (Amnioten · Synapsiden) | Vielfältig – auch kalte Regionen; O₂ ≥ 15 % | Nahrung: Insekten / Landgliederfüßer / Samenpflanzen / Blütenpflanzen | 110 |
| Dinosaurier | Tier | Reptilien (Archosaurier) | Offenes Land und Wälder; O₂ ≥ 14 % | Nahrung: Farne & Schachtelhalme / Bärlapppflanzen / Samenpflanzen / Nadelbäume | 110 |
| Vögel | Tier | Dinosaurier (lebende Vogelvorläufer, Unterart 8) | Fast überall – auch Inseln; O₂ ≥ 15 % | Nahrung: Insekten / Bienen & Bestäuber / Samenpflanzen / Blütenpflanzen | 120 |
| Wale | Tier | Säugetiere (zurück ins Meer) | Hochsee nahe der Küsten mit Säugetieren; O₂ ≥ 13,5 % | Nahrung: Fische / Gliederfüßer des Meeres; Spielregel: erst nach dem Kometen | 130 |
| Huftiere & Weidetiere | Tier | Säugetiere | Grasland und offene Ebenen; O₂ ≥ 15 % | Nahrung: Gräser; Spielregel: erst nach dem Kometen | 130 |

Sauerstoffangaben sind Volumenprozent der Atmosphäre (wie in der Statusleiste). Die Schwelle eines
Tieres liegt einen Punkt über dem Wert, ab dem es überhaupt Tragfähigkeit hat.

## Korrekturen gegenüber dem Vorgänger

| Vorgänger (Version 4) | Jetzt | Grund |
|---|---|---|
| Fische aus Gliederfüßern oder Weichtieren | Fische aus frühen Zweiseitentieren (über Chordatiere) | Fische sind Chordatiere |
| Wale aus Fischen oder Säugetieren | Wale aus Säugetieren | Wale sind Paarhufer |
| Säugetiere aus Reptilien oder Trichordaten | Säugetiere aus frühen Vierfüßern über Amnioten/Synapsiden | Säugetiere sind Schwesterlinie der Reptilien |
| Carnifern (Pflanze) entsteht aus Insekten | Fleischfressende Pflanzen als Blütenpflanzen, brauchen Insekten als Beute | Tiere und Pflanzen sind getrennte Linien |
| Trichordaten (fiktiv) | Landgliederfüßer (Tausendfüßer, Spinnentiere) | naturorientierter Baum; alte Spielstände werden umgedeutet |
| Vegetation als ein einziges Feld, entsteht von selbst | 14 Pflanzengruppen mit eigenen Lebensräumen | getrennte Pflanzenentwicklung |
| Radiaten betrieben Photosynthese | Schwämme & Nesseltiere filtern Plankton | Tiere sind Verbraucher |

## Quellen

Die biologischen Annahmen wurden anhand von Fachliteratur geprüft; die vollständige Prüftabelle mit
58 Quellen (Nature, Science, PNAS, Current Biology, UCMP Berkeley u. a.) steht in
[quellenpruefung.md](quellenpruefung.md). Alle Kernaussagen zur Abstammung wurden bestätigt;
Formulierungen zu ersten Bäumen, Bestäubung früher Blüten, Säugetier-Abstammung, Moosen und
Fossilbeispielen wurden daraufhin präzisiert.

Der Baum zeigt spielerische Freischaltungen und ausgewählte Linien. Viele Spielgruppen (Algen,
Fische, Amphibien, Samenfarne) sind Entwicklungsstufen, keine geschlossenen Abstammungsgemeinschaften.
Die Reihenfolge Meer → Ufer → Sumpf → Fluss → Inland ist eine Spieldramaturgie, keine Aussage darüber,
wann Flüsse oder Sümpfe auf der Erde entstanden.
