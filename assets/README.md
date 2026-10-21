# Grafiken (SVG)

Alle Grafiken werden per `<img src="assets/…">` eingebunden (funktioniert auch direkt über `file://`). Die Kachelkarte selbst
bleibt Pixelkunst (`src/sprites.ts`) – so behält die Spielwelt den Look des Originals, während
Menüs, Baum und Ereignisse eine moderne Bildsprache bekommen. Seit Oktober 2026 nutzt die Pixelkunst eine
abgestimmte Naturpalette statt reiner EGA-Farben (siehe `docs/grafik-2026-10/bericht.md`).

| Ordner | Inhalt | Format | Verwendung |
|---|---|---|---|
| `evolution/` | 31 Knoten des Evolutionsbaums, Dateiname = Knoten-ID (`fish.svg`, `mosses.svg` …) | 64 × 64, Badge | Baumknoten, Detailansicht, Ereigniskarten, Meilensteine, Werkzeugpaletten, Chronik |
| `ui/` | Menüs, Werkzeuge, Steuerung, Kartenebenen/-modi, Terraformer, Baum-Legende; Modell-Regler (`model-*`, `energy-*`, `alloc-*`) und Wolken-Ebene | 24 × 24, Linie | Kopfleiste, Menüs, Dock, Fenster, Buttons, Modellregler, Glossar |
| `resources/` | Energie (Ω), Evolutionspunkte, Sauerstoff, CO₂, Temperatur, Pflanzendecke, Vielfalt, Bevölkerung | 24 × 24, gefüllt | Statusleiste, Bericht, Diagramme |
| `habitats/` | 11 Biome + 9 Lebensraum-Bedingungen (Ufer, Süßwasser, Feuchtgebiet …) | 32 × 32, Badge | Baumknoten, Detailansicht, Untersuchen, Diagramme |
| `events/` | 8 Katastrophen, Meilensteine und Hinweise (Leben, Intelligenz, Zeitalter, Ausgestorben, Fehler …) | 48 × 48, Badge | Ereignis-Palette, Chronik, Hinweise, Dialoge |
| `title/` | Pixelkunst des Titelbildschirms: Satellit, zwei Monde, drei Asteroiden. SVG aus einzelnen Pixeln (eine Fläche je Farbe, `shape-rendering="crispEdges"`), Licht von oben links | Raster 9–31 px | Titelbildschirm (`src/titledecor.ts`) |
| `fonts/` | **Ausnahme, woff2:** Pixelify Sans und JetBrains Mono, Latin-Teilmenge, mit Lizenz (`OFL-*.txt`, SIL Open Font License) | – | nur Titelbildschirm (`css/fonts.css`) |
| `terrain/` | **Ausnahme, PNG:** Landschafts-Pixelkunst der Karte (Böden, Übergangsmasken, Pflanzen-Objekte, Wasser-Overlays) als ein Atlas `atlas.png` mit `manifest.json`. **Generiert** von `tools/terrain-atlas.js --write` aus den Rezepten in `tools/terrain/`, nie von Hand bearbeiten. Stil: `docs/landschaft-2026-10/stil.md` | 16 × 16 je Kachel | Karte (`src/land*.ts`), Untersuchen-Fenster |
| `civ/` | **Ausnahme, PNG:** Stadt-Pixelkunst (Gebäude-Bausteine je Zeitalter, Höfe, Brücken, Volkswimpel) als Atlas `atlas.png`, in der Palette der Landschaft. **Generiert** von `tools/civ-atlas.js --write` aus den Rezepten in `tools/civ/`, nie von Hand bearbeiten. Stil wie `terrain/`; Spec: `docs/zivilisation-spec.md` §3 | bis 16 × 20 je Baustein | Stadtebene der Karte (`src/citylayer.ts`) |

## Bildsprache

- **Farben:** Ursprung/Einzeller teal (`#5ccfd0`), Pflanzen moosgrün (`#8ad16f`), Tiere bernstein
  (`#f2a35c`), Wasser `#4cb6d6`, Energie sonnengold (`#f6c453`), Evolutionspunkte violett (`#b48cff`),
  Warnung `#ff7a6b`. Motive in Creme `#f6f1df`, Konturen `#0c1a14`.
- **Badges:** abgerundetes Quadrat mit Verlauf der Kategoriefarbe und feiner heller Innenkante;
  Licht von oben links.
- **Lebensraum-Streifen** am unteren Rand der Evolutions-Badges: Wellen (Meer), Rippeln (Süßwasser),
  Welle + Boden (Ufer), Bodenlinie mit Halmen (Land), Wasser + Schilf (Sumpf/Moor). So ist der
  Lebensraum einer Gruppe schon am Symbol zu erkennen.
- **Linien-Icons** der Oberfläche: Strich `#e9f1ec`, 1,8 px, runde Enden, höchstens ein Farbakzent.
- **Untersuchen:** `ui/habitat-good`, `habitat-medium`, `habitat-bad` und `habitat-no` zeigen lachendes, neutrales und weinendes Gesicht beziehungsweise ein rotes X. Die Form unterscheidet die vier Bewertungen auch ohne Farbe; `ui/wind-arrow` zeigt die Windrichtung.
- **Größen:** lesbar ab 20 px (Evolution, Ereignisse), 16 px (Ressourcen, Linien-Icons) und 18 px (Lebensräume);
  geprüft auf dunklem, mittlerem und hellem Hintergrund.
- IDs innerhalb einer Datei tragen den Dateinamen als Präfix; jede Datei hat einen deutschen `<title>`.

Neue Grafiken bitte in denselben Ordner und Stil einfügen und im Code über die Helfer
`evoIcon`, `uiIcon`, `resIcon`, `habitatAsset` und `eventIcon` (`src/ui.ts`, `src/evolution.ts`) einbinden.
