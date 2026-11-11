// Regel aus CLAUDE.md (Aufräumen 11.11.2026): Module ohne DOM bleiben ohne DOM. Bisher prüfte das nur der Import in den Tests.
// Hier: kein document oder window im Code, und Importe nur aus anderen Modulen dieser Liste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const NO_DOM = ['math', 'format', 'state', 'world', 'physics', 'gamepad', 'scenario', 'drone', 'osd', 'signal', 'targets', 'vehicles', 'bf',
  'balloon', 'aircraft', 'town', 'eggs', 'birds', 'pilot', 'geo', 'realworld', 'rwload', 'rwdlm', 'rwworker', 'dis', 'distypes', 'verbund',
  'demap', 'ambient', 'daylight', 'roads', 'traffic', 'rwroads', 'boats', 'rwmesh', 'geosearch', 'rwwms', 'place', 'rwstore'];

test('Module ohne DOM: kein document, kein window, Importe nur untereinander', () => {
  for (const m of NO_DOM) {
    const src = readFileSync(new URL('../src/' + m + '.js', import.meta.url), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, "''");
    assert.ok(!/\b(document|window)\s*\./.test(code), m + '.js nutzt document oder window');
    for (const [, dep] of src.matchAll(/^import .* from '\.\/(\w+)\.js';$/gm)) assert.ok(NO_DOM.includes(dep), m + '.js importiert ' + dep + '.js (mit DOM)');
  }
});
