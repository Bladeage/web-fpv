/* Straßen für geladene Orte (Nutzer, Prompt 180/184, Etappe S2; Plan docs/plan-nacht-strassen.md 2.1 bis 2.3). Quelle: ALKIS
   „vereinfacht“ NRW per WFS, Flächen der Nutzung „Straßenverkehr“ (Lizenz dl-de/zero-2.0). Daraus Mittellinien: Flächen auf ein
   1-m-Raster legen, Lücken schließen, ausdünnen (Zhang-Suen), Stummel unter 12 m entfernen, Linien verfolgen, vereinfachen, Breite
   und Name je Linie. Ausgabe wie die Achsen von Monschau: [{ name, pts: [[x, z], …], w }] relativ zur Mitte des Gebiets (x Ost,
   z Süd). Ohne DOM, läuft im Worker und in Node. */
import { dlmSimplify } from './rwdlm.js';

// margin Rand um das Gebiet (m), prune kürzeste Stichstraße (m), simp Toleranz beim Vereinfachen (m), wMin/wMax Breite (m)
export const RWROADS = { margin: 8, prune: 12, simp: 0.7, wMin: 3, wMax: 12 };

// Anfrage an den WFS (POST, Filter nach Nutzung und Rechteck). Nur ASCII im Quelltext: Umlaute als Zeichencode.
export function alkisRoadBody(r, bbox) {
  const crs = 'urn:ogc:def:crs:EPSG::' + (r.epsg || 25832), esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return '<wfs:GetFeature xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:fes="http://www.opengis.net/fes/2.0" xmlns:gml="http://www.opengis.net/gml/3.2"'
    + ' xmlns:ave="' + r.ns + '" service="WFS" version="2.0.0"><wfs:Query typeNames="' + r.type + '" srsName="' + crs + '"><fes:Filter><fes:And>'
    + '<fes:PropertyIsEqualTo><fes:ValueReference>ave:' + r.field + '</fes:ValueReference><fes:Literal>' + esc(r.value) + '</fes:Literal></fes:PropertyIsEqualTo>'
    + '<fes:BBOX><fes:ValueReference>ave:geometrie</fes:ValueReference><gml:Envelope srsName="' + crs + '"><gml:lowerCorner>' + bbox[0] + ' ' + bbox[1]
    + '</gml:lowerCorner><gml:upperCorner>' + bbox[2] + ' ' + bbox[3] + '</gml:upperCorner></gml:Envelope></fes:BBOX></fes:And></fes:Filter></wfs:Query></wfs:GetFeature>';
}
export const alkisRoadUrl = (r, bbox) => r.url + '?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=' + r.type + '&SRSNAME=urn:ogc:def:crs:EPSG::' + (r.epsg || 25832)
  + '&BBOX=' + bbox.join(',') + ',urn:ogc:def:crs:EPSG::' + (r.epsg || 25832);

// GML 3.2 (WFS-Antwort) lesen: je wfs:member die Polygone (äußerer Ring und Löcher als flache Felder E, N, E, N …), Nutzung, Name.
// Ohne DOM (läuft im Worker): Suche über Textstellen wie readLod2.
export function readGmlSurfaces(xml, field = 'nutzart') {
  const out = [], tag = (s, t) => { const m = s.match(new RegExp('<' + t + '>([^<]*)</' + t + '>')); return m ? m[1].trim() : ''; };
  for (let i = xml.indexOf('<wfs:member'); i >= 0; ) {
    const j = xml.indexOf('</wfs:member>', i), m = xml.slice(i, j < 0 ? xml.length : j), polys = [];
    for (const pg of m.split('<gml:Polygon').slice(1)) {
      const rings = [...pg.matchAll(/<gml:posList[^>]*>([^<]*)<\/gml:posList>/g)].map(r => Float64Array.from(r[1].trim().split(/\s+/), Number));
      if (rings.length) polys.push(rings);
    }
    out.push({ kind: tag(m, field), name: tag(m, 'name'), polys });
    i = j < 0 ? -1 : xml.indexOf('<wfs:member', j);
  }
  return out;
}

