# Plan: Texturiertes 3D-Mesh NRW in der echten Welt (09.11.2026, Fable)

Nur Planung, kein Code. Auftrag des Nutzers (Prompt 182, Option 1 aus `docs/pruefung-3d-mesh.md`): Das 3D-Mesh des Digitalen Zwillings NRW (I3S 1.7, SceneServer) im Modus „Echte Welt“ zeigen (M1) und die Physik daran anpassen (M2). Ein anderer Agent setzt um.

Vorgaben: Schalter „3D-Mesh“, nur NRW, nicht in der DIS-Übung (`cfg.verbund`), nur live laden, nichts speichern. Puffer 0 (ungepackt, per gzip übertragen), kein Draco. Wenn an: LoD2-Häuser, eigene Bäume und Luftbild im Mesh-Gebiet ausblenden (oder begründet anders). Feste Physik-Schrittweite 1/240 s, Physik ohne DOM, in Node testbar. Menüs nicht größer, ohne Scrollen bei 1280 x 720, 1366 x 650, 960 x 540, 390 x 844. Tests ohne echte Downloads (CI-Minuten sparen). Modulregeln aus `CLAUDE.md`.

Einstufung: **gesichert** = im Code gelesen (Fundstelle) oder heute am Dienst gemessen (Abrufe aus dieser Umgebung mit `Origin: https://bladeage.github.io`). **vermutet** = geschätzt oder nicht geprüft. **Schätzung** = Zahl mit genannter Annahme. Aufwand: S = unter einer Sitzung, M = eine Sitzung, L = zwei Sitzungen.

Voraussetzung: Etappe N1 (Nachtmodus, `src/daylight.js`, `uNight`) ist umgesetzt (Version 1.211). Dieser Plan baut darauf auf.

## 0 Was heute da ist (gesichert)

| Was | Fundstelle |
|---|---|
| Zustand der echten Welt `rw` (Gebiet, Kacheln, Umgebung, Ebenen `show`, Worker-Zugang `work`) | `src/realworld.js:15` |
| Ebenen-Schalter `RW_SHOW`, `rwSetShow` (Reiter „Debug“, Häkchen entstehen automatisch) | `src/realworld.js:30-35`, `src/srcui.js:210-217`, `src/index.html:108-112` |
| Gebiet übernehmen `rwApply` (zählt `rw.ver` hoch, die Grafik baut neu) | `src/realworld.js:36-53` |
| Abrufe `rwNet(signal, stall)` mit `get`, `text`; XML (`<`) gilt als Fehlermeldung; Stillstand 30 s `RW_STALL` | `src/realworld.js:132-161` |
| Kartenkoordinaten: Mitte des Gebiets = Ursprung (`rw.meta.bbox`), x nach Osten, z nach Süden, y = Höhe NHN minus `rw.meta.hHome`; Umrechnung in `rwLatLon`, Kacheln `rwLoadTile` | `src/realworld.js:774-777`, `868-870`, `realworld/monschau.json` (`bbox`, `hHome` 510,16) |
| Bodenhöhe `groundH` = gezeichnete Fläche (Dreiecke des Netzes), `groundN`; Physik, Kamera, Bäume, Vögel nutzen sie | `src/realworld.js:387-415`, `src/physics.js:211, 391, 402`, `src/render.js:678, 686` |
| Geländenetze `rwMesh` (fein, Ecken Alpha 0 = Boden), `rwFarMesh` (Umgebung) | `src/realworld.js:424-464` |
| Kollision: Dreiecke je 9 Werte in `rw.tris`, Raster 8 m `rwSetTris`, Suche `rwNear`; Bäume als Quader | `src/realworld.js:466-500` |
| Physik: `STEP = 1/240`, Boden je Hitbox-Kugel (385-400), Wasser (402), dann `rwCollide(prev, h)` (Durchtunneln per Strecke, dann nächster Punkt je Dreieck, Stoß `impact`) | `src/physics.js:95, 189, 406, 581-626, 630` |
| Platzierungsdienst `placeReal().free` prüft `rw.tris` und Quader | `src/realworld.js:599-609` |
| Nachladen beim Fliegen: `RW_STREAM`, `rwStreamStep` jede Sekunde aus `main.js` | `src/realworld.js:851, 907`, `src/main.js:75-84` |
| Hintergrund-Thread: Aufträge `area`, `far`, `modelMesh` in `wkRun`; Module des Workers `WK_MODS`; Worker aus dem eigenen Bundle | `src/rwworker.js:21-32`, `src/rwthread.js:10-18` |
| Grafik: ein Welt-Shader `P` (VS `uModel`, `uTime`, `uGfx`; FS mit `uPhoto`, `uFogD`, `uFog`, `uVision`, `uHeat`, `uNight`), `vis()`, `rwHaze`, `rwPale`, Lichtpfade Einfach und Mittel/Schön mit ACES | `src/render.js:43-64, 110-333` (Zeilen nach N1 leicht verschoben) |
| `program(vs, fs, names)`, `upload(data)`, `freeGl`, Grafikverlust-Handler | `src/render.js:441-462, 1040, 36-41` |
| Luftbild-Texturen: `createImageBitmap`, Verkleinern, Mipmaps, Anisotropie; Speichergrenzen `LOW_MEM`, `RW_TEX` | `src/render.js:1017-1039` |
| `drawTerrain()`: Netze je Version, ein großer Aufbau je Bild (`budget`), Kacheln, Umgebung tauscht, Wasser, Gebäude, Kartenlinien | `src/render.js:1043-1140` |
| Kamera: `mPersp(vf, asp, near, far)`, `vf` senkrechtes Blickfeld, `glc.height` echte Bildhöhe (mit `frameStat.scale`) | `src/render.js:659-663, 641` |
| Tageszeit N1: `dayState(cfg.night, sunDir())` liefert `light`, `fog`, `zen`, `night` | `src/daylight.js`, `src/render.js` in `render()` |
| Quellen: `RW_SOURCES[0]` NRW mit `dgm`, `dom`, `dop`, `lod2`, `dlm`, `attribution` | `src/rwload.js:9-18` |
| Einstellungen `cfg` (`rwStream`, `rwShow`, `verbund`, `night`), `saveCfg` | `src/state.js:10-20, 120` |
| Menü: Optionen der echten Welt mit Reitern Daten, Quellen, Debug; Zeile „Beim Fliegen nachladen“ `#geoStream` (`label.row.geotoggle`); Hinweis `#rwMsg` auf Schritt 1 | `src/index.html:90-114, 60`, `src/style.css:251-252`, `src/menu.js:141-145` |
| `fitPanel` zoomt 0,72 bis 1,15; verfügbare Höhe 960 x 540 etwa 452 px | `src/menu.js:204-216`, `docs/plan-menue.md:10` |
| Dateigröße: Test verlangt unter 7,8 MB; heute 7,755 MB | `test/build.test.mjs:64`, `dist/fpvsim.html` |
| Worker-Test führt den Worker-Quelltext aus dem Bundle in `vm` aus, Abrufe aus Testdaten | `test/rwworker.test.mjs` |
| Deutschlandkarte: `deLandAt(E, N)` liefert das Land | `src/demap.js:23` |
| Altes Werkzeug `tools/mesh.mjs` (SLPK per Teilabruf, Index `realworld/monschau-mesh.*`, nicht eingebettet). Alter Shader-Zweig aus Commit `6cb5f07` (`MESH_VS`, `MESH_FS`, `uploadMesh`) als Vorlage lesbar mit `git show 6cb5f07 -- src/render.js` | `tools/mesh.mjs:60-105`, `docs/echte-welt.md` Stand M1 |

## 1 Dienst heute gemessen (gesichert, 09.11.2026)

