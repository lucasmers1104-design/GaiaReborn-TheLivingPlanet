# Spezifikation: Naturkatastrophen – Inszenierung, Ausbreitung, Nachwirkungen

Stand: 14. 10. 2026 · **Entwurf, wartet auf Freigabe** (offene Entscheidungen in Abschnitt 8).

Ziel: Jedes Ereignis beginnt auf genau einer Kachel. Es hat ein Vorzeichen, eine kurze Hauptanimation und breitet
sich danach Tick für Tick nach dem Gelände aus. Zurück bleibt ein echter Bodenzustand, der über die Sukzession
sichtbar heilt. Die Optik ist Pixel-Art in der gemeinsamen Palette, mit Licht von oben links.

**Nicht Teil dieses Schritts:** Biome, Vegetation, Höhe, Tiere und Zivilisation werden nicht umgebaut. Sie werden
nur über ihre Schnittstellen genutzt (Abschnitt 6). Wo eine Schnittstelle fehlt, wird sie minimal ergänzt und dort
genannt.

---

## 1. Ist-Stand (Phase 0)

| Bereich | Heute | Ort |
|---|---|---|
| Auslösung | Werkzeug „Ereignis auslösen“, 50 Ω. Die Zielvorschau ist ein Quadrat mit `EVENT_RADIUS` 4–8, also 9×9 bis 17×17 Kacheln | `app.ts` (`EVENT_RADIUS`, `brushRadius`, `Tool.TriggerEvent`) |
| Berechnung | `EventSystem.trigger` wendet alles in einem Aufruf als quadratischen Pinsel an. Es gibt weder Phasen noch Ausbreitung | `geo.ts`, Klasse `EventSystem` |
| Natürliche Ereignisse | Vulkan 0,0004/Tick an Magma-Maxima, Meteorit 0,00018/Tick überall, Seuche ab `totalCityPop`. Den Atomschlag löst `CivSystem.warfare` über `civEventSink` aus | `geo.ts`, `civ.ts` |
| Darstellung | ein 8×8-Symbol pro Kachel (`EVENT_SPRITES`), 12 Ticks lang (`eventKind`/`eventTtl`), im Grundbild (für Vulkane seit Okt. 2026 entfallen, siehe §2) | `sprites.ts`, `tilecache.ts`, `render.ts` (`drawTileTop`) |
| Zeichenschleife | Das Grundbild (Gelände-Chunks mit eingebackenen Pflanzen, Städte, Marker) wird höchstens alle 250 ms neu gezeichnet. Pro Frame kommen darüber: Herden, Siedler, Wolken und Pings, Cursor | `render.ts` (`EditView.render`) |
| Ticks | feste Schrittweite 2500 / 1000 / 400 / 150 ms je Tempo, höchstens 64 Ticks pro Frame | `app.ts` (`frame`) |
| Pixel-Gelände | Dual-Grid. Bodenschlüssel = Materialrang × 4 + Dichte, dazu 16 Randmasken. Chunks aus 16×16 Kacheln werden nur bei geänderter Signatur neu aufgebaut. Objekte werden zeilenweise sortiert und in den Chunk gebacken. Bäume und Städte ragen ≤ 4 px in die Kachel darüber | `landcompose.ts`, `landfield.ts`, `landobjects.ts`, `landview.ts`, `citylayer.ts` |
| Höhe | `elevation` −1..1, 1 = 4,5 km. Messung Seed 777: Küstenland auf dem Zufallsplaneten im Median 0,015 (≈ 70 m), p90 0,053; Epoche „Heute“ Median 0,065, p90 0,22. Steilster Nachbarhang im Median 0,06 | `world.ts` |
| Bodenzustände | Es gibt keine eigenen. Störungen setzen nur die Landschaft zurück: `burn` → Rohboden, `scour` → Fels ohne Boden, `clear`. Das Material „Schlamm“ gibt es schon, aber nur auf Moor | `succession.ts`, `tools/terrain/catalog.js` |
| Sukzession | ≥ 3 Ticks je Stufe plus Hash-Streuung, in der Zivilisations- und Technikzeit echte Jahre. **Folge:** In der geologischen Zeitskala ist ein Brand nach 10–20 Ticks verheilt, bei „Schnell“ also nach 1,5–3 s | `succession.ts` (`holdTicks`) |
| Wind | `windDirection(y)` zonal ±1, `ClimateSystem.airCurrent(y)` mit Nord-Süd-Anteil | `util.ts`, `climate.ts` |
| Plattengrenzen | 4 waagrechte Platten mit Grenzen bei y = 32 / 64 / 96 | `params.ts` (`PLATE_COUNT`), `geo.ts` |
| Stadtschaden | über das Gitter: `cityPop` senken oder `tech = None`. `reconcileCities` meldet dann „… ist untergegangen“. Eine eigene Schadensfunktion gibt es nicht | `cities.ts` |
| Krankheit | Civ: `epidemic.ts`, Ausbruch nur intern (`breakOut` privat). Die alte Seuche in `geo.ts` bleibt bis zum Merge | `epidemic.ts` |
| Speicher | Format 7. `eventKind`/`eventTtl` werden nicht gespeichert. Die Höhe plant Format 8 (Entwurf), die Civ ändert nichts | `save.ts` |
| Einstellungen | Kein „Effekte reduzieren“. Einzelne Module lesen `prefers-reduced-motion` | `app.ts` (`Settings`), `camerafly.ts`, `herds.ts`, `ambient.ts` |
| Rückmeldung | Text-Meldungen, Karten mit Aktions-Button (Chronik), Kamerafahrt `flyTo`. Das Menü „Zum letzten Ereignis springen“ springt hart, ohne Fahrt | `notify.ts`, `camerafly.ts`, `app.ts` (`gotoEvent`) |

**Wirkung heute** (Radius = Chebyshev-Abstand in Kacheln):

| Ereignis | Radius | Wirkung |
|---|---|---|
| Wirbelsturm | 8 | Feuchte +0,45 überall, Leben −0,25 bis Abstand 4 |
| Flutwelle | 8 | Land mit Höhe 0–0,18: Leben −0,8, Feuchte +0,5, Städte weg bis Abstand 4 |
| Meteorit | 6 | Abstand ≤ 2: Höhe −0,25, alles weg, Fels. Sonst Pflanzen halbiert, Leben −0,5. Staub +0,18, CO₂ +40 |
| Vulkan | 4 | Höhe +0,45 / 0,22 / 0,08. Abstand ≤ 2: alles weg, Fels. CO₂ +25, Staub +0,05 |
| Atomschlag | 6 | alle Städte weg. Abstand ≤ 2: Leben und Pflanzen weg. Staub +0,15 |
| Flächenbrand | 6 | jede Kachel mit Pflanzendecke ≥ 0,12 verbrennt (Bäume weg, Decke × 0,2). CO₂ aus der Biomasse, Staub +0,02 |
| Erdbeben | 6 | Höhe zufällig ±0,1, Städte −0,4 |
| Seuche | 8 | Städte −0,5, Leben −0,35 |

**Warum es wie ein Flächenfilter wirkt:** Alles passiert in einem Tick, als Quadrat und mit gleicher Stärke über
die ganze Fläche. Es gibt keinen zeitlichen Ablauf, keine Geländeregeln und als Bild nur ein Symbol pro Kachel.
Was bleibt, ist ein Landschaftswechsel, der nach wenigen Ticks wieder verschwunden ist.

---

## 2. Architektur

### 2.1 Ablauf eines Ereignisses

```
Anfrage (Spieler · natürlich · Zivilisation · Kette)  →  requestHazard(kind, x, y, cause)
  App:  Vorzeichen in Echtzeit (0,6–1 s), wenn das Feld sichtbar ist; sonst sofort weiter
  →  HazardSystem.start()   Einschlag: sofortige Wirkung, Eintrag in world.hazards      (Simulation)
  →  Hauptanimation 2–4 s Echtzeit                                                     (nur Darstellung)
     parallel: Ausbreitung pro Tick, HazardSystem.step                                 (Simulation)
  →  Nachwirkung: Bodenzustand pro Kachel (scar), heilt über die Sukzession            (Simulation)
```

