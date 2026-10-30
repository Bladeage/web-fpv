// Vergleich mit der Referenz legacy/fpv-sim-stufe1.html.
// Die Referenzdaten stammen aus tools/record-legacy-trace.mjs (Chromium).
// Hier laufen dieselben Szenarien mit den Modulen aus src/ in Node.
// Node und Chromium runden Math.sin, cos und pow nicht bitgleich. Darum Vergleich mit
// kleiner relativer Toleranz. In Chromium ist dist/fpvsim.html bitgleich zur Referenz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildWorld, buildDrone, buildBlade, buildDisc, colliders, gates } from '../src/world.js';
import { meshStats } from './trace-scenario.mjs';

const ref = JSON.parse(readFileSync(new URL('./fixtures/legacy-trace.json', import.meta.url), 'utf8'));
buildWorld();
const TOL = 1e-9;

// Wie deepEqual, aber Zahlen mit relativer Toleranz.
function close(a, b, path = '') {
  if (typeof a === 'number' && typeof b === 'number') {
    const ok = Math.abs(a - b) <= TOL*Math.max(1, Math.abs(a), Math.abs(b));
    assert.ok(ok, `${path}: ${a} statt ${b}`);
    return;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    assert.deepEqual(Object.keys(a), Object.keys(b), path + ': andere Felder');
    for (const k of Object.keys(a)) close(a[k], b[k], path + '.' + k);
    return;
  }
  assert.equal(a, b, path);
}

test('Referenzdatei passt zu legacy/', () => {
  const sha = createHash('sha256').update(readFileSync(new URL('../legacy/fpv-sim-stufe1.html', import.meta.url))).digest('hex');
  assert.equal(sha, ref.legacySha256, 'legacy/ wurde geändert oder die Referenz ist veraltet');
});

test('Welt ist gleich: Hindernisse, Tore, Drohnenmodell', () => {
  close(colliders.map(c => ({ c: c.c, h: c.h, cs: c.cs, sn: c.sn })), ref.world.colliders, 'colliders');
  const geo = g => ({ c: g.c, yaw: g.yaw, n: g.n, r: g.r });   // ohne Lage im Vertex-Puffer
  close(gates.map(geo), ref.gates.map(geo), 'gates');
  // Sichtbares Weltmodell weicht seit G2 absichtlich ab (runde Kronen). Hindernisse und Tore bleiben gleich.
  close(meshStats(buildDrone()), ref.world.drone, 'drone');
  close(meshStats(buildBlade()), ref.world.blade, 'blade');
  close(meshStats(buildDisc()), ref.world.disc, 'disc');
});

// Der Vergleich der Flugbahnen mit legacy/ entfällt seit E1 (neues Akkumodell ändert den Schub absichtlich).
