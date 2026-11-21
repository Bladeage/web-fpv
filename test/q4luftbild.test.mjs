// Etappe Q4: Luftbild aus Sentinel-2 (STAC und COG mit RGB), als BMP. Ohne Netz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tiff } from './tiffwrite.mjs';
import { s2Photo } from '../src/rws2.js';
import { toUtm, fromUtm } from '../src/geo.js';

// 10-m-Bild 200 x 200 Pixel ab (500000, 5302000) in Zone 32, Farbe nach Lage
const col = (e, n) => [Math.round((e - 500000)/10) % 256, Math.round((5302000 - n)/10) % 256, 77];
const img = tiff({ levels: [{ w: 200, h: 200, tw: 64, th: 64, vals: (c, r) => col(500000 + (c + 0.5)*10, 5302000 - (r + 0.5)*10) }], bps: 8, fmt: 1, spp: 3, comp: 8, geo: { x: 500000, y: 5302000, dx: 10 } });
const item = { bbox: [0, 40, 20, 60], properties: { 'proj:epsg': 32632 }, assets: { visual: { href: 'https://s/tci.tif' } } };
const get = { range: async (u, a, b) => img.slice(a, b + 1) };
const bmpAt = (b, px, i, j) => { const row = px*3 + (4 - (px*3) % 4) % 4, o = 54 + j*row + i*3; return [b[o + 2], b[o + 1], b[o]]; };

test('Sentinel-2: Bild für ein UTM-Quadrat, Farben an der richtigen Stelle', async () => {
  let asked = '';
  const text = async u => { asked = u; return JSON.stringify({ features: [item] }); };
  const bb = [500400, 5300400, 501400, 5301400], b = await s2Photo(bb, 32, 50, get, text);
  assert.ok(/collections=sentinel-2-l2a/.test(asked) && /eo%3Acloud_cover/.test(asked), 'Suche mit Wolkengrenze');
  assert.equal(String.fromCharCode(b[0], b[1]), 'BM'); assert.equal(new DataView(b.buffer).getInt32(22, true), -50, 'oben = Norden');
  for (const [i, j] of [[0, 0], [49, 49], [20, 30]]) {
    const want = col(bb[0] + (i + 0.5)*20, bb[3] - (j + 0.5)*20), got = bmpAt(b, 50, i, j);
    assert.ok(Math.abs(got[0] - want[0]) <= 1 && Math.abs(got[1] - want[1]) <= 1 && got[2] === 77, `${i},${j}: ${got} statt ${want}`);
  }
});

test('Sentinel-2: anderes UTM-System umgerechnet, ohne Treffer kein Bild', async () => {
  const text = async () => JSON.stringify({ features: [item] });
  const [lat, lon] = fromUtm(501000, 5301000, 32), [E, N] = toUtm(lat, lon, 33), b = await s2Photo([E - 300, N - 300, E + 300, N + 300], 33, 20, get, text);   // Punkt im Bild, Gebiet in Zone 33
  const want = col(501000, 5301000), got = bmpAt(b, 20, 10, 10);
  assert.ok(Math.abs(got[0] - want[0]) <= 2 && Math.abs(got[1] - want[1]) <= 2, `Mitte ${got} statt ${want}`);
  assert.equal(await s2Photo([E - 300, N - 300, E + 300, N + 300], 33, 20, get, async () => '{"features":[]}'), null);
});