- **Node** (Tests, Probe): `requestHazard` startet sofort. Der Ablauf ist deterministisch.
- **Spieleraktion:** `app.ts` prüft Kosten und Bedingungen vor dem Vorzeichen (`spend()`, Grund bei Ablehnung).
- **Pause:** Vorzeichen und Hauptanimation laufen in Echtzeit weiter. Die Ausbreitung wartet auf den nächsten Tick.
- **Zufall:** Hash-Würfe aus Seed, Ereignis-Id, Tick und Kachel, nie `world.rng`. So verschiebt ein Ereignis nicht den
  Zufallsstrom der übrigen Simulation.
- **Hohe Geschwindigkeit:** Die Ausbreitung macht genau einen Schritt pro Tick, bei „Schnell“ also ≈ 7 Schritte/s.
  Die Hauptanimation läuft in Echtzeit und wird nicht schneller.

### 2.2 Simulation (Node-fähig, neue Dateien)

| Datei | Inhalt |
|---|---|
| `hazards.ts` | Typen, Liste `world.hazards`, `HazardSystem` (start, step, Grenzen, Kettenregel), gemeinsame Helfer (Leben, Pflanzen, Stadt treffen) |
| `scars.ts` | Bodenzustände: Arten, Heilregeln, Haltefaktoren für die Sukzession (Abschnitt 4) |
| `hazardfire.ts` | Feuer-Zellautomat, auch für die Ketten von Vulkan, Meteorit und Atomschlag |
| `hazardlava.ts` | Vulkan: Kegel, Lavastrom, Abkühlung |
| `hazardimpact.ts` | Meteorit, Atomschlag |
| `hazardflood.ts` | Auflaufen, Stehen und Abfließen des Wassers (Flutwelle und Sturmflut), Schlamm |
| `hazardwater.ts` | Flutwelle (Distanzfeld), Wirbelsturm (Zugbahn, Nässe, Windwurf, Sturmflut) |
| `hazardtornado.ts` | Tornados beim Landgang eines Wirbelsturms |
| `hazardquake.ts` | Erdbeben (Riss, Versatz, Erdrutsch) |
| `hazardchain.ts` | Kettenreaktionen (§3.9) |
| `hazardplague.ts` | Seuche (Stufe 2, über die Civ-Schnittstelle) |

Die Klasse `EventSystem` in `geo.ts` behält nur die natürlichen Würfe und leitet sie an `requestHazard` weiter.
Ihre Pinsel-Funktionen entfallen.

**Stand Oktober 2026 (Vulkan):** Natürliche Ausbrüche laufen über `hazardSink` (`geo.ts`, gesetzt in `app.ts`)
durch das `HazardSystem`. Der Schlot rückt auf den höchsten Landpunkt im Umkreis 2 (`EventSystem.coneTile`), auf
offener See bleibt er, wo er ist. Das 8×8-Symbol und der 9×9-Tafelberg des alten Pinsels gibt es für Vulkane nicht
mehr; ohne `hazardSink` (Headless-Läufe) bleibt der alte Pinsel. Der Kegel ist Relief der Karte
(`hoehe-spec.md` §3.8).

**Felder pro Kachel** (`world.hazards`, Klasse `HazardState` in `hazardstate.ts`; gespeichert und mit der Drift
erst nach dem Merge der Höhen-Aufgabe, K1):

| Feld | Typ | Bedeutung |
|---|---|---|
| `scar` | u8 | Bodenzustand (Abschnitt 4), 0 = keiner |
| `scarAge` | u8 | Ticks seit Entstehung, bleibt bei 255 stehen |
| `scarFrom` | u8 | Sukzessionsstufe der Kachel vor dem Ereignis; die Narbe heilt höchstens bis dorthin |
| `scarNext` | u8 | Narbe, die beim selben Alter übernimmt, wenn die obere endet (Fallout unter Asche) |
| `tile` | u8 | aktiver Zustand: 0, Brennt, Lava, Flut, Nass, Trümmer |
| `level` | u8 | Stärke, Temperaturstufe, Wassertiefe oder Restticks |

**Ereignisliste** `world.hazards`: Id, Art, Ursprung, Ursache (Spieler, natürlich, Zivilisation, Kette), Starttick,
Alter, Phase, `chainUsed` und artspezifische Daten: Lava-Budget und Front, Ankunftsfeld der Welle (dünn besetzt,
zu Beginn bis ≈ 2900 Einträge, schrumpft mit der Front), Position, Stärke und Bahn des Sturms, Risslinie.

### 2.3 Darstellung (neue Dateien)

| Datei | Inhalt |
|---|---|
| `fxatlas.ts` | **generiert:** Effekt-Sprites als indiziertes PNG (data URI, läuft über `file://`) und Manifest (Frames, Anker, fps, Spiegelsätze) |
| `fxlayer.ts` | Effektebene: Pässe, Sortierung, Verdecker, Sichtbarkeit |
| `fxground.ts` | animierte Bodenzustände (Lava, Glut, Flutwasser, Nässe) im Dual-Grid mit denselben Randmasken. Sie werden pro Tick in 4 Frames vorkomponiert, nicht pro Frame |
| `fxparticles.ts` | Partikel-Pool (Struct of Arrays, höchstens 384, Objekte werden wiederverwendet) |
| `fxrings.ts` | pixelgenaue Kreise (Mittelpunkt-Algorithmus) im Kunstpixelraster |
| `fxshow.ts` | Drehbuch je Ereignis: Vorzeichen, Hauptanimation, örtliches Wackeln, Blitz, Meldung und Sprung |

**Pässe pro Frame, in dieser Reihenfolge:**

1. Grundbild wie heute: Gelände mit Bodenzuständen, Städte.
2. Örtliches Wackeln: Die Kacheln um das Epizentrum werden versetzt aus dem Grundbild neu kopiert
   (±1–2 Kunstpixel, stufig). Der Bildschirm selbst wackelt nie.
3. Boden-Effekte (`fxground`): Lava, Glut, Flutwasser mit Schaumkante, Nässe.
4. Herden und Siedler wie heute.
5. Objekt-Effekte, sortiert nach Fußzeile und x: Flammen, Ausbruchssäule, Pilzwolke, Trichter, Wellenkämme. Nach jedem
   Sprite folgen seine **Verdecker**: Bäume und Städte, deren Fuß in der Zeile darunter liegt, beschnitten auf das
   Sprite-Rechteck. Sie stehen vorn und müssen das Sprite überdecken.
6. Ringe und Partikel (Glut, Funken, Trümmer, Regen).
7. Umgebung wie heute: Wolken, Pings.
8. Oben: Rauchfahnen, Aschewolke, Staubwolke, Wirbelsturm, örtlicher Blitz.
9. Cursor.

**Skalierung:** wie Gelände und Städte. Die Kunst liegt bei 1× vor (16 px je Kachel). Jedes Sprite wird einmal k-fach
vergrößert (nächster Nachbar) zwischengespeichert und dann weich auf die Kachelgröße gebracht. Partikel und Ringe
sind Rechtecke im Kunstpixelraster der aktuellen Zoomstufe.

**Verboten in der Effektebene:** `rotate`, `filter`, `shadowBlur`, Alpha-Verläufe. Ausgeblendet wird über gerasterte
Auflöse-Frames. Ein Test prüft die Quelltexte darauf.

**Sichtbarkeit:** Ereignisse außerhalb des Ausschnitts (plus Überhang) werden nicht gezeichnet und erzeugen keine
Partikel. Ihr Drehbuch läuft zeitbasiert weiter.

**Bodenzustände** (umgesetzt in Stufe 1, anders als zuerst geplant):

- **Gelände:** `TerrainField.refresh` blendet auf Kacheln mit frischer Narbe die alten Objekte aus. Basalt, Schutt und
  Schlamm zeichnet das Gelände selbst (`scarGround` in `hazardadapter.ts`). Basalt und Schutt liefert später die
  Höhen-Aufgabe.
- **Effektebene:** Alle übrigen Narben-Böden zeichnet der Boden-Pass der Effektebene (`GROUND_LAYERS` in
  `fxground.ts`): verbrannt, versengt, Asche, Kraterboden, der fahle Fallout-Schleier, Flut, Nässe, Glut und Lava.
  - Er nutzt dieselben Randmasken und dieselbe Variante je Zelle wie das Gelände. Die Pflanzen liegen darüber.
- **Objekte** der Narben (verkohlte Stämme, Treibgut, umgestürzte Bäume, Ruinen, Risse, Kraterränder) sind
  Effekt-Sprites, je Kachel per Hash gesetzt (`fxscars.ts`).
