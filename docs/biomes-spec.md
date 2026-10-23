# Spezifikation: Biome & Vegetation als Pixel-Landschaft

Stand: 14. 10. 2026 · **freigegeben** mit den Festlegungen in Abschnitt 6. Wo ein Abschnitt davon abweicht, gilt Abschnitt 6.

Ziel: Der Planet soll aus einem Guss wirken. Große zusammenhängende Klimazonen, nahtlose Flächen,
weiche Übergänge. Die Vegetation ist Teil des Bodens und entwickelt sich mit Klima, Evolution und Zeit.
Tiere (Vektor-Symbole) bleiben unverändert und müssen auf jedem Untergrund lesbar bleiben.

---

## 1. Ist-Zustand

### 1.1 Datenmodell (pro Kachel, Raster 256 × 128, X läuft um)

| Feld | Typ | Bedeutung | Quelle |
|---|---|---|---|
| `elevation` | Float32 −1..1 | Höhe; 1,0 = 4,5 km; < 0 = Wasser | `world.ts` |
| `temperature` | Float32 °C | Jahresmittel, mit Höhengradient 6,5 °C/km | `climate.ts` |
| `moisture` | Float32 0..1 | Luftfeuchte/Niederschlag; Wind trägt sie vom Meer landeinwärts, Hänge regnen aus | `climate.ts` |
| `vegetation` | Float32 0..1 | Pflanzendecke (auf Wasser: Algendichte) | `flora.ts` |
| `flora` | Uint16-Bitmaske | welche der 14 Pflanzengruppen hier wachsen | `flora.ts` |
| `floraTop` | Uint8 | prägende Gruppe der Kachel | `flora.ts` |
| `biome` | Uint8 (11 Werte) | Lebensraum; wird **jeden Tick zustandslos neu berechnet** | `biome.ts` |
| `riverLevel`, `riparian` | Float32 | Flüsse und Ufer-Feuchte (abgeleitet, nicht gespeichert) | `river.ts` |

- **Zustand:** Die Biome haben keinen eigenen Zustand, keine Haltezeit und keine Glättung. Einen Untergrund (Fels, Sand, Erde) gibt es im Modell nicht.
- **Plattendrift:** `geo.ts` verschiebt bei Kontinentaldrift ganze Zeilen der Kachel-Arrays. Neue Zustandsfelder müssen dort mitwandern.
- **Wer `biome` liest:**
  - Tier-Eignung: `LIFE[c].suit[biome]`, eine Tabelle mit 11 Spalten je Klasse
  - Albedo (Eis-Albedo-Rückkopplung), Städte (`civ.ts`), Spielstand (Format 6, `save.ts`)
  - Spezialisten-Bilder (`artvariants.ts`), Legende, Untersuchen-Fenster und Tests

### 1.2 Biom-Klassifikation heute (`BiomeSystem.classify`)

- **Reihenfolge der Regeln:**
  1. Wasser: Küste oder Hochsee nach Tiefe, Meereis unter −5 °C
  2. Land unter −12 °C: Eis; Höhe > 0,5: Fels
  3. Pflanzendecke < 0,12: Wüste, wenn die Feuchte < 0,16 ist, sonst Fels
  4. Feuchtgebiet (Feuchte ≥ 0,70 und Höhe < 0,14): Sumpf
  5. Danach Temperaturbänder (< 4 / < 14 / ≥ 21 °C) × Feuchte (0,16 / 0,18 / 0,22 / 0,38 / 0,42 / 0,50) × „holzige Gruppe prägt die Kachel“
- **Folge:** Harte Schwellen auf verrauschten Eingangswerten. Jede Kachel kippt einzeln.

### 1.3 Darstellung heute (`render.ts`, `tilecache.ts`, `terrainart.ts`, `artvariants.ts`)

- **Boden:** pro Kachel ein 8 × 8-Zeichensprite, 2× vergrößert, 4 gespiegelte Varianten. Darüber eine Hangschattierung pro Kachel als Lichtwaschung (Licht von Nordwest).
- **Pflanzen:** Ein Vektor-Symbol der prägenden Gruppe liegt auf **jeder** Kachel mit Pflanzendecke ≥ 0,05, spärlich oder dicht. Dazu kommen Biom-Spezialisten (Kaktus usw.) auf 40–85 % der Kacheln.
- **Wasser und Flüsse:** Wasser ist nach Tiefe eingefärbt, Brandungsstrich pro Kachelseite. Flüsse sind 8 × 8-Sprites mit Verbindungsmaske.
- **Tiere:** Vektor-Symbole mit Tintenkontur und Schatten, eigene Ebene über dem Kartenbild (`herds.ts`).
- **Zoom:** stufenlos 10–48 CSS-px pro Kachel. Das Basisbild wird höchstens 4× pro Sekunde neu gezeichnet, beim Verschieben wird es geschoben.

### 1.4 Fehlerbild (Screenshot vom 14. 10. 2026, späte Erdgeschichte)

| Beobachtung | Ursache im Code |
|---|---|
| Symbol-Tapete: Auf fast jeder Landkachel klebt ein Pflanzensymbol | Pflanzensymbol ab Decke 0,05, auf 57–71 % aller Landkacheln (gemessen) |
| Tiere gehen unter | Pflanzen- und Tiersymbole sind gleich groß, gleich bunt und haben gleich starke Konturen |
| Treppenkanten zwischen Sand, Wiese, Fels, Wald und Schnee | Boden pro Kachel, keine Übergänge |
| Graue Felsinseln mitten im Grünland | Pflanzendecke < 0,12 ergibt „Fels“ auf Einzelkacheln; Lebensraum flackert mit der Decke |
| Wald ist ein dunkles Quadrat mit Einzelbäumen | ein Baum-Symbol pro Kachel, kein Kronendach, kein Waldrand |
| Harte Küstenlinie | Brandung als gerade Linie entlang der Kachelseite |

### 1.5 Messwerte (Headless, gieriger Baum, Seeds 12345 und 777)

Gemessen mit einem Probe-Skript, das in Phase 1 als `tools/headless.js --biomes` übernommen wird.
„Grenzkanten“ ist der Anteil der Land-Nachbarpaare mit verschiedenem Biom.
„Kleinstregionen“ sind zusammenhängende Biomflächen mit höchstens 3 Kacheln.

| Weltalter | Grenzkanten | Regionen (davon ≤ 3 Kacheln) | flächengew. Regiongröße | Kacheln mit Pflanzensymbol |
|---|---|---|---|---|
| vor 522 Mio. J. | 4,5 / 5,3 % | 82 (26) / 109 (47) | 6519 / 4864 | 0 % |
| vor 310 Mio. J. | 11,1 / 13,1 % | 219 (92) / 303 (134) | 2663 / 1469 | 19 / 24 % |
| vor 171 Mio. J. | 15,0 / 20,0 % | 360 (157) / 667 (370) | 612 / 356 | 35 / 49 % |
| vor 21 Mio. J. | 20,0 / 18,4 % | 687 (399) / 662 (397) | 432 / 751 | 57 / 71 % |

**Breitenzonierung fehlt (vor 21 Mio. J.):**

| Befund | Messwert |
|---|---|
| Äquator ±15°, Landanteile | Offenland 35–43 %, Wüste 26–29 % bzw. Fels 17 %; Regenwald gesamt nur 2–3 % |
| Temperaturen am Äquator | Meer 27–28 °C (erdähnlich), Land nur 15–17 °C |
| Ursache der kalten Tropen | Land liegt hoch: mittlere Höhe am Äquator 0,24–0,26 ≈ 1,1–1,2 km, in mittleren Breiten bis 0,34 (Erde: ca. 0,8 km); auf Meereshöhe gerechnet wären es 23–24 °C |
| Regenwald-Regel | verlangt ≥ 21 °C und wird darum kaum erreicht |
| Feuchte nach Breite | ohne Struktur: Die Subtropen (20–35°) sind nicht trockener als der Äquator. Das Feuchtemodell kennt Windtransport und Steigungsregen, aber keine Hadley-Zirkulation |
| Eis | 22–34 % des Landes |
| Pflanzengruppen in den Tropen | Gräser auf 75–100 % der Kacheln; Laubbäume fast nirgends (0–9 %), obwohl entwickelt |

---

## 2. Recherche (kurz)

- **Whittaker-Diagramm:** Biome ordnen sich nach Jahresmitteltemperatur und Jahresniederschlag.
  - Die Ecken: Regenwald warm und nass, subtropische Wüste warm und trocken, Tundra kalt und trocken.
  - Savanne statt Wald entsteht bei ausgeprägter Trockenzeit. Unser Modell kennt keine Jahreszeiten, deshalb steht „warm + mäßig feucht + Gräser“ für Savanne.
  - Die Grenzen sind fließend. Das spricht für Hysterese statt harter Schwellen.
- **Breitenzonen (Walter-Zonobiome, Zirkulationszellen):**

  | Breite | Klima | Biom |
  |---|---|---|
  | Äquator | immerfeucht (aufsteigende Luft) | Regenwald |
  | ca. 20–35° | absinkende, trockene Luft | Wüste und Halbwüste, an den Rändern Savanne und Steppe |
  | mittlere Breiten | Westwinde, feucht | Laub- und Mischwald, im Inneren Steppe |
  | hohe Breiten | kalt | Nadelwald, dann Tundra |
  | Pole | sehr kalt | Eis |

  Höhenstufen spiegeln diese Abfolge im Kleinen (Baumgrenze, Matten, Fels, Schnee).
