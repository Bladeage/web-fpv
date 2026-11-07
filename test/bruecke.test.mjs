// Etappe D2: DIS-Brücke (tools/dis-bruecke.mjs) ohne VBS: WebSocket nach RFC 6455, Lagebild lesen, Einheiten verbinden,
// und ein Gesamtlauf mit echtem WebSocket (Browser-Ersatz) und UDP-Empfänger (VBS-Ersatz).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSocket } from 'node:dgram';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { wsAccept, wsFrame, wsParse, brParseLagebild, brUnits, createBridge } from '../tools/dis-bruecke.mjs';
import * as D from '../src/dis.js';

const R = 180/Math.PI, near = (a, b, e, m) => assert.ok(Math.abs(a - b) <= e, (m || '') + ': ' + a + ' statt ' + b);
const wait = ms => new Promise(r => setTimeout(r, ms));
// Beispielzeile wie vom VBS-Modul „lagebild“ (Aufbau laut k5.2; Klassenname hier ausgedacht)
const LB = (id, ecef, vel = [6.81, -0.05, 0.22], dir = [0.9994, 0.0115, 0.0323], up = [-0.0323, 0.0009, 0.9995], alive = true) =>
  `["KOPF",1,144.5,1,"test",1]\n["E",${id},"testklasse","WEST",[1000060.57,999979.42,315.51],${JSON.stringify(ecef)},${JSON.stringify(vel)},${JSON.stringify(dir)},${JSON.stringify(up)},${alive},0,1]\n`;

