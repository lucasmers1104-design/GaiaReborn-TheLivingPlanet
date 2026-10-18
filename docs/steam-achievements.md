# Steam-Achievements

Stand: 2026-10-18 · noch nicht im Code umgesetzt. Neue Features → prüfen, ob sie hier ein Achievement verdienen.

**Steamworks-Hinweise:** Jedes Achievement braucht einen API-Namen (Spalte „API“), Anzeigename, Beschreibung und **zwei Icons** (256 × 256 px, JPG/PNG): freigeschaltet (farbig) und gesperrt (Graustufen-Version desselben Bildes). „Versteckt“ = Beschreibung erst nach dem Freischalten sichtbar.

**Stil-Prompt für ChatGPT (für alle Icons gleich verwenden):**
> Quadratisches Spiel-Achievement-Icon, 256×256, Pixel-Art im Stil eines Retro-Erdsimulators (SimEarth), kräftige Farben, dunkler runder Hintergrund mit leichtem Glühen, ein zentrales Motiv, kein Text. Motiv: …

## Leicht (erste Spielstunde)

| # | API | Name | Bedingung | Icon-Motiv |
|---|-----|------|-----------|-----------|
| 1 | `ACH_FIRST_LIFE` | Es lebt! | Erste Zellen entwickeln | Leuchtende Zelle im dunklen Urozean |
| 2 | `ACH_EXAMINE` | Neugier ist der Anfang | Ein Feld mit „Untersuchen“ ansehen | Lupe über einem Pixel-Kontinent |
| 3 | `ACH_TERRAFORM` | Berge versetzen | Mit dem Höhe-Pinsel Land aus dem Meer heben | Hand, die eine Insel aus dem Wasser hebt |
| 4 | `ACH_PLANT` | Grüner Daumen | Eine Pflanzengruppe ansiedeln | Daumen mit Keimling |
| 5 | `ACH_LAND_PLANTS` | Die Ufer werden grün | Erste Landpflanzen entwickeln | Grüner Moosstreifen an einer Felsküste |
| 6 | `ACH_FISH` | Rückgrat zeigen | Fische entwickeln | Urfisch mit sichtbarer Wirbelsäule |
| 7 | `ACH_FIRST_DISASTER` | Höhere Gewalt | Erste Katastrophe auslösen | Blitz aus einer Gewitterwolke |
| 8 | `ACH_GAIA_CONTENT` | Gaia lächelt | Gaias Stimmung erreicht „Zufrieden“ | Lächelndes Planetengesicht |
| 9 | `ACH_EPOCH_TODAY` | Vertrautes Terrain | Eine Partie in der Epoche „Heute“ starten | Die heutigen Kontinente als Pixel-Globus |
| 10 | `ACH_FILM` | Logenplatz der Evolution | Einen Evolutionsfilm komplett ansehen | Filmrolle mit DNA-Strang |
| 39 | `ACH_GLOBETROTTER` | Weltreisender | In der Übersichtskarte (Globus-Ansicht) per Klick ans andere Ende der Welt springen | Globus mit gestrichelter Flugbahn und Ortsmarke |

## Mittel (mehrere Stunden, ein Ziel verfolgen)

