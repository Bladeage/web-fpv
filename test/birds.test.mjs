// Vögel (Prompt 68): wenige, einzeln, je Start zufällig verteilt (sitzen, picken, fliegen), fliehen vor der Drohne,
// keine Kollision mit der Drohne, bleiben auf der Karte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cfg, game, inp } from '../src/state.js';
import { buildWorld, rng } from '../src/world.js';
import { STEP, step, respawn } from '../src/physics.js';
import { setScenario } from '../src/scenario.js';
import { obstDist } from '../src/targets.js';
import { BIRD, birds, initBirds, stepBirds, buildBirdMesh } from '../src/birds.js';

buildWorld();
const far = [0, 500, 0];   // Drohne weit weg

test('Vögel: wenige, verteilt, in allen drei Zuständen, frei von Hindernissen', () => {
  const states = new Set();
  for (let seed = 1; seed <= 20; seed++) {
    initBirds(rng(seed));
    assert.ok(birds.length > 0 && birds.length <= 8, 'Anzahl ' + birds.length);
    for (const b of birds) {
      states.add(b.state);
      assert.ok(Math.hypot(b.p[0], b.p[2]) > 10 || b.state === 'fly', 'nicht auf dem Startplatz');
      if (b.state !== 'fly') assert.ok(obstDist([b.p[0], b.p[1] + 0.08, b.p[2]]) > 0, 'sitzt nicht in einem Hindernis');
    }
    const spots = new Set(birds.filter(b => b.state !== 'fly').map(b => b.spot));
    assert.equal(spots.size, birds.filter(b => b.state !== 'fly').length, 'jeder Vogel an eigenem Ort (keine Schwärme)');
  }
  assert.deepEqual([...states].sort(), ['fly', 'ground', 'perch']);
});

test('Vögel: jeder Start verteilt anders', () => {
  initBirds(rng(3)); const a = birds.map(b => b.p.join());
  initBirds(rng(4)); const b = birds.map(b => b.p.join());
  assert.notDeepEqual(a, b);
});

test('Vögel: 3 Minuten ohne Drohne: bleiben auf der Karte, wechseln den Ort, landen wieder', () => {
  const R = rng(7); initBirds(R);
  const start = birds.map(b => b.p.slice()), seen = new Set();
  for (let i = 0; i < 180*30; i++) {
    stepBirds(1/30, far, R);
    for (const b of birds) {
      assert.ok(b.p.every(Number.isFinite), 'Zahl');
      assert.ok(b.p[1] >= 0 && b.p[1] < 30 && Math.abs(b.p[0]) < 590 && Math.abs(b.p[2]) < 590, 'auf der Karte: ' + b.p.map(x => x.toFixed(1)));
      seen.add(b.state);
    }
  }
  const moved = birds.filter((b, i) => Math.hypot(b.p[0] - start[i][0], b.p[2] - start[i][2]) > 20).length;
  assert.ok(moved >= birds.length/2, 'die meisten sind umgezogen: ' + moved);
  assert.ok(seen.has('ground') && seen.has('perch') && seen.has('fly'));
});

test('Vögel: fliehen, wenn die Drohne näher als 8 m kommt', () => {
  const R = rng(11); initBirds(R);
  const b = birds.find(x => x.state !== 'fly') || birds[0];
  if (b.state === 'fly') { b.el = b.dur; stepBirds(0.01, far, R); }
  const drone = [b.p[0] + BIRD.scare - 1, b.p[1] + 1, b.p[2]];
  stepBirds(1/30, drone, R);
  assert.equal(b.state, 'fly');
  for (let i = 0; i < 90; i++) stepBirds(1/30, drone, R);
  assert.ok(Math.hypot(b.p[0] - drone[0], b.p[2] - drone[2]) > BIRD.scare + 5, 'weg von der Drohne');
  assert.ok(Math.hypot(b.spot.p[0] - drone[0], b.spot.p[2] - drone[2]) > BIRD.flee, 'Ziel weit weg');
});

test('Vögel: keine Kollision, Drohne fliegt durch einen Vogel ohne Folgen; Start verteilt neu', () => {
  cfg.fc = 'own'; cfg.dmg = 'off'; setScenario('free');
  const fly = withBird => {
    game.throttle = 0.45; inp.pitch = inp.roll = inp.yaw = 0;
    respawn();
    assert.ok(birds.length > 0, 'Start verteilt Vögel');
    if (withBird) { const b = birds[0]; b.state = 'perch'; b.p = [0, 3, -5]; } else birds.length = 0;
    const s = game.sim; s.p = [0, 3, -3]; s.v = [0, 0, -8]; s.q = [0, 0, 0, 1]; s.w = [0, 0, 0];
    for (let i = 0; i < 120; i++) step(STEP);
    assert.equal(game.state, 'fly');
    return s.p.slice();
  };
  assert.deepEqual(fly(true), fly(false), 'Vogel ändert nichts am Flug');
  assert.ok(buildBirdMesh(0, 'body').length > 0 && buildBirdMesh(2, 'wing').length > 0);
});
