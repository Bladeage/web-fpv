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
import { readTiff, toUtm } from '../src/geo.js';
import { rw, rwInit, rwModels, rwModelMesh, rwWallAlpha, groundH, groundN, rwMesh, rwNear, waterAt, rwWaterMesh, rwFeatureMesh, rwNearName } from '../src/realworld.js';
import { pilot } from '../src/pilot.js';
import { qRot } from '../src/math.js';
import { birds, initBirds, stepBirds } from '../src/birds.js';
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
  assert.equal(groundH(2000, 0), groundH(499.9, 0), 'außen setzt sich der Rand fort');
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
  let wall = 0, roof = 0, crown = 0, bad = 0;
  for (let i = 0; i < n; i++) { const a = v[i*10 + 9]; if (a >= 0.125 && a < 0.5) wall++; else if (a === 1) roof++; else if (a > 0.07 && a < 0.125) crown++; else bad++; if (!Number.isFinite(v[i*10 + 1])) bad++; }
  assert.equal(bad, 0);
  assert.ok(wall >= (T().length/9 - rw.meta.roofTris)*3 && roof > 0 && crown > rw.trees.length*48*3 - 1, `Wände ${wall}, Dach/Stamm ${roof}, Krone ${crown}`);
  // Sockelhöhe kommt im Shader als (a - 0,3)*2000 zurück
  for (const y of [-120.4, -3.2, 0, 18.9]) assert.ok(Math.abs((rwWallAlpha(y) - 0.3)*2000 - y) < 1e-6);
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
  assert.ok(rwWaterMesh().length > 1000);
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
  assert.deepEqual(F.towers.map(t => t.name), ['Eselsturm']);
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
