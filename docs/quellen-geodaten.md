# Offene Geodatenquellen für Gelände

Stand: 2026-11-20. Zusammengestellt aus aoi2vbs4 (`quellen/laender.json`, `vbs_sources.py`) und einer
Prüfung aller Bundesländer am selben Tag.

**Gruppen:** zuerst die weltweiten Quellen, dann die Bundesländer in alphabetischer Reihenfolge. Je Land gibt
es Höhe (DGM1), Luftbild (DOP), Gebäude (LoD2) und Basis-DLM (Straßen, Gewässer, Schienen).

**Lesehilfe:**

- `{e}` und `{n}` sind Kilometer Ost und Nord im UTM-Kachelnetz. Beispiel: `{e}=410`, `{n}=5654`.
- **Kachel** ist eine Datei je Kachel unter fester Adresse. **Dateiliste** ist ein Ordner mit HTML- oder
  XML-Liste der Kacheln. **STAC** ist ein Katalog mit Cloud-optimierten GeoTIFFs. **S3** ist ein Bucket mit
  Dateiliste.
- Status:
  - **nutzbar**: von aoi2vbs4 eingebaut und gelesen.
  - **mit Anpassung**: geprüft, braucht aber eine kleine Änderung am Abruf.
  - **nicht nutzbar**: keine Einzelkacheln oder nicht maschinell abrufbar.
- „gesichert“ heißt geprüft (Abruf, `gdalinfo`), „vermutet“ heißt nicht geprüft.

## Weltweit

| Datenart | Quelle | Zugriff | Adresse | Auflösung | Lizenz |
|---|---|---|---|---|---|
| Bodenbedeckung | ESA WorldCover 2021 v200 | COG-Kacheln (S3) | `https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map` | 10 m | CC BY 4.0 |
| Höhe | Copernicus DEM GLO-30 | COG-Kacheln (S3) | `https://copernicus-dem-30m.s3.amazonaws.com` | 30 m | Copernicus-Lizenz (frei mit Quellenvermerk) |
| Höhenbezug-Gitter | PROJ-Gitter (z. B. EGM96) | Datei-CDN | `https://cdn.proj.org/` | | je Gitter |
| Luftbild | Sentinel-2 L2A, Asset `visual` (8-bit-RGB-COG) | STAC (earth-search v1), Sammlung `sentinel-2-l2a` | `https://earth-search.aws.element84.com/v1` | 10 m | Copernicus-Lizenz |
| Straßen | OpenStreetMap über Overpass | Overpass-API, drei Spiegel | `https://overpass-api.de/api`, `https://overpass.kumi.systems/api`, `https://lz4.overpass-api.de/api` | | ODbL |

Hinweis zu Overpass: Große Gebiete in Kacheln abfragen. aoi2vbs4 teilt ab 20 × 20 km.

## Bundesländer

### Baden-Württemberg (LGL)

Status: Basis-DLM nutzbar. Höhe, Luftbild und Gebäude gibt es, aber nicht als einzeln abrufbare Kachel.
Lizenz: dl-de/by-2-0, Datenquelle: LGL, www.lgl-bw.de

| Datenart | Status | Adresse | Hinweis |
|---|---|---|---|
| Basis-DLM | nutzbar | `https://opengeodata.lgl-bw.de/data/bdlm/bdlm_bw_shp.zip` | 775 MB, Shapes im Wurzelordner, EPSG:25832 (gesichert) |
| Höhe | nicht nutzbar | `/data/dgm/dgm1_32_<E>_<N>_2_bw.zip` und `/data/dgm025/dgm025_32_<E>_<N>_2_bw.zip` | 2-km-ZIP mit vier 1-km-Dateien. DGM1 als XYZ, DGM025 als GeoTIFF 0,25 m (gesichert) |
| Luftbild | nicht nutzbar | `/data/dop20/dop20rgb_32_<E>_<N>_2_bw.zip` | 253 MB je 2-km-ZIP, vier 1-km-TIF, 0,2 m RGB (gesichert) |
| Gebäude | nicht nutzbar | `/data/lod2/LoD2_32_<E>_<N>_2_bw.zip` | vier `LoD2_32_<e>_<n>_1_BW.gml` je ZIP |

