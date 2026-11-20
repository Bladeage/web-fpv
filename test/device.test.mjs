// Geräteprofil (G3, Prompt 213/214): Stufe aus den Gerätedaten, Grenzen je Wahl, Anwenden, Ruckelschutz, volle Kachelliste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devGpuClass, devLevel, devProfile, devApply, devAdapt, devText, dev, DEV_LEVELS } from '../src/device.js';
import { RW_STREAM, rw, rwStreamPlan } from '../src/realworld.js';
import { I3S } from '../src/rwmesh.js';
import { RW_CAP } from '../src/rwstore.js';

const PC = { coarse: false, mem: 0, cores: 16, gpu: 'NVIDIA GeForce RTX 4080' };

test('Grafikkarte aus dem Namen', () => {
  assert.equal(devGpuClass('NVIDIA GeForce RTX 4080'), 2);
  assert.equal(devGpuClass('NVIDIA GeForce GTX 980, or similar'), 2, 'Firefox meldet vereinfacht');
  assert.equal(devGpuClass('AMD Radeon RX 6700 XT'), 2);
  assert.equal(devGpuClass('Apple M2 Pro'), 2);
  assert.equal(devGpuClass('Intel(R) UHD Graphics 620'), 1);
  assert.equal(devGpuClass('Intel(R) HD Graphics, or similar'), 1);
  assert.equal(devGpuClass(''), 1, 'unbekannt: Mittel');
  assert.equal(devGpuClass('Google SwiftShader'), 0);
  assert.equal(devGpuClass('Adreno (TM) 740'), 0);
});

test('Stufe aus den Gerätedaten', () => {
  assert.equal(devLevel(PC), 2);
  assert.equal(devLevel({ ...PC, coarse: true }), 0, 'Touch wie LOW_MEM');
  assert.equal(devLevel({ ...PC, mem: 4 }), 0, 'höchstens 4 GB wie LOW_MEM');
  assert.equal(devLevel({ ...PC, mem: 8, gpu: 'Intel(R) Iris(R) Xe Graphics' }), 1);
  assert.equal(devLevel({ ...PC, cores: 2 }), 0);
});

test('Grenzen je Wahl: Sparsam, Automatisch, Viel', () => {
  const q = 200e9;   // 200 GB Platz für die Seite
  const a = devProfile(PC, 'auto', q), l = devProfile(PC, 'low', q), h = devProfile(PC, 'high', q);
  assert.deepEqual([l.lv, a.lv, h.lv], [1, 2, 3]);
  assert.deepEqual([l.tileMB, l.meshMB], [400, 500], 'Sparsam: Browser-Speicher wie vor G3');
  assert.deepEqual([a.tileMB, a.meshMB], [4000, 4000], 'Automatisch: 20 %, höchstens 4 GB');
  assert.deepEqual([h.tileMB, h.meshMB], [16000, 16000], 'Viel: 35 %, höchstens 16 GB');
  const small = devProfile(PC, 'auto', 1e9);   // 1 GB Platz: nie unter die Werte vor G3
  assert.deepEqual([small.tileMB, small.meshMB], [400, 500]);
  const phone = devProfile({ ...PC, coarse: true }, 'auto', 0);
  assert.equal(phone.lv, 0); assert.equal(phone.meshMB, 150); assert.equal(phone.texMax, 1024);
  assert.equal(devProfile({ ...PC, coarse: true }, 'low').lv, 0, 'nie unter Stufe 0');
  assert.equal(devProfile(PC, 'high', 0).tileMB, 400, 'Platz unbekannt: Werte vor G3');
  // Stufen wachsen
  for (let i = 1; i < DEV_LEVELS.length; i++) for (const k of ['tiles', 'drop', 'gpuMB', 'maxNodes', 'keep']) assert.ok(DEV_LEVELS[i][k] >= DEV_LEVELS[i - 1][k], k + ' Stufe ' + i);
});

test('Anwenden und Ruckelschutz', () => {
  const keep = { ...RW_STREAM }, keepI = { ...I3S }, keepC = { ...RW_CAP };
  try {
    const p = devApply(PC, 'auto', 200e9);
    assert.equal(RW_STREAM.max, p.tiles); assert.equal(RW_STREAM.drop, p.drop);
    assert.equal(I3S.gpuMB, p.gpuMB); assert.equal(I3S.maxNodes, p.maxNodes); assert.equal(I3S.keep, p.keep); assert.equal(I3S.texMax, undefined);
    assert.equal(RW_CAP.tileMB, 4000); assert.equal(RW_CAP.meshMB, 4000);
    assert.match(devText(), /Stufe Stark .*24 Kacheln.*3,5 km.*1,0 GB Grafik.*Kacheln 4,0 GB/);
    assert.equal(devAdapt(true), true);
    assert.equal(RW_STREAM.max, 14); assert.equal(RW_STREAM.drop, 2625);
    assert.equal(devAdapt(true), false, 'nur bei Wechsel');
    assert.match(devText(), /Ruckelschutz aktiv/);
    devAdapt(false);
    assert.equal(RW_STREAM.max, p.tiles); assert.equal(RW_STREAM.drop, p.drop);
    devApply({ ...PC, coarse: true }, 'auto', 0);
    assert.equal(I3S.texMax, 1024); assert.equal(RW_STREAM.max, 8);
    devAdapt(true);
    assert.equal(RW_STREAM.max, 8, 'mindestens 8'); assert.equal(RW_STREAM.drop, 1600, 'mindestens 1,6 km');
  } finally { Object.assign(RW_STREAM, keep); Object.assign(I3S, keepI); Object.assign(RW_CAP, keepC); dev.p = null; dev.cut = false; }
});

test('Volle Kachelliste: die fernste Kachel geht, statt nichts zu laden', () => {
  const keep = { ...RW_STREAM }, size = rw.size, far = rw.far;
  try {
    rw.size = 1000; rw.far = null; rw.tiles.clear(); rw.tileFail.clear();
    Object.assign(RW_STREAM, { max: 3, drop: 10000 });
    for (const [i, j] of [[-2, 0], [-3, 0], [0, 2]]) rw.tiles.set(i + ',' + j, { i, j });
    const p = rwStreamPlan(260, 0);
    assert.deepEqual(p.next, [1, 0], 'nächste fehlende Kachel östlich');
    assert.deepEqual(p.drop, ['-3,0'], 'die fernste geht');
    // alle Kacheln nah (näher als near): nichts entladen, nichts laden
    rw.tiles.clear(); RW_STREAM.max = 1;
    rw.tiles.set('0,1', { i: 0, j: 1 });   // 240 m entfernt
    const q = rwStreamPlan(260, 260);
    assert.equal(q.next, null); assert.deepEqual(q.drop, []);
    // Platz frei: wie bisher
    rw.tiles.clear();
    assert.deepEqual(rwStreamPlan(260, 0), { next: [1, 0], drop: [] });
  } finally { Object.assign(RW_STREAM, keep); rw.size = size; rw.far = far; rw.tiles.clear(); }
});
