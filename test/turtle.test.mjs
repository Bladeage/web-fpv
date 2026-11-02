// Turtle-Modus: auf dem Kopf liegend schaltet er sich von selbst ein, der Stick dreht die Drohne zurück.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { cfg, game, inp } from '../src/state.js';
import { buildWorld } from '../src/world.js';
import { STEP, step, respawn } from '../src/physics.js';
import { applyDrone } from '../src/drone.js';
import { qAxis, qRot } from '../src/math.js';

buildWorld();
const upY = () => qRot(game.sim.q, [0, 1, 0])[1];
function run(sec, until) {
  for (let i = 0; i < Math.round(sec/STEP) && game.state === 'fly'; i++) { step(STEP); if (until && until()) return true; }
  return false;
}
// Drohne auf den Rücken legen (180° um die Längsachse), etwas über dem Boden fallen lassen
function flip() { const s = game.sim; s.p = [0, 0.3, 0]; s.q = qAxis([0, 0, 1], Math.PI); s.grounded = false; }
beforeEach(() => { cfg.mode = 'angle'; cfg.dmg = 'off'; cfg.needArm = false; respawn(); inp.pitch = inp.roll = inp.yaw = 0; game.throttle = 0; });

for (const [pre, name, key, val] of [['5', 'Rollen', 'roll', 0.6], ['5', 'Nicken', 'pitch', 0.6], ['5', 'Rollen links', 'roll', -0.6], ['whoop', 'Rollen', 'roll', 1], ['7', 'Nicken zurück', 'pitch', -0.5]]) {
  test(pre + ' Zoll auf dem Kopf: Turtle-Modus an, ' + name + ' dreht die Drohne zurück', () => {
    applyDrone({ preset: pre }); respawn();
    flip(); run(1.5);
    assert.ok(upY() < -0.5, 'liegt auf dem Rücken');
    assert.equal(game.sim.turtle, true, 'Turtle-Modus von selbst an');
    inp[key] = val;
    let maxY = 0;
    const ok = run(4, () => { maxY = Math.max(maxY, game.sim.p[1]); return !game.sim.turtle; });   // Stick halten, bis sie steht
    inp[key] = 0;
    assert.ok(ok, 'wieder aufrecht');
    run(1.5);
    assert.equal(game.state, 'fly');
    assert.equal(game.sim.turtle, false, 'Turtle-Modus wieder aus');
    assert.ok(upY() > 0.9, 'steht auf den Füßen, oben = ' + upY().toFixed(2));
    assert.ok(maxY < 1.0, 'springt nicht weit hoch, höchste Höhe ' + maxY.toFixed(2) + ' m');
  });
}

test.after(() => applyDrone({ preset: '5' }));

test('Ohne Stick bleibt die Drohne liegen; disarmed kein Turtle-Modus', () => {
  applyDrone({ preset: '5' }); respawn();
  flip(); run(2);
  assert.equal(game.sim.turtle, true);
  assert.ok(upY() < -0.5);
  game.armed = false; run(0.2);
  assert.equal(game.sim.turtle, false);
});
