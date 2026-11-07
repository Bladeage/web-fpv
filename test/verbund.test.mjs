// Etappe D3: Verbund mit VBS im Simulator (src/verbund.js): eigener Zustand an die Brücke, VBS-Einheiten in Kartenkoordinaten,
// Gesamtlauf Simulator <-> Brücke (tools/dis-bruecke.mjs) <-> UDP (VBS-Ersatz), ohne VBS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { createSocket } from 'node:dgram';
import { rw, rwApply, rwLatLon, groundH } from '../src/realworld.js';
import { VB, vb, vbOwn, vbLocal, vbTake, vbPlace, vbStep, vbClose, vbLabel } from '../src/verbund.js';
import { createBridge } from '../tools/dis-bruecke.mjs';
import * as D from '../src/dis.js';

const near = (a, b, e, m) => assert.ok(Math.abs(a - b) <= e, (m || '') + ': ' + a + ' statt ' + b);
const f = n => readFileSync(new URL('../realworld/monschau.' + n, import.meta.url)), meta = JSON.parse(f('json')), q = inflateSync(f('dgm'));
const un = n => { const b = inflateSync(f(n)); return new Int16Array(b.buffer, b.byteOffset, b.byteLength/2); };
rwApply({ meta, q: new Uint16Array(q.buffer, q.byteOffset, q.byteLength/2), b16: un('bld'), t16: un('trees') });
// Einheit, wie sie die Brücke an einem Kartenpunkt melden würde
const unitAt = (x, z, o = {}) => { const [lat, lon] = rwLatLon(x, z), g = D.disConvergence(lat, lon);
  return { id: 'u', base: 'kpz', force: 2, lat, lon, h: meta.hHome + (o.y ?? 0), hdg: g + (o.bearing ?? 0), pitch: 0, roll: 0, vn: o.vn || [0, 0, 0], dead: false, src: 'beide', ...o.u }; };

test('D3: eigener Zustand für die Brücke (Breite, Länge, Höhe über NHN, Zone, Zustand)', () => {
  rw.on = true;
  const s = { p: [100, 12, -200], v: [1, 0, -5], q: [0, 0, 0, 1], w: [0, 0.1, 0] }, m = vbOwn(s, 'frozen');
  const [lat, lon] = rwLatLon(100, -200);
  assert.deepEqual([m.t, m.lat, m.lon, m.zone, m.state], ['own', lat, lon, 32, 'frozen']);
  near(m.h, meta.hHome + 12, 1e-9);
  rw.on = false;
});

test('D3: VBS-Einheit -> Karte (Ort, Kurs über die Meridiankonvergenz, Tempo, Boden), Umkreis und Anzahl', () => {
  rw.on = true;
  const g = D.disConvergence(...rwLatLon(120, -250));
  // Kurs = Gitter-Nord, 10 m/s nach Gitter-Nord: in der Karte Richtung -z
  const u = vbLocal(unitAt(120, -250, { vn: [10*Math.cos(g), 10*Math.sin(g), 0], y: 30 }));
  near(u.x, 120, 0.01, 'x'); near(u.z, -250, 0.01, 'z'); near(u.yaw, 0, 1e-9, 'Kurs'); near(u.y, 30, 1e-6, 'Höhe');
  near(u.v[0], 0, 1e-9); near(u.v[2], -10, 1e-9, 'Tempo Gitter-Nord');
  // nach Osten (Gitter): Modell um -90° um die Hochachse (vorn = -z dreht nach +x)
  near(vbLocal(unitAt(0, 0, { bearing: Math.PI/2 })).yaw, -Math.PI/2, 1e-9, 'Osten');
  // Bodenfahrzeug steht auf unserem Boden, Hubschrauber bleibt in der Luft, aber nie unter dem Boden
  const L = vbTake([unitAt(50, 60, { y: 300 }), unitAt(10, 10, { y: 200, u: { base: 'ths' } }), unitAt(10, 10, { y: -500, u: { base: 'ths', id: 'tief' } }), unitAt(9000, 0)], [0, 0, 0]);
  assert.equal(L.length, 3, 'Einheit 9 km weg nicht im Umkreis');
  const land = vbPlace(L.find(x => x.base === 'kpz'), 0), heli = vbPlace(L.find(x => x.base === 'ths' && x.id !== 'tief'), 0), low = vbPlace(L.find(x => x.id === 'tief'), 0);
  near(land.y, groundH(land.x, land.z), 1e-9, 'auf dem Boden'); near(heli.y, 200, 1e-6, 'Hubschrauber in der Luft'); near(low.y, groundH(low.x, low.z), 1e-9, 'nicht unter dem Boden');
  // weiterschieben mit dem Tempo
  const mv = vbTake([unitAt(0, 0, { vn: [0, 5, 0] })])[0]; vbPlace(mv, 2);
  assert.ok(Math.abs(mv.x - 10) < 0.5, 'nach 2 s etwa 10 m nach Osten: ' + mv.x.toFixed(2));
  assert.equal(vbLabel(false), ''); rw.on = false;
});

