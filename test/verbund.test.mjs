// DIS-Modus im Simulator (src/verbund.js): eigene PDU, DIS-Einheiten, Karte, Ort der Übung, ebene Fläche, Gesamtlauf über die Brücke.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { createSocket } from 'node:dgram';
import { rw, rwApply, rwLatLon, groundH, rwFlat, rwFlatImage, rwPlan } from '../src/realworld.js';
import { VB, vb, vbOwnFields, vbOwnPdu, vbUnitsGeo, vbCenter, vbLocal, vbTake, vbPlace, vbStep, vbClose, vbBridge, vbLabel, vbSet, vbGun, vbAims, vbContact, vbDetonate, VB_CHARGE } from '../src/verbund.js';
import { createBridge } from '../tools/dis-bruecke.mjs';
import * as D from '../src/dis.js';

const R = 180/Math.PI, near = (a, b, e, m) => assert.ok(Math.abs(a - b) <= e, (m || '') + ': ' + a + ' statt ' + b);
const wait = ms => new Promise(r => setTimeout(r, ms));
const f = n => readFileSync(new URL('../realworld/monschau.' + n, import.meta.url)), meta = JSON.parse(f('json')), q = inflateSync(f('dgm'));
const un = n => { const b = inflateSync(f(n)); return new Int16Array(b.buffer, b.byteOffset, b.byteLength/2); };
const monschau = () => rwApply({ meta: JSON.parse(JSON.stringify(meta)), q: new Uint16Array(q.buffer, q.byteOffset, q.byteLength/2), b16: un('bld'), t16: un('trees') });
monschau();
const unitAt = (x, z, o = {}) => { const [lat, lon] = rwLatLon(x, z), g = D.disConvergence(lat, lon);
  return { id: 'u', base: 'kpz', force: 2, lat, lon, h: meta.hHome + (o.y ?? 0), hdg: g + (o.bearing ?? 0), pitch: 0, roll: 0, vn: o.vn || [0, 0, 0], dead: false, ...o.u }; };
const ent = (id, lat, lon, h, o = {}) => ({ site: 1, app: 10601, entity: id, type: o.type || [1, 1, 78, 1, 2, 0, 0], force: 2, pos: D.disToEcef(lat, lon, h),
  ori: D.disHprToEuler(lat, lon, 0, 0, 0), vel: o.vel || [0, 0, 0], appearance: o.appearance || 0, dra: o.dra ?? 4, t: o.t || 0 });

test('DIS-Modus: eigene PDU (DIS 6, unsere Kennung, Ort, Höhe NHN + Quasigeoid, Zustand)', () => {
  rw.on = true;
  const s = { p: [100, 12, -200], v: [0, 0, -5], q: [0, 0, 0, 1], w: [0, 0.1, 0] }, cur = vbOwnFields(s, 'crashed'), d = D.disDecode(vbOwnPdu(cur, 10));
  const [lat, lon, h] = D.disFromEcef(...d.pos), [elat, elon] = rwLatLon(100, -200);
  assert.deepEqual([d.version, d.exercise, d.site, d.app, d.entity, d.marking, d.dra], [6, 1, 1, 200, 1, 'FPV1', 1]);
  near(lat, elat, 1e-7); near(lon, elon, 1e-7); near(h, meta.hHome + 12 + 47, 1e-3);
  assert.equal(D.disAppearanceRead(d.appearance).damage, 3, 'Absturz = zerstört');
  rw.on = false;
});

