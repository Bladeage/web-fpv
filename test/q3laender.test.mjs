// Etappe Q3: Höhen der Länder aus Kacheldateien (Vorlage mit {e}/{n}, Dateiliste, STAC mit COG). Ohne Netz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tiff } from './tiffwrite.mjs';
import { tileRaster, RW_SOURCES, rwFetchArea, rwAreaAt } from '../src/rwload.js';
import { toUtm } from '../src/geo.js';

const h = (E, N) => 50 + (E - 400000)*0.01 + (N - 5800000)*0.02;   // Höhe als Ebene in UTM
// 1-km-Kachel e, n (km) mit 100 x 100 Pixeln (10 m), Pixelmitten
const kachel = (e, n, geo = false) => tiff({ levels: [{ w: 100, h: 100, tw: 100, th: 100, vals: (c, r) => h(e*1000 + (c + 0.5)*10, (n + 1)*1000 - (r + 0.5)*10) }], comp: 8, pred: 3, geo: geo ? { x: e*1000, y: (n + 1)*1000, dx: 10 } : null });
const net = files => { const asked = [], get = async u => { asked.push(u); if (!files[u]) throw new Error('x antwortet 404'); return files[u]; };
  return { asked, get, text: async u => { asked.push(u); return files[u] ?? null; } }; };
const check = (r, bb, n, tol = 0.05) => { for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
  const v = r.data[j*n + i], want = h(bb[0] + (i + 0.5)*(bb[2] - bb[0])/n, bb[3] - (j + 0.5)*(bb[3] - bb[1])/n);
  assert.ok(Math.abs(v - want) < tol, `Zelle ${i},${j}: ${v} statt ${want}`); } };

test('Vorlage {e}/{n}: Gebiet über vier Kacheln zusammengesetzt, fehlende Kachel bleibt leer', async () => {
  const f = {}; for (const [e, n] of [[400, 5800], [401, 5800], [400, 5801], [401, 5801]]) f[`k/${e}_${n}.tif`] = kachel(e, n);
  const bb = [400500, 5800500, 401500, 5801500], { get, text, asked } = net(f);
  check(await tileRaster({ tpl: 'k/{e}_{n}.tif', km: 1 }, bb, 'EPSG:25833', 20, get, text), bb, 20);
  assert.equal(asked.length, 4);
  asked.length = 0;
  await tileRaster({ tpl: 'k/{e}_{n}.tif', km: 1 }, bb, 'EPSG:25833', 20, get, text);
  assert.equal(asked.length, 0, 'zweites Mal aus dem Zwischenspeicher');
  delete f['k2/401_5801.tif'];
  const g = {}; for (const k in f) g[k.replace('k/', 'k2/')] = f[k]; delete g['k2/401_5801.tif'];
  const r = await tileRaster({ tpl: 'k2/{e}_{n}.tif', km: 1 }, bb, 'EPSG:25833', 20, net(g).get, text);
  assert.ok(isNaN(r.data[0*20 + 19]) && !isNaN(r.data[19*20 + 0]), 'oben rechts fehlt, unten links da');
});

test('Dateiliste (Name mit Jahr) und STAC mit COG', async () => {
  const bb = [400200, 5800200, 400800, 5800800];
  const list = '<a href="dgm1_32_400_5800_1_rp_2023.tfw">x</a><a href="dgm1_32_400_5800_1_rp_2023.tif">x</a>';
  const A = net({ 'https://l/dgm/': list, 'https://l/dgm/dgm1_32_400_5800_1_rp_2023.tif': kachel(400, 5800) });
  check(await tileRaster({ index: 'https://l/dgm/', tpl: 'dgm1_32_{e}_{n}_1_rp_', km: 1 }, bb, 'EPSG:25832', 12, A.get, A.text), bb, 12);
  const cog = kachel(400, 5800, true), stac = JSON.stringify({ features: [{ assets: { meta: { href: 'https://s/a.xml', type: 'text/plain' }, tif: { href: 'https://s/a.tif', type: 'image/tiff; application=geotiff' } } }] });
  const asked = [], get = Object.assign(async () => cog, { range: async (u, a, b) => { asked.push(u); return cog.slice(a, b + 1); } });
  const text = async u => { asked.push(u); return u.startsWith('https://s/search?collections=dgm1&bbox=') ? stac : null; };
  check(await tileRaster({ stac: 'https://s', coll: 'dgm1', km: 1 }, bb, 'EPSG:25832', 12, get, text), bb, 12);
  assert.ok(asked.every(u => !u.includes('a.xml')), 'nur das GeoTIFF');
});

