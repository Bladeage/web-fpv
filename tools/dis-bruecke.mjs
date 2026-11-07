// DIS-Brücke (Etappe D2, Konzept docs/dis-drohne.md). Node, nur Bordmittel. Läuft auf dem Rechner mit VBS.
//
//   Simulator (Browser) --WebSocket 127.0.0.1--> Brücke --DIS 6, UDP Broadcast :3000--> VBS Gateway
//                       <--Einheiten (JSON)----        <--DIS Entity State-----------
//                                                      <--Datei lagebild.txt (VBS-Modul „lagebild“ von k5.2)
//
// Aufruf: node tools/dis-bruecke.mjs [--lagebild <Datei>] [--tabelle <Datei>] [--ws 8642] [--dis-port 3000]
//         [--dis-ziel 255.255.255.255] [--uebung 1] [--site 1] [--app 200] [--quasigeoid 47]
//
// - Unsere Drohne: Der Browser schickt etwa 20-mal je Sekunde seinen Zustand (Breite, Länge, Höhe über NHN, Lage,
//   Tempo, Drehraten, Zustand). Die Brücke rechnet in DIS um (src/dis.js) und sendet nach der Senderegel (1 m, 3°,
//   Zustand geändert), spätestens alle 5 s; auch wenn der Browser pausiert, damit VBS sie nicht nach 13 s löscht.
//   Trennt sich der Browser, meldet sie die Drohne einmal als „deaktiviert“.
// - VBS-Einheiten: Art und Seite aus DIS, Ort und Bewegung aus dem Lagebild (das Gateway von VBS 26.1.3 sendet Ort und
//   Bewegung eingefroren, siehe Konzept). Verbunden über die Entity-Nummer. Ohne Lagebild gilt der Ort aus DIS.
//   Einheiten ohne Meldung nach 13 s entfernt (wie das Gateway).
// - Klassennamen aus dem Lagebild sind Herstellerinhalt: nur im Speicher, nie in eine Datei oder ins Protokoll.
// - Werte aus SISO-REF-010 über src/dis.js und src/distypes.js. Reprinted with permission from SISO Inc.
import { createServer } from 'node:http';
import { createSocket } from 'node:dgram';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DIS_FPV, DIS_SEND, disEncodeES, disDecode, disFromSim, disState, disNeedSend, disTimestamp, disFromEcef, disEulerToHpr, disEcefToNed, disAppearanceRead } from '../src/dis.js';
import { disBaseOf, disBaseTable } from '../src/distypes.js';

