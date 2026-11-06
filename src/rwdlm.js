/* Echte Welt, Etappe L4: Gewässer und Ortsnamen aus dem ATKIS Basis-DLM (NRW: ein ZIP mit 4,7 GB, Shape-Dateien ungepackt).
   Ohne DOM: läuft im Browser und in Node. Netz nur über range(a, b) (Teilabruf, Bytes a bis b) und die Gesamtgröße.
   Der Browser lädt je Thema die Dateien für ganz NRW einmal (Gewässerflächen 28,5 MB, Ortslagen 31 MB) und speichert sie;
   je Gebiet werden daraus die Gewässer (1-m-Raster) und die Orte im Umkreis von 8 km geschnitten. */

// Eine Datei im ZIP finden (Inhaltsverzeichnis, ZIP64): { off, size, method } oder null. range(a, b) -> Uint8Array.
export async function dlmFind(range, total, want) {
  const t0 = Math.max(0, total - 65536), tail = await range(t0, total - 1), dv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  const find = sig => { for (let i = tail.length - 4; i >= 0; i--) if (dv.getUint32(i, true) === sig) return i; return -1; };
  let cdOff, cdSize;
  const loc = find(0x07064b50);
  if (loc >= 0) {
    const o = Number(dv.getBigUint64(loc + 8, true)), z = await range(o, o + 55), zv = new DataView(z.buffer, z.byteOffset, z.byteLength);
    cdSize = Number(zv.getBigUint64(40, true)); cdOff = Number(zv.getBigUint64(48, true));
  } else { const e = find(0x06054b50); if (e < 0) throw new Error('kein ZIP'); cdSize = dv.getUint32(e + 12, true); cdOff = dv.getUint32(e + 16, true); }
  const cd = await range(cdOff, cdOff + cdSize - 1), cv = new DataView(cd.buffer, cd.byteOffset, cd.byteLength), td = new TextDecoder();
  for (let q = 0; q + 46 <= cd.length && cv.getUint32(q, true) === 0x02014b50; ) {
    const n1 = cv.getUint16(q + 28, true), e1 = cv.getUint16(q + 30, true), c1 = cv.getUint16(q + 32, true), name = td.decode(cd.subarray(q + 46, q + 46 + n1));
    if (name.endsWith(want)) {
      let size = cv.getUint32(q + 20, true), usz = cv.getUint32(q + 24, true), off = cv.getUint32(q + 42, true);
      for (let k = q + 46 + n1; k + 4 <= q + 46 + n1 + e1; ) {
        const id = cv.getUint16(k, true), sz = cv.getUint16(k + 2, true);
        if (id === 1) { let r = k + 4; if (usz === 0xffffffff) { usz = Number(cv.getBigUint64(r, true)); r += 8; } if (size === 0xffffffff) { size = Number(cv.getBigUint64(r, true)); r += 8; } if (off === 0xffffffff) off = Number(cv.getBigUint64(r, true)); }
        k += 4 + sz;
      }
      const h = await range(off, off + 29), hv = new DataView(h.buffer, h.byteOffset, h.byteLength);
      return { off: off + 30 + hv.getUint16(26, true) + hv.getUint16(28, true), size, method: cv.getUint16(q + 10, true) };
    }
    q += 46 + n1 + e1 + c1;
  }
  return null;
}
// Shapefile lesen: je Objekt { k (Nummer), type, box [x0, y0, x1, y1], parts: [[[x, y], ...], ...] }; nur Objekte, deren Rechteck bb schneidet
export function shpRead(u8, bb) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), out = [];
  for (let p = 100, k = 0; p + 8 <= u8.length; k++) {
    const len = dv.getInt32(p + 4, false)*2, c = p + 8, t = dv.getInt32(c, true);
    if (t === 5 || t === 3) {
      const box = [dv.getFloat64(c + 4, true), dv.getFloat64(c + 12, true), dv.getFloat64(c + 20, true), dv.getFloat64(c + 28, true)];
      if (box[2] >= bb[0] && box[0] <= bb[2] && box[3] >= bb[1] && box[1] <= bb[3]) {
        const np = dv.getInt32(c + 36, true), nn = dv.getInt32(c + 40, true), pts = c + 44 + np*4, parts = [];
        for (let i = 0; i < np; i++) {
          const s = dv.getInt32(c + 44 + i*4, true), e = i + 1 < np ? dv.getInt32(c + 48 + i*4, true) : nn, r = [];
          for (let q = s; q < e; q++) r.push([dv.getFloat64(pts + q*16, true), dv.getFloat64(pts + q*16 + 8, true)]);
          parts.push(r);
        }
        out.push({ k, type: t, box, parts });
      }
    }
    p = c + len;
  }
  return out;
}
// DBF lesen: Feld name je Datensatz k (Text, ohne Leerzeichen am Rand)
export function dbfField(u8, name) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), hlen = dv.getUint16(8, true), rlen = dv.getUint16(10, true), td = new TextDecoder();
  let pos = 1, f = null;
  for (let o = 32; u8[o] !== 0x0d; o += 32) { const n = td.decode(u8.subarray(o, o + 11)).replace(/\0.*$/, ''), l = u8[o + 16]; if (n === name) f = { pos, l }; pos += l; }
  if (!f) return () => '';
  return k => td.decode(u8.subarray(hlen + k*rlen + f.pos, hlen + k*rlen + f.pos + f.l)).trim();
}
// Gewässerflächen ins Raster (1 m, Zellmitten, gerade-ungerade: Inseln bleiben trocken). bb = Gebiet (UTM), n Zellen je Seite.
// Rückgabe: Bitmaske (Zeile 0 = Norden) und Zahl der nassen Zellen.
export function dlmWater(shp, bb, n = Math.round(bb[2] - bb[0])) {
  const rings = shpRead(shp, bb).flatMap(o => o.parts), cell = (bb[2] - bb[0])/n, bits = new Uint8Array(Math.ceil(n*n/8));
  let wet = 0;
  for (let j = 0; j < n; j++) {
    const y = bb[3] - (j + 0.5)*cell, xs = [];
    for (const r of rings) for (let k = 0; k < r.length - 1; k++) {
      const [ax, ay] = r[k], [bx, by] = r[k + 1];
      if ((ay > y) !== (by > y)) xs.push(ax + (y - ay)*(bx - ax)/(by - ay));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - bb[0])/cell - 0.5)), i1 = Math.min(n - 1, Math.floor((xs[k + 1] - bb[0])/cell - 0.5));
      for (let i = i0; i <= i1; i++) { const b = j*n + i; bits[b >> 3] |= 1 << (b & 7); wet++; }
    }
  }
  return { bits, wet, n, res: cell };
}
// Linie vereinfachen (Douglas-Peucker, Toleranz tol m)
export function dlmSimplify(pts, tol) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  let k = 0, dmax = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((pts[i][0] - a[0])*dy - (pts[i][1] - a[1])*dx)/l; if (d > dmax) { dmax = d; k = i; } }
  return dmax < tol ? [a, b] : dlmSimplify(pts.slice(0, k + 1), tol).slice(0, -1).concat(dlmSimplify(pts.slice(k), tol));
}
// Ortslagen mit Namen im Umkreis (Rand m um das Gebiet), Umrisse vereinfacht, in Kartenkoordinaten (Mitte = Ursprung, z nach Süden)
// wie realworld/<name>.features.json (places).
export function dlmPlaces(shp, dbf, bb, margin = 8000) {
  const name = dbfField(dbf, 'NAM'), ec = (bb[0] + bb[2])/2, nc = (bb[1] + bb[3])/2;
  const loc = ([x, y]) => [+(x - ec).toFixed(1), +(-(y - nc)).toFixed(1)];
  return shpRead(shp, [bb[0] - margin, bb[1] - margin, bb[2] + margin, bb[3] + margin])
    .map(o => ({ name: name(o.k), rings: o.parts.map(r => dlmSimplify(r.slice(0, -1), 10).map(loc)).filter(r => r.length > 3) }))
    .filter(p => p.name && p.rings.length);
}
