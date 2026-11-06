/* Quellen für „Echte Welt“ (Etappe L3): Liste (Vorlagen und eigene), Formular, Prüfen, Import und Export.
   Eigene Quellen liegen in cfg.rwSources (Browser-Speicher) und gelten vor den Vorlagen (rw.userSources). */
import { cfg, saveCfg } from './state.js';
import { rw, rwNet, rwSources, rwLandData, rwLandHas } from './realworld.js';
import { RW_STORE, storeAll, storeDel, storeAreaDel, storeUsage } from './rwstore.js';
import { RW_SOURCES, rwCheckSource, rwSourcesParse } from './rwload.js';
import { deMap } from './demap.js';
import { toUtm, fromUtm } from './geo.js';
import { parseLatLon } from './format.js';

const srcEl = id => document.getElementById(id);
const SRC = { show: null, fit: () => {}, edit: -1, busy: null };
const SRC_FIELDS = [['sfName', 'name'], ['sfLand', 'land'], ['sfCrs', 'crs'], ['sfDgm', 'dgm.url'], ['sfDgmC', 'dgm.coverage'], ['sfDom', 'dom.url'], ['sfDomC', 'dom.coverage'],
  ['sfDop', 'dop.url'], ['sfDopL', 'dop.layer'], ['sfLod', 'lod2.url'], ['sfLodK', 'lod2.tileKm'], ['sfAttr', 'attribution']];
const srcGetP = (o, p) => p.split('.').reduce((x, k) => x && x[k], o);

// Eigene Quellen in die Laufzeit übernehmen und speichern
export function srcApply() { rw.userSources = (cfg.rwSources || []).map((s, i) => ({ ...s, id: s.id || 'eigen-' + i })); }
function srcStore() { saveCfg(); srcApply(); }

function srcList() {
  const box = srcEl('srcList'); box.textContent = '';
  const row = (s, label, btn, fn) => {
    const r = document.createElement('div'); r.className = 'srcrow';
    const t = document.createElement('div'), b = document.createElement('b'), sm = document.createElement('small');
    b.textContent = s.name; sm.textContent = label; t.append(b, sm);
    const k = document.createElement('button'); k.className = 'secondary'; k.textContent = btn; k.addEventListener('click', fn);
    r.append(t, k); box.append(r);
  };
  (cfg.rwSources || []).forEach((s, i) => row(s, (s.land || 'ohne Land') + ' · eigene', 'Bearbeiten', () => srcForm(i)));
  for (const s of RW_SOURCES) row(s, s.land + ' · Vorlage', 'Kopie', () => { cfg.rwSources = [...(cfg.rwSources || []), { ...JSON.parse(JSON.stringify(s)), id: undefined, box: undefined, name: s.name + ' (Kopie)' }]; srcStore(); srcForm(cfg.rwSources.length - 1); });
  if (!(cfg.rwSources || []).length) srcEl('srcMsg').textContent ||= 'Noch keine eigenen Quellen. „Neu“ legt eine an; „Kopie“ übernimmt die NRW-Vorlage als Muster.';
}
export function srcOpen() { srcEl('srcMsg').textContent = ''; srcList(); srcStoreFill(); SRC.show('sources'); }
// Speicher (L4): Landesdaten je Quelle mit Basis-DLM (einmal laden oder löschen), gespeicherte Orte (löschen), belegter Platz
async function srcStoreFill() {
  const box = srcEl('srcStore'), rows = [];
  const row = (title, label, btn, fn) => {
    const r = document.createElement('div'); r.className = 'srcrow';
    const t = document.createElement('div'), b = document.createElement('b'), sm = document.createElement('small');
    b.textContent = title; sm.textContent = label; t.append(b, sm);
    const k = document.createElement('button'); k.className = 'secondary'; k.textContent = btn; k.addEventListener('click', () => fn(k));
    r.append(t, k); rows.push(r);
  };
  const seen = new Set();
  for (const s of rwSources().filter(x => x.dlm && !seen.has(x.dlm.url) && seen.add(x.dlm.url))) {   // je Paket einmal
    const has = await rwLandHas(s, RW_STORE), keys = [s.dlm.water, ...s.dlm.places].map(f => s.dlm.url + ':' + f);
    row('Gewässer und Ortsnamen ' + (s.land || s.name), has ? 'gespeichert (Basis-DLM)' : 'einmalig etwa ' + s.dlm.mb + ' MB, danach auch offline', has ? 'Löschen' : 'Laden',
      has ? async () => { for (const k of keys) await storeDel('land', k); srcStoreFill(); } : k => srcLand(s, k));
  }
  for (const x of (await storeAll('info')).sort((a, b) => b.date - a.date))
    row(x.place, (x.size/1e6).toFixed(0) + ' MB · ' + new Date(x.date).toLocaleDateString('de-DE') + (x.water ? ' · mit Gewässern' : ''), 'Löschen', async () => { await storeAreaDel(x.key); srcStoreFill(); });
  box.textContent = ''; box.append(...rows);
  const u = await storeUsage();
  srcEl('srcUse').innerHTML = '<b>Speicher im Browser</b>' + (u && u.usage ? ': ' + (u.usage/1e6).toFixed(0) + ' MB belegt' : '') + (rows.length ? '' : ' (noch leer; geladene Orte werden automatisch gespeichert)');
  SRC.fit();   // Zeilen kamen nach dem Einpassen dazu
}
// Landesdaten laden (zweiter Klick bricht ab)
async function srcLand(s, btn) {
  if (SRC.busy) { SRC.busy.abort(); return; }
  SRC.busy = new AbortController(); btn.textContent = 'Abbrechen';
  try {
    const mb = await rwLandData(s, RW_STORE, (t, f) => { srcEl('srcMsg').textContent = 'Lade ' + t + ' … ' + Math.round(f*100) + ' %'; }, SRC.busy.signal);
    srcEl('srcMsg').textContent = 'Gewässer und Ortsnamen gespeichert (' + mb.toFixed(0) + ' MB). Sie gelten für neu geladene Orte und beim nächsten Öffnen gespeicherter Orte.';
  } catch (e) { srcEl('srcMsg').textContent = 'Nicht geladen: ' + (e.message || e); }
  finally { SRC.busy = null; srcStoreFill(); }
}

