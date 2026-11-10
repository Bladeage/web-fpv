/* Deutschlandkarte im Menü (Etappe L2): Ort für „Echte Welt“ wählen. Ziehen verschiebt, Mausrad oder zwei Finger
   zoomen, Klick oder Tippen setzt den Punkt; das Quadrat zeigt den Ausschnitt (1 x 1 km).
   Grenzen eingebettet (geht offline). Online liegt die Karte von basemap.de darunter (WMS, UTM 32; © GeoBasis-DE / BKG 2026, CC BY 4.0). */
import { cfg } from './state.js';
import { deMap, deLandAt, mapToScreen, mapFromScreen, mapZoom, mapClamp, mapFitGermany } from './demap.js';
import { toUtm, fromUtm } from './geo.js';
import { rwSources, rwPlan, rwNet } from './realworld.js';
import { geoSearch } from './geosearch.js';
import { parseLatLon } from './format.js';

const BASEMAP = 'https://sgx.geodatenzentrum.de/wms_basemapde?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=de_basemapde_web_raster_farbe&STYLES=&CRS=EPSG:25832&FORMAT=image/png';
const M = { hit: null, hits: [], q: '', view: null, sel: null, bm: null, bmWant: '', bmErr: false, bmTimer: 0, pts: new Map(), moved: 0, pinch: 0, onPick: null, onLayout: null, labels: null, txt: '' };
const el = id => document.getElementById(id);

// Mitte jedes Landes (größter Ring, Mittel der Punkte) für die Beschriftung
function landLabels() {
  if (M.labels || !deMap()) return M.labels || [];
  M.labels = deMap().lands.map(l => { const r = l.rings.reduce((a, b) => b.length > a.length ? b : a); return { name: l.name, E: r.reduce((s, p) => s + p[0], 0)/r.length*100, N: r.reduce((s, p) => s + p[1], 0)/r.length*100 }; });
  return M.labels;
}
function size() { const cv = el('mapCv'); return [cv.clientWidth || 300, cv.clientHeight || 200]; }

