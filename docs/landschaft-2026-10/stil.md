# Stil der Landschafts-Pixelkunst

Gilt für alle Rezepte in `tools/terrain/` (Bodentexturen, Objekte, Flüsse, Wasser-Overlays).

Ziel: Der Planet sieht aus wie aus einem Guss.
- Der Boden ist ruhig.
- Pflanzen sind Teil der Landschaft.
- Tiere (Vektor-Symbole mit Tintenkontur) heben sich auf jedem Untergrund ab.

Spezifikation: `docs/biomes-spec.md`. Verbindliche IDs: `tools/terrain/catalog.js`.

## Palette

- **Eine Quelle:** Es gibt eine einzige Palette, `tools/terrain/palette.js`, mit 75 Farben in Rampen von dunkel nach hell.
- **Namen:** `<rampe><stufe>`, Stufe 0 ist die dunkelste. Beispiele: `leaf2`, `sand4`, `red0`.
- **Keine freien Farben:** keine Hexwerte in Rezepten, keine Farben außerhalb der Palette, keine Halbtransparenz.
- **Neue Farbe:** Wer eine Farbe vermisst, schlägt sie vor. Ändern darf die Palette nur der Lead.
- **Rampen-Verschiebung:** Der Renderer schattiert, indem er einen Index entlang seiner Rampe verschiebt (Relief ±1–2, Schlagschatten −2, nasser Uferrand −1). Jede Fläche muss deshalb aus Rampenfarben bestehen, damit sie richtig dunkler oder heller werden kann.

| Rampe | Verwendung |
|---|---|
| `rock` | Fels, Geröll, Felsbrocken, Gipfel |
| `sand` | Sand, Wüste, Halbwüste |
| `soil` | Erde, Waldboden, Tundraboden |
| `laterite` | rote Tropenerde (Savanne, Regenwald) |
| `mud` | Schlamm, Moor |
| `straw` | trockenes Gras, Steppe, Savanne, Schilf |
| `meadow` | Wiese, junges Grün (gelbgrün) |
| `moss` | Moos, Flechten-Grün, Heide, Tundra (oliv) |
| `leaf` | Laub, Farne, Urbäume (mittelgrün) |
| `pine` | Nadelbäume, Schachtelhalme (dunkel-blaugrün) |
| `jungle` | Regenwald (satt) |
| `lichen` | blasse Flechtenkrusten |
| `ice` | Eis, Schnee, Meereis |
| `water` | Wassertiefe, 8 Stufen (Rippel, Flüsse, Schaum) |
| `bark` | Stämme, Äste |
| `blossom`, `yellow`, `white`, `red`, `orange`, `violet` | Akzente: Blüten, Sonnentau, Gelbflechte, Heide |
| `mask` | reserviert für Randmasken |

## Licht und Perspektive

- **Licht kommt von oben links.** Hell ist oben links, dunkel ist unten rechts. Das gilt für Boden, Objekte und Relief.
- **Ansicht:** Top-down-3/4 wie in Zelda: A Link to the Past oder Stardew Valley.
  - Bodentexturen sind flach von oben gesehen.
  - Erhöhte Objekte (Bäume, Büsche, Kakteen, Felsbrocken) zeigen ihre Vorderseite und etwas Oberseite.
- **Schatten:** Den Schlagschatten zeichnet der Renderer, nicht das Sprite.

## Bodentexturen

- **Format:** nahtlos, quadratisch, Größe laut Katalog (64 oder 128).
  - Eine Kachel zeigt den 16 × 16-Ausschnitt an ihrer Weltposition.
  - Die Textur muss also in sich und über ihre Ränder hinweg ohne sichtbare Naht und ohne auffälliges Wiederholungsmuster wirken.
  - Periodisches Rauschen aus `kit.noise`/`kit.fbm` ist nahtlos per Konstruktion. Gestempelte Muster setzt `Tex.set` mit Umlauf.
- **Ruhig:**
  - 3–4 Grundfarben, höchstens 9 Farben inklusive Akzente und Lichtkanten (der Generator prüft das).
  - Geringe Helligkeitsspanne innerhalb einer Fläche.
  - Keine harten Kontraste, die mit Tieren konkurrieren.
- **Pixel-Regeln:**
  - Formen mindestens 2 px groß, kein Einzelpixel-Rauschen.
  - Dithering nur geordnet.
  - Deckend (keine transparenten Pixel).
