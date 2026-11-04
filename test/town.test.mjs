// Testecken: über die Karte verteilt, stören keine Mission, Wände halten auf, Whoop passt durchs Übungsfenster.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cfg, game } from '../src/state.js';
import { buildWorld, COURSE, colliders } from '../src/world.js';
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

test('Testecken liegen in ihren Bereichen, weit auseinander, unter 16 m, fern aller Missionen', () => {
  assert.ok(town.length > 80, town.length + ' Bauteile');
  const areas = Object.values(TOWN.areas);
  for (let i = 0; i < areas.length; i++) for (let j = i + 1; j < areas.length; j++)
    assert.ok(Math.hypot(areas[i][0] - areas[j][0], areas[i][1] - areas[j][1]) > 100, 'Ecken mindestens 100 m auseinander');
  for (const c of town) {
    const p = [c.c[0], c.c[2]], r = reach(c), [ex, ez] = ext(c);
    assert.ok(areas.some(([x, z, h]) => Math.abs(p[0] - x) + ex <= h + 0.1 && Math.abs(p[1] - z) + ez <= h + 0.1), 'in einem Bereich: ' + p);
    assert.ok(c.c[1] + c.h[1] < 16, 'unter den Flugzeugen: ' + (c.c[1] + c.h[1]).toFixed(1));
    for (let i = 0; i < COURSE.length; i++) assert.ok(segDist(p, COURSE[i], COURSE[(i + 1) % COURSE.length]) - r > 12, 'Abstand zum Kurs');
    for (const R of ROUTES) for (let s = 0; s < 1500; s += 4) { const q = routeAt(R, s); assert.ok(Math.hypot(q.x - p[0], q.z - p[1]) - r > 6, 'Abstand zur Fahrzeugstrecke'); }
    for (const q of [PAD.c, PICKUP, ...DROPS]) assert.ok(Math.hypot(q[0] - p[0], q[2] - p[1]) - r > 10, 'Abstand zu Plattformen');
    assert.ok(Math.hypot(HUNT.center[0] - p[0], HUNT.center[2] - p[1]) - r > 70, 'Abstand zum Jagd-Gebiet');
  }
});

test('Testecken stehen nicht in bestehenden Hindernissen', () => {
  for (const [x, z, h] of Object.values(TOWN.areas))
    for (const c of colliders) assert.ok(Math.abs(c.c[0] - x) > h + reach(c) || Math.abs(c.c[2] - z) > h + reach(c), 'frei bei ' + x + '/' + z);
});

test('Hauswand hält die Drohne auf; Whoop fliegt durch das 1-m-Übungsfenster', () => {
  cfg.dmg = 'off'; cfg.ghost = false; setScenario('free');
  applyDrone({ preset: '5' }); respawn();
  // offenes Haus: Westwand bei x = X - 5, Fenster mittig von 0,9 bis 2,3 m. Anflug von Westen 2 m neben der Mitte in 0,5 m Höhe: Wand
  const [HX, HZ] = TOWN.areas.haus;
  let s = game.sim; s.p = [HX - 8, 0.5, HZ - 2]; s.v = [6, 0, 0]; s.grounded = false; game.throttle = 0.3;
  for (let i = 0; i < 240; i++) step(STEP);
  assert.ok(game.sim.p[0] < HX - 5, 'vor der Wand geblieben: x ' + game.sim.p[0].toFixed(2));
  // Spielplatz: Fenster 1,0 m Weite bei x = X - 3, Höhe 0,8 m, z = Z; Whoop hindurch
  const [SX, SZ] = TOWN.areas.spiel;
  applyDrone({ preset: 'whoop' }); respawn();
  s = game.sim; s.p = [SX - 3, 0.8, SZ + 2]; s.v = [0, 0, -4]; s.q = [0, 0, 0, 1]; s.grounded = false; game.throttle = 0.6;
  let minZ = 1e9; for (let i = 0; i < 480; i++) { step(STEP); minZ = Math.min(minZ, game.sim.p[2]); game.sim.v[1] = 0; game.sim.p[1] = 0.8; }
  assert.ok(minZ < SZ - 1, 'durchgeflogen: z ' + minZ.toFixed(2));
});
