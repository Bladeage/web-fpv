// DIS-Modus im Simulator (src/verbund.js): eigene PDU, Lagebild und DIS verbinden, Karte, Gesamtlauf über die Brücke, Suche.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { createSocket } from 'node:dgram';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rw, rwApply, rwLatLon, groundH } from '../src/realworld.js';
import { VB, vb, vbOwnFields, vbOwnPdu, vbParseLagebild, vbUnitsGeo, vbLocal, vbTake, vbPlace, vbStep, vbClose, vbProbe, vbLabel } from '../src/verbund.js';
import { createBridge } from '../tools/dis-bruecke.mjs';
import * as D from '../src/dis.js';

const R = 180/Math.PI, near = (a, b, e, m) => assert.ok(Math.abs(a - b) <= e, (m || '') + ': ' + a + ' statt ' + b);
const wait = ms => new Promise(r => setTimeout(r, ms));
const f = n => readFileSync(new URL('../realworld/monschau.' + n, import.meta.url)), meta = JSON.parse(f('json')), q = inflateSync(f('dgm'));
const un = n => { const b = inflateSync(f(n)); return new Int16Array(b.buffer, b.byteOffset, b.byteLength/2); };
rwApply({ meta, q: new Uint16Array(q.buffer, q.byteOffset, q.byteLength/2), b16: un('bld'), t16: un('trees') });
const LB = (id, ecef, vel = [6.81, -0.05, 0.22], dir = [0.9994, 0.0115, 0.0323], up = [-0.0323, 0.0009, 0.9995], alive = true, asl = 315.51) =>
  `["KOPF",1,144.5,1,"test",1]\n["E",${id},"testklasse","WEST",[1000060.57,999979.42,${asl}],${JSON.stringify(ecef)},${JSON.stringify(vel)},${JSON.stringify(dir)},${JSON.stringify(up)},${alive},0,1]\n`;
const unitAt = (x, z, o = {}) => { const [lat, lon] = rwLatLon(x, z), g = D.disConvergence(lat, lon);
  return { id: 'u', base: 'kpz', force: 2, lat, lon, h: meta.hHome + (o.y ?? 0), hdg: g + (o.bearing ?? 0), pitch: 0, roll: 0, vn: o.vn || [0, 0, 0], dead: false, ...o.u }; };

test('DIS-Modus: eigene PDU (DIS 6, unsere Kennung, Ort, Höhe NHN + Quasigeoid, Zustand)', () => {
  rw.on = true;
  const s = { p: [100, 12, -200], v: [0, 0, -5], q: [0, 0, 0, 1], w: [0, 0.1, 0] }, cur = vbOwnFields(s, 'crashed'), d = D.disDecode(vbOwnPdu(cur, 10));
  const [lat, lon, h] = D.disFromEcef(...d.pos), [elat, elon] = rwLatLon(100, -200);
  assert.deepEqual([d.version, d.exercise, d.site, d.app, d.entity, d.marking, d.dra], [6, 1, 1, 200, 1, 'FPV1', 1]);
  near(lat, elat, 1e-7); near(lon, elon, 1e-7); near(h, meta.hHome + 12 + 47, 1e-3);
  assert.equal(D.disAppearanceRead(d.appearance).damage, 3, 'Absturz = zerstört');
  rw.on = false;
});

test('DIS-Modus: Lagebild lesen, mit DIS über die Entity-Nummer verbinden (Art, Seite aus DIS; Ort, Bewegung aus dem Lagebild)', () => {
  const ecef = D.disToEcef(50.35152, 16.64054, 358.9), lb = vbParseLagebild(LB(13, ecef) + 'Müll\n["E",kaputt\n');
  assert.equal(lb.head.time, 144.5); assert.equal(lb.units.length, 1);
  const dis = new Map([['1:10601:13', { site: 1, app: 10601, entity: 13, type: [1, 1, 78, 3, 10, 0, 0], force: 1, pos: D.disToEcef(50, 16, 100), ori: [0, 0, 0], vel: [0, 0, 0], appearance: 0 }],
    ['1:10601:2', { site: 1, app: 10601, entity: 2, type: [3, 1, 222, 11, 35, 0, 0], force: 2, pos: D.disToEcef(50.35259, 16.64423, 48.9), ori: D.disHprToEuler(50.35259, 16.64423, 1, 0, 0), vel: [0, 0, 0], appearance: 0 }]]);
  const u = vbUnitsGeo(dis, lb, { undulation: 44 }), box = u.find(x => x.src === 'beide'), per = u.find(x => x.src === 'dis');
  assert.deepEqual([box.base, box.force], ['tpz', 1]);
  near(box.lat, 50.35152, 1e-6); near(box.h, 315.51, 1e-9, 'Höhe ASL aus dem Lagebild'); near(box.hdg*R, 89.34, 0.05, 'Kurs aus vectorDir'); near(box.vn[1], 6.81, 1e-9);
  assert.deepEqual([per.base, per.force], ['person', 2]); near(per.hdg, 1, 1e-6); near(per.h, 48.9 - 44, 1e-3);
  const solo = vbUnitsGeo(new Map(), vbParseLagebild(LB(0, ecef, [0, 0, 0], [0, 1, 0], [0, 0, 1], false)), {})[0];
  assert.deepEqual([solo.base, solo.force, solo.dead, solo.src], ['other', 1, true, 'lagebild']);
  near(vbUnitsGeo(new Map(), vbParseLagebild(LB(0, ecef, [0, 0, 0], [0, 1, 0], [Math.sin(0.3), 0, Math.cos(0.3)])), {})[0].roll, 0.3, 1e-9, 'Rollen rechts');
});

