/* DIS-Modus: Verbund mit einem DIS-Partner (IEEE 1278.1, DIS 6; Konzept docs/dis-drohne.md). Ohne DOM: nutzt nur
   WebSocket (Browser und Node 22). Gegenstück ist eine schlanke Brücke auf diesem Rechner, die DIS-PDUs nur durchreicht:
   bruecke/fpv-dis-bruecke.cmd (Windows, PowerShell, Download im DIS-Modus) oder tools/dis-bruecke.mjs (Node, Entwicklung
   und Tests). Der Simulator rechnet alles selbst:
   - Senden: eigene Drohne als DIS-6-Entity-State (src/dis.js), nach der Senderegel (1 m, 3°, Zustand, 5 s Herzschlag).
   - Empfangen: Entity State der Übung (Art, Seite, Ort, Lage, Tempo). Umrechnung in Kartenkoordinaten (UTM-Gitter,
     Meridiankonvergenz), ab dem Empfang mit dem gemeldeten Tempo weitergeschoben (Dead Reckoning, linear);
     Boden, Wasser und Personen auf unserem Boden, Luftfahrzeuge mit ihrer Höhe, nie unter dem Boden.
   - Ort der Übung (vbCenter): Mitte der empfangenen Einheiten, damit der Flug dort beginnen kann.
   - Getrennt: alle 3 s neuer Versuch. Hängt der Aufbau (Browser fragt nach dem lokalen Netz), meldet vbBridge „wartet“.
   Werte aus SISO-REF-010 über dis.js und distypes.js. Reprinted with permission from SISO Inc. */
import { DIS_FPV, disEncodeES, disDecode, disFromSim, disState, disNeedSend, disTimestamp, disFromEcef, disEulerToHpr, disEcefToNed, disAppearanceRead, disConvergence, disDeadReckon, disArticulation, DIS_PDU } from './dis.js';
import { qMul, qAxis, qRot } from './math.js';
import { disBaseInfo, disBaseOf, disBaseParts } from './distypes.js';
import { toUtm } from './geo.js';
import { rw, rwLatLon, groundH } from './realworld.js';

// undulation: Quasigeoidhöhe für die Höhe über dem Ellipsoid (Schätzung Monschau 47 m; NRW 42,5 bis 48,5 m). Für den Ort
// einer Übung ohne Kartendaten egal: Dort leitet sich unsere Bodenhöhe mit demselben Wert aus den Einheiten ab (rwFlat).
// port: DIS-Port der Brücke (Vorgabe 3000), exercise: Übungsnummer; beide im Menü einstellbar. keep: Einheiten ohne neue Meldung
// behalten, bis sie sich abmelden (Optionen; für Partner, die nur beim Anlegen senden, etwa das Gateway von VBS 26.1.3). Vorgabe: Löschen
// nach timeout (13 s, wie die DIS-Regel mit 5 s Herzschlag).
export const VB = { url: 'ws://localhost:8642', retry: 3, hang: 15, wait: 2, maxUnits: 50, range: 5000, timeout: 13, undulation: 47, exercise: 1, port: 3000, entity: 1, everyUnits: 0.2, keep: false };
export const vb = { ws: null, state: 'aus', err: '', units: [], dis: new Map(), last: null, tTry: -1e9, tUnits: 0, tBuild: -1e9, sent: 0, info: null, now: 0, seen: 'suche', fx: [], fired: new Map() };   // fx: Schüsse und Einschläge (Kartenkoordinaten), fired: Einheit -> Zeit des letzten Schusses   // seen: letztes Ergebnis für das Menü (bleibt während eines neuen Versuchs stehen)
// Die Windows-Brücke, eingebettet vom Build (Datei bruecke/fpv-dis-bruecke.cmd), für den Download im DIS-Modus
export const VB_BRUECKE = '%%BRUECKE_CMD%%';

const vbZone = () => +((rw.meta && rw.meta.crs.match(/258(\d\d)/)) || [0, 32])[1];
// Brauchbarer Ort im ECEF (manche Sender melden Platzhalter wie 0, 0, 0): Abstand zur Erdmitte 6,3 bis 6,5 Mio. m
const vbSane = p => { const r = Math.hypot(p[0], p[1], p[2]); return r > 6.3e6 && r < 6.5e6; };