| # | API | Name | Bedingung | Icon-Motiv |
|---|-----|------|-----------|-----------|
| 11 | `ACH_AMPHIBIANS` | Vier Beine an Land | Amphibien entwickeln | Frosch-Urahn steigt aus dem Wasser |
| 12 | `ACH_DINOSAURS` | Zeit der Giganten | Dinosaurier entwickeln | Langhals-Silhouette vor Vulkan |
| 13 | `ACH_BIRDS` | Federn und Flügel | Vögel entwickeln | Urvogel mit ausgebreiteten Flügeln |
| 14 | `ACH_WHALES` | Zurück ins Meer | Wale entwickeln | Walfluke über dem Wasser |
| 15 | `ACH_WHALE_WATCH` | Walbeobachtung | Einen auftauchenden Wal auf der Karte sehen (Zoom ≥ 16 px) | Fontäne über blauer Pixel-See |
| 16 | `ACH_POLLINATORS` | Ein Fest für Bestäuber | Bienen & Bestäuber entwickeln | Biene auf einer Blüte |
| 17 | `ACH_SPONTANEOUS` | Die Natur wartet nicht | Ein Evolutionsschritt entsteht von selbst | Uhr, aus der ein Keim wächst |
| 18 | `ACH_SENTIENCE` | Ich denke, also bin ich | Eine Art wird intelligent / erste Stadt (Steinzeit) | Steinwerkzeug mit Funken |
| 19 | `ACH_INDUSTRY` | Dampf und Ruß | Industriezeitalter erreichen | Rauchender Schornstein, Kohlebrocken |
| 20 | `ACH_SEA_SETTLERS` | Über das Meer | Siedler gründen eine Stadt über das Wasser | Kleines Boot mit Banner |
| 21 | `ACH_ALL_TERRAFORMERS` | Planeteningenieur | Alle 4 Terraformer platziert | Vier Generatoren im Kreis |
| 22 | `ACH_ALL_BIOMES` | Planet der Vielfalt | Alle 11 Biome gleichzeitig auf dem Planeten | Globus aus elf Farbstreifen |
| 23 | `ACH_ALL_DISASTERS` | Katastrophen-Sammelalbum | Jede der 8 Katastrophen einmal ausgelöst | Album mit 8 Katastrophen-Stickern |
| 24 | `ACH_CHAIN` | Dominoeffekt | Eine Katastrophe löst eine weitere aus | Umfallende Dominosteine mit Flammen |
| 25 | `ACH_LEXICON_50` | Hobby-Naturforscher | 50 von 136 Unterarten im Lexikon | Aufgeschlagenes Notizbuch mit Tierskizzen |
| 26 | `ACH_NUKE` *(versteckt)* | Der rote Knopf | Einen Atomschlag auslösen | Roter Knopf unter Glasklappe |
| 27 | `ACH_MONOLITH` *(versteckt)* | Der Monolith | Eine Art durch den Monolithen erwecken | Schwarzer Monolith, Affe davor |
| 38 | `ACH_DOLPHIN_POD` | Delfinschule | Eine springende Delfinschule im tropischen Meer auf der Karte sehen (Zoom ≥ 16 px) | Drei Delfine im Bogen über türkisem Pixel-Meer |
| 40 | `ACH_GREAT_OXIDATION` | Der erste Atemzug | Die Große Sauerstoffkatastrophe erreichen | Sauerstoffperlen steigen aus türkisem Küstenwasser in einen hellen Himmel |

## Schwer (Langzeitziele, Meisterschaft)

| # | API | Name | Bedingung | Icon-Motiv |
|---|-----|------|-----------|-----------|
| 28 | `ACH_FULL_TREE` | Darwins Erbe | Alle Evolutionsschritte in einer Partie entwickelt | Goldener, voll verzweigter Stammbaum |
| 29 | `ACH_LEXICON_ALL` | Lebende Enzyklopädie | Alle 136 Unterarten im Lexikon | Dickes goldenes Buch mit Tier-Siegel |
| 30 | `ACH_NANOTECH` | Die Zukunft ist winzig | Nanotech-Zeitalter erreichen | Leuchtende Nano-Waben über einer Stadt |
| 31 | `ACH_GAIA_BLISS` | Gaias Liebling | Gaia lange (z. B. 500 Jahre Spielzeit) „Glückselig“ halten | Strahlendes Planetengesicht mit Krone |
| 32 | `ACH_PEACE` | Ewiger Frieden | Informationszeitalter erreichen ohne einen einzigen Krieg | Taube über Globus |
| 33 | `ACH_GENTLE_GOD` | Sanfter Gott | Von den ersten Zellen bis zur Zivilisation, ohne eine Katastrophe auszulösen | Offene Hand mit Planet darin |
| 34 | `ACH_FOUR_BILLION` | Vier Milliarden Jahre | In „Junge Erde“ starten und das Informationszeitalter erreichen | Glühende Urerde → blaue Erde (Zweiteilung) |
| 35 | `ACH_OCTOPUS` | Tintenfisch-Imperium | Weichtiere werden die intelligente Art | Krake mit Krone |
| 36 | `ACH_DINO_CIV` | Hätte der Meteor nur… | Dinosaurier gründen eine Zivilisation | Dino mit Steinwerkzeug |
| 37 | `ACH_PHOENIX` | Phönix | Nach einem Meteoriten, der über die Hälfte des Lebens auslöscht, erholt sich die Biomasse wieder auf den alten Wert | Phönix aus einem Krater |

