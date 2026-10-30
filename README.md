# FPV-Simulator

Browser-Simulator für FPV-Drohnen. Reines HTML, CSS, JavaScript, WebGL2. Keine Bibliotheken.
Ausgaben: `dist/fpvsim.html` und `dist/fpvsim.aspx` (für SharePoint, reines ASCII).

- Stand und Hintergrund: `docs/handover-2026-10-30.md`
- Etappenplan: `docs/PLAN.md`
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
| `src/scenario.js` | Szenarien: Torkurs, Ringe, Slalom, Landung, Freiflug; Schwierigkeit |
| `src/drone.js` | Drohnen-Vorlagen 3", 5", 7" (Schätzwerte) |
| `src/osd.js` | OSD-Inhalt: Elemente, Beschriftung, Warnungen |
| `src/gamepad.js`, `src/input.js` | Funke/Gamepad, Tastatur, Touch |
| `src/render.js`, `src/hud.js`, `src/audio.js`, `src/menu.js` | WebGL, OSD, Ton, Menü |
| `tools/build.mjs` | Build ohne Abhängigkeiten |
| `tools/aspx.mjs` | ASPX-Konverter (Node-Port von `tools/to_aspx.py`) |
| `tools/record-legacy-trace.mjs` | Nimmt Referenzdaten aus `legacy/` auf. Braucht Playwright, nicht Teil von Build und Tests. |
| `test/` | Tests mit `node:test` |

`math.js`, `format.js`, `state.js`, `world.js`, `physics.js`, `gamepad.js`, `scenario.js`, `drone.js` und `osd.js` laufen ohne DOM und WebGL. Die Tests importieren sie direkt in Node.
