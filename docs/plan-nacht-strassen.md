# Plan: Nachtmodus, Straßen mit Autos, mehr Leben (09.11.2026, Fable)

Nur Planung, kein Code. Auftrag des Nutzers (Prompt 180): aus den Ideen 2, 3 und 4 (Prompt 178/179) einen Plan machen, ein anderer Agent setzt um.
Vorgaben: token-sparend (kleine Bausteine, Vorhandenes nutzen), leistungsarm (flüssig in Chromium, auch schwache Rechner), Menüs nicht größer, Modulregeln aus `CLAUDE.md`, nur amtliche Dienste, Lizenzen der Länder.

Einstufung: **gesichert** = im Code gelesen (Fundstelle) oder heute per Abruf geprüft. **vermutet** = geschätzt oder nicht geprüft. Aufwand: S = unter einer Sitzung, M = eine Sitzung, L = zwei Sitzungen (wie `docs/plan-taktischer-flug.md`). Zahlen zu Licht, Tempo, Abständen sind Schätzungen für ein ruhiges Bild; der Umsetzer darf sie nach dem Augenschein anpassen.

## 0 Was heute da ist (gesichert)

| Was | Fundstelle |
|---|---|
| Ein Welt-Shader `FS` für alles; Bildmodus `uVision` (1 Wärme, 2 Nachtsicht) und Wärme je Objekt `uHeat` in `vis()`; Licht aus `uSun`, Himmelsfarbe `uFog`, `uOver` als Tönung | `src/render.js:103-326`, `vis()` 212-217, Licht Mittel/Schön 310-325, Einfach 284-294 |
| Fassaden der echten Welt mit Fenstern im Shader: je Feld ein Zufallswert `hs`, Glas `win`, Rahmen, Vorhang; Feldraster aus Sockelhöhe `bq` (gerundet, kein Flimmern) | `src/render.js:136-210` (`facade`), Fenster 171-189 |
| Himmel-Shader: Verlauf, Sonne, Wolken ab Mittel, Kondensstreifen, Nachtsicht und Wärme am Ende | `src/render.js:331-387` (`SKY_FS`), Nachtsicht 384-385 |
| Lens-Flare nur bei Sonne im Bild; Sonnenrichtung fest (`SUN`, `SUN_RW` aus den Schatten des Luftbilds); Himmelsfarben `FOG`, `ZEN` | `src/render.js:388-410`, 416-426, `drawFlare` 1136 |
| Vertex-Shader kennt nur `uVP`, `uModel`; Alpha der Farbe kodiert die Art: Boden < 0,125, Wand 0,125 bis 0,49 (Klasse und Sockel), Dach 0,6, Wasser 0,7, Krone 0,08; Länge der Normale trägt Traufhöhe (Wand) oder Uferanteil (Wasser) | `src/render.js:43-56`, `src/realworld.js:680-694`, `rwWaterMesh` 527 |
| Baumkronen: acht Seiten, drei Ringe, Spitze; Normale Länge 1; Kollision als Quader getrennt davon | `src/realworld.js:749-767`, `rwTileModels` 645-668 |
| Fahrzeuge: ein Netz `vehMesh` (Karosserie, Räder, Scheinwerfer, Rücklichter), je Fahrzeug ein Zeichenaufruf mit `uModel` und `uOver`; Spuren `makeRoute`/`routeAt` (nur x, z); hin und her auf offenen Spuren | `src/vehicles.js:21-61`, 116-132; `src/render.js:911-923` |
| `MeshBuilder.tri` schreibt Alpha aus `col[3]` (sonst 1): eigene Alpha-Kennungen für neue Netze sind möglich | `src/world.js:18-22` |
| Belebung nur echte Welt, nicht DIS: `ambOn = rw.on && !cfg.verbund`; `ambStep` je Bild aus `main.js`; `ambInit` beim Start | `src/ambient.js:14, 41, 48`, `src/main.js:73`, `src/physics.js:148` |
| Straßen nur in Monschau: `rw.features.roads` (92 Achsen mit Namen aus Basis-DLM `ver01_l`, nur Name übernommen), gezeichnet nur als Kartenlinien | `realworld/monschau.features.json`, `tools/features.mjs:60-62`, `src/realworld.js:572-597` |
| Geladene Orte und Kacheln: `features` nur Ortslagen (`rwExtras`), Kacheln speichern `features: null` | `src/realworld.js:176-190`, 877, 887 |
| Wasser: Bitmaske 1 m je Kachel, `waterAt`, `rwWetFn`; Spiegel = `groundH + WATER_UP` | `src/realworld.js:504-525` |
| Ortslagen: `rwPlace(x, z)` liefert `d = 0` im Ort | `src/realworld.js:792-814` |
| Platzierungsdienst mit Welt-Schnittstelle `W` (`groundH`, `wet`, `free`, `bounds`, `home`); `roads()` war geplant, fehlt | `src/place.js:1-5`, `placeReal` `src/realworld.js:599-609`, Plan T2 |
| Hintergrund-Thread mit Aufträgen `area`, `far`, `modelMesh`; Module des Workers in `WK_MODS` | `src/rwworker.js:22-32`, `src/rwthread.js:11` |
| Netz nur über `rwNet` (`get`, `text`), kein POST | `src/realworld.js:133-163` |
| Speicher: IndexedDB `areas`, `info`, `land`, `lod2`; Ort und Kachel als ein Datensatz mit `features` | `src/rwstore.js:12, 91` |
| Grafikstufen `cfg.gfx` simple/mid/nice als `uGfx` 0/1/2; Auflösung automatisch (`adaptRes`) | `src/render.js:684, 587` |
| Menü Allgemein: Regler, Häkchen, `.segpair` (Videobild, Sicht), Grafik, Schaden; `fitPanel` zoomt 0,72 bis 1,15 | `src/index.html` Reiter `general`, `src/style.css:77-80`, `src/menu.js:203-215` |
| Debug-Reiter der echten Welt: Ebenen aus `RW_SHOW` als Häkchen | `src/realworld.js:30-35`, `src/index.html` `#geoShow` |

### Straßenquelle heute geprüft (gesichert, 09.11.2026, Abrufe aus dieser Umgebung mit `Origin: https://bladeage.github.io`)

Dienst: ALKIS WFS „vereinfacht“ NRW, `https://www.wfs.nrw.de/geobasis/wfs_nw_alkis_vereinfacht`, WFS 2.0.0, Typ `ave:Nutzung`. Lizenz dl-de/zero-2.0 (gesichert in `docs/echte-welt.md:313`).

