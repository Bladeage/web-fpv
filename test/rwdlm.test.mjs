// Echte Welt, Etappe L4: Landesdaten (Basis-DLM) aus dem ZIP, Gewässerraster, Orte; Laden mit Speicher (ohne Netz: Testdaten)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dlmFind, shpRead, dbfField, dlmWater, dlmPlaces } from '../src/rwdlm.js';
import { rw, rwApply, rwLoadLive, rwExtras, rwLandData, rwLandHas, rwAreaKey, waterAt } from '../src/realworld.js';
import { RW_SOURCES } from '../src/rwload.js';
import { toUtm } from '../src/geo.js';

// Shapefile mit Flächen (Typ 5): je Objekt eine Liste von Ringen [[x, y], ...]
function makeShp(objs) {
  const recs = objs.map(rings => { const np = rings.length, nn = rings.reduce((t, r) => t + r.length, 0), b = Buffer.alloc(44 + np*4 + nn*16), all = rings.flat();
    b.writeInt32LE(5, 0); [Math.min(...all.map(p => p[0])), Math.min(...all.map(p => p[1])), Math.max(...all.map(p => p[0])), Math.max(...all.map(p => p[1]))].forEach((v, i) => b.writeDoubleLE(v, 4 + i*8));
    b.writeInt32LE(np, 36); b.writeInt32LE(nn, 40); let s = 0; rings.forEach((r, i) => { b.writeInt32LE(s, 44 + i*4); s += r.length; });
    all.forEach((p, i) => { b.writeDoubleLE(p[0], 44 + np*4 + i*16); b.writeDoubleLE(p[1], 44 + np*4 + i*16 + 8); }); return b; });
  const head = Buffer.alloc(100); head.writeInt32BE(9994, 0);
  return new Uint8Array(Buffer.concat([head, ...recs.map((r, k) => { const h = Buffer.alloc(8); h.writeInt32BE(k + 1, 0); h.writeInt32BE(r.length/2, 4); return Buffer.concat([h, r]); })]));
}
function makeDbf(names) {
  const L = 20, h = Buffer.alloc(32 + 32 + 1), rec = 1 + L;
  h.writeUInt32LE(names.length, 4); h.writeUInt16LE(65, 8); h.writeUInt16LE(rec, 10);
  h.write('NAM', 32); h[32 + 11] = 0x43; h[32 + 16] = L; h[64] = 0x0d;
  return new Uint8Array(Buffer.concat([h, ...names.map(n => { const r = Buffer.alloc(rec, 0x20); Buffer.from(n).copy(r, 1); return r; })]));
}
// ZIP ohne Kompression (wie das Basis-DLM-Paket) mit Dateien { name: bytes }
function makeZip(files) {
  const loc = [], cen = []; let off = 0;
  for (const [name, data] of Object.entries(files)) {
    const n = Buffer.from(name), l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt32LE(data.length, 18); l.writeUInt32LE(data.length, 22); l.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    loc.push(l, n, Buffer.from(data)); cen.push(c, n); off += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(cen), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...loc, cd, e]));
}
const bb = [305000, 5604000, 305100, 5604100];
// Teich 60 x 60 m mit Insel 20 x 20 m in der Mitte; Ort „Teststadt“ um das Gebiet, „Fernort“ 20 km weg
const pond = [[[305020, 5604020], [305080, 5604020], [305080, 5604080], [305020, 5604080], [305020, 5604020]], [[305040, 5604040], [305060, 5604040], [305060, 5604060], [305040, 5604060], [305040, 5604040]]];
const water = makeShp([pond]);
const placesShp = makeShp([[[[304900, 5603900], [305200, 5603900], [305200, 5604200], [304900, 5604200], [304900, 5603900]]], [[[325000, 5624000], [325100, 5624000], [325100, 5624100], [325000, 5624000]]]]);
const placesDbf = makeDbf(['Teststadt', 'Fernort']);

test('L4: Gewässer: Teich mit Insel im 1-m-Raster (Insel bleibt trocken)', () => {
  const w = dlmWater(water, bb), wet = (x, y) => { const b = y*w.n + x; return (w.bits[b >> 3] >> (b & 7) & 1) === 1; };
  assert.equal(w.n, 100); assert.equal(w.wet, 60*60 - 20*20);
  assert.ok(wet(30, 70) && !wet(50, 50) && !wet(10, 10), 'Rand nass, Insel und Ufer trocken');
  assert.equal(shpRead(water, [0, 0, 1, 1]).length, 0, 'Objekte außerhalb werden übersprungen');
});

