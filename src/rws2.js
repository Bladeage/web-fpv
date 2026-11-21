/* Luftbild aus Sentinel-2 (Etappe Q4, docs/plan-quellen.md). Ohne DOM, in Node testbar.
   Katalog earth-search (STAC, CORS gemessen 20.11.2026), Sammlung sentinel-2-l2a, Bild „visual“ (TCI: RGB 8 Bit, COG, Deflate, 10 m).
   Für Gebiete ohne Luftbild der Quelle (Welt, Länder aus Kacheln) und die Umgebung. Ergebnis als BMP (der Browser liest es wie das
   Relief-Bild, rwShadeImage), kein JPEG-Kodierer nötig. Lizenz: Copernicus Sentinel data, frei mit Quellenvermerk. */
import { cogOpen, cogLevel, cogLoad, fromUtm, toUtm } from './geo.js';
import { geoBoxOf } from './rwwms.js';

// url: Katalog; cloud: höchstens so viel % Wolken, snow: höchstens so viel % Schnee und Eis (Annahme: dann meist ein klares Sommerbild)
export const S2 = { url: 'https://earth-search.aws.element84.com/v1', cloud: 5, snow: 1, attribution: 'enthält veränderte Copernicus-Sentinel-Daten' };
// Suche: neuestes Bild mit wenig Wolken und Schnee, das das geografische Rechteck g ganz abdeckt (sonst das erste). text(url) -> Text.
export async function s2Find(g, text) {
  const q = encodeURIComponent(JSON.stringify({ 'eo:cloud_cover': { lt: S2.cloud }, 's2:snow_ice_percentage': { lt: S2.snow } }));
  const j = JSON.parse(await text(S2.url + '/search?collections=sentinel-2-l2a&bbox=' + [g.minLon, g.minLat, g.maxLon, g.maxLat].map(v => v.toFixed(5)).join(',')
    + '&limit=20&sortby=-properties.datetime&query=' + q) || '{}'), list = (j.features || []).filter(f => f.assets && f.assets.visual);
  return list.find(f => f.bbox && f.bbox[0] <= g.minLon && f.bbox[1] <= g.minLat && f.bbox[2] >= g.maxLon && f.bbox[3] >= g.maxLat) || list[0] || null;
}
// Bild px x px für das UTM-Quadrat bbox (Zone zone) als BMP (oben = Norden). get.range(url, a, b) für Teilabrufe. null: kein Bild gefunden.
export async function s2Photo(bbox, zone, px, get, text) {
  const g = geoBoxOf(bbox, zone), item = await s2Find(g, text);
  if (!item) return null;
  const epsg = +item.properties['proj:epsg'] || 0, zs = epsg % 100, south = epsg >= 32700, href = item.assets.visual.href;
  const cog = await cogOpen((a, b) => get.range(href, a, b)), cell = (bbox[2] - bbox[0])/px, lv = cogLevel(cog, cell), L = cog.levels[lv];
  if (L.spp < 3 || L.bytes !== 1) throw new Error('Sentinel-2: kein RGB-Bild');
  const f = cog.levels[0].w/L.w, dx = cog.dx*f, dy = cog.dy*f, x0 = cog.x0 - cog.dx/2 + dx/2, y0 = cog.y0 + cog.dy/2 - dy/2;
  // Lage jeder Bildzelle im System des Sentinel-Bildes (gleiche Zone: direkt, ETRS89 und WGS84 hier gleich; sonst über Breite und Länge)
  const to = zs === zone && !south ? (e, n) => [e, n] : (e, n) => { const [la, lo] = fromUtm(e, n, zone), u = toUtm(la, lo, zs); return [u[0], u[1] + (south ? 1e7 : 0)]; };
  const pos = new Float64Array(px*px*2);
  let c0 = Infinity, c1 = -Infinity, r0 = Infinity, r1 = -Infinity;
  for (let j = 0; j < px; j++) for (let i = 0; i < px; i++) {
    const [e, n] = to(bbox[0] + (i + 0.5)*cell, bbox[3] - (j + 0.5)*cell), c = (e - x0)/dx, r = (y0 - n)/dy, k = (j*px + i)*2;
    pos[k] = c; pos[k + 1] = r; c0 = Math.min(c0, c); c1 = Math.max(c1, c); r0 = Math.min(r0, r); r1 = Math.max(r1, r);
  }
  const C0 = Math.max(0, Math.floor(c0)), C1 = Math.min(L.w - 1, Math.ceil(c1)), R0 = Math.max(0, Math.floor(r0)), R1 = Math.min(L.h - 1, Math.ceil(r1));
  if (C0 > C1 || R0 > R1) return null;
  const tiles = await cogLoad(cog, L, C0, R0, C1, R1, true), across = Math.ceil(L.w/L.tw), S = L.spp;
  const at = (c, r, k) => { c = Math.min(L.w - 1, Math.max(0, c)); r = Math.min(L.h - 1, Math.max(0, r)); const t = tiles.get(Math.floor(r/L.th)*across + Math.floor(c/L.tw)); return t ? t[((r % L.th)*L.tw + c % L.tw)*S + k] : 0; };
  // BMP 24 Bit, von oben nach unten (negative Höhe), Zeilen auf 4 Byte aufgefüllt; bilinear
  const row = px*3 + (4 - (px*3) % 4) % 4, b = new Uint8Array(54 + row*px), v = new DataView(b.buffer);
  b[0] = 66; b[1] = 77; v.setUint32(2, b.length, true); v.setUint32(10, 54, true); v.setUint32(14, 40, true);
  v.setInt32(18, px, true); v.setInt32(22, -px, true); v.setUint16(26, 1, true); v.setUint16(28, 24, true); v.setUint32(34, row*px, true);
  let empty = 0;
  for (let j = 0; j < px; j++) for (let i = 0; i < px; i++) {
    const k = (j*px + i)*2, c = pos[k] - 0.5, r = pos[k + 1] - 0.5, ci = Math.floor(c), ri = Math.floor(r), fx = c - ci, fy = r - ri, o = 54 + j*row + i*3;
    for (let ch = 0; ch < 3; ch++) b[o + 2 - ch] = Math.round((at(ci, ri, ch)*(1 - fx) + at(ci + 1, ri, ch)*fx)*(1 - fy) + (at(ci, ri + 1, ch)*(1 - fx) + at(ci + 1, ri + 1, ch)*fx)*fy);
    if (!b[o] && !b[o + 1] && !b[o + 2]) empty++;
  }
  return empty > px*px/2 ? null : b;   // überwiegend schwarz (Rand des Bildes): lieber kein Bild
}
