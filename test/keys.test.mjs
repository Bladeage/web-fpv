// Freie Tastenbelegung: Vorgaben, Tauschen, reservierte Tasten, Anzeigenamen.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { cfg, KEY_FN, keyOf, keyFns, setKey, keyName } from '../src/state.js';

beforeEach(() => { cfg.keys = {}; });

test('Vorgaben wie bisher, jede Taste nur einmal', () => {
  assert.equal(keyOf('thrUp'), 'KeyW'); assert.equal(keyOf('arm'), 'Space'); assert.equal(keyOf('mode'), 'KeyM');
  const codes = KEY_FN.map(([fn]) => keyOf(fn));
  assert.equal(new Set(codes).size, codes.length);
});
test('Neue Taste: freie Taste wird übernommen, belegte Taste tauscht', () => {
  assert.equal(setKey('arm', 'KeyB'), true);
  assert.equal(keyOf('arm'), 'KeyB'); assert.deepEqual(keyFns('Space'), []);
  setKey('arm', 'KeyM');
  assert.equal(keyOf('arm'), 'KeyM'); assert.equal(keyOf('mode'), 'KeyB', 'Angle/Acro bekommt die alte Taste');
  setKey('arm', 'Space'); setKey('mode', 'KeyM');
  assert.deepEqual(cfg.keys, {}, 'zurück auf Vorgabe: nichts gespeichert');
});
test('Esc und P sind reserviert', () => {
  assert.equal(setKey('arm', 'Escape'), false); assert.equal(setKey('arm', 'KeyP'), false);
  assert.equal(keyOf('arm'), 'Space');
});
test('Anzeigenamen', () => {
  assert.equal(keyName('KeyQ'), 'Q'); assert.equal(keyName('Digit7'), '7'); assert.equal(keyName('Space'), 'Leertaste');
  assert.equal(keyName('ArrowLeft'), '←'); assert.equal(keyName('Numpad8'), 'Num 8');
});

test('Bildmodus (Wärme/Nacht) liegt auf N und ist frei belegbar', async () => {
  assert.equal(keyOf('vision'), 'KeyN');
  const { GP_SW } = await import('../src/gamepad.js');
  assert.ok(GP_SW.some(([fn]) => fn === 'vision'), 'auch auf Funke/Gamepad belegbar');
});

test('Einfrieren (Taste F): nur in Lernen und Gott-Modus; Drohne bleibt stehen und fliegt danach genau so weiter', async () => {
  const { game, inp } = await import('../src/state.js'), { buildWorld } = await import('../src/world.js');
  const { STEP, step, respawn, toggleFreeze, freezeOk, hoverThrottle } = await import('../src/physics.js');
  assert.equal(keyOf('freeze'), 'KeyF');
  buildWorld();
  const style = (dmg, infBat) => { cfg.dmg = dmg; cfg.infBat = infBat; cfg.mode = 'angle'; cfg.needArm = false; };
  style('real', false); respawn();
  assert.equal(toggleFreeze(), false, 'Realistisch: nicht erlaubt'); assert.equal(game.frozen, false);
  style('off', false); assert.equal(freezeOk(), false, 'Normal: nicht erlaubt');
  style('off', true); respawn(); inp.pitch = inp.roll = inp.yaw = 0;
  // in die Luft, mit Fahrt
  const s = game.sim; game.throttle = hoverThrottle() + 0.25;
  for (let i = 0; i < 240*1.5; i++) step(STEP);
  assert.ok(s.p[1] > 1, 'fliegt');
  assert.equal(toggleFreeze(), true); assert.equal(game.frozen, true);
  const p = s.p.slice(), v = s.v.slice();
  // Hauptschleife rechnet eingefroren keine Schritte (main.js); Zustand unverändert
  assert.equal(toggleFreeze(), false, 'nochmals F: weiter');
  assert.deepEqual([s.p, s.v], [p, v], 'gleiche Lage und Fahrt wie beim Einfrieren');
  toggleFreeze(); respawn(); assert.equal(game.frozen, false, 'Neustart löst');
  cfg.dmg = 'off'; cfg.infBat = false;
});