// ---- WebSocket nach RFC 6455 (nur was der Browser braucht: Text, Ping, Schließen) ----
export function wsAccept(key) { return createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64'); }
export function wsFrame(text, op = 1) {
  const p = Buffer.from(text), n = p.length, h = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
  if (n >= 126 && n < 65536) { h[0] = 0x80 | op; h[1] = 126; h.writeUInt16BE(n, 2); }
  if (n >= 65536) { h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
  return Buffer.concat([h, p]);
}
// Rahmen aus dem Puffer lesen; liefert { frames: [{ op, data }], rest } (unvollständige Rahmen bleiben im Rest)
export function wsParse(buf) {
  const frames = [];
  let o = 0;
  for (;;) {
    if (buf.length - o < 2) break;
    const op = buf[o] & 15, masked = buf[o + 1] & 128;
    let n = buf[o + 1] & 127, p = o + 2;
    if (n === 126) { if (buf.length - o < 4) break; n = buf.readUInt16BE(o + 2); p = o + 4; }
    else if (n === 127) { if (buf.length - o < 10) break; n = Number(buf.readBigUInt64BE(o + 2)); p = o + 10; }
    const mk = masked ? p : -1; if (masked) p += 4;
    if (buf.length < p + n) break;
    const data = Buffer.from(buf.subarray(p, p + n));
    if (masked) for (let i = 0; i < n; i++) data[i] ^= buf[mk + (i & 3)];
    frames.push({ op, data }); o = p + n;
  }
  return { frames, rest: buf.subarray(o) };
}

// ---- Lagebild (Datei des VBS-Moduls „lagebild“): je Zeile ein JSON-Feld ----
// ["KOPF", 1, Spielzeit, Takt, Mission, Anzahl]
// ["E", Gateway-ID, Klasse, Seite, [x,y,z] ASL, [X,Y,Z] ECEF, [vx,vy,vz] m/s, vectorDir, vectorUp, lebt, Schaden, Besatzung]
export function brParseLagebild(text) {
  const out = { head: null, units: [] };
  for (const line of String(text).split(/\r?\n/)) {
    const s = line.trim();
    if (!s.startsWith('[')) continue;
    let a; try { a = JSON.parse(s); } catch (e) { continue; }
    if (a[0] === 'KOPF') out.head = { version: a[1], time: a[2], step: a[3], mission: a[4], count: a[5] };
    else if (a[0] === 'E' && Array.isArray(a[5]) && a[5].length === 3) out.units.push({ id: a[1], cls: a[2], side: a[3], asl: a[4], ecef: a[5], vel: a[6], dir: a[7], up: a[8], alive: a[9] !== false, damage: +a[10] || 0, crew: +a[11] || 0 });
  }
  return out;
}
// Seite in VBS -> Force ID (Vorgabe für eine Übung: WEST Freund, EAST Feind, Unabhängige neutral, Zivil sonstige)
export const BR_SIDE = { WEST: 1, EAST: 2, GUER: 3, RESISTANCE: 3, INDEPENDENT: 3, CIV: 0, CIVILIAN: 0 };

// Einheiten für den Browser: DIS-Einheiten (Art, Seite) und Lagebild (Ort, Bewegung) über die Entity-Nummer verbunden.
// dis: Map Schlüssel -> { site, app, entity, type, force, pos, ori, vel, appearance, t }; lb: Ergebnis von brParseLagebild.
// Rückgabe: [{ id, base, force, lat, lon, h (über NHN), hdg, pitch, roll, vn (Nord, Ost, oben in m/s), dead, src }]
export function brUnits(dis, lb, o = {}) {
  const N = o.undulation ?? 47, table = o.table || null, out = [], byEnt = new Map();
  for (const e of dis.values()) byEnt.set(e.entity, e);
  const used = new Set();
  for (const u of (lb && lb.units) || []) {
    const e = u.id ? byEnt.get(u.id) : null;
    if (e) used.add(e);
    const [lat, lon, he] = disFromEcef(...u.ecef);
    // Lage aus vectorDir (vorn) und vectorUp (oben), VBS-Achsen x Osten, y Norden, z oben; rechts = vorn x oben
    const d = u.dir || [0, 1, 0], up = u.up || [0, 0, 1], r = [d[1]*up[2] - d[2]*up[1], d[2]*up[0] - d[0]*up[2], d[0]*up[1] - d[1]*up[0]];
    const hdg = Math.atan2(d[0], d[1]), pitch = Math.asin(Math.max(-1, Math.min(1, d[2]))), roll = Math.atan2(-r[2], up[2]);   // rechts runter = positiv
    out.push({ id: 'lb' + (u.id || ''), base: e ? disBaseOf(e.type, table) : 'other', force: e ? e.force : (BR_SIDE[String(u.side).toUpperCase()] ?? 0),
      lat, lon, h: Array.isArray(u.asl) ? u.asl[2] : he - N, hdg, pitch, roll, vn: [u.vel ? u.vel[1] : 0, u.vel ? u.vel[0] : 0, u.vel ? u.vel[2] : 0],
      dead: !u.alive || (e ? disAppearanceRead(e.appearance).damage === 3 : false), src: e ? 'beide' : 'lagebild' });
  }
  for (const e of dis.values()) {
    if (used.has(e)) continue;
    const [lat, lon, he] = disFromEcef(...e.pos), [hdg, pitch, roll] = disEulerToHpr(lat, lon, ...e.ori), v = disEcefToNed(lat, lon, e.vel);
    out.push({ id: e.site + ':' + e.app + ':' + e.entity, base: disBaseOf(e.type, table), force: e.force, lat, lon, h: he - N, hdg, pitch, roll, vn: [v[0], v[1], -v[2]],
      dead: disAppearanceRead(e.appearance).damage === 3, src: 'dis' });
  }
  return out;
}

// ---- Die Brücke ----
// o: { wsPort, disPort, disTarget, exercise, site, app, undulation, lagebild (Pfad), table (Map), origins (Liste),
//      heartbeat (s, Vorgabe 5), timeout (s, Vorgabe 13), lbEvery (ms), pushEvery (ms), log }
export function createBridge(o = {}) {
  const cfg = { wsPort: 8642, disPort: 3000, disTarget: '255.255.255.255', exercise: 1, site: DIS_FPV.site, app: DIS_FPV.app, undulation: 47,
    heartbeat: DIS_SEND.heartbeat, timeout: 13, lbEvery: 1000, pushEvery: 200, origins: ['null', 'https://bladeage.github.io', 'http://localhost', 'http://127.0.0.1'], log: () => {}, ...o };
  const dis = new Map(), clients = new Set(), t0 = Date.now(), now = () => (Date.now() - t0)/1000;
  let lb = null, nextEntity = 1, closed = false;
  const udp = createSocket({ type: 'udp4', reuseAddr: true });
  udp.on('message', msg => {
    const d = disDecode(msg);
    if (!d || d.pduType !== 1 || d.exercise !== cfg.exercise) return;
    if (d.site === cfg.site && d.app === cfg.app) return;   // eigene Pakete (Broadcast kommt zurück)
    dis.set(d.site + ':' + d.app + ':' + d.entity, { ...d, t: now() });
  });
  const ready = new Promise(res => udp.bind(cfg.disPort, () => { try { udp.setBroadcast(true); } catch (e) {} res(); }));
  const send = pdu => { if (closed) return; try { udp.send(pdu, cfg.disTargetPort || cfg.disPort, cfg.disTarget); } catch (e) { cfg.log('Senden fehlgeschlagen: ' + e.message); } };   // nach dem Beenden nichts mehr senden   // Zielport: wie der eigene (VBS: beide 3000); Tests geben ihn vor

  // eigene Drohne je Verbindung (mehrere Simulatoren möglich: Entity 1, 2, ...)
  function sendOwn(c, force = false) {
    if (!c.own) return;
    const t = now(), st = disState(c.own.state || 'fly'), f = disFromSim(c.own, { lat: c.own.lat, lon: c.own.lon, zone: c.own.zone || 32, hNhn: c.own.h, undulation: cfg.undulation });
    const cur = { ...f, appearance: st.appearance, dra: st.dra };
    if (!force && !disNeedSend(c.last, cur, t)) return;
    const e = { ...DIS_FPV, ...cur, exercise: cfg.exercise, site: cfg.site, app: cfg.app, entity: c.entity, timestamp: disTimestamp(Date.now()) };
    send(disEncodeES(e)); c.last = { ...cur, tSent: t }; c.sent = (c.sent || 0) + 1;
  }
  const http = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); res.end('DIS-Brücke läuft. Simulator verbindet per WebSocket.\n'); });
  http.on('upgrade', (req, sock) => {
    const key = req.headers['sec-websocket-key'], origin = req.headers.origin || 'null';
    const ok = key && /websocket/i.test(req.headers.upgrade || '') && cfg.origins.some(x => origin === x || origin.startsWith(x + ':'));
    if (!ok) { sock.end('HTTP/1.1 403 Forbidden\r\n\r\n'); cfg.log('abgelehnt: ' + origin); return; }
    sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + wsAccept(key) + '\r\n\r\n');
    const c = { sock, entity: nextEntity++, own: null, last: null, buf: Buffer.alloc(0) };
    clients.add(c); cfg.log('Simulator verbunden, Entity ' + c.entity);
    sock.on('data', chunk => {
      const r = wsParse(Buffer.concat([c.buf, chunk])); c.buf = Buffer.from(r.rest);
      for (const f of r.frames) {
        if (f.op === 8) { sock.end(wsFrame('', 8)); continue; }
        if (f.op === 9) { sock.write(wsFrame(f.data.toString(), 10)); continue; }
        if (f.op !== 1) continue;
        let m; try { m = JSON.parse(f.data.toString()); } catch (e) { continue; }
        if (m.t === 'own' && Number.isFinite(m.lat) && Number.isFinite(m.lon)) { c.own = m; sendOwn(c); }
      }
    });
    const bye = () => {
      if (!clients.delete(c)) return;
      if (c.own) { c.own.state = 'off'; sendOwn(c, true); }   // einmal „deaktiviert“
      cfg.log('Simulator getrennt, Entity ' + c.entity);
    };
    sock.on('close', bye); sock.on('error', bye);
  });
  const httpReady = new Promise(res => http.listen(cfg.wsPort, '127.0.0.1', res));
  // Takte: Herzschlag der eigenen Drohnen, Aufräumen, Lagebild lesen, Einheiten an den Browser
  const tick = setInterval(() => {
    const t = now();
    for (const c of clients) if (c.last && t - c.last.tSent >= cfg.heartbeat) sendOwn(c, true);
    for (const [k, e] of dis) if (t - e.t > cfg.timeout) dis.delete(k);
  }, Math.min(250, cfg.heartbeat*500));
  const lbTimer = cfg.lagebild ? setInterval(async () => { try { lb = brParseLagebild(await readFile(cfg.lagebild, 'utf8')); } catch (e) { lb = null; } }, cfg.lbEvery) : null;
  const push = setInterval(() => {
    if (!clients.size) return;
    const msg = wsFrame(JSON.stringify({ t: 'units', time: now(), units: brUnits(dis, lb, cfg) }));
    for (const c of clients) c.sock.write(msg);
  }, cfg.pushEvery);
  return {
    ready: Promise.all([ready, httpReady]), dis, clients, cfg,
    get udpPort() { return udp.address().port; }, get wsPort() { return http.address().port; },
    close() { closed = true; clearInterval(tick); clearInterval(push); if (lbTimer) clearInterval(lbTimer); for (const c of clients) c.sock.destroy(); udp.close(); http.close(); }
  };
}

