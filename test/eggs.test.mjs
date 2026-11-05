// Ostereier (Prompt 67): liegen auf einer Fläche, stecken in keinem Hindernis, sind mit der Drohne erreichbar,
// werden beim Berühren gefunden und gespeichert, und liegen in jedem Modus gleich.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cfg, game, inp, eggsFound } from '../src/state.js';
import { buildWorld } from '../src/world.js';
import { STEP, step, respawn } from '../src/physics.js';
import { setScenario } from '../src/scenario.js';
import { obstDist } from '../src/targets.js';
import { EGGS, EGG, checkEggs, buildEggMesh } from '../src/eggs.js';

buildWorld();

test('Ostereier: liegen auf einer Fläche, frei, mit Platz für die Drohne darüber', () => {
  assert.ok(EGGS.length >= 10, 'mindestens 10 Eier: ' + EGGS.length);
  for (const [p, name] of EGGS) {
    assert.ok(obstDist(p) > EGG.ry*0.8, name + ': steckt nicht im Hindernis, Abstand ' + obstDist(p).toFixed(3));
    const below = [p[0], p[1] - EGG.ry - 0.02, p[2]];
    assert.ok(below[1] <= 0.01 || obstDist(below) === 0, name + ': liegt auf etwas');
    assert.ok(obstDist([p[0], p[1] + 0.35, p[2]]) > 0.2, name + ': Platz für die Drohne darüber');
  }
});

test('Ostereier: Abstand untereinander und zu Karte', () => {
  for (let i = 0; i < EGGS.length; i++) {
    const p = EGGS[i][0];
    assert.ok(Math.abs(p[0]) < 590 && Math.abs(p[2]) < 590 && p[1] < 16, EGGS[i][1] + ': auf der Karte und unter 16 m');
    for (let j = 0; j < i; j++) assert.ok(Math.hypot(p[0] - EGGS[j][0][0], p[2] - EGGS[j][0][2]) > 3, EGGS[i][1] + ' / ' + EGGS[j][1]);
  }
});

test('Ostereier: Berühren findet, kein doppeltes Finden, Modell vorhanden', () => {
  const found = [], p = EGGS[0][0];
  assert.equal(checkEggs([p[0] - 1, p[1], p[2]], [p[0] + 1, p[1], p[2]], 0.05, found), 0);
  assert.deepEqual(found, [0]);
  assert.equal(checkEggs([p[0] - 1, p[1], p[2]], [p[0] + 1, p[1], p[2]], 0.05, found), -1, 'schon gefunden');
  assert.equal(checkEggs([p[0], p[1] + 2, p[2]], [p[0] + 1, p[1] + 2, p[2]], 0.05, found), -1);
  assert.ok(buildEggMesh(3).length > 0);
});

for (const scen of ['gates', 'free', 'hunt']) {
  test(`Ostereier: Drohne fliegt durch ein Ei und findet es (${scen})`, () => {
    eggsFound.length = 0;
    cfg.fc = 'own'; cfg.dmg = 'off'; setScenario(scen); respawn();
    const p = EGGS[11][0];   // Säule nahe dem Start
    const s = game.sim; s.p = [p[0] - 1, p[1] + 0.05, p[2]]; s.v = [10, 0, 0]; s.w = [0, 0, 0]; s.q = [0, 0, 0, 1];
    game.throttle = 0.5; inp.pitch = inp.roll = inp.yaw = 0;
    for (let i = 0; i < 48; i++) step(STEP);
    assert.deepEqual(eggsFound, [11]);
    eggsFound.length = 0;
  });
}