test('D2: WebSocket nach RFC 6455 (Schlüssel aus dem Beispiel der Norm, Rahmen mit Maske, Längen 125/126/65536, Teilstücke)', () => {
  assert.equal(wsAccept('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
  const mask = (text, k = [1, 2, 3, 4]) => { const p = Buffer.from(text), h = p.length < 126 ? Buffer.from([0x81, 0x80 | p.length]) : Buffer.from([0x81, 0x80 | 126, p.length >> 8, p.length & 255]);
    return Buffer.concat([h, Buffer.from(k), Buffer.from(p.map((b, i) => b ^ k[i & 3]))]); };
  const two = Buffer.concat([mask('{"t":"own"}'), mask('x'.repeat(300))]);
  const r = wsParse(two.subarray(0, two.length - 5));   // zweiter Rahmen unvollständig
  assert.equal(r.frames.length, 1); assert.equal(r.frames[0].data.toString(), '{"t":"own"}');
  const r2 = wsParse(Buffer.concat([r.rest, two.subarray(two.length - 5)]));
  assert.equal(r2.frames[0].data.toString(), 'x'.repeat(300)); assert.equal(r2.rest.length, 0);
  for (const n of [5, 125, 126, 65536]) { const f = wsParse(wsFrame('y'.repeat(n))).frames[0]; assert.equal(f.data.length, n); assert.equal(f.op, 1); }
});

test('D2: Lagebild lesen; mit DIS über die Entity-Nummer verbinden (Art und Seite aus DIS, Ort und Bewegung aus dem Lagebild)', () => {
  const ecef = D.disToEcef(50.35152, 16.64054, 358.9), lb = brParseLagebild(LB(13, ecef) + 'Müll\n["E",kaputt\n');
  assert.equal(lb.head.time, 144.5); assert.equal(lb.units.length, 1);
  const dis = new Map([['1:10601:13', { site: 1, app: 10601, entity: 13, type: [1, 1, 78, 3, 10, 0, 0], force: 1, pos: D.disToEcef(50, 16, 100), ori: [0, 0, 0], vel: [0, 0, 0], appearance: 0, t: 0 }],
    ['1:10601:2', { site: 1, app: 10601, entity: 2, type: [3, 1, 222, 11, 35, 0, 0], force: 2, pos: D.disToEcef(50.35259, 16.64423, 48.9), ori: D.disHprToEuler(50.35259, 16.64423, 1, 0, 0), vel: [0, 0, 0], appearance: 0, t: 0 }]]);
  const u = brUnits(dis, lb, { undulation: 44 });
  assert.equal(u.length, 2);
  const box = u.find(x => x.src === 'beide'), per = u.find(x => x.src === 'dis');
  assert.equal(box.base, 'tpz'); assert.equal(box.force, 1);
  near(box.lat, 50.35152, 1e-6); near(box.lon, 16.64054, 1e-6); near(box.h, 315.51, 1e-9, 'Höhe ASL aus dem Lagebild');
  near(box.hdg*R, 89.34, 0.05, 'Kurs aus vectorDir (Osten)'); near(box.vn[1], 6.81, 1e-9, 'Tempo Ost');
  assert.equal(per.base, 'person'); assert.equal(per.force, 2); near(per.hdg, 1, 1e-6); near(per.h, 48.9 - 44, 1e-3, 'nur DIS: Ellipsoid minus Quasigeoid');
  // ohne DIS-Gegenstück: Seite aus dem Lagebild, Form Quader; tot
  const solo = brUnits(new Map(), brParseLagebild(LB(0, ecef, [0, 0, 0], [0, 1, 0], [0, 0, 1], false)), {});
  assert.deepEqual([solo[0].base, solo[0].force, solo[0].dead, solo[0].src], ['other', 1, true, 'lagebild']);
  near(solo[0].hdg, 0, 1e-12, 'Blick Nord'); near(solo[0].roll, 0, 1e-12); near(solo[0].pitch, 0, 1e-12);
  // nach rechts gerollt (rechts runter): Rollen positiv
  const rr = brUnits(new Map(), brParseLagebild(LB(0, ecef, [0, 0, 0], [0, 1, 0], [Math.sin(0.3), 0, Math.cos(0.3)])), {})[0];
  near(rr.roll, 0.3, 1e-9, 'Rollen rechts');
});

test('D2: Gesamtlauf (Browser per WebSocket, VBS per UDP, Lagebild-Datei): senden, Herzschlag, empfangen, verbinden, abmelden', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'bruecke-')), lbFile = join(dir, 'lagebild.txt');
  const vbs = createSocket('udp4'), got = [];
  vbs.on('message', m => got.push(D.disDecode(m)));
  await new Promise(r => vbs.bind(0, '127.0.0.1', r));
  const b = createBridge({ wsPort: 0, disPort: 0, disTarget: '127.0.0.1', disTargetPort: vbs.address().port, heartbeat: 0.3, lbEvery: 50, pushEvery: 50, lagebild: lbFile, undulation: 47 });
  t.after(() => { b.close(); vbs.close(); rmSync(dir, { recursive: true, force: true }); });
  await b.ready;
  // 1. Browser verbindet und schickt seinen Zustand: Brücke sendet DIS 6 mit unseren Werten
  const ws = new WebSocket('ws://127.0.0.1:' + b.wsPort), msgs = [];
  ws.onmessage = e => msgs.push(JSON.parse(e.data));
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const own = { t: 'own', lat: 50.5553, lon: 6.2428, h: 500, q: [0, 0, 0, 1], v: [0, 0, -10], w: [0, 0, 0], state: 'fly' };
  ws.send(JSON.stringify(own));
  await wait(150);
  assert.ok(got.length >= 1, 'erste PDU gesendet');
  const p = got[0];
  assert.deepEqual([p.version, p.exercise, p.site, p.app, p.entity, p.marking, p.dra], [6, 1, 1, 200, 1, 'FPV1', 4]);
  assert.deepEqual(p.type, D.DIS_FPV.type);
  const [lat, lon, h] = D.disFromEcef(...p.pos);
  near(lat, 50.5553, 1e-7); near(lon, 6.2428, 1e-7); near(h, 547, 1e-3, 'NHN + Quasigeoid');
  // 2. Nichts Neues vom Browser: Herzschlag (hier 0,3 s statt 5 s)
  const n1 = got.length; await wait(800);
  assert.ok(got.length >= n1 + 2, 'Herzschlag: ' + (got.length - n1) + ' PDUs');
  // 3. VBS meldet eine Einheit (DIS) und das Lagebild ihre Bewegung; eigene Pakete (Site 1/App 200) werden übergangen
  const ecef = D.disToEcef(50.5560, 6.2430, 520);
  const sock = createSocket('udp4');
  const vbsPdu = D.disEncodeES({ version: 6, exercise: 1, site: 1, app: 10601, entity: 13, force: 2, type: [1, 1, 78, 1, 2, 0, 0], pos: D.disToEcef(50, 16, 0), ori: [0, 0, 0], appearance: 0, dra: 4 });
  const ownEcho = D.disEncodeES({ version: 6, exercise: 1, site: 1, app: 200, entity: 1, force: 1, type: D.DIS_FPV.type, pos: ecef, ori: [0, 0, 0] });
  await new Promise(r => sock.send(vbsPdu, b.udpPort, '127.0.0.1', r)); await new Promise(r => sock.send(ownEcho, b.udpPort, '127.0.0.1', r)); sock.close();
  writeFileSync(lbFile, LB(13, ecef));
  await wait(400);
  const last = msgs.filter(m => m.t === 'units').pop();
  assert.ok(last && last.units.length === 1, 'eine fremde Einheit (eigenes Echo übergangen): ' + JSON.stringify(last && last.units));
  const u = last.units[0];
  assert.deepEqual([u.base, u.force, u.src], ['kpz', 2, 'beide']);
  near(u.lat, 50.5560, 1e-7, 'Ort aus dem Lagebild, nicht aus DIS');
  // 4. Zustand Absturz: sofort gesendet, zerstört, Vorhersage Static
  const n2 = got.length;
  ws.send(JSON.stringify({ ...own, state: 'crashed' })); await wait(150);
  const c = got.slice(n2).find(x => D.disAppearanceRead(x.appearance).damage === 3);
  assert.ok(c && c.dra === 1, 'Absturz gemeldet');
  // 5. Browser trennt sich: einmal „deaktiviert“
  const n3 = got.length; ws.close(); await wait(300);
  assert.ok(got.slice(n3).some(x => D.disAppearanceRead(x.appearance).off), 'deaktiviert gemeldet');
});

test('D2: Fremde Webseiten dürfen sich nicht verbinden', async t => {
  const b = createBridge({ wsPort: 0, disPort: 0, disTarget: '127.0.0.1', disTargetPort: 9, origins: ['https://bladeage.github.io'] });
  t.after(() => b.close());
  await b.ready;
  const net = await import('node:net'), res = await new Promise(r => { const s = net.connect(b.wsPort, '127.0.0.1', () => s.write('GET / HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\nOrigin: https://boese.example\r\n\r\n'));
    let d = ''; s.on('data', x => d += x); s.on('close', () => r(d)); });
  assert.match(res, /403/);
});
