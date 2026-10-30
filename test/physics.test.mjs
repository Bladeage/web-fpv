// Physik-Tests aus docs/PLAN.md, Etappe 0.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { cfg, game, inp } from '../src/state.js';
import { buildWorld, gates, GATE_IN } from '../src/world.js';
import { PHYS, BAT, STEP, step, respawn } from '../src/physics.js';

buildWorld();

// Wie die Hauptschleife: feste Schritte, Abbruch beim Absturz.
function run(seconds) {
  const n = Math.round(seconds/STEP);
  for (let i = 0; i < n && game.state === 'fly'; i++) step(STEP);
}
// Drohne in der Luft absetzen, Motoren schon auf Drehzahl.
function airborne(p, thr) {
  const s = game.sim;
  s.p = p.slice(); s.grounded = false; s.thr = thr; s.mot = [thr, thr, thr, thr]; game.throttle = thr;
}
// Gas, bei dem der Schub die Schwerkraft gerade ausgleicht (voller Akku, gerade Lage).
function hoverThrottle() {
  let thr = 0.25;
  for (let i = 0; i < 30; i++) {
    const amp = 1 + 95*Math.pow(thr, 1.6);
    const vpack = BAT.cells*4.2 - amp*(BAT.ri + BAT.r2);   // eingeschwungener Spannungseinbruch
    thr = 1/(PHYS.twr*Math.min(Math.max((vpack/BAT.vnom)**2, 0.3), 2.5));
  }
  return thr;
}

beforeEach(() => {
  cfg.mode = 'angle'; cfg.rate = 450;
  respawn();
  inp.pitch = inp.roll = inp.yaw = 0;
});

test('Schwebegas: nach 3 s ist die Steiggeschwindigkeit nahe 0', () => {
  const thr = hoverThrottle();
  assert.ok(thr > 0.15 && thr < 0.35, 'Schwebegas ' + thr);
  airborne([0, 5, 0], thr);
  game.sim.vrc = (1 + BAT.amax*Math.pow(thr, 1.6))*BAT.r2;   // Akku schon eingeschwungen
  run(3);
  assert.equal(game.state, 'fly');
  assert.ok(Math.abs(game.sim.v[1]) < 0.1, 'vy = ' + game.sim.v[1]);
  assert.ok(Math.abs(game.sim.p[1] - 5) < 0.3, 'Höhe ' + game.sim.p[1]);
});

test('Vollgas 1 s: Drohne steigt', () => {
  game.throttle = 1;
  run(1);
  assert.equal(game.state, 'fly');
  assert.ok(game.sim.p[1] > 3, 'Höhe ' + game.sim.p[1]);
  assert.ok(game.sim.v[1] > 3, 'vy = ' + game.sim.v[1]);
});

test('Angle-Modus, Nicken nach vorn: Drohne fliegt in -Z', () => {
  airborne([0, 10, 0], 0.4);
  inp.pitch = 1;
  run(2);
  const s = game.sim;
  assert.equal(game.state, 'fly');
  assert.ok(s.p[2] < -3, 'z = ' + s.p[2]);
  assert.ok(Math.abs(s.p[0]) < 0.05, 'x = ' + s.p[0]);
  assert.ok(s.v[2] < 0, 'vz = ' + s.v[2]);
});

test('Tor-Durchflug zählt', () => {
  const g = gates[0];
  airborne([g.c[0] - g.n[0]*1.5, g.c[1], g.c[2] - g.n[2]*1.5], hoverThrottle());
  game.sim.v = [g.n[0]*8, 0, g.n[2]*8];
  assert.equal(game.sim.next, 0);
  run(0.5);
  assert.equal(game.state, 'fly');
  assert.equal(game.sim.next, 1);
  assert.notEqual(game.sim.lapStart, null, 'Rundenzeit läuft');
});

test('Treffer auf Torpfosten ergibt Absturz', () => {
  const g = gates[0], lat = -(GATE_IN + 0.12);   // Mitte des linken Pfostens
  airborne([g.c[0] + g.r[0]*lat - g.n[0]*1.5, g.c[1], g.c[2] + g.r[2]*lat - g.n[2]*1.5], hoverThrottle());
  game.sim.v = [g.n[0]*8, 0, g.n[2]*8];
  run(0.5);
  assert.equal(game.state, 'crashed');
  assert.equal(game.sim.crashMsg, 'Hindernis getroffen');
  assert.equal(game.sim.next, 0, 'Tor zählt nicht');
});

