# Evolutionsmomente – Oktober 2026

Zwei Ergänzungen zum Evolutionsbaum:

1. **Die Natur wartet nicht ewig.** Ein Schritt, dessen Bedingungen lange erfüllt sind, kann mit
   kleiner, wachsender Wahrscheinlichkeit von selbst entstehen – ohne Evolutionspunkte und ohne
   Klick des Spielers.
2. **Jede neue Entwicklung bekommt ihren Moment**, ob gewählt oder von selbst. Dazu gehören:
   - Lichtexplosion und Klang;
   - ein Fenster mit einem 12-Sekunden-Trickfilm, der **den Vorgang zeigt** – was sich verändert hat
     und was dadurch erreicht wurde;
   - vier Bildunterschriften im Takt des Films;
   - Datum und Erdzeitalter;
   - eine kurze Erklärung;
   - der benannte **Durchbruch** und **warum er sich durchsetzte**;
   - ein „Wusstest du?“.

Bilder:

| Datei | Inhalt |
|---|---|
| `evolution-durchbruch.png` | Desktop im Durchbruch-Takt |
| `evolution-durchbruch-mobil.png` | Telefon im Durchbruch-Takt |
| `evolution-von-selbst.png` | ein Schritt, der von selbst entstanden ist (erste Filmfassung) |
| `evolution-effekt.png` | Partikel auf der Karte |
| `evolution-alle-filme.png` | alle 31 Filme im Durchbruch-Takt |

Die Drehbücher aller Filme stehen in `drehbuecher.md`.

## 1. Von selbst entstehen (`src/spontaneous.ts`)

- **Bereit** ist ein Schritt, wenn alle Bedingungen außer den EP-Kosten erfüllt sind
  (`EvolutionSystem.isReady`). Ab diesem Zeitschritt läuft eine Uhr (`readySince`). Fällt eine
  Bedingung weg, beginnt sie von vorn.
- **Schonfrist:** In den ersten 120 Zeitschritten passiert nichts. So kommt der Spieler zuerst zum Zug.
- **Danach** wächst die Chance je Zeitschritt linear von 0,1 % bis zu einer Obergrenze von 0,8 %.
  Sie wird mit dem Regler „Evolutionstempo“ multipliziert.

  | Zeit nach der Schonfrist | 100 Schritte | 220 | 500 |
  |---|---|---|---|
  | kumulierte Chance (Regler auf Standard) | ≈ 18 % | ≈ 50 % | ≈ 94 % |
  | bereit insgesamt, bei mittlerer Geschwindigkeit | ≈ 1,5 min | ≈ 2,3 min | ≈ 4 min |

- Geprüft wird alle 6 Zeitschritte. Je Prüfung entsteht höchstens ein Schritt.
- **Der Zufall verschiebt nichts:** Gewürfelt wird mit einem Hash aus Planetensamen, Zeitschritt und
  Schritt, nicht mit dem Zufallsgenerator der Simulation. Ein Planet verläuft daher mit und ohne
  diese Regel bis zum ersten spontanen Schritt gleich.
- Ein spontaner Schritt kostet keine EP. Er wird vermerkt:
  - im Spielstand (`spontaneous`);
  - in der Chronik, mit dem Abzeichen „Von selbst entstanden“;
  - im Baum („Von selbst entstanden vor …“).

  Bei bereiten Schritten zeigt der Baum einen Hinweis, dass sie auch von selbst entstehen können.
- Der Spielstand speichert die Uhren (`ready`). Ältere Spielstände laden ohne sie, die Uhren
  beginnen dann neu.

## 2. Der Moment (`src/showcase.ts`, `src/celebrate.ts`)

- **Effekt:** Vom Abzeichen des Schritts aus starten ein Lichtblitz, ein Ring und rund anderthalb
  Sekunden Partikel im Stil des Reichs: Blätter für Pflanzen, warme Funken für Tiere, Bläschen für
  die ersten Zellen. Dazu erklingt ein heller Vier-Ton-Akkord in C-Dur. Bei spontanen Schritten
  steht er in E-Dur, also eine große Terz höher.
- **Film:** 12 Sekunden in vier Takten: vorher, Wandel, Durchbruch, Folge.
  - Die Bildunterschriften wechseln bei 0,3 / 3,3 / 6,3 / 9,3 s.
  - Im dritten Takt trägt die Unterschrift die Marke „✦ Durchbruch“ und leuchtet in der Farbe des
    Reichs. Gleichzeitig funkelt der Film genau auf der Neuerung.
  - Ein Strich zeigt den Fortschritt, „Film noch einmal“ spielt ihn erneut ab.
  - Ein Stempel nennt Datum und Erdzeitalter.
- **Text:**
  - Titel, Reich und Zähler („2 von 31“);
  - die Erklärung;
  - zwei Kästen, auf dem Desktop nebeneinander, auf dem Telefon untereinander:
    - **„✦ Durchbruch“** mit dem Namen der Neuerung und dem Vorteil, der sie häufiger werden ließ;
    - **„Wusstest du?“**;
  - die Spielwirkung.
