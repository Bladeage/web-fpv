# FPV-Simulator

## ▶ Jetzt fliegen: https://bladeage.github.io/web-fpv/

Läuft direkt im Browser, ohne Installation. Empfohlen: Chrome oder Edge (PC), Chrome (Android). Funke per USB als Gamepad, sonst Tastatur oder Touch.

Browser-Simulator für FPV-Drohnen. Reines HTML, CSS, JavaScript, WebGL2. Keine fremden Bibliotheken, einzige Ausnahme: Betaflight als Flugregler (GPLv3, siehe Lizenz).
Ausgaben: `dist/fpvsim.html` und `dist/fpvsim.aspx` (für SharePoint, reines ASCII).

- Stand und Hintergrund: `docs/handover-2026-11-06.md` (ältere Übergabe: `docs/handover-2026-10-30.md`)
- Echte Welt (Daten, Quellen, Etappen L1 bis L5): `docs/echte-welt.md`
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
| `src/bf.js` | Betaflight als Flugregler (WebAssembly aus `sitl/`, GPLv3) |
| `src/town.js`, `src/aircraft.js`, `src/balloon.js` | Kleine Stadt mit Testecken, Flugzeuge der Jagd, Ballon |
| `src/eggs.js`, `src/birds.js`, `src/pilot.js` | Ostereier, Vögel, Pilot mit Funke hinter dem Startplatz |
| `src/render.js`, `src/hud.js`, `src/audio.js`, `src/menu.js` | WebGL, OSD, Ton, Menü |
| `src/geo.js` | GeoTIFF lesen, UTM und WGS84 umrechnen, CityGML (LoD2) lesen |
| `src/realworld.js` | Echte Welt: Gelände, Gebäude, Bäume, Wasser, Netze; Laden eingebettet oder live, Quellenplanung an Grenzen |
| `src/rwload.js` | Echte Welt: Quellen (NRW-Vorlage), Abruf-Adressen, Laden und Packen eines Gebiets, Zusammensetzen an Landesgrenzen, Prüfen, Quellen-Datei |
| `src/rwdlm.js` | Echte Welt: Basis-DLM (ZIP, Shape, DBF) für Gewässer und Ortsnamen |
| `src/rwstore.js` | Echte Welt: Speicher im Browser (IndexedDB) für Orte und Landesdaten |
| `src/demap.js`, `src/mapui.js`, `src/srcui.js` | Deutschlandkarte (Daten und Bedienung), Seiten „Quellen“ und „Quelle bearbeiten“ |
| `tools/build.mjs` | Build ohne Abhängigkeiten |
| `tools/aspx.mjs` | ASPX-Konverter (Node-Port von `tools/to_aspx.py`) |
| `tools/realworld.mjs` | Monschau laden und in `realworld/` ablegen (derselbe Code wie das Live-Laden) |
| `tools/water.mjs`, `tools/features.mjs` | Gewässer und Kartenebenen für Monschau aus dem Basis-DLM |
| `tools/germany.mjs` | Ländergrenzen für die Deutschlandkarte (BKG VG2500) |
| `tools/mesh.mjs` | 3D-Mesh NRW (Index, grobe Stufe); derzeit nicht eingebettet, für ein späteres Nachladen |
| `tools/record-legacy-trace.mjs` | Nimmt Referenzdaten aus `legacy/` auf. Braucht Playwright, nicht Teil von Build und Tests. |
| `sitl/` | Quellen und Build-Skript für Betaflight als WebAssembly |
| `test/` | Tests mit `node:test` |

`math`, `format`, `state`, `world`, `physics`, `gamepad`, `scenario`, `drone`, `osd`, `signal`, `targets`, `vehicles`, `bf`, `balloon`, `aircraft`, `town`, `eggs`, `birds`, `pilot`, `geo`, `realworld`, `rwload`, `rwdlm` und `demap` laufen ohne DOM und WebGL. Die Tests importieren sie direkt in Node.

## Daten „Echte Welt“

Gelände und Luftbild von Monschau: Geobasis NRW, Datenlizenz Deutschland – Zero 2.0 (https://www.govdata.de/dl-de/zero-2-0). Abgelegt in `realworld/`, geladen mit `node tools/realworld.mjs`, beim Build eingebettet. Plan: `docs/echte-welt.md`.

Andere Orte lädt der Browser live (1 x 1 km): Modus „Echte Welt“ → „Ort laden“, Breite und Länge eintragen oder „Karte“ öffnen und klicken. Für NRW sind die Dienste von Geobasis NRW hinterlegt (dl-de/zero-2.0). Für andere Bundesländer trägt man die Dienste unter Karte → „Quellen“ ein (Höhen als WCS, Luftbild als WMS, Gebäude als LoD2-Kacheln); „Prüfen“ testet sie, „Exportieren“ und „Importieren“ geben sie weiter. An Landesgrenzen setzt das Programm mehrere Quellen zusammen. Um jedes Gebiet liegen 10 x 10 km grobes Gelände mit Luftbild; beim Fliegen lädt das Programm Gebäude und Bäume in 1-km-Kacheln nach. Geladene Orte bleiben im Browser gespeichert und öffnen sich später ohne Netz („Gespeicherte Orte“). Gewässer und Ortsnamen für NRW lädt man einmal unter Echte Welt → Optionen → Daten (etwa 60 MB). Dort lassen sich alle Geodaten als eine Datei exportieren und an einem anderen Rechner ohne Netz importieren.

Deutschlandkarte zur Auswahl:
- Ländergrenzen: © BKG 2026 dl-de/by-2-0 (https://www.govdata.de/dlde/by-2-0), VG2500, vereinfacht; Datenquellen: https://sgx.geodatenzentrum.de/web_public/gdz/datenquellen/datenquellen_vg_nuts.pdf. Abgelegt in `realworld/germany.json` (`node tools/germany.mjs`).
- Hintergrundkarte (nur online): basemap.de, © GeoBasis-DE / BKG 2026, CC BY 4.0.

## Lizenz

GNU General Public License Version 3 (GPLv3), Text in `LICENSE`.

Grund: Der Simulator enthält Betaflight (https://github.com/betaflight/betaflight, GPLv3), als WebAssembly kompiliert und in `dist/fpvsim.html` eingebettet.
Damit steht das Gesamtpaket unter GPLv3. Der zugehörige Quellcode ist dieses Repository: Betaflight-Stand, Änderungen und Bauweg in `sitl/` (siehe `sitl/README.md`).
Wer die Datei weitergibt, muss den Quellcode mit anbieten (etwa als Link auf dieses Repository) und die Lizenz beibehalten.
