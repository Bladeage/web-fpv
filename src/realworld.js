/* Modus „Echte Welt“: Gelände aus amtlichen offenen Geodaten (Monschau, Geobasis NRW, dl-de/zero-2.0).
   Ohne DOM. Hält das Höhenraster und liefert Bodenhöhe und Bodenrichtung für Physik und Darstellung.
   Kartenkoordinaten: Mitte des Gebiets = Ursprung, x nach Osten, z nach Süden, y = Höhe über dem Startplatz.
   Außerhalb des Gebiets setzt sich die Randhöhe fort. Im normalen Modus (rw.on = false): Boden flach bei y = 0. */
import { clamp } from './math.js';

// Eingebettete Daten (der Build setzt sie aus realworld/ ein): Beschreibung (JSON), Höhen (deflate, Base64),
// 3D-Mesh: Index aller Knoten (JSON, zum Nachladen), grobe Stufe als Dreiecke (deflate) und ihre Texturen (JPEG hintereinander)
export const RW_DATA = { meta: '%%RW_META%%', dgm: '%%RW_DGM%%', meshIdx: '%%RW_MESHIDX%%', meshGeo: '%%RW_MESHGEO%%', meshTex: '%%RW_MESHTEX%%', water: '%%RW_WATER%%', features: '%%RW_FEATURES%%' };
export const rw = { on: false, ready: false, meta: null, n: 0, size: 1000, cell: 1, h: null, err: '', tris: null, mesh: null, grid: null, water: null, features: null };

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
    if (!RW_DATA.meshIdx.startsWith('%%')) rwSetMesh(JSON.parse(RW_DATA.meshIdx), new Int16Array(await unpack(RW_DATA.meshGeo)), bytes(RW_DATA.meshTex));
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
    // Unter dem 3D-Mesh liegt das Höhenmodell 4 m tiefer (verdeckt; die grobe Stufe weicht bis einige Meter ab); außen in voller Höhe
    const e = Math.max(Math.abs(x), Math.abs(z)), sink = rw.mesh ? 4*clamp((rw.size/2 + 160 - e)/20, 0, 1) : 0;
    v.set([x, groundH(x, z) - sink, z, n[0], n[1], n[2], 0.35, 0.50, 0.27, 0], o);
  }
  let t = 0;
  for (let j = 0; j < k - 1; j++) for (let i = 0; i < k - 1; i++) {
    const a = j*k + i, b = a + 1, c = a + k, d = c + 1;
    idx.set([a, c, b, b, c, d], t); t += 6;   // gegen den Uhrzeigersinn von oben gesehen
  }
  return { v, idx };
}

// 3D-Mesh übernehmen: Index (alle Knoten, zum Nachladen) und grobe Stufe. geo16: je Ecke x, y, z in dm (Karte), u, v (16 Bit).
// Die Dreiecke der groben Stufe dienen auch der Kollision (Raster 8 m für die schnelle Suche).
export const RW_GRID = 8;
export function rwSetMesh(idx, geo16, tex) {
  const parts = [];
  let o = 0, t = 0;
  idx.tris.forEach((n, k) => {
    const pos = new Float32Array(n*9), uv = new Float32Array(n*6);
    for (let v = 0; v < n*3; v++, o += 5) {
      pos[v*3] = geo16[o]/10; pos[v*3 + 1] = geo16[o + 1]/10; pos[v*3 + 2] = geo16[o + 2]/10;
      uv[v*2] = (geo16[o + 3] + 32768)/65535; uv[v*2 + 1] = (geo16[o + 4] + 32768)/65535;
    }
    parts.push({ pos, uv, tex: tex.subarray(t, t + idx.tex[k]) }); t += idx.tex[k];
  });
  rw.mesh = { idx, parts };
  const all = new Float32Array(parts.reduce((s, p) => s + p.pos.length, 0));
  let q = 0; for (const p of parts) { all.set(p.pos, q); q += p.pos.length; }
  rwSetTris(all);
}
// Kollisions-Dreiecke setzen (je 9 Werte) und das Suchraster bauen
export function rwSetTris(tris) {
  rw.tris = tris;
  const G = RW_GRID, half = rw.size/2 + 200, m = Math.ceil(2*half/G), cells = Array.from({ length: m*m }, () => ({ t: [], b: [] }));
  const ci = x => clamp(Math.floor((x + half)/G), 0, m - 1), T = tris;
  for (let t = 0; t < T.length/9; t++) {
    const o = t*9, x0 = Math.min(T[o], T[o + 3], T[o + 6]), x1 = Math.max(T[o], T[o + 3], T[o + 6]);
    const z0 = Math.min(T[o + 2], T[o + 5], T[o + 8]), z1 = Math.max(T[o + 2], T[o + 5], T[o + 8]);
    for (let j = ci(z0); j <= ci(z1); j++) for (let i = ci(x0); i <= ci(x1); i++) cells[j*m + i].t.push(t);
  }
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
// Höhenmodell (dort ist es die Wasserlinie) plus WATER_UP, damit sie über dem Flussbett des Mesh sichtbar ist.
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
