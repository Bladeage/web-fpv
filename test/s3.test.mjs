// S3 (Prompt 180/188): Fahrzeuge des Taktischen Flugs und die Verfolgung auf echten Straßen (Monschau), Spielkarte unverändert.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { cfg, game } from '../src/state.js';
import { buildWorld } from '../src/world.js';
import { respawn, STEP } from '../src/physics.js';
import { setScenario, setLayoutSeed, followLead, scenTarget } from '../src/scenario.js';
import { rw, rwApply, groundH, placeReal } from '../src/realworld.js';
import { vehicles, stepVehicles, VEH_HALF, ROUTES } from '../src/vehicles.js';
import { rwRoads, roadLenNear } from '../src/roads.js';

buildWorld();
const f = n => readFileSync(new URL('../realworld/monschau.' + n, import.meta.url)), meta = JSON.parse(f('json')), q = inflateSync(f('dgm'));
const un = n => { const b = inflateSync(f(n)); return new Int16Array(b.buffer, b.byteOffset, b.byteLength/2); };
rwApply({ meta, q: new Uint16Array(q.buffer, q.byteOffset, q.byteLength/2), b16: un('bld'), t16: un('trees') },
  { water: new Uint8Array(inflateSync(f('water'))), features: JSON.parse(f('features.json')) });
after(() => { rw.on = false; setScenario('gates'); });

test('Monschau hat genug Straßen für die Modi (mindestens 500 m im Startgebiet)', () => {
  rw.on = true; assert.ok(roadLenNear(rwRoads(), [0, 0], rw.size*0.75) > 5000); rw.on = false;
});

test('Jagd Fahrzeuge in der echten Welt: auf den Straßen, am Boden, fahren mit Höhe, Treffer in der richtigen Höhe', () => {
  rw.ready = true; setLayoutSeed(5); cfg.diff = 'mid';
  setScenario('hunt2', true); respawn();
  const parked = vehicles.filter(v => v.kind === 'parked'), driving = vehicles.filter(v => v.kind !== 'parked');
  assert.ok(parked.length >= 2 && driving.length >= 3, parked.length + ' geparkt, ' + driving.length + ' fahrend');
  const W = placeReal();
  for (const v of parked) { assert.ok(Math.abs(v.y - groundH(v.x, v.z)) < 0.01, 'geparkt am Boden'); assert.ok(!W.wet(v.x, v.z)); }
  for (let k = 0; k < 2400; k++) stepVehicles(STEP, [0, -500, 0], [0, -500, 0]);   // 10 s fahren, ohne Treffer
  for (const v of driving) {
    assert.ok(v.y > groundH(v.x, v.z) - 0.31 && v.y < groundH(v.x, v.z) + 13, 'auf Straße oder Brücke');
    assert.ok(Math.hypot(v.x - meta.home[0], v.z - meta.home[1]) < 1500, 'in der Nähe des Starts');
  }
  // Treffer: Weg durch das Auto in seiner Höhe trifft, derselbe Weg 20 m tiefer nicht
  const v = parked[0];
  assert.equal(stepVehicles(0, [v.x - 3, v.y - 20 + 0.8, v.z], [v.x + 3, v.y - 20 + 0.8, v.z]), 0, 'tief darunter kein Treffer');
  assert.equal(stepVehicles(0, [v.x - 3, v.y + VEH_HALF[1], v.z], [v.x + 3, v.y + VEH_HALF[1], v.z]), 1, 'Treffer in der Höhe des Autos');
  const t = scenTarget(); assert.ok(t && t[1] > groundH(t[0], t[2]), 'Zielmarker über dem Auto');
});

test('Verfolgung in der echten Welt: Auto auf langem Weg nah am Start, Band über der Straße', () => {
  rw.ready = true; setLayoutSeed(7);
  setScenario('follow', true); respawn();
  const L = followLead();
  assert.ok(L.route && L.route.len >= 600, 'eigener Weg: ' + (L.route && L.route.len.toFixed(0)) + ' m');
  assert.ok(Math.hypot(L.x - meta.home[0], L.z - meta.home[1]) < 450, 'beginnt nah am Start');
  assert.ok(Math.abs(L.y - groundH(L.x, L.z)) < 13);
  const t = scenTarget(); assert.ok(t[1] > L.y + 1, 'Marker über dem Auto');
});

test('Spielkarte unverändert: Fahrzeuge der Karte bei y = 0, Verfolgung auf der Kursrunde', () => {
  setScenario('hunt2'); respawn();
  assert.equal(vehicles.length, 7); assert.ok(vehicles.every(v => v.y === 0));
  setScenario('follow'); respawn();
  assert.equal(followLead().route, null);
  assert.equal(game.sim && typeof ROUTES[0].len, 'number');
});
