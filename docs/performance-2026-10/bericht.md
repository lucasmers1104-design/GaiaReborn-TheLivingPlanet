# Performance-Umbau: Simulation und Landschaft in Workern

Stand: 21. 10. 2026. Ziel war, die Darstellung von der rechenintensiven Simulation und der Grafikaufbereitung
zu entkoppeln, ohne Spielregeln, Kalender, Zufallsfolgen oder Speicherformat zu ändern. Visuelle Arbeit wird
bei Überlast ausdrücklich **nicht** reduziert, weil die Grafikqualität später noch steigen soll.

## 1. Kurzfassung

- Die Simulation läuft im Spiel jetzt in einem **Simulations-Worker**. Der Hauptthread zeigt den zuletzt
  vollständigen Zustand, nimmt Eingaben an und zeichnet.
- Ein zweiter **Landschafts-Worker** setzt die Pixel-Landschaft (16 × 16-Kachel-Chunks) zusammen und aktualisiert
  das Terrain-Feld. Er bekommt die Weltzustände direkt vom Simulations-Worker, nicht über den Hauptthread.
- Beide Worker entstehen über `file://` als klassische Blob-Worker aus dem eigenen Quelltext des Bundles.
  Wo das nicht geht, läuft alles wie bisher im Hauptthread (Direktmodus). Fällt ein Worker aus, übernimmt die
  Seite kontrolliert.
- In den sieben Messszenarien sinkt der Anteil der Bilder mit mehr als 16,7 ms Hauptthread-Arbeit von 15–93 %
  auf 0,4–12 %. Lange Tasks (> 50 ms) fallen von 6–100 je 15 s auf 0–2. Die Simulation erreicht weiter ihr
  volles Tempo (6,7 Ticks/s bei „Schnell“).
- Auf der Referenz liegen damit 6 von 7 Szenarien bei ≥ 95 % der Bilder im 60-Hz-Budget, das Pinsel-Szenario bei
  88 %. Eine **60-fps-Abnahme ist das nicht**: gemessen wurde nur Headless-Chrome auf einem schnellen Desktop,
  nicht auf Mindesthardware und nicht in einem echten Fenster mit GPU (Abschnitt 6).

## 2. Referenz und Prüflücken

| | |
|---|---|
| Rechner | AMD Ryzen 5 5600 (6 Kerne / 12 Threads), 32 GB, NVIDIA RTX 5060 Ti, Windows 11 |
| Browser | Chrome 155, `--headless=new`, Profil frisch je Szenario |
| Auflösung | 1920 × 1080, DPR 1, Standard-Zoom, „Effekte reduzieren“ aus (volle Qualität) |
| Tempo | „Schnell“ (150 ms je Tick), Entwicklermodus an (Kosten spielen für die Messung keine Rolle) |

Nicht geprüft: echte Mindesthardware (ein schwächerer PC lag nicht vor; die 4-fache CPU-Drosselung in Abschnitt 5
ist nur ein Hinweis), Chrome mit Fenster und GPU-Raster, Firefox, Safari, Edge, andere DPR (z. B. 1,5 und 2),
4K-Auflösung, Audio unter Last.

## 3. Ausgangslage

Gemessen mit dem unveränderten Bundle (Commit 3f17bb4):

- Ein Tick kostete im Hauptthread je nach Planet 17–50 ms (p50) und bis über 400 ms (Spitzen bei
  weit entwickelter Biosphäre). Größte Posten: `LifeSystem.stepLife` (≈ 55 %), Klima, Flora, Biome,
  Evolution. Der Tick lief im `requestAnimationFrame` und blockierte damit mehrere Bilder.
- `SIM_BUDGET_MS` begrenzte nur zusätzliche Ticks, nie einen laufenden.
- Die Chunk-Komposition nutzte ihr 8-ms-Budget praktisch in jedem Bild aus (≈ 30 % des Hauptthreads),
  dazu kam ein voller Feld-Refresh nach jeder Plattenverschiebung (≈ 35–40 ms, etwa alle 8 Ticks).
- Bestätigt wurden außerdem die Befunde aus dem Auftrag: gemeinsamer `WorldState`, gemeinsamer `world.rng`,
  synchrone Serialisierung beim Speichern, abweichende Tick-Abläufe in App, Testhelfern und Headless-Probe.

## 4. Umgesetzte Architektur

### 4.1 Ausführungsbereiche

