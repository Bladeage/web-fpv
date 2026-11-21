/* Echte Welt: Gebiet aus offenen Geodiensten laden (Etappe L1). Ohne DOM: läuft im Browser (Laden per Koordinate)
   und in Node (tools/realworld.mjs legt so das eingebettete Monschau ab). Netz nur über die übergebene Funktion get(url).
   Ergebnis „Paket“: dieselben Daten wie die eingebetteten Dateien (Beschreibung, Höhen 16 Bit, Luftbild JPEG, Gebäude, Bäume). */
import { readTiff, readTiffAsync, readLod2, readLod2Async, cogOpen, cogWindow, zipGet, xyzGrid, gridTo, gridMask, fromUtm } from './geo.js';
import { wmsFetchHeights, wmsFill } from './rwwms.js';

// Voreingestellte Quellen. NRW: Geobasis NRW, Datenlizenz Deutschland – Zero 2.0 (jede Nutzung ohne Bedingungen).
// Gebiet als Rechteck in UTM (grob, mit Rand); an Grenzen entscheidet später die Reihenfolge der Quellen (L3).
// Straßen aus OpenStreetMap (Q7) für Quellen ohne ALKIS: drei Overpass-Spiegel (aus docs/quellen-geodaten.md)
const OSM_ROADS = { overpass: ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://lz4.overpass-api.de/api/interpreter'] };
export const RW_SOURCES = [{
  id: 'nrw', name: 'Nordrhein-Westfalen (Geobasis NRW)', land: 'Nordrhein-Westfalen', crs: 'EPSG:25832', box: [278000, 5560000, 540000, 5832000],
  dgm: { url: 'https://www.wcs.nrw.de/geobasis/wcs_nw_dgm', coverage: 'nw_dgm' },
  dom: { url: 'https://www.wcs.nrw.de/geobasis/wcs_nw_dom', coverage: 'nw_dom' },
  dop: { url: 'https://www.wms.nrw.de/geobasis/wms_nw_dop', layer: 'nw_dop_rgb' },
  lod2: { url: 'https://www.opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/lod2_gml/LoD2_32_{E}_{N}_1_NW.gml', tileKm: 1 },
  // Landesdaten (L4): Basis-DLM als ein ZIP; Gewässerflächen und Ortslagen einmal laden (zusammen 60 MB, gesichert 06.11.2026)
  dlm: { url: 'https://www.opengeodata.nrw.de/produkte/geobasis/lm/akt/basis-dlm/basis-dlm_EPSG25832_Shape.zip', water: 'gew01_f.shp', places: ['sie01_f.shp', 'sie01_f.dbf'], mb: 60 },
  // Straßen (S2): ALKIS vereinfacht, Flächen der Nutzung Straßenverkehr; daraus Mittellinien (rwroads.js). Gesichert 09.11.2026:
  // POST mit Filter, Monschau 148 Flächen, 277 KB, 1,7 s; Feldnamen brauchen den Präfix ave: (ohne: 400 „InvalidParameterValue“)
  roads: { url: 'https://www.wfs.nrw.de/geobasis/wfs_nw_alkis_vereinfacht', type: 'ave:Nutzung', ns: 'http://repository.gdi-de.org/schemas/adv/produkt/alkis-vereinfacht/2.0', field: 'nutzart', value: 'Straßenverkehr', epsg: 25832 },
  attribution: 'Geobasis NRW, Datenlizenz Deutschland – Zero 2.0'
},
// Weitere Länder (Q3 Kacheln, Q6 WCS und WMS; Adressen in docs/plan-quellen.md, CORS und Abruf gemessen 21.11.2026). dgm: WCS (coverage),
// sonst Kacheln: tpl (Adresse mit {e}/{n} in km, zip: Datei darin, xyz: Text), stac (Katalog, Sammlung coll, COG) oder index (Dateiliste,
// Name beginnt mit tpl). Ohne dgm: Höhen aus der Welt-Quelle. dop: WMS-Luftbild (max: größtes Bild des Dienstes). lod2 (Q5): Gebäude,
// zip: Datei im ZIP. Größe je Kachel gemessen: Brandenburg 30 MB, Berlin 27 MB, Niedersachsen bis 49 MB, Rheinland-Pfalz bis 163 MB (2 km), MV 75 MB (2 km).
{ id: 'bb', roads: OSM_ROADS, name: 'Brandenburg (LGB)', land: 'Brandenburg', crs: 'EPSG:25833', dgm: { url: 'https://isk.geobasis-bb.de/ows/dgm_wcs', coverage: 'bb_dgm' },
  dop: { url: 'https://isk.geobasis-bb.de/mapproxy/dop20c/service/wms', layer: 'bebb_dop20c' },
  lod2: { url: 'https://data.geobasis-bb.de/geobasis/daten/3d_gebaeude/lod2_gml/lod2_33{E}-{N}.zip', tileKm: 1, zip: '_geb.gml' }, attribution: 'GeoBasis-DE/LGB 2026, dl-de/by-2-0' },
// Berlin: Höhen aus dem WCS Brandenburg (deckt Berlin ab, 2 s statt 69 s mit den XYZ-Kacheln von Berlin, gleiche Werte)
{ id: 'be', roads: OSM_ROADS, name: 'Berlin (Geoportal Berlin)', land: 'Berlin', crs: 'EPSG:25833', dgm: { url: 'https://isk.geobasis-bb.de/ows/dgm_wcs', coverage: 'bb_dgm' },
  dop: { url: 'https://gdi.berlin.de/services/wms/truedop_2024', layer: 'truedop_2024' },
  lod2: { url: 'https://gdi.berlin.de/data/a_lod2/atom/LoD2_{E}_{N}.zip', tileKm: 1, zip: '.xml' }, attribution: 'Geoportal Berlin, dl-de/zero-2-0; GeoBasis-DE/LGB 2026, dl-de/by-2-0' },
{ id: 'ni', roads: OSM_ROADS, name: 'Niedersachsen (LGLN)', land: 'Niedersachsen', crs: 'EPSG:25832', dgm: { stac: 'https://dgm.stac.lgln.niedersachsen.de', coll: 'dgm1', km: 1 },
  dop: { url: 'https://opendata.lgln.niedersachsen.de/doorman/noauth/dop_wms', layer: 'ni_dop20' },
  lod2: { url: 'https://lod2.opengeodata.lgln.niedersachsen.de/LoD2_32_{E}_{N}_1_ni.gml', tileKm: 1 },
  dlm: { url: 'https://single-datasets.s3.eu-de.cloud-object-storage.appdomain.cloud/bdlm/nba_bkg_bdlm_ni_V6.0.zip', water: 'gew01_f.shp', places: ['sie01_f.shp', 'sie01_f.dbf'],  mb: 22 }, attribution: 'LGLN 2026, CC BY 4.0' },
{ id: 'rp', roads: OSM_ROADS, name: 'Rheinland-Pfalz (GeoBasis-RLP)', land: 'Rheinland-Pfalz', crs: 'EPSG:25832', dgm: { index: 'https://geobasis-rlp.de/data/dgm1/current/tif/', tpl: 'dgm1_32_{e}_{n}_1_rp_', km: 1 },
  dop: { url: 'https://geo4.service24.rlp.de/wms/rp_dop20.fcgi', layer: 'rp_dop20' },
  lod2: { url: 'https://geobasis-rlp.de/data/geb3dlo/current/gml/LoD2_32_{E}_{N}_2_RP.gml', tileKm: 2 }, attribution: 'GeoBasis-DE / LVermGeoRP 2026, dl-de/by-2-0' },
{ id: 'mv', roads: OSM_ROADS, name: 'Mecklenburg-Vorpommern (LAiV)', land: 'Mecklenburg-Vorpommern', crs: 'EPSG:25833', dgm: { url: 'https://www.geodaten-mv.de/dienste/dgm_wcs', coverage: 'mv_dgm' },
  dop: { url: 'https://www.geodaten-mv.de/dienste/adv_dop', layer: 'mv_dop' },
  lod2: { url: 'https://www.geodaten-mv.de/dienste/gebaeude_download?index=0&dataset=8397b554-5cb9-4274-8be8-c20490d9a6e8&file=lod2_33_{E}_{N}_2_gml.zip', tileKm: 2, zip: '.gml' }, attribution: 'GeoBasis-DE/M-V 2026, CC BY 4.0' },
// WCS gefunden am 21.11.2026 (Prompt 221): Baden-Württemberg (INSPIRE, Achsen E und N), Saarland (INSPIRE, Werte in cm)
{ id: 'bw', roads: OSM_ROADS, name: 'Baden-Württemberg (LGL)', land: 'Baden-Württemberg', crs: 'EPSG:25832',
  dgm: { url: 'https://owsproxy.lgl-bw.de/owsproxy/wcs/WCS_INSP_BW_Hoehe_Coverage_DGM1', coverage: 'EL.ElevationGridCoverage', axes: ['E', 'N'] },
  dop: { url: 'https://owsproxy.lgl-bw.de/owsproxy/ows/WMS_LGL-BW_ATKIS_DOP_20_C', layer: 'IMAGES_DOP_20_RGB' }, attribution: 'LGL, www.lgl-bw.de, dl-de/by-2-0' },
{ id: 'sl', roads: OSM_ROADS, name: 'Saarland (LVGL)', land: 'Saarland', crs: 'EPSG:25832',
  dgm: { url: 'https://geoportal.saarland.de/gdi-sl/inspireraster/inspirewcsel', coverage: 'EL.GridCoverage', scale: 0.01 },
  dop: { url: 'https://geoportal.saarland.de/freewms/dop2023', layer: 'sl_dop20_rgb' }, attribution: 'LVGL Saarland 2026' },
// Nur Luftbild (Höhen aus der Welt-Quelle, bis ein WCS gefunden ist)
...[['by', 'Bayern', 'https://geoservices.bayern.de/od/wms/dop/v1/dop40', 'by_dop40c', 'Bayerische Vermessungsverwaltung 2026, CC BY 4.0'],
  ['hb', 'Bremen', 'https://geodienste.bremen.de/wms_dop20_2023', 'DOP20_2023_HB', 'Landesamt GeoInformation Bremen, CC BY'],
  ['he', 'Hessen', 'https://www.gds-srv.hessen.de/cgi-bin/lika-services/ogc-free-images.ows', 'he_dop_rgb', 'HVBG, Nutzung frei (HVGG § 24)', 3000],
  ['sh', 'Schleswig-Holstein', 'https://dienste.gdi-sh.de/WMS_SH_DOP20col_OpenGBD', 'sh_dop20_rgb', '© GeoBasis-DE/LVermGeo SH/CC BY 4.0'],
  ['sn', 'Sachsen', 'https://geodienste.sachsen.de/wms_geosn_dop-rgb/guest', 'sn_dop_020', 'GeoSN 2026, dl-de/by-2-0'],
  ['st', 'Sachsen-Anhalt', 'https://www.geodatenportal.sachsen-anhalt.de/wss/service/ST_LVermGeo_DOP_WMS_OpenData/guest', 'lsa_lvermgeo_dop20_2', 'GeoBasis-DE / LVermGeo ST 2026, dl-de/by-2-0']
].map(([id, land, url, layer, attribution, max]) => ({ id, name: land + ' (Luftbild)', land, crs: 'EPSG:25832', dgm: null, roads: OSM_ROADS, dop: { url, layer, max: max || 0 }, attribution })),
{
  // WMS-Höhendienst (Etappe W2, docs/plan-gelaende-wms.md): Höhen eines OGC-WMS in EPSG:4326, etwa vom Rechner einer DIS-Übung.
  // Gilt überall (box null), ohne Gebäude, Bäume, Luftbild. Nie im Browser speichern (Lizenz der Quelle). use: 'dis' (nur für den
  // Startort DIS-Übung, Etappe W3), 'all' (auch „Ort laden“) oder 'nie'. vref: Höhen über dem Ellipsoid oder über dem Meer.
  id: 'wms-lokal', kind: 'wms', name: 'WMS-Höhendienst (lokaler Rechner)', land: '', box: null,
  hgt: { url: 'http://localhost:7071/ows', layer: '', tile: 256 }, vref: 'ellipsoid', use: 'dis', store: false,
  attribution: 'Gelände des WMS-Höhendienstes'
}, {
  // Weltweite Höhe (Etappe Q2, docs/plan-quellen.md): AWS Terrain Tiles (Mapzen, AWS Open Data), GeoTIFF 512² Int16 in Metern über
  // dem Meer, Web-Mercator-Kacheln {z}/{x}/{y}. Ersatz für Copernicus DEM (sperrt den Browser, gemessen 20.11.2026). Gilt überall, wo
  // keine Landesquelle greift (letzte Stelle der Liste). Ohne Luftbild: schattiertes Relief. zmax 12 (etwa 12 m je Pixel bei 50° Breite;
  // Annahme: die Quelldaten sind meist 25 bis 90 m fein, feiner bringt nichts). Lizenz: Quellenvermerk nach
  // github.com/tilezen/joerd/blob/master/docs/attribution.md (gekürzt; vollständig in docs/plan-quellen.md).
  id: 'welt', kind: 'wms', tiles: 'terrain', name: 'Welt: Höhen (AWS Terrain Tiles)', land: '', box: null,
  hgt: { url: 'https://elevation-tiles-prod.s3.amazonaws.com/geotiff/{z}/{x}/{y}.tif', zmax: 12 }, vref: 'msl', use: 'all', roads: OSM_ROADS,
  attribution: 'Höhen: Mapzen Terrain Tiles; EU-DEM (Copernicus, EU), SRTM, GMTED2010, 3DEP (USGS), ETOPO1 (NOAA) u. a.'
}];
// UTM-Zone aus dem Koordinatensystem einer Quelle oder eines Gebiets (EPSG:258xx)
export const crsZone = crs => +((String(crs).match(/258(\d\d)/)) || [0, 32])[1];
// Rastergrößen: Höhen 512² (knapp 2 m), Luftbild 4096² (0,25 m) für 1 x 1 km
export const RW_GRIDN = 512, RW_DOPN = 4096;
// Umgebung (L5a): 10 x 10 km um das Gebiet, Höhen alle 25 m, Luftbild 2048² (knapp 5 m). Ein WCS liefert Werte für
// Zellmitten; 401 Zellen über 10 025 m legen die Messpunkte auf -5000, -4975, ... 5000 m. So liegen die Ränder des
// 1-km-Gebiets (±500 m) genau auf Messpunkten, und die Netze passen ohne Risse aneinander.
export const RW_FAR = { size: 10025, n: 401, dop: 2048 };

// Abruf-Adressen (WCS 2.0.1 GetCoverage, WMS 1.3.0 GetMap)
export function wcsUrl(svc, bbox, crs, n) {
  const [e0, n0, e1, n1] = bbox, c = 'http://www.opengis.net/def/crs/EPSG/0/' + crs.split(':')[1], [X, Y] = svc.axes || ['x', 'y'];   // Achsen des Ausschnitts: BW E, N
  return `${svc.url}?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=${svc.coverage}&FORMAT=image/tiff`
    + `&SUBSET=${X}(${e0},${e1})&SUBSET=${Y}(${n0},${n1})&SUBSETTINGCRS=${c}&OUTPUTCRS=${c}&SCALESIZE=x(${n}),y(${n})`;   // Skalierung bei BW trotzdem x, y (gemessen)
}
// WCS-Antwort lesen (auch Deflate); svc.scale rechnet die Einheit um (Saarland: Zentimeter)
export async function wcsTiff(svc, u8) {
  const t = await readTiffAsync(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
  if (svc.scale) for (let k = 0; k < t.data.length; k++) if (t.data[k] !== t.nodata) t.data[k] *= svc.scale;
  return t;
}
export function wmsUrl(svc, bbox, crs, n) {
  if (svc.max) n = Math.min(n, svc.max);   // Größtes Bild des Dienstes (Hessen 3000)
  return `${svc.url}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${svc.layer}&STYLES=&CRS=${crs}`
    + `&BBOX=${bbox.join(',')}&WIDTH=${n}&HEIGHT=${n}&FORMAT=image/jpeg`;
}
// Gebäude-Kacheln (km-Raster), die das Gebiet berühren
export function lod2Urls(svc, bbox) {
  const k = 1000*(svc.tileKm || 1), out = [];
  for (let e = Math.floor(bbox[0]/k); e < Math.ceil(bbox[2]/k); e++) for (let n = Math.floor(bbox[1]/k); n < Math.ceil(bbox[3]/k); n++)
    out.push(svc.url.replace('{E}', e*(svc.tileKm || 1)).replace('{N}', n*(svc.tileKm || 1)));
  return out;
}
// Quelle für einen Punkt (UTM): die erste, deren Gebiet ihn enthält
// Quelle für einen Punkt (UTM): die erste, deren Gebiet ihn enthält. landAt(E, N) (Deutschlandkarte, falls vorhanden)
// prüft genauer: Quellen mit Land gelten nur in diesem Land (das Rechteck allein reicht bis Niedersachsen und Belgien).
export function rwSourceAt(E, N, list = RW_SOURCES, landAt = null) {
  const land = landAt ? landAt(E, N) : null;
  // Rechteck, falls da; Land immer (Q3: Vorlagen ohne Rechteck galten sonst überall). Ohne Deutschlandkarte zählt eine Quelle mit Land nur mit Rechteck.
  return list.find(s => s.kind !== 'wms' && (!s.box || (E >= s.box[0] && E <= s.box[2] && N >= s.box[1] && N <= s.box[3])) && (!s.land || (landAt ? s.land === land : !!s.box))) || null;   // WMS-Höhendienste wählt rwPlan
}

// Grundrisse der Gebäude als Raster (Dächer aus LoD2, um dil Zellen verbreitert): 1 = Gebäude
export function roofMask(roofs, n, bbox, dil = 1) {
  const cell = (bbox[2] - bbox[0])/n, mask = new Uint8Array(n*n);
  const gi = e => (e - bbox[0])/cell - 0.5, gj = nn => (bbox[3] - nn)/cell - 0.5;
  for (let t = 0; t < roofs.length; t += 3) {
    const P = [roofs[t], roofs[t + 1], roofs[t + 2]].map(p => [gi(p[0]), gj(p[1])]);
    const i0 = Math.floor(Math.min(P[0][0], P[1][0], P[2][0])) - 1, i1 = Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])) + 1;
    const j0 = Math.floor(Math.min(P[0][1], P[1][1], P[2][1])) - 1, j1 = Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])) + 1;
    const cr = (p, q, r) => (q[0] - p[0])*(r[1] - p[1]) - (q[1] - p[1])*(r[0] - p[0]);
    for (let j = Math.max(0, j0); j <= Math.min(n - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(n - 1, i1); i++) {
      const c = [i, j], d1 = cr(P[0], P[1], c), d2 = cr(P[1], P[2], c), d3 = cr(P[2], P[0], c);
      const inT = !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
      if (inT) for (let y = -dil; y <= dil; y++) for (let x = -dil; x <= dil; x++) if (i + x >= 0 && i + x < n && j + y >= 0 && j + y < n) mask[(j + y)*n + i + x] = 1;
    }
  }
  return mask;
}
// Startplatz: flachste Stelle (Spanne der Höhen in 12 m Umkreis) nahe dem Wunschpunkt, nicht in oder an einem Gebäude
// (mask: Grundrisse, 6 m Abstand). Suche erst bis 80 m, sonst 200 m, sonst 480 m (Innenstadt). Ohne freie Stelle: null.
export function findStart(h, n, bbox, near, mask = null) {
  const cell = (bbox[2] - bbox[0])/n, at = (i, j) => h[j*n + i], R = Math.ceil(6/cell);
  const ci = Math.round((near[0] - bbox[0])/cell - 0.5), cj = Math.round((bbox[3] - near[1])/cell - 0.5);
  const built = (i, j) => { if (!mask) return false; for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) if (mask[(j + y)*n + i + x]) return true; return false; };
  for (const rad of [80, 200, 480]) {
    const k = Math.ceil(rad/cell);
    let best = null;
    for (let j = cj - k; j <= cj + k; j++) for (let i = ci - k; i <= ci + k; i++) {
      if (Math.hypot(i - ci, j - cj)*cell > rad || i < 6 || j < 6 || i >= n - 6 || j >= n - 6) continue;
      let lo = 1e9, hi = -1e9;
      for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) { const v = at(i + x, j + y); lo = Math.min(lo, v); hi = Math.max(hi, v); }
      if (!(hi - lo >= 0)) continue;   // Fenster mit ungültigen Werten (NaN) nie als Start
      if (best && hi - lo >= best.s) continue;
      if (built(i, j)) continue;       // im oder am Gebäude: das Höhenmodell zeigt dort den Boden, die Drohne säße im Haus
      best = { i, j, s: hi - lo };
    }
    if (best) return best;
  }
  return null;
}
// Bäume: Oberfläche minus Gelände (nDOM). Baumspitze = höchster Punkt im Umkreis von 6 m, mindestens 3 m hoch,
// nicht auf einem Gebäude (Dächer werden ins Raster gezeichnet und um 1 Zelle verbreitert). Kronenradius ~ 0,3 x Höhe (Schätzung).
export function findTrees(dgm, dom, roofs, n, bbox) {
  const cell = (bbox[2] - bbox[0])/n, half = (bbox[2] - bbox[0])/2, mask = roofMask(roofs, n, bbox, 1);
  const nd = new Float32Array(n*n);
  for (let k = 0; k < n*n; k++) { const v = dom[k] - dgm[k]; nd[k] = mask[k] || !isFinite(v) ? 0 : Math.max(0, v); }   // ohne Wert: kein Baum
  const trees = [], R = 3;
  for (let j = R; j < n - R; j++) for (let i = R; i < n - R; i++) {
    const v = nd[j*n + i];
    if (!(v >= 3 && v <= 45)) continue;
    let top = true;
    for (let y = -R; y <= R && top; y++) for (let x = -R; x <= R; x++) {
      if (!x && !y || x*x + y*y > R*R) continue;
      const w = nd[(j + y)*n + i + x];
      if (w > v || (w === v && (y < 0 || (y === 0 && x < 0)))) { top = false; break; }
    }
    if (top) trees.push([(i + 0.5)*cell - half, (j + 0.5)*cell - half, v, Math.min(5, Math.max(1.5, v*0.3)), i, j]);
  }
  return dropWires(trees, nd, n, cell).map(t => t.slice(0, 4));
}
// Freileitungen (Nutzer, Prompt 171: „Bäume auf den Straßen“ in Attendorn): Die Oberfläche enthält die Leiterseile, jeder Hochpunkt
// darunter wurde ein Baum, quer über Straßen und Felder. Erkennung: Hochpunkt über 10 m, aber schmal (im Umkreis 3 Zellen weniger
// als 12 % der Zellen über der halben Höhe; eine Krone füllt mehr). Liegen mindestens 6 solche Punkte auf einer Geraden (3 m
// Abstand), ist es eine Leitung: alle Hochpunkte bis 6 m daneben fallen weg (auch über Hecken unter der Leitung). Einzelne schmale
// Punkte bleiben (junge Bäume). Schwellen geschätzt und an Attendorn geprüft (5 Leiterseile, 419 von 1 774 Punkten, sonst keiner).
export const RW_WIRE = { minH: 10, fill: 0.12, near: 3, need: 6, drop: 6, rounds: 8, pairs: 6000 };
export function dropWires(trees, nd, n, cell) {
  const W = RW_WIRE, thin = [];
  for (const t of trees) {
    const [, , v, , i, j] = t;
    if (v <= W.minH) continue;
    let tot = 0, hi = 0;
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
      if (x*x + y*y > 9 || i + x < 0 || j + y < 0 || i + x >= n || j + y >= n) continue;
      tot++; if (nd[(j + y)*n + i + x] > 0.5*v) hi++;
    }
    if (hi/tot < W.fill) thin.push(t);
  }
  if (thin.length < W.need) return trees;
  let rest = thin, seed = 12345;
  const rnd = () => (seed = (seed*1103515245 + 12345) % 2147483648)/2147483648, lines = [];
  for (let r = 0; r < W.rounds && rest.length >= W.need; r++) {
    let best = null;
    const m = rest.length, all = m*(m - 1)/2 <= W.pairs;
    for (let k = 0; k < (all ? m*(m - 1)/2 : W.pairs); k++) {
      let a, b;
      if (all) { a = Math.floor((1 + Math.sqrt(1 + 8*k))/2); b = k - a*(a - 1)/2; } else { a = Math.floor(rnd()*m); b = Math.floor(rnd()*m); }
      const A = rest[a], B = rest[b], dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz);
      if (L < 10 || L > 150) continue;
      const ux = dx/L, uz = dz/L;
      let cnt = 0; for (const q of rest) if (Math.abs((q[0] - A[0])*uz - (q[1] - A[1])*ux) < W.near) cnt++;
      if (!best || cnt > best.cnt) best = { A, ux, uz, cnt };
    }
    if (!best || best.cnt < W.need) break;
    const on = rest.filter(q => Math.abs((q[0] - best.A[0])*best.uz - (q[1] - best.A[1])*best.ux) < W.near), s = on.map(q => (q[0] - best.A[0])*best.ux + (q[1] - best.A[1])*best.uz);
    lines.push({ ...best, s0: Math.min(...s) - 10, s1: Math.max(...s) + 10 });
    rest = rest.filter(q => !on.includes(q));
  }
  if (!lines.length) return trees;
  return trees.filter(q => !lines.some(l => { const s = (q[0] - l.A[0])*l.ux + (q[1] - l.A[1])*l.uz; return s > l.s0 && s < l.s1 && Math.abs((q[0] - l.A[0])*l.uz - (q[1] - l.A[1])*l.ux) < W.drop; }));
}
// Gebäudenutzung (ALKIS-Gebäudefunktion, steht in LoD2 als bldg:function) -> Fassadenklasse. Bedeutung der Codes geprüft
// gegen den ALKIS-WFS NRW (Feld „funktion“ als Text). 0 Wohnen, 1 Wohnen mit Laden, 2 Garage/Überdachung, 3 Gewerbe,
// 4 Landwirtschaft, 5 öffentlich, 6 Kirche/Burg/Turm, 8 Brücke (AX_BauwerkImVerkehrsbereich 53001, in LoD2 NRW als Platte,
// gesichert an Monschau 08.11.2026). Unbekannt: Wohnen. (7 vergibt das Netz selbst: Fachwerk.)
export function bldClass(fn) {
  if (/^53001_/.test(fn)) return 8;
  if (/^31001_(1100)$/.test(fn)) return 1;
  if (/^31001_246\d$|^51009_/.test(fn)) return fn === '31001_2461' || fn === '31001_2462' ? 3 : 2;
  if (/^31001_2[0-6]\d\d$/.test(fn)) return 3;
  if (/^31001_27\d\d$/.test(fn)) return 4;
  if (/^31001_(3041|3043|3038)$|^51001_|^51007_/.test(fn)) return 6;
  if (/^31001_3\d\d\d$/.test(fn)) return 5;
  return 0;
}