Stolperstellen:

- Das 2-km-Netz hat ungerade Ost-Kilometer (z. B. 509_5398).
- Das Jahr im Namen der inneren Dateien wechselt je Kachel.
- Kachelnamen und Links stehen in den Vektorkacheln `https://opengeodata.lgl-bw.de/tiles/vts/2x2Gitter/{z}/{x}/{y}.pbf` (Feld `metadata`).

### Bayern (LDBV)

Status: nutzbar.
Lizenz: CC BY 4.0, Bayerische Vermessungsverwaltung (Jahr)

| Datenart | Zugriff | Adresse | Hinweis |
|---|---|---|---|
| Basis-DLM | ZIP | `https://geodaten.bayern.de/odd/m/2/basisdlm/bkg_shape/bkg_shape_712.zip` | Shapes im Wurzelordner |
| Gebäude | Kachel | `https://download1.bayernwolke.de/a/lod2/citygml/{e}_{n}.gml` | CityGML, 2-km-Kacheln |
| Höhe | Kachel | `https://download1.bayernwolke.de/a/dgm/dgm1/{e}_{n}.tif` | 1 m, 1-km-Kacheln, Namen ohne Jahr, NoData -9999, DHHN2016 (vermutet) |
| Luftbild | Kachel | `https://download1.bayernwolke.de/a/dop20/data/32{e}_{n}.tif` | 20 cm RGB |

### Berlin (Geoportal Berlin)

Status: Höhe und Gebäude nutzbar.
Lizenz: dl-de/zero-2-0, Geoportal Berlin. Kachelnetz UTM 33 (EPSG:25833).

| Datenart | Status | Adresse | Hinweis |
|---|---|---|---|
| Basis-DLM | nicht nutzbar | | Kein Basis-DLM als offene Datei |
| Gebäude | nutzbar | `https://gdi.berlin.de/data/a_lod2/atom/LoD2_{e}_{n}.zip` | darin `LoD2_33_{e}_{n}_1_BE.xml` |
| Höhe | nutzbar | `https://gdi.berlin.de/data/dgm1/atom/DGM1_{e}_{n}.zip` | 2-km-Kacheln, darin `dgm1_33_{e}_{n}_2_be.xyz` (XYZ-Text ohne Koordinatensystem) |
| Luftbild | nicht nutzbar | | nur neun Bezirks-ZIPs zu je rund 3 GB (`truedop_<Jahr>`) |

ATOM-Feeds: `https://gdi.berlin.de/data/dgm1/atom/` und `https://gdi.berlin.de/data/a_lod2/atom/`

### Brandenburg (LGB)

Status: Höhe, Luftbild und Gebäude nutzbar.
Lizenz: dl-de/by-2-0, GeoBasis-DE/LGB (Jahr). Kachelnetz UTM 33 (EPSG:25833), 1-km-Kacheln, eine ZIP je Kachel.

| Datenart | Adresse | Hinweis |
|---|---|---|
| Gebäude | `https://data.geobasis-bb.de/geobasis/daten/3d_gebaeude/lod2_gml/lod2_33{e}-{n}.zip` | darin `lod2_33{e}-{n}_geb.gml` |
| Höhe | `https://data.geobasis-bb.de/geobasis/daten/dgm/tif/dgm_33{e}-{n}.zip` | darin `dgm_33{e}-{n}.tif`, 1 m, NoData -9999, DHHN2016 |
| Luftbild | `https://data.geobasis-bb.de/geobasis/daten/dop/rgbi_tif/dop_33{e}-{n}.zip` | darin `dop_33{e}-{n}.tif`, 20 cm RGBI, Kanäle 1 bis 3 = RGB |

Einzelne Kacheln fehlen (HTTP 404). Eine Prüfung je Kachel per HEAD fängt das ab.

### Bremen

