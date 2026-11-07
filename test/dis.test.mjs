// Etappe D1: DIS-Kodierer (Erdkoordinaten, Lage, Entity State PDU, Erscheinungsbild, Vorhersage, Senderegel, Simulator)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/dis.js';
import { toUtm } from '../src/geo.js';
import { qAxis } from '../src/math.js';

const R = 180/Math.PI, near = (a, b, e, m) => assert.ok(Math.abs(a - b) <= e, (m || '') + ': ' + a + ' statt ' + b);
const rnd = (() => { let s = 7; return () => (s = (s*16807) % 2147483647)/2147483647; })();

test('D1: WGS84 <-> ECEF (Äquator, Pol, Hin und zurück unter 1 mm)', () => {
  assert.deepEqual(D.disToEcef(0, 0, 0), [6378137, 0, 0]);
  near(D.disToEcef(90, 0, 0)[2], 6356752.314, 0.001, 'Pol');
  for (let i = 0; i < 200; i++) {
    const lat = -89 + 178*rnd(), lon = -180 + 360*rnd(), h = -100 + 9000*rnd(), b = D.disFromEcef(...D.disToEcef(lat, lon, h));
    near(b[0], lat, 1e-8); near(b[1], lon, 1e-8); near(b[2], h, 1e-3);
  }
});

test('D1: Lage Kurs/Nicken/Rollen <-> DIS-Winkel (Norm-Beispiel, Formel aus open-dis, Hin und zurück)', () => {
  // Äquator, Länge 0, Nase nach Norden, waagrecht: psi 0, theta -90°, phi 0 (bekanntes Beispiel der DIS-Konvention)
  const e = D.disHprToEuler(0, 0, 0, 0, 0);
  near(e[0]*R, 0, 1e-9); near(e[1]*R, -90, 1e-9); near(e[2]*R, 0, 1e-9);
  for (let i = 0; i < 200; i++) {
    const lat = -80 + 160*rnd(), lon = -180 + 360*rnd(), h = 2*Math.PI*rnd(), p = -1.4 + 2.8*rnd(), r = -3 + 6*rnd();
    const E = D.disHprToEuler(lat, lon, h, p, r);
    // unabhängig: theta nach open-dis (EulerConversions): asin(-cosLat cosYaw cosPitch - sinLat sinPitch)
    near(E[1], Math.asin(-Math.cos(lat/R)*Math.cos(h)*Math.cos(p) - Math.sin(lat/R)*Math.sin(p)), 1e-9, 'theta');
    const back = D.disEulerToHpr(lat, lon, ...E);
    near(D.disAngleBetween(back, [h, p, r]), 0, 1e-6, 'zurück (acos nahe 1: Genauigkeit etwa 1e-8 rad)');
  }
});

test('D1: Meridiankonvergenz gleich der UTM-Umrechnung (geo.toUtm)', () => {
  for (const [lat, lon] of [[50.5553, 6.2428], [51.5, 7.5], [52.3, 9.0], [50.9, 6.96]]) {
    const a = toUtm(lat, lon), b = toUtm(lat + 1e-4, lon), grid = Math.atan2(b[0] - a[0], b[1] - a[1]);   // Gitterrichtung von geografisch Nord
    near(D.disConvergence(lat, lon), -grid, 2e-6, lat + ',' + lon);
  }
  near(D.disConvergence(50.5553, 6.2428)*R, -2.13, 0.02, 'Monschau etwa -2,1°');
});

