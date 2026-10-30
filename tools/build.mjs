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

export function bundle() {
  const order = collectModules();
  const js = "'use strict';\n" + order.map(m => `/* ----- src/${m.file} ----- */\n${m.body}\n`).join('\n');
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