- **Grund:** Der Gelände-Atlas gehört der Landschafts- und der Höhen-Aufgabe. Die Katastrophen fassen ihn nicht an,
  ihre Narben brauchen dort keine eigenen Ränge.

### 2.4 Effekt-Styleguide (Kurzfassung)

Die ausführliche Fassung entsteht in Stufe 1 als `docs/ereignisse-2026-10/stil.md`.

- **Palette:** Es gibt nur eine Palette, `tools/terrain/palette.js`. Der Lead ergänzt 4 Rampen:
  - `ember` 5 Stufen (tiefrot bis fast weiß)
  - `smoke` 4 Stufen (kühles Grau)
  - `basalt` 3 Stufen (fast schwarz, bläulich)
  - `pale` 2 Stufen (fahles Gelbgrün)

  Das sind +14 Farben, zusammen 89, dazu kommen die Farben der Höhe.
- **Leuchten** entsteht aus einer hellen Rampenstufe innen und einer dunkleren am Rand. Keine Halbtransparenz, kein
  Weichzeichner.
- **Licht von oben links**, auch bei Rauch und Wolken: Lichtkante oben links, Schattenseite unten rechts.
- **Größen** in 8-px-Schritten: 16×16, 16×32, 32×32, 32×48, 48×48. Ausnahme sind kachelgebundene Objekte, die wie
  Bäume und Städte gebaut sind: 16×20 und 16×24, also 4 bzw. 8 px Überhang nach oben.
- **Anker:** Senkrechte Effekte stehen unten mittig auf der Kachel (der Fuß ist die letzte Zeile). Flächige Effekte
  liegen mittig auf der Kachel.
- **Animation:** 4–8 Frames mit 10 fps (8–12), stufig.
- **Drehen nie zur Laufzeit.** Jede Richtung ist ein eigener Frame.
- **Spiegeln im Generator:** Erst wird die Form gespiegelt, dann wird das Licht oben links neu angewendet. Eine
  Laufzeit-Spiegelung würde das Licht nach oben rechts drehen. Zur Laufzeit gespiegelt werden nur Sprites mit
  symmetrischem Licht (Flammen, Funken, Glut).
- **Kontur:** selektiv wie bei den Landschaftsobjekten. Rauch bekommt keine harte Außenkontur, aber eine Lichtkante.
- **Erzeugung aus Rezepten, nie von Hand:**
  - Effekte: `tools/fx-atlas.js` mit `tools/fx/` (catalog, fire, volcano, impact, water, earth). Ausgabe nach
    `assets/fx/atlas.png` und `src/fxatlas.ts`.
  - Bodenzustände und ihre Objekte gehören zum Gelände-Atlas, als neue Familie `tools/terrain/hazard.js`.
- **AGENTS.md:** Die Regel „Nur die Landschaft ist PNG“ wird um die Effekte erweitert.

---

## 3. Die Ereignisse

**Übersicht** (Reichweite = Chebyshev-Abstand vom Auslösefeld):

| Ereignis | Auslösefeld | Max. Reichweite | Ausbreitung | Nachwirkung | Heilung, mind. |
|---|---|---|---|---|---|
| Vulkanausbruch | Land oder Schelf | 6 | Lavastrom bergab, ≤ 12 Kacheln | Basalt, Schlot mit Krater | 20 Ticks nackt; Schlot bleibt |
| Meteorit | überall | 2 (Bild 4) | keine; Staubwolke nur Bild | Krater, versengter Ring | 8 / 30 Ticks |
| Flächenbrand | Land mit Pflanzendecke | 10, ≤ 90 Kacheln | Zellautomat | verbrannte Erde, Stämme | 8 Ticks bis Gras |
| Wirbelsturm | überall | Bahn ≤ 24, Streifen 5 breit | Zugbahn 1 Kachel/Tick | Windwurf, nass, Schlamm | 10 Ticks |
| Flutwelle | Meer | 32 übers Wasser (schwächere Wellen weniger), 6 landeinwärts | Wellenfront, Auflaufen | Schlamm, Treibgut | 10 Ticks |
| Erdbeben | überall | 4 | Erdrutsche 1–3 Ticks | Riss, Schutt, Ruinen | 30 / 10 Ticks |
| Atomschlag | überall | 3 + Fahne 3 | Fallout mit dem Wind | Asche, fahle Zone | 150 Ticks |
| Seuche | Stadt | Nachbarstädte ≤ 14 | Civ-Seuchenregeln | Bevölkerungsverlust | – |

In den Sprite-Tabellen bedeutet **Ebene** den Pass aus 2.3 und **Stufe** die Umsetzungsstufe (Abschnitt 7).

### 3.1 Vulkanausbruch (Referenz, in Stufe 1 vollständig)

- **Auslösefeld:** jedes Feld. Auf dem Schelf (Wasser flacher als `COAST_DEPTH`) baut der Ausbruch eine Insel, in der
  Tiefsee steigt nur Dampf auf (K5).
- **Vorzeichen (1,0 s):** 2–3 Rauchwölkchen steigen auf, die 3×3 Kacheln beben leicht (±1 Kunstpixel).
- **Hauptereignis (3 s):**
  - Ausbruchssäule mit Lavafontäne.
  - Glutpartikel fliegen ballistisch (≤ 40).
  - Die Aschewolke löst sich ab und treibt mit `airCurrent`. Nach 6–10 s ist sie über Auflöse-Frames verschwunden.
- **Start-Tick:**
  - Kegel über `raiseCrust`: Gipfel +0,20 (≈ 900 m), Ring 1 +0,06.
  - Die Gipfelkachel wird zum Bodenzustand **Schlot**: dauerhaft ein Berg mit Krater. Leben, Pflanzen und Stadt sind
    dort weg.
  - Liegt der Gipfel nach dem Heben über Null, entsteht eine Vulkaninsel (K5).
- **Ausbreitung, ein Schritt je Tick:**
  - Budget 6–12 Lavakacheln (per Hash; × 1,5 bei hohem Magma), höchstens 6 Kacheln vom Schlot.
  - Jede Frontkachel fließt zum tiefsten ihrer 8 Nachbarn, wenn er tiefer liegt. Liegt ein zweiter fast gleich tief
    (≤ 0,01), verzweigt sich der Strom (per Hash, höchstens 2 Arme). Ohne tieferen Nachbarn staut sich die Lava und
    füllt gleich hohe Nachbarn, sonst endet der Strom.
  - Wasser stoppt die Lava, es steigt eine Dampfwolke auf. Am Ufer baut Lava höchstens 2 Kacheln neues Land (K5).
    Flüsse werden überflossen.
  - **Abkühlen** jeder Lavakachel: glühend orange 3 Ticks → dunkelrot 3 → schwarze Kruste mit Glutrissen 4 →
    Basalt. Ab dann ist sie Bodenzustand, Landschaft Fels, Boden 0.
  - Auf Lava: Leben 0, Pflanzen 0. Städte werden verschüttet (keine Ruine).
- **Nachwirkung:**
  - Basalt (frisches Vulkangestein): mindestens 20 Ticks nackt, dann Flechten → Moos → Sukzession wie gehabt.
  - Der Schlot bleibt als ruhender Vulkan. Seine Flanken wachsen zu, und er raucht gelegentlich (per Hash alle
    20–40 s Echtzeit ein Wölkchen). Natürliche Ausbrüche bevorzugen bestehende Schlote.
- **Simulation:**
  - CO₂ +25, Staub +0,05, wie heute (K6).
  - Städte bis Abstand 2 verlieren 15 % durch Ascheregen.
  - Kette (Stufe 2): Grenzt Lava an trockene Vegetation, beginnt dort einmalig ein Flächenbrand.

| Sprite | Größe | Frames | Ebene | Stufe |
|---|---|---|---|---|
| Rauchwölkchen (wird geteilt) | 8×8 | 4 | oben | 1 |
| Ausbruchssäule mit Lavafontäne | 32×48 | 6 (Stufe 2: 8) | Objekt | 1 |
| Aschewolke | 48×32 | 4 + 3 Auflösen | oben | 1 |
| Lava, nahtlose Textur mit Randmasken | 64×64 | 4 | Boden-Effekt | 1 |
| Kruste mit Glutrissen | 64×64 | 2 | Boden-Effekt | 1 |
| Dampfwolke | 16×16 | 4 | oben | 1 |
| Glut | 1 px | – | Partikel | 1 |
| Basalt (Material, mit der Höhe geteilt) | 64 | – | Gelände | 1 |
| Schlot: Kegel mit Krater (Objekt) | 24×24 | 2 Varianten: frisch, bewachsen | Gelände | 1 |
| Lavaspritzer, Aschefall | 8×8, 1 px | 4 | Objekt, Partikel | 2 |