- **Dichtestufen** (spärlich, mittel, dicht) sind eigene Texturen desselben Materials. Sie unterscheiden sich im Bedeckungsgrad, nicht im Farbcharakter. Die dichte Stufe zeichnet sich über die spärliche, also müssen sie zueinander passen.
- **Untergrund bleibt erkennbar:** Flechten auf Fels zeigen grauen Stein mit Krusten, Moosteppich zeigt Erde mit Polstern, Halbwüste auf Sand ist hell und körnig, auf Fels steinig.
- **Waldböden** sind vor allem zwischen den Bäumen zu sehen: dunkel, mit Streu, Moos und Farnflecken.
- **Strand** (`beach`) ist ruhiger, heller Sand (sand3/sand4) mit feinen Windrippeln und seltenen Muscheln, ohne Dünenbänder wie die Wüste. Pixel (0,0) ist sand3, die Farbe der Fernansicht.
- **Savanne** ist Grasland von Rand zu Rand: goldgelbes bis olivgrünes Gras mit Büscheln, kein offener roter Boden. Die spärliche Stufe ist trockener, mit dunkleren Trockenstellen im Gras, die dichte grüner und dichter mit Büscheln.

## Objekte

- **Boxen:**
  - Bäume: Größe s 10 × 13, m 13 × 17, l 16 × 20, je 2 Formen (Index = Größe × 2 + Form).
  - Büsche und Kleinpflanzen: höchstens 16 × 16, 3 Varianten.
  - Kakteen: höchstens 16 × 20, 3 Varianten (jung, alt, alt mit Blüten).
  - Felsen: höchstens 16 × 16, 2–3 Varianten.
- **Fuß:** Das Objekt steht auf seiner **letzten Zeile**, unten mittig verankert. Bäume ragen höchstens 4 px in die Kachel darüber.
- **Selektive Kontur:**
  - Der Umriss besteht aus dem dunkelsten Ton der eigenen Rampe, unten rechts dunkler, oben links eine Stufe heller.
  - **Keine Tinte und kein Schwarz.** Tintenkonturen sind den Tieren vorbehalten.
- **Schattierung:** 3 Töne der Rampe (Licht, Mitte, Schatten), dazu `bark` für Stämme.
- **Form vor Farbe:** Jede Gruppe ist an ihrer Silhouette erkennbar, auf der Karte in 16 px und im Untersuchen-Fenster in 4–6× Vergrößerung.
- **Größenvarianten** sind dieselbe Art in jünger und älter, keine anderen Arten. Am Waldrand zeigt der Renderer kleine Größen.

### Erkennungsmerkmale pro Pflanzengruppe

| Objekt | Gruppe | Merkmal |
|---|---|---|
| Schuppenbaum | Bärlapp | hoher, schlanker Stamm mit Rautenmuster, kleine gegabelte Krone oben (Lepidodendron) |
| Urbaum | Urbäume | kegelförmig, waagrechte, farnartige Astetagen (Archaeopteris) |
| Palmfarn | Samenpflanzen | dicker, kurzer Stamm, Wedelkrone wie eine Palme |
| Samenfarn-Busch | Samenpflanzen | buschige, gefiederte Wedel ohne Stamm |
| Fichte | Nadelbäume | spitzer Kegel mit gezackten Etagen, dunkel-blaugrün |
| Sumpfzypresse | Nadelbäume | schmale Säule, verbreiterter Stammfuß, im Wasser stehend |
| Wacholder | Nadelbäume | niedriger, dunkler Kegelbusch |
| Laubbaum | Laubbäume | runde, gewölbte Krone, mittelgrün, sichtbarer Stamm |
| Tropenriese | Laubbäume | breite, flache Schirmkuppel, Brettwurzeln |
| Schirmbaum | Laubbäume, auch Savannenbaum der Blütenpflanzen | flache Schirmkrone auf dünnem, schrägem Stamm (Akazie) |
| Affenbrotbaum | Blütenpflanzen (Savannenbaum, selten) | grauer Flaschenstamm, kurze Äste, flache Krone aus Blattbüscheln; Form 2 lichter, mit weißen Blüten |
| Kokospalme | Blütenpflanzen (am Strand) | schlanker, gebogener, geringelter Stamm (Form 1 nach links, Form 2 nach rechts), Krone aus hängenden, gefiederten Wedeln, kleine Traube Kokosnüsse darunter; anders als der Palmfarn hoch und dünn |
| Laubstrauch, Dornbusch | Laubbäume | runder Busch; Dornbusch sparrig und olivgrau |
| Blumen, Blütenstrauch | Blütenpflanzen | farbige Blüten-Tupfer (2 px) |
| Heide | Blütenpflanzen | niedrige Polster, violette Tupfer |
| Säulenkaktus | Blütenpflanzen (Wüste) | gerippte Oliv-Säule mit abgewinkelten Armen, weiße Blüten an den Spitzen |
| Kugelkaktus | Blütenpflanzen (Wüste) | gerippte grüne Kugel, unten dunkler, Kranz gelber Blüten |
| Feigenkaktus | Blütenpflanzen (Wüste) | bereifte, blaugrüne ovale Glieder, rote Früchte oder gelbe Blüten am Rand |
| Farnwedel | Farne | gebogene, gefiederte Wedel |
| Schachtelhalm | Farne | aufrechte gegliederte Stängel mit Quirlen |
| Baumfarn | Farne | kleiner Stamm mit Wedelkrone, buschhoch |
| Urfarn-Stängel | Frühe Gefäßpflanzen | blattlose, gegabelte Stängel mit gelben Sporenkapseln (Rhynia, Cooksonia) |
| Lebermoos-Polster | Erste Landpflanzen | flache, gelappte Thalli dicht am Boden |
| Moospolster | Moose | runde, weiche Polster, oliv-gelbgrün |
| Grasbüschel, Hochgras | Gräser | Halme; Hochgras höher und strohgelb |
| Schilf | Gräser | hohe Halme mit braunen Rispen |
| Sonnentau | Fleischfressende Pflanzen | kleine Rosette mit roten Tentakel-Tupfern |
| Tang | Meeresalgen | wellige Stränge, im Wasser stehend |
| Algenfilm (Overlay) | Süßwasser-Grünalgen | grüne Schlieren auf Fluss- und Moorwasser |

