# Steam-Achievements

Stand: 2026-10-22 · noch nicht im Code umgesetzt. Neue Features → prüfen, ob sie hier ein Achievement verdienen.

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
| 45 | `ACH_GAIA_COUGH` | Dicke Luft | Gaia hustet zum ersten Mal (Luft so verschmutzt, dass Smog um sie kreist: `gaiaFactors().clean < 0.5`, `src/gaia.ts`) | Pixel-Planetengesicht mit zugekniffenen Augen hustet ein graues Smogwölkchen aus |
| 53 | `ACH_SHARK_FINS` | Haie in Sicht! | Zum ersten Mal kreisende Haiflossen auf der Karte sehen (Zoom ≥ 16 px; erscheinen ab und zu, sobald Haie im Meer leben: `SharkLayer`, `src/sharklayer.ts`) | Zwei dunkle Haiflossen ziehen einen Kreis durch blaues Wasser |

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
| 41 | `ACH_ICE_CALVING` | Kalbung beobachtet | Eine Eisscholle bricht im Bild von der Packeiskante ab (Zoom ≥ 16 px) | Scholle bricht von weißer Packeiskante und stürzt mit Gischt ins dunkelblaue Meer |
| 42 | `ACH_SALMON_RUN` | Gegen den Strom | Eine Lachswanderung in einem Fluss mit „Untersuchen“ (Lupe) beobachten (Zoom ≥ 16 px) | Silber-roter Lachs springt im Bogen über eine schäumende Fluss-Stromschnelle, Lupen-Glanz |
| 43 | `ACH_STORK_MIGRATION` | Zug der Störche | Einen ziehenden Storchenschwarm auf der Karte mit „Untersuchen“ (Lupe) beobachten (Zoom ≥ 16 px) | Weiß-schwarze Störche mit roten Schnäbeln fliegen in V-Formation über grüne Flüsse und Auen |
| 44 | `ACH_FIRE_WINDOW` | Feuerfenster | Ein Blitz löst einen Flächenbrand aus, während die Luft über 30 % Sauerstoff enthält (Blitzbrand, `cause = 'natural'`, `src/hazardlightning.ts`) | Blitz schlägt in einen Wald ein, Flammen lodern hoch, darüber steigen Sauerstoffperlen auf und verglühen |
| 47 | `ACH_PALM_ISLES` | Palmeninseln | Die ersten Kokospalmen wachsen auf einer warmen Insel oder einer Sandinsel im Riff (Chronik-Eintrag „Palmeninseln“, Schlüssel `reefs:palms`, `src/reefs.ts`; braucht Laubbäume und Palmen ab 86 Mio. J.) | Kleine weiße Sandinsel mit zwei Kokospalmen, die sich über eine türkise Lagune neigen, Korallen ringsum |
| 48 | `ACH_OIL_PUMPED` | Schwarzes Gold | Die Zivilisation fördert das erste Öl: Mit dem Industriezeitalter entstehen einmalig eine Bohrinsel vor der Küste und ein Förderturm in der Wüste (`world.oilMined > 0`, `src/oil.ts`) | Pferdekopfpumpe und Bohrturm auf Wüstensand, schwarzer Öltropfen glänzt im Vordergrund |
| 50 | `ACH_TERMITE_MOUND` | Baumeister der Savanne | Den Termitenhügel in der Savanne mit „Untersuchen“ (Lupe) entdecken (Chronik-Eintrag „Termitenhügel entdeckt“, Schlüssel `sight:termites`, `src/termites.ts`; der Hügel entsteht, sobald Ameisen in einer Savanne leben) | Rot-oranger Lehmhügel mit Schloten in goldener Savanne, Termitenspur am Fuß, Lupen-Glanz |
| 51 | `ACH_CLOWNFISH` | Nemo gefunden | Clownfische, die aus einer Koralle schwimmen, mit „Untersuchen“ (Lupe) entdecken (Chronik-Eintrag „Clownfische entdeckt“, Schlüssel `sight:clownfish`, `src/migrations.ts`; auf jedem Riff, zu jeder Zeit, Zoom ≥ 24 Bildschirmpixel pro Feld) | Zwei orange-weiß gestreifte Clownfische schlüpfen aus einer violetten Seeanemone zwischen Korallen in türkisem Riffwasser, Lupen-Glanz |
| 52 | `ACH_NEVER_AGAIN` *(versteckt)* | Nie wieder | Nach dem ersten Atomschlag einer Zivilisation ächten alle Völker die Atombombe (Chronik-Eintrag „Alle Völker ächten die Atombombe“, `world.civ.atomBan`, `src/conflict.ts`; meist beendet die Bombe einen Krieg eines Volkes im Atomzeitalter gegen eines ohne; ein vom Spieler ausgelöster Atomschlag zählt nicht) | Zerbrochene Atombombe in zwei Hälften, durch den Spalt wächst ein Olivenzweig, dahinter verblasst ein Atompilz |
| 54 | `ACH_NEW_CONTINENT` | Land in Sicht! | Die Entdeckerfahrt mit drei Karavellen erreicht den neuen Kontinent; erst danach beginnt das Industriezeitalter (Chronik-Eintrag „Ein neuer Kontinent“, Schlüssel `civ:discovery`, `world.civ.discovery.state === 'found'`, `src/discovery.ts`; nur auf Planeten mit einem Kontinent ohne Stadt) | Drei Karavellen mit geblähten Segeln vor einer unbekannten grünen Küste, Möwen, Morgenlicht |
| 55 | `ACH_WONDERS_BOTH` | Baumeister der Antike | Die Pyramiden und die Chinesische Mauer stehen fertig auf demselben Planeten (Chronik-Schlüssel `civ:wonder:pyramids` und `civ:wonder:wall`, `src/wonders.ts`) | Weiße Pyramide mit goldener Spitze neben einem Mauerstück mit Wachturm, Abendsonne dahinter |
| 56 | `ACH_FIRST_RAILWAY` | Volldampf voraus | Die erste Eisenbahn des Planeten wird eröffnet (Chronik-Eintrag „Die erste Eisenbahn …“, Schlüssel `civ:rail:first`, `src/railway.ts`; ab dem Industriezeitalter, sobald ein Kontinent 3 Industriestädte hat) | Schwarze Dampflok mit rotem Kuhfänger und Dampfwolke auf einem Gleis, das sich durch eine Waldschneise zieht |
| 57 | `ACH_SEA_BATTLE` | Seeschlacht | Ein Schiff sinkt in einer Seeschlacht im Bild (Zoom ≥ 16 px; zwei Küstenstädte im Krieg, `Ship.sunkAt`, `src/fleets.ts`, `src/shiplayer.ts`) | Zwei Triremen im Gefecht, Brandpfeile fliegen, eine sinkt brennend mit Rauchsäule |
| 58 | `ACH_KAPOK` | Urwaldriese | Den Kapokbaum im Herzen des größten Regenwalds mit „Untersuchen“ (Lupe) entdecken (Chronik-Eintrag „Urwaldriese entdeckt“, Schlüssel `sight:kapok`, `src/kapok.ts`; der Baum entsteht, sobald ein Regenwald einen geschlossenen Kern von 5 × 5 Kacheln hat) | Riesiger Kapokbaum mit Schirmkrone und Brettwurzeln ragt über ein dunkelgrünes Kronendach, Lupen-Glanz |

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
| 49 | `ACH_NEW_WORLDS` | Start in neue Welten | Die Rakete des Raumfahrtprojekts mit dem roten Knopf starten (`world.space.launched >= 0`, `src/spaceport.ts`) | Weiße Rakete mit türkisem Ring steigt auf einer gleißenden Abgassäule aus einer Wüstenrampe, darüber Mars und Venus |
| 46 | `ACH_FULL_POWER` | Volle Kraft | Der Energiespeicher ist einmal randvoll: 15.000 Ω. Das geht nur auf der höchsten Energiestufe „Zivilisation“ (`world.omega >= OMEGA_MAX`, `src/energy.ts`); die Stufe allein reicht nicht | Goldene Energie-Sonne über einem bis zum Rand glühenden Energiebalken aus sechs Segmenten |

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