Adresse `https://www.gis.nrw.de/geobasis/3D_mesh/SceneServer/layers/0` (Ebene 0 „Mesh“, IntegratedMesh, I3S 1.7, `store.version` 1.7).

- `spatialReference` wkid 25832, vcsWkid 7837 (DHHN2016, also NHN wie unser DGM). `heightModel` gravity_related_height, Meter.
- `nodePages`: 64 Knoten je Seite, `rootIndex` 0, `lodSelectionMetricType` `maxScreenThresholdSQ`. Adresse `nodepages/<Seite>`, Seite = floor(Knotennummer/64). Antwort JSON, `Content-Encoding: gzip`, `Access-Control-Allow-Origin: *`, etwa 7 bis 8 KB gepackt, hier 1,2 s je Abruf (vermutet aus Deutschland 0,1 bis 0,3 s).
- Seite 0 enthält nur die Wurzel: `obb.center` (406006, 5699009, 276), `halfSize` (126036, 123019, 820), 108 Kinder, kein `lodThreshold`, kein `mesh`. Die 108 Kinder (Stufe 1, je etwa 25 x 25 km, `lodThreshold` 0, kein Mesh, 2 bis 4 Kinder) liegen auf 108 verschiedenen Seiten. Das legacy-Dokument `nodes/root` gibt es nicht (404).
- Knotennummern laufen innerhalb eines Teilbaums rückwärts (Kinder vor Eltern). Die Stufen 2 bis 13 eines Pfads liegen in 2 bis 3 Seiten, jede tiefere Stufe meist in einer eigenen. Ein ganzer Pfad bis zum Blatt braucht etwa 10 Seiten; das Suchen des richtigen Wurzelkinds braucht bis zu 108.
- Je Knoten: `obb` (center, halfSize, quaternion), `lodThreshold`, `children`, `mesh.geometry` (`resource`, `vertexCount`, `featureCount`), `mesh.material` (`resource`, `texelCountHint`). Die Ressourcen-Nummer ist nicht die Knotennummer (Beispiel: Knoten 20346290 hat Ressource 20346289). Adressen `nodes/<resource>/geometries/0` und `nodes/<resource>/textures/0`.
- Geometrie: `Content-Type: application/octet-stream`, `Content-Encoding: gzip`. Der Browser entpackt das in `fetch` selbst; `arrayBuffer()` liefert schon den ungepackten Puffer. Aufbau laut `defaultGeometrySchema`: Kopf 2 x UInt32 (`vertexCount`, `featureCount`), dann alle Positionen (Float32 x 3), dann alle Texturkoordinaten (Float32 x 2), dann je Feature id (UInt64) und faceRange (2 x UInt32); gemessen `featureCount` 0 und Länge = 8 + 20 x vertexCount (+16 Byte Rest). Puffer 1 ist Draco (nicht nutzen).
- Positionen relativ zu `obb.center` in Landesachsen (Ost, Nord, Höhe), ohne Drehung der Box (gesichert am 06.11., `tools/mesh.mjs:91`; heute bestätigt: Spannweite der Positionen = halfSize bei ungedrehten Knoten). UV im Bereich 0 bis 1.
- OBBs sind teils gedreht (Quaternion vertauscht Achsen, etwa [0,5, 0,5, -0,5, 0,5]). Die Hüllkugel mit Radius |halfSize| ist drehungsfrei und reicht für Sichtprüfung und Detailwahl.
- Texturen: genau eine je Knoten (`textureSetDefinitions` eine Form `jpg`, `materialDefinitions` eine Definition, `doubleSided` true). `Content-Type: image/jpeg`, ohne gzip. Größe passt zu `texelCountHint` (65 536 = 256², 1 048 576 = 1024², 2 097 152 = 2048 x 1024). Kein `Cache-Control`, aber `ETag` und `Last-Modified`.
- Pfad zum Kölner Dom (E 356900, N 5645600), Stufe: Kantenlänge, Punkte, `lodThreshold`, Texel:

| Stufe | Kante etwa | Punkte | lodThreshold | Texel | Dateien (gzip, JPEG) |
|---|---|---|---|---|---|
| 2 | 10,8 x 22,6 km | 4 392 | 5,5 | 65 536 | 30 KB, 10 KB |
| 6 | 10,7 x 9,8 km | 2 439 | 315 | 65 536 | |
| 10 | 3,2 km | 8 883 | 7 410 | 65 536 | |
| 13 | 1,8 x 2,0 km | 23 514 | 173 152 | 262 144 | |
| 15 | 0,93 km | 33 774 | 618 793 | 1 048 576 | (06.11.: 470 KB, 406 KB) |
| 16 | 0,48 km | 43 728 | 619 602 | 1 048 576 | (06.11.: 603 KB, 420 KB) |
| 17 | 0,26 km | 20 598 | 756 838 | 2 097 152 | |
| 18 | 0,11 km | 70 086 | 601 048 | 2 097 152 | |
| 19 (Blatt) | 28 x 52 m | 26 364 | 505 274 | 1 048 576 | 177 KB, 121 KB (1024²) |

- `lodThreshold` wächst bis Stufe 13 um Faktor 4 je Stufe, danach bleibt er bei 500 000 bis 760 000 (etwa 0,6 x Texel, vermutet: Ziel ein Texel je Bildpunkt).
- Blatt am Dom: Höhen 43,8 bis 63,3 m NHN auf 27 x 52 m (Boden etwa 53 m); passt zum DGM.
- Protokoll HTTP/1.1 (über den Proxy dieser Umgebung gemessen; vermutet direkt auch 1.1, Apache). Browser erlauben 6 gleichzeitige Verbindungen je Host (Browser-Regel, nicht gemessen).

### Bedeutung von `maxScreenThresholdSQ` (vermutet, aus der I3S-Beschreibung und loaders.gl)

Maß je Knoten = Fläche der Hüllkugel auf dem Bildschirm in Pixel²: Durchmesser in Pixeln `2·r·f/d`, Fläche `π/4·Durchmesser²`, mit `f = H/(2·tan(vf/2))` (Bildhöhe H in Pixeln, senkrechtes Blickfeld `vf` wie in `render()`), `d` = Abstand Kamera zur Mitte. Ist das Maß größer als `lodThreshold`, zeigt man die Kinder statt des Knotens. Folgerung mit den gemessenen Werten bei 1080p und `vf` 90° (f = 540): Blatt (r 31 m) nur bis etwa 40 m Abstand, Stufe 18 (r 81) bis 100 m, Stufe 17 bis 200 m, Stufe 16 bis 400 m, Stufe 15 bis 800 m, Stufe 14 bis 1,6 km, Stufe 13 bis 3 km, Stufe 12 bis 6 km, Stufe 11 bis 13 km. Ein Faktor `q` auf die Schwelle (1 = wie Esri, größer = gröber) ist der einzige Qualitätsregler. Prüfung im Browser: mit `q = 1` muss der Dom aus 100 m scharf sein; sonst Formel oder `q` anpassen.

### Mengen je Flug (Schätzung aus der Tabelle, Sicht 9 km)

Etwa 90 bis 120 Knoten mit Mesh zugleich (30 grobe ab Stufe 11, 30 bei 13/14, 12 bei 15/16, je 6 bei 17, 18, 19), zusammen 0,7 bis 1,0 Mio. Dreiecke. Erstes Laden 20 bis 60 MB. Beim Flug mit 28 m/s im Ort 0,3 bis 1 MB/s (Blatt 300 KB je 28 m). Grafikspeicher ohne Begrenzung bis 320 MB (Texturen 2048 x 1024 RGBA mit Mipmaps 11 MB), darum Budget und Verkleinern (Abschnitt 2.7).

