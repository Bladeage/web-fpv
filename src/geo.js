/* Geodaten lesen (Modus „Echte Welt“). Ohne DOM: läuft im Browser und im Werkzeug tools/realworld.mjs.
   GeoTIFF mit Höhen (WCS der Länder, Kacheldateien, COG): Streifen oder Kacheln, ohne Kompression, LZW oder Deflate (Q1),
   Prädiktor 1 (keiner), 2 (waagrecht) oder 3 (Gleitkomma). COG per Teilabruf, Datei aus ZIP. Dazu WGS84 -> UTM. */
import { dlmFind } from './rwdlm.js';

// Geoidhöhe (Quasigeoid) für Höhe über dem Ellipsoid minus Höhe über NHN. Fest 47 m (Schätzung für Monschau; NRW 42,5 bis
// 48,5 m). Genutzt von DIS (verbund.js) und vom WMS-Höhendienst (rwwms.js, Höhen über dem Ellipsoid).
export const GEOID_FIX = 47;
// TIFF-Verzeichnis (IFD) ab Position ifd lesen: { tags, next }. Wirft RangeError, wenn es über die Bytes hinausgeht (COG: mehr laden).
export function tiffIfd(dv, le, ifd) {
  const u16 = o => dv.getUint16(o, le), u32 = o => dv.getUint32(o, le), n = u16(ifd), tags = {};
  const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8 };
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i*12, tag = u16(e), type = u16(e + 2), cnt = u32(e + 4), sz = (SIZE[type] || 1)*cnt;
    const at = sz <= 4 ? e + 8 : u32(e + 8), vals = [];
    for (let k = 0; k < Math.min(cnt, 1 << 20); k++) {
      const o = at + k*(SIZE[type] || 1);
      vals.push(type === 3 ? u16(o) : type === 4 || type === 16 ? u32(o) : type === 11 ? dv.getFloat32(o, le) : type === 12 ? dv.getFloat64(o, le) : dv.getUint8(o));
    }
    tags[tag] = vals;
  }
  return { tags, next: u32(ifd + 2 + n*12) };
}
// Beschreibung eines Bildes aus den Tags (ein Kanal oder mehrere, Streifen oder Kacheln). Kompression 1 (keine), 5 (LZW), 8 (Deflate).
const tiffInfo = (t, le) => {
  const w = t[256][0], h = t[257][0], tiled = !!t[322];
  return { w, h, le, comp: (t[259] || [1])[0], pred: (t[317] || [1])[0], bytes: (t[258] || [32])[0]/8, fmt: (t[339] || [(t[258] || [32])[0] >= 32 ? 3 : 1])[0], spp: (t[277] || [1])[0],
    tw: tiled ? t[322][0] : w, th: tiled ? t[323][0] : (t[278] || [h])[0], offs: tiled ? t[324] : t[273], cnts: tiled ? t[325] : t[279],
    nodata: t[42113] ? parseFloat(String.fromCharCode(...t[42113]).replace(/\0/g, '')) : NaN, mask: ((t[254] || [0])[0] & 4) !== 0 };
};
// Deflate entpacken (zlib, oder raw für ZIP) mit Bordmitteln (DecompressionStream, Browser und Node)
export async function inflateBytes(u8, raw = false) {
  return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream(raw ? 'deflate-raw' : 'deflate'))).arrayBuffer());
}
// Ein Block (Streifen oder Kachel) roh -> Werte (Float32, ein Kanal). Deflate muss vorher entpackt sein (pre).
function tiffBlock(I, raw, pre, bytesOnly = false) {
  if (I.comp === 5) raw = lzw(raw, I.tw*I.th*I.bytes*I.spp); else if (I.comp === 8) raw = pre; else if (I.comp !== 1) throw new Error('Kompression ' + I.comp + ' nicht unterstützt');
  raw = unpredict(raw, I.tw, I.th, I.bytes, I.pred, I.le, I.spp);
  if (bytesOnly) return raw;   // Bild (Q4): Bytes je Kanal, ohne Umrechnung
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength), le3 = I.pred === 3 ? false : I.le, n = I.tw*I.th, out = new Float32Array(n), B = I.bytes, S = B*I.spp;
  for (let k = 0; k < n; k++) {
    const o = k*S;
    if (o + B > raw.length) break;
    out[k] = I.fmt === 3 ? (B === 8 ? dv.getFloat64(o, le3) : dv.getFloat32(o, le3)) : B === 1 ? raw[o] : B === 2 ? (I.fmt === 2 ? dv.getInt16(o, I.le) : dv.getUint16(o, I.le)) : (I.fmt === 2 ? dv.getInt32(o, I.le) : dv.getUint32(o, I.le));
  }
  return out;
}
// TIFF lesen: ArrayBuffer -> { w, h, data: Float32Array (Zeile für Zeile, oben = Norden), nodata }. pre: entpackte Blöcke (Deflate).
export function readTiff(buf, pre = null) {
  const dv = new DataView(buf), le = dv.getUint16(0) === 0x4949;
  if (dv.getUint16(2, le) !== 42) throw new Error('Kein klassisches TIFF');
  const I = tiffInfo(tiffIfd(dv, le, dv.getUint32(4, le)).tags, le), { w, h, tw, th } = I;
  if (I.spp !== 1) throw new Error('Nur ein Kanal unterstützt');
  if (I.comp === 8 && !pre) throw new Error('Deflate: readTiffAsync nutzen');
  const out = new Float32Array(w*h), across = Math.ceil(w/tw);
  I.offs.forEach((off, b) => {
    const v = tiffBlock(I, new Uint8Array(buf, off, I.cnts[b]), pre && pre[b]), bx = (b % across)*tw, by = Math.floor(b/across)*th;
    for (let y = 0; y < th && by + y < h; y++) for (let x = 0; x < tw && bx + x < w; x++) out[(by + y)*w + bx + x] = v[y*tw + x];
  });
  return { w, h, data: out, nodata: I.nodata };
}
// Wie readTiff, auch mit Deflate (Kompression 8)
export async function readTiffAsync(buf) {
  const dv = new DataView(buf), le = dv.getUint16(0) === 0x4949, I = tiffInfo(tiffIfd(dv, le, dv.getUint32(4, le)).tags, le);
  const pre = I.comp === 8 ? await Promise.all(I.offs.map((o, b) => inflateBytes(new Uint8Array(buf, o, I.cnts[b])))) : null;
  return readTiff(buf, pre);
}
// Cloud-optimiertes GeoTIFF (COG, Etappe Q1) per Teilabruf öffnen: range(a, b) -> Uint8Array (Bytes a bis b). Liefert die Bildstufen
// (volle Auflösung und Übersichten, ohne Masken) und die Lage: Mitte des Pixels (0, 0) in x0, y0, Pixelgröße dx, dy der vollen Stufe.
export async function cogOpen(range) {
  for (let len = 65536; ; len *= 4) {
    const head = await range(0, len - 1), dv = new DataView(head.buffer, head.byteOffset, head.byteLength), le = dv.getUint16(0, true) === 0x4949;
    if (dv.getUint16(2, le) !== 42) throw new Error(dv.getUint16(2, le) === 43 ? 'BigTIFF nicht unterstützt' : 'Kein TIFF');
    try {
      const levels = [];
      let t0 = null;
      for (let o = dv.getUint32(4, le); o; ) { const r = tiffIfd(dv, le, o); t0 ||= r.tags; const I = tiffInfo(r.tags, le); if (!I.mask) levels.push(I); o = r.next; }
      const sc = t0[33550] || [1, 1], tp = t0[33922] || [0, 0, 0, 0, 0, 0], keys = t0[34735] || [], dx = sc[0], dy = sc[1];
      let point = false;   // GTRasterTypeGeoKey 1025 = 2: Lage meint die Pixelmitte, sonst die Ecke
      for (let k = 4; k + 3 < keys.length; k += 4) if (keys[k] === 1025 && keys[k + 3] === 2) point = true;
      const x0 = tp[3] - tp[0]*dx + (point ? 0 : dx/2), y0 = tp[4] + tp[1]*dy - (point ? 0 : dy/2);
      return { range, levels, x0, y0, dx, dy };
    } catch (e) { if (!(e instanceof RangeError) || head.length < len || len > 1 << 24) throw e; }   // Verzeichnis reicht weiter: mehr laden
  }
}
// Gröbste Stufe, deren Pixel höchstens cell groß sind (sonst die feinste)
export function cogLevel(cog, cell) {
  let best = 0;
  cog.levels.forEach((L, i) => { if (cog.dx*cog.levels[0].w/L.w <= cell*1.001) best = i; });
  return best;
}
// Raster n x n für bbox [x0, y0, x1, y1] (Werte in Zellmitten, wie WCS mit SCALESIZE) aus Stufe lv, bilinear. Lädt nur die nötigen Kacheln.
export async function cogWindow(cog, bbox, n, lv = cogLevel(cog, (bbox[2] - bbox[0])/n)) {
  const L = cog.levels[lv], f = cog.levels[0].w/L.w, dx = cog.dx*f, dy = cog.dy*f, x0 = cog.x0 - cog.dx/2 + dx/2, y0 = cog.y0 + cog.dy/2 - dy/2;
  if (L.spp !== 1) throw new Error('Nur ein Kanal unterstützt');
  if (L.comp === 7) throw new Error('JPEG in TIFF folgt in Q4');
  const cx = (bbox[2] - bbox[0])/n, cy = (bbox[3] - bbox[1])/n;
  const px = i => (bbox[0] + (i + 0.5)*cx - x0)/dx, py = j => (y0 - (bbox[3] - (j + 0.5)*cy))/dy;
  const c0 = Math.max(0, Math.floor(px(0))), c1 = Math.min(L.w - 1, Math.ceil(px(n - 1))), r0 = Math.max(0, Math.floor(py(0))), r1 = Math.min(L.h - 1, Math.ceil(py(n - 1)));
  const across = Math.ceil(L.w/L.tw), tiles = await cogLoad(cog, L, c0, r0, c1, r1);
  const at = (c, r) => { const t = tiles.get(Math.floor(r/L.th)*across + Math.floor(c/L.tw)); return t ? t[(r % L.th)*L.tw + c % L.tw] : NaN; };
  return { w: n, h: n, nodata: L.nodata, data: gridSample(at, L.w, L.h, px, py, n, L.nodata) };
}
// Kacheln einer Stufe L für die Pixel c0..c1, r0..r1 laden und entpacken: Map Kachelnummer -> Werte (Float32) oder Bytes (bytesOnly).
// Nahe beieinander liegende Kacheln in einem Abruf (Lücke bis 64 KB).
export async function cogLoad(cog, L, c0, r0, c1, r1, bytesOnly = false) {
  const across = Math.ceil(L.w/L.tw), tiles = new Map(), want = [];
  for (let ty = Math.floor(r0/L.th); ty <= Math.floor(r1/L.th); ty++) for (let tx = Math.floor(c0/L.tw); tx <= Math.floor(c1/L.tw); tx++) want.push(ty*across + tx);
  const parts = want.filter(b => L.cnts[b] > 0).sort((a, b) => L.offs[a] - L.offs[b]), groups = [];
  for (const b of parts) { const g = groups[groups.length - 1]; if (g && L.offs[b] - g.end < 65536) { g.list.push(b); g.end = Math.max(g.end, L.offs[b] + L.cnts[b]); } else groups.push({ start: L.offs[b], end: L.offs[b] + L.cnts[b], list: [b] }); }
  await Promise.all(groups.map(async g => {
    const u8 = await cog.range(g.start, g.end - 1);
    for (const b of g.list) { const raw = u8.subarray(L.offs[b] - g.start, L.offs[b] - g.start + L.cnts[b]); tiles.set(b, tiffBlock(L, raw, L.comp === 8 ? await inflateBytes(raw) : null, bytesOnly)); }
  }));
  return tiles;
}
// Bilinear abtasten: at(c, r) Wert eines Pixels, px(i), py(j) Pixelkoordinaten der Zellmitten. Füllwerte zählen nicht mit.
export function gridSample(at, w, h, px, py, n, nodata = NaN) {
  const out = new Float32Array(n*n), ok = v => Number.isFinite(v) && v !== nodata && v > -1000;
  for (let j = 0; j < n; j++) {
    const y = Math.min(h - 1, Math.max(0, py(j))), r = Math.min(h - 2, Math.floor(y)), fy = h > 1 ? y - r : 0;
    for (let i = 0; i < n; i++) {
      const x = Math.min(w - 1, Math.max(0, px(i))), c = Math.min(w - 2, Math.floor(x)), fx = w > 1 ? x - c : 0;
      let s = 0, ws = 0;
      for (const [dc, dr, k] of [[0, 0, (1 - fx)*(1 - fy)], [1, 0, fx*(1 - fy)], [0, 1, (1 - fx)*fy], [1, 1, fx*fy]]) { const v = at(Math.max(0, c + dc), Math.max(0, r + dr)); if (k > 0 && ok(v)) { s += v*k; ws += k; } }
      out[j*n + i] = ws > 0 ? s/ws : NaN;
    }
  }
  return out;
}
// Gitter -> Raster n x n für bbox (Zellmitten, bilinear); Zellen außerhalb des Gitters (mehr als ein halbes Pixel) bleiben NaN
export function gridTo(g, bbox, n) {
  const cx = (bbox[2] - bbox[0])/n, cy = (bbox[3] - bbox[1])/n, X = i => bbox[0] + (i + 0.5)*cx, Y = j => bbox[3] - (j + 0.5)*cy;
  const out = gridSample((c, r) => g.data[r*g.w + c], g.w, g.h, i => (X(i) - g.x0)/g.d, j => (g.y0 - Y(j))/g.d, n, g.nodata);
  return gridMask(out, bbox, n, [g.x0 - g.d/2, g.y0 - (g.h - 0.5)*g.d, g.x0 + (g.w - 0.5)*g.d, g.y0 + g.d/2]);
}
// Zellen n x n von bbox, deren Mitte nicht im Rechteck box liegt, auf NaN setzen (Kacheln zusammensetzen)
export function gridMask(v, bbox, n, box) {
  const cx = (bbox[2] - bbox[0])/n, cy = (bbox[3] - bbox[1])/n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = bbox[0] + (i + 0.5)*cx, y = bbox[3] - (j + 0.5)*cy; if (x < box[0] || x > box[2] || y < box[1] || y > box[3]) v[j*n + i] = NaN; }
  return v;
}
// Eine Datei aus einem ZIP per Teilabruf: range(a, b), Gesamtgröße total, Name endet auf want. Gespeichert oder Deflate. Sonst Fehler.
export async function zipGet(range, total, want) {
  const e = await dlmFind(range, total, want);
  if (!e) throw new Error(want + ' fehlt im ZIP');
  if (e.method !== 0 && e.method !== 8) throw new Error('ZIP-Methode ' + e.method + ' nicht unterstützt' + (e.method === 9 ? ' (Deflate64)' : ''));
  const u8 = await range(e.off, e.off + e.size - 1);
  return e.method === 8 ? inflateBytes(u8, true) : u8;
}
// LZW wie in TIFF (MSB zuerst, Codes 9 bis 12 Bit, 256 = Löschen, 257 = Ende)
function lzw(src, size) {
  const out = new Uint8Array(size);
  let pos = 0, bit = 0, width = 9, dict = [], prev = null;
  const reset = () => { dict = []; for (let i = 0; i < 256; i++) dict.push([i]); dict.push(null, null); width = 9; prev = null; };
  const read = () => {
    let v = 0;
    for (let i = 0; i < width; i++) { const B = src[bit >> 3]; v = (v << 1) | (((B ?? 0) >> (7 - (bit & 7))) & 1); bit++; }
    return v;
  };
  reset();
  while (bit + width <= src.length*8) {
    const c = read();
    if (c === 257) break;
    if (c === 256) { reset(); continue; }
    let entry;
    if (c < dict.length && dict[c]) entry = dict[c];
    else if (prev) entry = prev.concat(prev[0]);
    else break;
    for (const x of entry) { if (pos < size) out[pos++] = x; }
    if (prev) dict.push(prev.concat(entry[0]));
    prev = entry;
    if (dict.length + 1 >= (1 << width) && width < 12) width++;   // „early change“ wie libtiff
  }
  return out;
}
// Prädiktor rückgängig machen. 2 (waagrecht): je Kanal als ganze Zahl der Breite des Werts addieren (Bytefolge der Datei),
// vor Q1 nur 8 Bit genau. 3 (Gleitkomma): Bytes je Zeile nach Wertigkeit sortiert und waagrecht differenziert.
function unpredict(raw, w, h, bytes, pred, le = true, spp = 1) {
  if (pred === 1) return raw;
  const out = new Uint8Array(raw.length), row = w*bytes*spp, S = bytes*spp;
  if (pred === 2) {
    out.set(raw);
    const dv = new DataView(out.buffer), get = bytes === 1 ? o => out[o] : bytes === 2 ? o => dv.getUint16(o, le) : o => dv.getUint32(o, le);
    const put = bytes === 1 ? (o, v) => { out[o] = v; } : bytes === 2 ? (o, v) => dv.setUint16(o, v, le) : (o, v) => dv.setUint32(o, v >>> 0, le);
    if (bytes === 8) throw new Error('Prädiktor 2 mit 64 Bit nicht unterstützt');
    for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) for (let c = 0; c < spp; c++) {
      const o = y*row + x*S + c*bytes;
      if (o + bytes <= out.length) put(o, (get(o) + get(o - S)) % 2**(8*bytes));
    }
    return out;
  }
  for (let y = 0; y < h; y++) {
    const o = y*row, tmp = new Uint8Array(row);
    for (let i = 0; i < row; i++) tmp[i] = (raw[o + i] + (i > 0 ? tmp[i - 1] : 0)) & 255;
    for (let x = 0; x < w*spp; x++) for (let b = 0; b < bytes; b++) out[o + x*bytes + b] = tmp[b*w*spp + x];   // Big-Endian je Wert
  }
  return out;
}

