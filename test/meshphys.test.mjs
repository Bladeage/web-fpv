// Kollision aus dem 3D-Mesh (Foto 3D, M2; Prompt 194/195). Künstliches Mesh-Teil auf dem freien Feld am Startplatz von Monschau:
// ebener Boden auf Höhe des Geländes und ein Haus 10 x 10 x 8 m, das es in LoD2 dort nicht gibt. Die Physik muss dem Mesh folgen.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { cfg, game } from '../src/state.js';
import { buildWorld } from '../src/world.js';
import { STEP, step, respawn, hoverThrottle, physGroundH } from '../src/physics.js';
import { setScenario } from '../src/scenario.js';
import { rw, rwApply, groundH, placeReal } from '../src/realworld.js';
import { i3sPhysBuild, i3sGroundAt, i3sTrisNear } from '../src/rwmesh.js';

buildWorld();
const f = n => readFileSync(new URL('../realworld/monschau.' + n, import.meta.url)), meta = JSON.parse(f('json')), q = inflateSync(f('dgm'));
const un = n => { const b = inflateSync(f(n)); return new Int16Array(b.buffer, b.byteOffset, b.byteLength/2); };
rwApply({ meta, q: new Uint16Array(q.buffer, q.byteOffset, q.byteLength/2), b16: un('bld'), t16: un('trees') }, { water: new Uint8Array(inflateSync(f('water'))) });
rw.ready = true;
after(() => { rw.meshPhys = null; rw.on = false; setScenario('gates'); cfg.dmg = 'off'; });

// Teil: Mitte am Startplatz, Boden lokal h = 0 auf Geländehöhe; Haus 15 bis 25 m östlich, 5 m nach Nord und Süd
const o = { ec: (meta.bbox[0] + meta.bbox[2])/2, nc: (meta.bbox[1] + meta.bbox[3])/2, h: meta.hHome }, home = meta.home;
rw.on = true; const g0 = groundH(home[0], home[1]); rw.on = false;
const c = [o.ec + home[0], o.nc - home[1], o.h + g0], P = [];
const tri = (a, b, d) => P.push(...a, ...b, ...d), quad = (a, b, d, e) => { tri(a, b, d); tri(a, d, e); };
quad([-40, -40, 0], [40, -40, 0], [40, 40, 0], [-40, 40, 0]);   // Boden (Ost, Nord, Höhe)
quad([15, -5, 8], [25, -5, 8], [25, 5, 8], [15, 5, 8]);           // Dach
for (const [a, b] of [[[15, -5], [25, -5]], [[25, -5], [25, 5]], [[25, 5], [15, 5]], [[15, 5], [15, -5]]]) quad([...a, 0], [...b, 0], [...b, 8], [...a, 8]);   // Wände
const node = { c, r: 60, st: 'ready', phys: i3sPhysBuild(new Float32Array(P), P.length/3) };
const L = [node], buf = [];
const meshPhys = { ground: (x, z) => i3sGroundAt(L, x, z, o), covered: (x, z) => i3sGroundAt(L, x, z, o) === i3sGroundAt(L, x, z, o),
  near: (x, z, R) => { const T = i3sTrisNear(L, x, z, R, o, buf); return { T, tris: Array.from({ length: T.length/9 }, (_, i) => i) }; } };
const hx = home[0] + 20, hz = home[1];   // Hausmitte in Kartenkoordinaten (Nord = -z)

test('Raster und steile Dreiecke: Dach 8 m, Boden 0, acht Wanddreiecke, außerhalb keine Abdeckung', () => {
  assert.equal(node.phys.steep.length/9, 8, 'acht Wanddreiecke');
  assert.ok(Math.abs(i3sGroundAt(L, hx, hz, o) - (g0 + 8)) < 0.01, 'Dach');
  assert.ok(Math.abs(i3sGroundAt(L, home[0] - 10, home[1], o) - g0) < 0.01, 'Boden');
  assert.ok(Number.isNaN(i3sGroundAt(L, home[0] + 200, home[1], o)), 'außerhalb');
  assert.equal(i3sTrisNear(L, home[0] + 14, hz, 2, o, []).length/9, 2, 'an der Westwand nur ihre zwei Dreiecke');
  assert.equal(i3sTrisNear(L, home[0] - 20, hz, 2, o, []).length, 0, 'weit weg keine');
});

test('Physik folgt dem Mesh: Boden aus dem Raster, Landung auf dem Mesh-Dach (LoD2 hat dort nichts)', () => {
  cfg.dmg = 'off'; cfg.mode = 'angle'; setScenario('real', true); rw.meshPhys = meshPhys; respawn();
  const s = game.sim;
  assert.ok(Math.abs(physGroundH(hx, hz) - (g0 + 8)) < 0.01 && Math.abs(groundH(hx, hz) - g0) < 1, 'Physik-Boden 8 m höher als das Gelände');
  s.p = [hx, g0 + 8 + 1.5, hz]; s.v = [0, 0, 0]; s.w = [0, 0, 0]; s.q = [0, 0, 0, 1]; game.throttle = 0;
  for (let i = 0; i < 3/STEP && game.state === 'fly'; i++) step(STEP);
  assert.equal(game.state, 'fly');
  const above = s.p[1] - (g0 + 8); assert.ok(above > -0.05 && above < 0.4, 'liegt auf dem Mesh-Dach: ' + above.toFixed(2) + ' m');
  rw.meshPhys = null;
});

for (const [name, v] of [['langsam', 5], ['sehr schnell (kein Durchtunneln)', 40]]) {
  test('Physik folgt dem Mesh: Flug gegen die Mesh-Wand, ' + name, () => {
    cfg.dmg = 'off'; cfg.mode = 'angle'; setScenario('real', true); rw.meshPhys = meshPhys; respawn();
    const s = game.sim, wallX = home[0] + 15;
    s.p = [wallX - 4, g0 + 3, hz]; s.v = [v, 0, 0]; s.w = [0, 0, 0]; s.q = [0, 0, 0, 1]; game.throttle = hoverThrottle();
    let maxX = -Infinity;
    for (let i = 0; i < 1/STEP && game.state === 'fly'; i++) { step(STEP); maxX = Math.max(maxX, s.p[0]); }
    assert.equal(game.state, 'fly'); assert.ok(maxX < wallX + 0.05, 'nie hindurch: ' + (maxX - wallX).toFixed(2) + ' m');
    rw.meshPhys = null;
  });
}

test('Ohne Mesh wie bisher: Boden aus dem Geländemodell', () => {
  rw.meshPhys = null; rw.on = true;
  assert.equal(physGroundH(hx, hz), groundH(hx, hz));
  rw.on = false;
});

test('Platzierungsdienst sieht das Mesh: Boden aus dem Raster, kein Platz in der Mesh-Wand, frei daneben', () => {
  rw.on = true; rw.meshPhys = meshPhys;
  const W = placeReal();
  assert.ok(Math.abs(W.groundH(hx, hz) - (g0 + 8)) < 0.01, 'Boden auf dem Mesh-Dach');
  assert.equal(W.free([home[0] + 15, g0 + 3, hz], 1), false, 'in der Westwand nicht frei');
  assert.equal(W.free([home[0] + 10, g0 + 3, hz], 1), true, '5 m davor frei');
  assert.equal(W.free([hx, g0 + 8.5, hz], 1), false, 'im Dach nicht frei');
  rw.meshPhys = null; rw.on = false;
});