test('DIS-Modus: Einheit -> Karte (Ort, Kurs mit Meridiankonvergenz, Tempo, Boden), Umkreis', () => {
  rw.on = true;
  const g = D.disConvergence(...rwLatLon(120, -250)), u = vbLocal(unitAt(120, -250, { vn: [10*Math.cos(g), 10*Math.sin(g), 0], y: 30 }));
  near(u.x, 120, 0.01); near(u.z, -250, 0.01); near(u.yaw, 0, 1e-9, 'Kurs'); near(u.y, 30, 1e-6); near(u.v[2], -10, 1e-9, 'Tempo Gitter-Nord');
  near(vbLocal(unitAt(0, 0, { bearing: Math.PI/2 })).yaw, -Math.PI/2, 1e-9, 'Osten');
  const L = vbTake([unitAt(50, 60, { y: 300 }), unitAt(10, 10, { y: 200, u: { base: 'ths' } }), unitAt(9000, 0)], [0, 0, 0]);
  assert.equal(L.length, 2, '9 km weg nicht im Umkreis');
  const land = vbPlace(L.find(x => x.base === 'kpz'), 0), heli = vbPlace(L.find(x => x.base === 'ths'), 0);
  near(land.y, groundH(land.x, land.z), 1e-9, 'auf dem Boden'); near(heli.y, 200, 1e-6, 'in der Luft');
  assert.equal(vbLabel(false), ''); rw.on = false;
});

test('DIS-Modus: Gesamtlauf Simulator <-> Brücke <-> VBS (Drohne gesendet, VBS-Panzer mit Lagebild auf der Karte), Suche nach der Brücke', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'vb-')), lb = join(dir, 'lagebild.txt');
  const vbs = createSocket('udp4'), got = [];
  vbs.on('message', m => got.push(D.disDecode(m)));
  await new Promise(r => vbs.bind(0, '127.0.0.1', r));
  const b = createBridge({ wsPort: 0, disPort: 0, disTarget: '127.0.0.1', disTargetPort: vbs.address().port, lbEvery: 50, lagebild: lb });
  let loop = null;
  t.after(() => { clearInterval(loop); vbClose(); b.close(); vbs.close(); rw.on = false; rmSync(dir, { recursive: true, force: true }); });
  await b.ready;
  VB.url = 'ws://127.0.0.1:' + b.wsPort;
  const probe = await new Promise(r => vbProbe(r)); assert.equal(probe, 'läuft', 'Brücke gefunden');
  rw.on = true;
  const s = { p: [100, 20, -150], v: [0, 0, 0], q: [0, 0, 0, 1], w: [0, 0, 0] };
  let tt = 0; loop = setInterval(() => { tt += 0.05; vbStep(tt, s, 'fly', true); }, 50);
  await wait(500);
  assert.equal(vb.state, 'verbunden'); assert.ok(got.length >= 1, 'Drohne gesendet');
  const [lat, lon] = D.disFromEcef(...got[0].pos), [elat, elon] = rwLatLon(100, -150); near(lat, elat, 1e-7); near(lon, elon, 1e-7);
  // VBS: Kampfpanzer (Entity 13) per DIS am falschen (eingefrorenen) Ort, das Lagebild meldet ihn an Kartenpunkt (50, -80)
  const pdu = D.disEncodeES({ version: 6, exercise: 1, site: 1, app: 10601, entity: 13, force: 2, type: [1, 1, 78, 1, 2, 0, 0], pos: D.disToEcef(50.3, 16.6, 300), ori: [0, 0, 0], appearance: 0, dra: 4 });
  const sock = createSocket('udp4'); await new Promise(r => sock.send(pdu, b.udpPort, '127.0.0.1', r)); sock.close();
  const [plat, plon] = rwLatLon(50, -80); writeFileSync(lb, LB(13, D.disToEcef(plat, plon, meta.hHome + 47), [5, 0, 0], [1, 0, 0], [0, 0, 1], true, meta.hHome));
  await wait(600);
  assert.equal(vb.units.length, 1, 'eine VBS-Einheit');
  const u = vb.units[0];
  assert.deepEqual([u.base, u.force], ['kpz', 2]);
  assert.ok(Math.hypot(u.x - 50, u.z + 80) < 3, 'Ort aus dem Lagebild: ' + u.x.toFixed(1) + ', ' + u.z.toFixed(1));
  near(u.y, groundH(u.x, u.z), 1e-6, 'auf unserem Boden');
  assert.equal(vbLabel(true), 'VBS 1');
  // Brücke weg: Suche meldet „nicht gefunden“
  clearInterval(loop); vbClose(); b.close(); await wait(100);
  assert.equal(await new Promise(r => vbProbe(r)), 'nicht gefunden');
});
