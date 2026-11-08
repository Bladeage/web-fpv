# Modus „Echte Welt“ (Stand 06.11.2026)

Ziel: Fliegen in einem echten Gebiet aus amtlichen offenen Geodaten (wie ein Flugsimulator mit echtem Gelände).

## Überblick (aktueller Stand)

- **Eingebaut:** Monschau 1 x 1 km. Höhen (DGM, 2 m), Luftbild (DOP, 0,25 m), LoD2-Gebäude mit Fassaden nach Nutzung, Bäume aus DOM minus DGM, Rur als Wasser (Absturz), Ortsnamen, Kartenlinien (aus).
- **Live laden (L1 bis L4):** Modus „Echte Welt“ → „Ort laden“: Koordinate oder „Karte“. NRW als Vorlage; andere Länder unter Karte → „Quellen“. Mehrere Quellen an Landesgrenzen. Geladene Orte im Browser gespeichert („Gespeicherte Orte“, offline). Gewässer und Ortsnamen NRW einmal laden (60 MB).
- **Daten:** Optionen → Daten: Übersicht, Export und Import aller Geodaten als Datei (L4b).
- **Umgebung:** 10 x 10 km grobes Gelände mit Luftbild um jedes Gebiet (L5a).
- **Nachladen:** Gebäude, Bäume und feines Gelände in 1-km-Kacheln beim Fliegen (L5b).
- **Offen:** Mischen von UTM 32 und 33; Dienste anderer Länder ungeprüft.
- **Code:** `src/realworld.js` (Laufzeit), `src/rwload.js` (Laden, Quellen), `src/rwdlm.js` (Basis-DLM), `src/rwstore.js` (Speicher), `src/demap.js` und `src/mapui.js` (Karte), `src/srcui.js` (Quellen), `src/geo.js` (GeoTIFF, UTM, CityGML). Werkzeuge in `tools/`.
- Die Abschnitte unten sind das Protokoll in zeitlicher Reihenfolge; ältere Abschnitte beschreiben Zwischenstände (etwa das 3D-Mesh, „Ort laden (NRW)“).

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

## Live-Quellen: Plan (06.11.2026, Prompt 106)

- Nutzer: NRW als Beispiel mit allen Adressen als Vorlage; andere Länder trägt der Nutzer ein; mehrere Quellen (Landesgrenze); Basiskarte Deutschland; Ausschnitt 1 km² fest (Entscheidung), Reihenfolge wie vorgeschlagen.
- Kein Globus: alle Daten gelten für Deutschland, eine flache Karte reicht.
- Erst fester Ausschnitt, später Nachladen: Die Physik braucht Gelände, Häuser und Bäume vor der Drohne (100 km/h = 28 m/s), eine LoD2-Kachel NRW hat 10 bis 14 MB je km² (gesichert, Dateigröße).
- Etappen: L1 Laden per Koordinate (NRW). L2 Deutschlandkarte zum Auswählen (Ländergrenzen eingebettet, online basemap.de darunter). L3 eigene Quellen (Formular, mehrere Quellen, Grenzen, UTM 33, Prüfen, Import/Export). L4 Speichern im Browser (auch Gewässer und Ortsnamen einmal laden). L5 Nachladen beim Fliegen (Kacheln im Umkreis).
- CORS (gesichert, 06.11.2026): NRW WCS (DGM, DOM) und WMS (DOP) geben jeden Absender frei, auch `null` (lokal geöffnete Datei). LoD2-Kacheln und Basis-DLM-Paket: `*`, Teilabruf möglich. basemap.de WMS und WMTS: frei für bladeage.github.io.
- Basis-DLM im Browser (gesichert): Die Shape-Dateien liegen ungepackt im Paket, aber je Thema für ganz NRW (Gewässerflächen 28,5 MB, Ortslagen 31 MB, Straßen 1,1 GB). Für 1 km² zu viel; daher Gewässer und Ortsnamen erst in L4 (einmal laden und speichern).

## L1: Ort per Koordinate laden (erledigt 06.11.2026, Prompt 106)

- Menü „Echte Welt“: „Monschau (eingebaut)“ oder „Ort laden (NRW)“ mit Feld für Breite, Länge (Punkt oder Komma als Dezimalzeichen) und Knopf „Laden“ (nochmal drücken bricht ab). Fortschritt und Fehler stehen darunter. Start ohne geladenen Ort lädt erst; schlägt das fehl, geht es mit Monschau weiter.
- `src/rwload.js` (ohne DOM): Quellen (NRW als Vorlage), Adressen, Laden und Packen. Das Werkzeug `tools/realworld.mjs` nutzt denselben Code; die Monschau-Dateien sind damit Byte für Byte gleich geblieben (geprüft).
- Geladen werden Höhen (512², 2 m), Oberfläche (für Bäume), Luftbild (4096², 0,25 m) und die LoD2-Kacheln, die das Gebiet berühren (mit Gebäudenutzung). Ohne Gewässer und Ortsnamen (siehe L4).
- Test im Browser (gesichert): Aachen, Dom (50.7753, 6.0839): 21 s, 2688 Gebäude, 1430 Bäume, Dom gut erkennbar. Datenmenge (gesichert beim Polieren): die vier LoD2-Kacheln um den Dom haben 44, 13, 69 und 46 MB, zusammen rund 170 MB; Monschau 14 MB. Bei langsamem Netz dauert eine Innenstadt also Minuten (Schätzung: 16 Mbit/s etwa 90 s). Abhilfe: Speichern im Browser (L4). Fehler dabei gefunden und behoben: große Innenstadt-Kacheln sprengten mit `push(...liste)` den Aufrufstapel.
- Fehlermeldungen: keine Quelle für den Ort, keine Verbindung (offline oder gesperrt), Dienst meldet Fehler (Text aus der Antwort), falsche Rastergröße, Abbruch. Das alte Gebiet bleibt dabei erhalten.
- Grafik: neues Gebiet (rw.ver) gibt Netze und Luftbild frei und baut sie neu.

