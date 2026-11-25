// OSM-Gebäude als Rückfall (Prompt 253): Grundrisse aus OpenStreetMap zu Klötzen. Overpass ist aus der Arbeitsumgebung nicht
// erreichbar, darum mit erfundener Antwort geprüft (wie Straßen und Wald).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { osmBuildings, osmHeight } from '../src/rwroads.js';
import { osmBuildBld } from '../src/rwload.js';
import { toUtm, fromUtm } from '../src/geo.js';

const zone = 32, ec = 550000, nc = 5800000;
// 20-m-Quadrat um die Mitte, Ecken als OSM-Punkte (lat/lon), im Uhrzeigersinn (OSM-Außenring oft so)
const sq = [[-10, -10], [-10, 10], [10, 10], [10, -10], [-10, -10]];
const geom = sq.map(([de, dn]) => { const [lat, lon] = fromUtm(ec + de, nc + dn, zone); return { lat, lon }; });
const bbox = [ec - 500, nc - 500, ec + 500, nc + 500];

test('Höhe aus den Merkmalen: height vor Stockwerken vor Schätzung', () => {
  assert.equal(osmHeight({ height: '12' }), 12);
  assert.equal(osmHeight({ height: '15 m' }), 15);
  assert.ok(Math.abs(osmHeight({ 'building:levels': '3' }) - (3*3.2 + 1.5)) < 1e-9);
  assert.equal(osmHeight({}), 8);
  assert.equal(osmHeight({ height: '0' }), 8);   // unbrauchbar -> Schätzung
});

test('osmBuildings liest Wege, rechnet in UTM, nimmt nur Gebäude mit Mitte im Gebiet', async () => {
  const j = { elements: [
    { type: 'way', tags: { building: 'yes', 'building:levels': '4' }, geometry: geom },
    { type: 'way', tags: { highway: 'residential' }, geometry: geom },   // kein Gebäude: ignorieren
    { type: 'way', tags: { building: 'house' }, geometry: geom.map(p => ({ lat: p.lat + 0.02, lon: p.lon })) }   // weit außerhalb
  ] };
  const net = { text: async () => JSON.stringify(j) };
  const b = await osmBuildings({ overpass: ['https://o/api'] }, bbox, zone, net);
  assert.equal(b.length, 1, 'ein Gebäude im Gebiet');
  assert.ok(Math.abs(b[0].cx - ec) < 1 && Math.abs(b[0].cy - nc) < 1, 'Mitte in UTM: ' + b[0].cx.toFixed(1) + ',' + b[0].cy.toFixed(1));
  assert.ok(Math.abs(b[0].h - (4*3.2 + 1.5)) < 0.01, 'Höhe nach Stockwerken');
});

test('osmBuildBld baut Wände und Flachdach; Boden aus dem Gelände, Dach darüber', () => {
  const builds = [{ ring: sq.map(([de, dn]) => [ec + de, nc + dn]), h: 10, cx: ec, cy: nc }];
  const bld = osmBuildBld(builds, () => 100);
  assert.equal(bld.info.length, 1);
  assert.equal(bld.info[0].roof, '1000'); assert.equal(bld.info[0].fn, '31001_1000');
  assert.equal(bld.wall.length, 4*6, '4 Kanten je 2 Dreiecke');   // 24 Ecken
  assert.equal(bld.wallId.length, 8); assert.ok(bld.wallId.every(i => i === 0));
  assert.equal(bld.roof.length, 2*3, 'Quadrat -> 2 Dreiecke');   // 6 Ecken
  assert.ok(bld.roofId.every(i => i === 0));
  const zs = bld.wall.map(p => p[2]);
  assert.ok(Math.abs(Math.min(...zs) - 98.5) < 1e-6, 'Boden 1,5 m tiefer: ' + Math.min(...zs));
  assert.ok(Math.abs(Math.max(...zs) - 110) < 1e-6, 'Dach bei Gelände + Höhe');
  assert.ok(bld.roof.every(p => Math.abs(p[2] - 110) < 1e-6), 'Dach eben oben');
  // Dachnormale zeigt nach oben (CCW in E-N bei z=top)
  const [a, b, c] = [bld.roof[0], bld.roof[1], bld.roof[2]];
  const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - a[0], vy = c[1] - a[1];
  assert.ok(ux*vy - uy*vx > 0, 'Dach gegen den Uhrzeigersinn (Normale nach oben)');
});

test('Hohle Grundrisse und zu kleine Ringe fallen weg, nicht leer', () => {
  assert.deepEqual(osmBuildBld([{ ring: [[0,0],[1,0]], h: 5, cx: 0, cy: 0 }], () => 0).info, []);
  assert.deepEqual(osmBuildBld([{ ring: [[0,0],[1,0],[1,1],[0,1]], h: 5, cx: 0, cy: 0 }], () => NaN).info, [], 'ohne Gelände kein Gebäude');
});
