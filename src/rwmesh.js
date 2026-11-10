/* Sichtprobe 3D-Mesh NRW (Nutzer, Prompt 189/190, Etappe M0; Plan docs/plan-3d-mesh.md, Prüfung docs/pruefung-3d-mesh.md).
   Texturiertes Mesh des Digitalen Zwillings NRW (I3S 1.7, Lizenz dl-de/zero-2.0), live geladen, nichts gespeichert. Nur zum
   Vergleich mit der heutigen Optik: aktiv nur mit dem Zusatz ?mesh=1 in der Adresse, in der echten Welt, nicht in DIS.
   Dieses Modul: Knoten und Seiten verwalten, Sichtkegel, Wahl der Detailstufe (Node-Switching wie I3S), Freigabe. Ohne DOM.
   Laden (fetch, Bilder) und Zeichnen macht render.js. */

// url Ebene 0 des Dienstes; q Qualität (1 = Schwelle des Dienstes, größer = gröber); maxNodes, gpuMB Grenzen; para gleichzeitige
// Abrufe; keep Sekunden ohne Zeichnen bis zur Freigabe; nearR Umkreis der Kamera, der auch außerhalb des Bildes lädt. Schätzungen.
export const I3S = { url: 'https://www.gis.nrw.de/geobasis/3D_mesh/SceneServer/layers/0', pageN: 64, q: 1, maxNodes: 160, gpuMB: 260, para: 6, keep: 8, nearR: 150, sink: 4 };
// nodes: Nummer -> Knoten; pages: Seite -> 'load' | 'ok' | 'fail'; l1: Kinder der Wurzel (bekannt, sobald alle 108 Seiten da sind)
export const i3s = { nodes: new Map(), pages: new Map(), l1: null, root: null, drawn: [], gpu: 0, err: '', jobs: 0, loaded: 0, mb: 0, qa: 1 };
// Grenzen am Handy (LOW_MEM, Prüfbericht Nutzer 10.11.: 701 MB Grafik, 1157 MB geladen am Handy): Schätzung nach docs/plan-3d-mesh.md 2.7
export const I3S_LOW = { maxNodes: 80, gpuMB: 90, para: 4, texMax: 1024 };
export const i3sPageOf = idx => Math.floor(idx/I3S.pageN);
export const i3sPageUrl = p => I3S.url + '/nodepages/' + p;
export const i3sGeoUrl = res => I3S.url + '/nodes/' + res + '/geometries/0';   // Puffer 0: ungepackt (per gzip übertragen), nicht Draco
export const i3sTexUrl = res => I3S.url + '/nodes/' + res + '/textures/0';
export function i3sReset() { i3s.nodes.clear(); i3s.pages.clear(); i3s.l1 = null; i3s.root = null; i3s.drawn = []; i3s.gpu = 0; i3s.err = ''; i3s.jobs = 0; i3s.loaded = 0; i3s.mb = 0; i3s.qa = 1; }
// Knoten einer Seite übernehmen (I3S nodePages): Mitte der Box (Ost, Nord, Höhe über NHN), Hüllkugel, Schwelle, Kinder, Ressourcen
export function i3sAddPage(p, json) {
  i3s.pages.set(p, 'ok');
  for (const n of json.nodes || []) {
    if (i3s.nodes.has(n.index)) continue;
    const h = n.obb.halfSize, m = n.mesh;
    i3s.nodes.set(n.index, { idx: n.index, c: n.obb.center, r: Math.hypot(h[0], h[1], h[2]), lod: n.lodThreshold || 0, ch: n.children || [],
      res: m && m.geometry ? m.geometry.resource : null, tex: m && m.material ? m.material.resource : null, vc: m && m.geometry ? m.geometry.vertexCount : 0,
      texel: m && m.material ? m.material.texelCountHint || 0 : 0, st: m ? 'idle' : 'none', t: 0, gl: null, fail: 0 });
  }
}
// Soll das Mesh geladen werden? 'on' oder der Grund dagegen: 'off' (Preset nicht Foto 3D), 'map' (Spielkarte), 'dis' (DIS-Übung),
// 'land' (nicht NRW). probe: Adresse mit ?mesh=1 (Diagnose, erzwingt das Mesh). nrw: Gebiet liegt (teils) in NRW, in UTM 32.
export function i3sWanted(gfx, probe, rwOn, verbund, nrw) {
  if (gfx !== 'mesh' && !probe) return 'off';
  if (!rwOn) return 'map';
  if (verbund) return 'dis';
  return nrw ? 'on' : 'land';
}
// Kartenkoordinaten (Mitte des Gebiets = Ursprung, x Ost, z Süd, y = Höhe über dem Startplatz): o = { ec, nc, h }
export const i3sToMap = (c, o) => [c[0] - o.ec, c[2] - o.h, -(c[1] - o.nc)];
// Sechs Ebenen des Sichtkegels aus der Matrix vp (spaltenweise wie WebGL), normiert; Kugeltest
export function i3sPlanes(m) {
  const row = i => [m[i], m[4 + i], m[8 + i], m[12 + i]], r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3), out = [];
  for (const [a, s] of [[r0, 1], [r0, -1], [r1, 1], [r1, -1], [r2, 1], [r2, -1]]) {
    const p = [r3[0] + s*a[0], r3[1] + s*a[1], r3[2] + s*a[2], r3[3] + s*a[3]], l = Math.hypot(p[0], p[1], p[2]) || 1;
    out.push([p[0]/l, p[1]/l, p[2]/l, p[3]/l]);
  }
  return out;
}
export const i3sSeen = (P, c, r) => P.every(p => p[0]*c[0] + p[1]*c[1] + p[2]*c[2] + p[3] > -r);
// Maß für die Detailstufe (maxScreenThresholdSQ): Fläche der Hüllkugel auf dem Bildschirm in Pixel². f = Bildhöhe/(2 tan(vf/2)).
export const i3sMetric = (r, d, f) => { const D = 2*r*f/Math.max(d - r, 1); return Math.PI/4*D*D; };