## L2: Deutschlandkarte zum Auswählen (erledigt 06.11.2026, Prompt 107/108)

- Menü „Echte Welt“ → „Ort laden (NRW)“ → „Karte“. Ziehen verschiebt, Mausrad, Knöpfe +/− oder zwei Finger zoomen (1 m bis 3 km je Bildpunkt), „DE“ zeigt ganz Deutschland. Klick oder Tippen setzt den Mittelpunkt, das Quadrat zeigt 1 x 1 km. „Laden“ übernimmt den Punkt und lädt sofort.
- Am Anfang nur Grenzen (Wunsch Nutzer). Das Land des gewählten Punkts wird rot umrandet, leicht getönt und beschriftet. Länder mit hinterlegter Quelle (bisher NRW) sind grün getönt. Ohne Quelle bleibt „Laden“ gesperrt, mit Hinweis auf L3.
- Grenzen: BKG VG2500 (Stand 01.01.2026), Datenlizenz Deutschland Namensnennung 2.0, vereinfacht (Douglas-Peucker 400 m, 100 m Raster), 69 KB, eingebettet (geht offline). Quellenvermerk mit Links unter der Karte (Pflicht laut Nutzungsbedingungen, gelesen).
- Hintergrund online: basemap.de WMS (Farbe, UTM 32), CC BY 4.0, ein Bild je Ansicht (kurz nach der letzten Bewegung). Ohne Netz: Hinweis, nur Grenzen.
- Quelle gilt nur im eigenen Land (gesichert, Test): Das Rechteck der NRW-Quelle reicht bis Belgien und Niedersachsen; mit Karte prüft rwSourceAt das Land.
- Geprüft: Logik in Node (Land an bekannten Orten, Ausland, Zoom hält den Punkt), Ablauf im Browser (Klick bei Aachen, Laden 17 bis 20 s), Menü passt auf allen vier Größen, auch nach der Auswahl.

## L3: Eigene Quellen (erledigt 06.11.2026, Prompt 109)

- Menü: Karte → „Quellen“. Liste mit eigenen Quellen und Vorlagen (NRW). „Neu“, „Kopie“ (Vorlage als Muster), „Bearbeiten“, „Importieren“, „Exportieren“ (Datei `fpv-quellen.json`, Format `fpvsim-quellen` Version 1).
- Formular: Name, Bundesland, Koordinatensystem (UTM 32 oder 33), Höhen (WCS, nötig), Oberfläche für Bäume (WCS), Luftbild (WMS), Gebäude LoD2 (Muster mit {E} {N} in km, Kachelgröße), Quellenvermerk. „Prüfen“ macht kleine Abrufe je Ebene am gewählten Ort oder in der Landesmitte und meldet je Ebene ok oder den Fehler (Gebäude nur als Teilabruf der ersten 5 KB). „Speichern“ prüft die Pflichtfelder.
- Eigene Quellen liegen im Browser (Einstellungen) und gelten vor den Vorlagen. Das Rechteck einer Quelle kommt aus dem Umriss ihres Landes.
- Landesgrenze: Hauptquelle am Mittelpunkt; dazu jede Quelle eines Landes, das das Gebiet berührt (Probe auf 5 x 5 Punkten), wenn sie dasselbe Koordinatensystem hat. Andere (UTM 32 neben 33, etwa Thüringen/Sachsen) bleiben außen vor, mit Hinweis.
- Zusammensetzen: Raster 64 x 64 Zellen (16 m), jede Zelle gehört der Quelle ihres Landes. Höhen und Oberfläche je Bildpunkt aus der Quelle der Zelle; fehlt dort ein Wert, aus der nächsten mit Wert. Luftbild im Browser: Canvas, je Quelle ihre Zellen. Gebäude aus der Quelle der Zelle, in der ihre Mitte liegt (keine doppelten Häuser). Quellenvermerke aller Quellen.
- Gesichert (06.11.2026): Der NRW-Dienst liefert über die Grenze hinaus gültige Höhen und Luftbild (Dreiländereck Vaals geprüft). Ob andere Länder außen Füllwerte liefern, ist offen; das Zusammensetzen deckt beides ab.
- Geprüft: Tests mit künstlichen Quellen (Lücke gefüllt, Gebäude je Land, Luftbild-Zusammensetzen aufgerufen), Planung an echten Grenzen (NRW/Niedersachsen bei Minden, Thüringen/Sachsen), Datei lesen mit Fehlern. Im Browser: NRW-Vorlage kopiert und geprüft; Ladetest an der Grenze NRW/Niedersachsen mit einer Testquelle (43 s). Werkzeug Monschau weiter Byte für Byte gleich.
- Offen: echte Dienste anderer Länder sind nicht als Vorlage hinterlegt (Nutzer trägt sie ein); Mischen von UTM 32 und 33 in einem Gebiet.

