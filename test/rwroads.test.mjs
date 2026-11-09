// Straßen für geladene Orte (Prompt 185/186, Etappe S2): ALKIS-Flächen der Nutzung Straßenverkehr -> Mittellinien.
// Kunstflächen (Kreuz, L, Ring mit Loch) und eine echte Probe aus Monschau (test/fixtures/alkis-strassen.gml, 28 Flächen,
// Geobasis NRW, dl-de/zero-2.0). Kein Netz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readGmlSurfaces, roadAxes, clipRect, alkisRoadBody, alkisRoadUrl, rwRoadsFetch } from '../src/rwroads.js';
import { RW_SOURCES } from '../src/rwload.js';
import { roadGraph } from '../src/roads.js';

const E0 = 300000, N0 = 5600000, B = [E0, N0, E0 + 200, N0 + 200];   // Gebiet 200 x 200 m, Mitte (100, 100)
const ring = pts => pts.map(p => (E0 + p[0]) + ' ' + (N0 + p[1])).join(' ');
const member = (rings, name, kind = 'Straßenverkehr') => '<wfs:member><Nutzung><geometrie><gml:MultiSurface><gml:surfaceMember><gml:Polygon>'
  + '<gml:exterior><gml:LinearRing><gml:posList>' + ring(rings[0]) + '</gml:posList></gml:LinearRing></gml:exterior>'
  + rings.slice(1).map(r => '<gml:interior><gml:LinearRing><gml:posList>' + ring(r) + '</gml:posList></gml:LinearRing></gml:interior>').join('')
  + '</gml:Polygon></gml:surfaceMember></gml:MultiSurface></geometrie><nutzart>' + kind + '</nutzart><name>' + name + '</name></Nutzung></wfs:member>';
const gml = ms => '<wfs:FeatureCollection>' + ms.join('') + '</wfs:FeatureCollection>';
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const lenOf = pts => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; };

test('GML lesen: Ringe, Löcher, Nutzung, Name', () => {
  const F = readGmlSurfaces(gml([member([rect(0, 0, 50, 8), rect(10, 2, 20, 6)], 'A-Straße'), member([rect(0, 20, 9, 30)], 'Feldweg', 'Weg')]));
  assert.equal(F.length, 2); assert.equal(F[0].name, 'A-Straße'); assert.equal(F[1].kind, 'Weg');
  assert.equal(F[0].polys[0].length, 2, 'äußerer Ring und Loch'); assert.equal(F[0].polys[0][0][0], E0);
});

test('Kreuz aus zwei Flächen 8 m breit: zwei Achsen, Schnitt in der Mitte, Breite 8 m, Namen', () => {
  const F = readGmlSurfaces(gml([member([rect(-20, 96, 220, 104)], 'Ost-West'), member([rect(96, -20, 104, 96)], 'Süd'), member([rect(96, 104, 104, 220)], 'Nord')]));
  const A = roadAxes(F, B), G = roadGraph(A);
  assert.ok(A.length >= 3 && A.length <= 6, A.length + ' Linien');
  const hub = G.nodes.filter(n => n.e.length >= 3);
  assert.equal(hub.length, 1, 'eine Kreuzung'); assert.ok(Math.hypot(hub[0].x, hub[0].z) < 2, 'Kreuzung in der Mitte: ' + hub[0].x + ', ' + hub[0].z);
  for (const a of A) assert.ok(Math.abs(a.w - 8) <= 1, 'Breite ' + a.w);
  assert.deepEqual([...new Set(A.map(a => a.name))].sort(), ['Nord', 'Ost-West', 'Süd']);
  // Achse Ost-West liegt auf z = 0 (Nord = -z) und reicht bis an den Rand des Gebiets (zugeschnitten)
  const ow = A.filter(a => a.name === 'Ost-West').flatMap(a => a.pts);
  assert.ok(ow.every(p => Math.abs(p[1]) < 1), 'auf der Mittellinie');
  assert.ok(Math.min(...ow.map(p => p[0])) <= -99 && Math.max(...ow.map(p => p[0])) >= 99, 'bis an den Rand');
  assert.ok(Math.abs(G.len - 400) < 15, 'Länge ' + G.len.toFixed(1));
});

