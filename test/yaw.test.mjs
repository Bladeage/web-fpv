// Blickrichtung beim Start (Prompt 199 bis 202): vorgegeben im Gebiet (meta.homeYaw, Grad nach Kompass) oder zur Gebietsmitte.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { game } from '../src/state.js';
import { buildWorld } from '../src/world.js';
import { respawn } from '../src/physics.js';
import { setScenario } from '../src/scenario.js';
import { rw, rwApply } from '../src/realworld.js';

buildWorld();
const f = n => readFileSync(new URL('../realworld/axa.' + n, import.meta.url)), meta = JSON.parse(f('json')), q = inflateSync(f('dgm'));
rwApply({ meta, q: new Uint16Array(q.buffer, q.byteOffset, q.byteLength/2), b16: new Int16Array(0), t16: new Int16Array(0) }, {});
rw.ready = true;
after(() => { rw.on = false; setScenario('gates'); });
const heading = () => { const s = game.sim.q, fx = -2*(s[0]*s[2] + s[3]*s[1]), fz = -(1 - 2*(s[0]*s[0] + s[1]*s[1])); return (Math.atan2(fx, -fz)*180/Math.PI + 360) % 360; };

test('AXA Campus: Start auf 50.96170, 7.05731 mit Blick nach Westen (270°)', () => {
  setScenario('real', true); respawn();
  assert.equal(meta.place, 'AXA Campus Köln');
  assert.ok(Math.hypot(...meta.home) < 1, 'Start in der Mitte: ' + meta.home);
  assert.ok(Math.abs(heading() - 270) < 0.5, 'Blick ' + heading().toFixed(1));
});

test('Eigene Richtung (Karte) wirkt beim nächsten Start; ohne Vorgabe zur Gebietsmitte', () => {
  rw.meta.homeYaw = 92; setScenario('real', true); respawn();
  assert.ok(Math.abs(heading() - 92) < 0.5, 'Blick ' + heading().toFixed(1));
  delete rw.meta.homeYaw; const h = rw.meta.home.slice(); rw.meta.home = [200, 0];
  setScenario('real', true); respawn();
  assert.ok(Math.abs(heading() - 270) < 0.5, 'Start östlich der Mitte: Blick nach Westen zur Mitte, ' + heading().toFixed(1));
  rw.meta.home = h; rw.meta.homeYaw = 270;
});
