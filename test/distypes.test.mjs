// VBS-Grundtypen (vorgebaut): Zuordnung nach DIS-Entitätsart, lokale Tabelle, Modelle, Aufstellung der Vorschau
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIS_BASE, disBaseOf, disBaseTable, disBaseMesh, disBaseInfo, disPreviewLayout, DIS_PREVIEW } from '../src/distypes.js';
import { DIS_FPV } from '../src/dis.js';
import { buildWorld, colliders } from '../src/world.js';
import { town } from '../src/town.js';

test('Grundtypen: 18 Stück, eindeutig, mit Namen und Maßen', () => {
  assert.equal(DIS_BASE.length, 18);
  assert.equal(new Set(DIS_BASE.map(b => b.id)).size, 18);
  for (const b of DIS_BASE) assert.ok(b.name && b.size.every(x => x > 0), b.id);
});

test('Grundtypen: Zuordnung nach Kind, Domain und Kategorie (auch die Einheiten aus dem VBS-Mitschnitt)', () => {
  const T = t => disBaseOf(t);
  // im Mitschnitt von k5.2 (07.11.2026): Hubschrauber, Radpanzer, Person
  assert.equal(T([1, 2, 78, 21, 1, 1, 0]), 'ths');
  assert.equal(T([1, 1, 78, 3, 10, 0, 0]), 'tpz');
  assert.equal(T([3, 1, 222, 11, 35, 0, 0]), 'person');
  // unsere Drohne und der Rückfallwert: Multikopter; andere unbemannte Luftfahrzeuge: Fläche
  assert.equal(T(DIS_FPV.type), 'uavm'); assert.equal(T(DIS_FPV.fallback), 'uavm'); assert.equal(T([1, 2, 225, 50, 3, 0, 0]), 'uavf');
  assert.equal(T([1, 1, 78, 1, 2, 0, 0]), 'kpz'); assert.equal(T([1, 1, 78, 2, 5, 0, 0]), 'spzr'); assert.equal(T([1, 1, 78, 4, 1, 0, 0]), 'art');
  assert.equal(T([1, 1, 78, 28, 1, 0, 0]), 'flak'); assert.equal(T([1, 1, 78, 6, 1, 0, 0]), 'pkw'); assert.equal(T([1, 1, 78, 7, 1, 0, 0]), 'lkw');
  assert.equal(T([1, 2, 78, 20, 1, 0, 0]), 'khs'); assert.equal(T([1, 2, 78, 1, 1, 0, 0]), 'flz'); assert.equal(T([1, 3, 78, 7, 1, 0, 0]), 'boot');
  assert.equal(T([1, 1, 78, 77, 0, 0, 0]), 'other', 'unbekannte Kategorie: Quader'); assert.equal(T([2, 2, 0, 1, 0, 0, 0]), 'other', 'Munition');
});

test('Grundtypen: lokale Tabelle (nur private/) geht vor, falsche Zeilen werden übergangen', () => {
  const tab = disBaseTable('# Land.Kategorie.Unterkategorie=Grundtyp\n78.2.1=spzk\n78.3.8 = pio\n78.2.x=kpz\n78.2.9=gibtsnicht\n');
  assert.equal(tab.size, 2);
  assert.equal(disBaseOf([1, 1, 78, 2, 1, 0, 0], tab), 'spzk', 'Kette statt Vorgabe Rad');
  assert.equal(disBaseOf([1, 1, 78, 3, 8, 0, 0], tab), 'pio');
  assert.equal(disBaseOf([1, 1, 78, 2, 2, 0, 0], tab), 'spzr', 'nicht in der Tabelle: Regel');
});

test('Grundtypen: Modelle vorhanden, innerhalb der Maße, Mitte am Boden', () => {
  for (const b of [...DIS_BASE, disBaseInfo('other')]) {
    const v = disBaseMesh(b.id);
    assert.ok(v.length > 0 && v.length % 30 === 0, b.id);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < v.length; i += 10) { x0 = Math.min(x0, v[i]); x1 = Math.max(x1, v[i]); y0 = Math.min(y0, v[i + 1]); y1 = Math.max(y1, v[i + 1]); z0 = Math.min(z0, v[i + 2]); z1 = Math.max(z1, v[i + 2]); }
    const x = (x1 - x0)/2, z = (z1 - z0)/2;   // halbe Ausdehnung (Rohr ragt nur nach vorn)
    const [L, W, H] = b.size, gunOrRotor = ['kpz', 'art', 'spzk', 'spzr', 'flak', 'khs', 'ths', 'pio'].includes(b.id) ? 1.6 : 1.15;
    assert.ok(y0 >= -0.01 && y1 <= H*1.25 + 0.5, b.id + ' Höhe ' + y0.toFixed(2) + '..' + y1.toFixed(2));
    assert.ok(Math.max(x*2, z*2) <= Math.max(L, W)*gunOrRotor + 0.5, b.id + ' Größe');
  }
});

test('Vorschau: 23 Modelle auf freier Fläche (keine Hindernisse), Start frei', () => {
  buildWorld();
  const all = [...colliders, ...town], L = disPreviewLayout();
  assert.equal(L.length, 23);
  assert.ok(DIS_BASE.every(b => L.some(it => it.id === b.id)), 'jeder Grundtyp einmal zu sehen');
  for (const p of [...L, { id: 'person', x: DIS_PREVIEW.home[0], z: DIS_PREVIEW.home[1] }]) {
    const s = disBaseInfo(p.id).size, hx = (p.id === 'khs' || p.id === 'ths' ? s[0] : s[1])/2 + 1, hz = s[0]/2 + 1;
    assert.ok(!all.some(o => Math.abs(o.c[0] - p.x) < o.h[0] + hx && Math.abs(o.c[2] - p.z) < o.h[2] + hz), p.id + ' bei ' + p.x + ', ' + p.z);
  }
});
