// WMS-Höhendienst (src/rwwms.js, Etappe W1): Fähigkeiten, Ebenenwahl, Achsenreihenfolge, Umrechnung auf das UTM-Gitter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wmsCapsParse, wmsPickHeight, geoBoxOf, wmsHgtUrl, wmsFetchHeights, resampleToUtm, wmsError } from '../src/rwwms.js';
import { toUtm, fromUtm, GEOID_FIX } from '../src/geo.js';
import { startErsatz, surface, ERSATZ_CAPS } from './wms-ersatz.mjs';

const get = async u => new Uint8Array(await (await fetch(u)).arrayBuffer());
// Gebiet 1 x 1 km bei Köln in UTM 32
const [E, N] = toUtm(50.9413, 6.9658, 32), bbox = [E - 500, N - 500, E + 500, N + 500];
const cellCenter = (i, j, n) => fromUtm(bbox[0] + (i + 0.5)*1000/n, bbox[3] - (j + 0.5)*1000/n, 32);

test('Fähigkeiten lesen und Höhenebene wählen (nicht die Bild- oder RGBA-Ebene)', () => {
  const c = wmsCapsParse(ERSATZ_CAPS);
  assert.deepEqual(c.layers.map(l => l.name), ['Test_hgt_rgba', 'Test_photo', 'Test_hgt']);
  assert.ok(c.formats.includes('image/tiff')); assert.ok(c.crs.includes('EPSG:4326')); assert.equal(c.maxW, 256);
  assert.deepEqual(wmsPickHeight(c), ['Test_hgt']);
  // Ebenennamen wie beim gemessenen Partner (nur Namen als Testdaten)
  const p = wmsCapsParse('<Layer><Name>Blue_hgt</Name></Layer><Layer><Name>Blue_hgt_rgba</Name></Layer><Layer><Name>Blue_ortho_photo</Name></Layer><Layer><Name>Blue_ortho_height</Name></Layer><Layer><Name>Blue_ortho_vegetation_height_rgb</Name></Layer><Layer><Name>Blue_shaded_relief</Name></Layer>');
  assert.deepEqual(wmsPickHeight(p), ['Blue_hgt', 'Blue_ortho_height']);
});

test('Geografisches Rechteck umschließt das gedrehte UTM-Quadrat, GetMap mit Breite zuerst', () => {
  const g = geoBoxOf(bbox, 32);
  for (const [e, n] of [[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]]]) {
    const [la, lo] = fromUtm(e, n, 32); assert.ok(la >= g.minLat - 1e-12 && la <= g.maxLat + 1e-12 && lo >= g.minLon - 1e-12 && lo <= g.maxLon + 1e-12);
  }
  const u = new URL(wmsHgtUrl('http://h/ows', 'X', g, 256, 256));
  const b = u.searchParams.get('BBOX').split(',').map(Number);
  assert.ok(b[0] > 50 && b[1] < 8 && b[2] > b[0] && b[3] > b[1], 'minLat, minLon, maxLat, maxLon');
  assert.equal(u.searchParams.get('CRS'), 'EPSG:4326'); assert.equal(u.searchParams.get('VERSION'), '1.3.0');
});

test('Höhen vom Ersatz auf unser Gitter: genau gegen die bekannte Fläche, Nähte ohne Sprung, Ellipsoid minus Geoid', async t => {
  const w = startErsatz(); t.after(() => w.close()); await w.ready;
  const n = 512, r = await wmsFetchHeights({ hgt: { url: w.url, layer: 'Test_hgt', tile: 256 }, vref: 'ellipsoid' }, bbox, 32, n, get);
  assert.equal(r.hRef, 'ell-' + GEOID_FIX); assert.ok(r.tiles >= 4, 'mehrere Kacheln: ' + r.tiles);
  let maxErr = 0;
  for (let j = 0; j < n; j += 7) for (let i = 0; i < n; i += 7) { const [la, lo] = cellCenter(i, j, n); maxErr = Math.max(maxErr, Math.abs(r.data[j*n + i] + GEOID_FIX - surface(la, lo))); }
  assert.ok(maxErr < 0.1, 'Abweichung ' + maxErr.toFixed(3) + ' m');
  // Achsen: jede Anfrage nennt Breite zuerst (Breiten um 50,9, Längen um 7)
  for (const q of w.calls.filter(q => q.REQUEST === 'GetMap')) { const b = q.BBOX.split(',').map(Number); assert.ok(b[0] > 49 && b[0] < 52 && b[1] > 6 && b[1] < 8); }
  // Meereshöhe: ohne Abzug
  const m = await wmsFetchHeights({ hgt: { url: w.url, layer: 'Test_hgt', tile: 256 }, vref: 'msl' }, bbox, 32, 64, get);
  const [la, lo] = cellCenter(10, 20, 64); assert.ok(Math.abs(m.data[20*64 + 10] - surface(la, lo)) < 0.3);
});

test('Stützgitter 17 x 17 gegen genaue Umrechnung: unter 1 cm', () => {
  const n = 64, g = geoBoxOf(bbox, 32, 30), W = 400, H = 400, geo = new Float32Array(W*H);
  // Raster, dessen Wert die Länge in Metern ist: so misst die Abtastung den Ortsfehler direkt
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) geo[y*W + x] = ((x + 0.5)*(g.maxLon - g.minLon)/W)*111320*Math.cos(50.94*Math.PI/180);   // ab dem Rand (float32 genau genug)
  const out = resampleToUtm(geo, W, H, g, bbox, 32, n);
  let maxErr = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const [, lo] = cellCenter(i, j, n); maxErr = Math.max(maxErr, Math.abs(out[j*n + i] - (lo - g.minLon)*111320*Math.cos(50.94*Math.PI/180))); }
  assert.ok(maxErr < 0.01, 'Ortsfehler ' + (maxErr*100).toFixed(2) + ' cm');
});

test('Fehlerfälle: Fehler-XML, falsche Größe, nur Füllwerte', async t => {
  assert.equal(wmsError(new TextEncoder().encode('<x><ServiceException>Nein</ServiceException></x>')), 'Nein');
  for (const [o, re] of [[{ fail: true }, /Ebene unbekannt/], [{ size: true }, /Kachel 255 x 256/], [{ empty: true }, /keine Höhen/]]) {
    const w = startErsatz(o); t.after(() => w.close()); await w.ready;
    await assert.rejects(wmsFetchHeights({ hgt: { url: w.url, layer: 'Test_hgt', tile: 256 }, vref: 'msl' }, bbox, 32, 32, get), re);
  }
});