| Bereich | Aufgaben |
|---|---|
| Hauptthread | Eingaben, DOM, Fenster, Kamera, alle Zeichenebenen und Animationen, Audio (unverändert), Vorprüfung von Spieleraktionen |
| Simulations-Worker (`simworker.ts`) | verbindlicher Planet (`SimCore`), eigener Takt, Befehle in Reihenfolge, Speichern und Laden (inkl. gzip) |
| Landschafts-Worker (`landworker.ts`) | Terrain-Feld aus den Weltzuständen, Chunk-Komposition auf Anfrage |
| Audio | unverändert im Hauptthread mit den bestehenden AudioNodes; kein eigener Audio-Worker nötig |

### 4.2 Simulationskern (`src/simcore.ts`)

`SimCore` enthält Planet, alle Systeme und den Tick in der Reihenfolge des bisherigen `App.tick`.
Die Teile, die bisher in `app.ts` lagen, sind jetzt im Kern: Zeitalterwechsel, Zivilisations-Chronik,
Riff-Meilensteine, Verlauf und Gefahrenmeldungen. Die Spieleraktionen sind Befehle (`SimCommand`):

- `check(cmd)` liefert den Ablehnungsgrund (deutscher Text) oder nichts. Die App fragt das am angezeigten Zustand,
  bevor sie sendet (sofortige Rückmeldung).
- `apply(cmd)` prüft erneut gegen den eigenen Zustand und ändert erst dann etwas.

Das betrifft Entwickeln, Pflanzen, Leben, Städte, Terraformer, Ereignisse, Katastrophen (Bezahlen und Auslösen
getrennt, mit Gutschrift), Pinsel-Tupfer und Nacharbeit, Dinosaurier-Entscheidung, Komet, Raketenstart,
Modellfenster, Modellparameter, Pause und Tempo, neuer Planet, Laden und Speichern.

Testhelfer und Headless-Probe verwenden den Kern ebenfalls, aber mit `harnessTick()`. Das ist ihr bisheriger,
bewusst abweichender Ablauf: ohne Katastrophen, Lexikon und Zeitalter, die Probe ohne Termitenhügel. Ihre Seeds
sind darauf abgestimmt; eine Vereinheitlichung wäre eine eigene, geprüfte Verhaltensänderung.

### 4.3 Nachrichtenvertrag (`simworker.ts`, `simhost.ts`, `simstate.ts`)

| Art | Richtung | Behandlung |
|---|---|---|
| Befehl `{seq, session, cmd}` | Seite → Worker | geordnet, nie verworfen; Antwort `{seq, result}` kommt mit dem Zustand, der ihn enthält |
| Zustand | Worker → Seite | höchstens einer unterwegs; die Seite übernimmt ihn in ihren Spiegel und quittiert |
| Ereignisse (Meldungen, Katastrophen, Chronik, Entdeckungen) | Worker → Seite | reisen verlustfrei mit dem nächsten Zustand |
| Speichern / Laden | Seite ↔ Worker | als Befehle in der Reihenfolge; Text und Kurzinfo kommen zurück |
| Fehler `{fatal, seq}` | Worker → Seite | Übernahme durch die Seite (4.6) |

Jeder Zustand trägt eine Sitzungsnummer. Nach „Neuer Planet“ oder „Laden“ werden Zustände und Antworten des
vorigen Planeten nicht mehr übernommen (Ausnahme: ein Speicherauftrag davor wird noch beantwortet).

Der Spiegel ist eine langlebige `SimCore`-Instanz der Seite. Typisierte Arrays werden per `.set()` gefüllt,
Klasseninstanzen behalten ihre Prototypen. So funktionieren alle Caches, die an der Welt-Identität, `ticks` oder
`revision` hängen, unverändert. Die großen Arrays reisen in wiederverwendbaren, übertragenen Puffern
(`TransferPool`) hin und zurück; ein Zustand ist gut 5 MB groß.

Vorhersage: Pinsel-Tupfer, Gelesen-Markierungen, Modellparameter, Tempo und Entwicklermodus wirken sofort auf
dem Spiegel und werden über jeden neueren Zustand erneut angewandt, bis der Worker sie bestätigt hat. Alles
andere zeigt erst das Ergebnis des Workers.

### 4.4 Takt, Überlast und Warteschlangen

