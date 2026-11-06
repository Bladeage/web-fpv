# Modus „Echte Welt“ (Planung, Stand 06.11.2026)

Ziel: Fliegen in einem echten Gebiet aus amtlichen offenen Geodaten (wie ein Flugsimulator mit echtem Gelände).
NRW als eingebettetes Beispiel (1 x 1 km). Weitere Bundesländer: Nutzer tragen die Adressen der Dienste selbst ein.

## Entscheidungen des Nutzers (Prompt 92)

- Beispiel NRW. Dienst-Adressen (WMS, WMTS, WCS, Gebäude) für andere Länder vom Nutzer einfügbar.
- Gebiet 1 x 1 km, Daten in die HTML eingebettet.
- Erste Etappen: Gelände mit Höhen, Luftbild als Boden, 3D-Gebäude (LoD2), Bäume und Wald.

## Geprüft (gesichert, 06.11.2026)

| Daten | NRW-Dienst | Format | 1 x 1 km |
|---|---|---|---|
| Gelände (DGM) | WCS `https://www.wcs.nrw.de/geobasis/wcs_nw_dgm`, Coverage `nw_dgm` | GeoTIFF, 32-Bit-Gleitkomma, LZW | 512 x 512 Punkte (2 m), 754 KB |
| Luftbild (DOP) | WMS `https://www.wms.nrw.de/geobasis/wms_nw_dop`, Ebene `nw_dop_rgb` | JPEG/PNG | 2048 x 2048 (0,5 m), 908 KB |
| Oberfläche (DOM, für Bäume) | WCS `https://www.wcs.nrw.de/geobasis/wcs_nw_dom` | GeoTIFF | ähnlich DGM |
| Gebäude LoD2 | `https://www.opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/lod2_gml/` (Kacheln 1 km, Name nach UTM-km) | CityGML | 1,5 bis 2,3 MB je Kachel |

- Koordinaten: UTM Zone 32 (EPSG:25832).
- CORS: WMS und WCS erlauben unsere Seite (`Access-Control-Allow-Origin` mit unserer Herkunft), der Download-Server erlaubt alle. Der Browser kann die Dienste also direkt abfragen.
- Lizenz NRW: „Datenlizenz Deutschland – Zero 2.0“, jede Nutzung ohne Bedingungen. Quellenangabe zeigen wir trotzdem („Geobasis NRW“).
- Beispielort (Vorschlag): Monschau, Altstadt im Flusstal, Ausschnitt E 304200 bis 305200, N 5603500 bis 5604500 (UTM 32).

## Aufbau

- Ein Werkzeug `tools/realworld.mjs` (nur Node-Bordmittel) lädt die Daten für ein Gebiet, wandelt sie in ein kompaktes Format und legt es ab. Der Build bettet es ein (wie Betaflight). Dieselben Lese-Funktionen (TIFF, GML) laufen auch im Browser, für vom Nutzer eingetragene Dienste.
- Höhen: 16 Bit in Dezimetern, gepackt mit deflate (Browser entpackt mit `DecompressionStream`, Bordmittel). Luftbild: JPEG. Gebäude: Dreiecke in Zentimetern, gepackt. Bäume: Punkte mit Höhe und Kronenbreite aus DOM minus DGM.
- Geschätzte Größe eingebettet: 2 bis 3 MB (Base64), HTML dann etwa 3,5 bis 4 MB.
- Kartenkoordinaten: Mitte des Gebiets = Ursprung, x nach Osten, z nach Süden, y = Höhe über dem Startpunkt.
- Physik: Boden ist nicht mehr überall y = 0, sondern `groundH(x, z)` aus dem Höhenmodell (mit Neigung). Nur im Modus „Echte Welt“; die übrige Karte bleibt unverändert.

## Stand RW1 (erledigt 06.11.2026, Prompt 93)

