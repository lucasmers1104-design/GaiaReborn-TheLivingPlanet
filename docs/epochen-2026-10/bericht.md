# Start: Erde mit Epoche

Stand: 14. 10. 2026. Umgesetzt sind die Epochen „Junge Erde“ und „Heute“. Weitere Epochen sind in Abschnitt 6 vorgeschlagen.

## 1. Was der Spieler sieht

Auf dem Startbildschirm und im Dialog „Neuer Planet“ gibt es eine neue Auswahl:

- **Zufälliger Planet:** wie bisher, mit dem Regler für Meer und Land.
- **Erde:** Darunter steht die Epoche zur Wahl, **Junge Erde** oder **Heute**. Ein Satz erklärt die gewählte Epoche.
  Der Meer-Regler verschwindet, weil die Epoche ihr eigenes Meer mitbringt. Bei „Heute“ verschwindet auch
  „Anderer Planet“, denn die echte Erde gibt es nur einmal.
- Die Wahl wird wie der Meeranteil in den Einstellungen gemerkt.

![Startbildschirm, Erde – Heute](start-heute.png)
![Startbildschirm, Junge Erde](start-junge-erde.png)
![Telefon, 390 px](start-telefon.png)
![Dialog „Neuer Planet“](dialog-neuer-planet.png)

**Lesart (bitte bestätigen oder korrigieren):** Eine Epoche legt die Kruste fest, also Kontinente, Gebirgsgürtel
und Vulkangürtel, dazu die Regler der Geosphäre, mit denen das Spiel beginnt. Kalender, Atmosphäre und
Evolutionsbaum beginnen bei jeder Epoche gleich: im Hadaikum und ohne Leben. Bei „Heute“ entwickelt sich das
Leben also auf den heutigen Kontinenten noch einmal von vorn. Eine Epoche, die mit dem Leben und der Luft
ihrer Zeit startet, wäre ein eigener, größerer Schritt (Abschnitt 6.2).

## 2. Heute: die echten Kontinente

![Spiel, Epoche Heute, Europa](spiel-heute-europa.png)

### 2.1 Daten

- Quelle: NOAA **ETOPO1** (Ice Surface, also mit der Oberfläche der Eisschilde), frei nutzbar und weitergebbar.
- Das Werkzeug `tools/earth-map.js` liest ETOPO1 alle 10 Bogenminuten (2160 × 1081 Punkte) und mittelt auf das
  Kartenraster 256 × 128. Eine Kachel ist 1,4° groß, am Äquator rund 156 km.
- Ergebnis ist `src/earthmap.ts` (generiert, 88 KB). Es enthält je Kachel ein Byte Höhe bzw. Tiefe
  (Wurzelstufen, fein nahe dem Meeresspiegel) und ein Byte Relief (Streuung der Höhen in der Kachel).
- Die Regeln pro Kachel:
  - Land, wenn mindestens die Hälfte der Punkte über dem Meer liegt.
  - Eine einzeln liegende Insel bleibt schon ab einem Fünftel Land erhalten (55 Kacheln, z. B. Hawaii, Inseln im Pazifik).
  - Landbrücken (32 Kacheln): Land, das in den 10′-Punkten zusammenhängt, auf dem Raster aber zerfällt, wird über
    die Meerkacheln verbunden, durch die es tatsächlich verläuft – über die mit dem meisten Land, mindestens 15 %.
    Eine Brücke, die ein Meer abschneiden würde, wird verworfen. So hängen Mittel- und Südamerika über Panama
    zusammen, Baja California, Kuba, die Malaiische Halbinsel, Java, Sulawesi, Honshu und die Alaska-Halbinsel sind
    je ein Stück, der Golf von Kalifornien bleibt offen und Sizilien eine Insel (Straße von Messina: unter 15 %).
    Vorher zeichnete die Karte Panama nur als diagonale Berührung, also getrennt, und Baja und Kuba in Brocken.
  - Seen und Binnengewässer unter 6 Kacheln werden Land (38 Kacheln). ETOPO1 enthält die Tiefen der Seeböden,
    sonst lägen Teile der Großen Seen unter dem Meeresspiegel und würden zu Meer.
  - Höhe = Mittel der Landpunkte, Tiefe = Mittel der Meerpunkte. Küstenkacheln werden so weder versenkt noch angehoben.
