// Platzierungsdienst (src/place.js, Etappe T2): Ringe in der echten Welt (Monschau) frei von Häusern, Bäumen und Boden,
// Spielkarte unverändert; Punkt-Dreieck-Abstand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { cfg, game } from '../src/state.js';
import { buildWorld, rng } from '../src/world.js';
import { respawn, step, STEP, hoverThrottle } from '../src/physics.js';
import { setScenario, rings, ringsAlt, ringsReal, ringLayoutOk, setLayoutSeed, scenLabel } from '../src/scenario.js';
import { rw, rwApply, groundH, placeReal, waterAt } from '../src/realworld.js';
import { ringChain, ringCircle, pathClearW } from '../src/place.js';
import { ptTriDist } from '../src/math.js';

buildWorld();
const f = n => readFileSync(new URL('../realworld/monschau.' + n, import.meta.url)), meta = JSON.parse(f('json')), q = inflateSync(f('dgm'));
const un = n => { const b = inflateSync(f(n)); return new Int16Array(b.buffer, b.byteOffset, b.byteLength/2); };
const wat = (() => { try { return new Uint8Array(inflateSync(f('water'))); } catch (e) { return null; } })();
rwApply({ meta, q: new Uint16Array(q.buffer, q.byteOffset, q.byteLength/2), b16: un('bld'), t16: un('trees') }, { water: wat });

test('Punkt-Dreieck-Abstand: Fläche, Kante, Ecke', () => {
  const A = [-1, 0, -1], B = [1, 0, -1], C = [0, 0, 1];
  assert.equal(ptTriDist([0, 2, 0], A, B, C), 2);
  assert.ok(Math.abs(ptTriDist([0, 0, -3], A, B, C) - 2) < 1e-9, 'Kante');
  assert.ok(Math.abs(ptTriDist([3, 0, -1], A, B, C) - 2) < 1e-9, 'Ecke');
});

test('Echte Welt: Ringkette um den Start frei (Häuser, Bäume, Boden, Weg), über dem Boden, schnell genug', () => {
  rw.on = true;
  try {
    const W = placeReal(), c = meta.home, t0 = performance.now(), cs = ringChain(W, c, 8, rng(7)), ms = performance.now() - t0;
    assert.ok(cs, 'Kette gefunden'); assert.equal(cs.length, 8);
    for (const p of cs) { assert.ok(W.free(p, 3.9), 'frei'); assert.ok(p[1] - groundH(p[0], p[2]) > 3.4, 'über dem Boden'); assert.ok(!waterAt(p[0], p[2]), 'nicht über Wasser'); }
    for (let i = 0; i < 8; i++) assert.ok(pathClearW(W, cs[i], cs[(i + 1) % 8], 1.2, 0.75), 'Weg frei');
    console.log('    Ringkette Monschau: ' + ms.toFixed(0) + ' ms');
    assert.ok(ms < 2000, 'Rechenzeit ' + ms.toFixed(0) + ' ms');
    // Kreis als Rückfall ist immer frei
    for (const p of ringCircle(W, c, 8)) assert.ok(W.free(p, 3.9));
    // ein Haus: free meldet es
    const t = 0, T = rw.tris, roof = [(T[0] + T[3] + T[6])/3, (T[1] + T[4] + T[7])/3, (T[2] + T[5] + T[8])/3];
    assert.equal(W.free(roof, 0.5), false, 'auf dem Dach ist nicht frei');
  } finally { rw.on = false; }
});

test('Ringparcours in der echten Welt über setScenario, Spielkarte unverändert', () => {
  rw.ready = true;
  setLayoutSeed(3); setScenario('rings', true); respawn();
  assert.ok(rw.on); assert.equal(rings.length, 8);
  const W = placeReal();
  for (const g of rings) assert.ok(W.free(g.c, 3.9));
  assert.equal(game.bestScen, 'rings.real', 'eigene Bestzeit in der echten Welt');
  // zweiter Kurs (blau): 8 freie Ringe, mindestens 60 m vom ersten Kurs, Mitte 200 m oder weiter vom Start
  assert.equal(ringsAlt.length, 8, 'zweiter Kurs gefunden');
  for (const g of ringsAlt) { assert.ok(W.free(g.c, 3.9)); for (const r of rings) assert.ok(Math.hypot(g.c[0] - r.c[0], g.c[2] - r.c[2]) > 60); }
  const mid = ringsAlt.reduce((m, g) => [m[0] + g.c[0]/8, m[1] + g.c[2]/8], [0, 0]);
  assert.ok(Math.hypot(mid[0] - game.home[0], mid[1] - game.home[1]) > 150, 'weiter weg vom Start');
  assert.match(scenLabel(), /2 KURSE/);
  // durch den ersten Ring des zweiten Kurses: dieser Kurs zählt
  const dmg = cfg.dmg; cfg.dmg = 'off';
  { const a0 = ringsAlt[0]; game.sim.p = [a0.c[0] - a0.n[0]*2, a0.c[1], a0.c[2] - a0.n[2]*2]; game.sim.v = a0.n.map(x => x*8); game.sim.grounded = false; game.throttle = hoverThrottle();
    for (let i = 0; i < 240; i++) step(STEP);
    assert.equal(game.sim.next, 1); assert.deepEqual(rings[0].c, a0.c, 'Kurs getauscht'); }
  respawn();
  // durch den ersten Ring fliegen: zählt
  const g = rings[0]; game.sim.p = [g.c[0] - g.n[0]*2, g.c[1], g.c[2] - g.n[2]*2]; game.sim.v = g.n.map(x => x*8); game.sim.grounded = false; game.throttle = hoverThrottle();
  for (let i = 0; i < 240; i++) step(STEP);
  assert.equal(game.sim.next, 1, 'Ring 1 durchflogen'); cfg.dmg = dmg;
  setScenario('rings'); respawn();
  assert.ok(!rw.on); assert.ok(ringLayoutOk(rings), 'Spielkarte wie bisher geprüft'); assert.equal(game.bestScen, 'rings');
  setLayoutSeed(null); setScenario('gates');
});
