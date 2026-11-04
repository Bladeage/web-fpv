// Stufe „Leicht“, Runde 1: Tor-Toleranz, Landehilfe, Abwurf im Überflug, größere Zonen, langsamere Verfolgung.
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { cfg, game } from '../src/state.js';
import { buildWorld, gates } from '../src/world.js';
import { STEP, step, respawn, task, hoverThrottle, PHYS } from '../src/physics.js';
import { setScenario, diff, dropR, DROP_R, deliverState, dropOrder, DROPS, PICKUP, followLead } from '../src/scenario.js';

buildWorld();
const run = sec => { for (let i = 0; i < sec/STEP && game.state === 'fly'; i++) step(STEP); };
beforeEach(() => { cfg.dmg = 'off'; cfg.mode = 'angle'; });
after(() => { cfg.diff = 'mid'; });

test('Tor zählt in Leicht auch 1,6 m neben der Mitte, in Normal nicht', () => {
  for (const [d, ok] of [['easy', true], ['mid', false]]) {
    cfg.diff = d; setScenario('gates'); respawn();
    const g = gates[0], s = game.sim;
    s.p = [g.c[0] - g.n[0]*1.5 + g.r[0]*1.6, g.c[1], g.c[2] - g.n[2]*1.5 + g.r[2]*1.6]; s.v = [g.n[0]*6, 0, g.n[2]*6]; s.grounded = false;
    task.collide = null; game.throttle = hoverThrottle();
    cfg.ghost = true; run(0.5); cfg.ghost = false;
    assert.equal(s.next === 1, ok, d + ': nächstes Tor ' + s.next);
  }
});
test('Landehilfe bremst das Sinken unter 5 m, in Normal nicht', () => {
  for (const [d, aid] of [['easy', true], ['mid', false]]) {
    cfg.diff = d; setScenario('landing'); respawn();
    const s = game.sim; s.p = [0, 4, 0]; s.v = [0, -4, 0]; s.grounded = false; game.throttle = 0;
    let vmin = 0; for (let i = 0; i < 240 && s.p[1] > PHYS.foot + 0.3; i++) { step(STEP); if (s.p[1] < 2) vmin = Math.min(vmin, s.v[1]); }
    assert.equal(vmin > -2.5, aid, d + ': schnellstes Sinken unter 2 m ' + vmin.toFixed(2));
  }
});
test('Lieferzonen in Leicht doppelt so groß; Abwurf im Überflug liefert ohne Schweben', () => {
  cfg.diff = 'easy'; assert.equal(dropR(), 2*DROP_R);
  cfg.diff = 'mid'; assert.equal(dropR(), DROP_R);
  cfg.diff = 'easy'; setScenario('deliver'); respawn();
  const s = game.sim;
  s.p = [PICKUP[0], PHYS.foot + 0.5, PICKUP[2]]; s.v = [0, 0, 0]; s.grounded = false; game.throttle = hoverThrottle(); run(2);
  assert.equal(deliverState().carry, true, 'Paket aufgenommen');
  // Überflug über die erste Lieferzone in 8 m Höhe mit 6 m/s: zählt in Leicht sofort
  const z = DROPS[dropOrder[0]];
  s.p = [z[0] - 4, 8, z[2]]; s.v = [6, 0, 0]; game.throttle = hoverThrottle(); run(1.5);
  assert.equal(deliverState().deliv, 1, 'abgeworfen');
  assert.equal(deliverState().carry, false);
});
test('Verfolgung in Leicht: Auto langsamer, mehr Abstand erlaubt', () => {
  const dist = {};
  for (const d of ['easy', 'mid']) {
    cfg.diff = d; setScenario('follow'); respawn();
    const s = game.sim; s.p = [0, 3, 0]; s.grounded = false; game.throttle = hoverThrottle(); run(5);
    const L = followLead(); dist[d] = L.s;
  }
  assert.ok(dist.easy < dist.mid*0.8, 'Strecke in 5 s: leicht ' + dist.easy.toFixed(1) + ' m, normal ' + dist.mid.toFixed(1) + ' m');
  cfg.diff = 'easy'; assert.ok(diff().followMax > 12);
});
