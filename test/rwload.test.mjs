// Echte Welt, Etappe L1: Gebiet live laden (ohne Netz: Abrufe kommen aus Testdaten)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RW_SOURCES, wcsUrl, wmsUrl, lod2Urls, rwSourceAt, rwAreaAt, rwFetchArea } from '../src/rwload.js';
import { rw, rwApply, rwLoadLive, groundH, rwNear } from '../src/realworld.js';
import { toUtm } from '../src/geo.js';
import { parseLatLon } from '../src/format.js';

const tif = new Uint8Array(readFileSync(new URL('./fixtures/nrw-dgm-32.tif', import.meta.url)));
const NRW = RW_SOURCES.find(s => s.id === 'nrw');
// Ein Haus 10 x 10 m, 6 m hoch, Flachdach, Scheune (31001_2700); Boden bei 450 m
function gml(e0, n0) {
  const P = (x, y, z) => `${e0 + x} ${n0 + y} ${z}`, ring = pts => `<gml:exterior><gml:LinearRing><gml:posList>${pts.join(' ')}</gml:posList></gml:LinearRing></gml:exterior>`;
  const wall = (a, b) => `<bldg:WallSurface>${ring([P(...a, 450), P(...b, 450), P(...b, 456), P(...a, 456), P(...a, 450)])}</bldg:WallSurface>`;
  return `<core:CityModel><bldg:Building gml:id="B1"><bldg:function>31001_2700</bldg:function><bldg:roofType>1000</bldg:roofType>
    <bldg:RoofSurface>${ring([P(0, 0, 456), P(10, 0, 456), P(10, 10, 456), P(0, 10, 456), P(0, 0, 456)])}</bldg:RoofSurface>
    ${wall([0, 0], [10, 0])}${wall([10, 0], [10, 10])}${wall([10, 10], [0, 10])}${wall([0, 10], [0, 0])}</bldg:Building></core:CityModel>`;
}

test('L1: Koordinaten lesen (Punkt oder Komma als Dezimalzeichen)', () => {
  assert.deepEqual(parseLatLon('50.7753, 6.0839'), [50.7753, 6.0839]);
  assert.deepEqual(parseLatLon('50,7753 6,0839'), [50.7753, 6.0839]);
  assert.deepEqual(parseLatLon('50.7753N 6.0839E'), [50.7753, 6.0839]);
  assert.deepEqual(parseLatLon(' 51.2;7 '), [51.2, 7]);
  assert.equal(parseLatLon('Aachen'), null);
  assert.equal(parseLatLon('95, 6'), null);
});

test('L1: Quelle NRW, Adressen und Kacheln', () => {
  const [E, N] = toUtm(50.7753, 6.0839);   // Aachen
  assert.equal(rwSourceAt(E, N).id, 'nrw');
  assert.equal(rwSourceAt(...toUtm(52.52, 13.40)), null, 'Berlin: keine Quelle');
  const a = rwAreaAt(E, N, NRW);
  assert.equal(a.bbox[2] - a.bbox[0], 1000);
  assert.ok(wcsUrl(NRW.dgm, a.bbox, a.crs, 512).includes('COVERAGEID=nw_dgm') && wmsUrl(NRW.dop, a.bbox, a.crs, 4096).includes('WIDTH=4096'));
  const t = lod2Urls(NRW.lod2, [304200, 5603500, 305200, 5604500]);
  assert.deepEqual(t.map(u => u.split('/').pop()), ['LoD2_32_304_5603_1_NW.gml', 'LoD2_32_304_5604_1_NW.gml', 'LoD2_32_305_5603_1_NW.gml', 'LoD2_32_305_5604_1_NW.gml']);
});

test('L1: Gebiet laden und übernehmen (Höhen, Luftbild, Gebäude mit Nutzung, Bäume)', async () => {
  const a = { ...rwAreaAt(305000, 5604000, NRW), n: 32, place: 'Test' }, seen = [];
  const get = async u => { seen.push(u); return u.includes('WMS') ? new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) : tif; };
  const text = async u => { seen.push(u); return u.includes('_305_5604_') ? gml(305002, 5604002) : null; };   // nur eine Kachel hat Gebäude
  const steps = [];
  const p = await rwFetchArea(a, NRW, get, text, (s, f) => steps.push([s, f]));
  assert.ok(seen.some(u => u.includes('nw_dgm')) && seen.some(u => u.includes('nw_dom')) && seen.some(u => u.includes('nw_dop_rgb')));
  assert.equal(seen.filter(u => u.endsWith('.gml')).length, 4, 'vier Gebäude-Kacheln berühren das Gebiet');
  assert.ok(steps.length >= 6 && steps.every(([, f], i) => i === 0 || f >= steps[i - 1][1]), 'Fortschritt steigt');
  assert.equal(p.meta.buildings, 1);
  assert.equal(p.meta.roofTris, 2);
  assert.equal(p.meta.wallTris, 8);
  assert.equal(p.b16[p.b16.length - 1], 4 + 16, 'Scheune (4) mit Flachdach (16)');
  assert.equal(p.meta.trees, 0, 'gleiche Höhen für Gelände und Oberfläche: keine Bäume');
  const v0 = rw.ver;
  rwApply(p, { live: true });
  assert.ok(rw.ready && rw.live && rw.ver === v0 + 1 && rw.water === null && rw.features === null);
  assert.equal(rw.dop[0], 0xff);
  rw.on = true;
  const hx = 2 + 5 - 0, hz = -(2 + 5);   // Hausmitte in Kartenkoordinaten (Mitte des Gebiets = 305000/5604000)
  assert.ok(rwNear(hx, hz, 2).tris.length > 0, 'Haus im Kollisionsraster');
  assert.ok(Number.isFinite(groundH(0, 0)));
  rw.on = false;
});

test('L1: Fehler beim Laden werden verständlich gemeldet, das alte Gebiet bleibt', async () => {
  const old = globalThis.fetch, ver = rw.ver;
  try {
    await assert.rejects(rwLoadLive(52.52, 13.40), /keine Quelle/);
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(rwLoadLive(50.7753, 6.0839), /Keine Verbindung zu www\.wcs\.nrw\.de/);
    globalThis.fetch = async () => new Response('<ServiceExceptionReport><ServiceException>Ungültige Anfrage</ServiceException></ServiceExceptionReport>', { status: 200 });
    await assert.rejects(rwLoadLive(50.7753, 6.0839), /meldet: Ungültige Anfrage/);
    globalThis.fetch = async () => new Response('x', { status: 503 });
    await assert.rejects(rwLoadLive(50.7753, 6.0839), /antwortet 503/);
    globalThis.fetch = async u => new Response(tif);   // 32² statt 512²
    await assert.rejects(rwLoadLive(50.7753, 6.0839), /Höhenraster 32x32 statt 512/);
    globalThis.fetch = async (u, o) => { if (o.signal.aborted) { const e = new Error('abort'); e.name = 'AbortError'; throw e; } return new Response(tif); };
    const ac = new AbortController(); ac.abort();
    await assert.rejects(rwLoadLive(50.7753, 6.0839, () => {}, ac.signal), /Abgebrochen/);
    assert.equal(rw.ver, ver, 'kein halbes Gebiet übernommen');
  } finally { globalThis.fetch = old; }
});