test('DIS-Modus: Einheiten aus DIS (Art, Seite, Ort, Tempo), Platzhalter und Abgemeldete übergangen, Ort der Übung', () => {
  const E = D.disToEcef(50.352, 16.64, 0), up = E.map(v => v/Math.hypot(...E));
  const dis = new Map([
    ['a', ent(2, 50.35259, 16.64423, 350, { type: [3, 1, 222, 11, 35, 0, 0] })],
    ['b', ent(3, 50.3510, 16.6400, 347, { vel: up.map(v => v*2) })],
    ['c', ent(4, 50.3530, 16.6380, 351, { dra: 1, vel: [5, 5, 5] })],
    ['d', { ...ent(5, 0, 0, 0), pos: [0, 0, 0] }],
    ['e', ent(6, 50.36, 16.65, 349, { appearance: 1 << 23 })],
    ['f', ent(7, 50.3520, 16.6410, 900, { type: [1, 2, 78, 20, 1, 0, 0] })]]);
  const u = vbUnitsGeo(dis, { undulation: 44 });
  assert.deepEqual(u.map(x => x.id.split(':')[2]), ['2', '3', '4', '7'], 'ohne Platzhalter (0, 0, 0) und ohne Abgemeldete');
  const per = u[0]; assert.deepEqual([per.base, per.force], ['person', 2]); near(per.h, 350 - 44, 1e-3);
  near(u[1].vn[2], 2, 1e-4, 'steigt 2 m/s'); assert.deepEqual(u[2].vn, [0, 0, -0], 'statisch: kein Tempo');
  const c = vbCenter(dis, { undulation: 44 });
  assert.equal(c.n, 4); near(c.lat, 50.352295, 1e-6); near(c.lon, 16.6405, 1e-4);
  near(c.h, 350 - 44, 1e-3, 'Höhe aus den Einheiten am Boden (Median), nicht aus dem Luftfahrzeug');
  assert.equal(vbCenter(new Map()), null);
});

test('DIS-Modus: Platzhalter übergangen (mehrere auf demselben Punkt, Bodeneinheit weit unter den übrigen), Ort der Übung stimmt', () => {
  // wie D5 mit VBS: zwei Fahrzeuge am Gelände (hEll 357 bis 359), drei Personen auf exakt demselben Ankerpunkt mit hEll 48,9, eine Geisternummer allein dort
  const anchor = [50.352586, 16.644234, 48.9];
  const dis = new Map([['a', ent(1, 50.3510, 16.6390, 357)], ['b', ent(2, 50.3505, 16.6380, 359)],
    ['c', ent(3, ...anchor, { type: [3, 1, 222, 1, 0, 0, 0] })], ['d', ent(4, ...anchor, { type: [3, 1, 222, 1, 0, 0, 0] })], ['e', ent(5, ...anchor, { type: [3, 1, 222, 1, 0, 0, 0] })],
    ['f', ent(6, 50.35259, 16.64425, 48.9, { type: [3, 1, 222, 1, 0, 0, 0] })], ['g', ent(7, 50.352, 16.640, 900, { type: [1, 2, 78, 20, 1, 0, 0] })]]);
  const u = vbUnitsGeo(dis, { undulation: 44 });
  assert.deepEqual(u.map(x => x.id.split(':')[2]), ['1', '2', '7'], 'nur Fahrzeuge und Luftfahrzeug'); assert.equal(u.skipped, 4);
  const c = vbCenter(dis, { undulation: 44 });
  assert.equal(c.n, 3); assert.equal(c.skipped, 4); near(c.lat, 50.3510, 1e-6); near(c.h, 358 - 44, 1e-6, 'Höhe aus den Fahrzeugen');
  // eine einzelne Einheit: nichts zu vergleichen, bleibt
  assert.equal(vbUnitsGeo(new Map([['x', ent(9, ...anchor)]])).length, 1);
});

