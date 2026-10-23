# Die Luft: Fenster „Luftzusammensetzung“, Methan und Luftdruck

Das Fenster „Luftzusammensetzung“ ist neu gestaltet, im Pixelstil der lebendigen Oberfläche. Zwei neue Größen gehören
jetzt zur Atmosphäre und wirken aufs Klima: Methan als zweites Treibhausgas des jungen Planeten und der Luftdruck, der
sich aus der Gasmischung ergibt.

## 1. Das Fenster (`src/airpanel.ts`, `css/airpanel.css`)

- Von oben:
  - Luftdruck und Mitteltemperatur nebeneinander.
  - Zusammensetzung der Luft: ein Balken der Anteile (N₂, O₂, Ar, CO₂, CH₄), jedes vorhandene Gas mindestens ein Pixel
    breit, darunter die Prozentwerte.
  - Sauerstoff, sein Weg vom Meer in die Luft: Gelöstes Eisen → O₂ im Meer → O₂ in der Luft. Die drei Stufen stehen
    nebeneinander, die Stufe, in der der Planet gerade steht, ist hell hinterlegt.
  - Darunter untereinander Stickstoff, Kohlendioxid, Methan, Wasserdampf und Staub.
- Gestaltung:
  - Pergamentkarten mit Goldrand auf dunklem Holz.
  - Jedes Gas zeigt sein Molekül als Pixel-Sprite (UI-Atlas, Familie `air`, 11 Sprites).
  - Ein Pixelbalken mit grüner Linie für den Bereich, in dem sich das Leben wohlfühlt. Warnwerte bekommen einen roten
    Rand.
- Beschreibungen erscheinen nur im Tooltip, bei Hover oder Tastaturfokus. Er zeigt Name, Wert, Skala, Bedeutung und die
  Treibhauswirkung in °C, mit dem Regler „Treibhauseffekt“ verrechnet. Die Mitteltemperatur schlüsselt die Wirkung auf:
  CO₂, Wasserdampf, Methan und Luftdruck.
- Methan steht auf einer logarithmischen Skala (0–1.000 ppm).
- Pixelkunst mit 2 CSS-px je Kunstpixel, in ganzen Gerätepixeln (bei 125 % Skalierung 2,4 CSS-px). Das Fenster ist
  540 × 660 px groß.
- Die acht Fenster des Planet-Menüs tragen ihr Pixel-Icon (`menu_*`) in der Titelleiste.

## 2. Methan (`src/methane.ts`, Werte in `src/params.ts`)

- `world.ch4` in ppm, ein neuer Planet beginnt bei 0.
- Quellen je Tick:
  - Archaeen (zweite Unterart der Einzeller) nach ihrer Dichte. Es zählt nur der Teil, der aus dem Meer entweicht:
    1 / (1 + (O₂ im Meer / 10 %)²).
  - Sümpfe (Lebensraum Sumpf).
  - Gestein und heiße Quellen, mit dem Regler „Vulkane“.
  - Die Zivilisation: 5 % ihres CO₂-Ausstoßes für Viehherden, Reisfelder und Erdgas.
- Abbau je Tick: 2 % ohne Sauerstoff, dazu 1 % je Prozent O₂ in der Luft (bei 21 % also 23 %). Ohne Sauerstoff
  sammelt sich Methan über rund 50 Ticks an, in heutiger Luft verschwindet es nach wenigen Ticks.
- Treibhauswirkung: 0,4 °C × log₂(1 + max(0, CH₄ − 0,7 ppm)).
  - 0,7 ppm ist die vorindustrielle Luft, mit der das Klima kalibriert wurde; dort wärmt Methan nicht.
  - 100 ppm ergeben etwa +2,7 °C, 1,9 ppm etwa +0,4 °C.
- Spielstände: das optionale Feld `ch4`, ohne neue Formatnummer. Ältere Stände beginnen bei 0,7 ppm.
- Das Glossar erklärt Methan und Luftdruck. „Treibhauseffekt“ und der gleichnamige Regler nennen jetzt auch Methan.

## 3. Luftdruck (`airPressure` in `src/methane.ts`)

- Stickstoff und Argon behalten ihren Partialdruck:
  - Stickstoff: `world.n2`, in % der heutigen Luft, fest 78.
  - Argon: 0,0093 bar.