## Polieren nach L3 (erledigt 06.11.2026, Prompt 110)

- Zweiter Prüfer (Agent, nur lesen) über alle Änderungen seit dem Wasser. Funde und Lösung:
  1. Lücken ohne Werte (Grenze, Quelle ohne Oberfläche) wurden zu Bäumen auf fast jedem Bildpunkt (bis 256 000, Absturz des Browsers möglich). Jetzt: ohne Wert kein Baum. Test.
  2. Ein ungültiger Wert am Start machte das ganze Gelände ungültig (NaN). Jetzt: ungültige Höhen werden vor dem Packen durch den tiefsten Wert ersetzt, der Start meidet Fenster mit Lücken; ganz ohne Höhen gibt es eine Fehlermeldung. Test.
  3. Start während des Ladens brach das Laden ab. Jetzt: Start wartet. Im Browser geprüft.
  4. Kartenwahl während des Ladens brach ab, ohne neu zu laden. Jetzt: der neue Ort ersetzt das laufende Laden.
  5. „Weiterfliegen“ nach dem Laden eines neuen Orts ließ die Drohne an der alten Stelle im neuen Gelände. Jetzt: Neustart am neuen Startplatz.
  6. Abbruch während des Zusammensetzens der Luftbilder wurde übergangen. Jetzt beachtet.
  7. Quellen ohne Bundesland, Oberfläche ohne Coverage-ID oder Luftbild ohne Layer wurden beim Import angenommen. Jetzt abgelehnt mit Grund. Test.
- Fortschritt beim Laden in MB (Gebäudekacheln, Luftbild). Hinweise im Menü, Hilfe und README nennen Karte und Quellen. Datenmenge Innenstadt korrigiert (siehe L1).

## L4: Speichern im Browser, Gewässer und Ortsnamen (erledigt 06.11.2026, Prompt 111)

- Jeder live geladene Ort wird im Browser gespeichert (IndexedDB `fpvsim-echtewelt`, Bereiche `areas`, `info`, `land`): Höhen, Gebäude, Bäume, Luftbild, Gewässer, Orte, wie die eingebetteten Daten. Monschau-Altstadt: 4 MB. Schlüssel: Breite, Länge (5 Stellen) und Namen der Quellen.
- Modus-Seite: Auswahl „Gespeicherte Orte“ (neueste zuerst, mit Größe). Ein gespeicherter Ort öffnet ohne Netz (geprüft: Netz im Browser ganz gesperrt, 0 s). Auch „Laden“ mit gleicher Koordinate nimmt den Speicher.
- Gewässer und Ortsnamen: Quellen mit Landesdaten (NRW: Basis-DLM, Feld `dlm`) zeigen unter Karte → Quellen → „Speicher im Browser“ die Zeile „Gewässer und Ortsnamen“: einmal laden (Teilabrufe aus dem ZIP, gew01_f.shp, sie01_f.shp, sie01_f.dbf, zusammen 60 MB, hier 6,5 s) oder löschen. Danach bekommt jeder neu geladene Ort Wasser (Absturz bei Landung) und den nächsten Ort im OSD; gespeicherte Orte bekommen es beim nächsten Öffnen. Schlüssel der Landesdaten ist die Paket-Adresse (eine Kopie der Vorlage nutzt dieselben Daten).
- `src/rwdlm.js` (ohne DOM): ZIP-Inhaltsverzeichnis (ZIP64), Shape und DBF lesen, Gewässer rastern, Orte ausschneiden. Gesichert: Für Monschau entsteht genau dieselbe Gewässermaske und dieselbe Ortsliste wie in den eingebetteten Dateien (Werkzeuge water.mjs und features.mjs).
- `src/rwstore.js`: Speicher; ohne Speicher (privates Fenster) lädt das Programm wie bisher nur aus dem Netz.
- Speicher-Bereich zeigt gespeicherte Orte (einzeln löschen) und den belegten Platz (Schätzung des Browsers).
- Geprüft: Tests mit selbst gebautem ZIP, Shapefile und DBF (Teich mit Insel, Orte im Umkreis), Laden mit Speicher ohne Netz, Landesdaten nachträglich. Im Browser der ganze Ablauf mit echten Diensten; Menüs passen auf allen vier Größen (bei „Ort laden“ ist die allgemeine Beschreibung ausgeblendet, dl-de/zero verlangt keinen Quellenvermerk).

## Housekeeping (06.11.2026, Prompt 112)

