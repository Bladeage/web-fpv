// Etappe F2: Auftrag „Gemischt“, Auswertung, Lagebild, Aufklärung mit stehenden Fahrzeugen
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cfg, game } from '../src/state.js';
import { buildWorld } from '../src/world.js';
import { respawn } from '../src/physics.js';
import { setScenario } from '../src/scenario.js';

buildWorld();
after(() => { cfg.flight = 'course'; cfg.diff = 'mid'; cfg.huntX = 5; setScenario('gates'); });

test('F2 Gemischt: Fahrzeuge und Drohnen zählen gemeinsam, mit Sprengladung', async () => {
  const { huntTotal, huntNeed, chargeOn, scenLabel, scenTarget, scenResultLines, scenBrief } = await import('../src/scenario.js');
  const { vehicles } = await import('../src/vehicles.js'); const { targets } = await import('../src/targets.js');
  const { step, STEP } = await import('../src/physics.js');
  cfg.flight = 'tactical'; cfg.diff = 'mid'; cfg.huntX = 2; cfg.dmg = 'off'; setScenario('hunt4'); respawn();
  assert.equal(vehicles.length, 7); assert.equal(targets.length, 9); assert.equal(huntTotal(), 16); assert.equal(huntNeed(), 2);
  assert.equal(chargeOn(), true); assert.ok(scenTarget()); assert.equal(game.bestScen, 'hunt4.x2');
  const hit = p => { const s = game.sim; game.state = 'fly'; s.p = [p[0], p[1] + 2.5, p[2]]; s.v = [0, -6, 0]; s.w = [0, 0, 0]; s.q = [0, 0, 0, 1]; s.armed = true; s.grounded = false; game.throttle = 0;
    const h0 = scenLabel(); for (let i = 0; i < 2/STEP && scenLabel() === h0; i++) step(STEP); };
  const v = vehicles.find(x => x.kind === 'parked'); hit([v.x, v.y + 0.5, v.z]); assert.match(scenLabel(), /TREFFER 1\/2/, 'Fahrzeug zählt');   // Start in 3 m Höhe (ein Fahrzeug steht im Parkhaus, darüber ist das Dach)
  const t = targets.find(x => x.state === 'fly' && x.speed === 0) || targets[0]; hit(t.p); assert.equal(scenLabel(), 'ZIEL', 'Drohne zählt');
  const r = scenResultLines(); assert.match(r[0], /^Zeit \d+:\d\d\.\d\d · /); assert.match(r[1], /Versuch.* · Treffer 2\/2 · \d Drohne/);
  assert.match(scenBrief('hunt4', { tactical: true, diff: 'mid', huntX: 5 })[0], /5 von 16 Zielen/);
  assert.match(scenBrief('hunt2', { tactical: true, diff: 'mid', huntX: 5 })[1], /Sprengladung: scharf ab 10 m/);
  assert.match(scenBrief('hunt2', { tactical: true, diff: 'easy', huntX: 5 })[1], /Ballon/);
  assert.match(scenBrief('landing', { diff: 'hard' })[1], /Höchstens 2 m\/s/); assert.equal(scenBrief('free'), null);
  cfg.huntX = 5;
});
