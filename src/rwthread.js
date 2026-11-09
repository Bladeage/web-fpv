/* Echte Welt, Prüfbericht Etappe 5: Hintergrund-Thread (Web Worker) im Browser anlegen und Aufträge abgeben.
   Eine einzige Datei ohne externe Quellen: Der Worker entsteht aus dem eigenen eingebetteten Script. Daraus nehmen wir nur
   die Module ohne DOM, die der Worker braucht, und ersetzen die großen eingebetteten Daten (Base64) durch Platzhalter.
   Geht das nicht (Entwicklung mit einzelnen Modulen, Sicherheitsregeln der Seite verbieten Worker aus „blob:“, alter
   Browser), bleibt rw.work leer und alles läuft wie bisher im Hauptprogramm. */
import { rw } from './realworld.js';
// rwworker.js: nur, damit der Build den Worker-Teil mitnimmt; wkMain läuft im Worker
import { wkMain } from './rwworker.js';

const WK_MODS = ['math.js', 'geo.js', 'rwwms.js', 'rwload.js', 'demap.js', 'rwdlm.js', 'rwroads.js', 'realworld.js', 'rwstore.js', 'rwworker.js'];
const wk = { w: null, seq: 0, wait: new Map(), dead: false };
// Quelltext des Workers aus dem Bundle (Abschnitte mit Kopfzeile je Datei, in Abhängigkeitsreihenfolge). Die Kopfzeile
// steht hier nur zusammengesetzt im Code, sonst würde dieser Text selbst als Abschnitt erkannt.
export function wkSource(all) {
  const parts = all.split(/(?=\/\* ----- src\/)/), pick = parts.filter(p => WK_MODS.some(n => p.startsWith('/* ----- src/' + n + ' -----')));
  if (pick.length !== WK_MODS.length) return null;
  return "'use strict';\n" + pick.join('').replace(/'[A-Za-z0-9+/=]{2000,}'/g, "'%%'") + '\nwkMain();\n';
}
function wkFail(why) {
  wk.dead = true; rw.work = null;
  if (wk.w) try { wk.w.terminate(); } catch (e) {}
  for (const f of wk.wait.values()) f.no(new Error('ohne Worker: ' + why), true);
  wk.wait.clear();
}
export function rwThreadInit() {
  if (wk.w || wk.dead || typeof Worker === 'undefined') return;
  try {
    const el = [...document.scripts].find(s => !s.src && s.textContent.includes('/* ----- src/' + 'rwworker.js ----- */'));
    const src = el && wkSource(el.textContent);
    if (!src) return;   // Entwicklung mit Modulen: ohne Worker
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    wk.w = new Worker(url);
    wk.w.onmessage = e => {
      const m = e.data;
      if (m.ready) { URL.revokeObjectURL(url); return; }
      const f = wk.wait.get(m.id);
      if (!f) return;
      if (m.say) { f.say(...m.say); return; }
      wk.wait.delete(m.id);
      if (m.err) f.no(new Error(m.err)); else f.ok(m.out);
    };
    wk.w.onerror = e => { e.preventDefault(); wkFail(e.message || 'Fehler'); };
    // Auftrag abgeben. Liefert das Ergebnis; scheitert der Worker selbst (nicht der Auftrag), wirft es mit e.noWorker,
    // dann rechnet der Aufrufer selbst.
    rw.work = (job, data, say = () => {}, signal) => new Promise((ok, no) => {
      if (wk.dead) { const e = new Error('ohne Worker'); e.noWorker = true; no(e); return; }
      const id = ++wk.seq;
      wk.wait.set(id, { ok, say, no: (e, dead) => { if (dead) e.noWorker = true; no(e); } });
      if (signal) { if (signal.aborted) { wk.wait.delete(id); no(new Error('Abgebrochen')); return; }
        signal.addEventListener('abort', () => { if (wk.wait.has(id)) { wk.w.postMessage({ cancel: id }); } }, { once: true }); }
      wk.w.postMessage({ id, job, ...data });
    });
  } catch (e) { wkFail(String(e && e.message || e)); }
}
