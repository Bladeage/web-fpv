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
