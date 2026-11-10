# Plan: Grafik-Presets mit „Foto 3D“ (10.11.2026, Fable)

Nur Planung, kein Code. Auftrag des Nutzers (10.11.2026): Die Sichtprobe 3D-Mesh (`?mesh=1`) sieht besser aus, kostet aber Bildrate (i9-13900HX, RTX 4080 Laptop, Zen-Browser auf Firefox-Basis). Das Mesh soll ein eigenes Grafik-Preset werden. Das Menü darf nicht voller werden. Die heutige Optik darf nicht schlechter werden.

Einstufung: **gesichert** = im Code gelesen (Fundstelle, Stand Commit `eddacc1`). **vermutet** = nicht geprüft. **Schätzung** = Zahl mit genannter Annahme. Aufwand: S = unter einer Sitzung, M = eine Sitzung, L = zwei Sitzungen.

Wichtig für alle Zahlen zur Leistung: In dieser Umgebung gibt es keinen Browser und keine Grafikkarte. Gemessen ist hier nichts an der Bildrate. Die Etappe G2 beginnt deshalb mit einer Messung beim Nutzer.

## 0 Was heute da ist (gesichert)

| Was | Fundstelle |
|---|---|
| `cfg.gfx`: `'nice'`, am Handy (`pointer:coarse`) `'mid'`; dritter Wert `'simple'` | `src/state.js:11` |
| Stufe für die Shader: `GFX = simple ? 0 : mid ? 1 : 2`. Jeder unbekannte Wert ergibt 2 (Schön) | `src/render.js:778` |
| `uGfx` geht an Himmel (`PS`), Welt (`P`) und Mesh (`PM`) | `src/render.js:779, 792, 1234` |
| Einfach (0): einfacher Lichtpfad, auf der Spielkarte Schachbrett-Boden und dichterer Nebel (1/260 statt 1/380) | `src/render.js:295, 309, 791` |
| Ab Mittel (1): Licht mit ACES, Wolken (3 Oktaven), Sterne, Baumkronen im Wind, weiche Schatten unter bewegten Objekten, Laternen mit Lichtflächen, Lens-Flare | `src/render.js:59, 408, 418-420, 910, 1049, 1356` |
| Nur Schön (2): Bodentextur und Korn nah am Boden, Fenster auf Wänden und Bodendunst (Spielkarte), Wolken mit 5 Oktaven, Mondhof, Funkeln der Sterne, Lichtkegel der Autos | `src/render.js:247, 265, 323-330, 352, 407, 413, 420, 1057` |
| Kondensstreifen: in jeder Stufe (kein `uGfx` in der Zeile) | `src/render.js:428` |
| Auflösung automatisch `cfg.autoRes`: eigenes Häkchen, unabhängig vom Preset. Senkt das 3D-Bild bis 50 %, dann Sparmodus `lite` | `src/render.js:680-702`, `src/index.html:213` |
| Texturgrößen der Luftbilder hängen nur am Gerät (`LOW_MEM`), nicht am Preset: 4096/2048 oder 2048/1024 | `src/render.js:1160-1161` |
| `LOW_MEM` = Handy oder `navigator.deviceMemory <= 4` | `src/render.js:1160` |
| WebGL-Kontext: `antialias: true`, `powerPreference: 'high-performance'` | `src/render.js:36` |
| Mesh-Probe: `MESH_PROBE` (nur `?mesh=1`), `meshOn()` = Probe, echte Welt, nicht DIS, Gebiet in UTM 32 | `src/render.js:1183-1184` |
| Mesh-Grenzen: `I3S.q` 1 (`LOW_MEM` 2,5), `maxNodes` 160, `gpuMB` 260, `para` 6, `keep` 8 s, `nearR` 150 m, `sink` 4 m | `src/rwmesh.js:10`, `src/render.js:1221` |
| Laden und Hochladen eines Knotens im Hauptprogramm, sofort wenn die Daten da sind: Puffer, `texImage2D`, `generateMipmap`, Anisotropie 8 (fragt die Obergrenze je Knoten neu ab) | `src/render.js:1193-1211` |
| Reihenfolge je Bild: erst Gelände und Umgebung, dann das Mesh. Das Gelände ist dann 4 m abgesenkt (`uSink`), also fast ganz verdeckt, wird aber voll gerechnet | `src/render.js:63, 800-801, 1314-1317, 1341` |
| Mit sichtbarem Mesh nicht gezeichnet: Wasser, LoD2-Häuser, eigene Bäume, Kartenlinien. Laternen, Autos, Schatten bleiben | `src/render.js:1326, 1329, 1337, 1344, 1049` |
| Freigabe einmal je Sekunde; nur Knoten, die 8 s nicht gezeichnet wurden | `src/render.js:1226`, `src/rwmesh.js:81-91` |
| Auswahl je Bild rechnet Abstand und Sichtprüfung je Knoten mehrfach (auch im Sortieren) | `src/rwmesh.js:49, 74` |
| Menü Einstellungen → Allgemein: Regler, 8 Häkchen, Videobild und Sicht als `.segpair`, Grafik `#gfxSeg` (`.seg.seg3.small`, Reihenfolge Schön, Mittel, Einfach), Schaden | `src/index.html:208-239` |
| Verdrahtung ist allgemein: jeder Knopf in `#gfxSeg` setzt `cfg.gfx = dataset.gfx`; `syncMenu` markiert den passenden | `src/menu.js:191, 613` |
| `.seg4` wird am Handy zu zwei Spalten (also zwei Zeilen) | `src/style.css:144, 262` |
| `cfgMigrate(c)` kennt `gfx` nicht; Tests vergleichen die Ausgabe genau (`deepEqual`) | `src/state.js:77-86`, `test/scenario.test.mjs:176-184` |
| Gemessen in M0 (Software-Grafik): Köln Dom 28 Teile, Brücke 46 Teile, Grafikspeicher erreicht die Grenze 260 MB | `docs/PLAN.md:501` |

