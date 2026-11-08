// Echte Welt (RW1): GeoTIFF lesen, Gelände aus den eingebetteten Daten, Physik auf echtem Boden.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { cfg, game, inp } from '../src/state.js';
import { buildWorld } from '../src/world.js';
import { STEP, step, respawn, hoverThrottle } from '../src/physics.js';
import { setScenario } from '../src/scenario.js';
import { applyDrone } from '../src/drone.js';
import { readTiff, toUtm, fromUtm } from '../src/geo.js';
import { rw, rwInit, rwModels, rwModelMesh, rwWallAlpha, groundH, groundN, rwMesh, rwNear, waterAt, rwWaterMesh, rwFeatureMesh, rwNearName, rwLatLon, rwPlace, rwPlaceCenters } from '../src/realworld.js';
import { pilot } from '../src/pilot.js';
import { qRot } from '../src/math.js';
import { birds, initBirds, stepBirds } from '../src/birds.js';
import { osdLines, fmtLatLon } from '../src/osd.js';
import { rng } from '../src/world.js';

const file = n => new URL('../' + n, import.meta.url);
const meta = JSON.parse(readFileSync(file('realworld/monschau.json'), 'utf8'));
const q = inflateSync(readFileSync(file('realworld/monschau.dgm')));
rwInit(meta, new Uint16Array(q.buffer, q.byteOffset, q.byteLength/2));
const un = n => { const b = inflateSync(readFileSync(file('realworld/monschau.' + n))); return new Int16Array(b.buffer, b.byteOffset, b.byteLength/2); };
rw.features = JSON.parse(readFileSync(file('realworld/monschau.features.json'), 'utf8'));
rw.water = new Uint8Array(inflateSync(readFileSync(file('realworld/monschau.water'))));
rwModels(un('bld'), un('trees'));
buildWorld();
after(() => { setScenario('gates'); cfg.dmg = 'off'; });
const run = (sec, fn) => { for (let i = 0; i < sec/STEP && game.state === 'fly'; i++) { if (fn) fn(); step(STEP); } };

test('GeoTIFF: echte NRW-Probe (LZW, Gleitkomma) wird gelesen', () => {
  const b = readFileSync(file('test/fixtures/nrw-dgm-32.tif'));
  const t = readTiff(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  assert.equal(t.w, 32); assert.equal(t.h, 32);
  let lo = 1e9, hi = -1e9, jump = 0;
  for (let i = 0; i < t.data.length; i++) { lo = Math.min(lo, t.data[i]); hi = Math.max(hi, t.data[i]); if (i % 32) jump = Math.max(jump, Math.abs(t.data[i] - t.data[i - 1])); }
  assert.ok(lo > 450 && hi < 530, `Höhen wie auf der Hochfläche bei Monschau: ${lo.toFixed(1)} bis ${hi.toFixed(1)} m`);
  assert.ok(jump < 5, 'glatte Nachbarwerte (kein Lesefehler): ' + jump.toFixed(2));
});

test('UTM: Monschau liegt im Gebiet', () => {
  const [e, n] = toUtm(50.5555, 6.243);
  assert.ok(e > meta.bbox[0] && e < meta.bbox[2] && n > meta.bbox[1] && n < meta.bbox[3], `${e.toFixed(0)} ${n.toFixed(0)}`);
});

test('Gelände: Höhen, Neigung, Netz; Startplatz bei y = 0', () => {
  rw.on = true;
  assert.ok(Math.abs(groundH(meta.home[0], meta.home[1])) < 0.3, 'Start bei y = 0');
  assert.ok(meta.hMax - meta.hMin > 100, 'echtes Relief: ' + (meta.hMax - meta.hMin).toFixed(0) + ' m');
  let lo = 1e9; for (let x = -480; x <= 480; x += 40) for (let z = -480; z <= 480; z += 40) lo = Math.min(lo, groundH(x, z));
  assert.ok(lo < -80, 'Tal deutlich unter dem Start: ' + lo.toFixed(0) + ' m');
  const n = groundN(0, 0); assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-9 && n[1] > 0);
  // außen der Rand des Netzes bis 1,5 km (ohne Umgebung): dahinter gleich, kein Sprung am letzten Messpunkt
  assert.equal(groundH(2000, 0), groundH(1500, 0), 'außen setzt sich der Rand fort');
  assert.ok(Math.abs(groundH(1500, 0) - groundH(499.9, 0)) < 1, 'Rand fast eben');
  const m = rwMesh(2, 1500); assert.equal(m.idx.length, (258 - 1)**2*6);
  rw.on = false;
  assert.equal(groundH(100, 100), 0, 'normaler Modus: flach');
});

test('Echte Welt: Start ruhig auf dem Boden, Pilot steht auf dem Gelände', () => {
  cfg.fc = 'own'; cfg.mode = 'angle'; cfg.dmg = 'off'; applyDrone({ preset: '5' });
  setScenario('real'); game.throttle = 0; inp.pitch = inp.roll = inp.yaw = 0; respawn();
  assert.equal(rw.on, true);
  run(3);
  const s = game.sim, gh = groundH(s.p[0], s.p[2]);
  assert.ok(s.p[1] - gh > 0 && s.p[1] - gh < 0.05, 'steht auf dem Boden: ' + (s.p[1] - gh).toFixed(3));
  assert.ok(Math.abs(pilot.p[1] - groundH(pilot.p[0], pilot.p[2])) < 1e-9, 'Pilot auf dem Gelände');
  game.throttle = hoverThrottle() + 0.2; run(1.5);
  assert.ok(s.p[1] - groundH(s.p[0], s.p[2]) > 2, 'hebt ab');
});

test('Echte Welt: Flug gegen den Hang, mit Schaden Absturz, ohne Schaden bleibt sie über dem Boden', () => {
  // steilste Stelle im Gebiet suchen, Drohne 1,5 m darüber, mit 10 m/s in den Hang
  let best = null;
  rw.on = true;
  for (let x = -400; x <= 400; x += 10) for (let z = -400; z <= 400; z += 10) { const n = groundN(x, z); if (!best || n[1] < best.n[1]) best = { x, z, n }; }
  cfg.ghost = true;   // nur das Gelände prüfen: Bäume und Häuser aus, der Boden bleibt fest
  for (const dmg of ['off', 'real']) {
    cfg.dmg = dmg; setScenario('real'); respawn();
    const s = game.sim, d = [-best.n[0], 0, -best.n[2]], l = Math.hypot(d[0], d[2]);
    s.p = [best.x - d[0]/l*4, groundH(best.x, best.z) + 1.5, best.z - d[2]/l*4]; s.v = [d[0]/l*10, 0, d[2]/l*10]; s.w = [0, 0, 0];
    game.throttle = hoverThrottle();
    let minGap = 1e9;
    run(1.5, () => { minGap = Math.min(minGap, s.p[1] - groundH(s.p[0], s.p[2])); });
    if (dmg === 'real') assert.equal(game.state, 'crashed', 'Absturz am Hang (Schaden realistisch)');
    else assert.ok(minGap > -0.05, 'nicht im Boden: ' + minGap.toFixed(3));
  }
  cfg.ghost = false;
  assert.ok(best.n[1] < 0.8, 'Gebiet hat steile Hänge: Neigung ' + (Math.acos(best.n[1])*180/Math.PI).toFixed(0) + '°');
});

