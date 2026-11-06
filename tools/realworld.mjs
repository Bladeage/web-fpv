// Gebiet für den Modus „Echte Welt“ laden und kompakt ablegen (realworld/<name>.*). Nur Node-Bordmittel.
// Aufruf: node tools/realworld.mjs   (Gebiet unten in AREA; Ergebnis liegt im Repository, die CI lädt nichts nach)
// Quellen: Geobasis NRW, Lizenz „Datenlizenz Deutschland – Zero 2.0“ (jede Nutzung ohne Bedingungen).
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { readTiff, readLod2 } from '../src/geo.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), OUT = join(ROOT, 'realworld');
// Monschau (Eifel): Altstadt im Rurtal. 1 x 1 km in UTM 32 (EPSG:25832). Start: Wiese oberhalb der Altstadt.
export const AREA = {
  name: 'monschau', place: 'Monschau (Eifel, NRW)', crs: 'EPSG:25832', bbox: [304200, 5603500, 305200, 5604500],
  n: 512, dop: 4096, startNear: [304814, 5604314],
  dgm: 'https://www.wcs.nrw.de/geobasis/wcs_nw_dgm', dgmCoverage: 'nw_dgm',
  dopWms: 'https://www.wms.nrw.de/geobasis/wms_nw_dop', dopLayer: 'nw_dop_rgb', domCoverage: 'nw_dom',
  dom: 'https://www.wcs.nrw.de/geobasis/wcs_nw_dom',
  lod2: 'https://www.opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/lod2_gml/LoD2_32_{E}_{N}_1_NW.gml',   // Kacheln 1 km, Name nach UTM-km
  attribution: 'Geobasis NRW, Datenlizenz Deutschland – Zero 2.0'
};
// Abruf-Adressen (WCS 2.0.1 GetCoverage, WMS 1.3.0 GetMap). Auch im Browser nutzbar (realworld.js).
export function dgmUrl(a, svc = a.dgm, cov = a.dgmCoverage) {
  const [e0, n0, e1, n1] = a.bbox, crs = 'http://www.opengis.net/def/crs/EPSG/0/' + a.crs.split(':')[1];
  return `${svc}?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=${cov}&FORMAT=image/tiff`
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

// Bäume: Oberfläche minus Gelände (nDOM). Baumspitze = höchster Punkt im Umkreis von 6 m, mindestens 3 m hoch,
// nicht auf einem Gebäude (Dächer werden ins Raster gezeichnet und um 1 Zelle verbreitert). Kronenradius ~ 0,3 x Höhe (Schätzung).
function findTrees(dgm, dom, roofs, a) {
  const n = a.n, cell = (a.bbox[2] - a.bbox[0])/n, mask = new Uint8Array(n*n);
  const gi = e => (e - a.bbox[0])/cell - 0.5, gj = nn => (a.bbox[3] - nn)/cell - 0.5;
  for (let t = 0; t < roofs.length; t += 3) {
    const P = [roofs[t], roofs[t + 1], roofs[t + 2]].map(p => [gi(p[0]), gj(p[1])]);
    const i0 = Math.floor(Math.min(...P.map(p => p[0]))) - 1, i1 = Math.ceil(Math.max(...P.map(p => p[0]))) + 1;
    const j0 = Math.floor(Math.min(...P.map(p => p[1]))) - 1, j1 = Math.ceil(Math.max(...P.map(p => p[1]))) + 1;
    const cr = (p, q, r) => (q[0] - p[0])*(r[1] - p[1]) - (q[1] - p[1])*(r[0] - p[0]);
    for (let j = Math.max(0, j0); j <= Math.min(n - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(n - 1, i1); i++) {
      const c = [i, j], d1 = cr(P[0], P[1], c), d2 = cr(P[1], P[2], c), d3 = cr(P[2], P[0], c);
      const inT = !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
      if (inT) for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) if (i + x >= 0 && i + x < n && j + y >= 0 && j + y < n) mask[(j + y)*n + i + x] = 1;
    }
  }
  const nd = new Float32Array(n*n);
  for (let k = 0; k < n*n; k++) nd[k] = mask[k] ? 0 : Math.max(0, dom[k] - dgm[k]);
  const trees = [], R = 3;
  for (let j = R; j < n - R; j++) for (let i = R; i < n - R; i++) {
    const v = nd[j*n + i];
    if (v < 3 || v > 45) continue;
    let top = true;
    for (let y = -R; y <= R && top; y++) for (let x = -R; x <= R; x++) {
      if (!x && !y || x*x + y*y > R*R) continue;
      const w = nd[(j + y)*n + i + x];
      if (w > v || (w === v && (y < 0 || (y === 0 && x < 0)))) { top = false; break; }
    }
    if (top) trees.push([(i + 0.5)*cell - 500, (j + 0.5)*cell - 500, v, Math.min(5, Math.max(1.5, v*0.3))]);
  }
  return trees;
}
// Gebäudenutzung (ALKIS-Gebäudefunktion, steht in LoD2 als bldg:function) -> Fassadenklasse. Bedeutung der Codes geprüft
// gegen den ALKIS-WFS NRW (Feld „funktion“ als Text). 0 Wohnen, 1 Wohnen mit Laden, 2 Garage/Überdachung, 3 Gewerbe,
// 4 Landwirtschaft, 5 öffentlich, 6 Kirche/Burg/Turm. Unbekannt: Wohnen.
export function bldClass(fn) {
  if (/^31001_(1100)$/.test(fn)) return 1;
  if (/^31001_246\d$|^51009_/.test(fn)) return fn === '31001_2461' || fn === '31001_2462' ? 3 : 2;
  if (/^31001_2[0-6]\d\d$/.test(fn)) return 3;
  if (/^31001_27\d\d$/.test(fn)) return 4;
  if (/^31001_(3041|3043|3038)$|^51001_|^51007_/.test(fn)) return 6;
  if (/^31001_3\d\d\d$/.test(fn)) return 5;
  return 0;
}
const tile = (a, e, nn) => a.lod2.replace('{E}', e).replace('{N}', nn);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = AREA;
  const tif = await get(dgmUrl(a)), dop = await get(dopUrl(a)), domTif = await get(dgmUrl(a, a.dom, a.domCoverage));
  const t = readTiff(tif.buffer.slice(tif.byteOffset, tif.byteOffset + tif.byteLength));
  const dom = readTiff(domTif.buffer.slice(domTif.byteOffset, domTif.byteOffset + domTif.byteLength)).data;
  // Gebäude: alle 1-km-Kacheln, die das Gebiet berühren; Flächen mit Mitte im Gebiet
  const inBox = (e, nn) => e >= a.bbox[0] && e <= a.bbox[2] && nn >= a.bbox[1] && nn <= a.bbox[3], bld = { roof: [], wall: [], roofId: [], wallId: [], info: [] };
  let idBase = 0;
  for (let e = Math.floor(a.bbox[0]/1000); e < Math.ceil(a.bbox[2]/1000); e++) for (let nn = Math.floor(a.bbox[1]/1000); nn < Math.ceil(a.bbox[3]/1000); nn++) {
    const r = await fetch(tile(a, e, nn));
    if (!r.ok) continue;   // Kachel ohne Gebäude
    const o = readLod2(await r.text(), inBox); bld.roof.push(...o.roof); bld.wall.push(...o.wall);
    const nb = o.info.length;   // Gebäude dieser Kachel (Nummern 0 bis nb - 1)
    bld.info.push(...o.info);
    bld.roofId.push(...o.roofId.map(i => i + idBase)); bld.wallId.push(...o.wallId.map(i => i + idBase)); idBase += nb;
  }
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
  // Gebäude-Dreiecke als 16 Bit in Dezimetern (Kartenkoordinaten, y über dem Startplatz): erst Dächer, dann Wände
  const ec = (a.bbox[0] + a.bbox[2])/2, nc = (a.bbox[1] + a.bbox[3])/2, hHome = meta.hHome;
  // dazu je Dreieck die Gebäudenummer (16 Bit), angehängt hinter den Ecken, und je Gebäude Klasse + 16 x Flachdach
  const pts = bld.roof.concat(bld.wall), ids = bld.roofId.concat(bld.wallId), b16 = new Int16Array(pts.length*3 + ids.length + idBase);
  pts.forEach((p, k) => { b16[k*3] = Math.round((p[0] - ec)*10); b16[k*3 + 1] = Math.round((p[2] - hHome)*10); b16[k*3 + 2] = Math.round(-(p[1] - nc)*10); });
  ids.forEach((v, k) => { b16[pts.length*3 + k] = v; });
  bld.info.forEach((f, k) => { b16[pts.length*3 + ids.length + k] = bldClass(f.fn) + (f.roof === '1000' ? 16 : 0); });
  const cnt = {}; for (const f of bld.info) { const c = bldClass(f.fn); cnt[c] = (cnt[c] || 0) + 1; }
  console.log('Gebäude je Klasse', cnt, 'Flachdächer', bld.info.filter(f => f.roof === '1000').length);
  const trees = findTrees(t.data, dom, bld.roof, a), t16 = new Int16Array(trees.length*4);
  trees.forEach((tr, k) => t16.set(tr.map(v => Math.round(v*10)), k*4));
  Object.assign(meta, { roofTris: bld.roof.length/3, wallTris: bld.wall.length/3, buildings: idBase, trees: trees.length });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, a.name + '.bld'), deflateSync(Buffer.from(b16.buffer), { level: 9 }));
  writeFileSync(join(OUT, a.name + '.trees'), deflateSync(Buffer.from(t16.buffer), { level: 9 }));
  writeFileSync(join(OUT, a.name + '.dgm'), deflateSync(Buffer.from(q.buffer), { level: 9 }));
  writeFileSync(join(OUT, a.name + '.jpg'), dop);
  writeFileSync(join(OUT, a.name + '.json'), JSON.stringify(meta, null, 1) + '\n');
  console.log(meta, 'DGM gepackt', deflateSync(Buffer.from(q.buffer), { level: 9 }).length, 'B, Luftbild', dop.length, 'B');
}