- **Sukzession:**
  - Primär auf nacktem Fels: Flechten und Moose als Pioniere, dann dünner Boden. Darauf folgen Kräuter und Gräser, dann Sträucher, Pionierbäume und am Ende Klimaxwald, dessen Art vom Klima abhängt.
  - Dauer: Jahrhunderte bis Jahrtausende.
  - Sekundär auf vorhandenem Boden (nach Feuer oder Rodung) geht es deutlich schneller.
- **Bedeutung für SimEarth 2.0:**
  - Ein Tick dauert im Phanerozoikum 125 000–150 000 Jahre. Sukzession selbst ist also kürzer als ein Tick.
  - Sichtbar wird die Abfolge im Spiel durch drei Dinge:
    - die **Evolution**: Moose um 410 Mio., Gefäßpflanzen um 430 Mio., Bäume um 385 Mio., Nadelbäume um 300 Mio., Laubbäume um 100 Mio., Gräser um 20 Mio. Jahre;
    - **Ausbreitungsfronten**;
    - **Störungen**: Rodung, Vulkan, Meteor, Vereisung.
  - Die Haltezeiten (Abschnitt 3.6) verhindern Flackern und machen jede Stufe einige Ticks lang sichtbar.
  - In den Zeitskalen „Zivilisation“ und „Technologie“ (100 bzw. 10 Jahre pro Tick) laufen sie in echten Jahren.
- **Erdgeschichte als Leitplanke:**
  - Ordovizium und Silur: Moos- und Flechtenkrusten
  - Devon: Wurzeln bilden erstmals tiefe Böden
  - Karbon: Bärlapp-Sumpfwälder
  - Kreide: offenes Land war Farnflur, noch kein Grasland
  - Miozän: Grasland breitet sich aus
  - Kakteen sind späte Blütenpflanzen. Darum heißt offenes Land vor den Gräsern **Farnflur** und nicht Wiese.
- **Original-SimEarth (Handbuch 1990, S. 65 f.):** Fels bedeutet dort „kein Biom“. Biome brauchen CO₂ und Regen, Höhe und CO₂ verschieben die Präferenzen. Die Präferenztabelle:

  | | trocken < 30 cm | mäßig 30–90 cm | nass > 90 cm |
  |---|---|---|---|
  | kalt < 0 °C | Arktis | Nadelwald | Nadelwald |
  | gemäßigt 0–25 °C | Wüste | Grasland | Wald |
  | heiß > 25 °C | Wüste | Sumpf | Dschungel |

  Unsere 11 Lebensräume sind diese 8 plus Tundra, Küste und Hochsee. Die neue Landschaftsebene verfeinert sie, ohne sie zu ersetzen.
- **Technik:**
  - **Dual-Grid:** Die Darstellung wird um eine halbe Kachel versetzt, jede Darstellungszelle liest ihre 4 Eckkacheln. Das ergibt 16 Fälle wie bei Marching Squares.
  - **Rangfolge statt Paarkacheln:** Gegen die kombinatorische Explosion bei vielen Terrains zeichnet jedes Material nur seine eigene Maske über die tieferen. So braucht es 16 Masken statt einer Übergangskachel pro Biompaar.
  - **Top-down-3/4 (ALttP, Stardew Valley):** flacher Boden, erhöhte Objekte mit Vorderseite, unten verankert, Zeichnen zeilenweise von oben nach unten.

---

## 3. Simulation (Phase 1)

### 3.1 Zwei Ebenen

- **Lebensraum (`Biome`, 11 Werte, IDs unverändert):**
  - Daran hängen Tier-Eignung, Albedo, Städte, Spezialisten, Legende und Speicherstände.
  - Er wird künftig aus der Landschaft **abgeleitet** (Tabelle 3.3) und erbt dadurch Kohärenz und Hysterese.
  - Die Tier-Balance bleibt im Wesentlichen erhalten.
- **Landschaft (`Landscape`, neu, 19 Werte, gespeichert):**
  - Das ist die Sukzessionsstufe der Kachel. Sie bestimmt, was gezeichnet wird.
  - Dazu kommen der Untergrund und die Dichtestufe.
  - Spielerinnen und Spieler sehen sie im Untersuchen-Fenster, z. B. „Wiese (dicht) auf Erde“.
- **Gleiche Einstiegspunkte:** `BiomeSystem.step(world)` bleibt der Aufruf in `app.ts`, `world.ts`, `tests/helpers.js` und `tools/headless.js`. Intern ruft es das neue `LandscapeSystem` auf.

### 3.2 Untergrund

**Neues Feld `soil` (Bodenreife 0..1, gespeichert):**

| Vorgang | Wirkung |
|---|---|
| Aufbau mit Moose/Erste Landpflanzen allein | langsam, höchstens bis 0,35 (Rohboden-Kruste) |
| Aufbau mit Gefäßpflanzen und höher (Wurzeln) | bis 1 |
| Abbau | ohne Bewuchs langsam durch Erosion (am Hang schneller) |
| Vereisung | schürft den Boden ab |
| Lava, Meteor | setzen den Boden auf 0 |

Die Raten sind Tuning-Werte in `params.ts` bzw. `constants.ts`.

**Untergrund (abgeleitet, Prüfreihenfolge):**

| Untergrund | Bedingung |
|---|---|
| **Moor** | Feuchtgebiet (Feuchte ≥ 0,70, Höhe < 0,14) |
| **Erde** | Boden ≥ 0,35 |
| **Sand** | trocken (Feuchte < 0,24) und tief gelegen (Höhe < 0,15) |
| **Fels** | alles andere: Höhenlagen, Hänge, junger Boden |

Eis und Schnee sind Decken, kein Untergrund.

### 3.3 Landschaften

Abkürzungen der Pflanzengruppen:

| Kürzel | Gruppe |
|---|---|
| LP | Erste Landpflanzen |
| Mo | Moose |
| GP | Frühe Gefäßpflanzen |
| Bä | Bärlapp |
| Fa | Farne |
| Ur | Urbäume |
| Sa | Samenpflanzen |
| Na | Nadelbäume |
| Bl | Blütenpflanzen |
| Lb | Laubbäume |
| Gr | Gräser |
| Fl | Fleischfressende Pflanzen |
| holzig | Bä, Ur, Sa, Na oder Lb |

„Vorhanden“ heißt: Die Gruppe wächst auf der Kachel oder auf mindestens 3 ihrer 8 Nachbarn.

| # | Landschaft | Untergrund | Klima (Kurzform) | braucht Gruppen | Lebensraum | Dichte |
|---|---|---|---|---|---|---|
| 1 | Eis | – | T < −12 °C | – | Eis | – |
| 2 | Gipfelschnee | Fels | Höhe > 0,78 | – | Fels | – |
| 3 | Fels | Fels | Decke < 0,12, nicht trocken | – | Fels | – |
| 4 | Rohboden | Erde | Decke < 0,12, Boden vorhanden (nach Störung) | – | Fels | – |
| 5 | Wüste (Sand- oder Felswüste) | Sand/Fels | trocken, Decke < 0,12 | – | Wüste | – |
| 6 | Flechten & Moos auf Fels | Fels | nicht trocken | LP oder Mo | kalt: Tundra, sonst Offenland | 3 |
| 7 | Moosteppich | Erde | feucht | Mo | kalt: Tundra, sonst Offenland | 3 |
| 8 | Tundra | Erde | kalt (−12..4 °C), halbtrocken bis feucht; oberhalb der Baumgrenze auch alpin | Mo + (GP/Fa/Bl/Gr) | Tundra | 3 |
| 9 | Farnflur | Erde | nicht kalt, nicht trocken; Offenland **vor den Gräsern** | GP oder Fa (oder nicht-holzige Sa) | Offenland | 3 |
| 10 | Steppe | Erde | kühl bis warm, halbtrocken bis mäßig | Gr | Offenland | 3 |
| 11 | Wiese | Erde | kühl/gemäßigt, mäßig bis feucht, ohne Wald | Gr + Bl | Offenland | 3 |
| 12 | Savanne | Erde | warm bis tropisch, mäßig feucht; Einzelbäume, wenn holzig | Gr | Offenland | 3 |
| 13 | Halbwüste (Sand oder Fels) | Sand/Fels | halbtrocken, spärlich | Gr, Bl, Sa oder Na | Wüste | 3 |
| 14 | Gebüsch | Erde | Waldklima noch nicht erreicht, oder Übergangsstufe vor Wald | holzig (Bild: Farn- bzw. Blütensträucher) | Offenland | 3 |
| 15 | Wald (Ur-, Laub- oder Mischwald) | Erde | feucht, nicht kalt | holzig; Bild nach Gruppe: Bä/Ur/Sa = Urwald, Lb = Laubwald, Lb + Na = Mischwald | kalt: Nadelwald, tropisch + nass: Regenwald, sonst Wald | 2 |
| 16 | Nadelwald | Erde | kalt bis kühl, feucht | Na | Nadelwald | 2 |
| 17 | Regenwald | Erde | tropisch und nass | Lb (+ Bl) | Regenwald | 2 |
| 18 | Sumpf | Moor | Feuchtgebiet, ohne Bäume | LP, Mo, GP, Bä, Fa oder Fl | Sumpf | 3 |
| 19 | Sumpfwald | Moor | Feuchtgebiet mit Bäumen (Karbon: Bärlapp) | holzig (Bärlapp nur bis zum Ende der Schuppenbäume) | Sumpf | 2 |