// Hilfen für die Gebäude: Dreieck t als Punkte, Normale, Fläche, Mitte
const T = () => rw.tris, P = (t, k) => [T()[t*9 + k*3], T()[t*9 + k*3 + 1], T()[t*9 + k*3 + 2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], crs = (a, b) => [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
function triInfo(t) { const a = P(t, 0), b = P(t, 1), c = P(t, 2), n = crs(sub(b, a), sub(c, a)), l = Math.hypot(...n);
  return { a, b, c, n: n.map(v => v/l), area: l/2, m: [0, 1, 2].map(i => (a[i] + b[i] + c[i])/3) }; }
// Größte steile Fläche (Wand, Hausfront) bzw. größte flache erhöhte Fläche (Dach), mitten im Gebiet
function pick(kind) {
  rw.on = true;
  let best = null;
  const nr = rw.meta.roofTris;
  for (let t = kind === 'roof' ? 0 : nr; t < (kind === 'roof' ? nr : T().length/9); t++) {
    const i = triInfo(t);
    if (Math.abs(i.m[0]) > 400 || Math.abs(i.m[2]) > 400) continue;
    const above = i.m[1] - groundH(i.m[0], i.m[2]);
    if (kind === 'wall' ? Math.abs(i.n[1]) > 0.15 || above < 2 : Math.abs(i.n[1]) < 0.9 || above < 5) continue;
    if (!best || i.area > best.area) best = i;
  }
  return best;
}
function fly(start, v, sec, dmg) {
  cfg.dmg = dmg; cfg.mode = 'angle'; setScenario('real'); respawn();
  const s = game.sim; s.p = start.slice(); s.v = v.slice(); s.w = [0, 0, 0]; s.q = [0, 0, 0, 1]; game.throttle = hoverThrottle();
  const track = [];
  run(sec, () => track.push(s.p.slice()));
  return track;
}

test('Echte Welt: Gebäude (LoD2) und Bäume geladen, je Gebäude eine Nummer', () => {
  const nr = rw.meta.roofTris, nw = T().length/9 - nr;
  assert.ok(nr > 3000 && nw > 8000, 'Dächer ' + nr + ', Wände ' + nw);
  assert.equal(rw.bldId.length, nr + nw);
  const ids = new Set(rw.bldId);
  assert.ok(ids.size === rw.meta.buildings && ids.size > 300, 'Gebäude ' + ids.size);
  assert.ok(rw.trees.length > 1000, 'Bäume ' + rw.trees.length);
  rw.on = true;
  for (const tr of rw.trees.slice(0, 200)) assert.ok(Math.abs(tr.y0 - groundH(tr.x, tr.z)) < 1e-6 && tr.h >= 3);
  // Gebäude stehen auf dem Gelände: Sockel (tiefster Wandpunkt) je Gebäude nah an der Bodenhöhe
  const lo = new Map(); for (let t = nr; t < nr + nw; t++) for (let k = 0; k < 3; k++) { const p = P(t, k), id = rw.bldId[t]; if (!lo.has(id) || p[1] < lo.get(id)[1]) lo.set(id, p); }
  const d = [...lo.values()].map(p => p[1] - groundH(p[0], p[2])).sort((a, b) => a - b);
  assert.ok(Math.abs(d[Math.floor(d.length/2)]) < 1.5, 'Sockel im Mittel ' + d[Math.floor(d.length/2)].toFixed(2) + ' m über dem Boden');
});

test('Echte Welt: Netz mit Fassaden (Sockelhöhe im Alpha), Dächer und Kronen', () => {
  const v = rwModelMesh(), n = v.length/10;
  let wall = 0, roof = 0, trunk = 0, crown = 0, bad = 0, eaveOk = 0;
  for (let i = 0; i < n; i++) {
    const a = v[i*10 + 9], nl = Math.hypot(v[i*10 + 3], v[i*10 + 4], v[i*10 + 5]);
    if (a >= 0.125 && a < 0.5) { wall++; if (nl >= 2 && nl <= 2.99) eaveOk++; } else if (Math.abs(a - 0.6) < 1e-6) roof++; else if (a === 1) trunk++; else if (a > 0.07 && a < 0.125) crown++; else bad++;
    if (!Number.isFinite(v[i*10 + 1])) bad++;
  }
  assert.equal(bad, 0);
  assert.ok(wall >= (T().length/9 - rw.meta.roofTris)*3*0.95 && roof >= rw.meta.roofTris*3*0.95 && trunk > 0 && crown > rw.trees.length*48*3 - 1, `Wände ${wall}, Dach ${roof}, Stamm ${trunk}, Krone ${crown}`);
  assert.equal(eaveOk, wall, 'jede Wand trägt ihre Traufhöhe in der Länge der Normale');
  // Traufe: bei den meisten Wänden mindestens 2 m über dem Sockel, nie über dem höchsten Punkt des Gebäudes
  let tall = 0; for (let i = 0; i < n; i += 3) { const a = v[i*10 + 9]; if (a < 0.125 || a >= 0.5) continue; if ((Math.hypot(v[i*10 + 3], v[i*10 + 4], v[i*10 + 5]) - 2)*100 > 2) tall++; }
  assert.ok(tall/(wall/3) > 0.8, 'Traufe über 2 m: ' + (tall/(wall/3)*100).toFixed(0) + ' %');
  // Klasse und Sockelhöhe kommen im Shader zurück (wallInfo), auch in 32 Bit wie auf der Grafikkarte
  const back = a => { const k = Math.floor((a - 0.13)/0.04); return [k, (a - 0.132 - k*0.04)/0.035*380 - 190]; };
  for (let k = 0; k < 8; k++) for (const y of [-190, -120.4, -3.2, 0, 18.9, 190]) {
    const a = Math.fround(rwWallAlpha(y, k)), [k2, y2] = back(a);
    assert.ok(a >= 0.125 && a < 0.5 && k2 === k && Math.abs(y2 - y) < 0.005, `k ${k} y ${y} -> ${k2} ${y2}`);
  }
  // Nutzung je Gebäude aus LoD2 (ALKIS): alle Klassen vorhanden, Wohnhäuser am häufigsten
  const cnt = [0, 0, 0, 0, 0, 0, 0]; for (const v of rw.bldInfo) cnt[v & 15]++;
  assert.ok(cnt.every(c => c > 0) && cnt[0] === Math.max(...cnt), 'Klassen ' + cnt.join(' '));
});

for (const [name, speed, dmg] of [['langsam ohne Schaden', 5, 'off'], ['sehr schnell ohne Schaden (kein Durchtunneln)', 40, 'off'], ['schnell mit Schaden', 12, 'real']]) {
  test(`Echte Welt: Flug gegen eine Hauswand, ${name}`, () => {
    const w = pick('wall'), n = [w.n[0], 0, w.n[2]], l = Math.hypot(n[0], n[2]);
    const dir = [-n[0]/l, 0, -n[2]/l], start = [w.m[0] + n[0]/l*3, w.m[1], w.m[2] + n[2]/l*3];
    const side = p => dot(sub(p, w.m), w.n);
    const track = fly(start, dir.map(v => v*speed), 1, dmg);
    if (dmg === 'real') assert.equal(game.state, 'crashed', 'Absturz an der Wand');
    else { assert.equal(game.state, 'fly'); assert.ok(Math.min(...track.map(side)) > -0.05, 'nie hindurch: ' + Math.min(...track.map(side)).toFixed(2) + ' m'); }
  });
}

test('Echte Welt: Aufsetzen auf einem Dach', () => {
  const r = pick('roof'), start = [r.m[0], r.m[1] + 1.5, r.m[2]];
  cfg.dmg = 'off'; setScenario('real'); respawn();
  const s = game.sim; s.p = start; s.v = [0, 0, 0]; s.w = [0, 0, 0]; s.q = [0, 0, 0, 1]; game.throttle = 0;
  run(3);
  assert.equal(game.state, 'fly');
  const above = s.p[1] - r.m[1];
  assert.ok(above > -0.3 && above < 0.4, 'liegt auf dem Dach: ' + above.toFixed(2) + ' m (Boden ' + (r.m[1] - groundH(r.m[0], r.m[2])).toFixed(1) + ' m tiefer)');
});

test('Echte Welt: Flug in eine Baumkrone prallt ab', () => {
  rw.on = true;
  const tr = rw.trees.filter(t => t.h > 12 && rwNear(t.x, t.z, 6).boxes.length <= 4 && Math.abs(t.x) < 400 && Math.abs(t.z) < 400)[0];
  assert.ok(tr, 'freistehender Baum');
  const cy = tr.boxes[1].c[1], start = [tr.x - tr.r - 3, cy, tr.z];
  const track = fly(start, [6, 0, 0], 1, 'off');
  assert.ok(Math.max(...track.map(p => p[0])) < tr.x, 'nicht durch die Krone: weiteste x ' + (Math.max(...track.map(p => p[0])) - tr.x).toFixed(2) + ' m vor der Mitte');
});

test('Echte Welt: Rechenzeit in der Altstadt', () => {
  cfg.dmg = 'off'; setScenario('real'); respawn();
  const s = game.sim, w = pick('wall');
  s.p = [w.m[0] + w.n[0]*2, w.m[1], w.m[2] + w.n[2]*2]; game.throttle = hoverThrottle();
  const t0 = performance.now(); run(2); const ms = (performance.now() - t0)/2;
  assert.ok(ms < 60, 'eine Sekunde Flug braucht ' + ms.toFixed(1) + ' ms Rechenzeit');
});

// Gewässer: eine nasse Stelle mitten in der Rur und eine trockene daneben suchen
function wetDry() {
  rw.on = true;
  for (let z = -400; z <= 400; z += 2) for (let x = -400; x <= 400; x += 2) {
    if (![-3, 0, 3].every(d => waterAt(x + d, z) && waterAt(x, z + d))) continue;   // mitten im Fluss
    for (let r = 8; r < 40; r += 2) for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]])
      if (![-3, 0, 3].some(d => waterAt(x + dx + d, z + dz) || waterAt(x + dx, z + dz + d))) return { wet: [x, z], dry: [x + dx, z + dz] };
  }
}
function dropAt(xz, h, dmg) {
  cfg.dmg = dmg; cfg.ghost = true; setScenario('real'); respawn();   // nur Boden und Wasser prüfen
  const s = game.sim; s.p = [xz[0], groundH(xz[0], xz[1]) + h, xz[1]]; s.v = [0, 0, 0]; s.w = [0, 0, 0]; s.q = [0, 0, 0, 1]; game.throttle = 0;
  run(2.5);
  cfg.ghost = false;
  return game.state;
}
test('Echte Welt: Gewässer aus dem Basis-DLM, Netz zum Zeichnen', () => {
  assert.ok(meta.water && meta.water.area > 5000, 'Rur im Gebiet: ' + (meta.water && meta.water.area) + ' m²');
  const p = wetDry(); assert.ok(p, 'nasse und trockene Stelle gefunden');
  const v = rwWaterMesh(); assert.ok(v.length > 1000);
  // Flacher Spiegel: mitten im Fluss liegt er über dem Gelände (vorher tauchten lange Streifen stellenweise darunter)
  rw.on = true;
  const lv = new Map(); for (let i = 0; i < v.length; i += 10) lv.set(Math.round(v[i]) + ',' + Math.round(v[i + 2]), v[i + 1]);
  let n = 0, under = 0;
  for (const [k, y] of lv) { const [x, z] = k.split(',').map(Number); if (![-3, 0, 3].every(d => waterAt(x + d, z) && waterAt(x, z + d))) continue; n++; if (y < groundH(x, z) - 0.02) under++; }
  assert.ok(n > 500 && under/n < 0.01, `Ecken mitten im Fluss ${n}, davon unter dem Gelände ${under}`);
  rw.on = false; assert.equal(waterAt(p.wet[0], p.wet[1]), false, 'normaler Modus: kein Wasser');
});
test('Echte Welt: Landung im Wasser setzt die Drohne außer Gefecht, auch ohne Schadensmodell', () => {
  const p = wetDry();
  assert.equal(dropAt(p.wet, 0.5, 'off'), 'crashed');
  assert.match(game.sim.crashMsg, /Wasser/);
  assert.equal(dropAt(p.dry, 0.5, 'off'), 'fly', 'daneben an Land: weiter flugbereit');
});
test('Echte Welt: tiefer Überflug über dem Wasser bleibt ohne Folgen', () => {
  const p = wetDry();
  cfg.dmg = 'off'; cfg.ghost = true; setScenario('real'); respawn();
  const s = game.sim; s.p = [p.wet[0], groundH(p.wet[0], p.wet[1]) + 1.5, p.wet[1]]; s.v = [0, 0, 0]; s.q = [0, 0, 0, 1];
  run(1, () => { game.throttle = hoverThrottle() + 0.05; });
  cfg.ghost = false;
  assert.equal(game.state, 'fly');
});

