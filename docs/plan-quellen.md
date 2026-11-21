# Plan: mehr mitgelieferte Quellen für Kartenmaterial (Stand 20.11.2026)

Auftrag (Prompt 208 bis 212): Die Vorlagen für die echte Welt erweitern, für weitere Bundesländer und weltweit. Grundlage ist die Liste des Nutzers `docs/quellen-geodaten.md` (aus aoi2vbs4, Stand 20.11.2026, unverändert abgelegt). Der Unterschied („Delta“) zwischen dieser Liste und dem, was der Simulator lesen kann, soll ausgeglichen werden.

## Das Delta in einem Satz

aoi2vbs4 lädt ganze Kacheldateien mit GDAL auf einem Rechner. Der Simulator läuft im Browser und fragt heute nur Dienste ab, die das Gebiet zuschneiden (Höhen per WCS, Luftbild per WMS). Daraus folgen vier Hürden: Der Browser braucht die Erlaubnis des Servers (CORS). Er braucht Teilabrufe (Range), sonst lädt er ganze Dateien. Er kann nur Formate lesen, die wir selbst programmieren. Und Luftbild-Kacheln sind für den Browser oft zu groß.

## Gemessen (gesichert, 20.11.2026)

Abruf aus der Cloud-Umgebung mit `Origin: https://bladeage.github.io`, so wie der Browser fragt. „CORS ja“ heißt: Der Server antwortet mit `Access-Control-Allow-Origin` (`*` oder unsere Seite). Testorte: München, Potsdam, Berlin Mitte, Hannover, Mainz, Monschau, Dresden, Rostock.

| Quelle | CORS | Range | Format (gemessen) | Größe |
|---|---|---|---|---|
| Brandenburg Höhe (ZIP) | ja | ja | ZIP Deflate, darin TIFF LZW, Prädiktor 2, Float32, 1000² | 1,3 MB je km² |
| Brandenburg Luftbild (ZIP) | ja | ja | ZIP Deflate, darin TIFF RGBI | 91 MB je km² |
| Brandenburg Gebäude (ZIP) | ja | ja | ZIP Deflate, darin CityGML | 3,6 MB je km² |
| Berlin Höhe (ZIP) | ja | ja | ZIP Deflate, darin XYZ-Text | 17 MB je 2 x 2 km |
| Berlin Gebäude (ZIP) | ja | ja | ZIP Deflate, darin CityGML | 2,9 MB je km² |
| Niedersachsen Höhe (STAC) | ja | ja | Cloud-optimiertes TIFF (COG), LZW, Float32, Kacheln 512, Übersicht 500² | etwa 1,5 MB je km² (Schätzung) |
| Niedersachsen Luftbild (STAC) | ja | ja | COG, JPEG in TIFF (YCbCr), 10000² je 2 x 2 km, Übersichten 5000², 2500², 1250² | 28 MB je 2 x 2 km in voller Schärfe |
| Niedersachsen Gebäude (S3) | ja | ja | CityGML, nicht gepackt | 36,7 MB je km² (Hannover Mitte) |
| Niedersachsen Basis-DLM | ja | ja | ZIP | 547 MB |
| Rheinland-Pfalz Höhe (Liste) | ja | ja | TIFF LZW, Prädiktor 2, Float32, 1000² | 1,5 MB je km²; die Dateiliste selbst ist 9 MB groß |
| Rheinland-Pfalz Luftbild | ja | ja | JPEG 2000 (`.jp2`) | |
| Rheinland-Pfalz Gebäude | ja | ja | CityGML je 2 x 2 km | |
| Mecklenburg-Vorpommern Höhe | ja | nein | TIFF ohne Kompression, Float32, 2000² | 16 MB je 2 x 2 km |
| NRW Höhe (Liste) | ja | ja | TIFF LZW, Float32, 1000² | 2,8 MB je km² (heute nicht nötig: WCS läuft) |
| Bayern Höhe, Luftbild, Gebäude (`download1.bayernwolke.de`) | **nein** | ja | TIFF LZW | |
| Bayern Basis-DLM | **nein** | ja | ZIP mit Deflate64 | 1,3 GB |
| Bayern Luftbild als WMS (`geoservices.bayern.de/od/wms/dop/v1/dop40`) | ja | | WMS (GetCapabilities geprüft) | |
| Sachsen alle (`geocloud.landesvermessung.sachsen.de`) | **nein** | ja | ZIP | |
| Copernicus DEM GLO-30 (S3) | **nein** (Vorabfrage 403) | ja | COG Deflate, Prädiktor 3 | |
| ESA WorldCover (S3) | **nein** | ja | COG Deflate | |
| Sentinel-2 Katalog (earth-search) | ja | | STAC-Suche | |
| Sentinel-2 Bild `TCI.tif` (S3) | ja | ja | COG Deflate, Prädiktor 2, RGB 8 Bit, Übersichten | |
| PROJ-Gitter (`cdn.proj.org`) | ja | ja | COG Deflate | |
| Overpass (alle drei Spiegel) | nicht geprüft | | | Die Cloud-Umgebung erreicht die Server nicht |
| Ersatz: AWS Terrain Tiles (`elevation-tiles-prod`) | ja | | GeoTIFF Deflate 512², Int16, und Terrarium-PNG | |

