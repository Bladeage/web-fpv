/* Verbund mit VBS (DIS-Modus; Konzept docs/dis-drohne.md). Ohne DOM: nutzt nur WebSocket (Browser und Node 22).
   Gegenstück ist eine schlanke Brücke auf dem VBS-Rechner, die DIS-PDUs nur durchreicht: bruecke/fpv-vbs-bruecke.cmd
   (Windows, PowerShell, Download im DIS-Modus) oder tools/dis-bruecke.mjs (Node, Entwicklung und Tests).
   Der Simulator rechnet alles selbst:
   - Senden: eigene Drohne als DIS-6-Entity-State (src/dis.js), nach der Senderegel (1 m, 3°, Zustand, 5 s Herzschlag).
   - Empfangen: Entity State von VBS (Art, Seite) und das Lagebild (Ort, Tempo, Lage; VBS-Modul „lagebild“ von k5.2,
     weil das Gateway von VBS 26.1.3 Ort und Bewegung eingefroren sendet), verbunden über die Entity-Nummer.
     Umrechnung in Kartenkoordinaten (UTM-Gitter, Meridiankonvergenz), zwischen den Meldungen weitergeschoben;
     Boden, Wasser und Personen auf unserem Boden, Luftfahrzeuge mit ihrer Höhe, nie unter dem Boden.
   - Nur in der echten Welt (die Spielkarte hat keine Erdkoordinaten). Getrennt: alle 5 s neuer Versuch.
   Werte aus SISO-REF-010 über dis.js und distypes.js. Reprinted with permission from SISO Inc.
   Klassennamen aus dem Lagebild sind Herstellerinhalt: nur im Speicher, nie gespeichert. */
import { DIS_FPV, disEncodeES, disDecode, disFromSim, disState, disNeedSend, disTimestamp, disFromEcef, disEulerToHpr, disEcefToNed, disAppearanceRead, disConvergence } from './dis.js';
import { disBaseInfo, disBaseOf } from './distypes.js';
import { toUtm } from './geo.js';
import { rw, rwLatLon, groundH } from './realworld.js';

// undulation: Quasigeoidhöhe für die Höhe über dem Ellipsoid (Schätzung Monschau 47 m; NRW 42,5 bis 48,5 m)
export const VB = { url: 'ws://localhost:8642', retry: 5, maxUnits: 50, range: 5000, timeout: 13, undulation: 47, exercise: 1, entity: 1, everyUnits: 0.2 };
export const vb = { ws: null, state: 'aus', err: '', units: [], dis: new Map(), lb: null, last: null, tTry: -1e9, tUnits: 0, tBuild: -1e9, sent: 0, info: null, probe: 'unbekannt', now: 0 };
// Die Windows-Brücke, eingebettet vom Build (Datei bruecke/fpv-vbs-bruecke.cmd), für den Download im DIS-Modus
export const VB_BRUECKE = '%%BRUECKE_CMD%%';

const vbZone = () => +((rw.meta && rw.meta.crs.match(/258(\d\d)/)) || [0, 32])[1];
// Seite in VBS -> Force ID (Vorgabe: WEST Freund, EAST Feind, Unabhängige neutral, Zivil sonstige)
export const VB_SIDE = { WEST: 1, EAST: 2, GUER: 3, RESISTANCE: 3, INDEPENDENT: 3, CIV: 0, CIVILIAN: 0 };