// Platzhalter-Orte (D5 bis D7: das Gateway von VBS 26.1.3 meldet Personen aus dem Editor am Ankerpunkt ihrer Gruppe, alle auf
// demselben Punkt und mit falscher Höhe, etwa 320 m unter dem Gelände): Mehrere Einheiten auf demselben Punkt (Raster same in m)
// gelten alle als Platzhalter; Einheiten am Boden, die mehr als below unter dem Median der übrigen Bodeneinheiten liegen, auch.
// Annahme: Echte Einheiten stehen nie auf den Zentimeter gleich, und am Boden liegen in einer Übung keine 100 m Höhe dazwischen
// (Schätzung; ein Tal mit steilen Hängen kann mehr haben, dann bleibt die Einheit aber sichtbar, solange ihr Ort einzeln ist).
// Tempo-Grenze je Bereich (Schätzung: Bodenfahrzeuge, Schiffe und Personen unter 150 m/s, Luftfahrzeuge unter 1000 m/s, etwa
// Mach 3): schneller ist ein Fehler des Senders, etwa ein Objekt, das ohne Gelände endlos fällt (k5.2, 08.11.2026: 1800 m/s).
export const VB_PLACEHOLDER = { same: 0.5, below: 100, vGround: 150, vAir: 1000 };
// DIS-Einheiten in Erdkoordinaten: [{ id, base, force, lat, lon, h (über NHN), hdg, pitch, roll, vn (Nord, Ost, oben), dead, t }]
// t: Empfangszeit (ab da weitergeschoben). Vorhersage „statisch“ (1) oder eingefroren: kein Tempo. Die Liste trägt skipped:
// Zahl der übergangenen Platzhalter.
export function vbUnitsGeo(dis, o = {}) {
  const N = o.undulation ?? VB.undulation, table = o.table || null, out = [], P = VB_PLACEHOLDER;
  const key = e => e.pos.map(v => Math.round(v/P.same)).join(','), seen = new Map();
  for (const e of dis.values()) if (vbSane(e.pos)) seen.set(key(e), (seen.get(key(e)) || 0) + 1);
  let skipped = 0;
  for (const e of dis.values()) {
    if (!vbSane(e.pos)) continue;
    if (seen.get(key(e)) > 1) { skipped++; continue; }
    const ap = disAppearanceRead(e.appearance);
    if (ap.off) continue;   // abgemeldet (deaktiviert)
    // Nur Plattformen (1) und Lebewesen (3): Geschosse (2) melden sich kurz als eigene Einheit (k5.2, 08.11.2026), nicht zeigen
    if (e.type[0] !== 1 && e.type[0] !== 3) continue;
    const base = disBaseOf(e.type, table), vel = e.vel || [0, 0, 0];
    if (Math.hypot(...vel) > (disBaseInfo(base).dom === 2 ? P.vAir : P.vGround)) { skipped++; continue; }
    const [lat, lon, he] = disFromEcef(...e.pos), [hdg, pitch, roll] = disEulerToHpr(lat, lon, ...e.ori);
    const still = e.dra === 1 || ap.frozen, v = still ? [0, 0, 0] : disEcefToNed(lat, lon, vel);
    // e: die PDU selbst, für das Weiterrechnen nach ihrem Verfahren (vbPlace); mark: Name (Marking), damaged: beschädigt
    out.push({ id: e.site + ':' + e.app + ':' + e.entity, base, force: e.force, lat, lon, h: he - N, hdg, pitch, roll, vn: [v[0], v[1], -v[2]],
      dead: ap.damage === 3, damaged: ap.damage === 1 || ap.damage === 2, mark: (e.marking || '').trim(), t: e.t || 0, e: still ? null : e, az: e.art ? e.art.az : null, el: e.art ? e.art.el : null });
  }
  const ground = out.filter(u => disBaseInfo(u.base).dom !== 2), mh = vbMedian(ground.map(u => u.h));
  const L = ground.length >= 2 ? out.filter(u => disBaseInfo(u.base).dom === 2 || u.h >= mh - P.below) : out;
  L.skipped = skipped + out.length - L.length;
  return L;
}
const vbMedian = a => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k])/2; };
// Ort der Übung: Mitte (Median) der empfangenen Einheiten ohne Platzhalter; tNew: jüngste Meldung; Höhe aus den Einheiten am Boden (sonst allen). null ohne Einheiten.
export function vbCenter(dis = vb.dis, o = {}) {
  const L = vbUnitsGeo(dis, o);
  if (!L.length) return null;
  const ground = L.filter(u => disBaseInfo(u.base).dom !== 2);
  return { n: L.length, skipped: L.skipped, tNew: Math.max(...L.map(u => u.t)), lat: vbMedian(L.map(u => u.lat)), lon: vbMedian(L.map(u => u.lon)), h: vbMedian((ground.length ? ground : L).map(u => u.h)) };
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
  return { id: u.id, base: u.base, force: u.force, dead: !!u.dead, damaged: !!u.damaged, mark: u.mark || '', az: u.az ?? null, el: u.el ?? null, air: disBaseInfo(u.base).dom === 2, x: E - (b[0] + b[2])/2, z: (b[1] + b[3])/2 - N, y: u.h - rw.meta.hHome,
    yaw: -((u.hdg || 0) - g), pitch: u.pitch || 0, roll: u.roll || 0, v: [eg, vn[2], -ng], t0: u.t || 0, e: u.e || null };
}
export function vbTake(list, me = [0, 0, 0]) {
  const d = u => Math.hypot(u.x - me[0], u.z - me[2]), L = (list || []).map(vbLocal).filter(u => d(u) <= VB.range);
  L.sort((a, b) => d(a) - d(b));
  return L.slice(0, VB.maxUnits).map(u => ({ ...u, x0: u.x, y0: u.y, z0: u.z }));
}
// dt: Sekunden seit dem Empfang (höchstens bis zum Löschen). Mit PDU (u.e): Weiterrechnen nach ihrem Dead-Reckoning-Verfahren
// (dis.js: 2 Ort und Tempo, 3 dazu Drehung, 4 dazu Beschleunigung und Drehung, 5 Beschleunigung), also auch Kurven und Lage.
// Ohne PDU: geradeaus mit dem Tempo.
export function vbPlace(u, dt) {
  dt = Math.max(0, Math.min(VB.timeout, dt));
  if (u.e) {
    const r = disDeadReckon(u.e, dt), [lat, lon, he] = disFromEcef(...r.pos), [hdg, pitch, roll] = disEulerToHpr(lat, lon, ...r.ori);
    const L = vbLocal({ ...u, lat, lon, h: he - VB.undulation, hdg, pitch, roll });
    u.x = L.x; u.z = L.z; u.yaw = L.yaw; u.pitch = L.pitch; u.roll = L.roll;
    const g = groundH(u.x, u.z);
    u.y = u.air ? Math.max(g, L.y) : g;
    return u;
  }
  u.x = u.x0 + u.v[0]*dt; u.z = u.z0 + u.v[2]*dt;
  const g = groundH(u.x, u.z);
  u.y = u.air ? Math.max(g, u.y0 + u.v[1]*dt) : g;
  return u;
}

