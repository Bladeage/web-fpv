// Pilot hinter dem Startplatz (Prompt 87): Standort je Szenario, dreht langsam zur Drohne, Kopf schaut nach.
// Signal geht von seiner Funke aus, fällt logarithmisch mit dem Abstand im Raum.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { game } from '../src/state.js';
import { buildWorld } from '../src/world.js';
import { setScenario, SCENARIOS } from '../src/scenario.js';
import { obstDist } from '../src/targets.js';
import { pilot, stepPilot, buildPilotMesh, PILOT_POS } from '../src/pilot.js';
import { PILOT, signalTarget } from '../src/signal.js';

buildWorld();

test('Pilot: steht in jedem Szenario frei hinter dem Startplatz, Signal geht von seiner Funke aus', () => {
  for (const s of SCENARIOS) {
    setScenario(s.id);
    const [hx, hz] = game.home;
    assert.ok(pilot.p[2] - hz > 2, s.id + ': hinter dem Start (+z)');
    assert.ok(Math.hypot(pilot.p[0] - hx, pilot.p[2] - hz) < 6, s.id + ': nah am Start');
    assert.ok(obstDist([pilot.p[0], 0.9, pilot.p[2]]) > 1, s.id + ': steht frei');
    assert.deepEqual([PILOT[0], PILOT[1], PILOT[2]], [pilot.p[0], PILOT_POS.antenna, pilot.p[2]], s.id + ': Signalquelle = Funke');
  }
  assert.ok(buildPilotMesh('body').length > 0 && buildPilotMesh('head').length > 0);
});

test('Pilot: dreht sich langsam zur Drohne, Kopf folgt schneller und schaut nach oben', () => {
  setScenario('free');
  const drone = [pilot.p[0] + 20, 15, pilot.p[2]];   // rechts vom Piloten, hoch
  const want = Math.atan2(-20, 0);
  const y0 = pilot.yaw;
  stepPilot(0.1, drone);
  assert.ok(Math.abs(pilot.yaw - y0) <= PILOT_POS.turn*0.1 + 1e-9, 'langsam: höchstens 1,2 rad/s');
  for (let i = 0; i < 100; i++) stepPilot(0.05, drone);
  const err = Math.abs(Math.atan2(Math.sin(want - pilot.yaw - pilot.head), Math.cos(want - pilot.yaw - pilot.head)));
  assert.ok(err < 0.1, 'Blick zur Drohne nach 5 s, Rest ' + err.toFixed(2));
  assert.ok(pilot.headPitch > 0.3, 'schaut nach oben: ' + pilot.headPitch.toFixed(2));
});

test('Signal: voll in der Nähe, fällt mit dem Abstand im Raum, Video vor der Steuerung', () => {
  setScenario('free');
  const at = (dx, y, dz) => signalTarget([PILOT[0] + dx, y, PILOT[2] + dz]);
  assert.equal(at(0, 20, -50).video, 100);
  const a = at(0, 20, -180), b = at(0, 20, -360);
  assert.ok(a.video > b.video && b.video > 0, 'fällt mit dem Abstand');
  assert.ok(Math.abs((at(0, 20, -180).video - at(0, 20, -360).video) - (at(0, 20, -360).video - Math.max(0, at(0, 20, -720).video))) < 40, 'grob gleich viel je Verdopplung');
  assert.ok(at(0, 300, -10).video < 100, 'Höhe zählt mit');
  assert.ok(b.lq > b.video, 'Steuerung hält länger als Video');
});
