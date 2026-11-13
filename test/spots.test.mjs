// Abschluss (Prompt 207): Plätze folgen in Foto 3D dem Boden der Physik, wenn das Mesh nach dem Aufstellen kommt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rw } from '../src/realworld.js';
import { scen, PAD, PICKUP, DROPS, spotsFollow } from '../src/scenario.js';

test('Landeplatz und Lieferplätze folgen dem Boden, nicht unter der Drohne', () => {
  const on = rw.on, id = scen.id, pad = PAD.c.slice(), pk = PICKUP.slice(), ds = DROPS.map(d => d.slice());
  try {
    rw.on = true; scen.id = 'landing'; PAD.c.splice(0, 3, 100, 10, 0);
    const far = { p: [0, 20, 0] }, v0 = scen.version;
    assert.equal(spotsFollow(1, far, (x, z) => 11.2 + (x > 101 ? 0.1 : 0)), true, 'Mesh 1,2 m höher');
    assert.ok(Math.abs(PAD.c[1] - 11.3) < 1e-9, 'höchster Boden unter der Platte: ' + PAD.c[1]);
    assert.equal(scen.version, v0 + 1, 'Modell neu');
    assert.equal(spotsFollow(0.1, far, () => 5), false, 'höchstens alle 0,5 s');
    assert.equal(spotsFollow(1, far, () => 11.32), false, 'kleine Abweichung bleibt');
    assert.equal(spotsFollow(1, { p: [103, 12, 2] }, () => 9), false, 'Drohne steht in der Nähe: bleibt');
    scen.id = 'deliver'; PICKUP.splice(0, 3, 0, 1, 50); DROPS.forEach((d, i) => d.splice(0, 3, 50*i, 1, -50));
    spotsFollow(1, far, () => 2); assert.ok([PICKUP, ...DROPS].every(c => c[1] === 2), 'alle Lieferplätze');
    rw.on = false; assert.equal(spotsFollow(1, far, () => 7), false, 'Spielkarte: nichts');
  } finally {
    rw.on = on; scen.id = id; PAD.c.splice(0, 3, ...pad); PICKUP.splice(0, 3, ...pk); DROPS.forEach((d, i) => d.splice(0, 3, ...ds[i]));
  }
});
