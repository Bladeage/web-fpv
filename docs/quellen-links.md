# Geodaten-Quellen: Links, sortiert und beschriftet

Stand 25.11.2026. Alle Dienste sind öffentlich (offene Daten). „Status" meint die Nutzbarkeit im Browser des Simulators
(Abruf mit `Origin: https://bladeage.github.io`): **geht** = eingebaut und mit CORS nutzbar; **CORS** = Server sendet keine
Freigabe, im Browser gesperrt; **Format/CRS** = technisch nicht lesbar; **umständlich** = nutzbar, aber aufwändiger Zugriff;
**nicht geprüft** = aus der Arbeitsumgebung nicht testbar. Höhen ohne eigenen Dienst kommen aus der Welt-Quelle (AWS Terrain Tiles),
Straßen und (wo kein LoD2) Gebäude und Wald aus OpenStreetMap.

## Baden-Württemberg
- Höhen (WCS, geht): https://owsproxy.lgl-bw.de/owsproxy/wcs/WCS_INSP_BW_Hoehe_Coverage_DGM1 — coverage `EL.ElevationGridCoverage`
- Luftbild (WMS, geht): https://owsproxy.lgl-bw.de/owsproxy/ows/WMS_LGL-BW_ATKIS_DOP_20_C — layer `IMAGES_DOP_20_RGB`
- Gebäude LoD2 (CORS, nur eigene Domain freigegeben): https://opengeodata.lgl-bw.de/data/lod2/LoD2_32_{E}_{N}_2_bw.zip — 2 km, CityGML
- Lizenz: LGL, dl-de/by-2-0

## Bayern
- Luftbild (WMS, geht): https://geoservices.bayern.de/od/wms/dop/v1/dop40 — layer `by_dop40c`
- Gebäude LoD2 (CORS): https://download1.bayernwolke.de/a/lod2/citygml/{E}_{N}.gml — 2 km, CityGML (auch `download2.…`)
- Höhen: keine offene CORS-Quelle gefunden → Welt-Quelle
- Lizenz: Bayerische Vermessungsverwaltung, CC BY 4.0

## Berlin
- Höhen (WCS, geht): https://isk.geobasis-bb.de/ows/dgm_wcs — coverage `bb_dgm` (Brandenburg deckt Berlin ab)
- Luftbild (WMS, geht): https://gdi.berlin.de/services/wms/truedop_2024 — layer `truedop_2024`
- Gebäude LoD2 (geht): https://gdi.berlin.de/data/a_lod2/atom/LoD2_{E}_{N}.zip — 1 km, ZIP mit CityGML
- Lizenz: Geoportal Berlin, dl-de/zero-2-0

## Brandenburg
- Höhen (WCS, geht): https://isk.geobasis-bb.de/ows/dgm_wcs — coverage `bb_dgm`
- Luftbild (WMS, geht): https://isk.geobasis-bb.de/mapproxy/dop20c/service/wms — layer `bebb_dop20c`
- Gebäude LoD2 (geht): https://data.geobasis-bb.de/geobasis/daten/3d_gebaeude/lod2_gml/lod2_33{E}-{N}.zip — 1 km, ZIP mit CityGML
- Lizenz: GeoBasis-DE/LGB, dl-de/by-2-0

## Bremen
- Luftbild (WMS, geht): https://geodienste.bremen.de/wms_dop20_2023 — layer `DOP20_2023_HB`
- Gebäude LoD2 (CORS, nur Stadt-Gesamtpaket): https://gdi2.geo.bremen.de/inspire/download/LoD/data/LOD2_CITYGML_HB.zip — 403 MB
- Höhen: keine offene CORS-Quelle → Welt-Quelle
- Lizenz: Landesamt GeoInformation Bremen, CC BY

## Hamburg
- Luftbild (WMS, geht): https://geodienste.hamburg.de/wms_dop_zeitreihe_belaubt — layer `dop_zeitreihe_belaubt`
- Gebäude LoD2 (CORS ja, aber umständlich: 629-MB-ZIP, nur per Teilabruf): https://daten-hamburg.de/opendata/3d_stadtmodell_lod2/LoD2-DE_HH_2026-04-28.zip — 1-km-Kacheln `LoD2_32_{E}_{N}_1_HH.gml`
- Höhen: keine offene CORS-Quelle → Welt-Quelle
- Lizenz: Freie und Hansestadt Hamburg, LGV, dl-de/by-2-0

## Hessen
- Luftbild (WMS, geht): https://www.gds-srv.hessen.de/cgi-bin/lika-services/ogc-free-images.ows — layer `he_dop_rgb` (höchstens 3000 px)
- Gebäude LoD2 (CORS ja, aber umständlich: Pakete je Gemarkung, rollendes Datum im Pfad): Downloadcenter `https://gds.hessen.de/downloadcenter/…/3D-Gebäudemodelle LoD2/<Landkreis>/<Gemarkung>-LoD2.zip`; Liste je Landkreis über REST `https://gds.hessen.de/INTERSHOP/rest/WFS/HLBG-Geodaten-Site/-/downloadcenter?path=…`
- Höhen: keine offene CORS-Quelle → Welt-Quelle
- Lizenz: HVBG, Nutzung frei (HVGG § 24)

## Mecklenburg-Vorpommern
- Höhen (WCS, geht): https://www.geodaten-mv.de/dienste/dgm_wcs — coverage `mv_dgm`
- Oberfläche/DOM (WCS, geht): https://www.geodaten-mv.de/dienste/dom_wcs — coverage `mv_dom1`
- Luftbild (WMS, geht): https://www.geodaten-mv.de/dienste/adv_dop — layer `mv_dop`
- Gebäude LoD2 (geht): https://www.geodaten-mv.de/dienste/gebaeude_download — 2 km, ZIP mit CityGML
- Lizenz: GeoBasis-DE/M-V, CC BY 4.0