- **Knöpfe:**
  - „Im Evolutionsbaum“;
  - „Auf der Karte zeigen“: springt zum Ort, an dem die Gruppe zuerst auftrat;
  - „Weiter“.
- **Bedienung:**
  - Esc, ein Klick daneben oder „Weiter“ schließen das Fenster.
  - Nach 30 s ohne Blick schließt es von selbst; solange der Zeiger darauf liegt, bleibt es offen.
  - Der Fokus springt auf „Weiter“ und danach zurück.
  - Die Bildunterschrift wird für Vorleser angesagt.
- **Reihenfolge:** Es ist immer nur ein Fenster offen, nie über einem Meilenstein. Entstehen mehrere
  Schritte kurz nacheinander, kommen sie der Reihe nach. „Bei Meilensteinen anhalten“ gilt auch hier.
- **Einstellungen:**
  - Der Menüpunkt „Klang bei neuen Entwicklungen“ ist standardmäßig an.
  - Bei „Bewegung reduzieren“ des Systems bleibt nur der Lichtblitz übrig. Der Film zeigt dann sein
    Schlussbild: Alle Zeitraffer-Stufen sind durchlaufen, statt übereinander zu liegen.

## 3. Die Filme: Vorgang statt Pose

Die erste Fassung zeigte jedes Lebewesen in seiner Welt. Die zweite zeigt, **was geschah**.

| Mittel | Einsatz |
|---|---|
| **Zeitraffer über Generationen** (`morph()`) mit einer Plakette (`timelapse()`), die Gattungen und Zeiten nennt | Kein einzelnes Tier verwandelt sich, sondern die Linie über Jahrmillionen. Beispiel Wale: Pakicetus → Ambulocetus → Rodhocetus → Dorudon. |
| **Lupe** (`lens()`) | Für Winziges: Zellinneres, Augenlinsen, Atemlöcher, das Amnion im Ei, Zähne und Zehen. |
| **Röntgenblick** | Für Verborgenes: Kiemenbögen, die zum Kiefer werden; Nervenstrang und Gehirn; die Beinstellung. |
| **Beschriftungen** (`tag()`) | Höchstens drei je Film, mit denselben Begriffen wie im Text. |

**Das Prinzip der Evolution** zieht sich durch alle Texte. Der Kasten „Durchbruch“ erklärt jeden
Schritt als Auslese, nie als Absicht: „Wer …, hinterließ mehr Nachkommen“. Der erste Film zeigt das
Prinzip selbst: Eine Zelle teilt sich mit einem Kopierfehler, und diese Variante vermehrt sich
schneller.

**Besondere „Erste“:**

| Erstes | Film |
|---|---|
| Nerven und Muskeln | Qualle |
| Gehirn und Augenflecken | Frühe Zweiseitentiere |
| Linsenaugen | Trilobit |
| Kiefer | Fische |
| Atmen an der Luft | Landgliederfüßer |
| Flug | Insekten |
| Ei mit Schale | Reptilien |
| warmes Blut | Säugetiere |

**Fachliche Grundlage:** Die Texte folgen der Quellenprüfung in
`docs/ueberarbeitung-2026-10/quellenpruefung.md`. Die Daten sind gerundet („rund“, „über“) und
folgen jeweils dem ältesten gut belegten Fossilbefund. Was umstritten ist, ist als „vermutlich“
gekennzeichnet, zum Beispiel der Ursprung des Lebens und der Insektenflügel.

**Herstellung:**

- Vier Vorbildfilme habe ich selbst gebaut: erste Zelle, Mitochondrien, Wal, Amphibien.
- Die übrigen 27 haben vier parallel arbeitende Agenten nach den Drehbüchern gezeichnet: Meer, Grün,
  Samen & Blüten, Landtiere.
- Jeden Film habe ich danach aus dem fertigen Build Bild für Bild geprüft. Zwei wurden nachgebessert:
  das Kohleflöz bei den Bärlappen und die Lupen bei den Huftieren.

**Abweichungen von den Drehbüchern, die übernommen wurden:**

- Die Beute der Qualle ist eine Larve, denn Krebse gab es erst rund 90 Mio. Jahre später.
- Die Kopffüßer-Schale ist ein gerader Nautiloideen-Kegel, wie er zur Zeit passt.
- Zwischen Wespe und Biene liegt ein Zeitraffer.
- Der Vogelfilm endet mit „150 Mio. J. → 66 Mio. J. → heute“.
- Der kriechende Vorfahr der Dinosaurier ist von vorn gezeigt, damit man das Schlängeln sieht.

## 4. Neue und geänderte Dateien

- **Logik:**
  - `src/spontaneous.ts`: Regel und Zahlen.
  - `src/stories-plants.ts` und `src/stories-animals.ts`: vier Takte, Durchbruch (`innovation`) und
    Vorteil (`advantage`) je Schritt.
