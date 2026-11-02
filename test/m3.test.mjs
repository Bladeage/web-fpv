// M3: Paketlieferung und Verfolgung.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { cfg, game, inp } from '../src/state.js';
import { buildWorld, COURSE } from '../src/world.js';
import { PHYS, BAT, STEP, step, respawn, hoverThrottle, motorSteady } from '../src/physics.js';
import { setScenario, scenDone, scenLabel, PICKUP, dropOrder, deliverState, followLead, FOLLOW } from '../src/scenario.js';

buildWorld();
// Drohne bei p schwebend absetzen (Motoren auf Schwebedrehzahl)
function hoverAt(p) {
  const s = game.sim, u = hoverThrottle(), w = motorSteady(u, BAT.cells*4.15);
  s.p = p.slice(); s.v = [0, 0, 0]; s.q = [0, 0, 0, 1]; s.w = [0, 0, 0]; s.grounded = false; s.om = [w, w, w, w]; game.throttle = u;
}
function run(sec, each) { for (let i = 0; i < Math.round(sec/STEP) && game.state === 'fly'; i++) { if (each) each(); step(STEP); } }
beforeEach(() => { cfg.mode = 'angle'; inp.pitch = inp.roll = inp.yaw = 0; });

test('Paketlieferung: abholen, liefern, dreimal; Paket macht die Drohne schwerer', () => {
  setScenario('deliver'); respawn();
  assert.equal(dropOrder.length, 3);
  const mids = [2, 3, 5, 7].map(i => { const a = COURSE[i], b = COURSE[(i + 1) % COURSE.length]; return [(a[0] + b[0])/2, (a[1] + b[1])/2]; });
  for (let k = 0; k < 3; k++) {
    hoverAt([PICKUP[0], PHYS.radius + 0.6, PICKUP[2]]);
    run(1.2, () => { game.sim.v = [0, 0, 0]; });
    assert.equal(deliverState().carry, true, 'Paket aufgenommen ' + k);
    assert.ok(game.payload > 0.1, 'Paket wiegt ' + game.payload);
    assert.match(scenLabel(), /^LIEFERN/);
    // zu hoch über der Plattform zählt nicht
    const d = mids[dropOrder[k]];
    hoverAt([d[0], 5, d[1]]); run(1.2, () => { game.sim.v = [0, 0, 0]; });
    assert.equal(deliverState().deliv, k, 'zu hoch zählt nicht');
    hoverAt([d[0], PHYS.radius + 0.6, d[1]]); run(1.2, () => { game.sim.v = [0, 0, 0]; });
    assert.equal(deliverState().deliv, k + 1, 'geliefert ' + (k + 1));
    assert.equal(game.payload, 0);
  }
  assert.ok(scenDone());
  setScenario('gates');
});

test('Verfolgung: Zeit zählt nur im Abstandsband, nach 30 s erfüllt', () => {
  setScenario('follow'); respawn();
  // weit weg: zählt nicht
  hoverAt([0, 5, 0]); run(2, () => { game.sim.v = [0, 0, 0]; });
  assert.equal(followLead().ok, false);
  assert.match(scenLabel(), /^FOLGEN 0\/30S/);
  // hinter dem Auto im Band mitfliegen
  run(FOLLOW.need + 1, () => {
    const L = followLead(), s = game.sim;
    s.p = [L.x + Math.sin(L.yaw)*7, PHYS.radius + 4, L.z + Math.cos(L.yaw)*7]; s.v = [0, 0, 0]; s.q = [0, 0, 0, 1]; s.w = [0, 0, 0];
  });
  assert.ok(scenDone(), scenLabel());
  setScenario('gates');
});
