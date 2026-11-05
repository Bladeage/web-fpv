# FPV-Simulator

## ▶ Jetzt fliegen: https://bladeage.github.io/web-fpv/

Läuft direkt im Browser, ohne Installation. Empfohlen: Chrome oder Edge (PC), Chrome (Android). Funke per USB als Gamepad, sonst Tastatur oder Touch.

Browser-Simulator für FPV-Drohnen. Reines HTML, CSS, JavaScript, WebGL2. Keine fremden Bibliotheken, einzige Ausnahme: Betaflight als Flugregler (GPLv3, siehe Lizenz).
Ausgaben: `dist/fpvsim.html` und `dist/fpvsim.aspx` (für SharePoint, reines ASCII).

- Stand und Hintergrund: `docs/handover-2026-10-30.md`
- Etappenplan: `docs/PLAN.md`
- Prompt-Historie: `docs/prompt-historie.md`
- Bisheriger Stand als Einzeldatei (Referenz, wird nicht mehr geändert): `legacy/fpv-sim-stufe1.html`
- SharePoint-Technik-Probe: `sharepoint-poc/`

## Bauen und testen

Voraussetzung: Node.js 22 oder neuer. Sonst nichts.

```bash
npm run build
```

```bash
npm test
```

Der Build schreibt `dist/fpvsim.html` und `dist/fpvsim.aspx`. `dist/` liegt nicht im Repo.
Die CI baut bei jedem Push und legt `dist/` als Artefakt `fpvsim-dist` ab
(GitHub, Reiter „Actions“, Lauf öffnen, unten bei „Artifacts“).

Bei jedem Push auf den Standard-Branch veröffentlicht die CI die Seite auf GitHub Pages:
https://bladeage.github.io/web-fpv/ (Simulator) und
https://bladeage.github.io/web-fpv/fpvsim.aspx (Download der .aspx).
Einmalig nötig: GitHub, Settings, Pages, Source auf „GitHub Actions“ stellen.

Zum Entwickeln ohne Build: einen Webserver im Repo starten, zum Beispiel
`python3 -m http.server`, dann `http://localhost:8000/src/index.html` öffnen.
Per Doppelklick (`file://`) laden Browser keine ES-Module.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `src/index.html`, `src/style.css` | Seite und Aussehen |
| `src/main.js` | Einstieg, Hauptschleife, Testzugang `window.__fpv` |
| `src/state.js` | Gemeinsamer Zustand: Einstellungen, Spielzustand, Eingabewerte, Meldungen |
| `src/math.js`, `src/format.js` | Vektoren, Quaternionen, Matrizen, Zeitformate |
| `src/world.js` | Welt, Tore, Hindernisse, Drohnenmodell |
| `src/physics.js` | Flugmodell, Akku, Kollision, Tore |
| `src/scenario.js` | Szenarien: Torkurs, Ringe, Slalom, Landung, Jagd, Paketlieferung, Verfolgung, Freiflug; Anordnung, Schwierigkeit |
| `src/drone.js` | Drohnen-Vorlagen 3", 5", 7" (Schätzwerte) |
| `src/osd.js` | OSD-Inhalt: Elemente, Beschriftung, Warnungen |
| `src/targets.js` | Ziel-Drohnen der Jagd Luft: Routen, Verhalten, Treffer |
| `src/vehicles.js` | Fahrzeuge der Jagd Boden: Fahrspur, Tempo, Treffer |
| `src/signal.js` | Funkstrecke: Video und Steuerverbindung, Dämpfung durch Hindernisse |
| `src/gamepad.js`, `src/input.js` | Funke/Gamepad, Tastatur, Touch |
| `src/render.js`, `src/hud.js`, `src/audio.js`, `src/menu.js` | WebGL, OSD, Ton, Menü |
| `tools/build.mjs` | Build ohne Abhängigkeiten |
| `tools/aspx.mjs` | ASPX-Konverter (Node-Port von `tools/to_aspx.py`) |
| `tools/record-legacy-trace.mjs` | Nimmt Referenzdaten aus `legacy/` auf. Braucht Playwright, nicht Teil von Build und Tests. |
| `test/` | Tests mit `node:test` |

`math.js`, `format.js`, `state.js`, `world.js`, `physics.js`, `gamepad.js`, `scenario.js`, `drone.js`, `osd.js`, `signal.js`, `targets.js`, `vehicles.js`, `bf.js`, `balloon.js`, `aircraft.js`, `town.js`, `eggs.js` und `birds.js` laufen ohne DOM und WebGL. Die Tests importieren sie direkt in Node.

## Lizenz

GNU General Public License Version 3 (GPLv3), Text in `LICENSE`.

Grund: Der Simulator enthält Betaflight (https://github.com/betaflight/betaflight, GPLv3), als WebAssembly kompiliert und in `dist/fpvsim.html` eingebettet.
Damit steht das Gesamtpaket unter GPLv3. Der zugehörige Quellcode ist dieses Repository: Betaflight-Stand, Änderungen und Bauweg in `sitl/` (siehe `sitl/README.md`).
Wer die Datei weitergibt, muss den Quellcode mit anbieten (etwa als Link auf dieses Repository) und die Lizenz beibehalten.
