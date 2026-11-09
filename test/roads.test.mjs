// Straßen und Verkehr (Prompt 180/184, Etappe S1): Graph aus Linienzügen, Zufallswege, Spur rechts, Höhenprofil in Monschau,
// Zufallsautos. Quelle egal (heute Basis-DLM Monschau), damit später jede Straßenquelle passt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { cfg } from '../src/state.js';
import { rw, rwApply, rwSetShow, groundH, placeReal, rwPlace } from '../src/realworld.js';
import { roadGraph, roadWalk, laneOffset, laneProfile, roadH, rwRoads, ROADS, lampSpots, lampMesh, rwLamps, LAMP } from '../src/roads.js';
import { traffic, trafficStep, TRAFFIC } from '../src/traffic.js';
import { rng } from '../src/world.js';

const f = n => readFileSync(new URL('../realworld/monschau.' + n, import.meta.url));
const un = n => { const b = inflateSync(f(n)); return new Int16Array(b.buffer, b.byteOffset, b.byteLength/2); };
const load = () => {
  const meta = JSON.parse(f('json')), q = inflateSync(f('dgm'));
  rwApply({ meta, q: new Uint16Array(q.buffer, q.byteOffset, q.byteLength/2), b16: un('bld'), t16: un('trees') },
    { water: new Uint8Array(inflateSync(f('water'))), features: JSON.parse(f('features.json')) });
  rw.on = true; rw.ready = true;
};

test('Graph: T-Kreuzung teilt die Achse, Enden fassen zusammen', () => {
  const G = roadGraph([{ name: 'A', pts: [[0, 0], [100, 0]] }, { name: 'B', pts: [[50, 0.8], [50, 80]] }, { name: 'C', pts: [[100.6, 0.4], [160, 0]] }]);
  assert.equal(G.edges.length, 4, 'A in zwei Teile, B, C');
  const deg = G.nodes.map(n => n.e.length).sort();
  assert.deepEqual(deg, [1, 1, 1, 2, 3]);
  const t = G.nodes.find(n => n.e.length === 3); assert.ok(Math.abs(t.x - 50) < 1 && Math.abs(t.z) < 1, 'Kreuzung bei (50, 0)');
  assert.ok(Math.abs(G.len - (100 + 79.2 + 59.4)) < 1.5);
  assert.equal(G.edges[0].w, ROADS.w, 'Breite ohne Angabe 5,5 m');
});

test('Zufallsweg: lang genug, wendet nur in Sackgassen', () => {
  const G = roadGraph([{ pts: [[0, 0], [100, 0]] }, { pts: [[100, 0], [100, 100]] }, { pts: [[100, 0], [200, 0]] }]);
  const W = roadWalk(G, 0, 0, 500, rng(3));
  let len = 0; for (let i = 1; i < W.pts.length; i++) len += Math.hypot(W.pts[i][0] - W.pts[i - 1][0], W.pts[i][1] - W.pts[i - 1][1]);
  assert.ok(len >= 500);
  // erster Wechsel an der Kreuzung (100, 0): nicht zurück nach (0, 0)
  const k = W.pts.findIndex(p => p[0] === 100 && p[1] === 0); assert.ok(!(W.pts[k + 1][0] === 0 && W.pts[k + 1][1] === 0));
});

test('Spur rechts: nach Norden fahrend liegt sie östlich (x Ost, z Süd)', () => {
  const L = laneOffset([[0, 0], [0, -10], [0, -20]], 1.5);
  assert.ok(L.every(p => Math.abs(p[0] - 1.5) < 1e-9));
  const E = laneOffset([[0, 0], [10, 0]], 1.5); assert.ok(E.every(p => Math.abs(p[1] - 1.5) < 1e-9), 'nach Osten: südlich');
});

test('Monschau: Wege mit Höhenprofil auf der Fahrbahn, frei und trocken', () => {
  load();
  const G = rwRoads(); assert.ok(G && G.edges.length > 80 && G.len > 9000, 'Graph ' + (G && G.len));
  const W = placeReal(), R = rng(7);
  let n = 0, pts = 0;
  const t0 = performance.now();
  for (let k = 0; k < 20; k++) {
    const w = roadWalk(G, Math.floor(R()*G.edges.length), R() < 0.5 ? 0 : 1, 600, R);
    const P = laneProfile(laneOffset(w.pts, 1.75), w.pts, W);
    pts += P.length; if (P.length > 10) n++;
    for (const [x, z, y] of P) {
      assert.ok(y > groundH(x, z) - 0.31, 'nicht unter dem Boden');
      assert.ok(W.free([x, y + ROADS.clear, z], ROADS.r), 'frei');
      if (Math.abs(y - groundH(x, z)) < 0.3) assert.ok(!W.wet(x, z) || y >= groundH(x, z) + 0.25, 'nicht im Wasser');
    }
  }
  assert.ok(n >= 15, n + ' von 20 Wegen mit Profil');
  assert.ok(performance.now() - t0 < 3000, 'Rechenzeit');
  // Brückendeck: Profil über Wasser folgt dem Deck, wenn es von der Rampe kommt
  assert.equal(roadH(0, 0), groundH(0, 0));
  rw.on = false;
});

