/* Straßen als Graph (Nutzer, Prompt 180, Etappe S1; Plan docs/plan-nacht-strassen.md Abschnitt 2.4). Eingang sind
   Linienzüge in Kartenkoordinaten [{ name, pts: [[x, z], …], w }] aus beliebiger Quelle: heute die Achsen des Basis-DLM für
   Monschau, später Achsen aus ALKIS-Flächen (S2) oder anderen Ländern (Nutzer, Prompt 184: Straßen und Autos überall, wo es
   Straßenlinien gibt). Daraus: Knoten und Kanten, Zufallswege, Fahrspur rechts, Höhenprofil mit Brücken und Hindernissen.
   Ohne DOM, in Node testbar. */
import { rw, groundH, rwNear, placeReal, rwPlace, WATER_UP } from './realworld.js';
import { MeshBuilder } from './world.js';
import { makeRoute } from './vehicles.js';

// m; w Fahrbahnbreite ohne Angabe (Schätzung Ortsstraße); clear, r: Prüfkugel für das Auto (Mitte 1,2 m hoch, Radius 0,9 m)
export const ROADS = { snap: 1.5, w: 5.5, step: 2, clear: 1.2, r: 0.9, ford: 12, deck: 12 };

const dist2 = (a, b) => (a[0] - b[0])**2 + (a[1] - b[1])**2;
// Nächster Punkt auf der Strecke a-b zu p: { t, d2, q }
function segNear(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx*dx + dz*dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0])*dx + (p[1] - a[1])*dz)/l2)) : 0, q = [a[0] + dx*t, a[1] + dz*t];
  return { t, d2: dist2(p, q), q };
}
const polyLen = pts => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.sqrt(dist2(pts[i - 1], pts[i])); return s; };

// Linienzüge -> Graph { nodes: [{ x, z, e: [Kanten] }], edges: [{ a, b, pts, len, name, w }] }.
// Endpunkte bis snap zusammenfassen. Trifft ein Endpunkt das Innere einer anderen Achse (T-Kreuzung), wird diese dort geteilt.
export function roadGraph(list, snap = ROADS.snap) {
  const lines = list.filter(r => r.pts && r.pts.length > 1).map(r => ({ name: r.name || '', w: r.w > 0 ? r.w : ROADS.w, pts: r.pts.map(p => [p[0], p[1]]) }));
  // Raster der Strecken (20 m) für die Suche nach T-Kreuzungen
  const C = 20, grid = new Map(), key = (i, j) => i*100003 + j;
  lines.forEach((L, li) => { for (let s = 0; s < L.pts.length - 1; s++) {
    const a = L.pts[s], b = L.pts[s + 1];
    for (let i = Math.floor((Math.min(a[0], b[0]) - snap)/C); i <= Math.floor((Math.max(a[0], b[0]) + snap)/C); i++)
      for (let j = Math.floor((Math.min(a[1], b[1]) - snap)/C); j <= Math.floor((Math.max(a[1], b[1]) + snap)/C); j++) {
        const k = key(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push([li, s]);
      }
  } });
  const cuts = lines.map(() => []);   // je Linie: [Strecke, t, Punkt]
  lines.forEach((L, li) => { for (const e of [L.pts[0], L.pts[L.pts.length - 1]]) {
    for (const [lj, s] of grid.get(key(Math.floor(e[0]/C), Math.floor(e[1]/C))) || []) {
      const M = lines[lj], a = M.pts[s], b = M.pts[s + 1], r = segNear(e, a, b);
      if (r.d2 > snap*snap) continue;
      const atEnd = (s === 0 && r.t * Math.sqrt(dist2(a, b)) < snap) || (s === M.pts.length - 2 && (1 - r.t)*Math.sqrt(dist2(a, b)) < snap);
      if (atEnd) continue;   // Ende an Ende: fassen die Knoten zusammen
      if (lj === li && Math.min(...[L.pts[0], L.pts[L.pts.length - 1]].map(f => dist2(f, r.q))) < snap*snap) continue;
      cuts[lj].push([s, r.t, r.q]);
    }
  } });
  // Linien an den Schnitten teilen
  const parts = [];
  lines.forEach((L, li) => {
    const cs = cuts[li].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    let cur = [L.pts[0]], ci = 0;
    for (let s = 0; s < L.pts.length - 1; s++) {
      while (ci < cs.length && cs[ci][0] === s) { const q = cs[ci++][2]; if (dist2(q, cur[cur.length - 1]) > 0.01) cur.push(q); if (cur.length > 1) parts.push({ ...L, pts: cur }); cur = [q]; }
      cur.push(L.pts[s + 1]);
    }
    if (cur.length > 1) parts.push({ ...L, pts: cur });
  });
  // Knoten: Endpunkte zusammenfassen (Raster mit Zellweite snap, Nachbarzellen mitprüfen)
  const nodes = [], ng = new Map(), cell = v => Math.floor(v/snap);
  const nodeAt = p => {
    const i = cell(p[0]), j = cell(p[1]);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const n of ng.get(key(i + a, j + b)) || []) if (dist2([nodes[n].x, nodes[n].z], p) <= snap*snap) return n;
    nodes.push({ x: p[0], z: p[1], e: [] }); const k = key(i, j); if (!ng.has(k)) ng.set(k, []); ng.get(k).push(nodes.length - 1);
    return nodes.length - 1;
  };
  const edges = [];
  for (const P of parts) {
    const len = polyLen(P.pts); if (len < 0.5) continue;
    const a = nodeAt(P.pts[0]), b = nodeAt(P.pts[P.pts.length - 1]), e = edges.length;
    if (a === b && len < 8) continue;   // kleine Schleife an einer Kreuzung (Gewirr aus Flächen-Achsen)
    edges.push({ a, b, pts: P.pts, len, name: P.name, w: P.w });
    nodes[a].e.push(e); if (b !== a) nodes[b].e.push(e);
  }
  return { nodes, edges, len: edges.reduce((s, e) => s + e.len, 0) };
}