test('DIS-Modus: Weiterrechnen nach dem Verfahren der PDU (Kurve und Lage), Tempo-Grenze, Name und Zustand', () => {
  rw.on = true;
  try {
    const [la, lo] = rwLatLon(0, -100), N = D.disNedAxes(la, lo), east = N[1], down = N[2];
    // Fahrzeug nach Osten mit 10 m/s, dreht mit 0,2 rad/s um die Hochachse (Körperachsen: z nach unten), Verfahren 4
    const e = ent(21, la, lo, meta.hHome + 47, { vel: east.map(v => v*10), dra: 4 });
    e.ori = D.disHprToEuler(la, lo, Math.PI/2, 0, 0); e.angVel = [0, 0, 0.2]; e.accel = [0, 0, 0]; e.marking = 'ALPHA1'; e.appearance = 1 << 3;
    const u = vbTake(vbUnitsGeo(new Map([['a', e]])), [0, 0, -100])[0];
    assert.equal(u.mark, 'ALPHA1'); assert.ok(u.damaged && !u.dead, 'beschädigt');
    const y0 = u.yaw; vbPlace(u, 2);
    near(u.x, 20, 0.3, '2 s mit 10 m/s nach Osten'); near(u.y, groundH(u.x, u.z), 1e-9, 'auf dem Boden');
    near(Math.abs(u.yaw - y0), 0.4, 0.02, 'Lage dreht mit 0,2 rad/s');
    // Verfahren 2: kein Drehen
    const e2 = { ...e, dra: 2, angVel: [0, 0, 0.2] }, u2 = vbTake(vbUnitsGeo(new Map([['b', e2]])), [0, 0, -100])[0], y2 = u2.yaw; vbPlace(u2, 2); near(u2.yaw, y2, 1e-4, 'Verfahren 2 dreht nicht');
    // Tempo-Grenze: Bodenfahrzeug mit 1800 m/s (fällt ohne Gelände) übergangen, Flugzeug mit 600 m/s bleibt
    const fall = ent(22, la, lo, meta.hHome + 47, { vel: down.map(v => v*1800) }), jet = ent(23, la, lo, meta.hHome + 3000, { vel: east.map(v => v*600), type: [1, 2, 225, 1, 0, 0, 0] });
    const L = vbUnitsGeo(new Map([['f', fall], ['j', jet]]));
    assert.deepEqual(L.map(x => x.id.split(':')[2]), ['23']); assert.equal(L.skipped, 1);
  } finally { rw.on = false; }
});

test('DIS-Modus: Turm und Rohr aus den Parametern, Rohrrichtung, „zielt auf dich“', () => {
  rw.on = true;
  try {
    const [la, lo] = rwLatLon(0, -100), g = D.disConvergence(la, lo);
    // Panzer steht mit Kurs Gitter-Nord, Turm 90° nach rechts (Osten), Rohr 10° hoch
    const e = ent(31, la, lo, meta.hHome + 47, { dra: 1 }); e.ori = D.disHprToEuler(la, lo, g, 0, 0);
    e.art = D.disArticulation(D.disDecode(D.disEncodeES({ ...e, params: [{ type: D.DIS_ART.turretAz, value: Math.PI/2 }, { type: D.DIS_ART.gunEl, value: 10*Math.PI/180 }] })).params);
    const u = vbTake(vbUnitsGeo(new Map([['a', e]])), [0, 0, -100])[0]; vbPlace(u, 0);
    near(u.az, Math.PI/2, 1e-6); near(u.el, 0.1745, 1e-3);
    const G = vbGun(u);
    near(G.dir[0], Math.cos(0.1745), 1e-3, 'Rohr zeigt nach Osten (+x)'); near(G.dir[1], Math.sin(0.1745), 1e-3, 'und 10° hoch'); near(G.dir[2], 0, 1e-3);
    const me = [G.muzzle[0] + G.dir[0]*200, G.muzzle[1] + G.dir[1]*200, G.muzzle[2] + G.dir[2]*200];
    assert.ok(vbAims(u, me), 'zielt auf einen Punkt in Rohrrichtung'); assert.ok(!vbAims(u, [me[0], me[1] + 30, me[2]]), '30 m daneben: nein');
    // ohne Parameter: Grundstellung nach vorn (Norden = -z)
    const u0 = vbTake(vbUnitsGeo(new Map([['b', { ...e, art: null }]])), [0, 0, -100])[0]; vbPlace(u0, 0);
    near(vbGun(u0).dir[2], -1, 1e-3, 'Grundstellung vorn');
  } finally { rw.on = false; }
});

