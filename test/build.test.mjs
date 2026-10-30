// Build und ASPX-Konverter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { build } from '../tools/build.mjs';
import { toAspx } from '../tools/aspx.mjs';

test('Build erzeugt fpvsim.html und fpvsim.aspx', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'fpvsim-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  build(dir);
  const html = readFileSync(join(dir, 'fpvsim.html'), 'utf8');
  const aspx = readFileSync(join(dir, 'fpvsim.aspx'));
  // eine Datei ohne externe Quellen
  assert.doesNotMatch(html, /<link\b|<script\b[^>]*\bsrc=|type="module"/);
  assert.doesNotMatch(html, /^\s*(import|export)\b/m);
  assert.match(html, /window\.__fpv = /);
  const js = html.match(/<script>([\s\S]*)<\/script>/)[1];
  assert.doesNotThrow(() => new vm.Script(js));
  // ASPX: reines ASCII, kein "<%", CRLF
  assert.ok(aspx.every(b => b < 128), 'nur ASCII');
  assert.ok(!aspx.toString('ascii').includes('<%'));
  assert.match(aspx.toString('ascii'), /Motorger&#xE4;usch/);
  assert.match(aspx.toString('ascii'), /'Zeit l\\u00E4uft'/);
});

test('Konverter: Umlaute je nach Teil richtig ersetzt', () => {
  const src = '<p>Grüße</p><style>a::after{content:"ä"}</style><script>s="ö😀";</script>\n';
  assert.equal(toAspx(src), '<p>Gr&#xFC;&#xDF;e</p><style>a::after{content:"\\0000E4"}</style><script>s="\\u00F6\\uD83D\\uDE00";</script>\r\n');
});

test('Konverter bricht bei "<%" ab', () => {
  assert.throws(() => toAspx('<p><% x %></p>'), /<%/);
  assert.throws(() => toAspx('<script>a="<%"</script>'), /<%/);
});

test('Konverter liefert dasselbe wie tools/to_aspx.py', (t) => {
  let py = 'python3';
  try { execFileSync(py, ['--version']); } catch (e) { t.skip('python3 nicht vorhanden'); return; }
  const dir = mkdtempSync(join(tmpdir(), 'fpvsim-py-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const html = build(join(dir, 'dist')).html;
  writeFileSync(join(dir, 'in.html'), html, 'utf8');
  execFileSync(py, [new URL('../tools/to_aspx.py', import.meta.url).pathname, join(dir, 'in.html'), join(dir, 'out.aspx')]);
  assert.ok(readFileSync(join(dir, 'out.aspx')).equals(Buffer.from(toAspx(html), 'ascii')));
});