- Der Worker tickt nach `SPEED_TICK_MS` (Feuer: langsamste Stufe) mit Rückstau höchstens `SIM_BACKLOG_TICKS`.
- Er rechnet höchstens einen Tick voraus und postet erst nach der Quittung. Kein Tick wird übersprungen.
  Ist die Seite oder der Worker überlastet, läuft der Planet langsamer.
- Befehle werden zwischen zwei Ticks verarbeitet; ein laufender Tick wird nicht unterbrochen.
- Die Nacharbeit eines Pinselstrichs läuft im Worker vollständig vor dem nächsten Tick, im Direktmodus Schritt für
  Schritt über mehrere Bilder, aber ebenfalls immer vor dem nächsten Tick.
- Landschafts-Aufträge: höchstens 6 gleichzeitig, sichtbare und am längsten wartende Chunks zuerst. Ein Ergebnis
  wird nur eingesetzt, wenn seine Feldsignatur zum aktuellen Feld passt.

### 4.5 `file://` und Blob-Worker

`tools/wrap-bundle.js` (Teil von `npm run build`) legt das Bundle in `function seBundle() { … }`. Die Seite liest
den Quelltext mit `Function.prototype.toString` (ES2019: exakter Quelltext), erzeugt daraus einen Blob und startet
einen klassischen Worker. Nötig sind weder `fetch` noch `importScripts` noch `SharedArrayBuffer`. Geprüft in
Headless-Chrome über `file://`: `toString` 0,1 ms, Worker-Start ≈ 350 ms (5,4 MB Quelltext).

Direktmodus (synchroner Fallback) gilt für ein unverpacktes Bundle (`npm run watch`), Browser ohne Worker,
`?sim=direct`, Vorschauseiten mit `_preview.js` und nach einem Worker-Ausfall.

### 4.6 Fehler und Wiederherstellung

- Wirft der Worker, meldet er den Befehl, an dem er scheiterte. Die Seite übernimmt den letzten vollständigen
  Zustand aus ihrem Spiegel, beantwortet den schuldigen Befehl als gescheitert und führt die übrigen offenen in
  Reihenfolge aus. Danach pausiert das Spiel mit einem Hinweis zum Speichern.
- Scheitert ein Befehl auch auf der Seite, hält die Simulation an („Simulation angehalten“), damit kein
  halb geänderter Planet weiterläuft.
- Schweigt ein Worker 20 s lang, obwohl Antworten offen sind, gilt er als ausgefallen.
- Fällt der Landschafts-Worker aus, setzt die Seite die Chunks wieder selbst zusammen.

## 5. Messergebnisse

Messwerkzeug: `node tools/perf-bench.js` (Abschnitt 7). 15 s je Szenario nach 4 s Anlauf, gleiche Spielstände
vorher und nachher. „vorher“ = Bundle von 3f17bb4, „Worker“ = neuer Standard, „direkt“ = neuer Code mit `?sim=direct`.

So liest man die Tabellen:

- Headless-Chrome liefert hier Bilder im Takt von etwa 13,3 ms (≈ 75 Hz), daher Werte über 60 fps.
- **Bilder > 16,7 ms** ist der Anteil der Bilder, deren Arbeit im Hauptthread das 60-Hz-Budget überschreitet.
  Das ist der Wert, der für 60 fps zählt.
- **Lange Tasks** sind Aufgaben über 50 ms.
- **Zustandsalter** ist die Zeit vom Absenden eines Zustands im Worker bis zu dem Bild, das ihn zeigt.
- Die Meilenstein-Karten und Meldungen sind in allen Läufen ausgeblendet. Sie lagen sonst über der Pinselstelle
  und kosten selbst Raster-Zeit.

