// Wirkmittel im Taktischen Flug (Prompt 196): Ladung unter der Drohne, Zündung im Ziel, Treffer, neue Drohne mit vollem Akku.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cfg, game } from '../src/state.js';
import { buildWorld } from '../src/world.js';
import { STEP, step, respawn, respawnDrone, PHYS, hoverThrottle } from '../src/physics.js';
import { setScenario, scenLabel, chargeOn, chargeDue, chargeNext, chargeDrones, booms, CHARGE } from '../src/scenario.js';
import { vehicles } from '../src/vehicles.js';

buildWorld();
after(() => { cfg.flight = 'course'; cfg.warhead = 'none'; setScenario('gates'); });

test('Ladung nur im Taktischen Flug mit Sprengladung in der Jagd; macht die Drohne schwerer', () => {
  cfg.flight = 'course'; cfg.warhead = 'charge'; cfg.diff = 'mid'; setScenario('hunt2'); respawn();
  assert.equal(chargeOn(), false); assert.equal(game.payload, 0);
  cfg.flight = 'tactical'; cfg.warhead = 'none'; respawn(); assert.equal(chargeOn(), false);
  cfg.warhead = 'charge'; respawn();
  assert.equal(chargeOn(), true); assert.ok(Math.abs(game.payload - CHARGE.mass*PHYS.mass) < 1e-9);
  assert.ok(/DROHNE 1/.test(scenLabel()), scenLabel());
});

test('Landung auf dem Ziel: Zündung, Treffer, Explosion, Drohne verbraucht; danach neue Drohne mit vollem Akku', () => {
  cfg.flight = 'tactical'; cfg.warhead = 'charge'; cfg.diff = 'mid'; cfg.dmg = 'off'; cfg.mode = 'angle'; setScenario('hunt2'); respawn();
  const v = vehicles.find(x => x.kind === 'parked'), s = game.sim;
  s.p = [v.x, 3, v.z]; s.v = [0, -2, 0]; s.w = [0, 0, 0]; s.q = [0, 0, 0, 1]; game.throttle = 0; s.mah = 500;
  for (let i = 0; i < 3/STEP && game.state === 'fly'; i++) step(STEP);
  assert.equal(game.state, 'crashed'); assert.ok(/^Wirkmittel/.test(s.crashMsg), s.crashMsg);
  assert.ok(/TREFFER 1\//.test(scenLabel()), scenLabel()); assert.equal(booms.length, 1, 'Explosion am Ziel');
  assert.equal(chargeDue(s.crashT + 500), false, 'erst nach der Pause');
  assert.equal(chargeDue(s.crashT + CHARGE.delay*1000 + 10), true);
  game.state = 'fly'; respawnDrone(true); chargeNext();
  assert.equal(chargeDrones(), 2); assert.ok(/DROHNE 2/.test(scenLabel()));
  assert.ok(game.payload > 0, 'neue Ladung'); assert.equal(game.sim.mah, 0, 'voller Akku');
  assert.ok(Math.hypot(game.sim.p[0] - game.home[0], game.sim.p[2] - game.home[1]) < 0.5, 'am Startplatz');
  assert.ok(/TREFFER 1\//.test(scenLabel()), 'Treffer bleiben');
});

test('Absturz ohne Ziel zündet auch (kein Treffer), danach neue Drohne', () => {
  cfg.flight = 'tactical'; cfg.warhead = 'charge'; cfg.dmg = 'real'; setScenario('hunt2'); respawn();
  const s = game.sim; s.p = [game.home[0] + 5, 20, game.home[1] + 5]; s.v = [0, -25, 0]; s.q = [0, 0, 0, 1]; game.throttle = 0;
  for (let i = 0; i < 3/STEP && game.state === 'fly'; i++) step(STEP);
  assert.equal(game.state, 'crashed'); assert.ok(/TREFFER 0\//.test(scenLabel()));
  assert.equal(chargeDue(s.crashT + CHARGE.delay*1000 + 10), true);
  cfg.dmg = 'off';
});