Status: Basis-DLM vermutlich über die Niedersachsen-Datei, sonst nicht nutzbar.

| Datenart | Status | Hinweis |
|---|---|---|
| Basis-DLM | vermutet nutzbar | Die NI-Datei (siehe Niedersachsen) enthält Bremen. Es gibt eine Variante „ohne_HB“, für Bremer Flächen nicht eigens geprüft |
| Gebäude | nicht nutzbar | nur Stadt-ZIPs (CityGML, DWG, DXF) auf `gdi2.geo.bremen.de` |
| Höhe | nicht nutzbar | nur zwei Stadt-ZIPs (Bremen, Bremerhaven) als XYZ, CC BY 4.0 laut Metadaten |
| Luftbild | nicht nutzbar | nur Gesamt-ZIP `dop20_hb_<Jahr>` |

### Hamburg

Status: nicht nutzbar (nur stadtweite Sammel-ZIPs).
Lizenz: dl-de/by-2-0 (Transparenzportal)

| Datenart | Hinweis |
|---|---|
| Basis-DLM | nicht gefunden |
| Gebäude | `LoD2-DE_HH_2023-04-01.zip`, 689 MB, 784 Dateien `LoD2_32_<e>_<n>_1_HH.xml`, Kompression Deflate64 |
| Höhe | `dgm1_2x2km_xyz_hh_<Datum>.zip` |
| Luftbild | DOP20 als JPEG-Jahres-ZIPs |

### Hessen (HVBG)

Status: nicht nutzbar.
Lizenz laut Portal kosten- und lizenzfrei, laut Metadaten dl-de/zero-2-0.

- Im Downloadcenter gibt es nur Kreis-ZIPs. Beispiel: DGM1 Frankfurt, 600 MB, mit `DGM1_32_<e>_<n>_1_he.tif`. DOP20 kommt als JPG, LoD2 je Kreis.
- Der Pfad enthält das Tagesdatum (`/downloadcenter/20261120/...`). Ältere Datumspfade liefern 404.
- Das Basis-DLM-Shape hat ein anderes Schema (`dlm_41001_ax_wohnbau` statt `gew01_f`).
- REST-Liste: `https://gds.hessen.de/INTERSHOP/rest/WFS/HLBG-Geodaten-Site/-/downloadcenter?path=<Pfad>`

### Mecklenburg-Vorpommern (LAiV)

Status: mit Anpassung.
Lizenz: CC BY 4.0, GeoBasis-DE/M-V (Jahr). Kachelnetz UTM 33, 2-km-Kacheln.

Voraussetzung: Der Dienst liefert weder `Content-Length` noch Range. Jede Kachel muss deshalb ganz geladen werden: Höhe rund 16 MB, Luftbild RGBI rund 400 MB je Kachel. HEAD funktioniert (200 oder 404).

| Datenart | Adresse |
|---|---|
| Gebäude | `https://www.geodaten-mv.de/dienste/gebaeude_download?index=0&dataset=8397b554-5cb9-4274-8be8-c20490d9a6e8&file=lod2_33_{e}_{n}_2_gml.zip` (darin `lod2_33_{e}_{n}_2.gml`) |
| Höhe | `https://www.geodaten-mv.de/dienste/dgm_download?index=4&dataset=ca268792-s2q1-4a39-b34c-9ec5bf9a4469&file=dgm1_33_{e}_{n}_2_gtiff.tif` |
| Luftbild | `https://www.geodaten-mv.de/dienste/dop20_download?index=0&dataset=f94d17fa-b29b-41f7-a4b8-6e10f1aae38e&file=dop20rgbi_33_{e}_{n}_2_mv.tif` |

### Niedersachsen (LGLN)

Status: nutzbar.
Lizenz: CC BY 4.0, Quelle: LGLN (Jahr)

