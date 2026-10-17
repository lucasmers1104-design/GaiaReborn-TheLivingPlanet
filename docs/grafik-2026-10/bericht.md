# Grafik- und Oberflächen-Überarbeitung Oktober 2026

Ziel: das Spiel optisch auf ein neues Niveau heben, sodass Karte und Oberfläche wie aus einem Guss
wirken – ohne den Charme von SimEarth zu verlieren. Leitlinie: **Die Spielwelt bleibt Pixelkunst**
(8 × 8-Kacheln, doppelt vergrößert), aber in einer abgestimmten Naturpalette statt grellem EGA;
**die Hülle ist modern** (dunkles Glas, klare Typografie) und zeigt Bedeutung statt bloßer Zahlen.

Vorher/nachher: `vorher-karte.png` ↔ `nachher-karte.png`, `vorher-modell.png` ↔ `nachher-modell-geosphaere.png`.

## 1. Planetenkarte

- **Neue Palette** (`src/sprites.ts`): dieselben Buchstaben und Motive, aber abgestimmte Farben – keine
  reinen EGA-Primärfarben mehr. Wüste und Offenland haben eigene Bodenfarben, damit Insekten, Reptilien
  und Blätter darauf nicht verschwinden. Erste Zellen erscheinen im Türkis des Ursprungs (wie in Baum und UI).
- **Meer nach Tiefe** (`src/terrainart.ts`): Wasser wird stufenlos von der Lagune bis zur Tiefsee eingefärbt,
  darüber feine Wellenpixel; jede Küste bekommt einen Brandungssaum. Seetang scheint gedämpft durchs Wasser.
- **Boden**: vier gespiegelte Varianten je Kachel gegen Stempel-Muster, Relief-Schattierung plus etwas
  Höhenlicht und feine Körnung; Gebirge und Hochland lesen sich als solche.
- **Tiefe**: Bäume, Tiere und Städte werfen einen Pixel-Schatten.
- **Lebendige Atmosphäre** (`src/ambient.ts`): ziehende Pixelwolken mit Schatten (Dichte folgt dem
  Wasserdampf, dünnen beim Hineinzoomen aus) und gelegentliches Sonnenglitzern auf offenem Wasser.
  Neue Kartenebene **„Wolken“** zum Abschalten; „Bewegung reduzieren“ hält beides still.
