# Mehrsprachigkeit: Konzept und Umsetzungsprompt

Stand: 23. Oktober 2026. **Entwurf, noch nicht implementiert.**

## Empfohlene Lösung

Gaia Reborn bekommt eine zentrale Lokalisierungsschicht mit stabilen Textkennungen. Deutsch bleibt die Quellsprache, Englisch wird die erste zusätzliche Veröffentlichungssprache. Übersetzungen werden nach Sprache und Themenbereich in JSON-Dateien gepflegt. Spielcode enthält anschließend Textkennungen und Werte, keine nebeneinanderstehenden deutschen und englischen Texte.

Dieses Prinzip entspricht den String Tables in Spiele-Engines: Eine Kennung verbindet denselben Inhalt über alle Sprachen hinweg. Kontext, Platzhalter und Mehrzahlformen gehören zum Übersetzungsprozess. Beispiele dafür sind die [String Tables und Smart Strings von Unity](https://docs.unity.com/en-us/engine/7000.0/manual/best-practice-guides/bpg-uiad-index/localization).

Die Umstellung erfordert einmalig Änderungen an den betroffenen TypeScript-Dateien. Danach benötigt eine weitere Sprache hauptsächlich einen neuen Sprachordner, Übersetzungen, einen Eintrag im Sprachverzeichnis und Qualitätsprüfungen. Sprachen mit anderen Schriftsystemen oder Schreibrichtungen können zusätzlich Schrift- und Layoutarbeit erfordern.

Vorgeschlagene Aufteilung; große Themen dürfen weitere Dateien bekommen:

```text
locales/
  manifest.json                 # Verfügbare Sprachen, Eigenname, Format-Locale, Richtung
  context/                      # Hinweise, Parametertypen, Platz-/Kontextinformationen
  glossary.json                 # Verbindliche Spielbegriffe je Sprache
  de/
    common.json
    settings.json
    interface.json
    simulation.json
    evolution.json
    stories-plants.json
    stories-animals.json
    species/                    # Namen und Lexikontexte, pro Tierklasse
    civilization.json
    space.json
  en/
    ... dieselbe fachliche Aufteilung ...
src/i18n/
  types.ts                      # Sprachneutrale Nachrichtenverträge
  generated.ts                  # Generierte Kataloge, Kennungen und Parametertypen
  format.ts                     # Platzhalter, Mehrzahl und Zahlen-/Datumsformate
  runtime.ts                    # Aktuelle Sprache und Benachrichtigung der Oberfläche
tools/i18n.js                   # Generieren, Prüfen und Fortschritt ausgeben
```

Die Kommentare in diesem Baum dienen der Erklärung; JSON-Dateien selbst bleiben gültiges JSON. Die endgültige Dateiaufteilung soll dem tatsächlichen Textumfang folgen. Kein neuer Editor, Übersetzungsdienst oder Framework ist Voraussetzung.

Beispiel für eine einfache Nachricht in `locales/de/settings.json`:

```json
{
  "settings.language.label": "Sprache",
  "settings.done": "Fertig"
}
```

In `locales/en/settings.json`:

```json
{
  "settings.language.label": "Language",
  "settings.done": "Done"
}
```

Im Spielcode steht dann beispielsweise `t('settings.done')`. Ein dynamischer Satz bekommt eine eigene Kennung und benannte Parameter, etwa `t('flora.planted', { plant: ..., count: 3 })`. Der vollständige Satz und seine Mehrzahlvarianten stehen im Katalog. Pflanzennamen werden aus einer stabilen Pflanzenreferenz in der gewählten Sprache ermittelt.

Für dieses Projekt ist die Einbettung beim Build besonders wichtig: Der Generator erzeugt aus den JSON-Quellen TypeScript-Daten, die in das bestehende klassische `simulation.js` gelangen. Dadurch müssen beim Start keine JSON-Dateien mit `fetch()` geladen werden. Der Start direkt über `file://`, die Blob-Worker und die Node-Werkzeuge bleiben Bestandteil des Entwurfs.

Sprachwahl: In den Einstellungen steht zunächst `Sprache / Language` mit `Deutsch` und `English`, ohne Flaggen. Bei mehr Sprachen wird daraus eine Auswahl mit den jeweiligen Eigennamen. Die explizite Auswahl gilt sofort und wird lokal gespeichert. Für bestehende Einstellungen ohne Sprachfeld bleibt Deutsch erhalten; bei einer ganz neuen Installation darf die erste passende Browsersprache gewählt werden, sonst Deutsch. Ein Sprachwechsel setzt die Welt nicht zurück und lädt die Seite nicht neu.

Nachrichten aus der Simulation und neue Chronikeinträge speichern Kennung und Daten statt fertig übersetzter Sätze. So lassen sich auch vergangene Ereignisse nach einem Sprachwechsel neu anzeigen. Bereits vorhandene alte Freitexteinträge sind ein Sonderfall: Eindeutig rekonstruierbare Ereignisse werden migriert; unbekannte Originaltexte bleiben erhalten. Fehlende historische Informationen dürfen nicht erfunden werden.

Zur Qualitätssicherung gehören vollständige Sprachkataloge, geprüfte Parameter, kontrollierte Änderungen an Quelltexten und Layoutprüfungen mit künstlich verlängerten Texten. Solche Prüfsprachen sind ein etablierter Weg, unübersetzte Stellen, Platzprobleme und Texte in Grafiken zu entdecken; siehe [Unity: Pseudo-Localization](https://docs.unity3d.com/Packages/com.unity.localization@1.5/manual/Pseudo-Localization.html). Für Mehrzahlformen und Zahlen genügen die vorhandenen standardisierten APIs `Intl.PluralRules` und `Intl.NumberFormat`; siehe [ECMAScript 2020 Internationalization API](https://402.ecma-international.org/7.0/).

## Umsetzungsprompt

Der folgende Abschnitt ist der vollständige Arbeitsauftrag für die Implementierung.

---

Implementiere eine vollständige, wartbare Mehrsprachigkeit für **Gaia Reborn – The Living Planet²** im aktuellen Repository. Das fertige Spiel muss vollständig auf Deutsch und Englisch spielbar sein. Weitere Sprachen sollen über zentrale Sprachkataloge ergänzt werden können, ohne Übersetzungen in die einzelnen Gameplay- und UI-Dateien zu schreiben.

Arbeite die folgenden Etappen nacheinander bis zur abgeschlossenen Umsetzung ab. Höre nicht nach dem technischen Grundgerüst oder einigen übersetzten Menüs auf. Jede Etappe muss einen prüfbaren Zwischenstand haben. Bei einem Kontextwechsel lies den dokumentierten Arbeitsstand und setze die noch offenen Etappen fort.

### 1. Rahmen und Bestandsaufnahme

- Beachte die vorhandenen AGENTS.md-Anweisungen. Dieser Auftrag ersetzt gezielt die bisherige Beschränkung auf ausschließlich deutsche Spielertexte und das Verbot einer unaufgefordert eingeführten i18n-Schicht. Kommunikation und Projektdokumentation bleiben deutsch; Code und Bezeichner englisch.
- Bewahre fremde und bereits vorhandene Änderungen. Kein Commit, Push, Release oder eigenständiges Ändern der Versionsnummer.
- Behalte TypeScript, Namespaces, das klassische Script, ES2020 und Node 22 bei. Keine Runtime-Abhängigkeiten, kein Framework, kein Bundler, keine ES-Module und kein erforderlicher Webserver.
- Der Start über `file://` muss weiterhin einschließlich Simulations- und Landschafts-Worker funktionieren. Sprachkataloge werden beim Build eingebettet, nicht zur Laufzeit per Netzwerkanfrage nachgeladen.
- Erfasse zuerst die tatsächlichen Textquellen und ihre Verwendung. Lies große Dateien gezielt in Ausschnitten und finde vor Typ- oder Formatänderungen alle Referenzen einschließlich Tests und Werkzeuge.
- Erfasse neben TypeScript auch CSS-`content`, HTML-Metadaten, ARIA-/Alt-/Title-Texte, Platzhalter, Canvas-/SVG-Beschriftungen und gegebenenfalls Text in Grafikrezepten. Verändere generierte Dateien nur durch ihre Generatoren.
- Trenne Spielertexte von technischen Protokollen, Assetnamen, internen Kennungen und Eigennamen. Technische Logs und deutsche Entwicklungsdokumentation müssen nicht übersetzt werden. Spielerrelevante Fehlermeldungen schon.
- Lege einen knappen Arbeitsstand unter `docs/lokalisierung-2026-10/stand.md` an: Bereiche, verantwortliche Quellen, Migrationsstatus, Übersetzungsstatus, Prüfungen und offene Ausnahmen. Keine unbelegten Vollständigkeitsprozente.
- Lies die thematisch einschlägigen Berichte gemäß AGENTS.md. Verändere bei der Übersetzung keine Spielregeln oder wissenschaftlichen Aussagen.

Konkrete Ausgangspunkte, deren aktuellen Stand du erneut prüfen musst:

- `src/settingsview.ts`: Der vorhandene Einstellungsdialog kennt Toggle- und Choice-Einträge und wendet Änderungen sofort an.
- `src/app.ts`: Settings-Typ, `settingDefs()`, Laden und Speichern der Einstellungen. Der bestehende Speichername lautet `simearth2.settings`.
- `src/constants.ts`, `src/calendar.ts`, `src/evolution.ts`, `src/params.ts`, `src/epochs.ts`: Namen, Beschreibungen, Anforderungen, Fehlermeldungen und Formatierung zwischen spielmechanischen Daten.
- `src/species/types.ts`, `src/species/lore/`, `src/stories-*.ts`: Artennamen, Lexikon und Evolutionsgeschichten. Ein Teil der Spezialistennamen ist ausdrücklich nur für Quellen und Tests bestimmt.
- `src/simcore.ts`, `src/civstate.ts`, `src/simhost.ts`, `src/simworker.ts`, `src/simstate.ts`: Nachrichten, Ablehnungsgründe und Worker-Verträge.
- `ChronicleEntry` in `src/evolution.ts` und die Serialisierung in `src/save.ts`: Derzeit werden bereits ausformulierte Texte gespeichert.
- `SimResult.text` ist derzeit sowohl Spielertext als auch Transportfeld für kodierte Spielstände. Diese Verwendungen dürfen bei der Umstellung nicht verwechselt werden.
- `css/showcase.css` enthält beispielsweise einen deutschen Text in `content`; `src/launchspace.ts` rastert eine deutsche Beschriftung in eine Textmaske. Ein reiner DOM-Scan erfasst solche Stellen nicht vollständig.
- Es gibt unter anderem fest eingestellte `de-DE`-Formatierungen. Unterscheide sichtbare Zahlen strikt von technischen Dezimalzahlen in SVG-Pfaden und CSS: Technische Zahlen bleiben sprachneutral mit Dezimalpunkt.

### 2. Kataloge und geprüfte Textverträge

- Lege zentrale UTF-8-JSON-Kataloge unter `locales/de/` und `locales/en/` an. Teile sie fachlich auf; lange Lexikon- und Erzähltexte gehören in eigene Dateien. Keine einzige riesige Sprachdatei.
- Deutsch bleibt maßgebliche Quellsprache. Extrahiere den vorhandenen deutschen Wortlaut zunächst ohne redaktionelle Umformulierung, damit technische Umstellung und inhaltliche Änderungen unterscheidbar bleiben.
- Verwende stabile semantische Kennungen wie `settings.language.label` oder `evolution.cells.name`. Weder den deutschen Satz noch seine Zeilennummer als Kennung verwenden.
- Organisiere Kennungen nach Bedeutung und Kontext. Identische Wörter mit unterschiedlicher Bedeutung dürfen eigene Kennungen haben. Keine automatische Zusammenlegung nach identischem Wortlaut.
- Entferne die migrierten deutschen Spielertexte aus den ursprünglichen TS-Daten. Keine zweite handgepflegte Textquelle, keine `{ de: ..., en: ... }`-Objekte und keine Sprachverzweigungen in einzelnen Feature-Dateien.
- Halte mechanische Daten und stabile Entity-IDs sprachneutral. Die Anzeige ermittelt Texte über typisierte Textreferenzen. Benutze nie übersetzte Namen als Identität, Vergleichswert, Assetpfad oder Simulationsbedingung. Leite Arten-/Stufenkennungen aus stabilen Daten ab; verankere gegebenenfalls zusätzliche stabile IDs, ohne die numerischen Spielindizes zu verändern.
- Hinterlege Übersetzungskontext außerhalb der Runtime-Daten: Bedeutung, Bildschirm/Verwendung, Parametertypen und bei engen Beschriftungen Größenhinweise. Kontextdateien und Glossar werden nicht für die Spiellogik benötigt.
- Führe ein mehrsprachiges Glossar für zentrale Begriffe, Ressourcen und Abkürzungen. Lege vor der Mengenübersetzung konsistentes internationales Englisch fest. Entscheide etwa einheitlich über „Evolutionspunkte / Evolution Points“ und ihre sichtbare Abkürzung; interne IDs bleiben bestehen.
- Erzeuge Kennungs- und Parametertypen aus den Quellen. Falsche Kennungen sowie fehlende oder falsch typisierte Parameter müssen bei `typecheck` auffallen. Keine Umgehung mit `any`, pauschalen Casts oder beliebigen String-Indexsignaturen.
- Verwende vollständige Nachrichten mit benannten Parametern. Übersetzer müssen die Satzstellung ändern können. Keine zusammengesetzten Sätze aus übersetzten Wortfragmenten und keine generelle automatische Kleinschreibung von übersetzten Labels.
- Unterstütze mindestens einfache Texte, benannte Parameter und strukturierte Mehrzahlvarianten. Verwende `Intl.PluralRules` für die jeweilige Sprache und berücksichtige die Kategorien `zero`, `one`, `two`, `few`, `many`, `other`; `other` ist verpflichtend. Eine Sprache braucht ihre tatsächlich verwendeten Kategorien, nicht dieselben Kategorien wie Deutsch. Baue keinen eigenen umfassenden ICU-Parser.
- Definiere die kleine Nachrichtengrammatik ausdrücklich und validiere sie. Ergänze Auswahlvarianten nur, wenn konkrete Texte sie benötigen. Vermeide vor allem grammatisch problematische Sätze mit beliebig eingesetzten Namen; formuliere ganze Vorlagen passend zum Kontext.
- Verwende localeabhängige Zahlen, Prozentwerte und reale Speicherdaten über gecachte ES2020-`Intl`-Formatter. Geologische Zeit, Altersangaben, Einheiten, Kurzformen und ihre Beschriftungen brauchen eigene übersetzbare Vorlagen. Simulationswerte und Save-Zahlen bleiben unverändert.
- Setze Texte vorzugsweise über `textContent`. Bei bestehenden SVG-/HTML-Ausgaben nutze kontextgerechtes Escaping. Keine frei ausführbaren HTML-, SVG- oder Script-Fragmente in Katalogen; erhalte erforderliche Formatierung mit kontrollierten Text-/Markup-Bausteinen.

### 3. Generator und Build

- Implementiere ein kleines deterministisches Node-Werkzeug, beispielsweise `tools/i18n.js`, zum Prüfen und Generieren. Nutze vorhandene Entwicklungswerkzeuge; füge keine Dependency ohne konkreten Bedarf hinzu.
- Erzeuge daraus die typisierten Katalogdaten in `src/i18n/` und nimm sie in korrekter Reihenfolge in `tsconfig.json` auf. Runtime und Daten müssen auch ohne DOM, `window`, `navigator` und `localStorage` in Node und Workern ladbar sein.
- Integriere die Generierung vor `tsc` in `npm run build`. Versionsstempel und Bundle-Wrapper bleiben funktionstüchtig. `simulation.js` wird niemals von Hand bearbeitet.
- Halte `npm run watch`, `typecheck`, vollständige Tests und die vorhandenen Scratch-/Probe-/Screenshot-Builds funktionsfähig. Katalogänderungen müssen auch im Watch-Betrieb berücksichtigt werden; vermeide konkurrierende Schreibprozesse. Finde die direkten `tsc`-Aufrufe in Werkzeugen vor deren Anpassung.
- Generierte Quellen werden nachvollziehbar als generiert markiert und gemäß Repository-Konvention mitgeführt. Ein Prüflauf ohne Schreibzugriff muss veraltete Generatorausgaben erkennen.
- Biete klare Befehle für Generierung, Prüfung und Status an, beispielsweise `npm run i18n:generate`, `npm run i18n:check`, `npm run i18n:status`. Sie müssen ebenfalls in den relevanten Test-/Releasepfad eingebunden sein.
- Prüfe ungültiges JSON, doppelte Kennungen, leere Pflichttexte, fehlende und unbekannte Schlüssel, Nachrichtenstruktur, Parametertypen, erlaubte Platzhalter und notwendige Mehrzahlformen. Parameter müssen denselben Vertrag erfüllen, aber nicht in jeder Sprachvariante gleich oft vorkommen.
- Unterscheide vorhandene Übersetzungen von nach Änderungen der deutschen Quelle noch zu prüfenden Übersetzungen. Verwende dafür einen einfachen nachvollziehbaren Quellfingerabdruck oder vergleichbaren Prüfstand außerhalb der Runtime. Automatische Generierung darf veraltete Übersetzungen nicht als geprüft markieren.
- Ein Laufzeit-Fallback auf Deutsch dient nur der Robustheit. Die Veröffentlichung von Englisch darf bei fehlenden, leeren oder ungeprüft veralteten Einträgen nicht als vollständig gelten. Registriere unfertige spätere Sprachen nicht als auswählbare Veröffentlichungssprachen.
- Erfasse vor und nach der Änderung Bundlegröße und grob den Worker-Start. Halte Übersetzen und Formatieren aus den Simulations- und Render-Hotpaths heraus; keine unnötige Loader-Architektur ohne gemessenen Bedarf.

### 4. Sprachwahl und Aktualisierung der Oberfläche

- Ergänze die Sprachwahl ganz oben in den vorhandenen Einstellungen, sowohl vom Titelbildschirm als auch aus dem laufenden Spiel erreichbar.
- Nutze zuerst `Sprache / Language` und die Eigennamen `Deutsch`, `English`. Keine Länderflaggen. Verwende den bestehenden Choice-Mechanismus oder eine kleine passende Auswahl, die bei weiteren Sprachen übersichtlich bleibt.
- Die auswählbaren Sprachen kommen aus einem zentralen Manifest; keine gesonderten hartcodierten Sprachlisten in jedem Fenster. Dort stehen auch Format-Locale und Schreibrichtung.
- Lade die gespeicherte Sprache vor dem ersten sichtbaren UI-Aufbau und Intro. Eine gültige gespeicherte Auswahl gewinnt immer. Bei bestehenden Settings ohne Sprachfeld bleibe bei Deutsch. Ohne vorhandene Settings nutze die erste unterstützte Browsersprache mit Basisabgleich, andernfalls Deutsch. Unbekannte oder beschädigte Werte dürfen den Start nicht verhindern.
- Speichere die Auswahl als Spielerpräferenz, nicht als Eigenschaft des Planeten. Erhalte den bestehenden `simearth2.settings`-Schlüssel und den Schutz gegen gesperrten Speicher. Wird eine Welt geladen, bleibt die aktuelle Oberflächensprache erhalten.
- Ein Wechsel wirkt sofort, ohne Reload, neue Welt, verlorenen Spielstand oder unterbrochenen Worker. Auch Titel, offener Einstellungsdialog, Fenster, Menüs, Tooltips, aktuelle Meldungen, Chronik und sichtbare Beschriftungen werden aktualisiert.
- Verwende einen klaren zentralen Änderungsmechanismus. Erhalte Fensterpositionen, Auswahl, Fokus und laufende Eingaben, soweit die betreffende Oberfläche sie besitzt. Entferne Listener beim Schließen/Zerstören; keine mehrfachen Handler nach mehreren Wechseln.
- Keine beim Modulstart dauerhaft übersetzten Tabellen oder vorformatierten Zahlen einfrieren. Reagiere auch bei Canvas-Textmasken, Diagrammen und Text-/Layout-Caches auf die Sprachrevision. Bei laufenden Filmen müssen sichtbare lokalisierte Texte konsistent aktualisiert werden, ohne den Film oder die Simulation neu zu starten.
- Setze `document.documentElement.lang` und die passende Richtung. Aktualisiere übersetzbare Metadaten aus Code. Neue UI entsteht in Code; keine neuen Pflicht-IDs in `index.html`. Der statische Hinweis ohne JavaScript muss Deutsch und Englisch verständlich abdecken, weil er nicht zur Laufzeit übersetzt werden kann.
- Vermeide pauschales Austauschen deutscher DOM-Texte und globale nachträgliche String-Ersetzungen. Jede sichtbare Nachricht hat eine verantwortliche Quelle.

### 5. Sprachneutrale Simulation und kompatible Spielstände

- Die Simulation entscheidet über Ereignisse und Werte; erst die Darstellung entscheidet über die Sprache. Neue Nachrichten, Ablehnungsgründe und Chronikeinträge enthalten serialisierbare Text-/Ereignisreferenzen mit typisierten Parametern.
- Definiere dafür kleine klare Verträge. Parameter dürfen beispielsweise Zahlen, Eigennamen und überprüfbare Referenzen auf Arten, Technologien oder Ereignisse enthalten. Übersetzbare Entity-Namen dürfen nicht schon als deutscher Text im Worker festgeschrieben werden.
- Bewahre historische Ereignisdaten: Eine damalige Stadtgröße oder Anzahl kommt aus dem Ereignis, nicht aus dem heutigen Zustand der Welt. Reine Textverweise sind kein Ersatz für verlorene historische Werte.
- Verändere alle Produzenten und Konsumenten zusammen: direkte Simulation, Worker-Nachrichten, Befehlsprüfung/-ergebnis, Notifier, Chronik, Fehleranzeige, Migrationen und Headless-Werkzeuge. Die UI-Ausgabe eines Node-Probes darf explizit Deutsch als Standardformatierung verwenden; seine Simulationsentscheidungen bleiben sprachneutral.
- Trenne kodierte Save-Nutzdaten von Nachrichten; insbesondere darf die bisherige Doppelverwendung von `SimResult.text` keine Save-Dateien beschädigen.
- Halte Seed-Verhalten, RNG-Reihenfolge, Ticks, Weltwerte, Kosten, Meilensteine und Befehlsvalidierung unverändert. Die Sprache darf weder Simulationszustand noch `SimCore.check()`-/`apply()`-Entscheidungen beeinflussen. UI-Code schreibt weiterhin nicht direkt in die Welt.
- Prüfe vorab alle dauerhaften Spielertexte, auch Meldungsfelder außerhalb der Chronik. Erhöhe bei Änderungen des Save-Datenformats `SAVE_FORMAT` nach der bestehenden Konvention; zum geprüften Ausgangsstand ist es 10. Implementiere eine Migration von der dann tatsächlichen Vorversion und erhalte alle bisher unterstützten älteren Migrationen.
- Migriere alte Chronikeinträge nur dann zu Textreferenzen, wenn Ereignistyp und Parameter eindeutig aus gespeicherten Daten bzw. einer eng definierten bekannten Altvorlage rekonstruierbar sind. Keine Übersetzung durch lose Wortersetzung und keine Rekonstruktion historischer Angaben aus dem aktuellen Weltzustand.
- Erhalte andernfalls den alten Originaltext in einem ausdrücklich begrenzten Legacy-Feld. Unbekannte historische Freitexte, echte Eigennamen und Benutzereingaben bleiben unverändert. Dokumentiere diese Ausnahme genau; sie darf nicht als Vorwand dienen, heutige Standardtexte oder neue Ereignisse deutsch zu lassen.
- Validierung von Nachrichten-IDs, erlaubten Parametern, Typen, Größen und gegebenenfalls Verschachtelung bleibt beim Laden strikt. Keine beliebigen URLs, HTML-Fragmente oder ausführbaren Inhalte aus Spielständen übernehmen. Unbekannte Referenzen sicher behandeln, ohne einen laufenden Planeten wegen eines Anzeigetextes zu verlieren.

### 6. Vollständige Migration und englische Übersetzung

Arbeite die folgenden Bereiche systematisch ab. Übersetze in jedem Bereich sämtliche tatsächlich angezeigten Texte, nicht nur die jeweils genannten Beispiele:

1. Gemeinsame Bedienelemente, Titelbildschirm, Einstellungen, Spielstart, Epochen-/Planetenauswahl, Intro und Bedienhinweise.
2. Statusleiste, Ressourcen und Abkürzungen, Navigation, Spiel-/Planet-/Fenstermenüs, Werkzeuge, Geschwindigkeiten, Zielhinweise, Gaia und ihre Hinweise.
3. Fenster, Diagramme, Legenden, Modelle und Regler, Untersuchen, Hilfetexte und Glossar.
4. Evolution, Voraussetzungen, Lebensräume, Namen, Meilensteine, Entdeckungen, Aussterben, R.I.P.-Hinweise und chronologische Angaben.
5. Sämtliche Arten- und Pflanzengruppennamen, Unterarten, Lexikoneinträge, Hinweise, Abstammungsanzeigen, Fakten und spielbezogene Wertebeschriftungen.
6. Alle Evolutionsgeschichten und Filmtexte: Datierung, Zeitalter, vier Beats, Neuerung, Selektionsvorteil, Geschichte und Fakten; außerdem eingebettete SVG-/Canvas-Beschriftungen.
7. Zivilisation, Technik, Städte und Völker, Siedler, Epidemien, Konflikte, Entdeckung, Kolonien, Schiffe, Eisenbahn und Weltwunder einschließlich Nachrichten.
8. Naturereignisse, Terraforming, Ressourcen-/Standortfehler, Dinosaurierentscheidung und ihre Folgen.
9. Raumfahrt, Projektphasen, Bestätigungen, Startfilm und Abschlussdialog.
10. Speichern/Laden, Standardslotnamen, Export/Import, automatische Sicherung, Validierungsfehler, Kompatibilitäts- und Migrationsmeldungen.
11. Verbleibende ARIA-, Alt-, Title-, CSS-, Metadaten- und Grafiktexte sowie alle durch die Bestandsaufnahme gefundenen zusätzlichen Flächen.

- Englisch soll natürlich und für ein Natur-/Evolutionsspiel passend klingen. Kein mechanisches Wort-für-Wort-Englisch und keine Änderung wissenschaftlicher Unsicherheiten, Datierungen, Aussagen oder Spielregeln.
- Eigennamen, wissenschaftliche Namen, der Spieltitel und stabile IDs bleiben erhalten, sofern sie nicht tatsächlich eine lokalisierbare Beschriftung darstellen. Generische Zusätze wie „Stadt“, Standardnamen und Größenklassen müssen übersetzt werden.
- Erhalte die Bedeutung und Dramaturgie der vier Film-Beats. Die Filme bleiben 12 Sekunden lang; ändere dafür nicht die Zeitsteuerung. Prüfe stattdessen Leselänge und Umbruch.
- Behalte pro Bereich einen nachvollziehbaren Status. Ein Katalogeintrag allein beweist noch nicht, dass seine Anzeige auf die Lokalisierung umgestellt wurde.
- Finde anschließend verbliebene direkte Spielertexte über die TypeScript-Syntax und bekannte Ausgabestellen, nicht nur über Umlaute. Englische Wörter, reine ASCII-Sätze und Datenfelder müssen ebenfalls betrachtet werden. Nutze für echte technische Ausnahmen eine kleine begründete Liste; keine pauschalen Dateiausschlüsse für UI-Code.

### 7. Prüfungen und Abnahme

- Prüfe Generator und Katalogverträge gezielt: falsche Kennung, fehlender/falsch typisierter Parameter, unbekannter Schlüssel, fehlende Übersetzung, ungültige Mehrzahlform, veraltete Ausgabe und veränderte deutsche Quelle. Teste dafür auch die Fehlerfälle der Werkzeuge.
- Prüfe Übersetzung und Pluralregeln mindestens mit 0, 1, 2, größeren und gebrochenen Zahlen, soweit im jeweiligen Kontext gültig. Reservierte Platzhalter dürfen nach dem Formatieren nicht sichtbar bleiben. Teste zusätzlich eine Sprache mit anderen Pluralkategorien über kleine Testdaten, ohne eine unfertige Sprache im Spiel anzubieten.
- Prüfe Einstellungen: erste Wahl, alte Settings ohne Sprachfeld, gespeicherte Auswahl, nicht unterstützte Locale, gesperrter Speicher, Neustart und Laden eines anderssprachig erzeugten Spielstands.
- Prüfe Deutsch → Englisch → Deutsch während eines laufenden Spiels mit offenen Fenstern, Einstellungen, Chronik und sichtbarer Meldung. Kontrolliere auch Canvas-Texte, Cache-Aktualisierung und wiederholtes Umschalten ohne Listenerwachstum.
- Prüfe dieselben Aktionen und Seeds sprachunabhängig auf dieselben numerischen Weltwerte und RNG-Zustände. Berücksichtige direkte und Worker-Ausführung; vergleiche keine sprachabhängigen UI-Snapshots als Simulationsbeweis.
- Prüfe Save-Roundtrip und Migrationen mit rekonstruierten Ereignissen, erhaltenen Legacy-Texten, Benutzer-/Eigennamen, unbekannten Referenzen und beschädigten Parametern. Vorhandene Schutzprüfungen dürfen nicht abgeschwächt werden.
- Passe bestehende textbezogene Tests bewusst an. Unter anderem enthalten Arten-/Lore-Tests derzeit deutsche Text- und Längenannahmen. Erhalte ihre semantischen Prüfungen; mache rein deutsche Abkürzungs- oder Zeichenregeln nicht ungeprüft zur englischen Vorgabe.
- Erzeuge eine nur für Entwicklung/Tests erreichbare Prüfsprache mit markierten und ungefähr 30–50 Prozent verlängerten Texten. Erhalte dabei Platzhalter. Nutze sie zum Auffinden unlokalisierter Flächen und abgeschnittener Texte; sie erscheint nicht als normale Spielsprache.
- Führe Browserprüfungen nacheinander in Headless Chrome durch, einschließlich eines direkten `file://`-Starts mit echten Blob-Workern und eines Laufs in `?sim=direct`. Kontrolliere in beiden Sprachen Konsole, wesentliche Fenster und Bedienabläufe. Nur geprüfte Browser als geprüft bezeichnen.
- Erzeuge und inspiziere Screenshots mindestens für Titel/Einstellungen, Hauptoberfläche, Evolution, Lexikon, Untersuchen, Chronik, Dinosaurierdialog, Raumfahrt und einen Film mit Beschriftungen. Prüfe Deutsch, Englisch und für enge Oberflächen die Prüfsprache bei typischen Desktopgrößen sowie DPR 1 und 2. Verwende vorhandene Preview-/Screenshot-Werkzeuge und deren Browser-Lock.
- Baue und prüfe jeweils passend zum bearbeiteten Bereich. Am Ende: `npm run build`, `npm run typecheck`, die Lokalisierungsprüfungen, `npm run test:quick` und einmal `npm run test:full`. Während des vollen Testlaufs `simulation.js` nicht neu bauen. Große Logs in Dateien umleiten, nur Zusammenfassungen und Fehler lesen.
- Dokumentiere vorhandene oder fremde Fehler gesondert, anstatt sie dem Sprachwechsel zuzurechnen oder Prüfungen abzuschalten. Behaupte keine bestandene Prüfung, die nicht tatsächlich beendet wurde.

Die Implementierung ist erst abgeschlossen, wenn:

- beide Veröffentlichungssprachen vollständig und nach den aktuellen deutschen Quellen geprüft sind;
- sämtliche neuen und aktuellen Standard-Spieltexte einschließlich Meldungen, Lexikon und Filmen über die Kataloge laufen;
- Englisch ohne versteckten deutschen Fallback spielbar ist, abgesehen von den dokumentierten übernommenen Legacy-Originaltexten und bewusst unveränderten Eigennamen;
- der unmittelbare Sprachwechsel, Dateistart, beide Simulationsmodi und alte Spielstände funktionieren;
- die geforderten Prüfungen beendet sind und verbleibende Einschränkungen konkret benannt werden;
- eine weitere Testsprache durch Kataloge und Manifest ergänzt werden kann, ohne Gameplay-Dateien um eine weitere Sprachvariante zu erweitern.

Dokumentiere abschließend kurz das tatsächlich implementierte Katalogformat, das Hinzufügen einer Sprache, die Pflege neuer/geänderter Texte und die Legacy-Grenze in einem passenden deutschen Bericht. Berichte dem Nutzer, was geändert wurde, welche Prüfungen bestanden haben und welche manuellen Browser-/Spieltests noch offen sind. Committe oder pushe nichts ohne gesonderten Auftrag.

---

## Grenze des Auftrags

Dieser Text beschreibt die spätere Umsetzung. Das Anlegen dieses Konzepts stellt weder eine bereits eingebaute Sprachwahl noch eine abgeschlossene Übersetzung dar. Eine technische Vollständigkeitsprüfung ersetzt außerdem keine abschließende sprachliche Durchsicht durch einen englischen Muttersprachler.