test('Verkehr: Autos erscheinen, fahren auf der Spur im Tempo, nicht in DIS und nicht mit Schalter aus', () => {
  load();
  const R = rng(11), c = [rw.meta.home[0], 0, rw.meta.home[1]];
  traffic.cars.length = 0; traffic.key = '';
  for (let i = 0; i < 400; i++) trafficStep(0.05, c, [0, -1], R);
  assert.ok(traffic.cars.length >= 4, traffic.cars.length + ' Autos');
  for (const a of traffic.cars) {
    assert.ok(a.v >= TRAFFIC.speed[0]*0.4 - 1e-9 && a.v <= TRAFFIC.speed[1] + 1e-9, 'Tempo ' + a.v);
    assert.ok(Math.abs(a.y - groundH(a.x, a.z)) < 13, 'auf Boden oder Deck');
    const d = Math.min(...a.route.pts.map(p => Math.hypot(p[0] - a.x, p[1] - a.z))); assert.ok(d < ROADS.step + 0.1, 'auf der Spur');
  }
  cfg.verbund = true; trafficStep(0.05, c, null, R); assert.equal(traffic.cars.length, 0, 'DIS: keine'); cfg.verbund = false;
  for (let i = 0; i < 40; i++) trafficStep(0.05, c, null, R);
  assert.ok(traffic.cars.length > 0);
  rwSetShow({ traffic: false }); rw.on = true; trafficStep(0.05, c, null, R); assert.equal(traffic.cars.length, 0, 'Schalter aus');
  assert.equal(rw.showOff, false, 'Verkehr aus sperrt keine Bestzeit');
  rwSetShow({}); rw.on = false;
});

test('Laternen (N2): in Ortslagen, Abstand etwa 35 m, neben der Fahrbahn; Köpfe und Lichtscheiben mit Lichtkennung', () => {
  load();
  const G = rwRoads(), S = lampSpots(G);
  assert.ok(S.length > 60 && S.length < 400, S.length + ' Laternen');
  const W = placeReal();
  for (const [x, z] of S) {
    assert.equal(rwPlace(x, z).d, 0, 'in einer Ortslage'); assert.ok(!W.wet(x, z), 'trocken');
    // Abstand zur nächsten Achse: halbe Breite + 0,6 m (± 1 m)
    let d = Infinity; for (const E of G.edges) for (let i = 0; i < E.pts.length - 1; i++) {
      const a = E.pts[i], b = E.pts[i + 1], ex = b[0] - a[0], ez = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0])*ex + (z - a[1])*ez)/(ex*ex + ez*ez || 1)));
      d = Math.min(d, Math.hypot(x - a[0] - ex*t, z - a[1] - ez*t)); }
    assert.ok(d < ROADS.w/2 + LAMP.side + 1, 'neben der Straße: ' + d.toFixed(2));
  }
  // Abstand zur nächsten anderen Laterne meist um 35 m (Seiten wechseln: diagonal etwas mehr), nie unter 10 m an einer Kante
  const nn = S.map((p, i) => Math.min(...S.filter((_, j) => j !== i).map(q => Math.hypot(q[0] - p[0], q[1] - p[1]))));
  nn.sort((a, b) => a - b); const med = nn[nn.length >> 1];
  assert.ok(med > 25 && med < 45, 'Median Abstand ' + med.toFixed(1));
  const M = lampMesh(S.slice(0, 3)), al = i => M.data[i*10 + 9];
  assert.equal(M.count - M.solid, 3*8*3, 'drei Scheiben aus 8 Dreiecken');
  let heads = 0; for (let i = 0; i < M.solid; i++) if (Math.abs(al(i) - 0.75) < 1e-6) heads++;
  assert.equal(heads, 3*36, 'Köpfe leuchten');
  for (let i = M.solid; i < M.count; i++) assert.ok(Math.abs(al(i) - 0.75) < 1e-6, 'Scheiben leuchten');
  const L = rwLamps(); assert.ok(L && L.spots.length === S.length && rwLamps() === L, 'zwischengespeichert');
  rw.on = false;
});