export function mapDraw() {
  const cv = el('mapCv'), [w, h] = size(), dpr = Math.min(2, devicePixelRatio || 1);
  if (!M.view) M.view = mapFitGermany(w, h);
  if (cv.width !== Math.round(w*dpr) || cv.height !== Math.round(h*dpr)) { cv.width = Math.round(w*dpr); cv.height = Math.round(h*dpr); }
  const c = cv.getContext('2d'), v = M.view, P = (E, N) => mapToScreen(v, w, h, E, N);
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = '#dde5e8'; c.fillRect(0, 0, w, h);
  if (M.bm) { const [x0, y0] = P(M.bm.box[0], M.bm.box[3]), [x1, y1] = P(M.bm.box[2], M.bm.box[1]); c.drawImage(M.bm.img, x0, y0, x1 - x0, y1 - y0); }
  // Länder: mit hinterlegter Quelle grün getönt, Grenzen dunkel
  // Am Anfang nur Grenzen; das Land des gewählten Punkts hell hervorgehoben und beschriftet (Wunsch Nutzer)
  const map = deMap(), srcLands = new Set(rwSources().map(s => s.land)), selLand = M.sel ? deLandAt(M.sel[0], M.sel[1]) : null;
  if (map) for (const l of map.lands) {
    c.beginPath();
    for (const r of l.rings) r.forEach(([x, y], i) => { const [sx, sy] = P(x*100, y*100); if (i) c.lineTo(sx, sy); else c.moveTo(sx, sy); });
    if (srcLands.has(l.name)) { c.fillStyle = M.bm ? 'rgba(40,150,80,0.10)' : 'rgba(40,150,80,0.22)'; c.fill('evenodd'); }
    else if (!M.bm) { c.fillStyle = 'rgba(255,255,255,0.55)'; c.fill('evenodd'); }
    if (l.name === selLand) { c.fillStyle = 'rgba(224,68,42,0.10)'; c.fill('evenodd'); }
    c.strokeStyle = l.name === selLand ? 'rgba(200,50,30,0.9)' : 'rgba(40,50,60,0.75)'; c.lineWidth = l.name === selLand ? 2 : 1; c.stroke();
  }
  c.font = '600 12px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const L = selLand && landLabels().find(x => x.name === selLand);
  if (L && v.s > 120) { const [x, y] = P(L.E, L.N); c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.9)'; c.strokeText(L.name, x, y); c.fillStyle = 'rgba(30,40,50,0.95)'; c.fillText(L.name, x, y); }
  // Eingebautes Gebiet (Monschau) und gewählter Punkt mit Ausschnitt 1 x 1 km
  const mark = (E, N, col, label, sq) => {
    const [x, y] = P(E, N), hs = Math.max(4, 500/v.s);
    c.strokeStyle = col; c.lineWidth = 2;
    if (sq) c.strokeRect(x - hs, y - hs, 2*hs, 2*hs);
    c.beginPath(); c.arc(x, y, 3.5, 0, 7); c.fillStyle = col; c.fill();
    if (label) { c.fillStyle = col; c.textAlign = 'left'; c.fillText(label, x + hs + 5, y); c.textAlign = 'center'; }
  };
  mark(304700, 5604000, '#2a6fb0', v.s < 400 ? 'Monschau (eingebaut)' : '', v.s < 60);
  if (M.sel) mark(M.sel[0], M.sel[1], '#e0442a', '', true);
  // Maßstab unten links
  const nice = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000], m = nice.find(d => d/v.s > 60) || 200000;
  c.fillStyle = 'rgba(255,255,255,0.8)'; c.fillRect(6, h - 22, m/v.s + 50, 16);
  c.strokeStyle = '#223'; c.lineWidth = 2; c.beginPath(); c.moveTo(10, h - 10); c.lineTo(10 + m/v.s, h - 10); c.stroke();
  c.fillStyle = '#223'; c.textAlign = 'left'; c.fillText(m >= 1000 ? m/1000 + ' km' : m + ' m', 14 + m/v.s, h - 14);
  wantBasemap(w, h, dpr);
}
// Hintergrundkarte für die aktuelle Ansicht anfordern (kurz nach der letzten Änderung). Bild ohne crossOrigin: nur zeichnen.
function wantBasemap(w, h, dpr) {
  const v = M.view, [E0, N1] = mapFromScreen(v, w, h, 0, 0), [E1, N0] = mapFromScreen(v, w, h, w, h);
  const box = [E0, N0, E1, N1].map(Math.round), key = box.join(',');
  if (key === M.bmWant) return;
  M.bmWant = key; clearTimeout(M.bmTimer);
  M.bmTimer = setTimeout(() => {
    const img = new Image(), W = Math.min(2048, Math.round(w*dpr)), H = Math.min(2048, Math.round(h*dpr));
    img.onload = () => { if (M.bmWant === key) { M.bm = { img, box }; M.bmErr = false; mapDraw(); info(); } };
    img.onerror = () => { if (M.bmWant === key) { M.bmErr = true; info(); } };
    img.src = `${BASEMAP}&BBOX=${box.join(',')}&WIDTH=${W}&HEIGHT=${H}`;
  }, 250);
}
function info() {
  const off = M.bmErr ? ' Hintergrundkarte nicht erreichbar, nur Grenzen.' : '';
  if (!M.sel) { el('mapInfo').textContent = 'Auf die Karte tippen, um den Mittelpunkt zu setzen. Grün: Quelle hinterlegt.' + off; el('mapOk').disabled = true; layout(); return; }
  const [lat, lon] = fromUtm(M.sel[0], M.sel[1]), land = deLandAt(M.sel[0], M.sel[1]), plan = rwPlan(lat, lon);
  el('mapInfo').textContent = (M.hit ? M.hit.name + (M.hits.length > 1 ? ' (' + (M.hits.indexOf(M.hit) + 1) + '/' + M.hits.length + ', Enter: nächster)' : '') + ' · ' : '') + lat.toFixed(5) + ', ' + lon.toFixed(5) + ' · ' + (land || 'außerhalb Deutschlands') + ' · '
    + (plan ? 'Quelle: ' + plan.srcs.map(x => x.name).join(' + ') + (plan.skipped.length ? ' (ohne ' + plan.skipped.map(x => x.name).join(', ') + ': anderes Koordinatensystem)' : '')
      : 'keine Quelle hinterlegt, unter „Quellen“ eintragen') + '.' + off;
  el('mapOk').disabled = !plan;
  layout();
}
// Text unter der Karte geändert: Menü neu einpassen (die Größe hängt von der Zahl der Zeilen ab), danach neu zeichnen
function layout() {
  const t = el('mapInfo').textContent;
  if (t === M.txt || !M.onLayout) return;
  M.txt = t; M.onLayout(); mapDraw();
}
// Öffnen: am zuletzt gewählten Ort (nah) oder ganz Deutschland
export function mapOpen() {
  const ll = parseLatLon(cfg.rwLL), [w, h] = size();
  M.txt = '';
  if (ll) { const [E, N] = toUtm(ll[0], ll[1]); M.sel = [E, N]; M.view = mapClamp({ E, N, s: 8 }); }
  else { M.sel = null; M.view = mapFitGermany(w, h); }
  requestAnimationFrame(() => { if (!ll) M.view = mapFitGermany(...size()); mapDraw(); info(); });
}
export function mapInit(onPick, onLayout) {
  M.onPick = onPick; M.onLayout = onLayout;
  const cv = el('mapCv'), at = e => { const r = cv.getBoundingClientRect(), [w] = size(); const k = w/r.width; return [(e.clientX - r.left)*k, (e.clientY - r.top)*k]; };
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); M.pts.set(e.pointerId, at(e)); M.moved = 0; M.pinch = 0; });
  cv.addEventListener('pointermove', e => {
    if (!M.pts.has(e.pointerId)) return;
    const p = at(e), q = M.pts.get(e.pointerId), [w, h] = size();
    if (M.pts.size === 1) {   // verschieben
      M.moved += Math.hypot(p[0] - q[0], p[1] - q[1]);
      M.view = mapClamp({ E: M.view.E - (p[0] - q[0])*M.view.s, N: M.view.N + (p[1] - q[1])*M.view.s, s: M.view.s });
    } else if (M.pts.size === 2) {   // zwei Finger: zoomen um die Mitte
      const o = [...M.pts.entries()].find(([id]) => id !== e.pointerId)[1], d0 = Math.hypot(q[0] - o[0], q[1] - o[1]), d1 = Math.hypot(p[0] - o[0], p[1] - o[1]);
      if (d0 > 0 && d1 > 0) M.view = mapZoom(M.view, w, h, (p[0] + o[0])/2, (p[1] + o[1])/2, d0/d1);
      M.moved = 99; M.pinch = 1;
    }
    M.pts.set(e.pointerId, p); mapDraw();
  });
  // Suche (Nominatim): Treffer anspringen und als Punkt setzen; dieselbe Suche noch einmal: nächster Treffer
  el('mapFind').addEventListener('submit', async e => {
    e.preventDefault();
    const q = el('mapQ').value.trim(); if (!q) return;
    if (q === M.q && M.hits.length > 1) { M.hit = M.hits[(M.hits.indexOf(M.hit) + 1) % M.hits.length]; }
    else {
      el('mapInfo').textContent = 'Suche „' + q + '“ …'; el('mapGo').disabled = true;
      try { M.hits = await geoSearch(q, rwNet(null, 15000)); }
      catch (err) { M.hits = []; el('mapInfo').textContent = 'Suche nicht erreichbar: ' + String(err && err.message || err).slice(0, 80); layout(); return; }
      finally { el('mapGo').disabled = false; }
      M.q = q; M.hit = M.hits[0] || null;
      if (!M.hit) { el('mapInfo').textContent = 'Nichts gefunden für „' + q + '“. Anders schreiben, zum Beispiel mit Ort oder Postleitzahl.'; layout(); return; }
    }
    const [E, N] = toUtm(M.hit.lat, M.hit.lon); M.sel = [E, N]; M.view = mapClamp({ E, N, s: 4 }); mapDraw(); info();
  });
  el('mapQ').addEventListener('keydown', e => e.stopPropagation());   // Tippen steuert nicht die Drohne
  const up = e => {
    if (!M.pts.has(e.pointerId)) return;
    const p = at(e), [w, h] = size();
    M.pts.delete(e.pointerId);
    if (M.moved < 6 && !M.pinch && e.type === 'pointerup') { M.sel = mapFromScreen(M.view, w, h, p[0], p[1]); M.hit = null; mapDraw(); info(); }   // eigener Punkt: kein Suchtreffer mehr
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); const p = at(e), [w, h] = size(); M.view = mapZoom(M.view, w, h, p[0], p[1], Math.pow(1.25, e.deltaY/100)); mapDraw(); }, { passive: false });
  const zoomBtn = f => { const [w, h] = size(); M.view = mapZoom(M.view, w, h, w/2, h/2, f); mapDraw(); };
  el('mapIn').addEventListener('click', () => zoomBtn(0.5));
  el('mapOut').addEventListener('click', () => zoomBtn(2));
  el('mapAll').addEventListener('click', () => { M.view = mapFitGermany(...size()); mapDraw(); });
  el('mapOk').addEventListener('click', () => { if (!M.sel) return; const [lat, lon] = fromUtm(M.sel[0], M.sel[1]); M.onPick(lat, lon); });
  addEventListener('resize', () => { if (!el('mapCv').closest('section').hidden) mapDraw(); });
}
// Für Browser-Tests: Bildschirmpunkt (Seite) eines Kartenpunkts in der aktuellen Ansicht
export function mapPagePos(E, N) {
  const cv = el('mapCv'), r = cv.getBoundingClientRect(), [w, h] = size(), [x, y] = mapToScreen(M.view, w, h, E, N);
  return [r.left + x*r.width/w, r.top + y*r.height/h];
}
