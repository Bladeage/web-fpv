/* Modus „Echte Welt“: Gelände aus amtlichen offenen Geodaten (Monschau, Geobasis NRW, dl-de/zero-2.0).
   Ohne DOM. Hält das Höhenraster und liefert Bodenhöhe und Bodenrichtung für Physik und Darstellung.
   Kartenkoordinaten: Mitte des Gebiets = Ursprung, x nach Osten, z nach Süden, y = Höhe über dem Startplatz.
   Außerhalb des Gebiets setzt sich die Randhöhe fort. Im normalen Modus (rw.on = false): Boden flach bei y = 0. */
import { clamp, ptTriDist } from './math.js';
import { fromUtm, toUtm } from './geo.js';
import { RW_SOURCES, rwSourceAt, rwAreaAt, rwFetchArea, rwFetchFar, rwCellSources, rwFixStart, RW_FAR } from './rwload.js';
import { wmsPhotoOf, wmsFetchPhoto } from './rwwms.js';
import { deLandAt, deMap, deLandBox } from './demap.js';
import { dlmFind, dlmWater, dlmPlaces } from './rwdlm.js';

// Eingebettete Daten (der Build setzt sie aus realworld/ ein): Beschreibung (JSON), Höhen, Gebäude, Bäume, Gewässer
// (deflate, Base64), Luftbild (JPEG, Base64), Kartenebenen (JSON). Das 3D-Mesh (tools/mesh.mjs) ist nicht eingebettet.
export const RW_DATA = { meta: '%%RW_META%%', dgm: '%%RW_DGM%%', dop: '%%RW_DOP%%', bld: '%%RW_BLD%%', trees: '%%RW_TREES%%', water: '%%RW_WATER%%', features: '%%RW_FEATURES%%', farq: '%%RW_FARQ%%', fardop: '%%RW_FARDOP%%' };
export const rw = { on: false, ready: false, meta: null, n: 0, size: 1000, cell: 1, h: null, err: '', tris: null, grid: null, water: null, features: null, bldId: null, bldInfo: null, trees: [], dop: null, ver: 0, live: false, userSources: [], far: null, farDop: null, main: null, tiles: new Map(), tileVer: 0, tileBusy: null, tileFail: new Map(), tileErr: '', stream: true, work: null, farBusy: null, farFail: new Map(), farVer: 0, wms: null, liveDis: null, photoWarp: null, photoErr: '', show: { dop: true, bld: true, trees: true, water: true, far: true }, showOff: false, last: null };   // work: Auftrag an den Hintergrund-Thread (rwthread.js), sonst null