- Werkzeug `tools/realworld.mjs`: lädt DGM (WCS, 512 x 512) und Luftbild (WMS, 2048 x 2048) für Monschau, sucht den flachsten Startplatz, legt `realworld/monschau.{json,dgm,jpg}` ab (Höhen 16 Bit in dm, deflate: 274 KB; Luftbild 908 KB). Der Build bettet sie ein, HTML etwa 2,5 MB.
- `src/geo.js`: GeoTIFF-Leser (Streifen/Kacheln, LZW, Prädiktor 1/2/3, Gleitkomma) und WGS84 -> UTM. `src/realworld.js`: Gelände, `groundH`, `groundN`, Netz.
- Physik: Bodenkontakt gegen die Geländeebene unter jedem Teil der Hitbox (Höhe und Neigung). Im normalen Modus unverändert (flach bei y = 0).
- Darstellung: Gelände-Netz 4 m mit Luftbild, außen Rand bis 1,5 km; Spielkarte, Stadt, Ostereier und Vögel aus. Nebel dünner (1/700), kein Bodendunst. Kamera nie unter dem Gelände.
- Modus „Echte Welt“ im Menü (Freiflug), Start auf der Wiese über der Altstadt mit Blick zur Altstadt, Pilot auf dem Gelände.
- Tests: `test/realworld.test.mjs` (TIFF-Probe aus NRW, UTM, Gelände, Start, Abheben, Hang mit und ohne Schaden).

## Stand RW2 (erledigt 06.11.2026, Prompt 94)

- Gebäude: LoD2-Kacheln (CityGML, 4 Kacheln, 31 MB) im Werkzeug gelesen (`readLod2`, Dach- und Wandflächen, Ohrenschneiden `triangulate`), 6 323 Dach- und 14 444 Wand-Dreiecke, 16 Bit in dm, gepackt 145 KB.
- Bäume: Oberfläche (DOM, WCS `nw_dom`) minus Gelände; Spitze = höchster Punkt in 6 m Umkreis, mindestens 3 m, nicht auf Dächern (Dächer ins Raster gezeichnet). 3 033 Bäume (17 KB). Kronenradius 0,3 x Höhe (1,5 bis 5 m, Schätzung).
- Kollision: Jedes Teil der Hitbox gegen die nahen Gebäude-Dreiecke (Raster 8 m), Stoß immer zur Seite, auf der der Schwerpunkt war (Flächen sind dünn). Zusätzlich Strecken-Test gegen Durchtunneln bei schnellem Flug. Bäume: Quader für Stamm und Krone über die vorhandene Kollision. Absturz nach Schadensstufe wie bei anderen Hindernissen.
- Drehrate auf 80 rad/s begrenzt (Schätzung, nach sehr harten Stößen sonst instabil; SimITL begrenzt ebenso). Gemittelte Stoßrichtung null (enge Gasse): Richtung der tiefsten Berührung.
- Darstellung: Dächer und Baumkronen nehmen die Farbe aus dem Luftbild (Kronen etwas dunkler und grüner), Wände hell. Kronen rund (sechs Seiten).
- Tests: Wand langsam, Wand mit 40 m/s (kein Durchtunneln), Absturz mit Schaden, Landung auf dem Dach, Baumkrone, Rechenzeit (unter 60 ms je Sekunde Flug).
- Korrigiert: Tests nutzten die Schadensstufe „hard“, die es nicht gibt (es gilt dann „mild“); jetzt „real“.

## 3D-Mesh NRW (Befund 06.11.2026, Prompt 95)

Nutzer: LoD2-Gebäude sind so nicht nutzbar, Ziel ist eine Darstellung wie beim Digitalen Zwilling NRW (texturiertes 3D-Netz aus Luftbildern).

