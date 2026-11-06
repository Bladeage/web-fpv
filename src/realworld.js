/* Modus „Echte Welt“: Gelände aus amtlichen offenen Geodaten (Monschau, Geobasis NRW, dl-de/zero-2.0).
   Ohne DOM. Hält das Höhenraster und liefert Bodenhöhe und Bodenrichtung für Physik und Darstellung.
   Kartenkoordinaten: Mitte des Gebiets = Ursprung, x nach Osten, z nach Süden, y = Höhe über dem Startplatz.
   Außerhalb des Gebiets setzt sich die Randhöhe fort. Im normalen Modus (rw.on = false): Boden flach bei y = 0. */
import { clamp } from './math.js';

// Eingebettete Daten (der Build setzt sie aus realworld/ ein): Beschreibung (JSON), Höhen (deflate, Base64), Luftbild (JPEG, Base64)
export const RW_DATA = { meta: '%%RW_META%%', dgm: '%%RW_DGM%%', dop: '%%RW_DOP%%', bld: '%%RW_BLD%%', trees: '%%RW_TREES%%' };
export const rw = { on: false, ready: false, meta: null, n: 0, size: 1000, cell: 1, h: null, err: '', tris: null, nRoof: 0, trees: [], grid: null };

// Höhen übernehmen: q = 16-Bit-Werte in hScale Metern über hMin, Zeile für Zeile von Norden nach Süden
export function rwInit(meta, q) {
  const n = meta.n, h = new Float32Array(n*n);
  for (let i = 0; i < n*n; i++) h[i] = meta.hMin + q[i]*meta.hScale - meta.hHome;
  Object.assign(rw, { meta, n, size: meta.bbox[2] - meta.bbox[0], h, ready: true, err: '' });
  rw.cell = rw.size/n;
  return rw;
}
// Eingebettete Höhen im Browser entpacken (DecompressionStream, Bordmittel). Werkzeug und Tests nutzen zlib direkt.
export async function rwLoadEmbedded() {
  if (rw.ready) return rw;
  try {
    if (RW_DATA.meta.startsWith('%%')) throw new Error('keine eingebetteten Daten');
    const meta = JSON.parse(RW_DATA.meta);
    const unpack = async b64 => new Response(new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
    rwInit(meta, new Uint16Array(await unpack(RW_DATA.dgm)));
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

// Gebäude und Bäume übernehmen (Werkzeug: Dezimeter). Gebäude: Dreiecke, erst meta.roofTris Dächer, dann Wände.
// Bäume: x, z, Höhe, Kronenradius; Fuß auf dem Gelände. Dazu ein Raster (8 m) für die schnelle Suche in der Physik.
export const RW_GRID = 8;
export function rwModels(b16, t16) {
  rw.tris = new Float32Array(b16.length);
  for (let i = 0; i < b16.length; i++) rw.tris[i] = b16[i]/10;
  rw.nRoof = rw.meta.roofTris;
  const on = rw.on; rw.on = true;   // Bodenhöhe der Bäume braucht das Gelände
  rw.trees = [];
  for (let k = 0; k + 3 < t16.length; k += 4) {
    const x = t16[k]/10, z = t16[k + 1]/10, h = t16[k + 2]/10, r = t16[k + 3]/10, y0 = groundH(x, z);
    const ch = Math.min(h*0.65, Math.max(2, h - 1.5));   // Krone: obere zwei Drittel, Stamm darunter (Schätzung)
    rw.trees.push({ x, z, y0, h, r, boxes: [
      { c: [x, y0 + (h - ch)/2, z], h: [0.15 + h*0.006, (h - ch)/2, 0.15 + h*0.006], cs: 1, sn: 0 },   // Stamm
      { c: [x, y0 + h - ch/2, z], h: [r*0.8, ch/2, r*0.8], cs: 1, sn: 0 } ] });                     // Krone (Quader etwas schmaler)
  }
  rw.on = on;
  const G = RW_GRID, m = Math.ceil((rw.size + 80)/G), cells = Array.from({ length: m*m }, () => ({ t: [], b: [] }));
  const ci = x => clamp(Math.floor((x + rw.size/2 + 40)/G), 0, m - 1);
  const add = (x0, x1, z0, z1, f) => { for (let j = ci(z0); j <= ci(z1); j++) for (let i = ci(x0); i <= ci(x1); i++) f(cells[j*m + i]); };
  const T = rw.tris;
  for (let t = 0; t < T.length/9; t++) {
    const o = t*9, xs = [T[o], T[o + 3], T[o + 6]], zs = [T[o + 2], T[o + 5], T[o + 8]];
    add(Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs), c => c.t.push(t));
  }
  for (const tr of rw.trees) add(tr.x - tr.r, tr.x + tr.r, tr.z - tr.r, tr.z + tr.r, c => c.b.push(...tr.boxes));
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
// Netze zum Zeichnen. Dächer: Alpha 0,05 = Farbe aus dem Luftbild (Dach von oben gesehen), Wände hell verputzt.
// Bäume: Stamm (4 Seiten) und runde Krone, Krone mit Luftbildfarbe (Baumkrone im Bild), etwas dunkler und grüner (Alpha 0,08).
export function rwModelMesh() {
  const T = rw.tris, nt = T ? T.length/9 : 0, out = [];
  const tri = (a, b, c, col, al, up) => {
    let n = [(b[1] - a[1])*(c[2] - a[2]) - (b[2] - a[2])*(c[1] - a[1]), (b[2] - a[2])*(c[0] - a[0]) - (b[0] - a[0])*(c[2] - a[2]), (b[0] - a[0])*(c[1] - a[1]) - (b[1] - a[1])*(c[0] - a[0])];
    const l = Math.hypot(...n) || 1; n = n.map(v => v/l);
    if (up && n[1] < 0) n = n.map(v => -v);
    for (const p of [a, b, c]) out.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2], al);
  };
  for (let t = 0; t < nt; t++) {
    const o = t*9, a = [T[o], T[o + 1], T[o + 2]], b = [T[o + 3], T[o + 4], T[o + 5]], c = [T[o + 6], T[o + 7], T[o + 8]];
    if (t < rw.nRoof) tri(a, b, c, [0.4, 0.4, 0.42], 0.05, true); else tri(a, b, c, [0.86, 0.84, 0.78], 1, false);
  }
  const bark = [0.32, 0.24, 0.17];
  for (const tr of rw.trees) {
    const [st, cr] = tr.boxes, w = st.h[0], y1 = st.c[1] + st.h[1], y0 = tr.y0 - 0.3;
    for (const [dx, dz, ex, ez] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
      const p = [tr.x + dx*w, y0, tr.z + dz*w], q = [tr.x + ex*w, y0, tr.z + ez*w];
      tri(p, q, [q[0], y1, q[2]], bark, 1, false); tri(p, [q[0], y1, q[2]], [p[0], y1, p[2]], bark, 1, false);
    }
    // Krone rund: sechs Seiten, unten spitz, zwei Ringe (30 % und 70 % der Kronenhöhe), oben flach gewölbt
    const y0c = cr.c[1] - cr.h[1], hc = 2*cr.h[1], r = tr.r, rot = tr.x*0.7 + tr.z*1.3, col = [0.3, 0.4, 0.25];
    const ringAt = (f, rr) => Array.from({ length: 6 }, (_, i) => { const a = rot + i*Math.PI/3; return [tr.x + Math.cos(a)*rr, y0c + f*hc, tr.z + Math.sin(a)*rr]; });
    const r1 = ringAt(0.3, r), r2 = ringAt(0.7, r*0.85), bot = [tr.x, y0c, tr.z], top = [tr.x, y0c + hc, tr.z];
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      tri(r1[j], r1[i], bot, col, 0.08, false);
      tri(r1[i], r1[j], r2[j], col, 0.08, false); tri(r1[i], r2[j], r2[i], col, 0.08, false);
      tri(r2[i], r2[j], top, col, 0.08, true);
    }
  }
  return new Float32Array(out);
}
