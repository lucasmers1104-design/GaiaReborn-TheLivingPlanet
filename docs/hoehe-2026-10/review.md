# Abnahme-Review: Höhe, Gebirge und Fels-Regel (H4)

Stand: 15. 10. 2026 · unabhängiger Review gegen `docs/hoehe-spec.md` (Abschnitte 4 und 6)

- **Geprüftes Bundle:** eingefrorene Kopie `integrated.js` (MD5 `ddacfeb4…`). Sie ist identisch mit `lead/simulation.js` und `H3/v19.js`.
- **Vorher-Stand:** `h0/simulation.js`. Mein Baseline-Lauf stimmt exakt mit `h0/biomes-baseline.txt` überein.
- **Seeds:** 777, 2718 und 4242 mit 4.870 Ticks im Probe. Bilder von 777 und 2718, gieriger Evolutionsbaum.

## 1. Urteil je Kriterium (Nutzerkriterien)

| Kriterium | Urteil | Beleg |
|---|---|---|
| Gebirgszüge nach der Generierung vorhanden und deutlich erkennbar | **erfüllt** | Kammlinien ≥ 25 Kacheln bei Tick 1: 11 / 9 / 8 (vorher 3 / 1 / 1), heute 6 / 8 / 7 (vorher 1 / 0 / 0). Bilder: `review-1` (vorher/nachher, Tick 0) und `review-2` (Zeitraffer). Einschränkung: Im dichten (Berg-)Regenwald verdecken bei Zoom 16 die Bäume die Kämme weitgehend. |
| Nackter Fels nur im Hochgebirge, auf junger Erde und auf frischem Vulkangestein | **erfüllt** | Fels außerhalb der drei Fälle ab Tick 400: 0,0–0,2 % (vorher 65 % → heute 1,3 / 1,1 / 2,7 %). Junge Erde: 91,5 / 85,2 / 90,5 % Fels, mit Eis und Schnee 100 %. E4 (Krater zählen als frischer Fels): `succession.ts` `freshRock`. Ereignis-Basalt wird aber noch als Platzhalter gezeichnet, siehe Defekt 2. |
| Höhenstufen sichtbar (Baumgrenze, Schneekappen) | **erfüllt** | Sichtbar: Wald → alpine Matte → Schutt → Schnee (`review-3` vorher/nachher, `review-4`). Gipfelschnee heute 1,2 / 2,8 / 3,8 % des Landes (Ziel ≥ 0,5 %; vorher 0,0 / 0,5 / 0,0). Messziele siehe Abschnitt 2. |
| Regenschatten wirkt auf die Vegetation | **erfüllt** | Holzige Kacheln Luv/Lee: 147/100, 160/104, 134/81 (vorher 83/84, 85/71, 59/48). Offenes Trockenland Lee/Luv: 84/45, 58/30, 72/39 (vorher 22/27, 11/7, 18/12). Bild: `review-5`, Wald im Luv und Wüste im Lee. |
| Vegetationsgrenzen und Übergänge mindestens so gut wie vorher | **akzeptiert (Nutzerentscheidung)** | Landschafts-Grenzkanten 13,6 → 15,2 / 12,0 → 11,9 / 12,2 → 15,2 % (+1,6 / −0,1 / +3,0 Punkte). Lebensraum-Grenzkanten 11,0 → 11,0 / 10,3 → 8,4 / 10,4 → 11,2 %. Unnatürliche Nachbarn: 0. Abweichung zur Begründung der Entscheidung: Bei 4242 sind es +3,0 statt höchstens +2,6 Punkte. Einzelkacheln (Landschaft) steigen bei 777 und 4242 (0,56 → 0,63 bzw. 0,47 → 0,61 %) und sinken nur bei 2718 (0,57 → 0,48 %). |
| Performance gleich oder besser | **akzeptiert (Nutzerentscheidung)** | Laut Entscheidung: Erstaufbau von Chunks mit Gebirgen +10–45 %, kalt bis +80 %; Bildanzahl und Neuzeichnen gleich. Eigene Headless-Messung (ms/Tick, Einzellauf, parallel, also verrauscht): Geologie 0,24 / 0,23 / 0,23 statt 0,31 / 0,27 / 0,29; Klima +7–10 %, Biom +10–12 %. Summe gleich (±3 %). Browser nicht nachgemessen. |

### Zusatzprüfungen