test('DIS-Modus: Treffer an der Drohne (Geschossweg, Detonation, leicht und schwer), Kontakt, eigene Detonation', async () => {
  rw.on = true;
  const net = createSocket('udp4'); await new Promise(r => net.bind(0, '127.0.0.1', r));
  const b = createBridge({ wsPort: 0, disPort: 0, disTarget: '127.0.0.1', disTargetPort: net.address().port }), got = [];
  net.on('message', m => got.push(D.disDecode(m)));
  let loop = null, tt = 100;
  const s = { p: [0, 30, -100], v: [0, 0, -12], q: [0, 0, 0, 1], w: [0, 0, 0] };
  try {
    await b.ready; VB.url = 'ws://127.0.0.1:' + b.wsPort; VB.port = b.udpPort; vb.tTry = vb.tBuild = -1e9; vb.hits = [];
    loop = setInterval(() => { tt += 0.05; vbStep(tt, s, 'fly', true, true); }, 50);
    await wait(400);
    const ecef = (x, y, z) => { const [la, lo] = rwLatLon(x, z); return D.disToEcef(la, lo, meta.hHome + y + 47); };
    const send = async pdu => { const k = createSocket('udp4'); await new Promise(r => k.send(pdu, b.udpPort, '127.0.0.1', r)); k.close(); };
    const shooter = { site: 1, app: 9, entity: 5 }, aim = (from, to, sp) => { const a = ecef(...from), b = ecef(...to), d = b.map((x, i) => x - a[i]), n = Math.hypot(...d); return d.map(x => x/n*sp); };
    // Panzergeschoss von 300 m südlich genau auf die Drohne (nach Norden, 30 m hoch): schwer
    await send(D.disEncodeFire({ exercise: 1, shooter, event: { site: 1, app: 9, entity: 1 }, pos: ecef(0, 30, 200), vel: aim([0, 30, 200], [0, 30, -100], 1100), burst: { type: [2, 2, 225, 2, 10, 6, 0] } }));
    // Gewehrschuss 5 m daneben: kein Treffer; Gewehr genau drauf: leicht
    await send(D.disEncodeFire({ exercise: 1, shooter, event: { site: 1, app: 9, entity: 2 }, pos: ecef(5, 30, 200), vel: aim([5, 30, 200], [5, 30, -100], 900), burst: { type: [2, 9, 225, 2, 81, 1, 0] } }));
    await send(D.disEncodeFire({ exercise: 1, shooter, event: { site: 1, app: 9, entity: 3 }, pos: ecef(0, 30.3, 200), vel: aim([0, 30.3, 200], [0, 30.3, -100], 900), burst: { type: [2, 9, 225, 2, 81, 1, 0] } }));
    await wait(300); assert.deepEqual(vb.hits.map(h => h.kind + (h.heavy ? ' schwer' : ' leicht')), ['fire schwer', 'fire leicht'], 'Geschossweg: Panzer schwer, Gewehr 5 m daneben nichts, Gewehr drauf leicht');
    // Detonation desselben Ereignisses 1 an der Drohne: zählt nicht doppelt; Panzer-Detonation 3,5 m entfernt: leicht
    await send(D.disEncodeDetonation({ exercise: 1, shooter, event: { site: 1, app: 9, entity: 1 }, pos: ecef(0, 30, -100), burst: { type: [2, 2, 225, 2, 10, 6, 0] }, result: 1 }));
    await send(D.disEncodeDetonation({ exercise: 1, shooter, event: { site: 1, app: 9, entity: 4 }, pos: ecef(3.5, 30, -100), burst: { type: [2, 2, 225, 2, 10, 6, 0] }, result: 3 }));
    await wait(300);
    assert.deepEqual(vb.hits.map(h => h.heavy), [true, false, false], 'dazu Explosion 3,5 m: leicht');
    // eigene Detonation an einer Einheit: PDU mit unserer Kennung, Ziel, Munition, Ergebnis 1; Herzschlag bleibt Lagemeldung
    const u = { id: '1:9:7', base: 'kpz', force: 2, x: 10, y: 0, z: -100, yaw: 0, pitch: 0, roll: 0 };
    clearInterval(loop); vb.units = [u]; assert.equal(vbContact([10, 1.5, -97]), u, 'im Kasten'); assert.equal(vbContact([10, 1.5, -94]), null, 'davor');
    got.length = 0; vbDetonate([10, 1.5, -97], u, [0, 0, -12]); await wait(300);
    const d = got.find(p => p.pduType === 3);
    assert.deepEqual([d.shooter.site, d.shooter.app, d.target.entity, d.result], [1, 200, 7, 1]); assert.deepEqual(d.burst.type, VB_CHARGE.type);
    const [dl, dlo] = D.disFromEcef(...d.pos), [el, elo] = rwLatLon(10, -97); near(dl, el, 1e-7); near(dlo, elo, 1e-7);
    assert.ok(vb.fx.some(f => f.kind === 'det' && f.from === 'eigen'), 'Explosion im Bild');
  } finally { clearInterval(loop); vbClose(); b.close(); net.close(); vb.tTry = vb.tBuild = -1e9; vb.seen = 'suche'; VB.port = 3000; rw.on = false; }
});