## 2 Architektur M1: Darstellung

### 2.1 Neues Modul `src/rwmesh.js` (ohne DOM, läuft im Hauptprogramm und im Worker)

Name der Datei `rwmesh.js` (frei; `rwMesh` ist eine Funktion in `realworld.js`, darum Vorsilbe `i3s` für alle Namen, heute nirgends benutzt, geprüft mit `grep -rn i3s src/`). Importiert nur `math.js` (kein Kreis: `realworld.js`, `render.js`, `rwworker.js` importieren `rwmesh.js`). In `WK_MODS` (`src/rwthread.js:10`) einhängen.

Exporte (Vorschlag):

- `I3S = { pageN: 64, q: 1, qLow: 2.5, maxNodes: 160, maxNodesLow: 80, gpuMB: 220, gpuMBLow: 90, texMax: 2048, texMaxLow: 1024, para: 4, stall: 15000, retry: 60000, keep: 8000, physR: 60, physLevel: 16, nearR: 200 }` (alle Zahlen Schätzung, Annahmen: Chromium auf einem mittleren Laptop, 1080p; Handy wie `LOW_MEM`).
- `i3s` Zustand: `{ src: null, on: false, origin: null, l1: null, nodes: Map(idx -> Knoten), pages: Set, root: null, jobs: Map, drawn: [], phys: [], gpu: 0, err: '', failT: 0, coverVer: 0, stats: { nodes, mb } }`.
- Knoten: `{ idx, lvl, c: [E, N, h], r, lod, ch: [idx], res, texRes, vc, texel, st: 'page' | 'load' | 'ready' | 'fail' | 'dead', t: Zeit des letzten Zeichnens, buf: ArrayBuffer | null, img: ImageBitmap | Uint8Array | null, gl: null (setzt render.js), grid, raster (M2), off: [x, y, z] (Mitte in Kartenkoordinaten, aus `origin`) }`.
- `i3sSetSource(src, origin)`: `src = RW_SOURCES[0].mesh` (Abschnitt 2.2), `origin = { ec, nc, hHome }` aus `rw.meta`; rechnet `off` aller Knoten neu (Gebietswechsel ohne Neuladen). `off = [c[0] - ec, c[2] - hHome, -(c[1] - nc)]`.
- `i3sPageUrl(src, page)`, `i3sGeoUrl(src, res)`, `i3sTexUrl(src, res)`.
- `i3sParsePage(json, lvlOf)`: Knoten aus einer Seite anlegen (`r = hypot(halfSize)`, `lvl` = Stufe des Elternteils + 1, Kinder vermerken).
- `i3sParseGeometry(bytes)`: prüft Kopf (`vc`, `fc`, Länge ≥ 8 + 20·vc), liefert `{ vc, posOff: 8, uvOff: 8 + 12·vc, buf }`. Kein Umkopieren: der Puffer geht so auf die Grafikkarte, Positionen und UV als zwei Attribute mit Versatz.
- `i3sUnzip(bytes)`: wenn die ersten Bytes 1f 8b sind (Server ohne `Content-Encoding`, lokale Tests), über `DecompressionStream('gzip')` entpacken (global im Browser und in Node 22, geprüft: `typeof DecompressionStream === 'function'`). Sonst unverändert zurück. Im Normalfall entpackt `fetch` schon.
- `i3sFrustum(vp)`: sechs Ebenen aus der VP-Matrix (Zeile 3 ± Zeile 0, 1, 2), normiert. `i3sVisible(node, planes)`: Kugel gegen Ebenen.
- `i3sMetric(node, cam, f)`: `π/4·(2·r·f/max(d - r, 1))²`.
- `i3sSelect(cam, f, vp, dronePos, q)`: Durchlauf von der Wurzel (Abschnitt 2.4). Liefert `{ draw: [Knoten], want: [{ node, prio }], pages: [Seite] }`.
- `i3sEvict(now)`: Knoten frei geben (Abschnitt 2.7); liefert die Liste, `render.js` löscht VAO und Textur.
- `i3sCovers(E, N)`: liegt der Punkt in der EN-Box eines Wurzelkinds (Stufe 1)? Für die Absenkung des Geländes (2.6) und den Hinweis „nur NRW“.
- `i3sStep(...)` im Hauptprogramm (siehe 2.5) und Worker-Aufträge (siehe 2.3).
- M2: `i3sGrid`, `i3sRaster`, `i3sGroundH`, `i3sTrisNear` (Abschnitt 3).

### 2.2 Quelle und Schalter

- `RW_SOURCES[0]` (NRW) bekommt `mesh: { url: 'https://www.gis.nrw.de/geobasis/3D_mesh/SceneServer/layers/0', attribution: 'Geobasis NRW 3D-Mesh, Datenlizenz Deutschland – Zero 2.0' }` (`src/rwload.js:9-18`). Andere Länder könnten später ein Feld „3D-Mesh (I3S)“ im Quellen-Formular bekommen; nicht Teil dieses Plans.
- `cfg.rwMesh` (false/true, Vorgabe false, `src/state.js:16`), gespeichert mit `saveCfg`. Vorgabe aus, weil 20 bis 60 MB je Flug anfallen (Schätzung) und der Modus neu ist; nach dem Test des Nutzers kann die Vorgabe auf an.
- Aktiv (`i3sActive()` in `realworld.js`): `cfg.rwMesh && rw.on && rw.ready && !cfg.verbund && rw.meta.crs === 'EPSG:25832' && i3s.src`. `i3s.src` setzt `rwApply` aus der Quelle der Hauptfläche: eingebettetes Monschau ist NRW (`rw.meta.name === 'monschau'`, Monschau liegt im Dienst, gesichert durch `tools/mesh.mjs` am 06.11.); live geladene Orte, wenn `rw.liveSrcs` die NRW-Vorlage enthält oder `deLandAt` an der Mitte „Nordrhein-Westfalen“ liefert. Außerhalb: `i3s.src = null`, Hinweis.
- DIS-Übung: Schalter bleibt stehen, wirkt nicht (Inhalt kommt vom Partner; Regel aus `docs/dis-abschluss.md`).

### 2.3 Datenfluss und Worker

Alles Netz läuft im Hintergrund-Thread (`src/rwworker.js`, `wkRun`), mit Rückfall ins Hauptprogramm wie bei `area` (`rw.work` fehlt oder `e.noWorker`). Drei neue Aufträge:

1. `i3sRoot` `{ src }`: Seite 0 laden, dann die Seiten der 108 Wurzelkinder mit `I3S.para` (4) gleichzeitigen Abrufen über `rwNet(signal, I3S.stall).get`. Zurück: `l1 = [{ idx, box: [e0, n0, e1, n1], ch }]` (EN-Box aus den acht Ecken der gedrehten OBB) und die Seiteninhalte der Kinder. Dauer hier etwa 108/4 x 1,2 s = 32 s (gesichert je Abruf, Rechnung Schätzung); aus Deutschland vermutet 3 bis 8 s. Läuft einmal je Sitzung, Ergebnis bleibt im Arbeitsspeicher (`i3s.l1`), gilt für jeden Ort. Alternative (Entscheidung 3): die 108 Boxen als kleine Datei (2 KB) im Repo und Build einbetten; dann sofort da, aber ein Stand, der mit `layer.version` veraltet.
2. `i3sPage` `{ src, page }`: eine Seite als JSON (klein, kein Transfer nötig).
3. `i3sNode` `{ src, geoUrl, texUrl, texMax, lvl }`: Geometrie und Textur parallel laden. Geometrie: `i3sUnzip`, `i3sParseGeometry`, ab `I3S.physLevel` zusätzlich `i3sGrid` und `i3sRaster` (M2). Textur: `createImageBitmap(new Blob([jpg]), { resizeWidth, resizeHeight })` im Worker (ImageBitmap ist übertragbar; gesichert Browser-Standard, vermutet in Chromium und Firefox im Worker verfügbar). Fehlt `createImageBitmap` im Worker, gehen die JPEG-Bytes zurück und das Hauptprogramm entschlüsselt wie `loadPhoto`. Rückgabe mit `wkTransfer(buf, img, grid, raster)`.

