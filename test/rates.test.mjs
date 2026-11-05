// Raten wie Betaflight „Actual“ (Prompt 73): Formel, beide Regler drehen mit der eingestellten Rate.
// Dazu: Neustart setzt den Bildmodus auf normal.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cfg, game, inp } from '../src/state.js';
import { buildWorld } from '../src/world.js';
import { STEP, step, respawn, actualRate } from '../src/physics.js';
import { applyDrone } from '../src/drone.js';
import { setScenario } from '../src/scenario.js';
import { bf, bfLoad, bfRates } from '../src/bf.js';

const keep = JSON.parse(JSON.stringify(cfg.rates));
after(() => { cfg.rates = keep; cfg.fc = 'own'; });
buildWorld();
bfLoad(readFileSync(new URL('../sitl/betaflight.wasm', import.meta.url)));
const D = 180/Math.PI;

test('Raten: Formel wie Betaflight Actual', () => {
  const r = [200, 600, 0];
  assert.equal(actualRate(0, r), 0);
  assert.ok(Math.abs(actualRate(1, r)*D - 600) < 1e-9, 'voll = Maximum');
  assert.ok(Math.abs(actualRate(-1, r)*D + 600) < 1e-9);
  assert.ok(Math.abs(actualRate(0.5, r)*D - 200) < 1e-9, 'halb: 0,5*200 + 400*0,25');
  assert.ok(Math.abs(actualRate(0.01, [200, 600, 0])*D/0.01 - 200) < 5, 'Steigung in der Mitte = Mitte');
  assert.ok(actualRate(0.5, [200, 600, 60]) < actualRate(0.5, [200, 600, 0]), 'Expo macht die Mitte weicher');
});

// Acro, voller Rollausschlag in der Luft: gemessene Rollrate nach 0,5 s in °/s
function rollRate(fc, rp) {
  cfg.fc = fc; cfg.mode = 'acro'; cfg.dmg = 'off'; cfg.rates = { rp, yaw: [190, 290, 30] };
  applyDrone({ preset: '5' }); setScenario('free'); game.throttle = 0; respawn(); bfRates();
  if (fc === 'bf') assert.equal(bf.ready, true, bf.err);
  const s = game.sim; s.p = [0, 40, 0]; s.v = [0, 0, 0];
  game.throttle = 0; inp.pitch = inp.yaw = 0; inp.roll = 0;
  for (let i = 0; i < 0.3/STEP; i++) step(STEP);   // Betaflight schaltet nur mit Gas unten scharf
  if (fc === 'bf') assert.equal(bf.x.bf_flag(0), 1, 'Betaflight scharf');
  game.throttle = 0.5;
  for (let i = 0; i < 0.4/STEP; i++) step(STEP);
  inp.roll = 1;
  let w = 0;
  for (let i = 0; i < 0.5/STEP; i++) { step(STEP); w = Math.abs(game.sim.w[2])*D; }
  inp.roll = 0;
  return w;
}
for (const fc of ['own', 'bf']) {
  test(`Raten: ${fc === 'bf' ? 'Betaflight' : 'eigener Regler'} dreht mit der eingestellten Maximal-Rate`, () => {
    const slow = rollRate(fc, [150, 150, 0]), fast = rollRate(fc, [400, 400, 0]);
    assert.ok(Math.abs(slow - 150) < 25, 'langsam ~150 °/s: ' + slow.toFixed(0));
    assert.ok(Math.abs(fast - 400) < 50, 'schnell ~400 °/s: ' + fast.toFixed(0));
  });
}

test('Neustart setzt Wärmebild und Nachtsicht auf normal', () => {
  cfg.fc = 'own';
  for (const v of ['thermal', 'night']) { cfg.vision = v; respawn(); assert.equal(cfg.vision, 'normal'); }
});

test('Betaflight: Gas oben beim Start, dann runter: schaltet ohne Neustart scharf', () => {
  cfg.fc = 'bf'; cfg.mode = 'angle'; setScenario('free'); game.throttle = 0; respawn();
  game.throttle = 0.5;
  for (let i = 0; i < 0.3/STEP; i++) step(STEP);
  assert.equal(bf.x.bf_flag(0), 0, 'mit Gas oben nicht scharf (wie Betaflight)');
  game.throttle = 0;
  for (let i = 0; i < 0.3/STEP; i++) step(STEP);
  assert.equal(bf.x.bf_flag(0), 1, 'nach Gas runter scharf');
  game.throttle = 0.6;
  for (let i = 0; i < 1/STEP; i++) step(STEP);
  assert.ok(game.sim.p[1] > 1, 'hebt ab: ' + game.sim.p[1].toFixed(2));
});