| Szenario | Variante | Bilder/s | Abstand p95 / p99 / max (ms) | Arbeit p50 / p95 / p99 (ms) | Bilder > 16,7 ms | lange Tasks | Ticks/s | Zustandsalter p50 (ms) |
|---|---|---|---|---|---|---|---|---|
| Junge Erde | vorher | 65,1 | 27 / 40 / 67 | 4,5 / 29,4 / 40,0 | 14,5 % | 6 | 6,7 | – |
|  | Worker | 74,6 | 14 / 14 / 53 | 4,8 / 7,5 / 10,8 | 0,4 % | 1 | 6,7 | 74 |
|  | direkt | 69,4 | 27 / 40 / 80 | 5,0 / 23,6 / 40,9 | 9,9 % | 7 | 6,7 | – |
| Dichte Biosphäre | vorher | 44,4 | 54 / 107 / 147 | 15,0 / 56,1 / 101,6 | 35,2 % | 54 | 6,6 | – |
|  | Worker | 71,7 | 14 / 27 / 40 | 4,6 / 10,5 / 16,2 | 0,9 % | 0 | 6,6 | 76 |
|  | direkt | 56,3 | 40 / 80 / 133 | 4,6 / 45,2 / 81,0 | 13,2 % | 35 | 6,6 | – |
| Zivilisation (57 Stadtfelder) | vorher | 55,1 | 27 / 80 / 120 | 5,1 / 25,0 / 83,4 | 16,7 % | 28 | 1,9 | – |
|  | Worker | 66,9 | 27 / 40 / 53 | 4,7 / 10,4 / 28,6 | 1,8 % | 0 | 2,1 | 805 |
|  | direkt | 62,8 | 27 / 80 / 120 | 4,4 / 12,2 / 80,1 | 3,7 % | 29 | 1,9 | – |
| Biosphäre + 6 Katastrophen | vorher | 28,5 | 93 / 133 / 187 | 20,2 / 87,0 / 135,9 | 74,9 % | 100 | 6,7 | – |
|  | Worker | 69,3 | 27 / 27 / 40 | 8,2 / 15,8 / 25,2 | 4,8 % | 0 | 6,7 | 78 |
|  | direkt | 51,7 | 53 / 93 / 133 | 7,7 / 54,2 / 91,3 | 15,7 % | 50 | 6,7 | – |
| Biosphäre + Pinsel | vorher | 36,4 | 67 / 93 / 227 | 18,5 / 66,2 / 92,6 | 62,2 % | 78 | 6,7 | – |
|  | Worker | 61,7 | 27 / 40 / 253 | 6,5 / 21,9 / 32,2 | 11,6 % | 1 | 6,7 | 31 |
|  | direkt | 55,1 | 53 / 80 / 173 | 6,8 / 48,6 / 81,8 | 13,5 % | 46 | 6,6 | – |
| Biosphäre + Schwenken/Zoomen | vorher | 22,8 | 120 / 280 / 374 | 22,4 / 117,7 / 288,3 | 93,0 % | 100 | 6,5 | – |
|  | Worker | 68,2 | 27 / 40 / 294 | 8,3 / 15,9 / 29,3 | 4,6 % | 2 | 6,7 | 77 |
|  | direkt | 52,7 | 53 / 93 / 267 | 7,6 / 51,3 / 92,7 | 14,2 % | 49 | 6,6 | – |
| Biosphäre + Autosave alle 3 s | vorher | 31,2 | 93 / 120 / 173 | 18,3 / 83,5 / 123,7 | 64,5 % | 94 | 6,6 | – |
|  | Worker | 69,9 | 27 / 27 / 53 | 4,1 / 10,9 / 22,7 | 2,1 % | 0 | 6,4 | 77 |
|  | direkt | 53,4 | 53 / 80 / 147 | 4,7 / 48,8 / 86,3 | 14,4 % | 41 | 6,6 | – |

| Szenario | Variante | Tick p50 / p95 (ms) | Feld-Refresh p50 / max (ms) | Nachrichten | Heap Seite / Worker (MB) | localStorage.setItem |
|---|---|---|---|---|---|---|
| Dichte Biosphäre | vorher | 28 / 71 | 5,0 / 35,3 | – | 40 / 0 | – |
|  | Worker | 31 / 68 | 6,7 / 36,7 | 6,7/s, 34 MB/s | 23 / 34 | – |
| Zivilisation (57 Stadtfelder) | vorher | 39 / 70 | 8,5 / 11,6 | – | 20 / 0 | – |
|  | Worker | 46 / 80 | 9,0 / 13,1 | 2,2/s, 11 MB/s | 24 / 37 | – |
| Biosphäre + Autosave alle 3 s | vorher | 32 / 83 | 5,7 / 38,3 | – | 47 / 0 | 8× max 2,3 ms |
|  | Worker | 39 / 86 | 7,7 / 70,3 | 6,8/s, 34 MB/s | 26 / 50 | 8× max 2,0 ms |

Nachmessung im Worker-Modus nach den Korrekturen aus Abschnitt 9 (3 Szenarien, `tmp/perf/worker-final.json`).
Die Werte bleiben im Bereich der Tabelle; die Korrekturen kosten nichts Messbares:

