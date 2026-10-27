# Steam-Trailer „Gaia Reborn – The Living Planet²“

Stand: 2026-10-25, Spielversion 0.92.5. Ergebnis: `tmp/trailer/gaia-reborn-trailer-v2.mp4`.

- **Format:** 63,5 s, 1920×1080, 30 fps, H.264 + AAC.
- **Text und Ton:** englische Texttafeln, Gaia als Sprecherin, Musik und Sounds aus dem Spiel.
- **Erste Fassung:** `gaia-reborn-trailer-v1.mp4` (46 s) bleibt daneben liegen.

## Idee

**„From Stardust to Starship.“** Der Trailer erzählt die Geschichte eines Planeten:

- vom Urknall über die erste Zelle,
- das grüne Afrika, Meer und Luft
- und den Untergang der Dinosaurier
- bis zum Raketenstart.

Gaia erzählt in Ich-Form. Ihre lebendige Oberfläche (Fels, Ranken, Stimmung) zeigt, wie es dem Planeten geht.

- **Stumm verständlich:** Steam spielt Trailer ohne Ton ab. Darum trägt jedes Bild seine Aussage selbst, und kurze Overlays (2–4 Wörter) liegen über laufendem Bild.
- **Scharf:** Alle Szenen laufen mit Zoom 32 (bzw. 16 für Afrika) bei Pixelverhältnis 1. Das sind ganzzahlige Vielfache der 16-px-Pixelart. Bei stärkerem Zoom skaliert das Spiel Tier-Icons hoch, und sie werden weich.
- **Deutsche UI:** Die Spieloberfläche ist deutsch. Fenster, Tooltips, Sprechblasen, Toasts und die Datumszeile der Topbar blendet die Aufnahme aus. Bewusst sichtbar bleiben:
  - das Fenster „Luftzusammensetzung“: Es soll die Tiefe des Spiels zeigen.
  - die kleinen Chip-Beschriftungen der Topbar.

## Ablauf (v2)

Die genaue Schnittliste steht in `CUT` in `tools/trailer-cut.js`.

| Zeit | Shot | Bild | Overlay | Gaia sagt |
|------|------|------|---------|-----------|
| 0:00 | `01-bigbang`, `02-*` | Logo zerplatzt im Urknall, Planeten entstehen, Flug durch die Wolken | FORGE A PLANET. | I was born from stardust. |
| 0:08 | `03-gaia-wakes` | Heutige Erde ohne Leben. Gaia schläft auf nacktem Fels, wacht auf, ihr DNA-Zauber; der Komet fliegt über Afrika zur ersten Zelle im Golf von Aden | BRING IT TO LIFE. (ab dem Zauber) | For ages, I slept, until the first spark of life. |
| 0:17 | `04-africa`, `04-africa-ui` | Afrika im Zeitraffer, von kahlem Fels zu Wäldern und Savanne. Mitten im Zeitraffer erscheint die Oberfläche: Die Ranke klettert die Leiste hinauf und blüht, Gaias Fels wird grün | WATCH IT GROW. | Then life crept ashore, and turned bare rock to green. |
| 0:24 | `05-dolphins`, `05-whale` | Delfinschule springt; ein Blauwal taucht auf und bläst, ein Buckelwal taucht mit der Fluke ab | 136 SPECIES TO DISCOVER. | From a single cell, to oceans full of song. |
| 0:31 | `06-air` | Fenster „Luftzusammensetzung“; ein Mauszeiger öffnet die Sauerstoff-Bilanz, die Landpflanzen nach Gruppen und die Atmung der Tiere | – | Every breath of air, balanced by countless lives. |
| 0:36 | `07-terraform` | Der Höhen-Pinsel hebt eine bewaldete Insel aus dem Meer | SHAPE IT. | Shape me. |
| 0:39 | `08-dino-fall` | Dinosaurier am Golf von Mexiko; der Komet schlägt nahe Chicxulub ein. Die Musik bricht ab, die Ranken vertrocknen und verlieren ihre Blätter, Gaia wird traurig, R.I.P.-Stempel mit dem Sauropoden | OR SHATTER IT. (ab dem Einschlag) | My giants stood on the brink of thought. … Or shatter me. |
| 0:47 | `09-ages`, `10-coast` | Vier Städte vom Steinzeitlager bis Nanotech; besiedelte Küste mit Eisenbahn | RAISE CIVILIZATIONS. | Raise your civilizations. |
| 0:54 | `11-launch` | Raketenstart (1,5×) | LAUNCH THEM TO THE STARS. | And carry them to the stars. |
| 0:59 | `12-logo` | Logo | FROM STARDUST TO STARSHIP. · WISHLIST NOW ON STEAM | Gaia Reborn. The Living Planet. |

