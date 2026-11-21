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

test('Prompt 229: Wald aus OpenStreetMap wird zu Bäumen, nur ohne DOM', async () => {
  const { osmWoods } = await import('../src/rwroads.js');
  const { woodTrees, rwPack } = await import('../src/rwload.js');
  const bb = [500000, 5300000, 501000, 5301000], ll = (e, n) => { const [lat, lon] = fromUtm(e, n, 32); return { lat, lon }; };
  const sq = (e0, n0, e1, n1) => [ll(e0, n0), ll(e1, n0), ll(e1, n1), ll(e0, n1), ll(e0, n0)];
  const j = { elements: [{ type: 'way', tags: { landuse: 'forest' }, geometry: sq(500000, 5300500, 500500, 5301000) },
    { type: 'relation', tags: { natural: 'wood' }, members: [{ role: 'outer', geometry: sq(500600, 5300000, 500800, 5300200) }, { role: 'inner', geometry: sq(500650, 5300050, 500700, 5300100) }] }] };
  const asked = [], w = await osmWoods({ overpass: ['https://o/api'] }, bb, 32, { text: async u => { asked.push(decodeURIComponent(u)); return JSON.stringify(j); } });
  assert.ok(/landuse=forest/.test(asked[0]) && /natural=wood/.test(asked[0]));
  assert.equal(w.length, 2, 'Weg und äußerer Teil der Relation');
  assert.ok(Math.abs(w[0][0][0] + 500) < 0.5 && Math.abs(w[0][0][1]) < 0.5, 'relativ zur Mitte, z nach Süden: ' + w[0][0]);
  const t = woodTrees(w, 1000);
  assert.ok(t.length > 1200 && t.length < 2400, 'etwa ein Viertel plus Stück voll: ' + t.length);
  assert.ok(t.every(([x, z, h, r]) => (x < 0.5 && z < 0.5) || (x > 99 && z > 299)) && t.every(q => q[2] >= 14 && q[2] <= 24 && q[3] <= 5));
  const dgm = { w: 64, h: 64, data: new Float32Array(4096).fill(50) }, a = { bbox: bb, crs: 'EPSG:25832', startNear: [500500, 5300500], name: 't', place: '', attribution: '' };
  assert.ok(rwPack(a, dgm, null, { roof: [], wall: [], roofId: [], wallId: [], info: [] }, null, w).meta.trees > 1000, 'Bäume ohne DOM aus Wald');
});
