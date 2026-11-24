// Prüfung der Funktionen (Prompt 237): Fehler aus der Durchsicht von Aufträgen und Anzeige, hier gegen Rückfall gesichert.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cfg, game } from '../src/state.js';
import { buildWorld } from '../src/world.js';
import { STEP, step, respawn, rewind, task } from '../src/physics.js';
import { setScenario, scenLabel, chargeOn, chargeLeft, missionEnd, followLead } from '../src/scenario.js';
import { vehicles } from '../src/vehicles.js';
import { fmtTime } from '../src/format.js';

buildWorld();
after(() => { cfg.flight = 'course'; cfg.diff = 'mid'; cfg.huntX = 5; cfg.dmg = 'off'; setScenario('gates'); });
const run = sec => { for (let i = 0; i < sec/STEP; i++) step(STEP); };

test('Nr. 1: Ziele bewegen sich auch, solange die Ladung nicht scharf ist', () => {
  cfg.flight = 'tactical'; cfg.diff = 'mid'; setScenario('hunt2'); respawn();
  const at = vehicles.map(v => [v.x, v.z]); game.throttle = 0; run(3);
  assert.equal(game.sim.armed, undefined);
  assert.ok(vehicles.filter((v, i) => Math.hypot(v.x - at[i][0], v.z - at[i][1]) > 1).length >= 3, 'fahrende Autos fahren');
});

test('Nr. 3: Zeit und Auto der Verfolgung starten erst beim Abheben', () => {
  cfg.flight = 'course'; setScenario('follow'); respawn(); game.throttle = 0; run(5);
  assert.equal(game.sim.lapStart, null); assert.equal(followLead().s, 0);
});

test('Nr. 2, 6, 7: Absturz nach dem letzten Treffer erfüllt die Mission; gezündete Drohne lässt sich nicht zurückholen', () => {
  cfg.flight = 'tactical'; cfg.diff = 'mid'; cfg.huntX = 2; cfg.dmg = 'real'; setScenario('hunt2'); respawn();
  const hit = () => { const v = vehicles.find(x => x.kind === 'parked' && x.state !== 'hit'), s = game.sim; run(0.5);
    s.p = [v.x, 2.2, v.z]; s.v = [0, -8, 0]; s.w = [0, 0, 0]; s.q = [0, 0, 0, 1]; s.armed = true; s.touch = false; game.throttle = 0;   // umgesetzt: die alte Berührung gilt nicht mehr
    for (let i = 0; i < 3/STEP && game.state === 'fly' && !/ZIEL/.test(scenLabel()); i++) step(STEP); };
  hit();
  assert.equal(game.state, 'crashed'); assert.equal(task.hold(), true, 'neue Drohne kommt von selbst');
  assert.equal(rewind(5), false, 'kein Zurückspulen'); assert.equal(game.state, 'crashed');
  game.state = 'fly'; game.sim.armed = false; hit(); run(1);   // zweiter und letzter Treffer, danach schlägt die Drohne auf
  assert.equal(scenLabel(), 'ZIEL'); assert.equal(chargeLeft(), null, 'keine Anzeige der Ladung mehr');
  assert.equal(missionEnd(), true); assert.equal(game.state, 'done');
});

test('Nr. 4: Flugart und Stufe gelten ab dem Start, nicht nach einer Änderung im Menü', () => {
  cfg.flight = 'tactical'; cfg.diff = 'mid'; setScenario('hunt2'); respawn();
  cfg.flight = 'course'; cfg.diff = 'easy'; assert.equal(chargeOn(), true, 'laufende Mission unverändert');
  respawn(); assert.equal(chargeOn(), false, 'nach Neustart gilt die neue Wahl');
});

test('Nr. 8: DIS gewählt, aber Spielkarte: keine Anzeige der Ladung', () => {
  cfg.flight = 'dis'; setScenario('vbs'); respawn(); assert.equal(chargeLeft(), null);
});

test('Nr. 9, 11: Bestzeit je Stufe und Trefferzahl; Zeit rundet sauber', () => {
  cfg.flight = 'tactical'; cfg.diff = 'hard'; cfg.huntX = 7; setScenario('hunt2'); assert.equal(game.bestScen, 'hunt2.hard.x7');
  cfg.diff = 'mid'; setScenario('rings'); assert.equal(game.bestScen, 'rings');
  assert.equal(fmtTime(59.996), '1:00.00'); assert.equal(fmtTime(59.994), '0:59.99'); assert.equal(fmtTime(5), '0:05.00');
});