// Höhen übernehmen: q = 16-Bit-Werte in hScale Metern über hMin, Zeile für Zeile von Norden nach Süden
export function rwInit(meta, q) {
  const n = meta.n, h = new Float32Array(n*n);
  for (let i = 0; i < n*n; i++) h[i] = meta.hMin + q[i]*meta.hScale - meta.hHome;
  Object.assign(rw, { meta, n, size: meta.bbox[2] - meta.bbox[0], h, ready: true, err: '' });
  rw.cell = rw.size/n;
  return rw;
}
// Gebiet übernehmen (eingebettet oder live geladen, siehe rwload.js): Höhen, Gebäude, Bäume, Luftbild (JPEG-Bytes).
// x: { water, features } nur beim eingebetteten Gebiet. rw.ver zählt hoch, damit die Grafik ihre Netze neu baut.
// Ebenen (Reiter „Debug“ in den Optionen der echten Welt, Nutzer Prompt 166/167, docs/plan-ebenen.md): zum Abschalten für
// Fehlersuche und schwache Geräte. Wirken beim Übernehmen und Zeichnen, nicht beim Laden (der Speicherschlüssel eines Orts kennt
// sie nicht). Höhen bleiben immer an: Physik, Gebäude und Lader brauchen sie. rw.last hält die Daten zum erneuten Übernehmen.
export const RW_SHOW = [['dop', 'Luftbild'], ['bld', 'Gebäude'], ['trees', 'Bäume'], ['water', 'Gewässer'], ['far', 'Umgebung bis 10 km']];
export function rwSetShow(s = {}) {
  rw.show = Object.fromEntries(RW_SHOW.map(([k]) => [k, s[k] !== false]));
  rw.showOff = RW_SHOW.some(([k]) => !rw.show[k]);
  if (rw.last) { const on = rw.on; rwApply(rw.last.p, rw.last.x); rw.on = on; }
}
export function rwApply(p, x = {}) {
  const on = rw.on, S = rw.show;
  if (!x.live) rw.liveDis = null;   // eingebettetes Gebiet: Kacheln wieder aus den Landesquellen
  rw.last = { p, x };
  Object.assign(rw, { tris: null, grid: null, bldId: null, bldInfo: null, trees: [], water: S.water ? x.water || null : null, features: x.features || null, dop: S.dop ? p.dop || null : null, live: !!x.live });
  rwInit(p.meta, p.q);
  // Umgebung (L5a): geladen als p.far, gespeichert flach als farq/fardop mit meta.far
  const F = !S.far ? null : p.far || (p.farq && p.meta.far ? { meta: p.meta.far, q: p.farq, dop: p.fardop } : null);
  if (rw.tileBusy) rw.tileBusy.ac.abort();   // laufendes Nachladen gehört zum alten Gebiet
  if (rw.farBusy) rw.farBusy.ac.abort();
  rw.far = null; rw.farDop = null; rw.tiles = new Map(); rw.tileFail = new Map(); rw.tileBusy = null; rw.tileErr = ''; tileByCode = new Map();
  rw.farBusy = null; rw.farFail = new Map(); rw.farVer++;
  if (F) { rw.far = rwFarGrid(F, p.meta.hHome, 0, 0); rw.farDop = S.dop ? F.dop || null : null; }
  rwModels(p.b16, p.t16, x.water || null);
  rwDryHome();
  rw.on = on; rw.ver++;
  return rw;
}
// Startplatz nicht im Wasser (Fehlerbericht Nutzer, Prompt 140): Die Startsuche (rwload.findStart) kennt nur Dächer; die
// Gewässer kommen erst mit den Landesdaten dazu. Lag der Start im Fluss, stürzte die Drohne sofort ab, und Neustart setzte
// sie wieder dorthin. Jetzt: Liegt Wasser im Umkreis von 4 m, in Ringen (4 m Abstand) den nächsten Punkt suchen, der
// 4 m Abstand zum Wasser und 6 m zu Gebäuden hat und nicht steiler als etwa 30° ist; innerhalb des Gebiets, bis 400 m.
// Setzt rw.meta.home neu (Höhenbezug hHome bleibt). Liefert true, wenn der Start verlegt wurde.
export function rwDryHome() {
  if (!rw.water || !rw.meta || !rw.meta.water) return false;
  const on = rw.on; rw.on = true;
  const wet = (x, z) => { for (const [dx, dz] of [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4], [3, 3], [-3, 3], [3, -3], [-3, -3]]) if (waterAt(x + dx, z + dz)) return true; return false; };
  const ok = (x, z) => Math.abs(x) < rw.size/2 - 20 && Math.abs(z) < rw.size/2 - 20 && !wet(x, z) && !rwNear(x, z, 6).tris.length && groundN(x, z)[1] > 0.86;
  const [hx, hz] = rw.meta.home;
  let moved = false;
  if (wet(hx, hz)) {
    search: for (let r = 4; r <= 400; r += 4) {
      const n = Math.max(8, Math.round(2*Math.PI*r/4));
      for (let k = 0; k < n; k++) {
        const a = k/n*2*Math.PI, x = hx + Math.cos(a)*r, z = hz + Math.sin(a)*r;
        if (ok(x, z)) { rw.meta.home = [Math.round(x*10)/10, Math.round(z*10)/10]; moved = true; break search; }
      }
    }
  }
  rw.on = on;
  return moved;
}
// Umgebung als Raster in Weltkoordinaten: Mitte (cx, cz) im Raster der Gebietsgröße (Prüfbericht Nr. 16: sie wandert mit
// der Drohne), Messpunkte bei ox + k*cell. Höhen relativ zum Startplatz des Startgebiets (hHome).
function rwFarGrid(F, hHome, cx, cz) {
  const m = F.meta, h = new Float32Array(m.n*m.n), cell = m.size/m.n;
  for (let i = 0; i < h.length; i++) h[i] = m.hMin + F.q[i]*m.hScale - hHome;
  return { n: m.n, size: m.size, cell, h, cx, cz, ox: cx - m.size/2 + cell/2, oz: cz - m.size/2 + cell/2 };
}
// Alle Quellen: eigene (rw.userSources, aus den Einstellungen) zuerst, dann die Vorlagen. Rechteck aus dem Land, falls keins da ist.
export function rwSources() {
  return [...rw.userSources, ...RW_SOURCES].map(s => s.box || s.kind === 'wms' ? s : { ...s, box: deLandBox(s.land) || [0, 0, 0, 0] });   // WMS-Höhendienst: überall
}
const zoneOf = s => s.crs === 'EPSG:25833' ? 33 : 32;
// Quellen für ein Gebiet um Breite/Länge: Hauptquelle am Mittelpunkt, dazu die Quellen der Länder, die das Gebiet
// berührt (Probe auf 5 x 5 Punkten), im selben Koordinatensystem. Rückgabe { srcs, area, skipped } oder null.
// WMS-Höhendienste nur mit use 'all' (opt.dis: auch 'dis', für den Startort DIS-Übung); ihre UTM-Zone kommt aus der Länge.
// opt.wms: genau diese Quelle (Ergebnis von wmsProbe, Startort DIS-Übung).
export function rwPlan(lat, lon, list = rwSources(), opt = {}) {
  list = list.filter(s => s.kind !== 'wms' || s.use === 'all' || (opt.dis && s.use === 'dis'));
  const land = deMap() ? deLandAt : null, [E32, N32] = toUtm(lat, lon, 32);
  let main = rwSourceAt(E32, N32, list, land);
  const w = opt.wms || list.find(s => s.kind === 'wms');   // opt.wms: von der Aushandlung gefundener Dienst (W3), gilt vor allem anderen
  if (opt.wms) main = null;   // WMS-Höhendienst gilt überall: gewinnt, wenn er in der Liste vor der Landesquelle steht
  if (w && (!main || list.indexOf(w) < list.indexOf(main))) main = w;
  if (!main) return null;
  if (main.kind === 'wms') {   // geografischer Dienst: Gebiet im UTM-Gitter der Zone des Orts, keine weiteren Quellen
    const z = Math.floor((lon + 180)/6) + 1, [E, N] = toUtm(lat, lon, z);
    main = { ...main, crs: 'EPSG:258' + String(z).padStart(2, '0') };
    const area = rwAreaAt(E, N, main); area.place = lat.toFixed(5) + ', ' + lon.toFixed(5);
    return { srcs: [main], area, skipped: [], toLand: () => null };
  }
  const z = zoneOf(main), [E, N] = toUtm(lat, lon, z), area = rwAreaAt(E, N, main);
  area.place = lat.toFixed(5) + ', ' + lon.toFixed(5);
  const to32 = (e, n) => { const [la, lo] = fromUtm(e, n, z); return toUtm(la, lo, 32); };
  const srcs = [main], skipped = [];
  if (land) for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
    const p = to32(area.bbox[0] + i*250, area.bbox[1] + j*250), s = rwSourceAt(p[0], p[1], list, land);
    if (!s || srcs.includes(s) || skipped.includes(s)) continue;
    (zoneOf(s) === z ? srcs : skipped).push(s);
  }
  return { srcs, area, skipped, toLand: (e, n) => land ? land(...to32(e, n)) : null };
}
// Abrufe für das Laden und Prüfen: get(url) -> Bytes, text(url) -> Text oder null (404). Fehler verständlich:
// keine Verbindung (offline oder gesperrt), Dienst antwortet mit Fehlercode, Dienst meldet Fehler als XML, Abbruch.
// Antwort lesen; prog(Bytes) meldet bei großen Dateien den Fortschritt (Gebäude-Kacheln bis 70 MB, Landesdaten)
async function readBody(r, prog) {
  if (!prog || !r.body || !r.body.getReader) return new Uint8Array(await r.arrayBuffer());
  const rd = r.body.getReader(), parts = [];
  let n = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); n += value.length; prog(n); }
  const b = new Uint8Array(n); let o = 0; for (const x of parts) { b.set(x, o); o += x.length; }
  return b;
}
// Zeitgrenze (Prüfbericht Nr. 5): Kommt so lange gar nichts (keine Antwort, keine neuen Bytes), wird der Abruf abgebrochen.
// Gemessen wird Stillstand, nicht die Gesamtdauer: Große Gebäudekacheln (bis 70 MB) dürfen bei langsamem Netz lange laden.
export const RW_STALL = 30000;
export function rwNet(signal, stall = RW_STALL) {
  const host = u => u.split('/')[2];
  // Je Abruf eigener Abbruch: durch den Aufrufer (signal) oder durch Stillstand. kick() setzt die Uhr zurück.
  const go = async (u, fn) => {
    const ac = new AbortController(), onAbort = () => ac.abort();
    let late = false, timer = 0;
    const kick = () => { clearTimeout(timer); timer = setTimeout(() => { late = true; ac.abort(); }, stall); };
    if (signal) { if (signal.aborted) ac.abort(); else signal.addEventListener('abort', onAbort); }
    kick();
    try { const r = await fetch(u, { signal: ac.signal }); kick(); return await fn(r, n => kick()); }
    catch (e) {
      if (late) throw new Error(host(u) + ' antwortet nicht (' + stall/1000 + ' s ohne Daten)');
      if (e.name === 'AbortError' || ac.signal.aborted) throw new Error('Abgebrochen');
      if (e && e.name === 'TypeError') throw new Error('Keine Verbindung zu ' + host(u) + ' (offline oder Zugriff gesperrt)');   // Name statt instanceof: gilt auch über Grenzen von Worker und Fenster
      throw e;
    }
    finally { clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort); }
  };
  const both = (prog, kick) => n => { kick(); if (prog) prog(n); };
  // XML ist eine Fehlermeldung, außer bei den Fähigkeiten eines WMS-Höhendienstes (W2)
  const get = (u, prog) => go(u, async (r, kick) => {
    if (!r.ok) throw new Error(host(u) + ' antwortet ' + r.status);
    const b = await readBody(r, both(prog, kick));
    if (b[0] === 0x3c && !/REQUEST=GetCapabilities/i.test(u)) throw new Error(host(u) + ' meldet: ' + new TextDecoder().decode(b.slice(0, 300)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120));
    return b;
  });
  const text = (u, prog) => go(u, async (r, kick) => { if (r.status === 404) return null; if (!r.ok) throw new Error(host(u) + ' antwortet ' + r.status); return new TextDecoder().decode(await readBody(r, both(prog, kick))); });
  return { get, text };
}
// Gebiet 1 x 1 km um Breite/Länge live von den Diensten laden (L1, mehrere Quellen L3).
// say(Schritt, Anteil) meldet den Fortschritt; signal bricht ab; mergeImg setzt Luftbilder an Grenzen zusammen (Browser).
// Bei Fehler bleibt das alte Gebiet erhalten.
// store (Browser, L4): { get(key), put(key, rec), land(key) } – gespeicherte Gebiete und Landesdaten. Ohne store: immer laden.
export const rwAreaKey = (lat, lon, srcs) => lat.toFixed(5) + ',' + lon.toFixed(5) + '|' + srcs.map(s => s.name).join('+');
// Gewässer und Ortsnamen aus gespeicherten Landesdaten der Hauptquelle (nur gleiches Koordinatensystem). Setzt meta.water.
export async function rwExtras(p, src, store) {
  const d = src && src.dlm, out = {};
  if (!store || !d || p.meta.crs !== src.crs) return out;
  const w = await store.land(d.url + ':' + d.water);
  if (w) { const r = dlmWater(w, p.meta.bbox); out.water = r.bits; p.meta.water = { n: r.n, res: r.res, area: r.wet, source: 'Basis-DLM ' + d.water }; }
  const ps = await store.land(d.url + ':' + d.places[0]), pd = await store.land(d.url + ':' + d.places[1]);
  if (ps && pd) {
    out.features = { places: dlmPlaces(ps, pd, p.meta.bbox), source: src.attribution };
    // Name des Orts für Liste und Anzeige: nächste Ortslage zur Mitte (bis 2 km), davor die Koordinate
    const f = rw.features; rw.features = out.features;
    const pl = rwPlace(0, 0);
    rw.features = f;
    const pc = p.meta.place || '';
    if (pl && pl.d < 2000 && !pc.includes(' · ')) p.meta.place = pl.name + (pc ? ' · ' + pc : '');
  }
  return out;
}
// Gebiet laden: im Hintergrund-Thread, wenn es ihn gibt (Prüfbericht Etappe 5: Abrufe, Raster, Gebäudekacheln, Bäume
// rechnen dort; das Bild läuft weiter). Bilder mehrerer Quellen zusammensetzen braucht ein Canvas: dann im Hauptprogramm.
// Fehlt der Worker oder fällt er aus, rechnet das Hauptprogramm wie bisher.
async function rwFetch(a, srcs, say, signal, opt, store) {
  if (rw.work && !opt.mergeImg) {
    try { return await rw.work('area', { a, srcs, opt: { far: opt.far, cells: opt.cells || null, lod2: !!(store && store.lod2) } }, say, signal); }
    catch (e) { if (!e.noWorker) throw e; }
  }
  const { get, text } = rwNet(signal);
  if (store && store.lod2) opt.lod2Cache = { get: store.lod2, put: store.lod2Put };   // Gebäudekacheln anderer Orte wiederverwenden
  return rwFetchArea(a, srcs, get, text, say, opt);
}
// Eingaben für rwModelMesh (Netz der Gebäude und Bäume einer Kachel), ohne den Rest der Kachel: geht an den Worker
export const rwMeshInput = S => ({ tris: S.tris, nr: S.nr, bldId: S.bldId, bldInfo: S.bldInfo, trees: S.trees.map(t => ({ x: t.x, z: t.z, y0: t.y0, r: t.r, boxes: t.boxes.map(b => ({ c: b.c, h: b.h })) })) });
// Luftbild des Höhendienstes (Nutzer, Prompt 173): Kacheln in Breite und Länge holen (rwwms), entzerren im Hauptprogramm
// (rw.photoWarp aus menu.js, Canvas; ohne sie und ohne Bildebene: null, dann schattiertes Relief). px Bildpunkte je Seite, klein
// gehalten, weil der Partner langsam liefert (gemessen etwa 5,6 s je Kachel 256 x 256): Startgebiet und Kacheln 2 m, Umgebung 25 m.
export const RW_WMS_IMG = { main: 512, tile: 512, far: 400 };
export async function rwWmsPhoto(src, bbox, crs, px, get) {
  if (!rw.photoWarp || !src || src.kind !== 'wms') return null;
  const layer = await wmsPhotoOf(src, get);
  if (!layer) return null;
  return rw.photoWarp(await wmsFetchPhoto(src, layer, bbox, +(crs.match(/258(\d\d)/) || [0, 32])[1], px, get), px);
}
const farBox = (a, size = RW_FAR.size) => { const ec = (a.bbox[0] + a.bbox[2])/2, nc = (a.bbox[1] + a.bbox[3])/2; return [ec - size/2, nc - size/2, ec + size/2, nc + size/2]; };
export async function rwLoadLive(lat, lon, say = () => {}, signal, mergeImg = null, store = null, po = {}) {
  const plan = rwPlan(lat, lon, rwSources(), po);
  rw.liveDis = po.wms || po.dis ? { wms: po.wms || null, dis: !!po.dis } : null;   // Kacheln und Umgebung planen mit denselben Quellen
  if (!plan) throw new Error('Für diesen Ort ist keine Quelle hinterlegt. Eigene Quellen unter „Quellen“ eintragen.');
  const { srcs, area: a } = plan, key = rwAreaKey(lat, lon, srcs);
  if (srcs[0].store === false) store = null;   // Quelle darf nicht gespeichert werden (Lizenz): nur Arbeitsspeicher
  const saved = store ? await store.get(key) : null;
  if (saved && saved.meta) {   // schon gespeichert: ohne Netz, sofort
    say('aus dem Speicher', 0.5);
    const moved = rwFixStart(saved);   // gespeichert vor dem Fix „Start nicht im Gebäude“
    const x = saved.water || saved.features ? { water: saved.water, features: saved.features } : await rwExtras(saved, srcs[0], store);
    // Ohne Umgebung (gespeichert vor L5a oder damals nicht erreichbar) gibt es kein Nachladen beim Fliegen (rwStreamStep braucht rw.far):
    // Umgebung jetzt nachholen, wenn das Netz da ist; ohne Netz öffnet der Ort wie bisher (Nutzer, Prompt 123)
    let far = null;
    if (!saved.farq && srcs[0].dgm) {
      far = await rwFetchFar(plan.area, srcs[0], rwNet(signal).get, say).catch(() => null);
      if (signal && signal.aborted) throw new Error('Abgebrochen');
      if (far) { saved.farq = far.q; saved.fardop = far.dop; saved.meta.far = far.meta; }
    }
    rwApply(saved, { live: true, ...x }); rw.stored = null;
    if ((x.water && !saved.water) || moved || far) rw.stored = await store.put(key, { ...saved, ...x });   // Landesdaten oder Umgebung kamen später dazu oder Start neu
    rw.liveAt = [lat, lon]; rw.liveSrcs = srcs.map(s => s.name); rw.fromStore = true; rw.liveDlm = !!srcs[0].dlm;
    return rw;
  }
  if (plan.skipped.length) say('Hinweis: ' + plan.skipped.map(s => s.name).join(', ') + ' nutzt ein anderes Koordinatensystem und bleibt außen vor', 0);
  const opt = srcs.length > 1 ? { cells: rwCellSources(a, srcs, plan.toLand), mergeImg } : {};
  const p = await rwFetch(a, srcs, say, signal, opt, store);
  if (signal && signal.aborted) throw new Error('Abgebrochen');   // etwa während des Zusammensetzens der Luftbilder
  // Gewässer und Ortsnamen: Landesdaten beim ersten Ort automatisch (Nutzer, Prompt 121); schon vorhandene nicht noch einmal
  if (store && store.landHas && srcs[0].dlm && !await rwLandHas(srcs[0], store))
    await rwLandData(srcs[0], store, (t, f) => say('Gewässer und Orte, einmalig: ' + t, 0.97), signal).catch(e => { if (signal && signal.aborted) throw e; rw.landErr = String(e.message || e); });
  const x = await rwExtras(p, srcs[0], store);
  if (!p.dop && srcs[0].kind === 'wms') {   // Luftbild des Höhendienstes, sonst Relief schattiert auf Gras
    say('Luftbild vom Höhendienst', 0.9);
    const get = rwNet(signal).get;
    p.dop = await rwWmsPhoto(srcs[0], a.bbox, a.crs, RW_WMS_IMG.main, get).catch(e => { if (signal && signal.aborted) throw e; rw.photoErr = String(e.message || e); return null; }) || rwShadeImage(p.meta, p.q);
    if (p.far && !p.far.dop) p.far.dop = await rwWmsPhoto(srcs[0], farBox(a), a.crs, RW_WMS_IMG.far, get).catch(() => null);
  }
  rwApply(p, { live: true, ...x }); rw.stored = null;
  rw.liveAt = [lat, lon]; rw.liveSrcs = srcs.map(s => s.name); rw.fromStore = false; rw.liveDlm = !!srcs[0].dlm;
  if (store) {
    say('speichern', 0.98);
    if (p.far) p.meta.far = p.far.meta;   // Umgebung flach speichern (farq, fardop), Beschreibung in meta.far
    rw.stored = await store.put(key, { meta: p.meta, q: p.q, b16: p.b16, t16: p.t16, dop: p.dop, water: x.water || null, features: x.features || null,
      farq: p.far ? p.far.q : null, fardop: p.far ? p.far.dop : null, lat, lon, srcs: rw.liveSrcs });
  }
  return rw;
}
// Ort ohne Kartendaten (Nutzer, Prompt 145: Flug am Ort einer DIS-Übung, etwa auf einem erfundenen Gelände des Partners):
// ebene Fläche 4 x 4 km auf Höhe hNhn (über NHN) um Breite/Länge, Grasbild ohne Gebäude und Bäume. UTM-Zone nach der Länge.
export const RW_FLAT = { size: 4000, n: 64, img: 256 };
export function rwFlat(lat, lon, hNhn) {
  const zone = Math.floor((lon + 180)/6) + 1, [E, N] = toUtm(lat, lon, zone), S = RW_FLAT.size, n = RW_FLAT.n, h = Math.round(hNhn*100)/100;
  const meta = { name: 'flach', place: lat.toFixed(5) + ', ' + lon.toFixed(5) + ' (ohne Kartendaten)', crs: 'EPSG:258' + String(zone).padStart(2, '0'),
    bbox: [E - S/2, N - S/2, E + S/2, N + S/2], n, hMin: h, hMax: h, hScale: 0.1, home: [0, 0], hHome: h, startSpan: 1, startV: 2,
    attribution: '', roofTris: 0, wallTris: 0, buildings: 0, trees: 0, flat: true };
  rwApply({ meta, q: new Uint16Array(n*n), b16: new Int16Array(0), t16: new Int16Array(0), dop: rwFlatImage(RW_FLAT.img) }, { live: true });
  rw.liveAt = [lat, lon]; rw.liveSrcs = []; rw.fromStore = false; rw.liveDlm = false; rw.stored = null; rw.liveDis = null;
  return rw;
}
// Relief als Bild (WMS-Höhendienst ohne Luftbild, Etappe W2): Schattierung aus den Höhen (Licht aus Süden, 45° hoch, wie die Sonne
// der echten Welt) mal Grasgrün, als BMP n x n (24 Bit, Zeilen von Norden nach Süden). Stärke der Schattierung geschätzt.
export function rwShadeImage(meta, q) {
  const n = meta.n, cell = (meta.bbox[2] - meta.bbox[0])/n, h = (i, j) => meta.hMin + q[Math.min(n - 1, Math.max(0, j))*n + Math.min(n - 1, Math.max(0, i))]*meta.hScale;
  const row = n*3 + (4 - (n*3) % 4) % 4, b = new Uint8Array(54 + row*n), v = new DataView(b.buffer), L = [0, Math.SQRT1_2, Math.SQRT1_2];   // Licht: Süden (z+), 45°
  b[0] = 66; b[1] = 77; v.setUint32(2, b.length, true); v.setUint32(10, 54, true); v.setUint32(14, 40, true);
  v.setInt32(18, n, true); v.setInt32(22, -n, true); v.setUint16(26, 1, true); v.setUint16(28, 24, true); v.setUint32(34, row*n, true);   // negative Höhe: von oben nach unten
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const dx = (h(i + 1, j) - h(i - 1, j))/(2*cell), dz = (h(i, j + 1) - h(i, j - 1))/(2*cell), len = Math.hypot(dx, 1, dz);
    const k = 0.45 + 0.75*Math.max(0, (-dx*L[0] + L[1] - dz*L[2])/len), o = 54 + j*row + i*3;
    b[o] = Math.min(255, 52*k); b[o + 1] = Math.min(255, 112*k); b[o + 2] = Math.min(255, 84*k);
  }
  return b;
}
// Grasbild als BMP (24 Bit, ohne Bibliothek): Grundton mit großen hellen und dunklen Flecken und feinem Rauschen,
// damit Höhe und Tempo im Bild ablesbar bleiben
export function rwFlatImage(w) {
  const row = w*3, b = new Uint8Array(54 + row*w), v = new DataView(b.buffer);
  b[0] = 66; b[1] = 77; v.setUint32(2, b.length, true); v.setUint32(10, 54, true); v.setUint32(14, 40, true);
  v.setInt32(18, w, true); v.setInt32(22, w, true); v.setUint16(26, 1, true); v.setUint16(28, 24, true); v.setUint32(34, row*w, true);
  let seed = 12345;
  const rnd = () => (seed = (seed*1103515245 + 12345) >>> 0)/4294967296;
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const u = x/w*2*Math.PI, t = y/w*2*Math.PI, f = 0.5*Math.sin(3*u + 1.3*Math.sin(2*t)) + 0.3*Math.sin(5*t + 0.7) + 0.2*Math.sin(7*u - 4*t), k = 1 + 0.12*f + (rnd() - 0.5)*0.16;
    const o = 54 + y*row + x*3;
    b[o] = Math.min(255, 52*k); b[o + 1] = Math.min(255, 112*k); b[o + 2] = Math.min(255, 84*k);   // BGR: Grasgrün
  }
  return b;
}
// Eingebettete Daten im Browser entpacken (DecompressionStream, Bordmittel). Werkzeug und Tests nutzen zlib direkt.
export async function rwLoadEmbedded() {
  if (rw.ready && !rw.live) return rw;
  try {
    if (RW_DATA.meta.startsWith('%%')) throw new Error('keine eingebetteten Daten');
    const meta = JSON.parse(RW_DATA.meta), bytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const unpack = async b64 => new Response(new Blob([bytes(b64)]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
    const p = { meta, q: new Uint16Array(await unpack(RW_DATA.dgm)), b16: new Int16Array(await unpack(RW_DATA.bld)), t16: new Int16Array(await unpack(RW_DATA.trees)),
      dop: RW_DATA.dop.startsWith('%%') ? null : bytes(RW_DATA.dop),
      farq: meta.far && !RW_DATA.farq.startsWith('%%') ? new Uint16Array(await unpack(RW_DATA.farq)) : null, fardop: meta.far && !RW_DATA.fardop.startsWith('%%') ? bytes(RW_DATA.fardop) : null };
    rwApply(p, { features: RW_DATA.features.startsWith('%%') ? null : JSON.parse(new TextDecoder().decode(await unpack(RW_DATA.features))), water: RW_DATA.water.startsWith('%%') ? null : new Uint8Array(await unpack(RW_DATA.water)) });
    return rw;
  } catch (e) { rw.err = String(e.message || e); return rw; }
}
const at = (i, j) => rw.h[clamp(j, 0, rw.n - 1)*rw.n + clamp(i, 0, rw.n - 1)];
// Bodenhöhe an (x, z), bilinear zwischen den Rasterpunkten (Punktmitten)
function mainH(x, z) {
  const u = (x + rw.size/2)/rw.cell - 0.5, v = (z + rw.size/2)/rw.cell - 0.5;
  const i = Math.floor(u), j = Math.floor(v), fu = clamp(u - i, 0, 1), fv = clamp(v - j, 0, 1);
  return (at(i, j)*(1 - fu) + at(i + 1, j)*fu)*(1 - fv) + (at(i, j + 1)*(1 - fu) + at(i + 1, j + 1)*fu)*fv;
}
// Umgebung: Messpunkte bei -size/2 + (k + 0,5)*cell (k = 0..n-1), außen fortgesetzt
function farH(x, z) {
  const F = rw.far, u = clamp((x - F.ox)/F.cell, 0, F.n - 1), v = clamp((z - F.oz)/F.cell, 0, F.n - 1);
  const i = Math.min(F.n - 2, Math.floor(u)), j = Math.min(F.n - 2, Math.floor(v)), fu = u - i, fv = v - j, h = F.h, n = F.n;
  return (h[j*n + i]*(1 - fu) + h[j*n + i + 1]*fu)*(1 - fv) + (h[(j + 1)*n + i]*(1 - fu) + h[(j + 1)*n + i + 1]*fu)*fv;
}
export const RW_SEAM = 30;   // m: innen am Rand des Gebiets weich von der Umgebung zum feinen Gelände
// Kachel an (x, z): das Startgebiet (0, 0) oder eine nachgeladene Kachel (L5b, Raster der Gebietsgröße), sonst null
// Schneller Zugriff über Zahlen statt Text (groundH läuft beim Netzaufbau hunderttausendfach): Code = (i + 64)*128 + (j + 64)
const tileCode = (i, j) => (i + 64)*128 + (j + 64);
let tileByCode = new Map();
export function rwTileAt(x, z) {
  const S = rw.size, i = Math.round(x/S), j = Math.round(z/S);
  return i === 0 && j === 0 ? rw.main : tileByCode.get(tileCode(i, j)) || null;
}
const rwHasTile = (i, j) => (i === 0 && j === 0) || tileByCode.has(tileCode(i, j));
// Höhe aus dem feinen Raster einer Kachel (bilinear, Punktmitten, am Rand gehalten)
function tileH(T, x, z) {
  if (T === rw.main) return mainH(x, z);
  const n = T.n, u = (x - T.dx + rw.size/2)/T.cell - 0.5, v = (z - T.dz + rw.size/2)/T.cell - 0.5, h = T.h;
  const i = clamp(Math.floor(u), 0, n - 2), j = clamp(Math.floor(v), 0, n - 2), fu = clamp(u - i, 0, 1), fv = clamp(v - j, 0, 1);
  return (h[j*n + i]*(1 - fu) + h[j*n + i + 1]*fu)*(1 - fv) + (h[(j + 1)*n + i]*(1 - fu) + h[(j + 1)*n + i + 1]*fu)*fv;
}
// Gemessene Höhe (Raster bilinear, an offenen Rändern weich in die Umgebung). Daraus entstehen die Ecken der Netze.
// Physik und alles andere nutzen groundH: die gezeichnete Fläche zwischen diesen Ecken (siehe unten).
export function rwSampleH(x, z) {
  if (!rw.on) return 0;
  if (!rw.far) return mainH(x, z);
  const T = rwTileAt(x, z);
  if (!T) return farH(x, z);
  // Abstand zu Rändern ohne geladenen Nachbarn (dort weich in die Umgebung), Ecken eingeschlossen
  const h = rw.size/2, lx = x - T.dx, lz = z - T.dz, dW = h + lx, dE = h - lx, dN = h + lz, dS = h - lz, I = T.i, J = T.j;
  let d = Infinity;
  if (!rwHasTile(I - 1, J)) d = Math.min(d, dW);
  if (!rwHasTile(I + 1, J)) d = Math.min(d, dE);
  if (!rwHasTile(I, J - 1)) d = Math.min(d, dN);
  if (!rwHasTile(I, J + 1)) d = Math.min(d, dS);
  if (!rwHasTile(I - 1, J - 1)) d = Math.min(d, Math.max(dW, dN));
  if (!rwHasTile(I - 1, J + 1)) d = Math.min(d, Math.max(dW, dS));
  if (!rwHasTile(I + 1, J - 1)) d = Math.min(d, Math.max(dE, dN));
  if (!rwHasTile(I + 1, J + 1)) d = Math.min(d, Math.max(dE, dS));
  const t = d/RW_SEAM;
  if (t <= 0) return farH(x, z);
  return t >= 1 ? tileH(T, x, z) : farH(x, z)*(1 - t) + tileH(T, x, z)*t;
}
// Normale aus den gemessenen Höhen (glatt, für das Licht der Netze)
function sampleN(x, z) {
  const e = rw.cell, dx = (rwSampleH(x + e, z) - rwSampleH(x - e, z))/(2*e), dz = (rwSampleH(x, z + e) - rwSampleH(x, z - e))/(2*e);
  const l = Math.hypot(dx, 1, dz);
  return [-dx/l, 1/l, -dz/l];
}
// Bodenhöhe = Höhe der gezeichneten Geländefläche an (x, z): dieselben Ecken und Dreiecke wie rwMesh (Abstand RW_STEP
// Rasterpunkte) bzw. rwFarMesh. Vorher rechnete die Physik mit den gemessenen Höhen dazwischen; die gezeichnete Fläche lag am
// Hang bis 4 m darüber (Monschau, an 32 % der Punkte über 3,5 cm), die Drohne sank sichtbar ein, die Kamera sah das Gelände
// von unten. Jetzt eine Fläche für Physik, Kamera, Bäume, Vögel und Pilot (Prüfbericht Nr. 1). Einzige Ausnahme: unter Wasser
// zeichnet rwMesh das Bett um WATER_DIP tiefer (siehe dort); dort zählt für alles der Wasserspiegel.
export const RW_STEP = 2;
const tri = (a, b, c, d, fx, fz) => fx + fz <= 1 ? a + (b - a)*fx + (c - a)*fz : d + (c - d)*(1 - fx) + (b - d)*(1 - fz);
export function groundH(x, z) {
  if (!rw.on) return 0;
  const T = rwTileAt(x, z);
  if (!T && rw.far) {   // Umgebung: Dreiecke über den Messpunkten (25 m), außen der Rand bis 15 km wie rwFarMesh
    const F = rw.far, E = RW_FAR_EDGE;
    const fp = (k, o, c) => k < 0 ? c - E : k >= F.n ? c + E : o + k*F.cell, fi = (l, o) => l < o ? -1 : Math.min(F.n - 1, Math.floor((l - o)/F.cell));
    const px = clamp(x, F.cx - E, F.cx + E), pz = clamp(z, F.cz - E, F.cz + E), i = fi(px, F.ox), j = fi(pz, F.oz);
    const x0 = fp(i, F.ox, F.cx), x1 = fp(i + 1, F.ox, F.cx), z0 = fp(j, F.oz, F.cz), z1 = fp(j + 1, F.oz, F.cz);
    return tri(rwSampleH(x0, z0), rwSampleH(x1, z0), rwSampleH(x0, z1), rwSampleH(x1, z1), (px - x0)/(x1 - x0), (pz - z0)/(z1 - z0));
  }
  // Startgebiet ohne Umgebung: dessen Netz mit Rand bis 1,5 km (auch außerhalb des Gebiets)
  const main = !T || T === rw.main, N = main ? rw.n : T.n, C = main ? rw.size/rw.n : T.cell, ox = main ? 0 : T.dx, oz = main ? 0 : T.dz;
  if (!N) return rwSampleH(x, z);
  const m = Math.floor(N/RW_STEP), edge = rw.far ? rw.size/2 : 1500;
  const pos = k => k <= 0 ? -edge : k > m ? edge : (((k - 1)*RW_STEP + RW_STEP/2) - N/2)*C;
  const idx = l => { if (l < pos(1)) return 0; if (l >= pos(m)) return m; return clamp(1 + Math.floor((l/C + N/2 - RW_STEP/2)/RW_STEP), 1, m - 1); };
  const lx = clamp(x - ox, -edge, edge), lz = clamp(z - oz, -edge, edge), i = idx(lx), j = idx(lz), x0 = pos(i), x1 = pos(i + 1), z0 = pos(j), z1 = pos(j + 1);
  const W = (a, b) => rwSampleH(a + ox, b + oz);
  return tri(W(x0, z0), W(x1, z0), W(x0, z1), W(x1, z1), (lx - x0)/(x1 - x0), (lz - z0)/(z1 - z0));
}
// Bodenrichtung (Normale, Einheitsvektor nach oben) der gezeichneten Fläche
export function groundN(x, z) {
  if (!rw.on) return [0, 1, 0];
  const e = rw.cell, dx = (groundH(x + e, z) - groundH(x - e, z))/(2*e), dz = (groundH(x, z + e) - groundH(x, z - e))/(2*e);
  const l = Math.hypot(dx, 1, dz);
  return [-dx/l, 1/l, -dz/l];
}
// Netz fürs Gelände: Raster mit Abstand step Rasterpunkte (2 = 4 m), außen ein Rand bis „far“ m in Randhöhe.
// Rückgabe: Ecken (wie MeshBuilder: Ort, Normale, Farbe, Alpha 0 = Boden) und Dreiecks-Indizes.
// Unter Wasser liegt das gezeichnete Flussbett um WATER_DIP tiefer als das Höhenmodell (anteilig am Ufer). Grund: Der Spiegel lag
// nur 0,25 m über dem Bett; aus der Höhe (Köln, 150 m) reichte die Tiefenauflösung der Grafik dafür nicht, das Bett schien in
// eckigen Flecken durch (Versuch: ohne Geländenetz keine Flecken, mit großem Polygon-Offset keine Flecken). Die Physik (groundH)
// bleibt auf dem Höhenmodell: auf dem Wasser gilt ohnehin der Spiegel (Absturz), unter dem Spiegel ist nichts erreichbar.
export const WATER_DIP = 2;   // m (Schätzung: tiefer als die Tiefenauflösung bis etwa 1 km, flacher als eine glaubhafte Uferböschung)
const DIP5 = [[0, 0], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]];   // Proben für den Wasseranteil um eine Ecke
export function rwMesh(step = 2, far = 1500, T = null) {
  const N = T ? T.n : rw.n, C = T ? T.cell : rw.cell, ox = T ? T.dx : 0, oz = T ? T.dz : 0;
  const wet = rwWetFn(T ? T.water : rw.water, T ? T.wmeta : rw.meta && rw.meta.water, ox, oz);
  const m = Math.floor(N/step), pos = [-far];
  for (let i = 0; i < m; i++) pos.push(((i*step + step/2) - N/2)*C);
  pos.push(far);
  const k = pos.length, v = new Float32Array(k*k*10), idx = new Uint32Array((k - 1)*(k - 1)*6);
  for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
    const x = pos[i] + ox, z = pos[j] + oz, n = sampleN(x, z), o = (j*k + i)*10;
    let f = 0; for (const [a, b] of DIP5) if (wet(x + a, z + b)) f++;
    v.set([x, rwSampleH(x, z) - WATER_DIP*f/5, z, n[0], n[1], n[2], 0.35, 0.50, 0.27, 0], o);
  }
  let t = 0;
  for (let j = 0; j < k - 1; j++) for (let i = 0; i < k - 1; i++) {
    const a = j*k + i, b = a + 1, c = a + k, d = c + 1;
    idx.set([a, c, b, b, c, d], t); t += 6;   // gegen den Uhrzeigersinn von oben gesehen
  }
  return { v, idx };
}

