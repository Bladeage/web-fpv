/* Geodaten lesen (Modus „Echte Welt“). Ohne DOM: läuft im Browser und im Werkzeug tools/realworld.mjs.
   GeoTIFF mit Gleitkomma-Höhen (wie die WCS-Dienste der Länder liefern): Streifen oder Kacheln,
   ohne Kompression oder LZW, Prädiktor 1 (keiner), 2 (waagrecht) oder 3 (Gleitkomma). Dazu WGS84 -> UTM. */

// TIFF lesen: ArrayBuffer -> { w, h, data: Float32Array (Zeile für Zeile, oben = Norden) }
export function readTiff(buf) {
  const dv = new DataView(buf), le = dv.getUint16(0) === 0x4949;
  const u16 = o => dv.getUint16(o, le), u32 = o => dv.getUint32(o, le);
  if (u16(2) !== 42) throw new Error('Kein klassisches TIFF');
  const ifd = u32(4), n = u16(ifd), tags = {};
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
  const w = tags[256][0], h = tags[257][0], comp = (tags[259] || [1])[0], pred = (tags[317] || [1])[0];
  const bps = (tags[258] || [32])[0], fmt = (tags[339] || [3])[0], spp = (tags[277] || [1])[0];
  if (spp !== 1) throw new Error('Nur ein Kanal unterstützt');
  if (comp !== 1 && comp !== 5) throw new Error('Kompression ' + comp + ' nicht unterstützt (nur keine oder LZW)');
  const bytes = bps/8, tiled = !!tags[322];
  const tw = tiled ? tags[322][0] : w, th = tiled ? tags[323][0] : (tags[278] || [h])[0];
  const offs = tiled ? tags[324] : tags[273], cnts = tiled ? tags[325] : tags[279];
  const out = new Float32Array(w*h), across = Math.ceil(w/tw);
  offs.forEach((off, b) => {
    let raw = new Uint8Array(buf, off, cnts[b]);
    if (comp === 5) raw = lzw(raw, tw*th*bytes);
    raw = unpredict(raw, tw, th, bytes, pred);
    const bdv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    const bx = (b % across)*tw, by = Math.floor(b/across)*th;
    for (let y = 0; y < th && by + y < h; y++) for (let x = 0; x < tw && bx + x < w; x++) {
      const o = (y*tw + x)*bytes;
      out[(by + y)*w + bx + x] = fmt === 3 ? (bytes === 8 ? bdv.getFloat64(o, pred === 3 ? false : le) : bdv.getFloat32(o, pred === 3 ? false : le))
        : bytes === 2 ? (fmt === 2 ? bdv.getInt16(o, le) : bdv.getUint16(o, le)) : bdv.getInt32(o, le);
    }
  });
  const nodata = tags[42113] ? parseFloat(String.fromCharCode(...tags[42113]).replace(/\0/g, '')) : NaN;
  return { w, h, data: out, nodata };
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
// Prädiktor rückgängig machen. 3 (Gleitkomma): Bytes je Zeile nach Wertigkeit sortiert und waagrecht differenziert.
function unpredict(raw, w, h, bytes, pred) {
  if (pred === 1) return raw;
  const out = new Uint8Array(raw.length), row = w*bytes;
  for (let y = 0; y < h; y++) {
    const o = y*row;
    if (pred === 2) {   // waagrecht je Wert (hier nur 8-Bit-Schritte über die Bytes eines Kanals, reicht für 16/32 Bit nicht genau)
      for (let i = 0; i < row; i++) out[o + i] = (raw[o + i] + (i >= bytes ? out[o + i - bytes] : 0)) & 255;
    } else {
      const tmp = new Uint8Array(row);
      for (let i = 0; i < row; i++) tmp[i] = (raw[o + i] + (i > 0 ? tmp[i - 1] : 0)) & 255;
      for (let x = 0; x < w; x++) for (let b = 0; b < bytes; b++) out[o + x*bytes + b] = tmp[b*w + x];   // Big-Endian je Wert
    }
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
    out.info.push({ fn: tag('function'), roof: tag('roofType') });
    id++;
  }
  return out;
}
