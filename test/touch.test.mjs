// Touch-Bedienung (Prompt 251): Die Entscheidung, was eine Berührung tut, liegt ohne DOM in physics.js und ist hier geprüft.
// Anlass: Nach der Prüfung fing jede Berührung bei „nicht scharf“ das Scharfschalten ab; mit Gas oben ging nichts mehr (Prompt 249).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cfg, game } from '../src/state.js';
import { buildWorld } from '../src/world.js';
import { respawn, touchKind, toggleArm, crash } from '../src/physics.js';
import { setScenario } from '../src/scenario.js';

buildWorld();
after(() => { cfg.flight = 'course'; cfg.needArm = false; setScenario('gates'); });

test('Nicht scharf mit Gas oben: Die Berührung führt den Knüppel, damit sich das Gas wegnehmen lässt', () => {
  cfg.flight = 'course'; cfg.needArm = true; setScenario('gates'); respawn();
  assert.equal(game.armed, false);
  game.throttle = 0.3;
  assert.equal(touchKind(), 'stick', 'Knüppel bleibt bedienbar');
  assert.equal(toggleArm(), false, 'scharf schalten geht erst mit Gas unten'); assert.equal(touchKind(), 'stick');
  game.throttle = 0; assert.equal(toggleArm(), true); assert.equal(touchKind(), 'stick');
});

test('Nach einem Absturz: erst warten, dann Neustart; nach dem Auftrag: neuer Auftrag; gezündete Ladung: warten', () => {
  cfg.needArm = false; setScenario('gates'); respawn();
  crash('Test'); const t = game.sim.crashT;
  assert.equal(touchKind(t + 100), 'wait', 'zu früh'); assert.equal(touchKind(t + 500), 'restart');
  game.state = 'done'; assert.equal(touchKind(), 'new');
  cfg.flight = 'tactical'; cfg.diff = 'mid'; setScenario('hunt2'); respawn();
  game.sim.armed = true; crash('Aufprall');
  assert.equal(touchKind(game.sim.crashT + 800), 'wait', 'die nächste Drohne kommt von selbst');
});