// Netz der Umgebung (L5a): Messpunkte alle 25 m über 10 km, außen ein Rand bis 15 km; Zellen im Gebiet fehlen (dort liegt
// das feine Netz, die Ränder treffen sich genau auf Messpunkten). Ecken wie rwMesh (Ort, Normale, Farbe, Alpha 0 = Boden).
export const RW_FAR_EDGE = 15000;   // m: Rand des Umgebungsnetzes (bis zum Horizont)
export function rwFarMesh(edge = RW_FAR_EDGE) {
  const F = rw.far;
  if (!F) return { v: new Float32Array(0), idx: new Uint32Array(0) };
  const line = (o, c) => { const p = [c - edge]; for (let k = 0; k < F.n; k++) p.push(o + k*F.cell); p.push(c + edge); return p; };
  const pos = line(F.ox, F.cx), posZ = line(F.oz, F.cz);   // um die Mitte der Umgebung (wandert mit)
  const k = pos.length, half = rw.size/2, v = new Float32Array(k*k*10), idx = [];
  for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
    const x = pos[i], z = posZ[j], n = sampleN(x, z);
    v.set([x, rwSampleH(x, z), z, n[0], n[1], n[2], 0.35, 0.50, 0.27, 0], (j*k + i)*10);
  }
  for (let j = 0; j < k - 1; j++) for (let i = 0; i < k - 1; i++) {
    const T = rwTileAt((pos[i] + pos[i + 1])/2, (posZ[j] + posZ[j + 1])/2);   // Loch für das Gebiet und jede geladene Kachel
    if (T && pos[i] >= T.dx - half - 0.01 && pos[i + 1] <= T.dx + half + 0.01 && posZ[j] >= T.dz - half - 0.01 && posZ[j + 1] <= T.dz + half + 0.01) continue;
    const a = j*k + i, b = a + 1, c = a + k, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  return { v, idx: new Uint32Array(idx) };
}
// Kollision mit Gebäuden: Dreiecke in einem Raster von 8 m für die schnelle Suche
export const RW_GRID = 8;
// Kollisions-Dreiecke (je 9 Werte) und Hindernis-Quader (Bäume) setzen, Suchraster bauen
// Nur belegte Zellen werden angelegt (Map statt vollem Feld): Vorher wuchs das Feld mit dem Quadrat der Entfernung der
// weitesten Kachel (Kachel 4 km weg: 1,4 Mio. leere Zellen, 265 ms und 164 MB bei jeder neuen Kachel; Prüfbericht Nr. 12).
// Feste Lage des Rasters: 4096 Zellen je Achse um den Ursprung (±16 km, mehr als die Umgebung).
const GRID_M = 4096;
export function rwSetTris(tris, boxes = []) {
  rw.tris = tris;
  const G = RW_GRID, m = GRID_M, half = m*G/2, cells = new Map(), T = tris;
  const ci = x => clamp(Math.floor((x + half)/G), 0, m - 1);
  const cell = k => { let c = cells.get(k); if (!c) { c = { t: [], b: [] }; cells.set(k, c); } return c; };
  for (let t = 0; t < T.length/9; t++) {
    const o = t*9, x0 = Math.min(T[o], T[o + 3], T[o + 6]), x1 = Math.max(T[o], T[o + 3], T[o + 6]);
    const z0 = Math.min(T[o + 2], T[o + 5], T[o + 8]), z1 = Math.max(T[o + 2], T[o + 5], T[o + 8]);
    for (let j = ci(z0); j <= ci(z1); j++) for (let i = ci(x0); i <= ci(x1); i++) cell(j*m + i).t.push(t);
  }
  for (const b of boxes) for (let j = ci(b.c[2] - b.h[2]); j <= ci(b.c[2] + b.h[2]); j++) for (let i = ci(b.c[0] - b.h[0]); i <= ci(b.c[0] + b.h[0]); i++) cell(j*m + i).b.push(b);
  rw.grid = { m, cells, ci, seen: new Uint32Array(T.length/9) };
}
// Was liegt in der Nähe von (x, z) im Umkreis R? Dreiecks-Nummern und Hindernis-Quader (Bäume), ohne Doppelte.
// Doppelte erkennt eine Marke je Dreieck (Feld fester Größe statt einer Map, die mit jedem Dreieck wuchs).
let stamp = 0;
export function rwNear(x, z, R) {
  const g = rw.grid, tris = [], boxes = [];
  if (!g) return { tris, boxes };
  if (++stamp > 0xfffffff0) { stamp = 1; g.seen.fill(0); }
  const seen = g.seen;
  for (let j = g.ci(z - R); j <= g.ci(z + R); j++) for (let i = g.ci(x - R); i <= g.ci(x + R); i++) {
    const c = g.cells.get(j*g.m + i);
    if (!c) continue;
    for (const t of c.t) if (seen[t] !== stamp) { seen[t] = stamp; tris.push(t); }
    for (const b of c.b) if (b.st !== stamp) { b.st = stamp; boxes.push(b); }
  }
  return { tris, boxes };
}