- **Brandung und Strömung** (`src/watermotion.ts`, Daten aus `src/landsurf.ts`, 15. 10. 2026):
  - Die Schaumlinie an Küsten und Seeufern atmet: Kommt eine Welle, wird die äußere Wasserreihe eine
    Stufe heller, dann füllt sich die Reihe hinter dem Schaum mit Schaum. Im Wellental dünnt die
    Schaumlinie aus.
  - Auf dem Wellenkamm wird die Schaumlinie weiß (die hellen Stufen der Eisrampe). Je größer die Welle,
    desto weißer.
  - Gischt (`src/waterspray.ts`, 16. 10.):
    - 1,5 % der Schaumpixel an offener See sind Gischtpunkte.
    - Offene See heißt: binnen 4 Feldern liegt Wasser, das tiefer als 360 m ist. Seen und Lagunen
      bekommen deshalb keine Gischt.
    - Bricht dort eine große Welle (Kamm der Hauptdünung, während die zweite Dünung hoch ist), steigen
      weiße Tropfen auf und verblassen nach 0,9 s.
    - Wahrscheinlichkeit, Tropfenzahl und Höhe wachsen mit der Höhe des Ufers:
      - Steilküste: bis 9 Pixel hoch, 12 Tropfen, 65 % der großen Wellen.
      - Flachküste: 3 Tropfen, 12 % der großen Wellen.
    - Häufigkeit:
      - In einer Bildschirmansicht der Erde bei 32 px je Feld etwa 1–2 Gischtstöße pro Sekunde, an den
        Anden etwa 0,8 pro Sekunde auf 27 × 16 Feldern.
      - Auf Zufallsplaneten mit flacheren Küsten seltener und kleiner.
  - Zwei Dünungen mit 2,7 s und 3,9 s Periode überlagern sich, der Takt liegt also zwischen 2 und 4 s.
    Die Phase wandert sanft die Küste entlang (Gitter 4 Kacheln), so pulsieren Abschnitte nie im
    Gleichtakt.
  - In Flüssen ziehen helle 2-Pixel-Striche mit 4 Kunstpixeln/s flussabwärts.
  - Eis- und Schneeküsten haben keine Brandung, Stadtkacheln keine Bewegung.
  - Nur Palettenfarben, ein Kunstpixel je Punkt, am Gelände-Raster.
  - Eigene Bildrate von 7 Bildern/s, unabhängig vom Spieltempo; gezeichnet nur im sichtbaren Bereich.
    Alles folgt aus Hash und Uhrzeit, nichts wird pro Pixel gespeichert.
  - Sichtbar ab 16 px je Feld, also bei Zoom 10 und 13 aus. „Effekte reduzieren“ schaltet beides ab.
  - Die zwischengespeicherten Kartenteile bleiben unverändert. Beim Zusammensetzen eines Kartenteils
    werden Küstenringe und Flusspixel einmal ausgelesen; das kostet im Mittel 0,2 ms pro Kartenteil
    (Erde heute, Node).
  - Kosten in headless Chrome, 1920 × 1080, Software-Rendering:
    - 0,14 ms Hauptthread pro Bild bei 16 px je Feld, mit Gischt und weißen Kämmen.
    - Im Bild mit Neuaufbau p95 0,8 ms. Einmalig bis 3 ms, wenn die Gischtpunkte neu sichtbarer
      Kartenteile bestimmt werden.
    - 0,09 ms bei 32 px je Feld.
    - Mit „Effekte reduzieren“ fast 0.
    - Der Bildabstand blieb bei 16,7 ms.
- Eckklammern als Cursor, leichte Vignette.
- **Leistung**: Alle Kacheln werden einmal fertig zusammengesetzt und über Zahlen gefunden
  (`src/tilecache.ts`); Relief und Wellen sind eingebacken. Beim Zoomen wird das letzte Bild skaliert und
  erst nach 140 ms Ruhe neu gezeichnet – Zoomen bleibt auch auf langsamen Rechnern flüssig.

## 2. Übersichtskarte

- Gleiche Meeresfarben wie die Hauptkarte, Relief auf Gelände-, Lebensraum- und Technologiekarte.
- Globus mit Atmosphärensaum, Sonnenlicht und Sternen.
- Legenden für fließende Größen (Höhe, Temperatur, Niederschlag) als Farbverlauf mit benannten Enden,
  eigene Legenden für Wind und Meeresströmung (`src/maplegend.ts`). Alle zwölf Modi in einer Zeile.
- Temperatur (Luft, Meer, Überlagerung „Wärme“) als zweiseitige Skala um 12 °C (16.10.2026): blau bis −36 °C,
  bernstein bis rot bis 36 °C, in jedem Arm gleichmäßig dunkler. Die alte Regenbogenskala hatte Grün und
  Gelb gleich hell; 15–35 °C, die halbe Karte, sah dadurch einfarbig aus. In der Legende nimmt jeder Arm die
  halbe Breite ein.

## 3. Fenster, die vorher nur Regler oder Zahlen zeigten

