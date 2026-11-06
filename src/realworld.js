/* Modus „Echte Welt“: Gelände aus amtlichen offenen Geodaten (Monschau, Geobasis NRW, dl-de/zero-2.0).
   Ohne DOM. Hält das Höhenraster und liefert Bodenhöhe und Bodenrichtung für Physik und Darstellung.
   Kartenkoordinaten: Mitte des Gebiets = Ursprung, x nach Osten, z nach Süden, y = Höhe über dem Startplatz.
   Außerhalb des Gebiets setzt sich die Randhöhe fort. Im normalen Modus (rw.on = false): Boden flach bei y = 0. */
import { clamp } from './math.js';
import { fromUtm, toUtm } from './geo.js';
import { RW_SOURCES, rwSourceAt, rwAreaAt, rwFetchArea, rwCellSources } from './rwload.js';
import { deLandAt, deMap, deLandBox } from './demap.js';

// Eingebettete Daten (der Build setzt sie aus realworld/ ein): Beschreibung (JSON), Höhen, Gebäude, Bäume, Gewässer
// (deflate, Base64), Luftbild (JPEG, Base64), Kartenebenen (JSON). Das 3D-Mesh (tools/mesh.mjs) ist nicht eingebettet.
export const RW_DATA = { meta: '%%RW_META%%', dgm: '%%RW_DGM%%', dop: '%%RW_DOP%%', bld: '%%RW_BLD%%', trees: '%%RW_TREES%%', water: '%%RW_WATER%%', features: '%%RW_FEATURES%%' };
export const rw = { on: false, ready: false, meta: null, n: 0, size: 1000, cell: 1, h: null, err: '', tris: null, grid: null, water: null, features: null, bldId: null, bldInfo: null, trees: [], dop: null, ver: 0, live: false, userSources: [] };

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
export function rwApply(p, x = {}) {
  const on = rw.on;
  Object.assign(rw, { tris: null, grid: null, bldId: null, bldInfo: null, trees: [], water: x.water || null, features: x.features || null, dop: p.dop || null, live: !!x.live });
  rwInit(p.meta, p.q);
  rwModels(p.b16, p.t16);
  rw.on = on; rw.ver++;
  return rw;
}
// Alle Quellen: eigene (rw.userSources, aus den Einstellungen) zuerst, dann die Vorlagen. Rechteck aus dem Land, falls keins da ist.
export function rwSources() {
  return [...rw.userSources, ...RW_SOURCES].map(s => s.box ? s : { ...s, box: deLandBox(s.land) || [0, 0, 0, 0] });
}
const zoneOf = s => s.crs === 'EPSG:25833' ? 33 : 32;
// Quellen für ein Gebiet um Breite/Länge: Hauptquelle am Mittelpunkt, dazu die Quellen der Länder, die das Gebiet
// berührt (Probe auf 5 x 5 Punkten), im selben Koordinatensystem. Rückgabe { srcs, area, skipped } oder null.
export function rwPlan(lat, lon, list = rwSources()) {
  const land = deMap() ? deLandAt : null, [E32, N32] = toUtm(lat, lon, 32), main = rwSourceAt(E32, N32, list, land);
  if (!main) return null;
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
export function rwNet(signal) {
  const host = u => u.split('/')[2];
  const go = async u => {
    try { return await fetch(u, { signal }); }
    catch (e) { if (e.name === 'AbortError') throw new Error('Abgebrochen'); throw new Error('Keine Verbindung zu ' + host(u) + ' (offline oder Zugriff gesperrt)'); }
  };
  const get = async u => {
    const r = await go(u);
    if (!r.ok) throw new Error(host(u) + ' antwortet ' + r.status);
    const b = new Uint8Array(await r.arrayBuffer());
    if (b[0] === 0x3c) throw new Error(host(u) + ' meldet: ' + new TextDecoder().decode(b.slice(0, 300)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120));
    return b;
  };
  const text = async u => { const r = await go(u); if (r.status === 404) return null; if (!r.ok) throw new Error(host(u) + ' antwortet ' + r.status); return r.text(); };
  return { get, text };
}
// Gebiet 1 x 1 km um Breite/Länge live von den Diensten laden (L1, mehrere Quellen L3).
// say(Schritt, Anteil) meldet den Fortschritt; signal bricht ab; mergeImg setzt Luftbilder an Grenzen zusammen (Browser).
// Bei Fehler bleibt das alte Gebiet erhalten.
export async function rwLoadLive(lat, lon, say = () => {}, signal, mergeImg = null) {
  const plan = rwPlan(lat, lon);
  if (!plan) throw new Error('Für diesen Ort ist keine Quelle hinterlegt. Eigene Quellen unter „Quellen“ eintragen.');
  const { srcs, area: a } = plan;
  if (plan.skipped.length) say('Hinweis: ' + plan.skipped.map(s => s.name).join(', ') + ' nutzt ein anderes Koordinatensystem und bleibt außen vor', 0);
  const { get, text } = rwNet(signal);
  const opt = srcs.length > 1 ? { cells: rwCellSources(a, srcs, plan.toLand), mergeImg } : {};
  const p = await rwFetchArea(a, srcs, get, text, say, opt);
  rwApply(p, { live: true });
  rw.liveAt = [lat, lon]; rw.liveSrcs = srcs.map(s => s.name);
  return rw;
}
// Eingebettete Daten im Browser entpacken (DecompressionStream, Bordmittel). Werkzeug und Tests nutzen zlib direkt.
export async function rwLoadEmbedded() {
  if (rw.ready && !rw.live) return rw;
  try {
    if (RW_DATA.meta.startsWith('%%')) throw new Error('keine eingebetteten Daten');
    const meta = JSON.parse(RW_DATA.meta), bytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const unpack = async b64 => new Response(new Blob([bytes(b64)]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
    const p = { meta, q: new Uint16Array(await unpack(RW_DATA.dgm)), b16: new Int16Array(await unpack(RW_DATA.bld)), t16: new Int16Array(await unpack(RW_DATA.trees)),
      dop: RW_DATA.dop.startsWith('%%') ? null : bytes(RW_DATA.dop) };
    rwApply(p, { features: RW_DATA.features.startsWith('%%') ? null : JSON.parse(RW_DATA.features), water: RW_DATA.water.startsWith('%%') ? null : new Uint8Array(await unpack(RW_DATA.water)) });
    return rw;
  } catch (e) { rw.err = String(e.message || e); return rw; }
}
const at = (i, j) => rw.h[clamp(j, 0, rw.n - 1)*rw.n + clamp(i, 0, rw.n - 1)];
// Bodenhöhe an (x, z), bilinear zwischen den Rasterpunkten (Punktmitten)
export function groundH(x, z) {
  if (!rw.on) return 0;
  const u = (x + rw.size/2)/rw.cell - 0.5, v = (z + rw.size/2)/rw.cell - 0.5;
  const i = Math.floor(u), j = Math.floor(v), fu = clamp(u - i, 0, 1), fv = clamp(v - j, 0, 1);
  return (at(i, j)*(1 - fu) + at(i + 1, j)*fu)*(1 - fv) + (at(i, j + 1)*(1 - fu) + at(i + 1, j + 1)*fu)*fv;
}
// Bodenrichtung (Normale, Einheitsvektor nach oben) aus dem Höhenverlauf
export function groundN(x, z) {
  if (!rw.on) return [0, 1, 0];
  const e = rw.cell, dx = (groundH(x + e, z) - groundH(x - e, z))/(2*e), dz = (groundH(x, z + e) - groundH(x, z - e))/(2*e);
  const l = Math.hypot(dx, 1, dz);
  return [-dx/l, 1/l, -dz/l];
}
// Netz fürs Gelände: Raster mit Abstand step Rasterpunkte (2 = 4 m), außen ein Rand bis „far“ m in Randhöhe.
// Rückgabe: Ecken (wie MeshBuilder: Ort, Normale, Farbe, Alpha 0 = Boden) und Dreiecks-Indizes.
export function rwMesh(step = 2, far = 1500) {
  const m = Math.floor(rw.n/step), pos = [-far];
  for (let i = 0; i < m; i++) pos.push(((i*step + step/2) - rw.n/2)*rw.cell);
  pos.push(far);
  const k = pos.length, v = new Float32Array(k*k*10), idx = new Uint32Array((k - 1)*(k - 1)*6);
  for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
    const x = pos[i], z = pos[j], n = groundN(x, z), o = (j*k + i)*10;
    v.set([x, groundH(x, z), z, n[0], n[1], n[2], 0.35, 0.50, 0.27, 0], o);
  }
  let t = 0;
  for (let j = 0; j < k - 1; j++) for (let i = 0; i < k - 1; i++) {
    const a = j*k + i, b = a + 1, c = a + k, d = c + 1;
    idx.set([a, c, b, b, c, d], t); t += 6;   // gegen den Uhrzeigersinn von oben gesehen
  }
  return { v, idx };
}

// Kollision mit Gebäuden: Dreiecke in einem Raster von 8 m für die schnelle Suche
export const RW_GRID = 8;
// Kollisions-Dreiecke (je 9 Werte) und Hindernis-Quader (Bäume) setzen, Suchraster bauen
export function rwSetTris(tris, boxes = []) {
  rw.tris = tris;
  const G = RW_GRID, half = rw.size/2 + 200, m = Math.ceil(2*half/G), cells = Array.from({ length: m*m }, () => ({ t: [], b: [] }));
  const ci = x => clamp(Math.floor((x + half)/G), 0, m - 1), T = tris;
  for (let t = 0; t < T.length/9; t++) {
    const o = t*9, x0 = Math.min(T[o], T[o + 3], T[o + 6]), x1 = Math.max(T[o], T[o + 3], T[o + 6]);
    const z0 = Math.min(T[o + 2], T[o + 5], T[o + 8]), z1 = Math.max(T[o + 2], T[o + 5], T[o + 8]);
    for (let j = ci(z0); j <= ci(z1); j++) for (let i = ci(x0); i <= ci(x1); i++) cells[j*m + i].t.push(t);
  }
  for (const b of boxes) for (let j = ci(b.c[2] - b.h[2]); j <= ci(b.c[2] + b.h[2]); j++) for (let i = ci(b.c[0] - b.h[0]); i <= ci(b.c[0] + b.h[0]); i++) cells[j*m + i].b.push(b);
  rw.grid = { m, cells, ci };
}
// Was liegt in der Nähe von (x, z) im Umkreis R? Dreiecks-Nummern und Hindernis-Quader (Bäume), ohne Doppelte.
let stamp = 0;
const seenT = new Map();
export function rwNear(x, z, R) {
  const g = rw.grid, tris = [], boxes = [];
  if (!g) return { tris, boxes };
  stamp++;
  for (let j = g.ci(z - R); j <= g.ci(z + R); j++) for (let i = g.ci(x - R); i <= g.ci(x + R); i++) {
    const c = g.cells[j*g.m + i];
    for (const t of c.t) if (seenT.get(t) !== stamp) { seenT.set(t, stamp); tris.push(t); }
    for (const b of c.b) if (b.st !== stamp) { b.st = stamp; boxes.push(b); }
  }
  return { tris, boxes };
}

// Gewässer (Basis-DLM): Bitmaske meta.water.n x n (1 m), Zeile 0 = Norden. Die Wasseroberfläche liegt auf dem
// Höhenmodell (dort ist es die Wasserlinie) plus WATER_UP; als flacher Spiegel, das Ufer bildet das Gelände.
export const WATER_UP = 0.25;
export function waterAt(x, z) {
  if (!rw.on || !rw.water) return false;
  const w = rw.meta.water, i = Math.floor((x + rw.size/2)/w.res), j = Math.floor((z + rw.size/2)/w.res);
  if (i < 0 || j < 0 || i >= w.n || j >= w.n) return false;
  const b = j*w.n + i;
  return (rw.water[b >> 3] >> (b & 7) & 1) === 1;
}
// Netz für das Wasser: je Rasterzeile zusammenhängende Strecken als Vierecke, Höhe aus dem Gelände. Schlicht blaugrau.
export function rwWaterMesh() {
  const out = [], w = rw.meta && rw.meta.water;
  if (!rw.water || !w) return new Float32Array(0);
  const on = rw.on; rw.on = true;
  // Raster 2 m über allen nassen Zellen, 3 m nach außen erweitert. Wasserspiegel je Ecke: über Wasser das Flussbett (Wasserlinie
  // im Höhenmodell), am Ufer der tiefste Boden der nassen Zellen im Umkreis von 5 m; dazu WATER_UP. Das Ufer entsteht dort, wo
  // das Gelände den Spiegel überragt: keine Treppen am Rand, kein Streifen, der unter das Gelände taucht.
  const n = w.n, res = w.res, h = rw.size/2, G = 2, m = Math.round(n*res/G) + 1;
  const wet = (i, j) => { if (i < 0 || j < 0 || i >= n || j >= n) return false; const b = j*n + i; return (rw.water[b >> 3] >> (b & 7) & 1) === 1; };
  const near = new Uint8Array(m*m);   // Ecke liegt höchstens 3 m von nassen Zellen
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (wet(i, j)) {
    const gi = Math.round((i + 0.5)*res/G), gj = Math.round((j + 0.5)*res/G);
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (gi + x >= 0 && gj + y >= 0 && gi + x < m && gj + y < m) near[(gj + y)*m + gi + x] = 1;
  }
  const lvl = new Float32Array(m*m).fill(NaN);
  for (let gj = 0; gj < m; gj++) for (let gi = 0; gi < m; gi++) {
    if (!near[gj*m + gi]) continue;
    const ci = Math.round(gi*G/res), cj = Math.round(gj*G/res);
    let lo = Infinity;
    for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (x*x + y*y <= 25 && wet(ci + x, cj + y)) lo = Math.min(lo, groundH((ci + x + 0.5)*res - h, (cj + y + 0.5)*res - h));
    const x = gi*G - h, z = gj*G - h;   // über Wasser: dem Flussbett folgen (Wehre, Gefälle); am Ufer: tiefster Wert, damit das Gelände den Rand bildet
    if (lo < Infinity) lvl[gj*m + gi] = (wet(ci, cj) ? Math.max(lo, groundH(x, z)) : lo) + WATER_UP;
  }
  const col = [0.24, 0.38, 0.5];
  for (let gj = 0; gj + 1 < m; gj++) for (let gi = 0; gi + 1 < m; gi++) {
    const k = [gj*m + gi, gj*m + gi + 1, (gj + 1)*m + gi + 1, (gj + 1)*m + gi];
    if (k.some(q => Number.isNaN(lvl[q]))) continue;
    const P = q => [(q % m)*G - h, lvl[q], Math.floor(q/m)*G - h];
    const [a, b, c, d] = k.map(P);
    for (const p of [a, d, c, a, c, b]) out.push(p[0], p[1], p[2], 0, 1, 0, col[0], col[1], col[2], 1);
  }
  rw.on = on;
  return new Float32Array(out);
}

// Kartenebenen (Basis-DLM, nur Anzeige): Bänder auf dem Gelände für Bäche, Straßen, Brücken und Waldränder,
// über Türmen eine Säule. Farben wie auf einer Karte. Höhe 0,5 m über dem Höhenmodell, Punkte alle 3 m (folgt dem Gelände).
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
  for (const t of F.towers || []) {   // Säule 30 m über dem Boden, 0,6 m dick, orange
    const y0 = groundH(t.x, t.z), y1 = y0 + 30, d = 0.3, c = [1.0, 0.55, 0.1];
    for (const [ax, az, bx, bz] of [[-d, -d, d, -d], [d, -d, d, d], [d, d, -d, d], [-d, d, -d, -d]]) {
      const q = [[t.x + ax, y0, t.z + az], [t.x + bx, y0, t.z + bz], [t.x + bx, y1, t.z + bz], [t.x + ax, y1, t.z + az]];
      const n = [Math.sign(ax + bx), 0, Math.sign(az + bz)];
      for (const k of [0, 1, 2, 0, 2, 3]) out.push(...q[k], ...n, ...c, 1);
    }
  }
  rw.on = on;
  return new Float32Array(out);
}
// Name der nächsten Straße oder des nächsten Gewässers im Umkreis r (für die Anzeige), sonst ''
export function rwNearName(x, z, r = 30) {
  const F = rw.features;
  if (!F || !rw.on) return '';
  let best = '', bd = r;
  for (const key of ['streams', 'roads']) for (const f of F[key]) {
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
export function rwModels(b16, t16) {
  const nt = rw.meta.roofTris + rw.meta.wallTris, tris = new Float32Array(nt*9);
  for (let i = 0; i < nt*9; i++) tris[i] = b16[i]/10;
  rw.bldId = b16.slice(nt*9, nt*9 + nt);
  const nb = rw.meta.buildings || 0;   // je Gebäude: Fassadenklasse (0 bis 6) + 16 x Flachdach
  rw.bldInfo = b16.length >= nt*10 + nb && nb ? b16.slice(nt*10, nt*10 + nb) : null;
  const on = rw.on; rw.on = true;   // Bodenhöhe der Bäume braucht das Gelände
  rw.trees = [];
  for (let k = 0; k + 3 < t16.length; k += 4) {
    const x = t16[k]/10, z = t16[k + 1]/10, h = t16[k + 2]/10, r = t16[k + 3]/10, y0 = groundH(x, z);
    const ch = Math.min(h*0.65, Math.max(2, h - 1.5));   // Krone: obere zwei Drittel, Stamm darunter (Schätzung)
    rw.trees.push({ x, z, y0, h, r, boxes: [
      { c: [x, y0 + (h - ch)/2, z], h: [0.15 + h*0.006, (h - ch)/2, 0.15 + h*0.006], cs: 1, sn: 0 },   // Stamm
      { c: [x, y0 + h - ch/2, z], h: [r*0.8, ch/2, r*0.8], cs: 1, sn: 0 } ] });                     // Krone
  }
  rw.on = on;
  rwSetTris(tris, rw.trees.flatMap(t => t.boxes));
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
  6: [[0.58, 0.53, 0.47], [0.52, 0.49, 0.45], [0.62, 0.58, 0.52]], 7: [[0.94, 0.92, 0.87]] };
// Wand-Alpha: Klasse k (0 bis 7, 7 = Fachwerk) und Sockelhöhe y (-190 bis 190 m). Der Shader rechnet zurück.
export const rwWallNl = e => 2 + clamp(e, 0, 99)/100;
export const rwWallAlpha = (y, k = 0) => 0.132 + k*0.04 + (clamp(y, -190, 190) + 190)/380*0.035;
export function rwModelMesh() {
  const T = rw.tris, nr = rw.meta.roofTris, nt = T ? T.length/9 : 0, out = [];
  const tri = (a, b, c, col, al, up, nl = 1) => {
    let n = [(b[1] - a[1])*(c[2] - a[2]) - (b[2] - a[2])*(c[1] - a[1]), (b[2] - a[2])*(c[0] - a[0]) - (b[0] - a[0])*(c[2] - a[2]), (b[0] - a[0])*(c[1] - a[1]) - (b[1] - a[1])*(c[0] - a[0])];
    const l = Math.hypot(...n);
    if (l < 1e-9) return;   // Dreieck ohne Fläche (kommt in LoD2 vor): unsichtbar, weglassen
    n = n.map(v => v/l);
    if (up && n[1] < 0) n = n.map(v => -v);
    for (const p of [a, b, c]) out.push(p[0], p[1], p[2], n[0]*nl, n[1]*nl, n[2]*nl, col[0], col[1], col[2], al);
  };
  const hash = i => { const k = Math.sin(i*12.9898 + 4.1)*43758.5453; return k - Math.floor(k); };
  const base = new Map();   // tiefster Punkt je Gebäude (Sockel)
  for (let t = nr; t < nt; t++) { const id = rw.bldId ? rw.bldId[t] : 0, y = Math.min(T[t*9 + 1], T[t*9 + 4], T[t*9 + 7]); base.set(id, Math.min(base.get(id) ?? 1e9, y)); }
  // Traufhöhe je Wandfläche: Dreiecke eines Gebäudes in derselben Ebene bilden eine Wand. Traufe = höchster der Punkte an
  // den beiden seitlichen Enden der Wand (beim Giebel die Schultern, sonst die Oberkante). Darüber zeichnet der Shader keine Fenster.
  const eave = new Float32Array(nt), groups = new Map();
  for (let t = nr; t < nt; t++) {
    const o = t*9, ux = T[o + 3] - T[o], uy = T[o + 4] - T[o + 1], uz = T[o + 5] - T[o + 2], vx = T[o + 6] - T[o], vy = T[o + 7] - T[o + 1], vz = T[o + 8] - T[o + 2];
    let nx = uy*vz - uz*vy, nz = ux*vy - uy*vx; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    if (nx < -1e-6 || (Math.abs(nx) <= 1e-6 && nz < 0)) { nx = -nx; nz = -nz; }
    const key = (rw.bldId ? rw.bldId[t] : 0) + ':' + Math.round(Math.atan2(nz, nx)*30) + ':' + Math.round((nx*T[o] + nz*T[o + 2])*4);
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
  for (let t = 0; t < nt; t++) { const id = rw.bldId ? rw.bldId[t] : 0, y = Math.max(T[t*9 + 1], T[t*9 + 4], T[t*9 + 7]); top.set(id, Math.max(top.get(id) ?? -1e9, y)); }
  const kind = id => {   // Fassadenklasse; Fachwerk (7) für etwa ein Drittel der niedrigen Wohnhäuser (Annahme: typisch für Monschau, nicht aus den Daten)
    const k = rw.bldInfo ? rw.bldInfo[id] & 15 : 0;
    return (k === 0 || k === 1) && (top.get(id) - (base.get(id) ?? 0)) < 13 && hash(id + 311) < 0.35 ? 7 : k;
  };
  for (let t = 0; t < nt; t++) {
    const o = t*9, a = [T[o], T[o + 1], T[o + 2]], b = [T[o + 3], T[o + 4], T[o + 5]], c = [T[o + 6], T[o + 7], T[o + 8]], id = rw.bldId ? rw.bldId[t] : 0;
    const flat = rw.bldInfo && rw.bldInfo[id] & 16, k = kind(id), pal = WALL_BY[k] || WALLS;
    // Dach: Alpha 0,6 = Dachfläche aus dem Luftbild; die Farbe hier gilt nur außerhalb des Bildes und als leichte Beimischung
    if (t < nr) tri(a, b, c, flat || k === 2 ? FLAT[Math.floor(hash(id)*FLAT.length)] : ROOFS[Math.floor(hash(id)*ROOFS.length)], 0.6, true);
    else {   // Wand: Länge der Normale = 2 + Traufhöhe über dem Sockel / 100 (der Shader liest sie zurück)
      const b0 = base.get(id) ?? 0;
      tri(a, b, c, pal[Math.floor(hash(id + 77)*pal.length)], rwWallAlpha(b0, k), false, rwWallNl(eave[t] - b0));
    }
  }
  const bark = [0.32, 0.24, 0.17];
  for (const tr of rw.trees) {
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
  return new Float32Array(out);
}

// Kartenpunkt (x, z) -> Breite, Länge in Grad (WGS84). Gebiet in UTM 32, Mitte = Ursprung, z nach Süden.
export function rwLatLon(x, z) {
  const b = rw.meta.bbox;
  return fromUtm((b[0] + b[2])/2 + x, (b[1] + b[3])/2 - z, +(rw.meta.crs.match(/258(\d\d)/) || [0, 32])[1]);
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
