// Belebung L2 (Prompt 180/187): Boote auf dem Wasser, Heißluftballon, Segelflieger. Nur echte Welt, nicht DIS, nachts kein Ballon
// und kein Segler (Boote fahren mit Licht).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { cfg } from '../src/state.js';
import { rw, rwApply, rwSetShow, groundH, waterAt } from '../src/realworld.js';
import { boats, boatsStep, boatKind, buildBoatMesh, BOAT } from '../src/boats.js';
import { amb, ambInit, ambStep, AMB, buildHotAirMesh, buildGliderMesh } from '../src/ambient.js';
import { rng } from '../src/world.js';

const f = n => readFileSync(new URL('../realworld/monschau.' + n, import.meta.url)), meta = JSON.parse(f('json')), q = inflateSync(f('dgm'));
const load = () => { rwApply({ meta, q: new Uint16Array(q.buffer, q.byteOffset, q.byteLength/2), b16: new Int16Array(0), t16: new Int16Array(0) },
  { water: new Uint8Array(inflateSync(f('water'))), features: JSON.parse(f('features.json')) }); rw.on = true; };
const c = [meta.home[0], 0, meta.home[1]];

test('Art nach Breite: Kanu ab 6 m, Motorboot ab 30 m, Frachter ab 120 m', () => {
  assert.equal(boatKind(4), null); assert.equal(boatKind(10), 'canoe'); assert.equal(boatKind(40), 'motor'); assert.equal(boatKind(200), 'cargo');
});

test('Monschau: Kanus auf der Rur, immer auf dem Wasser, im Tempo, Abstand zur Drohne', () => {
  load(); boats.list.length = 0; boats.t = 0;
  const R = rng(3);
  let seen = 0;
  for (let i = 0; i < 1200; i++) {
    boatsStep(0.1, c, R);
    for (const b of boats.list) {
      seen++;
      assert.ok(waterAt(b.x, b.z), 'auf dem Wasser');
      assert.ok(Math.abs(b.y - (groundH(b.x, b.z) + 0.3)) < 1e-6, 'an der Wasserlinie');
      assert.ok(Math.hypot(b.x - c[0], b.z - c[2]) < BOAT.far, 'nicht zu weit');
      assert.ok(b.v <= BOAT.kinds[b.kind].v*1.15 + 1e-9);
    }
  }
  assert.ok(seen > 0 && boats.list.length >= 1, 'Boote da: ' + boats.list.length);
  assert.ok(boats.list.every(b => b.kind === 'canoe'), 'Rur 18 bis 27 m breit: nur Kanus');
  // nicht in DIS, nicht ohne Gewässer
  cfg.verbund = true; boatsStep(0.1, c, R); assert.equal(boats.list.length, 0, 'DIS: keine'); cfg.verbund = false;
  rwSetShow({ water: false }); rw.on = true; boatsStep(0.1, c, R); assert.equal(boats.list.length, 0, 'Ebene Gewässer aus: keine');
  rwSetShow({}); rw.on = false;
});

test('Netze: Boote mit Positionslicht (außer Kanu), Ballon und Segler', () => {
  for (const k of ['motor', 'cargo']) { const m = buildBoatMesh(k); let l = 0; for (let i = 9; i < m.length; i += 10) if (Math.abs(m[i] - 0.75) < 1e-6) l++; assert.ok(l >= 36, k + ' mit Licht'); }
  assert.ok(buildBoatMesh('canoe').length > 0 && buildHotAirMesh([1, 0, 0]).length/10 > 500 && buildGliderMesh().length/10 > 50);
  // Segler: Spannweite etwa 15 m
  const g = buildGliderMesh(); let x0 = 0, x1 = 0; for (let i = 0; i < g.length; i += 10) { x0 = Math.min(x0, g[i]); x1 = Math.max(x1, g[i]); }
  assert.ok(Math.abs(x1 - x0 - 15) < 0.5, 'Spannweite ' + (x1 - x0));
});

test('Ballon und Segler: über dem Boden, Ballon zieht mit dem Wind, Segler kreist und wechselt die Thermik; nachts keine', () => {
  load(); const R = rng(9);
  ambInit(c, R); amb.tBalloon = 0; if (!amb.glider) ambInit(c, rng(1));
  let gMin = Infinity, bMin = Infinity, bPrev = null, along = 0, glides = 0;
  for (let i = 0; i < 6000; i++) {   // 10 Minuten
    ambStep(0.1, c, R);
    const B = amb.balloon, G = amb.glider;
    if (B) { bMin = Math.min(bMin, B.p[1] - groundH(B.p[0], B.p[2])); if (bPrev) along += (B.p[0] - bPrev[0])*0.93 + (B.p[2] - bPrev[2])*0.36; bPrev = B.p.slice(); }
    if (G) { gMin = Math.min(gMin, G.p[1] - groundH(G.p[0], G.p[2])); if (G.glide) glides++; }
  }
  assert.ok(bMin >= 59, 'Ballon über dem Boden: ' + bMin.toFixed(0));
  assert.ok(along > 1500, 'Ballon zieht mit dem Wind: ' + along.toFixed(0) + ' m');
  assert.ok(gMin >= AMB.gliderH[0] - 1, 'Segler über dem Boden: ' + gMin.toFixed(0));
  assert.ok(glides > 0, 'Segler gleitet zur nächsten Thermik');
  cfg.night = true; ambStep(0.1, c, R); assert.equal(amb.balloon, null); assert.equal(amb.glider, null); cfg.night = false;
  rw.on = false;
});
