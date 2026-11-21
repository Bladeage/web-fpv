// Quellen prüfen wie der Browser (Etappe Q0/Q1, docs/plan-quellen.md): CORS für unsere Seite, Teilabruf, Format (TIFF, ZIP, Text).
// Nur Node-Bordmittel. Aufruf: node tools/quellen.mjs [Adresse ...]; ohne Adresse die Liste unten (Stand 20.11.2026).
import { tiffIfd } from '../src/geo.js';

const ORIGIN = 'https://bladeage.github.io';
const LIST = [
  ['Brandenburg Höhe', 'https://data.geobasis-bb.de/geobasis/daten/dgm/tif/dgm_33368-5807.zip'],
  ['Berlin Höhe', 'https://gdi.berlin.de/data/dgm1/atom/DGM1_388_5818.zip'],
  ['Niedersachsen Höhe (COG)', 'https://dgm1.s3.eu-de.cloud-object-storage.appdomain.cloud/L1603/Vollkacheln/dgm1_32_550_5803_1_ni_2016.tif'],
  ['Niedersachsen Gebäude', 'https://lod2.opengeodata.lgln.niedersachsen.de/LoD2_32_549_5803_1_ni.gml'],
  ['Rheinland-Pfalz Höhe', 'https://geobasis-rlp.de/data/dgm1/current/tif/dgm1_32_446_5538_1_rp_2023.tif'],
  ['Mecklenburg-Vorpommern Höhe', 'https://www.geodaten-mv.de/dienste/dgm_download?index=4&dataset=ca268792-s2q1-4a39-b34c-9ec5bf9a4469&file=dgm1_33_312_5996_2_gtiff.tif'],
  ['Bayern Höhe', 'https://download1.bayernwolke.de/a/dgm/dgm1/691_5334.tif'],
  ['Sachsen Höhe', 'https://geocloud.landesvermessung.sachsen.de/public.php/dav/files/JCcXyifaNdLDnxZ/dgm1_33410_5656_2_sn_tiff.zip'],
  ['Copernicus DEM', 'https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N50_00_E006_00_DEM/Copernicus_DSM_COG_10_N50_00_E006_00_DEM.tif'],
  ['AWS Terrain Tiles', 'https://elevation-tiles-prod.s3.amazonaws.com/geotiff/12/2118/1383.tif'],
  ['Sentinel-2 Katalog', 'https://earth-search.aws.element84.com/v1/search?collections=sentinel-2-l2a&bbox=6.24,50.55,6.25,50.56&limit=1']
];
function format(b) {
  if ((b[0] === 0x49 && b[1] === 0x49) || (b[0] === 0x4d && b[1] === 0x4d)) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), le = b[0] === 0x49;
    if (dv.getUint16(2, le) === 43) return 'BigTIFF';
    const out = [];
    try { for (let o = dv.getUint32(4, le); o && out.length < 10; ) { const r = tiffIfd(dv, le, o), t = r.tags; out.push(`${t[256]}x${t[257]} Kompression ${(t[259] || [1])[0]} Prädiktor ${(t[317] || [1])[0]} ${t[258][0]} Bit${t[322] ? ' Kacheln ' + t[322][0] : ''}`); o = r.next; } }
    catch (e) { out.push('weitere Stufen hinter den ersten 256 KB'); }
    return 'TIFF ' + out.join(' | ');
  }
  if (b[0] === 0x50 && b[1] === 0x4b) return `ZIP Methode ${b[8] | b[9] << 8}, erste Datei ${new TextDecoder().decode(b.subarray(30, 30 + (b[26] | b[27] << 8)))}`;
  return new TextDecoder().decode(b.subarray(0, 100)).replace(/\s+/g, ' ');
}
const args = process.argv.slice(2), list = args.length ? args.map(u => [u, u]) : LIST;
for (const [name, url] of list) {
  try {
    const r = await fetch(url, { headers: { Origin: ORIGIN, Range: 'bytes=0-262143' }, signal: AbortSignal.timeout(40000) });
    const b = new Uint8Array(await r.arrayBuffer()), cors = r.headers.get('access-control-allow-origin');
    console.log(`${name}\n  Status ${r.status}, CORS ${cors === '*' || cors === ORIGIN ? 'ja' : 'NEIN'}, Teilabruf ${r.status === 206 ? 'ja' : 'nein'}, Größe ${(r.headers.get('content-range') || '').split('/')[1] || r.headers.get('content-length') || '?'}\n  ${format(b)}`);
  } catch (e) { console.log(`${name}\n  FEHLER ${e.cause ? e.cause.code || e.cause.message : e.message}`); }
}
