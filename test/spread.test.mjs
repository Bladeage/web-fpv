// Ziele über die Karte verteilt (Nutzerwunsch 04.11.2026): bis zu den Testecken und darum herum, ohne Hindernisse zu berühren.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld, colliders } from '../src/world.js';
import { town, TOWN } from '../src/town.js';
import { targets, initTargets, stepTargets, obstDist, REGION } from '../src/targets.js';
import { vehicles, initVehicles, stepVehicles, VEH_HALF } from '../src/vehicles.js';
import { aircraft, initAircraft, stepAircraft } from '../src/aircraft.js';

buildWorld();
const H = 1/240, far = [0, -99, 0], areas = Object.values(TOWN.areas);
const nearArea = (x, z, d) => areas.some(([ax, az]) => Math.hypot(ax - x, az - z) < d);

test('Ziel-Drohnen: Bereiche bis zu den Testecken, getrennt, und kein Ziel fliegt durch ein Hindernis', () => {
  initTargets(1);
  const moving = targets.filter(t => t.beh !== 'static');
  for (let i = 0; i < moving.length; i++) for (let j = i + 1; j < moving.length; j++)
    assert.ok(Math.hypot(moving[i].c[0] - moving[j].c[0], moving[i].c[2] - moving[j].c[2]) > 2*REGION, 'eigene Bereiche');
  assert.ok(targets.filter(t => nearArea(t.c[0], t.c[2], 40)).length >= 6, 'mindestens 6 Ziele an den Testecken');
  let dmin = 99, who = '';
  for (let i = 0; i < 240*120; i++) {
    stepTargets(H, far, far, far);
    if (i % 12) continue;
    for (const t of targets) { const d = obstDist(t.p); if (d < dmin) { dmin = d; who = t.beh + ' ' + t.p.map(x => x.toFixed(0)); } }
  }
  assert.ok(dmin > 0.6, 'kleinster Abstand zu Hindernissen ' + dmin.toFixed(2) + ' m (' + who + ')');
});

test('Fahrzeuge: an den Testecken unterwegs und geparkt, ohne Hindernisse zu berühren', () => {
  initVehicles(1);
  assert.ok(vehicles.filter(v => nearArea(v.x, v.z, 30)).length >= 5, 'mindestens 5 Fahrzeuge an den Testecken');
  const overlap = (v, c) => {   // Trennachsentest im Grundriss, nur Bauteile bis 1,5 m Höhe
    if (c.c[1] - c.h[1] > 1.5) return false;
    const ax = [[Math.cos(v.yaw), -Math.sin(v.yaw)], [Math.sin(v.yaw), Math.cos(v.yaw)], [c.cs, -c.sn], [c.sn, c.cs]];
    for (const [ux, uz] of ax) {
      const d = Math.abs((c.c[0] - v.x)*ux + (c.c[2] - v.z)*uz);
      const rv = VEH_HALF[0]*Math.abs(ax[0][0]*ux + ax[0][1]*uz) + VEH_HALF[2]*Math.abs(ax[1][0]*ux + ax[1][1]*uz);
      const rc = c.h[0]*Math.abs(ax[2][0]*ux + ax[2][1]*uz) + c.h[2]*Math.abs(ax[3][0]*ux + ax[3][1]*uz);
      if (d > rv + rc) return false;
    }
    return true;
  };
  const all = colliders.concat(town);
  for (let i = 0; i < 240*90; i++) {
    stepVehicles(H, far, far);
    if (i % 24) continue;
    for (const v of vehicles) for (const c of all) assert.ok(!overlap(v, c), v.kind + ' berührt ein Hindernis bei ' + v.x.toFixed(0) + '/' + v.z.toFixed(0));
  }
});

test('Luftfahrzeuge: großer Bewegungsradius, Hubschrauber besuchen die Testecken', () => {
  initAircraft(1);
  let rmax = 0; const seen = new Set();
  for (let i = 0; i < 240*120; i++) {
    stepAircraft(H, far, far);
    for (const t of aircraft) {
      rmax = Math.max(rmax, Math.hypot(t.p[0] - 30, t.p[2] + 10));
      if (t.kind === 'heli') areas.forEach(([x, z], k) => { if (Math.hypot(t.p[0] - x, t.p[2] - z) < 25) seen.add(k); });
    }
  }
  assert.ok(rmax > 150, 'größte Entfernung zur Kartenmitte ' + rmax.toFixed(0) + ' m');
  assert.equal(seen.size, 5, 'Hubschrauber an allen 5 Testecken: ' + seen.size);
});