- Kaspisches Meer, Schwarzes Meer, Mittelmeer, Hudson Bay, Ostsee, Japan, Neuseeland, Madagaskar und die
  großen Inseln Südostasiens sind erkennbar.
- Durch das Raster liegen 34 % der Kacheln an Land (wahre Fläche 29 %). Grund: Die Polarzeilen sind so breit
  wie der Äquator. Die Antarktis nimmt deshalb viel Platz ein, und rund ein Drittel des Landes ist Eis.

### 2.2 Gebirge

![Höhe und Gebirgsgürtel (orange), Analysebild](heute-hoehe-guertel.png)

- Die Höhen sind echte Kachelmittel (1,0 = 4,5 km). Tibet erreicht 4,5 km, die Anden 3–4 km, Ostantarktis 3 km.
- Gebirgsgürtel (`uplift`) entstehen dort, wo eine Kachel zerklüftet ist (Relief 250–900 m) **und** über dem Land
  ihrer Umgebung (Radius 6 Kacheln) aufragt. Die Hebung ist wie bei Zufallsplaneten skaliert.
- Gürtel tragen unter anderem Anden, Himalaya, Alpen, Kaukasus, Rocky Mountains, Neuguinea, Zagros, Äthiopisches
  Hochland und Teile des Transantarktischen Gebirges; Japan und die Ketten im Inneren Tibets nur schwach.
- Keine oder fast keine Gürtel tragen die Eisschilde (glatt) sowie Ural, Appalachen und Skandinavien (alt, niedriges Relief).
- Gemessen über 4.900 Ticks ohne Leben bleiben die Gebirge stehen: Land über 2,25 km 20,3 % → 20,4 %,
  über 3,4 km 4,3 % → 4,4 %.

### 2.3 Vulkangürtel

![Mantel-Hitze (Magma), Analysebild](heute-vulkanguertel.png)

- Das Magma-Feld folgt einer Tabelle echter Vulkangürtel in `src/earthtoday.ts`:
  - Pazifischer Feuerring: Anden, Mittelamerika, Kaskaden, Alaska und Aleuten, Kamtschatka, Japan,
    Izu-Bonin-Marianen, Philippinen, Sunda- und Banda-Bogen, Melanesien, Tonga-Kermadec-Neuseeland
  - kleinere Bögen: Kleine Antillen, Süd-Sandwich, Italien, Ägäis
  - Hotspots und Gräben: Island, Hawaii, Yellowstone, Galápagos, Réunion, Kanaren, Azoren, Ostafrikanischer Graben,
    Virunga, Kamerunberg, Erebus
  - schwächer: Mittelozeanische Rücken (Mittelatlantik, Ostpazifik, Indik, Rotes Meer)
- Die Lage ist auf etwa eine Kachel genau (≈ 1,4°). Abseits der Gürtel ist der Mantel kühl, damit Ausbrüche
  dort stattfinden, wo sie hingehören.

### 2.4 Zwei Eichungen

- **Küstenmeer bei 3,5 km Tiefe.** Meeresalgen wachsen im Spiel nur im „lichtdurchfluteten Küstenmeer“
  (Wasser flacher als `COAST_DEPTH`). Gemessen mit dem gierigen Probe, Seeds 12345 und 777, 4.900 Ticks:

  | Grenze | Küstenmeer am Meer | Evolutionsbaum | O₂ 5 % / 10 % bei Tick |
  |---|---|---|---|
  | 1.000 m (Schelf mit Hang) | 14 % | 24 bzw. 25 von 31 | 1.700–2.000 / 3.300 |
  | 2.500 m | 25 % | 19 bzw. 13 von 31 | 1.240–1.730 / 2.820 bzw. nie |
  | **3.500 m** | **41 %** | **31 von 31** | **900–1.100 / 1.600–1.800** |
  | Zufallsplanet (Vergleich) | 48 % | 17 bzw. 31 von 31 | 830–930 / 1.050–1.260 |

  Bei 3,5 km gehören die Kontinentalränder und die flacheren Mittelozeanischen Rücken zum Küstenmeer. Das ist
  weit tiefer als der echte Schelfrand (~200 m), aber nur so spielt sich „Heute“ wie ein Zufallsplanet.
