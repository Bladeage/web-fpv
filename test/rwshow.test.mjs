// Reiter „Debug“ in den Optionen der echten Welt: Ebenen ausblenden (Prompt 167, docs/plan-ebenen.md). Wirkt beim Übernehmen,
// Höhen bleiben gleich, ohne Ebene keine Bestzeit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { rw, rwApply, rwSetShow, groundH, waterAt, RW_SHOW } from '../src/realworld.js';
import { bestOk } from '../src/physics.js';

const file = n => new URL('../' + n, import.meta.url), raw = n => inflateSync(readFileSync(file('realworld/monschau.' + n)));
const i16 = b => new Int16Array(b.buffer, b.byteOffset, b.byteLength/2), u16 = b => new Uint16Array(b.buffer, b.byteOffset, b.byteLength/2);
const meta = JSON.parse(readFileSync(file('realworld/monschau.json'), 'utf8'));
const p = { meta, q: u16(raw('dgm')), b16: i16(raw('bld')), t16: i16(raw('trees')), dop: new Uint8Array([0xff, 0xd8]), farq: meta.far ? u16(raw('far')) : null, fardop: new Uint8Array([0xff, 0xd8]) };
const x = { water: new Uint8Array(raw('water')), features: null };

test('Debug-Ebenen: ausblenden und wieder einblenden, Höhen unverändert, keine Bestzeit', () => {
  rwSetShow({}); rwApply(p, x); rw.on = true;
  const pts = []; for (let z = -480; z <= 480; z += 20) for (let x0 = -480; x0 <= 480; x0 += 20) pts.push([x0, z]);
  const wet = pts.find(([a, b]) => waterAt(a, b)), h0 = pts.map(([a, b]) => groundH(a, b));
  assert.ok(rw.main.tris.length > 0 && rw.trees.length > 0 && wet && rw.dop && rw.far && rw.farDop, 'alles an');
  assert.equal(rw.showOff, false); assert.equal(bestOk(), true);
  const nTris = rw.main.tris.length, nTrees = rw.trees.length;
  rwSetShow({ dop: false, bld: false, trees: false, water: false, far: false });
  assert.equal(rw.main.tris.length, 0, 'keine Gebäude'); assert.equal(rw.trees.length, 0, 'keine Bäume');
  assert.equal(waterAt(...wet), false, 'kein Wasser'); assert.equal(rw.dop, null); assert.equal(rw.far, null); assert.equal(rw.farDop, null);
  assert.equal(rw.on, true, 'bleibt eingeschaltet');
  // ohne Umgebung gleich; nur am Rand des Startgebiets blendet die Fläche sonst weich in die Umgebung
  pts.forEach(([a, b], k) => Math.max(Math.abs(a), Math.abs(b)) < 400 && assert.ok(Math.abs(groundH(a, b) - h0[k]) < 0.5, 'Höhe bei ' + a + ', ' + b));
  assert.equal(rw.showOff, true); assert.equal(bestOk(), false, 'keine Bestzeit');
  rwSetShow({ trees: false });
  assert.equal(rw.main.tris.length, nTris, 'Gebäude zurück'); assert.equal(rw.trees.length, 0); assert.ok(waterAt(...wet));
  rwSetShow({});
  assert.equal(rw.trees.length, nTrees, 'Bäume zurück, gleich viele (Prüfung gegen echtes Wasser)');
  rwSetShow({ water: false }); assert.equal(rw.trees.length, nTrees, 'Bäume auch ohne Ebene Gewässer nicht im Wasser');
  rwSetShow({}); rw.on = false; assert.equal(bestOk(), true, 'außerhalb der echten Welt immer Bestzeit');
  assert.deepEqual(RW_SHOW.map(r => r[0]), ['dop', 'bld', 'trees', 'water', 'far', 'traffic']);
});
