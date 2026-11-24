// Etappe F4: Versionshinweise im Programm und im Repository sind gleich; jede Quelle der Liste hat einen Vermerk und steht auf der Seite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NOTES, CREDITS, creditRows } from '../src/notes.js';
import { RW_SOURCES } from '../src/rwload.js';

test('Versionshinweise: docs/versionshinweise.md hat dieselben Überschriften und Punkte wie das Programm', () => {
  const md = readFileSync(new URL('../docs/versionshinweise.md', import.meta.url), 'utf8');
  const fromMd = md.split(/^## /m).slice(1).map(b => { const L = b.trim().split('\n'); return [L[0], L.filter(l => l.startsWith('- ')).map(l => l.slice(2))]; });
  assert.deepEqual(fromMd, NOTES);
});

test('Quellen und Lizenzen: jede mitgelieferte Quelle hat einen Vermerk und erscheint; feste Quellen vollständig', () => {
  for (const s of RW_SOURCES) assert.ok(s.attribution && s.attribution.length > 5, 'Vermerk fehlt: ' + s.name);
  const rows = creditRows(RW_SOURCES);
  for (const s of RW_SOURCES) assert.ok(rows.some(r => r[0] === s.name && r[1] === s.attribution), s.name);
  const all = rows.map(r => r.join(' ')).join('\n');
  for (const need of ['GPLv3', 'Betaflight', 'OpenStreetMap', 'ODbL', 'Nominatim', 'Copernicus', 'BKG', 'Geobasis NRW', 'Mapzen']) assert.ok(all.includes(need), need + ' fehlt');
  assert.ok(CREDITS.every(r => r.length === 2 && r[0] && r[1]));
});