### Prompt 5 — Nr. 38–47

```
Create 10 separate square images (1:1), one image per item below. Do not put them together in one grid. Each image is a Steam achievement icon for a retro planet and evolution simulator game in the spirit of SimEarth.
Shared style: detailed 16-bit pixel art, bold saturated colors, one centered motif filling about 70% of the frame, dark navy circular background with a soft glow behind the motif, light from the top left. No text, no letters, no numbers. The motif must stay readable when shrunk to 64×64 pixels.
Border: items 38, 40, 41, 42, 43, 44 and 47 get a thin SILVER ring, items 39 and 45 get a thin BRONZE ring, item 46 gets a thicker shining GOLD ring.

38. Three grey dolphins with pale bellies leaping one after another in an arc out of a turquoise tropical sea, seen from the side, white splashes where they leave and enter the water.
39. A small pixel-art globe with a dashed flight path arcing across it from one side to the far side, ending at a glowing location pin.
40. Strings of shining oxygen bubbles rising out of turquoise coastal water over green bacterial mats near a rocky shore, popping into a bright, newly blue sky.
41. A white slab of sea ice breaking off the edge of a snowy pack ice shelf with a dark crack, tipping into a deep blue sea, a white splash and a foam ring where it hits the water.
42. A silver-red salmon leaping in a high arc over a foaming river rapid, white spray around it, the glint of a magnifying glass lens catching the scene.
43. A flock of white storks with black wing tips and long red beaks flying in a V formation over green river meadows and winding blue rivers, their small shadows on the ground below.
44. A bright lightning bolt striking a dark green pine forest, tall orange flames leaping up where it hits, glowing blue oxygen bubbles rising above the fire and burning up into sparks.
45. A cute pixel-art Earth with a face, eyes squeezed shut like ">" and "<", mouth open in a cough, a small grey smog cloud with a dark outline puffing out of its mouth, more grey smog clouds drifting around the planet.
46. A radiant golden energy sun with a bright ring at its core, hovering above a horizontal energy bar made of six segments, every segment glowing bright amber and filled to the brim, golden sparks overflowing at the end of the bar.
47. A tiny white sand island seen from slightly above, two coconut palms leaning out over a bright turquoise lagoon, brown coconuts under their green crowns, small colorful coral heads in the clear shallow water around the island, a thin white surf ring.
```

