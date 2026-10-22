# Gaia Reborn – The Living Planet²

*Gaia Reborn – The Living Planet²* (früher: SimEarth 2.0, Arbeitstitel earthsim) ist eine Natur- und Evolutions-Sandbox im Browser, als moderner Nachfolger von *SimEarth: The Living Planet* (Maxis, 1990). Du begleitest einen Planeten von den ersten Zellen bis zur Gegenwart: Klima, Meere, Pflanzen, Tiere und schließlich Zivilisationen.

## Starten

- **Spielen:** `index.html` im Browser öffnen. Es braucht keinen Server und keine Installation. Läuft am Desktop, mit Maus und Tastatur.
- **Entwickeln:** `npm run build` baut `simulation.js`, `npm test` führt alle Tests aus. Die Regeln für Mitarbeit stehen in [AGENTS.md](AGENTS.md).

## Neu in Version 0.10.0

### Raumfahrt
- Mit der ersten Nanotech-Stadt öffnet sich das Raumfahrtprojekt: ein Startplatz in der Wüste wächst in Phasen heran.
- Im Fenster „Raumfahrt“ startet der rote Knopf die Rakete; ein 12-Sekunden-Pixelfilm zeigt den Flug, danach heißt es „Die Reise geht weiter“.

### Zeitalter der Dinosaurier
- Am Ende ihres Zeitalters entscheidest du: Schlägt der Komet ein oder überleben die Dinosaurier?
- Der Einschlag bringt einen Kometenwinter, der zwei Drittel des Planeten vereist; geschützte Rückzugsorte sichern das Weiterleben.

### Aussterben
- Unterarten verschwinden für immer, sobald sich ihr Nachfolger ausgebreitet hat. Ein R.I.P.-Stempel und Grabmarken im Lexikon erinnern an sie.

### Zivilisation
- Vor den ersten Dörfern ziehen Wandergruppen übers Land und lassen sich nieder; Lager mit Feuerstellen, Dörfer mit Flammen und Schornsteinrauch.
- Neue Erdölreserve aus abgestorbenen Meerestieren, mit Ölplattform und Bohrturm auf der Karte.

### Lebendiger Planet
- Lachse wandern flussaufwärts, Störche ziehen in V-Formation, Clownfische schlüpfen aus den Riffen, Termitenhügel stehen in der Savanne.
- Eisberge kalben, Meereis friert und taut, Wellen laufen über die Riffe, vor der Großen Sauerstoffkatastrophe perlt Sauerstoff an den Küsten.
- Animierte Wind- und Strömungskarte.

### Naturkatastrophen
- Blitze entzünden trockene Pflanzen: natürliche Waldbrände, je mehr Sauerstoff, desto häufiger. Waldbrände sind jetzt auch zu hören.

### Bedienung
- Ω-Stufen mit Obergrenze und Regeneration; Ω und EP erklären sich per Klick in einem Aufklapper.
- Ein Hinweis auf dem Spielfeld nennt den nächsten möglichen Schritt.
- Spielstandformat 10 (alte Spielstände werden weiterhin gelesen).

## Neu in Version 0.9.3

### Gaia
- Gaia schläft, bis sich das erste Leben regt, und wacht dann mit einem Jubel auf. Das Fenster ist kompakter und öffnet sich beim Spielstart von selbst.
- Die vier Stimmungsbalken sind weg; Gaia nennt ihre Sorgen im Gespräch.

### Klang
- Neuer Bass-Grollen beim Höhenpinsel; der Klick-Ton schweigt dort.

## Neu in Version 0.8.0

### Erde als Startplanet
- Neben dem Zufallsplaneten gibt es die **Erde** in zwei Epochen: **Junge Erde** (Hadaikum) und **Heute** mit den echten Kontinenten.
- Das Leben beginnt in jeder Epoche von vorn, bei „Heute“ also auf den heutigen Kontinenten.

### Zivilisation
- Städte sind einzelne Orte statt eines Stadtteppichs. **Siedler** ziehen sichtbar über die Karte und gründen neue Städte an Flüssen und Küsten.
- Jede Stadt gehört zu einem **Volk** mit Farbe und Namen. Hunger, **Seuchen** und seltene **Kriege** entstehen aus Knappheit.
- Die Stadtgrafik ist Pixel-Art und wechselt mit dem Zeitalter.

