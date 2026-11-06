/* Modus „Echte Welt“: Gelände aus amtlichen offenen Geodaten (Monschau, Geobasis NRW, dl-de/zero-2.0).
   Ohne DOM. Hält das Höhenraster und liefert Bodenhöhe und Bodenrichtung für Physik und Darstellung.
   Kartenkoordinaten: Mitte des Gebiets = Ursprung, x nach Osten, z nach Süden, y = Höhe über dem Startplatz.
   Außerhalb des Gebiets setzt sich die Randhöhe fort. Im normalen Modus (rw.on = false): Boden flach bei y = 0. */
import { clamp } from './math.js';

// Eingebettete Daten (der Build setzt sie aus realworld/ ein): Beschreibung (JSON), Höhen, Gebäude, Bäume, Gewässer
// (deflate, Base64), Luftbild (JPEG, Base64), Kartenebenen (JSON). Das 3D-Mesh (tools/mesh.mjs) ist nicht eingebettet.
export const RW_DATA = { meta: '%%RW_META%%', dgm: '%%RW_DGM%%', dop: '%%RW_DOP%%', bld: '%%RW_BLD%%', trees: '%%RW_TREES%%', water: '%%RW_WATER%%', features: '%%RW_FEATURES%%' };
export const rw = { on: false, ready: false, meta: null, n: 0, size: 1000, cell: 1, h: null, err: '', tris: null, grid: null, water: null, features: null, bldId: null, trees: [] };

// Höhen übernehmen: q = 16-Bit-Werte in hScale Metern über hMin, Zeile für Zeile von Norden nach Süden
export function rwInit(meta, q) {
  const n = meta.n, h = new Float32Array(n*n);
  for (let i = 0; i < n*n; i++) h[i] = meta.hMin + q[i]*meta.hScale - meta.hHome;
  Object.assign(rw, { meta, n, size: meta.bbox[2] - meta.bbox[0], h, ready: true, err: '' });
  rw.cell = rw.size/n;
  return rw;
}
// Eingebettete Daten im Browser entpacken (DecompressionStream, Bordmittel). Werkzeug und Tests nutzen zlib direkt.
export async function rwLoadEmbedded() {
  if (rw.ready) return rw;
  try {
    if (RW_DATA.meta.startsWith('%%')) throw new Error('keine eingebetteten Daten');
    const meta = JSON.parse(RW_DATA.meta), bytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const unpack = async b64 => new Response(new Blob([bytes(b64)]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
    rwInit(meta, new Uint16Array(await unpack(RW_DATA.dgm)));
    if (!RW_DATA.features.startsWith('%%')) rw.features = JSON.parse(RW_DATA.features);
    if (!RW_DATA.water.startsWith('%%')) rw.water = new Uint8Array(await unpack(RW_DATA.water));
    if (!RW_DATA.bld.startsWith('%%')) rwModels(new Int16Array(await unpack(RW_DATA.bld)), new Int16Array(await unpack(RW_DATA.trees)));
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
// Höhenmodell (dort ist es die Wasserlinie) plus WATER_UP, damit sie sicher über dem Gelände liegt.
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
  const col = [0.24, 0.38, 0.5], wet = (i, j) => { const b = j*w.n + i; return (rw.water[b >> 3] >> (b & 7) & 1) === 1; };
  const P = (x, z) => [x, groundH(x, z) + WATER_UP, z], h = rw.size/2;
  for (let j = 0; j < w.n; j++) for (let i = 0; i < w.n; i++) {
    if (!wet(i, j)) continue;
    let k = i; while (k + 1 < w.n && wet(k + 1, j)) k++;
    const x0 = i*w.res - h, x1 = (k + 1)*w.res - h, z0 = j*w.res - h, z1 = (j + 1)*w.res - h;
    const a = P(x0, z0), b = P(x1, z0), c = P(x1, z1), d = P(x0, z1);
    for (const p of [a, d, c, a, c, b]) out.push(p[0], p[1], p[2], 0, 1, 0, col[0], col[1], col[2], 1);
    i = k;
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
// Netz der Gebäude und Bäume. Je Gebäude eine Putzfarbe und eine Dachfarbe (Schiefer, Ziegel, Grau; Schätzung für die Eifel).
// Wände: Alpha 0,2 bis 0,4 = Fassade; darin steckt die Sockelhöhe des Gebäudes (der Shader zählt die Geschosse ab dort). Bäume: Stamm und runde Krone, Krone mit der
// Farbe des Luftbilds darunter (Alpha 0,08), damit Wald wie der Boden darunter aussieht.
const WALLS = [[0.92, 0.9, 0.86], [0.9, 0.84, 0.72], [0.8, 0.79, 0.76], [0.86, 0.74, 0.56], [0.94, 0.93, 0.9], [0.62, 0.64, 0.68]];
const ROOFS = [[0.26, 0.28, 0.32], [0.3, 0.31, 0.35], [0.48, 0.24, 0.18], [0.24, 0.25, 0.28], [0.42, 0.41, 0.4]];
export const rwWallAlpha = y => 0.3 + clamp(y, -190, 190)/2000;
export function rwModelMesh() {
  const T = rw.tris, nr = rw.meta.roofTris, nt = T ? T.length/9 : 0, out = [];
  const tri = (a, b, c, col, al, up) => {
    let n = [(b[1] - a[1])*(c[2] - a[2]) - (b[2] - a[2])*(c[1] - a[1]), (b[2] - a[2])*(c[0] - a[0]) - (b[0] - a[0])*(c[2] - a[2]), (b[0] - a[0])*(c[1] - a[1]) - (b[1] - a[1])*(c[0] - a[0])];
    const l = Math.hypot(...n) || 1; n = n.map(v => v/l);
    if (up && n[1] < 0) n = n.map(v => -v);
    for (const p of [a, b, c]) out.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2], al);
  };
  const hash = i => { const k = Math.sin(i*12.9898 + 4.1)*43758.5453; return k - Math.floor(k); };
  const base = new Map();   // tiefster Punkt je Gebäude (Sockel)
  for (let t = nr; t < nt; t++) { const id = rw.bldId ? rw.bldId[t] : 0, y = Math.min(T[t*9 + 1], T[t*9 + 4], T[t*9 + 7]); base.set(id, Math.min(base.get(id) ?? 1e9, y)); }
  for (let t = 0; t < nt; t++) {
    const o = t*9, a = [T[o], T[o + 1], T[o + 2]], b = [T[o + 3], T[o + 4], T[o + 5]], c = [T[o + 6], T[o + 7], T[o + 8]], id = rw.bldId ? rw.bldId[t] : 0;
    if (t < nr) tri(a, b, c, ROOFS[Math.floor(hash(id)*ROOFS.length)], 1, true);
    else tri(a, b, c, WALLS[Math.floor(hash(id + 77)*WALLS.length)], rwWallAlpha(base.get(id) ?? 0), false);
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