- Ausgabe nur GML 3.1.1 oder 3.2.1, kein JSON (Fähigkeiten gelesen). Kein Blättern (`ImplementsResultPaging FALSE`), `COUNT` wirkt, `resultType=hits` gibt es.
- GET mit `BBOX` für 1 x 1 km: Monschau 735 Flächen, 1,04 MB, 2,2 s; Aachen Mitte 1 019 Flächen, 1,46 MB, 2,3 s; Köln Mitte 704 Flächen, 1,01 MB, 1,8 s. Darunter „Straßenverkehr“ 142 / 214 / 179, „Weg“ 121 / 284 / 28. Keine Obergrenze gesehen (`numberMatched="unknown"`, alles kam).
- Felder je Fläche: `oid`, `aktualit`, `geometrie` (`gml:MultiSurface` > `gml:Polygon` > `gml:exterior`/`gml:interior` > `gml:LinearRing` > `gml:posList`, EPSG:25832, „E N E N …“), `nutzart`, `name`, `bez`. **Alle** Flächen „Straßenverkehr“, „Weg“ und „Platz“ tragen in Monschau einen Namen (142 von 142). Das gibt Straßennamen fürs OSD auch an geladenen Orten.
- Filter per GET (`FILTER=`) lehnt der vorgeschaltete „OGC Proxy“ ab (400). **Filter per POST** (XML `wfs:GetFeature` mit `fes:And` aus `PropertyIsEqualTo nutzart = Straßenverkehr` und `fes:BBOX`) geht: 142 Flächen, 270 KB, etwa 1 s. Auch mit `Content-Type: text/plain` (dann kein CORS-Vorabruf nötig). Der Vorabruf (OPTIONS) antwortet trotzdem sauber: 204, `Allow-Methods GET,POST,OPTIONS,HEAD`.
- CORS: `Access-Control-Allow-Origin` spiegelt unsere Seite und auch `null` (lokal geöffnete Datei).
- Nicht geprüft (vermutet): Antwortzeiten unter Last, Sperren bei vielen Kacheln nacheinander, Verhalten anderer Länder.

Damit ist Entscheidung 3 aus `docs/plan-taktischer-flug.md` (Abschnitt 7) bestätigt: ALKIS-Flächen statt Basis-DLM-Achsen (159 MB).

## 1 Nachtmodus

### 1.1 Darstellung (Shader, keine neuen Zeichenaufrufe)

Ein Schalter `cfg.night` (false/true). Die Grafik bekommt zwei neue Uniforms in beiden Programmen: `uNight` (0/1) und `uMoon` (Richtung). Alles Weitere ist Rechnung im vorhandenen Shader, Fundstellen oben.

- **Himmel** (`SKY_FS`): bei Nacht Verlauf aus zwei dunklen Farben (Zenit etwa 0,02/0,03/0,07, Horizont 0,08/0,09/0,14 statt `uZen`/`uFog`), Sterne aus `hash(floor(d*700.0))` über einer Schwelle (nur Richtungen mit `d.y > 0`, Helligkeit aus dem Rest des Zufallswerts, leicht flackernd mit `uTime`), Mond als Scheibe `pow(max(dot(d, uMoon), 0), 4000)` mit schwachem Hof `pow(..., 30)*0.08`. Wolken ab Mittel bleiben, dunkler (Grau 0,10 bis 0,16) und zu 60 % Deckkraft. Kondensstreifen nachts unsichtbar; stattdessen blinkt der Rumpfpunkt der Flugzeuge (`step(0.5, fract(uTime*1.2))`, weiß, etwas größer): billige Belebung des Nachthimmels. Nachtsicht am Himmel: Grün wie heute, Sterne und Mond kommen verstärkt durch (siehe 1.3). Wärme: unverändert.
- **Licht im Welt-Shader**: `uSun` bleibt die Lichtrichtung, der Aufrufer gibt nachts `uMoon` hinein (eine Stelle in `render()`, 680 und 696). Nachts im Pfad Mittel/Schön: Streulicht `amb` mal 0,08 und bläulich, gerichtetes Licht `dif*vec3(0.25, 0.30, 0.45)*0.25` statt `vec3(1.0, 0.88, 0.70)*1.5`; Pfad Einfach entsprechend (Faktoren 0,10 und 0,2). Nebelfarbe nachts `uFog` dunkel (0,03/0,035/0,06), auch in `gl.clearColor` (672). Taldunst `rwHaze` halbieren. Tone-Mapping bleibt (hebt dunkle Töne etwas, gut für Lesbarkeit).
- **Leuchtende Fenster** in `facade()`: pro Fensterfeld gibt es schon den Zufallswert `hs` (160). Nachts gilt ein Fenster als beleuchtet, wenn `hs < 0,35` (Wohnhaus, Fachwerk), `hs < 0,2` (Gewerbe, öffentliches Gebäude), nie bei Garage, Scheune, Kirche, Brücke. Beleuchtet: Glasfarbe warm (1,0/0,85/0,55, Vorhang 0,95/0,8/0,6) und **nicht** vom Licht abgedunkelt. Dafür schreibt `facade` zusätzlich eine globale Variable `gEmit` (GLSL erlaubt globale Variablen im Fragment-Shader; so bleibt die Signatur gleich): `gEmit = win*lit`. In `main()` kommt nach dem Licht `col += emitCol*gEmit*uNight` dazu. Die Spielkarte hat ein eigenes Fenstermuster (303-309); dort dasselbe mit `hash(floor(w/vec2(2.6, 3.0)))`. Flimmern: `hs` hängt an `floor(q)` und dem gerundeten `bq`, also stabil (gesichert in der heutigen Fassade).
- **Lichtkennung für Netze**: neue Alpha-Kennung 0,75 („Licht“: frei zwischen Wasser 0,7 und Dach 0,6 beziehungsweise 1,0). Im Shader: bei `uNight > 0,5` wird ein Pixel mit `vCol.a` in 0,74 bis 0,76 selbstleuchtend (`col = vCol.rgb*1.6`, kein Licht, kein Nebelabzug bis 300 m). Am Tag ist es eine normale Fläche. Damit leuchten Scheinwerfer und Rücklichter der Autos (`buildVehicle`, 127-128: Farbe um `0.75` als vierte Komponente ergänzen) und später die Laternenköpfe, ohne neue Shader-Pfade.
- **Lens-Flare** nachts aus (`drawFlare` liefert `flareK = 0`).
- **Schatten-Scheiben** unter Objekten (814-838) nachts schwächer (Alpha mal 0,4), Richtung nach `uMoon`.

### 1.2 Lichtquellen in Städten (Etappe N2, braucht den Straßengraphen aus Abschnitt 2)

