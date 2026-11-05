// Zwei Effekte nach dem Vergleich mit SimITL (Prompt 75): Druckpunkt über dem Schwerpunkt und Verzögerung im Motorregler.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cfg, game, inp } from '../src/state.js';
import { buildWorld } from '../src/world.js';
import { PHYS, STEP, step, respawn } from '../src/physics.js';
import { applyDrone } from '../src/drone.js';
import { setScenario } from '../src/scenario.js';

const keep = { cpY: PHYS.cpY, escDelay: PHYS.escDelay };
after(() => Object.assign(PHYS, keep));
buildWorld();
function setup() {
  cfg.fc = 'own'; cfg.mode = 'acro'; cfg.dmg = 'off'; applyDrone({ preset: '5' }); setScenario('free'); game.throttle = 0; respawn();
  inp.pitch = inp.roll = inp.yaw = 0;
}

test('Druckpunkt: im schnellen Vorwärtsflug hebt sich die Nase (Motoren aus, nur Luft)', () => {
  const pitchRate = cp => {
    PHYS.cpY = cp; setup(); game.armed = false;
    const s = game.sim; s.p = [0, 60, 0]; s.v = [0, 0, -20]; s.q = [0, 0, 0, 1]; s.w = [0, 0, 0];
    for (let i = 0; i < 0.2/STEP; i++) { game.armed = false; step(STEP); }
    return s.w[0];
  };
  assert.ok(Math.abs(pitchRate(0)) < 1e-6, 'ohne Versatz kein Moment');
  const w = pitchRate(keep.cpY);
  assert.ok(w > 0.05, 'Nase hebt sich: ' + w.toFixed(3) + ' rad/s');
  assert.ok(w < 2, 'aber nur leicht');
});

test('ESC-Verzögerung: Motoren reagieren etwas später auf einen Gas-Sprung', () => {
  const om = d => {
    PHYS.escDelay = d; setup();
    const s = game.sim; s.p = [0, 30, 0];
    for (let i = 0; i < 0.3/STEP; i++) step(STEP);
    game.throttle = 0.8; step(STEP);
    return s.om[0];
  };
  const fast = om(0), slow = om(keep.escDelay);
  assert.ok(slow < fast, `mit Verzögerung langsamer: ${slow.toFixed(0)} < ${fast.toFixed(0)} rad/s`);
  assert.ok(slow > 0.5*fast, 'aber nur wenig');
});
