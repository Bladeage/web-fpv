/* Echte Welt, Prüfbericht Etappe 5: Rechenarbeit im Hintergrund (Web Worker), damit das Bild beim Nachladen nicht ruckelt.
   Ohne DOM. Läuft im Worker, nicht im Hauptprogramm: rwthread.js baut den Worker aus dem eigenen Script (nur die Module
   ohne DOM, ohne die großen eingebetteten Daten) und ruft am Ende wkMain() auf.
   Aufträge (Nachricht { id, job, ... }), Antwort { id, out } oder { id, err }, Zwischenstand { id, say: [Text, Anteil] }:
   - 'area': rwload.rwFetchArea im Worker, mit eigenen Abrufen (rwNet mit Zeitgrenze) und eigenem Zugriff auf den
     Zwischenspeicher der Gebäudekacheln (rwstore, IndexedDB gibt es auch im Worker). Die großen Texte der Gebäudekacheln
     (bis 70 MB je km²) bleiben so ganz im Worker; zurück kommen nur die gepackten Felder.
   - 'modelMesh': realworld.rwModelMesh für eine Kachel (Gebäude und Bäume, bis 160 ms in der Innenstadt).
   Abbruch: Nachricht { cancel: id }. */
import { rwFetchArea } from './rwload.js';
import { rwNet, rwModelMesh } from './realworld.js';
import { RW_STORE } from './rwstore.js';

// Felder eines Ergebnisses, die ohne Kopie zurückgehen (jeder Speicherblock nur einmal)
export function wkTransfer(...xs) {
  const s = new Set();
  for (const x of xs) if (x && x.buffer && x.buffer.byteLength) s.add(x.buffer);
  return [...s];
}
export async function wkRun(m, signal, post) {
  if (m.job === 'area') {
    const { get, text } = rwNet(signal), opt = { ...m.opt, async: false };
    if (m.opt.lod2) opt.lod2Cache = { get: RW_STORE.lod2, put: RW_STORE.lod2Put };
    const p = await rwFetchArea(m.a, m.srcs, get, text, (t, f) => post({ id: m.id, say: [t, f] }), opt);
    if (signal.aborted) throw new Error('Abgebrochen');
    return { out: p, tr: wkTransfer(p.q, p.b16, p.t16, p.dop, p.far && p.far.q, p.far && p.far.dop) };
  }
  if (m.job === 'modelMesh') { const v = rwModelMesh(m.S); return { out: v, tr: [v.buffer] }; }
  throw new Error('Unbekannter Auftrag ' + m.job);
}
export function wkMain() {
  const run = new Map();
  onmessage = async e => {
    const m = e.data;
    if (m.cancel) { const c = run.get(m.cancel); if (c) c.abort(); return; }
    const ac = new AbortController(); run.set(m.id, ac);
    try { const { out, tr } = await wkRun(m, ac.signal, x => postMessage(x)); postMessage({ id: m.id, out }, tr); }
    catch (err) { postMessage({ id: m.id, err: String(err && err.message || err) }); }
    finally { run.delete(m.id); }
  };
  postMessage({ ready: true });
}
