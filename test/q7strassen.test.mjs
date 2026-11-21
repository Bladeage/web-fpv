// Etappe Q7: Straßen aus OpenStreetMap über Overpass (erfundene Antwort, ohne Netz).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { osmRoads, rwRoadsFetch } from '../src/rwroads.js';
import { RW_SOURCES } from '../src/rwload.js';
import { fromUtm } from '../src/geo.js';

test('Overpass: Wege werden Achsen mit Name, Breite und Lage relativ zur Gebietsmitte; Spiegel der Reihe nach', async () => {
  const bb = [500000, 5300000, 501000, 5301000], ll = (e, n) => { const [lat, lon] = fromUtm(e, n, 32); return { lat, lon }; };
  const j = { elements: [{ type: 'way', tags: { highway: 'primary', name: 'Hauptstraße' }, geometry: [ll(499900, 5300500), ll(501100, 5300500)] },
    { type: 'way', tags: { highway: 'service' }, geometry: [ll(500500, 5300500), ll(500500, 5300900)] }, { type: 'node' }] };
  const asked = [], net = { text: async u => { asked.push(u); if (asked.length === 1) throw new Error('Keine Verbindung'); return JSON.stringify(j); } };
  const r = { overpass: ['https://a/api/interpreter', 'https://b/api/interpreter'], zone: 32 }, out = await rwRoadsFetch(r, bb, net);
  assert.ok(asked[0].startsWith('https://a/') && asked[1].startsWith('https://b/') && /highway/.test(decodeURIComponent(asked[1])), 'zweiter Spiegel nach Fehler');
  assert.equal(out.length, 2);
  assert.deepEqual([out[0].name, out[0].w], ['Hauptstraße', 8]);
  const p = out[0].pts; assert.ok(Math.abs(p[0][0] + 500) < 0.2 && Math.abs(p[p.length - 1][0] - 500) < 0.2 && Math.abs(p[0][1]) < 0.2, 'auf das Gebiet geschnitten: ' + JSON.stringify(p));
  assert.equal(out[1].w, 3.5); assert.ok(Math.abs(out[1].pts[1][1] + 400) < 0.2, 'Norden ist minus z');
  await assert.rejects(osmRoads(r, bb, { text: async () => { throw new Error('Keine Verbindung'); } }), /Keine Verbindung/);
});

test('Quellen ohne ALKIS haben Straßen aus OpenStreetMap; Niedersachsen hat Landesdaten', () => {
  for (const id of ['welt', 'bb', 'be', 'ni', 'rp', 'mv', 'by', 'sn']) assert.ok(RW_SOURCES.find(s => s.id === id).roads.overpass.length === 3, id);
  assert.ok(RW_SOURCES.find(s => s.id === 'nrw').roads.url.includes('alkis'), 'NRW bleibt bei ALKIS');
  assert.equal(RW_SOURCES.find(s => s.id === 'ni').dlm.water, 'gew01_f.shp');
});
