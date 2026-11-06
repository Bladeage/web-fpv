// Gewässer für den Modus „Echte Welt“ aus dem ATKIS Basis-DLM (Geobasis NRW, dl-de/zero-2.0). Nur Node-Bordmittel.
// Liest aus dem Gesamtpaket (Shape-ZIP, 4,7 GB) per HTTP-Teilabruf nur gew01_f.shp (Gewässerflächen: Flüsse, Seen, Teiche),
// schneidet auf das Gebiet zu und zeichnet die Flächen in ein Raster (1 m, gerade-ungerade-Regel: Inseln bleiben trocken).
// Ergebnis: realworld/<name>.water (1 Bit je Meter, Zeilen von Norden nach Süden, gepackt). Aufruf: node tools/water.mjs
import { writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateRawSync } from 'node:zlib';
import { AREA } from './realworld.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DLM = { url: 'https://www.opengeodata.nrw.de/produkte/geobasis/lm/akt/basis-dlm/basis-dlm_EPSG25832_Shape.zip', layer: 'gew01_f.shp', res: 1 };

async function range(url, a, b) { const r = await fetch(url, { headers: { Range: `bytes=${a}-${b}` } }); if (r.status !== 206) throw new Error(r.status + ' ' + url); return Buffer.from(await r.arrayBuffer()); }
// Eine Datei aus einem großen ZIP per Teilabruf (ZIP64 und gepackt/ungepackt)
export async function zipFile(url, want) {
  const size = +(await fetch(url, { method: 'HEAD' })).headers.get('content-length');
  const tail = await range(url, size - 65536, size - 1), loc = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x07]));
  let cdOff, cdSize;
  if (loc >= 0) { const o = Number(tail.readBigUInt64LE(loc + 8)), z = await range(url, o, o + 55); cdSize = Number(z.readBigUInt64LE(40)); cdOff = Number(z.readBigUInt64LE(48)); }
  else { const e = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); cdSize = tail.readUInt32LE(e + 12); cdOff = tail.readUInt32LE(e + 16); }
  const cd = await range(url, cdOff, cdOff + cdSize - 1);
  for (let q = 0; q + 46 <= cd.length && cd.readUInt32LE(q) === 0x02014b50; ) {
    const n1 = cd.readUInt16LE(q + 28), e1 = cd.readUInt16LE(q + 30), c1 = cd.readUInt16LE(q + 32), name = cd.slice(q + 46, q + 46 + n1).toString();
    if (name.endsWith(want)) {
      let csz = cd.readUInt32LE(q + 20), off = cd.readUInt32LE(q + 42);
      const ex = cd.slice(q + 46 + n1, q + 46 + n1 + e1);
      for (let k = 0; k + 4 <= ex.length; ) { const id = ex.readUInt16LE(k), sz = ex.readUInt16LE(k + 2);
        if (id === 1) { let r = k + 4; if (cd.readUInt32LE(q + 24) === 0xffffffff) r += 8; if (csz === 0xffffffff) { csz = Number(ex.readBigUInt64LE(r)); r += 8; } if (off === 0xffffffff) off = Number(ex.readBigUInt64LE(r)); }
        k += 4 + sz; }
      const h = await range(url, off, off + 29), d0 = off + 30 + h.readUInt16LE(26) + h.readUInt16LE(28), data = await range(url, d0, d0 + csz - 1);
      return cd.readUInt16LE(q + 10) === 8 ? inflateRawSync(data) : data;
    }
    q += 46 + n1 + e1 + c1;
  }
  throw new Error(want + ' nicht im Paket');
}
// Shapefile-Flächen (Typ 5) im Rechteck bb: Liste von Ringen [[x, y], ...]
export function shpRings(shp, bb) {
  const rings = [];
  for (let p = 100; p + 8 <= shp.length; ) {
    const len = shp.readInt32BE(p + 4)*2, c = p + 8;
    if (shp.readInt32LE(c) === 5) {
      const x0 = shp.readDoubleLE(c + 4), y0 = shp.readDoubleLE(c + 12), x1 = shp.readDoubleLE(c + 20), y1 = shp.readDoubleLE(c + 28);
      if (x1 >= bb[0] && x0 <= bb[2] && y1 >= bb[1] && y0 <= bb[3]) {
        const np = shp.readInt32LE(c + 36), nn = shp.readInt32LE(c + 40), parts = [];
        for (let i = 0; i < np; i++) parts.push(shp.readInt32LE(c + 44 + i*4));
        const pts = c + 44 + np*4;
        for (let i = 0; i < np; i++) {
          const ring = [];
          for (let k = parts[i]; k < (i + 1 < np ? parts[i + 1] : nn); k++) ring.push([shp.readDoubleLE(pts + k*16), shp.readDoubleLE(pts + k*16 + 8)]);
          rings.push(ring);
        }
      }
    }
    p = c + len;
  }
  return rings;
}
// Ringe in ein Raster zeichnen (Zellmitten, gerade-ungerade): Bitmaske n x n, Zeile 0 = Norden
export function rasterize(rings, bb, n) {
  const cell = (bb[2] - bb[0])/n, bits = new Uint8Array(Math.ceil(n*n/8));
  for (let j = 0; j < n; j++) {
    const y = bb[3] - (j + 0.5)*cell, xs = [];
    for (const r of rings) for (let k = 0; k < r.length - 1; k++) {
      const [ax, ay] = r[k], [bx, by] = r[k + 1];
      if ((ay > y) !== (by > y)) xs.push(ax + (y - ay)*(bx - ax)/(by - ay));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - bb[0])/cell - 0.5)), i1 = Math.min(n - 1, Math.floor((xs[k + 1] - bb[0])/cell - 0.5));
      for (let i = i0; i <= i1; i++) { const b = j*n + i; bits[b >> 3] |= 1 << (b & 7); }
    }
  }
  return bits;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const shp = await zipFile(DLM.url, DLM.layer), bb = AREA.bbox, n = Math.round((bb[2] - bb[0])/DLM.res);
  const rings = shpRings(shp, bb), bits = rasterize(rings, bb, n);
  let wet = 0; for (let b = 0; b < n*n; b++) if (bits[b >> 3] >> (b & 7) & 1) wet++;
  writeFileSync(join(ROOT, 'realworld', AREA.name + '.water'), deflateSync(Buffer.from(bits), { level: 9 }));
  const mf = join(ROOT, 'realworld', AREA.name + '.json'), meta = JSON.parse(readFileSync(mf, 'utf8'));
  meta.water = { n, res: DLM.res, area: wet, source: 'Basis-DLM gew01_f (Gewässerflächen)' };
  writeFileSync(mf, JSON.stringify(meta, null, 1) + '\n');
  console.log('Gewässer-Ringe', rings.length, 'nasse Fläche', wet, 'm²', 'Datei', deflateSync(Buffer.from(bits)).length, 'B');
}
