// Echte Welt, Etappe L2: Deutschlandkarte (Ländergrenzen BKG VG2500), Land am Punkt, Ansicht
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deSetMap, deLandAt, mapToScreen, mapFromScreen, mapZoom, mapFitGermany, DE_BOX } from '../src/demap.js';
import { toUtm } from '../src/geo.js';
import { RW_SOURCES, rwSourceAt } from '../src/rwload.js';

const map = JSON.parse(readFileSync(new URL('../realworld/germany.json', import.meta.url), 'utf8'));
deSetMap(map);
const at = (lat, lon) => deLandAt(...toUtm(lat, lon));

test('L2: 16 Länder, klein genug zum Einbetten, mit Quellenvermerk', () => {
  assert.equal(map.lands.length, 16);
  assert.ok(JSON.stringify(map).length < 100000);
  assert.match(map.attribution, /BKG 2026 dl-de\/by-2-0/);
});

test('L2: Land an bekannten Orten', () => {
  assert.equal(at(50.5553, 6.2428), 'Nordrhein-Westfalen', 'Monschau');
  assert.equal(at(50.7753, 6.0839), 'Nordrhein-Westfalen', 'Aachen');
  assert.equal(at(52.5200, 13.4050), 'Berlin');
  assert.equal(at(48.1372, 11.5756), 'Bayern', 'München');
  assert.equal(at(53.5511, 9.9937), 'Hamburg');
  assert.equal(at(54.9079, 8.3100), 'Schleswig-Holstein', 'Sylt (Insel)');
  assert.equal(at(52.3676, 4.9041), null, 'Amsterdam');
  assert.equal(at(50.6333, 5.5667), null, 'Lüttich');
});

test('L2: Quelle nur im eigenen Land (Rechteck NRW reicht bis Belgien und Niedersachsen)', () => {
  const nrw = RW_SOURCES.find(s => s.id === 'nrw');
  for (const [lat, lon, want] of [[50.5553, 6.2428, 'nrw'], [50.6333, 5.95, null], [52.28, 8.05, null], [51.96, 7.63, 'nrw']]) {
    const [E, N] = toUtm(lat, lon), s = rwSourceAt(E, N, RW_SOURCES, deLandAt);
    assert.equal(s ? s.id : null, want, `${lat}, ${lon}`);
  }
  assert.ok(nrw.land === 'Nordrhein-Westfalen');
});

test('L2: Ansicht: Bildschirm und Karte passen zusammen, Zoomen hält den Punkt unter dem Zeiger', () => {
  const v = mapFitGermany(800, 600);
  for (const [E, N] of [[DE_BOX[0], DE_BOX[1]], [DE_BOX[2], DE_BOX[3]]]) { const [x, y] = mapToScreen(v, 800, 600, E, N); assert.ok(x >= 0 && x <= 800 && y >= 0 && y <= 600, 'ganz Deutschland sichtbar'); }
  const [E, N] = mapFromScreen(v, 800, 600, 123, 456), [x, y] = mapToScreen(v, 800, 600, E, N);
  assert.ok(Math.abs(x - 123) < 1e-6 && Math.abs(y - 456) < 1e-6);
  const z = mapZoom(v, 800, 600, 123, 456, 0.5), [E2, N2] = mapFromScreen(z, 800, 600, 123, 456);
  assert.ok(Math.abs(E2 - E) < 1e-3 && Math.abs(N2 - N) < 1e-3 && Math.abs(z.s - v.s/2) < 1e-9);
  let w = v; for (let i = 0; i < 40; i++) w = mapZoom(w, 800, 600, 400, 300, 0.5);
  assert.equal(w.s, 1, 'nicht näher als 1 m je Bildpunkt');
});