Feuchte Tropen vor den Laubbäumen werden „Wald“ mit Urwald-Bild (Baumfarne, Schuppenbäume). Ihr Lebensraum bleibt Regenwald wie heute.

Die Dichte stuft die Pflanzendecke ein: spärlich < 0,30 ≤ mittel < 0,60 ≤ dicht, Hysterese ±0,04. Wälder haben nur 2 Stufen (licht/dicht).

### 3.4 Klimax-Matrix (alle Gruppen entwickelt)

Eingang sind geglättete Temperatur T und Feuchte m (3.7). Die Schwellen sind Startwerte aus der heutigen Regel, das Tuning folgt in Phase 1.

| T \ m | trocken < 0,16 | halbtrocken 0,16–0,24 | mäßig 0,24–0,38 | feucht 0,38–0,50 | nass ≥ 0,50 |
|---|---|---|---|---|---|
| < −12 °C | Eis | Eis | Eis | Eis | Eis |
| −12..4 °C (kalt) | Flechten/Fels | Tundra | Tundra | Nadelwald | Nadelwald |
| 4..14 °C (kühl) | Wüste | Steppe | Steppe; Wiese ab 0,30 | Laub-/Mischwald | Laub-/Mischwald |
| 14 °C..T_trop (warm) | Wüste | Halbwüste | Savanne | Wald | Wald |
| ≥ T_trop (tropisch) | Wüste | Halbwüste | Savanne | Wald | Regenwald |

**Vorrangregeln** (gelten vor der Matrix):

| Bedingung | Landschaft |
|---|---|
| Feuchtgebiet | Sumpf oder Sumpfwald |
| Höhe > 0,5 (Baumgrenze) | kein Wald, sondern Tundra, Flechten oder Fels |
| Höhe > 0,78 | Gipfelschnee |
| Pflanzendecke < 0,12 | Fels, Rohboden oder Wüste |

`T_trop` ist ein Tuning-Wert (heute 21 °C), Entscheidung siehe 6.1.

**Evolutions-Rückfall:** Fehlt die Gruppe, die eine Stufe braucht, gilt die höchste erreichbare Stufe derselben Kette (3.5). Beispiele:
- Kühl und feucht vor den Gräsern ergibt Farnflur, mit Bäumen Wald.
- Vor den Gefäßpflanzen ergibt es Moosteppich oder Flechten auf Fels.
- Sobald es Kakteen gibt (`src/cacti.ts`), zählen Blütenpflanzen in Wüstenklima als Halbwüsten-Bewuchs, nicht als Farnflur: Kühles, halbtrockenes Land mit Kakteen wird Halbwüste. Sonst würde es zwischen Wüste und Farnflur pendeln, weil die Kakteen nur auf Wüsten- und Halbwüstenfeldern wachsen.

### 3.5 Sukzessionsketten pro Untergrund

```
Fels   : Fels → Flechten & Moos auf Fels → (Boden wächst) → Moosteppich | Tundra | Farnflur
         → Steppe | Wiese | Savanne → Gebüsch → Wald | Nadelwald | Regenwald
         (oberhalb der Baumgrenze endet sie bei Tundra)
Sand   : Wüste → Halbwüste → Steppe | Savanne → Gebüsch (Trockenbusch) → Wald (nur wenn feucht genug)
Erde   : Rohboden → Farnflur | Wiese | Steppe → Gebüsch → Wald | Nadelwald | Regenwald   (sekundär, schnell)
Moor   : Schlamm (Sumpf, spärlich) → Sumpf → Sumpfwald
Eis    : Rückzug → Fels (Gletschervorfeld) → wie Fels
```

- **Vorwärts** geht es immer nur **eine Stufe** auf einmal, Richtung Klimax-Ziel.
- **Rückwärts** (Austrocknung, Abkühlung) ebenfalls stufenweise, z. B. Wald → Gebüsch → Steppe → Halbwüste → Wüste.
- **Störungen** setzen sofort zurück: Roden, Lava, Meteor, Vereisung, Überflutung.

### 3.6 Hysterese und Zeit

- **Neue Felder (gespeichert):**
  - `landscape`: aktuelle Stufe
  - `landscapeNext`: angestrebte nächste Stufe
  - `landscapeHold`: Ticks, die `landscapeNext` schon gilt
- **Wechsel:** Erst wenn `landscapeHold` die Haltezeit erreicht, wechselt die Stufe:
  - Haltezeit = max(**3 Ticks**, Stufenjahre / Jahre pro Tick)
  - Stufenjahre sind Tabellenwerte, z. B. Gebüsch → Wald 60 Jahre, Fels → Flechten 50 Jahre.
  - In der Geologie- und Evolutions-Skala gelten also 3 Ticks pro Stufe. In der Technologie-Skala wird eine Rodung über Jahrzehnte sichtbar wieder zu Wald.
- **Rückschritt:** halbe Haltezeit.
- **Schmitt-Trigger:** Jede Schwelle hat ein Band zugunsten des aktuellen Zustands: ±1,5 °C, ±0,03 Feuchte, ±0,02 Höhe, ±0,04 Decke.
- **Ausbreitung:** Haben mindestens 3 der 8 Nachbarn die nächste Stufe schon, halbiert sich die Haltezeit (Front). Hat sie kein Nachbar und ist es ein Wald, verdoppelt sie sich (vereinzelte Keime sind langsam).
- **Streuung pro Kachel:** Die Mindestdauer streut deterministisch per Kachel-Hash um 0 bis +2 Ticks (bzw. ±30 % in echten Jahren). Dazu kommt die Bevorzugung von Nachbarn (oben). Zonen wachsen so von den Rändern her, ganze Flächen springen nie gleichzeitig um, und Fronten wandern nicht als gerade Linie.
- **Zufall:** Keine Zufallszahlen aus `world.rng` nötig, alles deterministisch.

### 3.7 Kohärenz (große Zonen statt Flickenteppich)

1. **Geglättete Klimaeingänge:** T und Feuchte werden für die Einstufung über Land mit einem 5 × 5-Kastenfilter gemittelt (getrennt in X und Y, Wasser ausgenommen). Zonengrenzen folgen so glatten Isolinien statt dem Kachelrauschen. Höhenregeln (Baumgrenze, Schnee) bleiben pro Kachel.
2. **Gruppen-Umfeld:** Eine Pflanzengruppe gilt als vorhanden, wenn sie auf der Kachel oder auf ≥ 3 von 8 Nachbarn wächst. Einzelne Lücken in der Flora reißen dann keine Löcher.
3. **Mehrheitsfilter** nach jedem Tick: Eine Kachel, deren Landschaft höchstens 1 der 8 Nachbarn teilt, übernimmt die häufigste Nachbar-Landschaft. Bedingung: Diese ist an der Kachel erlaubt, ihr Klima- und Höhenrahmen ist mit Hysterese-Band erfüllt. Doppelpuffer, deterministisch.
4. **Hysterese und Fronten** (3.6) verhindern Flackern an Rändern.
5. **Natürliche Nachbarschaft:**
   - Jede Landschaft hat einen Platz auf dem Klimagradienten. Erlaubt sind nur Nachbarn auf derselben oder der nächsten Stufe der Gradienten-Ketten:
     - Regenwald → Wald/Savanne → Halbwüste → Wüste
     - Eis → Flechten/Tundra → Nadelwald → Laub-/Mischwald → Steppe/Wiese
     - Sumpf grenzt an alles Feuchte
   - Grenzen zwei unverträgliche Landschaften aneinander (z. B. Wüste an Eis, Regenwald an Tundra), bekommt die rangniedrigere Kachel die passende Zwischenstufe. Voraussetzung: Ihr Klima liegt mit erweitertem Hysterese-Band im Rahmen dieser Stufe.
   - Gibt das Klima keine Zwischenstufe her, bleibt die Grenze. Der Probe zählt solche Paare, Ziel 0.

**Zielwerte** (Probe `--biomes`, Lebensraum-Ebene, vor ~21 Mio. Jahren, beide Seeds), ohne dass die Gesamtanteile der Lebensräume um mehr als 5 Prozentpunkte kippen, außer gewollt durch 6.1:

| Messgröße | vorher | Ziel | erreicht (14. 10., Seeds 12345 / 777) |
|---|---|---|---|
| Grenzkanten | 18–20 % | ≤ 8 % | 11–13 % |
| Einzelkacheln (kein gleicher Nachbar) | 1 % | ≤ 0,2 % | 0,25–0,32 % |
| Kleinstregionen (≤ 3 Kacheln) | ~400 | ≤ 100 | 85–111 |
| flächengewichtete Regiongröße | 432 / 751 | ≥ 1500 | 416–693 |
| unnatürliche Nachbarn | – | 0 | 0 |
| bewachsenes Land als Fels/Rohboden/Flechten | – | – | 0,3–1,1 % |

