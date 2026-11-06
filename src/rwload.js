/* Echte Welt: Gebiet aus offenen Geodiensten laden (Etappe L1). Ohne DOM: läuft im Browser (Laden per Koordinate)
   und in Node (tools/realworld.mjs legt so das eingebettete Monschau ab). Netz nur über die übergebene Funktion get(url).
   Ergebnis „Paket“: dieselben Daten wie die eingebetteten Dateien (Beschreibung, Höhen 16 Bit, Luftbild JPEG, Gebäude, Bäume). */
import { readTiff, readLod2 } from './geo.js';

// Voreingestellte Quellen. NRW: Geobasis NRW, Datenlizenz Deutschland – Zero 2.0 (jede Nutzung ohne Bedingungen).
// Gebiet als Rechteck in UTM (grob, mit Rand); an Grenzen entscheidet später die Reihenfolge der Quellen (L3).
export const RW_SOURCES = [{
  id: 'nrw', name: 'Nordrhein-Westfalen (Geobasis NRW)', land: 'Nordrhein-Westfalen', crs: 'EPSG:25832', box: [278000, 5560000, 540000, 5832000],
  dgm: { url: 'https://www.wcs.nrw.de/geobasis/wcs_nw_dgm', coverage: 'nw_dgm' },
  dom: { url: 'https://www.wcs.nrw.de/geobasis/wcs_nw_dom', coverage: 'nw_dom' },
  dop: { url: 'https://www.wms.nrw.de/geobasis/wms_nw_dop', layer: 'nw_dop_rgb' },
  lod2: { url: 'https://www.opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/lod2_gml/LoD2_32_{E}_{N}_1_NW.gml', tileKm: 1 },
  // Landesdaten (L4): Basis-DLM als ein ZIP; Gewässerflächen und Ortslagen einmal laden (zusammen 60 MB, gesichert 06.11.2026)
  dlm: { url: 'https://www.opengeodata.nrw.de/produkte/geobasis/lm/akt/basis-dlm/basis-dlm_EPSG25832_Shape.zip', water: 'gew01_f.shp', places: ['sie01_f.shp', 'sie01_f.dbf'], mb: 60 },
  attribution: 'Geobasis NRW, Datenlizenz Deutschland – Zero 2.0'
}];
// Rastergrößen: Höhen 512² (knapp 2 m), Luftbild 4096² (0,25 m) für 1 x 1 km
export const RW_GRIDN = 512, RW_DOPN = 4096;
// Umgebung (L5a): 10 x 10 km um das Gebiet, Höhen alle 25 m, Luftbild 2048² (knapp 5 m). Ein WCS liefert Werte für
// Zellmitten; 401 Zellen über 10 025 m legen die Messpunkte auf -5000, -4975, ... 5000 m. So liegen die Ränder des
// 1-km-Gebiets (±500 m) genau auf Messpunkten, und die Netze passen ohne Risse aneinander.
export const RW_FAR = { size: 10025, n: 401, dop: 2048 };

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
// Quelle für einen Punkt (UTM): die erste, deren Gebiet ihn enthält. landAt(E, N) (Deutschlandkarte, falls vorhanden)
// prüft genauer: Quellen mit Land gelten nur in diesem Land (das Rechteck allein reicht bis Niedersachsen und Belgien).
export function rwSourceAt(E, N, list = RW_SOURCES, landAt = null) {
  const land = landAt ? landAt(E, N) : null;
  return list.find(s => E >= s.box[0] && E <= s.box[2] && N >= s.box[1] && N <= s.box[3] && (!landAt || !s.land || s.land === land)) || null;
}

