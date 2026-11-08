// Echte Welt: Bäume nicht im Wasser (Prüfbericht 08.11.2026), Brücken als eigene Klasse, Wassernetz mit Ufer-Anteil.
// Eigene Datei: rwApply wird hier mehrfach aufgerufen, das darf den Zustand der anderen Tests nicht berühren.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { rw, rwApply, rwModelMesh, rwWallAlpha, rwWaterMesh, WATER_A, WATER_UP, groundH, waterAt } from '../src/realworld.js';
import { bldClass } from '../src/rwload.js';

const file = n => new URL('../' + n, import.meta.url);
const meta = JSON.parse(readFileSync(file('realworld/monschau.json'), 'utf8'));
const q = inflateSync(readFileSync(file('realworld/monschau.dgm')));
const un = n => { const b = inflateSync(readFileSync(file('realworld/monschau.' + n))); return new Int16Array(b.buffer, b.byteOffset, b.byteLength/2); };
const water = new Uint8Array(inflateSync(readFileSync(file('realworld/monschau.water'))));
const pack = () => ({ meta: JSON.parse(JSON.stringify(meta)), q: new Uint16Array(q.buffer, q.byteOffset, q.byteLength/2), b16: un('bld'), t16: un('trees') });

test('Bäume nicht im Wasser: Spitze, Umkreis 1,5 m und Fuß unter dem Spiegel im Kronenkreis', () => {
  rwApply(pack(), { water });
  rw.on = true;
  assert.ok(rw.trees.length > 2500 && rw.trees.length < meta.trees, `${rw.trees.length} von ${meta.trees} Bäumen bleiben`);
  for (const t of rw.trees) {
    assert.equal(waterAt(t.x, t.z), false, 'Spitze im Wasser');
    for (let k = 0; k < 8; k++) { const a = k*Math.PI/4; assert.equal(waterAt(t.x + Math.cos(a)*1.5, t.z + Math.sin(a)*1.5), false, 'Wasser 1,5 m neben der Spitze'); }
    const R = Math.ceil(t.r);
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) if (i*i + j*j <= t.r*t.r && waterAt(t.x + i, t.z + j))
      assert.ok(t.y0 >= groundH(t.x + i, t.z + j) + WATER_UP, `Fuß ${t.y0.toFixed(2)} unter dem Wasserspiegel bei (${t.x}, ${t.z})`);
  }
  rw.on = false;
});

test('Zweites Gebiet nimmt seine eigene Wassermaske (vorher: die des alten rw.main)', () => {
  rwApply(pack(), { water });
  const n1 = rw.trees.length;
  const all = new Uint8Array(water.length).fill(255);   // alles nass
  rwApply(pack(), { water: all });
  assert.equal(rw.trees.length, 0, `alles nass: kein Baum (vorher blieben ${n1})`);
  rwApply(pack(), { water: null });   // ohne Wasser: alle Spitzen sind Bäume
  assert.equal(rw.trees.length, meta.trees);
  rwApply(pack(), { water });
  assert.equal(rw.trees.length, n1, 'gleiche Maske, gleiches Ergebnis');
});

test('Brücken (53001) sind Klasse 8; im Netz Beton statt Wohnhaus, auch für alte Daten (Platte unter 2 m)', () => {
  assert.equal(bldClass('53001_1800'), 8);
  assert.equal(bldClass('53001_1801'), 8);
  assert.equal(bldClass('31001_1000'), 0);
  // zwei Quader: Platte 20 x 6 m, 1,3 m dick (Klasse 0, wie gepackt vor der Klasse 8) und Haus 10 x 10 m, 7 m hoch (Klasse 0)
  const box = (x0, z0, x1, z1, y0, y1) => {
    const roof = [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z0], [x1, y1, z1], [x0, y1, z1]];
    const wall = [];
    for (const [a, b] of [[[x0, z0], [x1, z0]], [[x1, z0], [x1, z1]], [[x1, z1], [x0, z1]], [[x0, z1], [x0, z0]]])
      wall.push([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y0, a[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]);
    return { roof, wall };
  };
  const A = box(0, 0, 20, 6, 10, 11.3), B = box(40, 0, 50, 10, 10, 17), C = box(80, 0, 100, 6, 10, 11.3);
  const roofs = [...A.roof, ...B.roof, ...C.roof], walls = [...A.wall, ...B.wall, ...C.wall];
  const tris = new Float32Array([...roofs, ...walls].flat()), nr = roofs.length/3, nt = tris.length/9;
  const bldId = new Int16Array(nt), roofTris = [2, 2, 2], wallTris = [8, 8, 8];
  let t = 0; roofTris.forEach((n, id) => { for (let k = 0; k < n; k++) bldId[t++] = id; }); wallTris.forEach((n, id) => { for (let k = 0; k < n; k++) bldId[t++] = id; });
  const v = rwModelMesh({ tris, nr, bldId, bldInfo: new Int16Array([0, 0, 8]), trees: [] });
  const wallAlpha = id => { const out = new Set(); for (let i = nr*3; i < nt*3; i++) if (bldId[Math.floor(i/3)] === id) out.add(+v[i*10 + 9].toFixed(4)); return [...out]; };
  assert.deepEqual(wallAlpha(0), [+rwWallAlpha(10, 8).toFixed(4)], 'Platte 1,3 m: Brücke');
  assert.deepEqual(wallAlpha(2), [+rwWallAlpha(10, 8).toFixed(4)], 'Klasse 8 aus den Daten: Brücke');
  assert.ok([rwWallAlpha(10, 0), rwWallAlpha(10, 7)].map(a => +a.toFixed(4)).includes(wallAlpha(1)[0]), 'Haus 7 m: Wohnhaus oder Fachwerk');
  assert.ok(rwWallAlpha(190, 8) < 0.5, 'Klasse 8 bleibt im Wand-Bereich des Shaders');
  const roofCol = v.slice(2*30 + 6, 2*30 + 9);   // erstes Dachdreieck des Hauses (Platte: grau)
  assert.ok(Math.abs(v[6] - v[7]) < 0.03 && v[6] > 0.5, 'Brückendeck grau: ' + v.slice(6, 9).join(','));
  assert.ok(roofCol.length === 3);
});

test('Wassernetz: Alpha-Kennung für den Shader, Ufer-Anteil in der Normale (0 am Rand, 1 im Fluss)', () => {
  rwApply(pack(), { water });
  const v = rwWaterMesh();
  assert.ok(v.length > 1000);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < v.length; i += 10) { assert.ok(Math.abs(v[i + 9] - WATER_A) < 1e-6); assert.equal(v[i + 3], 0); assert.equal(v[i + 5], 0); lo = Math.min(lo, v[i + 4]); hi = Math.max(hi, v[i + 4]); }
  assert.ok(lo >= 1 && lo < 1.3 && hi <= 2 && hi > 1.9, `Normale ${lo} bis ${hi}`);
  // Alpha bleibt knapp unter der Dach-Kennung (0,55 bis 0,65) und über der Wand (< 0,5)
  assert.ok(WATER_A > 0.66 && WATER_A < 0.74);
});