- **Straßenlaternen**: Standorte aus dem Graphen (`lampSpots`, Abschnitt 2.4): alle 35 m entlang Achsen der Art Straße, Seite wechselnd, Versatz halbe Straßenbreite + 0,6 m, **nur innerhalb einer Ortslage** (`rwPlace(x, z).d === 0`, so stehen sie „gerade in Städten“ und nicht an Feldwegen). Je Laterne: Mast 5 m als dünner Quader (Alpha 1, dunkelgrau), Kopf 0,3 m als Quader mit Alpha 0,75 (warmweiß 1,0/0,9/0,7), dazu eine **Lichtscheibe** auf dem Boden (Achteck, Radius 6 m, Mitte warm 0,35, Rand 0, Alpha-Kennung 0,75) für den Lichtkegel am Boden. Ein Netz je Kachel (`rwNightMesh(T)`, `realworld.js`, ohne DOM), gebaut erst bei Nacht, frei mit der Kachel. Zwei Zeichenaufrufe je Kachel: Masten und Köpfe normal, dann die Scheiben additiv (`gl.blendFunc(gl.ONE, gl.ONE)`, `depthMask(false)`, `polygonOffset` wie das Wasser), beide aus demselben VAO mit `drawArrays(start, count)`. Keine echten Punktlichter im Shader (je Pixel über alle Lampen zu rechnen wäre der teure Weg).
- Menge: Monschau etwa 10 km Achsen, davon im Ort vermutet 5 km, also rund 150 Laternen, je 12 + 12 + 8 Dreiecke, zusammen unter 5 000 Dreiecke (Schätzung).
- **Autos nachts**: Scheinwerfer und Rücklichter leuchten über die Kennung 0,75 (1.1). Stufe Schön zusätzlich je Auto eine additive Lichtfläche 8 m vor dem Auto auf dem Boden (ein Viereck, gleiche Scheiben-Technik), gelbweiß, schwach.
- **Fenster** kommen aus 1.1 ohne Daten.

### 1.3 Wechselwirkung mit Nachtsicht und Wärmebild (`vis()`, 212-217)

- `vis(col)` bekommt die Lichtstärke `e` dazu (aus `gEmit` und der Kennung 0,75; 0 sonst).
- Nachtsicht: heute `0.05 + 0.6*l + 0.25*uHeat`. Neu: Verstärkung `g = uNight > 0.5 ? 4.5 : 0.6` (ein Restlichtverstärker hebt die dunkle Szene an) und `+ 2.5*e`, dann `clamp`. Lichtquellen laufen so ins helle Grün bis Weiß (Überstrahlen), Fenster und Laternen werden zu hellen Flecken, der Rest bleibt körnig dunkelgrün. Am Tag ändert sich nichts (`g = 0.6` wie heute). Das Rauschen im HUD (`drawVisionGrain`, `src/hud.js:330`) bleibt.
- Wärmebild: Dunkelheit ändert Wärme nicht. Lichtquellen sind warm: `uHeat` effektiv `max(uHeat, 0.6*e)` (Laternen, Scheinwerfer), beleuchtete Fenster `+0.15` (warme Wohnung). Himmel nachts etwas dunkler (kalt).
- Sky bei Nachtsicht: Sterne und Mond mit Faktor 3 in den Grünwert, sonst wie heute.

### 1.4 Grafikstufen

| Stufe | Nacht |
|---|---|
| Einfach | dunkler Himmel ohne Sterne (nur Verlauf und Mond), Licht gedimmt, Fenster beleuchtet, Lichtkennung 0,75 aktiv, keine Lichtscheiben, keine Laternen-Netze (Masten entfallen ganz) |
| Mittel | dazu Sterne, Laternen mit Lichtscheiben, Wolken dunkel |
| Schön | dazu Lichtflächen vor den Autos, Mondhof, flackernde Sterne |

Kosten je Bild (Schätzung, 1080p, Mittel): Welt-Shader etwa 10 Rechenschritte mehr je Pixel (Fensterzufall ist schon da): 1 bis 3 %. Himmel: Sterne etwa 15 Schritte je Himmelspixel: unter 1 %. Laternen: 2 Zeichenaufrufe je Kachel, höchstens 9 Kacheln. Die automatische Auflösung fängt den Rest ab.

### 1.5 Wo der Nachtmodus gilt

Nacht ist eine **Darstellung**, kein Inhalt: Sie gilt in beiden Welten (gleicher Shader, auf der Spielkarte mit beleuchteten Fenstern, ohne Laternen) und auch in der DIS-Übung (der Partner liefert Inhalt, nicht die Tageszeit; wer VBS bei Nacht fährt, will auch hier Nacht). Laternen gibt es, wo Straßen und Ortslagen bekannt sind (echte Welt mit Straßen; Spielkarte später entlang des Kurses, nicht geplant). Nachts fliegen keine Schwärme, Greifvögel, Ballons oder Segler (`ambStep` prüft `cfg.night`); Flugzeuge bleiben (Blinklicht), Autos und Boote fahren (mit Licht).

## 2 Straßen und Autos

### 2.1 Datenquelle

**Monschau (eingebaut, erster Schritt):** die Achsen in `rw.features.roads` (Basis-DLM `ver01_l`). `tools/features.mjs:60-62` übernimmt heute nur `NAM`. Erweitern um `w` aus `BRF` (Breite der Fahrbahn, Attribut der AX_Strassenachse; vermutet in NRW meist gefüllt, sonst leer) und `kind` aus `WDM` (Widmung: Gemeindestraße, Kreis-, Landes-, Bundesstraße = Straße; fehlt = Straße; `ver02_l` Wege sind nicht eingebettet). Werkzeug einmal neu laufen lassen (Teilabrufe aus dem 4,7-GB-Paket wie bisher); `realworld/monschau.features.json` wächst um wenige KB. Ohne `w`: Vorgabe 5,5 m (Schätzung Ortsstraße).

**Geladene Orte (NRW-Vorlage):** ALKIS-WFS wie oben geprüft. In `RW_SOURCES` (`src/rwload.js:9-17`) ein Feld `roads: { url: 'https://www.wfs.nrw.de/geobasis/wfs_nw_alkis_vereinfacht', type: 'ave:Nutzung', field: 'nutzart', value: 'Straßenverkehr' }`. Abruf je 1-km-Gebiet und je Kachel:
1. POST, Body `wfs:GetFeature` 2.0.0 mit `fes:And(PropertyIsEqualTo nutzart = Straßenverkehr, BBOX geometrie)`, `Content-Type: text/plain`, Antwort etwa 0,2 bis 0,5 MB (gesichert für Monschau 270 KB).
2. Rückfall bei 400/405/Netzfehler des POST: GET `…?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=ave:Nutzung&SRSNAME=urn:ogc:def:crs:EPSG::25832&BBOX=E0,N0,E1,N1,urn:ogc:def:crs:EPSG::25832`, 1 bis 1,5 MB, dann im Leser nur `nutzart = Straßenverkehr` behalten.
Dafür bekommt `rwNet` eine dritte Funktion `post(url, body, prog)` (gleiches Muster wie `text`, 20 Zeilen). Andere Länder: optionales Feld „Straßen, WFS (ALKIS Nutzung)“ im Quellen-Formular (`src/srcui.js`, `src/index.html` Seite `source`, Zeile mit Adresse und Typname; `kind = land` nur). Ohne Feld: keine Straßen, kein Fehler. Lizenz: NRW dl-de/zero-2.0, Quellenvermerk „Geobasis NRW“ wie heute; bei eigenen Quellen trägt der Nutzer den Vermerk ein (Feld gibt es).

### 2.2 Umwandlung Flächen in Achsen (`src/rwroads.js`, ohne DOM, läuft im Worker)