test('D1: Entity State PDU 144 Byte, Felder an der richtigen Stelle, Lesen gibt dasselbe zurück (DIS 6 und 7)', () => {
  const st = D.disState('fly');
  const e = { ...D.DIS_FPV, pos: D.disToEcef(50.5553, 6.2428, 1047), vel: [1.5, -2, 3.25], ori: [0.1, -0.2, 0.3], accel: [0, 0.5, -1], angVel: [0.25, 0, -0.5], timestamp: D.disTimestamp(1800000), ...st };
  const b = D.disEncodeES(e);
  assert.equal(b.length, 144);
  assert.deepEqual([b[0], b[1], b[2], b[3], b[8], b[9]], [6, 1, 1, 1, 0, 144], 'Version 6, Übung 1, Entity State, Familie 1, Länge 144');
  assert.deepEqual([...b.slice(20, 28)], [1, 2, 0, 78, 50, 7, 0, 0], 'Entity Type 1.2.78.50.7.0.0 (Land als 16 Bit)');
  assert.equal(String.fromCharCode(...b.slice(129, 133)), 'FPV1'); assert.equal(b[128], 1, 'ASCII');
  const d = D.disDecode(b);
  assert.deepEqual([d.site, d.app, d.entity, d.force, d.dra], [1, 200, 1, 1, 4]);
  assert.deepEqual(d.type, D.DIS_FPV.type); assert.deepEqual(d.pos, e.pos); assert.equal(d.marking, 'FPV1');
  d.vel.forEach((x, i) => near(x, e.vel[i], 1e-6)); d.ori.forEach((x, i) => near(x, e.ori[i], 1e-6)); d.angVel.forEach((x, i) => near(x, e.angVel[i], 1e-6));
  assert.equal(d.appearance, st.appearance);
  near(d.timestamp/2/2147483648*3600, 1800, 0.01, 'Zeitstempel halbe Stunde');
  const d7 = D.disDecode(D.disEncodeES({ ...e, version: 7, status: 4 }));
  assert.deepEqual([d7.version, d7.status], [7, 4]);
  assert.equal(D.disDecode(new Uint8Array(10)), null, 'zu kurz');
  const fire = new Uint8Array(96); fire[0] = 6; fire[2] = 2; assert.equal(D.disDecode(fire).pduType, 2, 'andere PDU: nur der Kopf');
});

test('D1: Erscheinungsbild und Zustände (Absturz zerstört, eingefroren, aus)', () => {
  const o = { propKilled: true, damage: 3, smoke: true, flames: false, frozen: true, powerOn: false, off: true };
  assert.deepEqual(D.disAppearanceRead(D.disAppearance(o)), o);
  assert.equal(D.disAppearance({ damage: 3 }), 0b11000, 'Schaden in Bit 3-4');
  assert.equal(D.disAppearance({ frozen: true }), 1 << 21);
  const c = D.disState('crashed'), f = D.disState('frozen');
  assert.ok(D.disAppearanceRead(c.appearance).damage === 3 && c.dra === 1);
  assert.ok(D.disAppearanceRead(f.appearance).frozen && f.dra === 1);
  assert.equal(D.disState('fly').dra, 4);
});

