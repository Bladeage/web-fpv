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
  for (const id of ['bb', 'be', 'ni', 'rp', 'mv']) { const s = RW_SOURCES.find(x => x.id === id); assert.ok(s && s.land && /^EPSG:2583[23]$/.test(s.crs) && !s.dgm.coverage && s.attribution, id); }
  const src = { ...RW_SOURCES.find(x => x.id === 'bb'), dgm: { tpl: 'k3/{e}_{n}.tif', km: 1 } }, f = {};
  for (const [e, n] of [[400, 5800], [401, 5800], [400, 5801], [401, 5801]]) f[`k3/${e}_${n}.tif`] = kachel(e, n);
  const welt = [];
  const get = Object.assign(async u => { if (u.includes('elevation-tiles')) { welt.push(u); throw new Error('Welt offline'); } if (!f[u]) throw new Error('404'); return f[u]; }, {});
  const a = { ...rwAreaAt(401000, 5801000, src), n: 32, dopN: 64 };
  const p = await rwFetchArea(a, src, get, async () => null, () => {}, {});
  assert.ok(Math.abs(p.meta.hMin - h(400500, 5800500)) < 0.5, 'tiefster Punkt ' + p.meta.hMin);
  assert.ok(welt.length > 0 && p.far === null, 'Umgebung aus der Welt-Quelle versucht (hier offline: ohne Umgebung)');
});
