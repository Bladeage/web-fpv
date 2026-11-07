// DIS-Brücke für Entwicklung und Tests (Node, nur Bordmittel). Gleiches Protokoll wie die Windows-Brücke
// bruecke/fpv-vbs-bruecke.cmd (PowerShell), die der Simulator im DIS-Modus zum Download anbietet.
//
//   Simulator --WebSocket (binär: DIS-PDU)--> Brücke --UDP :3000 (Broadcast)--> VBS Gateway
//   Simulator <--(binär: DIS-PDU) / (Text: {"t":"info"}, {"t":"lagebild","text":...})-- Brücke <--UDP / Datei lagebild.txt
//
// Die Brücke rechnet nichts: Der Simulator baut und liest die DIS-PDUs selbst (src/dis.js, src/verbund.js). Sie hält
// nur den Herzschlag (letzte PDU erneut, wenn der Simulator schweigt, zum Beispiel Tab im Hintergrund) und meldet die
// Drohne beim Trennen einmal als „deaktiviert“ (Appearance Bit 23, Vorhersage Static).
//
// Aufruf: node tools/dis-bruecke.mjs [--lagebild <Datei>] [--ws 8642] [--dis-port 3000] [--dis-ziel 255.255.255.255]
import { createServer } from 'node:http';
import { createSocket } from 'node:dgram';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
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

// o: { wsPort, disPort, disTarget, disTargetPort (nur Tests), lagebild, heartbeat (s), origins, log }
export function createBridge(o = {}) {
  const cfg = { wsPort: 8642, disPort: 3000, disTarget: '255.255.255.255', heartbeat: 5, lbEvery: 1000,
    origins: ['null', 'https://bladeage.github.io', 'http://localhost', 'http://127.0.0.1'], log: () => {}, ...o };
  const clients = new Set();
  let closed = false, lbTime = 0;
  const udp = createSocket({ type: 'udp4', reuseAddr: true });
  const send = pdu => { if (closed) return; try { udp.send(pdu, cfg.disTargetPort || cfg.disPort, cfg.disTarget); } catch (e) { cfg.log('Senden fehlgeschlagen: ' + e.message); } };
  udp.on('message', msg => { const f = wsFrame(msg, 2); for (const c of clients) c.sock.write(f); });   // alles an die Simulatoren, die filtern selbst
  const ready = new Promise(res => udp.bind(cfg.disPort, () => { try { udp.setBroadcast(true); } catch (e) {} res(); }));
  const http = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); res.end('FPV-VBS-Bruecke laeuft\n'); });
  http.on('upgrade', (req, sock) => {
    const key = req.headers['sec-websocket-key'], origin = req.headers.origin || 'null';
    const ok = key && /websocket/i.test(req.headers.upgrade || '') && cfg.origins.some(x => origin === x || origin.startsWith(x + ':'));
    if (!ok) { sock.end('HTTP/1.1 403 Forbidden\r\n\r\n'); cfg.log('abgelehnt: ' + origin); return; }
    sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + wsAccept(key) + '\r\n\r\n');
    const c = { sock, last: null, lastT: 0, buf: Buffer.alloc(0) };
    clients.add(c); lbTime = 0; cfg.log('Simulator verbunden (' + clients.size + ')');
    sock.write(wsFrame(JSON.stringify({ t: 'info', name: 'fpv-vbs-bruecke', version: 1, disPort: cfg.disPort, lagebild: !!cfg.lagebild })));
    sock.on('data', chunk => {
      const r = wsParse(Buffer.concat([c.buf, chunk])); c.buf = Buffer.from(r.rest);
      for (const f of r.frames) {
        if (f.op === 8) { sock.end(wsFrame('', 8)); continue; }
        if (f.op === 9) { sock.write(wsFrame(f.data, 10)); continue; }
        if (f.op === 2 && f.data.length >= 12) { send(f.data); c.last = f.data; c.lastT = Date.now(); }
      }
    });
    const bye = () => { if (!clients.delete(c)) return; if (c.last) send(offPdu(c.last)); cfg.log('Simulator getrennt (' + clients.size + ')'); };
    sock.on('close', bye); sock.on('error', bye);
  });
  const httpReady = new Promise(res => http.listen(cfg.wsPort, '127.0.0.1', res));
  const tick = setInterval(() => { for (const c of clients) if (c.last && Date.now() - c.lastT >= cfg.heartbeat*1000) { send(c.last); c.lastT = Date.now(); } }, Math.min(250, cfg.heartbeat*500));
  const lbTimer = cfg.lagebild ? setInterval(async () => {
    if (!clients.size) return;
    try { const st = await stat(cfg.lagebild); if (st.mtimeMs === lbTime) return; lbTime = st.mtimeMs;
      const f = wsFrame(JSON.stringify({ t: 'lagebild', text: await readFile(cfg.lagebild, 'utf8') })); for (const c of clients) c.sock.write(f); } catch (e) {}
  }, cfg.lbEvery) : null;
  return {
    ready: Promise.all([ready, httpReady]), clients, cfg,
    get udpPort() { return udp.address().port; }, get wsPort() { return http.address().port; },
    // close: zweiter Aufruf ohne Wirkung
    close() { if (closed) return; closed = true; clearInterval(tick); if (lbTimer) clearInterval(lbTimer); for (const c of clients) c.sock.destroy(); udp.close(); http.close(); }
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2), arg = (n, d) => { const i = a.indexOf('--' + n); return i >= 0 ? a[i + 1] : d; };
  const b = createBridge({ wsPort: +arg('ws', 8642), disPort: +arg('dis-port', 3000), disTarget: arg('dis-ziel', '255.255.255.255'), lagebild: arg('lagebild'),
    log: s => console.log(new Date().toISOString().slice(11, 19) + ' ' + s) });
  b.ready.then(() => console.log('FPV-VBS-Bruecke (Node): ws://127.0.0.1:' + b.wsPort + ', DIS UDP ' + b.cfg.disPort + ' an ' + b.cfg.disTarget + (b.cfg.lagebild ? ', Lagebild ' + b.cfg.lagebild : '')));
}