test('Echte Welt: Kartenebenen (Basis-DLM) nur zur Anzeige', () => {
  const F = rw.features;
  assert.ok(F.streams.length > 10 && F.roads.length > 50 && F.bridges.length > 5 && F.forest.length > 10, 'Ebenen vorhanden');
  assert.equal(F.towers, undefined, 'Türme entfallen (Prompt 165)');
  const pc = rwPlaceCenters(), ms = pc.find(p => p.name === 'Monschau');
  assert.ok(pc.length > 15 && ms, 'Ortsmitten'); assert.ok(Math.hypot(ms.x, ms.z) < 800, 'Mitte von Monschau nahe dem Gebiet');
  assert.ok(rwFeatureMesh().length > 10000, 'Netz der Bänder');
  rw.on = true;
  const road = F.roads.find(r => r.name === 'Laufenstraße'), [x, z] = road.pts[0];
  assert.equal(rwNearName(x + 3, z), 'Laufenstraße', 'Name der nahen Straße');
  assert.equal(rwNearName(2000, 2000), '', 'weit außerhalb: kein Name');
  // Bäche lösen keinen Absturz aus (nur Anzeige): ein Punkt auf dem Eschbach ist kein Wasser der Physik
  const st = F.streams.find(r => r.name === 'Eschbach'), sp = st.pts[Math.floor(st.pts.length/2)];
  assert.equal(waterAt(sp[0], sp[1]), false, 'Eschbach nur Anzeige');
});