// Grundrisse der Gebäude als Raster (Dächer aus LoD2, um dil Zellen verbreitert): 1 = Gebäude
export function roofMask(roofs, n, bbox, dil = 1) {
  const cell = (bbox[2] - bbox[0])/n, mask = new Uint8Array(n*n);
  const gi = e => (e - bbox[0])/cell - 0.5, gj = nn => (bbox[3] - nn)/cell - 0.5;
  for (let t = 0; t < roofs.length; t += 3) {
    const P = [roofs[t], roofs[t + 1], roofs[t + 2]].map(p => [gi(p[0]), gj(p[1])]);
    const i0 = Math.floor(Math.min(P[0][0], P[1][0], P[2][0])) - 1, i1 = Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])) + 1;
    const j0 = Math.floor(Math.min(P[0][1], P[1][1], P[2][1])) - 1, j1 = Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])) + 1;
    const cr = (p, q, r) => (q[0] - p[0])*(r[1] - p[1]) - (q[1] - p[1])*(r[0] - p[0]);
    for (let j = Math.max(0, j0); j <= Math.min(n - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(n - 1, i1); i++) {
      const c = [i, j], d1 = cr(P[0], P[1], c), d2 = cr(P[1], P[2], c), d3 = cr(P[2], P[0], c);
      const inT = !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
      if (inT) for (let y = -dil; y <= dil; y++) for (let x = -dil; x <= dil; x++) if (i + x >= 0 && i + x < n && j + y >= 0 && j + y < n) mask[(j + y)*n + i + x] = 1;
    }
  }
  return mask;
}
// Startplatz: flachste Stelle (Spanne der Höhen in 12 m Umkreis) nahe dem Wunschpunkt, nicht in oder an einem Gebäude
// (mask: Grundrisse, 6 m Abstand). Suche erst bis 80 m, sonst 200 m, sonst 480 m (Innenstadt). Ohne freie Stelle: null.
export function findStart(h, n, bbox, near, mask = null) {
  const cell = (bbox[2] - bbox[0])/n, at = (i, j) => h[j*n + i], R = Math.ceil(6/cell);
  const ci = Math.round((near[0] - bbox[0])/cell - 0.5), cj = Math.round((bbox[3] - near[1])/cell - 0.5);
  const built = (i, j) => { if (!mask) return false; for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) if (mask[(j + y)*n + i + x]) return true; return false; };
  for (const rad of [80, 200, 480]) {
    const k = Math.ceil(rad/cell);
    let best = null;
    for (let j = cj - k; j <= cj + k; j++) for (let i = ci - k; i <= ci + k; i++) {
      if (Math.hypot(i - ci, j - cj)*cell > rad || i < 6 || j < 6 || i >= n - 6 || j >= n - 6) continue;
      let lo = 1e9, hi = -1e9;
      for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) { const v = at(i + x, j + y); lo = Math.min(lo, v); hi = Math.max(hi, v); }
      if (!(hi - lo >= 0)) continue;   // Fenster mit ungültigen Werten (NaN) nie als Start
      if (best && hi - lo >= best.s) continue;
      if (built(i, j)) continue;       // im oder am Gebäude: das Höhenmodell zeigt dort den Boden, die Drohne säße im Haus
      best = { i, j, s: hi - lo };
    }
    if (best) return best;
  }
  return null;
}
// Bäume: Oberfläche minus Gelände (nDOM). Baumspitze = höchster Punkt im Umkreis von 6 m, mindestens 3 m hoch,
// nicht auf einem Gebäude (Dächer werden ins Raster gezeichnet und um 1 Zelle verbreitert). Kronenradius ~ 0,3 x Höhe (Schätzung).
export function findTrees(dgm, dom, roofs, n, bbox) {
  const cell = (bbox[2] - bbox[0])/n, half = (bbox[2] - bbox[0])/2, mask = roofMask(roofs, n, bbox, 1);
  const nd = new Float32Array(n*n);
  for (let k = 0; k < n*n; k++) { const v = dom[k] - dgm[k]; nd[k] = mask[k] || !isFinite(v) ? 0 : Math.max(0, v); }   // ohne Wert: kein Baum
  const trees = [], R = 3;
  for (let j = R; j < n - R; j++) for (let i = R; i < n - R; i++) {
    const v = nd[j*n + i];
    if (!(v >= 3 && v <= 45)) continue;
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

// Gebiet laden und packen. a: { bbox, crs, startNear [E, N], name, place, attribution }, src: Quelle oder Liste von Quellen
// (erste = Hauptquelle, alle im selben Koordinatensystem). get(url) liefert ein Uint8Array (oder wirft); text(url) liefert Text
// oder null (Kachel fehlt). say(Schritt, Anteil 0..1).
// Mehrere Quellen (Landesgrenze, L3): opt.cells = Raster RW_CELLS² mit der Nummer der Quelle je Zelle (rwCellSources). Höhen und
// Oberfläche: je Bildpunkt die Quelle seiner Zelle, fehlt dort ein Wert, die nächste mit Wert. Gebäude: aus der Quelle der Zelle,
// in der ihre Mitte liegt. Luftbild: opt.mergeImg(bilder, cells) setzt im Browser zusammen; ohne sie nur die Hauptquelle.
export const RW_CELLS = 64;
export async function rwFetchArea(a, src, get, text, say = () => {}, opt = {}) {
  const srcs = Array.isArray(src) ? src : [src], multi = srcs.length > 1 && opt.cells;
  const n = a.n || RW_GRIDN, buf = u8 => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength), C = RW_CELLS;
  const cellOf = (i, j) => opt.cells[Math.floor(j*C/n)*C + Math.floor(i*C/n)];
  // Raster aus allen Quellen zusammensetzen (ungültig: kein Zahlwert, Füllwert, unter -1000 m)
  const raster = async (key, what) => {
    const got = [];
    for (const s of multi ? srcs : srcs.slice(0, 1)) {
      if (!s[key]) { got.push(null); continue; }
      const t = readTiff(buf(await get(wcsUrl(s[key], a.bbox, a.crs, n))));
      if (t.w !== n || t.h !== n) throw new Error(what + 'raster ' + t.w + 'x' + t.h + ' statt ' + n);
      got.push(t);
    }
    if (!multi) return got[0];
    const bad = (t, k) => !t || !isFinite(t.data[k]) || t.data[k] === t.nodata || t.data[k] < -1000;
    const first = got.find(t => t), out = { w: n, h: n, nodata: first ? first.nodata : NaN, data: new Float32Array(n*n) };
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j*n + i, c = cellOf(i, j);
      let t = c >= 0 && !bad(got[c], k) ? got[c] : got.find(g => !bad(g, k));
      out.data[k] = t ? t.data[k] : NaN;
    }
    return out;
  };
  say('Höhen', 0);
  const dgm = await raster('dgm', 'Höhen');
  if (!dgm) throw new Error('Quelle ohne Höhen (WCS)');
  say('Oberfläche (Bäume)', 0.1);
  const domR = srcs[0].dom || multi ? await raster('dom', 'Oberflächen') : null, dom = domR ? domR.data : null;
  say('Luftbild', 0.2);
  // Fortschritt beim Herunterladen großer Dateien: Schritt mit MB
  const mb = (what, f) => n => say(what + ' (' + (n/1e6).toFixed(1) + ' MB)', f);
  let dop = null;
  if (multi && opt.mergeImg) {
    const imgs = [];
    for (const s of srcs) imgs.push(s.dop ? await get(wmsUrl(s.dop, a.bbox, a.crs, a.dopN || RW_DOPN), mb('Luftbild', 0.2)).catch(() => null) : null);
    dop = await opt.mergeImg(imgs, opt.cells);
  } else if (srcs[0].dop) dop = await get(wmsUrl(srcs[0].dop, a.bbox, a.crs, a.dopN || RW_DOPN), mb('Luftbild', 0.2));
  const inBox = (e, nn) => e >= a.bbox[0] && e <= a.bbox[2] && nn >= a.bbox[1] && nn <= a.bbox[3];
  // Gebäude: je Quelle ihre Kacheln; bei mehreren nur Gebäude, deren Mitte in einer Zelle dieser Quelle liegt
  const bld = { roof: [], wall: [], roofId: [], wallId: [], info: [] };
  const jobs = [];
  (multi ? srcs : srcs.slice(0, 1)).forEach((s, si) => { if (s.lod2) for (const u of lod2Urls(s.lod2, a.bbox)) jobs.push([si, u]); });
  for (let k = 0; k < jobs.length; k++) {
    const [si, u] = jobs[k];
    const step = 'Gebäude ' + (k + 1) + ' von ' + jobs.length, f = 0.45 + 0.45*k/jobs.length;
    say(step, f);
    const keep = !multi ? inBox : (e, nn) => {
      if (!inBox(e, nn)) return false;
      const i = (e - a.bbox[0])/(a.bbox[2] - a.bbox[0])*n, j = (a.bbox[3] - nn)/(a.bbox[3] - a.bbox[1])*n, c = cellOf(Math.min(n - 1, i), Math.min(n - 1, j));
      return c === si || (c < 0 && si === 0);
    };
    const xml = await text(u, mb(step, f));
    if (!xml) continue;   // Kachel ohne Gebäude
    const o = readLod2(xml, keep), base = bld.info.length;
    // Schleifen statt push(...liste): große Kacheln (Innenstadt) sprengen sonst im Browser den Aufrufstapel
    for (const x of o.roof) bld.roof.push(x);
    for (const x of o.wall) bld.wall.push(x);
    for (const x of o.info) bld.info.push(x);
    for (const i of o.roofId) bld.roofId.push(i + base);
    for (const i of o.wallId) bld.wallId.push(i + base);
  }
  say('Bäume', 0.92);
  const p = rwPack(a, dgm, dom, bld, dop);
  if (opt.far !== false) p.far = await rwFetchFar(a, srcs[0], get, say).catch(() => null);   // Umgebung: ohne sie geht es auch
  p.meta.attribution = [...new Set(srcs.map(s => s.attribution).filter(Boolean))].join('; ');
  return p;
}
// Quelle je Zelle (RW_CELLS² über dem Gebiet): Land der Zellmitte -> Nummer der Quelle dieses Landes in srcs, sonst -1.
// toLand(E, N) liefert das Land für einen Punkt im Koordinatensystem des Gebiets.
export function rwCellSources(a, srcs, toLand) {
  const C = RW_CELLS, out = new Int8Array(C*C), w = a.bbox[2] - a.bbox[0], h = a.bbox[3] - a.bbox[1];
  for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) {
    const land = toLand(a.bbox[0] + (i + 0.5)*w/C, a.bbox[3] - (j + 0.5)*h/C);
    out[j*C + i] = srcs.findIndex(s => s.land && s.land === land);
  }
  return out;
}
// Prüfen einer Quelle an einem Punkt (UTM im System der Quelle): kleine Abrufe je Ebene. Rückgabe [{ was, ok, text }].
export async function rwCheckSource(s, E, N, get, text) {
  const bb = [Math.round(E) - 100, Math.round(N) - 100, Math.round(E) + 100, Math.round(N) + 100], out = [];
  const run = async (was, fn) => { try { out.push({ was, ok: true, text: await fn() }); } catch (e) { out.push({ was, ok: false, text: String(e.message || e) }); } };
  const tif = async svc => { const b = await get(wcsUrl(svc, bb, s.crs, 16)), t = readTiff(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    const ok = [...t.data].filter(v => isFinite(v) && v !== t.nodata && v > -1000); if (!ok.length) throw new Error('nur Füllwerte (Ort außerhalb?)');
    return 'Höhe ' + ok[0].toFixed(1) + ' m'; };
  if (s.dgm) await run('Höhen', () => tif(s.dgm)); else out.push({ was: 'Höhen', ok: false, text: 'fehlt (nötig)' });
  if (s.dom) await run('Oberfläche', () => tif(s.dom));
  if (s.dop) await run('Luftbild', async () => { const b = await get(wmsUrl(s.dop, bb, s.crs, 64)); if (!(b[0] === 0xff && b[1] === 0xd8) && !(b[0] === 0x89 && b[1] === 0x50)) throw new Error('kein Bild'); return (b.length/1024).toFixed(0) + ' KB Bild'; });
  if (s.lod2) await run('Gebäude', async () => { const u = lod2Urls(s.lod2, bb)[0], t = await text(u); if (t === null) return 'keine Kachel an diesem Ort (' + u.split('/').pop() + ')';
    if (!/CityModel/.test(t.slice(0, 5000))) throw new Error('kein CityGML'); return 'Kachel erreichbar (' + u.split('/').pop() + ')'; });
  return out;
}
// Eigene Quellen aus einer Datei lesen (Export dieses Programms). Prüft die nötigen Felder. Rückgabe { sources, errors }.
export function rwSourcesParse(json) {
  let d; try { d = JSON.parse(json); } catch (e) { return { sources: [], errors: ['keine gültige Datei (JSON)'] }; }
  const list = Array.isArray(d) ? d : d && Array.isArray(d.sources) ? d.sources : null;
  if (!list) return { sources: [], errors: ['keine Quellenliste gefunden'] };
  const ok = [], errors = [], url = u => typeof u === 'string' && /^https?:\/\//.test(u);
  list.forEach((s, i) => {
    const e = [];
    if (!s || typeof s.name !== 'string' || !s.name) e.push('Name fehlt');
    if (!s || !['EPSG:25832', 'EPSG:25833'].includes(s.crs)) e.push('Koordinatensystem nur EPSG:25832 oder EPSG:25833');
    if (!s || !s.dgm || !url(s.dgm.url) || !s.dgm.coverage) e.push('Höhen (WCS-Adresse und Coverage) fehlen');
    for (const k of ['dom', 'dop', 'lod2']) if (s && s[k] && !url(s[k].url)) e.push(k + ': Adresse ungültig');
    if (s && s.dom && !s.dom.coverage) e.push('Oberfläche: Coverage-ID fehlt');
    if (s && s.dop && !s.dop.layer) e.push('Luftbild: Layer fehlt');
    if (!s || !s.land) e.push('Bundesland fehlt');
    if (s && s.lod2 && !/\{E\}/.test(s.lod2.url)) e.push('Gebäude: Muster braucht {E} und {N}');
    if (e.length) errors.push('Quelle ' + (i + 1) + ': ' + e.join(', '));
    else ok.push({ id: s.id || 'eigen-' + i, name: s.name, land: s.land || '', crs: s.crs, dgm: s.dgm, dom: s.dom || null, dop: s.dop || null, lod2: s.lod2 || null, attribution: s.attribution || s.name });
  });
  return { sources: ok, errors };
}
// Packen wie die eingebetteten Dateien: Höhen 16 Bit in dm über dem tiefsten Punkt; Gebäude als 16 Bit in dm
// (Kartenkoordinaten: Mitte = Ursprung, x nach Osten, z nach Süden, y über dem Startplatz), erst Dächer, dann Wände,
// dahinter je Dreieck die Gebäudenummer und je Gebäude Klasse + 16 x Flachdach; Bäume x, z, Höhe, Kronenradius in dm.
export function rwPack(a, dgm, dom, bld, dop) {
  const n = dgm.w;
  let lo = 1e9, hi = -1e9;
  for (const v of dgm.data) if (isFinite(v) && v !== dgm.nodata && v > -1000) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (!(hi >= lo)) throw new Error('Keine gültigen Höhen im Gebiet');
  // Ungültige Höhen (Füllwert, NaN aus dem Zusammensetzen) durch den tiefsten Wert ersetzen; Oberfläche dort = Gelände (kein Baum)
  const H = new Float32Array(n*n), q = new Uint16Array(n*n);
  for (let i = 0; i < q.length; i++) { const v = dgm.data[i], ok = isFinite(v) && v !== dgm.nodata && v > -1000; H[i] = ok ? v : lo; q[i] = Math.round((H[i] - lo)*10); }
  if (dom) dom = dom.map((v, i) => isFinite(v) && v > -1000 ? v : H[i]);
  dgm = { ...dgm, data: H };
  const near = a.startNear || [(a.bbox[0] + a.bbox[2])/2, (a.bbox[1] + a.bbox[3])/2];
  // Start nicht in Gebäuden; ganz ohne freie Stelle (geschlossene Bebauung im ganzen Gebiet) zur Not wie früher, ohne Maske
  const st = findStart(dgm.data, n, a.bbox, near, roofMask(bld.roof, n, a.bbox, 0)) || findStart(dgm.data, n, a.bbox, near), cell = (a.bbox[2] - a.bbox[0])/n, half = (a.bbox[2] - a.bbox[0])/2;
  const home = [(st.i + 0.5)*cell - half, (st.j + 0.5)*cell - half];
  const meta = { name: a.name, place: a.place, crs: a.crs, bbox: a.bbox, n, hMin: lo, hMax: hi, hScale: 0.1,
    home: home.map(v => +v.toFixed(1)), hHome: +dgm.data[st.j*n + st.i].toFixed(2), startSpan: +st.s.toFixed(2), startV: 2, attribution: a.attribution };
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
// Gespeicherte Gebiete von vor dem Fix „Start nicht im Gebäude“ (ohne meta.startV): Startplatz neu suchen.
// Nur home ändert sich; die Höhenbezüge (hHome) bleiben, denn Gebäude und Bäume sind relativ dazu gespeichert.
export function rwFixStart(p) {
  const m = p.meta;
  if (m.startV >= 2) return false;
  const n = m.n, bb = m.bbox, ec = (bb[0] + bb[2])/2, nc = (bb[1] + bb[3])/2, half = (bb[2] - bb[0])/2, cell = (bb[2] - bb[0])/n;
  const H = new Float32Array(n*n); for (let i = 0; i < n*n; i++) H[i] = m.hMin + p.q[i]*m.hScale;
  const roofs = []; for (let k = 0; k < m.roofTris*3; k++) roofs.push([ec + p.b16[k*3]/10, nc - p.b16[k*3 + 2]/10]);
  const st = findStart(H, n, bb, [ec, nc], roofMask(roofs, n, bb, 0));
  if (st) m.home = [+((st.i + 0.5)*cell - half).toFixed(1), +((st.j + 0.5)*cell - half).toFixed(1)];
  m.startV = 2;
  return true;
}
// Umgebung (L5a) laden: grobe Höhen und Luftbild für 10 x 10 km um die Mitte des Gebiets. Lücken (Füllwerte, etwa im
// Nachbarland) mit dem nächsten gültigen Wert füllen. Rückgabe { meta: { n, size, hMin, hScale }, q (16 Bit, dm über hMin), dop }.
export async function rwFetchFar(a, src, get, say = () => {}) {
  const c = [(a.bbox[0] + a.bbox[2])/2, (a.bbox[1] + a.bbox[3])/2], h = RW_FAR.size/2, n = RW_FAR.n, bb = [c[0] - h, c[1] - h, c[0] + h, c[1] + h];
  say('Umgebung (Höhen)', 0.94);
  const b = await get(wcsUrl(src.dgm, bb, a.crs, n)), t = readTiff(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  if (t.w !== n || t.h !== n) throw new Error('Umgebung: Raster ' + t.w + 'x' + t.h);
  const v = Float32Array.from(t.data, x => isFinite(x) && x !== t.nodata && x > -1000 ? x : NaN);
  rwFillGaps(v, n);
  let lo = Infinity; for (const x of v) if (x < lo) lo = x;
  if (!isFinite(lo)) throw new Error('Umgebung ohne Höhen');
  const q = Uint16Array.from(v, x => Math.round((x - lo)*10));
  say('Umgebung (Luftbild)', 0.96);
  const dop = src.dop ? await get(wmsUrl(src.dop, bb, a.crs, RW_FAR.dop)).catch(() => null) : null;
  return { meta: { n, size: RW_FAR.size, hMin: lo, hScale: 0.1 }, q, dop };
}
// Lücken (NaN) im Raster n x n schrittweise vom Rand der gültigen Werte her füllen (Mittel der gültigen Nachbarn)
export function rwFillGaps(v, n) {
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
  return v;
}