**Ergebnis:** Nicht alle Zielwerte sind erreicht. Zwei davon waren nach der Messung zu streng angesetzt:
- **Grenzkanten:** Selbst vollständig geglättete Ziele erreichen bei dieser Geografie nur etwa 11,5 %. Das liegt an den vielen Klimastufen auf schmalen Kontinenten und an den Höhenstufen.
- **Flächengewichtete Regiongröße:** Diese Kennzahl wird von den größten Regionen bestimmt, das sind die beiden Polkappen mit je etwa 1400 Kacheln. Für Zonen auf Kontinenten taugt sie nicht.

Die verbliebenen Einzelkacheln sind fast nur frisch gestörte Kacheln, die in wenigen Ticks nachwachsen.

### 3.8 Breitenordnung (beschlossen, 6.1)

- **Niederschlag nach Breite (empfohlen):** In `ClimateSystem.updateMoisture` kommt über Land ein zonaler Faktor dazu:
  - Plus am Äquator (aufsteigende Luft)
  - Minus bei 20–35° (absinkende Luft)
  - Plus bei 45–60° (Westwinde)
  - Minus polwärts von 70°

  Der Faktor ist ein Tuning-Wert mit Regler-Default 0,5. Er wirkt auch auf Pflanzenausbreitung und Evolution und muss deshalb mit Probe und Tests nachgemessen werden.
- **Tropenschwelle:** `T_trop` wird so eingestellt, dass am Äquator wie auf der Erde **immer** Regenwald entsteht, sobald die nötige Vegetation da ist (beschlossen 14. 10.). Startwert 19 °C, Whittaker-Rahmen: tropischer Regenwald ab ca. 20 °C. Ein Umbau von Gelände oder Temperatur gehört **nicht** zu diesem Auftrag. Die Wirkung auf Pflanzenwachstum und Evolution ist gewollt.
- **Zielbild im Probe-Breitenprofil (nach den Laubbäumen):**

  | Band | Ziel |
  |---|---|
  | ±10° | Regenwald + Wald ≥ 40 % des bewachsenen Landes |
  | 15–35° | Wüste, Halbwüste und Savanne ≥ 40 % |
  | 40–60° | Wald, Steppe und Wiese führen |
  | > 60° | Nadelwald, Tundra und Eis führen |

### 3.9 Speicherformat, Drift, Leistung, Tests

- **Speicherformat 7:**
  - neue Felder: `landscape`, `landscapeNext`, `landscapeHold` (Uint8), `soil` (Uint8, 0..255)
  - Migration `migrateV6`: Landschaft direkt aus dem Ziel berechnen (Warmstart ohne Haltezeit), Boden aus Pflanzendecke × Wurzelfaktor schätzen
  - Alte Stände werden gelesen, nie gelöscht.
- **Drift:** `geo.ts` verschiebt die vier neuen Felder mit (`rollU8`).
- **Leistung:** Glättung, Einstufung, Hysterese und Mehrheitsfilter sind wenige Durchläufe über 32 768 Kacheln. Ziel: höchstens +1,5 ms pro Tick in Node (heute ca. 8,7 ms). Gemessen wird mit dem Probe.
- **Tests (neu: `tests/landscape.test.js`):**
  - Zieltabelle für Klima × Gruppen
  - Hysterese: Ein wechselnder Eingang flackert nicht
  - Kette: Fels bis Wald dauert ≥ 4 Stufen × Haltezeit
  - Mehrheitsfilter entfernt Einzelkacheln
  - Determinismus (gleicher Seed, gleicher Hash)
  - Format-7-Rundreise und Migration aus Format 6
  - Bestehende Tests (`sim.test.js` Biom-Regeln, `save.test.js`) werden angepasst, wo sich die Semantik bewusst ändert.

---

## 4. Grafik (Phase 2)

### 4.1 Styleguide und Palette (wird vor allen Assets festgelegt)

- **Eine Palette** mit 75 Farben in Rampen zu 2–8 Tönen (`tools/terrain/palette.js`). Schatten verschieben sich Richtung Blau und Violett, Lichter Richtung Gelb.

  | Rampen-Gruppe | Rampen |
  |---|---|
  | Grün | Wiese (gelbgrün), Laub (mittelgrün), Nadel (dunkel-blaugrün), Tropen (sattgrün), Moos (oliv-gelbgrün), Farn (blaugrün) |
  | Erd- und Naturtöne | Stroh/Steppe, Sand, Erde, Fels (warmgrau), Eis/Schnee (blauweiß), Moor (oliv-braun), Holz |
  | Akzente | Blüte (rosa, gelb, weiß) |
  | Wasser | `water` (8 Stufen; Hochsee, Küstenmeer, Rippel, Flüsse, Schaum), `waterWarm` (Lagunen-Türkis), `reefUnder` (Korallen und Riffsand unter Wasser) |

  Palette und Rampen stehen im Manifest. Code und Werkzeuge lesen nur von dort.
- **Licht:** von oben links, für Boden, Objekte und Relief (passt zur heutigen Hangschattierung aus Nordwest).
- **Boden ruhig, Tiere laut:**
  - Bodentexturen haben 3–4 Farben pro Material und eine geringe Helligkeitsspanne (ca. ≤ 12 L*).
  - Objekte dürfen ≤ 25 L* spannen.
  - **Keine Tintenkonturen in der Landschaft.** Objekte bekommen eine selektive Kontur aus dem dunkelsten Ton der eigenen Rampe.
  - Tintenkontur und Schatten bleiben den Tieren vorbehalten. So heben sie sich auf jedem Untergrund ab.
- **Pixel-Regeln:**
  - Formen sind mindestens 2 px groß, kein Einzelpixel-Rauschen, kein Pillow-Shading.
  - Dithering nur geordnet (Bayer 4 × 4) in Weltkoordinaten, nie pro Bild neu.
  - Kein reines Schwarz.
- **Sichtbare Evolution (beschlossen 14. 10.):**
  - Pflanzen sind auf der Karte **immer** sichtbar, und **jede der 14 Pflanzengruppen ist erkennbar**. Man erkennt sie an der Form ihrer Pixel-Objekte und an Bodenton bzw. Texturdetail, nicht an Symbolen.
  - Wachsen mehrere Gruppen auf einer Kachel, verteilt der Renderer die Objekt-Plätze der Kachel auf die Gruppen: die prägende Gruppe (`floraTop`) ×4, Gruppen mit einem Objekt eigens für diese Landschaft ×2, alle anderen ×1. Erst innerhalb der gewählten Gruppe schlägt ein landschaftsspezifisches Objekt den Eintrag `*`. Ein Mischwald zeigt also Fichten **und** Laubbäume, ein Moor Torfmoos, Schilf **und** Sonnentau.
  - Gruppen ohne eigenes Objekt in einer Landschaft zeigen sich im Bodendetail: Moos- und Flechtenflecken, Algenfilm auf Wasser.

### 4.2 Ebenen und Zeichenreihenfolge

1. **Wasser:**
   - Zwei flache Klassen ohne Tiefenverlauf: Hochsee (`water2`) und Küstenmeer (`water4`), am Schelfrand ein 3–4 px breiter Bayer-Übergang; dazu die Rippel-Textur der Klasse. Lagunen mischen Türkis per Bayer ein (Stufe 1 ein Viertel, 2 die Hälfte, 3 voll). Tiefe zeigen nur die Tiefenansichten (Ebene „Ozeane“ aus, Übersichtskarte „Gelände“ und „Meeresboden“).
   - Gezeichnet für Wasserkacheln **und** für Landkacheln mit Wassernachbarn, damit unter ausgefransten Landrändern Wasser liegt.
2. **Boden (Dual-Grid, nach Rang aufsteigend):**
   - Jede Darstellungszelle ist um eine halbe Kachel versetzt und hat 4 Eckkacheln.
   - Das rangniedrigste Material der Ecken wird voll gezeichnet. Jedes höhere Material M zeichnet mit der Maske „Ecken mit Rang ≥ Rang(M)“, insgesamt höchstens 4 Lagen.
   - Wasser hat Rang 0. Land überdeckt es also mit derselben organischen Maske, und Küsten werden so automatisch weich.
3. **Relief:**
   - Hangschatten werden bilinear über die Zelle interpoliert und als Verschiebung der Farbrampe um ±1–2 Stufen umgesetzt (Bayer-Übergang). Es gibt keine halbtransparente Waschung mehr, also keine Kachelquadrate.
   - Eine großräumige Weltrausch-Verschiebung um ±1 Stufe bricht Wiederholungen.
4. **Ufer:**
   - Landseitig ein 1-px-Nasssaum je Untergrund: nasser Sand, Schlamm oder dunkler Fels.
   - Wasserseitig ein 1–2-px-Schaumband, abgeleitet aus derselben Maske.
   - Flüsse: geglättete Linien entlang des tatsächlichen Abflusses (`riverDown`), Breite aus `riverLevel` (3–6 px), mit Uferkante, Algenfilm und Mündung ins Meer. Gezeichnet vor den Objekten (umgesetzt 14. 10.; ersetzt die anfangs geplanten Fluss-Sprites, die Treppen bildeten).