| Menüpunkt | Vorher | Jetzt |
|---|---|---|
| Modelle (4 Fenster, 27 Regler) | Regler mit Zahl 0–100 | Je ein **Schaubild, das live auf die Regler reagiert** (Erdquerschnitt; Energiebilanz mit aktueller Mitteltemperatur; fünf Biosphären-Vignetten; Energiemix-Ring, Budget-Balken und Kriegsgefahr nach derselben Formel wie die Simulation). Regler mit Symbol, Marke am kalibrierten Wert, Füllung ab dieser Marke, Klartext („Stark · 140 %“, „36 % des Mix“), Doppelklick setzt einen Regler zurück. |
| Diagramme › Luftzusammensetzung | 5 Balken mit je eigener Skala | 6 **Ringanzeigen** mit markiertem Wohlfühlbereich und einer Zeile Bedeutung (z. B. „Ab 14 % möglich: Vögel, Säugetiere“) |
| Diagramme › Lebensraumanteile | Balkenliste | **Ringdiagramm** mit Land/Meer in der Mitte und sortierter Legende |
| Diagramme › Lebensformen | Balken in Artfarben | Rangliste nach Reich, ausgestorbene Gruppen markiert |
| Diagramme › Technologie | Balken | **Weg der Zeitalter** mit Stadtzahlen und erreichter Stufe |
| Gaia | Gesicht mit Prozentzahl | Gesicht als Planet (Ozeane, Kontinente, Licht), blinzelt, Augenbrauen und Wangen nach Stimmung; darunter Stimmungsbalken und **die vier Faktoren** ihrer Laune |
| Verlauf | Linien | Flächen unter den Kurven, **Fadenkreuz mit Werten** beim Überfahren, aktuelle Werte an den Schaltern |
| Bericht | Kennzahlenraster | **Lebenszeichen mit Mini-Verlauf und Trend**, Fortschritt (Planetenalter, Evolutionsbaum, Gaia), Oberfläche als ein Balken |
| Glossar | Textliste | Karten mit Symbol je Begriff |
| Untersuchen | Großes Fenster mit Kartenausschnitt und drei Spalten | Schmales Randpanel mit einzelnem, ganzzahlig vergrößertem Feldbild, sechs Werten und aufklappbaren Artenlisten. Elf Lebensraum-Icons mit Gesichtern oder rotem X ersetzen die Eignungsbalken; auf dem Handy bleibt ein Teil der Karte frei. |
| Chronik | Karten | Karten an einer Zeitleiste |
| Datei › Spielstände | Textzeilen | Karten mit **Planeten-Vorschaubild**, Fortschrittsbalken und Datum |

## 4. Titelbildschirm

Beim Start erscheint statt des Rückfrage-Dialogs ein Titel: der frisch entstandene Planet dreht sich als
Pixel-Globus im All. Die Simulation ruht, bis gewählt ist; das Spiel dahinter ist für Tastatur und
Vorleser gesperrt (`inert`).

**Neugestaltung 16.10.2026** (nur Desktop, ab 1280 × 720; kleinere Fenster scrollen): ein HUD im
Weltraum. Links das Pixel-Logo „SimEarth“ mit Verlauf, gerahmter „2“ und Umlaufbahn, „Der lebende
Planet“, die Einleitung, „Weiterspielen“ (nur mit automatischer Sicherung) und die Buttons „Spiel
starten“, „Erde“, „Zufallsplanet“, „Spielstände …“ und „Einstellungen“. Ein Tutorial gibt es nicht, also
auch keinen Button. Darunter „Planet anpassen“:

- **Erde:** die Epochen „Junge Erde“ und „Heute“ mit Beschreibung. Bei der Jungen Erde blättern Pfeile
  durch Varianten, wie früher „Anderer Planet“.
- **Zufallsplanet:** Pfeile durch neue Planeten, ◀ führt zu den schon gesehenen zurück (per Seed, nur in
  dieser Sitzung). Dazu der Regler „Meer und Land“, der die Generierung tatsächlich steuert.

Rechts der echte Globus des gewählten Planeten (größer, gröber gepixelt, mit Atmosphärenleuchten),
Umlaufbahnen, zwei Monde und ein Asteroid. Oben rechts eine Infokarte mit Satellit und der Version aus
`package.json`, unten Zitat und Leitspruch.

- **Einstellungen:** ein Dialog (Datumsformat, Pausen, Effekte reduzieren, Klang), im Spiel unter
  „Spiel › Einstellungen …“, definiert an einer Stelle (`SettingDef`, `src/settingsview.ts`).
- **Globus:** eigenes Pixel-Bild (`TitleGlobe`, `src/titledecor.ts`): etwa 144 Bildpunkte breit, ganzzahlig
  vergrößert, Licht von links oben in geditherten Stufen, bläuliche Nachtseite, zwei Pixel Luftsaum und
  eigene Wolken, die etwas schneller ziehen als der Boden.
