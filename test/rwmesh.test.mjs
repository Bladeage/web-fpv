// Sichtprobe 3D-Mesh (Prompt 191, Etappe M0): Kern ohne Netz und ohne Grafik. Kleiner Kunst-Baum: Wurzel ohne Mesh, ein Knoten
// Stufe 2 (grob, 2 x 2 km), vier Blätter (50 m) mit hoher Schwelle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { I3S, i3s, i3sReset, i3sAddPage, i3sPageOf, i3sGeoUrl, i3sTexUrl, i3sPageUrl, i3sToMap, i3sPlanes, i3sSeen, i3sMetric, i3sSelect, i3sEvict, i3sGeometry } from '../src/rwmesh.js';
import { mPersp, mMul, mLookAt } from '../src/math.js';

const o = { ec: 300000, nc: 5600000, h: 100 };
const node = (index, c, half, kids, lod, res) => ({ index, obb: { center: c, halfSize: half, quaternion: [0, 0, 0, 1] }, children: kids, lodThreshold: lod,
  ...(res ? { mesh: { geometry: { resource: res, vertexCount: 300 }, material: { resource: res, texelCountHint: 65536 } } } : {}) });
function tree() {
  i3sReset();
  i3sAddPage(0, { nodes: [node(0, [300000, 5600000, 100], [3000, 3000, 100], [64], 0, null)] });
  i3sAddPage(1, { nodes: [node(64, [300000, 5600000, 100], [1000, 1000, 50], [65, 66, 67, 68], 200000, 640)] });
  i3sAddPage(1, { nodes: [65, 66, 67, 68].map((k, i) => node(k, [300000 + (i % 2 ? 25 : -25), 5600000 + (i < 2 ? 25 : -25), 100], [25, 25, 10], [], 500000, k*10)) });
  i3s.root = i3s.nodes.get(0); i3s.l1 = i3s.root.ch;
}
const view = (eye, at) => { const vp = mMul(mPersp(1.2, 16/9, 0.1, 9000), mLookAt(eye, at)); return i3sPlanes(vp); };

test('Adressen und Seiten wie am Dienst gemessen', () => {
  assert.equal(i3sPageOf(20351369), 317990);
  assert.equal(i3sPageUrl(5), I3S.url + '/nodepages/5');
  assert.ok(i3sGeoUrl(7).endsWith('/nodes/7/geometries/0') && i3sTexUrl(7).endsWith('/nodes/7/textures/0'));
  assert.deepEqual(i3sToMap([300010, 5600020, 130], o), [10, 30, -20], 'Ost -> x, Höhe -> y, Nord -> -z');
});

test('Sichtkegel und Maß', () => {
  const P = view([0, 50, 300], [0, 0, 0]);
  assert.ok(i3sSeen(P, [0, 0, 0], 1) && !i3sSeen(P, [0, 0, 1000], 1), 'vorn sichtbar, hinten nicht');
  assert.ok(i3sMetric(30, 100, 540) > i3sMetric(30, 400, 540), 'nah größer');
});

test('Auswahl: grob zuerst, fein erst wenn alle sichtbaren Kinder fertig sind; weit weg nur grob', () => {
  tree();
  const far = [0, 3000, 4000], Pf = view(far, [0, 0, 0]);
  let S = i3sSelect(far, 540, Pf, o);
  assert.deepEqual(S.want.map(w => w[0].idx), [64], 'aus der Ferne nur der grobe Knoten');
  i3s.nodes.get(64).st = 'ready';
  S = i3sSelect(far, 540, Pf, o); assert.deepEqual(S.draw.map(n => n.idx), [64]); assert.equal(S.want.length, 0);
  const near = [0, 40, 60], Pn = view(near, [0, 0, 0]);
  S = i3sSelect(near, 540, Pn, o);
  assert.deepEqual(S.draw.map(n => n.idx), [64], 'nah: der grobe zeichnet weiter, solange die Blätter laden');
  assert.ok(S.want.length >= 2 && S.want.every(w => w[0].lod === 500000), 'Blätter angefordert');
  for (const k of [65, 66, 67, 68]) i3s.nodes.get(k).st = 'ready';
  S = i3sSelect(near, 540, Pn, o);
  assert.ok(!S.draw.some(n => n.idx === 64) && S.draw.length >= 2, 'dann nur die Blätter');
});