### 3.2 Meteorit

- **Auslösefeld:** überall.
- **Vorzeichen (1,0 s):** Ein Lichtpunkt (2×2 Kunstpixel, flackernd) steht 5 Kacheln oben links über dem Ziel. Am
  Boden wächst ein gerasterter Schatten in 3 Stufen.
- **Hauptereignis (2,5 s):**
  - Der Feuerschweif zieht in 0,5 s diagonal von oben links ins Ziel.
  - Einschlag: örtlicher Blitz (2 Frames), Druckwellenring (Radius 0 → 4 Kacheln in 0,6 s), Trümmer (≤ 48 Partikel).
  - Die Staubwolke wächst, steht und löst sich in 4–8 s auf.
- **Start-Tick:**
  - Ziel: Krater mit Senke −0,06, Fels, Boden 0.
  - Ring 1 wird versengt: Pflanzendecke × 0,2, Bäume weg, Leben −0,8.
  - Ring 2 wird auf der halben Fläche (per Hash) versengt: Pflanzendecke × 0,5, Leben −0,4.
  - Städte bis Ring 1 werden zerstört, in Ring 2 verlieren sie 50 %. Ruinen bleiben nur in Ring 1; eine Stadt auf dem
    Zielfeld wird zum Krater.
  - Die Ringe sind gerundete Abstände mit gehashtem Wackeln (`impactRing`), damit die Narben rund und ausgefranst
    werden statt quadratisch.
- **Ausbreitung:** keine. Die Staubwolke ist nur Bild.
  - Kette (Stufe 2): trockene Vegetation in Ring 2 → Flächenbrand.
  - Im Meer: Wasserfontäne statt Krater; Kette Flutwelle (K4).
- **Nachwirkung:**
  - Krater aus Rand und Senke. Er zählt wie frisches Gestein (E4 der Höhe). Der Boden wächst nach mindestens
    30 Ticks über Flechten zu. Der Rand bleibt rund 200 Ticks und löst sich dann per Hash auf.
  - Versengte Kacheln brauchen mindestens 8 Ticks bis zur Sukzession.
- **Simulation:** Staub +0,18, CO₂ +40, wie heute (K6). Der Impaktwinter bleibt global.

| Sprite | Größe | Frames | Ebene | Stufe |
|---|---|---|---|---|
| Lichtpunkt, Bodenschatten | prozedural, gerastert | 2 / 3 Stufen | oben / Boden-Effekt | 1 |
| Feuerschweif, 45° gezeichnet | 32×32 | 4 | oben | 1 |
| Blitz (mit dem Atomschlag geteilt) | 32×32 | 2, dazu 1 Feuerball ohne Weiß für „Effekte reduzieren“ | oben | 1 |
| Druckwellenring | prozedural | – | Ringe | 1 |
| Staubwolke | 48×48 | 3 Wachsen + 4 Auflösen (Stufe 2: 8) | oben | 1 |
| Trümmer | 1–2 px | – | Partikel | 1 |
| Kraterrand (Objekt) + Kraterboden (Material) | 24×16 / 64 | – | Gelände | 1 |
| versengt (Material, 2 Dichten) + Stumpf (Objekt) | 64 / 8×12 | 3 Varianten | Gelände | 1 |
| Wasserfontäne | 16×32 | 6 | Objekt | 2 |

### 3.3 Flächenbrand

- **Auslösefeld:** Land mit Pflanzendecke ≥ 0,12 (`BARE_COVER`), sonst Ablehnung mit „Hier gibt es nichts, was
  brennen kann.“
- **Vorzeichen (0,8 s):** dünner Rauchfaden, einzelne Funken.
- **Hauptereignis (2 s):** Die Flamme wächst von klein zu groß, Funkenregen.
- **Ausbreitung (Zellautomat, ein Schritt je Tick):**
  - Brennstoff b = Pflanzendecke × 1,0 mit Gehölz bzw. × 0,6 ohne. Eine Kachel brennt 2–4 Ticks, je nach b.
  - Zündchance auf jeden der 8 Nachbarn: p = 0,55 · b · Trockenheit · Wind, diagonal × 0,7.
    - Trockenheit = clamp(1,2 − 1,4 · Feuchte, 0, 1); über 25 °C × 1,2, unter 0 °C × 0,5.
    - Wind aus `airCurrent`: mit dem Wind × 1,8, quer × 1, gegen den Wind × 0,3.
  - Das Feuer stoppt an Wasser, Flusskacheln, Fels, Eis, Schnee, Wüste, Rohboden, Pflanzendecke < 0,12 und schon
    verbrannten Kacheln. Stadtkacheln brennen nicht, verlieren aber 20 %.
  - Grenzen: höchstens 10 Kacheln vom Ursprung, 90 Kacheln und 40 Ticks.
  - Ist eine Kachel ausgebrannt: Wirkung wie heute (`scorch` + `SuccessionSystem.burn`), Leben −0,7,
    CO₂ += Pflanzendecke · 0,8, Bodenzustand „verbrannt“.
- **Nachwirkung:** verbrannte Erde (Asche, Kohle). Wo Gehölz stand, liegen verkohlte Stämme.
  - Das Material bleibt sichtbar, solange die Landschaft Rohboden ist (mindestens 8 Ticks).
  - Dann kommt Offenland (Gras) mit vereinzelten Stämmen.
  - Mit dem Gebüsch verschwinden die Stämme, dann folgt Wald. Das ist die bestehende Sekundärsukzession.
- **Simulation:** CO₂ aus der tatsächlich verbrannten Biomasse; Staub +0,0003 je Kachel, höchstens +0,02.

| Sprite | Größe | Frames | Ebene | Stufe |
|---|---|---|---|---|
| Flamme (wird geteilt), 3 Größen | 16×20 | 6 (Stufe 1: 4 Frames, 2 Größen) | Objekt | 1 |
| Glut am Boden | 64×64 | 2 | Boden-Effekt | 1 |
| Rauchfahne | 16×32 | 6, Stufe 1 aufrecht, Stufe 2 zusätzlich zwei Neigungen (Generator-Spiegel) | oben | 1 |
| Funken | 1 px | – | Partikel | 1 |
| verbrannt (Material, 2 Dichten) | 64 | – | Gelände | 1 |
| verkohlter Stamm (Objekt) | 8×16 | 3 Varianten | Gelände | 1 |

### 3.4 Wirbelsturm

- **Auslösefeld:** überall. Die Stärke S (1–4) richtet sich nach der Meerestemperatur:
  - ≥ 26 °C → 3
  - 20–26 °C → 2
  - kühler oder über Land → 1
- **Vorzeichen (0,8 s):** Wolkenbänder ziehen sich zur kleinen Spirale zusammen, erste Regenschlieren.
- **Hauptereignis (3 s):**
  - Spiralwolke mit Auge, 8 Drehframes. Auf der Nordhalbkugel dreht sie gegen den Uhrzeigersinn, die Südhalbkugel hat
    einen eigenen Satz (im Generator gespiegelt und neu belichtet).
  - Gerasterter Wolkenschatten nach unten rechts, wie bei den Umgebungswolken.