// ---- Lagebild (VBS-Modul „lagebild“): je Zeile ein JSON-Feld ----
// ["KOPF", 1, Spielzeit, Takt, Mission, Anzahl]
// ["E", Gateway-ID, Klasse, Seite, [x,y,z] ASL, [X,Y,Z] ECEF, [vx,vy,vz] m/s, vectorDir, vectorUp, lebt, Schaden, Besatzung]
export function vbParseLagebild(text) {
  const out = { head: null, units: [] };
  for (const line of String(text).split(/\r?\n/)) {
    const s = line.trim();
    if (!s.startsWith('[')) continue;
    let a; try { a = JSON.parse(s); } catch (e) { continue; }
    if (a[0] === 'KOPF') out.head = { version: a[1], time: a[2], step: a[3], mission: a[4], count: a[5] };
    else if (a[0] === 'E' && Array.isArray(a[5]) && a[5].length === 3) out.units.push({ id: a[1], side: a[3], asl: a[4], ecef: a[5], vel: a[6], dir: a[7], up: a[8], alive: a[9] !== false, damage: +a[10] || 0 });
  }
  return out;
}
// DIS (Art, Seite) und Lagebild (Ort, Bewegung) über die Entity-Nummer verbinden -> Einheiten in Erdkoordinaten:
// [{ id, base, force, lat, lon, h (über NHN), hdg, pitch, roll, vn (Nord, Ost, oben), dead, src }]
export function vbUnitsGeo(dis, lb, o = {}) {
  const N = o.undulation ?? VB.undulation, table = o.table || null, out = [], byEnt = new Map(), used = new Set();
  for (const e of dis.values()) byEnt.set(e.entity, e);
  for (const u of (lb && lb.units) || []) {
    const e = u.id ? byEnt.get(u.id) : null;
    if (e) used.add(e);
    const [lat, lon, he] = disFromEcef(...u.ecef);
    // Lage aus vectorDir (vorn) und vectorUp (oben), VBS-Achsen x Osten, y Norden, z oben; rechts = vorn x oben
    const d = u.dir || [0, 1, 0], up = u.up || [0, 0, 1], r = [d[1]*up[2] - d[2]*up[1], d[2]*up[0] - d[0]*up[2], d[0]*up[1] - d[1]*up[0]];
    out.push({ id: 'lb' + (u.id || ''), base: e ? disBaseOf(e.type, table) : 'other', force: e ? e.force : (VB_SIDE[String(u.side).toUpperCase()] ?? 0),
      lat, lon, h: Array.isArray(u.asl) ? u.asl[2] : he - N, hdg: Math.atan2(d[0], d[1]), pitch: Math.asin(Math.max(-1, Math.min(1, d[2]))), roll: Math.atan2(-r[2], up[2]),
      vn: [u.vel ? u.vel[1] : 0, u.vel ? u.vel[0] : 0, u.vel ? u.vel[2] : 0], dead: !u.alive || (e ? disAppearanceRead(e.appearance).damage === 3 : false), src: e ? 'beide' : 'lagebild' });
  }
  for (const e of dis.values()) {
    if (used.has(e)) continue;
    const [lat, lon, he] = disFromEcef(...e.pos), [hdg, pitch, roll] = disEulerToHpr(lat, lon, ...e.ori), v = disEcefToNed(lat, lon, e.vel);
    out.push({ id: e.site + ':' + e.app + ':' + e.entity, base: disBaseOf(e.type, table), force: e.force, lat, lon, h: he - N, hdg, pitch, roll, vn: [v[0], v[1], -v[2]],
      dead: disAppearanceRead(e.appearance).damage === 3, src: 'dis' });
  }
  return out;
}

// ---- Eigene Drohne ----
// Felder für die Entity State PDU aus dem Simulator (s: p, v, q, w; st: 'fly' | 'crashed' | 'frozen' | 'off')
export function vbOwnFields(s, st = 'fly') {
  const [lat, lon] = rwLatLon(s.p[0], s.p[2]), f = disFromSim(s, { lat, lon, zone: vbZone(), hNhn: rw.meta.hHome + s.p[1], undulation: VB.undulation }), x = disState(st);
  return { ...f, appearance: x.appearance, dra: x.dra };
}
export const vbOwnPdu = (cur, t) => disEncodeES({ ...DIS_FPV, ...cur, exercise: VB.exercise, entity: VB.entity, timestamp: disTimestamp(t*1000) });

// ---- Einheiten in Kartenkoordinaten ----
export function vbLocal(u) {
  const z = vbZone(), b = rw.meta.bbox, [E, N] = toUtm(u.lat, u.lon, z), g = disConvergence(u.lat, u.lon, z), cg = Math.cos(g), sg = Math.sin(g);
  const vn = u.vn || [0, 0, 0], ng = vn[0]*cg + vn[1]*sg, eg = -vn[0]*sg + vn[1]*cg;   // geografisch -> Gitter
  return { id: u.id, base: u.base, force: u.force, dead: !!u.dead, air: disBaseInfo(u.base).dom === 2, x: E - (b[0] + b[2])/2, z: (b[1] + b[3])/2 - N, y: u.h - rw.meta.hHome,
    yaw: -((u.hdg || 0) - g), pitch: u.pitch || 0, roll: u.roll || 0, v: [eg, vn[2], -ng] };
}
export function vbTake(list, me = [0, 0, 0]) {
  const d = u => Math.hypot(u.x - me[0], u.z - me[2]), L = (list || []).map(vbLocal).filter(u => d(u) <= VB.range);
  L.sort((a, b) => d(a) - d(b));
  return L.slice(0, VB.maxUnits).map(u => ({ ...u, x0: u.x, y0: u.y, z0: u.z }));
}
export function vbPlace(u, dt) {
  u.x = u.x0 + u.v[0]*dt; u.z = u.z0 + u.v[2]*dt;
  const g = groundH(u.x, u.z);
  u.y = u.air ? Math.max(g, u.y0 + u.v[1]*dt) : g;
  return u;
}