// Zufallsweg durch den Graphen ab Kante e0 in Richtung dir (0: a nach b, 1: b nach a), bis mindestens minLen Meter. An Knoten
// zufällig abbiegen, nie zurück; nur in Sackgassen wenden. Rückgabe: Linienzug [[x, z], …] und die Breite der ersten Kante.
export function roadWalk(G, e0, dir, minLen, rand = Math.random) {
  const out = []; let e = e0, d = dir, len = 0;
  for (let guard = 0; guard < 400 && len < minLen; guard++) {
    const E = G.edges[e], pts = d ? E.pts.slice().reverse() : E.pts;
    for (const p of pts) if (!out.length || dist2(out[out.length - 1], p) > 0.01) out.push(p);
    len += E.len;
    const n = d ? E.a : E.b, opts = G.nodes[n].e.filter(k => k !== e);
    if (!opts.length) { d = 1 - d; continue; }   // Sackgasse: wenden
    e = opts[Math.floor(rand()*opts.length)];
    d = G.edges[e].a === n ? 0 : 1;
  }
  return { pts: out, w: G.edges[e0].w };
}

// Spur rechts der Fahrtrichtung um off Meter versetzen (x Ost, z Süd: rechts von (dx, dz) ist (-dz, dx)); Normalen an Ecken
// gemittelt wie offsetPath in vehicles.js. An Wendepunkten (Richtung kehrt um) bleibt der Punkt auf der Achse.
export function laneOffset(pts, off) {
  const n = pts.length, dir = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [dx/l, dz/l]; };
  return pts.map((p, i) => {
    const d1 = dir(pts[Math.max(0, i - 1)], pts[Math.max(1, i)]), d2 = dir(pts[Math.min(n - 2, i)], pts[Math.min(n - 1, i + 1)]);
    const nx = -(d1[1] + d2[1]), nz = d1[0] + d2[0], l = Math.hypot(nx, nz);
    if (l < 0.2) return [p[0], p[1]];
    const k = Math.min(1.5, 2/l);   // Gehrung an Ecken (gerade: l = 2, k = 1), höchstens 1,5fach
    return [p[0] + nx/l*off*k, p[1] + nz/l*off*k];
  });
}
export const laneOff = w => Math.min(1.75, w/4 + 0.5);

