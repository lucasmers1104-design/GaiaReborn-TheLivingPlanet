# Kohle und das Ende der Schuppenbäume

Stand: 15. 10. 2026. Umgesetzt nach dem Plan aus Phase 0 und den Entscheidungen vom selben Tag.

## 1. Was sich ändert

**Kohlevorrat** (`src/coal.ts`)
- Ein einziger weltweiter Wert in Gigatonnen (Gt). Er wird nicht pro Feld geführt und ist auf der Karte nicht zu sehen.
- In jedem Jahr legen Sumpf- und Sumpfwaldfelder mit dichter Pflanzendecke Torf ab. Die Menge richtet sich nach der Fläche
  und der Deckung:
  - Sumpfwälder mit Schuppenbäumen ohne Nadel- oder Laubbäume zählen voll.
  - Alle späteren Sümpfe zählen ein Zehntel (`COAL_LATER`), offene Sümpfe die Hälfte (`COAL_MARSH`).
- Torf reift mit einer Halbwertszeit von 5 Mio. Jahren zu nutzbarer Kohle. In der Zeitskala Zivilisation (100 Jahre pro Tick)
  und der Zeitskala Technologie (10 Jahre pro Tick) entsteht deshalb praktisch keine neue Kohle.
- Zivilisationen ab dem Industriezeitalter bauen den Kohleanteil ihrer fossilen Energie ab: 90 % im Industriezeitalter,
  danach 40 %. Abgebaute Kohle ist verbraucht.
- Kohle ist in diesem Schritt reine Statistik. Die CO₂-Rechnung bleibt unverändert, ein leerer Vorrat hat noch keine Folgen.
- Schnittstelle für die Zivilisation: `coalReserve`, `mineCoal`, `coalDemand` (siehe `docs/zivilisation-spec.md` §2.9).

**Riesenbärlappe** (`src/lycopsids.ts`)
- *Sporenflug:* Solange es Schuppenbäume gibt, erreichen Bärlapp-Sporen jedes geeignete Feld auf dem Planeten.
  Vorher kam Bärlapp kaum über das Feuchtgebiet hinaus, in dem er entstand. Das ist die einzige Balance-Änderung.
- *Verdrängung:* Auf Feldern mit Nadel- oder Laubbäumen sterben Bärlappe ab. Ausnahme sind Feuchtgebiete; dort bleiben
  sie, prägen das Feld aber nicht mehr. Samenfarne und Palmfarne verdrängen sie nicht.
- *Ende der Schuppenbäume:* Prägen Nadel- und Laubbäume zusammen 10 % des Landes, sind die Schuppenbäume für immer
  verschwunden. Die Chronik meldet das einmal. Danach:
  - wächst Bärlapp als niedriges Kraut,
  - zählt er nicht mehr als Holzgewächs und bildet allein keinen Sumpfwald mehr,
  - wird er auf der Karte nicht mehr gezeichnet, steht aber weiter im Untersuchen-Fenster.
- *Kein Aussterben durch Konkurrenz:* Sinkt der Bestand unter 60 Felder, halten sich die letzten Bärlappe auch an Flussufern
  neben ihren Konkurrenten. Ein Klima, das alle Lebensräume vernichtet, kann die Gruppe trotzdem auslöschen, wie jede
  andere auch.
- Texte im Evolutionsbaum und in der Geschichte der Gruppe sind ergänzt. Die Fakten stehen in der Quellenprüfung,
  Prüfpunkt 18.

**Anzeige**
- Kurve „Kohlevorrat“ im Fenster „Verlauf“.
- Kachel „Kohlevorrat“ im Fenster „Technologie“, sobald abgebaut wird auch „Abgebaute Kohle“.

**Speichern**
- Die Formatnummer bleibt. Es gibt ein neues optionales Feld `coal`: Vorrat, Torf, abgebaute Menge und Schalter.
- Fehlt das Feld oder ist es beschädigt, wird geschätzt (`src/coalsave.ts`):
  - der Vorrat aus den Entwicklungsdaten von Bärlapp und Nadel- bzw. Laubbäumen,
  - der Schalter aus den Wäldern mit Nadel- oder Laubbäumen.