// Gewässer (Basis-DLM): Bitmaske meta.water.n x n (1 m), Zeile 0 = Norden. Die Wasseroberfläche liegt auf dem
// Höhenmodell (dort ist es die Wasserlinie) plus WATER_UP; als flacher Spiegel, das Ufer bildet das Gelände.
export const WATER_UP = 0.25;
// Wasserprüfung für eine Kachel aus Maske und Raster (Weltkoordinaten, Kachelmitte bei dx, dz). Für die Bäume eines frisch
// geladenen Gebiets statt waterAt: das liest aus rw.main, und das ist beim Übernehmen noch das alte Gebiet (beim Start lädt
// main.js immer erst Monschau; jeder spätere Ort prüfte seine Bäume gegen die Monschau-Maske, Prüfbericht 08.11.2026).
export function rwWetFn(bits, w, dx, dz) {
  if (!bits || !w) return () => false;
  const S = rw.size;
  return (x, z) => { const i = Math.floor((x - dx + S/2)/w.res), j = Math.floor((z - dz + S/2)/w.res), b = j*w.n + i;
    return i >= 0 && j >= 0 && i < w.n && j < w.n && (bits[b >> 3] >> (b & 7) & 1) === 1; };
}
export function waterAt(x, z) {
  if (!rw.on) return false;
  const T = rwTileAt(x, z) || rw.main, bits = T ? T.water : rw.water, w = T ? T.wmeta : rw.meta && rw.meta.water;
  if (!bits || !w) return false;
  const ox = T ? T.dx : 0, oz = T ? T.dz : 0, i = Math.floor((x - ox + rw.size/2)/w.res), j = Math.floor((z - oz + rw.size/2)/w.res);
  if (i < 0 || j < 0 || i >= w.n || j >= w.n) return false;
  const b = j*w.n + i;
  return (bits[b >> 3] >> (b & 7) & 1) === 1;
}
// Netz für das Wasser: Raster 2 m über den nassen Zellen, Höhe aus dem Gelände. Alpha WATER_A kennzeichnet Wasser für den
// Shader (dort: Luftbild des Flusses getönt, Spiegelung, Wellen); die Farbe ist nur die Tönung. Die Länge der Normale trägt
// 1 + Anteil nasser Zellen um die Ecke (0 am Ufer, 1 im Fluss): der Shader blendet damit den Rand weich ins Ufer.
export const WATER_A = 0.7;
export function rwWaterMesh(T = rw.main) {
  const out = [], w = T ? T.wmeta : rw.meta && rw.meta.water, bits = T ? T.water : rw.water, ox = T ? T.dx : 0, oz = T ? T.dz : 0;
  if (!bits || !w) return new Float32Array(0);
  const on = rw.on; rw.on = true;
  // Raster über allen nassen Zellen, etwa 4 m nach außen erweitert. Wasserspiegel je Ecke: über Wasser das Flussbett (Wasserlinie
  // im Höhenmodell), am Ufer der tiefste Boden der nassen Zellen im Umkreis von 5 m; dazu WATER_UP. Das Ufer entsteht dort, wo
  // das Gelände den Spiegel überragt: keine Treppen am Rand, kein Streifen, der unter das Gelände taucht.
  // Die Ecken liegen auf dem Gitter des Geländenetzes (eine Rasterzelle, knapp 2 m; die Geländeecken sind jede zweite davon), die
  // Dreiecke haben dieselbe Diagonale wie rwMesh und groundH. So liegt jedes Wasserdreieck in der Ebene eines Geländedreiecks, genau
  // WATER_UP darüber. Vorher ein eigenes 2-m-Raster ab dem Rand: Über dem unruhigen Höhenmodell des Rheins (Laser über Wasser, Wellen
  // bis 5 m) kamen sich Fläche und Flussbett an den Knicken der Geländedreiecke näher als die Tiefenauflösung, und das Bett schien
  // aus der Höhe in eckigen Flecken durch (Nutzer, Köln aus 150 m; mit großem Polygon-Offset verschwanden die Flecken, Beleg).
  const n = w.n, res = w.res, h = rw.size/2, N = T ? T.n : rw.n, G = rw.size/N, m = N + 1;
  const wet = (i, j) => { if (i < 0 || j < 0 || i >= n || j >= n) return false; const b = j*n + i; return (bits[b >> 3] >> (b & 7) & 1) === 1; };
  const near = new Uint8Array(m*m);   // Ecke liegt höchstens 3 m von nassen Zellen
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (wet(i, j)) {
    const gi = Math.round((i + 0.5)*res/G), gj = Math.round((j + 0.5)*res/G);
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (gi + x >= 0 && gj + y >= 0 && gi + x < m && gj + y < m) near[(gj + y)*m + gi + x] = 1;
  }
  // Bodenhöhe je nasser Zelle nur einmal rechnen (jede wird von bis zu 80 Ecken gefragt; groundH ist die gezeichnete Fläche)
  const hc = new Float32Array(n*n).fill(NaN), cellH = (i, j) => { const k = j*n + i; let v = hc[k]; if (v !== v) v = hc[k] = groundH((i + 0.5)*res - h + ox, (j + 0.5)*res - h + oz); return v; };
  const lvl = new Float32Array(m*m).fill(NaN), shore = new Float32Array(m*m);
  for (let gj = 0; gj < m; gj++) for (let gi = 0; gi < m; gi++) {
    if (!near[gj*m + gi]) continue;
    const ci = Math.round(gi*G/res), cj = Math.round(gj*G/res);
    let lo = Infinity, nw = 0;
    for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (x*x + y*y <= 25 && wet(ci + x, cj + y)) { lo = Math.min(lo, cellH(ci + x, cj + y)); if (Math.abs(x) <= 2 && Math.abs(y) <= 2) nw++; }
    const x = gi*G - h + ox, z = gj*G - h + oz;   // über Wasser: genau das Flussbett (Wehre, Gefälle; parallel zum Gelände); am Ufer: tiefster Wert, damit das Gelände den Rand bildet
    if (lo < Infinity) lvl[gj*m + gi] = (wet(ci, cj) ? groundH(x, z) : lo) + WATER_UP;
    shore[gj*m + gi] = nw/25;   // Anteil nasser Zellen in 5 x 5 m um die Ecke
  }
  const col = [0.20, 0.30, 0.38];   // Tönung über dem Luftbild: graublau, gedämpft (Schätzung, Flusswasser im Mittelgebirge)
  for (let gj = 0; gj + 1 < m; gj++) for (let gi = 0; gi + 1 < m; gi++) {
    const k = [gj*m + gi, gj*m + gi + 1, (gj + 1)*m + gi + 1, (gj + 1)*m + gi];
    if (k.some(q => Number.isNaN(lvl[q]))) continue;
    const P = q => [(q % m)*G - h + ox, lvl[q], Math.floor(q/m)*G - h + oz, 1 + shore[q]];
    const [a, b, d, c] = k.map(P);   // a (gi, gj), b rechts, c unten, d rechts unten; Diagonale b-c wie rwMesh
    for (const p of [a, c, b, b, c, d]) out.push(p[0], p[1], p[2], 0, p[3], 0, col[0], col[1], col[2], WATER_A);
  }
  rw.on = on;
  return new Float32Array(out);
}