- Quelle: Geobasis NRW, 3D-Mesh, `https://www.opengeodata.nrw.de/produkte/geobasis/lusat/akt/3dmesh/3dmesh/` (Übersicht `mesh_meta.zip` mit GeoJSON der Teilgebiete). Monschau liegt in `Mesh_AC1443T45_nw_2025.slpk` (258 GB, Befliegung 07.03.2025).
- Zugriff: Teilabrufe (HTTP Range) und CORS `*` erlaubt. Das Paket muss nicht geladen werden, nur einzelne Dateien daraus.
- Format: SLPK = ZIP64 mit I3S 1.7 IntegratedMesh (meshpyramids), EPSG:25832, Höhe DHHN2016 (7837). Kein Hash-Index, das zentrale Verzeichnis (174 MB, 1,68 Mio. Einträge) muss einmal gelesen werden (im Werkzeug, 11 s).
- Je Knoten: `geometries/0.bin.gz` unkomprimiert (gzip; Kopf 8 Byte, dann Position Float32 x3 relativ zur Knotenmitte, UV Float32 x2, ohne Indizes), `geometries/1.bin.gz` Draco (nicht nötig), `textures/0.jpg` (Atlas bis 1024²). Knotenbaum in `nodepages/*.json.gz` (64 je Seite, OBB, lodThreshold).
- Mengen für Monschau (Knoten, die 1 x 1 km berühren): Stufe 14: 5 Knoten, ~120 000 Dreiecke, ~73 cm/Pixel. Stufe 15: 34 Knoten, ~39 cm/Pixel. Stufe 16: 73 Knoten, ~20 cm/Pixel. Stufe 17: 355 Knoten, ~7 cm/Pixel (je Knoten ~66 x 46 m, 396 KB Geometrie + 146 KB Textur). Stufe 18: 1 280 Knoten, ~4 cm/Pixel.
- Folgerung: Volle Schärfe wie beim Digitalen Zwilling geht nur mit Nachladen während des Flugs (nahe Knoten fein, ferne grob). Einbetten nur grob (Stufe 14) oder für ein kleines Gebiet.

## Stand M1 (erledigt 06.11.2026, Prompt 96)

- Entscheidung Nutzer: Nachladen im Flug plus grobe eingebettete Fassung; LoD2-Gebäude und Bäume werden ersetzt.
- Werkzeug `tools/mesh.mjs`: liest das SLPK per Teilabruf (zentrales Verzeichnis zwischengespeichert in `tools/.cache/`), Knotenbaum im Gebiet mit 150 m Rand: 2 725 Knoten, Stufen 1 bis 18. Index `realworld/monschau-mesh.json` (je Knoten Lage, Stufe, Radius, lodThreshold, Byte-Position und Länge von Geometrie und Textur im Paket, Lage der Box). Grobe Stufe 13 (~115 cm/Pixel): 78 391 Dreiecke, Positionen 16 Bit in dm und UV 16 Bit, gepackt 1,1 MB; Texturen 1,6 MB.
- Geprüft: Positionen sind relativ zur Knotenmitte in Landesachsen, die Drehung der Box gilt nicht für die Ecken (mit Drehung lagen Ecken bis 180 m unter dem Gelände). Mesh und Höhenmodell passen: 1 % der Ecken tiefer als 0,9 m unter dem Gelände, 10 % höchstens 0,3 m darüber.
- Darstellung: eigenes Shader-Programm (Textur mit Licht aus dem Luftbild, Nebel, Bildmodus). Höhenmodell unter dem Mesh 4 m abgesenkt, außen in voller Höhe.
- Physik: Kollision mit den Mesh-Dreiecken (Häuser, Bäume, Hänge als eine Fläche); Höhenmodell bleibt der Boden darunter.
- LoD2, Bäume und Luftbild nicht mehr eingebettet (Dateien entfernt; das Werkzeug `realworld.mjs` kann sie für andere Länder weiter erzeugen). HTML 5,3 MB.

## Gewässer (erledigt 06.11.2026, Prompt 97)

- Quelle: ATKIS Basis-DLM NRW (Shape-Gesamtpaket 4,7 GB, Teilabruf), Ebene `gew01_f` (Gewässerflächen). Werkzeug `tools/water.mjs`: Flächen im Gebiet als 1-m-Raster (Inseln trocken), gepackt 2,7 KB. Monschau: die Rur, 23 497 m².
- Darstellung: schlichte blaugraue Fläche 0,25 m über dem Höhenmodell (dort ist es die Wasserlinie).
- Physik: Berührt die Drohne die Wasserfläche, stürzt sie ab, immer (auch ohne Schadensmodell). Meldung „Ins Wasser gestürzt. R für Neustart“.
- Offen: schmale Gewässer sind im Basis-DLM nur Linien (`gew01_l`, 27 Achsen im Gebiet, z. B. die Rur flussaufwärts); mit einer angenommenen Breite ergänzbar.
- Weitere Daten im Gebiet (Basis-DLM, geprüft): 78 Straßenachsen, 21 Waldflächen, 20 Bauwerke an Gewässer und Verkehr (Brücken, Wehre), 1 Turm, 3 Schutzgebiete (Natur-/Umweltschutz), Hecken und Baumreihen.

