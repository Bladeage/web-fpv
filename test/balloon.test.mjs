// Ballon-Modus (Stufe „Leicht“): Ballon schwebt über dem Ziel, wird hinterhergezogen, platzt beim Treffer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BALLOON, newBalloon, stepBalloon, popBalloon } from '../src/balloon.js';
import { targets, initTargets, stepTargets } from '../src/targets.js';
import { vehicles, initVehicles, stepVehicles } from '../src/vehicles.js';

const H = 1/240;
test('Ballon schwebt an gespannter Leine über dem festen Punkt', () => {
  const b = newBalloon([0, 1, 0]);
  for (let i = 0; i < 480; i++) stepBalloon(b, [0, 1, 0], H);
  assert.ok(Math.abs(b.p[1] - (1 + BALLOON.line)) < 0.05 && Math.abs(b.p[0]) < 0.01, 'senkrecht darüber ' + b.p);
});
test('Ballon wird hinter einem fliegenden Ziel hergezogen', () => {
  const b = newBalloon([0, 10, 0]); let a = [0, 10, 0];
  for (let i = 0; i < 480; i++) { a = [a[0] + 10*H, 10, 0]; stepBalloon(b, a, H); }   // Ziel fliegt 10 m/s nach +x
  const d = [b.p[0] - a[0], b.p[1] - a[1]];
  assert.ok(d[0] < -0.5 && d[1] > 0.5, 'hinten und oben: ' + d.map(x => x.toFixed(2)));
  assert.ok(Math.hypot(...d) <= BALLOON.line + 1e-6, 'Leine höchstens ' + BALLOON.line + ' m');
});
test('Ballon platzt nur bei Treffer, nur einmal', () => {
  const b = newBalloon([0, 0, 0]);
  assert.equal(popBalloon(b, [5, 3, 0], [3, 3, 0], 0.15), false, 'vorbei');
  assert.equal(popBalloon(b, [-1, 3.2, 0], [1, 3.2, 0], 0.15), true, 'durch den Ballon');
  assert.equal(popBalloon(b, [-1, 3.2, 0], [1, 3.2, 0], 0.15), false, 'schon geplatzt');
});
test('Jagd Luft mit Ballons: nur der Ballon zählt, das Ziel stürzt dann ab', () => {
  initTargets(0.7);
  const t = targets.find(x => x.beh === 'static');
  for (let i = 0; i < 480; i++) stepTargets(H, [0, -50, 0], [0, -50, 0], [0, -50, 0], true);
  assert.equal(stepTargets(H, [t.p[0] - 1, t.p[1], t.p[2]], [t.p[0] + 1, t.p[1], t.p[2]], t.p, true), 0, 'Ziel selbst zählt nicht');
  const bp = t.bal.p;
  assert.equal(stepTargets(H, [bp[0] - 1, bp[1], bp[2]], [bp[0] + 1, bp[1], bp[2]], bp, true), 1, 'Ballon getroffen');
  assert.equal(t.state, 'fall');
});
test('Jagd Boden mit Ballons: Ballon über dem Fahrzeug, Treffer hält das Fahrzeug an', () => {
  initVehicles(0.7);
  const v = vehicles[0];
  for (let i = 0; i < 240; i++) stepVehicles(H, [0, -50, 0], [0, -50, 0], 0.15, true);
  assert.ok(v.bal.p[1] > 3.5, 'Ballon über dem Dach: ' + v.bal.p[1].toFixed(2));
  assert.equal(stepVehicles(H, [v.x - 3, 1, v.z], [v.x + 3, 1, v.z], 0.15, true), 0, 'Fahrzeug selbst zählt nicht');
  const bp = v.bal.p;
  assert.equal(stepVehicles(H, [bp[0] - 1, bp[1], bp[2]], [bp[0] + 1, bp[1], bp[2]], 0.15, true), 1);
  assert.equal(v.state, 'hit');
});