| Prüfpunkt | Urteil | Beleg |
|---|---|---|
| Tiere lesbar auf Fels, Schnee, Basalt und Schutt | **erfüllt, mit Einschränkung** | Dunkle Kontur trägt auf allen Böden: `i777-4879-dateline48` (Fels), `i2718-4879-stairmid48` (Schnee, Fels), `i2718b-4879-arc48` (Eis). Graue Nager auf Schutt sind kontrastarm (`c-animals-scree`, aus H3s Bild). Tiere auf Basalt habe ich nur in H3s Bild gesehen, nicht in eigenen Läufen. |
| Keine Nähte zwischen Chunks und an der Datumsgrenze | **erfüllt** | Pixelvergleich aller Chunk-Ränder einschließlich Umbruch 15 → 0: Seed 777 bei Tick 1.500 hat 0 Abweichungen. Seed 2718 bei Tick 0 hat 7 Pixel an der Datumsgrenze (oberste Chunkreihe, Bodenebene, auch ohne Objekte), identisch mit dem Baseline-Bundle, also nicht neu. Auch auf allen z48-Bildern ist keine Naht sichtbar. |
| Vulkankegel auf vulkanischen Gürteln | **teilweise** | Kegel stehen auf Küstengebirgen und Inselbögen (Epoche „Heute“: 86 Kegel, alle Typ 2, z. B. Anden, Japan, Indonesien, Kamtschatka, Island, Ostafrika). Aber alle tragen einen grünen Saum, auch auf leblosem Planeten und auf Eis (Defekt 1). |
| Inselbögen und Hotspot-Inselketten | **Inselbogen erfüllt, Hotspot teilweise** | Inselbogen: gebogene Kette kleiner Vulkaninseln mit Rinne (`review-8` rechts). Hotspot-Land schwankt im Spielverlauf zwischen 0 und 136 Kacheln. Bei 2718 heute ist es eine Hauptinsel mit Kegel, aber keine erkennbare Kette (`i2718b-4879-hotspot16`). |
| Bergregenwald am Äquator | **erfüllt bei 777 und 4242, nicht bei 2718** | Regenwald + Bergregenwald in ±10° heute: 43,3 / 28,2 / 41,2 % (vorher 8,8 / 21,3 / 49,3). Bei 2718 führt Wald mit 52,8 %; die Spec erklärt das mit dem Evolutionsverlauf. Optisch ist Bergregenwald bei Zoom 48 kaum vom Regenwald zu unterscheiden (`i777-4879-cloud48`). |
| Untersuchen-Fenster: „Höhe … m · Höhenstufe“ | **erfüllt** | „Höhe 1.670 m · Montan (Bergwald)“ bei Bergregenwald und „Höhe 970 m · Alpin (Matten)“ bei alpiner Matte auf 55° N (`review-8` links, `i777-4879-stair-ex`). |
| Relief steht in menschlichen Zeitskalen still (E3) | **erfüllt** | 1.000 Geo-Ticks: Höhenänderung im Mittel 76 m im Geologie-Maßstab, 0,15 m im Zivilisations-Maßstab (größte Änderung 8,8 m). |
| Tests | **grün** | `tectonics`, `altitude`, `landrender` und `terrain` gegen `integrated.js`: 42/42. Lauf des Leads: 232/232 (Log `lead/full.out` gesehen). |

## 2. Messziele aus Spec §4 (Abweichungen)

| Ziel | Gemessen (777 / 2718 / 4242, heute) | Urteil |
|---|---|---|
| Baumgrenze 45°: 1,7–2,4 km | 2,35 / 1,90 / 1,69 km (10. Perzentil); Median der Grenzkacheln bei 777: 2,65 km | teilweise |
| Baumgrenze 0–15°: 3,0–4,0 km | **0 Messkacheln** auf allen drei Seeds (vorher 284 / 370 / 25 bei fester Höhe) | nicht nachweisbar |
| Lee eine Feuchteklasse trockener in ≥ 70 % | 60,5 / 67,6 / 68,4 % (vorher 43,0 / 69,4 / 63,9) | teilweise; die Spec dokumentiert 60–68 % |
| Aktive Gürtel halten ±10 % über 12.000 Ticks | +14 % (777) und +16 % (4242), echter Planet ohne Drift | knapp verfehlt |
| Gürtel ohne Hebung: halbe Überhöhung nach 1.000–1.500 Ticks | Nach 1.500 Ticks bleiben 66 % (777) bzw. 64 % (4242), die Hälfte erst nach etwa 6.000 Ticks (4242) bzw. nie (777: 57 % nach 12.000) | **nicht erfüllt** auf echten Planeten; der Unit-Test mit synthetischen Gürteln ist grün |

