// Build ohne Abhängigkeiten: src/ -> dist/fpvsim.html und dist/fpvsim.aspx.
// Aufruf: node tools/build.mjs
//
// Die Module in src/ sind ES-Module (für Node-Tests und Entwicklung im Browser).
// Der Build hängt sie in Abhängigkeitsreihenfolge zu einem einzigen Script zusammen:
// import-Zeilen fallen weg, "export " vor Deklarationen fällt weg.
// Regeln für die Module, die der Build prüft:
//   - nur "import { a, b } from './datei.js';" in einer Zeile, ohne "as"
//   - nur "export const|let|function|class name", kein "export default", kein "export { }"
//   - kein Name doppelt auf oberster Ebene über alle Module

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { toAspx, checkAspx } from './aspx.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*'\.\/([\w-]+\.js)';[ \t]*$/;
const DECL_RE = /^(export\s+)?(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/;

function readModule(file) {
  const text = readFileSync(join(SRC, file), 'utf8').replace(/\r\n?/g, '\n');
  const imports = [], exports = new Set(), names = [], body = [];
  text.split('\n').forEach((line, i) => {
    const where = `src/${file}:${i + 1}`;
    if (/^import\b/.test(line)) {
      const m = IMPORT_RE.exec(line);
      if (!m) throw new Error(`${where}: Import-Form nicht erlaubt: ${line}`);
      const list = m[1].split(',').map(s => s.trim()).filter(Boolean);
      if (list.some(n => !/^[A-Za-z_$][\w$]*$/.test(n))) throw new Error(`${where}: "as" oder ungültiger Name im Import`);
      imports.push({ from: m[2], names: list, where });
      return;
    }
    if (/^export\b/.test(line) && !/^export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s/.test(line)) {
      throw new Error(`${where}: Export-Form nicht erlaubt: ${line}`);
    }
    const d = DECL_RE.exec(line);
    if (d) { names.push(d[2]); if (d[1]) exports.add(d[2]); }
    body.push(line.replace(/^export\s+/, ''));
  });
  return { file, imports, exports, names, body: body.join('\n').trim() };
}

// Module ab main.js einsammeln, Abhängigkeiten zuerst (wie die ES-Modul-Auswertung).
export function collectModules(entry = 'main.js') {
  const mods = new Map(), order = [], visiting = new Set();
  const visit = file => {
    if (mods.has(file)) return;
    if (visiting.has(file)) return;   // Zyklus: wie bei ES-Modulen nicht erneut betreten
    visiting.add(file);
    const mod = readModule(file);
    for (const imp of mod.imports) visit(imp.from);
    mods.set(file, mod); order.push(mod);
  };
  visit(entry);
  // Prüfen: jeder importierte Name wird dort auch exportiert, kein Name doppelt.
  const owner = new Map();
  for (const mod of order) {
    for (const imp of mod.imports) {
      const src = mods.get(imp.from);
      for (const n of imp.names) if (!src.exports.has(n)) throw new Error(`${imp.where}: ${imp.from} exportiert "${n}" nicht`);
    }
    for (const n of mod.names) {
      if (owner.has(n)) throw new Error(`Name "${n}" doppelt: src/${owner.get(n)} und src/${mod.file}`);
      owner.set(n, mod.file);
    }
  }
  return order;
}

export function version() {
  try {
    const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return 'Version 1.' + git('rev-list', '--count', 'HEAD') + ' (' + git('log', '-1', '--format=%cd', '--date=format:%d.%m.%Y') + ', ' + git('rev-parse', '--short', 'HEAD') + ')';
  } catch (e) { return 'Version dev'; }
}
export function bundle() {
  const order = collectModules();
  let js = "'use strict';\n" + order.map(m => `/* ----- src/${m.file} ----- */\n${m.body}\n`).join('\n');
  // Betaflight (sitl/betaflight.wasm, GPLv3) als Base64 an Stelle des Platzhalters in src/bf.js
  // Gepackt (deflate, verlustfrei; Prüfbericht Nr. 9): 460 statt 170 KB vor Base64. Entpackt beim Start (bf.bfPrepare).
  const packed = f => "'" + deflateSync(readFileSync(f), { level: 9 }).toString('base64') + "'";
  if (js.includes("'%%BF_WASM%%'")) js = js.replace("'%%BF_WASM%%'", () => packed(join(ROOT, 'sitl/betaflight.wasm')));
  // Version: 1.<Anzahl Commits>, dazu Datum und Kurz-Hash des gebauten Commits. Zählt mit jedem Commit auf main hoch.
  // Ohne git (zum Beispiel ausgepacktes Archiv): „dev“. Die CI holt dafür die ganze Historie (fetch-depth: 0).
  // Echte Welt (realworld/, Geobasis NRW, dl-de/zero-2.0): Beschreibung, Höhen (deflate) und Luftbild als Base64
  const RW = join(ROOT, 'realworld', 'monschau');
  // Grundlage: Höhen, Luftbild, Gebäude (LoD2), Bäume, Gewässer, Kartenebenen. Das 3D-Mesh (-mesh.*) wird nicht eingebettet.
  if (js.includes("'%%RW_META%%'")) js = js.replace("'%%RW_META%%'", () => JSON.stringify(readFileSync(RW + '.json', 'utf8')))
    .replace("'%%RW_DGM%%'", () => "'" + readFileSync(RW + '.dgm').toString('base64') + "'")
    .replace("'%%RW_DOP%%'", () => "'" + readFileSync(RW + '.jpg').toString('base64') + "'")
    .replace("'%%RW_BLD%%'", () => "'" + readFileSync(RW + '.bld').toString('base64') + "'")
    .replace("'%%RW_TREES%%'", () => "'" + readFileSync(RW + '.trees').toString('base64') + "'")
    .replace("'%%RW_WATER%%'", () => "'" + readFileSync(RW + '.water').toString('base64') + "'")
    .replace("'%%RW_FARQ%%'", () => "'" + readFileSync(RW + '.far').toString('base64') + "'")
    .replace("'%%RW_FARDOP%%'", () => "'" + readFileSync(RW + '.far.jpg').toString('base64') + "'")
    .replace("'%%RW_FEATURES%%'", () => packed(RW + '.features.json'));   // Kartenebenen gepackt (109 statt 38 KB)
  // Deutschlandkarte (Ländergrenzen, BKG VG2500) für die Auswahl eines Ortes
  if (js.includes("'%%DE_MAP%%'")) js = js.replace("'%%DE_MAP%%'", () => packed(join(ROOT, 'realworld', 'germany.json')));   // gepackt, entpackt beim Start (demap.dePrepare)
  if (js.includes("'%%VERSION%%'")) js = js.replace("'%%VERSION%%'", () => JSON.stringify(version()));
  new vm.Script(js, { filename: 'fpvsim-bundle.js' });   // nur parsen: Syntaxfehler, doppelte let/const
  return { js, files: order.map(m => m.file) };
}

export function buildHtml() {
  const html = readFileSync(join(SRC, 'index.html'), 'utf8').replace(/\r\n?/g, '\n');
  const css = readFileSync(join(SRC, 'style.css'), 'utf8').replace(/\r\n?/g, '\n');
  const { js } = bundle();
  const LINK = '<link rel="stylesheet" href="style.css">';
  const SCRIPT = '<script type="module" src="main.js"></script>';
  if (!html.includes(LINK) || !html.includes(SCRIPT)) throw new Error('src/index.html: Platzhalter für Style oder Script fehlt');
  if (js.includes('</script')) throw new Error('Bundle enthält "</script" und würde das Script-Tag beenden');
  return html
    .replace(LINK, () => '<style>\n' + css + '</style>')
    .replace(SCRIPT, () => '<script>\n' + js + '</script>');
}

export function build(outDir = join(ROOT, 'dist')) {
  const html = buildHtml();
  const aspx = toAspx(html);
  checkAspx(aspx);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'fpvsim.html'), html, 'utf8');
  writeFileSync(join(outDir, 'fpvsim.aspx'), aspx, 'ascii');
  return { html, aspx, outDir };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = build();
  console.log(`dist/fpvsim.html ${Buffer.byteLength(r.html)} Bytes`);
  console.log(`dist/fpvsim.aspx ${r.aspx.length} Bytes, reines ASCII, kein "<%"`);
}
