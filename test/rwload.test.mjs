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

// ---- L3: eigene Quellen, mehrere Quellen an einer Grenze ----
import { rwCellSources, rwCheckSource, rwSourcesParse, RW_CELLS } from '../src/rwload.js';
import { rwPlan, rwSources } from '../src/realworld.js';
import { deSetMap, deLandAt } from '../src/demap.js';
import { readTiff } from '../src/geo.js';

// Kleines TIFF ohne Kompression (Gleitkomma), wie es ein WCS liefern kann
function makeTiff(n, val, nodata = -9999) {
  const nd = Buffer.from(String(nodata) + '\0'), tags = [[256, 4, 1, n], [257, 4, 1, n], [258, 3, 1, 32], [259, 3, 1, 1], [262, 3, 1, 1], [273, 4, 1, 0], [277, 3, 1, 1], [278, 4, 1, n], [279, 4, 1, n*n*4], [339, 3, 1, 3], [42113, 2, nd.length, 0]];
  const ifd = 8, ndOff = ifd + 2 + tags.length*12 + 4, dataOff = ndOff + nd.length + (nd.length % 2), b = Buffer.alloc(dataOff + n*n*4);
  b.write('II', 0); b.writeUInt16LE(42, 2); b.writeUInt32LE(ifd, 4); b.writeUInt16LE(tags.length, ifd);
  tags.forEach(([t, ty, c, v], k) => { const o = ifd + 2 + k*12; b.writeUInt16LE(t, o); b.writeUInt16LE(ty, o + 2); b.writeUInt32LE(c, o + 4);
    if (t === 273) b.writeUInt32LE(dataOff, o + 8); else if (t === 42113) b.writeUInt32LE(ndOff, o + 8); else if (ty === 3) b.writeUInt16LE(v, o + 8); else b.writeUInt32LE(v, o + 8); });
  nd.copy(b, ndOff);
  for (let k = 0; k < n*n; k++) b.writeFloatLE(typeof val === 'function' ? val(k % n, Math.floor(k/n)) : val, dataOff + k*4);
  return new Uint8Array(b);
}
const srcA = { id: 'a', name: 'Quelle A', land: 'Nordrhein-Westfalen', crs: 'EPSG:25832', dgm: { url: 'https://a.test/wcs', coverage: 'dgm' }, dop: { url: 'https://a.test/wms', layer: 'dop' }, lod2: { url: 'https://a.test/LoD2_{E}_{N}.gml', tileKm: 1 }, attribution: 'A-Lizenz' };
const srcB = { id: 'b', name: 'Quelle B', land: 'Niedersachsen', crs: 'EPSG:25832', dgm: { url: 'https://b.test/wcs', coverage: 'dgm' }, lod2: { url: 'https://b.test/LoD2_{E}_{N}.gml', tileKm: 1 }, attribution: 'B-Lizenz' };

test('L3: eigenes TIFF wird gelesen (Testhilfe)', () => {
  const t = readTiff(makeTiff(8, (i, j) => i + 10*j).buffer);
  assert.equal(t.w, 8); assert.equal(t.data[8*3 + 2], 32); assert.equal(t.nodata, -9999);
});