// Flächen -> Mittellinien. feats aus readGmlSurfaces (schon gefiltert), bbox [E0, N0, E1, N1] des Gebiets (ohne Rand).
export function roadAxes(feats, bbox) {
  const M = RWROADS.margin, e0 = bbox[0] - M, n1 = bbox[3] + M, W = Math.ceil(bbox[2] - bbox[0] + 2*M), H = Math.ceil(bbox[3] - bbox[1] + 2*M);
  const mask = new Uint8Array(W*H), id = new Uint16Array(W*H);
  // 1. Rastern: je Polygon Zeilen von Norden, gerade-ungerade über alle Ringe (Löcher bleiben frei)
  feats.forEach((f, k) => { for (const rings of f.polys) {
    let nlo = Infinity, nhi = -Infinity; for (const r of rings) for (let q = 1; q < r.length; q += 2) { nlo = Math.min(nlo, r[q]); nhi = Math.max(nhi, r[q]); }
    const j0 = Math.max(0, Math.floor(n1 - nhi)), j1 = Math.min(H - 1, Math.ceil(n1 - nlo)), xs = [];
    for (let j = j0; j <= j1; j++) {
      const y = n1 - j - 0.5; xs.length = 0;
      for (const r of rings) for (let q = 0; q + 3 < r.length; q += 2) {
        const ay = r[q + 1], by = r[q + 3];
        if ((ay > y) !== (by > y)) xs.push(r[q] + (y - ay)*(r[q + 2] - r[q])/(by - ay));
      }
      xs.sort((a, b) => a - b);
      for (let p = 0; p + 1 < xs.length; p += 2) {
        const i0 = Math.max(0, Math.ceil(xs[p] - e0 - 0.5)), i1 = Math.min(W - 1, Math.floor(xs[p + 1] - e0 - 0.5));
        for (let i = i0; i <= i1; i++) { mask[j*W + i] = 1; id[j*W + i] = k + 1; }
      }
    }
  } });
  // 2. Schließen (erweitern, dann abtragen, je eine Zelle): angrenzende Flächen einer Straße wachsen zusammen
  const morph = (src, grow) => { const o = new Uint8Array(W*H);
    for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
      const p = j*W + i; let v = src[p];
      if (grow ? !v : v) for (let b = -1; b <= 1 && (grow ? !v : v); b++) for (let a = -1; a <= 1; a++) { const s = src[p + b*W + a]; if (grow ? s : !s) { v = grow ? 1 : 0; break; } }
      o[p] = v;
    } return o; };
  const area = morph(morph(mask, true), false);
  // 3. Ausdünnen (Zhang-Suen): Nachbarn v0..v7 im Uhrzeigersinn ab Norden; nur über die noch gesetzten Zellen laufen
  const sk = area.slice(), D = [-W, -W + 1, 1, W + 1, W, W - 1, -1, -W - 1];
  let act = []; for (let p = 0; p < W*H; p++) if (sk[p]) act.push(p);
  for (let changed = true, it = 0; changed && it < 80; it++) {
    changed = false;
    for (const pass of [0, 1]) {
      const del = [];
      for (const p of act) {
        const v0 = sk[p - W], v1 = sk[p - W + 1], v2 = sk[p + 1], v3 = sk[p + W + 1], v4 = sk[p + W], v5 = sk[p + W - 1], v6 = sk[p - 1], v7 = sk[p - W - 1];
        const B = v0 + v1 + v2 + v3 + v4 + v5 + v6 + v7;
        if (B < 2 || B > 6) continue;
        const A = (!v0 && v1) + (!v1 && v2) + (!v2 && v3) + (!v3 && v4) + (!v4 && v5) + (!v5 && v6) + (!v6 && v7) + (!v7 && v0);
        if (A !== 1) continue;
        if (pass === 0 ? (v0*v2*v4 || v2*v4*v6) : (v0*v2*v6 || v0*v4*v6)) continue;
        del.push(p);
      }
      if (del.length) { changed = true; for (const p of del) sk[p] = 0; act = act.filter(p => sk[p]); }
    }
  }
  // Treppenstufen entfernen: Punkt mit zwei oder mehr Nachbarn, dessen Wegfall nichts trennt (8er-Verbindungszahl nach Yokoi = 1)
  const nb = p => { let c = 0; for (const d of D) c += sk[p + d]; return c; };
  const YK = [2, 1, 0, 7, 6, 5, 4, 3];   // Yokoi zählt gegen den Uhrzeigersinn ab Osten: Ost, NO, Nord, NW, West, SW, Süd, SO
  const yokoi = p => { const x = YK.map(k => 1 - sk[p + D[k]]); let s = 0; for (const k of [0, 2, 4, 6]) s += x[k] - x[k]*x[k + 1]*x[(k + 2) % 8]; return s; };
  for (const p of act) if (sk[p] && nb(p) >= 2 && yokoi(p) === 1) sk[p] = 0;
  act = act.filter(p => sk[p]);
  // 4. Stummel unter prune Meter von Endpunkten bis zur ersten Kreuzung entfernen (Parkbuchten, Einfahrten), ebenso kurze
  // Stücke ohne Anschluss; zweimal
  const step = (p, prev) => { for (const d of D) { const q = p + d; if (q !== prev && sk[q]) return q; } return -1; };
  const dl = (p, q) => (Math.abs(q - p) === 1 || Math.abs(q - p) === W) ? 1 : Math.SQRT2;
  for (let round = 0; round < 2; round++) for (const p of act) {
    if (!sk[p] || nb(p) !== 1) continue;
    const path = [p]; let prev = -1, cur = p, len = 0;
    while (len <= RWROADS.prune) { const q = step(cur, prev); if (q < 0) break; len += dl(cur, q); prev = cur; cur = q; if (nb(cur) !== 2) break; path.push(cur); }
    if (len <= RWROADS.prune && nb(cur) >= 3) for (const q of path) sk[q] = 0;
    else if (len <= RWROADS.prune && nb(cur) <= 1) { for (const q of path) sk[q] = 0; sk[cur] = 0; }
  }
  act = act.filter(p => sk[p]);
  // 5. Linien verfolgen: Knoten = Zellen mit einem oder mehr als zwei Nachbarn; dazwischen Linienzüge
  const isNode = p => nb(p) !== 2, seen = new Uint8Array(W*H), lines = [];
  const walk = (start, first) => {
    const px = [start]; let prev = start, cur = first;
    for (;;) {
      px.push(cur);
      if (cur === start || isNode(cur)) break;
      seen[cur] = 1;
      let nx = -1;
      for (const d of D) {
        const q = cur + d; if (q === prev || !sk[q]) continue;
        if ((q === start && px.length > 2) || isNode(q)) { nx = q; break; }
        if (!seen[q]) nx = q;
      }
      if (nx < 0) break;
      prev = cur; cur = nx;
    }
    return px;
  };
  const done = new Set();
  for (const p of act) if (isNode(p)) for (const d of D) {
    const q = p + d; if (!sk[q]) continue;
    if (isNode(q)) { const k = Math.min(p, q) + ':' + Math.max(p, q); if (!done.has(k)) { done.add(k); lines.push([p, q]); } continue; }
    if (!seen[q]) lines.push(walk(p, q));
  }
  for (const p of act) if (!seen[p] && !isNode(p)) { const q = step(p, -1); if (q >= 0) { seen[p] = 1; lines.push(walk(p, q)); } }   // Ringe ohne Knoten
  // 6. In Meter, vereinfachen, Breite und Name, auf das Gebiet zuschneiden
  const ec = (bbox[0] + bbox[2])/2, nc = (bbox[1] + bbox[3])/2, out = [];
  const inA = (E, N) => { const i = Math.floor(E - e0), j = Math.floor(n1 - N); return i >= 0 && j >= 0 && i < W && j < H && area[j*W + i]; };
  for (const L of lines) {
    if (L.length < 2) continue;
    const pts = L.map(p => [e0 + p % W + 0.5, n1 - Math.floor(p/W) - 0.5]);
    let len = 0; for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    if (len < 3) continue;   // Gewirr an Kreuzungen
    // Name: häufigste Fläche entlang der Linie
    const cnt = new Map(); for (const p of L) if (id[p]) cnt.set(id[p], (cnt.get(id[p]) || 0) + 1);
    let best = 0, bn = 0; for (const [k, n] of cnt) if (n > bn) { bn = n; best = k; }
    // Breite: an bis zu 5 Stellen senkrecht zur Linie bis zum Rand der Fläche laufen, Median
    const ws = [];
    for (let s = 1; s <= 5; s++) {
      const k = Math.min(pts.length - 2, Math.floor(s*(pts.length - 1)/6)), a = pts[k], b = pts[k + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1])/l, ny = (b[0] - a[0])/l;
      let w = 0; for (const sg of [1, -1]) { let t = 0.5; while (t < RWROADS.wMax && inA(a[0] + nx*t*sg, a[1] + ny*t*sg)) t += 0.5; w += t; }
      ws.push(w);
    }
    ws.sort((x, y) => x - y);
    const w = Math.max(RWROADS.wMin, Math.min(RWROADS.wMax, ws[ws.length >> 1]));
    const name = best ? feats[best - 1].name : '';
    // Vereinfachen; geschlossene Ringe in zwei Hälften (sonst bleiben nur Anfang und Ende, die zusammenfallen)
    const h = pts.length >> 1, ring = pts.length > 4 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
    const simp = ring ? dlmSimplify(pts.slice(0, h + 1), RWROADS.simp).concat(dlmSimplify(pts.slice(h), RWROADS.simp).slice(1)) : dlmSimplify(pts, RWROADS.simp);
    for (const part of clipRect(simp, bbox))
      if (part.length > 1) out.push({ name, w: Math.round(w*2)/2, pts: part.map(p => [Math.round((p[0] - ec)*10)/10, Math.round(-(p[1] - nc)*10)/10]) });
  }
  return out;
}
// Linienzug auf ein Rechteck zuschneiden (Liang-Barsky je Strecke); liefert die Stücke innerhalb
export function clipRect(pts, b) {
  const out = []; let cur = null;
  for (let k = 0; k + 1 < pts.length; k++) {
    const [x0, y0] = pts[k], [x1, y1] = pts[k + 1], dx = x1 - x0, dy = y1 - y0;
    let t0 = 0, t1 = 1, ok = true;
    for (const [p, q] of [[-dx, x0 - b[0]], [dx, b[2] - x0], [-dy, y0 - b[1]], [dy, b[3] - y0]]) {
      if (p === 0) { if (q < 0) { ok = false; break; } continue; }
      const r = q/p; if (p < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; } else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
    }
    if (!ok) { cur = null; continue; }
    const A = [x0 + dx*t0, y0 + dy*t0], B = [x0 + dx*t1, y0 + dy*t1];
    if (!cur || t0 > 0) { cur = [A]; out.push(cur); }
    cur.push(B);
    if (t1 < 1) cur = null;
  }
  return out;
}
// Abruf und Umwandlung für ein Gebiet: POST mit Filter, bei Ablehnung GET mit Rechteck (größer, gefiltert beim Lesen).
// net: rwNet(signal) mit post und text. Liefert die Achsen (leer, wenn der Ort keine Straßen hat).
export async function rwRoadsFetch(r, bbox, net) {
  const M = RWROADS.margin, big = [bbox[0] - M, bbox[1] - M, bbox[2] + M, bbox[3] + M];
  let xml;
  try { xml = await net.post(r.url, alkisRoadBody(r, big)); }
  catch (e) { if (/Abgebrochen/.test(String(e && e.message))) throw e; xml = await net.text(alkisRoadUrl(r, big)); }
  if (!xml || !/FeatureCollection/.test(xml.slice(0, 2000))) throw new Error('Straßendienst meldet: ' + String(xml || 'nichts').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100));
  return roadAxes(readGmlSurfaces(xml, r.field).filter(f => f.kind === r.value), bbox);
}