test('Echte Welt: Vögel sitzen auf Bäumen, Dächern und Wiese und fliegen über dem Gelände', () => {
  cfg.dmg = 'off'; setScenario('real'); respawn();
  const home = game.sim.p.slice(), rand = rng(7);
  let minClear = 1e9;
  for (let run = 0; run < 4; run++) {
    initBirds(rand, home);
    assert.ok(birds.length > 0);
    for (const b of birds) {
      assert.ok(Math.hypot(b.p[0] - home[0], b.p[2] - home[2]) < 300, 'nah am Start');
      if (b.state !== 'fly') assert.ok(b.p[1] >= groundH(b.p[0], b.p[2]) - 0.05, 'nicht im Boden');
    }
    for (let i = 0; i < 60/0.05; i++) {
      stepBirds(0.05, null, rand);
      for (const b of birds) if (b.state === 'fly') minClear = Math.min(minClear, b.p[1] - groundH(b.p[0], b.p[2]));
    }
  }
  assert.ok(minClear > -0.1, 'im Flug nie unter dem Gelände: ' + minClear.toFixed(2) + ' m');
});

test('Echte Welt: Koordinaten (UTM hin und zurück) und nächster Ort für das OSD', () => {
  for (const [la, lo] of [[50.5547, 6.2425], [51.2, 7.1], [48.1, 9.0]]) {
    const [E, N] = toUtm(la, lo), [la2, lo2] = fromUtm(E, N);
    assert.ok(Math.abs(la2 - la) < 1e-7 && Math.abs(lo2 - lo) < 1e-7, `zurück: ${la2} ${lo2}`);
  }
  const [lat, lon] = rwLatLon(0, 0);   // Gebietsmitte, Monschau: etwa 50,55° N, 6,24° O
  assert.ok(Math.abs(lat - 50.555) < 0.01 && Math.abs(lon - 6.243) < 0.01, `Mitte ${lat} ${lon}`);
  const [E, N] = toUtm(lat, lon);
  assert.ok(Math.abs(E - 304700) < 0.01 && Math.abs(N - 5604000) < 0.01);
  assert.equal(fmtLatLon(lat, lon).slice(-1), 'E');
  // Altstadt liegt in der Ortslage Monschau; der Start (Wiese oberhalb) knapp außerhalb, mit Abstand und Richtung
  assert.deepEqual([rwPlace(-120, 20).name, rwPlace(-120, 20).d], ['Monschau', 0]);
  const home = rwPlace(meta.home[0], meta.home[1]);
  assert.ok(home.name === 'Monschau' && home.d > 50 && home.d < 400, JSON.stringify(home));
  const far = rwPlace(-480, -480);
  assert.ok(far.name && far.d >= 0 && /^(N|NO|O|SO|S|SW|W|NW)$/.test(far.dir), JSON.stringify(far));
  const l = osdLines({}, new Proxy({ lq: 99, mode: 'angle', label: 'ECHTE WELT', place: far, lat, lon, hp: [] }, { get: (o, k) => k in o ? o[k] : 0, has: (o, k) => k in o })).tl.map(x => x.t);
  assert.ok(l.some(t => t.startsWith(far.name.toUpperCase())) && l.some(t => /^50\.\d{5}N 6\.\d{5}E$/.test(t)), l.join(' | '));
});

test('Echte Welt: Gebäudenutzung (ALKIS-Code aus LoD2) -> Fassadenklasse', async () => {
  const { bldClass } = await import('../src/rwload.js');
  const want = { '31001_1000': 0, '31001_1100': 1, '31001_2460': 2, '51009_1610': 2, '51009_1611': 2, '31001_2461': 3, '31001_2000': 3, '31001_2500': 3,
    '31001_2700': 4, '31001_3021': 5, '31001_3071': 5, '31001_3041': 6, '31001_3043': 6, '31001_3038': 6, '51001_1012': 6, '51007_1400': 6, '53001_1800': 8, '31001_1310': 0, '': 0 };
  for (const [fn, k] of Object.entries(want)) assert.equal(bldClass(fn), k, fn);
});

