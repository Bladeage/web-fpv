/* Echte Welt, Etappe L4: Speicher im Browser (IndexedDB). Ohne DOM, braucht aber den Browser (in Node fehlt indexedDB).
   areas: geladene Gebiete (gepackt wie die eingebetteten Daten, mit Luftbild), Schlüssel = Ort und Quellen.
   info: kurze Beschreibung je Gebiet für die Liste (ohne die großen Daten).
   land: Landesdaten (Basis-DLM-Dateien für Gewässer und Ortsnamen), Schlüssel = Paket-Adresse:Datei.
   lod2: zerlegte Gebäudekacheln (rwload.lod2Pack), Schlüssel = Adresse der Kachel; Zwischenspeicher, nicht im Export.
   Alle Funktionen liefern bei fehlendem Speicher (privates Fenster, gesperrt) null bzw. [] statt zu werfen. */
let dbP = null;
function db() {
  if (!dbP) dbP = new Promise(res => {
    try {
      const r = indexedDB.open('fpvsim-echtewelt', 2);   // 2: dazu lod2 (zerlegte Gebäudekacheln zum Wiederverwenden)
      r.onupgradeneeded = () => { for (const n of ['areas', 'info', 'land', 'lod2']) if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
      // Anderer Tab hält eine ältere Version offen: nicht ewig warten (Prüfbericht Nr. 13). Ohne Speicher weiter; nächster Zugriff versucht es neu.
      r.onblocked = () => { dbP = null; res(null); };
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
  const size = ['q', 'b16', 't16', 'dop', 'water', 'farq', 'fardop'].reduce((t, k) => t + (rec[k] ? rec[k].byteLength : 0), 0);
  if (!await storePut('areas', key, rec)) return false;
  await storePut('info', key, { key, lat: rec.lat, lon: rec.lon, place: rec.meta.place, srcs: rec.srcs, size, date: rec.date || Date.now(), water: !!rec.water, buildings: rec.meta.buildings, trees: rec.meta.trees, tile: !!rec.tile,
    parts: Object.fromEntries(['q', 'b16', 't16', 'dop', 'water', 'farq', 'fardop'].map(k => [k, rec[k] ? rec[k].byteLength : 0])) });
  return true;
}
export async function storeAreaDel(key) { await storeDel('areas', key); await storeDel('info', key); }
// Anbindung für das Laden (realworld.rwLoadLive, rwLandData): Gebiete und Landesdaten
export const RW_STORE = { get: k => storeGet('areas', k), put: (k, r) => storeArea(k, r), land: k => storeGet('land', k), landPut: (k, b) => storePut('land', k, b), landHas: k => storeHas('land', k),
  lod2: k => storeGet('lod2', k), lod2Put: (k, t) => storePut('lod2', k, t) };

// ---- Austausch-Datei (L4b): alle gespeicherten Orte und Landesdaten in einer Datei, für einen anderen Rechner ----
// Aufbau: „FPVGEO1“ + Zeilenumbruch, 4 Bytes Länge (LE), Kopf als JSON, danach die Datenblöcke hintereinander.
// Kopf: { version, created, areas: [{ key, meta, lat, lon, srcs, features, date, parts: { name: [Typ, Länge] } }], land: [{ key, len }] }.
// Im Browser wird die Datei zusätzlich mit gzip gepackt (siehe srcui); geoUnpack erwartet die ungepackten Bytes.
const GEO_MAGIC = 'FPVGEO1\n', GEO_TYPES = { u16: Uint16Array, i16: Int16Array, u8: Uint8Array };
const geoType = a => a instanceof Uint16Array ? 'u16' : a instanceof Int16Array ? 'i16' : 'u8';
export function geoPack(areas, land) {
  const blobs = [], bytes = a => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const head = { version: 1, created: new Date().toISOString(), areas: [], land: [] };
  for (const r of areas) {
    const parts = {};
    for (const k of ['q', 'b16', 't16', 'dop', 'water', 'farq', 'fardop']) if (r[k]) { parts[k] = [geoType(r[k]), r[k].byteLength]; blobs.push(bytes(r[k])); }
    head.areas.push({ key: r.key, meta: r.meta, lat: r.lat, lon: r.lon, srcs: r.srcs, features: r.features || null, date: r.date || null, parts });
  }
  for (const { key, data } of land) { head.land.push({ key, len: data.byteLength }); blobs.push(bytes(data)); }
  const h = new TextEncoder().encode(JSON.stringify(head)), pre = new Uint8Array(GEO_MAGIC.length + 4);
  pre.set(new TextEncoder().encode(GEO_MAGIC)); new DataView(pre.buffer).setUint32(GEO_MAGIC.length, h.length, true);
  return [pre, h, ...blobs];   // Teile für new Blob(...) oder zum Zusammenfügen
}
export function geoUnpack(u8) {
  const td = new TextDecoder(), m = GEO_MAGIC.length;
  if (u8.length < m + 4 || td.decode(u8.subarray(0, m)) !== GEO_MAGIC) throw new Error('Keine Geodaten-Datei dieses Simulators');
  const hl = new DataView(u8.buffer, u8.byteOffset + m, 4).getUint32(0, true), head = JSON.parse(td.decode(u8.subarray(m + 4, m + 4 + hl)));
  if (head.version !== 1) throw new Error('Unbekannte Version ' + head.version);
  let o = m + 4 + hl;
  const take = (type, len) => { if (o + len > u8.length) throw new Error('Datei unvollständig'); const b = u8.slice(o, o + len); o += len; const T = GEO_TYPES[type] || Uint8Array; return new T(b.buffer, 0, len/T.BYTES_PER_ELEMENT); };
  const areas = head.areas.map(a => { const r = { key: a.key, meta: a.meta, lat: a.lat, lon: a.lon, srcs: a.srcs, features: a.features, date: a.date, dop: null, water: null };
    for (const [k, [type, len]] of Object.entries(a.parts)) r[k] = take(type, len); return r; });
  const land = head.land.map(l => ({ key: l.key, data: take('u8', l.len) }));
  return { areas, land, created: head.created };
}
// Alles aus dem Speicher holen (für Export und Übersicht); Orte mit Schlüssel
export async function storeExportAll() {
  const d = await db();
  if (!d) return { areas: [], land: [] };
  const all = (store) => new Promise(res => { const out = []; try { const r = d.transaction(store).objectStore(store).openCursor();
    r.onsuccess = () => { const c = r.result; if (c) { out.push({ key: c.key, value: c.value }); c.continue(); } else res(out); }; r.onerror = () => res(out); } catch (e) { res(out); } });
  const infos = new Map((await all('info')).map(x => [x.key, x.value]));
  return { areas: (await all('areas')).map(x => ({ ...x.value, key: x.key, date: (infos.get(x.key) || {}).date })), land: (await all('land')).map(x => ({ key: x.key, data: x.value })) };
}
// Übersicht je Art aus den Kurzbeschreibungen und Landesdaten-Schlüsseln (ohne die großen Daten zu lesen, außer Landesdaten-Größen)
export async function storeStats() {
  const infos = await storeAll('info');
  for (const x of infos) if (!x.parts) {   // Kurzbeschreibung von vor L4b: Größen je Art einmal nachtragen
    const r = await storeGet('areas', x.key);
    if (r) { x.parts = Object.fromEntries(['q', 'b16', 't16', 'dop', 'water', 'farq', 'fardop'].map(k => [k, r[k] ? r[k].byteLength : 0])); x.trees = r.meta.trees; await storePut('info', x.key, x); }
  }
  const sum = k => infos.reduce((t, x) => t + ((x.parts && x.parts[k]) || 0), 0);
  const d = await db(), land = [];
  if (d) await new Promise(res => { try { const r = d.transaction('land').objectStore('land').openCursor();
    r.onsuccess = () => { const c = r.result; if (c) { land.push({ key: c.key, size: c.value.byteLength }); c.continue(); } else res(); }; r.onerror = res; } catch (e) { res(); } });
  const lod2 = [];
  if (d) await new Promise(res => { try { const r = d.transaction('lod2').objectStore('lod2').openCursor();
    r.onsuccess = () => { const c = r.result; if (c) { lod2.push({ key: c.key, size: c.value.pts ? c.value.pts.byteLength + c.value.ids.byteLength : 0 }); c.continue(); } else res(); }; r.onerror = res; } catch (e) { res(); } });
  return { lod2, areas: infos.length, size: infos.reduce((t, x) => t + (x.size || 0), 0), buildings: infos.reduce((t, x) => t + (x.buildings || 0), 0), trees: infos.reduce((t, x) => t + (x.trees || 0), 0),
    water: infos.filter(x => x.water).length, bytes: { q: sum('q'), b16: sum('b16'), t16: sum('t16'), dop: sum('dop'), water: sum('water'), far: sum('farq') + sum('fardop') }, land };
}
