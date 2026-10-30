// Gamepad-Zuordnung: Vorlagen, Totzone, Umkehren, Abfrage über die Gamepad-API.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { cfg, game } from '../src/state.js';
import { respawn } from '../src/physics.js';
import { GP_PRESETS, gp, gpMap, padValues, updGamepad } from '../src/gamepad.js';

// Achsen einer Funke in AETR-Reihenfolge: 0 Rollen, 1 Nicken, 2 Gas, 3 Gieren
const AETR = (roll, pitch, thr, yaw) => [roll, pitch, thr, yaw];
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, a + ' statt ' + b);

beforeEach(() => {
  cfg.gpPreset = 'auto'; cfg.gpMap = null;
  gp.connected = false; gp.id = ''; gp.mapping = ''; gp.btn = false;
});

test('RadioMaster-Vorlage liefert die richtigen Werte', () => {
  const v = padValues(AETR(0.5, -0.25, 0, 1), GP_PRESETS.radiomaster);
  assert.deepEqual(v, { throttle: 0.5, yaw: 1, pitch: -0.25, roll: 0.5 });
  assert.equal(padValues(AETR(0, 0, -1, 0), GP_PRESETS.radiomaster).throttle, 0);
  assert.equal(padValues(AETR(0, 0, 1, 0), GP_PRESETS.radiomaster).throttle, 1);
});

test('Totzone: kleine Ausschläge werden 0, Gas hat keine Totzone', () => {
  const v = padValues(AETR(0.02, -0.029, 0.02, 0.03), GP_PRESETS.radiomaster);
  assert.equal(v.roll, 0); assert.equal(v.pitch, 0); assert.equal(v.yaw, 0.03);
  near(v.throttle, 0.51);
});

test('Gamepad-Vorlage kehrt Gas und Nicken um', () => {
  // Xbox: 0 linker Stick X, 1 linker Stick Y (oben = -1), 2 rechter Stick X, 3 rechter Stick Y
  const v = padValues([0.4, -1, -0.6, -0.5], GP_PRESETS.gamepad);
  assert.deepEqual(v, { throttle: 1, yaw: 0.4, pitch: 0.5, roll: -0.6 });
});

test('Automatisch: Standard-Gamepad bekommt Gamepad-Vorlage, sonst RadioMaster', () => {
  gp.mapping = 'standard';
  assert.equal(gpMap(), GP_PRESETS.gamepad);
  gp.mapping = '';
  assert.equal(gpMap(), GP_PRESETS.radiomaster);
  cfg.gpPreset = 'gamepad';
  assert.equal(gpMap(), GP_PRESETS.gamepad);
});

test('Eigene Zuordnung mit Umkehren', () => {
  cfg.gpPreset = 'custom';
  cfg.gpMap = { throttle: [5, true], yaw: [4, false], pitch: [1, true], roll: [0, false] };
  const v = padValues([0.3, 0.7, 0, 0, -0.2, -0.8], gpMap());
  near(v.throttle, 0.9);
  assert.deepEqual({ ...v, throttle: 0 }, { throttle: 0, yaw: -0.2, pitch: -0.7, roll: 0.3 });
});

test('updGamepad liest eine simulierte RadioMaster über die Gamepad-API', (t) => {
  const pad = { id: 'RadioMaster TX16S Joystick', connected: true, mapping: '',
                axes: AETR(-0.5, 0.25, 0.6, 0), buttons: [{ pressed: false }] };
  const orig = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [null, pad] }, configurable: true });
  t.after(() => { if (orig) Object.defineProperty(globalThis, 'navigator', orig); else delete globalThis.navigator; });

  updGamepad();
  assert.equal(gp.connected, true);
  assert.equal(gp.id, pad.id);
  assert.equal(gp.roll, -0.5); assert.equal(gp.pitch, 0.25); assert.equal(gp.yaw, 0);
  near(gp.throttle, 0.8);

  // Taste an der Funke nach Absturz startet neu
  respawn(); game.state = 'crashed'; game.paused = false;
  pad.buttons[0].pressed = true;
  updGamepad();
  assert.equal(game.state, 'fly');

  // Gerät weg
  navigator.getGamepads = () => [];
  updGamepad();
  assert.equal(gp.connected, false);
});