// ---- Aufruf von der Kommandozeile ----
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2), arg = (n, d) => { const i = a.indexOf('--' + n); return i >= 0 ? a[i + 1] : d; };
  const table = arg('tabelle') ? disBaseTable(readFileSync(arg('tabelle'), 'utf8')) : null;
  const b = createBridge({ wsPort: +arg('ws', 8642), disPort: +arg('dis-port', 3000), disTarget: arg('dis-ziel', '255.255.255.255'), exercise: +arg('uebung', 1),
    site: +arg('site', 1), app: +arg('app', 200), undulation: +arg('quasigeoid', 47), lagebild: arg('lagebild'), table, log: s => console.log(new Date().toISOString().slice(11, 19) + ' ' + s) });
  b.ready.then(() => console.log('DIS-Brücke: WebSocket ws://127.0.0.1:' + b.wsPort + ', DIS UDP ' + b.cfg.disPort + ' an ' + b.cfg.disTarget + ', Übung ' + b.cfg.exercise
    + ', Site/App ' + b.cfg.site + '/' + b.cfg.app + (b.cfg.lagebild ? ', Lagebild ' + b.cfg.lagebild : ', ohne Lagebild') + (table ? ', Tabelle ' + table.size + ' Einträge' : '')));
  setInterval(() => console.log('Einheiten: ' + b.dis.size + ' aus DIS; Simulatoren: ' + b.clients.size + [...b.clients].map(c => ' (Entity ' + c.entity + ', gesendet ' + (c.sent || 0) + ')').join('')), 10000);
}