// Gebiet laden und packen. a: { bbox, crs, startNear [E, N], name, place, attribution }, src: Quelle oder Liste von Quellen
// (erste = Hauptquelle, alle im selben Koordinatensystem). get(url) liefert ein Uint8Array (oder wirft); text(url) liefert Text
// oder null (Kachel fehlt). say(Schritt, Anteil 0..1).
// Mehrere Quellen (Landesgrenze, L3): opt.cells = Raster RW_CELLS² mit der Nummer der Quelle je Zelle (rwCellSources). Höhen und
// Oberfläche: je Bildpunkt die Quelle seiner Zelle, fehlt dort ein Wert, die nächste mit Wert. Gebäude: aus der Quelle der Zelle,
// in der ihre Mitte liegt. Luftbild: opt.mergeImg(bilder, cells) setzt im Browser zusammen; ohne sie nur die Hauptquelle.
export const RW_CELLS = 64;
// ---- Höhen aus Kacheldateien (Q3) ----
// Zuletzt gelesene Kacheln als Gitter (Startgebiet, Umgebung und Nachladen brauchen oft dieselben), höchstens 8 (je bis 16 MB)
const tileGrids = new Map(), tileLists = new Map();
const memo = (map, key, max, fn) => {
  if (!map.has(key)) { map.set(key, fn().catch(e => { map.delete(key); throw e; })); if (map.size > max) map.delete(map.keys().next().value); }
  return map.get(key);
};
// Teilabruf (get.range aus rwNet), sonst die ganze Datei
const rangeOf = (u, get) => get.range ? (a, b) => get.range(u, a, b) : async (a, b) => (await get(u)).subarray(a, b + 1);
// Eine Kachel (Adresse u) als Gitter. e, n: linke untere Ecke in m, kmm: Kantenlänge in m
async function tileGrid(svc, u, e, n, kmm, get) {
  // ZIP ganz laden: je ZIP eine Kachel, Teilabrufe sparen nichts, und die Größe (Content-Range) gibt der Browser hier nicht frei
  // (Brandenburg, gemessen in Chromium 21.11.2026: „kein ZIP“)
  let u8 = await get(u);
  if (svc.zip) { const z = u8; u8 = await zipGet(async (a, b) => z.subarray(a, b + 1), z.length, svc.zip); }
  if (svc.zip === '.xyz') return xyzGrid(new TextDecoder().decode(u8));
  const t = await readTiffAsync(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)), d = kmm/t.w;
  return { x0: e + d/2, y0: n + kmm - d/2, d, w: t.w, h: t.h, data: t.data, nodata: t.nodata };
}
// Raster n x n für bbox aus den Kacheln einer Quelle (svc = src.dgm). Fehlende Kacheln (404) bleiben NaN. Liefert { w, h, data, nodata }.
export async function tileRaster(svc, bbox, crs, n, get, text) {
  const out = new Float32Array(n*n).fill(NaN), put = v => { for (let k = 0; k < v.length; k++) if (!isNaN(v[k]) && isNaN(out[k])) out[k] = v[k]; };
  if (svc.stac) {   // Katalog: Einträge im geografischen Rechteck, je Eintrag ein COG
    const z = crsZone(crs), c = [[bbox[0], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]], [bbox[2], bbox[1]]].map(([x, y]) => fromUtm(x, y, z));
    const bb = [Math.min(...c.map(p => p[1])), Math.min(...c.map(p => p[0])), Math.max(...c.map(p => p[1])), Math.max(...c.map(p => p[0]))].map(v => v.toFixed(6)).join(',');
    const items = JSON.parse(await text(svc.stac + '/search?collections=' + svc.coll + '&bbox=' + bb + '&limit=50') || '{}').features || [];
    for (const it of items) {
      const as = Object.values(it.assets || {}).find(x => /tiff/i.test(x.type || '') || /\.tif$/i.test(x.href));
      if (!as) continue;
      const cog = await memo(tileGrids, as.href, 8, () => cogOpen(rangeOf(as.href, get))), L = cog.levels[0];
      const v = (await cogWindow(cog, bbox, n)).data;
      put(gridMask(v, bbox, n, [cog.x0 - cog.dx/2, cog.y0 - (L.h - 0.5)*cog.dy, cog.x0 + (L.w - 0.5)*cog.dx, cog.y0 + cog.dy/2]));
    }
  } else {   // Kacheln im km-Raster
    const k = 1000*(svc.km || 1), list = svc.index ? await memo(tileLists, svc.index, 4, async () => (await text(svc.index)) || '') : null;
    for (let e = Math.floor(bbox[0]/k)*k; e < bbox[2]; e += k) for (let nn = Math.floor(bbox[1]/k)*k; nn < bbox[3]; nn += k) {
      const name = svc.tpl.replace('{e}', e/1000).replace('{n}', nn/1000);
      let u = name;
      if (list) { const m = list.match(new RegExp('href="([^"]*' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^"]*\\.tif)"')); if (!m) continue; u = new URL(m[1], svc.index).href; }
      const g = await memo(tileGrids, u, 8, () => tileGrid(svc, u, e, nn, k, get)).catch(err => { if (/ 404|fehlt/.test(err.message)) return null; throw err; });
      if (g) put(gridTo(g, bbox, n));
    }
  }
  return { w: n, h: n, data: out, nodata: NaN };
}
// Gebäude-Kachel als Text; lod2.zip (Q5): ZIP ganz laden, Datei darin (Brandenburg, Berlin). Fehlt die Kachel (404): null.
async function lod2Text(svc, u, text, get, prog) {
  if (!svc.zip) return text(u, prog);
  const z = await get(u, prog).catch(e => { if (/ 404/.test(e.message)) return null; throw e; });
  return z && new TextDecoder().decode(await zipGet(async (a, b) => z.subarray(a, b + 1), z.length, svc.zip));
}
export async function rwFetchArea(a, src, get, text, say = () => {}, opt = {}) {
  const srcs = Array.isArray(src) ? src : [src], multi = srcs.length > 1 && opt.cells;
  const n = a.n || RW_GRIDN, buf = u8 => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength), C = RW_CELLS;
  const cellOf = (i, j) => opt.cells[Math.floor(j*C/n)*C + Math.floor(i*C/n)];
  // Raster aus allen Quellen zusammensetzen (ungültig: kein Zahlwert, Füllwert, unter -1000 m)
  const raster = async (key, what) => {
    const got = [];
    for (const s of multi ? srcs : srcs.slice(0, 1)) {
      if (!s[key]) { got.push(null); continue; }
      const t = s[key].coverage ? await wcsTiff(s[key], await get(wcsUrl(s[key], a.bbox, a.crs, n))) : await tileRaster(s[key], a.bbox, a.crs, n, get, text);   // WCS oder Kacheln (Q3)
      if (t.w !== n || t.h !== n) throw new Error(what + 'raster ' + t.w + 'x' + t.h + ' statt ' + n);
      got.push(t);
    }
    if (!multi) return got[0];
    const bad = (t, k) => !t || !isFinite(t.data[k]) || t.data[k] === t.nodata || t.data[k] < -1000;
    const first = got.find(t => t), out = { w: n, h: n, nodata: first ? first.nodata : NaN, data: new Float32Array(n*n) };
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j*n + i, c = cellOf(i, j);
      let t = c >= 0 && !bad(got[c], k) ? got[c] : got.find(g => !bad(g, k));
      out.data[k] = t ? t.data[k] : NaN;
    }
    return out;
  };
  say('Höhen', 0);
  // WMS-Höhendienst: Höhen aus dem Dienst (geografisch, umgerechnet auf unser Gitter); keine Oberfläche, kein Luftbild, keine Gebäude
  const wms = srcs[0].kind === 'wms';
  const dgm = wms || !srcs[0].dgm ? { w: n, h: n, nodata: NaN, data: (await wmsFetchHeights(wms ? srcs[0] : RW_SOURCES.find(x => x.tiles), a.bbox, crsZone(a.crs), n, get)).data } : await raster('dgm', 'Höhen');   // ohne dgm: Welt (Q6)
  if (!dgm) throw new Error('Quelle ohne Höhen (WCS)');
  say('Oberfläche (Bäume)', 0.1);
  const domR = !wms && srcs[0].dgm && (srcs[0].dom || multi) ? await raster('dom', 'Oberflächen') : null, dom = domR ? domR.data : null;
  say('Luftbild', 0.2);
  // Fortschritt beim Herunterladen großer Dateien: Schritt mit MB
  const mb = (what, f, w = 0) => (n, t) => say(what + ' (' + (n/1e6).toFixed(1) + (t ? ' von ' + (t/1e6).toFixed(1) : '') + ' MB)', t ? f + w*n/t : f);   // w: Anteil des Schritts
  let dop = null;
  if (multi && opt.mergeImg) {
    const imgs = [];
    for (const s of srcs) imgs.push(s.dop ? await get(wmsUrl(s.dop, a.bbox, a.crs, a.dopN || RW_DOPN), mb('Luftbild', 0.2, 0.25)).catch(() => null) : null);
    dop = await opt.mergeImg(imgs, opt.cells);
  } else if (srcs[0].dop) dop = await get(wmsUrl(srcs[0].dop, a.bbox, a.crs, a.dopN || RW_DOPN), mb('Luftbild', 0.2, 0.25));
  const inBox = (e, nn) => e >= a.bbox[0] && e <= a.bbox[2] && nn >= a.bbox[1] && nn <= a.bbox[3];
  // Gebäude: je Quelle ihre Kacheln; bei mehreren nur Gebäude, deren Mitte in einer Zelle dieser Quelle liegt
  const bld = { roof: [], wall: [], roofId: [], wallId: [], info: [] };
  const jobs = [];
  (multi ? srcs : srcs.slice(0, 1)).forEach((s, si) => { if (s.lod2) for (const u of lod2Urls(s.lod2, a.bbox)) jobs.push([si, u]); });
  for (let k = 0; k < jobs.length; k++) {
    const [si, u] = jobs[k];
    const step = 'Gebäude ' + (k + 1) + ' von ' + jobs.length, f = 0.45 + 0.45*k/jobs.length;
    say(step, f);
    const keep = !multi ? inBox : (e, nn) => {
      if (!inBox(e, nn)) return false;
      const i = (e - a.bbox[0])/(a.bbox[2] - a.bbox[0])*n, j = (a.bbox[3] - nn)/(a.bbox[3] - a.bbox[1])*n, c = cellOf(Math.min(n - 1, i), Math.min(n - 1, j));
      return c === si || (c < 0 && si === 0);
    };
    let o;
    if (opt.lod2Cache) {   // schon einmal geladen (anderer Ort, Nachbarkachel)? Dann ohne Netz
      let t = await opt.lod2Cache.get(u);
      if (!t) {
        const xml = await lod2Text(srcs[si].lod2, u, text, get, mb(step, f, 0.45/jobs.length));
        t = xml ? lod2Pack(opt.async ? await readLod2Async(xml) : readLod2(xml)) : { empty: true };
        await opt.lod2Cache.put(u, t);
      } else say(step + ' (aus dem Speicher)', f);
      if (t.empty) continue;   // Kachel ohne Gebäude
      o = lod2Filter(lod2Unpack(t), keep);
    } else {
      const xml = await lod2Text(srcs[si].lod2, u, text, get, mb(step, f, 0.45/jobs.length));
      if (!xml) continue;   // Kachel ohne Gebäude
      o = opt.async ? await readLod2Async(xml, keep) : readLod2(xml, keep);
    }
    const base = bld.info.length;
    // Schleifen statt push(...liste): große Kacheln (Innenstadt) sprengen sonst im Browser den Aufrufstapel
    for (const x of o.roof) bld.roof.push(x);
    for (const x of o.wall) bld.wall.push(x);
    for (const x of o.info) bld.info.push(x);
    for (const i of o.roofId) bld.roofId.push(i + base);
    for (const i of o.wallId) bld.wallId.push(i + base);
  }
  say('Bäume', 0.92);
  const p = rwPack(a, dgm, dom, bld, dop);
  if (opt.far !== false) p.far = await rwFetchFar(a, srcs[0], get, say).catch(() => null);   // Umgebung: ohne sie geht es auch
  p.meta.attribution = [...new Set(srcs.map(s => s.attribution).filter(Boolean))].join('; ');
  return p;
}
// Quelle je Zelle (RW_CELLS² über dem Gebiet): Land der Zellmitte -> Nummer der Quelle dieses Landes in srcs, sonst -1.
// toLand(E, N) liefert das Land für einen Punkt im Koordinatensystem des Gebiets.
export function rwCellSources(a, srcs, toLand) {
  const C = RW_CELLS, out = new Int8Array(C*C), w = a.bbox[2] - a.bbox[0], h = a.bbox[3] - a.bbox[1];
  for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) {
    const land = toLand(a.bbox[0] + (i + 0.5)*w/C, a.bbox[3] - (j + 0.5)*h/C);
    out[j*C + i] = srcs.findIndex(s => s.land && s.land === land);
  }
  return out;
}
// Prüfen einer Quelle an einem Punkt (UTM im System der Quelle): kleine Abrufe je Ebene. Rückgabe [{ was, ok, text }].
export async function rwCheckSource(s, E, N, get, text) {
  const bb = [Math.round(E) - 100, Math.round(N) - 100, Math.round(E) + 100, Math.round(N) + 100], out = [];
  const run = async (was, fn) => { try { out.push({ was, ok: true, text: await fn() }); } catch (e) { out.push({ was, ok: false, text: String(e.message || e) }); } };
  const tif = async svc => { const t = await wcsTiff(svc, await get(wcsUrl(svc, bb, s.crs, 16)));
    const ok = [...t.data].filter(v => isFinite(v) && v !== t.nodata && v > -1000); if (!ok.length) throw new Error('nur Füllwerte (Ort außerhalb?)');
    return 'Höhe ' + ok[0].toFixed(1) + ' m'; };
  const tiles = async svc => { const t = await tileRaster(svc, bb, s.crs, 16, get, text), v = [...t.data].filter(x => !isNaN(x)); if (!v.length) throw new Error('keine Kachel an diesem Ort'); return 'Höhe ' + v[0].toFixed(1) + ' m (Kacheln)'; };
  if (s.dgm) await run('Höhen', () => s.dgm.coverage ? tif(s.dgm) : tiles(s.dgm)); else if (s.dgm === null) out.push({ was: 'Höhen', ok: true, text: 'aus der Welt-Quelle' }); else out.push({ was: 'Höhen', ok: false, text: 'fehlt (nötig)' });
  if (s.dom) await run('Oberfläche', () => tif(s.dom));
  if (s.dop) await run('Luftbild', async () => { const b = await get(wmsUrl(s.dop, bb, s.crs, 64)); if (!(b[0] === 0xff && b[1] === 0xd8) && !(b[0] === 0x89 && b[1] === 0x50)) throw new Error('kein Bild'); return (b.length/1024).toFixed(0) + ' KB Bild'; });
  if (s.lod2) await run('Gebäude', async () => { const u = lod2Urls(s.lod2, bb)[0], t = await text(u); if (t === null) return 'keine Kachel an diesem Ort (' + u.split('/').pop() + ')';
    if (!/CityModel/.test(t.slice(0, 5000))) throw new Error('kein CityGML'); return 'Kachel erreichbar (' + u.split('/').pop() + ')'; });
  return out;
}
// Eigene Quellen aus einer Datei lesen (Export dieses Programms). Prüft die nötigen Felder. Rückgabe { sources, errors }.
export function rwSourcesParse(json) {
  let d; try { d = JSON.parse(json); } catch (e) { return { sources: [], errors: ['keine gültige Datei (JSON)'] }; }
  const list = Array.isArray(d) ? d : d && Array.isArray(d.sources) ? d.sources : null;
  if (!list) return { sources: [], errors: ['keine Quellenliste gefunden'] };
  const ok = [], errors = [], url = u => typeof u === 'string' && /^https?:\/\//.test(u);
  list.forEach((s, i) => {
    const e = [];
    if (s && s.kind === 'wms') {   // WMS-Höhendienst: Adresse, Höhenbezug, Geltung
      if (typeof s.name !== 'string' || !s.name) e.push('Name fehlt');
      if (!s.hgt || !url(s.hgt.url)) e.push('Höhendienst: Adresse ungültig');
      if (s.vref && !['ellipsoid', 'msl'].includes(s.vref)) e.push('Höhenbezug nur Ellipsoid oder Meereshöhe');
      if (e.length) { errors.push('Quelle ' + (i + 1) + ': ' + e.join(', ')); return; }
      if (s.tiles === 'terrain') { ok.push({ id: s.id || 'eigen-' + i, kind: 'wms', tiles: 'terrain', name: s.name, land: '', box: null, hgt: { url: s.hgt.url, zmax: Math.min(15, Math.max(0, +s.hgt.zmax || 12)) }, vref: 'msl', use: s.use === 'nie' ? 'nie' : 'all', attribution: s.attribution || s.name }); return; }   // Kacheln {z}/{x}/{y} (Q2)
      ok.push({ id: s.id || 'eigen-' + i, kind: 'wms', name: s.name, land: '', box: null, hgt: { url: s.hgt.url.replace(/\?.*$/, ''), layer: s.hgt.layer || '', tile: s.hgt.tile || 256 },
        vref: s.vref || 'ellipsoid', use: ['dis', 'all', 'nie'].includes(s.use) ? s.use : 'dis', store: false, attribution: s.attribution || s.name });
      return;
    }
    if (!s || typeof s.name !== 'string' || !s.name) e.push('Name fehlt');
    if (!s || !['EPSG:25832', 'EPSG:25833'].includes(s.crs)) e.push('Koordinatensystem nur EPSG:25832 oder EPSG:25833');
    if (s && s.dgm && !s.dgm.tpl && !s.dgm.stac && !s.dgm.index && (!url(s.dgm.url) || !s.dgm.coverage)) e.push('Höhen: WCS-Adresse und Coverage nötig (oder leer: Welt-Quelle)');
    for (const k of ['dom', 'dop', 'lod2']) if (s && s[k] && !url(s[k].url)) e.push(k + ': Adresse ungültig');
    if (s && s.dom && !s.dom.coverage) e.push('Oberfläche: Coverage-ID fehlt');
    if (s && s.dop && !s.dop.layer) e.push('Luftbild: Layer fehlt');
    if (!s || !s.land) e.push('Bundesland fehlt');
    if (s && s.lod2 && !/\{E\}/.test(s.lod2.url)) e.push('Gebäude: Muster braucht {E} und {N}');
    if (e.length) errors.push('Quelle ' + (i + 1) + ': ' + e.join(', '));
    else ok.push({ id: s.id || 'eigen-' + i, name: s.name, land: s.land || '', crs: s.crs, dgm: s.dgm || null, dom: s.dom || null, dop: s.dop || null, lod2: s.lod2 || null, roads: s.roads || null, dlm: s.dlm || null, attribution: s.attribution || s.name });
  });
  return { sources: ok, errors };
}
// Packen wie die eingebetteten Dateien: Höhen 16 Bit in dm über dem tiefsten Punkt; Gebäude als 16 Bit in dm
// (Kartenkoordinaten: Mitte = Ursprung, x nach Osten, z nach Süden, y über dem Startplatz), erst Dächer, dann Wände,
// dahinter je Dreieck die Gebäudenummer und je Gebäude Klasse + 16 x Flachdach; Bäume x, z, Höhe, Kronenradius in dm.
export function rwPack(a, dgm, dom, bld, dop) {
  const n = dgm.w;
  let lo = 1e9, hi = -1e9;
  for (const v of dgm.data) if (isFinite(v) && v !== dgm.nodata && v > -1000) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (!(hi >= lo)) throw new Error('Keine gültigen Höhen im Gebiet');
  // Ungültige Höhen (Füllwert, NaN aus dem Zusammensetzen) durch den tiefsten Wert ersetzen; Oberfläche dort = Gelände (kein Baum)
  const H = new Float32Array(n*n), q = new Uint16Array(n*n);
  for (let i = 0; i < q.length; i++) { const v = dgm.data[i], ok = isFinite(v) && v !== dgm.nodata && v > -1000; H[i] = ok ? v : lo; q[i] = Math.round((H[i] - lo)*10); }
  if (dom) dom = dom.map((v, i) => isFinite(v) && v > -1000 ? v : H[i]);
  dgm = { ...dgm, data: H };
  const near = a.startNear || [(a.bbox[0] + a.bbox[2])/2, (a.bbox[1] + a.bbox[3])/2];
  // Start nicht in Gebäuden; ganz ohne freie Stelle (geschlossene Bebauung im ganzen Gebiet) zur Not wie früher, ohne Maske
  const st = findStart(dgm.data, n, a.bbox, near, roofMask(bld.roof, n, a.bbox, 0)) || findStart(dgm.data, n, a.bbox, near), cell = (a.bbox[2] - a.bbox[0])/n, half = (a.bbox[2] - a.bbox[0])/2;
  const home = [(st.i + 0.5)*cell - half, (st.j + 0.5)*cell - half];
  const meta = { name: a.name, place: a.place, crs: a.crs, bbox: a.bbox, n, hMin: lo, hMax: hi, hScale: 0.1,
    home: home.map(v => +v.toFixed(1)), hHome: +dgm.data[st.j*n + st.i].toFixed(2), startSpan: +st.s.toFixed(2), startV: 2, attribution: a.attribution };
  const ec = (a.bbox[0] + a.bbox[2])/2, nc = (a.bbox[1] + a.bbox[3])/2, hHome = meta.hHome;
  const pts = bld.roof.concat(bld.wall), ids = bld.roofId.concat(bld.wallId), nb = bld.info.length;
  const b16 = new Int16Array(pts.length*3 + ids.length + nb);
  pts.forEach((p, k) => { b16[k*3] = Math.round((p[0] - ec)*10); b16[k*3 + 1] = Math.round((p[2] - hHome)*10); b16[k*3 + 2] = Math.round(-(p[1] - nc)*10); });
  ids.forEach((v, k) => { b16[pts.length*3 + k] = v; });
  bld.info.forEach((f, k) => { b16[pts.length*3 + ids.length + k] = bldClass(f.fn) + (f.roof === '1000' ? 16 : 0); });
  const trees = dom ? findTrees(dgm.data, dom, bld.roof, n, a.bbox) : [], t16 = new Int16Array(trees.length*4);
  trees.forEach((tr, k) => t16.set(tr.map(v => Math.round(v*10)), k*4));
  Object.assign(meta, { roofTris: bld.roof.length/3, wallTris: bld.wall.length/3, buildings: nb, trees: trees.length });
  return { meta, q, b16, t16, dop, info: bld.info };
}
// Gebiet 1 x 1 km um einen Punkt (Breite/Länge schon in UTM umgerechnet), auf ganze Meter
export function rwAreaAt(E, N, src, size = 1000) {
  const e = Math.round(E), nn = Math.round(N), h = size/2;
  return { bbox: [e - h, nn - h, e + h, nn + h], crs: src.crs, startNear: [e, nn], name: 'live', place: '', attribution: src.attribution };
}
// Gespeicherte Gebiete von vor dem Fix „Start nicht im Gebäude“ (ohne meta.startV): Startplatz neu suchen.
// Nur home ändert sich; die Höhenbezüge (hHome) bleiben, denn Gebäude und Bäume sind relativ dazu gespeichert.
export function rwFixStart(p) {
  const m = p.meta;
  if (m.startV >= 2) return false;
  const n = m.n, bb = m.bbox, ec = (bb[0] + bb[2])/2, nc = (bb[1] + bb[3])/2, half = (bb[2] - bb[0])/2, cell = (bb[2] - bb[0])/n;
  const H = new Float32Array(n*n); for (let i = 0; i < n*n; i++) H[i] = m.hMin + p.q[i]*m.hScale;
  const roofs = []; for (let k = 0; k < m.roofTris*3; k++) roofs.push([ec + p.b16[k*3]/10, nc - p.b16[k*3 + 2]/10]);
  const st = findStart(H, n, bb, [ec, nc], roofMask(roofs, n, bb, 0));
  if (st) m.home = [+((st.i + 0.5)*cell - half).toFixed(1), +((st.j + 0.5)*cell - half).toFixed(1)];
  m.startV = 2;
  return true;
}
// Umgebung (L5a) laden: grobe Höhen und Luftbild für 10 x 10 km um die Mitte des Gebiets. Lücken (Füllwerte, etwa im
// Nachbarland) mit dem nächsten gültigen Wert füllen. Rückgabe { meta: { n, size, hMin, hScale }, q (16 Bit, dm über hMin), dop }.
export async function rwFetchFar(a, src, get, say = () => {}) {
  const c = [(a.bbox[0] + a.bbox[2])/2, (a.bbox[1] + a.bbox[3])/2], h = RW_FAR.size/2, n = RW_FAR.n, bb = [c[0] - h, c[1] - h, c[0] + h, c[1] + h];
  say('Umgebung (Höhen)', 0.94);
  if (src.kind === 'wms' || !src.dgm || !src.dgm.coverage) {   // WMS-Höhendienst, oder Land ohne WCS (Q3/Q6): Höhen der Welt-Quelle
    const v = (await wmsFetchHeights(src.kind === 'wms' ? src : RW_SOURCES.find(x => x.tiles), bb, crsZone(a.crs), n, get)).data;
    let lo = Infinity; for (const x of v) if (x < lo) lo = x;
    const dop = src.dop ? await get(wmsUrl(src.dop, bb, a.crs, RW_FAR.dop)).catch(() => null) : null;   // Luftbild des Landes, falls da
    return { meta: { n, size: RW_FAR.size, hMin: lo, hScale: 0.1 }, q: Uint16Array.from(v, x => Math.round((x - lo)*10)), dop };
  }
  const t = await wcsTiff(src.dgm, await get(wcsUrl(src.dgm, bb, a.crs, n)));
  if (t.w !== n || t.h !== n) throw new Error('Umgebung: Raster ' + t.w + 'x' + t.h);
  const v = Float32Array.from(t.data, x => isFinite(x) && x !== t.nodata && x > -1000 ? x : NaN);
  rwFillGaps(v, n);
  let lo = Infinity; for (const x of v) if (x < lo) lo = x;
  if (!isFinite(lo)) throw new Error('Umgebung ohne Höhen');
  const q = Uint16Array.from(v, x => Math.round((x - lo)*10));
  say('Umgebung (Luftbild)', 0.96);
  const dop = src.dop ? await get(wmsUrl(src.dop, bb, a.crs, RW_FAR.dop)).catch(() => null) : null;
  return { meta: { n, size: RW_FAR.size, hMin: lo, hScale: 0.1 }, q, dop };
}
// Lücken (NaN) im Raster n x n schrittweise vom Rand der gültigen Werte her füllen (Mittel der gültigen Nachbarn)
export const rwFillGaps = (v, n) => wmsFill(v, n);   // ein Durchlauf in Schichten (rwwms.js, Prüfbericht Nr. 14)