test('Sehr grober Knoten wird übersprungen (nicht geladen), wenn die Kinder viel feiner nötig sind', () => {
  tree();
  const near = [0, 20, 30], S = i3sSelect(near, 540, view(near, [0, 0, 0]), o);
  assert.ok(!S.want.some(w => w[0].idx === 64) && S.want.some(w => w[0].lod === 500000), 'gleich die Blätter');
});

test('Freigabe: lange nicht gezeichnete zuerst, gezeichnete nie; Speicher in MB', () => {
  tree(); I3S.maxNodes = 2;
  try {
    for (const k of [64, 65, 66, 67, 68]) { const n = i3s.nodes.get(k); n.st = 'ready'; n.t = k === 65 ? 100 : 0; }
    const out = i3sEvict(200, new Set([i3s.nodes.get(66)]));
    assert.equal(out.length, 3); assert.ok(!out.includes(i3s.nodes.get(66)), 'gezeichneter bleibt');
    assert.ok(i3s.gpu > 0 && i3s.gpu < 1, 'Speicher in MB: ' + i3s.gpu);
  } finally { I3S.maxNodes = 160; }
});

test('Geometrie: Kopf, Lagen und Texturkoordinaten; zu kurz wirft', () => {
  const vc = 3, b = new Uint8Array(8 + 20*vc), v = new DataView(b.buffer);
  v.setUint32(0, vc, true); for (let i = 0; i < vc*5; i++) v.setFloat32(8 + 4*i, i, true);
  const G = i3sGeometry(b); assert.equal(G.vc, 3); assert.equal(G.pos[3], 3); assert.equal(G.uv[0], 9);
  const odd = new Uint8Array(b.length + 1); odd.set(b, 1); assert.equal(i3sGeometry(odd.subarray(1)).uv[1], 10, 'ungerader Versatz');
  assert.throws(() => i3sGeometry(b.subarray(0, 20)), /zu kurz/);
});

test('Speicher nachführen: zu viel im Bild macht die Auswahl gröber, wenig wieder feiner; keine Abrufe über der Grenze', async () => {
  const { i3sAdapt, i3sRoom } = await import('../src/rwmesh.js');
  tree(); i3s.qa = 1;
  const big = Array.from({ length: 10 }, () => ({ vc: 1e6, texel: 4e6 }));   // je etwa 41 MB: zusammen über 260 MB
  for (let k = 0; k < 5; k++) i3sAdapt(big);
  assert.ok(i3s.qa > 2.5, 'gröber: ' + i3s.qa.toFixed(2));
  const q1 = i3s.qa; for (let k = 0; k < 5; k++) i3sAdapt([]);
  assert.ok(i3s.qa < q1 && i3s.qa >= 1, 'wieder feiner');
  for (let k = 0; k < 400; k++) i3sAdapt(big); assert.equal(i3s.qa, 64, 'höchstens 64');
  // Gröbere Auswahl: nah am Haus mit großem qa bleibt der grobe Knoten
  tree(); for (const k of [64, 65, 66, 67, 68]) i3s.nodes.get(k).st = 'ready';
  const near = [0, 40, 60], P = view(near, [0, 0, 0]);
  assert.ok(i3sSelect(near, 540, P, o, 1).draw.some(n => n.lod === 500000), 'fein bei qa 1');
  assert.deepEqual(i3sSelect(near, 540, P, o, 1e9).draw.map(n => n.idx), [64], 'grob bei sehr großem Faktor');
  i3s.gpu = 1000; assert.equal(i3sRoom(), false, 'über der Grenze: keine neuen Abrufe'); i3s.gpu = 0; assert.equal(i3sRoom(), true);
  i3s.qa = 1;
});

test('Schneller Start: Stufe 1 eingebettet, nur bei gleicher Wurzel übernommen', async () => {
  const { I3S_L1, i3sAddL1 } = await import('../src/rwmesh.js');
  assert.equal(I3S_L1.length, 108);
  i3sReset(); assert.equal(i3sAddL1([1, 2, 3]), false, 'andere Wurzel: nicht übernehmen'); assert.equal(i3s.nodes.size, 0);
  assert.equal(i3sAddL1(I3S_L1.map(r => r[0])), true); assert.equal(i3s.nodes.size, 108);
  const n = i3s.nodes.get(I3S_L1[0][0]); assert.ok(n.r > 1000 && n.ch.length > 0 && n.res === null);
  // Köln (E 356560, N 5645282) liegt in einer Hüllkugel der Stufe 1
  assert.ok(I3S_L1.some(([, e, nn, , r]) => Math.hypot(e - 356560, nn - 5645282) < r));
  i3sReset();
});