test('D1: Vorhersage (Static, FPW, RVW mit Beschleunigung und Drehung) und Senderegel (1 m, 3°, 5 s, Zustand)', () => {
  const pos = D.disToEcef(50.5553, 6.2428, 600), ori = D.disHprToEuler(50.5553, 6.2428, 0, 0, 0);
  const e = { pos, ori, vel: [2, 0, 0], accel: [0, 0, 1], angVel: [0, 0, 0.5], dra: D.DIS_DR.fpw };
  assert.deepEqual(D.disDeadReckon({ ...e, dra: 1 }, 3).pos, pos, 'Static bleibt');
  near(D.disDeadReckon(e, 2).pos[0] - pos[0], 4, 1e-9, 'FPW: 2 m/s × 2 s');
  const r = D.disDeadReckon({ ...e, dra: D.DIS_DR.rvw }, 2);
  near(r.pos[2] - pos[2], 2, 1e-9, 'RVW: ½ × 1 m/s² × 4 s²');
  // 0,5 rad/s um die Hochachse (Körper z unten, also nach rechts) über 1 s: Kurs 0,5 rad
  near(D.disEulerToHpr(50.5553, 6.2428, ...D.disDeadReckon({ ...e, dra: D.DIS_DR.rvw }, 1).ori)[0], 0.5, 1e-9, 'Kurs nach Drehung');
  // Senderegel
  const st = D.disState('fly'), last = { ...e, dra: 4, appearance: st.appearance, tSent: 10 };
  assert.equal(D.disNeedSend(null, {}, 0), true, 'erstes Mal');
  const pred = D.disDeadReckon(last, 1);
  assert.equal(D.disNeedSend(last, { ...pred, pos: pred.pos.map((x, i) => x + (i === 0 ? 0.5 : 0)), appearance: st.appearance, dra: 4 }, 11), false, '0,5 m daneben: nicht senden');
  assert.equal(D.disNeedSend(last, { ...pred, pos: pred.pos.map((x, i) => x + (i === 0 ? 1.2 : 0)), appearance: st.appearance, dra: 4 }, 11), true, '1,2 m daneben');
  const turned = D.disHprToEuler(50.5553, 6.2428, ...D.disEulerToHpr(50.5553, 6.2428, ...pred.ori).map((x, i) => x + (i === 0 ? 4/R : 0)));
  assert.equal(D.disNeedSend(last, { pos: pred.pos, ori: turned, appearance: st.appearance, dra: 4 }, 11), true, '4° gedreht');
  assert.equal(D.disNeedSend(last, { ...D.disDeadReckon(last, 5), appearance: st.appearance, dra: 4 }, 15), true, 'Herzschlag 5 s');
  assert.equal(D.disNeedSend(last, { ...pred, appearance: D.disState('crashed').appearance, dra: 1 }, 11), true, 'Absturz sofort');
});

test('D1: Aus dem Simulator (Karte im UTM-Gitter, Quaternion, Drehraten) in DIS-Felder', () => {
  const ref = { lat: 50.5553, lon: 6.2428, zone: 32, hNhn: 500, undulation: 47 }, g = D.disConvergence(ref.lat, ref.lon);
  // Nase nach Gitter-Nord (-z), waagrecht: geografischer Kurs = Konvergenz (etwa -2,1°)
  let f = D.disFromSim({ p: [0, 0, 0], q: [0, 0, 0, 1], v: [0, 0, -10], w: [0, 0.5, 0] }, ref);
  let hpr = D.disEulerToHpr(ref.lat, ref.lon, ...f.ori);
  near(hpr[0], g, 1e-9, 'Kurs'); near(hpr[1], 0, 1e-9, 'Nicken'); near(hpr[2], 0, 1e-9, 'Rollen');
  near(D.disFromEcef(...f.pos)[2], 547, 1e-3, 'Höhe NHN + Quasigeoid');
  const vn = D.disEcefToNed(ref.lat, ref.lon, f.vel);
  near(vn[0], 10*Math.cos(g), 1e-9); near(vn[1], 10*Math.sin(g), 1e-9); near(vn[2], 0, 1e-9);
  assert.deepEqual(f.angVel.map(x => x + 0), [0, 0, -0.5], 'Gieren links: Körper-z (unten) negativ');
  // Nase 20° hoch, dann 30° nach rechts gerollt
  const q = (a, b) => [a[3]*b[0] + a[0]*b[3] + a[1]*b[2] - a[2]*b[1], a[3]*b[1] - a[0]*b[2] + a[1]*b[3] + a[2]*b[0], a[3]*b[2] + a[0]*b[1] - a[1]*b[0] + a[2]*b[3], a[3]*b[3] - a[0]*b[0] - a[1]*b[1] - a[2]*b[2]];
  f = D.disFromSim({ p: [0, 0, 0], q: q(qAxis([1, 0, 0], 20/R), qAxis([0, 0, 1], -30/R)) }, ref);
  hpr = D.disEulerToHpr(ref.lat, ref.lon, ...f.ori);
  near(hpr[1]*R, 20, 1e-6, 'Nicken 20°'); near(hpr[2]*R, 30, 1e-6, 'Rollen 30° rechts');
});