// Auswahl je Bild. cam [x, y, z] (Karte), f wie oben, P Ebenen, o Ursprung. Liefert { draw: [Knoten], want: [[Knoten, Vorrang]],
// pages: [Seiten] }. Node-Switching: ein Knoten wird gezeichnet oder ganz durch seine Kinder ersetzt; die Kinder erst, wenn alle
// sichtbaren fertig sind (sonst zeichnet der Knoten selbst weiter und die Kinder laden).
export function i3sSelect(cam, f, P, o, q = I3S.q) {
  const draw = [], want = [], pages = new Set();
  const need = idx => { const n = i3s.nodes.get(idx); if (!n) pages.add(i3sPageOf(idx)); return n; };
  const look = n => { const c = i3sToMap(n.c, o), d = Math.hypot(c[0] - cam[0], c[1] - cam[1], c[2] - cam[2]); return { d, vis: i3sSeen(P, c, n.r) || d - n.r < I3S.nearR }; };
  const visit = (n, L) => {
    const m = i3sMetric(n.r, L.d, f), refine = n.ch.length > 0 && (!n.res || n.lod === 0 || m > n.lod*q);
    if (refine) {
      const kids = n.ch.map(need);
      const prio = m + (L.d < I3S.nearR ? 1e12 : 0);
      if (kids.every(Boolean)) {
        const looks = kids.map(look), ready = kids.every((k, i) => !looks[i].vis || !k.res || k.st === 'ready');
        // weiter nach unten: Kinder fertig, Knoten ohne Mesh (obere Stufen), oder Knoten viel zu grob für den Abstand (Faktor 50,
        // Schätzung): dann wird er gar nicht erst geladen (sonst dauert der Weg über etwa 17 Stufen viele Sekunden)
        if (ready || !n.res || (n.st !== 'ready' && m > n.lod*q*50)) {
          kids.forEach((k, i) => { if (looks[i].vis) visit(k, looks[i]); });
          return;
        }
        // von grob nach fein: erst wenn der Knoten selbst da ist, die Kinder laden
        if (n.st === 'ready') kids.forEach((k, i) => { if (looks[i].vis && k.res && k.st !== 'ready') want.push([k, m + (looks[i].d < I3S.nearR ? 1e12 : 0)]); });
      }
      if (n.res) { if (n.st === 'ready') draw.push(n); else want.push([n, prio]); }
      return;
    }
    if (!n.res) return;
    if (n.st === 'ready') draw.push(n); else want.push([n, m + (L.d < I3S.nearR ? 1e12 : 0)]);
  };
  for (const idx of i3s.l1 || []) { const n = need(idx); if (!n) continue; const L = look(n); if (L.vis) visit(n, L); }
  want.sort((a, b) => b[1] - a[1]);
  draw.sort((a, b) => look(a).d - look(b).d);   // nah zuerst: früher Tiefentest
  return { draw, want, pages: [...pages] };
}
// Grafikspeicher eines Knotens (Schätzung): Puffer 20 Byte je Punkt, Textur RGBA mit Mipmaps
export const i3sBytes = n => n.vc*20 + n.texel*4*1.33;
// Speicher nachführen (Prüfbericht 10.11.): Braucht schon das Bild selbst mehr als drei Viertel der Grenzen, wird die Auswahl gröber
// (Faktor qa auf die Schwelle, um 25 % je Bild, höchstens 64); unter 45 % langsam wieder feiner (5 % je Bild). Vorher wuchs der
// Speicher über die Grenze, weil nur Teile außerhalb des Bildes freigegeben werden dürfen, und Teile luden immer wieder neu.
export function i3sAdapt(draw) {
  const mb = draw.reduce((s, n) => s + i3sBytes(n), 0)/1e6, n = draw.length;
  if (mb > 0.75*I3S.gpuMB || n > 0.75*I3S.maxNodes) i3s.qa = Math.min(64, i3s.qa*1.25);
  else if (mb < 0.45*I3S.gpuMB && n < 0.45*I3S.maxNodes) i3s.qa = Math.max(1, i3s.qa/1.05);
  return i3s.qa;
}
// Neue Abrufe nur, solange Zahl und Speicher der geladenen Teile unter den Grenzen liegen
export const i3sRoom = () => { let n = 0; for (const x of i3s.nodes.values()) if (x.st === 'ready' || x.st === 'load') n++; return n < I3S.maxNodes && i3s.gpu < I3S.gpuMB; };
// Freigabe: lange nicht gezeichnete Knoten (feinste zuerst), bis Zahl und Speicher in den Grenzen liegen. Liefert die Knoten,
// deren Grafik render.js löschen muss.
export function i3sEvict(now, keepSet) {
  const ready = [...i3s.nodes.values()].filter(n => n.st === 'ready'), out = [];
  let count = ready.length, mb = ready.reduce((s, n) => s + i3sBytes(n), 0)/1e6;
  const old = ready.filter(n => !keepSet.has(n) && now - n.t > I3S.keep).sort((a, b) => a.t - b.t);
  for (const n of old) {
    if (count <= I3S.maxNodes && mb <= I3S.gpuMB) break;
    out.push(n); n.st = 'idle'; count--; mb -= i3sBytes(n)/1e6;
  }
  i3s.gpu = mb;
  return out;
}
// Geometrie (Puffer 0) prüfen: Kopf vertexCount, featureCount (UInt32), dann Lagen (Float32 x 3) und Texturkoordinaten (Float32 x 2)
export function i3sGeometry(bytes) {
  const b = bytes.byteOffset % 4 ? bytes.slice() : bytes, v = new DataView(b.buffer, b.byteOffset, b.byteLength), vc = v.getUint32(0, true);
  if (b.byteLength < 8 + 20*vc) throw new Error('Mesh-Geometrie zu kurz');
  return { vc, pos: new Float32Array(b.buffer, b.byteOffset + 8, vc*3), uv: new Float32Array(b.buffer, b.byteOffset + 8 + 12*vc, vc*2) };
}