test('L-Form und Ring mit Loch', () => {
  const L = roadAxes(readGmlSurfaces(gml([member([[[20, 20], [180, 20], [180, 26], [26, 26], [26, 180], [20, 180], [20, 20]]], 'L')])), B);
  const total = L.reduce((s, a) => s + lenOf(a.pts), 0);
  assert.ok(Math.abs(total - 314) < 12, 'L etwa 2 x 157 m: ' + total.toFixed(1));
  const R = roadAxes(readGmlSurfaces(gml([member([rect(40, 40, 160, 160), rect(48, 48, 152, 152)], 'Ring')])), B);
  const G = roadGraph(R), rl = R.reduce((s, a) => s + lenOf(a.pts), 0);
  assert.ok(Math.abs(rl - 4*112) < 20, 'Ringachse etwa 448 m: ' + rl.toFixed(1));
  assert.ok(G.nodes.every(n => n.e.length >= 1) && R.every(a => a.pts.every(p => Math.max(Math.abs(p[0]), Math.abs(p[1])) > 50)), 'um das Loch herum');
});

test('Zuschneiden auf das Gebiet', () => {
  assert.deepEqual(clipRect([[-10, 5], [10, 5]], [0, 0, 20, 20]), [[[0, 5], [10, 5]]]);
  assert.deepEqual(clipRect([[5, -5], [5, 25]], [0, 0, 20, 20]), [[[5, 0], [5, 20]]]);
  assert.equal(clipRect([[30, 30], [40, 40]], [0, 0, 20, 20]).length, 0);
});

test('Anfrage: POST mit Filter (Präfix ave:), sonst GET mit Rechteck; GET-Antwort wird nach Nutzung gefiltert', async () => {
  const r = RW_SOURCES[0].roads, body = alkisRoadBody(r, [1, 2, 3, 4]);
  assert.ok(body.includes('<fes:ValueReference>ave:nutzart</fes:ValueReference>') && body.includes('ave:geometrie') && body.includes('<gml:lowerCorner>1 2</gml:lowerCorner>'));
  assert.ok(alkisRoadUrl(r, [1, 2, 3, 4]).includes('TYPENAMES=ave:Nutzung') && alkisRoadUrl(r, [1, 2, 3, 4]).includes('BBOX=1,2,3,4,urn:ogc:def:crs:EPSG::25832'));
  const xml = gml([member([rect(0, 96, 200, 104)], 'Ost-West'), member([rect(96, 0, 104, 96)], 'Feldweg', 'Weg')]);
  const net = { post: async () => { throw new Error('www.wfs.nrw.de antwortet 400'); }, text: async u => (assert.ok(u.includes('REQUEST=GetFeature')), xml) };
  const A = await rwRoadsFetch(r, B, net);
  assert.ok(A.length >= 1 && A.every(a => a.name === 'Ost-West'), 'Weg aussortiert');
  await assert.rejects(rwRoadsFetch(r, B, { post: async () => '<ows:ExceptionReport>kaputt</ows:ExceptionReport>' }), /Straßendienst meldet/);
});

test('Echte Probe Monschau: Achsen nah an den Basis-DLM-Achsen, mit Namen, schnell', () => {
  const xml = readFileSync(new URL('./fixtures/alkis-strassen.gml', import.meta.url), 'utf8');
  const bb = [304450, 5603750, 304750, 5604050], t0 = performance.now();
  const A = roadAxes(readGmlSurfaces(xml).filter(f => f.kind === 'Straßenverkehr'), bb), ms = performance.now() - t0;
  assert.ok(ms < 2000, ms.toFixed(0) + ' ms');
  assert.ok(A.length > 5 && A.every(a => a.name), A.length + ' Linien, alle mit Namen');
  // Basis-DLM-Achsen von Monschau (Kartenmitte 304700, 5604000) in dieses Gebiet umrechnen (Mitte 304600, 5603900)
  const dlm = JSON.parse(readFileSync(new URL('../realworld/monschau.features.json', import.meta.url), 'utf8')).roads.map(r => r.pts.map(p => [p[0] + 100, p[1] - 100]));
  const segd = (p, a, b) => { const ex = b[0] - a[0], ez = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0])*ex + (p[1] - a[1])*ez)/(ex*ex + ez*ez || 1))); return Math.hypot(p[0] - a[0] - ex*t, p[1] - a[1] - ez*t); };
  let near = 0, all = 0;
  for (const a of A) for (const p of a.pts) { all++; let d = Infinity; for (const r of dlm) for (let k = 1; k < r.length; k++) d = Math.min(d, segd(p, r[k - 1], r[k])); if (d < 4) near++; }
  assert.ok(near/all > 0.6, Math.round(near/all*100) + ' % der Punkte innerhalb 4 m einer DLM-Achse');
});