5. **Objekte:**
   - Zeilenweise von oben nach unten, innerhalb der Zeile nach Fußpunkt.
   - Kleiner Schlagschatten unten rechts als Rampen-Verschiebung des Bodens darunter.
   - Auf Stadt- und Flusskacheln stehen keine Objekte.
6. **Darüber, unverändert:** Städte, Ereignisse, Klima-Overlays, dann Tiere (`herds.ts`, eigene Ebene, immer sichtbar), Wolken, Cursor.
   - Ergänzt am 15. 10.: Direkt über dem Gelände und vor den Ereignissen liegen Brandung und Strömung (`watermotion.ts`).
   - Die Ebene wird jedes Bild gezeichnet; die Chunks bleiben unverändert.
   - Ihre Daten liest `landsurf.ts` beim Komponieren aus dem fertigen Indexpuffer: drei Wasserringe vor jeder Küste und eine Bitmaske des sichtbaren Flusswassers.

### 4.3 Texturen

- **Größe:**
  - Pro Material und Dichte eine nahtlose 64 × 64-Textur. Für großflächige Materialien (Eis, Sand, Steppe, Savanne, Rippel) 128 × 128.
  - Jede Kachel zeigt den 16 × 16-Ausschnitt an ihrer Weltposition: (x mod n, y mod n) mit n = Texturgröße / 16.
  - Weil die Zellen um eine halbe Kachel versetzt sind, liest der Compositor mit Umlauf-Adressierung.
- **Nahtlos per Konstruktion:** Der Generator nutzt periodisches Rauschen.
- **Dichte und Untergrund:**
  - Dichtestufen sind eigene Texturen desselben Materials.
  - Sie gehen über die Rangfolge ineinander über: dicht > mittel > spärlich als Unterrang.
  - Untergrund-Varianten sind eigene Materialien, z. B. Flechten auf Fels ≠ Moosteppich auf Erde, Halbwüste auf Sand ≠ auf Fels.

### 4.4 Randmasken

- **Satz:** 16 Marching-Squares-Fälle (Ecken TL, TR, BL, BR) × 3 Varianten, 16 × 16, 1 Bit. Fall 0 und 15 brauchen keine Varianten, das ergibt 44 Masken.
- **Form:** Die Kontur ist mit periodischem Rauschen ausgefranst, 2–4 px Amplitude, Cluster ≥ 2 px.
  - Die Varianten passen an den Zellkanten zusammen: Der Kantenverlauf hängt nur von den Ecken der gemeinsamen Kante ab.
  - Die Wahl der Variante pro Zelle läuft über einen Hash der Weltkoordinaten.
- **Anwendung:** Die Masken werden **einmal** auf jede Biomtextur angewendet und zwischengespeichert. Neue Materialien funktionieren also ohne neue Übergangskacheln mit allen anderen.

### 4.5 Objekte

- **Höhe und Anker:**
  - Hohe Objekte (Bäume) sind 16 × 20 px groß, unten mittig verankert und ragen höchstens 4 px in die Kachel darüber.
  - Niedrige Objekte (Büsche, Gras, Schilf, Felsbrocken) bleiben in 16 × 16.
  - Kakteen sind bis 16 × 20 groß: Ein alter Säulenkaktus wird so hoch wie ein kleiner Baum.
- **Dichte pro Landschaft:**

  | Landschaft | Objekte |
  |---|---|
  | dichter Wald | 2–3 Bäume pro Kachel (geschlossenes Kronendach) |
  | lichter Wald | 1–2 Bäume |
  | Gebüsch | 1–2 Büsche |
  | Savanne | Gras als Fläche, Hochgras; Savannenbäume auf 8 % (am Wüstenrand) bis 35 % (am Waldrand) der Kacheln mit Blütenpflanzen, sobald es Laubbäume gibt |
  | Halbwüste | ca. 1 Busch pro 4 Kacheln |
  | Wüste, Halbwüste mit Blütenpflanzen | ein Kaktus auf jeder zweiten Kachel, sobald es Kakteen gibt |
  | Steppe, Tundra, Fels | 1 Objekt pro 4–6 Kacheln |
  | Wiese, Moos | Bewuchs nur in der Textur |

- **Waldrand:** Der Randabstand d ist der Abstand in Kacheln zur nächsten rangniedrigeren Landschaft (Chamfer-Abstand über 8 Nachbarn).
  - d = 0: Dichte × 0,35, nur kleine Größen, Bäume werden zu Büschen (Waldmantel)
  - d = 1: Dichte × 0,7, mittlere Größen
  - ab d = 2: volle Dichte
- **Zufall:** Position, Versatz (±1–2 px), Größe und Variante kommen aus einem Hash von (x, y, Slot), nie pro Bild neu.

### 4.6 Zoom und Pixelgenauigkeit (beschlossen 14. 10.)

- **Zoom bleibt wie heute:** stufenlos, 10–48 CSS-px pro Kachel. Pixelschärfe wird technisch gelöst.
- **Zwei Schritte, Gerätekachel T = tilePx × devicePixelRatio:**
  1. Die 1×-Komposition wird mit Nearest Neighbour auf das nächste ganzzahlige Vielfache k = ⌈T / 16⌉ hochskaliert, also 16·k px pro Kachel.
  2. Dieses Zwischenbild wird geglättet (`imageSmoothingQuality = 'high'`) auf T verkleinert.
  - Ist T genau 16·k, entfällt Schritt 2 und das Bild bleibt scharf.
  - Unter 16 px pro Kachel wird die 1×-Komposition direkt geglättet verkleinert.
- **Ziel:** keine ungleich großen Pixel und kein Flimmern beim Zoomen und Verschieben.
  - Das Zwischenbild ist weltfest: Kachelgrenzen liegen auf ganzen Zwischenbild-Pixeln.
  - Der Ausschnitt wird mit gleichbleibendem Verhältnis T / (16·k) verkleinert, damit beim Verschieben die Abtastphase nicht springt.
  - Der Renderer misst das mit einer Bildfolge beim Verschieben um je 1 Gerätepixel.
- **Unverändert:**
  - Die bestehende Zoom-Vorschau (Strecken während der Geste) bleibt.
  - Die Tiere bleiben Vektorgrafik in Gerätegröße.

### 4.7 Laufzeit (Renderer)

- **Atlas einlesen:**
  - Das PNG wird als data-URI aus `src/terrainatlas.ts` dekodiert. data-URIs „verschmutzen“ den Canvas nicht, und über `file://` ist kein `fetch` nötig.
  - Danach wird das Bild einmal in Palettenindizes umgerechnet.
  - Bis das Bild dekodiert ist (wenige ms), zeichnet die Karte flache Landschaftsfarben.
- **Paletten-Compositor in 1×-Chunks:**
  - Ein Chunk ist 16 × 16 Kacheln groß, also 256 × 256 px, plus 4 px Rand oben und 2 px seitlich für Baumkronen.
  - Masken, Relief-Rampen, Ufersäume und Objektschatten sind Index-Operationen.
  - Am Ende kommt `putImageData` in ein Chunk-Canvas.
  - Ein Chunk wird nur neu komponiert, wenn sich seine Signatur ändert: der Hash aus Material, Dichte, Reliefstufe, Flussmaske und Randabstand seiner Kacheln plus 1 Kachel Rand.
  - Das Basisbild ist dann die Summe der skalierten Chunk-Blits, darüber Städte und Ereignisse.
- **Leistungsziel:** volle Neuzeichnung bei 1920 × 1080 (1×) ≤ 30 ms nach dem ersten Komponieren, erstes Komponieren ≤ 120 ms. Gemessen wird in headless Chrome.
- **Feature-Flag:**
  - `TERRAIN_STYLE` (`'pixel' | 'legacy'`), umschaltbar per URL-Parameter `?terrain=legacy` für Vorher/Nachher-Bilder.
  - Der alte Weg (Bodensprites und Pflanzensymbole) bleibt bis zur Abnahme bestehen und wird danach entfernt, und zwar vollständig:
    - `BIOME_SPRITES` als Karten-Boden, `plantPicture`, `tilecache.plant`
    - alle SVG-Pflanzengrafiken in `src/floraart/`, `FLORA_ART`
    - der Pflanzenteil von `tools/species-sheet.js`, `tools/artcheck.js` und `tests/species.test.js`

### 4.9 Untersuchen-Panel (aktualisiert 16. 10.)

- **Feldbild:** nur die untersuchte 16 × 16-Kachel aus dem Landschafts-Atlas, mit ihren eigenen Pflanzen-Objekten und deren vollständigem Überstand. Ganzzahlig bis 8× vergrößert; hohe oder breite Objekte verringern den Faktor passend zum Bildplatz. Objekte benachbarter Felder entfallen.
- **Kopf:** Feldbild links, Landschaft und Zustand rechts; Temperatur, Niederschlag, Höhe oder Tiefe, Windpfeil, Magma und Koordinaten jeweils einmal.
- **Leben:** kompakte, aufklappbare Einträge mit Icon, Name und Bestand. Tierdetails verwenden die Lexikon-Porträts und Unterarten; Pflanzen zeigen ihre Gruppe und Lebensräume aus dem Evolutionsbaum. Leere Bereiche bestehen aus einer kurzen Zeile.
- **Lebensraum-Eignung der Tiere:** alle elf Biome als Icons, mit gezeichnetem lachendem, neutralem oder weinendem Gesicht beziehungsweise rotem X. Der aktuelle Lebensraum ist umrahmt; Name und Bewertung erscheinen im Tooltip, auf dem Handy auch durch Antippen.
- **Platzierung:** schmales Panel neben der Werkzeugleiste, auf kleinen Bildschirmen als begrenztes Blatt über der unteren Leiste. Das gewählte Feld wird bei Bedarf in den freien Kartenteil verschoben. Geöffnete Einträge bleiben bei laufender Simulation erhalten.