test('Vorlagen der Länder und Gebiet mit Umgebung aus der Welt-Quelle', async () => {
  for (const id of ['ni', 'rp']) { const s = RW_SOURCES.find(x => x.id === id); assert.ok(s && s.land && !s.dgm.coverage && s.dop && s.attribution, id); }   // Kacheln (Q3)
  for (const id of ['bb', 'be', 'mv']) assert.ok(RW_SOURCES.find(x => x.id === id).dgm.coverage, id + ': WCS (Q6)');
  for (const id of ['by', 'bw', 'hb', 'he', 'sh', 'sl', 'sn', 'st']) { const s = RW_SOURCES.find(x => x.id === id); assert.ok(s && s.dgm === null && s.dop.layer && s.land && s.attribution, id + ': nur Luftbild (Q6)'); }
  assert.equal(RW_SOURCES.find(x => x.id === 'he').dop.max, 3000);
  const src = { ...RW_SOURCES.find(x => x.id === 'bb'), dop: null, lod2: null, dgm: { tpl: 'k3/{e}_{n}.tif', km: 1 } }, f = {};
  for (const [e, n] of [[400, 5800], [401, 5800], [400, 5801], [401, 5801]]) f[`k3/${e}_${n}.tif`] = kachel(e, n);
  const welt = [];
  const get = Object.assign(async u => { if (u.includes('elevation-tiles')) { welt.push(u); throw new Error('Welt offline'); } if (!f[u]) throw new Error('404'); return f[u]; }, {});
  const a = { ...rwAreaAt(401000, 5801000, src), n: 32, dopN: 64 };
  const p = await rwFetchArea(a, src, get, async () => null, () => {}, {});
  assert.ok(Math.abs(p.meta.hMin - h(400500, 5800500)) < 0.5, 'tiefster Punkt ' + p.meta.hMin);
  assert.ok(welt.length > 0 && p.far === null, 'Umgebung aus der Welt-Quelle versucht (hier offline: ohne Umgebung)');
});

test('Q5: Gebäude aus ZIP-Kacheln (Brandenburg, Berlin), fehlende Kachel leer', async () => {
  const { deflateRawSync } = await import('node:zlib');
  const P = (x, y, z) => `${401000 + x} ${5801000 + y} ${z}`, ring = pts => `<gml:exterior><gml:LinearRing><gml:posList>${pts.join(' ')}</gml:posList></gml:LinearRing></gml:exterior>`;
  const wall = (a, b) => `<bldg:WallSurface>${ring([P(...a, 60), P(...b, 60), P(...b, 66), P(...a, 66), P(...a, 60)])}</bldg:WallSurface>`;
  const gml = `<core:CityModel><bldg:Building><bldg:function>31001_1000</bldg:function><bldg:RoofSurface>${ring([P(-5, -5, 66), P(5, -5, 66), P(5, 5, 66), P(-5, 5, 66), P(-5, -5, 66)])}</bldg:RoofSurface>${wall([-5, -5], [5, -5])}${wall([5, -5], [5, 5])}${wall([5, 5], [-5, 5])}${wall([-5, 5], [-5, -5])}</bldg:Building></core:CityModel>`;
  const data = new TextEncoder().encode(gml), body = new Uint8Array(deflateRawSync(data)), nm = new TextEncoder().encode('x/lod2_geb.gml');
  const h = new Uint8Array(30 + nm.length), hv = new DataView(h.buffer); hv.setUint32(0, 0x04034b50, true); hv.setUint16(8, 8, true); hv.setUint32(18, body.length, true); hv.setUint32(22, data.length, true); hv.setUint16(26, nm.length, true); h.set(nm, 30);
  const c = new Uint8Array(46 + nm.length), cv = new DataView(c.buffer); cv.setUint32(0, 0x02014b50, true); cv.setUint16(10, 8, true); cv.setUint32(20, body.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, nm.length, true); c.set(nm, 46);
  const e = new Uint8Array(22), ev = new DataView(e.buffer); ev.setUint32(0, 0x06054b50, true); ev.setUint32(12, c.length, true); ev.setUint32(16, h.length + body.length, true);
  const zip = new Uint8Array([...h, ...body, ...c, ...e]), f = {};
  for (const [x, y] of [[400, 5800], [401, 5800], [400, 5801], [401, 5801]]) f[`k4/${x}_${y}.tif`] = kachel(x, y);
  f['z/401-5801.zip'] = zip;   // nur diese Gebäudekachel gibt es
  const src = { id: 't', land: 'Brandenburg', crs: 'EPSG:25833', dgm: { tpl: 'k4/{e}_{n}.tif', km: 1 }, lod2: { url: 'z/{E}-{N}.zip', tileKm: 1, zip: '_geb.gml' }, attribution: 't' };
  const get = async u => { if (u.includes('elevation-tiles')) throw new Error('offline'); if (!f[u]) throw new Error('x antwortet 404'); return f[u]; };
  const p = await rwFetchArea({ ...rwAreaAt(401000, 5801000, src), n: 32, dopN: 64 }, src, get, async () => null, () => {}, {});
  assert.equal(p.meta.buildings, 1, 'ein Haus aus dem ZIP');
});