## Kartenebenen (erledigt 06.11.2026, Prompt 98, nur Anzeige)

- Nutzer: schmale Gewässer, Straßenachsen, Wald, Brücken und Türme, vorerst nur darstellerisch, ohne Wirkung auf Funk oder Signal.
- Werkzeug `tools/features.mjs` (Basis-DLM per Teilabruf): `gew01_l` 33 Bachstücke, `ver01_l` 92 Straßenstücke, `ver06_l` 21 Brücken und Wasserbauwerke, `veg02_f` 31 Waldränder (Laub-, Nadel-, Mischwald), `sie05_p` 1 Turm (Eselsturm). Mit Namen, 45 KB, eingebettet.
- Darstellung: Bänder 0,5 m über dem Gelände (Bäche blau 2,5 m, Straßen gelb 1 m, Brücken orange 3 m, Waldränder grün 1,2 m), Säule 30 m über Türmen, im Bild Turmname mit Entfernung, in der Aufgabenzeile der Name der nächsten Straße oder des nächsten Gewässers (bis 30 m).
- Schaltbar im OSD-Menü: „Kartenlinien (echte Welt)“, seit Prompt 102 Vorgabe aus (Linien brechen die Immersion). Straßenname und Turmname hängen an „Nächster Ort“.
- Bäche lösen keinen Absturz aus (nur Anzeige); nur die Gewässerflächen (Rur) setzen die Drohne außer Gefecht.

## Neue Gestaltung (erledigt 06.11.2026, Prompt 99)

- Nutzer: Das Bild mit dem 3D-Mesh wirkt verschwommen und schlammig; Höhen und Tiefen sehen nicht gut aus. Die erste Fassung (Luftbild auf Höhenmodell) war besser. Lieber generische Gebäude mit Fassade und Fenstern, Wälder in der Farbe des Untergrunds, Vögel.
- Grundlage wieder Luftbild auf Höhenmodell (wie RW1), Luftbild jetzt 4096² (0,25 m je Pixel, vorher 0,5 m), 3,5 MB.
- Gebäude: Grundriss und Höhe aus LoD2, je Gebäude eine Nummer (`.bld` hängt sie hinter die Ecken). Je Gebäude eine Putzfarbe (6 Töne) und eine Dachfarbe (Schiefer, Ziegel, Grau). Fassade im Shader: Geschosse 2,9 m ab dem Sockel (Sockelhöhe steckt im Alpha der Wand), Fenster mit hellem Rahmen, Glas spiegelt je nach Blickwinkel, Sockel dunkler, weit weg weich zum Mittelwert (kein Flimmern).
- Bäume: Stamm und runde Krone (acht Seiten, drei Ringe). Farbe der Krone aus dem Luftbild darunter (unscharf gelesen), Licht weich. Das Luftbild ist ein Winterbild: Laubbäume wirken bräunlich, Nadelbäume dunkelgrün.
- Vögel auch in der echten Welt: Plätze auf Baumspitzen, Dächern und freier Wiese bis 260 m vom Start; Flugbogen hält Abstand zum Gelände (lange Wege 20 m).
- Das 3D-Mesh ist nicht mehr eingebettet. Werkzeug `tools/mesh.mjs` und die Dateien `realworld/monschau-mesh.*` bleiben für später.
- Datei: 6,3 MB (vorher 2,8 MB mit Luftbild 2048²).

## Koordinaten und nächster Ort im OSD (erledigt 06.11.2026, Prompt 101)

- OSD oben links (nur echte Welt, beide schaltbar, Vorgabe an): nächster Ort und Koordinaten.
- Ort: Ortslagen aus dem Basis-DLM (`sie01_f`, AX_Ortslage mit Namen) im Umkreis von 8 km, 23 Orte, Umrisse auf 10 m vereinfacht (64 KB in `monschau.features.json`). Im Ort: „ORT MONSCHAU“. Außerhalb: Name, Abstand zum Ortsrand, Richtung, zum Beispiel „MONSCHAU 210M O“. Läuft offline.
- Koordinaten: WGS84 in Grad mit 5 Stellen (etwa 1 m), zum Beispiel „50.55769N 6.24517E“. Umrechnung UTM → Breite/Länge in `src/geo.js` (`fromUtm`), im Test auf unter 1e-7 Grad genau gegen `toUtm`.
- „E“ statt „O“ für Ost, weil O neben Ziffern wie eine Null aussieht.