- **Darstellung:**
  - `src/scenekit.ts`: 12 s und vier Takte; neu sind `during()`, `morph()`, `timelapse()`, `tag()`
    und `lens()`.
  - Ein Film je Datei (`src/films/<schritt>.ts`, 31 Dateien), gemeinsame Zeichnungen je Gruppe in
    `src/films/parts-{sea,green,bloom,land}.ts`.
  - `css/films.css`: neue Bewegungen `o-rotate`, `o-scale` und `m-twist`, dazu das Schlussbild bei
    „Bewegung reduzieren“.
  - `css/films-{origin,sea,green,bloom,land}.css`: Keyframes der einzelnen Szenen.
  - `src/showcase.ts` und `css/showcase.css`: Unterschrift „Durchbruch“ und die beiden Kästen;
    `src/celebrate.ts`; das Symbol `assets/ui/replay.svg`.
- **Geändert:**
  - `src/evolution.ts`: `isReady`, `develop(…, 'spontaneous')`, `spontaneous()`, `readySince` und
    der Fundort `at` in der Chronik.
  - `src/save.ts` und `src/world.ts`: Uhren und Kennzeichen speichern bzw. kopieren.
  - `src/notify.ts`: Evolutionsereignisse gehen an das Fenster.
  - `src/app.ts`: Fenster, Klang-Einstellung, „Auf der Karte zeigen“.
  - `src/tree.ts` und `src/panels.ts`: Hinweise und Abzeichen.
- **Tests:**
  - `tests/spontaneous.test.js` (6 Tests) prüft:
    - Schonfrist, Wachstum und Obergrenze der Chance;
    - dass der Wurf feststeht und gleichverteilt ist;
    - dass ein bereiter Schritt ohne EP entsteht;
    - dass die Uhr nach Wegfall einer Bedingung neu beginnt;
    - die Verdrahtung im Zeitschritt;
    - das Speichern und Laden.
  - `tests/films.test.js` (2 Tests) prüft je Schritt:
    - vier kurze Takte und einen kurzen Durchbruch-Namen;
    - die Länge von Vorteil, Erklärung und Fakt;
    - ein wohlgeformtes SVG;
    - **das Funkeln im Durchbruch-Takt (6–8 s)**;
    - keine Skripte, kein SMIL, keine Filter und keine externen Quellen;
    - eindeutige IDs;
    - dass der Film bei jedem Aufruf gleich ist.

## 5. Prüfungen (tatsächlich ausgeführt)

| Prüfung | Ergebnis |
|---|---|
| `npm test` auf dem Endstand | 40/40 bestanden |
| Alle 31 Filme, einzeln nacheinander in Chrome (headless) aus dem fertigen Build, je vier Bilder bei 1,6 / 4,6 / 7,4 / 11,8 s | keine Konsolenfehler, alle Bilder begutachtet |
| Popup im Spiel (`index.html`, erste Zelle entwickeln, Bild bei 6,9 s), Desktop 1440 × 900 und Telefon 390 × 844 | „✦ Durchbruch“-Unterschrift und beide Kästen sichtbar. Auf dem Telefon verdeckte der Datumsstempel eine Beschriftung; dort ist er jetzt kompakter. |
| Ablauf „von selbst entstanden“ | in der ersten Fassung geprüft; Regel und Weg dorthin sind unverändert |

## 6. Einschränkungen

- Nur in Chrome geprüft (headless, ohne GPU). Firefox, Safari, echte Telefone und der Klang sind
  ungeprüft.
- Die Filme sind stilisiert und verdichten Jahrmillionen auf Sekunden. Bewusste Vereinfachungen:
  - **Erste Zelle:** Die Helix steht für ein frühes Erbmolekül, vermutlich RNA. Wie das Leben
    begann, ist offen, und der Text sagt das.
  - **Erste Landpflanzen:** Die Ozonschicht „entsteht“ im Film, bestand aber schon lange vor
    470 Mio. Jahren. Der Film zeigt die Voraussetzung, nicht den Zeitpunkt.
  - **Samenpflanzen:** Film und Text beschreiben den typischen Samen. Die allerersten Samen hatten
    vermutlich noch keine Ruhephase.
  - **Nadelbäume:** Die Zapfen sind modern stilisiert. Geflügelte Samen sind um 300 Mio. Jahre
    belegt.
  - **Insekten:** Der Ursprung der Flügel ist umstritten. Der Film zeigt wachsende Flügellappen und
    Gleiten als Zwischenstufe, der Text sagt „vermutlich“.
- Einige Filme haben etwas mehr als die angepeilten 350 SVG-Elemente, bis etwa 380. Bei Darstellung
  und Ladezeit fiel das nicht auf.
- Die Chance je Zeitschritt ist auf Spielgefühl abgestimmt, nicht auf echte Evolutionsraten.
