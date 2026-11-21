// Etappe Q2: weltweite Höhe aus Kacheln (AWS Terrain Tiles). Kacheln werden hier erzeugt (ohne Netz).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { terrainHeights, terrainZoom, mercX, mercY, wmsCheck } from '../src/rwwms.js';
import { RW_SOURCES, rwSourcesParse } from '../src/rwload.js';
import { rwPlan } from '../src/realworld.js';
import { toUtm, fromUtm } from '../src/geo.js';

const W = RW_SOURCES.find(s => s.id === 'welt'), T = 64;
const C = [47, 11], f = (lat, lon) => 1000*(lat - C[0]) + 500*(lon - C[1]);   // Höhe linear in Breite und Länge um den Ort C (16 Bit reicht)
// Kachel als TIFF ohne Kompression, Int16, ein Streifen; Werte in den Pixelmitten
function tile(z, x, y) {
  const n = 2**z, data = new Uint8Array(T*T*2), dv = new DataView(data.buffer);
  for (let r = 0; r < T; r++) for (let c = 0; c < T; c++) {
    const lon = (x + (c + 0.5)/T)/n*360 - 180, lat = Math.atan(Math.sinh(Math.PI*(1 - 2*(y + (r + 0.5)/T)/n)))*180/Math.PI;
    dv.setInt16((r*T + c)*2, Math.round(f(lat, lon)), true);
  }
  const tags = [[256, 3, T], [257, 3, T], [258, 3, 16], [259, 3, 1], [273, 4, 8 + 2 + 10*12 + 4], [277, 3, 1], [278, 3, T], [279, 4, data.length], [317, 3, 1], [339, 3, 2]];
  const head = new Uint8Array(8 + 2 + tags.length*12 + 4), h = new DataView(head.buffer);
  head.set([0x49, 0x49]); h.setUint16(2, 42, true); h.setUint32(4, 8, true); h.setUint16(8, tags.length, true);
  tags.forEach(([t, ty, v], i) => { const e = 10 + i*12; h.setUint16(e, t, true); h.setUint16(e + 2, ty, true); h.setUint32(e + 4, 1, true); ty === 3 ? h.setUint16(e + 8, v, true) : h.setUint32(e + 8, v, true); });
  const all = new Uint8Array(head.length + data.length); all.set(head); all.set(data, head.length); return all;
}
const asked = [], get = async u => { asked.push(u); const m = u.match(/\/(\d+)\/(\d+)\/(\d+)\.tif$/); return tile(+m[1], +m[2], +m[3]); };

test('Zoomstufe und Kachelnummern', () => {
  assert.equal(terrainZoom(2, 50), 12, 'Startgebiet: höchstens zmax');
  assert.equal(terrainZoom(25, 50, 12, 512), 11, 'Umgebung 25 m');
  assert.equal(Math.floor(mercX(6.2428, 12)), 2119); assert.equal(Math.floor(mercY(50.5553, 12)), 1379);
});

test('Höhen auf das UTM-Gitter, auch fern von Zone 32', async () => {
  for (const [lat, lon] of [[47.2692, 11.4041], [35.68, 139.77], [-33.96, 18.41]]) {
    C[0] = lat; C[1] = lon;
    const zone = Math.floor((lon + 180)/6) + 1, [E, N] = toUtm(lat, lon, zone), bb = [E - 500, N - 500, E + 500, N + 500], n = 32;
    const r = await terrainHeights({ ...W, hgt: { ...W.hgt, url: 'mem/{z}/{x}/{y}.tif', zmax: 10 } }, bb, zone, n, get);
    assert.equal(r.hRef, 'msl'); assert.ok(r.tiles >= 1 && r.tiles <= 4);
    for (const [i, j] of [[0, 0], [31, 31], [10, 20]]) {
      const [la, lo] = fromUtm(bb[0] + (i + 0.5)*1000/n, bb[3] - (j + 0.5)*1000/n, zone);
      assert.ok(Math.abs(r.data[j*n + i] - f(la, lo)) < 1.5, `${lat},${lon} Zelle ${i},${j}: ${r.data[j*n + i]} statt ${f(la, lo)}`);
    }
  }
});

test('Kacheln aus dem Zwischenspeicher, Prüfen am Ort', async () => {
  C[0] = 47; C[1] = 11;
  const src = { ...W, hgt: { ...W.hgt, url: 'mem2/{z}/{x}/{y}.tif', zmax: 9 } }, [E, N] = toUtm(47.3, 11.4, 32), bb = [E - 500, N - 500, E + 500, N + 500];
  asked.length = 0;
  await terrainHeights(src, bb, 32, 16, get); const n1 = asked.length;
  await terrainHeights(src, bb, 32, 16, get);
  assert.equal(asked.length, n1, 'zweites Mal ohne Netz');
  const c = await wmsCheck(src, 47.3, 11.4, get);
  assert.ok(c[0].ok && /Kachel 9\//.test(c[0].text) && Math.abs(parseFloat(c[0].text.split(', ')[1]) - f(47.3, 11.4)) < 40, c[0].text);
});

test('Wahl der Quelle: Land vor Welt, Welt überall sonst, DIS nimmt den lokalen Höhendienst', () => {
  assert.equal(rwPlan(50.5553, 6.2428).srcs[0].id, 'nrw');
  const ibk = rwPlan(47.2692, 11.4041);
  assert.equal(ibk.srcs[0].id, 'welt'); assert.equal(ibk.srcs[0].crs, 'EPSG:25832');
  assert.equal(rwPlan(35.68, 139.77).srcs[0].crs, 'EPSG:25854', 'Zone 54 aus der Länge');
  assert.equal(rwPlan(47.2692, 11.4041, undefined, { dis: true }).srcs[0].id, 'wms-lokal');
  const p = rwSourcesParse(JSON.stringify([{ ...W, id: undefined }]));
  assert.deepEqual(p.errors, []); assert.equal(p.sources[0].tiles, 'terrain'); assert.equal(p.sources[0].hgt.zmax, 12);
});