Hauptprogramm (`realworld.js`, neue Funktion `rwMeshStep(cam, f, vp, dronePos)` aus `render.js` je Bild aufgerufen, nach `drawTerrain` Aufbau):

- Wenn `i3sActive()` und `!i3s.l1` und kein Auftrag läuft: `i3sRoot` starten (Fehler: `i3s.err`, 60 s Pause `I3S.retry`, Meldung einmal wie `tileErrShown` in `main.js`).
- `i3sSelect` liefert `want` (nach `prio` sortiert: zuerst Knoten im Umkreis `I3S.nearR` der Drohne mit der feinsten nötigen Stufe, dann nach Bildschirmmaß absteigend) und `pages`. Höchstens `I3S.para` Aufträge gleichzeitig (`i3s.jobs`), je Auftrag ein `AbortController`; Gebietswechsel außerhalb NRW oder Schalter aus bricht alle ab (`i3sClear()`).
- Fehler je Knoten: `st = 'fail'`, `t` = jetzt, erneut nach 60 s; 404: `'dead'` (Eltern bleiben gezeichnet).
- `rw.ver` geändert (neuer Ort): `i3sSetSource` mit neuem Ursprung, Knoten bleiben (gleiche Landesdaten). Keine Speicherung in IndexedDB, kein Export (Vorgabe „nichts speichern“). Der HTTP-Cache des Browsers darf wirken (ETag vorhanden).

### 2.4 Auswahl der Detailstufe (`i3sSelect`, je Bild, Hauptprogramm)

Node-Switching wie `lodModel` sagt: Ein Knoten wird entweder selbst gezeichnet oder vollständig durch seine Kinder ersetzt.

```
besuche(K):
  wenn K nicht sichtbar (Kugel außerhalb der sechs Ebenen) und Abstand zur Drohne > nearR: zurück
  m = i3sMetric(K, cam, f)
  teilen = K.lod === 0 oder (m > K.lod*q und K.ch.length > 0)
  wenn teilen:
    Kinder, deren Seite fehlt: Seite anfordern
    wenn alle Kinder bekannt und alle mit Mesh 'ready': für jedes Kind besuche(Kind); zurück
    sonst: fehlende Kinder anfordern (prio = m, nahe der Drohne +1e9); K zeichnen, wenn K 'ready'
  sonst:
    K 'ready': zeichnen; sonst anfordern und nichts zeichnen (das Elternteil zeichnet, siehe oben)
```

- Kinder außerhalb des Sichtkegels zählen als „ready“ für die Vollständigkeit, wenn sie nicht geladen sind (sonst lädt man Rückseiten). Laden im Umkreis `nearR` der Drohne auch ohne Sicht (Drohne dreht schnell, Verfolgerkamera).
- `f` aus `glc.height` und `vf` in `render()`: sinkt die Auflösung (`adaptRes`), sinkt `f`, es werden weniger feine Knoten gebraucht. Das regelt sich selbst.
- `q = LOW_MEM ? I3S.qLow : I3S.q` (`render.js` kennt `LOW_MEM`, gibt es durch).
- Kosten je Bild: einige hundert Knoten besuchen, unter 0,5 ms (Schätzung).
- Zeichenliste nach Abstand sortieren (nah zuerst, früher Tiefentest).

### 2.5 Darstellung in `render.js`

- Eigenes Programm `PM` (wie im alten M1, `git show 6cb5f07 -- src/render.js`), Uniforms `uVP`, `uOff`, `uCam`, `uFog`, `uFogD`, `uVision`, `uNight`, `uGfx`, `uSun`, `uTex`. Attribute 0 Position (Float32 x 3, Versatz 8), 1 UV (Float32 x 2, Versatz 8 + 12·vc) im selben Puffer (`gl.bufferData(gl.ARRAY_BUFFER, buf)`).
- Vertex-Shader: `vec3 w = vec3(aPos.x, aPos.z, -aPos.y) + uOff;` (Ost, Höhe, minus Nord), `vW = w`, `gl_Position = uVP*vec4(w, 1.0)`. Kein Umrechnen im Worker, keine Kopie; Float32 relativ zur Knotenmitte reicht (höchstens 12 km).
- Fragment-Shader: `c = texture(uTex, vUV).rgb` (Licht und Schatten stecken im Bild). Damit der Übergang zum Luftbild-Gelände nahtlos ist, dieselbe Rechnung wie ein Bodenpixel mit Normale nach oben im Welt-Shader: Pfad Einfach `c*(amb + sun.y*vec3(1.0,0.96,0.88)*0.72)`, Pfad Mittel/Schön `pow(c, 2.2)*(skyAmb + max(uSun.y, 0)*vec3(1.0,0.88,0.70)*1.5)`, dann `rwPale`, Nebel `1 - exp(-pow(d*uFogD, 1.6))` plus `rwHaze`, ACES, Gamma. Diese GLSL-Stücke (`rwHaze`, `rwPale`, `vis`, Nachtfaktoren) als JS-Konstante `RW_GLSL` einmal definieren und in `FS` und `MESH_FS` einsetzen, damit nichts auseinanderläuft.
- Nacht (`uNight`, N1): dieselben Faktoren wie im Welt-Shader (Streulicht `amb *= vec3(0.06, 0.08, 0.12)`, gerichtetes Licht `vec3(0.25, 0.30, 0.45)*0.25`, Dunst halb). Keine beleuchteten Fenster (das Mesh kennt keine Fassaden); Lichtkennung 0,75 gibt es hier nicht. Bekannte Lücke, später möglich: helle Punkte aus der Texturhelligkeit (nicht geplant).
- Nachtsicht und Wärme: `vis(col)` mit `uHeat = 0`, `gEmit = 0` (gleiche Funktion aus `RW_GLSL`).
- Zeichnen in `drawTerrain()` nach Gelände und Umgebung, vor Kartenlinien: `gl.useProgram(PM.p)`, Uniforms setzen, je Knoten `uOff`, Textur binden, `gl.drawArrays(TRIANGLES, 0, vc)`, danach `gl.useProgram(P.p)`. Etwa 100 Zeichenaufrufe.
- Hochladen beim ersten Zeichnen: `node.gl = { vao, buf, tex }` wie `uploadMesh` im alten M1; Textur aus dem ImageBitmap mit Mipmaps, `CLAMP_TO_EDGE`, Anisotropie 8 (wie `loadPhoto`). Danach `node.img.close()`; `node.buf` nur behalten, wenn `lvl >= I3S.physLevel` (M2 braucht ihn), sonst `null`.
- UV-Richtung: wie geliefert, ohne Spiegelung (vermutet aus M1 am 06.11., Bild stimmte; im Browser prüfen, sonst `v = 1 - v` im Vertex-Shader).
- Ausblenden wenn aktiv: `rwModelGl` und `g.model` der Kacheln nicht zeichnen (Häuser, Bäume), `waterGl` und `g.water` nicht zeichnen. Kartenlinien bleiben (Schalter des Nutzers).
- Luftbild-Gelände bleibt (begründet anders als die Vorgabe): Es ist schon geladen, deckt Löcher während des Ladens, die Umgebung bis 15 km und alles außerhalb NRW. Damit es nicht mit dem Mesh flimmert (beide Flächen liegen bis etwa 1 m auseinander, gesichert 06.11.: 1 % der Mesh-Ecken tiefer als 0,9 m unter dem Gelände), wird es abgesenkt (2.6). Alternative Polygon-Offset wurde verworfen: Bei 5 m Abstand bräuchte man etwa 70 000 Einheiten (Rechnung aus Tiefenauflösung 24 Bit, nahe Ebene 0,1 m), dann sähe man an der Landesgrenze Mesh durch belgische Hügel.
- Grafikverlust (`webglcontextrestored`, `render.js:37-41`): `i3sGlReset()` setzt `node.gl = null`; Knoten mit `buf` und `img` bleiben `'ready'`, andere fallen auf `'page'` zurück und laden erneut.

