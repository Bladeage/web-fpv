// Am Boden (Prompt 65): Gieren und Loslassen lässt die Drohne nicht hüpfen und nicht nachdrehen.
// Beide Regler, drei Drohnen. Dazu der Strahltest für die Sonne (Lens-Flare) und die Boden-Ecken (Zeichnen ohne Tiefe).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cfg, game, inp } from '../src/state.js';
import { buildWorld, rayBlocked } from '../src/world.js';
import { STEP, step, respawn } from '../src/physics.js';
import { applyDrone } from '../src/drone.js';
import { setScenario } from '../src/scenario.js';
import { bf, bfLoad } from '../src/bf.js';
import { qRot } from '../src/math.js';

after(() => { cfg.fc = 'own'; applyDrone({ preset: '5' }); });
const head = () => { const f = qRot(game.sim.q, [0, 0, -1]); return Math.atan2(-f[0], -f[2])*180/Math.PI; };
const turn = (a, b) => ((b - a + 540) % 360) - 180;
const run = (sec, fn) => { for (let i = 0; i < sec/STEP; i++) { if (fn) fn(i); step(STEP); } };

buildWorld();
bfLoad(readFileSync(new URL('../sitl/betaflight.wasm', import.meta.url)));

for (const fc of ['own', 'bf']) for (const preset of ['5', 'whoop', '7']) {
  test(`Boden: Gieren und Loslassen ohne Hüpfen und Nachdrehen (${fc}, ${preset})`, () => {
    cfg.fc = fc; cfg.mode = 'angle'; cfg.dmg = 'off'; cfg.needArm = false;
    applyDrone({ preset }); setScenario('gates'); respawn();
    game.throttle = 0; inp.pitch = inp.roll = inp.yaw = 0;
    if (fc === 'bf') assert.equal(bf.ready, true, bf.err);
    let y = 0;
    run(1);
    run(1, i => { inp.yaw = Math.min(1, i/60); y = Math.max(y, game.sim.p[1]); });
    inp.yaw = 0;
    const h0 = head();
    run(1.5, () => { y = Math.max(y, game.sim.p[1]); });
    assert.ok(y < 0.03, 'hüpft nicht: höchstens ' + y.toFixed(3) + ' m');
    assert.ok(Math.abs(turn(h0, head())) < 6, 'dreht nach dem Loslassen kaum weiter: ' + turn(h0, head()).toFixed(1) + '°');
    assert.equal(game.state, 'fly');
    if (fc === 'bf') assert.equal(bf.x.bf_flag(0), 1, 'Betaflight bleibt scharf');
    game.throttle = 0.6; run(1);
    assert.ok(game.sim.p[1] > 1, 'hebt danach normal ab: ' + game.sim.p[1].toFixed(2) + ' m');
  });
}

for (const preset of ['5', '7']) for (const [arm, q0] of [[true, 0], [true, 0.002], [false, 0.002]]) {
  test(`Boden: steht 12 s still, ohne Wippen (${preset}, ${arm ? 'scharf' : 'aus'}, Schieflage ${q0})`, () => {
    // Prompt 66: Nach etwa 5 s fing die Drohne auf dem Startplatz von selbst an zu wippen (Kontaktpunkt immer in der Mitte)
    cfg.fc = 'own'; cfg.mode = 'angle'; cfg.dmg = 'off';
    applyDrone({ preset }); setScenario('gates'); respawn();
    game.throttle = 0; inp.pitch = inp.roll = inp.yaw = 0;
    game.sim.q = [0, 0, q0, Math.sqrt(1 - q0*q0)];
    run(2, () => { game.armed = arm; });
    let tilt = 0;
    run(10, () => { game.armed = arm; tilt = Math.max(tilt, Math.acos(Math.min(1, qRot(game.sim.q, [0, 1, 0])[1]))*180/Math.PI); });
    assert.ok(tilt < 0.1, 'bleibt gerade: höchstens ' + tilt.toFixed(3) + '°');
  });
}

test('Strahl zur Sonne: Quader blockiert, daneben frei, gedrehter Quader', () => {
  const box = { c: [10, 5, 0], h: [1, 5, 1], cs: 1, sn: 0 };
  assert.equal(rayBlocked([0, 1, 0], [1, 0, 0], 100, [box]), true);
  assert.equal(rayBlocked([0, 1, 0], [1, 0, 0], 5, [box]), false, 'zu kurz');
  assert.equal(rayBlocked([0, 1, 3], [1, 0, 0], 100, [box]), false, 'daneben');
  assert.equal(rayBlocked([0, 12, 0], [1, 0, 0], 100, [box]), false, 'darüber');
  const a = Math.PI/4, rot = { c: [10, 5, 0], h: [3, 5, 0.2], cs: Math.cos(a), sn: Math.sin(a) };   // schräge Wand
  assert.equal(rayBlocked([0, 1, 0], [1, 0, 0], 100, [rot]), true);
  assert.equal(rayBlocked([0, 1, 2], [1, 0, 0], 100, [rot]), true, 'schräge Wand reicht seitlich weiter');
  assert.equal(rayBlocked([0, 1, 2.8], [1, 0, 0], 100, [rot]), false, 'aber nicht beliebig weit');
  assert.equal(rayBlocked([0, 1, 0], [-1, 0, 0], 100, [rot]), false, 'Rücken zur Wand');
});

test('Boden kommt zuerst im Welt-Netz und liegt ganz auf y = 0', () => {
  const w = buildWorld();
  assert.ok(w.groundCount > 0 && w.groundCount < w.staticCount);
  for (let i = 0; i < w.groundCount; i++) assert.equal(w.data[i*10 + 1], 0, 'Ecke ' + i);   // 10 Werte je Ecke: Ort, Normale, Farbe
  let top = 0;
  for (let i = w.groundCount; i < w.groundCount + 36; i++) top = Math.max(top, w.data[i*10 + 1]);
  assert.ok(top > 0, 'danach der Startplatz über dem Boden');
});