### Fachliche Leitplanken

Bei Zweifeln gilt `docs/ueberarbeitung-2026-10/quellenpruefung.md`.

- **Kakteen** sind Blütenpflanzen, aber keine eigene Gruppe: Sie sind deren Form auf Wüsten- und Halbwüstenfeldern und erscheinen erst 95 Mio. Jahre nach ihnen (`src/cacti.ts`). Vorher zeigen diese Felder keine Blütenpflanzen-Objekte, die Halbwüste also Samenpflanzen-Büsche und Gräser.
- **Palmen** sind ebenso keine eigene Gruppe: Die Kokospalme ist die Form der Blütenpflanzen am Strand (`src/beaches.ts`).
- **Savannenbäume** sind ebenso keine eigene Gruppe: Sie sind die Form der Blütenpflanzen auf Savannenfeldern, sobald es Laubbäume gibt (`src/savannatrees.ts`), meist ein Schirmbaum, etwa jeder achte ein Affenbrotbaum.
- **Schilf** ist ein Gras, **Sumpfzypresse** ein Nadelbaum, **Schirmbaum** und Tropenriese sind Laubbäume (Bedecktsamer).
- **Offenland vor den Gräsern** ist Farnflur, keine Wiese.

## Was der Renderer selbst hinzufügt (nicht zeichnen!)

- Ausgefranste Übergänge zwischen Materialien (gemeinsame Randmasken, nach Rang)
- Schaumlinie auf der Wasserseite, nasser Rand auf der Landseite
- Relief-Schattierung und großräumige Helligkeitsvariation als Rampen-Verschiebung
- Schlagschatten unter Objekten, Ausdünnen und Verkleinern am Waldrand, Versatz der Objekte

## Arbeitsablauf für Asset-Agenten

1. **Datei:** Ausschließlich die eigene Familien-Datei ändern: `cold.js`, `temperate.js`, `warm.js`, `wet.js`, `mountain.js` oder `coast.js`. `catalog.js`, `palette.js`, `kit.js` und `masks.js` sind fest. Eigene Hilfsfunktionen gehören lokal in die Familien-Datei.
2. **Eigene Familie prüfen:** `node tools/terrain-atlas.js --family <familie> --sheet <ordner>` erzeugt die Kontaktblätter `materials.png`, `objects.png` und `objects-light.png`.
3. **Im Zusammenspiel prüfen:** `node tools/terrain-atlas.js --check --sheet <ordner> --part transitions,scenes,rivers` zeigt Übergänge, Szenen und Flüsse mit allen Familien.
4. **Ziel:** 0 `PROBLEM`-Zeilen. Kontaktblätter landen im eigenen Scratchpad oder im OS-Temp-Ordner, nicht im Repo.
5. **Nie `--write`.** Atlas und `src/terrainatlas.ts` erzeugt nur der Lead beim Zusammenführen.
6. **Determinismus:** Zufall nur über `k.hash`/`k.noise` mit festen Seeds, nie `Math.random` oder `Date`.
