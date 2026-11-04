// Luftziele (J1): Flugverhalten nach realen Eigenschaften, verkleinert auf die Karte; Treffer und Punkte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aircraft, initAircraft, stepAircraft, AIR_KIND } from '../src/aircraft.js';

const H = 1/240, deg = r => r*180/Math.PI;
function fly(sec, onStep) { for (let i = 0; i < sec/H; i++) { const prev = aircraft.map(t => ({ p: t.p.slice(), v: t.v.slice(), yaw: t.yaw })); stepAircraft(H, [0, -99, 0], [0, -99, 0]); onStep && onStep(prev); } }

test('Starrflügler: nie schweben, Tempo fast gleich, Schräglage höchstens 35°, Kurvenradius über 25 m', () => {
  initAircraft(1);
  const planes = aircraft.filter(t => t.kind === 'plane');
  let vmin = 99, vmax = 0, bankMax = 0, rmin = 1e9;
  fly(2);   // einschwingen
  fly(120, prev => planes.forEach(t => {
    const i = aircraft.indexOf(t), v = Math.hypot(t.v[0], t.v[2]);
    vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); bankMax = Math.max(bankMax, Math.abs(t.bank));
    const pv = prev[i].v, dyaw = Math.atan2(t.v[0], t.v[2]) - Math.atan2(pv[0], pv[2]);
    const w = Math.abs(((dyaw + Math.PI*3) % (Math.PI*2)) - Math.PI)/H;
    if (w > 1e-3) rmin = Math.min(rmin, v/w);
  }));
  assert.ok(vmin > 11 && vmax < 16, 'Tempo ' + vmin.toFixed(1) + ' bis ' + vmax.toFixed(1) + ' m/s');
  assert.ok(deg(bankMax) <= 35.5 && deg(bankMax) > 15, 'Schräglage bis ' + deg(bankMax).toFixed(0) + '°');
  assert.ok(rmin > 25, 'kleinster Kurvenradius ' + rmin.toFixed(1) + ' m');
});

test('Hubschrauber und Sechs-Rotor: Höchsttempo, Beschleunigung, Drehrate, Schweben am Wegpunkt', () => {
  initAircraft(1);
  const stat = {};
  for (const k of ['heli', 'hexa']) stat[k] = { v: 0, a: 0, yaw: 0, hoverMax: 0 };
  const hover = aircraft.map(() => 0);   // Schwebezeit je Luftfahrzeug (nicht je Art: sonst setzt das andere den Zähler zurück)
  fly(120, prev => aircraft.forEach((t, i) => {
    if (t.kind === 'plane') return;
    const s = stat[t.kind], v = Math.hypot(...t.v), a = Math.hypot(...t.v.map((x, j) => x - prev[i].v[j]))/H;
    s.v = Math.max(s.v, v); s.a = Math.max(s.a, a);
    let dy = Math.abs(((t.yaw - prev[i].yaw + Math.PI*3) % (Math.PI*2)) - Math.PI)/H; s.yaw = Math.max(s.yaw, deg(dy));
    if (v < 0.3) { hover[i] += H; s.hoverMax = Math.max(s.hoverMax, hover[i]); } else hover[i] = 0;
  }));
  for (const k of ['heli', 'hexa']) {
    const K = AIR_KIND[k], s = stat[k];
    assert.ok(s.v <= K.vmax + 0.05 && s.v > K.vmax*0.6, k + ' Höchsttempo ' + s.v.toFixed(1));
    assert.ok(s.a <= K.amax + 0.05, k + ' Beschleunigung ' + s.a.toFixed(2));
    assert.ok(s.yaw <= K.yawRate + 1, k + ' Drehrate ' + s.yaw.toFixed(0) + '°/s');
    assert.ok(s.hoverMax >= K.hold*0.8, k + ' schwebt am Wegpunkt ' + s.hoverMax.toFixed(1) + ' s');
  }
});

test('Alle Luftziele bleiben über den Hindernissen (über 15,5 m)', () => {
  initAircraft(1);
  let low = 99;
  fly(120, () => { for (const t of aircraft) low = Math.min(low, t.p[1]); });
  assert.ok(low > 15.5, 'niedrigster Punkt ' + low.toFixed(1) + ' m');
});

test('Treffer geben Punkte je Art; mit Ballons zählt nur der Ballon', () => {
  initAircraft(1); fly(1);
  const plane = aircraft.find(t => t.kind === 'plane'), hexa = aircraft.find(t => t.kind === 'hexa');
  assert.equal(stepAircraft(H, [hexa.p[0] - 2, hexa.p[1], hexa.p[2]], [hexa.p[0] + 2, hexa.p[1], hexa.p[2]]), 1, 'Sechs-Rotor 1 Punkt');
  const pp = plane.p.slice();
  assert.equal(stepAircraft(H, [pp[0], pp[1] - 2, pp[2]], [pp[0], pp[1] + 2, pp[2]]), 3, 'Starrflügler 3 Punkte');
  initAircraft(1); fly(2);
  const heli = aircraft.find(t => t.kind === 'heli'), hp = heli.p.slice();
  assert.equal(stepAircraft(H, [hp[0] - 2, hp[1], hp[2]], [hp[0] + 2, hp[1], hp[2]], true), 0, 'Ballon-Modus: Rumpf zählt nicht');
  const bp = heli.bal.p.slice();
  assert.equal(stepAircraft(H, [bp[0] - 2, bp[1], bp[2]], [bp[0] + 2, bp[1], bp[2]], true), 2, 'Ballon getroffen: 2 Punkte');
});