// WGS84 (Breite, Länge in Grad) -> UTM (Ost, Nord in m). Zone 32 = EPSG:25832 (GRS80, praktisch gleich WGS84).
export function toUtm(lat, lon, zone = 32) {
  const a = 6378137, f = 1/298.257222101, k0 = 0.9996, e2 = f*(2 - f), ep2 = e2/(1 - e2), d = Math.PI/180;
  const L0 = (zone*6 - 183)*d, phi = lat*d, lam = lon*d, N = a/Math.sqrt(1 - e2*Math.sin(phi)**2);
  const T = Math.tan(phi)**2, C = ep2*Math.cos(phi)**2, A = Math.cos(phi)*(lam - L0);
  const M = a*((1 - e2/4 - 3*e2*e2/64 - 5*e2**3/256)*phi - (3*e2/8 + 3*e2*e2/32 + 45*e2**3/1024)*Math.sin(2*phi)
    + (15*e2*e2/256 + 45*e2**3/1024)*Math.sin(4*phi) - (35*e2**3/3072)*Math.sin(6*phi));
  const E = k0*N*(A + (1 - T + C)*A**3/6 + (5 - 18*T + T*T + 72*C - 58*ep2)*A**5/120) + 500000;
  const Nn = k0*(M + N*Math.tan(phi)*(A*A/2 + (5 - T + 9*C + 4*C*C)*A**4/24 + (61 - 58*T + T*T + 600*C - 330*ep2)*A**6/720));
  return [E, Nn];
}
// UTM (Ost, Nord in m) -> WGS84 (Breite, Länge in Grad), Umkehrung von toUtm (Reihen nach Snyder, Fehler unter 1 mm)
export function fromUtm(E, N, zone = 32) {
  const a = 6378137, f = 1/298.257222101, k0 = 0.9996, e2 = f*(2 - f), ep2 = e2/(1 - e2), d = Math.PI/180;
  const M = N/k0, mu = M/(a*(1 - e2/4 - 3*e2*e2/64 - 5*e2**3/256)), e1 = (1 - Math.sqrt(1 - e2))/(1 + Math.sqrt(1 - e2));
  const p1 = mu + (3*e1/2 - 27*e1**3/32)*Math.sin(2*mu) + (21*e1*e1/16 - 55*e1**4/32)*Math.sin(4*mu) + (151*e1**3/96)*Math.sin(6*mu) + (1097*e1**4/512)*Math.sin(8*mu);
  const C = ep2*Math.cos(p1)**2, T = Math.tan(p1)**2, N1 = a/Math.sqrt(1 - e2*Math.sin(p1)**2), R1 = a*(1 - e2)/(1 - e2*Math.sin(p1)**2)**1.5, D = (E - 500000)/(N1*k0);
  const lat = p1 - (N1*Math.tan(p1)/R1)*(D*D/2 - (5 + 3*T + 10*C - 4*C*C - 9*ep2)*D**4/24 + (61 + 90*T + 298*C + 45*T*T - 252*ep2 - 3*C*C)*D**6/720);
  const lon = (D - (1 + 2*T + C)*D**3/6 + (5 - 2*C + 28*T - 3*C*C + 8*ep2 + 24*T*T)*D**5/120)/Math.cos(p1);
  return [lat/d, (zone*6 - 183) + lon/d];
}