## 1 Die Presets

### 1.1 Grundsatz

- Einfach, Mittel und Schön bleiben, wie sie sind. Gleiche Namen, gleiche gespeicherten Werte, gleiche Code-Wege. Kein Pixel ändert sich.
- Neu ist ein viertes Preset: **Foto 3D**. Es ist „Schön plus Mesh, wo es ein Mesh gibt“. Gespeicherter Wert `cfg.gfx = 'mesh'`.
- Keine neuen Regler. Die Qualitätsgrenzen des Mesh stehen fest im Code (nach Gerät), wie heute.
- „Auflösung automatisch“ bleibt ein eigenes Häkchen für alle Presets.

Folge aus `render.js:778` (gesichert): Der Wert `'mesh'` ergibt schon heute Stufe 2. Schatten, Laternen, Flare, Wolken folgen ohne Änderung. Es fehlt nur das Einschalten des Mesh.

### 1.2 Was jedes Preset schaltet

| | Einfach `simple` | Mittel `mid` | Schön `nice` | Foto 3D `mesh` (neu) |
|---|---|---|---|---|
| Shader-Stufe `uGfx` | 0 | 1 | 2 | 2 |
| Licht | einfach | ACES | ACES | ACES |
| Wolken | aus | 3 Oktaven | 5 Oktaven | 5 Oktaven |
| Sterne, Mondhof (nachts) | aus | Sterne | Sterne mit Funkeln, Mondhof | wie Schön |
| Baumkronen im Wind | aus | an | an | an (nur wo eigene Bäume gezeichnet werden) |
| Schatten unter Objekten | aus | an | an | an |
| Laternen und Lichtflächen (nachts, echte Welt) | aus | an | an | an |
| Lichtkegel der Autos | aus | aus | an | an |
| Lens-Flare | aus | an | an | an |
| Kondensstreifen | an | an | an | an |
| Bodentextur, Fenster, Bodendunst (Spielkarte) | aus | aus | an | an |
| Luftbild-Texturen | nach Gerät | nach Gerät | nach Gerät | nach Gerät |
| Auflösung | Häkchen `autoRes` | Häkchen | Häkchen | Häkchen |
| 3D-Mesh NRW | aus | aus | aus | **an**, wenn echte Welt, NRW, nicht DIS |
| Häuser (LoD2), eigene Bäume, Wasser, Kartenlinien | an | an | an | aus, sobald Mesh-Teile zu sehen sind |
| Daten aus dem Netz je Flug | keine zusätzlichen | keine | keine | 20 bis 60 MB (Schätzung aus `docs/pruefung-3d-mesh.md`), nichts gespeichert |
| Physik | gleich | gleich | gleich | gleich (LoD2 und Geländemodell) |

Alles in den ersten drei Spalten ist der Stand von heute (gesichert, Abschnitt 0).

### 1.3 Qualitätsgrenzen des Mesh in Foto 3D

Start in G1 mit den Werten der Probe. Der Nutzer kennt dieses Bild. Änderungen erst in G3 nach der Messung.

| Grenze | Rechner (G1, wie Probe) | Vorschlag nach Messung (G3) | Handy (`LOW_MEM`) |
|---|---|---|---|
| `q` (1 = Schwelle des Dienstes) | 1 | 1, aber Bildhöhe für die Auswahl höchstens 1080 Zeilen (siehe 3.3) | 2,5 (heute schon) |
| `maxNodes` | 160 | 240 | 80 |
| `gpuMB` | 260 | 400 | 90 |
| `keep` | 8 s | 15 s | 8 s |
| Texturen | wie geliefert (bis 2048 x 1024) | wie geliefert | längste Kante 1024 |
| `para` (Abrufe zugleich) | 6 | 6, aber höchstens 1 Hochladen je Bild (G2) | 4 |

Die Werte für das Handy stammen aus `docs/plan-3d-mesh.md` Abschnitt 2.1 und 2.7 (dort als Schätzung). Die Spalte G3 ist ein Vorschlag, Begründung in Abschnitt 3.

### 1.4 Wenn es am Ort kein Mesh gibt