### Naturkatastrophen
- Wirbelsturm, Flutwelle, Meteorit, Vulkanausbruch, Atomschlag, Flächenbrand, Erdbeben und Seuche werden über das Werkzeug „Ereignis auslösen“ auf ein Feld gesetzt.
- Jede Katastrophe breitet sich aus, hinterlässt Narben und kann Folgen auslösen, etwa eine Flutwelle nach einem Meteoriten im Meer.
- Animierte Pixel-Effekte auf der Karte.

### Gebirge, Höhe und Wasser
- Deutliche Gebirgszüge mit Höhenstufen: Wald, alpine Matte, Schutt und Schnee. Dazu kommen Regenschatten, Vulkankegel und Inselbögen.
- Nackten Fels gibt es nur noch im Hochgebirge, auf junger Erde und auf frischem Vulkangestein.
- Brandung an den Küsten, Gischt an Klippen und sichtbare Strömung in Flüssen.

### Kohle und Riesenbärlappe
- Ein weltweiter **Kohlevorrat** entsteht aus Torf in Sumpfwäldern. Zivilisationen bauen ihn ab dem Industriezeitalter ab.
- Die Schuppenbäume verschwinden, sobald Nadel- und Laubbäume genug Land prägen.

### Klimakarten
- Lufttemperatur, Meerestemperatur und die Überlagerung „Wärme“ nutzen eine neue Farbskala: blau unter 12 °C, bernstein bis rot darüber, mit gleichmäßig abgestufter Helligkeit. Tropen, Subtropen, gemäßigte Breiten und Polargebiete sind jetzt klar zu unterscheiden.

## Version 0.7.0

### Arten-Lexikon
- Alle 136 Unterarten der 17 Tiergruppen lassen sich einzeln entdecken, von den Urzellen bis zu den Bisons.
- Jede Erstentdeckung meldet sich klein am Bildschirmrand, ohne das Spiel anzuhalten. Mehrere Entdeckungen kommen gesammelt.
- Während eines Films warten die Meldungen. Was beim Speichern noch nicht gezeigt war, erscheint nach dem Laden.
- Das **Lexikon** öffnest du mit der Taste **A** oder über das Menü „Fenster“:
  - Fortschritt „x / 136 entdeckt“, je Gruppe sortiert
  - Unentdeckte Arten erscheinen als Silhouette mit einem vagen Hinweis.
- Die **Infobox** einer Art zeigt:
  - ein großes Portrait, eine Beschreibung und wie sich die Art weiterentwickelt hat
  - den Stammbaum mit Vorgängern und Nachfolgern
  - warum sie auf deinem Planeten entstanden ist und unter welchen Umständen (Datum, Lebensraum, Temperatur, Sauerstoff)
  - die echten Spielwerte ihrer Gruppe
- „Zur Art springen“ fährt die Karte zur dichtesten Population.
- Ausgestorbene Arten werden markiert und bleiben im Lexikon.
- Die Option „Bei Entdeckung pausieren“ ist standardmäßig aus. Der Fortschritt wird mit dem Spielstand gespeichert.

### Pixel-Landschaft
- Die Karte ist als Pixel-Landschaft neu gezeichnet: ausgefranste Übergänge statt Kacheln, Flüsse als durchgehende Linien, Wälder mit überlappenden Kronen.
- Jedes Landfeld durchläuft eine **Sukzession** von kahlem Boden zum Klimax-Bewuchs, den Klima und Pflanzengruppen erlauben. Wurzeln bauen dabei Boden auf.
- Pixelgenauer Zoom ohne Flimmern.
- Das Untersuchen-Fenster zeigt einen vergrößerten Ausschnitt um das gewählte Feld.