- Fehler behoben (gesichert, im Code gefunden): Bei live geladenen Orten mit Landesdaten gibt es nur Ortsnamen, keine Straßen und Bäche; der Straßenname in der Aufgabenzeile warf dann im Flug in jedem Bild einen Fehler. Test.
- Rauchtest im Browser: Monschau, live mit Landesdaten, aus dem Speicher mit Weiterfliegen; je vier Durchgänge (Grafik einfach bis schön, Drohnen- und Verfolgerkamera, Wärmebild und Nachtsicht, Kartenlinien an): keine Fehler.
- Gespeicherte und geladene Orte heißen mit Landesdaten nach der nächsten Ortslage (bis 2 km), etwa „Monschau · 50.55470, 6.24250“.

## L4b: Optionen mit Reiter „Daten“ (erledigt 06.11.2026, Prompt 117)

- Modus → Spezial → Echte Welt → „Optionen“ (oder Karte → „Quellen“): Seite „Echte Welt: Optionen“ mit Reitern „Daten“ und „Quellen“ (die bisherige Quellen-Seite).
- **Daten:** Übersicht je Art mit Anzahl und Größe: gespeicherte Orte, Höhen, Luftbild, Gebäude, Bäume, Gewässer, Landesdaten, Speicher im Browser gesamt. Darunter Landesdaten laden oder löschen und die gespeicherten Orte zum Löschen.
- **Export:** alle gespeicherten Orte und Landesdaten in einer Datei `fpv-geodaten-<Datum>.fpvgeo` (eigenes Format: Kennung, Kopf als JSON, Datenblöcke; im Browser mit gzip gepackt). Monschau-Altstadt: 4 MB; mit Landesdaten NRW etwa 64 MB.
- **Import:** dieselbe Datei an einem anderen Rechner; die Orte stehen danach unter „Gespeicherte Orte“ und öffnen ohne Netz. Schlägt das Laden fehl, weil kein Server erreichbar ist, bietet die Meldung den Knopf „Geodaten importieren“ an.
- Geprüft: Hin und zurück verlustfrei (Test), fremde und abgeschnittene Dateien abgelehnt (Test). Im Browser zwei getrennte Profile: A lädt und exportiert, B ohne Netz bekommt den Import angeboten, importiert und fliegt den Ort, ohne Fehler. Menüs passen auf allen vier Größen.

## L5a: Umgebung 10 x 10 km (erledigt 06.11.2026, Prompt 118)

- Problem (Bild des Nutzers, Köln): Hinter dem 1-km-Gebiet begannen sofort die gerechneten bunten Felder.
- Lösung: Zu jedem Gebiet lädt das Programm eine grobe Umgebung von 10 x 10 km: Höhen alle 25 m (WCS, 401², etwa 200 KB) und Luftbild 2048² (knapp 5 m, etwa 0,9 bis 1,4 MB). Zusammen etwa 5 s (gesichert, Monschau und Köln). Lücken (Füllwerte im Nachbarland) werden vom Rand her gefüllt.
- Raster: 401 Zellen über 10 025 m legen die Messpunkte auf -5000, -4975 … 5000 m; die Ränder des Gebiets (±500 m) liegen damit genau auf Messpunkten. Das feine Netz endet genau am Rand, das grobe hat dort ein Loch: keine Risse, keine Überlappung (Test).
- Bodenhöhe: im Gebiet das feine Raster, außen die Umgebung, innen am Rand 30 m weicher Übergang (Sprung unter 5 cm, Test). Die Physik nutzt dieselbe Höhe; außen ist das Gelände also nicht mehr flach.
- Bild: Luftbild der Umgebung als zweite Textur, am Rand des Gebiets weich ins feine Bild, am Rand der Umgebung über 300 m in den gerechneten Boden. Sicht in der echten Welt bis 9 km, leichter Dunst (Nebel 1/2200).
- Gespeichert und exportiert mit dem Ort (farq, fardop). Monschau eingebaut: `realworld/monschau.far` (198 KB) und `monschau.far.jpg` (912 KB); die Datei wächst auf 8,0 MB.
- Noch nicht: Gebäude und Bäume außerhalb des Gebiets (L5b).

## L5b: Gebäude und Bäume beim Fliegen nachladen (erledigt 06.11.2026, Prompt 118)