| Szenario | Bilder/s | Abstand p95 / p99 / max (ms) | Arbeit p50 / p95 / p99 (ms) | Bilder > 16,7 ms | lange Tasks | Ticks/s | Zustandsalter p50 (ms) |
|---|---|---|---|---|---|---|---|
| Zivilisation | 65,7 | 29 / 43 / 81 | 4,6 / 11,0 / 34,4 | 1,9 % | 1 (51 ms) | 2,1 | 848 |
| Biosphäre + Pinsel | 59,7 | 30 / 44 / 191 | 6,6 / 20,7 / 32,7 | 10,9 % | 1 (162 ms) | 6,6 | 30 |
| Biosphäre + Schwenken/Zoomen | 66,0 | 15 / 29 / 235 | 7,1 / 12,4 / 22,3 | 2,3 % | 2 (max 239 ms) | 6,7 | 75 |

Zweite Tabelle (Worker vs. vorher):

- Im Worker-Modus messen **Tick** und **Feld-Refresh** die Zeit in den Workern, nicht im Hauptthread.
- Ein Zustand ist gut 5 MB groß; die großen Arrays reisen in wiederverwendbaren, übertragenen Puffern.
- Die Zivilisation läuft in allen Varianten mit ≈ 2 Ticks/s. Brennende Feuer halten das Spiel nach der Spielregel
  auf der langsamsten Stufe. Daher kommt auch das hohe Zustandsalter dort.

**CPU-Drosselung (nur ein Hinweis auf schwächere Rechner)**

DevTools verlangsamt die Seite um den Faktor 4, die Worker nicht sicher. Ergebnis für die Biosphäre:

| | Bilder/s | Bildarbeit p50 | Ticks/s |
|---|---|---|---|
| vorher | 2,5 | 292 ms | 2,6 |
| nachher | 5,2 | 92 ms | 5,3 |

Auf einem Rechner mit etwa einem Viertel der Einzelkernleistung reicht also auch der neue Stand nicht für eine
flüssige Darstellung. Dann ist das Zeichnen selbst der Engpass (Abschnitt 6).

## 6. Grenzen und offene Punkte

**Nicht nachgewiesen**
- **60 fps auf Mindesthardware:** Es lag kein schwächerer PC vor. Die Referenz ist ein schneller Desktop;
  Headless-Chrome rastert die Canvas dort ohne GPU. Ein Teil der verbleibenden langen Bildabstände ist
  Raster- und Compositor-Zeit, keine JavaScript-Zeit. Die 4-fache CPU-Drosselung zeigt: Auf deutlich
  langsameren Rechnern begrenzt künftig das Zeichnen selbst (Kartenbasis, Effekt-Ebenen, Raster).
- **Andere Browser:** Firefox, Safari und Edge sind ungeprüft, ebenso Chrome mit Fenster, andere DPR und 4K.
  Blob-Worker aus `file://` und `Function.prototype.toString` sind dort standardgemäß vorgesehen, aber nicht getestet.
- **Audio unter Last** wurde nicht gehört.

**Bekannte Grenzen des Umbaus**
- **Einzelne lange Bilder bleiben:** etwa ein 188-ms-Task beim Pinsel und eine einzelne Spitze beim Zoomen.
  Ihre Ursache ist nicht zugeordnet.
- **Verzögerte Bestätigung:** Spieleraktionen zeigen ihr Ergebnis, sobald der Worker zwischen zwei Ticks dazu
  kommt, also bis zu eine Tick-Dauer später (typisch 30–90 ms, selten mehr). Ausgenommen sind die vorhergesagten:
  Pinsel, Gelesen-Markierungen, Regler, Tempo. Das Untersuchen-Fenster öffnet sofort, die Kosten folgen.
- **Katastrophen:** Zwischen dem Ende der Vorankündigung und der Hauptanimation kann ebenso eine Tick-Dauer liegen.
  Die Animation startet, wenn der neue Zustand die Katastrophe enthält.
- **Meilenstein-Pause:** Sie greift wie bisher aus der Oberfläche (etwa 10 Hz), jetzt plus einer Nachrichtenlaufzeit.
  Es können ein bis zwei Ticks mehr vergehen als bisher. Die Dinosaurier-Entscheidung hält die Welt dagegen weiter
  im Kern an.
