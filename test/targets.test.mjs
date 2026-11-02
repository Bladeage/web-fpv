// Ziel-Drohnen (E6): Treffer über den Bewegungsweg, Absturz, Aufgabe, Verhalten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cfg, game, inp } from '../src/state.js';
import { buildWorld } from '../src/world.js';
import { STEP, step, respawn } from '../src/physics.js';
import { setScenario, scenDone, scenLabel } from '../src/scenario.js';
import { targets, initTargets, stepTargets, sweptDist, HUNT, REGION } from '../src/targets.js';

buildWorld();
const H = 1/240;

test('Frontalbegegnung mit 40 m/s wird erkannt', () => {
  // Spieler 20 m/s nach -Z, Ziel 20 m/s nach +Z, Schritt 1/240 s: Wege kreuzen sich zwischen den Endpunkten
  const a = [0, 10, 0.05], b = [0, 10, 0.05 - 20*H], t0 = [0.1, 10, -0.05], t1 = [0.1, 10, -0.05 + 20*H];
  assert.ok(sweptDist(a, b, t0, t1) < HUNT.hitR);
  initTargets();
  const t = targets[3]; t.p = t0.slice(); t.v = [0, 0, 20]; t.wp = [0.1, 10, 50];
  assert.equal(stepTargets(H, a, b, b), 1);
  assert.equal(t.state, 'fall');
});

test('Treffer zählt einmal, Ziel stürzt ab und liegt am Boden', () => {
  initTargets();
  const t = targets[0], p = t.p.slice();
  assert.equal(stepTargets(H, p, p, p) >= 1, true);
  let more = 0;
  for (let i = 0; i < 240*6; i++) more += stepTargets(H, t.p, t.p, t.p);
  assert.equal(more, 0, 'zählt nicht noch einmal');
  assert.equal(t.state, 'down');
  assert.ok(t.p[1] <= 0.11);
});

test('Nach x Treffern ist die Aufgabe erfüllt', () => {
  cfg.huntX = 3; setScenario('hunt'); respawn();
  inp.pitch = inp.roll = inp.yaw = 0;
  for (let i = 0; i < 3; i++) {
    const t = targets[i], s = game.sim;
    s.p = t.p.slice(); s.v = [0, 0, 0]; s.grounded = false; s.thr = 0.24; game.throttle = 0.24;
    for (let k = 0; k < 2; k++) step(STEP);
    assert.equal(t.state, 'fall', 'Ziel ' + i);
  }
  assert.ok(scenDone());
  assert.equal(scenLabel(), 'ZIEL');
  cfg.huntX = 5; setScenario('gates');
});

test('Ausweichende Drohne vergrößert den Abstand, dumme nicht', () => {
  initTargets();
  const ev = targets.find(t => t.beh === 'evade'), dumb = targets.find(t => t.route === 'line');
  const dist = (t, pl) => Math.hypot(t.p[0]-pl[0], t.p[1]-pl[1], t.p[2]-pl[2]);
  const plE = [ev.p[0] + 10, ev.p[1], ev.p[2]], plD = [dumb.p[0] + 10, dumb.p[1], dumb.p[2]];
  const far = [999, 999, 999];
  const e0 = dist(ev, plE);
  for (let i = 0; i < 240; i++) stepTargets(H, far, far, plE);
  assert.ok(dist(ev, plE) > e0 + 5, 'weicht aus');
  initTargets();
  stepTargets(H, far, far, plD);
  const free = dumb.p.slice();
  initTargets(); stepTargets(H, far, far, far);
  assert.deepEqual(free, dumb.p, 'Route hängt nicht vom Spieler ab');
});

test('Zufällige Drohnen bleiben im Gebiet', () => {
  initTargets();
  const far = [999, 999, 999];
  for (let i = 0; i < 240*60; i++) stepTargets(H, far, far, far);
  for (const t of targets.filter(t => t.beh !== 'dumb')) {
    assert.ok(Math.hypot(t.p[0] - HUNT.center[0], t.p[2] - HUNT.center[2]) < HUNT.radius + 15);
  }
});

test('Schwebende Ziele stehen still, bewegte bleiben in ihrem eigenen Bereich', () => {
  initTargets();
  const st = targets.filter(t => t.beh === 'static');
  assert.equal(st.length, 3);
  const start = st.map(t => t.p.slice());
  const far = [999, 999, 999];
  const moving = targets.filter(t => t.beh !== 'static');
  let worst = 0;
  for (let i = 0; i < 240*60; i++) {
    stepTargets(H, far, far, far);
    for (const t of moving) worst = Math.max(worst, Math.hypot(t.p[0] - t.c[0], t.p[2] - t.c[2]));
  }
  st.forEach((t, i) => assert.deepEqual(t.p, start[i]));
  assert.ok(worst < REGION + 1, 'größte Entfernung vom eigenen Bereich: ' + worst);
  // Bereiche überlappen nicht: Mittelpunkte weiter auseinander als zwei Bereichsradien
  for (let i = 0; i < moving.length; i++) for (let j = i + 1; j < moving.length; j++) {
    const d = Math.hypot(moving[i].c[0] - moving[j].c[0], moving[i].c[2] - moving[j].c[2]);
    assert.ok(d > 2*(REGION + 1) - 0.5, `Bereiche ${i} und ${j}: ${d.toFixed(1)} m`);
  }
});