## Wo das Spiel gesteuert wird

Die Szenen spielen das echte Spiel. An einigen Stellen hilft die Aufnahme nach, damit das Gewünschte ins Bild kommt (Details als Kommentare in `tools/trailer/shots.js`):

- **Afrika (04):**
  - Das Landleben beginnt im Spiel von selbst im Amazonas. Darum entsteht jede Pflanzengruppe nach Plan (Entwicklermodus nur für den Moment des Aufrufs, nie sichtbar).
  - Gesetzt wird sie mit dem Pflanzen-Werkzeug des Spiels an Afrikas Küsten, Flüssen und im Inneren.
  - Ausbreitung, Böden, Savanne und Wüsten macht die Simulation.
- **Meer (05):**
  - Wal und Delfine werden gezielt ins Bild gesetzt, ihre Zyklen so gelegt, dass Auftauchen und Sprünge im Shot liegen.
  - Walruf und Delfinpfiff, die das Spiel nur mit einer Wahrscheinlichkeit spielt, sind dabei sicher.
- **Luft (06):** Der Mauszeiger ist eingeblendet, die Popover öffnen über ihre echten Hover-Ereignisse.
- **Dinosaurier (08):**
  - Die Welt (`tmp/trailer/worlds/dino.save`, `node tools/trailer/dino-world.js`, ca. 8 min) ist die heutige Erde, gespielt bis zur Frage nach den ersten Vögeln. Danach siedeln Dinosaurier mit der Regel des Platzierungs-Werkzeugs um den Golf von Mexiko.
  - Im Shot fällt die Antwort „Komet“, gezielt auf den nächsten Landblock zu Chicxulub. Den Rest spielt die Komet-Show des Spiels.
  - Fragedialog und Nachrichtenfenster bleiben zu. Von den Stempeln erscheint nur der der Dinosaurier, ohne seinen deutschen Namen und Untertitel.

## Ton

- **Musik:**
  - `IntroMusic.mp3` ab dem Urknall wie im Intro; sie blendet sich bei 27 s (ca. 0:15) selbst aus.
  - Mit der ersten Zelle setzt `lumiere-du-matin.mp3` ein. Sie steht so, dass ihr Höhepunkt (2:15) genau auf den Kometeneinschlag fällt, dort bricht sie ab.
  - Nach 4 s Stille mit Explosion und Beben kehrt sie mit ihrem zweiten Anstieg (ab 2:29) für die Städte zurück und klingt mit dem Logo aus.
  - Unter Gaias Stimme wird die Musik automatisch leiser.
- **Sprecherin:**
  - Higgsfield Seed Audio, Stimme „Maeve“, Tempo −15. Die Aufnahme ist `tmp/trailer/voice/gaia2.wav` (2,9 Credits); `gaia.wav` ist die Stimme von v1.
  - Die Satzgrenzen stehen in `PHRASES`, die Einsätze in `LINES`.