test('DIS-Modus: Übung oder Port wechseln leert die Liste; Einheiten behalten bis zur Abmeldung (Schalter)', () => {
  rw.on = true;
  const s = { p: [0, 0, 0], v: [0, 0, 0], q: [0, 0, 0, 1], w: [0, 0, 0] }, [la, lo] = rwLatLon(10, 10);
  try {
    vb.dis.set('k', ent(13, la, lo, meta.hHome + 47, { t: 0 }));
    vbSet({ exercise: 2 }); assert.equal(vb.dis.size, 0, 'andere Übung: Liste leer'); vbSet({ exercise: 1 });
    vb.dis.set('k', ent(13, la, lo, meta.hHome + 47, { t: 0 })); vbSet({ port: 3001 }); assert.equal(vb.dis.size, 0, 'anderer Port: Liste leer'); vbSet({ port: 3000 });
    // Aufbau der Einheiten in vbStep (Verbindung geht ins Leere, Port 9)
    VB.url = 'ws://127.0.0.1:9';
    const step = t => { vb.tBuild = -1e9; vbStep(t, s, 'fly', true, false); return vb.units.length; };
    vb.dis.set('k', ent(13, la, lo, meta.hHome + 47, { t: 0 })); vbSet({ keep: true });
    assert.equal(step(60), 1, 'nach 60 s ohne Meldung noch da');
    vbSet({ keep: false }); assert.equal(step(61), 0, 'ohne Schalter nach 13 s weg');
  } finally { vbSet({ keep: false }); vbClose(); vb.tTry = vb.tBuild = -1e9; vb.seen = 'suche'; rw.on = false; }
});

test('DIS-Modus: Einheit -> Karte (Ort, Kurs mit Meridiankonvergenz, Tempo, Boden), Umkreis, Weiterschieben ab Empfang', () => {
  rw.on = true;
  const g = D.disConvergence(...rwLatLon(120, -250)), u = vbLocal(unitAt(120, -250, { vn: [10*Math.cos(g), 10*Math.sin(g), 0], y: 30, u: { t: 4 } }));
  near(u.x, 120, 0.01); near(u.z, -250, 0.01); near(u.yaw, 0, 1e-9, 'Kurs'); near(u.y, 30, 1e-6); near(u.v[2], -10, 1e-9, 'Tempo Gitter-Nord'); assert.equal(u.t0, 4);
  near(vbLocal(unitAt(0, 0, { bearing: Math.PI/2 })).yaw, -Math.PI/2, 1e-9, 'Osten');
  const L = vbTake([unitAt(50, 60, { y: 300, vn: [0, 3, 0] }), unitAt(10, 10, { y: 200, u: { base: 'ths' } }), unitAt(9000, 0)], [0, 0, 0]);
  assert.equal(L.length, 2, '9 km weg nicht im Umkreis');
  const land = vbPlace(L.find(x => x.base === 'kpz'), 2), heli = vbPlace(L.find(x => x.base === 'ths'), 0);
  near(land.x, 56, 0.01, '2 s mit 3 m/s nach Osten (Gitter um 2° gedreht)'); near(land.y, groundH(land.x, land.z), 1e-9, 'auf dem Boden'); near(heli.y, 200, 1e-6, 'in der Luft');
  near(vbPlace(land, 99).x, 50 + 3*VB.timeout, 0.05, 'höchstens bis zum Löschen');
  assert.equal(vbLabel(false), ''); rw.on = false;
});

