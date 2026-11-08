// Szenarien aus E5: Ringe, Slalom, Landung, Torkurs als Vorgabe.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { cfg, game, inp } from '../src/state.js';
import { buildWorld, gates } from '../src/world.js';
import { STEP, step, respawn, task, checkGate } from '../src/physics.js';
import { setScenario, scenDone, scenLabel, buildScenario, rings, poles, PAD, diff, setLayoutSeed, ringLayoutOk, slalomLayoutOk } from '../src/scenario.js';

buildWorld();

function run(seconds) {
  const n = Math.round(seconds/STEP);
  for (let i = 0; i < n && game.state === 'fly'; i++) step(STEP);
}
// Drohne bei p mit Geschwindigkeit v absetzen, Gas knapp unter Schweben
function place(p, v, thr = 0.24) {
  const s = game.sim;
  s.p = p.slice(); s.v = v.slice(); s.grounded = false; s.thr = thr; game.throttle = thr;
}
const along = (c, n, back, speed, off = [0, 0, 0]) =>
  [[c[0] - n[0]*back + off[0], c[1] - n[1]*back + off[1], c[2] - n[2]*back + off[2]], [n[0]*speed, n[1]*speed, n[2]*speed]];

beforeEach(() => { setLayoutSeed(7); cfg.mode = 'angle'; inp.pitch = inp.roll = inp.yaw = 0; });

test('Vorgabe ist der Torkurs mit der alten Torprüfung', () => {
  setScenario('gates'); respawn();
  assert.equal(task.check, checkGate);
  assert.equal(task.collide, null);
  assert.equal(scenLabel(), 'TOR 1/8');
  assert.equal(buildScenario().data.length, 0);
});

test('Durchflug durch einen geneigten Ring zählt', () => {
  setScenario('rings'); respawn();
  const i = rings.findIndex(g => Math.abs(g.n[1]) > 0.05);
  assert.ok(i >= 0, 'es gibt geneigte Ringe');
  game.sim.next = i;
  const [p, v] = along(rings[i].c, rings[i].n, 1.5, 8);
  place(p, v);
  run(0.5);
  assert.equal(game.state, 'fly');
  assert.equal(game.sim.next, i + 1);
});

test('Treffer auf den Ring ergibt Absturz', () => {
  cfg.dmg = 'mild';   // Absturz gibt es nur mit Schadmodell
  setScenario('rings'); respawn();
  const g = rings[0];
  const [p, v] = along(g.c, g.n, 1.5, 10, vScaleLocal(g.e1, diff().ringR));
  place(p, v);
  run(0.5);
  assert.equal(game.state, 'crashed');
  assert.equal(game.sim.next, 0);
  cfg.dmg = 'off';
});
function vScaleLocal(a, s) { return [a[0]*s, a[1]*s, a[2]*s]; }

test('Alle Ringe der Reihe nach: Ziel mit Zeit', () => {
  setScenario('rings'); respawn();
  for (let i = 0; i < rings.length; i++) {
    const [p, v] = along(rings[i].c, rings[i].n, 1, 8);
    place(p, v); game.sim.t += 2;
    run(0.3);
  }
  assert.ok(scenDone());
  assert.equal(scenLabel(), 'ZIEL');
  assert.ok(game.sim.lastLap > 0);
});

test('Slalom zählt nur auf der richtigen Seite', () => {
  setScenario('slalom'); respawn();
  const g = poles[0], h = 2;
  // falsche Seite
  let [p, v] = along([g.c[0], h, g.c[2]], g.n, 1.5, 6, vScaleLocal(g.r, -g.side*2));
  place(p, v); run(0.5);
  assert.equal(game.sim.next, 0);
  // richtige Seite
  [p, v] = along([g.c[0], h, g.c[2]], g.n, 1.5, 6, vScaleLocal(g.r, g.side*2));
  place(p, v); run(0.5);
  assert.equal(game.state, 'fly');
  assert.equal(game.sim.next, 1);
  // zu weit weg zählt nicht
  const g1 = poles[1];
  [p, v] = along([g1.c[0], h, g1.c[2]], g1.n, 1.5, 6, vScaleLocal(g1.r, g1.side*(diff().slalomW + 1)));
  place(p, v); run(0.5);
  assert.equal(game.sim.next, 1);
});

test('Stange treffen ergibt Absturz', () => {
  cfg.dmg = 'mild';   // Absturz gibt es nur mit Schadmodell
  setScenario('slalom'); respawn();
  const g = poles[0];
  const [p, v] = along([g.c[0], 2, g.c[2]], g.n, 1.5, 10);
  place(p, v); run(0.5);
  assert.equal(game.state, 'crashed');
  cfg.dmg = 'off';
});

