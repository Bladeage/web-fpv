// Drohnen-Vorlagen: 5 Zoll entspricht Stufe 1, andere Vorlagen ändern Schub und Akku.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHYS, BAT, hoverThrottle } from '../src/physics.js';
import { DRONES, applyDrone, presetTwr } from '../src/drone.js';

const legacy = { PHYS: { ...PHYS }, BAT: { ...BAT } };

test('5-Zoll-Vorlage lässt die Werte aus Stufe 1 unverändert', () => {
  applyDrone({ preset: '5' });
  assert.deepEqual({ ...PHYS }, legacy.PHYS);
  assert.deepEqual({ ...BAT }, legacy.BAT);
});

test('Vorlagen und eigene Werte wirken auf Physik und Akku', () => {
  applyDrone({ preset: '7' });
  assert.equal(BAT.cells, 6); assert.equal(BAT.cap, 3000);
  assert.ok(Math.abs(PHYS.twr - presetTwr(DRONES['7'])) < 3, 'Schub zu Gewicht nahe Prüfstandswert: ' + PHYS.twr);
  applyDrone({ preset: '3', twr: 5, cap: 1000, cells: 6 });
  assert.ok(Math.abs(PHYS.twr - 5) < 0.1, 'eigener Schub ' + PHYS.twr);   // angenähert, siehe applyDrone
  assert.equal(BAT.cap, 1000); assert.equal(BAT.cells, 6);
  assert.equal(PHYS.cdaT, DRONES['3'].cdaT);
  applyDrone({ preset: '5' });
});

test('Schwebegas aller Vorlagen liegt zwischen 10 % und 50 %', () => {
  for (const id of Object.keys(DRONES)) {
    applyDrone({ preset: id });
    const hover = hoverThrottle();
    assert.ok(hover > 0.1 && hover < 0.5, id + ': ' + hover);
  }
  applyDrone({ preset: '5' });
});

test('Trägheit und Größe steigen mit der Drohne', () => {
  const ids = ['whoop', '3', '5', '7'], I = [], m = [], r = [];
  for (const id of ids) { applyDrone({ preset: id }); I.push(PHYS.I[0]); m.push(PHYS.mass); r.push(PHYS.radius); }
  for (let i = 1; i < ids.length; i++) {
    assert.ok(I[i] > I[i-1] && m[i] > m[i-1] && r[i] > r[i-1], ids[i]);
  }
  applyDrone({ preset: '5', mass: PHYS.mass*2 });
  assert.ok(PHYS.I[0] > I[2]*1.9, 'doppeltes Gewicht, etwa doppelte Trägheit');
  applyDrone({ preset: '5' });
});
