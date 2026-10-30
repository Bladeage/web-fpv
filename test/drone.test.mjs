// Drohnen-Vorlagen: 5 Zoll entspricht Stufe 1, andere Vorlagen ändern Schub und Akku.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYS, BAT } from '../src/physics.js';
import { DRONES, applyDrone } from '../src/drone.js';

const legacy = { PHYS: { ...PHYS }, BAT: { ...BAT } };

test('5-Zoll-Vorlage lässt die Werte aus Stufe 1 unverändert', () => {
  applyDrone({ preset: '5' });
  assert.deepEqual({ ...PHYS }, legacy.PHYS);
  assert.deepEqual({ ...BAT }, legacy.BAT);
});

test('Vorlagen und eigene Werte wirken auf Physik und Akku', () => {
  applyDrone({ preset: '7' });
  assert.equal(BAT.cells, 6); assert.equal(BAT.cap, 3000); assert.equal(PHYS.twr, DRONES['7'].twr);
  assert.ok(Math.abs(BAT.vnom - 23.7) < 1e-9);
  applyDrone({ preset: '3', twr: 5, cap: 1000, cells: 6 });
  assert.equal(PHYS.twr, 5); assert.equal(BAT.cap, 1000); assert.equal(BAT.cells, 6);
  assert.equal(PHYS.drag2, DRONES['3'].drag2);
  applyDrone({ preset: '5' });
});

test('Schwebegas aller Vorlagen liegt zwischen 10 % und 50 %', () => {
  for (const id of Object.keys(DRONES)) {
    const d = DRONES[id];
    assert.ok(1/d.twr > 0.1 && 1/d.twr < 0.5, id);
  }
});