- **Spielsounds, bildgenau:**
  - Jede Aufnahme protokolliert die Sounds, die das Spiel startet, mit ihrem Frame (`sfx.json`: Walruf, Delfinpfiff, Vulkan …). Das Schnitt-Werkzeug legt dieselbe Datei an dieselbe Stelle (`GAME_SFX`).
  - Pinsel, Raketenstart und Gaias Zauber-Akkord sind WebAudio-Klänge. Sie werden offline in Chrome gerendert, der Pinsel Frame für Frame aus dem Protokoll von Shot 07.
- **Zusätzlich:**
  - Vogelgesang, der mit dem Grün anschwillt
  - Meeresrauschen
  - Delfin-Spritzer (kurze Wellenbrecher aus `ocean-waves.mp3`)
  - Bassgrollen vor dem Einschlag, dann Explosion und Beben
- **Lautheit:** −13,4 LUFS integriert, Spitze −1,2 dBFS.
- **Bewusst nicht verwendet:** Wisch- und Aufschlag-Sound des Stempels (`swipe.mp3`, `hit-sfx.mp3`). Für sie fehlt ein Lizenzeintrag.

## Neu erstellen

```
node tools/perf-bench.js saves              # tmp/perf/civ.save, falls nicht vorhanden
node tools/trailer/dino-world.js            # tmp/trailer/worlds/dino.save, falls nicht vorhanden
node tools/trailer-record.js [shot …]       # alle Shots oder einzelne (Nummer oder id)
FFMPEG=<ffmpeg mit libx264> node tools/trailer-cut.js
```

- **Aufnahme:** `tools/trailer-record.js` nimmt die Shots aus `tools/trailer/shots.js` unter der virtuellen Uhr aus `tools/trailer/page.js` auf.
  - Die Uhr steuert `requestAnimationFrame`, Timer, Web Animations, `performance.now` und `Date.now`. Jedes Bild liegt dadurch genau 1/30 s nach dem vorigen.
  - Ausgabe: `tmp/trailer/<shot>/0000.png …` plus `sheet.png`, `sfx.json` und `log.json`.
- **Dauer:** Die Afrika-Shots brauchen je 3–5 Minuten, der Schnitt gut 2 Minuten.
- **ffmpeg:** Auf diesem Rechner hat nur die 32-Bit-Kopie von EaseUS libx264. Darum brennt das Werkzeug die Overlays einzeln in ihre Frames ein und kodiert mit 4 Threads.

## Export für Steam

Das MP4 erfüllt die Vorgaben bereits:

- H.264, 1920×1080, 30 fps, ca. 6 Mbit/s
- AAC 48 kHz Stereo

Ein Hochformat gibt es bewusst nicht, das Spiel ist nur für den Desktop.

## Nicht versprechen

Diese Dinge zeigt der Trailer nicht:

- die experimentellen WebGL-Wassereffekte (Aufnahme mit `waterfx=off`)
- das Terraforming von Mars und Venus (der Startfilm endet vor dem Schlusstext)
- menschliche Siedler
- Steam-Achievements
- andere Plattformen als den Desktop-Browser
- englischen Text im Spiel. Die Overlays sind Trailer-Grafik, der Stempel zeigt nur Symbol und R.I.P.

## Offene Punkte

- **Lizenz von `IntroMusic.mp3` klären** und in `assets/audio/LIZENZEN.md` eintragen. Erst dann darf der Trailer veröffentlicht werden. Sonst `lumiere-du-matin.mp3` durchgehend verwenden.
- **Englischer Trailer, deutsches Spiel:** Steam zeigt die unterstützten Sprachen. Vor dem Release entweder lokalisieren (Konzept in `docs/lokalisierung-2026-10/`) oder Overlays und Stimme auf Deutsch.
- **Lizenzen der Stempel-Sounds:** `swipe.mp3` und `hit-sfx.mp3` haben keinen Lizenzeintrag. Dasselbe gilt für die Klick-Sounds und `the-sound-of-an-iceberg-cracking.mp3`.
