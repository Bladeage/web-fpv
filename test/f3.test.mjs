// Etappe F3: Zurückspulen mit Betaflight. Die Lage wird direkt gesetzt (sitl/platform.c bf_set_att), statt nur über den Kreisel.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cfg, game, inp } from '../src/state.js';
import { buildWorld } from '../src/world.js';
import { STEP, step, respawn, rewind, hoverThrottle } from '../src/physics.js';
import { setScenario } from '../src/scenario.js';
import { bf, bfLoad } from '../src/bf.js';
import { qRot } from '../src/math.js';

buildWorld();
after(() => { cfg.fc = 'own'; cfg.mode = 'angle'; cfg.flight = 'course'; inp.roll = 0; setScenario('gates'); });
const run = sec => { for (let i = 0; i < sec/STEP; i++) step(STEP); };
const rollDeg = s => { const r = qRot(s.q, [1, 0, 0]), u = qRot(s.q, [0, 1, 0]); return Math.atan2(-r[1], u[1])*180/Math.PI; };

test('Zurückspulen mit Betaflight (Angle): Betaflight kennt danach die Lage, die Drohne bleibt stehen', () => {
  assert.ok(bfLoad(readFileSync(new URL('../sitl/betaflight.wasm', import.meta.url))));
  cfg.fc = 'bf'; cfg.mode = 'angle'; cfg.flight = 'course'; cfg.dmg = 'off'; cfg.infBat = true; setScenario('free'); respawn();
  assert.ok(bf.ready, 'Betaflight läuft');
  const s = game.sim; game.throttle = 0; inp.roll = inp.pitch = inp.yaw = 0; run(0.5);   // Betaflight schaltet nur mit Gas unten scharf
  s.p[1] = 30; s.grounded = false; game.throttle = hoverThrottle(); run(6);
  assert.equal(bf.x.bf_flag(0), 1, 'Betaflight scharf'); assert.ok(s.p[1] > 20, 'schwebt: ' + s.p[1].toFixed(1));
  inp.roll = 1; run(1); assert.ok(Math.abs(rollDeg(s)) > 30, 'liegt schräg: ' + rollDeg(s).toFixed(0));
  assert.equal(rewind(5), true); inp.roll = 0;
  assert.ok(Math.abs(bf.x.bf_flag(3)/10 - rollDeg(s)) < 3, 'Lage in Betaflight ' + bf.x.bf_flag(3)/10 + ', wahr ' + rollDeg(s).toFixed(1));
  const x0 = s.p[0], z0 = s.p[2]; run(6);
  assert.equal(game.state, 'fly'); assert.ok(Math.abs(rollDeg(s)) < 5, 'wieder gerade: ' + rollDeg(s).toFixed(1));
  assert.ok(Math.hypot(s.p[0] - x0, s.p[2] - z0) < 8, 'kaum Drift: ' + Math.hypot(s.p[0] - x0, s.p[2] - z0).toFixed(1) + ' m (vorher 79 m und Absturz)');
});