1. **GML lesen** (`readGmlSurfaces(xml)` in `src/geo.js`, Vorbild `readLod2`: `indexOf`/Regex statt DOM, läuft auch in Node): je `wfs:member` die Ringe aus `gml:posList` (äußerer und innere), `nutzart`, `name`. Koordinaten UTM.
2. **Rastern**: 1-m-Raster über dem Gebiet plus 8 m Rand (Zeilen von Norden, gerade-ungerade wie `dlmWater` in `src/rwdlm.js`, Löcher bleiben trocken): Maske `Uint8Array` und Flächen-Nummer je Zelle `Uint16Array` (für Name und Breite).
3. **Schließen** (1 Zelle erweitern, 1 Zelle abtragen), damit angrenzende Flächen einer Straße zusammenwachsen.
4. **Ausdünnen** (Zhang-Suen, zwei Teilschritte je Durchlauf, bis nichts mehr fällt; etwa 40 Zeilen). Dauer vermutet 100 bis 300 ms je km² im Worker.
5. **Ausputzen**: Zweige kürzer als 12 m ab Endpunkt entfernen (Parkbuchten, Einfahrten).
6. **Verfolgen**: Skelett-Zellen zu Linienzügen zwischen Knoten (Zellen mit 1 oder mehr als 2 Nachbarn), `dlmSimplify(pts, 0.7)` (gibt es, `src/rwdlm.js`).
7. **Breite** je Linienzug: an 5 Proben senkrecht zur Achse in 1-m-Schritten bis zum Maskenrand laufen (höchstens 12 m), Median; **Name**: häufigste Flächen-Nummer entlang der Linie.
8. **Ausgabe** wie Monschau: `[{ name, pts: [[x, z], …], w, kind: 0 }]` in Kartenkoordinaten (Mitte = Ursprung, z nach Süden, 1 Nachkommastelle), je km² vermutet 20 bis 60 KB. „Platz“ und „Weg“ bleiben draußen (Plätze gäben Achsen quer über Parkplätze).

Nicht gewählt: Abstandsfeld mit Fahrt „am größten Abstand entlang“ (Vorschlag T7): schwer zu testen, Abbiegen unklar. Basis-DLM-Achsen für NRW (159 MB): zu groß (Speichergrenze 400 MB, `src/rwstore.js:43`).

### 2.3 Speichern und Nachladen

- Hauptgebiet: `rwLoadLive` holt nach dem Gelände die Straßen **nebenläufig** (Auftrag `roads` im Worker, `src/rwworker.js`; `WK_MODS` in `src/rwthread.js` um `rwroads.js` ergänzen; `roads.js` braucht der Worker nicht). Ergebnis in `rw.main.roads`, dann `rwRoadsRebuild()`. Der Ort erscheint also sofort, Autos einige Sekunden später. Speichern: in den Datensatz des Orts als `features.roads` (gleicher Datensatz wie `places`, `src/realworld.js:264`); gespeicherte Orte ohne `roads` bekommen sie beim nächsten Öffnen nachgeladen (wie Gewässer heute, `rwExtras`).
- Kacheln (`rwLoadTile`, 864-900): nach dem Laden derselbe Auftrag; `T.roads` in Weltkoordinaten (Kachelversatz `dx`, `dz`); Datensatz der Kachel bekommt `roads` statt `features: null` (887). Aus dem Speicher: `p.roads` direkt.
- Graph: `rw.roads = { G, ver }`, gebaut in `rwRoadsRebuild()` aus `rw.main.roads` und allen `T.roads`; Endpunkte über Kachelgrenzen hinweg bis 3 m zusammenfassen (die Skelette beider Kacheln enden am selben Schnitt, vermutet innerhalb 1 bis 2 m). `rwRebuild` (671-678) ruft es mit, `rw.roadVer` zählt hoch; Verkehr und Laternen bauen danach neu.
- Export/Import (`geoPack`): die Datensätze gehen ganz mit, `roads` steckt im Kopf-JSON, nichts zu tun (vermutet, kurz prüfen).
- Rückfall ohne Straßen (kein Feld, offline, Dienst fehlt): keine Autos, keine Laternen, Modus „Fahrzeuge“ bleibt gesperrt mit Grund (Entscheidung 6 in `docs/plan-taktischer-flug.md`). Meldung in Optionen → Daten (`geoStats`: Zeile „Straßen: n Achsen, m km“ oder der Fehler).

### 2.4 Graph und Fahrspuren (`src/roads.js`, ohne DOM, in Node testbar)

- `roadGraph(list)`: Linienzüge → `{ nodes: [{ x, z, e: [] }], edges: [{ a, b, pts, len, name, w, kind }] }`; Endpunkte bis 1,5 m zusammenfassen; trifft ein Endpunkt einen inneren Punkt einer anderen Achse (bis 1,5 m), wird die Achse dort geteilt (T-Kreuzung).
- `roadWalk(G, e0, dir, minLen, R)`: Zufallsweg durch den Graphen (an Knoten zufällig abbiegen, keine Kehre außer an Sackgassen) bis `minLen` Meter → ein Linienzug. **Damit bleibt `routeAt` aus `vehicles.js` unverändert nutzbar:** ein Auto bekommt eine offene Spur von 1,5 bis 3 km und fährt sie ab; vor dem Ende (oder weit weg von der Drohne) bekommt es eine neue. Kein eigener Zustandsautomat fürs Abbiegen.
- `laneOffset(pts, off)`: Spur rechts der Fahrrichtung um `off = min(1.75, w/4 + 0.5)` versetzen (Normale an Ecken gemittelt wie `offsetPath`, `src/vehicles.js:12-19`). Rechtsverkehr: `off` positiv = rechts; der Test prüft das Vorzeichen an einem Beispiel.
- `laneProfile(pts, W, roadH)`: alle 2 m eine Höhe `y` und eine Prüfung `W.free([x, y + 1.2, z], 1.0)`; blockierte Stellen (Achse schneidet ein Gebäude oder einen Baum-Quader; bei Basis-DLM-Achsen an Ecken möglich, vermutet selten) schneiden die Spur, kurze Reststücke unter 40 m entfallen. Ergebnis: Punkte `[x, z, y]`. `makeRoute` und `routeAt` lesen weiter `a[0]`, `a[1]`; `routeAt` liefert zusätzlich `y` (linear), wenn ein dritter Wert da ist (zwei Zeilen in `src/vehicles.js:49-61`, `makeRoute` exportieren).
- `roadH(x, z)` (in `realworld.js`, kennt `rwNear`): Bodenhöhe `groundH`; liegt die Stelle im Wasser oder deckt ein Dachdreieck (Normale `n.y > 0,7`) im 8-m-Raster die Stelle in 0 bis 12 m über dem Boden, gilt dessen Höhe: **Brückendeck**. LoD2 NRW führt Brücken als Platten (Klasse 8, `src/realworld.js:706-712`, gesichert), Monschau hat die Rur-Brücken (vermutet aus derselben Stelle). Wasser ohne Deck: Stücke bis 12 m als Furt auf Wasserspiegel + 0,3 (Durchlässe, Bachrohre), längere Stücke schneiden die Spur.
- Steigung: aus `y` 2 m voraus: Nicken des Modells `atan(dy/2)`, Tempo mal `1 - 2.5*max(0, Steigung)`, mindestens 40 %.
- `lampSpots(G, every, inPlace)`: siehe 1.2.
- `roadRoutes(G, home, n, minLen, R)` und `parkSpots(G, home, n, W, R)`: für den Taktischen Flug (Abschnitt 2.7), gleiches Format wie `ROUTES`.
- `roadNearest(G, x, z, r)`: Name der nächsten Straße (ersetzt den Teil Straßen in `rwNearName`, 610, der heute nur Monschau kann).

