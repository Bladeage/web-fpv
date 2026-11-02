// P1: Motormodell und Aerodynamik.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { cfg, game, inp } from '../src/state.js';
import { buildWorld } from '../src/world.js';
import { PHYS, BAT, STEP, step, respawn, hoverThrottle, motorSteady } from '../src/physics.js';
import { applyDrone } from '../src/drone.js';

buildWorld();
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} statt ${b}`);
function airborne(p, v, thr) {
  const s = game.sim, w = motorSteady(thr, BAT.cells*4.15);
  s.p = p.slice(); s.v = v.slice(); s.grounded = false; s.om = [w, w, w, w]; game.throttle = thr;
}
// Mittlere Beschleunigung über n Schritte
function accel(n = 4) { const v0 = game.sim.v.slice(); for (let i = 0; i < n; i++) step(STEP); return game.sim.v.map((x, i) => (x - v0[i])/(n*STEP)); }

beforeEach(() => { applyDrone({ preset: '5' }); cfg.mode = 'angle'; respawn(); inp.pitch = inp.roll = inp.yaw = 0; });

test('Motor passt zum Prüfstandswert (2207.5, 2550 KV, 5 Zoll, 16 V)', () => {
  const m = PHYS.m, w = motorSteady(1, 16.0);
  near(w*60/(2*Math.PI), 26645, 30, 'Drehzahl');
  near(m.kT*w*w/9.81*1000, 1691, 5, 'Schub in g');
  near((16.0 - m.ke*w)/m.rm, 53.9, 0.5, 'Strom in A');
  const h = hoverThrottle();
  assert.ok(h > 0.15 && h < 0.3, 'Schwebegas 5 Zoll ' + h);
});

test('Steigflug kostet Schub (Anströmung durch den Rotor)', () => {
  const save = [PHYS.cdaF, PHYS.cdaT, PHYS.kRD];
  PHYS.cdaF = PHYS.cdaT = PHYS.kRD = 0;   // nur den Rotoreffekt messen
  airborne([0, 50, 0], [0, 0, 0], 0.6); const a0 = accel()[1];
  respawn(); airborne([0, 50, 0], [0, 15, 0], 0.6); const a1 = accel()[1];
  [PHYS.cdaF, PHYS.cdaT, PHYS.kRD] = save;
  assert.ok(a1 < a0 - 3, `steigend ${a1} < ruhend ${a0}`);
});

test('Bodeneffekt: dicht über dem Boden mehr Schub', () => {
  const h = hoverThrottle();
  airborne([0, 30, 0], [0, 0, 0], h); const aHigh = accel()[1];
  respawn(); airborne([0, PHYS.foot + 0.005, 0], [0, 0, 0], h); const aLow = accel()[1];
  assert.ok(aLow > aHigh + 0.5, `am Boden ${aLow} > oben ${aHigh}`);
});

test('Rotorwiderstand bremst seitliche Fahrt', () => {
  airborne([0, 30, 0], [0, 0, -15], hoverThrottle()); const with_ = accel()[2];
  const k = PHYS.kRD; PHYS.kRD = 0;
  respawn(); airborne([0, 30, 0], [0, 0, -15], hoverThrottle()); const without = accel()[2];
  PHYS.kRD = k;
  assert.ok(with_ > without + 1, `mit Rotorwiderstand ${with_} bremst stärker als ohne ${without}`);
});

test('Widerstand nach Lage: flach angeströmt bremst mehr als von vorn', () => {
  const k = PHYS.kRD; PHYS.kRD = 0;
  const run = flat => {
    respawn(); airborne([0, 30, 0], flat ? [0, -20, 0] : [0, 0, -20], hoverThrottle());
    return Math.abs(flat ? accel(1)[1] + 9.81 - 0 : accel(1)[2]);
  };
  const front = run(false), top = run(true);
  PHYS.kRD = k;
  assert.ok(top > front, `von oben ${top} > von vorn ${front}`);
});

test('Sinkflug in den eigenen Abwind wird unruhig (Propwash)', () => {
  cfg.mode = 'acro';
  const h = hoverThrottle();
  let calm = 0, wash = 0;
  airborne([0, 60, 0], [0, 0, 0], h); for (let i = 0; i < 240; i++) { step(STEP); calm = Math.max(calm, Math.hypot(...game.sim.w)); }
  respawn(); airborne([0, 60, 0], [0, -5, 0], h);
  for (let i = 0; i < 240; i++) { game.sim.v[1] = -5; step(STEP); wash = Math.max(wash, Math.hypot(...game.sim.w)); }
  assert.ok(wash > calm*5 && wash > 0.05, `Propwash ${wash} gegen ruhig ${calm}`);
});