- **Bewegung:** Der Globus dreht sich, drei Sternschichten ziehen pixelweise unterschiedlich schnell
  (Parallaxe), Funkeln, Asteroiden und Monde wippen in Pixelschritten. Bei „Effekte reduzieren“ oder der
  Systemeinstellung für reduzierte Bewegung steht alles still.
- **Schriften:** Pixelify Sans (Logo, Überschriften) und JetBrains Mono (Text) liegen als woff2 mit
  Lizenz (SIL OFL) in `assets/fonts/` und werden nur auf dem Titel verwendet.
- **Grafiken:** Satellit, Monde und Asteroiden sind Pixel-SVGs in `assets/title/`.
- **Version:** `npm run build` schreibt sie nach `tsc` mit `tools/stamp-version.js` in `simulation.js`.
  `npm version` baut danach neu (Skript `version` in `package.json`), so trägt jede Veröffentlichung von
  `scripts/ship.mjs` ihre eigene Nummer.

Code: `src/title.ts` (Aufbau, Globus), `src/titleplanet.ts` (Planetenwahl), `src/titledecor.ts`
(Dekoration), Stile in `css/title.css`, `css/titledecor.css`, `css/settings.css`, `css/fonts.css`.

Geprüft in headless Chrome:

- **Screenshots:** 1920 × 1080 mit Spielstand im Modus Erde und ohne Spielstand im Modus Zufallsplanet,
  1280 × 800 mit Spielstand, 1280 × 720 ohne Spielstand.
- **Automatisch:** 1280 × 720 bis 2560 × 1440 (sieben Größen, beide Modi, mit und ohne Spielstand) ohne
  Scrollen, Überlappen oder abgeschnittene Beschriftungen. Dazu Fokus-Reihenfolge, sichtbarer Fokus,
  alle Buttons, Pfeile, Regler und Epochen, keine laufende Animation bei reduzierten Effekten (Einstellung
  und Systemeinstellung), Schriften über `file://`, keine Konsolenfehler.

## 4b. Werkzeugleiste, Kartenebenen, Menüs (17. 10. 2026)

Vorher stand oben links alles zugleich offen: Werkzeuge mit Text, lange Optionszeilen samt gesperrter Arten,
darunter 12 Ebenen-Chips; die Menüleiste zeigte unter 2060 px nur sechs Symbole.

- **Werkzeugleiste:** 64 px, sechs Symbole mit Tastenbuchstaben (U V H P L K).
- **Werkzeugkarte** daneben: Name, Taste, eine Zeile Hinweis, Reiter (Leben/Städte/Terraformer), Kacheln
  mit Symbol, Name und Kosten (drei je Reihe, zwei bei sehr langen Wörtern). Gesperrte Einträge stehen
  gesammelt in einer Zeile „+N noch nicht entwickelt › Baum“; die Beschreibung nur für die gewählte Kachel.
  Das X oder ein zweiter Klick aufs aktive Werkzeug schließt die Karte, jede Werkzeugwahl öffnet sie wieder.
- **Kartenebenen:** Knopf unten rechts über Übersichtskarte und Zoom; das Popover hat die 6 Ebenen als
  Schalter und die Klima-Überlagerung als Einfachauswahl („Keine“ + 6) mit Farbskala. Escape schließt.
- **Menüs:** „Spiel“ (Datei, Zum letzten Ereignis springen, Einstellungen …), „Fenster“, „Planet“ (Modelle
  und Diagramme), immer mit Text. Weggefallen sind die Doppelungen: das Menü „Tempo“ (Tempo-Leiste,
  Leertaste, 1–4), „Ereignisse auf der Karte zeigen“ (Ebene „Ereignisse“) und „Werkzeugbereich anzeigen“
  (X bzw. Werkzeug anklicken).

## 4c. Terraforming-Pinsel und Höhenrelief (17. 10. 2026)