### 2.5 Verkehr (`src/traffic.js`, ohne DOM)

- `TRAFFIC = { max: 8, near: [150, 600], far: 1200, speed: [7, 13], walk: [1500, 3000] }` (m, m/s; Schätzung: Ortsverkehr 25 bis 45 km/h).
- `cars = []`, je Auto `{ route, s, v, x, z, y, yaw, pitch, col }`; `trafficInit(c, R)`, `trafficStep(h, c, R)` aus `main.js` direkt nach `ambStep` (73). Aktiv nur mit `ambOn()` und `rw.roads` und `rw.show.traffic`.
- Neues Auto: Kante mit Mittelpunkt 150 bis 600 m von der Drohne, nicht in den vorderen 30° der Kamera (sonst erscheint es im Bild), Zufallsweg, Startweg `s` so, dass es gleich fährt. Ersetzen, wenn weiter als `far` oder die Spur in unter 100 m endet. Höchstens ein Neuaufbau je Schritt.
- `rw.roadVer` geändert (Kachel dazu oder weg): Autos, deren Spur nicht mehr auf einer Kante liegt (nächster Kantenabstand über 1 m), neu setzen; die anderen fahren weiter.
- Keine Kollision mit der Drohne, kein Einfluss auf die Physik (wie Vögel; die Jagd-Fahrzeuge in `vehicles.js` bleiben die einzigen mit Treffer). Begründung: Physik unverändert und in Node getestet; ein Zufallsauto, das die Drohne beim Landen auf der Straße trifft, wäre Ärger ohne Nutzen.
- Farbe je Auto aus einer Palette (6 Farben) über `uOver` wie die Jagd-Fahrzeuge (`src/render.js:918-919`); Wärme 0,85 (Motor). Zeichnen: `drawCar(x, y, z, yaw, pitch, col, heat)` aus dem heutigen Block 911-923 herausziehen, dann für `vehicles`, `traffic` und die Verfolgung nutzen. 8 Aufrufe je Bild mit je rund 300 Dreiecken; kein Instancing nötig (Handover: Kosten liegen bei den Pixeln). Schatten-Scheibe wie bei den Jagd-Fahrzeugen (827).
- CPU je Bild: 8 Autos mal `routeAt` über bis zu 400 Abschnitte, unter 0,1 ms (Schätzung).

### 2.6 Wie Autos mit Gebäuden, Brücken, Steigungen, Wasser umgehen

| Fall | Lösung |
|---|---|
| Achse schneidet Gebäude oder Baum | `laneProfile` prüft `W.free`, schneidet die Spur (2.4) |
| Brücke über Fluss oder Straße | `roadH` nimmt das Brückendeck aus LoD2; fehlt es: Furt bis 12 m, sonst Schnitt |
| Steigung (Monschau hat Hänge) | `y` aus dem Profil, Nicken des Modells, Tempo sinkt, Räder bleiben auf der gezeichneten Fläche (`groundH` ist die gezeichnete Fläche, gesichert `src/realworld.js:389`) |
| Wasser | wie Brücke; kein Auto fährt auf eine nasse Zelle ohne Deck |
| Kachelgrenze | Graph zusammengefasst; Autos wechseln die Kachel auf der Spur |
| Kachel entladen | Autos dort weit weg (ab 1 600 m), werden neu gesetzt |
| Keine Straßen | keine Autos |

### 2.7 Fahrzeuge des Taktischen Flugs und Verfolgung auf denselben Straßen

Vorbereiten in S1, umsetzen als eigene Etappe S3 (Vorschlag, siehe Abschnitt 4): `initVehicles(speedScale, layout)` nimmt wie `initTargets` eine Aufstellung von außen: `{ parked: [[x, z, yaw, y]], routes: [Spur…] }` aus `roadRoutes` (4 Zufallswege 300 bis 800 m, Start 100 bis 400 m vom Startplatz, Höhe im Profil) und `parkSpots` (am Straßenrand, Versatz w/2 + 1,5 m, eben, frei). `hitsVehicle` und das Zeichnen bekommen `v.y` (heute 0). Verfolgung in der echten Welt: `lead` auf der längsten Spur. Menü: „Fahrzeuge“ und „Verfolgung“ in der echten Welt frei, wenn `rw.roads` mindestens 500 m Straße innerhalb der Grenzen hat, sonst wie heute gesperrt mit „Für diesen Ort gibt es keine Straßen“ (`buildModeList`, `src/menu.js:360`). Ohne Straßen: stehende Fahrzeuge auf freien Flächen (Rückfall aus Entscheidung 6) bleibt abgelehnt: gesperrt mit Grund.

## 3 Menü

### 3.1 Tag/Nacht: Einstellungen → Allgemein, neben Grafik (Vorschlag)

```
Einstellungen
[ Allgemein | Steuerung | OSD | Hilfe ]
Kamerawinkel | Blickfeld | Lautstärke       (eine Zeile ab 760 px)
Ton · Propeller · Scharf nötig · Auflösung · Akku · Durch Hindernisse · Flugspur
Videobild [Analog|Digital|Ohne]   Sicht [Normal|Wärme|Nacht]      (.segpair, wie heute)
Grafik [Schön|Mittel|Einfach]     Tageszeit [Tag|Nacht]           (neu: zweite .segpair-Zeile)
Schaden [...]
[ Hauptmenü ] [ Fertig ]
```

- „Grafik“ rückt mit „Tageszeit“ in eine zweite `.segpair` (zwei Spalten, `style.css:77-80`). Höhe des Reiters ändert sich **nicht**: die Zeile „Grafik“ (Überschrift 20 + Schalter 36) gibt es schon, „Tageszeit“ steht daneben. Bei 390 px Breite ist `.segpair` ebenfalls zweispaltig (keine Media-Regel, gesichert); drei Knöpfe „Schön|Mittel|Einfach“ in einer Spalte sind dasselbe wie heute „Normal|Wärme|Nacht“ in „Sicht“, passt also (vermutet gleich, im Browser prüfen). Alle vier Größen bleiben wie heute.
- Warum hier: Nacht ist wie Grafik und Sicht eine Darstellung, kein Flugmodus. Das Pause-Menü (Esc) zeigt denselben Reiter, also kann man **im Flug** umschalten. Schritt 1 „mode“ (echte Welt, Ort laden) ist schon bei Zoom 0,84 (`docs/plan-menue.md` 1.3), dort wäre eine Zeile zu viel. Eine Taste gibt es nicht (Vorschlag): jede weitere Funktion kostet eine Zeile im Reiter Steuerung → Funktionen (Funke 506 → 542 px bei 960 x 540, Zoom 0,83). Der Knopf „Nacht“ unter „Sicht“ heißt weiter Nachtsicht (Gerät), „Tageszeit“ ist die Welt; `title`-Texte erklären beides.
- Verhalten: `cfg.night` speichern (`saveCfg`), `syncMenu` setzt `aria-pressed`, `render()` liest es je Bild. Neustart lässt die Tageszeit stehen (anders als `cfg.vision`, `src/physics.js:146`, denn Nacht ist eine bewusste Wahl).