Foto 3D ist eine allgemeine Einstellung. Die Welt wechselt, die Einstellung bleibt.

| Ort | Verhalten | Hinweis |
|---|---|---|
| Spielkarte | wie Schön (alles außer dem Mesh ist gleich) | keiner im Flug; steht im `title` des Knopfs |
| Echte Welt außerhalb NRW | wie Schön | einmal je Ort: `say('Foto 3D: hier kein 3D-Mesh (nur NRW). Grafik wie Schön.', 3)` |
| DIS-Übung | wie Schön (Inhalt kommt vom Partner) | einmal: „Foto 3D: nicht in der DIS-Übung. Grafik wie Schön.“ |
| NRW, Dienst nicht erreichbar oder offline | wie Schön (`meshShow` bleibt falsch, Häuser und Bäume bleiben; so arbeitet die Probe schon, `render.js:1227`) | einmal: „Foto 3D: 3D-Mesh nicht erreichbar. Grafik wie Schön.“ |
| NRW, Mesh lädt noch | wie Schön, das Mesh ersetzt Häuser und Bäume, sobald Teile da sind | keiner |

- `cfg.gfx` bleibt in allen Fällen `'mesh'`. Es wird nichts umgestellt. Der Knopf bleibt markiert.
- Der Knopf wird nie gesperrt. Grund: Im Pause-Menü wäre ein grauer Knopf verwirrend, und die Wahl gilt für den nächsten Ort.
- „Nur NRW“ erkennen: heute prüft `meshOn()` nur UTM 32 (`render.js:1184`). Das gilt auch für Niedersachsen, Hessen und andere. Dort lädt die Probe die 108 Wurzelseiten umsonst. Vorschlag: zusätzlich `deLandAt(E, N) === 'Nordrhein-Westfalen'` (`src/demap.js:23`, ohne DOM) an der Mitte und den vier Ecken des Gebiets; ein Treffer reicht. Das eingebaute Monschau liegt in NRW.

## 2 Menü

### 2.1 Vorschlag

Die Zeile „Grafik“ bekommt einen vierten Knopf. Keine neue Zeile, keine neue Überschrift, kein neues Häkchen.

```
Grafik
[ Foto 3D ] [ Schön ] [ Mittel ] [ Einfach ]
```

- Reihenfolge wie heute von aufwendig nach einfach. Die drei alten Knöpfe behalten ihre Reihenfolge untereinander. Foto 3D steht vorn.
- `title` am neuen Knopf: „Fotomodell der Landschaft (3D-Mesh NRW). Nur echte Welt in NRW, lädt beim Fliegen 20 bis 60 MB. Sonst wie Schön.“
- HTML: ein Knopf mehr in `#gfxSeg` (`src/index.html:233-237`), Klasse `seg3` weg. `menu.js` bleibt unverändert (Verdrahtung ist allgemein, Abschnitt 0).
- CSS: eigene Regel, nicht `.seg4` (die bricht am Handy auf zwei Zeilen, `style.css:262`):
  - `#gfxSeg{grid-template-columns:repeat(4,1fr)}`
  - `#gfxSeg button b{white-space:nowrap}`
  - im Block `@media (max-width:480px)`: `#gfxSeg{gap:4px}`, `#gfxSeg button{padding:10px 2px}`, `#gfxSeg button b{font-size:14px}`

### 2.2 Breite nachgerechnet

Gesichert sind die CSS-Werte. Die Wortbreiten sind eine Schätzung (Annahme: fette Systemschrift, Zeichenbreiten wie Roboto oder Segoe UI; „Einfach“ etwa 3,3 em, „Foto 3D“ etwa 3,5 em, je nach Schrift 8 % mehr oder weniger).

| Fenster | Inhaltsbreite | Knopfbreite bei 4 Knöpfen | Platz für Text | längstes Wort | Reserve |
|---|---|---|---|---|---|
| 390 x 844, mit der Handy-Regel oben | 390 − 2·16 (`style.css:45`) − 2·28 (`style.css:178`) = 302 px | (302 − 3·4)/4 = 72,5 px | 72,5 − 2·2 = 68,5 px | „Foto 3D“ bei 14 px: etwa 49 px | etwa 19 px |
| 390 x 844, ohne Handy-Regel (Abstand 10, Rand 6, Schrift 15) | 302 px | (302 − 30)/4 = 68 px | 56 px | etwa 52 px (50 bis 56) | 0 bis 6 px: zu knapp, darum die Regel |
| ab 560 px Breite (1280 x 720, 1366 x 650, 960 x 540) | 520 − 2·28 = 464 px (vor dem Zoom) | (464 − 30)/4 = 108,5 px | 108,5 − 2·12 = 84,5 px (bei 960 x 540 Rand 8: 92,5 px) | etwa 52 px bei 15 px | über 30 px |

Vergleich (gesichert): Die Knöpfe von Videobild und Sicht sind am Rechner heute (228 − 8)/3 = 73 px breit mit 14 px Schrift (`style.css:77-80`). Vier Grafik-Knöpfe am Handy sind mit 72,5 px gleich groß. Das Muster gibt es also schon.