- **Pinsel** („Höhe ändern“, Taste H): gedrückt halten hebt oder senkt (Umschalt kehrt um), Stärke
  Sanft/Normal/Stark, Größe per Regler, [ ] oder Alt + Mausrad. Ring und Anzeige nennen die Höhenstufe
  (Tiefsee … Gipfel, `TERRAFORM_STAGES`) und die Höhe in Metern; veränderte Felder leuchten kurz auf.
- **Stufen:** gehobenes Land läuft live durch Flachwasser, Sandstrand, Tiefland mit dem Bewuchs der
  Umgebung, Hügel, Bergland, Fels und Gipfelschnee; Absenken denselben Weg zurück. Wasser erst unter dem
  Meeresspiegel, von der tiefsten Stelle aus.
- **Übergänge:** ein frisch gemaltes Stück Karte wechselt nicht schlagartig, sondern löst sich in 220 ms
  Pixel für Pixel (4 × 4-Raster) ins neue Bild auf (`src/landfade.ts`).
- **Höhenrelief auf der ganzen Karte:** stärkerer Höhenton und eine Krümmungsschattierung (Kuppen heller,
  Senken dunkler), auch auf Bäumen und Büschen. Auf natürlichen Planeten bewusst dezent.

## 5. Neue Dateien

`src/terrainart.ts`, `src/tilecache.ts`, `src/ambient.ts`, `src/maplegend.ts`, `src/charts.ts`,
`src/sliders.ts`, `src/modelscenes.ts`, `src/modelhero.ts`, `src/graphs.ts`, `src/gaia.ts`,
`src/historyview.ts`, `src/report.ts`, `src/savesview.ts`, `src/title.ts`;
Stile in `css/models.css`, `css/panels.css`, `css/title.css` (per `@import` aus `styles.css`);
20 neue Liniensymbole in `assets/ui/` (Regler, Wolken-Ebene).

Kleine Eingriffe in die Logik, ohne Verhaltensänderung: `CivSystem.aggression()` (dieselbe Formel, jetzt
auch für die Anzeige), `WorldState.gaiaFactors()` (Gaias Stimmung in ihre Teile zerlegt),
`livingGroups()` (gemeinsam für Verlauf und Bericht). Spielstand-Metadaten haben ein optionales
Vorschaubild (`thumb`, ca. 10 KB); das Spielstandformat selbst ist unverändert.

## 6. Prüfungen (tatsächlich ausgeführt)

| Prüfung | Ergebnis |
|---|---|
| `npm test` | 32/32 bestanden |
| Browser-Durchlauf über `index.html` (Chrome headless per DevTools-Protokoll): Titel starten, 16 Fenster, 12 Kartenmodi inkl. Globus, alle Ebenen und Überlagerungen, alle 27 Regler, Verlauf-Hover, Spielstände | alles ausgeführt, **keine Konsolenfehler** |
| Ansichten 1440 × 900, 1920 × 1080, 2560 × 1440 und 390 × 844 (Gerät emuliert, DPR 2) | geprüft per Screenshot, siehe `nachher-*.png` |
| Volle Kartenneuzeichnung, Software-Rendering ohne GPU, später Spielstand, 16 px je Feld | 1920 × 1080: ~50 ms · 2560 × 1440: ~71 ms; einzelne Zoomschritte ~0 ms (Vorschau) |

## 7. Einschränkungen

- Nur in Chrome geprüft (headless, Software-Rendering). Firefox, Safari und echte Touch-Geräte nicht.
- Die volle Neuzeichnung ist ohne GPU etwas teurer als vorher, weil mehr gezeichnet wird; ein Vergleich
  mit exakt demselben Planeten war nicht möglich, weil der alte Stand nicht mehr vorlag. Abgefedert durch
  den Kachel-Cache, die Zoom-Vorschau und die bestehende Drosselung.
- Der Titelbildschirm erscheint bei jedem Start; der Weg zurück ins Spiel ist ein Klick („Weiterspielen“).
- Ältere Spielstände haben kein Vorschaubild, bis sie einmal neu gespeichert werden.

## 8. Evolutionsmomente

Spontane Evolution, das Fenster mit Film und Erklärung für jeden neuen Schritt und die 31 Filme sind in
`evolutionsmomente.md` beschrieben.