- O₂, CO₂ und CH₄ sind Anteile der ganzen Luft:
  p = (n2/100 + 0,0093) / (1 − (O₂ + (CO₂ + CH₄)/10⁴) / 100).
- Ergebnis: ein junger Planet ohne Sauerstoff hat 0,79 bar, heutige Luft 1,00 bar, Luft mit 40 % O₂ 1,32 bar.
- Treibhauswirkung: 3 °C je bar Abweichung von 1 bar (Druckverbreiterung). Bei 0,79 bar sind das etwa −0,6 °C. Der
  Term ersetzt den alten Stickstoffterm, der nie wirkte, weil Stickstoff fest blieb.
- Im Fenster ist der Stickstoffanteil n2/p: auf dem jungen Planeten 99 %, heute 78 %.

## 4. Messung

Headless mit gierig gespieltem Baum (wie `tools/headless.js --life`), 2000 Ticks. Basis: Methan und Druck werden
gerechnet, wärmen aber nicht.

|                              | Basis 12345    | neu 12345      | Basis 2024     | neu 2024       |
|------------------------------|----------------|----------------|----------------|----------------|
| O₂ erreicht 5 / 10 / 15 % bei Tick | 907 / 1337 / 1831 | 773 / 1125 / 1425 | 741 / 1005 / 1227 | 852 / 1051 / 1276 |
| mittlere Temperatur          | 13,5 °C        | 13,2 °C        | 14,7 °C        | 16,1 °C        |
| mittlere Eisfläche           | 25,3 %         | 23,4 %         | 23,1 %         | 21,5 %         |
| höchstes Methan (alle 250 Ticks) | –          | 74 ppm         | –              | 105 ppm        |

- Bis O₂ etwa 10 % erreicht, ist der Planet rund 1–2 °C wärmer. Danach fällt Methan unter 2 ppm, ab etwa 18 % O₂ unter
  1 ppm.
- Der Sauerstoff-Fahrplan verschiebt sich je nach Planet in beide Richtungen (12345 früher, 2024 später). Einen
  systematischen Trend zeigen die zwei Planeten nicht.

## Einschränkungen

- Geprüft:
  - Nur in headless Chrome, bei 100 % und 125 % Skalierung.
  - Das Fenster mit veraltetem Stylesheet ist nicht geprüft. Nach dem Update einmal mit Strg+F5 neu laden.
- Tests:
  - Gemessen mit nur zwei Planeten.
  - `npm run test:full` ist nicht gelaufen.
  - Grün: `test:quick`, `tests/methane.test.js`, `tests/oceanchem.test.js`, `tests/save.test.js`,
    `tests/coal.test.js` und `tests/oil.test.js`.
- Vereinfachungen:
  - Stickstoff bleibt fest. Die Erde hatte vor 2,7 Mrd. Jahren vermutlich weniger als den halben heutigen Luftdruck;
    das Spiel bleibt bei 0,79 bar.
  - Kein organischer Dunst, der bei sehr viel Methan real kühlt. Keine Methanhydrate.

## Quellen

- Ueno, Y. et al. (2006): Evidence from fluid inclusions for microbial methanogenesis in the early Archaean era. Nature
  440, 516–519. Mikrobielles Methan vor 3,46 Mrd. Jahren.
- Pavlov, A. A. et al. (2000): Greenhouse warming by CH₄ in the atmosphere of early Earth. J. Geophys. Res. 105(E5),
  11981–11990.
- Kasting, J. F. (2005): Methane and climate during the Precambrian era. Precambrian Research 137, 119–129.
- Kopp, R. E. et al. (2005): The Paleoproterozoic snowball Earth: A climate disaster triggered by the evolution of
  oxygenic photosynthesis. PNAS 102, 11131–11136. Mit dem Sauerstoff bricht das Methan-Treibhaus zusammen.
- IPCC AR6, Arbeitsgruppe I (2021), Kap. 6 und 7: Methan hält sich rund 9–12 Jahre in der Luft; 1750 rund 0,73 ppm,
  2019 rund 1,87 ppm.
- Goldblatt, C. et al. (2009): Nitrogen-enhanced greenhouse warming on early Earth. Nature Geoscience 2, 891–896.
  Doppelter Stickstoffdruck wärmt die frühe Erde um rund 4 K.
- Som, S. M. et al. (2016): Earth's air pressure 2.7 billion years ago constrained to less than half of modern levels.
  Nature Geoscience 9, 448–451.