## Fehlerbild Altstadt (erledigt 06.11.2026, Prompt 102)

- Ursache „fragmentierte Fehler“ (gesichert): Die Wasserfläche bestand aus langen Streifen je Rasterzeile; deren Ecken lagen auf Uferhöhe, dazwischen tauchte der Streifen unter das Gelände (15 % der Ecken mitten im Fluss). Dazu grobe Tiefe in der Ferne (nahe Bildebene 0,02 m).
- Geprüft und unschuldig: Die Zerlegung der LoD2-Flächen (2 von 19.791 Flächen weichen ab, beide unter 10 m²).
- Lösung: Wasser als Raster 2 m, Spiegel über Wasser auf dem Flussbett, am Ufer auf dem tiefsten Wert der Umgebung; das Gelände bildet das Ufer. Leicht nach vorn gezogen. Nahe Bildebene in der echten Welt 0,06 m.
- Kartenlinien (bunte Bänder) standardmäßig aus.

## Fassaden nach Gebäudenutzung (erledigt 06.11.2026, Prompt 102)

- Quelle (gesichert): Die LoD2-Daten NRW enthalten je Gebäude die ALKIS-Gebäudefunktion (`bldg:function`, z. B. `31001_1000`) und die Dachform (`bldg:roofType`). Die Bedeutung der Codes ist gegen den ALKIS-WFS NRW (vereinfacht, Feld „funktion“ als Text) geprüft. Keine neue Quelle nötig.
- Klassen (`bldClass` in `tools/realworld.mjs`), Monschau: 0 Wohnhaus 342, 1 Wohnhaus mit Laden 112, 2 Garage/Carport/Überdachung 155, 3 Gewerbe/Versorgung/Parkhaus 60, 4 Landwirtschaft 36, 5 öffentlich (Schule, Museum, Polizei ...) 20, 6 Kirche/Kapelle/Burg/Turm 13. Flachdächer (Dachform 1000): 113.
- Darstellung (Maße und Farben Schätzung): Wohnhaus Putz mit Fenstern; mit Laden große Schaufenster im Erdgeschoss; Garage Tor mit Lamellen; Gewerbe Blech mit Rippen und Fensterbändern; Scheune Bretter und Tor; öffentlich größere Fenster, höhere Geschosse; Kirche/Burg Bruchstein, schmale hohe Fenster. Flachdächer und Garagendächer grau.
- Fachwerk: etwa ein Drittel der niedrigen Wohnhäuser (unter 13 m). Annahme, typisch für Monschau; die Daten sagen nichts über Fachwerk.
- Ablage: `.bld` hängt je Gebäude Klasse + 16 x Flachdach an. Im Netz trägt das Alpha der Wand Klasse und Sockelhöhe (`rwWallAlpha`, Test prüft die Rückrechnung in 32 Bit).

## Traufe, Vielfalt, Dächer aus dem Luftbild (erledigt 06.11.2026, Prompt 105)

- Traufe: Wanddreiecke eines Gebäudes in derselben Ebene bilden eine Wand; Traufe = höchster Punkt an den beiden seitlichen Enden (Giebel: Schultern). Die Höhe über dem Sockel steckt in der Länge der Normale (2 + Traufe/100). Der Shader zeichnet keine Fenster, Tore und Streben darüber und keine Fenster, die die Traufe schneiden würden.
- Vielfalt je Haus (Wohnhäuser, Fachwerk): Feldbreite 2,2 bis 3,1 m, Geschoss 2,7 bis 3,2 m, Fensterbreite und -höhe verschieden; Putz gedämpfter, dazu Schieferverkleidung; etwa jedes dritte Haus mit Erdgeschoss aus Bruchstein (Annahme, typisch für Monschau). Zufall aus der gerundeten Sockelhöhe (ungerundet gab es Pixelrauschen).
- Dächer: Farbe aus dem Luftbild an der Stelle (15 % Dachfarbe beigemischt), Licht weich. Befund: Das Luftbild zeigt viele Dächer hell (vermutet: Aufnahme im Winter, Reif oder Sonnenreflex auf Schiefer); am Rand eines Dachs kann Straße oder Fassade aus dem Bild stammen, weil das Luftbild kein echtes Orthofoto ist (vermutet).
- 384 Wanddreiecke ohne Fläche (aus LoD2) werden weggelassen.