- Ein so geschätztes Ende steht still in der Chronik und erscheint nicht als neue Meldung.
- Alte Verläufe zeigen die Kohlekurve bis zum Laden mit 0.

## 2. Messung (gieriger Evolutionsbaum, Headless, ohne Zeitskalenwechsel)

| Seed | Sumpfwald im Karbon (Anteil am Land) | Nadelbäume entwickelt | Schuppenbäume enden | Kohle in der Gegenwart | davon aus Schuppenbaum-Sümpfen | Bärlapp in der Gegenwart |
|---|---|---|---|---|---|---|
| 12345 | 2,7–3,2 % (vorher 0,3 %) | 268 Mio. J. | 176 Mio. J. | 16.000 Gt | 91 % | 0,3 % |
| 2024 | 1,6 % (vorher 0) | 182 Mio. J. | 74 Mio. J. | 12.200 Gt | 97 % | 1,3 % |
| 99 | 5,0 % | 270 Mio. J. | 153 Mio. J. | 25.800 Gt | 93 % | 0,1 % |

- Die Sumpfwaldfläche ist durch die Fläche der Feuchtgebiete begrenzt. Seed 2024 hat zu wenig davon für 2 %, Seed 99 so
  viel, dass es 5 % werden.
- Bärlapp prägt auf Seed 12345 um 297 Mio. J. 1.053 Felder. Ab dem Auftreten der Nadelbäume geht das zurück: 727 Felder
  um 260 Mio. J., 443 um 186 Mio. J., 22 um 171 Mio. J. Bis 126 Mio. J. sinkt sein Anteil am Land von 10 % auf 6 %.
- Verbrauch (Seed 12345, Zeitskalen wie im Spiel): Bei Intelligenz um 75 Mio. J. liegen 15.500 Gt vor. 63 Industriestädte
  verbrauchen etwa 8 Gt im Jahr, ungefähr so viel wie die Erde heute. Bei diesem Verbrauch reicht der Vorrat etwa
  2.000 Jahre, in den späteren Zeitaltern mit höherem Energiebedarf weniger.
- Die Spielmenge von 12.000–26.000 Gt liegt in der Größenordnung der heutigen Kohleressourcen der Erde (Quellenprüfung,
  Prüfpunkt 18).

## 3. Bilder

Seed 12345, Karbon (316 Mio. J.): Schuppenbäume säumen die Flüsse im Sumpfwald.

![Sumpfwald mit Schuppenbäumen im Karbon](karbon-sumpfwald.png)

Dieselbe Stelle in der Kreide (125 Mio. J.), nach dem Ende der Schuppenbäume: Nadelwald, kein Schuppenbaum mehr.

![Dieselbe Stelle nach den Schuppenbäumen](nach-den-schuppenbaeumen.png)

Kachel „Kohlevorrat“ im Fenster „Technologie“ und Legende der Kurve im Fenster „Verlauf“. Die Kurve selbst verdeckt hier
das Technologie-Fenster; sie ist durch einen Test abgedeckt, aber nicht im Bild geprüft.

![Kohlevorrat in der Statistik](statistik.png)

## 4. Einschränkungen

- Geprüft mit Node-Tests, Headless-Läufen und Headless-Chrome. Nicht geprüft:
  - andere Browser, echte Touch-Geräte,
  - Speichern und Laden im Browser,
  - die Verlaufskurve im Bild.
- Auf dem Startplaneten „Heute“ (Seed 12345, gieriger Lauf) kommt keine Landpflanzengruppe über ein Feld hinaus, auch
  ohne diese Änderung. Dort entstehen nie Nadelbäume, und die Schuppenbäume enden nie. Bärlapp breitet sich mit dem
  Sporenflug als einzige Landpflanze aus.
