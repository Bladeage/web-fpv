// Echte Welt, Etappe L4b: Austausch-Datei für Geodaten (Export auf einem Rechner, Import auf einem anderen)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geoPack, geoUnpack } from '../src/rwstore.js';

const join = parts => { const n = parts.reduce((t, p) => t + p.length, 0), out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const area = (k, w) => ({ key: k, lat: 50.5, lon: 6.2, srcs: ['NRW'], date: 1700000000000,
  meta: { place: 'Ort ' + k, n: 2, buildings: 1, trees: 2, water: w ? { n: 4, res: 1 } : undefined },
  q: new Uint16Array([1, 2, 3, 65535]), b16: new Int16Array([-5, 7, -32768, 32767]), t16: new Int16Array([10, 20, 30, 40]),
  dop: new Uint8Array([0xff, 0xd8, 9]), water: w ? new Uint8Array([0b1010]) : null, features: w ? { places: [{ name: 'A', rings: [] }] } : null });

test('L4b: Export und Import geben dieselben Orte und Landesdaten zurück (Typen, Werte, Beschreibung)', () => {
  const a = [area('k1', true), area('k2', false)], land = [{ key: 'https://x/paket.zip:gew01_f.shp', data: new Uint8Array([1, 2, 3, 4, 5]) }];
  const r = geoUnpack(join(geoPack(a, land)));
  assert.equal(r.areas.length, 2);
  for (const [i, x] of r.areas.entries()) {
    assert.equal(x.key, a[i].key); assert.deepEqual(x.meta, JSON.parse(JSON.stringify(a[i].meta)));
    for (const k of ['q', 'b16', 't16', 'dop']) { assert.equal(x[k].constructor, a[i][k].constructor, k); assert.deepEqual([...x[k]], [...a[i][k]], k); }
  }
  assert.deepEqual([...r.areas[0].water], [10]); assert.equal(r.areas[1].water, null);
  assert.equal(r.areas[0].features.places[0].name, 'A');
  assert.deepEqual([...r.land[0].data], [1, 2, 3, 4, 5]); assert.equal(r.land[0].key, land[0].key);
});

test('L4b: fremde oder kaputte Dateien werden verständlich abgelehnt', () => {
  assert.throws(() => geoUnpack(new TextEncoder().encode('{"sources":[]}')), /Keine Geodaten-Datei/);
  const full = join(geoPack([area('k1', true)], []));
  assert.throws(() => geoUnpack(full.slice(0, full.length - 3)), /unvollständig/);
});