- Kacheln von 1 km im Raster des Startgebiets (höchstens 4 Kacheln weit, also innerhalb der Umgebung). Laden, sobald die Drohne näher als 300 m an eine fehlende Kachel kommt; entladen ab 1,6 km; höchstens 8 Kacheln. Eine nach der anderen; ohne Netz 60 s Pause je Kachel. Schalter: Optionen → Daten → „Beim Fliegen nachladen“ (Vorgabe an).
- Je Kachel: feines Gelände (512²), Luftbild 2048² (spart Grafikspeicher), LoD2-Gebäude mit Nutzung, Bäume, Wasser (mit Landesdaten). Aus dem Speicher, sonst von den Diensten; danach gespeichert (in der Liste als „Nachgeladene Kacheln“, nicht als Orte).
- Bodenhöhe: Kachel am Punkt; weich in die Umgebung nur an Rändern ohne geladenen Nachbarn. Kollision: Gebäude und Bäume aller Kacheln in einem Raster. Umgebung bekommt Löcher für alle Kacheln.
- Ruckeln: LoD2 wird in Häppchen von 5 ms gelesen. Netzaufbau höchstens ein großer Schritt je Bild; Messung in Node (Monschau als Kachel): Kachel-Gelände 69 ms, Gebäude und Bäume 158 ms, Startgebiet 50 ms, Umgebung 84 ms (vorher 180, 263, 182, 128 ms, alles in einem Bild). Kachel-Suche über Zahlen statt Text. In der Software-Grafik der Testumgebung stockt das Bild auch ohne Nachladen bis 10 s; dort nicht messbar.
- Geprüft: Test ohne Netz (Planung, Laden aus dem Speicher, Rand, Kollision, Entladen); im Browser Monschau mit nachgeladener Kachel östlich (19 s).

## Kamera unter dem Gelände, Bäume auf Brücken (06.11.2026, Prompt 119/120)

- Kamera: Das gezeichnete Gelände (Ecken alle 4 m) liegt am Hang über der berechneten Höhe (gemessen Monschau: bis 4 m, an 32 % der Punkte über 3,5 cm; volle Auflösung hilft nicht genug: 7 %, bis 1,3 m). Die Kamera hält jetzt 3,5 cm Abstand zur gezeichneten Fläche (`rwSurfaceH`, gleich dem Netz auf 1 mm, Test).
- Brücken: Oberfläche minus Gelände macht Brücken ohne LoD2 zu „Bäumen“ (Hohenzollernbrücke). Eine Form-Regel (Krone fällt ringsum ab) wirkte nicht (Bögen fallen auch ab; 17 vorher und nachher). Jetzt: Baumspitzen über Wasser werden verworfen (wirkt mit Landesdaten). Monschau: kein Baum betroffen.

## Automatisch und wiederverwenden (erledigt 06.11.2026, Prompt 121)

- Landesdaten (Gewässer, Ortsnamen, etwa 60 MB) lädt das Programm beim ersten live geladenen Ort mit Landesdaten-Quelle automatisch, nur wenn sie noch nicht im Browser liegen. Fehlschlag bricht das Laden des Orts nicht ab.
- LoD2-Gebäudekacheln (1 km, bis 70 MB Text) werden einmal zerlegt und kompakt gespeichert (IndexedDB-Bereich `lod2`, Punkte 32 Bit relativ zur Kachelecke, je Gebäude Nutzung, Dachform und Mitte). Nachbarorte und Nachladekacheln, die dieselbe Gebäudekachel berühren, nehmen sie aus dem Speicher. Auswahl der Gebäude wie bisher nach ihrer Mitte (Test: gleiche Gebäude mit und ohne Zwischenspeicher). Zwischenspeicher, nicht im Export; unter Optionen → Daten löschbar.
- Nachladekachel: liegt an derselben Stelle schon ein gespeicherter Ort, wird er genommen.
- Geprüft im Browser mit leerem Speicher: Ort 1 in Monschau 22 s mit Landesdaten (Wasser, 23 Orte, Name „Monschau · …“); Ort 2 600 m daneben 10 s, keine Gebäudekachel aus dem Netz; 4 Gebäudekacheln belegen 2 MB.

## Gespeicherter Ort ohne Nachladen (06.11.2026, Prompt 123)

- Ursache (gesichert im Code): Nachladen beim Fliegen braucht die Umgebung (`rwStreamStep` prüft `rw.far`). Orte, die vor L5a (Version 1.116) gespeichert wurden, haben keine Umgebung. Ebenso Orte, bei denen die Umgebung beim Laden nicht erreichbar war. Diese Orte luden nie nach.
- Jetzt: Fehlt einem gespeicherten Ort die Umgebung, holt das Programm sie beim Öffnen nach (etwa 1 MB) und speichert sie dazu. Ohne Netz öffnet der Ort wie bisher; das Menü zeigt dann „Ohne Umgebung, kein Nachladen (offline?)“. Test ohne Netz und mit Testdaten.

## Nachladen stabil (06.11.2026, Prompt 124, Prüfbericht Etappe 1)

- Kollisionsraster: nur belegte Zellen (vorher ein volles Feld bis zur weitesten Kachel). Messung in Node, Monschau als Kachel 4 km entfernt: 23 ms und 16 MB statt 265 ms und 164 MB bei jeder neuen Kachel. Doppelte Dreiecke erkennt ein Feld fester Größe statt einer wachsenden Map.
- Abrufe: Abbruch nach 30 s ohne Daten (Stillstand, nicht Gesamtdauer; große Gebäudekacheln dürfen lange laden). Ein Gebietswechsel bricht laufendes Nachladen ab. Fehler beim Nachladen erscheinen einmal im Bild („Nachladen gestört: …“), neuer Versuch nach 60 s.
- Speicher: Hält ein anderer Tab eine ältere Version offen, wartet das Programm nicht mehr ewig.
- Kartenrand (gesichert im Code): Umgebung 10 x 10 km um den Start, Nachladen bis 4,5 km. Ab 300 m vor dem Rand der Umgebung (5 km) geht das Luftbild in gerechnete Felder über. Mitwandern der Umgebung ist offen (Prüfbericht Nr. 16).
- Geprüft: Tests ohne Netz (Zeitgrenze, Abbruch, gleiche Zellenzahl nah und fern); im Browser Monschau mit nachgeladener Kachel über die echten Dienste.