### 2.6 Gelände unter dem Mesh

- Vertex-Shader `VS` bekommt `uniform float uSink` (0 oder 4 m, Schätzung wie M1 am 06.11.; tiefer als der größte gemessene Versatz, flacher als eine glaubhafte Böschung). Ecken der Geländenetze tragen eine Kennung im Alpha: 0,04 = „im Mesh-Gebiet“, 0 = außerhalb. Beide sind Boden (`vCol.a < 0.125`), 0,04 liegt unter den Kronen 0,07 bis 0,1 (`render.js:54`). Im VS: `if (uSink > 0.0 && aCol.a > 0.03 && aCol.a < 0.06) w.y -= uSink;`.
- `rwMesh` und `rwFarMesh` (`realworld.js:424, 447`) setzen das Alpha je Ecke mit `i3sCovers(E, N)` (E = ec + x, N = nc - z). Ist `i3s.l1` beim Aufbau noch leer, bleibt Alpha 0; kommt `l1` später, zählt `i3s.coverVer` hoch, `render.js` baut Gelände und Umgebung einmal neu (wie `mainDirty`, `farDirty`; je 70 bis 180 ms, gesichert aus `docs/echte-welt.md` L5b).
- `uSink` = 4 nur wenn `i3sActive()`, sonst 0. Umschalten im Flug braucht keinen Neuaufbau.
- Sichtbare Folge: Am Rand des Dienstgebiets (Landesgrenze, zum Beispiel westlich von Monschau) liegt das Gelände außerhalb 4 m höher als das Mesh innen; eine Stufe von 4 m an der Grenze. Beim Laden sieht man kurz die Front, an der das Mesh endet. Beides hinnehmen (Entscheidung 6).
- Die Physik bleibt bei `groundH` (nicht abgesenkt). Kamera, Pilot, Vögel stehen in M1 also 0 bis 1 m neben der Mesh-Oberfläche; M2 behebt das.

### 2.7 Speicherbudget und Freigabe

- Je Knoten geschätzt `vc·20 + texW·texH·4·1,33` Byte Grafikspeicher. Summe in `i3s.gpu`. Grenze `I3S.gpuMB` (220 MB, `LOW_MEM` 90 MB) und `maxNodes` (160, `LOW_MEM` 80). Texturen über `texMax` werden im Worker verkleinert (2048, `LOW_MEM` 1024).
- `i3sEvict(now)`: Knoten, die länger als `I3S.keep` (8 s) nicht gezeichnet wurden und nicht in `i3s.phys` sind, zuerst die größten Stufen (Blätter); so lange, bis Budget und Zahl stimmen. Knoten in `i3s.drawn` nie frei geben. Freigabe im Hauptprogramm: `gl.deleteVertexArray`, `gl.deleteBuffer`, `gl.deleteTexture`, `node.gl = null`, `buf`/`img` null, `st = 'page'`.
- Arbeitsspeicher: `buf` bleibt nur bei Stufe ≥ 16 im Umkreis für M2 (Blatt 530 KB, 50 Blätter 26 MB; Schätzung).
- Abrufe: höchstens `para` gleichzeitig; ein Abruf mit Stillstand 15 s bricht ab (`rwNet(signal, I3S.stall)`).

### 2.8 Fehlerfälle

| Fall | Erkennung | Verhalten |
|---|---|---|
| Dienst nicht erreichbar, offline, gesperrt | `rwNet` wirft „Keine Verbindung zu www.gis.nrw.de“ | Meldung einmal im Bild („3D-Mesh: … Neuer Versuch in 60 s“, wie `tileErrShown`), Pause 60 s, Bild wie ohne Mesh (Gelände mit Luftbild, Häuser und Bäume wieder sichtbar, solange `i3s.l1` fehlt) |
| Ort außerhalb NRW (anderes Land, Höhendienst, ebene Fläche) | `i3s.src === null` oder `!i3sCovers(ec, nc)` | Schalter im Menü mit Hinweis „nur NRW“ gesperrt (Daten-Reiter), Häuser und Bäume bleiben |
| Teil des Gebiets außerhalb NRW (Grenze) | Knoten fehlen dort | Gelände ohne Absenkung zeigt das Luftbild; Stufe 4 m an der Grenze (2.6) |
| Knoten 404, kaputte Datei (Länge passt nicht zum Kopf) | `rwNet` 404, `i3sParseGeometry` wirft | Knoten `'dead'`, Elternteil bleibt gezeichnet, keine Meldung |
| Einzelner Abruf hängt | Stillstand 15 s | `'fail'`, erneut nach 60 s |
| Grafikspeicher voll (Kontextverlust) | vorhandener Handler | `i3sGlReset`, Neuaufbau; dazu `gpuMB` senken, wenn es zweimal vorkommt (optional, S) |
| DIS-Übung | `cfg.verbund` | Schalter wirkt nicht, Hinweis im `title` |
| Schalter aus im Flug | `cfg.rwMesh` false | `i3sClear()`: Aufträge abbrechen, Grafik frei geben, Häuser und Bäume sofort zurück, `uSink` 0 |

### 2.9 Menü

Grundsatz: keine neue Seite, keine Zeile mehr, alle vier Größen wie heute.

- Schalter in Echte Welt → Optionen → Daten, in der vorhandenen Zeile von „Beim Fliegen nachladen“ (`src/index.html:94`). Die Zeile wird ein Raster mit zwei Schaltern (`.geotoggle2{display:grid;grid-template-columns:1fr 1fr;gap:10px}`): links „Nachladen beim Fliegen“ (`#geoStream`, Langtext in `title`), rechts „3D-Mesh (NRW, live)“ (`#geoMesh`, `title`: „Texturiertes 3D-Mesh des Digitalen Zwillings NRW, 20 bis 60 MB je Flug, nicht gespeichert, nicht in der DIS-Übung“). Höhe unverändert (eine Zeile, 13 px Schrift wie heute, `style.css:251`). Bei 390 px Breite stehen zwei Beschriftungen von je etwa 140 px nebeneinander (vermutet passt; im Browser prüfen, sonst zweizeilig nur dort). Verdrahtung in `srcInit` (`src/srcui.js:218-219`) wie `geoStream`: `cfg.rwMesh`, `saveCfg`, danach `rwMeshToggle()` in `realworld.js` (`i3sClear` bei aus).
- Gesperrt mit Grund: `#geoMesh.disabled = !i3sPossible()` (Quelle ohne `mesh` oder Ort außerhalb NRW), `title` „3D-Mesh gibt es nur für Nordrhein-Westfalen“.
- Hinweis auf Schritt 1 (`#rwMsg`, `src/menu.js:141-145`): bei aktivem Mesh hinten „ 3D-Mesh an.“ anhängen (kurz, damit die Zeile nicht umbricht; bei 960 x 540 prüfen). Während des Flugs einmal `say('3D-Mesh: lädt …')` beim ersten Knoten und `say('3D-Mesh bereit: n Knoten')`, wenn die Auswahl zum ersten Mal nur fertige Knoten zeichnet.
- Hilfe (Einstellungen → Hilfe, Absatz „Echte Welt“, `src/index.html:285`): ein Satz „In NRW zeigt Optionen → Daten → 3D-Mesh die Stadt wie im Digitalen Zwilling (nur online).“ (+18 px, Hilfe hat heute Reserve; messen.)
- Debug-Reiter unverändert (keine neue Zeile). Reiter Daten zeigt unter `geoStats` keine Zeile für das Mesh (nichts gespeichert).

