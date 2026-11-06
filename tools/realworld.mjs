// Gebiet für den Modus „Echte Welt“ laden und kompakt ablegen (realworld/<name>.*). Nur Node-Bordmittel.
// Aufruf: node tools/realworld.mjs   (Gebiet unten in AREA; Ergebnis liegt im Repository, die CI lädt nichts nach)
// Quellen: Geobasis NRW, Lizenz „Datenlizenz Deutschland – Zero 2.0“ (jede Nutzung ohne Bedingungen).
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { readTiff } from '../src/geo.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), OUT = join(ROOT, 'realworld');
// Monschau (Eifel): Altstadt im Rurtal. 1 x 1 km in UTM 32 (EPSG:25832). Start: Wiese oberhalb der Altstadt.
export const AREA = {
  name: 'monschau', place: 'Monschau (Eifel, NRW)', crs: 'EPSG:25832', bbox: [304200, 5603500, 305200, 5604500],
  n: 512, dop: 2048, startNear: [304814, 5604314],
  dgm: 'https://www.wcs.nrw.de/geobasis/wcs_nw_dgm', dgmCoverage: 'nw_dgm',
  dopWms: 'https://www.wms.nrw.de/geobasis/wms_nw_dop', dopLayer: 'nw_dop_rgb',
  attribution: 'Geobasis NRW, Datenlizenz Deutschland – Zero 2.0'
};
// Abruf-Adressen (WCS 2.0.1 GetCoverage, WMS 1.3.0 GetMap). Auch im Browser nutzbar (realworld.js).
export function dgmUrl(a) {
  const [e0, n0, e1, n1] = a.bbox, crs = 'http://www.opengis.net/def/crs/EPSG/0/' + a.crs.split(':')[1];
  return `${a.dgm}?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=${a.dgmCoverage}&FORMAT=image/tiff`
    + `&SUBSET=x(${e0},${e1})&SUBSET=y(${n0},${n1})&SUBSETTINGCRS=${crs}&OUTPUTCRS=${crs}&SCALESIZE=x(${a.n}),y(${a.n})`;
}
export function dopUrl(a) {
  return `${a.dopWms}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${a.dopLayer}&STYLES=&CRS=${a.crs}`
    + `&BBOX=${a.bbox.join(',')}&WIDTH=${a.dop}&HEIGHT=${a.dop}&FORMAT=image/jpeg`;
}
async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status + ' ' + url);
  return new Uint8Array(await r.arrayBuffer());
}
// Flachste Stelle (Spanne der Höhen in 12 m Umkreis) innerhalb 80 m um den Wunschpunkt
function findStart(h, n, a) {
  const [e0, n0, e1] = a.bbox, cell = (e1 - e0)/n, at = (i, j) => h[j*n + i];
  const ci = Math.round((a.startNear[0] - e0)/cell - 0.5), cj = Math.round((a.bbox[3] - a.startNear[1])/cell - 0.5);
  let best = null;
  for (let j = cj - 40; j <= cj + 40; j++) for (let i = ci - 40; i <= ci + 40; i++) {
    if (Math.hypot(i - ci, j - cj)*cell > 80) continue;
    let lo = 1e9, hi = -1e9;
    for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) { const v = at(i + x, j + y); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (!best || hi - lo < best.s) best = { i, j, s: hi - lo };
  }
  return best;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = AREA;
  const tif = await get(dgmUrl(a)), dop = await get(dopUrl(a));
  const t = readTiff(tif.buffer.slice(tif.byteOffset, tif.byteOffset + tif.byteLength));
  if (t.w !== a.n || t.h !== a.n) throw new Error('Rastergröße ' + t.w + 'x' + t.h);
  let lo = 1e9, hi = -1e9;
  for (const v of t.data) if (isFinite(v) && v !== t.nodata) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  // Höhen als 16 Bit in Dezimetern über dem tiefsten Punkt, gepackt (deflate)
  const q = new Uint16Array(a.n*a.n);
  for (let i = 0; i < q.length; i++) { const v = t.data[i]; q[i] = Math.round(((isFinite(v) && v !== t.nodata ? v : lo) - lo)*10); }
  const st = findStart(t.data, a.n, a), cell = (a.bbox[2] - a.bbox[0])/a.n;
  // Kartenkoordinaten: Mitte des Gebiets = Ursprung, x nach Osten, z nach Süden
  const home = [(st.i + 0.5)*cell - 500, (st.j + 0.5)*cell - 500];
  const meta = { name: a.name, place: a.place, crs: a.crs, bbox: a.bbox, n: a.n, hMin: lo, hMax: hi, hScale: 0.1,
    home: home.map(v => +v.toFixed(1)), hHome: +t.data[st.j*a.n + st.i].toFixed(2), startSpan: +st.s.toFixed(2), attribution: a.attribution };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, a.name + '.dgm'), deflateSync(Buffer.from(q.buffer), { level: 9 }));
  writeFileSync(join(OUT, a.name + '.jpg'), dop);
  writeFileSync(join(OUT, a.name + '.json'), JSON.stringify(meta, null, 1) + '\n');
  console.log(meta, 'DGM gepackt', deflateSync(Buffer.from(q.buffer), { level: 9 }).length, 'B, Luftbild', dop.length, 'B');
}