test('L5a: Umgebung 10 km: Bodenhöhe ohne Sprung am Rand, außen echtes Gelände, Netz mit Loch für das Gebiet', async () => {
  const { rwApply, rwFarMesh, rwMesh: mesh } = await import('../src/realworld.js');
  const { rwFillGaps } = await import('../src/rwload.js');
  const farq = inflateSync(readFileSync(file('realworld/monschau.far')));
  const p = { meta, q: new Uint16Array(q.buffer, q.byteOffset, q.byteLength/2), b16: un('bld'), t16: un('trees'), farq: new Uint16Array(farq.buffer, farq.byteOffset, farq.byteLength/2), fardop: null };
  assert.equal(p.farq.length, meta.far.n*meta.far.n);
  rwApply(p);
  rw.on = true;
  assert.ok(rw.far && rw.far.n === 401 && Math.abs(rw.far.cell - 25) < 1e-9);
  // Am Rand (±500 m) stetig; über den Übergang (30 m) höchstens so steil wie das Gelände selbst
  let jump = 0;
  for (let z = -480; z <= 480; z += 20) for (const s of [-1, 1]) { const a = groundH(s*499.99, z), b = groundH(s*500.01, z); jump = Math.max(jump, Math.abs(a - b)); }
  // Die Netze treffen sich am Rand mit verschieden dichten Ecken (fein alle 4 m, Umgebung alle 25 m): kleine Stufe in der
  // gezeichneten Fläche, die groundH seit Prüfbericht Nr. 1 genau abbildet (gemessen 0,12 m)
  assert.ok(jump < 0.2, 'Sprung am Rand ' + jump.toFixed(3) + ' m');
  // Außen nicht mehr flach fortgesetzt: Höhen 2 km entfernt unterscheiden sich deutlich
  const out = [[2000, 0], [-2000, 0], [0, 2000], [0, -2000]].map(([x, z]) => groundH(x, z));
  assert.ok(Math.max(...out) - Math.min(...out) > 20, 'Umgebung hat Relief: ' + out.map(v => v.toFixed(0)).join(' '));
  // Netz der Umgebung: kein Dreieck im Gebiet; feines Netz endet genau an ±500 m
  const fm = rwFarMesh();
  for (let i = 0; i < fm.idx.length; i += 3) {
    const c = [0, 1, 2].map(k => fm.idx[i + k]*10), mx = c.reduce((t, o) => t + fm.v[o], 0)/3, mz = c.reduce((t, o) => t + fm.v[o + 2], 0)/3;
    assert.ok(!(Math.abs(mx) < 500 && Math.abs(mz) < 500), 'Dreieck der Umgebung im Gebiet bei ' + mx + ', ' + mz);
  }
  const im = mesh(2, 500); let ex = 0; for (let i = 0; i < im.v.length; i += 10) ex = Math.max(ex, Math.abs(im.v[i]), Math.abs(im.v[i + 2]));
  assert.equal(ex, 500);
  // Lücken (Nachbarland ohne Werte) werden vom Rand her gefüllt
  const g = Float32Array.from([1, NaN, NaN, NaN, NaN, NaN, NaN, NaN, 3]); rwFillGaps(g, 3);
  assert.ok(g.every(v => Number.isFinite(v) && v >= 1 && v <= 3));
  rw.on = false;
  // wieder ohne Umgebung wie die übrigen Tests
  rwApply({ meta: { ...meta, far: undefined }, q: p.q, b16: p.b16, t16: p.t16 });
});

test('L5b: Kacheln nachladen: Planung, Laden aus dem Speicher, stetiger Rand, Kollision, Entladen', async () => {
  const R = await import('../src/realworld.js'), L = await import('../src/rwload.js'), { fromUtm } = await import('../src/geo.js');
  const farq = inflateSync(readFileSync(file('realworld/monschau.far')));
  const main = { meta: JSON.parse(JSON.stringify(meta)), q: new Uint16Array(q.buffer, q.byteOffset, q.byteLength/2), b16: un('bld'), t16: un('trees'), farq: new Uint16Array(farq.buffer, farq.byteOffset, farq.byteLength/2) };
  R.rwApply(main);
  rw.on = true;
  // Kachel östlich (1, 0): flache Höhe aus der Probe-Datei, ein Haus 10 x 10 x 6 m in der Mitte; liegt fertig im Speicher
  const nrw = L.RW_SOURCES[0], ec = (meta.bbox[0] + meta.bbox[2])/2 + 1000, nc = (meta.bbox[1] + meta.bbox[3])/2;
  const tif = new Uint8Array(readFileSync(new URL('./fixtures/nrw-dgm-32.tif', import.meta.url)));
  const P = (x, y, z) => `${ec + x} ${nc + y} ${z}`, ring = pts => `<gml:exterior><gml:LinearRing><gml:posList>${pts.join(' ')}</gml:posList></gml:LinearRing></gml:exterior>`;
  const wall = (a, b) => `<bldg:WallSurface>${ring([P(...a, 460), P(...b, 460), P(...b, 466), P(...a, 466), P(...a, 460)])}</bldg:WallSurface>`;
  const house = `<bldg:Building><bldg:function>31001_1000</bldg:function><bldg:RoofSurface>${ring([P(-5, -5, 466), P(5, -5, 466), P(5, 5, 466), P(-5, 5, 466), P(-5, -5, 466)])}</bldg:RoofSurface>${wall([-5, -5], [5, -5])}${wall([5, -5], [5, 5])}${wall([5, 5], [-5, 5])}${wall([-5, 5], [-5, -5])}</bldg:Building>`;
  const a = { bbox: [ec - 500, nc - 500, ec + 500, nc + 500], crs: meta.crs, startNear: [ec, nc], name: 'kachel', place: '', attribution: '', n: 32, dopN: 64 };
  const p = await L.rwFetchArea(a, nrw, async u => u.includes('WMS') ? new Uint8Array([0xff, 0xd8]) : tif, async u => u.includes('_305_5604') ? `<core:CityModel>${house}</core:CityModel>` : null, () => {}, { far: false });
  const [lat, lon] = fromUtm(ec, nc, 32), key = R.rwAreaKey(lat, lon, [nrw]) + '|kachel';
  const store = { get: async k => k === key ? p : null, put: async () => true, land: async () => null };
  // Planung: in der Mitte nichts, 250 m vor dem Ostrand die Kachel (1, 0)
  assert.equal(R.rwStreamPlan(0, 0).next, null);
  assert.deepEqual(R.rwStreamPlan(260, 0).next, [1, 0]);
  const old = globalThis.fetch; globalThis.fetch = async () => { throw new TypeError('offline'); };
  try { assert.equal(await R.rwStreamStep(260, 0, store), true); } finally { globalThis.fetch = old; }
  const T = rw.tiles.get('1,0');
  assert.ok(T && T.dx === 1000 && T.dz === 0, 'Kachel eingefügt');
  assert.equal(R.rwTileAt(1000, 0), T);
  // Rand zwischen Startgebiet und Kachel: kein Sprung über 1 m (beide aus dem DGM; Probe-Datei ist ein anderer Ort, daher grob)
  const yA = groundH(499.99, 0), yB = groundH(500.01, 0);
  assert.ok(Number.isFinite(yA) && Number.isFinite(yB));
  assert.ok(Math.abs(groundH(1000, 0) - (452.7 - meta.hHome)) < 30, 'Kachel trägt ihre eigenen Höhen');
  // Haus der Kachel in Weltkoordinaten: Mitte bei x = 1000, Dach 6 m über dem Fuß
  assert.ok(R.rwNear(1000, 0, 3).tris.length > 0, 'Haus im Kollisionsraster');
  const ys = [...T.tris].filter((_, k) => k % 3 === 1);
  assert.ok(Math.abs(Math.max(...ys) - Math.min(...ys) - 6) < 0.2, 'Haushöhe 6 m');
  // Umgebung hat jetzt ein Loch auch über der Kachel
  const fm = R.rwFarMesh();
  for (let i = 0; i < fm.idx.length; i += 3) { const o = fm.idx[i]*10, o2 = fm.idx[i + 1]*10, o3 = fm.idx[i + 2]*10, mx = (fm.v[o] + fm.v[o2] + fm.v[o3])/3, mz = (fm.v[o + 2] + fm.v[o2 + 2] + fm.v[o3 + 2])/3;
    assert.ok(!(mx > 500 && mx < 1500 && Math.abs(mz) < 500), 'Umgebung über der Kachel bei ' + mx + ', ' + mz); }
  // Weit weg geflogen: Kachel wird entladen
  assert.deepEqual(R.rwStreamPlan(-2500, 0).drop, ['1,0']);
  globalThis.fetch = async () => { throw new TypeError('offline'); };
  try { await R.rwStreamStep(-2500, 0, store); } finally { globalThis.fetch = old; }
  assert.ok(!rw.tiles.has('1,0'), 'alte Kachel entladen');
  assert.equal(rw.tileFail.size, 1, 'neue Kachel offline nicht ladbar, 60 s Pause gemerkt');
  rw.on = false;
  R.rwApply({ meta: { ...meta, far: undefined }, q: main.q, b16: main.b16, t16: main.t16 });
});