test('L3: zwei Quellen an einer Grenze: Höhen je Zelle, Lücken aus der anderen, Gebäude nach Land', async () => {
  const n = 32, a = { ...rwAreaAt(305000, 5604000, srcA), n, place: 'Grenze' };
  const cells = new Int8Array(RW_CELLS*RW_CELLS).map((_, k) => (k % RW_CELLS) < RW_CELLS/2 ? 0 : 1);   // links A, rechts B
  // A: 100 m, aber in Spalte 3 Füllwert (Lücke); B: 200 m
  const get = async u => u.startsWith('https://a.test/wcs') ? makeTiff(n, (i) => i === 3 ? -9999 : 100) : u.startsWith('https://b.test/wcs') ? makeTiff(n, 200) : new Uint8Array([0xff, 0xd8]);
  // Je Quelle ein Haus links (bei 304600) und eins rechts (bei 305300); B liefert beide, A auch
  const house = (e0, n0, fn) => gml(e0, n0).replace('31001_2700', fn);
  const text = async u => u.includes('_305_5604') ? `<core:CityModel>${house(304600, 5604000, u.startsWith('https://a') ? '31001_1000' : '31001_1100').replace(/<\/?core:CityModel>/g, '')}${house(305300, 5604000, u.startsWith('https://a') ? '31001_1000' : '31001_1100').replace(/<\/?core:CityModel>/g, '')}</core:CityModel>` : null;
  let merged = null;
  const p = await rwFetchArea(a, [srcA, srcB], get, text, () => {}, { cells, mergeImg: async (imgs, c) => { merged = [imgs.length, c === cells]; return new Uint8Array([0xff, 0xd8, 1]); } });
  const q = p.q, lo = p.meta.hMin, h = k => lo + q[k]*0.1;
  assert.equal(lo, 100);
  assert.ok(Math.abs(h(5*n + 1) - 100) < 1e-6, 'links: A');
  assert.ok(Math.abs(h(5*n + 3) - 200) < 1e-6, 'Lücke in A: aus B gefüllt');
  assert.ok(Math.abs(h(5*n + 30) - 200) < 1e-6, 'rechts: B');
  assert.deepEqual(merged, [2, true], 'Luftbilder beider Quellen zusammengesetzt');
  assert.equal(p.meta.buildings, 2, 'je Haus nur einmal (links aus A, rechts aus B)');
  const nt = p.meta.roofTris + p.meta.wallTris, cls = [...p.b16.slice(nt*10, nt*10 + 2)].map(v => v & 15).sort();
  assert.deepEqual(cls, [0, 1], 'Wohnhaus aus A (links), Wohnhaus mit Laden aus B (rechts)');
  assert.equal(p.meta.attribution, 'A-Lizenz; B-Lizenz');
});

test('L3: Quelle prüfen (Höhen, Luftbild, Gebäude) mit verständlichen Ergebnissen', async () => {
  const ok = await rwCheckSource(srcA, 305000, 5604000, async u => u.includes('wcs') ? makeTiff(16, 321.5) : new Uint8Array([0xff, 0xd8, 0, 0]), async () => '<core:CityModel>x</core:CityModel>');
  assert.deepEqual(ok.map(r => [r.was, r.ok]), [['Höhen', true], ['Luftbild', true], ['Gebäude', true]]);
  assert.match(ok[0].text, /321\.5/);
  const bad = await rwCheckSource(srcA, 305000, 5604000, async u => { if (u.includes('wcs')) return makeTiff(16, -9999); throw new Error('Keine Verbindung zu a.test'); }, async () => null);
  assert.deepEqual(bad.map(r => r.ok), [false, false, true]);
  assert.match(bad[0].text, /Füllwerte/); assert.match(bad[1].text, /Keine Verbindung/); assert.match(bad[2].text, /keine Kachel/);
});

test('L3: Quellen-Datei lesen: gültige übernehmen, Fehler benennen', () => {
  const r = rwSourcesParse(JSON.stringify({ format: 'fpvsim-quellen', version: 1, sources: [srcB, { name: 'Ohne Höhen', crs: 'EPSG:25832' }, { ...srcB, name: 'Falsches Muster', lod2: { url: 'https://x/lod2.gml' } }, { ...srcB, name: 'GK', crs: 'EPSG:31466' }] }));
  assert.deepEqual(r.sources.map(s => s.name), ['Quelle B']);
  assert.equal(r.errors.length, 3);
  assert.match(r.errors.join(' '), /Höhen .* fehlen/); assert.match(r.errors.join(' '), /\{E\} und \{N\}/); assert.match(r.errors.join(' '), /EPSG:25832 oder EPSG:25833/);
  assert.deepEqual(rwSourcesParse('kein json').errors, ['keine gültige Datei (JSON)']);
});