// Kartenebenen (Basis-DLM, nur Anzeige): Bänder auf dem Gelände für Bäche, Straßen, Brücken und Waldränder,
// Farben wie auf einer Karte. Höhe 0,5 m über dem Höhenmodell, Punkte alle 3 m (folgt dem Gelände).
export const RW_LAYERS = {
  streams: { w: 2.5, col: [0.25, 0.5, 0.9] }, roads: { w: 1.0, col: [0.98, 0.86, 0.4] },
  bridges: { w: 3.0, col: [1.0, 0.5, 0.15] }, forest: { w: 1.2, col: [0.1, 0.38, 0.16] } };
export function rwFeatureMesh() {
  const F = rw.features, out = [];
  if (!F) return new Float32Array(0);
  const on = rw.on; rw.on = true;
  const vtx = (x, z, col) => out.push(x, groundH(x, z) + 0.5, z, 0, 1, 0, col[0], col[1], col[2], 1);
  for (const [key, st] of Object.entries(RW_LAYERS)) for (const f of F[key] || []) {
    const pts = [];   // alle 3 m ein Punkt
    for (let i = 0; i + 1 < f.pts.length; i++) {
      const [ax, az] = f.pts[i], [bx, bz] = f.pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az)/3));
      for (let k = 0; k < n; k++) pts.push([ax + (bx - ax)*k/n, az + (bz - az)*k/n]);
    }
    pts.push(f.pts[f.pts.length - 1]);
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], l = Math.hypot(bx - ax, bz - az) || 1, px = -(bz - az)/l*st.w/2, pz = (bx - ax)/l*st.w/2;
      vtx(ax - px, az - pz, st.col); vtx(bx - px, bz - pz, st.col); vtx(bx + px, bz + pz, st.col);
      vtx(ax - px, az - pz, st.col); vtx(bx + px, bz + pz, st.col); vtx(ax + px, az + pz, st.col);
    }
  }
  rw.on = on;
  return new Float32Array(out);
}
// Name der nächsten Straße oder des nächsten Gewässers im Umkreis r (für die Anzeige), sonst ''
// Welt-Schnittstelle für den Platzierungsdienst (place.js): Boden, Wasser, freie Kugel (Gebäude-Dreiecke, Bäume als Quader,
// Boden), erlaubtes Rechteck (Startgebiet, 1 x 1 km), Startplatz.
export function placeReal() {
  const S = rw.size/2;
  const free = (p, r) => {
    if (p[1] - r < groundH(p[0], p[2])) return false;
    const n = rwNear(p[0], p[2], r + 1), T = rw.tris;
    for (const t of n.tris) { const o = t*9; if (ptTriDist(p, [T[o], T[o + 1], T[o + 2]], [T[o + 3], T[o + 4], T[o + 5]], [T[o + 6], T[o + 7], T[o + 8]]) < r) return false; }
    for (const b of n.boxes) if (Math.hypot(Math.max(0, Math.abs(p[0] - b.c[0]) - b.h[0]), Math.max(0, Math.abs(p[1] - b.c[1]) - b.h[1]), Math.max(0, Math.abs(p[2] - b.c[2]) - b.h[2])) < r) return false;
    return true;
  };
  return { groundH, wet: waterAt, free, bounds: [-S, -S, S, S], home: rw.meta.home.slice() };
}
export function rwNearName(x, z, r = 30) {
  const F = rw.features;
  if (!F || !rw.on) return '';
  let best = '', bd = r;
  for (const key of ['streams', 'roads']) for (const f of F[key] || []) {   // live geladene Orte haben nur Ortsnamen
    if (!f.name) continue;
    for (let i = 0; i + 1 < f.pts.length; i++) {
      const [ax, az] = f.pts[i], [bx, bz] = f.pts[i + 1], dx = bx - ax, dz = bz - az, L = dx*dx + dz*dz;
      const t = L ? clamp(((x - ax)*dx + (z - az)*dz)/L, 0, 1) : 0, d = Math.hypot(x - ax - dx*t, z - az - dz*t);
      if (d < bd) { bd = d; best = f.name; }
    }
  }
  return best;
}