### 2.3 Höhe

- Die Zeile bleibt eine Zeile. Die Höhe ändert sich nicht (am Handy durch 14 statt 15 px Schrift etwa 1 px weniger).
- `fitPanel` (`menu.js:219-231`) zoomt wie bisher. Prüfung: Zoom des Reiters Allgemein vor und nach der Änderung in allen vier Größen notieren. Er muss gleich bleiben.
- Hilfe-Reiter: kein neuer Satz in G1 (spart die Messung). Wenn gewünscht, später ein Satz im Absatz „Echte Welt“.

### 2.4 Was nicht ins Menü kommt

- Kein Schalter „3D-Mesh“ im Daten-Reiter (`docs/plan-3d-mesh.md` Abschnitt 2.9 entfällt).
- Kein Regler für Mesh-Qualität, keine Wahl der Texturgröße.
- Die Anzeige „MESH-PROBE …“ oben im Bild bleibt nur mit `?mesh=1` (Diagnose).

## 3 Leistung

### 3.1 Wo die Bildrate vermutlich bleibt

Reine Dreieckszahl ist es vermutlich nicht. Schätzung: 46 Teile mal etwa 35 000 Punkte sind 0,5 Mio. Dreiecke in 46 Zeichenaufrufen (Annahme: Mittel der Punktzahlen aus der Tabelle in `docs/plan-3d-mesh.md` Abschnitt 1). Das ist für eine RTX 4080 wenig. Wahrscheinlicher, in dieser Reihenfolge (alles vermutet):

1. **Hochladen im Hauptprogramm.** Jeder fertige Knoten wird sofort hochgeladen (`render.js:1193-1211`). Eine Textur 2048 x 1024 sind 8 MB plus Mipmaps. Bis zu 6 Knoten können im selben Bild fertig werden. Das gibt Ruckler beim Laden, also gerade beim Fliegen. In Firefox ist `texImage2D` aus einem `ImageBitmap` vermutlich langsamer als in Chromium (Kopie und Umwandlung auf dem Prozessor, WebGL läuft in einem eigenen Prozess).
2. **Falsche Grafikkarte.** Der Code verlangt `high-performance` (gesichert). Ob Zen auf einem Laptop mit zwei Grafikkarten die RTX bekommt, entscheidet Windows und der Treiber (vermutet: Zen steht nicht in der Liste des NVIDIA-Treibers und läuft auf der Intel-Grafik). Dann wäre alles teuer: Anisotropie, Kantenglättung, doppeltes Rechnen.
3. **Doppeltes Rechnen.** Das Gelände wird zuerst voll gerechnet und danach vom Mesh überdeckt (gesichert, Abschnitt 0). Auf der RTX wenig, auf der Intel-Grafik viel.
4. **Kreislauf an der Speichergrenze.** 260 MB sind an der Brücke erreicht (gesichert, M0). Beim Umsehen fallen Knoten nach 8 s heraus und laden neu. Das verstärkt Punkt 1.
5. **Automatische Auflösung reagiert falsch.** Ruckler durch Hochladen senken die gemessene Bildrate. `adaptRes` macht das Bild kleiner (`render.js:690-693`), obwohl die Grafikkarte nicht der Engpass ist. Das Bild wird unscharf, ohne schneller zu werden. Im OSD sichtbar als „FPS … 50% L“.
6. **Speicher-Müll je Bild.** `i3sSelect` legt je Bild viele kleine Objekte an (`rwmesh.js:46-76`). Vermutet klein.

### 3.2 Firefox-Besonderheiten (alle vermutet, in G2 zu prüfen)

- WebGL läuft in Firefox in einem eigenen Grafikprozess. Abfragen mit Antwort (`gl.getParameter`) warten auf diesen Prozess. Der Code fragt je Knoten und je Luftbild die Anisotropie-Obergrenze ab (`render.js:1174, 1209`). Abhilfe: einmal in `initGL` merken.
- `texImage2D` mit `ImageBitmap` hat in Firefox vermutlich keinen schnellen Weg. Abhilfe: Hochladen begrenzen (3.3 Nr. 1). Möglicher Zusatz: `createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })`, damit nichts umgerechnet wird.
- Anisotropie 8 und große Texturen (4096² Luftbild, 2048 x 1024 je Knoten) sind auf der RTX unkritisch, auf der Intel-Grafik spürbar.
- `navigator.deviceMemory` gibt es in Firefox vermutlich nicht. Dann ist `LOW_MEM` dort nur am Handy wahr (Folge aus `render.js:1160`, gesichert). Für den Rechner des Nutzers ist das richtig.
- Zwei Grafikkarten: Prüfung in Zen über `about:support`, Abschnitt Grafik, Zeile zum WebGL-2-Treiber. Steht dort Intel, in den Windows-Einstellungen (Anzeige → Grafik) für Zen „Hohe Leistung“ wählen.
- `fitPanel` nutzt CSS `zoom`. Neuere Firefox-Versionen können das (vermutet ab 126). Betrifft das Menü, nicht die Bildrate; bei der Prüfung in Zen mit ansehen.