| Datenart | Zugriff | Adresse | Hinweis |
|---|---|---|---|
| Basis-DLM | ZIP | `https://single-datasets.s3.eu-de.cloud-object-storage.appdomain.cloud/bdlm/nba_bkg_bdlm_ni_V6.0.zip` | Ordner `nba_bkg_bdlm_ni_V6.0/`, enthält Bremen |
| Gebäude | S3 | `https://lod2.opengeodata.lgln.niedersachsen.de/` | Präfix `LoD2_32_`, Name `LoD2_32_<E>_<N>_1_ni.gml` |
| Höhe | STAC | `https://dgm.stac.lgln.niedersachsen.de`, Sammlung `dgm1` | 1 m, NoData -9999, DHHN2016 |
| Luftbild | STAC | `https://dop.stac.lgln.niedersachsen.de` | 20 cm RGBI, Kanäle 1 bis 3 = RGB |

### Nordrhein-Westfalen (Geobasis NRW)

Status: nutzbar.
Lizenz: dl-de/zero-2-0, Geobasis NRW

| Datenart | Zugriff | Adresse | Hinweis |
|---|---|---|---|
| Basis-DLM | ZIP | `https://www.opengeodata.nrw.de/produkte/geobasis/lm/akt/basis-dlm/basis-dlm_EPSG25832_Shape.zip` | Shapes im Wurzelordner |
| Gebäude | Dateiliste | `https://www.opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/lod2_gml/` | Präfix `LoD2_32_` |
| Höhe | Dateiliste | `https://www.opengeodata.nrw.de/produkte/geobasis/hm/dgm1_tiff/dgm1_tiff/` | Präfix `dgm1_32_`, 1 m, NoData -9999, DHHN2016 |
| Luftbild | Dateiliste | `https://www.opengeodata.nrw.de/produkte/geobasis/lusat/akt/dop/dop_jp2_f10/` | Präfix `dop10rgbi_32_`, 10 cm RGBI |

### Rheinland-Pfalz (GeoBasis-RLP)

Status: nutzbar.
Lizenz: dl-de/by-2-0, GeoBasis-DE / LVermGeoRP (Jahr). Dateilisten als HTML. Höhe in 1-km-Kacheln, Luftbild und Gebäude in 2-km-Kacheln.

| Datenart | Zugriff | Adresse | Hinweis |
|---|---|---|---|
| Basis-DLM | ZIP | `https://geobasis-rlp.de/data/basisdlm/current/shp/BasisDLM_SHP_RP.zip` | Ordner `DLM_RP_<Layer>` |
| Gebäude | Dateiliste | `https://geobasis-rlp.de/data/geb3dlo/current/gml/` | Präfix `LoD2_32_` |
| Höhe | Dateiliste | `https://geobasis-rlp.de/data/dgm1/current/tif/` | Präfix `dgm1_32_`, 1 m, NoData -9999, DHHN2016 |
| Luftbild | Dateiliste | `https://geobasis-rlp.de/data/dop20rgb/current/jp2/` | Präfix `dop20rgb_32_`, 20 cm RGB |

### Saarland

Status: nicht nutzbar.

- DGM1 und DOP20 gibt es nur als WMS oder WCS.
- LoD2 gibt es nur als INSPIRE-ATOM aus einem WFS (INSPIRE-Schema, kein CityGML LoD2-DE).
- Die Metadaten widersprechen sich: dl-de/by-2-0 neben „Nutzung kostenpflichtig“.

### Sachsen (GeoSN)

Status: mit Anpassung.
Lizenz: dl-de/by-2-0, GeoSN (Jahr). Kachelnetz UTM 33, 2-km-Kacheln mit geraden Werten.

Voraussetzung: Der Server (Nextcloud-WebDAV) antwortet auf HEAD mit 401 und auf GET mit Range mit 206. Die Prüfung muss deshalb per `GET` mit `Range: bytes=0-0` laufen, dazu die GDAL-Option `CPL_VSIL_CURL_USE_HEAD=NO`. Damit liest `gdalinfo` die Kacheln über `/vsizip//vsicurl/` (gesichert).