### 2.10 Leistungsziel und Prüfung im Browser

- Ziel Chromium, mittlerer Laptop, 1080p, Grafik „Mittel“: 60 Bilder je Sekunde mit bis zu 1 Mio. Dreiecken und 150 Zeichenaufrufen (Schätzung; das Luftbild-Gelände hat heute etwa 130 000 Dreiecke plus Gebäude). Fällt die Bildrate, senkt `adaptRes` die Auflösung, und mit ihr sinkt `f`, also die Zahl feiner Knoten. Handy (`LOW_MEM`): `q` 2,5, Texturen 1024, höchstens 80 Knoten.
- Prüfliste (Headless-Chromium wie bisher, dann Nutzer):
  1. Monschau eingebaut, Schalter an: Mesh erscheint grob nach wenigen Sekunden, fein bis 100 m; Rur ohne eigenes Wasser; keine LoD2-Häuser; Grenze nach Belgien mit Stufe (bekannt).
  2. Ort laden Köln Dom (50.9413, 6.9583): Dom und Hohenzollernbrücke aus 100 m, Spitze bis 157 m über Boden; Schiffe als Mesh. Zahl der Knoten, MB, Bildrate im OSD-Debug oder Konsole (`__fpv.rw` um `i3s.stats` erweitern).
  3. Tageszeit Nacht, Sicht Wärme und Nacht, Grafik Einfach bis Schön: Mesh passt zum Gelände am Rand.
  4. Schalter im Flug aus und an; Ort wechseln (Aachen); DIS-Übung: kein Mesh.
  5. Netz sperren: Meldung einmal, Bild ohne Mesh, nach 60 s neuer Versuch.
  6. Menüs: Daten-Reiter in 1280 x 720, 1366 x 650, 960 x 540, 390 x 844 ohne Scrollen (`panel.scrollHeight <= clientHeight`), Schritt 1 mit „3D-Mesh an.“.
  7. Chrome Task-Manager: GPU-Speicher unter 300 MB nach 5 Minuten Flug (Schätzung Ziel).

## 3 Architektur M2: Kollision aus dem Mesh

Ziel: Bild und Physik passen. Die Physik bleibt in `physics.js` ohne DOM, Schrittweite `STEP = 1/240` unverändert, alle Daten kommen aus `rwmesh.js` und `realworld.js`.

### 3.1 Zwei Datenformen je Knoten (im Worker gerechnet, Stufe ≥ `I3S.physLevel` = 16, also Kanten bis 480 m)

Das Mesh ist laut Katalog 2,5D (vermutet, `docs/pruefung-3d-mesh.md`): je Lage eine Höhe. Darum:

1. **Höhenraster** `i3sRaster(buf, vc, box)`: Zellen 0,5 m über der EN-Box des Knotens, höchstens 256 x 256 (Stufe 16: 480 m / 256 = 1,9 m je Zelle; Stufe 18: 0,5 m; Blatt: 0,5 m). Je Zelle die höchste Höhe aller Dreiecke, die die Zellmitte überdecken (Dreiecke mit Normale nach oben, `n.y > 0.3`); leer = NaN. Rechenzeit vermutet unter 10 ms je Knoten (Blatt 8 800 Dreiecke, Stufe 17 etwa 7 000 Dreiecke auf 258 000 Zellen).
2. **Steile Dreiecke** `i3sGrid(buf, vc, box)`: Zellenraster 4 m über der EN-Box, je Zelle die Nummern der Dreiecke mit `|n.y| < 0.5` (Wände, Baumseiten, Domspitze, Brückenpfeiler), als CSR (`Uint32Array` Anfänge, `Uint32Array` Dreiecke). Flache Dreiecke stecken schon im Raster.

Beide gehen mit `wkTransfer` zurück und bleiben im Hauptprogramm am Knoten.

### 3.2 Welche Knoten die Physik nutzt

`i3s.phys` = die feinsten `'ready'` Knoten mit Raster, deren EN-Box den Kreis um die Drohne (Radius `I3S.physR` 60 m) schneidet, feinste Stufe zuerst; neu berechnet in `rwMeshStep` (je Bild, billig: höchstens 12 Knoten). Laden mit Vorrang im Umkreis `nearR` sorgt dafür, dass um die Drohne Stufe 18 oder 19 liegt, auch wenn die Kamera woanders hinsieht. `i3sCovered(x, z)`: liegt die Drohne in einem Raster mit gültiger Höhe?

### 3.3 Boden

`groundH(x, z)` (`realworld.js:389`) bekommt am Anfang: `if (i3s.phys.length) { const h = i3sGroundH(x, z); if (h === h) return h; }`. `i3sGroundH`: erster Knoten in `phys`, dessen Box den Punkt enthält; bilinear im Raster; NaN wenn Zelle leer. `groundN` rechnet weiter numerisch aus `groundH` (Zellweite als Schrittweite). Folgen:

- Drohne, Verfolgerkamera (`render.js:686`), Kamerabegrenzung (678), Startplatz (`respawn`, `physics.js:122`), Pilot, Vögel stehen auf der Mesh-Oberfläche. Dächer und Baumkronen sind damit „Boden“: Landen auf dem Dach ist der Bodenpfad (heute über LoD2-Dreiecke, `docs/echte-welt.md` RW2). Landen auf einer Baumkrone wird möglich; so sieht das 2,5D-Mesh aus (Entscheidung 8).
- Wände im Raster: bilinear zwischen Straßen- und Dachzelle entsteht eine Rampe von einer Zellbreite (0,5 m). Dort stehen ohnehin die steilen Dreiecke (3.4). Bodenmeldung bleibt „Bodenkontakt zu schnell“.
- Wasser: `waterAt` und `WATER_UP` unverändert; der Mesh-Spiegel liegt etwa auf der Wasserlinie des DGM (vermutet aus dem Vergleich am 06.11.).
- Außerhalb der Abdeckung oder während des Ladens: wie heute DGM.

### 3.4 Wände und Ragendes

- `i3sTrisNear(x, z, R, out)`: sammelt aus den Gittern der `phys`-Knoten alle steilen Dreiecke in Zellen, die den Kreis (x, z, R) berühren, in ein wiederverwendetes `Float32Array` (9 Werte je Dreieck, Kartenkoordinaten: `[E_rel + off.x, h_rel + off.y, -N_rel + off.z]`). R in `rwCollide` ist klein (`max(radius, arm + R) + |Δp| + 0,3`, etwa 1 bis 2 m), also einige Zellen, geschätzt 20 bis 300 Dreiecke je Schritt.
- `rwCollide(prev, h)` (`physics.js:581-626`) wird in `collideTris(prev, h, T, list, why)` (Strecke, nächster Punkt, `resolve`) und einen Rahmen geteilt: Ist `i3sCovered(s.p[0], s.p[2])`, dann `collideTris(prev, h, meshTris, 0..n, 'Hindernis getroffen')` und keine LoD2-Dreiecke und Bäume (Quader). Sonst wie heute (`rwNear`, `rw.tris`, Quader). Umschalten je Schritt nach Abdeckung; `rwSetTris` wird weiter gebaut (Rückfall).
- Kosten je Schritt: 300 Dreiecke x 9 Teile x `closestOnTri` bei 240 Hz etwa 650 000 Nachbar-Rechnungen je Sekunde; heute in Innenstädten ähnlich (Schätzung). Test misst die Rechenzeit wie `test/realworld.test.mjs` (unter 60 ms je Sekunde Flug).
- `placeReal().free` (`realworld.js:601-606`): prüft zusätzlich `i3sTrisNear` und `i3sGroundH` (eine Zeile je), damit Landeplätze und Ziele nicht im Mesh stehen.
- Bestzeit: `bestOk` bleibt wahr (das Mesh ist genauer als LoD2); Entscheidung 9.