## ChatGPT-Prompts (je 10 Icons pro Prompt)

Rahmenfarbe zeigt die Schwierigkeit: Bronze = leicht, Silber = mittel, Gold = schwer.

### Prompt 1 — Nr. 1–10 (leicht, Bronze)

```
Create 10 separate square images (1:1), one image per item below. Do not put them together in one grid. Each image is a Steam achievement icon for a retro planet and evolution simulator game in the spirit of SimEarth.
Shared style for all 10: detailed 16-bit pixel art, bold saturated colors, one centered motif filling about 70% of the frame, dark navy circular background with a soft glow behind the motif, a thin BRONZE ring as the border, light from the top left. No text, no letters, no numbers. The motif must stay readable when shrunk to 64×64 pixels.

1. A single glowing green-blue cell floating in a dark primordial ocean, tiny bubbles rising around it.
2. A magnifying glass held over a small pixel-art continent, the land under the lens shown larger with grass and rivers.
3. A giant hand rising out of the sea, lifting a small rocky island up from the water, water dripping down.
4. A thumb pressing a tiny green sprout into fresh brown soil.
5. A rocky coastline where the first bright green moss spreads from the water onto the bare stones.
6. A primitive fish swimming sideways, its spine glowing visibly through the body like an x-ray.
7. A dark storm cloud shooting a bright lightning bolt down onto a small planet.
8. A smiling planet face: blue oceans, green continents, closed happy eyes, warm golden glow.
9. A pixel-art globe showing today's Earth continents (Europe, Africa, the Americas), blue and green.
10. A film reel unrolling, with a glowing DNA double helix running through the film strip.
```

### Prompt 2 — Nr. 11–20 (mittel, Silber)

```
Create 10 separate square images (1:1), one image per item below. Do not put them together in one grid. Each image is a Steam achievement icon for a retro planet and evolution simulator game in the spirit of SimEarth.
Shared style for all 10: detailed 16-bit pixel art, bold saturated colors, one centered motif filling about 70% of the frame, dark navy circular background with a soft glow behind the motif, a thin SILVER ring as the border, light from the top left. No text, no letters, no numbers. The motif must stay readable when shrunk to 64×64 pixels.

11. A primitive four-legged amphibian crawling out of a swamp onto land, water dripping off its body.
12. A long-necked dinosaur silhouette in front of an erupting volcano under an orange sky.
13. An early feathered bird (Archaeopteryx-like) with wings spread wide, flying toward the viewer.
14. A whale tail rising out of a calm blue sea, water spraying off the edge of the fluke.
15. A whale blowing a tall water spout over a blue pixel-art sea, seen from slightly above like on a map.
16. A fuzzy bee landing on a bright, colorful flower, pollen dust glowing around it.
17. A pocket watch whose glass has cracked open, a green seedling growing out of it.
18. A stone hand axe striking a flint, bright sparks flying, a small campfire glow below.
19. A tall brick factory chimney puffing dark smoke, a pile of black coal lumps at its base.
20. A small wooden boat with a colorful banner sailing across open water toward a far coastline.
```

### Prompt 3 — Nr. 21–30 (21–27 Silber, 28–30 Gold)