test('DIS-Modus: Ort ohne Kartendaten (ebene Fläche, UTM-Zone nach der Länge, Grasbild), eigene Drohne dort', () => {
  assert.equal(rwPlan(50.352, 16.64), null, 'keine Quelle bei 16,6° Ost');
  rwFlat(50.352, 16.64, 303.5);
  try {
    rw.on = true;
    assert.equal(rw.meta.crs, 'EPSG:25833'); assert.ok(rw.meta.flat); assert.equal(rw.size, 4000);
    const [lat, lon] = rwLatLon(0, 0); near(lat, 50.352, 1e-7); near(lon, 16.64, 1e-7);
    near(groundH(0, 0), 0, 1e-9); near(groundH(1500, -1900), 0, 1e-9); near(groundH(9000, 9000), 0, 1e-9, 'außen eben');
    assert.equal(rw.trees.length, 0); assert.equal(rw.meta.home.join(), '0,0');
    const img = rwFlatImage(8); assert.equal(String.fromCharCode(img[0], img[1]), 'BM'); assert.equal(img.length, 54 + 8*8*3);
    assert.equal(rw.dop.length, 54 + 256*256*3);
    const d = D.disDecode(vbOwnPdu(vbOwnFields({ p: [0, 2, 0], v: [0, 0, 0], q: [0, 0, 0, 1], w: [0, 0, 0] }), 1)), [la, lo, h] = D.disFromEcef(...d.pos);
    near(la, 50.352, 1e-7); near(lo, 16.64, 1e-7); near(h, 303.5 + 2 + VB.undulation, 1e-3, 'Höhe passt zu den Einheiten');
  } finally { rw.on = false; monschau(); }
});