### 3.5 Warum nicht nur Raster und nicht nur Dreiecke

- Nur Raster (einfachste Fassung): Wände wären steile Rampen; die Drohne rutscht langsam an Fassaden hoch, Treffer heißen „Bodenkontakt“. Kleiner Aufwand, aber falsches Gefühl.
- Nur Dreiecke (alle, auch flache): Boden doppelt (DGM und Mesh-Fläche), Landungen würden zu „Gebäude getroffen“, Durchtunneln-Test gegen 9 000 Dreiecke je Blatt bei jedem Schritt zu teuer.
- Gewählt: Raster für alles Flache, Dreiecke nur für Steiles. Beide aus denselben Knoten, einmal im Worker gerechnet.

## 4 Tests (Node, ohne Netz, kleine synthetische Probe)

Neue Datei `test/rwmesh.test.mjs`, dazu Ergänzungen in `test/rwworker.test.mjs`, `test/collision.test.mjs` oder `test/realworld.test.mjs`. Alle Abrufe kommen aus einem kleinen Dienst-Ersatz im Test (Objekt `fakeI3s`), kein Download, Laufzeit Millisekunden.

Probe (im Test gebaut): Ursprung E 300000, N 5600000, hHome 100. Wurzelseite 0 (ein Kind), Seite 1 mit Stufe-1-Knoten (Box 2 x 2 km, lod 0, ein Kind) und Stufe-2-Knoten (lod klein, Mesh, 4 Kinder), Seite 2 mit vier Blättern (je 50 x 50 m, lod 500 000). Geometrie je Blatt: Boden als zwei Dreiecke auf h = 100, in einem Blatt ein Haus 10 x 10 x 8 m (Dach zwei Dreiecke, vier Wände je zwei Dreiecke), UV 0 bis 1; gepackt mit `zlib.gzipSync` (ein Abruf liefert sie roh gepackt, einer schon entpackt, beides muss gehen). Textur: 4 Byte Platzhalter (kein Decoder im Test).

Prüfungen:

1. Adressen: `i3sPageUrl`, `i3sGeoUrl`, `i3sTexUrl` gegen die gemessenen Pfade; Seite = floor(idx/64).
2. `i3sParsePage`: Knoten, Stufen, Kinder, `r`, `off` aus dem Ursprung (Haus-Blatt: Mitte x = E − 300000, y = h − 100, z = −(N − 5600000)).
3. `i3sParseGeometry`: `vc`, Versätze, Länge; zu kurzer Puffer wirft; `i3sUnzip` entpackt gzip-Bytes und lässt rohe Bytes durch.
4. `i3sSelect`: Kamera 5 km weit: Stufe-2-Knoten gezeichnet, keine Blätter angefordert. Kamera 20 m über dem Haus: Blätter angefordert (Prio nahe Drohne zuerst), bis alle vier `'ready'` sind bleibt Stufe 2 gezeichnet, danach die vier Blätter. Knoten hinter der Kamera (außerhalb der Ebenen, weiter als `nearR`) nicht angefordert; näher als `nearR` schon.
5. Budget: `maxNodes` 2 mit sechs fertigen Knoten: `i3sEvict` gibt die lange nicht gezeichneten frei, nie `drawn` oder `phys`.
6. Fehler: Abruf wirft „Keine Verbindung“ → `st 'fail'`, nach `retry` erneut angefordert; 404 → `'dead'`, Elternteil bleibt gezeichnet.
7. `i3sCovers`: Punkt in der Stufe-1-Box wahr, außerhalb falsch; `rwMesh` setzt Alpha 0,04 innen, 0 außen.
8. Worker (`test/rwworker.test.mjs`): `wkSource` enthält `rwmesh.js` (`function i3sParseGeometry`), Auftrag `i3sNode` mit `fetch`-Ersatz liefert `vc`, `grid`, `raster` wie direkt; ohne `createImageBitmap` kommen JPEG-Bytes zurück.
9. M2 Raster und Gitter: Dach h = 108 bei (5, 5), Straße 100 daneben, NaN außerhalb; Gitter enthält genau die acht Wanddreiecke in den Zellen am Haus.
10. M2 Physik (Muster `test/collision.test.mjs` und „Wand mit 40 m/s“ aus `test/realworld.test.mjs`): `rw.on`, Probe in `i3s.phys`; Drohne über der Straße sinkt auf 100 + `PHYS.foot`; über dem Dach auf 108; mit 4 m/s gegen die Wand prallt ab (`game.state` 'fly', Rückwärtsgeschwindigkeit 0,3 bis 2,5 m/s); mit 40 m/s kein Durchtunneln (bleibt davor oder Absturz mit „Hindernis getroffen“); außerhalb der Abdeckung gelten LoD2-Dreiecke wie heute (Monschau-Test unverändert). Rechenzeit 1 s Flug am Haus unter 60 ms.
11. Bestand: `test/rwshow.test.mjs`, `test/realworld.test.mjs`, `test/legacy-parity.test.mjs` unverändert grün; Monschau-Dateien unverändert (`git status realworld/` leer).

## 5 Größe von `dist/fpvsim.html`

Heute 7,755 MB (gesichert), Grenze im Test 7,8 MB (`test/build.test.mjs:64`). N1 bringt etwa 8 KB. M1 bringt etwa 25 bis 30 KB (Modul 350 Zeilen, Shader, Worker, Menü), M2 etwa 10 KB (Schätzung aus dem Umfang vergleichbarer Module, `rwwms.js` 202 Zeilen = 11 KB). Damit etwa 7,80 bis 7,81 MB: die Grenze fällt. Vorschlag: Grenze in M1 auf 7,9 MB heben, Kommentar im Test ergänzen („M1 3D-Mesh etwa 30 KB“). Der Test soll versehentliche Einbettungen fangen, nicht Code. Sparen wäre nur beim Luftbild Monschau möglich (3,5 MB JPEG), das verändert das Bild und ist nicht Teil des Auftrags. Es wird nichts eingebettet (keine Mesh-Daten, keine Knotenliste; Entscheidung 3).

## 6 Etappen

Je Etappe wie immer: `npm run build`, `npm test`, Browser in vier Größen, `docs/echte-welt.md`, `docs/PLAN.md`, `docs/prompt-historie.md` ergänzen, committen, berichten, anhalten.