// Fahrbahnhöhe an (x, z): Boden oder ein Deck (Dachfläche aus LoD2, Normale nach oben, 0 bis 12 m über dem Boden; Brücken sind in
// LoD2 NRW Platten). Gewählt wird die Höhe, die der vorigen Fahrbahnhöhe prev am nächsten liegt: So fährt ein Auto über die Brücke,
// wenn es von der Rampe kommt, und unter ihr durch, wenn es auf der Straße darunter fährt. Ohne prev: Boden.
export function roadH(x, z, prev) {
  const g = groundH(x, z);
  if (prev === undefined || !rw.tris) return g;
  let best = g, bd = Math.abs(g - prev);
  const T = rw.tris, near = rwNear(x, z, 0.5).tris;
  for (const t of near) {
    const o = t*9, ax = T[o], az = T[o + 2], bx = T[o + 3], bz = T[o + 5], cx = T[o + 6], cz = T[o + 8];
    const den = (bz - cz)*(ax - cx) + (cx - bx)*(az - cz); if (Math.abs(den) < 1e-9) continue;
    const u = ((bz - cz)*(x - cx) + (cx - bx)*(z - cz))/den, v = ((cz - az)*(x - cx) + (ax - cx)*(z - cz))/den;
    if (u < 0 || v < 0 || u + v > 1) continue;
    // Normale nach oben (flach): Kreuzprodukt y-Anteil im Verhältnis zur Länge
    const ux = bx - ax, uy = T[o + 4] - T[o + 1], uz = bz - az, vx = cx - ax, vy = T[o + 7] - T[o + 1], vz = cz - az;
    const ny = uz*vx - ux*vz, nl = Math.hypot(uy*vz - uz*vy, ny, ux*vy - uy*vx); if (Math.abs(ny) < 0.7*nl) continue;
    const y = T[o + 1]*u + T[o + 4]*v + T[o + 7]*(1 - u - v);
    if (y < g - 0.3 || y > g + ROADS.deck) continue;
    if (Math.abs(y - prev) < bd) { bd = Math.abs(y - prev); best = y; }
  }
  return best;
}

// Höhenprofil einer Spur: alle step Meter ein Punkt [x, z, y] auf der Spur lane (versetzt, aus laneOffset) zur Achse axis (gleiche
// Punktzahl). Ist die Spur an einer Stelle zugestellt (enge Gasse, Achse ungenau, Hauskante), weicht das Auto zur Mitte aus
// (halber Versatz, dann Achse). Bleibt sie zu (Gebäude, Baum) oder liegt Wasser ohne Deck über ford Meter: Die Spur endet dort
// (nur das erste freie Stück zählt). Kurze Nässe (Durchlass, Bach unter der Straße): Furt auf dem Wasserspiegel.
export function laneProfile(lane, axis = lane, W = placeReal(), opt = {}) {
  const step = opt.step || ROADS.step, out = [];
  let prev, wet = 0;
  for (let i = 0; i < lane.length - 1; i++) {
    const a = lane[i], b = lane[i + 1], A = axis[i], B = axis[i + 1], L = Math.sqrt(dist2(a, b)), n = Math.max(1, Math.ceil(L/step));
    for (let k = i ? 1 : 0; k <= n; k++) {
      const t = k/n, lx = a[0] + (b[0] - a[0])*t, lz = a[1] + (b[1] - a[1])*t, ax = A[0] + (B[0] - A[0])*t, az = A[1] + (B[1] - A[1])*t;
      let hit = null;
      for (const m of [1, 0.5, 0]) {
        const x = ax + (lx - ax)*m, z = az + (lz - az)*m;
        let y = roadH(x, z, prev), g = groundH(x, z), wetHere = false;
        if (Math.abs(y - g) < 0.3 && W.wet(x, z)) { wetHere = true; y = g + WATER_UP + 0.05; }   // im Wasser ohne Deck
        if (W.free([x, y + ROADS.clear, z], ROADS.r)) { hit = [x, z, y, wetHere]; break; }
      }
      if (!hit) return out;
      if (hit[3]) { wet += L/n; if (wet > ROADS.ford) return trimTail(out, wet); } else wet = 0;
      out.push([hit[0], hit[1], hit[2]]); prev = hit[2];
    }
  }
  return out;
}
const trimTail = (out, wet) => out.slice(0, Math.max(0, out.length - Math.ceil(wet/ROADS.step)));