Folgerungen (gesichert, aus den Messwerten):

- **Gesperrt im Browser:** Bayern (Kachelserver und Basis-DLM), Sachsen, Copernicus DEM, ESA WorldCover. Das ist eine Einstellung der Server. Wir können sie nicht umgehen. Ein eigener Weiterleitungsdienst wäre ein Server, und den hat das Projekt nicht.
- **Nicht lesbar ohne Bibliothek:** JPEG 2000 (Luftbild NRW-Liste, Rheinland-Pfalz), ZIP mit Deflate64 (Bayern Basis-DLM, Hamburg Gebäude).
- **Zu groß je Gebiet:** Luftbild als ganze Kachel (91 MB Brandenburg, 400 MB Mecklenburg-Vorpommern je Kachel). Ausnahme: COG mit Übersichten (Niedersachsen, Sentinel-2). Dort lädt man nur die nötige Schärfe und nur die nötigen Teile.
- **Umgebung 10 x 10 km:** Aus 1-km-Kacheln wären das 100 Dateien, bei Brandenburg etwa 130 MB (Schätzung: 100 x 1,3 MB). Zu viel. Die Umgebung braucht eine grobe Quelle: eine weltweite Höhe oder die Übersichten eines COG.

## Was der Simulator heute lesen kann (gesichert, Code)

- Höhen: WCS 2.0.1, TIFF ohne Kompression oder mit LZW (`src/geo.js`, `readTiff`). Prädiktor 2 ist nur für 8 Bit genau (Kommentar im Code). Brandenburg und Rheinland-Pfalz nutzen Prädiktor 2 mit 32 Bit.
- Luftbild: WMS 1.3.0 als JPEG oder PNG.
- Gebäude: CityGML je Kachel unter fester Adresse, nicht gepackt.
- Landesdaten: Teilabruf aus einem großen ZIP (`src/rwdlm.js`), Ebenen nach dem Schema von NRW (`gew01_f`, `sie01_f`).
- Straßen: ALKIS-WFS NRW.
- Weltweit: nur der WMS-Höhendienst (geografisch, wird auf das UTM-Gitter umgerechnet, `src/rwwms.js`). Diese Umrechnung kann jede UTM-Zone.
- Quellenformat: `rwSourcesParse` in `src/rwload.js` erlaubt nur EPSG:25832 und 25833 und nur WCS für Höhen.

## Delta je Land

„Liste“ ist der Weg aus `quellen-geodaten.md`. „Ersatz“ ist ein anderer Weg zum selben Ziel, wenn die Liste im Browser nicht geht.