## Eine Bodenfläche für Physik und Bild (06.11.2026, Prompt 125, Prüfbericht Etappe 2)

- `groundH` liefert jetzt die gezeichnete Fläche: dieselben Dreiecke wie die Netze (fein alle 4 m, Umgebung alle 25 m, Rand bis 15 km). Die Netze selbst bauen auf den gemessenen Höhen (`rwSampleH`, bilinear, weich in die Umgebung). Damit stehen Drohne, Verfolgerkamera, Pilot, Vögel und Bäume auf dem, was man sieht. Vorher lag das Bild am Hang bis 4 m über der Physik; nur die FPV-Kamera war korrigiert.
- Wasser: Der Spiegel richtet sich nach der gezeichneten Fläche. Vorher lagen 8 % der Ecken mitten im Fluss darunter (Monschau, gemessen). Aufbau schneller (103 statt 135 ms), weil jede Zellenhöhe nur einmal gerechnet wird.
- Bäume nachgeladener Kacheln stehen auf der Fläche mit Rand zur Umgebung (vorher eigene Höhen ohne Rand).
- Kosten: `groundH` etwa 0,6 µs statt 0,13 µs; Physik und Netze unverändert schnell (gemessen in Node).
- Bekannt: Am Rand Gebiet/Umgebung treffen sich verschieden dichte Netze, Stufe bis 0,12 m (Prüfbericht Nr. 17).
- Geprüft: Test „Drohne am steilsten Unterschied von Netz und Messwerten liegt auf dem Netz“ (unabhängig aus dem Netz nachgerechnet), Wasser-Test gegen die gezeichnete Fläche, Browser mit Nachladen über die echten Dienste.

## Grafik und Speicher robust (06.11.2026, Prompt 127, Prüfbericht Etappe 3)

- Grafikverlust (Treiber, voller Grafikspeicher, Handy im Hintergrund): Hinweis „Grafik unterbrochen, wird neu gestartet“, der Flug ruht, bei Rückkehr wird alles neu aufgebaut (Welt, echte Welt, Kacheln, Luftbilder). Nach 8 s zusätzlich „Seite neu laden“. Dabei behoben: Der Neuaufbau hätte die Tore doppelt angelegt.
- Luftbilder im Grafikspeicher: Auf Handys und Geräten mit höchstens 4 GB Hauptspeicher (Angabe des Browsers) Startgebiet 2048², Umgebung und Kacheln 1024². Schätzung: etwa 70 statt 280 MB (RGBA mit Mipmaps). Die Bilder werden nach dem Hochladen freigegeben.
- Speicher im Browser: Nachgeladene Kacheln höchstens 400 MB (Schätzung, etwa 100 bis 200 Kacheln); die am längsten nicht genutzten gehen zuerst, wieder genutzte Kacheln werden aufgefrischt. Meldet der Browser über 90 % belegt, gehen zuerst alte Kacheln, dann zerlegte Gebäudekacheln. Schlägt das Schreiben fehl: Platz schaffen und nochmals versuchen, sonst im Menü „nicht gespeichert: Speicher im Browser voll oder gesperrt“. Eigene Orte und Landesdaten löscht nur der Nutzer. Optionen → Daten zeigt den freien Platz.
- Geprüft im Browser: Kontextverlust auslösen und zurückholen (Spielkarte und Monschau zeichnen wieder, Tore 8, Flugzeit ruht); Speicher mit knapp gemeldetem Platz (die zwei ältesten Kacheln gelöscht, die wieder genutzte bleibt); Monschau auf einem nachgebildeten Handy.

## Rechenarbeit im Hintergrund (06.11.2026, Prompt 129, Prüfbericht Etappe 5)

- Ein Web Worker rechnet beim Laden eines Orts und beim Nachladen: Abrufe, Höhenraster, Gebäudekacheln (bis 70 MB Text je km², bleiben ganz im Worker), Bäume, Umgebung. Dazu das Netz der Gebäude und Bäume je Kachel. Das Hauptprogramm bekommt nur die fertigen Felder.
- Eine Datei ohne externe Quellen: Der Worker entsteht aus dem eigenen Script (`rwthread.js` nimmt die Module ohne DOM, ersetzt die eingebetteten Daten durch Platzhalter, etwa 300 KB). Geht das nicht (Entwicklung mit Modulen, Seite verbietet Worker, Worker fällt aus), rechnet das Hauptprogramm wie bisher.
- Mehrere Quellen an Landesgrenzen setzen Luftbilder mit einem Canvas zusammen: Dieser Fall bleibt im Hauptprogramm.
- Gemessen im Browser (Kachel Köln Innenstadt, 1 344 Gebäude, echte Dienste): längste Blockade des Hauptprogramms 41 statt 119 ms, Summe der Blockaden über 50 ms 0 statt 556 ms.
- Noch im Hauptprogramm: Neuaufbau von Umgebung und Startgebiet nach jeder neuen Kachel (in Node etwa 100 und 80 ms), Kachel-Gelände (37 ms), Wasser, Kollisionsraster (20 bis 50 ms).
- Geprüft: Node-Test führt den Worker-Quelltext aus dem echten Build abgeschottet aus (gleiches Netz wie direkt, gleiches Gebiet, Fehlertexte); im Browser als lokale Datei: Worker startet, Kachel lädt.