### 4.8 Asset-Pipeline

- **Generator:** `tools/terrain-atlas.js`, Node 22 ohne Abhängigkeiten, eigener kleiner PNG-Encoder über `node:zlib`.
  - Er erzeugt deterministisch aus festen Seeds:
    - `assets/terrain/atlas.png`
    - `assets/terrain/manifest.json` (Palette, Rampen, Rechtecke, Anker, Ränge, Materialien)
    - `src/terrainatlas.ts` (generiert: PNG als data-URI und Manifest als Konstante)
  - `--sheet` rendert ein Kontaktblatt: alle Materialien, Übergangsmatrix aller Paare, Objekte in 1× und 3×, auf Hell und Dunkel.
  - `--check` prüft:
    - Palettentreue
    - Nahtlosigkeit
    - Maskenkanten-Kompatibilität
    - Objektgrößen und Überstand ≤ 4 px
    - Anker
    - Determinismus (zweimal erzeugen, gleiche Bytes)
- **Rezepte:**
  - Materialien sind prozedurale Rezepte (Grundrampe, periodisches Rauschen, Büschel- und Steinmuster) in je einer Datei pro Biomfamilie unter `tools/terrain/`.
  - Objekte sind handgezeichnete Zeichenraster wie in `sprites.ts`.
- **Regeländerung:** `AGENTS.md` sagt „Assets are SVG only“ und `assets/README.md` beschreibt nur SVG. Beide werden für `assets/terrain/` um die Pixel-PNG-Ausnahme ergänzt.

### 4.10 Riffe, Lagunen, Strände und Palmen (18. 10.)

Nur Darstellung: Alles wird beim Zeichnen aus vorhandenen Werten abgeleitet (Unterart-Stufe, Dichte, Wassertemperatur, `world.biome`, `riverFlow`, Kalender). Kein Speicherfeld, kein Tick-Schritt, keine Zufallszahlen. Regeln in `src/reefs.ts`, Pixel in `src/landshore.ts` und `src/landwater.ts`, Werte `CORAL_*`/`REEF_*`/`BEACH_*`/`SHELL_*`/`PALM_*` in `constants.ts`. Der frühere Strand als eigener Boden (bis v0.9.1) ist entfernt. Bericht: `docs/riffe-2026-10/bericht.md`.

- **Arten-Merkmale:** `reefBuilder` an Runzel- und Steinkorallen, `reefGrazer` an Echten Knochenfischen (`src/species/types.ts`).
- **Riff:** Küstenmeer (`Biome.Coast`) höchstens 3 Felder vor dem Land, Wasser ab `CORAL_MIN_TEMP` (20 °C), sobald eine Korallen-Unterart auf dem Planeten entstanden ist. Nesseltiere müssen auf dem Feld oder bis 2 Felder entfernt leben (Dichte ab 0,05; Larven siedeln aus der Nähe, und auf vielen Planeten verdrängt anderes Meeresleben sie aus dem Küstenmeer selbst), nicht in 2 Feldern um einen großen Fluss (`riverFlow` ≥ 200). Höchstens ein Zentrum je mit dem Seed versetzter 8 × 8-Zelle (Kandidat mit höchstem Hash), mindestens 5 Felder Abstand. Runzelkorallen 0–1 Ringe, Steinkorallen 1–2 (ab Dichte 0,4 der größere). Ringe wachsen über die Kandidaten (8 Nachbarn), folgen also der Küste; vom äußersten Ring nimmt das Riff nur 65 % (Hash), der Rand franst aus.
- **Wachstum (20. 10.):** Riffe erscheinen nicht mehr alle auf einmal. Der Chronik-Eintrag „Erste Riffe“ hält Datum und Feld des ersten Riffs; die Chronik wird ohnehin gespeichert, ein neues Speicherfeld gibt es nicht. Jedes andere Riff beginnt bis zu 20 Mio. Jahre später, zu 60 % nach seinem Abstand vom ersten, zu 40 % per Hash: Die Riffe breiten sich wie treibende Larven aus. Dann wächst es alle 3 Mio. Jahre um einen Ring, und jedes Feld zeigt alle 1,5 Mio. Jahre einen Fleck mehr (erst 1, dann bis 3–4). Bei 125 000 Jahren je Tick sind die warmen Küsten nach rund 250 Ticks voll. Steinkorallen übernehmen ebenso nach und nach, vom ersten Steinkorallenriff aus (Chronik „Steinkorallen bauen Riffe“). Die alten Riffe bleiben stehen, bis Steinkorallen sie übernehmen, auch wenn die Runzelkorallen-Unterart schon geendet hat (sie endet, weil die Steinkorallen sich ausbreiten). Ein Planet, der mit Riffen beginnt, trägt beide Einträge rückdatiert (Erddatum der Korallen-Unterart, mindestens die volle Wachstumszeit). Grenze: Stirbt ein Riff aus und kehrt später zurück, steht es sofort ausgewachsen da.
- **Gleichgewicht:** Sobald die Weidefisch-Unterart (Echte Knochenfische) auf dem Planeten entstanden ist, weiden Fische jeder Stufe (ab Dichte 0,05) das Riff ab, auf oder neben dem sie leben, und zwar das ganze Riff. Die Stufe eines Feldes zeigt nur seine jüngste Form, die älteren leben daneben weiter. Sandflecken = ⌈Flecken × 0,3 × Fischstufe/3⌉, also mindestens einer, sobald Weidefische dort leben.
- **Stufen statt Hysterese:** Dichten werden in Stufen von 0,2 gelesen; Größe, Flecken und Sand ändern sich nur beim Wechsel einer Stufe. Die Schwellen selbst haben keine Hysterese, dafür bräuchte es gespeicherten Zustand.
- **Lagune:** Rifffelder Stufe 2, mit Sand 3; Küstenmeer bis ein Feld landeinwärts Stufe 1 (neben Sandriffen 2). Land übernimmt den höchsten Wert seiner Meer-Nachbarn, damit das Türkis bis an den Strand reicht.
- **Riffbild:** Korallen- und Sandflecken (Objektart `reef`, Rezept in `tools/terrain/coast.js`, Farben vorgemischt) unter den Rippeln des Küstenmeers, je Fleck ein Grüppchen aus 2–4 Kolonien, zur offenen See dichter und größer, kein Raster (`src/landcoast.ts`); die Lagune in flachen Türkisstufen, gedithert nur in schmalen Bändern zwischen zwei Stufen; zur offenen See eine 1 px breite, unterbrochene Schaumlinie. Auf Rifffeldern kein Seetang.
- **Strände:** Detail des Küstenpasses, kein Boden. Sie liegen in Abschnitten von etwa 4 Feldern mit unregelmäßigen Enden (Hash je versetzter Zelle), nicht als Einzelflecken. Riffstrände bis 2 Felder neben einem Riff, das schon Sand hat; Anteil nach der Fischstufe 50/70/85 %, kleine Inseln bis 6 Felder 95 %; 2–4 px, in Buchten bis 5, auf Landzungen 1 oder keiner. Muschelstrände neben Weichtieren und Gliederfüßern mit Schale (Trilobiten, Krebse) ab 12 °C Wasser, gezählt wie Weidefische (ab Dichte 0,05, dann eine Stufe je 0,2), Anteil nach der Stufe 30/45/60 %; sie kommen also lange vor den Riffstränden und mehren sich mit den Tieren; 1–3 px. Nicht auf Eis, Schnee, Sumpf, Sumpfwald, ab Hügelland (Höhe 0,11), Gebirge, Felsgürtel, an großen Flussmündungen. Breite aus Rauschen in Weltpixeln (Periode 32 px) und dem Wasseranteil im Umkreis von 6 px; Sand aus dem Overlay `beach_sand`.
- **Palmen:** ab Blütenpflanzen und dem Kalenderdatum 86 Mio. J. vor heute (älteste Palmenfossilien, *Sabalites*). Je Strandfeld per Hash 60 % keine, 30 % eine, 10 % ein Paar. Fuß auf trockenem Sand 1–2 px hinter der nassen Linie, nie auf einem Streifen unter 2 px, Krone 3–6 px über dem Wasser, sonst keine Palme. Kronenpixel über dem Meer sind weder Brandung noch Meer für die Wellen-Effekte. Auf Strandsand steht sonst nichts.
- **Sandinseln (Cays):** Auf einem ausgewachsenen Rifffeld mindestens 2 Felder vor dem Land, ab Fischstufe 2, liegt zu 30 % (Hash) eine kleine Sandinsel aus dem Riffsand. Entlang eines Riffs bilden sie Ketten.
- **Palmeninseln:** Sobald Laubbäume entwickelt sind (und Palmen da), bekommen Inseln bis 12 Felder auf Land ab 20 °C (etwa Hotspot-Ketten) einen fast geschlossenen Strandring (90 %), weiß, sobald Weidefische entstanden sind, und Palmen auf 75 % der Strandfelder. Auf jeder Sandinsel stehen dann 1–2 Palmen.
- **Untersuchen-Fenster und Chronik:** Riff, Wassertemperatur, Fische, Sandinsel und Strandsand werden aus `src/reefs.ts` gelesen; „Erste Riffe“, „Steinkorallen bauen Riffe“, „Weiße Strände“ und „Palmeninseln“ trägt `app.ts` einmal in die Chronik ein.

