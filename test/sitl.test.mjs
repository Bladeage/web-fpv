// SITL: echtes Betaflight als WebAssembly (sitl/betaflight.wasm, gebaut mit sitl/build.mjs).
// Prüft: startet, lässt sich über AUX1 scharf schalten, gibt Gas weiter, steuert gegen Drehungen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cfg, game, inp } from '../src/state.js';
import { buildWorld } from '../src/world.js';
import { STEP, step, respawn } from '../src/physics.js';
import { bf, bfLoad } from '../src/bf.js';
import { qRot } from '../src/math.js';

const mod = new WebAssembly.Module(readFileSync(new URL('../sitl/betaflight.wasm', import.meta.url)));
function start() {
  const env = {};   // Hardware-Funktionen, die es im Browser nicht gibt: geben 0 zurück
  for (const i of WebAssembly.Module.imports(mod)) if (i.module === 'env') env[i.name] = () => 0;
  const math = Object.fromEntries(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'exp', 'log', 'log10', 'log2', 'pow', 'cbrt', 'hypot', 'tanh'].map(n => [n, Math[n]]));
  const x = new WebAssembly.Instance(mod, { env, math }).exports;
  x.__wasm_call_ctors(); x.bf_init(); x.bf_set_acc(0, 0, 9.81);
  return x;
}
const mot = x => [0, 1, 2, 3].map(i => x.bf_motor(i));

test('Betaflight startet und lässt sich nach der Startpause scharf schalten', () => {
  const x = start();
  assert.ok(x.bf_flag(9) > 50, 'Einstellungs-Register gefüllt: ' + x.bf_flag(9));
  x.bf_step(6e6);
  assert.equal(x.bf_flag(1), 0, 'keine Sperre mehr, Bitfeld ' + x.bf_flag(1));
  assert.equal(x.bf_flag(0), 0);
  x.bf_set_rc(4, 2000); x.bf_step(1e5);
  assert.equal(x.bf_flag(0), 1, 'scharf über AUX1');
  for (const m of mot(x)) assert.ok(m > 0.02 && m < 0.1, 'Leerlauf ' + m);
});

test('Gas und Gegensteuern: Kreisel-Drehung ändert die Motorpaare', () => {
  const x = start();
  x.bf_step(6e6); x.bf_set_rc(4, 2000); x.bf_step(1e5);
  x.bf_set_rc(2, 1500); x.bf_step(2e5);
  const m0 = mot(x);
  for (const m of m0) assert.ok(Math.abs(m - m0[0]) < 0.01 && m > 0.3, 'Gas gleichmäßig ' + m0);
  x.bf_set_gyro(100, 0, 0); x.bf_step(2e4);
  const m1 = mot(x);
  // Betaflight Quad-X: Motor 1 hinten rechts, 2 vorne rechts, 3 hinten links, 4 vorne links
  assert.ok(m1[0] > m0[0] + 0.05 && m1[1] > m0[1] + 0.05 && m1[2] < m0[2] - 0.05 && m1[3] < m0[3] - 0.05, 'Rollen: rechte Motoren hoch, linke runter ' + m1);
});

test('Rechenzeit: 1 s Simulation unter 100 ms', () => {
  const x = start();
  const t0 = performance.now(); x.bf_step(1e6);
  assert.ok(performance.now() - t0 < 100, (performance.now() - t0).toFixed(1) + ' ms');
});

// Geschlossener Kreis: unsere Physik mit Betaflight als Regler (src/bf.js)

function flyBf(mode) {
  buildWorld();
  bfLoad(readFileSync(new URL('../sitl/betaflight.wasm', import.meta.url)));
  cfg.fc = 'bf'; cfg.mode = mode; cfg.dmg = 'off'; respawn(); inp.roll = inp.pitch = inp.yaw = 0; game.throttle = 0;
}
const att = () => { const s = game.sim, f = qRot(s.q, [0, 0, -1]), r = qRot(s.q, [1, 0, 0]), u = qRot(s.q, [0, 1, 0]);
  return { pitch: Math.atan2(-f[1], u[1])*180/Math.PI, roll: Math.atan2(-r[1], u[1])*180/Math.PI, head: Math.atan2(-f[0], -f[2])*180/Math.PI }; };
const runFor = sec => { for (let i = 0; i < sec/STEP && game.state === 'fly'; i++) step(STEP); };

test('Betaflight im Simulator: startet, steigt gerade, Achsen in die richtige Richtung (Angle)', (t) => {
  t.after(() => { cfg.fc = 'own'; });
  flyBf('angle');
  assert.equal(bf.ready, true, bf.err);
  runFor(0.3);
  assert.equal(bf.x.bf_flag(0), 1, 'scharf');
  game.throttle = 0.5; runFor(1);
  assert.ok(game.sim.p[1] > 2, 'steigt: ' + game.sim.p[1].toFixed(1) + ' m');
  assert.ok(Math.abs(att().roll) < 2 && Math.abs(att().pitch) < 2, 'gerade ' + JSON.stringify(att()));
  game.throttle = 0.35;
  inp.roll = 0.3; runFor(0.5); assert.ok(att().roll > 4, 'Rollen rechts neigt rechts: ' + att().roll.toFixed(1)); inp.roll = 0; runFor(1.5);
  assert.ok(Math.abs(att().roll) < 2, 'Angle richtet sich wieder auf: ' + att().roll.toFixed(1));
  inp.pitch = 0.3; runFor(0.5); assert.ok(att().pitch > 4, 'Nicken vor senkt die Nase: ' + att().pitch.toFixed(1)); inp.pitch = 0; runFor(1.5);
  inp.yaw = 0.5; runFor(0.5); assert.ok(att().head < -20, 'Gieren rechts dreht rechts: ' + att().head.toFixed(1)); inp.yaw = 0;
  assert.equal(game.state, 'fly');
});

test('Betaflight im Simulator: Acro hält die Lage nach dem Loslassen', (t) => {
  t.after(() => { cfg.fc = 'own'; });
  flyBf('acro');
  runFor(0.3); game.throttle = 0.5; runFor(1); game.throttle = 0.35;
  inp.roll = 0.3; runFor(0.4); inp.roll = 0;
  const r0 = att().roll; runFor(0.5);
  assert.ok(r0 > 15 && Math.abs(att().roll - r0) < 5, 'Lage bleibt: ' + r0.toFixed(1) + ' -> ' + att().roll.toFixed(1));
});

test('Betaflight nicht verfügbar: eigener Regler fliegt weiter', (t) => {
  t.after(() => { cfg.fc = 'own'; bfLoad(readFileSync(new URL('../sitl/betaflight.wasm', import.meta.url))); });
  buildWorld();
  bf.mod = null; bf.err = 'Test: nicht geladen';
  cfg.fc = 'bf'; cfg.mode = 'angle'; respawn(); game.throttle = 0.6; runFor(1);
  assert.equal(bf.ready, false);
  assert.ok(game.sim.p[1] > 1, 'fliegt mit eigenem Regler: ' + game.sim.p[1].toFixed(1) + ' m');
});