test('Landung zählt nur sanft und auf der Plattform', () => {
  setScenario('landing'); respawn();
  game.sim.t = 1;
  // hart aufsetzen: 4 m/s nach unten, kein Gas
  place([PAD.c[0], 0.6, PAD.c[2]], [0, -4, 0], 0);
  run(2.5);
  assert.equal(game.state, 'fly');
  assert.ok(!scenDone(), 'zu hart zählt nicht');
  // daneben sanft
  place([PAD.c[0] + 3, 0.4, PAD.c[2]], [0, -0.8, 0], 0.2);
  run(2.5);
  assert.ok(!scenDone(), 'neben der Plattform zählt nicht');
  // sanft auf der Plattform, nach dem Aufsetzen Gas weg (wie ein Pilot)
  place([PAD.c[0], 0.4, PAD.c[2]], [0, -0.8, 0], 0.2);
  run(0.8); game.throttle = 0;
  run(2);
  assert.ok(scenDone());
  assert.equal(scenLabel(), 'GELANDET');
});

test('Neustart setzt das Szenario zurück', () => {
  setScenario('landing'); respawn();
  game.sim.t = 1;
  place([PAD.c[0], 0.4, PAD.c[2]], [0, -0.8, 0], 0.2);
  run(0.8); game.throttle = 0;
  run(2);
  assert.ok(scenDone());
  respawn();
  assert.ok(!scenDone());
  assert.equal(scenLabel(), 'LANDEN');
});

test('Freiflug: keine Aufgabe, Tore zählen nicht', () => {
  setScenario('free'); respawn();
  const g = gates[0];
  const [p, v] = along(g.c, g.n, 1.5, 8);
  place(p, v); run(0.5);
  assert.equal(game.sim.next, 0);
  assert.equal(scenLabel(), 'FREIFLUG');
});

test('Schwierigkeit: Normal hat größere Ringe als Schwer, Landung strenger; Leicht mindestens wie Normal, mit Ballons', () => {
  cfg.diff = 'easy'; const easy = diff();
  cfg.diff = 'hard'; const hard = diff();
  cfg.diff = 'mid';
  assert.ok(easy.ringR >= diff().ringR && diff().ringR > hard.ringR);
  assert.ok(diff().landV > hard.landV);
  assert.equal(easy.balloons, true); assert.ok(!diff().balloons && !hard.balloons);
  // Durchflug 1,9 m neben der Ringmitte: Normal zählt, Schwer trifft den Ring
  for (const [d, ok] of [['mid', true], ['hard', false]]) {
    cfg.diff = d; setScenario('rings'); respawn();
    const g = rings[0];
    const [p, v] = along(g.c, g.n, 1.5, 4, vScaleLocal(g.e1, 1.9));
    place(p, v); run(0.6);
    assert.equal(game.sim.next === 1, ok, d);
  }
  cfg.diff = 'mid';
});

test('Ringe und Slalom: bei jedem Start neue Anordnung, jede besteht die Prüfung', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    setLayoutSeed(seed);
    setScenario('rings'); respawn();
    assert.equal(rings.length, 8);
    assert.ok(ringLayoutOk(rings), 'Ringe Startwert ' + seed);
    assert.ok(slalomLayoutOk(poles), 'Slalom Startwert ' + seed);
    seen.add(rings.map(g => g.c.map(x => x.toFixed(1)).join()).join('|'));
  }
  assert.ok(seen.size > 25, 'Anordnungen unterscheiden sich');
  setLayoutSeed(null); setScenario('rings'); respawn();
  const a = rings[0].c.slice(); respawn();
  assert.notDeepEqual(rings[0].c, a, 'ohne festen Startwert bei jedem Start neu');
  setLayoutSeed(7);
});

test('Menü: alte Einstellungen werden umgestellt (Echte Welt als Welt, Vorschau kein Modus, DIS-Übung als Flugart)', async () => {
  const { cfgMigrate, KEY_STICKS, KEY_FN } = await import('../src/state.js');
  assert.deepEqual(cfgMigrate({ scen: 'real', verbund: true }), { scen: 'free', world: 'real', verbund: true, flight: 'dis' });
  assert.deepEqual(cfgMigrate({ scen: 'vbs' }), { scen: 'gates', flight: 'course', verbund: false, world: 'map' });
  assert.deepEqual(cfgMigrate({ scen: 'hunt2', flight: 'tactical', world: 'real' }), { scen: 'hunt2', flight: 'tactical', verbund: false, world: 'real' });
  // Neuordnung (docs/plan-menue.md): Startort DIS-Übung wird Flugart; ebene Fläche nur in der DIS-Übung
  assert.deepEqual(cfgMigrate({ flight: 'course', verbund: true, world: 'map' }), { flight: 'dis', verbund: true, world: 'map' });
  assert.deepEqual(cfgMigrate({ flight: 'dis', world: 'real' }), { flight: 'dis', verbund: true, world: 'real' });
  assert.equal(cfgMigrate({ flight: 'course', rwSrc: 'dis', world: 'real' }).rwSrc, 'emb');
  assert.equal(cfgMigrate({ flight: 'dis', rwSrc: 'dis', world: 'real' }).rwSrc, 'dis');
  // Tastatur: Knüppel-Paare aus KEY_FN, keine Funktion doppelt, die übrigen neun bleiben Funktionen
  const stick = KEY_STICKS.flatMap(r => [r[1], r[2]]), fns = KEY_FN.map(r => r[0]);
  assert.equal(new Set(stick).size, 8); assert.ok(stick.every(f => fns.includes(f)));
  assert.equal(fns.filter(f => !stick.includes(f)).length, 9);
});