- **Drift 0,25 statt 0,5.** Die Platten sind waagrechte Bänder mit Grenzen am Äquator und bei 45°.
  Bei Standard-Drift würden sie die echten Kontinente über ein Spiel um rund 20° Länge gegeneinander verschieben,
  so bleibt es etwa die Hälfte. Der Regler lässt sich im Spiel frei verstellen.

## 3. Junge Erde

![Junge Erde, Seed 777, Analysebild (orange = Gebirgsgürtel)](junge-erde-hoehe.png)

- Generiert aus dem Seed, denn aus dem Hadaikum sind keine Kontinentformen erhalten. „Anderer Planet“ würfelt
  eine andere junge Erde.
- **85 % Meer** (Zufallsplanet 58 %). Das Land verteilt sich auf viele kleine Urkontinente (feinere Grundoktave
  als beim Zufallsplaneten): über 100 Landmassen, viele davon Vulkaninseln, gegenüber rund 10.
- **Inselbögen:** einige gebogene Ketten aus Vulkaninseln auf flachen Rücken, mindestens 3 Kacheln vor der Küste.
- **Niedrige Gebirge:** vulkanische Hochländer statt Faltengebirge, höchstens etwa 1,3 km Überhöhung
  (Zufallsplanet 3,4 km). Land über 2 km: 4–10 %.
- **Heißer Mantel:** Das Magma-Feld liegt überall höher, die Inselbögen sind am heißesten.
- **Regler zum Start:** Kontinentaldrift 0,8 und Vulkanismus 0,8.
  Die Kernwärme bleibt bewusst bei 0,5: Sie hebt auch die Gebirge, und jeder Wert über 0,5 lässt das
  Magma-Feld überall auf 1 wachsen. Dann verlieren die Vulkane ihre Gürtel.

Messung (gieriger Probe, 4.900 Ticks, Seeds 12345 und 777):

| | Evolutionsbaum | O₂ 5 % bei Tick | Temperatur am Ende |
|---|---|---|---|
| Junge Erde | 30 bzw. 28 von 31 | 340–390 | 28 °C |
| Zufallsplanet | 17 bzw. 31 von 31 | 830–930 | 13 °C |

- Das Leben kommt gut durch, denn das viele Küstenmeer bringt den Sauerstoff früh.
- Die junge Erde bleibt aber das ganze Spiel über warm. Ohne Leben erreicht sie 31 °C bei Vulkanismus 0,5
  und 35 °C bei 0,8. Hauptgrund ist das wenige Land: Weniger Verwitterung bindet weniger CO₂.
  Für das Archaikum ist das vertretbar, für die Gegenwart nicht (Vorschlag 6.3).

## 4. Fachliche Einordnung

