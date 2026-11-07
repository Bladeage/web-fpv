/* Verbund mit VBS (Etappe D3, Konzept docs/dis-drohne.md). Ohne DOM: nutzt nur WebSocket (gibt es im Browser und in
   Node 22) und rechnet Koordinaten. Gegenstück: die Brücke tools/dis-bruecke.mjs auf dem VBS-Rechner.
   - Nur in der echten Welt (die Spielkarte hat keine Erdkoordinaten). Schalter cfg.verbund (Vorgabe aus).
   - Senden: etwa 20-mal je Sekunde der eigene Zustand (Breite, Länge, Höhe über NHN, Lage, Tempo, Drehraten, Zustand).
     Die Brücke entscheidet, wann eine DIS-PDU hinausgeht, und hält den Herzschlag.
   - Empfangen: VBS-Einheiten 5-mal je Sekunde als Liste. Umrechnung in Kartenkoordinaten (UTM-Gitter, Meridiankonvergenz),
     zwischen den Meldungen mit ihrem Tempo weitergeschoben. Boden, Wasser und Personen stehen auf unserem Boden (das
     VBS-Gelände ist ein anderes), Luftfahrzeuge mit ihrer Höhe, aber nicht unter dem Boden.
   - Getrennt: alle 5 s neuer Versuch. */
import { disConvergence } from './dis.js';
import { disBaseInfo } from './distypes.js';
import { toUtm } from './geo.js';
import { rw, rwLatLon, groundH } from './realworld.js';

export const VB = { url: 'ws://127.0.0.1:8642', sendHz: 20, retry: 5, maxUnits: 50, range: 5000 };
export const vb = { on: false, ws: null, state: 'aus', units: [], tUnits: 0, tSend: 0, tTry: -1e9, sent: 0, err: '' };

const vbZone = () => +((rw.meta && rw.meta.crs.match(/258(\d\d)/)) || [0, 32])[1];
// Eigener Zustand als Nachricht an die Brücke. s: Simulator (p, v, q, w), st: 'fly' | 'crashed' | 'frozen'
export function vbOwn(s, st = 'fly') {
  const [lat, lon] = rwLatLon(s.p[0], s.p[2]);
  return { t: 'own', lat, lon, h: rw.meta.hHome + s.p[1], zone: vbZone(), q: s.q, v: s.v, w: s.w, state: st };
}
// Einheit der Brücke (Breite, Länge, Höhe über NHN, Kurs/Nicken/Rollen geografisch, Tempo Nord/Ost/oben) -> Karte
export function vbLocal(u) {
  const z = vbZone(), b = rw.meta.bbox, [E, N] = toUtm(u.lat, u.lon, z), g = disConvergence(u.lat, u.lon, z), cg = Math.cos(g), sg = Math.sin(g);
  const x = E - (b[0] + b[2])/2, zz = (b[1] + b[3])/2 - N, vn = u.vn || [0, 0, 0];
  const ng = vn[0]*cg + vn[1]*sg, eg = -vn[0]*sg + vn[1]*cg;   // geografisch -> Gitter (um die Konvergenz zurückgedreht)
  const info = disBaseInfo(u.base), air = info.dom === 2;
  return { id: u.id, base: u.base, force: u.force, dead: !!u.dead, air, x, z: zz, y: u.h - rw.meta.hHome, yaw: -((u.hdg || 0) - g), pitch: u.pitch || 0, roll: u.roll || 0, v: [eg, vn[2], -ng] };
}
// Liste der Brücke übernehmen: umrechnen, nur im Umkreis, die nächsten maxUnits
export function vbTake(list, me = [0, 0, 0]) {
  const L = (list || []).map(vbLocal).filter(u => Math.hypot(u.x - me[0], u.z - me[2]) <= VB.range);
  L.sort((a, b) => Math.hypot(a.x - me[0], a.z - me[2]) - Math.hypot(b.x - me[0], b.z - me[2]));
  return L.slice(0, VB.maxUnits).map(u => ({ ...u, x0: u.x, y0: u.y, z0: u.z }));
}
// Zwischen den Meldungen weiterschieben (dt seit der Meldung) und auf den Boden stellen
export function vbPlace(u, dt) {
  u.x = u.x0 + u.v[0]*dt; u.z = u.z0 + u.v[2]*dt;
  const g = groundH(u.x, u.z);
  u.y = u.air ? Math.max(g, u.y0 + u.v[1]*dt) : g;
  return u;
}

// Verbindung halten und senden; jeden Frame aus der Hauptschleife. t: Zeit in s, s: Simulator, st: Zustand der Drohne
export function vbStep(t, s, st, enabled) {
  const want = enabled && rw.on && !!rw.meta && typeof WebSocket !== 'undefined';
  if (!want) { if (vb.ws) vbClose(); vb.state = enabled ? 'nur echte Welt' : 'aus'; return; }
  if (!vb.ws && t - vb.tTry >= VB.retry) {
    vb.tTry = t; vb.state = 'verbinde';
    try {
      const ws = new WebSocket(VB.url);
      ws.onopen = () => { vb.state = 'verbunden'; vb.err = ''; };
      ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } if (m.t === 'units' && rw.on && rw.meta) { vb.units = vbTake(m.units, s.p).map(u => vbPlace(u, 0)); vb.tUnits = vb.now || 0; } };   // gleich auf den Boden, nicht erst im nächsten Bild
      ws.onclose = () => { if (vb.ws === ws) { vb.ws = null; vb.units = []; vb.state = 'getrennt'; } };
      ws.onerror = () => { vb.err = 'Brücke nicht erreichbar (' + VB.url + ')'; };
      vb.ws = ws;
    } catch (e) { vb.err = String(e.message || e); vb.ws = null; }
  }
  vb.now = t;
  if (vb.ws && vb.ws.readyState === 1 && t - vb.tSend >= 1/VB.sendHz) {
    vb.tSend = t;
    try { vb.ws.send(JSON.stringify(vbOwn(s, st))); vb.sent++; } catch (e) {}
  }
  for (const u of vb.units) vbPlace(u, t - vb.tUnits);
}
export function vbClose() { const ws = vb.ws; vb.ws = null; vb.units = []; if (ws) try { ws.close(); } catch (e) {} }
// Kurzanzeige für das OSD: „VBS 3“ verbunden mit 3 Einheiten, „VBS --“ nicht verbunden; leer, wenn aus
export function vbLabel(enabled) { return !enabled || !rw.on ? '' : vb.state === 'verbunden' ? 'VBS ' + vb.units.length : 'VBS --'; }