- **Ausbreitung (Zugbahn, eine Kachel je Tick):**
  - Richtung: unter 30° Breite westwärts (`windDirection`) mit polwärtiger Drift (0,3 Kachel/Tick, Hash-Akkumulator);
    ab 30° biegt er nach Osten um.
  - Stärke: warmes Meer +0,25/Tick bis 4, kühles Meer −0,3, Land −0,8. Er endet bei S ≤ 0 oder nach 24 Ticks.
  - Wirkung je Tick in Auge und Ring 1:
    - Feuchte +0,3, Leben −0,08 · S.
    - Wald bei S ≥ 2: Windwurf (Pflanzendecke × 0,7, umgestürzte Stämme).
    - Städte −4 % · S.
  - In Ring 2: Feuchte +0,15, Zustand „nass“ für 6–10 Ticks (dunkler, gerasterte Pfützen).
  - Landgang bei S ≥ 3: Sturmflut über die Auflaufregel der Flutwelle mit Höhe 0,02 · S. Das trifft nur tiefliegende
    Küsten, die Logik ist dieselbe.
  - **Tornados (Stufe 2, umgesetzt):** Beim Landgang mit S ≥ 3 setzen 1–2 Trichter (per Hash) auf Land in Ring 2 um
    das Auge auf (`hazardtornado.ts`). Jeder zieht 2–4 Kacheln geradeaus landeinwärts, höchstens eine Richtungsstufe
    von der Zugrichtung abweichend, eine Kachel je Tick. Auf seinem Weg: Windwurf ab Landschaftsstufe 3, Leben −0,3,
    Städte −20 %.
- **Nachwirkung:** nasse Kacheln trocknen, Windwurf heilt in 10–16 Ticks, an Sturmflut-Kacheln bleibt Schlamm.
- **Simulation:** Feuchte nur im Bahnstreifen statt heute auf einen Schlag im Radius 8.

| Sprite | Größe | Frames | Ebene | Stufe |
|---|---|---|---|---|
| Spiralwolke mit Auge | 48×48 | 8 je Halbkugel (Stufe 1: 4) | oben | 1 |
| kleine Spirale (Vorzeichen) | 32×32 | 2 | oben | 1 |
| Regenschliere | 1×2 px | – | Partikel | 1 |
| Nässe | 64×64 | 1 | Boden-Effekt | 1 |
| umgestürzter Baum (Objekt) | 16×8 | 3 Varianten | Gelände | 1 |
| Tornado-Trichter | 16×32 | 6 | Objekt | 2 |

### 3.5 Flutwelle

- **Auslösefeld:** Meer (Höhe < 0), sonst Ablehnung mit „Eine Flutwelle beginnt im Meer.“
- **Vorzeichen (0,8 s):** Das Wasser am Feld zieht sich zurück: eine dunklere Scheibe wächst auf 1 Kachel Radius,
  mit hellerem Rand und zurückbleibenden Schaumflecken.
- **Hauptereignis:** Die Scheibe löst sich im Rest des ersten Ticks auf, während die Front losläuft; wo sie den
  Ursprung verlässt, hebt sich kurz das Wasser. Eine Welle aus einem Seebeben beginnt als sich hebende Wasserkuppel,
  eine aus einem Meteoriten als Krater im Meer mit hellem Rand. Danach ist das Bild allein das Ankunftsfeld.
- **Ausbreitung über das Wasser:**
  - Beim Start wird für jede Wasserkachel die Ankunftszeit berechnet, als Laufzeitfeld vom Auslösepunkt (Fast
    Marching mit Achsen- und Diagonalschablone über Wasser, in einem Feld von 65 × 65 Kacheln um den Ursprung;
    Kacheln bis 3 Kacheln um den Ursprung exakt als Kreis). Die Front ist dadurch rund (Abweichung vom Kreis
    ≤ 1,5 %), biegt sich im Flachwasser zur Küste hin (Brechung) und läuft um Inseln herum in deren Schatten (Beugung).
  - Geschwindigkeit nach der Flachwasserformel c ~ √Tiefe: 0,33 Ticks je Kachel in der Tiefsee (< −0,18), darüber
    0,33 · √(0,18 / Tiefe), höchstens 1 Tick je Kachel (ab etwa −0,02). Etwa 0,44 bei −0,1, 0,63 bei −0,05.
  - Energie E = Stärke · 0,93^Weg (Weg = Länge des Laufwegs in Kacheln, Stärke höchstens 1). Die Wellenhöhe an der
    Küste ist H = 0,09 · E (≈ 400 m Spielhöhe, siehe Risiken). Die Welle endet, wo E unter 0,93^32 fällt: volle
    Wellen nach 32 Kacheln Weg, die Welle eines Seebebens (Stärke 0,5–0,75) nach 22–28 Kacheln, nie unter 8.
  - Die Front ist die Linie, an der die Ankunftszeit die laufende Zeit erreicht; das Bild zeichnet sie stufenlos
    zwischen zwei Ticks, einen Tick hinter der Simulation. Ein Tick flutet die Küste, die die Welle in seinem
    Zeitfenster erreicht, mit ihrer genauen Ankunftszeit. Das Ereignis endet 1,5 Ticks nach der letzten Ankunft,
    sobald alles Wasser abgelaufen ist.
    - Ihre Richtung ist das Gefälle des Ankunftsfelds (als Winkel; für Sprites auf 8 Richtungen gerundet).
    - Ihre Höhenstufe hängt vom Ort ab: tief, küstennah (Schelf) oder brechend (grenzt an Land).
  - So kommt die Welle aus jeder Richtung und folgt jeder Küstenform, ohne Sonderfälle.
- **Auflaufen an Land:** Erreicht die Front eine Küstenkachel, läuft die Welle über Land weiter. Der ganze Lauf wird
  beim Küstentreffer geplant: kürzeste Zeit über Land (Dijkstra, diagonal √2, 1 Tick je Kachel), nur über Kacheln,
  die selbst geflutet werden, ab der genauen Ankunftszeit an jeder Küstenkachel, höchstens 6 Landschritte.
  Kacheln, die ein früherer Lauf derselben Welle plant oder auf denen ein anderes Ereignis liegt, bleiben trocken.
  - Jede Kachel bekommt Flutzeit (Küstenankunft + Weg − 1), Abflusszeit und Tiefe. Die Simulation flutet sie im
    Tick dieser Zeit, der Bildschirm zeigt das Wasser pixelweise ab genau dieser Zeit (fließender Rand statt
    Kachelsprüngen).
  - Resthöhe nach k Landschritten (k = Weg aufgerundet): h = H − 0,012 · (k − 1); die erste Landkachel trifft die volle Höhe. Eine Kachel wird geflutet, wenn ihre Höhe unter h liegt.
  - Geschätzt aus den Messwerten in Abschnitt 1, im Probe zu prüfen:
    - flache Küsten (Median 0,015): 3–5 Kacheln
    - Küsten der Epoche „Heute“ (0,065): 1–2 Kacheln
    - Steilküsten (> 0,1): keine
  - Eine geflutete Kachel hat den Zustand Flut (Tiefe = h − Höhe). Nach der letzten Flutzeit des Laufs steht das
    Wasser 3 Ticks, dann läuft sein Rand stetig zum Meer zurück, 0,75 Ticks je Kachel, die fernste zuerst. Den
    Schlamm legt die Simulation einen Tick, bevor der Bildschirm die Kachel trocken zeigt.
  - Darstellung nach Tiefe: tief (Tiefe ≥ 0,03) an der Küste, normal, flach und trüb (< 0,012) im Inland, im
    letzten Tick vor dem Abfließen löst sich das Wasser per Dither in schlammige, braune Rückströmung auf. Am vorrückenden Rand ein 2–3 Pixel breiter Schaumsaum,
    beim Zurückweichen brauner Schaum, danach ein nasser Schimmer, der sich in den Schlamm auflöst (Dither, keine
    Transparenz).
  - Wirkung beim Fluten:
    - Leben −0,8 · t, mit t = 0,4..1 nach der Tiefe.
    - Pflanzen ohne Gehölz weg, Pflanzendecke × 0,4, Feuchte +0,5.
    - Städte −60 % bis −100 % nach der Tiefe; zerstörte Städte werden Ruinen.
- **Nachwirkung:** Schlamm (das vorhandene Material) mit Treibgut, die Landschaft fällt auf Rohboden zurück (der Boden
  bleibt). Nach mindestens 10 Ticks setzt die Sukzession ein.

