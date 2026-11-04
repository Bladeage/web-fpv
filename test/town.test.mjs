// Kleine Stadt mit Testecken: stört keine Mission, Freiflug startet dort, Wände halten auf, Whoop passt durchs Übungsfenster.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cfg, game } from '../src/state.js';
import { buildWorld, COURSE } from '../src/world.js';
import { STEP, step, respawn, PHYS } from '../src/physics.js';
import { applyDrone } from '../src/drone.js';
import { setScenario, PAD, PICKUP, DROPS } from '../src/scenario.js';
import { ROUTES, routeAt } from '../src/vehicles.js';
import { HUNT } from '../src/targets.js';
import { town, TOWN } from '../src/town.js';

buildWorld();
after(() => { applyDrone({ preset: '5' }); setScenario('gates'); });
const reach = c => Math.hypot(c.h[0], c.h[2]);
// Ausdehnung des gedrehten Quaders in x und z
const ext = c => [Math.abs(c.h[0]*c.cs) + Math.abs(c.h[2]*c.sn), Math.abs(c.h[0]*c.sn) + Math.abs(c.h[2]*c.cs)];
const segDist = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx*dx + dz*dz, t = Math.max(0, Math.min(1, ((p[0] - a[0])*dx + (p[1] - a[1])*dz)/l2)); return Math.hypot(p[0] - a[0] - dx*t, p[1] - a[1] - dz*t); };

test('Stadt liegt im eigenen Bereich, unter 16 m, weit weg von allen Missionen', () => {
  assert.ok(town.length > 80, town.length + ' Bauteile');
  const [x0, x1, z0, z1] = TOWN.box;
  for (const c of town) {
    const p = [c.c[0], c.c[2]], r = reach(c), [ex, ez] = ext(c);
    assert.ok(p[0] - ex >= x0 - 0.1 && p[0] + ex <= x1 + 0.1 && p[1] - ez >= z0 - 0.1 && p[1] + ez <= z1 + 0.1, 'im Bereich: ' + p);
    assert.ok(c.c[1] + c.h[1] < 16, 'unter den Flugzeugen: ' + (c.c[1] + c.h[1]).toFixed(1));
    for (let i = 0; i < COURSE.length; i++) assert.ok(segDist(p, COURSE[i], COURSE[(i + 1) % COURSE.length]) - r > 12, 'Abstand zum Kurs');
    for (const R of ROUTES) for (let s = 0; s < 1500; s += 4) { const q = routeAt(R, s); assert.ok(Math.hypot(q.x - p[0], q.z - p[1]) - r > 6, 'Abstand zur Fahrzeugstrecke'); }
    for (const q of [PAD.c, PICKUP, ...DROPS]) assert.ok(Math.hypot(q[0] - p[0], q[2] - p[1]) - r > 10, 'Abstand zu Plattformen');
    assert.ok(Math.hypot(HUNT.center[0] - p[0], HUNT.center[2] - p[1]) - r > 70, 'Abstand zum Jagd-Gebiet');
  }
});

test('Freiflug startet in der Stadt auf freiem Platz, andere Modi in der Mitte', () => {
  cfg.dmg = 'off'; applyDrone({ preset: '5' });
  setScenario('free'); respawn();
  assert.ok(Math.hypot(game.sim.p[0] - TOWN.start[0], game.sim.p[2] - TOWN.start[1]) < 0.01);
  for (const c of town) assert.ok(Math.hypot(c.c[0] - TOWN.start[0], c.c[2] - TOWN.start[1]) - reach(c) > 2 || c.c[1] - c.h[1] > 3, 'Startplatz frei');
  game.throttle = 0; for (let i = 0; i < 240; i++) step(STEP);
  assert.equal(game.state, 'fly');
  setScenario('gates'); respawn();
  assert.ok(Math.hypot(game.sim.p[0], game.sim.p[2]) < 0.01);
});

test('Hauswand hält die Drohne auf; Whoop fliegt durch das 1-m-Übungsfenster', () => {
  cfg.dmg = 'off'; cfg.ghost = false; setScenario('free');
  applyDrone({ preset: '5' }); respawn();
  // offenes Haus: Westwand bei x = -125, Fenster bei z = -61 von 0,9 bis 2,3 m. Anflug von Westen in 0,4 m Höhe: Wand
  let s = game.sim; s.p = [-128, 0.5, -63]; s.v = [6, 0, 0]; s.grounded = false; game.throttle = 0.3;
  for (let i = 0; i < 240; i++) step(STEP);
  assert.ok(game.sim.p[0] < -125, 'vor der Wand geblieben: x ' + game.sim.p[0].toFixed(2));
  // Spielplatz: Fenster 1,0 m Weite bei x = -123, Höhe 0,8 m, z = -88; Whoop von Süden nach Norden hindurch
  applyDrone({ preset: 'whoop' }); respawn();
  s = game.sim; s.p = [-123, 0.8, -86]; s.v = [0, 0, -4]; s.q = [0, 0, 0, 1]; s.grounded = false; game.throttle = 0.6;
  let minZ = 0; for (let i = 0; i < 480; i++) { step(STEP); minZ = Math.min(minZ, game.sim.p[2]); game.sim.v[1] = 0; game.sim.p[1] = 0.8; }
  assert.ok(minZ < -89, 'durchgeflogen: z ' + minZ.toFixed(2));
});