| Land | Höhe | Luftbild | Gebäude | Landesdaten |
|---|---|---|---|---|
| Baden-Württemberg | Liste: nur 2-km-ZIP mit XYZ. Ersatz: WCS suchen, sonst weltweit | Ersatz: WMS suchen | Liste: ZIP mit vier GML; Name nur über Vektorkacheln | Liste: ZIP 775 MB, CORS nicht geprüft |
| Bayern | Liste gesperrt (CORS). Ersatz: WCS suchen, sonst weltweit | Ersatz: WMS DOP40 (CORS ja) | Liste gesperrt | Liste gesperrt, dazu Deflate64 |
| Berlin | Liste: ZIP mit XYZ (17 MB je 4 km²). Lesbar mit neuem XYZ-Leser | Ersatz: WMS suchen | Liste: ZIP, lesbar | keins |
| Brandenburg | Liste: ZIP mit TIFF, lesbar nach Q1 | Ersatz: WMS suchen (Kachel 91 MB zu groß) | Liste: ZIP, lesbar | keins |
| Bremen | Ersatz: WCS suchen, sonst weltweit | Ersatz: WMS suchen | keins | vermutet in der Datei von Niedersachsen |
| Hamburg | Ersatz: WCS suchen, sonst weltweit | Ersatz: WMS suchen | Liste: Deflate64, nicht lesbar | keins |
| Hessen | Ersatz: WCS suchen, sonst weltweit | Ersatz: WMS suchen | Liste: nur Kreis-ZIP | anderes Schema |
| Mecklenburg-Vorpommern | Liste: TIFF 16 MB je 4 km², ohne Range, lesbar | Ersatz: WMS suchen | Liste: ZIP, CORS noch prüfen | keins |
| Niedersachsen | Liste: STAC und COG, lesbar nach Q1 | Liste: COG mit JPEG, Übersicht 0,4 m | Liste: S3, lesbar (groß) | Liste: ZIP, Schema prüfen |
| NRW | heute WCS, bleibt | heute WMS, bleibt | heute, bleibt | heute, bleibt |
| Rheinland-Pfalz | Liste: TIFF, lesbar nach Q1; Dateiliste 9 MB einmal laden und merken | Liste: JPEG 2000, nicht lesbar. Ersatz: WMS suchen | Liste: GML je 2 km, lesbar | Liste: ZIP, Schema prüfen |
| Saarland | Liste: nur WCS. Für uns passend, Dienst suchen | Liste: nur WMS. Für uns passend | keins | keins |
| Sachsen | Liste gesperrt (CORS). Ersatz: WCS suchen | Ersatz: WMS suchen | Liste gesperrt | Liste gesperrt |
| Sachsen-Anhalt | Ersatz: WCS suchen, sonst weltweit | Ersatz: WMS (laut Liste vorhanden) | keins | Liste: ZIP, Schema prüfen |
| Schleswig-Holstein | Ersatz: WCS suchen, sonst weltweit | Ersatz: WMS suchen | keins | keins |
| Thüringen | nicht geprüft (Captcha) | nicht geprüft | nicht geprüft | nicht geprüft |

## Delta weltweit

| Datenart | Liste | Im Browser | Vorschlag |
|---|---|---|---|
| Höhe | Copernicus DEM GLO-30 | gesperrt (CORS) | Ersatz AWS Terrain Tiles (CORS ja, GeoTIFF Deflate). Auflösung und Lizenz je Gebiet noch prüfen; vermutet: in Europa aus EU-DEM etwa 30 m, sonst SRTM |
| Luftbild | Sentinel-2 L2A `visual` | geht (CORS ja, COG) | übernehmen; 10 m, also nur für Umgebung und Ferne scharf genug; Bild mit wenig Wolken über die STAC-Suche wählen |
| Bodenbedeckung | ESA WorldCover | gesperrt (CORS) | später; Ersatz offen |
| Straßen | Overpass (OSM) | nicht geprüft | später; Prüfung aus dem Browser des Nutzers |
| Höhenbezug | PROJ-Gitter EGM96 | geht | nur falls die Höhen über dem Ellipsoid liegen (für Terrain Tiles vermutet nicht nötig) |

## Etappen (Vorschlag)

Jede Etappe einzeln, mit Tests in Node und Freigabe durch den Nutzer.