### 3.3 Hebel, nach Wirkung geordnet

| Nr. | Hebel | Wirkung (Schätzung, Annahme) | Ändert das Bild? | Aufwand |
|---|---|---|---|---|
| 1 | Hochladen begrenzen: fertige Daten in eine Warteschlange, höchstens 1 Knoten je Bild, nächster Knoten zuerst (Muster `budget` in `drawTerrain`, `render.js:1273`) | Ruckler von bis zu 6 Uploads in einem Bild auf einen je Bild. Annahme: ein Upload kostet in Firefox 5 bis 20 ms, in Chromium 2 bis 6 ms. Größter Hebel gegen Ruckeln im Flug | nein (Teile erscheinen höchstens 0,1 s später) | S |
| 2 | Reihenfolge: Mesh vor dem Gelände zeichnen. Der Tiefentest verwirft dann das verdeckte Gelände vor der Rechnung | spart einen vollen Durchgang des Welt-Shaders über fast das ganze Bild. RTX: unter 1 ms. Intel-Grafik: 5 bis 10 ms bei 2560 x 1600 | nein | S |
| 3 | Bildhöhe für die Auswahl deckeln: `f` aus höchstens 1080 Zeilen. Entspricht `q = (H/1080)²`, bei 1600 Zeilen etwa 2,2 | etwa eine halbe Detailstufe weniger nah an der Kamera: 10 bis 15 % weniger Teile, etwa 30 % weniger Nachladen im Flug. Annahme: jede Stufe trägt ähnlich viele Teile bei (`plan-3d-mesh.md`, Mengen je Flug) | leicht: auf hochauflösenden Schirmen nah etwas weicher. Am Dom aus 100 m prüfen | S |
| 4 | Mehr Vorrat am Rechner: `gpuMB` 400, `maxNodes` 240, `keep` 15 s | weniger erneutes Laden beim Umsehen. Kostet bis 140 MB mehr Grafikspeicher. Nur wenn G2 den Kreislauf zeigt | nein | S |
| 5 | Texturen verkleinern (längste Kante 1024) | Speicher und Upload je Knoten auf ein Viertel (11 MB auf 2,8 MB). Stärkster Hebel für Speicher | ja: Stufen 17 und 18 (100 bis 200 m) sichtbar weicher. Darum nur am Handy | S |
| 6 | Anisotropie-Obergrenze einmal merken; Abstand je Knoten in `i3sSelect` einmal rechnen und am Knoten ablegen | klein (unter 1 ms je Bild), in Firefox je Upload etwas mehr | nein | S |
| 7 | `q` allgemein erhöhen (1,5 oder 2) | wie Nr. 3, aber auch bei 1080p | ja | S |
| 8 | Ladeparallelität senken (`para` 4) | weniger Uploads kurz hintereinander, dafür längeres Laden. Nach Nr. 1 unnötig | nein | S |
| 9 | Texturen in Streifen über mehrere Bilder hochladen | nur falls ein einzelner Upload nach Nr. 1 noch ruckelt | nein | M |
| 10 | Laden im Hintergrund-Thread (Worker aus `plan-3d-mesh.md` 2.3) | gering: Abruf, gzip und JPEG-Entpacken laufen im Browser schon neben dem Hauptprogramm; das Hochladen muss im Hauptprogramm bleiben | nein | M bis L |

Vorschlag: Nr. 1, 2 und 6 in G2 (ändern das Bild nicht). Nr. 3 und 4 in G3 nach der Messung. Nr. 5 nur am Handy. Nr. 7 bis 10 nur, wenn die Messung es verlangt.

Hinweis zu Nr. 2: `drawMesh` wechselt das Programm und bindet Texturen auf Einheit 0. Der Aufruf muss vor `gl.bindTexture(photoTex)` und dem Zeichnen des Geländes stehen (`render.js:1308-1315`), nicht mehr am Ende (`render.js:1341`).

Hinweis zu Nr. 3 und `adaptRes`: Mit dem Deckel ändert eine kleinere Auflösung die Auswahl erst unter 1080 Zeilen. Das dämpft ein mögliches Pendeln (Auflösung hoch, mehr Teile laden, Ruckler, Auflösung runter; vermutet).

### 3.4 Was aus `docs/plan-3d-mesh.md` bleibt und was sich ändert