| Datenart | Adresse | Hinweis |
|---|---|---|
| Basis-DLM | `basisdlm_sn_shape.zip` | nicht nutzbar: 1,27 GB, ZIP in ZIP, HEAD 401 |
| Gebäude | `https://geocloud.landesvermessung.sachsen.de/public.php/dav/files/AyJqXpJAZJXomCb/lod2_33{e}_{n}_2_sn_citygml.zip` | darin `lod2_33{e}_{n}_2_sn.gml`, ZIP 10 MB (gesichert) |
| Höhe | `https://geocloud.landesvermessung.sachsen.de/public.php/dav/files/JCcXyifaNdLDnxZ/dgm1_33{e}_{n}_2_sn_tiff.zip` | darin `dgm1_33{e}_{n}_2_sn.tif`, 1 m Float32, NoData -9999 (gesichert) |
| Luftbild | `https://geocloud.landesvermessung.sachsen.de/public.php/dav/files/QQFLq6nkoSnqB5g/dop20rgb_33{e}_{n}_2_sn_tiff.zip` | darin `dop20rgb_33{e}_{n}_2_sn.tif`, 20 cm RGB, ZIP 266 MB (gesichert) |

Die Share-IDs stammen aus `batchConfig.products` auf `https://www.geodaten.sachsen.de/batch-download-4719.html`. Vermutet: Sie können sich ändern.

### Sachsen-Anhalt (LVermGeo)

Status: Basis-DLM nutzbar, sonst nicht nutzbar.
Lizenz: dl-de/by-2-0, GeoBasis-DE / LVermGeo ST (Jahr)

| Datenart | Status | Adresse oder Hinweis |
|---|---|---|
| Basis-DLM | nutzbar | `https://www.geodatenportal.sachsen-anhalt.de/gfds_webshare/download/LVermGeo/Geodatenportal/externedaten/Basis-DLM_20261012_shp.zip`, Ordner `Basis-DLM_20261012/`, EPSG:25832 (gesichert). Vermutet: Das Datum im Namen wechselt mit jeder Lieferung, der Link steht auf `gdp-open-data.html` |
| Gebäude | nicht nutzbar | Sammel-ZIPs `3D/LoD2-1.zip` bis `LoD2-4.zip` (0,8 bis 1,3 GB) mit `LoD2_32_<E>_<N>_2_ST.gml` |
| Höhe | nicht nutzbar | vier landesweite Sammel-ZIPs `DGM/DGM1_1.zip` bis `DGM1_4.zip` (8 bis 11 GB), darin `dgm1_32_<E>_<N>_2_st.tif`, Range-fähig. Einzelkacheln nur über den Kartendownloader |
| Luftbild | nicht nutzbar | DOP20 nur über Kartendownloader oder WMS |

### Schleswig-Holstein (LVermGeo SH)

Status: nicht nutzbar.
Lizenz vermutet CC BY 4.0.

- Kacheln gibt es über `massen.php?file=<Name>&id=<n>&live=<Jahr>&km=<10-km-Block>`.
- Ohne `km` oder `live` kommt eine HTML-Fehlerseite mit Status 200. HEAD taugt deshalb nicht, Range gibt es nicht.
- Die Dateinamen enthalten das Jahr: DGM1 als XYZ (15 verschiedene Jahre), DOP20 RGBI als 1-km-Kacheln (2024/2025), LoD2 als `LoD2_32_<e>_<n>_1_SH.xml`.
- Die Links stehen je Kachel im GeoJSON `.../dladownload/single.php?file=<Produkt>_Massendownload.geojson&id=4`.
- Basis-DLM: kein Link gefunden.

### Thüringen (TLBG)

Status: nicht geprüft.

- Das neue Geoportal `geoportal.thueringen.de` steht hinter einer Bot-Abwehr (Captcha).
- Der alte Downloadhost `geoportal.geoportal-th.de/hsdwnld` meldet „noch nicht verfügbar“.
- Lizenz laut Forum seit 2026-09-14 CC BY 4.0 statt dl-de/by-2-0. Die Metadaten sind uneinheitlich.
- Nur von Hand im Browser klärbar.