- **Direktmodus:** Er rechnet die Simulation wie bisher im Bild und blockiert dabei. Er profitiert aber vom
  Landschafts-Worker, wo einer läuft.
- **Determinismus:** Worker und Seite liefern für dieselben geordneten Befehle denselben Planeten. Eine
  Ausnahme besteht schon seit jeher: Öffnet man im Direktmodus den Evolutionsbaum, wärmt das den Vorbereitungs-
  Cache der Flora (`FloraSystem.prepare` ohne `force` in `FloraSystem.step`). Der nächste Tick nutzt dann Werte
  von vor dem Klimaschritt. Im Worker-Modus betrifft das nur den Spiegel, nicht die Simulation. Ein `force` in
  `FloraSystem.step` würde das beheben, ändert aber die Entwicklung aller Seeds. Das ist eine eigene Entscheidung.
- **Testabläufe:** Testhelfer und Headless-Probe ticken absichtlich weiter in ihrer abweichenden Reihenfolge
  (`SimCore.harnessTick`).
- **Speichern:** `localStorage.setItem` bleibt synchron im Hauptthread (gemessen ≤ 2–3 ms für ≈ 0,5 MB).
  Ein Wechsel zu IndexedDB wäre eine eigene Kompatibilitätsentscheidung.
- **Übertragung:** Jeder Zustand überträgt alle Weltarrays (≈ 5 MB, 34 MB/s bei „Schnell“). Nur geänderte
  Arrays zu senden, wäre der nächste Schritt, falls Übernahme und Kopie auf schwächeren Rechnern spürbar werden.
- **Speicher:** Die Worker belegen zusammen etwa 30–50 MB Heap zusätzlich.
- **Werkzeuge:** Seiten, die `SE.app` synchron fernsteuern, brauchen den Direktmodus. Seiten mit `_preview.js`
  bekommen ihn automatisch; `intro-record` und `launch-record` hängen `?sim=direct` an.

**Weitere Parallelisierung (Schritt 7) – bewertet, nicht umgesetzt**
- **Mehr Fach-Worker:** `LifeSystem.stepLife` macht allein über die Hälfte eines Ticks aus und liest und
  schreibt dieselben Arrays wie Flora, Biome, Klima und Evolution. Mehrere Fach-Worker müssten den Zustand pro Tick
  mehrfach austauschen. Die Systeme hängen in fester Reihenfolge voneinander ab und ziehen aus demselben `world.rng`.
- **Räumliche Aufteilung:** Sie wäre nur für Rechnungen ohne Zufallszüge und ohne Nachbarschaftsabhängigkeit über
  die Teilränder hinweg deterministisch zusammenzuführen. Das erfordert eine eigene Prüfung der Systeme.
- **Bewertung:** Der Gewinn für die Darstellung wäre gering, weil die Simulation die Darstellung nicht mehr
  blockiert. Er läge nur im Simulationstempo bei Überlast. Erst bei Bedarf und mit Messung angehen.
- **Zweiter Landschafts-Worker:** Möglich, war aber nicht nötig. Der eine Landschafts-Worker hält mit, 60–130
  Chunks/s bei höchstens 6 Aufträgen gleichzeitig.

**Manuell zu prüfen**
- Spielen im echten Chrome-Fenster und auf einem schwächeren Rechner, mit F3: Bildrate, „Worker: Zustand …“-Zeile
- Firefox, Safari und Edge über `file://` (startet der Worker? Erscheint der Planet?)
- Pinselstriche: Gefühl, Auflösen am Strichende, Nachziehen der Landschaft
- Komet und Dinosaurier-Entscheidung im Worker-Modus
- Raketenstart samt Film
- Meilenstein-Pause
- Laden und Speichern mehrerer Spielstände
- Ton bei vielen Katastrophen

## 7. Werkzeuge und Prüfungen

**Messwerkzeug** `tools/perf-bench.js`:

- `saves` spielt die Szenario-Planeten in Node und legt sie in `tmp/perf/` ab:
  - Biosphäre: Seed 12345, 1500 Ticks mit gierigem Baum
  - Zivilisation: weitergespielt bis zur Intelligenz, dann 40 Städte aller Epochen und 200 Ticks