| Nr. | Schritt | Inhalt | Dateien | Tests | Aufwand |
|---|---|---|---|---|---|
| M1a | Kern ohne Grafik | `src/rwmesh.js`: Konstanten, Zustand, Adressen, Seiten lesen, Geometrie prüfen, `i3sUnzip`, Ebenen und Kugeltest, Maß, `i3sSelect`, `i3sEvict`, `i3sCovers`; `mesh`-Feld in `RW_SOURCES[0]`; `cfg.rwMesh` | `src/rwmesh.js` (neu), `src/rwload.js`, `src/state.js` | `test/rwmesh.test.mjs` Punkte 1 bis 7 | M |
| M1b | Laden und Zeichnen | Worker-Aufträge `i3sRoot`, `i3sPage`, `i3sNode` (`wkRun`, `WK_MODS`); `rwMeshStep`, `i3sActive`, `i3sClear`, Fehler mit Pause in `realworld.js`; `PM` mit `RW_GLSL`, Hochladen, Zeichnen, Freigabe, Grafikverlust, `uSink` und Alpha 0,04, Ausblenden von Häusern, Bäumen, Wasser in `render.js`; Meldungen in `main.js`; Schalter im Daten-Reiter, Hinweis, Hilfe | `src/rwworker.js`, `src/rwthread.js`, `src/realworld.js`, `src/render.js`, `src/main.js`, `src/srcui.js`, `src/index.html`, `src/style.css`, `src/menu.js`, `test/build.test.mjs` (Grenze 7,9 MB) | Punkt 8, Bestand; Browser Prüfliste 1 bis 7 | M bis L |
| M1c | Feinschliff | Nacht, Wärme, Nachtsicht am Mesh nach Augenschein; `q` und Texturgrenzen am Handy; Vorrang um die Drohne; Zahlen in `__fpv`; Doku | `src/render.js`, `src/rwmesh.js`, `docs/echte-welt.md` | Browser nachts und am nachgebildeten Handy | S |
| M2a | Boden und Wände aus dem Mesh | `i3sRaster`, `i3sGrid` im Worker; `i3s.phys`, `i3sGroundH`, `i3sTrisNear`, `i3sCovered`; `groundH` mit Mesh; `collideTris` aus `rwCollide` herausgelöst, Umschalten nach Abdeckung | `src/rwmesh.js`, `src/rwworker.js`, `src/realworld.js`, `src/physics.js` | Punkte 9, 10; `test/collision.test.mjs` Bestand | M |
| M2b | Rundum | `placeReal().free` mit Mesh; Kamera und Pilot auf dem Mesh prüfen; Meldungstexte; Bestzeit-Regel; Monschau und Köln im Browser (Landung auf Dach, Anflug an die Domfassade, Brückenpfeiler, Rur) | `src/realworld.js`, `src/render.js`, Doku | Browser; Rechenzeit-Test | S |

Reihenfolge: M1a → M1b → M1c → M2a → M2b. M1a zuerst, weil der Kern ohne Netz und ohne Grafik testbar ist und die Datenform festlegt. M1b bringt das Bild. M1c vor M2, damit der Nutzer das Bild früh beurteilt (am 06.11. fiel die erste Mesh-Fassung durch „verschwommen“; jetzt mit Nachladen bis Stufe 19 statt eingebetteter Stufe 13). M2 danach, weil es nur Sinn hat, wenn das Bild bleibt.

Wer nur eine Sitzung hat: M1a und der Worker-Teil von M1b zusammen, dann anhalten.

## 7 Offene Entscheidungen (der Umsetzer nimmt den Vorschlag)

1. **Vorgabe des Schalters:** aus. Alternative: an für alle NRW-Orte (20 bis 60 MB je Flug).
2. **Ort des Schalters:** Optionen → Daten, neben „Nachladen beim Fliegen“ in derselben Zeile (Menü wächst nicht). Alternative: Debug-Reiter über `RW_SHOW` (automatisch, aber versteckt und falsch einsortiert) oder Schritt 1 (dort ist kein Platz, Zoom 0,84).
3. **Wurzelkinder (108 Seiten, hier 32 s, aus Deutschland vermutet 3 bis 8 s):** zur Laufzeit laden, einmal je Sitzung im Arbeitsspeicher, nichts einbetten. Alternative: 2 KB Boxen-Liste im Repo (sofort da, veraltet mit neuer Dienstversion).
4. **Luftbild-Gelände unter dem Mesh:** bleibt, um 4 m abgesenkt (Löcher, Laden, Umgebung, Ausland). Alternative: Luftbild ganz aus (Vorgabe wörtlich), dann graue Löcher beim Laden und am Horizont.
5. **Wasser:** Darstellung aus (das Mesh zeigt die Flussfläche), Physik (Absturz) bleibt.
6. **Stufe von 4 m an der Landesgrenze und an der Ladefront:** hinnehmen. Alternative: Absenkung nur um geladene Knoten (Neuaufbau der Netze bei jedem Knoten, zu teuer).
7. **LoD2 und Bäume in M1:** Darstellung aus, Kollision bleibt (Bild und Physik passen grob, beide aus derselben Oberfläche). M2 ersetzt die Kollision.
8. **Landen auf Baumkronen in M2:** ja (2,5D-Mesh, so sieht es aus). Alternative: Kronen aus dem Raster filtern (keine Daten dafür).
9. **Bestzeit mit Mesh:** erlaubt (genauer als LoD2). Alternative: `bestOk` falsch mit Mesh.
10. **Qualitätsfaktor `q`:** 1 am Rechner, 2,5 am Handy (Schätzung). Kein Regler im Menü.
11. **Dateigrenze:** auf 7,9 MB heben. Alternative: Luftbild Monschau kleiner.
12. **Nacht ohne beleuchtete Fenster im Mesh:** hinnehmen. Alternative später: helle Punkte aus der Texturhelligkeit.
13. **Name des Moduls:** `src/rwmesh.js`, Vorsilbe `i3s`. Alternative: `src/i3s.js`.

## 8 Risiken

| Risiko | Einschätzung | Gegenmaßnahme |
|---|---|---|
| Erstes Bild dauert (108 Seiten, dann Pfad) | gesichert hier 1,2 s je Abruf; vermutet aus Deutschland 0,1 bis 0,3 s | 4 Abrufe gleichzeitig, grobe Knoten zuerst, Gelände mit Luftbild bleibt sichtbar, Meldung „lädt“; Entscheidung 3 als Rückfall |
| Grafikspeicher auf Handys | Texturen 2048 x 1024 je Knoten | Budget, Verkleinern im Worker, `q` 2,5, höchstens 80 Knoten, Kontextverlust-Handler vorhanden |
| Bildschirmmaß falsch verstanden | vermutet aus Beschreibung | `q` als Stellschraube; Prüfung am Dom aus 100 m; Formel in einer Funktion |
| Flimmern Mesh gegen Gelände | gesichert am 06.11. (Versatz bis 1 m) | Absenkung 4 m, nur Kennung im Alpha, kein Neuaufbau beim Umschalten |
| Bild wirkt „verschwommen“ wie am 06.11. | damals eingebettete Stufe 13 (115 cm je Pixel) | jetzt Stufe 18 und 19 bis 100 m (4 cm je Pixel); Anisotropie; früh zeigen (M1c) |
| Datenmenge beim Flug | Schätzung 0,3 bis 1 MB/s im Ort | Blätter nur bis 40 m; Hinweis im `title`; Schalter aus als Ausweg |
| Worker ohne `createImageBitmap` | vermutet selten | Rückfall: JPEG-Bytes, Entschlüsseln im Hauptprogramm |
| Physik ruckelt beim Umschalten DGM ↔ Mesh (Sprung bis 1 m) | vermutet beim ersten Laden um die Drohne | Vorrang für Knoten um die Drohne; Umschalten nur, wenn das Raster am Punkt gültig ist; im Zweifel beim Start erst kurz warten (nicht geplant) |
| Modulregeln | neues Modul mit eigenen Namen | Vorsilbe `i3s`, Build prüft Dubletten; `rwmesh.js` ohne DOM in `WK_MODS` |
| ASCII der `.aspx` | Shader und Code sind ASCII | Build prüft wie bisher |
| Menühöhe | zwei Schalter in einer Zeile | im Browser in vier Größen messen; bei 390 px notfalls Kurztext „Mesh (NRW)“ |