## Wie die Quellen gespeichert, geändert und geprüft werden

So macht es aoi2vbs4 mit der VBS-Werkbank. Das kann als Vorlage dienen.

### Speichern: Quellen sind Daten, kein Code

Die Quellen stehen in JSON-Dateien mit immer derselben Form, nicht im Programmcode. Es gibt drei Ebenen:

| Ebene | Datei | Wer ändert | Kennung |
|---|---|---|---|
| Eingebaut | `aoi2vbs4/quellen/laender.json` im Repo | nur per Pull Request | Länderkürzel (`BY`, `NW` ...) |
| Eigene | `eigene_quellen.json` im Werkbank-Ordner des Nutzers | Formular in der Werkbank oder Editor | beginnt mit `E_` |
| Geteilt | jede `*.json` im Unterordner `quellen` eines Offline-Ordners (NAS, USB-Stick) | Editor, in der Werkbank nur lesbar | beginnt mit `E_` |

Ein Eintrag sieht so aus (gekürzt):

```json
{
  "code": "BB",
  "name": "Brandenburg (LGB)",
  "bbox": [11.2, 51.3, 14.8, 53.6],
  "lizenz": "dl-de/by-2-0, GeoBasis-DE/LGB (Jahr)",
  "testort": [13.0625, 52.3985, 13.0655, 52.4000],
  "elevation": {
    "template": "https://data.geobasis-bb.de/geobasis/daten/dgm/tif/dgm_33{e}-{n}.zip",
    "zip": "dgm_33{e}-{n}.tif",
    "crs": "EPSG:25833",
    "nodata": -9999,
    "vertical": "DHHN2016"
  },
  "ortho":     { "...": "gleiche Form, dazu bands und res_m" },
  "buildings": { "...": "gleiche Form, dazu format: citygml" },
  "dlm":       { "code": "BB", "name": "Brandenburg", "zip": "https://.../basis-dlm.zip", "path": "{layer}" },
  "anzeige":   { "elevation": ["DGM1 Brandenburg", "1 m"] },
  "_hinweise": { "kacheln": "Kommentar, wird beim Laden entfernt" }
}
```

Regeln:

- **Pflichtfelder:** `code`, `name`, `bbox` (West, Süd, Ost, Nord in Grad) und `lizenz` mit Quellenvermerk.
- **Eine Adresse je Datenart,** mit genau einer Zugriffsart: `template` (Kachel-Vorlage mit `{e}`/`{n}`), `index` (Dateiliste plus `prefix`), `stac` (Katalog plus `collection`) oder `s3` (Bucket plus `prefix`).
- **Kachelnetz** `crs`: `EPSG:25832` (Standard) oder `EPSG:25833`. `zip` (Datei in der ZIP) gibt es nur bei `template`. `size` steht für die Kachelgröße in km, wenn sie nicht 1 ist.
- **Basis-DLM:** Adresse einer ZIP mit Shapefiles. `path` nennt den Ordner darin, `{layer}` steht für den Layernamen.
- **Kommentare:** Schlüssel, die mit `_` beginnen, sind Kommentare und werden beim Laden entfernt.
- **Testort:** `testort` ist optional, ein kleines Gebiet, an dem die Prüfung Kacheln sucht. Fehlt er, nimmt die Prüfung die Mitte der `bbox`.
- **Wahl der Quelle:** Ein Auftrag nimmt die Länder, deren `bbox` die Gebietsmitte enthält. Die `bbox` ist bewusst grob. Überlappen sich mehrere, probiert der Auftrag sie der Reihe nach.

### Ändern: Hinzufügen, Anpassen, Zurücksetzen

Alles läuft in der Werkbank unter Gelände, Schublade „Geländequellen“. Ohne Werkbank geht dasselbe mit einem Editor in `eigene_quellen.json`.