test('L3: Planung an echten Grenzen: Nachbarland dazu, anderes Koordinatensystem außen vor', () => {
  deSetMap(JSON.parse(readFileSync(new URL('../realworld/germany.json', import.meta.url), 'utf8')));
  rw.userSources = [];
  const nds = { ...srcB, id: 'nds' }, sn = { ...srcB, id: 'sn', name: 'Sachsen', land: 'Sachsen', crs: 'EPSG:25833' }, th = { ...srcB, id: 'th', name: 'Thüringen', land: 'Thüringen' };
  // Grenze NRW / Niedersachsen bei Rahden (52.43, 8.62): ohne eigene Quelle nur NRW, mit Niedersachsen beide
  let plan = rwPlan(52.43, 8.62);
  assert.ok(plan === null || plan.srcs.every(s => s.id === 'nrw'));
  rw.userSources = [nds];
  // Grenze suchen: von Minden (NRW) nach Norden, bis das Land wechselt
  const land = (la, lo) => deLandAt(...toUtm(la, lo));
  let la = 52.29; while (la < 52.7 && land(la, 8.92) === 'Nordrhein-Westfalen') la += 0.001;
  assert.equal(land(la, 8.92), 'Niedersachsen');
  plan = rwPlan(la - 0.001, 8.92);
  assert.ok(plan, 'Punkt an der Grenze gefunden');
  assert.deepEqual(plan.srcs.map(s => s.id).sort(), ['nds', 'nrw']);
  const cells = rwCellSources(plan.area, plan.srcs, plan.toLand);
  assert.ok(cells.includes(0) && cells.includes(1), 'beide Quellen haben Zellen');
  // Grenze Thüringen (UTM 32) / Sachsen (UTM 33): Sachsen bleibt außen vor
  rw.userSources = [th, sn];
  let lo = 12.0; while (lo < 12.6 && land(50.85, lo) !== 'Sachsen') lo += 0.001;   // von Thüringen nach Osten bis Sachsen
  const p2 = rwPlan(50.85, lo - 0.001);
  assert.ok(p2, 'Grenzpunkt TH/SN gefunden');
  assert.deepEqual([p2.srcs[0].crs, p2.skipped[0].crs].sort(), ['EPSG:25832', 'EPSG:25833']);
  assert.ok(rwSources().find(s => s.id === 'sn').box[2] > 800000, 'Rechteck aus dem Land berechnet');
  rw.userSources = [];
});

test('L3 Polieren: Lücken ohne Werte werden keine Bäume, der Start bleibt gültig', async () => {
  const n = 32, a = { ...rwAreaAt(305000, 5604000, srcA), n, place: 'Lücke' };
  const cells = new Int8Array(RW_CELLS*RW_CELLS).map((_, k) => (k % RW_CELLS) < RW_CELLS/2 ? 0 : 1);
  // beide Quellen ohne Oberfläche; Spalten 10 bis 21 (auch am Start in der Mitte) in keiner Quelle mit Wert
  const get = async u => u.includes('wcs') ? makeTiff(n, i => i >= 10 && i <= 21 ? -9999 : 100 + i*0.1) : new Uint8Array([0xff, 0xd8]);
  const p = await rwFetchArea(a, [srcA, srcB], get, async () => null, () => {}, { cells });
  assert.equal(p.meta.trees, 0, 'keine Bäume aus Lücken (vorher fast jeder Bildpunkt)');
  assert.ok(Number.isFinite(p.meta.hHome) && Number.isFinite(p.meta.startSpan), 'Start gültig: ' + p.meta.hHome);
  assert.ok([...p.q].every(v => Number.isFinite(v)));
  await assert.rejects(rwFetchArea(a, [srcA, srcB], async u => u.includes('wcs') ? makeTiff(n, -9999) : new Uint8Array([0xff, 0xd8]), async () => null, () => {}, { cells }), /Keine gültigen Höhen/);
});

test('L3 Polieren: Quellen ohne Bundesland, Oberfläche ohne Coverage oder Luftbild ohne Layer werden abgelehnt', () => {
  const r = rwSourcesParse(JSON.stringify([{ ...srcB, land: '' }, { ...srcB, name: 'x', dom: { url: 'https://b.test/dom' } }, { ...srcB, name: 'y', dop: { url: 'https://b.test/wms' } }]));
  assert.equal(r.sources.length, 0);
  assert.match(r.errors[0], /Bundesland fehlt/); assert.match(r.errors[1], /Coverage-ID fehlt/); assert.match(r.errors[2], /Layer fehlt/);
});