| Punkt im Mesh-Plan | Stand | Folge |
|---|---|---|
| M1a Kern (`rwmesh.js`, Auswahl, Freigabe, Tests) | mit M0 gebaut | erledigt. Offen daraus: Status `'dead'` für 404 (heute `'fail'`, neuer Versuch nach 30 s) |
| M1b Schalter `cfg.rwMesh` im Daten-Reiter (2.2, 2.9, Entscheidungen 1 und 2) | nicht gebaut | **entfällt**. Ersetzt durch das Preset |
| M1b Worker-Aufträge `i3sRoot`, `i3sPage`, `i3sNode` (2.3) | nicht gebaut, M0 lädt im Hauptprogramm | **zurückgestellt** (Hebel Nr. 10). Nur für M2 nötig (Raster rechnen) |
| M1b Gelände absenken mit Kennung 0,04 und `i3sCovers` (2.6) | M0 senkt das ganze Gelände, sobald Mesh-Teile zu sehen sind (`render.js:63`) | einfache Fassung bleibt. Folge: an der Landesgrenze liegt auch das Gelände außerhalb 4 m tiefer als die Physik. Hinnehmen |
| M1b Fehlerfälle (2.8) | teils (Fehlertext nur in der Probe-Anzeige) | bleibt: Meldung einmal im Bild, „nur NRW“ über `deLandAt` (Etappe G4) |
| M1b gemeinsame Shader-Stücke `RW_GLSL` (2.5) | M0 hat Kopien in `MESH_FS` (`render.js:449-456`) | bleibt als Aufräumen in G4 (S), damit Nacht und Sicht nicht auseinanderlaufen |
| M1c Feinschliff (Nacht, Handy, Zahlen) | offen | wird G3 und G4 |
| M2 Kollision aus dem Mesh | offen | unverändert geplant, aber erst nach dem Urteil des Nutzers über Foto 3D. Neu zu bedenken: Die Physik hinge dann am Grafik-Preset (siehe Entscheidung 9) |
| Dateigrenze 7,9 MB | gilt (`test/build.test.mjs:64`), Datei heute 7,83 MB | G1 bis G4 bringen wenige KB. Reicht |

## 4 Migration, Tests, Prüfung

### 4.1 Gespeicherte Einstellung

- Die alten Werte `'simple'`, `'mid'`, `'nice'` bleiben gültig und bedeuten dasselbe. Eine Umbenennung gibt es nicht. Darum ist keine echte Migration nötig.
- Neu in `state.js` (ohne DOM, Namen heute frei, geprüft mit `grep`): `export const GFX_IDS = ['mesh', 'nice', 'mid', 'simple'];` und `export function gfxLevel(g) { return g === 'simple' ? 0 : g === 'mid' ? 1 : 2; }`. `render.js:778` ruft `gfxLevel(cfg.gfx)`.
- `cfgMigrate` bekommt eine Zeile: `if (c.gfx !== undefined && !GFX_IDS.includes(c.gfx)) c.gfx = 'nice';`. Nur wenn ein Wert da ist. So bleiben die genauen Vergleiche in `test/scenario.test.mjs:176-184` grün. Die Vorgabe (Schön, am Handy Mittel) kommt weiter aus `state.js:11`.
- Vorgabe ändert sich nicht. Foto 3D ist nie voreingestellt.
- Rückweg (gesichert): Lädt der Browser einen alten Stand der Seite (Cache, siehe Übergabe „Edge und der Cache“) mit gespeichertem `'mesh'`, rechnet der alte Code Stufe 2 (Schön). Im Menü ist dann kein Knopf markiert. Kein Schaden.
- `?mesh=1` bleibt als Diagnose: erzwingt das Mesh ohne zu speichern und zeigt die Probe-Anzeige. Der Link des Nutzers geht weiter.
- Ein Ort für die Entscheidung, ohne DOM und testbar, in `rwmesh.js`: `export function i3sWanted(gfx, probe, rwOn, verbund, crs, land)` liefert `'on'` oder den Grund `'map'`, `'dis'`, `'land'`, `'off'`. `meshOn()` in `render.js` nutzt das. Die Gründe steuern die Hinweise aus 1.4.

### 4.2 Tests in Node (ohne Netz)

1. `gfxLevel`: `simple` 0, `mid` 1, `nice` 2, `mesh` 2, Unbekanntes 2.
2. `cfgMigrate`: `'mesh'`, `'nice'`, `'mid'`, `'simple'` bleiben; `'quatsch'` wird `'nice'`; ohne `gfx` bleibt das Objekt ohne `gfx` (Bestandstests unverändert).
3. Menü gegen Zustand: `src/index.html` lesen, alle `data-gfx` in `#gfxSeg` sammeln, gleich `GFX_IDS` (Reihenfolge und Menge). Fängt Tippfehler zwischen Menü und Code.
4. `i3sWanted`: Spielkarte `'map'`; DIS `'dis'`; UTM 32 außerhalb NRW `'land'`; NRW mit `gfx 'mesh'` `'on'`; NRW mit `gfx 'nice'` und ohne Probe `'off'`; mit Probe `'on'`.
5. G2: Warteschlange in `rwmesh.js` (zum Beispiel `i3sNextUpload(cam, o)`): gibt je Aufruf höchstens einen Knoten, den nächsten zuerst; verworfene Knoten (Ort gewechselt, Grafik verloren) kommen nicht.
6. G3: Grenzen nach Gerät (`i3sLimits(lowMem)`), Deckel der Bildhöhe (`i3sF(H, vf)`: 1600 Zeilen ergeben denselben Wert wie 1080), Freigabe hält sich an die neuen Grenzen (Muster aus `test/rwmesh.test.mjs`).
7. Bestand: `test/rwmesh.test.mjs`, `test/night.test.mjs`, `test/scenario.test.mjs`, `test/legacy-parity.test.mjs`, `test/build.test.mjs` unverändert grün. `npm run build` prüft Modulregeln und ASCII.

