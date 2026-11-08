// Etappe T3: Luftziele, Landeplatz und Lieferplätze in der echten Welt (Monschau) über den Platzierungsdienst; Spielkarte bleibt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { cfg, game } from '../src/state.js';
import { buildWorld, rng } from '../src/world.js';
import { respawn, step, STEP } from '../src/physics.js';
import { setScenario, setLayoutSeed, PAD, PICKUP, DROPS, huntLayoutReal, airLayoutReal, scenTarget, buildScenario } from '../src/scenario.js';
import { rw, rwApply, groundH, placeReal, waterAt } from '../src/realworld.js';
import { airRegions, airCircle, airWaypoints, flatSpot, pathClearW } from '../src/place.js';
import { targets, stepTargets } from '../src/targets.js';
import { aircraft, stepAircraft } from '../src/aircraft.js';

buildWorld();
const f = n => readFileSync(new URL('../realworld/monschau.' + n, import.meta.url)), meta = JSON.parse(f('json')), q = inflateSync(f('dgm'));
const un = n => { const b = inflateSync(f(n)); return new Int16Array(b.buffer, b.byteOffset, b.byteLength/2); };
rwApply({ meta, q: new Uint16Array(q.buffer, q.byteOffset, q.byteLength/2), b16: un('bld'), t16: un('trees') }, { water: new Uint8Array(inflateSync(f('water'))) });
const above = p => p[1] - groundH(p[0], p[2]);

test('T3 Dienst: Luftbereiche, Kreisbahn, Wegpunkte, flache Plätze in Monschau', () => {
  rw.on = true;
  try {
    const W = placeReal(), c = meta.home, t0 = performance.now();
    const reg = airRegions(W, c, 6, rng(3));
    assert.equal(reg.length, 6, 'sechs Bereiche');
    for (const p of reg) { assert.ok(W.free(p, 3) && above(p) >= 8.9 && above(p) <= 16.1, 'frei, 9 bis 16 m über Boden'); }
    for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) assert.ok(Math.hypot(reg[i][0] - reg[j][0], reg[i][2] - reg[j][2]) > 44, 'überschneidungsfrei');
    const K = airCircle(W, c, 120), n = 76;
    let top = -1e9; for (let i = 0; i < n; i++) { const a = i/n*2*Math.PI, x = K.c[0] + Math.cos(a)*120, z = K.c[1] + Math.sin(a)*120; top = Math.max(top, groundH(x, z)); assert.ok(W.free([x, K.alt, z], 4), 'Kreis frei'); }
    assert.ok(K.alt >= top + 24, 'Kreis über dem höchsten Boden: ' + (K.alt - top).toFixed(1) + ' m');
    const wps = airWaypoints(W, c, 4, rng(5));
    assert.ok(wps && wps.length === 4, 'vier Wegpunkte');
    for (let i = 0; i < 4; i++) { assert.ok(above(wps[i]) >= 17.9, 'hoch'); assert.ok(pathClearW(W, wps[i], wps[(i + 1) % 4], 3, 2), 'Weg frei'); }
    const s = flatSpot(W, c, 60, 150, 3, 6, rng(9));
    assert.ok(s, 'flacher Platz gefunden');
    const hs = []; for (const dx of [-3, 0, 3]) for (const dz of [-3, 0, 3]) hs.push(groundH(s[0] + dx, s[2] + dz));
    assert.ok(Math.max(...hs) - Math.min(...hs) <= 0.25 && Math.abs(Math.max(...hs) - s[1]) < 1e-6, 'eben, Höhe = höchster Boden');
    assert.ok(!waterAt(s[0], s[2]) && W.free([s[0], s[1] + 6.3, s[2]], 6), 'trocken und frei');
    const ms = performance.now() - t0; console.log('    Dienst T3 Monschau: ' + ms.toFixed(0) + ' ms');
    assert.ok(ms < 3000);
  } finally { rw.on = false; }
});

test('T3 Szenarien in der echten Welt: Ziel-Drohnen, Luftziele, Landung, Lieferung; Spielkarte zurück', () => {
  rw.ready = true; setLayoutSeed(11); cfg.diff = 'mid';
  try {
    setScenario('hunt', true); respawn();
    assert.ok(targets.length >= 7, 'Ziel-Drohnen: ' + targets.length);
    for (const t of targets) assert.ok(above(t.p) > 5, 'über dem Boden');
    for (let k = 0; k < 2400; k++) stepTargets(STEP, [0, -100, 0], [0, -100, 0], game.sim.p);   // 10 s fliegen
    for (const t of targets) { const g = groundH(t.p[0], t.p[2]); assert.ok(t.p[1] >= g + 5.9 && t.p[1] <= g + 18.1, 'bleibt 6 bis 18 m über dem Boden'); }
    // Treffer: Ziel fällt bis auf den Boden der echten Welt
    const t0 = targets.find(t => t.beh === 'static');
    stepTargets(STEP, vSubY(t0.p, 0.005), vSubY(t0.p, -0.005), game.sim.p);   // kurzer Weg durch das Ziel (kleiner Stoß)
    for (let k = 0; k < 2400 && t0.state !== 'down'; k++) stepTargets(STEP, [0, -100, 0], [0, -100, 0], game.sim.p);
    assert.equal(t0.state, 'down'); assert.ok(Math.abs(t0.p[1] - groundH(t0.p[0], t0.p[2]) - 0.1) < 0.01, 'liegt auf dem Boden');

    setScenario('hunt3', true); respawn();
    assert.ok(aircraft.length >= 4, 'Luftziele: ' + aircraft.length);
    for (let k = 0; k < 2400; k++) stepAircraft(STEP, [0, -100, 0], [0, -100, 0]);
    for (const a of aircraft) assert.ok(above(a.p) > 12, a.kind + ' hoch über dem Boden: ' + above(a.p).toFixed(1));

    setScenario('landing', true); respawn();
    const d = Math.hypot(PAD.c[0] - game.home[0], PAD.c[2] - game.home[1]);
    assert.ok(d >= 14 && d <= 401 && Math.abs(PAD.c[1] - groundH(PAD.c[0], PAD.c[2])) < 0.3, 'Plattform auf dem Boden, ' + d.toFixed(0) + ' m vom Start');
    assert.ok(Math.abs(scenTarget()[1] - PAD.c[1] - 0.5) < 1e-9);
    const M = buildScenario(); assert.ok(M.data.length > 0 && Math.abs(M.data[1] - PAD.c[1]) < 0.1, 'Platte in Bodenhöhe');

    setScenario('deliver', true); respawn();
    for (const p of [PICKUP, ...DROPS]) assert.ok(Math.abs(p[1] - groundH(p[0], p[2])) < 0.3 && !waterAt(p[0], p[2]), 'Platz auf trockenem Boden');
    assert.ok(Math.hypot(PICKUP[0] - game.home[0], PICKUP[2] - game.home[1]) < 401);

    // zurück zur Spielkarte: feste Plätze wie vorher
    setScenario('landing', false); respawn();
    assert.deepEqual(PAD.c, [72.5, 0, -45]);
    setScenario('deliver', false); respawn();
    assert.deepEqual(PICKUP, [-5, 0, -12]); assert.ok(DROPS.every(p => p[1] === 0));
  } finally { setLayoutSeed(null); setScenario('gates'); rw.on = false; }
});
const vSubY = (p, dy) => [p[0], p[1] - dy, p[2]];