### 3.2 Verkehr und Laternen an/aus: Echte Welt → Optionen → Debug

`RW_SHOW` (`src/realworld.js:30`) bekommt `['traffic', 'Verkehr (Autos, Boote)']` und `['lamps', 'Straßenlaternen']`; die Häkchen entstehen automatisch (`#geoShow`). Höhe Debug-Reiter heute etwa 40 + 44 + 36 + 160 + 36 + 44 = 360 (vermutet), mit zwei Zeilen 424, unter 452 (960 x 540). Vorgabe an. Kein Eintrag in den normalen Menüs: Verkehr ist Belebung wie Vögel, die auch keinen Schalter haben.

### 3.3 Quellen-Formular

Seite `source`: eine Zeile „Straßen, WFS (ALKIS Nutzung)“ (`w2`) mit „Typ“ (`ave:Nutzung`) daneben, nur bei Art „Landesdienste“ (Klasse `lk`), plus 40 px. Die Seite hat heute 11 Zeilen Felder; bei 960 x 540 im Browser prüfen (vermutet Zoom um 0,85, wie heute minus 3 %). Wer das vermeiden will: Feld unter „Gebäude LoD2“ in dieselbe Zeile wie „Kachel km“ schieben geht nicht (schon belegt); Alternative: Feld „Oberfläche für Bäume“ und „Luftbild“ nebeneinander (je `w2` → je halbe Breite). Vorschlag: zuerst einfach anhängen, messen, bei Bedarf zusammenlegen.

## 4 Mehr Leben

### 4.1 Baumkronen im Wind (Vertex-Shader, keine neuen Daten)

- `rwModelMesh` (749-767): Kronendreiecke bekommen `nl = 1 + f`, `f` = Höhenanteil in der Krone (Unterseite 0,05, Ringe 0,2 / 0,45 / 0,75, Spitze 1,0). Der Welt-Shader normiert `vNor` (223), für Kronen (Alpha 0,08, 239-242) ändert sich nichts; die Länge nutzen nur Wände und Wasser (gesichert 263, 267).
- `VS` (43-56) bekommt `uniform float uTime, uGfx` (gleiche Namen wie im FS, ein Programm, keine neuen Einträge in `program(...)`): für `aCol.a` in 0,07 bis 0,1 und `uGfx > 0.5`: `f = clamp(length(aNor) - 1, 0, 1)`, Phase `ph = aPos.x*0.21 + aPos.z*0.17`, Versatz `w.xz += f*(vec2(0.9, 0.35)*0.18*sin(uTime*0.9 + ph) + 0.05*sin(uTime*2.6 + ph))`. Gemeinsame Windrichtung, je Baum eigene Phase, Spitze schwingt 0,2 m, Stamm steht. Kollision unverändert (Quader). Stufe Einfach unverändert (Regel).
- Kosten: etwa 12 Rechenschritte je Kronen-Vertex (Monschau 3 000 Bäume mal 48 Dreiecke): unter 0,5 ms GPU (Schätzung).

### 4.2 Boote (`src/boats.js`, ohne DOM)

- Nur echte Welt mit Wasser, nicht DIS (`ambOn`), auch nachts (mit Positionslicht, Kennung 0,75).
- Platz: bis 200 Zufallsproben im Umkreis 100 bis 600 m der Drohne auf nasse Zellen (`waterAt`); Freiraum in 8 Richtungen bis 60 m (`waterAt` je Meter) → Breite `b = 2*min`, Richtung = Richtung der größten Ausdehnung. Arten: `b < 6 m` nichts; 6 bis 20 m Kanu (4 m, 1,2 m/s, Wärme 0,7, Person); 20 bis 120 m Motorboot (7 m, 3 m/s, Wärme 0,5); ab 120 m Frachter (60 m, 2,5 m/s, Wärme 0,5). Rur: Kanu (vermutet 8 bis 15 m breit); Rhein: Frachter.
- Fahrt: Ziel 40 bis 80 m voraus; ist der Weg (Probe alle 2 m) nicht durchgehend nass mit Freiraum ≥ halbe Bootsbreite + 2 m, Kurs um ±20°, ±40°, ±60° drehen, sonst wenden. Höhe `groundH + WATER_UP + 0,05` (Wasserlinie; Spiegel liegt genau so, gesichert `rwWaterMesh`). Höchstens 3 Boote, Ersetzen ab 900 m.
- Netz: `MeshBuilder` (Rumpf als Quader mit angeschrägtem Bug aus `tri`, Kajüte, Kanu flach), ein Zeichenaufruf je Boot. Kein Kielwasser (später, Schön: kurze Linie).

### 4.3 Heißluftballon und Segelflieger (`src/ambient.js`)

- Ballon: höchstens einer; alle 3 bis 8 Minuten (`AMB.balloonGap`), zieht 3 bis 5 m/s mit dem Wind (gleiche Richtung wie der Kronenwind, Vektor (0,9/0,35)) in 120 bis 350 m über dem Boden am Startpunkt, leicht steigend und sinkend (Sinus), 2,5 km Strecke. Netz: Hülle als gestreckte `blob` (Radius 9 m, 20 Dreiecke mal 8), Korb als Quader, 4 Seile als `LINES` (wie die Ballonleinen heute). Farbe je Ballon aus Palette über `uOver`. Wärme 0,5 (Brenner heiß, aber groß: Mittelwert). Zwei Zeichenaufrufe.
- Segelflieger: höchstens einer; kreist wie ein Greifvogel (`newRaptor`-Logik) mit Radius 60 bis 120 m in 150 bis 300 m über dem Boden, 25 m/s, Querneigung 30° zur Mitte, nach 2 bis 4 Kreisen 600 m geradeaus zur nächsten „Thermik“ (neue Mitte 300 bis 700 m von der Drohne). Netz: vorhandenes Flugzeugmodell `airMesh.plane` (Jagd Flugzeuge) 1,6-fach, weiß über `uOver`, Wärme 0,3. Ein Zeichenaufruf.
- Nachts beide nicht (1.5). Tests wie `test/ambient.test.mjs`: über dem Boden, Abstand zur Drohne, Pausen.

### 4.4 Belebung und DIS (Entscheidung)

| Was | Spielkarte | Echte Welt | DIS-Übung | Begründung |
|---|---|---|---|---|
| Nachtmodus (Himmel, Licht, Fenster) | ja | ja | ja | Darstellung, kein Inhalt |
| Laternen | nein (später) | ja, mit Straßen und Ortslage | ja, wenn Straßen geladen | Ortsfeste Beleuchtung, kein bewegter Inhalt; im DIS-Ort kommen Straßen über dieselbe Landesquelle |
| Autos, Boote, Ballon, Segler | nein | ja | nein | Bewegter Inhalt, wie Vögel (`ambOn`); im DIS zählt nur der Partner |
| Baumkronen im Wind | (keine Kronen mit Kennung) | ja | ja | Darstellung |

