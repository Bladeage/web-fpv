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
  applyDrone({ preset: '3', twr: 4, cap: 1000, cells: 6 });
  assert.ok(Math.abs(PHYS.twr - 4) < 0.1, 'eigener Schub ' + PHYS.twr);   // angenähert, siehe applyDrone
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
  applyDrone({ preset: '5' }); const m5 = PHYS.mass;
  applyDrone({ preset: '5', mass: m5*1.5 });
  assert.ok(PHYS.I[0] > I[2]*1.45, '1,5-faches Gewicht, etwa 1,5-fache Trägheit');
  applyDrone({ preset: '5' });
});

test('Feinwerte: jede erlaubte Kombination bleibt realistisch, unsinnige Werte werden begrenzt', async () => {
  const { droneSpec } = await import('../src/drone.js');
  for (const preset of Object.keys(DRONES)) {
    const p = DRONES[preset];
    for (const cells of [1, 4, 6]) for (const capF of [0.1, 0.5, 1, 2, 5]) for (const mass of [0.005, null, 3]) for (const twr of [null, 1, 2, 8, 14, 40]) {
      const d = { preset, cells, cap: p.cap*capF }; if (mass) d.mass = mass; if (twr) d.twr = twr;
      applyDrone(d);
      const hv = hoverThrottle(), sp = droneSpec(d);
      assert.ok(p.cellsOk.includes(BAT.cells), preset + ' Zellen ' + BAT.cells);
      assert.ok(PHYS.twr >= 1.95 && PHYS.twr <= 16.05, preset + ' TWR ' + PHYS.twr.toFixed(1) + ' bei ' + JSON.stringify(d));
      assert.ok(hv > 0.1 && hv < 0.8, preset + ' Schweben ' + (hv*100).toFixed(1) + ' % bei ' + JSON.stringify(d));
      assert.ok(PHYS.mass >= sp.massMin - 1e-9 && PHYS.mass <= sp.massMax + 1e-9);
    }
  }
  // Fall aus dem Test des Nutzers: Whoop mit 4S, 1,5 kg, Schub 14 -> Whoop mit 1S, höchstens 64 g, Schweben über 10 %
  applyDrone({ preset: 'whoop', cells: 4, mass: 1.5, twr: 14 });
  assert.equal(BAT.cells, 1); assert.ok(PHYS.mass < 0.07); assert.ok(hoverThrottle() > 0.1);
  applyDrone({ preset: '5' });
});