```
Create 10 separate square images (1:1), one image per item below. Do not put them together in one grid. Each image is a Steam achievement icon for a retro planet and evolution simulator game in the spirit of SimEarth.
Shared style for all 10: detailed 16-bit pixel art, bold saturated colors, one centered motif filling about 70% of the frame, dark navy circular background with a soft glow behind the motif, light from the top left. No text, no letters, no numbers. The motif must stay readable when shrunk to 64×64 pixels.
Border: items 21 to 27 get a thin SILVER ring, items 28 to 30 get a thicker shining GOLD ring.

21. Four futuristic machines standing in a circle on a small planet: an oxygen generator with blue bubbles, a CO2 generator with grey vapor, a steam generator with white clouds, and a black monolith.
22. A globe whose surface is split into many bright landscape bands: ice, tundra, conifer forest, forest, rainforest, grassland, desert, swamp, rock, coastal sea, deep ocean.
23. An open sticker album with 8 small stickers: tornado, tidal wave, meteor, volcano, mushroom cloud, wildfire, earthquake crack, green plague skull.
24. A row of falling dominoes, the first one on fire, flames jumping from domino to domino.
25. An open field notebook with pencil sketches of animals, a magnifying glass and a pencil lying on it.
26. A big red button under a raised glass safety cover, warning stripes around it.
27. A tall black monolith standing on a grassy plain, an early ape-like creature looking up at it, light rising behind.
28. A golden tree of life with many branches, small icons of cells, fish, plants, dinosaurs, birds and mammals at the branch tips.
29. A thick golden encyclopedia standing upright, an animal emblem on the cover, a soft glow around it.
30. A futuristic city under a dome of glowing blue hexagon nano-structures.
```

### Prompt 4 — Nr. 31–37 (schwer, Gold)

```
Create 7 separate square images (1:1), one image per item below. Do not put them together in one grid. Each image is a Steam achievement icon for a retro planet and evolution simulator game in the spirit of SimEarth.
Shared style for all 7: detailed 16-bit pixel art, bold saturated colors, one centered motif filling about 70% of the frame, dark navy circular background with a soft glow behind the motif, a thicker shining GOLD ring as the border, light from the top left. No text, no letters, no numbers. The motif must stay readable when shrunk to 64×64 pixels.

31. A radiant smiling planet face wearing a small golden crown, glowing like a sun, lush green continents.
32. A white dove flying over a peaceful blue-green globe, holding an olive branch.
33. An open hand gently holding a small living planet with clouds and green continents.
34. One planet split down the middle: the left half a glowing red molten young Earth, the right half today's blue-green Earth.
35. A purple octopus wearing a golden crown, holding small tools in its tentacles, an underwater city behind it.
36. A small dinosaur standing upright, proudly holding a stone tool, a meteor streaking harmlessly past in the sky behind.
37. A fiery phoenix rising out of a smoking meteor crater, green plants sprouting at the crater's rim.
```

### Prompt 5 — Nr. 38– (wird mit neuen Achievements auf 10 aufgefüllt)

```
Create 3 separate square images (1:1), one image per item below. Do not put them together in one grid. Each image is a Steam achievement icon for a retro planet and evolution simulator game in the spirit of SimEarth.
Shared style: detailed 16-bit pixel art, bold saturated colors, one centered motif filling about 70% of the frame, dark navy circular background with a soft glow behind the motif, light from the top left. No text, no letters, no numbers. The motif must stay readable when shrunk to 64×64 pixels.
Border: items 38 and 40 get a thin SILVER ring, item 39 gets a thin BRONZE ring.

38. Three grey dolphins with pale bellies leaping one after another in an arc out of a turquoise tropical sea, seen from the side, white splashes where they leave and enter the water.
39. A small pixel-art globe with a dashed flight path arcing across it from one side to the far side, ending at a glowing location pin.
40. Strings of shining oxygen bubbles rising out of turquoise coastal water over green bacterial mats near a rocky shore, popping into a bright, newly blue sky.
```

## Ideen für später (wenn das Feature kommt)

- Neue Werkzeuge, Epochen oder Katastrophen → je ein „Erstes Mal“-Achievement (leicht) und ein Meisterschafts-Achievement (schwer).