// Ebenes Vieleck (3D-Punkte) in Dreiecke zerlegen (Ohrenschneiden). Projektion auf die Ebene mit der größten Ausdehnung.
// Rückgabe: Liste von Index-Tripeln. Funktioniert auch für nicht konvexe Grundrisse.
export function triangulate(pts) {
  let n = pts.length;
  if (n > 3 && pts[0][0] === pts[n - 1][0] && pts[0][1] === pts[n - 1][1] && pts[0][2] === pts[n - 1][2]) n--;   // geschlossener Ring
  if (n < 3) return [];
  let nx = 0, ny = 0, nz = 0;   // Normale nach Newell
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; nx += (a[1] - b[1])*(a[2] + b[2]); ny += (a[2] - b[2])*(a[0] + b[0]); nz += (a[0] - b[0])*(a[1] + b[1]); }
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
  const [u, v, s] = az >= ax && az >= ay ? [0, 1, nz] : ax >= ay ? [1, 2, nx] : [2, 0, ny];
  const P = pts.slice(0, n).map(p => [p[u], p[v]]), idx = [...Array(n).keys()], out = [];
  const sign = s >= 0 ? 1 : -1, cross = (a, b, c) => ((b[0] - a[0])*(c[1] - a[1]) - (b[1] - a[1])*(c[0] - a[0]))*sign;
  const inside = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  let guard = 0;
  while (idx.length > 3 && guard++ < 5000) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i + idx.length - 1) % idx.length], i1 = idx[i], i2 = idx[(i + 1) % idx.length];
      if (cross(P[i0], P[i1], P[i2]) <= 1e-9) continue;   // keine konvexe Ecke
      if (idx.some(k => k !== i0 && k !== i1 && k !== i2 && inside(P[k], P[i0], P[i1], P[i2]))) continue;
      out.push([i0, i1, i2]); idx.splice(i, 1); cut = true; break;
    }
    if (!cut) break;   // entartet: Rest als Fächer
  }
  for (let i = 1; i + 1 < idx.length; i++) out.push([idx[0], idx[i], idx[i + 1]]);
  return out;
}
// CityGML (LoD2): Dach- und Wandflächen als Dreiecke, je Gebäude. keep(x, y) wählt Gebäude nach der Mitte ihrer Flächen (UTM).
// Rückgabe: { roof: [[x,y,z]...] in Dreiergruppen, wall: [...], roofId: [Gebäude je Dreieck], wallId: [...],
// info: je Gebäude { fn: ALKIS-Gebäudefunktion (z. B. '31001_1000'), roof: Dachform (z. B. '3100') } }, UTM und Höhe über NHN.
export function readLod2(xml, keep = () => true) {
  const g = lod2Steps(xml, keep);
  for (let r = g.next(); ; r = g.next()) if (r.done) return r.value;
}
// Wie readLod2, gibt aber alle 5 ms die Kontrolle ab (Nachladen im Flug, L5b): große Kacheln (bis 70 MB) lassen das Bild weiterlaufen
export async function readLod2Async(xml, keep = () => true, slice = 5) {
  const g = lod2Steps(xml, keep);
  let t0 = Date.now();
  for (let r = g.next(); ; r = g.next()) {
    if (r.done) return r.value;
    if (Date.now() - t0 > slice) { await new Promise(res => setTimeout(res, 0)); t0 = Date.now(); }
  }
}
// Gemeinsamer Kern: je Gebäude ein Schritt (yield), am Ende das Ergebnis
function* lod2Steps(xml, keep) {
  const out = { roof: [], wall: [], roofId: [], wallId: [], info: [] };
  const bre = /<bldg:Building\b[\s\S]*?<\/bldg:Building>/g;
  let id = 0;
  for (let b; (b = bre.exec(xml)); ) {
    yield;
    const polys = [];
    const re = /<bldg:(RoofSurface|WallSurface)\b[\s\S]*?<\/bldg:\1>/g;
    for (let m; (m = re.exec(b[0])); ) {
      const ext = /<gml:exterior>[\s\S]*?<gml:posList[^>]*>([^<]*)<\/gml:posList>/g;
      for (let e; (e = ext.exec(m[0])); ) {
        const v = e[1].trim().split(/\s+/).map(Number), pts = [];
        for (let i = 0; i + 2 < v.length; i += 3) pts.push([v[i], v[i + 1], v[i + 2]]);
        if (pts.length >= 3) polys.push([m[1] === 'RoofSurface', pts]);
      }
    }
    if (!polys.length) continue;
    const all = polys.flatMap(p => p[1]), cx = all.reduce((t, p) => t + p[0], 0)/all.length, cy = all.reduce((t, p) => t + p[1], 0)/all.length;
    if (!keep(cx, cy)) continue;
    for (const [roof, pts] of polys) for (const [a, c2, d] of triangulate(pts)) {
      (roof ? out.roof : out.wall).push(pts[a], pts[c2], pts[d]); (roof ? out.roofId : out.wallId).push(id);
    }
    const tag = t => (b[0].match(new RegExp('<bldg:' + t + '>([^<]*)<')) || [0, ''])[1].trim();
    out.info.push({ fn: tag('function'), roof: tag('roofType'), cx, cy });   // Mitte (UTM) für späteres Auswählen aus dem Zwischenspeicher
    id++;
  }
  return out;
}