- Auf Seed 2024 bleiben Moose und Farne lange bei etwa 12 Feldern (der bekannte Stillstand). Die Nadelbäume kommen spät,
  und die Schuppenbäume halten sich bis 74 Mio. J.
- Auf zwei Seeds verschwinden im Quartär alle Feuchtgebiete, weil sich der Planet abkühlt. Bärlapp hält sich dann nur über
  die Rückzugsregel.
- Der Auslöser für das Ende der Schuppenbäume ist im Spiel die Konkurrenz. Auf der Erde war es vor allem das trockener
  werdende Klima um 305 Mio. J.
- Folgen eines leeren Vorrats und die Kopplung an den CO₂-Kreislauf fehlen noch, ebenso Kohlevorkommen pro Feld.

## 5. Nachtrag: Erdöl (20. 10. 2026)

**Ölvorrat** (`src/oil.ts`)
- Wie die Kohle ein einziger weltweiter Wert in Gt, nicht pro Feld und nicht auf der Karte.
- Abgestorbene Meerestiere sinken zum Meeresboden. In jedem Jahr wird Kerogen abgelagert, im Verhältnis zur summierten
  Dichte aller Meerestierklassen (Schwämme und Nesseltiere bis Wale; Einzeller zählen nicht).
- Kerogen reift mit einer Halbwertszeit von 20 Mio. Jahren zu Öl. In den Zeitskalen Zivilisation und Technologie
  entsteht praktisch keins.
- Rechenaufwand: Der Schritt liest nur die Summen je Tierklasse, die `refreshDerived` ohnehin bildet. Es gibt keine
  eigene Schleife über die Felder.
- Ab dem Industriezeitalter fördern die Städte den Ölanteil ihrer fossilen Energie: 10 % im Industriezeitalter, danach
  45 %. Gefördertes Öl ist verbraucht. Wie bei der Kohle bleibt die CO₂-Rechnung unverändert.
- Anzeige: Kurve „Ölvorrat“ im Fenster „Verlauf“. Kacheln „Ölvorrat“ und „Gefördertes Öl“ im Fenster „Technologie“.
  Im Fenster „Bericht“ stehen unter „Zivilisation“ Kohle- und Ölvorrat.
- Karte: Mit dem Industriezeitalter erscheinen einmalig eine Bohrinsel vor der Küste und ein Förderturm mit
  Pferdekopfpumpe in der Wüste, beide animiert (Einzelheiten: `docs/zivilisation-spec.md` §2.9).
- Speichern: neues optionales Feld `oil` (Vorrat, Kerogen, gefördert, Standorte der Bohrtürme), die Formatnummer bleibt. Fehlt das Feld, wird der
  Vorrat aus der Zeit seit den ersten Meerestieren geschätzt (`OIL_EST_YEAR`).

**Messung** (gieriger Evolutionsbaum, Headless, Zeitskalen wie im Spiel, Komet)

| Seed | erste Meerestiere | Intelligenz | Öl bei Intelligenz | Kohle bei Intelligenz | Öl aufgebraucht nach |
|---|---|---|---|---|---|
| 12345 | 4.043 Mio. J. | 4.419 Mio. J. | 1.361 Gt | 8.104 Gt | ca. 4.000 Jahren Industrie |
| 2024 | 4.043 Mio. J. | 4.375 Mio. J. | 890 Gt | 3.550 Gt | ca. 4.700 Jahren Industrie |

- Öl zu Kohle steht im Spiel bei etwa 1 : 4 bis 1 : 6. Die nachgewiesenen Reserven der Erde liegen bei etwa 1 : 4,5
  (rund 240 Gt Öl zu 1.070 Gt Kohle).
- Im Industriezeitalter ist der Ölanteil klein. Deshalb ist auf beiden Seeds zuerst die Kohle verbraucht und das Öl
  erst etwa 1.500 Jahre später.
- Nicht geprüft: Speichern und Laden im Browser, andere Browser.
