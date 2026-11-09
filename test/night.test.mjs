// Nachtmodus (Prompt 180, Etappe N1): Tagesstand, Einstellung, Fahrzeuglichter, Belebung nachts, Shader-Teile.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { cfg } from '../src/state.js';
import { dayState, DAY } from '../src/daylight.js';
import { buildVehicle } from '../src/vehicles.js';
import { rw, rwApply } from '../src/realworld.js';
import { amb, ambInit, ambStep } from '../src/ambient.js';
import { rng } from '../src/world.js';

test('Tagesstand: Tag mit Sonne, Nacht mit Mond über dem Horizont und dunklem Nebel', () => {
  const sun = [0, 1, 0], d = dayState(false, sun), n = dayState(true, sun);
  assert.equal(d.night, 0); assert.deepEqual(d.light, sun); assert.deepEqual(d.fog, DAY.fog);
  assert.equal(n.night, 1);
  assert.ok(Math.abs(Math.hypot(...n.light) - 1) < 1e-9 && n.light[1] > 0.3, 'Mond 35° hoch');
  assert.ok(n.light[0] > 0 && n.light[2] > 0, 'Mond im Südosten (x Ost, z Süd)');
  assert.ok(n.fog.reduce((a, b) => a + b) < 0.3 && n.zen.reduce((a, b) => a + b) < 0.3, 'Nebel und Himmel dunkel');
});

test('Einstellung: Tageszeit ist anfangs Tag', () => {
  assert.equal(cfg.night, false);
});

test('Fahrzeug: Scheinwerfer und Rücklichter tragen die Lichtkennung 0,75', () => {
  const v = buildVehicle();
  let lights = 0;
  for (let i = 9; i < v.length; i += 10) if (Math.abs(v[i] - 0.75) < 1e-6) lights++;
  assert.equal(lights, 4*36, 'vier Lichter mit je 12 Dreiecken');
});

test('Belebung: nachts keine Schwärme und Greifvögel, Flugzeuge bleiben', () => {
  const f = n => readFileSync(new URL('../realworld/monschau.' + n, import.meta.url)), meta = JSON.parse(f('json')), q = inflateSync(f('dgm'));
  rwApply({ meta, q: new Uint16Array(q.buffer, q.byteOffset, q.byteLength/2), b16: new Int16Array(0), t16: new Int16Array(0) }, {});
  const was = rw.on; rw.on = true; cfg.night = true;
  try {
    const r = rng(5); ambInit([0, 0, 0], r); amb.tFlock = 0;
    let birds = 0; for (let i = 0; i < 600; i++) { ambStep(0.1, [0, 0, 0], r); birds += amb.birds.length; }
    assert.equal(birds, 0);
    assert.ok(amb.jets.length > 0, 'Flugzeuge am Himmel');
  } finally { cfg.night = false; rw.on = was; }
});

test('Shader: Nacht-Uniform in Welt und Himmel, Lichtkennung, Nachtsicht verstärkt', () => {
  const src = readFileSync(new URL('../src/render.js', import.meta.url), 'utf8');
  assert.ok(/uTime, uNight;\n/.test(src) && /uGfx, uTime, uNight;/.test(src), 'uNight in beiden Programmen');
  assert.ok(src.includes('vCol.a > 0.74 && vCol.a < 0.76'), 'Lichtkennung 0,75');
  assert.ok(src.includes('uNight > 0.5 ? 4.5 : 0.6'), 'Nachtsicht verstärkt nachts');
  assert.ok(src.includes('!cfg.night'), 'Lens-Flare nachts aus');
});