---

## 5. Rangfolge und Asset-Liste

### 5.1 Rangfolge für Übergänge (niedrig → hoch)

Höher zeichnet seinen ausgefransten Rand über niedriger. Innerhalb eines Materials gilt dicht > mittel > spärlich.

```
0 Wasser · 1 Fels · 2 Felswüste · 3 Sand · 4 Rohboden · 5 Schlamm · 6 Halbwüste · 7 Flechten auf Fels
8 Tundra · 9 Moosteppich · 10 Farnflur · 11 Steppe · 12 Savanne · 13 Wiese · 14 Sumpf · 15 Gebüsch
16 Sumpfwald · 17 Nadelwald · 18 Wald · 19 Regenwald · 20 Meereis · 21 Eis · 22 Gipfelschnee
```

Begründung:
- Fels ist das Grundgestein, alles andere liegt darauf.
- Mehr Pflanzenmasse liegt höher. Waldboden, Kronen und Mantel überlagern das Offenland.
- Eis und Schnee decken alles zu.

### 5.2 Bodentexturen (52)

| Familie | Material | Dichten | Größe |
|---|---|---|---|
| kalt | Eis, Meereis, Gipfelschnee | je 1 | 128 / 64 / 64 |
| kalt | Fels | 1 | 64 |
| kalt | Flechten & Moos auf Fels | 3 | 64 |
| kalt | Tundra | 3 | 64 |
| kalt | Nadelwaldboden | 2 | 64 |
| gemäßigt | Rohboden | 1 | 64 |
| gemäßigt | Moosteppich, Farnflur, Steppe, Wiese, Gebüsch-Boden | je 3 | 64 (Steppe 128) |
| gemäßigt | Waldboden (Ur-, Laub-, Mischwald) | 2 | 64 |
| warm | Sand, Felswüste | je 1 | 128 / 64 |
| warm | Halbwüste auf Sand, Halbwüste auf Fels, Savanne | je 3 | 64 (Savanne 128) |
| warm | Regenwaldboden | 2 | 64 |
| nass | Schlamm | 1 | 64 |
| nass | Sumpf | 3 | 64 |
| nass | Sumpfwaldboden | 2 | 64 |
| Wasser | Rippel Küste, Rippel Hochsee | je 1 | 128 |
| Wasser | Algenfilm (Süßwasser-Grünalgen auf Fluss und Moor) | 1 | 64 |

Zählung: kalt 12, gemäßigt 18, warm 13, nass 6, Wasser 3. Summe 52.

### 5.3 Masken und Säume

- 44 Randmasken (4.4), daraus automatisch abgeleitet Schaumband und Nasssaum.
- 3 Saum-Rampen: nasser Sand, Schlamm, nasser Fels.

### 5.4 Flüsse

Keine Sprites: Der Renderer zeichnet Flüsse als geglättete Linien in den Farben der Paletten-Rampen `water` und `mud` (4.2, Punkt 4).

### 5.5 Objekte (115, nach Pflanzengruppe)

Jede der 14 Pflanzengruppen hat mindestens ein eigenes, erkennbares Objekt oder eine eigene Textur. Bäume gibt es in 3 Größen × 2 Formen (16 × 20), alles andere in 3 Varianten (≤ 16 × 16).

| Gruppe | Objekte | Familie (Agent) |
|---|---|---|
| Meeresalgen | Tang (im Küstenmeer) | nass |
| Süßwasser-Grünalgen | Algenfilm-Textur (5.2) | nass |
| Erste Landpflanzen | Lebermoos-Polster | nass |
| Moose | Moospolster, dazu die Moos- und Flechten-Texturen | kalt |
| Frühe Gefäßpflanzen | Urfarn-Stängel (Rhynia) | gemäßigt |
| Bärlapp | Schuppenbaum; nach dem Ende der Schuppenbäume kein Objekt (`src/lycopsids.ts`) | nass |
| Farne & Schachtelhalme | Farnwedel, Schachtelhalm (gemäßigt); Baumfarn (warm) | gemäßigt, warm |
| Urbäume | Urbaum (Archaeopteris) | gemäßigt |
| Samenpflanzen | Palmfarn (warm); Samenfarn-Busch (gemäßigt) | warm, gemäßigt |
| Nadelbäume | Fichte, Wacholder (kalt); Sumpfzypresse (nass) | kalt, nass |
| Blütenpflanzen | Blumen, Blütenstrauch (gemäßigt); Zwergstrauch/Heide (kalt); Säulen-, Kugel-, Feigenkaktus (warm, nur Wüste und Halbwüste); Affenbrotbaum, dazu der Schirmbaum als Savannenbaum (warm, nur Savanne); Urwaldpalme (warm, Unterholz von Regen- und Bergregenwald) | gemäßigt, kalt, warm |
| Laubbäume | Laubbaum, Laubstrauch (gemäßigt); Tropenriese, Schirmbaum, Dornbusch (warm) | gemäßigt, warm |
| Gräser | Grasbüschel (gemäßigt); Hochgras (warm); Schilf (nass) | gemäßigt, warm, nass |
| Fleischfressende Pflanzen | Sonnentau | nass |
| ohne Gruppe | Felsbrocken (3), Geröll (2), Eisbrocken (2) | kalt |

Zählung: 9 Baumarten × 6 = 54, 19 Busch- und Kleinpflanzen-Arten × 3 = 57, 3 Kakteen × 3 = 9, Felsen und Eis 7. Summe 127.

**Welches Objekt eine Gruppe zeigt**, hängt von der Landschaft ab. Die Zuordnung steht als `where` im Katalog, z. B.:
- Laubbäume: in der Savanne Schirmbaum, im Regenwald Tropenriese, sonst Laubbaum
- Regen- und Bergregenwald haben eine Strauchschicht: Baumfarne (Farne) und Urwaldpalmen (Blütenpflanzen) unter den Tropenriesen
- Blütenpflanzen: in der Tundra Heide, im Gebüsch Blütenstrauch

Kakteen sind keine eigene Gruppe, sondern die Form der Blütenpflanzen auf Wüsten- und Halbwüstenfeldern (`src/cacti.ts`). Sie erscheinen 95 Mio. Jahre nach den Blütenpflanzen. Vorher zeigen diese Felder keine Blütenpflanzen-Objekte. Danach steht auf jeder zweiten solchen Kachel (Kachel-Hash) ein Kaktus, als eigenes Objekt neben den Plätzen der Landschaft.

Savannenbäume sind ebenso die Form der Blütenpflanzen auf Savannenfeldern (`src/savannatrees.ts`), sobald es auf dem Planeten Laubbäume gibt. Ein Kachel-Hash setzt einen Schirmbaum, etwa jeder achte ein Affenbrotbaum. Der Anteil steigt mit der Lage von 8 % am Wüstenrand auf 35 % am Waldrand. Die Lage ergibt sich aus dem Abstand zur nächsten Wüste bzw. Halbwüste und zum nächsten Wald, höchstens 6 Kacheln weit. Die Abstände werden nur neu berechnet, wenn sich eine Landschaft ändert. Schilf erscheint nur mit Gräsern.

Der Kapokbaum ist ein Wahrzeichen, kein Objekt der Landschaft (`src/kapok.ts`, `src/kapoklayer.ts`). Einmal pro Planet steht er im Herzen des größten Regenwalds: auf der Regenwaldkachel, die am weitesten von jeder anderen Landschaft entfernt ist, mindestens 3 Kacheln tief (ein geschlossener Block von 5 × 5 Kacheln). Kacheln mit Fluss, Stadt, Feld oder Holzeinschlag scheiden aus. Er bleibt, solange seine Kachel passt, sonst wächst er im tiefsten verbliebenen Regenwald neu. Gezeichnet wird er als Sprite aus dem Effekt-Atlas über den Bäumen des Regenwalds, mit 32 × 40 px doppelt so groß wie sie. Die Lupe zeigt seine Karte auf seiner Kachel und auf den 3 × 2 Kacheln darüber, die seine Krone füllt. Beim ersten Fund kommt er in die Chronik („Urwaldriese entdeckt“).

Schatten zeichnet der Compositor, nicht das Sprite.

---

## 6. Beschlüsse (Freigabe 14. 10. 2026)

1. **Klimazonen:**
   - Breitenabhängiger Niederschlag kommt (3.8), die Regenwald-Temperatur wird angepasst.
   - Am Äquator entsteht bei passender Vegetation **immer** Regenwald.
   - Zonen gehen entlang des Klimagradienten ineinander über, z. B. Regenwald → Savanne → Halbwüste → Wüste und Eis → Tundra → Nadelwald → Laub-/Mischwald.
   - Unnatürliche Nachbarschaften (Wüste an Eis) entstehen nicht. Wo das Klima es hergibt, wird eine Zwischenstufe eingefügt (3.7, Punkt 5).
   - Die Wirkung auf Pflanzenwachstum und Evolution ist gewollt.
