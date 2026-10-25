# Schwierigkeitsgrade (Oktober 2026)

Ein neuer Planet startet auf **Einfach**, **Normal** oder **Schwer**. Die Wahl steht im Titelbildschirm (Kasten „Schwierigkeit“) und im Dialog „Neuer Planet“. Sie wird in den Einstellungen gemerkt und im Spielstand gespeichert (optionales Feld `difficulty`). Alte Spielstände laden als Normal.

Alle Stellwerte stehen in `DIFFICULTY_CONFIG` (`src/difficulty.ts`).

| | Einfach | Normal | Schwer |
|---|---|---|---|
| Start-Energie | 3000 Ω | 1500 Ω | 1000 Ω |
| Ω-Zuwachs / Speicher | ×2 / ×2 | ×1 / ×1 | ×1, je nach Gaias Stimmung ×0,5 bis ×1,5 |
| Spontane Evolution | an | aus | aus |
| Natürliche Vulkane, Meteore | aus (auch keine Blitzbrände) | wie bisher | doppelt so häufig |
| Modellfenster öffnen | 0 Ω | 100 Ω | 50 Ω |
| Klima | zieht stark ins Band 6–24 °C | zieht mild zurück, nur außerhalb 2–28 °C | verstärkt Abweichungen außerhalb 5–26 °C, dazu vier Kipppunkte |
| Aussterben | neu ansiedelbar | neu ansiedelbar | nach 40 Zeitschritten für immer (R.I.P.) |

Der Test-Takt (`SimCore.harnessTick`) behält die spontane Evolution auf jeder Stufe, weil die Seeds der Tests und Proben darauf abgestimmt sind.

## Kipppunkte auf Schwer (`src/hardclimate.ts`)

1. **Methankollaps:** Der erste Sauerstoff zerstört das Methan. Pro verlorener Verdopplung seit dem Höchststand gehen 2,4° verloren, höchstens 13°.
2. **Kohlewälder:** Der Torf der Riesenbärlapp-Sümpfe entzieht zusätzlich 12 ppm CO₂ je Gt, mal Regler „CO₂-Aufnahme“.
3. **Flutbasalt (253–250 Mio. J.):** +120 ppm CO₂ je Zeitschritt mal Regler „Vulkanismus“, dazu Asche.
4. **Industrie:** Fossiles CO₂ heizt dreifach.

Gleichzeitig wird die Sonne heller (+4° bis zum Perm, +9° bis heute). Eine Korrektur, die die Eiszeit verhindert, heizt den Planeten später deshalb zu stark. Jede Krise wird einmal angesagt. Klima-Warnungen kommen unter 5 °C (fallend) und über 26 °C (steigend), höchstens alle 60 Zeitschritte.

Probe (Seed 12345): Bei Standardreglern ist der Planet in einer Schneeball-Erde (−22 °C) gelandet. Damals stand der Klima-Wert auf −1,2, heute auf −1,0; mit −1,0 wurde nicht neu gemessen. Treibhauseffekt 0,50 → 0,53 bei der ersten Warnung hielt ihn bei 8–9 °C.

## Aussterben auf Schwer (`src/hardextinction.ts`)

Siehe den Nachtrag in `docs/aussterben-2026-10/bericht.md`.

## Einschränkungen

- Getestet: `npm run test:quick`, die Tests für Aussterben, Spielstand, Dinosaurier-Ära, spontane Evolution, Methan, Kohle und Gasbilanz. Dazu Screenshots von Titel und Dialog (Headless Chrome, 1920×1080 und 1366×768).
- Nur ein Seed geprobt. Kohle-, Flutbasalt- und Industrie-Krise wurden nicht in einem durchgehenden Lauf gemessen.
- Offen fürs Anspielen:
  - Wie schnell der Planet kippt.
  - Ob ein einziger Reglerschritt zu leicht rettet.
  - Ob 40 Zeitschritte Gnadenfrist passen.
  - Normal verhält sich unter 2 °C und über 28 °C jetzt anders als vorher.