- `systems` misst jedes System einzeln in Node.
- `browser` misst in Headless-Chrome:
  - Bildabstände und Bildarbeit (p50/p95/p99)
  - Anteil über 16,7 ms, lange Tasks
  - Tick-Zeiten, Ticks/s, Zustandsalter
  - Feld-Refresh, Nachrichten pro Sekunde und Volumen
  - Heap von Seite und Workern
  - Dauer von `localStorage.setItem`

Eingaben laufen über echte Maus-, Tasten- und Mausradereignisse.

**Abgleich mit der Referenz:**
- Bisheriger `App.tick`-Ablauf (altes Bundle) gegen `SimCore.tick` (neues Bundle): 400 Ticks mit Spielzügen ergeben
  einen bitgleichen Hash über alle Weltarrays, Skalare, Zufallszustand, Baum, Chronik, Katastrophen und Städte.
- Alter Testhelfer-Tick gegen `SimCore.harnessTick`: bitgleich.
- Headless-Probe alt gegen neu: identische Ausgabe bis auf die Zahl der Herdensymbole. Diese hängt schon im
  alten Code von `Math.random` in der Herden-Darstellung ab und schwankt auch zwischen zwei alten Läufen.

**Tests** `tests/simworker.test.js` (Worker in einem `worker_threads`-Thread, eigenes Realm wie im Browser):
- gleiche Befehle → bitgleicher Planet im Worker und auf der Seite
- nach „Neuer Planet“ kein Zustand und keine Antwort des vorigen Planeten
- Speichern und Laden im Worker, Ergebnis gleich wie auf der Seite; ein kaputter Spielstand ändert nichts
- Worker-Absturz: Übernahme durch die Seite, der schuldige Befehl wird nicht wiederholt, die übrigen laufen

**Browser-Funktionsprüfung** über `file://` im Worker- und im Direktmodus, alles bestanden:
- erster Planet, neuer Planet aus Startwert
- Entwickeln
- Zeitlauf und Pause
- Leben ansiedeln
- Pinselstrich über echte Mauseingaben (Höhe ändert sich in der Simulation)
- Vulkan über den Ein-Feld-Ablauf
- Speichern und Laden (pausiert, gleicher Tick)
- Worker-Absturz im laufenden Spiel: Übernahme, Pause, Zeit läuft auf der Seite weiter

**Projektprüfungen** (AGENTS.md):
- Auf dem Endstand mit allen Korrekturen aus Abschnitt 9:
  - `npm run typecheck`: sauber
  - `npm run test:quick`: 290 bestanden
  - `tests/simworker.test.js`: 5 bestanden
  - Browser-Funktionsprüfung in beiden Modi: bestanden
- `npm run test:full` lief vor den Korrekturen aus Abschnitt 9: 449 Tests, davon 447 bestanden. Beide
  Fehlschläge treten auf dem unveränderten Stand 3f17bb4 genauso auf:
  - `herds.test.js` „every living sub-species keeps a creature of its own“: Dinosaurier Stufe 3 ohne Herdensymbol
  - `evolution.test.js` „the full tree is reachable plants first, most expensive first“ (Seed 31337): 30 von 31
    Schritten. Die Reihenfolge der Schritte und der Haltepunkt sind auf 3f17bb4 bitgleich.
- Nach den Korrekturen wurde die volle Suite nicht erneut ausgeführt.

## 8. Abweichungen vom vorgeschlagenen Aufbau

- **Feld-Refresh im Landschafts-Worker:** Der Landschafts-Worker setzt nicht nur Chunks zusammen, er aktualisiert
  auch das Terrain-Feld. Nach dem ersten Schritt war der volle Feld-Refresh bei jeder Plattenverschiebung
  (35–40 ms im Hauptthread) die größte verbliebene Spitze.
- **Direkte Leitung zwischen den Workern:** Der Simulations-Worker schickt seine Zustände über einen
  MessageChannel direkt an den Landschafts-Worker. Der Hauptthread kopiert sie dafür nicht ein zweites Mal.
- **Seitenfeld beim Pinseln:** Während eines Pinselstrichs (und bei ausgeschalteter Meeresebene) setzt der
  Landschafts-Worker die betroffenen Chunks aus einer Kopie des Seitenfelds zusammen. Das vorhergesagte Feld der
  Seite ist dort dem eigenen voraus.
- **Teil-Neuzeichnen:** Eingetroffene Chunk-Bilder zeichnen nur ihren eigenen Bereich der Kartenbasis neu,
  nicht die ganze Basis.
