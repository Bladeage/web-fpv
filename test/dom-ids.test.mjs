// Jede Kennung, die der Code im Dokument sucht, muss es in src/index.html geben (Prompt 251). Fehlt eine, bricht das ganze Menü
// beim Start mit einem Fehler ab; das fällt in den Tests ohne Browser sonst nicht auf.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../src/', import.meta.url), html = readFileSync(new URL('index.html', dir), 'utf8');
const ids = new Set([...html.matchAll(/\bid="([\w-]+)"/g)].map(m => m[1]));

test('Kennungen in index.html sind eindeutig', () => {
  const all = [...html.matchAll(/\bid="([\w-]+)"/g)].map(m => m[1]), dup = all.filter((x, i) => all.indexOf(x) !== i);
  assert.deepEqual(dup, []);
});

test('Jede im Code gesuchte Kennung gibt es im Dokument', () => {
  const missing = [];
  for (const f of readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(/(?:\$|srcEl|getElementById)\('([\w-]+)'\)/g)) if (!ids.has(m[1])) missing.push(f + ': ' + m[1]);
  }
  assert.deepEqual([...new Set(missing)], []);
});
