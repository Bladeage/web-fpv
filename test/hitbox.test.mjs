// Hitbox-Füße: Auflage wie im Modell, Drohne kippt erst bei großer Neigung und legt sich flach hin.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cfg, game, inp } from '../src/state.js';
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

test('Am Boden mit Gas unten: Gieren dreht die Drohne, ohne Stick bleibt sie stehen', () => {
  applyDrone({ preset: '5' }); cfg.mode = 'angle'; cfg.dmg = 'off'; respawn(); game.throttle = 0; game.armed = true;
  inp.pitch = inp.roll = inp.yaw = 0;
  const head = () => { const f = qRot(game.sim.q, [0, 0, -1]); return Math.atan2(-f[0], -f[2]); };
  for (let i = 0; i < 240; i++) step(STEP);
  const h0 = head();
  for (let i = 0; i < 240; i++) step(STEP);
  assert.ok(Math.abs(head() - h0) < 0.01, 'ohne Stick keine Drehung');
  inp.yaw = 0.3; for (let i = 0; i < 240; i++) step(STEP); inp.yaw = 0;
  const d = Math.abs(head() - h0)*180/Math.PI;
  assert.ok(d > 20, 'dreht sich, ' + d.toFixed(0) + '°');
  assert.ok(tilt() < 5, 'bleibt auf den Füßen');
});

test('Nach Landung mit Schwung: kommt zur Ruhe, steht gerade, dreht nicht weg', () => {
  for (const pre of ['5', '7']) for (const mode of ['acro', 'angle']) {
    applyDrone({ preset: pre }); cfg.mode = mode; cfg.dmg = 'off'; respawn(); game.throttle = 0; inp.pitch = inp.roll = inp.yaw = 0;
    const s = game.sim; s.p = [0, 0.5, 0]; s.v = [3, -2, 1]; s.q = qAxis([0, 0, 1], 0.4);
    for (let i = 0; i < 480; i++) step(STEP);
    const f0 = qRot(game.sim.q, [0, 0, -1]);
    let tmax = 0;
    for (let i = 0; i < 1200; i++) { step(STEP); tmax = Math.max(tmax, tilt()); }
    const f1 = qRot(game.sim.q, [0, 0, -1]), turn = Math.acos(Math.min(1, f0[0]*f1[0] + f0[2]*f1[2]))*180/Math.PI;
    assert.ok(tmax < 3, pre + ' ' + mode + ': Neigung im Stand ' + tmax.toFixed(1) + '°');
    assert.ok(turn < 1, pre + ' ' + mode + ': dreht im Stand ' + turn.toFixed(2) + '°');
  }
});
