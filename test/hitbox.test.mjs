// Hitbox-Füße: Auflage wie im Modell, Drohne kippt erst bei großer Neigung und legt sich flach hin.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cfg, game } from '../src/state.js';
import { buildWorld } from '../src/world.js';
import { PHYS, STEP, step, respawn } from '../src/physics.js';
import { applyDrone } from '../src/drone.js';
import { qAxis, qRot } from '../src/math.js';

buildWorld();
after(() => applyDrone({ preset: '5' }));
const tilt = () => Math.acos(Math.min(1, qRot(game.sim.q, [0, 1, 0])[1]))*180/Math.PI;
function drop(deg, axis = [0, 0, 1]) {
  cfg.dmg = 'off'; respawn(); game.throttle = 0; game.armed = false;
  const s = game.sim; s.p = [0, PHYS.foot + 0.05*PHYS.size, 0]; s.q = qAxis(axis, deg*Math.PI/180);
  for (let i = 0; i < 960; i++) step(STEP);
}

for (const pre of ['whoop', '3', '5', '7']) {
  test(pre + ': steht auf der Rahmen-Unterseite, nicht auf Stelzen', () => {
    applyDrone({ preset: pre }); drop(0);
    assert.ok(Math.abs(game.sim.p[1] - PHYS.foot) < 0.003, 'Höhe ' + game.sim.p[1].toFixed(3) + ' statt ' + PHYS.foot.toFixed(3));
    assert.ok(tilt() < 1);
  });
  test(pre + ': schräg aufgesetzt legt sie sich flach hin', () => {
    applyDrone({ preset: pre });
    for (const [deg, axis] of [[40, [0, 0, 1]], [60, [1, 0, 0]], [75, [0, 0, 1]]]) {
      drop(deg, axis);
      assert.ok(tilt() < 8, deg + '° aufgesetzt, danach ' + tilt().toFixed(0) + '°');
    }
  });
}
test('5 Zoll: auf dem Rücken liegt sie auf der Oberseite', () => {
  applyDrone({ preset: '5' }); drop(180);
  assert.ok(tilt() > 150);
  assert.ok(game.sim.p[1] < 0.1, 'liegt flach, Höhe ' + game.sim.p[1].toFixed(3));
});
