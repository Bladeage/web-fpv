// Jagd Boden: Fahrzeuge stehen oder fahren, Fahrspur frei von Hindernissen, Treffer zählen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cfg, game, inp } from '../src/state.js';
import { buildWorld, colliders } from '../src/world.js';
import { STEP, step, respawn } from '../src/physics.js';
import { setScenario, scenDone, scenLabel } from '../src/scenario.js';
import { vehicles, initVehicles, stepVehicles, routeAt, ROUTE_LEN, VEH_HALF } from '../src/vehicles.js';

buildWorld();
const H = 1/240, far = [999, 999, 999];

// Genau: gedrehtes Rechteck des Fahrzeugs gegen gedrehtes Rechteck des Hindernisses (Trennachsen-Test, 2D),
// nur Hindernisse, die bis in Fahrzeughöhe reichen. Sicherheitsabstand 0,3 m.
function rect(x, z, hx, hz, cs, sn) {   // Ecken; lokale x-Achse = (cs, -sn), z-Achse = (sn, cs) wie in world.js
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [x + a*hx*cs + b*hz*sn, z - a*hx*sn + b*hz*cs]);
}
function overlap(A, B) {
  for (const P of [A, B]) for (let i = 0; i < 4; i++) {
    const p = P[i], q = P[(i + 1) % 4], n = [q[1] - p[1], p[0] - q[0]];
    const pr = R => R.map(c => c[0]*n[0] + c[1]*n[1]);
    const a = pr(A), b = pr(B);
    if (Math.max(...a) < Math.min(...b) || Math.max(...b) < Math.min(...a)) return false;
  }
  return true;
}
function blocked(x, z, yaw) {
  const m = 0.3, V = rect(x, z, VEH_HALF[0] + m, VEH_HALF[2] + m, Math.cos(yaw), Math.sin(yaw));
  return colliders.some(c => c.c[1] - c.h[1] < VEH_HALF[1]*2 && overlap(V, rect(c.c[0], c.c[2], c.h[0], c.h[2], c.cs, c.sn)));
}

test('Fahrspur und Parkplätze sind frei von Bäumen, Pfeilern und Toren', () => {
  for (let s = 0; s < ROUTE_LEN; s += 0.5) { const p = routeAt(s); assert.ok(!blocked(p.x, p.z, p.yaw), `Spur bei ${s.toFixed(1)} m: ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`); }
  initVehicles();
  for (const v of vehicles.filter(v => v.kind === 'parked')) assert.ok(!blocked(v.x, v.z, v.yaw), `Parkplatz ${v.x}, ${v.z}`);
});

test('Stehende bleiben stehen, fahrende fahren mit ihrem Tempo', () => {
  initVehicles();
  const start = vehicles.map(v => [v.x, v.z]);
  for (let i = 0; i < 240; i++) stepVehicles(H, far, far);
  vehicles.forEach((v, i) => {
    const d = Math.hypot(v.x - start[i][0], v.z - start[i][1]);
    if (v.kind === 'parked') assert.equal(d, 0);
    else assert.ok(d > v.speed*0.8 && d < v.speed*1.01, `${v.kind}: ${d} m in 1 s bei ${v.speed} m/s`);
  });
});

test('Treffer zählt einmal, nach x Treffern ist die Aufgabe erfüllt', () => {
  cfg.huntX = 2; setScenario('hunt2'); respawn(); inp.pitch = inp.roll = inp.yaw = 0;
  assert.equal(scenLabel(), 'TREFFER 0/2');
  for (const v of vehicles.filter(v => v.kind === 'parked').slice(0, 2)) {
    const s = game.sim;
    s.p = [v.x, 1.2, v.z + 3]; s.v = [0, 0, -12]; s.grounded = false;
    for (let k = 0; k < 120 && v.state !== 'hit'; k++) step(STEP);
    assert.equal(v.state, 'hit');
    assert.equal(stepVehicles(H, [v.x, 1, v.z], [v.x, 1, v.z]), 0, 'zählt nicht noch einmal');
  }
  assert.ok(scenDone());
  cfg.huntX = 5; setScenario('gates');
});