### Erdkalender und Ozean
- Die Zeit folgt der Erdgeschichte: Der Planet entsteht vor 4,6 Mrd. Jahren, und jeder Evolutionsschritt landet nahe seinem echten Datum („vor … Jahren“).
- **Ozeanchemie:** Der erste Sauerstoff der Meeresproduzenten rostet zunächst das gelöste Eisen aus. Erst danach reichert er sich im Wasser und schließlich in der Luft an, wie bei der Großen Sauerstoffkatastrophe.
- Ein neuer Planet beginnt mit seinen ersten Zellen an einer einzigen Stelle im offenen Meer. Jede neue Gruppe entsteht neben ihren Vorfahren.

### Tiere und Pflanzen auf der Karte
- Neue Vektor-Symbole für alle Tier- und Pflanzengruppen, mit je 8 Unterarten.
- **Biom-Spezialisten:** Eisbären auf großen Eisflächen, Wüstenfüchse in weiten Wüsten, Kakteen in Wüsten.
- **Herden:** Tiere stehen dauerhaft auf der Karte und wandern Feld für Feld, wie im Original-SimEarth.
- Im Evolutionsbaum zeigt jede Tiergruppe ihre 8 Unterarten als Bildleiste.

### Neuer Planet
- Ein Regler bestimmt, wie viel des Planeten unter Wasser liegt („58 % Meer · 42 % Land“). Eine Markierung zeigt, wo eine erdähnliche Welt liegt.

## Entwicklermodus vor Release entfernen

Im Startbildschirm schaltet „Entwicklermodus“ unendliche Energie und EP frei und öffnet alle Schritte im Evolutionsbaum sowie alle Tiere und Pflanzen in der Werkzeugleiste. Er wird nicht im Spielstand gespeichert. Vor dem Release eine der beiden Varianten:

- **Schnell:** In `src/devmode.ts` `DEV_MODE_AVAILABLE` auf `false` setzen und neu bauen. Der Schalter verschwindet, das Spiel läuft wie ohne Modus.
- **Restlos:** `src/devmode.ts` löschen und aus `files` in `tsconfig.json` austragen. Dann `grep -rn DEVMODE src css` ausführen: reine DEVMODE-Zeilen löschen, in geänderten Zeilen den Teil `isDevMode() ||` bzw. `&& !isDevMode()` streichen (z. B. `!(isDevMode() || w.evo.isDeveloped(n.id))` → `!w.evo.isDeveloped(n.id)`). `npm run typecheck` findet jeden vergessenen Rest.

## Bekannte Einschränkungen

- Geprüft wurde bisher nur in headless Chrome. Andere Browser und echte Touch-Geräte sind ungetestet.
- Die Pixel-Landschaft hat noch offene Punkte, etwa Helligkeitskanten an Kachelgrenzen und Sand direkt neben Eis. Details stehen in [docs/landschaft-2026-10/review.md](docs/landschaft-2026-10/review.md).

## Mehr dazu

- Arten-Lexikon: [docs/oekosystem-2026-10/lexikon.md](docs/oekosystem-2026-10/lexikon.md)
- Pixel-Landschaft: [docs/biomes-spec.md](docs/biomes-spec.md), [docs/landschaft-2026-10/](docs/landschaft-2026-10/)
- Epochen: [docs/epochen-2026-10/bericht.md](docs/epochen-2026-10/bericht.md)
- Zivilisation: [docs/zivilisation-spec.md](docs/zivilisation-spec.md), [docs/zivilisation-2026-10/](docs/zivilisation-2026-10/)
- Naturkatastrophen: [docs/ereignisse-spec.md](docs/ereignisse-spec.md), [docs/ereignisse-2026-10/](docs/ereignisse-2026-10/)
- Höhe und Gebirge: [docs/hoehe-spec.md](docs/hoehe-spec.md), [docs/hoehe-2026-10/review.md](docs/hoehe-2026-10/review.md)
- Kohle und Riesenbärlappe: [docs/kohle-2026-10/bericht.md](docs/kohle-2026-10/bericht.md)
- Grafik und Evolutionsfilme: [docs/grafik-2026-10/bericht.md](docs/grafik-2026-10/bericht.md)
- Evolutionsbaum und Quellen: [docs/ueberarbeitung-2026-10/](docs/ueberarbeitung-2026-10/)
- Liste aller ausgelieferten Versionen: [docs/done.md](docs/done.md)