// ---- Verbindung (jeden Frame aus der Hauptschleife, auch in der Pause) ----
function vbMessage(e) {
  if (typeof e.data === 'string') {
    let m; try { m = JSON.parse(e.data); } catch (x) { return; }
    if (m.t === 'info') vb.info = m;
    if (m.t === 'lagebild') vb.lb = vbParseLagebild(m.text);
    return;
  }
  const d = disDecode(new Uint8Array(e.data));
  if (!d || d.pduType !== 1 || d.exercise !== VB.exercise) return;
  if (d.site === DIS_FPV.site && d.app === DIS_FPV.app) return;   // eigene Pakete (Broadcast kommt zurück)
  vb.dis.set(d.site + ':' + d.app + ':' + d.entity, { ...d, t: vb.now });
}
export function vbStep(t, s, st, enabled) {
  vb.now = t;
  const want = enabled && rw.on && !!rw.meta && typeof WebSocket !== 'undefined';
  if (!want) { if (vb.ws) vbClose(); vb.state = enabled ? 'nur echte Welt' : 'aus'; return; }
  if (!vb.ws && t - vb.tTry >= VB.retry) {
    vb.tTry = t; vb.state = 'verbinde';
    try {
      const ws = new WebSocket(VB.url);
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => { vb.state = 'verbunden'; vb.err = ''; vb.last = null; };
      ws.onmessage = vbMessage;
      ws.onclose = () => { if (vb.ws === ws) { vb.ws = null; vb.units = []; vb.dis.clear(); vb.lb = null; vb.state = 'getrennt'; } };
      ws.onerror = () => { vb.err = 'Brücke nicht erreichbar'; };
      vb.ws = ws;
    } catch (e) { vb.err = String(e.message || e); vb.ws = null; }
  }
  if (vb.ws && vb.ws.readyState === 1) {
    const cur = vbOwnFields(s, st);
    if (disNeedSend(vb.last, cur, t)) { try { vb.ws.send(vbOwnPdu(cur, t)); vb.last = { ...cur, tSent: t }; vb.sent++; } catch (e) {} }
  }
  if (t - vb.tBuild >= VB.everyUnits) {   // 5-mal je Sekunde neu aufbauen
    vb.tBuild = t;
    for (const [k, e] of vb.dis) if (t - e.t > VB.timeout) vb.dis.delete(k);
    vb.units = vbTake(vbUnitsGeo(vb.dis, vb.lb), s.p).map(u => vbPlace(u, 0)); vb.tUnits = t;
  }
  for (const u of vb.units) vbPlace(u, t - vb.tUnits);
}
export function vbClose() { const ws = vb.ws; vb.ws = null; vb.units = []; vb.dis.clear(); vb.lb = null; if (ws) try { ws.close(); } catch (e) {} }
// Läuft die Brücke? (für den DIS-Modus im Menü; erkennt nur „läuft“, nicht „installiert“). cb('läuft' | 'nicht gefunden')
export function vbProbe(cb) {
  if (vb.ws && vb.ws.readyState === 1) { vb.probe = 'läuft'; cb(vb.probe); return; }
  if (typeof WebSocket === 'undefined') { cb('nicht gefunden'); return; }
  let done = false, ws = null;
  const fin = r => { if (done) return; done = true; vb.probe = r; try { ws.close(); } catch (e) {} cb(r); };
  try { ws = new WebSocket(VB.url); } catch (e) { fin('nicht gefunden'); return; }
  ws.onmessage = e => { if (typeof e.data === 'string' && e.data.includes('fpv-vbs-bruecke')) fin('läuft'); };
  ws.onerror = () => fin('nicht gefunden');
  ws.onclose = () => fin('nicht gefunden');
  setTimeout(() => fin('nicht gefunden'), 2500);
}
export function vbLabel(enabled) { return !enabled || !rw.on ? '' : vb.state === 'verbunden' ? 'VBS ' + vb.units.length : 'VBS --'; }