## 3. Defekte nach Schwere

1. **Mittel – Vulkankegel tragen immer grüne Vegetation.** Ursachen:
   - Der ruhende Kegel hat das Grün fest im Sprite (`tools/terrain/mountain.js`, `volcano()`).
   - Eine kahle Variante gibt es nicht.
   - Ohne Ereignis-Basalt bekommt jeder Kegel die ruhende Variante: 65 von 65 bei 2718/Tick 0, 61 von 61 bei 777 heute, davon 13 auf Eisschild.
   - Grüne Säume erscheinen dadurch bei 4,6 Mrd. J. auf einem leblosen Planeten sowie auf Eis und Gipfelschnee.
   - Sehen: `review-6`; Seed 777, Tick 0, Zoom 48 bei Kachel (152, 36).
   - **Stand Okt. 2026: behoben.** Das Kegel-Sprite ist entfallen; der Kegel ist Relief und zeigt unten den Boden
     seiner Kachel, ab 15 % der Höhe Schutt (ruhend) oder Basalt (frisch). Junge Erde: keine grünen Kegel (`docs/vulkane-2026-10/bericht.md`).
2. **Mittel – Anbindung der Ereignisse fehlt noch** (`src/hazardadapter.ts`, Platzhalter „until that task is merged“).
   - Lava, Einschläge und Beben ändern die Höhe über `hazardLift` statt über `raiseCrust`, also ohne Gebirgstyp: `hazardlava.ts:111,131`, `hazardimpact.ts:95`, `hazardquake.ts:155,182–183`.
   - Basalt-, Schlot- und Schutt-Narben zeichnet `scarGround` als abgedunkelten Fels statt mit den neuen Materialien `basalt` und `scree`.
   - Damit sieht Ereignis-Basalt anders aus als Hotspot- oder Inselbogen-Basalt.
   - Das widerspricht Spec §3.2 und §6.1.
   - Im Browser nicht ausgelöst, nur im Code gelesen.
3. **Mittel – Epoche „Heute“: gerade Ost-West-Kämme über der Antarktis.**
   - Die Kammsuche läuft die untersten Kartenzeilen entlang: Zeile 127 hat 131 Kammkacheln, Zeile 126 hat 58.
   - Dazu kommen ein rechtwinkliger Kamm und ein schnurgerader Fluss am Küstensaum.
   - Auch Zufallsplaneten haben 25–37 Kammkacheln in Zeile 127, meist unter Eis.
   - Sehen: `review-7` (Epoche „Heute“, Zoom 16 bei (128, 120)).
4. **Mittel/niedrig – Abtrag alter Gürtel zu langsam** (siehe Abschnitt 2). „Gürtel ohne Hebung werden im Zeitraffer sichtbar niedriger“ (E3) trifft nur schwach zu: Im Spiel verliert ein alter Gürtel bis heute etwa 40 % seiner Überhöhung.
5. **Niedrig – mehr schnurgerade Flussabschnitte.**
   - Gezählt sind Flusskacheln, von denen aus der Fluss mindestens 10 Schritte gleich weit geradeaus läuft.
   - Bei der Generierung: 6 → 32 (777), 0 → 3 (2718), 15 → 29 (4242).
   - Heute: 7 → 15 (777), 0 → 2 (2718).
   - Sehen: `review-1` rechts, das Kreuz aus geraden Flüssen in der Bildmitte.
6. **Niedrig – tropische Baumgrenze nicht messbar.** In 0–15° gibt es auf keinem Seed eine alpine Grenzkachel. Das Ziel 3,0–4,0 km ist unbelegt.
7. **Niedrig – Vulkankegel klein und aufgesetzt.**
   - Das 20 × 16-Sprite sitzt wie ein Hut auf dem Kammband.
   - Bei Zoom 16 ist er kaum als Vulkan zu erkennen.
   - Sehen: `review-6`.
   - **Stand Okt. 2026: behoben.** Kegel als Relief, 20–28 px hoch, dunkel mit Umriss und Krater, im Gebirge als
     eigener Gipfel; bei Zoom 16 als kleiner dunkler Kegel erkennbar (`docs/vulkane-2026-10/bericht.md`).