function srcForm(i) {
  SRC.edit = i;
  const s = i >= 0 ? cfg.rwSources[i] : { crs: 'EPSG:25832', lod2: { tileKm: 1 } };
  const lands = deMap() ? deMap().lands.map(l => l.name) : [];
  srcEl('sfLand').textContent = '';
  for (const n of ['', ...lands]) { const o = document.createElement('option'); o.value = n; o.textContent = n || '(bitte wählen)'; srcEl('sfLand').append(o); }
  for (const [id, p] of SRC_FIELDS) srcEl(id).value = srcGetP(s, p) ?? '';
  srcEl('sfTitle').textContent = i >= 0 ? 'Quelle bearbeiten' : 'Neue Quelle';
  srcEl('sfDel').disabled = i < 0;
  srcEl('sfMsg').textContent = 'Adressen ohne „?“ und ohne Parameter eintragen (nur den Dienst). Höhen sind nötig, alles andere ist frei.';
  SRC.show('source');
}
// Formular -> Quelle (leere Ebenen weglassen)
function srcRead() {
  const v = id => srcEl(id).value.trim(), lay = (u, k, x) => u ? { url: u.replace(/\?.*$/, ''), [k]: x } : null;
  return { name: v('sfName'), land: v('sfLand'), crs: v('sfCrs'), dgm: lay(v('sfDgm'), 'coverage', v('sfDgmC')), dom: lay(v('sfDom'), 'coverage', v('sfDomC')),
    dop: lay(v('sfDop'), 'layer', v('sfDopL')), lod2: v('sfLod') ? { url: v('sfLod'), tileKm: Math.max(1, Math.round(+v('sfLodK') || 1)) } : null, attribution: v('sfAttr') || v('sfName') };
}
function srcSave() {
  const s = srcRead(), chk = rwSourcesParse(JSON.stringify([s]));
  if (chk.errors.length) { srcEl('sfMsg').textContent = 'Nicht gespeichert: ' + chk.errors[0].replace(/^Quelle 1: /, ''); return false; }
  if (!s.land) { srcEl('sfMsg').textContent = 'Nicht gespeichert: Bitte das Bundesland wählen.'; return false; }
  const srcList = [...(cfg.rwSources || [])];
  if (SRC.edit >= 0) srcList[SRC.edit] = s; else { srcList.push(s); SRC.edit = srcList.length - 1; }
  cfg.rwSources = srcList; srcStore();
  srcEl('sfMsg').textContent = 'Gespeichert.';
  return true;
}
// Prüfen: am gewählten Ort, falls er im Land liegt, sonst in der Mitte des Landes; kleine Abrufe je Ebene
async function srcCheck() {
  if (SRC.busy) { SRC.busy.abort(); return; }
  const s = srcRead(), z = s.crs === 'EPSG:25833' ? 33 : 32, L = deMap() && deMap().lands.find(l => l.name === s.land);
  let ll = parseLatLon(cfg.rwLL);
  if (L && !ll) { const r = L.rings.reduce((a, b) => b.length > a.length ? b : a); ll = fromUtm(r.reduce((t, p) => t + p[0], 0)/r.length*100, r.reduce((t, p) => t + p[1], 0)/r.length*100); }
  if (!ll) { srcEl('sfMsg').textContent = 'Bitte erst das Bundesland wählen (oder auf der Karte einen Ort setzen).'; return; }
  SRC.busy = new AbortController(); srcEl('sfCheck').textContent = 'Abbrechen';
  srcEl('sfMsg').textContent = 'Prüfe bei ' + ll[0].toFixed(4) + ', ' + ll[1].toFixed(4) + ' …';
  try {
    const { get } = rwNet(SRC.busy.signal), [E, N] = toUtm(ll[0], ll[1], z), sig = SRC.busy.signal;
    // Gebäude: nur den Anfang der Kachel holen (Teilabruf), das reicht zum Erkennen
    const head = async u => { const r = await fetch(u, { signal: sig, headers: { Range: 'bytes=0-4999' } }).catch(() => { throw new Error('Keine Verbindung zu ' + u.split('/')[2]); });
      if (r.status === 404) return null; if (!r.ok) throw new Error(u.split('/')[2] + ' antwortet ' + r.status); return r.text(); };
    const res = await rwCheckSource(s, E, N, get, head);
    srcEl('sfMsg').textContent = res.map(r => r.was + ': ' + (r.ok ? 'ok, ' : 'Fehler, ') + r.text).join(' · ');
  } catch (e) { srcEl('sfMsg').textContent = 'Prüfen abgebrochen: ' + (e.message || e); }
  finally { SRC.busy = null; srcEl('sfCheck').textContent = 'Prüfen'; }
}
function srcExport() {
  const data = JSON.stringify({ format: 'fpvsim-quellen', version: 1, sources: cfg.rwSources || [] }, null, 1);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = 'fpv-quellen.json';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  srcEl('srcMsg').textContent = (cfg.rwSources || []).length + ' eigene Quellen als Datei gespeichert (fpv-quellen.json).';
}
async function srcImport(f) {
  const r = rwSourcesParse(await f.text()), have = new Set((cfg.rwSources || []).map(s => s.name));
  const add = r.sources.filter(s => !have.has(s.name)).map(s => ({ ...s, id: undefined }));
  cfg.rwSources = [...(cfg.rwSources || []), ...add]; srcStore(); srcList();
  srcEl('srcMsg').textContent = add.length + ' Quellen übernommen' + (r.sources.length > add.length ? ', ' + (r.sources.length - add.length) + ' schon vorhanden (gleicher Name)' : '') + (r.errors.length ? '. Nicht übernommen: ' + r.errors.join('; ') : '.');
}
export function srcInit(show, fit) {
  SRC.show = show; SRC.fit = fit || SRC.fit; srcApply();
  srcEl('srcNew').addEventListener('click', () => srcForm(-1));
  srcEl('srcExp').addEventListener('click', srcExport);
  srcEl('srcImp').addEventListener('click', () => srcEl('srcFile').click());
  srcEl('srcFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) srcImport(f); e.target.value = ''; });
  srcEl('sfSave').addEventListener('click', () => { if (srcSave()) { srcList(); } });
  srcEl('sfCheck').addEventListener('click', srcCheck);
  srcEl('sfDel').addEventListener('click', () => { if (SRC.edit < 0) return; cfg.rwSources = cfg.rwSources.filter((_, i) => i !== SRC.edit); srcStore(); srcOpen(); srcEl('srcMsg').textContent = 'Quelle gelöscht.'; });
  for (const [id] of SRC_FIELDS) srcEl(id).addEventListener('keydown', e => e.stopPropagation());   // Tippen steuert nicht die Drohne
}