// Gebäude (LoD2) und Bäume übernehmen. b16: Ecken in dm (Karte), erst meta.roofTris Dächer, dann Wände, dahinter je Dreieck
// die Gebäudenummer. t16: Bäume x, z, Höhe, Kronenradius in dm, Fuß auf dem Gelände.
export function rwModels(b16, t16, wetBits = rw.water) {
  const on = rw.on; rw.on = true;   // Bodenhöhe der Bäume braucht das Gelände
  // Wasser aus den neuen Daten (rwWetFn), nicht waterAt: das sähe hier noch das alte rw.main. Bäume prüfen auch bei
  // abgeschalteter Ebene „Gewässer“ gegen das echte Wasser (wetBits)
  // Erst das Gelände eintragen, dann die Modelle: sonst misst groundH den Fuß der Bäume beim ersten Gebiet auf der groben
  // Umgebung (kein rw.main) und bei jedem weiteren auf dem alten rw.main (gefunden mit dem Reiter „Debug“: 7 von 2 962 Bäumen)
  rw.main = { i: 0, j: 0, dx: 0, dz: 0, n: rw.n, cell: rw.cell, h: rw.h, water: rw.water, wmeta: rw.meta.water, dop: rw.dop, tris: new Float32Array(0), nr: 0, trees: [] };
  Object.assign(rw.main, rwTileModels(b16, t16, rw.meta, 0, 0, 0, groundH, rwWetFn(wetBits, rw.meta.water, 0, 0)));
  rw.bldId = rw.main.bldId; rw.bldInfo = rw.main.bldInfo;
  rw.on = on;
  rwRebuild();
}
// Gebäude und Bäume einer Kachel aus den gepackten Daten (wie realworld/<name>.bld/.trees), verschoben um (dx, dy, dz) in die Welt.
// hAt(x, z) liefert die Bodenhöhe für den Fuß der Bäume (Weltkoordinaten). wet(x, z): Wasser dort? Dann ist die „Baumspitze“
// kein Baum, sondern meist eine Brücke (Oberfläche minus Gelände über dem Fluss, z. B. Hohenzollernbrücke Köln).
// Geprüft wird nicht nur die Spitze: Sie liegt im 2-m-Raster der Oberfläche (±1 m unscharf), darum auch 8 Punkte in 1,5 m
// Abstand. Dazu: Liegt Wasser im Kronenkreis und der Fuß unter dessen Spiegel, steht der Baum im Flussbett (Uferböschung,
// Brückenrand); Nutzer sah Stämme im Wasser (Monschau: 49 Spitzen, dazu etwa 30 Kronen von 3 031).
export function rwTileModels(b16, t16, meta, dx, dy, dz, hAt, wet = () => false) {
  if (!rw.show.bld) meta = { ...meta, roofTris: 0, wallTris: 0, buildings: 0 };   // Ebenen (Reiter „Debug“)
  if (!rw.show.trees) t16 = [];
  const nt = meta.roofTris + meta.wallTris, tris = new Float32Array(nt*9);
  for (let i = 0; i < nt*9; i += 3) { tris[i] = b16[i]/10 + dx; tris[i + 1] = b16[i + 1]/10 + dy; tris[i + 2] = b16[i + 2]/10 + dz; }
  const bldId = b16.slice(nt*9, nt*9 + nt), nb = meta.buildings || 0;   // je Gebäude: Fassadenklasse (0 bis 8) + 16 x Flachdach
  const bldInfo = b16.length >= nt*10 + nb && nb ? b16.slice(nt*10, nt*10 + nb) : null, trees = [];
  const wetTree = (x, z, r, y0) => {
    for (let k = 0; k < 8; k++) { const a = k*Math.PI/4; if (wet(x + Math.cos(a)*1.5, z + Math.sin(a)*1.5)) return true; }
    const R = Math.ceil(r);
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) if (i*i + j*j <= r*r && wet(x + i, z + j) && y0 < hAt(x + i, z + j) + WATER_UP) return true;
    return false;
  };
  for (let k = 0; k + 3 < t16.length; k += 4) {
    const x = t16[k]/10 + dx, z = t16[k + 1]/10 + dz, h = t16[k + 2]/10, r = t16[k + 3]/10;
    if (wet(x, z)) continue;
    const y0 = hAt(x, z);
    if (wetTree(x, z, r, y0)) continue;
    const ch = Math.min(h*0.65, Math.max(2, h - 1.5));   // Krone: obere zwei Drittel, Stamm darunter (Schätzung)
    trees.push({ x, z, y0, h, r, boxes: [
      { c: [x, y0 + (h - ch)/2, z], h: [0.15 + h*0.006, (h - ch)/2, 0.15 + h*0.006], cs: 1, sn: 0 },   // Stamm
      { c: [x, y0 + h - ch/2, z], h: [r*0.8, ch/2, r*0.8], cs: 1, sn: 0 } ] });                     // Krone
  }
  return { tris, nr: meta.roofTris, bldId, bldInfo, trees };
}
// Kollision und Listen aus Startgebiet und Kacheln neu zusammensetzen (nach Laden oder Entladen einer Kachel)
export function rwRebuild() {
  tileByCode = new Map([...rw.tiles.values()].map(T => [tileCode(T.i, T.j), T]));
  const all = [rw.main, ...rw.tiles.values()].filter(Boolean), n = all.reduce((t, T) => t + T.tris.length, 0), tris = new Float32Array(n);
  let o = 0; for (const T of all) { tris.set(T.tris, o); o += T.tris.length; }
  rw.trees = all.flatMap(T => T.trees);
  rwSetTris(tris, rw.trees.flatMap(t => t.boxes));
  rw.tileVer++;
}
// Netz der Gebäude und Bäume. Je Gebäude Farben nach Nutzung (ALKIS-Gebäudefunktion aus LoD2): Putz, Metall, Holz,
// Naturstein; Dächer Schiefer, Ziegel, Grau, Flachdächer Kies/Bitumen (Farbtöne: Schätzung für die Eifel).
// Wände: Alpha 0,13 bis 0,49 = Fassade; darin stecken Klasse und Sockelhöhe (rwWallAlpha), in der Länge der Normale die
// Traufhöhe (rwWallNl). Dächer: Alpha 0,6, Farbe aus dem Luftbild. Der Shader zeichnet danach
// Fenster, Läden, Tore, Bretter, Mauerwerk oder Fachwerk. Bäume: Stamm und runde Krone in der Farbe des Luftbilds (Alpha 0,08).
// Putz gedämpft (Weiß gebrochen, Ocker, Grau, Graugrün), dazu Schieferverkleidung (dunkelgrau, in der Eifel verbreitet)
const WALLS = [[0.84, 0.82, 0.78], [0.82, 0.77, 0.68], [0.74, 0.73, 0.71], [0.78, 0.69, 0.55], [0.86, 0.85, 0.81], [0.6, 0.62, 0.65],
  [0.72, 0.74, 0.69], [0.8, 0.74, 0.66], [0.36, 0.38, 0.42]];
const ROOFS = [[0.26, 0.28, 0.32], [0.3, 0.31, 0.35], [0.48, 0.24, 0.18], [0.24, 0.25, 0.28], [0.42, 0.41, 0.4]];
const FLAT = [[0.42, 0.42, 0.41], [0.34, 0.34, 0.35], [0.47, 0.45, 0.41]];
const WALL_BY = { 3: [[0.66, 0.68, 0.7], [0.52, 0.58, 0.64], [0.76, 0.74, 0.68], [0.48, 0.52, 0.56]], 4: [[0.42, 0.3, 0.2], [0.36, 0.26, 0.18], [0.5, 0.38, 0.26]],
  6: [[0.58, 0.53, 0.47], [0.52, 0.49, 0.45], [0.62, 0.58, 0.52]], 7: [[0.94, 0.92, 0.87]], 8: [[0.62, 0.62, 0.6]] };   // 8 Brücke: Beton (Schätzung)