## Recherche 3D-Dienste und Werkzeuge (06.11.2026, Prompt 101)

Gesichert = auf amtlicher Seite gelesen oder mit Origin bladeage.github.io geprüft. Vermutet = nicht geprüft.

- basemap.de 3D Gebäude (BKG): 3D Tiles aus LoD2 für ganz Deutschland, `.glb` ohne Draco, ohne Texturen, CORS erlaubt (gesichert). Beta-Lizenz: nur im laufenden Dienst, Speichern und Einbetten verboten (gesichert). Höchstens zur Laufzeit für andere Länder.
- basemap.de 3D Gelände DGM5: Terrain-RGB-PNG und Quantized Mesh, CORS erlaubt, gleiche Beta-Lizenz (gesichert).
- Mapterhorn: Terrarium-WebP bis Stufe 17, CORS `*`; in NRW ist die Quelle das DGM1 NRW, weltweit Copernicus 30 m (gesichert). Gut für Gebiete außerhalb NRW (vermutet).
- AWS Terrain Tiles: Terrarium-PNG, CORS `*` (gesichert), in Deutschland grob (vermutet).
- Sentinel-2 cloudless (EOX): 10 m, gewerblich nur mit Lizenz (gesichert). Nur für den fernen Horizont.
- NRW zusätzlich: LoD2 als SLPK, Landbedeckung (15 Klassen, WMS, CORS erlaubt) (gesichert).
- ALKIS vereinfacht (WFS NRW): Gebäudefunktion (Wohnhaus, Kirche, Parkhaus, Überdachung ...), dl-de/zero, CORS erlaubt (gesichert). Nutzbar für passende Fassaden (vermutet).
- Ortsnamen: Nominatim (höchstens 1 Anfrage je Sekunde, keine laufenden Abfragen) ungeeignet; GN250 des BKG (dl-de/by-2.0, Quellenhinweis Pflicht) als Alternative; umgesetzt sind die Ortslagen aus dem Basis-DLM (dl-de/zero).
- Betrachter und Wandler (CesiumJS, iTowns, Giro3D, MapLibre, deck.gl, 3DTilesRendererJS, OSM2World, pg2b3dm, py3dtiles, citygml-tools): offene Lizenzen (gesichert), aber für uns nicht nötig; Java/PostGIS/Python widersprechen „nur Node-Bordmittel“. OSM2World als Ideenquelle für Dachformen (vermutet).

## Etappen

- RW1: Werkzeug, eingebettetes NRW-Gelände mit Luftbild, Darstellung, Physik auf echtem Gelände, Modus „Echte Welt“ (Freiflug) im Menü, Quellenangabe.
- RW2: LoD2-Gebäude (Darstellung und Kollision), Bäume aus DOM minus DGM (Darstellung, Kollision vereinfacht).
- M2: Nachladen der scharfen Stufen (bis 17/18) rund um die Drohne aus dem SLPK (Teilabruf im Browser), Grafik und Kollision mit den feinsten geladenen Knoten.
- M3: Feinschliff (Übergänge, Speicher, Handy, Ladeanzeige, ohne Internet).
- RW3: Eigene Dienste: Eingabe von Mittelpunkt (Breite/Länge) und Adressen (WMS/WMTS für Luftbild, WCS für Höhen, Gebäude-Kacheln), Laden im Browser, Fehlermeldung bei fehlender CORS-Freigabe.
- RW4 (später): Aufgaben in der echten Welt (Tore, Jagd), Signal durch Gelände verdeckt.

## Risiken (vermutet)

- Andere Bundesländer: nicht jeder Dienst erlaubt CORS. Dann geht nur der Weg über das Werkzeug (vorab laden und einbetten).
- LoD2 hat viele kleine Flächen; Kollision nur vereinfacht (Hülle je Gebäude).
- Handy: großes Luftbild (4096², bei kleinerer Höchstgröße der Grafikkarte wird es verkleinert) und viele Gebäude-Dreiecke kosten Speicher und Leistung.