// Einstellungen aus dem Menü: Übung oder Port gewechselt -> alte Einheiten weg (sonst stünden sie bis zum Löschen noch da)
export function vbSet(o) {
  if (o.exercise != null && o.exercise !== VB.exercise) { VB.exercise = o.exercise; vb.dis.clear(); vb.units = []; }
  if (o.port != null && o.port !== VB.port) { VB.port = o.port; vb.dis.clear(); vb.units = []; vbConfig(); }
  if (o.keep != null) VB.keep = !!o.keep;
}
// ---- Verbindung (jeden Frame aus der Hauptschleife, auch in der Pause und im Menü) ----
// Port der Brücke anpassen, wenn er nicht passt (die Brücke meldet ihn in der Info)
export function vbConfig() {
  const ws = vb.ws;
  if (ws && ws.readyState === 1 && vb.info && vb.info.disPort !== VB.port) try { ws.send(JSON.stringify({ t: 'config', port: VB.port })); } catch (e) {}
}
function vbMessage(e) {
  if (typeof e.data === 'string') {
    let m; try { m = JSON.parse(e.data); } catch (x) { return; }
    if (m.t === 'info') { if (vb.info && vb.info.disPort !== m.disPort) vb.dis.clear(); vb.info = m; vb.seen = 'läuft'; vbConfig(); }
    return;
  }
  const d = disDecode(new Uint8Array(e.data));
  if (!d || d.exercise !== VB.exercise) return;
  if (d.pduType === DIS_PDU.fire || d.pduType === DIS_PDU.det) { vbShot(d); return; }
  if (d.pduType !== 1) return;
  if (d.site === DIS_FPV.site && d.app === DIS_FPV.app) return;   // eigene Pakete (Broadcast kommt zurück)
  // Turm und Rohr: aus dieser PDU, sonst die letzten bekannten Werte (nicht jede PDU muss sie tragen)
  const k = d.site + ':' + d.app + ':' + d.entity, old = vb.dis.get(k), a = disArticulation(d.params), oa = old && old.art;
  d.art = { az: a.az ?? (oa ? oa.az : null), el: a.el ?? (oa ? oa.el : null) };
  vb.dis.set(k, { ...d, t: vb.now });
}
// Schuss (Fire PDU) und Einschlag (Detonation PDU) als kurzer Effekt in Kartenkoordinaten. Der Schütze bekommt die Zeit des
// Schusses (Mündungsfeuer an seinem Rohr); ein Schuss zeigt außerdem eine Leuchtspur in Flugrichtung.
export const VB_FX = { keep: 2, flash: 0.15, tracer: 0.6, blast: 1.5 };
function vbShot(d) {
  if (!rw.on || !rw.meta || !vbSane(d.pos)) return;
  const [lat, lon, he] = disFromEcef(...d.pos), v = disEcefToNed(lat, lon, d.vel || [0, 0, 0]);
  const L = vbLocal({ id: 'fx', base: 'other', lat, lon, h: he - VB.undulation, vn: [v[0], v[1], -v[2]] });
  const kind = d.pduType === DIS_PDU.fire ? 'fire' : 'det', from = d.shooter.site + ':' + d.shooter.app + ':' + d.shooter.entity;
  vb.fx.push({ kind, x: L.x, y: L.y, z: L.z, v: L.v, t: vb.now, from });
  if (kind === 'fire') vb.fired.set(from, vb.now);
  if (vb.fx.length > 64) vb.fx.splice(0, vb.fx.length - 64);
}
// Richtung des Rohrs und Mündung in Kartenkoordinaten (Lage der Einheit, dann Turm um die Hochachse, dann Rohr um die
// Querachse; wie render.js). null ohne Rohr. Azimut nach rechts = Drehung um +Y mit negativem Winkel (vorn ist -Z).
const partsOf = new Map();
export function vbGun(u) {
  let p = partsOf.get(u.base);
  if (!p) { p = disBaseParts(u.base); partsOf.set(u.base, p); }
  if (!p.gp) return null;
  const q = qMul(qAxis([0, 1, 0], u.yaw), qMul(qAxis([1, 0, 0], u.pitch), qAxis([0, 0, 1], -u.roll))), qt = qMul(q, qAxis([0, 1, 0], -(u.az || 0))), qg = qMul(qt, qAxis([1, 0, 0], u.el || 0));
  const tp = p.tp || [0, 0, 0], gpRel = [p.gp[0] - tp[0], p.gp[1] - tp[1], p.gp[2] - tp[2]], o = qRot(q, tp), og = qRot(qt, gpRel), dir = qRot(qg, [0, 0, -1]);
  const base = [u.x + o[0] + og[0], u.y + o[1] + og[1], u.z + o[2] + og[2]];
  return { dir, muzzle: [base[0] + dir[0]*p.gl, base[1] + dir[1]*p.gl, base[2] + dir[2]*p.gl] };
}
// Zielt die Einheit auf uns? Rohr zeigt bis auf 3° auf den Punkt me (Schätzung: Streuung der Anzeige, nicht der Waffe)
export const VB_AIM = 3*Math.PI/180;
export function vbAims(u, me) {
  const g = vbGun(u);
  if (!g) return false;
  const d = [me[0] - g.muzzle[0], me[1] - g.muzzle[1], me[2] - g.muzzle[2]], n = Math.hypot(...d) || 1;
  return Math.acos(Math.max(-1, Math.min(1, (d[0]*g.dir[0] + d[1]*g.dir[1] + d[2]*g.dir[2])/n))) < VB_AIM;
}
// link: Verbindung halten (DIS-Modus gewählt); send: eigene Drohne senden (Flug in der echten Welt läuft)
export function vbStep(t, s, st, link, send = link) {
  vb.now = t;
  if (!link || typeof WebSocket === 'undefined') { if (vb.ws) vbClose(); vb.state = 'aus'; return; }
  if (vb.ws && vb.ws.readyState === 0 && t - vb.tTry > VB.hang) vbClose();   // hängt zu lange: neu versuchen
  if (!vb.ws && t - vb.tTry >= VB.retry) {
    vb.tTry = t; vb.state = 'verbinde';
    try {
      const ws = new WebSocket(VB.url);
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => { if (vb.ws === ws) { vb.state = 'verbunden'; vb.err = ''; vb.last = null; } };
      ws.onmessage = vbMessage;
      ws.onclose = () => { if (vb.ws === ws) { vb.ws = null; vb.units = []; vb.dis.clear(); vb.info = null; vb.state = 'getrennt'; vb.seen = 'nicht gefunden'; } };
      ws.onerror = () => { vb.err = 'Brücke nicht erreichbar'; };
      vb.ws = ws;
    } catch (e) { vb.err = String(e.message || e); vb.ws = null; }
  }
  const live = rw.on && !!rw.meta;
  if (send && live && vb.ws && vb.ws.readyState === 1) {
    const cur = vbOwnFields(s, st);
    if (disNeedSend(vb.last, cur, t)) { try { vb.ws.send(vbOwnPdu(cur, t)); vb.last = { ...cur, tSent: t }; vb.sent++; } catch (e) {} }
  }
  if (t - vb.tBuild >= VB.everyUnits) {   // 5-mal je Sekunde neu aufbauen
    vb.tBuild = t;
    if (!VB.keep) for (const [k, e] of vb.dis) if (t - e.t > VB.timeout) vb.dis.delete(k);
    vb.units = live ? vbTake(vbUnitsGeo(vb.dis), s.p) : [];
  }
  for (const u of vb.units) { vbPlace(u, t - u.t0); u.fireT = vb.fired.get(u.id) ?? -1e9; u.aims = !u.dead && vbAims(u, s.p); }
  while (vb.fx.length && t - vb.fx[0].t > VB_FX.keep) vb.fx.shift();
}
export function vbClose() { const ws = vb.ws; vb.ws = null; vb.units = []; vb.dis.clear(); vb.info = null; vb.fx = []; vb.fired.clear(); if (ws) try { ws.close(); } catch (e) {} }
// Zustand der Brücke für das Menü: 'läuft' | 'wartet' (Aufbau hängt, etwa Frage nach dem lokalen Netz) | 'nicht gefunden' | 'suche'.
// Ein Browser sieht nur, ob die Brücke läuft, nicht ob sie installiert ist.
export function vbBridge() {
  const ws = vb.ws;
  if (ws && ws.readyState === 1 && vb.info) return 'läuft';
  if (ws && ws.readyState <= 1 && vb.now - vb.tTry > VB.wait) return 'wartet';
  return vb.seen === 'läuft' && !ws ? 'nicht gefunden' : vb.seen;   // neuer Versuch: bisheriges Ergebnis stehen lassen (kein Flackern)
}
export function vbLabel(enabled) { return !enabled || !rw.on ? '' : vb.state === 'verbunden' ? 'DIS ' + vb.units.length : 'DIS --'; }
