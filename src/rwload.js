/* Echte Welt: Gebiet aus offenen Geodiensten laden (Etappe L1). Ohne DOM: läuft im Browser (Laden per Koordinate)
   und in Node (tools/realworld.mjs legt so das eingebettete Monschau ab). Netz nur über die übergebene Funktion get(url).
   Ergebnis „Paket“: dieselben Daten wie die eingebetteten Dateien (Beschreibung, Höhen 16 Bit, Luftbild JPEG, Gebäude, Bäume). */
import { readTiff, readLod2 } from './geo.js';

// Voreingestellte Quellen. NRW: Geobasis NRW, Datenlizenz Deutschland – Zero 2.0 (jede Nutzung ohne Bedingungen).
// Gebiet als Rechteck in UTM (grob, mit Rand); an Grenzen entscheidet später die Reihenfolge der Quellen (L3).
export const RW_SOURCES = [{
  id: 'nrw', name: 'Nordrhein-Westfalen (Geobasis NRW)', crs: 'EPSG:25832', box: [278000, 5560000, 540000, 5832000],
  dgm: { url: 'https://www.wcs.nrw.de/geobasis/wcs_nw_dgm', coverage: 'nw_dgm' },
  dom: { url: 'https://www.wcs.nrw.de/geobasis/wcs_nw_dom', coverage: 'nw_dom' },
  dop: { url: 'https://www.wms.nrw.de/geobasis/wms_nw_dop', layer: 'nw_dop_rgb' },
  lod2: { url: 'https://www.opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/lod2_gml/LoD2_32_{E}_{N}_1_NW.gml', tileKm: 1 },
  attribution: 'Geobasis NRW, Datenlizenz Deutschland – Zero 2.0'
}];
// Rastergrößen: Höhen 512² (knapp 2 m), Luftbild 4096² (0,25 m) für 1 x 1 km
export const RW_GRIDN = 512, RW_DOPN = 4096;

