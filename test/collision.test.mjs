// P2: genauere Hitbox, Abprallen mit Drehung, harte Treffer bleiben Absturz.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { cfg, game, inp } from '../src/state.js';
import { buildWorld, colliders } from '../src/world.js';
import { PHYS, BAT, STEP, step, respawn, hoverThrottle, motorSteady } from '../src/physics.js';
import { qAxis } from '../src/math.js';

buildWorld();
const wall = colliders.find(c => c.h[0] > 3 && c.h[2] > 3 && c.h[1] > 3);   // ein Gebäude
const xAxis = [wall.cs, 0, -wall.sn];                                        // Normale einer Gebäudewand
function place(p, v, q = [0, 0, 0, 1], thr = hoverThrottle()) {
  const s = game.sim, w = motorSteady(thr, BAT.cells*4.15);
  s.p = p.slice(); s.v = v.slice(); s.q = q.slice(); s.w = [0, 0, 0]; s.grounded = false; s.om = [w, w, w, w]; game.throttle = thr;
}
function run(sec) { for (let i = 0; i < Math.round(sec/STEP) && game.state === 'fly'; i++) step(STEP); }
const rate = () => Math.hypot(...game.sim.w);
beforeEach(() => { cfg.mode = 'acro'; cfg.dmg = 'off'; respawn(); inp.pitch = inp.roll = inp.yaw = 0; });

test('Gegen eine Wand mit 4 m/s: Drohne prallt ab, kein Absturz', () => {
  const d = wall.h[0] + 0.6;
  place([wall.c[0] + xAxis[0]*d, 3, wall.c[2] + xAxis[2]*d], [-xAxis[0]*4, 0, -xAxis[2]*4]);
  run(0.25);   // Abprall kurz nach dem Aufprall messen (Aufprall nach etwa 0,1 s). Später kippt die Drohne über 90°,
               // dann zieht sie der eigene Schub von der Wand weg, das wäre kein Abprall mehr.
  assert.equal(game.state, 'fly');
  const away = game.sim.v[0]*xAxis[0] + game.sim.v[2]*xAxis[2];
  assert.ok(away > 0.3 && away < 2.5, 'prallt zurück mit ' + away + ' m/s');
});

test('Schräg aufsetzen: der Propeller trifft zuerst, die Drohne dreht sich; gerade aufsetzen kaum', () => {
  place([0, PHYS.radius + 0.25, 10], [0, -2.5, 0], [0, 0, 0, 1], 0.1);
  let level = 0; for (let i = 0; i < 60; i++) { step(STEP); level = Math.max(level, rate()); }
  respawn();
  place([0, PHYS.radius + 0.25, 10], [0, -2.5, 0], qAxis([0, 0, 1], 35*Math.PI/180), 0.1);
  let tilted = 0; for (let i = 0; i < 60; i++) { step(STEP); tilted = Math.max(tilted, rate()); }
  assert.equal(game.state, 'fly');
  // Gerade setzt die Drohne fast gleichzeitig auf allen vier Füßen auf (kurz vorher kippt der Propwash sie leicht).
  assert.ok(tilted > 3*level && tilted > 3, `schräg ${tilted} gegen gerade ${level} rad/s`);
});

test('Umgedreht gelandet: kein Absturz, Hinweis UMGEDREHT', () => {
  place([0, 0.35, 10], [0, -1, 0], qAxis([0, 0, 1], Math.PI), 0);
  run(2.5);
  assert.equal(game.state, 'fly');
  assert.ok(game.sim.flippedT > 1, 'umgedreht erkannt: ' + game.sim.flippedT);
});

test('Harter Treffer (10 m/s) bleibt ein Absturz', () => {
  cfg.dmg = 'mild';
  const d = wall.h[0] + 0.8;
  place([wall.c[0] + xAxis[0]*d, 3, wall.c[2] + xAxis[2]*d], [-xAxis[0]*10, 0, -xAxis[2]*10]);
  run(0.4);
  assert.equal(game.state, 'crashed');
});

test('Durch Hindernisse fliegen: Wand hält nicht auf, Boden bleibt fest', () => {
  cfg.ghost = true;
  const d = wall.h[0] + 0.6;
  place([wall.c[0] + xAxis[0]*d, 3, wall.c[2] + xAxis[2]*d], [-xAxis[0]*6, 0, -xAxis[2]*6]);
  run(0.6);
  const along = (game.sim.p[0] - wall.c[0])*xAxis[0] + (game.sim.p[2] - wall.c[2])*xAxis[2];
  assert.ok(along < wall.h[0], 'in der Wand: ' + along);
  respawn(); place([0, 0.4, 10], [0, -3, 0], [0, 0, 0, 1], 0); run(1);
  assert.ok(game.sim.p[1] >= PHYS.foot - 0.01, 'Boden trägt');
  cfg.ghost = false;
});

test('Zurückspulen: 5 s zurück, auch nach einem Absturz', async () => {
  const { rewind, history } = await import('../src/physics.js');
  cfg.dmg = 'mild';
  place([0, 20, 0], [0, 0, 0]);
  run(6);
  const p1 = game.sim.p.slice();
  place([0, 20, 0], [0, -20, 0], [0, 0, 0, 1], 0); run(3);
  assert.equal(game.state, 'crashed');
  assert.ok(history.length > 40);
  assert.ok(rewind(5));
  assert.equal(game.state, 'fly');
  assert.ok(Math.abs(game.sim.p[1] - p1[1]) < 3, 'Höhe wie vor dem Sturz: ' + game.sim.p[1]);
  cfg.dmg = 'off';
});