test('L4: Orte aus Shape und DBF, nur im Umkreis, in Kartenkoordinaten', () => {
  assert.equal(dbfField(placesDbf, 'NAM')(1), 'Fernort');
  const pl = dlmPlaces(placesShp, placesDbf, bb);
  assert.deepEqual(pl.map(p => p.name), ['Teststadt'], 'Fernort liegt außerhalb von 8 km');
  assert.deepEqual(pl[0].rings[0][0], [-150, 150], 'Mitte des Gebiets = Ursprung, z nach Süden');
});

test('L4: Datei im ZIP finden (ungepackt), auch bei kleinen Paketen', async () => {
  const zip = makeZip({ 'dlm/gew01_f.shp': water, 'dlm/sie01_f.shp': placesShp, 'dlm/sie01_f.dbf': placesDbf });
  const range = async (a, b) => zip.slice(a, b + 1);
  const f = await dlmFind(range, zip.length, 'sie01_f.dbf');
  assert.equal(f.method, 0);
  assert.deepEqual([...zip.slice(f.off, f.off + f.size)], [...placesDbf]);
  assert.equal(await dlmFind(range, zip.length, 'fehlt.shp'), null);
});

// Speicher wie im Browser, hier als Map
const mem = () => { const a = new Map(), l = new Map(); return { a, l, get: async k => a.get(k) || null, put: async (k, r) => (a.set(k, r), true), land: async k => l.get(k) || null, landPut: async (k, b) => (l.set(k, b), true), landHas: async k => l.has(k) }; };

test('L4: Landesdaten aus dem Paket laden (Teilabrufe), danach Gewässer und Orte im Gebiet', async () => {
  const zip = makeZip({ 'x/gew01_f.shp': water, 'x/sie01_f.shp': placesShp, 'x/sie01_f.dbf': placesDbf }), store = mem(), old = globalThis.fetch;
  const src = { ...RW_SOURCES[0], dlm: { ...RW_SOURCES[0].dlm, mb: 1 } };
  try {
    globalThis.fetch = async (u, o = {}) => {
      if (o.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-length': String(zip.length) } });
      const [, a, b] = o.headers.Range.match(/bytes=(\d+)-(\d+)/);
      return new Response(zip.slice(+a, +b + 1), { status: 206 });
    };
    assert.equal(await rwLandHas(src, store), false);
    await rwLandData(src, store);
    assert.equal(await rwLandHas(src, store), true);
    assert.equal(store.l.size, 3);
  } finally { globalThis.fetch = old; }
  const p = { meta: { bbox: bb, crs: 'EPSG:25832' } }, x = await rwExtras(p, src, store);
  assert.equal(p.meta.water.area, 3200);
  assert.equal(x.features.places[0].name, 'Teststadt');
});

test('L4: geladener Ort wird gespeichert und beim zweiten Mal ohne Netz geöffnet', async () => {
  const store = mem(), old = globalThis.fetch, [lat, lon] = [50.5553, 6.2428];
  const p = { meta: { name: 'live', place: 'Speichertest', crs: 'EPSG:25832', bbox: [304200, 5603500, 305200, 5604500], n: 2, hMin: 500, hMax: 500, hScale: 0.1, home: [0, 0], hHome: 500, roofTris: 0, wallTris: 0, buildings: 0, trees: 0, attribution: 'Test' },
    q: new Uint16Array(4), b16: new Int16Array(0), t16: new Int16Array(0), dop: null, water: null, features: null };
  await store.put(rwAreaKey(lat, lon, [RW_SOURCES[0]]), p);
  try {
    globalThis.fetch = async () => { throw new TypeError('offline'); };
    await rwLoadLive(lat, lon, () => {}, undefined, null, store);
    assert.ok(rw.live && rw.fromStore && rw.meta.place === 'Speichertest', 'ohne Netz aus dem Speicher');
    // Landesdaten kommen später dazu: beim nächsten Öffnen mit Gewässern, und der Speicher wird ergänzt
    const shp = makeShp([[[[304600, 5603900], [304800, 5603900], [304800, 5604100], [304600, 5604100], [304600, 5603900]]]]);
    store.l.set(RW_SOURCES[0].dlm.url + ':gew01_f.shp', shp);
    await rwLoadLive(lat, lon, () => {}, undefined, null, store);
    rw.on = true;
    assert.ok(waterAt(-0, 0) || waterAt(-1, 0), 'Teich in der Mitte des Gebiets');
    assert.ok(store.a.get(rwAreaKey(lat, lon, [RW_SOURCES[0]])).water, 'Speicher ergänzt');
    rw.on = false;
  } finally { globalThis.fetch = old; }
});
