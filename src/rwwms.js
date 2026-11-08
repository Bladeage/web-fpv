/* WMS-Höhendienst (Etappe W1, docs/plan-gelaende-wms.md). Ohne DOM, in Node testbar.
   Liest die Fähigkeiten eines OGC-WMS 1.3.0, wählt die Höhenebene, holt Kacheln in EPSG:4326 (Gleitkomma-GeoTIFF) und rechnet
   sie auf unser UTM-Gitter um (Mitte des Gebiets, Zeilen von Norden nach Süden, wie die Höhen aus dem WCS).
   Allgemein, kein Bezug auf einen bestimmten Hersteller. Daten nur im Arbeitsspeicher (Lizenz der Quelle). */
import { readTiff, fromUtm, GEOID_FIX } from './geo.js';

// Fähigkeiten (GetCapabilities, XML) ohne Bibliothek lesen: Ebenen (Name, Titel), Formate für GetMap, Bezugssysteme, Größengrenzen
export function wmsCapsParse(xml) {
  const s = String(xml), tag = (t, src) => { const m = src.match(new RegExp('<(?:\\w+:)?' + t + '[^>]*>([\\s\\S]*?)</(?:\\w+:)?' + t + '>')); return m ? m[1].trim() : ''; };
  const all = (t, src) => [...src.matchAll(new RegExp('<(?:\\w+:)?' + t + '[^>]*>([\\s\\S]*?)</(?:\\w+:)?' + t + '>', 'g'))].map(m => m[1].trim());
  const getMap = tag('GetMap', s), layers = [];
  for (const part of s.split(/<(?:\w+:)?Layer[\s>]/).slice(1)) {
    const head = part.split(/<(?:\w+:)?Layer[\s>]|<\/(?:\w+:)?Layer>/)[0], name = tag('Name', head);
    if (name) layers.push({ name, title: tag('Title', head) });
  }
  return { title: tag('Title', s.split(/<(?:\w+:)?Layer[\s>]/)[0]) || tag('Title', s), formats: all('Format', getMap), crs: [...new Set(all('CRS', s))], layers,
    maxW: +tag('MaxWidth', s) || 0, maxH: +tag('MaxHeight', s) || 0 };
}
// Höhenebene wählen: Name oder Titel nennt Höhe (hgt, elev, dem, height, hoehe, höhe), aber kein Bild davon (rgb, shaded, photo,
// veg). Liefert die Kandidaten in der Reihenfolge der Fähigkeiten.
export function wmsPickHeight(caps) {
  const yes = /hgt|elev|dem|height|hoehe|höhe/i, no = /rgb|shaded|photo|veg/i;
  return caps.layers.filter(l => yes.test(l.name + ' ' + l.title) && !no.test(l.name)).map(l => l.name);
}
// Geografisches Rechteck, das das (gegen Nord gedrehte) UTM-Quadrat bbox [e0, n0, e1, n1] plus Rand m umschließt
export function geoBoxOf(bbox, zone, m = 0) {
  const pts = [[bbox[0] - m, bbox[1] - m], [bbox[2] + m, bbox[1] - m], [bbox[2] + m, bbox[3] + m], [bbox[0] - m, bbox[3] + m]].map(([e, n]) => fromUtm(e, n, zone));
  return { minLat: Math.min(...pts.map(p => p[0])), maxLat: Math.max(...pts.map(p => p[0])), minLon: Math.min(...pts.map(p => p[1])), maxLon: Math.max(...pts.map(p => p[1])) };
}
// GetMap-Adresse WMS 1.3.0 in EPSG:4326: Achsen Breite, Länge (BBOX=minLat,minLon,maxLat,maxLon)
export function wmsHgtUrl(url, layer, g, w, h, format = 'image/tiff') {
  const f = x => x.toFixed(9);
  return url + (url.includes('?') ? '&' : '?') + 'SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=' + encodeURIComponent(layer) + '&STYLES=&CRS=EPSG:4326'
    + '&BBOX=' + [g.minLat, g.minLon, g.maxLat, g.maxLon].map(f).join(',') + '&WIDTH=' + w + '&HEIGHT=' + h + '&FORMAT=' + encodeURIComponent(format);
}
const bytesOf = b => b instanceof Uint8Array ? b : new Uint8Array(b);
const asBuf = u => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength);
// Fehler-XML eines Dienstes erkennen (erstes Zeichen „<“) und den Text der Ausnahme liefern
export function wmsError(u8) {
  if (!u8.length || u8[0] !== 0x3c) return '';
  const t = new TextDecoder().decode(u8.subarray(0, 4000)), m = t.match(/<(?:\w+:)?ServiceException(?:\s[^>]*)?>([\s\S]*?)</);
  return (m ? m[1] : t.replace(/<[^>]+>/g, ' ')).trim().slice(0, 200) || 'Fehler des Dienstes';
}
// Höhen für das UTM-Quadrat bbox in n x n Zellen holen. src.hgt = { url, layer, tile }, src.vref 'ellipsoid' (minus GEOID_FIX)
// oder 'msl'. get(url) liefert Bytes. Ablauf: geografisches Rechteck mit 2 Zellen Rand, Pixel so fein wie unsere Zellen, auf ganze
// Kacheln aufgerundet, Kacheln holen (höchstens par gleichzeitig), zusammensetzen, auf das Gitter abtasten, Lücken füllen.
export const WMS = { tile: 256, maxPx: 4096, par: 4 };
export async function wmsFetchHeights(src, bbox, zone, n, get) {
  if (!src.hgt.layer) src = { ...src, hgt: { ...src.hgt, layer: await wmsLayerOf(src, get) } };
  const cell = (bbox[2] - bbox[0])/n, g = geoBoxOf(bbox, zone, 2*cell), T = src.hgt.tile || WMS.tile;
  const midLat = (g.minLat + g.maxLat)/2, wM = (g.maxLon - g.minLon)*111320*Math.cos(midLat*Math.PI/180), hM = (g.maxLat - g.minLat)*111320;
  const nx = Math.max(1, Math.ceil(Math.min(WMS.maxPx, wM/cell)/T)), ny = Math.max(1, Math.ceil(Math.min(WMS.maxPx, hM/cell)/T)), W = nx*T, H = ny*T;
  const px = (g.maxLon - g.minLon)/W, py = (g.maxLat - g.minLat)/H, geo = new Float32Array(W*H);
  const jobs = [];
  for (let ty = 0; ty < ny; ty++) for (let tx = 0; tx < nx; tx++) jobs.push([tx, ty]);
  const one = async ([tx, ty]) => {
    const tb = { minLon: g.minLon + tx*T*px, maxLon: g.minLon + (tx + 1)*T*px, maxLat: g.maxLat - ty*T*py, minLat: g.maxLat - (ty + 1)*T*py };
    const u8 = bytesOf(await get(wmsHgtUrl(src.hgt.url, src.hgt.layer, tb, T, T, src.hgt.format || 'image/tiff'))), err = wmsError(u8);
    if (err) throw new Error('Höhendienst: ' + err);
    const t = readTiff(asBuf(u8));
    if (t.w !== T || t.h !== T) throw new Error('Höhendienst: Kachel ' + t.w + ' x ' + t.h + ' statt ' + T + ' x ' + T);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const v = t.data[y*T + x]; geo[(ty*T + y)*W + tx*T + x] = v === t.nodata || !(v > -1000) ? NaN : v; }
  };
  for (let i = 0; i < jobs.length; i += WMS.par) await Promise.all(jobs.slice(i, i + WMS.par).map(one));
  const data = resampleToUtm(geo, W, H, g, bbox, zone, n);
  if (src.vref !== 'msl') for (let k = 0; k < data.length; k++) data[k] -= GEOID_FIX;
  let ok = 0; for (const v of data) if (!Number.isNaN(v)) ok++;
  if (!ok) throw new Error('Der Höhendienst hat für diesen Ort keine Höhen');
  wmsFill(data, n);
  return { data, tiles: jobs.length, geo: g, hRef: src.vref === 'msl' ? 'msl' : 'ell-' + GEOID_FIX, layer: src.hgt.layer };
}
// Lücken (NaN) vom Rand der gültigen Werte her füllen (wie rwFillGaps in rwload.js; eigene Fassung, weil rwload dieses Modul nutzt)
function wmsFill(v, n) {
  for (let pass = 0, left = 1; left && pass < 2*n; pass++) {
    left = 0;
    const src = v.slice();
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j*n + i;
      if (!Number.isNaN(src[k])) continue;
      let s = 0, c = 0;
      for (const [x, y] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) if (x >= 0 && y >= 0 && x < n && y < n && !Number.isNaN(src[y*n + x])) { s += src[y*n + x]; c++; }
      if (c) v[k] = s/c; else left++;
    }
  }
}
// Höhenebene eines Dienstes: eingetragen, sonst aus den Fähigkeiten gewählt (Laufzeit-Zwischenspeicher je Adresse)
const wmsLayers = new Map();
export async function wmsLayerOf(src, get) {
  if (src.hgt.layer) return src.hgt.layer;
  if (wmsLayers.has(src.hgt.url)) return wmsLayers.get(src.hgt.url);
  const caps = wmsCapsParse(new TextDecoder().decode(bytesOf(await get(src.hgt.url + (src.hgt.url.includes('?') ? '&' : '?') + 'SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0'))));
  const l = wmsPickHeight(caps)[0];
  if (!l) throw new Error('Höhendienst ohne erkennbare Höhenebene (bitte im Formular eintragen)');
  wmsLayers.set(src.hgt.url, l);
  return l;
}
// Prüfen an einem Ort (Breite, Länge): Fähigkeiten, Höhenebene, kleiner Abruf 16 x 16. Rückgabe [{ was, ok, text }] wie rwCheckSource.
export async function wmsCheck(src, lat, lon, get) {
  const out = [];
  try {
    const caps = wmsCapsParse(new TextDecoder().decode(bytesOf(await get(src.hgt.url + (src.hgt.url.includes('?') ? '&' : '?') + 'SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0'))));
    out.push({ was: 'Dienst', ok: true, text: (caps.title || 'WMS') + ', ' + caps.layers.length + ' Ebenen' });
    const l = src.hgt.layer || wmsPickHeight(caps)[0];
    if (!l) { out.push({ was: 'Höhenebene', ok: false, text: 'keine erkannt; Ebenen: ' + caps.layers.map(x => x.name).slice(0, 8).join(', ') }); return out; }
    const d = 0.0005, u8 = bytesOf(await get(wmsHgtUrl(src.hgt.url, l, { minLat: lat - d, maxLat: lat + d, minLon: lon - d, maxLon: lon + d }, 16, 16, src.hgt.format || 'image/tiff')));
    const err = wmsError(u8); if (err) throw new Error(err);
    const t = readTiff(asBuf(u8)), v = [...t.data].find(x => x > -1000 && x !== t.nodata);
    if (v === undefined) throw new Error('nur Füllwerte (Ort außerhalb?)');
    out.push({ was: 'Höhen', ok: true, text: l + ', ' + v.toFixed(1) + ' m' + (src.vref === 'msl' ? '' : ' über dem Ellipsoid') });
  } catch (e) { out.push({ was: 'Höhen', ok: false, text: String(e.message || e) }); }
  return out;
}
// Geografisches Raster (W x H, Zeile 0 = Norden, Pixelmitten) auf das UTM-Gitter n x n (Zellmitten) bilinear abtasten. Breite und
// Länge der Gitterpunkte aus einem Stützgitter 17 x 17 (fromUtm), dazwischen linear: über 1 km fast linear (Test: unter 1 cm).
export function resampleToUtm(geo, W, H, g, bbox, zone, n, S = 17) {
  const cell = (bbox[2] - bbox[0])/n, px = (g.maxLon - g.minLon)/W, py = (g.maxLat - g.minLat)/H, sup = new Float64Array(S*S*2);
  for (let b = 0; b < S; b++) for (let a = 0; a < S; a++) {
    const e = bbox[0] + cell/2 + a/(S - 1)*(n - 1)*cell, nn = bbox[3] - cell/2 - b/(S - 1)*(n - 1)*cell, [lat, lon] = fromUtm(e, nn, zone);
    sup[(b*S + a)*2] = lat; sup[(b*S + a)*2 + 1] = lon;
  }
  const out = new Float32Array(n*n), at = (x, y) => geo[Math.min(H - 1, Math.max(0, y))*W + Math.min(W - 1, Math.max(0, x))];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const fa = i/(n - 1)*(S - 1), fb = j/(n - 1)*(S - 1), a = Math.min(S - 2, Math.floor(fa)), b = Math.min(S - 2, Math.floor(fb)), ta = fa - a, tb = fb - b;
    const L = k => { const c00 = sup[(b*S + a)*2 + k], c10 = sup[(b*S + a + 1)*2 + k], c01 = sup[((b + 1)*S + a)*2 + k], c11 = sup[((b + 1)*S + a + 1)*2 + k];
      return (c00*(1 - ta) + c10*ta)*(1 - tb) + (c01*(1 - ta) + c11*ta)*tb; };
    const lat = L(0), lon = L(1), u = (lon - g.minLon)/px - 0.5, v = (g.maxLat - lat)/py - 0.5, x = Math.floor(u), y = Math.floor(v), fx = u - x, fy = v - y;
    out[j*n + i] = (at(x, y)*(1 - fx) + at(x + 1, y)*fx)*(1 - fy) + (at(x, y + 1)*(1 - fx) + at(x + 1, y + 1)*fx)*fy;
  }
  return out;
}