## 5 Etappen

| Nr. | Etappe | Ziel | Dateien | Tests in Node | Browser-Prüfung | Aufwand (Annahme) |
|---|---|---|---|---|---|---|
| L1 | Baumkronen im Wind | Kronen schwingen ab Mittel, Stämme stehen, Einfach unverändert | `src/realworld.js` (Kronen `nl`), `src/render.js` (VS) | `test/rwtrees.test.mjs` oder `test/realworld.test.mjs`: Normale der Kronen 1 bis 2 lang, Wände und Wasser unverändert | Monschau Mittel/Schön/Einfach, Wärme und Nachtsicht, Kachel nachgeladen | S (eine Formel, zwei Dateien) |
| N1 | Nachtmodus | Schalter Tag/Nacht; dunkler Himmel mit Sternen und Mond, gedimmtes Licht, beleuchtete Fenster (beide Welten), Lichtkennung 0,75 mit Autolichtern der Jagd, Flare aus, Nachtsicht verstärkt, Wärme mit warmen Lichtern | `src/state.js` (`night`), `src/index.html`, `src/menu.js`, `src/render.js`, `src/vehicles.js` (Lichter Alpha 0,75), neu klein `src/daylight.js` (ohne DOM: `dayState(cfg)` liefert Lichtrichtung, Nebel, Faktoren) | `test/night.test.mjs`: `dayState` Tag/Nacht (Mond über dem Horizont, Nebel dunkel), `cfg` speichert und migriert; Fahrzeugnetz hat Lichtflächen mit Alpha 0,75 | Allgemein in vier Größen; Spielkarte und Monschau nachts in drei Stufen; Nachtsicht und Wärme nachts; Pause-Menü umschalten; kein Flackern der Fenster | M (Shader-Arbeit, Augenschein) |
| S1 | Straßengraph und Verkehr Monschau | Autos fahren in Monschau rechts auf den Achsen, über Brücken, bergauf langsamer; Debug-Schalter | neu `src/roads.js`, `src/traffic.js`; `src/vehicles.js` (`makeRoute` export, `routeAt` mit y), `src/realworld.js` (`roadH`, `rw.roads`, `rwRoadsRebuild`, `RW_SHOW`), `src/main.js`, `src/render.js` (`drawCar`), `tools/features.mjs` (`w`, `kind`), `realworld/monschau.features.json` | `test/roads.test.mjs`: Graph aus Kunst-Achsen (Zusammenfassen, T-Kreuzung, Zufallsweg lang genug ohne Kehre, Spur rechts, Profil schneidet an einem Kunst-Hindernis); Monschau: 20 Zufallswege, alle Proben höchstens 0,3 m über `roadH`, keine nasse Zelle ohne Deck, `W.free` bei 1,2 m; `test/traffic.test.mjs`: Autos bleiben 1 m an der Spur, Tempo in Grenzen, Ersetzen ab `far`, nichts in DIS und auf der Spielkarte | Monschau: Autos auf Straßen und Brücken, Debug aus/an, Wärme 0,85, Leistung; DIS: keine | M bis L |
| N2 | Lichter in der Stadt | Laternen in Ortslagen mit Lichtscheiben; Autos mit Licht und Lichtfläche (Schön) | `src/roads.js` (`lampSpots`), `src/realworld.js` (`rwNightMesh`), `src/render.js` (additive Scheiben, Netze je Kachel) | `lampSpots` Monschau: Abstand 35 m ± 5, höchstens 1 m neben der versetzten Achse, alle in einer Ortslage; Netz: Köpfe und Scheiben mit Alpha 0,75 | Monschau nachts: Laternen, Fenster, Autos; Nachtsicht: Lichter überstrahlen; Wärme: Laternen warm; Mittel ohne Lichtfläche, Einfach ohne Laternen | M |
| S2 | Straßen für geladene Orte | ALKIS-WFS je Gebiet und Kachel im Worker, Flächen → Achsen mit Namen und Breite, speichern, Nachladen; Feld im Quellen-Formular; Straßenname im OSD überall | `src/rwload.js` (Vorlage `roads`, Anfrage-Body, Adresse), `src/realworld.js` (`post` in `rwNet`, Abruf in `rwLoadLive`/`rwLoadTile`, Speichern), `src/geo.js` (`readGmlSurfaces`), neu `src/rwroads.js`, `src/rwworker.js`, `src/rwthread.js`, `src/srcui.js`, `src/index.html`, `src/menu.js` (Daten-Zeile) | `test/rwroads.test.mjs`: Kunst-GML mit Kreuz (zwei Rechtecke 8 m breit) → zwei Achsen, Schnitt in der Mitte ±1 m; L-Form; Ring mit Loch → Ringachse; Breite ±1 m; Name; Festdatei `test/fixtures/alkis-strassen.gml` (3 echte Flächen aus Monschau, etwa 10 KB) → Achsen innerhalb 2 m der Basis-DLM-Achsen; `test/rwload.test.mjs`: Body und Adresse; Rückfall GET filtert `nutzart` | Aachen laden: Autos nach wenigen Sekunden, Kachel nachgeladen bekommt Straßen, Namen im OSD; offline aus dem Speicher; Monschau unverändert; Formular in vier Größen | L (einzige neue Datenquelle) |
| L2 | Boote, Ballon, Segelflieger | wie 4.2 und 4.3 | neu `src/boats.js`; `src/ambient.js`, `src/render.js`, `src/main.js`, `src/world.js` (Netze über `MeshBuilder`, Bauhelfer im jeweiligen Modul) | `test/boats.test.mjs`: Monschau Rur Kanu auf nassen Zellen mit Freiraum, kein Boot ohne Wasser, Tempo; `test/ambient.test.mjs`: Ballon und Segler über dem Boden, Pausen, nachts keine, DIS keine | Monschau: Kanu auf der Rur; Köln (gespeichert): Frachter; Ballon und Segler mit verkürzten Pausen prüfen | M |
| S3 | Fahrzeuge des Taktischen Flugs und Verfolgung auf Straßen | Aufstellung aus `roadRoutes`/`parkSpots` mit Höhe; Modi frei, wenn Straßen da | `src/vehicles.js` (Aufstellung, `v.y`), `src/scenario.js`, `src/menu.js`, `src/render.js` | `test/vehicles.test.mjs`: Monschau-Aufstellung auf Achsen, über dem Boden, Treffer mit Höhe; Spielkarte unverändert (`test/spread.test.mjs`) | Monschau taktisch „Fahrzeuge“ und Parcours „Verfolgung“; Aachen mit und ohne Straßen (gesperrt mit Grund) | M |

Je Etappe wie immer: `npm run build`, `npm test`, Browser in vier Größen, `docs/PLAN.md` und `docs/prompt-historie.md` ergänzen, committen, berichten, anhalten.

### Reihenfolge und Begründung