test('DIS-Modus: Gesamtlauf Simulator <-> Brücke <-> DIS-Netz (Drohne gesendet, Panzer auf der Karte, Port, Übung, Brücke weg)', async t => {
  const net = createSocket('udp4'), got = [];
  net.on('message', m => got.push(D.disDecode(m)));
  await new Promise(r => net.bind(0, '127.0.0.1', r));
  const b = createBridge({ wsPort: 0, disPort: 0, disTarget: '127.0.0.1', disTargetPort: net.address().port });
  let loop = null;
  const s = { p: [100, 20, -150], v: [0, 0, 0], q: [0, 0, 0, 1], w: [0, 0, 0] };
  let tt = 0, send = false;
  const run = () => { clearInterval(loop); loop = setInterval(() => { tt += 0.05; vbStep(tt, s, 'fly', true, send); }, 50); };
  t.after(() => { clearInterval(loop); vbClose(); b.close(); net.close(); rw.on = false; VB.port = 3000; VB.exercise = 1; });
  await b.ready;
  VB.url = 'ws://127.0.0.1:' + b.wsPort; VB.port = b.udpPort;
  // im Menü: verbinden, aber noch nichts senden
  run(); await wait(400);
  assert.equal(vbBridge(), 'läuft', 'Brücke gefunden'); assert.equal(got.length, 0, 'im Menü nichts gesendet');
  rw.on = true; send = true; await wait(400);
  assert.equal(vb.state, 'verbunden'); assert.ok(got.length >= 1, 'Drohne gesendet');
  const [lat, lon] = D.disFromEcef(...got[0].pos), [elat, elon] = rwLatLon(100, -150); near(lat, elat, 1e-7); near(lon, elon, 1e-7);
  // Partner: Kampfpanzer (Entity 13) an Kartenpunkt (50, -80), fährt 5 m/s nach Osten; Übung 2 wird übergangen
  const [plat, plon] = rwLatLon(50, -80), g = D.disConvergence(plat, plon), P = D.disToEcef(plat, plon, meta.hHome + 47);
  const east = [-Math.sin(plon/R), Math.cos(plon/R), 0];
  const pdu = (ex, id) => D.disEncodeES({ version: 6, exercise: ex, site: 1, app: 10601, entity: id, force: 2, type: [1, 1, 78, 1, 2, 0, 0], pos: P, vel: east.map(v => v*5), ori: D.disHprToEuler(plat, plon, Math.PI/2, 0, 0), appearance: 0, dra: 4 });
  const sock = createSocket('udp4');
  await new Promise(r => sock.send(pdu(1, 13), b.udpPort, '127.0.0.1', r)); await new Promise(r => sock.send(pdu(2, 14), b.udpPort, '127.0.0.1', r)); sock.close();
  await wait(400);
  assert.equal(vb.units.length, 1, 'eine Einheit (nur Übung 1) ' + JSON.stringify({ n: vb.dis.size, st: vb.state, keep: VB.keep, t: [...vb.dis.values()].map(e => [e.t, e.exercise]), tt }));
  const u = vb.units[0];
  assert.deepEqual([u.base, u.force], ['kpz', 2]);
  const dt = tt - u.t0, ex = 50 + 5*Math.cos(g)*dt;
  assert.ok(dt > 0.2 && Math.abs(u.x - ex) < 0.6 && Math.abs(u.z + 80) < 2, 'weitergeschoben: ' + u.x.toFixed(2) + ' statt ' + ex.toFixed(2) + ', ' + u.z.toFixed(2));
  near(u.y, groundH(u.x, u.z), 1e-6, 'auf unserem Boden');
  assert.equal(vbLabel(true), 'DIS 1');
  // Schuss und Einschlag des Panzers: Effekte an der richtigen Stelle, Schütze markiert
  const [fl, fo] = rwLatLon(60, -80), shot = createSocket('udp4');
  await new Promise(r => shot.send(D.disEncodeFire({ exercise: 1, shooter: { site: 1, app: 10601, entity: 13 }, pos: D.disToEcef(fl, fo, meta.hHome + 47 + 2), vel: east.map(x => x*900), range: 1000 }), b.udpPort, '127.0.0.1', r));
  await new Promise(r => shot.send(D.disEncodeDetonation({ exercise: 1, shooter: { site: 1, app: 10601, entity: 13 }, pos: D.disToEcef(...rwLatLon(160, -80), meta.hHome + 47), result: 5 }), b.udpPort, '127.0.0.1', r));
  shot.close(); await wait(300);
  const fire = vb.fx.find(f => f.kind === 'fire'), det = vb.fx.find(f => f.kind === 'det');
  assert.ok(fire && Math.hypot(fire.x - 60, fire.z + 80) < 1 && fire.v[0] > 800, 'Schuss mit Leuchtspur nach Osten'); assert.ok(det && Math.hypot(det.x - 160, det.z + 80) < 1, 'Einschlag');
  assert.ok(tt - vb.units[0].fireT < 1, 'Panzer schießt');
  const c = vbCenter(); near(c.lat, plat, 1e-7); near(c.h, meta.hHome, 1e-3);
  // Brücke weg: „nicht gefunden“
  b.close(); await wait(300);
  assert.equal(vbBridge(), 'nicht gefunden'); assert.equal(vbLabel(true), 'DIS --');
});