| Etappe | Inhalt | Sichtbar für den Nutzer |
|---|---|---|
| **Q1 Leser** (erledigt 21.11.2026) | TIFF mit Deflate, Prädiktor 2 für 16 und 32 Bit richtig, Prädiktor 3 geprüft. COG per Teilabruf: nur die nötigen Teile einer Übersicht lesen. Eine Datei aus einem ZIP per Teilabruf lesen (Deflate). XYZ-Text als Raster. Alles ohne DOM, mit Proben als Testdateien. Werkzeug `tools/quellen.mjs` für die Prüfung oben. | nein |
| **Q2 Weltweite Höhe** | Neue Quellart „weltweit“: Höhen aus Terrain Tiles, umgerechnet auf das UTM-Gitter jeder Zone (wie beim WMS-Höhendienst). Gilt außerhalb Deutschlands und als Umgebung für Länder ohne WCS. Luftbild dort zuerst als schattiertes Relief. | ja: Orte überall auf der Welt laden |
| **Q3 Länder aus Kacheln** | Neue Zugriffsarten für Höhen: Vorlage mit `{e}`/`{n}` (mit ZIP), STAC, S3-Liste, Dateiliste. Kacheln zum Gebiet zusammensetzen. Vorlagen: Brandenburg, Niedersachsen, Rheinland-Pfalz, Mecklenburg-Vorpommern, Berlin. | ja: Höhen dieser Länder |
| **Q4 Luftbild** | COG mit JPEG (Niedersachsen) und Deflate (Sentinel-2) aus der passenden Übersicht. Sentinel-2 weltweit für die Umgebung. WMS als Ersatz, wo die Liste nicht geht (Bayern DOP40 gemessen). | ja |
| **Q5 Gebäude** | CityGML aus ZIP, S3 und 2-km-Kacheln: Brandenburg, Berlin, Niedersachsen, Rheinland-Pfalz. | ja |
| **Q6 Lücken mit WCS und WMS** | Für die Länder mit „Ersatz suchen“ die Dienste suchen, mit CORS prüfen und eintragen. Wo es keinen gibt: weltweite Höhe aus Q2. | ja |
| **Q7 Straßen und Landesdaten** | Overpass (weltweit) für Straßen, Basis-DLM anderer Länder (Schema je Land). Erst prüfen, ob Overpass aus dem Browser des Nutzers antwortet. | ja |

Größe der Datei: Vorlagen sind wenige KB. Neue Leser schätzungsweise 10 bis 20 KB. Es bleiben etwa 55 KB bis zur Testgrenze (gesichert, `docs/abschluss-2026-11-13.md`). Das reicht für Q1 bis Q5 (Schätzung). Danach wird es eng.

## Entscheidungen

Nutzer, Prompt 214: Reihenfolge Q1, Q2, Q3. Ohne Antwort und deshalb nach Vorschlag: Terrain Tiles statt Copernicus; Bayern und Sachsen über Q6 (keine Anfrage an die Ämter). Die Liste unten bleibt als Begründung.

## Offene Entscheidungen (mit Vorschlag, Stand Q0)

1. **Reihenfolge.** Vorschlag: Q1, dann Q2 vor Q3. Grund: Die Länder aus Kacheln brauchen für die Umgebung eine grobe Quelle, und das ist die weltweite Höhe.
2. **Ersatz für Copernicus DEM.** Vorschlag: AWS Terrain Tiles. Grund: Copernicus sperrt den Browser. Die Lizenz der Terrain Tiles ist eine Sammlung vieler Quellen; der Vermerk muss je Gebiet stimmen. Das prüfe ich in Q2.
3. **Gesperrte Länder (Bayern, Sachsen).** Vorschlag: WCS und WMS suchen (Q6). Eine Anfrage an die Ämter, CORS freizuschalten, wäre der andere Weg. Das liegt beim Nutzer.
4. **Form der Quellen.** Vorschlag: Bei unserem Format in `RW_SOURCES` bleiben und je Datenart eine Zugriffsart ergänzen (`wcs`, `template`, `stac`, `s3`, `index`). Das Format aus aoi2vbs4 als Import lesen, damit der Nutzer seine `laender.json` einspielen kann.