| Sprite | Größe | Frames | Ebene | Stufe |
|---|---|---|---|---|
| Flutwasser tief, normal, flach und trüb, schlammige Rückströmung: Schaumkante an der Wasserlinie, Randmasken | 4 × 64×64 | 2 | Boden-Effekt | 1 |
| Welle auf dem Meer: die Meerespixel selbst, um Stufen der Wasserleiter (water0–7, ice2–4, white0) verschoben nach dem Abstand hinter der Front – Sog davor, Flanke, Kamm (heller und breiter bei starker Welle und flachem Wasser, Lichtkante oben links), Schaum, der liegen bleibt und sich auflöst, Wellental, zweiter Kamm; Ausblenden mit der Energie per Dither. Herausgezoomt nur eine dünne Kammlinie | prozedural (fxseawave.ts) | – | Boden-Effekt, unter Flut und Küste | 1 |
| Rückzug am Ursprung, Wasserkuppel, Krater | prozedural | – | Boden-Effekt | 1 |
| Treibgut (Objekt) | 8×8 | 3 Varianten | Gelände | 1 |
| brechende Welle an der Küste, 8 Richtungen | 16×24 | 6 | Objekt | 2 |

### 3.6 Erdbeben

- **Auslösefeld:** überall. Die Stärke M ist 3, wenn eine Plattengrenze höchstens 6 Zeilen entfernt ist, sonst 2.
- **Vorzeichen (0,6 s):** Das Epizentrum zittert (±1 Kunstpixel), Staubkörner steigen auf.
- **Hauptereignis (2,5 s):**
  - Die Kacheln im Radius 4 zittern, nach außen schwächer (2 → 1 → 0 px, 12 fps, stufig).
  - 3 Bodenwellen-Ringe (prozedural, gestrichelt, in Staubfarben) laufen bis Radius 4.
  - Staubwolken steigen über Städten und Hängen auf.
  - Der Riss läuft in 0,8 s entlang seiner Linie auf.
- **Start-Tick:**
  - **Risslinie** durch das Epizentrum, Länge 3 / 5 / 7 Kacheln je nach M.
    - Richtung: entlang der Plattengrenze, falls nah (waagrecht); sonst quer zum stärksten Hebungsgefälle
      (Gürtelrichtung); sonst per Hash eine von 4 Richtungen.
  - **Versatz:** Die Kacheln auf einer Seite der Linie steigen um 0,01 · M. Die Riss-Objekte zeigen die Stufenkante.
  - **Städte:** bis Abstand 1 −40 %, Abstand 2–3 −15 %. Zerstörte Städte werden Ruinen, beschädigte zeigen
    8–12 Ticks lang Trümmer und Staub.
- **Ausbreitung (Erdrutsche, 1–3 Ticks):** Kacheln im Radius 3 mit Hang > 0,12 (≈ p85) rutschen mit der Chance
  0,5 · M / 3 (per Hash). Ihre Höhe sinkt um 0,02, der tiefste Nachbar steigt um 0,02. Beide werden zu Schutt:
  Pflanzen weg, Landschaft Fels.
  - Kette (Stufe 2, umgesetzt): Im Meer folgt eine Flutwelle am Epizentrum mit der Stärke 0,25 · M einer vollen Welle
    (M 2: halb, M 3: drei Viertel; 0,5 · M hätte die Welle stärker gemacht als die des Spielers).
- **Nachwirkung:**
  - Riss: hält mindestens 30 Ticks, verschwindet ab Landschaftsstufe 2.
  - Schutt: wie Fels, danach Sukzession.
  - Ruinen.
- **Simulation:** kein Staub und kein CO₂, wie heute.

| Sprite | Größe | Frames | Ebene | Stufe |
|---|---|---|---|---|
| Bodenwellen-Ring | prozedural | – | Ringe | 1 |
| Staubwolke, klein | 16×16 | 5 | oben | 1 |
| Riss (Objekt): 4 Richtungen × Mitte/Ende | 16×16 | – | Gelände | 1 |
| Schutt (Material, mit der Höhe geteilt) | 64 | – | Gelände | 1 |
| Trümmer über der Stadt | 16×12 | 2 | Objekt | 1 |
| Ruine (Objekt, auch für andere Ereignisse) | 16×16 | 3 Varianten | Gelände | 1 |
| Riss mit Abzweigungen | 16×16 | – | Gelände | 2 |

### 3.7 Atomschlag

Er wird zurückhaltend inszeniert: keine Opfer-Darstellung, keine Strahlungssymbole auf der Karte.

- **Auslösefeld:** überall. Die Zivilisation zielt auf eine Stadt des Gegners.
- **Vorzeichen (0,6 s):** Ein Punkt leuchtet kurz am Himmel über dem Feld auf.
- **Hauptereignis (3,5 s):**
  - örtlicher Blitz (2 Frames)
  - Druckwellenring bis Radius 3
  - Pilzwolke steigt auf: Feuerball, Stiel, Hut, dann Auflösen
  - kleine Flammen auf Ring 2
- **Start-Tick:**
  - Ring ≤ 1: Leben 0, Pflanzen 0, Städte zerstört (ohne Ruinen: eine Kachel trägt eine Narbe, hier die Asche),
    Bodenzustand Asche. Der Fallout wartet unter Asche und Versengung (`scarNext`) und übernimmt, wenn sie heilen.
  - Ring 2: Leben −0,6, versengt, Städte zerstört.
  - Feuerring: Zustand „Brennt“ für 2 Ticks auf Ring 2, wo es Brennstoff gibt. Er breitet sich nicht aus.
- **Ausbreitung:** Die Fallout-Zone umfasst Ring ≤ 3 und eine Fahne von 3 Kacheln mit dem Wind. Dort ist der
  Bodenzustand Fallout, und das Leben verliert in den ersten 20 Ticks 0,02 je Tick.
- **Nachwirkung:** Asche im Zentrum, fahler Farbton in der Zone. Sie heilt sehr langsam: Die Sukzession braucht dort
  die vierfache Haltezeit. Fallout endet frühestens nach 150 Ticks und löst sich dann per Hash über rund 50 Ticks auf.
- **Simulation:** Staub +0,15, wie heute (K6).

| Sprite | Größe | Frames | Ebene | Stufe |
|---|---|---|---|---|
| Lichtpunkt | prozedural | 2 | oben | 1 |
| Blitz (geteilt, siehe Meteorit) | 32×32 | 2 | oben | 1 |
| Pilzwolke | 32×48 | 5 (Stufe 2: 8) | Objekt | 1 |
| Druckwellenring | prozedural | – | Ringe | 1 |
| Asche (Material) | 64 | – | Gelände | 1 |
| fahler Film (Land-Überlagerung) | 64 | – | Gelände | 1 |

### 3.8 Seuche (Stufe 2, nach dem Civ-Merge)

Die Seuche kommt schleichend, ohne Vorzeichen und ohne Hauptanimation.

- **Auslösefeld:** eine Stadt oder eine Kachel höchstens 2 von einer Stadt entfernt, sonst Ablehnung mit „Eine Seuche
  braucht eine Stadt.“
- **Start:** `startOutbreak(world, city)` (die Civ-Schnittstelle, heute privat als `breakOut`). Es gelten dieselben
  Regeln wie bei natürlichen Seuchen:
  - Bevölkerung −25 %, dann −3 % je Tick über 5 Ticks.
  - Übersprung auf Nachbarstädte bis 14 Kacheln mit 3 % je Tick.
  - Danach ist die Stadt 150 Ticks immun.
  - Tiere auf der Stadtkachel und den Nachbarn verlieren 0,15.
- **Darstellung:**
  - Die betroffene Stadt pulsiert in einem fahlen Farbton: eine gerasterte `pale`-Überlagerung des Stadtbilds,
    2 Frames, etwa 1 Hz.
  - Darüber steht eine kleine Markierung.
  - Springt die Seuche über, erscheint 1,5 s lang eine gestrichelte Pixellinie zwischen den beiden Städten.
- Die alte Seuche in `geo.ts` entfällt (so steht es schon in der Civ-Spezifikation, 2.7).

| Sprite | Größe | Frames | Ebene | Stufe |
|---|---|---|---|---|
| Seuchen-Markierung | 8×8 | 2 | oben | 2 |
| fahle Stadt-Überlagerung | prozedural aus der Stadtmaske | 2 | Objekt | 2 |
| Verbindungslinie | prozedural | – | Ringe | 2 |

### 3.9 Kettenreaktionen (Stufe 2; Stufe 1 legt nur den Platz an)

- Erdbeben im Meer → Flutwelle am Epizentrum.
- Lava eines Vulkans oder Ring 2 eines Meteoriten neben trockener Vegetation (Pflanzendecke ≥ 0,35, Feuchte < 0,4)
  → Flächenbrand.