test('Akku verbraucht Strom', () => {
  airborne([0, 5, 0], 0.5);
  run(3);
  const s = game.sim;
  const amp = 1 + 95*Math.pow(0.5, 1.6);   // Strommodell bei halbem Gas
  assert.ok(Math.abs(s.amp - amp) < 1e-9, 'Strom ' + s.amp);
  assert.ok(Math.abs(s.mah - amp*3/3.6) < 0.5, 'mAh ' + s.mah);
  assert.ok(s.cellRest < 4.2, 'Ruhespannung sinkt');
  assert.ok(s.vpack < BAT.cells*s.cellRest, 'Spannung bricht unter Last ein');
});

test('LiPo: Spannung fällt unter Last und erholt sich ohne Last', () => {
  airborne([0, 50, 0], 0.9);
  run(3);
  const loaded = game.sim.vpack, ocv = BAT.cells*game.sim.cellRest;
  assert.ok(ocv - loaded > 1.5, 'Einbruch unter Last ' + (ocv - loaded));
  game.throttle = 0; game.sim.thr = 0;
  run(0.1);
  const v0 = game.sim.vpack;
  run(8);
  assert.ok(game.sim.vpack > v0 + 0.3, 'Erholung ' + v0 + ' -> ' + game.sim.vpack);
  assert.ok(game.sim.vmin <= loaded + 1e-9, 'tiefste Spannung gemerkt');
});

test('LiPo: 6S gibt mehr Schub als 4S, sonst gleich', () => {
  const climb = cells => {
    BAT.cells = cells; respawn(); game.throttle = 0.5; run(1); return game.sim.p[1];
  };
  const h4 = climb(4), h6 = climb(6);
  BAT.cells = 4;
  assert.ok(h6 > h4 + 1, `6S ${h6} > 4S ${h4}`);
});

test('Physik 2.0: Schweben ist 10 s stabil, ohne Aufschwingen', () => {
  const thr = hoverThrottle();
  airborne([0, 20, 0], thr);
  game.sim.vrc = (1 + BAT.amax*Math.pow(thr, 1.6))*BAT.r2;
  let maxRate = 0;
  for (let i = 0; i < 240*10; i++) { step(STEP); if (i > 240) maxRate = Math.max(maxRate, Math.hypot(...game.sim.w)); }
  const up = game.sim.q;
  assert.equal(game.state, 'fly');
  assert.ok(maxRate < 0.01, 'Drehrate ' + maxRate);
  assert.ok(Math.abs(game.sim.p[1] - 20) < 1.5, 'Höhe ' + game.sim.p[1]);
  assert.ok(Math.abs(up[0]) + Math.abs(up[2]) < 1e-3, 'bleibt gerade');
});

// Zeit, bis die Rollrate 63 % des Sollwerts erreicht (Acro, Rate-Sprung)
function rollResponse() {
  cfg.mode = 'acro';
  airborne([0, 30, 0], 0.3);
  inp.roll = 0.5;
  const target = Math.abs(rateCurveTarget(0.5));
  for (let i = 1; i < 240; i++) { step(STEP); if (Math.abs(game.sim.w[2]) >= 0.63*target) return i*STEP; }
  return 1;
}
function rateCurveTarget(x) { const e = 0.45, a = Math.abs(x); return cfg.rate*Math.PI/180*((1 - e)*a + e*a*a*a); }

test('Physik 2.0: doppelte Trägheit antwortet langsamer auf einen Rate-Sprung', () => {
  const t1 = rollResponse();
  const I0 = PHYS.I.slice();
  PHYS.I = I0.map(x => x*2);
  respawn(); inp.pitch = inp.yaw = 0;
  const t2 = rollResponse();
  PHYS.I = I0;
  assert.ok(t1 < 0.1, 'Antwort ' + t1);
  assert.ok(t2 > t1*1.4, `doppelt ${t2} gegen ${t1}`);
});

test('Physik 2.0: Vollgas und voller Rollbefehl, mindestens ein Motor unter 100 %', () => {
  cfg.mode = 'acro';
  airborne([0, 30, 0], 1);
  inp.roll = 1;
  const target = -rateCurveTarget(1);
  let ok = true, checked = 0;
  for (let i = 0; i < 120; i++) {
    const err = Math.abs(target - game.sim.w[2]);
    step(STEP);
    if (err > 1) { checked++; if (Math.min(...game.sim.cmd) > 0.99) ok = false; }   // nur wenn Rollmoment verlangt ist
  }
  assert.ok(checked > 10);
  assert.ok(ok, 'ein Motor unter 100 %, solange Rollmoment verlangt ist');
  assert.ok(Math.max(...game.sim.cmd) > 0.99, 'Vollgas bleibt genutzt');
  assert.ok(game.sim.w[2] < -3, 'rollt trotzdem rechts: ' + game.sim.w[2]);
});