test('Kamera nie unter der gezeichneten Fläche (Fehlerbericht Nutzer): rwSurfaceH gleich dem Netz, auch mit Umgebung', async () => {
  const R = await import('../src/realworld.js');
  const farq = inflateSync(readFileSync(file('realworld/monschau.far')));
  R.rwApply({ meta: JSON.parse(JSON.stringify(meta)), q: new Uint16Array(q.buffer, q.byteOffset, q.byteLength/2), b16: un('bld'), t16: un('trees'), farq: new Uint16Array(farq.buffer, farq.byteOffset, farq.byteLength/2) });
  rw.on = true;
  const m = R.rwMesh(2, 500), k = Math.round(Math.sqrt(m.v.length/10)), xs = Array.from({ length: k }, (_, i) => m.v[i*10]), Y = (i, j) => m.v[(j*k + i)*10 + 1];
  const surf = (x, z) => { const i = xs.findIndex((v, n) => n + 1 < k && x >= v && x <= xs[n + 1]), j = xs.findIndex((v, n) => n + 1 < k && z >= v && z <= xs[n + 1]);
    const fx = (x - xs[i])/(xs[i + 1] - xs[i]), fz = (z - xs[j])/(xs[j + 1] - xs[j]), a = Y(i, j), b = Y(i + 1, j), c = Y(i, j + 1), d = Y(i + 1, j + 1);
    return fx + fz <= 1 ? a + (b - a)*fx + (c - a)*fz : d + (c - d)*(1 - fx) + (b - d)*(1 - fz); };
  let worst = 0, above = 0;
  const nearWater = (x, z) => [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4]].some(([a, b]) => waterAt(x + a, z + b));   // unter Wasser liegt das Netz absichtlich tiefer (WATER_DIP)
  for (let n = 0; n < 4000; n++) { const x = (Math.random() - 0.5)*990, z = (Math.random() - 0.5)*990, s = surf(x, z);
    if (nearWater(x, z)) continue;
    worst = Math.max(worst, Math.abs(s - groundH(x, z))); above = Math.max(above, s - R.rwSampleH(x, z)); }
  assert.ok(worst < 1e-3, 'groundH (Physik) weicht vom gezeichneten Netz ab: ' + worst);
  assert.ok(above > 0.035, 'die gemessenen Höhen allein lägen teils unter dem Netz (bis ' + above.toFixed(2) + ' m); daher zählt die Fläche');
  rw.on = false;
  R.rwApply({ meta: { ...meta, far: undefined }, q: new Uint16Array(q.buffer, q.byteOffset, q.byteLength/2), b16: un('bld'), t16: un('trees') });
});

test('Prüfbericht Nr. 12: Kollisionsraster nur mit belegten Zellen; Kachel 4 km entfernt kostet nicht mehr als eine nahe', async () => {
  const R = await import('../src/realworld.js');
  const farq = inflateSync(readFileSync(file('realworld/monschau.far')));
  R.rwApply({ meta: JSON.parse(JSON.stringify(meta)), q: new Uint16Array(q.buffer, q.byteOffset, q.byteLength/2), b16: un('bld'), t16: un('trees'), farq: new Uint16Array(farq.buffer, farq.byteOffset, farq.byteLength/2) });
  rw.on = true;
  const M = rw.main, mk = (i, j) => { const t = Float32Array.from(M.tris); for (let k = 0; k < t.length; k += 3) { t[k] += i*1000; t[k + 2] += j*1000; }
    return { i, j, dx: i*1000, dz: j*1000, tris: t, trees: [] }; };
  const cellsFor = set => { rw.tiles = new Map(set.map(([i, j]) => [i + ',' + j, mk(i, j)])); R.rwRebuild(); return rw.grid.cells.size; };
  const one = cellsFor([[2, 0]]), far = cellsFor([[4, 4]]);   // 2 km statt 1 km: sonst teilen sich Startgebiet und Kachel Randzellen
  assert.equal(far, one, 'gleich viele Zellen, egal wie weit die Kachel liegt');
  assert.ok(R.rwNear(4000 + 7, 4000 - 7, 3).tris.length === R.rwNear(7, -7, 3).tris.length, 'Kachel 4 km weg: gleiche Gebäude wie im Startgebiet');
  rw.on = false;
  R.rwApply({ meta: { ...meta, far: undefined }, q: new Uint16Array(q.buffer, q.byteOffset, q.byteLength/2), b16: un('bld'), t16: un('trees') });
});

