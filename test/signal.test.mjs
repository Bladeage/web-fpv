// Funkstrecke: Entfernung, Hindernisse, Video verliert vor der Steuerverbindung.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { game } from '../src/state.js';
import { buildWorld, colliders } from '../src/world.js';
import { respawn } from '../src/physics.js';
import { PILOT, signal, signalTarget, obstruction, updSignal, resetSignal } from '../src/signal.js';

buildWorld();

test('Freie Sicht in der Nähe: volles Signal', () => {
  const s = signalTarget([0, 5, -20]);
  assert.equal(s.video, 100); assert.equal(s.lq, 100); assert.equal(s.block, 0);
});

test('Weit weg: Video schwächer als die Steuerverbindung', () => {
  const s = signalTarget([0, 30, -280]);
  assert.ok(s.video < 60, 'video ' + s.video);
  assert.ok(s.lq > s.video + 20, 'lq ' + s.lq);
});

test('Hinter einem Gebäude: deutlich schlechteres Video', () => {
  const b = colliders.find(c => c.h[0] > 3 && c.h[2] > 3);   // ein Gebäude
  const dir = [b.c[0] - PILOT[0], b.c[2] - PILOT[2]], l = Math.hypot(dir[0], dir[1]);
  const behind = [b.c[0] + dir[0]/l*15, 1.5, b.c[2] + dir[1]/l*15];
  assert.ok(obstruction(behind) >= 35);
  const open = signalTarget([0, 60, -l - 15]);   // gleiche Entfernung, hoch und frei
  assert.ok(signalTarget(behind).video < open.video - 30);
});

test('updSignal glättet und folgt dem Ziel', () => {
  respawn(); resetSignal();
  game.sim.p = [0, 30, -300];
  updSignal(1/60);
  assert.ok(signal.video > 90, 'springt nicht sofort');
  for (let i = 0; i < 120; i++) updSignal(1/60);
  assert.ok(signal.video < 60, 'nach 2 s angepasst: ' + signal.video);
});