- **Hinzufügen:** Das Formular fragt Name, Datenart, Abruf, Adresse und Lizenz ab, unter „Mehr“ auch Kachelnetz, Datei in der ZIP, Gebiet und Testort. Gespeichert wird erst nach bestandener Prüfung. Ohne Internet gibt es „Ohne Prüfung speichern“.
- **Anpassen:** Jede eingebaute Datenart hat „… anpassen“. Das Formular ist mit der eingebauten Fassung vorbefüllt. Die eigene Fassung bekommt `"ersetzt": "BY:elevation"` (Land:Datenart) und ersetzt beim Laden nur diese eine Datenart dieses Landes. Die Datenart muss gleich bleiben.
- **Zurücksetzen:** Löscht die eigene Fassung. Danach gilt wieder die eingebaute.
- **Eingebaute Quellen:** Sie ändert nur, wer `laender.json` im Repo ändert. Eigene Quellen überschreiben sie nie, auch kein eingebautes Basis-DLM.

### Prüfen: in drei Stufen

1. **Form beim Laden:**
   - Jede Datei wird gegen die Regeln oben geprüft: Pflichtfelder, vier Zahlen für `bbox` und `testort`, genau eine http(s)-Adresse je Datenart, erlaubtes `crs`, `zip` nur mit `template`, `ersetzt` im Format `XX:datenart`.
   - Bei der eingebauten Datei bricht ein Fehler das Laden ab, die Tests im Repo fangen ihn.
   - Bei eigenen und geteilten Dateien wird nur der kaputte Eintrag übersprungen und mit einem Satz gemeldet. Ebenso übersprungen werden falsche oder doppelte Kennungen.
2. **Erreichbarkeit vor dem Speichern und auf Knopfdruck:**
   - Höhe, Luftbild und Gebäude: Die Prüfung sucht am Testort Kacheln, auf demselben Weg wie ein echter Auftrag, also mit Dateiliste, STAC-Suche oder HEAD je Kachel.
   - Basis-DLM: HEAD auf die ZIP.
   - Weltweite Quellen: HEAD auf eine Kachel, eine STAC-Suche bei Sentinel-2, der Status des Overpass-Servers bei OpenStreetMap.
   - Ergebnis je Datenart: „geht“, „gestört“ mit Grund (etwa „Adresse antwortet mit HTTP 404“) oder „unbekannt“ bei HTTP 429 oder 503 (Anbieter ausgelastet).
   - Die Zwischenspeicher für Dateilisten und Kopfabfragen gelten bei der Prüfung nicht.
3. **Abdeckung vor jedem Auftrag:**
   - Für das gewählte Gebiet zeigt die Werkbank je Datenart, ob die Kacheln da sind, ob eine gröbere Ersatzquelle einspringt oder ob etwas fehlt.
   - Einzelne fehlende Kacheln (HTTP 404) fängt der Auftrag ab.

Tests im Repo laufen nur mit erfundenen Daten und ohne Netz. Eine Adresse, die einen Testmarker enthält, gilt dort als gestört.

## Übersicht

| Land | Höhe | Luftbild | Gebäude | Basis-DLM |
|---|---|---|---|---|
| Baden-Württemberg | nein | nein | nein | ja |
| Bayern | ja | ja | ja | ja |
| Berlin | ja | nein | ja | nein |
| Brandenburg | ja | ja | ja | nein |
| Bremen | nein | nein | nein | vermutet (NI-Datei) |
| Hamburg | nein | nein | nein | nein |
| Hessen | nein | nein | nein | nein |
| Mecklenburg-Vorpommern | mit Anpassung | mit Anpassung | mit Anpassung | nein |
| Niedersachsen | ja | ja | ja | ja |
| Nordrhein-Westfalen | ja | ja | ja | ja |
| Rheinland-Pfalz | ja | ja | ja | ja |
| Saarland | nein | nein | nein | nein |
| Sachsen | mit Anpassung | mit Anpassung | mit Anpassung | nein |
| Sachsen-Anhalt | nein | nein | nein | ja |
| Schleswig-Holstein | nein | nein | nein | nein |
| Thüringen | nicht geprüft | nicht geprüft | nicht geprüft | nicht geprüft |
