// Aufklärung (Prompt 234): fahrende Autos und Vögel im Fadenkreuz halten; keine Sprengladung in diesem Auftrag.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cfg, game } from '../src/state.js';
import { buildWorld } from '../src/world.js';
import { STEP, respawn, task } from '../src/physics.js';
import { setScenario, scenLabel, scenTarget, chargeOn, chargeLeft, RECON, reconHold } from '../src/scenario.js';
import { vehicles } from '../src/vehicles.js';
import { birds } from '../src/birds.js';
import { qAxis } from '../src/math.js';

buildWorld();
after(() => { cfg.flight = 'course'; cfg.tilt = 0; setScenario('gates'); });

// Drohne d m hinter das Ziel setzen, Kamera genau darauf; off: seitlicher Versatz des Blicks in Grad
function aim(p, d, off = 0) {
  const s = game.sim, a = 0.7;   // Blick aus Richtung a (rad, in der Ebene), etwas von oben
  s.p = [p[0] + Math.sin(a)*d, p[1] + 5, p[2] + Math.cos(a)*d];
  const dx = p[0] - s.p[0], dy = p[1] - s.p[1], dz = p[2] - s.p[2];
  const yaw = Math.atan2(-dx, -dz) + off*Math.PI/180, pitch = Math.atan2(dy, Math.hypot(dx, dz));
  const qy = qAxis([0, 1, 0], yaw), qp = qAxis([1, 0, 0], pitch);
  s.q = [qy[3]*qp[0], qy[1]*qp[3], -qy[1]*qp[0], qy[3]*qp[3]];   // qy * qp
  s.grounded = false;
}
const run = (sec, follow) => { for (let i = 0; i < sec/STEP; i++) { follow(); task.check(game.sim.p, game.sim.p, STEP); } };

test('Aufklärung: kein Wirkmittel, Auto 4 s im Fadenkreuz zählt, daneben und zu weit nicht', () => {
  cfg.flight = 'tactical'; cfg.diff = 'mid'; cfg.tilt = 0;
  setScenario('recon'); respawn(); birds.length = 0;
  assert.equal(chargeOn(), false); assert.equal(chargeLeft(), null); assert.equal(game.payload, 0);
  assert.match(scenLabel(), /AUFGEKLÄRT 0\/3/);
  const v = vehicles.find(x => x.state === 'drive'), at = () => [v.x, v.y + 0.75, v.z];
  assert.ok(v && scenTarget(), 'fahrendes Auto als Ziel');
  run(5, () => aim(at(), 30, 15)); assert.match(scenLabel(), /0\/3/, '15 Grad daneben zählt nicht');
  run(5, () => aim(at(), RECON.dMax + 20)); assert.match(scenLabel(), /0\/3/, 'zu weit');
  run(RECON.hold - 0.5, () => aim(at(), 30)); assert.ok(reconHold() > 3, 'Zeit läuft: ' + reconHold()); assert.match(scenLabel(), /0\/3 · 3\.\dS/);
  run(1, () => aim(at(), 30)); assert.match(scenLabel(), /AUFGEKLÄRT 1\/3/);
  run(5, () => aim(at(), 30)); assert.match(scenLabel(), /1\/3/, 'dasselbe Auto zählt nur einmal');
});

test('Aufklärung: drei Ziele erfüllen den Auftrag; Vögel zählen auch', () => {
  setScenario('recon'); respawn(); birds.length = 0;
  birds.push({ p: [0, 30, 0], state: 'fly' });
  const cars = vehicles.filter(x => x.state === 'drive').slice(0, 2);
  for (const v of cars) run(RECON.hold + 0.2, () => aim([v.x, v.y + 0.75, v.z], 25));
  run(RECON.hold + 0.2, () => aim(birds[0].p, 20));
  assert.equal(scenLabel(), 'ZIEL');
});

test('Aufklärung: ein Ziel hinter einem Gebäude zählt nicht (Sichtlinie)', async () => {
  const { colliders } = await import('../src/world.js');
  cfg.flight = 'tactical'; cfg.tilt = 0; setScenario('recon'); respawn(); birds.length = 0;
  const c = colliders.filter(x => Math.min(x.h[0], x.h[2]) > 2 && x.h[1] > 2).sort((a, b) => b.h[0]*b.h[2] - a.h[0]*a.h[2])[0], R = Math.hypot(c.h[0], c.h[2]) + 3;
  assert.ok(c && 2*R < RECON.dMax, 'großes Gebäude auf der Karte');
  birds.push({ p: [c.c[0] + R, c.c[1], c.c[2]], state: 'fly' });
  const look = x => { const s = game.sim; s.p = [x, c.c[1], c.c[2]]; s.q = qAxis([0, 1, 0], -Math.PI/2); s.grounded = false; };   // Blick nach +x
  const only = () => { for (const v of vehicles) v.state = 'park'; };   // nur der Vogel ist Ziel
  only(); run(RECON.hold + 0.5, () => look(c.c[0] - R)); assert.match(scenLabel(), /0\/3/, 'Gebäude dazwischen');
  only(); run(RECON.hold + 0.5, () => look(c.c[0] + R - 20 > c.c[0] + Math.hypot(c.h[0], c.h[2]) ? c.c[0] + R - 20 : c.c[0] + R - 2)); assert.match(scenLabel(), /1\/3/, 'freie Sicht zählt');
});