| Aussage im Spiel | Bewertung | Befund |
|---|---|---|
| Ozeane früh im Hadaikum | ✅ | Zirkone aus den Jack Hills (~4,4 Mrd. J.) zeigen Sauerstoff-Isotope, die flüssiges Wasser an der Oberfläche verlangen (Wilde et al. 2001; Mojzsis et al. 2001). Die Deutung wird noch diskutiert. |
| Wenig Land, kleine Urkontinente | ⚠️ Spielkompromiss | Nach Flament et al. (2008) ragten bis zum Ende des Archaikums nur 2–3 % der Erdoberfläche (höchstens 12 %) aus dem Meer. Im Spiel sind es 15 %, sonst hätten Landpflanzen und Landtiere kaum Platz. |
| Viel Vulkanismus, heißer Mantel | ✅ | Der junge Mantel war heißer und gab mehr Wärme ab. Es gab mehr Vulkanismus, die Kruste konnte keine hohen Gebirge tragen. |
| Schnelle Plattenbewegung | ⚠️ | Wann Plattentektonik einsetzte (Hadaikum bis Neoproterozoikum), ist umstritten. Das Spiel folgt der Vorgabe „schnelle Platten“. |
| Heutige Kontinente, Gebirge, Vulkangürtel | ✅ | Aus ETOPO1 berechnet bzw. aus den bekannten Vulkanregionen, auf ~1,4° genau. |

## 5. Grenzen

- **Kein Reifen:** Land, Drift und Vulkanismus der Jungen Erde ändern sich im Spiel nicht von selbst. Der Spieler
  kann die Regler der Geosphäre verstellen.
- **Vulkanausbrüche sind selten** (0,04 % je Tick bei Standard). Der Vulkanismus der Jungen Erde zeigt sich
  vor allem im CO₂, im Eisen des Meeres, im Magma-Overlay und in den Inselbögen, kaum in sichtbaren Ausbrüchen.
- **Drift in Bändern:** Auch bei 0,25 verschieben sich die echten Kontinente am Äquator und bei 45° gegeneinander.
  Das löst erst die geplante Überarbeitung der Plattengrenzen.
- **Gebirgstypen** (Falten-, Küstengebirge, Inselbögen) kennt das Spiel noch nicht. `docs/hoehe-spec.md` plant
  sie. Die Erde von heute liefert dafür schon die Daten (Relief, Vulkangürtel).
- **Getestet:** nur headless Chrome (Desktop 1440 × 900, Telefon 390 × 844 per Geräte-Emulation). Echte
  Touch-Geräte und andere Browser sind ungetestet.

## 6. Vorschläge für weitere Epochen

### 6.1 Welche Epochen sich lohnen

| Epoche | Zeit | Was sie spielerisch bringt | Kontinente | Aufwand |
|---|---|---|---|---|
| **Pangäa** (Superkontinent) | ~250 Mio. J., Perm/Trias | ein riesiger Kontinent mit trockenem Inneren und Megamonsun; wenig Küste | echt: PALEOMAP PaleoDEM (Scotese & Wright 2018), 1°-Raster, passt fast 1:1 auf die Karte | klein: das gleiche Werkzeug wie für ETOPO, nur eine weitere Datei |
| **Eiszeit** | ~20.000 J. (letztes Glazialmaximum) | Meeresspiegel −120 m: Landbrücken Beringia, Sundaland, Doggerland | echt: dieselben ETOPO1-Daten, nur die Meeresgrenze verschoben | sehr klein |
| **Kreidezeit** | ~90 Mio. J. | hoher Meeresspiegel, warme Binnenmeere (Western Interior Seaway) | echt: PaleoDEM | klein |
| **Kambrium / Gondwana** | ~540 Mio. J. | passt zur Kambrischen Explosion im Evolutionsbaum; Vorbild im Original: „Earth: Cambrian Era“ | echt: PaleoDEM | klein (Karte), groß mit Leben (6.2) |
| **Rodinia** | ~900 Mio. J. | ein älterer Superkontinent | Rekonstruktion unsicher, deshalb erdähnlich generieren wie die Junge Erde | mittel |
| **Schneeball-Erde** | ~700 Mio. J., Cryogenium | fast ganz vereist, Herausforderung „Auftauen“ | generiert, Eis aus dem Klima | mittel, Klimastart nötig |

**Empfehlung:** als Nächstes **Pangäa** und **Eiszeit**. Beide nutzen echte Daten und sind spielerisch deutlich
anders als „Heute“. Vor Pangäa die Lizenz der PaleoDEM-Dateien prüfen (License.txt im Download). Die Autoren
erlauben die freie Nutzung für Forschung, Vorträge und Veröffentlichungen; eine CC-Lizenz war nicht zu bestätigen.