// ---------- Kollision aus dem Mesh (M2, Nutzer Prompt 194/195) ----------
// Das Mesh ist 2,5D (eine Höhe je Lage, vermutet nach Katalog). Darum zwei Formen je feinem Teil, im eigenen Bezug des Teils
// (Ost, Nord, Höhe relativ zur Mitte der Box, unabhängig vom Gebiet): ein Höhenraster für alles Flache (Straße, Dach, Krone; Zelle
// 0,5 m, bei großen Teilen gröber, höchstens 256 je Seite) und die steilen Dreiecke (Wände, Stämme, Pfeiler) in 4-m-Zellen.
// physR: nur Teile mit Hüllkugel bis 120 m (die feinsten Stufen) bekommen Physik. Zahlen: Schätzung.
export const I3S_PHYS = { cell: 0.5, maxCells: 256, steep: 0.5, flat: 0.3, grid: 4, physR: 120, near: 150 };
export function i3sPhysBuild(pos, vc) {
  let e0 = Infinity, e1 = -Infinity, n0 = Infinity, n1 = -Infinity;
  for (let i = 0; i < vc; i++) { const e = pos[i*3], n = pos[i*3 + 1]; if (e < e0) e0 = e; if (e > e1) e1 = e; if (n < n0) n0 = n; if (n > n1) n1 = n; }
  const cs = Math.max(I3S_PHYS.cell, (e1 - e0)/I3S_PHYS.maxCells, (n1 - n0)/I3S_PHYS.maxCells), W = Math.max(1, Math.ceil((e1 - e0)/cs)), H = Math.max(1, Math.ceil((n1 - n0)/cs));
  const h = new Float32Array(W*H).fill(NaN), steep = [], G = I3S_PHYS.grid, cells = new Map();
  for (let t = 0; t + 2 < vc; t += 3) {
    const a = t*3, b = a + 3, c = a + 6, ax = pos[a], ay = pos[a + 1], az = pos[a + 2], bx = pos[b], by = pos[b + 1], bz = pos[b + 2], cx = pos[c], cy = pos[c + 1], cz = pos[c + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx, nl = Math.hypot(nx, ny, nz); if (nl < 1e-9) continue;
    const up = Math.abs(nz)/nl;   // Anteil nach oben (Höhe ist die dritte Achse)
    if (up < I3S_PHYS.steep) {   // steil: als Dreieck behalten, in die Zellen seines Grundrisses
      const k = steep.length/9; steep.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      for (let j = Math.floor((Math.min(ay, by, cy) - n0)/G); j <= Math.floor((Math.max(ay, by, cy) - n0)/G); j++)
        for (let i = Math.floor((Math.min(ax, bx, cx) - e0)/G); i <= Math.floor((Math.max(ax, bx, cx) - e0)/G); i++) { const key = j*4096 + i; if (!cells.has(key)) cells.set(key, []); cells.get(key).push(k); }
    }
    if (up < I3S_PHYS.flat) continue;
    // flach genug: Zellmitten im Dreieck bekommen die höchste Höhe
    const den = (by - cy)*(ax - cx) + (cx - bx)*(ay - cy); if (Math.abs(den) < 1e-12) continue;
    for (let j = Math.max(0, Math.floor((Math.min(ay, by, cy) - n0)/cs)); j <= Math.min(H - 1, Math.floor((Math.max(ay, by, cy) - n0)/cs)); j++)
      for (let i = Math.max(0, Math.floor((Math.min(ax, bx, cx) - e0)/cs)); i <= Math.min(W - 1, Math.floor((Math.max(ax, bx, cx) - e0)/cs)); i++) {
        const px = e0 + (i + 0.5)*cs, py = n0 + (j + 0.5)*cs, u = ((by - cy)*(px - cx) + (cx - bx)*(py - cy))/den, v = ((cy - ay)*(px - cx) + (ax - cx)*(py - cy))/den;
        if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
        const z = az*u + bz*v + cz*(1 - u - v), o = j*W + i; if (!(h[o] >= z)) h[o] = z;
      }
  }
  return { e0, n0, cs, W, H, h, steep: new Float32Array(steep), cells };
}
// Höhe des Mesh an (x, z) in Kartenkoordinaten (o: Ursprung des Gebiets), aus den Physik-Teilen (feinster zuerst); NaN ohne Abdeckung.
// Bilinear zwischen den Zellmitten, leere Zellen zählen nicht.
export function i3sGroundAt(list, x, z, o) {
  for (const n of list) {
    const P = n.phys, le = x + o.ec - n.c[0], ln = -z + o.nc - n.c[1], fx = (le - P.e0)/P.cs - 0.5, fy = (ln - P.n0)/P.cs - 0.5;
    if (fx < -0.5 || fy < -0.5 || fx > P.W - 0.5 || fy > P.H - 0.5) continue;
    const i0 = Math.max(0, Math.min(P.W - 1, Math.floor(fx))), j0 = Math.max(0, Math.min(P.H - 1, Math.floor(fy))), i1 = Math.min(P.W - 1, i0 + 1), j1 = Math.min(P.H - 1, j0 + 1);
    const tx = Math.max(0, Math.min(1, fx - i0)), ty = Math.max(0, Math.min(1, fy - j0));
    let s = 0, w = 0;
    for (const [i, j, k] of [[i0, j0, (1 - tx)*(1 - ty)], [i1, j0, tx*(1 - ty)], [i0, j1, (1 - tx)*ty], [i1, j1, tx*ty]]) { const v = P.h[j*P.W + i]; if (v === v && k > 0) { s += v*k; w += k; } }
    if (w > 0) return s/w + n.c[2] - o.h;
    const v = P.h[Math.round(fy)*P.W + Math.round(fx)]; if (v === v) return v + n.c[2] - o.h;
  }
  return NaN;
}
// Steile Dreiecke im Umkreis R um (x, z), als Feld zu je 9 Werten in Kartenkoordinaten (out wird wiederverwendet)
export function i3sTrisNear(list, x, z, R, o, out = []) {
  out.length = 0;
  for (const n of list) {
    const P = n.phys, G = I3S_PHYS.grid, le = x + o.ec - n.c[0], ln = -z + o.nc - n.c[1], seen = new Set();
    for (let j = Math.floor((ln - R - P.n0)/G); j <= Math.floor((ln + R - P.n0)/G); j++) for (let i = Math.floor((le - R - P.e0)/G); i <= Math.floor((le + R - P.e0)/G); i++) {
      for (const k of P.cells.get(j*4096 + i) || []) {
        if (seen.has(k)) continue; seen.add(k);
        const T = P.steep, b = k*9;
        for (let q = 0; q < 3; q++) out.push(T[b + q*3] + n.c[0] - o.ec, T[b + q*3 + 2] + n.c[2] - o.h, -(T[b + q*3 + 1] + n.c[1] - o.nc));
      }
    }
  }
  return out;
}
// Teile für die Physik um (x, z): fertig, mit Raster, Hüllkugel bis physR, Mitte bis near + r weg; feinste (kleinste) zuerst
export function i3sPhysList(x, z, o) {
  const out = [];
  for (const n of i3s.nodes.values()) {
    if (n.st !== 'ready' || !n.phys || n.r > I3S_PHYS.physR) continue;
    const cx = n.c[0] - o.ec, cz = -(n.c[1] - o.nc);
    if (Math.hypot(cx - x, cz - z) < I3S_PHYS.near + n.r) out.push(n);
  }
  return out.sort((a, b) => a.r - b.r);
}
