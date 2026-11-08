// DIS-Brücke für Entwicklung und Tests (Node, nur Bordmittel). Gleiches Protokoll wie die Windows-Brücke
// bruecke/fpv-dis-bruecke.cmd (PowerShell), die der Simulator im DIS-Modus zum Download anbietet.
//
//   Simulator --WebSocket (binär: DIS-PDU)--> Brücke --UDP :3000 (Broadcast)--> DIS-Netz
//   Simulator <--(binär: DIS-PDU) / (Text: {"t":"info",...})-- Brücke <--UDP :3000
//
// Die Brücke rechnet nichts: Der Simulator baut und liest die DIS-PDUs selbst (src/dis.js, src/verbund.js). Sie hält
// nur den Herzschlag (letzte PDU erneut, wenn der Simulator schweigt, zum Beispiel Tab im Hintergrund) und meldet die
// Drohne beim Trennen einmal als „deaktiviert“ (Appearance Bit 23, Vorhersage Static). Der Simulator kann den DIS-Port
// wechseln: Text {"t":"config","port":3000}.
//
// Aufruf: node tools/dis-bruecke.mjs [--ws 8642] [--dis-port 3000] [--dis-ziel 255.255.255.255]
import { createServer } from 'node:http';
import { createSocket } from 'node:dgram';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// ---- WebSocket nach RFC 6455 (Text, Binär, Ping, Schließen) ----
export function wsAccept(key) { return createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64'); }
export function wsFrame(data, op = 1) {
  const p = Buffer.isBuffer(data) || data instanceof Uint8Array ? Buffer.from(data) : Buffer.from(String(data)), n = p.length;
  const h = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
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
// Letzte PDU als „deaktiviert“: Appearance Bit 23 (Byte 85, Bit 7), Vorhersage Static (Byte 88 = 1)
export function offPdu(p) { const q = Buffer.from(p); if (q.length >= 144) { q[85] |= 0x80; q[88] = 1; } return q; }

// o: { wsPort, disPort, disTarget, disTargetPort (fester Zielport, nur Tests), heartbeat (s), origins, log }
export function createBridge(o = {}) {
  const cfg = { wsPort: 8642, disPort: 3000, disTarget: '255.255.255.255', heartbeat: 5,
    origins: ['null', 'https://bladeage.github.io', 'http://localhost', 'http://127.0.0.1'], log: () => {}, ...o };
  const clients = new Set();
  let closed = false, udp = null;
  // Version 3 (Prompt 177): je Verbindung eine Nummer (kleinste freie ab 1). Der Simulator sendet mit ihr als Kennung und Name
  // (FPV1, FPV2 ...), so stören sich zwei Tabs nicht (vorher beide 1/200/1, beim Partner eine springende Einheit). clients nennt
  // die Zahl der Verbindungen; bei jeder neuen oder getrennten Verbindung bekommen alle die neue Info.
  const info = c => wsFrame(JSON.stringify({ t: 'info', name: 'fpv-dis-bruecke', version: 3, disPort: cfg.disPort, slot: c ? c.slot : 0, clients: clients.size }));
  const freeSlot = () => { let n = 1; while ([...clients].some(c => c.slot === n)) n++; return n; };
  const infoAll = () => { for (const c of clients) try { c.sock.write(info(c)); } catch (e) {} };
  const many = () => { if (clients.size > 1) cfg.log('Achtung: ' + clients.size + ' Simulatoren verbunden, jeder sendet mit eigener Nummer (FPV1, FPV2 ...)'); };
  const send = pdu => { if (closed) return; try { udp.send(pdu, cfg.disTargetPort || cfg.disPort, cfg.disTarget); } catch (e) { cfg.log('Senden fehlgeschlagen: ' + e.message); } };
  // UDP-Kanal (Port mit anderen DIS-Programmen geteilt); alles Empfangene an die Simulatoren, die filtern selbst
  const openUdp = port => new Promise((res, rej) => {
    const u = createSocket({ type: 'udp4', reuseAddr: true });
    u.on('message', msg => { if (u !== udp) return; const f = wsFrame(msg, 2); for (const c of clients) c.sock.write(f); });
    u.once('error', rej);
    u.bind(port, () => { try { u.setBroadcast(true); } catch (e) {} u.off('error', rej); u.on('error', e => cfg.log('UDP: ' + e.message)); res(u); });
  });
  // DIS-Port wechseln (Wunsch des Simulators)
  let switching = Promise.resolve();
  const setPort = port => { switching = switching.then(async () => {
    if (closed || !(port > 0 && port < 65536) || port === cfg.disPort) return;
    try { const u = await openUdp(port), old = udp; udp = u; cfg.disPort = port; old.close(); cfg.log('DIS-Port jetzt ' + port); infoAll(); }
    catch (e) { cfg.log('DIS-Port ' + port + ' nicht möglich: ' + e.message); }
  }); return switching; };
  const ready = openUdp(cfg.disPort).then(u => { udp = u; if (!cfg.disPort) cfg.disPort = u.address().port; });
  const http = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); res.end('FPV-DIS-Bruecke laeuft\n'); });
  http.on('upgrade', (req, sock) => {
    const key = req.headers['sec-websocket-key'], origin = req.headers.origin || 'null';
    const ok = key && /websocket/i.test(req.headers.upgrade || '') && cfg.origins.some(x => origin === x || origin.startsWith(x + ':'));
    if (!ok) { sock.end('HTTP/1.1 403 Forbidden\r\n\r\n'); cfg.log('abgelehnt: ' + origin); return; }
    sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + wsAccept(key) + '\r\n\r\n');
    const c = { sock, last: null, lastT: 0, buf: Buffer.alloc(0), slot: freeSlot() };
    clients.add(c); cfg.log('Simulator verbunden als FPV' + c.slot + ' (' + clients.size + ')'); many();
    infoAll();
    sock.on('data', chunk => {
      const r = wsParse(Buffer.concat([c.buf, chunk])); c.buf = Buffer.from(r.rest);
      for (const f of r.frames) {
        if (f.op === 8) { sock.end(wsFrame('', 8)); continue; }
        if (f.op === 9) { sock.write(wsFrame(f.data, 10)); continue; }
        // Herzschlag und „deaktiviert“ nur aus der Lagemeldung (Entity State, PDU-Typ 1), nie aus Schuss oder Detonation
        if (f.op === 2 && f.data.length >= 12) { send(f.data); if (f.data[2] === 1) { c.last = f.data; c.lastT = Date.now(); } }
        if (f.op === 1) { let m = null; try { m = JSON.parse(f.data.toString()); } catch (e) {} if (m && m.t === 'config') setPort(+m.port); }
      }
    });
    const bye = () => { if (!clients.delete(c)) return; if (c.last) send(offPdu(c.last)); cfg.log('Simulator FPV' + c.slot + ' getrennt (' + clients.size + ')'); infoAll(); };
    sock.on('close', bye); sock.on('error', bye);
  });
  const httpReady = new Promise(res => http.listen(cfg.wsPort, '127.0.0.1', res));
  const tick = setInterval(() => { for (const c of clients) if (c.last && Date.now() - c.lastT >= cfg.heartbeat*1000) { send(c.last); c.lastT = Date.now(); } }, Math.min(250, cfg.heartbeat*500));
  return {
    ready: Promise.all([ready, httpReady]), clients, cfg, setPort,
    get udpPort() { return udp.address().port; }, get wsPort() { return http.address().port; },
    // close: zweiter Aufruf ohne Wirkung
    close() { if (closed) return; closed = true; clearInterval(tick); for (const c of clients) c.sock.destroy(); if (udp) udp.close(); http.close(); }
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2), arg = (n, d) => { const i = a.indexOf('--' + n); return i >= 0 ? a[i + 1] : d; };
  const b = createBridge({ wsPort: +arg('ws', 8642), disPort: +arg('dis-port', 3000), disTarget: arg('dis-ziel', '255.255.255.255'),
    log: s => console.log(new Date().toISOString().slice(11, 19) + ' ' + s) });
  b.ready.then(() => console.log('FPV-DIS-Bruecke (Node): ws://127.0.0.1:' + b.wsPort + ', DIS UDP ' + b.cfg.disPort + ' an ' + b.cfg.disTarget));
}