2. **Tier-Lebensräume:** Die 11 bestehenden bleiben, kein neues Balancing.
3. **Sukzession:**
   - Mindestens 3 Ticks pro Stufe, in Zivilisation und Technologie echte Jahre.
   - Die Mindestdauer streut deterministisch per Kachel-Hash, Ausbreitung kommt bevorzugt von Nachbarkacheln. Zonen wachsen von den Rändern her (3.6).
4. **Zoom:** stufenlos und mit dem heutigen Bereich (10–48 px) wie bisher. Pixelschärfe technisch über Nearest Neighbour auf das nächste ganzzahlige Vielfache, dann weich auf Zielgröße (4.6). Kein Flimmern, keine ungleich großen Pixel.
5. **Pflanzen:**
   - Immer sichtbar, jede Gruppe erkennbar, im neuen Pixel-Stil als Objekte und Bodentexturen in 3/4-Ansicht (4.1, 5.5).
   - Das Untersuchen-Fenster zeigt die neuen Grafiken (4.9).
   - Die alten SVG-Pflanzengrafiken werden danach vollständig entfernt (4.7).
6. **PNG:** erlaubt für Landschaft, Vegetation und Übergänge (`assets/terrain/`). Tiere und alle übrigen Grafiken bleiben SVG.
7. **Übersichtskarte:** bleibt vorerst unverändert.

---

## 7. Umsetzungsplan und Agenten (nach Freigabe)

| # | Paket | Inhalt | Dateien (Besitz) | hängt ab von |
|---|---|---|---|---|
| A0 | Grundlage (Lead) — **erledigt 14. 10.** | Palette, Rampen, Styleguide, Katalog (Vertrag), Generator mit PNG-Encoder, Masken, Vorschau-Compositor und Kontaktblätter, Platzhalter-Atlas, TS-Verträge (`Landscape`, `Substrate`, Kachelfelder in `WorldState`), vorläufige Ableitung der Landschaft, Vertragstest, `SE_BUNDLE` für parallele Builds | `tools/terrain-atlas.js`, `tools/terrain/{catalog,palette,kit,masks,build,atlas,preview,sheet,png}.js`, `src/landscape.ts`, `src/succession.ts` (vorläufig), `src/terrainatlas.ts` (generiert), `assets/terrain/`, `tests/terrain.test.js`, `docs/landschaft-2026-10/stil.md` | – |
| A1 | Logik | Landschaft, Boden, Hysterese, Glättung, Mehrheitsfilter, Lebensraum-Ableitung, Drift, Format 7, Tests, Probe `--biomes`, Klima-Faktor (6.1) | `src/landscape.ts` (neu), `biome.ts`, `world.ts`, `geo.ts`, `save.ts`, `climate.ts`, Tabellen in `constants.ts`/`params.ts`, `tests/landscape.test.js`, `tools/headless.js` | A0 (Verträge) |
| A2 | Renderer | Atlas-Dekodierung, Paletten-Compositor, Chunks, Dual-Grid, Wasser- und Uferkanten, Flüsse, Objekte pro Pflanzengruppe und Zeichenreihenfolge, Randabstand, Zoom in zwei Schritten (4.6), Untersuchen-Fenster (4.9), Feature-Flag | `src/terrain*.ts` (neu), Verdrahtung in `render.ts`, `tilecache.ts`, `panels.ts`, `app.ts` | A0; zeichnet bis A3–A6 gegen den Platzhalter-Atlas |
| A3 | Assets kalt | Eis, Meereis, Schnee, Fels, Flechten, Tundra, Nadelwald + Objekte | `tools/terrain/cold.js` | A0 |
| A4 | Assets gemäßigt | Rohboden, Moos, Farnflur, Steppe, Wiese, Gebüsch, Wald + Objekte | `tools/terrain/temperate.js` | A0 |
| A5 | Assets warm | Sand, Felswüste, Halbwüste, Savanne, Regenwald + Objekte | `tools/terrain/warm.js` | A0 |
| A6 | Assets nass | Schlamm, Sumpf, Sumpfwald, Uferkanten-Säume, Rippel + Objekte (Fluss-Sprites später durch Linien des Renderers ersetzt) | `tools/terrain/wet.js` | A0 |
| A7 | Review (unabhängig) | Screenshots; Probe-Messwerte gegen 3.7 und 3.8; Prüfliste gegen die Abnahmekriterien; Bericht mit Mängeln | nur lesen, Bericht in `docs/landschaft-2026-10/` | A1–A6 |

**Ablauf:**
1. A0 läuft allein (kurz).
2. Danach laufen A1, A2 und A3–A6 parallel in getrennten Dateien. Asset-Agenten prüfen ihre Arbeit ausschließlich mit `--sheet`/`--check` und ändern nur ihre Familien-Datei.
3. Ich integriere, erzeuge den Atlas, baue und lasse `npm test` laufen.
4. Dann folgt A7.
5. Danach Rückbau des Legacy-Pfads, Abschlussbericht (`docs/landschaft-2026-10/bericht.md` mit Vorher/Nachher) und Doku-Pflege (`AGENTS.md`, `assets/README.md`, `evolution.md` Abschnitt Biome).

**Screenshots für A7:**
- 4 Weltalter (Silur ~430 Mio., Karbon ~310 Mio., Kreide ~100 Mio., Neogen ~20 Mio. Jahre)
- je 2 Seeds
- Desktop 1920 × 1080 sowie Telefon 390 × 844 per CDP-Emulation
- je Zoomstufe 1× und 3×
- dazu `?terrain=legacy` als Vorher-Bild

## 8. Abnahmekriterien (prüfbar)

| Kriterium | Prüfung |
|---|---|
| Große Klimazonen statt Flickenteppich | Zielwerte 3.7 und Breitenprofil 3.8 im Probe; Screenshots |
| Keine Kachelgrenzen innerhalb eines Bioms | Screenshot 3× einer großen Fläche: keine Kachelkanten, keine sichtbare 4-Kachel-Periode |
| Keine harten Kanten zwischen Biomen und zu Wasser | Kontaktblatt-Übergangsmatrix aller Paare; Küsten- und Fluss-Ausschnitte |
| Sukzession sichtbar | Test „Fels bis Wald in Stufen“; Bildserie einer gerodeten Fläche in der Technologie-Skala; Weltalter-Serie Moos → Farnflur → Wald → Wiese |
| Geschlossene Wälder, natürliche Ränder | Screenshot: überlappende Kronen innen, Mantel aus Büschen am Rand |
| Tiere überall lesbar | Kontaktblatt aller Tiersymbole auf allen Materialien (wie `species-sheet.js`); Review-Urteil |
| Pixelgenau | ganzzahlige Vielfache scharf; dazwischen gleich große Pixel ohne Flimmern beim Zoomen und Verschieben (Bildfolge); Prüfung im headless Chrome bei devicePixelRatio 1, 1,25, 2 und 3 |
| Pflanzen erkennbar | Kontaktblatt aller 14 Gruppen; Untersuchen-Fenster zeigt je Gruppe ein Sprite oder einen Ausschnitt |
| `file://` funktioniert | `index.html` direkt von der Platte, kein `fetch`, keine Konsolenfehler |
| Leistung | Tick ≤ +1,5 ms; Neuzeichnung ≤ 30 ms / ≤ 120 ms (4.7) |

## 9. Risiken

- **Klima-Faktor (6.1):** verschiebt den Evolutionsverlauf (Lebensraum-Bedingungen im Baum, Zeitleisten-Tests). Gegenmittel: eigener Regler, Probe-Zeitleiste vorher/nachher.
- **Paletten-Compositor auf schwachen Handys:** Gegenmittel: Chunk-Cache, Neukomposition nur bei geänderter Signatur, Messung vor dem Rückbau.
- **Geglättetes Verkleinern zwischen den ganzzahligen Stufen (6.4):** wirkt minimal weicher als scharfe Pixel. Gegenmittel: weltfestes Zwischenbild, gleichbleibendes Verhältnis, Prüfung per Bildfolge.
- **Nur headless Chrome geprüft:** Firefox, Safari und echte Touch-Geräte brauchen einen manuellen Test.

## Quellen

- SimEarth-Handbuch (Maxis 1990), Biome und Präferenztabelle: https://www.freegameempire.com/games/SimEarth/manual
- Biome, Whittaker- und Walter-Klassifikation: https://en.wikipedia.org/wiki/Biome
- Primäre Sukzession: https://www.jove.com/v/19049/primary-succession
- Dual-Grid und Autotiling: https://www.redblobgames.com/articles/autotile/gemini/autotiling.html · https://www.boristhebrave.com/2023/05/31/quarter-tile-autotiling/ · https://excaliburjs.com/blog/Dual%20Tilemap%20Autotiling%20Technique
- Erddaten der Pflanzengruppen: `EARTH_DATES_MA` in `src/calendar.ts` (geprüft in `docs/ueberarbeitung-2026-10/quellenpruefung.md`)
