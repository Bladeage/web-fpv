// DIS-Brücke (Node, tools/dis-bruecke.mjs): reicht DIS-PDUs durch, Lagebild, Herzschlag, „deaktiviert“, Herkunft.
// Gleiches Protokoll wie die Windows-Brücke (test/bruecke-ps.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSocket } from 'node:dgram';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { wsAccept, wsFrame, wsParse, offPdu, createBridge } from '../tools/dis-bruecke.mjs';

const wait = ms => new Promise(r => setTimeout(r, ms));
export const pduSample = (entity = 1, extra = 0) => { const b = new Uint8Array(144); b[0] = 6; b[1] = 1; b[2] = 1; b[3] = 1; b[17] = entity; b[88] = 4; b[100] = extra; return b; };

test('Brücke: WebSocket nach RFC 6455 (Schlüssel aus der Norm, Maske, Längen, Teilstücke, binär)', () => {
  assert.equal(wsAccept('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
  const mask = (p, op = 1, k = [1, 2, 3, 4]) => { p = Buffer.from(p); const h = p.length < 126 ? Buffer.from([0x80 | op, 0x80 | p.length]) : Buffer.from([0x80 | op, 0x80 | 126, p.length >> 8, p.length & 255]);
    return Buffer.concat([h, Buffer.from(k), Buffer.from(p.map((b, i) => b ^ k[i & 3]))]); };
  const two = Buffer.concat([mask('{"t":"x"}'), mask(Buffer.from(pduSample(7)), 2)]);
  const r = wsParse(two.subarray(0, two.length - 5));
  assert.equal(r.frames.length, 1); assert.equal(r.frames[0].data.toString(), '{"t":"x"}');
  const r2 = wsParse(Buffer.concat([r.rest, two.subarray(two.length - 5)]));
  assert.equal(r2.frames[0].op, 2); assert.equal(r2.frames[0].data[17], 7);
  for (const n of [5, 125, 126, 65536]) assert.equal(wsParse(wsFrame('y'.repeat(n))).frames[0].data.length, n);
  const off = offPdu(pduSample()); assert.ok(off[85] & 0x80); assert.equal(off[88], 1);
});

test('Brücke: Gesamtlauf (WebSocket <-> UDP, Lagebild, Herzschlag, deaktiviert)', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'bruecke-')), lb = join(dir, 'lagebild.txt');
  writeFileSync(lb, '["KOPF",1,1,1,"t",0]\n');
  const vbs = createSocket('udp4'), got = [];
  vbs.on('message', m => got.push(new Uint8Array(m)));
  await new Promise(r => vbs.bind(0, '127.0.0.1', r));
  const b = createBridge({ wsPort: 0, disPort: 0, disTarget: '127.0.0.1', disTargetPort: vbs.address().port, heartbeat: 0.3, lbEvery: 50, lagebild: lb });
  t.after(() => { b.close(); vbs.close(); rmSync(dir, { recursive: true, force: true }); });
  await b.ready;
  const ws = new WebSocket('ws://127.0.0.1:' + b.wsPort), rx = [];
  ws.binaryType = 'arraybuffer';
  ws.onmessage = e => rx.push(e.data);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  await wait(150);
  const info = rx.find(x => typeof x === 'string' && x.includes('"info"'));
  assert.ok(info && JSON.parse(info).name === 'fpv-vbs-bruecke', 'meldet sich');
  assert.ok(rx.some(x => typeof x === 'string' && JSON.parse(x).t === 'lagebild'), 'Lagebild beim Verbinden');
  // Browser -> VBS: unverändert durchgereicht
  ws.send(pduSample(1, 42)); await wait(150);
  assert.equal(got.length, 1); assert.equal(got[0][100], 42);
  // Herzschlag, wenn der Browser schweigt
  await wait(800); assert.ok(got.length >= 3, 'Herzschlag: ' + got.length);
  // VBS -> Browser: binär durchgereicht
  const s = createSocket('udp4'); await new Promise(r => s.send(Buffer.from(pduSample(13)), b.udpPort, '127.0.0.1', r)); s.close();
  await wait(150);
  assert.ok(rx.some(x => x instanceof ArrayBuffer && new Uint8Array(x)[17] === 13), 'PDU von VBS am Browser');
  // Lagebild geändert -> neu gesendet
  writeFileSync(lb, '["KOPF",1,2,1,"t",1]\n["E",13,"x","WEST",[0,0,0],[1,2,3],[0,0,0],[0,1,0],[0,0,1],true,0,1]\n'); await wait(250);
  assert.ok(rx.some(x => typeof x === 'string' && x.includes('\\"E\\",13')), 'neues Lagebild');
  // Trennen: einmal „deaktiviert“
  const n = got.length; ws.close(); await wait(300);
  assert.ok(got.slice(n).some(p => (p[85] & 0x80) && p[88] === 1), 'deaktiviert');
});

test('Brücke: fremde Webseiten dürfen sich nicht verbinden', async t => {
  const b = createBridge({ wsPort: 0, disPort: 0, disTarget: '127.0.0.1', disTargetPort: 9, origins: ['https://bladeage.github.io'] });
  t.after(() => b.close());
  await b.ready;
  const net = await import('node:net'), res = await new Promise(r => { const s = net.connect(b.wsPort, '127.0.0.1', () => s.write('GET / HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\nOrigin: https://boese.example\r\n\r\n'));
    let d = ''; s.on('data', x => d += x); s.on('close', () => r(d)); });
  assert.match(res, /403/);
});