- Vorschlag K4: Meteorit ins Meer → Flutwelle statt Brand.
- Höchstens eine Folge je Ereignis (`chainUsed`). Folgeereignisse lösen selbst nichts mehr aus (`cause = 'chain'`).

---

## 4. Bodenzustände (Nachwirkungen)

Ein Bodenzustand liegt kachelgenau in `scar`. Er wird mit den Randmasken des Geländes gezeichnet, also mit weichem
Übergang, und optional mit Objekten (wie, steht in 2.3). Er heilt über die Sukzession und gibt sie frei, sobald er
endet.

| Zustand | entsteht durch | Gelände | Sukzession | endet, wenn |
|---|---|---|---|---|
| verbrannt | Feuer | Material „verbrannt“ + verkohlte Stämme | mind. 8 Ticks, Haltezeit × 2 | Landschaftsstufe ≥ 3; ab Stufe 2 nur noch Stämme |
| versengt | Ring von Meteorit und Atomschlag | Material „versengt“ + Stümpfe | mind. 8 Ticks | Stufe ≥ 2 |
| Basalt | Lava | Material „Basalt“ | mind. 20 Ticks | Boden ≥ Erde-Schwelle oder Stufe ≥ 2 |
| Schlot | Vulkan | Basalt + Kegel mit Krater | – | dauerhaft |
| Krater | Meteorit | Material „Kraterboden“ + Rand-Objekt | mind. 30 Ticks | Boden nach Sukzession; Rand nach ~200 Ticks |
| Schlamm | Flutwelle, Sturmflut | Material „Schlamm“ (vorhanden) + Treibgut | mind. 10 Ticks | Stufe ≥ 2 |
| Windwurf | Wirbelsturm, Tornado | Landschaft bleibt; umgestürzte Bäume ersetzen einen Teil der Bäume | – | nach 10–16 Ticks |
| Riss (4 Arten, je Richtung) | Erdbeben | Riss-Objekt mit Stufenkante | mind. 30 Ticks | Stufe ≥ 2 |
| Schutt | Erdrutsch | Material „Schutt“ | mind. 10 Ticks | Stufe ≥ 1 |
| Ruinen | zerstörte Stadt | Ruinen-Objekt | mind. 20 Ticks | Stufe ≥ 3 oder neue Stadt |
| Asche | Zentrum des Atomschlags | Material „Asche“ | Haltezeit × 4 | Stufe ≥ 2 |
| Fallout | Zone des Atomschlags | Landschaft + fahler Film | Haltezeit × 4 | ≥ 150 Ticks, dann Hash-Auflösung |

- **Rangfolge der Effekt-Böden** (`GROUND_LAYERS`, von unten nach oben): Fallout-Schleier, Asche, versengt, verbrannt,
  Kraterboden, Nässe, Flut, Glut, Lavakruste, dunkelrote Lava, glühende Lava.
- **Mindestticks** (umgesetzt, `SCAR_MIN_TICKS`):

  | Dauer | Bodenzustand | Ticks |
  |---|---|---|
  | kurz | Schlamm | 10 |
  | kurz | Brand, versengt, Windwurf | 12 |
  | mittel | Schutt | 20 |
  | mittel | Risse, Ruinen | 30 |
  | lang | Basalt | 60 |
  | lang | Krater, Asche | 80 |
  | lang | Fallout | 150 |
  | dauerhaft | Schlot | – |
- **Haltezeit:** Die Mindestticks sind sichtbare Spielzeit und gelten in jeder Zeitskala (K3). In der Zivilisations-
  und Technikzeit gilt das Längere von Mindestticks und echten Jahren, die bestehende Regel bleibt.
- **Aktive Zustände** (`hazard`, kein Bodenzustand): Brennt, Lava, Flut, Nass, Trümmer. Sie werden in der Effektebene
  gezeichnet und gehen am Ende in ihren Bodenzustand über.

---

## 5. Zeit, Grenzen und Leistung

- **Echtzeit (Darstellung):** Vorzeichen 0,6–1 s, Hauptanimation 2–4 s, Sprites mit 10 fps, Partikel insgesamt ≤ 384.
- **Ticks (Simulation):** Die Ausbreitung braucht bei „Schnell“ 150 ms je Schritt, bei „Sehr langsam“ 2,5 s.
- **Gleichzeitig:** höchstens 8 aktive Ereignisse.
  - Weitere natürliche Anfragen verfallen.
  - Ein Spieler-Ereignis beendet das älteste; dieses springt in seine Nachwirkung.
- **Deckel je Ereignis:** Bei mehr als 40 brennenden Kacheln gibt es höchstens eine Flamme je Kachel. Ein Brand hat
  höchstens 12 Rauchfahnen.
- **Ruckelfrei:**
  - Die Ausbreitung kostet je Tick nur so viel, wie Kacheln aktiv sind.
  - Boden-Effekte werden pro Tick vorkomponiert, nicht pro Frame.
  - Nur sichtbare Ereignisse werden gezeichnet.
  - Messziel: Effektebene ≤ 3 ms je Frame bei 4 gleichzeitigen Ereignissen (1080p, Headless Chrome), `step` ≤ 2 ms je
    Tick bei 8 Ereignissen (Node).

---

## 6. Schnittstellen zu anderen Systemen

| System | Nutzung | neu oder minimal ergänzt |
|---|---|---|
| Höhe | `raiseCrust(world, i, amount, kind)` aus hoehe-spec §3.2, auch mit negativem Betrag (Krater, Erdrutsch) | Falls die Höhe noch nicht gemergt ist, legt der Lead genau diese Signatur in `src/tectonics.ts` an (begrenzen, `terrainDirty`). Die Höhe erweitert sie später (K1) |
| Sukzession | `burn`, `scour`, `clear` (vorhanden) | **neu, wenige Zeilen in `succession.ts`:** Haltezeit × Faktor des Bodenzustands, Sperre bis zum Mindestalter |
| Gelände-Renderer | Bodenzustand statt Landschaft | **neu:** Verzweigung in `TerrainField.refresh`; Parameter „ohne Schatten“ in `drawLandObjects` (für Verdecker); Land-Überlagerung wie der Algenfilm |
| Gelände-Atlas | neue Materialien, Objekte, Überlagerung | neue Familie `hazard.js`, 4 neue Rampen; Basalt und Schutt werden mit der Höhe geteilt. `--write` macht nur der Lead |
| Städte (Darstellung) | Verdecker, fahle Seuchen-Überlagerung | **neu:** `CityLayer.drawCityAt(ctx, tile, clip)` |
| Zivilisation | Stadtschaden über `cityPop`/`tech` (geht heute schon, `reconcileCities` meldet den Verlust) | nach dem Merge, über den Civ-Lead: `damageCity(world, tile, share, cause)` in `cities.ts`, `startOutbreak` (`breakOut` exportieren), Feld `from` im Ausbruchseintrag für die Verbindungslinie |
| Drift | Bodenzustände fahren mit | 4 Zeilen `rollU8` in `GeoSystem.drift`; Einträge der Ereignisliste verschieben sich mit ihrer Platte |
| `geo.ts` | natürliche Würfe | `EventSystem` leitet nur noch weiter, die Pinsel-Funktionen entfallen. **Erst nach dem Merge des Geologie-Agenten** (K1). Vulkan umgesetzt (Okt. 2026): `hazardSink` + `coneTile` |
| App | Werkzeug, Einstellungen, Meldungen | Pinselradius 0 (genau eine Kachel); Bedingungen und Kosten vor dem Vorzeichen; `hazardSink` (wie `civEventSink`); Einstellung „Effekte reduzieren“ (Standard aus `prefers-reduced-motion`); Meldung beim Start; bei natürlichen Ereignissen eine Karte mit „Zum Ereignis springen“ (`flyTo` + Ping). Das Menü „Zum letzten Ereignis springen“ nutzt künftig die Ereignisliste und die Kamerafahrt |
| Speicher | neue Felder | `SAVE_FORMAT` + 1 (8 oder 9, je nachdem, wer zuerst merged) mit Migration: alte Stände bekommen leere Felder. Gespeichert werden `scar`, `scarAge`, `scarFrom`, `scarNext`, `tile` und `level` (Bytes, Base64) sowie `hazards` als kompakte Liste (K7) |
| Untersuchen-Fenster | Anzeige | zeigt das laufende Ereignis bzw. den Bodenzustand, z. B. „Verbrannte Erde, wächst nach“ (`panels.ts`, 1–2 Zeilen) |
| Alte Marker | – | `eventKind`/`eventTtl` und das 8×8-Symbol bleiben bis Stufe 2 nur für die Civ-Seuche. Alle anderen Ereignisse nutzen sie nicht mehr |
| Tests und Werkzeuge | – | `helpers.js` und `headless.js` setzen `hazardSink` wie `civEventSink`. `landscape.test` (Vulkan) und `sim.test` F06 (Feuer) werden auf das lokale Verhalten umgestellt |