// ---- Zwischenspeicher für LoD2-Kacheln (bereits geladene Gebäude wiederverwenden) ----
// Eine Gebäudekachel (1 km, bis 70 MB Text) wird einmal zerlegt und kompakt gespeichert: Punkte als 32 Bit relativ zur
// Kachelecke (Genauigkeit unter 0,1 mm), je Dreieck die Gebäudenummer, je Gebäude Nutzung, Dachform und Mitte. Nachbarorte
// und Nachladekacheln, die dieselbe Gebäudekachel berühren, holen sie dann aus dem Speicher statt aus dem Netz.
export function lod2Pack(o) {
  const all = o.roof.concat(o.wall);
  let E0 = Infinity, N0 = Infinity; for (const p of all) { if (p[0] < E0) E0 = p[0]; if (p[1] < N0) N0 = p[1]; }
  if (!all.length) { E0 = 0; N0 = 0; }
  E0 = Math.floor(E0/1000)*1000; N0 = Math.floor(N0/1000)*1000;
  const pts = new Float32Array(all.length*3);
  all.forEach((p, k) => { pts[k*3] = p[0] - E0; pts[k*3 + 1] = p[1] - N0; pts[k*3 + 2] = p[2]; });
  return { E0, N0, pts, nRoof: o.roof.length, ids: Int32Array.from(o.roofId.concat(o.wallId)), info: o.info };
}
export function lod2Unpack(t) {
  const P = k => [t.pts[k*3] + t.E0, t.pts[k*3 + 1] + t.N0, t.pts[k*3 + 2]], n = t.pts.length/3, nr = t.nRoof;
  const roof = [], wall = [];
  for (let k = 0; k < n; k++) (k < nr ? roof : wall).push(P(k));
  return { roof, wall, roofId: Array.from(t.ids.subarray(0, nr/3)), wallId: Array.from(t.ids.subarray(nr/3)), info: t.info };
}
// Nur die Gebäude, deren Mitte keep(cx, cy) erfüllt; Nummern neu ab 0 (wie readLod2 mit keep)
export function lod2Filter(o, keep) {
  const map = new Map(), out = { roof: [], wall: [], roofId: [], wallId: [], info: [] };
  o.info.forEach((f, i) => { if (keep(f.cx, f.cy)) { map.set(i, out.info.length); out.info.push(f); } });
  const take = (pts, ids, P, I) => { for (let t = 0; t < ids.length; t++) { const m = map.get(ids[t]); if (m === undefined) continue; P.push(pts[t*3], pts[t*3 + 1], pts[t*3 + 2]); I.push(m); } };
  take(o.roof, o.roofId, out.roof, out.roofId); take(o.wall, o.wallId, out.wall, out.wallId);
  return out;
}