### Prompt 6 — Nr. 48–

```
Create 10 separate square images (1:1), one image per item below. Do not put them together in one grid. Each image is a Steam achievement icon for a retro planet and evolution simulator game in the spirit of SimEarth.
Shared style for all: detailed 16-bit pixel art, bold saturated colors, one centered motif filling about 70% of the frame, dark navy circular background with a soft glow behind the motif, a thin SILVER ring as the border (item 53: a thin BRONZE ring), light from the top left. No text, no letters, no numbers. The motif must stay readable when shrunk to 64×64 pixels.

48. A nodding horsehead pumpjack and a tall steel lattice oil derrick standing on golden desert sand under an orange evening sky, a big glossy black oil drop shining in the foreground.
50. A tall red-orange clay termite mound with several chimney spires standing in golden savanna grass, a flat-topped acacia tree in the background, a thin trail of tiny pale termites at its foot, the glint of a magnifying glass lens catching the scene.
51. Two orange clownfish with three bright white bands each slipping out of a violet sea anemone between pastel coral heads, seen slightly from above through clear turquoise reef water with soft light ripples, the glint of a magnifying glass lens catching the scene.
52. A dark atomic bomb with yellow warning stripes broken cleanly into two halves lying on cracked grey ground, a fresh green olive branch growing up through the gap between the halves, a pale mushroom cloud fading away in the background.
53. Two dark slate-grey shark dorsal fins, a big one and a smaller one, cutting through deep blue sea in a circle, seen slightly from above, white foam at the front of each fin and a curved trail of lighter, stirred water marking the circle.
54. Three caravels with billowing cream square sails and a triangular lateen sail on the rear mast, sailing in a small formation towards an unknown green coastline with cliffs and palm trees, seagulls above, pale morning light on the sea.
55. A white limestone pyramid with a shining gilded tip standing next to a grey stone wall section with crenellations and a square watchtower, both on warm sand, a low orange evening sun behind them.
56. A black steam locomotive with a red cowcatcher, a funnel-shaped chimney and big red driving wheels, puffing a white steam cloud, running on a track with wooden sleepers through a cut in a dark green pine forest.
57. Two black ancient warships with oars and square sails fighting at sea, flaming arrows flying between them, one ship sinking at the bow with fire on deck and a black smoke column, white foam and splashes around it.
58. A gigantic kapok tree towering high above a dense dark-green rainforest canopy, its broad flat tiered umbrella crown lit golden-green by the sun, a tall smooth pale grey trunk with huge flared plank buttress roots, a tiny red bromeliad in the fork, a soft magnifying-glass glint in the upper corner.
```

## Ideen für später (wenn das Feature kommt)

- Neue Werkzeuge, Epochen oder Katastrophen → je ein „Erstes Mal“-Achievement (leicht) und ein Meisterschafts-Achievement (schwer).