## Umgebung wandert mit (07.11.2026, Prompt 132, Prüfbericht Nr. 16)

- Vorher lag die Umgebung (10 x 10 km grob) fest um den Start; ab 5 km kamen gerechnete Felder, Kacheln nur bis 4,5 km.
- Jetzt hat die Umgebung eine eigene Mitte. Ist die Drohne mehr als 1,5 km davon entfernt (größerer der beiden Abstände), wird eine neue Umgebung um sie geladen. Die Mitte liegt im 1-km-Raster, so bleiben Messpunkte (25 m) und Kachelränder deckungsgleich. Nachladen der Kacheln bis 4 km um die jeweilige Mitte, höchstens 60 km vom Start.
- Laden: aus dem Speicher (Schlüssel Ort und Quelle mit „|umgebung“, Zwischenspeicher wie Kacheln, zählt zur 400-MB-Grenze), sonst von den Diensten im Hintergrund-Thread (Höhen 401², Luftbild 2048², etwa 2 MB). Fehler: alte Umgebung bleibt, 60 s Pause für diese Mitte, Hinweis im Bild.
- Zeichnen: Die alte Umgebung bleibt, bis Netz und Luftbild der neuen fertig sind; dann tauschen beide zusammen (kein Versatz des Bildes). Physik nutzt die neue sofort; nahe der Drohne decken sich beide.
- Geprüft: Test in Node (keine Bewegung nahe der Mitte, neue Mitte aus dem Speicher und von den Diensten, Kachel 6 km weg erst danach erlaubt, Fläche gleich dem Netz, ohne Netz bleibt die alte); im Browser mit den echten Diensten von Monschau 7 km nach Osten (Mitte 2, 4, 6 km, Kacheln 6 und 7 geladen, Luftbild bis zum Horizont, keine Fehler).

## Kamera am Boden (07.11.2026, Prompt 138)

- Fehlerbild: Start in der echten Welt, hinter dem Menü sah man das Gelände von unten.
- Ursache (gesichert, im Browser nachgestellt und nachgerechnet): Die Kamera stand 3,5 cm über dem Boden, die nahe Bildebene liegt in der echten Welt bei 10 cm. Der unterste Sichtstrahl traf den Boden näher als die Bildebene; dort wurde der Boden weggeschnitten. 1 m höher war das Bild richtig.
- Jetzt: Abstand der Kamera zum Boden mindestens 1,4 x nahe Bildebene (echte Welt 14 cm, Spielkarte unverändert 3,5 cm). Gerechnet für Blickfeld bis 120° hoch (Handy hochkant) und Kamera 20° nach oben: nötig sind bis 1,3 x.
- Dazu: Der weiche Schatten der Drohne lag in der echten Welt flach auf Höhe 0 statt auf dem Boden; jetzt auf dem Boden. Im Kamerabild erscheint der eigene Schatten erst ab 0,5 m Höhe (am Boden deckte er den unteren Bildrand zu).
- Geprüft im Browser: Start mit zuletzt gewählter echter Welt, PC und Handy hochkant.

## Start nicht im Wasser (07.11.2026, Prompt 141)

- Fehlerbild: Die Drohne startete im Wasser, stürzte sofort ab, und „R“ setzte sie wieder dorthin (Schleife).
- Ursache (gesichert im Code): Die Startsuche (`rwload.findStart`) meidet nur Dächer. Die Gewässer kommen erst danach mit den Landesdaten. Lag der Mittelpunkt eines Orts in einem Fluss (zum Beispiel im Rhein), lag auch der Start dort.
- Jetzt: Nach dem Laden (`rwApply`, auch für gespeicherte Orte) prüft `rwDryHome`, ob im Umkreis von 4 m Wasser liegt. Wenn ja, wird der Start in Ringen von 4 m auf den nächsten Punkt verlegt, der 4 m Abstand zum Wasser, 6 m zu Gebäuden hat und nicht steiler als etwa 30° ist (bis 400 m, im Gebiet). Der Höhenbezug bleibt.
- Geprüft: Test mit einem Teich 50 x 50 m genau um den Start von Monschau: Start verlegt, trocken, kein Gebäude, 2 s Stehen ohne Absturz, Neustart am trockenen Platz; ohne Wasser bleibt der Start unverändert.

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