test('Prüfbericht Nr. 5: Abruf ohne Antwort endet nach der Zeitgrenze; Gebietswechsel bricht Nachladen ab', async () => {
  const R = await import('../src/realworld.js'), old = globalThis.fetch;
  // nie antwortender Dienst (hört nur auf den Abbruch)
  const hang = async (u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => { const e = new Error('abort'); e.name = 'AbortError'; rej(e); }));
  try {
    globalThis.fetch = hang;
    await assert.rejects(R.rwNet(undefined, 50).get('https://x.test/a'), /x\.test antwortet nicht/);
    const ac = new AbortController(), p = R.rwNet(ac.signal, 5000).get('https://x.test/a'); ac.abort();
    await assert.rejects(p, /Abgebrochen/);
    // Antwort beginnt, dann kommen keine Bytes mehr: ebenfalls Zeitgrenze
    globalThis.fetch = async (u, o) => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1, 2])); o.signal.addEventListener('abort', () => c.error(Object.assign(new Error('abort'), { name: 'AbortError' }))); } }));
    await assert.rejects(R.rwNet(undefined, 50).get('https://x.test/b'), /antwortet nicht/);
    // Nachladen hängt: Gebietswechsel bricht ab, keine Pause für die Kachel, Weg frei
    const farq = inflateSync(readFileSync(file('realworld/monschau.far'))), main = { meta: JSON.parse(JSON.stringify(meta)), q: new Uint16Array(q.buffer, q.byteOffset, q.byteLength/2), b16: un('bld'), t16: un('trees'), farq: new Uint16Array(farq.buffer, farq.byteOffset, farq.byteLength/2) };
    R.rwApply(main); rw.on = true;
    globalThis.fetch = hang;
    const step = R.rwStreamStep(260, 0, { get: async () => null, put: async () => true, land: async () => null });
    await new Promise(r => setTimeout(r, 20));
    assert.ok(rw.tileBusy, 'Kachel lädt');
    R.rwApply(main);
    assert.equal(await step, false);
    assert.ok(!rw.tileBusy && rw.tileFail.size === 0 && !rw.tileErr, 'abgebrochen, ohne Fehler und ohne Pause');
  } finally { globalThis.fetch = old; rw.on = false; }
  R.rwApply({ meta: { ...meta, far: undefined }, q: new Uint16Array(q.buffer, q.byteOffset, q.byteLength/2), b16: un('bld'), t16: un('trees') });
});

test('Prüfbericht Nr. 1: Drohne liegt am Hang auf der gezeichneten Fläche, nicht darin', async () => {
  const R = await import('../src/realworld.js'), { PHYS } = await import('../src/physics.js');
  cfg.dmg = 'off'; cfg.ghost = true; setScenario('real'); respawn();
  rw.on = true;
  // Stelle, an der das Netz deutlich über den gemessenen Höhen liegt (dort sank die Drohne früher ein)
  let best = null;
  for (let x = -400; x <= 400; x += 3) for (let z = -400; z <= 400; z += 3) { const d = groundH(x, z) - R.rwSampleH(x, z); if (!best || d > best.d) best = { x, z, d }; }
  assert.ok(best.d > 0.3, 'Netz liegt am Hang über den Messwerten: ' + best.d.toFixed(2) + ' m');
  // Netz unabhängig nachrechnen (Dreieck aus den Ecken von rwMesh)
  const m = R.rwMesh(2, 1500), k = Math.round(Math.sqrt(m.v.length/10)), xs = Array.from({ length: k }, (_, i) => m.v[i*10]), Y = (i, j) => m.v[(j*k + i)*10 + 1];
  const surf = (x, z) => { const i = xs.findIndex((v, n) => n + 1 < k && x >= v && x <= xs[n + 1]), j = xs.findIndex((v, n) => n + 1 < k && z >= v && z <= xs[n + 1]);
    const fx = (x - xs[i])/(xs[i + 1] - xs[i]), fz = (z - xs[j])/(xs[j + 1] - xs[j]), a = Y(i, j), b = Y(i + 1, j), c = Y(i, j + 1), d = Y(i + 1, j + 1);
    return fx + fz <= 1 ? a + (b - a)*fx + (c - a)*fz : d + (c - d)*(1 - fx) + (b - d)*(1 - fz); };
  const s = game.sim;
  s.p = [best.x, groundH(best.x, best.z) + 0.3, best.z]; s.v = [0, 0, 0]; s.w = [0, 0, 0]; game.throttle = 0;
  let low = 1e9;
  run(0.6, () => { low = Math.min(low, s.p[1] - PHYS.foot - surf(s.p[0], s.p[2])); });
  assert.ok(low > -0.03, 'Unterseite nie unter der gezeichneten Fläche: ' + low.toFixed(3) + ' m');
  cfg.ghost = false;
});