// Graph der aktuellen Welt (Startgebiet und Kacheln), zwischengespeichert bis sich das Gebiet ändert. Quelle: rw.features.roads
// (eingebettetes Monschau) und je Kachel T.roads (ab S2); fehlt beides, ist der Graph leer.
let cache = { key: '', G: null };
export function rwRoads(menu = false) {   // menu: auch vor dem Start (Gebiet geladen, echte Welt noch nicht eingeschaltet)
  if (!rw.on && !(menu && rw.ready)) return null;
  const key = rw.ver + ':' + rw.tileVer + ':' + rw.roadVer;
  if (cache.key === key) return cache.G;
  const list = [...((rw.features && rw.features.roads) || [])];
  for (const T of (rw.tiles && rw.tiles.values()) || []) if (T.roads) list.push(...T.roads);
  cache = { key, G: list.length ? roadGraph(list) : null };
  return cache.G;
}

// Straßenlaternen (Etappe N2, Plan 1.2): alle every Meter entlang jeder Kante, Seite wechselnd, Versatz halbe Fahrbahnbreite +
// 0,6 m, nur innerhalb einer Ortslage (so stehen sie in Städten und Dörfern, nicht an Feldwegen), nicht im Wasser, nicht in
// Gebäuden oder Bäumen. Rückgabe [[x, z], …]. Abstand 35 m: Schätzung für Ortsstraßen.
export const LAMP = { every: 35, side: 0.6, mast: 5, head: 0.3, disc: 6 };
export function lampSpots(G, every = LAMP.every, W = placeReal()) {
  const out = []; let side = 1;
  for (const E of G.edges) {
    let s = every/2, acc = 0;
    for (let i = 0; i < E.pts.length - 1; i++) {
      const a = E.pts[i], b = E.pts[i + 1], L = Math.sqrt(dist2(a, b)); if (L < 1e-6) continue;
      const nx = -(b[1] - a[1])/L, nz = (b[0] - a[0])/L;   // rechts der Kante
      while (s <= acc + L) {
        const t = (s - acc)/L, off = side*(E.w/2 + LAMP.side), x = a[0] + (b[0] - a[0])*t + nx*off, z = a[1] + (b[1] - a[1])*t + nz*off;
        const pl = rwPlace(x, z);
        if (pl && pl.d === 0 && !W.wet(x, z) && W.free([x, groundH(x, z) + 2.5, z], 0.25)) { out.push([x, z]); side = -side; }
        s += every;
      }
      acc += L;
    }
  }
  return out;
}
// Netz der Laternen: Masten (dunkelgrau, Alpha 1) und Köpfe (warmweiß, Alpha 0,75 = Licht), danach die Lichtscheiben am Boden
// (Achteck, Mitte warm, Rand 0, Alpha 0,75; der Grafikteil zeichnet sie additiv). Ecken der Scheibe folgen dem Gelände.
// Rückgabe: { data, solid (Ecken der Masten und Köpfe), count }
export function lampMesh(spots) {
  const mb = new MeshBuilder(), mast = [0.22, 0.22, 0.24], head = [1.0, 0.88, 0.62, 0.75];
  for (const [x, z] of spots) {
    const g = groundH(x, z);
    mb.box([x, g + LAMP.mast/2, z], [0.06, LAMP.mast/2, 0.06], 0, mast);
    mb.box([x, g + LAMP.mast + 0.08, z], [LAMP.head/2, 0.08, LAMP.head/2], 0, head);
  }
  const solid = mb.count, N = 8, R = LAMP.disc, mid = [0.75, 0.6, 0.36, 0.75], rim = [0, 0, 0, 0.75];
  for (const [x, z] of spots) {
    const c = [x, groundH(x, z) + 0.08, z];
    const P = k => { const a = k*2*Math.PI/N, px = x + Math.cos(a)*R, pz = z + Math.sin(a)*R; return [px, groundH(px, pz) + 0.08, pz]; };
    for (let k = 0; k < N; k++) {
      const p = P(k), q = P(k + 1), d = mb.d;
      for (const [v, col] of [[c, mid], [q, rim], [p, rim]]) d.push(v[0], v[1], v[2], 0, 1, 0, col[0], col[1], col[2], col[3]);
    }
  }
  return { data: new Float32Array(mb.d), solid, count: mb.count };
}
// Laternen der aktuellen Welt, zwischengespeichert wie der Graph (gebaut erst bei Bedarf, also nur nachts)
let lampCache = { key: '', L: null };
export function rwLamps() {
  const G = rwRoads(); if (!G) return null;
  const key = rw.ver + ':' + rw.tileVer + ':' + rw.roadVer;
  if (lampCache.key !== key) { const spots = lampSpots(G); lampCache = { key, L: spots.length ? { spots, ...lampMesh(spots), key } : null }; }
  return lampCache.L;
}