- RW1 (erledigt): Werkzeug, eingebettetes NRW-Gelände mit Luftbild, Physik auf echtem Gelände, Modus im Menü.
- RW2 (erledigt): LoD2-Gebäude und Bäume mit Kollision.
- M1 (erledigt, später verworfen): 3D-Mesh NRW eingebettet; wirkte verschwommen, ersetzt durch Luftbild und Fassaden (Prompt 99).
- M2, M3 (zurückgestellt): Nachladen des 3D-Mesh.
- L1 bis L4 (erledigt): Laden per Koordinate, Deutschlandkarte, eigene Quellen mit Grenzen, Speichern und Landesdaten.
- L5 (offen): Nachladen beim Fliegen (Kacheln im Umkreis laden, alte entladen).
- RW4 (später): Aufgaben in der echten Welt (Tore, Jagd), Signal durch Gelände verdeckt.

## Risiken (vermutet)

- Andere Bundesländer: nicht jeder Dienst erlaubt CORS. „Prüfen“ zeigt es; sonst bleibt nur der Weg über das Werkzeug (vorab laden und einbetten).
- LoD2 hat viele kleine Flächen; die Kollision prüft die Dreiecke genau (Raster 8 m), in Innenstädten sind es über 100 000.
- Handy: großes Luftbild (4096², bei kleinerer Höchstgröße der Grafikkarte wird es verkleinert) und viele Gebäude-Dreiecke kosten Speicher und Leistung.

## Wasser, Bäume, Brücken, Licht (08.11.2026, Prompt 152, umgesetzt von Fable)

- **Wasser mit Luftbild:** Wasser-Ecken tragen Alpha 0,7 als Kennung. Der Shader mischt 65 % Luftbild mit 35 % Tönung, Spiegelung zum Horizont (Fresnel), leichte Wellen (`uTime`) und Sonnenglanz. Gilt für Startgebiet und Kacheln, beide Grafikstufen.
- **Weiche Uferkante:** je Wasser-Ecke Anteil nasser Zellen in 5 x 5 m; daraus das Alpha, Wasser mit Blending.
- **Bäume nicht im Wasser:** Fehler behoben: Beim Laden eines Gebiets prüfte `rwModels` die Bäume gegen die Wassermaske des vorherigen Gebiets (bei jedem live geladenen Ort die von Monschau). Jetzt eigene Maske (`rwWetFn`). Zusätzlich fällt ein Baum weg, wenn die Spitze oder ein Punkt in 1,5 m nass ist oder Wasser im Kronenkreis liegt und der Fuß unter dessen Spiegel steht. Monschau: 2955 statt 2982 Bäume.
- **Brücken:** LoD2-Funktion `53001_*` ist Klasse 8 (grauer Beton, keine Fenster, kein Fachwerk). Für ältere Daten: Klasse 0 unter 2 m Höhe gilt als Brücke (Schätzung).
- **Sonne passend zum Luftbild:** Schatten neben 145 Gebäuden in Monschau fallen nach Norden, also Sonne im Süden (gemessen). Sonnenhöhe 45° ist eine Schätzung (Frühjahrsbefliegung). Nur in der echten Welt.
- **Feines Bodendetail:** nur Grafik „Schön“, bis 15 m Abstand.
- **Dunst und Tiefe:** Dunst mit Entfernung und unterhalb der Kamera, blassere Farben bis 2,5 km (Zahlen geschätzt).
- **Nicht umgesetzt (nicht gewählt):** Kronen an Gebäuden kürzen (Kronen können weiter vom Ufer in Brücken ragen), Bäche als Wasser, grünere oder rundere Kronen, stufenweises Laden.
- **Geprüft:** 4 neue Tests (`test/rwtrees.test.mjs`); Vorher-Nachher-Bilder an der Rur in Monschau; Bildrate in der Software-Grafik ohne messbaren Verlust.
- **Nachtrag fleckiges Wasser (Prompt 155):** Aus der Ferne gewann das Flussbett stellenweise den Tiefentest gegen die Wasserfläche 0,25 m darüber (dunkle, eckige Flecken am Rhein). Behoben: Das gezeichnete Flussbett liegt unter Wasser 2 m tiefer (`WATER_DIP`, Schätzung; Physik unverändert), Wasser-Ecken auf dem Gitter des Geländes, Polygon-Offset 16 statt 4, Wellen und Glanz klingen mit der Entfernung ab. Im Browser in Köln nachgestellt und geprüft.

## WMS-Höhendienst (08.11.2026, Prompt 166 bis 170, Plan `docs/plan-gelaende-wms.md`)
- Zweite Quellenart neben den Landesdiensten: nur Höhen aus einem OGC-WMS 1.3.0 (EPSG:4326, Gleitkomma-GeoTIFF), etwa vom Gelände-Server einer DIS-Übung. Gilt für DIS-Übung, überall oder nie. Daten nur im Arbeitsspeicher, nie gespeichert. Ohne Luftbild: schattiertes Relief.
- Startort DIS-Übung: Der Simulator sucht den Dienst selbst (Vorlage localhost:7071 und eigene Quellen). „Dort fliegen“ nimmt den Höhendienst, sonst die Landesquelle, sonst eine ebene Fläche. Die Zeile unter dem DIS-Block nennt das Gelände.