### 4.3 Prüfung im Browser

Hinweis: In dieser Planungs-Umgebung war kein Chromium zu finden. Der Umsetzer prüft zuerst, ob Headless-Chromium wie in früheren Etappen da ist.

Automatisch (Headless-Chromium, vier Größen 1280 x 720, 1366 x 650, 960 x 540, 390 x 844):
1. Einstellungen → Allgemein: `panel.scrollHeight <= panel.clientHeight`; Zoom gleich wie vor der Änderung.
2. `#gfxSeg`: alle vier Knöpfe haben dasselbe `offsetTop` (eine Zeile); kein Knopf mit `scrollWidth > clientWidth`; Text einzeilig.
3. Klick auf jeden Knopf setzt `cfg.gfx` und markiert genau einen.
4. Einfach, Mittel, Schön: Bild an fester Stelle (pausiert) vor und nach der Änderung vergleichen, Spielkarte und Monschau, Tag und Nacht. Erwartet: gleich bis auf ziehende Wolken.
5. Foto 3D: Monschau (Mesh erscheint, Häuser weg), Spielkarte (wie Schön, kein Hinweis), Ort außerhalb NRW und DIS (wie Schön, Hinweis einmal), Netz gesperrt (wie Schön, Hinweis einmal).
6. Foto 3D nachts: Laternen, Lichtflächen, Autos, Schatten liegen auf der Höhe der Physik, das Mesh weicht bis etwa 1 m ab (gesichert 06.11., `plan-3d-mesh.md` 2.5). Ansehen, ob Lichtflächen im Mesh versinken oder schweben (Entscheidung 8).

Beim Nutzer (Zen und zum Vergleich Edge oder Chrome), mit `?mesh=1` für die Anzeige:
1. `about:support` → Grafik: welche Grafikkarte nutzt WebGL 2?
2. Monschau Markt und Köln Dom (50.9413, 6.9583), je 2 Minuten fliegen. Ablesen: Bilder je Sekunde im Stand und im Flug, Teile, MB Grafik, die neue Zeile aus G2 (längstes Bild in ms, Uploads je Sekunde, Auflösung in %).
3. Dasselbe mit „Auflösung automatisch“ aus.
4. Nach G2 und G3 wiederholen. Ziel (Schätzung): im Stand wie Schön, im Flug kein Bild länger als 25 ms außer beim ersten Laden.

## 5 Etappen

Je Etappe wie immer: `npm run build`, `npm test`, Browser in vier Größen, `docs/PLAN.md`, `docs/echte-welt.md` und `docs/prompt-historie.md` ergänzen, committen, berichten, anhalten.

| Nr. | Inhalt | Dateien | Tests | Aufwand |
|---|---|---|---|---|
| **G1** Preset | `GFX_IDS`, `gfxLevel`, Zeile in `cfgMigrate`; `i3sWanted` und „nur NRW“ über `deLandAt`; `meshOn()` nutzt `cfg.gfx === 'mesh'` oder die Probe; vierter Knopf mit `title`, CSS für `#gfxSeg`; Hinweise aus 1.4 (einmal je Ort). Mesh-Grenzen wie die Probe. Einfach, Mittel, Schön unverändert | `src/state.js`, `src/rwmesh.js`, `src/render.js`, `src/index.html`, `src/style.css`, `test/scenario.test.mjs`, `test/rwmesh.test.mjs`, `test/build.test.mjs` | 4.2 Nr. 1 bis 4, 7; Browser 4.3 Nr. 1 bis 6 | S bis M |
| **G2** Messen und ruckelfrei | Probe-Anzeige erweitern (Name der Grafikkarte, längstes Bild der letzten Sekunde, Uploads je Sekunde, Auflösung); Hebel 1 (Warteschlange, 1 Upload je Bild), 2 (Mesh vor dem Gelände), 6 (Anisotropie merken, Abstand je Knoten einmal). Bild unverändert | `src/render.js`, `src/rwmesh.js`, `test/rwmesh.test.mjs` | 4.2 Nr. 5; Messung beim Nutzer | S bis M |
| **G3** Grenzen nach Messung | Hebel 3 (Deckel 1080 Zeilen) und 4 (Vorrat am Rechner), Handy-Grenzen (Texturen 1024, 80 Teile, 90 MB, `para` 4). Vorher und nachher als Bildpaar am Dom und in Monschau für den Nutzer | `src/rwmesh.js`, `src/render.js`, `test/rwmesh.test.mjs` | 4.2 Nr. 6; Nutzer vergleicht | S |
| **G4** Rest aus M1 | Fehlermeldung einmal im Bild mit Pause, 404 als `'dead'`, gemeinsame Shader-Stücke `RW_GLSL`, Nacht am Mesh nach Augenschein, Satz in der Hilfe (mit Höhenmessung), Doku | `src/render.js`, `src/rwmesh.js`, `src/main.js`, `src/index.html`, `docs/echte-welt.md` | Bestand; Browser nachts, Netz gesperrt | M |
| **M2** Kollision aus dem Mesh | wie `docs/plan-3d-mesh.md` Abschnitt 3 (M2a, M2b), mit Worker für Raster und Gitter | siehe dort | siehe dort | M + S, nur auf Wunsch |