8. **Niedrig – Kegel an nicht-vulkanischen Küsten.** In der Epoche „Heute“ werden alle Küstengürtel zu Typ 2. Dadurch stehen Kegel auch in der kanadischen Arktis, auf Spitzbergen, Nowaja Semlja und in Ostaustralien.
9. **Niedrig – graue Tiere auf Schutt und Fels kontrastarm.** Nur die Kontur trägt sie.
10. **Hinweis – Bergregenwald zu wenig unterscheidbar.** E5 verlangt „etwas dunkler und moosiger“; bei Zoom 48 ist kaum ein Unterschied zu sehen.
11. **Hinweis – kein Substrat `Lava`.** Spec §3.1 sieht einen Substratwert `Lava` vor. Umgesetzt ist Basalt stattdessen über Gebirgstyp + Boden (`landfield.ts:202–210`); funktional gleichwertig.

## 4. Was geprüft wurde und was nicht

**Geprüft:**
- `tools/relief-probe.js` und `tools/headless.js 4870 777 2718 4242 --life --biomes` auf beiden Bundles.
- Vier Testdateien.
- Eigene Skripte:
  - gerade Flüsse
  - Erosion auf echten Planeten
  - Stillstand im Zivilisations-Maßstab
  - Nähte über die ganze Welt
  - Polar-Kämme
  - Statistik der Vulkankegel
- Headless-Chrome-Zeitraffer für 777 und 2718 bei Tick 0, 99, 279, 977, 2.975, 4.201 und 4.879 (4,6 Mrd. J. bis heute), Zoom 8 und 16.
- Nahaufnahmen bei Zoom 48:
  - Höhenstufen
  - Vulkan
  - Regenschatten
  - Bergregenwald
  - Inselbogen
  - Hotspot
  - Datumsgrenze
- Vorher/nachher mit dem Baseline-Bundle (777 bei Tick 0, 977 und 4.879).
- Epochen „Junge Erde“ und „Heute“: Die Vorschau unterstützt `epoch=`.
- Untersuchen-Fenster.

**Nicht geprüft:**
- Browser-Leistung (Entscheidung steht, nicht nachgemessen)
- andere Browser, echte Touch-Geräte, Handy-Ansicht
- Laden alter Spielstände (Migration 7 → 8) von Hand
- Ereignisse im Browser (Ausbruch, Einschlag auf Basalt)
- Seed 12345 aus Spec §4
- Hotspot-Ketten über die Zeit (nur Einzelbilder)

## 5. Bilder

| Datei | Inhalt |
|---|---|
| `review-1-generierung-vorher-nachher.png` | Seed 777, Tick 0, Zoom 16: links vorher, rechts nachher |
| `review-2-zeitraffer-777.png` | Seed 777, Zoom 8. Oben: 4,6 Mrd. / 2,5 Mrd. / 1 Mrd. / 500 Mio. J. Unten: 250 Mio. / 66 Mio. J. / heute / heute vorher |
| `review-3-hoehenstufen-vorher-nachher.png` | Seed 777 heute, Zoom 48: Gebirge bei 55° N vorher (bewaldet) und nachher (Wald → Matte → Schutt → Schnee) |
| `review-4-hoehenstufen-2718.png` | Seed 2718 heute, ca. 50° S: Höhenstufen, Tiere auf Fels und am Schnee |
| `review-5-regenschatten-2718.png` | Seed 2718 heute: Wald im Luv (Osten), Wüste im Lee (Westen) |
| `review-6-vulkankegel-gruen.png` | Defekt 1: grüne Kegel bei 4,6 Mrd. J. (links) und auf Schnee/Eis (rechts) |
| `review-7-antarktis-epoche-heute.png` | Defekt 3: gerade Kämme und gerader Fluss in der Antarktis |
| `review-8-untersuchen-inselbogen.png` | Untersuchen-Fenster mit Bergregenwald (links), Inselbogen mit Rinne (rechts) |

Alle Rohbilder, Pläne und Skripte liegen im Scratch-Verzeichnis `H4/` der Sitzung (`shots/`, `relief-*.txt`, `biomes-*.txt`, `straight.js`, `erosion.js`, `frozen.js`, `polar.js`, `volcstat.js`, `seams.js`).