const BRIDGE_ROOF = [0.56, 0.56, 0.54];   // Brückendeck: grau, Asphalt/Beton (Schätzung); das Luftbild liefert den Rest
// Wand-Alpha: Klasse k (0 bis 8, 7 = Fachwerk, 8 = Brücke) und Sockelhöhe y (-190 bis 190 m). Der Shader rechnet zurück.
export const rwWallNl = e => 2 + clamp(e, 0, 99)/100;
export const rwWallAlpha = (y, k = 0) => 0.132 + k*0.04 + (clamp(y, -190, 190) + 190)/380*0.035;
export function rwModelMesh(S = rw.main) {
  const T = S.tris, nr = S.nr, nt = T ? T.length/9 : 0;
  // vorab reserviert (je Dreieck 30 Werte; Baum: 8 Stamm- und 48 Kronendreiecke): ohne wachsende Liste, 2- bis 3-mal schneller
  const out = new Float32Array((nt + S.trees.length*56)*30);
  let w = 0;
  const tri = (a, b, c, col, al, up, nl = 1) => {
    let n = [(b[1] - a[1])*(c[2] - a[2]) - (b[2] - a[2])*(c[1] - a[1]), (b[2] - a[2])*(c[0] - a[0]) - (b[0] - a[0])*(c[2] - a[2]), (b[0] - a[0])*(c[1] - a[1]) - (b[1] - a[1])*(c[0] - a[0])];
    const l = Math.hypot(...n);
    if (l < 1e-9) return;   // Dreieck ohne Fläche (kommt in LoD2 vor): unsichtbar, weglassen
    n = n.map(v => v/l);
    if (up && n[1] < 0) n = n.map(v => -v);
    for (const p of [a, b, c]) { out[w] = p[0]; out[w + 1] = p[1]; out[w + 2] = p[2]; out[w + 3] = n[0]*nl; out[w + 4] = n[1]*nl; out[w + 5] = n[2]*nl; out[w + 6] = col[0]; out[w + 7] = col[1]; out[w + 8] = col[2]; out[w + 9] = al; w += 10; }
  };
  const hash = i => { const k = Math.sin(i*12.9898 + 4.1)*43758.5453; return k - Math.floor(k); };
  const base = new Map();   // tiefster Punkt je Gebäude (Sockel)
  for (let t = nr; t < nt; t++) { const id = S.bldId ? S.bldId[t] : 0, y = Math.min(T[t*9 + 1], T[t*9 + 4], T[t*9 + 7]); base.set(id, Math.min(base.get(id) ?? 1e9, y)); }
  // Traufhöhe je Wandfläche: Dreiecke eines Gebäudes in derselben Ebene bilden eine Wand. Traufe = höchster der Punkte an
  // den beiden seitlichen Enden der Wand (beim Giebel die Schultern, sonst die Oberkante). Darüber zeichnet der Shader keine Fenster.
  const eave = new Float32Array(nt), groups = new Map();
  for (let t = nr; t < nt; t++) {
    const o = t*9, ux = T[o + 3] - T[o], uy = T[o + 4] - T[o + 1], uz = T[o + 5] - T[o + 2], vx = T[o + 6] - T[o], vy = T[o + 7] - T[o + 1], vz = T[o + 8] - T[o + 2];
    let nx = uy*vz - uz*vy, nz = ux*vy - uy*vx; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    if (nx < -1e-6 || (Math.abs(nx) <= 1e-6 && nz < 0)) { nx = -nx; nz = -nz; }
    const key = (S.bldId ? S.bldId[t] : 0) + ':' + Math.round(Math.atan2(nz, nx)*30) + ':' + Math.round((nx*T[o] + nz*T[o + 2])*4);
    if (!groups.has(key)) groups.set(key, { tx: -nz, tz: nx, t: [] });
    groups.get(key).t.push(t);
  }
  for (const g of groups.values()) {
    let lo = Infinity, hi = -Infinity; const P = [];
    for (const t of g.t) for (let k = 0; k < 3; k++) { const o = t*9 + k*3, u = T[o]*g.tx + T[o + 2]*g.tz; P.push([u, T[o + 1]]); lo = Math.min(lo, u); hi = Math.max(hi, u); }
    let e = -Infinity; for (const [u, y] of P) if (u - lo < 0.3 || hi - u < 0.3) e = Math.max(e, y);
    for (const t of g.t) eave[t] = e;
  }
  const top = new Map();   // höchster Punkt je Gebäude (für Fachwerk nur bei niedrigen Häusern)
  for (let t = 0; t < nt; t++) { const id = S.bldId ? S.bldId[t] : 0, y = Math.max(T[t*9 + 1], T[t*9 + 4], T[t*9 + 7]); top.set(id, Math.max(top.get(id) ?? -1e9, y)); }
  const kind = id => {   // Fassadenklasse; Fachwerk (7) für etwa ein Drittel der niedrigen Wohnhäuser (Annahme: typisch für Monschau, nicht aus den Daten)
    const k = S.bldInfo ? S.bldInfo[id] & 15 : 0, hb = top.get(id) - (base.get(id) ?? 0);
    // Brücken (8): LoD2 NRW führt sie als Platten von 1,2 bis 1,6 m Dicke (bldg:function 53001_1800). Gebiete, die vor dieser
    // Klasse gepackt wurden (eingebettetes Monschau, gespeicherte Orte), haben sie als Klasse 0: dort gilt jede Platte unter 2 m
    // als Brücke (kein Haus ist so niedrig; Schätzung). Vorher wurden Brücken als Wohnhaus gezeichnet, ein Drittel mit Fachwerk.
    if (k === 8 || (k === 0 && hb < 2)) return 8;
    return (k === 0 || k === 1) && hb < 13 && hash(id + 311) < 0.35 ? 7 : k;
  };
  for (let t = 0; t < nt; t++) {
    const o = t*9, a = [T[o], T[o + 1], T[o + 2]], b = [T[o + 3], T[o + 4], T[o + 5]], c = [T[o + 6], T[o + 7], T[o + 8]], id = S.bldId ? S.bldId[t] : 0;
    const flat = S.bldInfo && S.bldInfo[id] & 16, k = kind(id), pal = WALL_BY[k] || WALLS;
    // Dach: Alpha 0,6 = Dachfläche aus dem Luftbild; die Farbe hier gilt nur außerhalb des Bildes und als leichte Beimischung
    if (t < nr) tri(a, b, c, k === 8 ? BRIDGE_ROOF : flat || k === 2 ? FLAT[Math.floor(hash(id)*FLAT.length)] : ROOFS[Math.floor(hash(id)*ROOFS.length)], 0.6, true);
    else {   // Wand: Länge der Normale = 2 + Traufhöhe über dem Sockel / 100 (der Shader liest sie zurück)
      const b0 = base.get(id) ?? 0;
      tri(a, b, c, pal[Math.floor(hash(id + 77)*pal.length)], rwWallAlpha(b0, k), false, rwWallNl(eave[t] - b0));
    }
  }
  const bark = [0.32, 0.24, 0.17];
  for (const tr of S.trees) {
    const [st, cr] = tr.boxes, w = st.h[0], y1 = st.c[1] + st.h[1], y0 = tr.y0 - 0.3;
    for (const [dx, dz, ex, ez] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
      const p = [tr.x + dx*w, y0, tr.z + dz*w], q = [tr.x + ex*w, y0, tr.z + ez*w];
      tri(p, q, [q[0], y1, q[2]], bark, 1, false); tri(p, [q[0], y1, q[2]], [p[0], y1, p[2]], bark, 1, false);
    }
    // Krone rund: acht Seiten, Ringe auf 20, 45, 75 % der Höhe (Radius 0,8 / 1 / 0,7), Spitze und Unterseite leicht gewölbt
    const y0c = cr.c[1] - cr.h[1], hc = 2*cr.h[1], r = tr.r, rot = tr.x*0.7 + tr.z*1.3, col = [0.3, 0.4, 0.25], N = 8;
    const ringAt = (f, rr) => Array.from({ length: N }, (_, i) => { const a = rot + i*2*Math.PI/N; return [tr.x + Math.cos(a)*rr, y0c + f*hc, tr.z + Math.sin(a)*rr]; });
    const R = [ringAt(0.2, r*0.8), ringAt(0.45, r), ringAt(0.75, r*0.7)], bot = [tr.x, y0c + 0.05*hc, tr.z], top = [tr.x, y0c + hc, tr.z];
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      tri(R[0][j], R[0][i], bot, col, 0.08, false);
      for (let k = 0; k < 2; k++) { tri(R[k][i], R[k][j], R[k + 1][j], col, 0.08, false); tri(R[k][i], R[k + 1][j], R[k + 1][i], col, 0.08, false); }
      tri(R[2][i], R[2][j], top, col, 0.08, true);
    }
  }
  return out.slice(0, w);
}

// Kartenpunkt (x, z) -> Breite, Länge in Grad (WGS84). Gebiet in UTM 32, Mitte = Ursprung, z nach Süden.
export function rwLatLon(x, z) {
  const b = rw.meta.bbox;
  return fromUtm((b[0] + b[2])/2 + x, (b[1] + b[3])/2 - z, +(rw.meta.crs.match(/258(\d\d)/) || [0, 32])[1]);
}
// Ortsmitten für die Anzeige der nächsten Orte (Nutzer, Prompt 165; ersetzt die Anzeige der Türme): je Name die Mitte der größten
// Ortsfläche (Schwerpunkt der Fläche), aus den Ortslagen des Basis-DLM (eingebautes Monschau und Landesdaten geladener Orte).
let placeCache = { ver: -1, list: [] };
export function rwPlaceCenters() {
  if (placeCache.ver === rw.ver) return placeCache.list;
  const best = new Map();
  for (const p of (rw.features && rw.features.places) || []) for (const r of p.rings) {
    let a = 0, cx = 0, cz = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const k = r[j][0]*r[i][1] - r[i][0]*r[j][1]; a += k; cx += (r[j][0] + r[i][0])*k; cz += (r[j][1] + r[i][1])*k; }
    if (Math.abs(a) < 1) continue;
    const o = best.get(p.name);
    if (!o || Math.abs(a) > o.area) best.set(p.name, { name: p.name, x: cx/(3*a), z: cz/(3*a), area: Math.abs(a)/2 });
  }
  placeCache = { ver: rw.ver, list: [...best.values()] };
  return placeCache.list;
}
// Nächster Ort (Ortslagen aus dem Basis-DLM, 8 km Umkreis): { name, d: Abstand in m (0 = im Ort), dir: Himmelsrichtung vom Punkt aus }
const DIRS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
export function rwPlace(x, z) {
  const pl = rw.features && rw.features.places;
  if (!pl || !pl.length) return null;
  let best = null;
  for (const p of pl) {
    let inside = false, d2 = Infinity, q = null;
    for (const r of p.rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [ax, az] = r[j], [bx, bz] = r[i];
      if ((az > z) !== (bz > z) && x < ax + (z - az)*(bx - ax)/(bz - az)) inside = !inside;
      const ex = bx - ax, ez = bz - az, t = clamp(((x - ax)*ex + (z - az)*ez)/(ex*ex + ez*ez || 1), 0, 1), cx = ax + ex*t, cz = az + ez*t, dd = (x - cx)**2 + (z - cz)**2;
      if (dd < d2) { d2 = dd; q = [cx, cz]; }
    }
    const d = inside ? 0 : Math.sqrt(d2);
    if (!best || d < best.d) best = { name: p.name, d, q };
  }
  const a = Math.atan2(best.q[0] - x, -(best.q[1] - z));   // 0 = Norden, im Uhrzeigersinn
  best.dir = DIRS[Math.round(((a/(Math.PI/4)) % 8 + 8)) % 8];
  delete best.q;
  return best;
}

// Landesdaten einer Quelle (Basis-DLM: Gewässerflächen, Ortslagen) einmal laden und speichern (L4). store.landPut(key, bytes),
// Schlüssel = Paket-Adresse:Datei (eine Kopie der Vorlage nutzt dieselben Daten).
// Teilabrufe aus dem großen ZIP (Größe per HEAD). say(Text, Anteil) meldet MB.
export async function rwLandData(src, store, say = () => {}, signal) {
  const d = src.dlm, files = [d.water, ...d.places];
  const fail = e => { if (e.name === 'AbortError') throw new Error('Abgebrochen'); throw new Error('Keine Verbindung zu ' + d.url.split('/')[2] + ' (offline oder Zugriff gesperrt)'); };
  const h = await fetch(d.url, { method: 'HEAD', signal }).catch(fail), total = +h.headers.get('content-length');
  if (!h.ok || !total) throw new Error('Größe des Pakets unbekannt (' + h.status + ')');
  const range = async (a, b, prog) => {
    const r = await fetch(d.url, { headers: { Range: `bytes=${a}-${b}` }, signal }).catch(fail);
    if (r.status !== 206) throw new Error('Server liefert keine Teilabrufe (' + r.status + ')');
    return readBody(r, prog);
  };
  let done = 0;
  for (const f of files) {
    say('Suche ' + f, done/d.mb);
    const e = await dlmFind((a, b) => range(a, b), total, f);
    if (!e) throw new Error(f + ' nicht im Paket');
    if (e.method !== 0) throw new Error(f + ' ist gepackt (nicht unterstützt)');
    const b = await range(e.off, e.off + e.size - 1, n => say(f + ' (' + ((done + n/1e6)).toFixed(0) + ' von ' + d.mb + ' MB)', Math.min(1, (done + n/1e6)/d.mb)));
    if (!await store.landPut(d.url + ':' + f, b)) throw new Error('Speichern im Browser nicht möglich (Speicher voll oder gesperrt)');
    done += b.length/1e6;
  }
  return done;
}
export async function rwLandHas(src, store) {
  if (!src.dlm || !store) return false;
  for (const f of [src.dlm.water, ...src.dlm.places]) if (!await store.landHas(src.dlm.url + ':' + f)) return false;
  return true;
}