test('D3: Gesamtlauf Simulator <-> Brücke <-> VBS (UDP): Drohne kommt am richtigen Ort an, VBS-Panzer erscheint auf der Karte', async t => {
  const vbs = createSocket('udp4'), got = [];
  vbs.on('message', m => got.push(D.disDecode(m)));
  await new Promise(r => vbs.bind(0, '127.0.0.1', r));
  const b = createBridge({ wsPort: 0, disPort: 0, disTarget: '127.0.0.1', disTargetPort: vbs.address().port, pushEvery: 50, undulation: 47 });
  t.after(() => { vbClose(); b.close(); vbs.close(); rw.on = false; });
  await b.ready;
  VB.url = 'ws://127.0.0.1:' + b.wsPort;
  rw.on = true;
  const s = { p: [100, 20, -150], v: [0, 0, 0], q: [0, 0, 0, 1], w: [0, 0, 0] };
  let tt = 0;
  const loop = setInterval(() => { tt += 0.05; vbStep(tt, s, 'fly', true); }, 50);
  t.after(() => clearInterval(loop));
  await new Promise(r => setTimeout(r, 600));
  assert.equal(vb.state, 'verbunden');
  assert.ok(got.length >= 1, 'Brücke hat unsere Drohne gesendet');
  const [lat, lon, h] = D.disFromEcef(...got[0].pos), [elat, elon] = rwLatLon(100, -150);
  near(lat, elat, 1e-7); near(lon, elon, 1e-7); near(h, meta.hHome + 20 + 47, 1e-3, 'Höhe NHN + Quasigeoid');
  // VBS meldet einen Kampfpanzer (Feind) an Kartenpunkt (50, -80)
  const [plat, plon] = rwLatLon(50, -80), pos = D.disToEcef(plat, plon, meta.hHome + 47);
  const pdu = D.disEncodeES({ version: 6, exercise: 1, site: 1, app: 10601, entity: 13, force: 2, type: [1, 1, 78, 1, 2, 0, 0], pos, ori: D.disHprToEuler(plat, plon, 0, 0, 0), appearance: 0, dra: 4 });
  const sock = createSocket('udp4'); await new Promise(r => sock.send(pdu, b.udpPort, '127.0.0.1', r)); sock.close();
  await new Promise(r => setTimeout(r, 500));
  assert.equal(vb.units.length, 1, 'eine VBS-Einheit');
  const u = vb.units[0];
  assert.deepEqual([u.base, u.force, u.air], ['kpz', 2, false]);
  near(u.x, 50, 0.05, 'x'); near(u.z, -80, 0.05, 'z'); near(u.y, groundH(u.x, u.z), 1e-6, 'auf unserem Boden');
  assert.equal(vbLabel(true), 'VBS 1');
});