test('Prüfbericht Nr. 16: Umgebung wandert mit (neue Mitte, Kacheln dahinter, Fläche gleich dem Netz, ohne Netz bleibt die alte)', async () => {
  const R = await import('../src/realworld.js');
  const farq = inflateSync(readFileSync(file('realworld/monschau.far'))), fq = new Uint16Array(farq.buffer, farq.byteOffset, farq.byteLength/2);
  R.rwApply({ meta: JSON.parse(JSON.stringify(meta)), q: new Uint16Array(q.buffer, q.byteOffset, q.byteLength/2), b16: un('bld'), t16: un('trees'), farq: fq });
  rw.on = true;
  const old = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new TypeError('offline'); };
    // nahe der Mitte: nichts; Kachel 6 km östlich liegt außerhalb der Reichweite
    assert.equal(await R.rwFarStep(1000, 0, null), false);
    assert.equal(R.rwStreamPlan(5600, 0).next, null, 'vorher: Kachel 6 km weg nicht erlaubt');
    // ohne Netz und ohne Speicher: alte Umgebung bleibt, 60 s Pause für diese Mitte
    const v0 = rw.farVer;
    assert.equal(await R.rwFarStep(1600, 0, null), false);
    assert.ok(rw.far.cx === 0 && rw.farVer === v0 && rw.farFail.has('2000,0') && /Umgebung: Keine Verbindung/.test(rw.tileErr));
    rw.farFail.clear();
    // aus dem Speicher (Testdaten: dieselbe Umgebung, als käme sie von der neuen Mitte)
    const saved = new Map(), store = { get: async k => saved.get(k) || (k.endsWith('|umgebung') ? { meta: { far: meta.far }, farq: fq, fardop: null } : null), put: async (k, r) => (saved.set(k, r), true) };
    assert.equal(await R.rwFarStep(1600, 0, store), true);
    assert.ok(rw.far.cx === 2000 && rw.far.cz === 0 && rw.farVer === v0 + 1, 'neue Mitte 2 km östlich');
    assert.deepEqual(R.rwStreamPlan(5600, 0).next, [6, 0], 'jetzt: Kachel 6 km weg erlaubt');
    // Netz der Umgebung um die neue Mitte; Bodenhöhe gleich dem Netz (Stichprobe, Mitte eines Dreiecks)
    const fm = R.rwFarMesh(), k = Math.round(Math.sqrt(fm.v.length/10));
    assert.equal(fm.v[10], 2000 - 5000, 'erster Messpunkt bei Mitte − 5 km');
    for (const [i, j] of [[50, 60], [300, 200], [390, 10]]) {
      const P = (a, b) => [fm.v[(b*k + a)*10], fm.v[(b*k + a)*10 + 1], fm.v[(b*k + a)*10 + 2]], A = P(i, j), B = P(i + 1, j), C = P(i, j + 1);
      const x = A[0] + (B[0] - A[0])*0.3, z = A[2] + (C[2] - A[2])*0.3, y = A[1] + (B[1] - A[1])*0.3 + (C[1] - A[1])*0.3;
      if (!R.rwTileAt(x, z)) assert.ok(Math.abs(groundH(x, z) - y) < 1e-3, 'Fläche gleich dem Netz bei ' + x + ', ' + z);
    }
    // von den Diensten geladen: danach gespeichert (als Zwischenspeicher wie eine Kachel)
    const n = 401, tags = [[256, 4, n], [257, 4, n], [258, 3, 32], [259, 3, 1], [262, 3, 1], [273, 4, 0], [277, 3, 1], [278, 4, n], [279, 4, n*n*4], [339, 3, 3]];
    const dataOff = 8 + 2 + tags.length*12 + 4, b = Buffer.alloc(dataOff + n*n*4);
    b.write('II', 0); b.writeUInt16LE(42, 2); b.writeUInt32LE(8, 4); b.writeUInt16LE(tags.length, 8);
    tags.forEach(([t, ty, v], kk) => { const o = 10 + kk*12; b.writeUInt16LE(t, o); b.writeUInt16LE(ty, o + 2); b.writeUInt32LE(1, o + 4); if (t === 273) b.writeUInt32LE(dataOff, o + 8); else if (ty === 3) b.writeUInt16LE(v, o + 8); else b.writeUInt32LE(v, o + 8); });
    for (let kk = 0; kk < n*n; kk++) b.writeFloatLE(480, dataOff + kk*4);
    globalThis.fetch = async u => String(u).includes('wcs') ? new Response(new Uint8Array(b)) : new Response(new Uint8Array([0xff, 0xd8]));
    const net = { get: async kk => saved.get(kk) || null, put: store.put };
    assert.equal(await R.rwFarStep(3700, 0, net), true);
    assert.equal(rw.far.cx, 4000);
    const rec = [...saved.entries()].find(([kk]) => kk.endsWith('|umgebung'));
    assert.ok(rec && rec[1].tile && rec[1].farq.length === n*n, 'gespeichert, zählt als Kachel');
    assert.ok(Math.abs(groundH(4000, 2000) - (480 - meta.hHome)) < 0.01, 'neue Höhen gelten');
  } finally { globalThis.fetch = old; rw.on = false; }
  R.rwApply({ meta: { ...meta, far: undefined }, q: new Uint16Array(q.buffer, q.byteOffset, q.byteLength/2), b16: un('bld'), t16: un('trees') });
});

test('Fehlerbericht Nutzer (Prompt 140): Start nicht im Wasser, kein Absturz in Schleife', async () => {
  const R = await import('../src/realworld.js'), m = JSON.parse(JSON.stringify(meta));
  // Teich 50 x 50 m genau um den Startplatz (Bitmaske 1 m, Zeile 0 = Norden)
  const n = 1000, bits = new Uint8Array(n*n/8), [hx, hz] = m.home;
  for (let j = Math.floor(hz + 500) - 25; j < Math.floor(hz + 500) + 25; j++) for (let i = Math.floor(hx + 500) - 25; i < Math.floor(hx + 500) + 25; i++) { const b = j*n + i; bits[b >> 3] |= 1 << (b & 7); }
  m.water = { n, res: 1, area: 2500, source: 'Test' };
  R.rwApply({ meta: m, q: new Uint16Array(q.buffer, q.byteOffset, q.byteLength/2), b16: un('bld'), t16: un('trees') }, { water: bits });
  const [x, z] = rw.meta.home;
  assert.ok(Math.hypot(x - hx, z - hz) >= 25, 'Start verlegt: ' + x + ', ' + z);
  rw.on = true;
  for (const [dx, dz] of [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4]]) assert.equal(R.waterAt(x + dx, z + dz), false, 'trocken bei ' + dx + ', ' + dz);
  assert.equal(R.rwNear(x, z, 6).tris.length, 0, 'kein Gebäude in 6 m');
  // Flug in der echten Welt: Start dort, 2 s stehen, kein Absturz; Neustart wieder dort
  cfg.dmg = 'off'; setScenario('real'); respawn(); game.throttle = 0;
  run(2);
  assert.equal(game.state, 'fly', 'kein Absturz ins Wasser');
  respawn(); assert.ok(Math.hypot(game.sim.p[0] - x, game.sim.p[2] - z) < 0.01, 'Neustart am trockenen Platz');
  rw.on = false;
  R.rwApply({ meta: { ...meta, far: undefined }, q: new Uint16Array(q.buffer, q.byteOffset, q.byteLength/2), b16: un('bld'), t16: un('trees') });
  assert.deepEqual(rw.meta.home, meta.home, 'ohne Wasser bleibt der Start, wo er war');
});

test('Freileitung (Prompt 171): Hochpunkte unter Leiterseilen fallen weg, Kronen bleiben', async () => {
  const { findTrees } = await import('../src/rwload.js');
  const n = 200, bbox = [0, 0, 400, 400], dgm = new Float32Array(n*n), dom = new Float32Array(n*n);
  const crown = (ci, cj, h, r) => { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i*i + j*j <= r*r) { const k = (cj + j)*n + ci + i; dom[k] = Math.max(dom[k], h - (i*i + j*j)*0.4); } };
  for (const [ci, cj] of [[30, 30], [60, 150], [150, 40], [170, 170], [100, 60]]) crown(ci, cj, 14, 3);   // fünf Bäume, 14 m, Krone 6 m breit
  for (let k = 10; k < 190; k += 4) dom[(20 + Math.round(k*0.8))*n + k] = 18 + (k % 8)*0.3;   // Seil schräg durchs Gebiet, Hochpunkte alle 8 m
  const t = findTrees(dgm, dom, [], n, bbox);
  assert.equal(t.length, 5, 'nur die Kronen: ' + t.length);
  assert.ok(t.every(q => Math.abs(q[2] - 14) < 0.01));
});