// ---- L5b: Kacheln beim Fliegen nachladen ----
// Raster der Gebietsgröße (1 km) um das Startgebiet, höchstens 4 Kacheln weit (Umgebung 10 km). Laden, sobald die Drohne
// näher als near an eine fehlende Kachel kommt; entladen ab drop. Eine Kachel nach der anderen; Fehler: 60 s Pause für diese Kachel.
export const RW_STREAM = { near: 300, drop: 1600, max: 8, reach: 4, retry: 60000, dop: 2048 };
const tileDist = (i, j, x, z) => { const S = rw.size, dx = Math.max(0, Math.abs(x - i*S) - S/2), dz = Math.max(0, Math.abs(z - j*S) - S/2); return Math.hypot(dx, dz); };
// Welche Kachel als Nächstes? (nächste fehlende im Umkreis near) und welche können weg? Ohne Netz und Speicher testbar.
export function rwStreamPlan(x, z, now = Date.now()) {
  const drop = [...rw.tiles.values()].filter(T => tileDist(T.i, T.j, x, z) > RW_STREAM.drop).map(T => T.i + ',' + T.j);
  let next = null, best = Infinity;
  const ci = Math.round(x/rw.size), cj = Math.round(z/rw.size);
  for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
    const F = rw.far, fi = F ? F.cx/rw.size : 0, fj = F ? F.cz/rw.size : 0;   // Reichweite um die Mitte der Umgebung (wandert mit)
    if (Math.abs(i - fi) > RW_STREAM.reach || Math.abs(j - fj) > RW_STREAM.reach || Math.abs(i) > 60 || Math.abs(j) > 60 || rwHasTile(i, j)) continue;
    const k = i + ',' + j, d = tileDist(i, j, x, z), f = rw.tileFail.get(k);
    if (d > RW_STREAM.near || (f && now - f < RW_STREAM.retry)) continue;
    if (d < best) { best = d; next = [i, j]; }
  }
  return { next: rw.tiles.size - drop.length < RW_STREAM.max ? next : null, drop };
}
// Eine Kachel laden (aus dem Speicher oder von den Diensten) und als Kachel-Objekt liefern (Weltkoordinaten des Startgebiets)
export async function rwLoadTile(i, j, store, say = () => {}, signal) {
  const m = rw.meta, S = rw.size, ec = (m.bbox[0] + m.bbox[2])/2 + i*S, nc = (m.bbox[1] + m.bbox[3])/2 - j*S;
  const zone = +(m.crs.match(/258(\d\d)/) || [0, 32])[1], [lat, lon] = fromUtm(ec, nc, zone), plan = rwPlan(lat, lon, rwSources(), rw.liveDis || {});
  if (!plan) throw new Error('keine Quelle');
  const srcs = plan.srcs.filter(s => s.crs === m.crs);
  if (!srcs.length) throw new Error('anderes Koordinatensystem');
  if (srcs[0].store === false) store = null;   // nur Arbeitsspeicher (Lizenz der Quelle)
  const a = { bbox: [ec - S/2, nc - S/2, ec + S/2, nc + S/2], crs: m.crs, startNear: [ec, nc], name: 'kachel', place: lat.toFixed(5) + ', ' + lon.toFixed(5), attribution: '', dopN: RW_STREAM.dop };
  const key = rwAreaKey(lat, lon, srcs) + '|kachel';
  // schon geladen? als Kachel oder als gespeicherter Ort an genau dieser Stelle (der hat sogar das schärfere Luftbild)
  let p = store ? (await store.get(key)) || (await store.get(rwAreaKey(lat, lon, srcs))) : null, x = {};
  if (p && p.meta) {
    x = p.water || p.features ? { water: p.water, features: p.features } : await rwExtras(p, srcs[0], store);
    if (p.tile && store.touch) store.touch(key);   // wieder genutzt: bleibt länger im Zwischenspeicher
  }
  else {
    const opt = { far: false, async: true };
    if (srcs.length > 1) opt.cells = rwCellSources(a, srcs, plan.toLand);
    p = await rwFetch(a, srcs, say, signal, opt, store);
    if (signal && signal.aborted) throw new Error('Abgebrochen');
    if (!p.dop && srcs[0].kind === 'wms') p.dop = await rwWmsPhoto(srcs[0], a.bbox, a.crs, RW_WMS_IMG.tile, rwNet(signal).get).catch(() => null) || rwShadeImage(p.meta, p.q);   // Luftbild des Höhendienstes, sonst Relief
    x = await rwExtras(p, srcs[0], store);
    if (store) await store.put(key, { meta: p.meta, q: p.q, b16: p.b16, t16: p.t16, dop: p.dop, water: x.water || null, features: null, lat, lon, srcs: srcs.map(s => s.name), tile: true });
  }
  // Höhen relativ zum Startplatz des Startgebiets; Gebäude sind relativ zum eigenen Startplatz gepackt (dy gleicht aus)
  const n = p.meta.n, h = new Float32Array(n*n);
  for (let k = 0; k < n*n; k++) h[k] = p.meta.hMin + p.q[k]*p.meta.hScale - m.hHome;
  const T = { i, j, dx: i*S, dz: j*S, n, cell: S/n, h, water: rw.show.water ? x.water || null : null, wmeta: p.meta.water || null, dop: rw.show.dop ? p.dop : null, key, place: p.meta.place };
  const wet = rwWetFn(x.water || null, T.wmeta, T.dx, T.dz);
  // Bäume auf die gezeichnete Fläche, wie sie mit dieser Kachel aussieht (Ränder zur Umgebung eingeschlossen): Kachel dafür kurz
  // eintragen (ohne Warten dazwischen, die Physik sieht das nicht). Vorher: eigene Höhen ohne Rand, Bäume am Rand schwebten (Nr. 6).
  const code = tileCode(i, j), had = tileByCode.get(code), on = rw.on;
  tileByCode.set(code, T); rw.on = true;
  try { return Object.assign(T, rwTileModels(p.b16, p.t16, p.meta, T.dx, p.meta.hHome - m.hHome, T.dz, groundH, wet)); }
  finally { if (had) tileByCode.set(code, had); else tileByCode.delete(code); rw.on = on; }
}
// Ein Schritt (etwa jede Sekunde aus der Hauptschleife): entladen, was weit weg ist, und die nächste nötige Kachel laden.
// Liefert true, wenn sich etwas geändert hat. Ändert sich das Gebiet währenddessen (rw.ver), wird das Ergebnis verworfen.
export async function rwStreamStep(x, z, store, say = () => {}) {
  if (rw.on && rw.ready && rw.far && rw.stream && !rw.farBusy) rwFarStep(x, z, store);   // Umgebung mitwandern lassen (eigener Auftrag)
  if (!rw.on || !rw.ready || !rw.far || !rw.stream || rw.tileBusy) return false;
  const plan = rwStreamPlan(x, z);
  let changed = false;
  for (const k of plan.drop) { rw.tiles.delete(k); changed = true; }
  if (changed) rwRebuild();
  if (!plan.next) return changed;
  const [i, j] = plan.next, k = i + ',' + j, ver = rw.ver;
  // Laufender Auftrag mit eigenem Abbruch (Gebietswechsel bricht ab, siehe rwApply). Hängt ein Abruf, beendet ihn die Zeitgrenze
  // von rwNet; danach ist der Weg für die nächste Kachel frei (Prüfbericht Nr. 5).
  const job = { k, ac: new AbortController() };
  rw.tileBusy = job;
  try {
    const T = await rwLoadTile(i, j, store, say, job.ac.signal);
    if (rw.ver !== ver) return changed;
    rw.tiles.set(k, T); rwRebuild(); rw.tileErr = '';
    return true;
  } catch (e) { if (rw.ver === ver) { rw.tileFail.set(k, Date.now()); rw.tileErr = String(e.message || e); } return changed; }
  finally { if (rw.tileBusy === job) rw.tileBusy = null; }
}

// ---- Umgebung wandert mit (Prüfbericht Nr. 16) ----
// Die Umgebung (10 x 10 km grob) lag fest um den Start; ab 5 km kamen gerechnete Felder (Nutzer, Prompt 124). Jetzt: Ist die
// Drohne mehr als RW_FAR_MOVE von der Mitte der Umgebung entfernt (größerer der beiden Abstände), wird eine neue Umgebung um
// die Drohne geladen (Mitte im Raster der Gebietsgröße, so liegen Messpunkte und Kachelränder wie vorher aufeinander).
// Aus dem Speicher, sonst von den Diensten (im Hintergrund-Thread, wenn es ihn gibt); danach gespeichert wie eine Kachel
// (Zwischenspeicher, zählt zur Grenze für Kacheln). Fehler: 60 s Pause für diese Mitte, die alte Umgebung bleibt.
export const RW_FAR_MOVE = 1500;
export async function rwLoadFar(cx, cz, store, signal) {
  const m = rw.meta, S = rw.size, ec = (m.bbox[0] + m.bbox[2])/2 + cx, nc = (m.bbox[1] + m.bbox[3])/2 - cz;
  const zone = +(m.crs.match(/258(\d\d)/) || [0, 32])[1], [lat, lon] = fromUtm(ec, nc, zone), plan = rwPlan(lat, lon, rwSources(), rw.liveDis || {});
  const src = plan && plan.srcs.find(s => s.crs === m.crs && (s.dgm || s.kind === 'wms'));
  if (!src) throw new Error(plan ? 'anderes Koordinatensystem' : 'keine Quelle');
  if (src.store === false) store = null;   // nur Arbeitsspeicher (Lizenz der Quelle)
  const a = { bbox: [ec - S/2, nc - S/2, ec + S/2, nc + S/2], crs: m.crs }, key = rwAreaKey(lat, lon, [src]) + '|umgebung';
  const saved = store ? await store.get(key) : null;
  let F = saved && saved.farq ? { meta: saved.meta.far, q: saved.farq, dop: saved.fardop } : null;
  if (F && store.touch) store.touch(key);
  if (!F) {
    F = null;
    if (rw.work) try { F = await rw.work('far', { a, src }, () => {}, signal); } catch (e) { if (!e.noWorker) throw e; }
    if (!F) F = await rwFetchFar(a, src, rwNet(signal).get);
    if (signal && signal.aborted) throw new Error('Abgebrochen');
    if (!F.dop && src.kind === 'wms') F.dop = await rwWmsPhoto(src, farBox(a), a.crs, RW_WMS_IMG.far, rwNet(signal).get).catch(() => null);
    if (store) await store.put(key, { meta: { place: 'Umgebung ' + lat.toFixed(3) + ', ' + lon.toFixed(3), buildings: 0, trees: 0, far: F.meta }, farq: F.q, fardop: F.dop || null,
      q: null, b16: null, t16: null, dop: null, lat, lon, srcs: [src.name], tile: true });
  }
  return { grid: rwFarGrid(F, m.hHome, cx, cz), dop: F.dop || null };
}
export async function rwFarStep(x, z, store) {
  const F = rw.far;
  if (!F || rw.farBusy) return false;
  const S = rw.size, cx = Math.round(x/S)*S, cz = Math.round(z/S)*S, k = cx + ',' + cz, f = rw.farFail.get(k);
  if (Math.max(Math.abs(x - F.cx), Math.abs(z - F.cz)) < RW_FAR_MOVE || (cx === F.cx && cz === F.cz)) return false;
  if (f && Date.now() - f < RW_STREAM.retry) return false;
  const job = { ac: new AbortController() }, ver = rw.ver;
  rw.farBusy = job;
  try {
    const G = await rwLoadFar(cx, cz, store, job.ac.signal);
    if (rw.ver !== ver) return false;
    rw.far = G.grid; rw.farDop = rw.show.dop ? G.dop : null; rw.farVer++;   // Bild tauscht, sobald Netz und Luftbild fertig sind (render.js)
    return true;
  } catch (e) { if (rw.ver === ver) { rw.farFail.set(k, Date.now()); rw.tileErr = 'Umgebung: ' + String(e.message || e); } return false; }
  finally { if (rw.farBusy === job) rw.farBusy = null; }
}