## Niedersachsen
- Höhen (STAC/COG, geht): https://dgm1.s3.eu-de.cloud-object-storage.appdomain.cloud/ — Kachelkatalog
- Luftbild (WMS, geht): https://opendata.lgln.niedersachsen.de/doorman/noauth/dop_wms — layer `ni_dop20`
- Gebäude LoD2 (geht): https://lod2.opengeodata.lgln.niedersachsen.de/LoD2_32_{E}_{N}_1_ni.gml — 1 km, CityGML
- Lizenz: LGLN, CC BY 4.0

## Nordrhein-Westfalen
- Höhen (WCS, geht): https://www.wcs.nrw.de/geobasis/wcs_nw_dgm — coverage `nw_dgm`
- Oberfläche/DOM (WCS, geht): https://www.wcs.nrw.de/geobasis/wcs_nw_dom — coverage `nw_dom`
- Luftbild (WMS, geht): https://www.wms.nrw.de/geobasis/wms_nw_dop — layer `nw_dop_rgb`
- Gebäude LoD2 (geht): https://www.opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/lod2_gml/LoD2_32_{E}_{N}_1_NW.gml — 1 km, CityGML
- Straßen (WFS ALKIS, geht): https://www.wfs.nrw.de/geobasis/wfs_nw_alkis_vereinfacht
- Lizenz: Geobasis NRW, Datenlizenz Deutschland – Zero 2.0

## Rheinland-Pfalz
- Höhen (Dateiliste TIFF, geht): https://geobasis-rlp.de/data/dgm1/ — 1 km
- Luftbild (WMS, geht): https://geo4.service24.rlp.de/wms/rp_dop20.fcgi — layer `rp_dop20`
- Gebäude LoD2 (geht): https://geobasis-rlp.de/data/geb3dlo/current/gml/LoD2_32_{E}_{N}_2_RP.gml — 2 km, CityGML
- Lizenz: GeoBasis-DE / LVermGeoRP, dl-de/by-2-0

## Saarland
- Höhen (WCS, geht): https://geoportal.saarland.de/gdi-sl/inspireraster/inspirewcsel — coverage `EL.GridCoverage`
- Luftbild (WMS, geht): https://geoportal.saarland.de/freewms/dop2023 — layer `sl_dop20_rgb`
- Gebäude LoD2 (Format/CRS: nur INSPIRE-GML in geografischem CRS, kein CityGML/UTM): https://geoportal.saarland.de/gdi-sl/inspirewfs_Gebaeude_3D_LoD2
- Lizenz: LVGL Saarland

## Sachsen
- Luftbild (WMS, geht): https://geodienste.sachsen.de/wms_geosn_dop-rgb/guest — layer `sn_dop_020`
- Gebäude LoD2 (CORS, zusätzlich dynamische Tokens): https://geocloud.landesvermessung.sachsen.de/ — 2 km, ZIP mit CityGML
- Höhen: keine offene CORS-Quelle → Welt-Quelle
- Lizenz: GeoSN, dl-de/by-2-0

## Sachsen-Anhalt
- Luftbild (WMS, geht): https://www.geodatenportal.sachsen-anhalt.de/wss/service/ST_LVermGeo_DOP_WMS_OpenData/guest — layer `lsa_lvermgeo_dop20_2`
- Gebäude LoD2 (nicht nutzbar: ATOM in falschem Format/CRS; Sammel-ZIP-Adresse nicht auffindbar): https://geodatenportal.sachsen-anhalt.de/arcgisinspire/rest/directories/web/INSPIRE_ALKIS/ALKIS_LOD2_BU/datasetlod2.xml
- Höhen: keine offene CORS-Quelle → Welt-Quelle
- Lizenz: GeoBasis-DE / LVermGeo ST, dl-de/by-2-0

## Schleswig-Holstein
- Luftbild (WMS, geht): https://dienste.gdi-sh.de/WMS_SH_DOP20col_OpenGBD — layer `sh_dop20_rgb`
- Gebäude LoD2 (nicht geprüft: Host aus der Arbeitsumgebung nicht erreichbar): https://opengeodata.schleswig-holstein.de/ — Kacheln `LoD2_32_{E}_{N}_1_SH.xml`
- Höhen: keine offene CORS-Quelle → Welt-Quelle
- Lizenz: © GeoBasis-DE/LVermGeo SH, CC BY 4.0

## Thüringen
- Luftbild (WMS, geht): https://www.geoproxy.geoportal-th.de/geoproxy/services/DOP — layer `th_dop`
- Gebäude LoD2 (CORS, zusätzlich zeitweise Wartung): https://geoportal.geoportal-th.de/dienste/atom_th_gebaeude — 2 km, ZIP mit CityGML
- Höhen: keine offene CORS-Quelle → Welt-Quelle
- Lizenz: © GDI-Th, CC BY 4.0

## Überall (nicht landesgebunden)
- Straßen, Gebäude-Grundrisse und Wald (OpenStreetMap, Overpass): https://overpass-api.de/api/interpreter · https://overpass.kumi.systems/api/interpreter · https://lz4.overpass-api.de/api/interpreter — Lizenz ODbL
- Höhen weltweit (AWS Terrain Tiles): https://elevation-tiles-prod.s3.amazonaws.com/geotiff/{z}/{x}/{y}.tif
- Luftbild-Rückfall weltweit (Sentinel-2, earth-search): https://earth-search.aws.element84.com/v1 — Copernicus-Sentinel-Daten
- Ortssuche (Nominatim): https://nominatim.openstreetmap.org/search — Lizenz ODbL
