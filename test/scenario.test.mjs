// Szenarien aus E5: Ringe, Slalom, Landung, Torkurs als Vorgabe.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { cfg, game, inp } from '../src/state.js';
import { buildWorld, gates } from '../src/world.js';
import { STEP, step, respawn, task, checkGate } from '../src/physics.js';
import { setScenario, scenDone, scenLabel, buildScenario, rings, poles, PAD, diff } from '../src/scenario.js';

buildWorld();

function run(seconds) {
  const n = Math.round(seconds/STEP);
  for (let i = 0; i < n && game.state === 'fly'; i++) step(STEP);
}
// Drohne bei p mit Geschwindigkeit v absetzen, Gas knapp unter Schweben
function place(p, v, thr = 0.24) {
  const s = game.sim;
  s.p = p.slice(); s.v = v.slice(); s.grounded = false; s.thr = thr; game.throttle = thr;
}
const along = (c, n, back, speed, off = [0, 0, 0]) =>
  [[c[0] - n[0]*back + off[0], c[1] - n[1]*back + off[1], c[2] - n[2]*back + off[2]], [n[0]*speed, n[1]*speed, n[2]*speed]];

beforeEach(() => { cfg.mode = 'angle'; inp.pitch = inp.roll = inp.yaw = 0; });

test('Vorgabe ist der Torkurs mit der alten Torprüfung', () => {
  setScenario('gates'); respawn();
  assert.equal(task.check, checkGate);
  assert.equal(task.collide, null);
  assert.equal(scenLabel(), 'TOR 1/8');
  assert.equal(buildScenario().data.length, 0);
});

test('Durchflug durch einen geneigten Ring zählt', () => {
  setScenario('rings'); respawn();
  const i = rings.findIndex(g => Math.abs(g.n[1]) > 0.05);
  assert.ok(i >= 0, 'es gibt geneigte Ringe');
  game.sim.next = i;
  const [p, v] = along(rings[i].c, rings[i].n, 1.5, 8);
  place(p, v);
  run(0.5);
  assert.equal(game.state, 'fly');
  assert.equal(game.sim.next, i + 1);
});

test('Treffer auf den Ring ergibt Absturz', () => {
  setScenario('rings'); respawn();
  const g = rings[0];
  const [p, v] = along(g.c, g.n, 1.5, 10, vScaleLocal(g.e1, diff().ringR));
  place(p, v);
  run(0.5);
  assert.equal(game.state, 'crashed');
  assert.equal(game.sim.next, 0);
});
function vScaleLocal(a, s) { return [a[0]*s, a[1]*s, a[2]*s]; }

test('Alle Ringe der Reihe nach: Ziel mit Zeit', () => {
  setScenario('rings'); respawn();
  for (let i = 0; i < rings.length; i++) {
    const [p, v] = along(rings[i].c, rings[i].n, 1, 8);
    place(p, v); game.sim.t += 2;
    run(0.3);
  }
  assert.ok(scenDone());
  assert.equal(scenLabel(), 'ZIEL');
  assert.ok(game.sim.lastLap > 0);
});

test('Slalom zählt nur auf der richtigen Seite', () => {
  setScenario('slalom'); respawn();
  const g = poles[0], h = 2;
  // falsche Seite
  let [p, v] = along([g.c[0], h, g.c[2]], g.n, 1.5, 6, vScaleLocal(g.r, -g.side*2));
  place(p, v); run(0.5);
  assert.equal(game.sim.next, 0);
  // richtige Seite
  [p, v] = along([g.c[0], h, g.c[2]], g.n, 1.5, 6, vScaleLocal(g.r, g.side*2));
  place(p, v); run(0.5);
  assert.equal(game.state, 'fly');
  assert.equal(game.sim.next, 1);
  // zu weit weg zählt nicht
  const g1 = poles[1];
  [p, v] = along([g1.c[0], h, g1.c[2]], g1.n, 1.5, 6, vScaleLocal(g1.r, g1.side*(diff().slalomW + 1)));
  place(p, v); run(0.5);
  assert.equal(game.sim.next, 1);
});

test('Stange treffen ergibt Absturz', () => {
  setScenario('slalom'); respawn();
  const g = poles[0];
  const [p, v] = along([g.c[0], 2, g.c[2]], g.n, 1.5, 10);
  place(p, v); run(0.5);
  assert.equal(game.state, 'crashed');
});

test('Landung zählt nur sanft und auf der Plattform', () => {
  setScenario('landing'); respawn();
  game.sim.t = 1;
  // hart aufsetzen: 4 m/s nach unten, kein Gas
  place([PAD.c[0], 0.6, PAD.c[2]], [0, -4, 0], 0);
  run(2.5);
  assert.equal(game.state, 'fly');
  assert.ok(!scenDone(), 'zu hart zählt nicht');
  // daneben sanft
  place([PAD.c[0] + 3, 0.4, PAD.c[2]], [0, -0.8, 0], 0.2);
  run(2.5);
  assert.ok(!scenDone(), 'neben der Plattform zählt nicht');
  // sanft auf der Plattform
  place([PAD.c[0], 0.4, PAD.c[2]], [0, -0.8, 0], 0.2);
  run(2.5);
  assert.ok(scenDone());
  assert.equal(scenLabel(), 'GELANDET');
});

test('Neustart setzt das Szenario zurück', () => {
  setScenario('landing'); respawn();
  game.sim.t = 1;
  place([PAD.c[0], 0.4, PAD.c[2]], [0, -0.8, 0], 0.2);
  run(2.5);
  assert.ok(scenDone());
  respawn();
  assert.ok(!scenDone());
  assert.equal(scenLabel(), 'LANDEN');
});

test('Freiflug: keine Aufgabe, Tore zählen nicht', () => {
  setScenario('free'); respawn();
  const g = gates[0];
  const [p, v] = along(g.c, g.n, 1.5, 8);
  place(p, v); run(0.5);
  assert.equal(game.sim.next, 0);
  assert.equal(scenLabel(), 'FREIFLUG');
});

test('Schwierigkeit: leichter Ring ist größer, schwere Landung strenger', () => {
  cfg.diff = 'easy'; const easy = diff();
  cfg.diff = 'hard'; const hard = diff();
  cfg.diff = 'mid';
  assert.ok(easy.ringR > diff().ringR && diff().ringR > hard.ringR);
  assert.ok(easy.landV > hard.landV);
  // Durchflug 1,9 m neben der Ringmitte: leicht zählt, mittel trifft den Ring
  for (const [d, ok] of [['easy', true], ['mid', false]]) {
    cfg.diff = d; setScenario('rings'); respawn();
    const g = rings[0];
    const [p, v] = along(g.c, g.n, 1.5, 4, vScaleLocal(g.e1, 1.9));
    place(p, v); run(0.6);
    assert.equal(game.sim.next === 1, ok, d);
  }
  cfg.diff = 'mid';
});
