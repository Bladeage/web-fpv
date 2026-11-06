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
  assert.match(aspx.toString('ascii'), /N&#xF6;tige Treffer/);
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
  // Python ersetzt Umlaute im <style> als HTML-Entity (in CSS falsch); der Node-Port nutzt CSS-Escapes. Style-Block ausnehmen.
  const noStyle = t => t.replace(/<style>[\s\S]*?<\/style>/, '<style></style>');
  assert.equal(noStyle(readFileSync(join(dir, 'out.aspx'), 'ascii')), noStyle(toAspx(html)));
});

test('Prüfbericht Nr. 9: Betaflight, Deutschlandkarte und Kartenebenen gepackt eingebettet, verlustfrei', async (t) => {
  const { inflateSync } = await import('node:zlib');
  const dir = mkdtempSync(join(tmpdir(), 'fpvsim-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  build(dir);
  const html = readFileSync(join(dir, 'fpvsim.html'), 'utf8'), root = new URL('../', import.meta.url);
  const back = re => inflateSync(Buffer.from(html.match(re)[1], 'base64'));
  assert.ok(back(/const BF_WASM = '([^']+)'/).equals(readFileSync(new URL('sitl/betaflight.wasm', root))), 'Betaflight gleich');
  assert.ok(back(/const DE_DATA = '([^']+)'/).equals(readFileSync(new URL('realworld/germany.json', root))), 'Karte gleich');
  assert.ok(back(/features: '([^']+)'/).equals(readFileSync(new URL('realworld/monschau.features.json', root))), 'Kartenebenen gleich');
  assert.ok(html.length < 7.7e6, 'Datei ' + (html.length/1e6).toFixed(2) + ' MB (vorher 8,04 MB)');
});