- **Keine Lastregelung der Darstellung:** Auf Wunsch wird keine visuelle Arbeit reduziert (keine Partikel-,
  Animations-, Auflösungs- oder Aktualisierungsdrosselung).
- **Kein OffscreenCanvas-Rendering:** Die Darstellung bleibt im Hauptthread. Ihre Arbeit liegt im Median bei
  4–8 ms je Bild, und die Zeichenebenen hängen eng am DOM. Für schwächere Rechner wären die nächsten Kandidaten
  das Zwischenspeichern der Kartenbasis-Ebenen und erst danach eine OffscreenCanvas-Lösung (Abschnitt 6).
- **Messbedingte Korrektur:** `fitCanvas` liest die Canvas-Größe jetzt aus einem ResizeObserver statt jedes Bild
  aus `getBoundingClientRect`. Das vermeidet ein erzwungenes Layout je Bild.

## 9. Unabhängige Prüfung

Ein separater Prüfdurchgang hat den fertigen Code ohne Ausführung gegen die Anforderungen gelesen. Behoben:

1. **Katastrophe ohne Bezahlung:** Im Worker-Modus konnte eine Katastrophe ohne Bezahlung starten, wenn der
   Spiegel beim Klick einen veralteten Energiestand zeigte. Jetzt legt `payHazard` eine Marke an. `startHazard`
   braucht und verbraucht sie, und nur Bezahltes wird bei einem Fehlschlag gutgeschrieben (Test in
   `tests/simworker.test.js`).
2. **Tick-Salve:** Nach Pause, Halt oder Laden lief eine Salve von Ticks. Der Takt des Workers beginnt danach
   jetzt neu.
3. **Verdeckter Tab:** Der Planet lief im Hintergrund weiter (vorher stand er mit dem Bildtakt still). Jetzt hält
   der Worker an, solange der Tab verdeckt ist.
4. **Fehler in einem Ergebnis-Rückruf** konnten eine unnötige Übernahme mit doppelter Ausführung auslösen. Rückrufe
   sind jetzt einzeln abgesichert, die Quittung geht immer zurück, und bei einer Übernahme wird nichts wiederholt,
   was der Worker schon angewandt hatte.
5. **Pinsel-Nacharbeit unsichtbar:** Die Nacharbeit eines Pinselstrichs blieb bei pausiertem Spiel unsichtbar.
   Das zurückgehaltene Feld wird jetzt übernommen, sobald der Pinsel ruht.
6. **Fehlgeschlagenes Laden:** Ein fehlgeschlagenes Laden verwarf Meldungen und Rückrufe des weiterlaufenden
   Planeten. Die Sitzung wechselt jetzt erst, wenn das Laden gelungen ist.
7. **„Simulation angehalten“** ließ sich nicht verlassen. Neuer Planet und Laden beenden den Zustand jetzt.
8. **Kartenhaltung:** `holdWorld`, `launching` und `fateAsking` werden bei neuem Planeten und beim Laden
   zurückgesetzt.
9. **Kurzer Meteor:** Die Animation eines Meteors, der nur einen Schritt dauert, ging im Worker-Modus verloren.
   Das Ergebnis trägt jetzt die Daten für die Animation.
10. **Regler** senden nur noch ihre eigene Gruppe.
11. **Entdeckungen** des alten Planeten werden beim Laden verworfen.
12. **Speichern** hält Ticks und Befehle während der Kompression nicht mehr an.

Außerdem behoben:
- Antworten des Landschafts-Workers räumen nur noch ihren eigenen Auftrag ab.
- Felder eines noch nicht angezeigten Planeten warten.
- Schnappschuss und Untersuchen lesen das Feld bei Bedarf selbst.
- Späte Nachrichten eines abgelösten Workers werden ignoriert.

Bewusst offen (Abschnitt 6):
- Die Meilenstein-Pause kommt ein bis zwei Ticks später.
- Während eines Ladevorgangs geschickte Befehle wirken auf den geladenen Planeten, ihre Rückmeldung entfällt.
- Bis der erste Zustand eintrifft (≈ 0,5 s nach dem Start), zeigt der Titel einen leeren Globus.
- Ein doppelter Klick auf „Entwickeln“ meldet ein zweites Mal „bereits entwickelt“.
- Lehnt der Worker das Untersuchen ab (seltener Wettlauf), bleibt das Fenster offen.