---

## 7. Umsetzung in zwei Stufen, Agenten

### Stufe 1: Fundament und Grundversion

1. **Lead, Fundament:**
   - Datenmodell und Speicher.
   - `HazardSystem` als Gerüst, Anfrage- und Vorzeichen-Weg.
   - Effektebene mit Pässen, Sortierung und Verdeckern; Partikel, Ringe, `fxground`, Skalierung.
   - Bodenzustände im Gelände (Verzweigung, Ränge, Abiotik), Haltefaktor der Sukzession.
   - Einstellung „Effekte reduzieren“.
   - `tools/fx-atlas.js`, Palette, Styleguide `docs/ereignisse-2026-10/stil.md`.
   - Probe-Modus `--hazards`: Reichweite, betroffene Kacheln, Heilungs-Zeitleiste je Ereignis.
   - Aufnahme-Werkzeug: Frame-Folge über CDP mit 10 fps, als PNG-Streifen und GIF.
2. **Lead, Vulkan vollständig** → Aufnahme → **Freigabe durch dich.**
3. **Danach parallel**, mit eigenen Bundles (`SE_BUNDLE`) und eigenen Rezeptdateien:
   - **Feuer:** Flächenbrand. Teilt Flammen, Glut und Rauch mit dem Vulkan.
   - **Einschläge:** Meteorit, Atomschlag.
   - **Wasser & Wind:** Flutwelle mit einfachem Kamm, Wirbelsturm ohne Tornados.
   - **Erde & Bevölkerung:** Erdbeben.
4. **Lead:** integriert. `--write` für beide Atlanten macht nur der Lead. Danach ein Zwischenstand mit Aufnahmen aller
   Ereignisse.
5. **Review-Agent R1** (siehe unten).

### Stufe 2: Ausbau

- Dieselben Agenten bringen alle Ereignisse auf das Niveau der Vulkan-Referenz:
  - mehr Frames, übergroße Sprites
  - Flutwelle mit Richtungssegmenten, Höhenstufen und brechender Welle
  - Wirbelsturm mit Tornados
- **Lead:** Kettenreaktionen und „Zum Ereignis springen“.
- **Erde & Bevölkerung:** die Seuche, sobald die Zivilisation gemergt ist.
- **Review-Agent R2.**

### Prüfweg (Review-Agent und Abnahme)

- **Aufnahmen:** jedes Ereignis
  - in 6 Biomen: gemäßigter Wald, Savanne, Taiga, Regenwald, Wüste, Tundra
  - an 5 Küstenformen: flach, steil, Bucht, Insel, Landzunge
  - in 5 Zoomstufen: 10, 16, 24, 32 und 48 px
  - jeweils mit „Effekte reduzieren“ an und aus
- **Tests:**
  - Nur Kacheln innerhalb der Reichweite ändern sich.
  - Jede Lavakachel hat einen Quellnachbarn, der mindestens so hoch liegt (Staugrenze 0,01).
  - Feuer überquert nie Wasser, Flüsse oder Fels.
  - Flutwelle: auf einer runden Testinsel aus 8 Richtungen. Geflutet werden nur Kacheln unter der Resthöhe, und
    getroffen wird die zugewandte Küste.
  - Jeder Bodenzustand endet im erwarteten Tick-Fenster.
  - Speichern mit laufenden Ereignissen, Laden eines Format-7-Stands.
  - Determinismus; Leistung.
  - Keine `rotate`/`filter`/`shadowBlur`-Aufrufe in `src/fx*.ts`.
  - Alle Atlasfarben stammen aus der Palette (Generator-Prüfung).
- **Bericht** mit Aufnahmen in `docs/ereignisse-2026-10/bericht.md`.

---

## 8. Entscheidungen (zur Freigabe)

- **K1, Reihenfolge mit der Höhe und dem Geologie-Agenten.** Beide Aufgaben berühren `geo.ts`, `raiseCrust`, Basalt,
  Schutt und das Speicherformat.
  - **Empfohlen:** Die Ereignisse warten nicht auf die Höhe. Fehlt `raiseCrust` beim Start, legt der Lead es mit der
    Signatur aus hoehe-spec §3.2 an, ebenso die Materialien Basalt und Schutt. Die Höhe baut darauf auf.
  - `geo.ts` fasse ich erst an, wenn kein anderer Agent darin arbeitet.
  - Die Formatnummer bekommt, wer zuerst merged.
- **K2, Vorzeichen.**
  - **Empfohlen:** Das Vorzeichen läuft in Echtzeit in der App. Das gilt für Spieler und natürliche Ereignisse,
    solange das Feld sichtbar ist. Es dauert immer 0,6–1 s, unabhängig vom Tempo, auch in der Pause.
  - Alternative: ein Zünder in Ticks. Bei „Schnell“ wäre das Vorzeichen dann nur 0,3 s lang.
- **K3, Heilungstempo.**
  - **Empfohlen:** Mindestticks je Bodenzustand (Abschnitt 4). Die Narben bleiben so in jeder Zeitskala sichtbar.
  - Alternative: nur die bestehende Sukzession. Dann ist eine Narbe in der Geologie-Zeit nach 1,5–3 s verheilt.
- **K4, Meteorit ins Meer:** Er löst als seine einzige Folge eine Flutwelle aus. **Empfohlen: ja.**
- **K5, Vulkan im Schelfmeer** baut eine Vulkaninsel, Lava am Ufer baut höchstens 2 Kacheln Land. **Empfohlen: ja.**
  Alternative: Ausbrüche nur an Land.
- **K6, globale Werte:** CO₂ und Staub von Vulkan, Meteorit und Atomschlag bleiben wie heute, denn sie wirken über die
  Atmosphäre. Schäden an Leben und Städten gibt es nur in der neuen, lokalen Reichweite. Das CO₂ des Brandes stammt
  aus der tatsächlich verbrannten Biomasse. **Empfohlen.**
- **K7, Speichern laufender Ereignisse.**
  - **Empfohlen:** Sie werden mitgespeichert und laufen nach dem Laden weiter.
  - Alternative: Beim Speichern springen sie sofort in ihre Nachwirkung.

---

## 9. Risiken

- **Parallele Sitzungen:** Civ, Epochen und Höhe arbeiten in `app.ts`, `world.ts`, `tsconfig.json`, `save.ts`,
  `geo.ts` und `succession.ts`. Gegenmittel: kleine, gezielte Änderungen und eigene Bundles. Gebaut und getestet wird
  nie, während ein anderer Agent den gemeinsamen Build braucht.
- **Zeichenzeit:** Viele Sprites und Verdecker kosten Zeit. Gegenmittel: Deckel, Sichtbarkeit, Vorkomposition pro
  Tick.
- **Tiere:** Die SVG-Herden liegen unter den Objekt-Effekten. Ein Tier in der Zeile vor einer Flamme kann teilweise
  verdeckt werden. Weil Tiere im Wirkradius sterben, ist das selten; `herds.ts` bleibt unverändert.
- **Grundbild:** Es wird höchstens alle 250 ms neu gezeichnet, Bodenzustände erscheinen also bis zu 250 ms nach ihrem
  Tick. Die Effektebene deckt das ab, weil Lava und Flutwasser dort liegen.
- **Wellenhöhen sind Spielwerte:** Das Tiefland liegt im Mittel hoch, echte Tsunami-Höhen (10–40 m) würden fast nichts
  überfluten. Die Werte werden im Probe abgestimmt.
- **Spiegelsätze im Generator** verdoppeln einige Sprites (Wirbelsturm, Wellenkämme, Rauchneigung). Das kostet Platz
  im Atlas, aber kaum Zeit.
- **Getestet wird nur Headless Chrome.** Echte Touch-Geräte, andere Browser und das Gefühl der Inszenierung brauchen
  einen Test von Hand.
