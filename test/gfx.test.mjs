// Grafik-Presets G1 (Prompt 193, docs/plan-grafik-presets.md): Foto 3D als viertes Preset, Stufen, Migration, Menü, Entscheidung Mesh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GFX_IDS, gfxLevel, cfgMigrate } from '../src/state.js';
import { i3sWanted } from '../src/rwmesh.js';
import { deLandAt, deSetMap } from '../src/demap.js';

test('Stufe je Preset: Foto 3D wie Schön, Unbekanntes wie Schön', () => {
  assert.deepEqual(['simple', 'mid', 'nice', 'mesh', 'quatsch', undefined].map(gfxLevel), [0, 1, 2, 2, 2, 2]);
});

test('Migration: gültige Werte bleiben, ungültige werden Schön, ohne Wert bleibt ohne', () => {
  for (const g of GFX_IDS) { const c = { gfx: g }; cfgMigrate(c); assert.equal(c.gfx, g); }
  const c = { gfx: 'quatsch' }; cfgMigrate(c); assert.equal(c.gfx, 'nice');
  const d = {}; cfgMigrate(d); assert.equal('gfx' in d, false);
});

test('Menü: Knöpfe der Grafik gleich GFX_IDS, Foto 3D vorn, eine Zeile mit vier Spalten', () => {
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8'), css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const box = html.slice(html.indexOf('id="gfxSeg"'), html.indexOf('</div>', html.indexOf('id="gfxSeg"')));
  assert.deepEqual([...box.matchAll(/data-gfx="([a-z]+)"/g)].map(m => m[1]), GFX_IDS);
  assert.ok(css.includes('#gfxSeg{grid-template-columns:repeat(4,1fr)}'));
});

test('Mesh nur mit Foto 3D (oder Diagnose), nur echte Welt, nicht DIS, nur NRW', () => {
  assert.equal(i3sWanted('nice', false, true, false, true), 'off');
  assert.equal(i3sWanted('mesh', false, false, false, false), 'map');
  assert.equal(i3sWanted('mesh', false, true, true, true), 'dis');
  assert.equal(i3sWanted('mesh', false, true, false, false), 'land');
  assert.equal(i3sWanted('mesh', false, true, false, true), 'on');
  assert.equal(i3sWanted('nice', true, true, false, true), 'on', 'Diagnose ?mesh=1');
  deSetMap(JSON.parse(readFileSync(new URL('../realworld/germany.json', import.meta.url), 'utf8')));
  // NRW-Erkennung über die Landesgrenzen (Mitte von Monschau, Köln in NRW; Hannover nicht)
  assert.equal(deLandAt(304700, 5604000), 'Nordrhein-Westfalen'); assert.equal(deLandAt(356560, 5645282), 'Nordrhein-Westfalen');
  assert.notEqual(deLandAt(550000, 5805000), 'Nordrhein-Westfalen');
});