// Taktischer Flug und Verfolgung (S3, Plan 2.7): Fahrspuren als Zufallswege mit Höhenprofil, Startkante d0 bis d1 m vom Startplatz
// home [x, z], Länge min bis max m; jede Startkante nur einmal. Gleiches Format wie ROUTES in vehicles.js (Punkte [x, z, y]).
export function roadRoutes(G, home, n, R = Math.random, opt = {}) {
  const W = placeReal(), out = [], used = new Set(), min = opt.min ?? 300, max = opt.max ?? 800, d0 = opt.d0 ?? 100, d1 = opt.d1 ?? 400;
  for (let k = 0; k < 400 && out.length < n; k++) {
    const e = Math.floor(R()*G.edges.length); if (used.has(e)) continue;
    const E = G.edges[e], m = E.pts[E.pts.length >> 1], d = Math.hypot(m[0] - home[0], m[1] - home[1]);
    if (d < d0 || d > d1) continue;
    const w = roadWalk(G, e, R() < 0.5 ? 0 : 1, min + R()*(max - min), R);
    const prof = laneProfile(laneOffset(w.pts, laneOff(w.w)), w.pts, W);
    if (prof.length < 2) continue;
    const r = makeRoute(prof, false); if (r.len < Math.min(150, min)) continue;
    used.add(e); out.push(r);
  }
  return out;
}
// Parkplätze am Straßenrand: Versatz Spur + 1,6 m, eben (Höhenunterschied über 4 m Länge unter 0,6 m), frei, trocken, 12 m Abstand
// untereinander, 60 bis 400 m vom Start. Rückgabe [[x, z, yaw, y], …] (yaw wie routeAt: Modell schaut nach -z).
export function parkSpots(G, home, n, R = Math.random) {
  const W = placeReal(), out = [];
  for (let k = 0; k < 600 && out.length < n; k++) {
    // Stelle zufällig entlang der ganzen Kante (nicht je Abschnitt: kurze Abschnitte an Kurven fielen sonst weg)
    const E = G.edges[Math.floor(R()*G.edges.length)]; if (E.len < 10) continue;
    let s = 5 + R()*(E.len - 10), i = 0, a, b, L;
    for (;; i++) { a = E.pts[i]; b = E.pts[i + 1]; L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (s <= L || i >= E.pts.length - 2) break; s -= L; }
    if (L < 1e-6) continue;
    const dx = (b[0] - a[0])/L, dz = (b[1] - a[1])/L, t = Math.min(1, s/L), sd = R() < 0.5 ? 1 : -1, off = sd*(laneOff(E.w) + 1.6);
    const x = a[0] + (b[0] - a[0])*t - dz*off, z = a[1] + (b[1] - a[1])*t + dx*off, d = Math.hypot(x - home[0], z - home[1]);
    if (d < 60 || d > 400 || W.wet(x, z) || out.some(p => Math.hypot(p[0] - x, p[1] - z) < 12)) continue;
    const y = groundH(x, z);
    if (Math.abs(groundH(x + dx*2, z + dz*2) - groundH(x - dx*2, z - dz*2)) > 0.6 || !W.free([x, y + 1.4, z], 1.2)) continue;   // Kugel 0,2 m über dem Boden (vorher 1,3 m Radius bei 1,2 m Höhe: steckte im Boden, nie frei)
    out.push([x, z, Math.atan2(-dx, -dz) + (R() < 0.5 ? 0 : Math.PI), y]);
  }
  return out;
}
// Straßenlänge im Startgebiet (Kanten mit Mitte im Umkreis r um c [x, z]): Menü gibt Fahrzeuge und Verfolgung ab 500 m frei
export function roadLenNear(G, c, r) {
  let s = 0; if (!G) return 0;
  for (const E of G.edges) { const m = E.pts[E.pts.length >> 1]; if (Math.hypot(m[0] - c[0], m[1] - c[1]) < r) s += E.len; }
  return s;
}