Reihenfolge: G1 → G2 → G3 → G4, M2 offen. G1 zuerst, weil es der Wunsch des Nutzers ist und nichts Altes anfasst. G2 vor G3, weil G2 das Bild nicht ändert und die Messung liefert, die G3 braucht.

Gesamtaufwand G1 bis G4: etwa 3 Sitzungen (Schätzung). M2 dazu etwa 1,5 Sitzungen.

## 6 Offene Entscheidungen (der Umsetzer nimmt den Vorschlag)

1. **Name des Presets:** „Foto 3D“. Alternativen: „3D-Foto“, „Mesh“, „Zwilling“. Grund: kurz (passt in 68 px), sagt, was man sieht.
2. **Platz des Knopfs:** vorn, vor „Schön“ (Reihenfolge von aufwendig nach einfach bleibt). Alternative: hinten, dann stehen die drei alten Knöpfe an der gewohnten Stelle, aber die Ordnung bricht.
3. **Grundstufe von Foto 3D:** Schön (Stufe 2). Alternative: Mittel (spart Lichtkegel und 2 Wolken-Oktaven, kaum Bildrate, da das Mesh den Boden verdeckt).
4. **Ohne Mesh am Ort:** Bild wie Schön, Einstellung bleibt, Hinweis einmal je Ort in der echten Welt, auf der Spielkarte kein Hinweis. Alternative: Knopf sperren oder auf Schön umstellen (beides verwirrt im Pause-Menü).
5. **Vorgabe:** bleibt Schön (Handy Mittel). Foto 3D wählt nur der Nutzer, wegen 20 bis 60 MB je Flug.
6. **Handy:** Knopf sichtbar, mit engen Grenzen (1.3). Alternative: am Handy ausblenden (dann wieder drei Knöpfe, aber zwei Menü-Fassungen).
7. **Texturen am Rechner:** nicht verkleinern (Optik zuerst). Alternative: Kante 1024, wenn die Messung in G2 zeigt, dass ein einzelner Upload ruckelt.
8. **Nacht in Foto 3D:** Laternen, Lichtflächen und Autos bleiben an, auch wenn sie bis 1 m neben der Mesh-Fläche liegen. Erst ansehen (4.3 Nr. 6). Alternative: Lichtflächen in Foto 3D aus.
9. **M2 (Physik aus dem Mesh):** zurückstellen, bis der Nutzer Foto 3D geflogen hat. Dann neu entscheiden, weil die Physik sonst vom Grafik-Preset und vom Ladezustand abhinge (Bestzeiten nicht mehr vergleichbar). Vorschlag für den Fall „ja“: Bestzeit in Foto 3D mit M2 sperren.
10. **`?mesh=1`:** bleibt als Diagnose-Zusatz. Alternative: nach G3 entfernen.
11. **Worker für das Mesh:** nicht bauen, solange M2 nicht kommt (Hebel Nr. 10 bringt wenig).
12. **Deckel 1080 Zeilen (Hebel 3):** ja, wenn der Dom aus 100 m im Bildpaar gleich scharf wirkt. Sonst Deckel 1440.

## 7 Risiken

| Risiko | Einschätzung | Gegenmaßnahme |
|---|---|---|
| Alte Presets ändern sich doch | gering: gleiche Werte, gleiche Wege; nur `render.js:778` ruft eine Funktion mit derselben Rechnung | Test 4.2 Nr. 1, Bildvergleich 4.3 Nr. 4 |
| Vier Knöpfe am Handy zu eng | Rechnung zeigt 19 px Reserve (Wortbreite geschätzt) | Messung im Browser; Notlösung Kurzname „3D“ |
| Ursache der niedrigen Bildrate ist eine andere als vermutet | möglich, nichts gemessen | G2 misst zuerst; Hebel 1, 2, 6 schaden in keinem Fall |
| Zen läuft auf der Intel-Grafik | vermutet | Prüfung `about:support`; Anzeige der Grafikkarte in der Probe; Hinweis an den Nutzer |
| Mehr Grafikspeicher (G3) auf schwachen Rechnern | 400 MB plus Luftbilder | nur wenn nicht `LOW_MEM`; Handler für Grafikverlust ist da (`render.js:1218`) |
| Nutzer wählt Foto 3D im Mobilnetz | 20 bis 60 MB je Flug | steht im `title`; nie Vorgabe |
| Mesh und Physik passen nicht (Bäume, Brücke, bis 1 m Höhe) | bekannt aus M0 | Preset ist nur Bild; M2 bleibt möglich |