// Abruf-Adressen (WCS 2.0.1 GetCoverage, WMS 1.3.0 GetMap)
export function wcsUrl(svc, bbox, crs, n) {
  const [e0, n0, e1, n1] = bbox, c = 'http://www.opengis.net/def/crs/EPSG/0/' + crs.split(':')[1];
  return `${svc.url}?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=${svc.coverage}&FORMAT=image/tiff`
    + `&SUBSET=x(${e0},${e1})&SUBSET=y(${n0},${n1})&SUBSETTINGCRS=${c}&OUTPUTCRS=${c}&SCALESIZE=x(${n}),y(${n})`;
}
export function wmsUrl(svc, bbox, crs, n) {
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
export function rwSourceAt(E, N, list = RW_SOURCES) { return list.find(s => E >= s.box[0] && E <= s.box[2] && N >= s.box[1] && N <= s.box[3]) || null; }

// Flachste Stelle (Spanne der Höhen in 12 m Umkreis) innerhalb 80 m um den Wunschpunkt
export function findStart(h, n, bbox, near) {
  const cell = (bbox[2] - bbox[0])/n, at = (i, j) => h[j*n + i];
  const ci = Math.round((near[0] - bbox[0])/cell - 0.5), cj = Math.round((bbox[3] - near[1])/cell - 0.5);
  let best = null;
  for (let j = cj - 40; j <= cj + 40; j++) for (let i = ci - 40; i <= ci + 40; i++) {
    if (Math.hypot(i - ci, j - cj)*cell > 80 || i < 6 || j < 6 || i >= n - 6 || j >= n - 6) continue;
    let lo = 1e9, hi = -1e9;
    for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) { const v = at(i + x, j + y); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (!best || hi - lo < best.s) best = { i, j, s: hi - lo };
  }
  return best;
}
// Bäume: Oberfläche minus Gelände (nDOM). Baumspitze = höchster Punkt im Umkreis von 6 m, mindestens 3 m hoch,
// nicht auf einem Gebäude (Dächer werden ins Raster gezeichnet und um 1 Zelle verbreitert). Kronenradius ~ 0,3 x Höhe (Schätzung).
export function findTrees(dgm, dom, roofs, n, bbox) {
  const cell = (bbox[2] - bbox[0])/n, mask = new Uint8Array(n*n), half = (bbox[2] - bbox[0])/2;
  const gi = e => (e - bbox[0])/cell - 0.5, gj = nn => (bbox[3] - nn)/cell - 0.5;
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
    if (top) trees.push([(i + 0.5)*cell - half, (j + 0.5)*cell - half, v, Math.min(5, Math.max(1.5, v*0.3))]);
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

// Gebiet laden und packen. a: { bbox, crs, startNear [E, N], name, place, attribution }, src: Quelle (siehe RW_SOURCES).
// get(url) liefert ein Uint8Array (oder wirft); text(url) liefert Text oder null (Kachel fehlt). say(Schritt, Anteil 0..1).
export async function rwFetchArea(a, src, get, text, say = () => {}) {
  const n = a.n || RW_GRIDN, buf = u8 => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  say('Höhen', 0);
  const dgm = readTiff(buf(await get(wcsUrl(src.dgm, a.bbox, a.crs, n))));
  if (dgm.w !== n || dgm.h !== n) throw new Error('Höhenraster ' + dgm.w + 'x' + dgm.h + ' statt ' + n);
  say('Oberfläche (Bäume)', 0.1);
  const dom = src.dom ? readTiff(buf(await get(wcsUrl(src.dom, a.bbox, a.crs, n)))).data : null;
  say('Luftbild', 0.2);
  const dop = src.dop ? await get(wmsUrl(src.dop, a.bbox, a.crs, a.dopN || RW_DOPN)) : null;
  const inBox = (e, nn) => e >= a.bbox[0] && e <= a.bbox[2] && nn >= a.bbox[1] && nn <= a.bbox[3];
  const bld = { roof: [], wall: [], roofId: [], wallId: [], info: [] }, tiles = src.lod2 ? lod2Urls(src.lod2, a.bbox) : [];
  for (let k = 0; k < tiles.length; k++) {
    say('Gebäude ' + (k + 1) + ' von ' + tiles.length, 0.45 + 0.45*k/tiles.length);
    const xml = await text(tiles[k]);
    if (!xml) continue;   // Kachel ohne Gebäude
    const o = readLod2(xml, inBox), base = bld.info.length;
    // Schleifen statt push(...liste): große Kacheln (Innenstadt) sprengen sonst im Browser den Aufrufstapel
    for (const x of o.roof) bld.roof.push(x);
    for (const x of o.wall) bld.wall.push(x);
    for (const x of o.info) bld.info.push(x);
    for (const i of o.roofId) bld.roofId.push(i + base);
    for (const i of o.wallId) bld.wallId.push(i + base);
  }
  say('Bäume', 0.92);
  return rwPack(a, dgm, dom, bld, dop);
}
// Packen wie die eingebetteten Dateien: Höhen 16 Bit in dm über dem tiefsten Punkt; Gebäude als 16 Bit in dm
// (Kartenkoordinaten: Mitte = Ursprung, x nach Osten, z nach Süden, y über dem Startplatz), erst Dächer, dann Wände,
// dahinter je Dreieck die Gebäudenummer und je Gebäude Klasse + 16 x Flachdach; Bäume x, z, Höhe, Kronenradius in dm.
export function rwPack(a, dgm, dom, bld, dop) {
  const n = dgm.w;
  let lo = 1e9, hi = -1e9;
  for (const v of dgm.data) if (isFinite(v) && v !== dgm.nodata) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const q = new Uint16Array(n*n);
  for (let i = 0; i < q.length; i++) { const v = dgm.data[i]; q[i] = Math.round(((isFinite(v) && v !== dgm.nodata ? v : lo) - lo)*10); }
  const near = a.startNear || [(a.bbox[0] + a.bbox[2])/2, (a.bbox[1] + a.bbox[3])/2];
  const st = findStart(dgm.data, n, a.bbox, near), cell = (a.bbox[2] - a.bbox[0])/n, half = (a.bbox[2] - a.bbox[0])/2;
  const home = [(st.i + 0.5)*cell - half, (st.j + 0.5)*cell - half];
  const meta = { name: a.name, place: a.place, crs: a.crs, bbox: a.bbox, n, hMin: lo, hMax: hi, hScale: 0.1,
    home: home.map(v => +v.toFixed(1)), hHome: +dgm.data[st.j*n + st.i].toFixed(2), startSpan: +st.s.toFixed(2), attribution: a.attribution };
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
