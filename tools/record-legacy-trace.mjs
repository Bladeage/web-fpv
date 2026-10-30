// Nimmt die Referenzdaten für test/legacy-parity.test.mjs aus legacy/fpv-sim-stufe1.html auf.
// Nicht Teil von Build und Tests. Braucht Playwright mit Chromium (nicht im Repo enthalten).
// Aufruf: node tools/record-legacy-trace.mjs [pfad/zur/seite.html]
// Ohne Pfad: legacy/fpv-sim-stufe1.html, Ausgabe nach test/fixtures/legacy-trace.json.
// Mit Pfad (zum Beispiel dist/fpvsim.html): Ausgabe nur auf stdout, zum Vergleichen.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { runScenarios, meshStats } from '../test/trace-scenario.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const page_ = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, 'legacy/fpv-sim-stufe1.html');
const { chromium } = createRequire(import.meta.url)('playwright');

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pathToFileURL(page_).href);
await page.waitForFunction(() => window.__fpv && window.__fpv.gates.length === 8);

const data = await page.evaluate(([scen, stats]) => {
  const runScenarios = eval('(' + scen + ')'), meshStats = eval('(' + stats + ')');
  const f = window.__fpv;
  const api = { sim: () => f.sim, state: () => f.state, setThrottle: v => { f.throttle = v; },
                inp: f.inp, cfg: f.cfg, gates: f.gates, step: f.step, respawn: f.respawn };
  const trace = runScenarios(api);
  const gates = f.gates.map(g => ({ c: g.c, yaw: g.yaw, n: g.n, r: g.r, start: g.start, count: g.count }));
  // Welt-Kennzahlen. Nur auf der Referenz-Seite erreichbar, weil dort alles global ist.
  let world = null;
  if (typeof buildWorld === 'function') {
    const cols = colliders.map(c => ({ c: c.c, h: c.h, cs: c.cs, sn: c.sn }));
    const w = buildWorld();   // füllt colliders/gates ein zweites Mal; Seite wird danach verworfen
    world = { colliders: cols, staticCount: w.staticCount, vertices: w.data.length/10, world: meshStats(w.data),
              drone: meshStats(buildDrone()), blade: meshStats(buildBlade()), disc: meshStats(buildDisc()) };
  }
  return { trace, gates, world };
}, [runScenarios.toString(), meshStats.toString()]);
await browser.close();
if (errors.length) { console.error('Seitenfehler:', errors); process.exit(1); }

const out = {
  note: 'Referenz aus legacy/fpv-sim-stufe1.html, aufgenommen mit tools/record-legacy-trace.mjs in Chromium. Gilt, solange die Physik unverändert ist (bis E1/E2).',
  legacySha256: createHash('sha256').update(readFileSync(join(ROOT, 'legacy/fpv-sim-stufe1.html'))).digest('hex'),
  ...data
};
if (process.argv[2]) {
  process.stdout.write(JSON.stringify(out));
} else {
  mkdirSync(join(ROOT, 'test/fixtures'), { recursive: true });
  writeFileSync(join(ROOT, 'test/fixtures/legacy-trace.json'), JSON.stringify(out) + '\n');
  console.log('test/fixtures/legacy-trace.json geschrieben');
}