L1 → N1 → S1 → N2 → S2 → L2 → S3.

- **L1 zuerst:** kleinste Etappe, sofort sichtbar in jeder echten Welt, kein Datenbedarf, fast kein Risiko. Sie führt die Technik „Länge der Normale trägt einen Wert“ für Kronen ein, die N2 nicht braucht, aber zeigt, wie billig Belebung im Vertex-Shader ist.
- **N1 vor Straßen:** Der Nachtmodus wirkt in beiden Welten und in Monschau ohne jede Datenquelle; er ist der größte sichtbare Gewinn je Aufwand. Die Lichtkennung 0,75 aus N1 nutzen N2, L2 und S1.
- **S1 vor N2:** Laternen brauchen den Graphen (Standorte am Straßenrand, Ortslage). Monschau hat die Achsen eingebettet, also kommt der ganze Verkehr ohne Netzabruf.
- **S2 nach N2:** die einzige Etappe mit neuer Datenquelle und neuem Algorithmus (Ausdünnen) und darum die unsicherste; bis dahin ist der Rest fertig und die Datenform (`roads`-Liste) durch Monschau festgelegt. S2 muss nur dasselbe Format liefern.
- **L2 danach:** unabhängig, mittlerer Nutzen; Boote brauchen nur das Wasser, das es gibt.
- **S3 zuletzt:** rundet den Taktischen Flug ab; hängt von S1 und S2 ab und berührt die Treffer-Logik (Physikschritt), darum mit Ruhe am Ende.

Wer nur eine Sitzung hat: L1 und N1 zusammen sind möglich (S + M), danach stoppen.

## 6 Offene Entscheidungen (der Umsetzer nimmt den Vorschlag)

1. **Nacht in beiden Welten und in DIS:** ja (Darstellung). Alternative: nur echte Welt.
2. **Zufallsautos ohne Kollision mit der Drohne:** ja, wie Vögel. Treffer nur mit den Fahrzeugen des Taktischen Flugs. Alternative: Kollision überall (Physik ändern, Tests).
3. **Straßenquelle geladene Orte:** ALKIS-WFS, POST mit Filter (0,3 MB), Rückfall GET (1 bis 1,5 MB). Basis-DLM-Achsen nur eingebettet für Monschau. Alternative: nur Monschau (S2 entfällt).
4. **Taktische Fahrzeuge gleich mit:** S1 bereitet das Format vor, S3 setzt um. Alternative: S3 in S1 ziehen (dann L).
5. **Taste für Tag/Nacht:** keine. Umschalten im Pause-Menü. Alternative: Taste in `KEY_FN` (kostet eine Zeile in Steuerung → Funktionen).
6. **Autos nur auf „Straßenverkehr“, nicht auf „Weg“:** ja (Feldwege ohne Autos, kleinere Datenmenge). Alternative: Wege mit langsamen Autos.
7. **Nachts keine Schwärme, Greifvögel, Ballons, Segler; Flugzeuge mit Blinklicht:** ja.
8. **Boote nach Wasserbreite** (ab 6 m Kanu, ab 20 m Motorboot, ab 120 m Frachter): ja, Zahlen Schätzung.
9. **Straßennamen im OSD auch an geladenen Orten** (aus ALKIS `name`): ja, kostet nichts extra.
10. **Laternen auf der Spielkarte:** nein, später (Kurs als Achse wäre möglich).
11. **Dämmerung stufenlos:** nein, nur Tag und Nacht (Menü klein, Shader einfach). Später `uNight` als Anteil 0 bis 1 ohne Umbau möglich, die Formeln sind schon Mischungen.
12. **Breite der Monschau-Achsen aus `BRF`:** versuchen; fehlt das Feld oder ist es leer, 5,5 m fest.
13. **Verkehr-Schalter im Debug-Reiter** statt im normalen Menü: ja.

## 7 Risiken

| Risiko | Einschätzung | Gegenmaßnahme |
|---|---|---|
| Leistung auf schwachen Rechnern und Handys (mehr Rechnung je Pixel, additive Scheiben, bis 15 Zeichenaufrufe mehr) | vermutet 3 bis 6 % bei Mittel; Scheiben decken wenige Pixel | Stufen wie 1.4; `adaptRes` senkt die Auflösung; nachts weniger Belebung (keine Schwärme); Verkehr-Schalter im Debug |
| Ausdünnen liefert Spuren über Parkplätze und Plätze, Achsen versetzt, Zweige | vermutet mittel | „Platz“ ausgeschlossen, Breite auf 12 m begrenzt, Zweige unter 12 m weg; Tests mit Kunstformen und drei echten Flächen; Autos schneiden Spuren an Hindernissen ohnehin |
| WFS: Zeit, Sperren, Obergrenze je Antwort, Ausfall | gesichert: 1 bis 2,5 s je km², bis 1 019 Flächen ohne Grenze; Last unbekannt | Abruf nebenläufig, Ergebnis gespeichert; Fehler nur als Zeile in Daten; ohne Straßen alles weiter wie heute |
| Datenmenge je Kachel | vermutet 20 bis 60 KB gespeichert, Abruf 0,3 bis 1,5 MB | POST-Filter zuerst; Kacheln laden ohnehin 15 bis 70 MB |
| Lizenz | NRW dl-de/zero-2.0 gesichert; andere Länder trägt der Nutzer ein | Vermerk „Geobasis NRW“ bleibt; Feld „Quellenvermerk“ im Formular |
| Brücken fehlen in LoD2 an geladenen Orten (Straße führt ins Wasser) | vermutet selten in NRW (Brücken als Platten gesichert) | Furt bis 12 m, sonst Spur schneiden; Test „keine nasse Zelle ohne Deck“ |
| Basis-DLM-Achsen Monschau schneiden LoD2-Ecken | vermutet selten | `laneProfile` schneidet |
| Menüplatz | Allgemein +0 px (Vorschlag), Debug +64 px, Quellen-Formular +40 px | Höhen oben; bei 960 x 540 messen; Formular bei Bedarf Zeilen zusammenlegen |
| Fensterflimmern nachts, Sterne flimmern beim Drehen | Fenster: gleicher Zufall wie heute (stabil); Sterne: `floor(d*700)` springt je Pixel bei Bewegung (Punktgröße ein Pixel) | Sterne über `smoothstep` auf den Zellabstand weich (2 Pixel), Schwelle hoch (wenige Sterne) |
| ASCII-Ausgabe `.aspx` | Namen mit Umlauten kommen aus Daten, nicht aus Code; Shader-Text ist ASCII | Build prüft wie bisher |
| Worker-Module | `rwroads.js` muss in `WK_MODS` und ohne DOM bleiben; `roads.js` importiert nichts aus `realworld.js` (Graph bekommt `roadH` und `W` von außen) | Regel wie `place.js`: Welt nur über Schnittstelle |
| Zufallsautos im Landeanflug | kein Treffer, aber optisch störend | Keine Spawns in den vorderen 30° der Kamera; Landeplätze liegen abseits von Straßen (`flatSpot` prüft `free`, nicht Straßen; vermutet selten auf einer Straße) |