### 6.2 Offene Entscheidung: Epochen mit dem Leben ihrer Zeit?

Heute beginnt jede Epoche ohne Leben im Hadaikum. Alternativ könnte eine Epoche als Szenario starten:
Kalender auf ihr Datum, passende Luft (O₂, CO₂), schon entwickelte Stufen im Baum und Pflanzen und Tiere auf
der Karte. Das wäre näher am Original („Earth: Modern Day“). Es braucht aber für jede Epoche einen vorbereiteten
Evolutionszustand und Tests, dass Baum, Kalender und Biosphäre daraus sauber weiterlaufen. Das ist ein größerer Schritt.

### 6.3 Vorschlag: die Junge Erde reifen lassen

Bis zum Ende des Archaikums (2,5 Mrd. J.) wachsen die Urkontinente langsam zu normaler Landfläche, und Drift und
Vulkanismus klingen auf Standard ab. Dann kühlt die junge Erde von selbst auf ein gegenwärtiges Klima ab, statt
bei 28 °C zu bleiben. Dafür muss der Spielstand die Epoche kennen (neues Feld, Speicherformat mit Migration).

## 7. Technik

- `src/epochs.ts`: Katalog der Epochen (Texte, Meer, Regler) und `shapeCrust`, das `WorldState.reset` aufruft
- `src/youngearth.ts`: Generator der Jungen Erde
- `src/earthtoday.ts`: Höhen, Gürtel und Vulkangürtel der Erde von heute
- `src/earthmap.ts`: generiert
- `src/planetpicker.ts` + `css/planetpicker.css`: die Auswahl
- `tools/earth-map.js`: neu erzeugen mit `node tools/earth-map.js --fetch --write`, Vorschau mit `--png <datei>`
- Probe: `node tools/headless.js 4900 12345 777 --life --timeline --epoch=today`
- Vorschau: `_preview.html?epoch=youngEarth`
- Tests: `tests/epochs.test.js`, prüft unter anderem bekannte Orte (Sahara, Pazifik, Tibet, Kaspisches Meer),
  Gürtel, Vulkangürtel, Speichern und Laden
- `WorldState.reset(seed, oceanShare, epoch)`; Zufallsplaneten entstehen unverändert wie bisher
- Kein neues Speicherformat: Die Kruste steckt ohnehin im Spielstand

## Quellen

- Amante, C. & Eakins, B. W. (2009): ETOPO1 1 Arc-Minute Global Relief Model. NOAA Technical Memorandum NESDIS
  NGDC-24. Abgerufen über [ERDDAP etopo180](https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.html).
- Wilde, S. A. et al. (2001): Evidence from detrital zircons for the existence of continental crust and oceans on
  the Earth 4.4 Gyr ago. Nature 409, 175–178. [doi:10.1038/35051550](https://doi.org/10.1038/35051550)
- Mojzsis, S. J., Harrison, T. M. & Pidgeon, R. T. (2001): Oxygen-isotope evidence from ancient zircons for liquid
  water at the Earth's surface 4300 Myr ago. Nature 409, 178–181.
- Flament, N., Coltice, N. & Rey, P. F. (2008): A case for late-Archaean continental emergence from thermal
  evolution models and hypsometry. EPSL 275, 326–336. [Zusammenfassung](https://ro.uow.edu.au/smhpapers/4538)
- Scotese, C. R. & Wright, N. (2018): PALEOMAP Paleodigital Elevation Models (PaleoDEMS) for the Phanerozoic.
  [EarthByte](https://www.earthbyte.org/paleodem-resource-scotese-and-wright-2018/),
  [Zenodo 5460860](https://zenodo.org/records/5460860)
- Messwerte: eigene Läufe mit `tools/headless.js` und Skripten im Arbeitsverzeichnis, 14. 10. 2026
