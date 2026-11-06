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

## Etappen

- RW1: Werkzeug, eingebettetes NRW-Gelände mit Luftbild, Darstellung, Physik auf echtem Gelände, Modus „Echte Welt“ (Freiflug) im Menü, Quellenangabe.
- RW2: LoD2-Gebäude (Darstellung und Kollision), Bäume aus DOM minus DGM (Darstellung, Kollision vereinfacht).
- RW3: Eigene Dienste: Eingabe von Mittelpunkt (Breite/Länge) und Adressen (WMS/WMTS für Luftbild, WCS für Höhen, Gebäude-Kacheln), Laden im Browser, Fehlermeldung bei fehlender CORS-Freigabe.
- RW4 (später): Aufgaben in der echten Welt (Tore, Jagd), Signal durch Gelände verdeckt.

## Risiken (vermutet)

- Andere Bundesländer: nicht jeder Dienst erlaubt CORS. Dann geht nur der Weg über das Werkzeug (vorab laden und einbetten).
- LoD2 hat viele kleine Flächen; Kollision nur vereinfacht (Hülle je Gebäude).
- Handy: großes Luftbild (2048²) und viele Gebäude-Dreiecke kosten Speicher und Leistung.
