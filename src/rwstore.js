/* Echte Welt, Etappe L4: Speicher im Browser (IndexedDB). Ohne DOM, braucht aber den Browser (in Node fehlt indexedDB).
   areas: geladene Gebiete (gepackt wie die eingebetteten Daten, mit Luftbild), Schlüssel = Ort und Quellen.
   info: kurze Beschreibung je Gebiet für die Liste (ohne die großen Daten).
   land: Landesdaten (Basis-DLM-Dateien für Gewässer und Ortsnamen), Schlüssel = Quelle:Datei.
   Alle Funktionen liefern bei fehlendem Speicher (privates Fenster, gesperrt) null bzw. [] statt zu werfen. */
let dbP = null;
function db() {
  if (!dbP) dbP = new Promise(res => {
    try {
      const r = indexedDB.open('fpvsim-echtewelt', 1);
      r.onupgradeneeded = () => { for (const n of ['areas', 'info', 'land']) if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch (e) { res(null); }
  });
  return dbP;
}
async function tx(store, mode, fn) {
  const d = await db();
  if (!d) return null;
  return new Promise(res => {
    try {
      const t = d.transaction(store, mode), r = fn(t.objectStore(store));
      t.oncomplete = () => res(r && 'result' in r ? r.result : true);
      t.onerror = t.onabort = () => res(null);
    } catch (e) { res(null); }
  });
}
export const storeGet = (store, key) => tx(store, 'readonly', s => s.get(key));
export const storePut = (store, key, val) => tx(store, 'readwrite', s => s.put(val, key));
export const storeDel = (store, key) => tx(store, 'readwrite', s => s.delete(key));
export async function storeHas(store, key) { const k = await tx(store, 'readonly', s => s.getKey(key)); return k !== undefined && k !== null; }
export async function storeAll(store) { return (await tx(store, 'readonly', s => s.getAll())) || []; }
// Belegter und freier Platz (Schätzung des Browsers), in Bytes
export async function storeUsage() { try { return await navigator.storage.estimate(); } catch (e) { return null; } }
// Gebiet speichern (Daten und Kurzbeschreibung) und wieder löschen
export async function storeArea(key, rec) {
  const size = ['q', 'b16', 't16', 'dop', 'water'].reduce((t, k) => t + (rec[k] ? rec[k].byteLength : 0), 0);
  if (!await storePut('areas', key, rec)) return false;
  await storePut('info', key, { key, lat: rec.lat, lon: rec.lon, place: rec.meta.place, srcs: rec.srcs, size, date: Date.now(), water: !!rec.water, buildings: rec.meta.buildings });
  return true;
}
export async function storeAreaDel(key) { await storeDel('areas', key); await storeDel('info', key); }
// Anbindung für das Laden (realworld.rwLoadLive, rwLandData): Gebiete und Landesdaten
export const RW_STORE = { get: k => storeGet('areas', k), put: (k, r) => storeArea(k, r), land: k => storeGet('land', k), landPut: (k, b) => storePut('land', k, b), landHas: k => storeHas('land', k) };