test('Drohne Nr. 3, 6: leerer Akku trägt nicht mehr; Zurückspulen zählt nach Einträgen, auch beim zweiten Mal', async () => {
  const { BAT, hoverThrottle } = await import('../src/physics.js');
  cfg.flight = 'course'; cfg.dmg = 'off'; cfg.infBat = false; cfg.fc = 'own'; cfg.mode = 'angle'; setScenario('free'); respawn();
  const s = game.sim; s.p[1] = 30; s.grounded = false; game.throttle = hoverThrottle(); run(2);
  assert.ok(s.p[1] > 25, 'schwebt mit vollem Akku: ' + s.p[1].toFixed(1));
  s.mah = BAT.cap + 1; run(3);
  assert.ok(s.p[1] < 10, 'fällt mit leerem Akku: ' + s.p[1].toFixed(1));
  cfg.infBat = true; respawn();
  const d = game.sim; d.p[1] = 30; d.grounded = false; game.throttle = hoverThrottle()*1.08;   // steigt stetig: die Höhe ist die Uhr
  const y = []; for (let i = 0; i < 12; i++) { run(1); y.push(d.p[1]); }
  assert.equal(rewind(5), true); const a = d.p[1];
  assert.ok(Math.abs(a - y[6]) < (y[7] - y[6]), 'erstes Mal 5 s zurück: ' + a.toFixed(1) + ' statt ' + y[6].toFixed(1));
  run(2); const c = d.p[1]; assert.equal(rewind(5), true); const b = d.p[1];   // 2 s weiter, dann wieder 5 s zurück (vorher nur 2 s)
  assert.ok(Math.abs((c - b) - 5*(y[7] - y[6])) < (y[7] - y[6]), 'zweites Mal wieder 5 s zurück: von ' + c.toFixed(1) + ' auf ' + b.toFixed(1) + ' (nach dem ersten Mal ' + a.toFixed(1) + ')');
  cfg.infBat = false;
});

test('Geo Nr. 8: OSM-Wege teilen sich an Kreuzungen; Wald aus mehreren Teilstücken wird ein Ring', async () => {
  const { osmRoads, osmWoods } = await import('../src/rwroads.js');
  const { roadGraph } = await import('../src/roads.js');
  const { fromUtm } = await import('../src/geo.js');
  const bb = [400000, 5600000, 401000, 5601000], P = (e, n) => { const [lat, lon] = fromUtm(e, n, 32); return { lat, lon }; };
  const X = P(400500, 5600500), net = j => ({ text: async () => JSON.stringify(j) });
  const roads = await osmRoads({ overpass: ['https://o/api'], zone: 32 }, bb, net({ elements: [
    { type: 'way', tags: { highway: 'residential' }, geometry: [P(400300, 5600500), X, P(400700, 5600500)] },
    { type: 'way', tags: { highway: 'residential' }, geometry: [P(400500, 5600300), X, P(400500, 5600700)] }] }));
  assert.equal(roads.length, 4, 'zwei Wege, an der Kreuzung geteilt');
  const G = roadGraph(roads); assert.equal(G.nodes.length, 5); assert.equal(G.edges.length, 4);
  const c = [P(400200, 5600200), P(400800, 5600200), P(400800, 5600800), P(400200, 5600800)];
  const woods = await osmWoods({ overpass: ['https://o/api'] }, bb, 32, net({ elements: [{ type: 'relation', members: [
    { role: 'outer', geometry: [c[0], c[1]] }, { role: 'outer', geometry: [c[2], c[1]] }, { role: 'outer', geometry: [c[2], c[3]] }, { role: 'outer', geometry: [c[3], c[0]] }] }] }));
  assert.equal(woods.length, 1); assert.equal(woods[0].length, 5, 'ein geschlossener Ring');
});

test('Drohne Nr. 7: Kalibrierung mit Ruhelage: losgelassen ist 0, Enden sind -1 und 1; Gas und alte Werte linear', async () => {
  const { calAxis } = await import('../src/gamepad.js');
  const c = [-0.8, 1, 0.05];   // Knüppel mit Feder, nach links weniger Weg
  assert.equal(calAxis(0.05, c), 0); assert.equal(calAxis(-0.8, c), -1); assert.equal(calAxis(1, c), 1);
  assert.ok(Math.abs(calAxis(0.525, c) - 0.5) < 1e-9);
  assert.equal(calAxis(-1, [-1, 1, -1]), -1); assert.equal(calAxis(0, [-1, 1, -1]), 0, 'Gas: Ruhe am Ende, linear');
  assert.ok(Math.abs(calAxis(0.1, [-0.8, 1]) - 0) < 1e-9, 'alte Kalibrierung ohne Ruhelage wie bisher');
});
